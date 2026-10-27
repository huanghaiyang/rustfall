// 大型敌人索引：import 即完成 4 个 Content.register（各文件自己注册）。
// 与 monsters/index.js 平行：小怪 / 大怪共用 KIND.MONSTER 注册表，但实例化入口分开，
// 这样刷怪导演可以分别控制「小怪上限 10」与「大型上限 2」。

import { Content, KIND } from '../../../core/registry.js'

import { JunkGolem } from './junk_golem.js'
import { SkyWarden } from './sky_warden.js'
import { MimicBeast } from './mimic_beast.js'
import { SwarmCore } from './swarm_core.js'
import { ClawTyrant, CyberPsychoBoss, EsperBerserk } from './tyrants.js'
import { THEME_BOSS_CLASSES, THEME_BOSS_IDS } from './theme-bosses.js'

/** 全部大型敌人 id（顺序稳定） */
export const LARGE_IDS = [
  'junk_golem',
  'sky_warden',
  'mimic_beast',
  'swarm_core',
  'claw_tyrant',
  'cyberpsycho_boss',
  'esper_berserk',
  ...THEME_BOSS_IDS,
]

/** 大型敌人 id → 类 */
const LARGE_CLASS_MAP = new Map([
  ['junk_golem', JunkGolem],
  ['sky_warden', SkyWarden],
  ['mimic_beast', MimicBeast],
  ['swarm_core', SwarmCore],
  ['claw_tyrant', ClawTyrant],
  ['cyberpsycho_boss', CyberPsychoBoss],
  ['esper_berserk', EsperBerserk],
  ...THEME_BOSS_CLASSES,
])

export { LARGE_CLASS_MAP }

/** 是否大型敌人 id */
export function isLarge(id) {
  return LARGE_CLASS_MAP.has(String(id || ''))
}

/**
 * 创建大型敌人。
 * @returns {BaseMonster|null} 未知 id / 构造失败时 null + warn
 */
export function createLargeMonster(game, id, x, y) {
  if (!game) {
    console.warn('[monsters:large] createLargeMonster 缺少 game')
    return null
  }
  const key = String(id || '')
  const Cls = LARGE_CLASS_MAP.get(key)
  if (!Cls) {
    console.warn(`[monsters:large] 未知大型敌人 "${id}"，可用：${LARGE_IDS.join(', ')}`)
    return null
  }
  const px = Number(x)
  const py = Number(y)
  try {
    return new Cls(game, Number.isFinite(px) ? px : 0, Number.isFinite(py) ? py : 0)
  } catch (err) {
    console.warn(`[monsters:large] 创建 "${id}" 失败`, err)
    return null
  }
}

/** 大型敌人 DEF（来自注册表） */
export function largeDef(id) {
  return Content.get(KIND.MONSTER, id) || null
}

/** 全部大型敌人 DEF */
export function largeDefs() {
  return LARGE_IDS.map((id) => largeDef(id)).filter(Boolean)
}

/** 某 biome 可用的大型敌人 id */
export function largeIdsForBiome(biome) {
  const all = largeDefs().filter((d) => !d.biome || d.biome.includes(biome))
  if (all.length) return all.map((d) => d.id)
  return [...LARGE_IDS]
}

/**
 * 房间类型 → 大型敌人「建议数量」（世界生成器没有给 largeEnemies 时的兜底）。
 * shelter / gate 不给大型敌人；arena 必给一只。
 */
export function largeCountForRoom(biome, roomKind = 'standard') {
  const kind = String(roomKind || 'standard').toLowerCase()
  if (kind === 'shelter') return 0
  if (kind === 'arena') return 1
  if (kind === 'gate') return 0
  return 1
}

export default {
  LARGE_IDS,
  LARGE_CLASS_MAP,
  createLargeMonster,
  isLarge,
  largeDef,
  largeDefs,
  largeIdsForBiome,
  largeCountForRoom,
}
