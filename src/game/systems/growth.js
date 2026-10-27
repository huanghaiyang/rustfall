// 成长系统：经验、等级、属性点、里程碑与加点后的属性换算。
// 只依赖 G（响应式状态），不反向依赖 Game，避免循环引用。
import { G, notify, toast } from '../state.js'

// 可加点属性。每人每级获得 1 点，每项最多 5 级。
export const PERKS = [
  { key: 'hull', name: '结构强化', desc: '最大生命 +10', max: 5, icon: 'HULL' },
  { key: 'power', name: '火力回路', desc: '攻击 +2', max: 5, icon: 'PWR' },
  { key: 'servo', name: '伺服马达', desc: '移动速度 +3.5%', max: 5, icon: 'SPD' },
  { key: 'armor', name: '复合装甲', desc: '伤害减免 +2%', max: 5, icon: 'ARM' },
  { key: 'cargo', name: '负重框架', desc: '负重上限 +6%', max: 5, icon: 'CRG' },
  { key: 'optics', name: '光学扫描', desc: '挖掘/扫描效率 +6%', max: 5, icon: 'OPT' },
]

// 等级里程碑：到达等级自动获得，不消耗属性点。
export const MILESTONES = [
  { level: 3, key: 'armor', value: 0.04, label: '强化骨架：伤害减免 +4%' },
  { level: 5, key: 'attack', value: 1, label: '战斗核心：攻击 +1' },
  { level: 7, key: 'hp', value: 10, label: '冗余电池：最大生命 +10' },
  { level: 9, key: 'speed', value: 0.05, label: '轻量关节：移动速度 +5%' },
  { level: 12, key: 'carry', value: 0.1, label: '外骨骼挂架：负重 +10%' },
  { level: 15, key: 'dig', value: 0.1, label: '工业钻头：挖掘效率 +10%' },
]

const MAX_PERK_RANK = 5

/** 每一级升级所需经验（指数缓增，避免后期过快） */
export function xpForLevel(level) {
  return Math.round(45 * Math.pow(1.3, Math.max(0, level - 1)))
}

/** 补齐旧存档缺失字段 */
export function initGrowth() {
  const g = G.growth || (G.growth = {})
  if (typeof g.level !== 'number') g.level = 1
  if (typeof g.xp !== 'number') g.xp = 0
  if (typeof g.totalXp !== 'number') g.totalXp = g.xp || 0
  if (typeof g.points !== 'number') g.points = 0
  if (typeof g.levelsGained !== 'number') g.levelsGained = 0
  if (!g.perks || typeof g.perks !== 'object') g.perks = {}
  for (const p of PERKS) {
    if (typeof g.perks[p.key] !== 'number') g.perks[p.key] = 0
  }
  if (typeof g.xpNext !== 'number' || g.xpNext <= 0) g.xpNext = xpForLevel(g.level)
  return g
}

/**
 * 增加经验。可一次性跨多级。
 * @returns {{levels:number, points:number}}
 */
export function addXp(amount, reason = '') {
  const g = initGrowth()
  const n = Math.max(0, Math.round(amount || 0))
  if (!n) return { levels: 0, points: 0 }
  g.xp += n
  g.totalXp += n
  let levels = 0
  let points = 0
  while (g.xp >= g.xpNext) {
    g.xp -= g.xpNext
    g.level += 1
    levels += 1
    const gain = g.level % 5 === 0 ? 2 : 1
    g.points += gain
    points += gain
    g.xpNext = xpForLevel(g.level)
    // 升级回馈：少量修复与能量
    G.hp = Math.min(G.hpMax, G.hp + Math.round(G.hpMax * 0.15))
    G.energy = Math.min(G.energyMax, G.energy + 30)
  }
  if (levels > 0) {
    g.levelsGained += levels
    notify(`等级提升至 Lv.${g.level}　获得 ${points} 点成长点（按 G 打开成长面板）`, 'good', 5)
    toast(`LEVEL UP　Lv.${g.level}`, 'good', 3)
  }
  return { levels, points }
}

/** 花费 1 点成长点提升某项属性 */
export function spendGrowth(key) {
  const g = initGrowth()
  const perk = PERKS.find((p) => p.key === key)
  if (!perk) return { ok: false, reason: 'unknown' }
  if (g.points <= 0) {
    toast('没有可用的成长点，去击杀敌人或探索地图', 'warn', 2.4)
    return { ok: false, reason: 'points' }
  }
  const rank = g.perks[key] || 0
  if (rank >= MAX_PERK_RANK) {
    toast(`${perk.name} 已达到上限`, 'info', 2)
    return { ok: false, reason: 'max' }
  }
  g.points -= 1
  g.perks[key] = rank + 1
  toast(`${perk.name} 提升至 ${rank + 1} 级`, 'good', 2)
  return { ok: true, rank: rank + 1 }
}

/** 把等级/加点换算成合并到机体属性上的加成（与装备加成叠加） */
export function growthTotals() {
  const g = initGrowth()
  const p = g.perks || {}
  const out = {
    hp: (p.hull || 0) * 10,
    attack: (p.power || 0) * 2,
    speed: (p.servo || 0) * 0.035,
    armor: (p.armor || 0) * 0.02,
    carry: (p.cargo || 0) * 0.06,
    dig: (p.optics || 0) * 0.06,
  }
  for (const m of MILESTONES) {
    if (g.level >= m.level) out[m.key] = (out[m.key] || 0) + m.value
  }
  return out
}

/** 生成成长面板用的只读摘要 */
export function growthSummary() {
  const g = initGrowth()
  return {
    level: g.level,
    xp: g.xp,
    xpNext: g.xpNext,
    points: g.points,
    totalXp: g.totalXp,
    perks: PERKS.map((p) => ({ ...p, rank: g.perks[p.key] || 0, maxed: (g.perks[p.key] || 0) >= p.max })),
    milestones: MILESTONES.map((m) => ({ ...m, unlocked: g.level >= m.level })),
  }
}
