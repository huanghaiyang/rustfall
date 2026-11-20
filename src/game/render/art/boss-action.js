// ============================================================================
// 锈雨 · RUSTFALL —— AI BOSS 动作序列帧加载层
// ----------------------------------------------------------------------------
// public/sprites/boss-action/manifest.json 由 scripts/boss-action-post.mjs /
// scripts/boss-walk-post.mjs / scripts/boss-jump-post.mjs 生成。每个 BOSS 可以有多张图集（kinds），帧引用写法：
//
//   { "<bossId>": {
//       kinds: { base: { file, frames: 12 }, walk: { file, frames: 10 } },
//       frameW, frameH, logicalW, logicalH,
//       fps:    { idle: 6, walk: 11, run: 11, attack: 12, cast: 10, hurt: 8, dead: 5 },
//       frames: { idle: ["base:0","base:1"],
//                 walk: ["walk:0", … , "walk:9"],
//                 run:  ["walk:0", … ] } } }
//
// 帧引用两种写法：
//   · `"<kind>:<index>"` —— 显式指定图集（多图集时用这个，最不容易猜错）
//   · `<index>`（数字）  —— 按动作名猜图集（旧格式，向后兼容）
//
// 每张图集只上传一次 GPU：按 UV 偏移 clone 出 N 个纹理，共享同一张图。
// 按需加载（BOSS 进场时才请求），避免 51 张图集常驻显存。
//
// 覆盖层：精灵编辑器发布的 sprite（localStorage）优先级高于磁盘图集 ——
// 见 sprite-editor-bridge.js。发布事件会清空缓存并 bump 版本号，
// 场上的 BOSS 靠 bossActionVersion() 变化就地换帧，不用重进房间。
// ============================================================================

import * as THREE from 'three'
import { editorFramesFor, editorFpsFor, editorSpriteSize, invalidateEditorSprites } from './sprite-editor-bridge.js'

const META = new Map()
const READY = new Map()
const PENDING = new Map()
let manifestPromise = null
let _version = 0

/** 动作名 → 图集名候选链（先精确，再兜底）。 */
const NAME_KIND = {
  idle: ['idle', 'all'],
  walk: ['walk', 'move', 'all'],
  move: ['walk', 'move', 'all'],
  run: ['walk', 'move', 'all'],
  dash: ['dash', 'walk', 'all'],
  jump: ['jump', 'all'],
  land: ['land', 'jump', 'all'],
  attack: ['attack', 'all'],
  cast: ['cast', 'attack', 'all'],
  hurt: ['react', 'hurt', 'all'],
  dead: ['react', 'dead', 'all'],
}

function assetUrl(rel) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  return (base.endsWith('/') ? base : base + '/') + rel.replace(/^\/+/, '')
}

function loadManifest() {
  if (manifestPromise) return manifestPromise
  manifestPromise = fetch(assetUrl('sprites/boss-action/manifest.json'))
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && typeof json === 'object') {
        for (const [id, info] of Object.entries(json)) {
          if (info && (info.file || info.kinds)) META.set(id, info)
        }
      }
      return META
    })
    .catch(() => META)
  return manifestPromise
}

function cloneFrame(base, index, count) {
  const t = base.clone()
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.repeat.set(1 / count, 1)
  t.offset.set(index / count, 0)
  t.needsUpdate = true
  t.userData.cleanAlpha = true
  t.userData.png = true
  return t
}

/** 已加载的动作帧：{ w, h, logicalW, logicalH, frames }；未加载返回 null。 */
export function getBossAction(id) {
  return READY.get(String(id || '')) || null
}

/** 是否已在加载 / 已就绪（测试房 UI 用）。 */
export function bossActionState(id) {
  const key = String(id || '')
  if (READY.has(key)) return 'ready'
  if (PENDING.has(key)) return 'loading'
  return 'idle'
}

/** 覆盖层版本号：精灵编辑器每发布一次 +1。场上 BOSS 靠它发现要换帧。 */
export function bossActionVersion() {
  return _version
}

/** 清空缓存（发布 / 热重载）。 */
export function clearBossActionCache() {
  READY.clear()
  PENDING.clear()
  _version++
}

if (typeof window !== 'undefined') {
  window.addEventListener('rustfall:sprite-editor-published', () => {
    invalidateEditorSprites()
    clearBossActionCache()
  })
}

/**
 * 按需加载某只 BOSS 的动作图集；重复调用复用同一个 Promise。
 * 返回 null 表示这张 BOSS 没有动作表（或加载失败），调用方继续用单帧立绘。
 */
export function loadBossAction(id) {
  const key = String(id || '')
  if (READY.has(key)) return Promise.resolve(READY.get(key))
  if (PENDING.has(key)) return PENDING.get(key)

  const job = Promise.all([loadManifest(), editorFramesFor(key).catch(() => null)])
    .then(([meta, editorFrames]) => {
      const info = meta.get(key)

      // ---- 只有编辑器数据、没有磁盘图集：也能出动作（尺寸取编辑器里的 sprite） ----
      if (!info) {
        if (!editorFrames) return null
        const size = editorSpriteSize(key)
        const firstFrames = Object.values(editorFrames)[0] || []
        const art = {
          w: size?.w || 136,
          h: size?.h || 168,
          logicalW: size?.w || 136,
          logicalH: size?.h || 168,
          frameW: 0,
          frameH: 0,
          fps: editorFpsFor(key),
          frames: { ...editorFrames },
          fromEditor: true,
        }
        if (!art.frames.idle && firstFrames.length) art.frames.idle = firstFrames
        READY.set(key, art)
        return art
      }

      // 兼容旧格式（单图集 info.file）与新格式（多图集 info.kinds）
      // 每种图集可以有自己的格宽高（例如 dash 格 512×336，走路格 272×336）：
      // 冲刺姿势前倾 + 拖箱，按走路的格子放会小一圈，所以单独给更宽的格子，
      // 由 cellFor 让 BOSS 的 quad 在该动作下临时拉宽，像素比例保持不变。
      const kinds = info.kinds
        ? Object.entries(info.kinds)
            .filter(([, k]) => k && k.file)
            .map(([kind, k]) => ({ kind, file: k.file, frameW: k.frameW, frameH: k.frameH }))
        : [{ kind: 'all', file: info.file }]

      const cellFor = {}
      const loads = kinds.map(
        (k) =>
          new Promise((resolve) => {
            new THREE.TextureLoader().load(
              assetUrl(k.file),
              (tex) => {
                tex.magFilter = THREE.NearestFilter
                tex.minFilter = THREE.NearestFilter
                tex.generateMipmaps = false
                tex.colorSpace = THREE.SRGBColorSpace
                tex.wrapS = THREE.ClampToEdgeWrapping
                tex.wrapT = THREE.ClampToEdgeWrapping
                tex.needsUpdate = true
                const cw = k.frameW || info.frameW || tex.image.width
                const ch = k.frameH || info.frameH || tex.image.height
                cellFor[k.kind] = { w: cw, h: ch }
                const count = Math.max(1, Math.round(tex.image.width / cw))
                const list = []
                for (let i = 0; i < count; i++) list.push(cloneFrame(tex, i, count))
                resolve({ kind: k.kind, frames: list })
              },
              undefined,
              () => resolve(null),
            )
          }),
      )

      return Promise.all(loads).then((loaded) => {
        const byKind = new Map()
        for (const k of loaded) if (k) byKind.set(k.kind, k.frames)
        if (!byKind.size && !editorFrames) return null

        // 数字引用 → 按动作名猜图集；"kind:index" → 显式图集
        const pickKind = (name) => {
          for (const k of NAME_KIND[name] || []) if (byKind.has(k)) return byKind.get(k)
          if (byKind.has('all')) return byKind.get('all')
          return [...byKind.values()][0] || []
        }
        const frames = {}
        for (const [name, list] of Object.entries(info.frames || {})) {
          if (!Array.isArray(list) || !list.length) continue
          const out = []
          for (const ref of list) {
            let src = null
            let idx = NaN
            if (typeof ref === 'number') {
              idx = ref
              src = pickKind(name)
            } else if (typeof ref === 'string' && ref.includes(':')) {
              const [kindName, n] = ref.split(':')
              idx = Number(n)
              src = byKind.get(kindName) || null
            }
            if (!src || !src.length || !Number.isFinite(idx)) continue
            const t = src[Math.max(0, Math.min(src.length - 1, idx))]
            if (t) out.push(t)
          }
          if (out.length) frames[name] = out
        }
        if (frames.run && !frames.move) frames.move = frames.run

        // ---- 精灵编辑器覆盖：同名动作整组替换（编辑器里编排的就是最终顺序） ----
        if (editorFrames) {
          for (const [name, list] of Object.entries(editorFrames)) {
            if (list && list.length) frames[name] = list
          }
          if (!frames.move && frames.run) frames.move = frames.run
        }
        if (!frames.idle) return null

        // 每个动作对应的格尺寸 / quad 尺寸：默认 = base 格，dash 之类更宽的格会覆盖
        const baseCell = { w: info.frameW || 272, h: info.frameH || 336 }
        const actionCell = {}
        for (const [name, list] of Object.entries(frames)) {
          // 从 frames 的引用里推出该动作用的是哪个 kind
          const refs = (info.frames && info.frames[name]) || []
          let kindName = null
          if (refs.length && typeof refs[0] === 'string' && refs[0].includes(':')) kindName = refs[0].split(':')[0]
          const cell = (kindName && cellFor[kindName]) || baseCell
          if (cell.w !== baseCell.w || cell.h !== baseCell.h) actionCell[name] = cell
        }
        if (editorFrames) {
          // 编辑器覆盖的动作按 base 格走（编辑器里只有一张图集）
          for (const name of Object.keys(editorFrames)) delete actionCell[name]
        }
        const art = {
          w: info.logicalW || info.frameW / 2,
          h: info.logicalH || info.frameH / 2,
          logicalW: info.logicalW,
          logicalH: info.logicalH,
          frameW: info.frameW,
          frameH: info.frameH,
          baseCell,
          actionCell,
          fps: Object.assign({}, info.fps || {}, editorFpsFor(key) || {}),
          frames,
          fromEditor: !!editorFrames,
        }
        READY.set(key, art)
        return art
      })
    })
    .catch(() => null)
    .then((art) => {
      PENDING.delete(key)
      return art
    })
  PENDING.set(key, job)
  return job
}

/** 预载指定 id 列表（测试房 / 图鉴可选用）；返回成功数。 */
export function preloadBossActions(ids = []) {
  return Promise.all(ids.map((id) => loadBossAction(id))).then((list) => list.filter(Boolean).length)
}

/** 已就绪的 id 列表（调试 / 自检用）。 */
export function bossActionIds() {
  return [...READY.keys()]
}
