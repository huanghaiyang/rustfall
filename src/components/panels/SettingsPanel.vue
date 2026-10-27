<script setup>
// =============================================================================
// SettingsPanel —— 设置：视觉 / 输入 / 音频
// 数据：G.settings、G.gamepad、G.volume、G.muted
// 动作：A.setSetting / setDeadzone / setVolume / toggleMute / closePanel
//   门面尚未补齐对应方法时，退回本地 G 兜底（不抛错、不写日志）
// =============================================================================
import { computed } from 'vue'
import PanelFrame from './PanelFrame.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { getSettingsIcon } from '../../game/render/art/ui.js'

const emit = defineEmits(['close'])

const DEFAULTS = Object.freeze({
  postfx: false,
  glow: false,
  scanlines: false,
  grain: false,
  vignette: true,
  gamepad: true,
  deadzone: 0.24,
  rumble: true,
  showClock: true,
  godMode: false,
  infiniteJump: false,
})
const DEFAULT_VOLUME = 0.72

const VISUAL = [
  { key: 'postfx', label: '后期滤镜', en: 'POST FX' },
  { key: 'glow', label: '光晕', en: 'BLOOM' },
  { key: 'scanlines', label: '扫描线', en: 'SCANLINES' },
  { key: 'grain', label: '噪点', en: 'GRAIN' },
  { key: 'vignette', label: '暗角', en: 'VIGNETTE' },
  { key: 'showClock', label: '时钟显示', en: 'DAY CLOCK' },
]

const INPUT_ROWS = [
  { key: 'gamepad', label: '手柄', en: 'GAMEPAD' },
  { key: 'rumble', label: '震动', en: 'RUMBLE' },
]

// 测试选项：仅用于游戏内调试
const TEST_ROWS = [
  { key: 'godMode', label: '无敌', en: 'GOD MODE' },
  { key: 'infiniteJump', label: '无限跳', en: 'INFINITE JUMP' },
]

const settings = computed(() => G.settings || {})
const pad = computed(() => G.gamepad || {})
const padConnected = computed(() => !!pad.value.connected)
const padName = computed(() => {
  const id = String(pad.value.id || '').trim()
  if (!id) return '未识别手柄'
  return id.length > 30 ? id.slice(0, 28) + '…' : id
})
const padButtons = computed(() => {
  const n = Number(pad.value.buttons)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
})
const muted = computed(() => !!G.muted)

const clamp01 = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_VOLUME
}
const clampDeadzone = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULTS.deadzone
  return Math.max(0.05, Math.min(0.6, Math.round(n * 100) / 100))
}
const volumePct = computed(() => Math.round(clamp01(G.volume) * 100))

const deadzone = computed({
  get: () => clampDeadzone(settings.value.deadzone),
  set: (v) => setDeadzone(v),
})
const volume = computed({
  get: () => clamp01(G.volume),
  set: (v) => setVolume(v),
})

function isOn(key) {
  const v = settings.value[key]
  return v === undefined ? !!DEFAULTS[key] : !!v
}

function callA(name, ...args) {
  try {
    const fn = A && A[name]
    if (typeof fn === 'function') {
      fn(...args)
      return true
    }
  } catch (e) {
    /* 门面异常：退回本地兜底 */
  }
  return false
}
function ensureSettings() {
  if (!G.settings || typeof G.settings !== 'object') G.settings = { ...DEFAULTS }
  return G.settings
}
function setSetting(key, value) {
  if (!callA('setSetting', key, value)) ensureSettings()[key] = value
}
function toggle(key) {
  setSetting(key, !isOn(key))
}
function setDeadzone(value) {
  const n = clampDeadzone(value)
  if (!callA('setDeadzone', n)) ensureSettings().deadzone = n
}
function setVolume(value) {
  const n = Math.round(clamp01(value) * 100) / 100
  if (!callA('setVolume', n)) G.volume = n
}
function toggleMute() {
  if (!callA('toggleMute')) G.muted = !G.muted
}
function resetDefaults() {
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'deadzone') continue
    setSetting(key, DEFAULTS[key])
  }
  setDeadzone(DEFAULTS.deadzone)
  setVolume(DEFAULT_VOLUME)
  if (G.muted) toggleMute()
}
function close() {
  try {
    emit('close')
  } catch (e) {
    /* 监听器异常不阻断关闭 */
  }
  if (!callA('closePanel')) {
    if (G.ui) G.ui.panel = null
    if (G.phase === 'playing') G.paused = false
  }
}
function onFrameClose() {
  try {
    emit('close')
  } catch (e) {
    /* ignore */
  }
}

function artUrl(tex) {
  try {
    const img = tex && tex.image
    return img && typeof img.toDataURL === 'function' ? img.toDataURL('image/png') : ''
  } catch (e) {
    return ''
  }
}
const ICONS = {
  visual: artUrl(getSettingsIcon('visual')),
  input: artUrl(getSettingsIcon('input')),
  audio: artUrl(getSettingsIcon('audio')),
}
</script>

<template>
  <PanelFrame title="设置" subtitle="SETTINGS // SYSTEM" wide @close="onFrameClose">
    <div class="stg">
      <!-- 视觉 -->
      <section class="stg-group">
        <header class="stg-head">
          <img class="stg-ico" :src="ICONS.visual" width="20" height="20" alt="" />
          <div class="stg-title"><b>视觉</b><em>VISUAL</em></div>
          <span class="rp-grow"></span>
          <span class="stg-note">关闭可提升帧率</span>
        </header>
        <div class="stg-rows">
          <div v-for="o in VISUAL" :key="o.key" class="stg-row">
            <div class="stg-label"><b>{{ o.label }}</b><em>{{ o.en }}</em></div>
            <button
              class="rp-switch"
              :class="{ on: isOn(o.key) }"
              type="button"
              role="switch"
              :aria-checked="isOn(o.key)"
              :aria-label="o.label"
              @click="toggle(o.key)"
            >
              <span class="stg-sr">{{ isOn(o.key) ? '开' : '关' }}</span>
            </button>
          </div>
        </div>
        <p class="stg-hint">
          后期滤镜会叠加色差、毒雾与泛光；与光晕、扫描线、噪点、暗角一起关闭可提升帧率。
        </p>
      </section>

      <!-- 输入 -->
      <section class="stg-group">
        <header class="stg-head">
          <img class="stg-ico" :src="ICONS.input" width="20" height="20" alt="" />
          <div class="stg-title"><b>输入</b><em>INPUT</em></div>
          <span class="rp-grow"></span>
          <span class="stg-note" :class="{ 'is-off': !padConnected }">
            {{ padConnected ? '已连接' : '未连接' }}
          </span>
        </header>
        <div class="stg-rows">
          <div v-for="o in INPUT_ROWS" :key="o.key" class="stg-row">
            <div class="stg-label"><b>{{ o.label }}</b><em>{{ o.en }}</em></div>
            <button
              class="rp-switch"
              :class="{ on: isOn(o.key) }"
              type="button"
              role="switch"
              :aria-checked="isOn(o.key)"
              :aria-label="o.label"
              :disabled="o.key === 'rumble' && !isOn('gamepad')"
              @click="toggle(o.key)"
            >
              <span class="stg-sr">{{ isOn(o.key) ? '开' : '关' }}</span>
            </button>
          </div>
          <div class="stg-row stg-row-wide" :class="{ 'is-off': !isOn('gamepad') }">
            <div class="stg-label"><b>摇杆死区</b><em>DEADZONE</em></div>
            <div class="stg-control">
              <input
                v-model.number="deadzone"
                class="stg-range"
                type="range"
                min="0.05"
                max="0.6"
                step="0.01"
                :disabled="!isOn('gamepad')"
                aria-label="摇杆死区"
              />
              <span class="stg-val">{{ deadzone.toFixed(2) }}</span>
            </div>
          </div>
        </div>
        <div class="stg-pad" :class="{ 'is-off': !padConnected }">
          <img class="stg-ico" :src="ICONS.input" width="20" height="20" alt="" />
          <div class="stg-pad-txt">
            <b>{{ padConnected ? padName : '未检测到手柄' }}</b>
            <em>{{ padConnected ? '按键 ' + padButtons + ' 路 · 支持热插拔' : '当前使用键盘操作' }}</em>
          </div>
          <span class="stg-dot" :class="{ on: padConnected }"></span>
        </div>
      </section>

      <!-- 测试 -->
      <section class="stg-group stg-group-test">
        <header class="stg-head">
          <div class="stg-title"><b>测试</b><em>DEBUG</em></div>
          <span class="rp-grow"></span>
          <span class="stg-note">仅供游戏内调试</span>
        </header>
        <div class="stg-rows">
          <div v-for="o in TEST_ROWS" :key="o.key" class="stg-row">
            <div class="stg-label"><b>{{ o.label }}</b><em>{{ o.en }}</em></div>
            <button
              class="rp-switch"
              :class="{ on: isOn(o.key) }"
              type="button"
              role="switch"
              :aria-checked="isOn(o.key)"
              :aria-label="o.label"
              @click="toggle(o.key)"
            >
              <span class="stg-sr">{{ isOn(o.key) ? '开' : '关' }}</span>
            </button>
          </div>
        </div>
        <p class="stg-hint">无敌：免疫伤害与酸雨，死亡时回满并送回出生点。无限跳：空中可无限起跳，不消耗电量。</p>
      </section>

      <!-- 音频 -->
      <section class="stg-group">
        <header class="stg-head">
          <img class="stg-ico" :src="ICONS.audio" width="20" height="20" alt="" />
          <div class="stg-title"><b>音频</b><em>AUDIO</em></div>
          <span class="rp-grow"></span>
          <span class="stg-note">{{ muted ? '已静音' : volumePct + '%' }}</span>
        </header>
        <div class="stg-rows">
          <div class="stg-row stg-row-wide">
            <div class="stg-label"><b>音量</b><em>VOLUME</em></div>
            <div class="stg-control">
              <input
                v-model.number="volume"
                class="stg-range"
                type="range"
                min="0"
                max="1"
                step="0.01"
                aria-label="音量"
              />
              <span class="stg-val">{{ volumePct }}%</span>
            </div>
          </div>
          <div class="stg-row">
            <div class="stg-label"><b>静音</b><em>MUTE</em></div>
            <button
              class="rp-switch"
              :class="{ on: muted }"
              type="button"
              role="switch"
              :aria-checked="muted"
              aria-label="静音"
              @click="toggleMute"
            >
              <span class="stg-sr">{{ muted ? '开' : '关' }}</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <template #foot>
      <button class="rp-btn" type="button" @click="resetDefaults">恢复默认</button>
      <span class="rp-grow"></span>
      <span class="rp-small rp-dim">设置立即生效</span>
      <button class="rp-btn primary" type="button" @click="close">关闭</button>
    </template>
  </PanelFrame>
</template>

<style scoped>
.stg {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stg-group {
  position: relative;
  padding: 7px 10px 8px;
  background: rgba(10, 13, 15, 0.55);
  border: 1px solid rgba(58, 68, 75, 0.7);
  border-left: 2px solid rgba(192, 112, 56, 0.55);
}

.stg-group::after {
  content: '';
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 4px;
  height: 4px;
  background: rgba(192, 112, 56, 0.5);
}

.stg-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.55);
}

.stg-ico {
  width: 20px;
  height: 20px;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  flex: 0 0 auto;
}

.stg-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.stg-title b {
  font-family: var(--font-title);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.18em;
  color: var(--c-bone);
}
.stg-title em {
  font-style: normal;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.2em;
  color: var(--c-bone-dark);
}

.stg-note {
  font-size: 8.5px;
  letter-spacing: 0.12em;
  color: var(--c-bone-dark);
  white-space: nowrap;
}
.stg-note.is-off {
  color: var(--c-danger);
}

.stg-rows {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 18px;
  padding-top: 2px;
}

.stg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 25px;
  border-bottom: 1px dashed rgba(58, 68, 75, 0.35);
}
.stg-row.is-off {
  opacity: 0.45;
}
.stg-row-wide {
  grid-column: 1 / -1;
}

.stg-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.stg-label b {
  font-size: 10.5px;
  font-weight: 400;
  letter-spacing: 0.1em;
  color: var(--c-paper);
  white-space: nowrap;
}
.stg-label em {
  font-style: normal;
  font-size: 7.5px;
  letter-spacing: 0.14em;
  color: var(--c-bone-dark);
  opacity: 0.75;
}

.stg-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stg-range {
  -webkit-appearance: none;
  appearance: none;
  width: 132px;
  height: 3px;
  background: linear-gradient(90deg, rgba(192, 112, 56, 0.65), rgba(58, 68, 75, 0.45));
  outline: none;
  cursor: pointer;
}
.stg-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: var(--c-rust-light);
  border: 1px solid #000;
  border-radius: 0;
  cursor: pointer;
}
.stg-range::-moz-range-thumb {
  width: 10px;
  height: 10px;
  background: var(--c-rust-light);
  border: 1px solid #000;
  border-radius: 0;
  cursor: pointer;
}
.stg-range:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.stg-val {
  min-width: 38px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: var(--c-sand);
}

.stg-hint {
  margin: 5px 0 0;
  font-size: 8.5px;
  line-height: 1.65;
  letter-spacing: 0.05em;
  color: var(--c-bone-dark);
}

.stg-pad {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 5px 8px;
  background: rgba(7, 9, 11, 0.45);
  border: 1px dashed rgba(58, 68, 75, 0.8);
}
.stg-pad.is-off {
  opacity: 0.65;
}
.stg-pad-txt {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}
.stg-pad-txt b {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.08em;
  color: var(--c-bone);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stg-pad-txt em {
  font-style: normal;
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
}
.stg-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  background: var(--c-steel);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
}
.stg-dot.on {
  background: var(--c-toxic-glow);
  box-shadow: 0 0 6px rgba(198, 224, 90, 0.8);
}

.stg-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 720px) {
  .stg-rows {
    grid-template-columns: 1fr;
  }
  .stg-range {
    width: 110px;
  }
}
</style>
