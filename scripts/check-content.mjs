// 内容完整性校验：物品/任务/对话/同伴/机体/怪物定义交叉引用
// 用法：node scripts/check-content.mjs
import { Content, KIND } from '../src/game/core/registry.js'
import '../src/game/loot/catalog.js'
import '../src/game/loot/lore-artifacts.js'
import '../src/game/loot/recipes.js'
import '../src/game/loot/loot-tables.js'
import '../src/game/quests/data/companions.js'
import '../src/game/quests/data/quests.js'
import '../src/game/quests/data/dialogues.js'
import '../src/game/chassis/index.js'
import '../src/game/tools/index.js'

const errs = []
const warn = []
const items = new Set(Content.all(KIND.ITEM).map((i) => i.id))
const chassis = new Set(Content.all(KIND.CHASSIS).map((c) => c.id))
const monsters = new Set(['radboar', 'crawler', 'spitter', 'wingrat', 'sentry', 'scrapper', 'drone', 'hulkbot', 'mod_scraphound'])
const companions = new Set(Content.all(KIND.COMPANION).map((c) => c.id))
const quests = new Set(Content.all(KIND.QUEST).map((q) => q.id))
const rooms = new Set([
  'city_shelter','city_street','city_plaza','city_slum','city_tower','city_gate',
  'village_shelter','village_field','village_house','village_well','village_barn','village_gate',
  'factory_shelter','factory_line','factory_hall','factory_furnace','factory_control','factory_gate',
  'dump_shelter','dump_pit','dump_mountain','dump_crane','dump_core','dump_gate',
])
const landmarks = new Set(['relay_a','relay_b','relay_c','antenna_signal','generator_city','generator_village','generator_factory','generator_dump'])

console.log(`items=${items.size} chassis=${chassis.size} companions=${companions.size} quests=${quests.size} dialogues=${Content.count(KIND.DIALOGUE)}`)

// 每个物品的必要字段
for (const it of Content.all(KIND.ITEM)) {
  for (const f of ['name', 'category', 'desc']) if (!it[f]) errs.push(`item ${it.id} 缺字段 ${f}`)
  if (typeof it.rarity !== 'number') warn.push(`item ${it.id} 缺 rarity`)
  if (it.slot && !['joint', 'cpu', 'power', 'armor', 'sensor', 'utility'].includes(it.slot)) errs.push(`item ${it.id} slot 非法: ${it.slot}`)
}

// 同伴
for (const c of Content.all(KIND.COMPANION)) {
  if (!c.name || !c.shelter) errs.push(`companion ${c.id} 缺 name/shelter`)
  if (!rooms.has(c.shelter)) errs.push(`companion ${c.id} shelter 房间不存在: ${c.shelter}`)
  if (c.dialogue && !Content.has(KIND.DIALOGUE, c.dialogue)) errs.push(`companion ${c.id} dialogue 不存在: ${c.dialogue}`)
  if (c.rescue) {
    if (!quests.has(c.rescue.quest)) errs.push(`companion ${c.id} rescue.quest 不存在: ${c.rescue.quest}`)
    if (!rooms.has(c.rescue.room)) errs.push(`companion ${c.id} rescue.room 不存在: ${c.rescue.room}`)
  }
}

// 对话
const dialogueRe = /\$?\{?(?:require|item)?[^a-z]?/i
for (const d of Content.all(KIND.DIALOGUE)) {
  if (!d.nodes || !d.nodes[d.startNode || 'start']) errs.push(`dialogue ${d.id} 缺 start 节点`)
  for (const [nid, node] of Object.entries(d.nodes || {})) {
    if (node.next && !d.nodes[node.next]) errs.push(`dialogue ${d.id} 节点 ${nid} 的 next 不存在: ${node.next}`)
    for (const ch of node.choices || []) {
      if (ch.next && !d.nodes[ch.next]) errs.push(`dialogue ${d.id} 节点 ${nid} 选项 next 不存在: ${ch.next}`)
      if (ch.require?.item && !items.has(ch.require.item.id)) errs.push(`dialogue ${d.id} 选项 require.item 不存在: ${ch.require.item.id}`)
      if (ch.require?.quest && !quests.has(ch.require.quest)) errs.push(`dialogue ${d.id} 选项 require.quest 不存在: ${ch.require.quest}`)
    }
    for (const ef of node.effects || []) {
      if (ef.type === 'giveItem' || ef.type === 'takeItem') {
        if (!items.has(ef.id)) errs.push(`dialogue ${d.id} effect item 不存在: ${ef.id}`)
      }
      if (ef.type === 'startQuest' || ef.type === 'completeQuest') {
        if (!quests.has(ef.id)) errs.push(`dialogue ${d.id} effect quest 不存在: ${ef.id}`)
      }
      if (ef.type === 'unlockChassis' && !chassis.has(ef.id)) errs.push(`dialogue ${d.id} effect chassis 不存在: ${ef.id}`)
    }
  }
}

// 任务
for (const q of Content.all(KIND.QUEST)) {
  if (!q.title || !q.type) errs.push(`quest ${q.id} 缺 title/type`)
  if (q.giver && !companions.has(q.giver)) errs.push(`quest ${q.id} giver 不存在: ${q.giver}`)
  if (!q.objectives?.length) errs.push(`quest ${q.id} 没有 objectives`)
  for (const o of q.objectives || []) {
    if (!o.type || !o.target) errs.push(`quest ${q.id} objective ${o.id} 缺 type/target`)
    if (['collect', 'deliver'].includes(o.type) && !items.has(o.target) && !o.target.startsWith('tag:')) errs.push(`quest ${q.id} objective ${o.id} item 不存在: ${o.target}`)
    if (o.type === 'kill' && !monsters.has(o.target) && !o.target.startsWith('family:')) errs.push(`quest ${q.id} objective ${o.id} 怪物不存在: ${o.target}`)
    if (['reach', 'inspect'].includes(o.type) && !rooms.has(o.target) && !landmarks.has(o.target) && !['terminal', 'grave'].includes(o.target)) errs.push(`quest ${q.id} objective ${o.id} 目标房间/地标不存在: ${o.target}`)
    if (o.type === 'repair' && !landmarks.has(o.target)) errs.push(`quest ${q.id} objective ${o.id} 地标不存在: ${o.target}`)
    if (o.type === 'talk' && !companions.has(o.target)) errs.push(`quest ${q.id} objective ${o.id} NPC 不存在: ${o.target}`)
    if (o.type === 'rescue' && !quests.has(o.target) && !quests.has(String(o.target))) errs.push(`quest ${q.id} objective ${o.id} 营救任务不存在: ${o.target}`)
  }
  for (const r of q.rewards?.items || []) if (!items.has(r.id)) errs.push(`quest ${q.id} 奖励物品不存在: ${r.id}`)
  for (const c of q.rewards?.unlockChassis || []) if (!chassis.has(c)) errs.push(`quest ${q.id} 奖励机体不存在: ${c}`)
  if (q.next && !quests.has(q.next)) errs.push(`quest ${q.id} next 不存在: ${q.next}`)
}

// 配方 / 掉落表
for (const r of Content.all(KIND.RECIPE)) {
  for (const inp of r.inputs || []) if (!items.has(inp.id)) errs.push(`recipe ${r.id} 输入物品不存在: ${inp.id}`)
  if (r.output && !items.has(r.output.id)) errs.push(`recipe ${r.id} 输出物品不存在: ${r.output.id}`)
}
for (const t of Content.all(KIND.LOOT_TABLE)) {
  for (const e of t.entries || t.loot || []) if (!items.has(e.id)) errs.push(`lootTable ${t.id} 物品不存在: ${e.id}`)
}

console.log(`WARN ${warn.length}`)
for (const w of warn.slice(0, 12)) console.log('  warn:', w)
console.log(`ERROR ${errs.length}`)
for (const e of errs.slice(0, 40)) console.log('  err:', e)
process.exit(errs.length ? 1 : 0)
