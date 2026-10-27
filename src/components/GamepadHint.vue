<script setup>
// =============================================================================
// GamepadHint —— 右下角手柄提示：连接后显示 3 秒，再自动淡出
// 数据：G.gamepad.{connected,id}
// 美术：getGamepadIcon（A/B/X/Y/LB/RB/Start）；手柄本体用 CSS 像素图标
// =============================================================================
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { G } from '../game/state.js'
import { getGamepadIcon } from '../game/render/art/ui.js'

const HOLD_MS = 3000
const visible = ref(false)
let timer = null

const BINDINGS = [
  { keys: ['A'], label: '跳跃/确认' },
  { keys: ['X'], label: '攻击' },
  { keys: ['B'], label: '交互/返回' },
  { keys: ['Y'], label: '切机体' },
  { keys: ['LB', 'RB'], label: '切工具' },
  { keys: ['Stick'], label: '切武器' },
  { keys: ['Back'], label: '背包' },
  { keys: ['Start'], label: '暂停' },
  { keys: ['RB'], label: '面板切页' },
]

function artUrl(tex) {
  try {
    const img = tex && tex.image
    return img && typeof img.toDataURL === 'function' ? img.toDataURL('image/png') : ''
  } catch (e) {
    return ''
  }
}

const ICONS = {}
for (const key of ['A', 'B', 'X', 'Y', 'LB', 'RB', 'Start', 'Back', 'Stick']) {
  ICONS[key] = artUrl(getGamepadIcon(key))
}
const bindings = BINDINGS.map((b) => ({
  label: b.label,
  icons: b.keys.map((key) => ({ key, src: ICONS[key] })),
}))

const padName = computed(() => {
  const id = String((G.gamepad && G.gamepad.id) || '').trim()
  if (!id) return '手柄'
  return id.length > 34 ? id.slice(0, 32) + '…' : id
})

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}
function show() {
  clearTimer()
  visible.value = true
  timer = setTimeout(() => {
    visible.value = false
    timer = null
  }, HOLD_MS)
}

onMounted(() => {
  if (G.gamepad && G.gamepad.connected) show()
})

watch(
  () => !!(G.gamepad && G.gamepad.connected),
  (connected) => {
    if (connected) show()
    else {
      clearTimer()
      visible.value = false
    }
  },
)

onBeforeUnmount(clearTimer)
</script>

<template>
  <div v-if="G.gamepad.connected" class="gp-root">
    <transition name="gp-fade">
      <aside v-if="visible" class="gp" role="status" aria-label="手柄按键提示">
        <div class="gp-head">
          <span class="gp-pad" aria-hidden="true">
            <i class="gp-pad-body"></i>
            <i class="gp-pad-dpad"></i>
            <i class="gp-pad-btn a"></i>
            <i class="gp-pad-btn b"></i>
          </span>
          <span class="gp-name">{{ padName }}</span>
          <span class="gp-tag">已连接</span>
        </div>

        <div class="gp-rows">
          <div v-for="b in bindings" :key="b.label" class="gp-row">
            <span class="gp-keys">
              <img
                v-for="ic in b.icons"
                :key="ic.key"
                :src="ic.src"
                :alt="ic.key"
                width="15"
                height="15"
              />
            </span>
            <span class="gp-label">{{ b.label }}</span>
          </div>
        </div>
      </aside>
    </transition>
  </div>
</template>

<style scoped>
.gp-root {
  position: fixed;
  right: 20px;
  bottom: 18px;
  z-index: 12;
  pointer-events: none;
}

.gp {
  width: 246px;
  padding: 7px 9px 8px;
  font-family: var(--font-mono);
  background: linear-gradient(180deg, rgba(10, 13, 15, 0.9), rgba(7, 9, 11, 0.94));
  border: 1px solid rgba(58, 68, 75, 0.7);
  border-left: 2px solid var(--c-neon-warm);
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.55);
}

.gp-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.55);
}

/* CSS 像素手柄：机身 / 十字键 / 两个按钮 */
.gp-pad {
  position: relative;
  width: 24px;
  height: 16px;
  flex: 0 0 auto;
}
.gp-pad-body {
  position: absolute;
  inset: 0;
  border: 1px solid var(--c-steel-light);
  border-radius: 6px 6px 7px 7px;
  background: linear-gradient(180deg, var(--c-steel-dark), #0d1113);
  box-shadow: inset 0 1px 0 rgba(216, 207, 186, 0.2);
}
.gp-pad-dpad {
  position: absolute;
  left: 4px;
  top: 7px;
  width: 5px;
  height: 2px;
  background: var(--c-steel-light);
  box-shadow:
    0 -2px 0 var(--c-steel-light),
    0 2px 0 var(--c-steel-light);
}
.gp-pad-btn {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
}
.gp-pad-btn.a {
  right: 5px;
  top: 5px;
  background: var(--c-toxic-glow);
}
.gp-pad-btn.b {
  right: 4px;
  top: 9px;
  background: var(--c-danger);
}

.gp-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--c-bone);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gp-tag {
  flex: 0 0 auto;
  font-size: 7.5px;
  letter-spacing: 0.14em;
  color: var(--c-toxic-glow);
  border: 1px solid rgba(143, 174, 58, 0.5);
  background: rgba(143, 174, 58, 0.12);
  padding: 1px 4px;
}

.gp-rows {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 10px;
  padding-top: 5px;
}

.gp-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.gp-keys {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}
.gp-keys img {
  width: 15px;
  height: 15px;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  display: block;
}

.gp-label {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--c-bone-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gp-fade-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}
.gp-fade-leave-active {
  transition:
    opacity 0.5s ease,
    transform 0.35s ease;
}
.gp-fade-enter-from,
.gp-fade-leave-to {
  opacity: 0;
  transform: translateY(5px);
}

@media (max-width: 760px) {
  .gp-root {
    right: 10px;
    bottom: 10px;
  }
  .gp {
    width: 216px;
  }
}
</style>
