<script setup>
import { ref, computed } from 'vue'
import {
  RE,
  currentKey,
  currentRoomMeta,
  effectiveSpec,
  setRoomParam,
  regenerate,
  clearRoomEdits,
  saveProject,
  TILE_TYPES,
  PROP_KINDS,
  ROOM_KINDS,
  BIOME_LIST,
  tileEditCount,
  propCount,
  bgLayers,
  currentBgLayer,
  addBgLayer,
  removeBgLayer,
  moveBgLayer,
  setBgLayerParam,
  setBgImage,
  setBgLayerImageFile,
  clearBgImage,
} from '../../../game/editor/room-store.js'

const spec = computed(() =>
  RE.sel.roomId ? effectiveSpec(RE.sel.regionId, RE.sel.roomId) : null
)
const meta = computed(() => currentRoomMeta.value)
const key = computed(() => currentKey.value)

const propQuery = ref('')

/** 道具 kind 共 2000+，按搜索词过滤后只渲染前 120 条 */
const propHits = computed(() => {
  const q = propQuery.value.trim().toLowerCase()
  if (!q) return PROP_KINDS.slice(0, 120)
  return PROP_KINDS.filter((k) => k.toLowerCase().includes(q)).slice(0, 120)
})

/** 该房间是否有参数覆写 */
const paramOverrides = computed(() => {
  const e = RE.project.edits[key.value]
  return e ? Object.keys(e.params || {}) : []
})

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 改参数 → 写覆写 → 重新生成 */
function setParam(name, value) {
  if (!key.value) return
  setRoomParam(key.value, name, value)
  regenerate()
  saveProject()
}

function onLabel(e) {
  setParam('label', e.target.value)
}
function onSeed(e) {
  setParam('seed', num(e.target.value, 1) | 0)
}
function onW(e) {
  setParam('w', Math.max(96, Math.min(160, Math.round(num(e.target.value, 112)))))
}
function onH(e) {
  setParam('h', Math.max(44, Math.min(68, Math.round(num(e.target.value, 52)))))
}
function onKind(e) {
  setParam('kind', e.target.value)
}
function onBiome(e) {
  setParam('biome', e.target.value)
}
function onMonsterCount(e) {
  setParam('monsterCount', Math.max(0, Math.min(9, Math.round(num(e.target.value, 6)))))
}
function onLootDensity(e) {
  setParam('lootDensity', Math.max(0.25, Math.min(2, num(e.target.value, 1))))
}
function onVariant(e) {
  setParam('variant', e.target.value || null)
}
function onNotes(e) {
  setParam('notes', e.target.value)
}

function onClear() {
  if (!RE.sel.roomId) return
  if (confirm(`清空「${meta.value?.spec?.label || RE.sel.roomId}」的全部编辑？`)) {
    clearRoomEdits(RE.sel.regionId, RE.sel.roomId)
    saveProject()
  }
}

// ---------------------------------------------------------------- 背景层
const curBg = currentBgLayer
const bgFileInput = ref(null)

/** 列表显示：数组尾 = 最上层，倒序展示让最上层排在列表顶部 */
const bgLayersRev = computed(() => [...bgLayers.value].reverse())

function onAddLayer() {
  addBgLayer()
  RE.sel.tool = 'bg'
  saveProject()
}
function onRemoveLayer(id) {
  removeBgLayer(id)
  saveProject()
}
function onMoveLayer(id, dir) {
  moveBgLayer(id, dir)
  saveProject()
}
function pickLayer(l) {
  RE.sel.bgLayerId = l.id
  RE.sel.tool = 'bg'
}
function onLayerName(e) {
  if (curBg.value) setBgLayerParam(curBg.value.id, 'name', e.target.value)
  saveProject()
}
function onLayerParallax(e) {
  if (curBg.value) setBgLayerParam(curBg.value.id, 'parallax', Math.max(0, Math.min(1, num(e.target.value, 0.6))))
  saveProject()
}
function onLayerOpacity(e) {
  if (curBg.value) setBgLayerParam(curBg.value.id, 'opacity', Math.max(0, Math.min(1, num(e.target.value, 1))))
  saveProject()
}
function onLayerTint(e) {
  if (curBg.value) setBgLayerParam(curBg.value.id, 'tint', e.target.value)
  saveProject()
}
function onLayerYOff(e) {
  if (curBg.value) setBgLayerParam(curBg.value.id, 'yOff', num(e.target.value, 0))
  saveProject()
}
function onImgX(e) {
  if (curBg.value) setBgImage(curBg.value.id, { x: num(e.target.value, 0) })
  saveProject()
}
function onImgY(e) {
  if (curBg.value) setBgImage(curBg.value.id, { y: num(e.target.value, 0) })
  saveProject()
}
function onImgScale(e) {
  if (curBg.value) setBgImage(curBg.value.id, { scale: Math.max(0.05, Math.min(16, num(e.target.value, 1))) })
  saveProject()
}
async function onPickBgImage(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f || !curBg.value) return
  try {
    await setBgLayerImageFile(curBg.value.id, f)
    saveProject()
  } catch (err) {
    console.warn('[room-editor] 背景图像读取失败', err)
  }
}
function onClearBgImage() {
  if (curBg.value) clearBgImage(curBg.value.id)
  saveProject()
}
</script>

<template>
  <div class="ri-root">
    <div v-if="!spec" class="ri-empty">从左侧选择一间房</div>

    <template v-else>
      <!-- 房间参数 -->
      <section class="ri-sec">
        <header class="ri-h"><b>房间参数</b><em>ROOM</em></header>
        <div class="ri-row">
          <label>名称</label>
          <input :value="spec.label" @change="onLabel" />
        </div>
        <div class="ri-grid2">
          <div class="ri-row"><label>宽</label><input type="number" :value="spec.w" min="96" max="160" @change="onW" /></div>
          <div class="ri-row"><label>高</label><input type="number" :value="spec.h" min="44" max="68" @change="onH" /></div>
        </div>
        <div class="ri-row">
          <label>种子</label>
          <input type="number" :value="spec.seed" @change="onSeed" />
        </div>
        <div class="ri-row">
          <label>类型</label>
          <select :value="spec.kind" @change="onKind">
            <option v-for="k in ROOM_KINDS" :key="k" :value="k">{{ k }}</option>
          </select>
        </div>
        <div class="ri-row">
          <label>生态</label>
          <select :value="spec.biome" @change="onBiome">
            <option v-for="b in BIOME_LIST" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>
        <div class="ri-row">
          <label>变体</label>
          <input :value="spec.variant || ''" placeholder="— 无 —" @change="onVariant" />
        </div>
        <div class="ri-grid2">
          <div class="ri-row">
            <label>怪物</label>
            <input type="number" :value="spec.monsterCount" min="0" max="9" @change="onMonsterCount" />
          </div>
          <div class="ri-row">
            <label>物资</label>
            <input type="number" step="0.05" :value="spec.lootDensity" @change="onLootDensity" />
          </div>
        </div>
        <div class="ri-row">
          <label>备注</label>
          <textarea :value="spec.notes || ''" rows="3" @change="onNotes" />
        </div>
        <div v-if="paramOverrides.length" class="ri-hint">
          已覆写：{{ paramOverrides.join('、') }}
        </div>
        <button class="ri-btn danger" @click="onClear">清空本房编辑</button>
      </section>

      <!-- 地形工具 -->
      <section class="ri-sec">
        <header class="ri-h"><b>地形绘制</b><em>TILES</em></header>
        <div class="ri-tools">
          <button
            class="ri-tool"
            :class="{ on: RE.sel.tool === 'inspect' }"
            @click="RE.sel.tool = 'inspect'"
          >查看</button>
          <button
            class="ri-tool"
            :class="{ on: RE.sel.tool === 'tile' }"
            @click="RE.sel.tool = 'tile'"
          >绘制</button>
          <button
            class="ri-tool"
            :class="{ on: RE.sel.tool === 'prop' }"
            @click="RE.sel.tool = 'prop'"
          >放道具</button>
          <button
            class="ri-tool"
            :class="{ on: RE.sel.tool === 'bg' }"
            @click="RE.sel.tool = 'bg'"
          >背景层</button>
        </div>
        <div class="ri-tiles">
          <button
            v-for="t in TILE_TYPES"
            :key="t.id"
            class="ri-tile"
            :class="{ on: RE.sel.tile === t.id }"
            :style="{ '--tc': t.color }"
            :title="`${t.name} (${t.en})`"
            @click="RE.sel.tile = t.id; RE.sel.tool = 'tile'"
          >
            <i /><span>{{ t.name }}</span>
          </button>
        </div>
        <div class="ri-hint">
          左键涂 / 右键擦（恢复原值）· 差分 {{ tileEditCount }} 格
        </div>
      </section>

      <!-- 道具 -->
      <section class="ri-sec">
        <header class="ri-h"><b>道具</b><em>PROPS</em></header>
        <input v-model="propQuery" class="ri-prop-filter" placeholder="搜索道具 kind…" />
        <div class="ri-prop-list">
          <button
            v-for="k in propHits"
            :key="k"
            class="ri-prop"
            :class="{ on: RE.sel.propKind === k }"
            @click="RE.sel.propKind = k; RE.sel.tool = 'prop'"
          >
            {{ k }}
          </button>
          <div v-if="!propHits.length" class="ri-hint">没有匹配的道具</div>
        </div>
        <div class="ri-hint">
          已选 <code>{{ RE.sel.propKind || '—' }}</code> · 房内 {{ propCount }} 件 · 画布左键放置 /
          右键删除
        </div>
      </section>

      <!-- 背景层 -->
      <section class="ri-sec">
        <header class="ri-h"><b>背景层</b><em>BG LAYERS</em></header>
        <div class="ri-bg-list">
          <div
            v-for="l in bgLayersRev"
            :key="l.id"
            class="ri-bg"
            :class="{ on: RE.sel.bgLayerId === l.id }"
            @click="pickLayer(l)"
          >
            <span class="ri-bg-swatch" :class="{ empty: !l.img }" />
            <span class="ri-bg-name">{{ l.name }}</span>
            <span class="ri-bg-acts" @click.stop>
              <button title="前移（更靠近镜头）" @click="onMoveLayer(l.id, 1)">↑</button>
              <button title="后移" @click="onMoveLayer(l.id, -1)">↓</button>
              <button class="danger" title="删除层" @click="onRemoveLayer(l.id)">✕</button>
            </span>
          </div>
          <div v-if="!bgLayers.length" class="ri-hint">还没有背景层，点下方按钮新增</div>
        </div>
        <button class="ri-btn" @click="onAddLayer">＋ 新增图层</button>

        <template v-if="curBg">
          <div class="ri-row" style="margin-top: 9px">
            <label>名称</label>
            <input :value="curBg.name" @change="onLayerName" />
          </div>
          <div class="ri-grid2">
            <div class="ri-row">
              <label>视差</label>
              <input type="number" step="0.05" min="0" max="1" :value="curBg.parallax" @change="onLayerParallax" />
            </div>
            <div class="ri-row">
              <label>透明</label>
              <input type="number" step="0.05" min="0" max="1" :value="curBg.opacity" @change="onLayerOpacity" />
            </div>
          </div>
          <div class="ri-grid2">
            <div class="ri-row">
              <label>色调</label>
              <input type="color" :value="curBg.tint || '#ffffff'" @input="onLayerTint" />
            </div>
            <div class="ri-row">
              <label>偏移</label>
              <input type="number" step="4" :value="curBg.yOff" title="垂直偏移（世界像素，正值向下）" @change="onLayerYOff" />
            </div>
          </div>

          <template v-if="curBg.img">
            <div class="ri-kv">
              <span>图像</span><code>{{ curBg.img.w }}×{{ curBg.img.h }}px</code>
            </div>
            <div class="ri-grid2">
              <div class="ri-row">
                <label>X</label>
                <input type="number" step="0.5" :value="Math.round(curBg.img.x * 100) / 100" title="图像中心（格）" @change="onImgX" />
              </div>
              <div class="ri-row">
                <label>Y</label>
                <input type="number" step="0.5" :value="Math.round(curBg.img.y * 100) / 100" title="图像中心（格）" @change="onImgY" />
              </div>
            </div>
            <div class="ri-row">
              <label>缩放</label>
              <input type="number" step="0.05" min="0.05" max="16" :value="curBg.img.scale" @change="onImgScale" />
            </div>
            <div class="ri-bg-imgacts">
              <button class="ri-btn half" @click="bgFileInput?.click()">替换图像</button>
              <button class="ri-btn half danger" @click="onClearBgImage">移除图像</button>
            </div>
          </template>
          <template v-else>
            <button class="ri-btn" @click="bgFileInput?.click()">上传图像…</button>
          </template>
          <div class="ri-hint">
            画布中「背景层」工具下左键拖拽移动图像 · 视差 0=贴近地形 · 1=最远（近乎锁定镜头）
          </div>
        </template>
        <input ref="bgFileInput" type="file" accept="image/*" hidden @change="onPickBgImage" />
      </section>

      <!-- 房间信息 -->
      <section class="ri-sec">
        <header class="ri-h"><b>房间信息</b><em>INFO</em></header>
        <div class="ri-kv"><span>房间 ID</span><code>{{ RE.sel.roomId }}</code></div>
        <div class="ri-kv"><span>区域</span><code>{{ meta?.spec?.regionName || RE.sel.regionId }}</code></div>
        <div class="ri-kv"><span>出口</span><code>{{ spec.exits?.left || '—' }} / {{ spec.exits?.right || '—' }}</code></div>
        <div class="ri-kv"><span>网格</span><code>{{ spec.w }}×{{ spec.h }}</code></div>
        <div v-if="spec.theme" class="ri-kv"><span>主题</span><code>{{ spec.theme }}</code></div>
        <div v-if="spec.landmark" class="ri-kv"><span>地标</span><code>{{ spec.landmark }}</code></div>
        <div v-if="spec.cage" class="ri-kv"><span>牢笼</span><code>{{ spec.cage.id }}</code></div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ri-root {
  font-size: 12px;
}
.ri-empty {
  padding: 20px 12px;
  color: var(--c-bone-dark, #8a8272);
  text-align: center;
}
.ri-sec {
  border-bottom: 1px solid #1d2429;
  padding: 9px 10px 11px;
}
.ri-h {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}
.ri-h b {
  font-family: var(--font-title, serif);
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--c-white, #e8e3d6);
}
.ri-h em {
  font-style: normal;
  font-size: 8px;
  letter-spacing: 1px;
  color: var(--c-ochre, #a8763a);
}
.ri-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}
.ri-row label {
  width: 34px;
  flex: 0 0 34px;
  color: var(--c-bone-dark, #8a8272);
  font-size: 11px;
}
.ri-row input,
.ri-row select,
.ri-row textarea {
  flex: 1 1 auto;
  min-width: 0;
  background: #161b1f;
  border: 1px solid #2b3238;
  color: var(--c-bone, #d8cfba);
  padding: 3px 5px;
  font-size: 11px;
  font-family: inherit;
  border-radius: 2px;
}
.ri-row textarea {
  resize: vertical;
  line-height: 1.5;
}
.ri-row input:focus,
.ri-row select:focus,
.ri-row textarea:focus {
  outline: none;
  border-color: var(--c-neon, #6ff0d0);
}
.ri-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
}
.ri-hint {
  margin-top: 6px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--c-bone-dark, #8a8272);
}
.ri-btn {
  margin-top: 9px;
  width: 100%;
  background: #1a1f24;
  border: 1px solid #2b3238;
  color: var(--c-bone, #d8cfba);
  padding: 4px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 2px;
}
.ri-btn.danger:hover {
  border-color: var(--c-danger, #c8553f);
  color: var(--c-danger, #c8553f);
}

/* 工具 */
.ri-tools {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.ri-tool {
  flex: 1;
  background: #141a1e;
  border: 1px solid #2b3238;
  color: var(--c-bone-dark, #8a8272);
  padding: 4px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 2px;
}
.ri-tool.on {
  background: rgba(242, 179, 74, 0.16);
  border-color: var(--c-neon-warm, #f2b34a);
  color: var(--c-neon-warm, #f2b34a);
}

/* tile 色板 */
.ri-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.ri-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: #141a1e;
  border: 1px solid #2b3238;
  padding: 4px 2px;
  cursor: pointer;
  border-radius: 2px;
  font-family: inherit;
}
.ri-tile i {
  display: block;
  width: 100%;
  height: 13px;
  background: var(--tc);
  border: 1px solid rgba(0, 0, 0, 0.45);
}
.ri-tile span {
  font-size: 9px;
  color: var(--c-bone-dark, #8a8272);
}
.ri-tile.on {
  border-color: var(--c-neon-warm, #f2b34a);
  background: rgba(242, 179, 74, 0.14);
}
.ri-tile.on span {
  color: var(--c-neon-warm, #f2b34a);
}

/* 道具选择 */
.ri-prop-filter {
  width: 100%;
  background: #161b1f;
  border: 1px solid #2b3238;
  color: var(--c-bone, #d8cfba);
  padding: 3px 5px;
  font-size: 11px;
  font-family: inherit;
  border-radius: 2px;
  margin-bottom: 5px;
}
.ri-prop-filter:focus {
  outline: none;
  border-color: var(--c-neon, #6ff0d0);
}
.ri-prop-list {
  max-height: 168px;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-content: flex-start;
  padding: 3px;
  background: #12171b;
  border: 1px solid #262e34;
  border-radius: 2px;
}
.ri-prop {
  background: #1a1f24;
  border: 1px solid #2b3238;
  color: var(--c-bone-dark, #8a8272);
  font-family: inherit;
  font-size: 10px;
  padding: 1px 5px;
  cursor: pointer;
  border-radius: 2px;
}
.ri-prop:hover {
  border-color: var(--c-steel-light, #6f828c);
  color: var(--c-bone, #d8cfba);
}
.ri-prop.on {
  background: rgba(111, 240, 208, 0.14);
  border-color: var(--c-neon, #6ff0d0);
  color: var(--c-neon, #6ff0d0);
}
.ri-hint code {
  color: var(--c-neon, #6ff0d0);
  font-size: 10px;
}

/* 背景层 */
.ri-bg-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 6px;
}
.ri-bg {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 5px;
  background: #12171b;
  border: 1px solid #262e34;
  border-left: 2px solid transparent;
  cursor: pointer;
  border-radius: 2px;
}
.ri-bg:hover {
  background: #141a1f;
}
.ri-bg.on {
  background: rgba(242, 179, 74, 0.1);
  border-left-color: var(--c-neon-warm, #f2b34a);
}
.ri-bg-swatch {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  background: linear-gradient(135deg, #6ff0d0 0%, #2f5f7f 100%);
  border: 1px solid rgba(0, 0, 0, 0.5);
}
.ri-bg-swatch.empty {
  background: #1d2429;
  border-style: dashed;
  border-color: #3a444b;
}
.ri-bg-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.ri-bg-acts {
  display: flex;
  gap: 2px;
}
.ri-bg-acts button {
  background: #1a1f24;
  border: 1px solid #2b3238;
  color: var(--c-bone-dark, #8a8272);
  width: 17px;
  height: 17px;
  padding: 0;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  border-radius: 2px;
  font-family: inherit;
}
.ri-bg-acts button:hover {
  border-color: var(--c-steel-light, #6f828c);
  color: var(--c-bone, #d8cfba);
}
.ri-bg-acts button.danger:hover {
  border-color: var(--c-danger, #c8553f);
  color: var(--c-danger, #c8553f);
}
.ri-bg-imgacts {
  display: flex;
  gap: 5px;
}
.ri-btn.half {
  flex: 1;
  margin-top: 6px;
}
.ri-row input[type='color'] {
  padding: 0 2px;
  height: 21px;
  cursor: pointer;
}

/* 键值 */
.ri-kv {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
}
.ri-kv span {
  color: var(--c-bone-dark, #8a8272);
}
.ri-kv code {
  color: var(--c-neon, #6ff0d0);
  font-size: 10px;
  word-break: break-all;
  text-align: right;
}
</style>
