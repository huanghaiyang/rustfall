// ============================================================================
// 锈雨 · RUSTFALL —— 主题房间「全景立绘」背景（backdrops）
// ----------------------------------------------------------------------------
// 对外契约：
//   getThemeBackdrop(themeId) -> THREE.CanvasTexture | null
//     1280×560；S=Repeat / T=Clamp（与 getBiomeArt 的 far/mid/near 一致）。
//
// 约定：
//   · 每张图按 themeId 懒构建 + 缓存，绝不在每帧重建。
//   · 调色只从 palette.js 混出，主色 = theme.accent；整体压暗，让前景角色可读。
//   · 不出现大块纯色矩形：天空分 6 条抖动画带，远景 2 层剪影，地标带窗格 /
//     砖缝 / 铆钉 / 锈斑，地面有层理、砖缝、碎石、草簇，最后压一层抖动雾。
//   · 所有像素 alpha 都为 1（Surf 二值化后仍是 255），不会透出脏边。
//   · 主题 id 全量落在 FAMILY_BY_ID + LANDMARKS 里，family 只做兜底。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { Surf, mix, strSeed, mulberry32, bayerAt, setArtModule } from './core.js'
import { hash2 } from '../rng.js'
import { getTheme } from '../../world/themes.js'
import { getRoomScene } from '../../world/scene-data.js'

setArtModule('backdrops')

const W = 1280
const H = 560
const BASE = 438 // 地标脚线（地面从 430/442 起绘制，会盖住脚部）
const CACHE = new Map()

/* ============================================================================
 * 1. 主题 → family（51 个 id 全部显式列出）
 *    有 theme.family 的沿用 themes.js；frontier 21 个没有 family，在此补齐。
 * ========================================================================== */
const FAMILY_BY_ID = {
  // —— frontier（themes.js 未写 family）——
  data_center: 'tech',
  robot_factory: 'industrial',
  spaceport: 'science',
  solar_center: 'science',
  dam: 'sea',
  bridge: 'city',
  highway: 'city',
  skyscraper: 'city',
  stadium: 'city',
  battlefield: 'military',
  rescue_center: 'civic',
  robot_rally: 'industrial',
  storm_farm: 'nature',
  acid_basin: 'wasteland',
  rot_jungle: 'nature',
  church: 'gothic',
  ai_origin: 'tech',
  virus_lab: 'science',
  ai_lab: 'tech',
  alien_center: 'science',
  military_base: 'military',
  // —— 锈土旧城 ——
  library: 'civic',
  school: 'civic',
  university: 'civic',
  paper_mill: 'industrial',
  archaeological_site: 'ancient',
  prison: 'civic',
  hotel: 'horror',
  dock: 'harbor',
  lighthouse: 'harbor',
  shipyard: 'harbor',
  drydock: 'harbor',
  substation: 'industrial',
  // —— 地底深井 ——
  bunker: 'military',
  coal_mine: 'industrial',
  thermal_plant: 'industrial',
  nuclear_plant: 'industrial',
  radiation_zone: 'wasteland',
  arsenal: 'military',
  punk_mech: 'punk',
  shadow_labyrinth: 'punk',
  chaos_castle: 'gothic',
  vampire_lair: 'gothic',
  // —— 雾海禁区 ——
  gravity_anomaly: 'anomaly',
  dense_fog: 'mist',
  howling_strait: 'harbor',
  abyss_swamp: 'nature',
  withered_forest: 'nature',
  red_tide: 'wasteland',
  grey_harbor: 'harbor',
  horror_hotel: 'horror',
}

/* ============================================================================
 * 2. 每种 family 的压暗色表
 * ========================================================================== */
const STYLE = {
  city: { top: '#141a1e', horizon: '#585342', far: '#20272b', mid: '#2f373b', ground: '#211f1b', fog: '#4b443a', fogD: 0.38 },
  civic: { top: '#171c20', horizon: '#5b5340', far: '#242c30', mid: '#333a3c', ground: '#292721', fog: '#4b443a', fogD: 0.36 },
  industrial: { top: '#15191b', horizon: '#514434', far: '#242c30', mid: '#333b3d', ground: '#26221d', fog: '#464033', fogD: 0.44 },
  tech: { top: '#0f141b', horizon: '#243444', far: '#1c252d', mid: '#28333c', ground: '#1b2024', fog: '#33424c', fogD: 0.42 },
  science: { top: '#111820', horizon: '#2e4048', far: '#1e2830', mid: '#2b373e', ground: '#1c2326', fog: '#39494f', fogD: 0.42 },
  military: { top: '#171a19', horizon: '#4a4436', far: '#242a28', mid: '#343a34', ground: '#231f19', fog: '#454131', fogD: 0.4 },
  horror: { top: '#100d12', horizon: '#3a2730', far: '#1d1a20', mid: '#2c232b', ground: '#1c171c', fog: '#3b2b33', fogD: 0.46 },
  harbor: { top: '#101820', horizon: '#3a4a52', far: '#1d272e', mid: '#2a363d', ground: '#1d2326', fog: '#435158', fogD: 0.46 },
  nature: { top: '#121810', horizon: '#3e4428', far: '#1d2518', mid: '#2c3322', ground: '#232017', fog: '#43472f', fogD: 0.4 },
  wasteland: { top: '#14160f', horizon: '#4e4a2c', far: '#23251a', mid: '#333524', ground: '#28251a', fog: '#474633', fogD: 0.44 },
  punk: { top: '#0e0c14', horizon: '#2e2240', far: '#1b1826', mid: '#2a2436', ground: '#1a1720', fog: '#3b2b46', fogD: 0.4 },
  gothic: { top: '#120e12', horizon: '#3e2a30', far: '#201b22', mid: '#312732', ground: '#1d181d', fog: '#402d34', fogD: 0.44 },
  ancient: { top: '#171612', horizon: '#55503c', far: '#26241d', mid: '#37342a', ground: '#2a261c', fog: '#4c4533', fogD: 0.38 },
  anomaly: { top: '#101720', horizon: '#2c3c48', far: '#1d2730', mid: '#2b3741', ground: '#1d2226', fog: '#3c4b55', fogD: 0.42 },
  mist: { top: '#161b1e', horizon: '#4e5658', far: '#2a3134', mid: '#3a4246', ground: '#2a2c2b', fog: '#5a6264', fogD: 0.64 },
  sea: { top: '#0f171f', horizon: '#344a52', far: '#1b272e', mid: '#28343b', ground: '#1a2226', fog: '#44535a', fogD: 0.5 },
}

/* 暗部地板（参考废土黄昏像素画配色规则）：
 * 最暗不低于 #16161e，暗部带蓝紫倾向，禁止接近纯黑的大色块。
 * 建表后统一把低于亮度地板的色值按原色相抬升。 */
const DARK_FLOOR_L = 23 // #16161e 的感知亮度
function hexLum(c) {
  const r = parseInt(c.slice(1, 3), 16)
  const g = parseInt(c.slice(3, 5), 16)
  const b = parseInt(c.slice(5, 7), 16)
  return [0.299 * r + 0.587 * g + 0.114 * b, r, g, b]
}
function liftHex(c) {
  const [L, r, g, b] = hexLum(c)
  if (L >= DARK_FLOOR_L || L <= 0.01) return c
  const f = DARK_FLOOR_L / L
  const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + to2(r * f) + to2(g * f) + to2(Math.min(255, b * f + 3))
}
for (const k of Object.keys(STYLE)) {
  const st = STYLE[k]
  for (const key of ['top', 'horizon', 'far', 'mid', 'ground', 'fog']) st[key] = liftHex(st[key])
}

/* ============================================================================
 * 3. 基础画笔
 * ========================================================================== */
function box(s, x, y, w, h, c, opt = {}) {
  if (w < 1 || h < 1) return
  s.rect(x, y, w, h, c)
  if (opt.hi !== false) s.rect(x, y, w, 1, mix(c, PAL.white, 0.13))
  if (opt.lo !== false) {
    s.rect(x, y + h - 1, w, 1, mix(c, PAL.void, 0.5))
    s.rect(x + w - 1, y, 1, h, mix(c, PAL.void, 0.36))
  }
  const step = opt.step ?? 16
  if (step > 2) {
    for (let yy = y + step; yy < y + h - 1; yy += step) {
      s.rect(x + 1, yy, w - 2, 1, mix(c, PAL.void, 0.22))
    }
  }
  if (opt.brick) {
    for (let yy = y + 6, row = 0; yy < y + h - 2; yy += 10, row++) {
      const off = row % 2 ? 7 : 0
      for (let xx = x + 2 + off; xx < x + w - 2; xx += 14) {
        s.rect(xx, yy, 1, 9, mix(c, PAL.void, 0.2))
      }
    }
  }
  s.speck(x, y, w, h, mix(c, PAL.rustDark, 0.5), 0.03, 0.55)
}

function windows(s, x, y, w, h, c, o, lit = 0.22, cw = 9, ch = 12) {
  const dark = mix(c, PAL.void, 0.58)
  const litC = mix(o.accent, PAL.white, 0.12)
  for (let yy = y + 4; yy + 5 < y + h - 2; yy += ch) {
    for (let xx = x + 4; xx + 3 < x + w - 3; xx += cw) {
      const r = hash2(xx, yy, o.seed)
      if (r < lit) {
        s.rect(xx, yy, 3, 5, litC)
        s.rect(xx, yy + 5, 3, 1, mix(o.accent, PAL.void, 0.5))
      } else {
        s.rect(xx, yy, 3, 5, dark)
      }
      s.rect(xx, yy - 1, 4, 1, mix(c, PAL.void, 0.3))
    }
  }
}

function facade(s, x, base, w, h, c, o, lit = 0.2, cols = 4) {
  box(s, x, base - h, w, h, c, { step: 22 })
  windows(s, x, base - h, w, h, c, o, lit, Math.max(8, Math.round(w / 26)), 13)
  for (let k = 0; k <= cols; k++) {
    const xx = x + Math.round((w - 6) * (k / cols))
    s.rect(xx, base - h, 4, h, mix(c, PAL.white, 0.06))
    s.rect(xx + 3, base - h, 1, h, mix(c, PAL.void, 0.42))
  }
  return base - h
}

function antenna(s, x, base, h, c, accent) {
  s.rect(x, base - h, 1, h, c)
  s.rect(x - 3, base - h + 7, 7, 1, c)
  s.rect(x - 2, base - h + 15, 5, 1, c)
  s.rect(x, base - h - 2, 1, 2, accent)
}

function cable(s, x0, y0, x1, y1, sag, c) {
  const steps = Math.max(2, Math.abs(x1 - x0) | 0)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag
    s.px(x, y, c, 1)
    if (i % 9 === 0) s.px(x, y + 1, mix(c, PAL.void, 0.45), 1)
  }
}

function stack(s, x, base, w, h, c, o) {
  for (let y = 0; y < h; y++) {
    const t = y / h
    const ww = Math.max(2, Math.round(w * (1 - t * 0.28)))
    const xx = x + Math.round((w - ww) / 2)
    s.rect(xx, base - h + y, ww, 1, mix(c, PAL.void, 0.04 + t * 0.24))
  }
  for (let k = 1; k < 5; k++) {
    const y = base - h + Math.round((h * k) / 5)
    s.rect(x, y, w, 2, mix(c, PAL.rust, 0.38))
  }
  s.speck(x, base - h, w, h, mix(c, PAL.rustDark, 0.4), 0.05, 0.6)
}

function steam(s, cx, y, w, h, c) {
  for (let i = 0; i < 64; i++) {
    const t = i / 64
    const yy = y - t * h
    const spread = w * (0.3 + t * 1.1)
    const x = cx + Math.sin(t * 5.3) * spread * 0.4 + (hash2(i, 3, 0x51) - 0.5) * spread
    s.ell(x, yy, 5 + t * 9, 3 + t * 6, mix(c, PAL.white, 0.1 + t * 0.14))
  }
}

function crenels(s, x, y, w, c, step = 12) {
  for (let xx = x + 3; xx < x + w - 3; xx += step) s.rect(xx, y - 6, step - 4, 6, c)
}

function rivets(s, x, y, w, step, c) {
  for (let xx = x + 4; xx < x + w - 2; xx += step) s.px(xx, y, c, 1)
}

function pool(s, x, y, w, h, c, accent) {
  s.ell(x + w / 2, y + h / 2, w / 2, h / 2, c)
  for (let i = 0; i < 26; i++) {
    const bx = x + hash2(i, 1, 0x71) * w
    const by = y + hash2(i, 2, 0x73) * h
    s.ell(bx, by, 2 + hash2(i, 3, 0x75) * 5, 1 + hash2(i, 4, 0x77) * 2, mix(c, PAL.white, 0.14))
  }
  for (let i = 0; i < 8; i++) {
    s.px(x + hash2(i, 5, 0x79) * w, y + hash2(i, 6, 0x7b) * h, accent, 1)
  }
}

/* ============================================================================
 * 4. 天空 / 远景 / 地面 / 雾
 * ========================================================================== */
function skyPalette(o) {
  const st = o.st
  const ac = o.accent
  return [
    st.top,
    mix(st.top, st.horizon, 0.24),
    mix(st.top, st.horizon, 0.48),
    mix(st.top, st.horizon, 0.68),
    mix(st.horizon, ac, 0.1),
    mix(mix(st.horizon, ac, 0.05), PAL.dustLight, 0.12),
  ]
}

function paintSky(s, o) {
  const cols = skyPalette(o)
  const ys = [0, 66, 140, 212, 282, 350, 430]
  for (let b = 0; b < cols.length; b++) {
    const y0 = ys[b]
    const y1 = Math.min(ys[b + 1], 430)
    const c0 = cols[b]
    const c1 = cols[Math.min(b + 1, cols.length - 1)]
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0)
      const row = mix(c0, c1, t)
      const hi = mix(row, PAL.white, 0.05)
      const lo = mix(row, PAL.void, 0.05)
      for (let x = 0; x < W; x++) {
        const k = bayerAt(x, y)
        s.set(x, y, k > 0.8 ? hi : k < 0.2 ? lo : row)
      }
    }
  }
  // 横向尘带 / 云带（1px 撕边，不留纯色块）
  const rng = mulberry32(o.seed ^ 0x51a3)
  for (let i = 0; i < 30; i++) {
    const y = 36 + rng() * 300
    const x = rng() * W
    const ww = 60 + rng() * 260
    const c = mix(mix(o.st.horizon, PAL.void, 0.24), o.accent, 0.05)
    s.rect(x - ww / 2, y, ww, 1, c)
    if (rng() > 0.55) s.rect(x - ww / 3, y + 2, ww * 0.6, 1, mix(c, PAL.white, 0.05))
    if (rng() > 0.7) s.rect(x - ww / 4, y - 2, ww * 0.4, 1, mix(c, PAL.void, 0.2))
  }
}

function paintFarSkyline(s, o) {
  const rng = mulberry32(o.seed ^ 0x2f19)
  const c = mix(o.st.far, o.st.horizon, 0.16)
  const dark = mix(c, PAL.void, 0.35)
  // 断裂高架残段（偶尔横贯远景，中段有塌口）——废土天际线参考元素
  if (rng() > 0.42) overpassStub(s, rng, c, dark, o)
  let x = -30
  while (x < W + 20) {
    const w = 24 + Math.floor(rng() * 66)
    const h = 24 + Math.floor(rng() * 92)
    const top = 404 - h
    const roll = rng()
    if (roll > 0.88) {
      waterTower(s, x, 404, c, dark, o)
      x += 30 + Math.floor(rng() * 16)
      continue
    }
    if (roll > 0.76 && w > 30) {
      billboardFrame(s, x, 404, Math.min(w, 52), c, dark, o)
      x += w + 8 + Math.floor(rng() * 14)
      continue
    }
    s.rect(x, top, w, h + 32, c)
    s.rect(x, top, w, 1, mix(c, PAL.white, 0.08))
    for (let xx = x + 5; xx < x + w - 3; xx += 9) {
      s.rect(xx, top + 4, 1, h - 4, mix(c, PAL.void, 0.22))
    }
    for (let yy = top + 8; yy < 396; yy += 11) {
      const r = hash2(x, yy, o.seed)
      if (r < 0.14) {
        const wx = x + 4 + Math.floor(hash2(yy, x, o.seed) * Math.max(1, w - 10))
        s.rect(wx, yy, 2, 2, mix(o.accent, PAL.void, 0.55))
      }
    }
    if (rng() > 0.5) {
      s.rect(x + (w >> 1), top - 12, 1, 12, dark)
      s.px(x + (w >> 1), top - 13, mix(o.accent, PAL.void, 0.35))
    }
    x += w + 2 + Math.floor(rng() * 10)
  }
}

/** 远景水塔剪影：圆罐 + 细腿 + 交叉撑（废土天际线参考元素）。 */
function waterTower(s, x, base, c, dark, o) {
  const h = 34
  s.ell(x + 9, base - h + 5, 11, 8, c)
  s.rect(x, base - h + 4, 18, 1, mix(c, PAL.white, 0.1))
  s.rect(x + 2, base - h + 12, 2, h - 12, dark)
  s.rect(x + 14, base - h + 12, 2, h - 12, dark)
  s.line(x + 3, base - 4, x + 14, base - h + 14, dark, 1)
  s.line(x + 15, base - 4, x + 4, base - h + 14, dark, 1)
  s.rect(x + 8, base - h - 3, 2, 4, dark)
  s.px(x + 8, base - h - 4, mix(o.accent, PAL.void, 0.4))
}

/** 空广告牌骨架：立柱 + 边框 + 对角撑，偶尔挂半幅残破布面。 */
function billboardFrame(s, x, base, w, c, dark, o) {
  const h = 26 + Math.floor(hash2(x, 7, o.seed) * 10)
  const bw = Math.max(28, w)
  s.rect(x + 4, base - h, 2, h, dark)
  s.rect(x + bw - 6, base - h, 2, h, dark)
  const ty = base - h - 16
  s.rect(x, ty, bw, 2, c)
  s.rect(x, ty + 12, bw, 2, c)
  s.rect(x, ty, 2, 14, c)
  s.rect(x + bw - 2, ty, 2, 14, c)
  s.line(x + 2, ty + 2, x + bw - 4, ty + 12, dark, 1)
  s.line(x + 2, ty + 12, x + bw - 4, ty + 2, dark, 1)
  if (hash2(x, 13, o.seed) > 0.45) {
    const rw = Math.floor(bw * (0.3 + hash2(x, 17, o.seed) * 0.3))
    s.rect(x + 3, ty + 2, rw, 8, mix(c, o.accent, 0.3))
    s.rect(x + 3, ty + 10, Math.floor(rw * 0.6), 2, mix(c, o.accent, 0.18))
  }
}

/** 断裂高架：桥面横段 + 等距桥墩，中段塌口，断口垂下钢筋。 */
function overpassStub(s, rng, c, dark, o) {
  const y = 352 + Math.floor(rng() * 30)
  const x0 = -20 + Math.floor(rng() * 120)
  const x1 = x0 + 420 + Math.floor(rng() * 380)
  const gapC = x0 + (x1 - x0) * (0.3 + rng() * 0.4)
  const gapW = 30 + rng() * 26
  for (let x = x0; x < x1; x += 4) {
    if (x > gapC && x < gapC + gapW) continue
    s.rect(x, y, 4, 4, c)
    s.rect(x, y - 1, 4, 1, mix(c, PAL.white, 0.08))
  }
  for (let x = x0 + 18; x < x1; x += 52) {
    if (x > gapC - 10 && x < gapC + gapW + 10) continue
    s.rect(x, y + 4, 4, 404 - y - 4, dark)
  }
  s.line(gapC, y + 3, gapC - 5, y + 12, dark, 1)
  s.line(gapC + gapW, y + 3, gapC + gapW + 5, y + 11, dark, 1)
  s.rect(gapC - 2, y, 3, 3, dark)
  s.rect(gapC + gapW - 1, y, 3, 3, dark)
}

function paintMidSkyline(s, o) {
  const rng = mulberry32(o.seed ^ 0x77c1)
  const c = mix(o.st.mid, PAL.void, 0.14)
  let x = 10 + rng() * 40
  for (let i = 0; i < 8; i++) {
    const w = 42 + Math.floor(rng() * 80)
    if (x + w > W - 10) break
    const h = 40 + Math.floor(rng() * 120)
    const top = 424 - h
    s.rect(x, top, w, h, c)
    s.rect(x, top, w, 2, mix(c, PAL.white, 0.07))
    s.rect(x + w - 1, top, 1, h, mix(c, PAL.void, 0.32))
    for (let yy = top + 7; yy < 418; yy += 12) {
      for (let xx = x + 5; xx < x + w - 4; xx += 10) {
        const r = hash2(xx, yy, o.seed + i)
        s.rect(xx, yy, 3, 4, r < 0.16 ? mix(o.accent, PAL.void, 0.5) : mix(c, PAL.void, 0.5))
      }
    }
    if (i % 2 === 0) antenna(s, x + (w >> 1), top, 14 + (i * 3) % 18, mix(c, PAL.void, 0.25), mix(o.accent, PAL.void, 0.3))
    if (i % 3 === 0) {
      s.rect(x + 6, top + 6, w - 12, 3, mix(c, PAL.rust, 0.18))
    }
    x += w + 10 + Math.floor(rng() * 36)
  }
}

function paintGround(s, o) {
  const st = o.st
  const water = !!o.water
  const y0 = water ? 442 : 430
  const deep = mix(st.ground, PAL.void, 0.38)
  const mid = mix(st.ground, PAL.void, 0.12)
  const lite = mix(st.ground, PAL.dust, 0.2)
  for (let y = y0; y < H; y++) {
    const t = (y - y0) / Math.max(1, H - y0)
    const row = mix(mid, deep, t * 0.9)
    for (let x = 0; x < W; x++) {
      const r = hash2(x, y, o.seed)
      let c = row
      if (water) {
        if (y % 7 === 0 && r > 0.5) c = mix(row, PAL.waterHi, 0.11)
        else if (r > 0.945) c = mix(row, PAL.waterFoam, 0.13)
        else if (r < 0.05) c = mix(row, PAL.void, 0.24)
      } else {
        if (r > 0.958) c = lite
        else if (r < 0.06) c = mix(row, PAL.void, 0.32)
      }
      s.set(x, y, c)
    }
  }
  if (!water) {
    for (let k = 0; k < 7; k++) {
      const y = y0 + 8 + k * 17
      for (let x = 0; x < W; x += 14) {
        const r = hash2(x, y, o.seed + 3)
        if (r > 0.45) s.rect(x, y + Math.floor(r * 3), 8 + Math.floor(r * 6), 1, mix(deep, PAL.void, 0.22))
      }
    }
    for (let row = 0, y = y0 + 6; y < H - 4; row++, y += 20) {
      const off = row % 2 ? 10 : 0
      for (let x = off; x < W; x += 22) {
        s.rect(x, y, 1, 18, mix(deep, PAL.void, 0.26))
        if (hash2(x, y, 0x61) > 0.5) s.rect(x + 2, y, 16, 1, mix(lite, PAL.dust, 0.2))
      }
    }
    const rng = mulberry32(o.seed ^ 0x77)
    for (let i = 0; i < 36; i++) {
      const x = rng() * W
      const y = y0 + rng() * (H - y0 - 8)
      s.ell(x, y, 6 + rng() * 22, 3 + rng() * 8, mix(st.ground, PAL.rust, 0.1 + rng() * 0.22))
    }
    for (let i = 0; i < 64; i++) {
      const x = rng() * W
      const y = y0 + rng() * 20
      const c = mix(PAL.weed, PAL.void, 0.25 + rng() * 0.3)
      s.line(x, y, x + (rng() * 6 - 3), y - 4 - rng() * 7, c, 1)
    }
  } else {
    // 浪线 / 泡沫 / accent 倒影
    const rng = mulberry32(o.seed ^ 0x3d)
    for (let i = 0; i < 26; i++) {
      const y = y0 + 6 + rng() * (H - y0 - 8)
      const x = rng() * W
      const ww = 20 + rng() * 90
      s.rect(x, y, ww, 1, mix(o.st.ground, PAL.waterHi, 0.3 + rng() * 0.25))
      if (rng() > 0.6) s.rect(x + 4, y + 2, ww * 0.5, 1, mix(o.st.ground, PAL.waterFoam, 0.22))
    }
    for (let i = 0; i < 10; i++) {
      const x = 200 + rng() * 880
      s.rect(x, y0 + 3, 8 + rng() * 26, 1, mix(o.accent, PAL.waterFoam, 0.35))
    }
    s.rect(0, y0, W, 2, mix(o.st.ground, PAL.waterFoam, 0.16))
  }
}

function paintFog(s, o) {
  const fogC = mix(o.st.fog, o.accent, 0.08)
  const base = o.water ? 442 : 428
  for (let y = 330; y < Math.min(H, base + 70); y++) {
    const t = 1 - Math.abs(y - (base - 22)) / 140
    const dens = Math.max(0, t) * (o.st.fogD ?? 0.42)
    if (dens <= 0.02) continue
    for (let x = 0; x < W; x++) {
      if (bayerAt(x, y) > dens) continue
      const c = hash2(x >> 2, y, o.seed) > 0.82 ? mix(fogC, PAL.white, 0.1) : fogC
      s.px(x, y, c, 1)
    }
  }
}

/* ============================================================================
 * 4b. 室内全景：顶棚 / 墙板 / 窗格 / 管线 / 地砖
 * ----------------------------------------------------------------------------
 * INDOOR 房间不再复用室外天际线，整幅画成建筑内部：
 *   · 顶棚 + 横梁 + 管线封住天空，顶部不留天光；
 *   · 上半墙与脏旧护墙板两段，腰线用本关 accent 压暗；
 *   · 一排窗：亮窗 / 破窗 / 钉木板，窗外只留剪影；
 *   · 工业军事多管线与警示条，民用恐怖多海报与挂钟。
 * 像素 alpha 全为 1，暗部交给 liftDarkPixels 统一抬升。
 * ========================================================================== */
function drawIndoorWindow(s, o, x, y, w, h, lit, rng, frame, wallHi) {
  const ac = o.accent
  s.rect(x - 3, y - 3, w + 6, h + 6, mix(wallHi, PAL.void, 0.34))
  if (lit) {
    const topC = mix(mix(ac, PAL.dustLight, 0.55), PAL.white, 0.3)
    const botC = mix(ac, PAL.void, 0.22)
    for (let j = 0; j < h; j++) {
      const t = j / Math.max(1, h - 1)
      s.rect(x, y + j, w, 1, mix(topC, botC, t))
    }
    // 窗外远景剪影：只 1~3 块，避免抢镜
    const sk = mix(ac, PAL.void, 0.62)
    const base = y + h
    for (let i = 0; i < 3; i++) {
      const bw = 12 + Math.floor(rng() * 22)
      const bh = 8 + Math.floor(rng() * Math.max(6, h * 0.4))
      const bx = x + Math.floor(rng() * Math.max(1, w - bw))
      s.rect(bx, base - bh, bw, bh, sk)
      if (rng() > 0.6) s.rect(bx + (bw >> 1), base - bh - 6, 1, 6, sk)
    }
    // 玻璃反光
    for (let i = 0; i < 3; i++) {
      const lx = x + 6 + rng() * Math.max(1, w - 12)
      s.line(lx, y + 4, lx + 8, y + 16, mix(topC, PAL.white, 0.2), 1)
    }
    if (rng() > 0.72) {
      const bx = x + w - 14 - rng() * 10
      const by = y + 6 + rng() * 14
      s.rect(bx, by, 8, 7, mix(ac, PAL.void, 0.55))
      s.line(bx, by, bx + 5, by + 8, mix(ac, PAL.void, 0.5), 1)
    }
  } else {
    s.rect(x, y, w, h, mix(wallHi, PAL.void, 0.58))
    // 钉死的木板
    for (let yy = y + 4; yy < y + h - 2; yy += 12) {
      const bw = Math.min(w, 30 + Math.floor(rng() * 26))
      s.rect(x + 1, yy, bw, 8, mix(wallHi, PAL.rustDark, 0.3))
      s.rect(x + 1, yy, bw, 1, mix(wallHi, PAL.dust, 0.15))
    }
  }
  // 窗棂 + 边框
  s.rect(x + Math.floor(w / 2) - 1, y, 2, h, frame)
  s.rect(x, y + Math.floor(h * 0.44), w, 2, frame)
  s.rect(x, y, 2, h, frame)
  s.rect(x + w - 2, y, 2, h, frame)
  // 窗台 + 投影
  s.rect(x - 4, y + h + 2, w + 8, 5, mix(wallHi, PAL.void, 0.22))
  s.rect(x - 4, y + h + 2, w + 8, 1, mix(wallHi, PAL.white, 0.12))
  s.dith(x - 2, y + h + 7, w + 4, 4, mix(wallHi, PAL.void, 0.3), 0.5)
}

function paintIndoor(s, o) {
  const st = o.st
  const ac = o.accent
  const fam = o.family
  const rng = mulberry32(o.seed ^ 0x3ac1)
  const CEIL = 92
  const WAIN = 340
  const BASE = 452

  const industrial =
    fam === 'industrial' || fam === 'military' || fam === 'punk' || fam === 'tech' || fam === 'science'
  const civic =
    fam === 'civic' || fam === 'ancient' || fam === 'horror' || fam === 'gothic' || fam === 'anomaly'

  const wallHi = mix(mix(st.far, st.horizon, 0.46), PAL.dust, 0.1)
  const wallMid = mix(wallHi, PAL.void, 0.14)
  const wallLo = mix(wallHi, PAL.void, 0.34)
  const ceilC = mix(st.top, wallHi, 0.16)
  const trim = mix(ac, PAL.void, 0.55)
  const frame = mix(wallHi, PAL.void, 0.5)

  // —— 顶棚：暗到略亮，横向梁 + 支架 ——
  for (let y = 0; y < CEIL; y++) {
    const t = y / (CEIL - 1)
    const row = mix(mix(ceilC, PAL.void, 0.22), ceilC, t)
    for (let x = 0; x < W; x++) {
      const k = bayerAt(x, y)
      s.set(x, y, k > 0.82 ? mix(row, PAL.dust, 0.1) : k < 0.18 ? mix(row, PAL.void, 0.16) : row)
    }
  }
  const beamC = mix(ceilC, PAL.void, 0.42)
  for (let x = 0; x < W; x += 4) {
    s.rect(x, 40, 4, 12, beamC)
    s.rect(x, 40, 4, 1, mix(beamC, PAL.white, 0.1))
  }
  for (let x = 34; x < W; x += 152) s.rect(x, 0, 7, 40, mix(beamC, PAL.void, 0.2))
  // 顶棚管线（工业/科技更密）
  const pipeN = industrial ? 3 : 1
  for (let p = 0; p < pipeN; p++) {
    const y = 62 + p * 6
    const c = p % 2 ? mix(PAL.rust, wallHi, 0.45) : mix(wallHi, PAL.void, 0.28)
    s.rect(0, y, W, 3, c)
    s.rect(0, y, W, 1, mix(c, PAL.white, 0.12))
    for (let x = 20; x < W; x += 116) {
      s.rect(x, y - 2, 5, 7, mix(c, PAL.void, 0.2))
      if (industrial) s.px(x + 2, y + 5, mix(ac, PAL.void, 0.4))
    }
  }
  // 顶棚压边（与墙面分界）
  s.rect(0, 84, W, 8, mix(ceilC, PAL.void, 0.3))
  s.rect(0, 84, W, 1, mix(ceilC, PAL.white, 0.08))
  s.rect(0, 91, W, 1, mix(PAL.void, wallHi, 0.12))

  // —— 上半墙 ——
  for (let y = CEIL; y < WAIN; y++) {
    const t = (y - CEIL) / (WAIN - CEIL)
    const row = mix(wallHi, wallMid, t)
    for (let x = 0; x < W; x++) {
      const k = bayerAt(x, y)
      s.set(x, y, k > 0.86 ? mix(row, PAL.dust, 0.08) : k < 0.16 ? mix(row, PAL.void, 0.14) : row)
    }
  }
  for (let x = 24; x < W; x += 128) {
    s.rect(x, CEIL, 1, WAIN - CEIL, mix(wallMid, PAL.void, 0.2))
    s.rect(x + 1, CEIL, 1, WAIN - CEIL, mix(wallMid, PAL.white, 0.05))
  }
  // 锈水痕
  for (let i = 0; i < 26; i++) {
    const x = rng() * W
    const y = CEIL + rng() * 60
    const len = 30 + rng() * 150
    s.rect(x, y, 1 + rng() * 2, len, mix(wallMid, PAL.rustDark, 0.16 + rng() * 0.2))
  }

  // —— 窗（工业/军事为高窗小窗，民用为落地大窗）——
  // 窗行必须落在屏幕可见的中段：贴图 y 越大越靠近地面，图底只到地面上方 6px。
  const smallWin = industrial
  const winW = smallWin ? 46 : 84
  const winH = smallWin ? 58 : 110
  const winY = smallWin ? 214 : 226
  const step = winW + (smallWin ? 116 : 148)
  let wx = 34 + Math.floor(rng() * 60)
  for (let i = 0; i < 10 && wx + winW < W - 20; i++) {
    // 前两扇必定出现，保证任何关都有可读的窗光
    const show = i < 2 || rng() < (smallWin ? 0.68 : 0.9)
    if (show) {
      const lit = i < 2 ? rng() < 0.85 : rng() < 0.75
      drawIndoorWindow(s, o, wx, winY, winW, winH, lit, rng, frame, wallHi)
      // 亮窗下积尘光斑
      if (lit) {
        for (let j = 0; j < 70; j++) {
          const yy = winY + winH + 8 + rng() * 110
          const xx = wx + (rng() - 0.5) * (winW * 1.5)
          s.px(xx, yy, mix(ac, PAL.dust, 0.4))
        }
      }
    }
    wx += step + Math.floor(rng() * 30)
  }

  // —— 墙面小物：海报 / 挂钟 / 通风口 ——
  if (civic || fam === 'punk') {
    const n = 2 + Math.floor(rng() * 3)
    const paper = mix(PAL.dustLight, PAL.white, 0.32)
    for (let i = 0; i < n; i++) {
      const pw = 20 + Math.floor(rng() * 22)
      const ph = 26 + Math.floor(rng() * 22)
      const px0 = 20 + rng() * (W - 60)
      const py0 = WAIN - 160 + rng() * 100
      const ink = mix(ac, PAL.void, 0.34)
      s.rect(px0 - 2, py0 - 2, pw + 4, ph + 4, mix(wallMid, PAL.void, 0.5))
      s.rect(px0, py0, pw, ph, mix(paper, ac, 0.22))
      s.rect(px0, py0, pw, 6, ink)
      s.rect(px0 + 3, py0 + 10, pw - 8, 2, ink)
      s.rect(px0 + 3, py0 + 15, pw - 15, 1, mix(ink, paper, 0.5))
      s.rect(px0 + 4, py0 + 20, 6, 6, ink)
      s.rect(px0 + 13, py0 + 20, 4, 4, mix(ink, paper, 0.3))
      // 撕角 / 钉子
      s.rect(px0 + pw - 5, py0 + ph - 5, 4, 4, mix(wallMid, PAL.void, 0.5))
      s.px(px0 + 2, py0 + 2, mix(PAL.white, PAL.void, 0.35))
      s.px(px0 + pw - 3, py0 + 2, mix(PAL.white, PAL.void, 0.35))
    }
  }
  if (rng() > 0.45) {
    const cx = 100 + rng() * (W - 200)
    const cy = 210 + rng() * 60
    s.disc(cx, cy, 15, mix(wallHi, PAL.void, 0.42))
    s.disc(cx, cy, 12, mix(ac, PAL.dust, 0.35))
    s.disc(cx, cy, 11, mix(wallMid, PAL.dust, 0.15))
    s.line(cx, cy, cx, cy - 6, mix(PAL.void, wallMid, 0.2), 1)
    s.line(cx, cy, cx + 4, cy + 2, mix(PAL.void, wallMid, 0.2), 1)
    s.px(cx, cy, mix(PAL.void, wallMid, 0.2))
  }
  if (industrial) {
    for (let i = 0; i < 3; i++) {
      const vx = 40 + rng() * (W - 120)
      const vy = CEIL + 24 + rng() * 56
      const vw = 34
      const vh = 20
      s.rect(vx, vy, vw, vh, mix(wallMid, PAL.void, 0.3))
      for (let yy = vy + 2; yy < vy + vh - 1; yy += 3) {
        s.rect(vx + 2, yy, vw - 4, 1, mix(wallMid, PAL.void, 0.55))
      }
      s.rect(vx, vy, vw, 1, mix(wallMid, PAL.white, 0.08))
    }
  }

  // —— 护墙板 + 腰线 ——
  for (let y = WAIN; y < BASE; y++) {
    const t = (y - WAIN) / (BASE - WAIN)
    const row = mix(wallLo, mix(wallLo, PAL.void, 0.1), t)
    for (let x = 0; x < W; x++) {
      const k = bayerAt(x, y)
      s.set(x, y, k > 0.9 ? mix(row, PAL.dust, 0.08) : k < 0.12 ? mix(row, PAL.void, 0.18) : row)
    }
  }
  s.rect(0, WAIN, W, 3, trim)
  s.rect(0, WAIN, W, 1, mix(trim, PAL.white, 0.14))
  s.rect(0, WAIN + 3, W, 1, mix(PAL.void, wallLo, 0.15))
  for (let y = WAIN + 22; y < BASE; y += 18) {
    s.rect(0, y, W, 1, mix(wallLo, PAL.void, 0.28))
    s.rect(0, y + 1, W, 1, mix(wallLo, PAL.white, 0.05))
  }
  if (industrial) {
    // 警示斜条（断续，避免整条纯色）
    for (let i = 0; i < 5; i++) {
      const sx = rng() * W
      const sw = 70 + rng() * 90
      for (let xx = sx; xx < sx + sw; xx++) {
        const band = ((xx - sx + 8) % 16) < 8
        if (bayerAt(xx, WAIN + 8) > 0.25) {
          s.rect(xx, WAIN + 6, 1, 8, band ? mix(ac, PAL.void, 0.4) : mix(PAL.void, wallLo, 0.2))
        }
      }
    }
  }

  // —— 踢脚 + 地砖 ——
  s.rect(0, BASE - 8, W, 8, mix(wallLo, PAL.void, 0.35))
  s.rect(0, BASE - 8, W, 1, mix(wallLo, PAL.white, 0.1))
  const deep = mix(st.ground, PAL.void, 0.4)
  for (let y = BASE; y < H; y++) {
    const t = (y - BASE) / (H - BASE)
    const row = mix(mix(st.ground, PAL.dust, 0.12), deep, t)
    for (let x = 0; x < W; x++) s.set(x, y, row)
  }
  for (let r = 0, y = BASE; y < H + 22; r++, y += 22) {
    const off = r % 2 ? 22 : 0
    s.rect(0, y, W, 1, mix(deep, PAL.void, 0.24))
    for (let xx = off; xx < W; xx += 44) {
      s.rect(xx, y, 1, 22, mix(deep, PAL.void, 0.3))
      if (hash2(xx, r, o.seed) > 0.55) s.rect(xx + 3, y + 3, 36, 1, mix(deep, PAL.dust, 0.1))
    }
  }

  // —— 空气感：尘埃 + 两侧压暗 ——
  for (let i = 0; i < 240; i++) {
    const xx = rng() * W
    const yy = CEIL + rng() * (H - CEIL)
    s.px(xx, yy, mix(ac, PAL.dustLight, 0.4))
  }
  for (let x = 0; x < 48; x++) {
    const dens = (1 - x / 48) * 0.3
    for (let y = 0; y < H; y++) if (bayerAt(x, y) < dens) s.px(x, y, mix(wallLo, PAL.void, 0.4))
  }
  for (let x = W - 48; x < W; x++) {
    const dens = ((x - (W - 48)) / 48) * 0.3
    for (let y = 0; y < H; y++) if (bayerAt(x, y) < dens) s.px(x, y, mix(wallLo, PAL.void, 0.4))
  }

  s.tint(PAL.void, 0.07)
  s.tint(ac, 0.015)
  liftDarkPixels(s)
}

/* ============================================================================
 * 5. 通用地标零件
 * ========================================================================== */
function gantryCrane(s, x, base, h, c, o) {
  s.rect(x, base - h, 5, h, c)
  s.rect(x + 84, base - h, 5, h, c)
  for (let y = base - h + 8; y < base - 10; y += 18) {
    s.line(x + 2, y, x + 86, y + 16, c, 1)
    s.line(x + 86, y, x + 2, y + 16, mix(c, PAL.void, 0.35), 1)
  }
  s.rect(x - 40, base - h - 4, 170, 5, c)
  s.rect(x - 40, base - h - 9, 14, 5, mix(c, PAL.rust, 0.25))
  s.line(x + 34, base - h - 5, x + 130, base - h - 36, mix(c, PAL.white, 0.06), 1)
  s.line(x + 130, base - h - 36, x + 130, base - h - 5, c, 1)
  s.line(x + 100, base - h + 2, x + 100, base - h + 52, mix(c, PAL.steelWhite, 0.28), 1)
  s.rect(x + 96, base - h + 52, 9, 6, mix(c, PAL.rust, 0.2))
  s.rect(x + 98, base - h + 58, 5, 3, mix(c, PAL.void, 0.2))
}

function deadTree(s, x, base, h, c, seed) {
  const sway = Math.sin(seed * 1.7) * 10
  s.thick(x, base, x + sway * 0.3, base - h, Math.max(2, h * 0.035), c)
  for (let i = 0; i < 6; i++) {
    const t = 0.32 + i * 0.1
    const bx = x + sway * t * 0.3
    const by = base - h * t
    const dir = i % 2 ? 1 : -1
    const len = 18 + hash2(i, seed, 0x31) * 34
    s.thick(bx, by, bx + dir * len, by - len * 0.55, Math.max(1, h * 0.014), c)
    if (i % 2 === 0) s.line(bx + dir * len, by - len * 0.55, bx + dir * len * 1.35, by - len * 0.9, c, 1)
  }
}

function pylon(s, x, base, h, c) {
  s.line(x - 14, base, x, base - h, c, 1)
  s.line(x + 14, base, x, base - h, mix(c, PAL.void, 0.3), 1)
  for (let y = base - h + 12; y < base - 4; y += 14) {
    const half = Math.round(14 * ((y - (base - h)) / h))
    s.line(x - half, y, x + half, y + 12, c, 1)
    s.line(x + half, y, x - half, y + 12, mix(c, PAL.void, 0.3), 1)
  }
  s.rect(x - 22, base - h + 10, 44, 2, c)
  s.rect(x - 16, base - h + 24, 32, 2, c)
}

/* ============================================================================
 * 6. family 兜底绘制
 * ========================================================================== */
function drawCity(s, o) {
  const c = mix(o.st.mid, PAL.void, 0.24)
  const c2 = mix(c, PAL.steel, 0.1)
  facade(s, 330, BASE, 150, 150, c, o, 0.24, 3)
  facade(s, 492, BASE, 104, 94, c2, o, 0.16, 2)
  facade(s, 610, BASE, 190, 222, c, o, 0.28, 4)
  facade(s, 812, BASE, 140, 132, c2, o, 0.2, 3)
  antenna(s, 704, 216, 46, mix(c, PAL.void, 0.15), o.accent)
  antenna(s, 880, 306, 28, mix(c2, PAL.void, 0.1), mix(o.accent, PAL.void, 0.2))
  s.rect(462, BASE - 120, 18, 16, mix(c2, PAL.rust, 0.2))
  s.rect(470, BASE - 104, 3, 8, mix(c2, PAL.void, 0.3))
  cable(s, 330, 292, 610, 268, 16, mix(c, PAL.void, 0.25))
  cable(s, 800, 300, 952, 340, 12, mix(c, PAL.void, 0.25))
  // 街边灯
  for (let x = 350; x < 980; x += 150) {
    s.rect(x, BASE - 70, 2, 70, mix(c, PAL.void, 0.3))
    s.rect(x, BASE - 72, 16, 2, mix(c, PAL.void, 0.3))
    s.px(x + 16, BASE - 71, o.accent)
  }
}

function drawCivic(s, o) {
  const c = mix(o.st.mid, PAL.sandDark, 0.16)
  const trim = mix(c, PAL.sand, 0.16)
  facade(s, 350, BASE, 560, 156, c, o, 0.14, 6)
  s.poly([[330, BASE - 156], [640, BASE - 212], [950, BASE - 156]], mix(c, PAL.white, 0.04))
  s.poly([[372, BASE - 158], [640, BASE - 200], [908, BASE - 158]], mix(c, PAL.void, 0.14))
  for (let k = 0; k < 6; k++) {
    const x = 388 + k * 96
    s.rect(x, BASE - 118, 9, 118, trim)
    s.rect(x + 8, BASE - 118, 1, 118, mix(trim, PAL.void, 0.35))
    s.rect(x - 2, BASE - 122, 13, 4, mix(trim, PAL.white, 0.1))
  }
  // 台阶
  for (let k = 0; k < 5; k++) {
    s.rect(496 - k * 10, BASE - 10 + k * 2, 288 + k * 20, 2, mix(trim, PAL.void, 0.15 + k * 0.05))
  }
  // 檐下阴影 + 灯
  s.rect(360, BASE - 150, 540, 4, mix(c, PAL.void, 0.4))
  for (let k = 0; k < 3; k++) {
    s.rect(452 + k * 130, BASE - 74, 4, 12, mix(c, PAL.void, 0.35))
    s.ell(454 + k * 130, BASE - 64, 4, 3, mix(PAL.neonWarm, PAL.void, 0.2))
  }
}

function drawIndustrial(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.16)
  facade(s, 300, BASE, 430, 132, c, o, 0.18, 4)
  // 锯齿屋顶
  for (let k = 0; k < 4; k++) {
    const x = 312 + k * 104
    s.poly([[x, BASE - 132], [x + 78, BASE - 132], [x + 78, BASE - 162], [x + 20, BASE - 132]], mix(c, PAL.void, 0.2))
    s.line(x + 78, BASE - 162, x + 78, BASE - 132, mix(c, PAL.white, 0.05), 1)
  }
  stack(s, 790, BASE, 28, 224, mix(c, PAL.void, 0.1), o)
  stack(s, 868, BASE, 20, 170, mix(c, PAL.void, 0.06), o)
  steam(s, 804, BASE - 226, 34, 90, mix(o.st.fog, PAL.void, 0.2))
  steam(s, 878, BASE - 172, 24, 66, mix(o.st.fog, PAL.void, 0.16))
  // 管道 / 阀门
  s.rect(300, BASE - 54, 500, 6, mix(c, PAL.rust, 0.22))
  s.rect(300, BASE - 56, 500, 1, mix(c, PAL.white, 0.08))
  for (let x = 330; x < 780; x += 46) s.rect(x, BASE - 58, 4, 10, mix(c, PAL.rustDark, 0.25))
  s.ell(740, BASE - 58, 9, 9, mix(c, PAL.rust, 0.15))
  s.ell(740, BASE - 58, 4, 4, mix(c, PAL.void, 0.3))
}

function drawTech(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.3)
  const neon = mix(o.accent, PAL.void, 0.3)
  facade(s, 316, BASE, 190, 120, c, o, 0.24, 3)
  // 主机塔
  box(s, 560, BASE - 262, 170, 262, c, { step: 20, brick: true })
  for (let y = BASE - 250; y < BASE - 20; y += 24) {
    for (let x = 572; x < 720; x += 18) {
      const r = hash2(x, y, o.seed)
      s.rect(x, y, 12, 14, mix(c, PAL.void, 0.55))
      s.rect(x + 1, y + 1, 10, 2, r < 0.3 ? neon : mix(o.accent, PAL.void, 0.65))
    }
  }
  s.rect(548, BASE - 272, 194, 10, mix(c, PAL.void, 0.35))
  s.rect(548, BASE - 274, 194, 2, mix(c, PAL.white, 0.1))
  antenna(s, 646, BASE - 274, 44, mix(c, PAL.void, 0.35), o.accent)
  // 冷却柜
  box(s, 762, BASE - 112, 110, 112, mix(c, PAL.void, 0.08), { step: 14, brick: true })
  for (let k = 0; k < 4; k++) s.rect(772 + k * 24, BASE - 100, 14, 34, mix(c, PAL.void, 0.5))
  // 碟形天线
  s.ell(920, BASE - 170, 34, 24, mix(c, PAL.void, 0.35))
  s.ell(920, BASE - 170, 24, 16, mix(c, PAL.void, 0.55))
  s.line(920, BASE - 150, 900, BASE - 60, mix(c, PAL.void, 0.3), 1)
  s.px(920, BASE - 170, o.accent)
  // 线缆
  cable(s, 505, BASE - 118, 562, BASE - 60, 26, mix(c, PAL.void, 0.35))
  cable(s, 735, BASE - 200, 880, BASE - 118, 34, mix(c, PAL.void, 0.35))
  s.rect(316, BASE - 40, 620, 3, mix(c, PAL.void, 0.3))
}

function drawScience(s, o) {
  const c = mix(o.st.mid, PAL.glass, 0.14)
  facade(s, 320, BASE, 230, 120, c, o, 0.2, 3)
  // 观测穹顶
  s.ell(690, BASE - 26, 160, 128, mix(c, PAL.void, 0.12))
  s.ell(690, BASE - 26, 150, 120, mix(c, PAL.void, 0.34))
  for (let k = 1; k < 4; k++) {
    s.ell(690, BASE - 26, 150 - k * 28, 120 - k * 22, mix(c, PAL.void, 0.28 + k * 0.08))
  }
  // 穹顶接缝
  for (let k = -2; k <= 2; k++) s.line(690 + k * 58, BASE - 26 - 118, 690 + k * 22, BASE - 26, mix(c, PAL.white, 0.05), 1)
  s.rect(686, BASE - 160, 8, 26, mix(c, PAL.void, 0.4))
  s.px(690, BASE - 164, o.accent)
  // 罐体
  for (let k = 0; k < 2; k++) {
    const x = 880 + k * 52
    s.ell(x, BASE - 60, 18, 56, mix(c, PAL.void, 0.1))
    for (let y = BASE - 112; y < BASE - 10; y += 12) s.rect(x - 18, y, 36, 1, mix(c, PAL.void, 0.28))
    s.rect(x - 4, BASE - 120, 8, 10, mix(c, PAL.rust, 0.2))
  }
  cable(s, 540, BASE - 96, 600, BASE - 40, 20, mix(c, PAL.void, 0.3))
}

function drawMilitary(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.2)
  // 兵营
  facade(s, 318, BASE, 330, 108, c, o, 0.16, 3)
  // 岗楼
  const tx = 790
  s.rect(tx, BASE - 180, 6, 180, c)
  s.rect(tx + 52, BASE - 180, 6, 180, c)
  for (let y = BASE - 168; y < BASE - 40; y += 16) {
    s.line(tx + 4, y, tx + 54, y + 14, c, 1)
    s.line(tx + 54, y, tx + 4, y + 14, mix(c, PAL.void, 0.3), 1)
  }
  box(s, tx - 12, BASE - 212, 84, 36, mix(c, PAL.void, 0.12))
  windows(s, tx - 12, BASE - 212, 84, 36, mix(c, PAL.void, 0.12), o, 0.18, 9, 12)
  s.rect(tx - 16, BASE - 216, 92, 5, mix(c, PAL.steel, 0.12))
  antenna(s, tx + 30, BASE - 216, 34, c, o.accent)
  // 铁丝网 + 沙袋
  for (let x = 300; x < 1000; x += 24) s.ell(x, BASE - 40, 12, 5, mix(c, PAL.void, 0.3))
  for (let x = 340; x < 980; x += 16) {
    s.ell(x, BASE - 12, 12, 7, mix(PAL.sandDark, PAL.void, 0.25))
    s.ell(x + 4, BASE - 15, 12, 7, mix(PAL.sandDark, PAL.void, 0.18))
  }
  // 旗杆
  s.rect(642, BASE - 120, 2, 120, mix(c, PAL.void, 0.2))
  s.poly([[644, BASE - 118], [704, BASE - 104], [644, BASE - 88]], mix(o.accent, PAL.void, 0.25))
  // 探照灯
  s.ell(920, BASE - 190, 7, 7, mix(PAL.boneDark, PAL.void, 0.2))
  s.rect(915, BASE - 190, 11, 34, mix(c, PAL.void, 0.25))
}

function drawHorror(s, o) {
  const c = mix(o.st.mid, PAL.rustDark, 0.3)
  facade(s, 392, BASE, 430, 210, c, o, 0.1, 4)
  // 陡坡屋顶
  s.poly([[372, BASE - 210], [607, BASE - 292], [842, BASE - 210]], mix(c, PAL.void, 0.25))
  s.line(372, BASE - 210, 607, BASE - 292, mix(c, PAL.white, 0.06), 1)
  crenels(s, 372, BASE - 210, 470, mix(c, PAL.void, 0.35), 16)
  // 门廊
  s.rect(578, BASE - 92, 84, 92, mix(c, PAL.void, 0.5))
  s.rect(566, BASE - 96, 108, 8, mix(c, PAL.rust, 0.2))
  s.rect(560, BASE - 92, 5, 92, mix(c, PAL.void, 0.2))
  s.rect(676, BASE - 92, 5, 92, mix(c, PAL.void, 0.2))
  // 招牌
  s.rect(862, BASE - 198, 16, 96, mix(c, PAL.void, 0.35))
  for (let k = 0; k < 5; k++) s.px(868, BASE - 190 + k * 16, o.accent, 1)
  // 唯一亮灯窗
  s.rect(632, BASE - 170, 8, 12, mix(o.accent, PAL.white, 0.2))
  // 枯树与栅栏
  deadTree(s, 300, BASE, 132, mix(c, PAL.void, 0.35), 0.7)
  for (let x = 300; x < 1000; x += 26) s.rect(x, BASE - 46, 2, 46, mix(c, PAL.void, 0.4))
  s.rect(292, BASE - 30, 708, 2, mix(c, PAL.void, 0.35))
}

function drawHarbor(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.18)
  const c2 = mix(c, PAL.rust, 0.18)
  // 码头岸线
  s.rect(0, BASE - 24, W, 24, mix(c, PAL.void, 0.2))
  for (let x = 0; x < W; x += 10) s.rect(x, BASE - 24, 1, 24, mix(c, PAL.void, 0.4))
  s.rect(0, BASE - 24, W, 2, mix(c, PAL.white, 0.08))
  s.speck(0, BASE - 24, W, 24, mix(c, PAL.rustDark, 0.4), 0.05, 0.6)
  gantryCrane(s, 360, BASE - 20, 200, c, o)
  gantryCrane(s, 740, BASE - 20, 172, c2, o)
  // 集装箱堆
  for (let k = 0; k < 5; k++) {
    const x = 500 + (k % 3) * 86
    const y = BASE - 42 - Math.floor(k / 3) * 30
    box(s, x, y, 78, 28, mix(o.accent, PAL.void, 0.55 + (k % 2) * 0.12), { step: 6 })
    for (let sx = x + 6; sx < x + 74; sx += 8) s.rect(sx, y + 3, 2, 22, mix(c, PAL.void, 0.4))
  }
  // 远处船体
  s.poly([[60, BASE - 30], [120, BASE - 86], [330, BASE - 86], [380, BASE - 30]], mix(c, PAL.void, 0.3))
  s.rect(150, BASE - 118, 46, 34, mix(c, PAL.void, 0.42))
  antenna(s, 216, BASE - 118, 30, mix(c, PAL.void, 0.35), o.accent)
  // 系缆桩 / 救生圈
  for (let x = 420; x < 1000; x += 120) {
    s.rect(x, BASE - 34, 8, 10, mix(c, PAL.rust, 0.2))
    s.rect(x + 2, BASE - 36, 4, 3, mix(c, PAL.white, 0.1))
  }
  s.ell(610, BASE - 66, 9, 9, mix(o.accent, PAL.void, 0.5))
  s.ell(610, BASE - 66, 4, 4, mix(c, PAL.void, 0.5))
}

function drawNature(s, o) {
  const c = mix(o.st.mid, PAL.mossDead, 0.3)
  // 丘陵
  s.ell(360, BASE - 10, 300, 100, mix(c, PAL.void, 0.2))
  s.ell(760, BASE - 6, 320, 120, mix(c, PAL.void, 0.28))
  deadTree(s, 330, BASE, 180, mix(c, PAL.void, 0.25), 1.4)
  deadTree(s, 640, BASE, 232, mix(c, PAL.void, 0.15), 2.7)
  deadTree(s, 880, BASE, 150, mix(c, PAL.void, 0.32), 3.9)
  deadTree(s, 1010, BASE, 108, mix(c, PAL.void, 0.4), 0.4)
  for (let i = 0; i < 14; i++) {
    const x = 280 + hash2(i, 1, o.seed) * 720
    const y = BASE - 10 - hash2(i, 2, o.seed) * 20
    s.ell(x, y, 10 + hash2(i, 3, o.seed) * 22, 6 + hash2(i, 4, o.seed) * 9, mix(c, PAL.void, 0.3))
  }
  // 藤蔓
  for (let i = 0; i < 10; i++) {
    const x = 300 + hash2(i, 5, 0x21) * 680
    s.line(x, BASE - 40, x + (hash2(i, 6, 0x23) - 0.5) * 30, BASE - 90 - hash2(i, 7, 0x25) * 60, mix(PAL.weed, PAL.void, 0.35), 1)
  }
}

function drawWasteland(s, o) {
  const c = mix(o.st.mid, PAL.rustDark, 0.3)
  // 坍塌楼体
  s.poly([[320, BASE], [320, BASE - 140], [400, BASE - 168], [470, BASE - 118], [470, BASE]], c)
  s.poly([[720, BASE], [720, BASE - 96], [806, BASE - 130], [880, BASE - 72], [904, BASE]], mix(c, PAL.void, 0.15))
  for (let i = 0; i < 12; i++) {
    const x = 330 + hash2(i, 1, o.seed) * 120
    s.line(x, BASE - 20 - hash2(i, 2, o.seed) * 120, x + (hash2(i, 3, o.seed) - 0.5) * 24, BASE - 50 - hash2(i, 4, o.seed) * 110, mix(c, PAL.rust, 0.3), 1)
  }
  // 油桶
  for (let k = 0; k < 3; k++) {
    const x = 560 + k * 42
    s.rect(x, BASE - 46, 30, 46, mix(PAL.rust, PAL.void, 0.28 + k * 0.08))
    for (let y = BASE - 42; y < BASE - 6; y += 9) s.rect(x, y, 30, 1, mix(PAL.rustDark, PAL.void, 0.2))
    s.ell(x + 15, BASE - 46, 15, 5, mix(PAL.rust, PAL.void, 0.15))
    s.px(x + 15, BASE - 47, o.accent)
  }
  // 毒洼
  pool(s, 940, BASE - 44, 150, 46, mix(PAL.toxicDark, PAL.void, 0.25), o.accent)
  // 焦土 + 警示条
  s.rect(500, BASE - 110, 40, 22, mix(PAL.ochre, PAL.void, 0.3))
  for (let k = 0; k < 5; k++) s.rect(502 + k * 8, BASE - 108, 4, 18, mix(PAL.void, PAL.ochre, 0.2))
  s.rect(524, BASE - 88, 2, 88, mix(c, PAL.void, 0.3))
}

function drawPunk(s, o) {
  const c = mix(o.st.mid, PAL.void, 0.2)
  // 音箱墙
  for (let k = 0; k < 3; k++) {
    const x = 380 + k * 128
    const h = 150 + (k % 2) * 44
    box(s, x, BASE - h, 112, h, mix(c, PAL.void, 0.06), { step: 18 })
    for (let j = 0; j < 3; j++) {
      const cx = x + 56
      const cy = BASE - h + 40 + j * 44
      s.ell(cx, cy, 20, 20, mix(PAL.void, PAL.ash, 0.5))
      s.ell(cx, cy, 12, 12, mix(PAL.ash, PAL.void, 0.5))
      s.ell(cx, cy, 4, 4, mix(o.accent, PAL.void, 0.6))
    }
    s.rect(x + 4, BASE - h + 8, 104, 2, mix(o.accent, PAL.void, 0.45))
  }
  // 霓虹招牌
  s.rect(760, BASE - 210, 10, 180, mix(o.accent, PAL.void, 0.35))
  s.rect(760, BASE - 210, 120, 10, mix(o.accent, PAL.void, 0.25))
  for (let k = 0; k < 6; k++) s.rect(772, BASE - 190 + k * 22, 60 + (k % 3) * 18, 4, mix(o.accent, PAL.white, 0.1 + (k % 2) * 0.12))
  // 涂鸦 / 线缆
  for (let i = 0; i < 12; i++) {
    const x = 286 + hash2(i, 1, o.seed) * 700
    s.rect(x, BASE - 40 - hash2(i, 2, o.seed) * 70, 10 + hash2(i, 3, o.seed) * 22, 3, mix(o.accent, PAL.void, 0.5))
  }
  cable(s, 300, BASE - 232, 900, BASE - 200, 46, mix(c, PAL.void, 0.35))
  cable(s, 300, BASE - 180, 760, BASE - 160, 30, mix(c, PAL.void, 0.3))
}

function drawGothic(s, o) {
  const c = mix(o.st.mid, PAL.bloodDark, 0.32)
  const trim = mix(c, PAL.sandDark, 0.1)
  // 主堡
  box(s, 430, BASE - 210, 220, 210, c, { step: 24, brick: true })
  crenels(s, 430, BASE - 210, 220, trim, 16)
  // 双侧塔
  for (const x of [330, 700]) {
    box(s, x, BASE - 286, 96, 286, mix(c, PAL.void, 0.08), { step: 26, brick: true })
    s.poly([[x - 10, BASE - 286], [x + 48, BASE - 356], [x + 106, BASE - 286]], trim)
    s.line(x - 10, BASE - 286, x + 48, BASE - 356, mix(trim, PAL.white, 0.08), 1)
    crenels(s, x, BASE - 286, 96, trim, 14)
    // 尖窗
    for (let k = 0; k < 3; k++) {
      const wx = x + 20 + k * 28
      s.rect(wx, BASE - 210, 12, 52, mix(PAL.void, o.accent, 0.16))
      s.poly([[wx, BASE - 210], [wx + 6, BASE - 224], [wx + 12, BASE - 210]], mix(PAL.void, o.accent, 0.2))
    }
  }
  // 门洞 + 玫瑰窗
  s.poly([[520, BASE], [520, BASE - 96], [560, BASE - 120], [600, BASE - 96], [600, BASE]], mix(PAL.void, PAL.rustDark, 0.2))
  s.ell(540, BASE - 160, 26, 26, mix(PAL.void, o.accent, 0.22))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    s.line(540, BASE - 160, 540 + Math.cos(a) * 24, BASE - 160 + Math.sin(a) * 24, mix(c, PAL.void, 0.4), 1)
  }
  // 旗帜
  s.rect(908, BASE - 220, 2, 220, mix(c, PAL.void, 0.2))
  s.poly([[910, BASE - 218], [976, BASE - 200], [910, BASE - 180]], mix(o.accent, PAL.void, 0.35))
  // 墓地栅栏
  for (let x = 900; x < 1040; x += 18) {
    s.rect(x, BASE - 36, 2, 36, mix(c, PAL.void, 0.35))
    s.poly([[x - 3, BASE - 36], [x + 1, BASE - 44], [x + 5, BASE - 36]], mix(c, PAL.void, 0.35))
  }
}

function drawAncient(s, o) {
  const c = mix(o.st.mid, PAL.sandDark, 0.3)
  // 残破神庙基座
  box(s, 360, BASE - 26, 420, 26, mix(c, PAL.void, 0.15), { step: 6, brick: true })
  // 立柱（断口不一）
  for (let k = 0; k < 5; k++) {
    const x = 400 + k * 76
    const h = 90 + (k * 37) % 110
    s.rect(x, BASE - 26 - h, 22, h, mix(c, PAL.void, 0.08))
    for (let y = BASE - 26 - h + 8; y < BASE - 30; y += 14) s.rect(x, y, 22, 2, mix(c, PAL.void, 0.22))
    s.rect(x - 3, BASE - 30 - h, 28, 4, mix(c, PAL.sandDark, 0.2))
    s.rect(x - 3, BASE - 26, 28, 4, mix(c, PAL.void, 0.22))
  }
  // 倒下的柱段
  s.rect(700, BASE - 30, 120, 20, mix(c, PAL.void, 0.12))
  for (let k = 0; k < 8; k++) s.rect(704 + k * 14, BASE - 28, 1, 16, mix(c, PAL.void, 0.3))
  // 勘探方格
  for (let k = 0; k < 3; k++) {
    const x = 280 + k * 90
    s.rect(x, BASE - 12, 78, 1, mix(c, PAL.void, 0.4))
    s.rect(x, BASE - 12, 1, 12, mix(c, PAL.void, 0.4))
    s.rect(x + 77, BASE - 12, 1, 12, mix(c, PAL.void, 0.4))
  }
  // 帐篷
  s.poly([[820, BASE], [884, BASE - 62], [948, BASE]], mix(PAL.sandDark, PAL.void, 0.25))
  s.line(884, BASE - 62, 884, BASE - 84, mix(c, PAL.void, 0.25), 1)
  // 头骨
  s.ell(740, BASE - 20, 8, 7, mix(PAL.boneDark, PAL.void, 0.2))
  s.px(736, BASE - 22, PAL.void)
  s.px(744, BASE - 22, PAL.void)
}

function drawAnomaly(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.26)
  // 浮空碎石
  const rng = mulberry32(o.seed ^ 0x9a11)
  for (let i = 0; i < 22; i++) {
    const x = 300 + rng() * 700
    const y = 120 + rng() * 250
    const w = 8 + rng() * 34
    const h = 6 + rng() * 22
    s.ell(x, y, w, h, mix(c, PAL.void, 0.2 + rng() * 0.2))
    s.ell(x, y - 1, w * 0.7, h * 0.6, mix(c, PAL.white, 0.05))
    s.px(x + w * 0.4, y - h * 0.5, mix(o.accent, PAL.white, 0.2))
    s.line(x, y + h, x, y + h + 6 + rng() * 16, mix(c, PAL.void, 0.35), 1)
  }
  // 悬浮环
  s.ell(640, 250, 150, 46, mix(c, PAL.void, 0.3))
  s.ell(640, 250, 120, 34, mix(c, PAL.void, 0.5))
  s.ell(640, 250, 42, 18, mix(PAL.void, o.accent, 0.18))
  s.px(640, 250, o.accent)
  // 倾斜天线 / 信号塔
  s.line(360, BASE, 360, BASE - 200, c, 1)
  s.line(360, BASE - 200, 406, BASE - 240, c, 1)
  for (let k = 0; k < 8; k++) {
    const t = k / 8
    s.px(360 + t * 46, BASE - 200 - t * 40, mix(o.accent, PAL.white, 0.1))
  }
  // 悬空雨滴
  for (let i = 0; i < 40; i++) {
    s.px(280 + hash2(i, 1, 0x41) * 740, 90 + hash2(i, 2, 0x43) * 300, mix(PAL.rain, PAL.white, 0.1))
  }
}

function drawMist(s, o) {
  const c = mix(o.st.mid, PAL.void, 0.18)
  // 三层渐远剪影
  for (let layer = 0; layer < 3; layer++) {
    const c2 = mix(c, o.st.fog, 0.16 + layer * 0.14)
    const base = 396 + layer * 18
    const count = 6
    for (let i = 0; i < count; i++) {
      const x = 260 + i * 130 + layer * 37
      if (x > 1040) break
      const h = 60 + ((i * 53 + layer * 71) % 100)
      s.rect(x, base - h, 72, h, c2)
      s.rect(x, base - h, 72, 1, mix(c2, PAL.white, 0.06))
      for (let yy = base - h + 8; yy < base - 6; yy += 13) {
        for (let xx = x + 6; xx < x + 68; xx += 12) {
          if (hash2(xx, yy, o.seed + layer) < 0.2) s.rect(xx, yy, 3, 3, mix(o.accent, PAL.void, 0.6))
        }
      }
      antenna(s, x + 36, base - h, 18, mix(c2, PAL.void, 0.3), mix(o.accent, PAL.void, 0.4))
    }
  }
  // 雾中航标
  for (let k = 0; k < 3; k++) {
    const x = 420 + k * 220
    s.rect(x, BASE - 78, 5, 78, mix(c, PAL.void, 0.3))
    s.ell(x + 2, BASE - 82, 8, 8, mix(o.accent, PAL.void, 0.2))
    s.ell(x + 2, BASE - 82, 22, 22, mix(o.st.fog, PAL.white, 0.01))
  }
}

function drawSea(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.16)
  // 防波堤
  s.rect(260, BASE - 66, 480, 66, mix(c, PAL.void, 0.22))
  for (let x = 264; x < 740; x += 18) {
    s.rect(x, BASE - 66, 1, 66, mix(c, PAL.void, 0.4))
    s.rect(x + 4, BASE - 62, 12, 1, mix(c, PAL.white, 0.05))
  }
  s.speck(260, BASE - 66, 480, 66, mix(PAL.rustDark, PAL.void, 0.2), 0.06, 0.6)
  for (let x = 268; x < 740; x += 60) s.rect(x, BASE - 88, 34, 22, mix(c, PAL.void, 0.3))
  // 远处货轮
  s.poly([[800, BASE - 40], [840, BASE - 92], [1020, BASE - 92], [1060, BASE - 40]], mix(c, PAL.void, 0.34))
  s.rect(870, BASE - 116, 54, 28, mix(c, PAL.void, 0.44))
  for (let k = 0; k < 4; k++) s.rect(880 + k * 14, BASE - 110, 6, 10, mix(o.accent, PAL.void, 0.55))
  antenna(s, 900, BASE - 116, 34, mix(c, PAL.void, 0.35), o.accent)
  // 浮标
  s.ell(960, BASE - 28, 8, 8, mix(o.accent, PAL.void, 0.35))
  s.rect(958, BASE - 26, 3, 16, mix(c, PAL.void, 0.35))
  // 浪尖
  for (let i = 0; i < 16; i++) {
    const x = 240 + hash2(i, 1, o.seed) * 820
    s.rect(x, BASE - 8 + hash2(i, 2, o.seed) * 6, 10 + hash2(i, 3, o.seed) * 24, 1, mix(PAL.waterFoam, PAL.void, 0.25))
  }
}

/* ============================================================================
 * 7. 主题专属地标
 * ========================================================================== */
function drawLibrary(s, o) {
  const c = mix(o.st.mid, PAL.sandDark, 0.22)
  const trim = mix(c, PAL.sand, 0.18)
  facade(s, 320, BASE, 640, 200, c, o, 0.08, 6)
  s.rect(304, BASE - 208, 672, 10, trim)
  s.rect(304, BASE - 208, 672, 2, mix(trim, PAL.white, 0.18))
  s.rect(304, BASE - 198, 672, 3, mix(c, PAL.void, 0.35))
  for (let i = 0; i < 5; i++) {
    const wx = 366 + i * 124
    const wy = BASE - 172
    s.rect(wx, wy + 18, 76, 136, mix(c, PAL.void, 0.55))
    s.ell(wx + 38, wy + 20, 38, 22, mix(c, PAL.void, 0.45))
    s.rect(wx + 6, wy + 38, 64, 100, mix(PAL.ink, PAL.steelDark, 0.45))
    for (let k = 0; k < 3; k++) {
      const sy = wy + 54 + k * 30
      s.rect(wx + 8, sy, 60, 2, mix(PAL.rustDark, PAL.sandDark, 0.3))
      for (let b = 0; b < 15; b++) {
        const bx = wx + 9 + b * 4
        const bh = 13 + ((hash2(wx, sy + b, o.seed) * 10) | 0)
        const bookC = [PAL.boneDark, PAL.rust, PAL.toxicDark, PAL.steel, o.accent][b % 5]
        s.rect(bx, sy - bh, 3, bh, mix(bookC, PAL.void, 0.15))
      }
    }
    s.line(wx, wy + 26, wx + 38, wy - 2, trim, 1)
    s.line(wx + 76, wy + 26, wx + 38, wy - 2, trim, 1)
  }
  // 门厅 + 台阶 + 壁灯
  s.poly([[576, BASE], [576, BASE - 84], [640, BASE - 110], [704, BASE - 84], [704, BASE]], mix(PAL.void, PAL.rustDark, 0.22))
  for (let k = 0; k < 4; k++) s.rect(548 - k * 10, BASE - 8 + k * 2, 184 + k * 20, 2, mix(trim, PAL.void, 0.2 + k * 0.05))
  for (const x of [520, 760]) {
    s.rect(x, BASE - 130, 4, 18, mix(c, PAL.void, 0.35))
    s.ell(x + 2, BASE - 112, 5, 4, mix(PAL.neonWarm, PAL.void, 0.25))
  }
  // 爬藤
  for (let i = 0; i < 14; i++) {
    const x = 316 + hash2(i, 1, o.seed) * 640
    const y = BASE - 208 + hash2(i, 2, o.seed) * 40
    s.line(x, y, x + (hash2(i, 3, o.seed) - 0.5) * 22, y + 24 + hash2(i, 4, o.seed) * 40, mix(PAL.weed, PAL.void, 0.4), 1)
  }
}

function drawSchool(s, o) {
  const c = mix(o.st.mid, PAL.sandDark, 0.15)
  facade(s, 350, BASE, 580, 160, c, o, 0.14, 5)
  // 中央黑板
  const bx = 552
  const by = BASE - 146
  const bw = 248
  const bh = 92
  s.rect(bx - 5, by - 5, bw + 10, bh + 10, mix(PAL.rustDark, PAL.void, 0.25))
  s.rect(bx, by, bw, bh, mix(PAL.toxicDark, PAL.ink, 0.5))
  s.speck(bx, by, bw, bh, mix(PAL.toxicDark, PAL.void, 0.35), 0.14, 0.65)
  for (let i = 0; i < 4; i++) {
    const y = by + 17 + i * 17
    s.rect(bx + 14, y, 96 - i * 14, 2, mix(PAL.bone, PAL.toxicDark, 0.4))
    s.rect(bx + 122, y, 34 + i * 10, 2, mix(PAL.bone, PAL.toxicDark, 0.5))
  }
  s.ell(bx + 212, by + 30, 11, 11, mix(PAL.bone, PAL.toxicDark, 0.35))
  // 黑板下方的粉笔槽
  s.rect(bx - 2, by + bh, bw + 4, 4, mix(c, PAL.void, 0.45))
  // 钟楼 / 旗杆
  s.rect(664, BASE - 216, 54, 56, mix(c, PAL.void, 0.15))
  s.ell(691, BASE - 186, 18, 18, mix(PAL.boneDark, PAL.void, 0.25))
  s.rect(691, BASE - 186, 1, 12, PAL.void)
  s.rect(687, BASE - 186, 9, 1, PAL.void)
  s.rect(760, BASE - 190, 2, 190, mix(c, PAL.void, 0.22))
  s.poly([[762, BASE - 188], [820, BASE - 174], [762, BASE - 158]], mix(o.accent, PAL.void, 0.35))
  // 校门
  s.rect(420, BASE - 56, 110, 56, mix(PAL.void, c, 0.2))
  s.rect(416, BASE - 60, 118, 5, mix(c, PAL.white, 0.06))
  s.speck(350, BASE - 160, 580, 160, mix(c, PAL.rust, 0.35), 0.02, 0.5)
}

function drawUniversity(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.14)
  const trim = mix(c, PAL.sand, 0.14)
  facade(s, 356, BASE, 568, 150, c, o, 0.16, 6)
  // 柱廊
  for (let k = 0; k < 6; k++) {
    const x = 380 + k * 100
    s.rect(x, BASE - 122, 12, 122, trim)
    s.rect(x + 10, BASE - 122, 1, 122, mix(trim, PAL.void, 0.35))
    s.rect(x - 3, BASE - 126, 18, 5, mix(trim, PAL.white, 0.1))
  }
  // 中央穹顶
  s.ell(640, BASE - 154, 96, 88, mix(c, PAL.void, 0.1))
  s.ell(640, BASE - 154, 84, 78, mix(c, PAL.void, 0.34))
  for (let k = 1; k < 3; k++) s.ell(640, BASE - 154, 84 - k * 22, 78 - k * 18, mix(c, PAL.void, 0.3 + k * 0.1))
  s.rect(636, BASE - 252, 8, 22, mix(c, PAL.void, 0.35))
  s.px(640, BASE - 256, o.accent)
  // 拱门 + 台阶
  s.poly([[592, BASE], [592, BASE - 70], [640, BASE - 96], [688, BASE - 70], [688, BASE]], mix(PAL.void, PAL.rustDark, 0.25))
  for (let k = 0; k < 4; k++) s.rect(560 - k * 12, BASE - 8 + k * 2, 160 + k * 24, 2, mix(trim, PAL.void, 0.2))
  // 实验楼侧翼
  facade(s, 940, BASE, 130, 110, mix(c, PAL.void, 0.1), o, 0.2, 2)
  cable(s, 470, BASE - 150, 610, BASE - 120, 18, mix(c, PAL.void, 0.3))
}

function drawPrison(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.3)
  const trim = mix(c, PAL.void, 0.2)
  s.rect(290, BASE - 152, 700, 152, c)
  s.rect(290, BASE - 152, 700, 4, mix(c, PAL.white, 0.1))
  for (let row = 0; row < 7; row++) {
    const y = BASE - 144 + row * 20
    for (let x = 294 + (row % 2 ? 10 : 0); x < 986; x += 22) {
      s.rect(x, y, 1, 18, mix(trim, PAL.void, 0.2))
    }
  }
  s.speck(290, BASE - 152, 700, 152, mix(c, PAL.rust, 0.3), 0.04, 0.55)
  // 岗楼
  for (const gx of [312, 880]) {
    box(s, gx, BASE - 224, 70, 74, mix(c, PAL.void, 0.08), { step: 14, brick: true })
    s.rect(gx - 6, BASE - 230, 82, 6, trim)
    windows(s, gx, BASE - 224, 70, 74, mix(c, PAL.void, 0.08), o, 0.12, 10, 14)
    s.ell(gx + 35, BASE - 246, 7, 6, mix(PAL.boneDark, PAL.void, 0.25))
  }
  // 铁丝网圈
  for (let x = 300; x < 990; x += 26) s.ell(x, BASE - 160, 13, 6, mix(c, PAL.void, 0.25))
  // 牢窗 + 中央铁门
  for (let i = 0; i < 9; i++) {
    const x = 330 + i * 74
    s.rect(x, BASE - 86, 16, 22, mix(PAL.void, c, 0.16))
    for (let k = 0; k < 3; k++) s.rect(x + 2 + k * 5, BASE - 86, 1, 22, mix(c, PAL.void, 0.3))
  }
  s.rect(598, BASE - 96, 84, 96, mix(PAL.void, c, 0.12))
  s.rect(594, BASE - 100, 92, 5, mix(c, PAL.white, 0.06))
  for (let k = 0; k < 4; k++) s.rect(598 + k * 21, BASE - 96, 1, 96, mix(c, PAL.void, 0.35))
  // 探照灯
  s.ell(430, BASE - 200, 8, 8, mix(PAL.boneDark, PAL.void, 0.15))
  s.rect(426, BASE - 200, 9, 42, mix(c, PAL.void, 0.3))
  // 墙根草
  for (let i = 0; i < 40; i++) {
    const x = 290 + hash2(i, 1, o.seed) * 700
    s.line(x, BASE - 4, x + (hash2(i, 2, o.seed) - 0.5) * 7, BASE - 4 - hash2(i, 3, o.seed) * 6, mix(PAL.weed, PAL.void, 0.45), 1)
  }
}

function drawHotel(s, o) {
  const c = mix(o.st.mid, PAL.rustDark, 0.24)
  const trim = mix(c, PAL.sandDark, 0.18)
  facade(s, 400, BASE, 470, 224, c, o, 0.14, 5)
  s.rect(384, BASE - 234, 502, 12, trim)
  s.rect(384, BASE - 234, 502, 2, mix(trim, PAL.white, 0.16))
  // 门廊
  s.rect(566, BASE - 104, 96, 104, mix(PAL.void, PAL.rustDark, 0.2))
  s.rect(548, BASE - 110, 132, 9, mix(c, PAL.rust, 0.28))
  s.rect(548, BASE - 101, 132, 2, mix(o.accent, PAL.void, 0.5))
  for (const x of [552, 670]) {
    s.rect(x, BASE - 102, 6, 102, trim)
    s.rect(x + 5, BASE - 102, 1, 102, mix(trim, PAL.void, 0.35))
  }
  // 竖招牌
  s.rect(874, BASE - 206, 26, 132, mix(PAL.void, PAL.ash, 0.4))
  for (let k = 0; k < 6; k++) {
    const y = BASE - 196 + k * 20
    s.rect(881, y, 12, 9, mix(o.accent, PAL.void, 0.35))
    s.px(882, y + 1, mix(PAL.white, o.accent, 0.2))
  }
  // 门厅灯 + 地毯
  s.ell(614, BASE - 118, 5, 4, mix(PAL.neonWarm, PAL.void, 0.15))
  s.rect(574, BASE - 12, 80, 12, mix(o.accent, PAL.void, 0.6))
  for (let x = 574; x < 654; x += 8) s.rect(x, BASE - 12, 4, 12, mix(PAL.rustDark, PAL.void, 0.3))
  // 行李车 / 枯树
  s.rect(330, BASE - 60, 30, 8, mix(c, PAL.rust, 0.2))
  s.rect(334, BASE - 52, 4, 52, mix(c, PAL.void, 0.25))
  s.rect(352, BASE - 52, 4, 52, mix(c, PAL.void, 0.25))
  deadTree(s, 980, BASE, 120, mix(c, PAL.void, 0.4), 0.8)
}

function drawDock(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.16)
  s.rect(0, BASE - 26, W, 26, mix(c, PAL.void, 0.24))
  for (let x = 0; x < W; x += 12) s.rect(x, BASE - 26, 1, 26, mix(c, PAL.void, 0.42))
  s.rect(0, BASE - 26, W, 2, mix(c, PAL.white, 0.07))
  s.speck(0, BASE - 26, W, 26, mix(c, PAL.rust, 0.35), 0.06, 0.6)
  // 集装箱阵列
  for (let k = 0; k < 8; k++) {
    const x = 280 + (k % 4) * 96
    const y = BASE - 66 - Math.floor(k / 4) * 38
    box(s, x, y, 88, 34, mix(o.accent, PAL.void, 0.5 + (k % 3) * 0.1), { step: 7 })
    for (let sx = x + 5; sx < x + 85; sx += 9) s.rect(sx, y + 4, 2, 26, mix(c, PAL.void, 0.42))
    s.px(x + 8, y + 6, mix(PAL.white, o.accent, 0.2))
  }
  // 大吊机
  gantryCrane(s, 610, BASE - 24, 214, c, o)
  // 船体
  s.poly([[860, BASE - 34], [906, BASE - 116], [1076, BASE - 116], [1120, BASE - 34]], mix(c, PAL.void, 0.3))
  s.rect(930, BASE - 146, 62, 30, mix(c, PAL.void, 0.42))
  for (let i = 0; i < 4; i++) s.rect(940 + i * 14, BASE - 140, 7, 10, mix(o.accent, PAL.void, 0.55))
  s.rect(1008, BASE - 154, 2, 38, mix(c, PAL.void, 0.3))
  cable(s, 1010, BASE - 154, 1060, BASE - 136, 8, mix(c, PAL.void, 0.25))
  // 缆绳 / 救生圈
  for (let i = 0; i < 5; i++) {
    const x = 300 + i * 140
    s.ell(x, BASE - 46, 10, 10, mix(o.accent, PAL.void, 0.55))
    s.ell(x, BASE - 46, 4, 4, mix(c, PAL.void, 0.5))
  }
}

function drawLighthouse(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.2)
  // 礁石
  for (let i = 0; i < 6; i++) {
    const x = 560 + i * 46
    s.ell(x, BASE - 8, 40 - i * 3, 16, mix(c, PAL.void, 0.22 + i * 0.04))
    s.ell(x - 8, BASE - 14, 26, 14, mix(c, PAL.void, 0.3))
  }
  // 塔身（锥形 + 红白环）
  const top = BASE - 292
  for (let y = top; y < BASE - 18; y++) {
    const t = (y - top) / (BASE - top - 18)
    const ww = Math.round(48 + t * 42)
    const band = Math.floor((y - top) / 34) % 2
    const col = band ? mix(o.accent, PAL.void, 0.28) : mix(PAL.boneDark, PAL.void, 0.3)
    s.rect(700 - ww / 2, y, ww, 1, col)
  }
  for (let y = top + 20; y < BASE - 30; y += 34) s.rect(676, y, 4, 3, mix(PAL.void, c, 0.3))
  // 灯室
  s.rect(674, top - 4, 52, 6, mix(c, PAL.void, 0.2))
  s.rect(684, top - 34, 32, 30, mix(PAL.void, o.accent, 0.25))
  s.ell(700, top - 19, 9, 9, mix(o.accent, PAL.white, 0.2))
  s.ell(700, top - 19, 22, 22, mix(o.accent, PAL.void, 0.55))
  s.poly([[672, top - 4], [700, top - 48], [728, top - 4]], mix(c, PAL.void, 0.2))
  antenna(s, 700, top - 48, 26, mix(c, PAL.void, 0.3), o.accent)
  // 灯束（抖动）
  for (let i = 0; i < 120; i++) {
    const t = i / 120
    const x = 716 + t * 330
    const y = top - 18 + Math.sin(t * 3.2) * 30 + t * 66
    if (bayerAt(i, 0) < 0.5 - t * 0.35) s.px(x, y, mix(o.accent, PAL.white, 0.25), 1)
  }
  // 岸边护栏
  for (let x = 300; x < 980; x += 22) s.rect(x, BASE - 52, 2, 52, mix(c, PAL.void, 0.35))
  s.rect(294, BASE - 34, 700, 2, mix(c, PAL.void, 0.3))
}

function drawShipyard(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.2)
  // 未完工船体
  s.poly([[350, BASE - 24], [420, BASE - 150], [620, BASE - 190], [860, BASE - 172], [930, BASE - 24]], mix(c, PAL.void, 0.24))
  // 肋骨
  for (let k = 0; k < 12; k++) {
    const x = 400 + k * 44
    const topY = BASE - 150 - Math.sin((k / 12) * Math.PI) * 46
    s.rect(x, topY, 3, BASE - 24 - topY, mix(c, PAL.void, 0.4))
    s.line(x - 6, topY + 12, x + 9, topY + 12, mix(c, PAL.white, 0.06), 1)
  }
  s.line(350, BASE - 24, 930, BASE - 24, mix(c, PAL.white, 0.08), 1)
  // 脚手架
  for (let k = 0; k < 5; k++) {
    const x = 380 + k * 120
    s.rect(x, BASE - 210, 3, 210, mix(PAL.rust, PAL.void, 0.3))
    for (let y = BASE - 200; y < BASE - 30; y += 26) s.rect(x - 10, y, 24, 2, mix(PAL.rustDark, PAL.void, 0.2))
  }
  // 焊光 / 火花
  const sparks = [[520, BASE - 116], [700, BASE - 96], [820, BASE - 60]]
  for (const [x, y] of sparks) {
    s.ell(x, y, 5, 5, mix(o.accent, PAL.white, 0.3))
    for (let k = 0; k < 10; k++) {
      const a = hash2(k, x, o.seed) * Math.PI * 2
      s.px(x + Math.cos(a) * (3 + hash2(k, y, o.seed) * 9), y + Math.sin(a) * (3 + hash2(k, y, 3) * 9), mix(o.accent, PAL.white, 0.2))
    }
  }
  gantryCrane(s, 890, BASE - 22, 190, c, o)
  // 板材堆
  for (let k = 0; k < 3; k++) s.rect(250, BASE - 14 - k * 9, 80, 7, mix(c, PAL.rust, 0.12 + k * 0.06))
}

function drawDrydock(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.22)
  // 闸门 / 坞墙
  box(s, 320, BASE - 196, 620, 196, c, { step: 18, brick: true })
  s.rect(308, BASE - 204, 644, 10, mix(c, PAL.white, 0.06))
  rivets(s, 320, BASE - 186, 620, 18, mix(c, PAL.white, 0.1))
  rivets(s, 320, BASE - 20, 620, 18, mix(c, PAL.white, 0.06))
  // 中央闸门
  box(s, 570, BASE - 168, 130, 168, mix(c, PAL.void, 0.12), { step: 24 })
  for (let x = 574; x < 700; x += 14) s.rect(x, BASE - 164, 2, 160, mix(PAL.rust, PAL.void, 0.28))
  s.rect(560, BASE - 172, 150, 6, mix(PAL.rustLight, PAL.void, 0.25))
  s.rect(568, BASE - 96, 134, 26, mix(o.accent, PAL.void, 0.55))
  for (let k = 0; k < 6; k++) s.rect(574 + k * 21, BASE - 90, 14, 5, mix(o.accent, PAL.white, 0.12))
  // 排水管 / 泵
  s.rect(330, BASE - 60, 240, 12, mix(c, PAL.rust, 0.25))
  s.rect(330, BASE - 60, 240, 2, mix(c, PAL.white, 0.06))
  for (const x of [356, 500]) {
    s.ell(x, BASE - 54, 22, 22, mix(c, PAL.void, 0.2))
    s.ell(x, BASE - 54, 14, 14, mix(c, PAL.void, 0.4))
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2
      s.line(x, BASE - 54, x + Math.cos(a) * 20, BASE - 54 + Math.sin(a) * 20, mix(c, PAL.white, 0.06), 1)
    }
  }
  // 坞底轨道
  s.rect(150, BASE - 12, 980, 3, mix(PAL.rustDark, PAL.void, 0.3))
  for (let x = 160; x < 1120; x += 26) s.rect(x, BASE - 12, 14, 3, mix(c, PAL.void, 0.25))
  // 左右吊臂
  gantryCrane(s, 960, BASE - 20, 150, c, o)
}

function drawStrait(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.16)
  // 断桥主跨 + 桥墩
  s.rect(240, BASE - 202, 800, 14, mix(c, PAL.void, 0.26))
  s.rect(240, BASE - 202, 800, 2, mix(c, PAL.white, 0.08))
  for (let k = 0; k < 3; k++) {
    const x = 330 + k * 280
    s.rect(x, BASE - 200, 22, 200, mix(c, PAL.void, 0.34))
    s.rect(x - 8, BASE - 198, 38, 6, mix(c, PAL.void, 0.25))
    for (let y = BASE - 188; y < BASE - 10; y += 20) s.rect(x + 2, y, 18, 2, mix(c, PAL.void, 0.45))
  }
  // 斜拉索
  for (let k = 0; k < 5; k++) {
    const x = 360 + k * 280
    cable(s, x, BASE - 210, x + 140, BASE - 328, 10, mix(c, PAL.void, 0.35))
    cable(s, x, BASE - 210, x - 140, BASE - 328, 10, mix(c, PAL.void, 0.35))
  }
  // 缆索悬垂入水
  cable(s, 1040, BASE - 200, 1080, BASE - 58, 52, mix(c, PAL.steelWhite, 0.2))
  cable(s, 240, BASE - 200, 190, BASE - 70, 42, mix(c, PAL.steelWhite, 0.18))
  // 礁石 / 护栏
  for (let i = 0; i < 12; i++) {
    const x = 180 + hash2(i, 1, o.seed) * 900
    s.ell(x, BASE - 8 - hash2(i, 2, o.seed) * 8, 14 + hash2(i, 3, o.seed) * 26, 6 + hash2(i, 4, o.seed) * 8, mix(c, PAL.void, 0.36))
  }
  for (let x = 240; x < 1040; x += 30) s.rect(x, BASE - 218, 2, 16, mix(c, PAL.void, 0.3))
  // 浪尖
  for (let i = 0; i < 24; i++) {
    const x = 160 + hash2(i, 5, o.seed) * 960
    s.rect(x, BASE - 8 + hash2(i, 6, o.seed) * 8, 12 + hash2(i, 7, o.seed) * 30, 1, mix(PAL.waterFoam, PAL.void, 0.3))
  }
}

function drawDam(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.24)
  // 坝体
  s.poly([[240, BASE], [240, BASE - 210], [1040, BASE - 210], [1040, BASE]], c)
  for (let row = 0, y = BASE - 200; y < BASE; row++, y += 24) {
    for (let x = 248 + (row % 2 ? 14 : 0); x < 1032; x += 30) {
      s.rect(x, y, 1, 22, mix(c, PAL.void, 0.28))
    }
    s.rect(244, y, 792, 1, mix(c, PAL.void, 0.18))
  }
  s.speck(240, BASE - 210, 800, 210, mix(c, PAL.rust, 0.3), 0.05, 0.55)
  // 坝顶护栏
  s.rect(236, BASE - 218, 808, 8, mix(c, PAL.void, 0.18))
  for (let x = 244; x < 1040; x += 26) {
    s.rect(x, BASE - 232, 2, 16, mix(c, PAL.white, 0.06))
  }
  s.rect(240, BASE - 232, 800, 2, mix(c, PAL.white, 0.1))
  // 溢洪闸门
  for (let k = 0; k < 4; k++) {
    const x = 420 + k * 130
    s.rect(x, BASE - 168, 90, 92, mix(PAL.void, o.accent, 0.1))
    for (let y = BASE - 164; y < BASE - 80; y += 10) s.rect(x + 2, y, 86, 2, mix(c, PAL.void, 0.4))
    s.rect(x - 4, BASE - 172, 98, 6, mix(PAL.rust, PAL.void, 0.2))
    // 泄水
    for (let i = 0; i < 26; i++) {
      const t = i / 26
      s.rect(x + 8 + ((k * 37 + i * 13) % 72), BASE - 76 + t * (76 - t * 20), 3 + (i % 3), 2, mix(PAL.waterFoam, PAL.void, 0.25 + t * 0.2))
    }
  }
  // 水面反光 / 水花
  s.rect(240, BASE - 12, 800, 12, mix(PAL.waterDeep, PAL.waterHi, 0.14))
  for (let i = 0; i < 40; i++) {
    const x = 220 + hash2(i, 1, o.seed) * 840
    s.rect(x, BASE - 6 + hash2(i, 2, o.seed) * 5, 6 + hash2(i, 3, o.seed) * 18, 1, mix(PAL.waterFoam, PAL.void, 0.3))
  }
  // 坝顶灯塔
  s.rect(1000, BASE - 268, 4, 46, mix(c, PAL.void, 0.3))
  s.ell(1002, BASE - 272, 6, 6, mix(o.accent, PAL.void, 0.25))
}

function drawBridge(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.18)
  // 主跨桥面
  s.rect(220, BASE - 232, 340, 12, mix(c, PAL.void, 0.22))
  s.rect(740, BASE - 232, 320, 12, mix(c, PAL.void, 0.22))
  s.rect(220, BASE - 232, 340, 2, mix(c, PAL.white, 0.07))
  s.rect(740, BASE - 232, 320, 2, mix(c, PAL.white, 0.07))
  // 桁架
  for (let x = 224; x < 554; x += 44) {
    s.line(x, BASE - 230, x + 44, BASE - 284, c, 1)
    s.line(x + 44, BASE - 284, x + 88, BASE - 230, c, 1)
    s.line(x, BASE - 230, x + 88, BASE - 230, mix(c, PAL.void, 0.3), 1)
  }
  for (let x = 744; x < 1058; x += 44) {
    s.line(x, BASE - 230, x + 44, BASE - 282, c, 1)
    s.line(x + 44, BASE - 282, x + 88, BASE - 230, c, 1)
  }
  // 断口 + 垂落钢索
  for (let k = 0; k < 5; k++) {
    cable(s, 560 + k * 10, BASE - 226, 560 + k * 34, BASE - 88 + k * 12, 16 + k * 8, mix(PAL.steelWhite, PAL.void, 0.45))
    cable(s, 742 - k * 10, BASE - 226, 742 - k * 30, BASE - 96 + k * 10, 14 + k * 7, mix(PAL.steelWhite, PAL.void, 0.45))
  }
  // 桥墩
  for (const x of [280, 480, 880, 1000]) {
    s.rect(x, BASE - 230, 26, 230, mix(c, PAL.void, 0.3))
    for (let y = BASE - 216; y < BASE - 10; y += 18) s.rect(x + 2, y, 22, 2, mix(c, PAL.void, 0.45))
    s.rect(x - 8, BASE - 236, 42, 6, mix(c, PAL.void, 0.2))
  }
  // 路灯 + 车骸
  for (let x = 300; x < 1040; x += 120) {
    s.rect(x, BASE - 292, 2, 60, mix(c, PAL.void, 0.3))
    s.rect(x - 8, BASE - 294, 18, 2, mix(c, PAL.void, 0.3))
    s.px(x - 8, BASE - 293, o.accent)
  }
  s.rect(880, BASE - 250, 54, 18, mix(PAL.rust, PAL.void, 0.3))
  s.rect(890, BASE - 264, 30, 14, mix(PAL.rust, PAL.void, 0.35))
  s.ell(886, BASE - 236, 7, 7, mix(PAL.void, c, 0.2))
  s.ell(928, BASE - 236, 7, 7, mix(PAL.void, c, 0.2))
  // 桥面护栏
  for (let x = 222; x < 1058; x += 18) s.rect(x, BASE - 244, 1, 12, mix(c, PAL.void, 0.35))
}

function drawHighway(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.2)
  // 高架路面
  s.rect(0, BASE - 172, W, 26, mix(c, PAL.void, 0.22))
  s.rect(0, BASE - 172, W, 2, mix(c, PAL.white, 0.06))
  for (let x = 0; x < W; x += 44) s.rect(x, BASE - 152, 26, 1, mix(PAL.boneDark, PAL.void, 0.5))
  // 支撑柱
  for (let x = 120; x < W; x += 210) {
    s.rect(x, BASE - 146, 30, 146, mix(c, PAL.void, 0.28))
    for (let y = BASE - 136; y < BASE - 10; y += 20) s.rect(x + 2, y, 26, 2, mix(c, PAL.void, 0.45))
    s.rect(x - 10, BASE - 152, 50, 8, mix(c, PAL.void, 0.2))
  }
  // 路牌门架
  s.rect(658, BASE - 172, 8, 172, mix(c, PAL.void, 0.3))
  s.rect(934, BASE - 172, 8, 172, mix(c, PAL.void, 0.3))
  s.rect(640, BASE - 300, 320, 8, mix(c, PAL.void, 0.25))
  s.rect(660, BASE - 296, 150, 62, mix(PAL.toxicDark, PAL.void, 0.35))
  s.rect(824, BASE - 296, 118, 62, mix(o.accent, PAL.void, 0.55))
  for (let k = 0; k < 3; k++) s.rect(670, BASE - 282 + k * 16, 96 - k * 14, 4, mix(PAL.bone, PAL.void, 0.5))
  for (let k = 0; k < 3; k++) s.rect(836, BASE - 282 + k * 16, 66, 4, mix(PAL.void, PAL.boneDark, 0.4))
  s.rect(650, BASE - 232, 300, 3, mix(PAL.rust, PAL.void, 0.2))
  // 车骸 / 路灯
  s.rect(330, BASE - 198, 64, 22, mix(PAL.rust, PAL.void, 0.3))
  s.rect(338, BASE - 214, 40, 18, mix(PAL.rust, PAL.void, 0.36))
  s.ell(338, BASE - 180, 8, 8, mix(PAL.void, c, 0.3))
  s.ell(386, BASE - 180, 8, 8, mix(PAL.void, c, 0.3))
  for (let x = 260; x < 1020; x += 240) {
    s.rect(x, BASE - 252, 2, 80, mix(c, PAL.void, 0.3))
    s.rect(x, BASE - 254, 22, 2, mix(c, PAL.void, 0.3))
    s.px(x + 22, BASE - 253, o.accent)
  }
  // 护栏 / 裂缝
  s.rect(0, BASE - 150, W, 2, mix(PAL.white, PAL.void, 0.55))
  for (let i = 0; i < 20; i++) {
    const x = hash2(i, 1, o.seed) * W
    s.line(x, BASE - 172, x + (hash2(i, 2, o.seed) - 0.5) * 26, BASE - 146, mix(PAL.void, c, 0.3), 1)
  }
}

function drawSkyscraper(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.08)
  const c2 = mix(c, PAL.void, 0.2)
  facade(s, 330, BASE, 150, 330, c2, o, 0.22, 3)
  facade(s, 500, BASE, 180, 392, c, o, 0.3, 4)
  facade(s, 700, BASE, 150, 300, c2, o, 0.24, 3)
  facade(s, 870, BASE, 130, 244, c, o, 0.2, 3)
  // 屋顶断裂 + 天线
  s.poly([[500, BASE - 392], [560, BASE - 424], [590, BASE - 380], [620, BASE - 428], [680, BASE - 392]], mix(c, PAL.void, 0.25))
  antenna(s, 592, BASE - 424, 48, mix(c, PAL.void, 0.3), o.accent)
  antenna(s, 930, BASE - 244, 40, mix(c2, PAL.void, 0.2), mix(o.accent, PAL.void, 0.3))
  // 塔冠
  for (const [x, w, h] of [[330, 150, 330], [700, 150, 300], [870, 130, 244]]) {
    s.rect(x - 6, BASE - h - 12, w + 12, 12, mix(c2, PAL.void, 0.28))
    s.rect(x - 6, BASE - h - 12, w + 12, 2, mix(c2, PAL.white, 0.05))
  }
  // 外挂电缆 / 广告屏
  cable(s, 402, BASE - 300, 520, BASE - 340, 30, mix(c, PAL.void, 0.3))
  cable(s, 680, BASE - 360, 760, BASE - 300, 22, mix(c, PAL.void, 0.3))
  s.rect(520, BASE - 170, 66, 90, mix(PAL.void, PAL.ash, 0.35))
  for (let k = 0; k < 6; k++) {
    s.rect(526, BASE - 160 + k * 13, 54, 4, mix(o.accent, PAL.void, 0.4 + (k % 2) * 0.1))
  }
  // 底部街灯
  for (let x = 320; x < 1020; x += 140) s.px(x, BASE - 46, mix(PAL.neonWarm, PAL.void, 0.25))
}

function drawStadium(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.14)
  // 看台碗（同心弧）
  const rings = 5
  for (let k = 0; k < rings; k++) {
    const rx = 380 - k * 34
    const ry = 150 - k * 20
    const col = mix(c, PAL.void, 0.1 + k * 0.1)
    s.ell(640, BASE - 16, rx, ry, col)
    // 座位条纹
    for (let i = 0; i < 22; i++) {
      const a = Math.PI + (i / 22) * Math.PI
      const x = 640 + Math.cos(a) * rx * 0.92
      const y = BASE - 16 + Math.sin(a) * ry * 0.9
      s.rect(x, y, 7, 3, mix(col, k % 2 ? PAL.rust : PAL.boneDark, 0.12))
    }
  }
  // 草坪 / 记分牌
  s.ell(640, BASE - 12, 230, 62, mix(PAL.toxicDark, PAL.void, 0.3))
  for (let i = 0; i < 18; i++) {
    const x = 430 + hash2(i, 1, o.seed) * 420
    s.rect(x, BASE - 18 - hash2(i, 2, o.seed) * 30, 10 + hash2(i, 3, o.seed) * 16, 1, mix(PAL.weed, PAL.void, 0.35))
  }
  s.rect(884, BASE - 196, 140, 70, mix(PAL.void, PAL.ash, 0.42))
  s.rect(890, BASE - 190, 128, 58, mix(PAL.void, PAL.ink, 0.3))
  for (let k = 0; k < 4; k++) s.rect(896 + k * 32, BASE - 180, 20, 12, mix(o.accent, PAL.void, 0.35 + (k % 2) * 0.15))
  for (let k = 0; k < 2; k++) s.rect(896 + k * 66, BASE - 158, 52, 6, mix(PAL.bone, PAL.void, 0.5))
  // 灯塔柱
  for (const x of [270, 1010]) {
    s.rect(x, BASE - 270, 6, 270, mix(c, PAL.void, 0.26))
    s.rect(x - 12, BASE - 278, 30, 10, mix(c, PAL.void, 0.2))
    for (let k = 0; k < 4; k++) {
      s.rect(x - 12 + k * 8, BASE - 288, 6, 8, mix(PAL.bone, PAL.void, 0.2))
      s.px(x - 9 + k * 8, BASE - 284, o.accent)
    }
  }
  // 破旗
  for (let i = 0; i < 3; i++) {
    const x = 360 + i * 170
    s.rect(x, BASE - 214, 2, 36, mix(c, PAL.void, 0.3))
    s.poly([[x + 2, BASE - 212], [x + 42, BASE - 206], [x + 2, BASE - 196]], mix(o.accent, PAL.void, 0.4))
  }
}

function drawBattlefield(s, o) {
  const c = mix(o.st.mid, PAL.ochre, 0.16)
  // 弹坑（同心环 + 抖动）
  for (let k = 0; k < 3; k++) {
    const x = 320 + k * 260
    s.ell(x, BASE - 18, 62 - k * 6, 20, mix(c, PAL.void, 0.32))
    s.ell(x, BASE - 22, 44 - k * 6, 14, mix(PAL.void, c, 0.12))
    s.ell(x, BASE - 24, 24, 8, mix(PAL.void, PAL.rustDark, 0.25))
  }
  // 断墙 + 钢筋
  s.poly([[330, BASE], [330, BASE - 118], [400, BASE - 146], [470, BASE - 104], [486, BASE]], c)
  for (let i = 0; i < 12; i++) {
    const x = 338 + hash2(i, 1, o.seed) * 130
    s.line(x, BASE - 30 - hash2(i, 2, o.seed) * 100, x + (hash2(i, 3, o.seed) - 0.5) * 26, BASE - 60 - hash2(i, 4, o.seed) * 96, mix(PAL.rust, PAL.void, 0.3), 1)
  }
  // 坦克残骸
  s.rect(770, BASE - 62, 130, 40, mix(c, PAL.void, 0.2))
  s.poly([[786, BASE - 62], [806, BASE - 88], [880, BASE - 88], [900, BASE - 62]], mix(c, PAL.void, 0.26))
  s.rect(866, BASE - 96, 96, 8, mix(c, PAL.void, 0.3))
  s.rect(960, BASE - 98, 10, 12, mix(c, PAL.void, 0.3))
  for (const x of [806, 874]) {
    s.ell(x, BASE - 34, 22, 16, mix(PAL.void, c, 0.26))
    s.ell(x, BASE - 34, 10, 8, mix(PAL.void, c, 0.5))
  }
  for (let x = 780; x < 896; x += 12) s.rect(x, BASE - 58, 2, 34, mix(PAL.rust, PAL.void, 0.3))
  // 铁丝网 / 沙袋 / 军旗
  for (let x = 270; x < 1040; x += 26) s.ell(x, BASE - 76, 14, 6, mix(c, PAL.void, 0.35))
  for (let x = 280; x < 520; x += 18) {
    s.ell(x, BASE - 10, 13, 8, mix(PAL.sandDark, PAL.void, 0.26))
    s.ell(x + 5, BASE - 14, 13, 8, mix(PAL.sandDark, PAL.void, 0.18))
  }
  s.rect(700, BASE - 132, 2, 132, mix(c, PAL.void, 0.25))
  s.poly([[702, BASE - 130], [768, BASE - 114], [702, BASE - 92]], mix(o.accent, PAL.void, 0.35))
  // 焦痕
  for (let i = 0; i < 16; i++) {
    const x = 280 + hash2(i, 5, o.seed) * 760
    s.rect(x, BASE - 8 - hash2(i, 6, o.seed) * 16, 10 + hash2(i, 7, o.seed) * 24, 1, mix(PAL.void, PAL.rust, 0.14))
  }
}

function drawRescue(s, o) {
  const c = mix(o.st.mid, PAL.boneDeep, 0.24)
  facade(s, 340, BASE, 520, 176, c, o, 0.18, 5)
  s.rect(324, BASE - 184, 552, 10, mix(c, PAL.white, 0.08))
  // 人道救助十字
  s.rect(586, BASE - 166, 72, 72, mix(o.accent, PAL.void, 0.5))
  s.rect(612, BASE - 154, 20, 48, mix(PAL.bone, o.accent, 0.3))
  s.rect(598, BASE - 140, 48, 20, mix(PAL.bone, o.accent, 0.3))
  s.rect(594, BASE - 170, 80, 3, mix(PAL.white, PAL.void, 0.4))
  // 病房窗（暖光）
  for (let i = 0; i < 4; i++) {
    const x = 356 + i * 130
    s.rect(x, BASE - 132, 18, 30, mix(o.accent, PAL.void, 0.35))
    for (let k = 0; k < 3; k++) s.rect(x + 2 + k * 6, BASE - 132, 1, 30, mix(PAL.void, c, 0.3))
  }
  // 救护车
  s.rect(880, BASE - 74, 120, 44, mix(PAL.bone, PAL.void, 0.45))
  s.rect(896, BASE - 96, 64, 24, mix(PAL.bone, PAL.void, 0.5))
  for (const x of [904, 968]) {
    s.ell(x, BASE - 28, 15, 15, mix(PAL.void, c, 0.2))
    s.ell(x, BASE - 28, 6, 6, mix(PAL.void, c, 0.4))
  }
  s.rect(934, BASE - 66, 22, 16, mix(o.accent, PAL.void, 0.4))
  for (let k = 0; k < 3; k++) s.rect(906 + k * 6, BASE - 88, 4, 12, mix(o.accent, PAL.void, 0.3))
  // 帐篷 / 隔离带
  s.poly([[240, BASE], [292, BASE - 56], [344, BASE]], mix(PAL.boneDeep, PAL.void, 0.3))
  for (let x = 250; x < 1060; x += 34) {
    s.rect(x, BASE - 24, 2, 24, mix(c, PAL.void, 0.3))
    s.rect(x, BASE - 22, 34, 1, mix(o.accent, PAL.void, 0.5))
  }
}

function drawRobotRally(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.12)
  facade(s, 300, BASE, 360, 110, c, o, 0.12, 3)
  // 两排机器人方阵
  for (let row = 0; row < 2; row++) {
    const base = BASE - row * 42
    const scale = 1 - row * 0.18
    for (let i = 0; i < 5; i++) {
      const x = 430 + i * 96 + row * 22
      const bh = Math.round(64 * scale)
      const bw = Math.round(38 * scale)
      box(s, x, base - bh, bw, bh, mix(c, PAL.void, 0.16 + row * 0.1), { step: 8 })
      s.rect(x + 6, base - bh - 18, bw - 12, 18, mix(c, PAL.void, 0.34))
      s.rect(x + 10, base - bh - 24, bw - 20, 6, mix(c, PAL.void, 0.42))
      s.rect(x + 9, base - bh + 10, 6, 6, mix(o.accent, PAL.void, 0.35))
      s.rect(x + bw - 15, base - bh + 10, 6, 6, mix(o.accent, PAL.void, 0.35))
      s.rect(x + bw / 2 - 4, base - bh + 26, 8, 8, mix(o.accent, PAL.white, 0.12))
      s.rect(x - 4, base - bh + 8, 4, 18, mix(c, PAL.void, 0.3))
      s.rect(x + bw, base - bh + 8, 4, 18, mix(c, PAL.void, 0.3))
      antenna(s, x + bw / 2, base - bh - 24, 14, mix(c, PAL.void, 0.3), o.accent)
    }
  }
  // 方阵标线 + 旗帜
  for (let row = 0; row < 3; row++) s.rect(400, BASE - 18 + row * 5, 700, 1, mix(o.accent, PAL.void, 0.55))
  s.rect(690, BASE - 190, 2, 80, mix(c, PAL.void, 0.3))
  s.poly([[692, BASE - 188], [748, BASE - 174], [692, BASE - 158]], mix(o.accent, PAL.void, 0.38))
  cable(s, 300, BASE - 120, 660, BASE - 100, 30, mix(c, PAL.void, 0.3))
}

function drawFarm(s, o) {
  const c = mix(o.st.mid, PAL.rustDark, 0.26)
  // 谷仓
  s.rect(400, BASE - 150, 250, 150, c)
  s.poly([[386, BASE - 150], [525, BASE - 228], [664, BASE - 150]], mix(c, PAL.void, 0.2))
  for (let x = 398; x < 648; x += 14) s.rect(x, BASE - 150, 1, 150, mix(c, PAL.void, 0.24))
  s.rect(500, BASE - 92, 54, 92, mix(PAL.void, PAL.rustDark, 0.22))
  s.rect(494, BASE - 96, 66, 5, mix(PAL.rust, PAL.void, 0.2))
  s.rect(416, BASE - 128, 42, 30, mix(PAL.void, c, 0.3))
  s.rect(588, BASE - 128, 42, 30, mix(PAL.void, c, 0.3))
  // 筒仓
  for (const sx of [700, 768]) {
    s.rect(sx, BASE - 206, 54, 206, mix(c, PAL.void, 0.12))
    s.ell(sx + 27, BASE - 206, 27, 14, mix(c, PAL.void, 0.06))
    for (let y = BASE - 190; y < BASE - 6; y += 14) s.rect(sx, y, 54, 1, mix(c, PAL.void, 0.26))
    s.rect(sx + 24, BASE - 178, 6, 14, mix(PAL.rust, PAL.void, 0.2))
  }
  // 风车
  s.rect(900, BASE - 230, 8, 230, mix(c, PAL.void, 0.22))
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3
    s.line(904, BASE - 226, 904 + Math.cos(a) * 54, BASE - 226 + Math.sin(a) * 54, mix(c, PAL.void, 0.2), 2)
    s.line(904 + Math.cos(a) * 20, BASE - 226 + Math.sin(a) * 20, 904 + Math.cos(a) * 54, BASE - 226 + Math.sin(a) * 54, mix(PAL.rust, PAL.void, 0.25), 1)
  }
  s.ell(904, BASE - 226, 7, 7, mix(o.accent, PAL.void, 0.4))
  // 围栏 / 枯树
  for (let x = 260; x < 1040; x += 34) {
    s.rect(x, BASE - 58, 3, 58, mix(c, PAL.void, 0.35))
    s.rect(x, BASE - 44, 3, 8, mix(c, PAL.void, 0.35))
  }
  s.rect(252, BASE - 46, 800, 3, mix(c, PAL.void, 0.32))
  deadTree(s, 300, BASE, 116, mix(c, PAL.void, 0.4), 1.9)
  // 风切雨条
  for (let i = 0; i < 16; i++) {
    const x = hash2(i, 1, o.seed) * W
    const y = 60 + hash2(i, 2, o.seed) * 260
    s.line(x, y, x + 26, y + 12, mix(o.st.fog, PAL.void, 0.3), 1)
  }
}

function drawToxicBasin(s, o) {
  const c = mix(o.st.mid, PAL.toxicDark, 0.28)
  // 盆沿
  s.ell(640, BASE - 20, 420, 84, mix(c, PAL.void, 0.28))
  s.ell(640, BASE - 26, 360, 64, mix(PAL.toxicDark, PAL.void, 0.3))
  pool(s, 350, BASE - 46, 580, 44, mix(PAL.toxic, PAL.void, 0.45), o.accent)
  for (let i = 0; i < 30; i++) {
    const x = 380 + hash2(i, 1, o.seed) * 520
    s.ell(x, BASE - 40 + hash2(i, 2, o.seed) * 26, 3 + hash2(i, 3, o.seed) * 7, 2 + hash2(i, 4, o.seed) * 4, mix(o.accent, PAL.white, 0.16))
  }
  // 石堆 / 桶
  for (let i = 0; i < 10; i++) {
    const x = 240 + hash2(i, 5, o.seed) * 800
    s.ell(x, BASE - 52 - hash2(i, 6, o.seed) * 22, 16 + hash2(i, 7, o.seed) * 26, 8 + hash2(i, 8, o.seed) * 12, mix(c, PAL.void, 0.24))
  }
  s.rect(262, BASE - 96, 34, 52, mix(PAL.rust, PAL.void, 0.28))
  for (let y = BASE - 90; y < BASE - 50; y += 10) s.rect(262, y, 34, 1, mix(PAL.rustDark, PAL.void, 0.2))
  s.px(279, BASE - 97, o.accent)
  // 警示牌
  s.poly([[900, BASE - 60], [944, BASE - 128], [988, BASE - 60]], mix(PAL.ochre, PAL.void, 0.35))
  for (let k = 0; k < 3; k++) s.rect(930 + k * 8, BASE - 96 + k * 10, 14, 3, mix(PAL.void, PAL.ochre, 0.2))
  s.rect(944, BASE - 60, 2, 60, mix(c, PAL.void, 0.3))
  deadTree(s, 1030, BASE, 132, mix(c, PAL.void, 0.4), 2.2)
  // 毒雾
  for (let i = 0; i < 20; i++) {
    const x = 280 + hash2(i, 9, o.seed) * 760
    const y = BASE - 70 - hash2(i, 10, o.seed) * 40
    s.ell(x, y, 12 + hash2(i, 11, o.seed) * 26, 3 + hash2(i, 12, o.seed) * 6, mix(PAL.toxic, PAL.void, 0.55))
  }
}

function drawJungleStation(s, o) {
  const c = mix(o.st.mid, PAL.mossDead, 0.3)
  facade(s, 380, BASE, 420, 150, c, o, 0.12, 4)
  s.rect(364, BASE - 158, 452, 10, mix(c, PAL.void, 0.15))
  // 破损屋顶 / 藤蔓覆盖
  s.poly([[380, BASE - 158], [440, BASE - 196], [500, BASE - 168], [560, BASE - 204], [660, BASE - 176], [740, BASE - 202], [800, BASE - 158]], mix(c, PAL.void, 0.25))
  for (let i = 0; i < 30; i++) {
    const x = 380 + hash2(i, 1, o.seed) * 430
    const y = BASE - 196 + hash2(i, 2, o.seed) * 60
    s.line(x, y, x + (hash2(i, 3, o.seed) - 0.5) * 26, y + 18 + hash2(i, 4, o.seed) * 46, mix(PAL.toxic, PAL.void, 0.45), 1)
    if (i % 3 === 0) s.ell(x + 8, y + 26, 4, 3, mix(PAL.toxicDark, PAL.void, 0.35))
  }
  // 藤架钢架
  for (let k = 0; k < 4; k++) {
    const x = 400 + k * 120
    s.line(x, BASE - 40, x + 20, BASE - 150, mix(c, PAL.void, 0.35), 1)
    s.line(x + 100, BASE - 40, x + 80, BASE - 150, mix(c, PAL.void, 0.35), 1)
  }
  // 树穿墙
  for (const x of [300, 860, 960]) deadTree(s, x, BASE, 160 + (x % 3) * 40, mix(c, PAL.void, 0.32), x * 0.013)
  // 湿地反光
  for (let i = 0; i < 18; i++) {
    const x = 280 + hash2(i, 5, o.seed) * 760
    s.rect(x, BASE - 6 - hash2(i, 6, o.seed) * 8, 10 + hash2(i, 7, o.seed) * 26, 1, mix(PAL.toxic, PAL.void, 0.35))
  }
}

function drawChurch(s, o) {
  const c = mix(o.st.mid, PAL.sandDark, 0.2)
  const trim = mix(c, PAL.boneDeep, 0.2)
  // 中殿
  facade(s, 420, BASE, 420, 170, c, o, 0.12, 4)
  s.poly([[400, BASE - 170], [630, BASE - 238], [860, BASE - 170]], trim)
  // 钟楼
  s.rect(620, BASE - 330, 120, 330, mix(c, PAL.void, 0.1))
  for (let y = BASE - 318; y < BASE - 6; y += 22) s.rect(620, y, 120, 1, mix(c, PAL.void, 0.25))
  s.poly([[610, BASE - 330], [680, BASE - 398], [750, BASE - 330]], trim)
  s.line(610, BASE - 330, 680, BASE - 398, mix(trim, PAL.white, 0.1), 1)
  s.rect(676, BASE - 414, 4, 18, mix(PAL.bone, PAL.void, 0.2))
  s.rect(670, BASE - 408, 16, 4, mix(PAL.bone, PAL.void, 0.2))
  // 钟
  s.ell(680, BASE - 286, 22, 26, mix(PAL.rust, PAL.void, 0.35))
  s.rect(679, BASE - 316, 2, 14, mix(c, PAL.void, 0.3))
  // 玫瑰窗 + 尖窗
  s.ell(680, BASE - 218, 30, 30, mix(PAL.void, o.accent, 0.22))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    s.line(680, BASE - 218, 680 + Math.cos(a) * 28, BASE - 218 + Math.sin(a) * 28, mix(c, PAL.void, 0.4), 1)
  }
  for (let i = 0; i < 3; i++) {
    const x = 460 + i * 110
    s.rect(x, BASE - 140, 14, 54, mix(PAL.void, o.accent, 0.18))
    s.poly([[x, BASE - 140], [x + 7, BASE - 158], [x + 14, BASE - 140]], mix(PAL.void, o.accent, 0.24))
  }
  // 门 + 墓园
  s.poly([[620, BASE], [620, BASE - 96], [680, BASE - 122], [740, BASE - 96], [740, BASE]], mix(PAL.void, PAL.rustDark, 0.25))
  for (let i = 0; i < 9; i++) {
    const x = 280 + i * 40
    s.rect(x, BASE - 30, 3, 30, mix(c, PAL.void, 0.35))
    s.rect(x - 5, BASE - 30, 13, 3, mix(c, PAL.void, 0.35))
  }
}

function drawDataCenter(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.3)
  const neon = mix(o.accent, PAL.void, 0.25)
  // 玻璃幕墙机柜楼
  box(s, 340, BASE - 238, 600, 238, mix(c, PAL.void, 0.18), { step: 28 })
  for (let bay = 0; bay < 6; bay++) {
    const x = 352 + bay * 98
    s.rect(x, BASE - 226, 86, 210, mix(PAL.void, PAL.steelDark, 0.45))
    for (let r = 0; r < 8; r++) {
      const y = BASE - 216 + r * 24
      s.rect(x + 4, y, 78, 18, mix(PAL.void, PAL.ash, 0.4))
      for (let k = 0; k < 9; k++) {
        const r2 = hash2(x + k, y, o.seed)
        s.rect(x + 6 + k * 8, y + 3, 4, 8, r2 < 0.34 ? neon : mix(o.accent, PAL.void, 0.7))
      }
      s.rect(x + 4, y + 18, 78, 1, mix(c, PAL.void, 0.3))
    }
    s.rect(x + 40, BASE - 16, 6, 16, neon)
  }
  // 顶部线缆槽 + 冷却塔
  s.rect(330, BASE - 250, 620, 8, mix(c, PAL.void, 0.34))
  for (let x = 344; x < 940; x += 18) s.rect(x, BASE - 252, 1, 6, mix(c, PAL.void, 0.5))
  for (let k = 0; k < 2; k++) {
    s.rect(960 + k * 52, BASE - 118, 44, 118, mix(c, PAL.void, 0.18))
    for (let y = BASE - 110; y < BASE - 8; y += 12) s.rect(960 + k * 52, y, 44, 1, mix(c, PAL.void, 0.3))
    s.ell(982 + k * 52, BASE - 118, 22, 8, mix(c, PAL.void, 0.3))
  }
  // 外部梯子 / 线缆
  for (let i = 0; i < 8; i++) {
    const x = 360 + i * 74
    s.rect(x, BASE - 238, 2, 40, mix(c, PAL.void, 0.35))
  }
  cable(s, 300, BASE - 210, 350, BASE - 180, 24, mix(c, PAL.void, 0.3))
  cable(s, 940, BASE - 180, 1010, BASE - 140, 18, mix(c, PAL.void, 0.3))
  s.px(350, BASE - 210, o.accent)
}

function drawAiCore(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.3)
  const neon = mix(o.accent, PAL.void, 0.2)
  // 机柜碑
  for (const x of [320, 380, 880, 940]) {
    box(s, x, BASE - 220, 50, 220, mix(c, PAL.void, 0.2), { step: 16 })
    for (let y = BASE - 208; y < BASE - 12; y += 18) {
      for (let k = 0; k < 4; k++) s.rect(x + 6 + k * 11, y, 7, 9, mix(o.accent, PAL.void, 0.55 + (k % 2) * 0.2))
    }
  }
  // 核心球 + 环
  s.ell(640, BASE - 176, 128, 118, mix(c, PAL.void, 0.22))
  s.ell(640, BASE - 176, 112, 104, mix(PAL.void, PAL.steelDark, 0.4))
  for (let k = 1; k < 4; k++) s.ell(640, BASE - 176, 104 - k * 22, 96 - k * 20, mix(PAL.void, neon, 0.16 + k * 0.1))
  s.ell(640, BASE - 176, 34, 34, neon)
  s.ell(640, BASE - 176, 16, 16, mix(PAL.white, o.accent, 0.35))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    s.line(640, BASE - 176, 640 + Math.cos(a) * 120, BASE - 176 + Math.sin(a) * 110, mix(c, PAL.void, 0.4), 1)
  }
  // 悬垂线缆
  for (let i = 0; i < 9; i++) {
    const x = 340 + i * 76
    cable(s, x, BASE - 250, x + 30, BASE - 60 + (i % 3) * 12, 20 + (i % 4) * 10, mix(c, PAL.void, 0.35))
  }
  s.rect(300, BASE - 258, 680, 6, mix(c, PAL.void, 0.3))
  s.rect(300, BASE - 260, 680, 2, mix(o.accent, PAL.void, 0.5))
}

function drawVirusLab(s, o) {
  const c = mix(o.st.mid, PAL.glass, 0.12)
  facade(s, 340, BASE, 420, 150, c, o, 0.16, 4)
  // 培养罐
  for (let k = 0; k < 4; k++) {
    const x = 790 + k * 58
    s.ell(x, BASE - 74, 20, 62, mix(c, PAL.void, 0.16))
    for (let y = BASE - 132; y < BASE - 14; y += 10) s.rect(x - 20, y, 40, 1, mix(c, PAL.void, 0.28))
    s.ell(x, BASE - 58, 12, 30, mix(PAL.toxic, PAL.void, 0.45))
    s.rect(x - 5, BASE - 142, 10, 10, mix(c, PAL.void, 0.35))
    // 裂纹
    for (let i = 0; i < 4; i++) s.line(x + (i - 2) * 4, BASE - 120, x + (i - 2) * 8, BASE - 50, mix(PAL.white, PAL.void, 0.5), 1)
  }
  // 生物危害标志
  s.ell(560, BASE - 118, 26, 26, mix(PAL.void, o.accent, 0.22))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2
    s.ell(560 + Math.cos(a) * 13, BASE - 118 + Math.sin(a) * 13, 8, 8, mix(PAL.void, o.accent, 0.35))
  }
  // 管道 / 废液
  s.rect(340, BASE - 40, 400, 7, mix(c, PAL.rust, 0.25))
  for (let x = 356; x < 740; x += 34) s.rect(x, BASE - 42, 4, 12, mix(c, PAL.void, 0.35))
  pool(s, 840, BASE - 24, 230, 26, mix(PAL.toxicDark, PAL.void, 0.28), o.accent)
  for (let i = 0; i < 6; i++) {
    const x = 360 + i * 66
    s.rect(x, BASE - 150, 40, 3, mix(PAL.bone, PAL.void, 0.5))
  }
}

function drawAlienCenter(s, o) {
  const c = mix(o.st.mid, PAL.glass, 0.14)
  // 穹顶研究楼
  s.ell(640, BASE - 20, 220, 150, mix(c, PAL.void, 0.2))
  s.ell(640, BASE - 20, 200, 136, mix(c, PAL.void, 0.42))
  for (let k = 1; k < 4; k++) s.ell(640, BASE - 20, 200 - k * 40, 136 - k * 30, mix(c, PAL.void, 0.32 + k * 0.06))
  // 培养舱
  for (let k = 0; k < 4; k++) {
    const x = 350 + k * 76
    s.ell(x, BASE - 54, 28, 50, mix(c, PAL.void, 0.2))
    s.ell(x, BASE - 58, 18, 36, mix(o.accent, PAL.void, 0.5))
    s.ell(x, BASE - 62, 8, 18, mix(PAL.white, o.accent, 0.15))
    s.rect(x - 4, BASE - 110, 8, 10, mix(c, PAL.void, 0.3))
  }
  // 尖塔 / 天线
  s.poly([[630, BASE - 150], [650, BASE - 286], [670, BASE - 150]], mix(c, PAL.void, 0.15))
  s.px(650, BASE - 290, o.accent)
  for (let k = 0; k < 5; k++) s.line(650, BASE - 200 - k * 16, 650 + 30, BASE - 220 - k * 16, mix(c, PAL.void, 0.3), 1)
  // 碟 / 悬浮球
  s.ell(930, BASE - 150, 36, 24, mix(c, PAL.void, 0.3))
  s.line(930, BASE - 130, 906, BASE - 60, mix(c, PAL.void, 0.3), 1)
  for (let k = 0; k < 5; k++) {
    const x = 300 + hash2(k, 1, o.seed) * 700
    const y = 120 + hash2(k, 2, o.seed) * 180
    s.ell(x, y, 8, 8, mix(o.accent, PAL.void, 0.3))
    s.ell(x, y, 3, 3, mix(PAL.white, o.accent, 0.25))
  }
}

function drawMilitaryBase(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.22)
  facade(s, 320, BASE, 300, 110, c, o, 0.14, 3)
  facade(s, 640, BASE, 200, 90, mix(c, PAL.void, 0.1), o, 0.12, 2)
  // 瞭望塔
  const tx = 900
  s.rect(tx, BASE - 190, 6, 190, c)
  s.rect(tx + 50, BASE - 190, 6, 190, c)
  for (let y = BASE - 176; y < BASE - 40; y += 16) {
    s.line(tx + 4, y, tx + 52, y + 14, c, 1)
    s.line(tx + 52, y, tx + 4, y + 14, mix(c, PAL.void, 0.3), 1)
  }
  box(s, tx - 12, BASE - 222, 82, 38, mix(c, PAL.void, 0.12))
  windows(s, tx - 12, BASE - 222, 82, 38, mix(c, PAL.void, 0.12), o, 0.2, 9, 12)
  s.rect(tx - 16, BASE - 226, 90, 5, mix(c, PAL.void, 0.2))
  antenna(s, tx + 28, BASE - 226, 38, c, o.accent)
  // 跑道标线
  for (let x = 300; x < 1040; x += 60) s.rect(x, BASE - 8, 34, 2, mix(PAL.bone, PAL.void, 0.55))
  // 围栏
  for (let x = 300; x < 1040; x += 28) {
    s.rect(x, BASE - 54, 2, 54, mix(c, PAL.void, 0.35))
    s.rect(x, BASE - 44, 28, 1, mix(c, PAL.void, 0.25))
  }
  for (let x = 300; x < 1040; x += 24) s.ell(x, BASE - 58, 12, 5, mix(c, PAL.void, 0.3))
  // 军旗 + 沙袋 + 车
  s.rect(580, BASE - 148, 2, 148, mix(c, PAL.void, 0.2))
  s.poly([[582, BASE - 146], [648, BASE - 130], [582, BASE - 108]], mix(o.accent, PAL.void, 0.35))
  for (let x = 300; x < 560; x += 18) s.ell(x, BASE - 12, 13, 8, mix(PAL.sandDark, PAL.void, 0.26))
  s.rect(760, BASE - 52, 100, 26, mix(c, PAL.void, 0.2))
  s.rect(774, BASE - 70, 56, 18, mix(c, PAL.void, 0.3))
  for (const x of [780, 848]) s.ell(x, BASE - 26, 12, 12, mix(PAL.void, c, 0.3))
}

function drawPaperMill(s, o) {
  const c = mix(o.st.mid, PAL.sandDark, 0.18)
  facade(s, 300, BASE, 470, 150, c, o, 0.14, 4)
  // 纸浆大滚筒
  for (let k = 0; k < 3; k++) {
    const x = 560 + k * 74
    s.ell(x, BASE - 96, 30, 30, mix(c, PAL.void, 0.2))
    s.ell(x, BASE - 96, 20, 20, mix(PAL.paper, PAL.void, 0.55))
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      s.line(x, BASE - 96, x + Math.cos(a) * 26, BASE - 96 + Math.sin(a) * 26, mix(PAL.void, c, 0.3), 1)
    }
    s.px(x, BASE - 96, o.accent)
  }
  // 卷纸堆
  for (let k = 0; k < 4; k++) {
    const x = 810 + (k % 2) * 60
    const y = BASE - 30 - Math.floor(k / 2) * 28
    s.ell(x, y, 26, 13, mix(PAL.paper, PAL.void, 0.62))
    s.ell(x, y, 10, 5, mix(PAL.void, PAL.paper, 0.2))
    s.rect(x - 26, y, 52, 2, mix(PAL.void, PAL.paper, 0.3))
  }
  stack(s, 960, BASE, 24, 200, mix(c, PAL.void, 0.1), o)
  steam(s, 972, BASE - 202, 30, 70, mix(o.st.fog, PAL.void, 0.2))
  // 浆池 + 管道
  pool(s, 300, BASE - 34, 200, 34, mix(PAL.paper, PAL.void, 0.7), o.accent)
  s.rect(300, BASE - 76, 470, 8, mix(c, PAL.rust, 0.22))
  for (let x = 320; x < 760; x += 40) s.rect(x, BASE - 78, 5, 12, mix(c, PAL.void, 0.3))
  for (let i = 0; i < 10; i++) {
    const x = 320 + hash2(i, 1, o.seed) * 440
    s.rect(x, BASE - 70 - hash2(i, 2, o.seed) * 60, 12, 3, mix(PAL.paper, PAL.void, 0.65))
  }
}

function drawDigSite(s, o) {
  const c = mix(o.st.mid, PAL.sandDark, 0.26)
  // 勘探方阵（沟槽）
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 300 + col * 116
      const y = BASE - 30 - row * 34
      s.rect(x, y, 96, 28, mix(c, PAL.void, 0.28))
      s.rect(x + 2, y + 2, 92, 24, mix(PAL.void, c, 0.16))
      for (let k = 0; k < 5; k++) s.rect(x + 6 + k * 18, y + 4, 1, 20, mix(c, PAL.void, 0.35))
      s.rect(x, y, 96, 1, mix(PAL.void, PAL.sandDark, 0.3))
    }
  }
  // 断柱
  for (let k = 0; k < 4; k++) {
    const x = 840 + k * 46
    const h = 60 + ((k * 43) % 90)
    s.rect(x, BASE - 60 - h, 20, h, mix(c, PAL.void, 0.08))
    for (let y = BASE - 52 - h; y < BASE - 64; y += 12) s.rect(x, y, 20, 2, mix(c, PAL.void, 0.24))
    s.rect(x - 3, BASE - 64 - h, 26, 4, mix(PAL.sandDark, PAL.void, 0.2))
  }
  // 帐篷 / 筛土架
  s.poly([[240, BASE], [300, BASE - 66], [360, BASE]], mix(PAL.sandDark, PAL.void, 0.3))
  s.rect(320, BASE - 66, 2, 30, mix(c, PAL.void, 0.25))
  s.rect(438, BASE - 92, 60, 4, mix(c, PAL.void, 0.3))
  s.rect(438, BASE - 92, 4, 34, mix(c, PAL.void, 0.3))
  s.rect(494, BASE - 92, 4, 34, mix(c, PAL.void, 0.3))
  s.rect(440, BASE - 60, 56, 3, mix(c, PAL.void, 0.3))
  // 头骨 / 陶片
  s.ell(690, BASE - 14, 9, 8, mix(PAL.boneDark, PAL.void, 0.2))
  s.px(686, BASE - 16, PAL.void)
  s.px(694, BASE - 16, PAL.void)
  for (let i = 0; i < 14; i++) {
    const x = 280 + hash2(i, 1, o.seed) * 760
    s.rect(x, BASE - 6 - hash2(i, 2, o.seed) * 8, 6 + hash2(i, 3, o.seed) * 10, 2, mix(PAL.sandDark, PAL.void, 0.35))
  }
}

function drawSubstation(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.24)
  // 变压器组
  for (let k = 0; k < 3; k++) {
    const x = 330 + k * 150
    box(s, x, BASE - 112, 90, 112, mix(c, PAL.void, 0.14), { step: 12 })
    s.rect(x + 4, BASE - 124, 82, 12, mix(c, PAL.void, 0.28))
    for (let i = 0; i < 4; i++) {
      s.rect(x + 10 + i * 20, BASE - 142, 5, 18, mix(PAL.boneDark, PAL.void, 0.35))
      s.rect(x + 8 + i * 20, BASE - 146, 9, 4, mix(PAL.bone, PAL.void, 0.4))
    }
    for (let y = BASE - 100; y < BASE - 8; y += 14) s.rect(x, y, 90, 1, mix(c, PAL.void, 0.3))
    s.px(x + 45, BASE - 60, mix(o.accent, PAL.void, 0.2))
  }
  // 高压塔
  pylon(s, 900, BASE, 218, c)
  pylon(s, 1030, BASE, 168, mix(c, PAL.void, 0.1))
  // 电缆下垂
  cable(s, 250, BASE - 206, 430, BASE - 160, 34, mix(c, PAL.void, 0.3))
  cable(s, 430, BASE - 160, 610, BASE - 180, 26, mix(c, PAL.void, 0.3))
  cable(s, 610, BASE - 180, 900, BASE - 210, 40, mix(c, PAL.void, 0.3))
  cable(s, 900, BASE - 210, 1030, BASE - 162, 30, mix(c, PAL.void, 0.3))
  // 电弧 / 围栏
  for (const [x, y] of [[376, BASE - 150], [526, BASE - 146], [900, BASE - 216]]) {
    for (let i = 0; i < 8; i++) {
      const a = hash2(i, x, o.seed) * Math.PI * 2
      s.px(x + Math.cos(a) * (4 + i), y + Math.sin(a) * (4 + i), mix(o.accent, PAL.white, 0.25))
    }
  }
  for (let x = 250; x < 1060; x += 26) {
    s.rect(x, BASE - 46, 2, 46, mix(c, PAL.void, 0.3))
    s.rect(x, BASE - 40, 26, 1, mix(c, PAL.void, 0.22))
  }
}

function drawBunker(s, o) {
  const c = mix(o.st.mid, PAL.boneDeep, 0.3)
  const conc = mix(c, PAL.void, 0.12)
  // 半掩体主楼（顶部覆土）
  facade(s, 380, BASE, 520, 150, conc, o, 0.1, 4)
  s.poly(
    [[350, BASE - 150], [450, BASE - 206], [700, BASE - 206], [900, BASE - 150], [880, BASE - 144], [420, BASE - 144]],
    mix(conc, PAL.dust, 0.28),
  )
  for (let i = 0; i < 90; i++) {
    const x = 380 + hash2(i, 1, o.seed) * 500
    const y = BASE - 152 - hash2(i, 2, o.seed) * 44
    s.px(x, y, mix(PAL.dust, PAL.void, 0.2), 1)
  }
  // 射击孔
  for (let k = 0; k < 4; k++) {
    const x = 420 + k * 120
    s.rect(x, BASE - 118, 34, 10, mix(PAL.void, c, 0.15))
    s.rect(x, BASE - 118, 34, 1, mix(c, PAL.void, 0.45))
  }
  // 防爆门
  s.rect(600, BASE - 92, 80, 92, mix(c, PAL.rustDark, 0.18))
  s.rect(606, BASE - 86, 68, 86, mix(c, PAL.void, 0.3))
  for (let y = BASE - 82; y < BASE - 6; y += 12) s.rect(606, y, 68, 1, mix(c, PAL.steel, 0.2))
  rivets(s, 606, BASE - 88, 68, 12, mix(PAL.boneDark, PAL.void, 0.2))
  // 顶部天线 + 电缆
  antenna(s, 690, BASE - 206, 56, mix(c, PAL.void, 0.3), mix(o.accent, PAL.white, 0.2))
  antenna(s, 560, BASE - 200, 34, mix(c, PAL.void, 0.3), mix(o.accent, PAL.white, 0.2))
  cable(s, 690, BASE - 262, 560, BASE - 234, 18, mix(c, PAL.void, 0.35))
  // 沙袋墙
  for (let x = 260; x < 1060; x += 22) {
    const dy = x % 44 ? 4 : 0
    s.ell(x, BASE - 12 - dy, 13, 9, mix(PAL.dust, PAL.void, 0.24))
    s.rect(x - 12, BASE - 16 - dy, 24, 1, mix(PAL.sandDark, PAL.void, 0.3))
  }
  // 铁丝网
  for (let x = 250; x < 1070; x += 30) {
    s.rect(x, BASE - 40, 2, 40, mix(c, PAL.void, 0.42))
    s.line(x, BASE - 40, x + 30, BASE - 24, mix(c, PAL.void, 0.3), 1)
    s.line(x, BASE - 24, x + 30, BASE - 40, mix(c, PAL.void, 0.22), 1)
  }
}

function drawMineHead(s, o) {
  const c = mix(o.st.mid, PAL.rustDark, 0.3)
  const dk = mix(c, PAL.void, 0.25)
  // 井架（四腿塔 + 顶部滑轮）
  const hx = 640
  const top = BASE - 300
  for (const dx of [-58, -20, 20, 58]) {
    s.line(hx + dx, BASE, hx + dx * 0.28, top, mix(c, PAL.void, dx > 0 ? 0.28 : 0.1), 1)
  }
  for (let k = 1; k <= 6; k++) {
    const t = k / 6
    const half = 58 - 30 * t
    const y = BASE - t * 300
    s.line(hx - half, y, hx + half, y, mix(c, PAL.void, 0.2), 1)
    s.line(hx - half, y, hx + half - 12, y - 44, dk, 1)
    s.line(hx + half, y, hx - half + 12, y - 44, dk, 1)
  }
  s.ell(hx, top - 14, 34, 34, mix(c, PAL.void, 0.16))
  s.ell(hx, top - 14, 26, 26, dk)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    s.line(hx, top - 14, hx + Math.cos(a) * 24, top - 14 + Math.sin(a) * 24, mix(c, PAL.void, 0.4), 1)
  }
  s.rect(hx, top - 44, 2, 34, dk)
  cable(s, hx, top + 16, hx + 150, BASE - 20, 10, mix(c, PAL.void, 0.4))
  // 提升机库
  facade(s, 300, BASE, 240, 100, mix(c, PAL.void, 0.1), o, 0.14, 3)
  s.poly([[292, BASE - 100], [340, BASE - 136], [500, BASE - 136], [548, BASE - 100]], mix(dk, PAL.rust, 0.2))
  for (let x = 306; x < 536; x += 18) s.rect(x, BASE - 98, 3, 98, mix(PAL.void, c, 0.3))
  // 煤堆
  s.poly([[1020, BASE], [1080, BASE - 66], [1160, BASE - 40], [1210, BASE]], mix(PAL.void, c, 0.16))
  s.speck(1020, BASE - 62, 190, 60, mix(PAL.void, PAL.rust, 0.18), 0.06, 0.5)
  // 轨道 + 矿车
  s.rect(180, BASE - 6, 900, 2, mix(PAL.steelDark, PAL.void, 0.2))
  for (let x = 220; x < 1050; x += 16) s.rect(x, BASE - 10, 10, 4, mix(PAL.rustDark, PAL.void, 0.25))
  s.rect(860, BASE - 34, 46, 26, mix(PAL.rustDark, PAL.void, 0.2))
  s.rect(860, BASE - 34, 46, 3, mix(PAL.rust, PAL.void, 0.1))
  s.ell(868, BASE - 8, 5, 5, mix(PAL.void, c, 0.2))
  s.ell(898, BASE - 8, 5, 5, mix(PAL.void, c, 0.2))
}

function drawThermal(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.24)
  const dk = mix(c, PAL.void, 0.24)
  const tower = (x, base, w, h) => {
    for (let y = 0; y < h; y++) {
      const t = y / h
      const ww = Math.round(w * (0.56 + 0.44 * Math.pow(1 - t, 1.8)))
      s.rect(x - ww / 2, base - h + y, ww, 1, mix(dk, PAL.void, 0.06 + t * 0.14))
    }
    for (let y = base - h + 10; y < base - 6; y += 12) {
      const t = (base - y) / h
      const ww = Math.round(w * (0.56 + 0.44 * Math.pow(1 - t, 1.8)))
      s.rect(x - ww / 2, y, ww, 1, mix(dk, PAL.void, 0.26))
    }
    s.rect(x - w / 2, base - h - 4, w, 5, mix(c, PAL.void, 0.2))
    steam(s, x, base - h - 2, w * 0.8, 96, mix(PAL.dustLight, PAL.void, 0.22))
  }
  tower(340, BASE, 150, 210)
  tower(560, BASE, 132, 178)
  // 汽轮机房
  facade(s, 680, BASE, 300, 96, mix(c, PAL.void, 0.1), o, 0.18, 4)
  s.poly([[680, BASE - 96], [740, BASE - 124], [920, BASE - 124], [980, BASE - 96]], mix(dk, PAL.rustDark, 0.2))
  // 烟囱
  stack(s, 1000, BASE, 26, 250, mix(c, PAL.void, 0.1), o)
  stack(s, 1052, BASE, 20, 196, mix(c, PAL.void, 0.14), o)
  steam(s, 1013, BASE - 252, 40, 110, mix(PAL.ashPale, PAL.void, 0.2))
  // 输煤栈桥
  for (let x = 300; x < 1000; x++) {
    const y = BASE - 70 - Math.sin(((x - 300) / 700) * Math.PI) * 34
    s.px(x, y, mix(c, PAL.void, 0.3), 1)
    if (x % 14 === 0) s.rect(x, y, 3, BASE - y, mix(c, PAL.void, 0.42))
  }
  for (let x = 300; x < 1000; x += 20) s.rect(x, BASE - 66, 6, 6, mix(dk, PAL.void, 0.1))
}

function drawNuclear(s, o) {
  const c = mix(o.st.mid, PAL.steelLight, 0.18)
  const dk = mix(c, PAL.void, 0.28)
  // 主安全壳
  s.rect(400, BASE - 150, 300, 150, mix(c, PAL.void, 0.1))
  s.ell(550, BASE - 152, 150, 118, mix(c, PAL.void, 0.06))
  s.ell(550, BASE - 152, 146, 114, dk)
  s.rect(402, BASE - 150, 296, 150, mix(c, PAL.void, 0.1))
  for (let y = BASE - 252; y < BASE - 8; y += 22) {
    const t = Math.abs(y - (BASE - 160)) / 120
    const rr = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 146)
    if (rr > 2) s.rect(550 - rr, y, rr * 2, 1, mix(c, PAL.void, 0.16))
  }
  for (let k = -9; k <= 9; k++) {
    s.line(550 + k * 16, BASE - 262, 550 + k * 10, BASE - 40, mix(c, PAL.void, 0.2), 1)
  }
  // 冷却塔
  for (const [x, w, h] of [[900, 160, 214], [1100, 120, 160]]) {
    for (let y = 0; y < h; y++) {
      const t = y / h
      const ww = Math.round(w * (0.56 + 0.44 * Math.pow(1 - t, 1.7)))
      s.rect(x - ww / 2, BASE - h + y, ww, 1, mix(dk, PAL.void, 0.05 + t * 0.12))
    }
    for (let y = BASE - h + 12; y < BASE - 8; y += 16) {
      const t = (BASE - y) / h
      const ww = Math.round(w * (0.56 + 0.44 * Math.pow(1 - t, 1.7)))
      s.rect(x - ww / 2, y, ww, 1, mix(dk, PAL.void, 0.24))
    }
    steam(s, x, BASE - h - 2, w * 0.7, 84, mix(PAL.dustLight, PAL.void, 0.24))
  }
  // 辐射标识
  s.ell(550, BASE - 200, 26, 26, mix(PAL.void, o.accent, 0.3))
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2 - 0.5
    s.poly(
      [
        [550, BASE - 200],
        [550 + Math.cos(a0) * 24, BASE - 200 + Math.sin(a0) * 24],
        [550 + Math.cos(a0 + 0.8) * 24, BASE - 200 + Math.sin(a0 + 0.8) * 24],
      ],
      mix(PAL.warn, PAL.void, 0.2),
    )
  }
  s.ell(550, BASE - 200, 6, 6, mix(PAL.void, o.accent, 0.2))
  // 警示条
  for (let x = 380; x < 720; x += 18) {
    s.rect(x, BASE - 24, 9, 6, mix(PAL.warn, PAL.void, 0.3))
    s.rect(x, BASE - 24, 4, 6, mix(PAL.void, o.accent, 0.3))
  }
  // 输电塔
  pylon(s, 250, BASE, 150, mix(c, PAL.void, 0.2))
  pylon(s, 330, BASE, 118, mix(c, PAL.void, 0.25))
  cable(s, 250, BASE - 140, 330, BASE - 108, 20, mix(c, PAL.void, 0.35))
}

function drawRadiation(s, o) {
  const c = mix(o.st.mid, PAL.toxicDark, 0.3)
  const glow = mix(PAL.toxicGlow, o.accent, 0.3)
  // 崩塌楼群
  for (let i = 0; i < 5; i++) {
    const x = 250 + i * 130 + hash2(i, 1, o.seed) * 40
    const w = 80 + hash2(i, 2, o.seed) * 60
    const h = 60 + hash2(i, 3, o.seed) * 130
    facade(s, x, BASE, w, h, mix(c, PAL.void, 0.1 + hash2(i, 4, o.seed) * 0.2), o, 0.05, 3)
    s.poly([[x, BASE - h], [x + w * 0.3, BASE - h - 16], [x + w * 0.6, BASE - h + 6], [x + w, BASE - h]], mix(c, PAL.void, 0.3))
    for (let k = 0; k < 6; k++) {
      const xx = x + 6 + hash2(k, i, o.seed) * (w - 12)
      s.rect(xx, BASE - h + 10, 3, 32 + hash2(k, i + 9, o.seed) * 40, mix(PAL.void, c, 0.3))
    }
  }
  // 毒液池
  pool(s, 380, BASE - 26, 260, 34, mix(PAL.toxicDark, PAL.void, 0.18), glow)
  pool(s, 780, BASE - 20, 180, 26, mix(PAL.toxicDark, PAL.void, 0.24), glow)
  // 辐射桶
  for (let i = 0; i < 7; i++) {
    const x = 300 + hash2(i, 1, o.seed) * 680
    const y = BASE - 18 - hash2(i, 2, o.seed) * 8
    s.rect(x, y, 16, 24, mix(PAL.rustDark, PAL.toxicDark, 0.35))
    s.rect(x, y + 5, 16, 1, mix(PAL.warn, PAL.void, 0.3))
    s.rect(x, y + 12, 16, 1, mix(PAL.warn, PAL.void, 0.3))
    s.px(x + 8, y + 9, glow, 1)
    s.rect(x, y, 16, 1, mix(PAL.rust, PAL.void, 0.2))
  }
  // 枯树
  deadTree(s, 200, BASE, 96, mix(PAL.ink, o.accent, 0.1), 0x31)
  deadTree(s, 1090, BASE, 120, mix(PAL.ink, o.accent, 0.14), 0x47)
  // 警示牌
  for (const [x, y] of [[600, BASE - 60], [950, BASE - 40]]) {
    s.rect(x, y, 3, 60, mix(PAL.steelDark, PAL.void, 0.2))
    s.poly([[x - 20, y], [x + 23, y], [x + 23, y + 20], [x - 20, y + 20]], mix(PAL.warn, PAL.void, 0.34))
    for (let k = 0; k < 3; k++) {
      s.poly(
        [
          [x + 1, y + 10],
          [x + 1 + Math.cos(k * 2.094) * 8, y + 10 + Math.sin(k * 2.094) * 8],
          [x + 1 + Math.cos(k * 2.094 + 0.7) * 8, y + 10 + Math.sin(k * 2.094 + 0.7) * 8],
        ],
        mix(PAL.void, o.accent, 0.15),
      )
    }
  }
  // 地表毒草
  for (let i = 0; i < 70; i++) {
    const x = hash2(i, 5, o.seed) * W
    const y = BASE - 4 + hash2(i, 6, o.seed) * 14
    s.line(x, y, x + (hash2(i, 7, o.seed) - 0.5) * 8, y - 4 - hash2(i, 8, o.seed) * 7, mix(PAL.toxicDark, o.accent, 0.3), 1)
  }
}

function drawArsenal(s, o) {
  const c = mix(o.st.mid, PAL.mossDead, 0.34)
  const dark = mix(c, PAL.void, 0.28)
  // 掩体排
  for (let k = 0; k < 4; k++) {
    const x = 280 + k * 190
    box(s, x, BASE - 84, 150, 84, mix(dark, PAL.void, 0.04), { step: 18, brick: true })
    s.rect(x, BASE - 92, 150, 8, mix(c, PAL.void, 0.2))
    crenels(s, x, BASE - 92, 150, mix(c, PAL.void, 0.14), 18)
    s.rect(x + 60, BASE - 58, 28, 58, mix(PAL.void, o.accent, 0.14))
    s.rect(x + 62, BASE - 56, 24, 54, mix(PAL.void, c, 0.2))
  }
  // 弹药箱堆
  for (let i = 0; i < 12; i++) {
    const x = 240 + hash2(i, 1, o.seed) * 820
    const y = BASE - 10 - hash2(i, 2, o.seed) * 6
    s.rect(x, y - 18, 26, 18, mix(PAL.mossDead, PAL.void, 0.3))
    s.rect(x, y - 18, 26, 2, mix(PAL.mossDead, PAL.white, 0.12))
    s.rect(x + 3, y - 14, 20, 1, mix(PAL.void, o.accent, 0.3))
    s.rect(x + 3, y - 9, 20, 1, mix(PAL.void, o.accent, 0.3))
  }
  // 瞭望塔
  const tx = 1010
  for (const dx of [-26, 26]) {
    s.line(tx + dx, BASE, tx + dx * 0.55, BASE - 190, dark, 1)
    s.rect(tx + dx * 0.55 - 1, BASE - 230, 3, 44, dark)
  }
  for (let y = BASE - 186; y < BASE - 20; y += 28) {
    const half = Math.round(26 * ((BASE - y) / 210))
    s.line(tx - half, y, tx + half, y + 28, mix(dark, PAL.void, 0.3), 1)
  }
  box(s, tx - 42, BASE - 268, 84, 46, mix(c, PAL.void, 0.16), { step: 12 })
  s.rect(tx - 42, BASE - 268, 84, 3, mix(c, PAL.white, 0.1))
  s.poly([[tx - 48, BASE - 268], [tx, BASE - 292], [tx + 48, BASE - 268]], mix(dark, PAL.void, 0.1))
  for (let x = tx - 36; x < tx + 36; x += 14) s.rect(x, BASE - 254, 8, 12, mix(PAL.void, o.accent, 0.28))
  antenna(s, tx, BASE - 292, 34, dark, mix(o.accent, PAL.white, 0.15))
  // 铁丝网 + 迷彩网
  for (let x = 240; x < 1080; x += 34) {
    s.rect(x, BASE - 34, 2, 34, mix(dark, PAL.void, 0.3))
    s.line(x, BASE - 34, x + 34, BASE - 18, mix(dark, PAL.void, 0.22), 1)
    s.line(x, BASE - 18, x + 34, BASE - 34, mix(dark, PAL.void, 0.16), 1)
  }
  for (let i = 0; i < 6; i++) {
    const x = 300 + i * 128
    s.poly(
      [[x, BASE - 110], [x + 30, BASE - 138], [x + 90, BASE - 132], [x + 120, BASE - 104], [x + 60, BASE - 96]],
      mix(PAL.mossDead, PAL.void, 0.3),
    )
  }
}

function drawSpaceport(s, o) {
  const c = mix(o.st.mid, PAL.steelWhite, 0.14)
  const dark = mix(c, PAL.void, 0.32)
  // 发射台
  s.rect(300, BASE - 40, 640, 40, mix(dark, PAL.void, 0.1))
  for (let x = 300; x < 940; x += 24) s.rect(x, BASE - 40, 3, 40, mix(PAL.warn, PAL.void, 0.36))
  s.rect(300, BASE - 44, 640, 4, mix(c, PAL.void, 0.2))
  // 火箭
  s.rect(588, BASE - 300, 60, 260, mix(PAL.bone, PAL.void, 0.28))
  s.poly([[588, BASE - 300], [618, BASE - 356], [648, BASE - 300]], mix(PAL.bone, PAL.void, 0.22))
  s.rect(588, BASE - 300, 60, 1, mix(PAL.bone, PAL.white, 0.2))
  for (let y = BASE - 292; y < BASE - 54; y += 26) s.rect(588, y, 60, 1, mix(PAL.void, c, 0.26))
  for (let y = BASE - 280; y < BASE - 60; y += 26) s.rect(588, y, 60, 2, mix(o.accent, PAL.void, 0.34))
  for (const dx of [-1, 1]) {
    s.poly([[618 + dx * 30, BASE - 92], [618 + dx * 66, BASE - 34], [618 + dx * 30, BASE - 34]], mix(PAL.bone, PAL.void, 0.34))
  }
  s.rect(606, BASE - 54, 12, 14, mix(dark, PAL.void, 0.2))
  s.rect(630, BASE - 54, 12, 14, mix(dark, PAL.void, 0.2))
  // 服务塔
  for (let y = BASE - 8; y > BASE - 330; y -= 16) {
    const half = Math.round(50 + 10 * ((BASE - y) / 330))
    s.rect(680 - half, y, 5, 16, mix(dark, PAL.void, 0.1))
    s.rect(680 + half, y, 5, 16, dark)
    s.line(680 - half, y, 680 + half, y - 16, mix(dark, PAL.void, 0.3), 1)
    s.line(680 + half, y, 680 - half, y - 16, mix(dark, PAL.void, 0.3), 1)
  }
  s.rect(680 - 62, BASE - 340, 126, 6, mix(dark, PAL.void, 0.06))
  s.line(680, BASE - 336, 618, BASE - 300, mix(dark, PAL.void, 0.4), 1)
  s.line(680, BASE - 336, 648, BASE - 300, mix(dark, PAL.void, 0.4), 1)
  // 储料罐
  for (const [x, h] of [[250, 130], [1040, 150], [1130, 100]]) {
    s.rect(x - 34, BASE - h, 68, h, mix(PAL.boneDark, PAL.void, 0.34))
    s.ell(x, BASE - h, 34, 12, mix(PAL.boneDark, PAL.void, 0.28))
    for (let y = BASE - h + 14; y < BASE - 10; y += 22) s.rect(x - 34, y, 68, 1, mix(PAL.void, c, 0.22))
    s.rect(x - 34, BASE - h + 6, 68, 3, mix(o.accent, PAL.void, 0.42))
  }
  // 探照灯
  for (const x of [300, 940]) {
    s.rect(x - 2, BASE - 170, 5, 130, dark)
    s.poly([[x - 16, BASE - 190], [x + 16, BASE - 190], [x + 10, BASE - 168], [x - 10, BASE - 168]], mix(c, PAL.void, 0.2))
    s.glow(x, BASE - 180, 20, mix(o.accent, PAL.white, 0.3), 0.14)
  }
  // 远端天线阵
  for (let i = 0; i < 5; i++) antenna(s, 340 + i * 48, BASE - 44, 26 + i * 8, mix(dark, PAL.void, 0.2), mix(o.accent, PAL.white, 0.2))
}

function drawSolar(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.26)
  const glass = mix(PAL.glass, PAL.void, 0.4)
  // 面板阵列（三排透视）
  for (let row = 0; row < 3; row++) {
    const ry = BASE - 20 - row * 44
    const sc = 1 - row * 0.16
    const off = row * 22
    for (let i = 0; i < 10; i++) {
      const x = 210 + i * 88 * sc + off
      const w = 66 * sc
      const h = 34 * sc
      s.poly(
        [[x, ry], [x + w, ry - h * 0.34], [x + w + 10, ry - h], [x + 10, ry - h * 0.66]],
        mix(glass, PAL.void, 0.12),
      )
      s.poly(
        [[x, ry], [x + w, ry - h * 0.34], [x + w, ry - h * 0.34 - 3], [x, ry - 3]],
        mix(glass, PAL.void, 0.05),
      )
      for (let k = 1; k < 4; k++) {
        s.line(x + k * w * 0.25, ry - k * h * 0.09, x + k * w * 0.25 + 10, ry - h + k * h * 0.12, mix(PAL.void, c, 0.2), 1)
      }
      s.line(x + w * 0.3, ry - 2, x + w * 0.7, ry - h * 0.7, mix(o.accent, PAL.white, 0.16), 1)
      s.rect(x + 4, ry, 3, 18 * sc, mix(c, PAL.void, 0.3))
      s.rect(x + w - 8, ry, 3, 18 * sc, mix(c, PAL.void, 0.3))
    }
  }
  // 控制室
  facade(s, 980, BASE, 200, 96, mix(c, PAL.void, 0.12), o, 0.24, 3)
  s.poly([[980, BASE - 96], [1020, BASE - 122], [1140, BASE - 122], [1180, BASE - 96]], mix(c, PAL.void, 0.2))
  // 逆变器组
  for (let i = 0; i < 4; i++) box(s, 940 + i * 24, BASE - 46, 20, 46, mix(PAL.steelDark, PAL.void, 0.2), { step: 10 })
  pylon(s, 880, BASE, 150, mix(c, PAL.void, 0.2))
  cable(s, 880, BASE - 142, 1010, BASE - 120, 18, mix(c, PAL.void, 0.36))
  // 沙尘条纹
  for (let i = 0; i < 24; i++) {
    const y = BASE - 8 - hash2(i, 1, o.seed) * 40
    s.rect(hash2(i, 2, o.seed) * W, y, 40 + hash2(i, 3, o.seed) * 90, 1, mix(PAL.sandDark, PAL.void, 0.4))
  }
}

function drawCastle(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.3)
  const dk = mix(c, PAL.void, 0.34)
  // 主堡
  box(s, 430, BASE - 270, 420, 270, mix(dk, PAL.void, 0.02), { step: 26, brick: true })
  crenels(s, 430, BASE - 270, 420, mix(c, PAL.void, 0.18), 26)
  // 双塔
  for (const [x, w, h] of [[330, 118, 350], [830, 118, 300]]) {
    box(s, x, BASE - h, w, h, mix(dk, PAL.void, 0.14), { step: 22, brick: true })
    crenels(s, x, BASE - h, w, mix(c, PAL.void, 0.2), 22)
    s.poly([[x - 10, BASE - h], [x + w / 2, BASE - h - 70], [x + w + 10, BASE - h]], mix(c, PAL.rustDark, 0.2))
    s.ell(x + w / 2, BASE - h + 26, 14, 20, mix(PAL.void, o.accent, 0.2))
  }
  // 破口 / 裂缝
  s.poly([[600, BASE - 270], [640, BASE - 236], [628, BASE - 180], [660, BASE - 120], [630, BASE - 60], [620, BASE]], mix(PAL.void, c, 0.2))
  for (let i = 0; i < 18; i++) {
    const x = 450 + hash2(i, 1, o.seed) * 380
    s.rect(x, BASE - 250 + hash2(i, 2, o.seed) * 200, 2, 20 + hash2(i, 3, o.seed) * 50, mix(PAL.void, c, 0.25))
  }
  // 旗帜
  for (const [x, y] of [[389, BASE - 420], [889, BASE - 370]]) {
    s.rect(x, y, 2, 46, dk)
    s.poly([[x + 2, y], [x + 40, y + 12], [x + 2, y + 26]], mix(o.accent, PAL.void, 0.34))
  }
  // 城墙 + 吊桥
  s.rect(180, BASE - 74, 940, 74, mix(dk, PAL.void, 0.22))
  for (let y = BASE - 62; y < BASE; y += 14) for (let x = 190; x < 1110; x += 46) s.rect(x, y, 40, 1, mix(PAL.void, c, 0.2))
  for (let x = 180; x < 1120; x += 40) crenels(s, x, BASE - 74, 40, mix(c, PAL.void, 0.24), 14)
  s.rect(600, BASE - 20, 90, 20, mix(PAL.rustDark, PAL.void, 0.2))
  for (let i = 0; i < 5; i++) s.rect(604 + i * 18, BASE - 18, 2, 18, mix(PAL.rust, PAL.void, 0.2))
  // 火盆
  for (const x of [430, 820]) {
    s.rect(x, BASE - 96, 6, 22, dk)
    s.ell(x + 3, BASE - 100, 12, 6, mix(o.accent, PAL.void, 0.2))
    s.glow(x + 3, BASE - 106, 26, o.accent, 0.18)
    for (let i = 0; i < 10; i++) {
      s.px(x + 3 + (hash2(i, 1, o.seed) - 0.5) * 12, BASE - 108 - hash2(i, 2, o.seed) * 16, mix(o.accent, PAL.white, 0.3), 1)
    }
  }
}

function drawCrypt(s, o) {
  const c = mix(o.st.mid, PAL.ink, 0.3)
  const dk = mix(c, PAL.void, 0.4)
  // 陵墓主体
  box(s, 460, BASE - 180, 340, 180, dk, { step: 24, brick: true })
  s.poly([[440, BASE - 180], [630, BASE - 300], [820, BASE - 180]], mix(dk, PAL.void, 0.06))
  crenels(s, 440, BASE - 180, 380, mix(c, PAL.void, 0.1), 30)
  // 尖塔群
  for (const [x, w, h] of [[330, 86, 270], [900, 86, 300], [1180, 70, 210]]) {
    box(s, x, BASE - h, w, h, mix(dk, PAL.void, 0.12), { step: 20, brick: true })
    s.poly([[x - 8, BASE - h], [x + w / 2, BASE - h - 92], [x + w + 8, BASE - h]], mix(PAL.void, c, 0.1))
    s.rect(x + w / 2 - 1, BASE - h - 108, 3, 18, mix(PAL.void, c, 0.18))
    s.ell(x + w / 2, BASE - h + 30, 10, 18, mix(PAL.void, o.accent, 0.3))
  }
  // 血窗
  s.poly([[600, BASE - 162], [630, BASE - 244], [660, BASE - 162]], mix(PAL.bloodDark, PAL.void, 0.3))
  s.poly([[610, BASE - 166], [630, BASE - 232], [650, BASE - 166]], mix(PAL.blood, o.accent, 0.4))
  s.glow(630, BASE - 190, 60, o.accent, 0.18)
  // 大门 + 铁栅
  s.poly([[590, BASE], [590, BASE - 96], [670, BASE - 96], [670, BASE]], mix(PAL.void, c, 0.18))
  for (let x = 594; x < 668; x += 8) s.rect(x, BASE - 94, 2, 94, mix(PAL.steelDark, PAL.void, 0.24))
  for (let y = BASE - 80; y < BASE; y += 20) s.rect(590, y, 80, 2, mix(PAL.steelDark, PAL.void, 0.24))
  // 铁栅栏
  for (let x = 180; x < 1120; x += 26) {
    s.rect(x, BASE - 56, 2, 56, mix(PAL.steelDark, PAL.void, 0.3))
    s.poly([[x - 3, BASE - 56], [x + 1, BASE - 66], [x + 5, BASE - 56]], mix(PAL.steelDark, PAL.void, 0.22))
  }
  s.rect(180, BASE - 40, 940, 2, mix(PAL.steelDark, PAL.void, 0.3))
  // 棺木
  for (const [x, rot] of [[250, 0], [1000, 1]]) {
    s.poly([[x, BASE - 12], [x + 14, BASE - 34], [x + 54, BASE - 32], [x + 62, BASE - 10], [x + 32, BASE - 2]], mix(PAL.rustDark, PAL.void, 0.3))
    s.line(x + 16, BASE - 28, x + 52, BASE - 24, mix(PAL.rust, PAL.void, 0.2), 1)
    if (rot) s.line(x + 10, BASE - 18, x + 56, BASE - 14, mix(PAL.boneDark, PAL.void, 0.2), 1)
  }
  // 蝙蝠
  for (let i = 0; i < 7; i++) {
    const x = 380 + hash2(i, 1, o.seed) * 520
    const y = BASE - 340 + hash2(i, 2, o.seed) * 120
    s.line(x - 6, y, x, y - 3, mix(o.accent, PAL.void, 0.3), 1)
    s.line(x, y - 3, x + 6, y, mix(o.accent, PAL.void, 0.3), 1)
    s.px(x, y - 3, mix(PAL.void, o.accent, 0.4), 1)
  }
  // 血池
  pool(s, 470, BASE - 12, 90, 16, mix(PAL.bloodDark, PAL.void, 0.2), o.accent)
}

function drawSwamp(s, o) {
  const c = mix(o.st.mid, PAL.mossDead, 0.36)
  const wt = mix(PAL.waterDeep, PAL.toxicDark, 0.25)
  // 高脚屋
  box(s, 500, BASE - 128, 220, 58, mix(c, PAL.void, 0.24), { step: 12 })
  s.poly([[488, BASE - 128], [610, BASE - 176], [732, BASE - 128]], mix(PAL.mossDead, PAL.void, 0.36))
  s.rect(520, BASE - 70, 6, 70, mix(PAL.rustDark, PAL.void, 0.24))
  s.rect(690, BASE - 70, 6, 70, mix(PAL.rustDark, PAL.void, 0.24))
  s.rect(510, BASE - 70, 6, 52, mix(PAL.rustDark, PAL.void, 0.24))
  s.rect(700, BASE - 70, 6, 52, mix(PAL.rustDark, PAL.void, 0.24))
  s.rect(560, BASE - 112, 16, 20, mix(PAL.void, o.accent, 0.25))
  s.rect(640, BASE - 112, 16, 20, mix(PAL.void, o.accent, 0.25))
  // 沼泽树（气根 + 苔藓）
  for (const [x, h, sd] of [[230, 176, 0x11], [340, 130, 0x23], [940, 200, 0x35], [1080, 150, 0x47], [1180, 118, 0x59]]) {
    s.thick(x, BASE - 30, x - 8, BASE - h, Math.max(3, h * 0.05), mix(PAL.ink, c, 0.3))
    for (let i = 0; i < 5; i++) {
      const t = 0.4 + i * 0.12
      const bx = x + (hash2(i, sd, o.seed) - 0.5) * 40
      s.thick(x - 8, BASE - h * t, bx, BASE - h * t - 24, 2, mix(PAL.ink, c, 0.34))
    }
    for (let i = 0; i < 3; i++) {
      const rx = x - 12 + i * 10
      s.line(rx, BASE - 26, rx - 6, BASE - 4, mix(PAL.ink, c, 0.4), 1)
    }
    for (let i = 0; i < 18; i++) {
      const yy = BASE - h * 0.5 + hash2(i, sd, o.seed) * h * 0.5
      s.px(x - 8 + (hash2(i, sd + 1, o.seed) - 0.5) * 10, yy, mix(PAL.mossDead, o.accent, 0.15), 1)
    }
  }
  // 水面 / 气泡
  s.rect(0, BASE - 30, W, 30, wt)
  for (let i = 0; i < 30; i++) {
    const x = hash2(i, 1, o.seed) * W
    const y = BASE - 28 + hash2(i, 2, o.seed) * 26
    s.rect(x, y, 20 + hash2(i, 3, o.seed) * 50, 1, mix(wt, PAL.mossDead, 0.2))
    if (hash2(i, 4, o.seed) > 0.7) s.px(x + 6, y - 2, mix(o.accent, PAL.white, 0.2), 1)
  }
  // 芦苇
  for (let i = 0; i < 60; i++) {
    const x = hash2(i, 5, o.seed) * W
    const y = BASE - 26 + hash2(i, 6, o.seed) * 16
    const hh = 12 + hash2(i, 7, o.seed) * 26
    s.line(x, y, x + (hash2(i, 8, o.seed) - 0.5) * 8, y - hh, mix(PAL.weed, PAL.void, 0.25), 1)
    s.rect(x - 1, y - hh - 2, 3, 4, mix(PAL.mossDead, PAL.void, 0.2))
  }
}

function drawDeadForest(s, o) {
  const c = mix(o.st.mid, PAL.mossDead, 0.28)
  // 枯树群
  for (let i = 0; i < 13; i++) {
    const x = 90 + i * 92 + (hash2(i, 1, o.seed) - 0.5) * 40
    const h = 90 + hash2(i, 2, o.seed) * 150
    deadTree(s, x, BASE, h, mix(PAL.ink, c, 0.24 + hash2(i, 3, o.seed) * 0.2), 0x100 + i)
  }
  // 倒木
  for (let i = 0; i < 4; i++) {
    const x = 200 + hash2(i, 4, o.seed) * 800
    s.thick(x, BASE - 14, x + 120, BASE - 26, 5, mix(PAL.ink, c, 0.3))
    for (let k = 0; k < 6; k++) s.line(x + 20 + k * 18, BASE - 20, x + 26 + k * 18, BASE - 6, mix(PAL.ink, c, 0.4), 1)
  }
  // 树桩
  for (let i = 0; i < 9; i++) {
    const x = 120 + hash2(i, 5, o.seed) * 1080
    const r = 8 + hash2(i, 6, o.seed) * 10
    s.ell(x, BASE - 8, r, r * 0.55, mix(PAL.ink, c, 0.3))
    s.ell(x, BASE - 12, r * 0.8, r * 0.4, mix(PAL.mossDead, PAL.void, 0.35))
    for (let k = 0; k < 3; k++) s.ell(x, BASE - 12, r * (0.2 + k * 0.2), r * (0.1 + k * 0.1), mix(PAL.void, c, 0.2))
  }
  // 乌鸦 + 荒草
  for (let i = 0; i < 5; i++) {
    const x = 300 + hash2(i, 7, o.seed) * 700
    const y = BASE - 250 + hash2(i, 8, o.seed) * 90
    s.line(x - 5, y, x, y - 2, mix(PAL.void, c, 0.3), 1)
    s.line(x, y - 2, x + 5, y, mix(PAL.void, c, 0.3), 1)
  }
  for (let i = 0; i < 80; i++) {
    const x = hash2(i, 9, o.seed) * W
    const y = BASE - 4 + hash2(i, 10, o.seed) * 12
    s.line(x, y, x + (hash2(i, 11, o.seed) - 0.5) * 7, y - 5 - hash2(i, 12, o.seed) * 6, mix(PAL.mossDead, PAL.void, 0.3), 1)
  }
}

function drawRedTide(s, o) {
  const c = mix(o.st.mid, PAL.rustDark, 0.34)
  const red = mix(PAL.blood, PAL.rustLight, 0.3)
  // 沉船骸（油轮）
  s.poly([[240, BASE - 6], [300, BASE - 122], [760, BASE - 132], [880, BASE - 40], [820, BASE - 6]], mix(PAL.rustDark, PAL.void, 0.22))
  s.poly([[300, BASE - 122], [560, BASE - 150], [760, BASE - 132], [560, BASE - 116]], mix(PAL.rustDark, PAL.void, 0.1))
  for (let x = 320; x < 760; x += 22) s.rect(x, BASE - 120, 2, 60, mix(PAL.void, c, 0.3))
  s.rect(470, BASE - 196, 62, 66, mix(PAL.rustDark, PAL.void, 0.16))
  s.rect(478, BASE - 190, 46, 40, mix(PAL.void, o.accent, 0.1))
  for (let y = BASE - 190; y < BASE - 150; y += 10) s.rect(478, y, 46, 1, mix(PAL.void, c, 0.2))
  // 倾覆的吊机
  for (let i = 0; i < 30; i++) s.rect(880 + i * 2, BASE - 180 + i * 5, 4, 10, mix(c, PAL.void, 0.2))
  // 红色潮水
  s.rect(0, BASE - 34, W, 34, mix(red, PAL.void, 0.42))
  for (let i = 0; i < 34; i++) {
    const y = BASE - 30 + hash2(i, 1, o.seed) * 30
    s.rect(hash2(i, 2, o.seed) * W, y, 24 + hash2(i, 3, o.seed) * 70, 1, mix(red, PAL.bloodDark, 0.4))
    if (hash2(i, 4, o.seed) > 0.7) s.rect(hash2(i, 5, o.seed) * W, y + 2, 8 + hash2(i, 6, o.seed) * 20, 1, mix(o.accent, PAL.white, 0.2))
  }
  // 锈蚀栈桥
  for (let x = 200; x < 1120; x += 30) {
    s.rect(x, BASE - 44, 3, 44, mix(PAL.rustDark, PAL.void, 0.24))
    s.rect(x, BASE - 46, 30, 2, mix(PAL.rust, PAL.void, 0.3))
  }
  // 漂浮骸骨
  for (let i = 0; i < 6; i++) {
    const x = 180 + hash2(i, 7, o.seed) * 900
    s.thick(x, BASE - 20, x + 40, BASE - 26, 3, mix(PAL.boneDark, PAL.void, 0.4))
    s.line(x + 6, BASE - 22, x + 12, BASE - 8, mix(PAL.boneDark, PAL.void, 0.4), 1)
    s.line(x + 26, BASE - 24, x + 32, BASE - 10, mix(PAL.boneDark, PAL.void, 0.4), 1)
  }
  // 对岸远塔
  pylon(s, 1220, BASE - 30, 160, mix(c, PAL.void, 0.2))
}

function drawRobotFactory(s, o) {
  const c = mix(o.st.mid, PAL.steel, 0.16)
  const dk = mix(c, PAL.void, 0.28)
  facade(s, 260, BASE, 760, 180, mix(dk, PAL.void, 0.06), o, 0.16, 6)
  // 锯齿屋顶
  for (let i = 0; i < 7; i++) {
    const x = 260 + i * 110
    s.poly([[x, BASE - 180], [x + 55, BASE - 236], [x + 110, BASE - 180]], mix(dk, PAL.void, 0.12))
    for (let k = 0; k < 4; k++) s.rect(x + 12 + k * 22, BASE - 196, 14, 10, mix(PAL.glass, PAL.void, 0.5))
  }
  // 流水线
  s.rect(300, BASE - 70, 700, 12, mix(PAL.steelDark, PAL.void, 0.2))
  for (let x = 310; x < 1000; x += 26) s.rect(x, BASE - 82, 14, 26, mix(c, PAL.void, 0.16))
  for (let i = 0; i < 4; i++) {
    const x = 360 + i * 170
    s.rect(x, BASE - 92, 22, 22, mix(PAL.boneDark, PAL.void, 0.18))
    s.rect(x + 5, BASE - 104, 12, 12, mix(PAL.bone, PAL.void, 0.4))
    s.px(x + 8, BASE - 100, mix(o.accent, PAL.white, 0.3), 1)
  }
  // 机械臂 + 火花
  for (let i = 0; i < 3; i++) {
    const x = 430 + i * 210
    s.thick(x, BASE - 180, x + 24, BASE - 116, 4, mix(dk, PAL.rust, 0.12))
    s.thick(x + 24, BASE - 116, x + 6, BASE - 92, 3, dk)
    s.px(x + 6, BASE - 90, mix(o.accent, PAL.white, 0.4), 1)
    for (let k = 0; k < 8; k++) {
      s.px(x + 6 + (hash2(k, i, o.seed) - 0.5) * 20, BASE - 90 + hash2(k, i + 5, o.seed) * 14, mix(PAL.warn, PAL.white, 0.2), 1)
    }
  }
  gantryCrane(s, 1030, BASE, 200, mix(dk, PAL.void, 0.1), o)
  steam(s, 820, BASE - 180, 60, 70, mix(PAL.dust, PAL.void, 0.3))
  pool(s, 340, BASE - 14, 120, 14, mix(PAL.oil, PAL.void, 0.2), o.accent)
}

function drawMechYard(s, o) {
  const c = mix(o.st.mid, PAL.steelDark, 0.24)
  const dk = mix(c, PAL.void, 0.34)
  // 机甲残骸
  for (let i = 0; i < 3; i++) {
    const x = 280 + i * 300
    const h = 150 + i * 24
    box(s, x, BASE - h, 70, h * 0.6, mix(dk, PAL.void, 0.06), { step: 18 })
    s.rect(x + 8, BASE - h - 34, 54, 36, mix(PAL.steelDark, PAL.void, 0.2))
    s.rect(x + 20, BASE - h - 14, 30, 10, mix(o.accent, PAL.void, 0.2))
    s.line(x + 16, BASE - h - 30, x + 34, BASE - h - 8, mix(o.accent, PAL.void, 0.4), 1)
    for (const dx of [8, 52]) {
      s.thick(x + dx, BASE - h * 0.4, x + dx - 6, BASE, 5, dk)
      s.rect(x + dx - 12, BASE - 8, 22, 8, mix(PAL.void, c, 0.2))
    }
    cable(s, x + 70, BASE - h * 0.55, x + 120, BASE - 30, 26, mix(PAL.void, o.accent, 0.25))
  }
  // 霓虹招牌
  s.rect(880, BASE - 250, 190, 66, mix(PAL.void, c, 0.14))
  for (let k = 0; k < 3; k++) s.rect(892, BASE - 240 + k * 18, 166, 3, mix(o.accent, PAL.void, 0.1))
  s.rect(900, BASE - 258, 150, 3, mix(o.accent, PAL.white, 0.2))
  s.glow(975, BASE - 217, 130, o.accent, 0.12)
  // 废车堆
  for (let i = 0; i < 5; i++) {
    const x = 180 + i * 60
    s.rect(x, BASE - 34 - (i % 3) * 14, 56, 16, mix(PAL.rustDark, PAL.void, 0.2))
    s.rect(x + 8, BASE - 46 - (i % 3) * 14, 30, 12, mix(PAL.rust, PAL.void, 0.24))
  }
  // 火花 + 涂鸦
  for (let i = 0; i < 20; i++) {
    s.px(hash2(i, 1, o.seed) * W, BASE - 20 - hash2(i, 2, o.seed) * 200, mix(o.accent, PAL.white, hash2(i, 3, o.seed) * 0.6), 1)
  }
  for (let i = 0; i < 8; i++) {
    const x = 300 + hash2(i, 4, o.seed) * 700
    s.line(x, BASE - 26 + hash2(i, 5, o.seed) * 10, x + 20 + hash2(i, 6, o.seed) * 30, BASE - 30 + hash2(i, 7, o.seed) * 8, mix(o.accent, PAL.void, 0.35), 2)
  }
}

function drawShadowLabyrinth(s, o) {
  const c = mix(o.st.mid, PAL.void, 0.4)
  // 层层拱廊（纵深）
  for (let layer = 0; layer < 3; layer++) {
    const inset = layer * 90
    const alpha = 0.12 + layer * 0.1
    for (let i = 0; i < 5; i++) {
      const x = 160 + inset + i * (240 - layer * 30)
      const w = 120 - layer * 20
      const h = 240 - layer * 40
      s.rect(x, BASE - h, w, h, mix(c, PAL.void, alpha))
      s.poly([[x - 14, BASE - h], [x + w / 2, BASE - h - 46], [x + w + 14, BASE - h]], mix(c, PAL.void, alpha))
      for (let k = 0; k < 4; k++) s.rect(x + 10, BASE - h + 16 + k * 30, w - 20, 1, mix(PAL.void, c, 0.3))
    }
  }
  // 火把
  for (const [x, y] of [[300, BASE - 180], [640, BASE - 210], [980, BASE - 170]]) {
    s.rect(x, y, 4, 24, mix(PAL.rustDark, PAL.void, 0.2))
    s.ell(x + 2, y - 6, 8, 12, mix(o.accent, PAL.void, 0.2))
    s.glow(x + 2, y - 10, 46, o.accent, 0.16)
  }
  // 地面格砖 + 铁栅
  for (let y = BASE - 20; y < BASE; y += 18) {
    for (let x = 0; x < W; x += 60) s.rect(x, y, 58, 1, mix(PAL.void, c, 0.3))
  }
  for (let i = 0; i < 10; i++) {
    const x = 140 + i * 100
    s.rect(x, BASE - 95, 3, 95, mix(PAL.steelDark, PAL.void, 0.36))
  }
}

function drawGravityAnomaly(s, o) {
  const c = mix(o.st.mid, PAL.steelBlue, 0.2)
  // 悬浮岩块
  for (const [x, y, r] of [[420, 190, 64], [700, 130, 90], [930, 240, 46], [300, 300, 38], [820, 320, 30], [560, 300, 24], [1080, 180, 42]]) {
    s.poly(
      [[x - r, y], [x - r * 0.5, y - r * 0.8], [x + r * 0.4, y - r], [x + r, y - r * 0.2], [x + r * 0.5, y + r * 0.5], [x - r * 0.4, y + r * 0.3]],
      mix(PAL.steelDark, PAL.void, 0.3),
    )
    s.poly([[x - r * 0.6, y - r * 0.2], [x, y - r * 0.9], [x + r * 0.6, y - r * 0.2], [x + r * 0.2, y + r * 0.2]], mix(c, PAL.void, 0.24))
    s.line(x - r * 0.5, y + r * 0.1, x + r * 0.6, y - r * 0.1, mix(o.accent, PAL.void, 0.3), 1)
    for (let k = 0; k < 5; k++) {
      s.px(x + (hash2(k, x, o.seed) - 0.5) * r, y + r * 0.6 + hash2(k + 9, x, o.seed) * r * 0.5, mix(o.accent, PAL.void, 0.24), 1)
    }
  }
  // 扭曲环
  for (let k = 0; k < 3; k++) {
    const cy = 220 + k * 34
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2
      const rx = 260 + Math.sin(a * 3 + k) * 40
      const ry = 52 + Math.cos(a * 4 + k) * 18
      s.px(640 + Math.cos(a) * rx, cy + Math.sin(a) * ry, mix(o.accent, PAL.white, 0.1 + k * 0.05), 1)
    }
  }
  // 闪电
  let lx = 1060
  let ly = 70
  for (let i = 0; i < 18; i++) {
    const nx = lx + (hash2(i, 1, o.seed) - 0.5) * 22
    const ny = ly + 12
    s.line(lx, ly, nx, ny, mix(PAL.signal, PAL.white, 0.2), 1)
    lx = nx
    ly = ny
  }
  // 塔基
  box(s, 440, BASE - 70, 90, 70, mix(c, PAL.void, 0.2), { step: 14 })
  box(s, 740, BASE - 60, 70, 60, mix(c, PAL.void, 0.24), { step: 14 })
  antenna(s, 485, BASE - 70, 60, mix(c, PAL.void, 0.3), mix(o.accent, PAL.white, 0.3))
}

function drawFogBank(s, o) {
  const c = mix(o.st.mid, PAL.void, 0.18)
  // 三层剪影
  for (let layer = 0; layer < 3; layer++) {
    const base = BASE - layer * 26
    const cc = mix(c, PAL.void, 0.1 + layer * 0.16)
    let x = -40 + layer * 60
    for (let i = 0; i < 6; i++) {
      const w = 70 + hash2(i, layer, o.seed) * 90
      const h = 60 + hash2(i, layer + 7, o.seed) * (120 - layer * 20)
      s.rect(x, base - h, w, h, cc)
      s.rect(x, base - h, w, 1, mix(cc, PAL.white, 0.06))
      for (let yy = base - h + 8; yy < base - 4; yy += 14) {
        for (let xx = x + 6; xx < x + w - 4; xx += 16) {
          if (hash2(xx, yy, o.seed) < 0.1) s.rect(xx, yy, 3, 4, mix(o.accent, PAL.void, 0.6))
        }
      }
      x += w + 14
    }
  }
  // 路灯（雾中光锥）
  s.rect(1000, BASE - 190, 5, 190, mix(c, PAL.void, 0.3))
  s.rect(986, BASE - 196, 34, 5, mix(c, PAL.void, 0.24))
  s.ell(1018, BASE - 188, 7, 5, mix(o.accent, PAL.white, 0.3))
  for (let i = 0; i < 200; i++) {
    const t = i / 200
    const spread = 12 + t * 120
    s.px(1018 + (hash2(i, 1, o.seed) - 0.5) * spread, BASE - 188 + t * 150, mix(o.accent, PAL.white, 0.3), 1)
  }
  // 路牌 + 弃车
  for (const [x, w] of [[300, 120], [330, 90]]) {
    s.rect(x, BASE - 90, 4, 90, mix(PAL.steelDark, PAL.void, 0.3))
    s.rect(x, BASE - 96, w, 22, mix(c, PAL.void, 0.2))
    s.rect(x + 6, BASE - 90, w - 12, 2, mix(o.accent, PAL.void, 0.4))
  }
  s.rect(560, BASE - 40, 100, 26, mix(PAL.rustDark, PAL.void, 0.26))
  s.rect(576, BASE - 54, 52, 16, mix(PAL.rustDark, PAL.void, 0.2))
  s.ell(578, BASE - 14, 8, 8, mix(PAL.void, c, 0.2))
  s.ell(644, BASE - 14, 8, 8, mix(PAL.void, c, 0.2))
}

function drawGreyHarbor(s, o) {
  const c = mix(o.st.mid, PAL.steelLight, 0.1)
  // 集装箱船
  s.poly([[300, BASE - 60], [330, BASE - 96], [1010, BASE - 96], [1040, BASE - 60]], mix(PAL.steelDark, PAL.void, 0.24))
  for (let i = 0; i < 16; i++) {
    const x = 340 + i * 40
    s.rect(x, BASE - 88, 30, 20, mix(i % 3 === 0 ? PAL.rustDark : c, PAL.void, 0.3))
    s.rect(x, BASE - 88, 30, 2, mix(PAL.void, PAL.steelLight, 0.2))
  }
  s.rect(880, BASE - 150, 90, 54, mix(c, PAL.void, 0.16))
  for (let y = BASE - 146; y < BASE - 100; y += 10) s.rect(886, y, 78, 2, mix(PAL.void, c, 0.2))
  s.rect(920, BASE - 176, 6, 26, mix(c, PAL.void, 0.2))
  // 岸吊
  gantryCrane(s, 240, BASE - 60, 220, mix(c, PAL.void, 0.16), o)
  gantryCrane(s, 1060, BASE - 60, 190, mix(c, PAL.void, 0.2), o)
  // 集装箱堆场
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const x = 330 + i * 78
      const y = BASE - 34 - row * 30
      const col = mix([PAL.rustDark, PAL.steelDark, PAL.steelBlue][(i + row) % 3], PAL.void, 0.28)
      s.rect(x, y - 22, 68, 22, col)
      for (let k = 0; k < 6; k++) s.rect(x + 4 + k * 10, y - 20, 2, 18, mix(PAL.void, col, 0.3))
    }
  }
  // 雨丝
  for (let i = 0; i < 90; i++) {
    const x = hash2(i, 1, o.seed) * W
    const y = 60 + hash2(i, 2, o.seed) * 330
    s.line(x, y, x - 3, y + 16, mix(PAL.rain, PAL.void, 0.4), 1)
  }
}

function drawHorrorHotel(s, o) {
  const c = mix(o.st.mid, PAL.bloodDark, 0.25)
  const dk = mix(c, PAL.void, 0.3)
  facade(s, 420, BASE, 420, 250, dk, o, 0.14, 5)
  s.rect(400, BASE - 262, 460, 14, mix(dk, PAL.void, 0.2))
  crenels(s, 400, BASE - 262, 460, mix(c, PAL.void, 0.18), 28)
  // 门廊 + 雨棚
  s.rect(560, BASE - 120, 140, 120, mix(PAL.void, dk, 0.2))
  s.poly([[520, BASE - 120], [560, BASE - 158], [700, BASE - 158], [740, BASE - 120]], mix(dk, PAL.rustDark, 0.2))
  for (let x = 528; x < 736; x += 20) s.rect(x, BASE - 118, 3, 30, mix(PAL.rust, PAL.void, 0.3))
  for (let x = 566; x < 696; x += 22) s.rect(x, BASE - 112, 12, 112, mix(PAL.void, PAL.bloodDark, 0.24))
  s.ell(630, BASE - 130, 6, 8, mix(o.accent, PAL.void, 0.2))
  s.glow(630, BASE - 132, 60, o.accent, 0.14)
  // 招牌（部分熄灭）
  s.rect(470, BASE - 218, 320, 44, mix(PAL.void, c, 0.14))
  for (let i = 0; i < 5; i++) {
    const on = hash2(i, 1, o.seed) > 0.35
    s.rect(494 + i * 58, BASE - 208, 38, 24, on ? mix(o.accent, PAL.white, 0.1) : mix(PAL.void, c, 0.3))
  }
  s.glow(630, BASE - 196, 180, o.accent, 0.1)
  // 侧塔
  box(s, 250, BASE - 200, 140, 200, dk, { step: 24, brick: true })
  crenels(s, 250, BASE - 200, 140, mix(c, PAL.void, 0.2), 24)
  s.poly([[240, BASE - 200], [320, BASE - 264], [400, BASE - 200]], mix(dk, PAL.void, 0.1))
  // 血痕
  for (let i = 0; i < 6; i++) {
    const x = 460 + hash2(i, 2, o.seed) * 340
    for (let k = 0; k < 30; k++) s.px(x + (hash2(k, i, o.seed) - 0.5) * 4, BASE - 240 + k, mix(PAL.bloodDark, PAL.void, 0.2), 1)
  }
  // 路灯 + 铁栅
  for (const x of [340, 950]) {
    s.rect(x, BASE - 74, 4, 74, mix(PAL.steelDark, PAL.void, 0.3))
    s.ell(x + 2, BASE - 78, 9, 6, mix(PAL.void, o.accent, 0.2))
    s.glow(x + 2, BASE - 80, 44, o.accent, 0.14)
  }
  for (let x = 200; x < 1120; x += 28) {
    s.rect(x, BASE - 46, 2, 46, mix(PAL.steelDark, PAL.void, 0.36))
    s.poly([[x - 3, BASE - 46], [x + 1, BASE - 54], [x + 5, BASE - 46]], mix(PAL.steelDark, PAL.void, 0.3))
  }
}

/* ============================================================================
 * 7. family 兜底表
 * ========================================================================== */
const FAMILY_DRAW = {
  city: drawCity,
  civic: drawCivic,
  industrial: drawIndustrial,
  tech: drawTech,
  science: drawScience,
  military: drawMilitary,
  horror: drawHorror,
  harbor: drawHarbor,
  nature: drawNature,
  wasteland: drawWasteland,
  punk: drawPunk,
  gothic: drawGothic,
  ancient: drawAncient,
  anomaly: drawAnomaly,
  mist: drawMist,
  sea: drawSea,
}

/* ============================================================================
 * 8. 主题 id → 专属地标（51 个 id 全量覆盖，family 仅兜底）
 * ========================================================================== */
const LANDMARKS = {
  data_center: drawDataCenter,
  robot_factory: drawRobotFactory,
  spaceport: drawSpaceport,
  solar_center: drawSolar,
  dam: drawDam,
  bridge: drawBridge,
  highway: drawHighway,
  skyscraper: drawSkyscraper,
  stadium: drawStadium,
  battlefield: drawBattlefield,
  rescue_center: drawRescue,
  robot_rally: drawRobotRally,
  storm_farm: drawFarm,
  acid_basin: drawToxicBasin,
  rot_jungle: drawJungleStation,
  church: drawChurch,
  ai_origin: drawAiCore,
  virus_lab: drawVirusLab,
  ai_lab: drawAiCore,
  alien_center: drawAlienCenter,
  military_base: drawMilitaryBase,
  library: drawLibrary,
  school: drawSchool,
  university: drawUniversity,
  paper_mill: drawPaperMill,
  archaeological_site: drawDigSite,
  prison: drawPrison,
  hotel: drawHotel,
  dock: drawDock,
  lighthouse: drawLighthouse,
  shipyard: drawShipyard,
  drydock: drawDrydock,
  substation: drawSubstation,
  bunker: drawBunker,
  coal_mine: drawMineHead,
  thermal_plant: drawThermal,
  nuclear_plant: drawNuclear,
  radiation_zone: drawRadiation,
  arsenal: drawArsenal,
  punk_mech: drawMechYard,
  shadow_labyrinth: drawShadowLabyrinth,
  chaos_castle: drawCastle,
  vampire_lair: drawCrypt,
  gravity_anomaly: drawGravityAnomaly,
  dense_fog: drawFogBank,
  howling_strait: drawStrait,
  abyss_swamp: drawSwamp,
  withered_forest: drawDeadForest,
  red_tide: drawRedTide,
  grey_harbor: drawGreyHarbor,
  horror_hotel: drawHorrorHotel,
}

/* ============================================================================
 * 9. 组装 / 缓存 / 对外接口
 * ========================================================================== */
const WATER_IDS = new Set([
  'dam',
  'bridge',
  'red_tide',
  'howling_strait',
  'dock',
  'shipyard',
  'drydock',
  'grey_harbor',
  'lighthouse',
])

/** 底色：整幅铺满，保证任何角落都不会透出 alpha=0 的空洞。 */
function paintBase(s, o) {
  const c = mix(o.st.ground, PAL.void, 0.4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = hash2(x, y, o.seed)
      s.set(x, y, r > 0.94 ? mix(c, PAL.dust, 0.12) : r < 0.06 ? mix(c, PAL.void, 0.3) : c)
    }
  }
}

function paintTheme(s, o, family) {
  paintBase(s, o)
  paintSky(s, o)
  paintFarSkyline(s, o)
  paintMidSkyline(s, o)
  const draw = LANDMARKS[o.theme.id] || FAMILY_DRAW[family] || drawCity
  draw(s, o)
  paintGround(s, o)
  paintFog(s, o)
  // 整体再压暗一档 + accent 参与染色，保证前景可读
  s.tint(PAL.void, 0.1)
  s.tint(o.accent, 0.03)
  liftDarkPixels(s)
}

/* 终检兜底：任何低于暗部地板的像素按原色相抬升（禁黑色块），
 * 极暗像素顺带一点蓝紫倾向，贴合黄昏/夜晚参考配色。 */
function liftDarkPixels(s) {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const i = s.i(x, y)
      if (s.d[i + 3] === 0) continue
      const r = s.d[i]
      const g = s.d[i + 1]
      const b = s.d[i + 2]
      const L = 0.299 * r + 0.587 * g + 0.114 * b
      if (L >= DARK_FLOOR_L) continue
      const f = L > 0.01 ? DARK_FLOOR_L / L : 99
      s.d[i] = Math.min(255, r * f)
      s.d[i + 1] = Math.min(255, g * f)
      s.d[i + 2] = Math.min(255, b * f + 5)
    }
  }
}

export function getThemeBackdrop(themeId) {
  if (!themeId) return null
  const hit = CACHE.get(themeId)
  if (hit) return hit
  const theme = getTheme(themeId)
  if (!theme) return null
  const family = FAMILY_BY_ID[themeId] || theme.family || 'city'
  const st = STYLE[family] || STYLE.city
  const o = {
    theme,
    family,
    st,
    accent: theme.accent || PAL.rustLight,
    seed: strSeed(String(themeId) + '|' + String(theme.variant) + '|' + family),
    water: WATER_IDS.has(themeId),
  }
  const s = new Surf(W, H, o.seed, 'backdrop')
  paintTheme(s, o, family)
  // 2 倍分辨率输出：逻辑布局不变，纹理清晰度翻倍
  const tex = s.tex(2)
  tex.name = 'theme-backdrop:' + themeId
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.userData.themeId = themeId
  tex.userData.family = family
  tex.userData.water = o.water
  CACHE.set(themeId, tex)
  return tex
}

/**
 * 关卡背景：非主题房间按 scene.painter 复用对应主题地标画法，
 * 再用本关 accent 给天空 / 雾 / 地面染色，并用 roomId 做随机种子。
 * 同一画家在不同关卡也会呈现不同的天色与轮廓分布。
 */
export function getSceneBackdrop(roomId) {
  if (!roomId) return null
  const key = 'scene:' + roomId
  const hit = CACHE.get(key)
  if (hit) return hit
  const scene = getRoomScene(roomId)
  if (!scene) return null
  const painter = scene.painter || 'highway'
  const family = FAMILY_BY_ID[painter] || 'city'
  const accentHex = '#' + (scene.accent >>> 0).toString(16).padStart(6, '0')
  const base = STYLE[family] || STYLE.city
  const st = {}
  for (const k of ['top', 'horizon', 'far', 'mid', 'ground', 'fog']) {
    st[k] = mix(base[k], accentHex, 0.09)
  }
  const o = {
    theme: { id: painter, variant: 'scene', name: roomId },
    family,
    st,
    accent: accentHex,
    seed: strSeed(roomId + '|' + painter),
    water: WATER_IDS.has(painter) || scene.arch === 'basin',
  }
  const s = new Surf(W, H, o.seed, 'backdrop')
  if (scene.indoor) paintIndoor(s, o)
  else paintTheme(s, o, family)
  const tex = s.tex(2)
  tex.name = 'scene-backdrop:' + roomId
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.userData.themeId = null
  tex.userData.sceneId = roomId
  tex.userData.indoor = !!scene.indoor
  tex.userData.family = family
  tex.userData.water = o.water
  CACHE.set(key, tex)
  return tex
}

export function clearThemeBackdropCache() {
  for (const tex of CACHE.values()) {
    if (tex && typeof tex.dispose === 'function') tex.dispose()
  }
  CACHE.clear()
}
