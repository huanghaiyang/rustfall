// ============================================================================
// 锈雨 · RUSTFALL —— 工具图标（TOOL ART）
// ----------------------------------------------------------------------------
// 契约：
//   export function getToolArt(toolId) -> THREE.CanvasTexture  // 20×20
//
// tool：shovel 工兵铲 / pickaxe 镐 / welder 焊枪（电弧）/ scanner 扫描仪（绿光）
// 全部透明底、1px 暗描边、上缘高光、下缘暗部；同 id 返回同一实例。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32 } from '../rng.js'
import { Surf, mix, shade, rgb, setArtModule, ALPHA_STATS } from './core.js'
setArtModule('tools')

/* ============================================================================
 * 1. 像素表面
 * ========================================================================== */


/* ============================================================================
 * 2. 四把工具
 * ========================================================================== */

/** 工兵铲：木柄 + 折叠铲头（右下），带磨损与泥。 */
function drawShovel(s) {
  s.shadow(10, 18.5, 6.5, 1.3, 0.26)
  // 木柄（斜向）
  s.thick(3, 16, 12, 5, 1.5, PAL.rustDark)
  s.thick(3, 16, 12, 5, 0.9, PAL.dust)
  s.line(4, 15, 12, 5, PAL.sandDark, 0.55)
  // 握把缠布
  for (let k = 0; k < 3; k++) s.rect(3 + k * 1.2, 15 - k * 1.6, 3, 1, PAL.rust, 0.8)
  // 铲头（三角 + 折边）
  s.poly(
    [
      [12, 3],
      [17, 6],
      [17, 13],
      [14, 16],
      [11, 13],
      [11, 7],
    ],
    PAL.steelDark,
  )
  s.poly(
    [
      [12.5, 4.5],
      [16, 7],
      [16, 12],
      [14, 14.5],
      [12, 12],
      [12, 8],
    ],
    PAL.steelLight,
  )
  // 高光棱 / 使用痕迹
  s.line(13, 5, 15.5, 7, PAL.steelWhite, 0.9)
  s.line(13, 6, 13, 13, PAL.steelWhite, 0.35)
  s.px(15, 12, PAL.rustDark, 0.8)
  s.px(14, 9, PAL.steel, 0.7)
  // 铲刃上的泥
  s.px(14, 15, PAL.dust, 0.8)
  s.px(13, 15, PAL.rust, 0.6)
  // 铆接
  s.px(12, 8, PAL.steelDark)
  s.px(12, 11, PAL.steelDark)
}

/** 镐：木柄 + 双尖镐头（上弧）。 */
function drawPickaxe(s) {
  s.shadow(10, 18.5, 6, 1.3, 0.26)
  // 柄
  s.thick(10, 17, 10, 7, 1.4, PAL.rustDark)
  s.thick(10, 17, 10, 7, 0.85, PAL.dust)
  s.line(10, 16, 10, 8, PAL.sandDark, 0.5)
  // 镐头（横跨的弯梁）
  s.line(3, 7, 17, 5, PAL.steelDark)
  s.line(3, 6, 17, 4, PAL.steelLight)
  s.line(4, 6, 16, 4.4, PAL.steelWhite, 0.5)
  // 两端尖
  s.poly(
    [
      [3, 6],
      [1, 8],
      [4, 9],
      [5, 7],
    ],
    PAL.steelLight,
  )
  s.poly(
    [
      [17, 4],
      [19, 5],
      [18, 8],
      [16, 7],
    ],
    PAL.steelLight,
  )
  s.px(1, 8, PAL.steelWhite)
  s.px(19, 5, PAL.steelWhite)
  // 头部固定箍
  s.rect(8, 5, 5, 4, PAL.steelDark)
  s.rect(9, 6, 3, 2, PAL.steel)
  s.px(10, 6, PAL.rustHot, 0.8)
  // 锈 / 缺口
  s.px(6, 6, PAL.rust)
  s.px(14, 5, PAL.rustDark)
  s.px(16, 5, PAL.void, 0.7)
}

/** 焊枪：枪身 + 电极 + 电弧（青白），握把朝下。 */
function drawWelder(s) {
  s.shadow(10, 18.5, 6, 1.3, 0.24)
  // 枪身
  s.poly(
    [
      [5, 8],
      [15, 7],
      [16, 11],
      [6, 12],
    ],
    PAL.steel,
  )
  s.rect(5, 8, 11, 1, PAL.steelLight)
  s.rect(6, 10, 9, 1, PAL.steelDark)
  // 握把
  s.poly(
    [
      [7, 12],
      [11, 12],
      [10, 17],
      [6, 17],
    ],
    PAL.ashPale,
  )
  s.line(7, 13, 6, 16, PAL.steelDark, 0.8)
  for (let k = 0; k < 2; k++) s.px(8, 14 + k * 2, PAL.steelDark, 0.7)
  // 散热孔
  for (let k = 0; k < 3; k++) s.px(7 + k * 2, 9, PAL.steelDark, 0.8)
  // 喷嘴
  s.rect(15, 8, 3, 2, PAL.steelDark)
  s.rect(17, 8, 2, 2, PAL.steelLight)
  // 电极 / 电弧
  s.line(18, 9, 19, 7, PAL.neonCold)
  s.px(19, 7, PAL.white)
  s.px(19, 6, PAL.neonCold, 0.8)
  s.px(18, 5, PAL.neonCold, 0.5)
  s.glow(19, 7, 5.5, PAL.neonCold, 0.8)
  // 软管（从枪尾绕到下方）
  s.thick(5, 9, 2, 12, 0.9, PAL.oil)
  s.thick(5, 9, 2, 12, 0.45, PAL.oilSheen, 0.7)
  s.px(2, 13, PAL.rust)
  // 指示灯
  s.px(6, 9, PAL.neonWarm, 0.9)
  s.glow(6, 9, 3, PAL.neonWarm, 0.3)
  // 烧灼痕 / 锈
  s.px(14, 10, PAL.rustDark, 0.8)
  s.speck(5, 7, 11, 5, PAL.rust, 0.08, 0.5)
}

/** 扫描仪：手持终端 + 绿色扫描束 + 波纹。 */
function drawScanner(s) {
  s.shadow(9, 18.5, 6, 1.3, 0.24)
  // 机身
  s.poly(
    [
      [4, 8],
      [12, 7],
      [13, 15],
      [5, 16],
    ],
    PAL.steelDark,
  )
  s.poly(
    [
      [5, 9],
      [11, 8],
      [12, 14],
      [6, 15],
    ],
    PAL.ash,
  )
  // 屏幕（绿光）
  s.rect(6, 10, 5, 3, PAL.black)
  s.rect(6, 10, 5, 1, PAL.toxicDark)
  s.rect(7, 11, 2, 1, PAL.toxicGlow, 0.9)
  s.rect(10, 12, 1, 1, PAL.toxic, 0.7)
  // 屏幕扫描线
  s.px(9, 10, PAL.toxicGlow, 0.5)
  // 手柄 / 按键
  s.rect(4, 12, 2, 5, PAL.steelDark)
  s.px(5, 12, PAL.neonWarm, 0.9)
  // 天线 / 探头（朝右上）
  s.line(12, 7, 16, 4, PAL.steelLight)
  s.rect(15, 2, 3, 3, PAL.steel)
  s.px(16, 3, PAL.toxicGlow)
  // 扫描束（锥形 + 波纹，加色）
  s.poly(
    [
      [16, 4],
      [19, 2],
      [19, 7],
      [16, 5],
    ],
    PAL.toxicGlow,
    0.25,
  )
  for (let k = 0; k < 3; k++) {
    const r = 2 + k * 1.6
    s.px(17 + k, 4 - k, PAL.toxicGlow, 0.5 - k * 0.1)
    s.px(17 + k, 4 + k, PAL.toxicGlow, 0.5 - k * 0.1)
  }
  s.glow(16, 4, 7, PAL.toxicGlow, 0.6)
  s.glow(8, 11, 6, PAL.toxicGlow, 0.25)
  // 外壳磨损 / 贴纸
  s.px(11, 9, PAL.rust, 0.7)
  s.px(5, 10, PAL.steelLight, 0.6)
  s.speck(4, 7, 10, 9, PAL.rustDark, 0.08, 0.5)
}

const TOOLS = {
  shovel: { draw: drawShovel, seed: 0x501 },
  pickaxe: { draw: drawPickaxe, seed: 0x502 },
  welder: { draw: drawWelder, seed: 0x503 },
  scanner: { draw: drawScanner, seed: 0x504 },
}

export const TOOL_ART_IDS = ['shovel', 'pickaxe', 'welder', 'scanner']

const CACHE = new Map()

/** 工具图标（20×20）。未知 id 退回工兵铲（不会返回空）。 */
// （返回的 texture.userData.cleanAlpha = true；alpha 仅 0/255，无半透明脏边）
export function getToolArt(toolId) {
  const key = String(toolId || '')
  let tex = CACHE.get(key)
  if (tex) return tex
  const def = TOOLS[key] || TOOLS.shovel
  const s = new Surf(20, 20, def.seed)
  def.draw(s)
  // 统一收尾
  s.speck(0, 0, 20, 20, PAL.rustDark, 0.04, 0.4)
  s.edges(mix(PAL.white, PAL.sand, 0.5), PAL.void, 0.4, 0.42)
  s.outline(mix(PAL.void, PAL.steel, 0.18))
  tex = s.tex()
  tex.userData.toolId = TOOLS[key] ? key : 'shovel'
  CACHE.set(key, tex)
  return tex
}

/** 预载四把工具。 */
export function preloadArt() {
  for (const id of TOOL_ART_IDS) getToolArt(id)
  return CACHE.size
}

/** 清缓存。 */
export function clearToolCache() {
  CACHE.clear()
}
