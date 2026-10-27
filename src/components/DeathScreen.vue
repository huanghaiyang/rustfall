<script setup>
import { G } from '../game/state.js'
defineProps({ reason: { type: String, default: '' } })
defineEmits(['retry', 'title'])
</script>

<template>
  <div class="overlay">
    <div class="panel">
      <h2 class="panel-title danger">机 体 损 毁</h2>
      <div class="panel-sub">SIGNAL LOST</div>
      <p class="panel-reason">{{ reason || '酸雨把最后一盏指示灯也浇灭了。' }}</p>

      <div class="panel-rows">
        <div class="panel-row"><span>损毁原因</span><span class="val">{{ reason || '未知' }}</span></div>
        <div class="panel-row">
          <span>信号</span>
          <span class="val down">{{ G.signal }} → {{ Math.max(1, G.signal - 1) }}</span>
        </div>
        <div class="panel-row"><span>累计损毁</span><span class="val">{{ G.stats.deaths }}</span></div>
        <div class="panel-row"><span>下一次唤醒</span><span class="val">最近的避难所</span></div>
      </div>

      <div class="btn-row">
        <button class="btn primary" @click="$emit('retry')">在 避 难 所 重 启</button>
        <button class="btn danger" @click="$emit('title')">返 回 标 题</button>
      </div>
    </div>
  </div>
</template>
