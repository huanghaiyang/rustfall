<script setup>
// =============================================================================
// InventoryPanel —— 背包 / 装备：6 组件槽 + 格子网格 + 分类 + 负重 + 详情
// 数据源：G.inventory / G.equipped / G.ui.{inventoryTab,selectedItem}
// 行为门面：A.selectItem / useItem / equipItem / dropItem / unequip
// =============================================================================
import { computed } from 'vue'
import PanelFrame from './PanelFrame.vue'
import ItemIcon from './ItemIcon.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'

const SLOTS = [
  { id: 'joint', label: '关节', en: 'JOINT' },
  { id: 'cpu', label: '处理器', en: 'CPU' },
  { id: 'power', label: '电源', en: 'POWER' },
  { id: 'armor', label: '装甲', en: 'ARMOR' },
  { id: 'sensor', label: '传感', en: 'SENSOR' },
  { id: 'utility', label: '工具臂', en: 'UTIL' },
]

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'material', label: '材料' },
  { id: 'component', label: '组件' },
  { id: 'tool', label: '工具' },
  { id: 'consumable', label: '消耗' },
  { id: 'artifact', label: '遗物' },
  { id: 'data', label: '数据' },
  { id: 'rare', label: '稀有' },
  { id: 'quest', label: '任务' },
  { id: 'weapon', label: '武器' },
  { id: 'ammo', label: '弹药' },
]

const RARITY = { 1: '常见', 2: '普通', 3: '精良', 4: '稀有', 5: '绝版' }

const CATEGORY = {
  material: '材料',
  component: '组件',
  tool: '工具',
  consumable: '消耗品',
  artifact: '遗物',
  data: '数据',
  rare: '稀有件',
  quest: '任务物品',
  weapon: '武器',
  ammo: '弹药',
}

const BONUS = {
  speed: '移速',
  jump: '跳跃',
  dig: '挖掘',
  carry: '负重',
  armor: '护甲',
  energy: '能量',
  energyMax: '能量上限',
  attack: '伤害',
  scan: '扫描',
  hp: '结构',
  stealth: '隐匿',
  powerMax: '电量上限',
}

// —— 空安全小工具 ——
function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
function act(name, ...args) {
  try {
    A?.[name]?.(...args)
  } catch (e) {
    /* 门面未就绪：静默 */
  }
}
function itemDef(id) {
  if (!id) return null
  try {
    return Content.get(KIND.ITEM, id) || null
  } catch (e) {
    return null
  }
}
// 槽位里可能存 id 字符串，也可能存 { id, n } / { itemId, count }
function slotInfo(s) {
  if (!s) return { id: '', count: 0 }
  if (typeof s === 'string') return { id: s, count: 1 }
  const id = s.id || s.itemId || s.item || ''
  const count = Math.max(1, Math.floor(num(s.n != null ? s.n : s.count != null ? s.count : s.qty, 1)))
  return { id, count }
}

// —— 背包内容 ——
const inv = computed(() => G.inventory || {})
const rawSlots = computed(() => (Array.isArray(inv.value.slots) ? inv.value.slots : []))
const items = computed(() => rawSlots.value.map(slotInfo).filter((it) => !!it.id))
const slotsMax = computed(() => Math.max(1, Math.floor(num(inv.value.slotsMax, 24))))

// 分类 tab 直接落在 G.ui.inventoryTab（唯一数据源，避免本地态与外部不一致）
const tab = computed({
  get: () => (G.ui && G.ui.inventoryTab) || 'all',
  set: (v) => {
    if (G.ui) G.ui.inventoryTab = v
  },
})

const tabCounts = computed(() => {
  const m = { all: items.value.length }
  for (const t of TABS) if (t.id !== 'all') m[t.id] = 0
  for (const it of items.value) {
    const d = itemDef(it.id)
    const c = (d && d.category) || 'material'
    m[c] = (m[c] || 0) + 1
  }
  return m
})

const filtered = computed(() => {
  if (tab.value === 'all') return items.value
  return items.value.filter((it) => {
    const d = itemDef(it.id)
    return ((d && d.category) || 'material') === tab.value
  })
})

// 补齐空格子：全部页补满容量上限，分类页补到整行，保持网格稳定
const cells = computed(() => {
  const out = filtered.value.map((it) => ({ id: it.id, count: it.count }))
  const min = tab.value === 'all' ? slotsMax.value : Math.ceil(Math.max(out.length, 6) / 6) * 6
  while (out.length < min) out.push({ id: '', count: 0 })
  return out
})

// —— 装备槽 ——
const equippedSlots = computed(() =>
  SLOTS.map((s) => {
    const info = slotInfo(G.equipped && G.equipped[s.id])
    return { id: s.id, label: s.label, en: s.en, itemId: info.id, count: info.count }
  }),
)

// —— 负重 ——
const weight = computed(() => {
  const w = Math.max(0, num(inv.value.weight))
  const cap = Math.max(1, num(inv.value.capacityWeight, 42))
  return { w, cap, pct: Math.min(1, w / cap) }
})
const weightTone = computed(() => {
  const p = weight.value.pct
  if (p >= 0.92) return 'danger'
  if (p >= 0.72) return 'warn'
  return 'toxic'
})
const weightPct = computed(() => Math.round(weight.value.pct * 100))

// —— 选中详情 ——
const selId = computed(() => {
  const s = G.ui && G.ui.selectedItem
  if (!s) return ''
  if (typeof s === 'string') return s
  return s.id || ''
})
const selEntry = computed(() => items.value.find((i) => i.id === selId.value) || null)
const selCount = computed(() => (selEntry.value ? selEntry.value.count : 0))
const selDef = computed(() => itemDef(selId.value))

const rarity = computed(() => {
  const r = Math.round(num(selDef.value && selDef.value.rarity, 1))
  return Math.max(1, Math.min(5, r))
})
const rarityLabel = computed(() => RARITY[rarity.value] || '常见')
const categoryLabel = computed(() => CATEGORY[(selDef.value && selDef.value.category) || 'material'] || '材料')

const slotLabel = computed(() => {
  const s = selDef.value && selDef.value.slot
  if (!s) return ''
  const f = SLOTS.find((x) => x.id === s)
  return f ? f.label : String(s)
})

const bonusList = computed(() => {
  const b = (selDef.value && selDef.value.bonus) || null
  if (!b || typeof b !== 'object') return []
  return Object.keys(b).map((k) => {
    const v = b[k]
    let text = String(v)
    if (typeof v === 'number') {
      if (Math.abs(v) < 1) text = `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`
      else text = `${v > 0 ? '+' : ''}${v}`
    }
    return { key: k, label: BONUS[k] || k, text, good: !(typeof v === 'number' && v < 0) }
  })
})

const EFFECT_LABEL = {
  energy: '补充电量',
  heal: '修复结构',
  repair: '维修机体',
  scan: '脉冲扫描',
  cleanse: '中和酸液',
  radClear: '清除辐射',
  light: '临时照明',
  buff: '施加临时增益',
}

const selPurpose = computed(() => {
  const d = selDef.value
  if (!d) return ''
  const parts = []
  const cat = d.category || 'material'
  if (cat === 'weapon') parts.push('装备到武器栏（十字键左右 / 数字键切换），攻击时消耗能量与弹药。')
  else if (cat === 'ammo') {
    const forIds = Array.isArray(d.ammoFor) ? d.ammoFor : d.ammoFor ? [d.ammoFor] : []
    parts.push(forIds.length ? `为 ${forIds.join(' / ')} 供弹。` : '为对应武器供弹。')
  } else if (cat === 'consumable') parts.push('一次性消耗品：使用后从背包移除。')
  else if (cat === 'tool') parts.push('工具：装备后握在机械臂上，用于采集、维修或切割。')
  else if (cat === 'artifact') parts.push('遗物：可收藏、可交易，部分会解锁档案条目。')
  else if (cat === 'data') parts.push('数据载体：可在终端读取，解锁档案与研究条目。')
  else if (cat === 'quest') parts.push('任务相关物品：不要随便丢弃。')
  if (d.slot) {
    const f = SLOTS.find((x) => x.id === d.slot)
    parts.push(`安装到「${f ? f.label : d.slot}」槽位，提供持续被动加成。`)
  }
  if (d.use && typeof d.use === 'object') {
    const keys = Object.keys(d.use).filter((k) => EFFECT_LABEL[k]).map((k) => EFFECT_LABEL[k])
    if (keys.length) parts.push(`使用效果：${keys.join('、')}。`)
  }
  if (!parts.length) parts.push('基础物资：可拆解为零件，或卖给避难所换取废料券。')
  return parts.join(' ')
})


const canUse = computed(() => !!(selDef.value && selDef.value.use))
const canEquip = computed(() => !!(selDef.value && selDef.value.slot))
const canDrop = computed(() => !!selEntry.value)

function select(id) {
  if (!id) return
  act('selectItem', id)
}
function setTab(id) {
  tab.value = id
}
function useIt() {
  if (selId.value) act('useItem', selId.value)
}
function equipIt() {
  if (selId.value) act('equipItem', selId.value)
}
function dropOne() {
  if (selId.value) act('dropItem', selId.value, 1)
}
function dropAll() {
  if (selId.value && selCount.value > 0) act('dropItem', selId.value, selCount.value)
}
function unequip(slot) {
  act('unequip', slot)
}
</script>

<template>
  <PanelFrame title="背包" subtitle="INVENTORY / LOADOUT" wide>
    <div class="inv">
      <!-- 装备槽 + 负重 -->
      <section class="inv-top">
        <div class="eq-row">
          <div v-for="s in equippedSlots" :key="s.id" class="eq-slot" :class="{ filled: !!s.itemId }">
            <div class="eq-label">
              <b>{{ s.label }}</b>
              <em>{{ s.en }}</em>
            </div>
            <button
              class="eq-cell"
              type="button"
              :title="s.itemId ? '选中已装备的组件' : s.label + ' 槽为空'"
              :disabled="!s.itemId"
              @click="select(s.itemId)"
            >
              <ItemIcon v-if="s.itemId" :item-id="s.itemId" :size="24" />
              <span v-else class="eq-empty">空</span>
            </button>
            <button
              class="rp-icon-btn eq-off"
              type="button"
              title="卸下"
              :disabled="!s.itemId"
              @click="unequip(s.id)"
            >
              ×
            </button>
          </div>
        </div>

        <div class="load">
          <div class="load-head">
            <span>负重</span>
            <span class="load-num" :class="weightTone">
              {{ weight.w.toFixed(1) }} / {{ weight.cap.toFixed(0) }} kg
            </span>
          </div>
          <div class="rp-bar">
            <i :class="weightTone" :style="{ width: weightPct + '%' }" />
          </div>
          <div class="load-foot">
            <span class="rp-small rp-dim">格子 {{ items.length }} / {{ slotsMax }}</span>
            <span class="rp-small" :class="'rp-' + weightTone">{{ weightPct }}%</span>
          </div>
        </div>
      </section>

      <!-- 分类 -->
      <nav class="rp-tabs" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="rp-tab"
          :class="{ on: tab === t.id }"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          @click="setTab(t.id)"
        >
          {{ t.label }}<span v-if="tabCounts[t.id]" class="n">{{ tabCounts[t.id] }}</span>
        </button>
      </nav>

      <!-- 网格 + 详情 -->
      <div class="rp-split inv-main">
        <div class="grid-wrap rp-scroll">
          <div class="rp-grid bag">
            <button
              v-for="(c, i) in cells"
              :key="c.id ? c.id + ':' + i : 'e' + i"
              class="rp-cell"
              :class="{ sel: !!c.id && c.id === selId, empty: !c.id }"
              type="button"
              :disabled="!c.id"
              :title="c.id || ''"
              @click="select(c.id)"
            >
              <ItemIcon v-if="c.id" :item-id="c.id" :size="26" :count="c.count" />
            </button>
          </div>
          <p v-if="!items.length" class="rp-empty bag-empty">
            <span class="big">背包是空的</span>
            <span>在废墟里翻找货箱、拆解残骸，能捡到还能用的东西。</span>
          </p>
        </div>

        <aside class="det">
          <template v-if="selDef">
            <div class="det-head">
              <div class="det-icon">
                <ItemIcon :item-id="selId" :size="44" />
              </div>
              <div class="det-name">
                <div class="n rc" :class="'rp-r' + rarity">{{ selDef.name || selId }}</div>
                <div class="e">{{ selDef.en || '—' }}</div>
                <div class="tags">
                  <span class="rp-tag" :class="'rp-r' + rarity">{{ rarityLabel }}</span>
                  <span class="rp-tag">{{ categoryLabel }}</span>
                  <span v-if="slotLabel" class="rp-tag neon">{{ slotLabel }}</span>
                </div>
              </div>
            </div>

            <div class="rp-sep" />

            <div class="kv-grid">
              <div class="rp-kv"><span class="k">重量</span><span class="v">{{ num(selDef.weight, 0).toFixed(1) }} kg</span></div>
              <div class="rp-kv"><span class="k">价值</span><span class="v">{{ num(selDef.value, 0) }} 废料券</span></div>
              <div class="rp-kv">
                <span class="k">持有</span>
                <span class="v">{{ selCount }} / {{ num(selDef.stack, 1) }}</span>
              </div>
              <div class="rp-kv"><span class="k">编号</span><span class="v">{{ selId }}</span></div>
            </div>

            <p class="desc">{{ selDef.desc || '（没有留下任何说明。）' }}</p>

            <div class="purpose">
              <div class="lore-title">用途</div>
              <p class="rp-prose">{{ selPurpose }}</p>
            </div>

            <div v-if="bonusList.length" class="bonus">
              <div class="bonus-title">组件加成</div>
              <div v-for="b in bonusList" :key="b.key" class="bonus-row">
                <span class="k">{{ b.label }}</span>
                <span class="v" :class="b.good ? 'rp-toxic' : 'rp-danger'">{{ b.text }}</span>
              </div>
            </div>

            <div v-if="selDef.lore" class="lore rp-scroll">
              <div class="lore-title">档案摘录</div>
              <p class="rp-prose">{{ selDef.lore }}</p>
            </div>

            <div class="actions">
              <button class="rp-btn primary" type="button" :disabled="!canUse" @click="useIt">使用</button>
              <button class="rp-btn" type="button" :disabled="!canEquip" @click="equipIt">装备</button>
              <button class="rp-btn danger" type="button" :disabled="!canDrop" @click="dropOne">丢弃 1</button>
              <button v-if="selCount > 1" class="rp-btn danger" type="button" @click="dropAll">
                全部丢弃
              </button>
            </div>
            <div v-if="!canUse && !canEquip" class="rp-hint">
              该物件不可直接使用，也不安装进组件槽。可以拆解或卖给避难所。
            </div>
          </template>

          <div v-else class="rp-empty det-empty">
            <span class="big">未选择</span>
            <span>在左侧点选一件物品查看详情。</span>
          </div>
        </aside>
      </div>
    </div>

    <template #foot>
      <span>点击格子选中 · <kbd>1</kbd>-<kbd>9</kbd> 切换分类（游戏内按键由此面板之外处理）</span>
      <span class="rp-grow" />
      <span class="rp-dim">负重超限会影响移动速度</span>
    </template>
  </PanelFrame>
</template>

<style scoped>
.inv {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* —— 装备槽 + 负重 —— */
.inv-top {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.eq-row {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}

.eq-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px;
  background: rgba(13, 17, 19, 0.7);
  border: 1px solid var(--c-steel);
}

.eq-slot.filled {
  border-color: rgba(192, 112, 56, 0.65);
  background: rgba(138, 75, 38, 0.12);
}

.eq-label {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}
.eq-label b {
  font-family: var(--font-title);
  font-size: 11px;
  color: var(--c-sand);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.eq-label em {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  color: var(--c-bone-dark);
  font-style: normal;
}

.eq-cell {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  padding: 0;
  background: rgba(7, 9, 11, 0.85);
  border: 1px solid rgba(58, 68, 75, 0.8);
  cursor: pointer;
}
.eq-cell:disabled {
  cursor: default;
}
.eq-cell:not(:disabled):hover {
  border-color: var(--c-rust-light);
}
.eq-empty {
  font-size: 9px;
  color: var(--c-bone-dark);
  opacity: 0.7;
}
.eq-off {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  font-size: 10px;
}

.load {
  flex: 0 0 168px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 7px 9px;
  background: rgba(13, 17, 19, 0.7);
  border: 1px solid var(--c-steel);
}
.load-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
}
.load-num {
  font-family: var(--font-mono);
  color: var(--c-bone);
}
.load-foot {
  display: flex;
  justify-content: space-between;
}

/* —— 网格 —— */
.inv-main {
  gap: 10px;
  min-height: 0;
}

.grid-wrap {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.bag {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 3px;
}

.bag-empty {
  margin: 8px 0 0;
}

/* —— 详情 —— */
.det {
  flex: 0 0 320px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px),
    rgba(10, 13, 15, 0.75);
  border: 1px solid var(--c-steel);
  overflow-y: auto;
}

.det-head {
  display: flex;
  gap: 9px;
  align-items: flex-start;
}

.det-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  background: rgba(7, 9, 11, 0.9);
  border: 1px solid var(--c-steel-light);
}

.det-name {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.det-name .n {
  font-family: var(--font-title);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.25;
  color: var(--rc, var(--c-white));
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.9);
}
.det-name .e {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--c-bone-dark);
  text-transform: uppercase;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 3px;
}

.kv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px 10px;
}

.desc {
  margin: 2px 0;
  font-family: var(--font-title);
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-bone);
}

.bonus {
  padding: 6px 8px;
  background: rgba(143, 174, 58, 0.07);
  border-left: 2px solid var(--c-toxic);
}
.bonus-title,
.lore-title {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--c-bone-dark);
  margin-bottom: 3px;
}
.bonus-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  line-height: 1.6;
}
.bonus-row .k {
  color: var(--c-bone-dark);
}

.lore {
  padding: 6px 8px;
  max-height: 132px;
  overflow-y: auto;
  background: rgba(201, 176, 133, 0.05);
  border-left: 2px solid var(--c-ochre);
}
.lore .rp-prose,
.purpose .rp-prose {
  font-size: 11px;
  line-height: 1.7;
  margin: 0;
}
.purpose {
  padding: 6px 8px;
  background: rgba(111, 240, 208, 0.05);
  border-left: 2px solid var(--c-neon);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid rgba(58, 68, 75, 0.6);
}

.det-empty {
  border-style: dashed;
}

/* —— 窄屏 —— */
@media (max-width: 860px) {
  .inv-top {
    flex-direction: column;
  }
  .load {
    flex: 0 0 auto;
  }
  .inv-main {
    flex-direction: column;
  }
  .det {
    flex: 0 0 auto;
    max-height: 40%;
  }
}
</style>
