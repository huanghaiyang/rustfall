// ============================================================================
// 锈雨 · RUSTFALL —— NPC 像素立绘（PORTRAIT）
// ----------------------------------------------------------------------------
// 契约：
//   export function getPortrait(npcId) -> THREE.CanvasTexture  // 96×96（头肩）
//
// 风格：废土 CRPG 头像 —— 单一背景色 + 抖动暗角 + 极淡扫描线 + UI 角标；
//       人物本身用「暗描边 / 暗部 / 高光」三层，与 #07090b 背景分离。
//
// 实现：角色先画在一张透明的 96×96 表面上（这样锈斑/划痕只落在人物身上），
//       收边后整体合成到背景层，最后叠加自发光（护目镜、义眼、屏幕、噪点）。
//
// npc：baiya 白鸦 / laoqian 老钎 / med3 MED-3 / huique 灰雀 /
//      tiezhua 铁爪 / k9 K-9 / ghost 幽灵信号
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32 } from '../rng.js'
import { Surf, mix, shade, rgb, setArtModule, ALPHA_STATS } from './core.js'
setArtModule('portraits')

/* ============================================================================
 * 1. 颜色 / 像素表面
 * ========================================================================== */


/* ============================================================================
 * 2. 共用底层：背景、肩、皮肤、眼、锈
 * ========================================================================== */

const INK = PAL.ink
const SKIN = mix(PAL.bone, PAL.sand, 0.5)
const SKIN_L = mix(PAL.bone, PAL.white, 0.35)
const SKIN_D = mix(PAL.sand, PAL.rustDark, 0.35)
const SKIN_DD = mix(SKIN_D, PAL.void, 0.35)
const HAIR = PAL.ink
const HAIR_L = mix(PAL.oil, PAL.dust, 0.35)

/** 背景：单色 + 抖动暗角 + 扫描线 + 角标。 */
function backdrop(accent, seed) {
  const s = new Surf(96, 96, seed)
  s.rect(0, 0, 96, 96, mix(PAL.ash, accent, 0.1))
  // 抖动暗角（12 圈）
  for (let k = 0; k < 12; k++) {
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        if (Math.min(x, y, 95 - x, 95 - y) < k) s.px(x, y, PAL.void, 0.055)
      }
    }
  }
  // 人物身后的微弱圆光（同色系）
  for (let k = 0; k < 6; k++) {
    const r = 16 + k * 7
    for (let y = 30 - r; y <= 30 + r; y++) {
      for (let x = 48 - r; x <= 48 + r; x++) {
        const d = Math.hypot(x - 48, y - 30)
        if (d <= r && d > r - 1.3) s.px(x, y, mix(accent, PAL.ash, 0.55), 0.1)
      }
    }
  }
  // 扫描线
  for (let y = 1; y < 96; y += 3) s.rect(0, y, 96, 1, PAL.void, 0.09)
  // 四角
  const c = mix(PAL.ashPale, accent, 0.4)
  s.line(3, 7, 13, 7, c, 0.85)
  s.line(3, 7, 3, 17, c, 0.85)
  s.line(92, 7, 82, 7, c, 0.85)
  s.line(92, 7, 92, 17, c, 0.85)
  s.rect(3, 90, 6, 1, accent, 0.45)
  s.rect(87, 90, 6, 1, accent, 0.45)
  s.rect(3, 88, 18, 1, PAL.void, 0.4)
  return s
}

/** 肩 / 胸：梯形 + 领口（人物共通骨架）。 */
function shoulders(s, o = {}) {
  const w = o.w ?? 74
  const top = o.top ?? 62
  const cx = 48
  const base = o.base ?? PAL.dust
  const lite = o.lite ?? mix(base, PAL.sand, 0.35)
  const dark = o.dark ?? mix(base, PAL.void, 0.45)
  s.poly(
    [
      [cx - w / 2, 96],
      [cx - w / 2 + 4, top],
      [cx - 18, top - 6],
      [cx + 18, top - 6],
      [cx + w / 2 - 4, top],
      [cx + w / 2, 96],
    ],
    base,
  )
  // 左右轮廓
  s.line(cx - w / 2 + 3, top + 2, cx - w / 2 + 1, 95, dark)
  s.line(cx + w / 2 - 3, top + 2, cx + w / 2 - 1, 95, dark)
  s.line(cx - 17, top - 5, cx - w / 2 + 4, top + 1, lite, 0.85)
  s.line(cx + 17, top - 5, cx + w / 2 - 4, top + 1, lite, 0.45)
  // 领口
  s.rect(cx - 20, top - 2, 40, 3, PAL.steelDark)
  s.rect(cx - 19, top - 3, 38, 1, PAL.steel, 0.8)
  // 衣褶
  s.line(cx - 22, top + 10, cx + 22, top + 10, dark, 0.7)
  s.line(cx - 28, top + 20, cx + 28, top + 20, dark, 0.4)
  return { top, cx, base, lite, dark }
}

/** 头发块：留出脸的开口。 */
function hoodHair(s, x, y, w, h, c, cl) {
  s.poly(
    [
      [x, y + h * 0.6],
      [x + w * 0.1, y + h * 0.15],
      [x + w * 0.5, y],
      [x + w * 0.9, y + h * 0.15],
      [x + w, y + h * 0.6],
      [x + w * 0.86, y + h],
      [x + w * 0.14, y + h],
    ],
    c,
  )
  // 发丝高光
  s.line(x + w * 0.25, y + h * 0.18, x + w * 0.5, y + h * 0.06, cl, 0.8)
  s.line(x + w * 0.55, y + h * 0.1, x + w * 0.8, y + h * 0.3, cl, 0.4)
}

/** 有神/疲惫的眼睛（2–3px 宽，带眼白与高光）。 */
function eyePair(s, cx, y, gap, o = {}) {
  const iris = o.iris ?? PAL.oilSheen
  const white = o.white ?? PAL.bone
  for (const dx of [-gap, gap]) {
    s.rect(cx + dx - 2, y - 1, 4, 3, white)
    s.rect(cx + dx - 1, y, 2, 2, iris)
    s.px(cx + dx, y, PAL.black)
    s.px(cx + dx - 1, y - 1, PAL.white, 0.9)
    // 上眼睑阴影
    s.line(cx + dx - 2, y - 2, cx + dx + 1, y - 2, SKIN_DD, 0.7)
  }
}

/** 眉毛（情绪）。 */
function brows(s, cx, y, gap, c = HAIR, tilt = 0) {
  s.line(cx - gap - 3, y + tilt, cx - gap + 2, y - tilt, c, 0.9)
  s.line(cx + gap + 3, y + tilt, cx + gap - 2, y - tilt, c, 0.9)
}

/* ============================================================================
 * 3. 七位 NPC
 * ========================================================================== */

/** 白鸦：半张金属脸的年轻女人，橙色护目镜架在额头，破旧工装。 */
function portraitBaiya(s, P) {
  const coat = mix(PAL.steelBlue, PAL.dust, 0.35)
  const ch = shoulders(s, { w: 78, top: 64, base: coat, lite: mix(coat, PAL.sand, 0.3), dark: mix(coat, PAL.void, 0.5) })
  // 高领（挡住下巴的一部分）
  s.poly(
    [
      [30, 62],
      [66, 62],
      [70, 78],
      [26, 78],
    ],
    mix(coat, PAL.ash, 0.4),
  )
  s.line(30, 63, 66, 63, mix(coat, PAL.sand, 0.3), 0.7)
  // 脖子
  s.rect(42, 54, 12, 12, SKIN_D)
  s.rect(43, 54, 10, 6, SKIN)
  // 脸（椭圆、略侧）
  s.ell(48, 40, 16, 19, SKIN_D)
  s.ell(48, 40, 15, 18, SKIN)
  // 颧骨 / 下颌阴影
  s.line(34, 46, 48, 56, SKIN_D, 0.8)
  s.line(62, 46, 50, 56, SKIN_D, 0.9)
  // —— 右半张脸是金属（覆盖右颊到下颌）——
  s.poly(
    [
      [54, 24],
      [65, 30],
      [66, 46],
      [58, 58],
      [52, 54],
      [52, 30],
    ],
    PAL.steelLight,
  )
  s.poly(
    [
      [56, 28],
      [63, 33],
      [63, 44],
      [57, 53],
      [54, 50],
      [54, 32],
    ],
    PAL.steelWhite,
  )
  // 接缝 + 铆钉 + 电镀划痕
  s.line(54, 26, 53, 54, PAL.steelDark)
  for (let k = 0; k < 4; k++) s.px(56 + (k % 2), 32 + k * 6, PAL.steelDark)
  s.line(57, 34, 63, 34, PAL.steel, 0.7)
  s.line(58, 46, 62, 42, PAL.steel, 0.5)
  // 金属眼（青色一点）
  s.rect(57, 36, 5, 3, PAL.steelDark)
  s.rect(58, 37, 3, 2, PAL.neon)
  P.g.push({ x: 59, y: 38, r: 6, c: PAL.neon, p: 0.5 })
  // 左眼（人眼，疲惫）
  s.rect(39, 35, 5, 4, PAL.bone)
  s.rect(41, 36, 2, 2, PAL.oilSheen)
  s.px(42, 37, PAL.black)
  s.px(40, 36, PAL.white, 0.9)
  s.line(38, 33, 45, 32, HAIR, 0.85)
  // 眉（右眉是金属条）
  s.line(36, 30, 44, 28, HAIR)
  s.line(55, 29, 63, 30, PAL.steelDark)
  // 鼻 / 嘴（薄、干裂）
  s.line(47, 41, 45, 47, SKIN_D, 0.8)
  s.px(44, 47, SKIN_DD)
  s.line(43, 51, 51, 51, PAL.bloodDark, 0.9)
  s.px(44, 50, PAL.blood, 0.5)
  // 头发（短、乱，右侧剃短露出金属）
  hoodHair(s, 33, 15, 30, 16, HAIR, HAIR_L)
  s.poly(
    [
      [34, 26],
      [38, 20],
      [40, 26],
      [36, 30],
    ],
    HAIR,
  )
  s.poly(
    [
      [62, 22],
      [66, 30],
      [64, 34],
      [60, 26],
    ],
    PAL.steelDark,
  )
  // 护目镜（推到额头）
  s.rect(34, 20, 28, 5, PAL.steelDark)
  s.rect(35, 21, 26, 3, PAL.ochre)
  s.rect(37, 21, 8, 3, PAL.neonWarm)
  s.rect(49, 21, 8, 3, PAL.neonWarm)
  s.px(38, 21, PAL.white, 0.8)
  s.px(50, 21, PAL.white, 0.8)
  s.rect(34, 17, 4, 6, PAL.steelDark)
  s.rect(58, 17, 4, 6, PAL.steelDark)
  P.g.push({ x: 41, y: 22, r: 7, c: PAL.neonWarm, p: 0.35 })
  // 脖子上的金属接缝 / 衣领破口
  s.line(50, 56, 53, 62, PAL.steelDark, 0.9)
  s.px(30, 70, PAL.void, 0.6)
  s.px(31, 71, PAL.rust, 0.5)
  // 锈 / 污
  s.speck(30, 18, 36, 44, PAL.dust, 0.05, 0.4)
  s.speck(54, 24, 14, 32, PAL.rustDark, 0.07, 0.45)
  s.line(66, 72, 72, 94, mix(coat, PAL.rust, 0.4), 0.5)
}

/** 老钎：锈蚀的老拾荒机器人，单只琥珀义眼，独眼罩内塞满线缆。 */
function portraitLaoqian(s, P) {
  const shell = mix(PAL.rust, PAL.rustDark, 0.35)
  const shellL = mix(PAL.rust, PAL.rustLight, 0.5)
  const shellD = mix(PAL.rustDark, PAL.void, 0.4)
  const ch = shoulders(s, { w: 80, top: 64, base: mix(PAL.steel, shell, 0.5), lite: shellL, dark: shellD })
  // 颈部液压
  s.rect(42, 56, 12, 10, PAL.steelDark)
  s.rect(43, 57, 4, 8, PAL.steelLight, 0.7)
  s.rect(50, 57, 3, 8, PAL.steel, 0.6)
  // 头（圆筒形、歪）
  s.poly(
    [
      [30, 30],
      [34, 18],
      [58, 16],
      [66, 28],
      [64, 52],
      [56, 60],
      [38, 60],
      [30, 50],
    ],
    shell,
  )
  // 顶盖
  s.poly(
    [
      [34, 18],
      [58, 16],
      [60, 22],
      [33, 24],
    ],
    shellL,
  )
  s.line(35, 19, 57, 17, PAL.rustHot, 0.7)
  // 面板分缝 / 补丁
  s.line(30, 44, 64, 42, shellD, 0.9)
  s.line(48, 24, 47, 58, shellD, 0.75)
  s.poly(
    [
      [52, 46],
      [64, 44],
      [63, 54],
      [54, 56],
    ],
    mix(PAL.steel, shell, 0.4),
  )
  for (let k = 0; k < 3; k++) s.px(56, 48 + k * 3, PAL.steelLight, 0.7)
  // 独眼罩（大、凸出、琥珀光）
  s.ell(45, 36, 9, 8, shellD)
  s.ell(45, 36, 7.6, 6.8, PAL.steelDark)
  s.disc(45, 36, 5, PAL.void)
  s.disc(45, 36, 3.4, PAL.neonWarm)
  s.disc(45, 36, 1.6, PAL.white)
  P.g.push({ x: 45, y: 36, r: 17, c: PAL.neonWarm, p: 0.85 })
  // 眼罩铆钉 / 刮痕
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    s.px(45 + Math.cos(a) * 7, 36 + Math.sin(a) * 6.4, PAL.steelLight, 0.55)
  }
  s.line(38, 33, 42, 31, PAL.steelWhite, 0.35)
  // 另一侧：空眼眶里的线缆
  s.poly(
    [
      [56, 30],
      [64, 32],
      [63, 44],
      [55, 42],
    ],
    PAL.void,
  )
  s.line(57, 34, 61, 40, PAL.oilSheen)
  s.line(61, 33, 59, 41, PAL.steelDark, 0.9)
  s.px(60, 36, PAL.neonRed, 0.8)
  P.g.push({ x: 60, y: 36, r: 4, c: PAL.neonRed, p: 0.3 })
  // 口部格栅（说话的机械嘴）
  s.rect(38, 47, 16, 5, PAL.steelDark)
  for (let k = 0; k < 5; k++) s.rect(39 + k * 3, 48, 2, 3, PAL.black)
  s.px(40, 49, PAL.neonWarm, 0.5)
  // 天线 + 耳件
  s.line(56, 16, 62, 4, PAL.steelLight)
  s.px(62, 4, PAL.neonRed)
  P.g.push({ x: 62, y: 4, r: 5, c: PAL.neonRed, p: 0.5 })
  s.rect(28, 32, 3, 10, PAL.steelDark)
  s.px(29, 34, PAL.neonWarm, 0.6)
  // 破损：缺角露线
  s.poly(
    [
      [30, 46],
      [36, 45],
      [35, 54],
      [31, 52],
    ],
    PAL.void,
  )
  s.line(31, 47, 34, 52, PAL.oilSheen)
  // 锈蚀 / 油污
  s.speck(30, 16, 36, 44, PAL.rustDark, 0.16, 0.55)
  s.speck(30, 16, 36, 44, PAL.rustLight, 0.05, 0.4)
  s.line(36, 60, 34, 78, PAL.rustDark, 0.5)
  // 肩上的旧编号
  s.rect(60, 76, 1, 6, PAL.sand, 0.4)
  s.rect(63, 76, 4, 1, PAL.sand, 0.35)
}

/** MED-3：白色 / 红十字医疗机器人，屏幕脸。 */
function portraitMed3(s, P) {
  const shell = PAL.steelWhite
  const shellD = mix(PAL.steelWhite, PAL.steelBlue, 0.55)
  const ch = shoulders(s, { w: 76, top: 62, base: mix(shell, PAL.steelLight, 0.3), lite: PAL.white, dark: shellD })
  // 红十字（胸前）
  s.rect(42, 70, 12, 24, PAL.blood)
  s.rect(36, 76, 24, 12, PAL.blood)
  s.rect(43, 71, 10, 22, PAL.danger, 0.5)
  s.rect(37, 77, 22, 10, PAL.danger, 0.5)
  // 圆角头壳
  s.ell(48, 39, 21, 22, shellD)
  s.ell(48, 39, 19.5, 20.5, shell)
  // 面板接缝
  s.line(29, 46, 67, 46, shellD, 0.7)
  s.line(48, 18, 48, 24, shellD, 0.6)
  // 屏幕脸（黑底 + 十字 + 数据）
  s.rect(33, 28, 30, 20, PAL.steelDark)
  s.rect(34, 29, 28, 18, PAL.black)
  // 十字（屏幕里）
  s.rect(46, 32, 4, 12, PAL.danger, 0.9)
  s.rect(40, 36, 16, 4, PAL.danger, 0.9)
  s.rect(47, 33, 2, 10, PAL.neonRed, 0.6)
  s.rect(41, 37, 14, 2, PAL.neonRed, 0.6)
  // 屏幕两侧的“眼睛”光条（更有表情）
  s.rect(35, 31, 5, 2, PAL.neon, 0.55)
  s.rect(56, 31, 5, 2, PAL.neon, 0.55)
  // 心率线
  for (let x = 35; x < 61; x++) {
    const y = 44 + (x % 7 === 0 ? -2 : x % 3 === 0 ? 1 : 0)
    s.px(x, y, PAL.neon, 0.5)
  }
  P.g.push({ x: 48, y: 38, r: 20, c: PAL.neonRed, p: 0.28 })
  P.g.push({ x: 37, y: 32, r: 5, c: PAL.neon, p: 0.4 })
  P.g.push({ x: 58, y: 32, r: 5, c: PAL.neon, p: 0.4 })
  // 两侧“耳朵”（医疗传感器）
  s.rect(25, 32, 5, 12, PAL.steelLight)
  s.rect(66, 32, 5, 12, PAL.steelLight)
  s.rect(26, 34, 3, 8, PAL.glass, 0.6)
  s.rect(67, 34, 3, 8, PAL.glass, 0.6)
  // 头顶指示灯 + 提手
  s.rect(44, 15, 8, 4, PAL.steelDark)
  s.rect(45, 14, 3, 2, PAL.neon)
  P.g.push({ x: 46, y: 15, r: 6, c: PAL.neon, p: 0.5 })
  s.rect(54, 13, 3, 3, PAL.danger)
  P.g.push({ x: 55, y: 14, r: 5, c: PAL.danger, p: 0.35 })
  // 型号文字（磨损）
  s.rect(36, 52, 7, 1, PAL.steelDark, 0.8)
  s.rect(45, 52, 4, 1, PAL.steelDark, 0.7)
  s.rect(51, 52, 6, 1, PAL.steelDark, 0.75)
  // 污渍 / 血手印
  s.speck(26, 16, 44, 42, PAL.dust, 0.04, 0.35)
  s.ell(58, 70, 5, 6, PAL.bloodDark, 0.35)
  for (let k = 0; k < 4; k++) s.line(55 + k * 2, 65, 56 + k * 2, 74, PAL.bloodDark, 0.3)
  // 管线
  s.line(31, 54, 26, 70, PAL.oilSheen, 0.8)
  s.line(65, 54, 70, 68, PAL.oilSheen, 0.6)
}

/** 灰雀：脏脸小孩，裹着破毯子，只露出眼睛和嘴。 */
function portraitHuique(s, P) {
  const blanket = mix(PAL.dust, PAL.rustDark, 0.3)
  const blanketL = mix(PAL.dustLight, PAL.sand, 0.3)
  const blanketD = mix(PAL.dust, PAL.void, 0.5)
  // 毯子披肩（盖住整个肩）
  s.poly(
    [
      [10, 96],
      [14, 68],
      [24, 52],
      [34, 46],
      [62, 46],
      [74, 54],
      [84, 74],
      [86, 96],
    ],
    blanket,
  )
  // 布褶
  for (let k = 0; k < 6; k++) {
    const x = 16 + k * 12
    s.line(x, 56, x + (k % 2 ? 3 : -3), 95, blanketD, 0.6)
  }
  s.line(24, 54, 32, 48, blanketL, 0.8)
  // 兜帽（围住脸）
  s.poly(
    [
      [26, 70],
      [28, 46],
      [38, 30],
      [58, 30],
      [68, 44],
      [70, 66],
      [60, 74],
      [36, 76],
    ],
    blanketD,
  )
  s.poly(
    [
      [30, 66],
      [32, 48],
      [40, 34],
      [56, 34],
      [64, 46],
      [66, 64],
      [58, 70],
      [38, 71],
    ],
    blanket,
  )
  // 脸（小、脏、瘦）
  s.ell(48, 52, 14, 16, SKIN_D)
  s.ell(48, 52, 13, 15, SKIN)
  // 灰 / 脏污
  s.speck(35, 40, 26, 26, PAL.dust, 0.09, 0.4)
  s.speck(35, 44, 26, 22, SKIN_DD, 0.05, 0.35)
  s.px(38, 58, PAL.dust, 0.6)
  s.px(56, 46, PAL.dust, 0.5)
  // 大眼（孩子比例）+ 眼下的黑眼圈
  s.rect(38, 48, 8, 6, PAL.bone)
  s.rect(50, 48, 8, 6, PAL.bone)
  s.rect(40, 49, 4, 4, PAL.oilSheen)
  s.rect(52, 49, 4, 4, PAL.oilSheen)
  s.px(41, 51, PAL.black)
  s.px(53, 51, PAL.black)
  s.px(39, 49, PAL.white, 0.9)
  s.px(51, 49, PAL.white, 0.9)
  s.line(37, 46, 46, 45, SKIN_DD, 0.8)
  s.line(50, 45, 59, 46, SKIN_DD, 0.8)
  s.line(37, 55, 45, 56, SKIN_DD, 0.35)
  s.line(51, 56, 59, 55, SKIN_DD, 0.35)
  // 鼻 / 嘴（抿着）
  s.line(48, 54, 47, 59, SKIN_D, 0.8)
  s.px(47, 60, SKIN_DD, 0.8)
  s.line(44, 63, 51, 63, PAL.bloodDark, 0.8)
  // 脸颊的擦伤
  s.line(58, 57, 61, 60, PAL.bloodDark, 0.5)
  s.px(59, 58, PAL.blood, 0.4)
  // 头发（从毯子里露出的几缕）
  s.line(36, 34, 32, 26, HAIR, 0.9)
  s.line(38, 33, 35, 24, HAIR, 0.7)
  s.line(60, 34, 65, 27, HAIR, 0.8)
  // 毯子的破边（撕裂条）
  s.poly(
    [
      [70, 78],
      [82, 74],
      [80, 88],
      [72, 90],
    ],
    blanketD,
  )
  s.px(84, 90, PAL.void, 0.7)
  // 抓毯子的手指（冻得发白）
  s.rect(24, 74, 5, 4, SKIN_D)
  s.rect(25, 74, 4, 2, SKIN)
  s.px(26, 78, SKIN_DD)
  // 毯子上的旧补丁
  s.rect(66, 64, 8, 7, mix(PAL.bloodDark, PAL.dust, 0.4), 0.85)
  s.line(66, 64, 73, 64, PAL.rust, 0.5)
  P.g.push({ x: 48, y: 50, r: 12, c: PAL.ashPale, p: 0.1 })
}

/** 铁爪：粗壮的打捞工，右臂是液压爪（进画），焊帽推到额头。 */
function portraitTiezhua(s, P) {
  const vest = mix(PAL.rustDark, PAL.dust, 0.25)
  const vestL = mix(PAL.rust, PAL.sand, 0.35)
  const skinT = mix(PAL.bone, PAL.rustLight, 0.35)
  const ch = shoulders(s, { w: 86, top: 60, base: vest, lite: vestL, dark: mix(vest, PAL.void, 0.5) })
  // 背带 / 铆钉工装
  s.rect(20, 66, 8, 30, PAL.steelDark)
  s.rect(21, 66, 6, 30, mix(PAL.rust, PAL.dust, 0.4))
  s.rect(68, 66, 8, 30, PAL.steelDark)
  s.rect(69, 66, 6, 30, mix(PAL.rust, PAL.dust, 0.4))
  for (let k = 0; k < 3; k++) s.px(24, 72 + k * 8, PAL.steelLight, 0.6)
  // 右臂液压爪（从右下进画）
  const claw = mix(PAL.steel, PAL.rustDark, 0.35)
  s.thick(84, 96, 74, 78, 7, PAL.steelDark)
  s.thick(84, 96, 74, 78, 5.4, claw)
  s.thick(80, 90, 72, 80, 2, PAL.steelLight, 0.4)
  s.disc(74, 78, 7, PAL.steelDark)
  s.disc(74, 78, 5.4, PAL.steel)
  s.disc(74, 78, 2, PAL.oil)
  // 三根爪
  s.poly(
    [
      [68, 74],
      [60, 66],
      [58, 70],
      [64, 78],
    ],
    PAL.steelLight,
  )
  s.poly(
    [
      [70, 82],
      [62, 88],
      [64, 92],
      [72, 86],
    ],
    PAL.steelLight,
  )
  s.poly(
    [
      [78, 72],
      [84, 62],
      [88, 66],
      [82, 76],
    ],
    PAL.steel,
  )
  s.px(59, 68, PAL.steelWhite)
  s.px(63, 90, PAL.steelWhite)
  // 脖子（粗）
  s.rect(40, 52, 18, 12, mix(skinT, SKIN_D, 0.4))
  s.rect(41, 52, 16, 8, skinT)
  // 头（方下巴）
  s.poly(
    [
      [30, 30],
      [36, 18],
      [60, 18],
      [68, 32],
      [66, 50],
      [56, 58],
      [40, 58],
      [30, 48],
    ],
    SKIN_D,
  )
  s.poly(
    [
      [32, 31],
      [37, 21],
      [59, 21],
      [66, 33],
      [64, 49],
      [55, 55],
      [41, 55],
      [32, 47],
    ],
    skinT,
  )
  // 胡茬（抖动）
  s.dith(36, 44, 28, 13, mix(skinT, PAL.ink, 0.45), 0.45, 0.55)
  s.dith(38, 52, 24, 5, mix(skinT, PAL.ink, 0.55), 0.6, 0.6)
  // 眉（粗）+ 疤
  s.rect(34, 30, 10, 2, HAIR)
  s.rect(52, 30, 10, 2, HAIR)
  s.line(58, 26, 60, 38, PAL.bloodDark, 0.7)
  // 眼（小、眯着、凶）
  s.rect(37, 35, 7, 4, PAL.bone)
  s.rect(52, 35, 7, 4, PAL.bone)
  s.rect(39, 36, 3, 3, PAL.oilSheen)
  s.rect(54, 36, 3, 3, PAL.oilSheen)
  s.px(40, 37, PAL.black)
  s.px(55, 37, PAL.black)
  s.line(36, 33, 44, 33, HAIR, 0.9)
  s.line(51, 33, 59, 33, HAIR, 0.9)
  // 鼻 / 嘴
  s.poly(
    [
      [47, 40],
      [45, 48],
      [50, 48],
    ],
    SKIN_D,
  )
  s.px(45, 49, PAL.ink, 0.6)
  s.line(42, 52, 53, 51, PAL.bloodDark, 0.9)
  s.px(43, 53, SKIN_DD, 0.7)
  // 焊帽（推到额头，镜片翻起）
  s.poly(
    [
      [28, 26],
      [34, 12],
      [62, 12],
      [70, 26],
      [66, 28],
      [32, 28],
    ],
    PAL.steelDark,
  )
  s.poly(
    [
      [32, 24],
      [36, 15],
      [60, 15],
      [66, 25],
      [34, 26],
    ],
    PAL.steel,
  )
  s.rect(34, 20, 28, 3, PAL.steelLight, 0.5)
  // 镜片（黑绿、发光微弱）
  s.rect(38, 15, 20, 6, PAL.toxicDark)
  s.rect(39, 16, 18, 4, PAL.black)
  s.line(41, 17, 54, 19, PAL.toxicGlow, 0.35)
  P.g.push({ x: 48, y: 18, r: 9, c: PAL.toxicGlow, p: 0.2 })
  // 耳 / 焊接疤
  s.rect(26, 36, 5, 11, SKIN_D)
  s.rect(68, 36, 4, 9, SKIN_D)
  s.line(62, 44, 66, 48, PAL.bloodDark, 0.6)
  // 汗 / 油污
  s.speck(32, 20, 36, 38, PAL.ink, 0.04, 0.35)
  P.g.push({ x: 48, y: 40, r: 22, c: PAL.rustHot, p: 0.08 })
}

/** K-9：机械犬，只有半个头（另一半是裸线与骨架）。 */
function portraitK9(s, P) {
  const metal = mix(PAL.steel, PAL.steelLight, 0.35)
  const metalD = mix(PAL.steelDark, PAL.void, 0.3)
  const ch = shoulders(s, { w: 78, top: 66, base: mix(PAL.steelDark, PAL.rustDark, 0.4), lite: metal, dark: metalD })
  // 颈部装甲环
  s.rect(30, 66, 36, 10, PAL.steelDark)
  s.rect(31, 67, 34, 4, metal, 0.9)
  for (let k = 0; k < 5; k++) s.px(34 + k * 7, 70, PAL.steelLight, 0.7)
  // 头（侧视犬形，朝右，吻部在右）
  s.poly(
    [
      [16, 44],
      [24, 26],
      [52, 20],
      [78, 26],
      [86, 40],
      [80, 52],
      [52, 56],
      [22, 54],
    ],
    metalD,
  )
  s.poly(
    [
      [18, 44],
      [26, 29],
      [52, 23],
      [76, 29],
      [82, 40],
      [76, 49],
      [52, 52],
      [24, 51],
    ],
    metal,
  )
  // 左半是完好的装甲（高光 + 铆钉）
  s.poly(
    [
      [20, 44],
      [27, 31],
      [48, 25],
      [50, 50],
      [22, 49],
    ],
    mix(metal, PAL.steelWhite, 0.35),
  )
  s.line(24, 42, 44, 30, PAL.steelWhite, 0.55)
  for (let k = 0; k < 3; k++) s.px(26 + k * 6, 40, PAL.steelDark, 0.9)
  // 右半：头骨缺了一半，露出内部（黑腔 + 线束 + 小灯）
  s.poly(
    [
      [52, 22],
      [72, 27],
      [78, 38],
      [70, 46],
      [56, 48],
      [52, 40],
    ],
    PAL.void,
  )
  s.poly(
    [
      [56, 27],
      [70, 30],
      [73, 38],
      [66, 43],
      [58, 42],
      [56, 34],
    ],
    PAL.black,
  )
  // 线束（红/青混线）
  s.line(57, 30, 68, 34, PAL.oilSheen)
  s.line(58, 33, 70, 38, PAL.rustDark)
  s.line(60, 28, 66, 42, PAL.steelDark)
  s.px(64, 32, PAL.neonRed, 0.85)
  s.px(68, 36, PAL.neon, 0.7)
  P.g.push({ x: 64, y: 32, r: 5, c: PAL.neonRed, p: 0.35 })
  // 断骨 / 支架（右缘）
  s.line(74, 24, 80, 20, PAL.boneDark, 0.9)
  s.line(76, 30, 84, 28, PAL.bone, 0.7)
  // 还完好的那只眼（单眼，青色）
  s.ell(40, 37, 9, 7, PAL.steelDark)
  s.ell(40, 37, 7.4, 5.6, PAL.void)
  s.disc(40, 37, 4.2, PAL.neon)
  s.disc(40, 37, 2, PAL.white)
  P.g.push({ x: 40, y: 37, r: 16, c: PAL.neon, p: 0.8 })
  s.line(32, 31, 46, 29, PAL.steelDark, 0.9)
  // 吻部（右侧，露出牙齿）
  s.poly(
    [
      [72, 38],
      [88, 40],
      [86, 47],
      [72, 47],
    ],
    metal,
  )
  s.line(72, 42, 87, 43, PAL.steelDark)
  for (let k = 0; k < 4; k++) s.px(78 + k * 2, 44, PAL.bone, 0.85)
  s.px(86, 40, PAL.steelWhite)
  // 耳（一只立着、一只歪）
  s.poly(
    [
      [28, 24],
      [30, 12],
      [38, 22],
    ],
    metalD,
  )
  s.poly(
    [
      [34, 22],
      [36, 13],
      [42, 21],
    ],
    metal,
  )
  s.poly(
    [
      [62, 22],
      [70, 12],
      [72, 22],
    ],
    metalD,
  )
  // 颈部线缆
  s.thick(40, 56, 46, 66, 1.6, PAL.oilSheen)
  s.thick(56, 54, 52, 66, 1.4, PAL.steelDark)
  // 锈 / 弹痕
  s.speck(18, 22, 66, 34, PAL.rustDark, 0.12, 0.5)
  s.ell(30, 34, 2, 2, PAL.void, 0.8)
  s.ell(31, 34, 1.4, 1.4, PAL.steelLight, 0.4)
  // 名牌（磨损）
  s.rect(34, 80, 2, 6, PAL.sand, 0.35)
  s.rect(38, 80, 6, 1, PAL.sand, 0.3)
}

/** 幽灵信号：人形全息噪点轮廓（青蓝）。 */
function portraitGhost(s, P) {
  const holo = PAL.neon
  const holoD = mix(PAL.neon, PAL.steelBlue, 0.65)
  // 全息投影底座光
  s.ell(48, 82, 26, 4, PAL.neon, 0.1)
  // 人形轮廓（头 + 肩 + 胸），用半透明填充 + 边缘发光
  // 头
  s.ell(48, 34, 15, 17, holoD, 0.42)
  s.ell(48, 34, 14, 16, holo, 0.14)
  // 肩 / 躯干
  s.poly(
    [
      [26, 82],
      [30, 56],
      [40, 48],
      [56, 48],
      [66, 56],
      [70, 82],
    ],
    holoD,
    0.4,
  )
  s.poly(
    [
      [30, 80],
      [34, 58],
      [42, 51],
      [54, 51],
      [62, 58],
      [66, 80],
    ],
    holo,
    0.12,
  )
  // 扫描线（横向断裂带）
  for (let y = 20; y < 84; y += 3) {
    const r = mulberry32(0x400 + y)
    const gap = r()
    if (gap < 0.3) {
      for (let x = 24; x < 74; x++) {
        if (s.a(x, y) > 0) s.px(x, y, PAL.void, 0.55)
      }
    } else if (gap > 0.75) {
      for (let x = 24; x < 74; x++) s.px(x, y, holo, 0.1)
    }
  }
  // 边缘光（轮廓亮线）
  for (let y = 18; y < 84; y++) {
    for (let x = 20; x < 76; x++) {
      if (s.a(x, y) < 40) continue
      if (s.a(x - 1, y) < 40 || s.a(x + 1, y) < 40) s.px(x, y, holo, 0.5)
    }
  }
  // 面部：只有两个亮点当眼睛
  s.rect(40, 32, 5, 2, PAL.white, 0.85)
  s.rect(52, 32, 5, 2, PAL.white, 0.85)
  P.g.push({ x: 42, y: 32, r: 7, c: holo, p: 0.6 })
  P.g.push({ x: 54, y: 32, r: 7, c: holo, p: 0.6 })
  // 噪点
  const rnd = mulberry32(0x410)
  for (let k = 0; k < 260; k++) {
    const x = 22 + rnd() * 52
    const y = 16 + rnd() * 68
    if (s.a(x, y) <= 0) continue
    s.px(x, y, rnd() < 0.5 ? holo : PAL.white, 0.12 + rnd() * 0.3)
  }
  // 水平撕裂条（错位的“信号不良”）
  for (let k = 0; k < 3; k++) {
    const y = 26 + k * 20
    for (let x = 26; x < 70; x++) {
      if (s.a(x, y) > 0) s.px(x + 3, y, holo, 0.35)
    }
  }
  // 整体光晕
  P.g.push({ x: 48, y: 44, r: 42, c: holo, p: 0.2 })
  P.g.push({ x: 48, y: 78, r: 22, c: holo, p: 0.16 })
  // 投影仪的细框（说明它是被投出来的）
  s.line(28, 86, 68, 86, holo, 0.25)
  s.line(30, 88, 66, 88, holo, 0.15)
}

const NPC_DRAW = {
  baiya: portraitBaiya,
  laoqian: portraitLaoqian,
  med3: portraitMed3,
  huique: portraitHuique,
  tiezhua: portraitTiezhua,
  k9: portraitK9,
  ghost: portraitGhost,
}

const ACCENT = {
  baiya: PAL.neonWarm,
  laoqian: PAL.rustLight,
  med3: PAL.danger,
  huique: PAL.sand,
  tiezhua: PAL.rust,
  k9: PAL.neon,
  ghost: PAL.neon,
}

/* ============================================================================
 * 4. 组装 / 缓存
 * ========================================================================== */

const CACHE = new Map()

function build(id) {
  const key = NPC_DRAW[id] ? id : 'baiya'
  const accent = ACCENT[key] || PAL.ashPale
  const body = new Surf(96, 96, 0x1000 + Object.keys(NPC_DRAW).indexOf(key) * 37 + 7)
  const P = { g: [] }
  NPC_DRAW[key](body, P)
  // 人物细节：油污 / 划痕（只落在人身上）
  body.speck(8, 8, 80, 80, PAL.dust, 0.02, 0.3)
  body.speck(8, 8, 80, 80, PAL.rustDark, 0.012, 0.35)
  body.edges(mix(PAL.white, accent, 0.4), PAL.void, 0.28, 0.4)
  body.outline(mix(PAL.void, accent, 0.18))
  // 合成到背景
  const s = backdrop(accent, 0x2000 + Object.keys(NPC_DRAW).indexOf(key) * 13)
  s.stamp(body)
  for (const gl of P.g) s.glow(gl.x, gl.y, gl.r, gl.c, gl.p)
  // 底部压暗（把肩膀收进暗部，聚焦到脸）
  for (let y = 84; y < 96; y++) {
    const a = (y - 84) / 12
    for (let x = 0; x < 96; x++) s.px(x, y, PAL.void, 0.05 + a * 0.12)
  }
  const t = s.tex()
  t.userData.npcId = key
  return t
}

/**
 * NPC 立绘（96×96 头肩像）。未知 npc 回退到白鸦（不会返回空）。
 * 同一 id 永远返回同一个 texture 实例。
 */
// （返回的 texture.userData.cleanAlpha = true；alpha 仅 0/255，无半透明脏边）
export function getPortrait(npcId) {
  const key = String(npcId || '')
  let tex = CACHE.get(key)
  if (!tex) {
    tex = build(key)
    CACHE.set(key, tex)
  }
  return tex
}

export const PORTRAIT_IDS = ['baiya', 'laoqian', 'med3', 'huique', 'tiezhua', 'k9', 'ghost']

/** 预载全部立绘。 */
export function preloadArt() {
  for (const id of PORTRAIT_IDS) getPortrait(id)
  return CACHE.size
}

/** 清缓存。 */
export function clearPortraitCache() {
  CACHE.clear()
}
