<script setup>
// =============================================================================
// PanelFrame —— 所有面板的外壳：像素边框 / CRT 扫描线 / 四角折角 / 标题栏 / 关闭
// props: { title, subtitle, wide }  + slots: default / actions / foot
// =============================================================================
import { computed } from 'vue'
import { A } from '../../game/ui-actions.js'
// 公共样式只需加载一次（Vite 按模块去重；集成方也可在 main.js 再引入）
import '../../styles/panels.css'

const props = defineProps({
  title: { type: String, default: '面板' },
  subtitle: { type: String, default: '' },
  wide: { type: Boolean, default: false },
  closable: { type: Boolean, default: true },
  // 强调色：rust（默认）| neon | danger
  tone: { type: String, default: 'rust' },
  // 是否给内容区加默认内边距（全宽列表类面板可关掉）
  pad: { type: Boolean, default: true },
})

// 关闭按钮 / 点空白：先抛 close（父级可据此收起自己控制的遮罩），再走统一门面
const emit = defineEmits(['close'])

const toneClass = computed(() => `tone-${props.tone || 'rust'}`)

function close() {
  try {
    emit('close')
  } catch (e) {
    /* ignore */
  }
  try {
    A?.closePanel?.()
  } catch (e) {
    /* 门面未就绪时静默，绝不打断游戏循环 */
  }
}

function onBackdrop(e) {
  // 只有点空白背景才关闭，点面板内部不触发
  if (!props.closable) return
  if (e.target !== e.currentTarget) return
  close()
}
</script>

<template>
  <div class="rp-root pf-root" @mousedown="onBackdrop">
    <section
      class="rp-panel rp-crt pf-panel"
      :class="[toneClass, { wide }]"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <i class="rp-corner tl" />
      <i class="rp-corner tr" />
      <i class="rp-corner bl" />
      <i class="rp-corner br" />
      <i class="pf-scan" aria-hidden="true" />

      <header class="rp-head">
        <div class="rp-titles">
          <h2 class="rp-title">{{ title }}</h2>
          <div v-if="subtitle" class="rp-sub">{{ subtitle }}</div>
        </div>
        <div class="rp-head-actions">
          <slot name="actions" />
          <button
            v-if="closable"
            class="rp-close"
            type="button"
            title="关闭"
            aria-label="关闭面板"
            @click="close"
          >
            ×
          </button>
        </div>
      </header>

      <div class="rp-body" :class="{ 'pf-tight': !pad }">
        <slot />
      </div>

      <footer v-if="$slots.foot" class="rp-foot">
        <slot name="foot" />
      </footer>
    </section>
  </div>
</template>

<style scoped>
.pf-root {
  animation: pf-fade 0.12s linear both;
}

@keyframes pf-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 强调色：只换掉标题栏的描边与文字光晕，保持整体铁锈主调 */
.tone-neon .rp-head {
  background:
    repeating-linear-gradient(90deg, rgba(111, 240, 208, 0.14) 0 2px, transparent 2px 4px),
    linear-gradient(180deg, rgba(24, 46, 44, 0.96), rgba(16, 26, 26, 0.96));
  border-bottom-color: rgba(111, 240, 208, 0.55);
}
.tone-neon .rp-head::before {
  background: var(--c-neon);
  box-shadow: 0 0 6px rgba(111, 240, 208, 0.6);
}
.tone-neon .rp-sub {
  color: var(--c-neon);
}

.tone-danger .rp-head {
  background:
    repeating-linear-gradient(90deg, rgba(200, 85, 63, 0.16) 0 2px, transparent 2px 4px),
    linear-gradient(180deg, rgba(58, 26, 22, 0.96), rgba(28, 16, 15, 0.96));
  border-bottom-color: rgba(200, 85, 63, 0.6);
}
.tone-danger .rp-head::before {
  background: var(--c-neon-red);
  box-shadow: 0 0 6px rgba(255, 86, 68, 0.6);
}
.tone-danger .rp-sub {
  color: #edaa9d;
}

/* 缓慢下移的扫描亮带：CRT 的“刷新感” */
.pf-scan {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 6px;
  z-index: 8;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(111, 240, 208, 0), rgba(111, 240, 208, 0.1), rgba(111, 240, 208, 0));
  opacity: 0.7;
  animation: rp-scan 7.5s linear infinite;
}

.pf-tight {
  padding: 0;
  gap: 0;
}

@media (max-width: 760px) {
  .rp-titles {
    min-width: 0;
  }
  .rp-title {
    font-size: 13px;
    letter-spacing: 0.08em;
  }
}
</style>
