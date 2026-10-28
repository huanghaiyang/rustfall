// ============================================================================
// 锈雨 · RUSTFALL —— AI 立绘（PNG）加载层
// ----------------------------------------------------------------------------
// public/sprites/boss/manifest.json 由 scripts/boss-portrait-post.mjs 生成：
//   { "<bossId>": { file, w, h, logicalW, logicalH } }
//
// 约定：
//   · 纹理走 NearestFilter + SRGBColorSpace，PNG 本身已是 alpha 0/255；
//   · 加载失败不抛错，getLargeMonsterArt 会照常退回程序化绘制；
//   · 只在启动时请求一次，BOSS 数量少（≤58），全量常驻内存可接受。
// ============================================================================

import * as THREE from 'three'

const PORTRAITS = new Map()
let pending = null

function assetUrl(rel) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  return (base.endsWith('/') ? base : base + '/') + rel.replace(/^\/+/, '')
}

/** 已加载的 PNG 立绘：{ tex, w, h }（w/h 为游戏内逻辑尺寸）；未加载返回 null。 */
export function getBossPortrait(id) {
  const key = String(id || '')
  return PORTRAITS.get(key) || null
}

/** 预载整个 manifest；返回成功加载的张数。重复调用复用同一个 Promise。 */
export function loadBossPortraits() {
  if (pending) return pending
  pending = fetch(assetUrl('sprites/boss/manifest.json'))
    .then((r) => (r.ok ? r.json() : null))
    .then((manifest) => {
      if (!manifest || typeof manifest !== 'object') return 0
      const loader = new THREE.TextureLoader()
      const jobs = Object.entries(manifest).map(
        ([id, info]) =>
          new Promise((resolve) => {
            loader.load(
              assetUrl(info.file),
              (tex) => {
                tex.magFilter = THREE.NearestFilter
                tex.minFilter = THREE.NearestFilter
                tex.generateMipmaps = false
                tex.colorSpace = THREE.SRGBColorSpace
                tex.wrapS = THREE.ClampToEdgeWrapping
                tex.wrapT = THREE.ClampToEdgeWrapping
                tex.needsUpdate = true
                tex.userData.cleanAlpha = true
                tex.userData.png = true
                PORTRAITS.set(id, {
                  tex,
                  w: info.logicalW || tex.image.width,
                  h: info.logicalH || tex.image.height,
                })
                resolve(true)
              },
              undefined,
              () => resolve(false),
            )
          }),
      )
      return Promise.all(jobs).then((oks) => oks.filter(Boolean).length)
    })
    .catch(() => 0)
  return pending
}

/** 已加载的 id 列表（调试 / 自检用）。 */
export function bossPortraitIds() {
  return [...PORTRAITS.keys()]
}
