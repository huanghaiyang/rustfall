<script setup>
// =============================================================================
// ToolBelt —— 4 格工具带（铲 / 镐 / 焊枪 / 扫描仪）
// 数据源：G.toolId / Content.all(KIND.TOOL)
// 行为门面：A.switchTool(id)
// prop: fixed=true 时自带左下角定位（HUD 直接挂载用）；否则由父容器定位。
// =============================================================================
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { Content, KIND } from '../../game/core/registry.js'
import { getItemArt } from '../../game/render/art/items.js'

const props = defineProps({
  // 默认自带底部居中定位（App.vue 里就是 <ToolBelt /> 直接挂）；
  // 由父容器定位时传 :fixed="false"
  fixed: { type: Boolean, default: true },
})

const CANON = [
  { id: 'shovel', name: '铲子', en: 'SHOVEL', key: '1', hint: '挖掘 · 快速破土' },
  { id: 'pickaxe', name: '镐', en: 'PICKAXE', key: '2', hint: '破岩 · 高伤害' },
  { id: 'welder', name: '焊枪', en: 'WELDER', key: '3', hint: '修复 · 切割' },
  { id: 'scanner', name: '扫描仪', en: 'SCANNER', key: '4', hint: '勘探 · 标记矿脉' },
]

// 与 config.js 的 TOOL_DAMAGE 对齐的兜底值（注册表优先）
const FALLBACK_DAMAGE = { shovel: 9, pickaxe: 18, welder: 6, scanner: 4 }
const FALLBACK_CAPS = { shovel: ['挖'], pickaxe: ['破墙'], welder: ['修复'], scanner: ['扫描'] }

function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
function act(name, ...args) {
  try {
    A?.[name]?.(...args)
  } catch (e) {
    /* 门面未就绪：静默 */
  }
}

// 真实工具定义的字段是 dig:true / breakTiles / repair / scan 这类能力标志，
// 不一定有数值 —— 这里统一折成短的“能力标签”。
function capsOf(def, id) {
  if (!def) return FALLBACK_CAPS[id] || []
  const out = []
  if (typeof def.dig === 'number' && def.dig > 0) out.push('挖 ×' + def.dig)
  else if (def.dig === true) out.push('挖')
  if (def.breakTiles) out.push('破墙')
  if (def.repair) out.push('修复')
  if (def.scan) out.push('扫描')
  if (!out.length) return FALLBACK_CAPS[id] || []
  return out
}

const registryTools = computed(() => {
  try {
    const all = Content.all(KIND.TOOL)
    return Array.isArray(all) ? all : []
  } catch (e) {
    return []
  }
})

const tools = computed(() =>
  CANON.map((c, i) => {
    const def =
      registryTools.value.find((t) => t && (t.id === c.id || t.toolId === c.id || t.tool === c.id)) || null
    return {
      id: c.id,
      key: c.key,
      index: i,
      name: (def && (def.name || def.title)) || c.name,
      en: (def && def.en) || c.en,
      desc: (def && (def.desc || def.description)) || c.hint,
      damage: num(def && (def.damage != null ? def.damage : def.attack), FALLBACK_DAMAGE[c.id] || 0),
      caps: capsOf(def, c.id),
      iconId: (def && (def.itemId || def.icon || def.artId)) || c.id,
    }
  }),
)

const current = computed(() => String(G.toolId || ''))

// —— 工具字形（注册表没有图标时用，四个形状必须能一眼区分）——
const cvMap = new Map()
function setCv(id) {
  return (el) => {
    if (el && typeof el.getContext === 'function') cvMap.set(id, el)
    else cvMap.delete(id)
  }
}

function drawGlyph(ctx, id, s) {
  const u = s / 12
  const R = (x, y, w, h) => ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u)))
  ctx.fillStyle = '#c9b085'
  if (id === 'shovel') {
    R(3, 1, 2, 7) // 柄
    ctx.fillStyle = '#8a4b26'
    R(2, 8, 4, 3) // 铲面
    ctx.fillStyle = '#6f828c'
    R(2, 8, 4, 1)
  } else if (id === 'pickaxe') {
    ctx.fillStyle = '#a8763a'
    R(5, 2, 2, 9) // 柄
    ctx.fillStyle = '#6f828c'
    R(2, 1, 8, 2) // 镐头
    R(2, 3, 1, 2)
    R(9, 3, 1, 2)
  } else if (id === 'welder') {
    ctx.fillStyle = '#3a444b'
    R(2, 4, 6, 4) // 枪身
    ctx.fillStyle = '#6f828c'
    R(8, 5, 3, 2) // 喷嘴
    ctx.fillStyle = '#6ff0d0'
    R(10, 4, 1, 4) // 电弧
    ctx.fillStyle = '#c07038'
    R(3, 8, 2, 3) // 握把
  } else {
    // scanner：碟形 + 波纹
    ctx.fillStyle = '#3a444b'
    R(4, 2, 4, 1)
    R(3, 3, 6, 1)
    R(2, 4, 8, 2)
    R(5, 6, 2, 4)
    ctx.fillStyle = '#8fc4ff'
    R(1, 2, 1, 1)
    R(10, 2, 1, 1)
    R(1, 4, 1, 1)
    R(10, 4, 1, 1)
  }
}

function drawTool(t) {
  const cv = cvMap.get(t.id)
  if (!cv || typeof cv.getContext !== 'function') return
  const S = 28
  if (cv.width !== S) cv.width = S
  if (cv.height !== S) cv.height = S
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, S, S)
  ctx.imageSmoothingEnabled = false
  let img = null
  try {
    const tex = getItemArt(t.iconId)
    img = tex && (tex.image || tex)
  } catch (e) {
    img = null
  }
  if (img && (img.width || img.videoWidth) && (img.height || img.videoHeight)) {
    try {
      ctx.drawImage(img, 0, 0, S, S)
      return
    } catch (e) {
      /* 落到字形 */
    }
  }
  drawGlyph(ctx, t.id, S)
}

function drawAll() {
  for (const t of tools.value) drawTool(t)
}

function pick(t) {
  if (!t) return
  act('switchTool', t.id)
}

watch(
  () => tools.value.length,
  () => nextTick(drawAll),
)

onMounted(() => nextTick(drawAll))
</script>

<template>
  <div class="tb" :class="{ toolbelt: props.fixed }" role="toolbar" aria-label="工具带">
    <button
      v-for="t in tools"
      :key="t.id"
      class="slot"
      :class="{ on: current === t.id }"
      type="button"
      :title="t.name + ' · ' + t.desc"
      :aria-pressed="current === t.id"
      @click="pick(t)"
    >
      <span class="key">{{ t.key }}</span>
      <span class="glyph">
        <canvas :ref="setCv(t.id)" class="rp-pixel" />
      </span>
      <span class="meta">
        <span class="nm">{{ t.name }}</span>
        <span class="en">{{ t.en }}</span>
      </span>
      <span class="stats">
        <span v-if="t.damage" class="st dmg">伤 {{ t.damage }}</span>
        <span v-if="t.caps.length" class="st dig">{{ t.caps[0] }}</span>
      </span>
      <i v-if="current === t.id" class="sel-bar" />
    </button>
  </div>
</template>

<style scoped>
.tb {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  background: rgba(7, 9, 11, 0.72);
  border: 1px solid rgba(58, 68, 75, 0.8);
  font-family: var(--font-mono);
}

/* 自带底部居中定位（与 style.css 里既有的 .toolbelt 规则一致，这里保证独立可用） */
.tb.toolbelt {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 12;
  pointer-events: auto;
}

.slot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 84px;
  padding: 4px 7px 4px 5px;
  background: rgba(13, 17, 19, 0.82);
  border: 1px solid var(--c-steel);
  color: var(--c-bone-dark);
  cursor: pointer;
  transition: border-color 0.1s linear, background 0.1s linear, color 0.1s linear;
}
.slot:hover {
  border-color: var(--c-rust-light);
  background: rgba(138, 75, 38, 0.2);
  color: var(--c-bone);
}
.slot.on {
  border-color: var(--c-neon-warm);
  background: rgba(242, 179, 74, 0.12);
  color: var(--c-white);
  box-shadow: inset 0 0 0 1px rgba(242, 179, 74, 0.22);
}

.key {
  position: absolute;
  top: -1px;
  left: -1px;
  width: 12px;
  height: 12px;
  display: grid;
  place-items: center;
  font-size: 8px;
  line-height: 1;
  color: var(--c-void);
  background: var(--c-steel-light);
}
.slot.on .key {
  background: var(--c-neon-warm);
  font-weight: 700;
}

.glyph {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: rgba(7, 9, 11, 0.9);
  border: 1px solid rgba(58, 68, 75, 0.7);
}
.glyph canvas {
  display: block;
  width: 28px;
  height: 28px;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  text-align: left;
}
.nm {
  font-family: var(--font-title);
  font-size: 10px;
  line-height: 1.25;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.en {
  font-size: 7px;
  letter-spacing: 0.14em;
  color: var(--c-bone-dark);
  white-space: nowrap;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-left: auto;
  padding-left: 4px;
  border-left: 1px solid rgba(58, 68, 75, 0.55);
}
.st {
  font-size: 7px;
  line-height: 1.3;
  white-space: nowrap;
}
.st.dmg {
  color: #d0957f;
}
.st.dig {
  color: var(--c-toxic);
}

.sel-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--c-neon-warm);
  box-shadow: 0 0 6px rgba(242, 179, 74, 0.7);
}

@media (max-width: 620px) {
  .slot {
    min-width: 56px;
  }
  .meta {
    display: none;
  }
}
</style>
