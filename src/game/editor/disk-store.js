// ============================================================================
// 锈雨 · RUSTFALL —— 编辑器「落盘」客户端
// ----------------------------------------------------------------------------
// dev server（scripts/editor-fs-plugin.mjs）提供了 /__editor/sprite/* 文件接口，
// 这里是最薄的 fetch 封装。要点：
//   · 探测一次就缓存（生产构建没有这个中间件 → 404 → 走浏览器存储兜底）
//   · 204 = 磁盘上还没有工程（不是错误）
//   · 所有写操作都 try/catch 软失败：磁盘写不进去不能把编辑器搞崩
// ============================================================================

const API = '/__editor/sprite'

let _probePromise = null

/** 探测落盘接口是否可用（缓存）。 */
export function diskProbe() {
  if (_probePromise) return _probePromise
  _probePromise = fetch(`${API}/ping`, { cache: 'no-store' })
    .then(async (r) => {
      if (!r.ok) return { ok: false }
      const j = await r.json().catch(() => ({}))
      return { ok: true, dir: j.dir || '', fileApi: j.fileApi || 'disk' }
    })
    .catch(() => ({ ok: false }))
  return _probePromise
}

/** 同步版本：是否已经探测过（UI 用，避免闪烁）。 */
export function diskProbed() {
  return !!_probePromise
}

async function jfetch(url, opts) {
  const r = await fetch(url, opts)
  if (r.status === 204) return null
  const text = await r.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (e) {
    data = null
  }
  if (!r.ok) {
    const msg = data?.error || `HTTP ${r.status}`
    throw new Error(msg)
  }
  return data
}

/** 当前工程（磁盘上没有 → null）。 */
export async function diskGetProject() {
  const { ok } = await diskProbe()
  if (!ok) return null
  try {
    return await jfetch(`${API}/project`)
  } catch (e) {
    return null
  }
}

/** 覆盖写当前工程；返回 { ok, bytes } | { ok:false, error }。 */
export async function diskPutProject(project) {
  const { ok } = await diskProbe()
  if (!ok) return { ok: false, error: 'no-disk-api' }
  try {
    const res = await jfetch(`${API}/project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(project),
    })
    return { ok: true, bytes: res?.bytes || 0, at: res?.at || '' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** 历史 meta 列表（时间倒序）。 */
export async function diskListHistory() {
  const { ok } = await diskProbe()
  if (!ok) return null
  try {
    const list = await jfetch(`${API}/history`)
    return Array.isArray(list) ? list : []
  } catch (e) {
    return null
  }
}

/** 读一条快照的整份工程。 */
export async function diskGetHistory(id) {
  try {
    const rec = await jfetch(`${API}/history/${encodeURIComponent(id)}`)
    return rec?.project || null
  } catch (e) {
    return null
  }
}

/** 写一条快照。 */
export async function diskAddHistory(meta, project) {
  const { ok } = await diskProbe()
  if (!ok) return { ok: false, error: 'no-disk-api' }
  try {
    const res = await jfetch(`${API}/history`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meta, project }),
    })
    return { ok: true, total: res?.total || 0 }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

export async function diskRemoveHistory(id) {
  try {
    await jfetch(`${API}/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return true
  } catch (e) {
    return false
  }
}

export async function diskClearHistory() {
  try {
    await jfetch(`${API}/history`, { method: 'DELETE' })
    return true
  } catch (e) {
    return false
  }
}

// ---------------------------------------------------------------------------
// 通用 JSON 快照（房间编辑器等）
// ---------------------------------------------------------------------------

const BLOB_API = '/__editor/blob'

/** 读一个名字命名的快照（没有 → null）。 */
export async function diskBlobGet(name) {
  const { ok } = await diskProbe()
  if (!ok) return null
  try {
    return await jfetch(`${BLOB_API}/${encodeURIComponent(name)}`)
  } catch (e) {
    return null
  }
}

/** 写一个快照。 */
export async function diskBlobPut(name, value) {
  const { ok } = await diskProbe()
  if (!ok) return { ok: false, error: 'no-disk-api' }
  try {
    const res = await jfetch(`${BLOB_API}/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    })
    return { ok: true, bytes: res?.bytes || 0, at: res?.at || '' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** 磁盘上已有的快照名列表。 */
export async function diskBlobList() {
  const { ok } = await diskProbe()
  if (!ok) return []
  try {
    const res = await jfetch(BLOB_API)
    return Array.isArray(res?.names) ? res.names : []
  } catch (e) {
    return []
  }
}

export async function diskBlobDelete(name) {
  try {
    await jfetch(`${BLOB_API}/${encodeURIComponent(name)}`, { method: 'DELETE' })
    return true
  } catch (e) {
    return false
  }
}
