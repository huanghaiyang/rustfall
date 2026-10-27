// ============================================================================
// 锈雨 · RUSTFALL —— 废土世界背景 / 地表贴图（程序化 Canvas2D → THREE.CanvasTexture）
//
//   对外契约（docs/CONTENT-API.md §6.5）：
//     getBiomeArt(biomeId) -> {
//       sky, far, mid, near, ground, groundTop, fogColor, ambient
//     }
//
//   规格：
//     sky          256×256  垂直渐变，S/T 均 Clamp，直接拉伸铺满屏幕
//     far/mid/near 1280×560 视差三层；S=Repeat（横向无缝）/ T=Clamp；上方 alpha=0 透出天空
//     ground       32×32    四向平铺的内壁 / 地面材质（S/T=Repeat）
//     groundTop    32×32    带地表边缘的地面砖（S=Repeat / T=Clamp）
//     fogColor     0xRRGGBB 该 biome 的雾色
//     ambient      0xRRGGBB 该 biome 的环境染色
//
//   约定：
//    · 不使用任何外部素材；每个像素都由确定性 hash / PRNG 现场生成，同一 biome 永远一致。
//    · 全部 NearestFilter ×2、generateMipmaps=false、SRGBColorSpace、needsUpdate=true，按 id 缓存。
//    · 横向无缝靠「周期性」实现：所有落笔按 x 取模（Raster 内建），噪声格点在 x 上以
//      W/cell 为周期 → 第 0 列与第 W-1 列在平铺时天然连续。
//    · 景深：远层最淡（大气消光最强）→ 中层轮廓清晰 → 近层接近纯黑、体块最实。
//    · 配色只从 palette.js 混出；毒绿只出现在酸水 / 雾气 / 极少量灯点上。
//    · 地表明暗一律量化成像素块（groundTop 顶部 2×2 块 + 抖动过渡），不做平滑渐变。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { makeRng, hash2 } from '../rng.js'
import { TS } from '../../config.js'

const TAU = Math.PI * 2
const BG_W = 1280
const BG_H = 560
const SKY_SIZE = 256
const TILE = TS > 0 ? TS : 32

/** 四个 biome（getBiomeArt 认的 id） */
export const BIOME_ART_IDS = ['city', 'village', 'factory', 'dump', 'metro', 'hospital', 'port']

/* ============================================================================
 * 1. 颜色工具（只混 palette.js 里的颜色 → 不引入新色相）
 * ========================================================================== */

const HEX_CACHE = new Map()
const MIX_CACHE = new Map()

function hexRgb(hex) {
  // 允许直接传 rgb 数组（风格表里常常把已经混好的颜色再混一次）
  if (Array.isArray(hex)) return hex
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

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** rgb 数组混合（返回新数组，绝不复用入参） */
function mixRgb(a, b, t) {
  const k = clamp01(t)
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

/** 两个颜色混色（带缓存）。两个参数都可以是 '#rrggbb' 或 [r,g,b]。 */
function mixHex(ha, hb, t) {
  const k = Math.round(clamp01(t) * 1000)
  const key =
    (typeof ha === 'string' ? ha : ha.join(',')) +
    '|' +
    (typeof hb === 'string' ? hb : hb.join(',')) +
    '|' +
    k
  const hit = MIX_CACHE.get(key)
  if (hit) return hit
  const out = mixRgb(hexRgb(ha), hexRgb(hb), k / 1000)
  MIX_CACHE.set(key, out)
  return out
}

/** 压暗：向 PAL.void 靠 */
function darker(c, t) {
  return mixRgb(c, hexRgb(PAL.void), t)
}

/** 提亮：向 PAL.white 靠 */
function lighter(c, t) {
  return mixRgb(c, hexRgb(PAL.white), t)
}

/** 0xRRGGBB（给 fogColor / ambient 用） */
function hexNum(c) {
  return (clamp255(c[0]) << 16) | (clamp255(c[1]) << 8) | clamp255(c[2])
}

/* ============================================================================
 * 2. 噪声（横向周期性 → 天然无缝）
 * ========================================================================== */

/**
 * 周期 value noise。gx/gy 为「格点空间」坐标；
 * px>0 时 x 方向以 px 个格点为周期，py>0 时 y 同理（0 = 不循环）。
 */
function pnoise(gx, gy, px, py, seed) {
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const x0 = px > 0 ? ((ix % px) + px) % px : ix
  const x1 = px > 0 ? (x0 + 1) % px : ix + 1
  const y0 = py > 0 ? ((iy % py) + py) % py : iy
  const y1 = py > 0 ? (y0 + 1) % py : iy + 1
  const n00 = hash2(x0, y0, seed)
  const n10 = hash2(x1, y0, seed)
  const n01 = hash2(x0, y1, seed)
  const n11 = hash2(x1, y1, seed)
  const a = n00 + (n10 - n00) * sx
  const b = n01 + (n11 - n01) * sx
  return a + (b - a) * sy
}

/**
 * 横向周期 FBM。
 * 关键：横坐标的格点周期必须"正好"铺满 W —— 所以格宽取 W/round(W/cell)，
 * 而不是直接用 cell。否则 period 格点 × cell ≠ W，平铺接缝处噪声会跳变。
 */
function fbmX(x, y, W, cell, seed, oct = 3) {
  let sum = 0
  let amp = 1
  let norm = 0
  let c = cell
  for (let o = 0; o < oct; o++) {
    const px = Math.max(1, Math.round(W / c))
    const cw = W / px // 实际格宽：px * cw === W，保证周期精确等于贴图宽度
    sum += amp * pnoise(x / cw, y / cw, px, 0, seed + o * 131)
    norm += amp
    amp *= 0.5
    c = c * 0.5
  }
  return sum / norm
}

/** 四向可平铺 FBM（32×32 地砖用；同样把格宽吸附到 size/整数 上） */
function fbmTile(x, y, size, cell, seed, oct = 3) {
  let sum = 0
  let amp = 1
  let norm = 0
  let c = cell
  for (let o = 0; o < oct; o++) {
    const p = Math.max(1, Math.round(size / c))
    const cw = size / p
    sum += amp * pnoise(x / cw, y / cw, p, p, seed + o * 197)
    norm += amp
    amp *= 0.5
    c = c * 0.5
  }
  return sum / norm
}

/** 4×4 Bayer 有序抖动矩阵 → [0,1) */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
function dither01(x, y) {
  return (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16
}

/** 把颜色量化到 steps 档 + Bayer 抖动（像素块的明暗层次） */
function ditherRgb(c, x, y, steps = 12) {
  const step = 255 / steps
  const d = (dither01(x, y) - 0.5) * step
  return [
    clamp255(Math.round((c[0] + d) / step) * step),
    clamp255(Math.round((c[1] + d) / step) * step),
    clamp255(Math.round((c[2] + d) / step) * step),
  ]
}

/* ============================================================================
 * 3. 像素栅格（ImageData 直写；所有 x 自动取模 → 横向无缝）
 * ========================================================================== */

class Raster {
  constructor(w, h, data) {
    this.w = w
    this.h = h
    this.data = data
    this.n = w * h
  }

  /** 横向取模（平铺靠它） */
  wx(x) {
    const w = this.w
    if (x >= 0 && x < w) return x
    const m = ((x | 0) % w + w) % w
    return m
  }

  /** 不透明落笔 */
  opaque(x, y, c) {
    if (y < 0 || y >= this.h) return
    const i = ((y * this.w + this.wx(x)) << 2)
    const d = this.data
    d[i] = c[0]
    d[i + 1] = c[1]
    d[i + 2] = c[2]
    d[i + 3] = 255
  }

  /** 正确的 source-over 混合（保留未预乘语义） */
  alpha(x, y, c, a) {
    if (a <= 0.0035) return
    if (y < 0 || y >= this.h) return
    const i = ((y * this.w + this.wx(x)) << 2)
    const d = this.data
    const sa = a > 1 ? 1 : a
    const da = d[i + 3] / 255
    const oa = sa + da * (1 - sa)
    if (oa <= 0) return
    const k = da * (1 - sa) / oa
    const sk = sa / oa
    d[i] = c[0] * sk + d[i] * k
    d[i + 1] = c[1] * sk + d[i + 1] * k
    d[i + 2] = c[2] * sk + d[i + 2] * k
    d[i + 3] = oa * 255
  }

  /** 水平填充（含 x0..x1，y 单行） */
  hf(x0, x1, y, c, a = 1) {
    if (y < 0 || y >= this.h) return
    const xa = Math.ceil(x0)
    const xb = Math.ceil(x1)
    if (xb < xa) return
    for (let x = xa; x <= xb; x++) {
      if (a >= 1) this.opaque(x, y, c)
      else this.alpha(x, y, c, a)
    }
  }

  /** 垂直填充：列 x，行 [y0, y1) */
  vfill(x, y0, y1, c, a = 1) {
    const ya = Math.ceil(y0)
    const yb = Math.ceil(y1)
    if (yb <= ya) return
    const ix = this.wx(x)
    for (let y = ya; y < yb; y++) {
      if (y < 0) continue
      if (y >= this.h) break
      if (a >= 1) {
        const i = ((y * this.w + ix) << 2)
        const d = this.data
        d[i] = c[0]
        d[i + 1] = c[1]
        d[i + 2] = c[2]
        d[i + 3] = 255
      } else {
        this.alpha(ix, y, c, a)
      }
    }
  }

  /** 矩形：x 自动绕圈，y 裁剪 */
  rect(x, y, rw, rh, c, a = 1) {
    const ya = Math.ceil(y)
    const yb = Math.ceil(y + rh)
    if (yb <= ya || rw <= 0) return
    const x1 = x + rw - 1
    for (let yy = ya; yy < yb; yy++) this.hf(x, x1, yy, c, a)
  }

  /** 扫描线多边形填充（平行四边形 / 斜面墙体） */
  poly(pts, c, a = 1) {
    if (!pts || pts.length < 3) return
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < pts.length; i++) {
      const y = pts[i][1]
      if (y < lo) lo = y
      if (y > hi) hi = y
    }
    const xs = []
    for (let y = Math.ceil(lo); y < Math.ceil(hi); y++) {
      xs.length = 0
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const q = pts[(i + 1) % pts.length]
        const y0 = p[1]
        const y1 = q[1]
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          const t = (y - y0) / (y1 - y0)
          xs.push(p[0] + (q[0] - p[0]) * t)
        }
      }
      if (xs.length < 2) continue
      xs.sort((m, n) => m - n)
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.round(xs[i])
        const xb = Math.round(xs[i + 1])
        if (xb > xa) this.hf(xa, xb - 1, y, c, a)
      }
    }
  }

  /** 线（Bresenham 风格等分；thick 为方块边长） */
  line(x0, y0, x1, y1, c, a = 1, thick = 1) {
    const dx = x1 - x0
    const dy = y1 - y0
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const px = Math.round(x0 + dx * t)
      const py = Math.round(y0 + dy * t)
      if (thick <= 1) {
        this.alpha(px, py, c, a)
      } else {
        const hw = (thick - 1) * 0.5
        this.rect(px - hw, py - hw, thick, thick, c, a)
      }
    }
  }

  /** 取 alpha */
  getA(x, y) {
    if (y < 0 || y >= this.h) return 0
    return this.data[((y * this.w + this.wx(x)) << 2) + 3]
  }
}

/* ============================================================================
 * 4. 通用剪影构件（全部按 x 取模绘制 → 图层横向无缝）
 * ========================================================================== */

/** 逐列顶部轮廓填充：topFn(x) → 该列从上往下填充到 baseY */
function colFill(r, x0, x1, topFn, baseY, col, a = 1) {
  for (let x = x0; x <= x1; x++) {
    const t = Math.round(topFn(x))
    if (t >= baseY) continue
    r.vfill(x, t, baseY, col, a)
  }
}

/** 长条形塔楼：破口顶 + 两翼暗边 + 顶部背光轮廓 + 窗洞（可带少量暖灯） */
function tower(r, x0, w, topY, baseY, col, o = {}) {
  const rw = Math.max(5, Math.round(w))
  const top = Math.round(topY)
  const seed = o.seed || 0x7a1
  const dark = o.dark || darker(col, 0.52)
  const edge = o.edge || darker(col, 0.3)
  const rim = o.rim || lighter(col, 0.16)
  const notch = new Array(rw)
  for (let i = 0; i < rw; i++) {
    const n = hash2(r.wx(x0 + i), seed & 0xffff, seed)
    notch[i] = n > 0.74 ? Math.round(2 + (n - 0.74) * 64) : 0
  }
  if (o.shear) {
    const sh = Math.round(o.shear)
    for (let i = 0; i < rw; i++) {
      const t = o.shearDir === -1 ? 1 - i / rw : i / rw
      notch[i] += Math.round(sh * t * t)
    }
  }
  // 主体
  for (let i = 0; i < rw; i++) {
    const t = top + notch[i]
    if (t < baseY) r.vfill(x0 + i, t, baseY, col)
  }
  // 两翼 + 顶部轮廓
  r.vfill(x0, top + notch[0], baseY, dark)
  r.vfill(x0 + rw - 1, top + notch[rw - 1], baseY, dark)
  if (rw > 2) r.vfill(x0 + 1, top + notch[1], baseY, edge)
  if (o.rim !== 0) {
    for (let i = 0; i < rw; i++) {
      const i2 = i
      const t = top + notch[i2]
      if (t < baseY) r.alpha(x0 + i, t, rim, 0.55)
      if (i > 0 && notch[i] !== notch[i - 1]) {
        // 破口的竖直断面
        const ya = top + Math.min(notch[i], notch[i - 1])
        const yb = top + Math.max(notch[i], notch[i - 1])
        r.vfill(x0 + i, ya, yb + 1, dark)
      }
    }
  }
  // 天线 / 断桅
  if (o.antenna) {
    const ax = x0 + Math.round(rw * (o.antennaX != null ? o.antennaX : 0.5))
    const ah = Math.round(o.antenna)
    const ay = top + Math.min.apply(null, notch) - ah
    r.vfill(ax, ay, top + 2, col)
    r.hf(ax - 3, ax + 3, ay + 4, col)
    r.hf(ax - 1, ax + 1, ay + 9, edge)
    r.alpha(ax, ay, rim, 0.7)
  }
  // 窗洞
  if (o.winCol) {
    const cw = o.cellW || 3
    const chh = o.cellH || 5
    const cols = o.cols || Math.max(1, Math.floor((rw - 8) / (cw + 5)))
    const rows = o.rows || Math.max(1, Math.floor((baseY - top - 16) / (chh + 9)))
    winGrid(r, x0 + 5, top + 14 + (o.winOffsetY || 0), cols, rows, cw, chh, o.winCol, seed ^ 0x5e, {
      gapX: o.gapX != null ? o.gapX : 5,
      gapY: o.gapY != null ? o.gapY : 9,
      skip: o.skip != null ? o.skip : 0.32,
      lit: o.litCol,
      litChance: o.litChance || 0,
    })
  }
  // 楼层横带
  if (o.bandCol && rw > 10) {
    for (let y = top + 26; y < baseY - 4; y += (o.bandGap || 30)) {
      r.hf(x0 + 2, x0 + rw - 3, y, o.bandCol, 0.55)
    }
  }
  return { top: top, notch: notch, dark: dark }
}

/** 窗洞网格：按 hash 随机跳过，少量亮窗（设备灯光） */
function winGrid(r, x, y, cols, rows, cw, ch, col, seed, o = {}) {
  const gapX = o.gapX != null ? o.gapX : Math.max(2, cw)
  const gapY = o.gapY != null ? o.gapY : Math.max(2, ch)
  const skip = o.skip != null ? o.skip : 0.34
  const lit = o.lit
  const litChance = o.litChance || 0
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  for (let row = 0; row < rows; row++) {
    for (let col2 = 0; col2 < cols; col2++) {
      const h = hash2(col2 + x0, row + y0, seed)
      if (h < skip) continue
      const wx = Math.round(x0 + col2 * (cw + gapX))
      const wy = Math.round(y0 + row * (ch + gapY))
      r.rect(wx, wy, cw, ch, col)
      if (lit && h > 1 - litChance) {
        r.rect(wx, wy, Math.max(1, cw - 1), 1, lit, 0.9)
        r.alpha(wx + (cw >> 1), wy + 1, lit, 0.45)
      }
    }
  }
}

/** 竖向锈迹 / 水渍：从某行往下拖出的窄条 */
function streaks(r, x0, w, y0, y1, col, seed, density = 0.25, maxA = 0.5) {
  const n = Math.max(1, Math.round(w * density * 0.12))
  const rng = makeRng(seed >>> 0)
  for (let i = 0; i < n; i++) {
    const sx = x0 + Math.round(rng.next() * w)
    const len = Math.round((y1 - y0) * (0.15 + rng.next() * 0.55))
    const a0 = 0.12 + rng.next() * maxA
    const top = y0 + Math.round(rng.next() * (y1 - y0 - len))
    const wid = rng.next() > 0.7 ? 2 : 1
    for (let k = 0; k < len; k++) {
      const a = a0 * (1 - k / len)
      r.rect(sx, top + k, wid, 1, col, a)
    }
  }
}

/** 铁锈斑驳 / 明暗噪声（block 像素一块，保证是像素块而不是糊） */
function mottle(r, dark, light, seed, amount = 0.4, block = 3) {
  const d = r.data
  const w = r.w
  const h = r.h
  const inv = 1 / Math.max(0.001, amount)
  for (let y = 0; y < h; y++) {
    const by = (y / block) | 0
    for (let x = 0; x < w; x++) {
      const i = ((y * w + x) << 2)
      if (d[i + 3] === 0) continue
      const n = hash2((x / block) | 0, by, seed)
      if (n > 1 - amount) {
        r.alpha(x, y, light, (n - (1 - amount)) * inv * 0.55)
      } else if (n < amount * 0.85) {
        r.alpha(x, y, dark, (amount * 0.85 - n) * inv * 0.5)
      }
    }
  }
}

/** 大气消光：越靠下（越接近地平线/地面）越淡，用来做远层纵深 */
function aerialHaze(r, col, y0, y1, maxA, power = 1.6) {
  const w = r.w
  const d = r.data
  const span = Math.max(1, y1 - y0)
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(r.h, Math.ceil(y1)); y++) {
    const t = clamp01((y - y0) / span)
    const a = maxA * Math.pow(t, power)
    if (a <= 0.004) continue
    for (let x = 0; x < w; x++) {
      if (d[((y * w + x) << 2) + 3] === 0) continue
      r.alpha(x, y, col, a)
    }
  }
}

/** 贴地浓烟层：横向周期噪声 + alpha 量化（像素感） */
function smokeBand(r, y0, y1, col, maxA, seed, cell = 64) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(r.h, Math.ceil(y1)); y++) {
    const t = clamp01((y - y0) / Math.max(1, y1 - y0))
    const fall = Math.pow(1 - t, 1.6)
    for (let x = 0; x < r.w; x++) {
      const n = fbmX(x, y * 1.7, r.w, cell, seed, 2)
      let a = fall * maxA * clamp01((n - 0.4) / 0.52)
      if (a <= 0.018) continue
      a = Math.round(a * 12) / 12
      r.alpha(x, y, col, a)
    }
  }
}

/** 上升烟柱：一串扩散的软圆（每团带 2D 径向衰减 → 不会变成一坨实心圆饼） */
function smokePlume(r, x, baseY, topY, w0, w1, col, seed, o = {}) {
  const steps = o.steps || 22
  const drift = o.drift != null ? o.drift : 30
  const maxA = (o.alpha != null ? o.alpha : 0.42) * 0.42
  // 顶部留白：烟柱再高也要给"透明天空"让出 minY 行
  const minY = o.minY != null ? o.minY : 26
  for (let s = 0; s < steps; s++) {
    const t = s / (steps - 1)
    const cy = baseY + (topY - baseY) * t
    const cx = x + drift * t * t + Math.sin(t * 5.3 + seed * 0.7) * 10 * (0.25 + t)
    let rr = Math.max(2, (w0 + (w1 - w0) * t) * (0.55 + 0.45 * Math.sin(t * 8.4 + seed)))
    // 半径不许越过安全线（否则整团圆会盖住上方天空）
    const room = Math.max(2, cy - minY)
    if (rr > room) rr = room
    const a = maxA * (1 - t) * (0.55 + 0.45 * Math.sin(t * 6.7 + seed * 1.3))
    const rr2 = rr * rr + 1
    for (let dy = -rr; dy <= rr; dy++) {
      const ky = 1 - (dy * dy) / rr2
      if (ky <= 0) continue
      const half = rr * Math.sqrt(ky)
      const half2 = half * half + 1
      const py = Math.round(cy + dy)
      if (py < minY) continue
      for (let dx = -half; dx <= half; dx += 1) {
        const px = Math.round(cx + dx)
        if (hash2(px, py, seed) < 0.18) continue
        const kx = 1 - (dx * dx) / half2
        if (kx <= 0) continue
        r.alpha(px, py, col, a * Math.sqrt(ky * kx))
      }
    }
  }
}

/** 竖向空气透视：越靠上越暗（让远处高楼的顶部不至于像纸片贴在天空上） */
function verticalShade(r, yTop, yBase, darkCol, amount) {
  const span = Math.max(1, yBase - yTop)
  for (let y = Math.max(0, Math.round(yTop)); y < Math.min(r.h, Math.round(yBase)); y++) {
    const t = (y - yTop) / span
    const a = amount * (1 - t) * (1 - t)
    if (a <= 0.004) continue
    for (let x = 0; x < r.w; x++) {
      if (r.getA(x, y) === 0) continue
      r.alpha(x, y, darkCol, a)
    }
  }
}

/** 坍塌的板楼：斜置平行四边形 + 断口 + 露出的钢筋 */
function slabWreck(r, x, w, topY, baseY, lean, col, o = {}) {
  const dark = o.dark || darker(col, 0.5)
  const rim = o.rim || lighter(col, 0.14)
  const x0 = x
  const x1 = x + w
  const tl = [x0 + lean, topY]
  const tr = [x1 + lean * 0.4, topY + Math.abs(lean) * 0.25]
  const br = [x1, baseY]
  const bl = [x0, baseY + Math.abs(lean) * 0.1]
  r.poly([tl, tr, br, bl], col)
  // 顶面断口锯齿
  const steps = Math.ceil(w)
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const tx = Math.round(tl[0] + (tr[0] - tl[0]) * t)
    const ty = Math.round(tl[1] + (tr[1] - tl[1]) * t)
    const notch = hash2(tx, 13, o.seed || 0x51ab) > 0.66 ? 2 + Math.round(hash2(tx, 17, o.seed || 0x51ab) * 13) : 0
    if (notch > 0) {
      // 用透明的「挖掉」不好做，改为在缺口处补天光色？→ 直接抬高被填的区域
      r.alpha(tx, ty, rim, 0.5)
    }
    r.alpha(tx, ty + notch, rim, 0.35)
  }
  // 楼板分层
  const floors = Math.max(2, Math.floor((baseY - topY) / 26))
  for (let f = 1; f < floors; f++) {
    const t = f / floors
    const ya = Math.round(tl[1] + (bl[1] - tl[1]) * t)
    const yb = Math.round(tr[1] + (br[1] - tr[1]) * t)
    r.line(tl[0] + (bl[0] - tl[0]) * t, ya, tr[0] + (br[0] - tr[0]) * t, yb, dark, 0.75)
  }
  // 露出的钢筋
  const rb = o.rebar || 0
  for (let i = 0; i < rb; i++) {
    const t = (i + 0.5) / rb
    const bx = Math.round(tl[0] + (tr[0] - tl[0]) * t)
    const by = Math.round(tl[1] + (tr[1] - tl[1]) * t)
    const len = 6 + Math.round(hash2(i, 3, 0x9e1) * 16)
    const ang = -0.6 + hash2(i, 5, 0x9e1) * 1.2
    r.line(bx, by + 1, bx + Math.sin(ang) * len, by - Math.cos(ang) * len, o.rebarCol || col, 1, 1)
  }
  // 侧面暗边
  r.line(tl[0], tl[1], bl[0], bl[1], dark, 0.85)
  r.line(tr[0], tr[1], br[0], br[1], dark, 0.6)
}

/** 高架桥：桥面 + 桥墩 + 断口 */
function overpass(r, x0, x1, y, th, col, o = {}) {
  const dark = o.dark || darker(col, 0.55)
  const rim = o.rim || lighter(col, 0.12)
  const gapAt = o.gapAt != null ? o.gapAt : -1
  const gapW = o.gapW || 90
  for (let x = x0; x <= x1; x++) {
    if (x > gapAt && x < gapAt + gapW) continue
    r.vfill(x, y, y + th, col)
  }
  // 桥面亮边 / 底面暗边
  for (let x = x0; x <= x1; x++) {
    if (x > gapAt && x < gapAt + gapW) continue
    r.alpha(x, y, rim, 0.6)
    r.alpha(x, y + th - 1, dark, 0.8)
  }
  // 护栏竖杆
  if (o.rail) {
    for (let x = x0 + 3; x <= x1; x += 9) {
      if (x > gapAt && x < gapAt + gapW) continue
      if (hash2(x, 2, o.seed || 0x2f1) < 0.2) continue
      r.vfill(x, y - 7, y, col)
    }
    for (let x = x0; x <= x1; x++) {
      if (x > gapAt && x < gapAt + gapW) continue
      r.alpha(x, y - 7, col, 0.9)
    }
  }
  // 桥墩
  const pierGap = o.pierGap || 150
  for (let px = x0 + 40; px < x1; px += pierGap) {
    if (px > gapAt - 10 && px < gapAt + gapW + 10) continue
    const pw = o.pierW || 13
    r.vfill(px, y + th, o.baseY || r.h, col)
    r.vfill(px + 1, y + th, o.baseY || r.h, col)
    r.vfill(px + pw - 1, y + th, o.baseY || r.h, dark)
    for (let i = 0; i < pw; i += 2) r.alpha(px + i, y + th, dark, 0.5)
  }
  // 断口两端垂下的钢筋 / 塌落残块
  if (gapAt >= 0) {
    for (let i = 0; i < 7; i++) {
      const gx = gapAt - 1 - i * 2
      const gy = y + 1 + Math.round(hash2(i, 8, 0x3c) * 9)
      r.vfill(gx, y, gy, col)
    }
    for (let i = 0; i < 8; i++) {
      const gx = gapAt + gapW + 1 + i * 2
      const gy = y + 1 + Math.round(hash2(i, 9, 0x3c) * 8)
      r.vfill(gx, y, gy, col)
    }
  }
}

/** 枯树：弯曲主干 + 两级枝条（深度递归由 depth 控制） */
function deadTree(r, x, baseY, height, col, seed, o = {}) {
  const rng = makeRng((seed >>> 0) || 1)
  const thick = o.thick || 3
  const lean = o.lean || 0
  const wob = o.wobble != null ? o.wobble : 2
  const segs = Math.max(4, Math.round(height / 11))
  const pts = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    pts.push([
      x + lean * t * t * height * 0.4 + Math.sin(t * 3.1 + seed) * wob * (1 - t * 0.4),
      baseY - height * t,
    ])
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1)
    const w = Math.max(1, Math.round(thick * (1 - t * 0.8)))
    r.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col, 1, w)
  }
  // 枝条
  const branch = o.branches != null ? o.branches : 5
  for (let b = 0; b < branch; b++) {
    const t = 0.38 + 0.58 * ((b + 0.5) / branch)
    const idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))
    const p = pts[idx]
    const side = b % 2 === 0 ? 1 : -1
    const len = height * (0.16 + rng.next() * 0.2)
    const ang = -0.55 * side - (rng.next() - 0.5) * 0.5
    const ex = p[0] + Math.sin(ang) * len * side
    const ey = p[1] - Math.abs(Math.cos(ang)) * len
    r.line(p[0], p[1], ex, ey, col, 1, Math.max(1, Math.round(thick * 0.4)))
    // 二级细枝
    const tw = 2 + Math.round(rng.next() * 2)
    for (let k = 0; k < tw; k++) {
      const tt = 0.5 + 0.45 * (k / tw)
      const bx = p[0] + (ex - p[0]) * tt
      const by = p[1] + (ey - p[1]) * tt
      const l2 = len * (0.3 + rng.next() * 0.25)
      const a2 = ang - 0.5 - rng.next() * 0.5
      r.line(bx, by, bx + Math.sin(a2) * l2 * side, by - Math.abs(Math.cos(a2)) * l2, col, 1, 1)
    }
  }
  // 断口/树瘤
  if (o.knots) {
    for (let i = 0; i < o.knots; i++) {
      const t = 0.2 + rng.next() * 0.7
      const idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))
      r.rect(pts[idx][0] - 1, pts[idx][1], 3, 2, col)
    }
  }
}

/** 木栅栏 / 铁网：缺桩、断线 */
function fence(r, x0, x1, baseY, height, col, seed, o = {}) {
  const gap = o.postGap || 34
  const postW = o.postW || 2
  const miss = o.miss != null ? o.miss : 0.16
  for (let x = x0; x <= x1; x += gap) {
    if (hash2(x, 5, seed) < miss) continue
    const hh = height * (0.86 + hash2(x, 6, seed) * 0.2)
    r.vfill(x, baseY - hh, baseY, col)
    if (postW > 1) r.vfill(x + 1, baseY - hh + 1, baseY, col)
    if (o.postCap) r.rect(x - 1, baseY - hh - 1, postW + 2, 1, o.postCap)
  }
  // 横线（带轻微垂度与断口）
  const wires = o.wires || 3
  for (let w = 0; w < wires; w++) {
    const wy = baseY - height * (0.3 + 0.28 * w)
    for (let x = x0; x <= x1; x++) {
      const brk = hash2(Math.floor(x / 11), w, seed ^ 0x91) < 0.09
      if (brk) continue
      const sag = Math.round(Math.sin(((x - x0) / gap) * Math.PI) * 1.1)
      r.alpha(x, Math.round(wy + sag), col, 0.85)
    }
  }
  // 铁网斜纹
  if (o.mesh) {
    for (let x = x0; x <= x1; x++) {
      for (let y = baseY - height; y < baseY; y++) {
        if (((x + y) & 3) === 0) r.alpha(x, y, col, 0.5)
      }
    }
  }
}

/** 垂落的电缆 / 钢索 */
function cable(r, x0, x1, y, sag, col, o = {}) {
  const th = o.thick || 1
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / Math.max(1, x1 - x0)
    const yy = Math.round(y + Math.sin(t * Math.PI) * sag)
    r.vfill(x, yy, yy + th, col)
  }
  if (o.dangle) {
    for (let i = 0; i < o.dangle; i++) {
      const t = (i + 0.6) / o.dangle
      const dx = Math.round(x0 + (x1 - x0) * t)
      const dy = Math.round(y + Math.sin(t * Math.PI) * sag)
      const len = 5 + Math.round(hash2(dx, 7, 0x77) * 16)
      r.vfill(dx, dy, dy + len, col)
    }
  }
}

/** 垃圾/瓦砾堆（半椭圆剖面 + 噪声起伏） */
function mound(r, xc, halfW, height, baseY, col, seed, o = {}) {
  const power = o.power || 0.72
  const wobble = o.wobble != null ? o.wobble : 0.45
  const cell = o.cell || 26
  for (let i = -halfW; i <= halfW; i++) {
    const t = i / halfW
    const prof = Math.pow(Math.max(0, 1 - t * t), power)
    const n = fbmX(xc + i, 3, BG_W, cell, seed, 2)
    const hh = height * prof * (1 - wobble + wobble * 2 * n)
    const y0 = Math.round(baseY - hh)
    if (y0 < baseY) r.vfill(xc + i, y0, baseY, col)
  }
  if (o.rim) {
    for (let i = -halfW; i <= halfW; i++) {
      const t = i / halfW
      const prof = Math.pow(Math.max(0, 1 - t * t), power)
      const n = fbmX(xc + i, 3, BG_W, cell, seed, 2)
      const y0 = Math.round(baseY - height * prof * (1 - wobble + wobble * 2 * n))
      r.alpha(xc + i, y0, o.rim, 0.4)
    }
  }
}

/** 地平线山脊（周期函数 → 天然无缝） */
function ridge(r, col, yAt, baseY = r.h, a = 1) {
  for (let x = 0; x < r.w; x++) {
    const y = Math.round(yAt(x))
    if (y < baseY) r.vfill(x, y, baseY, col, a)
  }
}

/** 荒草 / 枯苇：一丛丛短线 */
function weeds(r, x0, x1, baseY, col, seed, o = {}) {
  const rng = makeRng((seed >>> 0) || 3)
  const count = o.count || Math.round((x1 - x0) * 0.1)
  for (let i = 0; i < count; i++) {
    const x = Math.round(x0 + rng.next() * (x1 - x0))
    const h = (o.hMin || 4) + rng.next() * ((o.hMax || 12) - (o.hMin || 4))
    const lean = (rng.next() - 0.5) * 0.7
    const c = rng.next() > 0.6 && o.hi ? o.hi : col
    for (let k = 0; k < h; k++) {
      const t = k / h
      r.alpha(x + Math.round(lean * t * t * h), Math.round(baseY - h + k), c, 0.55 + 0.45 * (1 - t))
    }
    if (rng.next() > 0.7) r.alpha(x, Math.round(baseY - h - 1), c, 0.5)
  }
}

/* ---- 工业构件 ------------------------------------------------------------ */

/** 烟囱：锥形 + 环箍 + 破口 + 可选烟柱 */
function chimney(r, x, w, topY, baseY, col, o = {}) {
  const rw = w
  const dark = o.dark || darker(col, 0.5)
  const light = o.light || lighter(col, 0.14)
  for (let y = Math.round(topY); y < baseY; y++) {
    const t = (y - topY) / Math.max(1, baseY - topY)
    let ww = rw * (1.15 - 0.3 * t)
    // 破口
    const n = hash2(y, 21, o.seed || 0x6ba)
    if (y < topY + 16 && n < 0.5) ww *= 0.72
    const x0 = Math.round(x - ww / 2)
    r.hf(x0, x0 + Math.round(ww), y, col)
    r.alpha(x0, y, dark, 0.75)
    r.alpha(x0 + 1, y, light, 0.35)
    r.alpha(x0 + Math.round(ww), y, dark, 0.6)
  }
  // 环箍
  const bands = o.bands || 5
  for (let b = 1; b <= bands; b++) {
    const y = Math.round(topY + (baseY - topY) * (b / (bands + 1)))
    const t = (y - topY) / Math.max(1, baseY - topY)
    const ww = rw * (1.15 - 0.3 * t)
    r.hf(Math.round(x - ww / 2), Math.round(x + ww / 2), y, dark, 0.65)
    r.alpha(Math.round(x - ww / 2), y, light, 0.4)
  }
  if (o.smoke) {
    smokePlume(r, x, topY, topY - o.smoke, rw * 0.5, rw * 2.4, o.smokeCol || col, o.seed || 0x77, {
      alpha: o.smokeAlpha || 0.4,
      drift: o.smokeDrift || 24,
      steps: o.smokeSteps || 20,
    })
  }
}

/** 冷却塔：双曲面收腰 + 条纹 + 蒸汽 */
function coolTower(r, x, w, topY, baseY, col, o = {}) {
  const dark = o.dark || darker(col, 0.5)
  const light = o.light || lighter(col, 0.12)
  const h = baseY - topY
  for (let y = Math.round(topY); y < baseY; y++) {
    const t = (y - topY) / Math.max(1, h)
    // t=0 顶部 0.66w，t=0.4 腰部 0.6w，t=1 底部 1.0w
    const waist = 0.64 - 0.1 * Math.sin(Math.min(1, t / 0.55) * Math.PI * 0.5) + 0.4 * Math.pow(t, 2.4)
    const ww = w * waist
    const x0 = Math.round(x - ww / 2)
    r.hf(x0, x0 + Math.round(ww), y, col)
    r.alpha(x0, y, dark, 0.7)
    r.alpha(x0 + 1, y, light, 0.3)
    // 竖向条纹（周期 7 → 横向平铺安全）
    if ((x0 + 3) % 7 === 0) r.alpha(x0 + 3, y, dark, 0.35)
  }
  for (let b = 1; b < 6; b++) {
    const y = Math.round(topY + h * (0.16 * b))
    const t = (y - topY) / Math.max(1, h)
    const waist = 0.64 - 0.1 * Math.sin(Math.min(1, t / 0.55) * Math.PI * 0.5) + 0.4 * Math.pow(t, 2.4)
    const ww = w * waist
    r.hf(Math.round(x - ww / 2), Math.round(x + ww / 2), y, dark, 0.45)
  }
  if (o.steam) {
    // 冷却塔蒸汽：高度和宽度都受限，避免糊到画面上边缘
    const rise = Math.min(o.steam, Math.max(30, topY * 0.45))
    const w0 = w * 0.2
    const w1 = Math.min(w * 0.5, rise * 0.55)
    smokePlume(r, x, topY, topY - rise, w0, w1, o.steamCol || col, 0x3f2, {
      alpha: o.steamAlpha || 0.3,
      drift: 34,
      steps: 18,
    })
  }
}

/** 集装箱 / 板房：波纹竖条 + 门缝 + 顶沿 */
function container(r, x, y, w, h, col, o = {}) {
  r.rect(x, y, w, h, col)
  const dark = o.dark || darker(col, 0.5)
  const light = o.light || lighter(col, 0.12)
  for (let i = 2; i < w - 1; i += 4) {
    r.vfill(x + i, y + 1, y + h - 1, dark, 0.45)
    r.vfill(x + i + 1, y + 1, y + h - 1, light, 0.22)
  }
  r.hf(x, x + w - 1, y, light, 0.8)
  r.hf(x, x + w - 1, y + h - 1, dark, 0.85)
  r.vfill(x, y, y + h, dark, 0.5)
  r.vfill(x + w - 1, y, y + h, dark, 0.6)
  // 门缝 + 把手
  const dx = x + Math.round(w * 0.62)
  r.vfill(dx, y + 2, y + h - 2, dark, 0.85)
  r.rect(dx + 2, y + Math.round(h * 0.45), 1, 4, light, 0.7)
  if (o.rust) streaks(r, x, w, y, y + h, o.rust, (o.seed || 0x3c1) >>> 0, 0.2, 0.5)
}

/** 龙门吊 / 塔吊：立柱 + 桁架 + 悬臂 + 吊钩 */
function crane(r, x, baseY, height, span, col, o = {}) {
  const legGap = o.legGap || Math.round(span * 0.16)
  const legW = o.legW || 4
  // 双腿
  r.vfill(x, baseY - height, baseY, col)
  r.vfill(x + 1, baseY - height, baseY, col)
  r.vfill(x + legGap, baseY - height, baseY, col)
  r.vfill(x + legGap + 1, baseY - height, baseY, col)
  // 桁架斜撑
  for (let y = baseY - height + 6; y < baseY - 4; y += 14) {
    r.line(x, y, x + legGap, y + 12, col, 0.85)
    r.line(x + legGap, y, x, y + 12, col, 0.85)
  }
  // 顶梁 / 悬臂
  const ty = baseY - height
  r.hf(x - span * 0.35, x + span, ty, col)
  r.hf(x - span * 0.35, x + span, ty + 1, col)
  r.hf(x - span * 0.35, x + span, ty + 2, darker(col, 0.4), 0.8)
  // 悬臂桁架
  for (let i = 0; i < span * 1.35; i += 10) {
    const bx = Math.round(x - span * 0.35 + i)
    r.line(bx, ty + 2, bx + 8, ty - 6, col, 0.7)
    r.line(bx + 8, ty - 6, bx + 18, ty + 2, col, 0.7)
  }
  // 配重
  r.rect(x - span * 0.35 - 12, ty + 2, 14, 9, darker(col, 0.35))
  // 吊钩
  const hx = x + span * 0.72
  const hy = ty + 3
  const hl = o.hookLen || 60
  r.vfill(hx, hy, hy + hl, col)
  r.rect(hx - 3, hy + hl, 7, 3, col)
  r.rect(hx - 2, hy + hl + 3, 2, 4, darker(col, 0.3))
}

/** 管道：横向圆柱 + 上高光 + 下暗边 + 法兰 + 支墩 */
function pipeRun(r, x0, x1, y, rad, col, o = {}) {
  const hi = o.hi || lighter(col, 0.22)
  const lo = o.lo || darker(col, 0.55)
  const top = Math.round(y - rad)
  const bot = Math.round(y + rad)
  for (let yy = top; yy <= bot; yy++) {
    const t = (yy - top) / Math.max(1, bot - top)
    let c = col
    if (t < 0.28) c = mixRgb(hi, col, t / 0.28)
    else if (t > 0.62) c = mixRgb(col, lo, (t - 0.62) / 0.38)
    r.hf(x0, x1, yy, c)
  }
  // 法兰
  const flangeGap = o.flangeGap || 140
  for (let x = x0 + flangeGap * 0.5; x <= x1; x += flangeGap) {
    r.rect(x, top - 2, 4, bot - top + 4, mixRgb(col, lo, 0.28))
    r.rect(x + 1, top - 1, 1, bot - top + 2, hi, 0.5)
  }
  // 锈迹下垂
  streaks(r, x0, x1 - x0, top, bot + 6, lo, (o.seed || 0x5d1) >>> 0, 0.12, 0.4)
  // 支墩
  if (o.legs) {
    for (let x = x0 + 70; x <= x1; x += (o.legGap || 210)) {
      r.rect(x, bot, 5, (o.legTo || r.h) - bot, lo)
      r.rect(x + 5, bot, 2, (o.legTo || r.h) - bot, darker(lo, 0.3))
    }
  }
}

/** 探照灯光柱（抖动 + 向下渐隐） */
function spotBeam(r, x, y, len, halfW, col, a, seed) {
  for (let i = 0; i < len; i++) {
    const t = i / len
    const hw = 2 + halfW * t
    const aa = a * (1 - t) * (0.68 + 0.32 * Math.sin(t * 13 + seed))
    const py = Math.round(y + i)
    for (let dx = -hw; dx <= hw; dx++) {
      const px = Math.round(x + dx)
      if (hash2(px, py, seed) < 0.34) continue
      r.alpha(px, py, col, aa)
    }
  }
}

/** 探照灯灯具本体 */
function spotLamp(r, x, y, col, o = {}) {
  const size = o.size || 6
  r.rect(x - size / 2, y - size / 2, size, size, col)
  r.rect(x - size / 2, y - size / 2, size, 2, darker(col, 0.4))
  r.rect(x - 1, y - size / 2 - 3, 2, 3, darker(col, 0.5))
  if (o.glow) r.alpha(x, y, o.glow, 0.9)
}

/** 桶 / 轮胎 / 板条箱之类的小剪影 */
function barrel(r, x, baseY, h, col, o = {}) {
  const w = o.w || 7
  r.rect(x, baseY - h, w, h, col)
  r.rect(x + 1, baseY - h + 2, w - 2, 1, darker(col, 0.45))
  r.rect(x + 1, baseY - h + h - 4, w - 2, 1, darker(col, 0.45))
  r.vfill(x, baseY - h, baseY, darker(col, 0.35))
  r.vfill(x + w - 1, baseY - h, baseY, darker(col, 0.5))
  if (o.rim) r.rect(x, baseY - h - 1, w, 1, o.rim)
}

function tire(r, x, baseY, rad, col, o = {}) {
  const cy = baseY - rad
  for (let dy = -rad; dy <= rad; dy++) {
    const k = 1 - (dy * dy) / (rad * rad + 1)
    if (k <= 0) continue
    const half = rad * Math.sqrt(k)
    for (let dx = -half; dx <= half; dx++) {
      const d = Math.hypot(dx, dy) / rad
      if (d < 0.42) continue
      const c = d > 0.82 ? darker(col, 0.35) : col
      r.alpha(Math.round(x + dx), Math.round(cy + dy), c, 1)
    }
  }
  if (o.hub) r.rect(x - 1, cy - 1, 2, 2, o.hub)
}

/* ============================================================================
 * 5. 天空（256×256 垂直渐变，可整幅拉伸）
 * ========================================================================== */

/** 非周期 FBM（天空不参与平铺） */
function fbmRaw(x, y, cell, seed, oct = 3) {
  let sum = 0
  let amp = 1
  let norm = 0
  let c = cell
  for (let o = 0; o < oct; o++) {
    sum += amp * pnoise(x / c, y / c, 0, 0, seed + o * 131)
    norm += amp
    amp *= 0.5
    c = c * 0.5
  }
  return sum / norm
}

/** 在 stops（[[pos,rgb]...] 递增）上取色 */
function sampleStops(stops, t) {
  const n = stops.length
  if (t <= stops[0][0]) return stops[0][1]
  if (t >= stops[n - 1][0]) return stops[n - 1][1]
  for (let i = 0; i < n - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / Math.max(1e-5, b[0] - a[0])
      return mixRgb(a[1], b[1], k)
    }
  }
  return stops[n - 1][1]
}

/**
 * 天空：竖向色阶渐变 + 地平线亮霾 + 横向拉长的云带 / 雨幕竖纹 + 18 级抖动量化。
 * 不做完美平滑，故意留下可见的像素档位。
 */
function paintSky(r, sk) {
  const w = r.w
  const h = r.h
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1)
    const base = sampleStops(sk.stops, t)
    const glow = Math.exp(-Math.pow((t - sk.horizon) / 0.15, 2)) * sk.glow
    const cy = glow > 0.004 ? mixRgb(base, sk.glowCol, glow) : base
    const upperMask = clamp01((0.5 - t) / 0.5)
    for (let x = 0; x < w; x++) {
      // 云带（横向拉长）
      const n1 = fbmRaw(x * 0.62, y * 2.4, 24, sk.seed, 3)
      const cloud = (n1 - 0.5) * 2 * sk.cloudA * (0.2 + 0.8 * upperMask)
      let c
      if (cloud > 0) c = mixRgb(cy, sk.cloudLight, cloud)
      else c = mixRgb(cy, sk.cloudDark, -cloud)
      // 竖向烟柱 / 雨幕
      const n2 = fbmRaw(x * 4.2, y * 0.5, 22, sk.seed + 77, 2)
      c = mixRgb(c, sk.cloudDark, clamp01((n2 - 0.56) * 1.5) * 0.13)
      // 底部再压暗，避免整屏发亮
      if (t > 0.9) c = mixRgb(c, sk.cloudDark, (t - 0.9) * 2.2)
      r.opaque(x, y, ditherRgb(c, x, y, 18))
    }
  }
}

/* ============================================================================
 * 6. biome 风格表（色值全部由 palette.js 混出）
 * ========================================================================== */

const STYLE_CACHE = new Map()

function biomeStyle(id) {
  const hit = STYLE_CACHE.get(id)
  if (hit) return hit
  let S
  if (id === 'village') S = styleVillage()
  else if (id === 'factory') S = styleFactory()
  else if (id === 'dump') S = styleDump()
  else if (id === 'metro') S = styleMetro()
  else if (id === 'hospital') S = styleHospital()
  else if (id === 'port') S = stylePort()
  else S = styleCity()
  STYLE_CACHE.set(id, S)
  return S
}

function styleCity() {
  const top = mixHex(PAL.skySmoke, PAL.skyDusk, 0.34)
  const up = mixHex(PAL.skyDusk, PAL.skySmoke, 0.4)
  const midSky = mixHex(PAL.skyDusk, PAL.sand, 0.34)
  const horMid = mixHex(PAL.sand, PAL.ochre, 0.42)
  const horHi = mixHex(PAL.sand, PAL.boneDark, 0.22)
  const low = mixHex(PAL.dust, PAL.rustDark, 0.34)
  const lowDark = darker(low, 0.28)

  const fBase = mixHex(mixHex(PAL.rust, PAL.sand, 0.5), PAL.skyDusk, 0.24)
  const mBase = mixHex(PAL.rustDark, horMid, 0.28)
  const nBase = mixHex(PAL.rustDeep, PAL.black, 0.44)

  return {
    id: 'city',
    sky: {
      stops: [
        [0, top],
        [0.3, up],
        [0.56, midSky],
        [0.73, horMid],
        [0.86, horHi],
        [0.94, mixHex(horMid, low, 0.55)],
        [1, lowDark],
      ],
      horizon: 0.85,
      glow: 0.55,
      glowCol: mixHex(PAL.bone, PAL.sand, 0.45),
        cloudA: 0.42,
      cloudLight: mixHex(PAL.sand, PAL.bone, 0.35),
      cloudDark: mixHex(PAL.ash, PAL.skyDusk, 0.4),
      seed: 0x11c1,
    },
    far: {
      base: fBase,
      dark: mixRgb(fBase, hexRgb(PAL.rustDeep), 0.44),
      edge: mixRgb(fBase, hexRgb(PAL.rustDark), 0.3),
      rim: lighter(fBase, 0.17),
      win: mixRgb(fBase, hexRgb(PAL.rustDeep), 0.6),
      lit: hexRgb(PAL.neonWarm),
      smoke: mixHex(PAL.sandDark, PAL.ashPale, 0.4),
      haze: mixHex(PAL.sand, PAL.bone, 0.2),
      ground: mixHex(PAL.sandDark, PAL.dust, 0.42),
    },
    mid: {
      base: mBase,
      dark: darker(mBase, 0.42),
      edge: mixRgb(mBase, hexRgb(PAL.ashPale), 0.18),
      rim: lighter(mBase, 0.2),
      win: mixRgb(mBase, hexRgb(PAL.black), 0.55),
      lit: hexRgb(PAL.neonWarm),
      rust: mixHex(PAL.rust, PAL.rustDark, 0.3),
      smoke: mixHex(horMid, PAL.ashPale, 0.34),
      haze: mixHex(PAL.sand, PAL.bone, 0.16),
      ground: mixHex(PAL.rustDeep, PAL.dust, 0.4),
    },
    near: {
      base: nBase,
      dark: darker(nBase, 0.45),
      rim: mixRgb(nBase, hexRgb(PAL.rustLight), 0.2),
      smoke: mixRgb(nBase, hexRgb(PAL.ashPale), 0.35),
    },
    ground: {
      base: mixHex(mixHex(PAL.steel, PAL.dust, 0.5), PAL.rustDark, 0.14),
      dark: mixHex(PAL.steelDark, PAL.rustDeep, 0.4),
      light: mixHex(PAL.steelLight, PAL.rust, 0.3),
      rust: mixHex(PAL.rust, PAL.rustLight, 0.3),
    },
    groundTop: {
      crust: mixHex(PAL.sandDark, PAL.rust, 0.38),
      crustHi: mixHex(PAL.sand, PAL.rustLight, 0.3),
      crustLo: mixHex(PAL.rustDark, PAL.dust, 0.4),
      weed: hexRgb(PAL.weed),
      weedHi: hexRgb(PAL.mossDead),
    },
    fog: hexNum(mixHex(PAL.dust, PAL.ochre, 0.34)),
    ambient: hexNum(mixHex(PAL.rust, PAL.sand, 0.42)),
  }
}

function styleVillage() {
  const top = mixHex(PAL.skyDay, PAL.ashLight, 0.5)
  const up = mixHex(PAL.skyDay, PAL.mossDead, 0.34)
  const midSky = hexRgb(PAL.skyDay)
  const horMid = mixHex(PAL.skyDay, PAL.boneDark, 0.3)
  const horHi = mixHex(PAL.skyDay, PAL.bone, 0.3)
  const low = mixHex(PAL.mossDead, PAL.skyDusk, 0.4)
  const lowDark = darker(low, 0.35)

  const fBase = mixHex(PAL.mossDead, horHi, 0.34)
  const mBase = mixHex(PAL.weed, PAL.rustDark, 0.42)
  const nBase = mixHex(PAL.mossDead, PAL.black, 0.72)

  return {
    id: 'village',
    sky: {
      stops: [
        [0, top],
        [0.32, up],
        [0.58, midSky],
        [0.75, horMid],
        [0.87, horHi],
        [0.95, mixHex(horMid, low, 0.6)],
        [1, lowDark],
      ],
      horizon: 0.86,
      glow: 0.42,
      glowCol: mixHex(PAL.bone, PAL.skyDay, 0.3),
      cloudA: 0.38,
      cloudLight: mixHex(PAL.bone, PAL.skyDay, 0.5),
      cloudDark: mixHex(PAL.mossDead, PAL.ash, 0.45),
      seed: 0x2be7,
    },
    far: {
      base: fBase,
      dark: mixRgb(fBase, hexRgb(PAL.rustDeep), 0.34),
      edge: mixRgb(fBase, hexRgb(PAL.mossDead), 0.4),
      rim: lighter(fBase, 0.16),
      win: mixRgb(fBase, hexRgb(PAL.rustDeep), 0.55),
      lit: hexRgb(PAL.neonWarm),
      smoke: mixHex(PAL.mossDead, PAL.ashPale, 0.45),
      haze: horHi,
      ground: mixHex(PAL.mossDead, PAL.sandDark, 0.5),
    },
    mid: {
      base: mBase,
      dark: darker(mBase, 0.45),
      edge: mixRgb(mBase, hexRgb(PAL.mossDead), 0.3),
      rim: lighter(mBase, 0.18),
      win: mixRgb(mBase, hexRgb(PAL.black), 0.55),
      lit: hexRgb(PAL.neonWarm),
      rust: mixHex(PAL.rust, PAL.rustDark, 0.4),
      smoke: mixHex(PAL.skyDay, PAL.ashPale, 0.4),
      haze: mixHex(PAL.skyDay, PAL.bone, 0.24),
      ground: mixHex(PAL.rustDeep, PAL.mossDead, 0.4),
    },
    near: {
      base: nBase,
      dark: darker(nBase, 0.45),
      rim: mixRgb(nBase, hexRgb(PAL.weed), 0.3),
      smoke: mixRgb(nBase, hexRgb(PAL.ashPale), 0.32),
    },
    ground: {
      base: mixHex(PAL.sandDark, PAL.dust, 0.5),
      dark: mixHex(PAL.rustDeep, PAL.dust, 0.5),
      light: mixHex(PAL.sand, PAL.dust, 0.45),
      rust: mixHex(PAL.rust, PAL.rustDark, 0.3),
    },
    groundTop: {
      crust: mixHex(PAL.ochre, PAL.sandDark, 0.42),
      crustHi: mixHex(PAL.sand, PAL.ochre, 0.35),
      crustLo: mixHex(PAL.rustDark, PAL.mossDead, 0.45),
      weed: hexRgb(PAL.weed),
      weedHi: hexRgb(PAL.mossDead),
    },
    fog: hexNum(mixHex(PAL.dust, PAL.skyDay, 0.42)),
    ambient: hexNum(mixHex(PAL.weed, PAL.skyDay, 0.45)),
  }
}

function styleFactory() {
  const top = mixHex(PAL.bloodDark, PAL.skyDusk, 0.5)
  const up = mixHex(PAL.skyDusk, PAL.bloodDark, 0.46)
  const midSky = mixHex(PAL.skyDusk, PAL.rust, 0.42)
  const horMid = mixHex(PAL.rust, PAL.ochre, 0.44)
  const horHi = mixHex(PAL.rustLight, PAL.ochre, 0.35)
  const low = mixHex(PAL.rustDeep, PAL.bloodDark, 0.35)
  const lowDark = darker(low, 0.3)

  const fBase = mixHex(PAL.rust, horHi, 0.45)
  const mBase = mixHex(PAL.rustDeep, PAL.rust, 0.44)
  const nBase = mixHex(PAL.rustDeep, PAL.black, 0.5)

  return {
    id: 'factory',
    sky: {
      stops: [
        [0, top],
        [0.3, up],
        [0.56, midSky],
        [0.74, horMid],
        [0.87, horHi],
        [0.95, mixHex(horMid, low, 0.6)],
        [1, lowDark],
      ],
      horizon: 0.85,
      glow: 0.5,
      glowCol: mixHex(PAL.rustHot, PAL.ochre, 0.4),
      cloudA: 0.46,
      cloudLight: mixHex(PAL.rustLight, PAL.ochre, 0.4),
      cloudDark: mixHex(PAL.bloodDark, PAL.ash, 0.36),
      seed: 0x5a17,
    },
    far: {
      base: fBase,
      dark: mixRgb(fBase, hexRgb(PAL.rustDeep), 0.46),
      edge: mixRgb(fBase, hexRgb(PAL.bloodDark), 0.4),
      rim: lighter(fBase, 0.16),
      win: mixRgb(fBase, hexRgb(PAL.bloodDark), 0.6),
      lit: hexRgb(PAL.neonRed),
      smoke: mixHex(PAL.rustDark, PAL.ashPale, 0.4),
      haze: mixHex(PAL.rustLight, PAL.sand, 0.4),
      ground: mixHex(PAL.rustDeep, PAL.sandDark, 0.35),
    },
    mid: {
      base: mBase,
      dark: darker(mBase, 0.5),
      edge: mixRgb(mBase, hexRgb(PAL.rust), 0.35),
      rim: mixRgb(mBase, hexRgb(PAL.rustHot), 0.28),
      win: mixRgb(mBase, hexRgb(PAL.black), 0.5),
      lit: hexRgb(PAL.neonWarm),
      rust: mixHex(PAL.rust, PAL.rustLight, 0.28),
      smoke: mixHex(PAL.rustLight, PAL.ashPale, 0.4),
      haze: mixHex(PAL.rust, PAL.sand, 0.35),
      ground: mixHex(PAL.rustDeep, PAL.bloodDark, 0.4),
    },
    near: {
      base: nBase,
      dark: darker(nBase, 0.5),
      rim: mixRgb(nBase, hexRgb(PAL.rustLight), 0.24),
      smoke: mixRgb(nBase, hexRgb(PAL.ashPale), 0.3),
    },
    ground: {
      base: mixHex(PAL.steel, PAL.rustDark, 0.44),
      dark: mixHex(PAL.steelDark, PAL.rustDeep, 0.5),
      light: mixHex(PAL.steelLight, PAL.rust, 0.35),
      rust: mixHex(PAL.rust, PAL.rustHot, 0.22),
    },
    groundTop: {
      crust: mixHex(PAL.rustDark, PAL.ochre, 0.36),
      crustHi: mixHex(PAL.ochre, PAL.rustLight, 0.3),
      crustLo: mixHex(PAL.rustDeep, PAL.steelDark, 0.4),
      weed: hexRgb(PAL.toxicDark),
      weedHi: hexRgb(PAL.rustDark),
    },
    fog: hexNum(mixHex(PAL.rustDeep, PAL.rust, 0.44)),
    ambient: hexNum(mixHex(PAL.rust, PAL.rustHot, 0.34)),
  }
}

function styleDump() {
  const top = mixHex(PAL.skyToxic, PAL.ashLight, 0.46)
  const up = mixHex(PAL.skyToxic, PAL.dust, 0.35)
  const midSky = mixHex(PAL.skyToxic, PAL.ochre, 0.3)
  const horMid = mixHex(PAL.ochre, PAL.skyToxic, 0.4)
  const horHi = mixHex(PAL.sand, PAL.skyToxic, 0.36)
  const low = mixHex(PAL.weed, PAL.rustDeep, 0.45)
  const lowDark = darker(low, 0.35)

  const fBase = mixHex(PAL.weed, horHi, 0.4)
  const mBase = mixHex(PAL.weed, PAL.rustDeep, 0.46)
  const nBase = mixHex(PAL.weed, PAL.black, 0.76)

  return {
    id: 'dump',
    sky: {
      stops: [
        [0, top],
        [0.3, up],
        [0.56, midSky],
        [0.74, horMid],
        [0.87, horHi],
        [0.95, mixHex(horMid, low, 0.55)],
        [1, lowDark],
      ],
      horizon: 0.86,
      glow: 0.44,
      glowCol: mixHex(PAL.sand, PAL.toxicGlow, 0.22),
      cloudA: 0.44,
      cloudLight: mixHex(PAL.sand, PAL.skyToxic, 0.3),
      cloudDark: mixHex(PAL.weed, PAL.ash, 0.4),
      seed: 0x7d09,
    },
    far: {
      base: fBase,
      dark: mixRgb(fBase, hexRgb(PAL.rustDeep), 0.42),
      edge: mixRgb(fBase, hexRgb(PAL.weed), 0.35),
      rim: lighter(fBase, 0.16),
      win: mixRgb(fBase, hexRgb(PAL.rustDeep), 0.55),
      lit: hexRgb(PAL.neonWarm),
      smoke: mixHex(PAL.weed, PAL.ashPale, 0.45),
      haze: horHi,
      ground: mixHex(PAL.weed, PAL.sandDark, 0.5),
    },
    mid: {
      base: mBase,
      dark: darker(mBase, 0.46),
      edge: mixRgb(mBase, hexRgb(PAL.weed), 0.3),
      rim: mixRgb(mBase, hexRgb(PAL.toxic), 0.2),
      win: mixRgb(mBase, hexRgb(PAL.black), 0.55),
      lit: hexRgb(PAL.neonWarm),
      rust: mixHex(PAL.rust, PAL.rustDark, 0.45),
      smoke: mixHex(PAL.ochre, PAL.ashPale, 0.4),
      haze: mixHex(PAL.sand, PAL.weed, 0.4),
      ground: mixHex(PAL.rustDeep, PAL.weed, 0.4),
    },
    near: {
      base: nBase,
      dark: darker(nBase, 0.45),
      rim: mixRgb(nBase, hexRgb(PAL.toxic), 0.22),
      smoke: mixRgb(nBase, hexRgb(PAL.ashPale), 0.3),
    },
    ground: {
      base: mixHex(PAL.dust, PAL.steel, 0.36),
      dark: mixHex(PAL.rustDeep, PAL.dust, 0.45),
      light: mixHex(PAL.dustLight, PAL.sand, 0.35),
      rust: mixHex(PAL.rust, PAL.rustDark, 0.4),
    },
    groundTop: {
      crust: mixHex(PAL.dustLight, PAL.rustDark, 0.38),
      crustHi: mixHex(PAL.sandDark, PAL.dustLight, 0.4),
      crustLo: mixHex(PAL.rustDeep, PAL.weed, 0.4),
      weed: hexRgb(PAL.toxicDark),
      weedHi: hexRgb(PAL.weed),
    },
    fog: hexNum(mixHex(PAL.weed, PAL.ochre, 0.4)),
    ambient: hexNum(mixHex(PAL.toxic, PAL.ochre, 0.5)),
  }
}

/** 远景层的地面带（地平线以下），带向下递减的霾 */
function farGround(r, baseY, col, hazeCol, hazeA = 0.34) {
  const y0 = Math.round(baseY)
  for (let y = y0; y < r.h; y++) {
    const t = (y - y0) / Math.max(1, r.h - y0)
    const c = mixRgb(col, hazeCol, hazeA * (1 - t * 0.8))
    r.hf(0, r.w - 1, y, ditherRgb(c, 0, y, 14))
  }
}

/* ============================================================================
 * 7. CITY —— 锈城废墟：倒塌摩天楼、断裂高架、锈广告牌、贴地浓烟
 * ========================================================================== */

function paintCityFar(r, S) {
  const F = S.far
  const rng = makeRng(0x1c17a3)
  const baseY = 486

  // 1) 天际线：15 座塔楼（高处塌口、断桅、少量窗洞）
  const N = 15
  for (let i = 0; i < N; i++) {
    const slot = BG_W / N
    const cx = i * slot + slot * (0.14 + rng.next() * 0.6)
    const w = 30 + rng.next() * 100
    const tall = rng.next()
    const top = 132 + rng.next() * 214 - (tall > 0.84 ? 56 : 0)
    tower(r, cx - w / 2, w, top, baseY, F.base, {
      seed: (i * 733 + 19) | 0,
      dark: F.dark,
      edge: F.edge,
      rim: F.rim,
      winCol: F.win,
      cols: Math.max(2, Math.round(w / 18)),
      rows: 8,
      cellW: 3,
      cellH: 5,
      gapX: 11,
      gapY: 13,
      skip: 0.36,
      antenna: rng.next() > 0.55 ? 16 + rng.next() * 42 : 0,
      shear: rng.next() > 0.68 ? 8 + rng.next() * 26 : 0,
      shearDir: rng.next() > 0.5 ? 1 : -1,
    })
  }

  // 2) 断裂的高架桥（两层，跨越整幅）
  overpass(r, -40, BG_W + 40, 292, 11, F.base, {
    dark: F.dark,
    rim: F.rim,
    rail: true,
    pierGap: 176,
    pierW: 11,
    baseY: baseY,
    seed: 0x31a,
  })
  overpass(r, -40, BG_W + 40, 376, 9, F.base, {
    dark: F.dark,
    rim: F.rim,
    rail: false,
    pierGap: 224,
    pierW: 9,
    baseY: baseY,
    gapAt: 812,
    gapW: 108,
    seed: 0x31b,
  })

  // 3) 地平线以下的地面
  farGround(r, baseY, F.ground, F.haze, 0.36)

  // 4) 竖向空气透视：楼顶压暗，楼脚再泡进雾里 → 远层不再是"纸片"
  verticalShade(r, 20, baseY, F.dark, 0.42)

  // 5) 贴地烟霾
  smokeBand(r, 392, baseY + 2, F.smoke, 0.3, 0x91a2, 72)

  // 6) 大气消光：越靠地平线越淡
  aerialHaze(r, F.haze, 250, baseY, 0.26, 2.0)
  mottle(r, F.dark, F.rim, 0x51c1, 0.34, 3)
}

function paintCityMid(r, S) {
  const M = S.mid
  const rng = makeRng(0x3c1e55)
  const baseY = 520

  // 1) 中景楼群：先体块
  const specs = []
  for (let i = 0; i < 6; i++) {
    const slot = BG_W / 6
    const cx = i * slot + slot * (0.12 + rng.next() * 0.66)
    const w = 104 + rng.next() * 152
    const top = 232 + rng.next() * 128
    specs.push({ cx: cx, w: w, top: top, seed: (i * 311 + 7) | 0, ant: rng.next() > 0.5 })
  }
  for (const s of specs) {
    tower(r, s.cx - s.w / 2, s.w, s.top, baseY, M.base, {
      seed: s.seed,
      dark: M.dark,
      edge: M.edge,
      rim: M.rim,
      winCol: M.win,
      litCol: M.lit,
      litChance: 0.05,
      cols: Math.max(2, Math.round(s.w / 26)),
      rows: Math.max(3, Math.round((baseY - s.top) / 34)),
      cellW: 6,
      cellH: 11,
      gapX: 12,
      gapY: 11,
      skip: 0.3,
      bandCol: M.dark,
      bandGap: 34,
      antenna: s.ant ? 26 + rng.next() * 34 : 0,
      shear: rng.next() > 0.62 ? 12 + rng.next() * 26 : 0,
      shearDir: rng.next() > 0.5 ? 1 : -1,
    })
  }
  // 锈迹 / 水渍
  for (const s of specs) {
    streaks(r, s.cx - s.w / 2, s.w, s.top + 10, baseY, M.rust, (s.seed ^ 0xb3) >>> 0, 0.3, 0.42)
  }

  // 2) 斜塌板楼（地标）
  slabWreck(r, 596, 252, 226, baseY, -52, M.base, {
    dark: M.dark,
    rim: M.rim,
    seed: 0x77c1,
    rebar: 9,
    rebarCol: M.rim,
  })
  slabWreck(r, 118, 148, 286, baseY, 34, mixRgb(M.base, M.dark, 0.35), {
    dark: M.dark,
    rim: M.rim,
    seed: 0x77c2,
    rebar: 5,
    rebarCol: M.rust,
  })

  // 3) 断掉一段的高架
  overpass(r, -40, BG_W + 40, 302, 13, mixRgb(M.base, M.dark, 0.3), {
    dark: M.dark,
    rim: M.rim,
    rail: true,
    pierGap: 196,
    pierW: 15,
    baseY: baseY,
    gapAt: 452,
    gapW: 116,
    seed: 0x44d,
  })

  // 4) 锈蚀广告牌（空框 + 撕掉一半的板面）
  billboard(r, 902, 214, 206, 92, M)
  billboard(r, 300, 268, 132, 62, M, { torn: 0.55 })

  // 5) 街灯（几盏歪的，头朝下）
  const lamps = [96, 388, 742, 1084]
  for (let i = 0; i < lamps.length; i++) {
    lampPost(r, lamps[i], baseY, 128 + (i % 2) * 22, M, i % 2 === 0 ? -1 : 1)
  }

  // 6) 地面暗带
  r.rect(0, baseY - 4, BG_W, BG_H - baseY + 4, darker(M.base, 0.4))

  // 7) 贴地浓烟（两层，密度不同 → 翻卷感）
  smokeBand(r, 428, BG_H, M.smoke, 0.34, 0x7f31, 58)
  smokeBand(r, 470, BG_H, M.smoke, 0.26, 0x7f42, 40)

  mottle(r, M.dark, M.rim, 0x2ca7, 0.3, 3)
  aerialHaze(r, M.haze, 320, baseY + 24, 0.12, 1.4)
}

function paintCityNear(r, S) {
  const N = S.near
  const rng = makeRng(0x9d31)
  const baseY = 560

  // 1) 底部瓦砾脊（整幅起伏）
  colFill(
    r,
    0,
    BG_W - 1,
    (x) => 494 - 26 * fbmX(x, 0, BG_W, 34, 0x1f1, 3) - 12 * Math.sin((x / BG_W) * TAU * 3 + 0.7),
    baseY,
    N.base,
  )
  // 瓦砾亮边（背光）
  for (let x = 0; x < BG_W; x++) {
    const y = Math.round(494 - 26 * fbmX(x, 0, BG_W, 34, 0x1f1, 3) - 12 * Math.sin((x / BG_W) * TAU * 3 + 0.7))
    if (hash2(x, 3, 0x1f2) > 0.4) r.alpha(x, y, N.rim, 0.5)
    if (hash2(x, 5, 0x1f3) > 0.86) r.rect(x, y + 2, 1, 3, N.dark, 0.6)
  }

  // 2) 左侧倾覆的墙段 + 钢筋
  r.poly(
    [
      [24, 268],
      [282, 322],
      [268, 560],
      [12, 560],
    ],
    N.base,
  )
  for (let i = 0; i < 16; i++) {
    const t = i / 15
    const x = 30 + t * 240
    const y = 268 + t * 52
    const h = 10 + hash2(i, 9, 0x5a1) * 26
    r.line(x, y, x + (hash2(i, 11, 0x5a2) - 0.5) * 16, y - h, N.base, 1, 1)
  }
  // 墙面破洞
  for (let i = 0; i < 5; i++) {
    const hx = 60 + rng.next() * 180
    const hy = 340 + rng.next() * 150
    r.rect(hx, hy, 8 + rng.next() * 18, 6 + rng.next() * 14, N.dark, 0.7)
  }
  // 墙顶断裂面（亮边）
  for (let x = 26; x < 280; x++) {
    const t = (x - 26) / 256
    const y = Math.round(268 + t * 54 + (hash2(x, 2, 0x5a3) > 0.6 ? 3 : 0))
    r.alpha(x, y, N.rim, 0.35)
  }

  // 3) 斜插的钢梁（前景斜线，破画面用）
  r.poly(
    [
      [880, 560],
      [1004, 560],
      [700, 380],
      [660, 402],
    ],
    darker(N.base, 0.15),
  )
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    r.line(668 + t * 300, 396 + t * 158, 672 + t * 300, 412 + t * 158, N.dark, 0.5)
  }

  // 4) 枯树（右侧）
  deadTree(r, 1146, 526, 236, N.base, 0x33b, { thick: 6, lean: -0.16, branches: 6, knots: 4 })

  // 5) 垂落的电缆（横穿画面上方，下坠感）
  cable(r, -20, 520, 96, 78, N.base, { thick: 2, dangle: 4 })
  cable(r, 470, 1010, 72, 104, N.base, { thick: 2, dangle: 5 })
  cable(r, 980, BG_W + 20, 118, 56, N.base, { thick: 1, dangle: 2 })

  // 6) 断掉的铁网
  fence(r, 300, 620, 522, 86, N.base, 0x6e2, { postGap: 46, postW: 2, miss: 0.28, wires: 3, mesh: true })
  fence(r, 730, 900, 512, 62, N.base, 0x6e3, { postGap: 38, postW: 2, miss: 0.4, wires: 2 })

  // 7) 前景底部再压一层几乎全黑的土坡
  colFill(
    r,
    0,
    BG_W - 1,
    (x) => 534 - 10 * fbmX(x, 0, BG_W, 22, 0x9f1, 2),
    baseY,
    N.dark,
  )
  mottle(r, N.dark, N.rim, 0x71c9, 0.26, 4)
}

/** 广告牌：两根锈柱 + 框 + 撕烂的板面 */
function billboard(r, x, y, w, h, M, o = {}) {
  const frame = mixRgb(M.base, M.dark, 0.4)
  const panel = mixRgb(M.dark, M.base, 0.25)
  const torn = o.torn != null ? o.torn : 0.3
  // 柱
  r.vfill(x + Math.round(w * 0.26), y + h, y + h + 150, frame)
  r.vfill(x + Math.round(w * 0.74), y + h, y + h + 150, frame)
  r.vfill(x + Math.round(w * 0.26) + 1, y + h, y + h + 150, darker(frame, 0.35))
  // 斜撑
  r.line(x + Math.round(w * 0.26), y + h + 40, x + Math.round(w * 0.74), y + h + 96, frame, 0.9)
  // 框
  r.rect(x, y, w, h, frame)
  r.rect(x + 3, y + 3, w - 6, h - 6, panel)
  // 撕烂的板面：一块块缺失 → 用「亮色补丁」表示残留纸面
  for (let i = 0; i < 26; i++) {
    const px = x + 4 + Math.floor(hash2(i, 1, 0xbad1) * (w - 10))
    const py = y + 4 + Math.floor(hash2(i, 2, 0xbad1) * (h - 10))
    if (hash2(i, 3, 0xbad2) < torn) continue
    r.rect(px, py, 4 + Math.floor(hash2(i, 4, 0xbad3) * 12), 3 + Math.floor(hash2(i, 5, 0xbad4) * 8), lighter(panel, 0.22), 0.75)
  }
  // 边框亮线 + 底部锈流
  r.hf(x, x + w - 1, y, lighter(frame, 0.25), 0.8)
  r.hf(x, x + w - 1, y + h - 1, darker(frame, 0.5), 0.8)
  streaks(r, x, w, y + 4, y + h, mixRgb(M.rust || frame, frame, 0.3), 0x51d, 0.22, 0.5)
}

/** 街灯：杆 + 悬臂 + 灯头（可歪） */
function lampPost(r, x, baseY, h, M, dir) {
  const col = mixRgb(M.base, M.dark, 0.42)
  r.vfill(x, baseY - h, baseY, col)
  r.vfill(x + 1, baseY - h, baseY, darker(col, 0.4))
  const armY = baseY - h + 4
  for (let i = 0; i < 26; i++) {
    const t = i / 25
    r.alpha(x + dir * i, Math.round(armY - Math.sin(t * 1.2) * 8), col, 1)
  }
  const hx = x + dir * 26
  const hy = Math.round(armY - 8)
  r.rect(hx - 3, hy, 7, 4, col)
  r.alpha(hx, hy + 3, M.lit, 0.5)
}

/* ============================================================================
 * 8. VILLAGE —— 枯谷村：烧毁农舍、枯树、倒塌谷仓、田垄、井
 * ========================================================================== */

function paintVillageFar(r, S) {
  const F = S.far
  const rng = makeRng(0x2b71)
  const baseY = 470

  // 1) 两道山脊
  ridge(r, mixRgb(F.base, F.dark, 0.2), (x) => 336 + 26 * Math.sin((x / BG_W) * TAU * 2 + 0.6) + 12 * Math.sin((x / BG_W) * TAU * 5 + 2.1), baseY)
  // 2) 田垄（横向色带，跟着地形起伏）
  for (let b = 0; b < 7; b++) {
    const y0 = 356 + b * 16
    const col = b % 2 === 0 ? mixRgb(F.base, F.dark, 0.22) : mixRgb(F.base, F.edge, 0.3)
    for (let x = 0; x < BG_W; x++) {
      const wob = Math.round(5 * Math.sin((x / BG_W) * TAU * 3 + b))
      r.hf(x, x, y0 + wob, col, 0.85)
      r.hf(x, x, y0 + wob + 1, darker(col, 0.15), 0.6)
    }
  }
  ridge(r, F.base, (x) => 424 + 14 * Math.sin((x / BG_W) * TAU * 3 + 1.4) + 7 * Math.sin((x / BG_W) * TAU * 7), baseY)

  // 3) 远处农舍 / 谷仓 / 风车
  farHouse(r, 214, 408, 74, 46, F)
  farBarn(r, 372, 420, 96, 58, F)
  farWindmill(r, 640, 414, 92, F)
  farHouse(r, 1012, 416, 62, 38, F)
  farBarn(r, 1148, 424, 72, 44, F)

  // 4) 地平线上的枯树（细瘦的一排）
  const treeX = [96, 168, 546, 716, 792, 892, 1088, 1216]
  for (let i = 0; i < treeX.length; i++) {
    deadTree(r, treeX[i], 424 + (i % 3) * 4, 44 + (i % 4) * 12, mixRgb(F.base, F.dark, 0.45), 0x11 + i, {
      thick: 1,
      lean: (i % 2 ? 0.2 : -0.2),
      branches: 3,
      wobble: 1.4,
    })
  }

  // 5) 乌鸦（几个 2px 的小点）
  for (let i = 0; i < 14; i++) {
    const x = Math.round((i * 97 + 41) % BG_W)
    const y = 190 + Math.round(hash2(i, 2, 0xc01) * 90)
    r.alpha(x, y, darker(F.base, 0.5), 0.7)
    r.alpha(x + 1, y - 1, darker(F.base, 0.5), 0.6)
    r.alpha(x + 2, y, darker(F.base, 0.5), 0.55)
  }

  // 6) 地面 + 烟霾
  verticalShade(r, 250, baseY, F.dark, 0.36)
  farGround(r, baseY, F.ground, F.haze, 0.4)
  smokeBand(r, 404, baseY + 2, F.smoke, 0.2, 0x2ba1, 64)
  aerialHaze(r, F.haze, 300, baseY, 0.3, 1.9)
  mottle(r, F.dark, F.rim, 0x2b71c, 0.3, 3)
}

/** 远景农舍：双坡顶 + 烟囱 */
function farHouse(r, x, baseY, w, h, F) {
  const wall = F.base
  const roof = mixRgb(F.base, F.dark, 0.3)
  r.rect(x, baseY - h, w, h, wall)
  r.poly(
    [
      [x - 4, baseY - h],
      [x + w / 2, baseY - h - h * 0.5],
      [x + w + 4, baseY - h],
    ],
    roof,
  )
  r.hf(x, x + w - 1, baseY - h, F.dark, 0.6)
  r.vfill(x, baseY - h, baseY, F.dark, 0.5)
  // 门 / 窗
  r.rect(x + Math.round(w * 0.42), baseY - h * 0.62, Math.max(2, Math.round(w * 0.16)), Math.round(h * 0.62), mixRgb(F.base, F.dark, 0.55))
  r.rect(x + Math.round(w * 0.14), baseY - h * 0.74, 3, 4, mixRgb(F.base, F.dark, 0.5))
  // 烟囱
  r.rect(x + w - 12, baseY - h - h * 0.44, 5, h * 0.34, roof)
}

/** 远景谷仓：大坡顶 + 掉了一半的山墙 */
function farBarn(r, x, baseY, w, h, F) {
  const wall = mixRgb(F.base, F.dark, 0.16)
  const roof = mixRgb(F.base, F.dark, 0.42)
  r.rect(x, baseY - h, w, h, wall)
  r.poly(
    [
      [x - 3, baseY - h + 2],
      [x + w * 0.5, baseY - h - h * 0.42],
      [x + w + 3, baseY - h + 6],
    ],
    roof,
  )
  // 山墙缺口
  r.poly(
    [
      [x + w * 0.5, baseY - h - h * 0.42],
      [x + w * 0.5 + 18, baseY - h - h * 0.16],
      [x + w * 0.5, baseY - h + 2],
    ],
    F.base,
  )
  r.rect(x + w * 0.4, baseY - h * 0.66, Math.round(w * 0.24), Math.round(h * 0.66), mixRgb(F.base, F.dark, 0.5))
  r.vfill(x, baseY - h, baseY, F.dark, 0.5)
  r.vfill(x + w - 1, baseY - h, baseY, F.dark, 0.65)
}

/** 远景风车：锥形塔 + 只剩两片的风轮 */
function farWindmill(r, x, baseY, h, F) {
  const col = mixRgb(F.base, F.dark, 0.26)
  for (let y = baseY - h; y < baseY; y++) {
    const t = (y - (baseY - h)) / h
    const ww = 18 - 9 * t
    r.hf(x - ww / 2, x + ww / 2, y, col)
    r.alpha(x - ww / 2, y, F.dark, 0.55)
  }
  // 顶帽
  r.rect(x - 6, baseY - h - 5, 12, 6, col)
  // 风轮（两片，斜十字）
  const cx = x
  const cy = baseY - h - 2
  const len = h * 0.52
  r.line(cx, cy, cx + len * 0.72, cy - len * 0.68, col, 1, 2)
  r.line(cx, cy, cx - len * 0.5, cy + len * 0.82, col, 1, 2)
  r.rect(cx - 1, cy - 1, 2, 2, F.dark)
}

function paintVillageMid(r, S) {
  const M = S.mid
  const baseY = 528

  // 0) 先把中景地面（起伏的田垄土坡）垫出来，避免整层太空、村庄读不出体量
  colFill(
    r,
    0,
    BG_W - 1,
    (x) => 484 - 20 * fbmX(x, 0, BG_W, 40, 0x4d4, 2) - 8 * Math.sin((x / BG_W) * TAU * 3 + 0.5),
    baseY,
    mixRgb(M.base, M.dark, 0.2),
  )

  // 1) 烧毁的农舍（左侧主景）
  farmhouse(r, 96, baseY, 236, 132, M, { burnt: true, collapsed: 0.55 })
  // 2) 倒塌谷仓（右侧）
  barn(r, 760, baseY, 306, 176, M, { collapse: 0.72 })
  // 3) 小棚屋 / 井 / 田垄
  farmhouse(r, 402, baseY, 118, 78, M, { collapsed: 0.2 })
  well(r, 606, baseY, M)
  farmhouse(r, 1120, baseY, 92, 62, M, { collapsed: 0.35 })

  // 4) 田垄 / 干草垛
  for (let i = 0; i < 5; i++) {
    const y = 494 + i * 9
    for (let x = 0; x < BG_W; x++) {
      if (hash2(x, i, 0x4d1) < 0.45) continue
      if (i % 2 === 0) r.hf(x, x + 1, y, mixRgb(M.base, M.dark, 0.25), 0.55)
    }
  }
  for (let i = 0; i < 4; i++) {
    mound(r, 560 + i * 26, 20 + i * 4, 16 + i * 3, baseY, mixRgb(M.base, M.rust, 0.25), 0x4d2 + i, { power: 0.5, rim: M.rim })
  }
  // 5) 栅栏
  fence(r, 300, 720, baseY - 4, 56, mixRgb(M.base, M.dark, 0.3), 0x7c1, { postGap: 42, wires: 3, postCap: M.rim })
  fence(r, 1090, BG_W + 10, baseY - 8, 44, mixRgb(M.base, M.dark, 0.35), 0x7c2, { postGap: 36, wires: 2 })

  // 6) 枯树群
  deadTree(r, 706, baseY, 174, M.base, 0x5e1, { thick: 5, lean: 0.12, branches: 5, knots: 3 })
  deadTree(r, 1152, baseY, 208, mixRgb(M.base, M.dark, 0.3), 0x5e2, { thick: 6, lean: -0.2, branches: 6, knots: 4 })
  deadTree(r, 14, baseY, 132, mixRgb(M.base, M.dark, 0.4), 0x5e3, { thick: 4, lean: 0.24, branches: 4 })

  // 7) 地面暗带 + 烟
  r.rect(0, baseY - 2, BG_W, BG_H - baseY + 2, darker(M.base, 0.48))
  smokeBand(r, 452, BG_H, M.smoke, 0.26, 0x2b62, 62)
  smokeBand(r, 496, BG_H, M.smoke, 0.2, 0x2b63, 42)
  mottle(r, M.dark, M.rim, 0x4a71, 0.3, 3)
  aerialHaze(r, M.haze, 380, baseY + 16, 0.14, 1.5)
}

/** 烧毁农舍：山墙 + 塌了半边的屋顶 + 露出的椽子 */
function farmhouse(r, x, baseY, w, h, M, o = {}) {
  const wall = o.wall || mixRgb(M.base, M.rust, 0.12)
  const dark = o.dark || M.dark
  const rim = o.rim || M.rim
  const wallTop = baseY - h
  // 墙
  r.rect(x, wallTop, w, h, wall)
  // 山墙三角
  r.poly(
    [
      [x, wallTop],
      [x + w / 2, wallTop - h * 0.44],
      [x + w, wallTop],
    ],
    wall,
  )
  // 屋顶：只留左半坡（右半烧塌）
  const collapse = o.collapse != null ? o.collapse : 0.5
  const ridgeX = x + w / 2
  const ridgeY = wallTop - h * 0.44
  r.poly(
    [
      [x - 5, wallTop + 2],
      [ridgeX, ridgeY],
      [ridgeX + w * 0.1, ridgeY + 4],
      [x - 5 + w * 0.08, wallTop + 6],
    ],
    mixRgb(wall, dark, 0.55),
  )
  // 塌掉的右坡：只剩椽子
  const rafters = 7
  for (let i = 0; i < rafters; i++) {
    const t = i / (rafters - 1)
    const sx = ridgeX + t * w * 0.52
    const sy = ridgeY + t * h * 0.4
    if (hash2(i, 3, 0xfa11) < collapse) {
      r.line(sx, sy, sx + 14, sy + 6, mixRgb(wall, dark, 0.4), 0.9)
      continue
    }
    r.line(sx, sy, sx + w * 0.1, sy + h * 0.18, mixRgb(wall, dark, 0.45))
  }
  // 屋脊亮边
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    r.alpha(x + (ridgeX - x) * t, wallTop + (ridgeY - wallTop) * t, rim, 0.3)
  }
  // 门窗（黑洞）
  const hole = mixRgb(wall, hexRgb(PAL.black), 0.72)
  r.rect(x + Math.round(w * 0.1), wallTop + Math.round(h * 0.42), Math.round(w * 0.16), Math.round(h * 0.58), hole)
  r.rect(x + Math.round(w * 0.62), wallTop + Math.round(h * 0.46), Math.round(w * 0.13), 7, hole)
  // 焦黑痕迹
  for (let i = 0; i < 9; i++) {
    const bx = x + Math.round(hash2(i, 1, 0xfa22) * w)
    const bh = Math.round(h * (0.2 + hash2(i, 2, 0xfa23) * 0.5))
    r.vfill(bx, wallTop + Math.round(h * 0.2), wallTop + Math.round(h * 0.2) + bh, darker(wall, 0.45), 0.5)
  }
  // 墙基
  r.vfill(x, wallTop, baseY, dark, 0.5)
  r.vfill(x + w - 1, wallTop, baseY, dark, 0.6)
}

/** 倒塌谷仓：一侧墙整个歪掉 */
function barn(r, x, baseY, w, h, M, o = {}) {
  const wall = mixRgb(M.base, M.rust, 0.18)
  const dark = M.dark
  const wallTop = baseY - h
  // 主墙（右半）
  r.rect(x + w * 0.34, wallTop, w * 0.66, h, wall)
  // 左墙歪倒
  r.poly(
    [
      [x, baseY - h * 0.52],
      [x + w * 0.36, wallTop],
      [x + w * 0.36, baseY],
      [x + 14, baseY],
    ],
    mixRgb(wall, dark, 0.3),
  )
  // 屋顶（斜的，一半塌）
  r.poly(
    [
      [x + w * 0.18, baseY - h * 0.62],
      [x + w * 0.56, wallTop - h * 0.36],
      [x + w, wallTop - h * 0.06],
      [x + w, wallTop + 6],
      [x + w * 0.4, wallTop + 18],
    ],
    mixRgb(wall, dark, 0.55),
  )
  // 大门（黑洞 + 掉落的门板）
  const hole = mixRgb(wall, hexRgb(PAL.black), 0.75)
  r.rect(x + w * 0.5, baseY - h * 0.62, w * 0.26, h * 0.62, hole)
  r.poly(
    [
      [x + w * 0.44, baseY],
      [x + w * 0.56, baseY - 26],
      [x + w * 0.64, baseY],
    ],
    darker(wall, 0.35),
  )
  // 板条纹理（横向）
  for (let y = wallTop + 4; y < baseY; y += 7) {
    r.hf(x + w * 0.34, x + w - 1, y, dark, 0.35)
  }
  // 破洞
  for (let i = 0; i < 7; i++) {
    const bx = x + w * (0.4 + hash2(i, 1, 0xba11) * 0.56)
    const by = wallTop + h * (0.12 + hash2(i, 2, 0xba12) * 0.7)
    r.rect(bx, by, 4 + hash2(i, 3, 0xba13) * 10, 3 + hash2(i, 4, 0xba14) * 6, hole, 0.85)
  }
  r.hf(x + w * 0.18, x + w, baseY - 3, dark, 0.6)
}

/** 石井：井台 + 两根柱 + 顶棚 + 吊桶 */
function well(r, x, baseY, M) {
  const stone = mixRgb(M.base, M.edge || M.dark, 0.35)
  const dark = M.dark
  // 井台（半圆）
  for (let y = baseY - 26; y < baseY; y++) {
    const t = (y - (baseY - 26)) / 26
    const ww = 30 - t * 6
    r.hf(x - ww / 2, x + ww / 2, y, stone)
    r.alpha(x - ww / 2, y, dark, 0.6)
  }
  // 石头分层
  for (let i = 0; i < 3; i++) {
    r.hf(x - 13, x + 13, baseY - 22 + i * 8, dark, 0.5)
  }
  // 井柱
  r.vfill(x - 22, baseY - 86, baseY - 24, stone)
  r.vfill(x + 21, baseY - 86, baseY - 24, stone)
  r.vfill(x - 21, baseY - 86, baseY - 24, dark, 0.5)
  // 顶棚（一边塌）
  r.poly(
    [
      [x - 32, baseY - 84],
      [x - 8, baseY - 108],
      [x + 20, baseY - 96],
      [x + 34, baseY - 78],
      [x + 32, baseY - 74],
      [x - 30, baseY - 78],
    ],
    mixRgb(stone, dark, 0.45),
  )
  // 横轴 + 绳 + 桶
  r.hf(x - 21, x + 20, baseY - 66, mixRgb(stone, M.rim || stone, 0.3))
  r.vfill(x, baseY - 66, baseY - 34, mixRgb(M.rust || dark, dark, 0.3))
  r.rect(x - 4, baseY - 34, 9, 7, mixRgb(stone, dark, 0.3))
  streaks(r, x - 20, 42, baseY - 84, baseY - 24, M.rust || dark, 0x9e11, 0.2, 0.45)
}

function paintVillageNear(r, S) {
  const N = S.near
  const rng = makeRng(0x5c31)
  const baseY = 560

  // 1) 底部土坡
  colFill(
    r,
    0,
    BG_W - 1,
    (x) => 512 - 22 * fbmX(x, 0, BG_W, 40, 0x3c1, 3) - 9 * Math.sin((x / BG_W) * TAU * 2 + 2.2),
    baseY,
    N.base,
  )

  // 2) 前景栅栏（近、粗、缺桩）
  fence(r, -10, 470, 540, 128, N.base, 0x8a11, { postGap: 62, postW: 4, miss: 0.22, wires: 3, postCap: N.rim })
  // 3) 木堆
  for (let i = 0; i < 7; i++) {
    const bx = 596 + (i % 3) * 22
    const by = 536 - Math.floor(i / 3) * 13
    r.rect(bx, by, 20, 8, N.base)
    r.hf(bx, bx + 19, by, N.rim, 0.3)
    r.hf(bx, bx + 19, by + 7, N.dark, 0.6)
    r.rect(bx + 9, by + 1, 2, 6, N.dark, 0.6)
  }
  // 4) 大枯树（右前景，几乎全黑）
  deadTree(r, 986, 556, 306, N.base, 0x77a, { thick: 11, lean: -0.1, branches: 7, knots: 6, wobble: 3 })
  // 5) 车辕 / 破车轮
  tire(r, 742, 552, 40, N.base, { hub: N.rim })
  r.line(742, 512, 820, 470, N.base, 1, 3)
  // 6) 高草 / 枯苇（前景两侧）
  weeds(r, 0, 420, 548, N.dark, 0x1a1, { count: 60, hMin: 8, hMax: 30, hi: N.rim })
  weeds(r, 1080, BG_W + 10, 552, N.dark, 0x1a2, { count: 40, hMin: 10, hMax: 34, hi: N.rim })
  // 7) 悬在头顶的枯枝（压顶构图；顶部 24 行留空）
  // 7) 悬在头顶的枯枝（压顶构图；顶部 24 行留空）
  r.line(2, 58, 236, 78, N.base, 1, 4)
  r.line(236, 78, 470, 64, N.base, 1, 3)
  for (let b = 0; b < 4; b++) {
    const bt = 0.14 + b * 0.22
    const bx = bt * 470
    const by = 58 + Math.sin(bt * 2.0) * 14 + bt * 12
    const len = 26 + hash2(b, 1, 0x99a) * 26
    r.line(bx, by, bx + 9, by + len, N.base, 1, 2)
    for (let k = 0; k < 2; k++) {
      const kk = 0.42 + k * 0.3
      r.line(bx + 9 * kk, by + len * kk, bx + (k ? -30 : 30), by + len * kk + 16, N.base, 1, 1)
    }
    r.rect(bx + 8, by + len - 1, 2, 2, N.base)
  }
  // 8) 底部压黑
  colFill(r, 0, BG_W - 1, (x) => 544 - 8 * fbmX(x, 0, BG_W, 20, 0x9c1, 2), baseY, N.dark)
  mottle(r, N.dark, N.rim, 0x6d1a, 0.24, 4)
  void rng
}

/* ============================================================================
 * 9. FACTORY —— 熔渣工厂：巨型烟囱、管道、冷却塔、输送带、探照灯
 * ========================================================================== */

/** 厂房：矩形体 + 锯齿屋顶 + 窗带 */
function hall(r, x, baseY, w, h, col, o = {}) {
  const dark = o.dark || darker(col, 0.5)
  const rim = o.rim || lighter(col, 0.14)
  const wallTop = baseY - h
  r.rect(x, wallTop, w, h, col)
  // 锯齿屋顶
  const teeth = o.teeth || 5
  const tw = w / teeth
  const roofH = o.roofH != null ? o.roofH : h * 0.26
  for (let i = 0; i < teeth; i++) {
    const x0 = x + i * tw
    r.poly(
      [
        [x0, wallTop + 1],
        [x0 + tw * 0.78, wallTop - roofH],
        [x0 + tw, wallTop - roofH],
        [x0 + tw, wallTop + 1],
      ],
      mixRgb(col, dark, 0.25),
    )
    // 天窗（玻璃暗面 + 一条亮边）
    r.poly(
      [
        [x0 + tw * 0.2, wallTop - 1],
        [x0 + tw * 0.72, wallTop - roofH + 3],
        [x0 + tw * 0.72, wallTop - roofH + 5],
        [x0 + tw * 0.2, wallTop + 1],
      ],
      mixRgb(col, hexRgb(PAL.steelBlue), 0.4),
    )
  }
  r.hf(x, x + w - 1, wallTop, rim, 0.6)
  // 窗带
  if (o.winCol) {
    winGrid(r, x + 8, wallTop + Math.round(h * 0.24), Math.max(2, Math.round(w / 34)), 2, 12, 10, o.winCol, (o.seed || 0x9a1) >>> 0, {
      gapX: 10,
      gapY: 12,
      skip: 0.18,
      lit: o.litCol,
      litChance: o.litChance || 0.06,
    })
  }
  // 板缝 + 侧暗
  for (let y = wallTop + 6; y < baseY; y += 11) r.hf(x, x + w - 1, y, dark, 0.3)
  r.vfill(x, wallTop, baseY, dark, 0.6)
  r.vfill(x + w - 1, wallTop, baseY, dark, 0.7)
  if (o.rust) streaks(r, x, w, wallTop + 4, baseY, o.rust, (o.seed ^ 0x71) >>> 0, 0.3, 0.45)
}

/** 卧式储罐：圆顶 + 环箍 + 爬梯 */
function tank(r, x, baseY, w, h, col, o = {}) {
  const dark = darker(col, 0.5)
  const rim = lighter(col, 0.2)
  r.rect(x, baseY - h, w, h, col)
  const cx = x + w / 2
  for (let dy = 0; dy <= 9; dy++) {
    const half = (w / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(dy / 9.5, 2)))
    r.hf(cx - half, cx + half, baseY - h - 9 + dy, col)
  }
  for (let b = 0; b < 3; b++) {
    r.hf(x, x + w - 1, baseY - h + Math.round(h * (0.22 + b * 0.26)), dark, 0.45)
  }
  r.vfill(x, baseY - h - 9, baseY, dark, 0.4)
  r.vfill(x + w - 1, baseY - h - 9, baseY, dark, 0.65)
  // 顶部高光弧
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    const ang = Math.PI * (1 - t)
    r.alpha(Math.round(cx + Math.cos(ang) * w * 0.4), Math.round(baseY - h - 9 + Math.sin(ang) * 9), rim, 0.5)
  }
  // 爬梯
  const lx = x + w - 6
  r.vfill(lx, baseY - h - 2, baseY, rim, 0.7)
  for (let y = baseY - h; y < baseY; y += 5) r.hf(lx - 3, lx, y, rim, 0.5)
  if (o.rust) streaks(r, x, w, baseY - h, baseY, o.rust, (o.seed || 0x4e1) >>> 0, 0.22, 0.5)
}

/** 输送带：两条平行带 + 支腿 + 滚轮 */
function conveyor(r, x0, x1, y, col, o = {}) {
  const dark = darker(col, 0.5)
  const rim = lighter(col, 0.18)
  const th = o.th || 6
  r.hf(x0, x1, y, mixRgb(col, dark, 0.3))
  r.hf(x0, x1, y + 1, col)
  r.hf(x0, x1, y + th - 1, dark)
  for (let x = x0; x <= x1; x += 7) r.alpha(x, y + 2, rim, 0.5)
  // 支腿
  for (let x = x0 + 30; x <= x1; x += (o.legGap || 150)) {
    r.vfill(x, y + th, o.baseY || r.h, dark)
    r.vfill(x + 1, y + th, o.baseY || r.h, darker(dark, 0.3))
    r.line(x, y + th + 6, x + 22, y + th + 26, dark, 0.8)
  }
  // 带上的料（碎石）
  for (let i = 0; i < (x1 - x0) / 26; i++) {
    const bx = x0 + Math.round(hash2(i, 3, 0xc07) * (x1 - x0))
    const bh = 2 + Math.round(hash2(i, 4, 0xc08) * 4)
    r.hf(bx, bx + 3 + Math.round(hash2(i, 5, 0xc09) * 6), y - bh, mixRgb(col, dark, 0.2))
  }
}

function paintFactoryFar(r, S) {
  const F = S.far
  const rng = makeRng(0x5a17c)
  const baseY = 484

  // 1) 远景厂房群（低矮长条，锯齿顶）
  const halls = [
    [40, 300, 74],
    [368, 246, 62],
    [700, 340, 86],
    [1052, 268, 66],
  ]
  for (let i = 0; i < halls.length; i++) {
    hall(r, halls[i][0], baseY, halls[i][1], halls[i][2], F.base, {
      dark: F.dark,
      rim: F.rim,
      teeth: 4,
      winCol: F.win,
      seed: 0x11a + i,
    })
  }

  // 2) 冷却塔 ×2（带蒸汽）
  coolTower(r, 246, 168, 178, baseY, F.base, {
    dark: F.dark,
    light: F.rim,
    steam: 108,
    steamCol: F.smoke,
    steamAlpha: 0.3,
  })
  coolTower(r, 928, 152, 206, baseY, F.base, {
    dark: F.dark,
    light: F.rim,
    steam: 92,
    steamCol: F.smoke,
    steamAlpha: 0.26,
  })

  // 3) 巨型烟囱群（高矮不一 → 天际线节奏）
  const stacks = [
    [432, 30, 96],
    [512, 24, 150],
    [596, 20, 204],
    [676, 26, 128],
    [1124, 28, 176],
    [1196, 22, 108],
  ]
  for (let i = 0; i < stacks.length; i++) {
    chimney(r, stacks[i][0], stacks[i][1], baseY - stacks[i][2], baseY, F.base, {
      dark: F.dark,
      light: F.rim,
      seed: (0x300 + i * 31) | 0,
      bands: 5,
      smoke: stacks[i][2] * 0.5,
      smokeCol: F.smoke,
      smokeAlpha: 0.36,
      smokeDrift: 32 + (i % 3) * 12,
      smokeSteps: 18,
    })
  }

  // 4) 管廊桥（横贯）
  pipeBridge(r, -30, BG_W + 30, 262, F.base, { dark: F.dark, rim: F.rim, baseY: baseY, legs: 4 })
  pipeBridge(r, -30, BG_W + 30, 330, F.base, { dark: F.dark, rim: F.rim, baseY: baseY, legs: 6 })

  // 5) 龙门吊
  crane(r, 1412 - BG_W, baseY, 156, 188, F.base, { hookLen: 46, legGap: 30 })

  // 6) 地面 + 烟霾 + 低空蒸汽
  verticalShade(r, 40, baseY, F.dark, 0.42)
  farGround(r, baseY, F.ground, F.haze, 0.3)
  smokeBand(r, 400, baseY + 2, F.smoke, 0.34, 0x5f21, 66)
  aerialHaze(r, F.haze, 240, baseY, 0.24, 1.9)
  mottle(r, F.dark, F.rim, 0x5ab7, 0.32, 3)
  void rng
}

/** 管廊桥：两根主管 + 立柱 + 斜撑 */
function pipeBridge(r, x0, x1, y, col, o = {}) {
  const dark = o.dark || darker(col, 0.5)
  const rim = o.rim || lighter(col, 0.16)
  r.hf(x0, x1, y, col)
  r.hf(x0, x1, y + 1, rim, 0.5)
  r.hf(x0, x1, y + 4, col)
  r.hf(x0, x1, y + 5, dark)
  // 立柱
  const legs = o.legs || 5
  const step = (x1 - x0) / legs
  for (let i = 1; i < legs; i++) {
    const lx = Math.round(x0 + step * i)
    r.vfill(lx, y + 5, o.baseY || r.h, col)
    r.vfill(lx + 1, y + 5, o.baseY || r.h, dark)
    r.line(lx, y + 20, lx + 26, y + 5, dark, 0.8)
    r.line(lx, y + 20, lx - 26, y + 5, dark, 0.8)
  }
  // 法兰
  for (let x = Math.round(x0 + 60); x < x1; x += 170) {
    r.rect(x, y - 1, 4, 7, mixRgb(col, dark, 0.3))
  }
}

function paintFactoryMid(r, S) {
  const M = S.mid
  const baseY = 530

  // 1) 主厂房（带亮窗、锈迹）
  hall(r, 148, baseY, 470, 218, M.base, {
    dark: M.dark,
    rim: M.rim,
    teeth: 6,
    roofH: 52,
    winCol: M.win,
    litCol: M.lit,
    litChance: 0.14,
    seed: 0x3301,
    rust: M.rust,
  })
  hall(r, 760, baseY, 386, 166, M.base, {
    dark: M.dark,
    rim: M.rim,
    teeth: 5,
    roofH: 40,
    winCol: M.win,
    litCol: M.lit,
    litChance: 0.1,
    seed: 0x3302,
    rust: M.rust,
  })

  // 2) 烟囱（近处两根，带警示环）
  chimney(r, 640, 42, baseY - 306, baseY, M.base, {
    dark: M.dark,
    light: M.rim,
    seed: 0x4401,
    bands: 7,
    smoke: 150,
    smokeCol: M.smoke,
    smokeAlpha: 0.32,
    smokeDrift: 40,
  })
  chimney(r, 1216, 34, baseY - 236, baseY, M.base, {
    dark: M.dark,
    light: M.rim,
    seed: 0x4402,
    bands: 6,
    smoke: 110,
    smokeCol: M.smoke,
    smokeAlpha: 0.26,
    smokeDrift: 28,
  })

  // 3) 储罐 + 管道
  tank(r, 22, baseY, 96, 118, M.base, { rust: M.rust, seed: 0x44a1 })
  tank(r, 112, baseY, 62, 84, mixRgb(M.base, M.dark, 0.25), { rust: M.rust, seed: 0x44a2 })
  pipeRun(r, 180, 640, 402, 13, M.base, { hi: M.rim, lo: M.dark, legs: true, legTo: baseY, seed: 0x44b1 })
  pipeRun(r, 1044, 1290, 438, 10, M.base, { hi: M.rim, lo: M.dark, legs: true, legTo: baseY, seed: 0x44b2 })
  // 竖管（从厂房顶穿出）
  r.vfill(560, 268, 396, M.base)
  r.vfill(561, 268, 396, M.rim, 0.6)
  r.vfill(562, 268, 396, M.dark)
  r.hf(556, 566, 268, mixRgb(M.base, M.dark, 0.3))

  // 4) 输送带（斜上去）
  for (let i = 0; i <= 120; i++) {
    const t = i / 120
    const x = 690 + t * 236
    const y = 500 - t * 116
    r.rect(x, y, 5, 4, mixRgb(M.base, M.dark, 0.2))
    if (i % 9 === 0) r.alpha(x, y + 4, M.dark, 0.7)
  }
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const x = 700 + t * 216
    const y = 502 - t * 108
    r.vfill(x, y, baseY, M.dark)
  }

  // 5) 探照灯（三盏，光柱向下抖动）
  const spots = [
    [364, 196, 1],
    [900, 214, -1],
    [1120, 262, -1],
  ]
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i]
    r.vfill(sp[0], sp[1] + 8, baseY, M.dark)
    r.hf(sp[0] - 3, sp[0] + 3, sp[1] + 8, M.dark)
    spotBeam(r, sp[0] + sp[2] * 3, sp[1] + 12, 210, 26, mixRgb(M.lit, M.smoke, 0.4), 0.16, 0x5b0 + i)
    spotLamp(r, sp[0], sp[1], mixRgb(M.base, M.dark, 0.4), { size: 7, glow: M.lit })
  }

  // 6) 地面 + 蒸汽
  r.rect(0, baseY - 3, BG_W, BG_H - baseY + 3, darker(M.base, 0.5))
  smokeBand(r, 448, BG_H, M.smoke, 0.36, 0x5aa1, 54)
  smokeBand(r, 486, BG_H, M.smoke, 0.3, 0x5aa2, 38)
  mottle(r, M.dark, M.rim, 0x5ac3, 0.3, 3)
  aerialHaze(r, M.haze, 330, baseY + 20, 0.12, 1.4)
}

function paintFactoryNear(r, S) {
  const N = S.near
  const baseY = 560

  // 1) 底座：渣土堆
  colFill(
    r,
    0,
    BG_W - 1,
    (x) => 506 - 20 * fbmX(x, 0, BG_W, 36, 0x6f1, 3) - 10 * Math.sin((x / BG_W) * TAU * 3 + 1.1),
    baseY,
    N.base,
  )

  // 2) 横贯前景的粗管道（遮挡条，形成强前景）
  pipeRun(r, -20, BG_W + 20, 372, 26, N.base, { hi: N.rim, lo: N.dark, flangeGap: 260, seed: 0x6f2 })
  // 管上垂下的锈流 / 污渍
  for (let i = 0; i < 26; i++) {
    const x = Math.round(hash2(i, 3, 0x6f3) * BG_W)
    const len = 8 + hash2(i, 4, 0x6f4) * 26
    r.vfill(x, 398, 398 + len, N.dark, 0.55)
  }
  // 管道支腿
  for (let x = 140; x < BG_W; x += 380) {
    r.rect(x, 398, 7, baseY - 398, N.base)
    r.rect(x + 7, 398, 3, baseY - 398, N.dark)
  }

  // 3) 阀门手轮
  const vx = 852
  const vy = 372
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * TAU
    r.line(vx, vy, vx + Math.cos(ang) * 30, vy + Math.sin(ang) * 30, N.base, 1, 2)
  }
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * TAU
    r.line(vx + Math.cos(ang) * 30, vy + Math.sin(ang) * 30, vx + Math.cos(ang + 0.78) * 30, vy + Math.sin(ang + 0.78) * 30, N.base)
  }
  r.rect(vx - 4, vy - 4, 8, 8, N.rim, 0.8)

  // 4) 铁网围栏（前景，粗）
  fence(r, -20, 460, 556, 168, N.base, 0x6f5, { postGap: 92, postW: 4, miss: 0.1, wires: 4, mesh: true })
  fence(r, 1080, BG_W + 20, 552, 142, N.base, 0x6f6, { postGap: 84, postW: 4, miss: 0.18, wires: 3, mesh: true })

  // 5) 桶 / 废料 / 悬吊的电缆
  barrel(r, 200, 552, 30, N.base, { w: 16, rim: N.rim })
  barrel(r, 226, 552, 26, N.base, { w: 13 })
  barrel(r, 1002, 548, 34, N.base, { w: 18, rim: N.rim })
  r.poly(
    [
      [520, 560],
      [600, 560],
      [700, 470],
      [676, 452],
    ],
    darker(N.base, 0.2),
  )
  cable(r, 236, 1010, 214, 92, N.base, { thick: 2, dangle: 6 })
  cable(r, -20, 360, 150, 62, N.base, { thick: 1, dangle: 3 })

  // 6) 底部压黑 + 焦油光泽
  colFill(r, 0, BG_W - 1, (x) => 546 - 7 * fbmX(x, 0, BG_W, 18, 0x6f7, 2), baseY, N.dark)
  for (let i = 0; i < 9; i++) {
    const x = Math.round(hash2(i, 5, 0x6f8) * BG_W)
    r.hf(x, x + 12 + hash2(i, 6, 0x6f9) * 30, 549, N.rim, 0.25)
  }
  mottle(r, N.dark, N.rim, 0x6fa0, 0.26, 4)
}

/* ============================================================================
 * 10. DUMP —— 回收场：垃圾山、吊车、堆叠集装箱、焚烧坑
 * ========================================================================== */

/** 垃圾堆上的碎屑高光 / 暗斑（只落在已有像素上） */
function debris(r, xc, halfW, y0, y1, count, hi, lo, seed) {
  const rng = makeRng(seed >>> 0)
  for (let i = 0; i < count; i++) {
    const x = Math.round(xc + (rng.next() - 0.5) * 2 * halfW)
    const y = Math.round(y0 + rng.next() * (y1 - y0))
    if (r.getA(x, y) === 0) continue
    const c = rng.next() > 0.55 ? hi : lo
    const w = rng.next() > 0.86 ? 2 : 1
    r.rect(x, y, w, 1, c, 0.7)
    if (rng.next() > 0.9) r.rect(x, y + 1, 1, 1, lo, 0.5)
  }
}

/** 焚烧坑：中心暖光 + 抖动外扩 + 上升火星 */
function firePit(r, x, y, w, h, col, seed, a = 0.5) {
  for (let dy = -h; dy <= h; dy++) {
    for (let dx = -w; dx <= w; dx++) {
      const d = Math.hypot(dx / w, dy / h)
      if (d > 1) continue
      const aa = a * Math.pow(1 - d, 1.9) * (0.55 + 0.45 * hash2(dx, dy, seed))
      if (hash2(dx + 91, dy + 37, seed) < 0.3) continue
      r.alpha(x + dx, y + dy, col, aa)
    }
  }
  // 火星
  for (let i = 0; i < 10; i++) {
    const sx = x + Math.round((hash2(i, 1, seed) - 0.5) * w * 1.2)
    const sy = y - Math.round(hash2(i, 2, seed) * h * 1.9)
    r.alpha(sx, sy, hexRgb(PAL.rustHot), 0.55)
  }
}

function paintDumpFar(r, S) {
  const F = S.far
  const baseY = 474

  // 1) 远山
  ridge(r, mixRgb(F.base, F.dark, 0.22), (x) => 342 + 30 * Math.sin((x / BG_W) * TAU * 2 + 1.3) + 11 * Math.sin((x / BG_W) * TAU * 6 + 0.4), baseY)

  // 2) 垃圾山（三座，圆浑的堆体而不是尖山）
  const heaps = [
    [180, 210, 128, 0x7a1],
    [520, 176, 104, 0x7a2],
    [880, 268, 152, 0x7a3],
    [1230, 168, 118, 0x7a4],
  ]
  for (let i = 0; i < heaps.length; i++) {
    mound(r, heaps[i][0], heaps[i][1], heaps[i][2], baseY, F.base, heaps[i][3], {
      power: 0.86,
      wobble: 0.3,
      cell: 46,
      rim: F.rim,
    })
    debris(r, heaps[i][0], heaps[i][1], baseY - heaps[i][2], baseY, 90, F.rim, F.dark, heaps[i][3] + 7)
  }

  // 3) 远处龙门吊 + 棚屋
  crane(r, 690, baseY, 172, 210, F.base, { hookLen: 40, legGap: 34 })
  shed(r, 342, baseY, 104, 46, F, { roof: 0.4 })
  shed(r, 1064, baseY, 86, 40, F, { roof: 0.55 })

  // 4) 燃烧的烟气柱
  for (let i = 0; i < 3; i++) {
    smokePlume(r, 250 + i * 380, baseY - 30, 250 - i * 24, 26, 118, F.smoke, 0x7b0 + i, {
      alpha: 0.34,
      drift: 44 + i * 10,
      steps: 20,
    })
  }

  // 5) 地面 + 霾
  verticalShade(r, 130, baseY, F.dark, 0.36)
  farGround(r, baseY, F.ground, F.haze, 0.36)
  smokeBand(r, 392, baseY + 4, F.smoke, 0.32, 0x7c11, 68)
  aerialHaze(r, F.haze, 280, baseY, 0.28, 1.9)
  mottle(r, F.dark, F.rim, 0x7d21, 0.32, 3)
}

/** 铁皮棚屋：歪斜的屋顶 + 门洞 */
function shed(r, x, baseY, w, h, F, o = {}) {
  const wall = mixRgb(F.base, F.dark, 0.18)
  r.rect(x, baseY - h, w, h, wall)
  r.poly(
    [
      [x - 4, baseY - h],
      [x + w * 0.62, baseY - h - h * (o.roof || 0.4)],
      [x + w + 4, baseY - h + 3],
      [x + w + 4, baseY - h + 5],
      [x - 4, baseY - h + 5],
    ],
    mixRgb(wall, F.dark, 0.5),
  )
  r.rect(x + w * 0.34, baseY - h * 0.7, w * 0.26, h * 0.7, mixRgb(wall, hexRgb(PAL.black), 0.6))
  r.vfill(x, baseY - h, baseY, F.dark, 0.5)
  r.vfill(x + w - 1, baseY - h, baseY, F.dark, 0.65)
  // 波纹板竖纹
  for (let i = 3; i < w; i += 5) r.vfill(x + i, baseY - h + 2, baseY, F.dark, 0.28)
}

function paintDumpMid(r, S) {
  const M = S.mid
  const baseY = 534

  // 1) 大垃圾山（左侧 + 中央）
  mound(r, 190, 268, 196, baseY, M.base, 0x8a11, { power: 0.84, wobble: 0.28, cell: 50, rim: M.rim })
  debris(r, 190, 268, baseY - 196, baseY, 240, M.rim, M.dark, 0x8a12)
  mound(r, 690, 210, 150, baseY, mixRgb(M.base, M.dark, 0.22), 0x8a13, { power: 0.86, wobble: 0.28, cell: 48, rim: M.rim })
  debris(r, 690, 210, baseY - 150, baseY, 170, M.rim, M.dark, 0x8a14)

  // 2) 堆叠集装箱（右；整体抬高，别被前景垃圾堆吞掉）
  const cs = [
    [936, 420, 128, 40],
    [948, 380, 116, 36],
    [1052, 434, 140, 46],
    [1080, 390, 128, 40],
    [1188, 420, 96, 34],
    [1006, 344, 104, 32],
  ]
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]
    container(r, c[0], c[1], c[2], c[3], i % 2 ? mixRgb(M.base, M.rust, 0.34) : mixRgb(M.base, M.edge, 0.3), {
      dark: M.dark,
      light: M.rim,
      rust: M.rust,
      seed: (0x8b00 + i * 13) | 0,
    })
  }
  // 一只歪倒的
  r.poly(
    [
      [300, 470],
      [420, 454],
      [430, 492],
      [306, 508],
    ],
    mixRgb(M.base, M.rust, 0.45),
  )
  for (let i = 0; i < 7; i++) {
    r.line(310 + i * 16, 468 - i, 312 + i * 16, 506 - i, M.dark, 0.5)
  }

  // 3) 塔吊 / 吊车（吊钩悬在垃圾山上方）
  crane(r, 470, baseY, 262, 330, M.base, { hookLen: 96, legGap: 46, legW: 6 })

  // 4) 焚烧坑（右下，暖光 + 抖动）
  firePit(r, 1150, baseY - 10, 96, 34, hexRgb(PAL.rustHot), 0x8c01, 0.32)
  firePit(r, 1146, baseY - 12, 54, 20, hexRgb(PAL.neonWarm), 0x8c02, 0.4)
  // 坑边焦黑
  for (let i = 0; i < 60; i++) {
    const x = 1150 + Math.round((hash2(i, 1, 0x8c03) - 0.5) * 220)
    const y = baseY - Math.round(hash2(i, 2, 0x8c04) * 30)
    r.alpha(x, y, darker(M.base, 0.55), 0.5)
  }

  // 5) 轮胎堆 + 输送带
  for (let i = 0; i < 5; i++) {
    tire(r, 840, baseY - i * 9, 26 - i, mixRgb(M.base, M.dark, 0.35), { hub: i === 0 ? M.dark : null })
  }
  conveyor(r, 90, 400, 452, mixRgb(M.base, M.dark, 0.15), { th: 7, baseY: baseY, legGap: 118 })

  // 6) 地面 + 烟
  r.rect(0, baseY - 2, BG_W, BG_H - baseY + 2, darker(M.base, 0.5))
  smokeBand(r, 440, BG_H, M.smoke, 0.34, 0x8d11, 56)
  smokeBand(r, 480, BG_H, M.smoke, 0.28, 0x8d12, 40)
  mottle(r, M.dark, M.rim, 0x8e21, 0.32, 3)
  aerialHaze(r, M.haze, 380, baseY + 18, 0.13, 1.4)
}

function paintDumpNear(r, S) {
  const N = S.near
  const baseY = 560

  // 1) 前景大垃圾堆（右重左轻）
  colFill(
    r,
    0,
    BG_W - 1,
    (x) =>
      500 -
      34 * fbmX(x, 0, BG_W, 30, 0x9a1, 3) -
      14 * Math.sin((x / BG_W) * TAU * 2 + 0.4) -
      22 * Math.max(0, Math.sin((x / BG_W) * TAU + 0.9)),
    baseY,
    N.base,
  )
  debris(r, 700, 700, 470, baseY, 260, N.rim, N.dark, 0x9a2)

  // 2) 轮胎堆（前景）
  const tires = [
    [180, 556, 40],
    [186, 528, 36],
    [176, 502, 32],
    [600, 552, 34],
  ]
  for (let i = 0; i < tires.length; i++) {
    tire(r, tires[i][0], tires[i][1], tires[i][2], N.base, { hub: N.dark })
    r.alpha(tires[i][0] - tires[i][2] * 0.4, tires[i][1] - tires[i][2], N.rim, 0.3)
  }

  // 3) 斜倚的铁皮 + 桶
  r.poly(
    [
      [380, 560],
      [520, 560],
      [610, 402],
      [566, 388],
    ],
    darker(N.base, 0.12),
  )
  for (let i = 0; i < 9; i++) {
    r.line(392 + i * 16, 556 - i * 1, 574 + i * 5, 392 - i * 1, N.dark, 0.45)
  }
  r.hf(566, 610, 390, N.rim, 0.4)
  barrel(r, 306, 552, 34, N.base, { w: 17, rim: N.rim })
  barrel(r, 330, 550, 28, N.base, { w: 14 })
  barrel(r, 1050, 552, 38, N.base, { w: 19, rim: N.rim })

  // 4) 吊臂 + 吊钩（从画面上方垂进来；顶部 20 行留空，保持"透明天空"）
  r.rect(816, 22, 16, 74, N.base)
  r.line(824, 96, 1010, 132, N.base, 1, 4)
  r.vfill(1006, 132, 236, N.base)
  r.rect(998, 236, 20, 8, N.base)
  r.line(1004, 244, 996, 262, N.base, 1, 2)

  // 5) 悬垂电缆 + 飞散的塑料袋
  cable(r, -20, 540, 128, 96, N.base, { thick: 2, dangle: 4 })
  for (let i = 0; i < 7; i++) {
    const x = Math.round(hash2(i, 1, 0x9b1) * BG_W)
    const y = 160 + Math.round(hash2(i, 2, 0x9b2) * 220)
    r.rect(x, y, 3, 2, N.rim, 0.4)
    r.alpha(x + 1, y + 2, N.rim, 0.25)
  }

  // 6) 底部压黑
  colFill(r, 0, BG_W - 1, (x) => 542 - 9 * fbmX(x, 0, BG_W, 16, 0x9c1, 2), baseY, N.dark)
  mottle(r, N.dark, N.rim, 0x9d31, 0.26, 4)
}

/* ============================================================================
 * 11. 地表：ground（四向平铺材质） / groundTop（带地表边缘）
 * ========================================================================== */

/** 双轴绕圈的小矩形（地砖必须四向可平铺） */
function tileRect(r, x, y, w, h, c, a = 1) {
  const tw = r.w
  const th = r.h
  for (let j = 0; j < h; j++) {
    const yy = (((y + j) % th) + th) % th
    for (let i = 0; i < w; i++) {
      const xx = (((x + i) % tw) + tw) % tw
      if (a >= 1) r.opaque(xx, yy, c)
      else r.alpha(xx, yy, c, a)
    }
  }
}

/** 混凝土板：16 网格 + 灰缝 + 裂缝 + 锈渍（city） */
function paintGroundConcrete(r, G) {
  const size = r.w
  const joint = mixRgb(G.dark, hexRgb(PAL.void), 0.28)
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = fbmTile(x, y, size, 8, 0x31a1, 3)
      const h = hash2(x >> 1, y >> 1, 0x31a2)
      let c = G.base
      if (n < 0.4) c = mixRgb(G.base, G.dark, 0.55)
      else if (n < 0.52) c = mixRgb(G.base, G.dark, 0.26)
      else if (n > 0.68) c = mixRgb(G.base, G.light, 0.32)
      if (h > 0.88) c = mixRgb(c, G.dark, 0.42)
      else if (h < 0.07) c = mixRgb(c, G.light, 0.38)
      r.rect(x, y, 2, 2, c)
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = x % 16 === 0
      const my = y % 16 === 0
      if (mx || my) {
        r.opaque(x, y, joint)
      } else if ((x % 16 === 1 && y % 16 !== 15) || (y % 16 === 1 && x % 16 !== 15)) {
        r.alpha(x, y, G.light, 0.24)
      } else if (x % 16 === 15 || y % 16 === 15) {
        r.alpha(x, y, G.dark, 0.32)
      }
    }
  }
  // 裂缝（x 自动绕圈；y 收在板内）
  for (let i = 0; i < 3; i++) {
    let cx = 3 + i * 11
    let cy = 4 + ((i * 7) % 9)
    const len = 7 + i * 2
    for (let k = 0; k < len; k++) {
      r.alpha(cx, cy, joint, 0.85)
      cx += hash2(k, i, 0x31a3) > 0.5 ? 1 : -1
      cy += 1
      if (cy > 28) break
    }
  }
  // 锈渍 / 水渍（混凝土上最显眼的暖色）
  for (let i = 0; i < 9; i++) {
    const px = Math.round(hash2(i, 1, 0x31a4) * size)
    const py = Math.round(hash2(i, 2, 0x31a5) * size)
    const pw = 2 + Math.round(hash2(i, 3, 0x31a6) * 6)
    const ph = 1 + Math.round(hash2(i, 4, 0x31a7) * 5)
    tileRect(r, px, py, pw, ph, G.rust, 0.34)
    if (i % 3 === 0) tileRect(r, px + 1, py + 1, Math.max(1, pw - 2), 1, mixRgb(G.rust, G.light, 0.4), 0.35)
  }
}

/** 干裂夯土：细碎土块 + 裂线 + 小石子（village） */
function paintGroundEarth(r, G) {
  const size = r.w
  const crack = mixRgb(G.dark, hexRgb(PAL.void), 0.3)
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = fbmTile(x, y, size, 4, 0x4b11, 3)
      const h = hash2(x >> 1, y >> 1, 0x4b12)
      let c = G.base
      if (n < 0.38) c = mixRgb(G.base, G.dark, 0.5)
      else if (n > 0.66) c = mixRgb(G.base, G.light, 0.3)
      if (h > 0.86) c = mixRgb(c, G.dark, 0.35)
      else if (h < 0.08) c = mixRgb(c, G.light, 0.35)
      r.rect(x, y, 2, 2, c)
    }
  }
  // 干裂纹：主裂缝横贯整块（横向绕圈 → 平铺后依然连续），再分两条支缝
  for (let i = 0; i < 2; i++) {
    let cx = Math.round(hash2(i, 1, 0x4b13) * size)
    let cy = 5 + i * 12
    for (let k = 0; k < size; k++) {
      r.alpha(cx, cy, crack, 0.55)
      r.alpha(cx, cy + 1, crack, 0.24)
      cx = (cx + 1) % size
      const roll = hash2(k, i, 0x4b16)
      if (roll > 0.66) cy += 1
      else if (roll < 0.2) cy -= 1
      cy = Math.max(1, Math.min(size - 3, cy))
      if (k % 9 === 4) {
        // 支缝：斜着分出去一小段
        const sx = cx
        const sy = cy
        for (let j = 1; j <= 4; j++) {
          tileRect(r, sx + (i ? -j : j), sy + j, 1, 1, crack, 0.5)
        }
      }
    }
  }
  // 小石子
  for (let i = 0; i < 12; i++) {
    const px = Math.round(hash2(i, 5, 0x4b17) * size)
    const py = Math.round(hash2(i, 6, 0x4b18) * size)
    const c = hash2(i, 7, 0x4b19) > 0.5 ? G.light : G.rust
    tileRect(r, px, py, hash2(i, 8, 0x4b1a) > 0.6 ? 2 : 1, 1, c, 0.6)
    tileRect(r, px, py + 1, 1, 1, crack, 0.4)
  }
  // 干枯草根
  for (let i = 0; i < 5; i++) {
    const px = Math.round(hash2(i, 9, 0x4b1b) * size)
    const py = Math.round(hash2(i, 10, 0x4b1c) * size)
    for (let k = 0; k < 4; k++) tileRect(r, px + k, py + (k % 2), 1, 1, hexRgb(PAL.mossDead), 0.45)
  }
}

/** 铆接钢板：16 板格 + 铆钉 + 锈流 + 划痕（factory） */
function paintGroundPlate(r, G) {
  const size = r.w
  const seam = mixRgb(G.dark, hexRgb(PAL.void), 0.4)
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = fbmTile(x, y, size, 8, 0x5c11, 3)
      const h = hash2(x >> 1, y >> 1, 0x5c12)
      let c = G.base
      if (n < 0.42) c = mixRgb(G.base, G.dark, 0.45)
      else if (n > 0.7) c = mixRgb(G.base, G.light, 0.26)
      if (h > 0.9) c = mixRgb(c, G.dark, 0.4)
      r.rect(x, y, 2, 2, c)
    }
  }
  // 板缝 + 板面倒角（板中心微鼓）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x % 16 === 0 || y % 16 === 0) r.opaque(x, y, seam)
      else if (x % 16 === 1 || y % 16 === 1) r.alpha(x, y, G.light, 0.3)
      else if (x % 16 === 15 || y % 16 === 15) r.alpha(x, y, G.dark, 0.45)
      else if (x % 16 === 8 || y % 16 === 8) r.alpha(x, y, G.dark, 0.12)
    }
  }
  // 四角铆钉
  for (let by = 0; by < size; by += 16) {
    for (let bx = 0; bx < size; bx += 16) {
      const pts = [
        [bx + 3, by + 3],
        [bx + 12, by + 3],
        [bx + 3, by + 12],
        [bx + 12, by + 12],
      ]
      for (const p of pts) {
        r.opaque(p[0], p[1], G.light)
        r.alpha(p[0], p[1] + 1, G.dark, 0.6)
        r.alpha(p[0] + 1, p[1], G.dark, 0.35)
      }
    }
  }
  // 锈水竖流（周期 8 → 平铺安全）
  for (let x = 3; x < size; x += 8) {
    const len = 4 + Math.round(hash2(x, 1, 0x5c13) * 10)
    for (let k = 0; k < len; k++) r.alpha(x, k + 2, G.rust, 0.3 * (1 - k / len))
  }
  // 划痕
  for (let i = 0; i < 4; i++) {
    const px = Math.round(hash2(i, 2, 0x5c14) * size)
    const py = Math.round(hash2(i, 3, 0x5c15) * size)
    for (let k = 0; k < 5; k++) tileRect(r, px + k, py + (k >> 1), 1, 1, G.light, 0.22)
  }
}

/** 压实的废料 + 泥土（dump） */
function paintGroundScrap(r, G) {
  const size = r.w
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = fbmTile(x, y, size, 4, 0x6d11, 3)
      const h = hash2(x >> 1, y >> 1, 0x6d12)
      let c = G.base
      if (n < 0.36) c = mixRgb(G.base, G.dark, 0.5)
      else if (n > 0.62) c = mixRgb(G.base, G.light, 0.28)
      if (h > 0.84) c = mixRgb(c, G.rust, 0.4)
      else if (h < 0.1) c = mixRgb(c, G.dark, 0.35)
      r.rect(x, y, 2, 2, c)
    }
  }
  // 碎片：随机小矩形（双轴绕圈）
  for (let i = 0; i < 9; i++) {
    const px = Math.round(hash2(i, 1, 0x6d13) * size)
    const py = Math.round(hash2(i, 2, 0x6d14) * size)
    const pw = 2 + Math.round(hash2(i, 3, 0x6d15) * 5)
    const ph = 1 + Math.round(hash2(i, 4, 0x6d16) * 3)
    const plate = hash2(i, 5, 0x6d17) > 0.5 ? G.light : G.dark
    tileRect(r, px, py, pw, ph, plate, 0.85)
    for (let k = 0; k < pw; k++) tileRect(r, px + k, py, 1, 1, G.light, 0.35)
  }
  // 一点毒渍（只点在碎料缝里）
  for (let i = 0; i < 3; i++) {
    const px = Math.round(hash2(i, 6, 0x6d18) * size)
    const py = Math.round(hash2(i, 7, 0x6d19) * size)
    tileRect(r, px, py, 2, 1, hexRgb(PAL.toxicDark), 0.5)
    tileRect(r, px, py + 1, 1, 1, hexRgb(PAL.toxic), 0.25)
  }
}

const GROUND_PAINTERS = {
  city: paintGroundConcrete,
  village: paintGroundEarth,
  factory: paintGroundPlate,
  dump: paintGroundScrap,
  metro: paintGroundMetro,
  hospital: paintGroundHospital,
  port: paintGroundPort,
}

function paintGround(r, id) {
  const G = biomeStyle(id).ground
  const fn = GROUND_PAINTERS[id] || paintGroundConcrete
  fn(r, G)
}

/**
 * 地表砖：先在底层铺同款材质，再盖上「受光土壳 + 檐下阴影 + 裂缝 + 杂草」。
 * 顶 2 行是亮壳，3~5 行是壳下暗部（接触阴影），6 行之后用像素块抖动过渡到底层材质
 * → 明暗是块状而不是渐变，地表轮廓一眼能看出来。
 */
function paintGroundTop(r, id) {
  paintGround(r, id)
  const S = biomeStyle(id)
  const G = S.ground
  const T = S.groundTop
  const size = r.w
  const dark = mixRgb(G.dark, hexRgb(PAL.void), 0.2)
  const lip = mixRgb(T.crustLo, dark, 0.55)
  const sun = mixRgb(T.crustHi, hexRgb(PAL.sand), 0.35)

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < size; x += 2) {
      const n = fbmTile(x, y, size, 8, 0x7f11, 3)
      const h = hash2(x >> 1, y, 0x7f12)
      let c
      if (y <= 1) c = h > 0.4 ? sun : T.crustHi
      else if (y <= 3) c = mixRgb(T.crustHi, T.crust, n * 0.85)
      else if (y <= 5) c = mixRgb(T.crust, T.crustLo, (y - 3) / 2)
      else if (y <= 7) c = mixRgb(lip, dark, (y - 5) / 2)
      else c = mixRgb(dark, G.base, (y - 7) / 3)
      if (y > 4) {
        // 抖动过渡：越靠下越容易露出材质本身
        if (hash2(x >> 1, y, 0x7f13) < (y - 4) / 6) continue
        if (n > 0.74) c = mixRgb(c, T.crustHi, 0.22)
      }
      r.rect(x, y, 2, 2, ditherRgb(c, x, y, 10))
    }
  }
  // 亮壳边缘的碎石 / 缺口
  for (let i = 0; i < 8; i++) {
    const px = Math.round(hash2(i, 1, 0x7f14) * size)
    const py = 1 + Math.round(hash2(i, 2, 0x7f15) * 3)
    tileRect(r, px, py, 1 + Math.round(hash2(i, 3, 0x7f16) * 2), 1, dark, 0.55)
  }
  // 裂缝（从地表往下）
  for (let i = 0; i < 2; i++) {
    let cx = 4 + i * 13
    let cy = 1
    const len = 6 + i * 3
    for (let k = 0; k < len; k++) {
      r.alpha(cx, cy, dark, 0.8)
      if (hash2(k, i, 0x7f17) > 0.4) cx += hash2(k, i + 3, 0x7f18) > 0.5 ? 1 : -1
      cy += 1
      if (cy > size - 2) break
    }
  }
  // 杂草 / 锈苔（贴着地表长）
  const weedsN =
    id === 'village' ? 9 : id === 'dump' ? 6 : id === 'port' ? 5 : id === 'hospital' ? 3 : id === 'metro' ? 2 : 4
  for (let i = 0; i < weedsN; i++) {
    const px = Math.round(hash2(i, 4, 0x7f19) * size)
    const hh = 2 + Math.round(hash2(i, 5, 0x7f1a) * 4)
    for (let k = 0; k < hh; k++) {
      const c = k === 0 ? T.weedHi : T.weed
      tileRect(r, px + (k > 1 ? 1 : 0), 1 + k, 1, 1, c, 0.85)
    }
  }
  // 顶部一像素的强受光（把地表和墙面的分界画清楚）
  for (let x = 0; x < size; x++) {
    if (hash2(x, 9, 0x7f1b) > 0.22) r.alpha(x, 0, sun, 0.6)
  }
}

/* ============================================================================
 * 12. 纹理生成 / 缓存 / 对外 API
 * ========================================================================== */

const REPEAT = THREE.RepeatWrapping
const CLAMP = THREE.ClampToEdgeWrapping

/**
 * 生成像素化 CanvasTexture。
 * @param {number} w
 * @param {number} h
 * @param {(r: Raster) => void} draw
 * @param {'repeat'|'clamp'} wrapS
 * @param {'repeat'|'clamp'} wrapT
 * @param {string} name 贴图名（调试用）
 */
/**
 * 新建一张离屏像素画布（ImageData 直写）。ctx 不可用时 r = null，调用方需容错。
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D|null, img: ImageData|null, r: Raster|null}}
 */
function newCell(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext ? canvas.getContext('2d') : null
  if (!ctx || typeof ctx.createImageData !== 'function') {
    return { canvas: canvas, ctx: null, img: null, r: null }
  }
  ctx.imageSmoothingEnabled = false
  const img = ctx.createImageData(w, h)
  return { canvas: canvas, ctx: ctx, img: img, r: new Raster(w, h, img.data) }
}

/** 把 cell 写回画布并包装成像素化 CanvasTexture（所有贴图共用这一条收尾） */
function cellTexture(cell, wrapS, wrapT, name) {
  const canvas = cell.canvas
  if (cell.ctx && cell.img) cell.ctx.putImageData(cell.img, 0, 0)
  const w = canvas.width
  const h = canvas.height
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

/** 一步生成像素贴图（原有调用点全部走这里，行为不变） */
function makeTex(w, h, draw, wrapS, wrapT, name) {
  const cell = newCell(w, h)
  if (cell.r) draw(cell.r)
  return cellTexture(cell, wrapS, wrapT, name)
}

/** 把带 alpha 的 raster 按 (0, dy) 叠加到目标 raster 上（云带合成用） */
function blitRasterAlpha(dst, src, dy) {
  const sw = src.w
  const sh = src.h
  const sd = src.data
  for (let y = 0; y < sh; y++) {
    const ty = y + dy
    if (ty < 0 || ty >= dst.h) continue
    for (let x = 0; x < sw; x++) {
      const si = (y * sw + x) << 2
      const a = sd[si + 3]
      if (a === 0) continue
      dst.alpha(x, ty, [sd[si], sd[si + 1], sd[si + 2]], a / 255)
    }
  }
}

const FAR_PAINTERS = {
  city: paintCityFar,
  village: paintVillageFar,
  factory: paintFactoryFar,
  dump: paintDumpFar,
  metro: paintMetroFar,
  hospital: paintHospitalFar,
  port: paintPortFar,
}
const MID_PAINTERS = {
  city: paintCityMid,
  village: paintVillageMid,
  factory: paintFactoryMid,
  dump: paintDumpMid,
  metro: paintMetroMid,
  hospital: paintHospitalMid,
  port: paintPortMid,
}
const NEAR_PAINTERS = {
  city: paintCityNear,
  village: paintVillageNear,
  factory: paintFactoryNear,
  dump: paintDumpNear,
  metro: paintMetroNear,
  hospital: paintHospitalNear,
  port: paintPortNear,
}

const BIOME_CACHE = new Map()

function buildBiomeArt(id) {
  const S = biomeStyle(id)
  const farFn = FAR_PAINTERS[id] || paintCityFar
  const midFn = MID_PAINTERS[id] || paintCityMid
  const nearFn = NEAR_PAINTERS[id] || paintCityNear

  const skyFn = SKY_PAINTERS[id] || paintSky
  const sky = makeTex(SKY_SIZE, SKY_SIZE, (r) => skyFn(r, S.sky), 'clamp', 'clamp', id + ':sky')
  const far = makeTex(BG_W, BG_H, (r) => farFn(r, S), 'repeat', 'clamp', id + ':far')
  const mid = makeTex(BG_W, BG_H, (r) => midFn(r, S), 'repeat', 'clamp', id + ':mid')
  const near = makeTex(BG_W, BG_H, (r) => nearFn(r, S), 'repeat', 'clamp', id + ':near')
  const ground = makeTex(TILE, TILE, (r) => paintGround(r, id), 'repeat', 'repeat', id + ':ground')
  const groundTop = makeTex(TILE, TILE, (r) => paintGroundTop(r, id), 'repeat', 'clamp', id + ':groundTop')

  return {
    id: id,
    biome: id,
    sky: sky,
    far: far,
    mid: mid,
    near: near,
    ground: ground,
    groundTop: groundTop,
    fogColor: S.fog,
    ambient: S.ambient,
  }
}

/**
 * 取某个 biome 的全套背景贴图（首次调用生成，之后走缓存）。
 * 未知 id 回退到 city，永不抛错。
 */
export function getBiomeArt(biomeId) {
  const id = BIOME_ART_IDS.indexOf(biomeId) >= 0 ? biomeId : 'city'
  let art = BIOME_CACHE.get(id)
  if (!art) {
    art = buildBiomeArt(id)
    BIOME_CACHE.set(id, art)
  }
  return art
}

/** 预热全部 biome（可选；标题画面后台加载用） */
export function preloadBiomeArt() {
  for (const id of BIOME_ART_IDS) getBiomeArt(id)
  return BIOME_CACHE.size
}

/** 释放某个（或全部）biome 的贴图显存 */
export function disposeBiomeArt(biomeId) {
  const ids = biomeId ? [biomeId] : [...BIOME_CACHE.keys()]
  for (const id of ids) {
    const art = BIOME_CACHE.get(id)
    if (!art) continue
    for (const k of ['sky', 'far', 'mid', 'near', 'ground', 'groundTop']) {
      const t = art[k]
      if (t && typeof t.dispose === 'function') t.dispose()
    }
    BIOME_CACHE.delete(id)
  }
}

/** 已生成的 biome（调试面板用） */
export function cachedBiomeIds() {
  return [...BIOME_CACHE.keys()]
}

/* ============================================================================
 * 13. 昼夜天空 / 太阳月亮 / 星空 / 光柱
 *
 *   对外契约：
 *     getSkyArt(phaseId) -> { sky, cloud, cloudLayers, cloudMeta, tint, amb, stars,
 *                             sun, moon, horizon }
 *       phaseId ∈ dawn | morning | noon | afternoon | dusk | night
 *     getSunArt()        128×128  沙尘里的太阳（暖白盘 + 大晕）
 *     getMoonArt()       128×128  冷白月盘（陨石坑 + 相位暗部 + 冷晕）
 *     getStarField()     256×256  可四向平铺的星野（含暗红航灯点）
 *     getLightShaftArt() 128×256  尘光柱（白，便于 material.color 染色）
 *
 *   说明：
 *   · sky   全屏渐变底（256×256 拉伸，含地平线暖/冷光）；S/T 均 Clamp。
 *   · cloud 1280×560，把 3 条云带合成好的一整幅（S=Repeat / T=Clamp），只想画一层就用它。
 *   · cloudLayers 3 张 1280×200 的独立云带（S=Repeat / T=Clamp），
 *     引擎可各自用不同速度和高度滚动；cloudMeta 给出 { y, h, speed, alpha }。
 *   · 云带的横向无缝同样靠"周期性噪声 + 绕圈落笔"，与视差层一个规则。
 *   · 全部懒构建 + 按 id 缓存；同 id 第二次调用直接返回同一批 texture。
 * ========================================================================== */

/** 6 个时段（getSkyArt 认的 id，按一天的顺序排列） */
export const SKY_PHASE_IDS = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night']

const CLOUD_BAND_H = 200
const CLOUD_BAND_Y = [16, 150, 330]

/* ---- 云带：三条不同高度 / 厚度 / 速度 ---------------------------------- */

function cloudBands(lightHex, darkHex, seed) {
  return [
    {
      // 高空卷云：薄、亮、跑得最快
      y: CLOUD_BAND_Y[0],
      cell: 160,
      alpha: 0.42,
      cut: 0.6,
      soft: 0.16,
      speed: 1.9,
      seed: (seed + 11) | 0,
      light: mixHex(lightHex, PAL.white, 0.16),
      dark: darkHex,
    },
    {
      // 中云：主体
      y: CLOUD_BAND_Y[1],
      cell: 112,
      alpha: 0.55,
      cut: 0.62,
      soft: 0.18,
      speed: 1.0,
      seed: (seed + 37) | 0,
      light: lightHex,
      dark: mixHex(darkHex, lightHex, 0.22),
    },
    {
      // 低云：厚、暗、慢
      y: CLOUD_BAND_Y[2],
      cell: 78,
      alpha: 0.46,
      cut: 0.64,
      soft: 0.18,
      speed: 0.52,
      seed: (seed + 83) | 0,
      light: lightHex,
      dark: mixHex(darkHex, PAL.void, 0.18),
    },
  ]
}

/* ---- 六个时段的色表 ---------------------------------------------------- */

const PHASE_SPECS = {
  // 黎明：冷蓝黑顶 → 砖橙地平线，低对比、厚霾
  dawn() {
    const top = mixHex(PAL.void, PAL.steelBlue, 0.55)
    const upper = mixHex(PAL.steelBlue, PAL.skyDusk, 0.45)
    const mid = mixHex(PAL.skyDusk, PAL.rustLight, 0.42)
    const horMid = mixHex(PAL.rustLight, PAL.sand, 0.42)
    const horHi = mixHex(PAL.sand, PAL.bone, 0.4)
    const low = mixHex(PAL.rustDark, PAL.skyDusk, 0.45)
    const cloudLight = mixHex(PAL.sand, PAL.bone, 0.4)
    const cloudDark = mixHex(PAL.skyDusk, PAL.steelBlue, 0.5)
    return {
      id: 'dawn',
      sky: {
        stops: [
          [0, top],
          [0.28, upper],
          [0.52, mid],
          [0.7, horMid],
          [0.84, horHi],
          [0.93, mixHex(horMid, low, 0.5)],
          [1, darker(low, 0.35)],
        ],
        horizon: 0.82,
        glow: 0.5,
        glowCol: mixHex(PAL.bone, PAL.rustLight, 0.35),
        cloudA: 0.2,
        cloudLight: cloudLight,
        cloudDark: cloudDark,
        seed: 0x11a1,
      },
      cloud: { bands: cloudBands(cloudLight, cloudDark, 0x11a2) },
      tint: hexNum(mixRgb(mixHex(PAL.rustLight, PAL.sand, 0.5), hexRgb(PAL.steelBlue), 0.3)),
      amb: hexNum(mixHex(PAL.dustLight, PAL.rust, 0.4)),
      stars: false,
      sun: true,
      moon: false,
      navLights: false,
    }
  },

  // 清晨：灰蓝转为淡奶黄，干净但依旧阴霾
  morning() {
    const top = mixHex(PAL.steelBlue, PAL.skyDay, 0.5)
    const upper = mixHex(PAL.skyDay, PAL.sand, 0.28)
    const mid = mixHex(PAL.skyDay, PAL.sand, 0.5)
    const horMid = mixHex(PAL.sand, PAL.bone, 0.35)
    const horHi = mixHex(PAL.sand, PAL.white, 0.32)
    const low = mixHex(PAL.sandDark, PAL.dust, 0.45)
    const cloudLight = mixHex(PAL.white, PAL.sand, 0.45)
    const cloudDark = mixHex(PAL.skyDay, PAL.steelBlue, 0.45)
    return {
      id: 'morning',
      sky: {
        stops: [
          [0, top],
          [0.3, upper],
          [0.56, mid],
          [0.74, horMid],
          [0.87, horHi],
          [0.95, mixHex(horMid, low, 0.55)],
          [1, darker(low, 0.4)],
        ],
        horizon: 0.86,
        glow: 0.36,
        glowCol: mixHex(PAL.white, PAL.sand, 0.5),
        cloudA: 0.18,
        cloudLight: cloudLight,
        cloudDark: cloudDark,
        seed: 0x22b1,
      },
      cloud: { bands: cloudBands(cloudLight, cloudDark, 0x22b2) },
      tint: hexNum(mixHex(PAL.skyDay, PAL.bone, 0.35)),
      amb: hexNum(mixHex(PAL.skyDay, PAL.sandDark, 0.4)),
      stars: false,
      sun: true,
      moon: false,
      navLights: false,
    }
  },

  // 正午：泛白的土黄高光，太阳最硬，云最薄
  noon() {
    const top = mixHex(PAL.sand, PAL.skyDay, 0.5)
    const upper = mixHex(PAL.sand, PAL.bone, 0.35)
    const mid = mixHex(PAL.sand, PAL.white, 0.28)
    const horMid = mixHex(PAL.bone, PAL.white, 0.3)
    const horHi = mixHex(PAL.white, PAL.bone, 0.35)
    const low = mixHex(PAL.dustLight, PAL.sandDark, 0.5)
    const cloudLight = mixHex(PAL.white, PAL.bone, 0.4)
    const cloudDark = mixHex(PAL.sandDark, PAL.skyDay, 0.5)
    return {
      id: 'noon',
      sky: {
        stops: [
          [0, top],
          [0.32, upper],
          [0.58, mid],
          [0.75, horMid],
          [0.88, horHi],
          [0.95, mixHex(horMid, low, 0.5)],
          [1, darker(low, 0.42)],
        ],
        horizon: 0.88,
        glow: 0.3,
        glowCol: mixHex(PAL.white, PAL.bone, 0.4),
        cloudA: 0.14,
        cloudLight: cloudLight,
        cloudDark: cloudDark,
        seed: 0x33c1,
      },
      cloud: { bands: cloudBands(cloudLight, cloudDark, 0x33c2) },
      tint: hexNum(mixHex(PAL.sand, PAL.bone, 0.55)),
      amb: hexNum(mixHex(PAL.sand, PAL.boneDark, 0.35)),
      stars: false,
      sun: true,
      moon: false,
      navLights: false,
    }
  },

  // 午后：琥珀色，云底被晒亮
  afternoon() {
    const top = mixHex(PAL.skyDusk, PAL.steelBlue, 0.42)
    const upper = mixHex(PAL.skyDusk, PAL.rustLight, 0.3)
    const mid = mixHex(PAL.rustLight, PAL.sand, 0.5)
    const horMid = mixHex(PAL.ochre, PAL.sand, 0.5)
    const horHi = mixHex(PAL.sand, PAL.bone, 0.5)
    const low = mixHex(PAL.rustDark, PAL.dust, 0.5)
    const cloudLight = mixHex(PAL.sand, PAL.rustLight, 0.4)
    const cloudDark = mixHex(PAL.rustDark, PAL.skyDusk, 0.55)
    return {
      id: 'afternoon',
      sky: {
        stops: [
          [0, top],
          [0.3, upper],
          [0.55, mid],
          [0.73, horMid],
          [0.86, horHi],
          [0.95, mixHex(horMid, low, 0.55)],
          [1, darker(low, 0.38)],
        ],
        horizon: 0.85,
        glow: 0.42,
        glowCol: mixHex(PAL.sand, PAL.rustLight, 0.45),
        cloudA: 0.22,
        cloudLight: cloudLight,
        cloudDark: cloudDark,
        seed: 0x44d1,
      },
      cloud: { bands: cloudBands(cloudLight, cloudDark, 0x44d2) },
      tint: hexNum(mixHex(PAL.rustLight, PAL.ochre, 0.45)),
      amb: hexNum(mixHex(PAL.rust, PAL.sandDark, 0.45)),
      stars: false,
      sun: true,
      moon: false,
      navLights: false,
    }
  },

  // 黄昏：血锈色地平线 + 紫黑天顶，云底发橙（最后的暖光）
  dusk() {
    const top = mixHex(PAL.void, PAL.bloodDark, 0.5)
    const upper = mixHex(PAL.bloodDark, PAL.skyDusk, 0.5)
    const mid = mixHex(PAL.skyDusk, PAL.rust, 0.5)
    const horMid = mixHex(PAL.rust, PAL.rustHot, 0.42)
    const horHi = mixHex(PAL.rustLight, PAL.ochre, 0.5)
    const low = mixHex(PAL.rustDeep, PAL.bloodDark, 0.5)
    const cloudLight = mixHex(PAL.rustLight, PAL.ochre, 0.5)
    const cloudDark = mixHex(PAL.bloodDark, PAL.rustDeep, 0.5)
    return {
      id: 'dusk',
      sky: {
        stops: [
          [0, top],
          [0.26, upper],
          [0.5, mid],
          [0.7, horMid],
          [0.84, horHi],
          [0.93, mixHex(horMid, low, 0.5)],
          [1, darker(low, 0.3)],
        ],
        horizon: 0.83,
        glow: 0.58,
        glowCol: mixHex(PAL.rustHot, PAL.sand, 0.35),
        cloudA: 0.26,
        cloudLight: cloudLight,
        cloudDark: cloudDark,
        seed: 0x55e1,
      },
      cloud: { bands: cloudBands(cloudLight, cloudDark, 0x55e2) },
      tint: hexNum(mixHex(PAL.rust, PAL.bloodDark, 0.3)),
      amb: hexNum(mixHex(PAL.bloodDark, PAL.rustDark, 0.55)),
      stars: false,
      sun: true,
      moon: false,
      navLights: false,
    }
  },

  // 夜晚：近黑蓝 + 地平线病态绿灰光；星野、月亮、远处红色航灯
  night() {
    const top = mixHex(PAL.void, PAL.black, 0.45)
    const upper = mixHex(PAL.steelBlue, PAL.void, 0.55)
    const mid = mixHex(PAL.steelDark, PAL.steelBlue, 0.5)
    const horMid = mixHex(PAL.steelBlue, PAL.mossDead, 0.4)
    const horHi = mixHex(PAL.steelLight, PAL.mossDead, 0.45)
    const low = mixHex(PAL.void, PAL.steelDark, 0.4)
    const cloudLight = mixHex(PAL.steelLight, PAL.mossDead, 0.5)
    const cloudDark = mixHex(PAL.void, PAL.steelDark, 0.5)
    return {
      id: 'night',
      sky: {
        stops: [
          [0, top],
          [0.34, upper],
          [0.6, mid],
          [0.78, horMid],
          [0.89, horHi],
          [0.96, mixHex(horMid, low, 0.6)],
          [1, low],
        ],
        horizon: 0.88,
        glow: 0.3,
        glowCol: mixHex(PAL.steelLight, PAL.mossDead, 0.4),
        cloudA: 0.16,
        cloudLight: cloudLight,
        cloudDark: cloudDark,
        seed: 0x66f1,
      },
      cloud: { bands: cloudBands(cloudLight, cloudDark, 0x66f2) },
      tint: hexNum(mixHex(PAL.steelBlue, PAL.steelLight, 0.4)),
      amb: hexNum(mixHex(PAL.steelDark, PAL.steelBlue, 0.45)),
      stars: true,
      sun: false,
      moon: true,
      navLights: true,
    }
  },
}

function phaseSpec(id) {
  const f = PHASE_SPECS[id] || PHASE_SPECS.noon
  return f()
}

/* ---- 绘制器 ------------------------------------------------------------ */

/** 一条云带（1280×200）：周期噪声 + 上下软边 + alpha 量化（像素感） */
function paintCloudBand(r, band) {
  const W = r.w
  const H = r.h
  const light = band.light
  const dark = band.dark
  const cut = band.cut
  const soft = band.soft
  const alpha = band.alpha
  const cell = band.cell
  const seed = band.seed
  for (let y = 0; y < H; y += 2) {
    const v = Math.min(1, (y + 1) / (H - 1))
    // 上下都淡出 → 合成到整幅云层时不会有横向硬边
    const vfall = Math.pow(Math.sin(Math.PI * clamp01(v)), 0.75)
    if (vfall <= 0.012) continue
    const yy = y * 1.9
    for (let x = 0; x < W; x += 2) {
      const n1 = fbmX(x, yy, W, cell, seed, 3)
      const n2 = fbmX(x, yy * 1.6 + 40, W, cell * 0.62, seed + 731, 2)
      const n = n1 * 0.82 + n2 * 0.18
      let a = clamp01((n - cut) / soft) * vfall * alpha
      if (a < 0.03) continue
      a = Math.round(a * 16) / 16
      const k = clamp01((n - cut) / Math.max(0.02, 1 - cut))
      // 2px 块落笔：像素风，且比逐像素省 4 倍噪声
      r.rect(x, y, 2, 2, mixRgb(dark, light, clamp01(0.12 + k * 0.98)), a)
    }
  }
}

/** 夜晚远处红色航灯（画在合成云层上，1280 宽 → 不会像 256 贴图那样明显重复） */
function paintNavLights(r, spec) {
  const pts = [
    [186, 236],
    [648, 198],
    [1092, 262],
    [382, 286],
  ]
  const core = hexRgb(PAL.neonRed)
  const halo = mixHex(PAL.neonRed, PAL.rustHot, 0.4)
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0]
    const y = pts[i][1]
    const rad = 10 + (i % 2) * 5
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy)
        if (d > rad) continue
        const a = Math.pow(1 - d / rad, 2.6) * 0.42
        if (a < 0.012) continue
        r.alpha(x + dx, y + dy, halo, a)
      }
    }
    r.alpha(x, y, core, 1)
    r.alpha(x + 1, y, core, 0.6)
    r.alpha(x, y + 1, core, 0.5)
    // 灯下的一缕淡雾
    for (let k = 1; k < 7; k++) r.alpha(x, y + 3 + k, halo, 0.16 * (1 - k / 7))
  }
  void spec
}

/** 星野 256×256（四向可平铺）：亮度分布 + 少量亮星十字 + 几颗暗红点 */
function plotStar(r, x, y, c, a) {
  const ix = ((x | 0) % r.w + r.w) % r.w
  const iy = ((y | 0) % r.h + r.h) % r.h
  r.alpha(ix, iy, c, a)
}

function paintStarField(r) {
  const w = r.w
  const h = r.h
  const rng = makeRng(0x5741a9)
  const white = hexRgb(PAL.white)
  const cool = mixHex(PAL.white, PAL.steelLight, 0.35)
  const warm = mixHex(PAL.white, PAL.sand, 0.35)
  const red = mixHex(PAL.neonRed, PAL.rust, 0.45)
  for (let i = 0; i < 130; i++) {
    const x = Math.floor(rng.next() * w)
    const y = Math.floor(rng.next() * h)
    const t = rng.next()
    const a = 0.16 + t * t * 0.82
    const pick = rng.next()
    const c = pick > 0.87 ? cool : pick > 0.74 ? warm : white
    plotStar(r, x, y, c, a)
    if (t > 0.952) {
      // 亮星：十字辉光 + 实心核
      plotStar(r, x + 1, y, c, a * 0.5)
      plotStar(r, x - 1, y, c, a * 0.5)
      plotStar(r, x, y + 1, c, a * 0.5)
      plotStar(r, x, y - 1, c, a * 0.5)
      plotStar(r, x, y, white, 1)
    }
  }
  // 几颗暗红点（远处航灯 / 红矮星）
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rng.next() * w)
    const y = Math.floor(rng.next() * h)
    plotStar(r, x, y, red, 0.78)
    plotStar(r, x + 1, y, red, 0.26)
  }
}

/** 沙尘太阳 128×128：暖白盘 + 三层晕 + 穿过日面的尘霾横带 */
function paintSun(r) {
  const w = r.w
  const h = r.h
  const cx = w * 0.5
  const cy = h * 0.5
  const core = mixHex(PAL.white, PAL.bone, 0.35)
  const warm = mixHex(PAL.sand, PAL.rustHot, 0.35)
  const halo = mixHex(PAL.ochre, PAL.sand, 0.5)
  const R = 20
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      let a = 0
      let c = core
      if (d <= R) {
        a = 1
        c = d < R * 0.55 ? mixRgb(halo, core, 1 - d / (R * 0.55)) : mixRgb(core, warm, (d - R * 0.55) / (R * 0.45))
        a = 1 - Math.max(0, (d - R * 0.82) / (R * 0.18)) * 0.45
        c = mixRgb(c, warm, Math.max(0, (d - R * 0.9) / (R * 0.1)) * 0.3)
      } else if (d < R + 26) {
        const t = (d - R) / 30
        a = Math.pow(1 - t, 1.8) * 0.7
        c = mixRgb(warm, halo, t)
      } else if (d < R + 72) {
        const t = (d - R - 30) / 42
        a = Math.pow(1 - t, 3.0) * 0.16
        c = halo
      }
      if (a > 0.01) {
        // 尘霾横带（薄云穿过日面）
        if (Math.abs(y - (cy + 3)) < 3 && d < R + 10) a *= 0.6
        // 有序抖动，压掉 8bit 环带
        a *= 0.94 + 0.12 * dither01(x, y)
        r.alpha(x, y, c, a)
      }
    }
  }
}

/** 冷月 128×128：陨石坑 + 相位暗部 + 冷晕 */
function paintMoon(r) {
  const w = r.w
  const h = r.h
  const cx = w * 0.5
  const cy = h * 0.5
  const R = 19
  const face = mixHex(PAL.bone, PAL.steelLight, 0.45)
  const shade = mixHex(PAL.boneDark, PAL.steelBlue, 0.45)
  const pit = mixHex(PAL.steelDark, PAL.boneDeep, 0.42)
  const halo = mixHex(PAL.steelLight, PAL.boneDark, 0.5)
  const craters = [
    [-6.5, -5, 4.2],
    [5, 3, 4.8],
    [2, -9.5, 2.4],
    [-8, 7, 3],
    [9, -6, 2.2],
    [0, 9, 2.6],
    [-3, 1.5, 1.8],
    [7, 9, 1.6],
  ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      if (d <= R) {
        // 左侧受光、右侧进入暗部
        let c = mixRgb(shade, face, clamp01(0.55 - (dx / R) * 0.55))
        for (let i = 0; i < craters.length; i++) {
          const cr = craters[i]
          const cd = Math.hypot(dx - cr[0], dy - cr[1])
          if (cd < cr[2]) c = mixRgb(c, pit, 0.34 + 0.3 * (1 - cd / cr[2]))
        }
        if (d > R - 1.6) c = mixRgb(c, pit, 0.5)
        r.alpha(x, y, c, 1)
      } else if (d < R + 30) {
        const t = (d - R) / 30
        const a = Math.pow(1 - t, 2.8) * 0.26 * (0.94 + 0.12 * dither01(x, y))
        if (a > 0.008) r.alpha(x, y, halo, a)
      }
    }
  }
  // 受光边缘的高光点
  r.alpha(Math.round(cx - R * 0.72), Math.round(cy - R * 0.5), hexRgb(PAL.white), 0.7)
  r.alpha(Math.round(cx - R * 0.6), Math.round(cy - R * 0.62), hexRgb(PAL.white), 0.45)
}

/** 尘光柱 128×256：白（可染色），顶部最亮向下渐隐 + 竖向尘纹 */
function paintLightShaft(r) {
  const w = r.w
  const h = r.h
  const white = hexRgb(PAL.white)
  const warm = mixHex(PAL.white, PAL.sand, 0.42)
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1)
    const fade = Math.pow(1 - v, 1.55) * (1 - Math.pow(v, 8))
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      const halfW = 0.15 + 0.35 * v
      const dx = (u - 0.5) / halfW
      const prof = Math.exp(-dx * dx * 2.2)
      const n = fbmRaw(x * 2.6, y * 0.5, 18, 0x6a17, 2)
      let a = fade * prof * (0.5 + 0.8 * n)
      a = clamp01(a)
      if (a < 0.006) continue
      r.alpha(x, y, mixRgb(warm, white, clamp01(a * 1.6)), a)
    }
  }
}

/* ---- 组装 / 缓存 / 对外 API -------------------------------------------- */

const SKY_CACHE = new Map()
const SKY_FX_CACHE = new Map()

function buildSkyArt(id) {
  const spec = phaseSpec(id)
  const sky = makeTex(SKY_SIZE, SKY_SIZE, (r) => paintSky(r, spec.sky), 'clamp', 'clamp', id + ':sky')

  // 1) 3 条独立云带（各自一张贴图 → 引擎可用不同速度滚动）
  const bandCells = []
  for (let i = 0; i < spec.cloud.bands.length; i++) {
    const cell = newCell(BG_W, CLOUD_BAND_H)
    if (cell.r) paintCloudBand(cell.r, spec.cloud.bands[i])
    bandCells.push(cell)
  }
  const cloudLayers = bandCells.map((c, i) => cellTexture(c, 'repeat', 'clamp', id + ':cloud' + i))

  // 2) 合成"一整幅云层"（只想画一层时用这个）
  const combined = newCell(BG_W, BG_H)
  if (combined.r) {
    for (let i = 0; i < bandCells.length; i++) {
      if (bandCells[i].r) blitRasterAlpha(combined.r, bandCells[i].r, CLOUD_BAND_Y[i])
    }
    if (spec.navLights) paintNavLights(combined.r, spec)
  }
  const cloud = cellTexture(combined, 'repeat', 'clamp', id + ':cloud')

  const cloudMeta = spec.cloud.bands.map((b, i) => ({
    index: i,
    y: CLOUD_BAND_Y[i],
    h: CLOUD_BAND_H,
    speed: b.speed,
    alpha: b.alpha,
    texture: cloudLayers[i],
  }))
  cloud.userData.layers = cloudLayers.length

  return {
    id: id,
    phase: id,
    sky: sky,
    cloud: cloud,
    cloudLayers: cloudLayers,
    cloudMeta: cloudMeta,
    tint: spec.tint,
    amb: spec.amb,
    stars: spec.stars ? getStarField() : null,
    sun: spec.sun ? getSunArt() : null,
    moon: spec.moon ? getMoonArt() : null,
    horizon: spec.sky.horizon,
  }
}

/** 取某个时段的天空（首次构建，之后走缓存；未知 id 回退 noon） */
export function getSkyArt(phaseId) {
  const id = SKY_PHASE_IDS.indexOf(phaseId) >= 0 ? phaseId : 'noon'
  let art = SKY_CACHE.get(id)
  if (!art) {
    art = buildSkyArt(id)
    SKY_CACHE.set(id, art)
  }
  return art
}

function fxTex(name, w, h, draw, wrapS, wrapT, label) {
  let t = SKY_FX_CACHE.get(name)
  if (!t) {
    t = makeTex(w, h, draw, wrapS, wrapT, label)
    SKY_FX_CACHE.set(name, t)
  }
  return t
}

/** 沙尘太阳 128×128（暖白，可直接用 material.color 再染） */
export function getSunArt() {
  return fxTex('sun', 128, 128, paintSun, 'clamp', 'clamp', 'sky:sun')
}

/** 冷月 128×128 */
export function getMoonArt() {
  return fxTex('moon', 128, 128, paintMoon, 'clamp', 'clamp', 'sky:moon')
}

/** 星野 256×256（四向可平铺） */
export function getStarField() {
  return fxTex('stars', 256, 256, paintStarField, 'repeat', 'repeat', 'sky:stars')
}

/** 尘光柱 128×256（白，顶部亮向下渐隐） */
export function getLightShaftArt() {
  return fxTex('shaft', 128, 256, paintLightShaft, 'clamp', 'clamp', 'sky:shaft')
}

/** 预热若干时段（标题界面 / 章节加载时用） */
export function preloadSkyArt(phases) {
  const list = Array.isArray(phases) && phases.length ? phases : SKY_PHASE_IDS
  for (let i = 0; i < list.length; i++) getSkyArt(list[i])
  getStarField()
  getSunArt()
  getMoonArt()
  getLightShaftArt()
  return SKY_CACHE.size
}

/** 释放天空贴图（不传 id = 全部；每张都 dispose，避免显存泄漏） */
export function disposeSkyArt(phaseId) {
  if (phaseId) {
    const art = SKY_CACHE.get(phaseId)
    if (art) {
      const kill = (t) => {
        if (t && typeof t.dispose === 'function') t.dispose()
      }
      kill(art.sky)
      kill(art.cloud)
      if (art.cloudLayers) for (let i = 0; i < art.cloudLayers.length; i++) kill(art.cloudLayers[i])
      SKY_CACHE.delete(phaseId)
    }
    return
  }
  for (const id of [...SKY_CACHE.keys()]) disposeSkyArt(id)
  for (const [name, tex] of SKY_FX_CACHE) {
    if (tex && typeof tex.dispose === 'function') tex.dispose()
    SKY_FX_CACHE.delete(name)
  }
}

/** 已生成的时段（调试面板用） */
export function cachedSkyIds() {
  return [...SKY_CACHE.keys()]
}

/* ============================================================================
 * 14. 扩展 biome：metro（废弃地铁）/ hospital（坍塌医院）/ port（淤塞港口）
 *
 *   契约与第一轮完全一致：
 *     getBiomeArt('metro' | 'hospital' | 'port') -> {
 *       sky, far, mid, near, ground, groundTop, fogColor, ambient
 *     }
 *   规则沿用：sky 256×256 拉伸（Clamp），far/mid/near 1280×560（S=Repeat / T=Clamp，
 *   上方 20 行 alpha=0），ground 32×32 四向平铺，groundTop 32×32（T=Clamp）；
 *   全部 NearestFilter / SRGB / 无 mipmap / 懒构建 + 按 id 缓存 / preload + dispose 兼容。
 * ========================================================================== */

/* ---- 14.1 风格表 -------------------------------------------------------- */

function styleMetro() {
  // 地下隧道：近乎全黑的拱顶 + 钠灯暖光 + 冷绿水泥
  const top = mixHex(PAL.void, PAL.steelBlue, 0.22)
  const up = mixHex(PAL.ash, PAL.steelDark, 0.42)
  const midSky = mixHex(PAL.steelDark, PAL.mossDead, 0.3)
  const horMid = mixHex(PAL.steelBlue, PAL.mossDead, 0.42)
  const horHi = mixHex(PAL.steelLight, PAL.mossDead, 0.45)
  const low = mixHex(PAL.void, PAL.steelDark, 0.55)
  const lowDark = darker(low, 0.45)

  const fBase = mixHex(PAL.steelDark, PAL.mossDead, 0.5)
  const mBase = mixHex(mixHex(PAL.steelBlue, PAL.mossDead, 0.34), PAL.steelDark, 0.3)
  const nBase = mixHex(PAL.void, PAL.steelDark, 0.42)

  return {
    id: 'metro',
    sky: {
      stops: [
        [0, top],
        [0.26, up],
        [0.5, midSky],
        [0.7, horMid],
        [0.86, horHi],
        [0.95, mixHex(horMid, low, 0.6)],
        [1, lowDark],
      ],
      horizon: 0.9,
      glow: 0.2,
      glowCol: mixHex(PAL.neonWarm, PAL.mossDead, 0.45),
      cloudA: 0.1,
      cloudLight: mixHex(PAL.steelLight, PAL.mossDead, 0.5),
      cloudDark: mixHex(PAL.void, PAL.steelDark, 0.6),
      seed: 0x71a1,
    },
    far: {
      base: fBase,
      dark: darker(fBase, 0.5),
      edge: mixRgb(fBase, hexRgb(PAL.mossDead), 0.3),
      rim: lighter(fBase, 0.16),
      win: darker(fBase, 0.35),
      lit: mixHex(PAL.neonWarm, PAL.rustHot, 0.4),
      smoke: mixHex(PAL.steelLight, PAL.mossDead, 0.5),
      haze: mixHex(PAL.steelLight, PAL.mossDead, 0.45),
      ground: mixHex(PAL.steelDark, PAL.mossDead, 0.35),
    },
    mid: {
      base: mBase,
      dark: darker(mBase, 0.45),
      edge: mixRgb(mBase, hexRgb(PAL.steelLight), 0.3),
      rim: lighter(mBase, 0.2),
      win: darker(mBase, 0.4),
      lit: mixHex(PAL.neonWarm, PAL.mossDead, 0.25),
      rust: mixHex(PAL.rust, PAL.rustDark, 0.35),
      smoke: mixHex(PAL.steelLight, PAL.mossDead, 0.5),
      haze: mixHex(PAL.steelLight, PAL.mossDead, 0.4),
      ground: mixHex(PAL.void, PAL.steelDark, 0.45),
    },
    near: {
      base: nBase,
      dark: darker(nBase, 0.5),
      rim: mixRgb(nBase, hexRgb(PAL.toxicGlow), 0.16),
      smoke: mixRgb(nBase, hexRgb(PAL.steelLight), 0.3),
    },
    ground: {
      // 破碎白瓷砖 + 水泥
      base: mixHex(PAL.boneDark, PAL.steel, 0.55),
      dark: mixHex(PAL.steelDark, PAL.void, 0.4),
      light: mixHex(PAL.bone, PAL.steelLight, 0.5),
      rust: mixHex(PAL.rust, PAL.rustLight, 0.25),
    },
    groundTop: {
      crust: mixHex(PAL.boneDark, PAL.steel, 0.4),
      crustHi: mixHex(PAL.bone, PAL.sandDark, 0.35),
      crustLo: mixHex(PAL.steel, PAL.rustDark, 0.4),
      weed: hexRgb(PAL.toxicDark),
      weedHi: hexRgb(PAL.mossDead),
    },
    fog: hexNum(mixHex(PAL.steelBlue, PAL.toxicDark, 0.42)), // 暗绿
    ambient: hexNum(mixHex(PAL.toxic, PAL.steelLight, 0.42)), // 冷绿偏钠黄
  }
}

function styleHospital() {
  // 坍塌医院：灰白阴天 + 病态浅绿 + 米白
  const top = mixHex(PAL.skyDay, PAL.ashPale, 0.35)
  const up = mixHex(PAL.skyDay, PAL.bone, 0.3)
  const midSky = mixHex(PAL.skyDay, PAL.boneDark, 0.28)
  const horMid = mixHex(PAL.boneDark, PAL.skyDay, 0.35)
  const horHi = mixHex(PAL.bone, PAL.skyDay, 0.35)
  const low = mixHex(PAL.mossDead, PAL.dust, 0.45)
  const lowDark = darker(low, 0.4)

  const fBase = mixHex(PAL.boneDark, PAL.mossDead, 0.4)
  const mBase = mixHex(PAL.boneDeep, PAL.mossDead, 0.32)
  const nBase = mixHex(PAL.mossDead, PAL.black, 0.62)

  return {
    id: 'hospital',
    sky: {
      stops: [
        [0, top],
        [0.3, up],
        [0.56, midSky],
        [0.74, horMid],
        [0.88, horHi],
        [0.95, mixHex(horMid, low, 0.5)],
        [1, lowDark],
      ],
      horizon: 0.88,
      glow: 0.34,
      glowCol: mixHex(PAL.white, PAL.bone, 0.4),
      cloudA: 0.22,
      cloudLight: mixHex(PAL.white, PAL.bone, 0.45),
      cloudDark: mixHex(PAL.skyDay, PAL.mossDead, 0.5),
      seed: 0x72b1,
    },
    far: {
      base: fBase,
      dark: darker(fBase, 0.45),
      edge: mixRgb(fBase, hexRgb(PAL.mossDead), 0.35),
      rim: lighter(fBase, 0.2),
      win: darker(fBase, 0.5),
      lit: mixHex(PAL.neonWarm, PAL.mossDead, 0.3),
      smoke: mixHex(PAL.boneDark, PAL.skyDay, 0.4),
      haze: mixHex(PAL.skyDay, PAL.bone, 0.4),
      ground: mixHex(PAL.boneDeep, PAL.mossDead, 0.4),
    },
    mid: {
      base: mBase,
      dark: darker(mBase, 0.42),
      edge: mixRgb(mBase, hexRgb(PAL.bone), 0.32),
      rim: lighter(mBase, 0.22),
      win: darker(mBase, 0.5),
      lit: mixHex(PAL.neonWarm, PAL.bone, 0.25),
      rust: mixHex(PAL.blood, PAL.rustDark, 0.5),
      smoke: mixHex(PAL.skyDay, PAL.bone, 0.35),
      haze: mixHex(PAL.skyDay, PAL.bone, 0.45),
      ground: mixHex(PAL.boneDeep, PAL.mossDead, 0.5),
    },
    near: {
      base: nBase,
      dark: darker(nBase, 0.45),
      rim: mixRgb(nBase, hexRgb(PAL.boneDark), 0.3),
      smoke: mixRgb(nBase, hexRgb(PAL.skyDay), 0.25),
    },
    ground: {
      // 浅绿瓷砖
      base: mixHex(PAL.mossDead, PAL.boneDark, 0.55),
      dark: mixHex(PAL.mossDead, PAL.black, 0.35),
      light: mixHex(PAL.bone, PAL.mossDead, 0.35),
      rust: mixHex(PAL.blood, PAL.rustDark, 0.35),
    },
    groundTop: {
      crust: mixHex(PAL.boneDark, PAL.mossDead, 0.35),
      crustHi: mixHex(PAL.bone, PAL.white, 0.25),
      crustLo: mixHex(PAL.mossDead, PAL.boneDeep, 0.4),
      weed: hexRgb(PAL.mossDead),
      weedHi: hexRgb(PAL.weed),
    },
    fog: hexNum(mixHex(PAL.skyDay, PAL.mossDead, 0.45)), // 灰绿
    ambient: hexNum(mixHex(PAL.bone, PAL.mossDead, 0.32)), // 米白偏病绿
  }
}

function stylePort() {
  // 淤塞港口：海雾灰蓝 + 铁锈
  const top = mixHex(PAL.steelBlue, PAL.skyDay, 0.35)
  const up = mixHex(PAL.steelBlue, PAL.steelLight, 0.3)
  const midSky = mixHex(PAL.steelLight, PAL.skyDay, 0.42)
  const horMid = mixHex(PAL.skyDay, PAL.boneDark, 0.3)
  const horHi = mixHex(PAL.boneDark, PAL.white, 0.3)
  const low = mixHex(PAL.steelBlue, PAL.steelDark, 0.45)
  const lowDark = darker(low, 0.4)

  const fBase = mixHex(PAL.steelBlue, PAL.steelLight, 0.4)
  const mBase = mixHex(PAL.steelDark, PAL.rustDark, 0.35)
  const nBase = mixHex(PAL.steelDark, PAL.black, 0.42)

  return {
    id: 'port',
    sky: {
      stops: [
        [0, top],
        [0.3, up],
        [0.56, midSky],
        [0.74, horMid],
        [0.87, horHi],
        [0.95, mixHex(horMid, low, 0.45)],
        [1, lowDark],
      ],
      horizon: 0.84,
      glow: 0.36,
      glowCol: mixHex(PAL.white, PAL.skyDay, 0.35),
      cloudA: 0.3,
      cloudLight: mixHex(PAL.white, PAL.skyDay, 0.4),
      cloudDark: mixHex(PAL.steelBlue, PAL.steelLight, 0.4),
      seed: 0x73c1,
    },
    far: {
      base: fBase,
      dark: darker(fBase, 0.45),
      edge: mixRgb(fBase, hexRgb(PAL.steelDark), 0.35),
      rim: lighter(fBase, 0.18),
      win: darker(fBase, 0.45),
      lit: hexRgb(PAL.neonWarm),
      smoke: mixHex(PAL.steelLight, PAL.skyDay, 0.45),
      haze: mixHex(PAL.skyDay, PAL.white, 0.3),
      ground: mixHex(PAL.steelBlue, PAL.steelLight, 0.3),
    },
    mid: {
      base: mBase,
      dark: darker(mBase, 0.45),
      edge: mixRgb(mBase, hexRgb(PAL.steelLight), 0.28),
      rim: lighter(mBase, 0.2),
      win: darker(mBase, 0.45),
      lit: hexRgb(PAL.neonWarm),
      rust: mixHex(PAL.rust, PAL.rustLight, 0.28),
      smoke: mixHex(PAL.steelLight, PAL.skyDay, 0.4),
      haze: mixHex(PAL.skyDay, PAL.white, 0.35),
      ground: mixHex(PAL.steelDark, PAL.steelBlue, 0.4),
    },
    near: {
      base: nBase,
      dark: darker(nBase, 0.5),
      rim: mixRgb(nBase, hexRgb(PAL.steelLight), 0.26),
      smoke: mixRgb(nBase, hexRgb(PAL.skyDay), 0.3),
    },
    ground: {
      // 湿木板 + 混凝土
      base: mixHex(PAL.rustDark, PAL.steelDark, 0.55),
      dark: mixHex(PAL.steelDark, PAL.void, 0.35),
      light: mixHex(PAL.dustLight, PAL.steelLight, 0.4),
      rust: mixHex(PAL.rust, PAL.rustLight, 0.3),
    },
    groundTop: {
      crust: mixHex(PAL.dustLight, PAL.steelLight, 0.45),
      crustHi: mixHex(PAL.sandDark, PAL.boneDark, 0.4),
      crustLo: mixHex(PAL.steelDark, PAL.rustDark, 0.45),
      weed: hexRgb(PAL.mossDead),
      weedHi: hexRgb(PAL.boneDark),
    },
    fog: hexNum(mixHex(PAL.steelBlue, PAL.steelLight, 0.5)), // 蓝灰
    ambient: hexNum(mixHex(PAL.steelLight, PAL.rustLight, 0.3)), // 冷灰蓝 + 铁锈
  }
}

/* ---- 14.2 天空（三种专属画法，其余 biome 仍用通用 paintSky）------------- */

/** 地铁：近黑拱顶 + 穹顶肋骨 + 三排钠灯暖光 */
function paintMetroSky(r, sk) {
  paintSky(r, sk)
  const w = r.w
  const h = r.h
  const cx = w * 0.5
  const archTop = h * 0.64
  const rx = w * 0.8
  const ry = h * 0.48
  const dark = hexRgb(PAL.void)
  const edge = mixHex(PAL.steelLight, PAL.mossDead, 0.45)
  const sodium = hexRgb(PAL.neonWarm)

  // 先把每列的拱顶高度算出来（后面压暗 / 肋骨 / 灯带裁剪都用它）
  const archY = new Int16Array(w)
  for (let x = 0; x < w; x++) {
    const dx = (x - cx) / rx
    const k = Math.max(0, 1 - dx * dx)
    archY[x] = Math.round(archTop - ry * Math.sqrt(k))
  }

  // 1) 拱顶上方压暗（穹顶本体）
  for (let x = 0; x < w; x++) {
    const yTop = Math.max(0, archY[x])
    for (let y = 0; y < yTop; y++) {
      const n = fbmRaw(x * 0.9, y * 1.6, 26, 0x71d1, 2)
      r.alpha(x, y, dark, 0.55 + n * 0.28)
    }
    // 拱线本体（受一点冷光）
    r.alpha(x, yTop, edge, 0.45)
    r.alpha(x, yTop + 1, edge, 0.2)
  }

  // 2) 穹顶竖向肋骨（周期 22，拉伸后是细竖线）
  for (let x = 0; x < w; x += 22) {
    const y0 = Math.max(0, archY[x])
    for (let y = y0; y < Math.min(h, y0 + 46); y++) {
      const t = (y - y0) / 46
      r.alpha(x, y, edge, 0.16 * (1 - t))
    }
  }

  // 3) 三排钠灯：横向暖光带，只落在拱线以下（真正的隧道内）
  const bands = [
    [0.34, 0.1, 0.2],
    [0.5, 0.085, 0.16],
    [0.64, 0.07, 0.12],
  ]
  for (let b = 0; b < bands.length; b++) {
    const yc = bands[b][0] * h
    const hh = Math.max(2, bands[b][1] * h)
    const amp = bands[b][2]
    for (let y = Math.max(0, Math.floor(yc - hh)); y < Math.min(h, Math.ceil(yc + hh)); y++) {
      const t = 1 - Math.abs(y - yc) / hh
      for (let x = 0; x < w; x++) {
        if (y < archY[x]) continue
        const n = fbmRaw(x * 0.7, y * 3.4, 22, 0x71e1 + b, 2)
        const a = Math.pow(Math.max(0, t), 2.2) * amp * (0.45 + n)
        if (a > 0.012) r.alpha(x, y, sodium, a)
      }
    }
  }
}

/** 医院：灰白天 + 破顶漏下的天光（不规则亮洞 + 塌梁） */
function paintHospitalSky(r, sk) {
  paintSky(r, sk)
  const w = r.w
  const h = r.h
  const light = mixHex(PAL.white, PAL.bone, 0.25)
  const beam = mixHex(PAL.steel, PAL.boneDeep, 0.4)
  const holes = [
    [0.34, 0.2, 0.17],
    [0.5, 0.13, 0.12],
    [0.63, 0.26, 0.1],
    [0.2, 0.34, 0.07],
  ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hole = 0
      for (let i = 0; i < holes.length; i++) {
        const c = holes[i]
        const dx = (x - c[0] * w) / (c[2] * w)
        const dy = (y - c[1] * h) / (c[2] * h * 1.5)
        const d = Math.hypot(dx, dy)
        if (d < 1) hole = Math.max(hole, 1 - d)
      }
      if (hole <= 0.01) continue
      // 边缘碎裂：用噪声啃掉一圈
      const n = fbmRaw(x * 1.7, y * 1.7, 13, 0x72d1, 3)
      const a = clamp01(Math.pow(hole, 0.65) * (0.35 + n * 1.35) - 0.1) * 0.9
      if (a > 0.012) r.alpha(x, y, light, a)
    }
  }
  // 塌落的梁：两道斜向暗条压过亮洞
  for (let i = 0; i < 2; i++) {
    const y0 = h * (0.1 + i * 0.12)
    const y1 = h * (0.42 + i * 0.1)
    const x0 = w * (0.1 + i * 0.42)
    r.line(x0, y0, x0 + w * 0.5, y1, beam, 0.55, 3)
    r.line(x0 + 2, y0, x0 + w * 0.5 + 2, y1, darker(beam, 0.4), 0.35, 2)
  }
  // 漏光柱：从亮洞往下的一点点竖向提亮
  for (let i = 0; i < 3; i++) {
    const cx = w * (0.28 + i * 0.17)
    for (let y = Math.round(h * 0.3); y < h; y++) {
      const t = (y - h * 0.3) / (h * 0.7)
      const a = (1 - t) * 0.08
      if (a < 0.01) continue
      for (let dx = -10; dx <= 10; dx++) {
        const k = 1 - Math.abs(dx) / 11
        r.alpha(Math.round(cx + dx), y, light, a * k)
      }
    }
  }
}

/** 港口：海雾 + 海天线 + 远处极淡的雾带 */
function paintPortSky(r, sk) {
  paintSky(r, sk)
  const w = r.w
  const h = r.h
  const seaTop = h * 0.79
  const water = mixHex(PAL.steelBlue, PAL.steelLight, 0.35)
  const waterDark = mixHex(PAL.steelDark, PAL.steelBlue, 0.5)
  const line = mixHex(PAL.white, PAL.skyDay, 0.35)
  // 海面
  for (let y = Math.round(seaTop); y < h; y++) {
    const t = (y - seaTop) / (h - seaTop)
    const c = mixRgb(water, waterDark, t)
    for (let x = 0; x < w; x++) {
      const n = fbmRaw(x * 1.4, y * 0.9, 20, 0x73d1, 2)
      r.alpha(x, y, c, 0.85)
      if (n > 0.62) r.alpha(x, y, line, 0.1 * (1 - t))
    }
  }
  // 海天线（一条很亮的横带，拉伸后正好是水平线）
  for (let x = 0; x < w; x++) {
    r.alpha(x, Math.round(seaTop), line, 0.3)
    r.alpha(x, Math.round(seaTop) - 1, line, 0.16)
  }
  // 横向雾带（2~3 条，制造水汽层）
  for (let b = 0; b < 3; b++) {
    const yc = h * (0.68 + b * 0.055)
    const hh = h * 0.035
    for (let y = Math.round(yc - hh); y < Math.round(yc + hh); y++) {
      const t = 1 - Math.abs(y - yc) / hh
      const a = Math.pow(Math.max(0, t), 2) * 0.16
      if (a < 0.01) continue
      for (let x = 0; x < w; x++) {
        const n = fbmRaw(x * 0.8, y * 2.6, 24, 0x73e1 + b, 2)
        if (n > 0.4) r.alpha(x, y, line, a * (0.5 + n))
      }
    }
  }
}

/** biome id -> 天空画法（没登记的都走通用 paintSky） */
const SKY_PAINTERS = {
  metro: paintMetroSky,
  hospital: paintHospitalSky,
  port: paintPortSky,
}

/* ---- 14.3 metro：隧道深处 / 站台 / 轨道 --------------------------------- */

function paintMetroFar(r, S) {
  const F = S.far
  const W = BG_W
  const cx = 640
  const vy = 320 // 消失点
  const baseY = 508 // 轨道面
  const rng = makeRng(0x7a31)

  // 1) 隧道口：由远到近的拱环（越近越暗、越粗）
  const rings = 7
  for (let i = rings - 1; i >= 0; i--) {
    const t = i / (rings - 1)
    const hw = 96 + t * t * 640
    const hh = 56 + t * t * 210
    const col = mixRgb(F.rim, F.base, 0.35 + t * 0.4)
    const thick = t > 0.72 ? 3 : t > 0.4 ? 2 : 1
    for (let x = -hw; x <= hw; x++) {
      const k = Math.max(0, 1 - (x / hw) * (x / hw))
      const yTop = Math.round(vy - hh * Math.sqrt(k))
      // 拱顶
      for (let d = 0; d < thick; d++) r.alpha(cx + x, yTop + d, col, 0.85)
      // 拱脚到地面的竖墙（只在靠近镜头的那两圈画，避免糊）
      if (i >= rings - 3 && Math.abs(x) > hw * 0.86) {
        r.vfill(cx + x, yTop, baseY, col, 0.5)
      }
    }
  }

  // 2) 轨道：从消失点向镜头张开（4 条）
  const rails = [
    [-1, 8],
    [-1, 30],
    [1, 8],
    [1, 30],
  ]
  for (let i = 0; i < rails.length; i++) {
    const dir = rails[i][0]
    const off = rails[i][1]
    const x0 = cx + dir * off
    const x1 = cx + dir * (off * 26)
    r.line(x0, vy + 14, x1, baseY, F.rim, 0.75, 2)
    r.line(x0, vy + 15, x1, baseY + 1, F.dark, 0.6, 1)
  }
  // 3) 轨道床
  for (let x = -W; x < W * 2; x++) {
    const dx = Math.abs(x - cx)
    const y = Math.round(vy + 14 + (baseY - vy - 14) * Math.min(1, dx / 900))
    r.vfill(x, y, baseY + 20, mixRgb(F.ground, F.dark, 0.35), 0.9)
  }

  // 4) 顶上的电缆（沿隧道向消失点收拢）
  for (let i = 0; i < 4; i++) {
    const y = 150 + i * 26
    const sag = 16 + i * 5
    cable(r, -40, W + 40, y, sag, F.dark, { thick: 2, dangle: 3 })
    cable(r, cx - 260 + i * 130, cx + 260 - i * 130, y - 6, sag * 0.5, F.dark, { thick: 1 })
  }

  // 5) 钠灯：隧道壁上的小暖灯 + 消失点处的一团亮
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const t = (i / 8) * 0.85 + 0.08
    const hw = 96 + t * t * 640
    const hh = 56 + t * t * 210
    const lx = Math.round(cx + side * hw * 0.78)
    const ly = Math.round(vy - hh * 0.42)
    const rad = 3 + (1 - t) * 3
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy) / rad
        if (d > 1) continue
        r.alpha(lx + dx, ly + dy, F.lit, Math.pow(1 - d, 2) * 0.5)
      }
    }
    r.rect(lx - 1, ly - 1, 2, 2, mixRgb(F.lit, F.rim, 0.4))
  }
  // 消失点：站台灯
  for (let dy = -22; dy <= 22; dy++) {
    for (let dx = -34; dx <= 34; dx++) {
      const d = Math.hypot(dx / 34, dy / 22)
      if (d > 1) continue
      r.alpha(cx + dx, vy + dy, F.lit, Math.pow(1 - d, 2.4) * 0.42)
    }
  }

  // 6) 大气 + 斑驳（隧道里没有"地面带"，只做压暗与噪声）
  verticalShade(r, 60, baseY, F.dark, 0.3)
  aerialHaze(r, F.haze, 140, baseY + 24, 0.34, 1.5)
  mottle(r, F.dark, F.rim, 0x71f1, 0.3, 3)
  void rng
}

function paintMetroMid(r, S) {
  const M = S.mid
  const W = BG_W
  const baseY = 520
  const wallTop = 300

  // 1) 瓷砖墙带（2px 勾缝，周期 16 → 平铺安全）
  for (let y = wallTop; y < baseY; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbmX(x, y, W, 64, 0x72a1, 2)
      const cell = hash2((x / 16) | 0, (y / 16) | 0, 0x72a9)
      let c = mixRgb(M.base, M.dark, 0.06 + cell * 0.22 + (n > 0.55 ? 0.16 : 0))
      if (y % 16 === 0 || x % 16 === 0) c = mixRgb(c, M.dark, 0.72)
      if (y % 16 === 1 || x % 16 === 1) c = mixRgb(c, M.rim, 0.12)
      r.opaque(x, y, c)
    }
  }
  // 污渍 / 水渍
  streaks(r, 0, W, wallTop, baseY, M.dark, 0x72a2, 0.34, 0.4)
  mottle(r, M.dark, M.edge, 0x72a3, 0.22, 4)

  // 褪色海报（周期 320）
  for (let i = 0; i < 3; i++) {
    const px = 240 + i * 320
    const py = 356
    r.rect(px - 2, py - 2, 74, 56, M.dark)
    r.rect(px, py, 70, 52, mixRgb(M.rust, PAL.sand, 0.4 + i * 0.06), 0.6)
    for (let k = 0; k < 4; k++) r.hf(px + 6, px + 64, py + 10 + k * 11, M.dark, 0.35)
    r.hf(px, px + 69, py + 51, M.dark, 0.6)
  }
  // 站名灯牌（2 块，挂在高处）
  for (let i = 0; i < 2; i++) {
    const px = 520 + i * 640
    const py = 262
    r.rect(px - 5, py - 5, 194, 36, M.dark)
    r.rect(px, py, 184, 26, mixRgb(M.win, M.lit, 0.28))
    for (let k = 0; k < 5; k++) r.rect(px + 12 + k * 32, py + 8, 22, 10, mixRgb(PAL.bone, M.lit, 0.45), 0.85)
    for (let y = 0; y < 26; y++) for (let x = 0; x < 184; x++) r.alpha(px + x, py + y, M.lit, 0.07)
  }

  // 2) 站台柱（周期 320 → 4 根，平铺对齐）
  const pillars = [180, 500, 820, 1140]
  for (let i = 0; i < pillars.length; i++) {
    const px = pillars[i]
    const pw = 38
    const top = 152
    r.rect(px, top, pw, baseY - top, M.base)
    // 瓷砖横缝
    for (let y = top + 6; y < baseY; y += 16) r.hf(px, px + pw - 1, y, M.dark, 0.35)
    r.vfill(px, top, baseY, M.dark, 0.8)
    r.vfill(px + 2, top, baseY, M.edge, 0.3)
    r.vfill(px + pw - 4, top, baseY, M.rim, 0.18)
    r.vfill(px + 1, top, baseY, M.edge, 0.25)
    r.vfill(px + pw - 1, top, baseY, M.dark, 0.7)
    r.hf(px - 4, px + pw + 3, top - 7, M.dark, 0.9)
    r.hf(px - 4, px + pw + 3, top - 6, M.rim, 0.45)
    r.hf(px - 2, px + pw + 1, top, M.rim, 0.5)
    r.hf(px - 2, px + pw + 1, baseY - 4, M.dark, 0.6)
    // 柱顶的一盏灯
    r.rect(px + pw * 0.5 - 6, top - 10, 12, 8, M.dark)
    r.rect(px + pw * 0.5 - 4, top - 8, 8, 2, M.lit, 0.85)
    const gy = top - 6
    for (let dy = 0; dy < 60; dy++) {
      const hw = 8 + dy * 0.55
      const a = (1 - dy / 60) * 0.11
      for (let dx = -hw; dx <= hw; dx++) {
        if (hash2(Math.round(px + dx), gy + dy, 0x72a4) < 0.45) continue
        r.alpha(px + Math.round(pw * 0.5) + dx, gy + dy, M.lit, a)
      }
    }
  }

  // 3) 线路图灯箱（背光面板 + 几条线）
  for (let i = 0; i < 2; i++) {
    const bx = 320 + i * 640
    const by = 316
    const bw = 132
    const bh = 78
    r.rect(bx - 3, by - 3, bw + 6, bh + 6, M.dark)
    r.rect(bx, by, bw, bh, mixRgb(M.win, M.lit, 0.34))
    // 背光
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        r.alpha(bx + x, by + y, M.lit, 0.1 + 0.06 * Math.sin((x / bw) * Math.PI))
      }
    }
    // 线路
    const lines = [M.lit, mixRgb(PAL.toxic, PAL.steelLight, 0.3), mixRgb(PAL.rustLight, PAL.sand, 0.4)]
    for (let l = 0; l < 3; l++) {
      const ly = by + 16 + l * 20
      for (let x = 4; x < bw - 4; x++) r.alpha(bx + x, ly + Math.round(Math.sin(x * 0.09 + l) * 3), lines[l], 0.85)
      for (let s = 0; s < 4; s++) r.rect(bx + 12 + s * 28, ly - 2, 3, 3, lines[l])
    }
    r.hf(bx, bx + bw - 1, by + bh - 1, M.dark, 0.6)
  }

  // 4) 站台黄色安全线 + 台沿
  for (let x = 0; x < W; x++) {
    const on = x % 32 < 20
    if (on) r.alpha(x, 502, mixRgb(PAL.warn, PAL.sand, 0.35), 0.75)
    r.alpha(x, 504, M.dark, 0.45)
    r.alpha(x, 505, M.dark, 0.6)
  }

  // 5) 长椅 + 垃圾桶
  for (let i = 0; i < 2; i++) {
    const bx = 640 + i * 320 - 60
    const by = 466
    r.rect(bx, by, 64, 8, mixRgb(M.base, M.rim, 0.2))
    r.rect(bx + 4, by + 8, 5, 26, M.dark)
    r.rect(bx + 55, by + 8, 5, 26, M.dark)
    r.hf(bx, bx + 63, by, M.rim, 0.5)
    barrel(r, bx + 78, 502, 22, M.dark, { w: 15 })
  }

  // 6) 地面（站台面）+ 底部压暗
  r.rect(0, baseY - 2, W, BG_H - baseY + 2, mixRgb(M.ground, M.base, 0.25))
  for (let i = 0; i < 4; i++) {
    const px = 199 + i * 320
    for (let dy = 0; dy < 30; dy++) {
      const hw = 62 - dy * 1.7
      if (hw <= 0) break
      for (let dx = -hw; dx <= hw; dx++) {
        if (hash2(Math.round(px + dx), dy, 0x72ab) < 0.45) continue
        r.alpha(Math.round(px + dx), 500 + dy, M.lit, 0.12 * (1 - dy / 30))
      }
    }
  }
  mottle(r, M.dark, M.rim, 0x72a5, 0.26, 3)
  aerialHaze(r, M.haze, 340, baseY, 0.1, 1.4)
}

function paintMetroNear(r, S) {
  const N = S.near
  const W = BG_W

  // 1) 底部地面
  colFill(r, 0, W - 1, (x) => 468 - 10 * fbmX(x, 0, W, 44, 0x73a1, 2), BG_H, N.base)

  // 2) 枕木（周期 34 → 平铺对齐）
  for (let x = 0; x < W; x += 34) {
    r.rect(x + 3, 500, 24, 18, mixRgb(N.base, N.dark, 0.35))
    r.hf(x + 3, x + 26, 500, N.dark, 0.5)
  }

  // 3) 钢轨（两条横贯，带高光）
  for (let i = 0; i < 2; i++) {
    const y = 496 + i * 34
    r.rect(0, y, W, 7, mixRgb(N.base, N.rim, 0.22))
    r.hf(0, W - 1, y, N.rim, 0.55)
    r.hf(0, W - 1, y + 6, N.dark, 0.8)
    // 锈斑
    for (let k = 0; k < 40; k++) {
      const px = Math.round(hash2(k, i, 0x73a2) * W)
      r.rect(px, y + 2, 2 + (k % 3), 2, S.mid.rust, 0.4)
    }
  }

  // 4) 积水 + 反光（钠灯/毒绿）
  const pud = [
    [360, 528, 210, 16],
    [980, 536, 150, 12],
  ]
  for (let i = 0; i < pud.length; i++) {
    const px = pud[i][0]
    const py = pud[i][1]
    const pw = pud[i][2]
    const ph = pud[i][3]
    for (let dy = -ph; dy <= ph; dy++) {
      const k = 1 - (dy * dy) / (ph * ph + 1)
      if (k <= 0) continue
      const half = pw * Math.sqrt(k)
      for (let dx = -half; dx <= half; dx++) {
        r.alpha(Math.round(px + dx), Math.round(py + dy), mixRgb(S.mid.ground, N.base, 0.3), 0.5)
      }
    }
    // 反光条
    for (let k = 0; k < 5; k++) {
      const ry = py - 4 + k * 3
      const c = k % 2 === 0 ? S.mid.lit : mixRgb(PAL.toxicGlow, PAL.steelLight, 0.5)
      for (let x = -pw * 0.6; x <= pw * 0.6; x += 1) {
        if (hash2(Math.round(px + x), k, 0x73a3) < 0.45) continue
        r.alpha(Math.round(px + x), ry, c, 0.3 * (1 - Math.abs(x) / (pw * 0.6)))
      }
    }
  }

  // 5) 头顶垂落的电缆 + 一盏坏灯
  cable(r, 120, 900, 96, 150, N.base, { thick: 3, dangle: 5 })
  cable(r, 940, 1300, 60, 110, N.base, { thick: 2, dangle: 3 })
  const lx = 470
  const ly = 232
  r.rect(lx - 10, ly, 20, 8, N.base)
  r.rect(lx - 7, ly + 6, 14, 3, mixRgb(S.mid.lit, N.rim, 0.35), 0.8)
  for (let dy = 0; dy < 90; dy++) {
    const a = (1 - dy / 90) * 0.1
    for (let dx = -12 - dy * 0.8; dx <= 12 + dy * 0.8; dx++) {
      if (hash2(Math.round(lx + dx), ly + dy, 0x73a4) < 0.5) continue
      r.alpha(Math.round(lx + dx), ly + dy, S.mid.lit, a)
    }
  }

  // 6) 瓦砾 / 底部压黑
  for (let i = 0; i < 26; i++) {
    const px = Math.round(hash2(i, 1, 0x73a5) * W)
    const py = 480 + Math.round(hash2(i, 2, 0x73a6) * 60)
    r.rect(px, py, 2 + Math.round(hash2(i, 3, 0x73a7) * 5), 1 + Math.round(hash2(i, 4, 0x73a8) * 3), N.dark, 0.7)
  }
  colFill(r, 0, W - 1, (x) => 548 - 6 * fbmX(x, 0, W, 22, 0x73a9, 2), BG_H, N.dark)
  mottle(r, N.dark, N.rim, 0x73aa, 0.24, 4)
}

/* ---- 14.4 hospital：病楼剖面 / 走廊 / 翻倒的家具 ------------------------ */

function paintHospitalFar(r, S) {
  const F = S.far
  const W = BG_W
  const baseY = 500
  const rng = makeRng(0x7b31)

  // 1) 主病楼剖面（左）
  const bx = 96
  const bw = 412
  const btop = 172
  r.rect(bx, btop, bw, baseY - btop, F.base)
  // 楼层
  const floors = 4
  const fh = (baseY - btop) / floors
  for (let f = 0; f < floors; f++) {
    const fy = btop + f * fh
    r.hf(bx, bx + bw - 1, Math.round(fy), F.dark, 0.7)
    // 房间：一排黑窗洞
    winGrid(r, bx + 10, Math.round(fy) + 8, 5, 1, 58, Math.round(fh) * 0.52, F.win, (0x7b1 + f * 17) | 0, {
      gapX: 22,
      gapY: 8,
      skip: 0.1,
      lit: F.lit,
      litChance: 0.06,
    })
    // 地板碎边 / 露出的钢筋
    for (let i = 0; i < 6; i++) {
      const rx = bx + 12 + Math.round(hash2(i, f, 0x7b2) * (bw - 30))
      const len = 8 + hash2(i, f + 3, 0x7b3) * 18
      r.line(rx, Math.round(fy), rx + len, Math.round(fy) - 6, F.rim, 0.5)
    }
  }
  // 破顶（锯齿）
  for (let x = bx; x < bx + bw; x++) {
    const n = hash2(x, 5, 0x7b4)
    const cut = n > 0.62 ? Math.round(6 + (n - 0.62) * 70) : 0
    if (cut > 0) r.vfill(x, btop - 8, btop + cut, F.dark, 0.9)
  }
  r.vfill(bx, btop, baseY, F.dark, 0.5)
  r.vfill(bx + bw - 1, btop, baseY, F.dark, 0.7)
  // 外挂防火梯（右侧锯齿楼梯）
  const fx = bx + bw - 6
  for (let f = 0; f < floors; f++) {
    const y0 = btop + f * fh + 6
    const y1 = y0 + fh - 12
    r.vfill(fx + 16, y0, y1, F.rim, 0.9)
    r.vfill(fx + 44, y0, y1, F.rim, 0.9)
    // 踏板
    for (let s = 0; s < 6; s++) {
      const t = s / 6
      const sy = Math.round(y0 + (y1 - y0) * t)
      r.hf(fx + 16, fx + 44, sy, F.rim, 0.8)
    }
    // 斜梁
    r.line(fx + 18, y1, fx + 42, y0, F.rim, 0.7)
    r.line(fx + 42, y1, fx + 18, y0, F.rim, 0.7)
  }

  // 2) 远处第二栋（更小更淡）
  const bx2 = 980
  const bw2 = 220
  const btop2 = 236
  r.rect(bx2, btop2, bw2, baseY - btop2, F.base)
  for (let f = 0; f < 3; f++) {
    const fy = btop2 + f * ((baseY - btop2) / 3)
    r.hf(bx2, bx2 + bw2 - 1, Math.round(fy), F.dark, 0.6)
    winGrid(r, bx2 + 8, Math.round(fy) + 6, 3, 1, 40, 26, F.win, (0x7b5 + f) | 0, { gapX: 20, skip: 0.15 })
  }
  for (let x = bx2; x < bx2 + bw2; x++) {
    const n = hash2(x, 7, 0x7b6)
    if (n > 0.6) r.vfill(x, btop2 - 6, btop2 + Math.round((n - 0.6) * 60), F.dark, 0.85)
  }
  r.vfill(bx2, btop2, baseY, F.dark, 0.6)

  // 3) 地面 + 碎石堆
  farGround(r, baseY, F.ground, F.haze, 0.34)
  for (let i = 0; i < 5; i++) {
    mound(r, 220 + i * 240, 60 + i * 10, 16 + (i % 3) * 8, baseY + 4, mixRgb(F.base, F.dark, 0.3), 0x7b7 + i, { power: 0.8, rim: F.rim })
  }
  verticalShade(r, 150, baseY, F.dark, 0.3)
  smokeBand(r, 380, baseY, F.smoke, 0.2, 0x7b8, 74)
  aerialHaze(r, F.haze, 280, baseY, 0.26, 1.8)
  mottle(r, F.dark, F.rim, 0x7b9, 0.28, 3)
  void rng
}

function paintHospitalMid(r, S) {
  const M = S.mid
  const W = BG_W
  const baseY = 528
  const wallTop = 292

  // 1) 走廊墙（浅绿瓷砖带）
  for (let y = wallTop; y < baseY; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbmX(x, y, W, 72, 0x7c01, 2)
      let c = mixRgb(M.base, M.dark, n > 0.56 ? 0.3 : 0.06)
      if (y % 14 === 0) c = mixRgb(c, M.dark, 0.4)
      if (x % 14 === 0) c = mixRgb(c, M.dark, 0.3)
      r.opaque(x, y, c)
    }
  }
  streaks(r, 0, W, wallTop, baseY, M.dark, 0x7c02, 0.3, 0.36)
  mottle(r, M.dark, M.edge, 0x7c03, 0.2, 4)
  // 踢脚线
  r.hf(0, W - 1, baseY - 4, M.dark, 0.6)
  r.hf(0, W - 1, wallTop, M.rim, 0.35)

  // 2) 门框（周期 320 → 4 个，平铺对齐）
  const doors = [120, 440, 760, 1080]
  for (let i = 0; i < doors.length; i++) {
    const dx = doors[i]
    const dw = 96
    const dtop = 316
    // 外框
    r.rect(dx - 6, dtop - 6, dw + 12, baseY - dtop + 6, M.rim, 0.85)
    r.rect(dx - 4, dtop - 4, dw + 8, baseY - dtop + 4, mixRgb(M.base, M.rim, 0.35))
    // 门洞（黑）
    r.rect(dx, dtop, dw, baseY - dtop, mixRgb(M.win, PAL.black, 0.5))
    // 半挂的门板（斜的）
    const lean = 10 + (i % 2) * 8
    r.poly(
      [
        [dx + 2, dtop + 6],
        [dx + 22, dtop + 10],
        [dx + 22 + lean, baseY - 4],
        [dx + 2 + lean, baseY - 8],
      ],
      mixRgb(M.base, M.dark, 0.35),
    )
    // 门牌
    r.rect(dx + dw * 0.5 - 10, dtop - 26, 20, 12, mixRgb(M.rim, M.lit, 0.2), 0.9)
    r.rect(dx + dw * 0.5 - 7, dtop - 23, 14, 2, M.dark, 0.7)
  }

  // 3) 垂落的布帘（半透明的竖向波浪）
  for (let i = 0; i < 5; i++) {
    const cx = 250 + i * 250
    const top = 300
    const len = 150 + (i % 3) * 40
    for (let y = 0; y < len; y++) {
      const sway = Math.sin(y * 0.07 + i) * 5
      const w = 12 + Math.sin(y * 0.05 + i * 1.7) * 4
      for (let dx = 0; dx < w; dx++) {
        const a = 0.4 * (1 - y / len)
        r.alpha(Math.round(cx + dx + sway), top + y, mixRgb(M.rim, M.base, 0.4), a)
      }
      r.alpha(Math.round(cx + sway), top + y, M.rim, 0.35 * (1 - y / len))
    }
  }

  // 4) 病床剪影（2 张）
  for (let i = 0; i < 2; i++) {
    const bx = 300 + i * 380
    const by = 470
    r.rect(bx, by, 96, 12, mixRgb(M.base, M.dark, 0.3))
    r.rect(bx - 4, by - 26, 8, 30, M.dark)
    r.rect(bx + 92, by - 14, 6, 18, M.dark)
    r.rect(bx + 6, by + 12, 4, 26, M.dark)
    r.rect(bx + 84, by + 12, 4, 26, M.dark)
    r.hf(bx, bx + 95, by, M.rim, 0.5)
    // 轮子
    tire(r, bx + 8, by + 40, 5, M.dark, {})
    tire(r, bx + 86, by + 40, 5, M.dark, {})
  }

  // 5) 轮椅（1 台）
  const wx = 930
  const wy = 492
  tire(r, wx, wy, 17, M.dark, { hub: M.rim })
  r.rect(wx - 2, wy - 40, 5, 26, M.dark)
  r.rect(wx - 12, wy - 16, 30, 5, M.dark)
  r.rect(wx + 16, wy - 42, 4, 22, M.dark)
  r.rect(wx + 12, wy - 46, 14, 4, M.dark)

  // 6) 天花板：破的日光灯
  for (let i = 0; i < 4; i++) {
    const lx = 180 + i * 300
    r.rect(lx, 128, 46, 7, M.dark)
    const on = i % 3 !== 1
    if (on) {
      r.rect(lx + 4, 130, 38, 3, mixRgb(M.lit, PAL.white, 0.3), 0.9)
      for (let dy = 0; dy < 70; dy++) {
        const hw = 22 + dy * 0.5
        for (let dx = -hw; dx <= hw; dx += 2) {
          if (hash2(Math.round(lx + dx), dy, 0x7c04) < 0.6) continue
          r.alpha(Math.round(lx + dx), 136 + dy, M.lit, (1 - dy / 70) * 0.06)
        }
      }
    } else {
      r.rect(lx + 4, 130, 38, 3, M.dark, 0.8)
      r.vfill(lx + 24, 134, 168, M.dark, 0.5)
    }
  }

  // 7) 地面 + 压暗
  r.rect(0, baseY - 2, W, BG_H - baseY + 2, mixRgb(M.ground, M.base, 0.2))
  mottle(r, M.dark, M.rim, 0x7c05, 0.26, 3)
  aerialHaze(r, M.haze, 330, baseY, 0.14, 1.4)
}

function paintHospitalNear(r, S) {
  const N = S.near
  const W = BG_W
  const glass = mixHex(PAL.glass, PAL.white, 0.4)

  // 1) 地面
  colFill(r, 0, W - 1, (x) => 474 - 12 * fbmX(x, 0, W, 48, 0x7d01, 2), BG_H, N.base)

  // 2) 翻倒的柜子（左）
  r.poly(
    [
      [40, 470],
      [300, 436],
      [320, 512],
      [60, 548],
    ],
    mixRgb(N.base, N.dark, 0.2),
  )
  for (let i = 0; i < 3; i++) {
    r.line(64 + i * 84, 470 - i * 10, 84 + i * 84, 540 - i * 8, N.dark, 0.6)
  }
  r.hf(40, 300, 470, N.rim, 0.35)
  // 掉出来的抽屉
  r.poly(
    [
      [330, 520],
      [400, 512],
      [406, 538],
      [336, 546],
    ],
    mixRgb(N.base, N.dark, 0.4),
  )

  // 3) 碎玻璃（散落小块高光）
  for (let i = 0; i < 60; i++) {
    const px = Math.round(hash2(i, 1, 0x7d02) * W)
    const py = 468 + Math.round(hash2(i, 2, 0x7d03) * 84)
    const w = 1 + Math.round(hash2(i, 3, 0x7d04) * 3)
    r.rect(px, py, w, 1, glass, 0.55)
    if (i % 4 === 0) r.alpha(px + 1, py + 1, PAL.white, 0.4)
  }

  // 4) 前景轮椅（右）
  const wx = 1000
  const wy = 528
  tire(r, wx, wy, 30, N.base, { hub: N.dark })
  tire(r, wx + 26, wy + 10, 12, N.base, {})
  r.rect(wx - 4, wy - 62, 8, 40, N.base)
  r.rect(wx - 26, wy - 30, 52, 8, N.base)
  r.rect(wx + 24, wy - 66, 7, 34, N.base)
  r.hf(wx - 20, wx + 24, wy - 70, N.dark, 0.6)

  // 5) 输液架 + 垂下的床单
  const ix = 780
  r.vfill(ix, 300, 540, N.base)
  r.hf(ix - 12, ix + 12, 300, N.base)
  r.rect(ix - 8, 306, 16, 20, mixRgb(N.rim, PAL.toxicDark, 0.4), 0.75)
  for (let i = 0; i < 4; i++) {
    const cx = 150 + i * 300
    for (let y = 0; y < 90; y++) {
      const sway = Math.sin(y * 0.08 + i * 2) * 6
      for (let dx = 0; dx < 7; dx++) {
        r.alpha(Math.round(cx + dx + sway), 292 + y, mixRgb(N.base, N.rim, 0.35), 0.3 * (1 - y / 90))
      }
    }
  }

  // 6) 底部压黑 + 斑驳
  colFill(r, 0, W - 1, (x) => 548 - 7 * fbmX(x, 0, W, 20, 0x7d05, 2), BG_H, N.dark)
  mottle(r, N.dark, N.rim, 0x7d06, 0.24, 4)
}

/* ---- 14.5 port：集装箱 / 吊机 / 搁浅船 / 码头 --------------------------- */

function paintPortFar(r, S) {
  const F = S.far
  const W = BG_W
  const waterY = 452
  const baseY = 490

  // 1) 集装箱堆（三簇，rust / 钢蓝交错）
  const stacks = [
    [600, 366, 2, 2],
    [1040, 344, 2, 3],
    [1224, 380, 2, 2],
  ]
  for (let s = 0; s < stacks.length; s++) {
    const sx = stacks[s][0]
    const sy = stacks[s][1]
    const cols = stacks[s][2]
    const rows = stacks[s][3]
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < rows; k++) {
        if (hash2(s * 13 + c, k, 0x7e01) > 0.82) continue
        const cw = 64 + Math.round(hash2(c, k + s, 0x7e02) * 26)
        const ch = 22
        const cc = (c + k + s) % 3 === 0 ? mixRgb(F.base, S.mid.rust, 0.5) : mixRgb(F.base, F.dark, 0.25 + k * 0.12)
        container(r, sx + c * 70, sy + k * 24, cw, ch, cc, { dark: F.dark, light: F.rim, seed: (0x7e00 + s * 7 + c * 3 + k) | 0 })
      }
    }
  }

  // 2) 龙门吊（两台）
  crane(r, 468, baseY, 252, 236, mixRgb(F.base, F.dark, 0.15), { hookLen: 54, legGap: 40, legW: 5 })
  crane(r, 912, baseY, 288, 276, mixRgb(F.base, F.dark, 0.15), { hookLen: 70, legGap: 46, legW: 5 })

  // 3) 搁浅的船体（倾斜 + 上层建筑 + 桅杆）
  const hx = 430
  const hy = 386
  r.poly(
    [
      [hx, hy + 34],
      [hx + 210, hy + 12],
      [hx + 340, hy + 40],
      [hx + 300, hy + 74],
      [hx + 40, hy + 86],
    ],
    mixRgb(F.base, F.dark, 0.58),
  )
  r.hf(hx + 10, hx + 330, hy + 34, F.rim, 0.4)
  for (let x = 8; x < 336; x++) {
    r.alpha(hx + x, hy + 30, F.dark, 0.45)
    r.alpha(hx + x, hy + 74, mixRgb(F.dark, F.ground, 0.4), 0.5)
  }
  // 上层建筑
  r.rect(hx + 196, hy - 34, 74, 58, mixRgb(F.base, F.dark, 0.66))
  for (let k = 0; k < 3; k++) r.hf(hx + 202, hx + 264, hy - 26 + k * 14, F.win, 0.8)
  // 桅杆 + 吊杆
  r.vfill(hx + 232, hy - 96, hy - 34, F.dark, 1)
  r.line(hx + 232, hy - 84, hx + 120, hy - 40, F.dark, 0.8)
  r.line(hx + 232, hy - 84, hx + 344, hy - 44, F.dark, 0.8)
  // 船体锈迹
  streaks(r, hx, 340, hy + 30, hy + 84, S.mid.rust, 0x7e03, 0.3, 0.45)

  // 4) 海面（水线以下）
  for (let y = waterY; y < BG_H; y++) {
    const t = (y - waterY) / Math.max(1, BG_H - waterY)
    const c = mixRgb(F.ground, mixRgb(F.ground, F.dark, 0.5), t)
    for (let x = 0; x < W; x++) {
      const n = fbmX(x, y * 2, W, 40, 0x7e04, 2)
      r.opaque(x, y, mixRgb(c, F.rim, n > 0.66 ? 0.12 : 0))
    }
  }
  // 水线亮边 + 倒影
  for (let x = 0; x < W; x++) {
    r.alpha(x, waterY, F.rim, 0.5)
    r.alpha(x, waterY + 1, F.haze, 0.2)
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.round(hash2(i, 1, 0x7e05) * W)
    const len = 8 + Math.round(hash2(i, 2, 0x7e06) * 34)
    const y = waterY + 6 + Math.round(hash2(i, 3, 0x7e07) * 30)
    r.hf(x, x + len, y, F.rim, 0.16)
  }

  verticalShade(r, 120, baseY, F.dark, 0.3)
  smokeBand(r, 360, baseY, F.smoke, 0.22, 0x7e08, 70)
  aerialHaze(r, F.haze, 200, baseY, 0.3, 1.9)
  mottle(r, F.dark, F.rim, 0x7e09, 0.26, 3)
}

function paintPortMid(r, S) {
  const M = S.mid
  const W = BG_W
  const baseY = 524

  // 1) 仓库铁皮墙（左半）
  const wx = 40
  const ww = 360
  const wtop = 236
  r.rect(wx, wtop, ww, baseY - wtop, M.base)
  // 竖向波纹
  for (let x = wx + 3; x < wx + ww; x += 7) {
    r.vfill(x, wtop + 2, baseY, M.dark, 0.32)
    r.vfill(x + 1, wtop + 2, baseY, M.rim, 0.14)
  }
  // 屋顶（微斜）+ 檐口
  r.poly(
    [
      [wx - 8, wtop],
      [wx + ww * 0.55, wtop - 26],
      [wx + ww + 8, wtop - 6],
      [wx + ww + 8, wtop + 6],
      [wx - 8, wtop + 8],
    ],
    mixRgb(M.base, M.dark, 0.45),
  )
  r.hf(wx - 8, wx + ww + 8, wtop + 6, M.dark, 0.6)
  // 卷帘门（半开）
  const dx = wx + 92
  const dw = 140
  r.rect(dx, wtop + 70, dw, baseY - wtop - 70, mixRgb(M.win, PAL.black, 0.45))
  for (let y = wtop + 70; y < wtop + 86; y++) r.hf(dx, dx + dw - 1, y, M.dark, 0.8)
  r.hf(dx - 3, dx + dw + 2, wtop + 70, M.rim, 0.5)
  // 窗（高窗一排）
  winGrid(r, wx + 24, wtop + 26, 4, 1, 44, 22, M.win, 0x7f01, { gapX: 24, gapY: 10, skip: 0.2, lit: M.lit, litChance: 0.12 })
  streaks(r, wx, ww, wtop + 10, baseY, M.rust, 0x7f02, 0.34, 0.5)

  // 2) 油罐（右半，两只圆柱）
  tank(r, 780, baseY, 116, 132, M.base, { rust: M.rust, seed: 0x7f03 })
  tank(r, 916, baseY, 86, 104, mixRgb(M.base, M.dark, 0.2), { rust: M.rust, seed: 0x7f04 })
  r.hf(780, 900, baseY - 132, M.rim, 0.4)

  // 3) 管道（从仓库接到油罐）
  pipeRun(r, 540, 800, 400, 9, M.base, { hi: M.rim, lo: M.dark, legs: true, legTo: baseY, flangeGap: 150, seed: 0x7f05 })

  // 4) 系缆桩（码头边，周期 320）
  for (let i = 0; i < 4; i++) {
    const bx = 120 + i * 320
    const by = 500
    r.rect(bx - 9, by - 16, 18, 16, M.base)
    r.rect(bx - 12, by - 20, 24, 6, mixRgb(M.base, M.rim, 0.25))
    r.hf(bx - 12, bx + 11, by - 20, M.rim, 0.6)
    r.vfill(bx - 9, by - 16, by, M.dark, 0.6)
    // 缆绳
    for (let k = 0; k < 26; k++) {
      const t = k / 26
      r.alpha(Math.round(bx + 8 + t * 60), Math.round(by - 10 + t * 22), M.dark, 0.7)
    }
  }

  // 5) 木箱 / 桶 / 铁网
  for (let i = 0; i < 4; i++) {
    const bx = 640 + i * 96
    r.rect(bx, 486, 34, 32, mixRgb(M.rust, M.base, 0.5))
    r.hf(bx, bx + 33, 486, M.rim, 0.35)
    r.line(bx + 2, 488, bx + 31, 515, M.dark, 0.4)
  }
  barrel(r, 1084, 520, 30, mixRgb(M.rust, M.dark, 0.3), { w: 16, rim: M.rim })
  barrel(r, 1108, 518, 26, M.base, { w: 13 })
  fence(r, 1150, W + 20, 512, 90, M.dark, 0x7f06, { postGap: 40, wires: 3, mesh: true, miss: 0.2 })

  // 6) 地面（码头面）+ 压暗
  r.rect(0, baseY - 3, W, BG_H - baseY + 3, mixRgb(M.ground, M.base, 0.28))
  for (let x = 0; x < W; x += 5) r.alpha(x, baseY - 2, M.rim, 0.12)
  smokeBand(r, 420, BG_H, M.smoke, 0.3, 0x7f07, 64)
  mottle(r, M.dark, M.rim, 0x7f08, 0.26, 3)
  aerialHaze(r, M.haze, 320, baseY, 0.14, 1.4)
}

function paintPortNear(r, S) {
  const N = S.near
  const W = BG_W

  // 1) 防波堤石块（左，多边形堆）
  for (let i = 0; i < 7; i++) {
    const bx = 20 + i * 58
    const by = 470 + (i % 3) * 16
    const w = 70 + (i % 3) * 26
    const h = 60 + (i % 2) * 26
    r.poly(
      [
        [bx, by],
        [bx + w * 0.7, by - h * 0.5],
        [bx + w, by + h * 0.2],
        [bx + w * 0.5, by + h],
        [bx - w * 0.1, by + h * 0.6],
      ],
      mixRgb(N.base, N.dark, (i % 3) * 0.15),
    )
    r.line(bx + w * 0.7, by - h * 0.5, bx + w * 0.5, by + h, N.dark, 0.5)
  }

  // 2) 码头木板（前景，横铺）
  colFill(r, 0, W - 1, (x) => 486 - 6 * fbmX(x, 0, W, 36, 0x8001, 2), BG_H, mixRgb(N.base, S.mid.rust, 0.18))
  for (let y = 492; y < BG_H; y += 18) {
    r.hf(0, W - 1, y, N.dark, 0.7)
    r.hf(0, W - 1, y + 1, N.rim, 0.14)
    // 钉子
    for (let x = 20; x < W; x += 96) {
      r.alpha(x + (y % 36 ? 12 : 0), y - 3, N.rim, 0.4)
    }
  }
  // 湿痕反光
  for (let i = 0; i < 30; i++) {
    const x = Math.round(hash2(i, 1, 0x8002) * W)
    const len = 12 + Math.round(hash2(i, 2, 0x8003) * 40)
    const y = 496 + Math.round(hash2(i, 3, 0x8004) * 56)
    r.hf(x, x + len, y, S.mid.haze, 0.14)
  }

  // 3) 渔网（菱形网格，挂在木架下）
  const netCol = mixRgb(N.base, N.rim, 0.3)
  const netSpans = [
    [252, 302, 468],
    [470, 332, 484],
    [716, 292, 458],
    [968, 320, 476],
  ]
  for (let gx = 0; gx < netSpans.length; gx++) {
    const nx = netSpans[gx][0]
    const ntop = netSpans[gx][1]
    const nbot = netSpans[gx][2]
    for (let y = ntop; y < nbot; y++) {
      for (let x = -70; x <= 70; x++) {
        const u = x + 70
        const v = y - ntop
        if ((u + v) % 16 === 0 || (u - v + 160) % 16 === 0) {
          r.alpha(nx + x, y, netCol, 0.4 * (1 - (y - ntop) / (nbot - ntop) * 0.4))
        }
      }
    }
    // 浮子
    for (let k = 0; k < 4; k++) r.rect(nx - 62 + k * 32, ntop - 4, 5, 6, mixRgb(PAL.rust, PAL.sand, 0.4), 0.8)
  }

  // 4) 缆绳盘 + 前景系缆桩
  const rx = 1180
  const ry = 512
  for (let k = 0; k < 5; k++) {
    const rad = 10 + k * 7
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2
      r.alpha(Math.round(rx + Math.cos(ang) * rad), Math.round(ry + Math.sin(ang) * rad * 0.5), mixRgb(N.base, S.mid.rust, 0.4), 0.75)
    }
  }
  r.rect(rx - 12, ry - 26, 24, 30, N.base)
  r.rect(rx - 16, ry - 32, 32, 8, mixRgb(N.base, N.rim, 0.3))

  // 5) 底部压黑 + 斑驳
  colFill(r, 0, W - 1, (x) => 546 - 6 * fbmX(x, 0, W, 22, 0x8005, 2), BG_H, N.dark)
  mottle(r, N.dark, N.rim, 0x8006, 0.24, 4)
}

/* ---- 14.6 地面砖（32×32，四向平铺）------------------------------------- */

/** 地铁：破碎白瓷砖 + 锈轨（16 网格勾缝） */
function paintGroundMetro(r, G) {
  const size = r.w
  const joint = mixRgb(G.dark, hexRgb(PAL.void), 0.3)
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = fbmTile(x, y, size, 8, 0x81a1, 3)
      const h = hash2(x >> 1, y >> 1, 0x81a2)
      let c = G.base
      if (n < 0.42) c = mixRgb(G.base, G.dark, 0.4)
      else if (n > 0.68) c = mixRgb(G.base, G.light, 0.35)
      // 缺角：露出底下水泥
      if (h > 0.9) c = mixRgb(G.dark, G.rust, 0.25)
      r.rect(x, y, 2, 2, c)
    }
  }
  // 瓷砖勾缝（16 网格）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x % 16 === 0 || y % 16 === 0) r.opaque(x, y, joint)
      else if (x % 16 === 1 || y % 16 === 1) r.alpha(x, y, G.light, 0.28)
      else if (x % 16 === 15 || y % 16 === 15) r.alpha(x, y, G.dark, 0.4)
    }
  }
  // 破裂：几条裂纹
  for (let i = 0; i < 3; i++) {
    let cx = 3 + i * 11
    let cy = 2 + i * 9
    for (let k = 0; k < 10; k++) {
      r.alpha(cx, cy, joint, 0.75)
      cx += hash2(k, i, 0x81a3) > 0.5 ? 1 : -1
      cy += 1
      if (cy > size - 2) break
    }
  }
  // 锈迹 + 一小段嵌进地面的锈轨
  for (let i = 0; i < 6; i++) {
    const px = Math.round(hash2(i, 1, 0x81a4) * size)
    const py = Math.round(hash2(i, 2, 0x81a5) * size)
    tileRect(r, px, py, 2 + Math.round(hash2(i, 3, 0x81a6) * 5), 1 + Math.round(hash2(i, 4, 0x81a7) * 3), G.rust, 0.35)
  }
  tileRect(r, 0, 24, 32, 2, mixRgb(G.rust, G.dark, 0.62), 0.8)
  tileRect(r, 0, 24, 32, 1, mixRgb(G.rust, G.light, 0.22), 0.45)
  tileRect(r, 0, 26, 32, 1, G.dark, 0.35)
}

/** 医院：浅绿瓷砖 + 血迹 + 霉斑 */
function paintGroundHospital(r, G) {
  const size = r.w
  const joint = mixRgb(G.dark, hexRgb(PAL.void), 0.22)
  const blood = mixHex(PAL.blood, PAL.bloodDark, 0.35)
  const mold = mixHex(PAL.mossDead, PAL.toxicDark, 0.4)
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = fbmTile(x, y, size, 8, 0x82b1, 3)
      const h = hash2(x >> 1, y >> 1, 0x82b2)
      let c = G.base
      if (n < 0.44) c = mixRgb(G.base, G.dark, 0.32)
      else if (n > 0.7) c = mixRgb(G.base, G.light, 0.3)
      if (h > 0.92) c = mixRgb(c, G.dark, 0.4)
      r.rect(x, y, 2, 2, c)
    }
  }
  // 勾缝
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x % 16 === 0 || y % 16 === 0) r.opaque(x, y, joint)
      else if (x % 16 === 1 || y % 16 === 1) r.alpha(x, y, G.light, 0.3)
      else if (x % 16 === 15 || y % 16 === 15) r.alpha(x, y, G.dark, 0.34)
    }
  }
  // 血迹（暗红，低 alpha 叠几层）
  for (let i = 0; i < 3; i++) {
    const px = Math.round(hash2(i, 1, 0x82b3) * size)
    const py = Math.round(hash2(i, 2, 0x82b4) * size)
    const pw = 3 + Math.round(hash2(i, 3, 0x82b5) * 6)
    const ph = 2 + Math.round(hash2(i, 4, 0x82b6) * 5)
    tileRect(r, px, py, pw, ph, blood, 0.26)
    tileRect(r, px + 1, py + 1, Math.max(1, pw - 2), Math.max(1, ph - 2), blood, 0.3)
  }
  // 霉斑 / 污渍
  for (let i = 0; i < 7; i++) {
    const px = Math.round(hash2(i, 5, 0x82b7) * size)
    const py = Math.round(hash2(i, 6, 0x82b8) * size)
    tileRect(r, px, py, 1 + Math.round(hash2(i, 7, 0x82b9) * 4), 1 + Math.round(hash2(i, 8, 0x82ba) * 3), mold, 0.3)
  }
  // 崩口
  for (let i = 0; i < 5; i++) {
    const px = Math.round(hash2(i, 9, 0x82bb) * size)
    const py = Math.round(hash2(i, 10, 0x82bc) * size)
    tileRect(r, px, py, 2, 2, G.dark, 0.7)
  }
}

/** 港口：湿木板（4 条 8px 板）+ 锈 */
function paintGroundPort(r, G) {
  const size = r.w
  const gap = mixRgb(G.dark, hexRgb(PAL.void), 0.35)
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const board = Math.floor(y / 8)
      const n = fbmTile(x, y, size, 4, 0x83c1 + board * 31, 3)
      const h = hash2(x >> 1, y >> 1, 0x83c2)
      let c = G.base
      // 每块板明度略不同 + 木纹（沿 x 拉长）
      c = mixRgb(c, board % 2 ? G.light : G.dark, 0.1 + (board % 3) * 0.06)
      if (n < 0.38) c = mixRgb(c, G.dark, 0.42)
      else if (n > 0.68) c = mixRgb(c, G.light, 0.22)
      if (h > 0.9) c = mixRgb(c, G.rust, 0.35)
      r.rect(x, y, 2, 2, c)
    }
  }
  // 板缝（每 8 行）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y % 8 === 0) r.opaque(x, y, gap)
      else if (y % 8 === 1) r.alpha(x, y, G.light, 0.2)
      // 木纹：横向细线
      else if ((y + (x >> 3)) % 5 === 0) r.alpha(x, y, G.dark, 0.18)
    }
  }
  // 竖向接缝（错缝，周期 16）
  for (let b = 0; b < 4; b++) {
    const sx = (b % 2 ? 8 : 0) + 4
    for (let y = b * 8; y < b * 8 + 8; y++) r.alpha(sx, y, gap, 0.8)
  }
  // 湿痕 + 锈斑
  for (let i = 0; i < 8; i++) {
    const px = Math.round(hash2(i, 1, 0x83c3) * size)
    const py = Math.round(hash2(i, 2, 0x83c4) * size)
    tileRect(r, px, py, 2 + Math.round(hash2(i, 3, 0x83c5) * 6), 1 + Math.round(hash2(i, 4, 0x83c6) * 3), G.rust, 0.34)
  }
  for (let i = 0; i < 5; i++) {
    const px = Math.round(hash2(i, 5, 0x83c7) * size)
    const py = Math.round(hash2(i, 6, 0x83c8) * size)
    tileRect(r, px, py, 2, 2, mixRgb(G.light, G.dark, 0.4), 0.2)
  }
}
