// 淤塞港口（port）—— 码头、货柜、龙门吊、淤泥滩、灯塔、搁浅船体
//
// 变体（spec.variant，缺省取 spec.kind）：
//   dock       码头：水域 + 浮桥 + 系缆桩 + 救生圈
//   shelter    港务值班棚：整平地面 + 营地
//   warehouse  仓库（arena）：货架带 + 货柜堆 + 高台
//   crane      龙门吊：高处窄轨 + 吊挂货柜 + 电缆盘
//   silt       淤泥滩：大片浅水/酸液 + 淤泥堆 + 陷落的栈桥
//   lighthouse 灯塔：螺旋平台塔 + 顶部航标
//   hull       搁浅船体：实心船壳 + 舱内隔间
//   gate       港口闸口：货柜夹道 + 缆绳 + 界门
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
import { enforceRoomQuality, addCollapsePile, addBrokenBridge } from './features.js'

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

/** 水域：一段下沉的港池，底部铺水（可游），岸边是缓坡 */
function addHarborBasin(ctx, cx, halfW, depth, opts = {}) {
  const b = digBasin(ctx, cx, halfW, depth, { water: true, lip: 1, kind: opts.kind || 'water' })
  return b
}

/** 浮桥：贴在水面上的一排单向平台（可走，掉下去能游） */
function addPontoon(ctx, x0, x1, surfaceRowValue) {
  const segs = []
  for (let x = x0; x < x1; x += 6) {
    const p = addPlatform(ctx, x, surfaceRowValue, Math.min(5, x1 - x))
    if (p) segs.push(p)
  }
  return segs
}

/** 货柜堆：一组可跳的箱子（2 行一层） */
function addContainerStack(ctx, cx, levels) {
  const { rng, w } = ctx
  const g = surfaceRow(ctx, clamp(cx, 2, w - 3))
  if (g < 0) return []
  const out = []
  for (let i = 0; i < levels; i++) {
    const half = rng.int(2, 3)
    const row = g - 2 * (i + 1)
    if (row <= ctx.ceilY[clamp(cx, 2, w - 3)] + 1) break
    const p = addPlatform(ctx, clamp(cx + rng.int(-1, 1) - half, 2, w - 4), row, half * 2 + 1)
    if (p) out.push(p)
  }
  const r = surfaceRow(ctx, clamp(cx, 2, w - 3))
  if (r >= 0 && isFree(ctx, cx, r, 2)) {
    addProp(ctx, levels > 2 ? 'container_small' : 'crate', clamp(cx, 2, w - 3), r, { r: 2 })
  }
  return out
}

/** 龙门吊：高轨道 + 吊挂货柜 + 上轨道的爬杆 */
function addGantry(ctx, opts = {}) {
  const { rng, w } = ctx
  const g = avgFloor(ctx)
  const row = clamp(g - (opts.height ?? 14), ctx.ceilY[Math.floor(w / 2)] + 3, g - 10)
  const x0 = ctx.doorInset + 4
  const x1 = w - ctx.doorInset - 5
  const segs = addPlatformBand(ctx, x0, x1, row)
  const drops = []
  for (let x = x0 + 5; x <= x1 - 5; x += rng.int(6, 10)) {
    const dh = rng.int(2, 5)
    const p = addPlatform(ctx, x, row + dh, 3)
    if (p) drops.push(p)
  }
  const px = clamp(x0 + rng.int(2, 4), 2, w - 3)
  const gr = surfaceRow(ctx, px)
  if (gr > row + 3) addPole(ctx, px, row + 1, gr - 1)
  return { row, segs, drops }
}

/** 灯塔：螺旋上升的平台塔 + 顶部航标 */
function addLighthouse(ctx, cx) {
  const { map, w, rng } = ctx
  const g = avgFloor(ctx)
  const rows = 5
  const out = []
  // 塔身：两侧立墙（实心，不落地）
  const half = 3
  const x0 = clamp(cx - half, ctx.doorInset + 4, w - ctx.doorInset - 5)
  const x1 = clamp(cx + half, x0 + 4, w - ctx.doorInset - 4)
  // 塔身两侧的墙：离地面至少留 6 行净空，否则会把主路卡成「头顶是墙」
  for (let y = g - 6; y > ctx.ceilY[cx] + 2; y--) {
    for (const wx of [x0 - 1, x1 + 1]) {
      if (wx < 2 || wx >= w - 2) continue
      if (y > ctx.floorY[wx] - 6) continue
      if (map.get(wx, y) === T.EMPTY) map.set(wx, y, T.SOLID)
    }
  }
  for (let i = 0; i < rows; i++) {
    const row = g - 4 - i * 4
    if (row <= ctx.ceilY[cx] + 2) break
    const dir = i % 2 === 0 ? 1 : -1
    const p = addPlatform(ctx, dir > 0 ? x0 : x1 - 2, row, 4)
    if (p) out.push(p)
  }
  // 塔顶航标
  const topRow = g - 4 - (rows - 1) * 4
  if (topRow > ctx.ceilY[cx] + 2 && isFree(ctx, cx, topRow, 2)) {
    addProp(ctx, 'beacon', cx, topRow, { r: 2 })
    ctx.smokeSources.push({ x: cx * TS + TS / 2, y: topRow * TS - 40, radius: 70, intensity: 0.24 })
  }
  return out
}

/** 搁浅船体：两块实心船壳之间留出舱室 */
function addHull(ctx, cx) {
  const { map, w, rng } = ctx
  const g = avgFloor(ctx)
  const halfLen = Math.min(Math.floor(w * 0.22), 28)
  const x0 = clamp(cx - halfLen, ctx.doorInset + 4, w - ctx.doorInset - 5)
  const x1 = clamp(cx + halfLen, x0 + 14, w - ctx.doorInset - 4)
  const hullTop = Math.max(ctx.ceilY[cx] + 4, g - 16)
  // 船壳（左右两条斜边墙）
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / Math.max(1, x1 - x0)
    const depth = Math.round(Math.sin(t * Math.PI) * 5)
    for (let k = 0; k < 2 + depth; k++) {
      const y = hullTop + k
      // 船壳也不能贴到地面：至少留 5 行净空
      if (y > ctx.floorY[x] - 5) continue
      if (y < ctx.h - 2 && y > 2 && map.get(x, y) === T.EMPTY) map.set(x, y, T.SOLID)
    }
  }
  // 舱内：掏空中间，留两层甲板
  for (let x = x0 + 3; x <= x1 - 3; x++) {
    for (let y = hullTop + 3; y < hullTop + 9; y++) {
      if (map.get(x, y) === T.SOLID) map.set(x, y, T.EMPTY)
    }
  }
  addPlatformBand(ctx, x0 + 6, x1 - 6, hullTop + 6)
  addPlatformBand(ctx, x0 + 10, x1 - 10, hullTop + 11)
  // 船壳破口（进出）
  for (let y = hullTop + 3; y < hullTop + 9; y++) {
    map.set(x0 + 1, y, T.EMPTY)
    map.set(x1 - 1, y, T.EMPTY)
  }
  return { x0, x1, hullTop }
}

export function generatePortRoom(spec) {
  const ctx = createRoomCtx(spec, 'port')
  const { rng, w, h } = ctx
  const variant = ctx.variant

  // ===================================================================
  // A. 地形：港口地面低、水域多、走廊高（吊机）
  // ===================================================================
  buildTerrain(ctx, {
    base: h - 12,
    amp: variant === 'shelter' ? 1.4 : 2.8,
    scale: 14,
    plateau: variant === 'shelter' ? 0.9 : 0.42,
    corridor: variant === 'crane' || variant === 'lighthouse' ? 26 : 20,
    corridorVar: 6,
    minCorridor: 14,
    maxCorridor: 34,
    lo: h - 19,
    hi: h - 6,
    upStep: 2,
    downStep: 2,
  })

  // --- 港池（水域） ---
  if (variant === 'dock' || variant === 'silt' || variant === 'gate') {
    for (let i = 0; i < rng.int(1, 3); i++) {
      const cx = rng.int(18, w - 20)
      addHarborBasin(ctx, cx, rng.int(6, 11), rng.int(2, 4))
    }
  }
  // --- 淤泥堆（抬高地面，铺成土） ---
  if (variant === 'silt' || variant === 'dock') {
    addCollapsePile(ctx, { tries: 3 })
  }
  // --- 仓库/龙门吊/船体：整平 ---
  if (variant === 'warehouse' || variant === 'crane' || variant === 'hull') {
    const cx = Math.round(w * 0.5)
    const row = Math.max(...Array.from(ctx.floorY.slice(cx - Math.round(w * 0.3), cx + Math.round(w * 0.3))))
    flattenSpan(ctx, cx - Math.round(w * 0.3), cx + Math.round(w * 0.3), row)
  }
  // --- 竖井（码头下面的排水井） ---
  const shaftCx = clamp(
    rng.int(Math.floor(w * 0.3), Math.floor(w * 0.7)),
    ctx.doorInset + 9,
    w - ctx.doorInset - 10,
  )
  {
    const rim = Math.max(...Array.from(ctx.floorY.slice(shaftCx - 2, shaftCx + 3)))
    flattenSpan(ctx, shaftCx - 2, shaftCx + 2, rim)
  }
  // --- 隐藏壁龛：货柜后 / 船壳缝 ---
  for (let i = 0; i < 2; i++) {
    const cx = rng.int(ctx.doorInset + 8, w - ctx.doorInset - 9)
    if (!flatSpanExact(ctx, cx - 3, cx + 3)) continue
    carveAlcove(ctx, cx, 1, 2, { hide: true })
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

  // --- 码头浮桥 ---
  if (variant === 'dock' || variant === 'silt') {
    for (const p of ctx.pools) {
      const mid = Math.round((p.x0 + p.x1) / 2)
      const surf = surfaceRow(ctx, mid)
      if (surf < 0) continue
      addPontoon(ctx, p.x0 + 1, p.x1 - 1, Math.max(ctx.ceilY[mid] + 4, surf - 5))
    }
  }
  // --- 仓库：货柜堆 + 货架带 ---
  if (variant === 'warehouse' || variant === 'gate') {
    for (let i = 0; i < rng.int(3, 6); i++) {
      const cx = ctx.doorInset + 10 + i * Math.round(w / 8)
      if (cx > w - ctx.doorInset - 10) break
      addContainerStack(ctx, cx, rng.int(2, 4))
    }
    addPlatformBand(ctx, ctx.doorInset + 6, w - ctx.doorInset - 7, g - 11)
  }
  // --- 龙门吊 ---
  if (variant === 'crane' || variant === 'warehouse') {
    const gantry = addGantry(ctx, { height: rng.int(12, 16) })
    for (const d of gantry.drops) {
      if (isFree(ctx, d.x0, d.row, 2)) addProp(ctx, 'crane_hook', d.x0, d.row, { r: 2, z: 1 })
    }
  }
  // --- 灯塔 ---
  if (variant === 'lighthouse') {
    addLighthouse(ctx, clamp(Math.round(w * 0.55), ctx.doorInset + 8, w - ctx.doorInset - 9))
  }
  // --- 搁浅船体 ---
  if (variant === 'hull') {
    const hull = addHull(ctx, Math.round(w * 0.5))
    if (hull) {
      // 船舱里的东西
      for (let i = 0; i < 3; i++) {
        const x = hull.x0 + 8 + i * 6
        if (x > hull.x1 - 8) break
        if (isFree(ctx, x, hull.hullTop + 6, 1)) addProp(ctx, 'crate', x, hull.hullTop + 6, { r: 1 })
      }
      addSmoke(ctx, Math.round(w * 0.5), 72, 0.3, { row: hull.hullTop + 2, lift: 10 })
    }
  }
  // --- 断桥 / 塌方 ---
  if (variant === 'crane' || variant === 'dock') addBrokenBridge(ctx, {})
  if (variant === 'silt') addCollapsePile(ctx, { tries: 2 })

  // 通用吊台
  for (let i = 0; i < rng.int(3, 6); i++) {
    const x = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 9)
    const row = g - rng.int(6, 16)
    if (row <= ctx.ceilY[x] + 2) continue
    addPlatform(ctx, x, row, rng.int(3, 8))
  }
  if (variant === 'shelter') finishShelter(ctx, { roofHeight: 7 })

  // ===================================================================
  // 质量闸
  // ===================================================================
  enforceRoomQuality(ctx, {
    bridge: variant !== 'shelter',
    ducts: variant !== 'lighthouse',
    piles: variant !== 'shelter',
    toxic: 0.6,
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
    buriedRatio: 0.2,
  })

  const common = [
    { kind: 'crate', count: rng.int(2, 5), r: 1 },
    { kind: 'container_small', count: rng.int(1, 3), r: 2 },
    { kind: 'barrel', count: rng.int(1, 4), r: 1 },
    { kind: 'cable_spool', count: rng.int(1, 3), r: 1 },
    { kind: 'life_ring', count: rng.int(1, 3), r: 1 },
    { kind: 'hull_plate', count: rng.int(1, 3), r: 2 },
    { kind: 'cargo_net', count: rng.int(1, 3), r: 1 },
    { kind: 'silt_mound', count: rng.int(1, 3), r: 1 },
    { kind: 'junk_heap', count: rng.int(0, 1), r: 1, scale: 0.8 },
    { kind: 'junk_heap_bags', count: rng.int(0, 1), r: 1, scale: 0.9 },
    { kind: 'junk_heap_cans', count: rng.int(0, 2), r: 1, scale: 0.9 },
    { kind: 'fence', count: rng.int(1, 3), r: 1 },
    { kind: 'skeleton_animal', count: rng.int(0, 2), r: 1 },
    { kind: 'puddle_toxic', count: rng.int(1, 3), r: 1 },
    { kind: 'factory_pipe', count: rng.int(0, 2), r: 2 },
    // 码头机械：涡轮、闸阀、卫星天线、桥架
    { kind: 'mech_turbine', count: rng.int(0, 1), r: 2 },
    { kind: 'mech_valve', count: rng.int(0, 2), r: 1 },
    { kind: 'satellite_dish', count: rng.int(0, 1), r: 2 },
    { kind: 'bridge_truss', count: rng.int(0, 1), r: 3 },
  ]
  if (variant === 'crane') common.push({ kind: 'crane_hook', count: rng.int(1, 2), r: 2 })
  if (variant === 'lighthouse') common.push({ kind: 'beacon', count: rng.int(0, 1), r: 1 })
  if (variant === 'gull' || variant === 'gate') common.push({ kind: 'cargo_net', count: 2, r: 1 })
  placeProps(ctx, { list: common })
  placeProps(ctx, {
    list: [
      { kind: 'crate', count: rng.int(1, 3), r: 1, where: 'platform' },
      { kind: 'cable_spool', count: rng.int(0, 2), r: 1, where: 'platform' },
      { kind: 'junk_heap', count: rng.int(0, 2), r: 1, where: 'platform' },
    ],
  })

  for (const p of ctx.pools) {
    const cx = Math.round((p.x0 + p.x1) / 2)
    const row = surfaceRow(ctx, cx)
    if (row < 0 || !isFree(ctx, cx, row, 1)) continue
    addProp(ctx, rng.chance(0.5) ? 'puddle_toxic' : 'silt_mound', cx, row, { z: 1 })
  }

  // 海风 / 淤泥臭气
  scatterSmoke(ctx, ctx.doorInset + 5, w - ctx.doorInset - 6, variant === 'shelter' ? 1 : rng.int(2, 5), {
    radius: 60,
    intensity: 0.26,
  })

  return buildRoom(ctx)
}

export default generatePortRoom
