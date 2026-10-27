<script setup>
// 成长面板：等级 / 经验 / 属性点分配 / 里程碑。
import { computed } from 'vue'
import { G } from '../../game/state.js'
import { A } from '../../game/ui-actions.js'
import { growthSummary } from '../../game/systems/growth.js'
import PanelFrame from './PanelFrame.vue'

const s = computed(() => growthSummary())
const pct = computed(() => {
  const g = s.value
  return Math.max(0, Math.min(100, Math.round((g.xp / Math.max(1, g.xpNext)) * 100)))
})
function spend(key) {
  try {
    A.spendGrowth(key)
  } catch (e) {
    /* ignore */
  }
}
</script>

<template>
  <PanelFrame title="成长" subtitle="PROGRESSION / CORE EVOLUTION" wide>
    <div class="grow">
      <section class="g-head">
        <div class="g-level">
          <span class="lv">LV</span>
          <b class="num">{{ s.level }}</b>
        </div>
        <div class="g-xp">
          <div class="row">
            <span>经验</span>
            <span class="dim">{{ s.xp }} / {{ s.xpNext }} · 累计 {{ s.totalXp }}</span>
          </div>
          <div class="rp-bar">
            <i class="neon" :style="{ width: pct + '%' }" />
          </div>
          <div class="row foot">
            <span class="rp-small rp-dim">击杀、拾取、探索地图与发现彩蛋都会获得经验</span>
            <span class="pts" :class="{ has: s.points > 0 }">成长点 {{ s.points }}</span>
          </div>
        </div>
      </section>

      <section class="g-perks">
        <h3>核心强化 <em>CORE UPGRADES</em></h3>
        <div class="perk-grid">
          <button
            v-for="p in s.perks"
            :key="p.key"
            class="perk"
            type="button"
            :disabled="s.points <= 0 || p.maxed"
            :title="p.maxed ? '已满级' : p.desc + '（消耗 1 成长点）'"
            @click="spend(p.key)"
          >
            <span class="pk-icon">{{ p.icon }}</span>
            <span class="pk-body">
              <span class="pk-name">{{ p.name }}</span>
              <span class="pk-desc">{{ p.desc }}</span>
              <span class="pk-rank">
                <i v-for="n in p.max" :key="n" :class="{ on: n <= p.rank }" />
                <em>{{ p.rank }}/{{ p.max }}</em>
              </span>
            </span>
            <span class="pk-add" :class="{ ready: s.points > 0 && !p.maxed }">＋</span>
          </button>
        </div>
      </section>

      <section class="g-miles">
        <h3>里程碑 <em>MILESTONES</em></h3>
        <ul>
          <li v-for="m in s.milestones" :key="m.level" :class="{ on: m.unlocked }">
            <span class="m-lv">Lv.{{ m.level }}</span>
            <span class="m-label">{{ m.label }}</span>
            <span class="m-state">{{ m.unlocked ? '已解锁' : '未解锁' }}</span>
          </li>
        </ul>
      </section>
    </div>
  </PanelFrame>
</template>

<style scoped>
.grow {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}
.g-head {
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid var(--c-steel-light, #6f828c);
  background: rgba(10, 16, 18, 0.5);
}
.g-level {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--c-neon, #6ff0d0);
}
.g-level .lv {
  font-size: 12px;
  letter-spacing: 2px;
  opacity: 0.7;
}
.g-level .num {
  font-size: 42px;
  line-height: 1;
  text-shadow: 0 0 12px rgba(111, 240, 208, 0.45);
}
.g-xp {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.g-xp .row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--c-bone, #d8cfba);
}
.g-xp .foot {
  align-items: center;
}
.pts {
  color: var(--c-bone-dark, #8a8272);
  border: 1px solid currentColor;
  padding: 1px 8px;
  border-radius: 2px;
  font-size: 11px;
}
.pts.has {
  color: var(--c-neon, #6ff0d0);
  box-shadow: 0 0 10px rgba(111, 240, 208, 0.25);
}
h3 {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--c-sand, #c9b085);
}
h3 em {
  font-style: normal;
  font-size: 10px;
  opacity: 0.55;
  margin-left: 6px;
}
.perk-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.perk {
  display: flex;
  gap: 10px;
  align-items: center;
  text-align: left;
  padding: 10px 12px;
  background: rgba(20, 28, 30, 0.66);
  border: 1px solid var(--c-steel, #3a444b);
  color: var(--c-bone, #d8cfba);
  cursor: pointer;
  font: inherit;
  transition: border-color 0.15s, background 0.15s;
}
.perk:hover:not(:disabled) {
  border-color: var(--c-neon, #6ff0d0);
  background: rgba(30, 48, 48, 0.7);
}
.perk:disabled {
  opacity: 0.55;
  cursor: default;
}
.pk-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--c-steel-light, #6f828c);
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--c-oxide, #9ac84a);
}
.pk-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pk-name {
  font-size: 13px;
  color: var(--c-sand, #c9b085);
}
.pk-desc {
  font-size: 11px;
  color: var(--c-bone-dark, #8a8272);
}
.pk-rank {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 3px;
}
.pk-rank i {
  width: 14px;
  height: 4px;
  background: var(--c-steel, #3a444b);
}
.pk-rank i.on {
  background: var(--c-neon, #6ff0d0);
  box-shadow: 0 0 6px rgba(111, 240, 208, 0.5);
}
.pk-rank em {
  margin-left: 4px;
  font-style: normal;
  font-size: 10px;
  opacity: 0.6;
}
.pk-add {
  font-size: 18px;
  color: var(--c-steel-light, #6f828c);
}
.pk-add.ready {
  color: var(--c-neon, #6ff0d0);
}
.g-miles ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.g-miles li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px dashed var(--c-steel, #3a444b);
  font-size: 12px;
  color: var(--c-bone-dark, #8a8272);
}
.g-miles li.on {
  color: var(--c-bone, #d8cfba);
  border-style: solid;
  border-color: var(--c-oxide, #9ac84a);
}
.m-lv {
  color: var(--c-sand, #c9b085);
}
.m-label {
  flex: 1;
}
.m-state {
  font-size: 10px;
  opacity: 0.7;
}
</style>
