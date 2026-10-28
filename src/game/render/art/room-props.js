// ============================================================================
// 锈雨 · RUSTFALL —— 房间专属摆放物（ROOM PROP）程序化像素美术
// ----------------------------------------------------------------------------
// 本模块只做一件事：把 rooms/index.js 里的 ROOM_PROP_DEFS（1900 个 kind，
// 每个 kind 带 art: { base, pal, variant, parts, wear, tilt, glow, detail }）
// 翻译成 190 × 10 张“各不相同”的像素贴图。
//
//   · 全部纯程序化：没有任何外部图片 / fetch / Image 加载；每个像素都由
//     Surf 的确定性 PRNG + FNV(kind) 种子现场生成，同 kind 永远同一张图。
//   · alpha 严格二值：只使用 Surf 的实心图元（rect/poly/line/thick/ell/
//     disc/speck/edges/outline/shadow/glow），不直接碰 ctx，也不写半透明填充。
//   · 朝右、底部居中：每个 base 都在 (w/2, h-2) 处贴地，主体占满 w×h。
//
//   为什么 export 里必须 lazy: true
//   --------------------------------
//   1900 张贴图如果启动时全部 tex() 化，会产生 1900 个 canvas + 纹理上传，
//   首帧直接卡死（且显存爆炸）。ROOM_PROP_ART_DEFS 只登记尺寸 / 种子 / 绘制
//   函数，消费方按房间可见性调 fn(surf) → surf.tex() 即可，真正的绘制与上传
//   永远推迟到“第一次被摆放”。这里绝不预载、不缓存纹理。
//
//   结构：
//     1. 调色板解析（pal 名 → 5 色）
//     2. 画布上下文 + 像素原语
//     3. drawBase 表：35 个 base 各自的剪影与内部结构
//     4. parts 装饰（24 种）
//     5. 细节线 / 磨损 / 倾斜 / 烘焙光斑
//     6. paintRoomProp + ROOM_PROP_ART_DEFS
// ============================================================================

import { PAL } from '../palette.js'
import {
  Surf,
  mix,
  shade,
  strSeed,
  mulberry32,
  setArtModule,
} from './core.js'
import { ROOM_PROP_DEFS } from '../../world/rooms/index.js'

setArtModule('room-props')

const TAU = Math.PI * 2
const VOID = PAL.void

/* ============================================================================
 * 1. 调色板解析：pal 名 → { base, lite, dark, deep, accent }
 * --------------------------------------------------------------------------
 * 只从 palette.js 的既有颜色里混，不引入新色相；未知 pal 退回 steel。
 * ========================================================================== */

function tone(base, lite, dark, deep, accent) {
  return { base, lite, dark, deep, accent }
}

const PAL_TONES = {
  concrete: tone(
    mix(PAL.steel, PAL.sand, 0.34),
    mix(PAL.steelLight, PAL.sand, 0.4),
    PAL.steelDark,
    PAL.void,
    PAL.rust,
  ),
  rust: tone(PAL.rust, PAL.rustLight, PAL.rustDark, PAL.rustDeep, PAL.ochre),
  steel: tone(PAL.steel, PAL.steelLight, PAL.steelDark, PAL.ash, PAL.glass),
  copper: tone(PAL.ochre, PAL.rustHot, PAL.rustDark, PAL.rustDeep, PAL.waterHi),
  wood: tone(PAL.dust, PAL.sand, PAL.ash, PAL.rustDeep, PAL.boneDark),
  cloth: tone(PAL.dustLight, PAL.sand, PAL.dust, PAL.ash, PAL.blood),
  paper: tone(PAL.paper, PAL.white, PAL.boneDark, PAL.dust, PAL.ink),
  glass: tone(PAL.glass, PAL.waterHi, PAL.steelBlue, PAL.void, PAL.signal),
  medical: tone(
    PAL.white,
    mix(PAL.white, PAL.toxic, 0.16),
    PAL.boneDark,
    PAL.ashLight,
    PAL.toxic,
  ),
  bone: tone(PAL.bone, PAL.white, PAL.boneDark, PAL.boneDeep, PAL.dust),
  ash: tone(PAL.ashPale, PAL.dustLight, PAL.ashLight, PAL.void, PAL.dust),
  water: tone(PAL.water, PAL.waterHi, PAL.waterDeep, PAL.void, PAL.waterFoam),
  oil: tone(PAL.oil, PAL.oilSheen, PAL.black, PAL.void, PAL.rust),
  blood: tone(PAL.blood, mix(PAL.blood, PAL.danger, 0.5), PAL.bloodDark, PAL.void, PAL.danger),
  toxic: tone(PAL.toxic, PAL.toxicGlow, PAL.toxicDark, PAL.void, PAL.acid),
  electric: tone(PAL.signal, PAL.neon, PAL.steelBlue, PAL.void, PAL.steelWhite),
  fire: tone(PAL.neonWarm, PAL.rustHot, PAL.rustDark, PAL.void, PAL.white),
  moss: tone(PAL.moss, PAL.mossHi, PAL.mossDead, PAL.void, PAL.toxicGlow),
  rubber: tone(PAL.ash, PAL.ashLight, PAL.black, PAL.void, PAL.steelDark),
  plastic: tone(
    mix(PAL.boneDark, PAL.glass, 0.22),
    mix(PAL.bone, PAL.glass, 0.3),
    PAL.steel,
    PAL.void,
    PAL.warn,
  ),
  ceramic: tone(PAL.white, PAL.sand, PAL.boneDark, PAL.dust, PAL.glass),
  lead: tone(PAL.steelBlue, PAL.steelLight, PAL.steelDark, PAL.void, PAL.rust),
  uranium: tone(PAL.toxicDark, PAL.toxic, PAL.void, PAL.black, PAL.toxicGlow),
  gold: tone(PAL.ochre, PAL.sand, PAL.rustLight, PAL.rustDeep, PAL.warn),
  silver: tone(PAL.steelWhite, PAL.white, PAL.steelLight, PAL.steelDark, PAL.white),
  circuit: tone(PAL.steelBlue, PAL.neon, PAL.ash, PAL.void, PAL.signal),
  sand: tone(PAL.sand, PAL.sandDark, PAL.dustLight, PAL.dust, PAL.bone),
  stone: tone(
    mix(PAL.steelLight, PAL.dust, 0.42),
    mix(PAL.steelWhite, PAL.sand, 0.3),
    PAL.steelDark,
    PAL.void,
    PAL.mossDead,
  ),
  mud: tone(PAL.dust, PAL.dustLight, PAL.rustDeep, PAL.void, PAL.ochre),
}

function resolveTone(name) {
  const key = String(name || 'steel')
  return PAL_TONES[key] || PAL_TONES.steel
}

/* ============================================================================
 * 2. 画布上下文 / 像素原语
 * ========================================================================== */

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return lo
  return n < lo ? lo : n > hi ? hi : n
}

function clampNum(v, lo, hi) {
  const n = Number(v)
  if (!Number.isFinite(n)) return lo
  return n < lo ? lo : n > hi ? hi : n
}

function makeCtx(s, def, art, seed, rnd) {
  const w = s.w
  const h = s.h
  const pad = Math.max(1, Math.round(w * 0.05))
  const x0 = pad
  const x1 = Math.max(x0 + 1, w - pad - 1)
  const bw = Math.max(2, x1 - x0 + 1)
  const g = Math.max(4, h - 2)
  const top = Math.max(0, Math.round(h * 0.04))
  return {
    s,
    def,
    art,
    seed,
    rnd,
    w,
    h,
    x0,
    x1,
    bw,
    g,
    top,
    cx: w / 2,
    t: resolveTone(art.pal),
    v: clampInt(art.variant, 0, 3),
    detail: clampInt(art.detail ?? 2, 1, 4),
    wear: clampNum(art.wear, 0, 1),
    parts: Array.isArray(art.parts) ? art.parts : [],
    glowPos: null,
  }
}

/** 实心矩形 + 上左高光、下右暗边（绝无半透明）。 */
function pbox(s, x, y, w, h, t) {
  x = Math.round(x)
  y = Math.round(y)
  w = Math.round(w)
  h = Math.round(h)
  if (w <= 0 || h <= 0) return
  s.rect(x, y, w, h, t.base)
  if (h >= 2) {
    s.rect(x, y, w, 1, t.lite)
    s.rect(x, y + h - 1, w, 1, t.dark)
  }
  if (w >= 2) {
    s.rect(x, y + 1, 1, h - 1, t.lite)
    s.rect(x + w - 1, y + 1, 1, h - 1, t.dark)
  }
}

/** 只覆盖已有不透明像素的实心矩形（在异形剪影内上色用）。 */
function psolidRect(s, x, y, w, h, col) {
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const x1 = x0 + Math.round(w)
  const y1 = y0 + Math.round(h)
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) {
      if (s.solid(i, j)) s.set(i, j, col, 1)
    }
  }
}

/** 只在剪影内的横线（板缝 / 分模线）。 */
function phline(s, x0, x1, y, col) {
  y = Math.round(y)
  for (let x = Math.round(x0); x <= Math.round(x1); x++) {
    if (s.solid(x, y)) s.set(x, y, col, 1)
  }
}

/** 只在剪影内的竖线。 */
function pvline(s, x, y0, y1, col) {
  x = Math.round(x)
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    if (s.solid(x, y)) s.set(x, y, col, 1)
  }
}

/** 铆钉（只落在剪影上）。 */
function pstud(s, x, y, lite, dark) {
  x = Math.round(x)
  y = Math.round(y)
  if (!s.solid(x, y)) return
  s.set(x, y, lite, 1)
  if (s.solid(x + 1, y + 1)) s.set(x + 1, y + 1, dark, 1)
}

/** 圆环（轮缘 / 线圈 / 护网）。 */
function pring(s, cx, cy, rx, ry, th, col) {
  if (rx <= 0 || ry <= 0) return
  const t = Math.max(1, Math.round(th))
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / (ry + 0.5)
    const k = 1 - dy * dy
    if (k <= 0) continue
    const half = (rx + 0.5) * Math.sqrt(k)
    const xa = Math.round(cx - half)
    const xb = Math.round(cx + half)
    s.rect(xa, y, t, 1, col)
    s.rect(xb - t, y, t, 1, col)
  }
}

/** 轮辐。 */
function pspoke(s, cx, cy, ang, r, col, th = 1) {
  s.thick(cx, cy, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, th, col)
}

/* ============================================================================
 * 3. 35 个 base 的画法
 * --------------------------------------------------------------------------
 * 统一约定：底部贴地（g），水平居中（cx），所有结构朝右（把手 / 推把 /
 * 门把手 / 箭头 / 灶口等都在右半边），每个 base 的剪影一眼可分辨。
 * ========================================================================== */

/** 柜子：高箱体 + 门/抽屉 + 短脚。 */
function drawCabinet(s, c) {
  const { x0, bw, g, top, t, v } = c
  const legH = Math.max(1, Math.round(c.h * 0.06))
  const by = top + Math.max(0, Math.round(c.h * 0.03))
  const bh = Math.max(3, g - legH - by)
  const legW = Math.max(2, Math.round(bw * 0.08))
  pbox(s, x0, by, bw, bh, t)
  s.rect(x0, by, bw, Math.max(1, Math.round(c.h * 0.03)), t.dark)
  const ix = x0 + 2
  const iw = Math.max(2, bw - 4)
  const iy = by + Math.max(2, Math.round(c.h * 0.05))
  const ih = Math.max(2, bh - Math.round(c.h * 0.1))
  if (v === 2) {
    const rows = 3
    for (let i = 0; i < rows; i++) {
      const ry = iy + Math.round(((ih - 1) * i) / rows)
      const rh = Math.max(1, Math.round(ih / rows) - 1)
      pbox(s, ix, ry, iw, rh, {
        base: mix(t.base, t.dark, 0.3),
        lite: t.lite,
        dark: t.deep,
      })
      s.rect(
        ix + Math.round(iw * 0.55),
        ry + Math.max(1, Math.round(rh * 0.5)),
        Math.max(2, Math.round(iw * 0.2)),
        1,
        t.lite,
      )
    }
  } else {
    const doors = v === 3 ? 3 : 2
    const dw = Math.max(2, Math.floor(iw / doors))
    for (let i = 0; i < doors; i++) {
      const dx = ix + i * dw
      const dww = i === doors - 1 ? ix + iw - dx : dw
      pbox(s, dx, iy, Math.max(1, dww - 1), ih, {
        base: mix(t.base, t.dark, 0.26),
        lite: t.lite,
        dark: t.deep,
      })
      pvline(s, dx + dww - 1, iy, iy + ih, t.deep)
      const hx = dx + Math.max(1, dww - Math.max(3, Math.round(dww * 0.22)))
      s.rect(hx, iy + Math.round(ih * 0.45), 1, Math.max(2, Math.round(ih * 0.16)), t.lite)
    }
  }
  s.rect(x0 + 2, by + bh - 3, Math.max(1, bw - 4), 1, t.deep)
  s.rect(x0 + 1, by + bh, legW, legH, t.deep)
  s.rect(c.x1 - legW, by + bh, legW, legH, t.deep)
}

/** 货架：两侧立柱 + 3~4 层横板（层间留空，剪影成梳齿）。 */
function drawShelf(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const pw = Math.max(2, Math.round(bw * 0.07))
  const feet = Math.max(1, Math.round(c.h * 0.03))
  const ty = top + 1
  const bY = g - feet
  const n = 3 + (v & 1)
  pbox(s, x0, ty, pw, bY - ty, t)
  pbox(s, x1 - pw + 1, ty, pw, bY - ty, t)
  const th = Math.max(1, Math.round(c.h * 0.035))
  for (let i = 0; i < n; i++) {
    const y = ty + Math.round(((bY - ty) * i) / (n - 1 || 1))
    const sag = v === 3 && i > 0 && i < n - 1 ? 1 : 0
    s.rect(x0, y + sag, bw, th, t.dark)
    s.rect(x0, y + sag, bw, 1, t.lite)
  }
  if (v >= 2) s.line(x0 + pw, bY - 1, x1 - pw, ty + 2, t.deep)
  s.rect(x0, bY, bw, feet, t.deep)
  // 架上零星箱罐
  if (v === 1 && bY - ty > 10) {
    s.rect(x0 + pw + 2, bY - 5, Math.max(2, bw * 0.16), 4, t.base)
    s.rect(x0 + pw + 2, bY - 5, Math.max(2, bw * 0.16), 1, t.lite)
  }
}

/** 书桌：台面横板 + 两侧腿/抽屉柜，桌下留空。 */
function drawDesk(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const ty = top + Math.round((g - top) * 0.26)
  const th = Math.max(2, Math.round(c.h * 0.06))
  const lw = Math.max(2, Math.round(bw * 0.08))
  s.rect(x0, ty, bw, th, t.base)
  s.rect(x0, ty, bw, 1, t.lite)
  s.rect(x0, ty + th - 1, bw, 1, t.dark)
  if (v % 2 === 0) {
    pbox(s, x0 + 1, ty + th, lw, g - ty - th, t)
    pbox(s, x1 - lw, ty + th, lw, g - ty - th, t)
  } else {
    s.thick(x0 + lw, ty + th, x0 + 1, g, 1.2, t.dark)
    s.thick(x1 - lw, ty + th, x1 - 1, g, 1.2, t.dark)
    if (g - ty > 6) s.thick(x0 + lw, g - 1, x1 - lw, g - 1, 1, t.deep)
  }
  const cxw = Math.round(bw * 0.34)
  const cy0 = ty + th
  const cyh = Math.max(1, Math.round((g - cy0) * 0.8))
  if (cyh > 2 && cxw > 2) {
    pbox(s, x0 + lw + 1, cy0, cxw, cyh, t)
    for (let i = 1; i < 3; i++) {
      s.rect(x0 + lw + 1, cy0 + Math.round((cyh * i) / 3), cxw, 1, t.deep)
    }
    s.rect(
      x0 + lw + Math.round(cxw * 0.5),
      cy0 + Math.round(cyh * 0.4),
      Math.max(2, Math.round(cxw * 0.2)),
      1,
      t.lite,
    )
  }
}

/** 床：右端高床头 + 床垫 + 枕头 + 左侧毯褶，整体低矮。 */
function drawBed(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const postW = Math.max(2, Math.round(bw * 0.07))
  const headTop = top + Math.round(c.h * (v === 1 ? 0.02 : 0.12))
  const matY = g - Math.max(3, Math.round(c.h * 0.34))
  const matH = Math.max(2, Math.round(c.h * 0.22))
  pbox(s, x1 - postW, headTop, postW, g - headTop, t)
  s.ell(x1 - postW + postW / 2, headTop, postW * 0.9, Math.max(1, c.h * 0.04), t.lite)
  s.rect(x0, matY + matH, bw, Math.max(0, g - matY - matH), t.dark)
  s.rect(x0, matY + matH, bw, 1, t.base)
  pbox(s, x0 + 1, matY, bw - postW - 1, matH, {
    base: mix(t.base, t.lite, 0.35),
    lite: t.lite,
    dark: t.dark,
  })
  const px0 = x1 - postW - Math.round(bw * 0.18)
  pbox(s, px0, matY - 1, Math.max(3, Math.round(bw * 0.14)), Math.max(2, Math.round(matH * 0.6)), {
    base: PAL.bone,
    lite: PAL.white,
    dark: PAL.boneDark,
  })
  for (let i = 0; i < 3; i++) {
    pvline(s, x0 + 2 + i * Math.max(3, Math.round(bw * 0.13)), matY + 1, matY + matH - 1, shade(t.base, -0.3))
  }
  s.rect(x0, matY + matH, postW, Math.max(0, g - matY - matH), t.deep)
  if (v === 3 && matH > 3) s.rect(x0 + 3, matY, Math.round(bw * 0.4), 1, t.deep)
}

/** 椅子：左侧靠背 + 座面 + 两条细腿，L 形剪影。 */
function drawChair(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const legW = Math.max(1, Math.round(bw * 0.06))
  const seatY = g - Math.max(3, Math.round(c.h * 0.3))
  const seatH = Math.max(1, Math.round(c.h * 0.06))
  const backW = Math.max(2, Math.round(bw * 0.14))
  const backH = Math.max(2, seatY - top)
  pbox(s, x0, top, backW, backH, t)
  if (v === 0 || v === 2) {
    s.rect(
      x0 + 1,
      top + Math.round(backH * 0.35),
      Math.max(1, backW - 2),
      Math.max(1, Math.round(backH * 0.3)),
      t.dark,
    )
  } else if (v === 1) {
    s.rect(x0, top, backW, Math.max(1, Math.round(backH * 0.25)), t.lite)
  } else {
    s.rect(x0, top, backW, Math.max(1, Math.round(backH * 0.45)), t.deep)
  }
  pbox(s, x0, seatY, bw, seatH, t)
  s.rect(x0 + 1, seatY + seatH, legW, Math.max(0, g - seatY - seatH), t.dark)
  s.rect(x1 - legW, seatY + seatH, legW, Math.max(0, g - seatY - seatH), t.dark)
  s.rect(x0 + 2, seatY + seatH, 1, Math.max(0, g - seatY - seatH), t.base)
  s.rect(x1 - legW + 1, seatY + seatH, 1, Math.max(0, g - seatY - seatH), t.base)
  if (g - seatY > 5) s.rect(x0 + 1, g - 2, Math.max(1, bw - 2), 1, t.deep)
}

/** 桶：椭圆鼓腹 + 两道箍 + 顶盖。 */
function drawBarrel(s, c) {
  const { bw, g, top, t, v } = c
  const topY = top + Math.max(1, Math.round(c.h * 0.05))
  const cy = (topY + g) / 2
  const ry = (g - topY) / 2
  const rx = Math.max(3, bw / 2)
  s.ell(c.x0 + bw / 2, cy, rx, ry, t.dark)
  s.ell(c.x0 + bw / 2, cy, rx - 1, ry - 1, t.base)
  psolidRect(s, c.cx - rx * 0.5, topY + 2, Math.max(1, rx * 0.28), Math.max(1, ry * 1.5), mix(t.base, t.lite, 0.45))
  psolidRect(s, c.cx + rx * 0.34, topY + 2, Math.max(1, rx * 0.14), Math.max(1, ry * 1.5), mix(t.base, t.dark, 0.45))
  for (const k of [0.3, 0.62]) {
    const hy = Math.round(topY + (g - topY) * k)
    const dy = (hy + 0.5 - cy) / (ry + 0.5)
    const half = (rx + 0.5) * Math.sqrt(Math.max(0, 1 - dy * dy))
    s.rect(Math.round(c.cx - half), hy, Math.round(half * 2), 2, t.deep)
    s.rect(Math.round(c.cx - half), hy, Math.round(half * 2), 1, t.lite)
  }
  s.ell(c.cx, topY, rx * 0.7, Math.max(1, c.h * 0.05), t.deep)
  s.ell(c.cx, topY, rx * 0.55, Math.max(1, c.h * 0.04), mix(t.base, t.dark, 0.2))
  s.disc(c.cx + rx * 0.3, topY + 1, Math.max(1, rx * 0.09), t.deep)
  if (v === 3) s.ell(c.cx + rx * 0.45, topY + ry * 1.1, Math.max(1, rx * 0.5), Math.max(1, ry * 0.35), t.deep)
}

/** 木箱：近方形 + 板缝 + X 形加固 + 包角。 */
function drawCrate(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const by = top + Math.max(1, Math.round(c.h * 0.04))
  const bh = g - by
  pbox(s, x0, by, bw, bh, t)
  const seam = Math.max(2, Math.round(bh * 0.25))
  for (let y = by + seam; y < g - 1; y += seam) s.rect(x0 + 1, y, Math.max(1, bw - 2), 1, t.deep)
  s.line(x0 + 2, by + 2, x1 - 2, g - 2, t.dark)
  s.line(x1 - 2, by + 2, x0 + 2, g - 2, t.dark)
  if (v >= 2) {
    s.line(x0 + 2, by + 2, x0 + 2 + bw * 0.5, g - 2, t.deep)
  }
  const cw = Math.min(3, bw)
  for (const [bx, byy] of [
    [x0, by],
    [x1 - cw + 1, by],
    [x0, g - 4],
    [x1 - cw + 1, g - 4],
  ]) {
    s.rect(bx, byy, cw, Math.min(2, bh), t.deep)
    s.rect(bx, byy, 2, Math.min(4, bh), t.deep)
    pstud(s, bx + 1, byy + 1, t.lite, t.deep)
  }
  s.rect(x0 - 1, g - 2, bw + 2, 1, t.deep)
  if (v === 1) s.rect(x0 + 3, by + 3, Math.max(2, bw * 0.22), 1, t.lite)
}

/** 管路：横贯管道 + 法兰 + 支架 + 上方细管（露出钢筋/漏点）。 */
function drawPipe(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const y = top + Math.round(c.h * (v === 1 ? 0.3 : 0.38))
  const r = Math.max(1.5, Math.min(c.h * 0.13, bw * 0.09))
  s.thick(x0, y, x1, y, r, t.dark)
  s.thick(x0, y - 0.4, x1, y - 0.4, Math.max(0.6, r - 0.7), t.base)
  s.thick(x0, y - r * 0.6, x1, y - r * 0.6, Math.max(0.4, r * 0.25), t.lite)
  const fx = [x0 + bw * 0.22, x0 + bw * 0.55, x1 - 2]
  for (const f of fx) {
    const fh = Math.round(r * 2 + 2)
    s.rect(f - 1, y - r - 1, 3, fh, t.deep)
    s.rect(f - 1, y - r - 1, 1, fh, t.lite)
    s.px(f, y - r - 2, t.lite)
  }
  s.rect(x0 + Math.round(bw * 0.3) - 1, y + r, 2, Math.max(1, g - (y + r)), t.dark)
  s.rect(x1 - Math.round(bw * 0.25), y + r, 2, Math.max(1, g - (y + r)), t.dark)
  if (v >= 1) {
    const y2 = y - Math.max(3, Math.round(c.h * 0.24))
    if (y2 > top + 1) {
      s.thick(x0 + 2, y2, x1 - 3, y2, 1, t.deep)
      s.thick(x0 + 2, y2 - 0.6, x1 - 3, y2 - 0.6, 0.6, t.base)
      s.line(x0 + Math.round(bw * 0.4), y2, x0 + Math.round(bw * 0.4), y, t.deep)
    }
  }
  if (v === 2) s.rect(fx[1], y + r, 1, Math.max(2, Math.round(c.h * 0.2)), PAL.oil)
}

/** 标牌：细杆 + 顶部面板 + 右向箭头 / 字行。 */
function drawSign(s, c) {
  const { x0, bw, g, top, t, v } = c
  const pw = Math.max(2, Math.round(bw * 0.07))
  const poleX = c.cx - pw / 2
  s.rect(poleX, top + 2, pw, Math.max(1, g - top - 2), t.dark)
  s.rect(poleX, top + 2, 1, Math.max(1, g - top - 2), t.lite)
  const ph = Math.max(4, Math.round(c.h * 0.3))
  const pwid = Math.max(4, Math.min(bw - 2, Math.round(bw * 0.8)))
  const py = top + Math.max(0, Math.round(c.h * 0.04))
  const sx = x0 + 1
  const tiltX = Math.round(pwid * 0.06)
  s.poly(
    [
      [sx + tiltX, py],
      [sx + pwid, py],
      [sx + pwid, py + ph],
      [sx, py + ph],
    ],
    t.base,
  )
  s.line(sx + tiltX, py, sx + pwid, py, t.lite)
  s.line(sx, py + ph, sx + pwid, py + ph, t.dark)
  s.rect(sx, py, 2, ph, t.dark)
  if (v % 2 === 0) {
    s.poly(
      [
        [sx + 4, py + ph / 2],
        [sx + 9, py + 2],
        [sx + 9, py + ph - 2],
      ],
      t.accent,
    )
  } else {
    for (let i = 0; i < 3; i++) {
      s.rect(sx + 4, py + 3 + i * 3, Math.max(2, Math.round(pwid * 0.45)), 1, t.deep)
    }
  }
  if (ph > 4) s.px(sx + pwid - 3, py + ph - 2, t.deep)
}

/** 灯：底座 + 灯杆 + 右伸灯臂 + 锥形灯罩 + 灯泡（记下光斑位置）。 */
function drawLamp(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const pw = Math.max(2, Math.round(bw * 0.09))
  const px = c.cx - pw / 2
  const poleTop = top + Math.max(2, Math.round(c.h * 0.1))
  s.ell(c.cx, g - 1, Math.max(3, bw * 0.24), Math.max(1, c.h * 0.05), t.deep)
  s.rect(px, poleTop, pw, Math.max(1, g - poleTop), t.dark)
  s.rect(px, poleTop, 1, Math.max(1, g - poleTop), t.lite)
  const armY = top + Math.max(2, Math.round(c.h * 0.16))
  const armLen = Math.max(2, Math.min(Math.round(bw * 0.32), x1 - (px + pw) - 2))
  s.thick(px + pw, armY, px + pw + armLen, armY, 1, t.dark)
  const sx = px + pw + armLen
  const shH = Math.max(3, Math.round(c.h * 0.16))
  const shW = Math.max(5, Math.round(bw * 0.3))
  s.poly(
    [
      [sx - shW / 2, armY + shH],
      [sx + shW / 2, armY + shH],
      [sx + shW * 0.28, armY],
      [sx - shW * 0.28, armY],
    ],
    t.base,
  )
  s.line(sx - shW / 2, armY + shH, sx + shW / 2, armY + shH, t.lite)
  const bulbY = armY + shH + 1
  s.ell(sx, bulbY, Math.max(1.5, shW * 0.16), Math.max(1, c.h * 0.03), PAL.neonWarm)
  s.px(sx, bulbY + 1, PAL.white)
  c.glowPos = { x: sx, y: bulbY + 1 }
  if (v === 3) {
    s.thick(px + 1, g - 5, x0 + 1, g - 1, 1, t.deep)
    s.thick(px + pw - 1, g - 5, x1 - 1, g - 1, 1, t.deep)
  }
  if (v === 2) {
    const lx = px - Math.max(3, armLen)
    if (lx > 1) {
      s.thick(px, armY, lx, armY, 1, t.dark)
      s.poly(
        [
          [lx - shW * 0.4, armY + shH],
          [lx + shW * 0.4, armY + shH],
          [lx + shW * 0.22, armY],
          [lx - shW * 0.22, armY],
        ],
        t.base,
      )
    }
  }
}

/** 机器：底座 + 切角机体 + 飞轮 + 烟囱 + 表盘。 */
function drawMachine(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const bodyTop = top + Math.round(c.h * 0.12)
  const bodyW = Math.round(bw * 0.82)
  const bxx = v % 2 ? x0 : x1 - bodyW
  const baseH = Math.max(2, Math.round(c.h * 0.08))
  s.rect(x0, g - baseH, bw, baseH, t.deep)
  s.poly(
    [
      [bxx, bodyTop + 2],
      [bxx + 2, bodyTop],
      [bxx + bodyW - 2, bodyTop],
      [bxx + bodyW, bodyTop + 2],
      [bxx + bodyW, g - 3],
      [bxx, g - 3],
    ],
    t.base,
  )
  s.line(bxx + 2, bodyTop, bxx + bodyW - 2, bodyTop, t.lite)
  s.line(bxx, bodyTop + 2, bxx, g - 3, t.lite)
  for (let i = 0; i < 3; i++) {
    s.rect(bxx + 3, bodyTop + 4 + i * 3, Math.max(3, Math.round(bodyW * 0.35)), 1, t.deep)
  }
  const wr = Math.max(2.5, Math.min(c.h * 0.18, bw * 0.16))
  const wy = g - Math.max(4, c.h * 0.22)
  const wx = v % 2 ? x1 - wr : x0 + wr
  s.disc(wx, wy, wr, t.deep)
  s.disc(wx, wy, wr - 1, t.base)
  s.disc(wx, wy, Math.max(1, wr * 0.3), t.lite)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4
    s.line(wx, wy, wx + Math.cos(a) * (wr - 1), wy + Math.sin(a) * (wr - 1), t.dark)
  }
  const stx = v % 2 ? bxx + bodyW - 5 : bxx + 2
  const stW = Math.max(2, Math.round(bw * 0.08))
  s.rect(stx, top, stW, Math.max(1, bodyTop - top + 2), t.dark)
  s.rect(stx, top, 1, Math.max(1, bodyTop - top + 2), t.lite)
  s.rect(stx - 1, top, stW + 2, 1, t.deep)
  s.disc(bxx + bodyW * 0.3, bodyTop + 3, 2, t.lite)
  s.disc(bxx + bodyW * 0.3, bodyTop + 3, 1.2, PAL.neonWarm)
  if (v === 3) s.rect(bxx + 1, bodyTop + 2, 1, Math.max(1, g - bodyTop - 5), t.dark)
}

/** 屏幕：外壳 + 支架 + 扫描线屏幕（记下光斑位置）。 */
function drawScreen(s, c) {
  const { x0, bw, g, top, t, v } = c
  const bezTop = top + Math.round(c.h * (v === 1 ? 0.03 : 0.08))
  const bezW = Math.min(bw, Math.round(bw * 0.94))
  const bezH = Math.max(5, Math.round(c.h * 0.56))
  const bx = x0 + Math.round((bw - bezW) / 2)
  const neckY = bezTop + bezH
  s.rect(c.cx - 1, neckY, 2, Math.max(0, g - neckY - 1), t.dark)
  s.ell(c.cx, g - 1, Math.max(3, bw * 0.3), Math.max(1, c.h * 0.03), t.deep)
  pbox(s, bx, bezTop, bezW, bezH, t)
  const ix = bx + 2
  const iy = bezTop + 2
  const iw = Math.max(1, bezW - 4)
  const ih = Math.max(1, bezH - Math.max(4, Math.round(bezH * 0.18)))
  s.rect(ix, iy, iw, ih, PAL.black)
  for (let y = iy + 1; y < iy + ih; y += 2) s.rect(ix, y, iw, 1, t.deep)
  for (let i = 0; i < 3; i++) {
    const len = Math.max(2, Math.round(iw * (0.35 + 0.2 * i)))
    s.rect(ix + 1, iy + 2 + i * 3, len, 1, i === 2 ? PAL.neonWarm : PAL.neon)
  }
  c.glowPos = { x: ix + iw / 2, y: iy + ih / 2 }
  s.rect(bx + 2, bezTop + bezH - 3, Math.max(1, bezW - 4), 1, t.deep)
  s.px(bx + bezW - 3, bezTop + bezH - 2, PAL.toxic)
  if (v === 2) s.rect(ix, iy, iw, 1, t.lite)
}

/** 门：门框 + 门扇（v3 半开）+ 铰链 + 把手 + 踢板。 */
function drawDoor(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const frameW = Math.max(2, Math.round(bw * 0.08))
  const dy = top + Math.max(0, Math.round(c.h * 0.02))
  pbox(s, x0, dy, bw, g - dy, t)
  const ix = x0 + frameW
  const ix1 = x1 - frameW
  const iy = dy + Math.max(1, Math.round(c.h * 0.03))
  const iw = Math.max(2, ix1 - ix)
  const ih = Math.max(2, g - iy - 1)
  const open = v === 3 ? Math.round(iw * 0.45) : 0
  s.rect(ix, iy, iw, ih, VOID)
  const leafW = Math.max(1, iw - open)
  pbox(s, ix, iy, leafW, ih, t)
  if (leafW > 6 && ih > 8) {
    s.rect(ix + 2, iy + 2, leafW - 4, Math.round(ih * 0.4), t.dark)
    s.rect(ix + 2, iy + 2, leafW - 4, 1, t.deep)
    s.rect(ix + 2, iy + 4 + Math.round(ih * 0.4), leafW - 4, Math.round(ih * 0.35), t.dark)
  }
  for (const hy of [iy + 3, iy + ih - 5]) {
    s.rect(ix, hy, 2, 2, t.lite)
    s.px(ix, hy, t.deep)
  }
  const knobY = iy + Math.round(ih * 0.5)
  s.ell(ix + leafW - 3, knobY, 1.5, 1.5, PAL.steelLight)
  s.px(ix + leafW - 3, knobY, PAL.steelWhite)
  s.rect(ix, iy + ih - 3, leafW, 2, t.deep)
  pvline(s, ix1, iy, iy + ih, t.deep)
  if (v === 1) s.rect(ix + leafW - 2, iy, 1, ih, t.deep)
}

/** 窗：外框 + 十字窗棂 + 碎玻璃（整体微微倾斜、底部落地）。 */
function drawWindow(s, c) {
  const { x0, bw, g, top, t, v } = c
  const fx = x0 + Math.round(bw * 0.04)
  const fw = Math.round(bw * 0.88)
  const fy = top + Math.round(c.h * 0.05)
  const fh = Math.max(5, Math.round(c.h * 0.7))
  const lean = Math.round(fw * (v % 2 ? -0.05 : 0.05))
  s.poly(
    [
      [fx + lean, fy],
      [fx + fw + lean, fy],
      [fx + fw, fy + fh],
      [fx, fy + fh],
    ],
    t.base,
  )
  s.line(fx + lean, fy, fx + fw + lean, fy, t.lite)
  s.line(fx, fy + fh, fx + fw, fy + fh, t.dark)
  const gx = fx + 2 + Math.round(lean * 0.5)
  const gw = Math.max(2, fw - 4)
  const gy = fy + 2
  const gh = Math.max(2, fh - Math.max(4, Math.round(fh * 0.12)))
  const gl = mix(PAL.glass, PAL.void, 0.6)
  s.poly(
    [
      [gx + Math.round(lean * 0.4), gy],
      [gx + gw + Math.round(lean * 0.4), gy],
      [gx + gw, gy + gh],
      [gx, gy + gh],
    ],
    gl,
  )
  const midX = gx + Math.round(gw / 2)
  s.line(midX + Math.round(lean * 0.2), gy, midX, gy + gh, t.dark)
  s.line(gx, gy + Math.round(gh / 2), gx + gw, gy + Math.round(gh / 2), t.dark)
  s.line(gx + 2, gy + gh - 1, gx + 4, gy + 2, PAL.waterHi)
  if (v >= 2) {
    const bx = gx + Math.round(gw * 0.55)
    s.poly(
      [
        [bx, gy],
        [bx + Math.round(gw * 0.35), gy],
        [bx + Math.round(gw * 0.15), gy + Math.round(gh * 0.45)],
        [bx, gy + Math.round(gh * 0.25)],
      ],
      VOID,
    )
    s.line(bx, gy + 2, bx + 4, gy + Math.round(gh * 0.35), PAL.glass)
  }
  s.rect(fx - 1, fy + fh, fw + 2, 2, t.deep)
  s.px(fx + lean + 2, fy + 1, t.lite)
}

/** 废墟堆：低矮不规则石块 + 露出的木板与钢筋。 */
function drawDebris(s, c) {
  const { x0, bw, g, top, t, v } = c
  const n = 3 + (v % 3)
  for (let i = 0; i < n; i++) {
    const rx = Math.max(2, bw * (0.2 + 0.07 * (i % 2)))
    const cx = x0 + ((i + 0.5) / n) * bw + (i % 2 ? 2 : -2)
    const hgt = Math.max(2, c.h * (0.2 + 0.14 * (((i * 7 + v * 3) % 3) / 2)))
    s.poly(
      [
        [cx - rx / 2, g],
        [cx - rx * 0.35, g - hgt],
        [cx + rx * 0.15, g - hgt * 0.7],
        [cx + rx / 2, g],
      ],
      i % 2 ? t.base : mix(t.base, t.dark, 0.3),
    )
    s.line(cx - rx * 0.35, g - hgt, cx + rx * 0.15, g - hgt * 0.7, t.lite)
    s.line(cx - rx * 0.35, g - hgt + 1, cx + rx * 0.15, g - hgt * 0.7 + 1, t.dark)
  }
  const py = g - Math.max(2, c.h * 0.16)
  s.thick(x0 + 2, g - 1, x0 + 2 + Math.max(3, bw * 0.55), py, 1, t.dark)
  s.thick(x0 + 2, g - 2, x0 + 2 + Math.max(3, bw * 0.55), py - 1, 0.5, t.lite)
  const rx = c.cx + bw * 0.15
  s.thick(rx, g - 1, rx + bw * 0.2, top + Math.max(1, c.h * 0.12), 0.9, PAL.rustDark)
  s.px(rx + bw * 0.2, top + Math.max(1, c.h * 0.12), PAL.rustLight)
  if (v === 3) s.ell(c.cx - bw * 0.2, g - 2, Math.max(2, bw * 0.12), Math.max(1, c.h * 0.06), t.base)
}

/** 植物：花盆 + 2~4 根弯曲茎 + 叶片，细线有机剪影。 */
function drawPlant(s, c) {
  const { bw, g, top, t, v } = c
  const potW = Math.max(4, Math.round(bw * 0.5))
  const potH = Math.max(3, Math.round(c.h * 0.24))
  const potX = c.cx - potW / 2
  const potY = g - potH
  s.poly(
    [
      [potX, potY],
      [potX + potW, potY],
      [potX + potW * 0.86, g],
      [potX + potW * 0.14, g],
    ],
    t.base,
  )
  s.rect(potX - 1, potY - 1, potW + 2, 2, t.dark)
  s.rect(potX, potY - 1, potW, 1, t.lite)
  s.ell(c.cx, potY, potW * 0.42, 1, PAL.oil)
  const stems = 2 + (v % 3)
  for (let i = 0; i < stems; i++) {
    const sx = c.cx + (i - (stems - 1) / 2) * Math.max(2, potW * 0.16)
    const hgt = Math.max(3, c.h * (0.32 + 0.14 * ((i + v) % 3)))
    const bend = ((i + v) % 2 ? 1 : -1) * Math.max(2, bw * 0.1)
    const lx = sx + bend
    const ly = Math.max(top, potY - 1 - hgt)
    s.thick(sx, potY - 1, lx, ly, 0.8, t.dark)
    s.thick(sx, potY - 2, lx, ly - 1, 0.4, t.lite)
    s.poly(
      [
        [lx, ly],
        [lx + Math.max(2, bw * 0.08), ly - 3],
        [lx + 1, ly + 2],
      ],
      t.base,
    )
    s.poly(
      [
        [lx, ly + Math.max(3, c.h * 0.12)],
        [lx - Math.max(2, bw * 0.08), ly + 3],
        [lx + 1, ly + 2],
      ],
      mix(t.base, t.dark, 0.25),
    )
  }
  if (v === 3) {
    s.ell(c.cx + potW * 0.4, g - 1, Math.max(1, bw * 0.1), 1, PAL.mossDead)
  }
}

/** 尸体：低伏人形（躯干 + 头 + 屈腿 + 摊手），身下血渍。 */
function drawBody(s, c) {
  const { x0, bw, g, top, t, v } = c
  const cy = g - Math.max(2, c.h * 0.16)
  const torsoX = x0 + bw * 0.4
  s.ell(c.cx, g - 1, Math.max(3, bw * 0.4), Math.max(1, c.h * 0.05), PAL.bloodDark)
  s.ell(torsoX, cy, Math.max(2, bw * 0.25), Math.max(2, c.h * 0.15), mix(t.base, PAL.bloodDark, 0.35))
  const hx = x0 + bw * 0.74
  const hy = cy - c.h * (v === 1 ? 0.02 : 0.06)
  s.disc(hx, hy, Math.max(2, c.h * 0.1), PAL.bone)
  s.disc(hx + 0.5, hy, 1, PAL.void)
  if (v === 3) {
    for (let i = 0; i < 3; i++) s.line(torsoX - 3, cy - 2 + i * 2, torsoX + 3, cy - 2 + i * 2, PAL.boneDark)
  } else {
    s.poly(
      [
        [torsoX - 3, cy - 2],
        [torsoX + 4, cy - 3],
        [torsoX + 6, cy + 2],
        [torsoX - 2, cy + 3],
      ],
      mix(t.base, t.dark, 0.3),
    )
  }
  if (v === 2) {
    s.thick(torsoX - 2, cy + 2, torsoX - 5, g - 2, 1.4, t.dark)
    s.thick(torsoX + 1, cy + 2, torsoX + 4, g - 2, 1.4, t.dark)
  } else {
    s.thick(torsoX - 2, cy + 1, x0 + bw * 0.06, g - 2, 1.3, t.dark)
    s.thick(torsoX + 2, cy + 1, x0 + bw * 0.14, g - 1, 1.3, t.dark)
  }
  s.thick(torsoX + 2, cy - 1, Math.min(hx - 2, x0 + bw * 0.6), g - 2, 1, t.base)
  s.px(hx - 1, hy - 1, PAL.boneDark)
  if (v === 1) s.ell(torsoX + 1, cy - 1, Math.max(2, bw * 0.16), Math.max(1, c.h * 0.06), t.deep)
}

/** 线缆：盘绕的椭圆线圈 + 沿地放出的线尾 + 插头。 */
function drawCable(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const R = Math.max(3, Math.min(c.h * 0.3, bw * 0.28))
  const cx0 = x0 + bw * 0.35
  const cy0 = g - Math.max(2, c.h * 0.3)
  s.ell(cx0, cy0, R, R * 0.6, t.dark)
  s.ell(cx0, cy0, R * 0.7, R * 0.4, VOID)
  s.ell(cx0, cy0, R * 0.45, R * 0.24, t.base)
  s.ell(cx0, cy0, R * 0.3, R * 0.14, t.deep)
  const loops = 2 + (v % 3)
  for (let i = 0; i < loops; i++) {
    pring(s, cx0, cy0 - i * 1.4, R - i * 0.9, R * 0.58 - i * 0.5, 1, i % 2 ? t.lite : t.base)
  }
  const tailY = cy0 + R * 0.5
  s.thick(cx0 + R * 0.7, tailY, x1 - 3, g - 2, 1, t.dark)
  s.thick(cx0 + R * 0.7, tailY - 0.6, x1 - 3, g - 2.6, 0.5, t.base)
  s.rect(x1 - 4, g - 4, 3, 2, t.base)
  s.rect(x1 - 2, g - 5, 1, 1, t.lite)
  if (v === 3) s.thick(cx0 - R * 0.8, cy0, x0 + 1, top + c.h * 0.2, 0.9, t.deep)
}

/** 风扇：圆罩 + 3~5 片叶 + 护网 + 立柱底座。 */
function drawFan(s, c) {
  const { x0, bw, g, top, t, v } = c
  const R = Math.max(4, Math.min(bw * 0.42, c.h * 0.32))
  const cx = c.cx
  const cy = top + R + Math.max(1, c.h * 0.06)
  s.ell(cx, g - 1, Math.max(3, bw * 0.25), Math.max(1, c.h * 0.04), t.deep)
  s.rect(cx - 1, cy + R, 2, Math.max(1, g - cy - R), t.dark)
  s.disc(cx, cy, R, t.dark)
  s.disc(cx, cy, R - 1, t.base)
  s.disc(cx, cy, R - 2, t.deep)
  const blades = 3 + (v % 3)
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU + 0.3
    s.poly(
      [
        [cx, cy],
        [cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8],
        [cx + Math.cos(a + 0.55) * R * 0.5, cy + Math.sin(a + 0.55) * R * 0.5],
      ],
      t.lite,
    )
  }
  s.disc(cx, cy, Math.max(1.5, R * 0.18), t.dark)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    s.line(
      cx + Math.cos(a) * R * 0.35,
      cy + Math.sin(a) * R * 0.35,
      cx + Math.cos(a) * (R - 2),
      cy + Math.sin(a) * (R - 2),
      t.deep,
    )
  }
  pring(s, cx, cy, R - 2, R - 2, 1, t.dark)
  if (v === 3) s.rect(x0 + 2, g - 2, bw - 4, 2, t.deep)
  s.px(cx + R - 3, cy - R + 3, t.lite)
}

/** 储罐：直筒 + 半球顶 + 加强箍 + 支腿 + 顶部阀 + 侧梯。 */
function drawTank(s, c) {
  const { bw, g, top, t, v } = c
  const tw = Math.max(5, Math.round(bw * 0.62))
  const tx = c.cx - tw / 2
  const domeH = Math.max(2, Math.round(c.h * (v === 1 ? 0.06 : 0.12)))
  const bodyTop = top + domeH
  const legH = Math.max(2, Math.round(c.h * 0.1))
  const bot = g - legH
  pbox(s, tx, bodyTop, tw, Math.max(2, bot - bodyTop), t)
  s.ell(c.cx, bodyTop, tw / 2, domeH, t.base)
  s.line(c.cx - tw / 2 + 2, bodyTop - domeH + 1, c.cx + tw / 2 - 2, bodyTop - domeH + 1, t.lite)
  for (let i = 1; i < 4; i++) {
    const y = bodyTop + Math.round(((bot - bodyTop) * i) / 4)
    s.rect(tx, y, tw, 1, t.dark)
    s.rect(tx, y - 1, tw, 1, t.lite)
  }
  s.thick(tx + 1, bot, tx - 2, g, 1, t.deep)
  s.thick(tx + tw - 1, bot, tx + tw + 2, g, 1, t.deep)
  s.rect(c.cx - 1, bodyTop - domeH - 3, 2, 3, t.dark)
  s.ell(c.cx, bodyTop - domeH - 4, 2.5, 1, t.lite)
  for (let y = bodyTop + 4; y < bot - 2; y += 3) s.rect(tx + tw - 3, y, 2, 1, t.lite)
  s.rect(tx + tw - 2, bodyTop + 2, 1, Math.max(1, bot - bodyTop - 2), t.dark)
  s.disc(tx + tw * 0.32, bodyTop + 4, 2, t.lite)
  s.disc(tx + tw * 0.32, bodyTop + 4, 1, t.deep)
  if (v === 3) s.rect(tx, bodyTop + Math.round((bot - bodyTop) * 0.6), tw, 2, t.deep)
}

/** 控制面板：板体 + 外八腿 + 按钮阵列 + 仪表 + 警示条。 */
function drawPanel(s, c) {
  const { bw, g, top, t, v } = c
  const bwid = Math.round(bw * (v === 0 ? 0.94 : 0.85))
  const bx = c.cx - bwid / 2
  const boardTop = top + Math.max(0, Math.round(c.h * 0.04))
  const boardH = Math.max(5, Math.round(c.h * 0.5))
  const boardBot = boardTop + boardH
  const legX1 = bx + bwid * 0.18
  const legX2 = bx + bwid * 0.82
  s.thick(legX1, boardBot - 1, legX1 - bw * 0.08, g, 1.2, t.dark)
  s.thick(legX2, boardBot - 1, legX2 + bw * 0.08, g, 1.2, t.dark)
  s.rect(legX1 - bw * 0.1, g - 1, bw * 0.2, 1, t.deep)
  s.rect(legX2 - bw * 0.1, g - 1, bw * 0.2, 1, t.deep)
  pbox(s, bx, boardTop, bwid, boardH, t)
  const cols = 3 + (v % 2)
  const rows = 3
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const bxk = Math.min(
        bx + bwid - 3,
        bx + 3 + k * Math.max(3, (bwid - 6) / cols),
      )
      const byk = boardTop + 4 + r * Math.max(3, (boardH - 8) / rows)
      s.rect(bxk, byk, 2, 2, (r + k + v) % 3 === 0 ? PAL.neonWarm : t.lite)
      s.px(bxk + 1, byk + 1, t.deep)
    }
  }
  s.disc(bx + bwid * 0.72, boardTop + 6, 2, t.deep)
  s.disc(bx + bwid * 0.72, boardTop + 6, 1.2, PAL.neon)
  const sy = boardTop + boardH - Math.max(2, boardH * 0.16)
  for (let i = 0; i < bwid; i += 4) {
    s.rect(bx + i, sy, 2, Math.max(2, boardH * 0.16), PAL.warn)
  }
  if (v === 3) s.rect(bx, boardTop, bwid, 2, t.deep)
}

/** 阀门：立管 + 法兰 + 大号手轮 + 右侧支管。 */
function drawValve(s, c) {
  const { x1, bw, g, top, t, v } = c
  const pw = Math.max(3, Math.round(bw * 0.16))
  const px = c.cx - pw / 2
  const pipeTop = Math.max(top, Math.round(g * 0.4))
  s.rect(px, pipeTop, pw, Math.max(1, g - pipeTop), t.dark)
  s.rect(px, pipeTop, 1, Math.max(1, g - pipeTop), t.lite)
  s.rect(px - 2, g - 4, pw + 4, 2, t.deep)
  s.rect(px - 3, pipeTop, pw + 6, 2, t.base)
  const wr = Math.max(4, Math.min(bw * 0.34, c.h * 0.2))
  const wy = top + Math.max(4, c.h * 0.22)
  pring(s, c.cx, wy, wr, wr, Math.max(1.5, wr * 0.18), t.accent)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4
    pspoke(s, c.cx, wy, a, wr, t.accent, 1)
  }
  s.disc(c.cx, wy, Math.max(1.5, wr * 0.2), t.deep)
  s.rect(c.cx - 1, wy, 2, Math.max(1, pipeTop - wy), t.dark)
  s.thick(px + pw, g * 0.62, x1 - 2, g * 0.62, 1.2, t.dark)
  s.thick(px + pw, g * 0.62 - 0.6, x1 - 2, g * 0.62 - 0.6, 0.6, t.base)
  s.px(x1 - 3, g * 0.62, t.lite)
  if (v === 2) s.disc(x1 - 4, g * 0.62, 2, t.deep)
}

/** 机器人：双腿 + 躯干 + 头（横条眼）+ 天线 + 单臂。 */
function drawRobot(s, c) {
  const { bw, g, top, t, v } = c
  const torsoW = Math.max(5, bw * 0.44)
  const tx = c.cx - torsoW / 2
  const legTop = g - Math.max(4, c.h * 0.2)
  const torsoTop = top + Math.max(4, c.h * 0.26)
  s.rect(tx + 1, legTop, 2, Math.max(1, g - legTop - 2), t.dark)
  s.rect(tx + torsoW - 3, legTop, 2, Math.max(1, g - legTop - 2), t.dark)
  s.rect(tx - 1, g - 3, Math.max(3, torsoW * 0.3), 3, t.deep)
  s.rect(tx + torsoW - Math.max(2, torsoW * 0.3), g - 3, Math.max(3, torsoW * 0.3), 3, t.deep)
  pbox(s, tx, torsoTop, torsoW, Math.max(2, legTop - torsoTop), t)
  s.rect(tx + 2, torsoTop + 3, Math.max(1, torsoW - 4), 1, t.deep)
  s.rect(tx + 2, torsoTop + 5, Math.max(1, torsoW - 4), 1, t.deep)
  s.disc(tx + torsoW - 3, torsoTop + 3, 1.5, PAL.neonRed)
  const hw = Math.max(4, torsoW * 0.66)
  const hh = Math.max(3, c.h * 0.16)
  const hx = c.cx - hw / 2
  const hy = Math.max(1, torsoTop - hh - 2)
  pbox(s, hx, hy, hw, hh, t)
  s.rect(hx + 2, hy + Math.round(hh * 0.35), Math.max(1, hw - 4), Math.max(1, hh * 0.25), v === 2 ? PAL.neonRed : PAL.neon)
  c.glowPos = { x: c.cx, y: hy + hh * 0.5 }
  s.rect(c.cx - 0.5, hy - 4, 1, Math.max(1, hy), t.dark)
  s.px(c.cx, hy - 5, PAL.neonWarm)
  s.disc(tx, torsoTop + 2, 1.5, t.lite)
  s.disc(tx + torsoW, torsoTop + 2, 1.5, t.lite)
  if (v === 1) {
    s.thick(tx + torsoW, torsoTop + 3, tx + torsoW + bw * 0.18, torsoTop - 2, 1.2, t.dark)
    s.disc(tx + torsoW + bw * 0.18, torsoTop - 2, 2, t.base)
    s.thick(tx, torsoTop + 3, tx - bw * 0.1, legTop - 2, 1.2, t.dark)
  } else {
    s.thick(tx, torsoTop + 3, tx - bw * 0.14, torsoTop + c.h * 0.2, 1.2, t.dark)
    s.thick(tx + torsoW, torsoTop + 3, tx + torsoW + bw * 0.12, torsoTop + c.h * 0.2, 1.2, t.dark)
    s.px(tx + torsoW + bw * 0.12, torsoTop + c.h * 0.2 + 1, t.lite)
  }
}

/** 手推车：平板 + 三个小轮 + 右侧推把 + 车上货箱。 */
function drawCart(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const wheelR = Math.max(2, Math.min(c.h * 0.12, bw * 0.1))
  const platY = g - wheelR * 2 - Math.max(2, c.h * 0.08)
  const platH = Math.max(2, Math.round(c.h * 0.07))
  pbox(s, x0 + 1, platY, bw - 2, platH, t)
  const wy = g - wheelR
  for (const wx of [x0 + wheelR + 2, c.cx, x1 - wheelR - 1]) {
    s.disc(wx, wy, wheelR, t.deep)
    s.disc(wx, wy, wheelR - 1, PAL.oilSheen)
    s.disc(wx, wy, Math.max(0.8, wheelR * 0.35), t.dark)
  }
  const hx = x1 - Math.max(2, bw * 0.08)
  const hy = top + Math.max(1, c.h * 0.1)
  s.thick(hx, platY, hx, hy, 1.2, t.dark)
  s.thick(hx, hy, Math.max(x0, hx - Math.round(bw * 0.18)), hy, 1.2, t.dark)
  s.rect(hx - 2, platY - 3, 2, 3, t.base)
  const cargoW = Math.max(4, bw * 0.28)
  const cargoH = Math.max(3, c.h * 0.2)
  pbox(s, x0 + 3, platY - cargoH, cargoW, cargoH, {
    base: mix(t.base, t.lite, 0.3),
    lite: t.lite,
    dark: t.dark,
  })
  s.line(x0 + 3, platY - cargoH, x0 + 3 + cargoW, platY, t.deep)
  if (v === 2) {
    s.ell(x0 + bw * 0.62, platY - 2, Math.max(2, bw * 0.1), Math.max(2, c.h * 0.09), t.base)
    s.ell(x0 + bw * 0.62, platY - 2, Math.max(1, bw * 0.06), Math.max(1, c.h * 0.05), t.deep)
  }
  if (v === 3) s.rect(x0 + 1, platY + platH, bw - 2, 1, t.deep)
}

/** 雕像：双层基座 + 长袍人形 + 抬起/断掉的手臂。 */
function drawStatue(s, c) {
  const { bw, g, top, t, v } = c
  const baseH = Math.max(2, Math.round(c.h * 0.11))
  const baseW = bw * 0.8
  const bx = c.cx - baseW / 2
  pbox(s, bx, g - baseH, baseW, baseH, t)
  pbox(s, bx + baseW * 0.1, g - baseH * 2, baseW * 0.8, Math.max(1, baseH * 0.6), t)
  const figBot = g - baseH * 2 - 1
  const figW = Math.max(4, bw * 0.28)
  const figTop = top + Math.max(2, c.h * 0.12)
  const shoulderY = figTop + (figBot - figTop) * 0.28
  s.poly(
    [
      [c.cx - figW / 2, figBot],
      [c.cx - figW * 0.3, shoulderY],
      [c.cx + figW * 0.3, shoulderY],
      [c.cx + figW / 2, figBot],
    ],
    t.base,
  )
  s.line(c.cx - figW * 0.3, shoulderY, c.cx + figW * 0.3, shoulderY, t.lite)
  for (let i = 0; i < 3; i++) {
    pvline(s, c.cx - figW * 0.2 + i * Math.max(1, figW * 0.18), shoulderY + 2, figBot - 1, t.dark)
  }
  s.disc(c.cx, figTop, Math.max(1.5, figW * 0.3), t.lite)
  s.disc(c.cx, figTop, Math.max(1, figW * 0.18), t.base)
  if (v === 1) {
    s.thick(c.cx + figW * 0.3, shoulderY, c.cx + figW * 0.72, figTop + 2, 1, t.base)
    s.disc(c.cx + figW * 0.72, figTop + 2, 1.5, t.lite)
  } else if (v === 2) {
    s.thick(c.cx - figW * 0.3, shoulderY, c.cx - figW * 0.62, shoulderY + c.h * 0.18, 1, t.base)
  } else {
    s.rect(c.cx - figW * 0.42, shoulderY, 2, Math.max(1, c.h * 0.06), t.deep)
  }
  if (v === 3) {
    s.line(c.cx - figW * 0.2, figTop + 2, c.cx + figW * 0.1, figBot - 2, t.deep)
  }
}

/** 楼梯：向右逐级升高的阶梯块 + 栏杆斜线。 */
function drawStair(s, c) {
  const { x0, bw, g, top, t, v } = c
  const n = 4 + (v % 2)
  const stepW = Math.max(2, bw / n)
  for (let i = 0; i < n; i++) {
    const topY = g - Math.round(((i + 1) / n) * (g - top - 2))
    s.rect(x0 + i * stepW, topY, stepW + 1, Math.max(1, g - topY), t.base)
    s.rect(x0 + i * stepW, topY, stepW + 1, 1, t.lite)
    s.rect(x0 + i * stepW, topY, 1, Math.max(1, g - topY), t.dark)
  }
  for (let i = 0; i < n; i += 2) {
    const sx = x0 + i * stepW + stepW * 0.5
    const sy = g - Math.round(((i + 1) / n) * (g - top - 2))
    s.rect(sx, sy - Math.max(2, c.h * 0.13), 1, Math.max(2, c.h * 0.13), t.deep)
  }
  s.thick(x0 + stepW * 0.5, g - (g - top) / n - Math.max(2, c.h * 0.13), c.x1 - stepW * 0.5, top + 1, 1, t.dark)
  if (v === 3) s.rect(x0, g - 3, stepW, 3, t.deep)
}

/** 护栏：2~3 根立柱 + 上下横杆，横向条状剪影。 */
function drawRail(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const postW = Math.max(1.5, bw * 0.035)
  const railY = top + Math.max(2, c.h * 0.12)
  const midY = railY + (g - railY) * 0.45
  const posts = 2 + (v % 2)
  for (let i = 0; i < posts; i++) {
    const px = x0 + 1 + ((bw - 2) * i) / (posts - 1 || 1)
    s.rect(px - postW / 2, railY, postW, Math.max(1, g - railY), t.dark)
    s.rect(px - postW / 2, railY, 1, Math.max(1, g - railY), t.lite)
    s.rect(px - postW / 2 - 1, g - 1, postW + 2, 1, t.deep)
  }
  const railH = Math.max(1, Math.round(c.h * 0.05))
  s.rect(x0, railY - railH, bw, railH, t.base)
  s.rect(x0, railY - railH, bw, 1, t.lite)
  s.rect(x0, railY - railH + railH - 1, bw, 1, t.dark)
  s.rect(x0, midY, bw, Math.max(1, Math.round(c.h * 0.03)), t.dark)
  if (v === 2) {
    s.line(x0 + bw * 0.3, railY, x0 + bw * 0.42, railY - 4, t.deep)
    s.rect(x0 + bw * 0.42, railY - 5, 5, 1, t.deep)
  }
  if (v === 3) {
    s.line(x0 + 2, railY, x1 - 2, railY + 3, t.deep)
  }
}

/** 画框：倾斜空心矩形框 + 暗色内腔 + 斜撑 + 角钉。 */
function drawFrame(s, c) {
  const { bw, g, top, t, v } = c
  const fw = Math.round(bw * 0.86)
  const fh = Math.max(5, Math.round(c.h * 0.72))
  const fx = c.cx - fw / 2
  const fy = top + Math.max(1, Math.round(c.h * 0.05))
  const lean = Math.round(fw * 0.05)
  s.poly(
    [
      [fx + lean, fy],
      [fx + fw + lean, fy],
      [fx + fw, fy + fh],
      [fx, fy + fh],
    ],
    t.base,
  )
  const b = Math.max(2, Math.round(fw * 0.08))
  s.poly(
    [
      [fx + b + lean * 0.8, fy + b],
      [fx + fw - b + lean * 0.8, fy + b],
      [fx + fw - b, fy + fh - b],
      [fx + b, fy + fh - b],
    ],
    VOID,
  )
  s.line(fx + b + lean * 0.8, fy + b, fx + fw - b + lean * 0.8, fy + b, t.deep)
  s.line(fx + b, fy + fh - b, fx + fw - b, fy + fh - b, t.lite)
  for (let i = 1; i < 3; i++) {
    phline(s, fx + 1, fx + fw - 1, fy + Math.round((fh * i) / 3), t.deep)
  }
  if (v >= 2) s.line(fx + b, fy + b, fx + fw - b, fy + fh - b, t.deep)
  s.rect(fx, fy + fh, fw, 1, t.deep)
  pstud(s, fx + lean + 2, fy + 2, t.lite, t.deep)
  pstud(s, fx + fw + lean - 3, fy + 2, t.lite, t.deep)
}

/** 桅杆：细塔身 + 多层横担 + 斜拉 + 小锅 + 顶灯。 */
function drawMast(s, c) {
  const { bw, g, top, t, v } = c
  const mw = Math.max(2, Math.round(bw * 0.12))
  const mx = c.cx - mw / 2
  s.rect(mx, top + 2, mw, Math.max(1, g - top - 2), t.dark)
  s.rect(mx, top + 2, 1, Math.max(1, g - top - 2), t.lite)
  const bars = 3 + (v % 2)
  for (let i = 0; i < bars; i++) {
    const y = top + 4 + Math.round(((g - top - 8) * i) / (bars - 1 || 1))
    const halfW = Math.max(3, bw * (0.2 + 0.1 * (i % 2)))
    s.rect(c.cx - halfW, y, halfW * 2, Math.max(1, Math.round(c.h * 0.02)), t.base)
    s.px(c.cx - halfW, y, t.lite)
    s.px(c.cx + halfW, y, t.lite)
    s.line(mx, y + 2, c.cx - halfW, y, t.deep)
    s.line(mx + mw, y + 2, c.cx + halfW, y, t.deep)
  }
  if (v >= 1) {
    s.ell(c.cx + bw * 0.18, top + c.h * 0.2, Math.max(2, bw * 0.12), Math.max(1.5, c.h * 0.04), t.lite)
    s.line(c.cx + bw * 0.18, top + c.h * 0.2, mx + mw, top + c.h * 0.2 + 2, t.deep)
  }
  s.rect(c.cx - 1, top, 2, 2, PAL.neonRed)
  c.glowPos = { x: c.cx, y: top + 2 }
}

/** 太阳能板：右高左低的平行四边形板 + 电池格 + A 形支架。 */
function drawSolar(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const tilt = v === 1 ? 0.55 : v === 2 ? 0.32 : 0.45
  const topY = top + Math.max(1, Math.round(c.h * 0.1))
  const panelH = Math.max(4, Math.round(c.h * 0.4))
  const px0 = x0 + Math.round(bw * 0.05)
  const px1 = x1 - Math.round(bw * 0.03)
  const dyL = Math.round(panelH * tilt)
  const A = [px0 + 1, topY + dyL + 1]
  const B = [px1 - 2, topY + 1]
  const C = [px1 - 1, topY + 3]
  const D = [px0 + 2, topY + dyL + 2]
  s.poly(
    [
      [px0, topY + dyL],
      [px1 - 2, topY],
      [px1, topY + 2],
      [px0 + 2, topY + dyL + 2],
    ],
    t.deep,
  )
  s.poly([A, B, C, D], mix(PAL.steelBlue, VOID, 0.5))
  const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
  for (let i = 1; i < 5; i++) {
    const k = i / 5
    const p = lerp(A, B, k)
    const q = lerp(D, C, k)
    s.line(p[0], p[1], q[0], q[1], PAL.steelDark)
  }
  for (let j = 1; j < 3; j++) {
    const k = j / 3
    const p = lerp(A, D, k)
    const q = lerp(B, C, k)
    s.line(p[0], p[1], q[0], q[1], PAL.steelDark)
  }
  s.line(A[0], A[1], B[0], B[1], t.lite)
  const legTop = topY + panelH * 0.6
  s.thick(px0 + bw * 0.2, legTop, px0 + bw * 0.1, g, 1.2, t.dark)
  s.thick(px1 - bw * 0.15, legTop, px1 - bw * 0.05, g, 1.2, t.dark)
  s.thick(px0 + bw * 0.2, legTop, px1 - bw * 0.3, g, 1, t.deep)
  if (v === 3) s.rect(px0, g - 1, px1 - px0, 1, t.deep)
}

/** 帐篷：三角斜面 + 门帘 + 拉绳 + 顶杆。 */
function drawTent(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const apexX = c.cx - bw * (v === 1 ? 0.05 : 0)
  const apexY = top + Math.max(1, Math.round(c.h * 0.06))
  const baseY = g - 1
  s.poly(
    [
      [apexX, apexY],
      [x1, baseY],
      [x0, baseY],
    ],
    t.base,
  )
  s.poly(
    [
      [apexX, apexY],
      [x0 + bw * 0.1, baseY],
      [x0, baseY],
    ],
    t.dark,
  )
  s.poly(
    [
      [apexX + bw * 0.02, apexY + c.h * 0.1],
      [x1 - bw * 0.06, baseY],
      [c.cx + bw * 0.05, baseY],
    ],
    t.deep,
  )
  s.line(apexX, apexY, x1, baseY, t.lite)
  s.line(c.cx + bw * 0.05, baseY - 2, x1 - bw * 0.06, baseY - 2, t.lite)
  s.line(apexX, apexY + 2, x0 - 2, baseY, t.deep)
  s.line(apexX, apexY + 2, x1 + 2, baseY, t.deep)
  s.rect(apexX, apexY - Math.max(2, Math.round(c.h * 0.08)), 1, Math.max(2, Math.round(c.h * 0.08)), t.dark)
  s.px(x0 - 2, baseY, t.deep)
  s.px(x1 + 2, baseY, t.deep)
  if (v === 3) {
    s.poly(
      [
        [apexX, apexY + c.h * 0.12],
        [apexX + bw * 0.16, baseY - 2],
        [apexX + bw * 0.05, baseY - 2],
      ],
      PAL.bloodDark,
    )
  }
}

/** 篝火：石圈 + 交叉柴 + 三层火舌 + 火星（记下光斑位置）。 */
function drawFire(s, c) {
  const { x0, bw, g, top, t, v } = c
  for (let i = 0; i < 5; i++) {
    const x = x0 + bw * (0.1 + 0.2 * i)
    s.ell(x, g - 2, Math.max(1.5, bw * 0.08), Math.max(1, c.h * 0.05), PAL.ashPale)
  }
  s.ell(c.cx, g - 1, Math.max(3, bw * 0.34), Math.max(1, c.h * 0.05), PAL.ash)
  for (let i = 0; i < 3; i++) {
    const a = -0.5 + i * 0.5
    s.thick(c.cx - Math.cos(a) * bw * 0.22, g - 1 - Math.sin(a) * 2, c.cx + Math.cos(a) * bw * 0.22, g - 1 + Math.sin(a) * 2, 1.2, i % 2 ? t.dark : PAL.rustDark)
    s.px(c.cx + Math.cos(a) * bw * 0.22, g - 1, PAL.rust)
  }
  const fh = Math.max(5, c.h * 0.5)
  const fw = Math.max(4, bw * 0.4)
  const baseY = g - 3
  s.poly(
    [
      [c.cx - fw / 2, baseY],
      [c.cx - fw * 0.18, baseY - fh * 0.7],
      [c.cx - fw * 0.02, baseY - fh * 0.45],
      [c.cx + fw * 0.04, top + 1],
      [c.cx + fw * 0.3, baseY - fh * 0.55],
      [c.cx + fw / 2, baseY],
    ],
    PAL.rustHot,
  )
  s.poly(
    [
      [c.cx - fw * 0.28, baseY],
      [c.cx - fw * 0.05, baseY - fh * 0.45],
      [c.cx + fw * 0.05, baseY - fh * 0.75],
      [c.cx + fw * 0.2, baseY - fh * 0.35],
      [c.cx + fw * 0.22, baseY],
    ],
    PAL.neonWarm,
  )
  s.poly(
    [
      [c.cx - fw * 0.1, baseY],
      [c.cx, baseY - fh * 0.35],
      [c.cx + fw * 0.1, baseY],
    ],
    PAL.white,
  )
  c.glowPos = { x: c.cx, y: baseY - fh * 0.35 }
  if (v >= 1) {
    for (let i = 0; i < 3; i++) {
      s.px(c.cx + (i - 1) * fw * 0.35, top + 2 + (i % 2) * 3, PAL.neonWarm)
    }
  }
  if (v === 3) s.thick(c.x1 - 2, g - 2, c.x1 - 2, top + c.h * 0.2, 1, PAL.steelDark)
}

/** 沙袋：2~3 排交错叠放的圆角袋，带缝线。 */
function drawSandbag(s, c) {
  const { x0, x1, bw, g, t, v } = c
  const rows = 2 + (v % 2)
  const bagW = Math.max(4, bw / 3.2)
  const bagH = Math.max(2.5, c.h * 0.22)
  for (let r = 0; r < rows; r++) {
    const y = g - (r + 1) * bagH + 1
    const off = r % 2 ? bagW * 0.45 : 0
    const n = Math.max(1, Math.ceil((bw - off) / bagW))
    for (let i = 0; i < n; i++) {
      const bx = x0 + off + i * bagW
      const w = Math.min(bagW - 1, x1 - bx)
      if (w < 2) continue
      s.poly(
        [
          [bx, y + bagH * 0.5],
          [bx + w * 0.15, y + bagH * 0.1],
          [bx + w * 0.5, y],
          [bx + w * 0.85, y + bagH * 0.12],
          [bx + w, y + bagH * 0.55],
          [bx + w * 0.8, y + bagH],
          [bx + w * 0.2, y + bagH],
        ],
        r === rows - 1 ? mix(t.base, t.lite, 0.25) : t.base,
      )
      s.line(bx + w * 0.2, y + bagH * 0.2, bx + w * 0.7, y + bagH * 0.2, t.lite)
      s.rect(bx + Math.round(w * 0.45), y + 1, 1, Math.max(1, Math.round(bagH) - 2), t.deep)
    }
  }
  s.rect(x0, g, bw, 1, t.deep)
}

/** 栅栏：密排尖头板条 + 两道横杆 + 一根断板。 */
function drawFence(s, c) {
  const { x0, x1, bw, g, top, t, v } = c
  const n = Math.max(4, Math.min(10, Math.round(bw / Math.max(3, c.w * 0.09))))
  const sw = bw / n
  const railY = top + Math.max(2, Math.round(c.h * 0.18))
  const rail2 = railY + Math.max(2, Math.round(c.h * 0.35))
  const railH = Math.max(1, Math.round(c.h * 0.04))
  s.rect(x0, railY, bw, railH, t.dark)
  s.rect(x0, rail2, bw, railH, t.dark)
  for (let i = 0; i < n; i++) {
    const sx = x0 + i * sw + sw * 0.25
    const broken = v === 2 && i === Math.floor(n * 0.6)
    const topY = broken ? railY + Math.max(2, Math.round(c.h * 0.1)) : top + Math.max(1, Math.round(c.h * 0.05))
    const swW = Math.max(1, sw * 0.5)
    s.poly(
      [
        [sx, topY + 2],
        [sx + swW * 0.5, topY],
        [sx + swW, topY + 2],
      ],
      t.base,
    )
    s.rect(sx, topY + 2, swW, Math.max(1, g - topY - 2), t.base)
    s.rect(sx, topY + 2, 1, Math.max(1, g - topY - 2), t.lite)
    s.rect(sx + swW - 1, topY + 2, 1, Math.max(1, g - topY - 2), t.dark)
  }
  s.rect(x0, g - 1, bw, 1, t.deep)
  if (v === 3) s.thick(x0 + 1, railY, x1 - 1, rail2 + 2, 1, t.deep)
}

/** 工具：斜靠的铲 / 耙 / 扳手 + 工具箱。 */
function drawTool(s, c) {
  const { x0, bw, g, top, t, v } = c
  const boxW = Math.max(4, bw * 0.3)
  const boxH = Math.max(3, c.h * 0.16)
  pbox(s, x0 + 2, g - boxH, boxW, boxH, t)
  s.rect(x0 + 2, g - boxH - 2, 2, 2, t.deep)
  const tools = 2 + (v % 2)
  for (let i = 0; i < tools; i++) {
    const bx = x0 + bw * (0.25 + 0.2 * i)
    const tx = bx + bw * 0.22
    s.thick(bx, g - 1, tx, top + 2, 1, t.dark)
    s.thick(bx, g - 2, tx, top + 3, 0.5, t.base)
    if (i % 2 === 0) {
      s.poly(
        [
          [tx - 2, top + 1],
          [tx + 2, top + 1],
          [tx + 1, top + 4],
          [tx - 1, top + 4],
        ],
        t.lite,
      )
    } else {
      pring(s, tx, top + 3, 2.5, 2.5, 1, t.lite)
      s.rect(tx, top + 5, 1, 3, t.lite)
    }
  }
  if (v === 3) s.thick(c.x1 - 2, top + 2, c.x1 - 2, g - 1, 1, t.deep)
}

/** base 分发表：35 个 base 全部在此；未知 base 退回 panel。 */
const BASE_DRAW = {
  cabinet: drawCabinet,
  shelf: drawShelf,
  desk: drawDesk,
  bed: drawBed,
  chair: drawChair,
  barrel: drawBarrel,
  crate: drawCrate,
  pipe: drawPipe,
  sign: drawSign,
  lamp: drawLamp,
  machine: drawMachine,
  screen: drawScreen,
  door: drawDoor,
  window: drawWindow,
  debris: drawDebris,
  plant: drawPlant,
  body: drawBody,
  cable: drawCable,
  fan: drawFan,
  tank: drawTank,
  panel: drawPanel,
  valve: drawValve,
  robot: drawRobot,
  cart: drawCart,
  statue: drawStatue,
  stair: drawStair,
  rail: drawRail,
  frame: drawFrame,
  mast: drawMast,
  solar: drawSolar,
  tent: drawTent,
  fire: drawFire,
  sandbag: drawSandbag,
  fence: drawFence,
  tool: drawTool,
}

/* ============================================================================
 * 4. parts 装饰（24 种）
 * --------------------------------------------------------------------------
 * 每个部件都先拿一个“已不透明的锚点”，再在锚点附近画小结构，保证装饰
 * 不会飘在空气里；覆盖范围很小，不破坏 base 剪影。
 * ========================================================================== */

/** 随机取一个已不透明像素（确定性；失败则退回画布中心）。 */
function opaquePoint(s, rnd, x0, x1, y0, y1) {
  const ax = x0 == null ? 1 : x0
  const bx = x1 == null ? s.w - 2 : x1
  const ay = y0 == null ? 1 : y0
  const by = y1 == null ? s.h - 3 : y1
  for (let k = 0; k < 48; k++) {
    const x = Math.round(ax + rnd() * Math.max(0, bx - ax))
    const y = Math.round(ay + rnd() * Math.max(0, by - ay))
    if (s.solid(x, y)) return { x, y }
  }
  return { x: Math.round((ax + bx) / 2), y: Math.round((ay + by) / 2) }
}

function partRebar(s, c) {
  const p = opaquePoint(s, c.rnd)
  const len = 3 + Math.round(c.rnd() * Math.max(2, c.w * 0.12))
  const dir = c.rnd() < 0.5 ? 1 : -1
  const x2 = p.x + dir * len
  const y2 = p.y - Math.max(2, len * 0.8)
  s.thick(p.x, p.y, x2, y2, 0.9, c.t.deep)
  s.thick(p.x, p.y, x2, y2, 0.4, PAL.rustLight)
  s.px(x2 + dir, y2 - 1, PAL.rustDark)
}

function partBolt(s, c) {
  const p = opaquePoint(s, c.rnd)
  for (let i = 0; i < 3; i++) {
    const x = p.x + i * 3
    if (!s.solid(x, p.y)) continue
    s.set(x, p.y, c.t.deep, 1)
    s.px(x, p.y - 1, c.t.lite)
  }
}

function partStain(s, c) {
  const p = opaquePoint(s, c.rnd)
  const rx = Math.max(1.5, 2 + c.rnd() * 2.5)
  const ry = Math.max(1, 1 + c.rnd() * 1.6)
  s.ell(p.x, p.y, rx, ry, PAL.oil)
  s.speck(p.x - rx, p.y - ry, rx * 2, ry * 2, PAL.rustDark, 0.4)
}

function partTape(s, c) {
  const p = opaquePoint(s, c.rnd)
  const dir = c.rnd() < 0.5 ? 1 : -1
  s.line(p.x - 3, p.y, p.x + 3, p.y + dir * 2, PAL.sand)
  s.line(p.x - 3, p.y + 1, p.x + 3, p.y + 1 + dir * 2, PAL.boneDark)
  s.px(p.x + 3, p.y + dir * 2, PAL.white)
}

function partHandle(s, c) {
  const p = opaquePoint(s, c.rnd)
  const x = Math.min(s.w - 5, Math.max(1, p.x))
  const y = Math.max(1, Math.min(s.h - 3, p.y))
  s.line(x, y - 2, x, y + 2, c.t.deep)
  s.line(x + 4, y - 2, x + 4, y + 2, c.t.deep)
  s.line(x, y - 2, x + 4, y - 2, c.t.deep)
  s.px(x + 2, y - 2, c.t.lite)
}

function partWire(s, c) {
  const y = c.g - Math.max(3, Math.round(c.h * 0.18))
  const pts = [
    [c.x0 + 2, y],
    [c.cx - c.bw * 0.2, y + 3],
    [c.cx + c.bw * 0.15, y + 4],
    [c.x1 - 2, y + 1],
  ]
  for (let i = 0; i + 1 < pts.length; i++) {
    s.thick(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0.9, PAL.oil)
    s.thick(pts[i][0], pts[i][1] - 0.6, pts[i + 1][0], pts[i + 1][1] - 0.6, 0.4, PAL.oilSheen)
  }
  s.rect(pts[3][0] - 2, pts[3][1], 2, 2, c.t.deep)
}

function partLabel(s, c) {
  const p = opaquePoint(s, c.rnd)
  const w = 4 + Math.floor(c.rnd() * 3)
  const h = 3 + Math.floor(c.rnd() * 2)
  s.rect(p.x, p.y, w, h, PAL.paper)
  s.rect(p.x, p.y + h - 1, w, 1, PAL.boneDark)
  for (let i = 0; i < 2; i++) s.rect(p.x + 1, p.y + 1 + i, w - 2, 1, PAL.ink)
}

function partGlass(s, c) {
  const p = opaquePoint(s, c.rnd)
  s.poly(
    [
      [p.x, p.y - 4],
      [p.x + 3, p.y - 1],
      [p.x + 1, p.y + 3],
    ],
    mix(PAL.glass, PAL.white, 0.3),
  )
  s.line(p.x, p.y - 4, p.x + 3, p.y - 1, PAL.white)
  s.px(p.x + 1, p.y + 3, PAL.waterHi)
}

function partCloth(s, c) {
  const p = opaquePoint(s, c.rnd)
  const w = 3 + Math.floor(c.rnd() * 3)
  const h = 4 + Math.floor(c.rnd() * 4)
  s.poly(
    [
      [p.x, p.y],
      [p.x + w, p.y],
      [p.x + w - 1, p.y + h],
      [p.x + w * 0.6, p.y + h - 1],
      [p.x + w * 0.3, p.y + h],
      [p.x, p.y + h - 1],
    ],
    mix(c.t.base, c.t.accent, 0.45),
  )
  s.line(p.x + 1, p.y, p.x + w - 1, p.y, c.t.lite)
}

function partLed(s, c) {
  const p = opaquePoint(s, c.rnd)
  s.rect(p.x, p.y, 2, 2, c.t.deep)
  s.rect(p.x, p.y, 1, 1, c.t.accent)
  s.px(p.x + 1, p.y, PAL.white)
}

function partRust(s, c) {
  const p = opaquePoint(s, c.rnd)
  const len = 3 + Math.round(c.rnd() * Math.max(3, c.h * 0.18))
  for (let i = 0; i < len; i++) {
    if (c.rnd() < 0.25) continue
    const x = p.x + (c.rnd() < 0.25 ? 1 : 0)
    if (!s.solid(x, p.y + i)) continue
    s.set(x, p.y + i, c.rnd() < 0.55 ? PAL.rustDark : PAL.rust, 1)
  }
}

function partDent(s, c) {
  const p = opaquePoint(s, c.rnd)
  s.ell(p.x, p.y, 3, 1.5, c.t.deep)
  s.line(p.x - 2, p.y - 2, p.x + 2, p.y - 2, c.t.lite)
  s.px(p.x + 2, p.y - 1, c.t.lite)
}

function partStrap(s, c) {
  const p = opaquePoint(s, c.rnd)
  const top = Math.max(1, p.y - 5)
  const bot = Math.min(s.h - 2, p.y + 5)
  s.rect(p.x - 2, top, 2, bot - top, c.t.dark)
  s.rect(p.x + 3, top, 2, bot - top, c.t.dark)
  s.rect(p.x - 2, p.y, 2, 2, c.t.lite)
  s.rect(p.x + 3, p.y, 2, 2, c.t.lite)
  s.px(p.x, p.y, c.t.deep)
}

function partGauge(s, c) {
  const p = opaquePoint(s, c.rnd)
  s.disc(p.x, p.y, 2.5, c.t.deep)
  s.disc(p.x, p.y, 1.8, PAL.paper)
  s.line(p.x, p.y, p.x + 1.5, p.y - 1.5, PAL.ink)
  s.px(p.x - 1, p.y - 1, PAL.boneDark)
  s.px(p.x + 1, p.y + 1, PAL.boneDark)
}

function partHasp(s, c) {
  const p = opaquePoint(s, c.rnd)
  s.rect(p.x - 2, p.y - 1, 5, 3, c.t.deep)
  s.rect(p.x - 1, p.y, 3, 1, c.t.lite)
  s.line(p.x, p.y + 2, p.x, p.y + 4, c.t.dark)
  s.px(p.x, p.y + 4, PAL.steelWhite)
}

function partVent(s, c) {
  const p = opaquePoint(s, c.rnd)
  for (let i = 0; i < 3; i++) {
    s.rect(p.x - 3, p.y + i * 2, 7, 1, c.t.deep)
    if (s.solid(p.x - 3, p.y + i * 2 + 1)) s.rect(p.x - 3, p.y + i * 2 + 1, 7, 1, c.t.lite)
  }
}

function partWheel(s, c) {
  const p = opaquePoint(s, c.rnd)
  s.disc(p.x, p.y, 2.5, c.t.deep)
  s.disc(p.x, p.y, 1.8, PAL.oilSheen)
  s.disc(p.x, p.y, 0.9, c.t.dark)
  s.px(p.x - 1, p.y - 2, c.t.lite)
}

function partChain(s, c) {
  const p = opaquePoint(s, c.rnd)
  const dir = c.rnd() < 0.5 ? 1 : -1
  for (let i = 0; i < 4; i++) {
    const cx = p.x + dir * (i * 2.2)
    const cy = Math.min(s.h - 2, p.y + i * 1.8)
    pring(s, cx, cy, 1.6, 1, 1, i % 2 ? PAL.steelLight : c.t.dark)
  }
}

function partPaper(s, c) {
  const p = opaquePoint(s, c.rnd)
  s.poly(
    [
      [p.x, p.y],
      [p.x + 4, p.y - 1],
      [p.x + 5, p.y + 3],
      [p.x + 1, p.y + 4],
    ],
    PAL.paper,
  )
  s.line(p.x + 1, p.y + 1, p.x + 4, p.y + 3, PAL.boneDark)
  s.px(p.x + 3, p.y + 1, PAL.ink)
}

function partBone(s, c) {
  const p = opaquePoint(s, c.rnd)
  const dir = c.rnd() < 0.5 ? 1 : -1
  const x2 = p.x + dir * 4
  s.thick(p.x, p.y, x2, p.y - 1, 0.9, PAL.boneDeep)
  s.thick(p.x, p.y, x2, p.y - 1, 0.4, PAL.bone)
  s.disc(p.x, p.y, 1.6, PAL.boneDark)
  s.disc(x2, p.y - 1, 1.6, PAL.boneDark)
  s.px(p.x, p.y - 1, PAL.white)
}

function partAsh(s, c) {
  const p = opaquePoint(s, c.rnd)
  for (let i = 0; i < 5; i++) {
    s.px(p.x + (c.rnd() - 0.5) * 5, p.y + (c.rnd() - 0.5) * 4, PAL.ashPale)
  }
  s.speck(p.x - 3, p.y - 2, 6, 4, PAL.ashLight, 0.5)
}

function partDust(s, c) {
  const p = opaquePoint(s, c.rnd, 1, s.w - 2, c.g - Math.round(c.h * 0.14), c.g)
  s.ell(p.x, p.y, Math.max(2, c.bw * 0.1), 1, PAL.dust)
  s.speck(p.x - 3, p.y - 1, 6, 2, PAL.dustLight, 0.45)
}

function partSand(s, c) {
  const p = opaquePoint(s, c.rnd, 1, s.w - 2, c.g - 3, c.g)
  for (let i = 0; i < 7; i++) {
    s.px(p.x + (c.rnd() - 0.5) * 8, p.y + Math.round((c.rnd() - 0.5) * 2), PAL.sandDark)
  }
  s.px(p.x, p.y - 1, PAL.sand)
}

function partStone(s, c) {
  const p = opaquePoint(s, c.rnd, 1, s.w - 2, c.g - 4, c.g)
  for (let i = 0; i < 3; i++) {
    const x = p.x + (c.rnd() - 0.5) * 6
    const y = p.y + (c.rnd() - 0.5) * 2
    const r = 1 + c.rnd() * 1.5
    s.ell(x, y, r, r * 0.7, i % 2 ? PAL.ashPale : PAL.dustLight)
    s.px(x - 0.5, y - 1, PAL.dust)
  }
}

const PART_DRAW = {
  rebar: partRebar,
  bolt: partBolt,
  stain: partStain,
  tape: partTape,
  handle: partHandle,
  wire: partWire,
  label: partLabel,
  glass: partGlass,
  cloth: partCloth,
  led: partLed,
  rust: partRust,
  dent: partDent,
  strap: partStrap,
  gauge: partGauge,
  hasp: partHasp,
  vent: partVent,
  wheel: partWheel,
  chain: partChain,
  paper: partPaper,
  bone: partBone,
  ash: partAsh,
  dust: partDust,
  sand: partSand,
  stone: partStone,
}

/** 挂 2~5 个装饰（按 variant 轮转起点，保证同 base 不同 variant 也不雷同）。 */
function drawParts(s, c) {
  const list = c.parts.filter((p) => typeof p === 'string' && PART_DRAW[p])
  if (list.length === 0) return
  const count = Math.min(5, Math.max(2, list.length))
  const start = list.length ? c.v % list.length : 0
  for (let i = 0; i < count; i++) {
    PART_DRAW[list[(start + i) % list.length]](s, c)
  }
}

/* ============================================================================
 * 5. 通用收尾：细节线 / 磨损 / 倾斜 / 光斑
 * ========================================================================== */

/** 面板分缝 + 铆钉（detail 1~4）。 */
function drawDetail(s, c) {
  const d = c.detail
  const span = Math.max(1, c.g - c.top)
  if (c.bw < 6 || span < 6) return
  for (let i = 0; i < d; i++) {
    const y = c.top + Math.round(span * (0.16 + 0.18 * i))
    phline(s, c.x0, c.x1, y, c.t.deep)
    const step = Math.max(4, Math.round(c.bw / 7))
    for (let x = c.x0 + 3; x <= c.x1 - 2; x += step) {
      pstud(s, x, y - 2, c.t.lite, c.t.deep)
    }
  }
  if (d >= 3) {
    pvline(s, c.cx + Math.round(c.bw * 0.2), c.top + 2, c.g - 2, c.t.deep)
  }
  if (d >= 4) {
    pvline(s, c.x0 + 2, c.top + 2, c.g - 2, c.t.lite)
  }
}

/** 锈迹 / 划痕 / 积尘 / 裂纹 / 缺口（强度来自 def.art.wear）。 */
function drawWear(s, c) {
  const rnd = c.rnd
  const w = c.wear
  const rustN = Math.round(4 + w * 34)
  for (let k = 0; k < rustN; k++) {
    const p = opaquePoint(s, rnd)
    s.set(p.x, p.y, rnd() < 0.55 ? PAL.rustDark : PAL.rust, 1)
    if (rnd() < 0.3 && s.solid(p.x + 1, p.y)) s.set(p.x + 1, p.y, PAL.rust, 1)
    if (rnd() < 0.2 && s.solid(p.x, p.y + 1)) s.set(p.x, p.y + 1, PAL.rustDark, 1)
  }
  const scrN = Math.round(2 + w * 12)
  for (let k = 0; k < scrN; k++) {
    const p = opaquePoint(s, rnd)
    const len = 2 + Math.floor(rnd() * 4)
    const dir = rnd() < 0.5 ? 1 : -1
    for (let i = 0; i < len; i++) {
      if (s.solid(p.x + i, p.y + i * dir)) s.set(p.x + i, p.y + i * dir, PAL.steelWhite, 1)
    }
  }
  const dustN = Math.round(3 + w * 14)
  const dustSpan = Math.max(1, Math.round(c.h * 0.12))
  for (let k = 0; k < dustN; k++) {
    const x = Math.round(1 + rnd() * (s.w - 2))
    const y = c.g - Math.round(rnd() * rnd() * dustSpan)
    if (s.solid(x, y)) s.set(x, y, rnd() < 0.5 ? PAL.dust : PAL.dustLight, 1)
  }
  const cracks = Math.round(w * 4)
  for (let k = 0; k < cracks; k++) {
    const p = opaquePoint(s, rnd)
    let px = p.x
    let py = p.y
    const len = 3 + Math.round(rnd() * Math.max(2, c.h * 0.16))
    const dir = rnd() < 0.5 ? 1 : -1
    for (let i = 0; i < len; i++) {
      px += rnd() < 0.7 ? dir : 0
      py += rnd() < 0.6 ? 1 : 0
      if (!s.solid(px, py)) break
      s.set(px, py, VOID, 1)
      if (rnd() < 0.2 && s.solid(px + dir, py)) s.set(px + dir, py, VOID, 1)
    }
  }
  if (w > 0.55) {
    const holes = Math.round(w * 4)
    for (let k = 0; k < holes; k++) {
      const p = opaquePoint(s, rnd)
      s.set(p.x, p.y, VOID, 1)
      if (s.solid(p.x, p.y + 1)) s.set(p.x, p.y + 1, VOID, 1)
      if (s.solid(p.x + 1, p.y)) s.set(p.x + 1, p.y, c.t.deep, 1)
    }
  }
}

/** 按底部中心为轴把 work 表面横向错切到目标表面（倾斜 / 靠墙倒）。 */
function stampLean(dst, src, lean) {
  const k = clampNum(lean, -0.09, 0.09)
  const limit = Math.max(1, Math.round(src.w * 0.12))
  for (let y = 0; y < src.h; y++) {
    let dx = Math.round(k * (src.h - 1 - y) * 0.55)
    if (dx > limit) dx = limit
    if (dx < -limit) dx = -limit
    for (let x = 0; x < src.w; x++) {
      const i = src.i(x, y)
      if (src.d[i + 3] < 200) continue
      dst.pxRGB(x + dx, y, src.d[i], src.d[i + 1], src.d[i + 2], 1)
    }
  }
}

/* ============================================================================
 * 6. 对外接口
 * ========================================================================== */

/**
 * 把一件房间摆放物画进给定 Surf。
 * 底部贴地、水平居中、朝右；尺寸铺满 s.w × s.h。
 * @param {import('./core.js').Surf} s 目标表面（调用方负责 tex()）
 * @param {object} def ROOM_PROP_DEFS 里的一条（含 art）
 * @returns {import('./core.js').Surf}
 */
export function paintRoomProp(s, def) {
  const d = def || {}
  const art = d.art || {}
  const base = String(art.base || 'panel')
  const seed = (strSeed(String(d.kind || d.name || 'room_prop')) ^ 0x9e3779b9) >>> 0
  const rnd = mulberry32(seed)
  const work = new Surf(s.w, s.h, seed, 'room-props')
  const c = makeCtx(work, d, art, seed, rnd)

  // 造型（未知 base 退回 panel，绝不抛错）
  const fn = BASE_DRAW[base] || BASE_DRAW.panel
  fn(work, c)

  // 装饰 → 细节线 → 磨损
  drawParts(work, c)
  drawDetail(work, c)
  drawWear(work, c)

  // 上缘高光 / 下缘暗部（只在已有像素上做，alpha 仍为 255）
  work.edges(mix(PAL.white, c.t.lite, 0.5), c.t.deep, 0.28, 0.42)

  // 倾斜：以底部中心为轴错切，再落到目标表面
  stampLean(s, work, art.tilt)

  // 1px 描边 + 接地投影 + 烘焙光斑（glow 非空才画）
  s.outline(mix(VOID, PAL.rustDark, 0.25))
  s.shadow(c.cx, s.h - 1.4, Math.max(4, s.w * 0.42), 1.7, 0.55)
  if (art.glow) {
    const gp = c.glowPos || { x: c.cx, y: s.h * 0.45 }
    s.glow(gp.x, gp.y, Math.max(3, Math.min(s.w, s.h) * 0.4), String(art.glow), 1.15)
  }
  return s
}

/**
 * kind → 绘制描述（供场景按需生成贴图）。
 * w/h 来自 def，seed 为 kind 的 FNV-1a，fn 一次只画一件；
 * lazy: true —— 绝不在模块加载 / 启动阶段预生成 1900 张纹理。
 */
export const ROOM_PROP_ART_DEFS = {}

for (const [kind, def] of Object.entries(ROOM_PROP_DEFS)) {
  ROOM_PROP_ART_DEFS[kind] = {
    w: def.w,
    h: def.h,
    seed: strSeed(kind),
    fn: (surf) => paintRoomProp(surf, def),
    lazy: true,
  }
}
