// 全局可调参数：世界单位 = 像素，1 格 = 32
export const TS = 32
export const VIEW_H = 540

// —— 酸雨循环 ——
export const CYCLE_TIME = 300 // 一个酸雨循环的总时长（秒）
export const RAIN_WARN = 55 // 剩余多少秒进入“酸雨将至”警告
export const RAIN_KILL_TIME = 5 // 酸雨中暴露多久致死
export const STORM_SMOKE = 0.85

// —— 资源 ——
export const NEED_POWER = 3 // 待机所需电量格
export const MAX_POWER = 8
export const MAX_SIGNAL = 5
export const START_SIGNAL = 2
export const ENERGY_MAX = 100

// —— 背包 ——
export const INVENTORY_SLOTS = 24
export const BASE_CARRY_WEIGHT = 42

// —— 机身 ——
export const DEFAULT_CHASSIS = 'unit7'
export const CHASSIS_SWITCH_CD = 1.4
export const CHASSIS_SWITCH_COST = 1
export const CHASSIS_START_UNLOCKED = ['unit7', 'tesla', 'agibot', 'atlas']

// —— 战斗 / 工具 ——
export const ATTACK_CD = 0.42
export const ATTACK_RANGE = 52
export const ATTACK_ARC = 0.9
export const TOOL_DAMAGE = { shovel: 9, pickaxe: 17, welder: 7, scanner: 4 }
export const TOOL_DIG = { shovel: 1, pickaxe: 1.2, welder: 0, scanner: 0 }
export const INTERACT_RANGE = 62
export const LOOT_PICKUP_RANGE = 34

// —— 天气 / 氛围 ——
export const SMOKE_BASE = 0.18
export const ASH_RATE = 0.35
export const TOXIC_DPS = 6

// —— 物理（机体倍率会乘在这些基准上）——
export const PLAYER = {
  w: 22,
  h: 32,
  crouchH: 20,
  walk: 232,
  crouchWalk: 108,
  accel: 2400,
  airAccel: 1500,
  friction: 3000,
  gravity: 2050,
  maxFall: 980,
  jump: 660,
  jumpCut: 0.42,
  coyote: 0.1,
  buffer: 0.13,
  swimSpeed: 150,
  swimUp: 170,
  climb: 132,
  hurtInvuln: 0.75,
}

// —— 旧版兼容键（过渡期，勿在新代码使用）——
export const NEED_FOOD = 3
export const MAX_FOOD = 6
export const MAX_KARMA = 5
export const PLAYER_START_KARMA = 2
export const LIZARD = {
  patrolSpeed: 42,
  chaseSpeed: 96,
  lungeSpeed: 268,
  sense: 300,
  senseCrouch: 96,
  lungeRange: 132,
  lungeWindup: 0.42,
  lungeTime: 0.34,
  recover: 1.1,
  segments: 14,
  segSpacing: 8.5,
  radius: 14,
}

export const SAVE_KEY = 'rustfall.save.v1'
export const SETTINGS_KEY = 'rustfall.settings.v1'

// ============================================================
// 日夜 / 天气 / 战斗 / 输入（v3）
// ============================================================
export const DAY_LENGTH = CYCLE_TIME // 一个循环 = 一整天
export const DAY_PARTS = [
  { id: 'dawn', label: '黎明', t: 0.0, amb: 0.34, tint: [0.72, 0.52, 0.38] },
  { id: 'morning', label: '清晨', t: 0.12, amb: 0.62, tint: [0.86, 0.76, 0.62] },
  { id: 'noon', label: '正午', t: 0.32, amb: 0.92, tint: [1.0, 0.95, 0.84] },
  { id: 'afternoon', label: '午后', t: 0.55, amb: 0.78, tint: [0.96, 0.84, 0.66] },
  { id: 'dusk', label: '黄昏', t: 0.72, amb: 0.46, tint: [0.92, 0.56, 0.34] },
  { id: 'night', label: '夜晚', t: 0.84, amb: 0.16, tint: [0.36, 0.42, 0.62] },
]

// 天气：权重按生态，持续秒数，对能见度/移动/腐蚀的影响
export const WEATHERS = {
  clear: { id: 'clear', label: '晴', en: 'CLEAR', weight: 30, min: 55, max: 95, fog: 0.0, wind: 0.1, rain: 0, acid: 0, darken: 0 },
  overcast: { id: 'overcast', label: '阴', en: 'OVERCAST', weight: 22, min: 45, max: 80, fog: 0.08, wind: 0.22, rain: 0, acid: 0, darken: 0.06 },
  ashfall: { id: 'ashfall', label: '落灰', en: 'ASHFALL', weight: 16, min: 40, max: 70, fog: 0.22, wind: 0.3, rain: 0, acid: 0, darken: 0.12 },
  duststorm: { id: 'duststorm', label: '沙暴', en: 'DUST STORM', weight: 12, min: 30, max: 55, fog: 0.48, wind: 0.85, rain: 0, acid: 0, darken: 0.18, speed: 0.86 },
  acidrain: { id: 'acidrain', label: '酸雨', en: 'ACID RAIN', weight: 14, min: 35, max: 60, fog: 0.3, wind: 0.4, rain: 1, acid: 1, darken: 0.24 },
  toxicfog: { id: 'toxicfog', label: '毒雾', en: 'TOXIC FOG', weight: 8, min: 35, max: 65, fog: 0.6, wind: 0.05, rain: 0, acid: 0.25, darken: 0.2, toxic: 2 },
  radstorm: { id: 'radstorm', label: '辐射风暴', en: 'RAD STORM', weight: 6, min: 30, max: 50, fog: 0.4, wind: 0.6, rain: 0.4, acid: 0.4, darken: 0.3, toxic: 1, lightning: 0.8 },
}
export const WEATHER_IDS = Object.keys(WEATHERS)
export const WEATHER_BY_BIOME = {
  city: { clear: 40, overcast: 26, ashfall: 18, duststorm: 8, acidrain: 14, toxicfog: 6, radstorm: 4 },
  village: { clear: 52, overcast: 24, ashfall: 14, duststorm: 10, acidrain: 10, toxicfog: 3, radstorm: 2 },
  factory: { clear: 18, overcast: 26, ashfall: 22, duststorm: 6, acidrain: 18, toxicfog: 20, radstorm: 10 },
  dump: { clear: 20, overcast: 22, ashfall: 24, duststorm: 16, acidrain: 14, toxicfog: 18, radstorm: 8 },
  metro: { clear: 24, overcast: 28, ashfall: 20, duststorm: 6, acidrain: 16, toxicfog: 14, radstorm: 6 },
  hospital: { clear: 26, overcast: 28, ashfall: 16, duststorm: 6, acidrain: 14, toxicfog: 16, radstorm: 6 },
  port: { clear: 34, overcast: 24, ashfall: 14, duststorm: 18, acidrain: 14, toxicfog: 8, radstorm: 4 },
}

// 武器与手感
export const WEAPON = {
  reloadTime: 1.35,
  swapTime: 0.28,
  meleeArc: 0.62,
  meleeKnock: 120,
  projectileLife: 2.4,
  aimRange: 720,
}
export const WEAPON_SLOT = 'weapon'

// 手柄
export const GAMEPAD = {
  deadzone: 0.24,
  triggerDeadzone: 0.18,
  repeatDelay: 0.34,
  rumbleMs: 140,
}

// 大型敌人 / 生态
export const LARGE_MONSTER_IDS = ['junk_golem', 'sky_warden', 'mimic_beast', 'swarm_core']
export const ECO_SPECIES = ['roach', 'plant', 'fly', 'rat']
export const MAX_LARGE_ALIVE = 2
