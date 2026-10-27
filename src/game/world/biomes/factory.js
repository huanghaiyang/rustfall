// 熔渣工厂（factory）—— 巨型管道、传送带、熔炉坑、控制室
//
// 变体（spec.variant，缺省取 spec.kind）：
//   line      流水线：传送带长平台 + 管道外壳 + 蒸汽口
//   shelter   值班室：整平地面 + 营地 + 一块吊顶平台
//   hall      铸造主厅（arena）：开阔中庭 + 环形检修走道 + 发电机地标
//   furnace   熔炉坑：深坑（底部毒水）+ 上升热浪 + 营救牢笼
//   control   控制室（arena）：架空控制舱 + 终端 + 中继站 relay_c
//   gate      排渣闸：长走廊 + 闸门 + 废料
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
  ensurePlatformAccess,
  finalizeTerrain,
  surfaceRow,
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

/**
 * 巨型横向管道：用上下两层密集单向平台模拟圆柱外壳，
 * 中间可以走进去（管道内部），间隔加「法兰」平台。
 */
function addPipeRun(ctx, x0, x1, baseRow) {
  const { map } = ctx
  const rowBottom = baseRow
  const rowTop = baseRow - 4
  const out = []
  out.push(...addPlatformBand(ctx, x0, x1, rowBottom))
  out.push(...addPlatformBand(ctx, x0 + 1, x1 - 1, rowTop))
  // 法兰：每 6 列一块竖板（只放在管道外壳之间的空气里，不落地）
  for (let x = x0 + 5; x < x1 - 2; x += 6) {
    for (let y = rowTop + 1; y < rowBottom; y++) {
      if (map.get(x, y) === T.EMPTY) map.set(x, y, T.PLATFORM)
    }
  }
  return out
}

/** 传送带：一段长平台（中间故意断一截，需要跳），带滚筒装饰 */
function addConveyor(ctx, x0, x1, row) {
  const { rng } = ctx
  const gapX = rng.int(x0 + 6, Math.max(x0 + 7, x1 - 8))
  const gapW = rng.int(2, 4)
  const segs = []
  segs.push(...addPlatformBand(ctx, x0, gapX - 1, row))
  segs.push(...addPlatformBand(ctx, gapX + gapW, x1, row))
  return { row, segs, gap: [gapX, gapX + gapW - 1] }
}

/**
 * 架空控制舱：抬高的平台地板 + 实心顶盖 + 后壁，终端与中继放在里面。
 * 全部结构都在地面 4 行以上，不会挡住下面的主路。
 */
function addControlDeck(ctx, cx, opts = {}) {
  const { map, w } = ctx
  const g = avgFloor(ctx)
  const floorRow = opts.floorRow ?? g - 5
  const half = opts.half ?? 6
  const x0 = clamp(cx - half, ctx.doorInset + 3, w - ctx.doorInset - 4)
  const x1 = clamp(cx + half, x0 + 6, w - ctx.doorInset - 4)
  if (floorRow <= ctx.ceilY[cx] + 4) return null
  // 地板（单向平台，可从下面跳上来）
  const deck = addPlatformBand(ctx, x0, x1, floorRow)
  // 顶盖 + 后壁（实心，作为「舱体」的轮廓；都在地板之上，不落地）
  for (let x = x0; x <= x1; x++) {
    for (let y = floorRow - 4; y <= floorRow - 3; y++) {
      if (map.get(x, y) === T.EMPTY) map.set(x, y, T.SOLID)
    }
  }
  for (let y = floorRow - 2; y <= floorRow - 1; y++) {
    if (map.get(x0, y) === T.EMPTY) map.set(x0, y, T.SOLID)
    if (map.get(x1, y) === T.EMPTY) map.set(x1, y, T.SOLID)
  }
  // 上舱的楼梯
  const stairX = x1 + 1
  addPlatformStairs(ctx, stairX, 1, floorRow + 2, floorRow - 2, { stepH: 2, stepW: 2 })
  return { x0, x1, floorRow, cx: Math.round((x0 + x1) / 2) }
}

/** 环形检修走道：贴着房间中段的一圈高台 */
function addCatwalkRing(ctx) {
  const { rng, w } = ctx
  const g = avgFloor(ctx)
  const rows = [g - 7, g - 12]
  const out = []
  for (const row of rows) {
    if (row <= ctx.ceilY[Math.floor(w / 2)] + 2) continue
    const segs = addPlatformBand(ctx, ctx.doorInset + 4, w - ctx.doorInset - 5, row)
    // 打断成长短不一的走道
    for (const s of segs) if (s.len > 4) out.push(s)
  }
  // 连接上下的杆
  const px = rng.int(ctx.doorInset + 6, w - ctx.doorInset - 8)
  const gr = surfaceRow(ctx, px)
  if (gr > g - 6) addPole(ctx, px, g - 6, gr - 1)
  return out
}

export function generateFactoryRoom(spec) {
  const ctx = createRoomCtx(spec, 'factory')
  const { rng, w, h } = ctx
  const variant = ctx.variant

  // ===================================================================
  // A. 地形：厂房地面偏硬，起伏小；走廊高（管道/走道需要纵向空间）
  // ===================================================================
  buildTerrain(ctx, {
    base: h - 12,
    amp: variant === 'shelter' ? 1.4 : 2.6,
    scale: 17,
    plateau: variant === 'shelter' ? 0.9 : variant === 'hall' ? 0.6 : 0.45,
    corridor: variant === 'hall' ? 30 : 25,
    corridorVar: 6,
    minCorridor: 17,
    maxCorridor: 34,
    lo: h - 20,
    hi: h - 6,
    upStep: 2,
    downStep: 2,
  })

  // --- 地面上积的酸液沟（浅浅一层，可涉水） ---
  if (variant !== 'shelter') {
    const n = rng.int(1, 2)
    for (let i = 0; i < n; i++) {
      const cx = rng.int(12, w - 14)
      digBasin(ctx, cx, rng.int(3, 4), rng.int(1, 2), { water: true, lip: 1 })
    }
  }

  // --- 熔炉坑：先整平坑口（竖井在 C 阶段挖） ---
  let furnaceCx = -1
  if (variant === 'furnace') {
    furnaceCx = Math.round(w * (rng.chance(0.5) ? 0.4 : 0.6))
    const rim = Math.max(...Array.from(ctx.floorY.slice(furnaceCx - 4, furnaceCx + 5)))
    flattenSpan(ctx, furnaceCx - 4, furnaceCx + 4, rim)
  }

  // --- 藏匿壁龛：控制室/流水线的角落 ---
  if (variant === 'control' || variant === 'line') {
    for (let i = 0; i < 2; i++) {
      const cx = rng.int(ctx.doorInset + 7, w - ctx.doorInset - 9)
      if (!flatSpanExact(ctx, cx - 3, cx + 3)) continue
      carveAlcove(ctx, cx, 1, 2, { hide: true })
    }
  }

  // --- 避难所地基 ---
  let shelterZone = null
  if (variant === 'shelter') {
    shelterZone = prepareShelter(ctx, { side: spec.shelterSide || 'left', half: 4 })
  }

  // ===================================================================
  // B. 门洞 + 连续性 + 灌水
  // ===================================================================
  finalizeTerrain(ctx)

  // ===================================================================
  // C. 结构：熔炉坑 / 管道 / 传送带 / 走道 / 控制舱
  // ===================================================================
  const g = avgFloor(ctx)

  let furnace = null
  if (variant === 'furnace') {
    furnace = carveShaft(ctx, furnaceCx, 4, rng.int(8, 11), { water: 4, pole: true, ledges: 3 })
  }

  // --- 巨型管道（横向）+ 传送带 ---
  const pipes = []
  if (variant !== 'shelter') {
    const pipeCount = variant === 'hall' ? 2 : rng.int(1, 2)
    for (let i = 0; i < pipeCount; i++) {
      const len = rng.int(12, 20)
      const x0 = rng.int(ctx.doorInset + 4, Math.max(ctx.doorInset + 5, w - ctx.doorInset - 6 - len))
      const baseRow = g - (i === 0 ? rng.int(7, 9) : rng.int(13, 15))
      if (baseRow <= ctx.ceilY[x0] + 4) continue
      pipes.push(...addPipeRun(ctx, x0, x0 + len, baseRow))
    }
  }
  let conveyor = null
  if (variant === 'line' || variant === 'hall') {
    const row = g - 4
    if (row > ctx.ceilY[Math.floor(w / 2)] + 2) {
      conveyor = addConveyor(ctx, ctx.doorInset + 5, w - ctx.doorInset - 6, row)
    }
  }
  if (variant === 'hall' || variant === 'line') addCatwalkRing(ctx)

  // --- 控制舱 ---
  let deck = null
  if (variant === 'control') {
    deck = addControlDeck(ctx, Math.round(w * (rng.chance(0.5) ? 0.38 : 0.6)), { half: 6 })
  }

  if (variant === 'shelter') finishShelter(ctx, { roofHeight: 6 })

  // 通用小块吊台（垂直空间）
  for (let i = 0; i < rng.int(2, 4); i++) {
    const x = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 9)
    const row = g - rng.int(6, 12)
    if (row <= ctx.ceilY[x] + 2) continue
    addPlatform(ctx, x, row, rng.int(2, 4))
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
          : variant === 'hall' || variant === 'furnace'
            ? 5
            : 4,
  })

  placeLoot(ctx, {
    platformRatio: 0.34,
    shaftRatio: furnace ? 0.22 : 0.06,
    hiddenRatio: 0.16,
    buriedRatio: 0.1,
  })

  const common = [
    { kind: 'factory_pipe', count: rng.int(2, 5), r: 2 },
    { kind: 'barrel', count: rng.int(2, 4), r: 1 },
    { kind: 'crate', count: rng.int(1, 3), r: 1 },
    { kind: 'junk_heap', count: rng.int(0, 1), r: 1, scale: 0.8 },
    { kind: 'junk_heap_scrap', count: rng.int(1, 2), r: 1, scale: 0.9 },
    { kind: 'workbench', count: rng.int(0, 2), r: 1 },
    { kind: 'corpse', count: rng.int(0, 2), r: 1 },
    { kind: 'skeleton_human', count: rng.int(0, 1), r: 1 },
    { kind: 'tire_pile', count: rng.int(0, 2), r: 1 },
    { kind: 'puddle_toxic', count: rng.int(1, 3), r: 1 },
    // 车间机械：齿盘、传送带、伺服臂
    { kind: 'gear_assembly', count: rng.int(1, 2), r: 2 },
    { kind: 'conveyor_segment', count: rng.int(0, 1), r: 2 },
    { kind: 'mech_servo_arm', count: rng.int(0, 1), r: 2 },
    { kind: 'mech_piston', count: rng.int(0, 2), r: 1 },
    { kind: 'mech_clamp', count: rng.int(0, 1), r: 1 },
  ]
  if (variant !== 'shelter') {
    common.push({ kind: 'terminal', count: rng.int(1, 2), r: 1 })
    common.push({ kind: 'generator', count: rng.int(0, 1), r: 2 })
  }
  if (variant === 'control') {
    common.push({ kind: 'terminal', count: 2, r: 1 })
    common.push({ kind: 'antenna', count: 1, r: 1 })
  }
  if (variant === 'furnace') {
    common.push({ kind: 'factory_pipe', count: 3, r: 2 })
    common.push({ kind: 'barrel', count: 3, r: 1 })
  }
  if (variant === 'gate') {
    common.push({ kind: 'factory_pipe', count: 4, r: 2 })
    common.push({ kind: 'barrel', count: 4, r: 1 })
  }
  placeProps(ctx, { list: common })

  // 管道/走道上的金属件
  placeProps(ctx, {
    list: [
      { kind: 'crate', count: rng.int(1, 3), r: 1, where: 'platform' },
      { kind: 'barrel', count: rng.int(0, 2), r: 1, where: 'platform' },
      { kind: 'factory_pipe', count: rng.int(0, 2), r: 1, where: 'platform' },
    ],
  })

  // 控制舱内：终端 + 工作台（放在舱板上，地板行就是舱板行）
  if (deck) {
    const mid = deck.cx
    if (isFree(ctx, mid, deck.floorRow, 2)) {
      addProp(ctx, 'terminal', mid, deck.floorRow, { z: 1, r: 2 })
    }
    const benchX = clamp(mid + 3, deck.x0, deck.x1)
    if (isFree(ctx, benchX, deck.floorRow, 1)) {
      addProp(ctx, 'workbench', benchX, deck.floorRow, { r: 1 })
    }
  }

  // 水洼上的毒水道具
  for (const p of ctx.pools) {
    const cx = Math.round((p.x0 + p.x1) / 2)
    const row = surfaceRow(ctx, cx)
    if (row < 0 || !isFree(ctx, cx, row, 1)) continue
    addProp(ctx, 'puddle_toxic', cx, row, { z: 1 })
  }

  // --- 蒸汽口 / 热浪 ---
  if (furnace) {
    // 熔炉坑：上升热浪（多层烟源叠出柱状）
    for (let i = 0; i < 3; i++) {
      addSmoke(ctx, furnace.cx + (i - 1), 96, 0.55, { row: furnace.bottom - 2 - i * 2, lift: 10 + i * 26 })
    }
  }
  scatterSmoke(ctx, ctx.doorInset + 5, w - ctx.doorInset - 6, variant === 'shelter' ? 1 : rng.int(3, 5), {
    radius: 54,
    intensity: 0.38,
  })
  if (pipes.length) {
    // 管道接口处的蒸汽
    for (const p of pipes.slice(0, 2)) {
      addSmoke(ctx, p.x0, 46, 0.3, { row: p.row - 1, lift: 6 })
    }
  }

  return buildRoom(ctx)
}

export default generateFactoryRoom
