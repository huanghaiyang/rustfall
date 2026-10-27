<script setup>
// =============================================================================
// NotificationFeed —— 右上角通知堆叠（拾取 / 任务 / 警告 / 系统）
// 数据源：G.notifications = [{ id, text, kind, time }]（state.js 的 notify() 维护）
// 纯展示：不可点击，pointer-events: none，不打断游戏输入。
// =============================================================================
import { computed } from 'vue'
import { G } from '../../game/state.js'

const KIND = {
  info: { label: '信息', cls: 'info', mark: 'i' },
  good: { label: '完成', cls: 'good', mark: '✓' },
  warn: { label: '警告', cls: 'warn', mark: '!' },
  danger: { label: '危险', cls: 'danger', mark: '×' },
  loot: { label: '拾取', cls: 'loot', mark: '+' },
}

const list = computed(() => {
  const arr = G.notifications
  if (!Array.isArray(arr)) return []
  return arr.slice(0, 6).map((n, i) => {
    const obj = n && typeof n === 'object' ? n : { text: String(n == null ? '' : n) }
    const kind = KIND[obj.kind] || KIND.info
    return {
      id: obj.id != null ? obj.id : 'n' + i,
      text: typeof obj.text === 'string' ? obj.text : String(obj.text == null ? '' : obj.text),
      kind: kind.cls,
      label: kind.label,
      mark: kind.mark,
      time: Math.max(0.8, Number(obj.time) || 4),
    }
  })
})
</script>

<template>
  <div class="nf-wrap" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="nf" tag="div" class="nf-stack">
      <div v-for="n in list" :key="n.id" class="rp-notif" :class="n.kind" role="status">
        <span class="nf-mark">{{ n.mark }}</span>
        <span class="nf-body">
          <span class="nf-text">{{ n.text }}</span>
          <span class="nf-kind">{{ n.label }}</span>
        </span>
        <span class="np" :style="{ animationDuration: n.time + 's' }" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.nf-wrap {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: var(--rp-z-notif, 80);
  width: 292px;
  max-width: 34vw;
  pointer-events: none;
  display: flex;
  justify-content: flex-end;
}

.nf-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.rp-notif {
  align-items: flex-start;
  animation: nf-in 0.2s steps(3, end) both;
}

/* 类别符号块 */
.nf-mark {
  flex: 0 0 16px;
  height: 16px;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  color: var(--c-void);
  background: var(--c-neon-cold);
}
.rp-notif.good .nf-mark {
  background: var(--c-toxic-glow);
}
.rp-notif.warn .nf-mark {
  background: var(--c-warn);
}
.rp-notif.danger .nf-mark {
  background: var(--c-neon-red);
}
.rp-notif.loot .nf-mark {
  background: var(--c-neon-warm);
}

.nf-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nf-text {
  font-family: var(--font-title);
  font-size: 12px;
  line-height: 1.45;
  color: var(--c-bone);
  word-break: break-word;
}

.nf-kind {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.2em;
  color: var(--c-bone-dark);
}

/* 剩余时间条：颜色跟随通知类别 */
.rp-notif .np {
  background: var(--c-bone-dark);
}
.rp-notif.info .np {
  background: var(--c-neon-cold);
}
.rp-notif.good .np {
  background: var(--c-toxic-glow);
}
.rp-notif.warn .np {
  background: var(--c-warn);
}
.rp-notif.danger .np {
  background: var(--c-neon-red);
}
.rp-notif.loot .np {
  background: var(--c-neon-warm);
}

/* —— 堆叠动画 —— */
.nf-enter-from {
  opacity: 0;
  transform: translateX(18px) scale(0.98);
}
.nf-enter-active {
  transition: opacity 0.16s linear, transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.nf-leave-to {
  opacity: 0;
  transform: translateX(22px);
  filter: saturate(0.4);
}
.nf-leave-active {
  transition: opacity 0.22s linear, transform 0.22s ease-in;
  position: absolute;
  right: 0;
  width: 100%;
}
.nf-move {
  transition: transform 0.18s ease-out;
}

@keyframes nf-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nf-enter-active,
  .nf-leave-active,
  .nf-move,
  .rp-notif {
    transition: none !important;
    animation: none !important;
  }
}
</style>
