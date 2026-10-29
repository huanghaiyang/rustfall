<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { SpriteViewport } from '../../../game/editor/sprite-viewport.js'
import { SE, currentSheet } from '../../../game/editor/sprite-store.js'

const emit = defineEmits(['change'])

const canvasEl = ref(null)
const wrapEl = ref(null)
let vp = null
let ro = null

onMounted(() => {
  vp = new SpriteViewport(canvasEl.value, (ev) => emit('change', ev))
  vp.zoomToFit()
  ro = new ResizeObserver(() => vp.resize())
  ro.observe(wrapEl.value)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
  vp?.dispose()
  vp = null
})

function onKey(e) {
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'Enter' && SE.sel.tool === 'poly') {
    vp?.commitPoly()
    SE.sel.tool = 'select'
  }
}

// 切换精灵图后重新适配
watch(
  () => currentSheet()?.id,
  () => {
    if (vp) vp.zoomToFit()
  },
)
</script>

<template>
  <div ref="wrapEl" class="sec-wrap">
    <canvas ref="canvasEl" class="sec-canvas" @dblclick="vp?.commitPoly(); SE.sel.tool = 'select'"></canvas>
    <div class="sec-zoom">
      <button class="sec-zbtn" title="放大" @click="vp?.zoomTo(1.25)">＋</button>
      <button class="sec-zbtn" title="缩小" @click="vp?.zoomTo(1 / 1.25)">－</button>
      <button class="sec-zbtn wide" title="适应窗口" @click="vp?.zoomToFit()">适应</button>
      <button class="sec-zbtn wide" title="重置视图" @click="SE.view.zoom = 1; SE.view.panX = 0; SE.view.panY = 0; vp?.render()">
        1:1
      </button>
    </div>
    <div class="sec-hint">
      滚轮缩放 · Alt+拖拽平移 · 骨骼 Shift+点击=子骨骼 · 右键取消多边形 · 多边形双击闭合
    </div>
  </div>
</template>

<style scoped>
.sec-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    linear-gradient(rgba(0, 0, 0, 0.25) 1px, transparent 1px) 0 0 / 100% 32px,
    linear-gradient(90deg, rgba(0, 0, 0, 0.25) 1px, transparent 1px) 0 0 / 32px 100%,
    #0b0d0f;
}
.sec-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
.sec-zoom {
  position: absolute;
  right: 10px;
  top: 10px;
  display: flex;
  gap: 4px;
}
.sec-zbtn {
  background: rgba(16, 20, 23, 0.9);
  border: 1px solid var(--c-steel, #3a444b);
  color: var(--c-bone, #d8cfba);
  width: 26px;
  height: 24px;
  cursor: pointer;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  border-radius: 2px;
}
.sec-zbtn.wide {
  width: auto;
  padding: 0 8px;
  font-size: 11px;
}
.sec-zbtn:hover {
  border-color: var(--c-rust-light, #c07038);
  color: var(--c-white, #e8e3d6);
}
.sec-hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 10px;
  color: rgba(216, 207, 186, 0.4);
  pointer-events: none;
  font-family: var(--font-mono, monospace);
}
</style>
