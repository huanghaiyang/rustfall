<script setup>
// =============================================================================
// ModManager —— mod 列表：启用开关 / 版本作者 / 状态 / 错误输出
// 数据源：G.mods = { list, loaded, errors }
// 行为门面：A.enableMod(id, on)
// =============================================================================
import { computed } from 'vue'
import PanelFrame from './PanelFrame.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'

const STATUS = {
  loaded: { label: '已加载', tone: 'toxic' },
  idle: { label: '待加载', tone: 'warn' },
  disabled: { label: '已禁用', tone: '' },
  error: { label: '加载失败', tone: 'danger' },
}

function act(name, ...args) {
  try {
    A?.[name]?.(...args)
  } catch (e) {
    /* 门面未就绪：静默 */
  }
}
function str(v, d = '') {
  return typeof v === 'string' ? v : v == null ? d : String(v)
}

const rawMods = computed(() => {
  const m = G.mods
  if (!m) return []
  if (Array.isArray(m)) return m
  return Array.isArray(m.list) ? m.list : []
})

const loadedIds = computed(() => {
  const m = G.mods
  const arr = m && Array.isArray(m.loaded) ? m.loaded : []
  return new Set(arr.map((x) => (typeof x === 'string' ? x : (x && (x.id || x.name)) || '')))
})

const mods = computed(() =>
  rawMods.value.map((m, i) => {
    const obj = m && typeof m === 'object' ? m : { id: str(m, 'mod' + i) }
    const id = str(obj.id || obj.name || 'mod' + i)
    const enabled = obj.enabled !== false && obj.disabled !== true
    const loaded = loadedIds.value.has(id) || obj.loaded === true
    // 加载器把单 mod 错误放在 errors: string[]，也兼容单数字段
    const arrErr = Array.isArray(obj.errors) ? obj.errors.filter(Boolean).join('；') : ''
    const error = str(obj.error || obj.err || arrErr, '')
    const status = error ? 'error' : !enabled ? 'disabled' : loaded ? 'loaded' : 'idle'
    return {
      id,
      name: str(obj.name || obj.title || id),
      version: str(obj.version || obj.ver || '—'),
      author: str(obj.author || obj.by || '匿名'),
      desc: str(obj.desc || obj.description || ''),
      enabled,
      loaded,
      error,
      status,
      meta: STATUS[status] || STATUS.idle,
      dir: str(obj.dir || obj.source || ''),
      items: Math.max(0, Math.floor(Number(obj.items) || 0)),
    }
  }),
)

const stats = computed(() => {
  const total = mods.value.length
  const loaded = mods.value.filter((m) => m.status === 'loaded').length
  const errors = mods.value.filter((m) => m.status === 'error').length
  const off = mods.value.filter((m) => !m.enabled).length
  return { total, loaded, errors, off }
})

const errorList = computed(() => {
  const m = G.mods
  const arr = m && Array.isArray(m.errors) ? m.errors : []
  return arr.map((e, i) => {
    if (typeof e === 'string') return { id: 'e' + i, where: '', text: e }
    return {
      id: str(e && (e.mod || e.id), 'e' + i),
      where: str(e && (e.mod || e.id), ''),
      text: str(e && (e.message || e.error || e.text), '未知错误'),
    }
  })
})

function toggle(m) {
  if (!m) return
  act('enableMod', m.id, !m.enabled)
}
</script>

<template>
  <PanelFrame title="模组" subtitle="MODS / EXTENSIONS" tone="neon" wide>
    <div class="mm">
      <!-- 概览 -->
      <header class="mm-top">
        <div class="stat-box">
          <span class="sb-n">{{ stats.total }}</span>
          <span class="sb-l">总数</span>
        </div>
        <div class="stat-box">
          <span class="sb-n rp-toxic">{{ stats.loaded }}</span>
          <span class="sb-l">已加载</span>
        </div>
        <div class="stat-box">
          <span class="sb-n rp-dim">{{ stats.off }}</span>
          <span class="sb-l">已禁用</span>
        </div>
        <div class="stat-box">
          <span class="sb-n" :class="stats.errors ? 'rp-danger' : 'rp-dim'">{{ stats.errors }}</span>
          <span class="sb-l">错误</span>
        </div>
        <div class="rp-grow" />
        <div class="mm-note">
          <span class="rp-dim">切换开关会立即写入配置；</span>
          <span class="rp-warn">刷新后生效。</span>
        </div>
      </header>

      <!-- 列表 -->
      <div v-if="mods.length" class="rp-list mm-list">
        <article v-for="m in mods" :key="m.id" class="mod" :class="[m.status, { off: !m.enabled }]">
          <div class="m-head">
            <span class="m-dot" :class="m.status" />
            <span class="m-name">{{ m.name }}</span>
            <span class="m-ver">v{{ m.version }}</span>
            <span class="m-author">by {{ m.author }}</span>
            <span class="rp-tag" :class="m.meta.tone">{{ m.meta.label }}</span>
            <span class="rp-grow" />
            <button
              class="rp-switch"
              :class="{ on: m.enabled }"
              type="button"
              role="switch"
              :aria-checked="m.enabled"
              :title="m.enabled ? '点击禁用' : '点击启用'"
              @click="toggle(m)"
            />
          </div>

          <p v-if="m.desc" class="m-desc">{{ m.desc }}</p>
          <p v-else class="m-desc none">（该 mod 没有提供说明。）</p>

          <div v-if="m.error" class="m-error">
            <span class="e-tag">ERROR</span>
            <span class="e-text">{{ m.error }}</span>
          </div>

          <div class="m-foot">
            <span class="m-id">{{ m.id }}</span>
            <span v-if="m.items" class="rp-dim">· {{ m.items }} 项内容</span>
            <span v-if="m.dir" class="rp-dim">· {{ m.dir }}</span>
          </div>
        </article>
      </div>

      <!-- 空态：给出目录提示 -->
      <div v-else class="rp-empty mm-empty">
        <span class="big">没有发现 mod</span>
        <p class="empty-text">
          把 mod 放进项目根目录的 <b>mods/</b> 文件夹（与 <b>index.html</b> 同级），
          重启游戏后自动扫描。
        </p>
        <ul class="empty-list">
          <li><code>mods/&lt;名称&gt;/mod.js</code> —— 默认导出注册函数</li>
          <li><code>mods/&lt;名称&gt;/mod.json</code> —— 纯数据 mod（物品/任务/房间）</li>
          <li>mod 只能通过 <code>Content.register()</code> 挂载内容，不会注入脚本到核心代码</li>
        </ul>
        <p class="empty-hint">加载顺序按文件夹名排序；重复 id 会在启动时报错并跳过该 mod。</p>
      </div>

      <!-- 全局错误 -->
      <section v-if="errorList.length" class="errs">
        <header class="errs-head">
          <span class="rp-tag danger">加载器错误</span>
          <span class="rp-dim">{{ errorList.length }} 条</span>
        </header>
        <ul class="errs-list rp-scroll">
          <li v-for="e in errorList" :key="e.id" class="err">
            <span v-if="e.where" class="err-where">{{ e.where }}</span>
            <span class="err-text">{{ e.text }}</span>
          </li>
        </ul>
      </section>
    </div>

    <template #foot>
      <span>mod 与核心内容走同一条注册通道 · 卸载需重启</span>
      <span class="rp-grow" />
      <span class="rp-dim">内容冲突会在启动日志里列出</span>
    </template>
  </PanelFrame>
</template>

<style scoped>
.mm {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* —— 概览 —— */
.mm-top {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding-bottom: 7px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.7);
}
.stat-box {
  flex: 0 0 auto;
  min-width: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  background: rgba(13, 17, 19, 0.75);
  border: 1px solid var(--c-steel);
}
.sb-n {
  font-family: var(--font-title);
  font-size: 17px;
  line-height: 1.1;
  color: var(--c-white);
}
.sb-l {
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--c-bone-dark);
}
.mm-note {
  align-self: center;
  font-size: 10px;
  line-height: 1.5;
  text-align: right;
  max-width: 260px;
}

/* —— mod 卡片 —— */
.mm-list {
  gap: 6px;
  padding-right: 3px;
}

.mod {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.01) 0 1px, transparent 1px 3px),
    rgba(13, 17, 19, 0.78);
  border: 1px solid var(--c-steel);
  border-left: 3px solid var(--c-steel-light);
}
.mod.loaded {
  border-left-color: var(--c-toxic);
}
.mod.error {
  border-left-color: var(--c-danger);
  background: rgba(200, 85, 63, 0.07);
}
.mod.disabled {
  border-left-color: var(--c-bone-dark);
}
.mod.off .m-name,
.mod.off .m-desc {
  opacity: 0.55;
}

.m-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.m-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  background: var(--c-steel-light);
}
.m-dot.loaded {
  background: var(--c-toxic-glow);
  box-shadow: 0 0 6px rgba(198, 224, 90, 0.8);
}
.m-dot.error {
  background: var(--c-neon-red);
  box-shadow: 0 0 6px rgba(255, 86, 68, 0.85);
}
.m-dot.idle {
  background: var(--c-sand);
}

.m-name {
  font-family: var(--font-title);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--c-white);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.m-ver {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--c-sand);
}
.m-author {
  flex: 0 0 auto;
  font-size: 9px;
  color: var(--c-bone-dark);
  white-space: nowrap;
}

.m-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--c-bone);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.m-desc.none {
  color: var(--c-bone-dark);
  font-style: italic;
}

.m-error {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 4px 6px;
  background: rgba(200, 85, 63, 0.14);
  border-left: 2px solid var(--c-neon-red);
}
.e-tag {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  color: #ffd3cb;
  background: rgba(200, 85, 63, 0.6);
  padding: 0 4px;
  line-height: 13px;
}
.e-text {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.5;
  color: #f0b7ac;
  word-break: break-word;
}

.m-foot {
  display: flex;
  gap: 5px;
  font-size: 9px;
  color: var(--c-bone-dark);
  opacity: 0.8;
}
.m-id {
  font-family: var(--font-mono);
}

/* —— 空态 —— */
.mm-empty {
  gap: 8px;
  padding: 20px 18px;
}
.empty-text {
  margin: 0;
  max-width: 560px;
  line-height: 1.7;
  font-size: 11px;
  color: var(--c-bone);
}
.empty-text b {
  color: var(--c-neon-warm);
  font-family: var(--font-mono);
  font-weight: 400;
}
.empty-list {
  margin: 0;
  padding: 0 0 0 2px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  font-size: 10px;
  color: var(--c-bone-dark);
}
.empty-list code {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-sand);
  background: rgba(58, 68, 75, 0.4);
  padding: 0 3px;
}
.empty-hint {
  margin: 2px 0 0;
  font-size: 10px;
  color: var(--c-bone-dark);
  opacity: 0.8;
}

/* —— 错误汇总 —— */
.errs {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 6px;
  border-top: 1px solid rgba(200, 85, 63, 0.4);
}
.errs-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
}
.errs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 110px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.err {
  display: flex;
  gap: 6px;
  padding: 3px 5px;
  background: rgba(7, 9, 11, 0.6);
  border-left: 2px solid rgba(200, 85, 63, 0.7);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.5;
}
.err-where {
  flex: 0 0 auto;
  color: var(--c-warn);
}
.err-text {
  min-width: 0;
  color: #e8b4a9;
  word-break: break-word;
}

@media (max-width: 760px) {
  .mm-note {
    display: none;
  }
}
</style>
