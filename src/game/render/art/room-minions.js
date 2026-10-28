// ============================================================================
// 锈雨 · RUSTFALL —— 190 间房 · 570 只房间专属小怪的像素美术注册表
// ----------------------------------------------------------------------------
// 数据源：world/rooms/{region}.js 里的 ROOM_MINION_DEFS（每房 3 只，共 570 只）。
// 本模块只做“造型绘制”，不注册实体、不碰 Three.js：
//
//   id -> { w, h, seed, draw(s, P), run, attack, warm, outline, lazy }
//
// 造型系统（三层正交，保证同房间里 3 只一眼就能分辨）：
//   plan（12）× sub（4） = 48 种互不相同的剪影：
//     quad 四足 / biped 人形 / insect 虫 / worm 蠕虫 / float 飘浮 /
//     avian 鸟类 / serpent 蛇形 / crustacean 甲壳 / blob 软体 /
//     statue 石像 / mech 机械 / plant 植物
//   motif（30）：决定体色方案 + 一个标志性细节
//     （circuit 荧光走线 / fire 余烬 / glass 玻璃碎片 / shadow 破边…）。
//   variant 0-3 改比例与肢体形状；mark 0-3 加背部印记；eye 0-2 改眼数眼形。
//
// 约定（与 monsters.js / theme-boss-art.js 完全一致）：
//   · 画布底部是脚与投影，水平中心 x≈w*0.46，一律朝 +x（右）；
//   · draw 必须把生物画满画布，P.anim ∈ idle|run|attack|hurt|dead，
//     腿脚/翅膀/触须用 P.i 做循环动画；
//   · alpha 只允许 0/255（Surf 统一二值化），半透明阴影一律 s.shadow 抖动；
//   · 眼睛 / 核心 / 灯笼的光登记到 P.g（{x,y,r,c,p}），由统一管线 s.glow；
//   · 全部确定性：mulberry32(种子)，绝不 Math.random()。
// ============================================================================

import { PAL } from '../palette.js'
import { mix, mulberry32, strSeed } from './core.js'
import { ROOM_MINION_DEFS } from '../../world/rooms/index.js'

const TAU = Math.PI * 2

/* ============================================================================
 * 1. 材质色板 —— 30 种 motif 各自的体色 / 描边 / 发光色
 * ========================================================================== */

const MOTIF = {
  chitin: { body: mix(PAL.toxicDark, PAL.ashPale, 0.32), trim: PAL.boneDark, glow: PAL.toxicGlow },
  rust: { body: PAL.rust, trim: PAL.rustLight, glow: PAL.neonWarm },
  flesh: { body: mix(PAL.bloodDark, PAL.rustDark, 0.3), trim: PAL.blood, glow: PAL.neonRed },
  cloth: { body: PAL.dustLight, trim: PAL.paper, glow: PAL.neonWarm },
  paper: { body: PAL.paper, trim: PAL.white, glow: PAL.neonWarm },
  steel: { body: PAL.steel, trim: PAL.steelLight, glow: PAL.signal },
  water: { body: mix(PAL.waterDeep, PAL.steelBlue, 0.45), trim: PAL.waterHi, glow: PAL.signal },
  fire: { body: mix(PAL.rustDark, PAL.rust, 0.55), trim: PAL.rustHot, glow: PAL.neonWarm },
  circuit: { body: mix(PAL.steelBlue, PAL.ash, 0.3), trim: PAL.neon, glow: PAL.neon },
  electric: { body: mix(PAL.steelDark, PAL.neonCold, 0.14), trim: PAL.neonCold, glow: PAL.signal },
  ash: { body: PAL.ashLight, trim: PAL.ashPale, glow: PAL.neonWarm },
  glass: { body: mix(PAL.glass, PAL.waterDeep, 0.35), trim: PAL.waterFoam, glow: PAL.signal },
  wood: { body: PAL.ochre, trim: PAL.sand, glow: PAL.neonWarm },
  heat: { body: mix(PAL.rust, PAL.ochre, 0.42), trim: PAL.rustHot, glow: PAL.neonWarm },
  fuel: { body: mix(PAL.oilSheen, PAL.oil, 0.55), trim: PAL.ochre, glow: PAL.neonWarm },
  radar: { body: mix(PAL.steelBlue, PAL.ashPale, 0.28), trim: PAL.neon, glow: PAL.signal },
  satellite: { body: PAL.steelLight, trim: PAL.neonCold, glow: PAL.signal },
  fur: { body: mix(PAL.dustLight, PAL.sand, 0.35), trim: PAL.sandDark, glow: PAL.neonWarm },
  bone: { body: mix(PAL.bone, PAL.sandDark, 0.3), trim: PAL.boneDeep, glow: PAL.neonWarm },
  toxic: { body: mix(PAL.toxicDark, PAL.mossDead, 0.32), trim: PAL.toxic, glow: PAL.toxicGlow },
  moss: { body: mix(PAL.mossDead, PAL.toxicDark, 0.42), trim: PAL.weed, glow: PAL.toxicGlow },
  oil: { body: mix(PAL.oil, PAL.ash, 0.35), trim: PAL.oilSheen, glow: PAL.neonCold },
  acid: { body: mix(PAL.toxicDark, PAL.acid, 0.26), trim: PAL.acid, glow: PAL.toxicGlow },
  blood: { body: mix(PAL.bloodDark, PAL.blood, 0.42), trim: PAL.blood, glow: PAL.neonRed },
  rubber: { body: mix(PAL.ash, PAL.steelDark, 0.4), trim: PAL.steelDark, glow: PAL.neonWarm },
  concrete: { body: mix(PAL.steel, PAL.sandDark, 0.26), trim: PAL.sand, glow: PAL.neonWarm },
  sand: { body: mix(PAL.sand, PAL.ochre, 0.35), trim: PAL.sandDark, glow: PAL.neonWarm },
  ice: { body: mix(PAL.glass, PAL.waterFoam, 0.32), trim: PAL.waterFoam, glow: PAL.signal },
  shadow: { body: mix(PAL.ash, PAL.void, 0.28), trim: PAL.ashPale, glow: PAL.neonRed },
  light: { body: mix(PAL.paper, PAL.neonWarm, 0.16), trim: PAL.white, glow: PAL.neonWarm },
}

/** 每只小怪的绘制配置（颜色 + variant/mark/eye + 稳定随机源）。 */
function makeCfg(art, seed) {
  const a = art || {}
  const motif = MOTIF[a.motif] ? a.motif : 'steel'
  const st = MOTIF[motif]
  const body = st.body
  return {
    seed,
    motif,
    v: (((a.variant | 0) % 4) + 4) % 4,
    mk: (((a.mark | 0) % 4) + 4) % 4,
    ey: (((a.eye | 0) % 3) + 3) % 3,
    body,
    bodyD: mix(body, PAL.void, 0.46),
    bodyL: mix(body, PAL.white, 0.26),
    trim: st.trim,
    glow: st.glow || PAL.neonWarm,
    warm: st.glow || PAL.neonWarm,
    outline: mix(PAL.void, body, 0.2),
    crack: mix(body, PAL.void, 0.72),
    ink: mix(PAL.void, body, 0.34),
  }
}

/* ============================================================================
 * 2. 公共零件 —— 动画相位、接地阴影、躯干/头部、眼睛、印记、材质细节
 * ========================================================================== */

/** 稳定随机源（与帧号无关，保证细节不逐帧闪烁）。 */
function srnd(C, salt = 1) {
  return mulberry32((C.seed + salt * 2654435761) >>> 0)
}

/** 步态：返回脚的水平摆动与抬脚高度（像素）。 */
function foot(P, k, n = 4, amp = 3) {
  let a = k * Math.PI
  if (P.anim === 'run' || P.anim === 'move') a += ((P.i % n) / n) * TAU
  else if (P.anim === 'attack') a += k % 2 ? 0.9 : -0.5
  else if (P.anim === 'hurt') a += -0.7
  else a += P.i % 2 ? 0.4 : -0.4
  const idle = P.anim === 'idle' ? 0.35 : 1
  return { dx: Math.sin(a) * amp * idle, lift: Math.max(0, Math.cos(a)) * amp * idle }
}

/** 呼吸 / 起伏偏移（像素，负值为向上）。 */
function breath(P, amp = 1.5) {
  if (P.dead || P.anim === 'dead') return amp
  if (P.anim === 'attack') return -amp
  if (P.anim === 'hurt') return amp * 0.8
  return (P.i % 2 ? -1 : 1) * amp * 0.5
}

/** 悬浮高度（飘浮类专用）。 */
function hover(P, amp = 2) {
  if (P.dead || P.anim === 'dead') return amp * 2
  if (P.anim === 'run') return (P.i % 2 ? -amp : 0)
  if (P.anim === 'attack') return -amp * 1.4
  return (P.i % 2 ? -amp * 0.4 : 0)
}

function isDead(P) {
  return P.dead === true || P.anim === 'dead'
}

/** 抖动接地投影。 */
function shadowOf(s, cx, rx, al = 0.45) {
  s.shadow(cx, s.h - 1.5, Math.max(3, rx), Math.max(1.6, rx * 0.2), al)
}

/** 躯干：暗底 + 主体 + 高光三层。 */
function bodyOval(s, cx, cy, rx, ry, C) {
  s.ell(cx, cy, rx, ry, C.bodyD)
  s.ell(cx, cy - ry * 0.07, rx * 0.93, ry * 0.88, C.body)
  s.ell(cx - rx * 0.2, cy - ry * 0.45, rx * 0.55, ry * 0.34, C.bodyL)
}

/** 头：比躯干更紧凑的高光比。 */
function headOval(s, cx, cy, rx, ry, C) {
  s.ell(cx, cy, rx, ry, C.bodyD)
  s.ell(cx, cy - ry * 0.08, rx * 0.87, ry * 0.84, C.body)
  s.ell(cx - rx * 0.16, cy - ry * 0.38, rx * 0.48, ry * 0.3, C.bodyL)
}

/** 肢体：暗轮廓 + 亮骨干。 */
function limb(s, x0, y0, x1, y1, r, C, taper = 0.7) {
  s.thick(x0, y0, x1, y1, Math.max(0.8, r), C.bodyD)
  s.thick(x0, y0 - r * 0.18, x1, y1 - r * 0.18, Math.max(0.6, r * taper), C.body)
}

/** 只落在剪影内的一笔（修饰细节不越界）。 */
function bodyLine(s, x0, y0, x1, y1, c, al = 1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = Math.round(x0 + (x1 - x0) * t)
    const y = Math.round(y0 + (y1 - y0) * t)
    if (s.a(x, y) >= 200) s.px(x, y, c, al)
  }
}

function bodyDot(s, x, y, c, al = 1) {
  if (s.a(Math.round(x), Math.round(y)) >= 200) s.px(x, y, c, al)
}

/** 眼睛：eye 0 单眼 / 1 双眼 / 2 三眼；attack 时更亮，dead 时闭眼。 */
function eyeSet(s, P, C, x, y, r = 2, alt = null) {
  const col = alt || C.glow
  const pulse = P.anim === 'attack' ? 1.5 : P.anim === 'run' ? 1.15 : 1
  const rr = Math.max(1, r)
  if (isDead(P)) {
    s.line(x - rr, y - 1, x + rr, y + 1, C.crack)
    s.line(x - rr, y + 1, x + rr, y - 1, C.crack)
    return
  }
  if (C.ey === 0) {
    s.disc(x, y, rr + 1, C.bodyD)
    s.disc(x, y, rr, col)
    s.disc(x + rr * 0.25, y, rr * 0.42, PAL.void)
    s.px(x - rr * 0.45, y - rr * 0.45, PAL.white)
    P.g.push({ x, y, r: rr * 4.2 * pulse, c: col, p: 0.62 })
  } else if (C.ey === 1) {
    for (const sx of [-rr * 1.7, rr * 1.7]) {
      s.disc(x + sx, y, rr * 0.72, C.bodyD)
      s.disc(x + sx, y, rr * 0.52, col)
      s.px(x + sx, y, PAL.void)
    }
    P.g.push({ x, y, r: rr * 4.6 * pulse, c: col, p: 0.5 })
  } else {
    s.disc(x, y, rr * 0.66, col)
    s.disc(x - rr * 1.5, y - rr * 0.45, rr * 0.46, col)
    s.disc(x + rr * 1.45, y + rr * 0.3, rr * 0.46, col)
    s.px(x, y, PAL.void)
    P.g.push({ x, y, r: rr * 5 * pulse, c: col, p: 0.55 })
    P.g.push({ x: x - rr * 1.5, y: y - rr * 0.45, r: rr * 2.4, c: col, p: 0.4 })
  }
}

/** 背部印记：0 爪痕 / 1 环印 / 2 脊刺 / 3 补丁板。 */
function markOf(s, C, x, y, w, h) {
  if (w < 5 || h < 4) return
  switch (C.mk) {
    case 0:
      for (let i = 0; i < 3; i++) {
        bodyLine(s, x + w * (0.18 + i * 0.2), y, x + w * (0.1 + i * 0.2), y + h, C.trim)
        bodyLine(s, x + w * (0.19 + i * 0.2), y + 1, x + w * (0.11 + i * 0.2), y + h - 1, C.trim)
      }
      break
    case 1: {
      const cx = x + w * 0.5
      const cy = y + h * 0.5
      const rx = w * 0.28
      const ry = h * 0.3
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU
        bodyDot(s, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, C.trim)
      }
      bodyDot(s, cx, cy, C.glow)
      bodyLine(s, cx - rx * 0.5, cy, cx + rx * 0.5, cy, C.trim)
      break
    }
    case 2:
      for (let i = 0; i < 4; i++) {
        const sx = x + w * (0.12 + i * 0.25)
        s.poly(
          [
            [sx - 1.4, y + h * 0.1],
            [sx + w * 0.06, y - h * 0.24],
            [sx + 1.6, y + h * 0.1],
          ],
          C.bodyD,
        )
        s.px(sx + w * 0.04, y - h * 0.2, C.trim)
      }
      break
    default:
      bodyLine(s, x + w * 0.15, y + h * 0.1, x + w * 0.85, y + h * 0.1, C.trim)
      bodyLine(s, x + w * 0.15, y + h * 0.9, x + w * 0.85, y + h * 0.9, C.trim)
      bodyLine(s, x + w * 0.85, y + h * 0.1, x + w * 0.85, y + h * 0.9, C.trim)
      for (let i = 0; i < 4; i++) bodyDot(s, x + w * (0.2 + i * 0.18), y + h * 0.1, C.ink)
      break
  }
}

/** 材质标志细节：画在传进来的躯干包围盒里，全部限制在已有剪影内。 */
function motifDetail(s, P, C, x, y, w, h) {
  const rnd = srnd(C, 73)
  const cx = x + w * 0.5
  const cy = y + h * 0.5
  switch (C.motif) {
    case 'chitin': {
      // 甲壳：三道弧形背缝 + 边缘硬高光
      for (let i = 0; i < 3; i++) {
        const yy = y + h * (0.24 + i * 0.22)
        bodyLine(s, x + w * 0.12, yy, x + w * 0.88, yy - h * 0.07, C.crack)
        bodyLine(s, x + w * 0.14, yy - 1, x + w * 0.82, yy - h * 0.07 - 1, C.bodyL)
      }
      bodyLine(s, x + w * 0.16, y + h * 0.3, x + w * 0.3, y + h * 0.72, C.crack)
      break
    }
    case 'rust': {
      // 锈蚀：剥落斑块 + 掉漆边
      for (let i = 0; i < 8; i++) {
        const px = x + rnd() * w
        const py = y + rnd() * h
        bodyDot(s, px, py, rnd() < 0.5 ? PAL.rustDark : PAL.rustLight)
        if (rnd() < 0.5) bodyDot(s, px + 1, py, PAL.rustDeep)
      }
      for (let i = 0; i < 3; i++) {
        bodyLine(s, x + rnd() * w * 0.6, y + rnd() * h, x + w * (0.4 + rnd() * 0.5), y + rnd() * h, PAL.rustDark)
      }
      break
    }
    case 'flesh': {
      // 活肉：血管分叉 + 湿亮反光
      const vx = cx + (rnd() - 0.5) * w * 0.4
      for (let i = 0; i < 3; i++) {
        const yy = y + h * (0.2 + i * 0.2)
        bodyLine(s, vx - w * 0.2, yy, vx + w * 0.24, yy + h * 0.1, PAL.blood)
        bodyLine(s, vx + w * 0.02, yy + h * 0.04, vx + w * 0.16, yy + h * 0.22, PAL.bloodDark)
      }
      for (let i = 0; i < 5; i++) bodyDot(s, x + rnd() * w, y + rnd() * h, PAL.white, 0.75)
      break
    }
    case 'cloth': {
      // 破布：补丁 + 缝线
      bodyLine(s, x + w * 0.3, y + h * 0.2, x + w * 0.7, y + h * 0.2, C.crack)
      bodyLine(s, x + w * 0.3, y + h * 0.2, x + w * 0.3, y + h * 0.6, C.crack)
      bodyLine(s, x + w * 0.7, y + h * 0.2, x + w * 0.7, y + h * 0.6, C.crack)
      bodyLine(s, x + w * 0.3, y + h * 0.6, x + w * 0.7, y + h * 0.6, C.crack)
      for (let i = 0; i < 5; i++) bodyDot(s, x + w * (0.34 + i * 0.08), y + h * 0.2, C.trim)
      for (let i = 0; i < 4; i++) bodyDot(s, x + w * (0.31 + i * 0.1), y + h * 0.58, C.trim)
      break
    }
    case 'paper': {
      // 纸张：横向印刷线 + 印章
      for (let i = 0; i < 4; i++) {
        bodyLine(s, x + w * 0.16, y + h * (0.24 + i * 0.16), x + w * 0.74, y + h * (0.24 + i * 0.16), PAL.ink, 0.8)
      }
      bodyLine(s, x + w * 0.62, y + h * 0.66, x + w * 0.8, y + h * 0.66, PAL.danger)
      bodyLine(s, x + w * 0.62, y + h * 0.72, x + w * 0.8, y + h * 0.72, PAL.danger)
      break
    }
    case 'steel': {
      // 钢板：板缝 + 铆钉排
      bodyLine(s, x + w * 0.5, y + h * 0.12, x + w * 0.5, y + h * 0.88, C.crack)
      for (let i = 0; i < 3; i++) bodyDot(s, x + w * 0.22, y + h * (0.24 + i * 0.24), PAL.steelLight)
      for (let i = 0; i < 3; i++) bodyDot(s, x + w * 0.78, y + h * (0.24 + i * 0.24), PAL.steelDark)
      bodyLine(s, x + w * 0.1, y + h * 0.82, x + w * 0.9, y + h * 0.82, PAL.steelWhite, 0.6)
      break
    }
    case 'water': {
      // 积水：气泡 + 下淌水痕
      for (let i = 0; i < 4; i++) {
        const px = x + w * (0.2 + rnd() * 0.6)
        const py = y + h * (0.2 + rnd() * 0.5)
        bodyDot(s, px, py, PAL.waterFoam)
        bodyDot(s, px + w * 0.08, py + h * 0.3, PAL.waterFoam, 0.8)
      }
      for (let i = 0; i < 3; i++) {
        const px = x + w * (0.25 + i * 0.2)
        bodyLine(s, px, y + h * 0.45, px, y + h * 0.85, PAL.waterHi, 0.7)
      }
      break
    }
    case 'fire': {
      // 火：体表余烬 + 向上飘的火星
      for (let i = 0; i < 5; i++) {
        const px = x + w * (0.2 + rnd() * 0.6)
        const py = y + h * (0.3 + rnd() * 0.5)
        bodyDot(s, px, py, PAL.rustHot)
        bodyDot(s, px, py - 1, PAL.neonWarm, 0.7)
      }
      for (let i = 0; i < 6; i++) {
        const px = x + w * (0.2 + rnd() * 0.6)
        const py = y - h * 0.1 - rnd() * h * 0.35
        s.px(px, py, i % 2 ? PAL.neonWarm : PAL.rustHot, 0.9)
      }
      P.g.push({ x: cx, y: cy, r: w * 0.4, c: PAL.neonWarm, p: 0.3 })
      break
    }
    case 'circuit': {
      // 电路：荧光走线 + 焊盘节点
      const y1 = y + h * 0.38
      const y2 = y + h * 0.62
      bodyLine(s, x + w * 0.12, y1, x + w * 0.45, y1, PAL.neon, 0.9)
      bodyLine(s, x + w * 0.45, y1, x + w * 0.45, y2, PAL.neon, 0.9)
      bodyLine(s, x + w * 0.45, y2, x + w * 0.86, y2, PAL.neon, 0.9)
      bodyLine(s, x + w * 0.3, y1, x + w * 0.3, y + h * 0.18, PAL.neon, 0.7)
      for (const [gx, gy] of [[0.12, 0.38], [0.45, 0.38], [0.45, 0.62], [0.86, 0.62], [0.3, 0.18]]) {
        bodyDot(s, x + w * gx, y + h * gy, PAL.neonCold)
        bodyDot(s, x + w * gx, y + h * gy, PAL.white)
      }
      P.g.push({ x: x + w * 0.47, y: y + h * 0.5, r: w * 0.34, c: PAL.neon, p: 0.45 })
      break
    }
    case 'electric': {
      // 电弧：折线闪电 + 端点火花
      let px = x + w * 0.2
      let py = y + h * 0.2
      for (let i = 0; i < 5; i++) {
        const nx = px + w * (0.12 + rnd() * 0.06)
        const ny = py + h * (rnd() < 0.5 ? 0.16 : 0.06)
        bodyLine(s, px, py, nx, ny, PAL.signal)
        px = nx
        py = ny
      }
      bodyDot(s, px, py, PAL.white)
      bodyDot(s, x + w * 0.2, y + h * 0.2, PAL.neonCold)
      P.g.push({ x: x + w * 0.5, y: y + h * 0.4, r: w * 0.32, c: PAL.signal, p: 0.4 })
      break
    }
    case 'ash': {
      // 灰烬：结壳焦斑 + 裂纹
      for (let i = 0; i < 9; i++) bodyDot(s, x + rnd() * w, y + rnd() * h, rnd() < 0.5 ? PAL.void : PAL.ashPale)
      bodyLine(s, x + w * 0.2, y + h * 0.3, x + w * 0.4, y + h * 0.45, PAL.ashPale)
      bodyLine(s, x + w * 0.4, y + h * 0.45, x + w * 0.5, y + h * 0.3, PAL.void)
      break
    }
    case 'glass': {
      // 玻璃：内部碎片高光 + 折射亮边
      for (let i = 0; i < 3; i++) {
        const gx = x + w * (0.24 + i * 0.2)
        const gy = y + h * (0.3 + (i % 2) * 0.24)
        bodyLine(s, gx, gy, gx + w * 0.16, gy - h * 0.1, PAL.waterFoam)
        bodyLine(s, gx + w * 0.16, gy - h * 0.1, gx + w * 0.12, gy + h * 0.12, PAL.white, 0.6)
      }
      bodyLine(s, x + w * 0.12, y + h * 0.2, x + w * 0.2, y + h * 0.5, PAL.white, 0.55)
      P.g.push({ x: cx, y: cy, r: w * 0.3, c: PAL.signal, p: 0.22 })
      break
    }
    case 'wood': {
      // 木：顺纹 + 结疤
      for (let i = 0; i < 4; i++) {
        const yy = y + h * (0.2 + i * 0.18)
        bodyLine(s, x + w * 0.14, yy, x + w * 0.5, yy + h * 0.03, C.crack, 0.8)
        bodyLine(s, x + w * 0.5, yy + h * 0.03, x + w * 0.86, yy - h * 0.02, C.crack, 0.7)
      }
      bodyDot(s, x + w * 0.6, y + h * 0.5, PAL.rustDeep)
      bodyDot(s, x + w * 0.6, y + h * 0.52, PAL.sandDark)
      break
    }
    case 'heat': {
      // 余热：发红接缝 + 上方热浪点
      bodyLine(s, x + w * 0.18, y + h * 0.55, x + w * 0.82, y + h * 0.55, PAL.rustHot, 0.9)
      bodyLine(s, x + w * 0.18, y + h * 0.58, x + w * 0.82, y + h * 0.58, PAL.neonWarm, 0.6)
      for (let i = 0; i < 4; i++) s.px(x + w * (0.2 + i * 0.2), y - h * 0.08 - (i % 2) * 2, PAL.neonWarm, 0.5)
      P.g.push({ x: cx, y: y + h * 0.55, r: w * 0.36, c: PAL.neonWarm, p: 0.3 })
      break
    }
    case 'fuel': {
      // 燃料：危险条纹 + 阀门
      for (let i = 0; i < 3; i++) bodyLine(s, x + w * (0.24 + i * 0.14), y + h * 0.3, x + w * (0.32 + i * 0.14), y + h * 0.7, PAL.ochre)
      bodyLine(s, x + w * 0.6, y + h * 0.7, x + w * 0.86, y + h * 0.7, C.crack)
      bodyDot(s, x + w * 0.76, y + h * 0.62, PAL.steelLight)
      bodyDot(s, x + w * 0.76, y + h * 0.63, PAL.void)
      break
    }
    case 'radar': {
      // 雷达：同心弧 + 扫描点
      for (let i = 0; i < 3; i++) {
        const rr = w * (0.12 + i * 0.1)
        for (let a = -1.1; a <= 1.1; a += 0.3) {
          bodyDot(s, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, PAL.signal, 0.85)
        }
      }
      bodyDot(s, cx + w * 0.1, cy - h * 0.05, PAL.white)
      P.g.push({ x: cx, y: cy, r: w * 0.3, c: PAL.signal, p: 0.3 })
      break
    }
    case 'satellite': {
      // 卫星：碟形环 + 信号刻度
      const rr = w * 0.2
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU
        bodyDot(s, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, PAL.neonCold)
      }
      for (let i = 0; i < 3; i++) bodyDot(s, x + w * 0.8, y + h * (0.2 + i * 0.12), PAL.signal)
      bodyDot(s, cx, cy, PAL.white)
      P.g.push({ x: cx, y: cy, r: w * 0.26, c: PAL.signal, p: 0.4 })
      break
    }
    case 'fur': {
      // 毛：短毛流 + 深色底绒
      for (let i = 0; i < 12; i++) {
        const px = x + w * (0.14 + rnd() * 0.72)
        const py = y + h * (0.2 + rnd() * 0.6)
        bodyLine(s, px, py, px + w * 0.06, py + h * 0.07, rnd() < 0.5 ? C.crack : C.bodyL)
      }
      for (let i = 0; i < 6; i++) {
        const px = x + w * (0.16 + i * 0.1)
        bodyDot(s, px, y + h * 0.28, PAL.sand, 0.8)
      }
      break
    }
    case 'bone': {
      // 骨：肋骨弧 + 关节
      for (let i = 0; i < 3; i++) {
        const yy = y + h * (0.3 + i * 0.18)
        bodyLine(s, x + w * 0.22, yy, x + w * 0.6, yy + h * 0.06, PAL.bone)
        bodyLine(s, x + w * 0.6, yy + h * 0.06, x + w * 0.8, yy, PAL.boneDark)
      }
      bodyDot(s, x + w * 0.2, y + h * 0.3, PAL.boneDeep)
      break
    }
    case 'toxic': {
      // 毒：鼓胀毒疱 + 绿光
      for (let i = 0; i < 4; i++) {
        const px = x + w * (0.22 + rnd() * 0.56)
        const py = y + h * (0.24 + rnd() * 0.5)
        s.disc(px, py, 1.8, PAL.toxicDark)
        s.disc(px, py, 1.2, PAL.toxic)
        s.px(px - 0.4, py - 0.6, PAL.toxicGlow)
      }
      P.g.push({ x: cx, y: cy, r: w * 0.34, c: PAL.toxicGlow, p: 0.3 })
      break
    }
    case 'moss': {
      // 苔：成片绿绒 + 孢子
      for (let i = 0; i < 14; i++) {
        const px = x + rnd() * w
        const py = y + h * (0.2 + rnd() * 0.6)
        bodyDot(s, px, py, rnd() < 0.5 ? PAL.weed : PAL.mossDead)
        if (rnd() < 0.4) bodyDot(s, px, py - 1, PAL.toxicDark)
      }
      break
    }
    case 'oil': {
      // 油：斜向亮油膜 + 滴落
      for (let i = 0; i < 3; i++) {
        bodyLine(s, x + w * (0.2 + i * 0.2), y + h * 0.25, x + w * (0.3 + i * 0.2), y + h * 0.72, PAL.oilSheen, 0.8)
      }
      bodyLine(s, x + w * 0.5, y + h * 0.7, x + w * 0.54, y + h * 0.92, PAL.oil, 0.9)
      bodyDot(s, x + w * 0.72, y + h * 0.4, PAL.neonCold, 0.6)
      break
    }
    case 'acid': {
      // 酸：腐蚀孔 + 亮酸滴
      for (let i = 0; i < 4; i++) {
        const px = x + w * (0.24 + rnd() * 0.5)
        const py = y + h * (0.3 + rnd() * 0.45)
        bodyDot(s, px, py, PAL.acid)
        bodyDot(s, px, py - 1, PAL.toxicGlow)
      }
      bodyLine(s, x + w * 0.2, y + h * 0.6, x + w * 0.4, y + h * 0.68, PAL.toxicDark)
      P.g.push({ x: cx, y: cy, r: w * 0.26, c: PAL.toxicGlow, p: 0.25 })
      break
    }
    case 'blood': {
      // 血：喷溅点 + 下淌
      for (let i = 0; i < 8; i++) {
        const px = x + rnd() * w
        const py = y + h * (0.25 + rnd() * 0.5)
        bodyDot(s, px, py, rnd() < 0.6 ? PAL.blood : PAL.bloodDark)
      }
      bodyLine(s, x + w * 0.55, y + h * 0.42, x + w * 0.55, y + h * 0.8, PAL.blood, 0.9)
      bodyLine(s, x + w * 0.7, y + h * 0.5, x + w * 0.7, y + h * 0.72, PAL.bloodDark, 0.9)
      break
    }
    case 'rubber': {
      // 橡胶：横向胎纹 + 哑光边
      for (let i = 0; i < 4; i++) {
        bodyLine(s, x + w * 0.14, y + h * (0.24 + i * 0.16), x + w * 0.86, y + h * (0.24 + i * 0.16), C.crack, 0.8)
      }
      bodyLine(s, x + w * 0.16, y + h * 0.2, x + w * 0.84, y + h * 0.2, PAL.ashPale, 0.55)
      break
    }
    case 'concrete': {
      // 混凝土：龟裂 + 粉尘
      bodyLine(s, x + w * 0.3, y + h * 0.15, x + w * 0.36, y + h * 0.42, C.crack)
      bodyLine(s, x + w * 0.36, y + h * 0.42, x + w * 0.26, y + h * 0.6, C.crack)
      bodyLine(s, x + w * 0.36, y + h * 0.42, x + w * 0.62, y + h * 0.5, C.crack)
      bodyLine(s, x + w * 0.62, y + h * 0.5, x + w * 0.8, y + h * 0.44, C.crack)
      for (let i = 0; i < 5; i++) bodyDot(s, x + rnd() * w, y + rnd() * h, PAL.sand, 0.6)
      break
    }
    case 'sand': {
      // 沙：粗颗粒 + 风蚀脊
      for (let i = 0; i < 10; i++) bodyDot(s, x + rnd() * w, y + rnd() * h, rnd() < 0.5 ? PAL.sandDark : PAL.ochre)
      for (let i = 0; i < 3; i++) {
        bodyLine(s, x + w * 0.18, y + h * (0.3 + i * 0.2), x + w * 0.8, y + h * (0.24 + i * 0.2), PAL.sandDark, 0.7)
      }
      break
    }
    case 'ice': {
      // 冰：霜晶尖刺 + 冷亮面
      for (let i = 0; i < 3; i++) {
        const px = x + w * (0.24 + i * 0.2)
        const py = y + h * (0.35 + (i % 2) * 0.2)
        bodyLine(s, px, py, px + w * 0.05, py - h * 0.14, PAL.waterFoam)
        bodyLine(s, px + w * 0.05, py - h * 0.14, px + w * 0.1, py, PAL.white, 0.7)
      }
      bodyLine(s, x + w * 0.2, y + h * 0.16, x + w * 0.36, y + h * 0.3, PAL.white, 0.55)
      P.g.push({ x: cx, y: cy, r: w * 0.3, c: PAL.signal, p: 0.2 })
      break
    }
    case 'shadow': {
      // 影：剪影破边 + 稀薄暗雾
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1
        const px = cx + side * w * (0.3 + rnd() * 0.18)
        const py = y + h * (0.15 + rnd() * 0.7)
        if (s.a(Math.round(px), Math.round(py)) >= 200 && !s.nearSolid(Math.round(px), Math.round(py), 0)) {
          s.set(px | 0, py | 0, PAL.void, 0)
        }
      }
      for (let i = 0; i < 4; i++) {
        const px = x + rnd() * w
        s.px(px, y + h * 0.1 + rnd() * h, PAL.void, 0.9)
      }
      P.g.push({ x: cx, y: cy, r: w * 0.22, c: PAL.neonRed, p: 0.18 })
      break
    }
    case 'light': {
      // 光：内缘高光 + 光晕
      bodyLine(s, x + w * 0.18, y + h * 0.2, x + w * 0.82, y + h * 0.2, PAL.white, 0.8)
      bodyLine(s, x + w * 0.16, y + h * 0.3, x + w * 0.16, y + h * 0.7, PAL.white, 0.6)
      for (let i = 0; i < 4; i++) bodyDot(s, x + w * (0.3 + i * 0.12), y + h * 0.45, PAL.neonWarm, 0.7)
      P.g.push({ x: cx, y: cy, r: w * 0.5, c: PAL.neonWarm, p: 0.4 })
      break
    }
    default: {
      // 未知 motif：无害的板缝 + 高光
      bodyLine(s, x + w * 0.2, y + h * 0.4, x + w * 0.8, y + h * 0.4, C.crack, 0.7)
      bodyLine(s, x + w * 0.2, y + h * 0.6, x + w * 0.8, y + h * 0.6, C.bodyL, 0.7)
      break
    }
  }
}

/* ----------------------------------------------------------------------------
 * 剪影修饰层 —— 背脊 / 尖刺 / 角 / 刃片
 * 每只小怪由自己的 seed 决定数量、间距、高度与形状，直接长在剪影上缘，
 * 让同 plan/sub 的个体也拥有互不相同的 idle 轮廓（不是换色换皮）。
 * -------------------------------------------------------------------------- */

/** 每列最上方的实心像素（跳过最底部 2 行接地投影）。 */
function topProfile(s) {
  const tops = new Array(s.w).fill(-1)
  const yEnd = Math.max(1, s.h - 2)
  for (let x = 0; x < s.w; x++) {
    for (let y = 0; y < yEnd; y++) {
      if (s.a(x, y) >= 200) {
        tops[x] = y
        break
      }
    }
  }
  return tops
}

function silhouetteFlair(s, C, plan) {
  const tops = topProfile(s)
  let x0 = -1
  let x1 = -1
  for (let x = 0; x < s.w; x++) {
    if (tops[x] >= 0) {
      if (x0 < 0) x0 = x
      x1 = x
    }
  }
  if (x0 < 0 || x1 - x0 < 6) return
  const r = srnd(C, 11)
  const span = x1 - x0
  // 锚点取轮廓最高处附近：冠饰长在背上，不会落到腿脚或尾巴尖
  let peak = x0
  for (let x = x0; x <= x1; x++) {
    if (tops[x] >= 0 && tops[x] < tops[peak]) peak = x
  }
  const style = plan === 'mech' ? 'blade' : plan === 'statue' ? 'shard' : plan === 'blob' ? 'nub' : 'spike'
  const count = 2 + Math.floor(r() * 4) // 2..5 根
  const step = 2 + Math.floor(r() * 3) // 2..4 px
  const off = Math.floor(r() * 3)
  let bx = Math.round(peak - span * 0.18 + off - count * step * 0.5)
  bx = Math.max(x0, Math.min(x1, bx))
  for (let i = 0; i < count; i++) {
    const x = Math.round(bx + i * step)
    if (x < x0 || x > x1) continue
    const ty = tops[x]
    if (ty < 3) continue
    const hgt = 1 + Math.floor(r() * 5) // 1..5 px
    const halfW = style === 'blade' ? 1 : 1 + (r() < 0.35 ? 1 : 0)
    const tipY = Math.max(3, ty - hgt) // 顶端留 3px，粗线/圆头也不会顶到第 0 行
    if (style === 'nub') {
      const nr = Math.max(0.7, Math.min(2.2, hgt * 0.55))
      const ny = Math.max(nr + 1.6, ty - hgt * 0.45)
      s.line(x, ty + 1, x, ny, C.bodyD)
      s.ell(x, ny, halfW + 0.6, nr, C.bodyD)
      s.px(x, Math.max(2, ny - nr), C.trim)
    } else if (style === 'blade') {
      s.thick(x, ty + 1, x + (r() < 0.5 ? -1 : 1), tipY, Math.max(0.8, halfW * 0.6), C.bodyD)
      s.px(x, tipY, C.trim)
    } else {
      // 先补一条从躯体长出的芯，保证针状尖刺不会与剪影断开
      s.line(x, ty + 2, x, tipY, C.bodyD)
      s.poly(
        [
          [x - halfW, ty + 2],
          [x + halfW, ty + 2],
          [x + (style === 'shard' && i % 2 ? 1 : 0), tipY],
        ],
        C.bodyD,
      )
      s.px(x, tipY, C.trim)
    }
  }
}

/* ============================================================================
 * 4. 48 种剪影 —— 12 plan × 4 sub
 * ========================================================================== */

/* ------------------------------- quad ---------------------------------- */

/** 猎犬：细长躯干、低垂长吻、后折耳、细尾。 */
function quadHound(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.44
  const bw = s.w * (0.30 + (v === 1 ? 0.035 : v === 3 ? -0.025 : 0))
  const bh = s.h * (0.16 + (v === 3 ? 0.04 : 0))
  const cy = g - (dead ? bh * 0.72 : s.h * 0.31)
  const lift = dead ? 0 : breath(P, 1.2)
  shadowOf(s, cx, bw * 1.45, 0.45)
  // 四腿：前二后二，交替步态
  for (let k = 0; k < 4; k++) {
    const back = k > 1
    const lx = cx + (back ? -bw * 0.7 : bw * 0.42) + (k % 2 ? bw * 0.3 : -bw * 0.04)
    const f = dead ? { dx: 0, lift: 0 } : foot(P, k, 4, 3 + (v === 1 ? 1 : 0))
    const hipY = cy + bh * 0.55
    const kneeY = (hipY + g) * 0.52
    const footY = g - 1 - f.lift
    s.thick(lx, hipY, lx + f.dx * 0.3, kneeY, Math.max(1, bh * 0.2), C.bodyD)
    s.thick(lx + f.dx * 0.3, kneeY, lx + f.dx, footY, Math.max(0.8, bh * 0.16), C.body)
    s.px(lx + f.dx, footY, C.crack)
  }
  // 躯干：细长，胸前收
  s.ell(cx, cy + lift, bw * 1.24, bh, C.bodyD)
  s.ell(cx, cy - 1 + lift, bw * 1.15, bh * 0.85, C.body)
  s.ell(cx - bw * 0.22, cy - bh * 0.45 + lift, bw * 0.72, bh * 0.34, C.bodyL)
  // 颈
  limb(s, cx + bw * 0.7, cy - bh * 0.2 + lift, cx + bw * 0.96, cy - bh * 0.28 + lift, bh * (v === 3 ? 0.4 : 0.28), C, 0.8)
  // 头 + 长吻
  const hx = cx + bw * (1.1 + v * 0.03)
  const hy = cy - bh * (dead ? -0.55 : 0.28) + lift * 0.5
  s.ell(hx, hy, bw * 0.38, bh * 0.42, C.bodyD)
  s.ell(hx + 1, hy - 1, bw * 0.32, bh * 0.34, C.body)
  const sn = bw * (0.4 + (v % 2) * 0.1)
  s.poly(
    [
      [hx + bw * 0.05, hy - bh * 0.24],
      [hx + sn, hy - bh * 0.04],
      [hx + sn - 1, hy + bh * 0.18],
      [hx + bw * 0.05, hy + bh * 0.26],
    ],
    C.bodyD,
  )
  s.px(hx + sn - 2, hy, C.crack)
  // 耳：v1 竖立，其余后折
  if (v === 1) {
    s.poly([[hx - bw * 0.2, hy - bh * 0.28], [hx - bw * 0.12, hy - bh * 0.95], [hx + bw * 0.02, hy - bh * 0.3]], C.bodyD)
  } else {
    s.poly([[hx - bw * 0.3, hy - bh * 0.2], [hx - bw * 0.56, hy - bh * 0.62], [hx - bw * 0.12, hy - bh * 0.34]], C.bodyD)
  }
  eyeSet(s, P, C, hx + bw * 0.1, hy - bh * 0.14, Math.max(1.3, bh * 0.2))
  // 尾
  const tx = cx - bw * 0.9
  s.thick(tx, cy - bh * 0.2, tx - bw * 0.22, cy - bh * (v === 2 ? 1.15 : 0.42), Math.max(0.8, bh * 0.13), C.bodyD)
  s.px(tx - bw * 0.22, cy - bh * (v === 2 ? 1.15 : 0.42), C.trim)
  markOf(s, C, cx - bw * 0.5, cy - bh * 0.9, bw * 0.9, bh * 1.1)
  motifDetail(s, P, C, cx - bw * 1.1, cy - bh * 1.1, bw * 2.1, bh * 2)
}

/** 野猪：驼峰高耸、短腿、鼻盘、上翘獠牙、硬鬃。 */
function quadBoar(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.47
  const bw = s.w * (0.3 + (v === 2 ? 0.03 : 0))
  const bh = s.h * (0.17 + (v === 3 ? 0.035 : 0))
  const cy = g - (dead ? bh * 0.7 : s.h * 0.29)
  const lift = dead ? 0 : breath(P, 1.1)
  shadowOf(s, cx, bw * 1.4, 0.5)
  for (let k = 0; k < 4; k++) {
    const back = k > 1
    const lx = cx + (back ? -bw * 0.6 : bw * 0.5) + (k % 2 ? bw * 0.2 : 0)
    const f = dead ? { dx: 0, lift: 0 } : foot(P, k, 4, 2.3)
    const footY = g - 1 - f.lift
    limb(s, lx, cy + bh * 0.45, lx + f.dx, footY, Math.max(1, bh * 0.26), C, 0.85)
    s.px(lx + f.dx, footY, C.crack)
  }
  // 躯干 + 肩峰
  s.ell(cx, cy + lift, bw * 1.28, bh, C.bodyD)
  s.ell(cx, cy - 1 + lift, bw * 1.2, bh * 0.86, C.body)
  s.ell(cx - bw * 0.12, cy - bh * 0.7 + lift, bw * 0.75, bh * 0.58, C.bodyD)
  s.ell(cx - bw * 0.12, cy - bh * 0.74 + lift, bw * 0.66, bh * 0.5, C.body)
  // 硬鬃
  for (let i = 0; i < 7; i++) {
    const bx = cx - bw * 0.8 + i * bw * 0.24
    const by = cy - bh * (0.72 + Math.sin((i / 6) * Math.PI) * 0.4) + lift
    s.line(bx, by, bx + bw * 0.05, by - bh * (0.28 + (i % 2) * 0.1), C.crack)
    s.px(bx + bw * 0.05, by - bh * 0.34, C.trim)
  }
  // 头低垂 + 鼻盘
  const hx = cx + bw * 0.92
  const hy = cy + (dead ? bh * 0.55 : -bh * 0.02) + lift * 0.6
  s.ell(hx, hy, bw * 0.36, bh * 0.44, C.bodyD)
  s.ell(hx + 1, hy, bw * 0.3, bh * 0.37, C.body)
  s.poly(
    [
      [hx + bw * 0.08, hy - bh * 0.2],
      [hx + bw * 0.4, hy - bh * 0.08],
      [hx + bw * 0.4, hy + bh * 0.2],
      [hx + bw * 0.08, hy + bh * 0.22],
    ],
    C.bodyD,
  )
  s.ell(hx + bw * 0.38, hy + bh * 0.06, 2.4, 2.1, C.crack)
  s.px(hx + bw * 0.33, hy + bh * 0.02, PAL.void)
  s.px(hx + bw * 0.42, hy + bh * 0.02, PAL.void)
  // 獠牙
  s.poly([[hx + bw * 0.22, hy + bh * 0.2], [hx + bw * 0.3, hy - bh * 0.08], [hx + bw * 0.34, hy + bh * 0.16]], PAL.bone)
  s.poly([[hx + bw * 0.11, hy + bh * 0.24], [hx + bw * 0.2, hy - bh * 0.04], [hx + bw * 0.25, hy + bh * 0.2]], PAL.boneDark)
  eyeSet(s, P, C, hx - bw * 0.02, hy - bh * 0.18, Math.max(1.2, bh * 0.16))
  // 短尾
  s.line(cx - bw * 1.18, cy - bh * 0.1, cx - bw * 1.34, cy - bh * 0.48, C.bodyD)
  s.px(cx - bw * 1.34, cy - bh * 0.48, C.trim)
  markOf(s, C, cx - bw * 0.6, cy - bh * 1.0, bw * 1.0, bh * 1.0)
  motifDetail(s, P, C, cx - bw * 1.15, cy - bh * 1.15, bw * 2.2, bh * 2)
}

/** 猫科：后臀饱满、肩窄、长尾上卷、三角耳、收紧的腰。 */
function quadFeline(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.45
  const bw = s.w * (0.25 + (v === 1 ? 0.04 : v === 3 ? -0.02 : 0))
  const bh = s.h * (0.15 + (v === 2 ? 0.03 : 0))
  const cy = g - (dead ? bh * 0.85 : s.h * 0.30)
  const lift = dead ? 0 : breath(P, 1)
  shadowOf(s, cx, bw * 1.35, 0.42)
  // 四条细腿（后腿更粗）
  for (let k = 0; k < 4; k++) {
    const back = k > 1
    const lx = cx + (back ? -bw * 0.62 : bw * 0.5) + (k % 2 ? bw * 0.24 : -bw * 0.04)
    const f = dead ? { dx: 0, lift: 0 } : foot(P, k, 4, 2.8)
    const hipY = cy + bh * (back ? 0.5 : 0.4)
    const footY = g - 1 - f.lift
    s.thick(lx, hipY, lx + f.dx * 0.4, footY - bh * 0.3, Math.max(1, bh * (back ? 0.26 : 0.2)), C.bodyD)
    s.thick(lx + f.dx * 0.4, footY - bh * 0.3, lx + f.dx, footY, Math.max(0.8, bh * 0.15), C.body)
    // 圆脚掌
    s.disc(lx + f.dx, footY - 0.5, Math.max(1, bh * 0.14), C.bodyD)
  }
  // 后臀大椭圆 + 肩部小椭圆
  s.ell(cx - bw * 0.55, cy + lift, bw * 0.78, bh * 1.05, C.bodyD)
  s.ell(cx - bw * 0.55, cy - 1 + lift, bw * 0.7, bh * 0.95, C.body)
  s.ell(cx + bw * 0.6, cy + lift, bw * 0.66, bh * 0.8, C.bodyD)
  s.ell(cx + bw * 0.6, cy - 1 + lift, bw * 0.58, bh * 0.72, C.body)
  // 连接背脊
  s.ell(cx, cy + lift, bw * 1.0, bh * 0.7, C.bodyD)
  s.ell(cx, cy - 1 + lift, bw * 0.94, bh * 0.6, C.body)
  s.ell(cx - bw * 0.35, cy - bh * 0.5 + lift, bw * 0.6, bh * 0.24, C.bodyL)
  // 长尾：向上卷
  const tx = cx - bw * 1.2
  s.thick(tx, cy + bh * 0.1, tx - bw * 0.32, cy - bh * (v === 2 ? 1.6 : 0.8), Math.max(0.8, bh * 0.13), C.bodyD)
  s.thick(tx - bw * 0.32, cy - bh * (v === 2 ? 1.6 : 0.8), tx - bw * 0.05, cy - bh * (v === 2 ? 1.75 : 1.1), Math.max(0.7, bh * 0.11), C.bodyD)
  s.px(tx - bw * 0.05, cy - bh * (v === 2 ? 1.75 : 1.1), C.trim)
  // 圆头 + 三角形耳
  const hx = cx + bw * 1.18
  const hy = cy - bh * (dead ? -0.6 : 0.12) + lift * 0.5
  headOval(s, hx, hy, bw * 0.44, bh * 0.46, C)
  for (const ex of [-bw * 0.26, bw * 0.24]) {
    s.poly([[hx + ex - bw * 0.12, hy - bh * 0.3], [hx + ex, hy - bh * 0.86], [hx + ex + bw * 0.14, hy - bh * 0.3]], C.bodyD)
    s.px(hx + ex, hy - bh * 0.7, C.trim)
  }
  // 短吻 + 胡须
  s.poly([[hx + bw * 0.2, hy + bh * 0.1], [hx + bw * 0.5, hy + bh * 0.2], [hx + bw * 0.2, hy + bh * 0.34]], C.bodyD)
  for (let i = 0; i < 3; i++) s.line(hx + bw * 0.35, hy + bh * 0.18, hx + bw * 0.36 + i * 2, hy + bh * (0.05 + i * 0.12), PAL.steelWhite, 0.5)
  eyeSet(s, P, C, hx + bw * 0.08, hy - bh * 0.1, Math.max(1.2, bh * 0.17))
  markOf(s, C, cx - bw * 1.0, cy - bh * 0.85, bw * 1.4, bh * 0.9)
  motifDetail(s, P, C, cx - bw * 1.0, cy - bh * 1.0, bw * 2.0, bh * 1.7)
}

/** 鼹鼠：桶状身体、巨大铲爪、埋进肩里的头、粉色鼻。 */
function quadMole(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.44
  const bw = s.w * (0.30 + (v === 3 ? 0.04 : 0))
  const bh = s.h * (0.19 + (v === 2 ? 0.02 : 0))
  const cy = g - (dead ? bh * 0.7 : s.h * 0.27)
  const lift = dead ? 0 : breath(P, 1)
  shadowOf(s, cx, bw * 1.4, 0.5)
  // 后腿：短粗
  for (let k = 0; k < 2; k++) {
    const lx = cx - bw * (0.5 + k * 0.35)
    const f = dead ? { dx: 0, lift: 0 } : foot(P, k + 2, 4, 2)
    limb(s, lx, cy + bh * 0.5, lx + f.dx, g - 1 - f.lift, Math.max(1.2, bh * 0.3), C, 0.9)
  }
  // 桶状躯干
  s.ell(cx, cy + lift, bw * 1.3, bh, C.bodyD)
  s.ell(cx, cy - 1 + lift, bw * 1.22, bh * 0.88, C.body)
  s.ell(cx - bw * 0.2, cy - bh * 0.45 + lift, bw * 0.72, bh * 0.36, C.bodyL)
  // 巨大肩隆起
  s.ell(cx + bw * 0.5, cy - bh * 0.28 + lift, bw * 0.6, bh * 0.62, C.bodyD)
  s.ell(cx + bw * 0.5, cy - bh * 0.32 + lift, bw * 0.52, bh * 0.54, C.body)
  // 前爪：三根大铲齿
  const fx = cx + bw * 0.95
  const fy = g - (dead ? 1 : s.h * 0.16)
  for (let k = 0; k < 3; k++) {
    const a = -0.35 + k * 0.32
    s.poly(
      [
        [fx - bw * 0.1, fy - bh * 0.2],
        [fx + Math.cos(a) * bw * (0.7 + (v === 1 ? 0.15 : 0)), fy + Math.sin(a) * bh * 0.7 + bh * 0.35],
        [fx - bw * 0.05, fy + bh * 0.35],
      ],
      k === 1 ? C.trim : C.bodyD,
    )
  }
  limb(s, cx + bw * 0.4, cy - bh * 0.2, fx - bw * 0.1, fy - bh * 0.1, Math.max(1.4, bh * 0.34), C, 0.9)
  // 小头（几乎埋进肩里）
  const hx = cx + bw * 1.12
  const hy = cy - bh * (dead ? -0.4 : 0.2) + lift
  headOval(s, hx, hy, bw * 0.26, bh * 0.3, C)
  s.ell(hx + bw * 0.24, hy + bh * 0.08, 2.2, 2, PAL.rustLight)
  s.px(hx + bw * 0.24, hy + bh * 0.08, PAL.void)
  eyeSet(s, P, C, hx + bw * 0.02, hy - bh * 0.1, Math.max(1, bh * 0.11))
  // 裸尾
  s.thick(cx - bw * 1.25, cy, cx - bw * 1.6, cy + bh * 0.35, Math.max(0.7, bh * 0.1), C.crack)
  markOf(s, C, cx - bw * 0.8, cy - bh * 1.0, bw * 1.2, bh * 1.0)
  motifDetail(s, P, C, cx - bw * 1.2, cy - bh * 1.1, bw * 2.2, bh * 1.8)
}

/* ------------------------------- biped --------------------------------- */

/** 工人：驼背、长臂、工装、鸭舌帽、手里扳手。 */
function bipedWorker(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.46
  const hipY = g - s.h * (dead ? 0.10 : 0.32)
  const shY = g - s.h * (dead ? 0.22 : 0.6)
  const torsoH = hipY - shY
  const hw = s.w * (0.16 + (v === 3 ? 0.03 : 0))
  const atk = P.anim === 'attack'
  shadowOf(s, cx, s.w * 0.22, 0.5)
  // 双腿 + 靴
  const sw = foot(P, 0, 4, 2.6)
  limb(s, cx - hw * 0.4, hipY, cx - hw * 0.5 + sw.dx, g - s.h * 0.06, Math.max(1.4, s.h * 0.035), C, 0.85)
  limb(s, cx + hw * 0.4, hipY, cx + hw * 0.5 - sw.dx, g - s.h * 0.05, Math.max(1.4, s.h * 0.035), C, 0.85)
  s.rect(cx - hw * 0.8 + sw.dx, g - s.h * 0.055, hw * 0.75, Math.max(2, s.h * 0.05), C.crack)
  s.rect(cx + hw * 0.15 - sw.dx, g - s.h * 0.05, hw * 0.75, Math.max(2, s.h * 0.05), C.crack)
  // 驼背躯干（前倾）
  s.poly(
    [
      [cx - hw * 0.8, hipY + 1],
      [cx - hw * 1.0, shY + torsoH * 0.35],
      [cx - hw * 0.45, shY],
      [cx + hw * 1.0, shY + torsoH * 0.12],
      [cx + hw * 1.15, hipY - torsoH * 0.1],
      [cx + hw * 0.7, hipY + 1],
    ],
    C.bodyD,
  )
  s.poly(
    [
      [cx - hw * 0.62, hipY - 1],
      [cx - hw * 0.82, shY + torsoH * 0.42],
      [cx - hw * 0.35, shY + 3],
      [cx + hw * 0.86, shY + torsoH * 0.16],
      [cx + hw * 0.92, hipY - torsoH * 0.14],
      [cx + hw * 0.55, hipY - 1],
    ],
    C.body,
  )
  // 工装背带
  s.line(cx - hw * 0.55, hipY - 2, cx - hw * 0.35, shY + 3, C.trim, 0.9)
  s.line(cx + hw * 0.5, hipY - 2, cx + hw * 0.6, shY + 4, C.trim, 0.9)
  // 背后工具包
  s.ell(cx - hw * 1.05, hipY - torsoH * 0.3, hw * 0.32, torsoH * 0.3, C.crack)
  s.px(cx - hw * 1.05, hipY - torsoH * 0.42, PAL.steelLight)
  // 手臂（右臂持扳手，攻击时抬起）
  limb(s, cx - hw * 0.75, shY + 3, cx - hw * 1.1, hipY - torsoH * 0.1, Math.max(1.3, s.h * 0.03), C, 0.8)
  const ax = cx + hw * 0.9
  const ay = shY + torsoH * 0.2
  const ex = atk ? cx + s.w * 0.26 : cx + hw * 1.5
  const ey = atk ? shY - s.h * 0.1 : hipY - torsoH * 0.05
  limb(s, ax, ay, ex, ey, Math.max(1.4, s.h * 0.034), C, 0.8)
  // 扳手
  s.thick(ex, ey, ex + s.w * 0.06, ey - s.h * (atk ? 0.1 : 0.06), Math.max(0.9, s.h * 0.016), PAL.steelLight)
  s.rect(ex + s.w * 0.06, ey - s.h * (atk ? 0.115 : 0.075), Math.max(3, s.w * 0.05), Math.max(2, s.h * 0.03), PAL.steelDark)
  s.px(ex + s.w * 0.08, ey - s.h * (atk ? 0.12 : 0.08), PAL.steelWhite)
  // 头 + 鸭舌帽
  const hy = shY - s.h * 0.05
  headOval(s, cx + hw * 0.15, hy, s.w * 0.09, s.h * 0.075, C)
  s.ell(cx + hw * 0.12, hy - s.h * 0.07, s.w * 0.1, s.h * 0.045, C.bodyD)
  s.rect(cx + hw * 0.2, hy - s.h * 0.055, s.w * 0.09, Math.max(2, s.h * 0.022), C.crack)
  s.px(cx + hw * 0.15, hy - s.h * 0.09, C.trim)
  // 单眼（帽檐阴影下）+ 胡茬
  eyeSet(s, P, C, cx + hw * 0.3, hy, Math.max(1.1, s.h * 0.024))
  s.line(cx + hw * 0.42, hy + s.h * 0.04, cx + hw * 0.62, hy + s.h * 0.05, C.crack, 0.8)
  markOf(s, C, cx - hw * 0.8, shY + torsoH * 0.15, hw * 1.2, torsoH * 0.7)
  motifDetail(s, P, C, cx - hw * 0.8, shY + torsoH * 0.1, hw * 1.8, torsoH * 0.85)
}

/** 病患：瘦长、病号服下摆、绷带缠头、IV 架与吊管。 */
function bipedPatient(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.48
  const hipY = g - s.h * (dead ? 0.08 : 0.3)
  const shY = g - s.h * (dead ? 0.18 : 0.56)
  const torsoH = hipY - shY
  const hw = s.w * (0.12 + (v === 2 ? 0.02 : 0))
  const atk = P.anim === 'attack'
  shadowOf(s, cx, s.w * 0.2, 0.45)
  // 细腿、赤足
  const sw = foot(P, 0, 4, 2)
  limb(s, cx - hw * 0.5, hipY, cx - hw * 0.6 + sw.dx, g - s.h * 0.03, Math.max(1, s.h * 0.026), C, 0.8)
  limb(s, cx + hw * 0.5, hipY, cx + hw * 0.6 - sw.dx, g - s.h * 0.03, Math.max(1, s.h * 0.026), C, 0.8)
  s.ell(cx - hw * 0.6 + sw.dx, g - 1, Math.max(1.4, s.w * 0.025), Math.max(1, s.h * 0.015), C.bodyL)
  s.ell(cx + hw * 0.6 - sw.dx, g - 1, Math.max(1.4, s.w * 0.025), Math.max(1, s.h * 0.015), C.bodyL)
  // 病号服：窄肩 + 下摆外张
  s.poly(
    [
      [cx - hw * 0.75, hipY + 1],
      [cx - hw * 1.5, g - 2],
      [cx + hw * 1.5, g - 2],
      [cx + hw * 0.75, hipY + 1],
      [cx + hw * 0.55, shY],
      [cx - hw * 0.55, shY],
    ],
    C.bodyD,
  )
  s.poly(
    [
      [cx - hw * 0.62, hipY],
      [cx - hw * 1.3, g - 3],
      [cx + hw * 1.3, g - 3],
      [cx + hw * 0.62, hipY],
      [cx + hw * 0.45, shY + 2],
      [cx - hw * 0.45, shY + 2],
    ],
    C.body,
  )
  // 下摆竖褶
  for (let i = 0; i < 3; i++) s.line(cx - hw * 0.7 + i * hw * 0.7, hipY + 2, cx - hw * (1.0 - i * 0.7), g - 3, C.crack, 0.7)
  // 领口 + 病号标记
  s.line(cx - hw * 0.4, shY + 2, cx, shY + torsoH * 0.28, C.crack)
  s.line(cx + hw * 0.4, shY + 2, cx, shY + torsoH * 0.28, C.crack)
  s.rect(cx + hw * 0.1, hipY - torsoH * 0.35, Math.max(2, hw * 0.5), Math.max(2, torsoH * 0.16), C.trim)
  // 垂直的短臂（一只扶 IV 架）
  limb(s, cx - hw * 0.5, shY + 3, cx - hw * 0.9, hipY - torsoH * 0.15, Math.max(1, s.h * 0.026), C, 0.8)
  const ax2 = atk ? cx + s.w * 0.2 : cx - hw * 1.2
  limb(s, cx + hw * 0.5, shY + 3, ax2, atk ? shY - s.h * 0.08 : hipY - torsoH * 0.1, Math.max(1, s.h * 0.026), C, 0.8)
  // IV 架：立杆 + 吊袋 + 软管
  const px = cx - s.w * 0.22
  s.thick(px, shY - s.h * 0.16, px, g - 2, Math.max(0.8, s.w * 0.012), PAL.steelLight)
  s.rect(px - s.w * 0.035, shY - s.h * 0.15, s.w * 0.07, s.h * 0.1, PAL.bone)
  s.rect(px - s.w * 0.03, shY - s.h * 0.12, s.w * 0.06, s.h * 0.06, PAL.blood, 0.8)
  s.line(px, shY - s.h * 0.05, px + s.w * 0.05, hipY - torsoH * 0.2, PAL.steelWhite, 0.7)
  // 绷带头 + 只露出一只眼
  const hy = shY - s.h * 0.05
  headOval(s, cx, hy, s.w * 0.075, s.h * 0.07, C)
  for (let i = 0; i < 3; i++) s.line(cx - s.w * 0.075, hy - s.h * 0.03 + i * s.h * 0.025, cx + s.w * 0.078, hy - s.h * 0.035 + i * s.h * 0.025, C.trim, 0.9)
  eyeSet(s, P, C, cx + s.w * 0.03, hy + s.h * 0.005, Math.max(1, s.h * 0.02))
  // 歪掉的输液管缠绕
  s.line(cx + s.w * 0.06, hy + s.h * 0.04, cx + s.w * 0.1, hipY - torsoH * 0.4, PAL.steelWhite, 0.4)
  markOf(s, C, cx - hw * 1.0, shY + torsoH * 0.2, hw * 1.4, torsoH * 0.55)
  motifDetail(s, P, C, cx - hw * 1.1, shY + torsoH * 0.15, hw * 2.1, torsoH * 0.75)
}

/** 教徒：锥形长袍、深兜帽、宽袖、长杖。 */
function bipedCultist(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.47
  const shY = g - s.h * (dead ? 0.16 : 0.58)
  const hw = s.w * (0.18 + (v === 1 ? 0.03 : 0))
  const atk = P.anim === 'attack'
  shadowOf(s, cx, s.w * 0.25, 0.42)
  // 长袍（落地锥形），v3 下摆更宽
  s.poly(
    [
      [cx - hw * 0.55, shY],
      [cx - s.w * (v === 3 ? 0.34 : 0.3), g - 1],
      [cx + s.w * (v === 3 ? 0.34 : 0.3), g - 1],
      [cx + hw * 0.55, shY],
    ],
    C.bodyD,
  )
  s.poly(
    [
      [cx - hw * 0.45, shY + 2],
      [cx - s.w * (v === 3 ? 0.29 : 0.25), g - 2],
      [cx + s.w * (v === 3 ? 0.29 : 0.25), g - 2],
      [cx + hw * 0.45, shY + 2],
    ],
    C.body,
  )
  // 袍摆褶皱
  for (let i = 0; i < 4; i++) {
    s.line(cx - hw * 0.4 + i * hw * 0.27, shY + s.h * 0.1, cx - s.w * 0.2 + i * s.w * 0.13, g - 3, C.crack, 0.75)
  }
  // 腰带绳结
  s.line(cx - hw * 0.5, shY + (g - shY) * 0.4, cx + hw * 0.5, shY + (g - shY) * 0.42, C.trim, 0.9)
  s.px(cx + hw * 0.1, shY + (g - shY) * 0.42, PAL.rustDark)
  // 宽袖 + 枯手
  const sleeveY = shY + s.h * 0.08
  s.poly(
    [
      [cx - hw * 0.5, shY + 2],
      [cx - hw * 1.5, sleeveY + s.h * 0.06],
      [cx - hw * 1.25, sleeveY + s.h * 0.14],
      [cx - hw * 0.2, sleeveY + s.h * 0.06],
    ],
    C.body,
  )
  s.poly(
    [
      [cx + hw * 0.5, shY + 2],
      [cx + hw * 1.35, sleeveY + s.h * (atk ? -0.02 : 0.05)],
      [cx + hw * 1.15, sleeveY + s.h * 0.13],
      [cx + hw * 0.3, sleeveY + s.h * 0.07],
    ],
    C.body,
  )
  s.px(cx + hw * 1.3, sleeveY + s.h * (atk ? -0.02 : 0.06), PAL.boneDark)
  s.px(cx + hw * 1.38, sleeveY + s.h * (atk ? -0.04 : 0.04), PAL.bone)
  // 长杖 + 顶端弯钩
  const sx = cx + hw * 1.55
  s.thick(sx, g - s.h * 0.05, sx + s.w * 0.02, shY - s.h * 0.16, Math.max(0.8, s.w * 0.014), C.crack)
  s.thick(sx + s.w * 0.02, shY - s.h * 0.16, sx + s.w * 0.02, shY - s.h * 0.21, Math.max(0.7, s.w * 0.012), C.trim)
  s.ell(sx + s.w * 0.01, shY - s.h * 0.24, s.w * 0.035, s.h * 0.03, C.trim)
  P.g.push({ x: sx + s.w * 0.01, y: shY - s.h * 0.24, r: s.w * 0.13, c: C.glow, p: atk ? 0.8 : 0.5 })
  // 兜帽 + 空洞脸
  const hy = shY - s.h * 0.06
  s.ell(cx, hy, s.w * 0.1, s.h * 0.11, C.bodyD)
  s.ell(cx, hy - 1, s.w * 0.09, s.h * 0.1, C.body)
  s.poly([[cx - s.w * 0.065, hy - s.h * 0.02], [cx + s.w * 0.075, hy], [cx - s.w * 0.06, hy + s.h * 0.09]], PAL.void)
  s.px(cx + s.w * 0.015, hy + s.h * 0.02, C.glow)
  s.px(cx + s.w * 0.045, hy + s.h * 0.028, C.glow)
  P.g.push({ x: cx + s.w * 0.03, y: hy + s.h * 0.025, r: s.w * 0.1, c: C.glow, p: 0.6 })
  // 兜帽尖
  s.poly([[cx - s.w * 0.03, hy - s.h * 0.09], [cx - s.w * 0.02, hy - s.h * 0.15], [cx + s.w * 0.05, hy - s.h * 0.08]], C.bodyD)
  markOf(s, C, cx - hw * 0.6, shY + s.h * 0.12, hw * 1.1, s.h * 0.2)
  motifDetail(s, P, C, cx - hw * 0.7, shY + s.h * 0.05, hw * 1.4, (g - shY) * 0.5)
}

/** 士兵：直立装甲、全罩头盔、肩甲、横端步枪。 */
function bipedSoldier(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.45
  const hipY = g - s.h * (dead ? 0.09 : 0.34)
  const shY = g - s.h * (dead ? 0.2 : 0.62)
  const torsoH = hipY - shY
  const hw = s.w * (0.15 + (v === 3 ? 0.025 : 0))
  const atk = P.anim === 'attack'
  shadowOf(s, cx, s.w * 0.23, 0.5)
  // 双腿 + 战靴
  const sw = foot(P, 0, 4, 2.4)
  limb(s, cx - hw * 0.4, hipY, cx - hw * 0.45 + sw.dx, g - s.h * 0.06, Math.max(1.2, s.h * 0.032), C, 0.85)
  limb(s, cx + hw * 0.4, hipY, cx + hw * 0.45 - sw.dx, g - s.h * 0.06, Math.max(1.2, s.h * 0.032), C, 0.85)
  s.rect(cx - hw * 0.7 + sw.dx, g - s.h * 0.06, hw * 0.65, Math.max(2, s.h * 0.055), C.crack)
  s.rect(cx + hw * 0.1 - sw.dx, g - s.h * 0.06, hw * 0.65, Math.max(2, s.h * 0.055), C.crack)
  // 躯干装甲（方正）
  s.rect(cx - hw * 0.8, shY + torsoH * 0.18, hw * 1.6, torsoH * 0.8, C.bodyD)
  s.rect(cx - hw * 0.68, shY + torsoH * 0.22, hw * 1.36, torsoH * 0.7, C.body)
  s.rect(cx - hw * 0.5, shY + torsoH * 0.3, hw * 0.9, torsoH * 0.16, C.bodyL)
  // 胸甲接缝 + 弹带
  s.line(cx - hw * 0.68, shY + torsoH * 0.56, cx + hw * 0.68, shY + torsoH * 0.56, C.crack)
  for (let i = 0; i < 3; i++) s.px(cx - hw * 0.4 + i * hw * 0.32, shY + torsoH * 0.45, PAL.ochre)
  // 肩甲
  for (const side of [-1, 1]) {
    s.ell(cx + side * hw * 0.82, shY + torsoH * 0.2, hw * 0.36, torsoH * 0.14, C.bodyD)
    s.ell(cx + side * hw * 0.82, shY + torsoH * 0.18, hw * 0.3, torsoH * 0.11, C.body)
    s.px(cx + side * hw * 0.82, shY + torsoH * 0.14, C.trim)
  }
  // 手臂 + 步枪
  const gy = shY + torsoH * (atk ? 0.24 : 0.34)
  limb(s, cx + hw * 0.8, shY + torsoH * 0.24, cx + hw * 1.45, gy, Math.max(1.2, s.h * 0.03), C, 0.8)
  s.rect(cx + hw * 1.1, gy - Math.max(1.4, s.h * 0.02), s.w * 0.2, Math.max(2.4, s.h * 0.035), PAL.steelDark)
  s.rect(cx + hw * 1.1, gy - Math.max(1.4, s.h * 0.02), s.w * 0.2, Math.max(1, s.h * 0.014), PAL.steelLight)
  s.rect(cx + hw * 1.7, gy - Math.max(2, s.h * 0.03), Math.max(2, s.w * 0.025), Math.max(3, s.h * 0.05), PAL.steelDark)
  s.line(cx + hw * 1.35, gy + s.h * 0.025, cx + hw * 1.5, gy + s.h * 0.05, PAL.steelDark)
  if (atk) {
    s.poly([[cx + hw * 1.85, gy - s.h * 0.01], [cx + hw * 1.85 + s.w * 0.1, gy], [cx + hw * 1.85, gy + s.h * 0.02]], PAL.neonWarm)
    P.g.push({ x: cx + hw * 1.9, y: gy, r: s.w * 0.16, c: PAL.neonWarm, p: 0.75 })
  }
  // 后臂（护木）
  limb(s, cx - hw * 0.85, shY + torsoH * 0.24, cx - hw * 1.05, hipY - torsoH * 0.12, Math.max(1.1, s.h * 0.028), C, 0.8)
  // 全罩头盔 + 视缝
  const hy = shY - s.h * 0.035
  s.ell(cx, hy, s.w * 0.085, s.h * 0.078, C.bodyD)
  s.ell(cx, hy - 1, s.w * 0.076, s.h * 0.068, C.body)
  s.rect(cx - s.w * 0.045, hy - s.h * 0.005, s.w * 0.1, Math.max(2, s.h * 0.03), PAL.void)
  s.px(cx + s.w * 0.02, hy + s.h * 0.008, C.glow)
  P.g.push({ x: cx + s.w * 0.02, y: hy + s.h * 0.008, r: s.w * 0.1, c: C.glow, p: 0.55 })
  s.rect(cx + s.w * 0.01, hy + s.h * 0.045, s.w * 0.055, Math.max(1.6, s.h * 0.03), C.crack)
  // 头盔顶天线
  s.thick(cx - s.w * 0.03, hy - s.h * 0.07, cx - s.w * 0.055, hy - s.h * 0.14, Math.max(0.7, s.w * 0.01), C.trim)
  s.px(cx - s.w * 0.055, hy - s.h * 0.15, C.glow)
  markOf(s, C, cx - hw * 0.6, shY + torsoH * 0.3, hw * 0.8, torsoH * 0.3)
  motifDetail(s, P, C, cx - hw * 0.7, shY + torsoH * 0.2, hw * 1.5, torsoH * 0.7)
}

/* ------------------------------- insect -------------------------------- */

/** 甲虫：圆顶鞘翅、中缝、六短腿、独角。 */
function insectBeetle(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.45
  const bw = s.w * 0.32
  const bh = s.h * (0.18 + v * 0.012)
  const cy = g - (dead ? bh * 0.6 : s.h * 0.27)
  const lift = dead ? 0 : breath(P, 0.8)
  shadowOf(s, cx, bw * 1.25, 0.45)
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const f = dead ? { dx: 0, lift: 0 } : foot(P, k + (side > 0 ? 3 : 0), 4, 2.6)
      const hx = cx + side * bw * 0.35 + (k - 1) * bw * 0.28
      s.thick(hx, cy + bh * 0.35, hx + side * bw * 0.28, cy + bh * 0.7, Math.max(1, bh * 0.1), C.bodyD)
      s.thick(hx + side * bw * 0.28, cy + bh * 0.7, hx + side * bw * 0.4 + f.dx, g - 1 - f.lift, Math.max(0.8, bh * 0.08), C.body)
    }
  }
  // 鞘翅：圆顶 + 中缝
  s.ell(cx - bw * 0.08, cy + lift, bw * 1.02, bh, C.bodyD)
  s.ell(cx - bw * 0.08, cy - 1 + lift, bw * 0.93, bh * 0.88, C.body)
  s.ell(cx - bw * 0.24, cy - bh * 0.46 + lift, bw * 0.46, bh * 0.3, C.bodyL)
  s.line(cx - bw * 0.9, cy - bh * 0.28 + lift, cx + bw * 0.7, cy - bh * 0.28 + lift, C.crack, 0.9)
  s.line(cx - bw * 0.9, cy + bh * 0.28 + lift, cx + bw * 0.7, cy + bh * 0.28 + lift, C.crack, 0.6)
  // 头 + 独角（variant 决定角形）
  const hx = cx + bw * 0.92
  const hy = cy - bh * 0.08 + lift
  headOval(s, hx, hy, bw * 0.3, bh * 0.34, C)
  if (v === 0) {
    s.poly([[hx + bw * 0.05, hy - bh * 0.2], [hx + bw * 0.55, hy - bh * 0.5], [hx + bw * 0.16, hy - bh * 0.06]], C.trim)
  } else if (v === 1) {
    s.poly([[hx + bw * 0.05, hy - bh * 0.22], [hx + bw * 0.3, hy - bh * 0.85], [hx + bw * 0.2, hy - bh * 0.2]], C.bodyD)
  } else if (v === 2) {
    s.poly([[hx + bw * 0.0, hy - bh * 0.25], [hx + bw * 0.14, hy - bh * 0.9], [hx + bw * 0.3, hy - bh * 0.25]], PAL.bone)
  }
  // 触角
  s.line(hx + bw * 0.2, hy - bh * 0.2, hx + bw * 0.55, hy - bh * 0.45, C.crack)
  s.line(hx + bw * 0.55, hy - bh * 0.45, hx + bw * 0.7, hy - bh * 0.3, C.crack)
  eyeSet(s, P, C, hx + bw * 0.05, hy, Math.max(1, bh * 0.14))
  markOf(s, C, cx - bw * 0.75, cy - bh * 0.8 + lift, bw * 1.4, bh * 0.9)
  motifDetail(s, P, C, cx - bw * 0.85, cy - bh * 0.9 + lift, bw * 1.8, bh * 1.6)
}

/** 螳螂：细长腹部、折叠镰臂、三角头、四条长腿。 */
function insectMantis(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.42
  const hipY = g - s.h * (dead ? 0.08 : 0.26)
  const tx = cx + s.w * 0.1
  const ty = g - s.h * (dead ? 0.16 : 0.44)
  const atk = P.anim === 'attack'
  shadowOf(s, cx, s.w * 0.2, 0.4)
  // 四条长腿
  for (let k = 0; k < 4; k++) {
    const side = k < 2 ? -1 : 1
    const f = dead ? { dx: 0, lift: 0 } : foot(P, k, 4, 3.2)
    const lx = cx + side * s.w * (0.03 + k * 0.02)
    s.thick(lx, hipY, lx + side * s.w * 0.13, g - s.h * 0.16, Math.max(0.9, s.h * 0.014), C.bodyD)
    s.thick(lx + side * s.w * 0.13, g - s.h * 0.16, lx + side * s.w * (0.16 + v * 0.02) + f.dx, g - 1 - f.lift, Math.max(0.7, s.h * 0.011), C.body)
  }
  // 细长腹部（后段）
  s.thick(cx - s.w * 0.18, hipY + 2, cx + s.w * 0.06, ty + s.h * 0.04, Math.max(1.6, s.h * 0.05), C.bodyD)
  s.thick(cx - s.w * 0.18, hipY + 1, cx + s.w * 0.06, ty + s.h * 0.03, Math.max(1.2, s.h * 0.038), C.body)
  s.ell(cx - s.w * 0.2, hipY + 1, s.w * 0.09, s.h * 0.06, C.bodyD)
  // 收窄的胸节
  s.thick(tx - s.w * 0.02, ty + s.h * 0.04, tx + s.w * 0.04, ty - s.h * (v === 3 ? 0.1 : 0.05), Math.max(1.4, s.h * 0.035), C.body)
  // 折翅（两片细长三角）
  s.poly([[tx - s.w * 0.02, ty], [cx - s.w * 0.26, hipY + s.h * 0.02], [tx + s.w * 0.06, hipY - s.h * 0.04]], C.trim, 0.55)
  s.line(tx, ty, cx - s.w * 0.2, hipY, C.crack, 0.6)
  // 镰臂：折叠 / 攻击展开
  for (const side of [-1, 1]) {
    const sy = ty - s.h * 0.03 + side * s.h * 0.012
    const kx = tx + s.w * (atk ? 0.2 : 0.1)
    const ky = atk ? sy - s.h * 0.1 : sy + s.h * 0.09
    s.thick(tx + s.w * 0.02, sy, kx, ky, Math.max(0.9, s.h * 0.016), C.body)
    s.thick(kx, ky, kx + s.w * (atk ? 0.2 : 0.08), ky - s.h * (atk ? 0.03 : 0.07), Math.max(0.8, s.h * 0.014), C.bodyD)
    s.line(kx + s.w * 0.02, ky - s.h * 0.02, kx + s.w * (atk ? 0.18 : 0.07), ky - s.h * (atk ? 0.02 : 0.06), PAL.bone, 0.8)
    for (let i = 0; i < 3; i++) s.px(kx + s.w * (0.06 + i * 0.04), ky - s.h * (0.02 + i * 0.01), PAL.boneDark)
  }
  if (atk) P.g.push({ x: tx + s.w * 0.4, y: ty - s.h * 0.05, r: s.w * 0.14, c: C.glow, p: 0.35 })
  // 三角头 + 大复眼
  const hx = tx + s.w * 0.1
  const hy = ty - s.h * (v === 2 ? 0.14 : 0.1)
  s.poly([[hx - s.w * 0.05, hy - s.h * 0.06], [hx + s.w * 0.1, hy + s.h * 0.02], [hx - s.w * 0.05, hy + s.h * 0.07]], C.bodyD)
  s.poly([[hx - s.w * 0.035, hy - s.h * 0.045], [hx + s.w * 0.075, hy + s.h * 0.015], [hx - s.w * 0.035, hy + s.h * 0.05]], C.body)
  eyeSet(s, P, C, hx + s.w * 0.045, hy, Math.max(1.1, s.h * 0.02), C.trim)
  // 触角
  s.line(hx + s.w * 0.05, hy - s.h * 0.04, hx + s.w * 0.14, hy - s.h * 0.12, C.crack)
  markOf(s, C, cx - s.w * 0.2, hipY - s.h * 0.14, s.w * 0.22, s.h * 0.14)
  motifDetail(s, P, C, cx - s.w * 0.22, hipY - s.h * 0.16, s.w * 0.34, s.h * 0.26)
}

/** 蚂蚁：三节身体、细腰、六条肘腿、膝状触角、大颚。 */
function insectAnt(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.42
  const cy = g - s.h * (dead ? 0.16 : 0.38)
  const atk = P.anim === 'attack'
  const seg = s.w * 0.15
  shadowOf(s, cx, s.w * 0.26, 0.4)
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const f = dead ? { dx: 0, lift: 0 } : foot(P, k + (side > 0 ? 3 : 0), 4, 2.8)
      const hx = cx + (k - 1) * seg + side * s.w * 0.05
      s.thick(hx, cy + s.h * 0.03, hx + side * s.w * 0.12, cy + s.h * 0.12, Math.max(0.8, s.h * 0.012), C.bodyD)
      s.thick(hx + side * s.w * 0.12, cy + s.h * 0.12, hx + side * s.w * 0.15 + f.dx, g - 1 - f.lift, Math.max(0.7, s.h * 0.01), C.body)
    }
  }
  // 腹部（大）+ 胸（中）+ 头（前）
  s.ell(cx - seg * 0.85, cy + s.h * 0.02, seg * 0.62, seg * 0.55, C.bodyD)
  s.ell(cx - seg * 0.85, cy + s.h * 0.01, seg * 0.54, seg * 0.47, C.body)
  s.ell(cx, cy, seg * 0.42, seg * 0.36, C.bodyD)
  s.ell(cx, cy - 1, seg * 0.36, seg * 0.3, C.body)
  // 细腰
  s.thick(cx - seg * 0.4, cy, cx - seg * 0.2, cy, Math.max(0.8, s.h * 0.014), C.crack)
  // 头 + 大颚
  const hx = cx + seg * 0.85
  const hy = cy - s.h * 0.02
  headOval(s, hx, hy, seg * 0.4, seg * 0.34, C)
  s.poly([[hx + seg * 0.2, hy + seg * 0.05], [hx + seg * (atk ? 0.72 : 0.55), hy + seg * (atk ? 0.2 : 0.1)], [hx + seg * 0.24, hy + seg * 0.28]], PAL.boneDark)
  s.poly([[hx + seg * 0.2, hy - seg * 0.02], [hx + seg * (atk ? 0.65 : 0.5), hy - seg * (atk ? 0.16 : 0.08)], [hx + seg * 0.22, hy + seg * 0.06]], PAL.bone)
  // 膝状触角
  s.line(hx + seg * 0.1, hy - seg * 0.28, hx + seg * 0.36, hy - seg * 0.6, C.crack)
  s.line(hx + seg * 0.36, hy - seg * 0.6, hx + seg * (0.56 + v * 0.04), hy - seg * 0.52, C.crack)
  s.px(hx + seg * (0.56 + v * 0.04), hy - seg * 0.52, C.trim)
  eyeSet(s, P, C, hx + seg * 0.1, hy - seg * 0.05, Math.max(1, seg * 0.16))
  markOf(s, C, cx - seg * 1.2, cy - seg * 0.5, seg * 0.75, seg * 0.7)
  motifDetail(s, P, C, cx - seg * 1.35, cy - seg * 0.6, seg * 2.1, seg * 1.2)
}

/** 蜱虫：鼓胀巨腹、微小头部、八条短腿、口器。 */
function insectTick(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.4
  const rx = s.w * (0.3 + v * 0.015)
  const ry = s.h * (0.22 + (v === 3 ? 0.04 : 0))
  const cy = g - (dead ? ry * 0.6 : ry * 1.4)
  const lift = dead ? 0 : breath(P, 1.4)
  shadowOf(s, cx, rx * 1.2, 0.4)
  // 八条短腿
  for (let k = 0; k < 4; k++) {
    for (const side of [-1, 1]) {
      const f = dead ? { dx: 0, lift: 0 } : foot(P, k + (side > 0 ? 4 : 0), 5, 2)
      const hx = cx + side * rx * 0.4 + (k - 1.5) * rx * 0.3
      s.thick(hx, cy + ry * 0.45, hx + side * rx * 0.18, cy + ry * 0.7, Math.max(0.7, ry * 0.06), C.bodyD)
      s.thick(hx + side * rx * 0.18, cy + ry * 0.7, hx + side * rx * 0.22 + f.dx, g - 1 - f.lift, Math.max(0.6, ry * 0.05), C.body)
    }
  }
  // 巨腹
  s.ell(cx - rx * 0.1, cy + lift, rx, ry, C.bodyD)
  s.ell(cx - rx * 0.1, cy - 1 + lift, rx * 0.9, ry * 0.86, C.body)
  s.ell(cx - rx * 0.3, cy - ry * 0.4 + lift, rx * 0.45, ry * 0.3, C.bodyL)
  // 腹面分节纹
  for (let i = 0; i < 3; i++) s.line(cx - rx * 0.8, cy + ry * (0.2 + i * 0.2) + lift, cx + rx * 0.55, cy + ry * (0.2 + i * 0.2) + lift, C.crack, 0.7)
  // 小头 + 口器
  const hx = cx + rx * 0.85
  const hy = cy + lift
  headOval(s, hx, hy, rx * 0.24, ry * 0.3, C)
  s.thick(hx + rx * 0.15, hy, hx + rx * 0.42, hy + ry * 0.12, Math.max(0.8, ry * 0.07), PAL.boneDark)
  s.px(hx + rx * 0.42, hy + ry * 0.12, PAL.bone)
  eyeSet(s, P, C, hx + rx * 0.05, hy - ry * 0.08, Math.max(1, ry * 0.1))
  markOf(s, C, cx - rx * 0.7, cy - ry * 0.7 + lift, rx * 1.2, ry * 0.9)
  motifDetail(s, P, C, cx - rx * 0.9, cy - ry * 0.9 + lift, rx * 1.8, ry * 1.6)
}

/* -------------------------------- worm --------------------------------- */

/** 鳗：正弦长身、背鳍、前端口与眼。 */
function wormEel(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cy0 = g - s.h * (dead ? 0.16 : 0.32)
  const x0 = s.w * 0.08
  const len = s.w * 0.86
  const amp = s.h * (dead ? 0.03 : 0.07 + v * 0.012)
  const n = 16
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = x0 + t * len
    const y = cy0 + Math.sin(t * Math.PI * 2.1 + P.i * 0.5) * amp * (0.4 + t * 0.6)
    pts.push([x, y])
  }
  shadowOf(s, x0 + len * 0.5, len * 0.42, 0.35)
  // 身体：由粗到细
  for (let i = 0; i < n; i++) {
    const t = i / n
    const r = Math.max(1.2, s.h * (0.075 - t * 0.045))
    s.thick(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, C.bodyD)
    if (i % 2 === 0) s.thick(pts[i][0], pts[i][1] - 1, pts[i + 1][0], pts[i + 1][1] - 1, r * 0.62, C.body)
  }
  // 背鳍
  for (let i = 2; i < n - 2; i += 2) {
    const [px, py] = pts[i]
    s.poly([[px - 3, py - s.h * 0.03], [px, py - s.h * (0.1 + (i % 4) * 0.012)], [px + 3, py - s.h * 0.03]], C.trim, 0.85)
  }
  // 头 + 颌 + 眼
  const [hx, hy] = pts[n - 1]
  headOval(s, hx, hy, s.w * 0.075, s.h * 0.07, C)
  s.poly([[hx + s.w * 0.03, hy - s.h * 0.02], [hx + s.w * (0.13 + v * 0.01), hy], [hx + s.w * 0.03, hy + s.h * 0.03]], C.bodyD)
  s.px(hx + s.w * 0.08, hy, PAL.void)
  eyeSet(s, P, C, hx + s.w * 0.01, hy - s.h * 0.035, Math.max(1, s.h * 0.016), C.trim)
  markOf(s, C, x0 + len * 0.4, cy0 - s.h * 0.08, len * 0.18, s.h * 0.12)
  motifDetail(s, P, C, x0 + len * 0.25, cy0 - s.h * 0.1, len * 0.5, s.h * 0.2)
}

/** 蛆：肥硕 C 形分节体、头端上抬、口钩。 */
function wormMaggot(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.4
  const r = s.h * (0.13 + v * 0.01)
  const cy = g - (dead ? r * 0.9 : r * 1.5)
  shadowOf(s, cx, s.w * 0.3, 0.4)
  // 5 节由大到小，头部抬起
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const bx = cx - s.w * 0.28 + t * s.w * 0.5
    const by = cy + Math.sin(t * Math.PI * 0.85) * s.h * (dead ? 0.02 : 0.08) - (dead ? 0 : r * 0.3)
    const rr = r * (0.8 + t * 0.5)
    s.disc(bx, by, rr, C.bodyD)
    s.disc(bx, by - 1, rr * 0.9, C.body)
    s.disc(bx - rr * 0.3, by - rr * 0.35, rr * 0.35, C.bodyL)
    // 节间凹槽
    s.line(bx - rr * 0.9, by + rr * 0.55, bx + rr * 0.9, by + rr * 0.55, C.crack, 0.8)
  }
  // 头端口钩
  const hx = cx + s.w * 0.3
  const hy = cy - s.h * (dead ? 0.02 : 0.1)
  s.thick(hx, hy, hx + s.w * 0.05, hy + s.h * 0.04, Math.max(0.8, r * 0.06), PAL.boneDark)
  s.thick(hx, hy + s.h * 0.02, hx + s.w * 0.045, hy - s.h * 0.01, Math.max(0.7, r * 0.05), PAL.bone)
  s.px(hx + s.w * 0.05, hy + s.h * 0.04, PAL.bone)
  eyeSet(s, P, C, hx - s.w * 0.02, hy - s.h * 0.01, Math.max(1, r * 0.1))
  markOf(s, C, cx - s.w * 0.16, cy - r * 0.9, s.w * 0.2, r * 0.8)
  motifDetail(s, P, C, cx - s.w * 0.25, cy - r, s.w * 0.45, r * 1.6)
}

/** 水蛭：扁平宽体、两端吸盘、波状分节。 */
function wormLeech(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.46
  const rx = s.w * (0.34 + v * 0.01)
  const ry = s.h * (0.1 + v * 0.008)
  const cy = g - (dead ? ry * 0.8 : ry * 1.35)
  const wave = dead ? 0 : Math.sin(P.i * 0.9) * s.h * 0.02
  shadowOf(s, cx, rx * 1.1, 0.35)
  // 扁平躯干
  s.ell(cx, cy + wave, rx, ry, C.bodyD)
  s.ell(cx, cy - 1 + wave, rx * 0.93, ry * 0.84, C.body)
  s.ell(cx - rx * 0.2, cy - ry * 0.4 + wave, rx * 0.5, ry * 0.3, C.bodyL)
  // 分节横纹
  for (let i = 0; i < 7; i++) {
    const px = cx - rx * 0.78 + i * rx * 0.26
    s.line(px, cy - ry * 0.7 + wave, px + rx * 0.06, cy + ry * 0.7 + wave, C.crack, 0.7)
  }
  // 两端吸盘
  s.disc(cx + rx * 0.92, cy + wave, Math.max(1.4, ry * 0.6), C.bodyD)
  s.disc(cx + rx * 0.92, cy + wave, Math.max(1, ry * 0.4), PAL.bloodDark)
  s.disc(cx - rx * 0.92, cy + wave, Math.max(1.4, ry * 0.55), C.bodyD)
  s.disc(cx - rx * 0.92, cy + wave, Math.max(1, ry * 0.35), PAL.bloodDark)
  // 前端小口
  s.ell(cx + rx * 0.9, cy + wave, Math.max(1, ry * 0.22), Math.max(1, ry * 0.16), PAL.void)
  eyeSet(s, P, C, cx + rx * 0.72, cy - ry * 0.35 + wave, Math.max(1, ry * 0.18))
  markOf(s, C, cx - rx * 0.3, cy - ry * 0.8 + wave, rx * 0.5, ry * 0.8)
  motifDetail(s, P, C, cx - rx * 0.7, cy - ry * 0.8 + wave, rx * 1.2, ry * 1.3)
}

/** 幼虫：弓形分节体、腹足、大头上颚。 */
function wormLarva(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.42
  const r = s.h * (0.115 + v * 0.01)
  const baseY = g - r * (dead ? 1 : 1.6)
  const atk = P.anim === 'attack'
  shadowOf(s, cx, s.w * 0.28, 0.4)
  // 弓形身体：4 节
  for (let i = 0; i < 4; i++) {
    const t = i / 3
    const bx = cx - s.w * 0.24 + t * s.w * 0.46
    const by = baseY - Math.sin(t * Math.PI) * s.h * (dead ? 0.02 : 0.12)
    const rr = r * (1.05 - t * 0.15)
    s.disc(bx, by, rr, C.bodyD)
    s.disc(bx, by - 1, rr * 0.88, C.body)
    s.disc(bx - rr * 0.25, by - rr * 0.35, rr * 0.3, C.bodyL)
  }
  // 腹足（小疣足）
  for (let i = 0; i < 3; i++) {
    const bx = cx - s.w * 0.16 + i * s.w * 0.15
    const f = dead ? { dx: 0, lift: 0 } : foot(P, i, 4, 1.6)
    s.thick(bx, baseY + r * 0.3, bx + f.dx, g - 1 - f.lift, Math.max(0.8, r * 0.16), C.bodyD)
    s.px(bx + f.dx, g - 1 - f.lift, C.crack)
  }
  // 大头 + 上颚
  const hx = cx + s.w * 0.32
  const hy = baseY - s.h * (dead ? 0.02 : 0.14)
  headOval(s, hx, hy, r * 1.15, r * 1.0, C)
  s.poly([[hx + r * 0.5, hy + r * 0.1], [hx + r * (atk ? 1.5 : 1.1), hy + r * (atk ? 0.45 : 0.2)], [hx + r * 0.6, hy + r * 0.6]], PAL.boneDark)
  s.poly([[hx + r * 0.5, hy - r * 0.05], [hx + r * (atk ? 1.4 : 1.0), hy - r * (atk ? 0.35 : 0.15)], [hx + r * 0.55, hy + r * 0.15]], PAL.bone)
  if (atk) P.g.push({ x: hx + r * 1.2, y: hy + r * 0.2, r: r * 2.6, c: C.glow, p: 0.3 })
  eyeSet(s, P, C, hx + r * 0.15, hy - r * 0.18, Math.max(1, r * 0.15))
  markOf(s, C, cx - s.w * 0.1, baseY - r * 1.4, s.w * 0.2, r * 0.8)
  motifDetail(s, P, C, cx - s.w * 0.26, baseY - r * 1.5, s.w * 0.5, r * 1.4)
}

/* -------------------------------- float -------------------------------- */

/** 影：破边斗篷、深兜帽、飘带，离地悬浮。 */
function floatShade(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.47
  const hov = dead ? 2 : hover(P, 2.2)
  const topY = s.h * 0.18 + hov * 0.5
  const botY = g - (dead ? 2 : 3) + hov * 0.4
  const hw = s.w * (0.19 + v * 0.015)
  s.shadow(cx, g - 0.5, s.w * 0.2, 1.8, 0.2)
  // 斗篷：底部锯齿破边
  s.poly(
    [
      [cx - hw, topY + s.h * 0.24],
      [cx - hw * 1.2, botY],
      [cx - hw * 0.45, botY - s.h * 0.1],
      [cx, botY + s.h * 0.02],
      [cx + hw * 0.55, botY - s.h * 0.09],
      [cx + hw * 1.15, botY],
      [cx + hw * 0.95, topY + s.h * 0.24],
    ],
    C.bodyD,
  )
  s.poly(
    [
      [cx - hw * 0.82, topY + s.h * 0.26],
      [cx - hw * 0.95, botY - s.h * 0.03],
      [cx - hw * 0.3, botY - s.h * 0.11],
      [cx + hw * 0.1, botY - s.h * 0.02],
      [cx + hw * 0.62, botY - s.h * 0.1],
      [cx + hw * 0.82, topY + s.h * 0.26],
    ],
    C.body,
  )
  // 兜帽 + 脸洞
  s.ell(cx, topY + s.h * 0.06, hw * 0.76, s.h * 0.15, C.bodyD)
  s.ell(cx, topY + s.h * 0.05, hw * 0.66, s.h * 0.13, C.body)
  s.ell(cx + hw * 0.1, topY + s.h * 0.075, hw * 0.38, s.h * 0.07, PAL.void)
  // 两点眼
  s.px(cx + hw * 0.02, topY + s.h * 0.06, C.glow)
  s.px(cx + hw * 0.26, topY + s.h * 0.065, C.glow)
  P.g.push({ x: cx + hw * 0.14, y: topY + s.h * 0.06, r: s.w * 0.1, c: C.glow, p: 0.55 })
  // 飘带
  for (let i = 0; i < 3; i++) {
    const sx = cx - hw * 0.7 + i * hw * 0.6
    s.thick(sx, topY + s.h * 0.2, sx + (i % 2 ? 3 : -3), botY + s.h * 0.05, Math.max(0.6, s.w * 0.008), C.crack)
  }
  markOf(s, C, cx - hw * 0.55, topY + s.h * 0.26, hw * 0.9, s.h * 0.2)
  motifDetail(s, P, C, cx - hw * 0.85, topY + s.h * 0.22, hw * 1.7, s.h * 0.34)
}

/** 光球：球形核心、三段轨道碎片、下方触须。 */
function floatOrb(s, P, C) {
  const g = s.h - 2
  const dead = isDead(P)
  const cx = s.w * 0.47
  const hov = dead ? 3 : hover(P, 2.6)
  const cy = s.h * 0.42 + hov
  const r = Math.min(s.w, s.h) * (0.2 + C.v * 0.012)
  s.shadow(cx, g - 0.5, r * 1.1, 1.8, 0.18)
  // 轨道碎片（三段弧）
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * TAU + P.i * 0.18
    for (let i = 0; i < 5; i++) {
      const a = a0 + i * 0.22
      s.rect(cx + Math.cos(a) * r * 1.65, cy + Math.sin(a) * r * 0.75, Math.max(1.4, r * 0.18), Math.max(1, r * 0.1), k === 1 ? C.trim : C.bodyD)
    }
  }
  // 核心球
  s.disc(cx, cy, r, C.bodyD)
  s.disc(cx, cy - r * 0.05, r * 0.92, C.body)
  s.disc(cx - r * 0.25, cy - r * 0.25, r * 0.42, C.bodyL)
  s.disc(cx + r * 0.1, cy + r * 0.05, r * 0.3, C.glow)
  s.disc(cx + r * 0.1, cy + r * 0.05, r * 0.16, PAL.white)
  P.g.push({ x: cx + r * 0.1, y: cy + r * 0.05, r: r * 2.4, c: C.glow, p: 0.8 })
  // 下方垂须
  for (let i = 0; i < 3; i++) {
    const tx = cx - r * 0.5 + i * r * 0.5
    s.thick(tx, cy + r * 0.8, tx + Math.sin(P.i + i) * 2, cy + r * 1.9, Math.max(0.7, r * 0.1), C.crack)
  }
  // 单片翼状凸起（variant 变位置）
  const wa = C.v * 1.4
  s.poly([[cx + Math.cos(wa) * r * 0.9, cy + Math.sin(wa) * r * 0.9], [cx + Math.cos(wa) * r * 2.1, cy + Math.sin(wa) * r * 1.5], [cx + Math.cos(wa + 0.5) * r * 0.9, cy + Math.sin(wa + 0.5) * r * 0.9]], C.trim, 0.8)
  markOf(s, C, cx - r * 0.6, cy - r * 0.6, r * 1.1, r * 0.9)
  motifDetail(s, P, C, cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.6)
}

/** 幽魂：高瘦长袍、长臂、拖尾分叉。 */
function floatWraith(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.46
  const hov = dead ? 2 : hover(P, 1.8)
  const shY = s.h * 0.28 + hov
  const topY = s.h * 0.1 + hov
  const bw = s.w * (0.14 + v * 0.012)
  s.shadow(cx, g - 0.5, s.w * 0.18, 1.6, 0.18)
  // 长袍：窄肩 + 拖地分叉尾
  s.poly(
    [
      [cx - bw, shY],
      [cx - bw * 1.6, g - 4],
      [cx - bw * 0.7, g - 1],
      [cx - bw * 0.2, g - 5],
      [cx + bw * 0.4, g - 1],
      [cx + bw * 1.5, g - 6],
      [cx + bw, shY],
    ],
    C.bodyD,
  )
  s.poly(
    [
      [cx - bw * 0.8, shY + 2],
      [cx - bw * 1.25, g - 4],
      [cx - bw * 0.5, g - 2],
      [cx + bw * 0.05, g - 5],
      [cx + bw * 1.2, g - 5],
      [cx + bw * 0.8, shY + 2],
    ],
    C.body,
  )
  // 长臂 + 枯指
  for (const side of [-1, 1]) {
    const ex = cx + side * bw * (1.9 + v * 0.1)
    const ey = shY + s.h * 0.26
    s.thick(cx + side * bw * 0.7, shY + s.h * 0.04, ex, ey, Math.max(0.9, s.w * 0.014), C.body)
    for (let i = 0; i < 3; i++) s.line(ex, ey, ex + side * 2 - i, ey + s.h * 0.05 + i, PAL.boneDark)
    s.px(ex, ey, PAL.bone)
  }
  // 兜帽 + 眼
  s.ell(cx, topY, bw * 0.85, s.h * 0.11, C.bodyD)
  s.ell(cx, topY - 1, bw * 0.75, s.h * 0.095, C.body)
  s.ell(cx + bw * 0.12, topY + 1, bw * 0.38, s.h * 0.045, PAL.void)
  s.px(cx + bw * 0.02, topY, C.glow)
  s.px(cx + bw * 0.24, topY + 1, C.glow)
  P.g.push({ x: cx + bw * 0.13, y: topY, r: s.w * 0.1, c: C.glow, p: 0.6 })
  // 腰链
  s.line(cx - bw * 0.7, shY + s.h * 0.18, cx + bw * 0.75, shY + s.h * 0.2, C.trim, 0.8)
  markOf(s, C, cx - bw * 0.6, shY + s.h * 0.05, bw * 1.1, s.h * 0.18)
  motifDetail(s, P, C, cx - bw * 1.0, shY + 2, bw * 2.0, s.h * 0.3)
}

/** 水母：钟形伞盖、扇贝边、垂落触手、伞内亮核。 */
function floatJelly(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.46
  const hov = dead ? 4 : hover(P, 2.4)
  const bellY = s.h * 0.34 + hov
  const brx = s.w * (0.24 + v * 0.012)
  const bry = s.h * 0.17
  s.shadow(cx, g - 0.5, s.w * 0.16, 1.4, 0.16)
  // 触手（多帧摇摆）
  for (let i = 0; i < 5; i++) {
    const tx = cx - brx * 0.7 + i * brx * 0.35
    const sw = Math.sin(P.i * 0.8 + i) * s.w * 0.03
    s.thick(tx, bellY + bry * 0.6, tx + sw, g - 3, Math.max(0.7, s.w * 0.01), C.bodyD)
    s.thick(tx, bellY + bry * 0.6, tx + sw * 1.5, g - 5, Math.max(0.6, s.w * 0.008), C.trim, 0.6)
    s.px(tx + sw * 1.5, g - 4, C.glow)
  }
  // 钟形伞盖
  s.ell(cx, bellY, brx, bry, C.bodyD)
  s.ell(cx, bellY - 1, brx * 0.92, bry * 0.86, C.body)
  s.ell(cx - brx * 0.2, bellY - bry * 0.35, brx * 0.45, bry * 0.3, C.bodyL)
  // 扇贝边
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.15 + i * 0.175)
    s.ell(cx + Math.cos(a) * brx * 0.82, bellY + bry * 0.55, brx * 0.12, bry * 0.16, C.body)
  }
  // 内部亮核
  s.disc(cx, bellY - bry * 0.2, Math.max(1.4, bry * 0.24), C.glow)
  s.disc(cx, bellY - bry * 0.2, Math.max(0.8, bry * 0.12), PAL.white)
  P.g.push({ x: cx, y: bellY - bry * 0.2, r: brx * 1.3, c: C.glow, p: 0.55 })
  markOf(s, C, cx - brx * 0.5, bellY - bry * 0.8, brx * 0.9, bry * 0.5)
  motifDetail(s, P, C, cx - brx * 0.85, bellY - bry * 0.85, brx * 1.7, bry * 1.5)
}

/* -------------------------------- avian -------------------------------- */

/** 乌鸦：紧凑身体、大楔喙、折翅、扇形尾羽。 */
function avianCrow(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.44
  const cy = g - s.h * (dead ? 0.14 : 0.34)
  const bw = s.w * 0.24
  const bh = s.h * 0.16
  const atk = P.anim === 'attack'
  s.shadow(cx, g - 0.5, bw * 1.2, 1.8, 0.35)
  // 两条细腿
  for (const off of [-bw * 0.35, bw * 0.35]) {
    const f = dead ? { dx: 0, lift: 0 } : foot(P, off > 0 ? 1 : 0, 4, 2)
    s.thick(cx + off, cy + bh * 0.6, cx + off + f.dx, g - 1 - f.lift, Math.max(0.8, s.h * 0.012), PAL.steelDark)
    s.line(cx + off + f.dx - 2, g - 1 - f.lift, cx + off + f.dx + 2, g - 1 - f.lift, PAL.steelDark)
  }
  // 身体
  bodyOval(s, cx, cy, bw, bh, C)
  // 折翅（背上一片，翼尖后拖）
  s.poly([[cx - bw * 0.3, cy - bh * 0.6], [cx + bw * 0.9, cy - bh * 0.9], [cx - bw * 0.6, cy + bh * 0.5]], C.bodyD)
  s.poly([[cx - bw * 0.1, cy - bh * 0.5], [cx + bw * 0.7, cy - bh * 0.75], [cx - bw * 0.45, cy + bh * 0.35]], C.trim, 0.7)
  s.line(cx - bw * 0.2, cy - bh * 0.4, cx + bw * 0.6, cy - bh * 0.6, C.crack, 0.8)
  // 尾羽
  s.poly([[cx - bw * 0.7, cy], [cx - bw * 1.5, cy + bh * 0.5], [cx - bw * 1.1, cy - bh * 0.3]], C.bodyD)
  s.line(cx - bw * 0.9, cy + bh * 0.1, cx - bw * 1.35, cy + bh * 0.35, C.crack, 0.8)
  // 头 + 楔喙
  const hx = cx + bw * 0.95
  const hy = cy - bh * (dead ? -0.5 : 0.34)
  headOval(s, hx, hy, bw * 0.42, bh * 0.4, C)
  s.poly([[hx + bw * 0.18, hy - bh * 0.12], [hx + bw * (atk ? 1.1 : 0.9), hy + bh * (atk ? 0.18 : 0.02)], [hx + bw * 0.18, hy + bh * 0.16]], PAL.steelDark)
  s.px(hx + bw * 0.6, hy, C.trim)
  eyeSet(s, P, C, hx + bw * 0.08, hy - bh * 0.04, Math.max(1, bh * 0.13), C.trim)
  // 冠羽
  s.line(hx - bw * 0.1, hy - bh * 0.35, hx - bw * 0.3, hy - bh * 0.7, C.crack)
  markOf(s, C, cx - bw * 0.6, cy - bh * 0.8, bw * 0.9, bh * 0.9)
  motifDetail(s, P, C, cx - bw * 0.8, cy - bh * 0.8, bw * 1.5, bh * 1.3)
}

/** 蛾：竖立大翅、眼斑、绒毛身体、羽状触角。 */
function avianMoth(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.43
  const cy = g - s.h * (dead ? 0.12 : 0.26)
  const flap = dead ? 0 : (P.anim === 'run' ? (P.i % 2 ? 0.9 : 1) : P.anim === 'attack' ? 1.25 : 1)
  s.shadow(cx, g - 0.5, s.w * 0.18, 1.6, 0.3)
  // 两片竖立大翅（背后）
  for (const side of [-1, 1]) {
    const wx = cx + side * s.w * 0.05
    s.poly(
      [
        [wx, cy - s.h * 0.02],
        [wx + side * s.w * 0.18, cy - s.h * 0.32 * flap],
        [wx + side * s.w * 0.1, cy + s.h * 0.04],
        [wx + side * s.w * 0.22, cy + s.h * 0.14],
      ],
      side < 0 ? C.bodyD : C.body,
    )
    // 眼斑
    s.disc(wx + side * s.w * 0.11, cy - s.h * 0.14 * flap, Math.max(1.4, s.w * 0.03), C.trim)
    s.disc(wx + side * s.w * 0.11, cy - s.h * 0.14 * flap, Math.max(0.8, s.w * 0.015), PAL.void)
  }
  // 绒毛身体（多段）
  for (let i = 0; i < 3; i++) {
    s.ell(cx + i * s.w * 0.05 - s.w * 0.04, cy + s.h * (0.06 - i * 0.01), s.w * 0.09, s.h * 0.085, C.bodyD)
    s.ell(cx + i * s.w * 0.05 - s.w * 0.04, cy + s.h * (0.06 - i * 0.01) - 1, s.w * 0.08, s.h * 0.07, C.body)
  }
  s.ell(cx + s.w * 0.02, cy + s.h * 0.03, s.w * 0.1, s.h * 0.09, C.bodyL, 0.5)
  // 头 + 羽状触角
  const hx = cx + s.w * 0.16
  const hy = cy - s.h * 0.04
  headOval(s, hx, hy, s.w * 0.06, s.h * 0.055, C)
  for (const side of [-1, 1]) {
    s.line(hx, hy - s.h * 0.04, hx + side * s.w * 0.08, hy - s.h * 0.2, C.crack)
    for (let i = 1; i < 4; i++) s.line(hx + side * s.w * 0.08 * (i / 4), hy - s.h * 0.04 - s.h * 0.16 * (i / 4), hx + side * s.w * 0.1 * (i / 4), hy - s.h * 0.05 - s.h * 0.18 * (i / 4), C.crack)
  }
  eyeSet(s, P, C, hx, hy, Math.max(1, s.h * 0.014))
  // 细腿
  for (const off of [-2, 2]) s.thick(cx + off, cy + s.h * 0.1, cx + off, g - 1, Math.max(0.7, s.w * 0.008), PAL.steelDark)
  markOf(s, C, cx - s.w * 0.1, cy - s.h * 0.02, s.w * 0.16, s.h * 0.1)
  motifDetail(s, P, C, cx - s.w * 0.14, cy - s.h * 0.05, s.w * 0.26, s.h * 0.16)
}

/** 蝙蝠：张开的膜翼、大耳、獠牙、悬爪。 */
function avianBat(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.44
  const cy = g - s.h * (dead ? 0.14 : 0.3)
  const atk = P.anim === 'attack'
  const spread = dead ? 0.4 : atk ? 1.3 : P.anim === 'run' ? (P.i % 2 ? 1.1 : 0.8) : 0.95
  const bw = s.w * 0.11
  s.shadow(cx, g - 0.5, s.w * 0.2, 1.6, 0.25)
  // 两侧膜翼（扇骨 + 膜）
  for (const side of [-1, 1]) {
    const wy = cy - s.h * 0.1 * spread
    s.poly(
      [
        [cx + side * bw * 0.6, cy - s.h * 0.04],
        [cx + side * s.w * 0.3, wy - s.h * 0.12],
        [cx + side * s.w * 0.36, cy + s.h * 0.06],
        [cx + side * s.w * 0.2, cy + s.h * 0.1],
        [cx + side * s.w * 0.12, cy + s.h * 0.05],
      ],
      side < 0 ? C.body : C.bodyD,
    )
    for (let i = 0; i < 3; i++) {
      s.line(cx + side * bw * 0.6, cy - s.h * 0.02, cx + side * s.w * (0.3 - i * 0.05), wy - s.h * 0.1 + i * s.h * 0.06, C.crack, 0.8)
    }
    s.px(cx + side * s.w * 0.36, cy + s.h * 0.06, PAL.boneDark)
  }
  // 躯干
  bodyOval(s, cx, cy, bw, s.h * 0.1, C)
  // 头 + 大耳
  const hx = cx + bw * 0.6
  const hy = cy - s.h * 0.06
  headOval(s, hx, hy, bw * 0.8, s.h * 0.08, C)
  for (const ex of [-bw * 0.5, bw * 0.4]) {
    s.poly([[hx + ex, hy - s.h * 0.05], [hx + ex + bw * 0.4, hy - s.h * 0.17], [hx + ex + bw * 0.7, hy - s.h * 0.04]], C.bodyD)
    s.px(hx + ex + bw * 0.4, hy - s.h * 0.13, PAL.bloodDark)
  }
  // 吻 + 獠牙
  s.ell(hx + bw * 0.7, hy + s.h * 0.03, bw * 0.45, s.h * 0.045, C.bodyD)
  s.px(hx + bw * 0.8, hy + s.h * 0.06, PAL.bone)
  s.px(hx + bw * 1.0, hy + s.h * 0.05, PAL.bone)
  if (atk) {
    s.poly([[hx + bw * 0.7, hy + s.h * 0.03], [hx + bw * 1.5, hy + s.h * 0.05], [hx + bw * 0.7, hy + s.h * 0.09]], PAL.bloodDark)
    P.g.push({ x: hx + bw * 1.2, y: hy + s.h * 0.06, r: s.w * 0.12, c: C.glow, p: 0.4 })
  }
  eyeSet(s, P, C, hx + bw * 0.25, hy - s.h * 0.02, Math.max(1, s.h * 0.013), PAL.neonRed)
  // 悬爪
  for (const off of [-3, 3]) s.thick(cx + off, cy + s.h * 0.09, cx + off, g - 4, Math.max(0.7, s.w * 0.007), PAL.steelDark)
  markOf(s, C, cx - bw * 0.7, cy - s.h * 0.09, bw * 1.1, s.h * 0.1)
  motifDetail(s, P, C, cx - bw * 0.9, cy - s.h * 0.1, bw * 1.6, s.h * 0.18)
}

/** 鹭：超长腿、S 形长颈、尖长喙、背上折翅。 */
function avianHeron(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const cx = s.w * 0.45
  const bodyY = g - s.h * (dead ? 0.14 : 0.42)
  const atk = P.anim === 'attack'
  s.shadow(cx, g - 0.5, s.w * 0.16, 1.6, 0.3)
  // 两条极细长腿
  for (const off of [-s.w * 0.05, s.w * 0.06]) {
    const f = dead ? { dx: 0, lift: 0 } : foot(P, off > 0 ? 1 : 0, 4, 2.4)
    s.thick(cx + off, bodyY + s.h * 0.06, cx + off + f.dx * 0.6, g - s.h * 0.1, Math.max(0.7, s.w * 0.008), C.bodyD)
    s.thick(cx + off + f.dx * 0.6, g - s.h * 0.1, cx + off + f.dx, g - 1 - f.lift, Math.max(0.6, s.w * 0.007), PAL.steelDark)
    s.line(cx + off + f.dx - 2, g - 1 - f.lift, cx + off + f.dx + 2, g - 1 - f.lift, PAL.steelDark)
  }
  // 身体
  s.ell(cx, bodyY, s.w * 0.16, s.h * 0.085, C.bodyD)
  s.ell(cx, bodyY - 1, s.w * 0.15, s.h * 0.075, C.body)
  s.ell(cx - s.w * 0.05, bodyY - s.h * 0.03, s.w * 0.07, s.h * 0.03, C.bodyL)
  // 背上折翅
  s.poly([[cx - s.w * 0.12, bodyY - s.h * 0.02], [cx + s.w * 0.1, bodyY - s.h * 0.08], [cx - s.w * 0.18, bodyY + s.h * 0.05]], C.trim, 0.75)
  s.line(cx - s.w * 0.1, bodyY - s.h * 0.01, cx + s.w * 0.06, bodyY - s.h * 0.05, C.crack, 0.7)
  // 长尾羽
  s.poly([[cx - s.w * 0.15, bodyY], [cx - s.w * 0.32, bodyY + s.h * 0.08], [cx - s.w * 0.12, bodyY + s.h * 0.04]], C.bodyD)
  // S 形长颈 + 头
  const nx = cx + s.w * (atk ? 0.2 : 0.1)
  const ny = bodyY - s.h * (atk ? 0.26 : 0.3)
  const hx = cx + s.w * (atk ? 0.26 : 0.16)
  const hy = bodyY - s.h * (atk ? 0.34 : 0.42)
  s.thick(cx + s.w * 0.06, bodyY - s.h * 0.06, nx, ny + s.h * 0.04, Math.max(0.8, s.w * 0.012), C.body)
  s.thick(nx, ny + s.h * 0.04, hx, hy + s.h * 0.03, Math.max(0.8, s.w * 0.012), C.body)
  headOval(s, hx, hy + s.h * 0.02, s.w * 0.035, s.h * 0.035, C)
  s.poly([[hx + s.w * 0.02, hy], [hx + s.w * (atk ? 0.26 : 0.2), hy + s.h * 0.015], [hx + s.w * 0.02, hy + s.h * 0.035]], PAL.neonWarm)
  eyeSet(s, P, C, hx + s.w * 0.012, hy, Math.max(1, s.h * 0.012))
  // 冠羽（v 决定长度）
  for (let i = 0; i < 3; i++) s.line(hx - s.w * 0.02, hy - s.h * 0.03, hx - s.w * (0.05 + i * 0.02), hy - s.h * (0.07 + v * 0.02 + i * 0.01), C.trim)
  markOf(s, C, cx - s.w * 0.1, bodyY - s.h * 0.06, s.w * 0.16, s.h * 0.07)
  motifDetail(s, P, C, cx - s.w * 0.14, bodyY - s.h * 0.08, s.w * 0.26, s.h * 0.13)
}

/* ------------------------------- serpent -------------------------------- */

/** 蝰蛇：贴地三层盘绕，三角头前探，攻击帧张开毒牙。 */
function serpentViper(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.34
  const r = s.h * (0.085 + v * 0.01)
  const cy = g - r * 1.1
  const hx = s.w * (atk ? 0.84 : 0.72)
  const hy = g - s.h * (dead ? 0.14 : atk ? 0.26 : 0.32)
  shadowOf(s, cx + s.w * 0.08, s.w * 0.34, 0.4)
  // 盘身：三层扁环自下而上收窄
  for (let i = 0; i < 3; i++) {
    const rr = r * (1.5 - i * 0.3)
    const yy = cy - i * r * 0.72
    s.ell(cx + i * r * 0.35, yy, rr * 1.45, rr * 0.6, C.bodyD)
    s.ell(cx + i * r * 0.35, yy - 1, rr * 1.35, rr * 0.48, C.body)
    bodyLine(s, cx - rr * 0.8, yy, cx + rr * 1.2, yy, C.crack, 0.55)
  }
  // 颈：从顶环向右上伸
  const nx = cx + s.w * 0.42
  const ny = cy - r * 1.2
  s.thick(cx + r * 0.8, cy - r * 1.5, nx, ny, Math.max(1.2, r * 0.8), C.bodyD)
  s.thick(cx + r * 0.8, cy - r * 1.6, nx, ny - 1, Math.max(1, r * 0.58), C.body)
  s.thick(nx, ny, hx - s.w * 0.05, hy + s.h * 0.03, Math.max(1, r * 0.55), C.bodyD)
  // 三角头 + 颌
  const jaw = s.h * (atk ? 0.075 : 0.022)
  s.poly([[hx - s.w * 0.08, hy - s.h * 0.055], [hx + s.w * 0.11, hy - s.h * 0.012], [hx + s.w * 0.06, hy + jaw * 0.6], [hx - s.w * 0.07, hy + s.h * 0.025]], C.bodyD)
  s.poly([[hx - s.w * 0.06, hy - s.h * 0.045], [hx + s.w * 0.09, hy - s.h * 0.01], [hx - s.w * 0.01, hy + jaw * 0.45]], C.body)
  if (atk) s.poly([[hx - s.w * 0.02, hy + s.h * 0.005], [hx + s.w * 0.13, hy + jaw], [hx - s.w * 0.03, hy + jaw * 0.92]], PAL.bloodDark)
  s.px(hx + s.w * 0.035, hy + jaw * 0.72, PAL.bone)
  s.px(hx + s.w * 0.06, hy + jaw * 0.64, PAL.bone)
  if (!dead) s.line(hx + s.w * 0.07, hy + jaw * 0.4, hx + s.w * (atk ? 0.18 : 0.13), hy + s.h * 0.01, PAL.blood, 0.85)
  eyeSet(s, P, C, hx + s.w * 0.005, hy - s.h * 0.028, Math.max(1, s.h * 0.016), PAL.neonWarm)
  // 颈背鳞
  for (let i = 1; i < 4; i++) {
    const t = i / 5
    const lx = cx + r * 0.8 + (nx - cx) * t
    const ly = cy - r * 1.5 + (ny - cy) * t
    s.poly([[lx, ly - r], [lx + 2, ly - r * 1.9], [lx + 4, ly - r]], C.trim, 0.7)
  }
  markOf(s, C, cx - r * 1.2, cy - r * 0.5, r * 2.4, r * 1.1)
  motifDetail(s, P, C, cx - r * 1.4, cy - r * 0.75, r * 2.8, r * 1.6)
}

/** 眼镜蛇：底盘 + 直立颈干 + 展开的兜帽，攻击帧兜帽撑满。 */
function serpentCobra(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.4
  const r = s.h * (0.09 + v * 0.008)
  const cy = g - r
  const headY = s.h * (dead ? 0.36 : atk ? 0.18 : 0.24)
  const hx = s.w * (atk ? 0.58 : 0.52)
  shadowOf(s, cx, s.w * 0.3, 0.4)
  // 底盘盘圈
  s.ell(cx, cy, r * 2.2, r * 0.7, C.bodyD)
  s.ell(cx, cy - 1, r * 2.0, r * 0.55, C.body)
  s.ell(cx + r * 0.3, cy - r * 0.5, r * 1.5, r * 0.5, C.bodyD)
  s.ell(cx + r * 0.3, cy - r * 0.6, r * 1.35, r * 0.4, C.body)
  // 竖直颈干
  s.thick(cx + r * 0.2, cy - r * 0.8, hx, headY + s.h * 0.12, r * 0.95, C.bodyD)
  s.thick(cx + r * 0.2, cy - r * 0.9, hx, headY + s.h * 0.13, r * 0.72, C.body)
  // 兜帽：外暗内亮两层菱形
  const hw = s.w * (dead ? 0.12 : 0.23) * (atk ? 1.15 : 1)
  const hh = s.h * (dead ? 0.16 : 0.3)
  s.poly([[hx, headY - hh], [hx + hw, headY + hh * 0.35], [hx + hw * 0.4, headY + hh], [hx - hw * 0.4, headY + hh], [hx - hw, headY + hh * 0.35]], C.bodyD)
  s.poly([[hx, headY - hh * 0.82], [hx + hw * 0.82, headY + hh * 0.35], [hx + hw * 0.3, headY + hh * 0.9], [hx - hw * 0.3, headY + hh * 0.9], [hx - hw * 0.82, headY + hh * 0.35]], C.body)
  s.ell(hx, headY + hh * 0.42, hw * 0.52, hh * 0.32, C.bodyL, 0.3)
  // 兜帽上的“眼镜”斑
  for (const side of [-1, 1]) s.ell(hx + side * hw * 0.34, headY + hh * 0.36, hw * 0.15, hh * 0.09, C.trim, 0.8)
  // 头 + 舌
  headOval(s, hx, headY + hh * 0.5, hw * 0.42, hh * 0.26, C)
  s.poly([[hx - hw * 0.16, headY + hh * 0.5], [hx + hw * (atk ? 0.7 : 0.5), headY + hh * (atk ? 0.66 : 0.55)], [hx - hw * 0.1, headY + hh * 0.7]], C.bodyD)
  if (!dead) s.line(hx + hw * 0.4, headY + hh * 0.6, hx + hw * 0.62, headY + hh * (atk ? 0.76 : 0.62), PAL.blood, 0.85)
  eyeSet(s, P, C, hx + hw * 0.02, headY + hh * 0.46, Math.max(1, s.h * 0.014), PAL.neonWarm)
  markOf(s, C, hx - hw * 0.45, headY + hh * 0.16, hw * 0.9, hh * 0.5)
  motifDetail(s, P, C, hx - hw * 0.7, headY, hw * 1.4, hh * 0.9)
}

/** 海鳗：横向长带身、连续背鳍、大张口与密齿。 */
function serpentEel(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const y0 = g - s.h * (dead ? 0.14 : 0.24)
  const x0 = s.w * 0.06
  const len = s.w * 0.8
  const n = 14
  const amp = s.h * (dead ? 0.02 : 0.06 + v * 0.012)
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push([x0 + t * len, y0 - Math.sin(t * Math.PI * 2 + P.i * 0.55) * amp * t])
  }
  shadowOf(s, x0 + len * 0.5, len * 0.4, 0.3)
  // 带状身体
  for (let i = 0; i < n; i++) {
    const t = i / n
    const r = Math.max(1.4, s.h * (0.09 - t * 0.045))
    s.thick(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, C.bodyD)
    s.thick(pts[i][0], pts[i][1] - 1, pts[i + 1][0], pts[i + 1][1] - 1, r * 0.62, C.body)
  }
  // 连续背鳍膜
  for (let i = 1; i < n - 2; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    s.poly([[ax, ay], [ax + 2, ay - s.h * (0.07 + (i % 3) * 0.018)], [bx, by]], C.trim, 0.65)
  }
  // 胸鳍
  const [mx, my] = pts[3]
  s.poly([[mx, my], [mx - 3, my + s.h * 0.1], [mx + 4, my + s.h * 0.04]], C.trim, 0.75)
  // 大张口 + 密齿
  const [hx, hy] = pts[n]
  headOval(s, hx, hy, s.w * 0.07, s.h * 0.075, C)
  const jaw = s.h * (atk ? 0.09 : 0.045)
  s.poly([[hx - s.w * 0.02, hy - s.h * 0.02], [hx + s.w * 0.13, hy - jaw], [hx + s.w * 0.1, hy + jaw], [hx - s.w * 0.02, hy + s.h * 0.02]], C.bodyD)
  for (let i = 0; i < 4; i++) {
    s.px(hx + s.w * (0.04 + i * 0.02), hy - jaw * 0.55, PAL.bone)
    s.px(hx + s.w * (0.05 + i * 0.02), hy + jaw * 0.55, PAL.bone)
  }
  if (atk) P.g.push({ x: hx + s.w * 0.12, y: hy, r: s.w * 0.1, c: C.glow, p: 0.5 })
  eyeSet(s, P, C, hx + s.w * 0.015, hy - s.h * 0.04, Math.max(1, s.h * 0.015), PAL.neonCold)
  markOf(s, C, x0 + len * 0.35, y0 - s.h * 0.09, len * 0.22, s.h * 0.12)
  motifDetail(s, P, C, x0 + len * 0.2, y0 - s.h * 0.1, len * 0.5, s.h * 0.18)
}

/** 藤蛇：直立三圈弹簧身、两侧叶片与刺，顶端花苞头。 */
function serpentVine(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const r = Math.max(1.4, s.h * (0.045 + v * 0.006))
  const sway = dead ? 0 : Math.sin(P.i * 0.6) * s.w * 0.012
  shadowOf(s, cx, s.w * 0.2, 0.35)
  // 根茎
  s.thick(cx - s.w * 0.1, g - 1, cx, g - s.h * 0.06, r * 1.5, C.bodyD)
  // 三圈弹簧
  for (let c = 0; c < 3; c++) {
    const yy = g - s.h * (0.12 + c * 0.19)
    const rx = s.w * (0.19 - c * 0.012)
    const ry = r * (2.4 - c * 0.25)
    const seg = 14
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU
      const a1 = ((k + 1) / seg) * TAU
      const x0 = cx + Math.cos(a0) * rx + sway * (c + 1) * 0.4
      const y0 = yy + Math.sin(a0) * ry
      const x1 = cx + Math.cos(a1) * rx + sway * (c + 1) * 0.4
      const y1 = yy + Math.sin(a1) * ry
      s.thick(x0, y0, x1, y1, r, C.bodyD)
      s.thick(x0, y0 - 1, x1, y1 - 1, r * 0.6, C.body)
    }
    // 叶片 + 刺
    for (const side of [-1, 1]) {
      const lx = cx + side * rx + sway * (c + 1) * 0.4
      s.poly([[lx, yy], [lx + side * s.w * 0.09, yy - s.h * 0.05], [lx + side * s.w * 0.03, yy + s.h * 0.035]], C.trim, 0.9)
      s.px(lx + side * s.w * 0.02, yy - s.h * 0.03, C.bodyL)
    }
  }
  // 顶端花苞头
  const hx = cx + sway * 1.4
  const hy = g - s.h * (0.12 + 3 * 0.19) - r * 0.7
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI * 0.5 + (k / 4) * TAU
    s.poly([[hx, hy], [hx + Math.cos(a) * s.w * 0.09, hy + Math.sin(a) * s.h * 0.06], [hx + Math.cos(a + 0.5) * s.w * 0.05, hy + Math.sin(a + 0.5) * s.h * 0.04]], k % 2 ? C.bodyD : C.body)
  }
  s.disc(hx, hy, Math.max(1.4, s.h * 0.03), C.glow)
  s.disc(hx, hy, Math.max(0.7, s.h * 0.014), PAL.white)
  P.g.push({ x: hx, y: hy, r: s.w * (atk ? 0.18 : 0.13), c: C.glow, p: atk ? 0.85 : 0.55 })
  eyeSet(s, P, C, hx, hy - s.h * 0.01, Math.max(1, s.h * 0.012))
  markOf(s, C, cx - s.w * 0.17, g - s.h * 0.2, s.w * 0.34, s.h * 0.1)
  motifDetail(s, P, C, cx - s.w * 0.18, g - s.h * 0.26, s.w * 0.36, s.h * 0.18)
}

/* ------------------------------ crustacean ------------------------------ */

/** 螃蟹：宽扁甲壳、八条折腿、双螯与眼柄。 */
function crustCrab(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const cy = g - s.h * (dead ? 0.16 : 0.3)
  const bw = s.w * (0.24 + v * 0.012)
  const bh = s.h * 0.16
  shadowOf(s, cx, bw * 1.2, 0.4)
  // 八条折腿
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const f = dead ? { dx: 0, lift: 0 } : foot(P, i + (side > 0 ? 0 : 2), 4, 2.2)
      const kx = cx + side * (bw * 0.55 + i * bw * 0.2)
      const ky = cy - bh * 0.1 - i * bh * 0.11
      const fx = kx + side * s.w * 0.08 + f.dx
      const fy = g - 1 - f.lift
      s.thick(cx + side * bw * 0.5, cy + bh * 0.2, kx, ky, Math.max(0.8, s.h * 0.014), C.bodyD)
      s.thick(kx, ky, fx, fy, Math.max(0.7, s.h * 0.011), C.bodyD)
      s.line(fx - side * 2, fy, fx + side * 3, fy, C.trim, 0.8)
    }
  }
  // 甲壳
  s.ell(cx, cy, bw, bh, C.bodyD)
  s.ell(cx, cy - 1, bw * 0.94, bh * 0.82, C.body)
  s.ell(cx - bw * 0.22, cy - bh * 0.4, bw * 0.45, bh * 0.3, C.bodyL, 0.55)
  bodyLine(s, cx - bw * 0.72, cy - bh * 0.1, cx + bw * 0.72, cy - bh * 0.1, C.crack, 0.8)
  bodyLine(s, cx - bw * 0.5, cy + bh * 0.3, cx + bw * 0.5, cy + bh * 0.3, C.crack, 0.6)
  // 眼柄
  for (const side of [-1, 1]) {
    const ex = cx + side * bw * 0.3
    const ey = cy - bh * (atk ? 1.55 : 1.3)
    s.thick(cx + side * bw * 0.18, cy - bh * 0.7, ex, ey, Math.max(0.7, s.h * 0.011), C.bodyD)
    s.disc(ex, ey, Math.max(1.1, s.h * 0.018), C.bodyD)
  }
  eyeSet(s, P, C, cx, cy - bh * (atk ? 1.5 : 1.25), Math.max(1, s.h * 0.013))
  // 双螯
  for (const side of [-1, 1]) {
    const ex = cx + side * bw * (atk ? 1.45 : 1.15) + (atk ? s.w * 0.04 : 0)
    const ey = cy - (atk ? bh * 0.9 : bh * 0.15)
    s.thick(cx + side * bw * 0.5, cy + bh * 0.25, ex, ey, Math.max(1.2, s.h * 0.024), C.bodyD)
    s.thick(cx + side * bw * 0.5, cy + bh * 0.25, ex, ey - 1, Math.max(0.9, s.h * 0.018), C.body)
    s.poly([[ex, ey - bh * 0.32], [ex + side * bw * 0.35, ey - bh * 0.5], [ex + side * bw * 0.28, ey]], C.bodyD)
    s.poly([[ex, ey + bh * 0.3], [ex + side * bw * 0.35, ey + bh * 0.45], [ex + side * bw * 0.26, ey]], C.body)
    if (atk) P.g.push({ x: ex + side * bw * 0.25, y: ey, r: s.w * 0.08, c: C.glow, p: 0.45 })
  }
  // 口器
  s.ell(cx + bw * 0.12, cy + bh * 0.72, bw * 0.3, bh * 0.2, C.bodyD)
  markOf(s, C, cx - bw * 0.5, cy - bh * 0.62, bw * 0.8, bh * 0.5)
  motifDetail(s, P, C, cx - bw * 0.78, cy - bh * 0.7, bw * 1.55, bh * 1.1)
}

/** 蝎子：低伏分节体、过顶弧形尾与毒针、前伸双螯。 */
function crustScorpion(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.4
  const cy = g - s.h * (dead ? 0.12 : 0.18)
  const bw = s.w * (0.18 + v * 0.01)
  const bh = s.h * 0.1
  shadowOf(s, cx, s.w * 0.36, 0.4)
  // 八条腿
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const f = dead ? { dx: 0, lift: 0 } : foot(P, i + (side > 0 ? 0 : 2), 4, 2)
      const kx = cx + side * (bw * 0.6 + i * bw * 0.2)
      const ky = cy - bh * 0.5 - i * bh * 0.1
      s.thick(cx + side * bw * 0.5, cy, kx, ky, Math.max(0.8, s.h * 0.011), C.bodyD)
      s.thick(kx, ky, kx + side * s.w * 0.06 + f.dx, g - 1 - f.lift, Math.max(0.7, s.h * 0.01), C.bodyD)
    }
  }
  // 体节：前宽后窄
  for (let i = 0; i < 3; i++) {
    const sx = cx + bw * (0.5 - i * 0.55)
    s.ell(sx, cy, bw * (0.72 - i * 0.1), bh * (0.9 - i * 0.08), C.bodyD)
    s.ell(sx, cy - 1, bw * (0.66 - i * 0.1), bh * (0.74 - i * 0.08), C.body)
    s.line(sx - bw * 0.4, cy + bh * 0.4, sx + bw * 0.4, cy + bh * 0.4, C.crack, 0.6)
  }
  // 尾：从体后弧过头顶
  const ax = cx - bw * 0.9
  const ay = cy - bh * 0.2
  const R = s.h * (dead ? 0.14 : atk ? 0.27 : 0.24)
  const tail = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const a = Math.PI * (1.02 - t * 0.8)
    tail.push([ax + Math.cos(a) * R * 0.7, ay - Math.sin(a) * R])
  }
  for (let i = 0; i < 8; i++) {
    s.thick(tail[i][0], tail[i][1], tail[i + 1][0], tail[i + 1][1], Math.max(1, s.h * (0.034 - i * 0.002)), C.bodyD)
  }
  for (let i = 1; i < 8; i += 2) s.px(tail[i][0], tail[i][1] - 1, C.trim, 0.8)
  const [sx0, sy0] = tail[8]
  s.disc(sx0, sy0, Math.max(1.5, s.h * 0.045), C.bodyD)
  s.disc(sx0, sy0, Math.max(0.9, s.h * 0.026), C.trim)
  s.poly([[sx0, sy0 - s.h * 0.03], [sx0 + s.w * (atk ? 0.1 : 0.07), sy0 - s.h * 0.1], [sx0 + s.w * 0.02, sy0 - s.h * 0.01]], PAL.bone)
  P.g.push({ x: sx0 + s.w * 0.04, y: sy0 - s.h * 0.06, r: s.w * 0.1, c: C.glow, p: atk ? 0.9 : 0.45 })
  // 前螯
  for (const side of [-1, 1]) {
    const ex = cx + bw * (atk ? 1.5 : 1.2) + s.w * 0.05
    const ey = cy + side * bh * (side > 0 ? 0.55 : 0.05)
    s.thick(cx + bw * 0.6, cy + side * bh * 0.25, ex, ey, Math.max(1, s.h * 0.017), C.bodyD)
    s.poly([[ex, ey - bh * 0.3], [ex + bw * 0.4, ey - bh * 0.42], [ex + bw * 0.3, ey + bh * 0.05]], C.bodyD)
    s.poly([[ex, ey + bh * 0.25], [ex + bw * 0.4, ey + bh * 0.36], [ex + bw * 0.28, ey - bh * 0.05]], C.body)
  }
  eyeSet(s, P, C, cx + bw * 0.75, cy - bh * 0.35, Math.max(1, s.h * 0.013))
  markOf(s, C, cx - bw * 0.4, cy - bh * 0.7, bw * 0.9, bh * 0.6)
  motifDetail(s, P, C, cx - bw * 0.7, cy - bh * 0.8, bw * 1.5, bh * 1.2)
}

/** 寄居蟹：占半幅的螺旋壳、壳口探出的小身体、单螯与眼柄。 */
function crustHermit(s, P, C) {
  const g = s.h - 2
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const R = Math.max(4, Math.min(s.w * 0.3, s.h * (dead ? 0.2 : 0.27)))
  const sx = s.w * 0.32
  const sy = g - R * 0.95
  const bx = s.w * (atk ? 0.76 : 0.67)
  const by = g - s.h * 0.16
  shadowOf(s, s.w * 0.45, s.w * 0.34, 0.4)
  // 三对步足
  for (let i = 0; i < 3; i++) {
    const f = dead ? { dx: 0, lift: 0 } : foot(P, i, 4, 2)
    s.thick(bx - 2, by, bx + s.w * (0.06 + i * 0.035) + f.dx, g - 1 - f.lift, Math.max(0.8, s.h * 0.012), C.bodyD)
  }
  // 螺旋壳
  s.disc(sx, sy, R, C.bodyD)
  s.disc(sx, sy - 1, R * 0.94, C.body)
  for (let ring = 0; ring < 3; ring++) {
    const rr = R * (0.78 - ring * 0.22)
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * TAU + ring * 0.6
      const a1 = ((k + 1) / 12) * TAU + ring * 0.6
      s.line(sx + Math.cos(a0) * rr, sy + Math.sin(a0) * rr, sx + Math.cos(a1) * rr, sy + Math.sin(a1) * rr, ring === 1 ? C.bodyL : C.crack, 0.9)
    }
  }
  s.ell(sx - R * 0.3, sy - R * 0.4, R * 0.28, R * 0.2, C.bodyL, 0.5)
  // 壳口朝向右侧
  s.ell(sx + R * 0.72, sy + R * 0.2, R * 0.3, R * 0.44, C.bodyD)
  s.ell(sx + R * 0.8, sy + R * 0.22, R * 0.2, R * 0.3, C.trim)
  // 出壳的身体
  s.ell(bx - s.w * 0.02, by, s.w * 0.09, s.h * 0.07, C.bodyD)
  s.ell(bx, by - 1, s.w * 0.08, s.h * 0.055, C.body)
  // 眼柄
  for (const side of [-1, 1]) {
    const ex = bx + side * s.w * 0.03
    const ey = by - s.h * (atk ? 0.17 : 0.14)
    s.thick(bx, by - s.h * 0.05, ex, ey, Math.max(0.7, s.h * 0.01), C.bodyD)
    s.disc(ex, ey, Math.max(1, s.h * 0.016), C.bodyD)
  }
  eyeSet(s, P, C, bx + s.w * 0.01, by - s.h * 0.14, Math.max(1, s.h * 0.012))
  // 单螯
  const ex = bx + s.w * (atk ? 0.16 : 0.12)
  const ey = by - s.h * (atk ? 0.12 : 0.07)
  s.thick(bx + s.w * 0.03, by, ex, ey, Math.max(1, s.h * 0.016), C.bodyD)
  s.poly([[ex, ey - s.h * 0.04], [ex + s.w * 0.07, ey - s.h * 0.06], [ex + s.w * 0.05, ey + s.h * 0.01]], C.bodyD)
  s.poly([[ex, ey + s.h * 0.03], [ex + s.w * 0.07, ey + s.h * 0.05], [ex + s.w * 0.04, ey]], C.body)
  if (atk) P.g.push({ x: ex + s.w * 0.05, y: ey, r: s.w * 0.07, c: C.glow, p: 0.4 })
  markOf(s, C, sx - R * 0.55, sy - R * 0.6, R * 1.1, R * 0.9)
  motifDetail(s, P, C, sx - R * 0.75, sy - R * 0.7, R * 1.5, R * 1.3)
}

/** 龙虾：尾扇、四节腹甲、头胸甲、超长触须与前伸双螯。 */
function crustLobster(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const y = g - s.h * (dead ? 0.15 : 0.24)
  const x0 = s.w * 0.1
  const len = s.w * 0.55
  shadowOf(s, s.w * 0.46, s.w * 0.38, 0.35)
  // 尾扇
  for (let i = 0; i < 3; i++) {
    s.poly([[x0 + s.w * 0.03, y], [x0 - s.w * 0.02, y + s.h * (0.02 + i * 0.05)], [x0 + s.w * 0.08, y + s.h * (0.04 + i * 0.02)]], i === 1 ? C.body : C.bodyD)
  }
  // 四节腹甲
  for (let i = 0; i < 4; i++) {
    const sx = x0 + len * 0.12 + i * len * 0.21
    const rr = s.h * (0.1 - i * 0.006)
    s.ell(sx, y, rr * 1.25, rr, C.bodyD)
    s.ell(sx, y - 1, rr * 1.16, rr * 0.86, C.body)
    s.line(sx - rr, y + rr * 0.45, sx + rr, y + rr * 0.45, C.crack, 0.7)
  }
  // 头胸甲
  const hx = x0 + len
  s.ell(hx, y - s.h * 0.01, s.w * (0.12 + v * 0.005), s.h * 0.085, C.bodyD)
  s.ell(hx, y - s.h * 0.02, s.w * (0.11 + v * 0.005), s.h * 0.075, C.body)
  s.poly([[hx + s.w * 0.03, y - s.h * 0.07], [hx + s.w * 0.12, y], [hx + s.w * 0.03, y + s.h * 0.05]], C.bodyD)
  // 超长触须
  for (let i = 0; i < 2; i++) {
    const ay = y - s.h * (0.05 + i * 0.05)
    const sw = dead ? 0 : Math.sin(P.i * 0.9 + i) * s.h * 0.02
    s.thick(hx + s.w * 0.06, ay, s.w * 0.95, ay - s.h * (0.18 - i * 0.1) + sw, Math.max(0.6, s.h * 0.008), C.trim)
    s.px(s.w * 0.95, ay - s.h * (0.18 - i * 0.1) + sw, C.bodyL)
  }
  // 步足
  for (let i = 0; i < 3; i++) {
    const f = dead ? { dx: 0, lift: 0 } : foot(P, i, 4, 2)
    s.thick(x0 + len * (0.4 + i * 0.18), y + s.h * 0.04, x0 + len * (0.45 + i * 0.18) + f.dx, g - 1 - f.lift, Math.max(0.6, s.h * 0.008), C.bodyD)
  }
  // 双螯
  for (const side of [-1, 1]) {
    const ex = hx + s.w * (atk ? 0.24 : 0.18)
    const ey = y + side * s.h * (atk ? 0.13 : 0.09)
    s.thick(hx + s.w * 0.05, y, ex, ey, Math.max(1.1, s.h * 0.016), C.bodyD)
    s.poly([[ex, ey - s.h * 0.045], [ex + s.w * 0.09, ey - s.h * 0.07], [ex + s.w * 0.07, ey + s.h * 0.005]], C.bodyD)
    s.poly([[ex, ey + s.h * 0.04], [ex + s.w * 0.09, ey + s.h * 0.06], [ex + s.w * 0.06, ey - s.h * 0.005]], C.body)
    if (atk) P.g.push({ x: ex + s.w * 0.07, y: ey, r: s.w * 0.07, c: C.glow, p: 0.4 })
  }
  eyeSet(s, P, C, hx + s.w * 0.02, y - s.h * 0.055, Math.max(1, s.h * 0.012))
  markOf(s, C, x0 + len * 0.45, y - s.h * 0.08, s.w * 0.2, s.h * 0.12)
  motifDetail(s, P, C, x0 + len * 0.28, y - s.h * 0.09, s.w * 0.3, s.h * 0.15)
}

/* -------------------------------- blob ---------------------------------- */

/** 软泥：半圆凝胶体、摊开的底缘、滴落与内部亮核。 */
function blobSlime(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.45
  const wob = dead ? 0.78 : 1 + (P.anim === 'run' ? 0.05 * Math.sin(P.i * 1.7) : 0.03 * Math.sin(P.i * 1.2))
  const rx = s.w * (0.3 + v * 0.012)
  const ry = s.h * (dead ? 0.14 : atk ? 0.34 : 0.3)
  const cy = g - ry * 0.9
  shadowOf(s, cx, rx * 1.05, 0.4)
  // 凝胶主体 + 摊开的底缘
  s.ell(cx, cy, rx * wob, ry / wob, C.bodyD)
  s.ell(cx, cy - 1, rx * wob * 0.94, (ry / wob) * 0.9, C.body)
  s.ell(cx, g - ry * 0.1, rx * wob * 1.05, ry * 0.28, C.bodyD)
  s.ell(cx, g - ry * 0.13, rx * wob, ry * 0.2, C.body)
  // 高光与滴落
  s.ell(cx - rx * 0.3, cy - ry * 0.35, rx * 0.35, ry * 0.25, C.bodyL, 0.6)
  for (let i = 0; i < 3; i++) s.ell(cx - rx * 0.6 + i * rx * 0.52, g - 2, rx * 0.1, s.h * 0.03, C.body)
  // 内部气泡
  const rnd = srnd(C, 21)
  for (let i = 0; i < 4; i++) {
    const bx = cx - rx * 0.5 + rnd() * rx
    const by = cy - ry * 0.25 + rnd() * ry * 0.45
    s.disc(bx, by, Math.max(0.8, s.h * 0.012), C.bodyL, 0.75)
  }
  // 内核 + 眼睛
  s.disc(cx, cy - ry * 0.2, Math.max(1.2, s.h * 0.02), C.glow)
  P.g.push({ x: cx, y: cy - ry * 0.2, r: rx * (atk ? 0.9 : 0.65), c: C.glow, p: atk ? 0.8 : 0.5 })
  eyeSet(s, P, C, cx + rx * 0.1, cy - ry * 0.15, Math.max(1.2, s.h * 0.03))
  markOf(s, C, cx - rx * 0.5, cy - ry * 0.4, rx, ry * 0.7)
  motifDetail(s, P, C, cx - rx * 0.7, cy - ry * 0.4, rx * 1.4, ry * 1.2)
}

/** 肿瘤：多叶堆叠的肉块、表面血管、底部触须与成簇的小眼。 */
function blobTumor(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const R = s.h * (dead ? 0.16 : 0.24)
  const cy = g - R * 0.9
  const rx = s.w * 0.3
  const ry = s.h * 0.28
  shadowOf(s, cx, rx * 1.05, 0.45)
  // 底部触须
  for (let i = 0; i < 5; i++) {
    const bx = cx - rx * 0.7 + i * rx * 0.36
    const sw = dead ? 0 : Math.sin(P.i * 0.9 + i) * s.w * 0.02
    s.thick(bx, g - 2, bx + sw, g - R * 0.3, Math.max(0.7, s.h * 0.01), C.bodyD)
    s.px(bx + sw, g - R * 0.28, C.trim)
  }
  // 多叶堆（每个叶一个亮面）
  const lobes = [[-0.5, 0.05, 0.5], [0.05, 0.2, 0.66], [0.5, -0.05, 0.46], [-0.12, -0.34, 0.48], [0.3, -0.32, 0.34], [-0.5, -0.3, 0.28]]
  for (const [ox, oy, rr] of lobes) {
    const bx = cx + ox * rx + (atk ? -ox * rx * 0.1 : 0)
    const by = cy + oy * ry - (atk ? s.h * 0.03 : 0)
    s.disc(bx, by, R * rr, C.bodyD)
    s.disc(bx, by - 1, R * rr * 0.9, C.body)
    s.disc(bx - R * rr * 0.3, by - R * rr * 0.35, R * rr * 0.38, C.bodyL, 0.55)
  }
  // 血管
  for (let i = 0; i < 4; i++) {
    const yy = cy - ry * 0.35 + i * ry * 0.22
    bodyLine(s, cx - rx * 0.6, yy, cx - rx * 0.1, yy + ry * 0.1, C.crack, 0.9)
    bodyLine(s, cx - rx * 0.1, yy + ry * 0.1, cx + rx * 0.45, yy - ry * 0.03, PAL.blood, 0.65)
  }
  // 眼簇：主眼 + 两个小眼
  eyeSet(s, P, C, cx + rx * 0.08, cy - ry * 0.2, Math.max(1.2, s.h * 0.026))
  for (const [ox, oy] of [[-0.28, -0.4], [0.34, 0.1]]) {
    const ex = cx + ox * rx
    const ey = cy + oy * ry
    s.disc(ex, ey, Math.max(1, s.h * 0.016), C.bodyD)
    s.disc(ex, ey, Math.max(0.6, s.h * 0.009), C.glow)
    if (!dead) P.g.push({ x: ex, y: ey, r: s.w * 0.07, c: C.glow, p: 0.4 })
  }
  markOf(s, C, cx - rx * 0.45, cy - ry * 0.5, rx * 0.9, ry * 0.6)
  motifDetail(s, P, C, cx - rx * 0.75, cy - ry * 0.5, rx * 1.5, ry * 1.1)
}

/** 焦油：贴地摊开的亮面油潭、中央隆起、气泡与拉丝。 */
function blobTar(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const rx = s.w * (0.4 + v * 0.012)
  const peak = s.h * (dead ? 0.18 : atk ? 0.44 : 0.34)
  shadowOf(s, cx, rx * 0.95, 0.4)
  // 潭体外缘
  s.poly([[cx - rx, g - 1], [cx - rx * 0.96, g - s.h * 0.09], [cx - rx * 0.62, g - s.h * 0.13], [cx - rx * 0.32, g - peak], [cx - rx * 0.02, g - peak * 0.82], [cx + rx * 0.34, g - s.h * 0.17], [cx + rx * 0.72, g - s.h * 0.11], [cx + rx * 0.95, g - s.h * 0.05], [cx + rx, g - 1]], C.bodyD)
  s.poly([[cx - rx * 0.9, g - 2], [cx - rx * 0.85, g - s.h * 0.08], [cx - rx * 0.5, g - s.h * 0.11], [cx - rx * 0.26, g - peak * 0.9], [cx + rx * 0.02, g - peak * 0.72], [cx + rx * 0.3, g - s.h * 0.14], [cx + rx * 0.64, g - s.h * 0.09], [cx + rx * 0.88, g - s.h * 0.04], [cx + rx * 0.9, g - 2]], C.body)
  // 油膜亮边
  bodyLine(s, cx - rx * 0.8, g - s.h * 0.085, cx - rx * 0.3, g - s.h * 0.1, C.bodyL, 0.7)
  bodyLine(s, cx - rx * 0.22, g - peak * 0.85, cx + rx * 0.12, g - peak * 0.66, C.bodyL, 0.55)
  // 气泡
  const rnd = srnd(C, 41)
  for (let i = 0; i < 5; i++) {
    const bx = cx - rx * 0.6 + rnd() * rx * 1.2
    const by = g - s.h * 0.04 - rnd() * s.h * 0.06
    s.disc(bx, by, Math.max(1, s.h * 0.018), C.bodyD)
    s.disc(bx - 0.3, by - 0.3, Math.max(0.5, s.h * 0.008), C.trim)
  }
  // 拉丝（上方滴落 / 攻击时上溅）
  for (let i = 0; i < 3; i++) {
    const dx = cx - rx * 0.2 + i * rx * 0.25
    s.line(dx, g - peak * (atk ? 1.35 : 1.05), dx + s.w * 0.02, g - peak * 0.6, C.bodyD, 0.9)
  }
  if (atk) {
    for (let i = 0; i < 5; i++) s.px(cx - rx * 0.3 + i * rx * 0.15, g - peak * 1.2 - (i % 2) * 3, PAL.oilSheen)
    P.g.push({ x: cx, y: g - peak, r: rx * 0.5, c: C.glow, p: 0.35 })
  }
  eyeSet(s, P, C, cx + rx * 0.04, g - peak * 0.6, Math.max(1.2, s.h * 0.026), PAL.neonCold)
  markOf(s, C, cx - rx * 0.35, g - peak * 0.8, rx * 0.7, peak * 0.45)
  motifDetail(s, P, C, cx - rx * 0.5, g - peak * 0.75, rx, peak * 0.6)
}

/** 霉菌：三根高矮不一的孢子囊柄、绒毛球顶与飘散孢子。 */
function blobMold(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  shadowOf(s, cx, s.w * 0.26, 0.4)
  const sacs = [[-0.18, 0.3, 0.2], [0.02, 0.18, 0.26], [0.2, 0.34, 0.16]]
  // 菌柄
  for (const [ox, oy, rr] of sacs) {
    const bx = cx + (ox + v * 0.01) * s.w
    const top = g - s.h * (dead ? oy * 0.5 : oy + (atk ? 0.06 : 0))
    s.thick(bx, g - 1, bx + (dead ? 0 : Math.sin(P.i * 0.8 + ox * 9) * 1.2), top, Math.max(0.8, s.h * 0.015), C.bodyD)
  }
  // 囊体（每个长满绒毛）
  for (const [ox, oy, rr] of sacs) {
    const bx = cx + (ox + v * 0.01) * s.w
    const by = g - s.h * (dead ? oy * 0.5 : oy + (atk ? 0.06 : 0)) - s.h * rr * 0.7
    const R0 = s.h * rr
    s.disc(bx, by, R0, C.bodyD)
    s.disc(bx, by - 1, R0 * 0.88, C.body)
    s.disc(bx - R0 * 0.3, by - R0 * 0.3, R0 * 0.34, C.bodyL, 0.55)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU
      s.px(bx + Math.cos(a) * R0 * 1.02, by + Math.sin(a) * R0 * 1.02, k % 2 ? C.trim : C.bodyL, 0.85)
    }
    // 囊顶开口 + 孢子
    s.ell(bx, by - R0 * 0.95, R0 * 0.4, R0 * 0.14, C.crack)
  }
  // 飘散的孢子
  const rnd = srnd(C, 63)
  for (let i = 0; i < 7; i++) {
    const sx = cx + (rnd() - 0.5) * s.w * 0.6
    const sy = g - s.h * (0.5 + rnd() * 0.42) - (atk ? s.h * 0.08 : 0)
    s.px(sx, sy, C.trim, 0.75)
    if (i % 2) s.px(sx + 1, sy, C.bodyL, 0.6)
  }
  P.g.push({ x: cx, y: g - s.h * 0.55, r: s.w * 0.34, c: C.glow, p: atk ? 0.55 : 0.3 })
  const big = sacs[1]
  const hx = cx + (big[0] + v * 0.01) * s.w
  const hy = g - s.h * (dead ? big[1] * 0.5 : big[1]) - s.h * big[2] * 0.72
  eyeSet(s, P, C, hx, hy, Math.max(1, s.h * 0.016))
  markOf(s, C, hx - s.h * 0.16, hy - s.h * 0.12, s.h * 0.32, s.h * 0.22)
  motifDetail(s, P, C, hx - s.h * 0.2, hy - s.h * 0.14, s.h * 0.4, s.h * 0.28)
}

/* ------------------------------- statue --------------------------------- */

/** 石像：方形基座、粗短身躯、双手前伸、巨型面具脸。 */
function statueIdol(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.47
  const pedH = Math.max(2, s.h * 0.12)
  const bodyH = s.h * (dead ? 0.2 : 0.34)
  const bodyTop = g - pedH - bodyH
  shadowOf(s, cx, s.w * 0.3, 0.42)
  // 基座
  s.rect(cx - s.w * 0.27, g - pedH, s.w * 0.54, pedH, C.bodyD)
  s.rect(cx - s.w * 0.24, g - pedH, s.w * 0.48, pedH * 0.55, C.body)
  bodyLine(s, cx - s.w * 0.22, g - pedH * 0.45, cx + s.w * 0.22, g - pedH * 0.45, C.crack, 0.7)
  // 身躯（上窄下宽）
  s.poly([[cx - s.w * 0.21, g - pedH], [cx - s.w * 0.16, bodyTop], [cx + s.w * 0.16, bodyTop], [cx + s.w * 0.21, g - pedH]], C.bodyD)
  s.poly([[cx - s.w * 0.18, g - pedH - 1], [cx - s.w * 0.14, bodyTop + 2], [cx + s.w * 0.14, bodyTop + 2], [cx + s.w * 0.18, g - pedH - 1]], C.body)
  s.ell(cx - s.w * 0.06, bodyTop + bodyH * 0.25, s.w * 0.06, bodyH * 0.16, C.bodyL, 0.45)
  // 手臂：垂放 → 攻击时前伸
  for (const side of [-1, 1]) {
    const ax = cx + side * s.w * 0.16
    const ay = bodyTop + bodyH * 0.2
    const ex = cx + side * s.w * (atk ? 0.28 : 0.22)
    const ey = bodyTop + bodyH * (atk ? 0.34 : 0.62)
    s.thick(ax, ay, ex, ey, Math.max(1.1, s.h * 0.03), C.bodyD)
    s.thick(ax, ay, ex, ey - 1, Math.max(0.8, s.h * 0.022), C.body)
    // 掌心
    s.ell(ex, ey + s.h * 0.015, Math.max(1.2, s.h * 0.028), Math.max(1, s.h * 0.02), C.bodyD)
    s.px(ex, ey + s.h * 0.01, C.crack)
  }
  // 面具头
  const hy = bodyTop - s.h * 0.11
  s.ell(cx, hy, s.w * 0.15, s.h * 0.115, C.bodyD)
  s.ell(cx, hy - 1, s.w * 0.14, s.h * 0.104, C.body)
  s.ell(cx - s.w * 0.03, hy - s.h * 0.04, s.w * 0.06, s.h * 0.03, C.bodyL, 0.5)
  // 面具眼洞 + 嘴缝
  for (const side of [-1, 1]) s.ell(cx + side * s.w * 0.055, hy - s.h * 0.005, s.w * 0.028, s.h * 0.028, PAL.void)
  s.rect(cx - s.w * 0.05, hy + s.h * 0.045, s.w * 0.1, Math.max(1, s.h * 0.014), C.crack)
  eyeSet(s, P, C, cx, hy - s.h * 0.005, Math.max(1, s.h * 0.016))
  // 头冠裂纹
  for (let i = 0; i < 3; i++) bodyLine(s, cx - s.w * 0.1 + i * s.w * 0.1, hy - s.h * 0.1, cx - s.w * 0.08 + i * s.w * 0.1, hy + s.h * 0.1, C.crack, 0.5)
  markOf(s, C, cx - s.w * 0.13, bodyTop + s.h * 0.02, s.w * 0.26, s.h * 0.12)
  motifDetail(s, P, C, cx - s.w * 0.15, bodyTop + s.h * 0.02, s.w * 0.3, s.h * 0.16)
}

/** 石骑士：护胫、甲裙、胸甲、肩甲、羽饰头盔、左手盾右手剑。 */
function statueKnight(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.45
  const hipY = g - s.h * (dead ? 0.12 : 0.26)
  const shY = g - s.h * (dead ? 0.24 : 0.48)
  const headY = shY - s.h * 0.1
  shadowOf(s, cx, s.w * 0.28, 0.42)
  // 护胫 + 铁靴
  for (const side of [-1, 1]) {
    const lx = cx + side * s.w * 0.07
    s.thick(lx, g - s.h * 0.02, lx, hipY, Math.max(1.4, s.h * 0.045), C.bodyD)
    s.thick(lx - 1, g - s.h * 0.02, lx - 1, hipY + 1, Math.max(1, s.h * 0.032), C.body)
    s.rect(lx - s.w * 0.035, g - s.h * 0.045, s.w * 0.07, Math.max(1.5, s.h * 0.035), C.bodyD)
    s.line(lx - s.w * 0.03, g - s.h * 0.03, lx + s.w * 0.03, g - s.h * 0.03, C.trim, 0.8)
  }
  // 甲裙 + 胸甲
  s.poly([[cx - s.w * 0.14, hipY + s.h * 0.04], [cx - s.w * 0.11, hipY - s.h * 0.06], [cx + s.w * 0.11, hipY - s.h * 0.06], [cx + s.w * 0.14, hipY + s.h * 0.04]], C.bodyD)
  s.poly([[cx - s.w * 0.16, hipY - s.h * 0.04], [cx - s.w * 0.18, shY + s.h * 0.03], [cx + s.w * 0.18, shY + s.h * 0.03], [cx + s.w * 0.16, hipY - s.h * 0.04]], C.bodyD)
  s.poly([[cx - s.w * 0.14, hipY - s.h * 0.05], [cx - s.w * 0.15, shY + s.h * 0.045], [cx + s.w * 0.15, shY + s.h * 0.045], [cx + s.w * 0.14, hipY - s.h * 0.05]], C.body)
  // 甲片缝
  for (let i = 0; i < 3; i++) bodyLine(s, cx - s.w * 0.12, shY + s.h * (0.06 + i * 0.05), cx + s.w * 0.12, shY + s.h * (0.06 + i * 0.05), C.crack, 0.6)
  // 肩甲
  for (const side of [-1, 1]) {
    s.ell(cx + side * s.w * 0.16, shY + s.h * 0.04, s.w * 0.075, s.h * (0.055 + v * 0.004), C.bodyD)
    s.ell(cx + side * s.w * 0.16, shY + s.h * 0.03, s.w * 0.065, s.h * 0.045, C.body)
    s.px(cx + side * s.w * 0.16, shY + s.h * 0.02, C.trim)
  }
  // 头盔 + 羽饰
  s.ell(cx, headY, s.w * 0.085, s.h * 0.085, C.bodyD)
  s.ell(cx, headY - 1, s.w * 0.075, s.h * 0.072, C.body)
  s.rect(cx - s.w * 0.07, headY + s.h * 0.005, s.w * 0.14, Math.max(1, s.h * 0.016), PAL.void)
  for (let i = 0; i < 3; i++) s.line(cx, headY - s.h * 0.07, cx - s.w * (0.05 + i * 0.015), headY - s.h * (0.12 + i * 0.02), C.trim, 0.85)
  eyeSet(s, P, C, cx, headY + s.h * 0.012, Math.max(1, s.h * 0.013))
  // 左手盾（画面左侧）
  const dx = cx - s.w * 0.27
  const dy = shY + s.h * 0.08
  s.ell(dx, dy, s.w * 0.085, s.h * (dead ? 0.06 : 0.11), C.bodyD)
  s.ell(dx, dy, s.w * 0.07, s.h * (dead ? 0.05 : 0.092), C.body)
  s.line(dx, dy - s.h * 0.09, dx, dy + s.h * 0.09, C.crack, 0.7)
  s.line(dx - s.w * 0.06, dy, dx + s.w * 0.06, dy, C.crack, 0.7)
  s.px(dx, dy, C.trim)
  // 右手剑：攻击帧前劈
  const hx = cx + s.w * 0.22
  const hy = shY + s.h * 0.1
  const tipX = hx + s.w * (atk ? 0.16 : 0.02)
  const tipY = hy - s.h * (atk ? 0.05 : 0.34)
  s.thick(hx, hy, tipX, tipY, Math.max(1.2, s.h * 0.02), C.trim)
  s.thick(hx, hy, tipX, tipY, Math.max(0.6, s.h * 0.01), PAL.steelWhite, 0.9)
  s.line(hx - s.w * 0.04, hy + s.h * 0.01, hx + s.w * 0.04, hy + s.h * 0.01, C.bodyD)
  if (atk) P.g.push({ x: tipX, y: tipY, r: s.w * 0.12, c: C.glow, p: 0.6 })
  markOf(s, C, cx - s.w * 0.12, shY + s.h * 0.07, s.w * 0.24, s.h * 0.1)
  motifDetail(s, P, C, cx - s.w * 0.16, shY + s.h * 0.05, s.w * 0.32, s.h * 0.2)
}

/** 图腾柱：三段堆叠雕面、层间翼板、顶端鸟喙。 */
function statueTotem(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const baseH = s.h * 0.12
  const segH = s.h * (dead ? 0.16 : 0.22)
  shadowOf(s, cx, s.w * 0.26, 0.42)
  const blocks = 3
  for (let i = 0; i < blocks; i++) {
    const yBot = g - baseH - i * segH
    const bw = s.w * (0.2 - i * 0.02 + v * 0.008)
    s.rect(cx - bw, yBot - segH + 1, bw * 2, segH, C.bodyD)
    s.rect(cx - bw + 1, yBot - segH + 2, bw * 2 - 2, segH - 2, i % 2 ? C.body : C.bodyL)
    // 雕面：眼缝 + 嘴
    s.rect(cx - bw * 0.55, yBot - segH * 0.72, bw * 0.5, Math.max(1, s.h * 0.014), PAL.void)
    s.rect(cx + bw * 0.05, yBot - segH * 0.72, bw * 0.5, Math.max(1, s.h * 0.014), PAL.void)
    s.rect(cx - bw * 0.4, yBot - segH * 0.36, bw * 0.8, Math.max(1, s.h * 0.012), C.crack)
    s.px(cx - bw * 0.3, yBot - segH * 0.72 + 1, C.glow)
    s.px(cx + bw * 0.3, yBot - segH * 0.72 + 1, C.glow)
    if (i === 1) P.g.push({ x: cx, y: yBot - segH * 0.72, r: s.w * 0.14, c: C.glow, p: 0.35 })
    // 翼板（中段）
    if (i === 1) {
      for (const side of [-1, 1]) {
        s.poly([[cx + side * bw * 0.9, yBot - segH * 0.55], [cx + side * s.w * (atk ? 0.42 : 0.32), yBot - segH * (atk ? 0.9 : 0.7)], [cx + side * bw * 0.9, yBot - segH * 0.2]], C.bodyD)
        s.line(cx + side * bw * 0.9, yBot - segH * 0.5, cx + side * s.w * 0.3, yBot - segH * 0.66, C.trim, 0.7)
      }
    }
  }
  // 顶部鸟头 + 喙
  const hx = cx
  const hy = g - baseH - blocks * segH - s.h * 0.06
  s.ell(hx, hy, s.w * 0.1, s.h * 0.07, C.bodyD)
  s.ell(hx, hy - 1, s.w * 0.09, s.h * 0.06, C.body)
  s.poly([[hx + s.w * 0.03, hy - s.h * 0.01], [hx + s.w * (atk ? 0.2 : 0.15), hy + s.h * 0.02], [hx + s.w * 0.03, hy + s.h * 0.045]], PAL.ochre)
  s.px(hx + s.w * 0.03, hy, PAL.void)
  eyeSet(s, P, C, hx - s.w * 0.02, hy - s.h * 0.015, Math.max(1, s.h * 0.012))
  // 冠羽
  for (let i = 0; i < 3; i++) s.line(hx - s.w * 0.02, hy - s.h * 0.05, hx - s.w * (0.03 + i * 0.02), hy - s.h * (0.1 + i * 0.02), C.trim)
  markOf(s, C, cx - s.w * 0.1, g - baseH - segH * 0.9, s.w * 0.2, segH * 0.7)
  motifDetail(s, P, C, cx - s.w * 0.13, g - baseH - segH * 0.95, s.w * 0.26, segH * 0.8)
}

/** 提线木偶：顶部提线、十字架、分节四肢与歪垂的头。 */
function statuePuppet(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.48
  const sway = dead ? 0 : Math.sin(P.i * 0.8) * s.w * 0.02
  const headY = s.h * (dead ? 0.5 : 0.2)
  const shY = s.h * (dead ? 0.62 : 0.34)
  const hipY = s.h * (dead ? 0.76 : 0.56)
  shadowOf(s, cx, s.w * 0.14, 0.25)
  // 提线 + 十字架
  s.rect(cx - s.w * 0.18, 1, s.w * 0.36, 1.5, PAL.woodDark)
  s.rect(cx - 0.5, 1, 1, s.h * 0.1, PAL.woodDark)
  for (const tx of [cx - s.w * 0.14, cx + s.w * 0.14]) s.line(cx - s.w * 0.1, 1, tx + sway, shY, C.trim, 0.6)
  for (const tx of [cx - s.w * 0.16, cx + s.w * 0.16]) s.line(cx + tx * 0.2, 1, tx + sway, hipY + s.h * 0.14, C.trim, 0.5)
  // 头（歪斜）
  s.ell(cx + sway, headY, s.w * 0.1, s.h * 0.09, C.bodyD)
  s.ell(cx + sway, headY - 1, s.w * 0.09, s.h * 0.08, C.body)
  s.ell(cx + sway - s.w * 0.02, headY - s.h * 0.03, s.w * 0.04, s.h * 0.03, C.bodyL, 0.5)
  // 关节躯干
  s.poly([[cx - s.w * 0.09, shY], [cx + s.w * 0.09, shY], [cx + s.w * 0.07, hipY], [cx - s.w * 0.07, hipY]], C.bodyD)
  s.poly([[cx - s.w * 0.07, shY + 1], [cx + s.w * 0.07, shY + 1], [cx + s.w * 0.05, hipY - 1], [cx - s.w * 0.05, hipY - 1]], C.body)
  bodyLine(s, cx - s.w * 0.06, shY + s.h * 0.06, cx + s.w * 0.06, shY + s.h * 0.06, C.crack, 0.6)
  // 分节手臂（攻击时抬起）
  for (const side of [-1, 1]) {
    const ex = cx + side * s.w * 0.13 + sway
    const ey = shY + s.h * (atk ? 0.02 : 0.1)
    s.thick(cx + side * s.w * 0.07, shY + s.h * 0.03, ex, ey, Math.max(1, s.h * 0.022), C.bodyD)
    s.disc(ex, ey, Math.max(1.2, s.h * 0.022), C.body)
    const wx = ex + side * s.w * (atk ? 0.05 : 0.03)
    const wy = ey + s.h * (atk ? -0.04 : 0.1)
    s.thick(ex, ey, wx, wy, Math.max(0.8, s.h * 0.018), C.bodyD)
    s.disc(wx, wy, Math.max(1, s.h * 0.018), C.body)
  }
  // 分节腿
  for (const side of [-1, 1]) {
    const kx = cx + side * s.w * 0.04
    const ky = hipY + s.h * (dead ? 0.08 : 0.12)
    s.thick(cx + side * s.w * 0.03, hipY, kx, ky, Math.max(1, s.h * 0.024), C.bodyD)
    s.disc(kx, ky, Math.max(1.1, s.h * 0.02), C.body)
    s.thick(kx, ky, kx + s.w * 0.01, g - 2, Math.max(0.8, s.h * 0.018), C.bodyD)
    s.line(kx - 2, g - 2, kx + 2, g - 2, PAL.woodDark)
  }
  eyeSet(s, P, C, cx + sway, headY, Math.max(1, s.h * 0.014))
  // 木纹
  bodyLine(s, cx - s.w * 0.05, shY + 2, cx - s.w * 0.04, hipY - 2, C.crack, 0.5)
  markOf(s, C, cx - s.w * 0.06, shY + s.h * 0.02, s.w * 0.12, s.h * 0.1)
  motifDetail(s, P, C, cx - s.w * 0.08, shY + s.h * 0.02, s.w * 0.16, s.h * 0.14)
}

/* -------------------------------- mech ---------------------------------- */

/** 无人机：悬浮舱体、四条旋翼臂、镜头独眼与下挂机炮。 */
function mechDrone(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const cy = s.h * 0.36 + (dead ? s.h * 0.22 : hover(P, 2.2))
  const bw = s.w * (0.18 + v * 0.008)
  shadowOf(s, cx, bw * 1.5, 0.25)
  // 四旋翼臂 + 桨盘
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ex = cx + ox * bw * 1.45
    const ey = cy + oy * s.h * 0.13 - (atk ? s.h * 0.02 : 0)
    s.thick(cx, cy, ex, ey, Math.max(0.9, s.h * 0.015), C.bodyD)
    s.thick(cx, cy - 1, ex, ey - 1, Math.max(0.6, s.h * 0.01), C.body)
    s.ell(ex, ey, bw * 0.34, Math.max(1, s.h * 0.02), C.bodyL, 0.5)
    s.px(ex, ey, C.trim)
    P.g.push({ x: ex, y: ey, r: s.w * 0.05, c: PAL.neonCold, p: 0.28 })
  }
  // 中央舱体
  s.ell(cx, cy, bw, s.h * 0.16, C.bodyD)
  s.ell(cx, cy - 1, bw * 0.92, s.h * 0.145, C.body)
  s.ell(cx - bw * 0.28, cy - s.h * 0.04, bw * 0.4, s.h * 0.05, C.bodyL, 0.5)
  // 顶天线
  s.line(cx - bw * 0.2, cy - s.h * 0.14, cx - bw * 0.28, cy - s.h * 0.24, C.trim)
  s.px(cx - bw * 0.28, cy - s.h * 0.24, PAL.neonRed)
  // 镜头独眼
  s.disc(cx + bw * 0.4, cy, Math.max(1.7, s.h * 0.05), PAL.void)
  s.disc(cx + bw * 0.4, cy, Math.max(1.1, s.h * 0.034), C.glow)
  s.px(cx + bw * 0.46, cy - 1, PAL.white)
  P.g.push({ x: cx + bw * 0.4, y: cy, r: bw * 1.2, c: C.glow, p: atk ? 0.9 : 0.5 })
  // 下挂机炮
  s.rect(cx - bw * 0.1, cy + s.h * 0.12, bw * 0.3, s.h * 0.06, C.bodyD)
  s.thick(cx + bw * 0.05, cy + s.h * 0.17, cx + bw * 0.05, cy + s.h * 0.24, Math.max(1, s.h * 0.016), C.trim)
  if (atk) {
    s.line(cx + bw * 0.05, cy + s.h * 0.24, cx + bw * 0.3, cy + s.h * 0.26, PAL.neonWarm, 0.9)
    P.g.push({ x: cx + bw * 0.3, y: cy + s.h * 0.255, r: s.w * 0.08, c: PAL.neonWarm, p: 0.8 })
  }
  markOf(s, C, cx - bw * 0.6, cy - s.h * 0.1, bw * 0.7, s.h * 0.09)
  motifDetail(s, P, C, cx - bw * 0.7, cy - s.h * 0.12, bw * 1.2, s.h * 0.16)
}

/** 步行机：反关节双足、方形驾驶舱、观察窗与右臂机炮。 */
function mechWalker(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.44
  const cabTop = g - s.h * (dead ? 0.36 : 0.64)
  const cabH = s.h * 0.22
  const hipY = cabTop + cabH * 0.92
  shadowOf(s, cx, s.w * 0.3, 0.42)
  // 反关节腿
  for (const side of [-1, 1]) {
    const f = dead ? { dx: 0, lift: 0 } : foot(P, side > 0 ? 1 : 0, 4, 2.4)
    const hx0 = cx + side * s.w * 0.08
    const kx = cx + side * s.w * 0.17 + f.dx
    const ky = hipY - s.h * 0.03 + f.lift * 0.3
    const fx = cx + side * s.w * 0.12 + f.dx
    s.thick(hx0, hipY, kx, ky, Math.max(1.2, s.h * 0.03), C.bodyD)
    s.thick(hx0, hipY - 1, kx, ky - 1, Math.max(0.8, s.h * 0.02), C.body)
    s.thick(kx, ky, fx, g - s.h * 0.03, Math.max(1, s.h * 0.024), C.bodyD)
    s.rect(fx - s.w * 0.055, g - s.h * 0.04, s.w * 0.11, Math.max(1.5, s.h * 0.035), C.bodyD)
    s.line(fx - s.w * 0.04, g - s.h * 0.02, fx + s.w * 0.04, g - s.h * 0.02, C.trim, 0.8)
    // 膝液压
    s.disc(kx, ky, Math.max(1.1, s.h * 0.024), PAL.neonWarm)
    P.g.push({ x: kx, y: ky, r: s.w * 0.06, c: PAL.neonWarm, p: 0.3 })
  }
  // 驾驶舱
  s.rect(cx - s.w * 0.17, cabTop, s.w * 0.34, cabH, C.bodyD)
  s.rect(cx - s.w * 0.15, cabTop + 1.5, s.w * 0.3, cabH - 3, C.body)
  s.rect(cx - s.w * 0.14, cabTop + cabH * 0.2, s.w * 0.28, Math.max(1, s.h * 0.012), C.bodyL, 0.55)
  // 观察窗 + 眼
  s.rect(cx + s.w * 0.01, cabTop + cabH * 0.3, s.w * 0.1, s.h * 0.07, PAL.void)
  eyeSet(s, P, C, cx + s.w * 0.06, cabTop + cabH * 0.28 + s.h * 0.035, Math.max(1, s.h * 0.015))
  // 右臂机炮
  const gx = cx + s.w * 0.2
  const gy = cabTop + cabH * 0.55
  s.thick(cx + s.w * 0.14, cabTop + cabH * 0.3, gx, gy, Math.max(1.2, s.h * 0.024), C.bodyD)
  s.rect(gx, gy - s.h * 0.018, s.w * 0.13, Math.max(1.5, s.h * 0.036), C.bodyD)
  s.rect(gx + 1, gy - s.h * 0.012, s.w * 0.11, Math.max(1, s.h * 0.02), C.trim)
  if (atk) {
    s.line(gx + s.w * 0.13, gy, gx + s.w * 0.26, gy + s.h * 0.03, PAL.neonWarm, 0.9)
    P.g.push({ x: gx + s.w * 0.28, y: gy + s.h * 0.03, r: s.w * 0.09, c: PAL.neonWarm, p: 0.8 })
  }
  // 左臂配重
  s.rect(cx - s.w * 0.27, cabTop + cabH * 0.45, s.w * 0.09, s.h * 0.08, C.bodyD)
  s.line(cx - s.w * 0.24, cabTop + cabH * 0.5, cx - s.w * 0.2, cabTop + cabH * 0.6, C.trim, 0.7)
  // 排气
  for (let i = 0; i < 3; i++) s.px(cx - s.w * 0.13 + i * 3, cabTop - 2 - i, C.trim, 0.7)
  markOf(s, C, cx - s.w * 0.1, cabTop + cabH * 0.55, s.w * 0.14, s.h * 0.06)
  motifDetail(s, P, C, cx - s.w * 0.12, cabTop + cabH * 0.5, s.w * 0.2, s.h * 0.08)
}

/** 炮塔：三足支架、旋转穹顶、长炮管与侧面弹鼓。 */
function mechTurret(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.44
  const baseY = g - s.h * 0.12
  const domeY = g - s.h * (dead ? 0.28 : 0.42)
  shadowOf(s, cx, s.w * 0.28, 0.4)
  // 三条支腿
  for (const off of [-1, 0, 1]) {
    const fx = cx + off * s.w * 0.2
    s.thick(cx, baseY, fx, g - 1, Math.max(1, s.h * 0.018), C.bodyD)
    s.line(fx - s.w * 0.035, g - 1, fx + s.w * 0.035, g - 1, C.trim, 0.8)
    s.px(fx, g - 2, C.bodyL)
  }
  s.ell(cx, baseY, s.w * 0.2, s.h * 0.06, C.bodyD)
  s.ell(cx, baseY - 1, s.w * 0.18, s.h * 0.045, C.body)
  // 穹顶
  s.ell(cx, domeY, s.w * 0.22, s.h * 0.18, C.bodyD)
  s.ell(cx, domeY - 1, s.w * 0.2, s.h * 0.16, C.body)
  s.ell(cx - s.w * 0.06, domeY - s.h * 0.07, s.w * 0.08, s.h * 0.05, C.bodyL, 0.55)
  // 穹顶接缝 + 散热格
  bodyLine(s, cx - s.w * 0.18, domeY, cx + s.w * 0.18, domeY, C.crack, 0.7)
  for (let i = 0; i < 4; i++) s.rect(cx - s.w * 0.1 + i * 4, domeY - s.h * 0.2, 2, Math.max(1, s.h * 0.03), C.crack)
  // 长炮管
  s.thick(cx + s.w * 0.1, domeY, cx + s.w * (atk ? 0.46 : 0.4), domeY - (atk ? s.h * 0.04 : 0), Math.max(1.4, s.h * 0.024), C.bodyD)
  s.thick(cx + s.w * 0.1, domeY - 1, cx + s.w * (atk ? 0.44 : 0.38), domeY - (atk ? s.h * 0.04 : 0) - 1, Math.max(0.8, s.h * 0.014), C.trim)
  if (atk) {
    s.line(cx + s.w * 0.46, domeY - s.h * 0.04, cx + s.w * 0.56, domeY - s.h * 0.04, PAL.neonWarm, 0.9)
    P.g.push({ x: cx + s.w * 0.56, y: domeY - s.h * 0.04, r: s.w * 0.1, c: PAL.neonWarm, p: 0.85 })
  }
  // 弹鼓（画面左侧）
  const dx = cx - s.w * 0.2
  const dy = domeY + s.h * 0.04
  s.ell(dx, dy, s.w * 0.07, s.h * 0.06, C.bodyD)
  s.ell(dx, dy, s.w * 0.055, s.h * 0.048, C.trim, 0.9)
  for (let i = 0; i < 4; i++) s.px(dx - s.w * 0.04 + i * 3, dy, PAL.steelDark)
  // 传感器眼
  const ey = domeY + s.h * 0.01
  s.rect(cx + s.w * 0.04, ey - s.h * 0.02, s.w * 0.06, Math.max(1, s.h * 0.025), PAL.void)
  eyeSet(s, P, C, cx + s.w * 0.07, ey, Math.max(1, s.h * 0.012), PAL.neonRed)
  markOf(s, C, cx - s.w * 0.1, domeY - s.h * 0.12, s.w * 0.14, s.h * 0.08)
  motifDetail(s, P, C, cx - s.w * 0.13, domeY - s.h * 0.11, s.w * 0.2, s.h * 0.12)
}

/** 蜘蛛机：低矮穹体、四对高膝折腿、双前探传感器。 */
function mechSpider(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const cy = g - s.h * (dead ? 0.16 : 0.3)
  const bw = s.w * (0.22 + v * 0.01)
  const bh = s.h * 0.13
  shadowOf(s, cx, bw * 1.25, 0.4)
  // 八条高膝折腿
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const f = dead ? { dx: 0, lift: 0 } : foot(P, i + (side > 0 ? 0 : 2), 4, 2)
      const kx = cx + side * (bw * 0.75 + i * bw * 0.22)
      const ky = cy - s.h * (0.16 + i * 0.015) - f.lift * 0.2
      const fx = cx + side * (bw * 1.05 + i * bw * 0.25) + f.dx
      s.thick(cx + side * bw * 0.5, cy, kx, ky, Math.max(0.8, s.h * 0.012), C.bodyD)
      s.thick(kx, ky, fx, g - 1 - f.lift, Math.max(0.7, s.h * 0.01), C.bodyD)
      s.px(kx, ky, C.trim)
    }
  }
  // 穹体
  s.ell(cx, cy, bw, bh, C.bodyD)
  s.ell(cx, cy - 1, bw * 0.92, bh * 0.82, C.body)
  s.ell(cx - bw * 0.25, cy - bh * 0.35, bw * 0.42, bh * 0.28, C.bodyL, 0.5)
  bodyLine(s, cx - bw * 0.7, cy, cx + bw * 0.7, cy, C.crack, 0.7)
  // 双前探传感器
  for (const side of [-1, 1]) {
    const sx = cx + bw * 0.55
    const sy = cy + side * bh * 0.4
    s.thick(cx + bw * 0.3, cy + side * bh * 0.2, sx, sy - (atk ? s.h * 0.04 : 0), Math.max(0.7, s.h * 0.012), C.bodyD)
    s.disc(sx, sy - (atk ? s.h * 0.04 : 0), Math.max(1, s.h * 0.018), PAL.void)
    s.disc(sx, sy - (atk ? s.h * 0.04 : 0), Math.max(0.6, s.h * 0.01), C.glow)
  }
  eyeSet(s, P, C, cx + bw * 0.2, cy - bh * 0.1, Math.max(1, s.h * 0.014), PAL.neonRed)
  if (atk) {
    s.line(cx + bw * 0.7, cy, s.w * 0.94, cy - s.h * 0.06, PAL.neonRed, 0.7)
    P.g.push({ x: s.w * 0.94, y: cy - s.h * 0.06, r: s.w * 0.08, c: PAL.neonRed, p: 0.7 })
  }
  markOf(s, C, cx - bw * 0.5, cy - bh * 0.55, bw * 0.8, bh * 0.5)
  motifDetail(s, P, C, cx - bw * 0.75, cy - bh * 0.6, bw * 1.4, bh * 0.9)
}

/* -------------------------------- plant --------------------------------- */

/** 花苞：地表根须、分瓣球茎、顶端张开的花瓣与内部光核。 */
function plantBulb(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const rx = s.w * (0.25 + v * 0.012)
  const ry = s.h * (dead ? 0.16 : 0.28)
  const cy = g - ry * 0.95
  shadowOf(s, cx, rx * 1.1, 0.4)
  // 根须
  for (let i = 0; i < 5; i++) {
    const bx = cx - rx * 0.7 + i * rx * 0.35
    const ex = bx + (i % 2 ? 1 : -1) * s.w * 0.08
    s.thick(bx, g - 2, ex, g - s.h * 0.02, Math.max(0.7, s.h * 0.01), C.bodyD)
    s.px(ex, g - s.h * 0.02, C.trim)
  }
  // 球茎
  s.ell(cx, cy, rx, ry, C.bodyD)
  s.ell(cx, cy - 1, rx * 0.92, ry * 0.88, C.body)
  s.ell(cx - rx * 0.28, cy - ry * 0.35, rx * 0.4, ry * 0.28, C.bodyL, 0.55)
  // 竖瓣缝
  for (let i = 0; i < 3; i++) bodyLine(s, cx - rx * 0.5 + i * rx * 0.5, cy - ry * 0.7, cx - rx * 0.45 + i * rx * 0.5, cy + ry * 0.6, C.crack, 0.55)
  // 内部光核
  s.disc(cx, cy - ry * 0.1, Math.max(1.3, s.h * 0.025), C.glow)
  s.disc(cx, cy - ry * 0.1, Math.max(0.7, s.h * 0.012), PAL.white)
  P.g.push({ x: cx, y: cy - ry * 0.1, r: rx * 0.8, c: C.glow, p: atk ? 0.9 : 0.5 })
  // 顶端花瓣
  const spread = dead ? 0.4 : atk ? 1.35 : 1
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI * 0.5 + (k - 2) * 0.42 * spread
    const len = Math.min(s.w * 0.36, ry * 1.5) * spread
    const tx = cx + Math.cos(a) * len * 0.7
    const ty = cy - ry * 0.85 + Math.sin(a) * len
    s.poly([[cx - rx * 0.12, cy - ry * 0.8], [tx, ty], [cx + rx * 0.12, cy - ry * 0.8]], k % 2 ? C.trim : C.body, 0.9)
    s.line(cx, cy - ry * 0.82, tx, ty, C.crack, 0.5)
  }
  eyeSet(s, P, C, cx, cy - ry * 0.12, Math.max(1, s.h * 0.018), PAL.neonWarm)
  markOf(s, C, cx - rx * 0.5, cy + ry * 0.1, rx, ry * 0.5)
  motifDetail(s, P, C, cx - rx * 0.7, cy - ry * 0.2, rx * 1.4, ry * 0.9)
}

/** 藤蔓：S 形长茎、交错叶片与倒刺、顶端卷须与花头。 */
function plantVine(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.38
  const topY = s.h * 0.14
  const sway = dead ? 0 : Math.sin(P.i * 0.5) * s.w * 0.02
  shadowOf(s, cx + s.w * 0.06, s.w * 0.2, 0.35)
  const pts = []
  const n = 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push([cx + Math.sin(t * Math.PI * 1.5 + P.i * 0.25) * s.w * (0.1 + v * 0.01) * (1 - t * 0.3) + sway * t, g - t * (g - topY)])
  }
  // 主茎
  for (let i = 0; i < n; i++) {
    const t = i / n
    s.thick(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], Math.max(1, s.w * (0.035 - t * 0.014)), C.bodyD)
    s.thick(pts[i][0], pts[i][1] - 1, pts[i + 1][0], pts[i + 1][1] - 1, Math.max(0.7, s.w * (0.024 - t * 0.011)), C.body)
  }
  // 交错叶片 + 倒刺
  for (let i = 2; i < n - 1; i += 2) {
    const side = i % 4 ? 1 : -1
    const [ax, ay] = pts[i]
    const lx = ax + side * s.w * (0.14 + v * 0.01)
    s.poly([[ax, ay], [lx, ay - s.h * 0.07], [lx - side * s.w * 0.03, ay + s.h * 0.035]], C.trim, 0.95)
    s.line(ax, ay, lx - side * s.w * 0.02, ay - s.h * 0.05, C.crack, 0.6)
    s.poly([[ax, ay + 1], [ax - side * 3, ay - s.h * 0.02], [ax + side * 2, ay - s.h * 0.01]], C.bodyL, 0.9)
  }
  // 顶端卷须 + 花头
  const [hx, hy] = pts[n]
  s.thick(hx, hy, hx + s.w * 0.06, hy - s.h * 0.06, Math.max(0.7, s.h * 0.008), C.trim)
  s.poly([[hx, hy], [hx + s.w * (atk ? 0.14 : 0.1), hy - s.h * 0.04], [hx + s.w * 0.05, hy - s.h * 0.11], [hx - s.w * 0.02, hy - s.h * 0.05]], C.bodyD)
  s.disc(hx + s.w * 0.03, hy - s.h * 0.06, Math.max(1.1, s.h * 0.022), C.glow)
  s.disc(hx + s.w * 0.03, hy - s.h * 0.06, Math.max(0.6, s.h * 0.011), PAL.white)
  P.g.push({ x: hx + s.w * 0.03, y: hy - s.h * 0.06, r: s.w * (atk ? 0.15 : 0.1), c: C.glow, p: 0.6 })
  eyeSet(s, P, C, hx + s.w * 0.02, hy - s.h * 0.04, Math.max(1, s.h * 0.012), PAL.neonWarm)
  markOf(s, C, cx - s.w * 0.1, g - s.h * 0.35, s.w * 0.2, s.h * 0.12)
  motifDetail(s, P, C, cx - s.w * 0.12, g - s.h * 0.4, s.w * 0.24, s.h * 0.16)
}

/** 菌菇：粗菌柄、带褶宽伞盖、盖面斑点与飘散孢子。 */
function plantFungus(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46 + (atk ? s.w * 0.02 : 0)
  const capY = g - s.h * (dead ? 0.26 : atk ? 0.46 : 0.4)
  const rx = s.w * (0.34 + v * 0.012)
  const ry = s.h * (dead ? 0.09 : 0.14)
  shadowOf(s, cx, rx * 0.9, 0.42)
  // 菌柄 + 基部膨大
  s.thick(cx, g - 1, cx, capY, Math.max(1.6, s.w * 0.06), C.bodyD)
  s.thick(cx, g - 1, cx - 1, capY + 1, Math.max(1, s.w * 0.045), C.body)
  s.ell(cx, g - 2, s.w * 0.1, s.h * 0.03, C.bodyD)
  // 伞盖
  s.ell(cx, capY, rx, ry * 1.3, C.bodyD)
  s.ell(cx, capY - 1, rx * 0.94, ry * 1.2, C.body)
  s.ell(cx - rx * 0.25, capY - ry * 0.55, rx * 0.4, ry * 0.35, C.bodyL, 0.5)
  // 盖面斑点
  const rnd = srnd(C, 81)
  for (let i = 0; i < 6; i++) {
    const px = cx - rx * 0.7 + rnd() * rx * 1.4
    const py = capY - ry * 0.5 + rnd() * ry * 0.5
    s.disc(px, py, Math.max(0.9, s.h * 0.014), C.trim, 0.9)
    s.px(px - 0.5, py - 0.5, C.bodyL)
  }
  // 菌褶
  for (let i = 0; i < 7; i++) {
    const t = (i / 6) * 2 - 1
    s.line(cx, capY + 1, cx + t * rx * 0.92, capY + ry * 1.1 - Math.abs(t) * ry * 0.35, C.crack, 0.6)
  }
  // 孢子云
  if (atk) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU
      s.px(cx + Math.cos(a) * rx * 1.2, capY - s.h * 0.1 + Math.sin(a) * ry * 1.4, C.trim, 0.8)
    }
    P.g.push({ x: cx, y: capY - s.h * 0.12, r: rx * 1.4, c: C.glow, p: 0.6 })
  }
  eyeSet(s, P, C, cx + s.w * 0.01, capY + s.h * 0.05, Math.max(1, s.h * 0.015))
  markOf(s, C, cx - rx * 0.3, capY - ry * 0.4, rx * 0.6, ry * 0.6)
  motifDetail(s, P, C, cx - rx * 0.45, capY - ry * 0.5, rx * 0.9, ry * 0.9)
}

/** 根须：盘结的根块、向两侧爬行的根须、向上抽生的嫩芽。 */
function plantRoot(s, P, C) {
  const g = s.h - 2
  const v = C.v
  const dead = isDead(P)
  const atk = P.anim === 'attack'
  const cx = s.w * 0.46
  const knotY = g - s.h * (dead ? 0.12 : 0.18)
  const rx = s.w * (0.24 + v * 0.012)
  const ry = s.h * 0.13
  shadowOf(s, cx, s.w * 0.38, 0.4)
  // 向两侧爬行的根须
  for (let i = 0; i < 6; i++) {
    const dir = i % 2 ? 1 : -1
    const bx = cx + dir * rx * 0.5
    const ex = cx + dir * s.w * (0.34 + (i % 3) * 0.06)
    const ey = g - s.h * (0.02 + (i % 2) * 0.02)
    s.thick(bx, knotY, (bx + ex) / 2, ey + (atk ? -s.h * 0.03 : 0), Math.max(0.7, s.h * 0.012), C.bodyD)
    s.thick((bx + ex) / 2, ey + (atk ? -s.h * 0.03 : 0), ex, ey, Math.max(0.6, s.h * 0.01), C.body)
    s.px(ex, ey, C.trim)
  }
  // 根块
  s.ell(cx, knotY, rx, ry, C.bodyD)
  s.ell(cx, knotY - 1, rx * 0.9, ry * 0.85, C.body)
  s.ell(cx - rx * 0.35, knotY - ry * 0.35, rx * 0.36, ry * 0.3, C.bodyL, 0.55)
  // 缠绕纹
  for (let i = 0; i < 3; i++) {
    bodyLine(s, cx - rx * 0.7, knotY - ry * 0.2 + i * ry * 0.4, cx + rx * 0.2, knotY + ry * 0.3 + i * ry * 0.2, C.crack, 0.65)
  }
  // 嫩芽（攻击时拔高）
  const shootH = s.h * (dead ? 0.06 : atk ? 0.4 : 0.3)
  for (let i = 0; i < 3; i++) {
    const sx = cx - rx * 0.2 + i * rx * 0.3
    s.thick(sx, knotY - ry * 0.5, sx + (i - 1) * s.w * 0.03, knotY - ry * 0.5 - shootH * (1 - i * 0.2), Math.max(0.7, s.h * 0.009), C.bodyD)
    if (i === 1) {
      s.poly([[sx, knotY - ry * 0.5 - shootH], [sx - s.w * 0.05, knotY - ry * 0.5 - shootH * 0.8], [sx + s.w * 0.05, knotY - ry * 0.5 - shootH * 0.82]], C.trim, 0.9)
      s.px(sx, knotY - ry * 0.5 - shootH, C.glow)
      P.g.push({ x: sx, y: knotY - ry * 0.5 - shootH, r: s.w * 0.07, c: C.glow, p: atk ? 0.7 : 0.35 })
    }
  }
  eyeSet(s, P, C, cx, knotY - ry * 0.1, Math.max(1, s.h * 0.015))
  markOf(s, C, cx - rx * 0.55, knotY - ry * 0.55, rx * 1.1, ry * 0.7)
  motifDetail(s, P, C, cx - rx * 0.75, knotY - ry * 0.6, rx * 1.5, ry * 1.1)
}

/* ============================================================================
 * 5. plan 注册表 + 570 只定义展开
 * ========================================================================== */

const PLANS = {
  quad: { hound: quadHound, boar: quadBoar, feline: quadFeline, mole: quadMole },
  biped: { worker: bipedWorker, patient: bipedPatient, cultist: bipedCultist, soldier: bipedSoldier },
  insect: { beetle: insectBeetle, mantis: insectMantis, ant: insectAnt, tick: insectTick },
  worm: { eel: wormEel, maggot: wormMaggot, leech: wormLeech, larva: wormLarva },
  float: { shade: floatShade, orb: floatOrb, wraith: floatWraith, jelly: floatJelly },
  avian: { crow: avianCrow, moth: avianMoth, bat: avianBat, heron: avianHeron },
  serpent: { viper: serpentViper, cobra: serpentCobra, eel: serpentEel, vine: serpentVine },
  crustacean: { crab: crustCrab, scorpion: crustScorpion, hermit: crustHermit, lobster: crustLobster },
  blob: { slime: blobSlime, tumor: blobTumor, tar: blobTar, mold: blobMold },
  statue: { idol: statueIdol, knight: statueKnight, totem: statueTotem, puppet: statuePuppet },
  mech: { drone: mechDrone, walker: mechWalker, turret: mechTurret, spider: mechSpider },
  plant: { bulb: plantBulb, vine: plantVine, fungus: plantFungus, root: plantRoot },
}

/** 每个 plan 的帧数（run 3-4 / attack 1-2）。 */
const PLAN_META = {
  quad: { run: 4, attack: 2 },
  biped: { run: 4, attack: 1 },
  insect: { run: 4, attack: 2 },
  worm: { run: 3, attack: 1 },
  float: { run: 3, attack: 1 },
  avian: { run: 4, attack: 2 },
  serpent: { run: 3, attack: 1 },
  crustacean: { run: 4, attack: 2 },
  blob: { run: 3, attack: 1 },
  statue: { run: 3, attack: 1 },
  mech: { run: 4, attack: 2 },
  plant: { run: 3, attack: 2 },
}

/** 兜底剪影：未知 plan/sub 一律画成软泥，绝不抛错。 */
function paintFallback(s, P, C) {
  blobSlime(s, P, C)
}

/** id -> 绘制定义。570 只全部在此展开，尺寸 = def.size × scale + 8~14px 内边距。 */
export const ROOM_MINION_ART_DEFS = {}
export const ROOM_MINION_ART_IDS = []

for (const id of Object.keys(ROOM_MINION_DEFS)) {
  const def = ROOM_MINION_DEFS[id]
  const art = def.art || {}
  const group = PLANS[art.plan] || null
  const painter = (group && group[art.sub]) || (group && group._fallback) || paintFallback
  const meta = PLAN_META[art.plan] || PLAN_META.blob
  const seed = strSeed(id)
  const scale = art.scale > 0 ? art.scale : 1
  const baseW = Math.round((def.size && def.size[0]) || 40) * scale
  const baseH = Math.round((def.size && def.size[1]) || 30) * scale
  const padW = 8 + (seed % 5)
  const padH = 8 + ((seed >>> 3) % 7)
  const C = makeCfg(art, seed)
  const entry = {
    w: Math.max(12, Math.round(baseW + padW)),
    h: Math.max(12, Math.round(baseH + padH)),
    seed,
    run: meta.run,
    attack: meta.attack,
    warm: C.warm,
    outline: C.outline,
    lazy: true,
    draw(s, P) {
      if (!P.g) P.g = []
      painter(s, P, C)
      silhouetteFlair(s, C, art.plan)
      if (P.hurt) s.tint(PAL.neonRed, 0.22, true)
    },
  }
  ROOM_MINION_ART_DEFS[id] = entry
  ROOM_MINION_ART_IDS.push(id)
}
