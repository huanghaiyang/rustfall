// 关卡地形原型施工
// ----------------------------------------------------------------------------
// 在房间生成完成、道具已摆放之后调用（buildRoom 开头）：
//   · 只往「空气」里加结构（平台 / 立柱 / 横梁），不改 floorY，不贴地面，
//     因此不会破坏既有物资支撑、门洞连通与出生点。
//   · 之后 buildRoom 还会跑质量兜底 / 补爬杆 / 清理悬空物，新结构会被一视同仁。
//   · 每间房按 scene.arch 选一个原型，原型内部再用房间 seed 抖动数量 / 位置，
//     所以同原型的两间房也不会一模一样。
import { T } from './tilemap.js'
import { getProp } from './props-data.js'
import {
  addPlatform,
  addPlatformBand,
  addPlatformStairs,
  addPole,
  addProp,
  placeProps,
  isFree,
  shuffle,
} from './biomes/index.js'
import { clamp } from '../utils.js'
import { TS } from '../config.js'
import { getRoomScene } from './scene-data.js'

/** 房间可施工的横向范围（避开两侧门洞区） */
function spanX(ctx) {
  return [ctx.doorInset + 3, ctx.w - ctx.doorInset - 4]
}

/** 一段列里的最高地面行 / 最低天花板行 */
function floorMin(ctx, x0, x1) {
  let f = ctx.h
  for (let x = x0; x <= x1; x++) f = Math.min(f, ctx.floorY[x])
  return f
}
function ceilMax(ctx, x0, x1) {
  let c = 0
  for (let x = x0; x <= x1; x++) c = Math.max(c, ctx.ceilY[x])
  return c
}

/** 一段列里可用的水平结构行（离地 above 行，且不压天花板） */
function rowAbove(ctx, x0, x1, above) {
  const f = floorMin(ctx, x0, x1)
  const c = ceilMax(ctx, x0, x1)
  const r = Math.max(c + 2, f - above)
  return r <= f - 6 ? r : null
}

/** 往空气里填实心（绝不进入地面以上 5 行，避免堵住通路 / 顶头） */
function fillSolid(ctx, x0, x1, y0, y1) {
  const a = clamp(Math.min(x0, x1), 2, ctx.w - 3)
  const b = clamp(Math.max(x0, x1), 2, ctx.w - 3)
  const ya = Math.max(2, Math.min(y0, y1))
  const yb = Math.min(ctx.h - 2, Math.max(y0, y1))
  let n = 0
  for (let x = a; x <= b; x++) {
    if (x < ctx.doorInset + 2 || x > ctx.w - ctx.doorInset - 3) continue
    const lim = ctx.floorY[x] - 5
    for (let y = ya; y <= Math.min(yb, lim); y++) {
      if (y < ctx.ceilY[x] + 1) continue
      if (ctx.map.get(x, y) !== T.EMPTY) continue
      ctx.map.set(x, y, T.SOLID)
      n++
    }
  }
  return n
}

/** 一条横梁平台（不会覆盖实心/已有平台） */
function band(ctx, x0, x1, row) {
  if (row == null || row < 2 || row > ctx.h - 3) return null
  return addPlatformBand(ctx, x0, x1, row)
}

/** 立柱：从平台顶撑到地面附近（留 4 行通行空间） */
function prop(ctx, x, top) {
  const row = Math.round(x)
  const bottom = ctx.floorY[clamp(row, 0, ctx.w - 1)] - 2
  if (top == null || top >= bottom - 2) return
  addPole(ctx, row, top, bottom)
}

/** 竖直实心柱（门洞两侧、天花板以上不动） */
function column(ctx, x, top, bottom) {
  fillSolid(ctx, x, x, top, bottom)
}

const ARCH = {
  /** 高架桥板压在头顶，桥墩撑地 */
  deck(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 13)
    if (row == null) return
    const a = x0 + ctx.rng.int(0, 6)
    const b = x1 - ctx.rng.int(0, 6)
    fillSolid(ctx, a, b, row, row + 1)
    band(ctx, a + 2, b - 2, row - 2)
    const n = ctx.rng.int(3, 5)
    for (let i = 0; i < n; i++) {
      const x = Math.round(a + 3 + ((b - a - 6) * i) / Math.max(1, n - 1))
      column(ctx, x, row + 2, ctx.floorY[x] - 3)
    }
  },

  /** 雨棚 / 加油站罩棚：贴得较低的一段顶棚 */
  canopy(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 10)
    if (row == null) return
    const cx = Math.floor(ctx.w / 2)
    const half = ctx.rng.int(Math.floor((x1 - x0) * 0.22), Math.floor((x1 - x0) * 0.34))
    fillSolid(ctx, cx - half, cx + half, row, row + 1)
    column(ctx, cx - half + 1, row + 2, ctx.floorY[cx - half + 1] - 3)
    column(ctx, cx + half - 1, row + 2, ctx.floorY[cx + half - 1] - 3)
    band(ctx, cx - half - 4, cx + half + 4, row - 3)
  },

  /** 菜场 / 摊位：一排排矮棚 + 台面 */
  stalls(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 6)
    if (row == null) return
    const n = ctx.rng.int(3, 5)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 3 + ((x1 - x0 - 10) * i) / Math.max(1, n - 1)) + ctx.rng.int(-2, 2)
      const len = ctx.rng.int(4, 7)
      const r = Math.max(row + ctx.rng.int(0, 2), 3)
      addPlatform(ctx, x, r, len)
      addPlatform(ctx, x + 1, r + 3, Math.max(2, len - 2))
      prop(ctx, x + 1, r + 1)
      prop(ctx, x + len - 1, r + 1)
    }
  },

  /** 诊所 / 病房 / 影院：成排长凳与看台 */
  benches(ctx) {
    const [x0, x1] = spanX(ctx)
    const r1 = rowAbove(ctx, x0, x1, 5)
    const r2 = rowAbove(ctx, x0, x1, 10)
    if (r1 == null) return
    const a = x0 + ctx.rng.int(2, 8)
    const b = x1 - ctx.rng.int(2, 8)
    band(ctx, a, b, r1)
    if (r2 != null) band(ctx, a + ctx.rng.int(0, 6), b - ctx.rng.int(0, 6), r2)
    const stair = Math.round(a + ctx.rng.int(2, 8))
    if (r2 != null) addPlatformStairs(ctx, stair, 1, ctx.floorY[stair] - 2, r1, { stepH: 4, stepW: 3 })
  },

  /** 教室 / 病房走廊：天花板垂下隔墙，形成一个个开间 */
  partitions(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 7)
    const n = ctx.rng.int(3, 5)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 5 + ((x1 - x0 - 10) * i) / Math.max(1, n - 1))
      const top = Math.max(ctx.ceilY[x] + 2, 2)
      const bottom = Math.min(ctx.floorY[x] - 7, top + ctx.rng.int(4, 6))
      if (bottom > top) fillSolid(ctx, x, x + ctx.rng.int(0, 1), top, bottom)
      if (row != null) addPlatform(ctx, x + 2, row + ctx.rng.int(0, 3), ctx.rng.int(2, 4))
    }
  },

  /** 屋顶道：错落楼顶，大跨度跳跃 */
  rooftops(ctx) {
    const [x0, x1] = spanX(ctx)
    const base = rowAbove(ctx, x0, x1, 6)
    if (base == null) return
    const tiers = ctx.rng.int(3, 4)
    for (let i = 0; i < tiers; i++) {
      const r = base - i * ctx.rng.int(4, 6)
      if (r < 3) break
      const side = i % 2 === 0 ? x0 + ctx.rng.int(2, 12) : x1 - ctx.rng.int(18, 30)
      const len = ctx.rng.int(5, 10)
      addPlatform(ctx, side, r, len)
      prop(ctx, side + Math.floor(len / 2), r + 1)
    }
  },

  /** 断桥 / 码头：横贯长桥，中间塌一段，两端立柱 */
  bridge(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 9)
    if (row == null) return
    const a = x0 + ctx.rng.int(0, 4)
    const b = x1 - ctx.rng.int(0, 4)
    const gap = ctx.rng.int(3, 6)
    const gx = ctx.rng.int(a + 6, Math.max(a + 7, b - gap - 6))
    band(ctx, a, gx - 1, row)
    band(ctx, gx + gap, b, row)
    band(ctx, a + 4, b - 4, row - 4)
    for (const x of [a + 2, gx - 2, gx + gap + 2, b - 2]) {
      if (x > a && x < b) column(ctx, x, row + 2, ctx.floorY[x] - 3)
    }
    const sx = a + 3
    addPlatformStairs(ctx, sx, 1, ctx.floorY[sx] - 2, row, { stepH: 4, stepW: 3 })
  },

  /** 中庭 / 手术室：中央空场四周环绕看台 */
  ring(ctx) {
    const [x0, x1] = spanX(ctx)
    const cx = Math.floor((x0 + x1) / 2)
    const r1 = rowAbove(ctx, x0, x1, 5)
    if (r1 == null) return
    const r2 = r1 - 5
    for (const [dir, len] of [[-1, 6], [1, 6]]) {
      addPlatform(ctx, cx + dir * Math.round((x1 - x0) * 0.3), r1, ctx.rng.int(5, 8))
      if (r2 > 3) addPlatform(ctx, cx + dir * Math.round((x1 - x0) * 0.18), r2, ctx.rng.int(4, 7))
    }
    addPlatform(ctx, cx - 4, r1 - 3, 8)
    if (ctx.floorY[cx] - r1 > 6) prop(ctx, cx, r1 + 1)
  },

  /** 棚户区 / 窄巷：密集错层小平台 + 垂缆 */
  alleys(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 4)
    if (row == null) return
    const n = ctx.rng.int(6, 8)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 2 + ((x1 - x0 - 8) * i) / Math.max(1, n - 1))
      const r = row - ctx.rng.int(0, 8)
      if (r < 3) continue
      addPlatform(ctx, x, r, ctx.rng.int(3, 6))
    }
    for (let i = 0; i < 2; i++) {
      const x = ctx.rng.int(x0 + 6, x1 - 6)
      prop(ctx, x, ctx.ceilY[x] + 3)
    }
  },

  /** 锈塔 / 筒仓 / 锅炉：多层环带 + 阶梯串起来 */
  tiers(ctx) {
    const [x0, x1] = spanX(ctx)
    const base = rowAbove(ctx, x0, x1, 5)
    if (base == null) return
    const tiers = ctx.rng.int(4, 5)
    for (let i = 0; i < tiers; i++) {
      const r = base - i * ctx.rng.int(4, 5)
      if (r < 3) break
      const side = i % 2 === 0 ? x0 + ctx.rng.int(1, 8) : x1 - ctx.rng.int(8, 20)
      const len = ctx.rng.int(6, 12)
      addPlatform(ctx, side, r, len)
      if (i < tiers - 1) {
        const sx = i % 2 === 0 ? side + len : side - 4
        addPlatformStairs(ctx, sx, i % 2 === 0 ? 1 : -1, r, r - 4, { stepH: 4, stepW: 3 })
      }
    }
    const px = Math.floor((x0 + x1) / 2)
    prop(ctx, px, base - 4)
  },

  /** 闸门 / 海关：门形框 + 楣梁 */
  gate(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 10)
    if (row == null) return
    const cx = Math.floor((x0 + x1) / 2)
    const half = ctx.rng.int(8, 11)
    fillSolid(ctx, cx - half, cx - half + 1, row, ctx.floorY[cx - half] - 3)
    fillSolid(ctx, cx + half - 1, cx + half, row, ctx.floorY[cx + half] - 3)
    fillSolid(ctx, cx - half, cx + half, row, row + 1)
    band(ctx, cx - half + 3, cx + half - 3, row + 3)
    band(ctx, cx - half - 4, cx + half + 4, row - 2)
  },

  /** 匝道 / 扶梯 / 船台：一条通到房间上层的长阶梯 */
  ramp(ctx) {
    const [x0, x1] = spanX(ctx)
    const top = rowAbove(ctx, x0, x1, 16)
    if (top == null) return
    const dir = ctx.rng.chance(0.5) ? 1 : -1
    const start = dir > 0 ? x0 + 2 : x1 - 8
    addPlatformStairs(ctx, start, dir, ctx.floorY[start] - 2, top, { stepH: 4, stepW: 4 })
    addPlatform(ctx, dir > 0 ? x0 + 18 : x1 - 20, top - 3, 8)
    const px = Math.floor((x0 + x1) / 2)
    prop(ctx, px, top + 2)
  },

  /** 广告牌：高立柱 + 顶部大牌面 */
  billboards(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 15)
    if (row == null) return
    const n = ctx.rng.int(2, 3)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 6 + ((x1 - x0 - 12) * i) / Math.max(1, n - 1)) + ctx.rng.int(-3, 3)
      band(ctx, x - 5, x + 5, row)
      band(ctx, x - 4, x + 4, row + 3)
      column(ctx, x, row + 1, ctx.floorY[x] - 5)
    }
  },

  /** 停车场 / 配电房 / 辐射区：排柱 + 低顶 */
  pillars(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 11)
    if (row == null) return
    fillSolid(ctx, x0, x1, row, row + 1)
    const n = ctx.rng.int(4, 6)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 3 + ((x1 - x0 - 6) * i) / Math.max(1, n - 1))
      column(ctx, x, row + 2, ctx.floorY[x] - 3)
      if (i % 2 === 0) band(ctx, x - 2, x + 2, row + 4)
    }
  },

  /** 仓库 / 药房 / 邮局：整排货架 */
  shelves(ctx) {
    const [x0, x1] = spanX(ctx)
    const r1 = rowAbove(ctx, x0, x1, 5)
    if (r1 == null) return
    const rows = [r1, r1 - 4, r1 - 8]
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k]
      if (r < 3) continue
      const segs = ctx.rng.int(2, 3)
      for (let i = 0; i < segs; i++) {
        const x = Math.round(x0 + 3 + ((x1 - x0 - 12) * i) / Math.max(1, segs - 1))
        addPlatform(ctx, x, r, ctx.rng.int(5, 9))
        if (k < rows.length - 1) prop(ctx, x + 1, r + 1)
      }
    }
  },

  /** 果园 / 树林：树桩 + 枝平台 */
  trees(ctx) {
    const [x0, x1] = spanX(ctx)
    const base = rowAbove(ctx, x0, x1, 7)
    if (base == null) return
    const n = ctx.rng.int(4, 6)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 3 + ((x1 - x0 - 6) * i) / Math.max(1, n - 1)) + ctx.rng.int(-2, 2)
      addPole(ctx, x, base + ctx.rng.int(0, 4), ctx.floorY[x] - 1)
      addPlatform(ctx, x - ctx.rng.int(1, 3), base - ctx.rng.int(0, 5), ctx.rng.int(3, 5))
    }
  },

  /** 坟地：成排低矮墓碑台 */
  graves(ctx) {
    const [x0, x1] = spanX(ctx)
    const n = ctx.rng.int(7, 10)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 2 + ((x1 - x0 - 4) * i) / Math.max(1, n - 1))
      const r = ctx.floorY[x] - ctx.rng.int(3, 5)
      if (r > 2) addPlatform(ctx, x, r, ctx.rng.int(2, 3))
    }
    const cx = Math.floor((x0 + x1) / 2)
    const row = rowAbove(ctx, x0, x1, 9)
    if (row != null) band(ctx, cx - 8, cx + 8, row)
  },

  /** 教堂 / 谷仓 / 拱顶大厅：两侧高柱 + 顶拱 */
  arch(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 12)
    if (row == null) return
    const a = x0 + ctx.rng.int(2, 6)
    const b = x1 - ctx.rng.int(2, 6)
    fillSolid(ctx, a, a + 1, row, ctx.floorY[a] - 3)
    fillSolid(ctx, b - 1, b, row, ctx.floorY[b] - 3)
    fillSolid(ctx, a, b, row, row + 1)
    band(ctx, a + 2, b - 2, row + 3)
    band(ctx, a + 5, b - 5, row - 3)
    for (let x = a + 8; x < b - 4; x += ctx.rng.int(9, 13)) {
      addPlatform(ctx, x, ctx.floorY[x] - ctx.rng.int(3, 5), ctx.rng.int(3, 5))
    }
  },

  /** 废料场 / 货柜场 / 船体：任意堆叠的实心块 */
  piles(ctx) {
    const [x0, x1] = spanX(ctx)
    const base = rowAbove(ctx, x0, x1, 12)
    if (base == null) return
    const n = ctx.rng.int(3, 5)
    const slots = shuffle(ctx.rng, Array.from({ length: n }, (_, i) => x0 + 2 + i * Math.floor((x1 - x0 - 4) / n)))
    for (const x of slots) {
      const w = ctx.rng.int(3, 7)
      const h = ctx.rng.int(3, 6)
      const top = base - ctx.rng.int(0, 6)
      fillSolid(ctx, x, x + w, top, top + h)
      band(ctx, x + 1, x + w - 1, top - 2)
    }
  },

  /** 厂房 / 龙门吊：头顶长检修道 + 悬空小平台 */
  catwalk(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 13)
    if (row == null) return
    const a = x0 + ctx.rng.int(0, 4)
    const b = x1 - ctx.rng.int(0, 4)
    band(ctx, a, b, row)
    band(ctx, a + 6, b - 6, row - 4)
    for (let i = 0; i < 3; i++) {
      const x = Math.round(a + 6 + ((b - a - 12) * i) / 2)
      addPlatform(ctx, x, row + ctx.rng.int(4, 7), ctx.rng.int(4, 7))
    }
    for (const x of [a + 2, b - 2]) column(ctx, x, row + 1, ctx.floorY[x] - 3)
    prop(ctx, Math.floor((a + b) / 2), row + 1)
  },

  /** 车厢 / 车库：横躺的车体块 + 车顶 */
  train(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 8)
    if (row == null) return
    const n = ctx.rng.int(2, 3)
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + 3 + ((x1 - x0 - 16) * i) / Math.max(1, n - 1))
      const len = ctx.rng.int(10, 16)
      fillSolid(ctx, x, x + len, row, row + 4)
      band(ctx, x + 1, x + len - 1, row - 2)
      prop(ctx, x + 2, row - 1)
    }
    addPlatformStairs(ctx, x0 + 2, 1, ctx.floorY[x0 + 2] - 2, row - 2, { stepH: 4, stepW: 3 })
  },

  /** 公路 / 盐滩 / 淤泥滩：低矮零散台 + 灯杆 */
  flats(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 5)
    if (row == null) return
    const n = ctx.rng.int(2, 3)
    for (let i = 0; i < n; i++) {
      const x = ctx.rng.int(x0 + 2, x1 - 8)
      addPlatform(ctx, x, row - ctx.rng.int(0, 4), ctx.rng.int(3, 6))
    }
    const lamps = ctx.rng.int(2, 4)
    for (let i = 0; i < lamps; i++) {
      const x = Math.round(x0 + 4 + ((x1 - x0 - 8) * i) / Math.max(1, lamps - 1))
      addPole(ctx, x, Math.max(ctx.ceilY[x] + 6, row - 5), ctx.floorY[x] - 1)
    }
  },

  /** 池塘 / 积水段 / 渗滤池：水面上的栈道与木桩 */
  basin(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 6)
    if (row == null) return
    const a = x0 + 4
    const b = x1 - 4
    band(ctx, a, b, row)
    band(ctx, a + 8, b - 8, row - 5)
    for (let x = a + 2; x < b; x += ctx.rng.int(8, 12)) {
      prop(ctx, x, row + 1)
      addPlatform(ctx, x, ctx.floorY[x] - 4, ctx.rng.int(2, 4))
    }
  },

  /** 灯塔 / 楼梯井 / 无线电塔：绕中柱的旋梯 */
  spiral(ctx) {
    const [x0, x1] = spanX(ctx)
    const base = rowAbove(ctx, x0, x1, 6)
    if (base == null) return
    const cx = Math.floor((x0 + x1) / 2)
    fillSolid(ctx, cx - 1, cx + 1, Math.max(ctx.ceilY[cx] + 2, base - 22), base)
    // 左右交替的短平台，绕柱盘旋而上
    let dir = 1
    for (let r = base; r > ctx.ceilY[cx] + 3; r -= 4) {
      const x = cx + dir * ctx.rng.int(4, 7)
      addPlatform(ctx, x - 2, r, 5)
      dir = -dir
    }
    addPlatformStairs(ctx, cx + 5, 1, ctx.floorY[cx] - 2, base, { stepH: 4, stepW: 3 })
  },

  /** 压块机 / 大型机械：中央实心机体 + 顶部走道 */
  press(ctx) {
    const [x0, x1] = spanX(ctx)
    const row = rowAbove(ctx, x0, x1, 11)
    if (row == null) return
    const cx = Math.floor((x0 + x1) / 2)
    const half = ctx.rng.int(4, 6)
    fillSolid(ctx, cx - half, cx + half, row, row + ctx.rng.int(4, 6))
    band(ctx, cx - half - 3, cx + half + 3, row - 2)
    band(ctx, cx - half - 8, cx - half - 1, row + 4)
    band(ctx, cx + half + 1, cx + half + 8, row + 4)
  },

  /** 通风井 / 集水井 / 升降机 / 深核：围绕竖井的多层落脚点 */
  shaft(ctx) {
    const [x0, x1] = spanX(ctx)
    const base = rowAbove(ctx, x0, x1, 5)
    if (base == null) return
    const cx = Math.floor((x0 + x1) / 2)
    const half = ctx.rng.int(4, 7)
    let side = 1
    for (let r = base; r > ctx.ceilY[cx] + 4; r -= ctx.rng.int(3, 5)) {
      const x = cx + side * half - (side > 0 ? 0 : 4)
      addPlatform(ctx, x, r, 4)
      side = -side
    }
    addPole(ctx, cx, Math.max(ctx.ceilY[cx] + 2, base - 14), ctx.floorY[cx] - 1)
    band(ctx, cx - half, cx - 2, base - 6)
    band(ctx, cx + 2, cx + half, base - 6)
  },
}

/** 功能件保留清单：换景时不动这些（撬箱、终端、工作台等） */
const KEEP = new Set([
  'crate', 'barrel', 'military_crate', 'vending_machine', 'terminal', 'workbench',
  'campfire', 'vault_door', 'beacon', 'beacon_lamp', 'cargo_net', 'generator',
  'reactor_core', 'transformer', 'mech_console', 'lab_tank', 'server_rack', 'hydraulic_press',
])

/** 管风琴：按场景过滤通用杂物，再补本关标志件 */
function dressProps(ctx, scene) {
  const allowed = new Set(scene.props || [])
  const removed = []
  ctx.props = ctx.props.filter((p) => {
    const keep = KEEP.has(p.kind) || allowed.has(p.kind) || getProp(p.kind)?.questTarget
    if (!keep) removed.push(p)
    return keep
  })
  // 被换掉的旧杂物要释放占位，否则本关标志件会被「看不见的旧道具」挤得放不下
  for (const p of removed) {
    const x = Math.floor(p.x / TS)
    const row = Math.floor(p.y / TS)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx
        const yy = row + dy
        if (xx >= 0 && xx < ctx.w && yy >= 0 && yy < ctx.h) ctx.occ[yy * ctx.w + xx] = 0
      }
    }
  }
  ctx.taken = ctx.taken.filter(
    (t) => !removed.some((p) => Math.floor(p.x / TS) === t.x && Math.floor(p.y / TS) === t.row),
  )
  const list = (scene.props || []).map((kind) => {
    const count = kind === 'tire_pile' || kind === 'junk_heap_bags' ? ctx.rng.int(1, 3) : ctx.rng.int(1, 2)
    return { kind, count, r: 1 }
  })
  placeProps(ctx, { list })
  // 在左门附近固定放一件标志物，保证进场第一屏就能看出这是哪一关
  const anchor = (scene.props || [])[0]
  if (anchor) {
    const cages = ctx.cages.map((c) => Math.floor(c.x / TS))
    for (const dx of [7, 11, 15, 4, 19]) {
      const x = ctx.doorInset + dx
      if (x >= ctx.w - ctx.doorInset - 4) break
      const row = ctx.floorY[x]
      if (Math.abs(row - ctx.floorY[x - 1]) > 2) continue
      if (cages.some((cx) => Math.abs(cx - x) <= 4)) continue
      if (!isFree(ctx, x, row, 1)) continue
      addProp(ctx, anchor, x, row, { r: 1 })
      break
    }
  }
}

/** 主入口：buildRoom 一开始调用 */
export function applyScene(ctx) {
  const scene = getRoomScene(ctx.spec?.id)
  if (!scene || ctx.spec?.theme) return
  const fn = ARCH[scene.arch]
  if (fn) {
    try {
      fn(ctx)
    } catch (e) {
      ctx.notes.push({ type: 'scene-error', arch: scene.arch, error: String(e && e.message ? e.message : e) })
    }
  }
  try {
    dressProps(ctx, scene)
  } catch (e) {
    ctx.notes.push({ type: 'scene-props-error', error: String(e && e.message ? e.message : e) })
  }
}
