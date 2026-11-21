// ============================================================================
// 锈雨 · RUSTFALL —— 磁盘 PNG 素材加载层（AI 生成 / 精灵编辑器发布）
// ----------------------------------------------------------------------------
// 目录约定（资源按类别、区域分开）：
//   public/sprites/backdrops/<biome>/far.png   区域远景背景层
//   public/sprites/props/<kind>.png             独立摆件 / 物体透明 PNG
//
// 素材由 scripts/gen-assets.mjs 调火山方舟 seedream 生成，.tools/post_ark.py
// 抠幕布、去水印、归一后落盘。加载失败 / 文件缺失时 resolve(null)，调用方
// 回退到原有 Canvas 程序化美术，不抛错。贴图缓存按 key 复用，纹理共享不 dispose。
// ============================================================================

import * as THREE from 'three'

const CACHE = new Map()

function assetUrl(rel) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  return (base.endsWith('/') ? base : base + '/') + rel.replace(/^\/+/, '')
}

function loadTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.magFilter = THREE.NearestFilter
        tex.minFilter = THREE.NearestFilter
        tex.generateMipmaps = false
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      () => resolve(null),
    )
  })
}

function cached(key, url) {
  let p = CACHE.get(key)
  if (!p) {
    p = loadTexture(url)
    CACHE.set(key, p)
  }
  return p
}

/** 某摆件 kind 的透明 PNG；Promise<THREE.Texture | null>。 */
export function getPropImage(kind) {
  if (!kind) return null
  return cached(`prop:${kind}`, assetUrl(`sprites/props/${kind}.png`))
}

/** 某 biome 的远景背景 far.png；Promise<THREE.Texture | null>。 */
export function getBackdropImage(biome) {
  if (!biome) return null
  return cached(`bg:${biome}`, assetUrl(`sprites/backdrops/${biome}/far.png`))
}

/** 某场景主题（painter）背景 scenes/<painter>.png；Promise<THREE.Texture | null>。 */
export function getSceneBackdropImage(painter) {
  if (!painter) return null
  return cached(`scene:${painter}`, assetUrl(`sprites/backdrops/scenes/${painter}.png`))
}

/** 某房间专属背景 rooms/<roomId>.png（预留；未生成时回退场景 / biome）。 */
export function getRoomBackdropImage(roomId) {
  if (!roomId) return null
  return cached(`room:${roomId}`, assetUrl(`sprites/backdrops/rooms/${roomId}.png`))
}

/**
 * 某房间分层条带背景 rooms/<roomId>_<layer>.png。
 * layer ∈ 'far' | 'mid' | 'near'；未生成时回退单层整图 / 程序化背景。
 */
export function getRoomLayerImage(roomId, layer) {
  if (!roomId || !layer) return null
  return cached(`room-layer:${roomId}:${layer}`, assetUrl(`sprites/backdrops/rooms/${roomId}_${layer}.png`))
}

/** 清缓存（热重载 / 素材重发布后调用）。 */
export function clearSpriteImageCache() {
  CACHE.clear()
}
