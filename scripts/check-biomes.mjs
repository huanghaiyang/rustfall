// 生态房间生成器自检（120 间房 × N 个 seed 变体）
//
//   node scripts/check-biomes.mjs                 # 汇总 + 失败详情（默认 1 个 seed，快）
//   node scripts/check-biomes.mjs --seeds=3       # 每间房试 3 个 seed 变体
//   node scripts/check-biomes.mjs --ascii         # 额外打印 ASCII 小图（每区前 2 间）
//   node scripts/check-biomes.mjs --room=city_street --ascii
//   node scripts/check-biomes.mjs --perf          # 只跑一遍全量并报告生成耗时
//
// 判定（与 world/biomes/index.js 的 validateRoom 同一套判据）：
//   1. 主地面连续：相邻 floorY 差 ≤2，脚下有实体/平台/泥土，头顶不是实体
//   2. 门洞 6 格高、脚下有地、门里门外连通
//   3. 出生点在空处且离地合理
//   4. 每个 loot / prop / cage / landmark / weapon / ecosystem / largeEnemies 底部有支撑
//   5. 牢笼在地面上方且可接近
//   6. 可达性粗检：从出生列 BFS 左右门可达；二维站面 BFS 检查高台物资够得着
//   7. 结构：≥3 层可站立面、≥2 个竖向通道、≥1 个隐藏壁龛、复杂地形统计
//   8. 内容：怪物 5~9（shelter 恒 0）、武器 0~3（shelter ≥1）、生态点 3~8（roach/plant 各 ≥1）、
//      大型敌人 ≤1 且不在 shelter、meta.complexity 完整
//   9. 尺寸：w 96~160、h 44~68
//  10. 性能：单房生成 < 30ms（预热后计时）
import { T } from '../src/game/world/tilemap.js'
import { TS } from '../src/game/config.js'
import {
  generateBiomeRoom,
  validateRoom,
  reachableColumns,
  reachableSurfaces,
  isSurfaceReachable,
  layerBands,
  countChannels,
  BIOMES,
  BIOME_META,
  WALK_STEP,
  DOOR_INSET,
  WEAPON_IDS,
  ECOSYSTEM_KINDS,
  LARGE_ENEMY_IDS,
} from '../src/game/world/biomes/index.js'
import {
  REGIONS,
  REGION_ORDER,
  regionRoomIds,
  getRoomSpec,
  neighbors,
  validateRegions,
  roomLabel,
  findRoom,
  roomCount,
} from '../src/game/world/regions.js'
import { PROPS } from '../src/game/world/props-data.js'

// 物品 id 直接取内容注册表（catalog.js 顶层注册），避免手抄清单漏项
const { Content, KIND } = await import('../src/game/core/registry.js')
await import('../src/game/loot/catalog.js')
await import('../src/game/loot/lore-artifacts.js')
const ITEM_IDS = new Set(Content.ids(KIND.ITEM))
const MONSTER_IDS = new Set([
  'radboar', 'crawler', 'spitter', 'wingrat', 'sentry', 'scrapper', 'drone', 'hulkbot',
  'ghoul_husk', 'tunnel_hound', 'cyber_mantis', 'psycho_punk',
  'server_wraith', 'weld_brute', 'cult_fanatic', 'alien_orb', 'vault_puppet', 'mine_shade',
  'blood_thrall', 'fog_stalker', 'punk_raider', 'castle_knight', 'rogue_ai',
  'dark_web_ghost', 'viral_wraith', 'nano_swarm',
  'bandit_lookout', 'bandit_looter', 'bandit_scav',
])
const PROP_IDS = new Set(Object.keys(PROPS))
const WEAPON_SET = new Set(WEAPON_IDS)
const ECO_SET = new Set(ECOSYSTEM_KINDS)
const LARGE_SET = new Set(LARGE_ENEMY_IDS)

const argv = process.argv.slice(2)
const WANT_ASCII = argv.includes('--ascii')
const PERF_ONLY = argv.includes('--perf')
const seedArg = argv.find((a) => a.startsWith('--seeds='))
const SEEDS = seedArg ? Math.max(1, parseInt(seedArg.split('=')[1], 10) || 1) : 1
const roomArg = argv.find((a) => a.startsWith('--room='))
const ONLY_ROOM = roomArg ? roomArg.split('=')[1] : null
const asciiArg = argv.find((a) => a.startsWith('--ascii-limit='))
const ASCII_LIMIT = asciiArg ? Math.max(1, parseInt(asciiArg.split('=')[1], 10) || 2) : 2
const quiet = argv.includes('--quiet')
const MAX_MS = 30

let failures = 0
let checks = 0
let generated = 0
const fail = (msg) => {
  failures++
  console.log('  FAIL:', msg)
}

function nextRegionId(rid) {
  const i = REGION_ORDER.indexOf(rid)
  return REGION_ORDER[(i + 1) % REGION_ORDER.length]
}
function prevRegionId(rid) {
  const i = REGION_ORDER.indexOf(rid)
  return REGION_ORDER[(i - 1 + REGION_ORDER.length) % REGION_ORDER.length]
}

// ---------------------------------------------------------------------
// 0. 区域数据自检
// ---------------------------------------------------------------------
console.log('=== 区域拓扑 ===')
const regionProblems = validateRegions()
for (const p of regionProblems) fail(p)
const total = roomCount()
console.log(
  `区域 ${REGION_ORDER.length} 个：` +
    REGION_ORDER.map((r) => `${r}(${regionRoomIds(r).length})`).join(' + ') +
    ` = ${total} 间房，问题 ${regionProblems.length}`,
)
if (total < 120) fail(`房间总数 ${total} < 120`)

const LEGACY = [
  'city_shelter', 'city_street', 'city_plaza', 'city_slum', 'city_tower', 'city_gate',
  'village_shelter', 'village_field', 'village_house', 'village_well', 'village_barn', 'village_gate',
  'factory_shelter', 'factory_line', 'factory_hall', 'factory_furnace', 'factory_control', 'factory_gate',
  'dump_shelter', 'dump_pit', 'dump_mountain', 'dump_crane', 'dump_core', 'dump_gate',
]
for (const id of LEGACY) {
  checks++
  if (!findRoom(id)) fail(`老房间 ${id} 丢了`)
}

const wanted = {
  relay_a: 'city_tower',
  relay_b: 'village_well',
  relay_c: 'factory_control',
  antenna_signal: 'dump_core',
  generator_city: 'city_plaza',
  generator_village: 'village_barn',
  generator_factory: 'factory_hall',
  generator_dump: 'dump_pit',
}
for (const [lm, room] of Object.entries(wanted)) {
  checks++
  const spec = getRoomSpec(room)
  if (!spec || spec.landmark !== lm) fail(`地标 ${lm} 未声明在 ${room}`)
}

// ---------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------
function asciiOf(gen) {
  const sym = {
    [T.EMPTY]: ' ',
    [T.SOLID]: '#',
    [T.PLATFORM]: '=',
    [T.WATER]: '~',
    [T.POLE]: '|',
    [T.CRACKED]: 'x',
    [T.SOIL]: ':',
    [T.TOXIC]: '%',
  }
  const marks = new Map()
  const put = (x, y, ch) => {
    const key = `${Math.floor(x / 32)},${Math.floor(y / 32)}`
    if (!marks.has(key)) marks.set(key, ch)
  }
  for (const l of gen.loot) put(l.x, l.y - 6, '*')
  for (const m of gen.monsters) put(m.x, m.y - 6, 'm')
  for (const w of gen.weapons || []) put(w.x, w.y - 6, 'w')
  for (const e of gen.ecosystem || []) put(e.x, e.y - 6, 'e')
  for (const c of gen.cages) put(c.x, c.y - 6, 'C')
  for (const l of gen.landmarks) put(l.x, l.y - 6, 'L')
  for (const p of gen.props) put(p.x, p.y - 6, '.')
  put(gen.spawn.x, gen.spawn.y - 6, '@')
  let art = ''
  for (let y = 0; y < gen.h; y++) {
    let line = ''
    for (let x = 0; x < gen.w; x++) {
      const m = marks.get(`${x},${y}`)
      line += m ?? sym[gen.map.get(x, y)] ?? '?'
    }
    art += line + '\n'
  }
  return art
}

function checkContract(gen, spec) {
  const need = [
    'map', 'w', 'h', 'floorY', 'ceilY', 'worldW', 'worldH', 'doorLeft', 'doorRight',
    'spawn', 'shelter', 'exits', 'biome', 'roomId', 'loot', 'monsters', 'props',
    'smokeSources', 'cages', 'landmarks', 'weapons', 'ecosystem', 'largeEnemies',
  ]
  checks++
  for (const k of need) if (gen[k] === undefined) fail(`${spec.id}: 缺契约字段 ${k}`)
  if (gen.roomId !== spec.id) fail(`${spec.id}: roomId=${gen.roomId}`)
  if (gen.biome !== spec.biome) fail(`${spec.id}: biome=${gen.biome}`)
  if (gen.w !== spec.w || gen.h !== spec.h) fail(`${spec.id}: w/h 与 spec 不一致`)
  if (gen.worldW !== spec.w * TS || gen.worldH !== spec.h * TS) fail(`${spec.id}: worldW/H 不对`)
  if (!(gen.w >= 96 && gen.w <= 160)) fail(`${spec.id}: w=${gen.w} 不在 96~160`)
  if (!(gen.h >= 44 && gen.h <= 68)) fail(`${spec.id}: h=${gen.h} 不在 44~68`)
  if (spec.kind === 'shelter' && !gen.shelter) fail(`${spec.id}: shelter 房没有 shelter 坐标`)
  if (spec.kind !== 'shelter' && gen.shelter) fail(`${spec.id}: 非 shelter 房却给了 shelter`)
  for (const l of gen.loot) if (!ITEM_IDS.has(l.id)) fail(`${spec.id}: 未知 item id "${l.id}"`)
  for (const m of gen.monsters) if (!MONSTER_IDS.has(m.id)) fail(`${spec.id}: 未知 monster id "${m.id}"`)
  for (const p of gen.props) if (!PROP_IDS.has(p.kind)) fail(`${spec.id}: 未知 prop kind "${p.kind}"`)
  for (const w of gen.weapons) if (!WEAPON_SET.has(w.id)) fail(`${spec.id}: 未知 weapon id "${w.id}"`)
  for (const e of gen.ecosystem) if (!ECO_SET.has(e.kind)) fail(`${spec.id}: 未知生态点 kind "${e.kind}"`)
  for (const le of gen.largeEnemies) if (!LARGE_SET.has(le.id)) fail(`${spec.id}: 未知 largeEnemy "${le.id}"`)
  for (const s of gen.smokeSources) {
    if (!(s.radius > 0) || !(s.intensity > 0)) fail(`${spec.id}: smokeSource 参数非法`)
  }
  const cx = gen.meta && gen.meta.complexity
  checks++
  if (!cx) fail(`${spec.id}: 缺 meta.complexity`)
  else {
    for (const k of ['solid', 'cracked', 'soil', 'water', 'toxic', 'platform', 'pole']) {
      if (typeof cx.tiles[k] !== 'number') fail(`${spec.id}: complexity.tiles.${k} 缺失`)
    }
    if (!(cx.layers >= 3)) fail(`${spec.id}: complexity.layers=${cx.layers} < 3`)
    if (!(cx.channels >= 2)) fail(`${spec.id}: complexity.channels=${cx.channels} < 2`)
  }
}

function surfaceStats(gen) {
  let steps = 0
  let floorBad = 0
  let headBad = 0
  for (let x = 1; x < gen.w; x++) if (Math.abs(gen.floorY[x] - gen.floorY[x - 1]) > WALK_STEP) steps++
  for (let x = 0; x < gen.w; x++) {
    const row = gen.floorY[x]
    const v = gen.map.get(x, row)
    if (v !== T.SOLID && v !== T.PLATFORM && v !== T.CRACKED && v !== T.SOIL) floorBad++
    if (gen.map.get(x, row - 1) === T.SOLID) headBad++
  }
  return { steps, floorBad, headBad }
}

function supportStats(gen) {
  let floating = 0
  const all = [
    ...gen.loot.map((e) => ['loot', e]),
    ...gen.props.map((e) => ['prop', e]),
    ...gen.monsters.map((e) => ['monster', e]),
    ...gen.cages.map((e) => ['cage', e]),
    ...gen.landmarks.map((e) => ['landmark', e]),
    ...gen.weapons.map((e) => ['weapon', e]),
    ...gen.ecosystem.map((e) => ['ecosystem', e]),
    ...gen.largeEnemies.map((e) => ['largeEnemy', e]),
  ]
  for (const [, e] of all) {
    const tx = Math.floor(e.x / TS)
    const ty = Math.floor(e.y / TS)
    const g = gen.map.groundBelow(e.x, e.y + 2, TS * 4)
    const near = g != null && g - e.y <= 10
    const wet =
      gen.map.isWater(tx, ty) ||
      gen.map.isWater(tx, ty + 1) ||
      gen.map.isToxic(tx, ty) ||
      gen.map.isToxic(tx, ty + 1)
    const ledge = g != null && g - e.y <= TS * 3
    if (!(near || wet || ledge)) floating++
    if (ty < 0 || ty >= gen.h) floating++
  }
  return { floating, total: all.length }
}

// ---------------------------------------------------------------------
// 房间清单
// ---------------------------------------------------------------------
const rooms = []
for (const rid of REGION_ORDER) {
  for (const roomId of regionRoomIds(rid)) {
    if (ONLY_ROOM && roomId !== ONLY_ROOM) continue
    rooms.push({ rid, roomId, spec: REGIONS[rid].rooms[roomId] })
  }
}

if (PERF_ONLY) {
  console.log(`\n=== 性能（预热 + ${rooms.length} 间）===`)
  for (const r of rooms.slice(0, Math.min(8, rooms.length))) generateBiomeRoom(r.spec)
  let worst = { id: '', ms: 0 }
  let sum = 0
  for (const r of rooms) {
    const t0 = performance.now()
    generateBiomeRoom(r.spec)
    const ms = performance.now() - t0
    sum += ms
    if (ms > worst.ms) worst = { id: r.roomId, ms }
  }
  console.log(`  ${rooms.length} 间，平均 ${(sum / rooms.length).toFixed(1)}ms，最慢 ${worst.id} ${worst.ms.toFixed(1)}ms`)
  if (worst.ms >= MAX_MS) {
    console.log(`\n${worst.id} 超过 ${MAX_MS}ms`)
    process.exit(1)
  }
  console.log('\nALL OK —— 性能达标')
  process.exit(0)
}

console.log(`\n=== 房间生成（${rooms.length} 间 × ${SEEDS} seed 变体）===`)
const biomeTally = Object.fromEntries(
  BIOMES.map((b) => [b, { rooms: 0, loot: 0, props: 0, monsters: 0, weapons: 0, eco: 0, layers: 0 }]),
)

// 预热（不计时不判定，JIT 上来了真实耗时才有意义）
for (const r of rooms.slice(0, Math.min(8, rooms.length))) {
  try {
    generateBiomeRoom(r.spec)
  } catch (e) {
    /* 正式轮会报 */
  }
}

const perfRows = []
const perRegionAscii = {}

for (const { rid, roomId, spec } of rooms) {
  const rows = []
  for (let k = 0; k < SEEDS; k++) {
    const seed = k === 0 ? spec.seed : (spec.seed + k * 7919) >>> 0
    let gen
    const t0 = performance.now()
    try {
      gen = generateBiomeRoom({ ...spec, seed })
      generated++
    } catch (err) {
      fail(`${roomId}[seed ${seed}]: 生成抛异常 ${err && err.stack ? err.stack.split('\n')[0] : err}`)
      continue
    }
    const ms = performance.now() - t0
    perfRows.push({ id: roomId, seed, ms })
    checks++
    checkContract(gen, spec)
    for (const p of validateRoom(gen)) fail(`${roomId}[seed ${seed}]: ${p}`)
    const st = surfaceStats(gen)
    const sup = supportStats(gen)
    const reach = reachableColumns(gen)
    const reach2 = reachableSurfaces(gen)
    const near = (e) => isSurfaceReachable(reach2, Math.floor(e.x / TS), Math.floor(e.y / TS))
    const farLoot = gen.loot.filter((l) => !near(l))
    const farExtra =
      gen.weapons.filter((w) => !near(w)).length + gen.ecosystem.filter((e) => !near(e)).length
    const farCages = gen.cages.filter((c) => !near(c))
    const spawnCol = Math.floor(gen.spawn.x / TS)
    const reachOk =
      !!reach[spawnCol] &&
      (gen.exits.left == null || !!reach[DOOR_INSET]) &&
      (gen.exits.right == null || !!reach[gen.w - 1 - DOOR_INSET])
    const layers = layerBands(gen, 4).length
    const channels = countChannels(gen)
    const isShelter = spec.kind === 'shelter'
    const wpCount = gen.weapons.length
    const ecoKinds = gen.ecosystem.map((e) => e.kind)

    rows.push({
      seed,
      ms,
      w: gen.w,
      h: gen.h,
      steps: st.steps,
      floating: sup.floating,
      reachOk,
      layers,
      channels,
      loot: gen.loot.length,
      props: gen.props.length,
      monsters: gen.monsters.length,
      weapons: wpCount,
      eco: gen.ecosystem.length,
      large: gen.largeEnemies.length,
      cages: gen.cages.length,
      landmarks: gen.landmarks.length,
      smoke: gen.smokeSources.length,
      gen,
    })

    // ---- 断言 ----
    checks++
    if (st.steps) fail(`${roomId}[seed ${seed}]: step 违规 ${st.steps}`)
    if (st.floorBad) fail(`${roomId}[seed ${seed}]: 地面缺失 ${st.floorBad}`)
    if (st.headBad) fail(`${roomId}[seed ${seed}]: 头顶是实体 ${st.headBad}`)
    if (sup.floating) fail(`${roomId}[seed ${seed}]: 悬空物 ${sup.floating}`)
    if (!reachOk) fail(`${roomId}[seed ${seed}]: 左右门不可达`)
    if (layers < 3) fail(`${roomId}[seed ${seed}]: 站立层 ${layers} < 3`)
    if (channels < 2) fail(`${roomId}[seed ${seed}]: 竖向通道 ${channels} < 2`)
    if (!(gen.notes || []).some((n) => n.type === 'alcove')) fail(`${roomId}[seed ${seed}]: 没有隐藏壁龛`)
    if (gen.monsters.length < (isShelter ? 0 : 5)) fail(`${roomId}[seed ${seed}]: 怪物 ${gen.monsters.length} < 5`)
    if (gen.monsters.length > 9) fail(`${roomId}[seed ${seed}]: 怪物 ${gen.monsters.length} > 9`)
    if (isShelter && gen.monsters.length !== 0) fail(`${roomId}[seed ${seed}]: shelter 不该有怪`)
    if (wpCount > 3) fail(`${roomId}[seed ${seed}]: 武器 ${wpCount} > 3`)
    if (isShelter && wpCount < 1) fail(`${roomId}[seed ${seed}]: shelter 需要保底 1 把武器`)
    if (gen.ecosystem.length < 3) fail(`${roomId}[seed ${seed}]: 生态点 ${gen.ecosystem.length} < 3`)
    if (gen.ecosystem.length > 8) fail(`${roomId}[seed ${seed}]: 生态点 ${gen.ecosystem.length} > 8`)
    if (!ecoKinds.includes('roach')) fail(`${roomId}[seed ${seed}]: 生态点缺 roach`)
    if (!ecoKinds.includes('plant')) fail(`${roomId}[seed ${seed}]: 生态点缺 plant`)
    if (gen.largeEnemies.length > 1) fail(`${roomId}[seed ${seed}]: 大型敌人 > 1`)
    if (isShelter && gen.largeEnemies.length) fail(`${roomId}[seed ${seed}]: shelter 不该有大型敌人`)
    for (const le of gen.largeEnemies) {
      if (le.roomId !== spec.id) fail(`${roomId}[seed ${seed}]: largeEnemy.roomId 不对`)
    }
    if (spec.landmark && !gen.landmarks.some((l) => l.id === spec.landmark))
      fail(`${roomId}[seed ${seed}]: 地标 ${spec.landmark} 没生成`)
    if (spec.cage && !gen.cages.some((c) => c.id === spec.cage.id))
      fail(`${roomId}[seed ${seed}]: 牢笼 ${spec.cage.id} 没生成`)
    if (farCages.length) fail(`${roomId}[seed ${seed}]: 牢笼够不着 ${farCages.length}`)
    if (farLoot.length > 1) fail(`${roomId}[seed ${seed}]: 够不着的物资 ${farLoot.length}`)
    if (farExtra > 1) fail(`${roomId}[seed ${seed}]: 够不着的武器/生态点 ${farExtra}`)
    if (ms >= MAX_MS) fail(`${roomId}[seed ${seed}]: 生成 ${ms.toFixed(1)}ms ≥ ${MAX_MS}ms`)

    const t = biomeTally[spec.biome]
    t.rooms++
    t.loot += gen.loot.length
    t.props += gen.props.length
    t.monsters += gen.monsters.length
    t.weapons += gen.weapons.length
    t.eco += gen.ecosystem.length
    t.layers += layers
  }

  if (!quiet && rows.length) {
    const first = rows[0]
    const flags = rows
      .map((r) => `[${r.steps}/${r.floating}/${r.reachOk ? 'ok' : 'BAD'}/${r.layers}L/${r.ms.toFixed(0)}ms]`)
      .join(' ')
    console.log(
      `  ${roomId.padEnd(22)} ${roomLabel(rid, roomId).padEnd(7)} ` +
        `${String(first.w).padStart(3)}x${String(first.h).padStart(2)} ` +
        `loot=${String(first.loot).padStart(2)} prop=${String(first.props).padStart(2)} ` +
        `mon=${first.monsters} wp=${first.weapons} eco=${first.eco} le=${first.large} ` +
        `cage=${first.cages} lm=${first.landmarks} smoke=${first.smoke}  ${flags}`,
    )
  }
  if (WANT_ASCII && rows.length) {
    const printed = perRegionAscii[rid] || 0
    if (printed < ASCII_LIMIT) {
      perRegionAscii[rid] = printed + 1
      console.log(`\n--- ${roomId} (${spec.label} · ${spec.variant}) ${rows[0].w}x${rows[0].h} ---`)
      console.log(asciiOf(rows[0].gen))
    }
  }
}

// ---------------------------------------------------------------------
// 邻居 / 世界线
// ---------------------------------------------------------------------
console.log('\n=== 世界线 ===')
let brokenLinks = 0
for (const rid of REGION_ORDER) {
  const chain = regionRoomIds(rid)
  for (let i = 0; i < chain.length; i++) {
    const nb = neighbors(rid, chain[i])
    checks++
    const expectLeft = i > 0 ? chain[i - 1] : REGIONS[prevRegionId(rid)].exitRoom
    if (nb.left !== expectLeft) {
      brokenLinks++
      fail(`${chain[i]}.left=${nb.left}，应为 ${expectLeft}`)
    }
    const expectRight = i < chain.length - 1 ? chain[i + 1] : REGIONS[nextRegionId(rid)].entryRoom
    if (nb.right !== expectRight) {
      brokenLinks++
      fail(`${chain[i]}.right=${nb.right}，应为 ${expectRight}`)
    }
  }
  console.log(`  ${rid.padEnd(9)} ${String(chain.length).padStart(2)} 间  ${brokenLinks === 0 ? '链路闭合' : '有断点'}`)
}

let crossDoorMismatch = 0
for (const rid of REGION_ORDER) {
  for (const roomId of regionRoomIds(rid)) {
    const spec = REGIONS[rid].rooms[roomId]
    const right = spec.exits?.right
    if (!right) continue
    const a = generateBiomeRoom(spec)
    const other = findRoom(right)
    if (!other) continue
    const b = generateBiomeRoom(other.spec)
    if (Math.abs(a.doorRight.y - b.doorLeft.y) > 2 * TS) crossDoorMismatch++
  }
}
console.log(`  跨房间门高度差 >2 格：${crossDoorMismatch} 对（只提示，不影响可玩性）`)

// ---------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------
console.log('\n=== 汇总 ===')
console.log(`  区域 ${REGION_ORDER.length} 个，房间 ${total} 间；生成 ${generated} 次（${rooms.length} 间 × ${SEEDS} seed）`)
for (const b of BIOMES) {
  const t = biomeTally[b]
  if (!t.rooms) continue
  const meta = BIOME_META[b]
  console.log(
    `  ${b.padEnd(9)} ${meta.name}  样本 ${String(t.rooms).padStart(3)} 间  平均 loot ${(t.loot / t.rooms).toFixed(1)} ` +
      `prop ${(t.props / t.rooms).toFixed(1)} 怪 ${(t.monsters / t.rooms).toFixed(1)} ` +
      `武器 ${(t.weapons / t.rooms).toFixed(1)} 生态 ${(t.eco / t.rooms).toFixed(1)} 层 ${(t.layers / t.rooms).toFixed(1)}`,
  )
}
if (perfRows.length) {
  const ms = perfRows.map((r) => r.ms).sort((a, b) => a - b)
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length
  const p95 = ms[Math.floor(ms.length * 0.95)] || ms[ms.length - 1]
  console.log(`  生成耗时：平均 ${avg.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms  最慢 ${ms[ms.length - 1].toFixed(1)}ms`)
}
console.log(`  检查项：${checks}，失败：${failures}`)
if (failures === 0) {
  console.log(`\nALL OK —— ${total} 间房全部通过自检`)
  process.exit(0)
} else {
  console.log(`\n${failures} FAILURES`)
  process.exit(1)
}
