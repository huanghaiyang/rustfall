<script setup>
// =============================================================================
// MonsterSprite —— 把怪物立绘（idle 帧）画进 <canvas>
// · 小怪走 getMonsterArt，大型 / 站点 BOSS 走 getLargeMonsterIdle（单帧，按需构建）
// · 列表里通过 IntersectionObserver 延迟构建，滚到可见才生成，避免打开面板就画满 90+ 张
// props: { artId, w, h, eager, label }
// =============================================================================
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { getMonsterArt, LARGE_MONSTER_IDS } from '../../game/render/art/monsters.js'
import { getLargeMonsterIdle } from '../../game/render/art/large-monsters.js'
import { THEME_BOSS_ART_IDS } from '../../game/render/art/theme-boss-art.js'

const props = defineProps({
  artId: { type: String, default: '' },
  w: { type: Number, default: 40 },
  h: { type: Number, default: 40 },
  eager: { type: Boolean, default: false },
  label: { type: String, default: '' },
})

const root = ref(null)
const cv = ref(null)
const failed = ref(false)
const dw = ref(0)
const dh = ref(0)

const LARGE_SET = new Set([...LARGE_MONSTER_IDS, ...THEME_BOSS_ART_IDS])

const style = computed(() =>
  dw.value && dh.value ? { width: dw.value + 'px', height: dh.value + 'px' } : { width: props.w + 'px', height: props.h + 'px' },
)

function resolveTexture(artId) {
  if (!artId) return null
  if (LARGE_SET.has(artId)) return getLargeMonsterIdle(artId)
  const art = getMonsterArt(artId)
  return (art && art.frames && art.frames.idle && art.frames.idle[0]) || null
}

function draw() {
  const el = cv.value
  if (!el || typeof el.getContext !== 'function') return
  let img = null
  try {
    const tex = resolveTexture(props.artId)
    img = tex && (tex.image || tex)
  } catch (e) {
    img = null
  }
  if (!img || !img.width || !img.height) {
    failed.value = true
    return
  }
  failed.value = false
  const k = Math.min(props.w / img.width, props.h / img.height)
  dw.value = Math.max(1, Math.round(img.width * k))
  dh.value = Math.max(1, Math.round(img.height * k))
  // 画布用原始像素尺寸，CSS 放大 → 最近邻、像素锐利
  if (el.width !== img.width) el.width = img.width
  if (el.height !== img.height) el.height = img.height
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, el.width, el.height)
  ctx.imageSmoothingEnabled = false
  try {
    ctx.drawImage(img, 0, 0)
  } catch (e) {
    failed.value = true
  }
}

let io = null
function scheduleDraw() {
  nextTick(draw)
}

onMounted(() => {
  if (props.eager || typeof IntersectionObserver === 'undefined' || !root.value) {
    draw()
    return
  }
  io = new IntersectionObserver(
    (ents) => {
      if (ents.some((e) => e.isIntersecting)) {
        io.disconnect()
        io = null
        draw()
      }
    },
    { rootMargin: '160px' },
  )
  io.observe(root.value)
})

onBeforeUnmount(() => {
  if (io) io.disconnect()
  io = null
})

watch(
  () => [props.artId, props.w, props.h],
  scheduleDraw,
)
</script>

<template>
  <span ref="root" class="ms" :style="{ width: props.w + 'px', height: props.h + 'px' }" :title="label" role="img" :aria-label="label">
    <canvas ref="cv" v-show="!failed" class="ms-cv" :style="style" />
    <span v-if="failed" class="ms-q">?</span>
  </span>
</template>

<style scoped>
.ms {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  line-height: 0;
  overflow: hidden;
}
.ms-cv {
  display: block;
  image-rendering: pixelated;
}
.ms-q {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--c-bone-dark);
  line-height: 1;
}
</style>
