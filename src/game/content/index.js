// 内容注册总入口：把所有数据模块 import 一遍，确保注册表在任何运行时系统之前就绪。
// 任何新内容模块都应该在这里挂一行 import（mod 则在运行时通过 ModLoader 注册）。
import '../loot/catalog.js'
import '../loot/lore-artifacts.js'
import '../loot/recipes.js'
import '../loot/loot-tables.js'
import '../weapons/data.js'
import '../quests/data/companions.js'
import '../quests/data/quests.js'
import '../quests/data/dialogues.js'
import '../chassis/index.js'
import '../tools/index.js'
import '../world/props-data.js'
import '../entities/monsters/index.js'

import { Content, KIND } from '../core/registry.js'

let booted = false

/** 幂等；返回注册统计，便于调试面板显示 */
export function bootstrapContent() {
  booted = true
  return Content.stats()
}

export function isContentReady() {
  return booted
}

export function contentSummary() {
  return {
    items: Content.count(KIND.ITEM),
    chassis: Content.count(KIND.CHASSIS),
    monsters: Content.count(KIND.MONSTER),
    quests: Content.count(KIND.QUEST),
    dialogues: Content.count(KIND.DIALOGUE),
    companions: Content.count(KIND.COMPANION),
    props: Content.count(KIND.PROP),
    tools: Content.count(KIND.TOOL),
    recipes: Content.count(KIND.RECIPE),
    lootTables: Content.count(KIND.LOOT_TABLE),
  }
}
