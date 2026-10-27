// 给 game.js 打 v3 补丁：日夜 / 天气 / 手柄 / 设置 / 武器 / 生态
import fs from 'node:fs'
const f = 'src/game/game.js'
let s = fs.readFileSync(f, 'utf8')
const rep = (name, from, to) => {
  if (!s.includes(from)) return console.log('FAIL', name)
  s = s.replace(from, to)
  console.log('OK  ', name)
}

// ---- imports ----
rep(
  'imports',
  `import { ModLoader, setModEnabled as persistModEnabled, getModEnabledMap } from './mods/loader.js'`,
  `import { ModLoader, setModEnabled as persistModEnabled, getModEnabledMap } from './mods/loader.js'
import { DayNightSystem } from './systems/daynight.js'
import { WEATHERS, DAY_PARTS } from './config.js'`,
)

// ---- constructor fields ----
rep(
  'ctor',
  `    this.QuestSystemClass = null
    this.DialogueClass = null
    this.RescueClass = null`,
  `    this.QuestSystemClass = null
    this.DialogueClass = null
    this.RescueClass = null
    this.dayNight = null
    this.weapons = null
    this.ecosystem = null
    this.weaponClass = null
    this.ecosystemFactory = null`,
)

// ---- loadSettingsAndMods：读取设置 + 动态导入武器/生态 ----
rep(
  'settingsLoad',
  `    G.volume = typeof settings.volume === 'number' ? settings.volume : 0.72
    G.muted = !!settings.muted`,
  `    G.volume = typeof settings.volume === 'number' ? settings.volume : 0.72
    G.muted = !!settings.muted
    if (settings.display && typeof settings.display === 'object') {
      Object.assign(G.settings, settings.display)
    }
    this.applySettings()`,
)

rep(
  'dynImports',
  `    try {
      const fx = await import('./render/fx/postfx.js')`,
  `    try {
      this.weaponClass = (await import('./weapons/runtime.js')).WeaponSystem
    } catch (e) {
      console.warn('[rustfall] 武器系统缺失', e)
    }
    try {
      this.ecosystemFactory = (await import('./ecosystem/index.js')).createEcosystem
    } catch (e) {
      console.warn('[rustfall] 生态模块缺失', e)
    }
    try {
      const fx = await import('./render/fx/postfx.js')`,
)

// ---- setupSystems：日夜 + 武器 ----
rep(
  'setup',
  `    if (this.QuestSystemClass) this.quests = new this.QuestSystemClass(this)`,
  `    if (!this.dayNight) this.dayNight = new DayNightSystem(this)
    else this.dayNight.reset(1, 0.27)
    if (this.weaponClass) this.weapons = new this.weaponClass(this)
    else this.weapons = null
    if (this.QuestSystemClass) this.quests = new this.QuestSystemClass(this)`,
)

// ---- boot 末尾：应用设置 + 初始化日夜 ----
rep(
  'bootEnd',
  `    G.chassisUnlocked = this.computeUnlockedChassis()
  }`,
  `    G.chassisUnlocked = this.computeUnlockedChassis()
    this.applySettings()
    if (this.postfx) this.postfx.setEnabled?.(G.settings.postfx)
    this.dayNight?.reset(1, 0.27)
  }`,
)

// ---- loadRoom：生态 ----
rep(
  'ecoPopulate',
  `    this.snapCamera()
    Events.emit(EV.ROOM_ENTER, { regionId, roomId })`,
  `    this.ecosystem?.clear?.()
    if (this.ecosystemFactory && !opts.preview) {
      try {
        this.ecosystem = this.ecosystemFactory(this)
        this.ecosystem.populate(data)
        G.ecosystem.active = this.ecosystem.stats?.().total || 0
      } catch (e) {
        console.warn('[rustfall] 生态生成失败', e)
      }
    }
    this.snapCamera()
    Events.emit(EV.ROOM_ENTER, { regionId, roomId })`,
)

// ---- update：手柄轮询 ----
rep(
  'padPoll',
  `  update(dt) {
    this.time += dt`,
  `  update(dt) {
    this.input.pollGamepad(dt)
    this.time += dt`,
)

// ---- updatePlaying：日夜 + 武器 + 生态 ----
rep(
  'playingHooks',
  `    r.update(dt)
    this.room.update(dt)
    if (this.director) this.director.update(dt)`,
  `    r.update(dt)
    this.room.update(dt)
    if (this.director) this.director.update(dt)
    this.weapons?.update?.(dt)
    this.ecosystem?.update?.(dt)`,
)

// ---- 天气循环：改为日夜系统驱动 ----
rep(
  'weatherCycleHead',
  `    G.timeLeft = Math.max(0, G.timeLeft - dt)
    const storm = G.timeLeft <= 0
    const warn = G.timeLeft <= RAIN_WARN`,
  `    G.timeLeft = Math.max(0, G.timeLeft - dt)
    if (this.dayNight) {
      const dn = this.dayNight.update(dt, G.timeLeft, G.biome)
      G.dayNight = { ...G.dayNight, ...dn }
    }
    const acidWeather = this.dayNight?.weatherId === 'acidrain' || this.dayNight?.weatherId === 'radstorm'
    const storm = acidWeather || G.timeLeft <= 0
    const warn = G.timeLeft <= RAIN_WARN || this.dayNight?.weatherId === 'acidrain'`,
)

// ---- 酸雨伤害：天气 hazard ----
rep(
  'hazard',
  `      if (!inShelter) {
        G.exposed += dt
        // 酸雨持续腐蚀：结构缓慢掉血，5 秒暴露直接报废
        G.hp = Math.max(0, G.hp - dt * 4.2)`,
  `      if (!inShelter) {
        const hazard = this.dayNight?.hazard?.() ?? 1
        G.exposed += dt * (0.6 + hazard * 0.8)
        // 酸雨持续腐蚀：结构缓慢掉血，5 秒暴露直接报废
        G.hp = Math.max(0, G.hp - dt * 4.2 * (0.5 + hazard))`,
)

// ---- 保存/读取日夜 ----
rep(
  'saveDayNight',
  `      rescue: this.rescue?.serialize?.() || {},`,
  `      rescue: this.rescue?.serialize?.() || {},
      dayNight: this.dayNight?.serialize?.() || null,
      settings: { ...G.settings },`,
)
rep(
  'loadDayNight',
  `    this.quests?.load?.(save.quests || {})`,
  `    if (save.settings) Object.assign(G.settings, save.settings)
    this.applySettings()
    this.dayNight?.load?.(save.dayNight)
    this.quests?.load?.(save.quests || {})`,
)

// ---- 新方法：设置 / 日夜应用 / 提示 ----
rep(
  'methodsInsert',
  `  // ================================================================ 交互`,
  `  // ================================================================ 设置 / 画面
  applySettings() {
    const st = G.settings
    if (this.postfx) {
      this.postfx.setEnabled?.(!!st.postfx)
      this.postfx.setGlow?.(!!st.glow)
    }
    if (document?.documentElement) {
      const root = document.documentElement
      root.classList.toggle('fx-off-scanlines', !st.scanlines)
      root.classList.toggle('fx-off-grain', !st.grain)
      root.classList.toggle('fx-off-vignette', !st.vignette)
    }
  }

  setSetting(key, value) {
    if (!(key in G.settings)) return
    G.settings[key] = value
    this.applySettings()
    saveSettings({ display: { ...G.settings } })
    if (key === 'gamepad' && !value) {
      G.gamepad.connected = false
    }
    return value
  }

  setDeadzone(v) {
    const dz = clamp(Number(v) || 0.24, 0.05, 0.6)
    G.settings.deadzone = dz
    if (this.input?.pad) this.input.pad.deadzone = dz
    saveSettings({ display: { ...G.settings } })
  }

  // ================================================================ 日夜 / 天气
  applyDayNight(params, st) {
    if (!params) return
    const pf = this.postfx
    pf?.setUniforms?.({
      ambient: params.amb,
      night: params.night,
      weatherTint: params.tint,
      fog: params.fog,
      wetness: params.wetness,
    })
    this.weather?.setIntensity?.(Math.max(params.rain, params.fog * 0.35))
    this.weather?.setRain?.(params.rain)
    this.audioAmbience(params.phase?.id, st?.weather)
    // 背景视差层随环境光压暗/染色
    const room = this.room
    if (room?.bgLayers) {
      for (const l of room.bgLayers) {
        if (!l.mat) continue
        if (l.baseColor === undefined) l.baseColor = l.mat.color.getHex()
        const tint = params.tint || [1, 1, 1]
        const amb = 0.35 + params.amb * 0.65
        l.mat.color.setRGB(
          clamp(((l.baseColor >> 16) & 255) / 255 * tint[0] * amb, 0, 1),
          clamp(((l.baseColor >> 8) & 255) / 255 * tint[1] * amb, 0, 1),
          clamp((l.baseColor & 255) / 255 * tint[2] * amb, 0, 1),
        )
      }
    }
  }

  audioAmbience(phase, weather) {
    try {
      audio.setAmbience?.(phase, weather)
      audio.setWind?.(this.dayNight?.params?.().wind ?? 0.1)
    } catch (e) {
      /* 音频未实现 */
    }
  }

  onWeatherChange(id, prev, opts = {}) {
    const w = WEATHERS[id]
    if (!w) return
    const stormy = id === 'acidrain' || id === 'radstorm'
    if (stormy) this.weather?.setPhase?.('storm')
    else if (id === 'toxicfog' || id === 'duststorm') this.weather?.setPhase?.('warning')
    else this.weather?.setPhase?.('calm')
    this.weather?.setSmoke?.((w.fog || 0) + (id === 'toxicfog' ? 0.4 : 0))
    this.sfx(stormy ? 'thunder' : 'uiClick', { vol: stormy ? 0.4 : 0.12 })
  }

  onDayPhase(phase, prev) {
    if (!prev) return
    const def = DAY_PARTS.find((p) => p.id === phase)
    if (!def) return
    const msg = {
      dawn: '天快亮了，空气里的酸味淡了一点。',
      morning: '清晨。远处有金属在冷却的声音。',
      noon: '正午。影子缩到脚边。',
      afternoon: '午后。风里开始带灰。',
      dusk: '天在暗下去，该找地方了。',
      night: '夜晚。只有机体的指示灯还亮着。',
    }[phase]
    if (msg) notify(msg, 'info', 3.4)
    if (phase === 'night') G.flash = Math.min(0.3, G.flash + 0.12)
  }

  showHint(text, dur = 2) {
    toast(text, 'warn', dur)
  }

  // ================================================================ 交互`,
)

fs.writeFileSync(f, s)
console.log('game.js patched')
