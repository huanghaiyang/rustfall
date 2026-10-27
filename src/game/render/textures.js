// ============================================================================
// 雨循环 · RAIN CYCLE —— 程序化像素纹理工厂（Canvas2D → THREE.CanvasTexture）
//
// 设计约束 / 引擎约定：
//  · 不使用任何外部图片、字体或网络资源；每个像素都由确定性 PRNG（mulberry32）
//    现场绘制。相同调用永远得到逐像素一致的结果。
//  · 全部贴图统一：magFilter/minFilter = NearestFilter，generateMipmaps = false，
//    colorSpace = SRGBColorSpace，绘制完成后 needsUpdate = true。
//  · 环绕方式：
//      图块（fill/top）、水面、噪点        → RepeatWrapping（双轴）
//      背景三层                           → S 轴 Repeat / T 轴 Clamp（仅横向无缝）
//      平台 slab                          → S 轴 Repeat / T 轴 Clamp
//      爬杆 pole                          → S 轴 Clamp / T 轴 Repeat（仅纵向无缝）
//      其余（精灵、门、天空、光晕、雨丝…）→ ClampToEdgeWrapping
//  · 锚点约定（精灵画在“脚底贴底边”的坐标系里）：
//      slugcat        —— 底边中心锚点：脚踩最后一行 y = h-1，身体水平中心 x ≈ 22，
//                        朝右；兜底透明边距 ≈4px。crouch 高度 28，swim 高度 32。
//      lizard body    —— 96×32，沿脊索左右无缝平铺（第 95 列接回第 0 列）。
//      lizard head    —— 44×30，朝右，嘴在右侧，眼睛靠右上；headOpen 为张嘴帧。
//      fruit/eye/dust —— 画布中心。
//      background     —— 底边贴地、上方透明天空；横向可平铺（S 轴 repeat）。
//      sky/glow/vignette —— 直接拉伸铺满屏幕。
//      shelter/door   —— 底部贴地，开口中心在水平中线。
// ============================================================================

import * as THREE from 'three'
import { PAL } from './palette.js'

const TAU = Math.PI * 2

/* ============================================================================
 * 1. 确定性随机与噪声
 * ========================================================================== */

/** 经典 mulberry32：返回 [0,1) 的确定性伪随机序列。 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 二维整数哈希 → [0,1)，用于白噪声 / 斑点 / 确定性细节。 */
function hash2d(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
  h ^= Math.imul(seed | 0, 0x9e3779b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** 周期性 value noise：格点坐标以 period 循环，保证纹理无缝。 */
function periodicValueNoise(x, y, period, seed) {
  const p = Math.max(1, period | 0)
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const x0 = ((ix % p) + p) % p
  const y0 = ((iy % p) + p) % p
  const x1 = (x0 + 1) % p
  const y1 = (y0 + 1) % p
  const n00 = hash2d(x0, y0, seed)
  const n10 = hash2d(x1, y0, seed)
  const n01 = hash2d(x0, y1, seed)
  const n11 = hash2d(x1, y1, seed)
  const a = n00 + (n10 - n00) * sx
  const b = n01 + (n11 - n01) * sx
  return a + (b - a) * sy
}

/** 分形噪声（T 轴网格周期 = size，因此 size 像素整数倍处完美接缝）。 */
function tileFbm(x, y, size, seed, octaves = 3) {
  let v = 0
  let amp = 1
  let norm = 0
  let cells = 2
  for (let o = 0; o < octaves; o++) {
    v += amp * periodicValueNoise((x / size) * cells, (y / size) * cells, cells, seed + o * 131)
    norm += amp
    amp *= 0.5
    cells *= 2
  }
  return v / norm
}

/** 非平铺的分形噪声（用于无需接缝的精灵 / 门框）。 */
function fbm(x, y, seed, octaves = 3) {
  let v = 0
  let amp = 1
  let norm = 0
  let freq = 1
  for (let o = 0; o < octaves; o++) {
    v += amp * periodicValueNoise(x * freq, y * freq, 4096, seed + o * 71)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return v / norm
}

/* ============================================================================
 * 2. 颜色工具（只基于 PAL 派生，不引入新色相）
 * ========================================================================== */

const HEX_CACHE = new Map()
const MIX_CACHE = new Map()

function parseHex(hex) {
  let c = HEX_CACHE.get(hex)
  if (c) return c
  let h = hex[0] === '#' ? hex.slice(1) : hex
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  c = [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
  HEX_CACHE.set(hex, c)
  return c
}

/** 返回带透明度的 CSS 颜色串。 */
function rgba(hex, a) {
  const c = parseHex(hex)
  const alpha = Math.max(0, Math.min(1, a))
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')'
}

/** 两色线性混合，返回 #rrggbb（只混 PAL 中的颜色 → 不产生新色相）。 */
function mix(hexA, hexB, t) {
  const k = Math.round(Math.max(0, Math.min(1, t)) * 1000)
  const key = hexA + '|' + hexB + '|' + k
  const hit = MIX_CACHE.get(key)
  if (hit) return hit
  const a = parseHex(hexA)
  const b = parseHex(hexB)
  const r = Math.round(a[0] + (b[0] - a[0]) * (k / 1000))
  const g = Math.round(a[1] + (b[1] - a[1]) * (k / 1000))
  const bl = Math.round(a[2] + (b[2] - a[2]) * (k / 1000))
  const out = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)
  MIX_CACHE.set(key, out)
  return out
}

function darken(hex, t) {
  return mix(hex, PAL.void0, t)
}

function lighten(hex, t) {
  return mix(hex, PAL.white, t)
}

/* ============================================================================
 * 3. 像素绘制原语（全部落在整数像素上，硬边缘、无抗锯齿）
 * ========================================================================== */

function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function pix(ctx, x, y, color) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
}

/**
 * 整数化的实心椭圆：每一行是一次 fillRect → 天然像素化。
 * 半径加 0.5 再取整，让 1px 边缘不会消失。
 */
function fillEllipse(ctx, cx, cy, rx, ry, color) {
  if (rx <= 0 || ry <= 0) return
  const y0 = Math.floor(cy - ry - 0.5)
  const y1 = Math.ceil(cy + ry + 0.5)
  ctx.fillStyle = color
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / (ry + 0.5)
    const k = 1 - dy * dy
    if (k <= 0) continue
    const half = (rx + 0.5) * Math.sqrt(k)
    const xa = Math.round(cx - half)
    const xb = Math.round(cx + half)
    if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1)
  }
}

/** 二次贝塞尔曲线上的锥形（尾巴 / 藤蔓 / 爪）。 */
function taperCurve(ctx, p0, p1, p2, r0, r1, color, shade) {
  const steps = 44
  const shadeColor = shade || mix(color, PAL.void1, 0.3)
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? shadeColor : color
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const u = 1 - t
      const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
      const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
      const r = r0 + (r1 - r0) * t + (pass === 0 ? 0.35 : 0)
      fillEllipse(ctx, x, y - (pass === 0 ? 0 : 0.35), r, r, ctx.fillStyle)
    }
  }
}

/* ============================================================================
 * 4. 纹理工厂
 * ========================================================================== */

const REPEAT = THREE.RepeatWrapping
const CLAMP = THREE.ClampToEdgeWrapping

function wrapValue(v, fallback) {
  if (v === 'clamp') return CLAMP
  if (v === 'repeat') return REPEAT
  if (v === true) return REPEAT
  if (v === false) return CLAMP
  return fallback
}

/**
 * 创建一个像素化 CanvasTexture。
 * @param {number} w 画布宽
 * @param {number} h 画布高
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @param {{wrap?: 'repeat'|'clamp', wrapS?: 'repeat'|'clamp', wrapT?: 'repeat'|'clamp',
 *          anchor?: string}} [opts] 内部使用：环绕模式与锚点元数据
 * @returns {THREE.CanvasTexture}
 */
export function makeTexture(w, h, draw, opts = {}) {
  const cw = Math.max(1, Math.round(w || 1))
  const ch = Math.max(1, Math.round(h || 1))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    if (typeof draw === 'function') draw(ctx, cw, ch)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace

  const base = opts.wrap === 'clamp' ? CLAMP : REPEAT
  texture.wrapS = wrapValue(opts.wrapS, base)
  texture.wrapT = wrapValue(opts.wrapT, base)
  texture.needsUpdate = true

  if (opts.anchor) texture.userData.anchor = opts.anchor
  texture.userData.size = [cw, ch]
  return texture
}

const SPRITE_OPTS = { wrap: 'clamp' }
const TILE_OPTS = { wrap: 'repeat' }

/* ============================================================================
 * 5. 白猫（slugcat）精灵
 * ========================================================================== */

const SLUG = {
  body: PAL.slug,
  shade: PAL.slugShade,
  deep: mix(PAL.slugShade, PAL.void1, 0.42),
  belly: PAL.slugBelly,
  tail: PAL.slugTail,
  tailShade: mix(PAL.slugTail, PAL.void1, 0.26),
  eye: PAL.eye,
}

/** 一段锥形肢体（两遍绘制：暗描边 + 亮内芯）。 */
function slugSegment(ctx, x0, y0, x1, y1, r0, r1, edge, main) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.max(2, Math.round(len * 1.8))
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? edge : main
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const r = r0 + (r1 - r0) * t + (pass === 0 ? 0.4 : 0)
      fillEllipse(
        ctx,
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t - (pass === 0 ? 0 : 0.3),
        r,
        r,
        ctx.fillStyle,
      )
    }
  }
}

/** 腿：胯 → 膝 → 脚，膝盖可横向偏移，脚掌压在 foot 行上。 */
function slugLimb(ctx, hip, foot, thick, far, bend) {
  const main = far ? SLUG.shade : SLUG.body
  const edge = far ? SLUG.deep : SLUG.shade
  const kx = (hip[0] + foot[0]) / 2 + (bend || 0)
  const ky = (hip[1] + foot[1]) / 2 + 0.6
  slugSegment(ctx, hip[0], hip[1], kx, ky, thick / 2, thick * 0.38, edge, main)
  slugSegment(ctx, kx, ky, foot[0], foot[1], thick * 0.38, thick * 0.3, edge, main)

  const fx = Math.round(foot[0])
  const fy = Math.round(foot[1])
  rect(ctx, fx - 3, fy, 6, 1, edge)
  rect(ctx, fx - 2, fy - 1, 5, 1, main)
  pix(ctx, fx + 2, fy, main)
  pix(ctx, fx - 3, fy - 1, edge)
}

/** 前爪：一小团贴胸的白色圆点，避免在白色身体上留下难看的轮廓弧线。 */
function slugPaw(ctx, x, y) {
  fillEllipse(ctx, x, y + 0.5, 2.4, 1.9, SLUG.shade)
  fillEllipse(ctx, x, y, 2, 1.5, SLUG.body)
}

/** 圆润的小耳廓：两遍椭圆，自带深色描边。 */
function slugEar(ctx, cx, cy, rx, ry) {
  fillEllipse(ctx, cx, cy, rx, ry, SLUG.shade)
  fillEllipse(ctx, cx, cy - 0.3, Math.max(0.8, rx - 0.9), Math.max(0.8, ry - 0.9), SLUG.body)
}

/** 身体由「胯 + 肩」两段椭圆拼成，整体更修长；两遍绘制自带描边。 */
function slugBody(ctx, parts) {
  for (const p of parts) fillEllipse(ctx, p.cx, p.cy, p.rx + 0.5, p.ry + 0.5, SLUG.shade)
  for (const p of parts) fillEllipse(ctx, p.cx, p.cy - 0.6, p.rx - 0.6, p.ry - 0.6, SLUG.body)
  // 腹部亮色（取最低那一块的底部，收窄，避免糊成一个白团）
  let low = parts[0]
  for (const p of parts) if (p.cy + p.ry > low.cy + low.ry) low = p
  fillEllipse(
    ctx,
    low.cx + 0.4,
    low.cy + low.ry * 0.55,
    Math.max(1, low.rx * 0.58),
    Math.max(1, low.ry * 0.34),
    SLUG.belly,
  )
}

/** 画一个完整姿势（身体 / 头 / 四肢 / 尾 / 耳朵 / 眼睛）。 */
function drawSlugcatPose(ctx, w, h, pose) {
  const head = pose.head

  // 1) 尾巴（在身体后面，细长上翘）
  if (pose.tail) {
    const t = pose.tail
    taperCurve(ctx, t.p0, t.p1, t.p2, t.r0, t.r1, SLUG.tail, SLUG.tailShade)
  }

  // 2) 腿：远侧的腿先画（更暗），近侧的腿后画
  const legs = (pose.legs || []).slice().sort((a, b) => (a.far ? 0 : 1) - (b.far ? 0 : 1))
  for (const leg of legs) {
    slugLimb(ctx, leg.hip, leg.foot, leg.thick || 5, !!leg.far, leg.bend || 0)
  }

  // 3) 身体
  slugBody(ctx, pose.body)

  // 4) 前爪（贴在胸口下缘）
  for (const paw of pose.paws || []) slugPaw(ctx, paw[0], paw[1])

  // 5) 耳朵（先画，头再压住根部，只留出圆润耳尖）
  const ears = pose.ears || [
    [head.cx - 3.2, head.cy - head.ry + 1.5, 2.4, 2.7],
    [head.cx + 2.2, head.cy - head.ry + 1.2, 2.2, 2.5],
  ]
  for (const ear of ears) slugEar(ctx, ear[0], ear[1], ear[2], ear[3])

  // 头
  fillEllipse(ctx, head.cx, head.cy, head.rx + 0.5, head.ry + 0.5, SLUG.shade)
  fillEllipse(ctx, head.cx, head.cy - 0.6, head.rx - 0.6, head.ry - 0.6, SLUG.body)

  // 吻部（向右突出，短而圆）
  const mx = head.cx + head.rx - 1.9
  const my = head.cy + head.ry * 0.46
  fillEllipse(ctx, mx, my, 2.7, 2, SLUG.shade)
  fillEllipse(ctx, mx, my - 0.4, 2.1, 1.5, SLUG.body)
  // 下颌阴影 + 鼻尖
  rect(ctx, mx - 0.6, my + 1.6, 2.2, 1, SLUG.shade)
  pix(ctx, head.cx + head.rx - 0.4, head.cy + 0.6, SLUG.shade)

  // 眼睛：默认是一对斜向的黑色小点
  const eyes = pose.eyes || [
    [Math.round(head.cx - 0.5), Math.round(head.cy - 2.6)],
    [Math.round(head.cx + 3), Math.round(head.cy - 1.8)],
  ]
  for (let i = 0; i < eyes.length; i++) {
    const ex = eyes[i][0]
    const ey = eyes[i][1]
    if (pose.eyeClosed) {
      rect(ctx, ex, ey + 1, 3, 1, SLUG.eye)
      pix(ctx, ex + 1, ey + 2, SLUG.shade)
    } else if (pose.eyeSquint) {
      rect(ctx, ex, ey + 1, 2, 1, SLUG.eye)
    } else {
      rect(ctx, ex, ey, 2, 2, SLUG.eye)
      pix(ctx, ex, ey + 2, mix(SLUG.shade, PAL.void1, 0.22))
    }
  }

  // 胡须（两粒像素，破开吻部轮廓）
  if (!pose.noWhiskers) {
    pix(ctx, head.cx + head.rx + 1, head.cy + 3.2, SLUG.shade)
    pix(ctx, head.cx + head.rx + 0.3, head.cy + 5, SLUG.shade)
  }
}

/* ---- 各姿势数据 ---------------------------------------------------------- */

function slugIdlePose(frame) {
  const bob = frame ? -1 : 0
  return {
    body: [
      { cx: 18.2, cy: 23.2 + bob, rx: 7.6, ry: 6.1 },
      { cx: 25.8, cy: 21.6 + bob, rx: 6.3, ry: 5.5 },
    ],
    head: { cx: 30.8, cy: 13.6 + bob, rx: 6.5, ry: 5.7 },
    legs: [
      { hip: [19.4, 27 + bob], foot: [17.4, 39], thick: 5, far: true, bend: 0.8 },
      { hip: [25, 27 + bob], foot: [26.4, 39], thick: 5.2, bend: -0.8 },
    ],
    paws: [[30.4, 26.4 + bob]],
    tail: {
      p0: [13.8, 25 + bob],
      p1: [3.8, 26 + bob],
      p2: [7, 14.5 + (frame ? 1.5 : 0)],
      r0: 2.6,
      r1: 0.75,
    },
  }
}

function slugRunPose(frame) {
  const ph = (frame / 6) * TAU
  const bob = Math.round(Math.sin(ph * 2) * 0.8)
  const stride = 4.7
  const lift = 5
  const footAt = (p) => [0, 39 - Math.max(0, Math.sin(p)) * lift]
  const nearFoot = footAt(ph + Math.PI)
  const farFoot = footAt(ph)
  return {
    body: [
      { cx: 18.2, cy: 23.2 + bob, rx: 7.7, ry: 5.9 },
      { cx: 25.8, cy: 21.6 + bob, rx: 6.3, ry: 5.4 },
    ],
    head: { cx: 30.9, cy: 13.6 + bob * 0.6, rx: 6.5, ry: 5.7 },
    legs: [
      {
        hip: [19.4, 27 + bob],
        foot: [19.4 + Math.cos(ph) * stride, farFoot[1]],
        thick: 5,
        far: true,
        bend: -Math.cos(ph) * 1.5,
      },
      {
        hip: [24.6, 27 + bob],
        foot: [24.6 + Math.cos(ph + Math.PI) * stride, nearFoot[1]],
        thick: 5.2,
        bend: -Math.cos(ph + Math.PI) * 1.5,
      },
    ],
    paws: [[30.2 + Math.cos(ph) * 1.8, 26.2 + bob]],
    tail: {
      p0: [13.8, 25 + bob],
      p1: [4.6 + Math.cos(ph) * 1.1, 25 + bob],
      p2: [7.5 + Math.cos(ph) * 2, 15 + Math.sin(ph) * 2],
      r0: 2.6,
      r1: 0.75,
    },
  }
}

function slugJumpPose() {
  return {
    body: [
      { cx: 18.4, cy: 20.5, rx: 7.4, ry: 5.9 },
      { cx: 25.8, cy: 19, rx: 6.2, ry: 5.3 },
    ],
    head: { cx: 30.6, cy: 11.4, rx: 6.5, ry: 5.7 },
    legs: [
      { hip: [19.4, 24], foot: [22.5, 32.5], thick: 5, far: true, bend: -2.5 },
      { hip: [24.6, 24], foot: [27, 31], thick: 5.2, bend: -3 },
    ],
    paws: [[32.2, 23.2]],
    tail: { p0: [14, 22], p1: [4.4, 17], p2: [9.5, 9.5], r0: 2.6, r1: 0.7 },
  }
}

function slugFallPose() {
  return {
    body: [
      { cx: 18.2, cy: 21.4, rx: 7.4, ry: 5.8 },
      { cx: 25.8, cy: 19.8, rx: 6.2, ry: 5.3 },
    ],
    head: { cx: 30.7, cy: 11.8, rx: 6.5, ry: 5.7 },
    legs: [
      { hip: [19.4, 24.5], foot: [13.5, 33], thick: 4.8, far: true, bend: 2.5 },
      { hip: [24.6, 24.5], foot: [28.5, 31.5], thick: 5, bend: -2.4 },
    ],
    paws: [[29.8, 24]],
    tail: { p0: [14, 22.5], p1: [3.5, 15], p2: [9, 8], r0: 2.5, r1: 0.7 },
  }
}

function slugLandPose() {
  return {
    body: [
      { cx: 18.2, cy: 25.4, rx: 7.8, ry: 4.9 },
      { cx: 25.8, cy: 24, rx: 6.4, ry: 4.6 },
    ],
    head: { cx: 30.8, cy: 17, rx: 6.4, ry: 5.2 },
    legs: [
      { hip: [19.4, 27.5], foot: [12.5, 39], thick: 5, far: true, bend: 2.2 },
      { hip: [24.6, 27.5], foot: [30.5, 39], thick: 5.2, bend: -2.2 },
    ],
    paws: [[30.6, 28.2]],
    tail: { p0: [13.8, 26.5], p1: [4.5, 30], p2: [10, 35.5], r0: 2.5, r1: 0.7 },
    eyeSquint: true,
  }
}

function slugCrouchPose() {
  return {
    body: [
      { cx: 18.2, cy: 18.4, rx: 7.8, ry: 4.6 },
      { cx: 25.8, cy: 17.4, rx: 6.3, ry: 4.3 },
    ],
    head: { cx: 30.6, cy: 11.6, rx: 6.2, ry: 4.9 },
    legs: [
      { hip: [19.2, 21.5], foot: [14.5, 27], thick: 4.6, far: true, bend: 1 },
      { hip: [25, 21.5], foot: [27.5, 27], thick: 4.8, bend: -1 },
    ],
    paws: [[30.4, 21.4]],
    tail: { p0: [13.8, 19.5], p1: [3.5, 23.5], p2: [7.5, 26], r0: 2.5, r1: 0.7 },
  }
}

function slugSwimPose(frame) {
  const wave = Math.sin((frame / 3) * TAU)
  const bob = Math.round(wave * 0.5)
  return {
    body: [
      { cx: 17.5, cy: 20.8 + bob, rx: 7.4, ry: 4.6 },
      { cx: 25.4, cy: 20.2 + bob, rx: 6.2, ry: 4.4 },
    ],
    head: { cx: 33, cy: 18.2 + bob, rx: 5.8, ry: 4.6 },
    legs: [
      { hip: [17.5, 23.8], foot: [11.5, 26.5 + wave], thick: 4.2, far: true, bend: 1.5 },
      { hip: [22, 23.8], foot: [16, 28.5 - wave], thick: 4.4, bend: 2 },
    ],
    paws: [[34.6, 23.2 + wave * 1.2]],
    tail: {
      p0: [11.5, 20.5],
      p1: [4.2 + wave * 1.8, 15 + wave * 2],
      p2: [5.5, 25 + wave * 2],
      r0: 2.4,
      r1: 0.7,
    },
    ears: [
      [29.4, 15.6, 2.2, 3.2],
      [34.2, 15.1, 2, 2.8],
    ],
  }
}

function slugClimbPose(frame) {
  const up = frame === 0
  return {
    body: [
      { cx: 21.6, cy: 22, rx: 6, ry: 7.4 },
      { cx: 23.4, cy: 15.6, rx: 5.4, ry: 5.8 },
    ],
    head: { cx: 26.6, cy: 10.2, rx: 5.8, ry: 5.2 },
    legs: [
      { hip: [22.4, 27.5], foot: [31, up ? 33 : 31], thick: 4.6, far: true, bend: -1.5 },
      { hip: [23.2, 25.5], foot: [30, up ? 35 : 37], thick: 4.8, bend: -2 },
    ],
    paws: [
      [31.8, up ? 14 : 19],
      [30.6, up ? 20 : 12],
    ],
    tail: { p0: [18.4, 28.5], p1: [10.5, 33], p2: [14, up ? 38.5 : 37.5], r0: 2.4, r1: 0.7 },
    ears: [
      [23.8, 6.4, 2.1, 2.9],
      [28, 6, 2, 2.6],
    ],
  }
}

function slugSleepPose() {
  return {
    body: [
      { cx: 20, cy: 29, rx: 8.4, ry: 6 },
      { cx: 27, cy: 27.8, rx: 5.8, ry: 5 },
    ],
    head: { cx: 30.2, cy: 25.2, rx: 5.6, ry: 4.5 },
    legs: [],
    arms: [],
    tail: { p0: [15, 31.5], p1: [4.5, 34], p2: [13.5, 37.5], r0: 2.4, r1: 0.7 },
    ears: [
      [27, 20.8, 2.2, 3.1],
      [32, 20.3, 2, 2.8],
    ],
    eyes: [
      [28, 25],
      [33, 24],
    ],
    eyeClosed: true,
  }
}

/* ============================================================================
 * 6. 蜥蜴
 * ========================================================================== */

const LIZ = {
  a: PAL.lizardA,
  b: PAL.lizardB,
  c: PAL.lizardC,
  dark: PAL.lizardDark,
  eye: PAL.lizardEye,
  tongue: PAL.lizardTongue,
  tooth: PAL.karma,
}

/** 96×32 无缝躯干：上深下浅，背脊深色，底部鳞片。 */
function drawLizardBody(ctx, w, h) {
  const topAt = (x) => 3 + Math.round(0.9 * (0.5 + 0.5 * Math.sin(TAU * 2 * (x / w) + 0.6)))
  const botAt = (x) => 28 + Math.round(0.7 * (0.5 + 0.5 * Math.sin(TAU * 2 * (x / w) + 2.4)))

  for (let x = 0; x < w; x++) {
    const top = topAt(x)
    const bot = botAt(x)
    for (let y = top; y <= bot; y++) {
      const ft = y - top
      const fb = bot - y
      let c = LIZ.a

      if (ft <= 0) {
        c = LIZ.dark
      } else if (ft <= 2) {
        c = (x + y) % 3 === 0 ? LIZ.dark : LIZ.b
      } else if (ft <= 5) {
        c = (x & 1) === 0 ? LIZ.b : LIZ.a
      } else if (fb <= 0) {
        c = LIZ.dark
      } else if (fb <= 2) {
        c = (x + y) & 1 ? LIZ.dark : LIZ.b
      } else if (fb <= 4) {
        c = LIZ.b
      } else {
        c = LIZ.a
      }

      // 底部鳞片：周期性小高光（96 可被 6 整除 → 平铺连续）
      if (fb >= 2 && fb <= 4 && x % 6 === 3) c = LIZ.c
      if (fb >= 1 && fb <= 3 && x % 6 === 1) c = LIZ.b

      // 中段斑驳
      const n = hash2d(x, y, 0x2ba7)
      if (n > 0.93 && fb > 5) c = LIZ.c
      else if (n < 0.06 && fb > 5) c = LIZ.b

      rect(ctx, x, y, 1, 1, c)
    }
  }

  // 背脊小嵴（周期 12，平铺安全）
  for (let x = 4; x < w; x += 12) {
    const top = topAt(x)
    rect(ctx, x, top - 2, 2, 2, LIZ.b)
    pix(ctx, x + 1, top - 3, LIZ.dark)
  }
  // 沿脊线的深色纹
  for (let x = 0; x < w; x++) {
    rect(ctx, x, topAt(x) + 1, 1, 1, mix(LIZ.dark, LIZ.b, 0.25))
  }
}

function lizardHeadTop(x) {
  if (x <= 26) return 5 + ((x - 2) / 24) * 1.4
  return 6.4 + Math.pow((x - 26) / 16, 1.7) * 8.4
}

function lizardHeadBottom(x) {
  if (x <= 26) return 25 - ((x - 2) / 24) * 1.0
  return 24 - Math.pow((x - 26) / 16, 1.4) * 7.2
}

function lizardOpenTop(x) {
  if (x <= 26) return 4 + ((x - 2) / 24) * 1.4
  return 5.4 + Math.pow((x - 26) / 16, 1.7) * 8.0
}

function lizardOpenBottom(x) {
  if (x <= 24) return 22 - ((x - 2) / 22) * 1
  return 21 - Math.pow((x - 24) / 18, 1.2) * 4
}

function lizardJawTop(x) {
  return 22 + Math.pow(Math.max(0, (x - 22) / 20), 1.25) * 3.2
}

function fillShape(ctx, x0, x1, topFn, bottomFn, colorFn) {
  for (let x = x0; x <= x1; x++) {
    const t = Math.round(topFn(x))
    const b = Math.round(bottomFn(x))
    for (let y = t; y <= b; y++) {
      const c = colorFn(x, y, t, b)
      if (c) rect(ctx, x, y, 1, 1, c)
    }
  }
}

function lizardHeadColor(x, y, t, b) {
  const ft = y - t
  const fb = b - y
  if (ft <= 0) return LIZ.dark
  if (ft <= 2) return (x + y) % 3 === 0 ? LIZ.dark : LIZ.b
  if (ft <= 5) return (x & 1) === 0 ? LIZ.b : LIZ.a
  if (fb <= 0) return LIZ.dark
  if (fb <= 2) return (x + y) & 1 ? LIZ.dark : LIZ.b
  if (fb <= 4) return LIZ.b
  if (x % 9 === 4 && y % 7 === 3) return LIZ.c
  const n = hash2d(x, y, 0x2ba7)
  if (n > 0.88) return LIZ.c
  if (n < 0.07) return LIZ.b
  return LIZ.a
}

function drawLizardEye(ctx, x, y) {
  // 眼窝 → 暖色虹膜 → 竖瞳 → 高光
  rect(ctx, x - 1, y - 1, 8, 7, LIZ.dark)
  rect(ctx, x, y, 6, 5, LIZ.b)
  rect(ctx, x + 1, y + 1, 4, 3, LIZ.eye)
  rect(ctx, x + 2, y + 1, 2, 3, LIZ.dark)
  pix(ctx, x + 1, y + 1, PAL.white)
  rect(ctx, x - 1, y - 3, 8, 2, mix(LIZ.b, LIZ.dark, 0.45))
}

function drawLizardHead(ctx, open) {
  if (!open) {
    fillShape(ctx, 2, 42, lizardHeadTop, lizardHeadBottom, lizardHeadColor)

    // 头冠小刺
    for (let x = 5; x <= 25; x += 5) {
      const t = Math.round(lizardHeadTop(x))
      rect(ctx, x, t - 2, 2, 2, LIZ.b)
      pix(ctx, x + 1, t - 3, LIZ.dark)
    }

    drawLizardEye(ctx, 25, 9)

    // 闭口：嘴线 + 下唇高光 + 嘴角
    for (let x = 29; x <= 42; x++) {
      const y = Math.round(20 - (x - 29) * 0.22)
      pix(ctx, x, y, LIZ.dark)
      if (x > 30 && (x & 1) === 0) pix(ctx, x, y + 1, mix(LIZ.dark, LIZ.b, 0.5))
    }
    for (let x = 32; x <= 41; x += 2) pix(ctx, x, 18, mix(LIZ.c, LIZ.b, 0.35))
    pix(ctx, 29, 20, LIZ.dark)
    pix(ctx, 30, 21, LIZ.b)

    // 鼻孔
    pix(ctx, 40, 14, LIZ.dark)
    pix(ctx, 39, 14, LIZ.b)
    // 吻端亮边
    rect(ctx, 41, 15, 1, 2, LIZ.c)
    // 侧脸鳞片
    for (let i = 0; i < 5; i++) {
      const sx = 12 + i * 4
      pix(ctx, sx, 20 + (i % 2), LIZ.c)
      pix(ctx, sx + 1, 21 - (i % 2), LIZ.b)
    }
  } else {
    fillShape(ctx, 2, 42, lizardOpenTop, lizardOpenBottom, lizardHeadColor)

    // 口腔（暗腔 + 中间微亮的喉咙）
    for (let x = 24; x <= 42; x++) {
      const top = Math.round(lizardOpenBottom(x)) + 1
      const bot = Math.round(lizardJawTop(x)) - 1
      const mid = (top + bot) / 2
      for (let y = top; y <= bot; y++) {
        let c = mix(LIZ.dark, PAL.black, 0.5)
        if (Math.abs(y - mid) < 1.2) c = mix(LIZ.dark, PAL.black, 0.3)
        rect(ctx, x, y, 1, 1, c)
      }
    }

    // 舌头
    taperCurve(ctx, [26, 22], [32, 22.5], [39.5, 24.2], 1.9, 0.8, LIZ.tongue, mix(LIZ.tongue, PAL.void0, 0.4))
    rect(ctx, 27, 21, 9, 1, lighten(LIZ.tongue, 0.28))

    // 下颌
    fillShape(
      ctx,
      22,
      42,
      lizardJawTop,
      (x) => Math.min(28, lizardJawTop(x) + 3),
      (x, y, t, b) => {
        const ft = y - t
        const fb = b - y
        if (ft <= 0) return LIZ.dark
        if (ft <= 1) return LIZ.b
        if (fb <= 0) return LIZ.dark
        if (fb <= 1) return LIZ.b
        return (x + y) % 5 === 0 ? LIZ.b : LIZ.a
      },
    )
    // 下巴亮边
    rect(ctx, 24, 27, 8, 1, LIZ.c)

    // 上排牙（从上颌下缘垂下）
    for (let x = 29; x <= 41; x += 3) {
      const y = Math.round(lizardOpenBottom(x)) + 1
      rect(ctx, x, y, 1, 2, LIZ.tooth)
      pix(ctx, x, y + 2, mix(LIZ.tooth, PAL.void0, 0.35))
    }
    // 下排牙（从下颌上缘长出）
    for (let x = 30; x <= 40; x += 4) {
      const y = Math.round(lizardJawTop(x)) - 1
      rect(ctx, x, y - 1, 1, 2, LIZ.tooth)
    }

    // 眯起的眼睛 + 头冠
    drawLizardEye(ctx, 25, 8)
    for (let x = 5; x <= 25; x += 5) {
      const t = Math.round(lizardOpenTop(x))
      rect(ctx, x, t - 2, 2, 2, LIZ.b)
      pix(ctx, x + 1, t - 3, LIZ.dark)
    }
    // 鼻孔
    pix(ctx, 39, 12, LIZ.dark)
  }
}

function drawLizardEyeTexture(ctx, w, h) {
  const cx = w / 2
  const cy = h / 2
  const rng = mulberry32(0x3e9e1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      if (d > 7.8) continue
      let color = null
      if (d > 6.1) {
        if (rng() < 0.45) color = rgba(LIZ.eye, 0.12)
      } else if (d > 4.6) {
        color = rgba(mix(LIZ.eye, PAL.void0, 0.45), 0.55)
      } else if (d > 2.4) {
        color = LIZ.eye
      } else {
        color = lighten(LIZ.eye, 0.35)
      }
      // 竖瞳
      if (Math.abs(dx) < 1.1 && Math.abs(dy) < 3.6) color = mix(PAL.black, LIZ.dark, 0.35)
      // 高光
      if ((dx === -2 && dy === -2) || (dx === -2 && dy === -1)) color = PAL.white
      if (color) rect(ctx, x, y, 1, 1, color)
    }
  }
  // 暗色眼睑压住顶部
  for (let x = 2; x < w - 2; x++) {
    if (x > 3 && x < w - 4) rect(ctx, x, 2, 1, 1, mix(PAL.black, LIZ.dark, 0.3))
  }
}

function drawLizardClaw(ctx, w, h) {
  // 掌部肉垫
  fillEllipse(ctx, 3.2, 5.6, 3, 3.4, mix(LIZ.dark, PAL.void0, 0.2))
  fillEllipse(ctx, 2.8, 5.2, 2.2, 2.6, LIZ.b)

  // 三道分开的弯爪
  const talons = [
    { p0: [3, 2], p1: [8, 0.5], p2: [11, 2.5] },
    { p0: [3, 5], p1: [8.5, 4.5], p2: [11, 6] },
    { p0: [3, 8], p1: [7.5, 8.5], p2: [9.5, 9.5] },
  ]
  for (const t of talons) {
    taperCurve(ctx, t.p0, t.p1, t.p2, 1.15, 0.35, LIZ.c, mix(LIZ.c, PAL.void0, 0.55))
    pix(ctx, Math.round(t.p2[0]), Math.round(t.p2[1]), PAL.karma)
  }

  // 指节高光
  pix(ctx, 2, 3, LIZ.c)
  pix(ctx, 2, 6, LIZ.c)
  pix(ctx, 2, 8, LIZ.c)
}

/* ============================================================================
 * 7. 小物件：果实 / 蝠蝇 / 石头
 * ========================================================================== */

function drawFruit(ctx, w, h, frame) {
  const cx = 8
  const cy = 9.5
  const pulse = [0, 1, 2, 1][frame] || 0
  const glowA = 0.1 + pulse * 0.1
  const glowR = 5.9 + pulse * 0.85

  // 呼吸光晕：帧间半径/亮度明显变化
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > glowR || d < 3.2) continue
      const t = 1 - (d - 3.2) / (glowR - 3.2)
      const a = glowA * t * t
      if (a < 0.025) continue
      if (hash2d(x, y, 0x7f00 + frame) > 0.35 + t * 0.5) continue
      rect(ctx, x, y, 1, 1, rgba(PAL.fruitGlow, a))
    }
  }

  // 果柄与叶片
  rect(ctx, 7, 3, 1, 3, PAL.moss)
  rect(ctx, 8, 4, 2, 1, PAL.moss)
  rect(ctx, 9, 2, 2, 2, PAL.mossHi)
  pix(ctx, 10, 2, PAL.moss)
  pix(ctx, 9, 4, mix(PAL.moss, PAL.void0, 0.35))

  // 果实本体：深色轮廓 → 果青 → 果肉高光
  fillEllipse(ctx, cx, cy, 4.9, 4.6, mix(PAL.fruit, PAL.void0, 0.55))
  fillEllipse(ctx, cx, cy - 0.1, 4.3, 4, PAL.fruitGlow)
  fillEllipse(ctx, cx - 0.2, cy - 0.4, 3.5, 3.3, PAL.fruit)
  // 顶部果柄凹陷
  rect(ctx, 7, 5, 2, 1, mix(PAL.fruit, PAL.void0, 0.35))
  // 高光
  fillEllipse(ctx, cx - 1.5, cy - 1.7, 1.5, 1.2, PAL.fruitHi)
  pix(ctx, cx - 2.6, cy - 0.6, PAL.fruitHi)
  // 底部反光
  pix(ctx, cx + 1, cy + 2.6, PAL.fruitHi)
  pix(ctx, cx + 2.2, cy + 2, mix(PAL.fruitHi, PAL.fruitGlow, 0.5))
  // 果皮斑点
  pix(ctx, cx + 2, cy - 1, mix(PAL.fruit, PAL.fruitHi, 0.6))
  pix(ctx, cx + 1, cy + 1, mix(PAL.fruit, PAL.fruitGlow, 0.7))
  pix(ctx, cx - 2, cy + 2, mix(PAL.fruit, PAL.fruitGlow, 0.6))
}

function drawBatfly(ctx, w, h, frame) {
  const fur = PAL.slug
  const shade = PAL.slugShade
  const wing = mix(PAL.slugShade, PAL.void1, 0.1)
  const wingDeep = mix(PAL.slugShade, PAL.void1, 0.45)
  const bx = 7
  const by = 5.6

  // 三帧翅膀：上举 / 平展 / 下拍
  const wings = [
    { l: [[5.5, 5], [3, 1.5], [1.5, 1]], r: [[8.5, 5], [11, 1.5], [12.5, 1]] },
    { l: [[5.5, 5.5], [2.5, 4.5], [1, 4.5]], r: [[8.5, 5.5], [11.5, 4.5], [13, 4.5]] },
    { l: [[5.5, 6], [3, 8.5], [1.5, 9]], r: [[8.5, 6], [11, 8.5], [12.5, 9]] },
  ][frame] || { l: null, r: null }

  // 翅膀先画，身体压住根部
  for (const side of [wings.l, wings.r]) {
    if (!side) continue
    const a = side[0]
    const b = side[1]
    const c = side[2]
    taperCurve(ctx, a, b, c, 1.7, 0.5, wing, wingDeep)
    // 前缘骨线
    for (let i = 0; i < 3; i++) {
      const t = i / 2
      pix(ctx, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, mix(PAL.slugBelly, wing, 0.35))
    }
  }

  // 身体
  fillEllipse(ctx, bx, by, 2.9, 2.1, wingDeep)
  fillEllipse(ctx, bx, by - 0.3, 2.3, 1.6, fur)
  // 头 + 眼
  rect(ctx, bx + 1.4, by - 2.5, 2, 2, fur)
  pix(ctx, bx + 2.4, by - 2.2, PAL.eye)
  // 触角
  pix(ctx, bx + 3, by - 3, shade)
  pix(ctx, bx + 4, by - 4, shade)
  // 脚
  rect(ctx, bx - 1, by + 2, 1, 2, shade)
  rect(ctx, bx + 1, by + 2, 1, 2, shade)
}

function drawRock(ctx, w, h) {
  const rows = [
    [5, 10],
    [3, 12],
    [2, 13],
    [1, 14],
    [1, 14],
    [1, 14],
    [2, 13],
    [2, 13],
    [3, 12],
    [4, 11],
    [5, 10],
    [6, 9],
  ]
  const inside = (x, y) => {
    if (y < 0 || y >= h) return false
    const s = rows[y]
    return x >= s[0] && x <= s[1]
  }

  for (let y = 0; y < h; y++) {
    const span = rows[y]
    for (let x = span[0]; x <= span[1]; x++) {
      const n = hash2d(x, y, 0x70cc)
      let c = PAL.stone
      if (n < 0.3) c = PAL.stoneDark
      else if (n > 0.84) c = mix(PAL.stone, PAL.stoneLit, 0.55)
      // 顶部受光面
      if (y <= 1) c = PAL.stoneLit
      else if (y === 2) c = mix(PAL.stoneLit, PAL.stone, 0.45)
      // 左侧受光
      if (x <= span[0] + 2 && y < 7) c = mix(c, PAL.stoneLit, 0.3)
      // 右侧 / 底部背光
      if (x >= span[1] - 1) c = mix(c, PAL.stoneDark, 0.45)
      if (y >= h - 3) c = mix(c, PAL.stoneDark, 0.6)
      if (y === h - 1) c = PAL.stoneDeep
      // 轮廓：与外部的分界压暗
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
        if (y > 2) c = mix(c, PAL.stoneDeep, 0.4)
      }
      rect(ctx, x, y, 1, 1, c)
    }
  }

  // 斜向裂纹
  let cx = 7
  let cy = 4
  for (let i = 0; i < 6; i++) {
    pix(ctx, cx, cy, PAL.stoneDeep)
    cx += i % 2 === 0 ? 1 : -1
    cy += 1
  }
  // 顶部高光点 + 斑点
  pix(ctx, 4, 1, PAL.edgeLit)
  pix(ctx, 9, 1, PAL.edgeLit)
  pix(ctx, 2, 3, mix(PAL.edgeLit, PAL.stoneLit, 0.45))
  for (let i = 0; i < 8; i++) {
    const x = 1 + Math.floor(hash2d(i, 3, 0x70cc) * (w - 2))
    const y = 1 + Math.floor(hash2d(i, 7, 0x70cc) * (h - 2))
    if (inside(x, y)) pix(ctx, x, y, i % 2 ? PAL.stoneDeep : PAL.stoneLit)
  }
}

/* ============================================================================
 * 8. 图块：石砖 / 苔顶 / 平台 / 爬杆
 * ========================================================================== */

function stoneColorAt(x, y, size, seed) {
  const n = tileFbm(x, y, size, seed, 3)
  const m = hash2d(x, y, seed ^ 0x51ed)
  let c = PAL.stone
  if (n < 0.34) c = PAL.stoneDark
  else if (n < 0.44) c = m > 0.5 ? PAL.stoneDark : PAL.stone
  else if (n > 0.76) c = m > 0.45 ? PAL.stoneLit : PAL.stone
  else if (n > 0.64) c = m > 0.62 ? PAL.stoneLit : PAL.stone
  if (m > 0.985) c = PAL.stoneDeep
  return c
}

const TILE_STYLE = [
  { block: 16, offset: false },
  { block: 8, offset: true },
  { block: 8, offset: false },
]

function drawStoneTile(ctx, size, seed, styleIndex) {
  const style = TILE_STYLE[styleIndex % TILE_STYLE.length]

  // 底噪
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rect(ctx, x, y, 1, 1, stoneColorAt(x, y, size, seed))
    }
  }

  const mortar = PAL.stoneDeep
  const light = mix(PAL.stone, PAL.stoneLit, 0.65)
  const dark = mix(PAL.stoneDark, PAL.stoneDeep, 0.5)

  if (!style.offset) {
    for (let by = 0; by < size; by += style.block) {
      for (let bx = 0; bx < size; bx += style.block) {
        const bs = style.block
        // 灰缝
        for (let i = 0; i < bs; i++) {
          pix(ctx, bx + i, by, mortar)
          pix(ctx, bx, by + i, mortar)
        }
        // 倒角
        for (let i = 1; i < bs; i++) {
          if ((i + bx) % 3 !== 0) pix(ctx, bx + i, by + 1, light)
          if ((i + by) % 3 !== 0) pix(ctx, bx + 1, by + i, light)
          if ((i + bx) % 2 === 0) pix(ctx, bx + i, by + bs - 1, dark)
          if ((i + by) % 2 === 0) pix(ctx, bx + bs - 1, by + i, dark)
        }
      }
    }
  } else {
    // 砖砌：8 行高、16 宽、隔行错缝（周期均整除 32 → 无缝）
    for (let ry = 0; ry < size; ry += style.block) {
      const row = Math.floor(ry / style.block)
      const off = row % 2 === 0 ? 0 : 8
      for (let x = 0; x < size; x++) pix(ctx, x, ry, mortar)
      for (let bx = off; bx < size + off; bx += 16) {
        const xx = ((bx % size) + size) % size
        for (let i = 1; i < style.block; i++) pix(ctx, xx, ry + i, mortar)
        for (let i = 1; i < style.block - 1; i++) {
          if ((xx + i) % 4 !== 0) pix(ctx, (xx + 1) % size, ry + i, light)
          if ((ry + i) % 4 !== 0) pix(ctx, (xx + 15) % size, ry + i, dark)
        }
        for (let i = 1; i < 16; i++) {
          if ((i + ry) % 4 === 0) pix(ctx, (xx + i) % size, ry + 1, light)
          if ((i + ry) % 4 === 2) pix(ctx, (xx + i) % size, ry + style.block - 1, dark)
        }
      }
    }
  }

  // 裂纹与斑点
  const rng = mulberry32(seed ^ 0xa53)
  for (let c = 0; c < 3; c++) {
    let x = 2 + Math.floor(rng() * (size - 4))
    let y = 2 + Math.floor(rng() * (size - 4))
    const len = 5 + Math.floor(rng() * 9)
    for (let i = 0; i < len; i++) {
      pix(ctx, x, y, mix(mortar, PAL.stoneDark, 0.4))
      x += rng() > 0.5 ? 1 : -1
      y += 1
      if (x < 1 || x > size - 2 || y > size - 2) break
    }
  }
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rng() * size)
    const y = Math.floor(rng() * size)
    const pick = rng()
    pix(ctx, x, y, pick > 0.72 ? light : pick > 0.4 ? mortar : mix(mortar, PAL.stoneLit, 0.35))
  }
}

function drawMossTop(ctx, size, seed) {
  // 苔藓覆盖顶部 4~7px，下缘用抖动过渡，横向周期 3 圈 → 可平铺
  for (let x = 0; x < size; x++) {
    const depth = 4 + Math.round(2 * (0.5 + 0.5 * Math.sin(TAU * 3 * (x / size) + 0.9)))
    for (let y = 0; y <= depth; y++) {
      const n = hash2d(x, y, seed ^ 0x33c0)
      let c
      if (y === 0) c = PAL.mossHi
      else if (y <= 2) c = n > 0.45 ? PAL.mossHi : PAL.moss
      else if (y === depth) c = n > 0.55 ? mix(PAL.moss, PAL.stone, 0.45) : PAL.moss
      else c = n > 0.7 ? PAL.mossHi : n < 0.18 ? mix(PAL.moss, PAL.void1, 0.35) : PAL.moss
      rect(ctx, x, y, 1, 1, c)
    }
    // 垂下的苔丝
    if (hash2d(x, 5, seed ^ 0x77) > 0.72) {
      rect(ctx, x, depth + 1, 1, 1 + Math.floor(hash2d(x, 6, seed ^ 0x78) * 3), mix(PAL.moss, PAL.stoneDark, 0.35))
    }
  }
}

function drawPlatform(ctx, w, h) {
  const seed = 0x9a71
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = stoneColorAt(x, y, w, seed)
      const n = hash2d(x, y, seed ^ 0x44)
      if (y === 0) c = n > 0.45 ? PAL.edgeLit : PAL.stoneLit
      else if (y === 1) c = n > 0.35 ? PAL.stoneLit : PAL.stone
      else if (y === 2) c = mix(PAL.stoneLit, PAL.stone, 0.7)
      else if (y === h - 2) c = mix(c, PAL.stoneDark, 0.7)
      else if (y === h - 1) c = PAL.stoneDeep
      // 水平层理（周期条纹 → 横向无缝）
      if (y > 2 && y < h - 2 && y % 3 === 0) c = mix(c, PAL.stoneDark, 0.35 + n * 0.3)
      // 垂向细裂
      if (y > 2 && y < h - 2 && x % 11 === 3 && n > 0.55) c = mix(c, PAL.stoneDeep, 0.5)
      rect(ctx, x, y, 1, 1, c)
    }
  }
  // 顶面高光 + 崩口
  for (let x = 2; x < w; x += 5) {
    if (hash2d(x, 0, seed) > 0.4) pix(ctx, x, 0, PAL.edgeLit)
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(hash2d(i, 1, seed) * w)
    pix(ctx, x, 0, PAL.stoneDeep)
    pix(ctx, x + 1, 0, PAL.stoneDark)
  }
}

function drawPole(ctx, w, h) {
  const seed = 0x51ab
  const profile = [
    mix(PAL.stoneDeep, PAL.void0, 0.5),
    PAL.stoneDark,
    PAL.stone,
    PAL.edgeLit,
    PAL.stoneLit,
    PAL.stoneDark,
    PAL.stoneDeep,
    mix(PAL.stoneDeep, PAL.void0, 0.65),
  ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = profile[x] || PAL.stoneDark
      // 纵向周期性零件（周期 8 / 16 → 竖直平铺无缝）
      const band = y % 8
      if (band === 0) c = mix(c, PAL.void0, 0.42)
      else if (band === 1) c = mix(c, PAL.stoneLit, 0.2)
      if (y % 16 === 7 && x >= 3 && x <= 4) c = PAL.stone
      const n = hash2d(x, y % 16, seed)
      if (n > 0.94) c = mix(c, PAL.moss, 0.22)
      else if (n < 0.07) c = mix(c, PAL.void0, 0.32)
      rect(ctx, x, y, 1, 1, c)
    }
  }
  // 铆钉
  for (let y = 3; y < h; y += 8) {
    pix(ctx, 3, y, PAL.edge)
    pix(ctx, 4, y + 4, mix(PAL.stoneDark, PAL.void0, 0.3))
  }
}

/* ============================================================================
 * 9. 庇护所拱门 / 房间通道
 * ========================================================================== */

function drawShelter(ctx, w, h) {
  const seed = 0x51e17e
  const cx = 48
  const archCy = 52
  const rOut = 41
  const rIn = 30
  const floorY = 116

  const outerAt = (x, y) => {
    const dx = x + 0.5 - cx
    if (y <= archCy) {
      const dy = y + 0.5 - archCy
      return dx * dx + dy * dy <= rOut * rOut
    }
    return x >= cx - rOut && x < cx + rOut
  }
  const innerAt = (x, y) => {
    const dx = x + 0.5 - cx
    if (y <= archCy) {
      const dy = y + 0.5 - archCy
      return dx * dx + dy * dy <= rIn * rIn
    }
    return x >= cx - rIn && x < cx + rIn
  }

  const outerMask = new Uint8Array(w * h)
  const innerMask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      outerMask[y * w + x] = outerAt(x, y) ? 1 : 0
      innerMask[y * w + x] = innerAt(x, y) && y < floorY ? 1 : 0
    }
  }

  const innerDist = (x, y) => {
    const dx = x + 0.5 - cx
    const dy = y + 0.5 - archCy
    const radial = Math.abs(Math.hypot(dx, dy) - rIn)
    const side = Math.abs(Math.abs(dx) - rIn)
    if (y <= archCy) return Math.min(radial, side)
    return side
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!outerMask[i]) continue

      if (innerMask[i]) {
        // ---- 开口内部：近黑 + 暖色内缘光 + 地面暖光 ----
        const d = Math.max(0, innerDist(x, y) - 1)
        const glow = Math.max(0, 1 - d / 11)
        let c = PAL.void0
        c = mix(c, PAL.warn, 0.02 + 0.2 * glow * glow)
        if (y > floorY - 28) c = mix(c, PAL.warn, 0.03 + 0.07 * Math.max(0, 1 - d / 6))
        // 底部暖墙
        if (y > floorY - 6) c = mix(c, PAL.warn, 0.05 + 0.1 * glow)
        rect(ctx, x, y, 1, 1, c)
        continue
      }

      const nearFloor = y >= floorY && innerAt(x, y)
      let c
      if (nearFloor) {
        // ---- 门内石阶 ----
        const n = hash2d(x, y, seed ^ 0x99)
        c = y === floorY ? mix(PAL.stoneLit, PAL.warn, 0.4) : n > 0.5 ? PAL.stoneDark : PAL.stone
        if (y === h - 1) c = PAL.stoneDeep
        if (y > floorY + 6 && n > 0.6) c = mix(PAL.moss, PAL.stoneDark, 0.4)
      } else {
        // ---- 石框 ----
        const n = fbm(x / 11, y / 11, seed, 3)
        const m = hash2d(x, y, seed ^ 0x77)
        c = PAL.stone
        if (n < 0.43) c = PAL.stoneDark
        if (n < 0.31) c = PAL.stoneDeep
        if (m > 0.9) c = PAL.stoneLit
        else if (m < 0.05) c = PAL.stoneDeep

        // 拱券楔形缝（y <= archCy 的扇面分段）
        if (y <= archCy) {
          const dy = y + 0.5 - archCy
          const dx = x + 0.5 - cx
          const r = Math.hypot(dx, dy)
          if (r > rIn + 1.5 && r < rOut - 0.5) {
            const theta = Math.atan2(-dy, dx)
            const seg = theta / (Math.PI / 11)
            if (seg - Math.floor(seg) < 0.06) c = mix(PAL.stoneDeep, PAL.void0, 0.25)
          }
        } else if ((y - archCy) % 17 === 0) {
          // 立柱水平石缝
          c = mix(PAL.stoneDeep, PAL.void0, 0.2)
        }

        // 内缘暖光
        const d = Math.max(0, innerDist(x, y) - 1)
        if (d < 3) c = mix(c, PAL.warn, 0.85 - d * 0.24)
        // 底部苔藓
        if (y > 100 && hash2d(x, y, seed ^ 0xcc) > 0.62) {
          c = hash2d(x, y, seed ^ 0xcd) > 0.5 ? PAL.mossHi : PAL.moss
        }
        if (y > 118 && hash2d(x, y, seed ^ 0xce) > 0.3) c = mix(PAL.moss, PAL.stoneDark, 0.4)
      }

      // 外轮廓暗边
      const up = y > 0 && outerMask[(y - 1) * w + x]
      const dn = y < h - 1 && outerMask[(y + 1) * w + x]
      const lf = x > 0 && outerMask[y * w + x - 1]
      const rt = x < w - 1 && outerMask[y * w + x + 1]
      if (!up || !dn || !lf || !rt) c = mix(c, PAL.void0, 0.72)

      rect(ctx, x, y, 1, 1, c)
    }
  }

  // 壁炉余烬（3 粒暖光）
  pix(ctx, 40, 110, PAL.warn)
  pix(ctx, 56, 112, mix(PAL.warn, PAL.danger, 0.35))
  pix(ctx, 48, 108, mix(PAL.warn, PAL.void0, 0.25))
}

function drawDoor(ctx, w, h) {
  const seed = 0xd00d
  const ox0 = 4
  const ox1 = 59
  const oy0 = 3
  const ix0 = 15
  const ix1 = 48

  const brokenTop = (x) => {
    const s = Math.round(2 * Math.sin(TAU * 2 * (x / w)))
    const chip = hash2d(x, 1, seed) > 0.78 ? 3 : 0
    return 14 + s + chip
  }

  const inOuter = (x, y) => {
    if (x < ox0 || x > ox1 || y < oy0) return false
    // 四角切边，避免方块感
    if (x < ox0 + 2 && y < oy0 + 2) return false
    if (x > ox1 - 2 && y < oy0 + 2) return false
    return true
  }

  const outerMask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) outerMask[y * w + x] = inOuter(x, y) ? 1 : 0
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!outerMask[i]) continue

      const top = brokenTop(x)
      const inOpening = x >= ix0 && x <= ix1 && y >= top

      let c
      if (inOpening) {
        // ---- 通道内部：纯黑，边缘一线微光 ----
        c = PAL.void0
        const dLeft = x - ix0
        const dRight = ix1 - x
        const dTop = y - top
        const dEdge = Math.min(dLeft, dRight, dTop)
        if (dEdge < 2) {
          if (dTop <= dLeft && dTop <= dRight) c = mix(PAL.void0, PAL.edge, 0.3 - dTop * 0.1)
          else if (dLeft < dRight) c = mix(PAL.void0, PAL.edge, 0.22 - dLeft * 0.08)
          else c = mix(PAL.void0, PAL.stoneDeep, 0.4)
        }
        if (y > h - 4 && hash2d(x, y, seed) > 0.55) c = mix(PAL.void0, PAL.stoneDeep, 0.5)
      } else {
        const n = fbm(x / 9, y / 9, seed, 3)
        const m = hash2d(x, y, seed ^ 0x5b)
        c = PAL.stone
        if (n < 0.44) c = PAL.stoneDark
        if (n < 0.3) c = PAL.stoneDeep
        if (m > 0.91) c = PAL.stoneLit
        else if (m < 0.06) c = PAL.stoneDeep
        // 横向石缝
        if (y > oy0 + 3 && (y - oy0) % 13 === 0) c = mix(c, PAL.stoneDeep, 0.55)
        // 竖向砖缝（两侧立柱）
        if ((x === 10 || x === 53) && y > oy0 + 4) c = mix(c, PAL.stoneDeep, 0.5)
        // 底部苔藓 / 水渍
        if (y > h - 14 && hash2d(x, y, seed ^ 0x31) > 0.66) c = PAL.moss
        else if (y > h - 5 && hash2d(x, y, seed ^ 0x32) > 0.5) c = mix(PAL.moss, PAL.stoneDark, 0.4)
        // 内缘极弱的冷光
        const dIn = Math.min(
          Math.abs(x - ix0),
          Math.abs(x - ix1),
          Math.abs(y - top),
        )
        if (dIn < 2) c = mix(c, PAL.edge, 0.18)
      }

      const up = y > 0 && outerMask[(y - 1) * w + x]
      const dn = y < h - 1 && outerMask[(y + 1) * w + x]
      const lf = x > 0 && outerMask[y * w + x - 1]
      const rt = x < w - 1 && outerMask[y * w + x + 1]
      if (!up || !dn || !lf || !rt) c = mix(c, PAL.void0, 0.7)

      rect(ctx, x, y, 1, 1, c)
    }
  }
}

/* ============================================================================
 * 10. 视差背景（1024×512，横向无缝，上方为透明天空）
 * ========================================================================== */

/** 在画布左右各复制一份形状，保证横向平铺无缝。 */
function wrapXCopy(w, cx, half, draw) {
  draw(cx)
  if (cx - half < 0) draw(cx + w)
  if (cx + half > w) draw(cx - w)
}

function drawBackgroundFar(ctx, w, h) {
  const rng = mulberry32(0x1f2a3b)
  const base = PAL.far
  const dark = PAL.void1
  const deeper = PAL.void0
  const ridgeY = (x) =>
    298 + 36 * Math.sin(TAU * 2 * (x / w) + 1.15) + 17 * Math.sin(TAU * 5 * (x / w) + 2.6)
  const mx = (v) => ((Math.round(v) % w) + w) % w

  // ---- 巨构塔群 ----
  const towers = 15
  for (let i = 0; i < towers; i++) {
    const cx = Math.round((i + 0.28 + rng() * 0.45) * w / towers)
    const tw = Math.round(40 + rng() * 86)
    const top = Math.round(64 + rng() * 246)
    const antenna = rng() > 0.45 ? Math.round(18 + rng() * 46) : 0
    const wseed = (rng() * 0x7fffffff) | 0
    const half = tw / 2 + 10
    const x0 = Math.round(cx - tw / 2)
    const baseBottom = Math.round(ridgeY(cx)) + 34

    wrapXCopy(w, cx, half, (ax0) => {
      // 逐列破损的顶部轮廓
      for (let j = 0; j < tw; j++) {
        const tx = ax0 + j
        const n = hash2d(mx(tx), 7, wseed)
        const notch = n > 0.7 ? Math.round(4 + hash2d(mx(tx), 8, wseed) * 16) : 0
        const ty = top + notch
        rect(ctx, tx, ty, 1, h - ty, base)
      }
      // 侧面暗柱 + 底部沉入阴影
      rect(ctx, ax0, top, 1, h - top, dark)
      rect(ctx, ax0 + tw - 3, top, 2, h - top, dark)
      if (baseBottom < h) rect(ctx, ax0, baseBottom, tw, h - baseBottom, dark)
      // 窗洞
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 3; c++) {
          if (hash2d(c + i * 3, r, wseed + 11) > 0.62) continue
          const wx = ax0 + 6 + c * Math.max(14, Math.floor(tw / 3.2))
          const wy = top + 22 + r * 26
          if (wx + 3 < ax0 + tw - 4 && wy + 7 < h) rect(ctx, wx, wy, 3, 6, dark)
        }
      }
      // 天线 / 断桅
      if (antenna > 0) {
        const ax = ax0 + Math.floor(tw * 0.35)
        const ay = Math.max(0, top - antenna)
        rect(ctx, ax, ay, 1, top - ay, base)
        rect(ctx, ax - 3, ay + 6, 7, 1, base)
        pix(ctx, ax - 1, ay + 2, base)
      }
    })
  }

  // ---- 断裂的横向梁桥 ----
  for (let i = 0; i < 5; i++) {
    const by = Math.round(150 + i * 32 + rng() * 22)
    const len = Math.round(220 + rng() * 460)
    const x = Math.round(rng() * w)
    const th = Math.round(5 + rng() * 9)
    const bseed = (rng() * 0x7fffffff) | 0
    const cx2 = x + len / 2
    wrapXCopy(w, cx2, len / 2 + 8, (ax) => {
      let cursor = 0
      let seg = 0
      while (cursor < len) {
        let segLen = Math.round(len * (0.18 + hash2d(seg, i, bseed) * 0.22))
        if (cursor + segLen > len) segLen = len - cursor
        rect(ctx, ax + cursor, by, segLen, th, base)
        rect(ctx, ax + cursor, by + th - 2, segLen, 2, dark)
        const gap = hash2d(seg, i + 9, bseed) > 0.45 ? Math.round(3 + hash2d(seg, i + 3, bseed) * 12) : 0
        cursor += segLen + gap
        seg++
      }
    })
  }

  // ---- 山体剪影（周期函数 → 天然无缝） ----
  for (let x = 0; x < w; x++) {
    const y = Math.round(ridgeY(x))
    rect(ctx, x, y, 1, h - y, base)
  }
  for (let x = 0; x < w; x++) {
    const y = Math.round(ridgeY(x)) + 34
    rect(ctx, x, y, 1, h - y, dark)
  }
  for (let x = 0; x < w; x++) {
    const y = Math.round(ridgeY(x)) + 120
    if (y < h) rect(ctx, x, y, 1, h - y, deeper)
  }

  // ---- 山脊上的小废墟 ----
  for (let i = 0; i < 10; i++) {
    const cx = Math.round(rng() * w)
    const rw = Math.round(12 + rng() * 26)
    const rh = Math.round(18 + rng() * 52)
    const gy = Math.round(ridgeY(cx)) + 2
    wrapXCopy(w, cx, rw, (ax) => {
      const x0 = Math.round(ax - rw / 2)
      for (let j = 0; j < rw; j++) {
        const tx = x0 + j
        const notch = hash2d(mx(tx), 21, 0x5a5) > 0.72 ? 3 + Math.floor(hash2d(mx(tx), 22, 0x5a5) * 7) : 0
        rect(ctx, tx, gy - rh + notch, 1, rh - notch + 4, base)
      }
      rect(ctx, x0 + rw - 2, gy - rh, 2, rh, dark)
      // 顶部残塔尖
      rect(ctx, x0 + Math.floor(rw / 2), gy - rh - 10, 1, 10, base)
    })
  }
}

function drawBackgroundMid(ctx, w, h) {
  const rng = mulberry32(0x2f4c6a)
  const base = PAL.mid
  const dark = PAL.far
  const hi = mix(PAL.stone, PAL.far, 0.42)
  const deep = PAL.stoneDeep
  const groundY = (x) =>
    414 + 18 * Math.sin(TAU * 2 * (x / w) + 0.35) + 9 * Math.sin(TAU * 6 * (x / w) + 1.9)
  const mx = (v) => ((Math.round(v) % w) + w) % w

  // ---- 地面 ----
  for (let x = 0; x < w; x++) {
    const y = Math.round(groundY(x))
    rect(ctx, x, y, 1, h - y, base)
    const y2 = y + 40
    if (y2 < h) rect(ctx, x, y2, 1, h - y2, dark)
  }
  for (let x = 0; x < w; x += 3) {
    if (hash2d(mx(x), 1, 0x9a) > 0.45) rect(ctx, x, Math.round(groundY(x)), 2, 1, hi)
  }

  // ---- 断裂石柱 ----
  const pillars = 12
  for (let i = 0; i < pillars; i++) {
    const cx = Math.round((i + 0.22 + rng() * 0.5) * w / pillars)
    const pw = Math.round(18 + rng() * 30)
    const topY = Math.round(118 + rng() * 220)
    const broken = 4 + Math.round(rng() * 14)
    const pseed = (rng() * 0x7fffffff) | 0
    const x0 = Math.round(cx - pw / 2)
    const half = pw / 2 + 12
    // 预生成裂缝，避免 wrap 重复抽随机
    const cracks = []
    for (let c = 0; c < 2; c++) {
      cracks.push({
        x: x0 + 4 + Math.round(rng() * (pw - 8)),
        y: topY + 20 + Math.round(rng() * 160),
        len: 5 + Math.round(rng() * 10),
        drift: rng() > 0.5 ? 1 : -1,
      })
    }

    wrapXCopy(w, cx, half, (ax0) => {
      for (let j = 0; j < pw; j++) {
        const tx = ax0 + j
        const notch = hash2d(mx(tx), 3, pseed) > 0.6
          ? Math.round(3 + hash2d(mx(tx), 4, pseed) * broken)
          : 0
        const ty = topY + notch
        rect(ctx, tx, ty, 1, h - ty, base)
        if (hash2d(mx(tx), 5, pseed) > 0.35) rect(ctx, tx, ty, 1, 1, hi)
      }
      rect(ctx, ax0 + pw - 4, topY, 3, h - topY, dark)
      rect(ctx, ax0 + pw - 1, topY, 1, h - topY, deep)
      rect(ctx, ax0, topY, 1, h - topY, mix(base, dark, 0.55))
      // 横向石缝
      for (let y = topY + 16; y < h; y += 22) {
        for (let j = 0; j < pw; j++) {
          if (hash2d(mx(ax0 + j), y, pseed + 21) > 0.25) {
            rect(ctx, ax0 + j, y, 1, 1, mix(base, dark, 0.62))
          }
        }
      }
      // 裂缝
      for (const cr of cracks) {
        const cax = ax0 + (cr.x - x0)
        for (let k = 0; k < cr.len; k++) {
          pix(ctx, cax + (k & 1 ? cr.drift : 0), cr.y + k, mix(base, PAL.void0, 0.55))
        }
      }
    })
  }

  // ---- 横向管道 ----
  const pipeRows = [212, 268, 330, 386]
  for (const py of pipeRows) {
    const pieces = 2 + Math.floor(rng() * 3)
    for (let p = 0; p < pieces; p++) {
      const len = Math.round(140 + rng() * 320)
      const px = Math.round(rng() * w)
      const th = Math.round(7 + rng() * 8)
      const cx2 = px + len / 2
      wrapXCopy(w, cx2, len / 2 + 8, (ax) => {
        rect(ctx, ax, py, len, th, dark)
        rect(ctx, ax, py, len, 2, mix(base, hi, 0.3))
        rect(ctx, ax, py + th - 2, len, 2, PAL.void1)
        // 接头环
        for (let j = 34; j < len - 10; j += 46) {
          rect(ctx, ax + j, py - 2, 5, th + 4, deep)
          rect(ctx, ax + j + 1, py - 1, 1, th + 2, mix(base, hi, 0.35))
        }
        // 断口
        rect(ctx, ax + len - 5, py - 1, 5, 2, dark)
        rect(ctx, ax + len - 5, py + th - 1, 5, 2, dark)
        // 吊架
        rect(ctx, ax + Math.round(len * 0.3), py - 8, 3, 8, mix(base, dark, 0.5))
        rect(ctx, ax + Math.round(len * 0.7), py - 6, 3, 6, mix(base, dark, 0.5))
      })
    }
  }

  // ---- 横跨的 sagging 钢缆（整幅周期函数 → 无缝） ----
  const cableBands = [166, 194, 232]
  for (let ci = 0; ci < cableBands.length; ci++) {
    const cseed = 0x600d + ci
    for (let x = 0; x < w; x++) {
      const y = Math.round(
        cableBands[ci] +
          14 * Math.sin(TAU * 2 * (x / w) + 0.4 + ci) +
          7 * Math.sin(TAU * 5 * (x / w) + 2.2 + ci),
      )
      if (hash2d(mx(x), ci, cseed) > 0.06) pix(ctx, x, y, ci === cableBands.length - 1 ? base : dark)
      if (x % 41 === 0) pix(ctx, x, y + 2, mix(dark, base, 0.4))
    }
  }

  // ---- 顶部垂下的缆绳 ----
  for (let i = 0; i < 12; i++) {
    const cx = Math.round(rng() * w)
    const len = Math.round(90 + rng() * 210)
    const phase = rng() * TAU
    wrapXCopy(w, cx, 6, (ax) => {
      for (let t = 0; t < len; t++) {
        const x = ax + Math.round(Math.sin(t * 0.06 + phase) * 2)
        pix(ctx, x, t, dark)
        if (t % 23 === 0 && t > 8) pix(ctx, x + (t % 46 === 0 ? 1 : -1), t, dark)
      }
    })
  }

  // ---- 地面碎石 / 残骸 ----
  for (let i = 0; i < 22; i++) {
    const cx = Math.round(rng() * w)
    const rw = Math.round(10 + rng() * 26)
    const rh = Math.round(6 + rng() * 16)
    const gy = Math.round(groundY(cx))
    wrapXCopy(w, cx, rw, (ax) => {
      fillEllipse(ctx, ax, gy - rh * 0.2 + 4, rw / 2, rh / 2, mix(base, dark, 0.45))
      fillEllipse(ctx, ax, gy - rh * 0.2 + 2.5, rw / 2, rh / 2, base)
      fillEllipse(ctx, ax + 1, gy - rh * 0.2 + 5, rw / 2 - 1, rh / 2 - 1, mix(base, dark, 0.5))
    })
  }
}

function drawBackgroundNear(ctx, w, h) {
  const rng = mulberry32(0x3c5d7e)
  const base = PAL.void1
  const dark = PAL.void0
  const rim = PAL.near
  const massY = (x) =>
    410 + 15 * Math.sin(TAU * 2 * (x / w) + 2.2) + 8 * Math.sin(TAU * 5 * (x / w) + 0.7)

  // ---- 底部实心岩体 ----
  for (let x = 0; x < w; x++) {
    const y = Math.round(massY(x))
    rect(ctx, x, y, 1, h - y, base)
    const y2 = y + 56
    if (y2 < h) rect(ctx, x, y2, 1, h - y2, dark)
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.round(rng() * w)
    const y = Math.round(massY(x) + rng() * 100)
    if (y < h) rect(ctx, x, y, 2 + Math.round(rng() * 5), 1, dark)
  }

  // ---- 碎石 / 巨砾 ----
  for (let i = 0; i < 20; i++) {
    const cx = Math.round(rng() * w)
    const rw = Math.round(12 + rng() * 34)
    const rh = Math.round(7 + rng() * 18)
    const gy = Math.round(massY(cx)) + 2
    wrapXCopy(w, cx, rw, (ax) => {
      fillEllipse(ctx, ax, gy - rh / 2, rw / 2, rh / 2, rim)
      fillEllipse(ctx, ax, gy - rh / 2 + 1.5, rw / 2 - 1, rh / 2 - 1, dark)
      // 零星高光
      for (let k = 0; k < 4; k++) {
        const px = ax - rw / 2 + hash2d(i, k, 0x71) * rw
        const py = gy - rh + hash2d(i, k, 0x72) * rh * 0.6
        pix(ctx, px, py, rim)
      }
    })
  }

  // ---- 草叶（顶部呈蕾丝状） ----
  const clumps = 84
  for (let i = 0; i < clumps; i++) {
    const cx = Math.round(((i + rng() * 0.9) / clumps) * w)
    const blades = 2 + Math.floor(rng() * 5)
    for (let b = 0; b < blades; b++) {
      const bx = cx + Math.round((rng() - 0.5) * 16)
      const hgt = Math.round(18 + rng() * 94)
      const bend = Math.round((rng() - 0.5) * 18)
      const phase = rng() * TAU
      const baseY = Math.round(massY(bx)) + 2
      wrapXCopy(w, bx, Math.abs(bend) + 8, (ax) => {
        for (let s = 0; s < hgt; s++) {
          const t = s / hgt
          const x = ax + Math.round(Math.sin(t * 2.1 + phase) * (1.5 + Math.abs(bend) * t * 0.18) + bend * t * t)
          const y = baseY - s
          if (y < 0) continue
          let c = base
          if (s > hgt - 3) c = rim
          else if (s > hgt - 10 && (s & 1) === 0) c = mix(base, rim, 0.6)
          pix(ctx, x, y, c)
          if (s < 8) pix(ctx, x - 1, y, base)
        }
      })
    }
  }

  // ---- 顶部垂下的藤蔓 ----
  for (let i = 0; i < 13; i++) {
    const cx = Math.round(rng() * w)
    const len = Math.round(80 + rng() * 230)
    const phase = rng() * TAU
    wrapXCopy(w, cx, 8, (ax) => {
      for (let t = 0; t < len; t++) {
        const x = ax + Math.round(Math.sin(t * 0.045 + phase) * 3)
        pix(ctx, x, t, base)
        if (t % 17 === 0 && t > 12) {
          const dir = t % 34 === 0 ? 1 : -1
          pix(ctx, x + dir, t, mix(base, rim, 0.85))
        }
      }
    })
  }
}

/* ============================================================================
 * 11. 天空 / 光晕 / 雨丝 / 尘点 / 暗角 / 水面 / 噪点
 * ========================================================================== */

function drawSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, PAL.sky0)
  g.addColorStop(0.42, PAL.sky1)
  g.addColorStop(0.64, PAL.sky2)
  g.addColorStop(1, PAL.sky3)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function drawGlow(ctx, w, h) {
  const cx = w / 2
  const cy = h / 2
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2)
  g.addColorStop(0, rgba(PAL.white, 1))
  g.addColorStop(0.16, rgba(PAL.white, 0.92))
  g.addColorStop(0.42, rgba(PAL.white, 0.44))
  g.addColorStop(0.7, rgba(PAL.white, 0.13))
  g.addColorStop(1, rgba(PAL.white, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function drawRain(ctx, w, h) {
  const profile = (t) => {
    if (t < 0.08) return 0.1 + (t / 0.08) * 0.42
    if (t < 0.62) return 0.52 + Math.sin(((t - 0.08) / 0.54) * Math.PI) * 0.4
    return Math.max(0, 0.92 * Math.pow(1 - (t - 0.62) / 0.38, 1.35))
  }
  const center = 3.5
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1)
    const p = profile(t)
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x + 0.5 - center)
      const width = d < 1.5 ? 1 : d < 2.5 ? 0.42 : 0.13
      const a = p * width
      if (a < 0.02) continue
      rect(ctx, x, y, 1, 1, rgba(PAL.rain, a))
    }
  }
  // 中段核心更亮
  for (let y = Math.round(h * 0.18); y < Math.round(h * 0.62); y += 2) {
    pix(ctx, 3, y, rgba(PAL.white, 0.55))
    pix(ctx, 4, y, rgba(PAL.rain, 0.5))
  }
}

function drawDust(ctx, w, h) {
  const cx = w / 2
  const cy = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const a = Math.max(0, 1 - d / 4.3)
      const step = Math.ceil(a * a * 5) / 5
      if (step <= 0) continue
      rect(ctx, x, y, 1, 1, rgba(PAL.white, step * 0.9))
    }
  }
  pix(ctx, Math.floor(cx), Math.floor(cy), rgba(PAL.white, 1))
}

function drawVignette(ctx, w, h) {
  const cx = w / 2
  const cy = h / 2
  const g = ctx.createRadialGradient(cx, cy, 118, cx, cy, 300)
  g.addColorStop(0, rgba(PAL.black, 0))
  g.addColorStop(0.45, rgba(PAL.black, 0.05))
  g.addColorStop(0.7, rgba(PAL.black, 0.28))
  g.addColorStop(0.88, rgba(PAL.black, 0.62))
  g.addColorStop(1, rgba(PAL.black, 0.9))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function drawWater(ctx, w, h) {
  const seed = 0x7a7e
  // 水的底色：上淡下深
  for (let y = 0; y < h; y++) {
    rect(ctx, 0, y, w, 1, rgba(PAL.water, 0.08 + 0.16 * (y / h)))
  }
  // 波纹：x/y 方向都用整数频率 → 双轴无缝
  for (let y = 0; y < h; y++) {
    const v = y / h
    for (let x = 0; x < w; x++) {
      const u = x / w
      const wave =
        Math.sin(TAU * 3 * u + TAU * 2 * v + 0.4) * 0.55 +
        Math.sin(TAU * 5 * u - TAU * 3 * v + 1.7) * 0.3 +
        Math.sin(TAU * 2 * u + TAU * 5 * v + 4.2) * 0.15
      const rowEnv = 0.5 + 0.5 * Math.sin(TAU * 7 * v + wave * 1.2)
      const crest = wave * (0.35 + 0.65 * rowEnv)
      const grain = hash2d(x, y, seed)
      if (crest > 0.82) {
        rect(ctx, x, y, 1, 1, rgba(PAL.waterFoam, 0.3 + 0.28 * crest))
      } else if (crest > 0.58 && grain > 0.25) {
        rect(ctx, x, y, 1, 1, rgba(PAL.waterHi, 0.22 + 0.26 * crest))
      } else if (wave < -0.55 && grain > 0.55) {
        rect(ctx, x, y, 1, 1, rgba(PAL.waterDeep, 0.24))
      }
      // 零星亮点（水面泡沫）
      if (crest > 0.95 && hash2d(x, y, seed + 7) > 0.94) {
        rect(ctx, x, y, 1, 1, rgba(PAL.white, 0.4))
      }
    }
  }
}

function drawNoise(ctx, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash2d(x, y, 0x51ed)
      const n2 = hash2d(x, y, 0x9a1b)
      const t = 0.35 + 0.3 * n + 0.1 * (n2 - 0.5)
      rect(ctx, x, y, 1, 1, mix(PAL.stoneDeep, PAL.stone, t))
    }
  }
}

/* ============================================================================
 * 12. 缓存与对外 getter
 * ========================================================================== */

const CACHE = {
  slugcat: null,
  lizard: null,
  fruit: null,
  batfly: null,
  rock: null,
  tiles: null,
  shelter: null,
  door: null,
  background: null,
  sky: null,
  glow: null,
  rain: null,
  dust: null,
  vignette: null,
  water: null,
  noise: null,
}

let built = false

function slugcatTexture(w, h, pose) {
  return makeTexture(w, h, (ctx) => drawSlugcatPose(ctx, w, h, pose), {
    ...SPRITE_OPTS,
    anchor: 'bottom-center',
  })
}

export function getSlugcatTextures() {
  if (CACHE.slugcat) return CACHE.slugcat
  CACHE.slugcat = {
    idle: [slugcatTexture(44, 40, slugIdlePose(0)), slugcatTexture(44, 40, slugIdlePose(1))],
    run: [0, 1, 2, 3, 4, 5].map((f) => slugcatTexture(44, 40, slugRunPose(f))),
    jump: slugcatTexture(44, 40, slugJumpPose()),
    fall: slugcatTexture(44, 40, slugFallPose()),
    land: slugcatTexture(44, 40, slugLandPose()),
    crouch: slugcatTexture(44, 28, slugCrouchPose()),
    swim: [0, 1, 2].map((f) => slugcatTexture(44, 32, slugSwimPose(f))),
    climb: [0, 1].map((f) => slugcatTexture(44, 40, slugClimbPose(f))),
    sleep: slugcatTexture(44, 40, slugSleepPose()),
  }
  return CACHE.slugcat
}

export function getLizardTextures() {
  if (CACHE.lizard) return CACHE.lizard
  CACHE.lizard = {
    body: makeTexture(96, 32, drawLizardBody, { wrap: 'repeat', anchor: 'center-left' }),
    head: makeTexture(44, 30, (ctx) => drawLizardHead(ctx, false), {
      ...SPRITE_OPTS,
      anchor: 'center-right',
    }),
    headOpen: makeTexture(44, 30, (ctx) => drawLizardHead(ctx, true), {
      ...SPRITE_OPTS,
      anchor: 'center-right',
    }),
    eye: makeTexture(16, 16, drawLizardEyeTexture, { wrap: 'clamp', anchor: 'center' }),
    claw: makeTexture(12, 10, (ctx) => drawLizardClaw(ctx, 12, 10), {
      ...SPRITE_OPTS,
      anchor: 'bottom-left',
    }),
  }
  return CACHE.lizard
}

export function getFruitTextures() {
  if (CACHE.fruit) return CACHE.fruit
  CACHE.fruit = [0, 1, 2, 3].map((f) =>
    makeTexture(16, 16, (ctx) => drawFruit(ctx, 16, 16, f), { wrap: 'clamp', anchor: 'center' }),
  )
  return CACHE.fruit
}

export function getBatflyTextures() {
  if (CACHE.batfly) return CACHE.batfly
  CACHE.batfly = [0, 1, 2].map((f) =>
    makeTexture(14, 10, (ctx) => drawBatfly(ctx, 14, 10, f), { wrap: 'clamp', anchor: 'center' }),
  )
  return CACHE.batfly
}

export function getRockTexture() {
  if (CACHE.rock) return CACHE.rock
  CACHE.rock = makeTexture(16, 12, (ctx) => drawRock(ctx, 16, 12), {
    wrap: 'clamp',
    anchor: 'bottom-center',
  })
  return CACHE.rock
}

export function getTileTextures() {
  if (CACHE.tiles) return CACHE.tiles
  const fill = [0, 1, 2].map((i) =>
    makeTexture(32, 32, (ctx) => drawStoneTile(ctx, 32, 0x1000 + i * 977, i), {
      ...TILE_OPTS,
      anchor: 'tile',
    }),
  )
  const top = [0, 1, 2].map((i) =>
    makeTexture(
      32,
      32,
      (ctx) => {
        drawStoneTile(ctx, 32, 0x2000 + i * 977, i)
        drawMossTop(ctx, 32, 0x3000 + i * 613)
      },
      { wrap: 'repeat', anchor: 'tile-top' },
    ),
  )
  const platform = makeTexture(32, 12, (ctx) => drawPlatform(ctx, 32, 12), {
    wrapS: 'repeat',
    wrapT: 'clamp',
    anchor: 'tile',
  })
  const pole = makeTexture(8, 32, (ctx) => drawPole(ctx, 8, 32), {
    wrapS: 'clamp',
    wrapT: 'repeat',
    anchor: 'tile',
  })
  CACHE.tiles = { fill, top, platform, pole }
  return CACHE.tiles
}

export function getShelterTexture() {
  if (CACHE.shelter) return CACHE.shelter
  CACHE.shelter = makeTexture(96, 128, (ctx) => drawShelter(ctx, 96, 128), {
    wrap: 'clamp',
    anchor: 'bottom-center',
  })
  return CACHE.shelter
}

export function getDoorTexture() {
  if (CACHE.door) return CACHE.door
  CACHE.door = makeTexture(64, 96, (ctx) => drawDoor(ctx, 64, 96), {
    wrap: 'clamp',
    anchor: 'bottom-center',
  })
  return CACHE.door
}

export function getBackgroundTextures() {
  if (CACHE.background) return CACHE.background
  CACHE.background = {
    far: makeTexture(1024, 512, drawBackgroundFar, {
      wrapS: 'repeat',
      wrapT: 'clamp',
      anchor: 'bottom',
    }),
    mid: makeTexture(1024, 512, drawBackgroundMid, {
      wrapS: 'repeat',
      wrapT: 'clamp',
      anchor: 'bottom',
    }),
    near: makeTexture(1024, 512, drawBackgroundNear, {
      wrapS: 'repeat',
      wrapT: 'clamp',
      anchor: 'bottom',
    }),
  }
  return CACHE.background
}

export function getSkyTexture() {
  if (CACHE.sky) return CACHE.sky
  CACHE.sky = makeTexture(256, 256, drawSky, { wrap: 'clamp', anchor: 'stretch' })
  return CACHE.sky
}

export function getGlowTexture() {
  if (CACHE.glow) return CACHE.glow
  CACHE.glow = makeTexture(128, 128, drawGlow, { wrap: 'clamp', anchor: 'center' })
  return CACHE.glow
}

export function getRainTexture() {
  if (CACHE.rain) return CACHE.rain
  CACHE.rain = makeTexture(8, 64, drawRain, { wrap: 'clamp', anchor: 'top' })
  return CACHE.rain
}

export function getDustTexture() {
  if (CACHE.dust) return CACHE.dust
  CACHE.dust = makeTexture(8, 8, drawDust, { wrap: 'clamp', anchor: 'center' })
  return CACHE.dust
}

export function getVignetteTexture() {
  if (CACHE.vignette) return CACHE.vignette
  CACHE.vignette = makeTexture(512, 288, drawVignette, { wrap: 'clamp', anchor: 'stretch' })
  return CACHE.vignette
}

export function getWaterTexture() {
  if (CACHE.water) return CACHE.water
  CACHE.water = makeTexture(128, 128, drawWater, { wrap: 'repeat', anchor: 'tile' })
  return CACHE.water
}

export function getNoiseTexture() {
  if (CACHE.noise) return CACHE.noise
  CACHE.noise = makeTexture(128, 128, drawNoise, { wrap: 'repeat', anchor: 'tile' })
  return CACHE.noise
}

/**
 * 一次性构建全部纹理并写入缓存。重复调用是空操作。
 * 每个 getter 自身也带缓存，因此这里只是预热（避免首次出现卡顿）。
 */
export function preloadTextures() {
  if (built) return
  getSkyTexture()
  getGlowTexture()
  getBackgroundTextures()
  getTileTextures()
  getSlugcatTextures()
  getLizardTextures()
  getFruitTextures()
  getBatflyTextures()
  getRockTexture()
  getShelterTexture()
  getDoorTexture()
  getRainTexture()
  getDustTexture()
  getVignetteTexture()
  getWaterTexture()
  getNoiseTexture()
  built = true
}
