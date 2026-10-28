<script setup>
// =============================================================================
// DialogueBox —— 对话框：128×128 肖像 + 打字机正文 + 分支选项
// 数据源：G.dialogue（active/npcId/npcName/portrait/text/choices/speaker）
// 行为门面：A.chooseDialogue(i) / A.advanceDialogue() / A.closeDialogue()
// 键盘：1..9 选择分支 · Enter 跳过打字/推进 · Esc 关闭
// 注意：A.chooseDialogue 传入的是 choices 的 0 基下标（键盘 1 → 下标 0）
// =============================================================================
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'
import { getPortrait } from '../../game/render/art/portraits.js'

const CPS = 46 // 打字速度（字符/秒）
// 立绘纹理为 96×96 的 2 倍输出（192×192），画布同尺寸承接，CSS 仍按 128 显示
const PORTRAIT = 192

const d = computed(() => G.dialogue || {})
const active = computed(() => !!d.value.active)
const padActive = computed(() => !!G.ui.padActive)
const fullText = computed(() => String(d.value.text || ''))

const reveal = ref(0)
const caret = ref(true)
let raf = 0
let lastTs = 0
let caretTimer = 0

const portraitCv = ref(null)

function act(name, ...args) {
  try {
    A?.[name]?.(...args)
  } catch (e) {
    /* 门面未就绪：静默 */
  }
}

// —— 说话人 / 肖像 ——
const npcId = computed(() => String(d.value.npcId || ''))
const npcDef = computed(() => {
  const id = npcId.value
  if (!id) return null
  try {
    return Content.get(KIND.COMPANION, id) || null
  } catch (e) {
    return null
  }
})
const speakerName = computed(() => {
  const s = d.value.npcName || d.value.speaker || ''
  if (s) return s
  if (npcDef.value && npcDef.value.name) return npcDef.value.name
  return '未知信号'
})
const speakerRole = computed(() => {
  const r = npcDef.value && npcDef.value.role
  const MAP = { mechanic: '机械师', scavenger: '拾荒者', medic: '医者', survivor: '幸存者', bot: '机械体' }
  return MAP[r] || ''
})
const portraitId = computed(() => String(d.value.portrait || d.value.npcId || ''))

// —— 打字机 ——
const shown = computed(() => fullText.value.slice(0, Math.floor(reveal.value)))
const isTyping = computed(() => Math.floor(reveal.value) < fullText.value.length)

function tick(ts) {
  raf = requestAnimationFrame(tick)
  if (!lastTs) lastTs = ts
  const dt = Math.min(0.1, (ts - lastTs) / 1000)
  lastTs = ts
  if (!active.value) return
  if (reveal.value < fullText.value.length) {
    reveal.value = Math.min(fullText.value.length, reveal.value + dt * CPS)
  }
}

function startTyping() {
  reveal.value = 0
  lastTs = 0
  if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick)
}
function stopTyping() {
  if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
  raf = 0
  lastTs = 0
}
function skipTyping() {
  reveal.value = fullText.value.length
}

// —— 选项 ——
// 运行时 G.dialogue.choices 的条目是 { index, text, enabled, reason, next, once }
const choices = computed(() => {
  const arr = d.value && Array.isArray(d.value.choices) ? d.value.choices : []
  return arr.map((c, i) => {
    const rawIdx = Number(c && c.index)
    const idx = Number.isFinite(rawIdx) ? rawIdx : i
    const disabled = !!(c && (c.disabled || c.enabled === false || c.locked))
    return {
      i: idx,
      text: (c && (c.text || c.label)) || '…',
      disabled,
      reason: (c && (c.reason || c.hint || c.disabledReason)) || (disabled ? '条件未满足' : ''),
    }
  })
})
const hasChoices = computed(() => choices.value.length > 0)
const firstEnabled = computed(() => choices.value.find((c) => !c.disabled) || null)

// —— 交互 ——
function advance() {
  if (!active.value) return
  if (isTyping.value) {
    skipTyping()
    return
  }
  if (hasChoices.value) {
    if (firstEnabled.value) act('chooseDialogue', firstEnabled.value.i)
    return
  }
  act('advanceDialogue')
}

function choose(c) {
  if (!active.value || !c || c.disabled) return
  act('chooseDialogue', c.i)
}

function closeBox() {
  act('closeDialogue')
}

function onKey(e) {
  if (!active.value) return
  const code = e.code || ''
  const key = e.key || ''
  // 数字键 1..9 → 对应选项
  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1
    const c = choices.value[idx]
    if (c) {
      e.preventDefault()
      e.stopPropagation()
      choose(c)
      return
    }
  }
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
    e.preventDefault()
    e.stopPropagation()
    advance()
    return
  }
  if (code === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closeBox()
  }
}

// —— 肖像绘制 ——
function placeholderPortrait(ctx, s) {
  ctx.fillStyle = '#1b2125'
  ctx.fillRect(0, 0, s, s)
  // 头肩轮廓
  ctx.fillStyle = '#2b3339'
  ctx.fillRect(Math.round(s * 0.18), Math.round(s * 0.62), Math.round(s * 0.64), Math.round(s * 0.38))
  ctx.fillRect(Math.round(s * 0.31), Math.round(s * 0.26), Math.round(s * 0.38), Math.round(s * 0.4))
  // 单眼传感器
  ctx.fillStyle = '#8a4b26'
  ctx.fillRect(Math.round(s * 0.42), Math.round(s * 0.42), Math.round(s * 0.16), Math.round(s * 0.06))
  ctx.fillStyle = '#c07038'
  ctx.fillRect(Math.round(s * 0.44), Math.round(s * 0.43), Math.round(s * 0.05), Math.round(s * 0.03))
  // 扫描线
  ctx.fillStyle = 'rgba(7, 9, 11, 0.35)'
  for (let y = 0; y < s; y += 3) ctx.fillRect(0, y, s, 1)
}

function drawPortrait() {
  const el = portraitCv.value
  if (!el || typeof el.getContext !== 'function') return
  if (el.width !== PORTRAIT) el.width = PORTRAIT
  if (el.height !== PORTRAIT) el.height = PORTRAIT
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, PORTRAIT, PORTRAIT)
  ctx.imageSmoothingEnabled = false
  let img = null
  const pid = portraitId.value
  if (pid) {
    try {
      const tex = getPortrait(pid)
      img = tex && (tex.image || tex)
    } catch (e) {
      img = null
    }
  }
  if (img && (img.width || img.videoWidth) && (img.height || img.videoHeight)) {
    try {
      // 契约立绘为 96×96：等比例铺满 128 的画框
      ctx.drawImage(img, 0, 0, PORTRAIT, PORTRAIT)
      return
    } catch (e) {
      /* 落到占位图 */
    }
  }
  placeholderPortrait(ctx, PORTRAIT)
}

// —— 生命周期 ——
// 正文换段 → 重新打字机输出（若对话尚未激活，等 active 的 watch 再启动）
watch(fullText, () => {
  if (!active.value) return
  startTyping()
})
watch(active, (on) => {
  if (on) {
    startTyping()
    nextTick(drawPortrait)
  } else {
    stopTyping()
  }
})
watch(portraitId, () => nextTick(drawPortrait))

// 注意：G.dialogue.typing 由 dialogue-runtime 自己维护（每次 _syncState 归零），
// 本组件只做本地揭示动画，不写这个字段，避免和运行时抢状态。

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true)
  caretTimer = setInterval(() => {
    caret.value = !caret.value
  }, 520)
  if (active.value) {
    startTyping()
    nextTick(drawPortrait)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true)
  if (caretTimer) clearInterval(caretTimer)
  caretTimer = 0
  stopTyping()
})
</script>

<template>
  <div v-if="active" class="dlg-root">
    <div class="dlg rp-crt">
      <i class="rp-corner tl" />
      <i class="rp-corner tr" />
      <i class="rp-corner bl" />
      <i class="rp-corner br" />

      <!-- 肖像 -->
      <div class="dlg-portrait">
        <canvas ref="portraitCv" class="rp-pixel" :width="PORTRAIT" :height="PORTRAIT" />
        <div class="p-frame" />
        <div class="p-id">{{ npcId || 'UNKNOWN' }}</div>
      </div>

      <!-- 正文 -->
      <div class="dlg-main">
        <header class="dlg-head">
          <span class="dlg-name">{{ speakerName }}</span>
          <span v-if="speakerRole" class="dlg-role">{{ speakerRole }}</span>
          <span class="dlg-signal">
            <span class="rp-dot" />
            <em>SIGNAL</em>
          </span>
        </header>

        <div class="dlg-text" role="button" tabindex="0" @click="advance" @keydown.enter.prevent="advance">
          <p class="txt">
            {{ shown }}<span v-if="isTyping" class="caret" :class="{ off: !caret }">▌</span>
          </p>
          <p v-if="!fullText" class="txt empty">（只有电流声。）</p>
        </div>

        <!-- 分支 -->
        <ul v-if="hasChoices && !isTyping" class="choices">
          <li v-for="c in choices" :key="c.i">
            <button
              class="choice"
              :class="{ disabled: c.disabled }"
              type="button"
              :disabled="c.disabled"
              :title="c.reason || c.text"
              @click="choose(c)"
            >
              <span class="c-key">{{ c.i + 1 }}</span>
              <span class="c-text">{{ c.text }}</span>
              <span v-if="c.disabled && c.reason" class="c-reason">{{ c.reason }}</span>
            </button>
          </li>
        </ul>

        <footer class="dlg-foot">
          <span v-if="isTyping" class="hint">{{ padActive ? 'A 跳过' : '点击跳过' }}</span>
          <span v-else-if="hasChoices" class="hint">{{ padActive ? '方向键选择 · A 确认' : '按数字键选择 · Enter 选第一项' }}</span>
          <span v-else class="hint">{{ padActive ? 'A / 点击 继续' : 'Enter / 点击 继续' }}</span>
          <span class="rp-grow" />
          <span class="hint dim">{{ padActive ? 'B 结束对话' : 'Esc 结束对话' }}</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dlg-root {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--rp-z-dialogue, 70);
  display: flex;
  justify-content: center;
  padding: 0 18px 18px;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(7, 9, 11, 0) 0%, rgba(7, 9, 11, 0.55) 70%, rgba(7, 9, 11, 0.8) 100%);
  animation: dlg-in 0.18s steps(3, end) both;
}

@keyframes dlg-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.dlg {
  position: relative;
  width: min(920px, 100%);
  display: flex;
  gap: 12px;
  padding: 11px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.015) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, rgba(26, 31, 34, 0.97), rgba(9, 12, 14, 0.985));
  border: 1px solid var(--c-rust);
  box-shadow:
    0 -2px 0 rgba(192, 112, 56, 0.25),
    0 12px 40px rgba(0, 0, 0, 0.75),
    inset 0 1px 0 rgba(232, 227, 214, 0.06);
  pointer-events: auto;
}

/* —— 肖像框 —— */
.dlg-portrait {
  position: relative;
  flex: 0 0 auto;
  width: 128px;
  height: 128px;
  background: #0b0e10;
  border: 1px solid var(--c-steel-light);
}

.dlg-portrait canvas {
  width: 128px;
  height: 128px;
  display: block;
  /* 192 画布缩到 128 显示：平滑缩放，避免最近邻丢像素 */
  image-rendering: auto;
}

.p-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(7, 9, 11, 0.9), inset 0 0 22px rgba(7, 9, 11, 0.6);
}

.p-id {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 4px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.16em;
  color: var(--c-bone-dark);
  background: rgba(7, 9, 11, 0.8);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* —— 正文区 —— */
.dlg-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.dlg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.7);
}

.dlg-name {
  font-family: var(--font-title);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-white);
  text-shadow: 0 0 10px rgba(224, 138, 63, 0.3);
}

.dlg-role {
  padding: 1px 5px;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--c-sand);
  background: rgba(168, 118, 58, 0.16);
  border: 1px solid rgba(168, 118, 58, 0.4);
}

.dlg-signal {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.dlg-signal em {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.22em;
  color: var(--c-neon);
  font-style: normal;
  opacity: 0.8;
}

.dlg-text {
  flex: 1 1 auto;
  min-height: 62px;
  max-height: 148px;
  overflow-y: auto;
  padding: 3px 2px;
  cursor: pointer;
}

.dlg-text .txt {
  margin: 0;
  font-family: var(--font-title);
  font-size: 14px;
  line-height: 1.85;
  color: var(--c-paper);
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.85em;
}
.dlg-text .txt.empty {
  color: var(--c-bone-dark);
  font-style: italic;
}

.caret {
  color: var(--c-neon);
  opacity: 0.9;
  animation: rp-blink 1s steps(2, end) infinite;
}
.caret.off {
  opacity: 0.15;
}

/* —— 分支 —— */
.choices {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.choice {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--c-bone);
  background: rgba(21, 25, 28, 0.7);
  border: 1px solid var(--c-steel);
  border-left: 2px solid var(--c-rust);
  cursor: pointer;
  transition: background 0.1s linear, border-color 0.1s linear;
}
.choice:hover:not(.disabled) {
  background: rgba(138, 75, 38, 0.28);
  border-color: var(--c-rust-light);
  color: var(--c-white);
}
.choice.disabled {
  opacity: 0.42;
  cursor: not-allowed;
  border-left-color: var(--c-steel);
}

.c-key {
  flex: 0 0 18px;
  height: 18px;
  display: grid;
  place-items: center;
  font-size: 10px;
  color: var(--c-void);
  background: var(--c-sand);
  font-weight: 700;
}
.choice.disabled .c-key {
  background: var(--c-bone-dark);
}

.c-text {
  flex: 1 1 auto;
  min-width: 0;
}

.c-reason {
  flex: 0 0 auto;
  font-size: 9px;
  color: var(--c-danger);
  opacity: 0.9;
}

/* —— 底栏 —— */
.dlg-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid rgba(58, 68, 75, 0.5);
}
.hint {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--c-bone-dark);
}
.hint.dim {
  opacity: 0.7;
}

@media (max-width: 620px) {
  .dlg-portrait {
    width: 84px;
    height: 84px;
  }
  .dlg-portrait canvas {
    width: 84px;
    height: 84px;
  }
  .dlg-text .txt {
    font-size: 12px;
  }
}
</style>
