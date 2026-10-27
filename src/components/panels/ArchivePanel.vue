<script setup>
// =============================================================================
// ArchivePanel —— 遗物档案：分类 / 已读未读 / 左列表 + 右长文（item.lore）
// 数据源：G.archive.{entries,unread} / G.ui.selectedArchive
// 内容源：Content.all(KIND.ITEM)（有 lore 或属于 artifact/data）+ Content.all(KIND.LORE)
// 行为门面：A.selectArchive(id)
// =============================================================================
import { computed, ref, reactive } from 'vue'
import PanelFrame from './PanelFrame.vue'
import ItemIcon from './ItemIcon.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'artifact', label: '遗物' },
  { id: 'data', label: '数据' },
  { id: 'lore', label: '记录' },
]

const CAT_LABEL = { artifact: '人类遗物', data: '数据载体', lore: '手写记录', rare: '稀有遗存' }
const RARITY = { 1: '常见', 2: '普通', 3: '精良', 4: '稀有', 5: '绝版' }

function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
function str(v, d = '') {
  return typeof v === 'string' ? v : v == null ? d : String(v)
}
function act(name, ...args) {
  try {
    A?.[name]?.(...args)
  } catch (e) {
    /* 门面未就绪：静默 */
  }
}

// —— 档案全集（来自注册表）——
const universe = computed(() => {
  const map = new Map()
  let items = []
  try {
    items = Content.all(KIND.ITEM)
  } catch (e) {
    items = []
  }
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.id) continue
    const lore = typeof it.lore === 'string' ? it.lore.trim() : ''
    const isArchive = it.category === 'artifact' || it.category === 'data'
    if (!lore && !isArchive) continue
    map.set(it.id, {
      id: it.id,
      kind: 'item',
      name: it.name || it.id,
      en: it.en || '',
      category: it.category === 'data' ? 'data' : 'artifact',
      rarity: Math.max(1, Math.min(5, Math.round(num(it.rarity, 1)))),
      lore: lore || String(it.desc || ''),
      desc: String(it.desc || ''),
      weight: num(it.weight, 0),
      value: num(it.value, 0),
    })
  }
  let lores = []
  try {
    lores = Content.all(KIND.LORE)
  } catch (e) {
    lores = []
  }
  for (const l of Array.isArray(lores) ? lores : []) {
    if (!l || !l.id || map.has(l.id)) continue
    const text = String(l.text || l.body || l.lore || l.desc || '')
    map.set(l.id, {
      id: l.id,
      kind: 'lore',
      name: l.title || l.name || l.id,
      en: l.en || '',
      category: 'lore',
      rarity: Math.max(1, Math.min(5, Math.round(num(l.rarity, 3)))),
      lore: text,
      desc: String(l.desc || ''),
      weight: 0,
      value: 0,
    })
  }
  return [...map.values()]
})

// —— 已收集 ——
// G.archive.entries 里混着两种东西：
//   · 字符串 id   —— 捡到带 lore 的物品时由 game.addArchive() push
//   · 对象条目     —— 对话 effect:{type:'archive'} 授予，自带 { id, title, lore, from, cycle }
const collectedMap = computed(() => {
  const m = new Map()
  const arr = G.archive && Array.isArray(G.archive.entries) ? G.archive.entries : []
  for (const raw of arr) {
    if (!raw) continue
    if (typeof raw === 'string') {
      if (!m.has(raw)) m.set(raw, {})
      continue
    }
    const id = raw.id || raw.itemId || raw.loreId || raw.key || ''
    if (!id) continue
    m.set(id, raw)
  }
  return m
})

// 运行时只维护一个全局 unread 计数，没有逐条已读标记；
// 这里按入档顺序把最后 N 条视作未读，并在本次会话内打开即消。
const openedIds = reactive(new Set())

const unreadIds = computed(() => {
  const arr = G.archive && Array.isArray(G.archive.entries) ? G.archive.entries : []
  const ids = arr
    .map((raw) => (typeof raw === 'string' ? raw : (raw && (raw.id || raw.itemId)) || ''))
    .filter(Boolean)
  const n = Math.max(0, Math.floor(num(G.archive && G.archive.unread, 0)))
  const set = new Set()
  for (const id of ids.slice(Math.max(0, ids.length - n))) set.add(id)
  return set
})

const entries = computed(() => {
  const collected = collectedMap.value
  const byId = new Map()
  // 1) 目录候选：未收集的显示成 ???
  for (const e of universe.value) byId.set(e.id, e)
  // 2) 已入档但目录里没有的条目（对话直接授予）：用条目自带内容补齐
  for (const [id, raw] of collected) {
    const base = byId.get(id)
    const title = str(raw.title) || (base && base.name) || id
    const lore = str(raw.lore) || (base && base.lore) || ''
    if (base) {
      byId.set(id, { ...base, name: title, lore, from: str(raw.from), cycle: raw.cycle })
    } else {
      byId.set(id, {
        id,
        kind: 'entry',
        name: title,
        en: '',
        category: 'lore',
        rarity: 3,
        lore,
        desc: '',
        weight: 0,
        value: 0,
        from: str(raw.from),
        cycle: raw.cycle,
      })
    }
  }
  // 3) 收集 / 未读状态
  const unreadSet = unreadIds.value
  return [...byId.values()].map((e) => {
    const has = collected.has(e.id)
    return {
      ...e,
      collected: has,
      unread: has && unreadSet.has(e.id) && !openedIds.has(e.id),
      title: has ? e.name : '???',
    }
  })
})

const total = computed(() => entries.value.length)
const found = computed(() => entries.value.filter((e) => e.collected).length)
const progress = computed(() => (total.value ? Math.round((found.value / total.value) * 100) : 0))

const unread = computed(() => Math.max(0, Math.floor(num(G.archive && G.archive.unread, 0))))

// —— 分类 ——
const tab = ref('all')
const tabCounts = computed(() => {
  const c = { all: 0 }
  for (const e of entries.value) {
    c[e.category] = (c[e.category] || 0) + (e.collected ? 1 : 0)
    if (e.collected) c.all++
  }
  return c
})

const list = computed(() => {
  const arr = tab.value === 'all' ? entries.value : entries.value.filter((e) => e.category === tab.value)
  return arr.slice().sort((a, b) => {
    if (a.collected !== b.collected) return a.collected ? -1 : 1
    return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
  })
})

// —— 选中 ——
const selId = computed(() => {
  const s = G.ui && G.ui.selectedArchive
  if (!s) return ''
  return typeof s === 'string' ? s : s.id || ''
})

const selected = computed(() => {
  const id = selId.value
  if (id) {
    const hit = entries.value.find((e) => e.id === id)
    if (hit) return hit
  }
  return entries.value.find((e) => e.collected) || null
})

const paragraphs = computed(() => {
  const s = selected.value
  if (!s || !s.collected) return []
  const text = String(s.lore || s.desc || '').replace(/\r/g, '')
  if (!text) return []
  return text.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean)
})

const rarityLabel = computed(() => (selected.value ? RARITY[selected.value.rarity] || '普通' : ''))
const catLabel = computed(() => (selected.value ? CAT_LABEL[selected.value.category] || '遗物' : ''))

function select(id) {
  if (!id) return
  openedIds.add(id)
  act('selectArchive', id)
}
</script>

<template>
  <PanelFrame title="档案" subtitle="ARCHIVE / HUMAN RELICS" wide>
    <div class="ar">
      <!-- 进度条 -->
      <header class="ar-top">
        <div class="ar-title">遗物档案</div>
        <div class="ar-prog">
          <span class="rp-bar thin ar-bar"><i class="warn" :style="{ width: progress + '%' }" /></span>
          <span class="ar-num">{{ found }} / {{ total }}</span>
        </div>
        <span v-if="unread > 0" class="rp-badge red unread">{{ unread }} 未读</span>
        <span v-else class="rp-tag">全部已读</span>
      </header>

      <nav class="rp-tabs">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="rp-tab"
          :class="{ on: tab === t.id }"
          type="button"
          @click="tab = t.id"
        >
          {{ t.label }}<span v-if="tabCounts[t.id] !== undefined" class="n">{{ tabCounts[t.id] || 0 }}</span>
        </button>
      </nav>

      <div class="rp-split ar-main">
        <!-- 左：列表 -->
        <div class="ar-list rp-scroll">
          <button
            v-for="e in list"
            :key="e.id"
            class="rp-row ar-row"
            :class="{ sel: selected && selected.id === e.id, locked: !e.collected }"
            type="button"
            :title="e.collected ? e.name : '未收集'"
            @click="select(e.id)"
          >
            <span class="ar-icon">
              <ItemIcon v-if="e.collected && e.kind === 'item'" :item-id="e.id" :size="20" />
              <span v-else class="qmark">{{ e.collected ? '版' : '?' }}</span>
            </span>
            <span class="rp-row-main">
              <span class="rp-row-title" :class="{ 'rp-dim': !e.collected }">{{ e.title }}</span>
              <span class="rp-row-sub">
                <template v-if="e.collected">{{ e.en || CAT_LABEL[e.category] || '档案' }}</template>
                <template v-else>未收集 · 在废墟中寻找</template>
              </span>
            </span>
            <span class="rp-row-tail">
              <span v-if="e.collected && e.unread" class="rp-dot" title="未读" />
              <span v-else-if="e.collected" class="read-mark">已读</span>
            </span>
          </button>

          <div v-if="!list.length" class="rp-empty">
            <span class="big">档案柜是空的</span>
            <span>还没有任何可归档的遗物。</span>
          </div>
        </div>

        <!-- 右：长文 -->
        <aside class="ar-detail rp-scroll">
          <template v-if="selected && selected.collected">
            <div class="d-head">
              <span class="rp-tag">{{ catLabel }}</span>
              <span class="rp-tag" :class="'rp-r' + selected.rarity">{{ rarityLabel }}</span>
              <span class="rp-grow" />
              <span class="d-id">{{ selected.id }}</span>
            </div>

            <h3 class="d-title rc" :class="'rp-r' + selected.rarity">{{ selected.name }}</h3>
            <div class="d-en">{{ selected.en || '—' }}</div>

            <div class="d-stats">
              <span v-if="selected.kind === 'item'">重量 {{ selected.weight.toFixed(1) }} kg</span>
              <span v-if="selected.kind === 'item'">估值 {{ selected.value }} 券</span>
              <span>{{ paragraphs.length }} 段记录</span>
              <span v-if="selected.from">来自 {{ selected.from }}</span>
              <span v-if="selected.cycle">第 {{ selected.cycle }} 循环</span>
            </div>

            <div class="rp-sep" />

            <div class="d-text">
              <p v-for="(p, i) in paragraphs" :key="i" class="rp-prose">{{ p }}</p>
              <p v-if="!paragraphs.length" class="rp-prose dim">（这一页被雨水泡烂了，只剩纤维。）</p>
            </div>

            <footer class="d-foot">
              <span class="rp-dim">档案编号</span>
              <span class="mono">{{ selected.id.toUpperCase() }}</span>
              <span class="rp-grow" />
              <span v-if="!selected.unread" class="rp-dim">已归档</span>
              <span v-else class="rp-neon">新收录</span>
            </footer>
          </template>

          <template v-else-if="selected">
            <div class="locked-detail">
              <div class="big-q">?</div>
              <div class="l-title">未收集</div>
              <p class="l-text">
                这份档案还没有被找到。它可能在某个抽屉里、某具遗体的口袋里，
                或者被压在某块预制板下面——雨停之前去找。
              </p>
              <div class="l-id rp-dim">编号 {{ selected.id }}</div>
            </div>
          </template>

          <div v-else class="rp-empty">
            <span class="big">未选择档案</span>
            <span>从左侧选择一份遗物。</span>
          </div>
        </aside>
      </div>
    </div>

    <template #foot>
      <span>遗物不占背包 · 捡到即归档</span>
      <span class="rp-grow" />
      <span class="rp-dim">档案里的信息有时能打开新的对话</span>
    </template>
  </PanelFrame>
</template>

<style scoped>
.ar {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

/* —— 顶部 —— */
.ar-top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 9px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.7);
}
.ar-title {
  font-family: var(--font-title);
  font-size: 13px;
  letter-spacing: 0.14em;
  color: var(--c-sand);
}
.ar-prog {
  flex: 0 1 240px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ar-bar {
  flex: 1 1 auto;
}
.ar-num {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-bone-dark);
  white-space: nowrap;
}
.unread {
  margin-left: auto;
}

/* —— 列表 —— */
.ar-main {
  min-height: 0;
}
.ar-list {
  flex: 0 0 46%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 2px;
}

.ar-row {
  width: 100%;
  text-align: left;
  font-family: var(--font-mono);
}
.ar-row.locked .rp-row-title {
  color: var(--c-bone-dark);
  letter-spacing: 0.2em;
}

.ar-icon {
  flex: 0 0 22px;
  height: 22px;
  display: grid;
  place-items: center;
  background: rgba(7, 9, 11, 0.7);
  border: 1px solid rgba(58, 68, 75, 0.8);
}
.qmark {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--c-bone-dark);
}
.read-mark {
  font-size: 9px;
  color: var(--c-steel-light);
  letter-spacing: 0.1em;
}

/* —— 详情 —— */
.ar-detail {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, rgba(207, 196, 168, 0.05), rgba(10, 13, 15, 0.6));
  border: 1px solid var(--c-steel);
  overflow-y: auto;
}

.d-head {
  display: flex;
  align-items: center;
  gap: 5px;
}
.d-id {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
  opacity: 0.8;
}

.d-title {
  margin: 2px 0 0;
  font-family: var(--font-title);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--rc, var(--c-white));
}
.d-en {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.22em;
  color: var(--c-bone-dark);
  text-transform: uppercase;
}
.d-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--c-bone-dark);
}

.d-text {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.7em;
}
.d-text .rp-prose {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.95;
  color: var(--c-paper);
}
.d-text .rp-prose::first-letter {
  font-size: 1.5em;
  color: var(--c-sand);
}

.d-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid rgba(58, 68, 75, 0.55);
  font-size: 9px;
  letter-spacing: 0.1em;
}
.d-foot .mono {
  font-family: var(--font-mono);
  color: var(--c-sand);
}

/* —— 未收集详情 —— */
.locked-detail {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding: 18px;
}
.big-q {
  font-family: var(--font-title);
  font-size: 54px;
  line-height: 1;
  color: rgba(111, 130, 140, 0.35);
  text-shadow: 0 0 20px rgba(0, 0, 0, 0.9);
}
.l-title {
  font-family: var(--font-title);
  font-size: 15px;
  letter-spacing: 0.24em;
  color: var(--c-bone-dark);
}
.l-text {
  margin: 0;
  max-width: 400px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--c-bone-dark);
}
.l-id {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
}

@media (max-width: 860px) {
  .ar-main {
    flex-direction: column;
  }
  .ar-list {
    flex: 0 0 auto;
    max-height: 40%;
  }
}
</style>
