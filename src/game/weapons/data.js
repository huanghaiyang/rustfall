// 武器 / 弹药数据 —— 12 把武器 + 6 种弹药，全部注册为 KIND.ITEM。
// 契约（见任务书）：
//   武器：{ id, name, en, class:'melee'|'ranged', damage, rate(次/秒), range, weight, rarity,
//           stack:1, value, desc, lore?, ammoType?, ammoPerShot?, magazine?, spread?,
//           projectile?{speed,gravity,radius,color,life,pierce?,lift?,splash?},
//           melee?{arc,knockback,stagger}, compat:{chassis?,requiresArm?,minCarry?,reason?},
//           bonus?, category:'weapon', slot:'weapon' }
//   弹药：{ id, name, en, category:'ammo', stack:60, weight, value, rarity, desc, ammoFor }
//
// 兼容校验（WeaponSystem.canEquip）读取 Content.get(KIND.CHASSIS, G.chassisId) 的
// carry / hitbox / abilities。数据里只给白名单与门槛，具体判定在 runtime.js。
//
// 注意：`arc_emitter` 在 loot/catalog.js 里原本是一件稀有组件（rarity 5, slot utility）。
// 本文件把它升级/覆盖为武器（slot weapon）——注册表允许 override，但必须在 catalog 之后注册。
// 为了与 import 顺序无关，这里先 import catalog，再用 override 注册；这是唯一一个冲突 id。
import '../loot/catalog.js'
import { Content, KIND } from '../core/registry.js'

export const WEAPON_CATEGORY = 'weapon'
export const AMMO_CATEGORY = 'ammo'
export const WEAPON_SLOT = 'weapon'

/** 武器类别（与 item.class 对应） */
export const WEAPON_CLASS = Object.freeze({
  MELEE: 'melee',
  RANGED: 'ranged',
})

/** 机体白名单常量，避免在 12 条数据里手打字符串出错 */
const CH = Object.freeze({
  unit7: 'unit7',
  tesla: 'tesla',
  agibot: 'agibot',
  atlas: 'atlas',
  spider: 'spider',
  mule: 'mule',
  ghost: 'ghost',
  hulk: 'hulk',
})

const ALL_CHASSIS = Object.freeze(Object.values(CH))

// =============================================================================
// 弹药（6 种）
// pos: 只有远程武器用得到；weight 按「单发」算，stack 60 时总重也压得住背包。
// =============================================================================
export const AMMO_DEFS = [
  {
    id: 'ammo_9mm',
    name: '9mm 子弹',
    en: '9mm Rounds',
    category: AMMO_CATEGORY,
    stack: 60,
    weight: 0.01,
    value: 2,
    rarity: 1,
    desc: '黄铜弹壳，底火受潮发绿，挑出来晒一晒还能响。盒子上印着已经倒闭的厂标。',
    tags: ['ammo', 'ballistic', 'small'],
    ammoFor: ['semi_pistol'],
    art: 'ammo_pistol',
  },
  {
    id: 'ammo_laser',
    name: '激光电池',
    en: 'Laser Cell',
    category: AMMO_CATEGORY,
    stack: 60,
    weight: 0.02,
    value: 6,
    rarity: 2,
    desc: '标准激光电池组，正极触点有一层氧化膜。电压标称一致，实际能放几发要看运气。',
    tags: ['ammo', 'energy', 'laser'],
    ammoFor: ['laser_pistol', 'laser_rifle'],
    art: 'ammo_laser',
  },
  {
    id: 'ammo_nail',
    name: '钢钉',
    en: 'Steel Nails',
    category: AMMO_CATEGORY,
    stack: 60,
    weight: 0.03,
    value: 1,
    rarity: 1,
    desc: '一卷镀锌钢钉，钉帽有点歪，钉身还留着出厂油。钉枪不挑，墙和关节都不挑。',
    tags: ['ammo', 'steel', 'nails'],
    ammoFor: ['nailgun'],
    art: 'ammo_nail',
  },
  {
    id: 'ammo_scrap',
    name: '废料弹',
    en: 'Scrap Slug',
    category: AMMO_CATEGORY,
    stack: 60,
    weight: 0.08,
    value: 2,
    rarity: 1,
    desc: '铁屑、碎玻璃和橡胶压成的弹丸，大小不一。打出去是一片，落在哪儿要看风向。',
    tags: ['ammo', 'scrap', 'slug'],
    ammoFor: ['scrap_launcher'],
    art: 'ammo_scrap',
  },
  {
    id: 'ammo_arc',
    name: '电弧电容',
    en: 'Arc Capacitor',
    category: AMMO_CATEGORY,
    stack: 60,
    weight: 0.05,
    value: 8,
    rarity: 2,
    desc: '一次性高压电容，外壳有一道电弧烧出的白痕。放完电就废，但放的那一下很值。',
    tags: ['ammo', 'energy', 'arc'],
    ammoFor: ['arc_emitter'],
    art: 'ammo_arc',
  },
  {
    id: 'ammo_rail',
    name: '轨道钉',
    en: 'Rail Spike',
    category: AMMO_CATEGORY,
    stack: 60,
    weight: 0.06,
    value: 15,
    rarity: 3,
    desc: '钨钢钉，尾部镀了一层导电涂层，划一下会掉粉。三根一组，装填时能听见电磁轨的余鸣。',
    tags: ['ammo', 'rail', 'rare'],
    ammoFor: ['rail_spike'],
    art: 'ammo_rail',
  },
]

// =============================================================================
// 武器（12 把）
// 数值区间（自检脚本会断言）：近战 damage 14–40，远程 6–45，rate 0.8–6 次/秒。
// =============================================================================
export const WEAPON_DEFS = [
  // ---------------------------------------------------------------- 远程 · 激光
  {
    id: 'laser_pistol',
    name: '激光手枪',
    en: 'Laser Pistol',
    class: 'ranged',
    damage: 14,
    rate: 2.4,
    range: 430,
    weight: 1.6,
    rarity: 3,
    value: 180,
    stack: 1,
    desc: '改装的工业激光头，握把缠着防滑胶带，扳机护圈缺了一半。打穿一件薄铁皮够用，打穿墙不够。',
    ammoType: 'ammo_laser',
    ammoPerShot: 1,
    magazine: 8,
    spread: 0.02,
    reload: 1.1,
    projectile: { speed: 820, gravity: 0, radius: 4, color: 0x8fe8ff, life: 1.1 },
    compat: { chassis: ALL_CHASSIS },
    bonus: { scan: 0.02 },
    tags: ['weapon', 'ranged', 'laser', 'energy'],
    art: 'laser_pistol',
    // 激光武器可以拆一次性电池顶一发（catalog 里已有的 cell_small）
    ammoFallback: { id: 'cell_small', rounds: 6 },
  },
  {
    id: 'laser_rifle',
    name: '激光步枪',
    en: 'Laser Rifle',
    class: 'ranged',
    damage: 26,
    rate: 3.2,
    range: 620,
    weight: 3.4,
    rarity: 4,
    value: 340,
    stack: 1,
    desc: '枪管外面套着一圈散热片，摸上去还有余温。准星是用铁丝焊的，歪了一点，但连发时很稳。',
    lore: '枪托内侧刻着一行编号和一句话：交给会用的人。刻痕很浅，像是用钉子划的。',
    ammoType: 'ammo_laser',
    ammoPerShot: 1,
    magazine: 24,
    spread: 0.035,
    reload: 1.8,
    projectile: { speed: 980, gravity: 0, radius: 5, color: 0x9ff0ff, life: 1.4 },
    compat: { chassis: [CH.unit7, CH.tesla, CH.atlas, CH.ghost], minCarry: 0.8, reason: '这支步枪的后坐结构装不上这台机体' },
    tags: ['weapon', 'ranged', 'laser', 'rifle'],
    art: 'laser_rifle',
    ammoFallback: { id: 'cell_small', rounds: 6 },
  },
  {
    id: 'rail_spike',
    name: '轨道钉',
    en: 'Rail Spike',
    class: 'ranged',
    damage: 44,
    rate: 0.9,
    range: 760,
    weight: 4.8,
    rarity: 5,
    value: 460,
    stack: 1,
    desc: '两根平行的电磁轨，中间留着一道能看见光的缝。充能时整支枪会往后顶，钉子出去时几乎没有声音。',
    lore: '军用剩余物资，原来装在轨道平台上。拆下来的人把铭牌磨掉了，只留下一道锯痕。',
    ammoType: 'ammo_rail',
    ammoPerShot: 1,
    magazine: 3,
    spread: 0.005,
    reload: 2.6,
    projectile: { speed: 1500, gravity: 0, radius: 3, color: 0xffffff, life: 1.5, pierce: true },
    compat: { chassis: [CH.unit7, CH.tesla, CH.atlas, CH.ghost], minCarry: 0.8, reason: '轨道钉的电磁后坐需要更稳的机架' },
    tags: ['weapon', 'ranged', 'rail', 'pierce'],
    art: 'rail_spike',
  },

  // ---------------------------------------------------------------- 远程 · 火药 / 机械
  {
    id: 'semi_pistol',
    name: '半自动手枪',
    en: 'Semi-Auto Pistol',
    class: 'ranged',
    damage: 12,
    rate: 3.8,
    range: 380,
    weight: 1.2,
    rarity: 2,
    value: 120,
    stack: 1,
    desc: '老式击针手枪，套筒有点旷，弹匣要用掌根拍进去才到位。雨天打得不准，晴天也不太准。',
    ammoType: 'ammo_9mm',
    ammoPerShot: 1,
    magazine: 12,
    spread: 0.045,
    reload: 1.3,
    projectile: { speed: 760, gravity: 220, radius: 3, color: 0xf2b34a, life: 1.0 },
    compat: { chassis: ALL_CHASSIS },
    tags: ['weapon', 'ranged', 'ballistic', 'pistol'],
    art: 'semi_pistol',
  },
  {
    id: 'nailgun',
    name: '钉枪',
    en: 'Nailgun',
    class: 'ranged',
    damage: 9,
    rate: 4.6,
    range: 300,
    weight: 2.2,
    rarity: 2,
    value: 130,
    stack: 1,
    desc: '装修用的气动钉枪，气罐换成了一个小电容，打一发嗡一声。射速快，钉子便宜，就是不疼。',
    ammoType: 'ammo_nail',
    ammoPerShot: 1,
    magazine: 40,
    spread: 0.06,
    reload: 1.6,
    projectile: { speed: 700, gravity: 180, radius: 2, color: 0xa9b6bc, life: 0.8, lift: 20 },
    compat: { chassis: ALL_CHASSIS },
    tags: ['weapon', 'ranged', 'nail', 'fast'],
    art: 'nailgun',
  },
  {
    id: 'scrap_launcher',
    name: '废料发射器',
    en: 'Scrap Launcher',
    class: 'ranged',
    damage: 30,
    rate: 1.2,
    range: 360,
    weight: 6.4,
    rarity: 3,
    value: 260,
    stack: 1,
    desc: '一截改装的排水管加一个弹簧击锤，装填要用手把废料塞进膛里。打出去的东西不保证方向，但一定很重。',
    ammoType: 'ammo_scrap',
    ammoPerShot: 1,
    magazine: 6,
    spread: 0.08,
    reload: 2.2,
    projectile: { speed: 520, gravity: 420, radius: 7, color: 0xb0713a, life: 2.2, lift: 70, splash: 46 },
    compat: {
      chassis: [CH.atlas, CH.agibot],
      requiresArm: true,
      minCarry: 1.2,
      minHitbox: 22,
      reason: '废料发射器的重量超过了这台机体的承载',
    },
    tags: ['weapon', 'ranged', 'scrap', 'heavy'],
    art: 'scrap_launcher',
  },
  {
    id: 'arc_emitter',
    name: '电弧发射器',
    en: 'Arc Emitter',
    class: 'ranged',
    damage: 22,
    rate: 2.0,
    range: 320,
    weight: 2.2,
    rarity: 5,
    value: 400,
    stack: 1,
    desc: '两根钨电极架在一个陶瓷座上，扣扳机时中间会先亮一下，然后空气开始有味道。射程短，近身很难躲开。',
    lore: '原本是某种焊接设备的部件，被接上了枪托和电容组。铭牌磨掉了，焊点倒是很新。',
    ammoType: 'ammo_arc',
    ammoPerShot: 1,
    magazine: 10,
    spread: 0,
    reload: 1.4,
    projectile: { speed: 900, gravity: 0, radius: 6, color: 0x8fe8ff, life: 0.55 },
    compat: { chassis: [CH.tesla, CH.agibot, CH.atlas], reason: '电弧反冲会把这条机体的关节烧穿' },
    tags: ['weapon', 'ranged', 'arc', 'energy'],
    art: 'arc_emitter',
  },

  // ---------------------------------------------------------------- 近战
  {
    id: 'iron_pipe',
    name: '铁棍',
    en: 'Iron Pipe',
    class: 'melee',
    damage: 18,
    rate: 1.8,
    range: 48,
    weight: 2.0,
    rarity: 1,
    value: 12,
    stack: 1,
    desc: '一米长的镀锌水管，两端砸扁过，握的地方缠着布条。最普通的东西，也最不容易坏。',
    melee: { arc: 0.9, knockback: 160, stagger: 0.35 },
    compat: { chassis: ALL_CHASSIS },
    tags: ['weapon', 'melee', 'blunt'],
    art: 'iron_pipe',
  },
  {
    id: 'dagger',
    name: '匕首',
    en: 'Dagger',
    class: 'melee',
    damage: 14,
    rate: 3.4,
    range: 34,
    weight: 0.5,
    rarity: 2,
    value: 40,
    stack: 1,
    desc: '用锯片磨出来的短刀，刀背还带着齿，柄是两块木板夹的。出手快，收手也快，前提是手够小。',
    melee: { arc: 0.55, knockback: 40, stagger: 0.2 },
    compat: { chassis: [CH.ghost, CH.spider, CH.unit7], reason: '这台机体的手指太粗，捏不住匕首' },
    tags: ['weapon', 'melee', 'sharp', 'light'],
    art: 'dagger',
  },
  {
    id: 'hammer',
    name: '榔头',
    en: 'Sledgehammer',
    class: 'melee',
    damage: 34,
    rate: 1.1,
    range: 52,
    weight: 5.2,
    rarity: 3,
    value: 90,
    stack: 1,
    desc: '拆墙用的八角锤，柄是新换的，锤头上有别人砸出来的凹坑。挥一次要缓半秒，缓过来之后什么都挡不住。',
    melee: { arc: 1.0, knockback: 320, stagger: 0.7 },
    compat: { chassis: [CH.atlas, CH.hulk, CH.mule], minCarry: 1.1, minHitbox: 20, reason: '这条机械臂握不住重锤' },
    bonus: { dig: 0.04 },
    tags: ['weapon', 'melee', 'heavy', 'blunt'],
    art: 'hammer',
  },
  {
    id: 'wrench_heavy',
    name: '重型扳手',
    en: 'Heavy Wrench',
    class: 'melee',
    damage: 28,
    rate: 1.3,
    range: 50,
    weight: 4.6,
    rarity: 2,
    value: 70,
    stack: 1,
    desc: '一米二的大号管钳扳手，咬口还是好的。拧得动主阀，也砸得开外壳，取决于你把它对准哪儿。',
    melee: { arc: 0.95, knockback: 260, stagger: 0.55 },
    compat: { chassis: [CH.atlas, CH.hulk, CH.mule], minCarry: 1.1, minHitbox: 20, reason: '重型扳手的扭矩会拧断这条机械臂' },
    bonus: { dig: 0.05 },
    tags: ['weapon', 'melee', 'heavy', 'tool'],
    art: 'wrench_heavy',
  },
  {
    id: 'shock_baton',
    name: '电击棒',
    en: 'Shock Baton',
    class: 'melee',
    damage: 16,
    rate: 2.6,
    range: 44,
    weight: 1.4,
    rarity: 3,
    value: 150,
    stack: 1,
    desc: '保安用的伸缩电棍，缩着只有小臂长，甩开有一米。电击时手会抖，抖完对方一般已经躺下了。',
    melee: { arc: 0.7, knockback: 90, stagger: 0.85 },
    compat: { chassis: ALL_CHASSIS },
    bonus: { attack: 0.02 },
    tags: ['weapon', 'melee', 'shock', 'stun'],
    art: 'shock_baton',
  },
]

// =============================================================================
// 注册
// =============================================================================

function registerItem(id, def, source) {
  const exists = Content.has(KIND.ITEM, id)
  const payload = { ...def, id }
  // 已存在（arc_emitter 与 catalog 冲突）→ override；其余正常注册。
  if (exists) payload.override = true
  return Content.register(KIND.ITEM, id, payload, source)
}

for (const def of AMMO_DEFS) {
  const d = {
    ...def,
    category: AMMO_CATEGORY,
    stack: def.stack || 60,
    tags: def.tags || ['ammo'],
  }
  registerItem(def.id, d, 'weapons')
}

for (const def of WEAPON_DEFS) {
  const d = {
    ...def,
    category: WEAPON_CATEGORY,
    slot: WEAPON_SLOT,
    stack: 1,
    tags: def.tags || ['weapon'],
  }
  registerItem(def.id, d, 'weapons')
}

export const WEAPON_IDS = WEAPON_DEFS.map((d) => d.id)
export const AMMO_IDS = AMMO_DEFS.map((d) => d.id)

// =============================================================================
// 查询辅助
// =============================================================================

/** 全部武器定义（按注册顺序） */
export function allWeapons() {
  return WEAPON_IDS.map((id) => Content.get(KIND.ITEM, id)).filter(Boolean)
}

/** 全部弹药定义 */
export function allAmmo() {
  return AMMO_IDS.map((id) => Content.get(KIND.ITEM, id)).filter(Boolean)
}

/** 按 id 取武器，不是武器/不存在返回 null */
export function getWeapon(id) {
  const def = Content.get(KIND.ITEM, id)
  if (!def || def.category !== WEAPON_CATEGORY) return null
  return def
}

/** 按 id 取弹药，不存在返回 null */
export function getAmmo(id) {
  const def = Content.get(KIND.ITEM, id)
  if (!def || def.category !== AMMO_CATEGORY) return null
  return def
}

/** 是否武器 */
export function isWeapon(id) {
  return !!getWeapon(id)
}

/** 是否弹药 */
export function isAmmo(id) {
  return !!getAmmo(id)
}

/** 武器类别：'melee' | 'ranged' | null */
export function weaponClassOf(id) {
  const w = getWeapon(id)
  return w ? w.class : null
}

/** 某武器使用的弹药 id（近战返回 null） */
export function ammoForWeapon(id) {
  const w = getWeapon(id)
  return w && w.ammoType ? w.ammoType : null
}

/** 该武器是否有备用弹药换算（激光类吃 cell_small） */
export function ammoFallbackOf(id) {
  const w = getWeapon(id)
  return w && w.ammoFallback ? { ...w.ammoFallback } : null
}

/** 武器图标提示 id（art-char 的 getWeaponArt 用；缺美术时 UI 自行兜底） */
export function weaponArtHint(id) {
  const w = getWeapon(id)
  return (w && w.art) || 'weapon'
}

/** 单发冷却（秒） */
export function cooldownOf(weaponId) {
  const w = getWeapon(weaponId)
  if (!w || !(w.rate > 0)) return 1
  return 1 / w.rate
}

/** 换弹时长（秒）：数据里给了 reload 就用，否则按弹匣容量估 */
export function reloadTimeOf(weaponId) {
  const w = getWeapon(weaponId)
  if (!w) return 0
  if (Number.isFinite(Number(w.reload)) && w.reload > 0) return Number(w.reload)
  const mag = Number(w.magazine) || 0
  return Math.min(3.2, Math.max(0.8, 0.6 + mag * 0.05))
}

/**
 * 兼容矩阵：{ weaponId: { chassisId: { ok, reason } } }
 * 只做数据层判定（不依赖 G），给 UI 的兼容表 / 调试面板用。
 */
export function compatMatrix() {
  const out = {}
  for (const w of allWeapons()) {
    const row = {}
    const compat = w.compat || {}
    const list = Array.isArray(compat.chassis) && compat.chassis.length ? compat.chassis : ALL_CHASSIS
    for (const chassis of ALL_CHASSIS) {
      let ok = list.includes(chassis)
      let reason = ''
      if (!ok) reason = compat.reason || `${w.name}装不上这台机体`
      else if (compat.requiresArm && !heroHasArm(chassis)) {
        ok = false
        reason = compat.reason || '这条机械臂握不住它'
      } else if (Number.isFinite(Number(compat.minCarry)) && chassisCarry(chassis) < Number(compat.minCarry)) {
        ok = false
        reason = compat.reason || '这台机体的负重撑不住它'
      } else if (Number.isFinite(Number(compat.minHitbox)) && chassisHitbox(chassis).length) {
        if (chassisHitbox(chassis)[0] < Number(compat.minHitbox)) {
          ok = false
          reason = compat.reason || '这台机体的机架太窄，装不下它'
        }
      }
      row[chassis] = { ok, reason }
    }
    out[w.id] = row
  }
  return out
}

/** 机体是否有可挂载重型武器的手臂（arm 族 / carryBoost / digBoost） */
export function heroHasArm(chassisId) {
  const ch = Content.get(KIND.CHASSIS, chassisId)
  if (!ch) return true // 数据缺失时不拦，交给引擎兜底
  const abilities = Array.isArray(ch.abilities) ? ch.abilities : []
  return ch.family === 'arm' || abilities.includes('carryBoost') || abilities.includes('digBoost')
}

/** 机体基础负重倍率（不是实时负重，只用于兼容门槛） */
export function chassisCarry(chassisId) {
  const ch = Content.get(KIND.CHASSIS, chassisId)
  return ch ? Number(ch.carry) || 1 : 1
}

/** 机体碰撞盒 [w, h]（机体数据缺失时返回空数组） */
export function chassisHitbox(chassisId) {
  const ch = Content.get(KIND.CHASSIS, chassisId)
  if (!ch || !Array.isArray(ch.hitbox)) return []
  return ch.hitbox.map((v) => Number(v) || 0)
}

/** 机体的武器相关参数（carry / hitbox / abilities），给 UI 兼容表展示用 */
export function chassisFrame(chassisId) {
  const ch = Content.get(KIND.CHASSIS, chassisId)
  if (!ch) return { carry: 1, hitbox: [], abilities: [], family: '' }
  return {
    carry: Number(ch.carry) || 1,
    hitbox: Array.isArray(ch.hitbox) ? ch.hitbox.map((v) => Number(v) || 0) : [],
    abilities: Array.isArray(ch.abilities) ? [...ch.abilities] : [],
    family: ch.family || '',
  }
}

/**
 * 数据自检（scripts/check-weapons.mjs 用；也可在 dev 控制台跑）。
 * 只校验静态形状，不涉及 G / 引擎。
 */
export function validateWeaponData() {
  const errors = []
  const warn = []
  const ids = new Set()
  const ammoIds = new Set(AMMO_IDS)
  const chassisIds = new Set(ALL_CHASSIS)

  const checkId = (id, where) => {
    if (typeof id !== 'string' || !id) errors.push(`${where}: bad id`)
    else if (ids.has(id)) errors.push(`${where}: duplicate id ${id}`)
    else ids.add(id)
  }

  for (const a of allAmmo()) {
    const where = `ammo:${a.id}`
    checkId(a.id, where)
    if (a.category !== AMMO_CATEGORY) errors.push(`${where}: category=${a.category}`)
    if (a.stack !== 60) errors.push(`${where}: stack=${a.stack} (expect 60)`)
    for (const f of ['name', 'en', 'desc', 'weight', 'value', 'rarity']) {
      if (a[f] === undefined || a[f] === null) errors.push(`${where}: missing ${f}`)
    }
    if (!(a.weight > 0)) errors.push(`${where}: weight must be > 0`)
    if (!Array.isArray(a.ammoFor) || !a.ammoFor.length) warn.push(`${where}: no ammoFor list`)
  }

  for (const w of allWeapons()) {
    const where = `weapon:${w.id}`
    checkId(w.id, where)
    if (w.category !== WEAPON_CATEGORY) errors.push(`${where}: category=${w.category}`)
    if (w.slot !== WEAPON_SLOT) errors.push(`${where}: slot=${w.slot}`)
    if (w.stack !== 1) errors.push(`${where}: stack=${w.stack} (expect 1)`)
    if (w.class !== 'melee' && w.class !== 'ranged') errors.push(`${where}: class=${w.class}`)
    for (const f of ['name', 'en', 'damage', 'rate', 'range', 'weight', 'rarity', 'value', 'desc']) {
      if (w[f] === undefined || w[f] === null) errors.push(`${where}: missing ${f}`)
    }
    if (typeof w.desc !== 'string' || w.desc.length < 25) errors.push(`${where}: desc too short`)
    if (!Number.isInteger(w.rarity) || w.rarity < 1 || w.rarity > 5) errors.push(`${where}: rarity=${w.rarity}`)
    if (!(w.weight > 0)) errors.push(`${where}: weight must be > 0`)

    if (w.class === 'ranged') {
      const lo = 6
      const hi = 45
      if (!(w.damage >= lo && w.damage <= hi)) errors.push(`${where}: ranged damage ${w.damage} not in ${lo}-${hi}`)
    } else {
      const lo = 14
      const hi = 40
      if (!(w.damage >= lo && w.damage <= hi)) errors.push(`${where}: melee damage ${w.damage} not in ${lo}-${hi}`)
    }
    if (!(w.rate >= 0.8 && w.rate <= 6)) errors.push(`${where}: rate ${w.rate} not in 0.8-6`)

    if (w.class === 'ranged') {
      if (!ammoIds.has(w.ammoType)) errors.push(`${where}: unknown ammoType ${w.ammoType}`)
      if (!Number.isInteger(w.magazine) || w.magazine <= 0) errors.push(`${where}: magazine=${w.magazine}`)
      if (!(w.spread >= 0 && w.spread < 0.5)) errors.push(`${where}: spread=${w.spread}`)
      const p = w.projectile
      if (!p) errors.push(`${where}: missing projectile`)
      else {
        for (const f of ['speed', 'gravity', 'radius', 'color', 'life']) {
          if (p[f] === undefined || p[f] === null) errors.push(`${where}: projectile missing ${f}`)
        }
        if (!(p.speed > 0)) errors.push(`${where}: projectile.speed must be > 0`)
        if (!(p.life > 0)) errors.push(`${where}: projectile.life must be > 0`)
        if (!(p.radius > 0)) errors.push(`${where}: projectile.radius must be > 0`)
      }
      if (w.melee) errors.push(`${where}: ranged weapon should not have melee block`)
      if (!(w.range >= 200)) warn.push(`${where}: range ${w.range} looks short for ranged`)
    } else {
      if (!w.melee) errors.push(`${where}: melee weapon missing melee block`)
      else {
        for (const f of ['arc', 'knockback', 'stagger']) {
          if (w.melee[f] === undefined || w.melee[f] === null) errors.push(`${where}: melee missing ${f}`)
        }
        if (!(w.melee.arc > 0 && w.melee.arc <= Math.PI)) errors.push(`${where}: melee.arc=${w.melee.arc}`)
        if (!(w.melee.stagger >= 0 && w.melee.stagger <= 1)) errors.push(`${where}: melee.stagger=${w.melee.stagger}`)
      }
      if (w.magazine) errors.push(`${where}: melee weapon should not have magazine`)
      if (w.ammoType) errors.push(`${where}: melee weapon should not have ammoType`)
    }

    const compat = w.compat || {}
    if (compat.chassis != null) {
      if (!Array.isArray(compat.chassis) || !compat.chassis.length) errors.push(`${where}: bad compat.chassis`)
      else {
        for (const c of compat.chassis) {
          if (!chassisIds.has(c)) errors.push(`${where}: unknown chassis ${c}`)
        }
      }
    }
    if (compat.requiresArm != null && typeof compat.requiresArm !== 'boolean') {
      errors.push(`${where}: requiresArm must be boolean`)
    }
    if (compat.minCarry != null && !(Number(compat.minCarry) > 0)) {
      errors.push(`${where}: bad minCarry ${compat.minCarry}`)
    }
    if (compat.minHitbox != null && !(Number(compat.minHitbox) > 0)) {
      errors.push(`${where}: bad minHitbox ${compat.minHitbox}`)
    }
    if (compat.reason != null && (typeof compat.reason !== 'string' || !compat.reason.length)) {
      errors.push(`${where}: bad reason`)
    }
    // 不可兼容时必须有一句中文 reason 可显示
    if (compat.chassis && compat.chassis.length < ALL_CHASSIS.length && !compat.reason) {
      errors.push(`${where}: restricted weapon needs compat.reason`)
    }
    // 备用弹药必须真实存在
    if (w.ammoFallback) {
      if (!Content.has(KIND.ITEM, w.ammoFallback.id)) errors.push(`${where}: unknown fallback ${w.ammoFallback.id}`)
      if (!(w.ammoFallback.rounds > 0)) errors.push(`${where}: bad fallback rounds`)
    }
  }

  if (allWeapons().length !== 12) errors.push(`weapon count ${allWeapons().length} (expect 12)`)
  if (allAmmo().length !== 6) errors.push(`ammo count ${allAmmo().length} (expect 6)`)

  return { ok: !errors.length, errors, warnings: warn }
}

export default {
  WEAPON_DEFS,
  AMMO_DEFS,
  WEAPON_IDS,
  AMMO_IDS,
  WEAPON_CLASS,
  WEAPON_CATEGORY,
  AMMO_CATEGORY,
  WEAPON_SLOT,
  allWeapons,
  allAmmo,
  getWeapon,
  getAmmo,
  isWeapon,
  isAmmo,
  weaponClassOf,
  ammoForWeapon,
  ammoFallbackOf,
  weaponArtHint,
  cooldownOf,
  reloadTimeOf,
  compatMatrix,
  heroHasArm,
  chassisCarry,
  chassisHitbox,
  chassisFrame,
  validateWeaponData,
}
