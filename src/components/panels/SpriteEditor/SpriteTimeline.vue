<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import {
  SE,
  currentSprite,
  currentAction,
  sheetImage,
  addAction,
  removeAction,
  moveAction,
  removeFrame,
  moveFrame,
  autoLayout,
  saveProject,
} from '../../../game/editor/sprite-store.js'

const sprite = computed(() => currentSprite())
const action = computed(() => currentAction())

/** 是否展开显示所有动作的完整帧 */
const showAll = ref(false)

const actions = computed(() => sprite.value?.actions || [])

const allStrips = computed(() => actions.value.map((a) => ({ act: a, frames: a.frames })))

function fmtTime(t) {
  return `${t.toFixed(2)}s`
}

function frameTime(action, i) {
  const fps = Math.max(1, action?.fps || 10)
  return i / fps
}

function totalTime(action) {
  const fps = Math.max(1, action?.fps || 10)
  return (action?.frames.length || 0) / fps
}

// ---------------------------------------------------------------- 缩略图
function drawThumb(el, frame) {
  if (!el) return
  const ctx = el.getContext('2d')
  const sh = SE.project.sheets.find((s) => s.id === (sprite.value?.sheetId || SE.sel.sheetId))
  const img = sh ? sheetImage(sh) : null
  const w = el.clientWidth || 40
  const h = el.clientHeight || 40
  el.width = w
  el.height = h
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#101519'
  ctx.fillRect(0, 0, w, h)
  if (!img || !img.complete || !img.naturalWidth) return
  ctx.imageSmoothingEnabled = false
  const s = Math.min(w / frame.w, h / frame.h)
  const dw = frame.w * s
  const dh = frame.h * s
  ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function paintAll() {
  document.querySelectorAll('.stt-thumb').forEach((c) => {
    const f = c.__frame
    if (f) drawThumb(c, f)
  })
}

watch(
  () => [sprite.value?.id, action.value?.id, SE.project.sprites.length],
  () => {
    requestAnimationFrame(paintAll)
  },
)
watch(
  () => SE.sel.sheetId,
  () => requestAnimationFrame(paintAll),
)

// ---------------------------------------------------------------- 播放
let raf = 0
let last = 0
function tick(ts) {
  if (!SE.play.on) return
  const dt = last ? (ts - last) / 1000 : 0
  last = ts
  const act = actions.value.find((a) => a.id === SE.play.actionId) || action.value
  if (act && act.frames.length) {
    const fps = Math.max(1, act.fps || 10)
    SE.play.t += dt * fps
    if (SE.play.t >= act.frames.length) {
      if (act.loop) SE.play.t = SE.play.t % act.frames.length
      else {
        SE.play.t = act.frames.length - 1
        SE.play.on = false
      }
    }
    const idx = Math.floor(SE.play.t)
    const f = act.frames[idx]
    if (f && f.id !== SE.sel.frameId) SE.sel.frameId = f.id
  }
  raf = requestAnimationFrame(tick)
}

function play() {
  const act = action.value
  if (!act || !act.frames.length) return
  SE.play.actionId = act.id
  SE.play.t = 0
  SE.play.on = true
  last = 0
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(tick)
}
function stop() {
  SE.play.on = false
  SE.play.t = 0
  cancelAnimationFrame(raf)
}
function step(delta) {
  const act = action.value
  if (!act || !act.frames.length) return
  const idx = act.frames.findIndex((f) => f.id === SE.sel.frameId)
  const next = Math.max(0, Math.min(act.frames.length - 1, (idx < 0 ? 0 : idx) + delta))
  SE.sel.frameId = act.frames[next].id
}

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="stt-root">
    <!-- 动作编排 -->
    <div class="stt-actions">
      <span class="stt-cap">动作编排 <em>ACTIONS</em></span>
      <div class="stt-chips">
        <div
          v-for="a in actions"
          :key="a.id"
          class="stt-chip"
          :class="{ on: SE.sel.actionId === a.id }"
          @click="SE.sel.actionId = a.id; SE.sel.frameId = ''"
        >
          <input
            class="stt-name"
            :value="a.name"
            @click.stop
            @input="a.name = $event.target.value"
            @change="saveProject()"
          />
          <span class="stt-chip-meta">{{ a.frames.length }}帧 · {{ a.fps }}fps</span>
          <div class="stt-chip-btns">
            <button title="上移" @click.stop="moveAction(a.id, -1)">▲</button>
            <button title="下移" @click.stop="moveAction(a.id, 1)">▼</button>
            <button title="删除" @click.stop="removeAction(a.id)">✕</button>
          </div>
        </div>
        <button class="stt-add" title="新增动作" @click="addAction()">＋动作</button>
      </div>
      <label class="stt-all">
        <input type="checkbox" v-model="showAll" />
        完整时间帧
      </label>
      <button class="stt-add stt-layout" :disabled="!sprite" @click="autoLayout()">
        按动作顺序排布到精灵图
      </button>
    </div>

    <!-- 帧条 -->
    <div class="stt-frames">
      <template v-if="!showAll">
        <div v-if="action" class="stt-strip">
          <div class="stt-ruler">
            <span
              v-for="(f, i) in action.frames"
              :key="'r' + f.id"
              class="stt-tick"
              :style="{ width: 100 / Math.max(1, action.frames.length) + '%' }"
            >
              <em>{{ fmtTime(frameTime(action, i)) }}</em>
            </span>
          </div>
          <div class="stt-frow">
            <div
              v-for="(f, i) in action.frames"
              :key="f.id"
              class="stt-frame"
              :class="{ on: SE.sel.frameId === f.id }"
              @click="SE.sel.frameId = f.id"
            >
              <canvas
                class="stt-thumb"
                :ref="(el) => { if (el) { el.__frame = f; drawThumb(el, f) } }"
              ></canvas>
              <span class="stt-fi">{{ i }}</span>
              <span class="stt-ft">{{ fmtTime(frameTime(action, i)) }}</span>
              <div class="stt-fbtns">
                <button title="前移" @click.stop="moveFrame(action.id, f.id, -1)">◀</button>
                <button title="后移" @click.stop="moveFrame(action.id, f.id, 1)">▶</button>
                <button title="删除" @click.stop="removeFrame(action.id, f.id)">✕</button>
              </div>
            </div>
            <div v-if="!action.frames.length" class="stt-empty">
              切到「框选帧」工具，在图上拖拽出帧区域
            </div>
          </div>
        </div>
        <div v-else class="stt-empty">先在左侧选择一个角色</div>
      </template>

      <template v-else>
        <div v-for="s in allStrips" :key="s.act.id" class="stt-strip all">
          <div class="stt-strip-h">
            <b>{{ s.act.name }}</b>
            <span>{{ s.frames.length }} 帧 · {{ fmtTime(totalTime(s.act)) }}</span>
          </div>
          <div class="stt-ruler">
            <span
              v-for="(f, i) in s.frames"
              :key="'r' + s.act.id + f.id"
              class="stt-tick"
              :style="{ width: 100 / Math.max(1, s.frames.length) + '%' }"
            >
              <em>{{ fmtTime(frameTime(s.act, i)) }}</em>
            </span>
          </div>
          <div class="stt-frow">
            <div
              v-for="(f, i) in s.frames"
              :key="f.id"
              class="stt-frame"
              :class="{ on: SE.sel.frameId === f.id }"
              @click="SE.sel.actionId = s.act.id; SE.sel.frameId = f.id"
            >
              <canvas
                class="stt-thumb"
                :ref="(el) => { if (el) { el.__frame = f; drawThumb(el, f) } }"
              ></canvas>
              <span class="stt-fi">{{ i }}</span>
              <span class="stt-ft">{{ fmtTime(frameTime(s.act, i)) }}</span>
            </div>
            <div v-if="!s.frames.length" class="stt-empty">空动作</div>
          </div>
        </div>
      </template>
    </div>

    <!-- 播放控制 -->
    <div class="stt-transport">
      <button class="stt-tbtn" title="上一帧" @click="step(-1)">◀|</button>
      <button class="stt-tbtn play" :class="{ on: SE.play.on }" @click="SE.play.on ? stop() : play()">
        {{ SE.play.on ? '暂停' : '播放' }}
      </button>
      <button class="stt-tbtn" title="下一帧" @click="step(1)">|▶</button>
      <button class="stt-tbtn" title="停止" @click="stop()">■</button>
      <div class="stt-info">
        <div><span>当前动作</span><b>{{ action?.name || '—' }}</b></div>
        <div><span>FPS</span><b>{{ action?.fps || 0 }}</b></div>
        <div><span>帧数</span><b>{{ action?.frames.length || 0 }}</b></div>
        <div><span>时长</span><b>{{ action ? fmtTime(totalTime(action)) : '0.00s' }}</b></div>
        <div><span>动作总数</span><b>{{ actions.length }}</b></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stt-root {
  flex: 1;
  display: flex;
  min-width: 0;
}
/* 动作条 */
.stt-actions {
  width: 250px;
  flex: 0 0 250px;
  border-right: 1px solid var(--c-steel, #3a444b);
  padding: 6px 8px;
  overflow-y: auto;
}
.stt-cap {
  display: block;
  font-size: 11px;
  color: var(--c-sand, #c9b085);
  margin-bottom: 4px;
}
.stt-cap em {
  font-style: normal;
  font-size: 9px;
  color: var(--c-steel-light, #6f828c);
  margin-left: 5px;
}
.stt-chips {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stt-chip {
  border: 1px solid #242c32;
  background: #11171b;
  padding: 3px 5px;
  border-radius: 2px;
  cursor: pointer;
}
.stt-chip.on {
  border-color: var(--c-neon-warm, #f2b34a);
  background: rgba(242, 179, 74, 0.1);
}
.stt-name {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--c-bone, #d8cfba);
  font-family: inherit;
  font-size: 11px;
  padding: 0;
}
.stt-name:focus {
  outline: 1px solid var(--c-neon, #6ff0d0);
}
.stt-chip-meta {
  font-size: 9px;
  color: var(--c-bone-dark, #8a8272);
}
.stt-chip-btns {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}
.stt-chip-btns button {
  background: #1a1f24;
  border: 1px solid #262e34;
  color: var(--c-bone-dark, #8a8272);
  font-size: 9px;
  cursor: pointer;
  padding: 0 4px;
  font-family: inherit;
}
.stt-chip-btns button:hover {
  color: var(--c-white, #e8e3d6);
  border-color: var(--c-rust-light, #c07038);
}
.stt-add {
  background: #151b1f;
  border: 1px dashed #2c343a;
  color: var(--c-bone-dark, #8a8272);
  font-size: 11px;
  padding: 4px;
  cursor: pointer;
  font-family: inherit;
}
.stt-add:hover {
  color: var(--c-neon, #6ff0d0);
  border-color: var(--c-neon, #6ff0d0);
}
.stt-layout {
  margin-top: 6px;
  width: 100%;
}
.stt-all {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--c-bone-dark, #8a8272);
  cursor: pointer;
}

/* 帧区 */
.stt-frames {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 6px 10px;
}
.stt-strip {
  margin-bottom: 8px;
}
.stt-strip-h {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 10px;
  color: var(--c-bone-dark, #8a8272);
  margin-bottom: 3px;
}
.stt-strip-h b {
  color: var(--c-sand, #c9b085);
  font-size: 11px;
}
.stt-ruler {
  display: flex;
  height: 14px;
  border-bottom: 1px solid #232b31;
  margin-bottom: 4px;
}
.stt-tick {
  border-right: 1px solid #1c2328;
  font-size: 9px;
  color: var(--c-steel-light, #6f828c);
  overflow: hidden;
  white-space: nowrap;
}
.stt-tick em {
  font-style: normal;
  padding-left: 2px;
}
.stt-frow {
  display: flex;
  gap: 5px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 4px;
}
.stt-frame {
  position: relative;
  width: 62px;
  flex: 0 0 62px;
  border: 1px solid #242c32;
  background: #101519;
  border-radius: 2px;
  cursor: pointer;
  padding-bottom: 2px;
}
.stt-frame.on {
  border-color: var(--c-neon-warm, #f2b34a);
  box-shadow: 0 0 0 1px rgba(242, 179, 74, 0.4);
}
.stt-thumb {
  width: 60px;
  height: 44px;
  display: block;
  image-rendering: pixelated;
}
.stt-fi {
  position: absolute;
  left: 2px;
  top: 2px;
  font-size: 9px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 0 3px;
}
.stt-ft {
  display: block;
  font-size: 9px;
  text-align: center;
  color: var(--c-bone-dark, #8a8272);
}
.stt-fbtns {
  display: flex;
  gap: 2px;
  justify-content: center;
}
.stt-fbtns button {
  background: #1a1f24;
  border: 1px solid #262e34;
  color: var(--c-bone-dark, #8a8272);
  font-size: 9px;
  cursor: pointer;
  padding: 0 3px;
  font-family: inherit;
}
.stt-fbtns button:hover {
  color: var(--c-white, #e8e3d6);
}
.stt-empty {
  font-size: 11px;
  color: var(--c-steel-light, #6f828c);
  padding: 16px 4px;
}

/* 播放控制 */
.stt-transport {
  width: 176px;
  flex: 0 0 176px;
  border-left: 1px solid var(--c-steel, #3a444b);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stt-tbtn {
  background: #161c21;
  border: 1px solid #262e34;
  color: var(--c-bone, #d8cfba);
  font-size: 11px;
  padding: 3px 6px;
  cursor: pointer;
  font-family: inherit;
  border-radius: 2px;
}
.stt-tbtn.play {
  background: rgba(111, 240, 208, 0.12);
  border-color: var(--c-neon, #6ff0d0);
  color: var(--c-neon, #6ff0d0);
}
.stt-tbtn.play.on {
  background: rgba(242, 179, 74, 0.16);
  border-color: var(--c-neon-warm, #f2b34a);
  color: var(--c-neon-warm, #f2b34a);
}
.stt-info {
  margin-top: 6px;
  font-size: 10px;
}
.stt-info div {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
  color: var(--c-bone-dark, #8a8272);
}
.stt-info b {
  color: var(--c-bone, #d8cfba);
  font-weight: normal;
}
</style>
