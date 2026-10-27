<script setup>
import { computed } from 'vue'
import { G } from '../game/state.js'
defineEmits(['next', 'title'])

const result = computed(() => G.result || { ok: true, signalBefore: G.signal, signalAfter: G.signal })
const up = computed(() => (result.value.signalAfter || 0) > (result.value.signalBefore || 0))
</script>

<template>
  <div class="overlay">
    <div class="panel">
      <h2 class="panel-title good">待 机</h2>
      <div class="panel-sub">STANDBY · 循环 {{ String(G.cycle).padStart(2, '0') }} 结束</div>
      <p class="panel-reason">
        {{ result.ok
          ? '你把电量喂给充电座，蜷进避难所的角落。外面酸雨敲了整夜的铁皮。'
          : '电量不够。你只能靠残余的电容硬撑，醒来时浑身都在响。' }}
      </p>

      <div class="panel-rows">
        <div class="panel-row"><span>电量储备</span><span class="val">{{ result.ok ? '充足' : '不足' }}</span></div>
        <div class="panel-row">
          <span>信号强度</span>
          <span class="val" :class="up ? 'up' : 'down'">{{ result.signalBefore }} → {{ result.signalAfter }}</span>
        </div>
        <div class="panel-row"><span>已存活循环</span><span class="val">{{ G.stats.cyclesSurvived }}</span></div>
        <div class="panel-row"><span>已救出幸存者</span><span class="val">{{ result.rescued ?? 0 }}</span></div>
        <div class="panel-row"><span>存档</span><span class="val">已写入</span></div>
      </div>

      <div class="btn-row">
        <button class="btn primary" @click="$emit('next')">进 入 下 一 个 循 环</button>
        <button class="btn" @click="$emit('title')">保 存 并 返 回 标 题</button>
      </div>
    </div>
  </div>
</template>
