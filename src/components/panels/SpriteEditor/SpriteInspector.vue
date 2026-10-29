<script setup>
import { computed } from 'vue'
import {
  SE,
  currentSheet,
  currentSprite,
  currentAction,
  currentFrame,
  currentBone,
  currentShape,
  currentEffect,
  orderedBones,
  boneTransforms,
  removeBone,
  removeShape,
  clearSlot,
  setSheetScale,
  setSheetSize,
  setSpriteRef,
  applyFamilyBones,
  applyFamilyShapes,
  ROLE_LIST,
  MONSTER_LIST,
  BOSS_LIST,
  findEntityDef,
  SPRITE_FAMILIES,
  saveProject,
} from '../../../game/editor/sprite-store.js'

const sheet = computed(() => currentSheet())
const sprite = computed(() => currentSprite())
const action = computed(() => currentAction())
const frame = computed(() => currentFrame())
const bone = computed(() => currentBone())
const shape = computed(() => currentShape())
const effect = computed(() => currentEffect())

const bones = computed(() => orderedBones(sprite.value))
const boneXf = computed(() => (sprite.value ? boneTransforms(sprite.value) : new Map()))

const parentOptions = computed(() => {
  if (!sprite.value || !bone.value) return []
  return sprite.value.bones.filter((b) => b.id !== bone.value.id)
})

/** 当前绑定参考（怪物侧含 BOSS） */
const refInfo = computed(() =>
  sprite.value?.refId ? findEntityDef(sprite.value.kind, sprite.value.refId) : null
)
const refIsBoss = computed(() => !!refInfo.value?.boss)
const refIsElite = computed(() => !!refInfo.value?.def?.elite)
const refHitbox = computed(() => refInfo.value?.def?.hitbox || [])

function commit() {
  saveProject()
}
function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function applyBones() {
  if (!sprite.value) return
  const fam = sprite.value.family || 'unknown'
  applyFamilyBones(sprite.value, fam, { replace: true })
}
function applyShapes() {
  if (!sprite.value) return
  const fam = sprite.value.family || 'unknown'
  applyFamilyShapes(sprite.value, fam, { replace: true })
}
function applyBoth() {
  if (!sprite.value) return
  applyBones()
  applyShapes()
}
</script>

<template>
  <div class="si-root">
    <div v-if="!sheet" class="si-empty">先导入一张精灵图</div>

    <template v-else>
      <!-- 精灵图 -->
      <section class="si-sec">
        <header class="si-h"><b>精灵图</b><em>SHEET</em></header>
        <div class="si-row">
          <label>名称</label>
          <input v-model="sheet.name" @change="commit" />
        </div>
        <div class="si-grid2">
          <div class="si-row"><label>图宽</label><input type="number" :value="sheet.width" @change="setSheetSize(sheet, $event.target.value, sheet.height)" /></div>
          <div class="si-row"><label>图高</label><input type="number" :value="sheet.height" @change="setSheetSize(sheet, sheet.width, $event.target.value)" /></div>
          <div class="si-row"><label>网格W</label><input type="number" v-model.number="sheet.gridW" min="1" @change="commit" /></div>
          <div class="si-row"><label>网格H</label><input type="number" v-model.number="sheet.gridH" min="1" @change="commit" /></div>
        </div>
        <div class="si-row">
          <label>缩放</label>
          <input
            type="number"
            :value="sheet.scale"
            min="0.05"
            step="0.05"
            @change="setSheetScale(sheet, num($event.target.value, 1))"
          />
        </div>
        <div v-if="sheet.naturalW" class="si-hint">原始 {{ sheet.naturalW }}×{{ sheet.naturalH }} px</div>
      </section>

      <!-- 角色 -->
      <section v-if="sprite" class="si-sec">
        <header class="si-h"><b>角色</b><em>SPRITE</em></header>
        <div class="si-row">
          <label>名称</label>
          <input v-model="sprite.name" @change="commit" />
        </div>
        <div class="si-grid2">
          <div class="si-row"><label>位置X</label><input type="number" v-model.number="sprite.x" @change="commit" /></div>
          <div class="si-row"><label>位置Y</label><input type="number" v-model.number="sprite.y" @change="commit" /></div>
          <div class="si-row"><label>宽</label><input type="number" v-model.number="sprite.w" min="1" @change="commit" /></div>
          <div class="si-row"><label>高</label><input type="number" v-model.number="sprite.h" min="1" @change="commit" /></div>
        </div>

        <!-- 专项编辑 -->
        <div class="si-sub">专项编辑</div>
        <div class="si-grid2">
          <div class="si-row">
            <label>分类</label>
            <select v-model="sprite.kind" @change="commit">
              <option value="generic">未分配</option>
              <option value="role">玩家机体</option>
              <option value="monster">怪物</option>
            </select>
          </div>
          <div class="si-row">
            <label>族系</label>
            <select v-model="sprite.family" @change="commit">
              <option v-for="f in SPRITE_FAMILIES" :key="f.id" :value="f.id">
                {{ f.name }} <span class="si-hint-inline">{{ f.en }}</span>
              </option>
            </select>
          </div>
        </div>
        <div class="si-hint" v-if="SPRITE_FAMILIES.find((f) => f.id === sprite.family)?.hint">
          {{ SPRITE_FAMILIES.find((f) => f.id === sprite.family).hint }}
        </div>
        <div class="si-row">
          <label>参考</label>
          <select v-model="sprite.refId" @change="setSpriteRef({ refId: sprite.refId, kind: sprite.kind })">
            <option value="">— 未绑定 —</option>
            <optgroup v-if="sprite.kind === 'role'" label="机体">
              <option v-for="r in ROLE_LIST" :key="r.id" :value="r.id">
                {{ r.name }} · {{ r.id }}
              </option>
            </optgroup>
            <optgroup v-if="sprite.kind === 'monster'" label="怪物">
              <option v-for="m in MONSTER_LIST" :key="m.id" :value="m.id">
                {{ m.name }} · {{ m.id }} {{ m.elite ? '★' : '' }}
              </option>
            </optgroup>
            <optgroup v-if="sprite.kind === 'monster'" label="BOSS">
              <option v-for="b in BOSS_LIST" :key="b.id" :value="b.id">
                {{ b.name }} · {{ b.id }} ★
              </option>
            </optgroup>
          </select>
        </div>
        <div class="si-hint" v-if="sprite.refId && sprite.kind === 'role'">
          参考机体命中箱 {{ (ROLE_LIST.find((r) => r.id === sprite.refId)?.hitbox || []).join('×') }}
        </div>
        <div class="si-hint" v-if="sprite.refId && sprite.kind === 'monster'">
          参考怪物 {{ refIsBoss ? 'BOSS' : (refIsElite ? '精英' : '普通') }} ·
          命中箱 {{ (refHitbox || []).join('×') || '—' }}
        </div>
        <div class="si-tpl-btns">
          <button class="se-btn se-tpl-btn" @click="applyBones" :disabled="sprite.family === 'unknown'">套用骨骼模板</button>
          <button class="se-btn se-tpl-btn" @click="applyShapes" :disabled="sprite.family === 'unknown'">套用碰撞模板</button>
          <button class="se-btn primary se-tpl-btn" @click="applyBoth" :disabled="sprite.family === 'unknown'">全部套用</button>
        </div>

        <div class="si-sub">骨骼 · {{ sprite.bones.length }}</div>
        <ul class="si-tree">
          <li
            v-for="{ bone: b, depth } in bones"
            :key="b.id"
            class="si-node"
            :class="{ on: SE.sel.boneId === b.id }"
            :style="{ paddingLeft: 6 + depth * 12 + 'px' }"
            @click="SE.sel.boneId = b.id; SE.sel.shapeId = ''"
          >
            <span class="si-dot" />
            <span class="si-node-name">{{ b.name }}</span>
            <span class="si-node-meta">{{ Math.round(boneXf.get(b.id)?.a ?? b.angle) }}°</span>
            <button class="si-x" @click.stop="removeBone(b.id)">✕</button>
          </li>
          <li v-if="!sprite.bones.length" class="si-hint">切到「骨骼」工具后在图上点击添加</li>
        </ul>

        <div v-if="bone" class="si-box">
          <div class="si-row"><label>骨骼名</label><input v-model="bone.name" @change="commit" /></div>
          <div class="si-grid2">
            <div class="si-row"><label>X</label><input type="number" v-model.number="bone.x" @change="commit" /></div>
            <div class="si-row"><label>Y</label><input type="number" v-model.number="bone.y" @change="commit" /></div>
            <div class="si-row"><label>长度</label><input type="number" v-model.number="bone.len" min="1" @change="commit" /></div>
            <div class="si-row"><label>角度</label><input type="number" v-model.number="bone.angle" @change="commit" /></div>
          </div>
          <div class="si-row">
            <label>父级</label>
            <select v-model="bone.parent" @change="commit">
              <option :value="null">（根）</option>
              <option v-for="o in parentOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </div>
        </div>

        <div class="si-sub">碰撞模型 · {{ sprite.shapes.length }}</div>
        <ul class="si-tree">
          <li
            v-for="s in sprite.shapes"
            :key="s.id"
            class="si-node"
            :class="{ on: SE.sel.shapeId === s.id }"
            @click="SE.sel.shapeId = s.id; SE.sel.boneId = ''"
          >
            <span class="si-dot red" />
            <span class="si-node-name">{{ s.name }}</span>
            <span class="si-node-meta">{{ s.type }}</span>
            <button class="si-x" @click.stop="removeShape(s.id)">✕</button>
          </li>
          <li v-if="!sprite.shapes.length" class="si-hint">切到矩形 / 圆形 / 多边形工具后拖拽添加</li>
        </ul>

        <div v-if="shape" class="si-box">
          <div class="si-row"><label>名称</label><input v-model="shape.name" @change="commit" /></div>
          <div class="si-grid2">
            <div class="si-row"><label>X</label><input type="number" v-model.number="shape.x" @change="commit" /></div>
            <div class="si-row"><label>Y</label><input type="number" v-model.number="shape.y" @change="commit" /></div>
            <template v-if="shape.type === 'rect'">
              <div class="si-row"><label>宽</label><input type="number" v-model.number="shape.w" @change="commit" /></div>
              <div class="si-row"><label>高</label><input type="number" v-model.number="shape.h" @change="commit" /></div>
            </template>
            <template v-if="shape.type === 'circle'">
              <div class="si-row"><label>半径</label><input type="number" v-model.number="shape.r" min="0" @change="commit" /></div>
            </template>
            <div class="si-row"><label>旋转</label><input type="number" v-model.number="shape.angle" @change="commit" /></div>
          </div>
        </div>

        <div class="si-sub">Slot</div>
        <div class="si-slot">
          <span class="si-slot-tag grip">抓握</span>
          <span v-if="sprite.grip" class="si-slot-val">
            ({{ sprite.grip.x }}, {{ sprite.grip.y }}) / {{ sprite.grip.angle }}°
          </span>
          <span v-else class="si-slot-val dim">未设置</span>
          <button v-if="sprite.grip" class="si-x" @click="clearSlot('grip')">清除</button>
        </div>
        <div class="si-slot">
          <span class="si-slot-tag cast">施放</span>
          <span v-if="sprite.cast" class="si-slot-val">
            ({{ sprite.cast.x }}, {{ sprite.cast.y }}) / {{ sprite.cast.angle }}°
          </span>
          <span v-else class="si-slot-val dim">未设置</span>
          <button v-if="sprite.cast" class="si-x" @click="clearSlot('cast')">清除</button>
        </div>
      </section>

      <!-- 动作 / 帧 -->
      <section v-if="action" class="si-sec">
        <header class="si-h"><b>动作</b><em>ACTION</em></header>
        <div class="si-row"><label>名称</label><input v-model="action.name" @change="commit" /></div>
        <div class="si-grid2">
          <div class="si-row"><label>FPS</label><input type="number" v-model.number="action.fps" min="1" max="60" @change="commit" /></div>
          <div class="si-row"><label>循环</label>
            <select v-model="action.loop" @change="commit">
              <option :value="true">是</option>
              <option :value="false">否</option>
            </select>
          </div>
        </div>

        <template v-if="frame">
          <div class="si-sub">帧 · {{ action.frames.length }}</div>
          <div class="si-grid2">
            <div class="si-row"><label>帧X</label><input type="number" v-model.number="frame.x" @change="commit" /></div>
            <div class="si-row"><label>帧Y</label><input type="number" v-model.number="frame.y" @change="commit" /></div>
            <div class="si-row"><label>帧宽</label><input type="number" v-model.number="frame.w" min="1" @change="commit" /></div>
            <div class="si-row"><label>帧高</label><input type="number" v-model.number="frame.h" min="1" @change="commit" /></div>
          </div>
          <div class="si-row"><label>帧名</label><input v-model="frame.name" @change="commit" /></div>
          <div class="si-hint">姿态覆盖 {{ Object.keys(frame.pose || {}).length }} 项</div>
        </template>
      </section>

      <!-- 特效 -->
      <section v-if="effect" class="si-sec">
        <header class="si-h"><b>特效</b><em>EFFECT</em></header>
        <div class="si-row"><label>名称</label><input v-model="effect.name" @change="commit" /></div>
        <div class="si-grid2">
          <div class="si-row"><label>FPS</label><input type="number" v-model.number="effect.fps" min="1" max="60" @change="commit" /></div>
          <div class="si-row"><label>循环</label>
            <select v-model="effect.loop" @change="commit">
              <option :value="true">是</option>
              <option :value="false">否</option>
            </select>
          </div>
          <div class="si-row"><label>锚点X</label><input type="number" v-model.number="effect.anchorX" step="0.05" @change="commit" /></div>
          <div class="si-row"><label>锚点Y</label><input type="number" v-model.number="effect.anchorY" step="0.05" @change="commit" /></div>
        </div>
        <div class="si-sub">特效帧 · {{ effect.frames.length }}</div>
        <ul class="si-tree">
          <li v-for="(f, i) in effect.frames" :key="f.id" class="si-node">
            <span class="si-dot green" />
            <span class="si-node-name">{{ i + 1 }}</span>
            <span class="si-node-meta">{{ f.w }}×{{ f.h }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.si-root {
  padding: 0 0 20px;
}
.si-empty {
  padding: 20px;
  color: var(--c-steel-light, #6f828c);
}
.si-sec {
  border-bottom: 1px solid #1d2429;
  padding-bottom: 8px;
}
.si-h {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 8px;
  background: #12181c;
  border-bottom: 1px solid #1d2429;
  position: sticky;
  top: 0;
  z-index: 1;
}
.si-h b {
  font-size: 12px;
  color: var(--c-sand, #c9b085);
}
.si-h em {
  font-style: normal;
  font-size: 9px;
  color: var(--c-steel-light, #6f828c);
}
.si-sub {
  padding: 6px 8px 2px;
  font-size: 10px;
  color: var(--c-ochre, #a8763a);
  letter-spacing: 1px;
}
.si-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
}
.si-row label {
  width: 42px;
  flex: 0 0 42px;
  color: var(--c-bone-dark, #8a8272);
  font-size: 11px;
}
.si-row input,
.si-row select {
  flex: 1;
  min-width: 0;
  background: #12171b;
  border: 1px solid #262e34;
  color: var(--c-bone, #d8cfba);
  font-family: inherit;
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 2px;
}
.si-row input:focus,
.si-row select:focus {
  outline: none;
  border-color: var(--c-neon, #6ff0d0);
}
.si-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.si-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.si-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  cursor: pointer;
}
.si-node:hover {
  background: #141a1f;
}
.si-node.on {
  background: rgba(242, 179, 74, 0.12);
}
.si-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-neon, #6ff0d0);
  flex: 0 0 6px;
}
.si-dot.red {
  background: var(--c-danger, #c8553f);
}
.si-dot.green {
  background: var(--c-toxic-glow, #c6e05a);
}
.si-node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-node-meta {
  font-size: 10px;
  color: var(--c-bone-dark, #8a8272);
}
.si-x {
  background: none;
  border: none;
  color: var(--c-steel-light, #6f828c);
  cursor: pointer;
  font-size: 10px;
  font-family: inherit;
  padding: 1px 3px;
}
.si-x:hover {
  color: var(--c-danger, #c8553f);
}
.si-box {
  margin: 4px 8px;
  padding: 4px 0;
  border: 1px solid #232b31;
  border-radius: 2px;
  background: #10161a;
}
.si-hint {
  padding: 4px 8px;
  font-size: 10px;
  color: var(--c-steel-light, #6f828c);
}
.si-slot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
}
.si-slot-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid;
}
.si-slot-tag.grip {
  color: #ffb03a;
  border-color: #ffb03a;
}
.si-slot-tag.cast {
  color: #8fc4ff;
  border-color: #8fc4ff;
}
.si-slot-val {
  flex: 1;
  font-size: 10px;
}
.si-slot-val.dim {
  color: var(--c-steel-light, #6f828c);
}
.si-hint-inline {
  font-size: 9px;
  color: var(--c-steel-light, #6f828c);
  margin-left: 2px;
}
.si-tpl-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 8px 6px;
}
.si-tpl-btn {
  font-size: 10px;
  padding: 3px 6px;
}
</style>
