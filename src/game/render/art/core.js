// ============================================================================
// 锈雨 · RUSTFALL —— 像素绘制内核（art 模块共享）
// ----------------------------------------------------------------------------
// 所有 art 模块（chassis / monsters / props / items / portraits / tools /
// large-monsters / eco / weapons）共用这一份实现，保证：
//
//   1. 输出 alpha 只允许 0 或 255 —— 二值化在 Surf.tex() 里统一执行：
//        a < 200  → 0（完全透明）
//        a >= 200 → 255（完全不透明）
//      因此没有“半透明脏边”；抗锯齿一律靠 1px 硬边 + 4×4 Bayer 抖动。
//   2. 所有贴图：NearestFilter×2、generateMipmaps=false、SRGBColorSpace、
//      ClampToEdge、needsUpdate=true，并带 userData.cleanAlpha = true。
//   3. 光晕（glow）不再用低 alpha：只在已不透明像素上做加色提亮，
//      或向剪影外扩 1px 写成完全不透明像素（抖动控制密度）。
//   4. 接地阴影（shadow）用抖动的不透明暗像素，不再用 alpha 0.3 的椭圆。
//   5. 每次 tex() 会累计“被清掉的半透明像素数”，供统计/自检使用
//      （alphaReport()）。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32 } from '../rng.js'

// 让各 art 模块统一从 core 取 RNG（避免各自 import rng.js）
export { mulberry32 }

export const TAU = Math.PI * 2

/* ============================================================================
 * 颜色
 * ========================================================================== */

const HEXC = new Map()
const MIXC = new Map()

export function rgb(hex) {
  let c = HEXC.get(hex)
  if (!c) {
    let h = hex[0] === '#' ? hex.slice(1) : hex
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    c = [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0,
    ]
    HEXC.set(hex, c)
  }
  return c
}

/** 两色按 t∈[0,1] 混合（结果缓存，逐像素一致）。 */
export function mix(a, b, t) {
  const k = Math.round(Math.max(0, Math.min(1, t)) * 128)
  const key = a + '|' + b + '|' + k
  let v = MIXC.get(key)
  if (v) return v
  const A = rgb(a)
  const B = rgb(b)
  const f = k / 128
  const r = Math.round(A[0] + (B[0] - A[0]) * f)
  const g = Math.round(A[1] + (B[1] - A[1]) * f)
  const bl = Math.round(A[2] + (B[2] - A[2]) * f)
  v = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)
  MIXC.set(key, v)
  return v
}

/** t>0 提亮（趋向 white），t<0 压暗（趋向 void）。 */
export function shade(c, t) {
  return t >= 0 ? mix(c, PAL.white, t) : mix(c, PAL.void, -t)
}

/** 4×4 Bayer 阈值矩阵。 */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Bayer 阈值（0..1）。 */
export function bayerAt(x, y) {
  return (BAYER[((y & 3) << 2) + (x & 3)] + 0.5) / 16
}

/* ============================================================================
 * 全局统计（报告 / 自检用）
 * ========================================================================== */

export const ALPHA_STATS = {
  textures: 0,
  texels: 0,
  semiCleared: 0, // 被二值化清掉（变 0）的半透明像素
  semiOpaque: 0, // 被二值化提升为不透明的半透明像素
  semiByModule: Object.create(null),
}

export function alphaReport() {
  return {
    textures: ALPHA_STATS.textures,
    texels: ALPHA_STATS.texels,
    semiCleared: ALPHA_STATS.semiCleared,
    semiOpaque: ALPHA_STATS.semiOpaque,
    byModule: { ...ALPHA_STATS.semiByModule },
  }
}

export function resetAlphaStats() {
  ALPHA_STATS.textures = 0
  ALPHA_STATS.texels = 0
  ALPHA_STATS.semiCleared = 0
  ALPHA_STATS.semiOpaque = 0
  ALPHA_STATS.semiByModule = Object.create(null)
}

/* 当前模块名（各 art 模块在 import 后调用一次，供统计归属） */
let CURRENT_MODULE = 'art'
export function setArtModule(name) {
  CURRENT_MODULE = name || 'art'
}

/* ============================================================================
 * 像素表面
 * ========================================================================== */

export class Surf {
  /**
   * @param {number} w 宽
   * @param {number} h 高
   * @param {number|string} seed 确定性种子（同种子 → 逐像素一致）
   * @param {string} [module] 统计归属（各 art 模块传入自己的名字）
   */
  constructor(w, h, seed = 1, module = '') {
    this.w = Math.max(1, w | 0)
    this.h = Math.max(1, h | 0)
    this.module = module || CURRENT_MODULE
    this.d = new Uint8ClampedArray(this.w * this.h * 4)
    this.rng = mulberry32((typeof seed === 'string' ? strSeed(seed) : seed) >>> 0 || 1)
  }

  r() {
    return this.rng()
  }

  i(x, y) {
    return (y * this.w + x) * 4
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  /** 取 alpha（0..255）。 */
  a(x, y) {
    return this.inside(x, y) ? this.d[this.i(x, y) + 3] : 0
  }

  /** 该像素是否完全不透明。 */
  solid(x, y) {
    return this.a(x, y) >= 200
  }

  /** 邻域内是否有不透明像素（默认 1px，切比雪夫距离）。 */
  nearSolid(x, y, r = 1) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dy === 0) continue
        if (this.a(x + dx, y + dy) >= 200) return true
      }
    }
    return false
  }

  /** 用 rgb 数值合成（内部用）。 */
  pxRGB(x, y, r, g, b, al = 1) {
    x = Math.round(x)
    y = Math.round(y)
    if (!this.inside(x, y) || al <= 0) return
    const i = this.i(x, y)
    const d = this.d
    const sa = al >= 1 ? 1 : al
    const da = d[i + 3] / 255
    if (sa >= 1 || da <= 0) {
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = sa * 255
      return
    }
    const oa = sa + da * (1 - sa)
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa
    d[i + 3] = oa * 255
  }

  /** alpha 合成（src over dst）。 */
  px(x, y, c, al = 1) {
    if (al <= 0) return
    const p = rgb(c)
    this.pxRGB(x, y, p[0], p[1], p[2], al)
  }

  /** 覆盖式写入。 */
  set(x, y, c, al = 1) {
    x = Math.round(x)
    y = Math.round(y)
    if (!this.inside(x, y)) return
    const i = this.i(x, y)
    const p = rgb(c)
    this.d[i] = p[0]
    this.d[i + 1] = p[1]
    this.d[i + 2] = p[2]
    this.d[i + 3] = Math.max(0, Math.min(1, al)) * 255
  }

  rect(x, y, w, h, c, al = 1) {
    const x0 = Math.round(x)
    const y0 = Math.round(y)
    const x1 = x0 + Math.round(w)
    const y1 = y0 + Math.round(h)
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.px(i, j, c, al)
  }

  line(x0, y0, x1, y1, c, al = 1) {
    let ax = Math.round(x0)
    let ay = Math.round(y0)
    const bx = Math.round(x1)
    const by = Math.round(y1)
    const dx = Math.abs(bx - ax)
    const dy = -Math.abs(by - ay)
    const sx = ax < bx ? 1 : -1
    const sy = ay < by ? 1 : -1
    let err = dx + dy
    for (let g = 0; g < 4096; g++) {
      this.px(ax, ay, c, al)
      if (ax === bx && ay === by) break
      const e2 = err * 2
      if (e2 >= dy) {
        err += dy
        ax += sx
      }
      if (e2 <= dx) {
        err += dx
        ay += sy
      }
    }
  }

  /** 粗线（圆头胶囊）：肢体 / 线缆 / 管路。 */
  thick(x0, y0, x1, y1, r, c, al = 1) {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const steps = Math.max(1, Math.ceil(len * 2.2))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c, al)
    }
  }

  disc(cx, cy, r, c, al = 1) {
    this.ell(cx, cy, r, r, c, al)
  }

  /** 整数化实心椭圆（逐行填充 → 天然像素阶梯）。 */
  ell(cx, cy, rx, ry, c, al = 1) {
    if (rx <= 0 || ry <= 0) return
    const y0 = Math.floor(cy - ry - 0.5)
    const y1 = Math.ceil(cy + ry + 0.5)
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / (ry + 0.5)
      const k = 1 - dy * dy
      if (k <= 0) continue
      const half = (rx + 0.5) * Math.sqrt(k)
      const xa = Math.round(cx - half)
      const xb = Math.round(cx + half)
      for (let x = xa; x < xb; x++) this.px(x, y, c, al)
    }
  }

  /** 扫描线填充多边形。 */
  poly(pts, c, al = 1) {
    const n = pts.length
    if (n < 3) return
    let ymin = Infinity
    let ymax = -Infinity
    for (const p of pts) {
      if (p[1] < ymin) ymin = p[1]
      if (p[1] > ymax) ymax = p[1]
    }
    const xs = []
    for (let y = Math.floor(ymin); y <= Math.ceil(ymax); y++) {
      const cy = y + 0.5
      xs.length = 0
      for (let i = 0; i < n; i++) {
        const a = pts[i]
        const b = pts[(i + 1) % n]
        if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
          xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
        }
      }
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.round(xs[k])
        const xb = Math.round(xs[k + 1])
        for (let x = xa; x < xb; x++) this.px(x, y, c, al)
      }
    }
  }

  /** Bayer 抖动实心矩形（lv 0=空 1=满）。 */
  dith(x, y, w, h, c, lv = 0.5, al = 1) {
    const x0 = Math.round(x)
    const y0 = Math.round(y)
    const x1 = x0 + Math.round(w)
    const y1 = y0 + Math.round(h)
    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) {
        if (lv > bayerAt(i, j)) this.px(i, j, c, al)
      }
    }
  }

  /** 只在已有像素上打散点（锈 / 污 / 高光碎屑）。 */
  speck(x, y, w, h, c, frac = 0.3, al = 0.7) {
    const x0 = Math.round(x)
    const y0 = Math.round(y)
    const x1 = x0 + Math.round(w)
    const y1 = y0 + Math.round(h)
    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) {
        if (this.a(i, j) <= 0) continue
        if (this.rng() < frac) this.px(i, j, c, al)
      }
    }
  }

  /**
   * 加色光晕 —— 不使用半透明！
   *  · 落在不透明像素上：直接加色提亮（alpha 保持 255）。
   *  · 落在剪影外但紧邻不透明像素（1px）：写成完全不透明像素，
   *    密度用 Bayer 抖动控制（k 越小点越稀）。
   *  · 更远处直接忽略（不会出现毛茸茸的脏边）。
   */
  glow(cx, cy, r, c, pw = 1) {
    if (r <= 0) return
    const p = rgb(c)
    const x0 = Math.floor(cx - r)
    const x1 = Math.ceil(cx + r)
    const y0 = Math.floor(cy - r)
    const y1 = Math.ceil(cy + r)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!this.inside(x, y)) continue
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (dist > r) continue
        const f = 1 - dist / r
        const k = f * f * pw
        if (k <= 0.1) continue
        const i = this.i(x, y)
        const opaque = this.d[i + 3] >= 200
        if (opaque) {
          // 加色（alpha 不变）
          this.d[i] = Math.min(255, this.d[i] + p[0] * k)
          this.d[i + 1] = Math.min(255, this.d[i + 1] + p[1] * k)
          this.d[i + 2] = Math.min(255, this.d[i + 2] + p[2] * k)
          this.d[i + 3] = 255
        } else if (k > 0.45 && this.nearSolid(x, y, 1)) {
          // 剪影外 1px：抖动稀疏的不透明亮色点
          if (k < 0.85 && bayerAt(x, y) > (k - 0.45) * 2) continue
          const m = 0.55 + 0.45 * k
          this.d[i] = p[0] * m + 30
          this.d[i + 1] = p[1] * m + 30
          this.d[i + 2] = p[2] * m + 30
          this.d[i + 3] = 255
        }
      }
    }
  }

  /**
   * 接地阴影：不是半透明椭圆，而是抖动的不透明暗像素
   * （近中心密集、边缘稀疏），完全符合“只有 0/255 两种 alpha”。
   */
  shadow(cx, cy, rx, ry, al = 0.5) {
    if (rx <= 0 || ry <= 0) return
    const density = Math.min(0.92, Math.max(0.2, al * 1.5))
    const y0 = Math.floor(cy - ry - 0.5)
    const y1 = Math.ceil(cy + ry + 0.5)
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / (ry + 0.5)
      const k = 1 - dy * dy
      if (k <= 0) continue
      const half = (rx + 0.5) * Math.sqrt(k)
      const xa = Math.round(cx - half)
      const xb = Math.round(cx + half)
      for (let x = xa; x < xb; x++) {
        // 边缘更稀，中心更密
        const edge = 1 - Math.abs((x + 0.5 - cx) / (half + 0.5))
        const dens = density * (0.45 + edge * 0.75)
        if (bayerAt(x, y) > dens) continue
        const i = this.i(x, y)
        if (this.d[i + 3] >= 200) {
          // 压在已有像素上就压暗它
          this.d[i] *= 0.55
          this.d[i + 1] *= 0.55
          this.d[i + 2] *= 0.55
        } else {
          this.d[i] = 7
          this.d[i + 1] = 9
          this.d[i + 2] = 11
          this.d[i + 3] = 255
        }
      }
    }
  }

  /** 整体染色（受伤红闪 / 死亡压暗），只作用于已有像素，alpha 保持不透明。 */
  tint(c, al, opaqueOnly = true) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.a(x, y) <= (opaqueOnly ? 0 : 255)) continue
        this.px(x, y, c, al)
        const i = this.i(x, y)
        if (this.d[i + 3] > 0) this.d[i + 3] = 255
      }
    }
  }

  /** 上缘高光 + 下缘暗部（三层关系），只在已有像素上修改。 */
  edges(hi, lo, hiA = 0.45, loA = 0.4) {
    const top = []
    const bot = []
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.a(x, y) < 110) continue
        if (y === 0 || this.a(x, y - 1) < 40) top.push(x, y)
        if (y === this.h - 1 || this.a(x, y + 1) < 40) bot.push(x, y)
      }
    }
    for (let k = 0; k < top.length; k += 2) {
      this.px(top[k], top[k + 1], hi, hiA)
      this.d[this.i(top[k], top[k + 1]) + 3] = 255
    }
    for (let k = 0; k < bot.length; k += 2) {
      this.px(bot[k], bot[k + 1], lo, loA)
      this.d[this.i(bot[k], bot[k + 1]) + 3] = 255
    }
  }

  /** 外描边（4 邻域）：完全不透明的深色 1px。 */
  outline(c) {
    const { w, h } = this
    const src = new Uint8ClampedArray(this.d)
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3])
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (at(x, y) > 0) continue
        if (at(x - 1, y) > 96 || at(x + 1, y) > 96 || at(x, y - 1) > 96 || at(x, y + 1) > 96) {
          this.set(x, y, c, 1)
        }
      }
    }
  }

  /** 把另一张表面按 alpha 合成到本表面（立绘分层用）。 */
  stamp(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = src.i(x, y)
        if (src.d[i + 3] < 200) continue
        this.pxRGB(x + dx, y + dy, src.d[i], src.d[i + 1], src.d[i + 2], 1)
      }
    }
  }

  /* --------------------------------------------------------------------------
   * alpha 二值化：< 200 → 0，>= 200 → 255
   * ------------------------------------------------------------------------ */
  binarize() {
    const d = this.d
    let semi = 0
    let up = 0
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i]
      if (a === 0 || a === 255) continue
      semi++
      if (a >= 200) {
        d[i] = 255
        up++
      } else {
        d[i] = 0
      }
    }
    ALPHA_STATS.texels += d.length / 4
    ALPHA_STATS.semiCleared += semi - up
    ALPHA_STATS.semiOpaque += up
    ALPHA_STATS.semiByModule[this.module] = (ALPHA_STATS.semiByModule[this.module] || 0) + semi
    return semi
  }

  /**
   * 输出贴图（统一采样参数 + 二值化 alpha + cleanAlpha 标记）。
   * @param {number} [scale=1] 整数倍放大输出。>1 时用边缘感知的双线性采样生成
   *        更高分辨率的贴图；alpha 仍保持 0/255，不引入半透明脏边。
   */
  tex(scale = 1) {
    const s = Math.max(1, Math.min(4, Math.round(scale) || 1))
    if (s > 1) {
      if (this._texHi && this._texHi.userData.scale === s) return this._texHi
      if (!this.binarized) {
        this.binarize()
        this.binarized = true
      }
      const { w, h, d } = this
      const W = w * s
      const H = h * s
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingEnabled = false
        const img = ctx.createImageData(W, H)
        const out = img && img.data ? img.data : null
        if (out) {
          const alphaAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3])
          for (let oy = 0; oy < H; oy++) {
            // 每个输出像素映射回逻辑像素中心，取 2x2 邻域加权颜色
            const fy = (oy + 0.5) / s - 0.5
            const y0 = Math.floor(fy)
            const ty = fy - y0
            for (let ox = 0; ox < W; ox++) {
              const fx = (ox + 0.5) / s - 0.5
              const x0 = Math.floor(fx)
              const tx = fx - x0
              const ai = (oy * W + ox) * 4
              const near = alphaAt(Math.round(fx), Math.round(fy))
              if (near < 128) {
                out[ai] = 0
                out[ai + 1] = 0
                out[ai + 2] = 0
                out[ai + 3] = 0
                continue
              }
              let r = 0
              let g = 0
              let b = 0
              let wsum = 0
              for (let dy = 0; dy <= 1; dy++) {
                for (let dx = 0; dx <= 1; dx++) {
                  const sx = x0 + dx
                  const sy = y0 + dy
                  if (alphaAt(sx, sy) < 128) continue
                  const wgt = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty)
                  const si = (sy * w + sx) * 4
                  r += d[si] * wgt
                  g += d[si + 1] * wgt
                  b += d[si + 2] * wgt
                  wsum += wgt
                }
              }
              if (wsum <= 0) {
                const si = (Math.round(fy) * w + Math.round(fx)) * 4
                r = d[si]
                g = d[si + 1]
                b = d[si + 2]
              } else {
                r /= wsum
                g /= wsum
                b /= wsum
              }
              // 极轻微的确定性颗粒，避免放大后色块过平
              const n = ((ox * 7 + oy * 13) % 5) - 2
              out[ai] = Math.max(0, Math.min(255, r + n))
              out[ai + 1] = Math.max(0, Math.min(255, g + n))
              out[ai + 2] = Math.max(0, Math.min(255, b + n))
              out[ai + 3] = 255
            }
          }
          ctx.putImageData(img, 0, 0)
        }
      }
      const hi = new THREE.CanvasTexture(canvas)
      hi.magFilter = THREE.LinearFilter
      hi.minFilter = THREE.LinearFilter
      hi.generateMipmaps = false
      hi.colorSpace = THREE.SRGBColorSpace
      hi.wrapS = THREE.ClampToEdgeWrapping
      hi.wrapT = THREE.ClampToEdgeWrapping
      hi.needsUpdate = true
      hi.userData.size = [W, H]
      hi.userData.scale = s
      hi.userData.cleanAlpha = true
      hi.userData.module = this.module
      this._texHi = hi
      ALPHA_STATS.textures++
      return hi
    }
    if (this.binarized && this._tex) return this._tex
    if (!this.binarized) {
      this.binarize()
      this.binarized = true
    }
    const { w, h, d } = this
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      const img = ctx.createImageData(w, h)
      if (img && img.data) {
        img.data.set(d)
        ctx.putImageData(img, 0, 0)
      }
    }
    const t = new THREE.CanvasTexture(canvas)
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.generateMipmaps = false
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = THREE.ClampToEdgeWrapping
    t.wrapT = THREE.ClampToEdgeWrapping
    t.needsUpdate = true
    t.userData.size = [w, h]
    t.userData.scale = 1
    t.userData.cleanAlpha = true
    t.userData.module = this.module
    this._tex = t
    ALPHA_STATS.textures++
    return t
  }
}

/** 字符串 → 32 位稳定种子（FNV-1a）。 */
export function strSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/* ============================================================================
 * 通用零件画笔（多个模块共用，减少重复）
 * ========================================================================== */

/** 带倒角的金属板。 */
export function plate(s, x, y, w, h, t, al = 1) {
  s.rect(x, y, w, h, t.base, al)
  s.rect(x, y, w, 1, t.lite, al)
  s.rect(x, y, 1, h, t.lite, al)
  s.rect(x, y + h - 1, w, 1, t.dark, al)
  s.rect(x + w - 1, y, 1, h, t.dark, al)
}

/** 斜切角板（工业件）。 */
export function chamfer(s, x, y, w, h, t, cut = 2) {
  s.poly(
    [
      [x + cut, y],
      [x + w - 1, y],
      [x + w - 1, y + h - 1 - cut],
      [x + w - 1 - cut, y + h - 1],
      [x, y + h - 1],
      [x, y + cut],
    ],
    t.base,
  )
  s.line(x + cut, y, x + w - 2, y, t.lite)
  s.line(x + 1, y + cut, x + 1, y + h - 2, t.lite)
  s.line(x + 2, y + h - 1, x + w - 2 - cut, y + h - 1, t.dark)
  s.line(x + w - 1, y + 1, x + w - 1, y + h - 1 - cut, t.dark)
  s.line(x + cut - 1, y, x, y + cut - 1, t.dark)
}

/** 铆钉。 */
export function bolt(s, x, y, c = PAL.steelLight, dark = PAL.steelDark) {
  s.px(x, y, c)
  s.px(x + 1, y + 1, dark)
}

/** 散热格栅 / 板缝。 */
export function vent(s, x, y, w, n, c, step = 2) {
  for (let k = 0; k < n; k++) s.rect(x, y + k * step, w, 1, c)
}

/** 多段线缆。 */
export function wire(s, pts, c = PAL.oilSheen, hi = PAL.steelDark) {
  for (let k = 0; k + 1 < pts.length; k++) s.thick(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0.9, c)
  for (let k = 0; k + 1 < pts.length; k++) s.line(pts[k][0], pts[k][1] - 1, pts[k + 1][0], pts[k + 1][1] - 1, hi, 0.7)
}

/** 液压杆。 */
export function piston(s, x0, y0, x1, y1, tone) {
  s.thick(x0, y0, x1, y1, 1.6, tone.dark)
  const mx = x0 + (x1 - x0) * 0.55
  const my = y0 + (y1 - y0) * 0.55
  s.thick(x0, y0, mx, my, 2.1, tone.base)
  s.thick(mx, my, x1, y1, 1.2, tone.lite)
}

/** 确定性锈蚀 / 划痕 / 积尘（只落在已有像素上）。 */
export function weather(s, seed, opt = {}) {
  const rnd = mulberry32(seed >>> 0)
  const rust = opt.rust ?? 20
  for (let k = 0; k < rust; k++) {
    const x = Math.floor(rnd() * s.w)
    const y = Math.floor(rnd() * s.h)
    if (s.a(x, y) < 200) continue
    s.set(x, y, rnd() < 0.55 ? PAL.rustDark : PAL.rust, 1)
    if (rnd() < 0.45) s.px(x + 1, y, PAL.rustDark, 1)
    if (rnd() < 0.25) s.px(x, y + 1, PAL.rust, 1)
  }
  const scr = opt.scratch ?? 6
  for (let k = 0; k < scr; k++) {
    const x = Math.floor(rnd() * s.w)
    const y = Math.floor(rnd() * s.h)
    if (s.a(x, y) < 200) continue
    const len = 2 + Math.floor(rnd() * 4)
    const down = rnd() < 0.5 ? 1 : -1
    for (let i = 0; i < len; i++) {
      if (s.a(x + i, y + i * down) < 200) break
      s.px(x + i, y + i * down, PAL.steelWhite, 0.55)
    }
  }
  if (opt.dirt !== false) {
    const gy = s.h - 1
    for (let k = 0; k < (opt.dirtN ?? 18); k++) {
      const x = Math.floor(rnd() * s.w)
      const y = gy - Math.floor(rnd() * rnd() * 8)
      if (s.a(x, y) < 200) continue
      s.px(x, y, PAL.dust, 0.5 + rnd() * 0.4)
    }
  }
}

/** 火花（受击 / 短路）。 */
export function sparks(s, x, y, n, seed, c = PAL.neonWarm) {
  const rnd = mulberry32(seed >>> 0)
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU
    const d = 1 + rnd() * 5
    s.px(x + Math.cos(a) * d, y + Math.sin(a) * d, c, 0.85)
  }
}

