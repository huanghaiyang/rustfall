// ============================================================================
// 锈雨 · RUSTFALL —— 机体（CHASSIS）程序化像素美术
// ----------------------------------------------------------------------------
// 契约：
//   export const CHASSIS_ART_IDS = ['unit7','tesla','agibot','atlas','spider','mule','ghost','hulk']
//   export function getChassisArt(id) -> {
//     w, h,
//     frames: { idle:[t,t], run:[t×6], jump:t, fall:t, land:t, crouch:t, dig:t, hurt:t, dead:t },
//     portrait: t,
//   }
//
// 坐标约定（引擎依赖）：
//   · 画布尺寸 = 世界单位，1 像素 = 1 单位，NearestFilter 放大。
//   · 脚踩最后一行（ground = h-1），水平中心 x = w/2，一律朝右。
//   · run 6 帧为完整步态循环，idle 2 帧呼吸，其余单帧。
//   · portrait 64×64 头肩半身像（UI / 选择界面）。
//
// 画法：
//   全部落在一个 RGBA 像素缓冲（Surf）上，最后一次性 putImageData 成
//   THREE.CanvasTexture —— 没有 Canvas 抗锯齿，天然硬边；抖动用 4×4 Bayer。
//   每个精灵都走同一条收尾管线：
//     机体绘制 → 锈蚀/划痕（确定性 PRNG）→ 上缘高光 + 下缘暗部（三层关系）
//     → 1px 描边 → 受伤/死亡染色 → 自发光（加色 bloom）→ 贴图。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32 } from '../rng.js'
import { Surf, mix, shade, rgb, setArtModule, ALPHA_STATS } from './core.js'
setArtModule('chassis')

const TAU = Math.PI * 2

/* ============================================================================
 * 1. 颜色工具（只在 PAL 内混色，不引入新色相）
 * ========================================================================== */


/* ============================================================================
 * 3. 通用零件画笔（机甲的“词汇表”：板材 / 螺栓 / 散热口 / 履带 / 眼）
 * ========================================================================== */

/** 带倒角的金属板（基色 + 上左高光 + 下右暗部）。 */
function plate(s, x, y, w, h, t, al = 1) {
  s.rect(x, y, w, h, t.base, al)
  s.rect(x, y, w, 1, t.lite, al)
  s.rect(x, y, 1, h, t.lite, al)
  s.rect(x, y + h - 1, w, 1, t.dark, al)
  s.rect(x + w - 1, y, 1, h, t.dark, al)
}

/** 斜切角板（工业件常用：切掉右上/左下 1–2px）。 */
function chamfer(s, x, y, w, h, t, cut = 2) {
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
  // 切角棱线
  s.line(x + cut - 1, y, x, y + cut - 1, t.dark)
}

function bolt(s, x, y, c = PAL.steelLight, dark = PAL.steelDark) {
  s.px(x, y, c)
  s.px(x + 1, y + 1, dark)
}

function vent(s, x, y, w, n, c, step = 2) {
  for (let k = 0; k < n; k++) s.rect(x, y + k * step, w, 1, c)
}

/** 多段线缆：暗芯 + 亮边，端点可带接头。 */
function wire(s, pts, c = PAL.oilSheen, hi = PAL.steelDark) {
  for (let k = 0; k + 1 < pts.length; k++) {
    s.thick(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0.9, c)
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    s.line(pts[k][0], pts[k][1] - 1, pts[k + 1][0], pts[k + 1][1] - 1, hi, 0.7)
  }
}

/** 液压杆：外筒 + 亮杆。 */
function piston(s, x0, y0, x1, y1, tone) {
  s.thick(x0, y0, x1, y1, 1.6, tone.dark)
  const mx = x0 + (x1 - x0) * 0.55
  const my = y0 + (y1 - y0) * 0.55
  s.thick(x0, y0, mx, my, 2.1, tone.base)
  s.thick(mx, my, x1, y1, 1.2, tone.lite)
}

/** 履带：暗底 + 上下导轨 + 随 phase 滚动的胎块。 */
function track(s, x, y, w, h, phase, tone) {
  s.rect(x + 1, y, w - 2, h, tone.dark)
  s.rect(x, y + 1, w, h - 2, tone.dark)
  s.rect(x + 1, y + 1, w - 2, 1, tone.base)
  s.rect(x + 1, y + h - 2, w - 2, 1, PAL.black)
  const n = Math.max(2, Math.floor(w / 5))
  const off = ((phase % n) + n) % n
  for (let k = 0; k < n; k++) {
    const px = x + 2 + (((k + off) * (w - 4)) / n) | 0
    if (px > x + w - 3) continue
    s.rect(px, y + 1, 1, h - 3, tone.lite)
    s.rect(px + 1, y + 2, 1, h - 4, tone.base)
  }
  s.rect(x + 2, y + 2, w - 4, 1, PAL.black, 0.5)
}

/** 发光单眼（核心 1–2px 实心 + 外层加色）。 */
function eyeAt(P, x, y, c, power = 0.75, r = 4) {
  P.g.push({ x, y, r, c, p: power })
}

/** 在表面画眼的实体部分（发光在收尾阶段叠加）。 */
function eyeCore(s, x, y, c, wide = 1) {
  s.set(x, y, PAL.white, 1)
  if (wide > 1) s.set(x + 1, y, PAL.white, 1)
  s.px(x - 1, y, c, 0.9)
  s.px(x + wide, y, c, 0.9)
  s.px(x, y - 1, c, 0.7)
  s.px(x, y + 1, c, 0.7)
}

/** 手持工具（dig 帧 / 部分攻击帧）：铲、镐、焊枪。 */
function handTool(s, kind, hx, hy, dir = 1) {
  if (kind === 'shovel') {
    s.thick(hx, hy, hx - 5 * dir, hy + 8, 1, PAL.rustDark)
    s.thick(hx, hy, hx - 5 * dir, hy + 8, 0.6, PAL.dust)
    s.poly(
      [
        [hx - 7 * dir, hy + 8],
        [hx - 3 * dir, hy + 8],
        [hx - 3 * dir, hy + 12],
        [hx - 5 * dir, hy + 13],
        [hx - 7 * dir, hy + 11],
      ],
      PAL.steelLight,
    )
    s.line(hx - 6 * dir, hy + 9, hx - 4 * dir, hy + 9, PAL.steelWhite)
    s.px(hx - 5 * dir, hy + 11, PAL.steelDark)
  } else if (kind === 'pickaxe') {
    s.thick(hx, hy, hx - 3 * dir, hy + 9, 1, PAL.rustDark)
    s.thick(hx, hy, hx - 3 * dir, hy + 9, 0.5, PAL.dust)
    s.line(hx - 7 * dir, hy + 8, hx + 1 * dir, hy + 9, PAL.steelLight)
    s.line(hx - 7 * dir, hy + 9, hx + 1 * dir, hy + 10, PAL.steelDark)
    s.px(hx - 7 * dir, hy + 9, PAL.steelWhite)
  } else {
    s.rect(hx - 2, hy - 1, 4, 3, PAL.steelDark)
    s.rect(hx - 1, hy, 2, 1, PAL.rubber || PAL.oil)
    s.line(hx + 2, hy + 1, hx + 4 * dir, hy + 2, PAL.oilSheen)
    P.g.push({ x: hx + 4 * dir, y: hy + 2, r: 3.2, c: PAL.neonCold, p: 0.8 })
  }
}

/** 确定性锈蚀 / 脏污 / 划痕：只在已有像素上叠加。 */
function weather(s, seed, opt = {}) {
  const rnd = mulberry32(seed >>> 0)
  const rust = opt.rust ?? 22
  for (let k = 0; k < rust; k++) {
    const x = Math.floor(rnd() * s.w)
    const y = Math.floor(rnd() * s.h)
    if (s.a(x, y) < 160) continue
    s.px(x, y, rnd() < 0.55 ? PAL.rustDark : PAL.rust, 0.5 + rnd() * 0.4)
    if (rnd() < 0.45) s.px(x + 1, y, PAL.rustDark, 0.35)
    if (rnd() < 0.25) s.px(x, y + 1, PAL.rust, 0.3)
  }
  // 划痕：短促的 1px 亮线
  const scr = opt.scratch ?? 7
  for (let k = 0; k < scr; k++) {
    const x = Math.floor(rnd() * s.w)
    const y = Math.floor(rnd() * s.h)
    if (s.a(x, y) < 160) continue
    const len = 2 + Math.floor(rnd() * 4)
    const down = rnd() < 0.5 ? 1 : -1
    for (let i = 0; i < len; i++) {
      if (s.a(x + i, y + i * down) < 120) break
      s.px(x + i, y + i * down, PAL.steelWhite, 0.28)
    }
  }
  // 底部积尘
  if (opt.dirt !== false) {
    const gy = s.h - 1
    for (let k = 0; k < (opt.dirtN ?? 26); k++) {
      const x = Math.floor(rnd() * s.w)
      const y = gy - Math.floor(rnd() * rnd() * 8)
      if (s.a(x, y) < 120) continue
      s.px(x, y, PAL.dust, 0.25 + rnd() * 0.25)
    }
  }
}

/** 火花（受伤 / 电线短路 / 焊接）。 */
function sparks(s, x, y, n, rnd, c = PAL.neonWarm) {
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU
    const d = 1 + rnd() * 5
    s.px(x + Math.cos(a) * d, y + Math.sin(a) * d, c, 0.5 + rnd() * 0.5)
  }
}

/* ============================================================================
 * 4. 机体外观表
 * ========================================================================== */

const T = {
  unit7: {
    base: PAL.ochre,
    lite: mix(PAL.ochre, PAL.sand, 0.5),
    dark: mix(PAL.ochre, PAL.rustDeep, 0.5),
  },
  tesla: {
    base: PAL.steelWhite,
    lite: mix(PAL.steelWhite, PAL.white, 0.55),
    dark: mix(PAL.steelWhite, PAL.steelBlue, 0.55),
  },
  agibot: {
    base: PAL.rustLight,
    lite: mix(PAL.rustLight, PAL.sand, 0.45),
    dark: mix(PAL.rustLight, PAL.rustDeep, 0.6),
  },
  atlas: {
    base: PAL.steelBlue,
    lite: mix(PAL.steelBlue, PAL.steelLight, 0.6),
    dark: mix(PAL.steelBlue, PAL.void, 0.55),
  },
  spider: {
    base: mix(PAL.ochre, PAL.toxicDark, 0.45),
    lite: mix(PAL.ochre, PAL.toxic, 0.35),
    dark: mix(PAL.toxicDark, PAL.rustDeep, 0.55),
  },
  mule: {
    base: PAL.sand,
    lite: mix(PAL.sand, PAL.white, 0.45),
    dark: mix(PAL.sand, PAL.dust, 0.6),
  },
  ghost: {
    base: mix(PAL.ash, PAL.steelBlue, 0.55),
    lite: mix(PAL.ashPale, PAL.steelLight, 0.4),
    dark: mix(PAL.ash, PAL.void, 0.6),
  },
  hulk: {
    base: mix(PAL.steel, PAL.rustDark, 0.45),
    lite: mix(PAL.steel, PAL.rust, 0.5),
    dark: mix(PAL.steelDark, PAL.void, 0.5),
  },
  // 镇暴机体：城防蓝 + 冷白装甲线（复用 heavy 骨架）
  warden: {
    base: mix(PAL.steelBlue, PAL.steelDark, 0.35),
    lite: mix(PAL.steelBlue, PAL.steelWhite, 0.55),
    dark: mix(PAL.steelBlue, PAL.void, 0.62),
  },
  // 弹跳机体：旧游乐设施的橄榄绿 + 黄铜弹簧（复用 light 骨架）
  hopper: {
    base: mix(PAL.ochre, PAL.toxicDark, 0.35),
    lite: mix(PAL.ochre, PAL.sand, 0.55),
    dark: mix(PAL.ochre, PAL.void, 0.55),
  },
}

const SPECS = {
  // 双足人形（宇树 H1 的比例：窄长机身、小腿细长）
  unit7: { w: 40, h: 46, rig: 'biped', seed: 0x11a7, eye: PAL.neon, eye2: PAL.neonWarm, cx: 20, ground: 45, hipY: 32, shoulderY: 18, headTop: 7 },
  // 轮式：Optimus 上半身 + 单大轮底盘
  tesla: { w: 46, h: 34, rig: 'wheel', seed: 0x7e51, eye: PAL.neonWarm, eye2: PAL.neonWarm, cx: 23, ground: 33 },
  // 轮足混合搬运工：宽厚、双轮 + 短桩腿
  agibot: { w: 50, h: 36, rig: 'hybrid', seed: 0xa916, eye: PAL.neon, eye2: PAL.neon, cx: 25, ground: 35 },
  // 重工业机械臂：液压、配重、大臂
  atlas: { w: 46, h: 48, rig: 'arm', seed: 0x47a5, eye: PAL.neonWarm, eye2: PAL.neonWarm, cx: 23, ground: 47 },
  // 四足（宇树 Go2 狗形）
  spider: { w: 44, h: 40, rig: 'quad', seed: 0x5b1d, eye: PAL.neon, eye2: PAL.neonRed, cx: 22, ground: 39 },
  // 轻量信使：细腿大头
  mule: { w: 36, h: 44, rig: 'light', seed: 0x3c0e, eye: PAL.neonCold, eye2: PAL.neonCold, cx: 18, ground: 43 },
  // 潜行侦察：破布披挂 + 天线
  ghost: { w: 38, h: 44, rig: 'ghost', seed: 0x9011, eye: PAL.neon, eye2: PAL.neon, cx: 19, ground: 43 },
  // 重型破拆：装甲板、巨臂
  hulk: { w: 56, h: 52, rig: 'heavy', seed: 0x8e11, eye: PAL.neonRed, eye2: PAL.neonWarm, cx: 28, ground: 51, hipY: 39, shoulderY: 24, headTop: 10 },
  // 镇暴：heavy 骨架 + 独立配色 + 盾牌/肩灯配件
  warden: { w: 52, h: 50, rig: 'heavy', pal: 'warden', shield: true, seed: 0x4c17, eye: PAL.neonCold, eye2: PAL.neonCold, cx: 26, ground: 49, hipY: 37, shoulderY: 22, headTop: 9 },
  // 弹跳：light 骨架 + 独立配色 + 弹簧/稳定轮配件
  hopper: { w: 38, h: 42, rig: 'light', pal: 'hopper', spring: true, seed: 0x2b93, eye: PAL.neonWarm, eye2: PAL.neonWarm, cx: 19, ground: 41 },
}

const OUTLINE = {}

function outlineCol(id) {
  if (!OUTLINE[id]) OUTLINE[id] = mix(PAL.void, T[id].base, 0.16)
  return OUTLINE[id]
}

/** rig 名 → 外观表 / 尺寸表的 id。 */
function rigId(rig) {
  if (rig === 'arm') return 'atlas'
  if (rig === 'heavy') return 'hulk'
  if (rig === 'wheel') return 'tesla'
  if (rig === 'hybrid') return 'agibot'
  if (rig === 'quad') return 'spider'
  if (rig === 'light') return 'mule'
  if (rig === 'ghost') return 'ghost'
  return 'unit7'
}

/* ============================================================================
 * 5. 双足（unit7 / atlas / hulk 共用骨架，比例与装甲不同）
 * ========================================================================== */

/**
 * P: { bob, lean, crouch, legF:{dx,lift,kneeDX}, legB:{...}, armF:{dx,dy}, armB, tool, hurt, dead }
 */
function biped(sp, P) {
  const s = new Surf(sp.w, sp.h, sp.seed + 977 * (P.i || 0) + (P.hurt ? 31 : 0))
  P.g = P.g || []
  const heavy = sp.rig === 'heavy'
  const id = sp.pal || (heavy ? 'hulk' : 'unit7')
  const tn = T[id]
  const g = sp.ground
  const bob = P.bob | 0
  const lean = P.lean | 0
  const crouch = P.crouch ? 1 : 0
  const cx = sp.cx + lean
  const bodyW = heavy ? 21 : 10
  const halfW = bodyW / 2
  const hipHalf = heavy ? halfW * 0.9 : halfW * 0.76
  const hipY = sp.hipY + bob + crouch * 4
  const shY = sp.shoulderY + bob + crouch * 5
  const phase = P.phase ?? 0
  const stride = heavy ? 3.2 : 5.4
  const liftH = heavy ? 2.4 : 4.6
  const rUp = heavy ? 3.5 : 2.4
  const rLo = heavy ? 2.9 : 1.9

  // 接地阴影（低 alpha，不会被当成实体描边）
  s.shadow(cx + 0.5, g - 0.5, halfW + (heavy ? 8 : 4.5), 1.6, 0.34)

  // —— 腿部关节 ——
  const autoLeg = (off) => {
    const ph = phase + off
    return {
      dx: Math.sin(ph) * stride,
      lift: Math.max(0, Math.cos(ph - 1.05)) * liftH,
      kneeDX: Math.sin(ph) > 0 ? (heavy ? 1.4 : 2.2) : heavy ? -1.4 : -2.2,
    }
  }
  const lf = P.legF || autoLeg(0)
  const lb = P.legB || autoLeg(Math.PI)
  const swing = Math.sin(phase) * (heavy ? 2 : 2.8)

  const drawLeg = (leg, back) => {
    const side = back ? -1 : 1
    const hipX = cx + side * (heavy ? 3.4 : 2.8)
    const footX = hipX + leg.dx
    const footY = g - 1 - leg.lift
    const kneeX = (hipX + footX) / 2 + leg.kneeDX * (back ? 0.7 : 1)
    const kneeY = hipY + (footY - hipY) * 0.47
    const colUp = back ? shade(tn.dark, -0.22) : tn.dark
    const colLo = back ? shade(tn.base, -0.3) : shade(tn.base, -0.05)
    s.thick(hipX, hipY, kneeX, kneeY, rUp, colUp)
    s.thick(kneeX, kneeY, footX, footY, rLo, colLo)
    // 小腿迎面高光
    if (!back) s.line(kneeX + 1, kneeY + 1, footX + 1, footY - 1, tn.lite, 0.55)
    else s.line(kneeX, kneeY + 1, footX, footY - 1, PAL.steel, 0.35)
    // 膝关节
    s.disc(kneeX, kneeY, rLo + (heavy ? 1.1 : 0.7), PAL.steelDark)
    s.px(kneeX - 0.5, kneeY - 1, PAL.steelLight, 0.9)
    // 液压小腿（重装）
    if (heavy) {
      s.thick(kneeX - 1, kneeY + 1, footX - 1, footY - 2, 1, PAL.steelLight, 0.5)
      s.rect(footX - 4, footY - 3, 3, 2, PAL.steelDark)
    }
    // 脚掌（前掌朝右）
    const fw = heavy ? 10 : 6
    s.rect(footX - (fw - 4), footY, fw, 2, PAL.steelDark)
    s.rect(footX - (fw - 5), footY, fw - 2, 1, back ? PAL.steel : PAL.steelLight)
    s.px(footX + (fw - 4), footY, PAL.steelWhite, 0.8)
    s.px(footX - (fw - 5), footY + 1, PAL.void, 0.5)
  }

  const drawArm = (arm, back) => {
    const side = back ? -1 : 1
    const shX = cx + side * (halfW + (heavy ? 2.4 : 1.6))
    const shYY = shY + 2.4
    const dx = (arm && arm.dx !== undefined ? arm.dx : -swing * side * 0.9) + lean * 0
    const dy = arm?.dy ?? 0
    const elX = shX + side * (heavy ? 1.2 : 1.6) + dx * 0.5
    const elY = shYY + (heavy ? 6.2 : 5.4) + dy * 0.4
    const hX = elX + side * 0.6 + dx * 0.55
    const hY = elY + (heavy ? 6.2 : 5.2) + dy * 0.6
    const r1 = heavy ? 3.2 : 2
    const r2 = heavy ? 2.7 : 1.7
    const colU = back ? shade(tn.dark, -0.25) : tn.dark
    const colL = back ? shade(tn.base, -0.3) : tn.base
    s.thick(shX, shYY, elX, elY, r1, colU)
    s.thick(elX, elY, hX, hY, r2, colL)
    if (!back) s.line(elX + 1, elY, hX + 1, hY - 1, tn.lite, 0.45)
    // 肘
    s.disc(elX, elY, r2 + 0.8, PAL.steelDark)
    s.px(elX, elY - 1, PAL.steelLight, 0.9)
    // 液压前臂
    if (heavy) piston(s, elX + side, elY + 1, hX + side * 0.5, hY - 2, { base: PAL.steel, lite: PAL.steelWhite, dark: PAL.steelDark })
    // 三指夹爪
    s.rect(hX - 1.5, hY - 1, 3, 3, back ? PAL.steelDark : PAL.steel)
    s.px(hX + side * 2, hY - 1, PAL.steelLight)
    s.px(hX + side * 2, hY + 1, PAL.steelLight)
    s.px(hX - side, hY - 2, PAL.steelDark)
    return { x: hX, y: hY, side }
  }

  // —— 背包 / 动力组（先画，压在躯干后面）——
  if (heavy) {
    plate(s, cx - halfW - 6, shY - 3, 7, 18, { base: PAL.steelDark, lite: PAL.steel, dark: PAL.void })
    s.rect(cx - halfW - 5, shY - 1, 5, 3, PAL.rust)
    s.rect(cx - halfW - 5, shY + 9, 5, 4, PAL.rustDark)
    vent(s, cx - halfW - 4, shY + 5, 3, 2, PAL.steelLight)
    wire(s, [
      [cx - halfW - 5, shY + 3],
      [cx - halfW - 2, shY + 6],
      [cx - halfW + 1, shY + 8],
    ])
  } else {
    plate(s, cx - halfW - 5, shY + 3, 5, 9, { base: PAL.steelBlue, lite: PAL.steel, dark: PAL.steelDark })
    s.rect(cx - halfW - 4, shY + 4, 3, 2, PAL.steelLight)
    s.rect(cx - halfW - 4, shY + 9, 3, 2, PAL.rustDark)
    wire(s, [
      [cx - halfW - 4, shY + 4],
      [cx - halfW - 6, shY + 1],
      [cx - halfW - 1, shY - 1],
      [cx + 0.5, shY + 1.5],
    ])
  }

  // —— 后侧肢体 ——
  drawArm(P.armB, true)
  drawLeg(lb, true)

  // —— 躯干 ——
  s.poly(
    [
      [cx - halfW, shY],
      [cx + halfW, shY],
      [cx + hipHalf, hipY],
      [cx - hipHalf, hipY],
    ],
    tn.base,
  )
  // 内侧暗边（右侧，背光）
  s.line(cx + halfW - 0.5, shY + 1, cx + hipHalf - 0.5, hipY - 1, tn.dark)
  s.line(cx + halfW - 1.5, shY + 1, cx + hipHalf - 1.5, hipY - 1, tn.dark, 0.5)
  // 左缘受光
  s.line(cx - halfW + 0.5, shY + 1, cx - hipHalf + 0.5, hipY - 1, tn.lite, 0.8)
  // 胸甲
  plate(s, cx - hipHalf + 1, shY + 1, hipHalf * 2 - 1, heavy ? 6 : 5, {
    base: mix(tn.base, tn.lite, 0.35),
    lite: tn.lite,
    dark: tn.dark,
  })
  // 胸口核心 + 指示灯
  if (heavy) {
    s.disc(cx + 1, shY + 4, 2.2, PAL.steelDark)
    s.disc(cx + 1, shY + 4, 1.2, sp.eye2)
    eyeAt(P, cx + 1, shY + 4, sp.eye2, 0.7, 6.5)
  } else {
    s.rect(cx - 1, shY + 3, 3, 3, PAL.steelDark)
    s.rect(cx - 0.5, shY + 4, 2, 1, sp.eye2)
    eyeAt(P, cx, shY + 4, sp.eye2, 0.75, 5)
  }
  // 腹部分段
  s.rect(cx - hipHalf + 1, hipY - 4, hipHalf * 2 - 1, 1, tn.dark)
  s.rect(cx - hipHalf + 1, hipY - 2, hipHalf * 2 - 1, 1, tn.dark)
  // 侧面散热
  vent(s, cx + halfW - 3, shY + (heavy ? 8 : 7), 2, 2, PAL.steelDark)
  vent(s, cx - halfW + 1, shY + (heavy ? 8 : 7), 2, 2, PAL.steelBlue)
  // 破损缺口（露出线缆）
  s.px(cx - halfW + 1, shY + (heavy ? 6 : 5), PAL.void, 0.85)
  wire(s, [
    [cx - halfW + 1, shY + (heavy ? 6 : 5)],
    [cx - halfW + 2, shY + (heavy ? 9 : 8)],
    [cx - halfW + 1, shY + (heavy ? 11 : 9)],
  ])
  // 骨盆
  plate(s, cx - hipHalf, hipY, hipHalf * 2, 3, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark })
  s.px(cx - hipHalf + 1, hipY + 1, PAL.steelWhite, 0.7)

  // 肩关节
  s.disc(cx - halfW + 0.5, shY + 2, heavy ? 3.4 : 2.4, PAL.steelDark)
  s.disc(cx + halfW - 0.5, shY + 2, heavy ? 3.4 : 2.4, PAL.steelDark)
  s.px(cx - halfW, shY + 1, PAL.steelLight, 0.8)

  // —— 肩甲（前侧，朝右）——
  if (heavy) {
    chamfer(s, cx + halfW - 2, shY - 3, 9, 8, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark }, 2)
    s.rect(cx + halfW, shY - 2, 5, 1, PAL.rust)
    bolt(s, cx + halfW + 3, shY + 2)
    // 左肩同样有护甲
    chamfer(s, cx - halfW - 6, shY - 2, 7, 6, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark }, 2)
  } else {
    plate(s, cx + halfW - 2, shY - 1, 5, 4, { base: tn.base, lite: tn.lite, dark: tn.dark })
    s.rect(cx + halfW, shY, 2, 1, PAL.steelLight, 0.9)
    bolt(s, cx + halfW + 1, shY + 2)
  }

  // —— 颈 + 头 ——
  s.rect(cx - 1, shY - 2, 3, 2, PAL.steelDark)
  s.px(cx, shY - 2, PAL.steel, 1)
  const headBot = shY - 2
  const headTop = sp.headTop + bob + crouch * 5
  const hh = headBot - headTop
  const hw = heavy ? 13 : 9
  const headCX = cx + (P.headDX || 0)
  const hx = Math.round(headCX - hw / 2)
  // 后脑
  s.rect(hx - 1, headTop + 2, 2, hh - 3, PAL.steelDark)
  // 头壳
  chamfer(s, hx, headTop, hw, hh, { base: tn.base, lite: tn.lite, dark: tn.dark }, 2)
  // 面罩深槽
  const vy = headTop + Math.round(hh * 0.45)
  s.rect(hx + 2, vy - 1, hw - 3, 3, PAL.void)
  s.rect(hx + hw - 1, vy - 1, 2, 3, PAL.steelDark)
  // 眼
  const ex = hx + (heavy ? 4 : 3)
  eyeCore(s, ex + 1, vy, sp.eye, 2)
  eyeAt(P, ex + 2, vy, sp.eye, heavy ? 1 : 0.85, heavy ? 8 : 6)
  // 眉甲
  s.line(hx + 1, vy - 2, hx + hw - 2, vy - 2, tn.lite, 0.7)
  // 下颌格栅
  s.rect(hx + 2, headTop + hh - 3, hw - 3, 2, PAL.steelDark)
  vent(s, hx + 3, headTop + hh - 3, heavy ? 5 : 3, 2, PAL.steelBlue)
  // 头顶散热 / 天线
  s.rect(hx + 2, headTop - 1, hw - (heavy ? 6 : 4), 1, PAL.steelLight, 0.9)
  if (heavy) {
    s.rect(hx + 1, headTop - 3, 2, 3, PAL.steelDark)
    s.px(hx + 1, headTop - 3, PAL.neonRed, 0.95)
    eyeAt(P, hx + 1, headTop - 3, PAL.neonRed, 0.4, 3.5)
    s.rect(hx + hw - 3, headTop + 1, 2, 2, PAL.void, 0.8)
  } else {
    s.line(hx + 1, headTop, hx - 2, headTop - 6, PAL.steelLight)
    s.px(hx - 2, headTop - 6, PAL.neonWarm)
    eyeAt(P, hx - 2, headTop - 6, PAL.neonWarm, 0.5, 3)
    s.rect(hx - 2, headTop + 2, 2, 4, PAL.steelDark)
    s.px(hx - 2, headTop + 3, PAL.neonWarm, 0.9)
  }

  // —— 前侧肢体 ——
  drawLeg(lf, false)
  const hand = drawArm(P.armF, false)
  P.gunAt = [hand.x + 2, hand.y - 1]
  // 手腕灯
  s.px(hand.x + hand.side, hand.y - 2, PAL.neonWarm, 0.85)

  // —— 手持工具 ——
  if (P.tool) {
    handTool(s, P.tool, hand.x + 1, hand.y + 1, 1)
    for (let k = 0; k < 6; k++) {
      s.px(cx + 5 + s.r() * 9, g - 2 - s.r() * 4, PAL.dust, 0.3 + s.r() * 0.3)
    }
  }
  // —— 跑动扬尘 ——
  if (P.anim === 'run' && !P.tool) {
    const kx = cx - stride - 2
    s.px(kx, g - 1, PAL.dust, 0.35)
    if (phase % 1.2 < 0.5) s.px(kx - 2, g - 2, PAL.dust, 0.22)
  }

  // —— WARDEN 专属：前臂破盾 + 肩头警报灯 ——
  if (sp.shield) {
    const sx = hand.x + 3
    const sy = hand.y - 7
    plate(s, sx, sy, 5, 13, { base: T.warden.lite, lite: PAL.steelWhite, dark: T.warden.dark })
    s.line(sx + 1, sy + 2, sx + 3, sy + 2, PAL.rust, 0.8)
    s.line(sx + 1, sy + 10, sx + 3, sy + 10, PAL.rust, 0.6)
    s.rect(sx + 1, sy + 5, 2, 3, PAL.rustDark, 0.9)
    s.disc(sx + 2, sy + 6, 1.4, PAL.void)
    s.px(sx + 2, sy + 6, T.warden.lite)
  }
  if (sp.pal === 'warden') {
    const bx = cx - halfW - 1
    const by = sp.shoulderY - 3
    s.rect(bx, by, 3, 3, PAL.steelDark)
    s.px(bx + 1, by + 1, PAL.neonCold, 0.95)
    eyeAt(P, bx + 1, by + 1, PAL.neonCold, 0.6, 7)
  }
  return finish(s, sp, P)
}


/** 腰部宽度（下宽上窄 / 重装下宽）。 */
function HeavyWaist(rig, bodyW) {
  if (rig === 'heavy') return bodyW * 0.86
  if (rig === 'arm') return bodyW * 0.8
  return bodyW * 0.68
}

/* ============================================================================
 * 6. 轮式（tesla）
 * ========================================================================== */

function wheel(sp, P) {
  const s = new Surf(sp.w, sp.h, sp.seed + 977 * (P.i || 0))
  P.g = P.g || []
  const t = T.tesla
  const g = sp.ground
  const cx = sp.cx
  const bob = P.bob | 0
  const lean = P.lean | 0
  const wheelR = 6.5
  const wy = g - wheelR
  const phase = P.phase ?? 0
  const spin = P.anim === 'run' ? phase * 0.6 : 0

  s.shadow(cx + 1, g - 0.5, 14, 2, 0.5)

  // —— 底盘 ——
  plate(s, cx - 13, wy - 4, 26, 6, { base: PAL.steelDark, lite: PAL.steel, dark: PAL.void })
  s.rect(cx - 11, wy - 2, 22, 2, PAL.steelBlue)

  // —— 单大轮 ——
  const wx = cx + 1
  s.disc(wx, wy, wheelR, PAL.black)
  s.disc(wx, wy, wheelR - 1, PAL.oil)
  // 胎纹（随速度旋转）
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + spin
    const x0 = wx + Math.cos(a) * (wheelR - 1.2)
    const y0 = wy + Math.sin(a) * (wheelR - 1.2)
    const x1 = wx + Math.cos(a) * (wheelR - 3.4)
    const y1 = wy + Math.sin(a) * (wheelR - 3.4)
    s.line(x0, y0, x1, y1, PAL.ashPale, 0.85)
  }
  // 轮毂
  s.disc(wx, wy, 3.2, PAL.steel)
  s.disc(wx, wy, 2, PAL.steelDark)
  s.px(wx - 1, wy - 1, PAL.steelLight)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + spin * 1.4
    s.line(wx, wy, wx + Math.cos(a) * 2.6, wy + Math.sin(a) * 2.6, PAL.steelLight, 0.9)
  }
  // 挡泥板
  s.ell(wx, wy, wheelR + 1.4, wheelR + 1.2, PAL.steelDark, 0)
  for (let a = -0.35; a <= 3.0; a += 0.08) {
    const x = wx + Math.cos(a + 2.3) * (wheelR + 1.2)
    const y = wy + Math.sin(a + 2.3) * (wheelR + 1.2)
    if (y < wy + 1) s.px(x, y, PAL.steel, 0.9)
  }
  // 后小轮
  s.disc(cx - 11, g - 2.6, 2.6, PAL.oil)
  s.px(cx - 12, g - 3, PAL.steelLight)

  // —— 升降立柱 ——
  piston(s, cx - 2, wy - 6, cx, wy - 17 + bob, { base: PAL.steel, lite: PAL.steelWhite, dark: PAL.steelDark })

  // —— 上半身 ——
  const shY = wy - 22 + bob
  const hipY = wy - 6
  // 髋部
  plate(s, cx - 6, hipY - 5, 12, 6, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark })
  // 躯干（Optimus 式宽胸 + 收腰）
  s.poly(
    [
      [cx - 7 + lean, shY],
      [cx + 7 + lean, shY],
      [cx + 5, shY + 9],
      [cx - 5, shY + 9],
    ],
    t.base,
  )
  s.line(cx - 6 + lean, shY + 1, cx - 4, shY + 8, t.lite)
  s.line(cx + 6 + lean, shY + 1, cx + 4, shY + 8, t.dark)
  s.rect(cx - 3 + lean, shY + 1, 6, 4, t.lite, 0.5)
  // 胸口核心
  s.rect(cx - 2 + lean, shY + 3, 4, 4, PAL.steelDark)
  s.rect(cx - 1 + lean, shY + 4, 2, 2, sp.eye)
  eyeAt(P, cx + lean, shY + 5, sp.eye, 0.7, 6)
  // 肩
  s.disc(cx - 7 + lean, shY + 2, 3, PAL.steelDark)
  s.disc(cx + 7 + lean, shY + 2, 3, PAL.steelDark)

  // 手臂：右臂前伸（拾荒者姿态），左臂垂下
  const drawArms = () => {
    // 后臂
    s.thick(cx - 7, shY + 3, cx - 9, shY + 10, 2.2, t.dark)
    s.thick(cx - 9, shY + 10, cx - 8, shY + 15, 1.9, shade(t.base, -0.2))
    s.rect(cx - 10, shY + 15, 4, 2, PAL.steelDark)
    // 前臂（伸向右）
    const ax = cx + 7 + lean
    const ex = ax + 5 + (P.armF?.dx || 0)
    const ey = shY + 7 + (P.armF?.dy || 0)
    s.thick(ax, shY + 3, ex, ey, 2.4, t.dark)
    s.thick(ex, ey, ex + 4, ey + 2, 1.9, t.base)
    s.disc(ex, ey, 1.8, PAL.steelDark)
    s.rect(ex + 4, ey + 1, 4, 2, PAL.steel)
    s.px(ex + 7, ey + 1, PAL.steelLight)
    return { x: ex + 6, y: ey + 2 }
  }
  const hand = drawArms()
  P.gunAt = [hand.x + 2, hand.y - 1]

  // —— 头部：横向长条头 + 双侧光带 ——
  const headY = shY - 8
  chamfer(s, cx - 6 + lean, headY, 13, 9, { base: t.base, lite: t.lite, dark: t.dark }, 2)
  s.rect(cx - 3 + lean, headY + 3, 9, 3, PAL.void)
  eyeCore(s, cx + 1 + lean, headY + 4, sp.eye, 1)
  eyeCore(s, cx + 3 + lean, headY + 4, sp.eye, 1)
  eyeAt(P, cx + 2 + lean, headY + 4, sp.eye, 0.85, 7)
  // 耳部传感器
  s.rect(cx - 7 + lean, headY + 2, 2, 4, PAL.steelDark)
  s.px(cx - 7 + lean, headY + 3, PAL.neonRed, 0.9)
  // 天线
  s.line(cx - 2 + lean, headY, cx - 3 + lean, headY - 4, PAL.steelLight)
  s.px(cx - 3 + lean, headY - 4, PAL.neonRed, 0.9)
  // 颈部液压
  piston(s, cx - 1, headY + 8, cx, shY + 1, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark })

  if (P.tool) handTool(s, P.tool, hand.x, hand.y, 1)
  return finish(s, sp, P)
}

/* ============================================================================
 * 7. 轮足混合搬运工（agibot）
 * ========================================================================== */

function hybrid(sp, P) {
  const s = new Surf(sp.w, sp.h, sp.seed + 977 * (P.i || 0))
  P.g = P.g || []
  const t = T.agibot
  const g = sp.ground
  const cx = sp.cx + (P.lean || 0)
  const bob = P.bob | 0
  const phase = P.phase ?? 0
  const spin = P.anim === 'run' ? phase * 0.7 : 0

  s.shadow(cx, g - 0.5, 17, 2, 0.5)

  // —— 双轮 ——
  const wy = g - 5
  const wheelAt = (wx) => {
    s.disc(wx, wy, 5, PAL.oil)
    s.disc(wx, wy, 3.4, PAL.steelDark)
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + spin
      s.line(wx, wy, wx + Math.cos(a) * 3, wy + Math.sin(a) * 3, PAL.steelLight, 0.9)
    }
    s.px(wx - 1, wy - 1, PAL.steelWhite)
    // 胎纹
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU
      s.px(wx + Math.cos(a) * 4.2, wy + Math.sin(a) * 4.2, PAL.ashPale, 0.7)
    }
  }
  wheelAt(cx - 12)
  wheelAt(cx + 12)

  // —— 短桩腿（轮足混合）——
  const legY = g - 9 + (P.crouch ? 3 : 0)
  for (const lx of [cx - 8, cx + 8]) {
    s.thick(lx, legY, lx + (lx < cx ? -2 : 2), g - 2, 2, PAL.steelDark)
    s.rect(lx + (lx < cx ? -3 : 1), g - 2, 4, 2, PAL.steel)
  }

  // —— 底盘 ——
  chamfer(s, cx - 16, legY - 6, 32, 9, { base: PAL.steelDark, lite: PAL.steel, dark: PAL.void }, 2)
  vent(s, cx - 12, legY - 4, 7, 2, PAL.rust)
  s.rect(cx + 3, legY - 5, 9, 2, PAL.steelBlue)

  // —— 货架 / 搬运结构 ——
  const bodyY = legY - 18 + bob
  // 立柱
  s.rect(cx - 14, bodyY + 2, 3, 14, PAL.steelDark)
  s.rect(cx + 12, bodyY + 2, 3, 14, PAL.steelDark)
  s.rect(cx - 13, bodyY + 2, 1, 14, PAL.steel)
  s.rect(cx + 13, bodyY + 2, 1, 14, PAL.steel)

  // 主躯干（宽厚）
  chamfer(s, cx - 11, bodyY, 22, 16, { base: t.base, lite: t.lite, dark: t.dark }, 3)
  // 前面板
  s.rect(cx - 8, bodyY + 3, 13, 8, PAL.steelDark)
  s.rect(cx - 7, bodyY + 4, 11, 6, PAL.void)
  // 屏幕：装载数据
  s.rect(cx - 6, bodyY + 5, 5, 1, PAL.neon, 0.9)
  s.rect(cx - 6, bodyY + 7, 8, 1, PAL.neon, 0.6)
  s.rect(cx + 2, bodyY + 5, 2, 3, PAL.neonWarm, 0.8)
  eyeAt(P, cx - 2, bodyY + 6, PAL.neon, 0.4, 6)
  // 装甲分割线
  s.line(cx - 11, bodyY + 12, cx + 11, bodyY + 12, t.dark)
  vent(s, cx - 9, bodyY + 13, 8, 2, PAL.steelDark)
  bolt(s, cx - 10, bodyY + 2)
  bolt(s, cx + 8, bodyY + 2)

  // 顶部货箱
  plate(s, cx - 9, bodyY - 7, 18, 7, { base: PAL.rustLight, lite: PAL.sand, dark: PAL.rustDark })
  s.rect(cx - 7, bodyY - 6, 6, 4, PAL.rustDark)
  s.rect(cx + 1, bodyY - 5, 6, 3, PAL.dust)
  s.rect(cx - 9, bodyY - 7, 18, 1, PAL.sand, 0.6)

  // 双臂（搬运夹钳，朝右前）
  const armY = bodyY + 5
  s.thick(cx + 11, armY, cx + 16, armY + 4, 2.4, t.dark)
  s.thick(cx + 16, armY + 4, cx + 19, armY + 2, 2, t.base)
  // 夹钳
  s.line(cx + 19, armY + 1, cx + 22, armY - 1, PAL.steelLight)
  s.line(cx + 19, armY + 4, cx + 22, armY + 5, PAL.steelLight)
  s.px(cx + 22, armY - 1, PAL.steelWhite)
  s.px(cx + 22, armY + 5, PAL.steelWhite)
  // 后臂
  s.thick(cx - 11, armY, cx - 14, armY + 6, 2.2, shade(t.dark, -0.2))
  s.rect(cx - 16, armY + 6, 4, 2, PAL.steelDark)

  // 头部：低矮，双蓝眼
  const hy = bodyY - 13
  chamfer(s, cx - 7, hy, 14, 7, { base: t.base, lite: t.lite, dark: t.dark }, 2)
  s.rect(cx - 5, hy + 2, 10, 2, PAL.void)
  eyeCore(s, cx - 3, hy + 2, sp.eye, 1)
  eyeCore(s, cx + 1, hy + 2, sp.eye, 1)
  eyeAt(P, cx - 2, hy + 2.5, sp.eye, 0.8, 6)
  eyeAt(P, cx + 2, hy + 2.5, sp.eye, 0.8, 6)
  // 警示灯
  s.px(cx - 6, hy + 1, PAL.neonWarm, 0.9)
  s.line(cx - 1, hy, cx - 2, hy - 3, PAL.steelDark)
  s.px(cx - 2, hy - 3, PAL.neonRed, 0.9)

  // 车头灯（朝右）
  s.rect(cx + 14, bodyY + 1, 2, 2, PAL.neonWarm)
  eyeAt(P, cx + 15, bodyY + 2, PAL.neonWarm, 0.45, 5)

  // 手握点：混合式机体的工作臂末端
  P.gunAt = [cx + 21, armY + 9]
  if (P.tool) handTool(s, P.tool, cx + 20, armY + 8, 1)
  return finish(s, sp, P)
}

/* ============================================================================
 * 8. 重工业机械臂（atlas）—— 在三足/履带底盘上装一条工作臂
 * ========================================================================== */

function armRig(sp, P) {
  const s = new Surf(sp.w, sp.h, sp.seed + 977 * (P.i || 0))
  P.g = P.g || []
  const t = T.atlas
  const g = sp.ground
  const cx = sp.cx
  const bob = P.bob | 0
  const phase = P.phase ?? 0
  const crouch = P.crouch ? 1 : 0

  s.shadow(cx, g - 0.5, 17, 2.2, 0.5)

  // —— 双履带底盘 ——
  const baseY = g - 10
  track(s, cx - 19, baseY, 20, 10, phase * (P.anim === 'run' ? 1 : 0), {
    base: PAL.steel,
    lite: PAL.steelLight,
    dark: PAL.steelDark,
  })
  track(s, cx + 1, baseY, 20, 10, phase * (P.anim === 'run' ? 1 : 0), {
    base: PAL.steel,
    lite: PAL.steelLight,
    dark: PAL.steelDark,
  })
  // 底盘主体
  plate(s, cx - 14, baseY - 4, 30, 6, { base: PAL.steelBlue, lite: PAL.steelLight, dark: PAL.void })
  s.rect(cx - 10, baseY - 2, 8, 2, PAL.rust)
  s.rect(cx + 3, baseY - 3, 9, 3, PAL.steelDark)

  // —— 回转座 ——
  const hipY = baseY - 6 + (bob | 0) + crouch * 3
  s.ell(cx - 1, hipY - 1, 11, 4, PAL.steelDark)
  s.ell(cx - 1, hipY - 2, 9, 3, PAL.steel)
  s.rect(cx - 9, hipY - 3, 17, 2, PAL.steelLight)

  // —— 主躯干（短粗）——
  const shY = hipY - 16
  chamfer(s, cx - 10, shY, 20, 16, { base: t.base, lite: t.lite, dark: t.dark }, 3)
  s.rect(cx - 7, shY + 3, 9, 5, PAL.steelDark)
  // 核心反应堆口
  s.disc(cx - 2, shY + 6, 2.6, PAL.void)
  s.disc(cx - 2, shY + 6, 1.6, sp.eye)
  eyeAt(P, cx - 2, shY + 6, sp.eye, 0.8, 8)
  // 面板
  vent(s, cx + 2, shY + 10, 5, 2, PAL.steelDark)
  bolt(s, cx - 8, shY + 2)
  bolt(s, cx + 6, shY + 2)
  s.rect(cx - 10, shY + 12, 20, 2, PAL.rustDark, 0.7)

  // —— 工作臂（右侧，三节 + 爪）——
  const shX = cx + 8
  const shYY = shY + 3
  const ax = P.anim === 'dig' ? -1 : 0
  const e1 = { x: shX + 12 + (P.armF?.dx || 0) * 0.5, y: shYY - 4 + (P.armF?.dy || 0) * 0.4 }
  const e2 = {
    x: e1.x + 5 + ax * 3,
    y: e1.y + (P.anim === 'dig' ? 12 : 9) + (P.armF?.dy || 0) * 0.5,
  }
  // 上臂
  s.thick(shX, shYY, e1.x, e1.y, 3.4, t.dark)
  s.thick(shX, shYY, (shX + e1.x) / 2, (shYY + e1.y) / 2, 4.2, t.base)
  piston(s, shX, shYY + 1, e1.x - 2, e1.y + 2, { base: PAL.steelLight, lite: PAL.steelWhite, dark: PAL.steelDark })
  s.disc(shX, shYY, 3.8, PAL.steelDark)
  s.disc(shX, shYY, 2.4, PAL.steel)
  // 前臂
  s.thick(e1.x, e1.y, e2.x, e2.y, 2.8, t.base)
  s.disc(e1.x, e1.y, 3, PAL.steelDark)
  s.disc(e1.x, e1.y, 1.8, PAL.steelLight)
  piston(s, e1.x + 2, e1.y + 2, e2.x - 1, e2.y - 2, { base: PAL.steel, lite: PAL.steelWhite, dark: PAL.steelDark })
  // 工作头（破碎锤 / 铲斗，按动作变化）
  const hx = e2.x
  const hy = e2.y
  if (P.anim === 'dig') {
    // 铲斗朝下
    s.poly(
      [
        [hx - 4, hy],
        [hx + 4, hy + 1],
        [hx + 3, hy + 7],
        [hx - 3, hy + 6],
      ],
      PAL.steelLight,
    )
    s.line(hx - 3, hy + 1, hx + 3, hy + 2, PAL.steelWhite)
    s.rect(hx - 2, hy + 5, 4, 2, PAL.rustDark)
    for (let k = 0; k < 9; k++) s.px(hx - 6 + s.r() * 12, g - 1 - s.r() * 5, PAL.dust, 0.5)
    s.px(hx - 5, g - 2, PAL.rust, 0.6)
  } else if (P.anim === 'attack') {
    // 液压爪张开
    s.line(hx - 1, hy - 2, hx + 5, hy - 5, PAL.steelLight)
    s.line(hx - 1, hy + 2, hx + 5, hy + 5, PAL.steelLight)
    s.rect(hx - 4, hy - 2, 4, 5, PAL.steel)
    s.px(hx + 5, hy - 5, PAL.steelWhite)
    P.g.push({ x: hx + 3, y: hy, r: 4, c: PAL.neonWarm, p: 0.5 })
  } else {
    s.rect(hx - 4, hy - 1, 8, 6, PAL.steel)
    s.rect(hx - 3, hy, 6, 2, PAL.steelLight)
    s.rect(hx + 2, hy + 3, 2, 2, PAL.steelDark)
    s.px(hx - 4, hy + 4, PAL.rust)
  }

  // —— 头部（小型，嵌在躯干里）——
  const hy2 = shY - 6
  chamfer(s, cx - 6, hy2, 13, 7, { base: t.base, lite: t.lite, dark: t.dark }, 2)
  s.rect(cx - 4, hy2 + 2, 9, 3, PAL.void)
  eyeCore(s, cx - 1, hy2 + 3, sp.eye, 2)
  eyeAt(P, cx + 1, hy2 + 3, sp.eye, 0.9, 6.5)
  s.rect(cx - 6, hy2 + 5, 2, 2, PAL.steelDark)
  // 警示灯 + 天线
  s.px(cx + 5, hy2 + 1, PAL.neonRed, 0.95)
  eyeAt(P, cx + 5, hy2 + 1, PAL.neonRed, 0.35, 4)
  s.line(cx - 4, hy2, cx - 6, hy2 - 5, PAL.steelLight)
  s.px(cx - 6, hy2 - 5, PAL.neonWarm)

  // 施工灯（头顶偏右）
  s.rect(cx + 4, hy2 - 1, 3, 2, PAL.steelDark)
  eyeAt(P, cx + 6, hy2, PAL.neonWarm, 0.5, 4)
  if (P.lamp) s.glow(cx + 8, hy2 + 4, 8, PAL.neonWarm, 0.25)

  // 手握点：工作臂末端夹爪
  P.gunAt = [hx + 1, hy + 5]
  if (P.tool) handTool(s, P.tool, hx, hy + 4, 1)
  return finish(s, sp, P)
}

/* ============================================================================
 * 9. 四足（spider / Go2 狗形）
 * ========================================================================== */

function quad(sp, P) {
  const s = new Surf(sp.w, sp.h, sp.seed + 977 * (P.i || 0))
  P.g = P.g || []
  const t = T.spider
  const g = sp.ground
  const bob = P.bob | 0
  const cx = sp.cx + (P.lean || 0)
  const phase = P.phase ?? 0
  const crouch = P.crouch ? 1 : 0

  s.shadow(cx, g - 0.5, 16, 2, 0.5)

  const bodyY = g - 15 + bob + crouch * 4
  const legLen = g - bodyY

  // 四条腿：髋点在背甲两侧，膝盖向外/上抬，脚落在地面
  const legs = [
    { x: cx - 9, back: true, off: Math.PI },
    { x: cx + 7, back: true, off: Math.PI * 0.5 },
    { x: cx - 8, back: false, off: 0 },
    { x: cx + 8, back: false, off: Math.PI * 1.5 },
  ]
  const drawQuadLeg = (l) => {
    const ph = phase + l.off
    const dx = Math.sin(ph) * 3.6
    const lift = Math.max(0, Math.cos(ph - 1.1)) * 3.4
    const hipX = l.x
    const hipY = bodyY + 3
    const footX = l.x + dx + (l.back ? -1.4 : 1.4)
    const footY = g - 1 - lift
    const kneeX = hipX + (l.back ? -3.4 : 3.4) + dx * 0.3
    const kneeY = (hipY + footY) / 2 - 1
    const c1 = l.back ? shade(t.dark, -0.25) : t.dark
    const c2 = l.back ? shade(t.base, -0.3) : t.base
    s.thick(hipX, hipY, kneeX, kneeY, 1.9, c1)
    s.thick(kneeX, kneeY, footX, footY, 1.5, c2)
    s.disc(kneeX, kneeY, 1.5, PAL.steelDark)
    // 脚：橡胶垫
    s.rect(footX - 1, footY, 3, 2, PAL.oil)
    s.px(footX, footY, PAL.steelDark)
    if (lift > 1.5) s.px(footX + 1, footY + 2, PAL.dust, 0.4)
  }

  // 远侧两腿
  drawQuadLeg(legs[0])
  drawQuadLeg(legs[1])

  // —— 躯干 / 背甲 ——
  s.ell(cx, bodyY + 4, 12, 7, t.dark)
  s.poly(
    [
      [cx - 11, bodyY + 3],
      [cx - 5, bodyY - 3],
      [cx + 6, bodyY - 3],
      [cx + 12, bodyY + 2],
      [cx + 11, bodyY + 7],
      [cx - 10, bodyY + 7],
    ],
    t.base,
  )
  // 背甲高光
  s.line(cx - 5, bodyY - 2, cx + 5, bodyY - 2, t.lite)
  s.line(cx - 10, bodyY + 2, cx - 6, bodyY - 1, t.lite)
  // 甲片分割
  s.line(cx - 5, bodyY - 3, cx - 4, bodyY + 6, t.dark)
  s.line(cx + 3, bodyY - 3, cx + 4, bodyY + 6, t.dark)
  // 腹部机械结构
  s.rect(cx - 8, bodyY + 6, 16, 3, PAL.steelDark)
  vent(s, cx - 6, bodyY + 7, 5, 1, PAL.steelBlue)
  // 侧面液压
  s.rect(cx - 11, bodyY + 2, 3, 4, PAL.steelDark)
  s.px(cx - 10, bodyY + 1, PAL.steelLight)
  // 尾部配重/天线
  s.line(cx - 12, bodyY - 1, cx - 15, bodyY - 5, PAL.steelLight)
  s.px(cx - 15, bodyY - 5, PAL.neonRed, 0.9)
  eyeAt(P, cx - 15, bodyY - 5, PAL.neonRed, 0.4, 3)

  // —— 颈 + 头（朝右）——
  const neckX = cx + 10
  const neckY = bodyY + 1
  s.thick(neckX, neckY, neckX + 3, neckY - 5, 2.6, t.base)
  s.thick(neckX + 1, neckY - 1, neckX + 3, neckY - 4, 1.4, t.lite, 0.6)
  const hx = neckX + 6
  const hy = neckY - 8
  // 头壳（犬形：吻部向右）
  s.poly(
    [
      [hx - 4, hy],
      [hx + 5, hy + 1],
      [hx + 7, hy + 4],
      [hx + 2, hy + 7],
      [hx - 4, hy + 6],
    ],
    t.base,
  )
  s.line(hx - 3, hy + 1, hx + 4, hy + 2, t.lite)
  s.rect(hx + 3, hy + 5, 4, 2, t.dark)
  // 传感器双眼
  s.rect(hx - 1, hy + 2, 5, 3, PAL.void)
  eyeCore(s, hx, hy + 3, sp.eye, 1)
  eyeCore(s, hx + 3, hy + 3, sp.eye, 1)
  eyeAt(P, hx + 1, hy + 3.5, sp.eye, 0.8, 6.5)
  // 头顶激光测距
  s.rect(hx, hy - 2, 2, 2, PAL.steelDark)
  eyeAt(P, hx + 1, hy - 1, sp.eye2, 0.6, 4)
  // 耳 / 天线
  s.line(hx - 3, hy, hx - 5, hy - 4, PAL.steelLight)
  s.px(hx - 5, hy - 4, PAL.neonRed, 0.9)

  // 近侧两腿
  drawQuadLeg(legs[2])
  drawQuadLeg(legs[3])

  // 战术挂载
  s.rect(cx - 2, bodyY - 6, 7, 3, PAL.steelDark)
  s.rect(cx, bodyY - 5, 4, 1, PAL.rust)
  // 手握点：四足背部挂载臂
  P.gunAt = [hx + 5, hy + 9]
  if (P.tool) handTool(s, P.tool, hx + 4, hy + 8, 1)
  return finish(s, sp, P)
}

/* ============================================================================
 * 10. 轻量信使（mule）—— 细腿、大头、天线、邮包
 * ========================================================================== */

function light(sp, P) {
  const s = new Surf(sp.w, sp.h, sp.seed + 977 * (P.i || 0))
  P.g = P.g || []
  const t = T[sp.pal] || T.mule
  const g = sp.ground
  const cx = sp.cx
  const bob = P.bob | 0
  const phase = P.phase ?? 0
  const crouch = P.crouch ? 1 : 0
  const hipY = g - 18 + bob + crouch * 5

  s.shadow(cx, g - 0.5, 9, 1.6, 0.5)

  const drawLeg = (off, back) => {
    const ph = phase + off
    const dx = Math.sin(ph) * 5
    const lift = Math.max(0, Math.cos(ph - 1.1)) * 5
    const hipX = cx + (back ? -2 : 2)
    const footX = cx + dx + (back ? -2 : 2)
    const footY = g - 1 - lift
    const kneeX = hipX + dx * 0.5 + (back ? -1.6 : 1.6)
    const kneeY = (hipY + footY) / 2
    const c = back ? shade(t.dark, -0.2) : t.dark
    s.thick(hipX, hipY, kneeX, kneeY, 1.5, c)
    s.thick(kneeX, kneeY, footX, footY, 1.2, back ? shade(t.base, -0.25) : PAL.steelLight)
    s.px(kneeX, kneeY, PAL.steelDark)
    s.rect(footX - 1, footY, 4, 1, PAL.steelDark)
    s.px(footX, footY - 1, PAL.steelLight)
  }
  if (!sp.spring) drawLeg(Math.PI, true)

  // 躯干（细长）
  s.poly(
    [
      [cx - 5, hipY - 12],
      [cx + 5, hipY - 12],
      [cx + 4, hipY],
      [cx - 4, hipY],
    ],
    t.base,
  )
  s.line(cx - 4, hipY - 11, cx - 3, hipY - 1, t.lite)
  s.rect(cx - 2, hipY - 9, 4, 5, PAL.steelDark)
  s.rect(cx - 1, hipY - 8, 2, 3, sp.eye, 0.85)
  eyeAt(P, cx, hipY - 6.5, sp.eye, 0.45, 5)
  vent(s, cx - 3, hipY - 4, 3, 2, PAL.steelDark)
  // 骨盆
  plate(s, cx - 5, hipY - 2, 10, 3, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark })

  // 邮包（背后）
  plate(s, cx - 10, hipY - 14, 6, 9, { base: PAL.rustLight, lite: PAL.sand, dark: PAL.rustDark })
  s.rect(cx - 9, hipY - 13, 4, 2, PAL.rustDark)
  s.line(cx - 9, hipY - 10, cx - 6, hipY - 10, PAL.dust)
  s.rect(cx - 7, hipY - 7, 2, 2, PAL.rust)

  // 手臂（短，前伸递件）
  s.thick(cx + 5, hipY - 11, cx + 8, hipY - 7, 1.6, t.dark)
  s.thick(cx + 8, hipY - 7, cx + 9, hipY - 10, 1.3, t.base)
  s.rect(cx + 8, hipY - 12, 3, 2, PAL.steelDark)
  s.thick(cx - 5, hipY - 11, cx - 7, hipY - 7, 1.4, shade(t.dark, -0.2))

  // 大头（信使特征：占身高 1/3）
  const hh = 13
  const hw = 15
  const hx = cx - hw / 2 + 1
  const hy = hipY - 12 - hh + 2
  chamfer(s, hx, hy, hw, hh, { base: t.base, lite: t.lite, dark: t.dark }, 3)
  // 面部屏幕（占满前半部）
  s.rect(hx + 3, hy + 3, 10, 7, PAL.void)
  s.rect(hx + 4, hy + 4, 8, 5, PAL.ash, 0.5)
  // 两只眼睛 + 一点“表情”
  eyeCore(s, hx + 6, hy + 6, sp.eye, 1)
  eyeCore(s, hx + 10, hy + 6, sp.eye, 1)
  eyeAt(P, hx + 7, hy + 6.5, sp.eye, 0.75, 5)
  eyeAt(P, hx + 10, hy + 6.5, sp.eye, 0.75, 5)
  s.rect(hx + 7, hy + 8, 3, 1, sp.eye, 0.5)
  // 侧面摄像孔
  s.disc(hx + hw - 2, hy + 5, 1.4, PAL.steelDark)
  s.px(hx + hw - 2, hy + 5, PAL.neonCold)
  // 天线（两根）
  s.line(hx + 1, hy, hx - 1, hy - 6, PAL.steelLight)
  s.px(hx - 1, hy - 6, PAL.neonCold, 0.95)
  eyeAt(P, hx - 1, hy - 6, PAL.neonCold, 0.45, 3)
  s.line(hx + hw - 3, hy, hx + hw - 1, hy - 4, PAL.steelDark)
  // 头底散热
  vent(s, hx + 4, hy + hh - 2, 7, 1, PAL.steelDark)

  drawLeg(0, false)

  // —— HOPPER 专属：单弹簧腿 + 侧稳定轮 ——
  if (sp.spring) {
    let px = cx
    let py = hipY + 1
    for (let i = 1; i <= 8; i++) {
      const off = i === 8 ? 0 : i % 2 ? 3.4 : -3.4
      const nx = cx + off
      const ny = hipY + 1 + (g - hipY - 2) * (i / 8)
      s.thick(px, py, nx, ny, 1.5, i % 2 ? t.lite : t.base)
      px = nx
      py = ny
    }
    s.rect(cx - 3, g - 1, 7, 2, PAL.steelDark)
    s.px(cx, g - 1, PAL.steelLight)
    // 侧稳定轮
    s.disc(cx + 9, g - 4, 4.4, PAL.steelDark)
    s.disc(cx + 9, g - 4, 2.8, PAL.rustDark)
    s.disc(cx + 9, g - 4, 1.1, PAL.steelLight)
    s.line(cx + 9, g - 4, cx + 11, g - 6, PAL.steel, 0.7)
    s.rect(cx + 5, g - 8, 3, 5, PAL.steel, 0.9)
  }

  // 手握点：轻量机体右侧小臂末端
  P.gunAt = [cx + 10, hipY - 9]
  if (P.tool) handTool(s, P.tool, cx + 9, hipY - 10, 1)
  return finish(s, sp, P)
}

/* ============================================================================
 * 11. 潜行侦察（ghost）—— 破布披挂 + 单眼 + 天线
 * ========================================================================== */

function ghost(sp, P) {
  const s = new Surf(sp.w, sp.h, sp.seed + 977 * (P.i || 0))
  P.g = P.g || []
  const t = T.ghost
  const g = sp.ground
  const cx = sp.cx
  const bob = P.bob | 0
  const phase = P.phase ?? 0
  const crouch = P.crouch ? 1 : 0
  const hipY = g - 20 + bob + crouch * 6
  const cloth = mix(PAL.dust, PAL.ash, 0.35)
  const clothLite = mix(PAL.dustLight, PAL.ashPale, 0.4)
  const clothDark = mix(PAL.dust, PAL.void, 0.55)

  s.shadow(cx, g - 0.5, 10, 1.8, 0.5)

  // 细腿（部分被布遮住）
  const drawLeg = (off, back) => {
    const ph = phase + off
    const dx = Math.sin(ph) * 4.4
    const lift = Math.max(0, Math.cos(ph - 1.1)) * 4
    const hipX = cx + (back ? -2 : 2)
    const footX = cx + dx + (back ? -2 : 2)
    const footY = g - 1 - lift
    const kneeX = hipX + dx * 0.4 + (back ? -1 : 1)
    const kneeY = (hipY + footY) / 2
    s.thick(hipX, hipY, kneeX, kneeY, 1.3, shade(t.dark, back ? -0.2 : 0))
    s.thick(kneeX, kneeY, footX, footY, 1.1, shade(t.base, back ? -0.3 : 0))
    s.rect(footX - 1, footY, 3, 1, PAL.oil)
  }
  drawLeg(Math.PI, true)

  // 躯干（瘦，被布覆盖）
  s.poly(
    [
      [cx - 6, hipY - 14],
      [cx + 6, hipY - 14],
      [cx + 4, hipY + 1],
      [cx - 4, hipY + 1],
    ],
    t.base,
  )

  // —— 破布披风：不规则多边形 + 撕裂边 ——
  const sway = Math.sin(phase) * 1.2
  const drape = [
    [cx - 9, hipY - 15],
    [cx + 7, hipY - 15],
    [cx + 9 + sway, hipY - 6],
    [cx + 11 + sway, hipY + 3],
    [cx + 6, hipY + 1],
    [cx + 4, hipY + 9],
    [cx + 1, hipY + 5],
    [cx - 2, hipY + 11],
    [cx - 5, hipY + 4],
    [cx - 8, hipY + 7],
    [cx - 10, hipY - 3],
  ]
  s.poly(drape, cloth)
  // 布褶
  for (let k = 0; k < 4; k++) {
    const x = cx - 6 + k * 4
    s.line(x, hipY - 13, x + (k < 2 ? -1 : 1), hipY + 2 + k, clothDark, 0.55)
  }
  // 高光褶皱
  s.line(cx - 6, hipY - 14, cx + 5, hipY - 14, clothLite, 0.6)
  s.line(cx - 7, hipY - 10, cx - 8, hipY - 1, clothLite, 0.35)
  // 撕裂缺口
  s.px(cx + 4, hipY - 3, PAL.void, 0.85)
  s.px(cx + 5, hipY - 2, PAL.void, 0.7)
  s.px(cx - 1, hipY + 6, PAL.void, 0.8)

  // 肩部机械件（布下露出）
  s.rect(cx + 5, hipY - 15, 4, 3, t.dark)
  s.px(cx + 7, hipY - 14, PAL.steelLight)
  piston(s, cx - 5, hipY - 14, cx - 3, hipY - 5, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark })

  // 手臂（布下，细长）
  const ax = cx + 7
  const ay = hipY - 13
  s.thick(ax, ay, ax + 4, ay + 6, 1.5, clothDark)
  s.thick(ax + 4, ay + 6, ax + 2, ay + 11, 1.2, PAL.steelDark)
  s.rect(ax + 1, ay + 11, 3, 2, PAL.steel)

  // 兜帽 + 头
  const hh = 9
  const hx = cx - 5
  const hy = hipY - 15 - hh + 1
  s.poly(
    [
      [hx, hy + 4],
      [hx + 2, hy],
      [hx + 8, hy - 1],
      [hx + 11, hy + 3],
      [hx + 10, hy + hh],
      [hx + 1, hy + hh],
    ],
    clothDark,
  )
  s.poly(
    [
      [hx + 2, hy + 3],
      [hx + 4, hy + 1],
      [hx + 9, hy + 1],
      [hx + 10, hy + 4],
      [hx + 9, hy + hh - 1],
      [hx + 2, hy + hh - 1],
    ],
    cloth,
  )
  // 面部（阴影中的暗面）
  s.rect(hx + 3, hy + 3, 7, 5, PAL.black)
  // 单眼（青色）
  s.rect(hx + 4, hy + 4, 5, 1, sp.eye, 0.9)
  eyeAt(P, hx + 6, hy + 4, sp.eye, 1.0, 7)
  eyeCore(s, hx + 6, hy + 4, sp.eye, 1)
  // 兜帽高光
  s.line(hx + 3, hy + 1, hx + 8, hy + 1, clothLite, 0.7)
  // 天线（穿过兜帽）
  s.line(hx + 8, hy + 1, hx + 10, hy - 6, PAL.steelLight)
  s.px(hx + 10, hy - 6, PAL.neonRed, 0.95)
  eyeAt(P, hx + 10, hy - 6, PAL.neonRed, 0.5, 3)
  // 呼吸管
  s.thick(hx + 2, hy + hh - 1, hx + 1, hy + hh + 4, 0.9, PAL.steelDark)
  s.px(hx + 1, hy + hh + 4, PAL.rust)

  drawLeg(0, false)

  // 脚下布条（飘）
  s.line(cx - 4, hipY + 8, cx - 6 + sway, g - 3, clothDark, 0.7)
  s.line(cx + 4, hipY + 8, cx + 6 + sway, g - 5, clothDark, 0.6)
  // 手握点：潜行机体布条下的手
  P.gunAt = [ax + 3, ay + 13]
  if (P.tool) handTool(s, P.tool, ax + 2, ay + 12, 1)
  return finish(s, sp, P)
}

/* ============================================================================
 * 12. 收尾管线
 * ========================================================================== */

function finish(s, sp, P) {
  const id = sp.pal || rigId(sp.rig)
  const tn = T[id]
  // 手持枪械 / 枪口火焰（shoot / hold 帧）
  if (P.gun) heldGun(s, sp, P)
  // 游泳：水线与气泡（全部不透明像素）
  if (P.anim === 'swim') {
    const cx = sp.cx
    for (let k = 0; k < 5; k++) {
      s.px(cx - 12 + k * 6, sp.ground - 6 - (k % 2) * 2, PAL.glass, 1)
      s.px(cx - 11 + k * 6, sp.ground - 5 - (k % 2) * 2, PAL.waterHi || PAL.glass, 1)
    }
    for (let k = 0; k < 4; k++) s.px(cx - 14 + k * 7, sp.ground - 12 - k * 2, PAL.glass, 1)
    s.line(cx + 10, sp.ground - 4, cx + 16, sp.ground - 8, PAL.glass, 1)
  }
  // 攀爬：手掌抓握的摩擦痕
  if (P.anim === 'climb') {
    for (let k = 0; k < 4; k++) s.px(sp.cx + 4 + k * 2, sp.shoulderY - 6 - (k % 2) * 2, PAL.steelWhite, 1)
  }
  // 挥击：弧形残影（抖动的不透明亮像素）
  if (P.swing) {
    const cx = sp.cx
    const cy = sp.ground - 24
    for (let a = -0.9; a <= 0.7; a += 0.12) {
      const x = cx + 12 + Math.cos(a) * 13
      const y = cy + Math.sin(a) * 13
      if ((Math.round(a * 10) & 1) === 0) s.px(x, y, PAL.steelWhite, 1)
      else s.px(x, y, PAL.sand, 1)
    }
  }
  weather(s, sp.seed + 131 * ((P.i || 0) + 1) + (P.hurt ? 7 : 0), {
    rust: sp.rig === 'heavy' || sp.rig === 'ghost' ? 30 : 22,
  })
  // 三层关系：上缘受光、下缘压暗
  s.edges(tn.lite, PAL.void, 0.5, 0.45)
  s.outline(outlineCol(id))
  // 受伤：整体红闪 + 火花
  if (P.hurt) {
    s.tint(PAL.neonRed, 0.26, true)
    const rnd = mulberry32(sp.seed + 9999)
    sparks(s, sp.cx + 4, 16, 12, rnd)
    sparks(s, sp.cx - 6, 26, 8, rnd)
  }
  if (P.dead) {
    s.tint(PAL.void, P.deadDim || 0.45, true)
    const rnd = mulberry32(sp.seed + 4242)
    for (let k = 0; k < 14; k++) {
      const x = sp.cx - 12 + rnd() * 26
      const y = sp.ground - 6 - rnd() * 14
      s.px(x, y, rnd() < 0.5 ? PAL.ashPale : PAL.dust, 1)
    }
  }
  // 自发光最后叠加（只做不透明加色，不再产生半透明）
  for (const gl of P.g) s.glow(gl.x, gl.y, gl.r, gl.c, gl.p)
  if (P.hurt) s.glow(sp.cx + 2, 20, 12, PAL.neonRed, 0.3)
  return s.tex()
}
/** 手持枪械（shoot / hold 帧）：枪身 + 枪管 + 可选枪口火焰。 */
function heldGun(s, sp, P) {
  const pos = P.gunAt || [sp.cx + 8, sp.ground - 22]
  const hx = Math.round(pos[0])
  const hy = Math.round(pos[1])
  // 握把 + 枪身
  s.rect(hx - 3, hy + 1, 3, 3, PAL.steelDark)
  s.px(hx - 2, hy + 2, PAL.oil)
  s.rect(hx - 2, hy - 1, 7, 3, PAL.steelDark)
  s.rect(hx - 1, hy, 6, 1, PAL.steel)
  // 枪管（朝右）
  s.rect(hx + 4, hy, 4, 2, PAL.steelLight)
  s.rect(hx + 7, hy, 2, 2, PAL.steelWhite)
  // 瞄准具 / 弹匣
  s.px(hx + 1, hy - 2, PAL.steelLight)
  s.rect(hx - 1, hy + 2, 2, 3, PAL.steelDark)
  // 能量指示灯
  s.px(hx + 2, hy + 2, PAL.neonWarm)
  if (P.flash) {
    // 枪口火焰：2px 亮核 + 3 条火花（全不透明）
    s.disc(hx + 9, hy + 1, 2.2, PAL.neonWarm, 1)
    s.disc(hx + 9, hy + 1, 1.2, PAL.white, 1)
    s.px(hx + 12, hy + 1, PAL.neonWarm, 1)
    s.px(hx + 11, hy - 1, PAL.neonWarm, 1)
    s.px(hx + 11, hy + 3, PAL.neonWarm, 1)
    s.px(hx + 13, hy - 2, PAL.rustHot, 1)
    P.g.push({ x: hx + 9, y: hy + 1, r: 7, c: PAL.neonWarm, p: 1 })
  }
}


/* ============================================================================
 * 13. 逐机体动画表
 * ========================================================================== */

/* ============================================================================
 * 13. 逐机体动画表
 * ----------------------------------------------------------------------------
 * 帧契约（每台机体 14 组动画）：
 *   idle[4] run[8] jump[2] fall[2] land[2] crouch[2]
 *   climb[4] swim[4] dig[3] attack[3] shoot[2] hold[2] hurt[2] dead[3]
 * 每个 pose 只描述关节参数，具体形态由 rig(sp, P) 负责；
 * 相邻帧的 phase / bob / 肢体偏移都不同，保证每帧都有可见差异。
 * ========================================================================== */

const GI = (i, n) => (i / n) * TAU

/** 生成 14 组动画的 pose 列表。 */
function poseSet(rig, sp) {
  const wheeled = rig === 'wheel' || rig === 'hybrid'
  const heavy = rig === 'heavy'
  const quad = rig === 'quad'
  const out = {}

  // —— idle 4：呼吸 + 液压微动（头/肩/手各错开一帧）——
  out.idle = [
    { anim: 'idle', i: 0, bob: 0 },
    { anim: 'idle', i: 1, bob: -1, armF: { dx: 0, dy: -1 } },
    { anim: 'idle', i: 2, bob: 0, armF: { dx: 2, dy: 1 }, armB: { dx: -2, dy: -1 }, headDX: 1, lean: 1 },
    { anim: 'idle', i: 3, bob: -1, armF: { dx: 0, dy: 2 }, armB: { dx: 1, dy: 1 }, headDX: -1 },
  ]

  // —— run 8：完整步态（左右脚各一次触地/离地，身体两次起伏）——
  out.run = []
  for (let i = 0; i < 8; i++) {
    const ph = GI(i, 8)
    out.run.push({
      anim: 'run',
      i,
      phase: ph,
      bob: i % 2 ? -1 : 0,
      lean: heavy ? 0 : 1,
    })
  }

  // —— jump 2：蹬伸 / 收腿 ——
  out.jump = [
    { anim: 'jump', i: 0, bob: -2, legF: { dx: 3, lift: 3, kneeDX: 2 }, legB: { dx: -3, lift: 2, kneeDX: -2 }, armF: { dx: 2, dy: -4 } },
    { anim: 'jump', i: 1, bob: -4, legF: { dx: 5, lift: 7, kneeDX: 3 }, legB: { dx: -4, lift: 5, kneeDX: -2 }, armF: { dx: 4, dy: -7 }, armB: { dx: -5, dy: -5 } },
  ]

  // —— fall 2：下落 / 张开 ——
  out.fall = [
    { anim: 'fall', i: 0, bob: 0, legF: { dx: 4, lift: 1, kneeDX: 3 }, legB: { dx: -4, lift: 0, kneeDX: -3 }, armF: { dx: 5, dy: -1 } },
    { anim: 'fall', i: 1, bob: -1, legF: { dx: 6, lift: 0, kneeDX: 4 }, legB: { dx: -6, lift: 2, kneeDX: -3 }, armF: { dx: 7, dy: -3 }, armB: { dx: -6, dy: -2 } },
  ]

  // —— land 2：缓冲 / 起身 ——
  out.land = [
    { anim: 'land', i: 0, crouch: true, bob: 5, legF: { dx: 4, lift: 0, kneeDX: 4 }, legB: { dx: -4, lift: 0, kneeDX: -4 }, armF: { dx: 4, dy: 5 } },
    { anim: 'land', i: 1, crouch: true, bob: 3, legF: { dx: 5, lift: 0, kneeDX: 4 }, legB: { dx: -5, lift: 0, kneeDX: -4 }, armF: { dx: 2, dy: 3 } },
  ]

  // —— crouch 2 ——
  out.crouch = [
    { anim: 'crouch', i: 0, crouch: true, bob: 2 },
    { anim: 'crouch', i: 1, crouch: true, bob: 3, headDX: 1, armF: { dx: 1, dy: 2 } },
  ]

  // —— climb 4：交替抓握（手脚对侧）——
  out.climb = []
  for (let i = 0; i < 4; i++) {
    out.climb.push({
      anim: 'climb',
      i,
      lean: -2,
      phase: GI(i, 4),
      bob: i % 2 ? -1 : 0,
      armF: { dx: 3, dy: -9 + (i % 2) * 3 },
      armB: { dx: -2, dy: -6 + ((i + 1) % 2) * 3 },
      legF: { dx: 2, lift: 5 + (i % 2) * 3, kneeDX: 4 },
      legB: { dx: -3, lift: 2 + ((i + 1) % 2) * 4, kneeDX: -3 },
    })
  }

  // —— swim 4：划水（身体前倾、腿后摆）——
  out.swim = []
  for (let i = 0; i < 4; i++) {
    out.swim.push({
      anim: 'swim',
      i,
      lean: 3,
      phase: GI(i, 4),
      bob: i % 2 ? 1 : 0,
      legF: { dx: -4 - (i % 2) * 2, lift: 3, kneeDX: -3 },
      legB: { dx: -7 - ((i + 1) % 2) * 2, lift: 5, kneeDX: -4 },
      armF: { dx: 6, dy: -2 + (i % 2) * 2 },
      armB: { dx: 4, dy: -3 + ((i + 1) % 2) * 2 },
    })
  }

  // —— dig 3：抬起 → 下挖 → 带土 ——
  out.dig = [
    { anim: 'dig', i: 0, crouch: true, bob: 2, lean: 1, armF: { dx: -2, dy: -5 }, tool: 'shovel' },
    { anim: 'dig', i: 1, crouch: true, bob: 3, lean: 3, armF: { dx: 6, dy: 9 }, tool: 'shovel' },
    { anim: 'dig', i: 2, crouch: true, bob: 2, lean: 1, armF: { dx: 1, dy: 2 }, armB: { dx: -2, dy: 2 }, tool: 'shovel' },
  ]

  // —— attack 3：蓄力 → 挥击 → 收势 ——
  out.attack = [
    { anim: 'attack', i: 0, lean: -1, bob: 0, armF: { dx: -6, dy: -6 }, armB: { dx: 3, dy: -2 }, tool: 'pickaxe' },
    { anim: 'attack', i: 1, lean: 3, bob: 1, armF: { dx: 9, dy: 2 }, tool: 'pickaxe', swing: true },
    { anim: 'attack', i: 2, lean: 2, bob: 0, armF: { dx: 4, dy: 5 }, tool: 'pickaxe' },
  ]

  // —— shoot 2：抵肩 / 后坐（枪口火焰）——
  out.shoot = [
    { anim: 'shoot', i: 0, lean: 1, armF: { dx: 6, dy: -2 }, gun: true },
    { anim: 'shoot', i: 1, lean: -2, bob: -1, armF: { dx: 3, dy: -4 }, gun: true, flash: true },
  ]

  // —— hold 2：持枪待机 ——
  out.hold = [
    { anim: 'hold', i: 0, lean: 1, armF: { dx: 5, dy: -2 }, gun: true },
    { anim: 'hold', i: 1, lean: 1, bob: -1, armF: { dx: 5, dy: -1 }, gun: true },
  ]

  // —— hurt 2：受击（后仰 / 侧晃）——
  out.hurt = [
    { anim: 'hurt', i: 0, hurt: true, lean: -2, bob: -1, armF: { dx: -4, dy: -3 } },
    { anim: 'hurt', i: 1, hurt: true, lean: -4, bob: 1, headDX: -1, armF: { dx: -6, dy: -1 } },
  ]

  // —— dead 3：跪倒（由 rig 画）→ 侧塌 → 瘫平（deadPose 画）——
  out.dead = [
    { anim: 'dead', i: 0, dead: true, deadDim: 0.22, crouch: true, bob: 6, lean: -1, armF: { dx: -1, dy: 7 }, headDX: -1 },
    null,
    null,
  ]

  // 四足/轮式的细节差异：轮式没有腿，靠 phase 驱动轮子；四足用 gait
  if (wheeled || quad) {
    for (const k of ['climb', 'swim']) {
      out[k] = out[k].map((P) => ({ ...P, bob: P.bob ? 0 : -1 }))
    }
  }
  return out
}

/** 死亡帧：k=1 侧塌（半倒） / k=2 完全瘫平。k=0 用 rig 画的跪倒。 */
function deadPose(sp, k = 2) {
  const s = new Surf(sp.w, sp.h, sp.seed + 555 + k * 17, 'chassis')
  const id = sp.pal || rigId(sp.rig)
  const tn = T[id]
  const g = sp.ground
  const cx = sp.cx
  s.shadow(cx, g - 0.5, sp.w * 0.36, 2.2, 0.55)

  if (k === 1) {
    // —— 半倒：躯干倾斜、头垂到地、一只手撑地 ——
    const hip = [cx - 6, g - 8]
    const neck = [cx + 6, g - 22]
    // 躯干（斜放）
    s.poly(
      [
        [hip[0] - 5, hip[1] + 1],
        [hip[0] + 4, hip[1] + 2],
        [neck[0] + 3, neck[1] + 1],
        [neck[0] - 5, neck[1] - 1],
      ],
      tn.base,
    )
    s.line(hip[0] - 4, hip[1], neck[0] - 4, neck[1], tn.lite, 0.8)
    s.line(hip[0] + 3, hip[1] + 1, neck[0] + 2, neck[1] + 1, tn.dark)
    // 胸甲
    plate(s, hip[0] - 2, hip[1] - 6, 7, 5, { base: mix(tn.base, tn.lite, 0.3), lite: tn.lite, dark: tn.dark })
    // 头（垂在右下）
    const hx = neck[0] + 7
    const hy = g - 9
    chamfer(s, hx - 4, hy - 5, 10, 9, { base: tn.base, lite: tn.lite, dark: tn.dark }, 2)
    s.rect(hx - 1, hy - 2, 6, 2, PAL.black)
    s.px(hx + 1, hy - 2, sp.eye, 0.6)
    // 撑地的手臂
    s.thick(neck[0] + 2, neck[1] + 3, cx + 13, g - 4, 2.2, tn.dark)
    s.rect(cx + 12, g - 4, 3, 2, PAL.steelDark)
    // 断掉的另一只手臂
    s.thick(hip[0] - 4, hip[1] - 4, cx - 14, g - 3, 2, shade(tn.dark, -0.2))
    // 腿（一条跪着、一条摊开）
    s.thick(hip[0], hip[1], cx - 2, g - 2, 2.6, tn.base)
    s.thick(hip[0] - 1, hip[1], cx - 12, g - 2, 2.2, tn.dark)
    s.rect(cx - 14, g - 2, 4, 2, PAL.steelDark)
    // 断裂处 / 漏液 / 火花
    wire(s, [
      [hip[0] - 4, hip[1] - 2],
      [hip[0] - 8, hip[1] - 4],
      [hip[0] - 10, hip[1]],
    ])
    sparks(s, hip[0] - 5, hip[1] - 2, 7, mulberry32(sp.seed + 31), PAL.neonWarm)
    s.ell(cx - 3, g - 1, 8, 1.6, PAL.oil, 0.8)
  } else {
    // —— 完全瘫平：躯干横陈 + 一条腿翘起 + 头歪在地上 ——
    const bodyY = g - 9
    s.poly(
      [
        [cx - 14, bodyY + 3],
        [cx - 12, bodyY - 2],
        [cx + 10, bodyY - 3],
        [cx + 13, bodyY + 2],
        [cx + 11, bodyY + 7],
        [cx - 13, bodyY + 7],
      ],
      tn.base,
    )
    s.line(cx - 11, bodyY - 1, cx + 9, bodyY - 2, tn.lite)
    s.line(cx - 12, bodyY + 6, cx + 10, bodyY + 6, PAL.void, 0.5)
    // 头（歪向右下）
    const hx = cx + 12
    const hy = bodyY + 2
    chamfer(s, hx - 3, hy, 10, 8, { base: tn.base, lite: tn.lite, dark: tn.dark }, 2)
    s.rect(hx, hy + 3, 5, 2, PAL.black)
    s.px(hx + 2, hy + 3, sp.eye, 0.45)
    s.px(hx + 4, hy + 4, sp.eye, 0.3)
    // 断裂的手臂
    s.thick(cx - 12, bodyY + 1, cx - 18, bodyY + 5, 2, tn.dark)
    s.rect(cx - 20, bodyY + 5, 3, 2, PAL.steelDark)
    // 翘起的腿
    s.thick(cx + 2, bodyY + 6, cx + 5, bodyY + 1, 2, tn.dark)
    s.thick(cx + 5, bodyY + 1, cx + 8, bodyY + 4, 1.6, PAL.steelDark)
    // 断裂处的火花 / 线缆
    s.px(cx - 13, bodyY, PAL.void, 0.9)
    wire(s, [
      [cx - 13, bodyY],
      [cx - 16, bodyY + 1],
      [cx - 17, bodyY + 4],
    ])
    sparks(s, cx - 14, bodyY, 8, mulberry32(sp.seed + 3), PAL.neonWarm)
    // 漏油
    s.ell(cx - 4, g - 1, 7, 1.4, PAL.oil, 0.8)
    s.ell(cx - 2, g - 1, 3, 0.8, PAL.oilSheen, 0.6)
  }

  weather(s, sp.seed + 777 + k * 11, { rust: 30 })
  s.edges(tn.lite, PAL.void, 0.35, 0.5)
  s.outline(outlineCol(id))
  s.tint(PAL.void, k === 1 ? 0.28 : 0.35, true)
  // 余烬
  const rnd = mulberry32(sp.seed + 808 + k * 5)
  for (let i = 0; i < 10; i++) s.px(cx - 14 + rnd() * 26, g - 4 - rnd() * 10, PAL.neonWarm, 1)
  s.glow(cx - 4, g - 2, 7, PAL.neonWarm, 0.35)
  return s.tex()
}

const RIGS = {
  biped,
  wheel,
  hybrid,
  arm: armRig,
  quad,
  light,
  ghost,
  heavy: biped,
}

/* ============================================================================
 * 14. 64×64 半身像
 * ========================================================================== */

/** 头像底：单一背景色 + 暗角 + 扫描线 + UI 角标。 */
/** 立绘底：暗角 + 扫描线 + UI 角标（画在角色下层，因此不会被锈斑污染）。 */
function bustBackdrop(tn) {
  const s = new Surf(64, 64, 0x9001)
  s.rect(0, 0, 64, 64, mix(PAL.ash, tn.base, 0.1))
  // 抖动暗角（8 圈，越靠边越暗）
  for (let k = 0; k < 8; k++) {
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (Math.min(x, y, 63 - x, 63 - y) < k) s.px(x, y, PAL.void, 0.06)
      }
    }
  }
  // 角色身后的光晕（同色系、低 alpha）
  for (let k = 0; k < 5; k++) {
    const r = 9 + k * 5
    for (let y = 22 - r; y <= 22 + r; y++) {
      for (let x = 32 - r; x <= 32 + r; x++) {
        const d = Math.hypot(x - 32, y - 22)
        if (d <= r && d > r - 1.2) s.px(x, y, mix(tn.lite, PAL.ash, 0.55), 0.13)
      }
    }
  }
  // 扫描线（很淡）
  for (let y = 1; y < 64; y += 3) s.rect(0, y, 64, 1, PAL.void, 0.1)
  // 四角 UI 角标
  const c = mix(PAL.ashPale, tn.lite, 0.42)
  s.line(2, 5, 9, 5, c, 0.85)
  s.line(2, 5, 2, 12, c, 0.85)
  s.line(61, 5, 54, 5, c, 0.85)
  s.line(61, 5, 61, 12, c, 0.85)
  s.rect(2, 60, 4, 1, tn.lite, 0.5)
  s.rect(58, 60, 4, 1, tn.lite, 0.5)
  return s
}

/** 通用胸肩：梯形躯干 + 领口 + 装甲分片（detail=0 只画素体）。 */
function bustChest(s, tn, o = {}) {
  const cx = 32
  const w = o.w ?? 44
  const top = o.top ?? 44
  s.poly(
    [
      [cx - w / 2, 64],
      [cx - w / 2 + 3, top],
      [cx - 11, top - 4],
      [cx + 11, top - 4],
      [cx + w / 2 - 3, top],
      [cx + w / 2, 64],
    ],
    tn.base,
  )
  // 左右轮廓：左受光、右背光
  s.line(cx - w / 2 + 2, top + 2, cx - w / 2 + 1, 63, tn.dark)
  s.line(cx + w / 2 - 2, top + 2, cx + w / 2 - 1, 63, tn.dark)
  s.line(cx - 10, top - 3, cx - w / 2 + 3, top + 1, tn.lite, 0.85)
  s.line(cx + 10, top - 3, cx + w / 2 - 3, top + 1, tn.lite, 0.5)
  // 领口
  s.rect(cx - 12, top - 1, 24, 2, PAL.steelDark)
  s.rect(cx - 11, top - 2, 22, 1, PAL.steel, 0.9)
  // 胸甲分片
  if (o.plates !== false) {
    s.line(cx - 13, top + 5, cx + 13, top + 5, tn.dark, 0.85)
    s.line(cx - 16, top + 11, cx + 16, top + 11, tn.dark, 0.6)
    vent(s, cx - 18, top + 8, 6, 2, tn.dark)
    vent(s, cx + 13, top + 8, 6, 2, tn.dark)
    bolt(s, cx - 15, top + 3, tn.lite)
    bolt(s, cx + 14, top + 3, tn.lite)
  }
  return top
}

/** 颈部（所有机体共用）：机械颈椎 + 液压。 */
function bustNeck(s, top, tone) {
  s.rect(25, top - 12, 14, 9, PAL.steelDark)
  s.rect(26, top - 11, 12, 7, tone || PAL.steel)
  s.rect(27, top - 11, 5, 2, PAL.steelLight)
  s.line(28, top - 8, 36, top - 8, PAL.steelDark)
  s.rect(22, top - 6, 3, 5, PAL.steelDark)
  s.rect(39, top - 6, 3, 5, PAL.steelDark)
}

/** unit7：窄长头 + 青色横条眼 + 天线。 */
function bustUnit7(s, tn, sp, P) {
  const cx = 32
  const top = bustChest(s, tn, { w: 44, top: 46 })
  bustNeck(s, top, PAL.steel)
  // 头壳（窄、略朝右）
  const hx = 23
  const hy = 12
  chamfer(s, hx, hy, 19, 21, { base: tn.base, lite: tn.lite, dark: tn.dark }, 3)
  // 面罩深槽
  s.poly(
    [
      [hx + 3, hy + 8],
      [hx + 18, hy + 7],
      [hx + 18, hy + 14],
      [hx + 3, hy + 14],
    ],
    PAL.black,
  )
  s.rect(hx + 5, hy + 9, 12, 2, sp.eye)
  eyeCore(s, hx + 9, hy + 9, sp.eye, 2)
  eyeAt(P, hx + 11, hy + 10, sp.eye, 1, 13)
  // 眉甲 / 下颌
  s.line(hx + 2, hy + 6, hx + 17, hy + 5, tn.lite, 0.8)
  s.rect(hx + 4, hy + 16, 12, 2, PAL.steelDark)
  vent(s, hx + 5, hy + 16, 8, 2, PAL.steelBlue)
  // 侧面耳罩 + 天线
  s.rect(hx - 2, hy + 6, 3, 9, PAL.steelDark)
  s.px(hx - 1, hy + 8, PAL.neonWarm)
  s.line(hx + 3, hy, hx - 1, hy - 9, PAL.steelLight)
  s.px(hx - 1, hy - 9, PAL.neonWarm)
  eyeAt(P, hx - 1, hy - 9, PAL.neonWarm, 0.5, 4)
  // 胸口核心 + 编号
  s.rect(cx - 2, top + 1, 5, 4, PAL.steelDark)
  s.rect(cx, top + 2, 2, 2, sp.eye2)
  eyeAt(P, cx + 1, top + 3, sp.eye2, 0.5, 5)
  s.rect(cx - 20, 54, 1, 4, PAL.white, 0.55)
  s.rect(cx - 18, 54, 4, 1, PAL.white, 0.45)
  s.rect(cx - 18, 57, 4, 1, PAL.white, 0.4)
}

/** tesla：白色长条头 + 双琥珀眼。 */
function bustTesla(s, tn, sp, P) {
  const cx = 32
  const top = bustChest(s, tn, { w: 48, top: 46 })
  bustNeck(s, top, PAL.steelLight)
  const hx = 20
  const hy = 9
  chamfer(s, hx, hy, 25, 23, { base: tn.base, lite: tn.lite, dark: tn.dark }, 4)
  // 长条面罩
  s.poly(
    [
      [hx + 2, hy + 9],
      [hx + 23, hy + 8],
      [hx + 23, hy + 16],
      [hx + 2, hy + 16],
    ],
    PAL.black,
  )
  s.rect(hx + 4, hy + 11, 6, 3, sp.eye)
  s.rect(hx + 13, hy + 11, 6, 3, sp.eye)
  eyeAt(P, hx + 6, hy + 12, sp.eye, 1, 12)
  eyeAt(P, hx + 16, hy + 12, sp.eye, 1, 12)
  s.rect(hx + 5, hy + 15, 15, 1, PAL.steelDark)
  // 侧传感器
  s.rect(hx - 3, hy + 7, 3, 10, PAL.steelDark)
  s.px(hx - 2, hy + 9, PAL.neonRed)
  s.rect(hx + 25, hy + 7, 3, 10, PAL.steelDark)
  s.px(hx + 26, hy + 9, PAL.neonRed)
  // 头顶天线 + 散热
  s.line(hx + 6, hy, hx + 4, hy - 7, PAL.steelLight)
  s.px(hx + 4, hy - 7, PAL.neonRed)
  s.rect(hx + 10, hy - 1, 9, 1, PAL.steelLight, 0.8)
  // 胸口核心（Optimus 式）
  s.rect(cx - 4, top + 1, 9, 7, PAL.steelDark)
  s.rect(cx - 2, top + 3, 5, 3, sp.eye)
  eyeAt(P, cx + 1, top + 4, sp.eye, 0.8, 7)
}

/** agibot：宽厚头 + 双青眼 + 搬运背带。 */
function bustAgibot(s, tn, sp, P) {
  const cx = 32
  const top = bustChest(s, tn, { w: 52, top: 46 })
  bustNeck(s, top, PAL.steel)
  // 背带（工装）
  s.line(cx - 22, 64, cx - 8, top + 2, PAL.steelDark)
  s.line(cx + 22, 64, cx + 8, top + 2, PAL.steelDark)
  s.line(cx - 21, 64, cx - 7, top + 2, PAL.rust, 0.7)
  s.line(cx + 21, 64, cx + 7, top + 2, PAL.rust, 0.7)
  // 头部
  const hx = 18
  const hy = 12
  chamfer(s, hx, hy, 28, 20, { base: tn.base, lite: tn.lite, dark: tn.dark }, 3)
  s.rect(hx + 4, hy + 6, 20, 8, PAL.black)
  s.rect(hx + 6, hy + 8, 6, 3, sp.eye)
  s.rect(hx + 16, hy + 8, 6, 3, sp.eye)
  eyeAt(P, hx + 8, hy + 9, sp.eye, 0.9, 11)
  eyeAt(P, hx + 18, hy + 9, sp.eye, 0.9, 11)
  s.rect(hx + 8, hy + 12, 12, 1, PAL.steelDark)
  // 侧警示灯 + 天线
  s.rect(hx - 2, hy + 4, 3, 6, PAL.steelDark)
  s.px(hx - 1, hy + 5, PAL.neonWarm)
  s.line(hx + 12, hy, hx + 14, hy - 6, PAL.steelLight)
  s.px(hx + 14, hy - 6, PAL.neonRed)
  eyeAt(P, hx + 14, hy - 6, PAL.neonRed, 0.45, 4)
  // 胸口货架锁扣
  s.rect(cx - 9, top + 1, 18, 4, PAL.steelDark)
  s.rect(cx - 7, top + 2, 5, 2, PAL.steelLight)
  s.rect(cx + 2, top + 2, 5, 2, PAL.steel)
  eyeAt(P, cx, top + 2, PAL.neon, 0.35, 6)
}

/** atlas：小头 + 琥珀单眼 + 右侧巨臂。 */
function bustAtlas(s, tn, sp, P) {
  const cx = 32
  const top = bustChest(s, tn, { w: 50, top: 46 })
  bustNeck(s, top, PAL.steel)
  // 右肩巨型液压臂（进画）
  s.thick(58, 64, 46, 44, 6, PAL.steelDark)
  s.thick(58, 64, 46, 44, 4, PAL.steel)
  s.disc(46, 44, 5, PAL.steelDark)
  s.disc(46, 44, 3, PAL.steelLight)
  piston(s, 50, 60, 44, 48, { base: PAL.steelLight, lite: PAL.steelWhite, dark: PAL.steelDark })
  // 头
  const hx = 23
  const hy = 15
  chamfer(s, hx, hy, 20, 18, { base: tn.base, lite: tn.lite, dark: tn.dark }, 3)
  s.rect(hx + 3, hy + 6, 15, 6, PAL.black)
  s.disc(hx + 9, hy + 8, 2.2, sp.eye)
  eyeAt(P, hx + 9, hy + 8, sp.eye, 1, 12)
  s.rect(hx + 4, hy + 13, 12, 2, PAL.steelDark)
  vent(s, hx + 5, hy + 13, 8, 1, PAL.steelBlue)
  // 头侧液压 + 警示灯
  s.rect(hx - 3, hy + 4, 3, 7, PAL.steelDark)
  s.px(hx - 2, hy + 5, PAL.neonRed)
  s.line(hx + 4, hy, hx + 1, hy - 6, PAL.steelLight)
  // 胸口反应堆
  s.disc(cx, top + 4, 4, PAL.steelDark)
  s.disc(cx, top + 4, 2.4, sp.eye2)
  eyeAt(P, cx, top + 4, sp.eye2, 0.85, 9)
}

/** spider：Go2 式犬形侧脸 + 传感器阵列。 */
function bustSpider(s, tn, sp, P) {
  // 肩部（前躯）
  s.poly(
    [
      [10, 64],
      [14, 46],
      [26, 38],
      [40, 38],
      [52, 48],
      [54, 64],
    ],
    tn.base,
  )
  s.line(15, 48, 25, 40, tn.lite, 0.7)
  s.line(38, 39, 50, 47, tn.dark, 0.8)
  // 颈部线缆
  wire(s, [
    [24, 40],
    [22, 34],
    [26, 30],
  ])
  // 头（犬形，吻部朝右）
  const hx = 14
  const hy = 18
  s.poly(
    [
      [hx, hy + 6],
      [hx + 6, hy],
      [hx + 26, hy + 2],
      [hx + 34, hy + 8],
      [hx + 30, hy + 15],
      [hx + 8, hy + 18],
      [hx + 1, hy + 13],
    ],
    tn.base,
  )
  s.line(hx + 6, hy + 2, hx + 26, hy + 3, tn.lite, 0.85)
  s.line(hx + 1, hy + 12, hx + 8, hy + 17, tn.dark, 0.8)
  // 面部黑屏（传感器）
  s.poly(
    [
      [hx + 8, hy + 5],
      [hx + 27, hy + 6],
      [hx + 30, hy + 10],
      [hx + 25, hy + 13],
      [hx + 9, hy + 12],
    ],
    PAL.black,
  )
  s.rect(hx + 10, hy + 7, 6, 3, sp.eye)
  s.rect(hx + 20, hy + 7, 8, 3, sp.eye)
  eyeAt(P, hx + 12, hy + 8, sp.eye, 0.85, 10)
  eyeAt(P, hx + 24, hy + 8, sp.eye, 0.85, 11)
  // 头顶 lidar
  s.rect(hx + 14, hy - 4, 8, 4, PAL.steelDark)
  s.rect(hx + 16, hy - 3, 4, 2, PAL.steel)
  s.px(hx + 18, hy - 5, sp.eye2)
  eyeAt(P, hx + 18, hy - 5, sp.eye2, 0.55, 5)
  // 耳 / 破损
  s.line(hx + 8, hy, hx + 5, hy - 6, PAL.steelLight)
  s.px(hx + 5, hy - 6, PAL.neonRed)
  s.rect(hx + 26, hy + 12, 5, 2, PAL.void, 0.7)
}

/** mule：圆头面屏 + 双青眼 + 邮包背带。 */
function bustMule(s, tn, sp, P) {
  const cx = 32
  const top = bustChest(s, tn, { w: 40, top: 48 })
  bustNeck(s, top, PAL.steel)
  // 邮包背带
  s.line(cx - 20, 64, cx - 6, top + 1, PAL.rustDark)
  s.line(cx - 19, 64, cx - 5, top + 1, PAL.dust, 0.8)
  s.rect(cx - 19, 56, 5, 4, PAL.rustLight)
  s.rect(cx - 18, 57, 3, 1, PAL.rustDark)
  // 大头（信使特征）
  const hx = 15
  const hy = 10
  chamfer(s, hx, hy, 34, 25, { base: tn.base, lite: tn.lite, dark: tn.dark }, 5)
  s.rect(hx + 4, hy + 5, 26, 15, PAL.black)
  s.rect(hx + 5, hy + 6, 24, 13, PAL.ash, 0.45)
  // 双圆眼 + 嘴部光条
  s.rect(hx + 8, hy + 10, 7, 4, sp.eye)
  s.rect(hx + 20, hy + 10, 7, 4, sp.eye)
  eyeAt(P, hx + 11, hy + 12, sp.eye, 0.95, 11)
  eyeAt(P, hx + 23, hy + 12, sp.eye, 0.95, 11)
  s.rect(hx + 13, hy + 16, 8, 1, sp.eye, 0.6)
  // 侧摄像 + 天线
  s.disc(hx + 31, hy + 8, 2, PAL.steelDark)
  s.px(hx + 31, hy + 8, PAL.neonCold)
  s.line(hx + 4, hy, hx - 1, hy - 8, PAL.steelLight)
  s.px(hx - 1, hy - 8, PAL.neonCold)
  eyeAt(P, hx - 1, hy - 8, PAL.neonCold, 0.5, 4)
  // 胸口小灯
  s.rect(cx - 2, top + 2, 4, 3, PAL.steelDark)
  s.rect(cx - 1, top + 3, 2, 1, sp.eye)
  eyeAt(P, cx, top + 3, sp.eye, 0.4, 4)
}

/** ghost：兜帽 + 单青眼 + 破布。 */
function bustGhost(s, tn, sp, P) {
  const cloth = mix(PAL.dust, PAL.ash, 0.32)
  const clothDark = mix(PAL.dust, PAL.void, 0.55)
  const clothLite = mix(PAL.dustLight, PAL.ashPale, 0.42)
  // 布披肩（覆盖整个胸肩）
  s.poly(
    [
      [6, 64],
      [9, 46],
      [16, 30],
      [24, 22],
      [40, 22],
      [50, 31],
      [57, 48],
      [58, 64],
    ],
    cloth,
  )
  // 布褶与阴影
  for (let k = 0; k < 5; k++) {
    const x = 12 + k * 9
    s.line(x, 40, x + (k % 2 ? 2 : -2), 63, clothDark, 0.6)
  }
  s.line(18, 30, 26, 24, clothLite, 0.75)
  s.line(48, 33, 54, 50, clothLite, 0.35)
  // 兜帽
  s.poly(
    [
      [17, 46],
      [19, 30],
      [26, 18],
      [38, 17],
      [46, 25],
      [49, 40],
      [45, 47],
      [22, 48],
    ],
    clothDark,
  )
  s.poly(
    [
      [21, 44],
      [23, 31],
      [28, 22],
      [37, 21],
      [43, 28],
      [45, 40],
      [42, 45],
      [24, 46],
    ],
    cloth,
  )
  // 帽内阴影（脸）
  s.poly(
    [
      [25, 42],
      [27, 31],
      [31, 26],
      [38, 26],
      [41, 32],
      [41, 41],
      [33, 44],
    ],
    PAL.black,
  )
  // 单眼
  s.rect(29, 32, 11, 2, sp.eye)
  eyeCore(s, 33, 32, sp.eye, 2)
  eyeAt(P, 34, 32, sp.eye, 1.05, 15)
  // 布边高光 / 撕裂
  s.line(22, 45, 26, 21, clothLite, 0.55)
  s.px(50, 52, PAL.void, 0.8)
  s.px(46, 58, PAL.void, 0.7)
  s.px(11, 55, PAL.void, 0.6)
  // 天线
  s.line(14, 40, 12, 24, PAL.steelDark)
  s.line(12, 24, 8, 12, PAL.steelLight)
  s.px(8, 12, PAL.neonRed)
  eyeAt(P, 8, 12, PAL.neonRed, 0.45, 4)
  // 肩上的机械部件（布下露出）
  s.rect(45, 44, 6, 6, PAL.steelDark)
  s.px(48, 46, PAL.steelLight)
}

/** hulk：小头红眼 + 巨型肩甲。 */
function bustHulk(s, tn, sp, P) {
  const cx = 32
  const top = bustChest(s, tn, { w: 60, top: 46 })
  // 双肩巨型装甲
  chamfer(s, 0, 40, 20, 24, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark }, 4)
  chamfer(s, 44, 40, 20, 24, { base: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark }, 4)
  s.rect(3, 45, 13, 2, PAL.rust)
  s.rect(48, 45, 13, 2, PAL.rust)
  bolt(s, 4, 52)
  bolt(s, 50, 52)
  bolt(s, 4, 58)
  bolt(s, 50, 58)
  s.line(2, 42, 18, 42, PAL.steelWhite, 0.45)
  s.line(46, 42, 62, 42, PAL.steelWhite, 0.45)
  bustNeck(s, top, PAL.steel)
  // 小头 + 红色横条眼
  const hx = 21
  const hy = 18
  chamfer(s, hx, hy, 22, 17, { base: tn.base, lite: tn.lite, dark: tn.dark }, 3)
  s.rect(hx + 3, hy + 5, 17, 4, PAL.black)
  s.rect(hx + 5, hy + 6, 13, 2, sp.eye)
  eyeAt(P, hx + 11, hy + 7, sp.eye, 1.05, 13)
  // 面甲 / 格栅
  s.rect(hx + 4, hy + 11, 15, 3, PAL.steelDark)
  vent(s, hx + 6, hy + 12, 10, 1, PAL.steelBlue)
  s.line(hx + 2, hy + 3, hx + 19, hy + 3, tn.lite, 0.6)
  // 头侧破损露线
  s.rect(hx + 16, hy + 2, 4, 4, PAL.void)
  wire(s, [
    [hx + 18, hy + 3],
    [hx + 20, hy + 1],
    [hx + 21, hy - 3],
  ])
  s.rect(hx - 2, hy + 6, 2, 4, PAL.neonRed)
  eyeAt(P, hx - 1, hy + 8, PAL.neonRed, 0.5, 4)
  // 胸口核心
  s.disc(cx, top + 4, 3.4, PAL.steelDark)
  s.disc(cx, top + 4, 2, sp.eye2)
  eyeAt(P, cx, top + 4, sp.eye2, 0.8, 9)
}

const BUSTS = {
  unit7: bustUnit7,
  tesla: bustTesla,
  agibot: bustAgibot,
  atlas: bustAtlas,
  spider: bustSpider,
  mule: bustMule,
  ghost: bustGhost,
  hulk: bustHulk,
  // 复用半身像构图，靠独立配色区分
  warden: bustHulk,
  hopper: bustMule,
}

/** 64×64 半身像：角色层（锈蚀/描边）→ 合成到背景层 → 发光。 */
function portraitFor(sp) {
  const id = sp.pal || rigId(sp.rig)
  const tn = T[id]
  const body = new Surf(64, 64, sp.seed + 33)
  const P = { g: [] }
  BUSTS[id](body, tn, sp, P)
  weather(body, sp.seed + 21, { rust: 22, scratch: 5, dirt: false })
  body.edges(tn.lite, PAL.void, 0.4, 0.35)
  body.outline(outlineCol(id))
  const s = bustBackdrop(tn)
  s.stamp(body)
  for (const gl of P.g) s.glow(gl.x, gl.y, gl.r, gl.c, gl.p)
  return s.tex()
}

/* ============================================================================
 * 15. 公开 API
 * ========================================================================== */

export const CHASSIS_ART_IDS = ['unit7', 'tesla', 'agibot', 'atlas', 'spider', 'mule', 'ghost', 'hulk', 'warden', 'hopper']

const CACHE = new Map()

function build(id) {
  const sp = SPECS[id]
  const poses = poseSet(sp.rig, sp)
  const rig = RIGS[sp.rig]
  // 每帧把手握点写进贴图元数据，Robot 据此把武器/道具放到位
  const arr = (list) =>
    list.map((P) => {
      const tex = rig(sp, P)
      if (tex && Array.isArray(P.gunAt)) tex.userData.hand = [P.gunAt[0], P.gunAt[1]]
      return tex
    })
  const frames = {
    idle: arr(poses.idle),
    run: arr(poses.run),
    jump: arr(poses.jump),
    fall: arr(poses.fall),
    land: arr(poses.land),
    crouch: arr(poses.crouch),
    climb: arr(poses.climb),
    swim: arr(poses.swim),
    dig: arr(poses.dig),
    attack: arr(poses.attack),
    shoot: arr(poses.shoot),
    hold: arr(poses.hold),
    hurt: arr(poses.hurt),
    // 死亡三段：跪倒（rig 画）→ 侧塌 → 瘫平（deadPose 画）
    dead: [rig(sp, poses.dead[0]), deadPose(sp, 1), deadPose(sp, 2)],
  }
  return {
    w: sp.w,
    h: sp.h,
    artId: id,
    anchor: 'bottom-center',
    frames,
    portrait: portraitFor(sp),
  }
}

/**
 * 取机体美术。未知 id 回退到 unit7 的形状但换配色不可行（尺寸是契约），
 * 因此未知 id 直接退回 unit7 —— 引擎永远不会拿到空对象。
 */
// （返回的 texture.userData.cleanAlpha = true；alpha 仅 0/255，无半透明脏边）
export function getChassisArt(id) {
  const key = SPECS[id] ? id : 'unit7'
  let art = CACHE.get(key)
  if (!art) {
    art = build(key)
    CACHE.set(key, art)
  }
  return art
}

/** 一次性构建全部机体（标题界面 / 预载用）。 */
export function preloadArt() {
  for (const id of CHASSIS_ART_IDS) getChassisArt(id)
  return CACHE.size
}

/** 调试：丢弃缓存（改配色后热重载用）。 */
export function clearChassisCache() {
  CACHE.clear()
}



