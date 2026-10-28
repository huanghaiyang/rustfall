// 生态房间生成器 —— 分派 + 共享地形/布置工具包
//
// 契约（docs/CONTENT-API.md §7）：generateBiomeRoom(spec) 返回
// { map, w, h, floorY, ceilY, worldW, worldH, doorLeft, doorRight, spawn, shelter,
//   exits, biome, roomId, loot, monsters, props, smokeSources, cages, landmarks, dirtyTiles }
//
// 物理约定（见 world/tilemap.js）：y 轴向下；行 ty 占世界 y ∈ [ty*32, ty*32+32)；
// 地面顶 = floorY * 32；floorY[x] 行是实体地砖，floorY[x]-1 是脚站的那一格。
//
// 生成流水线（四个 biome 都遵守，可保证「一定能从头走到尾」）：
//   A. createRoomCtx + buildTerrain + 改变 floorY 的特征（盆地 / 台地 / 斜坡 / 避难所地基）
//   B. finalizeTerrain：挖门洞 → 连续性兜底（相邻 floorY 差 ≤2）→ 补门洞 → 灌水
//   C. 不改 floorY 的结构：平台 / 杆 / 竖井 / 壁龛 / 避难所屋顶
//   D. 布置：loot / monsters / props / cages / landmarks / smoke
//   E. buildRoom 组装 + pruneUnsupported 兜底
import { Tilemap, T } from '../tilemap.js'
import { TS } from '../../config.js'
import { makeRng, valueNoise1D, clamp } from '../../render/rng.js'
import { generateCityRoom } from './city.js'
import { generateVillageRoom } from './village.js'
import { generateFactoryRoom } from './factory.js'
import { generateDumpRoom } from './dump.js'
import { generateMetroRoom } from './metro.js'
import { generateHospitalRoom } from './hospital.js'
import { generatePortRoom } from './port.js'
import {
  ensureQualityFallback,
  computeComplexity,
  layerBands,
  countChannels as countChannelsOf,
} from './features.js'
import { applyScene } from '../scene-terrain.js'

// 四个 biome 与自检脚本都从本模块取这些基础工具，这里统一再导出
export { clamp }
export { countChannelsOf as countChannels, layerBands }
export { TS }

export const BIOMES = ['city', 'village', 'factory', 'dump', 'metro', 'hospital', 'port']
export const ROOM_KINDS = ['standard', 'shelter', 'arena', 'gate']
/** 主路允许的最大台阶高（格）。玩家跳跃 ≈3.3 格，取 2 留余量。 */
export const WALK_STEP = 2
/** 门洞高度（格） */
export const DOOR_H = 6
/** 门洞区宽度（格，从房间边往里数） */
export const DOOR_INSET = 4

/** 区域视觉 / 氛围参数（渲染层可直接用，不用也能跑） */
export const BIOME_META = {
  city: {
    id: 'city',
    name: '锈城废墟',
    en: 'RUST CITY',
    sky: '#a8834a',
    fog: '#6d5836',
    ground: '#6f5c40',
    accent: '#c8a24a',
    rain: 1,
    smoke: '#5d5340',
    desc: '街道被雨泡烂，楼板一层层塌下来。黄色天空从不放晴。',
  },
  village: {
    id: 'village',
    name: '枯穗村',
    en: 'WITHER VILLAGE',
    sky: '#8d8f6a',
    fog: '#5d6047',
    ground: '#5f5236',
    accent: '#9aa165',
    rain: 0.85,
    smoke: '#4e5140',
    desc: '田垄还在，麦子没了。井也干了，只剩底下一汪死水。',
  },
  factory: {
    id: 'factory',
    name: '熔渣工厂',
    en: 'SLAG WORKS',
    sky: '#7c4a34',
    fog: '#54301f',
    ground: '#5a4a42',
    accent: '#c1703a',
    rain: 0.7,
    smoke: '#463a33',
    desc: '炉子还在烧，没人再加料。蒸汽从每一条裂缝里冒出来。',
  },
  dump: {
    id: 'dump',
    name: '倾倒深坑',
    en: 'THE DUMP',
    sky: '#8a7b4a',
    fog: '#5b4f31',
    ground: '#5c5334',
    accent: '#b99a4e',
    rain: 0.95,
    smoke: '#57503a',
    desc: '整座城的垃圾都倒在这里，堆成山，山底下压着还能用的东西。',
  },
  metro: {
    id: 'metro',
    name: '废弃地铁',
    en: 'DEAD METRO',
    sky: '#4d5a5e',
    fog: '#2f3a3d',
    ground: '#4a4f4c',
    accent: '#7fa8a0',
    rain: 0.12,
    smoke: '#39413f',
    desc: '闸机还在，车没了。隧道一直往下，积水流到看不见的地方。',
  },
  hospital: {
    id: 'hospital',
    name: '坍塌医院',
    en: 'COLLAPSED WARD',
    sky: '#7f8f8a',
    fog: '#4a5956',
    ground: '#586a63',
    accent: '#a9c7b8',
    rain: 0.55,
    smoke: '#454f4b',
    desc: '走廊一格一格塌下来，病床还排在原地。消毒水味早就没了，只剩霉。',
  },
  port: {
    id: 'port',
    name: '淤塞港口',
    en: 'SILTED PORT',
    sky: '#7a7f6a',
    fog: '#4d5240',
    ground: '#545a42',
    accent: '#b3a06a',
    rain: 0.9,
    smoke: '#4b4f3c',
    desc: '水退了，船搁在泥里。吊机还吊着半个集装箱，缆绳绷了二十年。',
  },
}

/** 常规战利品池（按 biome） */
export const ITEM_POOLS = {
  city: [
    'scrap_plate', 'copper_wire', 'lubricant', 'battery_cell', 'cloth', 'cement',
    'rubber', 'board_cpu', 'ram_stick', 'cell_small', 'repair_kit', 'acid_neutralizer',
    'diary_1', 'diary_3', 'photo_1', 'cassette_1', 'jewelry_1', 'sensor_unit', 'huique_toy',
    'umbrella_old', 'wall_clock', 'old_tv', 'fridge', 'kettle',
  ],
  village: [
    'cloth', 'cement', 'rubber', 'dog_food', 'scrap_plate', 'chemical', 'acid_neutralizer',
    'diary_2', 'diary_3', 'photo_2', 'book_1', 'toy_1', 'huique_toy', 'cell_small', 'repair_kit',
    'bearing', 'aluminum_sheet', 'rad_meds',
    'bucket', 'folding_chair', 'lunchbox', 'hard_hat', 'can',
  ],
  factory: [
    'scrap_plate', 'copper_wire', 'servo_motor', 'hydraulic_rod', 'bearing', 'gyro',
    'board_cpu', 'battery_cell', 'cell_large', 'chemical', 'uranium_dust', 'relay_part',
    'photo_3', 'clothes_1', 'acid_neutralizer', 'optical_module', 'signal_recorder',
    'hard_hat', 'pressure_meter', 'valve_handle', 'hand_pump', 'lunchbox',
  ],
  dump: [
    'scrap_plate', 'copper_wire', 'rubber', 'aluminum_sheet', 'cement', 'rare_earth',
    'uranium_dust', 'sensor_unit', 'ram_stick', 'cell_large', 'rad_meds', 'diary_3',
    'toy_1', 'jewelry_1', 'clothes_1', 'military_shell', 'signal_recorder',
    'old_tv', 'microwave', 'washer', 'brick', 'folding_chair',
  ],
  metro: [
    'copper_wire', 'battery_cell', 'scrap_plate', 'ram_stick', 'board_cpu', 'sensor_unit',
    'lubricant', 'cloth', 'cement', 'acid_neutralizer', 'diary_1', 'cassette_1',
    'optical_module', 'relay_part', 'cell_small', 'rubber',
    'radio', 'camera_old', 'wristwatch', 'old_shoe', 'suitcase',
  ],
  hospital: [
    'cloth', 'chemical', 'acid_neutralizer', 'rad_meds', 'repair_kit', 'cell_small',
    'sensor_unit', 'optical_module', 'board_cpu', 'diary_2', 'photo_2', 'book_1',
    'jewelry_1', 'clothes_1', 'dog_food', 'bearing',
    'toothbrush', 'soap_bar', 'wall_clock', 'cloth_sheet', 'metal_dish',
  ],
  port: [
    'aluminum_sheet', 'scrap_plate', 'copper_wire', 'rubber', 'cement', 'hydraulic_rod',
    'servo_motor', 'gyro', 'bearing', 'cell_large', 'rad_meds', 'diary_3', 'photo_3',
    'toy_1', 'signal_recorder', 'military_shell',
    'fishing_rod', 'bucket', 'rope_coil', 'radio', 'signal_flare',
  ],
}

/** 稀有池（深层 / 井底 / 高台） */
export const RARE_POOLS = {
  city: ['relay_part', 'optical_module', 'servo_motor', 'military_shell', 'quantum_chip', 'collect_gba'],
  village: ['reactor_core', 'servo_motor', 'quantum_chip', 'relay_part', 'signal_recorder', 'collect_subor'],
  factory: ['reactor_core', 'military_shell', 'quantum_chip', 'satellite_gyro', 'relay_part', 'collect_ps1'],
  dump: ['reactor_core', 'quantum_chip', 'satellite_gyro', 'military_shell', 'rare_earth', 'collect_ps2'],
  metro: ['relay_part', 'optical_module', 'quantum_chip', 'signal_recorder', 'satellite_gyro', 'collect_psp'],
  hospital: ['reactor_core', 'optical_module', 'sensor_unit', 'quantum_chip', 'relay_part', 'game_cartridge'],
  port: ['military_shell', 'reactor_core', 'satellite_gyro', 'hydraulic_rod', 'quantum_chip', 'collect_psp'],
}

/** 怪物池（按 biome） */
export const MONSTER_POOLS = {
  city: ['radboar', 'crawler', 'scrapper', 'sentry', 'drone', 'bandit_lookout', 'bandit_looter'],
  village: ['radboar', 'crawler', 'wingrat', 'spitter', 'bandit_scav'],
  factory: ['sentry', 'scrapper', 'drone', 'hulkbot', 'spitter', 'bandit_looter'],
  dump: ['crawler', 'wingrat', 'scrapper', 'radboar', 'hulkbot', 'bandit_scav', 'bandit_looter'],
  metro: ['crawler', 'wingrat', 'spitter', 'scrapper', 'drone', 'bandit_lookout', 'bandit_scav'],
  hospital: ['crawler', 'spitter', 'sentry', 'scrapper', 'wingrat', 'bandit_lookout'],
  port: ['radboar', 'scrapper', 'drone', 'hulkbot', 'spitter', 'bandit_looter'],
}

/** 默认怪物数量（spec.monsterCount 可覆盖；shelter 恒为 0） */
export const MONSTER_COUNT = { city: 6, village: 6, factory: 7, dump: 7, metro: 6, hospital: 6, port: 7 }

/** 武器池（掉落用；id 由武器系统注册） */
export const WEAPON_IDS = [
  'laser_pistol', 'laser_rifle', 'semi_pistol', 'iron_pipe', 'dagger', 'hammer',
  'shock_baton', 'nailgun', 'scrap_launcher', 'arc_emitter', 'rail_spike', 'wrench_heavy',
]

/** 大型敌人候选点 id */
export const LARGE_ENEMY_IDS = ['junk_golem', 'sky_warden', 'mimic_beast', 'swarm_core']

/** 生态点类型 */
export const ECOSYSTEM_KINDS = ['roach', 'plant', 'fly', 'rat']

/** biome → 更容易出现的大型敌人 */
export const LARGE_ENEMY_BIAS = {
  city: ['junk_golem', 'mimic_beast'],
  village: ['mimic_beast', 'swarm_core'],
  factory: ['junk_golem', 'sky_warden'],
  dump: ['junk_golem', 'swarm_core'],
  metro: ['mimic_beast', 'swarm_core'],
  hospital: ['mimic_beast', 'sky_warden'],
  port: ['junk_golem', 'sky_warden'],
}

/** 地标 id → 可视化道具 kind + 类别 */
export const LANDMARK_PROPS = {
  relay_a: { prop: 'relay', kind: 'relay' },
  relay_b: { prop: 'relay', kind: 'relay' },
  relay_c: { prop: 'relay', kind: 'relay' },
  relay_d: { prop: 'relay', kind: 'relay' },
  antenna_signal: { prop: 'antenna', kind: 'antenna' },
  beacon_port: { prop: 'antenna', kind: 'antenna' },
  generator_city: { prop: 'generator', kind: 'generator' },
  generator_village: { prop: 'generator', kind: 'generator' },
  generator_factory: { prop: 'generator', kind: 'generator' },
  generator_dump: { prop: 'generator', kind: 'generator' },
  generator_hospital: { prop: 'generator', kind: 'generator' },
}

// =====================================================================
// 小工具
// =====================================================================

/** [a, b] 闭区间整数数组 */
export function range(a, b) {
  const out = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

/** 确定性洗牌（Fisher-Yates，用房间 rng） */
export function shuffle(rng, arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

/** 取 biome 元数据 */
export function getBiomeMeta(id) {
  return BIOME_META[id] || BIOME_META.city
}

// =====================================================================
// A. 上下文 + 基础地形
// =====================================================================

/**
 * 创建房间生成上下文。spec 需要 id / seed / biome / w / h / kind；
 * 其余字段（exits / shelterSide / lootDensity / monsterCount / variant…）可选。
 */
export function createRoomCtx(spec, biome) {
  const seed = (spec.seed | 0) || 1
  const rng = makeRng(seed)
  const w = clamp(Math.round(spec.w || 96), 96, 160)
  const h = clamp(Math.round(spec.h || 48), 44, 68)
  const map = new Tilemap(w, h, T.SOLID)
  const exits = spec.exits || {}
  const ctx = {
    spec,
    biome: biome || spec.biome || 'city',
    seed,
    rng,
    w,
    h,
    map,
    floorY: new Int16Array(w),
    ceilY: new Int16Array(w),
    doorH: DOOR_H,
    doorInset: DOOR_INSET,
    doorRow: { left: h - 12, right: h - 12 },
    baseFloor: h - 11,
    exitLeft: exits.left ?? null,
    exitRight: exits.right ?? null,
    variant: spec.variant || spec.kind || 'standard',
    pools: [],
    platforms: [],
    poles: [],
    shafts: [],
    ducts: [],
    hangings: 0,
    tileDeco: null,
    quality: null,
    platformsByRow: {},
    loot: [],
    monsters: [],
    weapons: [],
    ecosystem: [],
    largeEnemies: [],
    props: [],
    smokeSources: [],
    cages: [],
    landmarks: [],
    shelter: null,
    shelterZone: null,
    taken: [],
    occ: new Uint8Array(w * h),
    reserved: [],
    notes: [],
    continuityFixes: 0,
    dropped: { loot: 0, props: 0, monsters: 0, cages: 0, landmarks: 0, weapons: 0, ecosystem: 0 },
  }
  // 门洞区永远保留
  reserveSpan(ctx, 0, DOOR_INSET + 2)
  reserveSpan(ctx, w - DOOR_INSET - 3, w - 1)
  return ctx
}

/**
 * 生成基础起伏地形。
 * cfg: base / amp / scale / plateau(0~1 平地比例) / corridor / corridorVar / lo / hi / upStep / downStep
 */
export function buildTerrain(ctx, cfg = {}) {
  const { w, h } = ctx
  const base = cfg.base ?? h - 11
  ctx.baseFloor = base
  const amp = cfg.amp ?? 3
  const flatness = cfg.plateau ?? 0
  const n1 = valueNoise1D(ctx.seed * 17 + 3, w, cfg.scale ?? 13)
  const n2 = valueNoise1D(ctx.seed * 53 + 11, w, 4.5)
  const n3 = valueNoise1D(ctx.seed * 91 + 29, w, 2.2)
  const lo = cfg.lo ?? Math.max(5, h - 20)
  const hi = cfg.hi ?? h - 5
  const up = cfg.upStep ?? 2
  const down = cfg.downStep ?? 2
  let prev = base
  for (let x = 0; x < w; x++) {
    let t = base + Math.round(n1[x] * amp + n2[x] * 1.1)
    // plateau：靠近平地的一段被压向 base，做出可站可打的缓坡
    if (flatness > 0) t = Math.round(t * (1 - flatness * (0.55 + n3[x] * 0.45)) + base * flatness * (0.55 + n3[x] * 0.45))
    t = clamp(t, lo, hi)
    t = clamp(t, prev - up, prev + down)
    ctx.floorY[x] = t
    prev = t
  }
  // 可选台地（绝对行）
  if (cfg.plateaus) for (const p of cfg.plateaus) flattenSpan(ctx, p.x0, p.x1, p.row)
  // 天花板
  const corridor = cfg.corridor ?? 20
  const n4 = valueNoise1D(ctx.seed * 29 + 47, w, cfg.ceilScale ?? 8)
  const minCh = cfg.minCorridor ?? 12
  const maxCh = cfg.maxCorridor ?? 34
  for (let x = 0; x < w; x++) {
    let ch = Math.round(corridor + n4[x] * (cfg.corridorVar ?? 5))
    ch = clamp(ch, minCh, maxCh)
    ch = Math.max(ch, DOOR_H + 3)
    ctx.ceilY[x] = clamp(ctx.floorY[x] - ch, 2, ctx.floorY[x] - (DOOR_H + 3))
  }
  carveAll(ctx)
  return ctx
}

/** 按 floorY / ceilY 重建整张图（会把水 / 平台一起抹掉，只在 A 阶段用） */
export function carveAll(ctx) {
  const { map, w, h, floorY, ceilY } = ctx
  for (let x = 0; x < w; x++) {
    const top = ceilY[x]
    const bottom = floorY[x]
    for (let y = 0; y < h; y++) map.set(x, y, y >= top && y < bottom ? T.EMPTY : T.SOLID)
  }
}

/** 重建一列（同上，会抹掉水 / 平台） */
export function carveColumn(ctx, x) {
  const { map, h, floorY, ceilY } = ctx
  if (x < 0 || x >= ctx.w) return
  const top = ceilY[x]
  const bottom = floorY[x]
  for (let y = 0; y < h; y++) map.set(x, y, y >= top && y < bottom ? T.EMPTY : T.SOLID)
}

/**
 * 只重铺「地面」：行 >= floorY 变实心；行 < floorY 变空气（保留平台/水/杆）。
 * C 阶段（已经有平台和水之后）安全。
 */
export function reground(ctx, x) {
  const { map, h, floorY, ceilY } = ctx
  if (x < 0 || x >= ctx.w) return
  const bottom = floorY[x]
  for (let y = 0; y < h; y++) {
    if (y >= bottom) {
      map.set(x, y, T.SOLID)
      continue
    }
    const v = map.get(x, y)
    if (y >= ceilY[x]) {
      if (v === T.SOLID) map.set(x, y, T.EMPTY)
    }
  }
}

/** 把一段地面整平成绝对行 row（会重建这些列的地面） */
export function flattenSpan(ctx, x0, x1, row) {
  const a = clamp(x0, 1, ctx.w - 2)
  const b = clamp(x1, 1, ctx.w - 2)
  for (let x = a; x <= b; x++) {
    ctx.floorY[x] = clamp(row, 3, ctx.h - 2)
    // 天花板跟着保证净空
    if (ctx.ceilY[x] > ctx.floorY[x] - (DOOR_H + 3)) {
      ctx.ceilY[x] = Math.max(2, ctx.floorY[x] - (DOOR_H + 3))
    }
    carveColumn(ctx, x)
  }
}

/** 把一段地面抬高/压低 delta 行（正 = 往下挖） */
export function shiftSpan(ctx, x0, x1, delta) {
  const a = clamp(x0, 1, ctx.w - 2)
  const b = clamp(x1, 1, ctx.w - 2)
  for (let x = a; x <= b; x++) {
    ctx.floorY[x] = clamp(ctx.floorY[x] + delta, 3, ctx.h - 2)
    if (ctx.ceilY[x] > ctx.floorY[x] - (DOOR_H + 3)) {
      ctx.ceilY[x] = Math.max(2, ctx.floorY[x] - (DOOR_H + 3))
    }
    carveColumn(ctx, x)
  }
}

/**
 * 挖一个可以走进去的浅盆地（水坑 / 下凹场地）。
 * 中心最深 depth 行，向两侧每列 ≤2 行过渡 —— 玩家能跳进跳出。
 * 返回 { x0, x1, rim, bottom }。
 */
export function digBasin(ctx, cx, halfW, depth, opts = {}) {
  const { w } = ctx
  const x0 = clamp(cx - halfW, 1, w - 2)
  const x1 = clamp(cx + halfW, 1, w - 2)
  if (x1 <= x0 || depth <= 0) return null
  let rim = 0
  for (let x = x0; x <= x1; x++) rim = Math.max(rim, ctx.floorY[x])
  let prevD = 0
  for (let x = x0; x <= x1; x++) {
    const mid = (x0 + x1) / 2
    const t = 1 - Math.abs(x - mid) / Math.max(1, (x1 - x0) / 2)
    let d = Math.max(0, Math.min(depth, Math.round(depth * t)))
    d = clamp(d, prevD - WALK_STEP, prevD + WALK_STEP)
    prevD = d
    ctx.floorY[x] = clamp(rim + d, 3, ctx.h - 2)
    carveColumn(ctx, x)
  }
  // 右半边可能因为单侧限制没有回到 0，反向再顺一遍保证边缘接回原地面
  prevD = 0
  for (let x = x1; x >= x0; x--) {
    let d = ctx.floorY[x] - rim
    d = clamp(d, prevD - WALK_STEP, prevD + WALK_STEP)
    prevD = Math.max(0, d)
    ctx.floorY[x] = clamp(rim + Math.max(0, d), 3, ctx.h - 2)
    carveColumn(ctx, x)
  }
  const bottom = rim + depth
  if (opts.water !== false) {
    ctx.pools.push({ x0, x1, surfaceRow: rim + (opts.lip ?? 1), kind: opts.kind || 'water' })
  }
  return { x0, x1, rim, bottom }
}

/**
 * 挖一口竖井 —— 井口保持原来的 floorY，但换成单向平台（能走过去，也能主动落下去），
 * 井底有水 + 一根攀爬杆，保证玩家能上来。这是「不破坏主路连续性」的垂直空间。
 * 返回 { x0, x1, rim, bottom }。
 */
export function carveShaft(ctx, cx, halfW, depth, opts = {}) {
  const { map, w, h } = ctx
  const x0 = clamp(cx - halfW, 2, w - 3)
  const x1 = clamp(cx + halfW, 2, w - 3)
  if (x1 <= x0) return null
  let rim = 0
  for (let x = x0; x <= x1; x++) rim = Math.max(rim, ctx.floorY[x])
  // 井口段抬平到 rim
  for (let x = x0; x <= x1; x++) {
    ctx.floorY[x] = clamp(rim, 3, h - 2)
    if (ctx.ceilY[x] > rim - (DOOR_H + 3)) ctx.ceilY[x] = Math.max(2, rim - (DOOR_H + 3))
    carveColumn(ctx, x)
  }
  // 井口两端做过渡坡：把落差摊到井外几列（每列最多 ±2），
  // 否则井口和外面原地面的高差可能 >2，主路会出现跳不上去的台阶。
  for (const dir of [-1, 1]) {
    let prev = rim
    for (let k = 1; k <= 4; k++) {
      const x = dir < 0 ? x0 - k : x1 + k
      if (x < 1 || x >= w - 1) break
      const cur = ctx.floorY[x]
      let next = Math.max(Math.min(cur, prev + WALK_STEP), prev - WALK_STEP)
      next = clamp(next, 3, h - 2)
      if (next !== cur) {
        ctx.floorY[x] = next
        if (ctx.ceilY[x] > next - (DOOR_H + 3)) ctx.ceilY[x] = Math.max(2, next - (DOOR_H + 3))
        reground(ctx, x)
      }
      prev = next
    }
  }
  const bottom = Math.min(h - 2, rim + depth)
  // 井筒
  for (let x = x0; x <= x1; x++) {
    map.set(x, rim, T.PLATFORM)
    for (let y = rim + 1; y < bottom; y++) map.set(x, y, T.EMPTY)
    for (let y = bottom; y < h; y++) map.set(x, y, T.SOLID)
  }
  // 井底水（默认 3 行）
  const waterRows = opts.water ?? 3
  if (waterRows > 0) {
    for (let x = x0; x <= x1; x++) {
      for (let y = Math.max(rim + 2, bottom - waterRows); y < bottom; y++) map.set(x, y, T.WATER)
    }
  }
  // 攀爬杆（贴着井壁，避开正中间以免挡住落水）
  if (opts.pole !== false) {
    const px = x1
    for (let y = bottom - 1; y > rim; y--) map.set(px, y, T.POLE)
    ctx.poles.push({ x: px, top: rim + 1, bottom: bottom - 1 })
  }
  // 井壁上的踏脚平台（可选，利于取物资）
  if (opts.ledges) {
    for (let i = 0; i < opts.ledges; i++) {
      const row = bottom - 3 - i * 3
      if (row <= rim + 1) break
      const lx = i % 2 === 0 ? x0 : x0 + Math.max(1, x1 - x0 - 1)
      if (map.get(lx, row) === T.EMPTY) map.set(lx, row, T.PLATFORM)
    }
  }
  const shaft = { x0, x1, rim, bottom, cx: Math.round((x0 + x1) / 2) }
  ctx.shafts.push(shaft)
  return shaft
}

/**
 * 在墙脚挖一个浅壁龛（藏匿点）：向下 drop 行（≤2）的凹室，里面能放东西。
 * 返回 { x0, x1, row }。
 */
export function carveAlcove(ctx, cx, halfW, drop = 2, opts = {}) {
  const { w } = ctx
  const x0 = clamp(cx - halfW, 2, w - 3)
  const x1 = clamp(cx + halfW, 2, w - 3)
  if (x1 <= x0) return null
  let rim = 0
  for (let x = x0 - 1; x <= x1 + 1; x++) rim = Math.max(rim, ctx.floorY[x])
  for (let x = x0; x <= x1; x++) {
    ctx.floorY[x] = clamp(rim + drop, 3, ctx.h - 2)
    if (ctx.ceilY[x] > ctx.floorY[x] - (DOOR_H + 3)) {
      ctx.ceilY[x] = Math.max(2, ctx.floorY[x] - (DOOR_H + 3))
    }
    carveColumn(ctx, x)
  }
  const a = { x0, x1, row: rim + drop, rim, hide: !!opts.hide }
  ctx.notes.push({ type: 'alcove', ...a })
  return a
}

/** 放一条单向平台（只放在空气里，且上方要留空） */
export function addPlatform(ctx, x, row, len, opts = {}) {
  const { map, w } = ctx
  const a = clamp(x, 2, w - 3)
  const b = clamp(x + len - 1, 2, w - 3)
  let placed = 0
  let first = -1
  let last = -1
  for (let i = a; i <= b; i++) {
    if (row < 2 || row >= ctx.h - 2) continue
    const v = map.get(i, row)
    if (v !== T.EMPTY) continue
    // 上方一行必须是空的，否则玩家没法站
    if (map.get(i, row - 1) !== T.EMPTY) continue
    map.set(i, row, T.PLATFORM)
    if (first < 0) first = i
    last = i
    placed++
  }
  if (placed > 0 && opts.record !== false) {
    const p = { x0: first, x1: last, row, len: placed }
    ctx.platforms.push(p)
    ;(ctx.platformsByRow[row] = ctx.platformsByRow[row] || []).push(p)
    return p
  }
  return null
}

/** 一条长平台带（传送带 / 高架 / 吊车轨道）：尝试直到铺满 */
export function addPlatformBand(ctx, x0, x1, row, opts = {}) {
  const { map } = ctx
  const segs = []
  let start = -1
  for (let x = Math.max(2, x0); x <= Math.min(ctx.w - 3, x1); x++) {
    if (row >= 2 && row < ctx.h - 2 && map.get(x, row) === T.EMPTY && map.get(x, row - 1) === T.EMPTY) {
      map.set(x, row, T.PLATFORM)
      if (start < 0) start = x
    } else if (start >= 0) {
      segs.push({ x0: start, x1: x - 1, row, len: x - start })
      start = -1
    }
  }
  if (start >= 0) segs.push({ x0: start, x1, row, len: x1 - start + 1 })
  for (const s of segs) {
    ctx.platforms.push(s)
    ;(ctx.platformsByRow[row] = ctx.platformsByRow[row] || []).push(s)
  }
  return segs
}

/**
 * 阶梯平台：从 fromRow 爬到 toRow（正数向上 = row 更小），
 * 每级高差 ≤4 行、水平 2~3 列，玩家能跳上去。
 */
export function addPlatformStairs(ctx, x0, dir, fromRow, toRow, opts = {}) {
  const stepH = opts.stepH ?? 4
  const stepW = opts.stepW ?? 3
  const rowStep = toRow < fromRow ? -stepH : stepH
  const steps = Math.max(1, Math.ceil(Math.abs(toRow - fromRow) / stepH))
  const out = []
  for (let i = 0; i < steps; i++) {
    const row = fromRow + rowStep * (i + 1)
    const x = x0 + dir * stepW * i
    const p = addPlatform(ctx, x, row, stepW, opts)
    if (p) out.push(p)
  }
  return out
}

/** 放一根可攀爬的杆（贯穿 top..bottom 行） */
export function addPole(ctx, x, top, bottom) {
  const { map } = ctx
  const a = clamp(top, 1, ctx.h - 2)
  const b = clamp(bottom, 1, ctx.h - 2)
  let n = 0
  for (let y = a; y <= b; y++) {
    if (map.get(x, y) === T.EMPTY) {
      map.set(x, y, T.POLE)
      n++
    }
  }
  if (n) {
    if (map.get(x, b + 1) === T.EMPTY) map.set(x, b + 1, T.POLE)
    ctx.poles.push({ x, top: a, bottom: b })
  }
  return n
}

/** 挖门洞前的过渡斜坡：把门口 row 附近的台阶收进 ±2 */
export function rampToDoor(ctx, side, row, len = 6) {
  const { w } = ctx
  for (let i = 0; i < len; i++) {
    const x = side === 'left' ? ctx.doorInset + 1 + i : w - 2 - ctx.doorInset - i
    if (x < 1 || x > w - 2) break
    const lim = WALK_STEP * (i + 1)
    ctx.floorY[x] = clamp(ctx.floorY[x], row - lim, row + lim)
    if (ctx.ceilY[x] > ctx.floorY[x] - (DOOR_H + 3)) {
      ctx.ceilY[x] = Math.max(2, ctx.floorY[x] - (DOOR_H + 3))
    }
    carveColumn(ctx, x)
  }
}

/**
 * 挖一侧门洞。exits 为 null 的一侧做成实心墙。
 * 门洞：行 [row-DOOR_H, row-1] 空，行 row 实心，宽度 0..DOOR_INSET。
 */
export function carveDoorway(ctx, side) {
  const { w, map } = ctx
  const inset = ctx.doorInset
  const open = side === 'left' ? ctx.exitLeft != null : ctx.exitRight != null
  const probe = side === 'left' ? Math.min(w - 2, inset + 3) : Math.max(1, w - 4 - inset)
  const row = clamp(ctx.floorY[probe], DOOR_H + 2, ctx.h - 3)
  ctx.doorRow[side] = row
  const cols = side === 'left' ? range(0, inset) : range(w - 1 - inset, w - 1)
  if (!open) {
    for (const x of cols) {
      ctx.floorY[x] = row
      ctx.ceilY[x] = Math.max(2, row - DOOR_H)
      carveColumn(ctx, x)
    }
    return row
  }
  // 先把门口附近的台阶收进来，避免连续性兜底把门洞顶歪
  rampToDoor(ctx, side, row)
  for (const x of cols) {
    ctx.floorY[x] = row
    ctx.ceilY[x] = Math.max(2, row - DOOR_H)
    carveColumn(ctx, x)
  }
  return row
}

/**
 * 连续性兜底：把相邻 floorY 差压到 ≤ WALK_STEP。一次正向扫描即可保证。
 * 只在 B 阶段（还没有平台 / 水）调用。
 */
export function ensureContinuity(ctx, opts = {}) {
  const { w, floorY, ceilY, h } = ctx
  const maxStep = opts.maxStep ?? WALK_STEP
  let fixes = 0
  const lo = 4
  const hi = h - 2
  floorY[0] = clamp(floorY[0], lo, hi)
  for (let x = 1; x < w; x++) {
    const d = floorY[x] - floorY[x - 1]
    if (d > maxStep) {
      floorY[x] = clamp(floorY[x - 1] + maxStep, lo, hi)
      fixes++
    } else if (d < -maxStep) {
      floorY[x] = clamp(floorY[x - 1] - maxStep, lo, hi)
      fixes++
    }
  }
  for (let x = 0; x < w; x++) {
    floorY[x] = clamp(floorY[x], lo, hi)
    const maxCeil = floorY[x] - (DOOR_H + 3)
    if (ceilY[x] > maxCeil) {
      ceilY[x] = Math.max(2, maxCeil)
      fixes++
    }
    carveColumn(ctx, x)
  }
  ctx.continuityFixes += fixes
  return fixes
}

/** 最后再补一次门洞（连续性兜底之后再钉死契约） */
export function finalizeDoors(ctx) {
  for (const side of ['left', 'right']) {
    const open = side === 'left' ? ctx.exitLeft != null : ctx.exitRight != null
    const row = ctx.doorRow[side]
    const cols = side === 'left' ? range(0, ctx.doorInset) : range(ctx.w - 1 - ctx.doorInset, ctx.w - 1)
    for (const x of cols) {
      ctx.floorY[x] = clamp(row, 3, ctx.h - 2)
      ctx.ceilY[x] = Math.max(2, row - ctx.doorH)
      carveColumn(ctx, x)
      if (!open) continue
      // 门口 6 行净空
      for (let y = row - ctx.doorH; y < row; y++) if (y >= 0) ctx.map.set(x, y, T.EMPTY)
      ctx.map.set(x, row, T.SOLID)
    }
  }
}

/** 灌水（floorY 定型之后） */
export function fillPools(ctx) {
  const { map } = ctx
  for (const p of ctx.pools) {
    for (let x = Math.max(1, p.x0); x <= Math.min(ctx.w - 2, p.x1); x++) {
      const bottom = ctx.floorY[x]
      const top = Math.max(ctx.ceilY[x] + 2, p.surfaceRow ?? bottom - 3)
      for (let y = top; y < bottom; y++) if (map.get(x, y) === T.EMPTY) map.set(x, y, T.WATER)
      // 水底那格保持实心
      map.set(x, bottom, map.get(x, bottom) === T.PLATFORM ? T.PLATFORM : T.SOLID)
    }
  }
}

/** B 阶段收尾：门洞 + 连续性 + 门洞 + 灌水 */
export function finalizeTerrain(ctx, opts = {}) {
  carveDoorway(ctx, 'left')
  carveDoorway(ctx, 'right')
  ensureContinuity(ctx, opts)
  finalizeDoors(ctx)
  fillPools(ctx)
  return ctx
}

// =====================================================================
// 查询 / 占位
// =====================================================================

/** 可当「地」的瓦片（SOIL / CRACKED 也算实体地，只是能被挖/拆） */
export function standTile(t) {
  return t === T.SOLID || t === T.PLATFORM || t === T.CRACKED || t === T.SOIL
}
/** 会阻挡通行的瓦片 */
export function solidTile(t) {
  return t === T.SOLID || t === T.CRACKED || t === T.SOIL
}
/** 「空」（可以站人 / 可以穿） */
export function airTile(t) {
  return t === T.EMPTY || t === T.PLATFORM || t === T.POLE
}

/** 从走廊顶部往下找第一块可站表面 */
export function surfaceRow(ctx, x, fromRow) {
  const { map, h } = ctx
  if (x < 0 || x >= ctx.w) return -1
  const start = clamp(fromRow ?? ctx.ceilY[Math.floor(x)] ?? 2, 1, h - 2)
  for (let y = start; y < h; y++) {
    if (standTile(map.get(x, y))) return y
  }
  return -1
}

/** 该列 row 行能不能站人（脚下实/平台，头顶 n 行是空或水/酸/杆） */
export function isStandable(ctx, x, row, head = 2, allowWater = false) {
  const { map } = ctx
  if (row < 2 || row >= ctx.h - 1) return false
  if (!standTile(map.get(x, row))) return false
  for (let i = 1; i <= head; i++) {
    const t = map.get(x, row - i)
    if (t === T.EMPTY) continue
    if (allowWater && (t === T.WATER || t === T.TOXIC || t === T.POLE)) continue
    return false
  }
  return true
}

/** 收集所有可站立的点 */
export function standSpots(ctx, opts = {}) {
  const { w } = ctx
  const x0 = clamp(opts.x0 ?? ctx.doorInset + 3, 2, w - 3)
  const x1 = clamp(opts.x1 ?? w - ctx.doorInset - 4, x0, w - 3)
  const head = opts.headroom ?? 2
  const out = []
  for (let x = x0; x <= x1; x++) {
    // ground=true：只认 floorY 这一层地面（忽略头顶的平台）
    const row = opts.ground
      ? ctx.floorY[x]
      : opts.row != null
        ? opts.row
        : surfaceRow(ctx, x)
    if (row < 0) continue
    if (!isStandable(ctx, x, row, head, opts.allowWater)) continue
    if (opts.only && !opts.only(x, row)) continue
    out.push({ x, row })
  }
  return out
}

/** 平台顶面可以放东西的位置 */
export function platformSpots(ctx, opts = {}) {
  const out = []
  for (const p of ctx.platforms) {
    if (p.len < 2) continue
    for (let x = p.x0 + 1; x <= p.x1 - 1; x++) {
      if (!isStandable(ctx, x, p.row, 1, true)) continue
      if (opts.reach && !isSurfaceReachable(opts.reach, x, p.row)) continue
      out.push({ x, row: p.row })
    }
  }
  return out
}

// ---------------------------------------------------------------------
// 站面可达性：从出生点出发，走 / 跳 / 落 / 爬杆能到达的所有站立面。
// 用来保证「高台上的战利品」真的够得着。
// ---------------------------------------------------------------------

/** 所有可站立的表面节点（Uint8Array，索引 = y*w+x，1 = 可站） */
export function standableNodes(ctx) {
  const { map, w, h } = ctx
  const nodes = new Uint8Array(w * h)
  for (let x = 1; x < w - 1; x++) {
    for (let y = 2; y < h - 1; y++) {
      if (!standTile(map.get(x, y))) continue
      if (solidTile(map.get(x, y - 1))) continue
      if (solidTile(map.get(x, y - 2))) continue
      nodes[y * w + x] = 1
    }
  }
  return nodes
}

/** 某列在 y0..y1 之间有杆吗 */
function poleInColumn(ctx, x, y0, y1) {
  const a = Math.max(1, Math.min(y0, y1))
  const b = Math.min(ctx.h - 2, Math.max(y0, y1))
  for (let y = a; y <= b; y++) if (ctx.map.get(x, y) === T.POLE) return true
  return false
}

/**
 * 从出生点出发的可达站面集合（Uint8Array，1 = 可达，附加 __w = 房间宽）。
 * 规则：横向 1 列；向上跳 ≤3 格（有杆则 ≤10）；向下落 ≤14 格；杆子两侧 2 列内互通。
 */
export function reachableSurfaces(ctx, opts = {}) {
  const { w, h } = ctx
  const nodes = standableNodes(ctx)
  const seen = new Uint8Array(w * h)
  seen.__w = w
  const queue = []
  const spawn = opts.spawn || computeSpawn(ctx)
  const sx = Math.floor(spawn.x / TS)
  const sy = Math.floor(spawn.y / TS)
  let startY = -1
  for (let y = 2; y < h - 1; y++) {
    if (!nodes[y * w + sx]) continue
    if (startY < 0 || Math.abs(y - sy) < Math.abs(startY - sy)) startY = y
  }
  if (startY < 0) return seen
  const climb = opts.climb ?? 3
  const fall = opts.fall ?? 14
  const push = (idx) => {
    if (seen[idx]) return
    seen[idx] = 1
    queue.push(idx)
  }
  const drain = () => {
    let head = 0
    while (head < queue.length) {
      const idx = queue[head++]
      const x = idx % w
      const y = (idx - x) / w
      // dir=±1 走/跳（可上 3 下 14）；dir=±2 是「跳过 1~2 列的空隙」（只允许小落差）
      for (let dir = -2; dir <= 2; dir++) {
        if (dir === 0) continue
        const nx = x + dir
        if (nx < 1 || nx >= w - 1) continue
        const far = Math.abs(dir) > 1
        const up = far ? 2 : poleInColumn(ctx, nx, y - 10, y + 10) ? 10 : climb
        const y0 = Math.max(2, y - up)
        const y1 = Math.min(h - 2, y + (far ? 2 : fall))
        for (let ny = y0; ny <= y1; ny++) {
          const ni = ny * w + nx
          if (nodes[ni] && !seen[ni]) push(ni)
        }
      }
    }
    queue.length = 0
  }
  push(startY * w + sx)
  drain()
  for (const p of ctx.poles) {
    const x0 = Math.max(1, p.x - 2)
    const x1 = Math.min(w - 2, p.x + 2)
    const y0 = Math.max(2, p.top - 3)
    const y1 = Math.min(h - 2, p.bottom + 2)
    let anySeen = false
    for (let x = x0; x <= x1 && !anySeen; x++) {
      for (let y = y0; y <= y1; y++) {
        if (nodes[y * w + x] && seen[y * w + x]) {
          anySeen = true
          break
        }
      }
    }
    if (!anySeen) continue
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const ni = y * w + x
        if (nodes[ni] && !seen[ni]) push(ni)
      }
    }
    drain()
  }
  return seen
}

/** 某个点是否「够得着」（同列 / 相邻列 ±1 行内有可达站面） */
export function isSurfaceReachable(reach, x, y) {
  if (!reach || !reach.length) return true
  const w = reach.__w
  if (!w) return true
  for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx
    if (xx < 0) continue
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy < 0) continue
      if (reach[yy * w + xx]) return true
    }
  }
  return false
}

/** 平台顶面是否已经能从出生点站上去（以可达 BFS 结果为准） */
function platformReached(reach, p) {
  const w = reach.__w
  if (!w) return true
  for (let x = p.x0; x <= p.x1; x++) {
    if (x < 1 || x >= w) continue
    if (reach[p.row * w + x]) return true
  }
  return false
}

/**
 * 保证每一层浮空平台都能上去：以「出生点可达性」为准，
 * 够不着的平台先补一根下到地面的爬杆；补杆也不行就拆掉平台，
 * 绝不留「看得见却够不着」的地方。返回补杆数。
 */
export function ensurePlatformAccess(ctx) {
  const { map, w, h } = ctx
  let fixed = 0
  for (let pass = 0; pass < 3; pass++) {
    let reach = null
    try {
      reach = reachableSurfaces(ctx)
    } catch (e) {
      reach = null
    }
    if (!reach || !reach.length) return fixed
    // 出生点本身站不住时 BFS 全空，此时不再动平台
    let any = false
    for (let i = 0; i < reach.length; i++) if (reach[i]) { any = true; break }
    if (!any) return fixed
    let added = 0
    for (const p of ctx.platforms) {
      if (platformReached(reach, p)) continue
      for (let x = p.x0 + 1; x <= p.x1 - 1; x++) {
        if (x < 1 || x >= w - 1) continue
        if (poleInColumn(ctx, x, p.row + 1, h - 2)) break
        const ground = map.groundBelow(x * TS + TS / 2, (p.row + 1) * TS, TS * 26)
        if (ground == null) continue
        const groundRow = Math.floor(ground / TS)
        if (groundRow <= p.row + 1) continue
        let n = 0
        for (let y = p.row + 1; y < groundRow; y++) {
          if (map.get(x, y) === T.EMPTY) {
            map.set(x, y, T.POLE)
            n++
          }
        }
        if (n) {
          ctx.poles.push({ x, top: p.row + 1, bottom: groundRow - 1 })
          fixed++
          added++
          break
        }
      }
    }
    if (!added) break
  }
  // 二次校验：仍然够不着的平台直接拆掉（上面的物件交给 pruneUnreachable 挪走）
  let reach = null
  try {
    reach = reachableSurfaces(ctx)
  } catch (e) {
    reach = null
  }
  let any = false
  if (reach && reach.length) {
    for (let i = 0; i < reach.length; i++) if (reach[i]) { any = true; break }
  }
  if (any) {
    const keep = []
    for (const p of ctx.platforms) {
      if (platformReached(reach, p)) {
        keep.push(p)
        continue
      }
      for (let x = p.x0; x <= p.x1; x++) {
        if (map.get(x, p.row) === T.PLATFORM) map.set(x, p.row, T.EMPTY)
      }
      fixed++
    }
    ctx.platforms = keep
  }
  return fixed
}

/** 占用栅格写入（O(1) 查空位；大房间几百个实体时线性扫描会拖慢生成） */
function occMark(ctx, x, y, on) {
  if (y < 0 || y >= ctx.h || x < 0 || x >= ctx.w) return
  ctx.occ[y * ctx.w + x] = on ? 1 : 0
}

/** 标记占位（避免 loot / prop 叠在一起） */
export function markTaken(ctx, x, row, r = 1) {
  const rr = Math.max(0, Math.min(6, r))
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -rr - 1; dx <= rr + 1; dx++) occMark(ctx, x + dx, row + dy, true)
  }
  ctx.taken.push({ x, row, r })
}

/** 该点是否空闲 */
export function isFree(ctx, x, row, r = 1) {
  const rr = Math.max(0, Math.min(6, r))
  for (let dy = -1; dy <= 1; dy++) {
    const y = row + dy
    if (y < 0 || y >= ctx.h) continue
    const base = y * ctx.w
    for (let dx = -rr - 1; dx <= rr + 1; dx++) {
      const xx = x + dx
      if (xx < 0 || xx >= ctx.w) continue
      if (ctx.occ[base + xx]) return false
    }
  }
  for (const s of ctx.reserved) {
    if (x >= s.x0 - r && x <= s.x1 + r) return false
  }
  return true
}

/** 保留一段（门洞 / 避难所 / 牢笼周边不放杂物） */
export function reserveSpan(ctx, x0, x1) {
  ctx.reserved.push({ x0, x1 })
}

/** 保留一段并清掉这一段内的占位 */
export function clearSpan(ctx, x0, x1) {
  ctx.taken = ctx.taken.filter((t) => t.x < x0 || t.x > x1)
  for (let x = Math.max(0, x0); x <= Math.min(ctx.w - 1, x1); x++) {
    for (let y = 0; y < ctx.h; y++) ctx.occ[y * ctx.w + x] = 0
  }
}

/** 一段地面是否严格等高（挖壁龛 / 放牢笼前用，保证不会破坏 ±2 连续性） */
export function flatSpanExact(ctx, x0, x1) {
  const a = clamp(x0, 1, ctx.w - 2)
  const b = clamp(x1, 1, ctx.w - 2)
  const row = ctx.floorY[a]
  for (let x = a; x <= b; x++) {
    if (ctx.floorY[x] !== row) return false
    const v = ctx.map.get(x, row)
    if (!standTile(v)) return false
    if (ctx.map.get(x, row - 1) !== T.EMPTY) return false
  }
  return true
}

/** 该列是否在避难所范围内 */
export function inShelter(ctx, x) {
  const s = ctx.shelterZone
  if (!s) return false
  return x >= s.x0 && x <= s.x1
}

// =====================================================================
// C. 避难所
// =====================================================================

/**
 * A 阶段：整平避难所地基（会改 floorY）。
 * opts: side('left'|'right'), half(半宽), row(可选绝对行)
 */
export function prepareShelter(ctx, opts = {}) {
  const { w, floorY } = ctx
  const side = opts.side || ctx.spec.shelterSide || 'left'
  const half = opts.half ?? 4
  const cx = side === 'right' ? w - ctx.doorInset - 11 : ctx.doorInset + 10
  const x0 = clamp(cx - half, ctx.doorInset + 3, w - ctx.doorInset - 4)
  const x1 = clamp(cx + half, x0, w - ctx.doorInset - 4)
  const row = opts.row ?? Math.max(...Array.from(floorY.slice(x0, x1 + 1)))
  flattenSpan(ctx, x0, x1, row)
  // 地基两端做 ±2 过渡，连续性兜底会收尾
  ctx.shelterZone = { x0, x1, cx: Math.round((x0 + x1) / 2), row, side }
  return ctx.shelterZone
}

/**
 * C 阶段：给避难所加「屋檐平台」+ 营地道具 + 记录 shelter 坐标。
 * 屋檐平台在玩家头顶 7 行，是上面一层可走的台子（竖向空间），不挡地面。
 */
export function finishShelter(ctx, opts = {}) {
  const z = ctx.shelterZone
  if (!z) return null
  const row = ctx.floorY[z.cx]
  const roofRow = row - (opts.roofHeight ?? 7)
  if (roofRow > ctx.ceilY[z.cx] + 1) {
    addPlatform(ctx, z.x0 - 1, roofRow, z.x1 - z.x0 + 3)
  }
  ctx.shelter = { x: z.cx * TS + TS / 2, y: row * TS }
  reserveSpan(ctx, z.x0 - 2, z.x1 + 2)
  // 营地物件：火盆居中，两侧帐篷 / 工作台 / 箱子
  // 注意：这里必须落在地面那层（floorY），不能用 surfaceRow —— 屋檐平台刚加过，
  // surfaceRow 会先撞到屋顶，把营地摆到屋顶上去。
  const put = (kind, dx, dz = 0, flip) => {
    const x = clamp(z.cx + dx, 2, ctx.w - 3)
    const r = ctx.floorY[x]
    if (r < 0 || !isStandable(ctx, x, r, 1, true)) return
    const e = { kind, x: x * TS + TS / 2, y: r * TS }
    if (flip !== undefined) e.flip = flip
    if (dz) e.z = dz
    ctx.props.push(e)
    markTaken(ctx, x, r, 1)
  }
  put('campfire', 0, 1)
  put('tent', -3, 0, true)
  put('crate', 2, 0)
  put('barrel', 4, 0, false)
  if (ctx.rng.chance(0.55)) put('workbench', -5, 0)
  if (ctx.rng.chance(0.4)) put('junk_heap', 5, 0)
  ctx.smokeSources.push({ x: (z.cx + 0) * TS + TS / 2, y: row * TS - 18, radius: 52, intensity: 0.32 })
  return ctx.shelter
}

// =====================================================================
// D. 布置
// =====================================================================

/** 在指定行（平台 / 井底 / 地面）上挑点 */
function pickGroundSpot(ctx, opts = {}) {
  const { rng, w } = ctx
  const x0 = clamp(opts.x0 ?? ctx.doorInset + 3, 2, w - 3)
  const x1 = clamp(opts.x1 ?? w - ctx.doorInset - 4, x0, w - 3)
  const head = opts.headroom ?? 2
  const r = opts.r ?? 2
  const tries = opts.tries ?? 26
  for (let i = 0; i < tries; i++) {
    const x = rng.int(x0, x1)
    const row = ctx.floorY[x]
    if (row < 0 || !isStandable(ctx, x, row, head, opts.allowWater)) continue
    if (opts.avoidShelter !== false && inShelter(ctx, x)) continue
    if (!isFree(ctx, x, row, r)) continue
    if (opts.only && !opts.only(x, row)) continue
    return { x, row }
  }
  return null
}

/**
 * 战利品。
 * cfg: pool / rare / count / base / platformRatio / shaftRatio / hiddenRatio / buriedRatio
 */
export function placeLoot(ctx, cfg = {}) {
  const { rng, spec } = ctx
  const density = clamp(spec.lootDensity ?? 1, 0.25, 2)
  const base = cfg.base ?? Math.max(5, Math.round((ctx.w / 7.5) * density))
  const count = cfg.count ?? base
  const pool = cfg.pool || ITEM_POOLS[ctx.biome] || ITEM_POOLS.city
  const rare = cfg.rare || RARE_POOLS[ctx.biome] || RARE_POOLS.city
  const hiddenRatio = cfg.hiddenRatio ?? 0.18
  const buriedRatio = cfg.buriedRatio ?? 0.14
  const platformRatio = cfg.platformRatio ?? 0.26
  const shaftRatio = cfg.shaftRatio ?? 0.12
  const pickItem = () => (rng.chance(0.16) ? rng.pick(rare) : rng.pick(pool))

  // 1) 地面
  let n = 0
  const groundTarget = Math.round(count * (1 - platformRatio - shaftRatio))
  const groundSpots = shuffle(
    rng,
    standSpots(ctx, {
      headroom: 2,
      ground: true,
      only: (x, row) => !inShelter(ctx, x) && isFree(ctx, x, row, 1),
    }),
  )
  for (const s of groundSpots) {
    if (n >= groundTarget) break
    const e = { id: pickItem(), x: s.x * TS + TS / 2, y: s.row * TS }
    const roll = rng.next()
    if (roll < hiddenRatio) e.hidden = true
    else if (roll < hiddenRatio + buriedRatio) e.buried = true
    ctx.loot.push(e)
    markTaken(ctx, s.x, s.row, 0)
    n++
  }

  // 2) 高台（平台顶）—— 只放在「爬得上去」的平台上
  const reach = reachableSurfaces(ctx)
  ctx.reach = reach
  ctx.reachStale = false
  const platTarget = Math.round(count * platformRatio)
  const plats = shuffle(rng, platformSpots(ctx, { reach }))
  let pn = 0
  for (const s of plats) {
    if (pn >= platTarget) break
    if (!isFree(ctx, s.x, s.row, 1)) continue
    const e = { id: rng.chance(0.4) ? rng.pick(rare) : pickItem(), x: s.x * TS + TS / 2, y: s.row * TS }
    if (rng.chance(0.3)) e.hidden = true
    ctx.loot.push(e)
    markTaken(ctx, s.x, s.row, 0)
    pn++
  }

  // 3) 井底（稀有物资藏在深处）
  const shaftTarget = Math.round(count * shaftRatio)
  let sn = 0
  for (const sh of ctx.shafts) {
    if (sn >= Math.max(1, shaftTarget)) break
    const x = sh.x0 + Math.floor((sh.x1 - sh.x0 + 1) / 2)
    const y = sh.bottom * TS
    if (!isFree(ctx, x, sh.bottom, 1)) continue
    ctx.loot.push({ id: rng.pick(rare), x: x * TS + TS / 2, y, hidden: true })
    markTaken(ctx, x, sh.bottom, 0)
    sn++
    if (rng.chance(0.6) && sn < shaftTarget) {
      const x2 = clamp(x + 2, sh.x0, sh.x1)
      ctx.loot.push({ id: pickItem(), x: x2 * TS + TS / 2, y, buried: true })
      markTaken(ctx, x2, sh.bottom, 0)
      sn++
    }
  }

  // 4) 壁龛（藏匿点）里塞一件
  for (const a of ctx.notes) {
    if (a.type !== 'alcove') continue
    const x = Math.round((a.x0 + a.x1) / 2)
    const row = surfaceRow(ctx, x)
    if (row < 0) continue
    ctx.loot.push({ id: rng.pick(rare), x: x * TS + TS / 2, y: row * TS, hidden: true })
    markTaken(ctx, x, row, 0)
  }
  return ctx.loot
}

/** 怪物（不放水里、不放避难所、不放门口） */
export function placeMonsters(ctx, cfg = {}) {
  const { rng, spec } = ctx
  const count = cfg.count ?? spec.monsterCount ?? MONSTER_COUNT[ctx.biome] ?? 6
  if (count <= 0) return ctx.monsters
  const pool = cfg.pool || MONSTER_POOLS[ctx.biome] || MONSTER_POOLS.city
  // 先把地面位排完，不够再上平台（保证 5~9 只怪一定刷得出来）
  const ground = shuffle(
    rng,
    standSpots(ctx, {
      headroom: 2,
      ground: true,
      only: (x, row) => !inShelter(ctx, x) && isFree(ctx, x, row, 1),
    }),
  )
  const upper = shuffle(
    rng,
    platformSpots(ctx).filter((s) => !inShelter(ctx, s.x) && isFree(ctx, s.x, s.row, 1)),
  )
  let n = 0
  for (const s of ground.concat(upper)) {
    if (n >= count) break
    if (!isFree(ctx, s.x, s.row, 1)) continue
    ctx.monsters.push({ id: rng.pick(pool), x: s.x * TS + TS / 2, y: s.row * TS })
    markTaken(ctx, s.x, s.row, 1)
    n++
  }
  if (n < count) ctx.dropped.monsters += count - n
  return ctx.monsters
}

/**
 * 道具散布。
 * cfg.list: [{ kind, count, r?, z?, scale?, flip?, where?:'ground'|'platform'|'ceiling', avoidShelter? }]
 */
export function placeProps(ctx, cfg = {}) {
  const { rng } = ctx
  const list = cfg.list || []
  let platCache = null
  const getPlats = () => (platCache ||= shuffle(rng, platformSpots(ctx)))
  for (const item of list) {
    const count = item.count ?? 1
    const r = item.r ?? 1
    let placed = 0
    let guard = 0
    let misses = 0
    while (placed < count && guard++ < count * 30) {
      let spot = null
      if (item.where === 'platform') {
        const plats = platformSpots(ctx)
        if (plats.length) {
          const s = plats[Math.floor(rng.next() * plats.length)]
          if (isFree(ctx, s.x, s.row, r)) spot = s
        }
      } else if (item.where === 'ceiling') {
        const x = clamp(rng.int(3, ctx.w - 4), 2, ctx.w - 3)
        const row = ctx.ceilY[x] + 1
        if (isFree(ctx, x, row, r)) spot = { x, row, ceiling: true }
      } else {
        spot = pickGroundSpot(ctx, {
          headroom: item.headroom ?? 2,
          // 检查半径比占用半径松一档：小的装饰件允许贴着别的物件放
          r: Math.max(0, Math.min(r, 1)),
          avoidShelter: item.avoidShelter,
          only: item.only,
        })
      }
      if (!spot) {
        if (++misses > 8) break
        continue
      }
      misses = 0
      const e = { kind: item.kind, x: spot.x * TS + TS / 2, y: spot.row * TS }
      if (item.z != null) e.z = item.z
      if (item.scale != null) e.scale = item.scale
      if (item.flip !== undefined) e.flip = item.flip
      else if (rng.chance(0.5)) e.flip = true
      ctx.props.push(e)
      markTaken(ctx, spot.x, spot.row, r)
      placed++
    }
    // 地面放不下就摆到平台/高台上（大房间地面很容易被物资占满）
    if (placed < count && item.where !== 'ceiling') {
      let guard2 = 0
      const plats = getPlats()
      if (!plats.length) guard2 = Infinity
      while (placed < count && guard2++ < count * 12) {
        const ps = plats[Math.floor(rng.next() * plats.length)]
        if (!isFree(ctx, ps.x, ps.row, 0)) continue
        const e = { kind: item.kind, x: ps.x * TS + TS / 2, y: ps.row * TS }
        if (item.z != null) e.z = item.z
        if (item.scale != null) e.scale = item.scale
        if (rng.chance(0.5)) e.flip = true
        ctx.props.push(e)
        markTaken(ctx, ps.x, ps.row, 0)
        placed++
      }
    }
    if (placed === 0 && count > 0) ctx.notes.push({ type: 'prop-missed', kind: item.kind })
    else if (placed < count) ctx.notes.push({ type: 'prop-partial', kind: item.kind, placed, count })
  }
  return ctx.props
}

/** 手工放一个道具（不随机，用于地标 / 牢笼 / 特征件） */
export function addProp(ctx, kind, x, row, opts = {}) {
  const e = { kind, x: x * TS + (opts.dx ?? TS / 2), y: row * TS }
  if (opts.z != null) e.z = opts.z
  if (opts.scale != null) e.scale = opts.scale
  if (opts.flip !== undefined) e.flip = opts.flip
  ctx.props.push(e)
  markTaken(ctx, x, row, opts.r ?? 1)
  return e
}

// ---------------------------------------------------------------- 地面小杂物
/** 纯装饰地面杂物池：按 biome 选，全部是无交互小尺寸散布件。 */
const DEBRIS_POOLS = {
  city: ['paper_trash', 'glass_shards', 'rubble_small', 'scrap_bits', 'crack_ground', 'bone_scatter'],
  village: ['paper_trash', 'bone_scatter', 'rubble_small', 'crack_ground', 'glass_shards'],
  factory: ['scrap_bits', 'shell_casings', 'cable_coil', 'rubble_small', 'glass_shards'],
  dump: ['scrap_bits', 'paper_trash', 'glass_shards', 'rubble_small', 'bone_scatter'],
  metro: ['cable_coil', 'paper_trash', 'glass_shards', 'crack_ground', 'shell_casings'],
  hospital: ['paper_trash', 'glass_shards', 'bone_scatter', 'cable_coil'],
  port: ['cable_coil', 'shell_casings', 'scrap_bits', 'crack_ground', 'bone_scatter'],
}

/**
 * 沿主地面随机散布小杂物（纯装饰、不占位、不参与可达性）。
 * 由 buildRoom 统一调用；避难所内减量且不进避难所区域。
 */
export function scatterDebris(ctx) {
  const { rng, w } = ctx
  const pool = DEBRIS_POOLS[ctx.biome] || DEBRIS_POOLS.city
  const isShelterRoom = ctx.variant === 'shelter'
  const n = Math.max(3, Math.round((w / 13) * (isShelterRoom ? 0.35 : 1)))
  let placed = 0
  let guard = 0
  while (placed < n && guard++ < n * 8) {
    const kind = pool[placed % pool.length]
    const x = clamp(rng.int(3, w - 4), 2, w - 3)
    const row = ctx.floorY ? ctx.floorY[x] : surfaceRow(ctx, x)
    if (row == null || row < 0) continue
    if (inShelter(ctx, x)) continue
    if (!isFree(ctx, x, row, 0)) continue
    const e = {
      kind,
      x: x * TS + TS / 2 + (rng.next() - 0.5) * 18,
      y: row * TS,
    }
    if (rng.chance(0.5)) e.flip = true
    if (rng.chance(0.35)) e.scale = 0.8 + rng.next() * 0.25
    ctx.props.push(e)
    placed++
  }
  return placed
}

/** 牢笼：必须站在平地上、上方 4 行净空、左右各 2 列可接近 */
export function placeCages(ctx, list = []) {
  const { rng } = ctx
  for (const c of list) {
    const spots = standSpots(ctx, {
      headroom: 4,
      ground: true,
      only: (x, row) => {
        if (inShelter(ctx, x)) return false
        if (!isFree(ctx, x, row, 2)) return false
        return flatRun(ctx, x, 2)
      },
    })
    let s = spots.length ? spots[Math.floor(rng.next() * spots.length)] : null
    if (!s) {
      const all = standSpots(ctx, {
        headroom: 4,
        ground: true,
        only: (x, row) => isFree(ctx, x, row, 1),
      })
      s = all.length ? all[Math.floor(rng.next() * all.length)] : null
    }
    if (!s) {
      ctx.dropped.cages++
      continue
    }
    ctx.cages.push({
      id: c.id,
      x: s.x * TS + TS / 2,
      y: s.row * TS,
      rescueQuest: c.rescueQuest,
    })
    // 牢笼的贴图由 Room.buildCages() 用 getPropArt('cage') 自己画，
    // 这里再塞一个 cage 道具会叠两层，所以只占位不下道具。
    markTaken(ctx, s.x, s.row, 3)
    reserveSpan(ctx, s.x - 2, s.x + 2)
  }
  return ctx.cages
}

/** 地标：底座要平，上方 4 行净空；同时放一个可视化道具 */
export function placeLandmarks(ctx, list = []) {
  const { rng } = ctx
  for (const lm of list) {
    const spots = standSpots(ctx, {
      headroom: 4,
      ground: true,
      only: (x, row) =>
        !inShelter(ctx, x) && isFree(ctx, x, row, 3) && flatRun(ctx, x, 1),
    })
    let s = spots.length ? spots[Math.floor(rng.next() * spots.length)] : null
    if (!s) {
      const all = standSpots(ctx, {
        headroom: 3,
        ground: true,
        only: (x, row) => isFree(ctx, x, row, 2),
      })
      s = all.length ? all[Math.floor(rng.next() * all.length)] : null
    }
    if (!s) {
      ctx.dropped.landmarks++
      continue
    }
    const meta = LANDMARK_PROPS[lm.id] || { prop: 'relay', kind: 'relay' }
    ctx.landmarks.push({ id: lm.id, x: s.x * TS + TS / 2, y: s.row * TS, kind: lm.kind || meta.kind })
    // 地标贴图同样由 Room.buildLandmarks() 负责（按 lm.kind 取 relay/antenna/generator），
    // 不再重复放 prop，避免同位置画两层。
    markTaken(ctx, s.x, s.row, 3)
    reserveSpan(ctx, s.x - 2, s.x + 2)
    if (lm.id === 'antenna_signal' || lm.id === 'relay_a') {
      // 地标自带一点烟/尘以出片
      ctx.smokeSources.push({ x: s.x * TS + TS / 2, y: s.row * TS - 60, radius: 60, intensity: 0.22 })
    }
  }
  return ctx.landmarks
}

/** 附近几列地面是否平整（给牢笼 / 地标用） */
export function flatRun(ctx, x, half) {
  const base = ctx.floorY[x]
  for (let i = -half; i <= half; i++) {
    const xx = x + i
    if (xx < 1 || xx >= ctx.w - 1) return false
    if (Math.abs(ctx.floorY[xx] - base) > 1) return false
    if (!isStandable(ctx, xx, ctx.floorY[xx], 2, true)) return false
  }
  return true
}

/** 加一处烟/蒸汽源（坐标是世界坐标，y 取该列地面以上） */
export function addSmoke(ctx, x, radius = 60, intensity = 0.4, opts = {}) {
  const row = opts.row != null ? opts.row : surfaceRow(ctx, x)
  if (row < 0) return null
  const src = {
    x: x * TS + TS / 2,
    y: row * TS - (opts.lift ?? 20),
    radius,
    intensity,
  }
  ctx.smokeSources.push(src)
  return src
}

/** 沿一段随机撒若干烟源（蒸汽口 / 烟囱） */
export function scatterSmoke(ctx, x0, x1, count, opts = {}) {
  const out = []
  for (let i = 0; i < count; i++) {
    const x = clamp(ctx.rng.int(x0, x1), 2, ctx.w - 3)
    const s = addSmoke(ctx, x, opts.radius ?? 58, opts.intensity ?? 0.35, opts)
    if (s) out.push(s)
  }
  return out
}

// =====================================================================
// E. 组装
// =====================================================================

/**
 * 出生点：优先避难所旁边，否则左门内侧。
 * 一定落在地面那层（floorY），不会落在头顶的平台上 —— 门口/避难所旁边
 * 常常有断楼板，落在平台上会让玩家一进房就摔下来。
 */
export function computeSpawn(ctx) {
  const { w } = ctx
  const candidates = []
  if (ctx.shelter) {
    const sx = Math.round(ctx.shelter.x / TS)
    for (const d of [3, 4, -3, -4, 2, 5]) candidates.push(clamp(sx + d, 2, w - 3))
  }
  for (let x = ctx.doorInset + 3; x < ctx.doorInset + 16; x++) candidates.push(x)
  // 兜底：整间房从左到右扫
  for (let x = 2; x < w - 2; x++) candidates.push(x)
  for (const x of candidates) {
    const row = ctx.floorY[x]
    if (row < 0) continue
    if (!isStandable(ctx, x, row, 3, true)) continue
    return { x: x * TS + TS / 2, y: row * TS }
  }
  // 最后兜底：任意可站表面（哪怕是平台）
  for (const x of candidates) {
    const row = surfaceRow(ctx, x)
    if (row < 0) continue
    if (!isStandable(ctx, x, row, 2, true)) continue
    return { x: x * TS + TS / 2, y: row * TS }
  }
  const row = ctx.floorY[Math.floor(w / 2)]
  return { x: Math.floor(w / 2) * TS + TS / 2, y: row * TS }
}

/** 检查某点下方有没有支撑（允许水面 / 平台） */
export function supportOf(ctx, px, py) {
  const tx = Math.floor(px / TS)
  const ty = Math.floor(py / TS)
  const g = ctx.map.groundBelow(px, py + 2, TS * 4)
  if (g != null && g - py <= 10) return { ok: true, kind: 'ground', gap: g - py }
  if (ctx.map.get(tx, ty + 1) === T.WATER || ctx.map.get(tx, ty) === T.WATER) return { ok: true, kind: 'water' }
  if (ctx.map.get(tx, ty + 1) === T.TOXIC || ctx.map.get(tx, ty) === T.TOXIC) return { ok: true, kind: 'toxic' }
  if (g != null && g - py <= TS * 3) return { ok: true, kind: 'ledge', gap: g - py }
  return { ok: false, kind: 'none', gap: g == null ? Infinity : g - py }
}

/**
 * 可达性兜底：把「够不着」的物资/武器/生态点/牢笼/地标挪到玩家走得到的地面上，
 * 挪不了的才丢弃。正常生成很少触发（放在高台/管道里的东西偶尔够不着）。
 */
export function pruneUnreachable(ctx, cachedReach) {
  let reach = cachedReach || null
  if (!reach) {
    try {
      reach = reachableSurfaces(ctx)
    } catch (e) {
      return
    }
  }
  if (!reach || !reach.length) return
  const okAt = (e) => isSurfaceReachable(reach, Math.floor(e.x / TS), Math.floor(e.y / TS))
  // 可达的空位（地面优先）
  let spots = standSpots(ctx, { headroom: 2, ground: true, only: (x, row) => isFree(ctx, x, row, 1) })
  if (!spots.length) spots = standSpots(ctx, { headroom: 2, only: (x, row) => isFree(ctx, x, row, 1) })
  const relocate = (e) => {
    if (!spots.length) return false
    const s = spots.shift()
    e.x = s.x * TS + TS / 2
    e.y = s.row * TS
    markTaken(ctx, s.x, s.row, 0)
    return true
  }
  // 战利品：够不着就丢（数量足够）
  const lootKeep = []
  for (const l of ctx.loot) {
    if (okAt(l)) lootKeep.push(l)
    else ctx.dropped.loot++
  }
  ctx.loot = lootKeep
  // 武器 / 生态点 / 大型敌人 / 牢笼 / 地标：尽量挪，挪不了才丢
  const fixList = (list, counter) => {
    const keep = []
    for (const e of list) {
      if (okAt(e) || relocate(e)) keep.push(e)
      else if (counter) ctx.dropped[counter] = (ctx.dropped[counter] || 0) + 1
    }
    return keep
  }
  ctx.weapons = fixList(ctx.weapons, 'weapons')
  ctx.ecosystem = fixList(ctx.ecosystem, 'ecosystem')
  ctx.largeEnemies = fixList(ctx.largeEnemies, 'largeEnemies')
  ctx.cages = fixList(ctx.cages, 'cages')
  ctx.landmarks = fixList(ctx.landmarks, 'landmarks')
}

/** 清掉没有支撑 / 越界 / 卡在实体里的东西（兜底，正常生成不会触发） */
export function pruneUnsupported(ctx) {
  const keep = (px, py) => {
    if (px < 0 || px >= ctx.w * TS || py < 0 || py > ctx.h * TS) return false
    const r = supportOf(ctx, px, py)
    if (!r.ok) return false
    const tx = Math.floor(px / TS)
    const ty = Math.floor(py / TS)
    // 脚站的那一格是支撑面（实心/平台/水面），身体那格不能是实心
    if (solidTile(ctx.map.get(tx, ty - 1))) return false
    return true
  }
  const before = ctx.loot.length
  ctx.loot = ctx.loot.filter((e) => keep(e.x, e.y))
  ctx.dropped.loot += before - ctx.loot.length
  const beforeP = ctx.props.length
  ctx.props = ctx.props.filter((e) => keep(e.x, e.y))
  ctx.dropped.props += beforeP - ctx.props.length
  const beforeM = ctx.monsters.length
  ctx.monsters = ctx.monsters.filter((e) => keep(e.x, e.y))
  ctx.dropped.monsters += beforeM - ctx.monsters.length
  ctx.cages = ctx.cages.filter((e) => keep(e.x, e.y))
  ctx.landmarks = ctx.landmarks.filter((e) => keep(e.x, e.y))
  return ctx
}

/** 武器散落：每房 0~3 把（避难所保底 1 把） */
export function placeWeapons(ctx, cfg = {}) {
  const { rng, spec } = ctx
  const isShelter = (spec.kind || 'standard') === 'shelter' || ctx.variant === 'shelter'
  const count = cfg.count != null ? cfg.count : isShelter ? 1 : rng.int(0, 3)
  if (count <= 0) return ctx.weapons
  // 优先放在「地面上、离门口/避难所远一点」的位置；避难所的保底武器放在避难所边上
  const spots = isShelter
    ? standSpots(ctx, {
        headroom: 2,
        ground: true,
        only: (x, row) => inShelter(ctx, x) && isFree(ctx, x, row, 1),
      })
    : standSpots(ctx, {
        headroom: 2,
        ground: true,
        only: (x, row) => !inShelter(ctx, x) && isFree(ctx, x, row, 2),
      })
  const fallback = isShelter
    ? standSpots(ctx, { headroom: 2, ground: true, only: (x, row) => isFree(ctx, x, row, 1) })
    : standSpots(ctx, { headroom: 2, ground: true, only: (x, row) => isFree(ctx, x, row, 1) })
  const pool = spots.length ? spots : fallback
  const shuffled = shuffle(rng, pool)
  let n = 0
  for (const s of shuffled) {
    if (n >= count) break
    if (!isFree(ctx, s.x, s.row, 1)) continue
    ctx.weapons.push({ id: rng.pick(WEAPON_IDS), x: s.x * TS + TS / 2, y: s.row * TS })
    markTaken(ctx, s.x, s.row, 0)
    n++
  }

  if (n < count) ctx.dropped.weapons += count - n
  return ctx.weapons
}

/**
 * 生态点：每房 3~8 处，roach 与 plant 各至少 1 处。
 * 每处 y 都落在支撑面上（蟑螂/老鼠/植物在地面，苍蝇围着垃圾堆）。
 */
export function placeEcosystem(ctx, cfg = {}) {
  const { rng, spec } = ctx
  const target = Math.max(3, cfg.count ?? rng.int(3, 8))
  const spots = shuffle(
    rng,
    standSpots(ctx, { headroom: 2, ground: true, only: (x, row) => isFree(ctx, x, row, 1) }),
  )
  const kinds = ['roach', 'plant']
  while (kinds.length < target) {
    kinds.push(rng.pick(['roach', 'plant', 'fly', 'rat', 'fly', 'rat']))
  }
  const shuffledKinds = shuffle(rng, kinds)
  let n = 0
  let si = 0
  for (const kind of shuffledKinds) {
    if (n >= target) break
    let s = null
    while (si < spots.length) {
      const cand = spots[si++]
      if (isFree(ctx, cand.x, cand.row, 0)) {
        s = cand
        break
      }
    }
    if (!s) break
    const group = kind === 'plant' ? rng.int(1, 3) : rng.int(1, 4)
    ctx.ecosystem.push({ kind, x: s.x * TS + TS / 2, y: s.row * TS, n: group })
    markTaken(ctx, s.x, s.row, 0)
    n++
  }
  if (n < target) ctx.dropped.ecosystem += target - n
  return ctx.ecosystem
}

/**
 * 大型敌人候选点：30% 的房间给 1 个（避难所永远不给）。
 * 选一处「地面平坦 + 上方 6 行净空」的位置，离出生点远一点。
 */
export function placeLargeEnemy(ctx, cfg = {}) {
  const { rng, spec } = ctx
  const isShelter = (spec.kind || 'standard') === 'shelter' || ctx.variant === 'shelter'
  if (isShelter) return ctx.largeEnemies
  const chance = cfg.chance ?? 0.3
  if (!rng.chance(chance)) return ctx.largeEnemies
  const spots = standSpots(ctx, {
    headroom: 6,
    ground: true,
    only: (x, row) => !inShelter(ctx, x) && isFree(ctx, x, row, 3),
  })
  if (!spots.length) return ctx.largeEnemies
  // 尽量选房间中后段（离入口远）
  const scored = spots
    .map((s) => ({ ...s, d: Math.abs(s.x - ctx.w * 0.62) }))
    .sort((a, b) => a.d - b.d)
  const pick = scored[Math.min(scored.length - 1, rng.int(0, Math.max(0, Math.min(3, scored.length - 1))))]
  if (!pick) return ctx.largeEnemies
  const bias = LARGE_ENEMY_BIAS[ctx.biome] || LARGE_ENEMY_IDS
  ctx.largeEnemies.push({
    id: rng.pick(bias),
    x: pick.x * TS + TS / 2,
    y: pick.row * TS,
    roomId: spec.id,
  })
  markTaken(ctx, pick.x, pick.row, 3)
  return ctx.largeEnemies
}

/**
 * 武器 / 生态点 / 大型敌人 —— 三样都要抢地面空位，
 * 所以 biome 必须在 placeLoot / placeProps 之前调用（否则地面被物资占满，一把武器都放不下）。
 */
export function placeExtras(ctx) {
  if (ctx.extrasPlaced) return
  placeLargeEnemy(ctx)
  placeWeapons(ctx)
  placeEcosystem(ctx)
  ctx.extrasPlaced = true
}

/** 组装最终契约对象 */
export function buildRoom(ctx, extra = {}) {
  const { w, h, spec } = ctx
  // 关卡场景：按房间名施工专属地形骨架 + 标志性放置物（只往空气里加结构）
  try {
    applyScene(ctx)
  } catch (e) {
    ctx.notes.push({ type: 'gen-error', where: 'scene', error: String(e && e.message ? e.message : e) })
  }
  // 兜底：保证 3 层站立面 / 2 个竖向通道 / 1 个隐藏壁龛（不移动已有地面）
  let qualityFallback = null
  try {
    qualityFallback = ensureQualityFallback(ctx)
  } catch (e) {
    qualityFallback = { error: String(e) }
  }
  // 兜底：若 biome 没在布置前调 placeExtras，这里补一次（可能空位较少）
  try {
    placeExtras(ctx)
  } catch (e) {
    ctx.notes.push({ type: 'gen-error', where: 'extras', error: String(e && e.message ? e.message : e) })
  }
  // 地面小杂物（纯装饰散布件：碎石 / 纸屑 / 玻璃渣 / 线缆等，按 biome 选池）
  try {
    scatterDebris(ctx)
  } catch (e) {
    ctx.notes.push({ type: 'gen-error', where: 'debris', error: String(e && e.message ? e.message : e) })
  }
  // 兜底：浮空平台必须可到达（孤立平台补爬杆，确实够不着的拆掉）
  try {
    const fixedPlat = ensurePlatformAccess(ctx)
    if (fixedPlat) ctx.notes.push({ type: 'platform-access', fixed: fixedPlat })
  } catch (e) {
    ctx.notes.push({ type: 'gen-error', where: 'platformAccess', error: String(e && e.message ? e.message : e) })
  }
  pruneUnsupported(ctx)
  const spawn = computeSpawn(ctx)
  // 用补杆后的最新可达性清理够不着的物件
  let reach = null
  try {
    reach = reachableSurfaces(ctx)
    ctx.reach = reach
  } catch (e) {
    reach = null
  }
  pruneUnreachable(ctx, reach)
  // 复杂度统计（写进 gen.meta.complexity）
  let complexity = null
  try {
    complexity = computeComplexity(ctx)
  } catch (e) {
    complexity = { error: String(e) }
  }
  const gen = {
    map: ctx.map,
    w,
    h,
    floorY: ctx.floorY,
    ceilY: ctx.ceilY,
    worldW: w * TS,
    worldH: h * TS,
    doorLeft: { x: 1.5 * TS, y: ctx.doorRow.left * TS },
    doorRight: { x: (w - 1.5) * TS, y: ctx.doorRow.right * TS },
    spawn,
    shelter: ctx.shelter,
    exits: { left: ctx.exitLeft, right: ctx.exitRight },
    biome: ctx.biome,
    roomId: spec.id,
    loot: ctx.loot,
    monsters: ctx.monsters,
    props: ctx.props,
    smokeSources: ctx.smokeSources,
    cages: ctx.cages,
    landmarks: ctx.landmarks,
    weapons: ctx.weapons,
    ecosystem: ctx.ecosystem,
    largeEnemies: ctx.largeEnemies,
    dirtyTiles: [],
    // 额外信息（渲染 / 调试用，契约外字段）
    variant: ctx.variant,
    kind: spec.kind || 'standard',
    label: spec.label || spec.id,
    seed: ctx.seed,
    baseFloor: ctx.baseFloor,
    platforms: ctx.platforms,
    poles: ctx.poles,
    shafts: ctx.shafts.map((s) => ({ ...s })),
    pools: ctx.pools.map((p) => ({ ...p })),
    ducts: ctx.ducts.map((d) => ({ ...d })),
    continuityFixes: ctx.continuityFixes,
    dropped: ctx.dropped,
    notes: ctx.notes,
    quality: ctx.quality || null,
    qualityFallback,
    meta: { ...getBiomeMeta(ctx.biome), complexity },
    ...extra,
  }
  return gen
}

// =====================================================================
// 契约自检（check-biomes.mjs 与运行时都能用）
// =====================================================================

/**
 * 校验一间生成的房。返回问题字符串数组（空 = 通过）。
 * 这是生成器的「出厂检查」，与 scripts/check-biomes.mjs 共用同一套判据。
 */
export function validateRoom(gen) {
  const problems = []
  const { map, w, h, floorY, ceilY, spawn, exits } = gen

  // ---- 1. 门洞：6 格高、脚下有地、两侧连通 ----
  const checkDoor = (side) => {
    const open = side === 'left' ? exits.left != null : exits.right != null
    const doorY = (side === 'left' ? gen.doorLeft : gen.doorRight).y
    const row = Math.round(doorY / TS)
    const cols = side === 'left' ? range(0, DOOR_INSET) : range(w - 1 - DOOR_INSET, w - 1)
    if (row < DOOR_H || row >= h - 1) problems.push(`${side} door row out of range: ${row}`)
    if (!open) {
      // 死路：整段应该是墙
      return
    }
    for (const x of cols) {
      for (let y = row - DOOR_H; y < row; y++) {
        const v = map.get(x, y)
        if (v !== T.EMPTY) problems.push(`${side} door not empty at (${x},${y}) = ${v}`)
      }
      if (!standTile(map.get(x, row))) problems.push(`${side} door has no floor at (${x},${row})`)
    }
  }
  checkDoor('left')
  checkDoor('right')

  // ---- 2. 主地面连续 + 脚下有实体 + 头顶不是实体 ----
  let stepViolations = 0
  let floorViolations = 0
  for (let x = 1; x < w; x++) {
    const d = Math.abs(floorY[x] - floorY[x - 1])
    if (d > WALK_STEP) stepViolations++
  }
  for (let x = 0; x < w; x++) {
    const row = floorY[x]
    const v = map.get(x, row)
    if (!standTile(v)) floorViolations++
    const above = map.get(x, row - 1)
    if (solidTile(above)) floorViolations++
    // 净空：至少 3 格
    if (ceilY[x] > row - 3) problems.push(`no headroom at x=${x}`)
  }
  if (stepViolations) problems.push(`step violations: ${stepViolations} (max ${WALK_STEP})`)
  if (floorViolations) problems.push(`floor violations: ${floorViolations}`)

  // ---- 3. 出生点 ----
  const stx = Math.floor(spawn.x / TS)
  const sty = Math.floor(spawn.y / TS)
  if (!standTile(map.get(stx, sty)))
    problems.push('spawn has no ground under it')
  for (let i = 1; i <= 2; i++) {
    if (solidTile(map.get(stx, sty - i))) problems.push(`spawn blocked at -${i}`)
  }

  // ---- 4. 每个实体都有支撑 ----
  const checkList = (name, list) => {
    for (const e of list) {
      const s = supportOf({ map, w, h }, e.x, e.y)
      if (!s.ok) problems.push(`${name} floating: ${e.id || e.kind} @ ${Math.round(e.x / TS)},${Math.round(e.y / TS)}`)
    }
  }
  checkList('loot', gen.loot)
  checkList('prop', gen.props)
  checkList('monster', gen.monsters)
  checkList('cage', gen.cages)
  checkList('landmark', gen.landmarks)
  checkList('weapon', gen.weapons || [])
  checkList('ecosystem', gen.ecosystem || [])
  checkList('largeEnemy', gen.largeEnemies || [])

  // ---- 4b. 新增内容契约：武器 id / 生态点 / 大型敌人 ----
  for (const wp of gen.weapons || []) {
    if (!WEAPON_IDS.includes(wp.id)) problems.push(`unknown weapon id "${wp.id}"`)
  }
  const ecoKinds = (gen.ecosystem || []).map((e) => e.kind)
  for (const k of ecoKinds) if (!ECOSYSTEM_KINDS.includes(k)) problems.push(`unknown ecosystem kind "${k}"`)
  if ((gen.ecosystem || []).length < 3) problems.push(`ecosystem too few: ${(gen.ecosystem || []).length}`)
  if (!ecoKinds.includes('roach')) problems.push('ecosystem missing roach')
  if (!ecoKinds.includes('plant')) problems.push('ecosystem missing plant')
  for (const le of gen.largeEnemies || []) {
    if (!LARGE_ENEMY_IDS.includes(le.id)) problems.push(`unknown largeEnemy id "${le.id}"`)
    if ((gen.shelter && le.roomId === gen.roomId) || (gen.kind || '') === 'shelter')
      problems.push('largeEnemy in shelter room')
    if ((gen.largeEnemies || []).length > 1) problems.push('too many largeEnemies')
    break
  }
  // 武器数量与避难所保底
  const wpCount = (gen.weapons || []).length
  if (wpCount > 3) problems.push(`too many weapons: ${wpCount}`)
  if ((gen.kind || '') === 'shelter' && wpCount < 1) problems.push('shelter room needs >=1 weapon')

  // ---- 4d. 浮空平台必须能从出生点走上去（禁止看得见够不着） ----
  try {
    const reach = reachableSurfaces({ map, w, h, poles: gen.poles || [] }, { spawn })
    let any = false
    for (let i = 0; i < reach.length; i++) if (reach[i]) { any = true; break }
    if (any) {
      for (const p of gen.platforms || []) {
        let ok = false
        for (let x = p.x0; x <= p.x1; x++) {
          if (x < 1 || x >= w) continue
          if (reach[p.row * w + x]) { ok = true; break }
        }
        if (!ok) problems.push(`platform unreachable @ x${p.x0}-${p.x1} row ${p.row}`)
      }
    }
  } catch (e) {
    problems.push(`platform reach check failed: ${e && e.message ? e.message : e}`)
  }

  // ---- 4c. 多层结构：≥3 层可站立面 ----
  const bands = layerBands(gen, 4)
  if (bands.length < 3) problems.push(`only ${bands.length} standable layers (need >=3)`)
  const channels = countChannelsOf(gen)
  if (channels < 2) problems.push(`only ${channels} vertical channels (need >=2)`)
  if (!(gen.notes || []).some((n) => n.type === 'alcove')) problems.push('missing hidden alcove (alcove note)')

  // ---- 5. 牢笼：地面上方且可接近 ----
  for (const c of gen.cages) {
    const cx = Math.floor(c.x / TS)
    const cy = Math.floor(c.y / TS)
    // c.y 是「脚下」的支撑面顶部，所以 (cy) 是地砖、(cy-1) 才是牢笼身体所在格
    if (solidTile(map.get(cx, cy - 1))) problems.push(`cage inside solid @ ${cx},${cy}`)
    if (!standTile(map.get(cx, cy)))
      problems.push(`cage has no ground @ ${cx},${cy}`)
    let air = 0
    for (let i = 1; i <= 3; i++) if (map.get(cx, cy - i) === T.EMPTY) air++
    if (air < 2) problems.push(`cage has no room above @ ${cx},${cy}`)
    if (!flatRun({ floorY, w, h, map, ceilY }, cx, 1)) problems.push(`cage approach blocked @ ${cx}`)
  }

  // ---- 6. 可达性粗检：从出生列 BFS 走遍所有地面列，检查左右门都能到 ----
  const reach = reachableColumns(gen)
  const spawnCol = Math.floor(spawn.x / TS)
  if (!reach[spawnCol]) problems.push('spawn column not reachable (self)')
  if (exits.left != null && !reach[DOOR_INSET]) problems.push('left door unreachable')
  if (exits.right != null && !reach[w - 1 - DOOR_INSET]) problems.push('right door unreachable')
  // 地面上的 loot / prop 是否可达
  for (const e of gen.loot) {
    const col = Math.floor(e.x / TS)
    if (!reach[col] && !e.hidden) problems.push(`loot unreachable: ${e.id} @ col ${col}`)
  }
  for (const c of gen.cages) {
    const col = Math.floor(c.x / TS)
    if (!reach[col]) problems.push(`cage unreachable: ${c.id} @ col ${col}`)
  }
  for (const lm of gen.landmarks) {
    const col = Math.floor(lm.x / TS)
    if (!reach[col]) problems.push(`landmark unreachable: ${lm.id} @ col ${col}`)
  }

  // ---- 7. 字段完整性 ----
  for (const k of ['map', 'w', 'h', 'floorY', 'ceilY', 'worldW', 'worldH', 'doorLeft', 'doorRight', 'spawn', 'exits', 'biome', 'roomId', 'loot', 'monsters', 'props', 'smokeSources', 'cages', 'landmarks', 'weapons', 'ecosystem', 'largeEnemies']) {
    if (gen[k] === undefined) problems.push(`missing field: ${k}`)
  }
  // ---- 8. 怪物数量 5~9（shelter 恒为 0）+ 复杂度统计 ----
  const mc = (gen.monsters || []).length
  const isShelterRoom = (gen.kind || '') === 'shelter'
  if (isShelterRoom && mc !== 0) problems.push(`shelter has ${mc} monsters (need 0)`)
  if (!isShelterRoom && (mc < 5 || mc > 9)) problems.push(`monsters ${mc} out of range 5..9`)
  const cx = gen.meta && gen.meta.complexity
  if (!cx || !cx.tiles) problems.push('missing meta.complexity')
  else if (!(cx.layers >= 3)) problems.push(`meta.complexity.layers=${cx.layers}`)
  return problems
}

/** 主路可达性：按列做 BFS（水可游、平台可跳，净空至少 3 格） */
export function reachableColumns(gen) {
  const { map, w, floorY, ceilY, exits, spawn } = gen
  const alive = new Uint8Array(w)
  for (let x = 0; x < w; x++) {
    const row = floorY[x]
    const v = map.get(x, row)
    if (!standTile(v)) continue
    if (solidTile(map.get(x, row - 1)) || solidTile(map.get(x, row - 2))) continue
    if (ceilY[x] > row - 2) continue
    alive[x] = 1
  }
  const seen = new Uint8Array(w)
  const q = []
  const start = clamp(Math.floor(spawn.x / TS), 0, w - 1)
  if (alive[start]) {
    seen[start] = 1
    q.push(start)
  }
  while (q.length) {
    const x = q.shift()
    for (const dir of [-1, 1]) {
      const nx = x + dir
      if (nx < 0 || nx >= w) continue
      if (seen[nx] || !alive[nx]) continue
      // 台阶超过 WALK_STEP 就过不去（水坑已保证 ≤2；平台桥接另行放宽 1）
      if (Math.abs(floorY[nx] - floorY[x]) > WALK_STEP) continue
      seen[nx] = 1
      q.push(nx)
    }
  }
  return seen
}

// =====================================================================
// 入口
// =====================================================================

const GENERATORS = {
  city: generateCityRoom,
  village: generateVillageRoom,
  factory: generateFactoryRoom,
  dump: generateDumpRoom,
  metro: generateMetroRoom,
  hospital: generateHospitalRoom,
  port: generatePortRoom,
}

/** 补齐 spec 默认值（REGIONS 里给全，这里只是兜底） */
export function normalizeSpec(spec) {
  const s = spec || {}
  const biome = BIOMES.includes(s.biome) ? s.biome : 'city'
  const kind = ROOM_KINDS.includes(s.kind) ? s.kind : 'standard'
  const isShelter = kind === 'shelter'
  return {
    id: s.id || `${biome}_room`,
    label: s.label || s.id || '无名房间',
    biome,
    seed: (s.seed | 0) || 1,
    w: clamp(Math.round(s.w || 112), 96, 160),
    h: clamp(Math.round(s.h || 52), 44, 68),
    kind,
    variant: s.variant || null,
    shelterSide: s.shelterSide || 'left',
    exits: { left: s.exits?.left ?? null, right: s.exits?.right ?? null },
    lootDensity: clamp(s.lootDensity ?? 1, 0.25, 2),
    // shelter 恒为 0 怪，其余 5~9
    monsterCount: isShelter
      ? 0
      : clamp(Math.round(s.monsterCount ?? MONSTER_COUNT[biome] ?? 6), 5, 9),
    landmark: s.landmark || null,
    cage: s.cage || null,
    features: s.features || [],
    notes: s.notes || '',
  }
}

/**
 * 生成一间生态房。
 * spec: { id, seed, biome, w, h, kind, variant, shelterSide, exits, lootDensity, monsterCount, landmark, cage }
 * 返回契约对象（见文件头）。同一 spec 永远得到同一间房。
 */
export function generateBiomeRoom(spec) {
  const s = normalizeSpec(spec)
  const gen = GENERATORS[s.biome]
  if (!gen) throw new Error(`generateBiomeRoom: unknown biome "${s.biome}"`)
  const out = gen(s)
  // 统一钉死约定字段，避免某个 biome 漏填
  out.biome = s.biome
  out.roomId = s.id
  out.exits = { left: s.exits.left, right: s.exits.right }
  out.shelter = out.shelter || null
  out.dirtyTiles = out.dirtyTiles || []
  out.w = s.w
  out.h = s.h
  out.worldW = out.w * TS
  out.worldH = out.h * TS
  // 地标 / 牢笼在 spec 里声明过但生成时被丢弃 —— 记在 notes 里，方便查
  return out
}

export default generateBiomeRoom
