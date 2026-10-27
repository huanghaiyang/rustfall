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
 * 4. 帧合成 + 收尾管线
 * ========================================================================== */

const DEFS = {
  radboar: { w: 64, h: 42, draw: drawRadboar, seed: 0x101, run: 4, attack: 2 },
  crawler: { w: 40, h: 24, draw: drawCrawler, seed: 0x102, run: 4, attack: 2 },
  spitter: { w: 46, h: 34, draw: drawSpitter, seed: 0x103, run: 3, attack: 2 },
  wingrat: { w: 34, h: 24, draw: drawWingrat, seed: 0x104, run: 2, attack: 1 },
  sentry: { w: 44, h: 46, draw: drawSentry, seed: 0x105, run: 3, attack: 1 },
  scrapper: { w: 52, h: 40, draw: drawScrapper, seed: 0x106, run: 4, attack: 1 },
  drone: { w: 40, h: 28, draw: drawDrone, seed: 0x107, run: 2, attack: 1 },
  hulkbot: { w: 88, h: 64, draw: drawHulkbot, seed: 0x108, run: 3, attack: 1 },
}

const OUTLINE_COL = {
  radboar: mix(PAL.void, PAL.rust, 0.2),
  crawler: mix(PAL.void, PAL.steelBlue, 0.2),
  spitter: mix(PAL.void, PAL.toxicDark, 0.24),
  wingrat: mix(PAL.void, PAL.rustDark, 0.2),
  sentry: mix(PAL.void, PAL.steel, 0.24),
  scrapper: mix(PAL.void, PAL.steel, 0.24),
  drone: mix(PAL.void, PAL.steel, 0.22),
  hulkbot: mix(PAL.void, PAL.steel, 0.22),
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
}

function renderFrame(id, P) {
  const def = DEFS[id]
  const s = new Surf(def.w, def.h, def.seed + (P.i || 0) * 37 + (P.anim === 'attack' ? 101 : 0))
  P.g = []
  def.draw(s, P)
  // 脏污 / 血迹（确定性）
  s.speck(0, 0, s.w, s.h, PAL.rustDark, 0.05, 0.4)
  s.speck(0, 0, s.w, s.h, PAL.dust, 0.03, 0.35)
  // 三层关系
  s.edges(mix(PAL.white, WARM[id], 0.5), PAL.void, 0.4, 0.45)
  s.outline(OUTLINE_COL[id])
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
  const warm = WARM[id]
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
  s.outline(OUTLINE_COL[id])
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

/** 预载全部怪物。 */
export function preloadArt() {
  for (const id of MONSTER_ART_IDS) getMonsterArt(id)
  return CACHE.size
}

/** 清缓存。 */
export function clearMonsterCache() {
  CACHE.clear()
}

// 大型敌人：实现放在 large-monsters.js，这里再导出，引擎统一从 monsters.js 取。
export { getLargeMonsterArt, preloadLargeArt, clearLargeMonsterCache, LARGE_MONSTER_IDS } from './large-monsters.js'

