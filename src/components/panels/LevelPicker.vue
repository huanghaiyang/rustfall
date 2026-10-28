<script setup>
// =============================================================================
// LevelPicker —— 关卡选择器：按区域列出所有房间，一键跳转用于测试与反馈
// 数据：G.levels（Game.buildLevelIndex 生成）
// 动作：A.jumpToLevel(regionId, roomId)
// =============================================================================
import { computed } from 'vue'
import PanelFrame from './PanelFrame.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'

const emit = defineEmits(['close'])

const KIND_LABEL = { shelter: '庇护所', arena: '竞技场', standard: '标准' }
const KIND_EN = { shelter: 'SHELTER', arena: 'ARENA', standard: 'STANDARD' }

const levels = computed(() => (Array.isArray(G.levels) ? G.levels : []))

const regions = computed(() => {
  const out = []
  const map = new Map()
  for (const lv of levels.value) {
    let r = map.get(lv.regionId)
    if (!r) {
      r = { id: lv.regionId, name: lv.regionName, en: lv.regionEn, rooms: [], themes: 0 }
      map.set(lv.regionId, r)
      out.push(r)
    }
    r.rooms.push(lv)
    if (lv.themeId) r.themes += 1
  }
  return out
})

const activeRegion = computed(() => {
  const id = G.ui.levelRegion || G.regionId
  return regions.value.find((r) => r.id === id) || regions.value[0] || null
})

const rooms = computed(() => (activeRegion.value ? activeRegion.value.rooms : []))

function pickRegion(id) {
  G.ui.levelRegion = id
}
function isCurrent(lv) {
  return lv.regionId === G.regionId && lv.roomId === G.roomId
}
function shortBoss(id) {
  const s = String(id || '')
  return s.startsWith('tb_') ? s.slice(3).replace(/_/g, ' ') : s.replace(/_/g, ' ')
}
function jump(lv) {
  try {
    emit('close')
  } catch (e) {
    /* ignore */
  }
  A.jumpToLevel(lv.regionId, lv.roomId)
}
function onFrameClose() {
  try {
    emit('close')
  } catch (e) {
    /* ignore */
  }
}
</script>

<template>
  <PanelFrame title="关卡选择" subtitle="LEVEL SELECT // TEST" wide tone="neon" @close="onFrameClose">
    <div class="lp">
      <!-- 区域 -->
      <aside class="lp-regions">
        <div class="lp-col-head">
          <b>区域</b><em>REGIONS</em>
          <span class="rp-grow"></span>
          <span class="lp-count">{{ regions.length }}</span>
        </div>
        <button
          v-for="r in regions"
          :key="r.id"
          class="lp-region"
          :class="{ on: activeRegion && activeRegion.id === r.id }"
          type="button"
          @click="pickRegion(r.id)"
        >
          <span class="lp-region-name">{{ r.name }}</span>
          <span class="lp-region-meta">
            <em>{{ r.en }}</em>
            <span>{{ r.rooms.length }} 间<template v-if="r.themes"> · {{ r.themes }} 主题站</template></span>
          </span>
        </button>
      </aside>

      <!-- 房间 -->
      <section class="lp-rooms">
        <div class="lp-col-head">
          <b>{{ activeRegion ? activeRegion.name : '无区域' }}</b>
          <em>{{ activeRegion ? activeRegion.en : '—' }}</em>
          <span class="rp-grow"></span>
          <span class="lp-count">{{ rooms.length }} 关</span>
        </div>

        <div v-if="!levels.length" class="lp-empty">关卡数据尚未生成，请等待世界加载完成。</div>
        <div v-else class="lp-list">
          <button
            v-for="lv in rooms"
            :key="lv.regionId + ':' + lv.roomId"
            class="lp-room"
            :class="{ cur: isCurrent(lv), theme: !!lv.themeId }"
            type="button"
            :title="`${lv.regionName} · ${lv.label}（${lv.roomId}）`"
            @click="jump(lv)"
          >
            <span class="lp-idx">{{ String(lv.index + 1).padStart(3, '0') }}</span>
            <span class="lp-room-main">
              <span class="lp-room-name">{{ lv.label }}</span>
              <span class="lp-room-sub">
                <em>{{ lv.roomId }}</em>
                <span v-if="lv.themeName" class="lp-tag theme">{{ lv.themeName }}</span>
                <span v-if="lv.boss" class="lp-tag boss">BOSS · {{ shortBoss(lv.boss) }}</span>
                <span v-if="lv.landmark" class="lp-tag mark">地标</span>
                <span v-if="isCurrent(lv)" class="lp-tag here">当前</span>
              </span>
            </span>
            <span class="lp-kind" :class="lv.kind">{{ KIND_LABEL[lv.kind] || lv.kind }}<em>{{ KIND_EN[lv.kind] || lv.kind }}</em></span>
            <span class="lp-go">跳转</span>
          </button>
        </div>

        <p class="lp-hint">
          点击任意关卡立即跳转（标题界面会先用当前机体开一局）。主题站关卡含独立 BOSS，庇护所可恢复状态。
        </p>
      </section>
    </div>
  </PanelFrame>
</template>

<style scoped>
.lp {
  display: grid;
  grid-template-columns: 236px 1fr;
  gap: 10px;
  min-height: 380px;
}

.lp-regions {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 8px;
  border-right: 1px solid rgba(58, 68, 75, 0.55);
  max-height: 460px;
  overflow-y: auto;
}

.lp-rooms {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.lp-col-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 0 6px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.55);
  margin-bottom: 5px;
}
.lp-col-head b {
  font-family: var(--font-title);
  font-size: 11.5px;
  font-weight: 400;
  letter-spacing: 0.16em;
  color: var(--c-bone);
}
.lp-col-head em {
  font-style: normal;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.16em;
  color: var(--c-bone-dark);
}
.lp-count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--c-sand);
}

.lp-region {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 7px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-left: 2px solid transparent;
  cursor: pointer;
}
.lp-region:hover {
  background: rgba(111, 240, 208, 0.06);
}
.lp-region.on {
  background: rgba(111, 240, 208, 0.1);
  border-color: rgba(111, 240, 208, 0.35);
  border-left-color: var(--c-neon);
}
.lp-region-name {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--c-paper);
}
.lp-region-meta {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 8px;
  letter-spacing: 0.08em;
  color: var(--c-bone-dark);
}
.lp-region-meta em {
  font-style: normal;
  font-family: var(--font-mono);
  opacity: 0.7;
}

.lp-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
}

.lp-room {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 7px;
  text-align: left;
  background: rgba(10, 13, 15, 0.5);
  border: 1px solid rgba(58, 68, 75, 0.6);
  cursor: pointer;
}
.lp-room:hover {
  border-color: rgba(111, 240, 208, 0.6);
  background: rgba(111, 240, 208, 0.08);
}
.lp-room.cur {
  border-color: rgba(192, 112, 56, 0.85);
  background: rgba(192, 112, 56, 0.12);
}

.lp-idx {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--c-bone-dark);
}

.lp-room-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}
.lp-room-name {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--c-paper);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lp-room-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 7.5px;
}
.lp-room-sub em {
  font-style: normal;
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
  color: var(--c-bone-dark);
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-tag {
  flex: 0 0 auto;
  padding: 0 4px;
  font-size: 7px;
  letter-spacing: 0.06em;
  border: 1px solid rgba(58, 68, 75, 0.9);
  color: var(--c-bone-dark);
}
.lp-tag.theme {
  color: var(--c-neon);
  border-color: rgba(111, 240, 208, 0.4);
}
.lp-tag.boss {
  color: var(--c-neon-red);
  border-color: rgba(255, 86, 68, 0.45);
}
.lp-tag.mark {
  color: var(--c-sand);
}
.lp-tag.here {
  color: #0b0d0e;
  background: var(--c-rust-light);
  border-color: var(--c-rust-light);
}

.lp-kind {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-size: 8px;
  letter-spacing: 0.08em;
  color: var(--c-bone-dark);
}
.lp-kind em {
  font-style: normal;
  font-family: var(--font-mono);
  font-size: 6.5px;
  opacity: 0.65;
}
.lp-kind.shelter {
  color: var(--c-toxic-glow);
}
.lp-kind.arena {
  color: var(--c-sand);
}

.lp-go {
  flex: 0 0 auto;
  padding: 3px 8px;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--c-sand);
  border: 1px solid rgba(192, 112, 56, 0.6);
}
.lp-room:hover .lp-go {
  color: #0b0d0e;
  background: var(--c-rust-light);
  border-color: var(--c-rust-light);
}

.lp-empty {
  padding: 24px 8px;
  font-size: 10px;
  color: var(--c-bone-dark);
}

.lp-hint {
  margin: 6px 0 0;
  font-size: 8.5px;
  line-height: 1.65;
  letter-spacing: 0.05em;
  color: var(--c-bone-dark);
}

@media (max-width: 760px) {
  .lp {
    grid-template-columns: 1fr;
  }
  .lp-regions {
    max-height: 150px;
    border-right: 0;
    border-bottom: 1px solid rgba(58, 68, 75, 0.55);
    padding-right: 0;
  }
  .lp-kind {
    display: none;
  }
}
</style>
