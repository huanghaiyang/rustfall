<script setup>
// =============================================================================
// ItemIcon —— 把 (def?.category === 'weapon' || def?.slot === 'weapon' ? getWeaponArt(itemId) : getItemArt(itemId)) 的 CanvasTexture 画进 <canvas>（最近邻、像素锐利）
// props: { itemId, size = 20, count }
// 美术缺失 / 抛错 / id 未知时，退回「分类字形」兜底，保证界面不缺块。
// =============================================================================
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Content, KIND } from '../../game/core/registry.js'
import { getItemArt } from '../../game/render/art/items.js'
import { getWeaponArt } from '../../game/render/art/weapons.js'

const props = defineProps({
  itemId: { type: String, default: '' },
  size: { type: Number, default: 20 },
  count: { type: Number, default: 0 },
})

const cv = ref(null)

const px = computed(() => `${Math.max(8, Math.round(props.size || 20))}px`)

// 注册表里查定义（只读、空安全）
const def = computed(() => {
  if (!props.itemId) return null
  try {
    return Content.get(KIND.ITEM, props.itemId) || null
  } catch (e) {
    return null
  }
})

const category = computed(() => {
  const c = def.value && def.value.category
  return typeof c === 'string' && c ? c : 'material'
})

const label = computed(() => {
  const d = def.value
  if (d && d.name) return d.en ? `${d.name} / ${d.en}` : d.name
  return props.itemId || '未知物品'
})

const countText = computed(() => {
  const n = Math.floor(Number(props.count) || 0)
  if (n <= 1) return ''
  return n > 99 ? '99+' : String(n)
})

// —— 分类兜底字形：10×10 网格上的矩形，坐标用 0..9 ——
const GLYPHS = {
  material: { c: '#8a8272', r: [[2, 4, 5, 3], [4, 2, 3, 3]] }, // 料块
  component: { c: '#6f828c', r: [[2, 2, 6, 6], [0, 4, 2, 2], [8, 4, 2, 2]] }, // 芯片
  tool: { c: '#c07038', r: [[4, 1, 2, 6], [2, 7, 6, 2], [1, 2, 2, 2]] }, // 工具
  consumable: { c: '#8fae3a', r: [[3, 1, 4, 8], [4, 0, 2, 1]] }, // 电池
  artifact: { c: '#c9b085', r: [[2, 1, 6, 8], [3, 2, 4, 2], [3, 5, 4, 1]] }, // 遗物
  data: { c: '#8fc4ff', r: [[2, 2, 6, 6], [1, 4, 1, 2], [3, 3, 4, 1]] }, // 数据卡
  rare: { c: '#f2b34a', r: [[4, 0, 2, 10], [2, 2, 6, 2], [1, 4, 8, 2]] }, // 稀有核心
  quest: { c: '#6ff0d0', r: [[4, 1, 2, 5], [4, 8, 2, 2]] }, // 任务标记
}

function drawFallback(ctx, size) {
  const g = GLYPHS[category.value] || GLYPHS.material
  const u = size / 10
  ctx.fillStyle = g.c
  for (let i = 0; i < g.r.length; i++) {
    const [x, y, w, h] = g.r[i]
    ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u)))
  }
  // 底部一段暗色地影，让兜底图标看起来仍是“物件”而不是色块
  ctx.fillStyle = 'rgba(7, 9, 11, 0.45)'
  ctx.fillRect(0, size - 1, size, 1)
}

function draw() {
  const el = cv.value
  if (!el || typeof el.getContext !== 'function') return
  const size = Math.max(8, Math.min(128, Math.round(props.size || 20)))
  // 用整数尺寸当后备缓冲，CSS 再按像素尺寸显示 → 最近邻放大不失真
  if (el.width !== size) el.width = size
  if (el.height !== size) el.height = size
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)
  ctx.imageSmoothingEnabled = false

  let img = null
  if (props.itemId) {
    try {
      const tex = (def?.category === 'weapon' || def?.slot === 'weapon' ? getWeaponArt(props.itemId) : getItemArt(props.itemId))
      // 契约是 THREE.CanvasTexture（.image 是 canvas），也兼容直接给 canvas 的实现
      img = tex && (tex.image || tex)
    } catch (e) {
      img = null
    }
  }
  if (img && (img.width || img.videoWidth) && (img.height || img.videoHeight)) {
    try {
      ctx.drawImage(img, 0, 0, size, size)
      return
    } catch (e) {
      /* 纹理失效（上下文丢失等）→ 落到字形兜底 */
    }
  }
  drawFallback(ctx, size)
}

function redraw() {
  nextTick(() => draw())
}

onMounted(draw)
watch(() => [props.itemId, props.size], redraw)
</script>

<template>
  <span
    class="ii"
    :class="'ii-cat-' + category"
    :style="{ width: px, height: px }"
    :title="label"
    role="img"
    :aria-label="label"
  >
    <canvas ref="cv" class="rp-pixel ii-cv" :style="{ width: px, height: px }" />
    <span v-if="countText" class="cnt">{{ countText }}</span>
  </span>
</template>

<style scoped>
.ii {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  line-height: 0;
}

.ii-cv {
  display: block;
  background: transparent;
}

/* 数量角标：贴着图标右下，小号等宽，带暗底保证在亮像素上也读得清 */
.ii .cnt {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 0 2px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 11px;
  color: var(--c-white);
  background: rgba(7, 9, 11, 0.85);
  border: 1px solid rgba(58, 68, 75, 0.9);
  text-shadow: 0 1px 0 #000;
  pointer-events: none;
  white-space: nowrap;
}
</style>
