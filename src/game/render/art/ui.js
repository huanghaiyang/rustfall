// ============================================================================
// 锈雨 · RUSTFALL —— UI 像素美术（Canvas2D → THREE.CanvasTexture）
//
// 全部程序化：无外部图片/字体资源；随机来自 render/rng.js（mulberry32 / hash2）。
// 统一：NearestFilter（mag/min）、generateMipmaps=false、SRGBColorSpace、
//      needsUpdate=true；除注明外均为 ClampToEdgeWrapping。
//
// 尺寸 / 用途 / 锚点：
//   logo            512×160  透明底；标题「锈雨」+ 英文 RUSTFALL + 扫描线/锈蚀
//   panelCorner     32×32    'tl'|'tr'|'bl'|'br'，四角镜像的金属包角，透明底
//   statIcon        20×20    透明底，墨黑描边保证暗底可读
//   weatherIcon     24×24    透明底（calm / warning / storm）
//   cursor          16×16    透明底；热点 userData.hotspot = [1,1]
//   scanline        4×64     可平铺（双轴 Repeat），叠加用
//   noiseOverlay    128×128  可平铺胶片噪点（双轴 Repeat）
//   minimapTile     12×12    透明底地图格
//   loadScreen      640×360  不透明载入图（天空/远景/雨/大标题/提示）
//   chapterCard     512×128  透明底章节卡，text 参与绘制（按 text 缓存）
//   portraitFrame   112×112  透明中心（8px 边框，中心用 clearRect 挖空）
//   dialogueFrame   512×96   对话框底纹；左右 32px 为端盖，中段周期 32 → 可平铺；
//                            wrapS=Repeat / wrapT=Clamp（九宫格拉伸用）
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32, hash2 } from '../../render/rng.js'

const TAU = Math.PI * 2

/* ============================================================================
 * 1. 颜色工具（只在 PAL 内混色，不引入新色相）
 * ========================================================================== */

const HEX_CACHE = new Map()
const MIX_CACHE = new Map()

function hexToRgb(hex) {
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

function rgba(hex, a) {
  const c = hexToRgb(hex)
  const al = Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')'
}

function mix(a, b, t) {
  const k = Math.round(Math.max(0, Math.min(1, t)) * 1000)
  const key = a + '|' + b + '|' + k
  const hit = MIX_CACHE.get(key)
  if (hit) return hit
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  const f = k / 1000
  const out =
    '#' +
    (
      (1 << 24) |
      (Math.round(A[0] + (B[0] - A[0]) * f) << 16) |
      (Math.round(A[1] + (B[1] - A[1]) * f) << 8) |
      Math.round(A[2] + (B[2] - A[2]) * f)
    )
      .toString(16)
      .slice(1)
  MIX_CACHE.set(key, out)
  return out
}

function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* ============================================================================
 * 2. 纹理工厂
 * ========================================================================== */

const REPEAT = THREE.RepeatWrapping
const CLAMP = THREE.ClampToEdgeWrapping

function makeTex(w, h, draw, opts = {}) {
  const cw = Math.max(1, Math.round(w))
  const ch = Math.max(1, Math.round(h))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    draw(ctx, cw, ch)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  const base = opts.wrap === 'repeat' ? REPEAT : CLAMP
  tex.wrapS = opts.wrapS === 'repeat' ? REPEAT : opts.wrapS === 'clamp' ? CLAMP : base
  tex.wrapT = opts.wrapT === 'repeat' ? REPEAT : opts.wrapT === 'clamp' ? CLAMP : base
  tex.needsUpdate = true
  if (opts.anchor) tex.userData.anchor = opts.anchor
  tex.userData.size = [cw, ch]
  return tex
}

/* ============================================================================
 * 3. 像素原语 / 形状（硬边、无抗锯齿）
 * ========================================================================== */

function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function pix(ctx, x, y, color) {
  rect(ctx, x, y, 1, 1, color)
}

function line(ctx, x0, y0, x1, y1, color, thick = 1) {
  const ax = Math.round(x0)
  const ay = Math.round(y0)
  const bx = Math.round(x1)
  const by = Math.round(y1)
  const dx = bx - ax
  const dy = by - ay
  const steps = Math.max(1, Math.abs(dx), Math.abs(dy))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    rect(ctx, ax + dx * t, ay + dy * t, thick, thick, color)
  }
}

function arc(ctx, cx, cy, r, a0, a1, color, thick = 1, dash = 0) {
  const steps = Math.max(10, Math.ceil(Math.abs(a1 - a0) * r * 1.7))
  for (let i = 0; i <= steps; i++) {
    if (dash > 0 && i % dash === 0) continue
    const a = a0 + ((a1 - a0) * i) / steps
    rect(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, thick, thick, color)
  }
}

function rivet(ctx, x, y, color = PAL.steelWhite) {
  rect(ctx, x, y, 2, 2, color)
  pix(ctx, x + 1, y + 1, PAL.steelDark)
}

function predRect(x0, y0, x1, y1) {
  return (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1
}

function predEllipse(cx, cy, rx, ry) {
  return (x, y) => {
    const dx = (x + 0.5 - cx) / rx
    const dy = (y + 0.5 - cy) / ry
    return dx * dx + dy * dy <= 1
  }
}

function predSpans(spans, y0) {
  return (x, y) => {
    const s = spans[y - y0]
    return !!s && x >= s[0] && x <= s[1]
  }
}

function predRoundRect(x0, y0, x1, y1, r) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const nx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x
    const ny = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y
    const dx = x - nx
    const dy = y - ny
    return dx * dx + dy * dy <= r * r + 0.001 || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r)
  }
}

function predUnion(...preds) {
  return (x, y) => preds.some((p) => p(x, y))
}

function predPoly(pts) {
  return (x, y) => {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0]
      const yi = pts[i][1]
      const xj = pts[j][0]
      const yj = pts[j][1]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
}

/** 画一个带 1px 深色描边的实心形状（描边占用形状最外圈像素）。 */
function drawShape(ctx, w, h, pred, fill, edge) {
  const inside = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (pred(x, y)) inside[y * w + x] = 1
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue
      const border =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        !inside[y * w + x - 1] ||
        !inside[y * w + x + 1] ||
        !inside[(y - 1) * w + x] ||
        !inside[(y + 1) * w + x]
      rect(ctx, x, y, 1, 1, border ? edge : fill)
    }
  }
}

/** 只在指定包围盒内做带描边的形状（画小圆/碎块时避免全画布扫描）。 */
function drawShapeBox(ctx, x0, y0, x1, y1, pred, fill, edge) {
  const W = Math.max(0, Math.floor(x1) - Math.floor(x0) + 1)
  const H = Math.max(0, Math.floor(y1) - Math.floor(y0) + 1)
  if (!W || !H) return
  const ox = Math.floor(x0)
  const oy = Math.floor(y0)
  const inside = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (pred(ox + x, oy + y)) inside[y * W + x] = 1
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside[y * W + x]) continue
      const border =
        x === 0 ||
        y === 0 ||
        x === W - 1 ||
        y === H - 1 ||
        !inside[y * W + x - 1] ||
        !inside[y * W + x + 1] ||
        !inside[(y - 1) * W + x] ||
        !inside[(y + 1) * W + x]
      rect(ctx, ox + x, oy + y, 1, 1, border ? edge : fill)
    }
  }
}

/** 带描边的像素椭圆（自动计算包围盒）。 */
function disc(ctx, cx, cy, rx, ry, fill, edge) {
  drawShapeBox(
    ctx,
    Math.floor(cx - rx - 1),
    Math.floor(cy - ry - 1),
    Math.ceil(cx + rx + 1),
    Math.ceil(cy + ry + 1),
    predEllipse(cx, cy, rx, ry),
    fill,
    edge,
  )
}

/** 抖动实心圆（烟团/光晕散点用）。 */
function ditherDisc(ctx, cx, cy, r, color, seed, threshold = 0.35) {
  const x0 = Math.floor(cx - r)
  const x1 = Math.ceil(cx + r)
  const y0 = Math.floor(cy - r)
  const y1 = Math.ceil(cy + r)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy > r * r) continue
      if (hash2(x, y, seed) < threshold) continue
      rect(ctx, x, y, 1, 1, color)
    }
  }
}

/* ============================================================================
 * 4. 文本工具（中文为主；始终整数坐标 + 暗色描边保证可读）
 * ========================================================================== */

const FONT_CN =
  '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",sans-serif'
const FONT_MONO = '"Consolas","Courier New","Lucida Console",monospace'

function setFont(ctx, size, bold, mono) {
  const s = Math.max(8, Math.round(size))
  ctx.font = (bold ? 'bold ' : '') + s + 'px ' + (mono ? FONT_MONO : FONT_CN)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
}

function measure(ctx, text, size, bold = true, mono = false) {
  setFont(ctx, size, bold, mono)
  return ctx.measureText(text).width
}

function drawText(ctx, text, x, y, size, fill, cfg = {}) {
  const bold = cfg.bold !== false
  const mono = !!cfg.mono
  setFont(ctx, size, bold, mono)
  const width = ctx.measureText(text).width
  const ax = cfg.align === 'center' ? x - width / 2 : cfg.align === 'right' ? x - width : x
  ctx.globalAlpha = cfg.alpha === undefined ? 1 : cfg.alpha
  if (cfg.outline) {
    ctx.strokeStyle = cfg.outline
    ctx.lineWidth = cfg.outlineWidth || 3
    ctx.lineJoin = 'miter'
    ctx.miterLimit = 2
    ctx.strokeText(text, ax, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(text, ax, y)
  ctx.globalAlpha = 1
  return width
}

function drawSpaced(ctx, text, x, y, size, fill, cfg = {}) {
  const chars = Array.from(text)
  const spacing = cfg.spacing || 0
  const bold = cfg.bold !== false
  const mono = !!cfg.mono
  setFont(ctx, size, bold, mono)
  const widths = chars.map((ch) => ctx.measureText(ch).width)
  let total = 0
  for (let i = 0; i < widths.length; i++) total += widths[i] + (i < widths.length - 1 ? spacing : 0)
  let ax = cfg.align === 'center' ? x - total / 2 : cfg.align === 'right' ? x - total : x
  ctx.globalAlpha = cfg.alpha === undefined ? 1 : cfg.alpha
  for (let i = 0; i < chars.length; i++) {
    if (cfg.outline) {
      ctx.strokeStyle = cfg.outline
      ctx.lineWidth = cfg.outlineWidth || 3
      ctx.strokeText(chars[i], ax, y)
    }
    ctx.fillStyle = fill
    ctx.fillText(chars[i], ax, y)
    ax += widths[i] + spacing
  }
  ctx.globalAlpha = 1
  return total
}

function fitSize(ctx, text, size, maxWidth, minSize = 14, bold = true, mono = false) {
  let s = size
  while (s > minSize) {
    setFont(ctx, s, bold, mono)
    if (ctx.measureText(text).width <= maxWidth) break
    s -= 1
  }
  return s
}

/* ============================================================================
 * 5. Logo（512×160，透明底，金属锈蚀标题）
 * ========================================================================== */

let logoCache = null

export function getLogoTexture() {
  if (logoCache) return logoCache
  logoCache = makeTex(
    512,
    160,
    (ctx, W, H) => {
      // 独立图层：之后用 source-atop 只在字形上做扫描线/锈蚀/裂纹
      const layer = document.createElement('canvas')
      layer.width = W
      layer.height = H
      const L = layer.getContext('2d')
      L.imageSmoothingEnabled = false

      // 标题背后的一线金属分隔
      rect(L, 92, 104, 328, 2, PAL.steelDark)
      rect(L, 92, 104, 328, 1, PAL.steelLight)
      rect(L, 92, 106, 328, 1, PAL.black)
      rect(L, 88, 102, 4, 6, PAL.steelDark)
      rect(L, 420, 102, 4, 6, PAL.steelDark)
      rivet(L, 89, 103)
      rivet(L, 421, 103)

      // 主标题：竖直线性渐变模拟锈蚀金属
      const titleGrad = L.createLinearGradient(0, 22, 0, 110)
      titleGrad.addColorStop(0, PAL.rustHot)
      titleGrad.addColorStop(0.32, PAL.rustLight)
      titleGrad.addColorStop(0.68, PAL.rust)
      titleGrad.addColorStop(1, PAL.rustDark)

      drawText(L, '锈雨', 258, 64, 84, rgba(PAL.oil, 0.85), {
        align: 'center',
        alpha: 0.85,
      })
      drawSpaced(L, '锈雨', 258, 58, 84, titleGrad, {
        align: 'center',
        bold: true,
        spacing: 14,
        outline: PAL.rustDeep,
        outlineWidth: 7,
      })

      // 英文副标（字距拉开）
      drawSpaced(L, 'RUSTFALL', 256, 126, 23, PAL.steelLight, {
        align: 'center',
        bold: true,
        mono: true,
        spacing: 10,
        outline: PAL.oil,
        outlineWidth: 4,
      })

      // 电子小灯（UI 霓虹只用于电子件）
      rect(L, 148, 123, 12, 3, PAL.black)
      rect(L, 149, 124, 10, 1, PAL.neonWarm)
      rect(L, 352, 123, 12, 3, PAL.black)
      rect(L, 353, 124, 10, 1, PAL.neonWarm)

      // 中文副题
      drawSpaced(L, '废土拾荒 · 循环生存', 256, 148, 12, rgba(PAL.bone, 0.88), {
        align: 'center',
        bold: false,
        spacing: 2,
        outline: rgba(PAL.oil, 0.95),
        outlineWidth: 2,
      })

      // ---- 只在已有像素上叠加：扫描线 / 金属光泽 / 锈斑 / 裂纹 ----
      L.globalCompositeOperation = 'source-atop'
      for (let y = 0; y < H; y += 3) {
        L.fillStyle = rgba(PAL.black, 0.16)
        L.fillRect(0, y, W, 1)
      }
      const sheen = L.createLinearGradient(0, 8, 0, 96)
      sheen.addColorStop(0, rgba(PAL.steelWhite, 0.24))
      sheen.addColorStop(0.45, rgba(PAL.steelWhite, 0.03))
      sheen.addColorStop(1, rgba(PAL.black, 0.22))
      L.fillStyle = sheen
      L.fillRect(0, 0, W, H)

      const rng = mulberry32(0x51a7)
      for (let i = 0; i < 320; i++) {
        const x = Math.floor(rng() * W)
        const y = Math.floor(rng() * H)
        const pick = rng()
        const c = pick < 0.55 ? rgba(PAL.rustDeep, 0.5) : pick < 0.85 ? rgba(PAL.rustLight, 0.34) : rgba(PAL.ochre, 0.4)
        L.fillStyle = c
        L.fillRect(x, y, rng() < 0.22 ? 2 : 1, 1)
      }
      // 裂纹（斜向锯齿）
      for (let i = 0; i < 5; i++) {
        let x = 120 + rng() * 280
        let y = 20 + rng() * 30
        const steps = 6 + Math.floor(rng() * 6)
        for (let s = 0; s < steps; s++) {
          const nx = x + (rng() - 0.5) * 16
          const ny = y + 6 + rng() * 8
          L.fillStyle = rgba(PAL.rustDeep, 0.55)
          L.fillRect(Math.round(x), Math.round(y), 1, 1)
          const len = Math.max(1, Math.round(Math.hypot(nx - x, ny - y)))
          for (let k = 1; k <= len; k++) {
            L.fillRect(Math.round(x + ((nx - x) * k) / len), Math.round(y + ((ny - y) * k) / len), 1, 1)
          }
          x = nx
          y = ny
        }
      }
      L.globalCompositeOperation = 'source-over'

      ctx.drawImage(layer, 0, 0)
    },
    { wrap: 'clamp', anchor: 'center' },
  )
  return logoCache
}

/* ============================================================================
 * 6. 面板金属包角（32×32，四角镜像）
 * ========================================================================== */

const cornerCache = new Map()

function drawCorner(ctx, w, h, kind) {
  const fx = kind === 'tr' || kind === 'br'
  const fy = kind === 'bl' || kind === 'br'
  const R = (x, y, ww, hh, c) => rect(ctx, fx ? w - x - ww : x, fy ? h - y - hh : y, ww, hh, c)
  const P = (x, y, c) => R(x, y, 1, 1, c)

  // 外描边
  R(1, 1, 29, 2, PAL.black)
  R(1, 1, 2, 29, PAL.black)
  // 钢带主体（约 12px 厚）
  R(2, 3, 27, 10, PAL.steel)
  R(3, 2, 10, 27, PAL.steel)
  // 外缘亮边
  R(2, 3, 27, 2, PAL.steelLight)
  R(3, 2, 2, 27, PAL.steelLight)
  R(2, 3, 27, 1, PAL.steelWhite)
  R(3, 2, 1, 27, PAL.steelWhite)
  // 内侧阴影
  R(2, 12, 27, 2, PAL.steelDark)
  R(12, 2, 2, 27, PAL.steelDark)
  R(3, 13, 26, 1, PAL.black)
  R(13, 3, 1, 26, PAL.black)
  // 内角倒角
  R(12, 12, 3, 1, PAL.steelDark)
  R(12, 13, 2, 1, PAL.steelDark)
  R(13, 14, 1, 1, PAL.steelDark)

  // 端头板
  R(26, 2, 4, 13, PAL.black)
  R(27, 3, 3, 11, PAL.steelDark)
  R(27, 3, 3, 1, PAL.steelLight)
  R(2, 26, 13, 4, PAL.black)
  R(3, 27, 11, 3, PAL.steelDark)
  R(3, 27, 1, 3, PAL.steelLight)

  // 拉丝
  for (let i = 0; i < 22; i++) {
    const x = 3 + Math.floor(hash2(i, 1, 0x2c) * 23)
    const y = 4 + Math.floor(hash2(i, 2, 0x2c) * 7)
    P(x, y, hash2(i, 3, 0x2c) > 0.5 ? PAL.steelDark : PAL.steelLight)
  }
  // 锈蚀（镜像）
  const rng = mulberry32(0x33aa)
  for (let i = 0; i < 24; i++) {
    const x = 3 + Math.floor(rng() * 23)
    const y = 4 + Math.floor(rng() * 7)
    P(x, y, rng() < 0.55 ? PAL.rust : PAL.ochre)
  }
  for (let i = 0; i < 14; i++) {
    const x = 4 + Math.floor(rng() * 7)
    const y = 3 + Math.floor(rng() * 23)
    P(x, y, rng() < 0.55 ? PAL.rust : PAL.rustDark)
  }

  // 铆钉
  R(5, 5, 3, 3, PAL.steelWhite)
  P(6, 6, PAL.steelDark)
  P(5, 6, PAL.steel)
  R(18, 4, 2, 2, PAL.steelLight)
  P(19, 5, PAL.steelDark)
  R(4, 18, 2, 2, PAL.steelLight)
  P(5, 19, PAL.steelDark)

  // 电子指示灯
  R(20, 7, 5, 4, PAL.black)
  R(21, 8, 3, 2, PAL.neonWarm)
  P(21, 8, PAL.bone)

  // 冲压缺口
  R(1, 14, 2, 1, PAL.black)
  R(14, 1, 1, 2, PAL.black)
}

export function getPanelCorner(kind) {
  const k = kind === 'tr' || kind === 'bl' || kind === 'br' ? kind : 'tl'
  if (!cornerCache.has(k)) {
    cornerCache.set(
      k,
      makeTex(32, 32, (ctx, w, h) => drawCorner(ctx, w, h, k), { wrap: 'clamp', anchor: 'corner' }),
    )
  }
  return cornerCache.get(k)
}

/* ============================================================================
 * 7. 状态图标（20×20，15 种）
 * ========================================================================== */

function iconHp(ctx) {
  const spans = [
    [6, 13], [5, 14], [4, 15], [4, 15], [5, 14], [5, 14], [5, 14], [5, 14],
    [5, 14], [6, 13], [6, 13], [7, 12], [7, 12], [8, 11], [9, 10], [9, 10],
  ]
  drawShape(ctx, 20, 20, predSpans(spans, 2), PAL.steel, PAL.black)
  rect(ctx, 6, 3, 7, 1, PAL.steelLight)
  rect(ctx, 5, 4, 1, 1, PAL.steelLight)
  rect(ctx, 9, 5, 2, 7, PAL.danger)
  rect(ctx, 6, 7, 8, 2, PAL.danger)
  rect(ctx, 9, 7, 2, 2, PAL.rustLight)
  pix(ctx, 9, 6, PAL.bone)
  rect(ctx, 9, 15, 2, 1, PAL.steelDark)
}

function iconEnergy(ctx) {
  const spans = [
    [10, 13], [9, 13], [8, 12], [7, 11], [10, 14], [9, 13], [8, 12], [7, 11],
    [6, 10], [9, 13], [8, 12], [7, 11], [6, 10], [5, 9], [4, 8], [3, 7],
  ]
  drawShape(ctx, 20, 20, predSpans(spans, 2), PAL.neonWarm, PAL.rustDeep)
  rect(ctx, 10, 2, 2, 2, PAL.white)
  pix(ctx, 9, 3, PAL.bone)
  pix(ctx, 12, 5, PAL.rustLight)
  pix(ctx, 8, 7, PAL.rustLight)
  pix(ctx, 11, 8, PAL.warn)
  pix(ctx, 5, 11, PAL.rustLight)
  pix(ctx, 7, 14, PAL.rustLight)
}

function iconPower(ctx) {
  drawShape(ctx, 20, 20, predUnion(predRect(5, 5, 14, 16), predRect(8, 3, 11, 4)), PAL.steelBlue, PAL.black)
  rect(ctx, 6, 5, 8, 1, PAL.steelLight)
  rect(ctx, 10, 3, 2, 2, PAL.neonWarm)
  rect(ctx, 7, 7, 6, 2, PAL.toxicGlow)
  rect(ctx, 7, 10, 6, 2, PAL.toxic)
  rect(ctx, 7, 13, 4, 2, PAL.toxicDark)
  rect(ctx, 6, 16, 8, 1, PAL.steelDark)
  pix(ctx, 13, 15, PAL.rust)
  pix(ctx, 6, 8, PAL.steelWhite)
}

function iconSignal(ctx) {
  for (let r = 10; r >= 4; r -= 3) {
    const a = 0.16 + (10 - r) * 0.2
    arc(ctx, 10, 13, r, -Math.PI * 0.86, -Math.PI * 0.14, rgba(PAL.signal, a), 1, 2)
  }
  drawShape(
    ctx,
    20,
    20,
    predUnion(predRect(9, 8, 10, 16), predRect(7, 17, 12, 17)),
    PAL.steelLight,
    PAL.black,
  )
  rect(ctx, 9, 8, 1, 8, PAL.steelWhite)
  rect(ctx, 9, 4, 2, 4, PAL.neonWarm)
  pix(ctx, 9, 3, PAL.bone)
  pix(ctx, 10, 3, PAL.white)
}

function iconSpeed(ctx) {
  for (let i = 0; i < 3; i++) rect(ctx, 2, 7 + i * 3, 2, 1, rgba(PAL.steelLight, 0.65))
  const chev = (x0, color) => {
    line(ctx, x0, 5, x0 + 5, 10, PAL.black, 3)
    line(ctx, x0 + 5, 10, x0, 15, PAL.black, 3)
    line(ctx, x0, 5, x0 + 5, 10, color, 2)
    line(ctx, x0 + 5, 10, x0, 15, color, 2)
  }
  chev(6, PAL.sand)
  chev(11, PAL.rustLight)
  pix(ctx, 7, 6, PAL.bone)
  pix(ctx, 12, 6, PAL.bone)
}

function iconJump(ctx) {
  const head = [
    [9, 10], [8, 11], [7, 12], [6, 13], [6, 13],
  ]
  drawShape(
    ctx,
    20,
    20,
    predUnion(predSpans(head, 3), predRect(9, 8, 10, 15), predRect(5, 16, 14, 17)),
    PAL.steelLight,
    PAL.black,
  )
  rect(ctx, 9, 4, 2, 8, PAL.steelWhite)
  rect(ctx, 6, 16, 9, 1, PAL.steelDark)
  rect(ctx, 7, 5, 1, 1, PAL.bone)
  pix(ctx, 9, 3, PAL.bone)
  rect(ctx, 3, 9, 1, 4, rgba(PAL.steelLight, 0.7))
  rect(ctx, 16, 9, 1, 4, rgba(PAL.steelLight, 0.7))
}

function iconDig(ctx) {
  drawShape(ctx, 20, 20, predRect(9, 4, 10, 10), PAL.sand, PAL.black)
  drawShape(ctx, 20, 20, predRect(7, 3, 12, 4), PAL.rustLight, PAL.black)
  const blade = [
    [7, 12], [6, 13], [5, 14], [5, 14], [5, 14], [6, 13], [7, 12],
  ]
  drawShape(ctx, 20, 20, predSpans(blade, 11), PAL.steelLight, PAL.black)
  rect(ctx, 6, 11, 7, 1, PAL.steelWhite)
  pix(ctx, 5, 14, PAL.steel)
  pix(ctx, 14, 14, PAL.steel)
  pix(ctx, 3, 16, PAL.ochre)
  pix(ctx, 16, 13, PAL.ochre)
  pix(ctx, 15, 17, PAL.dustLight)
  pix(ctx, 4, 12, PAL.dust)
}

function iconCarry(ctx) {
  drawShape(ctx, 20, 20, predRect(4, 6, 15, 17), PAL.ochre, PAL.black)
  rect(ctx, 4, 6, 12, 2, PAL.rustLight)
  rect(ctx, 5, 11, 10, 2, PAL.steel)
  rect(ctx, 9, 6, 2, 12, PAL.steelLight)
  rivet(ctx, 6, 8, PAL.steelWhite)
  rivet(ctx, 13, 8, PAL.steelWhite)
  rivet(ctx, 6, 15, PAL.steelWhite)
  rivet(ctx, 13, 15, PAL.steelWhite)
  rect(ctx, 4, 16, 12, 1, PAL.rustDark)
}

function iconAttack(ctx) {
  const slashes = [
    [3, 16, 11, 4],
    [7, 17, 15, 5],
    [11, 17, 18, 8],
  ]
  for (const s of slashes) {
    line(ctx, s[0], s[1], s[2], s[3], PAL.black, 3)
    line(ctx, s[0], s[1], s[2], s[3], PAL.danger, 1)
  }
  // 刃口反光
  line(ctx, 5, 14, 10, 6, PAL.rustLight, 1)
  line(ctx, 9, 15, 14, 7, PAL.rustLight, 1)
  line(ctx, 13, 15, 17, 9, PAL.rustLight, 1)
  pix(ctx, 11, 4, PAL.bone)
  pix(ctx, 15, 5, PAL.bone)
  pix(ctx, 18, 8, PAL.bone)
}

function iconWeight(ctx) {
  const spans = [
    [7, 12], [6, 13], [6, 13], [7, 12], [7, 12],
    [5, 14], [4, 15], [4, 15], [5, 14], [6, 13],
  ]
  drawShape(ctx, 20, 20, predSpans(spans, 8), PAL.steel, PAL.black)
  rect(ctx, 6, 8, 7, 1, PAL.steelLight)
  rect(ctx, 7, 9, 5, 1, PAL.steelWhite)
  rect(ctx, 4, 15, 11, 1, PAL.steelDark)
  rect(ctx, 8, 11, 2, 1, PAL.rust)
  pix(ctx, 5, 14, PAL.steelLight)
  pix(ctx, 14, 14, PAL.steelDark)
  pix(ctx, 12, 13, PAL.ochre)
}

function iconTime(ctx) {
  drawShape(ctx, 20, 20, predEllipse(10, 10, 7, 7), PAL.steelDark, PAL.black)
  arc(ctx, 10, 10, 5.5, 0, TAU, PAL.steelLight, 1, 3)
  pix(ctx, 10, 4, PAL.steelLight)
  pix(ctx, 10, 15, PAL.steelDark)
  pix(ctx, 4, 10, PAL.steelDark)
  pix(ctx, 15, 10, PAL.steelDark)
  line(ctx, 10, 10, 10, 6, PAL.bone, 1)
  line(ctx, 10, 10, 13, 12, PAL.bone, 1)
  rect(ctx, 9, 9, 2, 2, PAL.rustLight)
  pix(ctx, 9, 9, PAL.neonWarm)
}

function iconWeather(ctx) {
  const cloud = predUnion(
    predEllipse(7, 10, 3.4, 3.2),
    predEllipse(11.5, 8.5, 4.2, 3.8),
    predEllipse(15.5, 10, 3.2, 3),
    predRect(5, 10, 16, 13),
  )
  drawShape(ctx, 20, 20, cloud, PAL.steelLight, PAL.black)
  rect(ctx, 6, 11, 10, 2, PAL.steel)
  rect(ctx, 5, 13, 12, 1, PAL.steelDark)
  pix(ctx, 9, 6, PAL.steelWhite)
  pix(ctx, 12, 5, PAL.steelWhite)
  pix(ctx, 14, 7, PAL.steelWhite)
  line(ctx, 7, 15, 6, 18, PAL.toxic, 1)
  line(ctx, 11, 16, 10, 18, PAL.acid, 1)
  line(ctx, 15, 15, 14, 18, PAL.toxicDark, 1)
}

function iconQuest(ctx) {
  drawShape(ctx, 20, 20, predRoundRect(4, 4, 15, 15, 2), PAL.rust, PAL.black)
  rect(ctx, 5, 5, 9, 1, PAL.ochre)
  rect(ctx, 5, 5, 1, 9, PAL.ochre)
  rect(ctx, 9, 7, 2, 5, PAL.bone)
  rect(ctx, 9, 13, 2, 2, PAL.bone)
  pix(ctx, 9, 12, PAL.boneDark)
  rect(ctx, 6, 16, 1, 1, PAL.rustDark)
  rect(ctx, 13, 16, 1, 1, PAL.rustDark)
  pix(ctx, 13, 6, PAL.neonWarm)
}

function iconRescue(ctx) {
  rect(ctx, 7, 7, 6, 7, rgba(PAL.warn, 0.12))
  rect(ctx, 8, 8, 4, 5, rgba(PAL.warn, 0.1))
  rect(ctx, 9, 8, 2, 2, PAL.bone)
  rect(ctx, 9, 10, 2, 3, PAL.boneDark)
  pix(ctx, 8, 10, PAL.boneDark)
  pix(ctx, 11, 10, PAL.boneDark)
  // 笼子（在人物前面）
  rect(ctx, 4, 4, 12, 1, PAL.steelDark)
  rect(ctx, 4, 4, 1, 12, PAL.steelDark)
  rect(ctx, 15, 4, 1, 12, PAL.steelDark)
  rect(ctx, 4, 15, 12, 1, PAL.steelDark)
  for (const bx of [7, 9, 11, 13]) rect(ctx, bx, 5, 1, 10, PAL.steelLight)
  rect(ctx, 3, 3, 14, 1, PAL.black)
  rect(ctx, 3, 16, 14, 1, PAL.black)
  rect(ctx, 3, 3, 1, 14, PAL.black)
  rect(ctx, 16, 3, 1, 14, PAL.black)
  rect(ctx, 9, 13, 2, 2, PAL.rust)
  pix(ctx, 9, 13, PAL.black)
}

function iconCompanion(ctx) {
  drawShape(ctx, 20, 20, predRoundRect(5, 6, 14, 14, 2), PAL.steelLight, PAL.black)
  rect(ctx, 8, 9, 4, 3, PAL.black)
  pix(ctx, 9, 10, PAL.neon)
  pix(ctx, 11, 10, PAL.neon)
  pix(ctx, 8, 9, PAL.glass)
  drawShape(ctx, 20, 20, predRect(9, 4, 10, 6), PAL.steelDark, PAL.black)
  rect(ctx, 9, 2, 2, 2, PAL.neonWarm)
  rect(ctx, 3, 8, 2, 3, PAL.steelDark)
  rect(ctx, 15, 8, 2, 3, PAL.steelDark)
  pix(ctx, 4, 9, PAL.rust)
  pix(ctx, 16, 9, PAL.rust)
  rect(ctx, 8, 12, 4, 1, PAL.ashLight)
  pix(ctx, 7, 13, PAL.steelDark)
  pix(ctx, 12, 13, PAL.steelDark)
}

const STAT_DRAW = {
  hp: iconHp,
  energy: iconEnergy,
  power: iconPower,
  signal: iconSignal,
  speed: iconSpeed,
  jump: iconJump,
  dig: iconDig,
  carry: iconCarry,
  attack: iconAttack,
  weight: iconWeight,
  time: iconTime,
  weather: iconWeather,
  quest: iconQuest,
  rescue: iconRescue,
  companion: iconCompanion,
}

const STAT_SET = new Set(Object.keys(STAT_DRAW))
const statCache = new Map()

export function getStatIcon(name) {
  const key = STAT_SET.has(name) ? name : 'hp'
  if (!statCache.has(key)) {
    statCache.set(
      key,
      makeTex(20, 20, (ctx) => STAT_DRAW[key](ctx), { wrap: 'clamp', anchor: 'center' }),
    )
  }
  return statCache.get(key)
}

/* ============================================================================
 * 8. 天气图标（24×24）
 * ========================================================================== */

function weatherCalm(ctx) {
  // 太阳（雾霾中的低日）
  drawShape(ctx, 24, 24, predEllipse(10, 10, 6.5, 6.5), PAL.ochre, PAL.rustDark)
  drawShape(ctx, 24, 24, predEllipse(9.5, 9, 4.5, 4.5), PAL.sand, PAL.ochre)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    line(ctx, 10 + Math.cos(a) * 8, 10 + Math.sin(a) * 8, 10 + Math.cos(a) * 9.5, 10 + Math.sin(a) * 9.5, rgba(PAL.sandDark, 0.85), 1)
  }
  // 低空霾 / 云带
  rect(ctx, 5, 16, 15, 2, rgba(PAL.steelLight, 0.55))
  rect(ctx, 3, 18, 12, 1, rgba(PAL.steel, 0.5))
  rect(ctx, 12, 19, 9, 1, rgba(PAL.steelLight, 0.3))
  rect(ctx, 2, 21, 20, 1, rgba(PAL.steelDark, 0.7))
}

function weatherWarning(ctx) {
  const spans = [
    [10, 13], [9, 14], [9, 14], [8, 15], [8, 15], [7, 16], [7, 16],
    [6, 17], [6, 17], [5, 18], [5, 18], [4, 19], [4, 19], [4, 19], [4, 19],
  ]
  drawShape(ctx, 24, 24, predSpans(spans, 3), PAL.warn, PAL.black)
  // 内层阴影
  const inner = [
    [10, 13], [10, 13], [9, 14], [9, 14], [8, 15], [8, 15],
    [7, 16], [7, 16], [6, 17], [6, 17], [6, 17], [6, 17],
  ]
  for (let i = 0; i < inner.length; i++) {
    const y = 6 + i
    rect(ctx, inner[i][0], y, inner[i][1] - inner[i][0] + 1, 1, PAL.ochre)
  }
  // 感叹号
  rect(ctx, 11, 8, 2, 6, PAL.black)
  rect(ctx, 11, 15, 2, 2, PAL.black)
  // 底部危险条纹
  for (let i = 0; i < 8; i++) {
    const x = 5 + i * 2
    line(ctx, x, 19, x + 2, 17, PAL.rustDark, 1)
  }
  pix(ctx, 4, 4, PAL.steelLight)
  pix(ctx, 19, 4, PAL.steelLight)
}

function weatherStorm(ctx) {
  const cloud = predUnion(
    predEllipse(9, 11, 5, 4),
    predEllipse(14, 9, 5, 4.5),
    predEllipse(18, 11, 4, 3.5),
    predRect(6, 11, 20, 16),
  )
  drawShape(ctx, 24, 24, cloud, PAL.steel, PAL.black)
  rect(ctx, 7, 12, 11, 2, PAL.ash)
  rect(ctx, 6, 14, 13, 1, PAL.steelDark)
  pix(ctx, 11, 6, PAL.steelWhite)
  pix(ctx, 14, 5, PAL.steelWhite)
  pix(ctx, 17, 7, PAL.steelLight)
  // 闪电
  line(ctx, 14, 14, 10, 18, PAL.black, 4)
  line(ctx, 10, 18, 13, 18, PAL.black, 4)
  line(ctx, 13, 18, 9, 22, PAL.black, 4)
  line(ctx, 14, 14, 10, 18, PAL.neonWarm, 2)
  line(ctx, 10, 18, 13, 18, PAL.neonWarm, 2)
  line(ctx, 13, 18, 9, 22, PAL.neonWarm, 2)
  // 酸雨
  line(ctx, 6, 16, 5, 20, PAL.toxic, 1)
  line(ctx, 19, 16, 18, 20, PAL.toxic, 1)
  line(ctx, 16, 19, 15, 22, PAL.toxicDark, 1)
}

const WEATHER_DRAW = { calm: weatherCalm, warning: weatherWarning, storm: weatherStorm }
const weatherCache = new Map()

export function getWeatherIcon(phase) {
  const key = phase === 'warning' || phase === 'storm' ? phase : 'calm'
  if (!weatherCache.has(key)) {
    weatherCache.set(
      key,
      makeTex(24, 24, (ctx) => WEATHER_DRAW[key](ctx), { wrap: 'clamp', anchor: 'center' }),
    )
  }
  return weatherCache.get(key)
}

/* ============================================================================
 * 9. 光标（16×16，热点左上）
 * ========================================================================== */

let cursorCache = null

export function getCursorTexture() {
  if (cursorCache) return cursorCache
  cursorCache = makeTex(
    16,
    16,
    (ctx) => {
      // 经典箭头轮廓，尾巴略收
      const pts = [
        [1, 1], [1, 11], [4, 9], [6, 14], [8, 13], [6, 9], [10, 9],
      ]
      drawShape(ctx, 16, 16, predPoly(pts), PAL.white, PAL.black)
      // 内部右侧阴影 + 锈点
      line(ctx, 2, 2, 9, 8, rgba(PAL.steelLight, 0.9), 1)
      line(ctx, 7, 10, 7, 12, PAL.steel, 1)
      pix(ctx, 5, 10, PAL.steel)
      pix(ctx, 2, 10, PAL.steelDark)
      pix(ctx, 7, 12, PAL.rust)
    },
    { wrap: 'clamp', anchor: 'top-left', hotspot: [1, 1] },
  )
  cursorCache.userData.hotspot = [1, 1]
  return cursorCache
}

/* ============================================================================
 * 10. 扫描线 / 噪点叠加
 * ========================================================================== */

let scanCache = null
let noiseCache = null

export function getScanlineTexture() {
  if (scanCache) return scanCache
  scanCache = makeTex(
    4,
    64,
    (ctx, w, h) => {
      for (let y = 0; y < h; y++) {
        const p = y % 4
        if (p === 0) rect(ctx, 0, y, w, 1, rgba(PAL.black, 0.32))
        else if (p === 1) rect(ctx, 0, y, w, 1, rgba(PAL.black, 0.1))
        else if (p === 2) rect(ctx, 0, y, w, 1, rgba(PAL.steelWhite, 0.03))
      }
    },
    { wrap: 'repeat', anchor: 'tile' },
  )
  return scanCache
}

export function getNoiseOverlay() {
  if (noiseCache) return noiseCache
  noiseCache = makeTex(
    128,
    128,
    (ctx, w, h) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = hash2(x, y, 0x4f19)
          const m = hash2(x, y, 0x9d31)
          let c = null
          if (n < 0.3) c = rgba(PAL.black, 0.05 + m * 0.12)
          else if (n < 0.42) c = rgba(PAL.ashPale, 0.04 + m * 0.05)
          else if (n > 0.84) c = rgba(PAL.white, 0.02 + m * 0.05)
          else if (n > 0.72) c = rgba(PAL.steelLight, 0.03)
          if (c) rect(ctx, x, y, 1, 1, c)
        }
      }
    },
    { wrap: 'repeat', anchor: 'tile' },
  )
  return noiseCache
}

/* ============================================================================
 * 11. 小地图格子（12×12）
 * ========================================================================== */

function mmRoom(ctx, fill, border, dot) {
  rect(ctx, 1, 1, 10, 10, PAL.black)
  rect(ctx, 2, 2, 8, 8, border)
  rect(ctx, 3, 3, 6, 6, fill)
  if (dot) {
    rect(ctx, 5, 5, 2, 2, dot)
  }
}

function drawMinimap(kind, ctx) {
  if (kind === 'room') {
    mmRoom(ctx, rgba(PAL.ash, 0.95), PAL.steelLight, PAL.steelLight)
    rect(ctx, 1, 5, 1, 2, PAL.steelLight)
    rect(ctx, 10, 5, 1, 2, PAL.steelLight)
  } else if (kind === 'room_visited') {
    mmRoom(ctx, rgba(PAL.ash, 0.7), mix(PAL.steel, PAL.void, 0.35), null)
    pix(ctx, 5, 5, PAL.steelDark)
    pix(ctx, 6, 6, PAL.steelDark)
  } else if (kind === 'room_current') {
    rect(ctx, 1, 1, 10, 10, PAL.black)
    rect(ctx, 2, 2, 8, 8, PAL.neon)
    rect(ctx, 3, 3, 6, 6, rgba(PAL.neon, 0.16))
    rect(ctx, 4, 4, 4, 4, rgba(PAL.neon, 0.28))
    rect(ctx, 5, 5, 2, 2, PAL.white)
    pix(ctx, 1, 1, PAL.neonWarm)
    pix(ctx, 10, 1, PAL.neonWarm)
    pix(ctx, 1, 10, PAL.neonWarm)
    pix(ctx, 10, 10, PAL.neonWarm)
  } else if (kind === 'shelter') {
    // 屋顶
    const roof = [
      [5, 6], [4, 7], [3, 8], [2, 9],
    ]
    for (let i = 0; i < roof.length; i++) rect(ctx, roof[i][0], 2 + i, roof[i][1] - roof[i][0] + 1, 1, PAL.steelLight)
    for (let i = 0; i < roof.length; i++) pix(ctx, roof[i][0], 2 + i, PAL.black)
    rect(ctx, 3, 6, 6, 5, PAL.steelDark)
    rect(ctx, 3, 6, 6, 1, PAL.steel)
    rect(ctx, 5, 7, 2, 4, PAL.neonWarm)
    rect(ctx, 5, 7, 1, 4, PAL.warn)
    rect(ctx, 2, 11, 8, 1, PAL.black)
    pix(ctx, 4, 6, rgba(PAL.warn, 0.6))
    pix(ctx, 7, 6, rgba(PAL.warn, 0.6))
  } else if (kind === 'loot') {
    rect(ctx, 2, 3, 8, 7, PAL.black)
    rect(ctx, 3, 4, 6, 5, PAL.rustDark)
    rect(ctx, 3, 4, 6, 1, PAL.rust)
    rect(ctx, 5, 4, 2, 5, PAL.steelLight)
    rect(ctx, 4, 6, 4, 1, PAL.steel)
    pix(ctx, 8, 4, PAL.neonWarm)
    pix(ctx, 8, 5, PAL.rustHot)
    pix(ctx, 2, 2, PAL.black)
  } else if (kind === 'enemy') {
    const tri = [
      [5, 6], [4, 7], [3, 8], [2, 9], [2, 9], [2, 9],
    ]
    for (let i = 0; i < tri.length; i++) rect(ctx, tri[i][0], 2 + i, tri[i][1] - tri[i][0] + 1, 1, PAL.danger)
    for (let i = 0; i < tri.length; i++) {
      pix(ctx, tri[i][0], 2 + i, PAL.black)
      pix(ctx, tri[i][1], 2 + i, PAL.black)
    }
    rect(ctx, 5, 4, 1, 3, PAL.black)
    pix(ctx, 5, 8, PAL.black)
    rect(ctx, 2, 10, 8, 1, PAL.black)
  } else if (kind === 'gate') {
    rect(ctx, 2, 2, 8, 9, PAL.black)
    rect(ctx, 3, 3, 2, 7, PAL.steel)
    rect(ctx, 7, 3, 2, 7, PAL.steel)
    rect(ctx, 3, 3, 1, 7, PAL.steelLight)
    rect(ctx, 7, 3, 1, 7, PAL.steelLight)
    rect(ctx, 5, 5, 2, 3, PAL.neonCold)
    pix(ctx, 5, 4, PAL.signal)
    pix(ctx, 6, 4, PAL.signal)
    rect(ctx, 2, 10, 8, 1, PAL.steelDark)
  } else if (kind === 'rescue') {
    rect(ctx, 2, 2, 8, 9, PAL.black)
    rect(ctx, 3, 3, 6, 7, rgba(PAL.warn, 0.16))
    rect(ctx, 5, 4, 2, 3, PAL.bone)
    rect(ctx, 5, 7, 2, 2, PAL.boneDark)
    rect(ctx, 3, 3, 6, 1, PAL.steel)
    rect(ctx, 3, 9, 6, 1, PAL.steel)
    for (const bx of [4, 6, 8]) rect(ctx, bx, 4, 1, 5, PAL.steelLight)
    rect(ctx, 5, 8, 2, 1, PAL.rust)
    pix(ctx, 3, 2, PAL.warn)
    pix(ctx, 8, 2, PAL.warn)
  }
}

const MINIMAP_DRAW = {
  room: 1,
  room_visited: 1,
  room_current: 1,
  shelter: 1,
  loot: 1,
  enemy: 1,
  gate: 1,
  rescue: 1,
}
const minimapCache = new Map()

export function getMinimapTile(kind) {
  const key = Object.prototype.hasOwnProperty.call(MINIMAP_DRAW, kind) ? kind : 'room'
  if (!minimapCache.has(key)) {
    minimapCache.set(
      key,
      makeTex(12, 12, (ctx) => drawMinimap(key, ctx), { wrap: 'clamp', anchor: 'center' }),
    )
  }
  return minimapCache.get(key)
}

/* ============================================================================
 * 12. 载入画面（640×360）
 * ========================================================================== */

let loadCache = null

function skyColorAt(t) {
  const stops = [
    PAL.skyNight,
    mix(PAL.skyNight, PAL.skySmoke, 0.3),
    mix(PAL.skyNight, PAL.skySmoke, 0.62),
    PAL.skySmoke,
    mix(PAL.skySmoke, PAL.skyDusk, 0.45),
    mix(PAL.skySmoke, PAL.skyDusk, 0.72),
  ]
  const f = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i0 = Math.floor(f)
  const i1 = Math.min(stops.length - 1, i0 + 1)
  return mix(stops[i0], stops[i1], f - i0)
}

function drawLoadScreen(ctx, W, H) {
  const rng = mulberry32(0x2b17c0)
  const HORIZON = 252

  // ---- 天空：量化色带 + 边界抖动（保持像素感） ----
  const bands = 14
  for (let i = 0; i < bands; i++) {
    const y0 = Math.floor((i * HORIZON) / bands)
    const y1 = Math.floor(((i + 1) * HORIZON) / bands)
    const c = skyColorAt(i / (bands - 1))
    rect(ctx, 0, y0, W, y1 - y0, c)
    if (i < bands - 1) {
      const c2 = skyColorAt((i + 1) / (bands - 1))
      for (let x = 0; x < W; x += 2) {
        if (hash2(x, y1, 0x71) > 0.5) rect(ctx, x, y1 - 1, 1, 1, c2)
      }
    }
  }

  // 低空暖霾
  for (let y = 196; y < HORIZON; y++) {
    const a = 0.05 + (y - 196) / (HORIZON - 196) * 0.16
    rect(ctx, 0, y, W, 1, rgba(PAL.skyDusk, a))
  }

  // 雾中的低日
  disc(ctx, 468, 208, 30, 30, rgba(PAL.ochre, 0.14), rgba(PAL.ochre, 0.14))
  disc(ctx, 468, 208, 21, 21, rgba(PAL.ochre, 0.32), rgba(PAL.ochre, 0.32))
  disc(ctx, 468, 208, 14, 14, rgba(PAL.sand, 0.66), rgba(PAL.ochre, 0.42))
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU
    const d = 22 + rng() * 16
    pix(ctx, 468 + Math.cos(a) * d, 208 + Math.sin(a) * d, rgba(PAL.ochre, 0.18))
  }

  // 地平线以下的实体底色：避免出现透明空洞（同时充当远处地面雾）
  for (let y = HORIZON - 2; y < H; y++) {
    const tt = (y - (HORIZON - 2)) / (H - HORIZON + 2)
    rect(ctx, 0, y, W, 1, mix(mix(PAL.skySmoke, PAL.black, 0.52), PAL.black, tt * 0.55))
  }

  // ---- 远景废墟天际线 ----
  for (let i = 0; i < 30; i++) {
    const x = Math.round(i * (W / 30) + rng() * 12 - 6)
    const bw = 10 + Math.floor(rng() * 24)
    const top = 150 + Math.floor(rng() * 92)
    const c = i % 3 === 0 ? PAL.steelDark : mix(PAL.steelDark, PAL.skySmoke, 0.3)
    rect(ctx, x, top, bw, HORIZON - top + 6, c)
    // 断裂顶部
    rect(ctx, x, top, Math.max(2, Math.floor(bw * 0.4)), 3 + Math.floor(rng() * 10), mix(c, PAL.black, 0.5))
    // 顶部薄雾受光边
    if (rng() < 0.35) rect(ctx, x + 2, top + 1, Math.max(2, bw - 5), 1, rgba(PAL.ashPale, 0.25))
    // 天线 / 桅杆
    if (rng() < 0.28) {
      const ax = x + Math.floor(bw * 0.5)
      const ah = 8 + Math.floor(rng() * 26)
      rect(ctx, ax, top - ah, 1, ah, c)
    }
    // 稀疏灯窗
    for (let wy = top + 7; wy < HORIZON - 8; wy += 9) {
      for (let wx = x + 3; wx < x + bw - 3; wx += 6) {
        if (rng() < 0.05) rect(ctx, wx, wy, 1, 2, rgba(PAL.neonWarm, 0.35 + rng() * 0.35))
      }
    }
  }

  // 远处工厂烟囱 + 烟柱
  const chimneys = [
    [70, 168, 14],
    [182, 152, 12],
    [556, 160, 15],
    [604, 186, 11],
  ]
  for (const ch of chimneys) {
    const x = ch[0]
    const top = ch[1]
    const w = ch[2]
    rect(ctx, x, top, w, HORIZON - top + 6, mix(PAL.steelDark, PAL.black, 0.35))
    rect(ctx, x + w - 3, top, 3, HORIZON - top, PAL.black)
    for (let y = top + 6; y < HORIZON; y += 11) rect(ctx, x, y, w, 1, rgba(PAL.ash, 0.35))
    // 烟柱
    for (let k = 0; k < 9; k++) {
      const px = x + w / 2 + k * 2 + Math.sin(k * 0.8 + x) * 3
      const py = top - k * 9
      const r = 2 + k * 0.7
      ditherDisc(ctx, px, py, r, rgba(PAL.ashPale, 0.13 - k * 0.011), 0x900 + x + k * 13, 0.35)
    }
  }

  // 远景雾带（压住天际线底部）
  for (let y = HORIZON - 22; y < HORIZON + 8; y++) {
    rect(ctx, 0, y, W, 1, rgba(PAL.skySmoke, 0.1 + (y - (HORIZON - 22)) * 0.004))
  }

  // ---- 中景废墟（更黑，剪影） ----
  const midBase = HORIZON + 8
  for (let i = 0; i < 12; i++) {
    const x = Math.round(i * (W / 12) + rng() * 20 - 10)
    const bw = 26 + Math.floor(rng() * 52)
    const top = midBase - 10 - Math.floor(rng() * 46)
    rect(ctx, x, top, bw, H - top, PAL.ash)
    // 破屋顶
    for (let s = 0; s < 4; s++) {
      const sw = Math.max(3, Math.floor(bw * (0.16 + rng() * 0.2)))
      rect(ctx, x + Math.floor(rng() * (bw - sw)), top - (rng() < 0.5 ? 2 : 0), sw, 3, PAL.ash)
    }
    // 窗洞
    for (let wy = top + 8; wy < midBase + 20; wy += 12) {
      for (let wx = x + 5; wx < x + bw - 5; wx += 11) {
        if (rng() < 0.45) rect(ctx, wx, wy, 4, 5, PAL.black)
      }
    }
    // 边缘受光
    if (rng() < 0.5) rect(ctx, x + bw - 1, top, 1, H - top, rgba(PAL.steelDark, 0.8))
  }

  // 中景厂房 / 断管
  rect(ctx, 300, 236, 96, 40, PAL.ash)
  for (let i = 0; i < 4; i++) {
    const x = 306 + i * 24
    line(ctx, x, 238, x + 12, 226, PAL.black, 3)
    line(ctx, x + 12, 226, x + 24, 238, PAL.black, 3)
  }
  rect(ctx, 300, 236, 96, 2, rgba(PAL.ashPale, 0.18))
  // 断掉的输送管
  rect(ctx, 240, 262, 58, 7, PAL.black)
  rect(ctx, 240, 262, 58, 2, rgba(PAL.ashPale, 0.12))
  rect(ctx, 296, 259, 10, 12, PAL.black)

  // 电线杆 + 下垂电线
  const poles = [96, 262, 430]
  for (const px of poles) {
    rect(ctx, px, 226, 2, 54, PAL.black)
    rect(ctx, px - 9, 232, 20, 1, PAL.black)
    rect(ctx, px - 7, 236, 16, 1, PAL.black)
    pix(ctx, px - 9, 233, PAL.rustDark)
    pix(ctx, px + 10, 233, PAL.rustDark)
  }
  for (let s = 0; s < poles.length - 1; s++) {
    const x0 = poles[s] + 1
    const x1 = poles[s + 1] + 1
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / (x1 - x0)
      const y = 234 + Math.sin(t * Math.PI) * 10
      pix(ctx, x, y, PAL.black)
    }
  }

  // 信号塔（视觉焦点）
  const tx = 500
  const ttop = 150
  const tbase = 308
  line(ctx, tx - 13, tbase, tx - 2, ttop, PAL.black, 2)
  line(ctx, tx + 13, tbase, tx + 2, ttop, PAL.black, 2)
  for (let y = ttop + 8; y < tbase; y += 13) {
    const half = Math.round(((y - ttop) / (tbase - ttop)) * 13)
    rect(ctx, tx - half, y, half * 2, 1, PAL.black)
    if ((y / 13) % 2 < 1) {
      pix(ctx, tx - half + 1, y - 2, PAL.black)
      pix(ctx, tx + half - 1, y - 2, PAL.black)
    }
  }
  rect(ctx, tx, ttop - 18, 2, 20, PAL.black)
  rect(ctx, tx - 3, ttop - 20, 8, 2, PAL.black)
  // 信标
  rect(ctx, tx - 1, ttop - 24, 4, 4, PAL.black)
  rect(ctx, tx, ttop - 23, 2, 2, PAL.neonRed)
  pix(ctx, tx, ttop - 24, rgba(PAL.neonRed, 0.5))
  arc(ctx, tx, ttop - 22, 9, -Math.PI * 0.9, -Math.PI * 0.1, rgba(PAL.signal, 0.5), 1, 2)
  arc(ctx, tx, ttop - 22, 15, -Math.PI * 0.85, -Math.PI * 0.15, rgba(PAL.signal, 0.28), 1, 3)
  // 塔基小屋
  rect(ctx, tx - 18, tbase - 12, 36, 12, PAL.black)
  rect(ctx, tx - 14, tbase - 10, 6, 4, rgba(PAL.neonWarm, 0.25))

  // ---- 近景地面与剪影 ----
  for (let x = 0; x < W; x++) {
    const y = 300 + Math.round(Math.sin(x * 0.05) * 4 + hash2(x, 3, 0x33) * 10)
    rect(ctx, x, y, 1, H - y, PAL.black)
  }
  // 前景碎石堆
  for (let i = 0; i < 26; i++) {
    const x = rng() * W
    const y = 318 + rng() * 34
    const r = 4 + rng() * 14
    disc(ctx, x, y, r, r * 0.55, PAL.black, rgba(PAL.ashPale, 0.2))
    pix(ctx, x - r * 0.4, y - r * 0.3, rgba(PAL.ashPale, 0.14))
  }
  // 枯草 / 铁丝
  for (let i = 0; i < 60; i++) {
    const x = rng() * W
    const y = 300 + rng() * 20
    const h = 4 + rng() * 12
    const lean = (rng() - 0.5) * 6
    for (let k = 0; k < h; k++) {
      pix(ctx, x + lean * (k / h), y - k, rgba(PAL.weed, 0.35))
    }
  }
  // 毒水洼
  for (let i = 0; i < 2; i++) {
    const x = 110 + i * 330
    const y = 342 + i * 4
    disc(ctx, x, y, 42, 8, rgba(PAL.toxicDark, 0.55), rgba(PAL.toxicDark, 0.2))
    for (let k = 0; k < 26; k++) {
      pix(ctx, x - 38 + rng() * 76, y - 6 + rng() * 12, rgba(PAL.toxicGlow, 0.25))
    }
  }

  // ---- 酸雨 ----
  for (let i = 0; i < 170; i++) {
    const x = Math.floor(rng() * W)
    const y = Math.floor(rng() * (H - 20))
    const len = 2 + Math.floor(rng() * 4)
    const a = 0.12 + rng() * 0.2
    for (let k = 0; k < len; k++) {
      pix(ctx, x + k, y + k * 2, rgba(PAL.rain, a))
    }
  }
  // 近景浓雨（更亮更粗）
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * W)
    const y = Math.floor(rng() * (H - 30))
    for (let k = 0; k < 5; k++) {
      pix(ctx, x + k, y + k * 2, rgba(PAL.rain, 0.28))
    }
  }

  // ---- 扫描线 / 暗角 ----
  for (let y = 0; y < H; y += 3) rect(ctx, 0, y, W, 1, rgba(PAL.black, 0.1))
  const vig = ctx.createRadialGradient(W / 2, H / 2, 110, W / 2, H / 2, 360)
  vig.addColorStop(0, rgba(PAL.black, 0))
  vig.addColorStop(0.62, rgba(PAL.black, 0.08))
  vig.addColorStop(1, rgba(PAL.black, 0.55))
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)

  // ---- UI：标题面板 ----
  const px0 = 132
  const py0 = 34
  const pw = 376
  const ph = 118
  rect(ctx, px0 + 4, py0 + 6, pw, ph, rgba(PAL.black, 0.45))
  rect(ctx, px0, py0, pw, ph, rgba(PAL.void, 0.72))
  rect(ctx, px0, py0, pw, 1, PAL.steelDark)
  rect(ctx, px0, py0 + ph - 1, pw, 1, PAL.steelDark)
  rect(ctx, px0, py0, 1, ph, PAL.steelDark)
  rect(ctx, px0 + pw - 1, py0, 1, ph, PAL.steelDark)
  rect(ctx, px0 + 3, py0 + 3, pw - 6, 1, rgba(PAL.steelLight, 0.5))
  rect(ctx, px0 + 3, py0 + ph - 4, pw - 6, 1, rgba(PAL.rustDark, 0.9))
  for (let y = py0 + 4; y < py0 + ph - 4; y += 3) rect(ctx, px0 + 3, y, pw - 6, 1, rgba(PAL.black, 0.08))
  // 角标
  for (const c of [
    [px0 + 6, py0 + 6, 10, 1],
    [px0 + 6, py0 + 6, 1, 10],
    [px0 + pw - 16, py0 + 6, 10, 1],
    [px0 + pw - 7, py0 + 6, 1, 10],
    [px0 + 6, py0 + ph - 7, 10, 1],
    [px0 + 6, py0 + ph - 16, 1, 10],
    [px0 + pw - 16, py0 + ph - 7, 10, 1],
    [px0 + pw - 7, py0 + ph - 16, 1, 10],
  ]) {
    rect(ctx, c[0], c[1], c[2], c[3], rgba(PAL.rustLight, 0.85))
  }

  // 标题
  const tg = ctx.createLinearGradient(0, py0 + 14, 0, py0 + 78)
  tg.addColorStop(0, PAL.rustHot)
  tg.addColorStop(0.34, PAL.rustLight)
  tg.addColorStop(0.7, PAL.rust)
  tg.addColorStop(1, PAL.rustDark)
  drawText(ctx, '锈雨', W / 2, py0 + 48, 58, rgba(PAL.oil, 0.9), { align: 'center', alpha: 0.8 })
  drawSpaced(ctx, '锈雨', W / 2, py0 + 44, 58, tg, {
    align: 'center',
    bold: true,
    spacing: 12,
    outline: PAL.rustDeep,
    outlineWidth: 6,
  })
  drawSpaced(ctx, 'RUSTFALL', W / 2, py0 + 88, 17, PAL.steelLight, {
    align: 'center',
    bold: true,
    mono: true,
    spacing: 8,
    outline: PAL.oil,
    outlineWidth: 3,
  })
  drawSpaced(ctx, '废土拾荒 · 循环生存', W / 2, py0 + 106, 10, rgba(PAL.bone, 0.8), {
    align: 'center',
    bold: false,
    spacing: 2,
    outline: rgba(PAL.oil, 0.9),
    outlineWidth: 2,
  })

  // 顶/底信息条
  drawSpaced(ctx, 'RUSTFALL // SCAVENGER PROTOCOL', 14, 15, 9, rgba(PAL.steelLight, 0.85), {
    bold: true,
    mono: true,
    spacing: 1,
    outline: rgba(PAL.oil, 0.8),
    outlineWidth: 2,
  })
  drawSpaced(ctx, 'CYCLE 07', W - 14, 15, 9, rgba(PAL.rustLight, 0.9), {
    align: 'right',
    bold: true,
    mono: true,
    spacing: 1,
    outline: rgba(PAL.oil, 0.8),
    outlineWidth: 2,
  })

  // 底部提示条
  rect(ctx, 82, 322, 476, 26, rgba(PAL.void, 0.72))
  rect(ctx, 82, 322, 476, 1, rgba(PAL.steelDark, 0.9))
  rect(ctx, 82, 347, 476, 1, rgba(PAL.steelDark, 0.9))
  rect(ctx, 82, 323, 2, 24, rgba(PAL.warn, 0.75))
  pix(ctx, 90, 334, PAL.warn)
  pix(ctx, 91, 334, PAL.neonWarm)
  drawText(ctx, '酸雨即将抵达 —— 进入避难所，等待循环结束。', W / 2 + 10, 335, 13, PAL.bone, {
    align: 'center',
    outline: PAL.oil,
    outlineWidth: 3,
  })
}

export function getLoadScreenArt() {
  if (loadCache) return loadCache
  loadCache = makeTex(640, 360, drawLoadScreen, { wrap: 'clamp', anchor: 'stretch' })
  return loadCache
}

/* ============================================================================
 * 13. 章节卡（512×128，按 text 缓存）
 * ========================================================================== */

const chapterCache = new Map()

function drawChapterCard(ctx, W, H, text) {
  const seed = hashStr(text || '')
  const rng = mulberry32(seed)
  const label = 'SECTOR FILE  //  区域档案'

  // 外层轮廓（黑）→ 钢框 → 内底板，三层圆角矩形
  drawShape(ctx, W, H, predRoundRect(8, 22, 503, 105, 7), PAL.steelDark, PAL.black)
  drawShape(ctx, W, H, predRoundRect(11, 25, 500, 102, 6), PAL.steel, PAL.steelDark)
  drawShape(ctx, W, H, predRoundRect(14, 28, 497, 99, 5), PAL.ash, PAL.steel)
  // 内底纹
  for (let y = 30; y < 98; y++) {
    const t = (y - 30) / 68
    rect(ctx, 16, y, 479, 1, mix(PAL.ash, PAL.ashLight, t * 0.55))
  }
  for (let y = 32; y < 96; y += 3) rect(ctx, 16, y, 479, 1, rgba(PAL.black, 0.07))
  // 锈迹
  for (let i = 0; i < 70; i++) {
    const x = 16 + Math.floor(rng() * 479)
    const y = 30 + Math.floor(rng() * 68)
    const c = rng() < 0.5 ? rgba(PAL.rustDark, 0.35) : rgba(PAL.rust, 0.22)
    rect(ctx, x, y, rng() < 0.2 ? 2 : 1, 1, c)
  }
  // 上高光 / 下锈线
  rect(ctx, 16, 28, 479, 1, rgba(PAL.steelWhite, 0.55))
  rect(ctx, 16, 98, 479, 1, rgba(PAL.rust, 0.85))
  rect(ctx, 16, 99, 479, 1, rgba(PAL.rustDark, 0.8))
  // 左端装饰钢条
  rect(ctx, 18, 32, 5, 64, PAL.steelDark)
  rect(ctx, 19, 32, 1, 64, PAL.steelLight)
  for (let y = 36; y < 96; y += 10) pix(ctx, 21, y, PAL.rustLight)
  // 铆钉
  rivet(ctx, 18, 32)
  rivet(ctx, 492, 32)
  rivet(ctx, 18, 92)
  rivet(ctx, 492, 92)

  // 顶部小标签
  drawSpaced(ctx, label, 34, 42, 9, rgba(PAL.steelLight, 0.9), {
    bold: true,
    mono: true,
    spacing: 1,
    outline: rgba(PAL.oil, 0.7),
    outlineWidth: 2,
  })
  rect(ctx, 34, 48, 58, 1, rgba(PAL.rust, 0.8))
  pix(ctx, 96, 48, PAL.neonWarm)

  // 主文本（自动缩放到框内）
  const title = text && String(text).trim() ? String(text).trim().replace(/\s+/g, ' ').slice(0, 40) : '未命名区域'
  const size = fitSize(ctx, title, 34, 430, 18, true, false)
  drawText(ctx, title, 256, 72, size, rgba(PAL.oil, 0.85), { align: 'center', alpha: 0.8 })
  drawText(ctx, title, 254, 70, size, PAL.bone, {
    align: 'center',
    outline: PAL.oil,
    outlineWidth: 4,
  })
  // 文字两侧金属短线
  setFont(ctx, size, true, false)
  const tw = Math.min(430, ctx.measureText(title).width)
  const gap = 18
  const left = 256 - tw / 2 - gap
  const right = 256 + tw / 2 + gap
  if (left > 40) {
    rect(ctx, left - 34, 71, 28, 1, rgba(PAL.rustLight, 0.9))
    pix(ctx, left - 36, 71, PAL.rust)
  }
  if (right < 472) {
    rect(ctx, right + 6, 71, 28, 1, rgba(PAL.rustLight, 0.9))
    pix(ctx, right + 34, 71, PAL.rust)
  }
  // 底部状态点
  rect(ctx, 238, 92, 3, 2, PAL.neonWarm)
  rect(ctx, 244, 92, 3, 2, rgba(PAL.steelLight, 0.8))
  rect(ctx, 250, 92, 3, 2, rgba(PAL.steelLight, 0.5))
}

export function getChapterCard(text) {
  const key = text === undefined || text === null ? '' : String(text)
  if (!chapterCache.has(key)) {
    chapterCache.set(
      key,
      makeTex(512, 128, (ctx, W, H) => drawChapterCard(ctx, W, H, key), {
        wrap: 'clamp',
        anchor: 'center',
      }),
    )
  }
  return chapterCache.get(key)
}

/* ============================================================================
 * 14. 肖像边框（112×112，中心透明）
 * ========================================================================== */

let portraitCache = null

export function getPortraitFrame() {
  if (portraitCache) return portraitCache
  portraitCache = makeTex(
    112,
    112,
    (ctx, W, H) => {
      drawShape(ctx, W, H, predRoundRect(0, 0, 111, 111, 6), PAL.steelDark, PAL.black)
      // 边框分层
      for (let i = 1; i <= 7; i++) {
        const c = i === 1 ? PAL.steel : i === 2 ? PAL.steelLight : i === 3 ? PAL.steel : PAL.steelDark
        rect(ctx, i, i, W - i * 2, 1, c)
        rect(ctx, i, H - i - 1, W - i * 2, 1, c)
        rect(ctx, i, i, 1, H - i * 2, c)
        rect(ctx, W - i - 1, i, 1, H - i * 2, c)
      }
      // 外缘高光 / 内缘暖光
      rect(ctx, 1, 1, W - 2, 1, rgba(PAL.steelLight, 0.85))
      rect(ctx, 1, 1, 1, H - 2, rgba(PAL.steelLight, 0.85))
      rect(ctx, 1, H - 2, W - 2, 1, rgba(PAL.rustDark, 0.9))
      rect(ctx, W - 2, 1, 1, H - 2, rgba(PAL.rustDark, 0.9))
      // 中心挖空（透明，留出立绘）
      ctx.clearRect(8, 8, W - 16, H - 16)
      // 内缘描边
      rect(ctx, 7, 7, W - 14, 1, PAL.black)
      rect(ctx, 7, H - 8, W - 14, 1, PAL.black)
      rect(ctx, 7, 7, 1, H - 14, PAL.black)
      rect(ctx, W - 8, 7, 1, H - 14, PAL.black)
      rect(ctx, 8, 8, W - 16, 1, PAL.steelLight)
      rect(ctx, 8, 8, 1, H - 16, PAL.steelLight)
      rect(ctx, 8, H - 9, W - 16, 1, PAL.rustDark)
      rect(ctx, W - 9, 8, 1, H - 16, PAL.rustDark)
      // 四角包角（L 形亮边，压在钢框上）
      const bracket = (x, y, sx, sy) => {
        const x2 = sx > 0 ? x + 7 : x - 7
        const y2 = sy > 0 ? y + 7 : y - 7
        rect(ctx, Math.min(x, x2), y, 8, 1, PAL.rustLight)
        rect(ctx, x, Math.min(y, y2), 1, 8, PAL.rustLight)
        pix(ctx, x + sx * 6, y + sy * 6, PAL.rustHot)
      }
      bracket(2, 2, 1, 1)
      bracket(W - 3, 2, -1, 1)
      bracket(2, H - 3, 1, -1)
      bracket(W - 3, H - 3, -1, -1)
      // 铆钉
      rivet(ctx, 11, 11)
      rivet(ctx, W - 13, 11)
      rivet(ctx, 11, H - 13)
      rivet(ctx, W - 13, H - 13)
      // 锈斑
      const rng = mulberry32(0x9911)
      for (let i = 0; i < 60; i++) {
        const side = Math.floor(rng() * 4)
        const t = 1 + Math.floor(rng() * 6)
        const u = 10 + Math.floor(rng() * (W - 20))
        let x = 0
        let y = 0
        if (side === 0) {
          x = u
          y = t
        } else if (side === 1) {
          x = u
          y = H - t
        } else if (side === 2) {
          x = t
          y = u
        } else {
          x = W - t
          y = u
        }
        if (x >= 8 && x < W - 8 && y >= 8 && y < H - 8) continue
        pix(ctx, x, y, rng() < 0.5 ? PAL.rust : PAL.ochre)
      }
      // 底部小铭牌
      rect(ctx, 36, H - 15, 40, 11, PAL.black)
      rect(ctx, 37, H - 14, 38, 9, PAL.steelDark)
      rect(ctx, 37, H - 14, 38, 1, PAL.steelLight)
      for (let i = 0; i < 3; i++) {
        const c = i === 0 ? PAL.neonWarm : i === 1 ? PAL.neon : PAL.neonRed
        rect(ctx, 44 + i * 8, H - 10, 2, 2, c)
      }
      rect(ctx, 24, H - 19, 2, 2, PAL.steelDark)
      rect(ctx, W - 26, H - 19, 2, 2, PAL.steelDark)
    },
    { wrap: 'clamp', anchor: 'center' },
  )
  return portraitCache
}

/* ============================================================================
 * 15. 对话框底纹（512×96，中段周期 32 可平铺）
 * ========================================================================== */

let dialogueCache = null

export function getDialogueFrame() {
  if (dialogueCache) return dialogueCache
  dialogueCache = makeTex(
    512,
    96,
    (ctx, W, H) => {
      // 底板：上深下浅的量化色带
      for (let y = 0; y < H; y++) {
        const band = Math.floor(y / 6)
        const t = band / 15
        rect(ctx, 0, y, W, 1, mix(PAL.void, PAL.ash, 0.45 + t * 0.5))
      }
      // 中段周期纹理（周期 32，中段 448 = 14×32）
      for (let x = 32; x < 480; x++) {
        const px = x % 32
        if (px === 0) rect(ctx, x, 6, 1, 16, rgba(PAL.steelLight, 0.18))
        if (px === 16) rect(ctx, x, 74, 1, 14, rgba(PAL.rustDark, 0.4))
        if (px >= 3 && px <= 9 && x % 32 === 4) rect(ctx, x, 12, 6, 1, rgba(PAL.steel, 0.25))
        if (px >= 20 && px <= 25 && x % 32 === 20) rect(ctx, x, 82, 5, 1, rgba(PAL.rustDark, 0.3))
      }
      // 扫描线
      for (let y = 0; y < H; y += 3) rect(ctx, 0, y, W, 1, rgba(PAL.black, 0.12))
      // 细噪点
      for (let i = 0; i < 420; i++) {
        const x = Math.floor(hash2(i, 3, 0x71) * W)
        const y = Math.floor(hash2(i, 7, 0x71) * H)
        pix(ctx, x, y, rgba(PAL.ashPale, 0.08))
      }
      // 边框：外黑 → 钢 → 内高光
      rect(ctx, 0, 0, W, 2, PAL.black)
      rect(ctx, 0, 2, W, 2, PAL.steelDark)
      rect(ctx, 0, 4, W, 1, PAL.steel)
      rect(ctx, 0, 5, W, 1, rgba(PAL.steelLight, 0.8))
      rect(ctx, 0, H - 2, W, 2, PAL.black)
      rect(ctx, 0, H - 4, W, 2, PAL.rustDark)
      rect(ctx, 0, H - 5, W, 1, PAL.rust)
      rect(ctx, 0, 0, 2, H, PAL.black)
      rect(ctx, 2, 0, 2, H, PAL.steelDark)
      rect(ctx, W - 2, 0, 2, H, PAL.black)
      rect(ctx, W - 4, 0, 2, H, PAL.steelDark)

      // 左右端盖（各 32px）：竖向钢条 + 铆钉 + 内缘高光
      for (const side of [0, 1]) {
        const bx = side === 0 ? 0 : W - 32
        const mirror = side === 1
        const R = (x, y, w, h, c) => rect(ctx, mirror ? bx + 32 - x - w : bx + x, y, w, h, c)
        R(4, 4, 26, H - 8, PAL.steelDark)
        R(6, 6, 22, H - 12, PAL.steel)
        R(6, 6, 22, 1, PAL.steelLight)
        R(6, H - 7, 22, 1, PAL.rustDark)
        // 竖向拉丝
        for (let x = 8; x < 28; x += 4) R(x, 8, 1, H - 16, rgba(PAL.steelDark, 0.5))
        // 端头缺口
        R(4, 4, 2, H - 8, PAL.black)
        R(28, 4, 2, H - 8, PAL.black)
        // 铆钉
        rivet(ctx, mirror ? bx + 10 : bx + 20, 14)
        rivet(ctx, mirror ? bx + 10 : bx + 20, H - 18)
        // 暖色指示灯
        R(14, 10, 4, 2, PAL.black)
        R(15, 11, 2, 1, PAL.neonWarm)
        // 内缘高光
        R(mirror ? 3 : 30, 6, 1, H - 12, rgba(PAL.steelWhite, 0.4))
      }
    },
    { wrapS: 'repeat', wrapT: 'clamp', anchor: 'stretch-x' },
  )
  return dialogueCache
}


/* ============================================================================
 * 16. v3 追加：日夜阶段（24×24）/ 设置分类（20×20）/ 手柄按键（20×20）
 *     全部惰性构建 + 按 key 缓存；沿用本文件的调色板 / 像素原语。
 * ========================================================================== */

function pixelRing(ctx, cx, cy, r, color, thickness = 1) {
  const x0 = Math.floor(cx - r - thickness)
  const x1 = Math.ceil(cx + r + thickness)
  const y0 = Math.floor(cy - r - thickness)
  const y1 = Math.ceil(cy + r + thickness)
  const half = Math.max(0.55, thickness / 2)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (Math.abs(d - r) <= half) rect(ctx, x, y, 1, 1, color)
    }
  }
}

function pixelGlyph(ctx, rows, x, y, color) {
  for (let ry = 0; ry < rows.length; ry++) {
    for (let rx = 0; rx < rows[ry].length; rx++) {
      if (rows[ry][rx] === '1') pix(ctx, x + rx, y + ry, color)
    }
  }
}

/* ---------------- 日夜阶段 ---------------- */

function drawPhaseDawn(ctx) {
  const disc = predEllipse(12, 16, 6.4, 6.4)
  drawShape(ctx, 24, 24, (x, y) => y <= 15 && disc(x, y), PAL.rustLight, PAL.rustDark)
  for (let y = 8; y <= 14; y++) {
    for (let x = 4; x <= 20; x++) {
      if (predEllipse(12, 15, 4, 4)(x, y)) rect(ctx, x, y, 1, 1, PAL.sand)
    }
  }
  for (let i = 0; i < 15; i++) {
    const a = Math.PI + (i / 14) * Math.PI
    pix(ctx, 12 + Math.cos(a) * 8.5, 16 + Math.sin(a) * 4.3, rgba(PAL.rustHot, 0.5))
  }
  rect(ctx, 11, 3, 2, 2, PAL.warn)
  line(ctx, 5, 7, 3, 5, rgba(PAL.sand, 0.7), 1)
  line(ctx, 19, 7, 21, 5, rgba(PAL.sand, 0.7), 1)
  rect(ctx, 2, 16, 20, 1, PAL.steelLight)
  rect(ctx, 4, 17, 16, 1, PAL.steelDark)
  pix(ctx, 9, 15, PAL.warn)
  pix(ctx, 15, 15, PAL.rustHot)
}

function drawPhaseMorning(ctx) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2
    const r0 = 6.6
    const r1 = i % 2 === 0 ? 10 : 8.5
    line(
      ctx,
      12 + Math.cos(a) * r0,
      10 + Math.sin(a) * r0,
      12 + Math.cos(a) * r1,
      10 + Math.sin(a) * r1,
      rgba(PAL.sand, 0.75),
      1,
    )
  }
  drawShape(ctx, 24, 24, predEllipse(12, 10, 5.4, 5.4), PAL.ochre, PAL.rustDark)
  for (let y = 5; y <= 12; y++) {
    for (let x = 5; x <= 18; x++) {
      if (predEllipse(11, 9, 3.2, 3.2)(x, y)) rect(ctx, x, y, 1, 1, PAL.sand)
    }
  }
  pix(ctx, 9, 7, PAL.bone)
  rect(ctx, 2, 17, 8, 1, rgba(PAL.steelLight, 0.35))
  rect(ctx, 13, 18, 8, 1, rgba(PAL.steelLight, 0.22))
}

function drawPhaseNoon(ctx) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    line(
      ctx,
      12 + Math.cos(a) * 7,
      10 + Math.sin(a) * 7,
      12 + Math.cos(a) * 9,
      10 + Math.sin(a) * 9,
      rgba(PAL.bone, 0.65),
      1,
    )
  }
  drawShape(ctx, 24, 24, predEllipse(12, 10, 5.6, 5.6), PAL.sand, PAL.ochre)
  for (let y = 5; y <= 14; y++) {
    for (let x = 5; x <= 19; x++) {
      if (predEllipse(11.5, 9.5, 3.4, 3.4)(x, y)) rect(ctx, x, y, 1, 1, PAL.bone)
    }
  }
  pix(ctx, 10, 8, PAL.white)
  pix(ctx, 9, 7, PAL.white)
  pixelRing(ctx, 12, 10, 7.2, rgba(PAL.neonWarm, 0.35))
}

function drawPhaseAfternoon(ctx) {
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + (i / 5) * 1.8
    line(
      ctx,
      14 + Math.cos(a) * 7,
      12 + Math.sin(a) * 7,
      14 + Math.cos(a) * 9.5,
      12 + Math.sin(a) * 9.5,
      rgba(PAL.ochre, 0.7),
      1,
    )
  }
  drawShape(ctx, 24, 24, predEllipse(14, 12, 5.2, 5.2), PAL.ochre, PAL.rustDark)
  for (let y = 8; y <= 15; y++) {
    for (let x = 8; x <= 20; x++) {
      if (predEllipse(13, 11, 3, 3)(x, y)) rect(ctx, x, y, 1, 1, PAL.sand)
    }
  }
  rect(ctx, 4, 17, 10, 1, rgba(PAL.rustDark, 0.7))
  rect(ctx, 3, 18, 7, 1, rgba(PAL.steelDark, 0.8))
  pix(ctx, 19, 9, PAL.rustHot)
}

function drawPhaseDusk(ctx) {
  const disc = predEllipse(12, 16, 6.8, 6.8)
  drawShape(ctx, 24, 24, (x, y) => y <= 15 && disc(x, y), PAL.rust, PAL.rustDark)
  for (let y = 8; y <= 14; y++) {
    for (let x = 4; x <= 20; x++) {
      if (predEllipse(12, 15, 4.2, 4.2)(x, y)) rect(ctx, x, y, 1, 1, PAL.rustHot)
    }
  }
  rect(ctx, 2, 13, 6, 1, rgba(PAL.rustLight, 0.55))
  rect(ctx, 16, 13, 6, 1, rgba(PAL.rustLight, 0.55))
  rect(ctx, 2, 16, 20, 1, PAL.sandDark)
  rect(ctx, 4, 17, 16, 1, PAL.steelDark)
  pix(ctx, 8, 15, PAL.neonWarm)
  pix(ctx, 16, 15, PAL.rustHot)
  pix(ctx, 5, 6, PAL.steelLight)
  pix(ctx, 6, 5, PAL.steelLight)
  pix(ctx, 7, 6, PAL.steelLight)
  pix(ctx, 16, 8, PAL.steelLight)
  pix(ctx, 17, 7, PAL.steelLight)
  pix(ctx, 18, 8, PAL.steelLight)
}

function drawPhaseNight(ctx) {
  pix(ctx, 5, 4, PAL.signal)
  pix(ctx, 8, 8, PAL.bone)
  pix(ctx, 18, 5, PAL.neonCold)
  pix(ctx, 20, 11, PAL.signal)
  pix(ctx, 4, 12, PAL.bone)
  const outer = predEllipse(11, 11, 6.2, 6.2)
  const bite = predEllipse(14.6, 8.6, 5.6, 5.6)
  drawShape(ctx, 24, 24, (x, y) => outer(x, y) && !bite(x, y), PAL.bone, PAL.steelLight)
  pix(ctx, 7, 10, PAL.boneDark)
  pix(ctx, 8, 14, PAL.boneDark)
  pix(ctx, 10, 13, PAL.boneDark)
  rect(ctx, 2, 19, 20, 1, rgba(PAL.steelLight, 0.28))
  rect(ctx, 5, 20, 14, 1, rgba(PAL.steelLight, 0.16))
}

const DAY_PHASE_DRAW = {
  dawn: drawPhaseDawn,
  morning: drawPhaseMorning,
  noon: drawPhaseNoon,
  afternoon: drawPhaseAfternoon,
  dusk: drawPhaseDusk,
  night: drawPhaseNight,
}
const dayPhaseIconCache = new Map()

export function getDayPhaseIcon(phaseId) {
  const key = Object.prototype.hasOwnProperty.call(DAY_PHASE_DRAW, phaseId) ? phaseId : 'noon'
  if (!dayPhaseIconCache.has(key)) {
    dayPhaseIconCache.set(
      key,
      makeTex(24, 24, (ctx) => DAY_PHASE_DRAW[key](ctx), { wrap: 'clamp', anchor: 'center' }),
    )
  }
  return dayPhaseIconCache.get(key)
}

/* ---------------- 设置分类 ---------------- */

function drawSettingsVisual(ctx) {
  line(ctx, 4, 4, 6, 2, rgba(PAL.steelLight, 0.7), 1)
  line(ctx, 10, 3, 10, 1, rgba(PAL.steelLight, 0.7), 1)
  line(ctx, 16, 4, 14, 2, rgba(PAL.steelLight, 0.7), 1)
  drawShape(ctx, 20, 20, predEllipse(10, 10, 8.4, 5.4), PAL.bone, PAL.steelDark)
  for (let y = 5; y <= 15; y++) {
    for (let x = 5; x <= 15; x++) {
      if (predEllipse(10, 10, 4, 4)(x, y)) rect(ctx, x, y, 1, 1, PAL.steelLight)
    }
  }
  for (let y = 7; y <= 13; y++) {
    for (let x = 7; x <= 13; x++) {
      if (predEllipse(10, 10, 2.5, 2.5)(x, y)) rect(ctx, x, y, 1, 1, PAL.black)
    }
  }
  pix(ctx, 8, 8, PAL.white)
  pix(ctx, 9, 8, PAL.bone)
  pix(ctx, 10, 10, PAL.neonCold)
  pix(ctx, 2, 10, PAL.steelLight)
  pix(ctx, 17, 10, PAL.steelLight)
}

function drawSettingsInput(ctx) {
  line(ctx, 10, 2, 10, 5, PAL.steel, 1)
  drawShape(ctx, 20, 20, predRoundRect(1, 5, 18, 14, 3), PAL.steelDark, PAL.black)
  rect(ctx, 2, 5, 16, 1, PAL.steelLight)
  // 十字键
  rect(ctx, 4, 9, 5, 1, PAL.steelLight)
  rect(ctx, 6, 7, 1, 5, PAL.steelLight)
  rect(ctx, 5, 10, 3, 1, PAL.steel)
  // 四个按钮
  pix(ctx, 14, 8, PAL.neonWarm)
  pix(ctx, 16, 10, PAL.danger)
  pix(ctx, 14, 12, PAL.neonCold)
  pix(ctx, 12, 10, PAL.toxicGlow)
  // 摇杆
  pixelRing(ctx, 10, 14, 2.4, PAL.steelLight)
  pix(ctx, 10, 14, PAL.steelWhite)
  rect(ctx, 2, 13, 2, 2, PAL.steel)
  rect(ctx, 16, 13, 2, 2, PAL.steel)
}

function drawSettingsAudio(ctx) {
  drawShape(ctx, 20, 20, predRect(3, 8, 6, 12), PAL.steelLight, PAL.black)
  drawShape(ctx, 20, 20, predPoly([[5, 9], [10, 4], [10, 16], [5, 11]]), PAL.steelLight, PAL.black)
  pix(ctx, 5, 9, PAL.bone)
  pix(ctx, 4, 9, PAL.bone)
  arc(ctx, 10, 10, 5, -0.55, 0.55, rgba(PAL.signal, 0.85), 1, 0)
  arc(ctx, 10, 10, 7, -0.55, 0.55, rgba(PAL.signal, 0.55), 1, 0)
  arc(ctx, 10, 10, 9, -0.55, 0.55, rgba(PAL.signal, 0.3), 1, 0)
}

const SETTINGS_DRAW = {
  visual: drawSettingsVisual,
  input: drawSettingsInput,
  audio: drawSettingsAudio,
}
const settingsIconCache = new Map()

export function getSettingsIcon(name) {
  const key = Object.prototype.hasOwnProperty.call(SETTINGS_DRAW, name) ? name : 'visual'
  if (!settingsIconCache.has(key)) {
    settingsIconCache.set(
      key,
      makeTex(20, 20, (ctx) => SETTINGS_DRAW[key](ctx), { wrap: 'clamp', anchor: 'center' }),
    )
  }
  return settingsIconCache.get(key)
}

/* ---------------- 手柄按键 ---------------- */

const PAD_GLYPHS = {
  A: ['.1.', '1.1', '111', '1.1', '1.1'],
  B: ['11.', '1.1', '11.', '1.1', '11.'],
  X: ['1.1', '.1.', '1.1'],
  Y: ['1.1', '.1.', '.1.', '.1.'],
  L: ['1..', '1..', '1..', '111'],
  R: ['11.', '1.1', '11.', '1.1', '1.1'],
}

const PAD_STYLE = {
  A: { tint: PAL.toxicGlow, glyph: 'A' },
  B: { tint: PAL.danger, glyph: 'B' },
  X: { tint: PAL.neonCold, glyph: 'X' },
  Y: { tint: PAL.neonWarm, glyph: 'Y' },
  LB: { tint: PAL.steelWhite, glyph: 'L', shoulder: true },
  RB: { tint: PAL.steelWhite, glyph: 'R', shoulder: true },
  Start: { tint: PAL.bone },
  Back: { tint: PAL.steelLight },
  Stick: { tint: PAL.neon },
}

function padPlate(ctx, tint) {
  drawShape(ctx, 20, 20, predEllipse(10, 10, 8.2, 8.2), PAL.steelDark, PAL.black)
  pixelRing(ctx, 10, 10, 6.2, tint)
  pix(ctx, 6, 3, rgba(PAL.steelWhite, 0.6))
  pix(ctx, 5, 4, rgba(PAL.steelWhite, 0.4))
}

function drawPadButton(ctx, key) {
  const st = PAD_STYLE[key]
  padPlate(ctx, st.tint)
  const rows = PAD_GLYPHS[st.glyph]
  const w = rows[0].length
  const h = rows.length
  pixelGlyph(ctx, rows, Math.round(10 - w / 2), Math.round(10 - h / 2), st.tint)
}

function drawPadShoulder(ctx, key) {
  const st = PAD_STYLE[key]
  drawShape(ctx, 20, 20, predRoundRect(2, 5, 17, 12, 2), PAL.steelDark, PAL.black)
  rect(ctx, 3, 5, 15, 1, st.tint)
  rect(ctx, 4, 7, 13, 1, PAL.steel)
  pixelGlyph(ctx, PAD_GLYPHS[st.glyph], 9, 10, st.tint)
  pix(ctx, 4, 11, PAL.steelLight)
  pix(ctx, 16, 11, PAL.steelLight)
}

function drawPadStart(ctx) {
  padPlate(ctx, PAD_STYLE.Start.tint)
  rect(ctx, 6, 7, 8, 1, PAL.bone)
  rect(ctx, 6, 9, 8, 1, PAL.bone)
  rect(ctx, 6, 11, 8, 1, PAL.bone)
}

function drawPadBack(ctx) {
  padPlate(ctx, PAD_STYLE.Back.tint)
  drawShape(ctx, 20, 20, predPoly([[12, 5], [5, 10], [12, 15]]), PAL.steelLight, PAL.black)
  pix(ctx, 13, 10, PAL.steelLight)
}

function drawPadStick(ctx) {
  padPlate(ctx, PAD_STYLE.Stick.tint)
  pixelRing(ctx, 10, 10, 4.2, PAL.steelLight)
  for (let y = 7; y <= 13; y++) {
    for (let x = 7; x <= 13; x++) {
      if (predEllipse(10, 10, 2.4, 2.4)(x, y)) rect(ctx, x, y, 1, 1, PAL.steelDark)
    }
  }
  pix(ctx, 10, 10, PAL.neon)
  rect(ctx, 9, 4, 2, 1, PAL.steelLight)
  rect(ctx, 9, 15, 2, 1, PAL.steelLight)
  rect(ctx, 4, 9, 1, 2, PAL.steelLight)
  rect(ctx, 15, 9, 1, 2, PAL.steelLight)
}

const PAD_DRAW = {
  A: (ctx) => drawPadButton(ctx, 'A'),
  B: (ctx) => drawPadButton(ctx, 'B'),
  X: (ctx) => drawPadButton(ctx, 'X'),
  Y: (ctx) => drawPadButton(ctx, 'Y'),
  LB: (ctx) => drawPadShoulder(ctx, 'LB'),
  RB: (ctx) => drawPadShoulder(ctx, 'RB'),
  Start: drawPadStart,
  Back: drawPadBack,
  Stick: drawPadStick,
}
const gamepadIconCache = new Map()

export function getGamepadIcon(button) {
  const key = Object.prototype.hasOwnProperty.call(PAD_DRAW, button) ? button : 'A'
  if (!gamepadIconCache.has(key)) {
    gamepadIconCache.set(
      key,
      makeTex(20, 20, (ctx) => PAD_DRAW[key](ctx), { wrap: 'clamp', anchor: 'center' }),
    )
  }
  return gamepadIconCache.get(key)
}