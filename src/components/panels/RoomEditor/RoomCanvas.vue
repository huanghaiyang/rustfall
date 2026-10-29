<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { RoomViewport } from '../../../game/editor/room-viewport.js'
import { RE, bgLayers } from '../../../game/editor/room-store.js'

const emit = defineEmits(['change'])

const canvasEl = ref(null)
const wrapEl = ref(null)
let vp = null
let ro = null

onMounted(() => {
  vp = new RoomViewport(canvasEl.value, (ev) => emit('change', ev))
  vp.zoomToFit()
  ro = new ResizeObserver(() => vp.resize())
  ro.observe(wrapEl.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  vp?.dispose()
  vp = null
})

// 切换房间 → 重新生成并适配窗口
watch(
  () => RE.gen,
  () => {
    vp?.zoomToFit()
  },
)

// 显示开关 / 工具切换 → 重绘
watch(
  () => [RE.view.grid, RE.view.bg, RE.view.props, RE.view.entities, RE.view.labels, RE.sel.tool, RE.sel.tile, RE.sel.bgLayerId],
  () => vp?.render(),
)

// 背景层数据变化（增删/排序/参数/图像几何）→ 重绘
watch(bgLayers, () => vp?.render(), { deep: true })
</script>

<template>
  <div ref="wrapEl" class="rmc-wrap">
    <canvas ref="canvasEl" class="rmc-canvas"></canvas>
    <div class="rmc-zoom">
      <button class="rmc-zbtn" title="放大" @click="vp?.zoomTo(1.25)">＋</button>
      <button class="rmc-zbtn" title="缩小" @click="vp?.zoomTo(1 / 1.25)">－</button>
      <button class="rmc-zbtn wide" title="适应窗口" @click="vp?.zoomToFit()">适应</button>
      <button
        class="rmc-zbtn wide"
        title="重置视图"
        @click="RE.view.zoom = 4; RE.view.panX = 0; RE.view.panY = 0; vp?.render()"
      >
        1:1
      </button>
    </div>
    <div class="rmc-hint">
      滚轮缩放 · Alt/中键拖拽平移 · 左键涂地形 · 右键擦除 · 背景层工具下拖拽移动图像
    </div>
  </div>
</template>

<style scoped>
.rmc-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #080a0c;
}
.rmc-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
.rmc-zoom {
  position: absolute;
  right: 10px;
  top: 10px;
  display: flex;
  gap: 4px;
}
.rmc-zbtn {
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
.rmc-zbtn.wide {
  width: auto;
  padding: 0 8px;
  font-size: 11px;
}
.rmc-zbtn:hover {
  border-color: var(--c-rust-light, #c07038);
  color: var(--c-white, #e8e3d6);
}
.rmc-hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 10px;
  color: rgba(216, 207, 186, 0.4);
  pointer-events: none;
  font-family: var(--font-mono, monospace);
}
</style>
