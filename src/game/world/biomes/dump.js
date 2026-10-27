// 倾倒深坑（dump）—— 垃圾山、吊车轨道、堆叠集装箱、焚烧坑
//
// 变体（spec.variant，缺省取 spec.kind）：
//   pit       焚烧坑：坑底毒水 + 浓烟 + 发电机地标 + K-9 营救笼
//   shelter   守夜棚：整平地面 + 营地 + 废料堆（少怪）
//   mountain  垃圾山（arena）：阶梯状土坡 + 山腰高台
//   crane     吊车轨道：高处窄轨 + 吊挂集装箱 + 稀有物资
//   core      深核（arena）：向下的多层坑 + 天线地标 + 深处稀有物资
//   gate      界桩：垃圾场边界，废料堆与烟
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
 * 阶梯状土坡（垃圾山）：把房间切成若干段平台，每段整平、相邻段高差 ≤2，
 * 形成能走上去的阶梯地形（A 阶段，改 floorY）。
 */
function addTerraces(ctx, steps, widthPct = [1 / 6, 5 / 6]) {
  const { w } = ctx
  const a = Math.round(w * widthPct[0])
  const b = Math.round(w * widthPct[1])
  const span = b - a
  const seg = Math.max(4, Math.floor(span / steps))
  const g = avgFloor(ctx)
  const rows = []
  for (let i = 0; i < steps; i++) {
    const x0 = a + i * seg
    const x1 = Math.min(b, x0 + seg - 1)
    // 山峰在中间：先是上坡再下坡
    const t = steps === 1 ? 0 : Math.abs(i - (steps - 1) / 2) / ((steps - 1) / 2)
    const row = clamp(g - Math.round((1 - t) * 2 * (steps - 1) * 0.5), 5, ctx.h - 4)
    rows.push({ x0, x1, row })
    flattenSpan(ctx, x0, x1, row)
  }
  // 相邻段之间再顺一次（每段只许差 2）
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const cur = rows[i]
    const d = cur.row - prev.row
    if (Math.abs(d) > WALK_STEP) {
      const fixed = prev.row + clamp(d, -WALK_STEP, WALK_STEP)
      flattenSpan(ctx, cur.x0, cur.x1, fixed)
      cur.row = fixed
    }
  }
  return rows
}

/**
 * 堆叠集装箱：一组可跳的箱子（单向平台，逐层 2 行高）。
 * 不给实心块，避免挡住主路。
 */
function addContainerStack(ctx, cx, opts = {}) {
  const { rng, w } = ctx
  const g = surfaceRow(ctx, clamp(cx, 2, w - 3))
  if (g < 0) return []
  const levels = opts.levels ?? rng.int(2, 3)
  const out = []
  for (let i = 0; i < levels; i++) {
    const half = rng.int(1, 2)
    const dx = rng.int(-1, 1)
    const row = g - 2 * (i + 1)
    if (row <= ctx.ceilY[clamp(cx, 2, w - 3)] + 1) break
    const p = addPlatform(ctx, clamp(cx + dx - half, 2, w - 3), row, half * 2 + 1)
    if (p) out.push(p)
  }
  return out
}

/** 吊车轨道：高处一条窄轨 + 吊挂集装箱 + 一根爬上去的杆 */
function addCraneTrack(ctx, opts = {}) {
  const { rng, w } = ctx
  const g = avgFloor(ctx)
  const row = clamp(g - (opts.height ?? 13), ctx.ceilY[Math.floor(w / 2)] + 2, g - 10)
  const x0 = ctx.doorInset + 4
  const x1 = w - ctx.doorInset - 5
  const segs = addPlatformBand(ctx, x0, x1, row)
  // 吊挂：从轨道往下隔一段吊一个箱子平台
  const drops = []
  for (let x = x0 + 4; x <= x1 - 4; x += rng.int(5, 8)) {
    const dh = rng.int(2, 4)
    const p = addPlatform(ctx, x, row + dh, 2)
    if (p) drops.push(p)
  }
  // 爬上去的杆
  const px = clamp(x0 + rng.int(1, 3), 2, w - 3)
  const gr = surfaceRow(ctx, px)
  if (gr > row + 2) addPole(ctx, px, row + 1, gr - 1)
  return { row, segs, drops }
}

/** 垃圾山腰的高台（山体两侧错开的平台） */
function addMountainShelves(ctx) {
  const { rng, w } = ctx
  const shelves = []
  for (let i = 0; i < rng.int(3, 5); i++) {
    const x = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 9)
    const row = ctx.floorY[clamp(x, 1, w - 2)] - rng.int(3, 7)
    if (row <= ctx.ceilY[x] + 2) continue
    const p = addPlatform(ctx, x, row, rng.int(3, 6))
    if (p) shelves.push(p)
  }
  return shelves
}

export function generateDumpRoom(spec) {
  const ctx = createRoomCtx(spec, 'dump')
  const { rng, w, h } = ctx
  const variant = ctx.variant

  // ===================================================================
  // A. 地形：垃圾场地面不平，但每一步都 ≤2（阶梯土坡）
  // ===================================================================
  buildTerrain(ctx, {
    base: h - 12,
    amp: variant === 'shelter' ? 1.8 : 3.6,
    scale: 14,
    plateau: variant === 'shelter' ? 0.88 : 0.3,
    corridor: variant === 'core' ? 28 : 23,
    corridorVar: 7,
    minCorridor: 16,
    maxCorridor: 33,
    lo: h - 20,
    hi: h - 5,
    upStep: 2,
    downStep: 2,
  })

  // --- 垃圾山阶梯（山体变体最明显） ---
  if (variant === 'mountain') {
    addTerraces(ctx, rng.int(4, 6))
  } else if (variant === 'crane' || variant === 'core') {
    addTerraces(ctx, rng.int(2, 3))
  }

  // --- 污水洼（浅，可涉水） ---
  if (variant !== 'shelter') {
    const n = rng.int(1, 3)
    for (let i = 0; i < n; i++) {
      const cx = rng.int(12, w - 14)
      digBasin(ctx, cx, rng.int(2, 4), rng.int(1, 2), { water: true, lip: 1 })
    }
  }

  // --- 焚烧坑 / 深核：先整平坑口（竖井在 C 阶段挖） ---
  let pitCx = -1
  if (variant === 'pit') {
    pitCx = Math.round(w * (rng.chance(0.5) ? 0.42 : 0.58))
    const rim = Math.max(...Array.from(ctx.floorY.slice(pitCx - 3, pitCx + 4)))
    flattenSpan(ctx, pitCx - 3, pitCx + 3, rim)
  }
  let coreCx = -1
  if (variant === 'core') {
    coreCx = Math.round(w * 0.5)
    const rim = Math.max(...Array.from(ctx.floorY.slice(coreCx - 4, coreCx + 5)))
    flattenSpan(ctx, coreCx - 4, coreCx + 4, rim)
  }

  // --- 藏匿壁龛：垃圾堆后面的洞 ---
  for (let i = 0; i < (variant === 'shelter' ? 1 : 2); i++) {
    const cx = rng.int(ctx.doorInset + 7, w - ctx.doorInset - 9)
    if (!flatSpanExact(ctx, cx - 3, cx + 3)) continue
    carveAlcove(ctx, cx, rng.int(1, 2), 2, { hide: true })
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
  // C. 结构：坑 / 集装箱 / 吊车轨道 / 山腰平台
  // ===================================================================
  const g = avgFloor(ctx)

  let pit = null
  if (variant === 'pit') {
    pit = carveShaft(ctx, pitCx, 3, rng.int(8, 11), { water: 4, pole: true, ledges: 2 })
  }
  let core = null
  if (variant === 'core') {
    core = carveShaft(ctx, coreCx, 4, rng.int(12, 15), { water: 3, pole: true, ledges: 4 })
    // 深核里的第二层平台（稀有物资）
    if (core) {
      for (let i = 0; i < 3; i++) {
        const row = core.bottom - 4 - i * 4
        if (row <= core.rim + 2) break
        addPlatform(ctx, i % 2 === 0 ? core.x0 : core.x1 - 1, row, 2)
      }
    }
  }

  // --- 堆叠集装箱 ---
  const containers = []
  if (variant !== 'shelter') {
    const groups = variant === 'mountain' ? rng.int(3, 5) : rng.int(2, 4)
    for (let i = 0; i < groups; i++) {
      const cx = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 7)
      containers.push(...addContainerStack(ctx, cx))
    }
  }

  // --- 吊车轨道 ---
  let crane = null
  if (variant === 'crane' || variant === 'gate') {
    crane = addCraneTrack(ctx, { height: rng.int(11, 14) })
  }

  // --- 山腰平台 ---
  if (variant === 'mountain' || variant === 'core') addMountainShelves(ctx)

  if (variant === 'shelter') finishShelter(ctx, { roofHeight: 6 })

  // 通用吊台
  for (let i = 0; i < rng.int(2, 4); i++) {
    const x = rng.int(ctx.doorInset + 5, w - ctx.doorInset - 9)
    const row = g - rng.int(5, 11)
    if (row <= ctx.ceilY[x] + 2) continue
    addPlatform(ctx, x, row, rng.int(2, 5))
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
          : variant === 'core' || variant === 'mountain'
            ? 5
            : 4,
  })

  placeLoot(ctx, {
    base: Math.max(6, Math.round((w / 7) * (spec.lootDensity ?? 1))),
    platformRatio: 0.3,
    shaftRatio: pit || core ? 0.24 : 0.06,
    hiddenRatio: 0.26,
    buriedRatio: 0.22,
  })

  const common = [
    { kind: 'junk_heap', count: rng.int(5, 9), r: 1 },
    { kind: 'tire_pile', count: rng.int(1, 3), r: 1 },
    { kind: 'barrel', count: rng.int(1, 3), r: 1 },
    { kind: 'crate', count: rng.int(1, 4), r: 1 },
    { kind: 'car_wreck', count: rng.int(0, 2), r: 2 },
    { kind: 'bus_wreck', count: rng.chance(0.4) ? 1 : 0, r: 3 },
    { kind: 'skeleton_animal', count: rng.int(0, 2), r: 1 },
    { kind: 'skeleton_human', count: rng.int(0, 2), r: 1 },
    { kind: 'corpse', count: rng.int(0, 2), r: 1 },
    { kind: 'skull', count: rng.int(0, 3), r: 1 },
    { kind: 'ribcage', count: rng.int(0, 2), r: 1 },
    { kind: 'puddle_toxic', count: rng.int(2, 4), r: 1 },
    { kind: 'grave', count: rng.int(0, 2), r: 1 },
  ]
  if (variant !== 'shelter') {
    common.push({ kind: 'satellite', count: rng.int(0, 1), r: 2 })
    common.push({ kind: 'antenna', count: rng.int(0, 1), r: 1 })
  }
  if (variant === 'core') {
    common.push({ kind: 'satellite', count: 1, r: 2 })
    common.push({ kind: 'terminal', count: rng.int(1, 2), r: 1 })
  }
  if (variant === 'crane') {
    common.push({ kind: 'generator', count: rng.int(0, 1), r: 2 })
    common.push({ kind: 'factory_pipe', count: rng.int(1, 3), r: 2 })
  }
  if (variant === 'mountain') {
    common.push({ kind: 'tree_dead', count: rng.int(1, 3), r: 2 })
    common.push({ kind: 'weed', count: rng.int(4, 8), r: 1 })
  }
  placeProps(ctx, { list: common })

  // 高层/集装箱上的物资点
  placeProps(ctx, {
    list: [
      { kind: 'crate', count: rng.int(1, 3), r: 1, where: 'platform' },
      { kind: 'junk_heap', count: rng.int(1, 3), r: 1, where: 'platform' },
      { kind: 'barrel', count: rng.int(0, 2), r: 1, where: 'platform' },
    ],
  })
  if (crane) {
    placeProps(ctx, { list: [{ kind: 'satellite', count: 1, r: 2, where: 'platform' }] })
  }

  // 有毒水洼
  for (const p of ctx.pools) {
    const cx = Math.round((p.x0 + p.x1) / 2)
    const row = surfaceRow(ctx, cx)
    if (row < 0 || !isFree(ctx, cx, row, 1)) continue
    addProp(ctx, 'puddle_toxic', cx, row, { z: 1 })
  }

  // --- 烟：焚烧坑浓烟、垃圾堆自燃 ---
  if (pit) {
    for (let i = 0; i < 3; i++) {
      addSmoke(ctx, pit.cx + (i - 1), 110, 0.6, { row: pit.bottom - 2 - i * 2, lift: 12 + i * 30 })
    }
  }
  if (core) {
    addSmoke(ctx, core.cx, 120, 0.5, { row: core.bottom - 2, lift: 14 })
  }
  scatterSmoke(ctx, ctx.doorInset + 5, w - ctx.doorInset - 6, variant === 'shelter' ? 1 : rng.int(3, 6), {
    radius: 66,
    intensity: 0.4,
  })
  // 垃圾堆自燃点
  for (let i = 0; i < rng.int(1, 2); i++) {
    const x = rng.int(ctx.doorInset + 6, w - ctx.doorInset - 7)
    addSmoke(ctx, x, 74, 0.34)
  }

  return buildRoom(ctx)
}

export default generateDumpRoom
