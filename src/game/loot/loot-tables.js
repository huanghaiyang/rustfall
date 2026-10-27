// 战利品表（loot tables）—— 加权抽取。契约见 docs/CONTENT-API.md §2。
// 结构：{ 'biome.kind': [{ id, weight, min, max, chance? }] }
//   biome : city | village | factory | dump
//   kind  : rubble（废墟堆）| cabinet（柜子/箱子）| corpse（尸体/残骸）
// 另有 monster.common / monster.beast / monster.rogue 作为怪物掉落兜底。
// 约定：weight 是相对权重（不必是整数）；min/max 是单次掉落数量；chance 可选，默认 1。
// 稀有件权重极低（常见 200~300 对稀有 1~2），但绝不为 0。
import { Content, KIND } from '../core/registry.js'

export const LOOT_BIOMES = Object.freeze(['city', 'village', 'factory', 'dump'])
export const LOOT_KINDS = Object.freeze(['rubble', 'cabinet', 'corpse'])
export const MONSTER_TABLES = Object.freeze(['monster.common', 'monster.beast', 'monster.rogue'])

// 容器别名：引擎里 prop 的 kind 五花八门（grave/chest/crate…），统一折到三类容器。
// 这样 tableFor(biome, 'grave') 会走 corpse 表，而不是退化成 rubble。
const KIND_ALIAS = Object.freeze({
  grave: 'corpse',
  body: 'corpse',
  dead: 'corpse',
  skeleton: 'corpse',
  chest: 'cabinet',
  box: 'cabinet',
  crate: 'cabinet',
  locker: 'cabinet',
  shelf: 'cabinet',
  debris: 'rubble',
  junk: 'rubble',
  pile: 'rubble',
  heap: 'rubble',
  wreck: 'rubble',
})

// 每张表的抽取次数与展示信息（UI/文档用）。
export const TABLE_META = Object.freeze({
  'city.rubble': { label: '城区废墟堆', biome: 'city', kind: 'rubble', rolls: [2, 3] },
  'city.cabinet': { label: '城区柜子', biome: 'city', kind: 'cabinet', rolls: [1, 2] },
  'city.corpse': { label: '城区遗骸', biome: 'city', kind: 'corpse', rolls: [2, 3] },

  'village.rubble': { label: '村落废墟堆', biome: 'village', kind: 'rubble', rolls: [2, 3] },
  'village.cabinet': { label: '村落柜子', biome: 'village', kind: 'cabinet', rolls: [1, 2] },
  'village.corpse': { label: '村落遗骸', biome: 'village', kind: 'corpse', rolls: [2, 3] },

  'factory.rubble': { label: '工厂废墟堆', biome: 'factory', kind: 'rubble', rolls: [2, 3] },
  'factory.cabinet': { label: '工厂工具柜', biome: 'factory', kind: 'cabinet', rolls: [1, 2] },
  'factory.corpse': { label: '工厂遗骸', biome: 'factory', kind: 'corpse', rolls: [2, 3] },

  'dump.rubble': { label: '废料场废堆', biome: 'dump', kind: 'rubble', rolls: [2, 4] },
  'dump.cabinet': { label: '废料场电箱', biome: 'dump', kind: 'cabinet', rolls: [1, 2] },
  'dump.corpse': { label: '废料场残骸', biome: 'dump', kind: 'corpse', rolls: [2, 3] },

  'monster.common': { label: '怪物通用掉落', biome: null, kind: 'monster', rolls: [1, 2] },
  'monster.beast': { label: '野兽掉落', biome: null, kind: 'monster', rolls: [1, 2] },
  'monster.rogue': { label: '失控机体掉落', biome: null, kind: 'monster', rolls: [1, 3] },
})

export const LOOT_TABLES = {
  // -------------------------------------------------------------------------
  // city —— 城区：居民楼、商铺、街上
  // -------------------------------------------------------------------------
  'city.rubble': [
    { id: 'scrap_plate', weight: 340, min: 1, max: 3 },
    { id: 'ash_brick', weight: 260, min: 1, max: 3 },
    { id: 'glass_shard', weight: 240, min: 1, max: 4 },
    { id: 'cloth', weight: 200, min: 1, max: 3 },
    { id: 'plastic_chunk', weight: 180, min: 1, max: 3 },
    { id: 'cement', weight: 140, min: 1, max: 2 },
    { id: 'wire_mesh', weight: 130, min: 1, max: 2 },
    { id: 'steel_rod', weight: 90, min: 1, max: 2 },
    { id: 'copper_wire', weight: 70, min: 1, max: 2 },
    { id: 'bearing', weight: 45, min: 1, max: 1 },
    { id: 'cell_small', weight: 28, min: 1, max: 1 },
    { id: 'photo_5', weight: 10, min: 1, max: 1 },
    { id: 'letter_1', weight: 8, min: 1, max: 1 },
    { id: 'jewelry_4', weight: 6, min: 1, max: 1 },
    { id: 'book_3', weight: 5, min: 1, max: 1 },
    { id: 'quantum_chip', weight: 1, min: 1, max: 1 },
  ],

  'city.cabinet': [
    { id: 'chemical', weight: 180, min: 1, max: 2 },
    { id: 'cloth', weight: 160, min: 1, max: 3 },
    { id: 'glass_shard', weight: 150, min: 1, max: 2 },
    { id: 'cell_small', weight: 120, min: 1, max: 1 },
    { id: 'rad_meds', weight: 40, min: 1, max: 1 },
    { id: 'ram_stick', weight: 45, min: 1, max: 1 },
    { id: 'board_cpu', weight: 30, min: 1, max: 1 },
    { id: 'repair_kit', weight: 26, min: 1, max: 1 },
    { id: 'bandage', weight: 34, min: 1, max: 2 },
    { id: 'med_gel', weight: 20, min: 1, max: 1 },
    { id: 'regen_patch', weight: 16, min: 1, max: 1 },
    { id: 'mirage_canister', weight: 9, min: 1, max: 1 },
    { id: 'shield_plate', weight: 6, min: 1, max: 1 },
    { id: 'diary_2', weight: 14, min: 1, max: 1 },
    { id: 'photo_4', weight: 12, min: 1, max: 1 },
    { id: 'cassette_1', weight: 10, min: 1, max: 1 },
    { id: 'book_2', weight: 8, min: 1, max: 1 },
    { id: 'optical_module', weight: 6, min: 1, max: 1 },
    { id: 'jewelry_3', weight: 5, min: 1, max: 1 },
    { id: 'quantum_chip', weight: 1, min: 1, max: 1 },
  ],

  'city.corpse': [
    { id: 'cloth', weight: 200, min: 1, max: 3 },
    { id: 'cell_small', weight: 60, min: 1, max: 1 },
    { id: 'dog_food', weight: 35, min: 1, max: 2 },
    { id: 'photo_1', weight: 30, min: 1, max: 1 },
    { id: 'rad_meds', weight: 22, min: 1, max: 1 },
    { id: 'clothes_2', weight: 40, min: 1, max: 1 },
    { id: 'letter_3', weight: 18, min: 1, max: 1 },
    { id: 'clothes_4', weight: 14, min: 1, max: 1 },
    { id: 'diary_4', weight: 12, min: 1, max: 1 },
    { id: 'photo_6', weight: 8, min: 1, max: 1 },
    { id: 'jewelry_1', weight: 8, min: 1, max: 1 },
    { id: 'jewelry_2', weight: 7, min: 1, max: 1 },
    { id: 'book_5', weight: 6, min: 1, max: 1 },
  ],

  // -------------------------------------------------------------------------
  // village —— 村落：土房、院子、老式家具
  // -------------------------------------------------------------------------
  'village.rubble': [
    { id: 'scrap_plate', weight: 280, min: 1, max: 2 },
    { id: 'cement', weight: 240, min: 1, max: 2 },
    { id: 'ash_brick', weight: 220, min: 1, max: 3 },
    { id: 'cloth', weight: 180, min: 1, max: 3 },
    { id: 'rubber', weight: 160, min: 1, max: 2 },
    { id: 'ceramic_plate', weight: 120, min: 1, max: 2 },
    { id: 'sulfur_lump', weight: 100, min: 1, max: 2 },
    { id: 'oil_sludge', weight: 90, min: 1, max: 2 },
    { id: 'copper_wire', weight: 60, min: 1, max: 2 },
    { id: 'wire_mesh', weight: 55, min: 1, max: 2 },
    { id: 'toy_1', weight: 10, min: 1, max: 1 },
    { id: 'book_4', weight: 8, min: 1, max: 1 },
    { id: 'photo_1', weight: 8, min: 1, max: 1 },
    { id: 'reactor_core', weight: 1, min: 1, max: 1 },
  ],

  'village.cabinet': [
    { id: 'cloth', weight: 170, min: 1, max: 2 },
    { id: 'chemical', weight: 140, min: 1, max: 2 },
    { id: 'cell_small', weight: 110, min: 1, max: 1 },
    { id: 'dog_food', weight: 100, min: 1, max: 2 },
    { id: 'glass_shard', weight: 90, min: 1, max: 2 },
    { id: 'bandage', weight: 40, min: 1, max: 2 },
    { id: 'sensor_unit', weight: 40, min: 1, max: 1 },
    { id: 'rad_meds', weight: 35, min: 1, max: 1 },
    { id: 'repair_kit', weight: 30, min: 1, max: 1 },
    { id: 'diary_1', weight: 12, min: 1, max: 1 },
    { id: 'cassette_2', weight: 12, min: 1, max: 1 },
    { id: 'toy_3', weight: 10, min: 1, max: 1 },
    { id: 'book_2', weight: 9, min: 1, max: 1 },
    { id: 'photo_2', weight: 8, min: 1, max: 1 },
    { id: 'solar_film', weight: 4, min: 1, max: 1 },
    { id: 'processor', weight: 2, min: 1, max: 1 },
  ],

  'village.corpse': [
    { id: 'cloth', weight: 220, min: 1, max: 3 },
    { id: 'cell_small', weight: 55, min: 1, max: 1 },
    { id: 'clothes_3', weight: 40, min: 1, max: 1 },
    { id: 'clothes_1', weight: 34, min: 1, max: 1 },
    { id: 'dog_food', weight: 30, min: 1, max: 2 },
    { id: 'photo_1', weight: 26, min: 1, max: 1 },
    { id: 'rad_meds', weight: 20, min: 1, max: 1 },
    { id: 'letter_1', weight: 20, min: 1, max: 1 },
    { id: 'diary_1', weight: 14, min: 1, max: 1 },
    { id: 'toy_2', weight: 10, min: 1, max: 1 },
    { id: 'jewelry_2', weight: 8, min: 1, max: 1 },
    { id: 'book_3', weight: 6, min: 1, max: 1 },
    { id: 'military_shell', weight: 1, min: 1, max: 1 },
  ],

  // -------------------------------------------------------------------------
  // factory —— 工厂：车间、工具柜、倒下的工人
  // -------------------------------------------------------------------------
  'factory.rubble': [
    { id: 'scrap_plate', weight: 320, min: 1, max: 3 },
    { id: 'steel_rod', weight: 220, min: 1, max: 2 },
    { id: 'copper_wire', weight: 190, min: 1, max: 3 },
    { id: 'aluminum_sheet', weight: 140, min: 1, max: 2 },
    { id: 'oil_sludge', weight: 130, min: 1, max: 2 },
    { id: 'solder', weight: 90, min: 1, max: 2 },
    { id: 'graphite_rod', weight: 80, min: 1, max: 2 },
    { id: 'bearing', weight: 60, min: 1, max: 1 },
    { id: 'motor_brush', weight: 50, min: 1, max: 2 },
    { id: 'hydraulic_rod', weight: 30, min: 1, max: 1 },
    { id: 'servo_motor', weight: 22, min: 1, max: 1 },
    { id: 'uranium_dust', weight: 8, min: 1, max: 1 },
    { id: 'book_1', weight: 10, min: 1, max: 1 },
    { id: 'cassette_3', weight: 8, min: 1, max: 1 },
    { id: 'reactor_core', weight: 1, min: 1, max: 1 },
  ],

  'factory.cabinet': [
    { id: 'board_cpu', weight: 120, min: 1, max: 1 },
    { id: 'ram_stick', weight: 100, min: 1, max: 1 },
    { id: 'brace_kit', weight: 34, min: 1, max: 1 },
    { id: 'overdrive_amp', weight: 12, min: 1, max: 1 },
    { id: 'emp_charge', weight: 10, min: 1, max: 1 },
    { id: 'fuse', weight: 90, min: 1, max: 2 },
    { id: 'chemical', weight: 90, min: 1, max: 2 },
    { id: 'solder', weight: 80, min: 1, max: 2 },
    { id: 'connector_bundle', weight: 70, min: 1, max: 2 },
    { id: 'optical_module', weight: 60, min: 1, max: 1 },
    { id: 'sensor_unit', weight: 55, min: 1, max: 1 },
    { id: 'processor', weight: 34, min: 1, max: 1 },
    { id: 'capacitor_bank', weight: 30, min: 1, max: 1 },
    { id: 'diary_5', weight: 8, min: 1, max: 1 },
    { id: 'photo_3', weight: 7, min: 1, max: 1 },
    { id: 'military_shell', weight: 4, min: 1, max: 1 },
    { id: 'satellite_gyro', weight: 2, min: 1, max: 1 },
    { id: 'quantum_chip', weight: 1, min: 1, max: 1 },
  ],

  'factory.corpse': [
    { id: 'cloth', weight: 180, min: 1, max: 2 },
    { id: 'scrap_plate', weight: 140, min: 1, max: 2 },
    { id: 'copper_wire', weight: 120, min: 1, max: 2 },
    { id: 'clothes_2', weight: 40, min: 1, max: 1 },
    { id: 'cell_large', weight: 28, min: 1, max: 1 },
    { id: 'multimeter', weight: 20, min: 1, max: 1 },
    { id: 'letter_3', weight: 14, min: 1, max: 1 },
    { id: 'servo_motor', weight: 12, min: 1, max: 1 },
    { id: 'book_5', weight: 12, min: 1, max: 1 },
    { id: 'photo_3', weight: 10, min: 1, max: 1 },
    { id: 'diary_7', weight: 8, min: 1, max: 1 },
    { id: 'titan_alloy', weight: 6, min: 1, max: 1 },
    { id: 'jewelry_3', weight: 5, min: 1, max: 1 },
    { id: 'sentry_core', weight: 3, min: 1, max: 1 },
  ],

  // -------------------------------------------------------------------------
  // dump —— 废料场：什么都没有，什么都有一点
  // -------------------------------------------------------------------------
  'dump.rubble': [
    { id: 'scrap_plate', weight: 300, min: 1, max: 4 },
    { id: 'plastic_chunk', weight: 260, min: 1, max: 4 },
    { id: 'rubber', weight: 200, min: 1, max: 3 },
    { id: 'wire_mesh', weight: 170, min: 1, max: 3 },
    { id: 'ceramic_plate', weight: 150, min: 1, max: 2 },
    { id: 'oil_sludge', weight: 150, min: 1, max: 2 },
    { id: 'aluminum_sheet', weight: 90, min: 1, max: 2 },
    { id: 'battery_shell', weight: 80, min: 1, max: 2 },
    { id: 'motor_brush', weight: 70, min: 1, max: 3 },
    { id: 'copper_wire', weight: 60, min: 1, max: 2 },
    { id: 'sulfur_lump', weight: 60, min: 1, max: 2 },
    { id: 'acid_sludge', weight: 55, min: 1, max: 2 },
    { id: 'firebomb', weight: 16, min: 1, max: 1 },
    { id: 'brace_kit', weight: 12, min: 1, max: 1 },
    { id: 'toy_1', weight: 8, min: 1, max: 1 },
    { id: 'diary_8', weight: 6, min: 1, max: 1 },
    { id: 'reactor_core', weight: 1, min: 1, max: 1 },
  ],

  'dump.cabinet': [
    { id: 'cell_small', weight: 130, min: 1, max: 2 },
    { id: 'repair_kit', weight: 120, min: 1, max: 1 },
    { id: 'chemical', weight: 110, min: 1, max: 2 },
    { id: 'connector_bundle', weight: 80, min: 1, max: 2 },
    { id: 'coolant_flask', weight: 70, min: 1, max: 1 },
    { id: 'sensor_unit', weight: 45, min: 1, max: 1 },
    { id: 'actuator_gear', weight: 40, min: 1, max: 1 },
    { id: 'wrench', weight: 30, min: 1, max: 1 },
    { id: 'fuel_canister', weight: 30, min: 1, max: 1 },
    { id: 'capacitor_bank', weight: 26, min: 1, max: 1 },
    { id: 'multimeter', weight: 20, min: 1, max: 1 },
    { id: 'diary_6', weight: 10, min: 1, max: 1 },
    { id: 'cassette_1', weight: 10, min: 1, max: 1 },
    { id: 'book_4', weight: 8, min: 1, max: 1 },
    { id: 'jewelry_4', weight: 6, min: 1, max: 1 },
    { id: 'arc_emitter', weight: 2, min: 1, max: 1 },
  ],

  'dump.corpse': [
    { id: 'scrap_plate', weight: 150, min: 1, max: 3 },
    { id: 'cloth', weight: 160, min: 1, max: 2 },
    { id: 'bearing', weight: 60, min: 1, max: 1 },
    { id: 'servo_motor', weight: 40, min: 1, max: 1 },
    { id: 'actuator_gear', weight: 40, min: 1, max: 1 },
    { id: 'hydraulic_rod', weight: 30, min: 1, max: 1 },
    { id: 'clothes_3', weight: 26, min: 1, max: 1 },
    { id: 'cell_large', weight: 20, min: 1, max: 1 },
    { id: 'carbon_fiber', weight: 12, min: 1, max: 1 },
    { id: 'photo_4', weight: 12, min: 1, max: 1 },
    { id: 'diary_5', weight: 8, min: 1, max: 1 },
    { id: 'book_1', weight: 8, min: 1, max: 1 },
    { id: 'sentry_core', weight: 6, min: 1, max: 1 },
    { id: 'satellite_gyro', weight: 2, min: 1, max: 1 },
  ],

  // -------------------------------------------------------------------------
  // 怪物兜底掉落
  // -------------------------------------------------------------------------
  'monster.common': [
    { id: 'scrap_plate', weight: 200, min: 1, max: 2 },
    { id: 'cloth', weight: 150, min: 1, max: 2 },
    { id: 'rubber', weight: 120, min: 1, max: 1 },
    { id: 'copper_wire', weight: 100, min: 1, max: 1 },
    { id: 'oil_sludge', weight: 90, min: 1, max: 1 },
    { id: 'chemical', weight: 80, min: 1, max: 1 },
    { id: 'cell_small', weight: 70, min: 1, max: 1 },
    { id: 'motor_brush', weight: 60, min: 1, max: 1 },
    { id: 'bearing', weight: 30, min: 1, max: 1 },
    { id: 'med_gel', weight: 22, min: 1, max: 1 },
    { id: 'regen_patch', weight: 14, min: 1, max: 1 },
    { id: 'sensor_unit', weight: 18, min: 1, max: 1 },
  ],

  'monster.beast': [
    { id: 'rubber', weight: 180, min: 1, max: 2 },
    { id: 'oil_sludge', weight: 150, min: 1, max: 2 },
    { id: 'cloth', weight: 120, min: 1, max: 2 },
    { id: 'chemical', weight: 110, min: 1, max: 1 },
    { id: 'sulfur_lump', weight: 100, min: 1, max: 1 },
    { id: 'acid_sludge', weight: 70, min: 1, max: 1 },
    { id: 'rare_earth', weight: 10, min: 1, max: 1 },
    { id: 'uranium_dust', weight: 6, min: 1, max: 1 },
  ],

  'monster.rogue': [
    { id: 'scrap_plate', weight: 220, min: 1, max: 3 },
    { id: 'copper_wire', weight: 160, min: 1, max: 2 },
    { id: 'bearing', weight: 90, min: 1, max: 1 },
    { id: 'cell_small', weight: 80, min: 1, max: 2 },
    { id: 'servo_motor', weight: 40, min: 1, max: 1 },
    { id: 'brace_kit', weight: 18, min: 1, max: 1 },
    { id: 'nano_syringe', weight: 8, min: 1, max: 1 },
    { id: 'emp_charge', weight: 6, min: 1, max: 1 },
    { id: 'board_cpu', weight: 26, min: 1, max: 1 },
    { id: 'sensor_unit', weight: 26, min: 1, max: 1 },
    { id: 'optical_module', weight: 14, min: 1, max: 1 },
    { id: 'processor', weight: 8, min: 1, max: 1 },
    { id: 'sentry_core', weight: 5, min: 1, max: 1 },
    { id: 'military_shell', weight: 2, min: 1, max: 1 },
  ],
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

/** 全部表 id（从 TABLE_META 派生，保证有顺序） */
export function tableIds() {
  return Object.keys(TABLE_META)
}

/** 表里的原始条目（只读，返回副本） */
export function entriesOf(tableId) {
  const list = LOOT_TABLES[tableId]
  if (!Array.isArray(list)) return []
  return list.map((e) => ({ ...e }))
}

/** 表元信息 */
export function tableMeta(tableId) {
  return TABLE_META[tableId] || null
}

/** 该表的抽取次数区间 */
export function rollsOf(tableId) {
  const meta = TABLE_META[tableId]
  if (meta && Array.isArray(meta.rolls)) return meta.rolls
  return [1, 1]
}

/**
 * 把 biome + 容器类型映射到表 id。
 * 兼容怪物：tableFor('monster') / tableFor('beast') / tableFor('rogue')。
 * 兼容容器别名：grave→corpse、chest/crate→cabinet、debris/junk→rubble。
 * 找不到时向 'city.rubble' 兜底，绝不返回 undefined。
 */
export function tableFor(biome, kind) {
  const b = typeof biome === 'string' ? biome : ''
  let k = typeof kind === 'string' ? kind : 'rubble'
  k = KIND_ALIAS[k] || k

  // 怪物族
  if (k === 'monster') return `monster.${b === 'beast' || b === 'rogue' ? b : 'common'}`
  if (b === 'monster' || b === 'beast' || b === 'rogue') {
    const id = `monster.${b === 'monster' ? 'common' : b}`
    return LOOT_TABLES[id] ? id : 'monster.common'
  }

  const exact = `${b}.${k}`
  if (LOOT_TABLES[exact]) return exact

  const rubble = `${b}.rubble`
  if (LOOT_TABLES[rubble]) return rubble

  if (LOOT_TABLES['city.rubble']) return 'city.rubble'
  return tableIds()[0]
}

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

/** 按权重抽一条（导出便于测试） */
export function pickEntry(entries, rand = Math.random) {
  if (!Array.isArray(entries) || !entries.length) return null
  let total = 0
  for (const e of entries) {
    const w = Number(e.weight)
    if (Number.isFinite(w) && w > 0) total += w
  }
  if (total <= 0) return entries[0]
  let r = rand() * total
  for (const e of entries) {
    const w = Number(e.weight)
    if (!Number.isFinite(w) || w <= 0) continue
    r -= w
    if (r < 0) return e
  }
  // 浮点兜底：返回最后一个正权重条目
  for (let i = entries.length - 1; i >= 0; i--) {
    const w = Number(entries[i].weight)
    if (Number.isFinite(w) && w > 0) return entries[i]
  }
  return entries[0]
}

function toCount(v, fallback = 1) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * 抽一个「内联掉落列表」：引擎里 monster/prop 的 def.loot 是
 * [{ id, chance, min, max }] 形状（见 README §4 / §8），它不是加权表，
 * 而是每条独立判定。为了兼容，也接受：
 *   - [{ id, n }]            固定数量列表
 *   - [{ id, weight, min, max }] 加权表（只抽一条）
 * @param {Array} list
 * @param {function|{next:function}} [rng=Math.random]
 * @returns {Array<{id:string, n:number}>}
 */
export function rollInlineLoot(list, rng = Math.random) {
  if (!Array.isArray(list) || !list.length) return []
  const rand = wrapRng(rng)
  const merged = new Map()
  const put = (id, n) => {
    if (!id || n <= 0) return
    merged.set(id, (merged.get(id) || 0) + n)
  }
  const finish = () => {
    const out = []
    for (const [id, n] of merged) out.push({ id, n })
    return out
  }

  const anyChance = list.some((e) => e && e.chance != null)
  const anyWeight = list.some((e) => e && Number(e.weight) > 0)

  if (anyChance) {
    // 逐条独立判定（怪物掉落的标准形状）
    for (const e of list) {
      if (!e || !e.id) continue
      const c = e.chance == null ? 1 : Number(e.chance)
      if (!(c > 0)) continue
      if (rand() > c) continue
      const min = e.min != null ? toCount(e.min) : e.n != null ? toCount(e.n) : 1
      const max = e.max != null ? toCount(e.max, min) : min
      put(e.id, randInt(rand, min, Math.max(min, max)))
    }
    return finish()
  }

  if (anyWeight) {
    const pick = pickEntry(list, rand)
    if (pick && pick.id) {
      const min = pick.min != null ? toCount(pick.min) : pick.n != null ? toCount(pick.n) : 1
      const max = pick.max != null ? toCount(pick.max, min) : min
      put(pick.id, randInt(rand, min, Math.max(min, max)))
    }
    return finish()
  }

  // 固定列表
  for (const e of list) {
    if (!e || !e.id) continue
    put(e.id, e.n != null ? toCount(e.n) : 1)
  }
  return finish()
}

/**
 * 抽一张表（也接受内联掉落数组，见 rollInlineLoot）。
 * @param {string|Array} tableId 表 id，或 [{id, chance, min, max}] 形状的数组
 * @param {function|{next:function}} [rng=Math.random] 可以是 Math.random，也可以是 makeRng() 的返回值
 * @returns {Array<{id:string, n:number}>} 已按 id 合并
 */
export function rollLoot(tableId, rng = Math.random) {
  if (Array.isArray(tableId)) return rollInlineLoot(tableId, rng)
  const table = LOOT_TABLES[tableId]
  if (!Array.isArray(table) || !table.length) return []
  const rand = wrapRng(rng)
  const [rmin, rmax] = rollsOf(tableId)
  const rolls = randInt(rand, rmin, rmax)

  const merged = new Map()
  for (let i = 0; i < rolls; i++) {
    const entry = pickEntry(table, rand)
    if (!entry || !entry.id) continue
    const chance = entry.chance == null ? 1 : Number(entry.chance)
    if (Number.isFinite(chance) && chance < 1 && rand() > chance) continue
    const min = Number.isFinite(Number(entry.min)) ? Number(entry.min) : 1
    const max = Number.isFinite(Number(entry.max)) ? Number(entry.max) : min
    const n = Math.max(0, randInt(rand, min, max))
    if (n <= 0) continue
    merged.set(entry.id, (merged.get(entry.id) || 0) + n)
  }

  const out = []
  for (const [id, n] of merged) out.push({ id, n })
  return out
}

/** 抽一个容器：等价于 rollLoot(tableFor(biome, kind), rng)，但返回表 id 方便调试 */
export function rollContainer(biome, kind, rng = Math.random) {
  const tableId = tableFor(biome, kind)
  return { tableId, drops: rollLoot(tableId, rng) }
}

/** 同一次抽取，多次投骰（rolls 倍），用于宝箱/首领 */
export function rollLootTimes(tableId, times, rng = Math.random) {
  const rand = wrapRng(rng)
  const merged = new Map()
  const t = Math.max(0, Math.floor(Number(times) || 0))
  for (let i = 0; i < t; i++) {
    for (const d of rollLoot(tableId, rand)) {
      merged.set(d.id, (merged.get(d.id) || 0) + d.n)
    }
  }
  const out = []
  for (const [id, n] of merged) out.push({ id, n })
  return out
}

// ---------------------------------------------------------------------------
// 自检（临时脚本用；也可在 dev 控制台手动跑）
// ---------------------------------------------------------------------------

/**
 * 校验：12 张 biome×kind 表齐全、条目 id 都在 catalog/lore 里、权重/数量合法。
 * @returns {{ok:boolean, missing:Array<string>, missingTables:Array<string>, badEntries:Array<string>, tables:number, entries:number}}
 */
export function validateLootTables() {
  const missingTables = []
  for (const biome of LOOT_BIOMES) {
    for (const kind of LOOT_KINDS) {
      if (!LOOT_TABLES[`${biome}.${kind}`]) missingTables.push(`${biome}.${kind}`)
    }
  }
  for (const id of MONSTER_TABLES) {
    if (!LOOT_TABLES[id]) missingTables.push(id)
  }

  const missing = []
  const badEntries = []
  let entries = 0
  for (const tableId of Object.keys(LOOT_TABLES)) {
    const list = LOOT_TABLES[tableId]
    if (!Array.isArray(list) || !list.length) {
      badEntries.push(`${tableId}:empty`)
      continue
    }
    for (const e of list) {
      entries++
      if (!e || typeof e.id !== 'string') {
        badEntries.push(`${tableId}:bad-id`)
        continue
      }
      if (!Content.has(KIND.ITEM, e.id)) missing.push(`${tableId}:${e.id}`)
      const w = Number(e.weight)
      if (!Number.isFinite(w) || w <= 0) badEntries.push(`${tableId}:${e.id}:weight`)
      const min = Number(e.min)
      const max = Number(e.max)
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) {
        badEntries.push(`${tableId}:${e.id}:range`)
      }
      if (e.chance != null && !(Number(e.chance) > 0 && Number(e.chance) <= 1)) {
        badEntries.push(`${tableId}:${e.id}:chance`)
      }
    }
  }

  return {
    ok: !missing.length && !missingTables.length && !badEntries.length,
    missing,
    missingTables,
    badEntries,
    tables: Object.keys(LOOT_TABLES).length,
    entries,
  }
}

export default {
  LOOT_TABLES,
  TABLE_META,
  LOOT_BIOMES,
  LOOT_KINDS,
  MONSTER_TABLES,
  tableFor,
  tableIds,
  tableMeta,
  entriesOf,
  rollsOf,
  pickEntry,
  rollLoot,
  rollInlineLoot,
  rollContainer,
  rollLootTimes,
  validateLootTables,
}
