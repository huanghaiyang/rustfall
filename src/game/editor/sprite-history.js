// ============================================================================
// 锈雨 · RUSTFALL —— 精灵编辑器「历史编辑记录」
// ----------------------------------------------------------------------------
// 每做一次会产生断点的动作（发布 / 清空 / 导入工程 / 恢复历史 / 手动存快照），
// 就把整份工程快照存一份，之后可以按时间倒序翻回去看「上一次编辑长什么样」。
//
// 存储优先级（从高到低，自动降级）：
//   1. **磁盘**：dev server 的 /__editor/sprite/* 接口 → <root>/editor-data/sprite-editor/
//      history/<id>.json + index.json。清浏览器数据、换浏览器、换机器都不会丢。
//   2. IndexedDB：没有 dev server 时的本机缓存（配额大，适合放 MB 级 dataURL）。
//   3. localStorage：最后兜底，最多 3 条（全站只有 ~5MB）。
//
// 为什么写盘优先：一份工程里 sheet.src 是 dataURL，JSON 约 0.4~1 MB。
// localStorage 放两三份就爆；IndexedDB 换浏览器就没了；只有磁盘是真的「防丢失」。
//
// 为什么把 meta 和 body 分开：
//   列表只要 meta（时间/原因/计数/目标）；body（整份工程）只在真正打开某一条时才读。
//   不然列 24 条就要把 24 × 0.5MB 全读出来。
//
// 这个模块不 import sprite-store（避免循环依赖）：它只认「工程 JSON 形状」，
// 恢复动作由 sprite-store 的 applyProjectData() 负责。
// ============================================================================

import {
  diskProbe,
  diskListHistory,
  diskGetHistory,
  diskAddHistory,
  diskRemoveHistory,
  diskClearHistory,
} from './disk-store.js'

const DB_NAME = 'rustfall-sprite-editor'
const DB_VER = 1
const ST_META = 'meta'
const ST_BODY = 'body'

const LS_META = 'rustfall.se.history.meta.v1'
const LS_BODY = 'rustfall.se.history.body.v1.'

/** 最多留多少条 / 总字节上限（超了从最旧的开始丢） */
export const MAX_ENTRIES = 24
export const MAX_BYTES = 60 * 1024 * 1024

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString()
}

function uid() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** FNV-1a 32bit：只用来判「内容有没有变」，不做安全用途。 */
export function hashText(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** 工程 → 纯 JSON 对象（reactive proxy 不能直接进 IndexedDB 的结构化克隆）。 */
export function plainProject(project) {
  if (!project) return null
  try {
    return JSON.parse(JSON.stringify(project))
  } catch (e) {
    return null
  }
}

export function projectHash(project) {
  const plain = plainProject(project)
  return plain ? hashText(JSON.stringify(plain)) : ''
}

// ---------------------------------------------------------------------------
// 摘要 / 差异（纯函数，UI 和自检都用）
// ---------------------------------------------------------------------------

/** 一份工程的结构摘要：计数量 + 每个角色绑了哪些动作。 */
export function summarizeProject(project) {
  const sheets = (project?.sheets || []).map((s) => ({
    id: s.id,
    name: s.name,
    w: Number(s.w ?? s.width) || 0,
    h: Number(s.h ?? s.height) || 0,
    naturalW: Number(s.naturalW) || 0,
    naturalH: Number(s.naturalH) || 0,
  }))
  const sprites = (project?.sprites || []).map((s) => ({
    id: s.id,
    name: s.name || '',
    kind: s.kind || 'generic',
    refId: s.refId || '',
    family: s.family || '',
    w: Number(s.w) || 0,
    h: Number(s.h) || 0,
    bones: (s.bones || []).length,
    shapes: (s.shapes || []).length,
    actions: (s.actions || []).map((a) => ({
      id: a.id,
      name: a.name || '',
      fps: Number(a.fps) || 0,
      loop: a.loop !== false,
      frames: (a.frames || []).length,
    })),
  }))
  const actionCount = sprites.reduce((n, s) => n + s.actions.length, 0)
  const frameCount = sprites.reduce((n, s) => n + s.actions.reduce((m, a) => m + a.frames, 0), 0)
  // 绑定了游戏实体的那些（历史列表按 refId 过滤用）
  const targets = sprites
    .filter((s) => s.refId)
    .map((s) => ({
      refId: s.refId,
      name: s.name,
      kind: s.kind,
      actions: s.actions.map((a) => `${a.name}(${a.frames})`).join(' '),
    }))
  return {
    projectName: project?.name || '',
    sheets,
    sprites,
    targets,
    counts: {
      sheets: sheets.length,
      sprites: sprites.length,
      effects: (project?.effects || []).length,
      presets: (project?.presets || []).length,
      actions: actionCount,
      frames: frameCount,
      bones: sprites.reduce((n, s) => n + s.bones, 0),
      shapes: sprites.reduce((n, s) => n + s.shapes, 0),
    },
  }
}

/**
 * 两份工程的结构差异（prev → cur）。
 * 只比「看得懂的东西」：图集、角色绑定、动作（名字 / 帧数 / fps）。
 * 骨骼坐标、碰撞多边形这些不逐点比 —— 对「上一次改了什么」没有信息量。
 */
export function diffProjects(prev, cur) {
  const a = summarizeProject(prev)
  const b = summarizeProject(cur)
  const out = []

  // 图集
  const aSheets = new Map(a.sheets.map((s) => [s.id, s]))
  const bSheets = new Map(b.sheets.map((s) => [s.id, s]))
  for (const [id, s] of bSheets) {
    if (!aSheets.has(id)) out.push({ kind: 'add', text: `新增图集「${s.name}」${s.naturalW || s.w}×${s.naturalH || s.h}` })
  }
  for (const [id, s] of aSheets) {
    if (!bSheets.has(id)) out.push({ kind: 'remove', text: `移除图集「${s.name}」` })
  }

  // 角色（按 refId 认，没有 refId 就用 id）
  const keyOf = (s) => s.refId || s.id
  const aSp = new Map(a.sprites.map((s) => [keyOf(s), s]))
  const bSp = new Map(b.sprites.map((s) => [keyOf(s), s]))
  for (const [k, s] of bSp) {
    const old = aSp.get(k)
    const who = s.refId ? `${s.name || s.refId}（${s.refId}）` : s.name || s.id
    if (!old) {
      out.push({ kind: 'add', text: `新增角色「${who}」${s.actions.map((x) => x.name).join('/') || '无动作'}` })
      continue
    }
    const aActs = new Map(old.actions.map((x) => [x.name, x]))
    const bActs = new Map(s.actions.map((x) => [x.name, x]))
    for (const [n, act] of bActs) {
      const o = aActs.get(n)
      if (!o) out.push({ kind: 'add', text: `「${who}」新增动作 ${n}（${act.frames} 帧 · ${act.fps}fps）` })
      else if (o.frames !== act.frames || o.fps !== act.fps || o.loop !== act.loop) {
        out.push({
          kind: 'change',
          text: `「${who}」动作 ${n}：${o.frames} 帧 ${o.fps}fps → ${act.frames} 帧 ${act.fps}fps`,
        })
      }
    }
    for (const [n, act] of aActs) {
      if (!bActs.has(n)) out.push({ kind: 'remove', text: `「${who}」移除动作 ${n}（原 ${act.frames} 帧）` })
    }
    if (old.bones !== s.bones || old.shapes !== s.shapes) {
      out.push({ kind: 'change', text: `「${who}」骨骼 ${old.bones}→${s.bones} · 碰撞 ${old.shapes}→${s.shapes}` })
    }
  }
  for (const [k, s] of aSp) {
    if (!bSp.has(k)) out.push({ kind: 'remove', text: `移除角色「${s.name || s.refId || s.id}」` })
  }

  // 特效 / 预设（只报数量变化）
  for (const key of ['effects', 'presets']) {
    const d = b.counts[key] - a.counts[key]
    if (d) out.push({ kind: d > 0 ? 'add' : 'remove', text: `${key === 'effects' ? '特效' : '预设'} ${a.counts[key]} → ${b.counts[key]}` })
  }

  if (!out.length) out.push({ kind: 'same', text: '结构上没有变化（可能只改了骨骼坐标 / 帧矩形位置）' })
  return out
}

// ---------------------------------------------------------------------------
// IndexedDB 后端
// ---------------------------------------------------------------------------

let _dbPromise = null
let _idbBroken = false

function openDb() {
  if (_idbBroken) return Promise.resolve(null)
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve) => {
    let req
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null)
        return
      }
      req = indexedDB.open(DB_NAME, DB_VER)
    } catch (e) {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ST_META)) db.createObjectStore(ST_META, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(ST_BODY)) db.createObjectStore(ST_BODY, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      _idbBroken = true
      resolve(null)
    }
    req.onblocked = () => resolve(null)
  })
  return _dbPromise
}

function tx(db, stores, mode) {
  return db.transaction(stores, mode)
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(true)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

// ---------------------------------------------------------------------------
// localStorage 兜底后端（没有 IndexedDB 时最多留 3 条）
// ---------------------------------------------------------------------------

const LS_MAX = 3

function lsReadMeta() {
  try {
    const raw = localStorage.getItem(LS_META)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

function lsWriteMeta(list) {
  try {
    localStorage.setItem(LS_META, JSON.stringify(list))
  } catch (e) { /* 配额不够就算了 */ }
}

function lsAdd(meta, body) {
  const list = lsReadMeta()
  list.unshift(meta)
  while (list.length > LS_MAX) {
    const drop = list.pop()
    try {
      localStorage.removeItem(LS_BODY + drop.id)
    } catch (e) { /* ignore */ }
  }
  lsWriteMeta(list)
  try {
    localStorage.setItem(LS_BODY + meta.id, JSON.stringify(body))
  } catch (e) { /* ignore */ }
}

function lsGet(id) {
  try {
    const raw = localStorage.getItem(LS_BODY + id)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function lsRemove(id) {
  lsWriteMeta(lsReadMeta().filter((m) => m.id !== id))
  try {
    localStorage.removeItem(LS_BODY + id)
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 对外 API —— 磁盘优先，逐级降级
// ---------------------------------------------------------------------------

/** 历史是否可用（磁盘接口 / IndexedDB / localStorage 有一个就行）。 */
export function historyAvailable() {
  try {
    return typeof indexedDB !== 'undefined' || typeof localStorage !== 'undefined'
  } catch (e) {
    return false
  }
}

/** 历史条数上限（UI 提示用）。 */
export function historyLimits() {
  return { entries: MAX_ENTRIES, bytes: MAX_BYTES }
}

/**
 * 当前后端：'disk' | 'indexeddb' | 'localstorage'。
 * disk = 已经写到 <root>/editor-data/sprite-editor/（清浏览器数据也不会丢）
 */
export async function historyBackend() {
  const probe = await diskProbe()
  if (probe.ok) return 'disk'
  const db = await openDb()
  return db ? 'indexeddb' : 'localstorage'
}

/** 磁盘落盘目录（UI 展示用；没有则为空串）。 */
export async function historyDiskDir() {
  const probe = await diskProbe()
  return probe.ok ? probe.dir || '' : ''
}

// ---- 本机（IndexedDB / localStorage）读写 ---------------------------------

async function localList() {
  const db = await openDb()
  if (!db) return lsReadMeta()
  try {
    const metas = await reqToPromise(tx(db, [ST_META], 'readonly').objectStore(ST_META).getAll())
    return (metas || []).sort((a, b) => (a.at < b.at ? 1 : -1))
  } catch (e) {
    return lsReadMeta()
  }
}

async function localGet(id) {
  const db = await openDb()
  if (!db) return lsGet(id)
  try {
    const rec = await reqToPromise(tx(db, [ST_BODY], 'readonly').objectStore(ST_BODY).get(id))
    return rec?.project || null
  } catch (e) {
    return lsGet(id)
  }
}

async function localAdd(meta, plain) {
  const db = await openDb()
  if (db) {
    try {
      const t = tx(db, [ST_META, ST_BODY], 'readwrite')
      t.objectStore(ST_META).put(meta)
      t.objectStore(ST_BODY).put({ id: meta.id, project: plain })
      await txDone(t)
      return true
    } catch (e) {
      lsAdd(meta, plain)
      return true
    }
  }
  lsAdd(meta, plain)
  return true
}

async function localRemove(id) {
  const db = await openDb()
  if (!db) {
    lsRemove(id)
    return true
  }
  try {
    const t = tx(db, [ST_META, ST_BODY], 'readwrite')
    t.objectStore(ST_META).delete(id)
    t.objectStore(ST_BODY).delete(id)
    await txDone(t)
    return true
  } catch (e) {
    lsRemove(id)
    return false
  }
}

// ---- 列表 / 读取 ----------------------------------------------------------

/** 列表：磁盘优先；磁盘没有接口再退回本机。只读 meta（不读 payload）。 */
export async function listHistory() {
  const onDisk = await diskListHistory()
  if (onDisk) return onDisk
  return localList()
}

/** 某条快照的整份工程：先磁盘，再本机。 */
export async function getHistory(id) {
  if (!id) return null
  const fromDisk = await diskGetHistory(id)
  if (fromDisk) return fromDisk
  return localGet(id)
}

// ---- 写入 ----------------------------------------------------------------

let _addQueue = Promise.resolve()

/**
 * 存一份快照（磁盘优先）。
 * @param {object} project  当前工程（reactive 也行，会先拍平）
 * @param {{reason?:string, label?:string, force?:boolean}} opts
 *        force=true 时不和「最新一条」去重（手动存快照用）
 * @returns {Promise<object|null>} 新建的 meta；内容与最新一条相同 → null
 */
export function addHistory(project, opts = {}) {
  // 串行化：「发布」里的 fire-and-forget 与外面 await 的调用可能并发；
  // 并发时两边都读到同一个「最新一条」，就会写出重复快照。排成一条队即可。
  const job = _addQueue.then(
    () => _addHistory(project, opts),
    () => _addHistory(project, opts),
  )
  _addQueue = job.catch(() => {})
  return job
}

async function _addHistory(project, opts = {}) {
  const plain = plainProject(project)
  if (!plain) return null
  const hash = hashText(JSON.stringify(plain))
  const metas = await listHistory()
  if (!opts.force && metas[0]?.hash === hash) return null

  const summary = summarizeProject(plain)
  const body = JSON.stringify(plain)
  const meta = {
    id: uid(),
    at: nowIso(),
    reason: String(opts.reason || '手动快照'),
    label: String(opts.label || ''),
    hash,
    bytes: body.length,
    projectName: summary.projectName,
    status: plain.status || 'published',
    counts: summary.counts,
    sheets: summary.sheets,
    targets: summary.targets,
    // 角色名 / refId 直接摊进 meta，列表里不用读 body
    spriteNames: summary.sprites.map((s) => ({ id: s.id, name: s.name, refId: s.refId, kind: s.kind })),
  }

  const probe = await diskProbe()
  if (probe.ok) {
    const res = await diskAddHistory(meta, plain)
    if (res.ok) {
      await pruneHistory()
      return { ...meta, backend: 'disk' }
    }
    // 磁盘写失败（权限 / 磁盘满）→ 退到本机，至少别丢
    console.warn('[sprite-editor] 历史写盘失败，退回本机存储：', res.error)
  }

  await localAdd(meta, plain)
  await pruneHistory()
  return { ...meta, backend: probe.ok ? 'localstorage-fallback' : 'local' }
}

/** 超上限 / 超预算时从最旧的开始丢（磁盘与本机各自清理）。 */
export async function pruneHistory() {
  const metas = await listHistory()
  let total = 0
  const keep = []
  for (const m of metas) {
    const next = total + (m.bytes || 0)
    if (keep.length >= MAX_ENTRIES || next > MAX_BYTES) break
    keep.push(m)
    total = next
  }
  const keepIds = new Set(keep.map((m) => m.id))
  const drop = metas.filter((m) => !keepIds.has(m.id))
  if (!drop.length) return { dropped: 0, kept: keep.length, bytes: total }

  const probe = await diskProbe()
  if (probe.ok) {
    for (const m of drop) await diskRemoveHistory(m.id)
  }
  for (const m of drop) await localRemove(m.id)
  return { dropped: drop.length, kept: keep.length, bytes: total }
}

/** 删一条（两处都删，避免「删了又冒出来」）。 */
export async function removeHistory(id) {
  const probe = await diskProbe()
  if (probe.ok) await diskRemoveHistory(id)
  await localRemove(id)
  return true
}

/** 清空历史（两处都清）。 */
export async function clearHistory() {
  const probe = await diskProbe()
  if (probe.ok) await diskClearHistory()
  try {
    const db = await openDb()
    if (db) {
      const t = tx(db, [ST_META, ST_BODY], 'readwrite')
      t.objectStore(ST_META).clear()
      t.objectStore(ST_BODY).clear()
      await txDone(t)
    } else {
      for (const m of lsReadMeta()) lsRemove(m.id)
      lsWriteMeta([])
    }
  } catch (e) { /* ignore */ }
  return true
}

/**
 * 把本机（IndexedDB / localStorage）里已有的历史补写到磁盘。
 * 用于「先前的记录还在浏览器里、还没落过盘」的迁移：编辑器打开时调一次即可，
 * 磁盘上已有的 id 会跳过（不重复写）。
 */
export async function syncHistoryToDisk() {
  const probe = await diskProbe()
  if (!probe.ok) return { ok: false, migrated: 0, reason: 'no-disk-api' }
  const diskMetas = (await diskListHistory()) || []
  const diskIds = new Set(diskMetas.map((m) => m.id))
  const localMetas = await localList()
  const todo = localMetas.filter((m) => !diskIds.has(m.id))
  let migrated = 0
  for (const m of todo) {
    const project = await localGet(m.id)
    if (!project) continue
    const res = await diskAddHistory(m, project)
    if (res.ok) migrated++
  }
  return { ok: true, migrated, diskTotal: diskMetas.length + migrated }
}
