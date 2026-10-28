<script setup>
// =============================================================================
// CompanionPanel —— 同伴 / 幸存者：肖像 · 角色 · 状态 · 信任度 · 服务 · 对话
// 数据源：G.companions（id → 运行时状态）/ Content.all(KIND.COMPANION)
// 行为门面：A.talkTo(id)
// =============================================================================
import { computed, onMounted, nextTick, watch } from 'vue'
import PanelFrame from './PanelFrame.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'
import { getPortrait } from '../../game/render/art/portraits.js'

const ROLE = {
  mechanic: '机械师',
  scavenger: '拾荒者',
  medic: '医者',
  survivor: '幸存者',
  bot: '机械体',
}

const SERVICE = {
  repair: '维修',
  trade: '交易',
  medic: '治疗',
  heal: '治疗',
  rest: '休息',
  upgrade: '改装',
  info: '情报',
  quest: '委托',
  escort: '护送',
  storage: '仓储',
  cook: '热食',
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
function clampPct(v) {
  return Math.max(0, Math.min(100, Math.round(v)))
}

const stateMap = computed(() => {
  const c = G.companions
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {}
})

function hasState(id) {
  return Object.prototype.hasOwnProperty.call(stateMap.value, id)
}

function stateOf(id) {
  const v = stateMap.value[id]
  if (!v) return {}
  return typeof v === 'object' ? v : {}
}

function trustOf(st) {
  const t = num(st.trust, NaN)
  if (Number.isFinite(t)) return clampPct(t <= 1 && t >= 0 ? t * 100 : t)
  const a = num(st.affinity, NaN)
  if (Number.isFinite(a)) return clampPct(a <= 1 && a >= 0 ? a * 100 : a)
  return 0
}

function servicesOf(def, st) {
  const src = Array.isArray(st.services) && st.services.length ? st.services : Array.isArray(def && def.services) ? def.services : []
  return src.map((s) => ({ id: s, label: SERVICE[s] || String(s) }))
}

function build(id, def) {
  const st = stateOf(id)
  const present = hasState(id)
  const met = present ? st.met !== false : st.met === true
  const trust = trustOf(st)
  const status = String(
    st.status || (st.rescued ? '已营救' : !met ? '未遇见' : st.shelter ? '在避难所' : '在避难所'),
  )
  const rescue = def && def.rescue ? def.rescue : null
  return {
    id,
    def,
    state: st,
    met,
    name: (def && def.name) || st.name || id,
    en: (def && def.en) || '',
    role: (def && def.role) || st.role || '',
    roleLabel: ROLE[(def && def.role) || st.role] || '幸存者',
    desc: (def && def.desc) || st.desc || '',
    portraitId: (def && (def.portrait || def.id)) || id,
    shelter: (def && def.shelter) || st.shelter || '',
    trust,
    status,
    services: servicesOf(def, st),
    rescue,
    rescued: !!st.rescued,
    ambient: def && Array.isArray(def.ambient) && def.ambient.length ? String(def.ambient[0]) : '',
    hasDialogue: !!(def && def.dialogue) || !!st.dialogue,
  }
}

const roster = computed(() => {
  const out = []
  const seen = new Set()
  let reg = []
  try {
    reg = Content.all(KIND.COMPANION)
  } catch (e) {
    reg = []
  }
  for (const def of Array.isArray(reg) ? reg : []) {
    if (!def || !def.id || seen.has(def.id)) continue
    seen.add(def.id)
    out.push(build(def.id, def))
  }
  for (const id of Object.keys(stateMap.value)) {
    if (seen.has(id)) continue
    seen.add(id)
    let def = null
    try {
      def = Content.get(KIND.COMPANION, id)
    } catch (e) {
      def = null
    }
    out.push(build(id, def))
  }
  // 已结识的排前面
  out.sort((a, b) => {
    if (a.met !== b.met) return a.met ? -1 : 1
    return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
  })
  return out
})

const metCount = computed(() => roster.value.filter((c) => c.met).length)
const rescuedCount = computed(() => roster.value.filter((c) => c.rescued).length)
// 未结识的不列表（避免剧透整份名单），只在空态里给出“还有几人未知”
const visible = computed(() => roster.value.filter((c) => c.met))
const unknownCount = computed(() => roster.value.length - visible.value.length)

function trustTone(pct) {
  if (pct >= 70) return 'toxic'
  if (pct >= 35) return 'warn'
  return 'danger'
}

function talk(c) {
  if (!c || !c.met) return
  act('talkTo', c.id)
}

// —— 肖像 ——
const cvMap = new Map()
function setCv(id) {
  return (el) => {
    if (el && typeof el.getContext === 'function') cvMap.set(id, el)
    else cvMap.delete(id)
  }
}

function placeholder(ctx, s) {
  ctx.fillStyle = '#1b2125'
  ctx.fillRect(0, 0, s, s)
  ctx.fillStyle = '#2b3339'
  ctx.fillRect(Math.round(s * 0.18), Math.round(s * 0.6), Math.round(s * 0.64), Math.round(s * 0.4))
  ctx.fillRect(Math.round(s * 0.3), Math.round(s * 0.24), Math.round(s * 0.4), Math.round(s * 0.42))
  ctx.fillStyle = '#a8763a'
  ctx.fillRect(Math.round(s * 0.4), Math.round(s * 0.44), Math.round(s * 0.2), Math.round(s * 0.05))
  ctx.fillStyle = 'rgba(7, 9, 11, 0.4)'
  for (let y = 0; y < s; y += 3) ctx.fillRect(0, y, s, 1)
}

function drawPortrait(c) {
  const cv = cvMap.get(c.id)
  if (!cv || typeof cv.getContext !== 'function') return
  // 立绘纹理 192×192：画布取 128，CSS 仍按 64 显示
  const S = 128
  if (cv.width !== S) cv.width = S
  if (cv.height !== S) cv.height = S
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, S, S)
  ctx.imageSmoothingEnabled = true
  if (!c.met) {
    placeholder(ctx, S)
    return
  }
  let img = null
  try {
    const tex = getPortrait(c.portraitId)
    img = tex && (tex.image || tex)
  } catch (e) {
    img = null
  }
  if (img && (img.width || img.videoWidth) && (img.height || img.videoHeight)) {
    try {
      ctx.drawImage(img, 0, 0, S, S)
      return
    } catch (e) {
      /* ignore */
    }
  }
  placeholder(ctx, S)
}

function drawAll() {
  for (const c of visible.value) drawPortrait(c)
}

onMounted(() => nextTick(drawAll))
watch(
  () => visible.value.length,
  () => nextTick(drawAll),
)
</script>

<template>
  <PanelFrame title="同伴" subtitle="COMPANIONS / SURVIVORS" wide>
    <div class="cp">
      <header class="cp-top">
        <div class="stat-box">
          <span class="sb-n">{{ metCount }}</span>
          <span class="sb-l">已结识</span>
        </div>
        <div class="stat-box">
          <span class="sb-n rp-toxic">{{ rescuedCount }}</span>
          <span class="sb-l">已营救</span>
        </div>
        <div class="rp-grow" />
        <div class="cp-note">
          信任度来自你替他们做过的事。信任越高，能换到的东西越好。
        </div>
      </header>

      <div v-if="visible.length" class="grid rp-scroll">
        <article v-for="c in visible" :key="c.id" class="card">
          <div class="c-portrait">
            <canvas :ref="setCv(c.id)" class="rp-pixel" />
            <span v-if="c.rescued" class="p-badge">已营救</span>
          </div>

          <div class="c-main">
            <header class="c-head">
              <span class="c-name">{{ c.name }}</span>
              <span v-if="c.en" class="c-en">{{ c.en }}</span>
              <span class="rp-tag role">{{ c.roleLabel }}</span>
            </header>

            <p v-if="c.desc" class="c-desc">{{ c.desc }}</p>
            <p v-else class="c-desc none">（没有更多记录。）</p>

            <div class="c-trust">
              <span class="t-label">信任</span>
              <span class="rp-bar thin t-bar">
                <i :class="trustTone(c.trust)" :style="{ width: c.trust + '%' }" />
              </span>
              <span class="t-num">{{ c.trust }}</span>
            </div>

            <div class="c-row">
              <span class="rp-tag" :class="c.rescued ? 'toxic' : ''">{{ c.status }}</span>
              <span v-if="c.rescue && !c.rescued" class="rp-tag danger">营救目标</span>
              <span v-if="c.shelter" class="c-place">{{ c.shelter }}</span>
            </div>

            <div v-if="c.services.length" class="services">
              <span v-for="s in c.services" :key="s.id" class="rp-tag warn svc">{{ s.label }}</span>
            </div>

            <p v-if="c.ambient" class="c-ambient">{{ c.ambient }}</p>
          </div>

          <div class="c-actions">
            <button class="rp-btn primary" type="button" title="开始对话" @click="talk(c)">
              对话
            </button>
          </div>
        </article>
      </div>

      <div v-else class="rp-empty cp-empty">
        <span class="big">还没有遇到任何人</span>
        <span>废墟里活着的东西不多。去避难所、去笼子那边看看。</span>
        <span v-if="unknownCount" class="know">档案里还有 {{ unknownCount }} 人的记录未解开。</span>
      </div>
    </div>

    <template #foot>
      <span>对话会推进任务与信任</span>
      <span class="rp-grow" />
      <span class="rp-dim">被营救者会回到最近的避难所</span>
    </template>
  </PanelFrame>
</template>

<style scoped>
.cp {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-top {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding-bottom: 7px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.7);
}
.stat-box {
  flex: 0 0 auto;
  min-width: 62px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  background: rgba(13, 17, 19, 0.75);
  border: 1px solid var(--c-steel);
}
.sb-n {
  font-family: var(--font-title);
  font-size: 17px;
  line-height: 1.1;
  color: var(--c-white);
}
.sb-l {
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--c-bone-dark);
}
.cp-note {
  align-self: center;
  margin-left: auto;
  max-width: 330px;
  font-size: 10px;
  line-height: 1.5;
  text-align: right;
  color: var(--c-bone-dark);
}

/* —— 卡片 —— */
.grid {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 8px;
  align-content: start;
  padding-right: 2px;
}

.card {
  position: relative;
  display: flex;
  gap: 9px;
  padding: 8px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px),
    rgba(13, 17, 19, 0.8);
  border: 1px solid var(--c-steel);
  border-left: 2px solid var(--c-rust);
  min-height: 0;
}

.c-portrait {
  position: relative;
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  background: #0b0e10;
  border: 1px solid var(--c-steel-light);
  overflow: hidden;
}
.c-portrait canvas {
  display: block;
  width: 64px;
  height: 64px;
  /* 128 画布缩到 64 展示：平滑缩放 */
  image-rendering: auto;
}
.p-badge {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  text-align: center;
  font-size: 8px;
  letter-spacing: 0.1em;
  line-height: 12px;
  color: #06251f;
  background: var(--c-neon);
}

.c-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.c-head {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}
.c-name {
  font-family: var(--font-title);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--c-white);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-en {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.16em;
  color: var(--c-bone-dark);
}
.role {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 8px;
}

.c-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--c-bone);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.c-desc.none {
  color: var(--c-bone-dark);
  font-style: italic;
}

.c-trust {
  display: flex;
  align-items: center;
  gap: 5px;
}
.t-label {
  flex: 0 0 auto;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
}
.t-bar {
  flex: 1 1 auto;
}
.t-num {
  flex: 0 0 22px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--c-sand);
}

.c-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.c-place {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.08em;
  color: var(--c-bone-dark);
  opacity: 0.8;
}

.services {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.svc {
  font-size: 8px;
  padding: 0 3px;
}

.c-ambient {
  margin: 1px 0 0;
  font-family: var(--font-title);
  font-size: 10px;
  line-height: 1.5;
  color: var(--c-bone-dark);
  opacity: 0.85;
}
.c-ambient::before {
  content: '「';
}
.c-ambient::after {
  content: '」';
}

.c-actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.cp-empty {
  flex: 1 1 auto;
}
.cp-empty .know {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--c-ochre);
  opacity: 0.85;
}

@media (max-width: 720px) {
  .cp-note {
    display: none;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
