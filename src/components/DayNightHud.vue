<script setup>
// =============================================================================
// DayNightHud —— 常驻 HUD 右上角：天数 / 阶段 / 24h 时钟 / 天气 / 预报 / 风温
// 数据：G.dayNight、G.settings.showClock
// 美术：getDayPhaseIcon（canvas 像素图）+ getWeatherIcon（复用现有天气图标）
// 纯展示，不拦截鼠标（pointer-events: none）
// =============================================================================
import { computed } from 'vue'
import { G } from '../game/state.js'
import { getDayPhaseIcon, getWeatherIcon } from '../game/render/art/ui.js'

const PHASES = {
  dawn: { label: '黎明', en: 'DAWN', tone: 'day' },
  morning: { label: '清晨', en: 'MORNING', tone: 'day' },
  noon: { label: '正午', en: 'NOON', tone: 'day' },
  afternoon: { label: '午后', en: 'AFTERNOON', tone: 'day' },
  dusk: { label: '黄昏', en: 'DUSK', tone: 'dusk' },
  night: { label: '夜晚', en: 'NIGHT', tone: 'night' },
}

const WEATHER = {
  clear: { label: '晴', icon: 'calm' },
  overcast: { label: '阴', icon: 'calm' },
  ashfall: { label: '落灰', icon: 'warning' },
  duststorm: { label: '沙暴', icon: 'warning' },
  acidrain: { label: '酸雨', icon: 'storm' },
  toxicfog: { label: '毒雾', icon: 'warning' },
  radstorm: { label: '辐射风暴', icon: 'storm' },
}

const dn = computed(() => G.dayNight || {})
const showClock = computed(() => !(G.settings && G.settings.showClock === false))
const day = computed(() => Math.max(1, Math.floor(Number(dn.value.day) || 1)))
const rawTime = computed(() => {
  const t = Number(dn.value.time)
  return Number.isFinite(t) ? ((t % 1) + 1) % 1 : 0
})
const timePct = computed(() => Math.round(rawTime.value * 1000) / 10)

function phaseFromTime(t) {
  if (t < 0.07) return 'dawn'
  if (t < 0.22) return 'morning'
  if (t < 0.32) return 'noon'
  if (t < 0.52) return 'afternoon'
  if (t < 0.72) return 'dusk'
  return 'night'
}
const phaseId = computed(() => {
  const p = String(dn.value.phase || '')
  return PHASES[p] ? p : phaseFromTime(rawTime.value)
})
const phase = computed(() => PHASES[phaseId.value])
const phaseEn = computed(() => phase.value.en)
const phaseLabel = computed(() => {
  const s = String(dn.value.phaseLabel || '').trim()
  return s || phase.value.label
})
const clock = computed(() => {
  // 契约：time 0.0 = 06:00（黎明）；每 1/24 前进一小时
  const mins = Math.round(((rawTime.value * 24 + 6) % 24) * 60) % 1440
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
})

const weatherId = computed(() => {
  const w = String(dn.value.weather || 'clear')
  return WEATHER[w] ? w : 'clear'
})
const weather = computed(() => WEATHER[weatherId.value])
const weatherLabel = computed(() => {
  const s = String(dn.value.weatherLabel || '').trim()
  return s || weather.value.label
})

const wind = computed(() => {
  const v = Number(dn.value.wind)
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
})
const windLevel = computed(() => Math.min(6, Math.round(wind.value * 6)))
const temp = computed(() => {
  const v = Number(dn.value.temp)
  return Number.isFinite(v) ? Math.round(v) : 0
})
const amb = computed(() => {
  const v = Number(dn.value.amb)
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
})

const tone = computed(() => (phaseId.value === 'night' ? 'night' : phaseId.value === 'dusk' || phaseId.value === 'dawn' ? 'dusk' : 'day'))
const orbClass = computed(() => 'is-' + tone.value)

function artUrl(tex) {
  try {
    const img = tex && tex.image
    return img && typeof img.toDataURL === 'function' ? img.toDataURL('image/png') : ''
  } catch (e) {
    return ''
  }
}
const phaseUrls = new Map()
function phaseUrl(id) {
  if (!phaseUrls.has(id)) phaseUrls.set(id, artUrl(getDayPhaseIcon(id)))
  return phaseUrls.get(id)
}
const weatherUrls = new Map()
function weatherUrl(key) {
  if (!weatherUrls.has(key)) weatherUrls.set(key, artUrl(getWeatherIcon(key)))
  return weatherUrls.get(key)
}

const phaseIcon = computed(() => phaseUrl(phaseId.value))
const weatherIcon = computed(() => weatherUrl(weather.value.icon))

const forecast = computed(() => {
  const list = Array.isArray(dn.value.forecast) ? dn.value.forecast : []
  const out = []
  for (const item of list) {
    if (item == null) continue
    let id = ''
    let label = ''
    if (typeof item === 'string') {
      id = item
    } else if (typeof item === 'object') {
      id = String(item.weather || item.id || item.type || '')
      label = String(item.label || '')
    }
    if (!id || !WEATHER[id]) continue
    out.push({ id, label: label || WEATHER[id].label, icon: weatherUrl(WEATHER[id].icon) })
    if (out.length >= 2) break
  }
  if (!out.length) {
    const next = String(dn.value.nextWeather || '')
    if (next && WEATHER[next]) {
      out.push({ id: next, label: WEATHER[next].label, icon: weatherUrl(WEATHER[next].icon) })
    }
  }
  return out
})

const aria = computed(
  () =>
    `第${day.value}天 ${phaseLabel.value} ${clock.value} ${weatherLabel.value} ` +
    `风${windLevel.value}级 ${temp.value}摄氏度`,
)
</script>

<template>
  <div v-if="showClock" class="dn" :class="'tone-' + tone" role="status" :aria-label="aria">
    <div class="dn-main">
      <span class="dn-orb" :class="orbClass">
        <img :src="phaseIcon" width="24" height="24" alt="" />
      </span>
      <div class="dn-id">
        <div class="dn-day">
          第 {{ day }} 天 <span class="dn-sep">·</span>
          <span class="dn-phase">{{ phaseLabel }}</span>
        </div>
        <div class="dn-clock">{{ clock }}<em>{{ phaseEn }}</em></div>
      </div>
      <div class="dn-temp">{{ temp }}<span>°C</span></div>
    </div>

    <div class="dn-track"><i :style="{ width: timePct + '%' }"></i></div>

    <div class="dn-meta">
      <span class="dn-wx">
        <img :src="weatherIcon" width="14" height="14" alt="" />
        {{ weatherLabel }}
      </span>
      <span class="dn-wind" :title="'风速 ' + wind.toFixed(2)">风 {{ windLevel }} 级</span>
      <span class="dn-amb" :title="'环境亮度 ' + Math.round(amb * 100) + '%'">光 {{ Math.round(amb * 100) }}%</span>
    </div>

    <div v-if="forecast.length" class="dn-fc">
      <span class="dn-fc-t">预报</span>
      <span v-for="(f, i) in forecast" :key="f.id + '-' + i" class="dn-fc-i" :title="f.label">
        <img :src="f.icon" width="12" height="12" alt="" />
        <em>{{ f.label }}</em>
      </span>
    </div>
  </div>
</template>

<style scoped>
.dn {
  --dn-accent: var(--c-sand);
  --dn-soft: rgba(201, 176, 133, 0.1);
  --dn-line: rgba(201, 176, 133, 0.34);
  position: fixed;
  top: 86px;
  right: 24px;
  z-index: 11;
  width: 232px;
  pointer-events: none;
  padding: 7px 9px 8px;
  font-family: var(--font-mono);
  color: var(--c-bone);
  background: linear-gradient(180deg, rgba(10, 13, 15, 0.84), rgba(7, 9, 11, 0.92));
  border: 1px solid rgba(58, 68, 75, 0.65);
  border-left: 2px solid var(--dn-accent);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  transition: border-color 0.6s linear;
}

.dn.tone-night {
  --dn-accent: var(--c-neon-cold);
  --dn-soft: rgba(143, 196, 255, 0.14);
  --dn-line: rgba(143, 196, 255, 0.32);
  background: linear-gradient(180deg, rgba(9, 13, 20, 0.86), rgba(6, 9, 14, 0.93));
}
.dn.tone-dusk {
  --dn-accent: var(--c-rust-light);
  --dn-soft: rgba(192, 112, 56, 0.16);
  --dn-line: rgba(192, 112, 56, 0.42);
  background: linear-gradient(180deg, rgba(18, 12, 9, 0.86), rgba(10, 8, 7, 0.93));
}

.dn-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dn-orb {
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--dn-line);
  background: radial-gradient(circle at 50% 50%, var(--dn-soft), transparent 72%);
}
.dn-orb img {
  width: 24px;
  height: 24px;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  display: block;
}
.dn-orb.is-night {
  box-shadow: 0 0 9px rgba(143, 196, 255, 0.28);
}
.dn-orb.is-dusk {
  box-shadow: 0 0 8px rgba(224, 138, 63, 0.25);
}

.dn-id {
  flex: 1 1 auto;
  min-width: 0;
}

.dn-day {
  font-family: var(--font-title);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--c-bone);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dn-sep {
  color: var(--c-bone-dark);
}
.dn-phase {
  color: var(--dn-accent);
}

.dn-clock {
  font-size: 15px;
  line-height: 1.15;
  letter-spacing: 0.05em;
  color: var(--c-white);
}
.dn-clock em {
  font-style: normal;
  font-size: 7.5px;
  letter-spacing: 0.18em;
  color: var(--c-bone-dark);
  margin-left: 4px;
}

.dn-temp {
  font-size: 14px;
  color: var(--dn-accent);
  line-height: 1;
  white-space: nowrap;
}
.dn-temp span {
  font-size: 8px;
  opacity: 0.8;
}

.dn-track {
  height: 2px;
  margin: 6px 0 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.dn-track i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--dn-line), var(--dn-accent));
  transition: width 0.3s linear;
}

.dn-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
}
.dn-wx {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--c-bone);
  min-width: 0;
}
.dn-wx img {
  width: 14px;
  height: 14px;
  image-rendering: pixelated;
  display: block;
}
.dn-wind,
.dn-amb {
  white-space: nowrap;
}

.dn-fc {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed rgba(58, 68, 75, 0.5);
  font-size: 8px;
  letter-spacing: 0.08em;
}
.dn-fc-t {
  color: var(--c-bone-dark);
  letter-spacing: 0.16em;
}
.dn-fc-i {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--c-bone-dark);
}
.dn-fc-i img {
  width: 12px;
  height: 12px;
  image-rendering: pixelated;
  display: block;
}

@media (max-width: 760px) {
  .dn {
    top: 76px;
    right: 10px;
    width: 204px;
    transform: scale(0.92);
    transform-origin: top right;
  }
  .dn-amb {
    display: none;
  }
}
</style>
