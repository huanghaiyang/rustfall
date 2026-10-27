#!/usr/bin/env node
// 武器系统自检：数据注册表 + 兼容矩阵 + WeaponSystem 运行时（stub game）+ 掉落表。
// 运行：node scripts/check-weapons.mjs
// 退出码：0 = 全部通过；1 = 有失败项。
// 依赖：只用项目内模块（不新增 npm 依赖），无网络、无 DOM。
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { Content, KIND } from '../src/game/core/registry.js'
import '../src/game/chassis/index.js' // 注册 8 台机体：compatMatrix / canEquip 需要真实 carry/family
import { G } from '../src/game/state.js'
import { makeRng } from '../src/game/render/rng.js'
import {
  WEAPON_IDS,
  AMMO_IDS,
  allWeapons,
  allAmmo,
  getWeapon,
  getAmmo,
  weaponClassOf,
  ammoForWeapon,
  ammoFallbackOf,
  weaponArtHint,
  cooldownOf,
  reloadTimeOf,
  compatMatrix,
  chassisHitbox,
  chassisFrame,
  validateWeaponData,
} from '../src/game/weapons/data.js'
import { WeaponSystem, createWeaponSystem } from '../src/game/weapons/runtime.js'
import { Inventory } from '../src/game/loot/inventory.js'
import {
  WEAPON_LOOT_TABLES,
  WEAPON_DROP_CHANCE,
  WEAPON_LOOT_SUGGESTIONS,
  WEAPON_AMMO_BUNDLES,
  normalizeBiome,
  weaponLootEntriesOf,
  weaponDropChance,
  rollWeaponTable,
  rollWeaponForRoom,
  rollWeaponDropForRoom,
  rollAmmoForWeapon,
  rollWeaponKit,
  validateWeaponLoot,
} from '../src/game/weapons/loot.js'

// ---------------------------------------------------------------------------
// 断言 / 报告
// ---------------------------------------------------------------------------
const results = []
let failed = 0

function group(name) {
  results.push({ kind: 'group', name })
}

function check(name, fn) {
  try {
    fn()
    results.push({ kind: 'ok', name })
  } catch (err) {
    failed++
    results.push({ kind: 'fail', name, message: err && err.message ? err.message : String(err) })
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || 'assertEq'}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
}

function assertNear(actual, expected, eps = 1e-6, msg = '') {
  if (!(Math.abs(actual - expected) <= eps)) throw new Error(`${msg}: got ${actual}, want ${expected}`)
}

function hasChinese(s) {
  return typeof s === 'string' && /[\u4e00-\u9fa5]/.test(s)
}

const WEAPON_LIST = [
  'laser_pistol',
  'laser_rifle',
  'semi_pistol',
  'iron_pipe',
  'dagger',
  'hammer',
  'shock_baton',
  'nailgun',
  'scrap_launcher',
  'arc_emitter',
  'rail_spike',
  'wrench_heavy',
]
const AMMO_LIST = ['ammo_9mm', 'ammo_laser', 'ammo_nail', 'ammo_scrap', 'ammo_arc', 'ammo_rail']
const CHASSIS_LIST = ['unit7', 'tesla', 'agibot', 'atlas', 'spider', 'mule', 'ghost', 'hulk']

// ---------------------------------------------------------------------------
// Stub 引擎
// ---------------------------------------------------------------------------
class StubInventory {
  constructor(items = {}) {
    this.items = new Map()
    for (const [k, v] of Object.entries(items)) this.items.set(k, v)
  }
  count(id) {
    return this.items.get(id) || 0
  }
  add(id, n = 1) {
    this.items.set(id, this.count(id) + n)
    return n
  }
  remove(id, n = 1) {
    const have = this.count(id)
    const take = Math.max(0, Math.min(have, n))
    this.items.set(id, have - take)
    return take
  }
  set(id, n) {
    this.items.set(id, n)
  }
  has(id, n = 1) {
    return this.count(id) >= n
  }
}

class StubMonster {
  constructor(x, y, hp = 100) {
    this.px = x
    this.py = y
    this.hp = hp
    this.maxHp = hp
    this.alive = true
    this.dead = false
    this.w = 32
    this.h = 32
    this.body = { vx: 0, vy: 0 }
    this.hits = []
  }
  takeDamage(n, fromX = null) {
    if (!this.alive) return
    this.hp -= n
    this.hits.push({ n, fromX })
    if (this.hp <= 0) this.alive = false
  }
}

function makeGame(opts = {}) {
  const inv = opts.inventory || new StubInventory()
  const monsters = opts.monsters || []
  const robot = opts.robot || { centerX: 100, centerY: 100, facing: 1, dead: false, w: 22, h: 32 }
  const calls = { spawnProjectile: 0, shake: 0, sfx: [], damageArea: null, particles: 0 }
  const projectiles = []
  const game = {
    robot,
    inventory: inv,
    director: opts.noDirector ? null : { list: monsters },
    projectiles,
    spawnProjectile(spec = {}) {
      calls.spawnProjectile++
      const p = {
        x: spec.x,
        y: spec.y,
        vx: spec.vx,
        vy: spec.vy,
        damage: spec.damage,
        radius: spec.radius,
        life: spec.life,
        gravity: spec.gravity,
        color: spec.color,
        mesh: { parent: {} },
        onHit: spec.onHit || null,
        onLand: spec.onLand || null,
      }
      projectiles.push(p)
      return p
    },
    damageArea(x, y, r, d) {
      calls.damageArea = { x, y, r, d }
    },
    particles: {
      emitMany() {
        calls.particles++
      },
    },
    sfx(name, o) {
      calls.sfx.push({ name, o })
    },
    shake(a) {
      calls.shake += a
    },
    cameraShake(a) {
      calls.shake += a
    },
  }
  return { game, inv, monsters, robot, calls, projectiles }
}

function withChassis(id, fn) {
  const prev = G.chassisId
  try {
    G.chassisId = id
    return fn()
  } finally {
    G.chassisId = prev
  }
}

function makeWeapons(game) {
  return new WeaponSystem(game)
}

// ===========================================================================
// 1. 数据注册表
// ===========================================================================
group('1 数据注册表')

check('validateWeaponData() 通过', () => {
  const v = validateWeaponData()
  assert(v.ok, `errors: ${v.errors.slice(0, 8).join(' | ')}`)
})

check('12 把武器全部注册且 category/slot/stack 正确', () => {
  assertEq(allWeapons().length, 12, 'weapon count')
  for (const id of WEAPON_LIST) {
    const def = getWeapon(id)
    assert(def, `missing weapon ${id}`)
    assertEq(def.category, 'weapon', `${id}.category`)
    assertEq(def.slot, 'weapon', `${id}.slot`)
    assertEq(def.stack, 1, `${id}.stack`)
    assertEq(def.class === 'melee' || def.class === 'ranged', true, `${id}.class`)
    assert(Content.has(KIND.ITEM, id), `${id} not in registry`)
  }
})

check('6 种弹药全部注册且 stack=60', () => {
  assertEq(allAmmo().length, 6, 'ammo count')
  assertEq(AMMO_IDS.length, 6, 'AMMO_IDS length')
  for (const id of AMMO_LIST) {
    const def = getAmmo(id)
    assert(def, `missing ammo ${id}`)
    assertEq(def.category, 'ammo', `${id}.category`)
    assertEq(def.stack, 60, `${id}.stack`)
    assert(def.weight > 0, `${id}.weight`)
    assert(def.value >= 0, `${id}.value`)
    assert(Content.has(KIND.ITEM, id), `${id} not in registry`)
  }
})

check('必用 id 清单与注册表一致', () => {
  for (const id of [...WEAPON_LIST, ...AMMO_LIST]) {
    assert(Content.has(KIND.ITEM, id), `missing registered item ${id}`)
  }
})

check('伤害/射速区间：近战 14–40，远程 6–45，射速 0.8–6', () => {
  for (const w of allWeapons()) {
    if (w.class === 'melee') assert(w.damage >= 14 && w.damage <= 40, `${w.id} melee damage ${w.damage}`)
    else assert(w.damage >= 6 && w.damage <= 45, `${w.id} ranged damage ${w.damage}`)
    assert(w.rate >= 0.8 && w.rate <= 6, `${w.id} rate ${w.rate}`)
    assert(w.range > 0, `${w.id} range`)
  }
})

check('远程武器弹药映射正确', () => {
  const expect = {
    laser_pistol: 'ammo_laser',
    laser_rifle: 'ammo_laser',
    semi_pistol: 'ammo_9mm',
    nailgun: 'ammo_nail',
    scrap_launcher: 'ammo_scrap',
    arc_emitter: 'ammo_arc',
    rail_spike: 'ammo_rail',
  }
  for (const [id, ammo] of Object.entries(expect)) {
    assertEq(ammoForWeapon(id), ammo, `${id} ammoType`)
    assertEq(getAmmo(ammo).id, ammo, `${ammo} exists`)
  }
  for (const w of allWeapons()) {
    if (w.class === 'melee') assertEq(ammoForWeapon(w.id), null, `${w.id} melee should have no ammo`)
  }
})

check('武器辅助函数（cooldown/reload/art/class）', () => {
  assertNear(cooldownOf('rail_spike'), 1 / 0.9, 1e-9, 'rail cooldown')
  assertNear(reloadTimeOf('laser_pistol'), 1.1, 1e-9, 'laser pistol reload')
  assertEq(weaponClassOf('dagger'), 'melee', 'dagger class')
  assertEq(weaponClassOf('scrap_plate'), null, 'non-weapon class')
  assertEq(weaponArtHint('laser_rifle'), 'laser_rifle', 'art hint')
  assertEq(weaponArtHint('scrap_plate'), 'weapon', 'fallback art hint')
  assertEq(ammoFallbackOf('laser_pistol').id, 'cell_small', 'laser fallback')
  assertEq(ammoFallbackOf('iron_pipe'), null, 'melee fallback')
})

// ===========================================================================
// 2. 兼容矩阵
// ===========================================================================
group('2 机体兼容')

check('compatMatrix 覆盖 12×8，且不兼容时给出中文 reason', () => {
  const m = compatMatrix()
  assertEq(Object.keys(m).length, 12, 'weapon rows')
  for (const id of WEAPON_LIST) {
    assert(m[id], `missing row ${id}`)
    assertEq(Object.keys(m[id]).length, 8, `${id} chassis cols`)
    for (const cid of CHASSIS_LIST) {
      const cell = m[id][cid]
      assert(typeof cell.ok === 'boolean', `${id}/${cid}.ok`)
      if (!cell.ok) assert(hasChinese(cell.reason), `${id}/${cid} reason not Chinese: ${cell.reason}`)
    }
  }
})

check('白名单约束（任务书指定的四组）', () => {
  const m = compatMatrix()
  for (const cid of ['unit7', 'tesla', 'atlas', 'ghost']) {
    assert(m.laser_rifle[cid].ok, `laser_rifle should fit ${cid}`)
    assert(m.rail_spike[cid].ok, `rail_spike should fit ${cid}`)
  }
  for (const cid of ['atlas', 'hulk', 'mule']) {
    assert(m.hammer[cid].ok, `hammer should fit ${cid}`)
    assert(m.wrench_heavy[cid].ok, `wrench_heavy should fit ${cid}`)
  }
  for (const cid of ['ghost', 'spider', 'unit7']) {
    assert(m.dagger[cid].ok, `dagger should fit ${cid}`)
  }
  for (const cid of ['tesla', 'agibot', 'atlas']) {
    assert(m.arc_emitter[cid].ok, `arc_emitter should fit ${cid}`)
  }
  // 反向断言
  assert(!m.hammer.unit7.ok, 'hammer should not fit unit7')
  assert(!m.dagger.hulk.ok, 'dagger should not fit hulk')
  assert(!m.arc_emitter.unit7.ok, 'arc_emitter should not fit unit7')
  assert(m.iron_pipe.hulk.ok, 'iron_pipe is universal')
  assert(m.semi_pistol.ghost.ok, 'semi_pistol is universal')
})

check('canEquip 跟随 G.chassisId 切换', () => {
  const { game } = makeGame()
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    assertEq(ws.canEquip('hammer').ok, false, 'unit7 hammer')
    assert(hasChinese(ws.canEquip('hammer').reason), 'reason Chinese')
    assertEq(ws.canEquip('laser_rifle').ok, true, 'unit7 laser_rifle')
    assertEq(ws.canEquip('laser_pistol').ok, true, 'unit7 laser_pistol')
  })
  withChassis('atlas', () => {
    assertEq(ws.canEquip('hammer').ok, true, 'atlas hammer')
    assertEq(ws.canEquip('scrap_launcher').ok, true, 'atlas launcher')
  })
  withChassis('ghost', () => {
    assertEq(ws.canEquip('scrap_launcher').ok, false, 'ghost launcher')
    assertEq(ws.canEquip('rail_spike').ok, true, 'ghost rail_spike')
  })
  withChassis('spider', () => {
    assertEq(ws.canEquip('dagger').ok, true, 'spider dagger')
    assertEq(ws.canEquip('wrench_heavy').ok, false, 'spider wrench')
  })
})

check('canEquip 对未知/非武器 id 返回中文原因', () => {
  const { game } = makeGame()
  const ws = makeWeapons(game)
  assertEq(ws.canEquip('no_such_weapon').ok, false, 'unknown weapon')
  assert(hasChinese(ws.canEquip('no_such_weapon').reason), 'unknown reason Chinese')
  assertEq(ws.canEquip('scrap_plate').ok, false, 'non-weapon item')
  assert(hasChinese(ws.canEquip('scrap_plate').reason), 'non-weapon reason Chinese')
})

check('hitbox 门槛：重武器读取机体 hitbox[0]', () => {
  assertEq(chassisHitbox('atlas')[0], 24, 'atlas hitbox w')
  assertEq(chassisHitbox('mule')[0], 20, 'mule hitbox w')
  assertEq(chassisHitbox('no_such_chassis').length, 0, 'unknown chassis hitbox')
  const f = chassisFrame('ghost')
  assertEq(f.carry, 0.85, 'ghost carry')
  assertEq(f.hitbox[0], 20, 'ghost hitbox')
  assert(f.abilities.includes('nightVision'), 'ghost abilities')
  // hammer minHitbox=20：白名单机体都在门槛之上（mule 刚好 20）
  for (const cid of ['atlas', 'hulk', 'mule']) {
    assert(compatMatrix().hammer[cid].ok, `hammer should fit ${cid} (hitbox)`)
  }
})

// ===========================================================================
// 3. 远程：装备 / 自动换弹 / 开火 / 冷却
// ===========================================================================
group('3 远程武器')

check('equip → 自动换弹 → 弹匣装满 → 开火参数正确', () => {
  const inv = new StubInventory({ laser_pistol: 1, ammo_laser: 8 })
  const { game, calls, projectiles } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    const r = ws.equip('laser_pistol')
    assertEq(r.ok, true, 'equip ok')
    assertEq(ws.reloading, true, 'auto reload started')
    assertEq(ws.mag, 0, 'mag starts empty')

    ws.update(1.2) // reload 1.1s
    assertEq(ws.reloading, false, 'reload finished')
    assertEq(ws.mag, 8, 'mag full')
    assertEq(ws.ammoReserve(), 0, 'ammo consumed from inventory')

    const f = ws.fire()
    assertEq(f.ok, true, 'fire ok')
    assertEq(calls.spawnProjectile, 1, 'spawnProjectile called once')
    assertEq(projectiles.length, 1, 'one projectile')
    const p = projectiles[0]
    assertEq(p.x, 124, 'muzzle x = centerX + facing*24')
    assertEq(p.y, 94, 'muzzle y = centerY - 6')
    assert(p.vx > 0, 'velocity direction')
    assertEq(p.damage, 0, 'engine damage must be 0 (WeaponSystem resolves hits)')
    assertEq(p.radius, 4, 'projectile radius')
    assertEq(p.life, 1.1, 'projectile life')
    assertEq(ws.mag, 7, 'mag decremented')
    assertEq(ws.state().ammo, 7, 'state ammo')
  })
})

check('冷却：连按第二发返回中文原因', () => {
  const inv = new StubInventory({ laser_pistol: 1, ammo_laser: 8 })
  const { game, calls } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_pistol')
    ws.update(2)
    assertEq(ws.fire().ok, true, 'first shot')
    const before = calls.spawnProjectile
    const second = ws.fire()
    assertEq(second.ok, false, 'second shot blocked')
    assert(second.reason.includes('冷却'), `reason: ${second.reason}`)
    assertEq(calls.spawnProjectile, before, 'no extra projectile')
    ws.update(0.5)
    assertEq(ws.fire().ok, true, 'after cooldown')
  })
})

check('弹匣打空：有备弹 → 自动换弹；无备弹 → 中文原因', () => {
  const inv = new StubInventory({ semi_pistol: 1, ammo_9mm: 4 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('semi_pistol')
    assertEq(ws.reloading, true, 'auto reload')
    ws.update(2)
    assertEq(ws.mag, 4, 'loaded 4 (only 4 in bag)')

    // 打空并留 1 发备弹 → 自动换弹
    inv.set('ammo_9mm', 1)
    let guard = 0
    while (ws.mag > 0 && guard++ < 20) {
      const r = ws.fire()
      assertEq(r.ok, true, `shot while mag ${ws.mag}`)
      ws.update(0.3)
    }
    assertEq(ws.reloading, true, 'auto reload started after last round')
    ws.update(2)
    assertEq(ws.mag, 1, 'auto reload loaded 1 round')
    assertEq(ws.reloading, false, 'reload finished')

    // 再打空，背包彻底没弹药
    inv.set('ammo_9mm', 0)
    ws.mag = 0
    const empty = ws.fire()
    assertEq(empty.ok, false, 'empty fire blocked')
    assertEq(empty.reason, '没有弹药了', `reason: ${empty.reason}`)
    const reload = ws.reload()
    assertEq(reload.ok, false, 'reload with no ammo')
    assertEq(reload.reason, '没有弹药了', `reload reason: ${reload.reason}`)
  })
})

check('弹匣空但有备弹：提示按 R 换弹', () => {
  const inv = new StubInventory({ laser_pistol: 1, ammo_laser: 5 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_pistol')
    ws.update(2)
    // 弹匣打空，但背包里还有备弹 → 应提示换弹而不是「没有弹药」
    inv.set('ammo_laser', 3)
    ws.mag = 0
    const r = ws.fire()
    assertEq(r.ok, false, 'blocked')
    assertEq(r.reason, '弹匣空了，按 R 换弹', `reason: ${r.reason}`)
  })
})

check('reload 分支：满弹匣 / 近战 / 中途取消', () => {
  const inv = new StubInventory({ laser_pistol: 1, ammo_laser: 8, iron_pipe: 1 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_pistol')
    ws.update(2)
    assertEq(ws.reload().reason, '弹匣是满的', 'full mag')

    ws.update(2)
    ws.fire()
    assertEq(ws.mag, 7, 'fired one')
    inv.set('ammo_laser', 2) // 补一点备弹，才能换 1 发
    const r = ws.reload()
    assertEq(r.ok, true, 'reload one round')
    // 取消换弹应把子弹退回背包
    const before = inv.count('ammo_laser')
    ws.unequip()
    assertEq(inv.count('ammo_laser'), before + 1, 'cancelled reload refunds rounds')

    assertEq(ws.equip('iron_pipe').ok, true, 'equip melee')
    assertEq(ws.reload().ok, false, 'melee reload blocked')
    assertEq(ws.reload().reason, '这件武器不需要换弹', 'melee reload reason')
  })
})

check('激光武器可用 cell_small 折算换弹', () => {
  const inv = new StubInventory({ laser_pistol: 1, cell_small: 2 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_pistol')
    assertEq(ws.reloading, true, 'fallback reload started')
    ws.update(2)
    assertEq(ws.mag, 8, 'two cells -> 12 rounds, capped at 8')
    assertEq(inv.count('cell_small'), 0, 'cells consumed')
    assertEq(ws.ammoReserve(), 0, 'no reserve left')
  })
})

// ===========================================================================
// 4. 近战
// ===========================================================================
group('4 近战武器')

check('近战命中前方怪物：伤害 + 击退 + 抖动', () => {
  const inv = new StubInventory({ iron_pipe: 1 })
  const monster = new StubMonster(140, 100, 100)
  const { game, calls } = makeGame({ inventory: inv, monsters: [monster] })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    assertEq(ws.equip('iron_pipe').ok, true, 'equip')
    const r = ws.fire()
    assertEq(r.ok, true, 'fire ok')
    assertEq(r.kind, 'melee', 'melee kind')
    assertEq(r.hits, 1, 'one hit')
    assertEq(monster.hp, 82, '18 damage')
    assert(monster.body.vx > 0, 'knockback applied')
    assertNear(calls.shake, 0.12, 1e-9, 'shake amount')
    assert(calls.sfx.some((s) => s.name === 'hurt'), 'hit sfx')
  })
})

check('近战不命中身后 / 远处目标', () => {
  const inv = new StubInventory({ iron_pipe: 1 })
  const behind = new StubMonster(60, 100, 100)
  const far = new StubMonster(400, 100, 100)
  const { game } = makeGame({ inventory: inv, monsters: [behind, far] })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('iron_pipe')
    const r = ws.fire()
    assertEq(r.ok, true, 'swing ok')
    assertEq(r.hits, 0, 'no hits')
    assertEq(behind.hp, 100, 'behind untouched')
    assertEq(far.hp, 100, 'far untouched')
  })
})

check('无 director 时回退 damageArea（单测路径）', () => {
  const inv = new StubInventory({ iron_pipe: 1 })
  const { game, calls } = makeGame({ inventory: inv, noDirector: true })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('iron_pipe')
    const r = ws.fire()
    assertEq(r.ok, true, 'fire ok')
    assertEq(r.hits, 0, 'no director => no direct hits')
    assert(calls.damageArea, 'damageArea fallback called')
    assertEq(calls.damageArea.d, 18, 'fallback damage')
    assertNear(calls.damageArea.x, 100 + 48 * 0.6, 1e-9, 'fallback x')
  })
})

check('近战冷却（hammer 1.1/s）', () => {
  const inv = new StubInventory({ hammer: 1 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('atlas', () => {
    ws.equip('hammer')
    assertEq(ws.fire().ok, true, 'first swing')
    assertEq(ws.fire().ok, false, 'blocked by cooldown')
    ws.update(0.9)
    assertEq(ws.fire().ok, false, 'still cooling')
    ws.update(0.2)
    assertEq(ws.fire().ok, true, 'ready again')
  })
})

// ===========================================================================
// 5. 不兼容机体
// ===========================================================================
group('5 不兼容机体')

check('不兼容时 equip 拒绝并给中文原因', () => {
  const inv = new StubInventory({ hammer: 1 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    const r = ws.equip('hammer')
    assertEq(r.ok, false, 'equip blocked')
    assert(hasChinese(r.reason), `reason: ${r.reason}`)
    assertEq(ws.weaponId, null, 'weapon not set')
  })
})

check('装备后切换机体：fire/update 被拦截', () => {
  const inv = new StubInventory({ hammer: 1 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('atlas', () => {
    assertEq(ws.equip('hammer').ok, true, 'atlas equip ok')
  })
  withChassis('unit7', () => {
    const r = ws.fire()
    assertEq(r.ok, false, 'fire blocked after chassis switch')
    assert(hasChinese(r.reason), 'reason Chinese')
    const st = ws.state()
    assertEq(st.compatible, false, 'state.compatible false')
    assert(hasChinese(st.reason), 'state reason Chinese')
    ws.setHolding(true)
    ws.update(0.5)
    assertEq(ws.shotCount, 0, 'no auto fire while incompatible')
    ws.setHolding(false)
  })
})

check('背包里没有武器时 equip 拒绝', () => {
  const inv = new StubInventory({ ammo_laser: 4 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    const r = ws.equip('laser_pistol')
    assertEq(r.ok, false, 'blocked')
    assert(hasChinese(r.reason), 'reason Chinese')
  })
})

// ===========================================================================
// 6. 弹道命中结算
// ===========================================================================
group('6 弹道命中')

check('在飞弹药命中怪物并只结算一次', () => {
  const inv = new StubInventory({ laser_pistol: 1, ammo_laser: 8 })
  const monster = new StubMonster(124, 94, 100)
  const { game, projectiles } = makeGame({ inventory: inv, monsters: [monster] })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_pistol')
    ws.update(2)
    const f = ws.fire()
    assertEq(f.ok, true, 'fire ok')
    assertEq(ws.shotCount, 1, 'shot tracked')
    ws.update(0.016)
    assertEq(monster.hp, 86, '14 damage applied')
    assertEq(projectiles[0].damage, 0, 'engine damage zeroed')
    assertEq(ws.shotCount, 0, 'non-piercing shot consumed')
    // 再 update 不应重复伤害
    ws.update(0.016)
    assertEq(monster.hp, 86, 'no double damage')
  })
})

check('弹药超时/回收后从跟踪列表移除', () => {
  const inv = new StubInventory({ laser_pistol: 1, ammo_laser: 8 })
  const { game, projectiles } = makeGame({ inventory: inv, monsters: [] })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_pistol')
    ws.update(2)
    ws.fire()
    assertEq(ws.shotCount, 1, 'tracked')
    projectiles[0].life = 0
    ws.update(0.016)
    assertEq(ws.shotCount, 0, 'removed after life end')
  })
})

check('废料发射器命中后有范围溅射', () => {
  const inv = new StubInventory({ scrap_launcher: 1, ammo_scrap: 6 })
  const direct = new StubMonster(124, 94, 200)
  const near = new StubMonster(150, 94, 200)
  const { game, projectiles } = makeGame({ inventory: inv, monsters: [direct, near] })
  const ws = makeWeapons(game)
  withChassis('atlas', () => {
    assertEq(ws.equip('scrap_launcher').ok, true, 'equip')
    ws.update(3)
    assertEq(ws.fire().ok, true, 'fire')
    ws.update(0.016)
    assertEq(direct.hp, 170, 'direct 30 damage')
    // 命中后射弹被标记 done，但 splash 在回收时结算
    projectiles[0].life = 0
    ws.update(0.016)
    assertEq(near.hp, 182, 'splash 18 damage (60%)')
  })
})

// ===========================================================================
// 7. 状态 / 输入 / 生命周期
// ===========================================================================
group('7 状态与生命周期')

check('state() 写入 G.weapon 且字段完整', () => {
  const inv = new StubInventory({ laser_rifle: 1, ammo_laser: 10 })
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_rifle')
    const st = ws.state()
    assertEq(st.id, 'laser_rifle', 'id')
    assertEq(st.name, '激光步枪', 'name')
    assertEq(st.class, 'ranged', 'class')
    assertEq(st.ammoMax, 24, 'ammoMax')
    assertEq(st.ammoType, 'ammo_laser', 'ammoType')
    assertEq(st.compatible, true, 'compatible')
    assertEq(st.reason, '', 'no reason')
    assertEq(typeof st.cooldown, 'number', 'cooldown')
    assertEq(st.holding, false, 'holding')
    assert(G.weapon && G.weapon.id === 'laser_rifle', 'G.weapon written')
    assertEq(G.weapon.ammoMax, 24, 'G.weapon ammoMax')
  })
})

check('按住开火：update 自动射击，且冷却期内不会连发', () => {
  const inv = new StubInventory({ laser_pistol: 1, ammo_laser: 8 })
  const { game, calls } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('laser_pistol')
    ws.update(2)
    const before = calls.spawnProjectile
    ws.setHolding(true)
    ws.update(0.016)
    assertEq(calls.spawnProjectile, before + 1, 'auto fire once')
    ws.update(0.016)
    assertEq(calls.spawnProjectile, before + 1, 'cooldown gates auto fire')
    ws.setHolding(false)
    const afterRelease = calls.spawnProjectile
    ws.update(1)
    assertEq(calls.spawnProjectile, afterRelease, 'no fire after release')
  })
})

check('unequip / reset / icon', () => {
  const inv = new StubInventory({ iron_pipe: 1 })
  const { game } = makeGame({ inventory: inv })
  game.getWeaponArt = (id) => `art:${id}`
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    ws.equip('iron_pipe')
    assertEq(ws.icon(), 'art:iron_pipe', 'icon via game.getWeaponArt')
    assertEq(ws.unequip().ok, true, 'unequip ok')
    assertEq(ws.unequip().ok, false, 'second unequip fails')
    assertEq(ws.state().id, null, 'state empty')
    ws.equip('iron_pipe')
    ws.reset()
    assertEq(ws.weaponId, null, 'reset clears weapon')
    assertEq(ws.state().compatible, false, 'state incompatible when empty')
    assert(hasChinese(ws.state().reason), 'empty reason Chinese')
  })
})

check('工厂函数与导出面', () => {
  const { game } = makeGame()
  const ws = createWeaponSystem(game)
  assert(ws instanceof WeaponSystem, 'factory returns WeaponSystem')
  for (const fn of ['equip', 'unequip', 'fire', 'reload', 'update', 'state', 'canEquip', 'setHolding', 'icon', 'bonus']) {
    assertEq(typeof ws[fn], 'function', `missing method ${fn}`)
  }
})

check('与真实 Inventory 联调：弹药确实从背包扣', () => {
  const inv = new Inventory()
  assertEq(inv.add('laser_pistol', 1), 1, 'add weapon')
  assertEq(inv.add('ammo_laser', 8), 8, 'add ammo')
  const { game } = makeGame({ inventory: inv })
  const ws = makeWeapons(game)
  withChassis('unit7', () => {
    assertEq(ws.equip('laser_pistol').ok, true, 'equip with real inventory')
    assertEq(inv.count('ammo_laser'), 0, 'reload consumed ammo from Inventory')
    ws.update(2)
    assertEq(ws.mag, 8, 'mag full')
    assertEq(ws.fire().ok, true, 'fire')
    assertEq(ws.mag, 7, 'mag after shot')
    assertEq(inv.count('laser_pistol'), 1, 'weapon stays in bag')
    // 手动补弹并换弹，验证 Inventory.remove 的返回路径
    inv.add('ammo_laser', 2)
    assertEq(ws.reload().ok, true, 'reload one round')
    assertEq(inv.count('ammo_laser'), 1, 'one round consumed')
  })
})

// ===========================================================================
// 8. 掉落
// ===========================================================================
group('8 武器掉落')

check('validateWeaponLoot() 通过', () => {
  const v = validateWeaponLoot()
  assert(v.ok, `errors: ${v.errors.slice(0, 8).join(' | ')}`)
})

check('四个 biome 表齐全，权重正，覆盖全部 12 把武器', () => {
  for (const biome of ['city', 'village', 'factory', 'dump']) {
    const entries = WEAPON_LOOT_TABLES[biome]
    assert(Array.isArray(entries) && entries.length, `${biome} table`)
    const ids = new Set(entries.map((e) => e.id))
    for (const id of WEAPON_IDS) assert(ids.has(id), `${biome} missing ${id}`)
    for (const e of entries) {
      assert(Number(e.weight) > 0, `${biome}:${e.id} weight`)
      assert(getWeapon(e.id), `${biome}:${e.id} not a weapon`)
    }
    const p = WEAPON_DROP_CHANCE[biome]
    assert(p > 0 && p < 1, `${biome} chance`)
  }
  assertEq(normalizeBiome('unknown'), 'default', 'biome fallback')
  assertEq(normalizeBiome('factory'), 'factory', 'biome passthrough')
})

check('weaponLootEntriesOf 返回副本 / 建议表规模', () => {
  const a = weaponLootEntriesOf('city')
  const b = weaponLootEntriesOf('city')
  assertEq(a.length, WEAPON_LOOT_TABLES.city.length, 'entry count')
  a[0].weight = 99999
  assert(b[0].weight !== 99999, 'entries must be copies')
  assert(Object.keys(WEAPON_LOOT_SUGGESTIONS).length >= 8, 'suggestions table coverage')
})

check('rollWeaponTable：结果合法、稀有非零、同种子可复现', () => {
  for (const biome of ['city', 'village', 'factory', 'dump']) {
    const a = makeRng(20261027)
    const b = makeRng(20261027)
    const seqA = []
    const seqB = []
    for (let i = 0; i < 120; i++) {
      const id = rollWeaponTable(biome, a)
      assert(getWeapon(id), `${biome} rolled invalid ${id}`)
      seqA.push(id)
      seqB.push(rollWeaponTable(biome, b))
    }
    assertEq(seqA.join(','), seqB.join(','), `${biome} determinism`)
    assert(new Set(seqA).size >= 5, `${biome} should roll more than a couple weapons`)
    // 稀有武器（rail_spike weight 1~2）在 120 次里不该刷屏
    const railCount = seqA.filter((id) => id === 'rail_spike').length
    assert(railCount <= 4, `${biome} rail_spike too common (${railCount}/120)`)
  }
})

check('rollWeaponForRoom：概率门控 + 返回值合法', () => {
  let hits = 0
  const rng = makeRng(424242)
  for (let i = 0; i < 800; i++) {
    const id = rollWeaponForRoom('dump', rng)
    if (id === null) continue
    hits++
    assert(getWeapon(id), `invalid ${id}`)
  }
  const expected = 800 * weaponDropChance('dump')
  assert(hits > expected * 0.5 && hits < expected * 1.6, `drop hits ${hits} vs expected ~${expected.toFixed(0)}`)
  const drop = rollWeaponDropForRoom('city', makeRng(7))
  if (drop) {
    assertEq(drop.n, 1, 'drop n')
    assert(getWeapon(drop.id), 'drop id')
  }
})

check('武器弹药包与 rollWeaponKit', () => {
  for (const w of allWeapons()) {
    if (w.class !== 'ranged') continue
    const bundle = WEAPON_AMMO_BUNDLES[w.id]
    assert(bundle, `missing bundle ${w.id}`)
    assertEq(bundle.id, w.ammoType, `bundle ammo for ${w.id}`)
  }
  const kit = rollWeaponKit('factory', makeRng(99))
  if (kit) {
    assert(getWeapon(kit.weapon.id), 'kit weapon')
    if (kit.ammo) {
      assertEq(getAmmo(kit.ammo.id).category, 'ammo', 'kit ammo')
      assert(kit.ammo.n >= 1, 'kit ammo n')
    }
  }
  const none = rollAmmoForWeapon('iron_pipe', makeRng(1))
  assertEq(none, null, 'melee has no ammo bundle')
})

// ===========================================================================
// 9. 语法自检（node --check），子进程失败时降级为提示
// ===========================================================================
group('9 node --check')

check('4 个文件 node --check 通过', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const files = ['data.js', 'runtime.js', 'loot.js'].map((f) => path.join(here, '../src/game/weapons', f))
  files.push(fileURLToPath(import.meta.url))
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
    } catch (err) {
      // 沙箱禁止管道捕获子进程输出时，退回 inherit 再试一次（仍能拿到退出码）
      if (String(err.code) === 'EPERM' || String(err.code) === 'EACCES') {
        try {
          execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' })
          continue
        } catch (err2) {
          throw new Error(`${path.basename(f)} 语法检查失败（inherit 模式）`)
        }
      }
      const detail = err && err.stderr ? err.stderr.toString().slice(0, 300) : String(err)
      throw new Error(`${path.basename(f)} 语法检查失败: ${detail}`)
    }
  }
})

// ===========================================================================
// 输出
// ===========================================================================
const lines = []
let okCount = 0
for (const r of results) {
  if (r.kind === 'group') {
    lines.push('')
    lines.push(`== ${r.name} ==`)
  } else if (r.kind === 'ok') {
    okCount++
    lines.push(`  ✓ ${r.name}`)
  } else {
    lines.push(`  ✗ ${r.name}`)
    lines.push(`      ${r.message}`)
  }
}

lines.push('')
lines.push('----------------------------------------------------------------')
lines.push(`武器 ${allWeapons().length} 把 / 弹药 ${allAmmo().length} 种 / 机体兼容 ${CHASSIS_LIST.length} 台`)
const melee = allWeapons().filter((w) => w.class === 'melee')
const ranged = allWeapons().filter((w) => w.class === 'ranged')
lines.push(`近战 ${melee.length} 把（伤害 ${Math.min(...melee.map((w) => w.damage))}–${Math.max(...melee.map((w) => w.damage))}）` +
  ` / 远程 ${ranged.length} 把（伤害 ${Math.min(...ranged.map((w) => w.damage))}–${Math.max(...ranged.map((w) => w.damage))}）`)
lines.push(`断言 ${okCount} 通过 / ${failed} 失败`)
if (failed) {
  lines.push('RESULT: FAILED')
} else {
  lines.push('RESULT: ALL CHECKS PASSED')
}
console.log(lines.join('\n'))
process.exitCode = failed ? 1 : 0
