// ============================================================================
// 锈雨 · RUSTFALL —— 生态小生物 / 植被美术（ECO）
// ----------------------------------------------------------------------------
// 契约（覆盖同文件占位版，导出名保持不变）：
//   export function getEcoArt(kind) -> { w, h, anchor:'bottom-center', frames }
//     roach 14×8  { walk:[4], scared:[2], idle, run, dead }   ← idle/run/dead 为引擎别名
//     plant 28×40 { sway:[4], harvest:[2], idle, run, dead }
//     fly    8×8  { wings:[3], idle, run }
//     rat   20×12 { run:[4], idle, dead }
//   export function getNestArt(kind) -> THREE.CanvasTexture  // roach 40×24
//   export function preloadArt() -> number
//   export function clearEcoCache() -> void
//
// 引擎侧（entities/eco/index.js）同时接受「贴图」与「{frames} 对象」，本模块给
// 后者以便真正播放动画；帧内 alpha 只有 0/255，采样 NearestFilter / SRGB / 无 mipmap。
// ============================================================================

import { PAL } from '../palette.js'
import { Surf, mix, shade } from './core.js'

const TAU = Math.PI * 2

/* ============================================================================
 * 蟑螂 14×8：walk 4 / scared 2 / dead 1
 * ========================================================================== */

function drawRoach(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const scared = F.anim === 'scared'
  const dead = F.anim === 'dead'
  const ph = (i / 4) * TAU
  const shell = mix(PAL.rustDark, PAL.dust, 0.35)
  const shellL = mix(shell, PAL.sand, 0.4)
  const cx = 7
  const cy = dead ? g - 2 : scared ? 3 : 4
  s.shadow(cx, g - 0.5, 5, 1, 0.55)
  if (dead) {
    // 翻肚：腿朝天
    s.ell(cx, cy, 4, 2, PAL.steelWhite)
    s.ell(cx, cy, 3.2, 1.4, shellL)
    for (let k = 0; k < 3; k++) {
      s.line(cx - 2 + k * 2, cy, cx - 3 + k * 2, cy - 3, PAL.ink)
      s.line(cx - 2 + k * 2, cy + 1, cx - 3 + k * 2, cy + 3, PAL.ink)
    }
    s.px(cx + 5, cy, PAL.ink)
    return
  }
  // 六足
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const off = k * 1.1 + (side > 0 ? Math.PI : 0)
      const lift = scared ? (k % 2 ? 1 : 0) : Math.max(0, Math.cos(ph + off)) * 1.4
      const hx = cx - 2 + k * 2
      const fx = hx + side * 3
      s.line(hx, cy + 2, fx, g - 1 - lift, PAL.ink)
      s.px(fx, g - 1 - lift, PAL.oil)
    }
  }
  // 甲壳
  s.ell(cx, cy, 4, 2.4, shell)
  s.ell(cx - 0.5, cy - 0.6, 3.2, 1.6, shellL)
  s.px(cx - 2, cy - 1, PAL.steelWhite)
  // 头 + 触角
  s.ell(cx + 4, cy, 1.8, 1.6, shell)
  s.px(cx + 5, cy, PAL.neonWarm)
  const a = scared ? 3 : 1.5
  s.line(cx + 5, cy - 1, cx + 7, cy - a, PAL.ink)
  s.line(cx + 5, cy + 1, cx + 7, cy + a, PAL.ink)
  s.line(cx - 2, cy - 2, cx - 2, cy + 2, PAL.rustDeep)
  s.line(cx + 1, cy - 2, cx + 1, cy + 2, PAL.rustDeep, 0.9)
  if (scared) {
    // 受惊：更快的高抬腿 + 头上冒的“!”形小点
    s.px(cx + 8, cy - 3, PAL.neonWarm)
    s.px(cx + 8, cy - 4, PAL.neonWarm)
  }
}

/* ============================================================================
 * 植物 28×40：sway 4 / harvest 2 / dead 1（只剩残桩）
 * ========================================================================== */

function drawPlant(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const harvest = F.anim === 'harvest'
  const dead = F.anim === 'dead'
  const phase = (i / 4) * TAU
  const sway = dead ? 0 : harvest ? 1 : Math.round(Math.sin(phase) * 2)
  const stem = mix(PAL.mossDead, PAL.toxicDark, 0.5)
  const leaf = mix(PAL.weed, PAL.toxicDark, 0.35)
  const leafL = mix(leaf, PAL.toxic, 0.4)
  const cx = 14
  s.shadow(cx, g - 0.5, 9, 1.8, 0.55)
  s.ell(cx, g - 1, 8, 2, PAL.dust)
  s.ell(cx, g - 2, 6, 1.4, PAL.sandDark)
  let px = cx
  let py = g - 3
  const stemH = dead ? 16 : 26
  for (let k = 0; k < stemH; k++) {
    const t = k / stemH
    px = cx + sway * t * t
    py = g - 3 - k
    s.rect(px, py, 2, 1, stem)
    if (k % 6 === 0) s.px(px + 1, py, shade(stem, 0.3))
  }
  const topY = py
  if (dead) {
    // 断口 + 少量残叶
    s.px(cx, topY - 1, PAL.dust)
    s.line(cx, g - 8, cx - 4, g - 12, leaf, 0.9)
    s.line(cx + 1, g - 12, cx + 4, g - 15, leaf, 0.8)
    return
  }
  // 叶片
  for (let k = 0; k < 3; k++) {
    const ly = g - 9 - k * 7
    const lx = cx + sway * ((g - ly) / 30) ** 2
    const w = 8 - k * 2
    const rise = 3 + k
    s.poly(
      [
        [lx, ly],
        [lx - w, ly - rise - (harvest ? 2 : 0)],
        [lx - w + 2, ly + 1],
      ],
      leaf,
    )
    s.poly(
      [
        [lx + 1, ly],
        [lx + w, ly - rise - (harvest ? 2 : 0)],
        [lx + w - 2, ly + 1],
      ],
      leaf,
    )
    s.line(lx - w + 2, ly - rise + 1, lx, ly - 1, leafL, 0.8)
    s.line(lx + w - 2, ly - rise + 1, lx + 1, ly - 1, leafL, 0.6)
  }
  // 顶花 / 果实（harvest 第 2 帧已摘走）
  const tx = cx + sway
  const picked = harvest && i === 1
  if (!picked) {
    s.disc(tx, topY - 3, 3, PAL.toxicDark)
    s.disc(tx, topY - 3, 2, PAL.toxic)
    s.px(tx - 1, topY - 4, PAL.toxicGlow)
    s.px(tx + 1, topY - 2, PAL.fruitHi || PAL.toxicGlow)
  } else {
    s.px(tx, topY - 2, PAL.rustDark)
    s.px(tx, topY - 3, PAL.dust)
    s.px(tx, topY - 4, PAL.dust)
  }
  for (let k = 0; k < 5; k++) s.px(cx + (k % 2), g - 6 - k * 5, PAL.rustDark)
}

/* ============================================================================
 * 飞虫 8×8：wings 3
 * ========================================================================== */

function drawFly(s, F) {
  const i = F.i || 0
  const cx = 4
  const cy = 4
  const wingUp = [0, -2, 1][i % 3]
  s.shadow(cx, s.h - 0.5, 3, 1, 0.35)
  const wing = PAL.steelWhite
  s.poly(
    [
      [cx - 1, cy - 1],
      [cx - 4, cy - 2 + wingUp],
      [cx - 4, cy + 1 + wingUp],
      [cx - 1, cy + 1],
    ],
    wing,
  )
  s.poly(
    [
      [cx + 1, cy - 1],
      [cx + 4, cy - 2 + wingUp],
      [cx + 4, cy + 1 + wingUp],
      [cx + 1, cy + 1],
    ],
    wing,
  )
  s.px(cx - 3, cy - 1 + wingUp, PAL.glass)
  s.px(cx + 3, cy - 1 + wingUp, PAL.glass)
  s.ell(cx, cy, 1.8, 2.4, PAL.black)
  s.px(cx, cy - 2, PAL.rustDark)
  s.px(cx - 1, cy, PAL.rustDark)
  s.px(cx + 1, cy, PAL.rustDark)
  s.px(cx, cy - 3, PAL.neonWarm)
  s.px(cx - 2, cy + 2, PAL.ink)
  s.px(cx + 2, cy + 2, PAL.ink)
}

/* ============================================================================
 * 老鼠 20×12：run 4 / dead 1
 * ========================================================================== */

function drawRat(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const dead = F.anim === 'dead'
  const phase = dead ? 0 : (i / 4) * TAU
  const cx = 9
  const cy = dead ? g - 3 : 7
  const fur = mix(PAL.dust, PAL.rustDark, 0.4)
  const furL = mix(fur, PAL.sand, 0.35)
  const furD = mix(fur, PAL.void, 0.4)
  s.shadow(cx, g - 0.5, 8, 1.2, 0.5)
  if (dead) {
    s.ell(cx, cy, 7, 2.6, furD)
    s.ell(cx, cy - 0.5, 6.4, 2, fur)
    s.ell(cx + 6, cy, 3, 2, fur)
    // X 眼
    s.px(cx + 6, cy - 1, PAL.ink)
    s.px(cx + 7, cy, PAL.ink)
    s.px(cx + 6, cy + 1, PAL.ink)
    s.line(cx - 6, cy + 1, cx - 9, cy - 1, PAL.rustDark)
    return
  }
  for (const [lx, off] of [
    [5, Math.PI],
    [8, 0],
    [12, Math.PI * 0.5],
    [15, Math.PI * 1.5],
  ]) {
    const ph = phase + off
    const dx = Math.sin(ph) * 1.6
    const lift = Math.max(0, Math.cos(ph)) * 1.6
    s.line(lx, cy + 2, lx + dx, g - 1 - lift, furD)
    s.px(lx + dx, g - 1 - lift, PAL.ink)
  }
  s.ell(cx, cy, 6.5, 3.4, furD)
  s.ell(cx, cy - 0.5, 6, 2.8, fur)
  s.ell(cx - 1, cy - 1.6, 4, 1.6, furL, 0.8)
  s.ell(cx + 6, cy - 0.5, 3.4, 2.8, fur)
  s.poly(
    [
      [cx + 5, cy - 3],
      [cx + 4, cy - 6],
      [cx + 7, cy - 3],
    ],
    furD,
  )
  s.poly(
    [
      [cx + 7, cy - 3],
      [cx + 8, cy - 6],
      [cx + 9, cy - 3],
    ],
    fur,
  )
  s.px(cx + 9, cy, PAL.ink)
  s.px(cx + 8, cy - 1, PAL.neonRed)
  s.line(cx + 9, cy + 1, cx + 11, cy, PAL.boneDark)
  s.line(cx + 9, cy + 1, cx + 11, cy + 2, PAL.boneDark)
  const tw = Math.sin(phase) * 2
  s.line(cx - 6, cy + 1, cx - 9, cy - 1 + tw, PAL.rustDark)
  s.px(cx - 9, cy - 1 + tw, PAL.rust)
  s.px(cx - 3, cy - 2, PAL.rustDark, 0.9)
  s.px(cx + 1, cy + 1, PAL.rustDark, 0.8)
}

/* ============================================================================
 * 巢（蟑螂窝 40×24）
 * ========================================================================== */

function drawRoachNest(s) {
  const g = s.h - 1
  const cx = 20
  s.shadow(cx, g - 0.5, 16, 2.4, 0.55)
  for (let k = 0; k < 12; k++) {
    const x = 4 + ((k * 7) % 33)
    s.ell(x, g - 1 - (k % 3), 2 + (k % 3), 1.4, k % 2 ? PAL.dust : PAL.rustDark)
  }
  s.ell(cx, g - 7, 15, 7, mix(PAL.dust, PAL.sand, 0.2))
  s.ell(cx - 1, g - 8, 13, 5.6, mix(PAL.sand, PAL.dust, 0.35))
  for (let k = 0; k < 4; k++) {
    s.line(cx - 13 + k, g - 10 + k * 2, cx + 13 - k, g - 10 + k * 2, PAL.sandDark)
  }
  for (const [hx, hy, r] of [
    [cx - 6, g - 8, 3],
    [cx + 5, g - 6, 2.6],
    [cx + 11, g - 9, 2],
    [cx - 12, g - 6, 2],
  ]) {
    s.ell(hx, hy, r, r * 0.8, PAL.void)
    s.ell(hx, hy, r - 1, r * 0.6, PAL.black)
  }
  // 探头的蟑螂
  s.px(cx - 6, g - 10, PAL.rustDark)
  s.px(cx - 6, g - 11, PAL.rust)
  s.line(cx - 7, g - 11, cx - 8, g - 13, PAL.ink)
  s.px(cx + 11, g - 10, PAL.rustDark)
  s.line(cx + 12, g - 10, cx + 13, g - 12, PAL.ink)
  // 卵鞘
  s.ell(cx + 2, g - 12, 3, 2, PAL.sand)
  s.px(cx + 1, g - 12, PAL.sandDark)
  s.px(cx + 3, g - 11, PAL.sandDark)
  // 顶部垃圾
  s.rect(cx - 15, g - 15, 6, 3, PAL.rustDark)
  s.rect(cx + 9, g - 14, 7, 3, PAL.steel)
  s.px(cx + 12, g - 14, PAL.steelLight)
}

/* ============================================================================
 * 组装 / 缓存
 * ========================================================================== */

const ECO_DEFS = {
  roach: {
    w: 14,
    h: 8,
    seed: 0x501,
    draw: drawRoach,
    clips: { walk: 4, scared: 2 },
    alias: { idle: 'walk', run: 'walk', dead: 'dead' },
  },
  plant: {
    w: 28,
    h: 40,
    seed: 0x502,
    draw: drawPlant,
    clips: { sway: 4, harvest: 2 },
    alias: { idle: 'sway', run: 'sway', dead: 'dead' },
  },
  fly: {
    w: 8,
    h: 8,
    seed: 0x503,
    draw: drawFly,
    clips: { wings: 3 },
    alias: { idle: 'wings', run: 'wings' },
  },
  rat: {
    w: 20,
    h: 12,
    seed: 0x504,
    draw: drawRat,
    clips: { run: 4 },
    alias: { idle: 'run', dead: 'dead' },
  },
}

export const ECO_ART_IDS = Object.keys(ECO_DEFS)

const ECO_CACHE = new Map()

function ecoFrame(def, anim, i) {
  const s = new Surf(def.w, def.h, def.seed + i * 29 + anim.length * 7, 'eco')
  def.draw(s, { anim, i })
  s.edges(mix(PAL.white, PAL.sand, 0.5), PAL.void, 0.35, 0.45)
  s.outline(mix(PAL.void, PAL.rustDark, 0.2))
  return s.tex()
}

function buildEco(key) {
  const def = ECO_DEFS[key]
  const frames = {}
  for (const [clip, n] of Object.entries(def.clips)) {
    frames[clip] = []
    for (let i = 0; i < n; i++) frames[clip].push(ecoFrame(def, clip, i))
  }
  // 引擎别名：entities/eco 读 idle / run / dead
  for (const [alias, src] of Object.entries(def.alias)) {
    if (frames[alias]) continue
    if (src === 'dead') {
      // 每个物种都有一张死亡帧
      frames.dead = [ecoFrame(def, 'dead', 0)]
    } else if (frames[src]) {
      frames[alias] = frames[src]
    }
  }
  return { w: def.w, h: def.h, artId: key, anchor: 'bottom-center', frames }
}

/**
 * 生态小生物 / 植被美术。未知 kind 退回 roach（14×8 尺寸），不会返回空。
 * 返回 { w, h, anchor, frames }：frames 同时含 spec 里的动画名和 idle/run/dead 别名。
 */
export function getEcoArt(kind) {
  const key = String(kind || '')
  const k = ECO_DEFS[key] ? key : 'roach'
  let art = ECO_CACHE.get(k)
  if (!art) {
    art = buildEco(k)
    ECO_CACHE.set(k, art)
  }
  return art
}

const NEST_CACHE = new Map()

/** 巢穴贴图（roach 40×24）；未知 kind 返回同样的窝（稳定）。 */
export function getNestArt(kind) {
  const key = String(kind || 'roach')
  let tex = NEST_CACHE.get(key)
  if (tex) return tex
  const s = new Surf(40, 24, 0x5a0, 'eco')
  drawRoachNest(s)
  s.edges(mix(PAL.white, PAL.sand, 0.5), PAL.void, 0.3, 0.45)
  s.outline(mix(PAL.void, PAL.rustDark, 0.22))
  tex = s.tex()
  tex.userData.nestKind = key
  NEST_CACHE.set(key, tex)
  return tex
}

/** 预载全部生态 + 巢穴。 */
export function preloadArt() {
  for (const id of ECO_ART_IDS) getEcoArt(id)
  getNestArt('roach')
  return ECO_CACHE.size + NEST_CACHE.size
}

/** 清缓存。 */
export function clearEcoCache() {
  ECO_CACHE.clear()
  NEST_CACHE.clear()
}
