// 武器掉落表 —— 给引擎 / 世界生成器用：按 biome 抽一把（或没有）武器。
// 说明：
//   · 这里只新建数据，不改 loot-tables.js；文件末尾给出「把武器并入现有掉落表」的建议权重，
//     Lead 想合并时直接抄 WEAPON_LOOT_SUGGESTIONS 里的条目即可。
//   · 概率设计：先过 WEAPON_DROP_CHANCE 的「这个房间有没有武器」判定，再按权重选具体武器；
//     稀有武器权重 1~4（相对常见 300+），概率极低但非零。
//   · rng 参数既接受函数（Math.random / () => …），也接受 render/rng.js 的 makeRng() 返回值。
import './data.js'
import { Content, KIND } from '../core/registry.js'
import { WEAPON_IDS, getWeapon, allWeapons } from './data.js'

/** 房间出现武器的概率（0~1）。shelter 是避难所里偶尔能翻到的存货。 */
export const WEAPON_DROP_CHANCE = Object.freeze({
  city: 0.18,
  village: 0.14,
  factory: 0.26,
  dump: 0.3,
  shelter: 0.1,
  default: 0.18,
})

/**
 * 每个 biome 的武器权重表。
 * 数值是相对权重，不必是整数；同一个 biome 里所有武器都在表里出现（保证任意 biome 都不会缺某把）。
 */
const BASE_TABLES = {
  city: [
    { id: 'iron_pipe', weight: 300, min: 1, max: 1 },
    { id: 'semi_pistol', weight: 160, min: 1, max: 1 },
    { id: 'nailgun', weight: 120, min: 1, max: 1 },
    { id: 'wrench_heavy', weight: 90, min: 1, max: 1 },
    { id: 'shock_baton', weight: 60, min: 1, max: 1 },
    { id: 'dagger', weight: 45, min: 1, max: 1 },
    { id: 'laser_pistol', weight: 22, min: 1, max: 1 },
    { id: 'hammer', weight: 16, min: 1, max: 1 },
    { id: 'scrap_launcher', weight: 8, min: 1, max: 1 },
    { id: 'arc_emitter', weight: 4, min: 1, max: 1 },
    { id: 'laser_rifle', weight: 3, min: 1, max: 1 },
    { id: 'rail_spike', weight: 1, min: 1, max: 1 },
  ],
  village: [
    { id: 'iron_pipe', weight: 320, min: 1, max: 1 },
    { id: 'semi_pistol', weight: 130, min: 1, max: 1 },
    { id: 'wrench_heavy', weight: 110, min: 1, max: 1 },
    { id: 'dagger', weight: 70, min: 1, max: 1 },
    { id: 'nailgun', weight: 60, min: 1, max: 1 },
    { id: 'shock_baton', weight: 34, min: 1, max: 1 },
    { id: 'laser_pistol', weight: 14, min: 1, max: 1 },
    { id: 'hammer', weight: 12, min: 1, max: 1 },
    { id: 'scrap_launcher', weight: 6, min: 1, max: 1 },
    { id: 'arc_emitter', weight: 3, min: 1, max: 1 },
    { id: 'laser_rifle', weight: 2, min: 1, max: 1 },
    { id: 'rail_spike', weight: 1, min: 1, max: 1 },
  ],
  factory: [
    { id: 'nailgun', weight: 240, min: 1, max: 1 },
    { id: 'hammer', weight: 200, min: 1, max: 1 },
    { id: 'wrench_heavy', weight: 180, min: 1, max: 1 },
    { id: 'shock_baton', weight: 120, min: 1, max: 1 },
    { id: 'iron_pipe', weight: 90, min: 1, max: 1 },
    { id: 'semi_pistol', weight: 70, min: 1, max: 1 },
    { id: 'arc_emitter', weight: 40, min: 1, max: 1 },
    { id: 'laser_pistol', weight: 30, min: 1, max: 1 },
    { id: 'scrap_launcher', weight: 22, min: 1, max: 1 },
    { id: 'laser_rifle', weight: 12, min: 1, max: 1 },
    { id: 'dagger', weight: 8, min: 1, max: 1 },
    { id: 'rail_spike', weight: 2, min: 1, max: 1 },
  ],
  dump: [
    { id: 'iron_pipe', weight: 280, min: 1, max: 1 },
    { id: 'scrap_launcher', weight: 150, min: 1, max: 1 },
    { id: 'nailgun', weight: 130, min: 1, max: 1 },
    { id: 'wrench_heavy', weight: 120, min: 1, max: 1 },
    { id: 'hammer', weight: 90, min: 1, max: 1 },
    { id: 'semi_pistol', weight: 60, min: 1, max: 1 },
    { id: 'shock_baton', weight: 40, min: 1, max: 1 },
    { id: 'dagger', weight: 30, min: 1, max: 1 },
    { id: 'arc_emitter', weight: 18, min: 1, max: 1 },
    { id: 'laser_pistol', weight: 12, min: 1, max: 1 },
    { id: 'laser_rifle', weight: 5, min: 1, max: 1 },
    { id: 'rail_spike', weight: 1, min: 1, max: 1 },
  ],
  shelter: [
    { id: 'semi_pistol', weight: 120, min: 1, max: 1 },
    { id: 'iron_pipe', weight: 90, min: 1, max: 1 },
    { id: 'nailgun', weight: 70, min: 1, max: 1 },
    { id: 'laser_pistol', weight: 40, min: 1, max: 1 },
    { id: 'shock_baton', weight: 30, min: 1, max: 1 },
    { id: 'wrench_heavy', weight: 20, min: 1, max: 1 },
    { id: 'laser_rifle', weight: 6, min: 1, max: 1 },
    { id: 'rail_spike', weight: 1, min: 1, max: 1 },
  ],
  default: [
    { id: 'iron_pipe', weight: 260, min: 1, max: 1 },
    { id: 'semi_pistol', weight: 140, min: 1, max: 1 },
    { id: 'nailgun', weight: 100, min: 1, max: 1 },
    { id: 'wrench_heavy', weight: 80, min: 1, max: 1 },
    { id: 'shock_baton', weight: 50, min: 1, max: 1 },
    { id: 'dagger', weight: 40, min: 1, max: 1 },
    { id: 'laser_pistol', weight: 18, min: 1, max: 1 },
    { id: 'hammer', weight: 12, min: 1, max: 1 },
    { id: 'scrap_launcher', weight: 7, min: 1, max: 1 },
    { id: 'arc_emitter', weight: 3, min: 1, max: 1 },
    { id: 'laser_rifle', weight: 2, min: 1, max: 1 },
    { id: 'rail_spike', weight: 1, min: 1, max: 1 },
  ],
}

/** 致敬向独特武器：四张 biome 表 + shelter + default 全部追加，权重压到最低档 */
const RARE_ADDITIONS = Object.freeze([
  { id: 'chainblade', weight: 10, min: 1, max: 1 },
  { id: 'smart_rifle', weight: 8, min: 1, max: 1 },
  { id: 'tesla_arc', weight: 6, min: 1, max: 1 },
  { id: 'gravity_emitter', weight: 2, min: 1, max: 1 },
  { id: 'plasma_cannon', weight: 2, min: 1, max: 1 },
  { id: 'fatman', weight: 1, min: 1, max: 1 },
])

export const WEAPON_LOOT_TABLES = Object.freeze(
  Object.fromEntries(
    Object.entries(BASE_TABLES).map(([key, list]) => [key, Object.freeze([...list, ...RARE_ADDITIONS])]),
  ),
)

/**
 * 建议并入 loot-tables.js 的条目（本文件不修改那个文件）。
 * 结构：{ 现有表 id: [{id, weight, min, max}, …] }
 * 建议做法：在原表数组里追加这些条目，权重整体保持「常见材料 200+，武器 3~30」。
 */
export const WEAPON_LOOT_SUGGESTIONS = Object.freeze({
  'city.rubble': [
    { id: 'iron_pipe', weight: 14, min: 1, max: 1 },
    { id: 'nailgun', weight: 6, min: 1, max: 1 },
    { id: 'dagger', weight: 4, min: 1, max: 1 },
  ],
  'city.cabinet': [
    { id: 'semi_pistol', weight: 10, min: 1, max: 1 },
    { id: 'laser_pistol', weight: 3, min: 1, max: 1 },
    { id: 'ammo_9mm', weight: 16, min: 3, max: 8 },
    { id: 'ammo_laser', weight: 8, min: 2, max: 6 },
  ],
  'city.corpse': [
    { id: 'shock_baton', weight: 6, min: 1, max: 1 },
    { id: 'ammo_9mm', weight: 18, min: 2, max: 6 },
  ],
  'village.rubble': [
    { id: 'iron_pipe', weight: 16, min: 1, max: 1 },
    { id: 'wrench_heavy', weight: 7, min: 1, max: 1 },
  ],
  'village.cabinet': [
    { id: 'semi_pistol', weight: 8, min: 1, max: 1 },
    { id: 'ammo_9mm', weight: 12, min: 2, max: 6 },
  ],
  'village.corpse': [
    { id: 'dagger', weight: 5, min: 1, max: 1 },
    { id: 'ammo_nail', weight: 8, min: 5, max: 15 },
  ],
  'factory.rubble': [
    { id: 'hammer', weight: 10, min: 1, max: 1 },
    { id: 'nailgun', weight: 8, min: 1, max: 1 },
    { id: 'ammo_nail', weight: 14, min: 5, max: 20 },
  ],
  'factory.cabinet': [
    { id: 'arc_emitter', weight: 5, min: 1, max: 1 },
    { id: 'laser_rifle', weight: 3, min: 1, max: 1 },
    { id: 'ammo_laser', weight: 14, min: 4, max: 12 },
    { id: 'ammo_arc', weight: 8, min: 3, max: 8 },
    { id: 'ammo_rail', weight: 3, min: 1, max: 3 },
  ],
  'factory.corpse': [
    { id: 'scrap_launcher', weight: 6, min: 1, max: 1 },
    { id: 'ammo_scrap', weight: 10, min: 2, max: 6 },
  ],
  'dump.rubble': [
    { id: 'iron_pipe', weight: 22, min: 1, max: 1 },
    { id: 'scrap_launcher', weight: 8, min: 1, max: 1 },
    { id: 'ammo_scrap', weight: 18, min: 2, max: 8 },
  ],
  'dump.cabinet': [
    { id: 'nailgun', weight: 9, min: 1, max: 1 },
    { id: 'ammo_nail', weight: 16, min: 5, max: 20 },
    { id: 'ammo_laser', weight: 6, min: 2, max: 6 },
  ],
  'monster.rogue': [
    { id: 'arc_emitter', weight: 2, min: 1, max: 1 },
    { id: 'ammo_arc', weight: 6, min: 1, max: 4 },
  ],
})

/** 武器的弹药包（掉落时一起给几发，避免拿到枪没子弹） */
export const WEAPON_AMMO_BUNDLES = Object.freeze({
  laser_pistol: { id: 'ammo_laser', min: 3, max: 8 },
  laser_rifle: { id: 'ammo_laser', min: 6, max: 14 },
  rail_spike: { id: 'ammo_rail', min: 1, max: 3 },
  semi_pistol: { id: 'ammo_9mm', min: 4, max: 10 },
  nailgun: { id: 'ammo_nail', min: 10, max: 24 },
  scrap_launcher: { id: 'ammo_scrap', min: 2, max: 6 },
  arc_emitter: { id: 'ammo_arc', min: 2, max: 6 },
  gravity_emitter: { id: 'ammo_core', min: 2, max: 5 },
  tesla_arc: { id: 'ammo_tesla', min: 4, max: 10 },
  plasma_cannon: { id: 'ammo_plasma', min: 1, max: 3 },
  fatman: { id: 'ammo_nuke', min: 1, max: 1 },
  smart_rifle: { id: 'ammo_9mm', min: 4, max: 10 },
})

// ---------------------------------------------------------------------------
// 抽取
// ---------------------------------------------------------------------------

function wrapRng(rng) {
  if (typeof rng === 'function') return rng
  if (rng && typeof rng.next === 'function') return () => rng.next()
  return Math.random
}

function randInt(rand, min, max) {
  const lo = Math.floor(min)
  const hi = Math.floor(max)
  if (hi <= lo) return lo
  return lo + Math.floor(rand() * (hi - lo + 1))
}

/** biome 名归一化：未知一律落到 default */
export function normalizeBiome(biome) {
  const b = typeof biome === 'string' ? biome : ''
  if (b === 'city' || b === 'village' || b === 'factory' || b === 'dump' || b === 'shelter') return b
  return 'default'
}

/** 取某 biome 的武器权重表（副本） */
export function weaponLootEntriesOf(biome) {
  const key = normalizeBiome(biome)
  const list = WEAPON_LOOT_TABLES[key] || WEAPON_LOOT_TABLES.default
  return list.map((e) => ({ ...e }))
}

/** biome 出现武器的概率 */
export function weaponDropChance(biome) {
  const key = normalizeBiome(biome)
  const p = WEAPON_DROP_CHANCE[key]
  return Number.isFinite(p) ? p : WEAPON_DROP_CHANCE.default
}

/**
 * 按权重抽一把武器（不做「这个房间有没有武器」的概率判定）。
 * @returns {string|null} 武器 id
 */
export function rollWeaponTable(biome, rng = Math.random) {
  const entries = weaponLootEntriesOf(biome)
  if (!entries.length) return null
  const rand = wrapRng(rng)
  let total = 0
  for (const e of entries) total += Math.max(0, Number(e.weight) || 0)
  if (total <= 0) return null
  let r = rand() * total
  for (const e of entries) {
    const w = Math.max(0, Number(e.weight) || 0)
    if (w <= 0) continue
    r -= w
    if (r < 0) return e.id
  }
  return entries[entries.length - 1].id
}

/**
 * 房间级抽奖：先过概率，再按权重选武器。
 * 世界生成器用法：
 *   const w = rollWeaponForRoom(biome)         // 大多数房间返回 null
 *   if (w) room.loot.push({ id: w, x, y })
 * @returns {string|null} 武器 id
 */
export function rollWeaponForRoom(biome, rng = Math.random) {
  const rand = wrapRng(rng)
  if (rand() > weaponDropChance(biome)) return null
  return rollWeaponTable(biome, rand)
}

/** 同上，但返回带数量的掉落对象，方便直接塞进 room.loot */
export function rollWeaponDropForRoom(biome, rng = Math.random) {
  const id = rollWeaponForRoom(biome, rng)
  return id ? { id, n: 1 } : null
}

/**
 * 某把武器的弹药包（概率给定；null 表示这次没给）。
 * @returns {{id:string,n:number}|null}
 */
export function rollAmmoForWeapon(weaponId, rng = Math.random, chance = 0.7) {
  const bundle = WEAPON_AMMO_BUNDLES[weaponId]
  if (!bundle) return null
  const rand = wrapRng(rng)
  if (rand() > chance) return null
  const n = randInt(rand, bundle.min, bundle.max)
  if (n <= 0) return null
  return { id: bundle.id, n }
}

/**
 * 一次生成「武器 + 配套弹药」的掉落建议。
 * @returns {{weapon:{id:string,n:1}, ammo:{id:string,n:number}|null}|null}
 */
export function rollWeaponKit(biome, rng = Math.random) {
  const weaponId = rollWeaponForRoom(biome, rng)
  if (!weaponId) return null
  const ammo = rollAmmoForWeapon(weaponId, rng)
  return { weapon: { id: weaponId, n: 1 }, ammo }
}

// ---------------------------------------------------------------------------
// 自检
// ---------------------------------------------------------------------------

/**
 * 校验武器掉落表：所有 id 都是已注册武器、权重为正、四个 biome 齐全、
 * 每张表都包含全部 12 把（稀有概率非零）。
 */
export function validateWeaponLoot() {
  const errors = []
  const weaponIds = new Set(WEAPON_IDS)
  const biomes = ['city', 'village', 'factory', 'dump']
  for (const biome of biomes) {
    const key = normalizeBiome(biome)
    const entries = weaponLootEntriesOf(key)
    if (!entries.length) {
      errors.push(`${key}: empty table`)
      continue
    }
    const seen = new Set()
    let total = 0
    for (const e of entries) {
      if (!weaponIds.has(e.id)) errors.push(`${key}: unknown weapon ${e.id}`)
      if (!(Number(e.weight) > 0)) errors.push(`${key}:${e.id}: weight <= 0`)
      if (seen.has(e.id)) errors.push(`${key}: duplicate ${e.id}`)
      seen.add(e.id)
      total += Number(e.weight) || 0
    }
    for (const id of weaponIds) {
      if (!seen.has(id)) errors.push(`${key}: missing weapon ${id}`)
    }
    if (!(total > 0)) errors.push(`${key}: total weight 0`)
    const chance = weaponDropChance(key)
    if (!(chance > 0 && chance < 1)) errors.push(`${key}: drop chance ${chance}`)
  }
  // 建议表里的 id 也必须存在
  for (const [tableId, list] of Object.entries(WEAPON_LOOT_SUGGESTIONS)) {
    for (const e of list) {
      if (!Content.has(KIND.ITEM, e.id)) errors.push(`suggestion ${tableId}: unknown item ${e.id}`)
      if (!(Number(e.weight) > 0)) errors.push(`suggestion ${tableId}:${e.id}: weight <= 0`)
    }
  }
  // 弹药包必须指向真实弹药
  for (const [weaponId, bundle] of Object.entries(WEAPON_AMMO_BUNDLES)) {
    if (!weaponIds.has(weaponId)) errors.push(`ammo bundle: unknown weapon ${weaponId}`)
    const def = Content.get(KIND.ITEM, bundle.id)
    if (!def) errors.push(`ammo bundle ${weaponId}: unknown ammo ${bundle.id}`)
    else if (def.category !== 'ammo') errors.push(`ammo bundle ${weaponId}: ${bundle.id} is not ammo`)
    if (!(bundle.min >= 1 && bundle.max >= bundle.min)) errors.push(`ammo bundle ${weaponId}: bad range`)
  }
  // 每把远程武器都应该有弹药包
  for (const w of allWeapons()) {
    if (w.class === 'ranged' && !WEAPON_AMMO_BUNDLES[w.id]) errors.push(`no ammo bundle for ${w.id}`)
    if (w.class === 'ranged' && WEAPON_AMMO_BUNDLES[w.id] && WEAPON_AMMO_BUNDLES[w.id].id !== w.ammoType) {
      errors.push(`ammo bundle mismatch for ${w.id}`)
    }
    if (w.class === 'ranged' && !getWeapon(w.id)) errors.push(`not registered: ${w.id}`)
  }
  return { ok: !errors.length, errors }
}

export default {
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
}
