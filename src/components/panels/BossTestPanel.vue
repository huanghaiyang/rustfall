<script setup>
// =============================================================================
// BossTestPanel —— BOSS 测试房选项卡
// 51 只站点 BOSS 各有一间专属试炼场（主题场景 + 高低落差地形）。
// 数据：world/boss-test.js（BOSS_TESTS）+ theme-bosses.js（THEME_BOSS_DEFS）
// 动作：A.startBossTest(bossId)
// =============================================================================
import { computed, ref } from 'vue'
import PanelFrame from './PanelFrame.vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { BOSS_TESTS } from '../../game/world/boss-test.js'
import { THEME_BOSS_DEFS } from '../../game/entities/monsters/large/theme-bosses.js'
import { vfxForMove } from '../../game/render/art/boss-vfx.js'

const emit = defineEmits(['close'])
const keyword = ref('')

const BOSS_BY_ID = new Map(THEME_BOSS_DEFS.map((d) => [d.id, d]))
const base = (import.meta.env && import.meta.env.BASE_URL) || '/'

const rows = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return BOSS_TESTS.map((t, i) => {
    const def = BOSS_BY_ID.get(t.bossId) || {}
    return {
      ...t,
      index: i,
      bossName: def.name || t.name,
      bossEn: def.en || t.en,
      family: def.family || 'mutant',
      hp: def.hp || 0,
      damage: def.damage || 0,
      desc: def.desc || '',
      moves: (def.moves || []).map((id) => ({ id, vfx: vfxForMove(id) })),
      img: `${base.endsWith('/') ? base : base + '/'}sprites/boss/${t.bossId}.png`,
    }
  }).filter((t) => {
    if (!kw) return true
    return (
      t.bossName.toLowerCase().includes(kw) ||
      t.name.toLowerCase().includes(kw) ||
      t.themeId.toLowerCase().includes(kw) ||
      t.bossId.toLowerCase().includes(kw) ||
      t.family.toLowerCase().includes(kw)
    )
  })
})

function shortId(id) {
  return String(id || '').replace(/^tb_/, '').replace(/_/g, ' ')
}
function enter(t) {
  try {
    emit('close')
  } catch (e) {
    /* ignore */
  }
  A.startBossTest(t.bossId)
}
function onFrameClose() {
  try {
    emit('close')
  } catch (e) {
    /* ignore */
  }
}
function isCurrent(t) {
  return G.regionId === 'boss_test' && G.roomId === t.bossId
}
function onImgError(e) {
  const el = e?.target
  if (el) el.style.visibility = 'hidden'
}
</script>

<template>
  <PanelFrame title="BOSS 测试房" subtitle="BOSS TEST CHAMBER // 51 ARENAS" wide tone="neon" @close="onFrameClose">
    <div class="bt">
      <div class="bt-head">
        <div class="bt-title">
          <b>选择站点 BOSS</b>
          <em>SELECT BOSS</em>
          <span class="rp-grow"></span>
          <span class="bt-count">{{ rows.length }} / {{ BOSS_TESTS.length }}</span>
        </div>
        <input v-model="keyword" class="bt-search" type="text" placeholder="搜索 BOSS / 站点 / 族群…" />
      </div>

      <p class="bt-hint">
        每只 BOSS 一间专属试炼场：沿用该站点的场景与配色，地形带左右高台、中场深坑与三级单向平台，门窗封闭，进入即满状态。
        招式特效按现有技能自动匹配。
      </p>

      <div class="bt-grid">
        <button
          v-for="t in rows"
          :key="t.bossId"
          class="bt-card"
          :class="{ cur: isCurrent(t) }"
          type="button"
          :title="`${t.bossName}（${t.bossId}）· ${t.name}`"
          @click="enter(t)"
        >
          <span class="bt-portrait">
            <img :src="t.img" :alt="t.bossName" loading="lazy" @error="onImgError" />
            <span class="bt-portrait-fx" :style="{ background: t.accent }"></span>
          </span>
          <span class="bt-main">
            <span class="bt-row1">
              <span class="bt-name">{{ t.bossName }}</span>
              <span class="bt-index">{{ String(t.index + 1).padStart(2, '0') }}</span>
            </span>
            <span class="bt-row2">
              <em class="bt-en">{{ t.bossEn }}</em>
              <span class="bt-theme">{{ t.name }}</span>
            </span>
            <span class="bt-meta">
              <span class="bt-tag fam">{{ t.family }}</span>
              <span class="bt-tag">{{ t.hp }} HP</span>
              <span class="bt-tag">{{ t.damage }} DMG</span>
            </span>
            <span class="bt-moves">
              <span v-for="mv in t.moves" :key="mv.id" class="bt-move" :title="`${mv.id} → ${mv.vfx}`">
                {{ mv.id }}<i>{{ mv.vfx }}</i>
              </span>
            </span>
            <span class="bt-desc">{{ t.desc }}</span>
          </span>
          <span class="bt-go">{{ isCurrent(t) ? '测试中' : '进入' }}</span>
        </button>
      </div>

      <div v-if="!rows.length" class="bt-empty">没有匹配的 BOSS，换个关键词试试。</div>
    </div>
  </PanelFrame>
</template>

<style scoped>
.bt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 420px;
}
.bt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(58, 68, 75, 0.55);
  padding-bottom: 6px;
}
.bt-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex: 1 1 auto;
}
.bt-title b {
  font-family: var(--font-title);
  font-size: 11.5px;
  font-weight: 400;
  letter-spacing: 0.16em;
  color: var(--c-bone);
}
.bt-title em {
  font-style: normal;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.16em;
  color: var(--c-bone-dark);
}
.bt-count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--c-sand);
}
.bt-search {
  width: 220px;
  padding: 5px 8px;
  background: rgba(8, 11, 13, 0.8);
  border: 1px solid rgba(58, 68, 75, 0.7);
  color: var(--c-paper);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  outline: none;
}
.bt-search:focus {
  border-color: var(--c-neon);
}
.bt-hint {
  margin: 0;
  font-size: 8.5px;
  line-height: 1.7;
  color: var(--c-bone-dark);
  letter-spacing: 0.06em;
}
.bt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  max-height: 430px;
  overflow-y: auto;
  padding-right: 4px;
}
.bt-card {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 6px;
  text-align: left;
  background: rgba(10, 13, 15, 0.6);
  border: 1px solid rgba(58, 68, 75, 0.6);
  border-left: 2px solid rgba(58, 68, 75, 0.8);
  cursor: pointer;
  min-width: 0;
}
.bt-card:hover {
  border-color: rgba(111, 240, 208, 0.65);
  border-left-color: var(--c-neon);
  background: rgba(111, 240, 208, 0.08);
}
.bt-card.cur {
  border-color: rgba(192, 112, 56, 0.9);
  border-left-color: var(--c-rust);
  background: rgba(192, 112, 56, 0.12);
}
.bt-portrait {
  position: relative;
  flex: 0 0 54px;
  height: 68px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(5, 7, 8, 0.8);
  border: 1px solid rgba(58, 68, 75, 0.5);
  overflow: hidden;
}
.bt-portrait img {
  max-width: 100%;
  max-height: 66px;
  image-rendering: pixelated;
}
.bt-portrait-fx {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  opacity: 0.85;
}
.bt-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.bt-row1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.bt-name {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--c-paper);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bt-index {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--c-bone-dark);
}
.bt-row2 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 8px;
}
.bt-en {
  font-style: normal;
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--c-bone-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bt-theme {
  color: var(--c-sand);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bt-meta {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.bt-tag {
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.06em;
  color: var(--c-bone-dark);
  border: 1px solid rgba(58, 68, 75, 0.6);
  padding: 0 3px;
}
.bt-tag.fam {
  color: var(--c-neon);
  border-color: rgba(111, 240, 208, 0.3);
}
.bt-moves {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.bt-move {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.03em;
  color: var(--c-bone);
  background: rgba(58, 68, 75, 0.25);
  padding: 0 3px;
  white-space: nowrap;
}
.bt-move i {
  font-style: normal;
  color: var(--c-rust);
  opacity: 0.9;
}
.bt-desc {
  font-size: 8px;
  line-height: 1.55;
  color: var(--c-bone-dark);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bt-go {
  flex: 0 0 auto;
  align-self: center;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.08em;
  color: var(--c-neon);
  border: 1px solid rgba(111, 240, 208, 0.35);
  padding: 3px 5px;
}
.bt-card.cur .bt-go {
  color: var(--c-rust);
  border-color: rgba(192, 112, 56, 0.6);
}
.bt-empty {
  padding: 24px;
  text-align: center;
  font-size: 10px;
  color: var(--c-bone-dark);
}
</style>
