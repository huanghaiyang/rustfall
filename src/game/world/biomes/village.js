// 枯穗村（village）—— 起伏农田、谷仓横梁、枯井、倾斜木屋
//
// 变体（spec.variant，缺省取 spec.kind）：
//   field    农田：缓坡田垄 + 灌溉沟 + 篱笆/杂草/枯树 + 远处民房断面
//   shelter  避难所：灶屋营地（火盆 + 摇篮 + 工作台），少怪
//   house    斜屋（arena）：两层木构地板 + 塌掉一半的楼梯 + 家具
//   well     枯井：竖直井（井底死水）+ 中继站 relay_b
//   barn     谷仓（arena）：大空间 + 三道横梁 + 发电机地标
//   gate     村口：田埂尽头，篱笆与土坟
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
 * 田垄：每隔若干列铺一小段单向平台，模拟垄沟/矮墙，
 * 玩家可以踩着走到田的另一头（也在下面捡东西）。
 */
function addFieldRows(ctx, count) {
  const { rng, w } = ctx
  const out = []
  const g = avgFloor(ctx)
  for (let i = 0; i < count; i++) {
    const x = rng.int(ctx.doorInset + 4, w - ctx.doorInset - 10)
    const len = rng.int(3, 6)
    const row = ctx.floorY[clamp(x, 1, w - 2)] - rng.int(2, 3)
    if (row <= ctx.ceilY[x] + 2) continue
    const p = addPlatform(ctx, x, row, len)
    if (p) out.push(p)
  }
  // 田埂（地面上 1 行的矮垄）用单向平台做，避免阻断主路
  for (let i = 0; i < Math.round(count * 1.4); i++) {
    const x = rng.int(ctx.doorInset + 3, w - ctx.doorInset - 8)
    const row = surfaceRow(ctx, x)
    if (row < 3) continue
    if (row - 2 <= ctx.ceilY[x]) continue
    addPlatform(ctx, x, row - 2, rng.int(2, 4))
  }
  return out
}

/**
 * 倾斜木屋：两层楼板 + 每层错开倾斜的效果（每块板比前一块低 1 行），
 * 再加一个塌掉的楼梯坡度。
 */
function addTiltedHouse(ctx) {
  const { rng, w } = ctx
  const cx = Math.round(w * (rng.chance(0.5) ? 0.35 : 0.62))
  const half = rng.int(8, 12)
  const x0 = clamp(cx - half, ctx.doorInset + 4, w - ctx.doorInset - 6)
  const x1 = clamp(cx + half, x0 + 6, w - ctx.doorInset - 5)
  const g = avgFloor(ctx)
  const floors = []
  const tiers = [
    { row: g - 6, tilt: 1 },
    { row: g - 12, tilt: -1 },
  ]
  for (const t of tiers) {
    if (t.row <= ctx.ceilY[cx] + 2) continue
    let x = x0
    while (x <= x1) {
      const len = rng.int(3, 6)
      const row = t.row + Math.round(((x - x0) / Math.max(1, x1 - x0) - 0.5) * 2 * t.tilt)
      const p = addPlatform(ctx, x, row, len)
      if (p) floors.push(p)
      x += len + rng.int(1, 3)
    }
  }
  // 塌掉的楼梯：从地面爬到一层
  const sx = x0 + rng.int(1, 3)
  const groundRow = surfaceRow(ctx, sx) >= 0 ? surfaceRow(ctx, sx) : ctx.floorY[sx]
  addPlatformStairs(ctx, sx, -1, groundRow - 2, g - 6, { stepH: 3, stepW: 3 })
  return { x0, x1, cx, floors }
}

/** 谷仓横梁：三道横梁（其中一道断掉），带支撑柱 */
function addBarnBeams(ctx) {
  const { rng, w } = ctx
  const x0 = ctx.doorInset + 4
  const x1 = w - ctx.doorInset - 5
  const g = avgFloor(ctx)
  const beams = []
  const rows = [g - 8, g - 13]
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row <= ctx.ceilY[Math.floor(w / 2)] + 2) continue
    const gapX = rng.int(x0 + 10, Math.max(x0 + 11, x1 - 10))
    const gw = rng.int(3, 5)
    beams.push(...addPlatformBand(ctx, x0, gapX - 1, row))
    beams.push(...addPlatformBand(ctx, gapX + gw, x1, row))
    // 支撑柱（可攀爬）
    for (const bx of [x0 + 2, x1 - 2]) {
      const gr = surfaceRow(ctx, clamp(bx, 2, w - 3))
      if (gr > row + 1) addPole(ctx, clamp(bx, 2, w - 3), row + 1, gr - 1)
    }
  }
  // 谷仓中间的干草台（低矮平台，堆物资）
  addPlatform(ctx, Math.round((x0 + x1) / 2) - 3, g - 4, 6)
  return beams
}

/** 田埂篱笆：沿地面摆一排篱笆（用 props 表达，不挡路） */
function addFenceLine(ctx, count) {
  const { rng, w } = ctx
  for (let i = 0; i < count; i++) {
    const x = rng.int(ctx.doorInset + 4, w - ctx.doorInset - 5)
    const row = surfaceRow(ctx, x)
    if (row < 0) continue
    if (!isFree(ctx, x, row, 1)) continue
    addProp(ctx, 'fence', x, row, { z: -1 })
  }
}

export function generateVillageRoom(spec) {
  const ctx = createRoomCtx(spec, 'village')
  const { rng, w, h } = ctx
  const variant = ctx.variant

  // ===================================================================
  // A. 地形：起伏农田（每列 ±1，缓坡；走廊不太高，但谷仓/斜屋需要纵向空间）
  // ===================================================================
  buildTerrain(ctx, {
    base: h - 12,
    amp: variant === 'field' || variant === 'gate' ? 3.6 : 2.6,
    scale: 15,
    plateau: variant === 'shelter' ? 0.9 : variant === 'barn' ? 0.75 : 0.35,
    corridor: variant === 'barn' ? 26 : variant === 'house' ? 25 : 21,
    corridorVar: 6,
    minCorridor: 15,
    maxCorridor: 32,
    lo: h - 20,
    hi: h - 5,
    upStep: 1,
    downStep: 1, // 农田缓坡：一次只差 1 行
  })

  // --- 灌溉沟（浅水，可涉水） ---
  if (variant === 'field' || variant === 'gate') {
    const ditches = rng.int(1, 2)
    for (let i = 0; i < ditches; i++) {
      const cx = rng.int(12, w - 14)
      digBasin(ctx, cx, rng.int(3, 5), 2, { water: true, lip: 1 })
    }
  }

  // --- 枯井位置：先整平井口（竖井在 C 阶段挖） ---
  let wellCx = -1
  if (variant === 'well') {
    wellCx = rng.int(Math.floor(w * 0.42), Math.floor(w * 0.62))
    const rim = Math.max(...Array.from(ctx.floorY.slice(wellCx - 2, wellCx + 3)))
    flattenSpan(ctx, wellCx - 2, wellCx + 2, rim)
  }

  // --- 谷仓/斜屋/避难所：整平地基 ---
  let house = null
  if (variant === 'house') {
    const cx = Math.round(w * (rng.chance(0.5) ? 0.35 : 0.62))
    const half = 12
    const row = ctx.floorY[clamp(cx, 1, w - 2)]
    flattenSpan(ctx, cx - half, cx + half, row)
    house = { cx }
  }
  if (variant === 'barn') {
    const cx = Math.round(w / 2)
    const row = Math.max(...Array.from(ctx.floorY.slice(Math.floor(w * 0.3), Math.floor(w * 0.7))))
    flattenSpan(ctx, Math.floor(w * 0.3), Math.floor(w * 0.7), row)
    house = { cx }
  }

  // --- 藏匿壁龛：谷仓/斜屋的角落 ---
  if (variant === 'house' || variant === 'barn') {
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
  // C. 平台 / 井 / 梁
  // ===================================================================
  let well = null
  if (variant === 'well') {
    well = carveShaft(ctx, wellCx, 1, rng.int(8, 11), { water: 3, pole: true })
  }

  const g = avgFloor(ctx)
  if (variant === 'field' || variant === 'gate') addFieldRows(ctx, rng.int(3, 6))
  if (variant === 'house') house = { ...house, ...addTiltedHouse(ctx) }
  if (variant === 'barn') house = { ...house, beams: addBarnBeams(ctx) }
  if (variant === 'shelter') finishShelter(ctx, { roofHeight: 6 })

  // 通用：几块零散的草垛/棚顶平台（垂直空间）
  for (let i = 0; i < rng.int(2, 4); i++) {
    const x = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 9)
    const row = ctx.floorY[clamp(x, 1, w - 2)] - rng.int(4, 8)
    if (row <= ctx.ceilY[x] + 2) continue
    addPlatform(ctx, x, row, rng.int(2, 5))
  }
  // 一根上二层的杆（斜屋 / 谷仓用得到）
  if (variant === 'house' || variant === 'barn') {
    const px = clamp(Math.round(w * 0.3), ctx.doorInset + 5, w - ctx.doorInset - 6)
    const gr = surfaceRow(ctx, px)
    if (gr > g - 7) addPole(ctx, px, g - 6, gr - 1)
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
          : variant === 'barn' || variant === 'field'
            ? 4
            : 3,
  })

  placeLoot(ctx, {
    platformRatio: variant === 'barn' || variant === 'house' ? 0.34 : 0.22,
    shaftRatio: well ? 0.2 : 0.06,
    hiddenRatio: 0.2,
    buriedRatio: 0.2,
  })

  // --- 田地件 ---
  const common = [
    { kind: 'weed', count: rng.int(6, 12), r: 1 },
    { kind: 'tree_dead', count: rng.int(2, 4), r: 2 },
    { kind: 'fence', count: rng.int(3, 6), r: 1 },
    { kind: 'junk_heap', count: rng.int(1, 3), r: 1 },
    { kind: 'crate', count: rng.int(1, 2), r: 1 },
    { kind: 'barrel', count: rng.int(0, 2), r: 1 },
    { kind: 'skeleton_animal', count: rng.int(0, 2), r: 1 },
    { kind: 'puddle_toxic', count: rng.int(1, 3), r: 1 },
    { kind: 'grave', count: rng.int(0, 2), r: 1 },
  ]
  if (variant !== 'shelter') {
    common.push({ kind: 'house_facade', count: rng.int(1, 2), r: 2, z: -2 })
  }
  if (variant === 'house') {
    common.push({ kind: 'sofa', count: rng.int(1, 2), r: 1 })
    common.push({ kind: 'wardrobe', count: rng.int(1, 2), r: 1 })
    common.push({ kind: 'tv', count: rng.int(0, 1), r: 1 })
    common.push({ kind: 'cradle', count: 1, r: 1 })
    common.push({ kind: 'ribcage', count: rng.int(0, 1), r: 1 })
  }
  if (variant === 'barn') {
    common.push({ kind: 'workbench', count: rng.int(1, 2), r: 1 })
    common.push({ kind: 'tire_pile', count: rng.int(1, 3), r: 1 })
    common.push({ kind: 'crate', count: rng.int(2, 4), r: 1 })
    common.push({ kind: 'junk_heap', count: rng.int(2, 3), r: 1 })
  }
  if (variant === 'gate') {
    common.push({ kind: 'fence', count: rng.int(5, 8), r: 1 })
    common.push({ kind: 'grave', count: rng.int(2, 3), r: 1 })
  }
  placeProps(ctx, { list: common })
  addFenceLine(ctx, variant === 'field' || variant === 'gate' ? rng.int(3, 6) : rng.int(1, 3))

  // 田地里的稻草人感：用 fence + 枯树凑
  if (variant === 'field') {
    placeProps(ctx, { list: [{ kind: 'crate', count: 2, r: 1, where: 'platform' }] })
  }
  // 高台/横梁上的杂物
  if (variant === 'barn' || variant === 'house') {
    placeProps(ctx, {
      list: [
        { kind: 'crate', count: rng.int(1, 3), r: 1, where: 'platform' },
        { kind: 'junk_heap', count: rng.int(1, 2), r: 1, where: 'platform' },
      ],
    })
  }

  // 井口的枯水道具 + 井底烟（死水沼气）
  for (const p of ctx.pools) {
    const cx = Math.round((p.x0 + p.x1) / 2)
    const row = surfaceRow(ctx, cx)
    if (row < 0 || !isFree(ctx, cx, row, 1)) continue
    addProp(ctx, 'puddle_toxic', cx, row, { z: 1 })
  }
  if (well) {
    addSmoke(ctx, well.cx, 48, 0.28, { row: well.bottom - 1, lift: 8 })
  }

  // --- 烟：农家炊烟 / 灰 ---
  scatterSmoke(ctx, ctx.doorInset + 5, w - ctx.doorInset - 6, variant === 'shelter' ? 1 : rng.int(1, 3), {
    radius: 50,
    intensity: 0.26,
  })

  return buildRoom(ctx)
}

export default generateVillageRoom
