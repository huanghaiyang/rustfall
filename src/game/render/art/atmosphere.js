// ============================================================================
// 锈雨 · RUSTFALL —— 大气 / 粒子贴图（程序化 Canvas2D → THREE.CanvasTexture）
//
//   对外契约（docs/CONTENT-API.md §6.5 + 任务书）：
//     getSmokeArt()     128×128  柔和翻卷烟团（多层 alpha），S/T = Clamp
//     getAshArt()         8×8    灰烬颗粒
//     getAcidRainArt()    8×64   酸雨条纹（黄绿白，上淡下亮）；getRainArt 为别名
//     getGlowArt()      128×128  白色径向光晕（可被 material.color 染色）
//     getDustArt()        8×8    柔和灰尘点
//     getEmberArt()      10×10   橙色火星（带短拖尾）
//     getToxicPoolArt() 128×64   毒液表面（横向平铺 S=Repeat / T=Clamp）
//     getVignetteArt()  512×288  暗角（配合 sprite / 后期）
//
//   约定：
//   · 每张贴图只生成一次（按名字缓存）；全部 NearestFilter ×2、无 mipmap、SRGB、needsUpdate。
//   · 颜色只从 palette.js 混出；毒绿只出现在酸雨 / 毒液 / 气泡上。
//   · 需要平铺的贴图（毒液）用「x 方向周期噪声 + 横向绕圈落笔」保证接缝连续。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { hash2, makeRng } from '../rng.js'

/* ============================================================================
 * 1. 颜色
 * ========================================================================== */

const HEX_CACHE = new Map()
const MIX_CACHE = new Map()

function hexRgb(hex) {
  let c = HEX_CACHE.get(hex)
  if (c) return c
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  c = [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
  HEX_CACHE.set(hex, c)
  return c
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function mixRgb(a, b, t) {
  const k = clamp01(t)
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

function mixHex(ha, hb, t) {
  const k = Math.round(clamp01(t) * 1000)
  const key = ha + '|' + hb + '|' + k
  const hit = MIX_CACHE.get(key)
  if (hit) return hit
  const out = mixRgb(hexRgb(ha), hexRgb(hb), k / 1000)
  MIX_CACHE.set(key, out)
  return out
}

/* ============================================================================
 * 2. 噪声
 * ========================================================================== */

function pnoise(gx, gy, px, seed) {
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const x0 = px > 0 ? ((ix % px) + px) % px : ix
  const x1 = px > 0 ? (x0 + 1) % px : ix + 1
  const n00 = hash2(x0, iy, seed)
  const n10 = hash2(x1, iy, seed)
  const n01 = hash2(x0, iy + 1, seed)
  const n11 = hash2(x1, iy + 1, seed)
  const a = n00 + (n10 - n00) * sx
  const b = n01 + (n11 - n01) * sx
  return a + (b - a) * sy
}

/** 普通 FBM（不循环） */
function fbm(x, y, cell, seed, oct = 3) {
  let sum = 0
  let amp = 1
  let norm = 0
  let c = cell
  for (let o = 0; o < oct; o++) {
    sum += amp * pnoise(x / c, y / c, 0, seed + o * 131)
    norm += amp
    amp *= 0.5
    c = c * 0.5
  }
  return sum / norm
}

/** x 方向周期 FBM（周期 = W/cell 个格点 → 横向可平铺） */
function fbmW(x, y, W, cell, seed, oct = 3) {
  let sum = 0
  let amp = 1
  let norm = 0
  let c = cell
  for (let o = 0; o < oct; o++) {
    const px = Math.max(1, Math.round(W / c))
    sum += amp * pnoise(x / c, y / c, px, seed + o * 131)
    norm += amp
    amp *= 0.5
    c = c * 0.5
  }
  return sum / norm
}

/** 4×4 Bayer */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
function bayer(x, y) {
  return (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16
}

/* ============================================================================
 * 3. 像素缓冲
 * ========================================================================== */

class Buf {
  constructor(w, h, data) {
    this.w = w
    this.h = h
    this.data = data
  }

  put(x, y, c, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    if (a <= 0.0035) return
    const i = ((y * this.w + x) << 2)
    const d = this.data
    if (a >= 1) {
      d[i] = c[0]
      d[i + 1] = c[1]
      d[i + 2] = c[2]
      d[i + 3] = 255
      return
    }
    const da = d[i + 3] / 255
    const oa = a + da * (1 - a)
    if (oa <= 0) return
    const k = (da * (1 - a)) / oa
    const sk = a / oa
    d[i] = c[0] * sk + d[i] * k
    d[i + 1] = c[1] * sk + d[i + 1] * k
    d[i + 2] = c[2] * sk + d[i + 2] * k
    d[i + 3] = oa * 255
  }

  /** x 绕圈（横向平铺用） */
  putWrap(x, y, c, a = 1) {
    const xx = (((x | 0) % this.w) + this.w) % this.w
    this.put(xx, y, c, a)
  }

  rect(x, y, rw, rh, c, a = 1) {
    for (let j = 0; j < rh; j++) {
      for (let i = 0; i < rw; i++) this.put(x + i, y + j, c, a)
    }
  }

  /** 整数化实心圆（像素块边缘） */
  disc(cx, cy, rad, c, a = 1) {
    const r = Math.max(0.5, rad)
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const k = 1 - (dy * dy) / (r * r + 1)
      if (k <= 0) continue
      const half = r * Math.sqrt(k)
      const y = Math.round(cy + dy)
      for (let dx = -half; dx <= half; dx++) this.put(Math.round(cx + dx), y, c, a)
    }
  }
}

/* ============================================================================
 * 4. 各贴图的绘制器
 * ========================================================================== */

/** 浓烟团：三层不同尺度的噪声叠成翻卷结构，圆形蒙版收边，alpha 量化出像素感 */
function drawSmoke(b) {
  const w = b.w
  const h = b.h
  const cx = w * 0.5
  const cy = h * 0.5
  const core = mixHex(PAL.dustLight, PAL.white, 0.3)
  const mid = mixHex(PAL.dust, PAL.dustLight, 0.55)
  const edge = mixHex(PAL.ashPale, PAL.dust, 0.4)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / (w * 0.5)
      const dy = (y + 0.5 - cy) / (h * 0.5)
      const d = Math.hypot(dx, dy)
      if (d > 1.02) continue
      const fall = Math.pow(clamp01(1 - d), 0.72)
      // 三层翻卷
      const n1 = fbm(x * 1.35, y * 1.35, 27, 0x51a1, 4)
      const n2 = fbm(x * 2.7 + 37, y * 2.7 - 19, 17, 0x51a2, 3)
      const n3 = fbm(x * 0.72 - 11, y * 0.72 + 33, 35, 0x51a3, 2)
      const v = n1 * 0.55 + n2 * 0.28 + n3 * 0.17
      // 阈值拉开对比：只有噪声高的地方才浓 → 有"团"而不是一层灰纱
      let a = clamp01((v - 0.36) / 0.3) * fall
      a = Math.pow(a, 0.82) * 1.06
      a = clamp01(a)
      if (a < 0.035) continue
      // alpha 量化（收敛成 14 档，避免糊成一坨灰）
      a = Math.round(a * 14) / 14
      // 内部亮、边缘灰
      const c = a > 0.62 ? mixRgb(mid, core, (a - 0.62) / 0.38) : mixRgb(edge, mid, a / 0.62)
      b.put(x, y, c, a)
    }
  }
  // 几处更浓的"团块"高光（让烟有体积）
  for (let i = 0; i < 9; i++) {
    const px = cx + (hash2(i, 1, 0x51b1) - 0.5) * w * 0.68
    const py = cy + (hash2(i, 2, 0x51b2) - 0.5) * h * 0.68
    const rr = 5 + hash2(i, 3, 0x51b3) * 12
    const aa = 0.16 + hash2(i, 4, 0x51b4) * 0.2
    b.disc(px, py, rr, core, aa)
  }
}

/** 灰烬颗粒：8×8 里放 6 个不同明度的 1px 屑 */
function drawAsh(b) {
  const cols = [
    mixHex(PAL.ashPale, PAL.dustLight, 0.5),
    mixHex(PAL.dustLight, PAL.boneDark, 0.4),
    mixHex(PAL.ashPale, PAL.bone, 0.35),
    mixHex(PAL.dust, PAL.ashPale, 0.5),
  ]
  const pts = [
    [1, 2, 0, 0.95],
    [4, 1, 1, 0.7],
    [6, 3, 2, 0.55],
    [2, 5, 1, 0.8],
    [5, 6, 3, 0.5],
    [7, 6, 0, 0.35],
    [3, 0, 2, 0.28],
  ]
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    b.put(p[0], p[1], cols[p[2]], p[3])
    // 一点点暗边，避免糊在白背景里
    if (p[3] > 0.5) b.put(p[0], p[1] + 1, mixHex(PAL.ash, PAL.dust, 0.4), p[3] * 0.28)
  }
}

/** 酸雨条纹：8×64，上淡下亮，底端发白（黄绿基调） */
function drawAcidRain(b) {
  const w = b.w
  const h = b.h
  // 三条雨痕：列位置 / 宽度 / 相位
  const streaks = [
    { x: 1, wid: 1, lo: 0.05, hi: 0.85, tint: 0.15 },
    { x: 4, wid: 2, lo: 0.03, hi: 1.0, tint: 0.0 },
    { x: 6, wid: 1, lo: 0.07, hi: 0.7, tint: 0.3 },
  ]
  const green = hexRgb(PAL.rain)
  const acid = hexRgb(PAL.toxicGlow)
  const white = hexRgb(PAL.white)
  const dark = hexRgb(PAL.toxicDark)

  for (let s = 0; s < streaks.length; s++) {
    const st = streaks[s]
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1)
      // 上淡下亮：前 12% 几乎透明，之后指数上升
      let a = st.lo + (st.hi - st.lo) * Math.pow(t, 1.55)
      // 头部（下方）更亮更白
      if (t > 0.9) a = Math.min(1, a * 1.05)
      // 中段有细微断裂（雨滴间隙）
      if (t < 0.22 && hash2(y, s, 0x7a11) > 0.55) continue
      let c = mixRgb(green, acid, 0.35 + st.tint)
      if (t > 0.86) c = mixRgb(c, white, (t - 0.86) / 0.14 * 0.8)
      // 条纹边缘压一点暗绿
      if (st.wid > 1 && y % 5 === 0) c = mixRgb(c, dark, 0.3)
      const aq = Math.round(a * 12) / 12
      for (let i = 0; i < st.wid; i++) b.put(st.x + i, y, c, aq)
      // 旁边那一列极弱的辉光
      if (s === 1) b.put(st.x - 1, y, c, aq * 0.16), b.put(st.x + st.wid, y, c, aq * 0.12)
    }
  }
  // 顶端一点点水珠残留
  for (let s = 0; s < w; s++) {
    if (hash2(s, 3, 0x7a12) > 0.6) b.put(s, 1, mixRgb(green, white, 0.3), 0.14)
  }
}

/** 白色径向光晕：中心实、外圈平滑收敛（不做 8bit 阶梯 → 加 Bayer 抖动） */
function drawGlow(b) {
  const w = b.w
  const h = b.h
  const cx = w * 0.5
  const cy = h * 0.5
  const white = hexRgb(PAL.white)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / (w * 0.5)
      const dy = (y + 0.5 - cy) / (h * 0.5)
      const d = Math.min(1.4, Math.hypot(dx, dy))
      if (d >= 1) continue
      let a = Math.pow(1 - d, 2.3)
      // 中心核
      if (d < 0.18) a = 1
      // 抖动，压掉同心圆色阶
      a += (bayer(x, y) - 0.5) * 0.035
      a = clamp01(a)
      if (a < 0.012) continue
      b.put(x, y, white, a)
    }
  }
}

/** 柔和灰尘点：8×8，中心 2×2 亮，外圈散开 */
function drawDust(b) {
  const c = mixHex(PAL.dustLight, PAL.bone, 0.35)
  const soft = mixHex(PAL.dust, PAL.dustLight, 0.5)
  b.rect(3, 3, 2, 2, c, 0.95)
  b.put(2, 3, c, 0.55)
  b.put(4, 3, c, 0.55)
  b.put(3, 2, c, 0.55)
  b.put(3, 4, c, 0.5)
  b.put(2, 2, soft, 0.3)
  b.put(4, 2, soft, 0.3)
  b.put(2, 4, soft, 0.28)
  b.put(4, 4, soft, 0.28)
  b.put(1, 3, soft, 0.16)
  b.put(5, 3, soft, 0.14)
  b.put(3, 1, soft, 0.14)
  b.put(3, 5, soft, 0.12)
}

/** 火星：10×10，亮核 + 橙边 + 向上拖尾 */
function drawEmber(b) {
  const hot = hexRgb(PAL.rustHot)
  const warm = hexRgb(PAL.neonWarm)
  const deep = hexRgb(PAL.rust)
  const white = hexRgb(PAL.white)
  const dark = hexRgb(PAL.rustDark)

  // 拖尾（向上）
  for (let k = 0; k < 4; k++) {
    const yy = 4 - k
    const a = 0.42 - k * 0.09
    b.put(5, yy, k < 2 ? warm : deep, a)
    if (k < 2) b.put(6, yy + 1, deep, a * 0.5)
  }
  // 外层暗橙
  b.disc(5, 6, 4.2, deep, 0.8)
  b.disc(5, 6, 3.1, hot, 0.95)
  b.disc(5, 6, 2.0, warm, 1)
  // 亮核
  b.rect(4, 5, 2, 2, white, 0.95)
  b.put(5, 4, white, 0.6)
  // 底部冷一点
  b.put(5, 9, dark, 0.45)
  b.put(4, 9, dark, 0.3)
}

/** 毒液表面：横向周期噪声滚出的浮渣 + 气泡 + 高光（128×64，横向平铺） */
function drawToxicPool(b) {
  const w = b.w
  const h = b.h
  const deep = mixHex(PAL.toxicDark, PAL.void, 0.45)
  const mid = mixHex(PAL.toxicDark, PAL.toxic, 0.55)
  const scum = mixHex(PAL.toxic, PAL.acid, 0.5)
  const hi = hexRgb(PAL.toxicGlow)
  const foam = mixHex(PAL.toxicGlow, PAL.white, 0.4)

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1)
    for (let x = 0; x < w; x++) {
      // 两层流量：慢的大尺度翻滚 + 快的细纹
      const f1 = fbmW(x, y * 2.1, w, 32, 0x9a11, 4)
      const f2 = fbmW(x * 1.7 + 13, y * 4.4 - 7, w, 16, 0x9a12, 3)
      const n = f1 * 0.64 + f2 * 0.36
      // 越靠下越暗（池底）
      let c = mixRgb(mid, deep, clamp01(v * 1.15 - n * 0.35))
      if (n > 0.58) c = mixRgb(c, scum, (n - 0.58) * 1.6)
      if (n > 0.76) c = mixRgb(c, hi, (n - 0.76) * 2.2)
      // 水面亮线（浮渣边缘）
      if (n > 0.68 && n < 0.72) c = mixRgb(c, foam, 0.35)
      // 细密的暗泡
      if (hash2(x, y, 0x9a13) > 0.972) c = mixRgb(c, deep, 0.6)
      b.put(x, y, c, 1)
    }
  }
  // 气泡：亮圈 + 暗心（水平位置取模 → 跨边界也连续）
  const bubbles = 16
  for (let i = 0; i < bubbles; i++) {
    const bx = Math.round(hash2(i, 1, 0x9b11) * w)
    const by = Math.round(4 + hash2(i, 2, 0x9b12) * (h - 10))
    const rr = 1.4 + hash2(i, 3, 0x9b13) * 2.6
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy)
        if (d > rr + 1.1) continue
        if (d <= rr && d > rr - 1) b.putWrap(bx + dx, by + dy, hi, 0.55)
        else if (d <= rr - 1) b.putWrap(bx + dx, by + dy, deep, 0.35)
        else b.putWrap(bx + dx, by + dy, foam, 0.12)
      }
    }
    // 气泡顶部高光
    b.putWrap(bx - 1, by - Math.round(rr), foam, 0.7)
  }
  // 水面镜面反光（横向长条，周期 43 → 平铺安全）
  for (let x = 0; x < w; x++) {
    const k = (x % 43) / 43
    if (k > 0.62) continue
    const a = 0.22 * (1 - k / 0.62)
    b.put(x, 2, foam, a)
    b.put(x, 3, hi, a * 0.5)
  }
}

/** 暗角：椭圆距离的平滑遮蔽（加一点点抖动，避免 8bit 色带） */
function drawVignette(b) {
  const w = b.w
  const h = b.h
  const cx = w * 0.5
  const cy = h * 0.5
  const black = hexRgb(PAL.black)
  const voidC = hexRgb(PAL.void)
  const maxA = 0.92
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / (w * 0.5)
      const dy = (y + 0.5 - cy) / (h * 0.54)
      const d = Math.hypot(dx, dy)
      // 中心留亮，边缘压到接近不透明
      let t = (d - 0.52) / 0.78
      t = clamp01(t)
      let a = Math.pow(t, 1.7) * maxA
      a += (bayer(x, y) - 0.5) * 0.02
      a = clamp01(a)
      if (a < 0.01) continue
      const c = mixRgb(voidC, black, t)
      b.put(x, y, c, a)
    }
  }
  // 四角再补一点点（避免纯黑边被看穿）
  for (let i = 0; i < 4; i++) {
    const px = i % 2 === 0 ? 0 : w - 1
    const py = i < 2 ? 0 : h - 1
    b.put(px, py, black, 0.98)
  }
}

/* ============================================================================
 * 5. 纹理工厂 / 缓存 / 对外 API
 * ========================================================================== */

const REPEAT = THREE.RepeatWrapping
const CLAMP = THREE.ClampToEdgeWrapping

function makeTex(w, h, draw, wrapS, wrapT, name) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    if (typeof ctx.createImageData === 'function') {
      const img = ctx.createImageData(w, h)
      const b = new Buf(w, h, img.data)
      draw(b)
      ctx.putImageData(img, 0, 0)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.name = name
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = wrapS === 'repeat' ? REPEAT : CLAMP
  tex.wrapT = wrapT === 'repeat' ? REPEAT : CLAMP
  tex.needsUpdate = true
  tex.userData.size = [w, h]
  tex.userData.pixelArt = true
  return tex
}

const ART_CACHE = new Map()

function cached(name, factory) {
  let t = ART_CACHE.get(name)
  if (!t) {
    t = factory()
    ART_CACHE.set(name, t)
  }
  return t
}

/** 128×128 柔和翻卷烟团（多层 alpha）。用作粒子 / 烟柱 sprite。 */
export function getSmokeArt() {
  return cached('smoke', () => makeTex(128, 128, drawSmoke, 'clamp', 'clamp', 'atmo:smoke'))
}

/** 8×8 灰烬颗粒 */
export function getAshArt() {
  return cached('ash', () => makeTex(8, 8, drawAsh, 'clamp', 'clamp', 'atmo:ash'))
}

/** 8×64 酸雨条纹（黄绿白，上淡下亮） */
export function getAcidRainArt() {
  return cached('acidRain', () => makeTex(8, 64, drawAcidRain, 'clamp', 'clamp', 'atmo:acidRain'))
}

/** 128×128 白色径向光晕（用 material.color 染色） */
export function getGlowArt() {
  return cached('glow', () => makeTex(128, 128, drawGlow, 'clamp', 'clamp', 'atmo:glow'))
}

/** 8×8 柔和灰尘点 */
export function getDustArt() {
  return cached('dust', () => makeTex(8, 8, drawDust, 'clamp', 'clamp', 'atmo:dust'))
}

/** 10×10 橙色火星 */
export function getEmberArt() {
  return cached('ember', () => makeTex(10, 10, drawEmber, 'clamp', 'clamp', 'atmo:ember'))
}

/** 128×64 毒液表面（横向平铺） */
export function getToxicPoolArt() {
  return cached('toxicPool', () => makeTex(128, 64, drawToxicPool, 'repeat', 'clamp', 'atmo:toxicPool'))
}

/** 512×288 暗角 */
export function getVignetteArt() {
  return cached('vignette', () => makeTex(512, 288, drawVignette, 'clamp', 'clamp', 'atmo:vignette'))
}

/* ---- 兼容别名（CONTENT-API §6.5 里的旧名字） ---------------------------- */

/** @deprecated 用 getAcidRainArt()；保留是为了兼容旧的 rain 系统调用 */
export function getRainArt() {
  return getAcidRainArt()
}

/** 一些系统按名字取：名字表里没有的返回 null（不抛错） */
export function getAtmosphereArt(name) {
  switch (name) {
    case 'smoke':
      return getSmokeArt()
    case 'ash':
      return getAshArt()
    case 'acidRain':
    case 'rain':
      return getAcidRainArt()
    case 'glow':
      return getGlowArt()
    case 'dust':
      return getDustArt()
    case 'ember':
      return getEmberArt()
    case 'toxicPool':
    case 'toxic':
      return getToxicPoolArt()
    case 'vignette':
      return getVignetteArt()
    default:
      return null
  }
}

/** 预热全部大气贴图（开场加载一次，之后零成本） */
export function preloadAtmosphereArt() {
  getSmokeArt()
  getAshArt()
  getAcidRainArt()
  getGlowArt()
  getDustArt()
  getEmberArt()
  getToxicPoolArt()
  getVignetteArt()
  return ART_CACHE.size
}

/** 释放显存 */
export function disposeAtmosphereArt() {
  for (const [name, tex] of ART_CACHE) {
    if (tex && typeof tex.dispose === 'function') tex.dispose()
    ART_CACHE.delete(name)
  }
}

/** 已生成的大气贴图名（调试用） */
export function cachedAtmosphereNames() {
  return [...ART_CACHE.keys()]
}

/* ============================================================================
 * 6. 天气美术（第二轮）
 *
 *   对外契约：
 *     getWeatherArt(id) -> { overlay, particle, density, sound,
 *                            tint, fog, wetness, toxicity }
 *       id ∈ clear | overcast | ashfall | duststorm | acidrain | toxicfog | radstorm
 *     getLightningArt()   128×320  闪电（分叉 + 三层光晕，白/青）
 *     getRainSplashArt()   16×16   雨滴溅起的小水冠
 *     getFogSheetArt()    256×128  可横向平铺的雾片（内部 3 层不同尺度）
 *     getFogSheetLayers() 3 张 256×128 独立雾层（想要真多层滚动时用）
 *
 *   约定：
 *   · overlay 是"全屏叠加层"：640×360、横向可平铺（也方便引擎滚动）、S=Repeat / T=Clamp，
 *     噪声用周期 FBM，软边 + 竖向渐变（贴地浓 / 上方浓 / 中间浓三种），alpha 量化到 14 档。
 *   · particle 是雨/灰/尘/静电的单颗粒贴图：8×32（条纹类）或 16×16（颗粒类）。
 *   · density 0..1 给粒子发射密度；sound 只填 audio.js 里真实存在的音效名（没有就是 null）。
 *   · tint / fog / wetness / toxicity 是给 postfx.setUniforms 的现成建议值（附加字段）。
 * ========================================================================== */

/** 7 种天气（getWeatherArt 认的 id） */
export const WEATHER_IDS = ['clear', 'overcast', 'ashfall', 'duststorm', 'acidrain', 'toxicfog', 'radstorm']

/** 线性插值出一个像素颜色（Buf.put 用） */
function lerpRgb(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

/** 简单直线（方块笔刷），给闪电/水花用 */
function strokeLine(b, x0, y0, x1, y1, c, a, thick) {
  const dx = x1 - x0
  const dy = y1 - y0
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
  const t = Math.max(1, thick | 0)
  const half = (t - 1) * 0.5
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const px = Math.round(x0 + dx * k)
    const py = Math.round(y0 + dy * k)
    if (t <= 1) b.put(px, py, c, a)
    else b.rect(px - Math.round(half), py - Math.round(half), t, t, c, a)
  }
}

/* ---- overlay（雾 / 尘 / 毒幕）----------------------------------------- */

function drawWeatherOverlay(b, spec) {
  const w = b.w
  const h = b.h
  const cell = spec.cell
  const seed = spec.seed
  const cut = spec.cut
  const soft = spec.soft
  const maxA = spec.alpha
  const light = spec.light
  const dark = spec.dark
  const streak = spec.streak || 0
  for (let y = 0; y < h; y += 2) {
    const v = Math.min(1, (y + 1) / (h - 1))
    let grad
    if (spec.grad === 'bottom') grad = Math.pow(v, spec.gradPow || 1.5)
    else if (spec.grad === 'top') grad = Math.pow(1 - v, spec.gradPow || 1.5)
    else grad = 0.32 + 0.68 * Math.sin(Math.PI * v)
    for (let x = 0; x < w; x += 2) {
      const n1 = fbmW(x, y * 1.75, w, cell, seed, 3)
      const n2 = fbmW(x, y * 4.4 + 17, w, cell * 0.5, seed + 71, 2)
      const n = n1 * 0.68 + n2 * 0.32
      let a = clamp01((n - cut) / soft) * grad * maxA
      // 横向拉丝（尘暴/酸雨用）
      if (streak > 0) {
        const s = fbmW(x * 0.35, y * 9.5, w, cell * 2.2, seed + 313, 2)
        a *= 1 - streak * clamp01((s - 0.5) * 2)
      }
      if (a < 0.012) continue
      a = Math.round(a * 14) / 14
      // 2px 块落笔（像素风 + 省 4 倍噪声）
      b.rect(x, y, 2, 2, lerpRgb(dark, light, clamp01((n - cut) / Math.max(0.02, 1 - cut))), a)
    }
  }
}

/* ---- particle（单颗粒）------------------------------------------------- */

/** 8×32 条纹颗粒：上淡下亮、底端亮头（雨 / 灰 / 尘通用） */
function drawStreakParticle(b, o) {
  const w = b.w
  const h = b.h
  const main = o.main
  const head = o.head
  const shadow = o.shadow || main
  const cols = o.cols || [Math.round(w * 0.5)]
  const wid = o.wid || 1
  const aTop = o.aTop != null ? o.aTop : 0.08
  const aBot = o.aBot != null ? o.aBot : 0.95
  const bend = o.bend || 0
  for (let ci = 0; ci < cols.length; ci++) {
    const x0 = cols[ci]
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1)
      let a = aTop + (aBot - aTop) * Math.pow(t, 1.5)
      // 中间断一下（颗粒感）
      if (t > 0.2 && t < 0.75 && hash2(y, ci, o.seed || 0x77) > 0.78) continue
      const x = Math.round(x0 + bend * (t - 0.5))
      const c = t > 0.86 ? lerpRgb(main, head, (t - 0.86) / 0.14) : main
      a = Math.round(clamp01(a) * 12) / 12
      for (let i = 0; i < wid; i++) b.put(x + i, y, c, a)
      // 极弱的侧向拖影
      if (wid > 1) b.put(x - 1, y, shadow, a * 0.2)
    }
  }
}

/** 16×16 颗粒（灰烬 / 毒雾小粒 / 静电） */
function drawFlakeParticle(b, o) {
  const w = b.w
  const h = b.h
  const main = o.main
  const hi = o.hi
  const cx = w * 0.5
  const cy = h * 0.5
  const rng = makeRng(o.seed || 0x2f1)
  const R = o.radius || 4
  // 不规则薄片：像素团 + 边缘缺口
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / R
      const dy = (y + 0.5 - cy) / R
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > 1.05) continue
      const n = hash2(x, y, o.seed || 0x2f1)
      if (n > 0.72 && d > 0.55) continue
      let a = o.alpha != null ? o.alpha : 0.9
      a *= d > 0.82 ? 0.55 : 1
      a = Math.round(a * 12) / 12
      b.put(x, y, d < 0.42 ? hi : main, a)
    }
  }
  // 高光点
  b.put(Math.round(cx - R * 0.3), Math.round(cy - R * 0.3), hi, 0.95)
  if (o.spark) {
    // 静电：向外的小尖
    for (let i = 0; i < 5; i++) {
      const ang = rng.next() * Math.PI * 2
      const len = R + 1 + rng.next() * 3
      const sx = Math.round(cx + Math.cos(ang) * len)
      const sy = Math.round(cy + Math.sin(ang) * len)
      b.put(sx, sy, hi, 0.5 + rng.next() * 0.4)
    }
  }
}

/* ---- 天气配方 ---------------------------------------------------------- */

const WEATHER_DEFS = {
  clear: {
    density: 0.08,
    sound: null,
    overlay: {
      alpha: 0.07,
      cell: 120,
      cut: 0.52,
      soft: 0.42,
      grad: 'mid',
      light: PAL.sand,
      dark: PAL.dust,
      seed: 0x0101,
    },
    particle: { kind: 'streak', w: 8, h: 32, main: PAL.dustLight, head: PAL.sand, aTop: 0.05, aBot: 0.3, cols: [4], seed: 0x0102 },
    tint: [1, 1, 1],
    fog: 0.06,
    wetness: 0,
    toxicity: 0,
  },
  overcast: {
    density: 0.3,
    sound: null,
    overlay: {
      alpha: 0.24,
      cell: 80,
      cut: 0.5,
      soft: 0.42,
      grad: 'top',
      light: PAL.sandDark,
      dark: PAL.ashPale,
      seed: 0x0201,
    },
    particle: { kind: 'streak', w: 8, h: 32, main: PAL.dustLight, head: PAL.bone, aTop: 0.04, aBot: 0.24, cols: [3], seed: 0x0202 },
    tint: [0.93, 0.93, 0.96],
    fog: 0.26,
    wetness: 0.05,
    toxicity: 0,
  },
  ashfall: {
    density: 0.5,
    sound: null,
    overlay: {
      alpha: 0.3,
      cell: 64,
      cut: 0.5,
      soft: 0.4,
      grad: 'bottom',
      light: PAL.dustLight,
      dark: PAL.ash,
      seed: 0x0301,
    },
    particle: { kind: 'flake', w: 16, h: 16, main: PAL.ashPale, hi: PAL.boneDark, radius: 4.2, alpha: 0.85, seed: 0x0302 },
    tint: [1.03, 0.99, 0.92],
    fog: 0.3,
    wetness: 0,
    toxicity: 0.08,
  },
  duststorm: {
    density: 0.9,
    sound: null,
    overlay: {
      alpha: 0.58,
      cell: 48,
      cut: 0.42,
      soft: 0.44,
      grad: 'bottom',
      gradPow: 1.1,
      streak: 0.45,
      light: PAL.ochre,
      dark: PAL.rustDark,
      seed: 0x0401,
    },
    particle: {
      kind: 'streak',
      w: 8,
      h: 32,
      main: PAL.ochre,
      head: PAL.sand,
      aTop: 0.08,
      aBot: 0.7,
      cols: [2, 5],
      wid: 2,
      bend: 3,
      seed: 0x0402,
    },
    tint: [1.2, 1.0, 0.71],
    fog: 0.66,
    wetness: 0,
    toxicity: 0.05,
  },
  acidrain: {
    density: 0.75,
    sound: 'rainStart',
    overlay: {
      alpha: 0.36,
      cell: 56,
      cut: 0.5,
      soft: 0.4,
      grad: 'bottom',
      streak: 0.2,
      light: PAL.toxic,
      dark: PAL.toxicDark,
      seed: 0x0501,
    },
    particle: {
      kind: 'streak',
      w: 8,
      h: 32,
      main: mixHex(PAL.rain, PAL.toxicGlow, 0.35),
      head: PAL.white,
      shadow: PAL.toxicDark,
      aTop: 0.06,
      aBot: 1.0,
      cols: [1, 4, 6],
      wid: 1,
      seed: 0x0502,
    },
    tint: [0.9, 1.08, 0.78],
    fog: 0.34,
    wetness: 0.6,
    toxicity: 0.45,
  },
  toxicfog: {
    density: 0.6,
    sound: null,
    overlay: {
      alpha: 0.56,
      cell: 40,
      cut: 0.4,
      soft: 0.46,
      grad: 'bottom',
      gradPow: 0.9,
      light: PAL.toxicGlow,
      dark: PAL.toxicDark,
      seed: 0x0601,
    },
    particle: { kind: 'flake', w: 16, h: 16, main: PAL.toxic, hi: PAL.toxicGlow, radius: 5, alpha: 0.6, seed: 0x0602 },
    tint: [0.93, 1.16, 0.7],
    fog: 0.62,
    wetness: 0.1,
    toxicity: 0.82,
  },
  radstorm: {
    density: 0.85,
    sound: 'thunder',
    overlay: {
      alpha: 0.44,
      cell: 44,
      cut: 0.45,
      soft: 0.42,
      grad: 'mid',
      streak: 0.3,
      light: PAL.toxic,
      dark: PAL.bloodDark,
      seed: 0x0701,
    },
    particle: {
      kind: 'flake',
      w: 16,
      h: 16,
      main: PAL.toxic,
      hi: PAL.toxicGlow,
      radius: 5.4,
      alpha: 0.8,
      spark: true,
      seed: 0x0702,
    },
    tint: [0.94, 1.12, 0.86],
    fog: 0.36,
    wetness: 0.3,
    toxicity: 0.3,
  },
}

const OVERLAY_W = 640
const OVERLAY_H = 360
const WEATHER_CACHE = new Map()

function buildWeatherArt(id) {
  const def = WEATHER_DEFS[id] || WEATHER_DEFS.clear
  const ov = def.overlay
  const overlay = makeTex(
    OVERLAY_W,
    OVERLAY_H,
    (b) => drawWeatherOverlay(b, ov),
    'repeat',
    'clamp',
    'weather:' + id + ':overlay',
  )

  const p = def.particle
  const particle = makeTex(
    p.w,
    p.h,
    (b) => {
      if (p.kind === 'streak') drawStreakParticle(b, p)
      else drawFlakeParticle(b, p)
    },
    'clamp',
    'clamp',
    'weather:' + id + ':particle',
  )

  return {
    id: id,
    overlay: overlay,
    particle: particle,
    density: def.density,
    sound: def.sound,
    // —— 附加：给 postfx.setUniforms 的现成建议值 ——
    tint: def.tint.slice(),
    fog: def.fog,
    wetness: def.wetness,
    toxicity: def.toxicity,
  }
}

/**
 * 取某种天气的美术包（懒构建 + 缓存）。
 * @param {string} id clear|overcast|ashfall|duststorm|acidrain|toxicfog|radstorm
 * @returns {{id: string, overlay: THREE.CanvasTexture, particle: THREE.CanvasTexture,
 *            density: number, sound: string|null, tint: number[], fog: number,
 *            wetness: number, toxicity: number}}
 */
export function getWeatherArt(id) {
  const key = WEATHER_IDS.indexOf(id) >= 0 ? id : 'clear'
  let art = WEATHER_CACHE.get(key)
  if (!art) {
    art = buildWeatherArt(key)
    WEATHER_CACHE.set(key, art)
  }
  return art
}

/* ---- 闪电 -------------------------------------------------------------- */

/** 128×320 闪电：主干 + 3 条分叉，三层光晕（外晕/青色/白核） */
function drawLightning(b) {
  const w = b.w
  const h = b.h
  const rng = makeRng(0x1eaf77)
  const core = hexRgb(PAL.white)
  const hot = hexRgb(PAL.signal)
  const glowCol = mixHex(PAL.neonCold, PAL.signal, 0.45)

  // 主干折线
  const pts = []
  let x = w * 0.5
  for (let y = -6; y <= h + 6; y += 9) {
    pts.push([x, y])
    x += (rng.next() - 0.5) * 20
    x = Math.max(10, Math.min(w - 10, x))
  }

  const drawPath = (path) => {
    // pass0 外晕 / pass1 青色 / pass2 白核
    for (let pass = 0; pass < 3; pass++) {
      const thick = pass === 0 ? 9 : pass === 1 ? 4 : 2
      const col = pass === 0 ? glowCol : pass === 1 ? hot : core
      const a = pass === 0 ? 0.2 : pass === 1 ? 0.6 : 1
      for (let i = 0; i < path.length - 1; i++) {
        strokeLine(b, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], col, a, thick)
      }
    }
  }

  drawPath(pts)

  // 分叉：从主干的某几点斜向甩出去
  for (let k = 0; k < 3; k++) {
    const idx = 3 + k * 5
    if (idx >= pts.length - 1) break
    const base = pts[idx]
    const branch = [[base[0], base[1]]]
    let bx = base[0]
    let by = base[1]
    const dir = k % 2 === 0 ? 1 : -1
    const segs = 5 + Math.floor(rng.next() * 3)
    for (let s = 0; s < segs; s++) {
      bx += dir * (6 + rng.next() * 12)
      by += 10 + rng.next() * 14
      branch.push([bx, by])
    }
    drawPath(branch)
  }

  // 落点的一小片辉光
  const footX = Math.round(pts[pts.length - 1][0])
  for (let dy = -10; dy <= 12; dy++) {
    for (let dx = -20; dx <= 20; dx++) {
      const d = Math.hypot(dx / 20, dy / 12)
      if (d > 1) continue
      const a = Math.pow(1 - d, 2.2) * 0.3
      if (a > 0.01) b.put(footX + dx, h - 2 + dy, glowCol, a)
    }
  }
}

let lightningTex = null

/** 128×320 闪电贴图（白心青边，AdditiveBlending 用） */
export function getLightningArt() {
  if (!lightningTex) {
    lightningTex = makeTex(128, 320, drawLightning, 'clamp', 'clamp', 'weather:lightning')
  }
  return lightningTex
}

/* ---- 雨滴溅射 ---------------------------------------------------------- */

function drawRainSplash(b) {
  const w = b.w
  const h = b.h
  const water = mixHex(PAL.glass, PAL.white, 0.35)
  const hi = hexRgb(PAL.white)
  const cx = w * 0.5
  const baseY = h - 3
  // 水冠：中间一坨水 + 两侧甩起的水滴
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const px = cx + (t - 0.5) * 12
    const len = 3 + Math.abs(t - 0.5) * -2 + (1 - Math.abs(t - 0.5) * 2) * 5
    for (let k = 0; k < len; k++) {
      b.put(Math.round(px + (t - 0.5) * k * 0.4), Math.round(baseY - k), i === 2 ? hi : water, 0.85 - k * 0.06)
    }
  }
  // 顶部飞散的水滴
  const drops = [
    [-6, -9],
    [-3, -13],
    [1, -15],
    [4, -12],
    [7, -8],
  ]
  for (let i = 0; i < drops.length; i++) {
    b.put(Math.round(cx + drops[i][0]), Math.round(baseY + drops[i][1]), hi, 0.8)
    b.put(Math.round(cx + drops[i][0]), Math.round(baseY + drops[i][1]) + 1, water, 0.45)
  }
  // 落地溅开的两撇
  b.rect(Math.round(cx - 7), baseY, 3, 1, water, 0.5)
  b.rect(Math.round(cx + 5), baseY, 3, 1, water, 0.5)
}

let splashTex = null

/** 16×16 雨滴溅射（白偏青，便于染色） */
export function getRainSplashArt() {
  if (!splashTex) {
    splashTex = makeTex(16, 16, drawRainSplash, 'clamp', 'clamp', 'weather:splash')
  }
  return splashTex
}

/* ---- 雾片（可平铺，多层）------------------------------------------------ */

const FOG_W = 256
const FOG_H = 128

/** 单层雾：周期噪声（x 可平铺）+ 上下软边 */
function drawFogLayer(b, seed, cell, alpha, light, dark) {
  const w = b.w
  const h = b.h
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1)
    const vfall = Math.pow(Math.sin(Math.PI * clamp01(v)), 0.6)
    if (vfall <= 0.012) continue
    for (let x = 0; x < w; x++) {
      const n1 = fbmW(x, y * 1.6, w, cell, seed, 3)
      const n2 = fbmW(x, y * 3.6 + 9, w, cell * 0.55, seed + 191, 2)
      const n = n1 * 0.7 + n2 * 0.3
      let a = clamp01((n - 0.34) / 0.44) * vfall * alpha
      if (a < 0.014) continue
      a = Math.round(a * 14) / 14
      b.put(x, y, lerpRgb(dark, light, clamp01((n - 0.34) / 0.44)), a)
    }
  }
}

const FOG_LAYER_DEFS = [
  // 大团：慢
  { cell: 64, alpha: 0.66, seed: 0x0f01, speed: 0.55 },
  // 中团
  { cell: 36, alpha: 0.54, seed: 0x0f02, speed: 1.0 },
  // 细丝：快
  { cell: 18, alpha: 0.42, seed: 0x0f03, speed: 1.7 },
]

function fogLight() {
  return mixHex(PAL.ashPale, PAL.boneDark, 0.45)
}
function fogDark() {
  return mixHex(PAL.ash, PAL.ashPale, 0.4)
}

const fogLayerTex = []

/** 3 张 256×128 的独立雾层（S=Repeat / T=Clamp），可各自用不同速度滚动 */
export function getFogSheetLayers() {
  if (fogLayerTex.length) return fogLayerTex
  for (let i = 0; i < FOG_LAYER_DEFS.length; i++) {
    const d = FOG_LAYER_DEFS[i]
    fogLayerTex.push(
      makeTex(
        FOG_W,
        FOG_H,
        (b) => drawFogLayer(b, d.seed, d.cell, d.alpha, fogLight(), fogDark()),
        'repeat',
        'clamp',
        'weather:fog' + i,
      ),
    )
  }
  return fogLayerTex
}

let fogSheetTex = null

/** 整张雾片 256×128（内部已叠 3 层不同尺度；只想画一层时用） */
export function getFogSheetArt() {
  if (fogSheetTex) return fogSheetTex
  const light = fogLight()
  const dark = fogDark()
  fogSheetTex = makeTex(
    FOG_W,
    FOG_H,
    (b) => {
      // 直接在一个缓冲里叠三层（不同尺度/相位 → 层次感）
      for (let i = 0; i < FOG_LAYER_DEFS.length; i++) {
        const d = FOG_LAYER_DEFS[i]
        const tmp = { w: b.w, h: b.h, data: new Uint8ClampedArray(b.w * b.h * 4) }
        const tb = new Buf(tmp.w, tmp.h, tmp.data)
        drawFogLayer(tb, d.seed, d.cell, d.alpha, light, dark)
        // 叠回来（y 方向错开一点 → 层与层之间不同步）
        const dy = i === 0 ? 0 : i === 1 ? 6 : -5
        for (let y = 0; y < b.h; y++) {
          const sy = y + dy
          if (sy < 0 || sy >= b.h) continue
          for (let x = 0; x < b.w; x++) {
            const si = (sy * b.w + x) << 2
            const a = tmp.data[si + 3]
            if (a === 0) continue
            b.put(x, y, [tmp.data[si], tmp.data[si + 1], tmp.data[si + 2]], a / 255)
          }
        }
      }
    },
    'repeat',
    'clamp',
    'weather:fogSheet',
  )
  fogSheetTex.userData.layers = FOG_LAYER_DEFS.length
  fogSheetTex.userData.speeds = FOG_LAYER_DEFS.map((d) => d.speed)
  return fogSheetTex
}

/* ---- 缓存管理 / 预热 ---------------------------------------------------- */

/** 预热全部天气 + 闪电 / 水花 / 雾片（开场加载一次，之后零成本） */
export function preloadWeatherArt() {
  for (let i = 0; i < WEATHER_IDS.length; i++) getWeatherArt(WEATHER_IDS[i])
  getLightningArt()
  getRainSplashArt()
  getFogSheetArt()
  getFogSheetLayers()
  return WEATHER_CACHE.size
}

/** 释放天气贴图（不传 id = 全部） */
export function disposeWeatherArt(id) {
  if (id) {
    const art = WEATHER_CACHE.get(id)
    if (art) {
      if (art.overlay && art.overlay.dispose) art.overlay.dispose()
      if (art.particle && art.particle.dispose) art.particle.dispose()
      WEATHER_CACHE.delete(id)
    }
    return
  }
  for (const key of [...WEATHER_CACHE.keys()]) disposeWeatherArt(key)
  if (lightningTex && lightningTex.dispose) lightningTex.dispose()
  lightningTex = null
  if (splashTex && splashTex.dispose) splashTex.dispose()
  splashTex = null
  if (fogSheetTex && fogSheetTex.dispose) fogSheetTex.dispose()
  fogSheetTex = null
  for (let i = 0; i < fogLayerTex.length; i++) {
    const t = fogLayerTex[i]
    if (t && t.dispose) t.dispose()
  }
  fogLayerTex.length = 0
}

/** 已生成的天气 id（调试面板用） */
export function cachedWeatherIds() {
  return [...WEATHER_CACHE.keys()]
}
