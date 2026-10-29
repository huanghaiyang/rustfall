<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  SE,
  ROLE_LIST,
  MONSTER_LIST,
  SPRITE_FAMILIES,
  loadRegistry,
  filteredSprites,
  setSpriteRef,
  applyFamilyBones,
  applyFamilyShapes,
  bonesForFamily,
  shapesForFamily,
  currentSheet,
  currentSprite,
  currentAction,
  currentEffect,
  importSheetFile,
  addSheet,
  removeSheet,
  addSprite,
  removeSprite,
  addAction,
  removeAction,
  moveAction,
  addFrame,
  addBone,
  addShape,
  setSlot,
  addEffect,
  removeEffect,
  addPreset,
  removePreset,
  applyPresetToSprite,
  autoLayout,
  saveProject,
  loadProject,
  resetProject,
  exportProjectJson,
  importProjectJson,
  downloadText,
} from '../../../game/editor/sprite-store.js'
import SpriteSheetCanvas from './SpriteSheetCanvas.vue'
import SpriteInspector from './SpriteInspector.vue'
import SpriteTimeline from './SpriteTimeline.vue'

const emit = defineEmits(['close'])

const imgInput = ref(null)
const projInput = ref(null)

// 尺寸预设表单
const preName = ref('')
const preW = ref(32)
const preH = ref(32)

// 分类筛选：null=全部 | 'role' | 'monster' | 'generic'
const kindFilter = ref('all')

const TOOLS = [
  { id: 'select', label: '选择', en: 'SELECT', key: '1' },
  { id: 'frame', label: '框选帧', en: 'FRAME', key: '2' },
  { id: 'bone', label: '骨骼', en: 'BONE', key: '3' },
  { id: 'rect', label: '矩形碰撞', en: 'RECT', key: '4' },
  { id: 'circle', label: '圆形碰撞', en: 'CIRCLE', key: '5' },
  { id: 'poly', label: '多边形', en: 'POLY', key: '6' },
  { id: 'grip', label: '武器抓握', en: 'GRIP', key: '7' },
  { id: 'cast', label: '技能施放', en: 'CAST', key: '8' },
]

const sheet = computed(() => currentSheet())
const sprite = computed(() => currentSprite())
const action = computed(() => currentAction())
const effect = computed(() => currentEffect())

const sheetCount = computed(() => SE.project.sheets.length)
const spriteCount = computed(() => SE.project.sprites.length)
const effectCount = computed(() => SE.project.effects.length)
const sprites = computed(() => filteredSprites(kindFilter.value))

async function onPickImage(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    await importSheetFile(f)
    saveProject()
  } catch (err) {
    console.warn('[sprite-editor] 导入失败', err)
  }
}

async function onPickProject(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    await importProjectJson(f)
  } catch (err) {
    console.warn('[sprite-editor] 工程导入失败', err)
  }
}

function onExport() {
  downloadText(`${SE.project.name || 'sprite-project'}.json`, exportProjectJson())
}

function newEffect() {
  const sh = currentSheet()
  if (!sh) return
  addEffect(sh.id, { x: 0, y: 0, w: sh.gridW || 32, h: sh.gridH || 32 })
}
function makePreset() {
  const n = (preName.value || '').trim() || `${preW.value}×${preH.value}`
  addPreset(n, preW.value, preH.value)
  preName.value = ''
}

// 专项编辑：按 kind 创建新 sprite，可绑定 refId + 套用模板
function newSpriteOfKind(kind) {
  const sh = currentSheet()
  if (!sh) return
  addSprite(sh.id, { x: 0, y: 0, w: sh.gridW || 32, h: sh.gridH || 32 }, { kind })
}
function newSpriteFromRef() {
  const sh = currentSheet()
  if (!sh) return
  const kind = kindFilter.value === 'monster' ? 'monster' : 'role'
  const list = kind === 'role' ? ROLE_LIST : MONSTER_LIST
  const pick = list[Math.floor(Math.random() * Math.max(1, list.length))]
  const refId = pick?.id || ''
  addSprite(sh.id, { x: 0, y: 0 }, {
    kind,
    refId,
    autoBones: true,
    autoShapes: true,
  })
}

function onViewportChange(ev) {
  switch (ev.type) {
    case 'addBone':
      addBone(ev.x, ev.y, ev.parent)
      break
    case 'setSlot':
      setSlot(ev.kind, ev.x, ev.y)
      break
    case 'addShape':
      addShape(ev.shape)
      break
    case 'addFrame': {
      const act = currentAction()
      if (act) addFrame(act.id, ev.rect)
      break
    }
    case 'select': {
      const w = ev.what
      if (!w) {
        SE.sel.boneId = ''
        SE.sel.shapeId = ''
        SE.sel.frameId = ''
        SE.sel.effectId = ''
      } else if (w.type === 'bone') {
        SE.sel.boneId = w.id
        SE.sel.shapeId = ''
      } else if (w.type === 'shape') {
        SE.sel.shapeId = w.id
        SE.sel.boneId = ''
      } else if (w.type === 'frame') {
        SE.sel.frameId = w.id
      } else if (w.type === 'sprite') {
        SE.sel.spriteId = w.id
        const sp = SE.project.sprites.find((s) => s.id === w.id)
        SE.sel.actionId = sp?.actions[0]?.id || ''
      } else if (w.type === 'effect') {
        SE.sel.effectId = w.id
      }
      break
    }
    case 'editEnd':
      saveProject()
      break
    default:
      break
  }
}

function onKey(e) {
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
  if (e.key === 'Escape' && SE.sel.tool === 'poly') {
    SE.sel.tool = 'select'
    e.stopPropagation()
    return
  }
  if (e.key >= '1' && e.key <= '8') {
    const t = TOOLS[Number(e.key) - 1]
    if (t) {
      SE.sel.tool = t.id
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
  loadRegistry()  // 后台拉 chassis / monster 注册表
  window.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <div class="se-root" @keydown.esc.stop>
    <!-- 工具条 -->
    <header class="se-bar">
      <div class="se-brand">
        <b>精灵编辑器</b>
        <em>SPRITE / BONE EDITOR</em>
      </div>

      <div class="se-group">
        <button class="se-btn primary" @click="imgInput?.click()">导入精灵图</button>
        <button class="se-btn" @click="projInput?.click()">导入工程</button>
        <button class="se-btn" @click="onExport">导出工程</button>
        <button class="se-btn" @click="saveProject()">保存</button>
        <button
          class="se-btn danger"
          @click="() => { if (confirm('清空当前工程？')) { resetProject(); saveProject() } }"
        >
          清空
        </button>
      </div>

      <div class="se-group se-tools">
        <button
          v-for="t in TOOLS"
          :key="t.id"
          class="se-tool"
          :class="{ on: SE.sel.tool === t.id }"
          :title="`${t.label} (${t.key})`"
          @click="SE.sel.tool = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="se-group se-toggles">
        <label><input type="checkbox" v-model="SE.view.grid" />网格</label>
        <label><input type="checkbox" v-model="SE.view.bones" />骨骼</label>
        <label><input type="checkbox" v-model="SE.view.shapes" />碰撞</label>
        <label><input type="checkbox" v-model="SE.view.slots" />Slot</label>
        <label><input type="checkbox" v-model="SE.view.pixels" />像素</label>
      </div>

      <div class="se-group se-right">
        <span class="se-stat">图 {{ sheetCount }} · 角色 {{ spriteCount }} · 特效 {{ effectCount }}</span>
        <button class="se-btn" @click="emit('close')">关闭 ESC</button>
      </div>

      <input ref="imgInput" type="file" accept="image/*" hidden @change="onPickImage" />
      <input ref="projInput" type="file" accept=".json,application/json" hidden @change="onPickProject" />
    </header>

    <!-- 主体 -->
    <div class="se-main">
      <!-- 左：sprite 列表 -->
      <aside class="se-left">
        <section class="se-sec">
          <header class="se-sec-h">
            <b>精灵图</b><em>SHEETS</em>
            <span class="se-grow" />
            <button class="se-mini" @click="imgInput?.click()">＋</button>
          </header>
          <ul class="se-list">
            <li
              v-for="s in SE.project.sheets"
              :key="s.id"
              class="se-item"
              :class="{ on: SE.sel.sheetId === s.id }"
              @click="SE.sel.sheetId = s.id"
            >
              <span class="se-item-name">{{ s.name }}</span>
              <span class="se-item-meta">{{ s.width }}×{{ s.height }}</span>
              <button class="se-x" @click.stop="removeSheet(s.id)">✕</button>
            </li>
            <li v-if="!SE.project.sheets.length" class="se-empty">未导入精灵图</li>
          </ul>
        </section>

        <section class="se-sec">
          <header class="se-sec-h">
            <b>Sprite 列表</b><em>SPRITES</em>
            <span class="se-grow" />
            <button class="se-mini" :disabled="!sheet" @click="newSpriteFromRef" title="按当前分类随机绑定游戏内机体/怪物">＋专项</button>
            <button
              v-if="kindFilter !== 'monster'"
              class="se-mini"
              :disabled="!sheet"
              @click="newSpriteOfKind('role')"
              title="新建空角色"
            >＋R</button>
            <button
              v-if="kindFilter !== 'role'"
              class="se-mini"
              :disabled="!sheet"
              @click="newSpriteOfKind('monster')"
              title="新建空怪物"
            >＋M</button>
          </header>
          <!-- 分类筛选 Tabs -->
          <div class="se-kind-tabs">
            <button
              :class="{ on: kindFilter === 'all' }"
              @click="kindFilter = 'all'"
            >全部</button>
            <button
              :class="{ on: kindFilter === 'role' }"
              @click="kindFilter = 'role'"
            >角色 <span class="se-kind-count">{{ filteredSprites('role').length }}</span></button>
            <button
              :class="{ on: kindFilter === 'monster' }"
              @click="kindFilter = 'monster'"
            >怪物 <span class="se-kind-count">{{ filteredSprites('monster').length }}</span></button>
          </div>
          <ul class="se-list">
            <li
              v-for="s in sprites"
              :key="s.id"
              class="se-item"
              :class="{ on: SE.sel.spriteId === s.id }"
              @click="SE.sel.spriteId = s.id; SE.sel.actionId = s.actions[0]?.id || ''; SE.sel.frameId = ''"
            >
              <span class="se-kind-badge" :class="s.kind">{{ s.kind === 'monster' ? '怪' : s.kind === 'role' ? 'R' : 'G' }}</span>
              <span class="se-item-name">{{ s.name }}</span>
              <span class="se-item-meta">{{ s.w }}×{{ s.h }} · {{ s.actions.length }}动</span>
              <button class="se-x" @click.stop="removeSprite(s.id)">✕</button>
            </li>
            <li v-if="!sprites.length" class="se-empty">
              未创建{{ kindFilter === 'monster' ? '怪物' : kindFilter === 'role' ? '角色' : 'sprite' }}
            </li>
          </ul>
        </section>

        <section class="se-sec">
          <header class="se-sec-h">
            <b>特效</b><em>EFFECTS</em>
            <span class="se-grow" />
            <button class="se-mini" :disabled="!sheet" @click="newEffect">＋</button>
          </header>
          <ul class="se-list">
            <li
              v-for="ef in SE.project.effects"
              :key="ef.id"
              class="se-item"
              :class="{ on: SE.sel.effectId === ef.id }"
              @click="SE.sel.effectId = ef.id"
            >
              <span class="se-item-name">{{ ef.name }}</span>
              <span class="se-item-meta">{{ ef.frames.length }}帧</span>
              <button class="se-x" @click.stop="removeEffect(ef.id)">✕</button>
            </li>
            <li v-if="!SE.project.effects.length" class="se-empty">未创建特效</li>
          </ul>
        </section>

        <section class="se-sec">
          <header class="se-sec-h">
            <b>尺寸预设</b><em>PRESETS</em>
          </header>
          <ul class="se-list">
            <li
              v-for="p in SE.project.presets"
              :key="p.id"
              class="se-item"
              :title="p.builtin ? '内置预设' : '自定义预设'"
            >
              <span class="se-item-name">{{ p.name }}</span>
              <span class="se-item-meta">{{ p.w }}×{{ p.h }}</span>
              <button class="se-x" :disabled="!sprite" @click.stop="applyPresetToSprite(p.id)">套用</button>
              <button v-if="!p.builtin" class="se-x" @click.stop="removePreset(p.id)">✕</button>
            </li>
          </ul>
          <div class="se-preset-form">
            <input v-model="preName" placeholder="预设名" />
            <input v-model.number="preW" type="number" min="1" title="宽" />
            <span class="se-x">×</span>
            <input v-model.number="preH" type="number" min="1" title="高" />
            <button class="se-mini" title="保存自定义尺寸" @click="makePreset">＋</button>
          </div>
        </section>
      </aside>

      <!-- 中：画布 -->
      <main class="se-center">
        <SpriteSheetCanvas @change="onViewportChange" />
      </main>

      <!-- 右：检查器 -->
      <aside class="se-right-pane">
        <SpriteInspector />
      </aside>
    </div>

    <!-- 底：时间轴 -->
    <footer class="se-bottom">
      <SpriteTimeline />
    </footer>
  </div>
</template>

<style scoped>
.se-root {
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
.se-bar {
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
.se-brand b {
  font-family: var(--font-title, serif);
  font-size: 15px;
  letter-spacing: 2px;
  color: var(--c-white, #e8e3d6);
}
.se-brand em {
  font-style: normal;
  font-size: 9px;
  color: var(--c-ochre, #a8763a);
  margin-left: 8px;
  letter-spacing: 1px;
}
.se-group {
  display: flex;
  align-items: center;
  gap: 5px;
}
.se-right {
  margin-left: auto;
}
.se-stat {
  color: var(--c-bone-dark, #8a8272);
  margin-right: 6px;
}

.se-btn {
  background: #1a1f24;
  border: 1px solid var(--c-steel, #3a444b);
  color: var(--c-bone, #d8cfba);
  padding: 4px 9px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 2px;
}
.se-btn:hover {
  border-color: var(--c-rust-light, #c07038);
  color: var(--c-white, #e8e3d6);
}
.se-btn.primary {
  border-color: var(--c-neon, #6ff0d0);
  color: var(--c-neon, #6ff0d0);
}
.se-btn.danger:hover {
  border-color: var(--c-danger, #c8553f);
  color: var(--c-danger, #c8553f);
}
.se-tools {
  border-left: 1px solid var(--c-steel, #3a444b);
  padding-left: 10px;
}
.se-tool {
  background: #141a1e;
  border: 1px solid #2b3238;
  color: var(--c-bone-dark, #8a8272);
  padding: 3px 8px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 2px;
}
.se-tool.on {
  background: rgba(242, 179, 74, 0.16);
  border-color: var(--c-neon-warm, #f2b34a);
  color: var(--c-neon-warm, #f2b34a);
}
.se-toggles {
  border-left: 1px solid var(--c-steel, #3a444b);
  padding-left: 10px;
  gap: 9px;
}
.se-toggles label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--c-bone-dark, #8a8272);
  cursor: pointer;
}

/* ---------------- 主体 ---------------- */
.se-main {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}
.se-left {
  width: 224px;
  flex: 0 0 224px;
  background: #0e1215;
  border-right: 1px solid var(--c-steel, #3a444b);
  overflow-y: auto;
}
.se-center {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
}
.se-right-pane {
  width: 280px;
  flex: 0 0 280px;
  background: #0e1215;
  border-left: 1px solid var(--c-steel, #3a444b);
  overflow-y: auto;
}

/* ---------------- 列表 ---------------- */
.se-sec {
  border-bottom: 1px solid #1d2429;
}
.se-sec-h {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: #12181c;
  border-bottom: 1px solid #1d2429;
}
.se-sec-h b {
  font-size: 12px;
  color: var(--c-sand, #c9b085);
}
.se-sec-h em {
  font-style: normal;
  font-size: 9px;
  color: var(--c-steel-light, #6f828c);
}
.se-grow {
  flex: 1;
}
.se-mini {
  background: #1a1f24;
  border: 1px solid var(--c-steel, #3a444b);
  color: var(--c-bone, #d8cfba);
  width: 20px;
  height: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 2px;
  font-size: 12px;
}
.se-mini:disabled {
  opacity: 0.35;
  cursor: default;
}
.se-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.se-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.se-item:hover {
  background: #141a1f;
}
.se-item.on {
  background: rgba(111, 240, 208, 0.08);
  border-left-color: var(--c-neon, #6ff0d0);
}
.se-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.se-item-meta {
  font-size: 10px;
  color: var(--c-bone-dark, #8a8272);
}
.se-x {
  background: none;
  border: none;
  color: var(--c-steel-light, #6f828c);
  cursor: pointer;
  font-size: 10px;
  padding: 1px 3px;
  font-family: inherit;
}
.se-x:hover {
  color: var(--c-danger, #c8553f);
}
.se-empty {
  padding: 8px;
  color: var(--c-steel-light, #6f828c);
  font-size: 11px;
}

/* ---------------- 专项编辑 ---------------- */
.se-kind-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px 2px;
}
.se-kind-tabs button {
  background: #151b1f;
  border: 1px solid #262e34;
  color: var(--c-bone-dark, #8a8272);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 2px;
  flex: 1;
}
.se-kind-tabs button.on {
  background: rgba(111, 240, 208, 0.12);
  border-color: var(--c-neon, #6ff0d0);
  color: var(--c-neon, #6ff0d0);
}
.se-kind-count {
  font-size: 9px;
  color: var(--c-steel-light, #6f828c);
  margin-left: 2px;
}
.se-ref-picker {
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.se-ref-picker label {
  font-size: 9px;
  color: var(--c-ochre, #a8763a);
  letter-spacing: 1px;
}
.se-ref-picker select {
  background: #12171b;
  border: 1px solid #262e34;
  color: var(--c-bone, #d8cfba);
  font-family: inherit;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 2px;
}
.se-kind-badge {
  width: 14px;
  height: 14px;
  line-height: 14px;
  font-size: 9px;
  text-align: center;
  flex: 0 0 14px;
  border-radius: 2px;
  color: #0b0d0f;
  font-weight: bold;
  letter-spacing: 0;
}
.se-kind-badge.role { background: var(--c-neon, #6ff0d0); }
.se-kind-badge.monster { background: var(--c-danger, #c8553f); color: #fff; }
.se-kind-badge.generic { background: var(--c-steel-light, #6f828c); color: #0b0d0f; }
.se-preset-form {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px 6px;
}
.se-preset-form input {
  background: #12171b;
  border: 1px solid #262e34;
  color: var(--c-bone, #d8cfba);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  min-width: 0;
}
.se-preset-form input:first-child {
  flex: 1;
}
.se-preset-form input[type='number'] {
  width: 38px;
  flex: 0 0 38px;
}

/* ---------------- 底栏 ---------------- */
.se-bottom {
  flex: 0 0 auto;
  height: 186px;
  background: #0c1013;
  border-top: 1px solid var(--c-steel, #3a444b);
  display: flex;
  min-height: 0;
}
</style>
