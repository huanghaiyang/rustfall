// 房间结构特征库 —— 「大房间」的复杂度保证
//
// 分工：
//   index.js     基础地形 / 门洞 / 连续性 / 布置 / 组装 / 校验
//   features.js  ← 本文件：多层站立面、竖向通道、隐藏壁龛、裂墙/泥土/酸液、
//                塌方堆、断桥、通风管、天花板吊挂、单向平台迷宫、复杂度统计
//   <biome>.js   各生态的专属结构（站台、手术室、货柜、熔炉……）
//
// 关键约定：**会改 floorY 的特征必须在实体布置之前调用**，
// 所以 biome 生成器要在 D 阶段（放怪/放物资）之前调 enforceRoomQuality(ctx)。
// buildRoom() 里还会跑一次 ensureQualityFallback(ctx)：只加平台/杆/壁龛，
// 绝不移动已有地面，保证任何 biome 忘记调用也不会破契约。
import { T } from '../tilemap.js'
import { TS } from '../../config.js'
import {
  addPlatform,
  addPlatformBand,
  addPole,
  carveColumn,
  carveAlcove,
  clearSpan,
  digBasin,
  clamp,
  flatSpanExact,
  isFree,
  isStandable,
  markTaken,
  reserveSpan,
  standSpots,
  surfaceRow,
  inShelter,
  ITEM_POOLS,
  RARE_POOLS,
  WALK_STEP,
} from './index.js'

/** 可站立吗（SOIL/CRACKED 也算实体地） */
function standTile(t) {
  return t === T.SOLID || t === T.PLATFORM || t === T.CRACKED || t === T.SOIL
}
function solidTile(t) {
  return t === T.SOLID || t === T.CRACKED || t === T.SOIL
}
function airTile(t) {
  return t === T.EMPTY || t === T.PLATFORM || t === T.POLE
}

// =====================================================================
// 站立层统计
// =====================================================================

/** 每一行有多少个「可站立点」（地面 + 平台顶） */
export function rowStandCounts(ctx) {
  const { map, w, floorY } = ctx
  const counts = new Map()
  const bump = (row, n) => counts.set(row, (counts.get(row) || 0) + n)
  for (let x = 1; x < w - 1; x++) {
    const f = floorY[x]
    const t = map.get(x, f)
    if (standTile(t) && !solidTile(map.get(x, f - 1))) bump(f, 1)
    for (let y = 2; y < f; y++) {
      if (map.get(x, y) !== T.PLATFORM) continue
      if (solidTile(map.get(x, y - 1))) continue
      bump(y, 1)
    }
  }
  return counts
}

/** 层带：把「至少有 minTiles 个站立点」的行，按间距 sep 合并成层 */
export function layerBands(ctx, minTiles = 4, sep = 3) {
  const counts = rowStandCounts(ctx)
  const rows = []
  for (const [row, n] of counts) if (n >= minTiles) rows.push(row)
  rows.sort((a, b) => a - b)
  const bands = []
  for (const r of rows) {
    if (!bands.length || r - bands[bands.length - 1] > sep) bands.push(r)
  }
  return bands
}

/** 可站立层数 */
export function countLayers(ctx, minTiles = 4) {
  return layerBands(ctx, minTiles).length
}

/** 竖向通道数：竖井 + 跨度 ≥6 行的杆 */
export function countChannels(ctx) {
  let n = ctx.shafts.length
  for (const p of ctx.poles) if (p.bottom - p.top >= 6) n++
  return n
}

// =====================================================================
// 补层 / 补通道
// =====================================================================

/** 在一处空档加一条「断楼板」层，返回是否成功 */
function addStandLayer(ctx, opts = {}) {
  const { map, w, floorY, ceilY, doorInset, rng } = ctx
  const bands = layerBands(ctx)
  const mid = Math.floor(w / 2)
  const g = floorY[mid]
  // 候选行：走廊范围内、与已有层相距 ≥5 行、至少有 14 列可直接铺平台
  const cand = []
  for (let row = Math.max(4, ceilY[mid] + 2); row <= g - 4; row++) {
    if (bands.some((b) => Math.abs(b - row) <= 4)) continue
    let free = 0
    for (let x = doorInset + 3; x < w - doorInset - 3; x++) {
      if (map.get(x, row) === T.EMPTY && map.get(x, row - 1) === T.EMPTY) free++
    }
    if (free >= 14) cand.push({ row, free })
  }
  if (!cand.length) return false
  // 目标：把最大空档三等分，取最靠中间的那条
  const sorted = [...bands].sort((a, b) => a - b)
  const targets = []
  const edges = [Math.max(3, ceilY[mid] + 1), ...sorted, g]
  for (let i = 1; i < edges.length; i++) {
    const gap = edges[i] - edges[i - 1]
    if (gap >= 8) targets.push(edges[i - 1] + Math.round(gap / 2))
  }
  if (!targets.length) targets.push(sorted.length ? sorted[0] + 6 : g - 8)
  cand.sort((a, b) => {
    const da = Math.min(...targets.map((t) => Math.abs(t - a.row)))
    const db = Math.min(...targets.map((t) => Math.abs(t - b.row)))
    return da - db
  })
  const row = cand[0].row
  // 断成 2~4 段，段间留 1~3 列缺口（可跳 / 掉下去）
  const x0 = doorInset + 3
  const x1 = w - doorInset - 4
  const segs = opts.segs ?? rng.int(2, 4)
  const span = Math.max(4, Math.floor((x1 - x0) / segs))
  let placed = 0
  for (let i = 0; i < segs; i++) {
    const sx = x0 + i * span + (i > 0 ? rng.int(1, 3) : 0)
    const len = Math.max(4, span - rng.int(2, 4))
    if (sx + len > x1) continue
    const p = addPlatform(ctx, sx, row, len)
    if (p) placed++
  }
  return placed > 0
}

/** 补竖向通道：找一列从高处到地面基本空的立柱，插杆 */
function addVerticalChannel(ctx, opts = {}) {
  const { map, w, floorY, ceilY, rng, doorInset } = ctx
  const bands = layerBands(ctx)
  const mid = Math.floor(w / 2)
  const g = floorY[mid]
  // 起点候选：从最高层往下逐个试（某层上方可能被实心结构挡住）
  const tops = []
  const sorted = [...bands].filter((b) => b < g - 6).sort((a, b) => a - b) // 行号小的在上面，先试最长的
  for (const b of sorted) tops.push(b)
  for (const dy of [2, 6, 10, 14, 18, 22]) tops.push(Math.max(3, ceilY[mid] + dy))
  for (const dy of [8, 10, 12]) tops.push(Math.max(3, g - dy))
  const tried = new Set()
  for (const topRow of tops) {
    if (topRow < 3 || tried.has(topRow)) continue
    tried.add(topRow)
    const order = []
    for (let i = 0; i < 16; i++) order.push(rng.int(doorInset + 4, w - doorInset - 5))
    for (let x = doorInset + 4; x < w - doorInset - 5; x++) order.push(x)
    for (const x of order) {
      if (inShelter(ctx, x)) continue
      let groundRow = -1
      for (let y = topRow + 1; y < ctx.h - 2; y++) {
        if (solidTile(map.get(x, y))) {
          groundRow = y
          break
        }
      }
      if (groundRow < 0 || groundRow - topRow < 7) continue
      // 中间必须能穿杆（只能有空气 / 平台的顶面）
      let ok = true
      for (let y = topRow + 1; y < groundRow; y++) {
        if (solidTile(map.get(x, y))) {
          ok = false
          break
        }
      }
      if (!ok) continue
      let n = 0
      for (let y = topRow; y < groundRow; y++) {
        if (map.get(x, y) === T.EMPTY) {
          map.set(x, y, T.POLE)
          n++
        }
      }
      if (n >= 4) {
        ctx.poles.push({ x, top: topRow, bottom: groundRow - 1 })
        return { x, top: topRow, bottom: groundRow - 1 }
      }
    }
  }
  return null
}

/** 隐藏壁龛：地下/墙脚的凹室，里面塞稀有物资（会改 floorY，布置前调用） */
export function addHiddenAlcove(ctx, opts = {}) {
  const { w, rng, doorInset } = ctx
  const half = opts.half ?? 1
  const pool = RARE_POOLS[ctx.biome] || RARE_POOLS.city
  const dropLoot = (cx, row) => {
    ctx.loot.push({ id: rng.pick(pool), x: cx * TS + TS / 2, y: row * TS, hidden: true })
    markTaken(ctx, cx, row, 2)
  }
  // 1) 全房扫一遍严格平坦的段落（随机撞效率太低，大房间也可能一次都撞不到）
  const cands = []
  for (let x = doorInset + 7; x < w - doorInset - 7; x++) {
    if (inShelter(ctx, x)) continue
    if (!flatSpanExact(ctx, x - half - 1, x + half + 1)) continue
    cands.push(x)
  }
  // 优先挑没被占的
  const free = cands.filter((x) => isFree(ctx, x, ctx.floorY[x], 2))
  const pickFree = free.length ? free[Math.floor(rng.next() * free.length)] : -1
  if (pickFree >= 0) {
    const a = carveAlcove(ctx, pickFree, half, 2, { hide: true })
    if (a) {
      dropLoot(pickFree, ctx.floorY[pickFree])
      return a
    }
  }
  // 2) 有平坦段但都被占了：清掉那一小段的占位再挖
  if (cands.length) {
    const cx = cands[Math.floor(rng.next() * cands.length)]
    clearSpan(ctx, cx - half - 2, cx + half + 2)
    const a = carveAlcove(ctx, cx, half, 2, { hide: true })
    if (a) {
      dropLoot(cx, ctx.floorY[cx])
      return a
    }
  }
  // 3) 实在没有平坦段：只在墙脚记一个藏匿点，物资放在最近的可站地面上（不挖地形，免得破坏 ±2 连续性）
  const spots = standSpots(ctx, { headroom: 2, ground: true, only: (x, row) => isFree(ctx, x, row, 1) })
  if (!spots.length) return null
  const s = spots[Math.floor(rng.next() * spots.length)]
  dropLoot(s.x, s.row)
  const a = { x0: s.x - half, x1: s.x + half, row: s.row, rim: s.row, hide: true, shallow: true }
  ctx.notes.push({ type: 'alcove', ...a })
  return a
}

// =====================================================================
// 复杂地形：泥土 / 裂墙 / 酸液
// =====================================================================

/**
 * 把地表换成 SOIL（铲可挖）、把墙换成 CRACKED（镐可拆）、铺 TOXIC 酸液。
 * SOIL/CRACKED 仍然是实体 → 不影响通行与连续性。
 */
export function decorateComplexTiles(ctx, opts = {}) {
  const { map, w, h, floorY, rng } = ctx
  const biome = ctx.biome
  const toxicBias = opts.toxic ?? (biome === 'factory' || biome === 'dump' || biome === 'port' ? 0.7 : 0.3)
  const counts = { soil: 0, cracked: 0, toxic: 0, hanging: 0 }

  // 门洞区 / 避难所里不铺可挖瓦片（避免影响进出与营地）
  const safeX = (x) => x > ctx.doorInset + 4 && x < w - ctx.doorInset - 5 && !inShelter(ctx, x)

  // ---- 1. 泥土带（地表一层，成片） ----
  const soilPatches = Math.round(w / 9) + 2
  for (let i = 0; i < soilPatches; i++) {
    const x0 = rng.int(3, Math.max(4, w - 8))
    const len = rng.int(2, 7)
    for (let k = 0; k < len; k++) {
      const x = x0 + k
      if (x <= 1 || x >= w - 2 || !safeX(x)) continue
      const f = floorY[x]
      if (map.get(x, f) !== T.SOLID) continue
      if (map.get(x, f - 1) !== T.EMPTY) continue
      if (!safeX(x)) continue
      map.set(x, f, T.SOIL)
      counts.soil++
    }
  }

  // ---- 2. 裂墙（贴着空气的实心墙，成簇） ----
  const clusters = Math.round(w / 11) + 3
  for (let i = 0; i < clusters; i++) {
    const x = rng.int(2, w - 3)
    const len = rng.int(3, 9)
    const vertical = rng.chance(0.62)
    let startY = -1
    outer: for (let y = 2; y < h - 3; y++) {
      if (map.get(x, y) !== T.SOLID) continue
      if (
        map.get(x - 1, y) === T.EMPTY ||
        map.get(x + 1, y) === T.EMPTY ||
        map.get(x, y - 1) === T.EMPTY ||
        map.get(x, y + 1) === T.EMPTY
      ) {
        startY = y
        break outer
      }
    }
    if (startY < 0) continue
    for (let k = 0; k < len; k++) {
      const tx = vertical ? x : x + k
      const ty = vertical ? startY + k : startY
      if (tx <= 1 || tx >= w - 2 || ty <= 1 || ty >= h - 2) continue
      if (!safeX(tx)) continue
      if (map.get(tx, ty) === T.SOLID) {
        map.set(tx, ty, T.CRACKED)
        counts.cracked++
      }
    }
  }

  // ---- 3. 酸液：一部分水变酸 + 地面酸洼 ----
  if (toxicBias > 0) {
    for (let x = 1; x < w - 1; x++) {
      for (let y = 1; y < h - 1; y++) {
        if (map.get(x, y) === T.WATER && rng.chance(toxicBias * 0.4)) {
          map.set(x, y, T.TOXIC)
          counts.toxic++
        }
      }
    }
  }
  const puddles = Math.round(w / 30) + 1
  for (let i = 0; i < puddles; i++) {
    const x0 = rng.int(4, Math.max(5, w - 9))
    const len = rng.int(2, 5)
    let ok = true
    for (let k = 0; k < len; k++) {
      const x = x0 + k
      const f = floorY[x]
      if (!safeX(x)) ok = false
      else if (map.get(x, f) !== T.SOLID) ok = false
      else if (map.get(x, f - 1) !== T.EMPTY) ok = false
    }
    if (!ok) continue
    for (let k = 0; k < len; k++) {
      const x = x0 + k
      map.set(x, floorY[x] - 1, T.TOXIC)
      counts.toxic++
    }
  }

  ctx.tileDeco = counts
  return counts
}

// =====================================================================
// 结构件
// =====================================================================

/** 塌方堆：把一段地面垫高 1~2 行并铺成泥土（会改 floorY） */
export function addCollapsePile(ctx, opts = {}) {
  const { map, w, rng, floorY, ceilY } = ctx
  const tries = opts.tries ?? 3
  let made = 0
  for (let t = 0; t < tries; t++) {
    const len = rng.int(3, 8)
    const x0 = rng.int(ctx.doorInset + 4, Math.max(ctx.doorInset + 5, w - ctx.doorInset - 5 - len))
    const r0 = floorY[x0]
    // 要求整段（含左右边界）等高，抬起来之后台阶才 ≤2
    let ok = true
    for (let x = x0 - 1; x <= x0 + len && x < w - 1; x++) {
      if (x < 1) continue
      if (floorY[x] !== r0) {
        ok = false
        break
      }
    }
    if (!ok || inShelter(ctx, x0 + Math.floor(len / 2))) continue
    const lift = Math.min(WALK_STEP, rng.int(1, 2))
    const nr = Math.max(3, r0 - lift)
    for (let x = x0; x < x0 + len && x < w - 2; x++) {
      floorY[x] = nr
      if (ceilY[x] > nr - 9) ceilY[x] = Math.max(2, nr - 9)
      carveColumn(ctx, x)
      if (map.get(x, nr) === T.EMPTY) map.set(x, nr, T.SOIL)
      if (lift >= 2 && rng.chance(0.5) && map.get(x, nr + 1) === T.EMPTY) map.set(x, nr + 1, T.SOIL)
    }
    ctx.notes.push({ type: 'pile', x0, x1: x0 + len - 1, row: nr })
    made++
  }
  return made
}

/** 断桥：高处一条长平台，中间断开一大截（要靠另一条路线绕） */
export function addBrokenBridge(ctx, opts = {}) {
  const { w, rng, floorY, ceilY } = ctx
  const mid = Math.floor(w / 2)
  const row = opts.row ?? Math.max(ceilY[mid] + 4, floorY[mid] - rng.int(9, 15))
  const x0 = ctx.doorInset + 3
  const x1 = w - ctx.doorInset - 4
  const gap = rng.int(6, 11)
  const gapX = rng.int(x0 + 10, Math.max(x0 + 11, x1 - gap - 10))
  const segs = []
  segs.push(...addPlatformBand(ctx, x0, gapX - 1, row))
  segs.push(...addPlatformBand(ctx, gapX + gap, x1, row))
  // 桥塔（可攀爬的杆）
  for (const cx of [x0 + 3, x1 - 3]) {
    const gr = surfaceRow(ctx, clamp(cx, 2, w - 3))
    if (gr > row + 2) addPole(ctx, clamp(cx, 2, w - 3), row + 1, gr - 1)
  }
  const b = { row, gap: [gapX, gapX + gap - 1], segs }
  ctx.notes.push({ type: 'bridge', ...b })
  return b
}

/**
 * 通风管：在天花板里掏一条横管，管底留一段可站，管口用杆从下面爬上来。
 * 管里塞 1~2 件稀有物资（藏匿点）。
 */
export function addVentDuct(ctx, opts = {}) {
  const { map, w, rng, ceilY } = ctx
  const len = Math.min(w - 24, rng.int(9, 18))
  if (len < 8) return null
  const x0 = rng.int(ctx.doorInset + 4, Math.max(ctx.doorInset + 5, w - ctx.doorInset - 6 - len))
  // 取这一段最高的天花板（最靠上），保证管子在实心区域里
  let c = 0
  for (let x = x0; x < x0 + len; x++) c = Math.max(c, ceilY[x])
  if (c < 8) return null
  const floorRow = c - 1 // 管底
  const topRow = c - 4 // 管顶（内部 3 行高）
  if (topRow < 3) return null
  for (let x = x0; x < x0 + len; x++) {
    for (let y = topRow; y < floorRow; y++) map.set(x, y, T.EMPTY)
    map.set(x, floorRow, T.SOLID)
  }
  // 两端封口
  for (let y = topRow; y < floorRow; y++) {
    map.set(x0 - 1, y, T.SOLID)
    map.set(x0 + len, y, T.SOLID)
  }
  // 管口：挑一列「管底往下至少 6 格是空的」，否则挖了洞也下不去（会变成封死的管子）
  let holeX = -1
  let groundRow = -1
  const order = []
  for (let x = x0 + 2; x <= x0 + len - 3; x++) order.push(x)
  // 用 rng 打乱候选顺序（确定性洗牌）
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  for (const x of order) {
    // 优先一路通到「真地面」（实心/泥土/裂墙），中途的平台不当作落点，
    // 否则杆子可能停在一块上不去的平台上，管子就变成了孤岛。
    let gr = -1
    for (let y = floorRow + 1; y < Math.min(ctx.h - 2, floorRow + 44); y++) {
      if (solidTile(map.get(x, y))) {
        gr = y
        break
      }
    }
    if (gr < 0) {
      const gy = map.groundBelow(x * TS + TS / 2, (floorRow + 1) * TS, TS * 44)
      gr = gy == null ? -1 : Math.floor(gy / TS)
    }
    if (gr > floorRow + 5) {
      holeX = x
      groundRow = gr
      break
    }
  }
  if (holeX < 0) return null // 这条管子落不下去，放弃（下次换个位置再来）
  map.set(holeX, floorRow, T.EMPTY)
  map.set(holeX + 1, floorRow, T.EMPTY)
  let poleOk = false
  if (groundRow > floorRow + 3) {
    let n = 0
    for (let y = floorRow; y < groundRow; y++) {
      if (map.get(holeX, y) === T.EMPTY) {
        map.set(holeX, y, T.POLE)
        n++
      }
    }
    if (n > 2) {
      ctx.poles.push({ x: holeX, top: floorRow, bottom: groundRow - 1 })
      poleOk = true
    }
  }
  // 管里的物资：放在管口附近（否则玩家爬上来够不着）
  const pool = RARE_POOLS[ctx.biome] || RARE_POOLS.city
  const spots = [holeX + 2, holeX - 2, holeX + 4, holeX - 4, x0 + 2, x0 + len - 3]
  let lootN = 0
  for (const sx of spots) {
    if (lootN >= (opts.loot ?? 2)) break
    if (sx <= x0 + 1 || sx >= x0 + len - 1) continue
    if (map.get(sx, floorRow - 1) !== T.EMPTY) continue
    if (!isFree(ctx, sx, floorRow, 1)) continue
    ctx.loot.push({ id: rng.pick(pool), x: sx * TS + TS / 2, y: floorRow * TS, hidden: true })
    markTaken(ctx, sx, floorRow, 1)
    lootN++
  }
  ctx.ducts.push({ x0, x1: x0 + len - 1, topRow, floorRow, x: holeX, pole: poleOk })
  return ctx.ducts[ctx.ducts.length - 1]
}

/** 天花板吊挂：钟乳石/吊管/吊灯，个别挂一小段可站平台 */
export function addCeilingHangings(ctx, opts = {}) {
  const { map, w, rng, ceilY } = ctx
  const count = opts.count ?? rng.int(4, 9)
  // 通风管所在的列不能吊东西：会把管腔堵死，玩家爬进去也走不过去
  const inDuct = (x) => ctx.ducts.some((d) => x >= d.x0 - 1 && x <= d.x1 + 1)
  let made = 0
  for (let i = 0; i < count; i++) {
    const x = rng.int(ctx.doorInset + 4, w - ctx.doorInset - 5)
    if (inShelter(ctx, x) || inDuct(x)) continue
    const top = ceilY[x]
    const drop = rng.int(2, 5)
    const wide = rng.chance(0.4) ? 2 : 1
    let any = false
    for (let k = 0; k < wide; k++) {
      const xx = x + k
      if (xx < 2 || xx >= w - 2) continue
      for (let y = top; y < top + drop && y < ctx.h - 2; y++) {
        if (map.get(xx, y) === T.EMPTY) {
          map.set(xx, y, rng.chance(0.25) ? T.CRACKED : T.SOLID)
          any = true
        }
      }
    }
    if (any) made++
  }
  // 吊挂平台：从天花板垂下来的一小块单向平台（跳上去能摸到高处）
  const hangs = rng.int(1, 3)
  for (let i = 0; i < hangs; i++) {
    const x = rng.int(ctx.doorInset + 6, w - ctx.doorInset - 9)
    if (inShelter(ctx, x) || inDuct(x)) continue
    const row = Math.max(ceilY[x] + 3, ceilY[x] + rng.int(4, 9))
    if (row >= ctx.floorY[x] - 4) continue
    const p = addPlatform(ctx, x, row, rng.int(2, 4))
    if (p) made++
  }
  ctx.hangings += made
  return made
}

/** 单向平台迷宫：一片交错的小平台，往上爬 3~4 层 */
export function addPlatformMaze(ctx, opts = {}) {
  const { w, rng, floorY, ceilY } = ctx
  const cx = rng.int(ctx.doorInset + 10, w - ctx.doorInset - 12)
  const half = opts.half ?? rng.int(6, 10)
  const g = floorY[clamp(cx, 1, w - 2)]
  const rows = opts.rows ?? rng.int(3, 4)
  const out = []
  for (let i = 0; i < rows; i++) {
    const row = g - 4 - i * 4
    if (row <= ceilY[clamp(cx, 1, w - 2)] + 2) break
    const dir = i % 2 === 0 ? 1 : -1
    for (let k = 0; k < 3; k++) {
      const x = clamp(cx + dir * (k * 3 - 1), 2, w - 4)
      const p = addPlatform(ctx, x, row, rng.int(2, 3))
      if (p) out.push(p)
    }
  }
  if (out.length) ctx.notes.push({ type: 'maze', cx, rows, n: out.length })
  return out
}

// =====================================================================
// 质量总闸：3 层站立面 / 2 个竖向通道 / 1 个隐藏壁龛 / 复杂地形
// =====================================================================

/**
 * biome 在「结构阶段结束、布置实体之前」调用。
 * opts: { layers, channels, allowMoveFloor }
 */
export function enforceRoomQuality(ctx, opts = {}) {
  const layersTarget = opts.layers ?? 3
  const channelsTarget = opts.channels ?? 2
  const report = { layers: 0, channels: 0, alcove: false, movedFloor: 0 }

  // 1) 会改地面的件先来：塌方堆 / 壁龛
  if (opts.piles !== false) {
    report.movedFloor += addCollapsePile(ctx, { tries: opts.pileTries ?? 2 })
  }
  if (!ctx.notes.some((n) => n.type === 'alcove')) {
    const a = addHiddenAlcove(ctx)
    report.alcove = !!a
  } else {
    report.alcove = true
  }

  // 2) 补层
  let guard = 0
  while (countLayers(ctx) < layersTarget && guard++ < 6) {
    if (!addStandLayer(ctx)) break
  }

  // 3) 补竖向通道
  guard = 0
  while (countChannels(ctx) < channelsTarget && guard++ < 6) {
    if (!addVerticalChannel(ctx)) break
  }

  // 4) 平台迷宫 / 断桥 / 通风管 / 吊挂
  if (opts.maze !== false) addPlatformMaze(ctx)
  if (opts.bridge && !ctx.notes.some((n) => n.type === 'bridge')) addBrokenBridge(ctx)
  if (opts.ducts !== false && !ctx.ducts.length) {
    for (let t = 0; t < 3 && !ctx.ducts.length; t++) addVentDuct(ctx)
  }
  if (opts.hangings !== false) addCeilingHangings(ctx)

  // 5) 复杂地形（泥土/裂墙/酸液）—— 只换材质，不动可通行性
  if (opts.tiles !== false && !ctx.tileDeco) decorateComplexTiles(ctx, opts)

  report.layers = countLayers(ctx)
  report.channels = countChannels(ctx)
  ctx.quality = report
  return report
}

/**
 * 兜底：只在「不移动已有地面」的前提下保证 3 层 / 2 通道。
 * 由 buildRoom() 调用（此时实体已经放好了）。
 */
export function ensureQualityFallback(ctx, opts = {}) {
  const layersTarget = opts.layers ?? 3
  const channelsTarget = opts.channels ?? 2
  const report = { addedLayers: 0, addedChannels: 0, alcove: !!ctx.notes.some((n) => n.type === 'alcove') }
  let guard = 0
  while (countLayers(ctx) < layersTarget && guard++ < 5) {
    if (!addStandLayer(ctx)) break
    report.addedLayers++
    report.changed = true
  }
  guard = 0
  while (countChannels(ctx) < channelsTarget && guard++ < 5) {
    if (!addVerticalChannel(ctx)) break
    report.addedChannels++
    report.changed = true
  }
  if (!report.alcove) {
    // 只在不压到实体的情况下挖
    const before = ctx.notes.length
    for (let i = 0; i < 6; i++) {
      const a = addHiddenAlcove(ctx, { tries: 3 })
      if (a) {
        report.alcove = true
        report.changed = true
        break
      }
    }
    if (ctx.notes.length === before) report.alcove = false
  }
  ctx.qualityFallback = report
  return report
}

// =====================================================================
// 复杂度统计
// =====================================================================

/** 统计房间的地形复杂度（写进 gen.meta.complexity） */
export function computeComplexity(ctx) {
  const { map, w, h } = ctx
  const tiles = { solid: 0, cracked: 0, soil: 0, water: 0, toxic: 0, platform: 0, pole: 0, empty: 0 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = map.get(x, y)
      if (t === T.SOLID) tiles.solid++
      else if (t === T.CRACKED) tiles.cracked++
      else if (t === T.SOIL) tiles.soil++
      else if (t === T.WATER) tiles.water++
      else if (t === T.TOXIC) tiles.toxic++
      else if (t === T.PLATFORM) tiles.platform++
      else if (t === T.POLE) tiles.pole++
      else tiles.empty++
    }
  }
  const layers = countLayers(ctx)
  const channels = countChannels(ctx)
  const alcoves = ctx.notes.filter((n) => n.type === 'alcove').length
  const ducts = ctx.ducts.length
  const piles = ctx.notes.filter((n) => n.type === 'pile').length
  const mazes = ctx.notes.filter((n) => n.type === 'maze').length
  const bridges = ctx.notes.filter((n) => n.type === 'bridge').length
  return {
    tiles,
    layers,
    channels,
    alcoves,
    ducts,
    piles,
    mazes,
    bridges,
    hangings: ctx.hangings,
    platforms: ctx.platforms.length,
    poles: ctx.poles.length,
    shafts: ctx.shafts.length,
    pools: ctx.pools.length,
    // 一个粗略的「地形丰富度」分：可交互瓦片占比 + 结构件数量
    score: Math.round(
      (((tiles.cracked + tiles.soil + tiles.toxic + tiles.platform) / Math.max(1, w * h)) * 1000 +
        layers * 8 +
        channels * 6 +
        (ducts + piles + mazes + bridges + alcoves) * 5) *
        10,
    ) / 10,
  }
}
