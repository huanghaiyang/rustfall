import { Content, KIND } from '../core/registry.js'
import { CHASSIS_START_UNLOCKED, DEFAULT_CHASSIS } from '../config.js'

/** 八台可选机体：参考宇树 / 智元 / 特斯拉 / 波士顿动力的形态语言 */
const DEFS = [
  {
    id: 'unit7',
    name: 'UNIT-7 游侠',
    en: 'RANGER',
    family: 'biped',
    maker: '宇树',
    desc: '双足人形，关节包着废布。平衡性最好，跑跳都稳。',
    lore: '出厂铭牌被磨掉了，只剩一个「7」。它曾属于一支城市巡逻队，现在巡逻队只剩它。',
    hp: 100,
    speed: 1.0,
    jump: 1.0,
    dig: 1.0,
    carry: 1.0,
    attack: 12,
    energyMax: 100,
    hitbox: [22, 32],
    abilities: [],
    color: 0xb0713a,
    artId: 'unit7',
  },
  {
    id: 'tesla',
    name: 'TESLA-9 拾荒者',
    en: 'SCAVENGER',
    family: 'wheel',
    maker: '特斯拉',
    desc: '上半身是光滑的白壳人形，下半身换成了两轮底盘。跑得最快，跳得最矮。',
    lore: '它的底盘原本属于一辆送货车。改造它的人说：轮子比腿省电，腿比轮子值钱。',
    hp: 88,
    speed: 1.24,
    jump: 0.8,
    dig: 0.9,
    carry: 1.1,
    attack: 10,
    energyMax: 110,
    hitbox: [24, 30],
    abilities: ['fastSwim'],
    color: 0xc9c4b6,
    artId: 'tesla',
  },
  {
    id: 'agibot',
    name: 'AGI-X 搬运工',
    en: 'PORTER',
    family: 'track',
    maker: '智元',
    desc: '轮足混合底盘，背着两排货架。能扛，也能装。',
    lore: '货架上还留着编号：A-03-17。它至今记得那条路线，只是仓库已经不在了。',
    hp: 122,
    speed: 0.9,
    jump: 0.92,
    dig: 1.16,
    carry: 1.38,
    attack: 14,
    energyMax: 120,
    hitbox: [26, 34],
    abilities: ['carryBoost'],
    color: 0x8f9a9e,
    artId: 'agibot',
  },
  {
    id: 'atlas',
    name: 'ATLAS-2 施工者',
    en: 'BUILDER',
    family: 'arm',
    maker: '波士顿动力',
    desc: '重工业机身，右臂是液压破拆臂。挖得快，走得慢。',
    lore: '它拆过十七栋楼。最后一栋是它自己住的。',
    hp: 118,
    speed: 0.92,
    jump: 0.94,
    dig: 1.45,
    carry: 1.2,
    attack: 18,
    energyMax: 110,
    hitbox: [24, 34],
    abilities: ['digBoost'],
    color: 0xd08334,
    artId: 'atlas',
  },
  {
    id: 'spider',
    name: 'SPIDER-3 勘探者',
    en: 'SURVEYOR',
    family: 'quad',
    maker: '自研',
    desc: '四足，像一条被拆了半截的机器狗。能二段跳，能扒着墙往上爬。',
    lore: '勘探队的最后一条狗。它的日志里全是岩层编号，最后一页画着一朵花。',
    hp: 95,
    speed: 1.06,
    jump: 1.14,
    dig: 1.0,
    carry: 1.0,
    attack: 11,
    energyMax: 100,
    hitbox: [24, 28],
    abilities: ['doubleJump', 'wallClimb'],
    color: 0x6f828c,
    artId: 'spider',
  },
  {
    id: 'mule',
    name: 'MULE-1 信使',
    en: 'COURIER',
    family: 'light',
    maker: '自研',
    desc: '轻量信使机，细腿、大背包、天线。背得多，但一碰就散。',
    lore: '它的邮包夹层里有一封没送出去的信，收件地址已经被酸雨泡烂了。',
    hp: 78,
    speed: 1.12,
    jump: 1.1,
    dig: 0.86,
    carry: 1.52,
    attack: 9,
    energyMax: 120,
    hitbox: [20, 32],
    abilities: ['doubleJump'],
    color: 0xc07038,
    artId: 'mule',
  },
  {
    id: 'ghost',
    name: 'GHOST-0 侦察',
    en: 'GHOST',
    family: 'light',
    maker: '自研',
    desc: '潜行侦察机型，外壳覆着破布与吸光涂层。夜视、抗辐射。',
    lore: '没人见过它的完整轮廓。有人说它属于一支早已解散的信标维修队。',
    hp: 84,
    speed: 1.08,
    jump: 1.06,
    dig: 0.8,
    carry: 0.85,
    attack: 10,
    energyMax: 130,
    hitbox: [20, 32],
    abilities: ['nightVision', 'radShield'],
    color: 0x3a444b,
    artId: 'ghost',
  },
  {
    id: 'hulk',
    name: 'HULK-6 破拆',
    en: 'BREAKER',
    family: 'track',
    maker: '军用剩余物资',
    desc: '军用破拆残骸，正面装甲厚得离谱。慢，但很难杀死。',
    lore: '车体上还留着军队编号和一排弹孔。启动音是一段已经走调的军号。',
    hp: 165,
    speed: 0.82,
    jump: 0.84,
    dig: 1.3,
    carry: 1.45,
    attack: 22,
    energyMax: 140,
    hitbox: [28, 36],
    abilities: ['radShield'],
    color: 0x6a5a48,
    artId: 'hulk',
  },
  {
    id: 'warden',
    name: 'WARDEN-4 镇暴',
    en: 'SENTINEL',
    family: 'track',
    maker: '城防剩余物资',
    desc: '城防部队的镇暴机体，左臂焊着一面破盾牌，肩头挂着警报灯。硬，且不好惹。',
    lore: '盾牌内侧刻着一串居民编号，那是它当年被要求「驱离」的人群。它守到现在。',
    hp: 150,
    speed: 0.88,
    jump: 0.9,
    dig: 1.12,
    carry: 1.3,
    attack: 20,
    energyMax: 125,
    hitbox: [27, 36],
    abilities: ['radShield'],
    color: 0x4a5b74,
    artId: 'warden',
  },
  {
    id: 'hopper',
    name: 'HOPPER-2 跃迁',
    en: 'SPRINGER',
    family: 'light',
    maker: '自研',
    desc: '单弹簧腿加侧稳定轮，弹跳力惊人，落地轻得像没重量。跳得最高，扛不动重物。',
    lore: '原本是游乐园里的弹跳表演机。表演停了，它还在原地往返地跳。',
    hp: 86,
    speed: 1.18,
    jump: 1.3,
    dig: 0.82,
    carry: 0.95,
    attack: 10,
    energyMax: 115,
    hitbox: [21, 33],
    abilities: ['doubleJump'],
    color: 0x6a8f5e,
    artId: 'hopper',
  },
]

for (const def of DEFS) {
  Content.register(KIND.CHASSIS, def.id, def, 'core')
}

export const CHASSIS_IDS = DEFS.map((d) => d.id)

export function getChassis(id) {
  return Content.get(KIND.CHASSIS, id)
}

export function allChassis() {
  return Content.all(KIND.CHASSIS)
}

export function isUnlocked(chassisId, unlockedList = CHASSIS_START_UNLOCKED) {
  const def = getChassis(chassisId)
  if (!def) return false
  return def.unlocked !== false || unlockedList.includes(chassisId) || CHASSIS_START_UNLOCKED.includes(chassisId)
}

/** 基础属性 + 已安装组件加成 */
export function computeStats(chassisId, equipped = {}, bonusTotals = null) {
  const def = getChassis(chassisId) || getChassis(DEFAULT_CHASSIS)
  const bonus = bonusTotals || {}
  const hp = Math.round((def.hp || 100) + (bonus.hp || 0))
  const speed = (def.speed || 1) * (1 + (bonus.speed || 0))
  const jump = (def.jump || 1) * (1 + (bonus.jump || 0))
  const dig = (def.dig || 1) * (1 + (bonus.dig || 0))
  const carry = (def.carry || 1) * (1 + (bonus.carry || 0))
  const attack = Math.round((def.attack || 10) * (1 + (bonus.attack || 0)))
  const armor = Math.min(0.7, bonus.armor || 0)
  const energyMax = Math.round((def.energyMax || 100) + (bonus.energyMax || 0))
  const regen = bonus.energyRegen || 0
  return { hp, speed, jump, dig, carry, attack, armor, energyMax, regen, abilities: def.abilities || [] }
}
