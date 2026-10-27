// 坍塌医院（hospital）—— 多层病房、楼梯井、手术室、药房、中庭
//
// 变体（spec.variant，缺省取 spec.kind）：
//   ward       病房走廊：两层塌楼板 + 病床排 + 帘轨
//   shelter    值班室/护士站：整平地面 + 营地
//   stairwell  楼梯井：贯通上下的竖井 + 各层平台
//   surgery    手术室：架空手术舱（实心顶盖 + 无影灯位）+ 器械
//   pharmacy   药房：货架阵（平台带）+ 药箱
//   morgue     太平间：抽屉墙（密集小平台）+ 冷柜
//   atrium     中庭（arena）：环形挑台 + 常春藤 + 坍塌吊顶
//   gate       门厅：大厅 + 破门 + 救护车残骸
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
import { enforceRoomQuality, addCollapsePile, addVentDuct } from './features.js'

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

/** 一整层楼板：断成几段，中间塌掉（病房/走廊的第二层） */
function addFloorLevel(ctx, row, opts = {}) {
  const { rng, w } = ctx
  if (row <= ctx.ceilY[Math.floor(w / 2)] + 2) return []
  const x0 = ctx.doorInset + 3
  const x1 = w - ctx.doorInset - 4
  const gap = rng.int(5, 10)
  const gapX = rng.int(x0 + 8, Math.max(x0 + 9, x1 - gap - 8))
  const out = []
  out.push(...addPlatformBand(ctx, x0, gapX - 1, row))
  out.push(...addPlatformBand(ctx, gapX + gap, x1, row))
  // 断口处的钢筋（可拆）
  for (let x = gapX; x < gapX + gap; x += 2) {
    if (ctx.map.get(x, row) === T.EMPTY) ctx.map.set(x, row, T.CRACKED)
  }
  if (out.length && opts.rails) {
    for (const s of out) {
      if (s.len < 6) continue
      const dx = rng.int(s.x0 + 1, s.x1 - 1)
      const r = surfaceRow(ctx, dx)
      if (r < 0 || !isFree(ctx, dx, r, 1)) continue
      addProp(ctx, 'fence', dx, r, { z: -1 })
    }
  }
  return out
}

/** 架空舱室（手术室/护士站）：地板 + 顶盖 + 后壁，全部离地 4 行以上 */
function addCabin(ctx, cx, opts = {}) {
  const { map, w } = ctx
  const g = avgFloor(ctx)
  const floorRow = opts.floorRow ?? g - 5
  const half = opts.half ?? 8
  const x0 = clamp(cx - half, ctx.doorInset + 3, w - ctx.doorInset - 4)
  const x1 = clamp(cx + half, x0 + 8, w - ctx.doorInset - 4)
  if (floorRow <= ctx.ceilY[cx] + 5) return null
  const deck = addPlatformBand(ctx, x0, x1, floorRow)
  // 顶盖
  for (let x = x0; x <= x1; x++) {
    for (let y = floorRow - 4; y <= floorRow - 3; y++) {
      if (map.get(x, y) === T.EMPTY) map.set(x, y, T.SOLID)
    }
  }
  // 两侧墙（不落地）
  for (let y = floorRow - 2; y <= floorRow - 1; y++) {
    if (map.get(x0, y) === T.EMPTY) map.set(x0, y, T.SOLID)
    if (map.get(x1, y) === T.EMPTY) map.set(x1, y, T.SOLID)
  }
  // 上去的楼梯
  const gr = surfaceRow(ctx, x0 - 2) >= 0 ? surfaceRow(ctx, x0 - 2) : g
  addPlatformStairs(ctx, x0 - 2, -1, Math.max(gr - 2, floorRow + 1), floorRow, { stepH: 2, stepW: 2 })
  return { x0, x1, floorRow, deck }
}

/** 太平间抽屉墙：一面密集的小平台（三层小格） */
function addDrawerWall(ctx, cx, rows = 3) {
  const out = []
  for (let i = 0; i < rows; i++) {
    const row = avgFloor(ctx) - 4 - i * 3
    if (row <= ctx.ceilY[cx] + 2) break
    for (let k = 0; k < 3; k++) {
      const p = addPlatform(ctx, cx - 4 + k * 3, row, 2)
      if (p) out.push(p)
    }
  }
  return out
}

export function generateHospitalRoom(spec) {
  const ctx = createRoomCtx(spec, 'hospital')
  const { rng, w, h } = ctx
  const variant = ctx.variant

  // ===================================================================
  // A. 地形：医院楼层多，走廊高
  // ===================================================================
  buildTerrain(ctx, {
    base: h - 12,
    amp: variant === 'shelter' ? 1.4 : 2.6,
    scale: 15,
    plateau: variant === 'shelter' ? 0.9 : 0.5,
    corridor: variant === 'atrium' || variant === 'stairwell' ? 26 : 21,
    corridorVar: 6,
    minCorridor: 15,
    maxCorridor: 34,
    lo: h - 19,
    hi: h - 6,
    upStep: 2,
    downStep: 2,
  })

  // --- 病房：两层病床区整平 ---
  if (variant === 'ward') {
    const cx = Math.round(w * 0.45)
    const row = Math.max(...Array.from(ctx.floorY.slice(cx - 14, cx + 14)))
    flattenSpan(ctx, cx - 14, cx + 14, row)
  }
  // --- 中庭：中央下凹（塌陷的大厅地板） ---
  if (variant === 'atrium') {
    digBasin(ctx, Math.round(w * 0.5), Math.round(w * 0.16), 2, { water: true, lip: 1 })
  }
  // --- 药房/太平间：整平 ---
  if (variant === 'pharmacy' || variant === 'morgue') {
    const cx = Math.round(w * 0.55)
    const row = Math.max(...Array.from(ctx.floorY.slice(cx - 16, cx + 16)))
    flattenSpan(ctx, cx - 16, cx + 16, row)
  }
  // --- 楼梯井井口整平 ---
  const stairCx = clamp(
    rng.int(Math.floor(w * 0.3), Math.floor(w * 0.7)),
    ctx.doorInset + 9,
    w - ctx.doorInset - 10,
  )
  {
    const rim = Math.max(...Array.from(ctx.floorY.slice(stairCx - 3, stairCx + 4)))
    flattenSpan(ctx, stairCx - 3, stairCx + 3, rim)
  }

  // --- 隐藏壁龛：病床下 / 药架后 ---
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
  const stairwell = carveShaft(ctx, stairCx, 3, rng.int(10, 15), { water: 2, pole: true, ledges: 3 })

  // --- 多层楼板 ---
  const levelRows = [g - 8, g - 16, g - 24].filter((r) => r > ctx.ceilY[Math.floor(w / 2)] + 3)
  const levels = []
  for (const row of levelRows) {
    for (const p of addFloorLevel(ctx, row, { rails: true })) levels.push(p)
  }

  // --- 病房：两排病床 + 帘轨 ---
  if (variant === 'ward') {
    for (let i = 0; i < rng.int(3, 6); i++) {
      const x = rng.int(ctx.doorInset + 6, w - ctx.doorInset - 8)
      const row = surfaceRow(ctx, x)
      if (row < 0 || !isFree(ctx, x, row, 2)) continue
      addProp(ctx, rng.chance(0.5) ? 'hospital_bed' : 'gurney', x, row, { r: 2 })
      if (rng.chance(0.4)) addProp(ctx, 'stretcher', clamp(x + 2, 2, w - 3), row, { r: 1 })
    }
  }
  // --- 手术室 / 护士站：架空舱 ---
  if (variant === 'surgery' || variant === 'shelter') {
    const cx = Math.round(w * (rng.chance(0.5) ? 0.36 : 0.62))
    const cabin = addCabin(ctx, cx, { half: 7, floorRow: g - 6 })
    if (cabin) {
      for (const dx of [-3, 0, 3]) {
        if (isFree(ctx, cabin.x0 + 4 + dx, cabin.floorRow, 1)) {
          addProp(ctx, rng.chance(0.5) ? 'stretcher' : 'workbench', cabin.x0 + 4 + dx, cabin.floorRow, { r: 1 })
        }
      }
      if (isFree(ctx, cabin.x1 - 2, cabin.floorRow, 1)) addProp(ctx, 'terminal', cabin.x1 - 2, cabin.floorRow, { r: 1 })
      addSmoke(ctx, cx, 54, 0.22, { row: cabin.floorRow, lift: 10 })
    }
  }
  // --- 药房：货架阵 ---
  if (variant === 'pharmacy') {
    for (let i = 0; i < rng.int(4, 7); i++) {
      const x = ctx.doorInset + 8 + i * 6
      if (x > w - ctx.doorInset - 10) break
      const row = g - rng.int(3, 5)
      addPlatform(ctx, x, row, 4)
      const gr = surfaceRow(ctx, x)
      if (gr >= 0 && isFree(ctx, x, gr, 1)) addProp(ctx, 'crate', x, gr, { r: 1 })
    }
  }
  // --- 太平间：抽屉墙 ---
  if (variant === 'morgue') {
    addDrawerWall(ctx, Math.round(w * 0.5), 3)
    addDrawerWall(ctx, Math.round(w * 0.72), 2)
  }
  // --- 中庭：环形挑台 ---
  if (variant === 'atrium') {
    for (let i = 0; i < 3; i++) {
      const row = g - 7 - i * 6
      if (row <= ctx.ceilY[Math.floor(w / 2)] + 3) break
      addPlatformBand(ctx, ctx.doorInset + 5, Math.round(w * 0.42), row)
      addPlatformBand(ctx, Math.round(w * 0.58), w - ctx.doorInset - 6, row)
    }
  }
  // 通用吊台 + 走廊天桥
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
    bridge: variant === 'atrium' || variant === 'stairwell',
    ducts: true,
    piles: variant !== 'shelter',
    toxic: 0.35,
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
    platformRatio: 0.38,
    shaftRatio: stairwell ? 0.14 : 0.06,
    hiddenRatio: 0.28,
    buriedRatio: 0.14,
  })

  const common = [
    { kind: 'stretcher', count: rng.int(2, 5), r: 1 },
    { kind: 'gurney', count: rng.int(1, 4), r: 2 },
    { kind: 'hospital_bed', count: rng.int(2, 5), r: 2 },
    { kind: 'junk_heap', count: rng.int(2, 5), r: 1 },
    { kind: 'ivy', count: rng.int(3, 8), r: 1 },
    { kind: 'moss_rock', count: rng.int(1, 3), r: 1 },
    { kind: 'crate', count: rng.int(1, 3), r: 1 },
    { kind: 'skeleton_human', count: rng.int(1, 3), r: 1 },
    { kind: 'corpse', count: rng.int(0, 2), r: 1 },
    { kind: 'vent', count: rng.int(1, 3), r: 1 },
    { kind: 'duct', count: rng.int(0, 2), r: 2 },
    { kind: 'puddle_toxic', count: rng.int(1, 3), r: 1 },
    { kind: 'house_facade', count: rng.int(0, 2), r: 2, z: -2 },
  ]
  if (variant === 'morgue') common.push({ kind: 'grave', count: rng.int(1, 2), r: 1 })
  if (variant === 'gate') common.push({ kind: 'bus_wreck', count: 1, r: 3 })
  placeProps(ctx, { list: common })
  placeProps(ctx, {
    list: [
      { kind: 'crate', count: rng.int(1, 3), r: 1, where: 'platform' },
      { kind: 'stretcher', count: rng.int(1, 3), r: 1, where: 'platform' },
      { kind: 'ivy', count: rng.int(1, 3), r: 1, where: 'platform' },
    ],
  })

  for (const p of ctx.pools) {
    const cx = Math.round((p.x0 + p.x1) / 2)
    const row = surfaceRow(ctx, cx)
    if (row < 0 || !isFree(ctx, cx, row, 1)) continue
    addProp(ctx, 'puddle_toxic', cx, row, { z: 1 })
  }

  scatterSmoke(ctx, ctx.doorInset + 5, w - ctx.doorInset - 6, variant === 'shelter' ? 1 : rng.int(2, 5), {
    radius: 58,
    intensity: 0.3,
  })

  return buildRoom(ctx)
}

export default generateHospitalRoom
