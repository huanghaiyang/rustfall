<script setup>
// =============================================================================
// QuestPanel —— 任务日志：主线 / 支线 / 营救 分组 + 目标进度 + 奖励预览 + 追踪
// 数据源：G.quests.{active,completed,tracked} / G.ui.selectedQuest / G.rescue
// 行为门面：A.selectQuest / A.trackQuest
// 任务定义来自 Content.get(KIND.QUEST, id)，运行时状态优先于定义（可覆盖标题/进度）。
// =============================================================================
import { computed, ref } from 'vue'
import PanelFrame from './PanelFrame.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'

const GROUPS = [
  { id: 'main', label: '主线', en: 'MAIN' },
  { id: 'side', label: '支线', en: 'SIDE' },
  { id: 'rescue', label: '营救', en: 'RESCUE' },
]

const TYPE_LABEL = { main: '主线', side: '支线', rescue: '营救' }

const OBJ_GLYPH = {
  collect: '▣',
  kill: '✕',
  reach: '▲',
  talk: '…',
  repair: '⌬',
  rescue: '◈',
  deliver: '⇄',
  survive: '☂',
  inspect: '⌖',
}

const OBJ_VERB = {
  collect: '收集',
  kill: '摧毁',
  reach: '抵达',
  talk: '交谈',
  repair: '修复',
  rescue: '营救',
  deliver: '送达',
  survive: '坚持',
  inspect: '勘察',
}

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
function defOf(kind, id) {
  if (!id) return null
  try {
    return Content.get(kind, id) || null
  } catch (e) {
    return null
  }
}
function idOf(q) {
  if (!q) return ''
  if (typeof q === 'string') return q
  return q.id || q.questId || q.quest || ''
}

// 运行时进度可能是 map，也可能是数组
function progressValue(st, oid) {
  const p = st.progress
  if (Array.isArray(p)) {
    const f = p.find((x) => x && (x.id || x.key) === oid)
    if (f) return num(f.current != null ? f.current : f.count, 0)
  } else if (p && typeof p === 'object') {
    if (p[oid] != null) return num(p[oid], 0)
  }
  if (Array.isArray(st.objectives)) {
    const f = st.objectives.find((x) => x && (x.id || x.key) === oid)
    if (f) {
      if (f.done) return Math.max(1, num(f.count, 1))
      return num(f.current != null ? f.current : f.count, 0)
    }
  }
  return 0
}

function buildObjectives(def, st) {
  const fromState = Array.isArray(st.objectives) ? st.objectives : null
  const fromDef = Array.isArray(def.objectives) ? def.objectives : null
  const src = fromState && fromState.length ? fromState : fromDef || []
  return src.map((o, i) => {
    if (typeof o === 'string') {
      return { id: 'o' + i, glyph: '▣', label: o, need: 1, cur: 0, done: false }
    }
    const id = o.id || o.key || 'o' + i
    const need = Math.max(1, num(o.count, 1))
    let cur = num(o.current, NaN)
    if (!Number.isFinite(cur)) cur = progressValue(st, id)
    if (cur === 0 && o.done) cur = need
    const type = o.type || ''
    const fallback = `${OBJ_VERB[type] || '完成'} ${o.target || ''}`.trim()
    return {
      id,
      glyph: OBJ_GLYPH[type] || '▣',
      label: o.label || o.text || fallback,
      need,
      cur: Math.max(0, Math.min(cur, need)),
      done: !!o.done || cur >= need,
    }
  })
}

function normalizeQuest(q) {
  const id = idOf(q)
  if (!id) return null
  const st = typeof q === 'object' && q ? q : {}
  const def = defOf(KIND.QUEST, id) || {}
  const objectives = buildObjectives(def, st)
  const doneCount = objectives.filter((o) => o.done).length
  const total = objectives.length
  const giverId = st.giver || def.giver || ''
  const giver = defOf(KIND.COMPANION, giverId)
  return {
    id,
    title: st.title || def.title || id,
    en: def.en || '',
    type: st.type || def.type || 'side',
    desc: st.desc || def.desc || '',
    giverId,
    giverName: giver ? giver.name : giverId,
    objectives,
    doneCount,
    total,
    pct: total ? Math.round((doneCount / total) * 100) : 0,
    allDone: total > 0 && doneCount >= total,
    tracked: !!G.quests && G.quests.tracked === id,
    rewards: def.rewards || null,
    def,
  }
}

// —— 列表 ——
const active = computed(() => {
  const arr = G.quests && Array.isArray(G.quests.active) ? G.quests.active : []
  return arr.map(normalizeQuest).filter(Boolean)
})

const done = computed(() => {
  const arr = G.quests && Array.isArray(G.quests.completed) ? G.quests.completed : []
  return arr.map(normalizeQuest).filter(Boolean)
})

const groups = computed(() =>
  GROUPS.map((g) => ({ ...g, quests: active.value.filter((q) => q.type === g.id) })),
)

const selId = computed(() => {
  const s = G.ui && G.ui.selectedQuest
  if (!s) return ''
  return typeof s === 'string' ? s : s.id || s.questId || ''
})

const selected = computed(() => {
  const id = selId.value
  if (id) {
    const hit = active.value.find((q) => q.id === id) || done.value.find((q) => q.id === id)
    if (hit) return hit
  }
  return active.value[0] || null
})

const showDone = ref(false)

// —— 奖励预览 ——
const rewardItems = computed(() => {
  const r = selected.value && selected.value.rewards
  const list = r && Array.isArray(r.items) ? r.items : []
  return list.map((it) => {
    const rid = typeof it === 'string' ? it : it.id || ''
    const d = defOf(KIND.ITEM, rid)
    return { id: rid, n: Math.max(1, num(it && it.n, 1)), name: d ? d.name : rid }
  })
})

const rewardChassis = computed(() => {
  const r = selected.value && selected.value.rewards
  const list = r && Array.isArray(r.unlockChassis) ? r.unlockChassis : []
  return list.map((id) => {
    const d = defOf(KIND.CHASSIS, id)
    return { id, name: d ? d.name : id }
  })
})

const rewardMisc = computed(() => {
  const r = (selected.value && selected.value.rewards) || null
  if (!r) return []
  const out = []
  if (num(r.signal, 0) > 0) out.push({ label: '信号强度', v: '+' + num(r.signal, 0) })
  if (num(r.credits, 0) > 0) out.push({ label: '废料券', v: '+' + num(r.credits, 0) })
  if (num(r.scrap, 0) > 0) out.push({ label: '废料券', v: '+' + num(r.scrap, 0) })
  if (num(r.energy, 0) > 0) out.push({ label: '电量', v: '+' + num(r.energy, 0) })
  return out
})

const hasRewards = computed(
  () => rewardItems.value.length > 0 || rewardChassis.value.length > 0 || rewardMisc.value.length > 0,
)

// —— 营救横幅 ——
const rescueBanner = computed(() => {
  const r = G.rescue
  if (!r || !r.active) return null
  return {
    name: r.targetName || r.active || '未知目标',
    stage: r.stage || '待营救',
  }
})

function select(id) {
  if (id) act('selectQuest', id)
}
function track(id) {
  const target = id || (selected.value && selected.value.id)
  if (target) act('trackQuest', target)
}
function typeLabel(t) {
  return TYPE_LABEL[t] || '委托'
}
function objBar(o) {
  if (!o.need) return 0
  return Math.round((o.cur / o.need) * 100)
}
</script>

<template>
  <PanelFrame title="任务" subtitle="MISSIONS / SIGNAL LOG" wide>
    <div class="q">
      <div v-if="rescueBanner" class="rescue">
        <span class="r-tag">营救中</span>
        <span class="r-name">{{ rescueBanner.name }}</span>
        <span class="r-stage">{{ rescueBanner.stage }}</span>
        <span class="r-hint">返回避难所完成交接</span>
      </div>

      <div class="rp-split q-main">
        <!-- 左：分组列表 -->
        <div class="q-left rp-scroll">
          <template v-for="g in groups" :key="g.id">
            <section v-if="g.quests.length" class="grp">
              <header class="grp-head">
                <span class="g-name">{{ g.label }}</span>
                <em class="g-en">{{ g.en }}</em>
                <span class="g-n">{{ g.quests.length }}</span>
              </header>
              <button
                v-for="q in g.quests"
                :key="q.id"
                class="rp-row q-row"
                :class="{ sel: selected && selected.id === q.id }"
                type="button"
                @click="select(q.id)"
              >
                <span v-if="q.tracked" class="rp-dot track-dot" title="追踪中" />
                <span v-else class="rp-dot dim" />
                <span class="rp-row-main">
                  <span class="rp-row-title">{{ q.title }}</span>
                  <span class="rp-row-sub">
                    目标 {{ q.doneCount }}/{{ q.total }} · {{ q.giverName || '自启' }}
                  </span>
                </span>
                <span class="rp-row-tail">
                  <span v-if="q.allDone" class="rp-tag toxic">待交付</span>
                  <span v-else class="q-pct">{{ q.pct }}%</span>
                </span>
              </button>
            </section>
          </template>

          <div v-if="!active.length" class="rp-empty q-empty">
            <span class="big">没有进行中的委托</span>
            <span>信号里只有噪音。去废墟深处找找，或者和避难所的人聊聊。</span>
          </div>

          <!-- 已完成：折叠 -->
          <section class="done">
            <button class="done-head" type="button" @click="showDone = !showDone">
              <span class="caret">{{ showDone ? '▾' : '▸' }}</span>
              <span class="d-name">已完成</span>
              <em class="d-en">COMPLETED</em>
              <span class="g-n">{{ done.length }}</span>
            </button>
            <template v-if="showDone">
              <div v-for="q in done" :key="'d-' + q.id" class="rp-row done-row">
                <span class="done-mark">✓</span>
                <span class="rp-row-main">
                  <span class="rp-row-title">{{ q.title }}</span>
                  <span class="rp-row-sub">{{ typeLabel(q.type) }} · {{ q.total }} 项已完成</span>
                </span>
              </div>
              <p v-if="!done.length" class="rp-hint done-hint">还没有完成任何委托。</p>
            </template>
          </section>
        </div>

        <!-- 右：详情 -->
        <aside class="q-right rp-scroll">
          <template v-if="selected">
            <div class="d-head">
              <span class="rp-tag" :class="selected.type === 'main' ? 'warn' : selected.type === 'rescue' ? 'danger' : 'neon'">
                {{ typeLabel(selected.type) }}
              </span>
              <span v-if="selected.tracked" class="rp-tag toxic">追踪中</span>
              <span class="d-id">{{ selected.id }}</span>
            </div>

            <h3 class="d-title">{{ selected.title }}</h3>
            <div class="d-giver">
              <span class="rp-dim">委托人</span>
              <span>{{ selected.giverName || '未知' }}</span>
            </div>

            <p class="d-desc">{{ selected.desc || '（没有留下任务说明。）' }}</p>

            <div class="rp-sep" />

            <div class="d-obj-head">
              <span>目标</span>
              <span class="d-count">{{ selected.doneCount }} / {{ selected.total }}</span>
            </div>
            <ul class="objs">
              <li v-for="o in selected.objectives" :key="o.id" class="obj" :class="{ done: o.done }">
                <span class="o-glyph">{{ o.done ? '✓' : o.glyph }}</span>
                <span class="o-body">
                  <span class="o-label">{{ o.label }}</span>
                  <span class="o-progress">
                    <span class="rp-bar thin o-bar">
                      <i :class="o.done ? 'toxic' : 'neon'" :style="{ width: objBar(o) + '%' }" />
                    </span>
                    <span class="o-num">{{ o.cur }}/{{ o.need }}</span>
                  </span>
                </span>
              </li>
              <li v-if="!selected.objectives.length" class="obj none">无具体目标 · 等待信号更新</li>
            </ul>

            <div class="rp-sep" />

            <div class="d-reward-head">奖励预览</div>
            <div v-if="hasRewards" class="rewards">
              <div v-for="it in rewardItems" :key="'ri-' + it.id" class="rw rw-item">
                <span class="rw-n">×{{ it.n }}</span>
                <span class="rw-name">{{ it.name }}</span>
              </div>
              <div v-for="c in rewardChassis" :key="'rc-' + c.id" class="rw rw-chassis">
                <span class="rw-n">机体</span>
                <span class="rw-name">{{ c.name }}</span>
              </div>
              <div v-for="(m, i) in rewardMisc" :key="'rm-' + i" class="rw">
                <span class="rw-n">{{ m.v }}</span>
                <span class="rw-name">{{ m.label }}</span>
              </div>
            </div>
            <p v-else class="rp-hint">没有登记物质奖励 · 也许只是信号里的一句话。</p>

            <div class="d-actions">
              <button
                class="rp-btn primary"
                type="button"
                :disabled="selected.tracked"
                @click="track(selected.id)"
              >
                {{ selected.tracked ? '正在追踪' : '追踪此委托' }}
              </button>
            </div>
          </template>

          <div v-else class="rp-empty">
            <span class="big">未选择委托</span>
            <span>从左侧选择一条任务查看详情。</span>
          </div>
        </aside>
      </div>
    </div>

    <template #foot>
      <span>追踪中的委托会显示在 HUD 罗盘上</span>
      <span class="rp-grow" />
      <span class="rp-dim">信号强度决定你能同时追踪的委托数</span>
    </template>
  </PanelFrame>
</template>

<style scoped>
.q {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* —— 营救横幅 —— */
.rescue {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  background: linear-gradient(90deg, rgba(200, 85, 63, 0.22), rgba(200, 85, 63, 0.04));
  border: 1px solid rgba(200, 85, 63, 0.55);
  border-left: 3px solid var(--c-neon-red);
  font-size: 11px;
}
.r-tag {
  padding: 1px 5px;
  color: #2a0f0b;
  background: var(--c-neon-red);
  font-weight: 700;
  letter-spacing: 0.1em;
}
.r-name {
  font-family: var(--font-title);
  font-size: 13px;
  color: var(--c-white);
}
.r-stage {
  color: var(--c-sand);
}
.r-hint {
  margin-left: auto;
  font-size: 10px;
  color: var(--c-bone-dark);
}

/* —— 布局 —— */
.q-main {
  min-height: 0;
}

.q-left {
  flex: 0 0 46%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding-right: 2px;
}

.grp {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grp-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 2px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.7);
}
.g-name {
  font-family: var(--font-title);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-sand);
}
.g-en {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--c-bone-dark);
  font-style: normal;
}
.g-n {
  margin-left: auto;
  font-size: 10px;
  color: var(--c-bone-dark);
}

.q-row {
  width: 100%;
  text-align: left;
  font-family: var(--font-mono);
}
.track-dot {
  flex: 0 0 auto;
}
.q-pct {
  color: var(--c-bone-dark);
  font-size: 10px;
}
.q-empty {
  margin-top: 6px;
}

/* —— 已完成折叠 —— */
.done {
  margin-top: 4px;
  border-top: 1px solid rgba(58, 68, 75, 0.6);
}
.done-head {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 4px;
  background: transparent;
  border: none;
  color: var(--c-bone-dark);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}
.done-head:hover {
  color: var(--c-sand);
}
.d-name {
  font-family: var(--font-title);
  font-size: 12px;
  letter-spacing: 0.1em;
}
.d-en {
  font-size: 9px;
  letter-spacing: 0.18em;
  font-style: normal;
  opacity: 0.7;
}
.caret {
  width: 10px;
  color: var(--c-rust-light);
}
.done-row {
  cursor: default;
  opacity: 0.72;
}
.done-row:hover {
  background: rgba(21, 25, 28, 0.55);
  border-left-color: var(--c-steel);
}
.done-mark {
  color: var(--c-toxic);
  font-size: 12px;
}
.done-hint {
  padding: 4px;
}

/* —— 右侧详情 —— */
.q-right {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px),
    rgba(10, 13, 15, 0.7);
  border: 1px solid var(--c-steel);
  overflow-y: auto;
}

.d-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.d-id {
  margin-left: auto;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
  opacity: 0.75;
}

.d-title {
  margin: 0;
  font-family: var(--font-title);
  font-size: 17px;
  letter-spacing: 0.06em;
  color: var(--c-white);
  text-shadow: 0 0 12px rgba(224, 138, 63, 0.2);
}

.d-giver {
  display: flex;
  gap: 6px;
  font-size: 11px;
}

.d-desc {
  margin: 2px 0;
  font-family: var(--font-title);
  font-size: 12px;
  line-height: 1.8;
  color: var(--c-bone);
}

.d-obj-head {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--c-bone-dark);
}
.d-count {
  color: var(--c-sand);
  font-family: var(--font-mono);
}

.objs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.obj {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  padding: 4px 5px;
  background: rgba(21, 25, 28, 0.6);
  border-left: 2px solid var(--c-steel);
}
.obj.done {
  border-left-color: var(--c-toxic);
  opacity: 0.8;
}
.obj.none {
  display: block;
  color: var(--c-bone-dark);
  font-size: 11px;
  font-style: italic;
}

.o-glyph {
  flex: 0 0 14px;
  text-align: center;
  color: var(--c-rust-light);
  font-size: 12px;
  line-height: 1.4;
}
.obj.done .o-glyph {
  color: var(--c-toxic-glow);
}
.o-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.o-label {
  font-size: 11px;
  line-height: 1.4;
  color: var(--c-bone);
}
.o-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}
.o-bar {
  flex: 1 1 auto;
}
.o-num {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--c-bone-dark);
}

.d-reward-head {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--c-bone-dark);
}
.rewards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.rw {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 6px;
  font-size: 11px;
  background: rgba(168, 118, 58, 0.12);
  border: 1px solid rgba(168, 118, 58, 0.42);
}
.rw-n {
  color: var(--c-neon-warm);
  font-family: var(--font-mono);
  font-size: 10px;
}
.rw-name {
  color: var(--c-sand);
}
.rw-chassis {
  border-color: rgba(111, 240, 208, 0.4);
  background: rgba(111, 240, 208, 0.08);
}

.d-actions {
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid rgba(58, 68, 75, 0.6);
  display: flex;
  gap: 6px;
}

@media (max-width: 860px) {
  .q-main {
    flex-direction: column;
  }
  .q-left {
    flex: 0 0 auto;
    max-height: 40%;
  }
}
</style>
