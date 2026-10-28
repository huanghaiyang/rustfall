// ============================================================================
// 锈雨 · RUSTFALL —— 怪物像素美术（MONSTER）
// ----------------------------------------------------------------------------
// 契约：
//   export function getMonsterArt(id) -> {
//     w, h,
//     frames: { idle: [t], run: [t...], attack: [t...], hurt: t, dead: t },
//     anchor: 'bottom-center',
//   }
//
// 8 种（尺寸固定）：
//   radboar  64×42  变异野猪（骨刺 / 腐肉 / 红肿眼）
//   crawler  40×24  群居爬虫（多足 / 甲壳 / 毒囊）
//   spitter  46×34  喷酸者（鼓胀酸囊 / 长吻）
//   wingrat  34×24  翼鼠（膜翼两帧扇动）
//   sentry   44×46  失控哨兵（三脚炮塔 / 扫描红眼 / 激光枪口）
//   scrapper 52×40  拾荒机器人（机械爪 / 废铁拼接 / 裂屏）
//   drone    40×28  无人机（旋翼两帧 / 悬挂炸弹）
//   hulkbot  88×64  重装残骸（坦克履带 + 装甲 + 巨臂）
//
// 约定：脚（或投影）落在最后一行，水平中心 x=w/2，朝右；attack 帧能看出
//       张嘴 / 开炮 / 挥爪；hurt 帧整体泛红；dead 帧瘫在地上。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32 } from '../rng.js'
import { Surf, mix, shade, rgb, setArtModule, ALPHA_STATS } from './core.js'
import { ROOM_MINION_ART_DEFS } from './room-minions.js'
setArtModule('monsters')

const TAU = Math.PI * 2

/* ============================================================================
 * 1. 颜色 / 像素表面
 * ========================================================================== */


/* ============================================================================
 * 2. 通用小件
 * ========================================================================== */

function leg(s, x0, y0, x1, y1, r, c1, c2) {
  s.thick(x0, y0, x1, y1, r, c1)
  s.thick(x0, y0, x1, y1, r * 0.55, c2, 0.6)
}

/** 螺栓：亮点 + 暗影。 */
function bolt(s, x, y, c = PAL.steelLight, dark = PAL.steelDark) {
  s.px(x, y, c)
  s.px(x + 1, y + 1, dark)
}

/** 一撮毛 / 骨刺。 */
function spike(s, x, y, dx, dy, c) {
  s.poly(
    [
      [x - 1.5, y],
      [x + dx, y + dy],
      [x + 1.5, y + 1],
    ],
    c,
  )
}

/** 肉块上的伤口 / 露骨。 */
function wound(s, x, y, w, h, seed) {
  const rnd = mulberry32(seed >>> 0)
  s.ell(x, y, w, h, PAL.bloodDark, 0.9)
  s.ell(x, y, w * 0.7, h * 0.7, PAL.blood, 0.8)
  for (let k = 0; k < 4; k++) {
    s.px(x - w + rnd() * w * 2, y - h + rnd() * h * 2, PAL.bone, 0.6)
  }
}

/** 炮口闪光 / 酸液球。 */
function muzzle(s, x, y, c, r) {
  s.disc(x, y, PAL.white, 0.9)
  s.disc(x, y, r, c, 0.85)
  s.glow(x, y, r * 2.6, c, 0.9)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3
    s.px(x + Math.cos(a) * r * 1.8, y + Math.sin(a) * r * 1.8, c, 0.7)
  }
}

/* ============================================================================
 * 3. 八种怪物
 * ========================================================================== */

/** 变异野猪：骨刺、腐肉、红肿眼。 */
function drawRadboar(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 4) * TAU
  const bob = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const lower = atk ? 3 : 0
  const cy = 24 + bob + lower
  const cx = 30
  const hide = mix(PAL.rust, PAL.dust, 0.4)
  const hideD = mix(hide, PAL.void, 0.4)
  const hideL = mix(hide, PAL.sand, 0.3)
  s.shadow(cx + 2, g - 0.5, 26, 2.4, 0.32)
  // 腿（前二后二）
  for (const [lx, off] of [
    [16, Math.PI],
    [22, Math.PI * 0.5],
    [40, 0],
    [46, Math.PI * 1.5],
  ]) {
    const ph = phase + off
    const dx = Math.sin(ph) * 3
    const lift = Math.max(0, Math.cos(ph - 1)) * 2.5
    leg(s, lx, cy + 8, lx + dx, g - 1 - lift, 2.6, hideD, hide)
    s.rect(lx + dx - 1, g - 1 - lift, 3, 1, PAL.oil)
  }
  // 躯干（厚重，背部高）
  s.ell(cx, cy + 4, 20, 11, hideD)
  s.ell(cx, cy + 3, 19, 10, hide)
  s.ell(cx - 2, cy - 1, 15, 6, hideL, 0.5)
  // 背部骨刺（两排）
  for (let k = 0; k < 6; k++) {
    const x = 18 + k * 6
    spike(s, x, cy - 6 - Math.sin((k / 6) * Math.PI) * 3, -1, -6 - (k % 2) * 2, PAL.boneDark)
    spike(s, x, cy - 6 - Math.sin((k / 6) * Math.PI) * 3, 1, -5, PAL.bone)
  }
  // 鬃毛
  for (let k = 0; k < 9; k++) {
    const x = 14 + k * 4
    s.line(x, cy - 4, x + 1, cy - 9, PAL.ink, 0.65)
  }
  // 腐肉伤口 / 露出的肋骨
  wound(s, 24, cy + 5, 6, 4, 0x11)
  for (let k = 0; k < 3; k++) s.line(20 + k * 3, cy + 7, 22 + k * 3, cy + 2, PAL.bone, 0.75)
  wound(s, 38, cy + 2, 4, 3, 0x12)
  // 头（低垂、朝右）
  const hx = atk ? 50 : 48
  const hy = cy + (atk ? 6 : 1)
  s.ell(hx, hy, 11, 8, hideD)
  s.ell(hx + 1, hy, 10, 7, hide)
  s.ell(hx + 2, hy - 2, 7, 4, hideL, 0.4)
  // 长吻 / 鼻盘
  s.poly(
    [
      [hx + 6, hy - 2],
      [hx + 15, hy + 1],
      [hx + 14, hy + 6],
      [hx + 6, hy + 6],
    ],
    hideD,
  )
  s.ell(hx + 14, hy + 4, 2.4, 2.6, PAL.rustDark)
  s.px(hx + 13, hy + 3, PAL.void)
  s.px(hx + 15, hy + 3, PAL.void)
  // 獠牙（上翘）
  s.poly(
    [
      [hx + 11, hy + 5],
      [hx + 13, hy + 2],
      [hx + 12, hy + 6],
    ],
    PAL.bone,
  )
  s.poly(
    [
      [hx + 8, hy + 6],
      [hx + 10, hy + 1],
      [hx + 9, hy + 6],
    ],
    PAL.boneDark,
  )
  // 嘴（攻击时张开）
  if (atk) {
    s.poly(
      [
        [hx + 8, hy + 6],
        [hx + 16, hy + 7],
        [hx + 15, hy + 11],
        [hx + 9, hy + 10],
      ],
      PAL.bloodDark,
    )
    for (let k = 0; k < 5; k++) s.px(hx + 9 + k * 1.6, hy + 7, PAL.bone, 0.9)
    s.px(hx + 12, hy + 8, PAL.blood)
  }
  // 红肿眼（发光）
  s.ell(hx - 2, hy - 3, 3.4, 3, PAL.bloodDark)
  s.disc(hx - 2, hy - 3, 2.2, PAL.neonRed)
  s.px(hx - 2, hy - 3, PAL.white, 0.9)
  F.g.push({ x: hx - 2, y: hy - 3, r: 8, c: PAL.neonRed, p: 0.55 })
  // 耳
  s.poly(
    [
      [hx - 6, hy - 4],
      [hx - 9, hy - 9],
      [hx - 3, hy - 6],
    ],
    hideD,
  )
  // 攻击：速度线 / 尘土
  if (atk) {
    for (let k = 0; k < 5; k++) s.line(cx - 20 - k * 2, cy - 4 + k * 3, cx - 8, cy - 3 + k * 3, PAL.dust, 0.35)
    for (let k = 0; k < 7; k++) s.px(cx + 12 + s.r() * 8, g - 1 - s.r() * 3, PAL.dust, 0.45)
    F.g.push({ x: hx - 2, y: hy - 3, r: 10, c: PAL.neonRed, p: 0.3 })
  }
  // 皮肤质感
  s.speck(cx - 18, cy - 8, 38, 22, PAL.rustDark, 0.1, 0.5)
  s.speck(cx - 18, cy - 8, 38, 22, PAL.dust, 0.06, 0.4)
}

/** 群居爬虫：多足、甲壳、毒囊。 */
function drawCrawler(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 3) * TAU
  const rear = atk ? 4 : 0
  const cy = 13 - rear
  const cx = 19
  const shell = mix(PAL.steelBlue, PAL.toxicDark, 0.45)
  const shellL = mix(shell, PAL.toxic, 0.35)
  const shellD = mix(shell, PAL.void, 0.45)
  s.shadow(cx, g - 0.5, 15, 1.6, 0.3)
  // 六足（三对，交替摆动）
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const off = k * 0.9 + (side > 0 ? Math.PI : 0)
      const ph = phase + off
      const lift = Math.max(0, Math.cos(ph)) * 2.2
      const hx = cx - 6 + k * 6
      const kx = hx + side * 5
      const fx = hx + side * (7 + Math.sin(ph) * 2)
      s.thick(hx, cy + 3, kx, cy + 6, 1.2, shellD)
      s.thick(kx, cy + 6, fx, g - 1 - lift, 1, shell)
      s.px(fx, g - 1 - lift, PAL.ink)
    }
  }
  // 腹部 / 甲壳
  s.ell(cx, cy + 2, 13, 6, shellD)
  s.ell(cx, cy + 1, 12, 5.2, shell)
  // 甲片分节
  for (let k = 0; k < 4; k++) {
    s.line(cx - 9 + k * 5, cy - 3, cx - 10 + k * 5, cy + 5, shellD, 0.8)
    s.line(cx - 8 + k * 5, cy - 4, cx - 7 + k * 5, cy + 2, shellL, 0.5)
  }
  // 背部毒囊（半透明绿）
  s.ell(cx - 3, cy - 5, 5, 4, PAL.toxicDark)
  s.ell(cx - 3, cy - 5.5, 4, 3, PAL.toxic)
  s.px(cx - 4, cy - 6, PAL.toxicGlow)
  F.g.push({ x: cx - 3, y: cy - 5, r: 8, c: PAL.toxicGlow, p: 0.3 })
  // 头（前端，朝右）
  const hx = cx + 11
  s.ell(hx, cy + 1, 5.5, 4.5, shellD)
  s.ell(hx + 0.5, cy + 1, 4.6, 3.8, shellL)
  // 复眼（两个小点）
  s.px(hx + 2, cy - 1, PAL.neonWarm)
  s.px(hx + 3, cy, PAL.neonWarm)
  F.g.push({ x: hx + 2, y: cy - 1, r: 4, c: PAL.neonWarm, p: 0.4 })
  // 口器（攻击时张开）
  if (atk) {
    s.line(hx + 4, cy + 1, hx + 9, cy - 2, PAL.boneDark)
    s.line(hx + 4, cy + 3, hx + 9, cy + 6, PAL.boneDark)
    s.px(hx + 8, cy - 2, PAL.bone)
    s.px(hx + 8, cy + 6, PAL.bone)
    s.disc(hx + 6, cy + 2, 1.6, PAL.toxicGlow, 0.8)
    F.g.push({ x: hx + 6, y: cy + 2, r: 5, c: PAL.toxicGlow, p: 0.5 })
  } else {
    s.line(hx + 4, cy + 1, hx + 7, cy + 1, PAL.boneDark)
    s.line(hx + 4, cy + 3, hx + 7, cy + 3, PAL.boneDark)
  }
  // 触角
  s.line(hx + 1, cy - 2, hx + 6, cy - 6, PAL.ink, 0.8)
  s.line(hx + 1, cy - 2, hx + 8, cy - 4, PAL.ink, 0.6)
  // 尾刺
  s.poly(
    [
      [cx - 12, cy],
      [cx - 16, cy - 3],
      [cx - 12, cy + 2],
    ],
    PAL.boneDark,
  )
  // 质感
  s.speck(cx - 12, cy - 6, 26, 12, PAL.rustDark, 0.08, 0.5)
}

/** 喷酸者：鼓胀酸囊 + 长吻。 */
function drawSpitter(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 3) * TAU
  const cy = 19 - (atk ? 1 : 0)
  const cx = 17
  const body = mix(PAL.toxicDark, PAL.rustDark, 0.45)
  const bodyL = mix(body, PAL.toxic, 0.4)
  const bodyD = mix(body, PAL.void, 0.4)
  const sac = atk ? 1.06 : 1
  s.shadow(cx + 4, g - 0.5, 17, 1.8, 0.3)
  // 细腿
  for (const [lx, off] of [
    [10, Math.PI],
    [16, 0],
    [26, Math.PI * 0.5],
    [32, Math.PI * 1.5],
  ]) {
    const ph = phase + off
    const dx = Math.sin(ph) * 2.4
    const lift = Math.max(0, Math.cos(ph - 1)) * 2
    leg(s, lx, cy + 8, lx + dx, g - 1 - lift, 1.8, bodyD, body)
  }
  // 鼓胀酸囊（身体）
  s.ell(cx, cy + 4, 14 * sac, 10 * sac, bodyD)
  s.ell(cx, cy + 3, 13 * sac, 9 * sac, body)
  // 酸囊（半透明、发绿、有血管）
  s.ell(cx - 2, cy + 1, 9 * sac, 7 * sac, PAL.toxicDark)
  s.ell(cx - 2, cy, 7.5 * sac, 5.8 * sac, PAL.toxic)
  s.ell(cx - 3, cy - 2, 4 * sac, 2.6 * sac, PAL.toxicGlow, 0.7)
  for (let k = 0; k < 4; k++) {
    s.line(cx - 9 + k * 4, cy - 6, cx - 6 + k * 4, cy + 6, PAL.toxicDark, 0.5)
  }
  F.g.push({ x: cx - 2, y: cy, r: 16, c: PAL.toxicGlow, p: 0.35 })
  // 背部疣 / 刺
  for (let k = 0; k < 4; k++) {
    const x = cx - 8 + k * 5
    s.px(x, cy - 8 + (k % 2), PAL.rustLight)
    s.px(x, cy - 9 + (k % 2), PAL.bone, 0.6)
  }
  // 长吻（朝右，攻击时伸长）
  const snout = atk ? 15 : 12
  s.poly(
    [
      [cx + 8, cy + 1],
      [cx + snout, cy + 6],
      [cx + snout - 1, cy + 10],
      [cx + 8, cy + 9],
    ],
    bodyD,
  )
  s.poly(
    [
      [cx + 9, cy + 3],
      [cx + snout - 1, cy + 7],
      [cx + snout - 2, cy + 9],
      [cx + 9, cy + 8],
    ],
    bodyL,
  )
  // 吻端开口 + 酸滴
  s.ell(cx + snout - 1, cy + 8, 2, 2, PAL.void)
  if (atk) {
    s.disc(cx + snout + 1, cy + 8, 2.6, PAL.toxic)
    s.disc(cx + snout + 1, cy + 8, 1.4, PAL.toxicGlow)
    F.g.push({ x: cx + snout + 1, y: cy + 8, r: 8, c: PAL.toxicGlow, p: 0.8 })
    // 喷出的酸液
    for (let k = 0; k < 4; k++) {
      s.px(cx + snout + 3 + k * 3, cy + 6 + (k % 2) * 3, PAL.toxicGlow, 0.7 - k * 0.12)
    }
  } else {
    s.px(cx + snout - 1, cy + 11, PAL.toxicGlow, 0.5)
  }
  // 眼（两粒，黄绿）
  s.px(cx + 4, cy + 1, PAL.neonWarm)
  s.px(cx + 6, cy + 2, PAL.neonWarm, 0.8)
  F.g.push({ x: cx + 5, y: cy + 1, r: 4, c: PAL.neonWarm, p: 0.3 })
  // 质感
  s.speck(cx - 14, cy - 8, 28, 20, PAL.rustDark, 0.06, 0.45)
  s.speck(cx - 6, cy - 6, 14, 12, PAL.toxicGlow, 0.05, 0.35)
}

/** 翼鼠：膜翼两帧扇动。 */
function drawWingrat(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const up = F.anim === 'run' ? i % 2 === 0 : true
  const cy = atk ? 11 : 12
  const cx = 17
  const fur = mix(PAL.rustDark, PAL.dust, 0.35)
  const furL = mix(fur, PAL.sand, 0.3)
  const furD = mix(fur, PAL.void, 0.45)
  const membrane = mix(PAL.bloodDark, PAL.dust, 0.35)
  const membraneL = mix(membrane, PAL.sand, 0.25)
  s.shadow(cx, g - 0.5, 9, 1.4, 0.24)
  // 膜翼（两帧：上扬 / 下压）
  const wy = up ? -8 : 4
  for (const side of [-1, 1]) {
    const bx = side < 0 ? cx - 3 : cx + 4
    s.poly(
      [
        [bx, cy - 1],
        [bx + side * 10, cy + wy],
        [bx + side * 14, cy + wy + 5],
        [bx + side * 9, cy + 4],
        [bx + side * 3, cy + 3],
      ],
      membrane,
      0.9,
    )
    // 翅骨
    s.line(bx, cy - 1, bx + side * 10, cy + wy, PAL.ink, 0.85)
    s.line(bx + side * 10, cy + wy, bx + side * 14, cy + wy + 5, PAL.ink, 0.7)
    s.line(bx, cy - 1, bx + side * 9, cy + 4, PAL.ink, 0.55)
    // 膜的高光
    s.line(bx + side * 4, cy + 1, bx + side * 9, cy + wy + 3, membraneL, 0.4)
  }
  // 身体
  s.ell(cx, cy + 2, 7, 5, furD)
  s.ell(cx, cy + 1.5, 6, 4.4, fur)
  s.ell(cx - 1, cy, 3.4, 2.4, furL, 0.55)
  // 头（朝右，大耳）
  s.ell(cx + 6, cy, 4.6, 4, furD)
  s.ell(cx + 6.4, cy, 4, 3.4, fur)
  s.px(cx + 8, cy - 1, PAL.neonRed)
  s.px(cx + 9, cy, PAL.neonRed, 0.7)
  F.g.push({ x: cx + 8, y: cy - 1, r: 4.5, c: PAL.neonRed, p: 0.45 })
  // 耳
  s.poly(
    [
      [cx + 4, cy - 3],
      [cx + 5, cy - 8],
      [cx + 7, cy - 3],
    ],
    furD,
  )
  s.px(cx + 5, cy - 6, PAL.blood, 0.7)
  // 吻 / 牙
  s.line(cx + 9, cy + 2, cx + 11, cy + 3, furD)
  s.px(cx + 10, cy + 3, PAL.bone)
  if (atk) {
    // 俯冲：爪子前伸 + 速度线
    s.line(cx + 4, cy + 5, cx + 9, cy + 8, PAL.bone, 0.9)
    s.line(cx - 2, cy + 5, cx - 6, cy + 8, PAL.bone, 0.8)
    for (let k = 0; k < 3; k++) s.line(cx - 12 - k * 2, cy - 2 + k * 3, cx - 5, cy - 1 + k * 3, PAL.dust, 0.35)
  }
  // 尾
  s.thick(cx - 6, cy + 3, cx - 12, cy + 5, 1, furD)
  s.px(cx - 13, cy + 6, PAL.dust, 0.7)
  // 皮毛质感
  s.speck(cx - 6, cy - 3, 12, 8, PAL.rustDark, 0.12, 0.5)
}

/** 失控哨兵：三脚炮塔 + 扫描红眼 + 激光枪口。 */
function drawSentry(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const scan = (i / 3) * TAU
  const bodyY = 22
  const cx = 21
  const metal = mix(PAL.steel, PAL.steelLight, 0.25)
  const metalD = mix(PAL.steelDark, PAL.void, 0.25)
  s.shadow(cx, g - 0.5, 14, 1.8, 0.3)
  // 三脚架（三条腿，脚尖撑地）
  for (const [dx, fx] of [
    [-8, -13],
    [2, 4],
    [9, 14],
  ]) {
    s.thick(cx + dx, bodyY + 10, cx + dx * 1.2, bodyY + 18, 1.6, metalD)
    s.thick(cx + fx, g - 2, cx + dx * 1.2, bodyY + 18, 1.6, metal)
    s.rect(cx + fx - 1, g - 2, 3, 1, PAL.steelDark)
    // 关节
    s.disc(cx + dx * 1.2, bodyY + 18, 1.8, PAL.steelDark)
  }
  // 底座
  s.ell(cx, bodyY + 10, 9, 4, metalD)
  s.ell(cx, bodyY + 9, 8, 3, metal)
  // 塔身（可旋转的鼓形）
  s.ell(cx, bodyY + 4, 11, 9, metalD)
  s.ell(cx, bodyY + 3.4, 10, 8, metal)
  s.ell(cx, bodyY + 1, 7, 5, mix(metal, PAL.steelWhite, 0.35), 0.6)
  // 装甲带 + 铆钉
  s.rect(cx - 10, bodyY + 5, 20, 3, PAL.steelDark)
  for (let k = 0; k < 4; k++) s.px(cx - 8 + k * 5, bodyY + 6, PAL.steelLight, 0.8)
  // 扫描眼（横条红眼，扫描时偏移）
  const eyeX = cx + 2 + (F.anim === 'run' ? Math.round(Math.sin(scan) * 4) : 0)
  s.rect(cx - 5, bodyY + 1, 12, 4, PAL.black)
  s.rect(eyeX - 2, bodyY + 2, 5, 2, PAL.neonRed)
  s.px(eyeX, bodyY + 2, PAL.white, 0.9)
  F.g.push({ x: eyeX, y: bodyY + 2, r: 10, c: PAL.neonRed, p: 0.7 })
  // 扫描扇形（run 帧）
  if (F.anim === 'run') {
    const a = Math.sin(scan) * 0.7
    for (let d = 4; d < 16; d += 2) {
      s.px(eyeX + Math.cos(a) * d, bodyY + 2 + Math.sin(a) * d, PAL.neonRed, 0.18)
    }
  }
  // 激光枪管（朝右）
  s.rect(cx + 10, bodyY + 2, 11, 4, metalD)
  s.rect(cx + 11, bodyY + 3, 9, 2, metal)
  s.rect(cx + 19, bodyY + 2, 3, 4, PAL.steelLight)
  s.px(cx + 21, bodyY + 3, PAL.neonRed, 0.9)
  // 天线 / 警示灯
  s.line(cx - 6, bodyY - 4, cx - 8, bodyY - 12, PAL.steelLight)
  s.px(cx - 8, bodyY - 12, PAL.neonRed)
  F.g.push({ x: cx - 8, y: bodyY - 12, r: 4, c: PAL.neonRed, p: 0.4 })
  // 破损面板 / 线缆
  s.poly(
    [
      [cx - 9, bodyY + 2],
      [cx - 4, bodyY + 2],
      [cx - 5, bodyY + 8],
      [cx - 9, bodyY + 7],
    ],
    PAL.void,
  )
  s.line(cx - 7, bodyY + 3, cx - 6, bodyY + 7, PAL.oilSheen)
  s.thick(cx - 3, bodyY + 10, cx + 2, bodyY + 16, 1, PAL.oilSheen, 0.9)
  // 开炮
  if (atk) {
    s.rect(cx + 21, bodyY + 2, 8, 4, PAL.neonRed, 0.7)
    muzzle(s, cx + 25, bodyY + 3, PAL.neonRed, 3)
    for (let k = 0; k < 3; k++) s.line(cx + 27 + k * 4, bodyY + 3, cx + 34 + k * 4, bodyY + 3, PAL.neonRed, 0.35)
  }
  // 质感
  s.speck(cx - 11, bodyY - 6, 22, 22, PAL.rustDark, 0.08, 0.5)
}

/** 拾荒机器人：机械爪、废铁拼接、裂屏。 */
function drawScrapper(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 4) * TAU
  const bob = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const cx = 26
  const hipY = 27 + bob
  const shY = 15 + bob
  const metal = mix(PAL.steel, PAL.rust, 0.4)
  const metalD = mix(metal, PAL.void, 0.45)
  const metalL = mix(metal, PAL.steelLight, 0.4)
  s.shadow(cx, g - 0.5, 17, 2, 0.3)
  // 腿（两条，一条是废铁焊的）
  for (const [side, off] of [
    [-1, Math.PI],
    [1, 0],
  ]) {
    const ph = phase + off
    const dx = Math.sin(ph) * 4
    const lift = Math.max(0, Math.cos(ph - 1)) * 3.2
    const hx = cx + side * 3
    const fx = cx + side * 3 + dx
    s.thick(hx, hipY, hx + side * 2, hipY + 6, 2.2, metalD)
    s.thick(hx + side * 2, hipY + 6, fx, g - 1 - lift, 1.8, metal)
    s.rect(fx - 2, g - 1 - lift, 5, 2, PAL.steelDark)
    s.px(fx + 2, g - 1 - lift, PAL.steelLight, 0.7)
  }
  // 躯干（不对称的废铁拼接）
  s.poly(
    [
      [cx - 9, shY],
      [cx + 9, shY],
      [cx + 8, hipY],
      [cx - 8, hipY],
    ],
    metal,
  )
  s.line(cx - 8, shY + 1, cx - 7, hipY - 1, metalL, 0.8)
  // 补丁（不同来源的铁皮）
  s.poly(
    [
      [cx - 8, shY + 2],
      [cx - 2, shY + 3],
      [cx - 3, shY + 9],
      [cx - 8, shY + 8],
    ],
    PAL.rustLight,
  )
  s.rect(cx + 1, shY + 5, 7, 5, PAL.steelBlue)
  bolt(s, cx + 2, shY + 6)
  bolt(s, cx - 6, shY + 4)
  // 裂屏（胸口的旧显示器，裂了但还亮）
  s.rect(cx - 5, shY + 2, 9, 6, PAL.black)
  s.rect(cx - 4, shY + 3, 7, 4, PAL.toxicDark)
  s.line(cx - 4, shY + 3, cx + 2, shY + 6, PAL.glass, 0.5)
  s.px(cx - 2, shY + 4, PAL.toxicGlow, 0.8)
  s.px(cx + 1, shY + 5, PAL.toxic, 0.6)
  F.g.push({ x: cx - 1, y: shY + 4, r: 6, c: PAL.toxicGlow, p: 0.3 })
  // 头（小而歪，单眼）
  const hx = cx + 1
  const hy = shY - 7
  s.poly(
    [
      [hx - 5, hy + 2],
      [hx - 3, hy - 2],
      [hx + 4, hy - 1],
      [hx + 5, hy + 5],
      [hx - 4, hy + 6],
    ],
    metalD,
  )
  s.rect(hx - 3, hy + 1, 6, 3, PAL.black)
  s.rect(hx - 1, hy + 1, 3, 1, PAL.neonWarm)
  F.g.push({ x: hx, y: hy + 1, r: 5, c: PAL.neonWarm, p: 0.45 })
  s.line(hx - 2, hy - 3, hx - 4, hy - 7, PAL.steelLight)
  // 小臂（左）
  s.thick(cx - 9, shY + 2, cx - 13, shY + 8, 1.8, metalD)
  s.rect(cx - 15, shY + 8, 4, 3, PAL.steelDark)
  // 大机械爪（右臂，攻击时伸出）
  const armX = atk ? cx + 19 : cx + 13
  s.thick(cx + 9, shY + 2, cx + 13, shY + 6, 2.6, metalD)
  s.thick(cx + 13, shY + 6, armX, shY + 4, 2.2, metal)
  s.disc(cx + 13, shY + 6, 2.6, PAL.steelDark)
  // 爪（两指）
  s.line(armX, shY + 3, armX + 5, shY, PAL.steelLight)
  s.line(armX, shY + 6, armX + 5, shY + 8, PAL.steelLight)
  s.px(armX + 5, shY, PAL.steelWhite)
  s.px(armX + 5, shY + 8, PAL.steelWhite)
  if (atk) {
    s.px(armX + 4, shY + 3, PAL.neonWarm)
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU
      s.px(armX + 1 + Math.cos(a) * 4, shY + 4 + Math.sin(a) * 4, PAL.neonWarm, 0.7)
    }
    F.g.push({ x: armX + 2, y: shY + 4, r: 8, c: PAL.neonWarm, p: 0.6 })
  }
  // 线缆 / 油污 / 锈
  s.thick(cx + 4, shY + 10, cx + 8, hipY, 1, PAL.oilSheen, 0.9)
  s.thick(cx - 6, shY + 10, cx - 8, hipY - 2, 1, PAL.oil, 0.9)
  s.speck(cx - 12, shY - 6, 26, hipY - shY + 12, PAL.rustDark, 0.12, 0.5)
  s.speck(cx - 12, shY - 6, 26, hipY - shY + 12, PAL.steelWhite, 0.02, 0.3)
}

/** 无人机：旋翼两帧 + 悬挂炸弹。 */
function drawDrone(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' && i % 2 === 1 ? 1 : 0
  const cy = 11 + hover
  const cx = 20
  const metal = mix(PAL.steel, PAL.steelLight, 0.3)
  const metalD = mix(PAL.steelDark, PAL.void, 0.2)
  // 空中投影（小、轻）
  s.shadow(cx, g - 0.5, 9, 1.4, 0.18)
  // 机架（4 条臂）
  for (const [dx, dy] of [
    [-9, -5],
    [9, -5],
    [-9, 4],
    [9, 4],
  ]) {
    s.thick(cx, cy, cx + dx, cy + dy, 1.4, metalD)
    s.poly(
      [
        [cx + dx - 2, cy + dy - 1],
        [cx + dx + 2, cy + dy - 1],
        [cx + dx, cy + dy + 2],
      ],
      PAL.steelDark,
    )
    // 旋翼（两帧：模糊盘 / 叶片）
    const rx = cx + dx
    const ry = cy + dy - 1
    if (F.anim === 'run' && i % 2 === 0) {
      s.ell(rx, ry, 5.5, 1.4, PAL.steelWhite, 0.25)
      s.ell(rx, ry, 4, 1, PAL.steelWhite, 0.35)
    } else {
      s.line(rx - 5, ry, rx + 5, ry, PAL.steelLight, 0.8)
      s.line(rx, ry - 1, rx, ry + 1, PAL.steelLight, 0.6)
      s.px(rx - 5, ry, PAL.white, 0.6)
      s.px(rx + 5, ry, PAL.white, 0.6)
    }
  }
  // 机体
  s.ell(cx, cy + 1, 8, 5.5, metalD)
  s.ell(cx, cy, 7, 4.6, metal)
  s.ell(cx - 1, cy - 1, 4, 2.4, mix(metal, PAL.steelWhite, 0.4), 0.6)
  // 头部传感器（红眼）
  s.disc(cx + 5, cy + 1, 3, PAL.steelDark)
  s.disc(cx + 5, cy + 1, 1.8, PAL.neonRed)
  F.g.push({ x: cx + 5, y: cy + 1, r: 7, c: PAL.neonRed, p: 0.6 })
  // 机身灯
  s.px(cx - 5, cy, PAL.neon, 0.9)
  F.g.push({ x: cx - 5, y: cy, r: 4, c: PAL.neon, p: 0.35 })
  // 悬挂炸弹（挂在机腹）
  const bombY = atk ? cy + 13 : cy + 7
  s.line(cx - 1, cy + 4, cx - 1, bombY - 2, PAL.oilSheen)
  s.ell(cx, bombY, 4, 5, PAL.steelDark)
  s.ell(cx - 1, bombY, 3.2, 4, PAL.ashPale)
  s.rect(cx - 2, bombY + 3, 4, 1, PAL.rust)
  s.px(cx - 2, bombY - 2, PAL.neonWarm)
  // 尾灯闪烁
  s.px(cx - 7, cy + 3, PAL.neonWarm, 0.8)
  if (atk) {
    // 投弹：炸弹下坠 + 尾部火光
    F.g.push({ x: cx, y: bombY + 5, r: 5, c: PAL.neonWarm, p: 0.5 })
    for (let k = 0; k < 4; k++) s.px(cx - 1, bombY + 6 + k, PAL.neonWarm, 0.4 - k * 0.08)
    s.line(cx, bombY + 6, cx, g - 2, PAL.neonWarm, 0.15)
  }
  // 锈
  s.speck(cx - 8, cy - 5, 16, 12, PAL.rustDark, 0.1, 0.5)
}

/** 重装残骸：坦克履带 + 装甲 + 巨臂。 */
function drawHulkbot(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 3) * TAU
  const bob = F.anim === 'run' ? (i % 2 ? 1 : 0) : 0
  const cx = 44
  const hullY = 34 + bob
  const metal = mix(PAL.steel, PAL.rustDark, 0.5)
  const metalD = mix(metal, PAL.void, 0.45)
  const metalL = mix(metal, PAL.steelLight, 0.35)
  s.shadow(cx, g - 0.5, 40, 3, 0.34)
  // —— 双履带 ——
  for (const tx of [cx - 38, cx + 12]) {
    const tw = 26
    const th = 14
    const ty = g - th - 1
    s.rect(tx + 2, ty, tw - 4, th, PAL.steelDark)
    s.rect(tx, ty + 2, tw, th - 4, PAL.steelDark)
    s.rect(tx + 2, ty + 1, tw - 4, 1, metalD)
    s.rect(tx + 2, ty + th - 2, tw - 4, 1, PAL.black)
    // 胎块（随帧滚动）
    const n = 6
    const off = ((i + (tx < cx ? 0 : 3)) % n + n) % n
    for (let k = 0; k < n; k++) {
      const px = tx + 2 + Math.floor((((k + off) % n) * (tw - 4)) / n)
      s.rect(px, ty + 1, 2, th - 3, metal)
      s.px(px, ty + 2, PAL.steelLight, 0.6)
    }
    // 负重轮
    for (let k = 0; k < 3; k++) {
      s.disc(tx + 5 + k * 8, ty + th / 2, 3, PAL.steelDark)
      s.disc(tx + 5 + k * 8, ty + th / 2, 1.4, PAL.steel)
    }
  }
  // —— 车体 ——
  s.poly(
    [
      [cx - 30, hullY + 12],
      [cx - 32, hullY - 4],
      [cx - 20, hullY - 12],
      [cx + 18, hullY - 12],
      [cx + 30, hullY - 2],
      [cx + 28, hullY + 12],
    ],
    metalD,
  )
  s.poly(
    [
      [cx - 28, hullY + 10],
      [cx - 30, hullY - 3],
      [cx - 18, hullY - 10],
      [cx + 16, hullY - 10],
      [cx + 27, hullY - 1],
      [cx + 26, hullY + 10],
    ],
    metal,
  )
  // 前部装甲板（斜角）
  s.poly(
    [
      [cx + 6, hullY - 10],
      [cx + 16, hullY - 10],
      [cx + 27, hullY - 1],
      [cx + 26, hullY + 10],
      [cx + 8, hullY + 10],
    ],
    mix(metal, PAL.steel, 0.4),
  )
  s.line(cx + 7, hullY - 8, cx + 25, hullY, metalL, 0.8)
  s.line(cx + 8, hullY + 9, cx + 25, hullY + 9, PAL.void, 0.5)
  // 装甲拼缝 + 铆钉
  for (let k = 0; k < 3; k++) {
    s.line(cx - 26 + k * 14, hullY - 9, cx - 27 + k * 14, hullY + 9, metalD, 0.8)
    for (let j = 0; j < 2; j++) s.px(cx - 22 + k * 14, hullY - 4 + j * 8, PAL.steelLight, 0.7)
  }
  s.rect(cx - 26, hullY + 2, 30, 4, PAL.rust, 0.55)
  s.rect(cx - 20, hullY - 6, 12, 6, PAL.rustDark, 0.7)
  // 破洞 / 弹痕
  s.ell(cx + 4, hullY - 2, 4, 3, PAL.void)
  s.line(cx + 1, hullY - 4, cx + 7, hullY, PAL.rustDark)
  for (let k = 0; k < 3; k++) s.ell(cx - 18 + k * 10, hullY - 6, 1.6, 1.6, PAL.void, 0.8)
  // —— 炮塔 / 头（小，红眼）——
  const headY = hullY - 18
  s.poly(
    [
      [cx - 8, headY + 6],
      [cx - 6, headY - 3],
      [cx + 8, headY - 3],
      [cx + 10, headY + 6],
    ],
    metalD,
  )
  s.rect(cx - 5, headY, 12, 4, PAL.black)
  s.rect(cx - 3, headY + 1, 8, 2, PAL.neonRed)
  s.px(cx + 2, headY + 1, PAL.white, 0.9)
  F.g.push({ x: cx, y: headY + 2, r: 12, c: PAL.neonRed, p: 0.8 })
  s.line(cx - 7, headY - 3, cx - 10, headY - 9, PAL.steelLight)
  // —— 巨臂（左右各一，攻击时抬起砸下）——
  const armUp = atk ? -12 : 0
  for (const side of [-1, 1]) {
    const sx = cx + side * 26
    const ex = cx + side * 34
    const ey = hullY - 4 + armUp
    s.thick(sx, hullY - 6, ex, ey, 5, metalD)
    s.thick(sx, hullY - 7, ex, ey - 1, 3.4, metal)
    s.disc(sx, hullY - 6, 5.4, PAL.steelDark)
    s.disc(sx, hullY - 6, 3, metalL)
    // 前臂 + 拳
    const hx = ex + side * 2
    const hy = ey + (atk ? -6 : 10)
    s.thick(ex, ey, hx, hy, 4, metal)
    s.disc(hx, hy, 5, PAL.steelDark)
    s.disc(hx, hy, 3.4, PAL.steel)
    s.px(hx - side, hy - 2, PAL.steelLight, 0.9)
    // 液压
    s.line(sx, hullY - 2, ex, ey + 3, PAL.steelLight, 0.45)
  }
  if (atk) {
    // 砸地：两侧冲击 + 尘
    for (let k = 0; k < 8; k++) {
      s.px(cx - 34 + s.r() * 68, g - 1 - s.r() * 4, PAL.dust, 0.4)
    }
    s.line(cx - 30, g - 2, cx - 22, g - 5, PAL.dust, 0.35)
    s.line(cx + 30, g - 2, cx + 22, g - 5, PAL.dust, 0.35)
  }
  // 质感
  s.speck(cx - 32, hullY - 14, 60, 28, PAL.rustDark, 0.1, 0.55)
  s.speck(cx - 32, hullY - 14, 60, 28, PAL.rustLight, 0.03, 0.4)
}

/* ============================================================================
 * 3.5 新增种群：辐尸 / 隧道猎犬 / 义体螳螂 / 赛博精神病
 * ========================================================================== */

/** 辐尸：佝偻的人形，皮包骨，一只发光的眼睛。 */
function drawGhoulHusk(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const step = Math.sin((i / 3) * TAU) * 2
  const cx = 17
  const hipY = g - 9
  const skin = mix(PAL.boneDark, PAL.rustDark, 0.45)
  const skinL = mix(skin, PAL.bone, 0.35)
  const skinD = mix(PAL.void, skin, 0.55)
  s.shadow(cx, g - 0.5, 10, 1.4, 0.3)
  // 腿：一前一后
  s.thick(cx - 3, hipY, cx - 5 + step, g - 1, 2.4, skinD)
  s.thick(cx + 3, hipY, cx + 5 - step, g - 1, 2.4, skin)
  s.px(cx - 5 + step, g - 1, PAL.bone, 0.7)
  s.px(cx + 5 - step, g - 1, PAL.bone, 0.7)
  // 躯干：肋骨外露
  s.ell(cx, hipY - 7, 7, 9, skinD)
  s.ell(cx + 1, hipY - 7, 6, 8, skin)
  for (let k = 0; k < 4; k++) {
    s.line(cx - 4, hipY - 12 + k * 2.2, cx + 4, hipY - 11 + k * 2.2, skinL, 0.55)
  }
  // 破布
  s.rect(cx - 6, hipY - 2, 12, 3, mix(PAL.rust, PAL.ash, 0.4), 0.85)
  // 手臂：晃荡 / 扑击时抬起
  const armY = atk ? hipY - 16 : hipY - 4
  s.thick(cx + 5, hipY - 11, cx + 11, armY, 2.2, skin)
  s.thick(cx - 5, hipY - 11, cx - 8, armY + 3, 2.2, skinD)
  s.px(cx + 12, armY, PAL.bone, 0.8)
  s.px(cx - 9, armY + 4, PAL.bone, 0.7)
  // 头：前倾
  const hx = cx + 5
  const hy = hipY - 17
  s.ell(hx, hy, 5.5, 5, skinD)
  s.ell(hx + 0.5, hy, 4.6, 4, skinL)
  // 一只眼 + 眼窝
  s.ell(hx + 2, hy - 1, 2.4, 2, PAL.void)
  s.px(hx + 2, hy - 1, PAL.toxicGlow)
  F.g.push({ x: hx + 2, y: hy - 1, r: 6, c: PAL.toxicGlow, p: 0.45 })
  if (atk) {
    // 张嘴 / 嘶叫
    s.rect(hx + 1, hy + 2, 4, 3, PAL.void)
    s.px(hx + 2, hy + 2, PAL.bone, 0.8)
    s.px(hx + 3, hy + 4, PAL.bone, 0.8)
  } else {
    s.line(hx, hy + 3, hx + 5, hy + 3, PAL.ink, 0.7)
  }
  // 烂皮 / 渗液
  s.speck(cx - 8, hipY - 14, 16, 20, PAL.rustDark, 0.12, 0.5)
  s.px(cx + 1, hipY - 3, PAL.toxicDark, 0.35)
}

/** 隧道猎犬：无眼、四足、脊背息肉，嘴咧到耳根。 */
function drawTunnelHound(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const cy = 12
  const cx = 22
  const hide = mix(PAL.ash, PAL.rustDark, 0.35)
  const hideL = mix(hide, PAL.boneDark, 0.3)
  const hideD = mix(PAL.void, hide, 0.5)
  s.shadow(cx, g - 0.5, 16, 1.6, 0.3)
  // 四条腿：对角步态
  const legs = [
    [-10, -1],
    [-7, 1],
    [8, 1],
    [11, -1],
  ]
  for (let k = 0; k < legs.length; k++) {
    const [ox, side] = legs[k]
    const ph = (i / 2) * TAU + (k % 2 ? Math.PI : 0)
    const lift = Math.max(0, Math.cos(ph)) * 2.6
    const fx = cx + ox + Math.sin(ph) * 3
    s.thick(cx + ox, cy + 4, cx + ox + side * 2, g - 3, 1.8, hideD)
    s.thick(cx + ox + side * 2, g - 3, fx, g - 1 - lift, 2, hide)
    s.px(fx, g - 1 - lift, PAL.ink)
  }
  // 躯干 + 脊背息肉
  s.ell(cx, cy + 2, 17, 6, hideD)
  s.ell(cx, cy + 1, 16, 5.2, hide)
  s.ell(cx + 2, cy - 1, 13, 4, hideL)
  for (let k = 0; k < 5; k++) {
    const bx = cx - 10 + k * 5
    s.poly(
      [
        [bx, cy - 4],
        [bx + 1.5, cy - 8 - (k % 2)],
        [bx + 3, cy - 4],
      ],
      hideD
    )
  }
  // 头：无眼，长吻
  const hx = cx + 15
  const hy = cy + 1
  s.ell(hx, hy, 7, 5, hideD)
  s.ell(hx + 1, hy, 6, 4, hideL)
  s.poly(
    [
      [hx + 4, hy - 2],
      [hx + 11, hy - 1],
      [hx + 11, hy + 3],
      [hx + 4, hy + 3],
    ],
    hideD
  )
  // 牙
  for (let k = 0; k < 4; k++) {
    s.px(hx + 6 + k * 1.6, hy + 3, PAL.bone, 0.9)
  }
  if (atk) {
    s.rect(hx + 5, hy + 1, 6, 3, PAL.void)
    s.px(hx + 6, hy, PAL.bone)
    s.px(hx + 9, hy, PAL.bone)
    s.px(hx + 9, hy + 3, PAL.bloodDark, 0.8)
  }
  // 耳朵：贴着头
  s.poly(
    [
      [hx - 3, hy - 4],
      [hx - 1, hy - 9],
      [hx + 1, hy - 4],
    ],
    hideD
  )
  s.speck(cx - 16, cy - 4, 32, 12, PAL.rustDark, 0.1, 0.5)
}

/** 义体螳螂：铬合金镰臂，霓虹接缝。 */
function drawCyberMantis(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const cy = 16
  const cx = 24
  const chrome = mix(PAL.steel, PAL.toxic, 0.25)
  const chromeL = mix(chrome, PAL.white, 0.4)
  const chromeD = mix(PAL.void, chrome, 0.55)
  s.shadow(cx, g - 0.5, 15, 1.6, 0.32)
  // 细长的四条支撑腿
  for (let k = 0; k < 4; k++) {
    const ox = -10 + k * 7
    const ph = (i / 3) * TAU + k
    const lift = Math.max(0, Math.cos(ph)) * 2.4
    s.thick(cx + ox, cy + 4, cx + ox - 3, cy + 10, 1.2, chromeD)
    s.thick(cx + ox - 3, cy + 10, cx + ox + Math.sin(ph) * 3, g - 1 - lift, 1, chrome)
    s.px(cx + ox + Math.sin(ph) * 3, g - 1 - lift, PAL.ink)
  }
  // 腹部：分节甲壳
  s.ell(cx - 6, cy + 3, 12, 5, chromeD)
  s.ell(cx - 6, cy + 2, 11, 4, chrome)
  for (let k = 0; k < 3; k++) s.line(cx - 14 + k * 6, cy - 2, cx - 15 + k * 6, cy + 5, chromeD, 0.8)
  // 颈部 / 胸部
  s.thick(cx + 4, cy + 1, cx + 11, cy - 2, 3.4, chromeD)
  s.thick(cx + 4, cy, cx + 11, cy - 3, 2.4, chromeL)
  // 镰臂：折叠 / 展开
  for (const side of [-1, 1]) {
    const sy = cy - 4 + side * 2
    const ex = cx + 12 + (atk ? 10 : 4)
    const ey = atk ? cy - 12 + side * 6 : cy - 8 + side * 5
    s.thick(cx + 6, sy, ex, ey, 2, chromeD)
    s.thick(cx + 6, sy - 1, ex, ey - 1, 1.2, chromeL)
    // 刀刃
    s.poly(
      [
        [ex, ey - 2],
        [ex + (atk ? 15 : 10), ey + (atk ? -4 : 3)],
        [ex + 2, ey + 2],
      ],
      mix(chromeL, PAL.white, 0.5)
    )
    s.line(ex, ey, ex + (atk ? 14 : 9), ey + (atk ? -3 : 2), PAL.neon, 0.7)
  }
  // 头：三角，复眼
  const hx = cx + 14
  const hy = cy - 3
  s.poly(
    [
      [hx - 4, hy - 3],
      [hx + 6, hy],
      [hx - 4, hy + 4],
    ],
    chromeD
  )
  s.poly(
    [
      [hx - 3, hy - 2],
      [hx + 4, hy],
      [hx - 3, hy + 3],
    ],
    chromeL
  )
  s.px(hx + 1, hy - 1, PAL.neonWarm)
  s.px(hx + 2, hy + 1, PAL.neonWarm)
  F.g.push({ x: hx + 1, y: hy, r: 7, c: PAL.neonWarm, p: 0.4 })
  // 霓虹接缝
  F.g.push({ x: cx - 4, y: cy, r: 12, c: PAL.neon, p: 0.25 })
  s.line(cx - 12, cy, cx + 2, cy, PAL.neon, 0.35)
  s.speck(cx - 16, cy - 8, 32, 16, PAL.rustDark, 0.05, 0.4)
}

/** 赛博精神病：霓虹夹克、莫西干头、义体手臂上的手枪。 */
function drawPsychoPunk(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const step = Math.sin((i / 3) * TAU) * 2
  const cx = 18
  const hipY = g - 18
  const jacket = mix(PAL.steel, PAL.neonRed, 0.16)
  const jacketD = mix(PAL.void, jacket, 0.55)
  const skin = mix(PAL.boneDark, PAL.rust, 0.25)
  const skinL = mix(skin, PAL.bone, 0.4)
  s.shadow(cx, g - 0.5, 9, 1.4, 0.32)
  // 腿（工装裤 + 靴）
  s.thick(cx - 3, hipY, cx - 4 + step, g - 4, 3, jacketD)
  s.thick(cx - 4 + step, g - 4, cx - 5 + step, g - 1, 3, PAL.ink)
  s.thick(cx + 3, hipY, cx + 4 - step, g - 4, 3, jacket)
  s.thick(cx + 4 - step, g - 4, cx + 5 - step, g - 1, 3, PAL.ink)
  // 躯干 + 夹克领
  s.rect(cx - 6, hipY - 16, 12, 17, jacketD)
  s.rect(cx - 5, hipY - 16, 10, 15, jacket)
  s.line(cx - 5, hipY - 14, cx - 5, hipY - 2, PAL.neon, 0.6)
  s.line(cx + 5, hipY - 14, cx + 5, hipY - 2, PAL.neonRed, 0.5)
  s.px(cx, hipY - 13, PAL.neonWarm, 0.9)
  // 左臂（自然下垂）
  s.thick(cx - 6, hipY - 14, cx - 9, hipY - 4, 2.6, jacketD)
  s.px(cx - 9, hipY - 3, skin, 0.9)
  // 右臂 + 枪：射击时平举
  const sy = hipY - 14
  const gx = atk ? cx + 17 : cx + 10
  const gy = atk ? sy - 2 : sy + 5
  s.thick(cx + 6, sy, gx - 3, gy, 2.8, mix(PAL.steel, PAL.neonRed, 0.2))
  s.rect(gx - 3, gy - 2, 7, 3, PAL.steelDark)
  s.rect(gx - 1, gy - 1, 4, 1.4, PAL.steelLight)
  if (atk) {
    s.poly(
      [
        [gx + 4, gy - 2],
        [gx + 10, gy],
        [gx + 4, gy + 2],
      ],
      PAL.neonWarm
    )
    F.g.push({ x: gx + 6, y: gy, r: 12, c: PAL.neonWarm, p: 0.6 })
  }
  // 头 + 莫西干
  const hy = hipY - 22
  s.ell(cx, hy, 5, 6, skin)
  s.ell(cx + 0.5, hy - 0.5, 4.2, 5, skinL)
  for (let k = 0; k < 4; k++) {
    s.poly(
      [
        [cx - 1 + k * 1.6, hy - 6],
        [cx + 0.4 + k * 1.6, hy - 12 - (k % 2) * 2],
        [cx + 1.8 + k * 1.6, hy - 6],
      ],
      k % 2 ? PAL.neonRed : PAL.neonWarm
    )
  }
  // 义眼
  s.rect(cx + 1, hy - 2, 3, 2, PAL.void)
  s.px(cx + 2, hy - 1, PAL.neonRed)
  F.g.push({ x: cx + 2, y: hy - 1, r: 6, c: PAL.neonRed, p: 0.45 })
  // 面罩 / 纹路
  s.line(cx - 4, hy + 2, cx + 4, hy + 2, PAL.steelDark, 0.8)
  s.speck(cx - 7, hipY - 22, 14, 22, PAL.rustDark, 0.05, 0.4)
}

/* ============================================================================
 * 4. 帧合成 + 收尾管线
 * ========================================================================== */

/** 服务器游魂：机柜残躯 + 显示器头颅 + 垂下的线缆（数据中心 / AI 实验室）。 */
function drawServerWraith(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' && i % 2 ? 2 : 0
  const cx = 22
  const cy = 17 + hover
  s.shadow(cx + 7, g - 0.5, 10, 1.5, 0.2)
  // 垂下的线缆
  for (let k = 0; k < 4; k++) {
    const x = cx - 6 + k * 4
    s.thick(x, cy + 7, x + (i % 2 ? 1 : -1), g - 5 - (k % 2) * 3, 0.9, PAL.oil)
    s.px(x + (i % 2 ? 1 : -1), g - 4 - (k % 2) * 3, PAL.neon, 0.35)
  }
  // 机柜躯干
  s.rect(cx - 8, cy - 5, 16, 13, PAL.steelDark)
  s.rect(cx - 7, cy - 4, 14, 11, PAL.steel)
  for (let k = 0; k < 3; k++) s.px(cx - 4 + k * 3, cy + 1, k % 2 ? PAL.neon : PAL.toxicDark, 0.8)
  s.rect(cx - 2, cy + 4, 4, 3, PAL.void)
  // 显示器头
  s.rect(cx - 9, cy - 18, 18, 13, PAL.ashPale)
  s.rect(cx - 8, cy - 17, 16, 11, PAL.steelDark)
  s.rect(cx - 7, cy - 16, 14, 9, PAL.void)
  if (atk) {
    s.px(cx - 3, cy - 12, PAL.neonRed)
    s.px(cx + 2, cy - 12, PAL.neonRed)
    s.line(cx - 4, cy - 10, cx + 4, cy - 10, PAL.neonRed, 0.8)
    F.g.push({ x: cx, y: cy - 12, r: 10, c: PAL.neonRed, p: 0.55 })
  } else {
    s.px(cx - 3, cy - 13, PAL.signal, 0.9)
    s.px(cx + 3, cy - 13, PAL.signal, 0.9)
    s.line(cx - 4, cy - 10, cx + 4, cy - 10, PAL.neonCold, 0.5)
    F.g.push({ x: cx, y: cy - 13, r: 7, c: PAL.signal, p: 0.35 })
  }
  // 天线
  s.thick(cx + 8, cy - 18, cx + 12, cy - 24, 0.9, PAL.steelLight)
  s.px(cx + 12, cy - 25, PAL.neonWarm, 0.8)
  // 侧臂
  s.thick(cx - 8, cy - 1, cx - 13, cy + 5, 1.8, PAL.steel)
  s.thick(cx + 8, cy - 1, cx + 13, cy + 5, 1.8, PAL.steel)
  s.speck(cx - 9, cy - 18, 18, 26, PAL.rustDark, 0.08, 0.45)
}

/** 焊接壮汉：重型工装 + 面罩 + 焊枪（机器人工厂 / 军事基地）。 */
function drawWeldBrute(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const step = F.anim === 'run' ? (i % 2 ? 2 : 0) : 0
  const cx = 30
  const hipY = 30
  const metal = mix(PAL.steel, PAL.rustDark, 0.35)
  const metalD = mix(metal, PAL.void, 0.4)
  s.shadow(cx, g - 0.5, 17, 2.2, 0.32)
  // 腿
  s.thick(cx - 6, hipY, cx - 7 + step, g - 3, 4, metalD)
  s.thick(cx + 5, hipY, cx + 6 - step, g - 3, 4, metalD)
  s.rect(cx - 10 + step, g - 4, 8, 3, PAL.ink)
  s.rect(cx + 3 - step, g - 4, 8, 3, PAL.ink)
  // 躯干（工装围裙）
  s.rect(cx - 12, hipY - 20, 24, 21, metalD)
  s.rect(cx - 11, hipY - 19, 22, 19, metal)
  s.rect(cx - 9, hipY - 12, 18, 10, PAL.ash)
  // 背后气瓶
  s.ell(cx - 13, hipY - 16, 4, 8, PAL.steelDark)
  s.ell(cx - 13, hipY - 17, 3.2, 6.6, PAL.steelBlue)
  s.px(cx - 13, hipY - 24, PAL.neonWarm, 0.8)
  // 头 + 面罩
  const hy = hipY - 26
  s.ell(cx, hy, 7, 7.5, metalD)
  s.ell(cx + 0.5, hy - 0.5, 6, 6.4, PAL.steel)
  s.rect(cx - 5, hy - 2, 11, 5, PAL.void)
  s.px(cx + 2, hy, PAL.neonRed, 0.9)
  F.g.push({ x: cx + 2, y: hy, r: 5, c: PAL.neonRed, p: 0.4 })
  s.rect(cx - 3, hy + 4, 6, 2, PAL.rustDark)
  // 右臂 + 焊枪
  const ay = hipY - 12
  s.thick(cx + 9, ay, cx + 16, ay + (atk ? -4 : 4), 3.4, metalD)
  const tx = atk ? cx + 26 : cx + 18
  const ty = ay + (atk ? -5 : 4)
  s.rect(tx - 3, ty - 2, 8, 4, PAL.steelLight)
  if (atk) {
    s.poly(
      [
        [tx + 5, ty - 2],
        [tx + 15, ty - 6],
        [tx + 15, ty + 6],
        [tx + 5, ty + 2],
      ],
      PAL.neonWarm,
    )
    s.glow(tx + 11, ty, 9, PAL.neonWarm, 0.35)
    F.g.push({ x: tx + 10, y: ty, r: 12, c: PAL.neonWarm, p: 0.5 })
  } else {
    s.px(tx + 5, ty, PAL.neonWarm, 0.6)
  }
  // 左臂
  s.thick(cx - 9, ay, cx - 15, ay + 6, 3, metalD)
  s.speck(cx - 12, hipY - 26, 24, 24, PAL.rustDark, 0.1, 0.5)
}

/** 狂信者：兜帽长袍 + 防毒面具 + 提炉（教堂 / 救助中心 / 战场）。 */
function drawCultFanatic(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const step = F.anim === 'run' ? (i % 2 ? 2 : 0) : 0
  const cx = 20
  const robe = mix(PAL.rustDark, PAL.ash, 0.35)
  const robeD = mix(robe, PAL.void, 0.35)
  s.shadow(cx, g - 0.5, 12, 2, 0.3)
  // 长袍下摆
  s.poly(
    [
      [cx - 10, g - 2],
      [cx - 7, 14],
      [cx + 7, 14],
      [cx + 10, g - 2],
    ],
    robeD,
  )
  s.poly(
    [
      [cx - 8, g - 4],
      [cx - 6, 16],
      [cx + 6, 16],
      [cx + 8, g - 4],
    ],
    robe,
  )
  // 腰带与挂饰
  s.rect(cx - 7, 26, 14, 2, PAL.rust)
  s.px(cx, 30, PAL.neonWarm, 0.7)
  // 兜帽头
  s.poly(
    [
      [cx - 7, 16],
      [cx - 5, 3],
      [cx + 5, 3],
      [cx + 7, 16],
    ],
    robeD,
  )
  s.ell(cx, 9, 5, 5, PAL.ash)
  s.rect(cx - 4, 8, 8, 4, PAL.void)
  s.px(cx - 2, 10, PAL.neonWarm, 0.8)
  s.px(cx + 2, 10, PAL.neonWarm, 0.8)
  s.rect(cx - 2, 13, 4, 2, PAL.steelDark)
  // 手臂
  s.thick(cx - 6, 20, cx - 10 - step, 30, 2.2, robe)
  const hx = atk ? cx + 14 : cx + 8
  const hy = atk ? 12 : 24
  s.thick(cx + 6, 20, hx, hy, 2.2, robe)
  // 提炉 / 投掷物
  s.line(hx, hy, hx + 2, hy + 7, PAL.oilSheen)
  s.ell(hx + 2, hy + 9, 3.4, 3.8, PAL.ochre)
  if (atk) {
    s.glow(hx + 2, hy + 9, 8, PAL.neonWarm, 0.4)
    F.g.push({ x: hx + 2, y: hy + 9, r: 8, c: PAL.neonWarm, p: 0.5 })
    s.poly(
      [
        [hx + 4, hy + 7],
        [hx + 10, hy + 2],
        [hx + 9, hy + 12],
      ],
      PAL.neonWarm,
    )
  } else {
    s.px(hx + 2, hy + 9, PAL.neonWarm, 0.8)
    F.g.push({ x: hx + 2, y: hy + 9, r: 4, c: PAL.neonWarm, p: 0.3 })
  }
  // 袍面污迹
  s.speck(cx - 9, 16, 18, g - 20, PAL.bloodDark, 0.05, 0.45)
}

/** 外星浮球：光滑舱体 + 单眼 + 触须（外星人研究中心）。 */
function drawAlienOrb(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' && i % 2 ? 2 : 0
  const cx = 23
  const cy = 15 + hover
  s.shadow(cx, g - 0.5, 11, 1.6, 0.2)
  // 触须
  for (let k = 0; k < 5; k++) {
    const a = -0.9 + k * 0.45
    const len = 12 + (k % 2) * 4
    s.thick(
      cx + Math.sin(a) * 8,
      cy + 7,
      cx + Math.sin(a) * 14,
      cy + 7 + len,
      1.3,
      mix(PAL.neonCold, PAL.void, 0.45),
    )
    s.px(cx + Math.sin(a) * 14, cy + 7 + len, PAL.neonCold, 0.5)
  }
  // 外壳
  s.ell(cx, cy, 14, 13, mix(PAL.steelBlue, PAL.void, 0.35))
  s.ell(cx, cy - 1, 12, 11, PAL.steelBlue)
  s.ell(cx - 2, cy - 4, 8, 6, PAL.glass, 0.35)
  // 单眼
  s.disc(cx + 2, cy, 5.5, PAL.void)
  s.disc(cx + 2, cy, 4, atk ? PAL.neonRed : PAL.neonCold)
  s.px(cx + 1, cy - 1, PAL.white, 0.9)
  F.g.push({ x: cx + 2, y: cy, r: atk ? 12 : 8, c: atk ? PAL.neonRed : PAL.neonCold, p: atk ? 0.6 : 0.4 })
  // 外骨环
  for (let k = 0; k < 3; k++) {
    const y = cy - 6 + k * 6
    s.thick(cx - 13, y, cx + 13, y - 1, 0.8, PAL.steelWhite, 0.4)
  }
  // 攻击：张开的花瓣
  if (atk) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU - Math.PI / 2
      s.poly(
        [
          [cx + Math.cos(a) * 10, cy + Math.sin(a) * 10],
          [cx + Math.cos(a + 0.25) * 19, cy + Math.sin(a + 0.25) * 19],
          [cx + Math.cos(a - 0.25) * 19, cy + Math.sin(a - 0.25) * 19],
        ],
        PAL.neonRed,
        0.55,
      )
    }
  }
  s.speck(cx - 13, cy - 11, 26, 22, PAL.rustDark, 0.05, 0.35)
}

/* ============================================================================
 * 3.6 废土主题小怪（10）
 *   vault_puppet / mine_shade / blood_thrall / fog_stalker / punk_raider
 *   castle_knight / rogue_ai / dark_web_ghost / viral_wraith / nano_swarm
 * ========================================================================== */
/** 保管库傀儡：旧机体 + 焊死的寄存柜锁芯 + 正面盾 + 钥匙串。 */
function drawVaultPuppet(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 3) * TAU
  const bob = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const cx = 22
  const hipY = 38 + bob
  const shY = 22 + bob
  const metal = mix(PAL.steel, PAL.rust, 0.34)
  const metalD = mix(metal, PAL.void, 0.42)
  const metalL = mix(metal, PAL.steelWhite, 0.4)
  const brass = mix(PAL.ochre, PAL.rustLight, 0.3)
  const brassD = mix(brass, PAL.void, 0.45)
  s.shadow(cx, g - 0.5, 15, 2, 0.32)
  // 腿：液压杆 + 重靴
  for (const [lx, off, side] of [
    [cx - 6, Math.PI, -1],
    [cx + 6, 0, 1],
  ]) {
    const ph = phase + off
    const dx = Math.sin(ph) * 2.5
    const lift = Math.max(0, Math.cos(ph - 1)) * 2
    const kx = lx + dx * 0.5
    s.thick(lx, hipY, kx, hipY + 9, 3.2, metalD)
    s.thick(kx, hipY + 9, lx + dx, g - 5 - lift, 2.6, metal)
    s.line(lx + side, hipY + 1, kx + side, hipY + 8, metalL, 0.6)
    s.rect(lx + dx - 3, g - 5 - lift, 8, 4, PAL.ink)
    s.rect(lx + dx - 2, g - 5 - lift, 7, 1, metalD)
    s.px(lx + dx + 3, g - 3 - lift, metalL, 0.8)
  }
  // 躯干：宽厚旧机体 + 肩甲
  s.poly(
    [
      [cx - 9, shY],
      [cx + 9, shY],
      [cx + 8, hipY],
      [cx - 8, hipY],
    ],
    metalD,
  )
  s.poly(
    [
      [cx - 7, shY + 1],
      [cx + 8, shY + 1],
      [cx + 7, hipY - 1],
      [cx - 7, hipY - 1],
    ],
    metal,
  )
  s.line(cx - 6, shY + 2, cx - 6, hipY - 2, metalL, 0.55)
  s.ell(cx - 10, shY + 2, 5, 4, metalD)
  s.ell(cx - 10, shY + 1.5, 4, 3, metalL)
  // 寄存柜锁芯（焊在胸口）：钢圈 + 黄铜锁盘 + 刻度
  const lx2 = cx + 1
  const ly2 = shY + 9
  s.disc(lx2, ly2, 7.5, metalD)
  s.disc(lx2, ly2, 6.4, PAL.steel)
  s.disc(lx2, ly2, 5, brassD)
  s.disc(lx2, ly2, 4.2, brass)
  s.disc(lx2, ly2, 2.6, PAL.steelDark)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.4
    s.px(lx2 + Math.cos(a) * 3.4, ly2 + Math.sin(a) * 3.4, metalL, 0.75)
  }
  s.thick(lx2, ly2, lx2 + 2, ly2 - 2, 0.8, PAL.neonWarm, 0.95)
  F.g.push({ x: lx2, y: ly2, r: 5, c: PAL.neonWarm, p: 0.3 })
  for (const [wx, wy] of [
    [-7, -6],
    [6, -6],
    [-7, 6],
    [7, 5],
    [-2, 8],
  ]) {
    s.line(lx2 + wx, ly2 + wy, lx2 + wx + 2, ly2 + wy + 1, PAL.rustDark, 0.8)
    s.px(lx2 + wx + 1, ly2 + wy, PAL.rust, 0.5)
  }
  // 头：小、歪，一条缝眼
  const hy = shY - 8
  s.poly(
    [
      [cx - 5, hy + 6],
      [cx - 4, hy - 2],
      [cx + 5, hy - 3],
      [cx + 6, hy + 5],
    ],
    metalD,
  )
  s.poly(
    [
      [cx - 4, hy + 5],
      [cx - 3, hy - 1],
      [cx + 4, hy - 2],
      [cx + 5, hy + 4],
    ],
    metal,
  )
  s.rect(cx - 2, hy + 1, 7, 2, mix(PAL.void, PAL.rustDeep, 0.5))
  s.rect(cx - 1, hy + 1, 5, 2, PAL.neonWarm, 0.95)
  s.px(atk ? cx + 4 : cx + 3, hy + 1, PAL.white, 0.9)
  F.g.push({ x: cx + 1, y: hy + 2, r: 7, c: PAL.neonWarm, p: 0.45 })
  s.line(cx - 5, hy + 5, cx + 5, hy + 4, metalD, 0.8)
  bolt(s, cx - 4, hy + 3)
  // 盾（正面装甲，朝右）：攻击时整体前推
  const sx = atk ? 35 : 32
  s.poly(
    [
      [sx, 20],
      [sx + 12, 22],
      [sx + 13, 40],
      [sx + 6, 46],
      [sx - 1, 40],
    ],
    metalD,
  )
  s.poly(
    [
      [sx + 1, 21],
      [sx + 10, 23],
      [sx + 11, 39],
      [sx + 6, 44],
      [sx + 1, 39],
    ],
    mix(PAL.steel, PAL.boneDark, 0.35),
  )
  s.line(sx + 2, 23, sx + 2, 38, metalL, 0.7)
  s.line(sx + 9, 24, sx + 10, 38, PAL.steelDark, 0.8)
  s.rect(sx + 2, 30, 9, 3, PAL.rust, 0.85)
  for (let k = 0; k < 3; k++) s.px(sx + 3 + k * 3, 27, PAL.steelLight, 0.8)
  s.line(sx + 3, 41, sx + 7, 41, PAL.rustDark, 0.8)
  s.line(sx + 4, 25, sx + 7, 33, PAL.steelWhite, 0.4)
  s.thick(cx + 7, shY + 5, sx - 1, shY + 7, 2.6, metalD)
  s.thick(cx + 7, shY + 4, sx - 2, shY + 6, 1.6, metalL)
  // 右手钥匙串（挂在左侧腰间，随步伐晃）
  const kx0 = cx - 11
  const ky0 = hipY - 2
  s.thick(kx0, ky0, kx0 - 2, ky0 + 6, 1.8, metal)
  s.disc(kx0 - 2, ky0 + 7, 2.4, brassD)
  s.disc(kx0 - 2, ky0 + 7, 1.6, brass)
  const sway = Math.sin(phase) * 1.5
  for (let k = 0; k < 3; k++) {
    const keyX = kx0 - 3 + k * 2 + sway * (k % 2 ? -1 : 1)
    s.thick(kx0 - 2, ky0 + 8, keyX, ky0 + 13 + k, 0.7, PAL.steelLight)
    s.rect(keyX - 1, ky0 + 13 + k, 3, 1, brassD)
    s.px(keyX + 1, ky0 + 14 + k, PAL.steelWhite, 0.8)
  }
  F.g.push({ x: kx0 - 2, y: ky0 + 9, r: 4, c: PAL.neonWarm, p: 0.22 })
  // 攻击：盾冲击 + 钥匙甩出
  if (atk) {
    for (let k = 0; k < 4; k++) {
      s.line(sx + 14 + k * 2, 24 + k * 5, sx + 19 + k * 2, 25 + k * 5, PAL.dust, 0.35)
    }
    for (let k = 0; k < 3; k++) s.px(kx0 - 8 - k * 2, ky0 + 10 + k * 3, PAL.neonWarm, 0.5 - k * 0.12)
  }
  s.speck(cx - 12, shY - 4, 26, hipY - shY + 10, PAL.rustDark, 0.1, 0.5)
  s.speck(cx - 12, shY - 4, 26, hipY - shY + 10, PAL.dust, 0.04, 0.4)
}

/** 矿洞暗影：煤灰凝成的人形，矿灯眼，手提矿镐与煤块。 */
function drawMineShade(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 3) * TAU
  const bob = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const cx = 19
  const hipY = 36 + bob
  const soot = mix(PAL.void, PAL.ashPale, 0.55)
  const sootL = mix(soot, PAL.dustLight, 0.42)
  const sootD = mix(PAL.void, PAL.steelBlue, 0.4)
  s.shadow(cx, g - 0.5, 13, 1.8, 0.3)
  // 腿：向下散开的烟柱（底部颗粒化）
  for (const [lx, off] of [
    [cx - 4, Math.PI],
    [cx + 4, 0],
  ]) {
    const ph = phase + off
    const dx = Math.sin(ph) * 2
    s.thick(lx, hipY, lx + dx, g - 8, 2.4, soot)
    s.thick(lx + dx, g - 8, lx + dx * 1.8, g - 2, 1.4, sootD)
    for (let k = 0; k < 7; k++) {
      const a = ph + k * 1.7
      s.px(lx + dx * 1.8 + Math.cos(a) * (2 + (k % 3)), g - 2 - (k % 4) * 2, sootL, 0.5)
    }
  }
  // 矿镐：平时低垂，攻击时抡到前上方
  const hx0 = atk ? 11 : 10
  const hy0 = atk ? 30 : 33
  const ptx = atk ? 25 : 6
  const pty = atk ? 9 : 48
  s.thick(hx0, hy0, ptx, pty, 1.2, PAL.rustDark)
  s.line(hx0 + 1, hy0, ptx + 1, pty - 1, PAL.rustLight, 0.55)
  const hhx = ptx
  const hhy = pty
  s.poly(
    [
      [hhx - 5, hhy - 1],
      [hhx + 5, hhy - 2],
      [hhx + 6, hhy + 1],
      [hhx - 4, hhy + 3],
    ],
    PAL.steelDark,
  )
  s.line(hhx - 4, hhy, hhx + 4, hhy - 1, PAL.steelLight, 0.8)
  s.px(hhx + 5, hhy, PAL.steelWhite, 0.8)
  // 躯干：煤灰，边缘抖散
  s.ell(cx, hipY - 8, 9, 11, sootD)
  s.ell(cx, hipY - 9, 8, 10, soot)
  s.ell(cx - 2, hipY - 12, 5, 5, sootL, 0.35)
  s.ell(cx - 6.5, hipY - 11, 2.6, 7, sootL, 0.4)
  s.ell(cx + 6, hipY - 8, 2, 6, sootD, 0.75)
  s.dith(cx - 11, hipY - 20, 22, 20, sootL, 0.12)
  // 胸口的煤块纹 / 裂开的缝隙
  for (let k = 0; k < 4; k++) s.line(cx - 5 + k * 3, hipY - 14, cx - 4 + k * 3, hipY - 5, sootD, 0.6)
  // 手臂：前手抓煤块，后手拎镐
  s.thick(cx + 5, hipY - 16, cx + 9, hipY - 7, 1.8, soot)
  s.thick(cx + 9, hipY - 7, cx + 8, hipY - 3, 1.6, sootL)
  // 煤块 + 余烬
  s.ell(cx + 9, hipY - 1, 4, 3.6, mix(PAL.void, PAL.steelDark, 0.5))
  s.ell(cx + 9, hipY - 1.5, 3, 2.6, PAL.ash)
  s.px(cx + 7, hipY - 2, PAL.neonWarm, 0.85)
  s.px(cx + 11, hipY, PAL.rustHot, 0.7)
  F.g.push({ x: cx + 9, y: hipY - 2, r: 5, c: PAL.neonWarm, p: 0.3 })
  // 头：煤灰团，前脸一盏矿灯
  const hx = cx + 3
  const hy = hipY - 22
  s.ell(hx, hy, 6, 6, sootD)
  s.ell(hx + 0.5, hy - 0.5, 5, 5, soot)
  s.dith(hx - 6, hy - 7, 12, 7, sootL, 0.16)
  // 矿灯（额前）
  s.disc(hx + 3, hy - 1, 2.6, PAL.rustDark)
  s.disc(hx + 3, hy - 1, 1.8, PAL.neonWarm)
  s.px(hx + 3, hy - 1, PAL.white, 0.9)
  F.g.push({ x: hx + 3, y: hy - 1, r: atk ? 12 : 8, c: PAL.neonWarm, p: atk ? 0.7 : 0.55 })
  // 嘴：裂开的暗缝
  if (atk) {
    s.poly(
      [
        [hx + 1, hy + 3],
        [hx + 7, hy + 4],
        [hx + 6, hy + 7],
        [hx + 1, hy + 6],
      ],
      mix(PAL.void, PAL.rustDeep, 0.5),
    )
    s.px(hx + 3, hy + 4, PAL.sand, 0.7)
  } else {
    s.line(hx, hy + 4, hx + 5, hy + 4, sootD, 0.8)
  }
  // 攻击：镐头的弧线与飞散煤屑
  if (atk) {
    for (let k = 0; k < 5; k++) {
      const a = -0.5 + k * 0.28
      s.px(19 + Math.cos(a) * (10 + k), 20 + Math.sin(a) * (8 + k), PAL.dust, 0.4)
    }
    for (let k = 0; k < 4; k++) s.px(26 + k * 2, 12 + k * 2, PAL.neonWarm, 0.5 - k * 0.1)
  }
  s.speck(cx - 10, hipY - 24, 20, 26, PAL.rustDark, 0.08, 0.45)
}

/** 血仆：细长四肢、血袋串腰、血口扑咬。 */
function drawBloodThrall(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const phase = (i / 3) * TAU
  const step = Math.sin(phase) * 3
  const cx = 16
  const hipY = 36
  const skin = mix(PAL.boneDark, PAL.bloodDark, 0.45)
  const skinL = mix(skin, PAL.bone, 0.35)
  const skinD = mix(PAL.void, skin, 0.55)
  s.shadow(cx, g - 0.5, 10, 1.4, 0.3)
  // 细长腿：屈膝、前倾
  s.thick(cx - 3, hipY, cx - 6 + step, hipY + 8, 2, skinD)
  s.thick(cx - 6 + step, hipY + 8, cx - 5 + step, g - 2, 1.6, skin)
  s.thick(cx + 4, hipY, cx + 8 - step, hipY + 7, 2, skinD)
  s.thick(cx + 8 - step, hipY + 7, cx + 10 - step, g - 2, 1.6, skin)
  s.rect(cx - 7 + step, g - 1, 4, 1, PAL.boneDeep)
  s.rect(cx + 8 - step, g - 1, 4, 1, PAL.boneDeep)
  // 细躯干（前倾）+ 肋骨
  s.poly(
    [
      [cx - 5, hipY],
      [cx + 5, hipY - 1],
      [cx + 8, hipY - 16],
      [cx - 2, hipY - 16],
    ],
    skinD,
  )
  s.poly(
    [
      [cx - 4, hipY - 1],
      [cx + 4, hipY - 2],
      [cx + 7, hipY - 15],
      [cx - 1, hipY - 15],
    ],
    skin,
  )
  for (let k = 0; k < 4; k++) s.line(cx - 2, hipY - 13 + k * 2.4, cx + 6, hipY - 14 + k * 2.4, skinL, 0.5)
  s.rect(cx - 5, hipY + 1, 10, 3, mix(PAL.rustDark, PAL.ash, 0.4), 0.9)
  // 腰上串着血袋（皮带 + 三只袋子）
  s.line(cx - 6, hipY + 2, cx + 6, hipY + 3, PAL.boneDeep, 0.9)
  for (let k = 0; k < 3; k++) {
    const bx = cx - 7 + k * 3.5
    const by = hipY + 4 + (k === 1 ? 2 : 0)
    s.thick(bx, hipY + 2, bx, by - 2, 0.6, PAL.oilSheen)
    s.ell(bx, by, 1.7, 2.6, PAL.bloodDark)
    s.ell(bx - 0.4, by - 0.4, 1.2, 1.8, PAL.blood)
    s.px(bx - 1, by - 2, PAL.bone, 0.7)
    s.px(bx, by + 2, PAL.bloodDark, 0.9)
  }
  // 头（前伸、脸颊凹陷）
  const hx = cx + (atk ? 9 : 7)
  const hy = hipY - 19
  s.ell(hx, hy, 5.5, 5, skinD)
  s.ell(hx + 0.5, hy + 0.5, 4.6, 4, skinL)
  s.ell(hx + 3, hy + 1, 1.8, 1.6, skinD, 0.6)
  s.px(hx + 1, hy - 1, PAL.neonRed)
  s.px(hx + 4, hy - 1, PAL.neonRed, 0.9)
  F.g.push({ x: hx + 2, y: hy - 1, r: atk ? 7 : 5.5, c: PAL.neonRed, p: atk ? 0.55 : 0.45 })
  // 嘴：血口（攻击时咬开）
  const jaw = atk ? 3 : 1
  s.rect(hx + 2, hy + 2, 4, 1 + jaw, mix(PAL.void, PAL.bloodDark, 0.4))
  s.rect(hx + 3, hy + 2, 2, 1, PAL.blood)
  for (let k = 0; k < 3; k++) s.px(hx + 2 + k, hy + 3 + jaw, PAL.blood, 0.85)
  s.px(hx + 3, hy + 4 + jaw, PAL.bloodDark, 0.9)
  if (atk) {
    s.px(hx + 3, hy + 2, PAL.bone)
    s.px(hx + 4, hy + 4, PAL.bone, 0.9)
  }
  s.line(hx - 5, hy - 2, hx - 7, hy + 4, PAL.ink, 0.8)
  // 双臂：细长前伸，爪
  const handX = atk ? 32 : 28
  const handY = atk ? hy + 1 : hipY - 2
  s.thick(cx + 3, hipY - 13, handX - 3, handY - 2, 1.8, skinD)
  s.thick(handX - 3, handY - 2, handX, handY, 1.4, skin)
  for (let k = 0; k < 3; k++) s.line(handX, handY, handX + 4 + k, handY - 1 + k * 2, PAL.bone, 0.8)
  s.thick(cx - 3, hipY - 12, cx - 8, hipY + 1, 1.8, skin)
  s.px(cx - 9, hipY + 2, PAL.blood, 0.9)
  // 扑咬：前冲残影 + 血点
  if (atk) {
    for (let k = 0; k < 3; k++) s.line(cx - 14 - k * 2, hipY - 14 + k * 5, cx - 6, hipY - 13 + k * 5, PAL.dust, 0.3)
    for (let k = 0; k < 4; k++) s.px(hx + 4 + k * 2, hy + 5 + k * 2, PAL.blood, 0.5 - k * 0.1)
  }
  s.speck(cx - 8, hipY - 20, 18, 24, PAL.rustDark, 0.1, 0.5)
}

/** 浓雾潜行者：颗粒雾团 + 一对亮眼 + 多关节细肢。 */
function drawFogStalker(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' ? (i % 2 ? -2 : 0) : 0
  const phase = (i / 3) * TAU
  const cx = 19
  const cy = 24 + hover
  const fog = mix(PAL.ashPale, PAL.steelLight, 0.35)
  const fogD = mix(PAL.void, PAL.steelBlue, 0.45)
  const core = mix(PAL.steelBlue, PAL.ashPale, 0.4)
  s.shadow(cx + 2, g - 0.5, 11, 1.5, 0.16)
  // 多关节肢体（先在雾后侧画，关节小球可辨）
  const limbs = [
    [-8, -4, -13, 1, -15, 10],
    [-4, 5, -8, 11, -6, 18],
    [6, -3, 11, -7, 15, 0],
    [5, 6, 9, 12, 14, 16],
    [9, 3, 14, 7, 19, 10],
    [-7, 8, -11, 12, -10, 17],
  ]
  for (let k = 0; k < limbs.length; k++) {
    const L = limbs[k]
    const sway = Math.sin(phase + k * 0.9) * 1.2
    const fwd = atk && k >= 2 ? 4 : 0
    s.thick(cx + L[0], cy + L[1], cx + L[2] + sway, cy + L[3] + sway * 0.5, 1.1, fogD)
    s.thick(cx + L[2] + sway, cy + L[3] + sway * 0.5, cx + L[4] + sway * 1.4 + fwd, cy + L[5] + sway, 0.9, fog)
    s.disc(cx + L[2] + sway, cy + L[3] + sway * 0.5, 1.4, core)
    s.px(cx + L[4] + sway * 1.4 + fwd, cy + L[5] + sway, PAL.steelWhite, 0.6)
  }
  // 核心雾团（小块 + 抖动边缘，不是实心大团）
  s.ell(cx - 1, cy, 7, 8, fogD)
  s.ell(cx - 1, cy - 1, 6, 7, core)
  s.ell(cx - 2, cy - 3, 3.5, 4, mix(core, PAL.steelWhite, 0.3), 0.5)
  // 雾颗粒（确定性采样，外圈稀）
  const rnd = mulberry32(0x21)
  for (let k = 0; k < 130; k++) {
    const a = rnd() * TAU
    const r = Math.sqrt(rnd()) * 15
    const x = cx - 1 + Math.cos(a) * r
    const y = cy + Math.sin(a) * r * 0.72 + Math.sin(phase + k) * 0.8
    const c = r < 7 ? fogD : r < 11 ? fog : mix(fog, PAL.dust, 0.5)
    s.px(x, y, c, r < 7 ? 1 : 0.75)
  }
  // 一对亮眼
  const ex = cx + 4
  const ey = cy - 4
  s.disc(ex, ey, 2.2, mix(PAL.void, PAL.neonCold, 0.3))
  s.disc(ex + 3, ey - 1, 2, mix(PAL.void, PAL.neonCold, 0.3))
  s.px(ex, ey, PAL.white, 0.95)
  s.px(ex + 3, ey - 1, PAL.white, 0.9)
  F.g.push({ x: ex + 1, y: ey, r: atk ? 12 : 8, c: PAL.neonCold, p: atk ? 0.7 : 0.5 })
  // 雾里的嘴（暗缝）
  s.line(ex - 1, ey + 4, ex + 5, ey + 4, fogD, 0.8)
  // 攻击：雾枪前刺 + 爪痕
  if (atk) {
    for (let k = 0; k < 5; k++) {
      s.line(ex + 4 + k * 2, ey + 2 + k, ex + 9 + k * 2, ey + 2 + k, PAL.steelWhite, 0.3 - k * 0.04)
    }
    for (let k = 0; k < 8; k++) s.px(cx + 4 + k * 2, cy - 2 + (k % 3) * 3, fog, 0.6)
  }
  s.speck(cx - 14, cy - 12, 28, 24, PAL.rustDark, 0.04, 0.35)
}

/** 朋克劫匪：莫西干 + 削短双管 + 腰挂燃烧瓶 + 钉靴。 */
function drawPunkRaider(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const step = F.anim === 'run' ? (i % 2 ? 2 : 0) : 0
  const cx = 15
  const hipY = 34
  const jacket = mix(PAL.rustDark, PAL.ash, 0.4)
  const jacketL = mix(PAL.rust, PAL.ochre, 0.3)
  const pants = mix(PAL.steelBlue, PAL.void, 0.3)
  const skin = mix(PAL.boneDark, PAL.rust, 0.28)
  const skinL = mix(skin, PAL.bone, 0.35)
  s.shadow(cx, g - 0.5, 9, 1.4, 0.32)
  // 腿 + 钉靴
  s.thick(cx - 3, hipY, cx - 4 + step, g - 7, 3, pants)
  s.thick(cx + 3, hipY, cx + 4 - step, g - 7, 3, mix(pants, PAL.ash, 0.4))
  for (const [bx, bs] of [
    [cx - 7 + step, 0],
    [cx + 1 - step, 1],
  ]) {
    s.rect(bx, g - 5, 7, 6, PAL.ink)
    s.rect(bx, g - 5, 7, 1, PAL.ashLight)
    // 靴面钉
    for (let k = 0; k < 3; k++) s.poly([[bx + 1 + k * 2, g - 4], [bx + 2 + k * 2, g - 7], [bx + 3 + k * 2, g - 4]], PAL.steelLight)
    s.px(bx + bs, g - 1, PAL.steelWhite, 0.7)
  }
  // 躯干：皮夹克 + 铆钉
  s.poly(
    [
      [cx - 7, hipY + 1],
      [cx - 6, hipY - 15],
      [cx + 6, hipY - 15],
      [cx + 7, hipY + 1],
    ],
    jacket,
  )
  s.line(cx - 5, hipY - 14, cx - 4, hipY, jacketL, 0.7)
  s.line(cx + 5, hipY - 14, cx + 4, hipY, PAL.rustDark, 0.8)
  for (let k = 0; k < 3; k++) s.px(cx - 4 + k * 4, hipY - 11, PAL.steelLight, 0.8)
  s.rect(cx - 6, hipY - 2, 13, 3, PAL.rustDeep)
  // 燃烧瓶（挂在左腰）
  s.thick(cx - 8, hipY - 1, cx - 10, hipY + 2, 0.7, PAL.oilSheen)
  s.ell(cx - 10, hipY + 5, 2.4, 4, PAL.steelDark)
  s.ell(cx - 10, hipY + 5, 1.7, 3.2, mix(PAL.ochre, PAL.rustHot, 0.4))
  s.line(cx - 10, hipY + 1, cx - 11, hipY - 2, PAL.ashPale, 0.8)
  s.px(cx - 11, hipY - 2, PAL.neonWarm, 0.9)
  F.g.push({ x: cx - 10, y: hipY + 4, r: 5, c: PAL.neonWarm, p: 0.28 })
  // 头：偏右，护目镜 + 莫西干
  const hx = cx + 2
  const hy = hipY - 21
  s.ell(hx, hy, 5, 6, skin)
  s.ell(hx + 0.5, hy - 0.5, 4.2, 5, skinL)
  // 莫西干（锈色冠 + 亮尖）
  for (let k = 0; k < 5; k++) {
    const mx = hx - 4 + k * 2
    s.poly(
      [
        [mx, hy - 4],
        [mx + 1.4, hy - 10 - (k % 2) * 2],
        [mx + 2.8, hy - 4],
      ],
      k % 2 ? mix(PAL.neonWarm, PAL.rustDark, 0.55) : mix(PAL.rustLight, PAL.rustDark, 0.35),
    )
    s.px(mx + 1, hy - 9 - (k % 2) * 2, PAL.neonWarm, 0.85)
  }
  s.line(hx - 5, hy - 4, hx + 4, hy - 4, PAL.rustDeep, 0.9)
  // 护目镜（一只发光）
  s.rect(hx - 2, hy - 2, 7, 2, PAL.rustDeep)
  s.rect(hx + 1, hy - 2, 3, 2, mix(PAL.void, PAL.neonWarm, 0.25))
  s.px(hx + 2, hy - 2, PAL.neonWarm)
  F.g.push({ x: hx + 2, y: hy - 2, r: 6, c: PAL.neonWarm, p: 0.45 })
  s.px(hx - 1, hy - 2, PAL.steelLight, 0.8)
  // 面巾 + 下巴胡茬
  s.rect(hx - 4, hy + 2, 8, 2, mix(PAL.rustDark, PAL.ink, 0.4))
  s.px(hx + 3, hy + 4, PAL.rustDark, 0.7)
  // 手臂 + 削短双管
  const gunY = atk ? hy - 3 : hipY - 10
  const gunX = atk ? cx + 10 : cx + 8
  s.thick(cx + 5, hipY - 13, gunX, gunY + 2, 2.4, jacketL)
  s.thick(cx - 6, hipY - 13, cx - 9, hipY - 4, 2.2, jacket)
  s.rect(gunX - 2, gunY - 1, 10, 2, PAL.steelDark)
  s.rect(gunX - 2, gunY + 2, 10, 2, PAL.steelDark)
  s.rect(gunX - 2, gunY - 1, 9, 1, PAL.steelLight)
  s.rect(gunX - 2, gunY + 2, 9, 1, PAL.steelLight)
  s.rect(gunX - 6, gunY, 5, 4, PAL.rustDark)
  s.px(gunX + 7, gunY, PAL.steelWhite, 0.9)
  s.px(gunX + 7, gunY + 3, PAL.steelWhite, 0.9)
  // 攻击：双管齐射 + 抛壳
  if (atk) {
    muzzle(s, gunX + 10, gunY + 1, PAL.neonWarm, 3)
    s.px(gunX - 3, gunY - 3, PAL.ochre, 0.8)
    s.px(gunX - 5, gunY - 5, PAL.ochre, 0.5)
    for (let k = 0; k < 3; k++) s.line(cx - 14 - k * 2, hipY - 12 + k * 5, cx - 5, hipY - 11 + k * 5, PAL.dust, 0.3)
  }
  s.speck(cx - 7, hipY - 20, 16, 24, PAL.rustDark, 0.1, 0.5)
}

/** 城堡骑士：空盔甲 + 举盾 + 能量刃长剑。 */
function drawCastleKnight(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const bob = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const cx = 24
  const cx0 = cx
  const top = 7 + bob
  const plate = mix(PAL.steel, PAL.boneDark, 0.45)
  const plateL = mix(plate, PAL.steelWhite, 0.45)
  const plateD = mix(plate, PAL.void, 0.5)
  const trim = mix(PAL.ochre, PAL.sand, 0.35)
  const trimD = mix(trim, PAL.void, 0.4)
  const hipY = 42 + bob
  s.shadow(cx0, g - 0.5, 17, 2.2, 0.34)
  // 背后的破旗（暗红、抖散）
  s.poly(
    [
      [cx0 - 10, 24 + bob],
      [cx0 - 18, 28 + bob],
      [cx0 - 16, 36 + bob],
      [cx0 - 21, 44 + bob],
      [cx0 - 12, 42 + bob],
      [cx0 - 10, 34 + bob],
    ],
    mix(PAL.bloodDark, PAL.rust, 0.35),
  )
  s.dith(cx0 - 21, 28 + bob, 10, 18, PAL.blood, 0.16)
  s.line(cx0 - 10, 25 + bob, cx0 - 16, 30 + bob, PAL.rustLight, 0.4)
  // 腿甲 + 铁靴
  for (const [lx, side] of [
    [cx0 - 6, -1],
    [cx0 + 6, 1],
  ]) {
    const step = F.anim === 'run' && i % 2 ? side * 1.5 : 0
    s.thick(lx, hipY, lx + step, g - 7, 4.4, plateD)
    s.thick(lx, hipY, lx + step, g - 8, 3.2, plate)
    s.line(lx + side * 2, hipY + 2, lx + step + side * 2, g - 10, plateL, 0.55)
    s.rect(lx + step - 4, g - 7, 9, 5, plateD)
    s.rect(lx + step - 3, g - 7, 8, 3, plate)
    s.line(lx + step - 3, g - 6, lx + step + 4, g - 6, plateL, 0.7)
    s.rect(lx + step - 3, g - 1, 8, 1, PAL.ink)
  }
  // 裙甲（三片）
  for (let k = 0; k < 3; k++) {
    const tx = cx0 - 10 + k * 7
    s.poly(
      [
        [tx, hipY - 3],
        [tx + 7, hipY - 3],
        [tx + 6, hipY + 5],
        [tx + 1, hipY + 5],
      ],
      k === 1 ? plate : plateD,
    )
    s.line(tx + 1, hipY - 2, tx + 1, hipY + 4, plateL, 0.5)
  }
  // 胸甲 + 金边 + 铆钉
  s.poly(
    [
      [cx0 - 11, 24 + bob],
      [cx0 + 11, 24 + bob],
      [cx0 + 9, hipY - 3],
      [cx0 - 9, hipY - 3],
    ],
    plateD,
  )
  s.poly(
    [
      [cx0 - 9, 25 + bob],
      [cx0 + 10, 25 + bob],
      [cx0 + 8, hipY - 4],
      [cx0 - 8, hipY - 4],
    ],
    plate,
  )
  s.line(cx0 - 8, 27 + bob, cx0 - 7, hipY - 6, plateL, 0.65)
  s.line(cx0 + 8, 27 + bob, cx0 + 7, hipY - 6, plateD, 0.8)
  // 胸口纹章：锈色齿轮十字
  s.disc(cx0 + 1, 33 + bob, 5, plateD)
  s.disc(cx0 + 1, 33 + bob, 4, trimD)
  s.rect(cx0 - 2, 29 + bob, 6, 2, trim)
  s.rect(cx0 - 1, 30 + bob, 4, 7, trim, 0.9)
  s.px(cx0 + 1, 33 + bob, PAL.rustDark, 0.8)
  for (let k = 0; k < 3; k++) s.px(cx0 - 6 + k * 7, 26 + bob, PAL.steelLight, 0.7)
  // 肩甲
  s.ell(cx0 - 11, 25 + bob, 6, 5, plateD)
  s.ell(cx0 - 11, 24 + bob, 5, 4, plate)
  s.ell(cx0 - 12, 23 + bob, 3, 2.4, plateL, 0.6)
  s.ell(cx0 + 11, 25 + bob, 5, 4.4, plateD)
  s.ell(cx0 + 11, 24 + bob, 4, 3.6, plate)
  // 空洞的头盔（盔内无脸，只有两点冷光）
  s.poly(
    [
      [cx0 - 5, top + 9],
      [cx0 - 6, top + 2],
      [cx0 - 2, top - 2],
      [cx0 + 4, top - 1],
      [cx0 + 7, top + 3],
      [cx0 + 5, top + 10],
      [cx0 + 1, top + 12],
    ],
    plateD,
  )
  s.poly(
    [
      [cx0 - 4, top + 8],
      [cx0 - 5, top + 3],
      [cx0 - 1, top],
      [cx0 + 3, top + 1],
      [cx0 + 5, top + 4],
      [cx0 + 4, top + 9],
      [cx0 + 1, top + 10],
    ],
    plate,
  )
  s.line(cx0 - 4, top + 3, cx0 + 4, top + 4, plateL, 0.7)
  // 面甲缝：里面的空 + 冷光眼
  s.rect(cx0 - 3, top + 4, 8, 2, mix(PAL.void, PAL.steelDark, 0.4))
  s.px(cx0, top + 4, PAL.neonCold)
  s.px(cx0 + 3, top + 4, PAL.neonCold, 0.85)
  F.g.push({ x: cx0 + 1, y: top + 4, r: 8, c: PAL.neonCold, p: 0.5 })
  // 盔顶饰 / 通风缝
  s.line(cx0 - 1, top, cx0 + 1, top - 3, trim, 0.9)
  s.rect(cx0 - 2, top + 7, 6, 1, PAL.void, 0.7)
  // 盾（举在身前）：破鸢形盾 + 锈十字
  s.poly(
    [
      [cx0 + 15, 25 + bob],
      [cx0 + 26, 27 + bob],
      [cx0 + 26, 44 + bob],
      [cx0 + 21, 52 + bob],
      [cx0 + 15, 44 + bob],
    ],
    plateD,
  )
  s.poly(
    [
      [cx0 + 16, 26 + bob],
      [cx0 + 25, 28 + bob],
      [cx0 + 25, 43 + bob],
      [cx0 + 21, 50 + bob],
      [cx0 + 16, 43 + bob],
    ],
    mix(PAL.steel, PAL.boneDark, 0.2),
  )
  s.line(cx0 + 17, 27 + bob, cx0 + 17, 42 + bob, plateL, 0.65)
  s.line(cx0 + 24, 29 + bob, cx0 + 24, 42 + bob, plateD, 0.8)
  s.rect(cx0 + 18, 34 + bob, 7, 2, PAL.rust, 0.85)
  s.rect(cx0 + 21, 30 + bob, 2, 13, PAL.rust, 0.8)
  for (let k = 0; k < 3; k++) s.px(cx0 + 18 + k * 3, 31 + bob, PAL.steelLight, 0.8)
  s.line(cx0 + 19, 45 + bob, cx0 + 22, 47 + bob, PAL.rustDark, 0.8)
  s.line(cx0 + 20, 38, cx0 + 22, 40, PAL.steelWhite, 0.4)
  // 盾臂
  s.thick(cx0 + 11, 28 + bob, cx0 + 15, 31 + bob, 2.4, plateD)
  s.thick(cx0 + 11, 27 + bob, cx0 + 15, 30 + bob, 1.6, plateL)
  // 长剑（平时高举在左后，攻击时横扫）
  const hxw = atk ? cx0 - 6 : cx0 - 9
  const hyw = atk ? 26 + bob : 32 + bob
  const tx = atk ? cx0 + 21 : cx0 - 15
  const ty = atk ? 18 + bob : 8 + bob
  s.thick(hxw, hyw + 3, hxw, hyw - 1, 1.6, trimD)
  s.rect(hxw - 4, hyw - 1, 8, 1.4, trimD)
  s.thick(hxw, hyw - 2, tx, ty, 2.6, PAL.steelWhite, 0.9)
  s.thick(hxw, hyw - 2, tx, ty, 1.4, mix(PAL.steelLight, PAL.white, 0.4))
  // 能量刃（剑脊发光线）
  s.line(hxw, hyw - 2, tx, ty, PAL.neonWarm, 0.9)
  F.g.push({ x: (hxw + tx) / 2, y: (hyw + ty) / 2, r: atk ? 16 : 9, c: PAL.neonWarm, p: atk ? 0.7 : 0.4 })
  // 握剑的手臂（空盔甲，关节处透出暗部）
  s.thick(cx0 - 9, 27 + bob, hxw, hyw + 1, 2.6, plate)
  s.disc(cx0 - 9, 27 + bob, 2.8, plateD)
  s.disc(hxw, hyw + 1, 2, plateD)
  // 攻击：横扫弧光 + 火星
  if (atk) {
    for (let k = 0; k < 6; k++) {
      const a = -0.9 + k * 0.26
      s.px(hxw + Math.cos(a) * (10 + k * 2), hyw + Math.sin(a) * (9 + k * 2), PAL.neonWarm, 0.5 - k * 0.06)
    }
    s.px(tx + 4, ty + 1, PAL.white, 0.9)
    for (let k = 0; k < 4; k++) s.px(cx0 + 8 + k * 3, g - 2 - k, PAL.dust, 0.35)
  }
  s.speck(cx0 - 16, top - 2, 34, 40, PAL.rustDark, 0.08, 0.5)
  s.speck(cx0 - 16, top - 2, 34, 40, PAL.steelWhite, 0.015, 0.35)
}

/** 失控 AI：巡检无人机，屏幕脸显示编号扫描线，三只小复制体天线。 */
function drawRogueAi(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' ? (i % 2 ? -2 : 0) : 0
  const phase = (i / 3) * TAU
  const cx = 18
  const by = 16 + hover
  const metal = mix(PAL.steel, PAL.steelLight, 0.28)
  const metalD = mix(PAL.steelDark, PAL.void, 0.2)
  const metalL = mix(metal, PAL.steelWhite, 0.45)
  s.shadow(cx + 2, g - 0.5, 10, 1.4, 0.2)
  // 机身（略扁的巡检箱体）
  s.rect(cx - 8, by, 16, 11, metalD)
  s.rect(cx - 7, by + 1, 14, 9, metal)
  s.rect(cx - 7, by + 1, 13, 1, metalL)
  s.line(cx - 6, by + 3, cx - 5, by + 8, metalL, 0.5)
  for (let k = 0; k < 3; k++) s.px(cx - 5 + k * 4, by + 8, PAL.steelLight, 0.7)
  s.rect(cx - 4, by + 3, 6, 3, PAL.rust, 0.5)
  // 底部两个推进器（悬停时喷口抖动）
  for (const tx of [cx - 5, cx + 3]) {
    s.rect(tx, by + 11, 3, 3, PAL.steelDark)
    s.rect(tx, by + 12, 3, 1, PAL.steelLight)
    const puff = atk ? 3 : F.anim === 'run' ? 2 : 1
    for (let k = 0; k < puff; k++) s.px(tx + 1 + (k % 2), by + 14 + k, mix(PAL.signal, PAL.void, 0.55), 0.8)
  }
  // 屏幕脸（朝右）：黑底 + 冷光编号 + 扫描线
  s.poly(
    [
      [cx + 7, by + 1],
      [cx + 16, by + 3],
      [cx + 16, by + 11],
      [cx + 7, by + 10],
    ],
    metalD,
  )
  s.poly(
    [
      [cx + 8, by + 2],
      [cx + 15, by + 4],
      [cx + 15, by + 10],
      [cx + 8, by + 9],
    ],
    mix(PAL.void, PAL.signal, 0.12),
  )
  // 编号（像素点阵，冷色）
  const glyph = (gx, gy, rows, c) => {
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < 3; x++) if (rows[y][x] === '1') s.px(gx + x, gy + y, c, 0.9)
    }
  }
  const digitC = atk ? PAL.neonRed : PAL.signal
  glyph(cx + 9, by + 3, ['111', '101', '101', '101', '111'], digitC)
  glyph(cx + 13, by + 3, ['111', '001', '010', '010', '010'], digitC)
  // 扫描线（随帧下移）
  const scanY = by + 3 + ((i * 2) % 5)
  s.rect(cx + 8, scanY, 8, 1, PAL.white, 0.75)
  F.g.push({ x: cx + 12, y: by + 7, r: atk ? 13 : 9, c: digitC, p: atk ? 0.7 : 0.5 })
  // 扫描扇形（朝右扫）
  if (F.anim === 'run' || atk) {
    const a = -0.5 + Math.sin(phase) * 0.4
    for (let d = 3; d < (atk ? 18 : 12); d += 3) {
      s.px(cx + 16 + Math.cos(a) * d, by + 7 + Math.sin(a) * d, PAL.signal, 0.55 - d * 0.02)
    }
  }
  // 前下方的云台镜头
  s.line(cx + 8, by + 11, cx + 10, by + 14, PAL.steelDark)
  s.disc(cx + 11, by + 15, 2.6, metalD)
  s.disc(cx + 11, by + 15, 1.6, atk ? PAL.neonRed : PAL.signal)
  F.g.push({ x: cx + 11, y: by + 15, r: 5, c: atk ? PAL.neonRed : PAL.signal, p: 0.35 })
  // 三只复制体：小天线 + 迷你机身
  for (const [ax, ay] of [
    [cx - 4, by - 8],
    [cx + 1, by - 10],
    [cx + 7, by - 6],
  ]) {
    s.line(ax, by + 1, ax + (ax < cx ? -1 : 1), ay, PAL.steelLight, 0.8)
    s.poly(
      [
        [ax - 2.5, ay - 1],
        [ax + 2.5, ay - 2],
        [ax + 1.5, ay + 2],
        [ax - 1.5, ay + 2],
      ],
      mix(metal, PAL.steelLight, 0.3),
    )
    s.px(ax, ay, atk ? PAL.neonRed : PAL.signal, 0.95)
    F.g.push({ x: ax, y: ay, r: 3, c: atk ? PAL.neonRed : PAL.signal, p: 0.25 })
  }
  // 机背散热缝 / 警示灯
  s.rect(cx - 3, by + 1, 5, 1, PAL.ashPale)
  s.px(cx - 7, by + 9, PAL.neonRed, 0.9)
  F.g.push({ x: cx - 7, y: by + 9, r: 4, c: PAL.neonRed, p: 0.3 })
  // 攻击：屏幕红警 + 齐射光束
  if (atk) {
    for (let k = -2; k <= 2; k++) {
      s.line(cx + 16, by + 7 + k, cx + 24 + Math.abs(k), by + 7 + k * 3, PAL.signal, 0.55)
    }
    s.px(cx + 25, by + 7, PAL.white, 0.9)
  }
  s.speck(cx - 8, by, 17, 12, PAL.rustDark, 0.08, 0.45)
}

/** 暗网幽灵：断掉的摄像头脑袋 + 数据包线缆 + 冷色数据破布。 */
function drawDarkWebGhost(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const cx = 18
  const cy = 20 + hover
  const cool = mix(PAL.steelBlue, PAL.neonCold, 0.22)
  const coolD = mix(cool, PAL.void, 0.5)
  const coolL = mix(cool, PAL.steelWhite, 0.4)
  s.shadow(cx + 3, g - 0.5, 9, 1.3, 0.18)
  // 披下来的数据破布（像素块拼接，留出缝隙）
  s.poly(
    [
      [cx - 6, cy],
      [cx + 6, cy],
      [cx + 8, cy + 14],
      [cx + 5, g - 5 + hover],
      [cx, g - 9 + hover],
      [cx - 4, g - 5 + hover],
      [cx - 8, cy + 12],
    ],
    coolD,
  )
  for (let k = 0; k < 7; k++) {
    const rx = cx - 7 + ((k * 5) % 14)
    const ry = cy + 2 + ((k * 4) % 18)
    s.rect(rx, ry, 3, 2, k % 3 === 0 ? coolL : cool, 0.85)
  }
  // 数据块错位（故障感）
  s.rect(cx + 5, cy + 6, 3, 2, coolL, 0.8)
  s.rect(cx - 9, cy + 9, 3, 2, cool, 0.8)
  s.dith(cx - 8, cy + 2, 16, 20, coolL, 0.1)
  // 垂下的线缆 + 数据包（吊在布下）
  for (let k = 0; k < 3; k++) {
    const wx = cx - 4 + k * 4
    const wy = g - 6 + hover - (k % 2) * 3
    s.thick(wx, cy + 16, wx + (k % 2 ? 1 : -1), wy, 0.8, PAL.oilSheen)
    const py2 = wy + 2
    s.rect(wx - 2, py2, 4, 3, coolD)
    s.rect(wx - 1, py2, 3, 2, mix(PAL.signal, PAL.void, 0.3))
    s.px(wx, py2, PAL.signal, 0.85)
  }
  // 断掉的摄像头脑袋（朝右、镜头裂了）
  s.poly(
    [
      [cx - 5, cy - 2],
      [cx + 7, cy - 5],
      [cx + 12, cy - 1],
      [cx + 11, cy + 6],
      [cx - 2, cy + 7],
    ],
    coolD,
  )
  s.poly(
    [
      [cx - 4, cy - 1],
      [cx + 6, cy - 4],
      [cx + 10, cy - 1],
      [cx + 9, cy + 5],
      [cx - 1, cy + 5],
    ],
    cool,
  )
  // 机壳顶面 / 边角螺丝
  s.poly(
    [
      [cx - 3, cy - 1],
      [cx + 6, cy - 4],
      [cx + 9, cy - 2],
      [cx - 1, cy + 1],
    ],
    mix(cool, PAL.steelWhite, 0.24),
  )
  s.px(cx - 3, cy + 2, PAL.steelLight, 0.8)
  s.px(cx + 5, cy + 4, PAL.steelLight, 0.7)
  // 镜头：外圈 + 玻璃 + 冷光
  s.disc(cx + 9, cy, 4.2, PAL.steelDark)
  s.disc(cx + 9, cy, 3.4, mix(PAL.steelLight, cool, 0.4))
  s.disc(cx + 9, cy, 2.4, mix(PAL.void, PAL.steelDark, 0.4))
  s.disc(cx + 9, cy, 1.5, atk ? PAL.neonRed : PAL.neonCold)
  s.px(cx + 9, cy - 1, PAL.white, 0.9)
  s.line(cx + 8, cy - 3, cx + 10, cy + 1, PAL.white, 0.55)
  F.g.push({ x: cx + 9, y: cy, r: atk ? 12 : 7, c: atk ? PAL.neonRed : PAL.neonCold, p: atk ? 0.65 : 0.45 })
  // 机壳上的裂缝 / 录制红点 / 断掉的支架与线缆
  s.line(cx + 2, cy - 4, cx + 6, cy + 4, PAL.steelWhite, 0.45)
  s.px(cx - 2, cy - 1, PAL.neonRed, 0.9)
  s.line(cx - 3, cy - 3, cx - 5, cy - 9, PAL.steelLight, 0.7)
  s.rect(cx - 7, cy - 11, 4, 2, PAL.steelDark)
  s.px(cx - 5, cy - 9, PAL.signal, 0.7)
  s.thick(cx + 1, cy + 6, cx + 2, cy + 10, 0.7, PAL.oilSheen)
  s.px(cx + 2, cy + 10, PAL.signal, 0.8)
  // 漂浮的数据包（攻击时朝右丢出）
  const packX = atk ? cx + 16 : cx - 12
  const packY = atk ? cy - 4 : cy + 2
  for (let k = 0; k < 3; k++) {
    const px2 = packX + k * 3
    const py3 = packY + (k % 2) * 3
    s.rect(px2, py3, 2, 2, k === 0 ? PAL.signal : mix(PAL.signal, PAL.void, 0.35), 0.85)
    s.px(px2 - 2, py3, PAL.signal, 0.3)
  }
  if (atk) {
    for (let k = 0; k < 5; k++) s.px(cx + 14 + k * 2, cy + 1 + (k % 3), PAL.neonCold, 0.5 - k * 0.06)
    for (let k = 0; k < 3; k++) s.rect(cx + 15 + k * 3, cy - 6 + k, 2, 1, PAL.signal, 0.25)
  }
  s.speck(cx - 9, cy - 6, 20, 26, PAL.rustDark, 0.03, 0.35)
}

/** 流窜病毒：螺旋孢子团 + 二进制拖尾，会自己找载体。 */
function drawViralWraith(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const phase = (i / 3) * TAU
  const cx = 17
  const cy = 19 + hover
  const coreD = mix(PAL.toxicDark, PAL.void, 0.35)
  const coreM = mix(PAL.toxicDark, PAL.toxic, 0.55)
  const glow = PAL.toxicGlow
  const dimBit = mix(PAL.toxicGlow, PAL.void, 0.4)
  s.shadow(cx + 2, g - 0.5, 9, 1.3, 0.18)
  // 二进制拖尾（在身后左下，避免出画）
  for (let k = 0; k < 6; k++) {
    const bx = cx - 6 - k * 2
    const by = cy + 7 + (k % 3) * 3
    const c = k === 0 ? PAL.toxicGlow : dimBit
    if (k % 2) {
      s.px(bx, by, c, 0.9)
      s.px(bx, by + 1, c, 0.9)
      s.px(bx, by + 2, c, 0.9)
      s.px(bx - 1, by + 2, c, 0.7)
    } else {
      s.px(bx - 1, by, c, 0.9)
      s.px(bx + 1, by, c, 0.9)
      s.px(bx - 1, by + 1, c, 0.9)
      s.px(bx + 1, by + 1, c, 0.9)
      s.px(bx - 1, by + 2, c, 0.8)
      s.px(bx + 1, by + 2, c, 0.8)
    }
  }
  for (let k = 0; k < 4; k++) s.px(cx - 14 - k * 4, cy - 4 + (k % 2) * 5, dimBit, 0.5)
  // 螺旋孢子团（旋转的颗粒环）
  const rot = phase * 0.45
  const spread = atk ? 1.25 : 1
  for (let k = 0; k < 9; k++) {
    const a = rot + k * 0.75
    const r = (1.5 + k * 1.15) * spread
    const x = cx + Math.cos(a) * r * 1.15
    const y = cy + Math.sin(a) * r * 0.85
    s.disc(x, y, 3.2 - k * 0.18, k % 2 ? coreM : coreD)
    s.px(x + 1, y - 1, mix(coreM, glow, 0.5), 0.6)
  }
  s.disc(cx, cy, 4, mix(PAL.void, PAL.toxicDark, 0.5))
  s.disc(cx, cy, 2.6, mix(PAL.toxicDark, PAL.toxic, 0.3))
  // 卷须（下摆飘动）
  for (let k = 0; k < 4; k++) {
    const a = 1.2 + k * 0.9
    const sxw = cx + Math.cos(a) * 5
    const syw = cy + 6 + k * 2
    s.thick(sxw, syw - 3, sxw + Math.sin(phase + k) * 3, syw + 4, 0.9, coreD)
    s.px(sxw + Math.sin(phase + k) * 3, syw + 4, mix(glow, PAL.void, 0.3), 0.7)
  }
  // 两只酸绿眼（寻找载体）
  s.disc(cx + 7, cy - 3, 2.2, mix(PAL.void, PAL.toxicDark, 0.5))
  s.px(cx + 7, cy - 3, PAL.white, 0.95)
  s.px(cx + 10, cy - 2, PAL.white, 0.9)
  F.g.push({ x: cx + 8, y: cy - 3, r: atk ? 11 : 7, c: glow, p: atk ? 0.7 : 0.5 })
  // 孢子亮点
  for (let k = 0; k < 5; k++) {
    const a = phase + k * 1.3
    s.px(cx + Math.cos(a) * (7 + k), cy + Math.sin(a) * (5 + k * 0.6), glow, 0.7)
  }
  // 攻击：孢子散开 + 二进制代码前射
  if (atk) {
    for (let k = 0; k < 5; k++) {
      const bx = cx + 12 + k * 2
      const by = cy - 4 + (k % 3) * 4
      s.px(bx, by, PAL.toxicGlow, 0.8)
      s.px(bx, by + 1, PAL.toxicGlow, 0.6)
    }
    for (let k = 0; k < 6; k++) s.px(cx + 4 + k * 2, cy + 5 - (k % 3), glow, 0.45)
  }
  s.speck(cx - 14, cy - 10, 26, 24, PAL.rustDark, 0.03, 0.3)
}

/** 纳米啃噬者：散开的灰色微粒群，核心暗云 + 金属亮点。 */
function drawNanoSwarm(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const atk = F.anim === 'attack'
  const hover = F.anim === 'run' ? (i % 2 ? -1 : 0) : 0
  const phase = (i / 3) * TAU
  const cx = 18
  const cy = 13 + hover
  const coreD = mix(PAL.void, PAL.ashLight, 0.5)
  const coreM = mix(PAL.ash, PAL.steel, 0.35)
  const grain = mix(PAL.ashPale, PAL.steelLight, 0.35)
  s.shadow(cx + 1, g - 0.5, 10, 1.2, 0.2)
  // 核心暗云（小椭圆叠出，随后被颗粒打散）
  s.ell(cx - 2, cy, 5, 3.4, coreD)
  s.ell(cx + 2, cy + 1, 4.4, 3, mix(PAL.void, PAL.ash, 0.45))
  s.ell(cx, cy - 2, 4.4, 2.8, mix(PAL.void, PAL.ashLight, 0.55))
  s.dith(cx - 5, cy - 4, 10, 8, coreM, 0.2)
  s.dith(cx - 6, cy - 5, 13, 9, PAL.ashPale, 0.1)
  // 微粒群（确定性散布，攻击时向外扩散）
  const rnd = mulberry32(0x5a)
  const R = atk ? 15 : 12
  for (let k = 0; k < 135; k++) {
    const a = rnd() * TAU
    const rr = Math.sqrt(rnd())
    const rr2 = rr < 0.72 ? rr : rr + rnd() * 0.32
    const x = cx + Math.cos(a) * rr2 * R + (atk && Math.cos(a) > 0 ? 4 : 0)
    const y = cy + Math.sin(a) * rr2 * R * 0.62 + Math.sin(phase + k) * 0.7
    if (rr < 0.4) {
      s.px(x, y, coreD, 1)
    } else if (rr < 0.7) {
      s.px(x, y, rnd() < 0.5 ? coreM : mix(coreM, PAL.ashPale, 0.5), 0.9)
    } else {
      const c = rnd() < 0.45 ? PAL.steelWhite : grain
      s.px(x, y, c, 0.85)
    }
  }
  // 边缘金属亮点（会反光）
  for (let k = 0; k < 8; k++) {
    const a = phase + k * 0.79
    const mx = cx + Math.cos(a) * (9 + (k % 3) * 2)
    const my = cy + Math.sin(a) * (5 + (k % 2) * 2)
    s.px(mx, my, PAL.steelWhite, 0.95)
    s.px(mx + 1, my, mix(PAL.steelLight, PAL.void, 0.3), 0.7)
    if (k % 3 === 0) s.px(mx - 1, my - 1, PAL.ashPale, 0.7)
  }
  F.g.push({ x: cx + 8, y: cy - 3, r: 4, c: PAL.signal, p: 0.3 })
  // 核心里的两点冷光（群体意志）
  s.px(cx + 4, cy - 2, PAL.white, 0.95)
  s.px(cx + 7, cy - 1, PAL.signal, 0.95)
  F.g.push({ x: cx + 5, y: cy - 1, r: atk ? 8 : 6, c: PAL.signal, p: atk ? 0.6 : 0.45 })
  // 攻击：整群前扑，金属微粒拉出细线
  if (atk) {
    for (let k = 0; k < 7; k++) {
      s.line(cx + 6 + k * 2, cy - 4 + (k % 4) * 3, cx + 12 + k * 2, cy - 4 + (k % 4) * 3, grain, 0.5)
    }
    for (let k = 0; k < 5; k++) s.px(cx + 16 + k * 2, cy + 2 + (k % 3) * 2, PAL.steelWhite, 0.6 - k * 0.1)
  }
  s.speck(cx - 12, cy - 7, 24, 15, PAL.rustDark, 0.03, 0.3)
}

/* —— 匪徒（非攻击性）：望风 / 掠货 / 拾荒 ——
 * 三种都朝 +x 作画（mesh.scale.x = facing 翻面），共同特征：连帽、破布、
 * 独眼或面巾，身上有锈色污渍。跑动用腿部摆动，待机各有小姿态。 */

/** 望风匪徒：瘦高斗篷 + 举着的望远镜。 */
function drawBanditLookout(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const step = F.anim === 'run' ? Math.sin((i / 3) * TAU) * 2.4 : 0
  const cx = 17
  const hipY = g - 14
  const cloak = mix(PAL.rustDark, PAL.ash, 0.45)
  const cloakD = mix(PAL.void, cloak, 0.55)
  const skin = mix(PAL.boneDark, PAL.dust, 0.3)
  s.shadow(cx, g - 0.5, 8, 1.3, 0.28)
  // 腿
  s.thick(cx - 2, hipY, cx - 3 + step, g - 3, 2.2, cloakD)
  s.thick(cx - 3 + step, g - 3, cx - 3 + step, g - 1, 2.2, PAL.ink)
  s.thick(cx + 2, hipY, cx + 3 - step, g - 3, 2.2, cloak)
  s.thick(cx + 3 - step, g - 3, cx + 3 - step, g - 1, 2.2, PAL.ink)
  // 斗篷（上窄下宽）
  s.poly(
    [
      [cx - 6, hipY + 2],
      [cx - 3, hipY - 13],
      [cx + 3, hipY - 13],
      [cx + 6, hipY + 2],
    ],
    cloakD,
  )
  s.poly(
    [
      [cx - 4, hipY + 1],
      [cx - 2, hipY - 12],
      [cx + 2, hipY - 12],
      [cx + 4, hipY + 1],
    ],
    cloak,
  )
  s.line(cx - 3, hipY - 11, cx + 3, hipY - 3, PAL.rust, 0.7)
  // 头 + 兜帽
  const hy = hipY - 17
  s.ell(cx, hy, 4.4, 5, cloakD)
  s.ell(cx + 0.5, hy + 0.6, 3.2, 3.6, skin)
  s.px(cx + 1.6, hy, PAL.neonWarm, 0.9)
  // 望远镜（望风的标识）
  s.rect(cx + 3, hy - 2, 5, 3, PAL.steelDark)
  s.rect(cx + 7, hy - 1.6, 2, 2.2, PAL.steel)
  s.px(cx + 8, hy - 1, PAL.glass, 0.8)
  s.thick(cx + 2, hy + 3, cx + 4, hy - 1, 1.6, cloakD)
  s.speck(cx - 6, hy - 4, 12, 20, PAL.rustDark, 0.06, 0.4)
}

/** 掠货匪徒：背后鼓囊囊的麻袋，面巾遮脸。 */
function drawBanditLooter(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const step = F.anim === 'run' ? Math.sin((i / 3) * TAU) * 2.6 : 0
  const cx = 18
  const hipY = g - 15
  const cloth = mix(PAL.dust, PAL.ochre, 0.4)
  const clothD = mix(PAL.void, cloth, 0.55)
  const sack = mix(PAL.rust, PAL.dust, 0.35)
  const skin = mix(PAL.boneDark, PAL.rust, 0.3)
  s.shadow(cx, g - 0.5, 9, 1.4, 0.3)
  // 麻袋（背后大包，跑步时晃动）
  const sway = F.anim === 'run' ? (i % 2 ? 1.4 : -1.4) : 0
  s.ell(cx - 7 + sway * 0.4, hipY - 12, 7, 9, mix(PAL.void, sack, 0.5))
  s.ell(cx - 7 + sway * 0.4, hipY - 13, 6, 7.6, sack)
  s.line(cx - 10 + sway * 0.4, hipY - 17, cx - 4 + sway * 0.4, hipY - 17, mix(PAL.void, sack, 0.4), 1)
  s.px(cx - 7 + sway * 0.4, hipY - 19, mix(sack, PAL.dustLight, 0.3), 0.8)
  // 腿
  s.thick(cx - 2, hipY, cx - 3 + step, g - 3, 2.4, clothD)
  s.thick(cx - 3 + step, g - 3, cx - 4 + step, g - 1, 2.4, PAL.ink)
  s.thick(cx + 2, hipY, cx + 3 - step, g - 3, 2.4, cloth)
  s.thick(cx + 3 - step, g - 3, cx + 4 - step, g - 1, 2.4, PAL.ink)
  // 躯干（微前倾）
  s.rect(cx - 4, hipY - 12, 9, 13, clothD)
  s.rect(cx - 3, hipY - 12, 7, 11, cloth)
  s.line(cx - 3, hipY - 6, cx + 4, hipY - 6, PAL.rustDark, 0.8)
  // 手臂护着挎带
  s.thick(cx + 4, hipY - 10, cx + 7, hipY - 3, 2, clothD)
  s.px(cx + 7, hipY - 3, skin, 0.9)
  // 头 + 面巾 + 帽檐
  const hy = hipY - 16
  s.ell(cx + 1, hy, 4.2, 4.8, skin)
  s.rect(cx - 2, hy - 1, 7, 3, mix(PAL.rustDark, PAL.blood, 0.4))
  s.px(cx + 2.4, hy - 2.4, PAL.void, 0.9)
  s.px(cx + 2.4, hy - 2.4, PAL.neonWarm, 0.7)
  s.rect(cx - 3, hy - 5, 8, 2, clothD)
  s.speck(cx - 10, hy - 4, 18, 22, PAL.rustDark, 0.06, 0.4)
}

/** 拾荒匪徒：待机蹲着翻找，逃跑时弯腰冲刺。 */
function drawBanditScav(s, F) {
  const g = s.h - 1
  const i = F.i || 0
  const run = F.anim === 'run'
  const cx = 17
  const skin = mix(PAL.boneDark, PAL.dust, 0.35)
  const coat = mix(PAL.ashLight, PAL.rustDark, 0.5)
  const coatD = mix(PAL.void, coat, 0.55)
  s.shadow(cx, g - 0.5, 9, 1.4, 0.3)
  if (run) {
    const step = Math.sin((i / 3) * TAU) * 2.6
    const hipY = g - 12
    s.thick(cx - 3, hipY, cx - 5 + step, g - 3, 2.4, coatD)
    s.thick(cx - 5 + step, g - 3, cx - 6 + step, g - 1, 2.4, PAL.ink)
    s.thick(cx + 2, hipY, cx + 4 - step, g - 3, 2.4, coat)
    s.thick(cx + 4 - step, g - 3, cx + 5 - step, g - 1, 2.4, PAL.ink)
    s.rect(cx - 5, hipY - 9, 10, 10, coatD)
    s.rect(cx - 4, hipY - 9, 8, 8, coat)
    s.thick(cx + 4, hipY - 7, cx + 9, hipY - 2, 2, coatD)
    const hy = hipY - 12
    s.ell(cx + 3, hy, 4, 4.4, coatD)
    s.ell(cx + 3.6, hy + 0.4, 2.8, 3.2, skin)
    s.px(cx + 4.6, hy, PAL.void, 0.9)
  } else {
    // 蹲姿翻找（这个姿势就是它的 idle 帧）
    const dig = Math.sin(i * 1.7) * 1.2
    const hipY = g - 7
    s.thick(cx - 4, hipY, cx - 7, g - 2, 2.6, coatD)
    s.thick(cx + 2, hipY, cx + 5, g - 2, 2.6, coat)
    s.rect(cx - 8, g - 2, 15, 2, PAL.ink)
    s.ell(cx - 1, hipY - 5, 7.5, 6, coatD)
    s.ell(cx - 0.4, hipY - 5.6, 6.2, 4.8, coat)
    s.thick(cx + 4, hipY - 5, cx + 9, g - 3 + dig, 1.8, coatD)
    s.px(cx + 9, g - 2 + dig, skin, 0.9)
    s.ell(cx + 4, hipY - 9, 4, 4.2, coatD)
    s.ell(cx + 4.6, hipY - 8.6, 2.8, 3, skin)
    s.px(cx + 5.4, hipY - 8.6, PAL.void, 0.9)
    // 手边布袋 + 撬棍
    s.ell(cx - 11, g - 3, 4, 3.4, mix(PAL.dust, PAL.rust, 0.4))
    s.rect(cx - 13, g - 6, 4, 1, PAL.rustDark)
    s.line(cx + 11, g - 1, cx + 15, g - 7, PAL.steelLight, 0.9)
  }
  s.speck(cx - 12, g - 20, 24, 19, PAL.rustDark, 0.06, 0.4)
}

const DEFS = {
  radboar: { w: 64, h: 42, draw: drawRadboar, seed: 0x101, run: 4, attack: 2 },
  crawler: { w: 40, h: 24, draw: drawCrawler, seed: 0x102, run: 4, attack: 2 },
  spitter: { w: 46, h: 34, draw: drawSpitter, seed: 0x103, run: 3, attack: 2 },
  wingrat: { w: 34, h: 24, draw: drawWingrat, seed: 0x104, run: 2, attack: 1 },
  sentry: { w: 44, h: 46, draw: drawSentry, seed: 0x105, run: 3, attack: 1 },
  scrapper: { w: 52, h: 40, draw: drawScrapper, seed: 0x106, run: 4, attack: 1 },
  drone: { w: 40, h: 28, draw: drawDrone, seed: 0x107, run: 2, attack: 1 },
  hulkbot: { w: 88, h: 64, draw: drawHulkbot, seed: 0x108, run: 3, attack: 1 },
  ghoul_husk: { w: 38, h: 40, draw: drawGhoulHusk, seed: 0x109, run: 3, attack: 2 },
  tunnel_hound: { w: 46, h: 28, draw: drawTunnelHound, seed: 0x10a, run: 2, attack: 1 },
  cyber_mantis: { w: 52, h: 38, draw: drawCyberMantis, seed: 0x10b, run: 3, attack: 2 },
  psycho_punk: { w: 38, h: 56, draw: drawPsychoPunk, seed: 0x10c, run: 3, attack: 1 },
  server_wraith: { w: 44, h: 46, draw: drawServerWraith, seed: 0x10d, run: 2, attack: 1 },
  weld_brute: { w: 58, h: 54, draw: drawWeldBrute, seed: 0x10e, run: 3, attack: 1 },
  cult_fanatic: { w: 40, h: 58, draw: drawCultFanatic, seed: 0x10f, run: 3, attack: 1 },
  alien_orb: { w: 46, h: 40, draw: drawAlienOrb, seed: 0x110, run: 2, attack: 1 },
  vault_puppet: { w: 50, h: 60, draw: drawVaultPuppet, seed: 0x111, run: 3, attack: 2 },
  mine_shade: { w: 40, h: 54, draw: drawMineShade, seed: 0x112, run: 3, attack: 2 },
  blood_thrall: { w: 40, h: 54, draw: drawBloodThrall, seed: 0x113, run: 4, attack: 2 },
  fog_stalker: { w: 42, h: 54, draw: drawFogStalker, seed: 0x114, run: 4, attack: 1 },
  punk_raider: { w: 36, h: 54, draw: drawPunkRaider, seed: 0x115, run: 3, attack: 2 },
  castle_knight: { w: 54, h: 66, draw: drawCastleKnight, seed: 0x116, run: 3, attack: 1 },
  rogue_ai: { w: 44, h: 46, draw: drawRogueAi, seed: 0x117, run: 3, attack: 2 },
  dark_web_ghost: { w: 42, h: 48, draw: drawDarkWebGhost, seed: 0x118, run: 3, attack: 2 },
  viral_wraith: { w: 38, h: 48, draw: drawViralWraith, seed: 0x119, run: 4, attack: 1 },
  nano_swarm: { w: 38, h: 32, draw: drawNanoSwarm, seed: 0x11a, run: 3, attack: 2 },
  bandit_lookout: { w: 34, h: 48, draw: drawBanditLookout, seed: 0x11b, run: 4, attack: 1 },
  bandit_looter: { w: 36, h: 50, draw: drawBanditLooter, seed: 0x11c, run: 4, attack: 1 },
  bandit_scav: { w: 34, h: 42, draw: drawBanditScav, seed: 0x11d, run: 4, attack: 1 },
}

// 570 只关卡专属小怪（rm_<roomId>_NN）：每只一张按需生成贴图，自带 warm/outline。
Object.assign(DEFS, ROOM_MINION_ART_DEFS)

const OUTLINE_COL = {
  radboar: mix(PAL.void, PAL.rust, 0.2),
  crawler: mix(PAL.void, PAL.steelBlue, 0.2),
  spitter: mix(PAL.void, PAL.toxicDark, 0.24),
  wingrat: mix(PAL.void, PAL.rustDark, 0.2),
  sentry: mix(PAL.void, PAL.steel, 0.24),
  scrapper: mix(PAL.void, PAL.steel, 0.24),
  drone: mix(PAL.void, PAL.steel, 0.22),
  hulkbot: mix(PAL.void, PAL.steel, 0.22),
  ghoul_husk: mix(PAL.void, PAL.rustDark, 0.24),
  tunnel_hound: mix(PAL.void, PAL.ash, 0.3),
  cyber_mantis: mix(PAL.void, PAL.toxic, 0.2),
  psycho_punk: mix(PAL.void, PAL.neonRed, 0.2),
  server_wraith: mix(PAL.void, PAL.neonCold, 0.24),
  weld_brute: mix(PAL.void, PAL.neonWarm, 0.2),
  cult_fanatic: mix(PAL.void, PAL.rustDark, 0.26),
  alien_orb: mix(PAL.void, PAL.neonCold, 0.3),
  vault_puppet: mix(PAL.void, PAL.ochre, 0.22),
  mine_shade: mix(PAL.void, PAL.ashPale, 0.3),
  blood_thrall: mix(PAL.void, PAL.blood, 0.24),
  fog_stalker: mix(PAL.void, PAL.steelLight, 0.26),
  punk_raider: mix(PAL.void, PAL.neonWarm, 0.2),
  castle_knight: mix(PAL.void, PAL.boneDark, 0.26),
  rogue_ai: mix(PAL.void, PAL.signal, 0.24),
  dark_web_ghost: mix(PAL.void, PAL.neonCold, 0.26),
  viral_wraith: mix(PAL.void, PAL.toxic, 0.22),
  nano_swarm: mix(PAL.void, PAL.ashPale, 0.28),
  bandit_lookout: mix(PAL.void, PAL.rust, 0.24),
  bandit_looter: mix(PAL.void, PAL.ochre, 0.24),
  bandit_scav: mix(PAL.void, PAL.dust, 0.26),
}

const WARM = {
  radboar: PAL.rust,
  crawler: PAL.steelBlue,
  spitter: PAL.toxicDark,
  wingrat: PAL.rustDark,
  sentry: PAL.steel,
  scrapper: PAL.steel,
  drone: PAL.steel,
  hulkbot: PAL.steel,
  ghoul_husk: PAL.rustDark,
  tunnel_hound: PAL.ash,
  cyber_mantis: PAL.toxic,
  psycho_punk: PAL.neonRed,
  server_wraith: PAL.neonCold,
  weld_brute: PAL.neonWarm,
  cult_fanatic: PAL.rustDark,
  alien_orb: PAL.neonCold,
  vault_puppet: PAL.ochre,
  mine_shade: PAL.dust,
  blood_thrall: PAL.blood,
  fog_stalker: PAL.steelLight,
  punk_raider: PAL.neonWarm,
  castle_knight: PAL.boneDark,
  rogue_ai: PAL.signal,
  dark_web_ghost: PAL.neonCold,
  viral_wraith: PAL.toxic,
  nano_swarm: PAL.ashPale,
  bandit_lookout: PAL.rust,
  bandit_looter: PAL.ochre,
  bandit_scav: PAL.dust,
}

function renderFrame(id, P) {
  const def = DEFS[id]
  const s = new Surf(def.w, def.h, def.seed + (P.i || 0) * 37 + (P.anim === 'attack' ? 101 : 0))
  P.g = []
  def.draw(s, P)
  // 脏污 / 血迹（确定性）
  s.speck(0, 0, s.w, s.h, PAL.rustDark, 0.05, 0.4)
  s.speck(0, 0, s.w, s.h, PAL.dust, 0.03, 0.35)
  // 三层关系（关卡专属小怪没有全局色表，用 def 自带的 warm / outline）
  const warm = WARM[id] || def.warm || PAL.rust
  const outline = OUTLINE_COL[id] || def.outline || mix(PAL.void, warm, 0.2)
  s.edges(mix(PAL.white, warm, 0.5), PAL.void, 0.4, 0.45)
  s.outline(outline)
  if (P.hurt) {
    s.tint(PAL.neonRed, 0.24)
    const rnd = mulberry32(def.seed + 77)
    for (let k = 0; k < 10; k++) {
      const a = rnd() * TAU
      const d = 4 + rnd() * 10
      s.px(s.w / 2 + Math.cos(a) * d, s.h / 2 + Math.sin(a) * d, PAL.neonWarm, 0.6)
    }
  }
  if (P.dead) {
    s.tint(PAL.void, 0.4)
    const rnd = mulberry32(def.seed + 88)
    for (let k = 0; k < 12; k++) {
      s.px(rnd() * s.w, s.h - 2 - rnd() * 10, rnd() < 0.5 ? PAL.ashPale : PAL.dust, 0.3 + rnd() * 0.3)
    }
  }
  for (const gl of P.g) s.glow(gl.x, gl.y, gl.r, gl.c, gl.p)
  return s.tex()
}

/** 死亡帧：直接画成瘫软的形状（不依赖各怪的 draw）。 */
function renderDead(id) {
  const def = DEFS[id]
  const s = new Surf(def.w, def.h, def.seed + 999)
  const g = s.h - 1
  const cx = def.w * 0.42
  s.shadow(cx, g - 0.5, def.w * 0.3, 2, 0.34)
  const warm = WARM[id] || def.warm || PAL.rust
  const bodyD = mix(PAL.ash, warm, 0.3)
  const body = mix(bodyD, PAL.ashPale, 0.3)
  // 一坨倒下的躯体 + 瘫开的肢体
  s.ell(cx, g - 5, def.w * 0.24, 5.5, bodyD)
  s.ell(cx, g - 6, def.w * 0.22, 4.5, body)
  s.line(cx - def.w * 0.3, g - 2, cx - def.w * 0.42, g - 5, bodyD)
  s.line(cx + def.w * 0.3, g - 3, cx + def.w * 0.42, g - 6, bodyD)
  // 头（歪倒）
  s.ell(cx + def.w * 0.26, g - 4, 6, 4.5, bodyD)
  s.ell(cx + def.w * 0.26, g - 4.5, 5, 3.6, body)
  s.px(cx + def.w * 0.28, g - 6, PAL.neonRed, 0.4)
  // 血 / 油渍
  s.ell(cx, g - 1, def.w * 0.26, 1.8, PAL.bloodDark, 0.5)
  s.ell(cx + 4, g - 1, 5, 1.2, PAL.oil, 0.6)
  // 余烬 / 烟
  const rnd = mulberry32(def.seed + 777)
  for (let k = 0; k < 10; k++) {
    s.px(cx - 10 + rnd() * 20, g - 4 - rnd() * 8, rnd() < 0.5 ? PAL.ashPale : PAL.dust, 0.25 + rnd() * 0.3)
  }
  s.speck(0, 0, s.w, s.h, PAL.rustDark, 0.06, 0.4)
  s.edges(mix(PAL.white, warm, 0.4), PAL.void, 0.3, 0.45)
  s.outline(OUTLINE_COL[id] || def.outline || mix(PAL.void, warm, 0.2))
  s.tint(PAL.void, 0.22)
  // 一只还翘着的肢体（让尸体轮廓不至于是一团）
  s.thick(cx - def.w * 0.18, g - 5, cx - def.w * 0.3, g - 11, 2.2, bodyD)
  s.px(cx - def.w * 0.3, g - 11, PAL.bone, 0.5)
  s.glow(cx + 2, g - 2, 8, PAL.neonWarm, 0.12)
  return s.tex()
}

/* ============================================================================
 * 5. 公开 API
 * ========================================================================== */

export const MONSTER_ART_IDS = Object.keys(DEFS)

const CACHE = new Map()

function build(id) {
  const key = DEFS[id] ? id : 'crawler'
  const def = DEFS[key]
  const frames = {
    idle: [renderFrame(key, { anim: 'idle', i: 0 })],
    run: [],
    attack: [],
    hurt: renderFrame(key, { anim: 'hurt', i: 1, hurt: true }),
    dead: renderDead(key),
  }
  for (let i = 0; i < def.run; i++) frames.run.push(renderFrame(key, { anim: 'run', i }))
  for (let i = 0; i < def.attack; i++) frames.attack.push(renderFrame(key, { anim: 'attack', i }))
  return {
    w: def.w,
    h: def.h,
    artId: key,
    anchor: 'bottom-center',
    frames,
  }
}

/**
 * 怪物美术。未知 id 退回 crawler 的尺寸与画法（引擎不会拿到空对象）。
 */
// （返回的 texture.userData.cleanAlpha = true；alpha 仅 0/255，无半透明脏边）
export function getMonsterArt(id) {
  const key = String(id || '')
  let art = CACHE.get(key)
  if (!art) {
    art = build(key)
    CACHE.set(key, art)
  }
  return art
}

/** 预载内置怪物（570 只关卡专属小怪标了 lazy，进入房间时才画）。 */
export function preloadArt() {
  for (const id of MONSTER_ART_IDS) {
    if (DEFS[id]?.lazy) continue
    getMonsterArt(id)
  }
  return CACHE.size
}

/** 清缓存。 */
export function clearMonsterCache() {
  CACHE.clear()
}

// 大型敌人：实现放在 large-monsters.js，这里再导出，引擎统一从 monsters.js 取。
export { getLargeMonsterArt, preloadLargeArt, clearLargeMonsterCache, LARGE_MONSTER_IDS } from './large-monsters.js'

