<script setup>
import { G } from '../game/state.js'
import { getChassis } from '../game/chassis/index.js'
defineEmits([
  'resume',
  'help',
  'mods',
  'settings',
  'restart',
  'title',
  'mute',
  'volume',
  'quests',
  'archive',
  'companions',
  'growth',
  'levels',
])
</script>

<template>
  <div class="overlay">
    <div class="panel">
      <h2 class="panel-title">暂 停</h2>
      <div class="panel-sub">PAUSED · 循环 {{ String(G.cycle).padStart(2, '0') }} · {{ G.roomName }}</div>

      <div class="panel-rows">
        <div class="panel-row"><span>机体</span><span class="val">{{ getChassis(G.chassisId)?.name || G.chassisId }}</span></div>
        <div class="panel-row"><span>等级 / 经验</span><span class="val">Lv.{{ G.growth?.level || 1 }} · {{ G.growth?.xp || 0 }}/{{ G.growth?.xpNext || 60 }}</span></div>
        <div class="panel-row"><span>可分配点数</span><span class="val">{{ G.growth?.points || 0 }}</span></div>
        <div class="panel-row"><span>结构 / 能量</span><span class="val">{{ Math.ceil(G.hp) }} / {{ Math.ceil(G.energy) }}</span></div>
        <div class="panel-row"><span>电量 / 信号</span><span class="val">{{ G.power }} / {{ G.signal }}</span></div>
        <div class="panel-row"><span>本循环剩余</span><span class="val">{{ Math.ceil(G.timeLeft) }} 秒</span></div>
        <div class="panel-row"><span>击杀 / 拾取</span><span class="val">{{ G.stats.kills }} / {{ G.stats.looted }}</span></div>
        <div class="panel-row"><span>帧率</span><span class="val">{{ G.fps }} FPS</span></div>
      </div>

      <div class="setting">
        <span>音量</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="G.volume"
          @input="$emit('volume', parseFloat($event.target.value))"
        />
        <button class="btn" style="min-width: 96px; padding: 6px 12px" @click="$emit('mute')">
          {{ G.muted ? '已静音' : '声音开' }}
        </button>
      </div>

      <div class="btn-row">
        <button class="btn primary" @click="$emit('resume')">继 续</button>
        <button class="btn" @click="$emit('quests')">任 务</button>
        <button class="btn" @click="$emit('archive')">档 案</button>
        <button class="btn" @click="$emit('companions')">同 伴</button>
        <button class="btn" @click="$emit('growth')">成 长</button>
        <button class="btn" @click="$emit('help')">操 作</button>
        <button class="btn" @click="$emit('mods')">模 组</button>
        <button class="btn" @click="$emit('settings')">设 置</button>
        <button class="btn" @click="$emit('levels')">关 卡 选 择</button>
        <button class="btn" @click="$emit('restart')">重 新 开 始</button>
        <button class="btn danger" @click="$emit('title')">返 回 标 题</button>
      </div>
    </div>
  </div>
</template>
