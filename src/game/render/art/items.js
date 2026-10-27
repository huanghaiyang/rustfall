// ============================================================================
// 锈雨 · RUSTFALL —— 物品图标（ITEM ICON）程序化像素美术
// ----------------------------------------------------------------------------
// 契约：
//   export function getItemArt(itemId) -> THREE.CanvasTexture   // 20×20
//   export function getCategoryIcon(category) -> THREE.CanvasTexture // 16×16
//
// 行为：
//   · 先读 Content.get('item', itemId) 的 category / art / rarity；
//     内容表还没注册时（或 mod 物品）用 id 的 FNV 哈希稳定推导造型与配色，
//     因此「每个 id 图标唯一且稳定」，重复调用返回同一实例。
//   · 造型来自 art 提示（bottle / board / gear …），无提示时按分类取池子，
//     池子内用哈希选变体 —— 同一分类的物品不会全长一样。
//   · 稀有度 1–5：1 无框；2 沙色细框；3 赭色框 + 四角刻度；4 暖霓虹框 + 星点；
//     5 青霓虹框 + 外发光。
//   · 所有图标：透明底、1px 暗描边、上缘高光、下缘暗部；颗粒 ≤2px；
//     抖动过渡用 4×4 Bayer。贴图参数：NearestFilter / 无 mipmap / SRGB。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32 } from '../rng.js'
import { Content, KIND } from '../../core/registry.js'
import { Surf, mix, shade, rgb, setArtModule, ALPHA_STATS } from './core.js'
setArtModule('items')

/* ============================================================================
 * 1. 颜色与像素表面
 * ========================================================================== */


/** 字符串 → 32 位稳定种子（FNV-1a）。 */
function fnv(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/* ============================================================================
 * 2. 图标造型（20×20，居中，留 1–2px 边）
 * ========================================================================== */

/** 不规则矿石块：多面体 + 高光棱。 */
function sOre(s, r) {
  const w = 13 + Math.floor(r() * 3)
  const h = 11 + Math.floor(r() * 3)
  const x = Math.round(10 - w / 2)
  const y = Math.round(19 - h)
  const pts = [
    [x + 1, y + h * 0.45],
    [x + 3, y + 1],
    [x + w * 0.55, y],
    [x + w - 1, y + 3],
    [x + w, y + h - 2],
    [x + w * 0.6, y + h],
    [x + 1, y + h - 1],
  ]
  s.poly(pts, PAL.steelDark)
  s.poly(
    pts.map((p) => [p[0] - 0.6, p[1] - 0.6]),
    PAL.steel,
  )
  // 受光面
  s.poly(
    [
      [x + 3, y + 3],
      [x + w * 0.55, y + 1],
      [x + w * 0.5, y + h * 0.55],
      [x + 2, y + h * 0.6],
    ],
    PAL.steelLight,
  )
  // 矿脉 / 锈
  s.line(x + 3, y + h - 2, x + w - 3, y + 3, PAL.rust, 0.85)
  s.line(x + 4, y + h - 3, x + w - 4, y + 4, PAL.rustLight, 0.5)
  s.speck(x, y, w, h, PAL.rustDark, 0.18, 0.6)
  s.px(x + 4, y + 3, PAL.steelWhite)
  s.px(x + 5, y + 4, PAL.steelWhite, 0.6)
}

/** 板材：带铆钉的斜切金属板。 */
function sPlate(s, r) {
  const w = 14
  const h = 9 + Math.floor(r() * 3)
  const x = 3
  const y = 19 - h
  s.poly(
    [
      [x + 2, y],
      [x + w - 1, y],
      [x + w - 1, y + h - 2],
      [x + w - 3, y + h - 1],
      [x, y + h - 1],
      [x, y + 2],
    ],
    PAL.rust,
  )
  s.line(x + 2, y + 1, x + w - 2, y + 1, PAL.rustLight)
  s.line(x + 1, y + 2, x + 1, y + h - 2, PAL.rustLight, 0.7)
  s.line(x + 1, y + h - 2, x + w - 3, y + h - 2, PAL.rustDark)
  s.rect(x + 2, y + h - 2, 4, 1, PAL.void, 0.4)
  for (let k = 0; k < 3; k++) {
    s.px(x + 3 + k * 4, y + 3, PAL.steelLight)
    s.px(x + 3 + k * 4, y + h - 3, PAL.steelDark)
  }
  s.speck(x, y, w, h, PAL.rustDark, 0.2, 0.55)
}

/** 线缆盘：三圈铜线。 */
function sCoil(s, r) {
  const cx = 10
  const cy = 11
  s.ell(cx, cy, 7.5, 7, PAL.rustDark)
  s.ell(cx, cy, 6.5, 6, PAL.rust)
  s.ell(cx, cy, 4.8, 4.4, PAL.rustDark)
  s.ell(cx, cy, 3.4, 3, PAL.rustLight)
  s.ell(cx, cy, 2, 1.8, PAL.void)
  // 线头
  s.line(cx + 6, cy - 3, cx + 8, cy - 7, PAL.rustLight)
  s.px(cx + 8, cy - 7, PAL.sand)
  s.px(cx - 3, cy - 5, PAL.sand, 0.8)
  s.speck(cx - 7, cy - 6, 15, 12, PAL.rustDark, 0.12)
}

/** 废布 / 破布卷。 */
function sCloth(s, r) {
  s.poly(
    [
      [3, 12],
      [7, 6],
      [15, 5],
      [17, 10],
      [13, 15],
      [6, 16],
    ],
    PAL.dust,
  )
  s.poly(
    [
      [5, 11],
      [8, 7],
      [14, 6],
      [15, 10],
      [11, 14],
      [7, 14],
    ],
    PAL.dustLight,
  )
  s.line(6, 12, 14, 8, PAL.sandDark, 0.8)
  s.line(7, 14, 13, 11, PAL.sandDark, 0.5)
  // 撕裂边
  s.px(17, 10, PAL.void, 0.7)
  s.px(13, 15, PAL.void, 0.6)
  s.px(3, 12, PAL.void, 0.5)
  s.speck(4, 6, 13, 10, PAL.dust, 0.2)
}

/** 化学瓶（润滑油 / 酸 / 中和剂）。 */
function sBottle(s, r) {
  const liquid = r() < 0.5 ? PAL.toxicDark : PAL.oil
  const liquidHi = r() < 0.5 ? PAL.toxic : PAL.oilSheen
  s.rect(7, 4, 6, 2, PAL.steelDark)
  s.rect(6, 6, 8, 12, PAL.ashPale)
  s.rect(7, 7, 6, 10, liquid)
  s.rect(7, 9, 6, 3, liquidHi, 0.5)
  s.rect(6, 6, 1, 12, PAL.steelLight)
  s.rect(13, 6, 1, 12, PAL.steelDark)
  s.rect(8, 3, 4, 2, PAL.rust)
  s.line(7, 12, 8, 16, PAL.white, 0.25)
  s.px(9, 8, PAL.white, 0.5)
}

/** 齿轮 / 轴承。 */
function sGear(s, r) {
  const cx = 10
  const cy = 10
  const R = 6.5 + r()
  s.disc(cx, cy, R + 1.4, PAL.steelDark)
  // 齿
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    s.rect(cx + Math.cos(a) * (R + 0.6) - 1, cy + Math.sin(a) * (R + 0.6) - 1, 2.6, 2.6, PAL.steelDark)
  }
  s.disc(cx, cy, R, PAL.steel)
  s.disc(cx - 0.8, cy - 0.8, R - 1.4, PAL.steelLight)
  s.disc(cx, cy, R - 2.4, PAL.steelDark)
  // 轴孔
  s.disc(cx, cy, 1.8, PAL.void)
  s.px(cx - 1, cy - 1, PAL.oilSheen)
  s.px(cx + 3, cy - 4, PAL.steelWhite, 0.9)
  s.speck(cx - 6, cy - 6, 13, 13, PAL.rustDark, 0.1)
}

/** 电路板（主板）。 */
function sBoard(s, r) {
  s.rect(2, 5, 16, 11, PAL.toxicDark)
  s.rect(3, 6, 14, 9, PAL.mossDead)
  // 走线
  s.line(4, 8, 9, 8, PAL.sand, 0.7)
  s.line(9, 8, 9, 12, PAL.sand, 0.7)
  s.line(4, 11, 12, 11, PAL.sand, 0.5)
  s.line(12, 7, 12, 14, PAL.sand, 0.5)
  // 芯片
  s.rect(5, 9, 4, 3, PAL.ash)
  s.rect(11, 8, 3, 4, PAL.ash)
  s.px(5, 9, PAL.steelLight)
  // 金手指
  for (let k = 0; k < 5; k++) s.rect(4 + k * 2, 14, 1, 2, PAL.ochre)
  // 电容
  s.px(14, 7, PAL.neonWarm)
  s.px(7, 7, PAL.steelLight)
  s.glow(14, 7, 3, PAL.neonWarm, 0.25)
}

/** 内存条 / 光模块。 */
function sRam(s, r) {
  s.rect(2, 8, 16, 6, PAL.toxicDark)
  s.rect(3, 9, 14, 4, PAL.steelDark)
  for (let k = 0; k < 4; k++) s.rect(4 + k * 3, 9, 2, 2, PAL.ash)
  for (let k = 0; k < 6; k++) s.rect(3 + k * 2, 13, 1, 2, PAL.ochre)
  s.line(3, 9, 16, 9, PAL.steelLight, 0.7)
  s.px(14, 10, PAL.neon)
  s.glow(14, 10, 3, PAL.neon, 0.3)
  s.rect(15, 11, 1, 1, PAL.neonWarm)
}

/** 光模块 / 镜头。 */
function sLens(s, r) {
  const cx = 10
  const cy = 10
  s.disc(cx, cy, 7, PAL.steelDark)
  s.disc(cx, cy, 6, PAL.steel)
  s.disc(cx, cy, 4.4, PAL.glass)
  s.disc(cx, cy, 3, PAL.neonCold)
  s.disc(cx, cy, 1.6, PAL.white)
  s.px(cx - 3, cy - 3, PAL.white, 0.9)
  s.line(cx - 3, cy + 3, cx + 3, cy - 3, PAL.white, 0.35)
  s.glow(cx, cy, 8, PAL.neonCold, 0.35)
  // 外壳螺口
  s.rect(cx - 2, cy + 6, 4, 2, PAL.steelLight)
}

/** 伺服 / 陀螺仪（带轴）。 */
function sServo(s, r) {
  s.rect(4, 6, 12, 10, PAL.steelDark)
  s.rect(5, 7, 10, 8, PAL.steel)
  s.rect(5, 7, 10, 2, PAL.steelLight)
  s.disc(10, 7, 2.4, PAL.steelDark)
  s.rect(9, 2, 2, 5, PAL.steelLight)
  s.rect(9, 1, 2, 1, PAL.sand)
  s.rect(5, 12, 10, 1, PAL.rust)
  s.px(7, 10, PAL.neonWarm)
  s.px(12, 10, PAL.steelWhite)
}

/** 电池 / 电源。 */
function sCell(s, r) {
  const col = r() < 0.5 ? PAL.toxicDark : PAL.steelDark
  s.rect(4, 5, 12, 13, col)
  s.rect(5, 6, 10, 11, PAL.steel)
  s.rect(5, 8, 10, 6, PAL.toxic)
  s.rect(5, 9, 10, 2, PAL.toxicGlow, 0.7)
  // 电极
  s.rect(8, 3, 4, 2, PAL.steelLight)
  s.rect(9, 2, 2, 1, PAL.steelWhite)
  // 闪电
  s.line(9, 8, 7, 11, PAL.void, 0.8)
  s.line(7, 11, 10, 11, PAL.void, 0.8)
  s.line(10, 11, 8, 14, PAL.void, 0.8)
  s.glow(10, 11, 7, PAL.toxicGlow, 0.25)
  s.rect(4, 17, 12, 1, PAL.steelDark)
}

/** 维修包 / 医疗箱。 */
function sMedkit(s, r) {
  s.rect(3, 7, 14, 10, PAL.steelDark)
  s.rect(4, 8, 12, 8, PAL.sand)
  s.rect(4, 8, 12, 1, PAL.white, 0.7)
  // 红十字
  s.rect(9, 10, 2, 5, PAL.blood)
  s.rect(7, 12, 6, 2, PAL.blood)
  s.px(10, 11, PAL.danger, 0.8)
  // 提手 + 锁扣
  s.rect(7, 4, 6, 2, PAL.steelLight)
  s.rect(7, 5, 1, 2, PAL.steelLight)
  s.rect(12, 5, 1, 2, PAL.steelLight)
  s.rect(4, 15, 12, 1, PAL.sandDark)
  s.px(5, 9, PAL.rust)
}

/** 罐 / 喷雾。 */
function sCan(s, r) {
  s.rect(6, 5, 8, 13, PAL.steel)
  s.rect(6, 5, 8, 1, PAL.steelLight)
  s.rect(6, 7, 8, 5, PAL.rust)
  s.rect(7, 8, 6, 3, PAL.rustLight, 0.7)
  s.rect(8, 2, 4, 3, PAL.steelDark)
  s.rect(11, 3, 3, 1, PAL.steelLight)
  s.px(13, 3, PAL.toxic)
  s.rect(6, 17, 8, 1, PAL.steelDark)
  s.line(7, 13, 13, 13, PAL.sand, 0.5)
}

/** 日记 / 书。 */
function sBook(s, r) {
  const cover = r() < 0.5 ? PAL.rustDark : PAL.bloodDark
  s.poly(
    [
      [4, 5],
      [16, 4],
      [16, 16],
      [4, 17],
      [3, 11],
    ],
    cover,
  )
  s.poly(
    [
      [6, 6],
      [15, 5.5],
      [15, 15],
      [6, 15.5],
    ],
    PAL.paper,
  )
  s.line(7, 8, 13, 8, PAL.ink, 0.55)
  s.line(7, 10, 13, 10, PAL.ink, 0.5)
  s.line(7, 12, 11, 12, PAL.ink, 0.45)
  s.line(4, 5, 4, 17, PAL.sandDark, 0.6)
  s.px(15, 6, PAL.ochre)
}

/** 照片。 */
function sPhoto(s, r) {
  s.rect(3, 5, 14, 12, PAL.paper)
  s.rect(4, 6, 12, 9, PAL.sandDark)
  // 影像：两个模糊人形 + 天空
  s.rect(4, 6, 12, 4, PAL.ashPale, 0.8)
  s.ell(8, 12, 2, 3, PAL.boneDark, 0.9)
  s.ell(13, 12, 1.6, 2.6, PAL.boneDark, 0.9)
  s.px(9, 9, PAL.ink)
  s.px(13, 9, PAL.ink)
  // 折痕 / 污渍
  s.line(10, 6, 10, 14, PAL.ink, 0.25)
  s.px(4, 15, PAL.void, 0.5)
  s.speck(3, 5, 14, 12, PAL.rust, 0.1)
}

/** 戒指 / 首饰。 */
function sRing(s, r) {
  s.ell(10, 12, 5.5, 5, PAL.ochre)
  s.ell(10, 12, 4, 3.4, PAL.sand)
  s.ell(10, 12, 2.6, 2, PAL.void)
  // 宝石
  s.poly(
    [
      [10, 3],
      [13, 6],
      [10, 9],
      [7, 6],
    ],
    PAL.neonCold,
  )
  s.px(10, 5, PAL.white)
  s.line(8, 11, 11, 9, PAL.sandDark, 0.6)
  s.glow(10, 6, 6, PAL.neonCold, 0.22)
}

/** 衣物（叠好的外套）。 */
function sShirt(s, r) {
  s.poly(
    [
      [4, 8],
      [8, 5],
      [12, 5],
      [16, 8],
      [14, 12],
      [13, 11],
      [13, 16],
      [7, 16],
      [7, 11],
      [6, 12],
    ],
    PAL.dust,
  )
  s.poly(
    [
      [6, 9],
      [9, 7],
      [11, 7],
      [14, 9],
      [12, 11],
      [8, 11],
    ],
    PAL.dustLight,
  )
  s.line(7, 16, 13, 16, PAL.sandDark)
  s.line(9, 7, 10, 11, PAL.sandDark, 0.7)
  s.px(8, 8, PAL.void, 0.5)
  s.px(12, 14, PAL.void, 0.4)
}

/** 儿童玩具（铁皮机器人）。 */
function sToy(s, r) {
  s.rect(6, 6, 8, 8, PAL.rustLight)
  s.rect(7, 7, 6, 6, PAL.sand)
  s.rect(7, 3, 6, 3, PAL.rustLight)
  s.rect(8, 4, 4, 2, PAL.toxicDark)
  s.px(9, 4, PAL.neonWarm)
  s.px(10, 4, PAL.neonWarm)
  s.rect(4, 7, 2, 5, PAL.rust)
  s.rect(14, 7, 2, 5, PAL.rust)
  s.rect(7, 14, 2, 3, PAL.rustDark)
  s.rect(11, 14, 2, 3, PAL.rustDark)
  s.rect(8, 9, 4, 2, PAL.toxicDark)
  s.px(7, 7, PAL.rustDark)
}

/** 卡带（磁带）。 */
function sCassette(s, r) {
  s.rect(2, 7, 16, 8, PAL.ashPale)
  s.rect(3, 8, 14, 6, PAL.ash)
  s.rect(4, 9, 12, 3, PAL.sandDark)
  s.disc(7, 10.5, 1.6, PAL.void)
  s.disc(13, 10.5, 1.6, PAL.void)
  s.px(7, 10, PAL.steelLight)
  s.px(13, 10, PAL.steelLight)
  s.rect(4, 13, 12, 1, PAL.sand, 0.5)
  s.rect(5, 5, 4, 2, PAL.rust)
  s.px(15, 9, PAL.ochre)
}

/** 硬盘 / 数据块。 */
function sDrive(s, r) {
  s.rect(3, 6, 14, 10, PAL.steelDark)
  s.rect(4, 7, 12, 8, PAL.steel)
  s.disc(10, 11, 4, PAL.steelLight)
  s.disc(10, 11, 2.6, PAL.ashPale)
  s.disc(10, 11, 1, PAL.void)
  s.px(10, 9, PAL.steelWhite)
  s.line(4, 7, 15, 7, PAL.steelLight, 0.6)
  s.rect(4, 14, 12, 1, PAL.rustDark)
  s.px(5, 15, PAL.neon)
  s.px(7, 15, PAL.neon, 0.7)
  s.glow(6, 15, 4, PAL.neon, 0.25)
}

/** 纸条 / 记录。 */
function sNote(s, r) {
  s.poly(
    [
      [5, 3],
      [15, 4],
      [14, 17],
      [4, 16],
    ],
    PAL.paper,
  )
  s.line(6, 6, 13, 6.5, PAL.ink, 0.5)
  s.line(6, 9, 13, 9.5, PAL.ink, 0.45)
  s.line(6, 12, 11, 12.5, PAL.ink, 0.4)
  s.px(13, 15, PAL.rust, 0.5)
  s.line(5, 15, 14, 16, PAL.sandDark, 0.4)
}

/** 稀有核心（反应堆 / 外壳）。 */
function sCore(s, r) {
  s.disc(10, 10, 8, PAL.steelDark)
  s.disc(10, 10, 6.5, PAL.steel)
  s.disc(10, 10, 4.6, PAL.void)
  s.disc(10, 10, 3.2, PAL.toxic)
  s.disc(10, 10, 1.6, PAL.white)
  // 约束环
  s.line(3, 10, 5, 10, PAL.steelLight)
  s.line(15, 10, 17, 10, PAL.steelLight)
  s.line(10, 3, 10, 5, PAL.steelLight)
  s.line(10, 15, 10, 17, PAL.steelLight)
  s.glow(10, 10, 9, PAL.toxicGlow, 0.5)
}

/** 装甲板（稀有外壳）。 */
function sArmor(s, r) {
  s.poly(
    [
      [4, 4],
      [16, 4],
      [16, 12],
      [10, 17],
      [4, 12],
    ],
    PAL.steelDark,
  )
  s.poly(
    [
      [5.5, 5.5],
      [14.5, 5.5],
      [14.5, 11.5],
      [10, 15.5],
      [5.5, 11.5],
    ],
    PAL.steel,
  )
  s.poly(
    [
      [7, 7],
      [11, 7],
      [11, 10],
      [7, 12],
    ],
    PAL.steelLight,
  )
  s.line(8, 8, 13, 8, PAL.neonWarm, 0.8)
  s.px(13, 10, PAL.neonWarm)
  s.glow(12, 9, 5, PAL.neonWarm, 0.2)
  s.speck(4, 4, 12, 13, PAL.rust, 0.12)
}

/** 任务物品：胶囊 + 提示点。 */
function sQuest(s, r) {
  s.rect(5, 5, 10, 12, PAL.steelDark)
  s.rect(6, 6, 8, 10, PAL.rustLight)
  s.rect(6, 8, 8, 6, PAL.toxicDark)
  s.rect(7, 9, 6, 4, PAL.toxic)
  s.px(9, 10, PAL.white)
  s.px(10, 11, PAL.toxicGlow)
  s.rect(7, 3, 6, 2, PAL.steelLight)
  s.glow(10, 11, 8, PAL.toxicGlow, 0.35)
  // 标记
  s.px(16, 3, PAL.neonWarm)
  s.px(16, 4, PAL.neonWarm)
  s.px(16, 6, PAL.neonWarm)
}

/** 通用废料堆 / 兜底造型。 */
function sScrap(s, r) {
  const n = 3 + Math.floor(r() * 3)
  for (let k = 0; k < n; k++) {
    const x = 3 + r() * 12
    const y = 7 + r() * 9
    const w = 3 + r() * 4
    const h = 2 + r() * 3
    s.rect(x, y, w, h, r() < 0.5 ? PAL.steel : PAL.rust)
    s.px(x, y, PAL.steelLight)
  }
  s.px(6, 16, PAL.steelDark)
  s.px(14, 16, PAL.steelDark)
}

/** 工兵铲 / 镐（工具分类走这里的简化版）。 */
function sShovelIcon(s, r) {
  s.thick(4, 16, 12, 6, 1, PAL.rustDark)
  s.thick(4, 16, 12, 6, 0.55, PAL.dust)
  s.poly(
    [
      [12, 4],
      [17, 6],
      [16, 11],
      [13, 12],
      [11, 8],
    ],
    PAL.steelLight,
  )
  s.line(13, 5, 16, 7, PAL.steelWhite)
  s.px(13, 10, PAL.steelDark)
  s.rect(4, 16, 2, 1, PAL.steelDark)
}

function sPickIcon(s, r) {
  s.thick(10, 17, 10, 8, 1, PAL.rustDark)
  s.thick(10, 16, 10, 9, 0.5, PAL.dust)
  s.line(3, 8, 17, 5, PAL.steelLight)
  s.line(3, 9, 17, 6, PAL.steelDark)
  s.px(3, 8, PAL.steelWhite)
  s.px(17, 5, PAL.steelWhite)
  s.rect(9, 6, 3, 3, PAL.steelDark)
}

function sWelderIcon(s, r) {
  s.rect(5, 9, 8, 5, PAL.steel)
  s.rect(6, 10, 6, 3, PAL.steelDark)
  s.rect(13, 10, 3, 2, PAL.steelLight)
  s.rect(6, 14, 3, 3, PAL.steelDark)
  s.px(7, 8, PAL.rust)
  s.line(16, 8, 18, 6, PAL.neonCold)
  s.px(18, 6, PAL.white)
  s.glow(17, 7, 5, PAL.neonCold, 0.7)
}

function sScannerIcon(s, r) {
  s.rect(4, 8, 9, 8, PAL.steelDark)
  s.rect(5, 9, 7, 6, PAL.ash)
  s.rect(6, 10, 5, 3, PAL.toxicDark)
  s.rect(6, 11, 4, 1, PAL.toxicGlow)
  s.rect(12, 6, 4, 4, PAL.steel)
  s.px(14, 5, PAL.toxic)
  s.line(15, 4, 18, 2, PAL.toxicGlow, 0.6)
  s.glow(13, 6, 6, PAL.toxicGlow, 0.4)
}

function sMedIcon(s, r) {
  s.rect(4, 7, 12, 10, PAL.sand)
  s.rect(4, 7, 12, 1, PAL.white, 0.7)
  s.rect(9, 9, 2, 6, PAL.blood)
  s.rect(7, 11, 6, 2, PAL.blood)
  s.rect(7, 5, 6, 2, PAL.steelLight)
  s.rect(4, 16, 12, 1, PAL.sandDark)
}

const SHAPES = {
  ore: sOre,
  plate: sPlate,
  coil: sCoil,
  cloth: sCloth,
  bottle: sBottle,
  gear: sGear,
  board: sBoard,
  ram: sRam,
  lens: sLens,
  servo: sServo,
  cell: sCell,
  medkit: sMedkit,
  can: sCan,
  book: sBook,
  photo: sPhoto,
  ring: sRing,
  shirt: sShirt,
  toy: sToy,
  cassette: sCassette,
  drive: sDrive,
  note: sNote,
  core: sCore,
  armor: sArmor,
  quest: sQuest,
  scrap: sScrap,
  shovel: sShovelIcon,
  pickaxe: sPickIcon,
  welder: sWelderIcon,
  scanner: sScannerIcon,
  med: sMedIcon,
}

/** art 提示名 → 造型（内容表里 def.art 的约定值）。 */
const ART_HINTS = {
  ore: 'ore', chunk: 'ore', scrap: 'scrap', rock: 'ore', crystal: 'ore',
  plate: 'plate', shell: 'armor', armor: 'armor', panel: 'plate', frame: 'plate',
  coil: 'coil', cable: 'coil', wire: 'coil', rope: 'coil',
  cloth: 'cloth', rag: 'cloth', fabric: 'cloth', blanket: 'cloth',
  bottle: 'bottle', flask: 'bottle', vial: 'bottle', canister: 'can', can: 'can', spray: 'can',
  gear: 'gear', bearing: 'gear', cog: 'gear', servo: 'servo', motor: 'servo', gyro: 'servo',
  board: 'board', pcb: 'board', cpu: 'board', chip: 'ram', ram: 'ram', module: 'ram', opto: 'lens',
  lens: 'lens', optic: 'lens', sensor: 'lens',
  cell: 'cell', battery: 'cell', power: 'cell', pack: 'cell',
  medkit: 'medkit', kit: 'medkit', repair: 'medkit', med: 'med',
  book: 'book', diary: 'book', journal: 'book', letter: 'note', note: 'note', paper: 'note',
  photo: 'photo', picture: 'photo', ring: 'ring', jewelry: 'ring', pendant: 'ring',
  shirt: 'shirt', coat: 'shirt', clothes: 'shirt', cloth_article: 'shirt',
  toy: 'toy', doll: 'toy', robot: 'toy',
  cassette: 'cassette', tape: 'cassette', drive: 'drive', disk: 'drive', hdd: 'drive', data: 'drive',
  core: 'core', reactor: 'core', cell_core: 'core', quest: 'quest', key: 'quest', token: 'quest',
  shovel: 'shovel', pickaxe: 'pickaxe', pick: 'pickaxe', welder: 'welder', torch: 'welder', scanner: 'scanner',
}

/** 分类 → 造型池（无 art 提示时按 id 哈希选一个）。 */
const CATEGORY_POOL = {
  material: ['ore', 'plate', 'coil', 'cloth', 'scrap', 'bottle'],
  component: ['gear', 'board', 'ram', 'lens', 'servo', 'coil'],
  tool: ['shovel', 'pickaxe', 'welder', 'scanner', 'gear'],
  consumable: ['cell', 'medkit', 'bottle', 'can', 'med'],
  artifact: ['book', 'photo', 'ring', 'shirt', 'toy', 'note'],
  data: ['cassette', 'drive', 'note', 'ram'],
  rare: ['core', 'armor', 'lens', 'cell'],
  quest: ['quest', 'core', 'cassette'],
  _: ['scrap', 'ore', 'plate', 'gear', 'cell', 'note'],
}

const RARITY_COL = [PAL.dust, PAL.sand, PAL.ochre, PAL.neonWarm, PAL.neon]

/** 稀有度边框（画在最上层，不参与描边）。 */
function rarityFrame(s, rarity) {
  const r = Math.max(1, Math.min(5, rarity | 0))
  if (r <= 1) return
  const c = RARITY_COL[r - 1]
  const a = r >= 4 ? 0.85 : 0.6
  // 内框（1px，四边）
  s.line(1, 1, 18, 1, c, a)
  s.line(1, 18, 18, 18, c, a * 0.8)
  s.line(1, 1, 1, 18, c, a * 0.9)
  s.line(18, 1, 18, 18, c, a * 0.6)
  if (r >= 3) {
    // 四角加粗刻度
    for (const [x, y] of [
      [1, 1],
      [18, 1],
      [1, 18],
      [18, 18],
    ]) {
      s.px(x, y, shade(c, 0.35))
      s.px(x + (x === 1 ? 1 : -1), y, c)
      s.px(x, y + (y === 1 ? 1 : -1), c)
    }
  }
  if (r >= 4) {
    // 星点
    s.px(4, 3, PAL.white, 0.8)
    s.px(15, 4, PAL.white, 0.6)
    s.px(3, 15, PAL.white, 0.5)
  }
}

/* ============================================================================
 * 3. 组装一张物品图标
 * ========================================================================== */

const ITEM_CACHE = new Map()
const CAT_CACHE = new Map()
const CATEGORIES = ['material', 'component', 'tool', 'consumable', 'artifact', 'data', 'rare', 'quest']
/** 兜底造型池：全部造型（未知 id 的图标因此很少重复）。 */
const ALL_SHAPES = Object.keys(SHAPES)

function pickShape(def, id, seed) {
  const rnd = mulberry32(seed)
  const hint = def && typeof def.art === 'string' ? def.art.toLowerCase() : ''
  if (hint && ART_HINTS[hint]) return ART_HINTS[hint]
  if (hint && SHAPES[hint]) return hint
  const cat = (def && def.category) || ''
  // 有分类：分类池；无分类（未知 id / mod 物品）：全部造型，
  // 这样不同 id 的兜底图标几乎不会重复。
  const pool = CATEGORY_POOL[cat] || ALL_SHAPES
  const a = Math.floor(rnd() * pool.length)
  return pool[a % pool.length]
}

function buildItem(id) {
  const def = Content.get(KIND.ITEM, id)
  const seed = fnv(String(id))
  const rarity = Math.max(1, Math.min(5, (def && def.rarity) || 1 + (seed % 5)))
  const shape = pickShape(def, id, seed)
  const s = new Surf(20, 20, seed)
  // 投影（极轻，贴底）
  s.shadow(10, 18, 7, 1.4, 0.28)
  const fn = SHAPES[shape] || sScrap
  fn(s, s.rng)
  // 细节：锈 / 划痕（确定性）
  s.speck(2, 2, 16, 16, PAL.rustDark, 0.05 + ((seed >>> 8) % 5) * 0.01, 0.35)
  // 三层：上缘高光 / 下缘暗部 / 1px 描边
  s.edges(mix(PAL.white, PAL.sand, 0.5), PAL.void, 0.4, 0.45)
  s.outline(mix(PAL.void, PAL.steel, 0.18))
  rarityFrame(s, rarity)
  const tex = s.tex()
  tex.userData.itemId = id
  tex.userData.shape = shape
  tex.userData.rarity = rarity
  tex.userData.category = (def && def.category) || null
  if (rarity >= 5) {
    // 5 星：极轻的外发光（画在合成之后，不影响描边）
    const g = new Surf(20, 20, seed ^ 0x77)
    g.glow(10, 10, 9.5, PAL.neon, 0.16)
    // 直接叠到已有画布：重新合成一遍
    const canvas = tex.image
    const ctx = canvas.getContext('2d')
    if (ctx && ctx.putImageData && ctx.createImageData) {
      const img = ctx.createImageData(20, 20)
      // 读取原图？没有 getImageData 的 mock 环境下跳过
      if (ctx.getImageData) {
        const base = ctx.getImageData(0, 0, 20, 20)
        for (let k = 0; k < base.data.length; k += 4) {
          const a = base.data[k + 3] / 255
          const ga = g.d[k + 3] / 255
          const oa = ga + a * (1 - ga)
          if (oa <= 0) continue
          img.data[k] = (g.d[k] * ga + base.data[k] * a * (1 - ga)) / oa
          img.data[k + 1] = (g.d[k + 1] * ga + base.data[k + 1] * a * (1 - ga)) / oa
          img.data[k + 2] = (g.d[k + 2] * ga + base.data[k + 2] * a * (1 - ga)) / oa
          img.data[k + 3] = oa * 255
        }
        ctx.putImageData(img, 0, 0)
        tex.needsUpdate = true
      }
    }
  }
  return tex
}

/**
 * 物品图标（20×20）。
 * 未知 id：内容表没有时用 id 哈希稳定推导造型 / 稀有度，同一 id 永远同一张图。
 */
// （返回的 texture.userData.cleanAlpha = true；alpha 仅 0/255，无半透明脏边）
export function getItemArt(itemId) {
  const key = String(itemId == null ? '' : itemId)
  let tex = ITEM_CACHE.get(key)
  if (!tex) {
    tex = buildItem(key)
    ITEM_CACHE.set(key, tex)
  }
  return tex
}

/* ============================================================================
 * 4. 分类图标（16×16）
 * ========================================================================== */

function catMaterial(s) {
  s.poly(
    [
      [3, 10],
      [6, 4],
      [11, 3],
      [14, 6],
      [13, 12],
      [7, 14],
      [3, 12],
    ],
    PAL.steel,
  )
  s.poly(
    [
      [5, 9],
      [7, 5],
      [11, 4],
      [12, 7],
      [11, 11],
      [7, 12],
    ],
    PAL.steelLight,
  )
  s.line(5, 12, 12, 5, PAL.rust, 0.9)
  s.px(7, 6, PAL.steelWhite)
}

function catComponent(s) {
  s.disc(8, 8, 5.6, PAL.steelDark)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    s.rect(8 + Math.cos(a) * 6 - 1, 8 + Math.sin(a) * 6 - 1, 2.4, 2.4, PAL.steelDark)
  }
  s.disc(8, 8, 4.6, PAL.steel)
  s.disc(8, 8, 2.8, PAL.steelLight)
  s.disc(8, 8, 1.4, PAL.void)
  s.px(6, 5, PAL.steelWhite)
}

function catTool(s) {
  s.thick(3, 13, 10, 4, 1, PAL.rustDark)
  s.thick(3, 13, 10, 4, 0.5, PAL.dust)
  s.poly(
    [
      [9, 3],
      [14, 4],
      [13, 8],
      [10, 9],
      [8, 6],
    ],
    PAL.steelLight,
  )
  s.line(10, 4, 13, 5, PAL.steelWhite)
  s.px(4, 14, PAL.steelDark)
}

function catConsumable(s) {
  s.rect(4, 6, 8, 8, PAL.steel)
  s.rect(5, 7, 6, 6, PAL.toxic)
  s.rect(5, 8, 6, 2, PAL.toxicGlow, 0.7)
  s.rect(6, 3, 4, 2, PAL.steelLight)
  s.rect(6, 14, 4, 1, PAL.steelDark)
  s.glow(8, 9, 6, PAL.toxicGlow, 0.25)
}

function catArtifact(s) {
  s.poly(
    [
      [3, 4],
      [13, 3],
      [13, 13],
      [3, 14],
    ],
    PAL.rustDark,
  )
  s.poly(
    [
      [5, 5],
      [12, 4.5],
      [12, 12],
      [5, 12.5],
    ],
    PAL.paper,
  )
  s.line(6, 7, 11, 7, PAL.ink, 0.55)
  s.line(6, 9, 11, 9, PAL.ink, 0.5)
  s.line(6, 11, 9, 11, PAL.ink, 0.45)
  s.px(3, 4, PAL.ochre)
}

function catData(s) {
  s.rect(2, 5, 12, 7, PAL.ashPale)
  s.rect(3, 6, 10, 5, PAL.ash)
  s.disc(6, 8.5, 1.3, PAL.void)
  s.disc(10, 8.5, 1.3, PAL.void)
  s.px(6, 8, PAL.steelLight)
  s.px(10, 8, PAL.steelLight)
  s.rect(9, 2, 4, 3, PAL.steelDark)
  s.px(12, 3, PAL.neon)
  s.glow(11, 3, 4, PAL.neon, 0.3)
}

function catRare(s) {
  s.disc(8, 8, 6.4, PAL.steelDark)
  s.disc(8, 8, 5, PAL.steel)
  s.disc(8, 8, 3.4, PAL.void)
  s.disc(8, 8, 2.2, PAL.neonWarm)
  s.disc(8, 8, 1, PAL.white)
  s.line(2, 8, 4, 8, PAL.steelLight)
  s.line(12, 8, 14, 8, PAL.steelLight)
  s.glow(8, 8, 7.5, PAL.neonWarm, 0.45)
}

function catQuest(s) {
  s.rect(4, 5, 8, 9, PAL.rustLight)
  s.rect(5, 7, 6, 5, PAL.toxicDark)
  s.rect(6, 8, 4, 3, PAL.toxic)
  s.px(7, 9, PAL.white)
  s.rect(6, 3, 4, 2, PAL.steelLight)
  s.px(13, 2, PAL.neonWarm)
  s.px(13, 3, PAL.neonWarm)
  s.px(13, 5, PAL.neonWarm)
  s.glow(9, 10, 7, PAL.toxicGlow, 0.3)
}

const CAT_DRAW = {
  material: catMaterial,
  component: catComponent,
  tool: catTool,
  consumable: catConsumable,
  artifact: catArtifact,
  data: catData,
  rare: catRare,
  quest: catQuest,
}

/** 分类图标（16×16）：背包筛选标签、掉落物提示用。 */
// （同样 cleanAlpha = true；alpha 仅 0/255）
export function getCategoryIcon(category) {
  const key = String(category || '').toLowerCase()
  let tex = CAT_CACHE.get(key)
  if (tex) return tex
  const s = new Surf(16, 16, fnv('cat:' + key))
  const fn = CAT_DRAW[key] || catMaterial
  s.shadow(8, 14.5, 5.5, 1.2, 0.26)
  fn(s)
  s.edges(mix(PAL.white, PAL.sand, 0.5), PAL.void, 0.4, 0.45)
  s.outline(mix(PAL.void, PAL.steel, 0.2))
  tex = s.tex()
  tex.userData.category = key
  CAT_CACHE.set(key, tex)
  return tex
}

/* ============================================================================
 * 5. 预载 / 调试
 * ========================================================================== */

/** 预载：分类图标 +（若内容表已注册）全部物品图标。 */
export function preloadArt() {
  for (const c of CATEGORIES) getCategoryIcon(c)
  let n = 0
  for (const def of Content.all(KIND.ITEM)) {
    if (!def || !def.id) continue
    getItemArt(def.id)
    n++
  }
  return { categories: CATEGORIES.length, items: n }
}

/** 已构建的图标数量（调试 / 内存检查用）。 */
export function artCacheStats() {
  return { items: ITEM_CACHE.size, categories: CAT_CACHE.size }
}

/** 清空缓存（改内容表后热重载用）。 */
export function clearArtCache() {
  ITEM_CACHE.clear()
  CAT_CACHE.clear()
}

export const ITEM_ART_CATEGORIES = CATEGORIES
