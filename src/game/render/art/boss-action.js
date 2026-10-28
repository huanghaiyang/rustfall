// ============================================================================
// 锈雨 · RUSTFALL —— AI BOSS 动作序列帧加载层
// ----------------------------------------------------------------------------
// public/sprites/boss-action/manifest.json 由 scripts/boss-action-post.mjs 生成：
//   { "<bossId>": { file, w, h, frameW, frameH, logicalW, logicalH,
//                   frames: { idle:[0,1], run:[2,3,4,5], attack:[6,7],
//                             cast:[8,9], hurt:[10], dead:[11] } } }
//
// 每只 BOSS 的 12 帧打包成一张横向图集；这里按 UV 偏移克隆出 12 个纹理，
// 共享同一张 GPU 图，只有 offset/repeat 不同。按需加载（BOSS 进场时才请求），
// 避免 51 张图集常驻显存。
// ============================================================================

import * as THREE from 'three'

const META = new Map()
const READY = new Map()
const PENDING = new Map()
let manifestPromise = null

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
          if (info && info.file) META.set(id, info)
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

/**
 * 按需加载某只 BOSS 的动作图集；重复调用复用同一个 Promise。
 * 返回 null 表示这张 BOSS 没有动作表（或加载失败），调用方继续用单帧立绘。
 */
export function loadBossAction(id) {
  const key = String(id || '')
  if (READY.has(key)) return Promise.resolve(READY.get(key))
  if (PENDING.has(key)) return PENDING.get(key)
  const job = loadManifest()
    .then((meta) => {
      const info = meta.get(key)
      if (!info) return null
      // 兼容旧格式（单图集 info.file）与新格式（多图集 info.kinds）
      const kinds = info.kinds
        ? Object.entries(info.kinds).map(([kind, k]) => ({ kind, file: k.file }))
        : [{ kind: 'all', file: info.file }]

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
                const count = Math.max(1, Math.round(tex.image.width / (info.frameW || tex.image.width)))
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
        if (!byKind.size) return null

        const frames = {}
        const NAME_KIND = {
          idle: 'idle',
          walk: 'move',
          run: 'move',
          move: 'move',
          attack: 'attack',
          cast: 'cast',
          hurt: 'react',
          dead: 'react',
        }
        for (const [name, list] of Object.entries(info.frames || {})) {
          if (!Array.isArray(list) || !list.length) continue
          const kind = NAME_KIND[name] || 'all'
          const src = byKind.get(kind) || byKind.get('all') || [...byKind.values()][0]
          if (!src) continue
          frames[name] = list.map((i) => src[Math.min(src.length - 1, i)]).filter(Boolean)
        }
        if (frames.run && !frames.move) frames.move = frames.run
        if (!frames.idle) return null

        const art = {
          w: info.logicalW || info.frameW / 2,
          h: info.logicalH || info.frameH / 2,
          logicalW: info.logicalW,
          logicalH: info.logicalH,
          frameW: info.frameW,
          frameH: info.frameH,
          fps: info.fps || null,
          frames,
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
