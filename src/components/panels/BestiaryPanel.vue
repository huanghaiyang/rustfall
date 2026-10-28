<script setup>
// =============================================================================
// BestiaryPanel —— 怪物图鉴：分类 / 搜索式列表 / 大立绘 + 数据
// 数据源：Content.all(KIND.MONSTER)（29 小怪 + 主题站点小怪 + 3 匪徒 + 7 精英 + 51 站点 BOSS）
// 击杀记录：G.bestiary[id]（引擎在击杀时累加）
// 行为门面：A.selectMonster(id)
// =============================================================================
import { computed, ref } from 'vue'
import PanelFrame from './PanelFrame.vue'
import MonsterSprite from './MonsterSprite.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'
import { LARGE_MONSTER_IDS } from '../../game/render/art/monsters.js'
import { THEME_BOSS_ART_IDS } from '../../game/render/art/theme-boss-art.js'

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'normal', label: '小怪' },
  { id: 'bandit', label: '匪徒' },
  { id: 'elite', label: '精英' },
  { id: 'boss', label: '站点BOSS' },
]

const CAT_LABEL = { normal: '小型怪物', bandit: '中立匪帮', elite: '大型精英', boss: '站点首领' }
const FAMILY_LABEL = {
  beast: '兽类',
  machine: '机械',
  mutant: '变异体',
  human: '人类',
  alien: '异形',
  bandit: '匪帮',
}

const LARGE_SET = new Set([...LARGE_MONSTER_IDS, ...THEME_BOSS_ART_IDS])

function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
function str(v, d = '') {
  return typeof v === 'string' ? v : v == null ? d : String(v)
}

function categoryOf(def) {
  if (def.id.startsWith('tb_')) return 'boss'
  if (def.family === 'bandit' || def.id.startsWith('bandit_')) return 'bandit'
  if (def.elite) return 'elite'
  return 'normal'
}

// —— 图鉴全集 ——
const universe = computed(() => {
  let list = []
  try {
    list = Content.all(KIND.MONSTER)
  } catch (e) {
    list = []
  }
  const out = []
  for (const def of Array.isArray(list) ? list : []) {
    if (!def || !def.id) continue
    const artId = str(def.artId) || def.id
    const category = categoryOf(def)
    const size = Array.isArray(def.size) ? def.size : null
    out.push({
      id: def.id,
      artId,
      large: LARGE_SET.has(artId),
      category,
      name: str(def.name) || def.id,
      en: str(def.en),
      family: str(def.family, 'beast'),
      hp: num(def.hp, 0),
      speed: num(def.speed, 0),
      damage: num(def.damage, 0),
      xp: num(def.xp, 0),
      size,
      moves: Array.isArray(def.moves) ? def.moves.length : 0,
      summons: Array.isArray(def.summonIds) ? def.summonIds.length : 0,
      desc: str(def.desc),
    })
  }
  const order = { normal: 0, bandit: 1, elite: 2, boss: 3 }
  return out.sort((a, b) => {
    const d = (order[a.category] ?? 9) - (order[b.category] ?? 9)
    if (d) return d
    if (a.hp !== b.hp) return a.hp - b.hp
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
})

function killsOf(id) {
  const n = Number(G.bestiary && G.bestiary[id])
  return Number.isFinite(n) && n > 0 ? n : 0
}

const total = computed(() => universe.value.length)
const found = computed(() => universe.value.filter((e) => killsOf(e.id) > 0).length)
const progress = computed(() => (total.value ? Math.round((found.value / total.value) * 100) : 0))

// —— 分类 ——
const tab = ref('all')
const tabCounts = computed(() => {
  const c = { all: 0 }
  for (const e of universe.value) {
    c[e.category] = (c[e.category] || 0) + 1
    c.all++
  }
  return c
})

const list = computed(() =>
  tab.value === 'all' ? universe.value : universe.value.filter((e) => e.category === tab.value),
)

// —— 选中 ——
const selId = computed(() => {
  const s = G.ui && G.ui.selectedMonster
  if (!s) return ''
  return typeof s === 'string' ? s : s.id || ''
})

const selected = computed(() => {
  const id = selId.value
  if (id) {
    const hit = universe.value.find((e) => e.id === id)
    if (hit) return hit
  }
  return list.value[0] || universe.value[0] || null
})

function select(id) {
  if (!id) return
  try {
    A?.selectMonster?.(id)
  } catch (e) {
    /* 门面未就绪：静默 */
  }
}

const sizeText = computed(() => {
  const s = selected.value
  if (!s || !s.size) return '—'
  return `${Math.round(num(s.size[0]))} × ${Math.round(num(s.size[1]))}`
})
const familyText = computed(() => (selected.value ? FAMILY_LABEL[selected.value.family] || selected.value.family : ''))
const catText = computed(() => (selected.value ? CAT_LABEL[selected.value.category] || '' : ''))
const killText = computed(() => {
  const n = selected.value ? killsOf(selected.value.id) : 0
  return n > 0 ? `已击杀 ${n} 次` : '尚未交手'
})
</script>

<template>
  <PanelFrame title="图鉴" subtitle="BESTIARY / SPECIMEN LOG" wide>
    <div class="bs">
      <header class="bs-top">
        <div class="bs-title">怪物图鉴</div>
        <div class="bs-prog">
          <span class="rp-bar thin bs-bar"><i class="warn" :style="{ width: progress + '%' }" /></span>
          <span class="bs-num">{{ found }} / {{ total }}</span>
        </div>
        <span class="rp-tag">击杀即记录</span>
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
          {{ t.label }}<span class="n">{{ tabCounts[t.id] || 0 }}</span>
        </button>
      </nav>

      <div class="rp-split bs-main">
        <!-- 左：列表 -->
        <div class="bs-list rp-scroll">
          <button
            v-for="e in list"
            :key="e.id"
            class="rp-row bs-row"
            :class="{ sel: selected && selected.id === e.id, unkilled: killsOf(e.id) === 0 }"
            type="button"
            :title="e.name"
            @click="select(e.id)"
          >
            <span class="bs-icon" :class="{ big: e.large }">
              <MonsterSprite :art-id="e.artId" :w="e.large ? 34 : 36" :h="30" :label="e.name" />
            </span>
            <span class="rp-row-main">
              <span class="rp-row-title">{{ e.name }}</span>
              <span class="rp-row-sub">
                {{ e.en || FAMILY_LABEL[e.family] || '未知' }} · {{ CAT_LABEL[e.category] }}
              </span>
            </span>
            <span class="rp-row-tail">
              <span v-if="killsOf(e.id) > 0" class="bs-kill">×{{ killsOf(e.id) }}</span>
              <span v-else class="rp-dim bs-none">未记录</span>
            </span>
          </button>

          <div v-if="!list.length" class="rp-empty">
            <span class="big">图鉴是空的</span>
            <span>还没有任何被登记的怪物。</span>
          </div>
        </div>

        <!-- 右：立绘 + 数据 -->
        <aside class="bs-detail rp-scroll">
          <template v-if="selected">
            <div class="d-head">
              <span class="rp-tag">{{ catText }}</span>
              <span class="rp-tag">{{ familyText }}</span>
              <span class="rp-grow" />
              <span class="bs-kill-big" :class="{ none: killsOf(selected.id) === 0 }">{{ killText }}</span>
            </div>

            <div class="bs-stage">
              <MonsterSprite
                :key="selected.id"
                :art-id="selected.artId"
                :w="selected.large ? 268 : 210"
                :h="250"
                eager
                :label="selected.name"
              />
            </div>

            <h3 class="d-title rc">{{ selected.name }}</h3>
            <div class="d-en">{{ selected.en || '—' }}</div>

            <div class="bs-stats">
              <div class="bs-stat"><span class="k">结构</span><b>{{ Math.round(selected.hp) }}</b></div>
              <div class="bs-stat"><span class="k">伤害</span><b>{{ Math.round(selected.damage) }}</b></div>
              <div class="bs-stat"><span class="k">移速</span><b>{{ Math.round(selected.speed) }}</b></div>
              <div class="bs-stat"><span class="k">体型</span><b>{{ sizeText }}</b></div>
              <div v-if="selected.xp > 0" class="bs-stat"><span class="k">经验</span><b>{{ Math.round(selected.xp) }}</b></div>
              <div v-if="selected.moves > 0" class="bs-stat"><span class="k">招式</span><b>{{ selected.moves }} 式</b></div>
              <div v-if="selected.summons > 0" class="bs-stat"><span class="k">召唤</span><b>{{ selected.summons }} 类</b></div>
            </div>

            <div class="rp-sep" />

            <div class="d-text">
              <p v-for="(p, i) in String(selected.desc || '').split(/\n+/).filter(Boolean)" :key="i" class="rp-prose">
                {{ p }}
              </p>
              <p v-if="!selected.desc" class="rp-prose dim">（记录残页，只剩几行模糊的笔迹。）</p>
            </div>

            <footer class="d-foot">
              <span class="rp-dim">编号</span>
              <span class="mono">{{ selected.id.toUpperCase() }}</span>
              <span class="rp-grow" />
              <span class="rp-dim">立绘</span>
              <span class="mono">{{ selected.artId }}</span>
            </footer>
          </template>

          <div v-else class="rp-empty">
            <span class="big">未选择怪物</span>
            <span>从左侧选择一只被记录的怪物。</span>
          </div>
        </aside>
      </div>
    </div>

    <template #foot>
      <span>每只怪物与首领都有独占立绘 · 程序化生成</span>
      <span class="rp-grow" />
      <span class="rp-dim">击杀后记入图鉴，重复击杀累加计数</span>
    </template>
  </PanelFrame>
</template>

<style scoped>
.bs {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

/* —— 顶部 —— */
.bs-top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 9px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.7);
}
.bs-title {
  font-family: var(--font-title);
  font-size: 13px;
  letter-spacing: 0.14em;
  color: var(--c-sand);
}
.bs-prog {
  flex: 0 1 240px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.bs-bar {
  flex: 1 1 auto;
}
.bs-num {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-bone-dark);
  white-space: nowrap;
}

/* —— 列表 —— */
.bs-main {
  min-height: 0;
}
.bs-list {
  flex: 0 0 44%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 2px;
}
.bs-row {
  width: 100%;
  text-align: left;
  font-family: var(--font-mono);
}
.bs-row.unkilled .rp-row-title {
  color: var(--c-bone-dark);
}
.bs-icon {
  flex: 0 0 38px;
  height: 32px;
  display: grid;
  place-items: center;
  background: rgba(7, 9, 11, 0.7);
  border: 1px solid rgba(58, 68, 75, 0.8);
}
.bs-icon.big {
  background:
    radial-gradient(circle at 50% 80%, rgba(200, 85, 63, 0.14), transparent 70%),
    rgba(7, 9, 11, 0.7);
  border-color: rgba(200, 85, 63, 0.4);
}
.bs-kill {
  font-size: 9px;
  color: var(--c-neon);
  letter-spacing: 0.06em;
}
.bs-none {
  font-size: 9px;
  letter-spacing: 0.1em;
  opacity: 0.75;
}

/* —— 详情 —— */
.bs-detail {
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
.bs-kill-big {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--c-neon);
}
.bs-kill-big.none {
  color: var(--c-bone-dark);
}

/* 立绘台：底部一片暗红光晕，让立绘“站”在台座上 */
.bs-stage {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  min-height: 170px;
  padding: 8px 0 4px;
  background:
    radial-gradient(ellipse at 50% 96%, rgba(200, 85, 63, 0.18), transparent 62%),
    radial-gradient(ellipse at 50% 88%, rgba(0, 0, 0, 0.55), transparent 70%);
  border-bottom: 1px solid rgba(58, 68, 75, 0.5);
  overflow: hidden;
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

.bs-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}
.bs-stat {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 7px;
  background: rgba(7, 9, 11, 0.55);
  border: 1px solid rgba(58, 68, 75, 0.75);
}
.bs-stat .k {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
}
.bs-stat b {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--c-sand);
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

@media (max-width: 860px) {
  .bs-main {
    flex-direction: column;
  }
  .bs-list {
    flex: 0 0 auto;
    max-height: 40%;
  }
  .bs-stage {
    min-height: 130px;
  }
}
</style>
