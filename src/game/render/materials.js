import * as THREE from 'three'

/**
 * 像素精灵材质统一入口。
 *
 * 问题背景：程序化贴图在描边/外发光时会留下 alpha 介于 0..1 的像素，
 * 放大后在角色四周形成一圈「透明脏边」。
 * 这里做两件事：
 *   1) 贴图 alpha 二值化（Threshold 128），只留完全透明 / 完全不透明；
 *   2) 材质统一 alphaTest，保证 WebGL 采样时不会再混出半透明边。
 */
const HARDENED = new WeakSet()

export function hardenAlpha(tex, threshold = 128) {
  if (!tex || HARDENED.has(tex)) return tex
  const img = tex.image
  HARDENED.add(tex)
  if (!img || typeof document === 'undefined') return tex
  try {
    const w = img.width || img.videoWidth
    const h = img.height || img.videoHeight
    if (!w || !h) return tex
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return tex
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, w, h)
    const px = data.data
    for (let i = 3; i < px.length; i += 4) {
      px[i] = px[i] >= threshold ? 255 : 0
    }
    ctx.putImageData(data, 0, 0)
    tex.image = c
    tex.needsUpdate = true
  } catch (e) {
    /* 跨域/特殊 canvas 无法读取时保持原样，材质 alphaTest 仍能兜住 */
  }
  return tex
}

/** 角色 / 道具 / 战利品贴图材质：硬边 + alphaTest + 无深度写入 */
export function spriteMaterial(tex, opts = {}) {
  if (tex) hardenAlpha(tex, opts.alphaThreshold ?? 128)
  return new THREE.MeshBasicMaterial({
    map: tex || null,
    color: opts.color ?? 0xffffff,
    transparent: true,
    alphaTest: opts.alphaTest ?? 0.5,
    depthWrite: false,
    toneMapped: false,
    side: opts.side ?? THREE.FrontSide,
    opacity: opts.opacity ?? 1,
  })
}

/** 给已经建好的 mesh 补上硬边设置（遗留代码用） */
export function fixSpriteMesh(mesh) {
  if (!mesh || !mesh.material) return mesh
  const m = mesh.material
  if (m.map) hardenAlpha(m.map)
  m.transparent = true
  m.alphaTest = 0.5
  m.depthWrite = false
  m.needsUpdate = true
  return mesh
}

/** 保留柔和边缘的材质（烟/雾/光晕用），不做 alpha 二值化 */
export function softMaterial(tex, opts = {}) {
  return new THREE.MeshBasicMaterial({
    map: tex || null,
    color: opts.color ?? 0xffffff,
    transparent: true,
    opacity: opts.opacity ?? 1,
    blending: opts.blending ?? THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: opts.side ?? THREE.FrontSide,
  })
}
