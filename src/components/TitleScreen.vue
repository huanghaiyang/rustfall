<script setup>
import { ref, onMounted } from 'vue'
import { getLogoTexture } from '../game/render/art/ui.js'

defineProps({
  hasSave: Boolean,
  saveInfo: Object,
  ready: Boolean,
})
defineEmits(['start', 'continue', 'mods', 'settings', 'help', 'levels'])
const logoRef = ref(null)

onMounted(() => {
  try {
    const tex = getLogoTexture()
    const img = tex?.image
    if (img && logoRef.value) {
      const c = logoRef.value
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
    }
  } catch (e) {
    /* logo 缺失时退化为文字标题 */
  }
})
</script>

<template>
  <div class="overlay title-screen">
    <canvas ref="logoRef" class="title-logo" style="display: none"></canvas>
    <h1 class="title-cn">锈雨</h1>
    <div class="title-en">RUSTFALL</div>
    <p class="title-tag">酸雨会洗掉一切，除了还在走的东西。</p>

    <div class="title-menu">
      <button class="btn primary" :disabled="!ready" @click="$emit('start')">开 始 新 循 环</button>
      <button v-if="hasSave" class="btn" :disabled="!ready" @click="$emit('continue')">
        继 续 · 循环 {{ String(saveInfo?.cycle || 1).padStart(2, '0') }} · 信号 {{ saveInfo?.signal || 2 }}
      </button>
      <button class="btn" @click="$emit('mods')">模 组 管 理</button>
      <button class="btn" @click="$emit('levels')">关 卡 选 择 · 测 试</button>
      <button class="btn" @click="$emit('settings')">设 置 · 画 面 与 手 柄</button>
      <button class="btn" @click="$emit('help')">操 作 与 生 存 指 南</button>
    </div>

    <div v-if="hasSave" class="save-line">
      上次待机：<b>{{ saveInfo?.chassis || '未知机体' }}</b> · {{ saveInfo?.room || '未知区域' }} ·
      救出 <b>{{ saveInfo?.survivors || 0 }}</b> 人
    </div>

    <div class="title-foot">VUE 3 × THREE.JS · 程序化废土 · 像素立绘 · 支持 MOD</div>
  </div>
</template>
