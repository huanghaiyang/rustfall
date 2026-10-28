import { CYCLE_TIME, RAIN_WARN, DAY_PARTS, WEATHERS, WEATHER_BY_BIOME } from '../config.js'
import { G, notify, toast } from '../state.js'
import { Events, EV } from '../core/events.js'
import { mulberry32 } from '../render/rng.js'

/**
 * 日夜 + 天气循环。
 *
 * 一天 = 一个循环（默认 300s）。时间 0..1 映射到 6 个阶段（黎明/清晨/正午/午后/黄昏/夜晚），
 * 阶段决定环境亮度与色调；天气独立轮换（20~70s 一次），按生态权重抽取，
 * 并在循环末段强制切换为酸雨（这是唯一会致死的天氣，保留雨世界式的倒计时压力）。
 *
 * 只写 G.dayNight，并通过回调把结果交给 game / postfx / weather 渲染层。
 */
export class DayNightSystem {
  constructor(game) {
    this.game = game
    this.time = 0.27
    this.day = 1
    this.weatherId = 'clear'
    this.weatherT = 0
    this.weatherDur = 60
    this.nextId = ''
    this.rng = mulberry32(0x51f3a7)
    this.forecast = []
    this.acidForced = false
    this.lastPhase = ''
    this.lastWeather = ''
    this.lightning = 0
    this.lightningT = 4 + this.rng() * 6
    this.phaseDef = DAY_PARTS[1]
    // 天气过渡：旧天气 → 新天气 在数秒内插值，避免画面/雾气跳变
    this.prevWeatherId = 'clear'
    this.weatherBlend = 1
  }

  reset(day = 1, time = 0.27) {
    this.day = day
    this.time = time
    this.weatherId = 'clear'
    this.weatherT = 0
    this.weatherDur = 55
    this.acidForced = false
    this.forecast = []
    this.lightning = 0
    this.prevWeatherId = 'clear'
    this.weatherBlend = 1
    this.apply(true)
  }

  get cycleTotal() {
    return CYCLE_TIME
  }

  /** 由游戏层每帧调用；remaining 是本循环剩余秒数 */
  update(dt, remaining = CYCLE_TIME, biome = 'city') {
    this.time = (this.time + dt / Math.max(1, CYCLE_TIME)) % 1
    this.weatherT += dt
    this.lightning = Math.max(0, this.lightning - dt * 2.4)
    // 天气淡入淡出：约 4.5 秒过渡完
    this.weatherBlend = Math.min(1, (this.weatherBlend ?? 1) + dt / 4.5)

    const phase = this.phaseFor(this.time)
    this.phaseDef = phase

    // 酸雨季：循环末段强制天气
    const acidTime = remaining <= RAIN_WARN
    if (acidTime && !this.acidForced) {
      this.acidForced = true
      this.setWeather('acidrain', Math.max(8, remaining + 4), true)
      notify('气压在下降。酸雨要来了。', 'danger', 4)
    }
    if (!acidTime) this.acidForced = false

    // 天气轮换
    if (this.weatherT >= this.weatherDur) {
      if (!this.acidForced) {
        this.setWeather(this.pickWeather(biome), this.rollDuration(biome))
      } else {
        this.weatherT = this.weatherDur - 2
      }
    }

    // 闪电
    const wdef = WEATHERS[this.weatherId] || WEATHERS.clear
    if (wdef.lightning || wdef.rain > 0.5) {
      this.lightningT -= dt
      if (this.lightningT <= 0) {
        this.lightningT = 3.5 + this.rng() * 7
        this.lightning = 0.55 + this.rng() * 0.45
        this.game?.weather?.triggerLightning?.(this.lightning)
      }
    }

    this.worldFlash = this.lightning
    this._applyAcc = (this._applyAcc || 0) + dt
    const changed = phase.id !== this._appliedPhase || this.weatherId !== this._appliedWeather
    if (changed || this._applyAcc >= 0.1) {
      this._appliedPhase = phase.id
      this._appliedWeather = this.weatherId
      this._applyAcc = 0
      this.apply(false)
    }
    return this.state()
  }

  phaseFor(t) {
    let cur = DAY_PARTS[0]
    for (const p of DAY_PARTS) {
      if (t >= p.t) cur = p
    }
    return cur
  }

  phaseIndex() {
    return DAY_PARTS.indexOf(this.phaseDef)
  }

  pickWeather(biome = 'city') {
    const table = WEATHER_BY_BIOME[biome] || WEATHER_BY_BIOME.city
    let total = 0
    for (const [id, w] of Object.entries(table)) total += Math.max(0, w)
    let r = this.rng() * total
    for (const [id, w] of Object.entries(table)) {
      r -= Math.max(0, w)
      if (r <= 0) return WEATHERS[id] ? id : 'clear'
    }
    return 'clear'
  }

  rollDuration(biome) {
    const w = WEATHERS[this.weatherId] || WEATHERS.clear
    return w.min + this.rng() * (w.max - w.min)
  }

  setWeather(id, duration = 55, silent = false) {
    if (!WEATHERS[id]) id = 'clear'
    const prev = this.weatherId
    this.weatherId = id
    this.weatherT = 0
    this.weatherDur = Math.max(6, duration)
    if (prev !== id) {
      this.prevWeatherId = prev
      this.weatherBlend = 0
    }
    this.forecast = []
    this.game?.onWeatherChange?.(id, prev, { silent })
    if (!silent && prev !== id) {
      const w = WEATHERS[id]
      const msg = {
        acidrain: '酸雨落下来了，找掩体。',
        duststorm: '沙暴压过来，能见度在掉。',
        toxicfog: '毒雾从地缝里渗出来。',
        radstorm: '辐射风暴，仪表在乱跳。',
        ashfall: '开始落灰了。',
        overcast: '云层压低了。',
        clear: '天放晴了一点。',
      }[id]
      if (msg) notify(msg, id === 'acidrain' || id === 'radstorm' ? 'danger' : 'info', 3.2)
    }
    // 预生成未来 2 个天气，给 HUD 显示
    let cursor = 0
    for (let i = 0; i < 2; i++) {
      this.forecast.push(WEATHERS[this.pickWeather(this.game?.regionId ? G.biome : 'city')]?.label || '晴')
    }
    Events.emit(EV.WEATHER_CHANGE || 'weather:change', { weather: id, prev })
  }

  /** 时段锚点之间的连续插值（smoothstep 缓入缓出），昼夜不再跳变 */
  blendPhase() {
    const parts = DAY_PARTS
    const t = this.time
    let i = parts.length - 1
    for (let k = 0; k < parts.length; k++) {
      if (t >= parts[k].t) i = k
    }
    const a = parts[i]
    const b = parts[(i + 1) % parts.length]
    const span = (b.t > a.t ? b.t - a.t : 1 - a.t + b.t) || 1
    let k = (t - a.t) / span
    if (k < 0) k = 0
    if (k > 1) k = 1
    const s = k * k * (3 - 2 * k)
    const amb = (a.amb ?? 0.7) + ((b.amb ?? 0.7) - (a.amb ?? 0.7)) * s
    const ta = a.tint || [1, 1, 1]
    const tb = b.tint || [1, 1, 1]
    const tint = [ta[0] + (tb[0] - ta[0]) * s, ta[1] + (tb[1] - ta[1]) * s, ta[2] + (tb[2] - ta[2]) * s]
    const NIGHT = { dawn: 0.28, morning: 0, noon: 0, afternoon: 0, dusk: 0.35, night: 0.85 }
    const night = (NIGHT[a.id] || 0) + ((NIGHT[b.id] || 0) - (NIGHT[a.id] || 0)) * s
    return { amb, tint, night, k: s, a, b }
  }

  /** 旧天气 → 新天气的属性插值 */
  blendWeather() {
    const w = WEATHERS[this.weatherId] || WEATHERS.clear
    const wp = WEATHERS[this.prevWeatherId] || w
    let k = this.weatherBlend ?? 1
    if (k < 0) k = 0
    if (k > 1) k = 1
    const s = k * k * (3 - 2 * k)
    const L = (key) => (wp[key] || 0) + ((w[key] || 0) - (wp[key] || 0)) * s
    return {
      w,
      k: s,
      fog: L('fog'),
      wind: L('wind'),
      rain: L('rain'),
      darken: L('darken'),
      toxic: L('toxic'),
    }
  }

  /** 酸雨/辐射的直接伤害系数（0..1） */
  hazard() {
    const w = WEATHERS[this.weatherId] || WEATHERS.clear
    return Math.max(w.acid || 0, (w.toxic || 0) * 0.5)
  }

  /** 渲染层需要的画面参数（全部连续值，可直接每帧使用） */
  params() {
    const bw = this.blendWeather()
    const w = bw.w
    const p = this.phaseDef
    const bp = this.blendPhase()
    const amb = Math.max(0.05, bp.amb * (1 - bw.darken * 0.45))
    let tint = bp.tint
    // 特殊天气的染色也按 weatherBlend 混入，不跳变
    let wtint = null
    if (w.id === 'toxicfog') wtint = [0.72, 0.86, 0.5]
    else if (w.id === 'duststorm') wtint = [0.92, 0.78, 0.55]
    else if (w.id === 'acidrain') wtint = [0.78, 0.92, 0.72]
    else if (w.id === 'radstorm') wtint = [0.86, 0.66, 0.42]
    const wp = WEATHERS[this.prevWeatherId] || w
    let wptint = null
    if (wp.id === 'toxicfog') wptint = [0.72, 0.86, 0.5]
    else if (wp.id === 'duststorm') wptint = [0.92, 0.78, 0.55]
    else if (wp.id === 'acidrain') wptint = [0.78, 0.92, 0.72]
    else if (wp.id === 'radstorm') wptint = [0.86, 0.66, 0.42]
    const from = wptint || bp.tint
    const to = wtint || bp.tint
    const k = bw.k
    if (wptint || wtint) {
      tint = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k]
    }
    return {
      amb,
      tint,
      fog: bw.fog,
      wetness: bw.rain,
      night: bp.night,
      wind: bw.wind,
      rain: bw.rain,
      density: bw.fog,
      lightning: this.lightning,
      weather: w,
      phase: p,
      phaseBlend: bp,
      weatherK: bw.k,
    }
  }

  apply(force = false) {
    this.phaseDef = this.phaseFor(this.time)
    const st = this.state()
    const prevPhase = this.lastPhase
    this.lastPhase = st.phase
    Object.assign(G.dayNight, st)
    const params = this.params()
    this.game?.applyDayNight?.(params, st)
    if (force || prevPhase !== st.phase) {
      this.game?.onDayPhase?.(st.phase, prevPhase)
    }
    return st
  }

  state() {
    const p = this.phaseDef || DAY_PARTS[1]
    const w = WEATHERS[this.weatherId] || WEATHERS.clear
    const bw = this.blendWeather()
    const bp = this.blendPhase()
    return {
      time: this.time,
      day: this.day,
      phase: p.id,
      phaseLabel: p.label,
      amb: Math.max(0.05, bp.amb * (1 - bw.darken * 0.45)),
      tint: bp.tint,
      night: bp.night,
      weather: w.id,
      weatherLabel: w.label,
      nextWeather: this.forecast[0] || '',
      weatherT: this.weatherT,
      wind: bw.wind,
      temp: Math.round(24 - (p.id === 'night' ? 11 : 0) - bw.rain * 4 + (w.id === 'duststorm' ? 6 : 0)),
      forecast: this.forecast.slice(0, 2),
      lightning: this.lightning,
      acidForecast: this.acidForced ? 1 : 0,
    }
  }

  /** 24 小时制显示 */
  clockText() {
    const total = this.time * 24 * 60
    const h = Math.floor(total / 60) % 24
    const m = Math.floor(total % 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  serialize() {
    return { day: this.day, time: this.time, weather: this.weatherId, weatherT: this.weatherT, weatherDur: this.weatherDur }
  }

  load(data) {
    if (!data) return
    this.day = data.day || 1
    this.time = typeof data.time === 'number' ? data.time : 0.27
    this.weatherId = WEATHERS[data.weather] ? data.weather : 'clear'
    this.weatherT = data.weatherT || 0
    this.weatherDur = data.weatherDur || 55
    this.apply(true)
  }
}
