// ============================================================================
// 锈雨 · RUSTFALL —— 大型敌人美术（LARGE MONSTER）
// ----------------------------------------------------------------------------
// 契约（由 monsters.js 再导出，引擎从 monsters.js 取即可）：
//   export function getLargeMonsterArt(id) -> {
//     w, h, anchor:'bottom-center',
//     frames: { idle:[2], move:[3], attack:[2], hurt, dead:[2] },
//   }
//
// 4 种：
//   junk_golem  160×180  废铁魔像（废车/引擎堆成，发光关节是弱点）
//   sky_warden  180×120  天空守望者（浮空太阳能板 + 暴露的核眼）
//   mimic_beast 140×100  拟态兽（伪装成垃圾堆，发光口腔）
//   swarm_core  150×110  虫巢核心（囊体 + 虫群孔洞 + 外露核心）
//
// 共同规范：脚/投影落在最后一行；朝右；每个攻击帧能读出击打/开火动作；
// 弱点用高饱和霓虹（青/琥珀/红）且是**不透明**亮像素；alpha 只 0/255。
// ============================================================================

import { PAL } from '../palette.js'
import { Surf, mix, shade, mulberry32 } from './core.js'
import { THEME_BOSS_LARGE_DEFS } from './theme-boss-art.js'

const TAU = Math.PI * 2

/* ============================================================================
 * 通用小件
 * ========================================================================== */

/** 废铁板：锈色带高光/暗边的斜切矩形。 */
function scrapPlate(s, x, y, w, h, base, seed) {
  const dark = shade(base, -0.4)
  const lite = shade(base, 0.35)
  s.poly(
    [
      [x + 2, y],
      [x + w - 1, y],
      [x + w - 1, y + h - 2],
      [x + w - 3, y + h - 1],
      [x, y + h - 1],
      [x, y + 2],
    ],
    base,
  )
  s.line(x + 2, y + 1, x + w - 2, y + 1, lite)
  s.line(x + 1, y + 2, x + 1, y + h - 2, lite, 0.7)
  s.line(x + 2, y + h - 1, x + w - 2, y + h - 1, dark)
  const rnd = mulberry32(seed >>> 0)
  for (let k = 0; k < Math.floor(w / 4); k++) {
    s.px(x + 1 + rnd() * (w - 2), y + 1 + rnd() * (h - 2), PAL.rustDark, 0.85)
  }
  for (let k = 0; k < 3; k++) s.px(x + 2 + k * 4, y + 2, PAL.steelLight, 0.9)
}

/** 发光弱点（不透明亮核 + 抖动的 1px 外圈）。 */
function weakPoint(s, P, x, y, r, color) {
  s.disc(x, y, r, PAL.void)
  s.disc(x, y, r - 1, color)
  s.disc(x, y, Math.max(1, r - 3), PAL.white)
  P.g.push({ x, y, r: r * 2.2, c: color, p: 1 })
}

/** 断裂的管线 / 电缆。 */
function tornCable(s, x, y, len, seed) {
  const rnd = mulberry32(seed >>> 0)
  let px = x
  let py = y
  for (let k = 0; k < len; k++) {
    px += rnd() < 0.5 ? 1 : -1
    py += 1
    s.px(px, py, PAL.oilSheen)
    s.px(px + 1, py, PAL.oil)
  }
}

/* ============================================================================
 * 1. junk_golem —— 废铁魔像 160×180
 * ========================================================================== */

function drawJunkGolem(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const move = F.anim === 'move'
  const bob = move ? (i % 2 ? 1 : 0) : i % 2 ? 1 : 0
  const cx = 80
  // 攻击：双臂抬起（frame 0）→ 砸下（frame 1）
  const armUp = atk ? (i === 0 ? -46 : 4) : 0
  const torsoDrop = atk && i === 1 ? 8 : 0
  const hipY = 138 + bob + torsoDrop
  const shY = 84 + bob + torsoDrop
  const body = mix(PAL.rust, PAL.rustDark, 0.35)
  const bodyL = mix(PAL.rust, PAL.rustLight, 0.4)
  const metal = mix(PAL.steel, PAL.rust, 0.45)

  s.shadow(cx, g - 2, 58, 4, 0.7)
  // 脚下瓦砾
  for (let k = 0; k < 14; k++) {
    const r = mulberry32(0x310 + k)
    s.ell(cx - 56 + r() * 112, g - 2 - r() * 4, 2 + r() * 4, 1.5 + r() * 2, r() < 0.5 ? PAL.ash : PAL.dust)
  }

  // —— 腿（两条工字钢 + 发光膝关节=弱点）——
  for (const side of [-1, 1]) {
    const lx = cx + side * 24
    const step = move ? Math.sin((i / 3) * TAU + (side > 0 ? Math.PI : 0)) * 5 : 0
    const kneeX = lx + step
    s.thick(lx, hipY, kneeX, hipY + 20, 9, shade(metal, -0.35))
    s.thick(lx, hipY, kneeX, hipY + 20, 6.5, metal)
    weakPoint(s, F, kneeX, hipY + 20, 4, PAL.neonWarm)
    s.thick(kneeX, hipY + 20, kneeX + step * 0.5, g - 6, 8, shade(metal, -0.2))
    s.thick(kneeX, hipY + 20, kneeX + step * 0.5, g - 6, 5.5, shade(metal, 0.12))
    // 脚（履带块）
    s.rect(kneeX + step * 0.5 - 9, g - 8, 18, 7, PAL.steelDark)
    s.rect(kneeX + step * 0.5 - 8, g - 8, 16, 2, PAL.steel)
    for (let k = 0; k < 3; k++) s.px(kneeX + step * 0.5 - 6 + k * 5, g - 4, PAL.ashPale, 0.9)
  }

  // —— 躯干（层层废铁）——
  s.poly(
    [
      [cx - 32, shY + 6],
      [cx - 26, shY - 6],
      [cx + 26, shY - 6],
      [cx + 33, shY + 8],
      [cx + 28, hipY + 3],
      [cx - 28, hipY + 3],
    ],
    shade(body, -0.3),
  )
  s.poly(
    [
      [cx - 29, shY + 8],
      [cx - 24, shY - 3],
      [cx + 24, shY - 3],
      [cx + 30, shY + 8],
      [cx + 26, hipY],
      [cx - 26, hipY],
    ],
    body,
  )
  // 分层装甲板
  scrapPlate(s, cx - 26, shY + 2, 26, 18, bodyL, 0x321)
  scrapPlate(s, cx + 2, shY + 6, 24, 16, mix(PAL.steelBlue, body, 0.35), 0x322)
  scrapPlate(s, cx - 22, shY + 24, 20, 14, metal, 0x323)
  scrapPlate(s, cx + 4, shY + 26, 18, 12, mix(body, PAL.rustLight, 0.4), 0x324)
  // 引擎块（右肩）
  s.rect(cx + 20, shY - 10, 22, 18, PAL.steelDark)
  s.rect(cx + 22, shY - 8, 18, 14, metal)
  for (let k = 0; k < 4; k++) s.rect(cx + 24, shY - 6 + k * 3, 14, 1, PAL.steelLight, 0.5)
  s.rect(cx + 40, shY - 6, 6, 4, PAL.rust)
  // 左肩轮胎
  s.ell(cx - 34, shY - 2, 11, 10, PAL.oil)
  s.ell(cx - 34, shY - 2, 7, 6.4, PAL.black)
  s.ell(cx - 34, shY - 2, 3, 2.6, PAL.steel)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU
    s.px(cx - 34 + Math.cos(a) * 9, shY - 2 + Math.sin(a) * 8, PAL.ashPale, 0.8)
  }

  // —— 胸口外露核心（主弱点）——
  s.disc(cx - 2, shY + 16, 12, PAL.steelDark)
  s.disc(cx - 2, shY + 16, 10, PAL.void)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    s.line(cx - 2 + Math.cos(a) * 9, shY + 16 + Math.sin(a) * 9, cx - 2 + Math.cos(a) * 12, shY + 16 + Math.sin(a) * 12, PAL.rustDark)
  }
  weakPoint(s, F, cx - 2, shY + 16, 7, PAL.toxicGlow)

  // —— 手臂（巨大，前臂挂废件）——
  for (const side of [-1, 1]) {
    const sx = cx + side * 30
    const sy = shY + 2
    const ex = cx + side * 50
    const ey = shY + 30 + armUp * 0.5
    const hx = cx + side * 56
    const hy = shY + 56 + armUp
    s.thick(sx, sy, ex, ey, 11, shade(metal, -0.35))
    s.thick(sx, sy, ex, ey, 8, metal)
    s.disc(ex, ey, 7, PAL.steelDark)
    weakPoint(s, F, ex, ey, 3, PAL.neonWarm)
    // 前臂（更粗）+ 拳
    s.thick(ex, ey, hx, hy, 12, shade(metal, -0.25))
    s.thick(ex, ey, hx, hy, 9, mix(metal, PAL.rustLight, 0.25))
    s.disc(hx, hy, 10, PAL.steelDark)
    s.disc(hx, hy, 7.5, mix(PAL.steel, PAL.rust, 0.35))
    for (let k = 0; k < 4; k++) s.px(hx - 4 + k * 3, hy - 4, PAL.steelWhite, 0.8)
    // 拳上焊的尖刺
    s.poly(
      [
        [hx + side * 4, hy - 6],
        [hx + side * 9, hy - 12],
        [hx + side * 7, hy - 4],
      ],
      PAL.boneDark,
    )
  }

  // —— 头（焊在躯干上的小方盒 + 独眼）——
  const hx0 = cx - 10
  const hy0 = shY - 26
  s.rect(hx0, hy0, 22, 18, PAL.steelDark)
  s.rect(hx0 + 2, hy0 + 2, 18, 14, mix(PAL.steel, PAL.rust, 0.4))
  s.rect(hx0 + 4, hy0 + 6, 14, 5, PAL.black)
  s.rect(hx0 + 6, hy0 + 7, 10, 3, PAL.neonRed)
  F.g.push({ x: hx0 + 11, y: hy0 + 8, r: 13, c: PAL.neonRed, p: 1 })
  // 头顶排气管
  s.rect(hx0 + 4, hy0 - 8, 4, 9, PAL.steelDark)
  s.rect(hx0 + 14, hy0 - 6, 3, 7, PAL.steelDark)
  s.px(hx0 + 5, hy0 - 9, PAL.rust)

  // —— 攻击反馈 ——
  if (atk) {
    if (i === 1) {
      // 砸地：冲击波 + 尘土
      for (let k = 0; k < 18; k++) {
        const r = mulberry32(0x330 + k)
        s.px(cx - 60 + r() * 120, g - 1 - r() * 6, PAL.dust, 1)
      }
      s.line(cx - 50, g - 3, cx - 20, g - 10, PAL.dust, 1)
      s.line(cx + 50, g - 3, cx + 20, g - 10, PAL.dust, 1)
    } else {
      // 抬臂时的液压火花
      for (let k = 0; k < 6; k++) s.px(cx - 40 + k * 16, shY - 6, PAL.neonWarm, 1)
    }
  }
  // 锈 / 烟
  for (let k = 0; k < 26; k++) {
    const r = mulberry32(0x340 + k)
    s.px(cx - 34 + r() * 68, shY - 10 + r() * (hipY - shY + 10), PAL.rustDark, 0.9)
  }
}

/* ============================================================================
 * 2. sky_warden —— 天空守望者 180×120
 * ========================================================================== */

function drawSkyWarden(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const move = F.anim === 'move'
  const hover = move ? (i % 2 ? -3 : 1) : i % 2 ? -2 : 1
  const cx = 90
  const cy = 54 + hover
  const hull = mix(PAL.steelBlue, PAL.steel, 0.45)
  const hullL = mix(hull, PAL.steelLight, 0.5)

  // 地面投影（浮空大阴影）
  s.shadow(cx, g - 2, 46, 4, 0.55)

  // —— 翼（左右各三片太阳能板；攻击帧前掠）——
  const spread = atk ? 0.72 : 1
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const bx = cx + side * (26 + k * 18 * spread)
      const by = cy - 8 - k * 4 + (atk ? 6 : 0)
      const w = 24 - k * 2
      const h = 12 - k
      s.poly(
        [
          [bx, by],
          [bx + side * w, by - 4],
          [bx + side * w, by + h - 4],
          [bx, by + h],
        ],
        k === 1 ? mix(PAL.steelBlue, PAL.glass, 0.35) : hull,
      )
      // 太阳能板格栅
      for (let j = 1; j < 4; j++) {
        s.line(bx + side * (w * j) / 4, by + 1, bx + side * (w * j) / 4, by + h - 2, PAL.steelDark, 0.7)
      }
      s.line(bx, by + 1, bx + side * w, by - 3, hullL, 0.8)
      // 翼尖灯
      s.px(bx + side * (w - 1), by + h - 6, PAL.neon, 1)
      F.g.push({ x: bx + side * (w - 1), y: by + h - 6, r: 5, c: PAL.neon, p: 0.9 })
      // 连接支架
      s.line(cx + side * 22, cy - 2, bx, by + 3, PAL.steelDark, 0.9)
    }
  }

  // —— 主体（环状舱体）——
  s.ell(cx, cy, 30, 22, PAL.steelDark)
  s.ell(cx, cy, 27, 19, hull)
  s.ell(cx - 2, cy - 3, 18, 12, hullL, 0.6)
  // 装甲环带 + 铆钉
  for (let k = 0; k < 3; k++) {
    s.ell(cx, cy, 26 - k * 3, 18 - k * 2, k === 1 ? PAL.steelDark : hull, 0.0)
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU
    s.px(cx + Math.cos(a) * 24, cy + Math.sin(a) * 17, PAL.steelLight, 0.9)
  }
  // 顶部进气 / 天线
  s.rect(cx - 6, cy - 24, 12, 5, PAL.steelDark)
  for (let k = 0; k < 4; k++) s.rect(cx - 4 + k * 3, cy - 23, 1, 3, PAL.black)
  s.line(cx + 2, cy - 24, cx + 8, cy - 34, PAL.steelLight)
  s.px(cx + 8, cy - 34, PAL.neonRed, 1)
  F.g.push({ x: cx + 8, y: cy - 34, r: 7, c: PAL.neonRed, p: 0.8 })

  // —— 中央核眼（主弱点，暴露在环中心）——
  s.disc(cx, cy + 2, 15, PAL.steelDark)
  s.disc(cx, cy + 2, 13, PAL.void)
  // 暴露的支架
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.3
    s.line(cx + Math.cos(a) * 11, cy + 2 + Math.sin(a) * 11, cx + Math.cos(a) * 15, cy + 2 + Math.sin(a) * 15, PAL.rustDark)
  }
  const eyeR = atk ? 10 : 8.5
  weakPoint(s, F, cx, cy + 2, eyeR, atk ? PAL.neonRed : PAL.neon)
  // 攻击：充能射线
  if (atk) {
    const charge = i === 0 ? 0.4 : 1
    s.disc(cx, cy + 2, 4 + charge * 3, PAL.white, 1)
    for (let k = 0; k < 4; k++) {
      s.px(cx - 20 + k * 4, cy + 2 - 18, PAL.neonRed, 1)
      s.px(cx + 20 - k * 4, cy + 2 + 20, PAL.neonRed, 1)
    }
    if (i === 1) {
      // 向下的光束
      for (let y = cy + 14; y < g - 2; y++) {
        const w = 2 + Math.floor((y - cy) / 18)
        s.rect(cx - w, y, w * 2, 1, PAL.neonRed, 1)
      }
      s.disc(cx, g - 2, 12, PAL.neonRed, 1)
      s.disc(cx, g - 2, 6, PAL.white, 1)
    }
  }

  // —— 推进器（下方两组）——
  for (const side of [-1, 1]) {
    const tx = cx + side * 16
    const ty = cy + 20
    s.rect(tx - 6, ty, 12, 8, PAL.steelDark)
    s.rect(tx - 4, ty + 2, 8, 5, PAL.steel)
    for (let k = 0; k < 3; k++) s.rect(tx - 5 + k * 4, ty + 7, 2, 3, PAL.ashPale, 0.9)
    // 喷焰
    const flame = move || atk ? 10 : 5
    for (let k = 0; k < flame; k++) {
      const w = Math.max(1, 4 - Math.floor(k / 3))
      s.rect(tx - w, ty + 9 + k, w * 2, 1, k < 3 ? PAL.white : k < 6 ? PAL.neonWarm : PAL.rustHot, 1)
    }
    F.g.push({ x: tx, y: ty + 12, r: 8, c: PAL.neonWarm, p: 0.85 })
  }
  // 悬停光环
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + (i * TAU) / 20
    s.px(cx + Math.cos(a) * 34, cy + 26 + Math.sin(a) * 4, PAL.neon, 0.9)
  }
}

/* ============================================================================
 * 3. mimic_beast —— 拟态兽 140×100
 * ========================================================================== */

function drawMimicBeast(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const move = F.anim === 'move'
  const cx = 60
  const cy = 66 + (move ? (i % 2 ? -1 : 0) : 0)
  const hide = mix(PAL.dust, PAL.rustDark, 0.35)
  const hideL = mix(hide, PAL.sand, 0.35)
  const hideD = mix(hide, PAL.void, 0.45)
  const jawOpen = atk ? (i === 0 ? 4 : 12) : 1

  s.shadow(cx + 6, g - 1, 44, 3, 0.6)

  // —— 蟹足 6 条 ——
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const ph = (move ? (i / 3) * TAU : 0) + k * 0.8 + (side > 0 ? Math.PI : 0)
      const lift = move ? Math.max(0, Math.cos(ph)) * 3 : 0
      const hx = cx - 18 + k * 16
      const hy = cy + 8
      const kx = hx + side * 14
      const ky = cy + 18
      const fx = hx + side * (20 + Math.sin(ph) * 3)
      s.thick(hx, hy, kx, ky, 3, hideD)
      s.thick(kx, ky, fx, g - 2 - lift, 2.4, hide)
      s.px(fx, g - 2 - lift, PAL.ink)
    }
  }

  // —— 躯干（宽扁，像一堆废料）——
  s.ell(cx, cy, 38, 20, hideD)
  s.ell(cx, cy - 2, 36, 18, hide)
  s.ell(cx - 4, cy - 8, 26, 9, hideL, 0.5)
  // 伪装：背上的木箱 / 油桶 / 轮胎
  s.rect(cx - 26, cy - 20, 18, 14, mix(PAL.dust, PAL.sand, 0.2))
  s.rect(cx - 26, cy - 20, 18, 2, PAL.sand)
  s.line(cx - 26, cy - 14, cx - 9, cy - 14, PAL.sandDark, 0.8)
  s.ell(cx + 2, cy - 18, 9, 8, PAL.rust)
  s.ell(cx + 2, cy - 18, 6.5, 5.5, PAL.rustLight)
  s.rect(cx + 16, cy - 22, 12, 12, PAL.dust)
  s.ell(cx + 28, cy - 12, 7, 6, PAL.oil)
  s.ell(cx + 28, cy - 12, 4, 3.4, PAL.black)
  // 伪装的锈 / 苔
  for (let k = 0; k < 16; k++) {
    const r = mulberry32(0x350 + k)
    s.px(cx - 34 + r() * 70, cy - 22 + r() * 34, r() < 0.5 ? PAL.rustDark : PAL.mossDead, 0.85)
  }

  // —— 头 / 巨口（朝右），口腔是弱点 ——
  const hx = cx + 40
  const hy = cy - 6
  // 上颚
  s.poly(
    [
      [hx - 8, hy - 10],
      [hx + 20, hy - 8],
      [hx + 26, hy - 2],
      [hx + 8, hy + 2],
      [hx - 8, hy - 2],
    ],
    hide,
  )
  s.line(hx - 6, hy - 9, hx + 18, hy - 7, hideL)
  // 下颚（可张开）
  s.poly(
    [
      [hx - 8, hy + 2 + jawOpen],
      [hx + 12, hy + 4 + jawOpen],
      [hx + 24, hy + 2 + jawOpen],
      [hx + 10, hy + 12 + jawOpen],
      [hx - 10, hy + 10 + jawOpen],
    ],
    shade(hide, -0.2),
  )
  // 口腔（发光）
  s.poly(
    [
      [hx - 4, hy - 1],
      [hx + 14, hy],
      [hx + 18, hy + 4 + jawOpen * 0.5],
      [hx + 2, hy + 7 + jawOpen * 0.5],
      [hx - 6, hy + 4],
    ],
    PAL.bloodDark,
  )
  weakPoint(s, F, hx + 6, hy + 3 + jawOpen * 0.4, atk ? 4.5 : 3.2, PAL.toxicGlow)
  // 牙
  for (let k = 0; k < 7; k++) {
    const tx = hx - 2 + k * 3
    s.poly(
      [
        [tx, hy - 1],
        [tx + 1.6, hy + 3],
        [tx + 3, hy - 1],
      ],
      PAL.bone,
    )
    if (k < 5) {
      s.poly(
        [
          [tx + 1, hy + 6 + jawOpen * 0.5],
          [tx + 2.4, hy + 2 + jawOpen * 0.5],
          [tx + 3.6, hy + 6 + jawOpen * 0.5],
        ],
        PAL.boneDark,
      )
    }
  }
  // 舌（攻击时伸出）
  if (atk) {
    s.thick(hx + 2, hy + 4, hx + 18, hy + 8 + i * 4, 2, PAL.blood, 1)
    s.px(hx + 18, hy + 8 + i * 4, PAL.bloodDark, 1)
  }
  // 触角 / 眼柄
  s.line(hx - 6, hy - 10, hx - 12, hy - 20, hideD)
  s.disc(hx - 12, hy - 21, 2.4, PAL.steelDark)
  s.px(hx - 12, hy - 21, PAL.neonWarm, 1)
  F.g.push({ x: hx - 12, y: hy - 21, r: 6, c: PAL.neonWarm, p: 0.8 })

  // 攻击：前冲线条
  if (atk) {
    for (let k = 0; k < 6; k++) s.line(4 + k * 2, cy - 8 + k * 4, 22, cy - 6 + k * 4, PAL.dust, 0.9)
  }
}

/* ============================================================================
 * 4. swarm_core —— 虫巢核心 150×110
 * ========================================================================== */

function drawSwarmCore(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const move = F.anim === 'move'
  const pulse = i % 2 ? 1 : 0
  const cx = 74
  const cy = 58 + pulse
  const carapace = mix(PAL.toxicDark, PAL.steelBlue, 0.45)
  const carapaceL = mix(carapace, PAL.toxic, 0.4)
  const carapaceD = mix(carapace, PAL.void, 0.5)

  s.shadow(cx, g - 1, 52, 3.4, 0.6)
  // 地面黏液
  s.ell(cx, g - 2, 46, 3, PAL.toxicDark, 0.9)
  for (let k = 0; k < 8; k++) {
    const r = mulberry32(0x360 + k)
    s.px(cx - 40 + r() * 80, g - 3 - r() * 2, PAL.toxicGlow, 1)
  }

  // —— 触须腿（8 条）——
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2
    const bx = cx + Math.cos(a) * 34
    const by = cy + 14 + Math.sin(a) * 10
    const mx = cx + Math.cos(a) * (44 + (move ? Math.sin((i / 3) * TAU + k) * 3 : 0))
    const my = cy + 30 + Math.sin(a) * 8
    const ex = cx + Math.cos(a) * 56
    const ey = g - 2 - Math.abs(Math.cos(a)) * 4
    s.thick(bx, by, mx, my, 4, carapaceD)
    s.thick(mx, my, ex, ey, 3, carapace)
    s.px(ex, ey, PAL.ink, 1)
    // 关节刺
    s.px(mx, my - 1, PAL.bone, 0.9)
  }

  // —— 囊体（分层甲壳）——
  s.ell(cx, cy, 44, 30, carapaceD)
  s.ell(cx, cy - 2, 41, 27, carapace)
  // 甲片分节（弧线）
  for (let k = 1; k < 4; k++) {
    s.ell(cx, cy - 2 + k * 7, 40 - k * 3, 25 - k * 4, carapaceD, 0.5)
  }
  for (let k = 0; k < 5; k++) {
    const yy = cy - 18 + k * 8
    s.line(cx - 30 + k * 2, yy, cx + 30 - k * 2, yy, carapaceD, 0.8)
  }
  s.ell(cx - 8, cy - 14, 22, 10, carapaceL, 0.35)

  // 虫群孔洞（小黑洞 + 探出的触角）
  for (const [hx, hy] of [
    [cx - 24, cy - 8],
    [cx + 22, cy - 10],
    [cx - 18, cy + 16],
    [cx + 26, cy + 14],
    [cx + 4, cy - 20],
  ]) {
    s.ell(hx, hy, 6, 4.5, PAL.void)
    s.ell(hx, hy, 4, 3, PAL.black)
    for (let k = 0; k < 3; k++) {
      s.px(hx - 2 + k * 2, hy - 2, PAL.toxic, 0.8)
    }
  }

  // —— 暴露的核心（主弱点）——
  s.ell(cx + 2, cy + 2, 16, 12, PAL.void)
  // 保护性肋骨（可读作“暴露”）
  for (let k = 0; k < 4; k++) {
    s.line(cx - 12 + k * 8, cy - 10, cx - 10 + k * 8, cy + 12, PAL.steelDark, 1)
  }
  weakPoint(s, F, cx + 2, cy + 2, atk ? 8 : 6.5, atk ? PAL.neonRed : PAL.toxicGlow)

  // —— 攻击：喷射虫群 / 酸刺 ——
  if (atk) {
    if (i === 0) {
      // 蓄力：核心收缩 + 孔洞冒虫
      for (let k = 0; k < 10; k++) {
        const r = mulberry32(0x370 + k)
        s.px(cx - 30 + r() * 60, cy - 24 + r() * 30, PAL.toxicGlow, 1)
      }
    } else {
      // 喷出：酸刺射线
      for (let k = 0; k < 12; k++) {
        const r = mulberry32(0x380 + k)
        const dx = 20 + r() * 60
        const dy = (r() - 0.5) * 40
        s.px(cx + 10 + dx, cy + dy, PAL.toxicGlow, 1)
        s.px(cx + 10 + dx + 1, cy + dy + 1, PAL.toxic, 1)
      }
      // 小飞虫剪影
      for (let k = 0; k < 6; k++) {
        const r = mulberry32(0x390 + k)
        const bx = cx + 20 + r() * 50
        const by = cy - 20 + r() * 40
        s.px(bx, by, PAL.black, 1)
        s.px(bx + 1, by - 1, PAL.toxic, 1)
      }
    }
  }

  // —— 周围飞舞的虫群（始终有，制造压迫感）——
  for (let k = 0; k < 12; k++) {
    const r = mulberry32(0x3a0 + k)
    const a = (k / 12) * TAU + (i * TAU) / 24
    const rad = 54 + r() * 16
    const bx = cx + Math.cos(a) * rad
    const by = cy - 6 + Math.sin(a) * rad * 0.6
    s.px(bx, by, PAL.black, 1)
    s.px(bx + 1, by, PAL.toxicDark, 1)
    s.px(bx, by - 1, PAL.toxic, 0.9)
  }
}

/* ============================================================================
 * 4.5 新增 BOSS：裂爪暴君 / 赛博精神病暴走体 / 超能暴走体
 * ========================================================================== */

/** 裂爪暴君：半生物半工程机的巨躯，右臂是一只夸张的骨爪。 */
function drawClawTyrant(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const cx = 74
  const hipY = g - 44
  const flesh = mix(PAL.rustDark, PAL.boneDark, 0.35)
  const fleshL = mix(flesh, PAL.bone, 0.35)
  const fleshD = mix(PAL.void, flesh, 0.5)
  const steel = mix(PAL.steel, PAL.rust, 0.25)
  s.shadow(cx, g - 1, 56, 5, 0.4)
  // 液压腿
  for (const side of [-1, 1]) {
    const lx = cx + side * 22
    s.thick(lx, hipY, lx + side * 10, g - 30, 10, steel)
    s.thick(lx + side * 10, g - 30, lx + side * 18, g - 2, 8, mix(PAL.steel, PAL.void, 0.3))
    s.rect(lx + side * 6 - 5, g - 34, 10, 12, PAL.steelDark)
    s.line(lx, hipY - 6, lx + side * 10, g - 34, PAL.steelLight, 0.5)
  }
  // 躯干：缝合的肉与钢板
  s.ell(cx, hipY - 22, 34, 30, fleshD)
  s.ell(cx + 2, hipY - 24, 30, 26, flesh)
  scrapPlate(s, cx - 26, hipY - 52, 26, 22, steel, 0x501)
  scrapPlate(s, cx + 6, hipY - 46, 22, 18, mix(steel, PAL.rust, 0.4), 0x502)
  // 肋缝 / 管线
  for (let k = 0; k < 4; k++) s.line(cx - 20 + k * 11, hipY - 30, cx - 16 + k * 11, hipY - 6, fleshD, 0.7)
  s.thick(cx - 12, hipY - 18, cx + 18, hipY - 34, 3, PAL.copper || PAL.rustLight)
  // 左臂（细小、挡在胸前）
  s.thick(cx - 28, hipY - 40, cx - 40, hipY - 8, 7, flesh)
  s.disc(cx - 42, hipY - 6, 6, fleshD)
  // 右臂：巨爪（攻击帧前伸）
  const sx = cx + 26
  const sy = hipY - 44
  const ex = atk ? cx + 86 : cx + 54
  const ey = atk ? hipY - 26 : hipY - 10
  s.thick(sx, sy, ex - 6, ey - 8, 12, steel)
  s.thick(sx, sy - 2, ex - 8, ey - 10, 8, mix(steel, PAL.bone, 0.4))
  // 爪的三根骨刃
  for (let k = 0; k < 3; k++) {
    const a = -0.5 + k * 0.5
    const len = atk ? 40 : 30
    s.poly(
      [
        [ex, ey - 4],
        [ex + Math.cos(a) * len, ey - 6 + Math.sin(a) * len],
        [ex + 2, ey + 4],
      ],
      mix(PAL.bone, PAL.rust, 0.35)
    )
    s.line(ex, ey - 2, ex + Math.cos(a) * (len - 4), ey - 4 + Math.sin(a) * (len - 4), PAL.white, 0.55)
  }
  s.disc(ex - 2, ey - 4, 7, fleshD)
  // 头：埋在肩里的小脑袋
  const hx = cx + 8
  const hy = hipY - 54
  s.ell(hx, hy, 12, 10, fleshD)
  s.ell(hx + 1, hy, 10, 8, fleshL)
  s.px(hx + 6, hy - 2, PAL.neonRed)
  s.disc(hx + 6, hy - 2, 3, PAL.neonRed, 1)
  F.g.push({ x: hx + 6, y: hy - 2, r: 12, c: PAL.neonRed, p: 0.6 })
  // 背脊外露的发光核心
  s.disc(cx - 10, hipY - 40, 6, PAL.void)
  s.disc(cx - 10, hipY - 40, 4, PAL.neonWarm)
  F.g.push({ x: cx - 10, y: hipY - 40, r: 22, c: PAL.neonWarm, p: 0.7 })
  if (atk) {
    for (let k = 0; k < 8; k++) s.px(cx + 70 + s.r() * 30, g - 2 - s.r() * 8, PAL.dust, 0.5)
    F.g.push({ x: ex + 18, y: ey - 2, r: 20, c: PAL.neonWarm, p: 0.5 })
  }
  s.speck(cx - 34, hipY - 56, 70, 60, PAL.rustDark, 0.08, 0.6)
}

/** 赛博精神病暴走体：被植入体吞掉的人形，手臂就是枪。 */
function drawCyberPsychoBoss(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const cx = 44
  const hipY = g - 34
  const coat = mix(PAL.steel, PAL.neonRed, 0.18)
  const coatD = mix(PAL.void, coat, 0.55)
  const skin = mix(PAL.boneDark, PAL.rust, 0.3)
  s.shadow(cx, g - 1, 24, 3, 0.36)
  // 腿
  for (const side of [-1, 1]) {
    s.thick(cx + side * 6, hipY, cx + side * 9, g - 12, 6, coatD)
    s.thick(cx + side * 9, g - 12, cx + side * 11, g - 2, 5, PAL.ink)
  }
  // 躯干 + 风衣
  s.poly(
    [
      [cx - 14, hipY - 40],
      [cx + 14, hipY - 40],
      [cx + 18, g - 8],
      [cx - 18, g - 8],
    ],
    coatD
  )
  s.poly(
    [
      [cx - 11, hipY - 38],
      [cx + 11, hipY - 38],
      [cx + 14, g - 12],
      [cx - 14, g - 12],
    ],
    coat
  )
  s.line(cx - 11, hipY - 36, cx - 12, g - 14, PAL.neon, 0.7)
  s.line(cx + 11, hipY - 36, cx + 12, g - 14, PAL.neonRed, 0.6)
  s.px(cx, hipY - 26, PAL.neonWarm, 1)
  // 左臂：正常
  s.thick(cx - 12, hipY - 34, cx - 18, hipY - 6, 5, coatD)
  // 右臂：义体炮（攻击时抬平）
  const sy = hipY - 34
  const gx = atk ? cx + 34 : cx + 24
  const gy = atk ? sy - 4 : sy + 10
  s.thick(cx + 12, sy, gx - 4, gy, 7, mix(PAL.steel, PAL.neonRed, 0.25))
  s.rect(gx - 5, gy - 4, 14, 8, PAL.steelDark)
  s.rect(gx - 2, gy - 2, 8, 3, PAL.steelLight)
  s.px(gx + 5, gy - 1, PAL.neonRed)
  // 头 + 莫西干 + 面罩管
  const hy = hipY - 50
  s.ell(cx, hy, 9, 11, skin)
  s.ell(cx + 1, hy - 1, 7.5, 9, mix(skin, PAL.bone, 0.3))
  for (let k = 0; k < 5; k++) {
    s.poly(
      [
        [cx - 3 + k * 2, hy - 9],
        [cx - 1.5 + k * 2, hy - 19 - (k % 2) * 3],
        [cx + 0.5 + k * 2, hy - 9],
      ],
      k % 2 ? PAL.neonRed : PAL.neonWarm
    )
  }
  s.rect(cx + 1, hy - 3, 6, 3, PAL.void)
  s.px(cx + 4, hy - 2, PAL.neonRed)
  F.g.push({ x: cx + 4, y: hy - 2, r: 12, c: PAL.neonRed, p: 0.6 })
  s.thick(cx + 4, hy + 2, cx + 10, hipY - 30, 2, PAL.steel)
  if (atk) {
    s.poly(
      [
        [gx + 9, gy - 4],
        [gx + 22, gy],
        [gx + 9, gy + 4],
      ],
      PAL.neonWarm
    )
    F.g.push({ x: gx + 14, y: gy, r: 22, c: PAL.neonWarm, p: 0.8 })
  }
  // 全身霓虹描边
  F.g.push({ x: cx, y: hipY - 10, r: 40, c: PAL.neonRed, p: 0.2 })
  s.speck(cx - 20, hipY - 40, 44, 62, PAL.rustDark, 0.06, 0.5)
}

/** 超能暴走体：没有皮肤的能量人形，光带从胸腔里长出来。 */
function drawEsperBerserk(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const cx = 60
  const hipY = g - 30
  const aura = 0x9fd3e0
  const auraL = PAL.white
  const auraD = mix(PAL.void, PAL.toxicDark, 0.45)
  s.shadow(cx, g - 1, 34, 4, 0.3)
  // 不稳定的双腿：粒子化的轮廓
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1
    const wob = Math.sin(i * 0.9 + k) * 3
    s.thick(cx + side * 8, hipY, cx + side * 12 + wob, g - 2, 7, auraD)
    s.thick(cx + side * 8, hipY - 2, cx + side * 11 + wob, g - 4, 4, aura)
  }
  // 躯干
  s.ell(cx, hipY - 30, 30, 28, auraD)
  s.ell(cx, hipY - 32, 26, 24, mix(PAL.ash, aura, 0.35))
  // 胸腔核心
  s.disc(cx, hipY - 32, 14, PAL.void)
  s.disc(cx, hipY - 32, 11, aura)
  s.disc(cx, hipY - 32, 6, auraL)
  F.g.push({ x: cx, y: hipY - 32, r: 40, c: aura, p: 1 })
  // 能量触须
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + Math.sin(i * 0.6 + k) * 0.2
    const len = 34 + Math.sin(i + k) * 6
    const ex = cx + Math.cos(a) * len
    const ey = hipY - 32 + Math.sin(a) * len * 0.8
    s.thick(cx + Math.cos(a) * 12, hipY - 32 + Math.sin(a) * 12, ex, ey, 2, aura)
    s.px(ex, ey, auraL, 0.9)
  }
  // 头：模糊的人形轮廓 + 两只亮眼
  const hy = hipY - 62
  s.ell(cx, hy, 13, 14, auraD)
  s.ell(cx, hy - 1, 11, 12, mix(PAL.ash, aura, 0.3))
  s.ell(cx - 5, hy - 2, 3, 2, PAL.void)
  s.ell(cx + 5, hy - 2, 3, 2, PAL.void)
  s.disc(cx - 5, hy - 2, 2, auraL)
  s.disc(cx + 5, hy - 2, 2, auraL)
  F.g.push({ x: cx - 5, y: hy - 2, r: 8, c: aura, p: 0.8 })
  F.g.push({ x: cx + 5, y: hy - 2, r: 8, c: aura, p: 0.8 })
  // 放射的能量弧
  for (let k = 0; k < 5; k++) {
    const r = 44 + k * 9 + Math.sin(i + k) * 3
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * TAU + (k * 0.3)
      s.px(cx + Math.cos(a) * r, hipY - 32 + Math.sin(a) * r * 0.8, aura, 0.35)
    }
  }
  if (atk) {
    // 施法：双掌抬起 + 光弹
    s.thick(cx - 14, hipY - 46, cx - 28, hipY - 62, 4, aura)
    s.thick(cx + 14, hipY - 46, cx + 28, hipY - 62, 4, aura)
    s.disc(cx - 30, hipY - 64, 5, auraL)
    s.disc(cx + 30, hipY - 64, 5, auraL)
    F.g.push({ x: cx, y: hipY - 70, r: 34, c: aura, p: 0.7 })
  }
}

/* ============================================================================
 * 5. 帧合成
 * ========================================================================== */

const LARGE_DEFS = {
  junk_golem: { w: 160, h: 180, draw: drawJunkGolem, seed: 0x2a1 },
  sky_warden: { w: 180, h: 120, draw: drawSkyWarden, seed: 0x2a2 },
  mimic_beast: { w: 140, h: 100, draw: drawMimicBeast, seed: 0x2a3 },
  swarm_core: { w: 150, h: 110, draw: drawSwarmCore, seed: 0x2a4 },
  claw_tyrant: { w: 170, h: 196, draw: drawClawTyrant, seed: 0x2a5 },
  cyberpsycho_boss: { w: 90, h: 140, draw: drawCyberPsychoBoss, seed: 0x2a6 },
  esper_berserk: { w: 120, h: 170, draw: drawEsperBerserk, seed: 0x2a7 },
}

export const LARGE_MONSTER_IDS = Object.keys(LARGE_DEFS)

const LARGE_OUTLINE = {
  junk_golem: mix(PAL.void, PAL.rustDark, 0.24),
  sky_warden: mix(PAL.void, PAL.steel, 0.24),
  mimic_beast: mix(PAL.void, PAL.rustDark, 0.22),
  swarm_core: mix(PAL.void, PAL.toxicDark, 0.26),
  claw_tyrant: mix(PAL.void, PAL.rustDark, 0.24),
  cyberpsycho_boss: mix(PAL.void, PAL.neonRed, 0.2),
  esper_berserk: mix(PAL.void, PAL.toxicDark, 0.24),
}

const LARGE_WARM = {
  junk_golem: PAL.rust,
  sky_warden: PAL.steelBlue,
  mimic_beast: PAL.dust,
  swarm_core: PAL.toxicDark,
  claw_tyrant: PAL.rustDark,
  cyberpsycho_boss: PAL.neonRed,
  esper_berserk: PAL.toxicDark,
}

/** 大怪美术定义：7 只固有大型敌人 + 51 只主题 BOSS（各自独占立绘）。 */
function largeDefOf(id) {
  return LARGE_DEFS[id] || THEME_BOSS_LARGE_DEFS[id] || null
}

function largeFrame(id, P) {
  const def = largeDefOf(id)
  const s = new Surf(def.w, def.h, def.seed + (P.i || 0) * 41, 'large-monsters')
  P.g = []
  def.draw(s, P)
  // 统一细节：锈/尘（只落在不透明像素上）
  for (let k = 0; k < 30; k++) {
    const r = mulberry32(def.seed + 7 + k)
    const x = Math.floor(r() * s.w)
    const y = Math.floor(r() * s.h)
    if (s.a(x, y) < 200) continue
    s.px(x, y, r() < 0.5 ? PAL.rustDark : PAL.dust, 0.9)
  }
  s.edges(mix(PAL.white, def.warm || LARGE_WARM[id], 0.5), PAL.void, 0.3, 0.45)
  s.outline(def.outline || LARGE_OUTLINE[id])
  if (P.hurt) {
    s.tint(PAL.neonRed, 0.26, true)
    for (let k = 0; k < 14; k++) {
      const r = mulberry32(def.seed + 99)
      s.px(r() * s.w, r() * s.h, PAL.neonWarm, 1)
    }
  }
  for (const gl of P.g) s.glow(gl.x, gl.y, gl.r, gl.c, gl.p)
  return s.tex()
}

/** 大型死亡帧：k=0 崩塌中 / k=1 彻底垮成一堆。 */
function largeDead(id, k) {
  const def = largeDefOf(id)
  const s = new Surf(def.w, def.h, def.seed + 300 + k * 23, 'large-monsters')
  const g = s.h - 1
  const cx = def.w * 0.46
  const warm = def.warm || LARGE_WARM[id]
  const body = mix(PAL.ashPale, warm, 0.35)
  const bodyD = mix(body, PAL.void, 0.4)
  s.shadow(cx, g - 2, def.w * 0.34, 4, 0.7)
  // 垮塌的躯干
  const h = def.h * (k === 0 ? 0.22 : 0.14)
  s.ell(cx, g - h * 0.5, def.w * 0.3, h, bodyD)
  s.ell(cx, g - h * 0.6, def.w * 0.27, h * 0.8, body)
  // 散落的构件
  for (let i = 0; i < 10; i++) {
    const r = mulberry32(def.seed + 400 + i)
    const px = cx - def.w * 0.4 + r() * def.w * 0.8
    const py = g - 2 - r() * h * 0.6
    s.rect(px, py, 3 + r() * 5, 2 + r() * 3, r() < 0.5 ? PAL.steel : PAL.rust)
  }
  // 核心残光
  s.disc(cx + 4, g - h * 0.4, 4, PAL.neonWarm, 1)
  s.disc(cx + 4, g - h * 0.4, 2, PAL.white, 1)
  // 烟 / 余烬
  for (let i = 0; i < 16; i++) {
    const r = mulberry32(def.seed + 500 + i)
    s.px(cx - def.w * 0.3 + r() * def.w * 0.6, g - 4 - r() * h * 1.6, r() < 0.5 ? PAL.ashPale : PAL.dust, 1)
  }
  s.speck(0, 0, s.w, s.h, PAL.rustDark, 0.05, 0.8)
  s.edges(mix(PAL.white, warm, 0.4), PAL.void, 0.28, 0.45)
  s.outline(def.outline || LARGE_OUTLINE[id])
  s.tint(PAL.void, k === 0 ? 0.16 : 0.24, true)
  s.glow(cx + 4, g - h * 0.4, 10, PAL.neonWarm, 0.9)
  return s.tex()
}

const LARGE_CACHE = new Map()

function buildLarge(id) {
  const key = largeDefOf(id) ? id : 'junk_golem'
  const def = largeDefOf(key)
  const frames = {
    idle: [largeFrame(key, { anim: 'idle', i: 0 }), largeFrame(key, { anim: 'idle', i: 1 })],
    move: [0, 1, 2].map((i) => largeFrame(key, { anim: 'move', i })),
    attack: [0, 1].map((i) => largeFrame(key, { anim: 'attack', i })),
    hurt: largeFrame(key, { anim: 'hurt', i: 1, hurt: true }),
    dead: [largeDead(key, 0), largeDead(key, 1)],
  }
  return { w: def.w, h: def.h, artId: key, anchor: 'bottom-center', frames }
}

/**
 * 大型敌人美术。未知 id 退回 junk_golem（尺寸 160×180），不会返回空。
 * 每个 texture 都带 userData.cleanAlpha = true（alpha 仅 0/255）。
 */
export function getLargeMonsterArt(id) {
  const key = String(id || '')
  let art = LARGE_CACHE.get(key)
  if (!art) {
    art = buildLarge(key)
    LARGE_CACHE.set(key, art)
  }
  return art
}

const LARGE_IDLE_CACHE = new Map()

/** 单帧 idle 立绘：图鉴 / 列表用，避免为每只 BOSS 预构建整套帧。 */
export function getLargeMonsterIdle(id) {
  const key = largeDefOf(id) ? String(id || '') : 'junk_golem'
  let tex = LARGE_IDLE_CACHE.get(key)
  if (!tex) {
    tex = largeFrame(key, { anim: 'idle', i: 0 })
    LARGE_IDLE_CACHE.set(key, tex)
  }
  return tex
}

/** 预载 4 种大型敌人。 */
export function preloadLargeArt() {
  for (const id of LARGE_MONSTER_IDS) getLargeMonsterArt(id)
  return LARGE_CACHE.size
}

/** 清缓存。 */
export function clearLargeMonsterCache() {
  LARGE_CACHE.clear()
  LARGE_IDLE_CACHE.clear()
}

