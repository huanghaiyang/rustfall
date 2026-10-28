// 锈雨 · RUSTFALL —— 570 件关卡专属收集品的图标绘制
// ----------------------------------------------------------------------------
// 每件收集品在数据里带一份 iconSpec：{ shape, motif, variant, mark, frame }。
//   shape   —— 32 种遗物外形（每种的剪影完全不同）
//   motif   —— 27 种材质/来源（决定配色与表面细节）
//   variant —— 0..3，改变外形细节（孔位/齿数/折角/绑带位置），剪影也随之变化
//   mark    —— 8 种使用痕迹（印章/划痕/铆钉/微光/封蜡/蚀刻/缺口/裂纹）
//   frame   —— 3/4/5，稀有度装饰角标
// 输出仍是 20×20 的 Surf；不依赖任何外部图片，alpha 由 Surf.tex() 统一二值化。
// 所有随机量都由 id + iconSpec 派生，同一件收集品每次画出来完全一致。

import { PAL } from '../palette.js'
import { mix, mulberry32 } from './core.js'

/* ============================================================================
 * 1. 材质配色（27 种 motif）
 * ========================================================================== */

const MAT = {
  copper: { main: mix(PAL.ochre, PAL.rustHot, 0.4), lite: PAL.rustLight, dark: PAL.rustDeep, accent: PAL.neonWarm, shine: PAL.white },
  glass: { main: mix(PAL.glass, PAL.skyDusk, 0.35), lite: PAL.steelWhite, dark: PAL.steelBlue, accent: PAL.neonCold, shine: PAL.white },
  silver: { main: PAL.steelLight, lite: PAL.steelWhite, dark: PAL.steelDark, accent: PAL.neonCold, shine: PAL.white },
  ash: { main: PAL.ash, lite: PAL.ashLight, dark: PAL.ashPale, accent: PAL.dust, shine: PAL.ashPale },
  paper: { main: PAL.paper, lite: PAL.white, dark: PAL.dustLight, accent: PAL.ink, shine: PAL.white },
  ceramic: { main: mix(PAL.bone, PAL.steelBlue, 0.2), lite: PAL.bone, dark: PAL.boneDark, accent: PAL.water, shine: PAL.white },
  water: { main: PAL.water, lite: PAL.waterHi, dark: PAL.waterDeep, accent: PAL.waterFoam, shine: PAL.white },
  rust: { main: PAL.rust, lite: PAL.rustLight, dark: PAL.rustDeep, accent: PAL.rustHot, shine: PAL.sand },
  fuel: { main: mix(PAL.oil, PAL.warn, 0.25), lite: PAL.oilSheen, dark: PAL.oil, accent: PAL.warn, shine: PAL.steelWhite },
  circuit: { main: mix(PAL.steelDark, PAL.neonCold, 0.3), lite: PAL.steelBlue, dark: PAL.void1, accent: PAL.neonCold, shine: PAL.neon },
  gold: { main: mix(PAL.ochre, PAL.white, 0.3), lite: PAL.sand, dark: PAL.ochre, accent: PAL.neonWarm, shine: PAL.white },
  bone: { main: PAL.bone, lite: PAL.bone, dark: PAL.boneDark, accent: PAL.boneDeep, shine: PAL.white },
  cloth: { main: mix(PAL.ash, PAL.dust, 0.35), lite: PAL.dustLight, dark: PAL.ashPale, accent: PAL.rustHot, shine: PAL.ashLight },
  moss: { main: PAL.moss, lite: PAL.mossHi, dark: PAL.mossDead, accent: PAL.weed, shine: PAL.mossHi },
  blood: { main: PAL.blood, lite: PAL.blood, dark: PAL.bloodDark, accent: PAL.danger, shine: PAL.rustHot },
  ink: { main: PAL.ink, lite: PAL.steelDark, dark: PAL.void1, accent: PAL.ink, shine: PAL.steelBlue },
  stone: { main: PAL.stone, lite: PAL.stoneLit, dark: PAL.stoneDark, accent: PAL.stoneEdge, shine: PAL.stoneEdge },
  rubber: { main: mix(PAL.ashPale, PAL.void, 0.45), lite: PAL.ash, dark: PAL.void1, accent: PAL.steelDark, shine: PAL.ashLight },
  medical: { main: mix(PAL.paper, PAL.toxicGlow, 0.12), lite: PAL.white, dark: PAL.steelBlue, accent: PAL.toxicGlow, shine: PAL.white },
  steel: { main: PAL.steel, lite: PAL.steelLight, dark: PAL.steelDark, accent: PAL.neonCold, shine: PAL.steelWhite },
  wood: { main: mix(PAL.rust, PAL.sandDark, 0.55), lite: PAL.sand, dark: PAL.rustDeep, accent: PAL.ochre, shine: PAL.sand },
  toxic: { main: PAL.toxic, lite: PAL.toxicGlow, dark: PAL.toxicDark, accent: PAL.acid, shine: PAL.toxicGlow },
  uranium: { main: mix(PAL.toxicDark, PAL.mossDead, 0.4), lite: PAL.toxic, dark: PAL.void1, accent: PAL.toxicGlow, shine: PAL.acid },
  wax: { main: mix(PAL.paper, PAL.ochre, 0.25), lite: PAL.white, dark: PAL.sandDark, accent: PAL.ochre, shine: PAL.white },
  brass: { main: mix(PAL.ochre, PAL.sand, 0.5), lite: PAL.sand, dark: PAL.rustDeep, accent: PAL.neonWarm, shine: PAL.white },
  oil: { main: PAL.oil, lite: PAL.oilSheen, dark: PAL.void1, accent: PAL.warn, shine: PAL.oilSheen },
  plastic: { main: mix(PAL.steelBlue, PAL.water, 0.25), lite: PAL.steelLight, dark: PAL.steelDark, accent: PAL.neonCold, shine: PAL.steelWhite },
}

/* ============================================================================
 * 2. 上下文
 * ========================================================================== */

function hashStr(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) || 1
}

function makeCtx(spec, def) {
  const sp = spec || {}
  const seed = hashStr(
    `${(def && def.id) || 'relic'}|${sp.shape || 'tag'}|${sp.motif || 'steel'}|${sp.variant | 0}|${sp.mark || 'etch'}|${sp.frame | 0}`,
  )
  const rnd = mulberry32(seed)
  const m = MAT[sp.motif] || MAT.steel
  return {
    seed,
    rnd,
    m,
    v: (((sp.variant | 0) % 4) + 4) % 4,
    mark: sp.mark || 'etch',
    frame: sp.frame | 0,
    shape: sp.shape || 'tag',
    spec: sp,
    def: def || null,
  }
}

/* ============================================================================
 * 3. 公共零件
 * ========================================================================== */

/** 实心块 + 上缘高光 / 下缘暗部（不改变剪影）。 */
function slab(s, x, y, w, h, g) {
  s.rect(x, y, w, h, g.m.main)
  s.line(x, y + 0.4, x + w - 1, y + 0.4, g.m.lite, 0.85)
  s.line(x, y + h - 0.6, x + w - 1, y + h - 0.6, g.m.dark, 0.9)
}

/** 斜角块（左上-右下倒角），用于铭牌 / 卡片 / 屏。 */
function bevel(s, x, y, w, h, g, cut = 2) {
  s.poly(
    [
      [x + cut, y],
      [x + w - 1, y],
      [x + w - 1, y + h - 1 - cut],
      [x + w - 1 - cut, y + h - 1],
      [x, y + h - 1],
      [x, y + cut],
    ],
    g.m.main,
  )
  s.line(x + cut, y + 0.5, x + w - 2, y + 0.5, g.m.lite, 0.8)
  s.line(x + 1, y + 1, x + 1, y + h - 2 - cut, g.m.lite, 0.5)
  s.line(x + w - 1.5, y + 1, x + w - 1.5, y + h - 2 - cut, g.m.dark, 0.7)
  s.line(x + w - 2 - cut, y + h - 1.5, x + 1, y + h - 1.5, g.m.dark, 0.8)
}

/** 圆片（带高光/暗部）。 */
function coinDisc(s, cx, cy, r, g) {
  s.disc(cx, cy, r, g.m.main)
  s.disc(cx - r * 0.22, cy - r * 0.26, r * 0.55, g.m.lite, 0.55)
  s.disc(cx + r * 0.18, cy + r * 0.3, r * 0.5, g.m.dark, 0.35)
  s.disc(cx, cy, Math.max(0.8, r * 0.16), g.m.accent, 0.9)
}

/** 铆钉 / 螺钉。 */
function rivet(s, x, y, c) {
  s.px(x, y, c)
  s.px(x + 1, y, mix(c, PAL.white, 0.4))
  s.px(x, y + 1, mix(c, PAL.void, 0.35))
}

/** 小孔（装饰孔，画成深色而不是真的镂空，保证 20px 下仍读得出）。 */
function hole(s, x, y, r, g) {
  s.disc(x, y, r, g.m.dark)
  s.px(x - r * 0.4, y - r * 0.4, PAL.void)
}

/* ============================================================================
 * 4. 32 种外形
 * ========================================================================== */

/** 铭牌：吊牌 + 穿孔 + 系绳。 */
function shapeTag(s, g) {
  const v = g.v
  bevel(s, 4, v % 2 ? 6 : 5, 11, 9, g, 2)
  hole(s, v % 2 ? 6 : 5.5, v % 2 ? 8 : 7, 1.1, g)
  if (v === 1 || v === 3) s.line(4.5, 6.5, 2.5, 3.5, g.m.dark, 0.9)
  else s.line(5.5, 5.5, 8, 2.6, g.m.dark, 0.9)
  s.line(7, 10, 13, 10, g.m.lite, 0.6)
  s.line(7, 12, 11, 12, g.m.lite, 0.45)
  s.rect(11, 9, 2, 2, g.m.accent, 0.8)
}

/** 徽章：盾形 + 中部星徽。 */
function shapeBadge(s, g) {
  const w = g.v % 2 ? 12 : 11
  const x = 10 - w / 2
  s.poly(
    [
      [x + 1, 4],
      [x + w - 1, 4],
      [x + w - 1, 10],
      [10, 16],
      [x, 10],
      [x, 5],
    ],
    g.m.main,
  )
  s.line(x + 1.5, 4.5, x + w - 1.5, 4.5, g.m.lite, 0.8)
  s.line(x + w - 1.5, 4.5, x + w - 1.5, 9.5, g.m.dark, 0.6)
  s.line(x + 1.5, 5, x + 1.5, 9.5, g.m.lite, 0.5)
  // 星
  const cy = 8
  s.px(10, cy - 2, g.m.accent)
  s.line(10, cy - 2, 10, cy + 1, g.m.accent)
  s.line(8, cy - 0.5, 12, cy - 0.5, g.m.accent)
  s.line(8.6, cy + 1.4, 11.4, cy - 1.6, g.m.accent)
  s.line(8.6, cy - 1.6, 11.4, cy + 1.4, g.m.accent)
  if (g.v >= 2) s.line(x + 2, 12.5, 18 - x - 2, 12.5, g.m.lite, 0.5)
}

/** 怀表：表盘 + 上下表带 + 表冠。 */
function shapeWatch(s, g) {
  s.rect(8, 3, 4, 3, g.m.dark)
  s.rect(8, 14, 4, 3, g.m.dark)
  s.line(9, 3.5, 11, 3.5, g.m.lite, 0.7)
  s.line(9, 14.5, 11, 14.5, g.m.lite, 0.7)
  coinDisc(s, 10, 10, 4.4, g)
  s.disc(10, 10, 3.2, g.m.shine, 0.12)
  s.line(10, 10, 10, 7, g.m.ink || PAL.ink, 0.9)
  s.line(10, 10, 12.2, 10.8, g.m.accent, 0.9)
  if (g.v % 2) s.px(10, 2, g.m.accent)
  else s.line(12.5, 4.5, 14, 3.5, g.m.lite, 0.7)
}

/** 臂环：环形带 + 搭扣。 */
function shapeBand(s, g) {
  const r = g.v % 2 ? 6 : 5.4
  s.disc(10, 10, r, g.m.main)
  s.disc(10, 10, r * 0.55, g.m.dark)
  s.disc(10, 10, r * 0.42, PAL.void, 0.85)
  s.line(10 - r * 0.7, 7.5, 10 + r * 0.7, 7.5, g.m.lite, 0.6)
  s.rect(13, 8, 3, 3, g.m.dark)
  rivet(s, 14, 9, g.m.lite)
  if (g.v >= 2) s.line(5, 13, 7, 12, g.m.accent, 0.7)
}

/** 号角：弯曲锥体 + 喇叭口。 */
function shapeHorn(s, g) {
  s.poly(
    [
      [3, 12],
      [5, 9],
      [11, 6],
      [15, 5],
      [16, 8],
      [12, 9],
      [6, 13],
    ],
    g.m.main,
  )
  s.line(5, 9.5, 12, 6.5, g.m.lite, 0.7)
  s.line(4, 12.5, 11, 9.2, g.m.dark, 0.5)
  s.disc(15.2, 6.6, 2.3, g.m.lite)
  s.disc(15.2, 6.6, 1.2, g.m.dark)
  s.line(4.2, 11.5, 6.5, 14.5, g.m.dark, 0.8)
  if (g.v) s.line(9, 8.5, 9, 12, g.m.dark, 0.6)
  if (g.v >= 2) s.line(12, 7, 14, 10, g.m.accent, 0.6)
}

/** 书：硬壳 + 书脊 + 页缘。 */
function shapeBook(s, g) {
  const w = g.v % 2 ? 12 : 10
  const x = 10 - w / 2
  slab(s, x, 4, w, 12, g)
  s.rect(x, 4, 2.4, 12, g.m.dark)
  s.line(x + 2.4, 4.5, x + 2.4, 15.5, g.m.lite, 0.6)
  for (let i = 0; i < 3; i++) s.line(x + 4, 6.5 + i * 2.5, x + w - 1.5, 6.5 + i * 2.5, g.m.shine, 0.45)
  s.rect(x + 4, 12.5, 3, 1.6, g.m.accent, 0.75)
  rivet(s, x + w - 1.5, 5.5, g.m.lite)
}

/** 钟：钟体 + 下唇 + 钟舌。 */
function shapeBell(s, g) {
  const w = g.v % 2 ? 10 : 9
  s.poly(
    [
      [10 - w * 0.3, 5],
      [10, 3.4],
      [10 + w * 0.3, 5],
      [10 + w * 0.45, 12],
      [10 + w * 0.55, 14],
      [10 - w * 0.55, 14],
      [10 - w * 0.45, 12],
    ],
    g.m.main,
  )
  s.line(10 - w * 0.3, 5.5, 10 + w * 0.3, 5.5, g.m.lite, 0.8)
  s.line(10 + w * 0.32, 6, 10 + w * 0.45, 12, g.m.dark, 0.7)
  s.rect(10 - w * 0.62, 13.6, w * 1.24, 1.6, g.m.dark)
  s.disc(10, 15.6, 1.1, g.m.accent)
  s.px(10, 2.6, g.m.lite)
  if (g.v >= 2) s.line(10 - w * 0.25, 7, 10 + w * 0.25, 7, g.m.accent, 0.5)
}

/** 印章：底座 + 立柱 + 握球。 */
function shapeStamp(s, g) {
  slab(s, 4, 14, 12, 3, g)
  s.rect(7, 8, 6, 6, g.m.main)
  s.line(7.5, 8.5, 12.5, 8.5, g.m.lite, 0.75)
  s.line(13, 9, 13, 13, g.m.dark, 0.6)
  s.rect(8.5, 4, 3, 4, g.m.dark)
  s.disc(10, 3.6, 2, g.m.main)
  s.disc(9.4, 3.1, 1, g.m.lite, 0.7)
  if (g.v % 2) rivet(s, 5.5, 15, g.m.lite)
  if (g.v >= 2) s.line(4.5, 16.5, 15.5, 16.5, g.m.accent, 0.6)
}

/** 硬币：双圈 + 中心纹章。 */
function shapeCoin(s, g) {
  coinDisc(s, 10, 10, g.v % 2 ? 6 : 5.4, g)
  const r = g.v % 2 ? 6 : 5.4
  s.disc(10, 10, r * 0.72, g.m.dark, 0.35)
  s.disc(10, 10, r * 0.6, g.m.main)
  // 纹章：竖线 + 横线组成简易符号
  s.line(10, 6.5, 10, 13.5, g.m.accent, 0.9)
  s.line(7.2, 9.2, 12.8, 9.2, g.m.accent, 0.9)
  s.line(7.6, 12, 12.4, 12, g.m.lite, 0.6)
  s.disc(10, 10, 0.8, g.m.shine)
}

/** 戒指：环 + 宝石。 */
function shapeRing(s, g) {
  const r = g.v % 2 ? 5 : 4.4
  s.disc(10, 11, r, g.m.main)
  s.disc(10, 11, r * 0.62, g.m.dark)
  s.disc(10, 11, r * 0.46, PAL.void, 0.85)
  s.line(10 - r * 0.75, 8.6, 10 + r * 0.75, 8.6, g.m.lite, 0.65)
  // 宝石
  const gy = g.v % 2 ? 4.6 : 5.2
  s.poly(
    [
      [10, gy - 1.6],
      [12.2, gy],
      [10, gy + 2],
      [7.8, gy],
    ],
    g.m.accent,
  )
  s.px(9.4, gy - 0.2, g.m.shine)
  s.px(10.4, gy + 0.8, mix(g.m.accent, PAL.void, 0.3))
}

/** 钥匙：环柄 + 杆 + 齿。 */
function shapeKey(s, g) {
  const r = g.v % 2 ? 3.4 : 3
  s.disc(6.2, 7, r, g.m.main)
  s.disc(6.2, 7, r * 0.5, g.m.dark)
  s.disc(6.2, 7, r * 0.3, PAL.void, 0.8)
  s.thick(8.6, 7.2, 16, 7.2, 1.1, g.m.main)
  s.line(9, 6.4, 15.4, 6.4, g.m.lite, 0.6)
  s.rect(13, 8, 1.6, 2.6, g.m.main)
  s.rect(15, 8, 1.4, 2, g.m.main)
  if (g.v >= 2) s.rect(13, 4.4, 1.6, 2.4, g.m.main)
  s.rect(15.4, 7, 0.8, 2, g.m.lite, 0.7)
  s.px(6.2, 5.2, g.m.accent)
}

/** 地图：折页 + 路线。 */
function shapeMap(s, g) {
  const fold = g.v % 2 ? 6.5 : 7.5
  s.poly(
    [
      [3.5, 5],
      [fold, 4],
      [fold, 15],
      [3.5, 16],
    ],
    g.m.main,
  )
  s.poly(
    [
      [fold, 4],
      [12.5, 5],
      [12.5, 16],
      [fold, 15],
    ],
    g.m.dark,
  )
  s.poly(
    [
      [12.5, 5],
      [16.5, 4.4],
      [16.5, 15.4],
      [12.5, 16],
    ],
    g.m.main,
  )
  s.line(fold, 4.4, fold, 15.2, g.m.lite, 0.7)
  s.line(12.5, 5, 12.5, 15.6, g.m.lite, 0.5)
  // 路线（虚线）+ 终点
  s.line(5, 12, 7.5, 10, g.m.accent, 0.8)
  s.line(7.5, 10, 9, 11.5, g.m.accent, 0.8)
  s.line(9, 11.5, 12, 8, g.m.accent, 0.8)
  s.px(14.5, 7.5, g.m.accent)
  s.line(13.5, 12.5, 15.5, 12.5, g.m.shine, 0.4)
}

/** 齿轮：盘 + 齿。 */
function shapeGear(s, g) {
  const teeth = 8 + g.v * 2
  coinDisc(s, 10, 10, 4.4, g)
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const x0 = 10 + Math.cos(a) * 3.8
    const y0 = 10 + Math.sin(a) * 3.8
    const x1 = 10 + Math.cos(a) * 6.2
    const y1 = 10 + Math.sin(a) * 6.2
    s.thick(x0, y0, x1, y1, 1.1, g.m.main)
    s.px(x1, y1, g.m.lite)
  }
  s.disc(10, 10, 1.8, g.m.dark)
  s.disc(10, 10, 1.1, PAL.void, 0.8)
  s.px(9, 8.6, g.m.accent)
}

/** 文件：纸页 + 折角 + 印章。 */
function shapePaper(s, g) {
  slab(s, 5, 3.5, 10, 14, g)
  const fold = g.v % 2 ? 3 : 2.4
  s.poly(
    [
      [15 - fold, 3.5],
      [15, 3.5],
      [15, 3.5 + fold],
    ],
    g.m.dark,
  )
  s.line(6.5, 7, 13, 7, g.m.ink || PAL.ink, 0.6)
  s.line(6.5, 9.5, 13, 9.5, g.m.ink || PAL.ink, 0.55)
  s.line(6.5, 12, 11.5, 12, g.m.ink || PAL.ink, 0.45)
  s.rect(11, 13, 2.4, 2.4, g.m.accent, 0.85)
  if (g.v >= 2) s.line(5.5, 16.5, 14.5, 16.5, g.m.dark, 0.5)
}

/** 天平：立柱 + 横梁 + 两盘。 */
function shapeScale(s, g) {
  s.line(10, 6, 10, 16, g.m.main)
  s.line(10, 16, 6.5, 16.5, g.m.dark)
  s.line(10, 16, 13.5, 16.5, g.m.dark)
  s.line(4, 6, 16, 6, g.m.main)
  s.line(4.5, 5.4, 15.5, 5.4, g.m.lite, 0.7)
  s.px(10, 5, g.m.accent)
  const tilt = g.v % 2 ? 1 : -1
  s.line(4, 6.5, 4, 9 + tilt, g.m.dark, 0.8)
  s.line(16, 6.5, 16, 9 - tilt, g.m.dark, 0.8)
  s.ell(4, 10 + tilt, 2.6, 1.2, g.m.main)
  s.ell(16, 10 - tilt, 2.6, 1.2, g.m.main)
  s.line(14, 8.5, 18, 8.5, g.m.lite, 0.4)
  if (g.v >= 2) s.disc(10, 4, 1.1, g.m.lite)
}

/** 装甲板：圆角板 + 四角铆钉。 */
function shapePlate(s, g) {
  const w = g.v % 2 ? 12 : 11
  const h = g.v >= 2 ? 11 : 10
  bevel(s, 10 - w / 2, 10 - h / 2, w, h, g, 2)
  s.line(10 - w / 2 + 2, 10 - h / 2 + 2, 10 + w / 2 - 2, 10 - h / 2 + 2, g.m.lite, 0.5)
  rivet(s, 10 - w / 2 + 1.5, 10 - h / 2 + 1.5, g.m.lite)
  rivet(s, 10 + w / 2 - 2.5, 10 - h / 2 + 1.5, g.m.lite)
  rivet(s, 10 - w / 2 + 1.5, 10 + h / 2 - 2.5, g.m.lite)
  rivet(s, 10 + w / 2 - 2.5, 10 + h / 2 - 2.5, g.m.lite)
  s.rect(9, 9, 2.5, 2.5, g.m.accent, 0.8)
}

/** 卡片：证件 / 扑克牌。 */
function shapeCard(s, g) {
  bevel(s, 4, 5, 12, 11, g, 1.5)
  s.rect(6, 7, 3.4, 3.2, g.m.dark)
  s.line(10.5, 7.5, 14, 7.5, g.m.lite, 0.7)
  s.line(10.5, 9.5, 14, 9.5, g.m.ink || PAL.ink, 0.5)
  s.line(6, 12.5, 14, 12.5, g.m.ink || PAL.ink, 0.4)
  s.rect(11, 13.5, 3, 1.4, g.m.accent, 0.8)
  if (g.v % 2) s.px(5.2, 5.8, g.m.shine)
  else s.line(5, 14.5, 7.5, 14.5, g.m.dark, 0.6)
}

/** 磁带：外壳 + 双卷。 */
function shapeTape(s, g) {
  bevel(s, 3.5, 6, 13, 9, g, 1.5)
  s.disc(7.5, 10.5, 2.6, g.m.dark)
  s.disc(12.5, 10.5, 2.6, g.m.dark)
  s.disc(7.5, 10.5, 1.4, g.m.main)
  s.disc(12.5, 10.5, 1.4, g.m.main)
  s.disc(7.5, 10.5, 0.5, PAL.void)
  s.disc(12.5, 10.5, 0.5, PAL.void)
  s.line(9.8, 12.8, 10.2, 12.8, g.m.lite, 0.7)
  s.rect(8, 6.5, 4, 1.2, g.m.accent, 0.7)
  if (g.v % 2) s.rect(5, 13.4, 2, 1.2, g.m.dark)
  if (g.v >= 2) s.rect(13, 13.4, 2, 1.2, g.m.dark)
}

/** 光盘：盘面 + 中心孔 + 反光。 */
function shapeDisc(s, g) {
  coinDisc(s, 10, 10, g.v % 2 ? 6.2 : 5.6, g)
  s.disc(10, 10, 2, g.m.dark)
  s.disc(10, 10, 1.2, PAL.void, 0.9)
  s.disc(10, 10, 1.4, g.m.lite, 0.35)
  // 反光弧
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.42
    s.px(10 + Math.cos(a) * 4.6, 10 + Math.sin(a) * 4.6, g.m.shine)
  }
  if (g.v >= 2) s.px(10 + Math.cos(-1.4) * 4.2, 10 + Math.sin(-1.4) * 4.2, g.m.accent)
}

/** 面具：脸壳 + 双眼孔 + 滤罐。 */
function shapeMask(s, g) {
  s.ell(10, 9.5, 5.4, 6.4, g.m.main)
  s.ell(10, 8.5, 4.6, 4.2, g.m.lite, 0.32)
  s.ell(10, 11, 4, 4.4, g.m.dark, 0.22)
  // 眼
  s.disc(7.6, 8.4, 1.7, g.m.dark)
  s.disc(12.4, 8.4, 1.7, g.m.dark)
  s.px(7.4, 8.1, g.m.accent)
  s.px(12.2, 8.1, g.m.accent)
  // 呼吸格栅
  for (let i = 0; i < 3; i++) s.line(8.4, 12 + i * 1.2, 11.6, 12 + i * 1.2, g.m.lite, 0.45)
  if (g.v % 2) s.disc(15, 12, 1.9, g.m.dark)
  else s.disc(5, 12, 1.9, g.m.dark)
  s.line(4.6, 4.2, 10, 2.8, g.m.dark, 0.6)
}

/** 獠牙：弯齿 + 牙根。 */
function shapeTooth(s, g) {
  s.poly(
    [
      [6.5, 4],
      [13.5, 4],
      [12.5, 10],
      [10.4, 16],
      [8.5, 10],
    ],
    g.m.main,
  )
  s.line(7, 4.5, 12.8, 4.5, g.m.lite, 0.8)
  s.line(12.2, 5, 9.6, 15, g.m.dark, 0.55)
  s.poly(
    [
      [6, 3],
      [14, 3],
      [13.4, 5.4],
      [6.6, 5.4],
    ],
    g.m.dark,
  )
  s.line(8, 8, 10, 8.4, g.m.dark, 0.5)
  if (g.v >= 2) s.line(9.4, 11, 10.8, 11.4, g.m.accent, 0.6)
  if (g.v % 2) s.px(12.6, 6.2, g.m.accent)
}

/** 屏幕：显像管 + 支架。 */
function shapeScreen(s, g) {
  slab(s, 3.5, 4.5, 13, 10, g)
  s.rect(5, 6, 10, 7, PAL.void1)
  s.line(6, 7, 13.5, 7, g.m.accent, 0.55)
  s.line(6, 10, 12, 10, g.m.accent, 0.4)
  s.line(6, 12, 9, 12, g.m.accent, 0.3)
  s.rect(5, 6, 10, 0.8, g.m.dark, 0.5)
  s.rect(8, 14.5, 4, 2, g.m.dark)
  s.line(6.5, 16.5, 13.5, 16.5, g.m.dark)
  s.px(15.4, 5.4, g.m.shine)
  if (g.v % 2) s.line(6, 13.4, 9, 13.4, g.m.lite, 0.5)
}

/** 刀片：刃 + 护手 + 柄。 */
function shapeBlade(s, g) {
  const len = g.v % 2 ? 10 : 9
  s.poly(
    [
      [4, 7],
      [4 + len, 4],
      [4 + len, 6.5],
      [5.5, 10],
    ],
    g.m.main,
  )
  s.line(5, 6.6, 4 + len - 1, 4.6, g.m.lite, 0.8)
  s.line(5.5, 9, 4 + len - 1, 6.4, g.m.dark, 0.6)
  s.rect(3, 9.5, 10, 1.4, g.m.dark)
  s.rect(3.5, 11, 3, 5, g.m.main)
  s.line(4, 11.4, 4, 15.5, g.m.lite, 0.5)
  s.line(3.5, 12.4, 6.5, 12.4, g.m.dark, 0.4)
  if (g.v >= 2) s.px(4 + len - 2, 5.2, g.m.accent)
}

/** 夹子：回形夹 / 装订夹。 */
function shapeClip(s, g) {
  const w = g.v % 2 ? 5 : 6
  s.thick(5, 4.5, 14, 4.5, 1.2, g.m.main)
  s.thick(5, 6.5, 14, 6.5, 1.2, g.m.main)
  s.thick(5, 4.5, 5, 14, 1.2, g.m.main)
  s.thick(14, 4.5, 14, 14, 1.2, g.m.main)
  s.line(5.8, 5, 13.4, 5, g.m.lite, 0.6)
  s.rect(8, 8, w, 4, g.m.dark)
  s.rect(8.5, 8.6, w - 1, 2.8, g.m.main)
  if (g.v >= 2) s.rect(8, 12, 4, 1.2, g.m.accent)
  s.px(5, 14.5, g.m.dark)
}

/** 手柄：握把 + 尾环。 */
function shapeHandle(s, g) {
  s.thick(6, 14, 6, 5, 2, g.m.main)
  s.thick(6.4, 4, 12, 9, 1.6, g.m.main)
  s.line(5.2, 13, 6.8, 13, g.m.lite, 0.5)
  for (let i = 0; i < 3 + (g.v % 2); i++) s.line(4.8, 12 - i * 2.2, 7.2, 11.4 - i * 2.2, g.m.dark, 0.7)
  s.disc(6.2, 3.6, 1.8, g.m.dark)
  s.disc(6.2, 3.6, 1, PAL.void, 0.8)
  s.rect(10.5, 9.5, 2.4, 1.6, g.m.accent, 0.85)
  if (g.v >= 2) rivet(s, 12.5, 8, g.m.lite)
}

/** 勋章：绶带 + 圆章。 */
function shapeMedal(s, g) {
  s.poly(
    [
      [7.5, 2.5],
      [10, 6],
      [12.5, 2.5],
      [13.5, 7],
      [10, 12],
      [6.5, 7],
    ],
    g.m.dark,
  )
  s.line(8, 3, 9.6, 6.5, g.m.lite, 0.5)
  s.line(12, 3, 10.4, 6.5, g.m.lite, 0.5)
  coinDisc(s, 10, 11.5, g.v % 2 ? 4.4 : 4, g)
  s.disc(10, 11.5, 2.4, g.m.dark, 0.35)
  s.px(10, 9.5, g.m.accent)
  s.line(10, 9.5, 10, 13, g.m.accent)
  s.line(8.6, 11, 11.4, 11, g.m.accent)
  if (g.v >= 2) s.disc(10, 11.5, 0.7, g.m.shine)
}

/** 塞子：软木塞 + 颈环。 */
function shapeStopper(s, g) {
  s.poly(
    [
      [7, 4],
      [13, 4],
      [12.2, 10.5],
      [7.8, 10.5],
    ],
    g.m.main,
  )
  s.line(7.4, 4.5, 12.6, 4.5, g.m.lite, 0.8)
  s.line(12.4, 5, 11.8, 10, g.m.dark, 0.6)
  s.rect(6.5, 10.5, 7, 2.4, g.m.dark)
  s.line(7, 11, 13, 11, g.m.lite, 0.55)
  s.rect(7.5, 12.8, 5, 2.2, g.m.main, 0.85)
  if (g.v % 2) s.line(9, 13.4, 11, 13.4, g.m.accent, 0.7)
  s.px(8.2, 5.4, g.m.accent)
}

/** 提灯：灯体 + 提梁 + 火。 */
function shapeLamp(s, g) {
  s.thick(5, 5, 10, 2.8, 0.8, g.m.dark)
  s.thick(10, 2.8, 15, 5, 0.8, g.m.dark)
  slab(s, 5, 5.5, 10, 8, g)
  s.rect(6.5, 6.5, 7, 6, PAL.void1, 0.85)
  s.poly(
    [
      [10, 7],
      [11.4, 9.6],
      [10, 12],
      [8.6, 9.6],
    ],
    g.m.accent,
  )
  s.px(10, 9.6, g.m.shine)
  s.rect(5.5, 13.5, 9, 2, g.m.dark)
  s.line(6, 14, 14, 14, g.m.lite, 0.5)
  if (g.v % 2) s.rect(8, 15.5, 4, 1.2, g.m.main)
  if (g.v >= 2) s.line(7, 6, 7, 12.5, g.m.lite, 0.4)
}

/** 布贴：不规则布片 + 缝线。 */
function shapePatch(s, g) {
  const bump = g.v % 2 ? 1 : 0
  s.poly(
    [
      [4.5, 5],
      [9, 3.6],
      [15, 5.2 + bump],
      [15.6, 10],
      [13.5, 15.2],
      [6.5, 15.6],
      [4.2, 11],
    ],
    g.m.main,
  )
  s.line(6, 5.2, 13.6, 5.8, g.m.lite, 0.6)
  s.line(13.8, 6.2, 14.8, 13.8, g.m.dark, 0.55)
  // 缝线
  for (let i = 0; i < 4; i++) s.px(5 + i * 2.4, 5 + (g.v % 2 ? 0.6 : 1), g.m.shine)
  for (let i = 0; i < 3; i++) s.px(6, 7.5 + i * 2.2, g.m.shine)
  s.rect(9, 9, 3, 3, g.m.accent, 0.7)
  if (g.v >= 2) s.line(7.5, 13.5, 12, 13.5, g.m.dark, 0.5)
}

/** 卫星：主体 + 两侧太阳翼 + 天线。 */
function shapeSatellite(s, g) {
  slab(s, 8, 7, 4.5, 6, g)
  s.rect(2.5, 8, 4.5, 3.4, g.m.dark)
  s.rect(13, 8, 4.5, 3.4, g.m.dark)
  for (let i = 0; i < 2; i++) {
    s.line(3, 8.6 + i * 1.6, 6.6, 8.6 + i * 1.6, g.m.accent, 0.6)
    s.line(13.4, 8.6 + i * 1.6, 17, 8.6 + i * 1.6, g.m.accent, 0.6)
  }
  s.line(10, 7, 10, 4, g.m.main)
  s.disc(10, 3.2, 1.3, g.m.lite)
  s.disc(10, 3.2, 0.6, g.m.dark)
  s.rect(9, 13, 2, 2, g.m.dark)
  if (g.v % 2) s.line(11.5, 13.5, 13, 15.5, g.m.lite, 0.5)
  if (g.v >= 2) s.px(8.6, 8, g.m.accent)
}

/** 轮：轮圈 + 辐条 + 轴。 */
function shapeWheel(s, g) {
  const r = g.v % 2 ? 6.2 : 5.6
  s.disc(10, 10, r, g.m.main)
  s.disc(10, 10, r - 1.6, g.m.dark)
  s.disc(10, 10, r - 2.4, PAL.void, 0.8)
  const spokes = 5 + (g.v % 2)
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3
    s.line(10, 10, 10 + Math.cos(a) * (r - 1), 10 + Math.sin(a) * (r - 1), g.m.main)
  }
  s.disc(10, 10, 1.4, g.m.lite)
  s.disc(10, 10, 0.7, PAL.void)
  s.line(10 - r, 7, 10 + r, 7, g.m.lite, 0.25)
}

/** 药瓶：瓶身 + 瓶颈 + 塞。 */
function shapeBottle(s, g) {
  const w = g.v % 2 ? 8 : 7
  s.rect(10 - w / 2, 7, w, 9, g.m.main)
  s.rect(10 - w / 2, 7, w, 2.6, g.m.dark, 0.5)
  s.rect(8.8, 4.5, 2.4, 3, g.m.main)
  s.rect(8.4, 3, 3.2, 1.8, g.m.dark)
  s.line(6.5, 8, 6.5, 15, g.m.lite, 0.55)
  s.line(13.2, 8, 13.2, 15, g.m.dark, 0.45)
  s.rect(7.6, 10.5, w - 1.2, 2.4, g.m.accent, 0.55)
  s.rect(7.6, 14, w - 1.2, 1.2, g.m.shine, 0.4)
  if (g.v >= 2) s.px(9.6, 12, g.m.shine)
}

const SHAPES = {
  tag: shapeTag,
  badge: shapeBadge,
  watch: shapeWatch,
  band: shapeBand,
  horn: shapeHorn,
  book: shapeBook,
  bell: shapeBell,
  stamp: shapeStamp,
  coin: shapeCoin,
  ring: shapeRing,
  key: shapeKey,
  map: shapeMap,
  gear: shapeGear,
  paper: shapePaper,
  scale: shapeScale,
  plate: shapePlate,
  card: shapeCard,
  tape: shapeTape,
  disc: shapeDisc,
  mask: shapeMask,
  tooth: shapeTooth,
  screen: shapeScreen,
  blade: shapeBlade,
  clip: shapeClip,
  handle: shapeHandle,
  medal: shapeMedal,
  stopper: shapeStopper,
  lamp: shapeLamp,
  patch: shapePatch,
  satellite: shapeSatellite,
  wheel: shapeWheel,
  bottle: shapeBottle,
}

/* ============================================================================
 * 5. 材质细节（按 motif 分组，只在已有像素上做纹理，不改剪影）
 * ========================================================================== */

function motifDetail(s, g) {
  const m = g.spec.motif || 'steel'
  const r = g.m
  if (m === 'wood') {
    for (let i = 0; i < 3; i++) s.line(5, 7 + i * 3, 14, 6.6 + i * 3, r.dark, 0.35)
  } else if (m === 'circuit' || m === 'silver' || m === 'steel' || m === 'plastic') {
    s.line(6, 6, 8, 6, r.accent, 0.4)
    s.line(8, 6, 8, 8, r.accent, 0.4)
    s.px(8, 8, r.accent)
    s.px(13, 13, r.accent, 0.7)
  } else if (m === 'glass' || m === 'water' || m === 'medical') {
    s.line(6, 6, 8, 4.6, PAL.white, 0.6)
    s.px(12, 5, PAL.white, 0.5)
  } else if (m === 'cloth' || m === 'paper' || m === 'wax') {
    s.line(5, 9, 6, 12, r.dark, 0.3)
    s.line(13, 7, 14, 11, r.dark, 0.25)
  } else if (m === 'bone') {
    s.line(6, 8, 9, 11, r.dark, 0.45)
    s.line(9, 11, 8, 13, r.dark, 0.35)
  } else if (m === 'moss' || m === 'toxic' || m === 'uranium') {
    s.px(6, 14, r.accent, 0.6)
    s.px(13, 6, r.accent, 0.5)
    s.px(7, 6, r.accent, 0.4)
  } else if (m === 'blood' || m === 'rust' || m === 'copper' || m === 'brass' || m === 'gold') {
    s.px(6, 13, r.accent, 0.5)
    s.px(13, 7, r.accent, 0.4)
  } else if (m === 'stone' || m === 'ceramic') {
    s.line(6, 7, 7, 10, r.dark, 0.3)
    s.line(11, 12, 13, 13, r.dark, 0.25)
  } else if (m === 'rubber' || m === 'oil' || m === 'fuel' || m === 'ink') {
    s.line(6, 6, 13, 6, r.lite, 0.2)
    s.px(6, 13, r.accent, 0.4)
  } else if (m === 'ash') {
    s.px(7, 8, r.dark, 0.4)
    s.px(12, 12, r.dark, 0.35)
  }
}

/* ============================================================================
 * 6. 使用痕迹（8 种 mark）
 * ========================================================================== */

function markOf(s, g) {
  const m = g.m
  const k = g.mark
  if (k === 'stamp') {
    s.rect(11.5, 12.5, 3, 3, m.accent, 0.85)
    s.px(12.5, 13.2, m.shine, 0.9)
    s.line(11.5, 14, 14.5, 14, PAL.void, 0.5)
  } else if (k === 'scratches') {
    s.line(5, 13, 9, 9, m.shine, 0.5)
    s.line(6, 14.5, 10, 10.5, m.shine, 0.35)
    s.line(12, 15, 15, 12, m.shine, 0.3)
  } else if (k === 'rivet') {
    rivet(s, 5.5, 6, m.lite)
    rivet(s, 13.5, 6, m.lite)
    rivet(s, 5.5, 13.5, m.lite)
  } else if (k === 'glow') {
    s.glow(10, 10, 5.5, m.accent, 0.5)
    s.px(10, 6, m.shine, 0.9)
  } else if (k === 'seal') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      s.px(10 + Math.cos(a) * 5.2, 10 + Math.sin(a) * 5.2, m.accent, 0.8)
    }
    s.px(10, 10, m.accent, 0.7)
  } else if (k === 'etch') {
    s.line(6, 12, 8, 10, m.accent, 0.6)
    s.line(8, 10, 10, 12, m.accent, 0.6)
    s.line(10, 12, 12, 10, m.accent, 0.6)
    s.line(12, 10, 14, 12, m.accent, 0.6)
  } else if (k === 'notch') {
    s.poly(
      [
        [4, 4],
        [7, 4],
        [4, 7],
      ],
      PAL.void,
      0.9,
    )
    s.line(4, 7, 7, 4, m.lite, 0.5)
  } else {
    // crack
    s.line(7, 6, 9, 9, PAL.void, 0.7)
    s.line(9, 9, 8, 11, PAL.void, 0.7)
    s.line(8, 11, 11, 14, PAL.void, 0.6)
    s.px(9, 9, m.shine, 0.5)
  }
}

/* ============================================================================
 * 7. 稀有度角标（frame 3 / 4 / 5）
 * ========================================================================== */

function frameMark(s, g) {
  const f = g.frame
  if (f < 3) return
  const c = f >= 5 ? PAL.neonWarm : f === 4 ? PAL.steelWhite : PAL.ochre
  const p = 2
  s.px(p, p, c, 0.85)
  s.px(19 - p, p, c, 0.85)
  s.px(p, 19 - p, c, 0.6)
  s.px(19 - p, 19 - p, c, 0.6)
  if (f >= 5) {
    s.px(10, 2, c, 0.7)
    s.px(10, 17, c, 0.5)
  }
}

/* ============================================================================
 * 8. 公开入口
 * ========================================================================== */

/**
 * 画一件关卡专属收集品的 20×20 图标。
 * @param {import('./core.js').Surf} s 目标表面（items.js 传入 20×20）
 * @param {object} iconSpec { shape, motif, variant, mark, frame }
 * @param {object} [def] 收集品定义（用 id 参与种子，保证同一件永远一致）
 */
export function paintCollectibleIcon(s, iconSpec, def) {
  if (!s) return
  const g = makeCtx(iconSpec, def)
  const fn = SHAPES[g.shape] || shapeTag
  fn(s, g)
  motifDetail(s, g)
  markOf(s, g)
  frameMark(s, g)
  // 底部接触阴影（与外层 items.js 的投影叠加也不突兀）
  s.shadow(10, 17.4, 6, 1.1, 0.22)
}

/** 供外部统计/图鉴使用的形状清单。 */
export const COLLECTIBLE_ICON_SHAPES = Object.keys(SHAPES)
