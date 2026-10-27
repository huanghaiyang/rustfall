// ============================================================================
// 锈雨 · RUSTFALL —— VFX 像素特效（Canvas2D → THREE.CanvasTexture）
//
// 全部程序化；随机来自 render/rng.js（mulberry32 / hash2）。
// 统一：NearestFilter（mag/min）、generateMipmaps=false、SRGBColorSpace、
//      needsUpdate=true、默认 ClampToEdgeWrapping（激光束横向可平铺）。
// 帧序列按 getter 缓存：同一 getter 永远返回同一个数组 / 同一批贴图实例。
//
// 尺寸：
//   impact 32×32 ×5   · blood 24×24 ×5   · acid 32×32 ×5
//   laser  64×8       · explosion 64×64 ×7 · smoke 48×48 ×6
//   muzzle 24×24      · digDebris 12×12 ×4 · shockwave 128×64
//   scanPulse 128×128 · signalRing 96×96  · ember 8×8 ×4
//
// 颜色约定：火焰=rustHot/neonWarm/bone；油血=oil/blood/bloodDark（亮红漆用 danger
// 点缀保证暗底可读）；酸液=toxic/toxicGlow/acid；机械火花=steelWhite/steelLight。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32, hash2 } from '../../render/rng.js'

const TAU = Math.PI * 2

/* ============================================================================
 * 1. 颜色 / 纹理 / 像素原语
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

function makeTex(w, h, draw, opts = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    draw(ctx, w, h)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  const base = opts.wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.wrapS = opts.wrapS === 'repeat' ? THREE.RepeatWrapping : opts.wrapS === 'clamp' ? THREE.ClampToEdgeWrapping : base
  tex.wrapT = opts.wrapT === 'repeat' ? THREE.RepeatWrapping : opts.wrapT === 'clamp' ? THREE.ClampToEdgeWrapping : base
  tex.needsUpdate = true
  if (opts.anchor) tex.userData.anchor = opts.anchor
  tex.userData.size = [w, h]
  return tex
}

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
  const steps = Math.max(12, Math.ceil(Math.abs(a1 - a0) * r * 1.8))
  for (let i = 0; i <= steps; i++) {
    if (dash > 0 && i % dash === 0) continue
    const a = a0 + ((a1 - a0) * i) / steps
    rect(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, thick, thick, color)
  }
}

function fillFrames(count, w, h, draw, opts = {}) {
  const out = new Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = makeTex(w, h, (ctx) => draw(ctx, i), opts)
  }
  return out
}

/* ============================================================================
 * 2. 近战撞击 / 金属火花（32×32 ×5）
 * ========================================================================== */

let impactCache = null

function drawImpact(ctx, frame) {
  const S = 32
  const cx = 16
  const cy = 16
  const rng = mulberry32(0x1701 + frame * 977)
  const t = frame / 4

  // 中心核
  const coreR = [2.6, 3.4, 2.6, 1.5, 0.7][frame]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > coreR + 0.7) continue
      const c = d < coreR * 0.5 ? PAL.white : d < coreR * 0.85 ? PAL.bone : PAL.neonWarm
      rect(ctx, x, y, 1, 1, rgba(c, d > coreR * 0.85 ? 0.7 : 1))
    }
  }

  // 冲击尘环
  const ringR = 5.5 + frame * 2.6
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + frame * 0.13
    const jitter = (hash2(i, frame, 0x31) - 0.5) * 2
    const r = ringR + jitter
    pix(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, rgba(PAL.dustLight, 0.28 * (1 - t * 0.55)))
  }

  // 放射火花
  const rays = [11, 13, 12, 9, 6][frame]
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + rng() * 0.32
    const len = [6, 10, 14, 17, 19][frame] * (0.65 + rng() * 0.6)
    const steps = Math.max(2, Math.round(len * 1.4))
    for (let s = 1; s <= steps; s++) {
      const f = s / steps
      const r = coreR + f * len
      const al = (1 - f) * (1 - t * 0.32) * 0.95
      if (al < 0.05) continue
      const c = f < 0.35 ? PAL.white : f < 0.68 ? PAL.neonWarm : PAL.rustLight
      rect(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, rgba(c, al))
    }
  }

  // 金属碎屑
  const shards = [0, 4, 5, 3, 1][frame]
  for (let i = 0; i < shards; i++) {
    const a = rng() * TAU
    const r = 5 + rng() * (8 + frame * 2)
    const x = Math.round(cx + Math.cos(a) * r)
    const y = Math.round(cy + Math.sin(a) * r)
    const c = i % 2 === 0 ? PAL.steelLight : PAL.steelWhite
    const al = 0.85 - t * 0.35
    if (rng() < 0.5) rect(ctx, x, y, 2, 1, rgba(c, al))
    else rect(ctx, x, y, 1, 2, rgba(c, al))
  }

  // 余烬
  const embers = 10 - frame * 2
  for (let i = 0; i < embers; i++) {
    const a = rng() * TAU
    const r = 4 + rng() * 11
    pix(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, rgba(PAL.rustHot, 0.28))
  }
}

export function getImpactFrames() {
  if (impactCache) return impactCache
  impactCache = fillFrames(5, 32, 32, drawImpact, { wrap: 'clamp', anchor: 'center' })
  return impactCache
}

/* ============================================================================
 * 3. 机油 / 暗红漆飞溅（24×24 ×5）
 * ========================================================================== */

let bloodCache = null

function drawBlood(ctx, frame) {
  const S = 24
  const cx = 12
  const cy = 12
  const rng = mulberry32(0xb100 + frame * 331)
  const t = frame / 4
  const blobR = [5.4, 5.2, 4.2, 3, 1.8][frame]

  // 主油血团：暗红核心 + 机油外圈
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      const edge = blobR * (0.72 + hash2(x, y, 0x51) * 0.6)
      if (d > edge) continue
      let c
      if (d < blobR * 0.45) c = PAL.blood
      else if (d < blobR * 0.75) c = PAL.bloodDark
      else c = PAL.oil
      if (hash2(x, y, 0x53) > 0.8) c = PAL.danger
      if (hash2(x, y, 0x54) > 0.94) c = PAL.oilSheen
      rect(ctx, x, y, 1, 1, rgba(c, 0.95))
    }
  }

  // 红漆喷溅（受重力下坠）
  const drops = 18 + frame * 3
  for (let i = 0; i < drops; i++) {
    const a = (i / drops) * TAU + rng() * 0.55
    const dist = blobR * 0.7 + rng() * 3.5 + frame * (1.5 + rng() * 1.2)
    const x = cx + Math.cos(a) * dist
    const y = cy + Math.sin(a) * dist + frame * 0.7
    if (x < 0 || y < 0 || x >= S || y >= S) continue
    const size = rng() < 0.32 ? 2 : 1
    const pick = rng()
    const c = pick < 0.34 ? PAL.danger : pick < 0.78 ? PAL.blood : PAL.bloodDark
    rect(ctx, x, y, size, size, rgba(c, 0.95 - t * 0.35))
    if (rng() < 0.55) pix(ctx, x - Math.cos(a) * 1.6, y - Math.sin(a) * 1.6, rgba(PAL.bloodDark, 0.4))
  }

  // 油光
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU
    const d = 1.5 + rng() * (2 + frame)
    pix(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rgba(PAL.oilSheen, 0.5 - t * 0.2))
  }

  // 后期地面残渍
  if (frame >= 3) {
    const rx = 6 + (frame - 3) * 1.5
    for (let y = 14; y < 22; y++) {
      for (let x = 1; x < 23; x++) {
        const ddx = (x + 0.5 - cx) / rx
        const ddy = (y + 0.5 - 17.5) / 2.6
        if (ddx * ddx + ddy * ddy > 1) continue
        if (hash2(x, y, 0x55) < 0.45) continue
        rect(ctx, x, y, 1, 1, rgba(hash2(x, y, 0x56) > 0.7 ? PAL.blood : PAL.bloodDark, 0.5))
      }
    }
  }
}

export function getBloodFrames() {
  if (bloodCache) return bloodCache
  bloodCache = fillFrames(5, 24, 24, drawBlood, { wrap: 'clamp', anchor: 'center' })
  return bloodCache
}

/* ============================================================================
 * 4. 酸液飞溅（32×32 ×5）
 * ========================================================================== */

let acidCache = null

function drawAcid(ctx, frame) {
  const S = 32
  const cx = 16
  const cy = 16
  const rng = mulberry32(0xac1d + frame * 719)
  const t = frame / 4
  const blobR = [4.8, 5.8, 4.8, 3.4, 2.2][frame]

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      const edge = blobR * (0.72 + hash2(x, y, 0x61) * 0.58)
      if (d > edge) continue
      let c =
        d < blobR * 0.3
          ? PAL.toxicGlow
          : d < blobR * 0.62
            ? PAL.acid
            : d < blobR * 0.85
              ? PAL.toxic
              : PAL.toxicDark
      if (hash2(x, y, 0x62) > 0.9) c = PAL.toxicGlow
      rect(ctx, x, y, 1, 1, rgba(c, 0.92 - t * 0.18))
    }
  }

  // 酸滴（受重力）
  const drops = 18 + frame * 3
  for (let i = 0; i < drops; i++) {
    const a = (i / drops) * TAU + rng() * 0.55
    const dist = blobR * 0.8 + rng() * 3.5 + frame * (1.4 + rng() * 1.1)
    const x = cx + Math.cos(a) * dist
    const y = cy + Math.sin(a) * dist + frame * 1.1
    if (x < 0 || y < 0 || x >= S || y >= S) continue
    const size = rng() < 0.3 ? 2 : 1
    const c = rng() < 0.35 ? PAL.toxicGlow : rng() < 0.72 ? PAL.acid : PAL.toxic
    rect(ctx, x, y, size, size, rgba(c, 0.9 - t * 0.32))
    if (rng() < 0.4) pix(ctx, x, y - 1.8, rgba(PAL.toxicDark, 0.5))
  }

  // 气泡
  const bubbles = [3, 5, 4, 2, 1][frame]
  for (let i = 0; i < bubbles; i++) {
    const a = rng() * TAU
    const d = 1.5 + rng() * blobR * 0.8
    const bx = Math.round(cx + Math.cos(a) * d)
    const by = Math.round(cy + Math.sin(a) * d)
    pix(ctx, bx, by - 1, rgba(PAL.toxicGlow, 0.8))
    pix(ctx, bx - 1, by, rgba(PAL.toxicGlow, 0.55))
    pix(ctx, bx + 1, by, rgba(PAL.toxicGlow, 0.55))
  }

  // 地面酸洼
  if (frame >= 2) {
    const rx = 7 + frame * 2.2
    const ry = 2 + (frame - 2) * 0.6
    for (let y = 17; y < 27; y++) {
      for (let x = 1; x < 31; x++) {
        const ddx = (x + 0.5 - cx) / rx
        const ddy = (y + 0.5 - 23) / ry
        if (ddx * ddx + ddy * ddy > 1) continue
        if (hash2(x, y, 0x63) < 0.35) continue
        rect(ctx, x, y, 1, 1, rgba(PAL.toxicDark, 0.5))
        if (hash2(x, y, 0x64) > 0.9) pix(ctx, x, y - 1, rgba(PAL.acid, 0.45))
      }
    }
  }
}

export function getAcidFrames() {
  if (acidCache) return acidCache
  acidCache = fillFrames(5, 32, 32, drawAcid, { wrap: 'clamp', anchor: 'center' })
  return acidCache
}

/* ============================================================================
 * 5. 激光束（64×8，横向可平铺）
 * ========================================================================== */

let laserCache = null

export function getLaserBeam() {
  if (laserCache) return laserCache
  laserCache = makeTex(
    64,
    8,
    (ctx, W, H) => {
      for (let x = 0; x < W; x++) {
        const pulse = 0.65 + 0.35 * Math.sin((x / W) * TAU * 4)
        const dash = x % 8 < 6
        const core = mix(PAL.neonRed, PAL.white, 0.72)
        // 逐行光带：中心最亮、两侧衰减
        rect(ctx, x, 0, 1, 1, rgba(PAL.neonRed, 0.05))
        rect(ctx, x, 1, 1, 1, rgba(PAL.neonRed, 0.14 + pulse * 0.08))
        rect(ctx, x, 2, 1, 1, rgba(PAL.neonRed, 0.4 + pulse * 0.08))
        rect(ctx, x, 3, 1, 1, rgba(mix(PAL.neonRed, PAL.white, 0.4), dash ? 0.82 : 0.46))
        rect(ctx, x, 4, 1, 1, rgba(dash ? PAL.white : core, dash ? 1 : 0.72))
        rect(ctx, x, 5, 1, 1, rgba(PAL.neonRed, 0.55 + pulse * 0.1))
        rect(ctx, x, 6, 1, 1, rgba(PAL.neonRed, 0.18))
        rect(ctx, x, 7, 1, 1, rgba(PAL.neonRed, 0.06))
        // 周期性脉冲热点（周期 16 整除 64 → 无缝）
        if (x % 16 === 4) {
          pix(ctx, x, 2, rgba(PAL.white, 0.65))
          pix(ctx, x, 5, rgba(PAL.neonWarm, 0.5))
        }
        if (x % 16 === 12) {
          pix(ctx, x, 3, rgba(PAL.neonWarm, 0.4))
          pix(ctx, x, 4, rgba(PAL.neonWarm, 0.35))
        }
      }
    },
    { wrapS: 'repeat', wrapT: 'clamp', anchor: 'stretch-x' },
  )
  return laserCache
}

/* ============================================================================
 * 6. 爆炸（64×64 ×7）
 * ========================================================================== */

let explosionCache = null

function drawExplosion(ctx, frame) {
  const S = 64
  const cx = 32
  const cy = 32
  const rng = mulberry32(0x7e11 + frame * 613)
  const t = frame / 6
  const R = [8, 13, 18, 23, 27, 29, 30][frame]
  const smokeR = [0, 10, 18, 27, 35, 43, 50][frame]
  const fireAlpha = [1, 1, 1, 0.95, 0.82, 0.58, 0.34][frame]
  const embers = [0, 6, 10, 12, 10, 7, 4][frame]

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      const n = hash2(x, y, 0x71)
      const edge = R * (0.8 + n * 0.3)
      if (d <= edge) {
        const f = d / edge
        let c
        if (f < 0.17) c = PAL.white
        else if (f < 0.33) c = PAL.bone
        else if (f < 0.5) c = PAL.neonWarm
        else if (f < 0.66) c = PAL.rustHot
        else if (f < 0.8) c = PAL.rustLight
        else c = PAL.rust
        let a = fireAlpha
        if (frame >= 4) {
          a *= 1 - f * 0.45
          if (f > 0.62 && hash2(x, y, 0x72) < 0.45) continue
        }
        if (frame >= 5 && f > 0.4 && hash2(x, y, 0x75) < 0.5) continue
        rect(ctx, x, y, 1, 1, rgba(c, a))
      }
      if (frame >= 2 && smokeR > edge && d > edge * 0.82 && d < smokeR) {
        const outer = Math.max(1, smokeR - edge * 0.82)
        const fa = 1 - (d - edge * 0.82) / outer
        if (fa <= 0 || hash2(x, y, 0x73) < 0.28) continue
        const sc = mix(PAL.ash, PAL.steelDark, hash2(x, y, 0x74))
        rect(ctx, x, y, 1, 1, rgba(sc, [0, 0, 0.08, 0.15, 0.22, 0.28, 0.34][frame] * fa))
      }
    }
  }

  // 冲击亮环
  if (frame >= 1 && frame <= 3) {
    const rr = R * 1.02
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU
      if (hash2(i, frame, 0x76) < 0.25) continue
      pix(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rgba(PAL.bone, 0.45 - frame * 0.08))
    }
  }
  // 火花
  for (let i = 0; i < embers; i++) {
    const a = rng() * TAU
    const dd = R + 4 + rng() * 12
    pix(ctx, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, rgba(i % 3 === 0 ? PAL.white : PAL.neonWarm, 0.8 - t * 0.55))
  }
  // 核心余烬
  if (frame <= 3) {
    for (let i = 0; i < 7; i++) {
      const a = rng() * TAU
      const dd = rng() * R * 0.45
      pix(ctx, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, rgba(PAL.white, 0.55))
    }
  }
}

export function getExplosionFrames() {
  if (explosionCache) return explosionCache
  explosionCache = fillFrames(7, 64, 64, drawExplosion, { wrap: 'clamp', anchor: 'center' })
  return explosionCache
}

/* ============================================================================
 * 7. 烟团（48×48 ×6）
 * ========================================================================== */

let puffCache = null

function drawPuff(ctx, frame) {
  const S = 48
  const cx = 24
  const rng = mulberry32(0x5e33 + frame * 277)
  const t = frame / 5
  const baseR = [8, 11, 14, 17, 19, 21][frame]
  const alpha = [0.92, 0.82, 0.72, 0.6, 0.46, 0.3][frame]

  const blobs = []
  for (let i = 0; i < 5; i++) {
    blobs.push({
      x: cx + (rng() - 0.5) * (6 + frame * 2) + Math.sin(frame * 0.9 + i) * 2,
      y: cx + 1 - frame * 1.8 + (rng() - 0.5) * (6 + frame),
      r: baseR * (0.5 + rng() * 0.6),
      c: rng(),
    })
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let cov = 0
      for (const b of blobs) {
        const d = Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y)
        cov = Math.max(cov, 1 - d / b.r)
      }
      if (cov <= 0) continue
      if (hash2(x, y, 0x81) > cov * 1.05 + 0.04) continue
      const shade = hash2(x, y, 0x82)
      let c
      if (cov > 0.68) c = shade > 0.32 ? PAL.steelLight : PAL.ashPale
      else if (cov > 0.4) c = shade > 0.28 ? PAL.ashPale : PAL.ashLight
      else c = shade > 0.45 ? PAL.ashPale : PAL.ash
      rect(ctx, x, y, 1, 1, rgba(c, Math.min(0.95, alpha * (0.55 + cov * 0.62))))
    }
  }
  // 底部更浓 + 顶部受光
  for (let i = 0; i < 24; i++) {
    const x = 12 + Math.floor(rng() * 24)
    const y = 28 + Math.floor(rng() * 12)
    pix(ctx, x, y, rgba(PAL.ashPale, 0.2 - t * 0.02))
  }
  for (let i = 0; i < 10; i++) {
    const x = 14 + Math.floor(rng() * 20)
    const y = 6 + Math.floor(rng() * 10)
    pix(ctx, x, y, rgba(PAL.steelLight, 0.24))
  }
}

export function getSmokePuffFrames() {
  if (puffCache) return puffCache
  puffCache = fillFrames(6, 48, 48, drawPuff, { wrap: 'clamp', anchor: 'center' })
  return puffCache
}

/* ============================================================================
 * 8. 枪口闪光（24×24）
 * ========================================================================== */

let muzzleCache = null

export function getMuzzleFlash() {
  if (muzzleCache) return muzzleCache
  muzzleCache = makeTex(
    24,
    24,
    (ctx) => {
      const cx = 12
      const cy = 12
      const rng = mulberry32(0xf1a5)

      // 外层暖光
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
          if (d > 10) continue
          if (d > 6 && hash2(x, y, 0x91) > 0.55) continue
          const al = d < 5 ? 0.5 : 0.22 * (1 - (d - 5) / 5)
          rect(ctx, x, y, 1, 1, rgba(PAL.rustHot, al))
        }
      }
      // 星芒
      const rays = 8
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU + 0.18
        const len = 6 + (i % 2 === 0 ? 5 : 2) + rng() * 2
        const thick = i % 2 === 0 ? 2 : 1
        line(ctx, cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, cx + Math.cos(a) * len, cy + Math.sin(a) * len, rgba(PAL.neonWarm, 0.6), thick)
        line(ctx, cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, cx + Math.cos(a) * (len - 3), cy + Math.sin(a) * (len - 3), rgba(PAL.white, 0.7), 1)
      }
      // 核心
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
          if (d <= 2.6) rect(ctx, x, y, 1, 1, PAL.white)
          else if (d <= 4) rect(ctx, x, y, 1, 1, rgba(PAL.neonWarm, 0.9))
        }
      }
      // 火星
      for (let i = 0; i < 8; i++) {
        const a = rng() * TAU
        const d = 6 + rng() * 6
        pix(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rgba(PAL.bone, 0.75))
      }
    },
    { wrap: 'clamp', anchor: 'center' },
  )
  return muzzleCache
}

/* ============================================================================
 * 9. 挖掘碎石（12×12 ×4）
 * ========================================================================== */

let digCache = null

function drawDig(ctx, frame) {
  const rng = mulberry32(0xd16 + frame * 97)
  // 每帧碎石位置（向外抛洒 + 下落）
  const chunks = [
    { x: 1 - frame * 0.8, y: 10 - frame * 2.2, w: 3, h: 2, c: PAL.dust, hi: PAL.sand },
    { x: 5 + frame * 0.4, y: 9 - frame * 2.6, w: 2, h: 2, c: PAL.dustLight, hi: PAL.sand },
    { x: 8 + frame * 0.9, y: 7 + frame * 0.7, w: 2, h: 2, c: PAL.ochre, hi: PAL.rustLight },
    { x: 3 + frame * 1.3, y: 5 + frame * 1.5, w: 2, h: 1, c: PAL.rustDark, hi: PAL.dustLight },
  ]
  const fade = 1 - frame * 0.2
  for (const c of chunks) {
    const x = Math.round(c.x)
    const y = Math.round(c.y)
    rect(ctx, x, y, c.w, c.h, rgba(c.c, 0.9 * fade))
    pix(ctx, x, y, rgba(c.hi, 0.95 * fade))
    if (rng() < 0.5) pix(ctx, x + c.w, y + 1, rgba(PAL.dust, 0.5 * fade))
  }
  // 尘土尾迹
  for (let i = 0; i < 3; i++) {
    pix(ctx, Math.round(2 + rng() * 8), Math.round(10 + rng() * 2), rgba(PAL.dust, 0.3 * fade))
  }
}

export function getDigDebris() {
  if (digCache) return digCache
  digCache = fillFrames(4, 12, 12, drawDig, { wrap: 'clamp', anchor: 'center' })
  return digCache
}

/* ============================================================================
 * 10. 地面冲击波（128×64）
 * ========================================================================== */

let shockCache = null

export function getShockwave() {
  if (shockCache) return shockCache
  shockCache = makeTex(
    128,
    64,
    (ctx, W, H) => {
      const cx = 64
      const cy = 50
      const rx = 54
      const ry = 12
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = (x + 0.5 - cx) / rx
          const dy = (y + 0.5 - cy) / ry
          const d = Math.hypot(dx, dy)
          const n = hash2(x, y, 0xa1)
          const ring = Math.abs(d - 1)
          if (ring < 0.22) {
            const k = 1 - ring / 0.22
            if (n < 0.02 + (1 - k) * 0.18) continue
            const above = y < cy
            const base = above ? mix(PAL.dustLight, PAL.sand, 0.35) : n > 0.35 ? PAL.sand : PAL.dustLight
            rect(ctx, x, y, 1, 1, rgba(base, (above ? 0.85 : 1) * k))
            if (!above && k > 0.6 && n > 0.7) pix(ctx, x, y, rgba(PAL.bone, 0.85))
          } else if (Math.abs(d - 0.78) < 0.08 && n > 0.5) {
            rect(ctx, x, y, 1, 1, rgba(PAL.dust, 0.35))
          } else if (d < 1 && y < cy + 6 && n > 0.62) {
            rect(ctx, x, y, 1, 1, rgba(mix(PAL.dust, PAL.dustLight, n), 0.13))
          }
          // 地面尘带
          if (y > cy - 2 && y < cy + 12 && d < 1.25 && n > 0.35) {
            rect(ctx, x, y, 1, 1, rgba(PAL.dustLight, 0.3 * (1 - (y - cy + 2) / 14)))
          }
        }
      }
      // 顶部连续亮弧
      for (let i = 0; i <= 84; i++) {
        const a = Math.PI + (i / 84) * Math.PI
        const px = cx + Math.cos(a) * rx
        const py = cy + Math.sin(a) * ry
        pix(ctx, px, py, rgba(PAL.bone, 0.55))
        pix(ctx, px, py - 1, rgba(PAL.sand, 0.4))
      }
      // 前缘亮点
      for (let i = 0; i < 7; i++) {
        const k = i / 6
        pix(ctx, cx - rx * (1 - k * 0.5), cy - 1 - k, rgba(PAL.bone, 0.95 * (1 - k * 0.6)))
        pix(ctx, cx + rx * (1 - k * 0.5), cy - 1 - k, rgba(PAL.bone, 0.95 * (1 - k * 0.6)))
      }
      // 上升尘丝
      for (let i = 0; i < 18; i++) {
        const x = cx + (i % 2 === 0 ? -1 : 1) * (6 + i * 3)
        for (let k = 0; k < 5; k++) {
          pix(ctx, x + (k % 2), cy - 3 - k * 2, rgba(PAL.dust, 0.3 - k * 0.05))
        }
      }
      // 飞散碎石
      for (let i = 0; i < 12; i++) {
        const x = cx + (i % 2 === 0 ? -1 : 1) * (28 + ((i * 7) % 32))
        const y = cy - 4 - ((i * 3) % 14)
        rect(ctx, x, y, 2, 1, rgba(PAL.dustLight, 0.5))
      }
      // 地面线
      rect(ctx, 6, cy + 5, 116, 1, rgba(PAL.boneDeep, 0.45))
      rect(ctx, 10, cy + 6, 108, 1, rgba(PAL.dust, 0.3))
    },
    { wrap: 'clamp', anchor: 'bottom-center' },
  )
  return shockCache
}

/* ============================================================================
 * 11. 扫描环（128×128）
 * ========================================================================== */

let scanCache = null

export function getScanPulse() {
  if (scanCache) return scanCache
  scanCache = makeTex(
    128,
    128,
    (ctx, W, H) => {
      const cx = 64
      const cy = 64
      const ringR = 48
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x + 0.5 - cx
          const dy = y + 0.5 - cy
          const d = Math.hypot(dx, dy)
          const a = Math.atan2(dy, dx)
          // 主扫描环（带缺口）
          const ring = Math.abs(d - ringR)
          if (ring < 1.35) {
            const seg = Math.floor(((a + Math.PI) / TAU) * 24)
            if (seg % 7 !== 0) {
              const k = 1 - ring / 1.35
              rect(ctx, x, y, 1, 1, rgba(PAL.neon, 0.55 + k * 0.45))
              if (ring < 0.5) pix(ctx, x, y, rgba(PAL.white, 0.75))
            }
          } else if (d > ringR - 9 && d < ringR) {
            // 内侧辉光
            const k = (d - (ringR - 9)) / 9
            if (hash2(x, y, 0xb1) > 0.55) rect(ctx, x, y, 1, 1, rgba(PAL.neon, 0.1 * k))
          } else if (d > ringR && d < ringR + 9) {
            // 外侧辉光
            const k = 1 - (d - ringR) / 9
            if (hash2(x, y, 0xb2) > 0.5) rect(ctx, x, y, 1, 1, rgba(PAL.neonCold, 0.1 * k))
          }
          // 内环（虚线）
          if (Math.abs(d - 39) < 0.8) {
            const seg = Math.floor(((a + Math.PI) / TAU) * 16)
            if (seg % 3 === 0) rect(ctx, x, y, 1, 1, rgba(PAL.signal, 0.5))
          }
          // 十字准线
          if (Math.abs(dx) < 0.6 && Math.abs(dy) < 12) rect(ctx, x, y, 1, 1, rgba(PAL.glass, 0.35))
          if (Math.abs(dy) < 0.6 && Math.abs(dx) < 12) rect(ctx, x, y, 1, 1, rgba(PAL.glass, 0.35))
        }
      }
      // 四个刻度
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        line(
          ctx,
          cx + Math.cos(a) * 53,
          cy + Math.sin(a) * 53,
          cx + Math.cos(a) * 58,
          cy + Math.sin(a) * 58,
          rgba(PAL.neonWarm, 0.8),
          1,
        )
      }
      // 中心点
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
          if (d <= 1.8) rect(ctx, x, y, 1, 1, PAL.white)
          else if (d <= 2.8) rect(ctx, x, y, 1, 1, rgba(PAL.neon, 0.7))
        }
      }
    },
    { wrap: 'clamp', anchor: 'center' },
  )
  return scanCache
}

/* ============================================================================
 * 12. 信号波纹（96×96，从底部发射器扩散）
 * ========================================================================== */

let signalCache = null

export function getSignalRing() {
  if (signalCache) return signalCache
  signalCache = makeTex(
    96,
    96,
    (ctx, W, H) => {
      const cx = 48
      const cy = 72
      const radii = [16, 28, 40]
      const alphas = [0.85, 0.5, 0.3]
      for (let i = 0; i < radii.length; i++) {
        const r = radii[i]
        const a0 = -Math.PI * 0.92
        const a1 = -Math.PI * 0.08
        arc(ctx, cx, cy, r, a0, a1, rgba(PAL.signal, alphas[i]), 1, 3 + i)
        arc(ctx, cx, cy, r + 1.5, a0 + 0.06, a1 - 0.06, rgba(PAL.neonCold, alphas[i] * 0.55), 1, 4 + i)
        // 波纹上的信号点
        for (let k = 0; k < 3; k++) {
          const ang = a0 + ((a1 - a0) * (k + 0.5)) / 3
          pix(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, rgba(PAL.neon, alphas[i]))
        }
      }
      // 发射器基座
      rect(ctx, 39, 82, 18, 3, PAL.black)
      rect(ctx, 40, 80, 16, 3, PAL.steelDark)
      rect(ctx, 40, 80, 16, 1, PAL.steelLight)
      rect(ctx, 47, 70, 2, 11, PAL.steel)
      rect(ctx, 47, 70, 1, 11, PAL.steelWhite)
      // 顶部信号头
      rect(ctx, 46, 66, 4, 4, PAL.black)
      rect(ctx, 47, 67, 2, 2, PAL.neon)
      pix(ctx, 47, 66, PAL.white)
      // 地面反光
      rect(ctx, 30, 87, 36, 1, rgba(PAL.steelDark, 0.8))
      for (let x = 34; x < 62; x += 4) pix(ctx, x, 86, rgba(PAL.signal, 0.15))
    },
    { wrap: 'clamp', anchor: 'bottom-center' },
  )
  return signalCache
}

/* ============================================================================
 * 13. 火星（8×8 ×4）
 * ========================================================================== */

let emberCache = null

function drawEmber(ctx, frame) {
  if (frame === 0) {
    rect(ctx, 3, 3, 3, 2, rgba(PAL.neonWarm, 0.95))
    pix(ctx, 3, 3, PAL.white)
    pix(ctx, 4, 3, PAL.bone)
    pix(ctx, 2, 4, rgba(PAL.rustHot, 0.7))
    pix(ctx, 6, 4, rgba(PAL.rustHot, 0.55))
    pix(ctx, 3, 5, rgba(PAL.rustLight, 0.4))
  } else if (frame === 1) {
    rect(ctx, 4, 2, 2, 3, rgba(PAL.neonWarm, 0.9))
    pix(ctx, 4, 2, PAL.white)
    pix(ctx, 5, 3, PAL.rustHot)
    pix(ctx, 6, 4, rgba(PAL.rustHot, 0.5))
    pix(ctx, 3, 5, rgba(PAL.rustLight, 0.45))
    pix(ctx, 4, 6, rgba(PAL.rustDark, 0.4))
  } else if (frame === 2) {
    pix(ctx, 4, 4, PAL.bone)
    pix(ctx, 4, 5, PAL.neonWarm)
    pix(ctx, 5, 4, rgba(PAL.neonWarm, 0.8))
    pix(ctx, 3, 5, rgba(PAL.rustHot, 0.6))
    pix(ctx, 5, 6, rgba(PAL.rustLight, 0.4))
    pix(ctx, 4, 6, rgba(PAL.rustHot, 0.35))
  } else {
    pix(ctx, 4, 6, rgba(PAL.rustLight, 0.7))
    pix(ctx, 5, 6, rgba(PAL.rustHot, 0.45))
    pix(ctx, 3, 7, rgba(PAL.rustDark, 0.5))
    pix(ctx, 5, 5, rgba(PAL.rustDark, 0.35))
  }
  // 外层微弱辉光
  if (frame < 3) {
    pix(ctx, 2, 2, rgba(PAL.rustHot, 0.25))
    pix(ctx, 6, 2, rgba(PAL.rustHot, 0.16))
    pix(ctx, 2, 6, rgba(PAL.rustLight, 0.14))
  }
}

export function getEmberFrames() {
  if (emberCache) return emberCache
  emberCache = fillFrames(4, 8, 8, drawEmber, { wrap: 'clamp', anchor: 'center' })
  return emberCache
}
