import { reactive } from 'vue'
import {
  CYCLE_TIME,
  NEED_POWER,
  MAX_POWER,
  MAX_SIGNAL,
  INVENTORY_SLOTS,
  BASE_CARRY_WEIGHT,
  DEFAULT_CHASSIS,
  CHASSIS_START_UNLOCKED,
} from './config.js'

// 单一响应式游戏状态：Three.js / 逻辑层只写，Vue 层只读渲染。
export const G = reactive({
  phase: 'title', // title | chassis | playing | paused | dead | hibernate | transition
  fade: 0,
  flash: 0,
  shake: 0,
  hurt: 0,

  // 世界
  regionId: 'city',
  regionName: '锈城废墟',
  roomId: '',
  roomName: '',
  biome: 'city',
  isShelter: false,

  // 角色
  chassisId: DEFAULT_CHASSIS,
  chassisUnlocked: [...CHASSIS_START_UNLOCKED],
  hp: 100,
  hpMax: 100,
  energy: 60,
  energyMax: 100,
  power: 0,
  powerMax: MAX_POWER,
  needPower: NEED_POWER,
  signal: 2,
  signalMax: MAX_SIGNAL,
  toolId: 'shovel',

  // 循环
  cycle: 1,
  timeLeft: CYCLE_TIME,
  cycleTotal: CYCLE_TIME,
  weatherPhase: 'calm', // calm | warning | storm
  // —— v3：日夜 / 天气 / 武器 / 生态 / 显示设置 ——
  dayNight: {
    time: 0.3, // 0..1 一天中的位置
    day: 1,
    phase: 'morning', // dawn | morning | noon | afternoon | dusk | night
    phaseLabel: '清晨',
    amb: 0.7, // 环境亮度 0..1
    tint: [0.95, 0.86, 0.7],
    weather: 'clear',
    weatherLabel: '晴',
    nextWeather: '',
    weatherT: 0,
    wind: 0.1,
    temp: 18,
    forecast: [],
    lightning: 0,
    acidForecast: 0,
  },
  weapon: {
    id: null,
    name: '',
    ammo: 0,
    ammoMax: 0,
    reloading: false,
    cooldown: 0,
    compatible: true,
    reason: '',
    spread: 0,
  },
  ecosystem: { roaches: 0, plants: 0, critters: 0, scrap: 0, active: 0 },
  settings: {
    postfx: false,
    glow: false,
    scanlines: false,
    grain: false,
    vignette: true,
    gamepad: true,
    deadzone: 0.24,
    rumble: true,
    showClock: true,
  },
  gamepad: { connected: false, id: '', axes: [0, 0], buttons: 0 },
  weatherIntensity: 0,
  smoke: 0,
  ash: 0,
  toxicity: 0,
  exposed: 0,
  sheltered: false,
  shelterProgress: 0,

  // 背包 / 装备
  inventory: { slots: [], weight: 0, capacityWeight: BASE_CARRY_WEIGHT, slotsMax: INVENTORY_SLOTS },
  equipped: { joint: null, cpu: null, power: null, armor: null, sensor: null, utility: null },

  // 成长：等级 / 经验 / 属性点 / 加点
  growth: {
    level: 1,
    xp: 0,
    xpNext: 60,
    totalXp: 0,
    points: 0,
    perks: { hull: 0, power: 0, servo: 0, armor: 0, cargo: 0, optics: 0 },
    levelsGained: 0,
  },
  // 临时增益（消耗品/道具触发，按秒衰减）
  buffs: [],

  // UI
  ui: {
    panel: null, // inventory | quests | archive | mods | help | chassis | map | growth
    inventoryTab: 'all',
    selectedItem: null,
    selectedQuest: null,
    selectedArchive: null,
    toolBeltOpen: false,
    stack: [],
    showCompass: false,
  },

  // 对话
  dialogue: {
    active: false,
    npcId: '',
    npcName: '',
    portrait: '',
    nodeId: '',
    text: '',
    speaker: '',
    choices: [],
    typing: 0,
  },

  // 任务 / 营救 / 同伴 / 档案
  quests: { active: [], completed: [], tracked: null, logOpen: false },
  rescue: { active: null, targetName: '', stage: '' },
  companions: {},
  archive: { entries: [], unread: 0 },
  flags: {},
  bestiary: {},

  // 通知 / 提示
  hint: '',
  hintKey: 0,
  hintKind: 'info',
  notifications: [],
  interactHint: null,

  // 系统
  muted: false,
  volume: 0.72,
  fps: 60,
  showHud: false,
  paused: false,
  hasSave: false,
  saveInfo: null,
  mods: { list: [], loaded: [], errors: [] },
  newRun: true,
  stats: { deaths: 0, kills: 0, looted: 0, cyclesSurvived: 0, roomsExplored: 0, distance: 0 },
  deathReason: '',
  result: null,
})

// 兼容旧字段读取（旧组件/旧逻辑过渡期）
Object.defineProperty(G, 'food', {
  get: () => G.power,
  set: (v) => (G.power = v),
})
Object.defineProperty(G, 'karma', {
  get: () => G.signal,
  set: (v) => (G.signal = v),
})
Object.defineProperty(G, 'maxKarma', { get: () => G.signalMax })
Object.defineProperty(G, 'maxFood', { get: () => G.powerMax })
Object.defineProperty(G, 'needFood', { get: () => G.needPower })
Object.defineProperty(G, 'hintText', { get: () => G.hint })
Object.defineProperty(G, 'rainPhase', {
  get: () => (G.weatherPhase === 'storm' ? 'rain' : G.weatherPhase === 'warning' ? 'warning' : 'calm'),
})
Object.defineProperty(G, 'rainIntensity', { get: () => G.weatherIntensity })

let toastTimer = null
export function toast(text, kind = 'info', secs = 2.8) {
  G.hint = text
  G.hintKind = kind
  G.hintKey++
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (G.hint === text) G.hint = ''
  }, secs * 1000)
}
export function clearToast() {
  if (toastTimer) clearTimeout(toastTimer)
  G.hint = ''
}

let notifyId = 1
export function notify(text, kind = 'info', secs = 4) {
  const entry = { id: notifyId++, text, kind, time: secs }
  G.notifications.unshift(entry)
  if (G.notifications.length > 6) G.notifications.length = 6
  setTimeout(() => {
    const i = G.notifications.findIndex((n) => n.id === entry.id)
    if (i >= 0) G.notifications.splice(i, 1)
  }, secs * 1000)
}

export function openPanel(name) {
  if (G.ui.panel === name) {
    closePanel()
    return
  }
  G.ui.panel = name
  if (!Array.isArray(G.ui.stack)) G.ui.stack = []
  const i = G.ui.stack.indexOf(name)
  if (i >= 0) G.ui.stack.splice(i, 1)
  G.ui.stack.push(name)
  G.paused = G.phase === 'playing' && !!G.ui.panel
}
export function closePanel() {
  const name = G.ui.panel
  G.ui.panel = null
  if (Array.isArray(G.ui.stack)) {
    const i = G.ui.stack.indexOf(name)
    if (i >= 0) G.ui.stack.splice(i, 1)
    G.ui.stack.length = 0
  }
  if (G.phase === 'playing') G.paused = false
}

export function setPhase(phase) {
  G.phase = phase
}

export function resetState() {
  G.phase = 'title'
  G.fade = 0
  G.flash = 0
  G.shake = 0
  G.hurt = 0
  G.cycle = 1
  G.signal = 2
  G.power = 0
  G.timeLeft = CYCLE_TIME
  G.cycleTotal = CYCLE_TIME
  G.weatherPhase = 'calm'
  G.weatherIntensity = 0
  G.smoke = 0
  G.ash = 0
  G.toxicity = 0
  G.exposed = 0
  G.sheltered = false
  G.shelterProgress = 0
  G.hint = ''
  G.notifications.length = 0
  G.ui.panel = null
  G.ui.selectedItem = null
  G.dialogue.active = false
  G.quests.active = []
  G.quests.completed = []
  G.quests.tracked = null
  G.rescue.active = null
  G.companions = {}
  G.archive.entries = []
  G.archive.unread = 0
  G.flags = {}
  G.bestiary = {}
  G.deathReason = ''
  G.result = null
  G.showHud = false
  G.newRun = true
  G.stats = { deaths: 0, kills: 0, looted: 0, cyclesSurvived: 0, roomsExplored: 0, distance: 0 }
  G.inventory.slots = []
  G.inventory.weight = 0
  G.equipped = { joint: null, cpu: null, power: null, armor: null, sensor: null, utility: null }
  G.growth = {
    level: 1,
    xp: 0,
    xpNext: 60,
    totalXp: 0,
    points: 0,
    perks: { hull: 0, power: 0, servo: 0, armor: 0, cargo: 0, optics: 0 },
    levelsGained: 0,
  }
  G.buffs = []
}

