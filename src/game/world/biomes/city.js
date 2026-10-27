// 锈城废墟（city）—— 断裂楼板做多层平台、坍塌高架、地铁口深井、霓虹残牌
//
// 变体（spec.variant，缺省取 spec.kind）：
//   street   普通街道：雨水沟 + 断楼板 + 坍塌高架 + 街道垃圾
//   shelter  避难所：整平地基 + 营地 + 屋檐平台（少怪、多藏匿物资）
//   plaza    广场（arena）：开阔中庭 + 生成器地标 + 环形高台
//   slum     棚户区：窄巷 + 民房断面 + 营救牢笼 + 壁龛
//   tower    锈塔（arena）：五层楼板 + 中继站地标
//   gate     区界闸口：长街 + 闸门 + 少量物资
import { TS } from '../../config.js'
import {
  createRoomCtx,
  buildTerrain,
  flattenSpan,
  shiftSpan,
  digBasin,
  carveShaft,
  carveAlcove,
  addPlatform,
  addPlatformBand,
  addPlatformStairs,
  addPole,
  ensurePlatformAccess,
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
  WALK_STEP,
} from './index.js'
import { enforceRoomQuality, addCollapsePile, addBrokenBridge } from './features.js'

/** 房间平均地面行 */
function avgFloor(ctx) {
  let s = 0
  for (let x = 0; x < ctx.w; x++) s += ctx.floorY[x]
  return Math.round(s / ctx.w)
}

/** 让平台行落在走廊里（太低就退回地面之上一点） */
function tierRow(ctx, above) {
  const g = avgFloor(ctx)
  return Math.max(ctx.ceilY[Math.floor(ctx.w / 2)] + 2, g - above)
}

/** spec.landmark -> placeLandmarks 用的数组 */
function landmarkList(spec) {
  return spec.landmark ? [{ id: spec.landmark }] : []
}

/** spec.cage -> placeCages 用的数组 */
function cageList(spec) {
  return spec.cage ? [{ id: spec.cage.id, rescueQuest: spec.cage.rescueQuest }] : []
}

/** 街道裂隙：1 格深、1~2 格宽的干裂缝，不影响通行（A 阶段） */
function addStreetCracks(ctx, count) {
  const { rng, w } = ctx
  let made = 0
  let guard = 0
  while (made < count && guard++ < count * 12) {
    const x = rng.int(ctx.doorInset + 6, w - ctx.doorInset - 7)
    if (inShelter(ctx, x)) continue
    // 只在本来就平的段落上开裂缝
    if (!flatSpanExact(ctx, x - 1, x + 1)) continue
    const len = rng.int(1, 2)
    shiftSpan(ctx, x, x + len - 1, 1)
    made++
  }
  return made
}

/**
 * 断裂楼板：在 row 附近铺几条错开的单向平台，并给「上得去」的阶梯。
 * 返回铺出来的平台
 */
function addFloorSlabs(ctx, opts = {}) {
  const { rng, w } = ctx
  const count = opts.count ?? 3
  const row = opts.row ?? tierRow(ctx, 6)
  const out = []
  for (let i = 0; i < count; i++) {
    const len = rng.int(4, 9)
    const x = rng.int(ctx.doorInset + 4, w - ctx.doorInset - 6 - len)
    const p = addPlatform(ctx, x, row, len)
    if (p) out.push(p)
  }
  return out
}

/** 坍塌高架：一条横贯大半间房的长平台，底下立几根柱子 */
function addOverpass(ctx, opts = {}) {
  const { rng, w } = ctx
  const row = opts.row ?? tierRow(ctx, 11)
  const x0 = ctx.doorInset + 3
  const x1 = w - ctx.doorInset - 4
  // 中间断一截（坍塌），两侧各留一段
  const gapW = rng.int(3, 6)
  const gapX = rng.int(x0 + 8, Math.max(x0 + 9, x1 - gapW - 8))
  const segs = []
  segs.push(...addPlatformBand(ctx, x0, gapX - 1, row))
  segs.push(...addPlatformBand(ctx, gapX + gapW, x1, row))
  // 柱子（纯装饰 + 可攀爬，让高架看起来是撑起来的）
  const cols = shuffle(rng, segs.flatMap((s) => [s.x0 + 1, s.x1 - 1])).slice(0, 3)
  for (const cx of cols) {
    const ground = surfaceRow(ctx, cx)
    if (ground > row + 2) addPole(ctx, cx, row + 1, ground - 1)
  }
  return { row, segs, gap: [gapX, gapX + gapW - 1] }
}

/** 霓虹残牌：挂在建筑断面上的灯箱（用 streetlight / tv 道具代替） */
function addNeonDebris(ctx, count) {
  const { rng, w } = ctx
  for (let i = 0; i < count; i++) {
    const x = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 6)
    const row = surfaceRow(ctx, x)
    if (row < 0) continue
    if (!isFree(ctx, x, row, 1)) continue
    addProp(ctx, rng.chance(0.5) ? 'streetlight' : 'tv', x, row, { z: -1 })
  }
}

export function generateCityRoom(spec) {
  const ctx = createRoomCtx(spec, 'city')
  const { rng, w, h } = ctx
  const variant = ctx.variant

  // ===================================================================
  // A. 基础地形
  // 街道整体平缓（0~2 行起伏），但走廊很高（12~24 行）以便多层楼板
  // ===================================================================
  buildTerrain(ctx, {
    base: h - 12,
    amp: variant === 'shelter' ? 1.6 : 3.0,
    scale: 19,
    plateau: variant === 'shelter' ? 0.85 : variant === 'plaza' ? 0.7 : 0.5,
    corridor: variant === 'tower' ? 30 : 23,
    corridorVar: 7,
    minCorridor: 16,
    maxCorridor: 34,
    lo: h - 20,
    hi: h - 6,
    upStep: 2,
    downStep: 2,
  })

  // --- 雨水沟 / 浅水洼（可直接走过去，水深 2 行） ---
  const gullyCount = variant === 'shelter' ? 0 : rng.int(1, 3)
  for (let i = 0; i < gullyCount; i++) {
    const cx = rng.int(12, w - 14)
    if (inShelter(ctx, cx)) continue
    digBasin(ctx, cx, rng.int(2, 4), rng.int(1, 2), { water: true, lip: 1 })
  }

  // --- 街道裂隙 ---
  addStreetCracks(ctx, variant === 'shelter' ? 0 : rng.int(2, 5))

  // --- 地铁口：先把井口段整平（竖井本体在 C 阶段挖） ---
  let metroCx = rng.chance(0.5)
    ? rng.int(ctx.doorInset + 8, Math.floor(w * 0.42))
    : rng.int(Math.floor(w * 0.58), w - ctx.doorInset - 10)
  if (variant === 'shelter') metroCx = -1 // 避难所不放深井
  if (metroCx > 0) {
    const rim = Math.max(...Array.from(ctx.floorY.slice(metroCx - 2, metroCx + 3)))
    flattenSpan(ctx, metroCx - 2, metroCx + 2, rim)
  }

  // --- 棚户区：窄巷两侧各挖一个浅壁龛做藏匿点（drop=2，两侧地面等高） ---
  const alcoves = []
  if (variant === 'slum' || variant === 'street') {
    const tries = rng.int(1, 3)
    for (let i = 0; i < tries; i++) {
      const cx = rng.int(ctx.doorInset + 6, w - ctx.doorInset - 8)
      if (inShelter(ctx, cx)) continue
      if (!flatSpanExact(ctx, cx - 3, cx + 3)) continue
      const a = carveAlcove(ctx, cx, rng.int(1, 2), 2, { hide: true })
      if (a) alcoves.push(a)
    }
  }

  // --- 避难所地基 ---
  let shelterZone = null
  if (variant === 'shelter') {
    shelterZone = prepareShelter(ctx, { side: spec.shelterSide || 'left', half: 4 })
  }

  // ===================================================================
  // B. 门洞 + 连续性兜底 + 灌水
  // ===================================================================
  finalizeTerrain(ctx)
  if (shelterZone) shelterZone.row = ctx.floorY[shelterZone.cx]

  // ===================================================================
  // C. 不改 floorY 的结构：地铁竖井 / 楼板 / 高架 / 杆
  // ===================================================================
  let metro = null
  if (metroCx > 0) {
    metro = carveShaft(ctx, metroCx, 2, rng.int(7, 10), { water: 3, pole: true, ledges: 2 })
  }

  // --- 断裂楼板（多层平台） ---
  const slabTiers = variant === 'tower' ? 5 : variant === 'plaza' ? 3 : variant === 'shelter' ? 1 : 2
  const slabs = []
  for (let i = 0; i < slabTiers; i++) {
    const row = tierRow(ctx, 6 + i * 5)
    if (row <= ctx.ceilY[Math.floor(w / 2)] + 1) break
    for (const p of addFloorSlabs(ctx, { count: variant === 'tower' ? 3 : rng.int(2, 4), row })) slabs.push(p)
  }

  // --- 坍塌高架（横向长平台，中间塌断） ---
  let overpass = null
  if (variant !== 'shelter') overpass = addOverpass(ctx, { row: tierRow(ctx, 12) })

  // --- 竖向通路：从地面爬上第一层楼板的阶梯 + 一根杆 ---
  const stairX = variant === 'tower' ? ctx.doorInset + 5 : w - ctx.doorInset - 12
  const groundRow = surfaceRow(ctx, stairX) >= 0 ? surfaceRow(ctx, stairX) : ctx.floorY[stairX]
  const firstTier = tierRow(ctx, 6)
  if (firstTier < groundRow - 3) {
    addPlatformStairs(ctx, stairX, variant === 'tower' ? 1 : -1, groundRow - 2, firstTier, {
      stepH: 4,
      stepW: 3,
    })
  }
  const poleX = rng.int(ctx.doorInset + 7, w - ctx.doorInset - 9)
  if (surfaceRow(ctx, poleX) > (overpass ? overpass.row + 3 : ctx.floorY[poleX] - 6)) {
    addPole(ctx, poleX, (overpass ? overpass.row : ctx.floorY[poleX] - 8) + 1, surfaceRow(ctx, poleX) - 1)
  }

  // --- 避难所屋檐 ---
  if (variant === 'shelter') finishShelter(ctx, { roofHeight: 7 })

  // --- 广场：中庭两侧的高台（环形看台感） ---
  if (variant === 'plaza' || variant === 'tower') {
    const cxc = Math.floor(w / 2)
    for (const dx of [-1, 1]) {
      const x = clamp(cxc + dx * Math.round(w * 0.28), ctx.doorInset + 4, w - ctx.doorInset - 8)
      for (let k = 0; k < 2; k++) {
        addPlatform(ctx, x, tierRow(ctx, 5 + k * 5), rng.int(3, 5))
      }
    }
  }

  // ===================================================================
  // D. 布置
  // ===================================================================
  // 给上不去的高台补爬杆（保证竖向空间都能用）
  ensurePlatformAccess(ctx)

  // 质量闸：3 层站立面 / 2 竖向通道 / 1 隐藏壁龛 / 复杂地形（会改地面，必须在布置前）
  enforceRoomQuality(ctx, {
    bridge: variant !== 'shelter',
    ducts: variant !== 'shelter',
    piles: variant !== 'shelter',
    toxic: 0.4,
  })

  // 武器 / 生态点 / 大型敌人先占位（必须在物资之前）
  placeExtras(ctx)

  // 地标 / 牢笼 / 怪物优先占位，物资填剩下的空间
  placeLandmarks(ctx, landmarkList(spec))
  placeCages(ctx, cageList(spec))

  placeMonsters(ctx, {
    count:
      spec.monsterCount != null
        ? spec.monsterCount
        : variant === 'shelter'
          ? 1
          : variant === 'plaza' || variant === 'tower'
            ? 5
            : 3,
  })

  placeLoot(ctx, {
    platformRatio: variant === 'tower' ? 0.34 : 0.26,
    shaftRatio: metro ? 0.16 : 0.08,
    hiddenRatio: variant === 'slum' ? 0.3 : 0.18,
  })

  // --- 街道垃圾 / 残骸 ---
  const common = [
    { kind: 'junk_heap', count: rng.int(2, 4), r: 2 },
    { kind: 'crate', count: rng.int(1, 3), r: 1 },
    { kind: 'barrel', count: rng.int(1, 3), r: 1 },
    { kind: 'tire_pile', count: rng.int(1, 2), r: 1 },
    { kind: 'skeleton_human', count: rng.int(0, 2), r: 1 },
    { kind: 'sofa', count: rng.int(0, 2), r: 1 },
    { kind: 'fence', count: rng.int(1, 3), r: 1 },
    { kind: 'puddle_toxic', count: rng.int(0, 2), r: 1 },
  ]
  if (variant !== 'shelter') {
    common.push({ kind: 'car_wreck', count: rng.int(1, 2), r: 2 })
    common.push({ kind: 'bus_wreck', count: rng.chance(0.5) ? 1 : 0, r: 3 })
    common.push({ kind: 'building_facade', count: rng.int(1, 2), r: 2, z: -2 })
  }
  if (variant === 'slum') {
    common.push({ kind: 'house_facade', count: rng.int(2, 4), r: 2, z: -2 })
    common.push({ kind: 'wardrobe', count: rng.int(1, 2), r: 1 })
    common.push({ kind: 'cradle', count: rng.int(0, 1), r: 1 })
    common.push({ kind: 'grave', count: rng.int(0, 1), r: 1 })
  }
  if (variant === 'tower' || variant === 'plaza') {
    common.push({ kind: 'antenna', count: rng.int(0, 1), r: 1 })
    common.push({ kind: 'fence', count: rng.int(2, 4), r: 1, where: 'platform' })
  }
  if (variant === 'gate') {
    common.push({ kind: 'building_facade', count: 2, r: 2, z: -2 })
    common.push({ kind: 'barrel', count: rng.int(2, 4), r: 1 })
  }
  placeProps(ctx, { list: common })
  addNeonDebris(ctx, variant === 'shelter' ? 1 : rng.int(2, 4))

  // 街灯：沿高架与地面点缀
  placeProps(ctx, {
    list: [
      { kind: 'streetlight', count: rng.int(2, 4), r: 1, where: 'ground' },
      { kind: 'streetlight', count: rng.int(0, 2), r: 1, where: 'platform' },
    ],
  })

  // 水洼上的毒水道具
  for (const p of ctx.pools) {
    const cx = Math.round((p.x0 + p.x1) / 2)
    const row = surfaceRow(ctx, cx)
    if (row < 0) continue
    if (!isFree(ctx, cx, row, 1)) continue
    addProp(ctx, 'puddle_toxic', cx, row, { z: 1 })
  }

  // --- 烟/尘：地铁口、塌楼、通风井 ---
  if (metro) {
    addSmoke(ctx, metro.cx, 70, 0.42, { row: metro.rim - 1, lift: 10 })
  }
  scatterSmoke(ctx, ctx.doorInset + 6, w - ctx.doorInset - 7, variant === 'shelter' ? 1 : rng.int(2, 3), {
    radius: 56,
    intensity: 0.3,
  })
  if (variant === 'plaza' || variant === 'tower') {
    scatterSmoke(ctx, Math.floor(w * 0.3), Math.floor(w * 0.7), 2, { radius: 78, intensity: 0.4, lift: 36 })
  }

  return buildRoom(ctx)
}

export default generateCityRoom
