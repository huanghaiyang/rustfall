<script setup>
// =============================================================================
// ChassisPicker —— 机体选择 / 切换：卡片 + idle 帧 + 立绘 + 六项属性条
// props.mode: 'start'（新开局选机体，A.startNewGame）| 'switch'（游戏内切换，A.switchChassis）
// 数据源：Content.all(KIND.CHASSIS) / G.chassisId / G.chassisUnlocked
// =============================================================================
import { computed, ref, onMounted, nextTick, watch, getCurrentInstance } from 'vue'
import PanelFrame from './PanelFrame.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'
import { getChassisArt } from '../../game/render/art/chassis.js'

const props = defineProps({
  mode: { type: String, default: 'switch' }, // start | switch
})

// 集成约定：start 模式下 App.vue 用 @confirm(id) 自己启动游戏、@cancel 收起遮罩。
// 若外部没接这两个事件（独立使用），则退回直接调用 A 门面。
const emit = defineEmits(['confirm', 'cancel'])

// getCurrentInstance() 只在 setup 同步阶段有效，必须在这里先存下来
const self = getCurrentInstance()

function hasListener(name) {
  const vnodeProps = self && self.vnode && self.vnode.props
  if (!vnodeProps) return false
  return typeof vnodeProps['on' + name.charAt(0).toUpperCase() + name.slice(1)] === 'function'
}

const STATS = [
  { key: 'hp', label: '结构', max: 200 },
  { key: 'speed', label: '机动', max: 1.8 },
  { key: 'jump', label: '跳跃', max: 1.8 },
  { key: 'dig', label: '挖掘', max: 1.8 },
  { key: 'carry', label: '负重', max: 2.2 },
  { key: 'attack', label: '攻击', max: 30 },
]

const FAMILY = {
  biped: '双足',
  wheel: '轮式',
  track: '履带',
  quad: '四足',
  arm: '机械臂',
  light: '轻型',
}

const ABILITY = {
  doubleJump: '二段跳',
  fastSwim: '快速涉水',
  wallClimb: '攀墙',
  digBoost: '强化挖掘',
  carryBoost: '强化负重',
  nightVision: '夜视',
  radShield: '抗辐射',
  hover: '悬浮',
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

const isStart = computed(() => props.mode === 'start')

const list = computed(() => {
  try {
    const all = Content.all(KIND.CHASSIS)
    return Array.isArray(all) ? all.filter((c) => c && c.id) : []
  } catch (e) {
    return []
  }
})

const unlockedSet = computed(() => {
  const arr = G.chassisUnlocked
  return new Set(Array.isArray(arr) ? arr : [])
})

function isUnlocked(def) {
  if (!def) return false
  return !!def.unlocked || unlockedSet.value.has(def.id)
}

const currentId = computed(() => String(G.chassisId || ''))

const selectedId = ref('')

function initialSelection() {
  if (!list.value.length) return ''
  if (isStart.value) {
    const firstUnlocked = list.value.find((c) => isUnlocked(c))
    return (firstUnlocked && firstUnlocked.id) || list.value[0].id
  }
  return currentId.value || (list.value[0] && list.value[0].id) || ''
}

function select(id) {
  if (!id) return
  selectedId.value = id
}

const selected = computed(() => {
  const id = selectedId.value
  return list.value.find((c) => c.id === id) || list.value[0] || null
})

function statRows(def) {
  return STATS.map((s) => {
    const d = def || {}
    const raw = num(d[s.key], s.key === 'hp' ? 100 : 1)
    const pct = Math.max(4, Math.min(100, Math.round((raw / s.max) * 100)))
    const text = s.key === 'hp' ? String(Math.round(raw)) : '×' + raw.toFixed(2)
    return { key: s.key, label: s.label, pct, text }
  })
}

function abilitiesOf(def) {
  const arr = def && Array.isArray(def.abilities) ? def.abilities : []
  return arr.map((a) => ({ id: a, label: ABILITY[a] || String(a) }))
}

function familyLabel(def) {
  const f = def && def.family
  return FAMILY[f] || f || '未知'
}

function apply(def) {
  if (!def || !isUnlocked(def)) return
  if (isStart.value) {
    emit('confirm', def.id)
    // 外部没监听时自己兜底（组件单独使用时也能开局）
    if (!hasListener('confirm')) act('startNewGame', def.id)
    return
  }
  act('switchChassis', def.id)
}

function onClose() {
  // start 模式的整屏遮罩由 App 控制，必须抛 cancel 才能收起来
  if (isStart.value) emit('cancel')
}

function actionLabel(def) {
  if (!def) return '—'
  if (!isUnlocked(def)) return '未解锁'
  if (isStart.value) return '以此机体开始'
  if (def.id === currentId.value) return '当前机体'
  return '切换机体'
}

function actionDisabled(def) {
  if (!def || !isUnlocked(def)) return true
  if (isStart.value) return false
  return def.id === currentId.value
}

// —— 画布：idle 帧 + 立绘 ——
const spriteCv = new Map()
const portraitCv = new Map()

function setSprite(id) {
  return (el) => {
    if (el && typeof el.getContext === 'function') spriteCv.set(id, el)
    else spriteCv.delete(id)
  }
}

function setPortrait(id) {
  return (el) => {
    if (el && typeof el.getContext === 'function') portraitCv.set(id, el)
    else portraitCv.delete(id)
  }
}

function artOf(id) {
  try {
    return getChassisArt(id) || null
  } catch (e) {
    return null
  }
}

function imgOf(tex) {
  if (!tex) return null
  const img = tex.image || tex
  if (img && (img.width || img.videoWidth) && (img.height || img.videoHeight)) return img
  return null
}

function drawSpriteFallback(ctx, w, h, def) {
  const fam = (def && def.family) || 'biped'
  ctx.fillStyle = 'rgba(7, 9, 11, 0.5)'
  ctx.fillRect(0, h - 2, w, 2)
  ctx.fillStyle = '#3a444b'
  const bw = fam === 'wheel' || fam === 'track' ? Math.round(w * 0.78) : Math.round(w * 0.5)
  const bh = Math.round(h * 0.42)
  const bx = Math.round((w - bw) / 2)
  const by = Math.round(h * 0.2)
  ctx.fillRect(bx, by, bw, bh)
  ctx.fillStyle = '#6f828c'
  ctx.fillRect(bx + 2, by + 3, Math.max(2, bw - 4), Math.max(2, Math.round(bh * 0.34)))
  ctx.fillStyle = '#c07038'
  if (fam === 'wheel') {
    ctx.fillRect(bx - 2, h - 9, Math.max(4, bw + 4), 7)
  } else if (fam === 'track') {
    ctx.fillRect(bx - 3, h - 10, Math.max(6, bw + 6), 8)
  } else if (fam === 'quad') {
    ctx.fillRect(bx + 2, by + bh, 3, Math.max(3, Math.round(h * 0.24)))
    ctx.fillRect(bx + bw - 5, by + bh, 3, Math.max(3, Math.round(h * 0.24)))
  } else if (fam === 'arm') {
    ctx.fillRect(bx + bw - 2, by + 4, Math.max(3, Math.round(w * 0.3)), 3)
  } else {
    ctx.fillRect(bx + 3, by + bh, 3, Math.max(3, Math.round(h * 0.3)))
    ctx.fillRect(bx + bw - 6, by + bh, 3, Math.max(3, Math.round(h * 0.3)))
  }
}

function drawSprite(id) {
  const cv = spriteCv.get(id)
  const def = list.value.find((c) => c.id === id)
  if (!cv || !cv.getContext) return
  const art = artOf(id)
  const w = Math.max(24, Math.round(num(art && art.w, 40)))
  const h = Math.max(24, Math.round(num(art && art.h, 42)))
  if (cv.width !== w) cv.width = w
  if (cv.height !== h) cv.height = h
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  let img = null
  try {
    const frames = art && art.frames
    const idle = frames && frames.idle
    img = imgOf(Array.isArray(idle) ? idle[0] : idle)
  } catch (e) {
    img = null
  }
  if (img) {
    try {
      ctx.drawImage(img, 0, 0, w, h)
      return
    } catch (e) {
      /* 图片失效 → 兜底 */
    }
  }
  drawSpriteFallback(ctx, w, h, def)
}

function drawPortraitCard(id) {
  const cv = portraitCv.get(id)
  if (!cv || !cv.getContext) return
  const S = 64
  if (cv.width !== S) cv.width = S
  if (cv.height !== S) cv.height = S
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, S, S)
  ctx.imageSmoothingEnabled = false
  const art = artOf(id)
  let img = null
  try {
    img = imgOf(art && art.portrait)
  } catch (e) {
    img = null
  }
  if (img) {
    try {
      ctx.drawImage(img, 0, 0, S, S)
      return
    } catch (e) {
      /* ignore */
    }
  }
  // 兜底：机身色块 + 传感器
  const def = list.value.find((c) => c.id === id)
  const col = num(def && def.color, 0xb0713a)
  ctx.fillStyle = '#1b2125'
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = '#' + (col >>> 0).toString(16).padStart(6, '0').slice(-6)
  ctx.fillRect(Math.round(S * 0.22), Math.round(S * 0.3), Math.round(S * 0.56), Math.round(S * 0.44))
  ctx.fillStyle = '#6ff0d0'
  ctx.fillRect(Math.round(S * 0.36), Math.round(S * 0.44), Math.round(S * 0.28), 4)
}

function drawAll() {
  for (const def of list.value) {
    drawSprite(def.id)
    drawPortraitCard(def.id)
  }
}

watch(
  () => list.value.length,
  () => nextTick(drawAll),
)

onMounted(() => {
  selectedId.value = initialSelection()
  nextTick(() => drawAll())
})
</script>

<template>
  <PanelFrame
    :title="isStart ? '选择机体' : '机体库'"
    :subtitle="isStart ? 'SELECT CHASSIS / FIRST BOOT' : 'CHASSIS / FIELD SWAP · 消耗 1 电量'"
    tone="neon"
    wide
    @close="onClose"
  >
    <div class="cp">
      <div v-if="list.length" class="cards rp-scroll">
        <article
          v-for="c in list"
          :key="c.id"
          class="card"
          data-pad
          tabindex="0"
          :class="{ locked: !isUnlocked(c), sel: selectedId === c.id, cur: c.id === currentId && !isStart }"
          @click="select(c.id)"
          @keydown.enter.prevent="select(c.id)"
        >
          <header class="c-head">
            <span class="c-name">{{ c.name || c.id }}</span>
            <span class="c-en">{{ c.en || '' }}</span>
            <span v-if="!isUnlocked(c)" class="lock">锁定</span>
            <span v-else-if="c.id === currentId && !isStart" class="cur-tag">当前</span>
          </header>

          <div class="c-body">
            <div class="c-sprite">
              <canvas :ref="setSprite(c.id)" class="rp-pixel" />
            </div>
            <div class="c-portrait">
              <canvas :ref="setPortrait(c.id)" class="rp-pixel" />
            </div>
          </div>

          <div class="c-meta">
            <span class="rp-tag">{{ familyLabel(c) }}</span>
            <span v-if="c.maker" class="maker">{{ c.maker }}</span>
          </div>

          <ul class="stats">
            <li v-for="s in statRows(c)" :key="c.id + s.key" class="stat">
              <span class="s-label">{{ s.label }}</span>
              <span class="rp-bar thin s-bar"><i :class="s.key === 'hp' ? 'toxic' : 'neon'" :style="{ width: s.pct + '%' }" /></span>
              <span class="s-val">{{ s.text }}</span>
            </li>
          </ul>

          <div v-if="abilitiesOf(c).length" class="abils">
            <span v-for="a in abilitiesOf(c)" :key="a.id" class="rp-tag neon ab">{{ a.label }}</span>
          </div>

          <div v-if="!isUnlocked(c)" class="lock-note">
            未解锁 · 通过主线委托 / 稀有部件 / mod 取得
          </div>
        </article>
      </div>

      <div v-else class="rp-empty cp-empty">
        <span class="big">没有可用机体</span>
        <span>机体数据尚未加载（chassis 注册表为空）。</span>
      </div>

      <!-- 详情 / 确认 -->
      <aside v-if="selected" class="detail">
        <div class="d-top">
          <div class="rp-tag neon">{{ familyLabel(selected) }}</div>
          <div class="rp-grow" />
          <span class="d-id">{{ selected.id }}</span>
        </div>

        <h3 class="d-name">{{ selected.name || selected.id }}</h3>
        <div class="d-en">{{ selected.en || '' }}<span v-if="selected.maker"> · {{ selected.maker }}</span></div>

        <p class="d-desc">{{ selected.desc || '（出厂档案缺失。）' }}</p>

        <ul class="stats big">
          <li v-for="s in statRows(selected)" :key="'d-' + s.key" class="stat">
            <span class="s-label">{{ s.label }}</span>
            <span class="rp-bar s-bar"><i :class="s.key === 'hp' ? 'toxic' : 'neon'" :style="{ width: s.pct + '%' }" /></span>
            <span class="s-val">{{ s.text }}</span>
          </li>
        </ul>

        <div v-if="abilitiesOf(selected).length" class="d-abils">
          <span v-for="a in abilitiesOf(selected)" :key="'d-' + a.id" class="rp-tag neon">{{ a.label }}</span>
        </div>

        <div v-if="selected.lore" class="d-lore rp-scroll">
          <div class="lore-title">出厂记录</div>
          <p class="rp-prose">{{ selected.lore }}</p>
        </div>

        <div v-if="isStart" class="d-note rp-hint">
          初始机体决定你的首轮玩法：轮式跑得快但爬不了墙，机械臂挖得深但很脆。
        </div>

        <div class="d-actions">
          <button
            class="rp-btn primary"
            type="button"
            :disabled="actionDisabled(selected)"
            @click="apply(selected)"
          >
            {{ actionLabel(selected) }}
          </button>
        </div>
      </aside>
    </div>

    <template #foot>
      <span v-if="isStart">选择后立即进入废墟 · 机体可在避难所重铸</span>
      <span v-else>切换有 1.4 秒变形冷却，期间无法移动</span>
      <span class="rp-grow" />
      <span class="rp-dim">{{ unlockedSet.size }} / {{ list.length }} 已解锁</span>
    </template>
  </PanelFrame>
</template>

<style scoped>
.cp {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  gap: 10px;
}

/* —— 卡片网格 —— */
.cards {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(216px, 1fr));
  gap: 8px;
  align-content: start;
  grid-auto-rows: max-content;
  align-items: start;
  padding-right: 2px;
}

.card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px),
    rgba(13, 17, 19, 0.82);
  border: 1px solid var(--c-steel);
  cursor: pointer;
  transition: border-color 0.1s linear, background 0.1s linear;
  min-height: 0;
}
.card:hover {
  border-color: var(--c-rust-light);
  background: rgba(138, 75, 38, 0.14);
}
.card.sel {
  border-color: var(--c-neon-warm);
  box-shadow: inset 0 0 0 1px rgba(242, 179, 74, 0.3);
  background: rgba(242, 179, 74, 0.08);
}
.card.cur::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--c-neon);
  box-shadow: 0 0 6px rgba(111, 240, 208, 0.7);
}
.card.locked {
  filter: grayscale(0.85) brightness(0.62);
}
.card.locked:hover {
  border-color: var(--c-danger);
}

.c-head {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}
.c-name {
  font-family: var(--font-title);
  font-size: 12px;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lock,
.cur-tag {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 0 4px;
  font-size: 8px;
  letter-spacing: 0.1em;
  line-height: 14px;
  color: var(--c-void);
  background: var(--c-bone-dark);
}
.cur-tag {
  background: var(--c-neon);
  color: #062a24;
  font-weight: 700;
}

.c-body {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 4px;
  background: rgba(7, 9, 11, 0.65);
  border: 1px solid rgba(58, 68, 75, 0.55);
  min-height: 62px;
}
.c-sprite {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 0;
  height: 56px;
}
.c-sprite canvas {
  max-width: 100%;
  max-height: 56px;
  width: auto;
  height: auto;
  object-fit: contain;
}
.c-portrait {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  background: #0b0e10;
  border: 1px solid var(--c-steel);
  overflow: hidden;
}
.c-portrait canvas {
  width: 40px;
  height: 40px;
  display: block;
}

.c-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.maker {
  font-size: 9px;
  color: var(--c-bone-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* —— 属性条 —— */
.stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.s-label {
  flex: 0 0 24px;
  font-size: 9px;
  color: var(--c-bone-dark);
  letter-spacing: 0.04em;
}
.s-bar {
  flex: 1 1 auto;
  min-width: 18px;
}
.s-val {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--c-bone-dark);
  min-width: 26px;
  text-align: right;
}
.stats.big {
  grid-template-columns: 1fr;
  gap: 3px;
}
.stats.big .s-label {
  flex: 0 0 30px;
  font-size: 10px;
}

.abils,
.d-abils {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.ab {
  font-size: 8px;
  padding: 0 3px;
}

.lock-note {
  font-size: 9px;
  line-height: 1.4;
  color: #d09a90;
  padding: 2px 3px;
  border-left: 2px solid var(--c-danger);
}

.cp-empty {
  flex: 1 1 auto;
}

/* —— 右侧详情 —— */
.detail {
  flex: 0 0 322px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px),
    rgba(10, 13, 15, 0.78);
  border: 1px solid var(--c-steel);
  overflow-y: auto;
}
.d-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.d-id {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
}
.d-name {
  margin: 0;
  font-family: var(--font-title);
  font-size: 17px;
  letter-spacing: 0.06em;
  color: var(--c-white);
}
.d-en {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--c-bone-dark);
  text-transform: uppercase;
}
.d-desc {
  margin: 2px 0;
  font-family: var(--font-title);
  font-size: 12px;
  line-height: 1.8;
  color: var(--c-bone);
}
.d-lore {
  max-height: 120px;
  overflow-y: auto;
  padding: 6px 8px;
  background: rgba(201, 176, 133, 0.05);
  border-left: 2px solid var(--c-ochre);
}
.lore-title {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--c-bone-dark);
  margin-bottom: 3px;
}
.d-lore .rp-prose {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
}
.d-note {
  padding: 5px 6px;
  border-left: 2px solid var(--c-rust);
  background: rgba(138, 75, 38, 0.1);
}
.d-actions {
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid rgba(58, 68, 75, 0.6);
  display: flex;
}

@media (max-width: 900px) {
  .cp {
    flex-direction: column;
  }
  .detail {
    flex: 0 0 auto;
    max-height: 42%;
  }
}
</style>
