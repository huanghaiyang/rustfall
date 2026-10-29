<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  RE,
  ALL_ROOMS,
  ROOM_GROUPS,
  roomKey,
  selectRoom,
  regenerate,
  saveProject,
  loadProject,
  resetProject,
  exportProjectJson,
  importProjectJson,
  downloadText,
  clearAllEdits,
  tileEditCount,
  propCount,
  bgLayerCount,
} from '../../../game/editor/room-store.js'
import RoomCanvas from './RoomCanvas.vue'
import RoomInspector from './RoomInspector.vue'

const emit = defineEmits(['close'])

const projInput = ref(null)
const query = ref('')

const TOOLS = [
  { id: 'inspect', label: '查看', en: 'INSPECT', key: '1' },
  { id: 'tile', label: '绘制', en: 'TILE', key: '2' },
  { id: 'prop', label: '放道具', en: 'PROP', key: '3' },
  { id: 'bg', label: '背景层', en: 'BG', key: '4' },
]

/** 按搜索词过滤后的房间分组 */
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return ROOM_GROUPS
  return ROOM_GROUPS.map((g) => ({
    ...g,
    rooms: g.rooms.filter(
      (r) =>
        r.spec.label?.toLowerCase().includes(q) ||
        r.roomId.toLowerCase().includes(q) ||
        r.regionId.toLowerCase().includes(q) ||
        r.spec.biome?.toLowerCase().includes(q)
    ),
  })).filter((g) => g.rooms.length)
})

/** 已编辑的房间数 */
const editedRooms = computed(() => {
  let n = 0
  for (const k of Object.keys(RE.project.edits || {})) {
    const e = RE.project.edits[k]
    const has =
      Object.keys(e.params || {}).length ||
      Object.keys(e.tiles || {}).length ||
      (e.props?.add?.length || 0) +
        (e.props?.remove?.length || 0) ||
      (e.bg?.layers?.length || 0)
    if (has) n++
  }
  return n
})

/** 某房间是否有编辑（列表上的角标） */
function editedOf(regionId, roomId) {
  const e = RE.project.edits[roomKey(regionId, roomId)]
  if (!e) return false
  return (
    Object.keys(e.params || {}).length > 0 ||
    Object.keys(e.tiles || {}).length > 0 ||
    (e.props?.add?.length || 0) +
      (e.props?.remove?.length || 0) >
      0 ||
    (e.bg?.layers?.length || 0) > 0
  )
}

function pick(regionId, roomId) {
  selectRoom(regionId, roomId)
}

function onViewportChange(ev) {
  if (ev.type === 'commit') saveProject()
}

function onExport() {
  downloadText(`${RE.project.name || 'room-project'}.json`, exportProjectJson())
}

async function onPickProject(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    await importProjectJson(f)
    if (RE.sel.roomId) regenerate()
  } catch (err) {
    console.warn('[room-editor] 工程导入失败', err)
  }
}

function onClearAll() {
  if (!confirm('清空全部房间编辑？游戏内的地形差分也会一并清除。')) return
  clearAllEdits()
  saveProject()
}

function onKey(e) {
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
  if (e.key === 'Escape') {
    emit('close')
    e.stopPropagation()
    return
  }
  if (e.key >= '1' && e.key <= '4') {
    const t = TOOLS[Number(e.key) - 1]
    if (t) {
      RE.sel.tool = t.id
      e.preventDefault()
      e.stopPropagation()
    }
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    saveProject()
    e.preventDefault()
    e.stopPropagation()
  }
}

onMounted(() => {
  loadProject()
  const first = ALL_ROOMS[0]
  if (first) selectRoom(first.regionId, first.roomId)
  window.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <div class="rm-root">
    <!-- 工具条 -->
    <header class="rm-bar">
      <div class="rm-brand">
        <b>房间编辑器</b>
        <em>ROOM EDITOR</em>
      </div>

      <div class="rm-group">
        <button class="rm-btn" @click="projInput?.click()">导入工程</button>
        <button class="rm-btn" @click="onExport">导出工程</button>
        <button class="rm-btn primary" @click="saveProject()">保存</button>
        <button class="rm-btn danger" @click="onClearAll">清空全部</button>
      </div>

      <div class="rm-group rm-tools">
        <button
          v-for="t in TOOLS"
          :key="t.id"
          class="rm-tool"
          :class="{ on: RE.sel.tool === t.id }"
          :title="`${t.label} (${t.key})`"
          @click="RE.sel.tool = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="rm-group rm-toggles">
        <label><input type="checkbox" v-model="RE.view.grid" />网格</label>
        <label><input type="checkbox" v-model="RE.view.bg" />背景</label>
        <label><input type="checkbox" v-model="RE.view.props" />道具</label>
        <label><input type="checkbox" v-model="RE.view.entities" />实体</label>
        <label><input type="checkbox" v-model="RE.view.labels" />标注</label>
      </div>

      <div class="rm-group rm-right">
        <span class="rm-stat">
          房 {{ ALL_ROOMS.length }} · 已改 {{ editedRooms }} · 差分 {{ tileEditCount }} 格 ·
          道具 {{ propCount }} · 层 {{ bgLayerCount }} · {{ RE.genMs }}ms
        </span>
        <button class="rm-btn" @click="emit('close')">关闭 ESC</button>
      </div>

      <input ref="projInput" type="file" accept=".json,application/json" hidden @change="onPickProject" />
    </header>

    <!-- 主体 -->
    <div class="rm-main">
      <!-- 左：房间列表 -->
      <aside class="rm-left">
        <div class="rm-search">
          <input v-model="query" placeholder="搜索房名 / 房 ID / 生态" />
        </div>
        <section v-for="g in groups" :key="g.id" class="rm-sec">
          <header class="rm-sec-h">
            <b>{{ g.name }}</b><em>{{ g.rooms.length }}</em>
          </header>
          <ul class="rm-list">
            <li
              v-for="r in g.rooms"
              :key="r.roomId"
              class="rm-item"
              :class="{ on: RE.sel.roomId === r.roomId && RE.sel.regionId === r.regionId }"
              @click="pick(r.regionId, r.roomId)"
            >
              <span class="rm-dot" :class="{ edited: editedOf(r.regionId, r.roomId) }" />
              <span class="rm-item-name">{{ r.spec.label || r.roomId }}</span>
              <span class="rm-item-meta">{{ r.spec.w }}×{{ r.spec.h }}</span>
            </li>
          </ul>
        </section>
        <div v-if="!groups.length" class="rm-empty">没有匹配的房间</div>
      </aside>

      <!-- 中：画布 -->
      <main class="rm-center">
        <RoomCanvas @change="onViewportChange" />
      </main>

      <!-- 右：检视器 -->
      <aside class="rm-right-pane">
        <RoomInspector />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.rm-root {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0a0c0e 0%, #07090b 100%);
  color: var(--c-bone, #d8cfba);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  pointer-events: auto;
  overflow: hidden;
}

/* ---------------- 工具条 ---------------- */
.rm-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 6px 12px;
  background: #101417;
  border-bottom: 1px solid var(--c-steel, #3a444b);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
  flex: 0 0 auto;
}
.rm-brand b {
  font-family: var(--font-title, serif);
  font-size: 15px;
  letter-spacing: 2px;
  color: var(--c-white, #e8e3d6);
}
.rm-brand em {
  font-style: normal;
  font-size: 9px;
  color: var(--c-ochre, #a8763a);
  margin-left: 8px;
  letter-spacing: 1px;
}
.rm-group {
  display: flex;
  align-items: center;
  gap: 5px;
}
.rm-right {
  margin-left: auto;
}
.rm-stat {
  color: var(--c-bone-dark, #8a8272);
  margin-right: 6px;
  font-size: 11px;
}
.rm-btn {
  background: #1a1f24;
  border: 1px solid var(--c-steel, #3a444b);
  color: var(--c-bone, #d8cfba);
  padding: 4px 9px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 2px;
}
.rm-btn:hover {
  border-color: var(--c-rust-light, #c07038);
  color: var(--c-white, #e8e3d6);
}
.rm-btn.primary {
  border-color: var(--c-neon, #6ff0d0);
  color: var(--c-neon, #6ff0d0);
}
.rm-btn.danger:hover {
  border-color: var(--c-danger, #c8553f);
  color: var(--c-danger, #c8553f);
}
.rm-tools {
  border-left: 1px solid var(--c-steel, #3a444b);
  padding-left: 10px;
}
.rm-tool {
  background: #141a1e;
  border: 1px solid #2b3238;
  color: var(--c-bone-dark, #8a8272);
  padding: 3px 8px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 2px;
}
.rm-tool.on {
  background: rgba(242, 179, 74, 0.16);
  border-color: var(--c-neon-warm, #f2b34a);
  color: var(--c-neon-warm, #f2b34a);
}
.rm-toggles {
  border-left: 1px solid var(--c-steel, #3a444b);
  padding-left: 10px;
  gap: 9px;
}
.rm-toggles label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--c-bone-dark, #8a8272);
  cursor: pointer;
}

/* ---------------- 主体 ---------------- */
.rm-main {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}
.rm-left {
  width: 224px;
  flex: 0 0 224px;
  background: #0e1215;
  border-right: 1px solid var(--c-steel, #3a444b);
  overflow-y: auto;
}
.rm-center {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
}
.rm-right-pane {
  width: 290px;
  flex: 0 0 290px;
  background: #0e1215;
  border-left: 1px solid var(--c-steel, #3a444b);
  overflow-y: auto;
}

/* ---------------- 房间列表 ---------------- */
.rm-search {
  padding: 6px 8px;
  border-bottom: 1px solid #1d2429;
}
.rm-search input {
  width: 100%;
  background: #12171b;
  border: 1px solid #262e34;
  color: var(--c-bone, #d8cfba);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 5px;
  border-radius: 2px;
}
.rm-search input:focus {
  outline: none;
  border-color: var(--c-neon, #6ff0d0);
}
.rm-sec {
  border-bottom: 1px solid #1d2429;
}
.rm-sec-h {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #12181c;
  border-bottom: 1px solid #1d2429;
  position: sticky;
  top: 0;
  z-index: 1;
}
.rm-sec-h b {
  font-size: 12px;
  color: var(--c-sand, #c9b085);
}
.rm-sec-h em {
  font-style: normal;
  font-size: 9px;
  color: var(--c-steel-light, #6f828c);
}
.rm-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rm-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.rm-item:hover {
  background: #141a1f;
}
.rm-item.on {
  background: rgba(111, 240, 208, 0.08);
  border-left-color: var(--c-neon, #6ff0d0);
}
.rm-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: #2b3238;
}
.rm-dot.edited {
  background: var(--c-neon-warm, #f2b34a);
}
.rm-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-item-meta {
  font-size: 10px;
  color: var(--c-bone-dark, #8a8272);
}
.rm-empty {
  padding: 10px 8px;
  color: var(--c-steel-light, #6f828c);
  font-size: 11px;
}
</style>
