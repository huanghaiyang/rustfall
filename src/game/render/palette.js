// 锈雨 · RUSTFALL —— 废土色板
// 主调：铁锈橙 / 灰蓝钢 / 骨白 / 病态黄绿；霓虹只用于电子设备与 UI。
// 兼容旧键（stone/slug/lizard… 供旧贴图模块过渡期使用）。

export const PAL = {
  // —— 基础 ——
  void: '#07090b',
  black: '#08090a',
  ash: '#15191c',
  ashLight: '#232a2e',
  ashPale: '#343c40',
  dust: '#4b443a',
  dustLight: '#6d6455',

  // —— 铁锈 / 金属 ——
  rust: '#8a4b26',
  rustDark: '#4a2a18',
  rustDeep: '#2e1a10',
  rustLight: '#c07038',
  rustHot: '#e08a3f',
  ochre: '#a8763a',
  sand: '#c9b085',
  sandDark: '#8f7a55',

  // —— 钢 / 机械 ——
  steel: '#3a444b',
  steelDark: '#232b30',
  steelBlue: '#2c3b46',
  steelLight: '#6f828c',
  steelWhite: '#a9b6bc',
  glass: '#7fb0b8',
  oil: '#14100d',
  oilSheen: '#3b4d52',

  // —— 骨 / 遗体 ——
  bone: '#d8cfba',
  boneDark: '#8a8272',
  boneDeep: '#5a5548',
  blood: '#6a2a22',
  bloodDark: '#3d1815',

  // —— 毒性 / 植被 ——
  toxic: '#8fae3a',
  toxicDark: '#4c5f1f',
  toxicGlow: '#c6e05a',
  acid: '#9ab84a',
  mossDead: '#5a5a3a',
  weed: '#6b6a3f',

  // —— 天空 ——
  skyDay: '#8a8a72',
  skyDusk: '#6a5540',
  skyToxic: '#7a7a3a',
  skySmoke: '#3a3a36',
  skyNight: '#12161a',

  // —— 电子 / 信号 ——
  neon: '#6ff0d0',
  neonWarm: '#f2b34a',
  neonCold: '#8fc4ff',
  neonRed: '#ff5644',
  signal: '#8fe8ff',

  // —— 文字 / UI ——
  white: '#e8e3d6',
  paper: '#cfc4a8',
  ink: '#1a1510',
  warn: '#e0a33c',
  danger: '#c8553f',
  karma: '#d8cfba',
  fruit: '#a9d96a',
  fruitHi: '#ddffa8',
  fruitGlow: '#7ab648',

  // ===== 旧键（过渡期兼容旧贴图模块，勿在新代码使用）=====
  void0: '#07090b',
  void1: '#0b0e10',
  sky0: '#12161a',
  sky1: '#1a2024',
  sky2: '#242c30',
  sky3: '#313a3e',
  far: '#1a2024',
  mid: '#242c30',
  near: '#0d1113',
  stone: '#3a444b',
  stoneDark: '#232b30',
  stoneDeep: '#171d21',
  stoneLit: '#6f828c',
  stoneEdge: '#8fa0a8',
  edge: '#8fa0a8',
  edgeLit: '#a9b6bc',
  moss: '#5a5a3a',
  mossHi: '#7a7a4a',
  water: '#2c3b46',
  waterDeep: '#151d22',
  waterHi: '#5d7d84',
  waterFoam: '#a5c4c8',
  slug: '#e8e3d6',
  slugShade: '#b6b0a0',
  slugBelly: '#f6f2e6',
  slugTail: '#cfc8b8',
  eye: '#08090a',
  lizardA: '#7a7434',
  lizardB: '#4d4a20',
  lizardC: '#9a9450',
  lizardEye: '#f2e2a4',
  lizardTongue: '#c98b8b',
  lizardDark: '#2c2a14',
  rain: '#a8c46a',
}

export const CSS_VARS = {
  '--c-void': PAL.void,
  '--c-ash': PAL.ash,
  '--c-rust': PAL.rust,
  '--c-rust-light': PAL.rustLight,
  '--c-ochre': PAL.ochre,
  '--c-sand': PAL.sand,
  '--c-steel': PAL.steel,
  '--c-steel-light': PAL.steelLight,
  '--c-bone': PAL.bone,
  '--c-bone-dark': PAL.boneDark,
  '--c-toxic': PAL.toxic,
  '--c-toxic-glow': PAL.toxicGlow,
  '--c-neon': PAL.neon,
  '--c-neon-warm': PAL.neonWarm,
  '--c-neon-cold': PAL.neonCold,
  '--c-neon-red': PAL.neonRed,
  '--c-white': PAL.white,
  '--c-paper': PAL.paper,
  '--c-warn': PAL.warn,
  '--c-danger': PAL.danger,
}
