// 怪物总索引 —— 被 import 时即完成 8 个 Content.register（每个怪物文件自己注册），
// 同时把 id → 类 的映射集中在这里，供 director / 调试工具使用。
//
// 约定：每个怪物文件导出 `DEF`、具体类（如 `Radboar`）与 `CLASS` 别名。

import { Content, KIND } from '../../core/registry.js'

import { Radboar } from './radboar.js'
import { Crawler } from './crawler.js'
import { Spitter } from './spitter.js'
import { Wingrat } from './wingrat.js'
import { Sentry } from './sentry.js'
import { Scrapper } from './scrapper.js'
import { Drone } from './drone.js'
import { Hulkbot } from './hulkbot.js'
import { GhoulHusk, TunnelHound, CyberMantis, PsychoPunk } from './breeds.js'
import { BanditLookout, BanditLooter, BanditScav } from './bandits.js'
import {
  ServerWraith,
  WeldBrute,
  CultFanatic,
  AlienOrb,
  VaultPuppet,
  MineShade,
  BloodThrall,
  FogStalker,
  PunkRaider,
  CastleKnight,
  RogueAI,
  DarkWebGhost,
  ViralWraith,
  NanoSwarm,
} from './theme-minions.js'

/** 全部怪物 id（顺序稳定，UI/任务/图鉴可直接用） */
export const MONSTER_IDS = [
  'radboar',
  'crawler',
  'spitter',
  'wingrat',
  'sentry',
  'scrapper',
  'drone',
  'hulkbot',
  'ghoul_husk',
  'tunnel_hound',
  'cyber_mantis',
  'psycho_punk',
  'server_wraith',
  'weld_brute',
  'cult_fanatic',
  'alien_orb',
  'vault_puppet',
  'mine_shade',
  'blood_thrall',
  'fog_stalker',
  'punk_raider',
  'castle_knight',
  'rogue_ai',
  'dark_web_ghost',
  'viral_wraith',
  'nano_swarm',
  'bandit_lookout',
  'bandit_looter',
  'bandit_scav',
]

/** id → 类。index 只负责映射；实例化走 createMonster。 */
const CLASS_MAP = new Map([
  ['radboar', Radboar],
  ['crawler', Crawler],
  ['spitter', Spitter],
  ['wingrat', Wingrat],
  ['sentry', Sentry],
  ['scrapper', Scrapper],
  ['drone', Drone],
  ['hulkbot', Hulkbot],
  ['ghoul_husk', GhoulHusk],
  ['tunnel_hound', TunnelHound],
  ['cyber_mantis', CyberMantis],
  ['psycho_punk', PsychoPunk],
  ['server_wraith', ServerWraith],
  ['weld_brute', WeldBrute],
  ['cult_fanatic', CultFanatic],
  ['alien_orb', AlienOrb],
  ['vault_puppet', VaultPuppet],
  ['mine_shade', MineShade],
  ['blood_thrall', BloodThrall],
  ['fog_stalker', FogStalker],
  ['punk_raider', PunkRaider],
  ['castle_knight', CastleKnight],
  ['rogue_ai', RogueAI],
  ['dark_web_ghost', DarkWebGhost],
  ['viral_wraith', ViralWraith],
  ['nano_swarm', NanoSwarm],
  ['bandit_lookout', BanditLookout],
  ['bandit_looter', BanditLooter],
  ['bandit_scav', BanditScav],
])

export { CLASS_MAP }
export const MONSTER_CLASSES = CLASS_MAP

/**
 * 创建一个怪物实例。
 * @param {object} game  Game 实例（需要 room / player / sfx 等）
 * @param {string} id    怪物 id（见 MONSTER_IDS）
 * @param {number} x     世界坐标：脚底（地面）x
 * @param {number} y     世界坐标：脚底（地面）y
 * @returns {BaseMonster|null} 找不到 class 或构造失败时返回 null（并 warn）
 */
export function createMonster(game, id, x, y) {
  if (!game) {
    console.warn('[monsters] createMonster 缺少 game 实例')
    return null
  }
  if (!id) {
    console.warn('[monsters] createMonster 缺少 id')
    return null
  }
  const Cls = CLASS_MAP.get(id)
  if (!Cls) {
    console.warn(`[monsters] 未知怪物 id "${id}"，可用：${MONSTER_IDS.join(', ')}`)
    return null
  }
  const px = Number(x)
  const py = Number(y)
  try {
    return new Cls(game, Number.isFinite(px) ? px : 0, Number.isFinite(py) ? py : 0)
  } catch (err) {
    console.warn(`[monsters] 创建怪物 "${id}" 失败`, err)
    return null
  }
}

/** 怪物定义（来自注册表；不存在返回 null） */
export function monsterDef(id) {
  return Content.get(KIND.MONSTER, id) || null
}

/** 全部已注册的怪物定义 */
export function monsterDefs() {
  return Content.all(KIND.MONSTER)
}

/** 某 biome 可用的怪物 id 列表 */
export function monsterIdsForBiome(biome) {
  const all = Content.all(KIND.MONSTER).filter((d) => !d.biome || d.biome.includes(biome))
  if (all.length) return all.map((d) => d.id)
  return [...MONSTER_IDS]
}

/** 是否精英（高血量、必掉稀有物） */
export function isElite(id) {
  const def = monsterDef(id)
  return !!(def && def.elite)
}

/** 群刷数量区间（没有 pack 字段的怪物返回 null） */
export function monsterPackSize(id) {
  const def = monsterDef(id)
  if (!def || !Array.isArray(def.pack) || def.pack.length < 2) return null
  return [def.pack[0], def.pack[1]]
}

// 每个 biome 的「基准怪物密度」
const DENSITY = {
  city: 2,
  village: 2,
  factory: 3,
  dump: 3,
}

function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 10000) / 10000
}

/**
 * 按 biome / 房间类型给出「房间自带怪物数量」。
 * 玩家会反复进出同一房间，所以这里用 biome+roomKind 的确定性哈希做抖动，
 * 保证同一房间类型每次刷出来的数量观感一致。
 *
 * @param {string} biome   city | village | factory | dump
 * @param {string} roomKind standard | shelter | gate | arena | boss
 * @returns {number} 0 ~ 5
 */
export function monsterCountForBiome(biome, roomKind = 'standard') {
  const kind = String(roomKind || 'standard').toLowerCase()
  const b = String(biome || 'city').toLowerCase()
  if (kind === 'shelter') return 0
  if (kind === 'gate' || kind === 'boss') return 1
  if (kind === 'arena') return 5
  const base = DENSITY[b] ?? 2
  const h = hashString(`${b}:${kind}`)
  let n = base + (h > 0.72 ? 1 : h < 0.18 ? -1 : 0)
  if (n < 1) n = 1
  if (n > 3) n = 3
  return n
}

export default {
  MONSTER_IDS,
  createMonster,
  monsterDef,
  monsterDefs,
  monsterIdsForBiome,
  isElite,
  monsterPackSize,
  monsterCountForBiome,
}
