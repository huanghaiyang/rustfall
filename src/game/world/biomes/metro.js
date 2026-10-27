// 废弃地铁（metro）—— 站台、轨道沟、扶梯、隧道塌方、信号室、车库
//
// 变体（spec.variant，缺省取 spec.kind）：
//   platform   站台：高站台 + 低轨道沟（积水）+ 闸机 + 天桥
//   shelter    值班室：整平地面 + 营地 + 隔间
//   tunnel     隧道：长直隧道 + 塌方堆 + 通风管 + 酸水洼
//   flood      积水段：大面积积水/酸液 + 浮桥 + 竖井
//   escalator  扶梯：长阶梯 + 中庭 + 掉落的吊灯
//   signal     信号室（arena）：中继/天线 + 高架信号台
//   depot      车库（arena）：车厢残骸 + 货柜堆 + 吊车轨道
//   gate       区界：闸机大厅 + 隧道口
import { T } from '../tilemap.js'
import { TS } from '../../config.js'
import {
  createRoomCtx,
  buildTerrain,
  flattenSpan,
  digBasin,
  carveShaft,
  carveAlcove,
  addPlatform,
  addPlatformBand,
  addPlatformStairs,
  addPole,
  finalizeTerrain,
  surfaceRow,
  standSpots,
  platformSpots,
  isFree,
  markTaken,
  reserveSpan,
  prepareShelter,
  finishShelter,
  placeLoot,
  placeMonsters,
  placeProps,
  placeCages,
  placeLandmarks,
  addSmoke,
  scatterSmoke,
  addProp,
  placeExtras,
  buildRoom,
  flatRun,
  flatSpanExact,
  inShelter,
  clamp,
  shuffle,
} from './index.js'
import { enforceRoomQuality, addVentDuct, addCollapsePile, addBrokenBridge } from './features.js'

function avgFloor(ctx) {
  let s = 0
  for (let x = 0; x < ctx.w; x++) s += ctx.floorY[x]
  return Math.round(s / ctx.w)
}
function landmarkList(spec) {
  return spec.landmark ? [{ id: spec.landmark }] : []
}
function cageList(spec) {
  return spec.cage ? [{ id: spec.cage.id, rescueQuest: spec.cage.rescueQuest }] : []
}

/** 轨道沟：拉长的一段下沉（两端有台阶），沟底常有积水 */
function addTrackTrench(ctx, x0, x1, depth, opts = {}) {
  const { w, floorY } = ctx
  const a = clamp(x0, ctx.doorInset + 4, w - 4)
  const b = clamp(x1, a + 8, w - ctx.doorInset - 5)
  let rim = 0
  for (let x = a; x <= b; x++) rim = Math.max(rim, floorY[x])
  const low = Math.min(ctx.h - 4, rim + depth)
  for (let x = a + 3; x <= b - 3; x++) {
    floorY[x] = low
    if (ctx.ceilY[x] > low - 10) ctx.ceilY[x] = Math.max(2, low - 10)
    carveColumnSafe(ctx, x)
  }
  // 两端的斜坡（每列 1 行，保证 ≤2 台阶）
  for (let k = 0; k < 3; k++) {
    const xl = a + k
    const xr = b - k
    floorY[xl] = Math.min(floorY[xl], rim + (3 - k) * Math.ceil(depth / 3))
    floorY[xr] = Math.min(floorY[xr], rim + (3 - k) * Math.ceil(depth / 3))
    carveColumnSafe(ctx, xl)
    carveColumnSafe(ctx, xr)
  }
  const span = { x0: a + 3, x1: b - 3, rim, bottom: low, depth }
  if (opts.water !== false) {
    ctx.pools.push({ x0: a + 4, x1: b - 4, surfaceRow: low - (opts.waterRows ?? 2), kind: opts.kind || 'water' })
  }
  ctx.notes.push({ type: 'trench', ...span })
  return span
}

/** 只重建地面（carveColumn 会把平台/水抹掉，这里用一个保守版本） */
function carveColumnSafe(ctx, x) {
  const { map, h, floorY, ceilY } = ctx
  for (let y = 0; y < h; y++) {
    if (y >= floorY[x]) {
      map.set(x, y, T.SOLID)
    } else if (y >= ceilY[x]) {
      const v = map.get(x, y)
      if (v === T.SOLID) map.set(x, y, T.EMPTY)
    }
  }
}

/** 站台：贴着轨道沟的高台（单向平台）+ 上下台阶 */
function addStationPlatform(ctx, x0, x1, row) {
  const segs = addPlatformBand(ctx, x0, x1, row)
  // 台阶从地面走上站台
  const sx = clamp(x0 + 2, 2, ctx.w - 4)
  const g = surfaceRow(ctx, sx)
  if (g > row + 2) addPlatformStairs(ctx, sx, -1, g - 1, row, { stepH: 4, stepW: 3 })
  return segs
}

/** 闸机排：一排实心小件（用 prop 表达，不挡主路） */
function addTurnstiles(ctx, x0, x1) {
  let n = 0
  for (let x = x0; x <= x1; x += 3) {
    const row = surfaceRow(ctx, x)
    if (row < 0) continue
    if (!isFree(ctx, x, row, 1)) continue
    addProp(ctx, 'turnstile', x, row, { r: 1 })
    n++
  }
  return n
}

export function generateMetroRoom(spec) {
  const ctx = createRoomCtx(spec, 'metro')
  const { rng, w, h } = ctx
  const variant = ctx.variant

  // ===================================================================
  // A. 基础地形：地铁整体平坦，但走廊高（站厅/隧道顶）
  // ===================================================================
  buildTerrain(ctx, {
    base: h - 12,
    amp: variant === 'shelter' ? 1.4 : 2.4,
    scale: 17,
    plateau: variant === 'shelter' ? 0.9 : 0.55,
    corridor: variant === 'signal' ? 26 : 20,
    corridorVar: 6,
    minCorridor: 14,
    maxCorridor: 32,
    lo: h - 18,
    hi: h - 6,
    upStep: 2,
    downStep: 2,
  })

  // --- 轨道沟（站台/车库/隧道都有） ---
  let trench = null
  if (variant === 'platform' || variant === 'depot' || variant === 'tunnel' || variant === 'gate') {
    const len = Math.round(w * (variant === 'tunnel' ? 0.6 : 0.42))
    const x0 = rng.int(ctx.doorInset + 6, Math.max(ctx.doorInset + 7, w - ctx.doorInset - 12 - len))
    trench = addTrackTrench(ctx, x0, x0 + len, rng.int(2, 4), {
      water: variant !== 'depot',
      waterRows: 2,
    })
  }
  // --- 积水段：大片水/酸液 ---
  if (variant === 'flood') {
    for (let i = 0; i < rng.int(2, 4); i++) {
      const cx = rng.int(14, w - 16)
      digBasin(ctx, cx, rng.int(4, 7), rng.int(2, 3), { water: true, lip: 1, kind: 'water' })
    }
  }

  // --- 竖井：维护通道（先整平井口） ---
  const shaftCx = clamp(
    rng.int(Math.floor(w * 0.35), Math.floor(w * 0.7)),
    ctx.doorInset + 8,
    w - ctx.doorInset - 9,
  )
  {
    const rim = Math.max(...Array.from(ctx.floorY.slice(shaftCx - 2, shaftCx + 3)))
    flattenSpan(ctx, shaftCx - 2, shaftCx + 2, rim)
  }

  // --- 扶梯：先把中庭整平，方便铺长阶梯 ---
  if (variant === 'escalator' || variant === 'signal') {
    const cx = Math.round(w * 0.5)
    const row = Math.max(...Array.from(ctx.floorY.slice(cx - 12, cx + 12)))
    flattenSpan(ctx, cx - 12, cx + 12, row)
  }

  // --- 隐藏壁龛（站台下方/墙脚） ---
  if (variant === 'platform' || variant === 'tunnel' || variant === 'depot') {
    for (let i = 0; i < 2; i++) {
      const cx = rng.int(ctx.doorInset + 8, w - ctx.doorInset - 9)
      if (!flatSpanExact(ctx, cx - 3, cx + 3)) continue
      carveAlcove(ctx, cx, 1, 2, { hide: true })
    }
  }

  // --- 避难所 ---
  let shelterZone = null
  if (variant === 'shelter') {
    shelterZone = prepareShelter(ctx, { side: spec.shelterSide || 'left', half: 5 })
  }

  // ===================================================================
  // B. 门洞 + 连续性 + 灌水
  // ===================================================================
  finalizeTerrain(ctx)

  // ===================================================================
  // C. 结构
  // ===================================================================
  const g = avgFloor(ctx)
  const shaft = carveShaft(ctx, shaftCx, 2, rng.int(9, 13), { water: 3, pole: true, ledges: 2 })

  // --- 站台 ---
  if (trench && (variant === 'platform' || variant === 'gate')) {
    const prow = trench.bottom - 6
    addStationPlatform(ctx, trench.x0, trench.x1, prow)
    // 站台上方的雨棚（另一层）
    if (prow - 8 > ctx.ceilY[Math.floor(w / 2)] + 2) {
      addPlatformBand(ctx, trench.x0 + 2, trench.x1 - 2, prow - 8)
    }
    addTurnstiles(ctx, ctx.doorInset + 6, ctx.doorInset + 20)
  }

  // --- 扶梯：长阶梯 + 中庭挑台 ---
  if (variant === 'escalator') {
    const sx = Math.round(w * 0.32)
    const gr = surfaceRow(ctx, sx) >= 0 ? surfaceRow(ctx, sx) : g
    addPlatformStairs(ctx, sx, 1, gr - 2, g - 16, { stepH: 3, stepW: 4 })
    addPlatformStairs(ctx, sx, 1, gr - 2, g - 9, { stepH: 3, stepW: 3 })
    // 中庭挑台
    addPlatformBand(ctx, Math.round(w * 0.55), w - ctx.doorInset - 6, g - 7)
    addPlatformBand(ctx, Math.round(w * 0.6), w - ctx.doorInset - 8, g - 13)
  }

  // --- 信号室：高架信号台 + 中继 ---
  if (variant === 'signal' || variant === 'gate') {
    const cx = Math.round(w * (rng.chance(0.5) ? 0.38 : 0.6))
    const row = g - 8
    if (row > ctx.ceilY[cx] + 3) {
      addPlatformBand(ctx, cx - 7, cx + 7, row)
      const gr = surfaceRow(ctx, cx - 9) >= 0 ? surfaceRow(ctx, cx - 9) : g
      addPlatformStairs(ctx, cx - 9, 1, gr - 2, row, { stepH: 4, stepW: 3 })
      if (isFree(ctx, cx, row, 2)) addProp(ctx, 'terminal', cx, row, { r: 2, z: 1 })
      if (isFree(ctx, cx + 3, row, 1)) addProp(ctx, 'antenna', cx + 3, row, { r: 1 })
      addSmoke(ctx, cx, 60, 0.24, { row, lift: 12 })
    }
  }

  // --- 车库：车厢残骸 + 货柜堆 ---
  if (variant === 'depot') {
    const x0 = ctx.doorInset + 6
    for (let i = 0; i < 3; i++) {
      const cx = x0 + i * Math.round(w / 5)
      if (cx >= w - ctx.doorInset - 8) break
      const row = surfaceRow(ctx, cx)
      if (row < 0) continue
      if (isFree(ctx, cx, row, 3)) addProp(ctx, rng.chance(0.5) ? 'container_small' : 'bus_wreck', cx, row, { r: 3 })
      // 集装箱顶可以站
      addPlatform(ctx, cx - 2, row - 3, 5)
      if (rng.chance(0.6)) addPlatform(ctx, cx - 1, row - 6, 3)
    }
  }

  // --- 隧道天桥（断桥） ---
  if (variant === 'tunnel' || variant === 'flood') {
    addBrokenBridge(ctx, { row: g - 12 })
    addCollapsePile(ctx, { tries: 2 })
  }

  // 通用吊台
  for (let i = 0; i < rng.int(3, 6); i++) {
    const x = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 9)
    const row = g - rng.int(6, 15)
    if (row <= ctx.ceilY[x] + 2) continue
    addPlatform(ctx, x, row, rng.int(3, 7))
  }
  if (variant === 'shelter') finishShelter(ctx, { roofHeight: 7 })

  // ===================================================================
  // 质量闸：3 层站立面 / 2 竖向通道 / 1 隐藏壁龛 / 复杂地形
  // ===================================================================
  enforceRoomQuality(ctx, {
    bridge: variant !== 'shelter',
    ducts: true,
    piles: variant !== 'shelter',
    toxic: 0.28,
  })

  // 武器 / 生态点 / 大型敌人先占位（必须在物资之前）
  placeExtras(ctx)

  // ===================================================================
  // D. 布置
  // ===================================================================
  placeLandmarks(ctx, landmarkList(spec))
  placeCages(ctx, cageList(spec))
  placeMonsters(ctx)
  placeLoot(ctx, {
    platformRatio: 0.34,
    shaftRatio: shaft ? 0.14 : 0.06,
    hiddenRatio: 0.24,
    buriedRatio: 0.16,
  })

  const common = [
    { kind: 'turnstile', count: rng.int(2, 5), r: 1 },
    { kind: 'junk_heap', count: rng.int(0, 1), r: 1, scale: 0.8 },
    { kind: 'junk_heap_scrap', count: rng.int(1, 2), r: 1, scale: 0.9 },
    { kind: 'junk_heap_plastic', count: rng.int(0, 1), r: 1, scale: 0.9 },
    { kind: 'crate', count: rng.int(1, 3), r: 1 },
    { kind: 'barrel', count: rng.int(1, 3), r: 1 },
    { kind: 'rebar_pile', count: rng.int(1, 3), r: 1 },
    { kind: 'cable_spool', count: rng.int(0, 2), r: 1 },
    { kind: 'vent', count: rng.int(1, 3), r: 1 },
    { kind: 'duct', count: rng.int(0, 2), r: 2 },
    { kind: 'skeleton_human', count: rng.int(0, 2), r: 1 },
    { kind: 'puddle_toxic', count: rng.int(1, 3), r: 1 },
    { kind: 'streetlight', count: rng.int(1, 3), r: 1 },
    { kind: 'building_facade', count: rng.int(0, 1), r: 2, z: -2 },
    // 站台设备：机柜、控制台、轨道与线缆
    { kind: 'server_rack', count: rng.int(0, 2), r: 2 },
    { kind: 'mech_console', count: rng.int(0, 2), r: 1 },
    { kind: 'mech_cable_run', count: rng.int(1, 3), r: 1 },
    { kind: 'mech_rail', count: rng.int(0, 1), r: 2 },
  ]
  if (variant === 'depot') common.push({ kind: 'container_small', count: 2, r: 2 })
  if (variant === 'flood') common.push({ kind: 'life_ring', count: rng.int(1, 2), r: 1 })
  if (variant === 'gate') common.push({ kind: 'fence', count: 3, r: 1 })
  placeProps(ctx, { list: common })
  placeProps(ctx, {
    list: [
      { kind: 'crate', count: rng.int(1, 3), r: 1, where: 'platform' },
      { kind: 'junk_heap', count: rng.int(0, 2), r: 1, where: 'platform' },
      { kind: 'vent', count: rng.int(0, 2), r: 1, where: 'platform' },
    ],
  })

  for (const p of ctx.pools) {
    const cx = Math.round((p.x0 + p.x1) / 2)
    const row = surfaceRow(ctx, cx)
    if (row < 0 || !isFree(ctx, cx, row, 1)) continue
    addProp(ctx, 'puddle_toxic', cx, row, { z: 1 })
  }

  // 隧道风 / 站台灰
  scatterSmoke(ctx, ctx.doorInset + 5, w - ctx.doorInset - 6, variant === 'shelter' ? 1 : rng.int(2, 5), {
    radius: 52,
    intensity: 0.26,
  })
  if (trench) addSmoke(ctx, trench.x0 + 2, 66, 0.3, { row: trench.bottom - 1, lift: 6 })

  return buildRoom(ctx)
}

export default generateMetroRoom
