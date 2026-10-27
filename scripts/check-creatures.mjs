// 大型敌人 + 生态系统自检（node scripts/check-creatures.mjs）
//
// 在 Node 里跑真实逻辑，只把「需要 Canvas / DOM 的美术模块」stub 掉：
//   ../render/art/monsters.js  → getMonsterArt / getLargeMonsterArt 返回 null（走色块兜底）
//   ../render/art/props.js     → 道具贴图返回 null
//   ../render/art/chassis.js   → 机体贴图返回 null
//   ../render/art/eco.js       → 生态贴图返回 null
// 其余全部是仓库里的真实代码（base.js / director.js / large/*.js / ecosystem/index.js）。

import { registerHooks } from 'node:module'

const encoder = new TextEncoder()
const stub = (src) => 'data:text/javascript,' + encodeURIComponent(src)

const STUBS = [
  [
    /\/render\/art\/monsters\.js$/,
    `export function getMonsterArt() { return null }
export function getLargeMonsterArt() { return null }
export const MONSTER_ART_IDS = []
export function preloadArt() {}
export function clearMonsterCache() {}`,
  ],
  [
    /\/render\/art\/props\.js$/,
    `export function getPropArt() { return null }
export function getPropSize() { return { w: 90, h: 50 } }
export const PROP_ART_KINDS = []
export function preloadArt() {}
export function clearPropCache() {}`,
  ],
  [
    /\/render\/art\/chassis\.js$/,
    `export function getChassisArt() { return null }
export const CHASSIS_ART_IDS = []
export function preloadArt() {}`,
  ],
  [
    /\/render\/art\/eco\.js$/,
    `export function getEcoArt() { return null }
export function clearEcoCache() {}`,
  ],
  [
    /\/render\/art\/world\.js$/,
    `export function getBiomeArt() { return null }
export function getSmokeArt() { return null }
export function getAshArt() { return null }
export function getRainArt() { return null }`,
  ],
  [
    /\/render\/art\/atmosphere\.js$/,
    `export function getGlowArt() { return null }
export function getDustArt() { return null }
export function getSmokeArt() { return null }`,
  ],
  [
    /\/render\/art\/items\.js$/,
    `export function getItemArt() { return null }
export function getCategoryIcon() { return null }`,
  ],
]

let stubbed = false
try {
  registerHooks({
    resolve(spec, context, nextResolve) {
      const r = nextResolve(spec, context)
      for (const [re, src] of STUBS) {
        if (re.test(r.url)) return { url: stub(src), shortCircuit: true }
      }
      return r
    },
  })
  stubbed = true
} catch (e) {
  console.warn('[check] registerHooks 不可用（Node < 22.15），美术模块可能触碰 DOM：', e.message)
}

// ---------------------------------------------------------------------------
// 载入真实模块（在 registerHooks 之后，必须用动态 import）
// ---------------------------------------------------------------------------
const THREE = await import('three')
const { Tilemap, T } = await import('../src/game/world/tilemap.js')
const { TS } = await import('../src/game/config.js')
const { Content, KIND } = await import('../src/game/core/registry.js')
const { Events } = await import('../src/game/core/events.js')
await import('../src/game/loot/catalog.js') // 注册全部物品，用于校验掉落 id
const { createMonsterDirector, MAX_ALIVE, MAX_LARGE_ALIVE } = await import(
  '../src/game/entities/monsters/director.js'
)
const large = await import('../src/game/entities/monsters/large/index.js')
const { createEcosystem, MAX_ECO_ENTITIES } = await import('../src/game/ecosystem/index.js')

// ---------------------------------------------------------------------------
// 假引擎
// ---------------------------------------------------------------------------
const W = 92
const H = 30
const GROUND_ROW = 24
const map = new Tilemap(W, H, T.EMPTY)
for (let x = 0; x < W; x++) for (let y = GROUND_ROW; y < H; y++) map.set(x, y, T.SOLID)
const floorY = new Int16Array(W).fill(GROUND_ROW)
const floor = GROUND_ROW * TS

const roomData = {
  roomId: 'check_room',
  id: 'check_room',
  biome: 'city',
  kind: 'standard',
  seed: 0x1234ab,
  map,
  floorY,
  worldW: W * TS,
  worldH: H * TS,
  shelter: null,
  spawn: { x: 20 * TS, y: floor },
  monsters: [],
  largeEnemies: [
    { id: 'junk_golem', x: 40 * TS },
    { id: 'sky_warden', x: 66 * TS },
  ],
  ecosystem: [
    { kind: 'roach', x: 30 * TS, n: 5 },
    { kind: 'plant', x: 52 * TS, n: 2 },
    { kind: 'rat', x: 60 * TS, n: 1 },
  ],
}

const scene = new THREE.Group()
const room = { data: roomData, map, group: new THREE.Group(), lootDrops: [] }
roomData.data = roomData

const drops = []
const damageTaken = []
const toasts = []
const robot = {
  dead: false,
  invuln: 0,
  hp: 100000,
  energy: 100,
  facing: 1,
  swingT: 0,
  crouching: false,
  tool: { id: 'pickaxe', cooldown: 0.42 },
  body: { x: 20 * TS, y: floor - 32, w: 22, h: 32, vx: 0 },
  get centerX() {
    return this.body.x + this.body.w / 2
  },
  get centerY() {
    return this.body.y + this.body.h / 2
  },
  takeDamage(n) {
    damageTaken.push(n)
    this.hp -= n
  },
  drainEnergy(n) {
    this.energy = Math.max(0, this.energy - n)
  },
}

const game = {
  scene,
  room,
  robot,
  particles: { emit() {}, emitMany() {} },
  sfx() {},
  shake() {},
  cameraShake() {},
  roomW: W * TS,
  roomH: H * TS,
  notify(text) {
    toasts.push(text)
  },
  dropLoot(itemId, x, y) {
    drops.push(itemId)
    return {
      itemId,
      x,
      y,
      hidden: false,
      picked: false,
      buried: false,
      group: { visible: true },
      setVisibleState() {},
    }
  },
  damageArea(x, y, radius, dmg) {
    const d = Math.hypot(robot.centerX - x, robot.centerY - y)
    if (d < radius) robot.takeDamage(dmg)
  },
  settleMonsterKill() {},
}

// ---------------------------------------------------------------------------
// 断言工具
// ---------------------------------------------------------------------------
let failures = 0
let checks = 0
function check(cond, label, extra = '') {
  checks++
  if (cond) {
    console.log('  ok   ' + label + (extra ? '  ' + extra : ''))
  } else {
    failures++
    console.log('  FAIL ' + label + (extra ? '  ' + extra : ''))
  }
}

const ALLOWED_LARGE = ['junk_golem', 'sky_warden', 'mimic_beast', 'swarm_core']
const itemIds = new Set(Content.ids(KIND.ITEM))
function invalidDropIds(list) {
  return list.filter((id) => !itemIds.has(id))
}

const spawnedEvents = []
const deadEvents = []
Events.on('large:spawn', (p) => spawnedEvents.push(p))
Events.on('large:dead', (p) => deadEvents.push(p))

// ---------------------------------------------------------------------------
// 1. 注册与索引
// ---------------------------------------------------------------------------
console.log('\n== 注册 / 索引 ==')
check(large.LARGE_IDS.length === 4, 'LARGE_IDS 有 4 种', large.LARGE_IDS.join(','))
check(ALLOWED_LARGE.every((id) => large.isLarge(id)), 'isLarge 识别全部 4 种')
check(!large.isLarge('radboar'), 'isLarge 不把小怪当大怪')
check(MAX_ALIVE === 10, 'MAX_ALIVE = 10', String(MAX_ALIVE))
check(MAX_LARGE_ALIVE === 2, 'MAX_LARGE_ALIVE = 2', String(MAX_LARGE_ALIVE))
for (const id of ALLOWED_LARGE) {
  const def = large.largeDef(id)
  check(
    !!def && def.elite === true && def.hp > 0 && def.damage > 0 && Array.isArray(def.loot) && def.loot.length > 0,
    `${id} DEF 完整（elite / hp / damage / loot）`,
  )
  const [w, h] = def.size || [0, 0]
  check(w >= 96 && w <= 220 && h >= 90 && h <= 220, `${id} 尺寸 ${w}×${h} 在 96~220 区间`)
  const badLoot = def.loot.filter((l) => !itemIds.has(l.id))
  check(badLoot.length === 0, `${id} 掉落 id 全部已注册`, badLoot.map((b) => b.id).join(','))
}
check(itemIds.size > 70, `物品注册表 ${itemIds.size} 条`)

// ---------------------------------------------------------------------------
// 2. 刷怪导演：大型敌人
// ---------------------------------------------------------------------------
console.log('\n== director: 大型敌人 ==')
const dir = createMonsterDirector(game)
check(game.director === dir, 'director 已挂到 game.director')
check(large.largeIdsForBiome('city').length > 0, 'city 有可用大型敌人')

dir.populate(roomData)
const big = dir.largeList
check(dir.largeAliveCount() === 2, '按 largeEnemies 刷出 2 只大型', String(dir.largeAliveCount()))
check(
  big.every((m) => large.isLarge(m.id)),
  'largeList 里都是大型敌人',
  big.map((m) => m.id).join(','),
)
check(spawnedEvents.length === 2, "emit 'large:spawn' ×2", String(spawnedEvents.length))
check(
  big.every((m) => Array.isArray(m.patrol) && m.patrol.length >= 1),
  '大型敌人拿到了巡逻点',
)
check(
  dir.list.some((m) => m.id === 'junk_golem') && dir.list.some((m) => m.id === 'sky_warden'),
  '大型敌人也在 director.list 里（玩家挥击打得中）',
)
check(dir.aliveCount() <= MAX_ALIVE, `小怪存活 ${dir.aliveCount()} ≤ ${MAX_ALIVE}`)
check(
  dir.stats.smallCap <= MAX_ALIVE - 2,
  `大型在场时小怪上限降到 ${dir.stats.smallCap}`,
)

// 跑 600 帧：玩家在房间里徘徊，打生态、偶尔挨打
robot.body.x = 34 * TS
let frameError = null
const frameDt = 1 / 60
for (let i = 0; i < 600; i++) {
  try {
    robot.swingT = Math.max(0, robot.swingT - frameDt)
    if (i % 40 === 0) robot.swingT = 0.26 // 模拟挥击（生态采集）
    if (i % 90 === 0) robot.body.x = (22 + ((i * 0.37) % 60)) * TS
    dir.update(frameDt)
  } catch (err) {
    frameError = err
    break
  }
}
check(!frameError, '600 帧 update 无异常', frameError ? frameError.stack : '')
check(dir.largeAliveCount() === 2, '大型敌人 600 帧后仍存活', String(dir.largeAliveCount()))

// 击杀全部大型 → 掉落 + large:dead
drops.length = 0
for (const m of [...dir.largeList]) {
  try {
    m.takeDamage(999999, m.px)
  } catch (err) {
    check(false, `击杀 ${m.id} 抛错`, err.message)
  }
}
  // 天穹守望者会先坠落再爆炸，等死亡演出跑完
  for (let i = 0; i < 400; i++) dir.update(frameDt)
check(deadEvents.length === 2, "emit 'large:dead' ×2", String(deadEvents.length))
check(drops.length >= 4, `大型死亡掉落 ${drops.length} 件`)
check(invalidDropIds(drops).length === 0, '大型掉落 id 全部合法', invalidDropIds(drops).join(','))
check(dir.largeList.length === 0, '大型尸体在数秒后移除', String(dir.largeList.length))

// 上限
const manyLarge = {
  ...roomData,
  largeEnemies: [
    { id: 'junk_golem', x: 20 * TS },
    { id: 'sky_warden', x: 30 * TS },
    { id: 'mimic_beast', x: 40 * TS },
    { id: 'swarm_core', x: 50 * TS },
  ],
}
spawnedEvents.length = 0
dir.populate(manyLarge)
check(dir.largeAliveCount() <= MAX_LARGE_ALIVE, `大型上限生效：${dir.largeAliveCount()} ≤ ${MAX_LARGE_ALIVE}`)
check(spawnedEvents.length <= MAX_LARGE_ALIVE, 'spawn 事件数量与上限一致', String(spawnedEvents.length))

// 未知 id / 兜底
dir.clear()
const beforeUnknown = dir.largeAliveCount()
const unknown = dir.spawnLarge('not_a_monster', 30 * TS, floor)
check(unknown === null && dir.largeAliveCount() === beforeUnknown, '未知大型 id 返回 null（不崩）')

// 世界生成器还没提供 largeEnemies 时，director 按 biome 兜底（0~2 只）
dir.clear()
const noLargeData = { ...roomData }
delete noLargeData.largeEnemies
dir.populate(noLargeData)
check(
  dir.largeAliveCount() <= MAX_LARGE_ALIVE,
  `没有 largeEnemies 时按 biome 兜底刷 ${dir.largeAliveCount()} 只（≤${MAX_LARGE_ALIVE}）`,
)
check(dir.list.length > 0, '兜底房间仍然刷出了生物', String(dir.list.length))

// ---------------------------------------------------------------------------
// 3. 庇护所不刷
// ---------------------------------------------------------------------------
console.log('\n== shelter 不刷 ==')
const shelterData = {
  ...roomData,
  roomId: 'shelter_room',
  kind: 'shelter',
  shelter: { x: 12 * TS, y: floor },
  largeEnemies: [{ id: 'junk_golem', x: 40 * TS }],
  ecosystem: [{ kind: 'roach', x: 30 * TS, n: 5 }],
}
spawnedEvents.length = 0
const ecoCountBefore = dir.ecosystem ? dir.ecosystem.entities.length : 0
dir.populate(shelterData)
check(dir.largeAliveCount() === 0, '庇护所不刷大型敌人', String(dir.largeAliveCount()))
check(dir.list.length === 0, '庇护所不刷小怪', String(dir.list.length))
check(spawnedEvents.length === 0, '庇护所没有 large:spawn 事件')
const ecoNow = dir.ecosystem ? dir.ecosystem.entities.length : 0
check(ecoNow === 0, '庇护所不刷生态', `${ecoCountBefore} → ${ecoNow}`)
check(ecoNow <= MAX_ECO_ENTITIES, `生态实体 ${ecoNow} ≤ ${MAX_ECO_ENTITIES}`)

// ---------------------------------------------------------------------------
// 4. 生态系统：内容 / 上限 / 交互
// ---------------------------------------------------------------------------
console.log('\n== ecosystem ==')
dir.populate(roomData)
const eco = dir.ecosystem
check(!!eco, 'director.ecosystem 存在')
check(game.ecosystem === eco, 'game.ecosystem 指向同一个实例')
check(eco && eco.entities.length > 0, `生态刷出 ${eco ? eco.entities.length : 0} 个实体`)
check(eco && eco.entities.length <= MAX_ECO_ENTITIES, `生态实体 ≤ ${MAX_ECO_ENTITIES}`)
const kinds = new Set((eco?.entities || []).map((e) => e.kind))
check(kinds.has('roach') && kinds.has('plant') && kinds.has('nest'), '包含 roach / plant / nest', [...kinds].join(','))
const st = eco.stats()
check(st.roaches >= 3 && st.plants >= 1, `stats roaches=${st.roaches} plants=${st.plants} critters=${st.critters}`)
check(typeof eco.damageAt === 'function', '导出 damageAt（引擎可主动采集）')

// 蟑螂搬废料：往地上塞一块 scrap_plate
const nest = eco.entities.find((e) => e.kind === 'nest')
if (nest) {
  room.lootDrops.push({
    itemId: 'scrap_plate',
    x: nest.x + 40,
    y: nest.y - 8,
    picked: false,
    hidden: false,
    buried: false,
    group: { visible: true },
  })
}
for (let i = 0; i < 1200; i++) dir.update(frameDt) // 20 秒
const carried = (nest && nest.stock.length) || 0
const lootPicked = room.lootDrops.some((l) => l.picked)
check(carried > 0 || lootPicked, `蟑螂搬回废料：巢内 ${carried} 件 / 地上已被取走=${lootPicked}`)
check(eco.entities.length <= MAX_ECO_ENTITIES, `长时间运行后生态实体 ${eco.entities.length} ≤ 40`)

// 玩家挥击：打植物 → 掉纤维（合法 id）
const plant = eco.entities.find((e) => e.kind === 'plant' && e.alive)
if (plant) {
  robot.body.x = plant.x - 30
  robot.body.y = plant.y - 32
  robot.facing = 1
  drops.length = 0
  eco.damageAt(robot.centerX, robot.centerY, 70, 30, { facing: 1 })
  check(!plant.alive || plant.hp < plant.maxHp, '植物可被采伐')
  check(drops.length > 0, `采伐掉落 ${drops.length} 件`)
  check(invalidDropIds(drops).length === 0, '采伐掉落 id 合法', invalidDropIds(drops).join(','))
}

// 拆巢 → 掉落物资
if (nest) {
  const scrapBefore = nest.stock.length
  drops.length = 0
  eco.damageAt(nest.x, nest.y - 10, 60, 999, { fromX: nest.x - 30 })
  check(!nest.alive, '巢可被拆掉')
  check(drops.length >= 1, `拆巢掉落 ${drops.length} 件（存量 ${scrapBefore}）`)
  check(invalidDropIds(drops).length === 0, '拆巢掉落 id 合法', invalidDropIds(drops).join(','))
}

// 击杀 critter → raw_meat / chitin（解析后的合法 id）
const critter = eco.entities.find((e) => (e.kind === 'fly' || e.kind === 'rat') && e.alive)
if (critter) {
  drops.length = 0
  critter.takeDamage(999)
  check(!critter.alive, `${critter.kind} 可被击杀`)
  check(drops.length === 1, `${critter.kind} 掉落 ${drops.length} 件`)
  check(invalidDropIds(drops).length === 0, 'critter 掉落 id 合法', invalidDropIds(drops).join(','))
} else {
  check(true, '本次没有 critter 可测（跳过）')
}

// 物品兜底：fiber/seed_pod/raw_meat/chitin 不在 catalog 时降级
const fiberId = eco.itemId('fiber', 'carbon_fiber', 'cloth')
check(!!fiberId && itemIds.has(fiberId), `fiber 解析为合法 id：${fiberId}`)
const seedId = eco.itemId('seed_pod', 'carbon_fiber', 'chemical')
check(!!seedId && itemIds.has(seedId), `seed_pod 解析为合法 id：${seedId}`)
const chitinId = eco.itemId('chitin', 'rubber', 'scrap_plate')
check(!!chitinId && itemIds.has(chitinId), `chitin 解析为合法 id：${chitinId}`)

dir.clear()
check(dir.list.length === 0 && eco.entities.length === 0, 'clear() 同时清空怪物与生态')

// ---------------------------------------------------------------------------
// 5. 独立创建 ecosystem（不依赖 director）
// ---------------------------------------------------------------------------
console.log('\n== ecosystem 独立使用 ==')
const solo = createEcosystem(game)
const n = solo.populate({ ...roomData, ecosystem: [{ kind: 'plant', x: 40 * TS, n: 2 }] })
check(n === 2, `独立 populate 出 ${n} 株植物`)
for (let i = 0; i < 300; i++) solo.update(frameDt)
check(solo.entities.length === 2, '300 帧后植物仍在')
solo.clear()
check(solo.entities.length === 0, '独立 clear()')

// ---------------------------------------------------------------------------
// 6. 四种大型敌人逐一实例化：600 帧 + 核心机制
// ---------------------------------------------------------------------------
console.log('\n== 4 大怪逐一实例化 ==')
dir.clear()
drops.length = 0

function placeRobot(x) {
  robot.dead = false
  robot.invuln = 0
  robot.hp = 100000
  robot.body.x = x
  robot.body.y = floor - 32
  robot.body.vx = 0
  robot.swingT = 0
}

function runMonster(m, frames, onFrame) {
  let err = null
  for (let i = 0; i < frames; i++) {
    try {
      robot.swingT = Math.max(0, robot.swingT - frameDt)
      m.update(frameDt)
      if (onFrame) onFrame(i)
    } catch (e) {
      err = e
      break
    }
  }
  return err
}

// --- junk_golem：拆腿 → 趴下 → 处决 ---
{
  const m = large.createLargeMonster(game, 'junk_golem', 40 * TS, floor)
  check(!!m, 'junk_golem 实例化')
  placeRobot(40 * TS + 300)
  let sawWindup = false
  const err = runMonster(m, 600, () => {
    if (m.state === 'throwWind' || m.state === 'slamWind') sawWindup = true
  })
  check(!err, 'junk_golem 600 帧无异常', err ? err.message : '')
  check(sawWindup, 'junk_golem 有可读前摇（抡击/投掷）')
  check(m.parts.length === 3, 'junk_golem 背上有 3 个可拆部件')
  const leg = m.legs[0]
  const legX = m.px + leg.side * m.w * 0.34
  m.takeDamage(80, legX)
  check(leg.broken, 'junk_golem 腿部被打断')
  check(m.state === 'downed', 'junk_golem 断腿后趴下（可处决）')
  const hp0 = m.hp
  m.takeDamage(10, m.px)
  check(Math.abs(hp0 - m.hp - 22) < 0.01, '趴下时受到 2.2 倍伤害', String(hp0 - m.hp))
  m.takeDamage(999999, m.px)
  check(!m.alive, 'junk_golem 可被击杀')
  runMonster(m, 30)
  m.dispose()
}

// --- sky_warden：预警激光 → 召唤 drone → 过载坠落 ---
{
  const m = large.createLargeMonster(game, 'sky_warden', 50 * TS, floor - 220)
  check(!!m, 'sky_warden 实例化')
  placeRobot(50 * TS - 250)
  let sawAim = false
  const err = runMonster(m, 600, () => {
    if (m.state === 'aim' || m.state === 'dipFire') sawAim = true
  })
  check(!err, 'sky_warden 600 帧无异常', err ? err.message : '')
  check(sawAim, 'sky_warden 有激光预警阶段（0.8s）')
  const drones = dir.list.filter((d) => d.id === 'drone')
  check(drones.length > 0, 'sky_warden 通过 director.spawn 召唤了 drone', String(drones.length))

  m.hp = m.maxHp * 0.45
  m.takeDamage(1, m.px)
  check(m.overload === true, '血量 50% 后进入过载模式')
  let sawOverheat = false
  const err2 = runMonster(m, 700, () => {
    if (m.overheated) sawOverheat = true
  })
  check(!err2, 'sky_warden 过载状态 700 帧无异常', err2 ? err2.message : '')
  check(sawOverheat, 'sky_warden 过热坠落（可被近战打到）')
  m.takeDamage(999999, m.px)
  runMonster(m, 400)
  check(!m.alive, 'sky_warden 坠落后爆炸死亡')
  m.dispose()
}

// --- mimic_beast：伪装 → 靠近/扫描现形 → 拟态骗攻击 ---
{
  const m = large.createLargeMonster(game, 'mimic_beast', 30 * TS, floor)
  check(!!m, 'mimic_beast 实例化')
  check(!m.revealed, 'mimic_beast 初始是伪装状态')
  check(!!m.disguiseMesh && m.disguiseMesh.visible === true && m.mesh.visible === false, 'mimic 用道具贴图伪装本体')
  placeRobot(m.px - 40)
  runMonster(m, 60)
  check(m.revealed === true, '玩家进入 90px → 现形')

  const m2 = large.createLargeMonster(game, 'mimic_beast', 80 * TS, floor)
  placeRobot(m2.px - 120)
  Events.emit('scan:done', { loot: [], props: [], landmarks: [], cages: [] })
  check(m2.revealed === true, '扫描仪可识破伪装')
  m2.dispose()

  placeRobot(m.px + 220)
  let sawMimic = false
  let mimicBlocked = false
  const err = runMonster(m, 500, () => {
    if (m.state === 'mimic' && !sawMimic) {
      sawMimic = true
      const hp = m.hp
      m.takeDamage(60, m.px)
      mimicBlocked = m.hp === hp
    }
  })
  check(!err, 'mimic_beast 500 帧无异常', err ? err.message : '')
  check(sawMimic, 'mimic_beast 会拟态成玩家机体外形')
  check(mimicBlocked, '拟态期间攻击打空（骗攻击）')
  if (m.mimicInvuln) m._endMimic()
  m.takeDamage(999999, m.px)
  check(!m.alive, 'mimic_beast 可被击杀')
  runMonster(m, 30)
  m.dispose()
}

// --- swarm_core：无敌本体 → 清小怪 → 暴露 6 秒 → 击杀连锁倒地 ---
{
  const m = large.createLargeMonster(game, 'swarm_core', 60 * TS, floor)
  check(!!m, 'swarm_core 实例化')
  placeRobot(60 * TS - 200)
  const err = runMonster(m, 600)
  check(!err, 'swarm_core 600 帧无异常', err ? err.message : '')
  check(m.brood.size > 0, 'swarm_core 持续产出 crawler', String(m.brood.size))

  const hp0 = m.hp
  m.takeDamage(120, m.px)
  check(m.hp === hp0, '闭壳时本体完全无敌')

  const broodList = [...m.brood]
  for (const b of broodList) {
    try {
      b.takeDamage(999999, m.px)
    } catch (e) {
      /* ignore */
    }
  }
  runMonster(m, 10)
  check(m.exposed === true, '小怪全清 → 核心暴露（6 秒窗口）')
  const hp1 = m.hp
  m.takeDamage(10, m.px)
  check(m.hp < hp1, '暴露期间可以被伤害', String(hp1 - m.hp))

  m.takeDamage(999999, m.px)
  check(!m.alive, 'swarm_core 可被击杀')
  check(broodList.every((b) => !b.alive), '击杀核心后所有小怪倒地')
  runMonster(m, 30)
  m.dispose()
}

dir.clear()

// ---------------------------------------------------------------------------
// 7. 引擎式集成：ecosystemFactory 存在时 director 只负责 update / 认领实例
// ---------------------------------------------------------------------------
console.log('\n== 引擎式 ecosystem 集成 ==')
{
  delete game.ecosystem
  game.ecosystemFactory = createEcosystem
  const dir2 = createMonsterDirector(game)
  check(dir2.ecosystem === null, '引擎持有 ecosystemFactory 时 director 不自己创建生态')
  dir2.populate(roomData)
  // 模拟引擎 loadRoom：在 director.populate 之后 new 一个 ecosystem 并 populate
  const engineEco = game.ecosystemFactory(game)
  game.ecosystem = engineEco
  engineEco.populate(roomData)
  const before = engineEco.stats().total
  check(before > 0, `引擎自己生成的生态实体 ${before} 个`)
  check(dir2.ecosystem === engineEco, 'director 立刻能读到引擎实例')
  // 引擎自己 update（game.js:619）：director 不应重复推进
  const probe = engineEco.entities.find((e) => e.alive) || engineEco.entities[0]
  const t0 = probe ? probe.t : 0
  for (let i = 0; i < 120; i++) {
    dir2.update(frameDt)
    engineEco.update(frameDt)
  }
  check(probe && probe.t > t0, '引擎自己的 ecosystem.update 推进了生态', String((probe?.t || 0) - t0))
  // 关掉开关 → director 代为 update（兼容只创建不 update 的精简引擎）
  game.ecosystemTickedByEngine = false
  const t1 = probe ? probe.t : 0
  for (let i = 0; i < 30; i++) dir2.update(frameDt)
  check(probe && probe.t > t1, 'ecosystemTickedByEngine=false 时 director 代为 update', String((probe?.t || 0) - t1))
  delete game.ecosystemTickedByEngine
  check(engineEco.stats().total >= 1, '生态仍然存活')
  check(
    typeof engineEco.stats === 'function' && typeof engineEco.stats().total === 'number',
    'stats() 返回 {total}，与引擎 game.js:369 的用法一致',
  )
  dir2.clear()
  check(engineEco.entities.length === 0, 'director.clear() 会清空引擎生态')
  delete game.ecosystemFactory
  delete game.ecosystem
  game.ecosystem = dir.ecosystem
}

// ---------------------------------------------------------------------------
console.log(`\n结果：${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}（${checks} 项断言，stub=${stubbed}）`)
process.exit(failures === 0 ? 0 : 1)
