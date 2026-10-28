<script setup>
import { computed } from 'vue'
import { G } from '../game/state.js'
import { Content, KIND } from '../game/core/registry.js'
import { formatTime } from '../game/utils.js'

const hpPct = computed(() => Math.max(0, Math.min(100, (G.hp / Math.max(1, G.hpMax)) * 100)))
const energyPct = computed(() => Math.max(0, Math.min(100, (G.energy / Math.max(1, G.energyMax)) * 100)))
const timePct = computed(() => Math.max(0, Math.min(100, (G.timeLeft / Math.max(1, G.cycleTotal)) * 100)))
const timeText = computed(() => formatTime(G.timeLeft))
const phaseText = computed(() =>
  G.weatherPhase === 'storm' ? '酸雨' : G.weatherPhase === 'warning' ? '雨将至' : '间歇',
)
const exposedPct = computed(() => Math.min(100, (G.exposed / 5) * 100))
const chassisName = computed(() => Content.get(KIND.CHASSIS, G.chassisId)?.name || '机身')
const chaosPct = computed(() => Math.round(Math.max(0, Math.min(1, G.chaosLevel || 0)) * 100))
const chaosText = computed(() => {
  const s = G.chaosState || 'stable'
  return s === 'critical' ? '失控' : s === 'unstable' ? '不稳定' : s === 'drifting' ? '漂移' : '平稳'
})

const tracked = computed(() => {
  const id = G.quests?.tracked || G.quests?.active?.[0]?.id
  if (!id) return null
  const entry = G.quests.active.find((e) => e && (e.id === id || e.questId === id))
  const def = Content.get(KIND.QUEST, id)
  if (!def) return null
  const progress = entry?.progress || entry?.objectives || {}
  const objectives = (def.objectives || []).map((o) => {
    const p = typeof progress[o.id] === 'number' ? progress[o.id] : progress[o.id]?.count || 0
    return { ...o, have: p, done: p >= (o.count || 1) }
  })
  return { def, objectives }
})

const rescue = computed(() => (G.rescue?.active ? G.rescue : null))
const interact = computed(() => G.interactHint || null)
const padActive = computed(() => !!G.ui.padActive)
const interactKey = computed(() => (padActive.value ? 'B' : 'E'))
const hudKeys = computed(() =>
  padActive.value
    ? '左摇杆 移动 · A 跳跃 · X 攻击/工具 · B 交互 · Y 切机体 · LB/RB 工具 · 十字键←→ 武器 · Back 背包 · Start 暂停'
    : 'A/D 移动 · 空格 跳跃 · J 攻击/使用工具 · E 交互 · Q 切换机体 · 1-4 工具 · 5-8 武器 · I 背包 · L 任务 · C 档案 · R 同伴 · ESC 暂停',
)
</script>

<template>
  <div class="hud">
    <div class="hud-top">
      <div class="hud-block">
        <div class="region-name">{{ G.regionName }}</div>
        <div class="room-name">{{ G.roomName }}</div>
        <div class="chassis-name"><b>{{ chassisName }}</b></div>
        <div class="hud-bars">
          <div class="bar">
            <span>结构</span>
            <div class="bar-track"><div class="bar-fill hp" :style="{ width: hpPct + '%' }"></div></div>
            <b>{{ Math.ceil(G.hp) }}/{{ G.hpMax }}</b>
          </div>
          <div class="bar">
            <span>能量</span>
            <div class="bar-track"><div class="bar-fill energy" :style="{ width: energyPct + '%' }"></div></div>
            <b>{{ Math.ceil(G.energy) }}/{{ G.energyMax }}</b>
          </div>
        </div>
        <div class="cycle-info">循环 {{ String(G.cycle).padStart(2, '0') }} · 归档 {{ G.archive.entries.length }}</div>
      </div>

      <div class="weather-hud">
        <div class="weather-track">
          <div class="weather-fill" :class="G.weatherPhase" :style="{ width: timePct + '%' }"></div>
        </div>
        <div class="weather-meta">
          <span class="weather-phase" :class="G.weatherPhase">{{ phaseText }}</span>
          <span class="weather-time">{{ timeText }}</span>
        </div>
      </div>

      <div class="hud-right">
        <div class="power-pips">
          <span v-for="i in G.powerMax" :key="i" class="power-pip" :class="{ on: i <= G.power }"></span>
        </div>
        <div class="power-label">电量 {{ G.power }}/{{ G.needPower }}</div>
        <div class="signal-runes">
          <span v-for="i in G.signalMax" :key="i" class="signal-rune" :class="{ on: i <= G.signal }"></span>
        </div>
        <div class="cycle-info">信号 {{ G.signal }}/{{ G.signalMax }}</div>
        <div v-if="chaosPct > 2" class="chaos-meter" :class="G.chaosState">
          <span class="chaos-label">混乱</span>
          <div class="chaos-track"><div class="chaos-fill" :style="{ width: chaosPct + '%' }"></div></div>
          <span class="chaos-state">{{ chaosText }}</span>
        </div>
      </div>
    </div>

    <transition name="fade" mode="out-in">
      <div v-if="G.hint" :key="G.hintKey" class="toast" :class="G.hintKind || 'info'">
        {{ G.hint }}
      </div>
    </transition>

    <div v-if="G.shelterProgress > 0.02" class="shelter-progress">
      <div class="shelter-track">
        <div class="shelter-fill" :style="{ width: G.shelterProgress * 100 + '%' }"></div>
      </div>
      <div class="shelter-text">待 机 充 电 中</div>
    </div>

    <div v-if="G.weatherPhase === 'storm' && G.exposed > 0.3" class="exposed-bar">
      <div class="exposed-track">
        <div class="exposed-fill" :style="{ width: exposedPct + '%' }"></div>
      </div>
      <div class="exposed-text">酸 雨 腐 蚀</div>
    </div>

    <div v-if="tracked" class="tracker">
      <div class="tracker-title">{{ tracked.def.title }}</div>
      <div
        v-for="o in tracked.objectives"
        :key="o.id"
        class="tracker-obj"
        :class="{ done: o.done, 'tracker-rescue': tracked.def.type === 'rescue' }"
      >
        {{ o.done ? '✓' : '▢' }} {{ o.label }} <span v-if="(o.count || 1) > 1">{{ o.have }}/{{ o.count }}</span>
      </div>
    </div>

    <div v-if="rescue" class="tracker" style="top: 300px; border-color: var(--c-neon-warm)">
      <div class="tracker-title">营救中</div>
      <div class="tracker-obj tracker-rescue">护送 {{ rescue.targetName }} 前往避难所</div>
    </div>

    <div v-if="interact" class="interact-hint">
      <span class="interact-key">{{ interactKey }}</span>
      <span>{{ interact.label }}</span>
      <span v-if="interact.sub" class="interact-sub">{{ interact.sub }}</span>
    </div>

    <div v-if="G.weapon && G.weapon.id" class="hud-weapon">
      <div class="hw-name">{{ G.weapon.name || G.weapon.id }}</div>
      <div class="hw-line">
        <span v-if="G.weapon.class === 'ranged'">{{ G.weapon.ammo }}/{{ G.weapon.ammoMax }} · 备 {{ G.weapon.reserve }}</span>
        <span v-else>近战 · {{ G.weapon.damage }} 伤害</span>
        <span v-if="G.weapon.reloading" class="hw-reload">换弹 {{ Math.round((G.weapon.reloadProgress || 0) * 100) }}%</span>
        <span v-else-if="G.weapon.compatible === false" class="hw-bad">不兼容</span>
      </div>
    </div>

    <div class="hud-keys">
      {{ hudKeys }}
    </div>
  </div>
</template>
