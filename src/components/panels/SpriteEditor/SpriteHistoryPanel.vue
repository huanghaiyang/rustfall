<script setup>
// ============================================================================
// 精灵编辑器 · 历史编辑记录
// ----------------------------------------------------------------------------
// 左：快照列表（时间倒序，默认只看当前选中的游戏实体）
// 右：选中快照的详情 = 结构摘要 + 与当前版本的差异 + 图集/帧矩形预览
// 底下：存快照 / 恢复此版本 / 删除 / 清空
//
// 历史只存「整份工程快照」，不存操作流水：一份快照 = 那一刻工程长什么样，
// 恢复 = 把那份工程装回去（sprite-store.applyProjectData）。
// ============================================================================
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { SE, historyEntries, historyProject, restoreHistory, deleteHistory, wipeHistory, recordHistory, saveProject } from '../../../game/editor/sprite-store.js'
import { diffProjects, historyBackend, historyLimits, historyDiskDir } from '../../../game/editor/sprite-history.js'

const emit = defineEmits(['close'])

const entries = ref([])
const loading = ref(false)
const backend = ref('')
const diskDir = ref('')
const limits = historyLimits()
const err = ref('')

const query = ref('')
/** 目标过滤：'' = 全部；否则按 refId 过滤。默认跟当前选中目标走。 */
const targetFilter = ref(SE.sel.target?.refId || '')
const selectedId = ref('')
const detail = ref(null) // { meta, project }
const busy = ref(false)

/** 当前选中的游戏实体（「只看当前目标」用） */
const curTarget = computed(() => SE.sel.target || { refId: '', kind: '' })
const curTargetLabel = computed(() => {
  const t = curTarget.value
  if (!t.refId) return ''
  const sp = SE.project.sprites.find((s) => s.refId === t.refId)
  return sp?.name || t.refId
})

/** 历史里出现过的绑定目标（下拉过滤用） */
const targetOptions = computed(() => {
  const map = new Map()
  for (const m of entries.value) {
    for (const t of m.targets || []) {
      if (!map.has(t.refId)) map.set(t.refId, t.name || t.refId)
    }
  }
  return [...map.entries()].map(([refId, name]) => ({ refId, name }))
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return entries.value.filter((m) => {
    if (targetFilter.value) {
      const hit = (m.targets || []).some((t) => t.refId === targetFilter.value)
      if (!hit) return false
    }
    if (!q) return true
    const hay = [
      m.reason,
      m.label,
      m.projectName,
      ...(m.targets || []).map((t) => `${t.refId} ${t.name}`),
      ...(m.spriteNames || []).map((s) => `${s.refId} ${s.name}`),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
})

const selectedMeta = computed(() => entries.value.find((m) => m.id === selectedId.value) || null)

/** 详情里可预览的角色 + 动作（优先当前目标） */
const previewSprites = computed(() => {
  const p = detail.value?.project
  if (!p) return []
  const refId = curTarget.value.refId
  const list = (p.sprites || []).filter((s) => (s.actions || []).some((a) => (a.frames || []).length))
  const sorted = [...list].sort((a, b) => (b.refId === refId ? 1 : 0) - (a.refId === refId ? 1 : 0))
  return sorted
})
const previewSpriteId = ref('')
const previewActionId = ref('')

const previewSprite = computed(() => previewSprites.value.find((s) => s.id === previewSpriteId.value) || previewSprites.value[0] || null)
const previewActions = computed(() => (previewSprite.value?.actions || []).filter((a) => (a.frames || []).length))
const previewAction = computed(() => previewActions.value.find((a) => a.id === previewActionId.value) || previewActions.value[0] || null)
const previewSheet = computed(() => {
  const p = detail.value?.project
  const sp = previewSprite.value
  if (!p || !sp) return null
  return (p.sheets || []).find((s) => s.id === sp.sheetId) || (p.sheets || [])[0] || null
})

/** 与当前工程的差异（快照 → 当前） */
const diff = computed(() => {
  if (!detail.value) return []
  return diffProjects(detail.value.project, SE.project)
})

const canvasEl = ref(null)

function fmtTime(iso) {
  try {
    const d = new Date(iso)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  } catch (e) {
    return iso || ''
  }
}
function fmtKB(bytes) {
  const kb = (Number(bytes) || 0) / 1024
  return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${Math.round(kb)} KB`
}
function reasonClass(reason) {
  if (reason.includes('发布')) return 'ok'
  if (reason.includes('恢复')) return 'warn'
  if (reason.includes('清空') || reason.includes('导入')) return 'danger'
  return 'plain'
}

async function load() {
  loading.value = true
  err.value = ''
  try {
    entries.value = await historyEntries()
    backend.value = await historyBackend()
    diskDir.value = await historyDiskDir()
  } catch (e) {
    err.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
  if (!selectedId.value && filtered.value.length) select(filtered.value[0].id)
}

async function select(id) {
  selectedId.value = id
  const project = await historyProject(id)
  const meta = entries.value.find((m) => m.id === id) || null
  detail.value = project ? { meta, project } : null
  previewSpriteId.value = ''
  previewActionId.value = ''
  requestAnimationFrame(() => {
    if (!previewSpriteId.value && previewSprites.value.length) previewSpriteId.value = previewSprites.value[0].id
    if (!previewActionId.value && previewActions.value.length) previewActionId.value = previewActions.value[0].id
    draw()
  })
}

// ---- 预览画布：图集缩略 + 当前动作的帧矩形 ----
async function draw() {
  const cv = canvasEl.value
  const sh = previewSheet.value
  const act = previewAction.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  const W = cv.width
  const H = cv.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0b0d0f'
  ctx.fillRect(0, 0, W, H)
  // 棋盘格底
  const cell = 12
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      if (((x / cell) | 0) % 2 === ((y / cell) | 0) % 2) continue
      ctx.fillStyle = '#14181c'
      ctx.fillRect(x, y, cell, cell)
    }
  }
  if (!sh?.src) {
    ctx.fillStyle = '#8a8272'
    ctx.font = '12px monospace'
    ctx.fillText('这份快照没有图集', 12, 24)
    return
  }
  const img = new Image()
  img.src = sh.src
  try {
    await img.decode()
  } catch (e) {
    ctx.fillStyle = '#b4553c'
    ctx.font = '12px monospace'
    ctx.fillText('图集解码失败', 12, 24)
    return
  }
  const nw = img.naturalWidth || sh.naturalW || sh.width || 1
  const nh = img.naturalHeight || sh.naturalH || sh.height || 1
  // 帧范围决定裁剪窗口（只显示当前动作覆盖的区域）
  let vx = 0
  let vy = 0
  let vw = nw
  let vh = nh
  if (act?.frames?.length) {
    vx = Math.max(0, Math.min(...act.frames.map((f) => f.x)))
    vy = Math.max(0, Math.min(...act.frames.map((f) => f.y)))
    vw = Math.max(1, Math.max(...act.frames.map((f) => f.x + f.w)) - vx)
    vh = Math.max(1, Math.max(...act.frames.map((f) => f.y + f.h)) - vy)
  }
  const scale = Math.min((W - 16) / vw, (H - 16) / vh)
  const ox = (W - vw * scale) / 2 - vx * scale
  const oy = (H - vh * scale) / 2 - vy * scale
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, ox, oy, nw * scale, nh * scale)
  // 帧矩形（同一 sprite 的所有动作都淡淡画一层，当前动作高亮）
  for (const a of previewSprite.value?.actions || []) {
    const on = a.id === act?.id
    if (!(a.frames || []).length) continue
    ;(a.frames || []).forEach((f, i) => {
      ctx.lineWidth = on ? 1.5 : 1
      ctx.strokeStyle = on ? '#d9a15a' : 'rgba(90,110,130,0.55)'
      ctx.strokeRect(ox + f.x * scale + 0.5, oy + f.y * scale + 0.5, f.w * scale - 1, f.h * scale - 1)
      if (on) {
        ctx.fillStyle = 'rgba(217,161,90,0.85)'
        ctx.font = '11px monospace'
        ctx.fillText(String(i + 1), ox + f.x * scale + 4, oy + f.y * scale + 14)
      }
    })
  }
  ctx.fillStyle = 'rgba(216,207,186,0.75)'
  ctx.font = '11px monospace'
  ctx.fillText(
    `${sh.name || 'sheet'} ${nw}×${nh}${act ? `  ·  ${act.name} ${act.frames.length}帧 ${act.fps}fps` : ''}`,
    8,
    H - 8,
  )
}

watch([previewSpriteId, previewActionId, detail], () => {
  if (!previewSpriteId.value && previewSprites.value.length) previewSpriteId.value = previewSprites.value[0].id
  if (!previewActionId.value && previewActions.value.length) previewActionId.value = previewActions.value[0].id
  requestAnimationFrame(draw)
})
watch(previewSpriteId, () => {
  const acts = previewActions.value
  if (!acts.some((a) => a.id === previewActionId.value)) previewActionId.value = acts[0]?.id || ''
})

// ---- 操作 ----
async function onRestore() {
  if (!selectedId.value) return
  if (!confirm(`恢复到 ${fmtTime(selectedMeta.value?.at)} 的版本？\n（当前工程会先存成一份「恢复前」快照，可反悔）`)) return
  busy.value = true
  try {
    await restoreHistory(selectedId.value)
    saveProject()
    await load()
    emit('close')
  } finally {
    busy.value = false
  }
}

async function onSnapshotNow() {
  busy.value = true
  try {
    await recordHistory('手动快照', { force: true })
    await load()
  } finally {
    busy.value = false
  }
}

async function onDelete() {
  if (!selectedId.value) return
  if (!confirm('删除这条历史记录？')) return
  await deleteHistory(selectedId.value)
  selectedId.value = ''
  detail.value = null
  await load()
}

async function onWipe() {
  if (!confirm(`清空全部 ${entries.value.length} 条历史？`)) return
  await wipeHistory()
  selectedId.value = ''
  detail.value = null
  await load()
}

onMounted(load)
onBeforeUnmount(() => {
  selectedId.value = ''
})
</script>

<template>
  <div class="sh-root" @click.self="emit('close')">
    <div class="sh-modal">
      <header class="sh-bar">
        <div class="sh-title">
          <b>历史编辑记录</b><em>HISTORY</em>
          <span class="sh-backend" :class="{ disk: backend === 'disk' }" :title="diskDir || ''">
            {{ backend === 'disk' ? '已落盘 · ' + (diskDir || 'editor-data/sprite-editor') : backend === 'indexeddb' ? 'IndexedDB（无落盘接口）' : backend === 'localstorage' ? 'localStorage（兜底，最多 3 条）' : '…' }}
          </span>
        </div>
        <span class="sh-stat">{{ entries.length }} 条 · 上限 {{ limits.entries }} 条 / {{ Math.round(limits.bytes / 1048576) }} MB</span>
        <span class="se-grow" />
        <button class="sh-btn" :disabled="busy" @click="onSnapshotNow">存当前快照</button>
        <button class="sh-btn danger" :disabled="busy || !entries.length" @click="onWipe">清空历史</button>
        <button class="sh-btn" @click="emit('close')">关闭 ESC</button>
      </header>

      <div class="sh-body">
        <!-- 左：列表 -->
        <aside class="sh-left">
          <input v-model="query" class="sh-filter" placeholder="搜索 时间 / 角色 / refId / 原因…" />
          <div class="sh-target-filter">
            <label>目标</label>
            <select v-model="targetFilter" class="sh-sel">
              <option value="">全部目标</option>
              <option v-for="t in targetOptions" :key="t.refId" :value="t.refId">
                {{ t.name }}（{{ t.refId }}）
              </option>
            </select>
            <button
              v-if="curTarget.refId && targetFilter !== curTarget.refId"
              class="sh-mini"
              :title="'只看当前选中的实体：' + curTargetLabel"
              @click="targetFilter = curTarget.refId"
            >
              当前目标
            </button>
          </div>
          <ul class="sh-list">
            <li
              v-for="m in filtered"
              :key="m.id"
              class="sh-item"
              :class="{ on: m.id === selectedId }"
              @click="select(m.id)"
            >
              <div class="sh-item-h">
                <span class="sh-badge" :class="reasonClass(m.reason)">{{ m.reason }}</span>
                <span class="sh-at">{{ fmtTime(m.at) }}</span>
              </div>
              <div class="sh-item-t">
                {{ (m.targets || []).map((t) => t.name || t.refId).join(' / ') || m.projectName || '（无绑定目标）' }}
              </div>
              <div class="sh-item-m">
                图 {{ m.counts.sheets }} · 角 {{ m.counts.sprites }} · 动 {{ m.counts.actions }} · 帧 {{ m.counts.frames }} · {{ fmtKB(m.bytes) }}
              </div>
            </li>
            <li v-if="!filtered.length" class="sh-empty">
              {{ loading ? '读取中…' : targetFilter ? '这个目标还没有历史记录' : '还没有历史记录（发布 / 清空 / 导入 会自动记一条）' }}
            </li>
          </ul>
          <div v-if="err" class="sh-err">{{ err }}</div>
        </aside>

        <!-- 右：详情 -->
        <section class="sh-right">
          <template v-if="detail">
            <div class="sh-detail-h">
              <div>
                <span class="sh-badge" :class="reasonClass(detail.meta?.reason)">{{ detail.meta?.reason }}</span>
                <b class="sh-detail-at">{{ fmtTime(detail.meta?.at) }}</b>
                <span class="sh-detail-st">{{ detail.project.status === 'draft' ? '草稿' : '已发布' }}</span>
              </div>
              <div class="sh-detail-counts">
                图集 {{ detail.meta?.counts.sheets }} · 角色 {{ detail.meta?.counts.sprites }} · 动作 {{ detail.meta?.counts.actions }} ·
                帧 {{ detail.meta?.counts.frames }} · 骨骼 {{ detail.meta?.counts.bones }} · 碰撞 {{ detail.meta?.counts.shapes }}
                · {{ fmtKB(detail.meta?.bytes) }}
              </div>
            </div>

            <!-- 绑定目标 -->
            <div v-if="(detail.meta?.targets || []).length" class="sh-targets">
              <span v-for="t in detail.meta.targets" :key="t.refId" class="sh-target">
                {{ t.name }}<em>{{ t.refId }}</em><code>{{ t.actions }}</code>
              </span>
            </div>

            <!-- 与当前版本的差异 -->
            <div class="sh-sec">
              <header>与当前版本的差异 <em>snapshot → current</em></header>
              <ul class="sh-diff">
                <li v-for="(d, i) in diff" :key="i" :class="d.kind">
                  <span class="sh-diff-k">{{ d.kind === 'add' ? '+' : d.kind === 'remove' ? '−' : d.kind === 'change' ? '~' : '=' }}</span>
                  {{ d.text }}
                </li>
              </ul>
            </div>

            <!-- 帧预览 -->
            <div class="sh-sec sh-sec-grow">
              <header>
                动作帧 <em>frames</em>
                <select v-if="previewSprites.length > 1" v-model="previewSpriteId" class="sh-sel">
                  <option v-for="s in previewSprites" :key="s.id" :value="s.id">
                    {{ s.refId || s.kind }} · {{ s.name }}
                  </option>
                </select>
              </header>
              <div class="sh-tabs">
                <button
                  v-for="a in previewActions"
                  :key="a.id"
                  class="sh-tab"
                  :class="{ on: a.id === previewActionId }"
                  @click="previewActionId = a.id"
                >
                  {{ a.name }} <span>{{ a.frames.length }}帧 {{ a.fps }}fps{{ a.loop ? ' ↻' : '' }}</span>
                </button>
                <span v-if="!previewActions.length" class="sh-empty-inline">这份快照没有带帧的动作</span>
              </div>
              <canvas ref="canvasEl" class="sh-canvas" width="720" height="300" />
            </div>

            <footer class="sh-actions">
              <button class="sh-btn primary" :disabled="busy" @click="onRestore">恢复此版本</button>
              <button class="sh-btn danger" :disabled="busy" @click="onDelete">删除这条</button>
              <span class="se-grow" />
              <span class="sh-hint">恢复会把当前工程先存成「恢复前」快照；若该版本是已发布状态，会直接发布到游戏运行时</span>
            </footer>
          </template>
          <div v-else class="sh-empty sh-empty-big">← 选一条历史记录查看它当时的编辑内容</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sh-root {
  position: absolute;
  inset: 0;
  background: rgba(4, 6, 8, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  pointer-events: auto;
}
.sh-modal {
  width: min(1180px, 96vw);
  height: min(700px, 92vh);
  display: flex;
  flex-direction: column;
  background: #0c0f12;
  border: 1px solid var(--c-steel, #3a444b);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
  color: var(--c-bone, #d8cfba);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}
.sh-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #101417;
  border-bottom: 1px solid var(--c-steel, #3a444b);
  flex: 0 0 auto;
}
.sh-title b {
  font-family: var(--font-title, serif);
  font-size: 15px;
  letter-spacing: 2px;
  color: var(--c-white, #e8e3d6);
}
.sh-title em {
  font-style: normal;
  font-size: 9px;
  color: var(--c-ochre, #a8763a);
  margin-left: 8px;
  letter-spacing: 1px;
}
.sh-backend {
  margin-left: 10px;
  font-size: 10px;
  color: #6c7681;
}
.sh-backend.disk {
  color: #9fd8ad;
}
.sh-stat {
  color: #8a8272;
  font-size: 11px;
}
.se-grow {
  flex: 1 1 auto;
}
.sh-btn {
  background: #1a1f24;
  border: 1px solid var(--c-steel, #3a444b);
  color: var(--c-bone, #d8cfba);
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  border-radius: 2px;
}
.sh-btn:hover:not(:disabled) {
  border-color: var(--c-rust-light, #c07038);
  color: var(--c-white, #e8e3d6);
}
.sh-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.sh-btn.primary {
  background: #1d2b24;
  border-color: #3f7a52;
  color: #b9e3c4;
}
.sh-btn.danger {
  border-color: #6a3630;
  color: #e0a89a;
}

.sh-body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}
.sh-left {
  width: 340px;
  flex: 0 0 auto;
  border-right: 1px solid #232b31;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sh-filter {
  margin: 8px;
  padding: 5px 8px;
  background: #0a0d0f;
  border: 1px solid #2a3238;
  color: var(--c-bone, #d8cfba);
  font-family: inherit;
  font-size: 11px;
}
.sh-only {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 6px;
  font-size: 10px;
  color: #9aa3ab;
  cursor: pointer;
}
.sh-only b {
  color: var(--c-ochre, #a8763a);
}
.sh-target-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 6px;
  font-size: 10px;
  color: #9aa3ab;
}
.sh-target-filter .sh-sel {
  flex: 1 1 auto;
  margin-left: 0;
  max-width: 200px;
}
.sh-mini {
  background: #1a1f24;
  border: 1px solid #2a3238;
  color: #9aa3ab;
  font-family: inherit;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
}
.sh-mini:hover {
  border-color: var(--c-rust-light, #c07038);
  color: #e8e3d6;
}
.sh-list {
  list-style: none;
  margin: 0;
  padding: 0 6px 8px;
  overflow: auto;
  flex: 1 1 auto;
}
.sh-item {
  padding: 7px 8px;
  border: 1px solid transparent;
  border-bottom-color: #1b2227;
  cursor: pointer;
}
.sh-item:hover {
  background: #12171b;
}
.sh-item.on {
  background: #16202a;
  border-color: #35506a;
}
.sh-item-h {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sh-at {
  color: #7d8791;
  font-size: 10px;
}
.sh-item-t {
  margin-top: 3px;
  color: var(--c-bone, #d8cfba);
}
.sh-item-m {
  margin-top: 2px;
  color: #6c7681;
  font-size: 10px;
}
.sh-badge {
  font-size: 10px;
  padding: 1px 5px;
  border: 1px solid #3a444b;
  border-radius: 2px;
  color: #a9b3bc;
}
.sh-badge.ok {
  border-color: #3f7a52;
  color: #9fd8ad;
}
.sh-badge.warn {
  border-color: #7a663f;
  color: #e0c69a;
}
.sh-badge.danger {
  border-color: #6a3630;
  color: #e0a89a;
}
.sh-empty {
  padding: 14px 10px;
  color: #6c7681;
  font-size: 11px;
}
.sh-empty-big {
  margin: auto;
  font-size: 12px;
}
.sh-err {
  color: #e0a89a;
  padding: 6px 10px;
  font-size: 11px;
}

.sh-right {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 8px;
  overflow: auto;
}
.sh-detail-h > div:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sh-detail-at {
  color: var(--c-white, #e8e3d6);
  font-size: 13px;
}
.sh-detail-st {
  font-size: 10px;
  color: #6c7681;
}
.sh-detail-counts {
  margin-top: 3px;
  font-size: 10px;
  color: #7d8791;
}
.sh-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sh-target {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 7px;
  background: #10161a;
  border: 1px solid #232b31;
  font-size: 11px;
}
.sh-target em {
  font-style: normal;
  color: #6c7681;
  font-size: 10px;
}
.sh-target code {
  color: #9fd8ad;
  font-size: 10px;
}
.sh-sec {
  border: 1px solid #1e262c;
  background: #0a0d10;
  padding: 7px 9px;
}
.sh-sec-grow {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sh-sec > header {
  font-size: 11px;
  color: #9aa3ab;
  margin-bottom: 5px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sh-sec > header em {
  font-style: normal;
  font-size: 9px;
  color: #5c666f;
}
.sh-diff {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 11px;
  line-height: 1.7;
}
.sh-diff .sh-diff-k {
  display: inline-block;
  width: 12px;
  font-weight: bold;
}
.sh-diff .add {
  color: #9fd8ad;
}
.sh-diff .remove {
  color: #e0a89a;
}
.sh-diff .change {
  color: #e0c69a;
}
.sh-diff .same {
  color: #6c7681;
}
.sh-sel {
  margin-left: auto;
  background: #0a0d0f;
  color: var(--c-bone, #d8cfba);
  border: 1px solid #2a3238;
  font-family: inherit;
  font-size: 10px;
  padding: 2px 4px;
}
.sh-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.sh-tab {
  background: #12171b;
  border: 1px solid #2a3238;
  color: #a9b3bc;
  font-family: inherit;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}
.sh-tab span {
  color: #6c7681;
  font-size: 10px;
  margin-left: 5px;
}
.sh-tab.on {
  border-color: var(--c-rust-light, #c07038);
  color: var(--c-white, #e8e3d6);
  background: #1a1206;
}
.sh-empty-inline {
  color: #6c7681;
  font-size: 11px;
}
.sh-canvas {
  width: 100%;
  flex: 1 1 auto;
  min-height: 120px;
  background: #0b0d0f;
  border: 1px solid #1e262c;
  image-rendering: pixelated;
  object-fit: contain;
}
.sh-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 2px;
}
.sh-hint {
  font-size: 10px;
  color: #6c7681;
}
</style>
