// 全程序化音频系统 —— 锈雨 / RUSTFALL
//
// 零音频文件 · 零网络 · 零依赖：所有声音都由 WebAudio 节点实时合成。
// 音色目标：潮湿、昏暗、废土洞穴氛围（低频风床 + 雨幕 + 危险脉冲 + 日夜/天气环境层）。
//
// 防御性约定（引擎每帧/每分钟会调用几十次）：
//   · 构造时绝不创建 AudioContext（浏览器自动播放策略要求用户手势后才可解锁）
//   · AudioContext 缺失 / 挂起 / 已关闭 / 已 dispose 时，所有方法静默 no-op，绝不抛异常
//   · 未知音效名静默忽略
//   · 所有增益都走斜坡（线性 / 指数），不出现突跳，避免爆音
//   · 每个声部在排定结束时间后被定时回收，节点 disconnect，内存不增长
//   · 每帧路径（update）只做算数与布尔比较，绝不新建节点；环境点缀音按秒级随机间隔触发
//
// 公开 API（引擎直接调用）：
//   生命周期  unlock() / dispose() / get ready / get muted
//   音量      setVolume(0..1) / setMuted(bool)
//   单发声效  play(name, { vol, rate, pan }) · playWeapon(id, { vol })（别名）
//   环境层    setAmbience(phaseId, weatherId) · setWind(0..1)
//   旧音床    startAmbience() / stopAmbience() / setRain(0..1) / setDanger(0..1)
//   每帧      update(dt)（幂等、可跳过；只在需要时补建解锁前的意图）
// 音效名共 60 个，见 SFX_NAMES（19 个 v1 动作 + 17 武器 + 14 大型敌人/生态 + 10 天气/日夜）

const MAX_VOICES = 24 // 同时存在的单发声部上限，超出丢弃最旧的（≈LRU）
const MASTER_SMOOTH = 0.09 // 主音量平滑时长（秒）
const NOISE_SECONDS = 2 // 共享白噪声缓冲长度（秒）
const MIN_GAIN = 0.0001 // 指数斜坡下限（指数斜坡不能到 0）
const AMB_XFADE = 1.5 // 环境层交叉淡入淡出时长（秒）
const AMB_WIND_MAX = 0.42 // 风声层最大增益
const AMB_EVENT_MARGIN = 0.35 // 环境点缀音的淡出余量

// 引擎会调用的音效名（缺一个就会导致对应事件静音）
const SFX_NAMES = [
  // —— 基础动作（v1）——
  'jump',
  'land',
  'step',
  'eat',
  'hurt',
  'death',
  'pickup',
  'throw',
  'hibernate',
  'wake',
  'door',
  'growl',
  'splash',
  'swim',
  'rainStart',
  'thunder',
  'heartbeat',
  'uiClick',
  'uiHover',
  // —— 武器（v2）——
  'pistol',
  'laser',
  'laser_heavy',
  'nail',
  'scrap_launch',
  'arc',
  'rail',
  'hammer_swing',
  'hammer_hit',
  'dagger',
  'pipe',
  'shock',
  'reload',
  'empty',
  'weapon_swap',
  'impact_metal',
  'impact_flesh',
  // —— 大型敌人 / 生态（v2）——
  'golem_step',
  'golem_throw',
  'golem_break',
  'warden_charge',
  'warden_laser',
  'warden_overheat',
  'mimic_reveal',
  'mimic_bite',
  'swarm_buzz',
  'swarm_burst',
  'roach_skitter',
  'plant_rustle',
  'rat_squeak',
  'fly_buzz',
  // —— 天气 / 日夜（v2）——
  'wind_soft',
  'wind_strong',
  'dust_gust',
  'thunder_far',
  'thunder_near',
  'acid_hiss',
  'toxic_bubble',
  'night_hum',
  'dawn_chime',
  'storm_alarm',
]
const SFX_SET = new Set(SFX_NAMES)

// ---------------------------------------------------------------- 环境层映射
// 日夜阶段 → 基础层；未知值一律回落到白天
const BASE_KIND = {
  dawn: 'dawn',
  morning: 'day',
  noon: 'day',
  afternoon: 'day',
  day: 'day',
  dusk: 'dusk',
  night: 'night',
}

const PHASE_ALIAS = {
  sunrise: 'dawn',
  predawn: 'dawn',
  morning: 'morning',
  forenoon: 'morning',
  noon: 'noon',
  midday: 'noon',
  afternoon: 'afternoon',
  evening: 'dusk',
  sunset: 'dusk',
  dusk: 'dusk',
  twilight: 'dusk',
  night: 'night',
  nighttime: 'night',
  midnight: 'night',
  day: 'noon',
  daytime: 'noon',
}

// 天气 → 天气层 + 该天气的“底噪风量”
const WEATHER_KIND = {
  clear: 'clear',
  cloudy: 'cloudy',
  rain: 'rain',
  acid: 'acid',
  storm: 'storm',
  dust: 'dust',
  toxic: 'toxic',
  ash: 'ash',
}

const WEATHER_WIND = {
  clear: 0, // 晴：无风底噪，完全由 setWind 控制
  cloudy: 0.2,
  rain: 0.34,
  acid: 0.3,
  storm: 0.85,
  dust: 0.72,
  toxic: 0.22,
  ash: 0.16,
}

const WEATHER_ALIAS = {
  clear: 'clear',
  sunny: 'clear',
  fair: 'clear',
  none: 'clear',
  '': 'clear',
  calm: 'clear',
  cloudy: 'cloudy',
  overcast: 'cloudy', // config.js: WEATHERS.overcast
  clouds: 'cloudy',
  rain: 'rain',
  rainy: 'rain',
  drizzle: 'rain',
  downpour: 'rain',
  acid: 'acid',
  acidrain: 'acid', // config.js: WEATHERS.acidrain
  acid_rain: 'acid',
  acid_rainfall: 'acid',
  storm: 'storm',
  thunder: 'storm',
  thunderstorm: 'storm',
  rainstorm: 'storm',
  gale: 'storm',
  radstorm: 'storm', // config.js: WEATHERS.radstorm（带闪电的风暴）
  dust: 'dust',
  duststorm: 'dust', // config.js: WEATHERS.duststorm
  sand: 'dust',
  sandstorm: 'dust',
  sand_storm: 'dust',
  windy: 'dust',
  toxic: 'toxic',
  toxicfog: 'toxic', // config.js: WEATHERS.toxicfog
  toxic_fog: 'toxic',
  fog: 'toxic',
  smog: 'toxic',
  miasma: 'toxic',
  poison: 'toxic',
  ash: 'ash',
  ashfall: 'ash', // config.js: WEATHERS.ashfall
  ash_fall: 'ash',
}

// 各环境层的目标增益（层内已做过平衡，这里只做层间比例）
const LAYER_GAIN = {
  day: 0.1,
  dawn: 0.15,
  dusk: 0.13,
  night: 0.18,
  clear: 0.07,
  cloudy: 0.13,
  rain: 0.19,
  acid: 0.21,
  storm: 0.27,
  dust: 0.25,
  toxic: 0.19,
  ash: 0.12,
  wind: AMB_WIND_MAX,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const num = (v, d) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const rand = (a, b) => a + Math.random() * (b - a)

export class AudioSystem {
  constructor() {
    // 注意：这里只初始化字段，绝不触碰 AudioContext / window
    this._ctx = null
    this._master = null
    this._comp = null
    this._voiceBus = null
    this._bedBus = null
    this._noiseBuf = null
    this._curveBuf = null
    this._voices = [] // 单发声部（按创建顺序，用于丢弃最旧的）
    this._dying = new Set() // 被抢占、正在极短淡出的声部
    this._beds = new Set() // 所有音床（含正在淡出的），dispose 时统一回收
    this._amb = null
    this._rain = null
    this._danger = null
    // 解锁前记录的“意图”，解锁 / update 时补建
    this._wantAmbience = false
    this._wantRain = 0
    this._wantDanger = 0
    this._rainApplied = -1
    this._dangerApplied = -1
    // v2：日夜 / 天气环境层（三槽：基础层 / 天气层 / 风层）
    this._layerBase = null
    this._layerWeather = null
    this._layerWind = null
    this._ambPhase = 'day' // 归一后：day | dawn | dusk | night
    this._ambWeather = 'clear'
    this._wantWind = 0
    this._weatherWind = WEATHER_WIND.clear
    this._windApplied = 0
    this._windSet = false // setWind 一旦被调用，就以调用方为准（引擎会传 config 的 wind）
    this._ambClock = 0 // 环境点缀音的时间累积（秒）
    this._nextMetal = 10
    this._nextThunder = 8
    this._nextBubble = 3
    this._bedSeq = 0 // 音床创建序号（用于给层数量设上限）
    this._windNextTry = 0 // 风层构建失败后的重试时间（防止每帧重试）
    this._volume = 0.72
    this._muted = false
    this._closed = false
  }

  // ---------------------------------------------------------------- 生命周期

  // 是否已解锁且可发声（挂起 / 已关闭 / 已 dispose 时为 false）
  get ready() {
    const ctx = this._ctx
    return !!(ctx && !this._closed && ctx.state === 'running')
  }

  get muted() {
    return this._muted
  }

  // 必须在用户手势回调里调用；可重复调用，返回是否已经能发声
  async unlock() {
    try {
      if (typeof window === 'undefined') return false
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false
      if (this._ctx && this._ctx.state === 'closed') this._ctx = null
      this._closed = false
      if (!this._ctx) {
        let ctx = null
        try {
          ctx = new AC({ latencyHint: 'interactive' })
        } catch (e) {
          try {
            ctx = new AC()
          } catch (e2) {
            ctx = null
          }
        }
        if (!ctx) return false
        this._ctx = ctx
        this._buildChain()
      }
      const ctx = this._ctx
      if (!ctx) return false
      // Safari 会给出 'interrupted'，一并尝试恢复
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        try {
          await ctx.resume()
        } catch (e) {
          /* 手势不足，保持挂起，下次再试 */
        }
      }
      if (ctx.state !== 'running') return false
      this._applyMaster(0.4) // 解锁后慢慢抬主音量，避免爆音
      this._applyBeds()
      this._applyAmbience() // 解锁前调用过的 setAmbience/setWind 在这里补上
      return true
    } catch (e) {
      return false
    }
  }

  // 停止一切、关闭上下文、释放节点；之后仍可再次 unlock() 重建
  dispose() {
    this._closed = true
    try {
      const beds = Array.from(this._beds)
      for (let i = 0; i < beds.length; i++) this._killBed(beds[i])
      const dying = Array.from(this._dying)
      this._dying.clear()
      for (let i = 0; i < dying.length; i++) this._disposeVoiceNodes(dying[i])
      for (let i = this._voices.length - 1; i >= 0; i--) this._reap(this._voices[i])
      const ctx = this._ctx
      this._ctx = null
      this._master = null
      this._comp = null
      this._voiceBus = null
      this._bedBus = null
      this._noiseBuf = null
      this._curveBuf = null
      this._amb = null
      this._rain = null
      this._danger = null
      this._layerBase = null
      this._layerWeather = null
      this._layerWind = null
      this._wantAmbience = false
      this._wantRain = 0
      this._wantDanger = 0
      this._wantWind = 0
      this._windApplied = 0
      this._windSet = false
      this._ambClock = 0
      this._nextMetal = 10
      this._nextThunder = 8
      this._nextBubble = 3
      this._rainApplied = -1
      this._dangerApplied = -1
      if (ctx) {
        try {
          const p = ctx.close()
          if (p && p.catch) p.catch(() => {})
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- 公共控制

  setMuted(m) {
    try {
      this._muted = !!m
      this._applyMaster()
    } catch (e) {
      /* ignore */
    }
  }

  // 0..1 主音量，平滑斜坡，无爆音
  setVolume(v) {
    try {
      const x = num(v, this._volume)
      this._volume = clamp01(x)
      this._applyMaster()
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- 单发音效

  // opts: { vol = 1, rate = 1, pan = 0 }
  play(name, opts = {}) {
    try {
      if (!name || typeof name !== 'string') return false
      if (!SFX_SET.has(name)) return false
      if (!this._alive()) return false
      if (this._muted) return false
      const o = opts && typeof opts === 'object' ? opts : {}
      const vol = clamp(num(o.vol, 1), 0, 3)
      if (vol <= 0.0001) return false
      const rate = clamp(num(o.rate, 1), 0.4, 2.5)
      const pan = clamp(num(o.pan, 0), -1, 1)
      const v = this._beginVoice(vol, pan, rate)
      if (!v) return false
      v.t0 = this._ctx.currentTime + 0.006 // 留一点点提前量，避开调度抖动
      try {
        this._sfx(name, v)
      } catch (e) {
        this._reap(v) // 单个音效出错只丢这个声部，不影响游戏循环
        return false
      }
      this._armReap(v)
      return true
    } catch (e) {
      return false
    }
  }

  // ---------------------------------------------------------------- 音床

  startAmbience() {
    this._wantAmbience = true
    try {
      if (!this._alive() || this._amb) return
      this._startAmbience()
    } catch (e) {
      /* ignore */
    }
  }

  stopAmbience() {
    this._wantAmbience = false
    try {
      const bed = this._amb
      if (!bed) return
      this._amb = null
      this._fadeBed(bed, MIN_GAIN, 1.2)
    } catch (e) {
      /* ignore */
    }
  }

  // 0..1 连续雨幕：交叉淡入淡出；0 = 静音并停掉声源省 CPU
  setRain(intensity) {
    try {
      this._wantRain = clamp01(num(intensity, this._wantRain))
      this._applyRain()
    } catch (e) {
      /* ignore */
    }
  }

  // 0..1 低沉的凶兆脉冲（附近有捕食者 / 暴雨将至）
  setDanger(level) {
    try {
      this._wantDanger = clamp01(num(level, this._wantDanger))
      this._applyDanger()
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- 环境层（日夜 / 天气）

  /**
   * 按日夜阶段与天气切换环境层（基础层 / 天气层 / 风层，1.5s 交叉淡入淡出）。
   * phaseId:   dawn | morning | noon | afternoon | dusk | night（兼容 sunrise/sunset/midnight 等别名）
   * weatherId: clear | cloudy | rain | acid | storm | dust | toxic | ash（兼容 sandstorm/fog/acid_rain 等别名）
   * 同阶段同天气重复调用几乎零开销，可每帧调用。
   */
  setAmbience(phaseId, weatherId) {
    try {
      const p = this._normPhase(phaseId)
      const w = this._normWeather(weatherId)
      const prev = this._ambPhase
      const same = p === this._ambPhase && w === this._ambWeather
      this._ambPhase = p
      this._ambWeather = w
      this._weatherWind = WEATHER_WIND[w] != null ? WEATHER_WIND[w] : 0.1
      if (!this._alive()) return
      // 同层且该有的层都在 → 什么都不做
      if (same && this._layerBase && this._layerWeather) return
      this._applyAmbience()
      // 换场点缀：黎明一声很轻的钟
      if (p === 'dawn' && prev !== 'dawn') this._ambOneShot('dawn_chime', 0.5)
      // 重置点缀音计时，避免刚换场就炸一记雷
      this._nextThunder = this._ambClock + rand(4, 9)
      this._nextMetal = this._ambClock + rand(7, 15)
      this._nextBubble = this._ambClock + rand(1.5, 4)
    } catch (e) {
      /* ignore */
    }
  }

  // 0..1 实时风量；调用后以该值为准（天气自带的兜底风量让位）
  setWind(v) {
    try {
      this._wantWind = clamp01(num(v, this._wantWind))
      this._windSet = true
      this._applyWind()
    } catch (e) {
      /* ignore */
    }
  }

  // 武器音效别名（调用方可按类别分流，行为等同 play）
  playWeapon(id, opts = {}) {
    return this.play(id, opts)
  }

  // 每帧调用：只做算数与布尔比较，补建解锁前记录的意图；可重入
  update(dt) {
    if (!this._alive()) return
    const d = num(dt, 0)
    if (!(d > 0)) return
    try {
      if (
        (this._wantAmbience && !this._amb) ||
        (this._wantRain > 0.001 && !this._rain) ||
        (this._wantDanger > 0.001 && !this._danger)
      ) {
        this._applyBeds()
      }
      // 环境点缀音（远处金属 / 雷 / 气泡）：只累计时间，秒级才真正建节点
      this._ambEvents(d)
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- 内部：上下文 / 主链

  _alive() {
    const ctx = this._ctx
    return !!(ctx && !this._closed && ctx.state === 'running')
  }

  _buildChain() {
    const ctx = this._ctx
    if (!ctx) return
    try {
      // 声部 -> 总线 -> 压缩器 -> 主音量 -> 输出
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -20
      comp.knee.value = 22
      comp.ratio.value = 4
      comp.attack.value = 0.006
      comp.release.value = 0.3
      const voiceBus = ctx.createGain()
      voiceBus.gain.value = 1
      const bedBus = ctx.createGain()
      bedBus.gain.value = 0.9
      const master = ctx.createGain()
      master.gain.value = MIN_GAIN
      voiceBus.connect(comp)
      bedBus.connect(comp)
      comp.connect(master)
      master.connect(ctx.destination)
      this._comp = comp
      this._voiceBus = voiceBus
      this._bedBus = bedBus
      this._master = master
      this._ensureNoise()
      this._applyMaster(MASTER_SMOOTH)
    } catch (e) {
      /* 设备异常时保持静默 */
    }
  }

  // 2 秒白噪声缓冲：全系统共用，只创建一次
  _ensureNoise() {
    const ctx = this._ctx
    if (!ctx || this._noiseBuf) return
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS))
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this._noiseBuf = buf
    } catch (e) {
      this._noiseBuf = null
    }
  }

  // 失真曲线（hurt 用），全系统共享
  _curve() {
    if (this._curveBuf) return this._curveBuf
    const n = 1024
    const buf = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      buf[i] = Math.tanh(x * 3.2)
    }
    this._curveBuf = buf
    return buf
  }

  _applyMaster(rampSec) {
    const master = this._master
    const ctx = this._ctx
    if (!master || !ctx) return
    const target = this._muted ? MIN_GAIN : Math.max(MIN_GAIN, this._volume)
    this._ramp(master.gain, target, rampSec != null ? rampSec : MASTER_SMOOTH)
  }

  // ---------------------------------------------------------------- 内部：调度工具

  // 安全定时器（浏览器里返回数字，Node 里可 unref 以免拖住进程）
  _later(fn, ms) {
    let id = 0
    try {
      id = setTimeout(() => {
        try {
          fn()
        } catch (e) {
          /* ignore */
        }
      }, Math.max(16, Math.round(ms)))
      if (id && typeof id.unref === 'function') id.unref()
    } catch (e) {
      id = 0
    }
    return id
  }

  _clearTimer(id) {
    if (!id) return 0
    try {
      clearTimeout(id)
    } catch (e) {
      /* ignore */
    }
    return 0
  }

  // AudioParam 平滑斜坡：从当前值线性推过去（永不突跳）
  _ramp(param, value, sec, at) {
    const ctx = this._ctx
    if (!ctx || !param) return
    const now = at != null ? at : ctx.currentTime
    const to = Math.max(MIN_GAIN, value)
    const dur = Math.max(0.02, sec)
    try {
      const from = Math.max(MIN_GAIN, param.value)
      param.cancelScheduledValues(now)
      param.setValueAtTime(from, now)
      param.linearRampToValueAtTime(to, now + dur)
    } catch (e) {
      try {
        param.value = to
      } catch (e2) {
        /* ignore */
      }
    }
  }

  // 包络：0.0001 -> peak（attack）-> 0.0001（decay）
  // points 存在时改用随机折线（thunder 的振幅调制）
  _envelope(param, t0, attack, decay, peak, points) {
    const a = Math.max(0.002, attack)
    const d = Math.max(0.02, decay)
    const pk = Math.max(MIN_GAIN, peak)
    try {
      if (points && points.length) {
        param.setValueAtTime(MIN_GAIN, t0)
        let last = t0
        for (let i = 0; i < points.length; i++) {
          const p = points[i]
          const at = t0 + Math.max(0.01, num(p.t, 0))
          if (at <= last) continue
          param.linearRampToValueAtTime(Math.max(MIN_GAIN, num(p.v, pk)), at)
          last = at
        }
        param.exponentialRampToValueAtTime(MIN_GAIN, last + d)
        return last + d
      }
      param.setValueAtTime(MIN_GAIN, t0)
      param.exponentialRampToValueAtTime(pk, t0 + a)
      param.exponentialRampToValueAtTime(MIN_GAIN, t0 + a + d)
      return t0 + a + d
    } catch (e) {
      return t0 + a + d
    }
  }

  // 振荡器音色：osc -> [waveshaper] -> [filters] -> gain(包络) -> dest
  _tone(v, s = {}) {
    const ctx = this._ctx
    if (!ctx || !v) return null
    const t0 = s.t0 != null ? s.t0 : v.t0
    const attack = Math.max(0.002, num(s.attack, 0.005))
    const decay = Math.max(0.02, num(s.decay, 0.2))
    const peak = num(s.peak, 0.2)
    const r = v.r
    let osc = null
    try {
      osc = ctx.createOscillator()
    } catch (e) {
      return null
    }
    osc.type = s.type || 'sine'
    if (s.detune) {
      try {
        osc.detune.value = num(s.detune, 0)
      } catch (e) {
        /* ignore */
      }
    }
    const f0 = Math.max(1, num(s.f0, 440) * r)
    const sweep = Math.max(0.01, num(s.sweep, attack + decay))
    try {
      osc.frequency.setValueAtTime(f0, t0)
      if (s.f1 != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, num(s.f1, f0) * r), t0 + sweep)
      }
    } catch (e) {
      /* ignore */
    }
    let node = osc
    if (s.shaper) {
      try {
        const ws = ctx.createWaveShaper()
        ws.curve = this._curve()
        ws.oversample = '2x'
        node.connect(ws)
        node = ws
        v.nodes.push(ws)
      } catch (e) {
        /* ignore */
      }
    }
    const filters = s.filters || []
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i]
      try {
        const bq = ctx.createBiquadFilter()
        bq.type = f.type || 'lowpass'
        bq.frequency.setValueAtTime(Math.max(1, num(f.f0, 1000) * r), t0)
        if (f.f1 != null) {
          const fs = Math.max(0.01, num(f.sweep, attack + decay))
          bq.frequency.exponentialRampToValueAtTime(Math.max(1, num(f.f1, 1000) * r), t0 + fs)
        }
        if (f.q != null) bq.Q.value = Math.max(0.0001, num(f.q, 1))
        node.connect(bq)
        node = bq
        v.nodes.push(bq)
      } catch (e) {
        /* ignore */
      }
    }
    let g = null
    try {
      g = ctx.createGain()
      g.gain.value = MIN_GAIN
      node.connect(g)
      g.connect(s.dest || v.input)
      v.nodes.push(g)
    } catch (e) {
      return null
    }
    const end = this._envelope(g.gain, t0, attack, decay, peak, s.points)
    const stopAt = end + 0.06
    // 颤音 LFO（growl 用），接到 detune 上
    if (s.lfo) {
      try {
        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = Math.max(0.05, num(s.lfo.rate, 6.5))
        const lg = ctx.createGain()
        lg.gain.value = num(s.lfo.depth, 12)
        lfo.connect(lg)
        lg.connect(osc.detune)
        lfo.start(t0)
        lfo.stop(stopAt)
        v.sources.push(lfo)
        v.nodes.push(lg)
      } catch (e) {
        /* ignore */
      }
    }
    try {
      osc.start(t0)
      osc.stop(stopAt)
    } catch (e) {
      /* ignore */
    }
    v.sources.push(osc)
    if (stopAt > v.end) v.end = stopAt
    return osc
  }

  // 噪声音色：bufferSource(循环) -> [filters] -> gain(包络) -> dest
  _noise(v, s = {}) {
    const ctx = this._ctx
    if (!ctx || !v) return null
    if (!this._noiseBuf) this._ensureNoise()
    if (!this._noiseBuf) return null
    const t0 = s.t0 != null ? s.t0 : v.t0
    const attack = Math.max(0.002, num(s.attack, 0.004))
    const decay = Math.max(0.02, num(s.decay, 0.2))
    const peak = num(s.peak, 0.25)
    const r = v.r
    let src = null
    try {
      src = ctx.createBufferSource()
      src.buffer = this._noiseBuf
      src.loop = true
      src.playbackRate.value = clamp(num(s.rate, 1) * r, 0.05, 8)
    } catch (e) {
      return null
    }
    let node = src
    const filters = s.filters || []
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i]
      try {
        const bq = ctx.createBiquadFilter()
        bq.type = f.type || 'lowpass'
        bq.frequency.setValueAtTime(Math.max(1, num(f.f0, 1000) * r), t0)
        if (f.f1 != null) {
          const fs = Math.max(0.01, num(f.sweep, attack + decay))
          bq.frequency.exponentialRampToValueAtTime(Math.max(1, num(f.f1, 1000) * r), t0 + fs)
        }
        if (f.q != null) bq.Q.value = Math.max(0.0001, num(f.q, 1))
        node.connect(bq)
        node = bq
        v.nodes.push(bq)
      } catch (e) {
        /* ignore */
      }
    }
    let g = null
    try {
      g = ctx.createGain()
      g.gain.value = MIN_GAIN
      node.connect(g)
      g.connect(s.dest || v.input)
      v.nodes.push(g)
    } catch (e) {
      return null
    }
    const end = this._envelope(g.gain, t0, attack, decay, peak, s.points)
    const stopAt = end + 0.06
    try {
      const dur = this._noiseBuf.duration
      src.start(t0, Math.random() * Math.max(0, dur - 0.05))
      src.stop(stopAt)
    } catch (e) {
      return null
    }
    v.sources.push(src)
    if (stopAt > v.end) v.end = stopAt
    return src
  }

  // ---------------------------------------------------------------- 内部：声部预算

  _beginVoice(vol, pan, rate) {
    const ctx = this._ctx
    if (!ctx) return null
    let input = null
    try {
      input = ctx.createGain()
      input.gain.value = Math.max(MIN_GAIN, vol)
    } catch (e) {
      return null
    }
    const v = {
      input,
      nodes: [input],
      sources: [],
      r: rate,
      t0: ctx.currentTime,
      end: ctx.currentTime,
      timer: 0,
      dead: false,
    }
    let tail = input
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      try {
        const panner = ctx.createStereoPanner()
        panner.pan.value = pan
        input.connect(panner)
        tail = panner
        v.nodes.push(panner)
      } catch (e) {
        tail = input
      }
    }
    try {
      tail.connect(this._voiceBus)
    } catch (e) {
      this._reap(v)
      return null
    }
    this._voices.push(v)
    // 超预算：抢占最旧的声部（先短淡出再摘，绝不让节点泄漏）
    while (this._voices.length > MAX_VOICES) this._steal(this._voices[0])
    return v
  }

  _armReap(v) {
    const ctx = this._ctx
    if (!ctx) {
      this._reap(v)
      return
    }
    const delay = Math.max(0.05, v.end - ctx.currentTime) * 1000 + 120
    v.timer = this._later(() => {
      v.timer = 0
      this._reap(v)
    }, delay)
  }

  // 幂等回收：停源 -> 断开节点 -> 移出声部表
  _reap(v) {
    if (!v || v.dead) return
    v.dead = true
    this._disposeVoiceNodes(v)
  }

  // 超出预算时抢占最旧的声部：30ms 淡出后再断，避免硬切爆音
  _steal(v) {
    if (!v || v.dead) return
    v.dead = true
    const idx = this._voices.indexOf(v)
    if (idx >= 0) this._voices.splice(idx, 1)
    v.timer = this._clearTimer(v.timer)
    if (this._ctx) {
      try {
        const p = v.input.gain
        const now = this._ctx.currentTime
        p.cancelScheduledValues(now)
        p.setValueAtTime(Math.max(MIN_GAIN, p.value), now)
        p.linearRampToValueAtTime(MIN_GAIN, now + 0.03)
      } catch (e) {
        /* ignore */
      }
    }
    this._dying.add(v)
    v.timer = this._later(() => {
      this._dying.delete(v)
      this._disposeVoiceNodes(v)
    }, 60)
  }

  // 真正释放一个声部的全部节点
  _disposeVoiceNodes(v) {
    v.timer = this._clearTimer(v.timer)
    for (let i = 0; i < v.sources.length; i++) {
      try {
        v.sources[i].stop()
      } catch (e) {
        /* ignore */
      }
    }
    for (let i = 0; i < v.nodes.length; i++) {
      try {
        v.nodes[i].disconnect()
      } catch (e) {
        /* ignore */
      }
    }
    v.sources.length = 0
    v.nodes.length = 0
    const idx = this._voices.indexOf(v)
    if (idx >= 0) this._voices.splice(idx, 1)
  }

  // ---------------------------------------------------------------- 内部：音效库

  _sfx(name, v) {
    switch (name) {
      // 短促的、被滤过的噪声闷响，音高随机
      case 'step': {
        const f = rand(680, 1650)
        this._noise(v, {
          attack: 0.003,
          decay: 0.075,
          peak: rand(0.24, 0.36),
          rate: rand(0.7, 1.25),
          filters: [{ type: 'lowpass', f0: f, f1: f * 0.34, q: 1.5 }],
        })
        break
      }
      // 柔和向上的噪声呼啸
      case 'jump': {
        this._noise(v, {
          attack: 0.012,
          decay: 0.23,
          peak: 0.24,
          rate: 1.0,
          filters: [{ type: 'bandpass', f0: 250, f1: 1900, q: 1.3, sweep: 0.2 }],
        })
        this._tone(v, { type: 'sine', f0: 170, f1: 300, attack: 0.01, decay: 0.1, peak: 0.05 })
        break
      }
      // 更低沉、更重的落地
      case 'land': {
        const f = rand(420, 760)
        this._noise(v, {
          attack: 0.004,
          decay: 0.24,
          peak: 0.4,
          rate: 0.62,
          filters: [{ type: 'lowpass', f0: f, f1: 90, q: 1.0 }],
        })
        this._tone(v, { type: 'sine', f0: 98, f1: 42, attack: 0.005, decay: 0.26, peak: 0.26 })
        break
      }
      // 湿漉漉的咀嚼：低通噪声爆发 + 快速下滑音
      case 'eat': {
        this._noise(v, {
          attack: 0.004,
          decay: 0.07,
          peak: 0.36,
          rate: 0.85,
          filters: [{ type: 'lowpass', f0: 900, f1: 220, q: 2.4 }],
        })
        this._noise(v, {
          t0: v.t0 + 0.1,
          attack: 0.004,
          decay: 0.06,
          peak: 0.24,
          rate: 0.7,
          filters: [{ type: 'lowpass', f0: 700, f1: 190, q: 2.6 }],
        })
        this._tone(v, {
          type: 'square',
          f0: 210,
          f1: 74,
          attack: 0.004,
          decay: 0.07,
          peak: 0.14,
          filters: [{ type: 'lowpass', f0: 900, q: 1 }],
        })
        break
      }
      // 中频失真方波，极快衰减
      case 'hurt': {
        this._tone(v, {
          type: 'square',
          f0: rand(300, 350),
          f1: 150,
          attack: 0.003,
          decay: 0.19,
          peak: 0.32,
          shaper: true,
          filters: [{ type: 'lowpass', f0: 2200, f1: 900, q: 3.5 }],
        })
        this._noise(v, {
          attack: 0.003,
          decay: 0.12,
          peak: 0.14,
          rate: 1.2,
          filters: [{ type: 'bandpass', f0: 1200, f1: 500, q: 2 }],
        })
        break
      }
      // 下行失谐双音 + 噪声冲刷
      case 'death': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 300,
          f1: 48,
          detune: -9,
          attack: 0.012,
          decay: 1.15,
          peak: 0.26,
          filters: [{ type: 'lowpass', f0: 1400, f1: 220, q: 2.5 }],
        })
        this._tone(v, {
          type: 'sawtooth',
          f0: 300,
          f1: 46,
          detune: 11,
          attack: 0.012,
          decay: 1.15,
          peak: 0.22,
          filters: [{ type: 'lowpass', f0: 1200, f1: 200, q: 2.5 }],
        })
        this._noise(v, {
          attack: 0.06,
          decay: 1.3,
          peak: 0.16,
          rate: 0.75,
          filters: [{ type: 'lowpass', f0: 1100, f1: 180, q: 1.2, sweep: 1.3 }],
        })
        this._tone(v, { type: 'sine', f0: 120, f1: 30, attack: 0.02, decay: 1.35, peak: 0.18 })
        break
      }
      // 明亮短促的铃音
      case 'pickup': {
        this._tone(v, { type: 'sine', f0: 1180, f1: 1420, attack: 0.004, decay: 0.16, peak: 0.2 })
        this._tone(v, { type: 'sine', f0: 1770, attack: 0.004, decay: 0.11, peak: 0.09 })
        this._noise(v, {
          attack: 0.002,
          decay: 0.05,
          peak: 0.05,
          rate: 1.6,
          filters: [{ type: 'highpass', f0: 2600 }],
        })
        break
      }
      // 噪声鞭响
      case 'throw': {
        this._noise(v, {
          attack: 0.006,
          decay: 0.14,
          peak: 0.28,
          rate: 1.5,
          filters: [{ type: 'bandpass', f0: 2400, f1: 380, q: 3.2, sweep: 0.13 }],
        })
        break
      }
      // 温暖的低音双钟，解决感（G4 -> C5）
      case 'hibernate': {
        const notes = [392, 523.25]
        for (let i = 0; i < 2; i++) {
          const t0 = v.t0 + i * 0.19
          this._tone(v, {
            type: 'triangle',
            t0,
            f0: notes[i],
            attack: 0.02 + i * 0.012,
            decay: 1.0,
            peak: 0.15,
            filters: [{ type: 'lowpass', f0: 2400, q: 0.8 }],
          })
          this._tone(v, {
            type: 'sine',
            t0,
            f0: notes[i] * 2,
            attack: 0.024,
            decay: 0.6,
            peak: 0.05,
          })
        }
        break
      }
      // 倒放式渐强（醒来）
      case 'wake': {
        this._noise(v, {
          attack: 0.6,
          decay: 0.14,
          peak: 0.24,
          rate: 0.9,
          filters: [{ type: 'lowpass', f0: 200, f1: 2400, q: 1.2, sweep: 0.6 }],
        })
        this._tone(v, { type: 'sine', f0: 68, f1: 150, attack: 0.6, decay: 0.2, peak: 0.12, sweep: 0.6 })
        break
      }
      // 金属滑门
      case 'door': {
        this._noise(v, {
          attack: 0.02,
          decay: 0.4,
          peak: 0.22,
          rate: 0.9,
          filters: [{ type: 'bandpass', f0: 2400, f1: 1200, q: 3.5, sweep: 0.45 }],
        })
        this._tone(v, {
          type: 'square',
          f0: 150,
          f1: 96,
          attack: 0.03,
          decay: 0.32,
          peak: 0.06,
          filters: [{ type: 'bandpass', f0: 620, q: 6 }],
        })
        break
      }
      // 低音锯齿 + LFO 抖动 -> 低通
      case 'growl': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 78,
          f1: 62,
          attack: 0.05,
          decay: 0.7,
          peak: 0.28,
          sweep: 0.7,
          lfo: { rate: rand(6, 9), depth: 26 },
          filters: [{ type: 'lowpass', f0: 340, f1: 150, q: 5, sweep: 0.7 }],
        })
        this._tone(v, {
          type: 'sawtooth',
          f0: 117,
          f1: 92,
          detune: 7,
          attack: 0.08,
          decay: 0.55,
          peak: 0.11,
          filters: [{ type: 'lowpass', f0: 260, q: 4 }],
        })
        break
      }
      // 明亮噪声爆发 + 滤波下扫
      case 'splash': {
        this._noise(v, {
          attack: 0.004,
          decay: 0.34,
          peak: 0.4,
          rate: 1.1,
          filters: [{ type: 'bandpass', f0: 4200, f1: 620, q: 1.1, sweep: 0.34 }],
        })
        this._noise(v, {
          attack: 0.006,
          decay: 0.22,
          peak: 0.15,
          rate: 1.4,
          filters: [{ type: 'highpass', f0: 3000, f1: 1200, sweep: 0.22 }],
        })
        this._tone(v, { type: 'sine', f0: 900, f1: 260, attack: 0.004, decay: 0.18, peak: 0.07 })
        break
      }
      // 水中的划动（比 splash 轻、闷）
      case 'swim': {
        this._noise(v, {
          attack: 0.012,
          decay: 0.16,
          peak: 0.15,
          rate: 0.85,
          filters: [{ type: 'bandpass', f0: 380, f1: 1150, q: 1.6, sweep: 0.16 }],
        })
        this._tone(v, { type: 'sine', f0: 220, f1: 400, attack: 0.012, decay: 0.12, peak: 0.035 })
        break
      }
      // 渐强的雨幕冲刷
      case 'rainStart': {
        this._noise(v, {
          attack: 1.1,
          decay: 0.4,
          peak: 0.3,
          rate: 1.0,
          filters: [{ type: 'lowpass', f0: 340, f1: 5200, q: 0.9, sweep: 1.1 }],
        })
        this._noise(v, {
          attack: 1.25,
          decay: 0.45,
          peak: 0.12,
          rate: 1.5,
          filters: [{ type: 'highpass', f0: 800, f1: 2800, sweep: 1.25 }],
        })
        break
      }
      // 长低鸣，振幅随机调制
      case 'thunder': {
        const pts = []
        let tt = 0
        let amp = 1
        while (tt < 2.1) {
          tt += rand(0.06, 0.19)
          amp *= 0.93
          pts.push({ t: tt, v: clamp(0.5 * amp * rand(0.35, 1), MIN_GAIN, 0.6) })
        }
        this._noise(v, {
          points: pts,
          decay: 0.45,
          rate: 0.55,
          filters: [{ type: 'lowpass', f0: 280, f1: 85, q: 1.2, sweep: 2.2 }],
        })
        this._tone(v, { type: 'sine', f0: 44, f1: 27, attack: 0.08, decay: 2.2, peak: 0.18 })
        this._noise(v, {
          attack: 0.03,
          decay: 0.5,
          peak: 0.11,
          rate: 1.2,
          filters: [{ type: 'bandpass', f0: 950, f1: 320, q: 1.4 }],
        })
        break
      }
      // 两声低音心跳
      case 'heartbeat': {
        this._tone(v, { type: 'sine', f0: 62, f1: 40, attack: 0.006, decay: 0.16, peak: 0.32 })
        this._tone(v, {
          type: 'sine',
          t0: v.t0 + 0.23,
          f0: 56,
          f1: 36,
          attack: 0.006,
          decay: 0.2,
          peak: 0.24,
        })
        break
      }
      // 极短界面点击
      case 'uiClick': {
        this._noise(v, {
          attack: 0.002,
          decay: 0.028,
          peak: 0.09,
          rate: 1.8,
          filters: [{ type: 'highpass', f0: 2400 }],
        })
        this._tone(v, { type: 'square', f0: 1600, f1: 900, attack: 0.002, decay: 0.03, peak: 0.045 })
        break
      }
      // 更轻的悬停提示音
      case 'uiHover': {
        this._tone(v, { type: 'sine', f0: 1320, f1: 1560, attack: 0.003, decay: 0.05, peak: 0.04 })
        break
      }

      // ============================================================ 武器（v2）
      // 手枪：极短宽带爆音 + 低频冲击 + 尾部余响
      case 'pistol': {
        this._noise(v, {
          attack: 0.001,
          decay: 0.05,
          peak: 0.5,
          rate: 1.7,
          filters: [{ type: 'bandpass', f0: 2400, f1: 700, q: 0.9, sweep: 0.05 }],
        })
        this._noise(v, {
          attack: 0.002,
          decay: 0.13,
          peak: 0.34,
          rate: 0.65,
          filters: [{ type: 'lowpass', f0: 900, f1: 180, q: 1.1 }],
        })
        this._tone(v, {
          type: 'square',
          f0: 190,
          f1: 62,
          attack: 0.002,
          decay: 0.09,
          peak: 0.22,
          filters: [{ type: 'lowpass', f0: 1200, f1: 400 }],
        })
        break
      }
      // 激光（轻）：明亮快速下扫 + 高通噪声，很短
      case 'laser': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 1650,
          f1: 260,
          attack: 0.002,
          decay: 0.13,
          peak: 0.26,
          sweep: 0.12,
          filters: [{ type: 'highpass', f0: 700 }, { type: 'lowpass', f0: 5200, q: 1.4 }],
        })
        this._noise(v, {
          attack: 0.002,
          decay: 0.1,
          peak: 0.16,
          rate: 1.4,
          filters: [{ type: 'highpass', f0: 3200, f1: 1400 }],
        })
        break
      }
      // 激光（重）：更低沉更长，带失真和谐波
      case 'laser_heavy': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 760,
          f1: 88,
          attack: 0.006,
          decay: 0.42,
          peak: 0.34,
          sweep: 0.4,
          shaper: true,
          filters: [{ type: 'lowpass', f0: 3000, f1: 420, q: 2.2 }],
        })
        this._tone(v, { type: 'sine', f0: 70, f1: 38, attack: 0.008, decay: 0.4, peak: 0.22 })
        this._noise(v, {
          attack: 0.004,
          decay: 0.3,
          peak: 0.18,
          rate: 1.0,
          filters: [{ type: 'bandpass', f0: 2600, f1: 500, q: 1.2, sweep: 0.3 }],
        })
        break
      }
      // 钉枪：极高 Q 的短金属 tick
      case 'nail': {
        this._noise(v, {
          attack: 0.001,
          decay: 0.045,
          peak: 0.26,
          rate: 1.9,
          filters: [
            { type: 'bandpass', f0: 3400, f1: 2000, q: 7, sweep: 0.04 },
            { type: 'highpass', f0: 900 },
          ],
        })
        this._tone(v, { type: 'square', f0: 980, f1: 620, attack: 0.001, decay: 0.035, peak: 0.08 })
        break
      }
      // 废料弹射：低频抛射 + 金属刮擦
      case 'scrap_launch': {
        this._noise(v, {
          attack: 0.004,
          decay: 0.2,
          peak: 0.32,
          rate: 0.9,
          filters: [{ type: 'lowpass', f0: 1400, f1: 320, q: 1.6 }],
        })
        this._noise(v, {
          t0: v.t0 + 0.02,
          attack: 0.004,
          decay: 0.16,
          peak: 0.12,
          rate: 1.5,
          filters: [{ type: 'bandpass', f0: 2300, f1: 1500, q: 9 }],
        })
        this._tone(v, { type: 'triangle', f0: 240, f1: 120, attack: 0.006, decay: 0.16, peak: 0.1 })
        break
      }
      // 电弧：方波 + 极快颤音 + 高频嘶
      case 'arc': {
        this._tone(v, {
          type: 'square',
          f0: 96,
          f1: 140,
          attack: 0.004,
          decay: 0.2,
          peak: 0.2,
          lfo: { rate: 42, depth: 90 },
          filters: [{ type: 'bandpass', f0: 1200, q: 2.2 }],
        })
        this._noise(v, {
          attack: 0.002,
          decay: 0.16,
          peak: 0.2,
          rate: 1.3,
          filters: [{ type: 'highpass', f0: 4200, f1: 2600 }],
        })
        break
      }
      // 轨道炮：0.5s 充能上扬 + 末端爆裂
      case 'rail': {
        this._tone(v, { type: 'sine', f0: 180, f1: 1700, attack: 0.5, decay: 0.16, peak: 0.22, sweep: 0.5 })
        this._noise(v, {
          attack: 0.5,
          decay: 0.12,
          peak: 0.16,
          rate: 1.2,
          filters: [{ type: 'bandpass', f0: 600, f1: 3600, q: 1.4, sweep: 0.5 }],
        })
        this._tone(v, {
          t0: v.t0 + 0.5,
          type: 'square',
          f0: 320,
          f1: 60,
          attack: 0.002,
          decay: 0.2,
          peak: 0.28,
          shaper: true,
          filters: [{ type: 'lowpass', f0: 4000, f1: 300 }],
        })
        break
      }
      // 挥锤（挥空）：低频 whoosh，无强瞬态
      case 'hammer_swing': {
        this._noise(v, {
          attack: 0.09,
          decay: 0.26,
          peak: 0.2,
          rate: 0.7,
          filters: [{ type: 'bandpass', f0: 260, f1: 900, q: 1.1, sweep: 0.3 }],
        })
        break
      }
      // 重锤命中：低频冲击 + 两个高 Q 金属余响
      case 'hammer_hit': {
        this._tone(v, { type: 'sine', f0: 96, f1: 40, attack: 0.003, decay: 0.3, peak: 0.34 })
        this._noise(v, {
          attack: 0.002,
          decay: 0.24,
          peak: 0.3,
          rate: 0.7,
          filters: [{ type: 'lowpass', f0: 800, f1: 120, q: 1.2 }],
        })
        this._tone(v, {
          type: 'triangle',
          f0: 1420,
          attack: 0.002,
          decay: 0.4,
          peak: 0.13,
          filters: [{ type: 'bandpass', f0: 1420, q: 14 }],
        })
        this._tone(v, {
          type: 'triangle',
          f0: 2130,
          attack: 0.002,
          decay: 0.32,
          peak: 0.08,
          filters: [{ type: 'bandpass', f0: 2130, q: 16 }],
        })
        break
      }
      // 匕首：高频轻快划破
      case 'dagger': {
        this._noise(v, {
          attack: 0.003,
          decay: 0.1,
          peak: 0.2,
          rate: 1.6,
          filters: [{ type: 'highpass', f0: 2600, f1: 900, sweep: 0.1 }],
        })
        this._tone(v, { type: 'sine', f0: 1500, f1: 700, attack: 0.003, decay: 0.08, peak: 0.06 })
        break
      }
      // 铁管钝击：闷、短、方波底色
      case 'pipe': {
        this._noise(v, {
          attack: 0.003,
          decay: 0.16,
          peak: 0.3,
          rate: 0.6,
          filters: [{ type: 'lowpass', f0: 950, f1: 200, q: 1.4 }],
        })
        this._tone(v, {
          type: 'square',
          f0: 150,
          f1: 76,
          attack: 0.004,
          decay: 0.14,
          peak: 0.16,
          filters: [{ type: 'lowpass', f0: 700 }],
        })
        break
      }
      // 电击：锯齿 + 更快颤音 + 带通噪声
      case 'shock': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 128,
          f1: 110,
          attack: 0.004,
          decay: 0.24,
          peak: 0.24,
          lfo: { rate: 58, depth: 120 },
          filters: [{ type: 'bandpass', f0: 1800, q: 3 }],
        })
        this._noise(v, {
          attack: 0.003,
          decay: 0.2,
          peak: 0.22,
          rate: 1.1,
          filters: [{ type: 'bandpass', f0: 3000, f1: 1200, q: 2.5, sweep: 0.2 }],
        })
        break
      }
      // 上膛：两段机械声（拉栓 + 卡入）
      case 'reload': {
        this._noise(v, {
          attack: 0.002,
          decay: 0.05,
          peak: 0.22,
          rate: 1.4,
          filters: [{ type: 'bandpass', f0: 1900, q: 6 }],
        })
        this._noise(v, {
          t0: v.t0 + 0.13,
          attack: 0.002,
          decay: 0.07,
          peak: 0.26,
          rate: 1.1,
          filters: [{ type: 'bandpass', f0: 1250, q: 5 }],
        })
        this._tone(v, {
          t0: v.t0 + 0.13,
          type: 'square',
          f0: 420,
          f1: 260,
          attack: 0.002,
          decay: 0.06,
          peak: 0.06,
        })
        break
      }
      // 空仓：一声干响
      case 'empty': {
        this._noise(v, {
          attack: 0.001,
          decay: 0.03,
          peak: 0.16,
          rate: 1.8,
          filters: [{ type: 'highpass', f0: 2800, q: 2 }],
        })
        this._tone(v, { type: 'square', f0: 520, f1: 300, attack: 0.001, decay: 0.04, peak: 0.05 })
        break
      }
      // 换武器：机械滑动 + 卡扣
      case 'weapon_swap': {
        this._noise(v, {
          attack: 0.005,
          decay: 0.12,
          peak: 0.2,
          rate: 1.1,
          filters: [{ type: 'bandpass', f0: 900, f1: 2200, q: 3, sweep: 0.12 }],
        })
        this._noise(v, {
          t0: v.t0 + 0.14,
          attack: 0.002,
          decay: 0.05,
          peak: 0.18,
          rate: 1.5,
          filters: [{ type: 'bandpass', f0: 2600, q: 8 }],
        })
        break
      }
      // 金属撞击：宽带瞬态 + 两条金属模态余响
      case 'impact_metal': {
        this._noise(v, {
          attack: 0.001,
          decay: 0.12,
          peak: 0.34,
          rate: 1.2,
          filters: [{ type: 'highpass', f0: 1200 }],
        })
        this._tone(v, {
          type: 'triangle',
          f0: 2450,
          attack: 0.002,
          decay: 0.5,
          peak: 0.12,
          filters: [{ type: 'bandpass', f0: 2450, q: 18 }],
        })
        this._tone(v, {
          type: 'triangle',
          f0: 1780,
          attack: 0.002,
          decay: 0.42,
          peak: 0.1,
          filters: [{ type: 'bandpass', f0: 1780, q: 15 }],
        })
        this._tone(v, { type: 'sine', f0: 130, f1: 70, attack: 0.003, decay: 0.16, peak: 0.14 })
        break
      }
      // 打中软组织：闷、湿、低频
      case 'impact_flesh': {
        this._noise(v, {
          attack: 0.003,
          decay: 0.12,
          peak: 0.3,
          rate: 0.8,
          filters: [{ type: 'lowpass', f0: 520, f1: 150, q: 2 }],
        })
        this._tone(v, { type: 'sine', f0: 82, f1: 40, attack: 0.004, decay: 0.14, peak: 0.18 })
        break
      }

      // ============================================================ 大型敌人 / 生态（v2）
      // 石魔脚步：极低频落地
      case 'golem_step': {
        this._tone(v, { type: 'sine', f0: 58, f1: 26, attack: 0.01, decay: 0.42, peak: 0.5 })
        this._noise(v, {
          attack: 0.008,
          decay: 0.4,
          peak: 0.34,
          rate: 0.5,
          filters: [{ type: 'lowpass', f0: 260, f1: 60, q: 1.2 }],
        })
        break
      }
      // 石魔投掷：沉重抛射
      case 'golem_throw': {
        this._noise(v, {
          attack: 0.06,
          decay: 0.45,
          peak: 0.34,
          rate: 0.55,
          filters: [{ type: 'bandpass', f0: 200, f1: 620, q: 0.9, sweep: 0.4 }],
        })
        this._tone(v, {
          type: 'sawtooth',
          f0: 90,
          f1: 44,
          attack: 0.05,
          decay: 0.4,
          peak: 0.16,
          filters: [{ type: 'lowpass', f0: 380, q: 2 }],
        })
        break
      }
      // 石魔破碎：随机折线振幅的碎裂 + 低频
      case 'golem_break': {
        const pts = []
        let t = 0
        while (t < 0.55) {
          t += rand(0.03, 0.09)
          pts.push({ t, v: rand(0.1, 0.5) * (1 - t / 0.7) })
        }
        this._noise(v, {
          points: pts,
          decay: 0.3,
          rate: 0.8,
          filters: [{ type: 'lowpass', f0: 2400, f1: 180, q: 1.1, sweep: 0.6 }],
        })
        this._tone(v, { type: 'sine', f0: 70, f1: 32, attack: 0.01, decay: 0.6, peak: 0.3 })
        break
      }
      // 监工冲锋：上行咆哮 + 带通风压
      case 'warden_charge': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 62,
          f1: 116,
          attack: 0.25,
          decay: 0.6,
          peak: 0.3,
          sweep: 0.8,
          lfo: { rate: 7.5, depth: 22 },
          filters: [{ type: 'lowpass', f0: 300, f1: 900, q: 3.5, sweep: 0.8 }],
        })
        this._noise(v, {
          attack: 0.3,
          decay: 0.5,
          peak: 0.2,
          rate: 0.9,
          filters: [{ type: 'bandpass', f0: 180, f1: 900, q: 1.2, sweep: 0.7 }],
        })
        break
      }
      // 监工激光：更低更长的失真光束
      case 'warden_laser': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 320,
          f1: 110,
          attack: 0.02,
          decay: 0.6,
          peak: 0.34,
          sweep: 0.6,
          shaper: true,
          filters: [{ type: 'lowpass', f0: 3400, f1: 600, q: 2 }],
        })
        this._tone(v, { type: 'sine', f0: 1180, f1: 640, attack: 0.02, decay: 0.5, peak: 0.12 })
        this._noise(v, {
          attack: 0.02,
          decay: 0.5,
          peak: 0.16,
          rate: 1.1,
          filters: [{ type: 'highpass', f0: 2600 }],
        })
        break
      }
      // 监工过热：蒸汽泄压 + 下沉机械音
      case 'warden_overheat': {
        this._noise(v, {
          attack: 0.05,
          decay: 0.95,
          peak: 0.24,
          rate: 1.2,
          filters: [
            { type: 'highpass', f0: 1600, f1: 3200, sweep: 0.3 },
            { type: 'lowpass', f0: 6200 },
          ],
        })
        this._tone(v, {
          type: 'sawtooth',
          f0: 210,
          f1: 48,
          attack: 0.04,
          decay: 0.9,
          peak: 0.14,
          filters: [{ type: 'lowpass', f0: 900, f1: 180, q: 3 }],
        })
        break
      }
      // 拟态揭穿：不协和双音上行 + 噪声上扬
      case 'mimic_reveal': {
        this._tone(v, { type: 'sine', f0: 220, f1: 330, attack: 0.35, decay: 0.4, peak: 0.14, sweep: 0.65 })
        this._tone(v, { type: 'sine', f0: 233, f1: 349, attack: 0.35, decay: 0.4, peak: 0.12, sweep: 0.65 })
        this._noise(v, {
          attack: 0.4,
          decay: 0.3,
          peak: 0.16,
          rate: 1.3,
          filters: [{ type: 'highpass', f0: 900, f1: 4200, sweep: 0.6 }],
        })
        break
      }
      // 拟态撕咬：两段咬合 + 下滑方波
      case 'mimic_bite': {
        this._noise(v, {
          attack: 0.002,
          decay: 0.07,
          peak: 0.34,
          rate: 1.1,
          filters: [{ type: 'lowpass', f0: 1200, f1: 300, q: 2.5 }],
        })
        this._noise(v, {
          t0: v.t0 + 0.07,
          attack: 0.002,
          decay: 0.09,
          peak: 0.26,
          rate: 0.9,
          filters: [{ type: 'lowpass', f0: 900, f1: 200, q: 2.5 }],
        })
        this._tone(v, { type: 'square', f0: 300, f1: 82, attack: 0.003, decay: 0.12, peak: 0.14 })
        break
      }
      // 虫群嗡鸣：锯齿 + 快速颤音 + 带通
      case 'swarm_buzz': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 190,
          f1: 175,
          attack: 0.03,
          decay: 0.5,
          peak: 0.16,
          lfo: { rate: 27, depth: 38 },
          filters: [{ type: 'bandpass', f0: 1300, q: 4 }],
        })
        this._noise(v, {
          attack: 0.04,
          decay: 0.45,
          peak: 0.1,
          rate: 1.4,
          filters: [{ type: 'bandpass', f0: 2400, q: 2 }],
        })
        break
      }
      // 虫群炸开：多段高频短音 + 底噪
      case 'swarm_burst': {
        for (let i = 0; i < 4; i++) {
          this._noise(v, {
            t0: v.t0 + i * 0.045,
            attack: 0.002,
            decay: 0.06,
            peak: 0.09 - i * 0.012,
            rate: 1.6 + i * 0.1,
            filters: [{ type: 'highpass', f0: 2600 }],
          })
        }
        this._tone(v, {
          type: 'sawtooth',
          f0: 210,
          f1: 150,
          attack: 0.01,
          decay: 0.3,
          peak: 0.12,
          lfo: { rate: 31, depth: 30 },
          filters: [{ type: 'bandpass', f0: 1500, q: 3 }],
        })
        break
      }
      // 蟑螂疾走：一串极短高频 tick
      case 'roach_skitter': {
        for (let i = 0; i < 5; i++) {
          this._noise(v, {
            t0: v.t0 + i * 0.028 + rand(0, 0.012),
            attack: 0.001,
            decay: 0.022,
            peak: 0.1,
            rate: 2,
            filters: [{ type: 'highpass', f0: 3200 }],
          })
        }
        break
      }
      // 植被摩擦：带随机振幅调制的带通噪声
      case 'plant_rustle': {
        const pts = []
        let t = 0
        while (t < 0.45) {
          t += rand(0.04, 0.1)
          pts.push({ t, v: rand(0.05, 0.2) })
        }
        this._noise(v, { points: pts, decay: 0.15, rate: 1.25, filters: [{ type: 'bandpass', f0: 2600, q: 1.1 }] })
        break
      }
      // 老鼠吱叫：高频三角波 + 颤音
      case 'rat_squeak': {
        this._tone(v, {
          type: 'triangle',
          f0: 2650,
          f1: 1750,
          attack: 0.006,
          decay: 0.1,
          peak: 0.14,
          lfo: { rate: 32, depth: 40 },
          filters: [{ type: 'highpass', f0: 1200 }],
        })
        break
      }
      // 苍蝇嗡鸣：低幅锯齿 + 更快颤音
      case 'fly_buzz': {
        this._tone(v, {
          type: 'sawtooth',
          f0: 235,
          f1: 225,
          attack: 0.02,
          decay: 0.42,
          peak: 0.1,
          lfo: { rate: 62, depth: 26 },
          filters: [{ type: 'bandpass', f0: 780, q: 3 }],
        })
        break
      }

      // ============================================================ 天气 / 日夜（v2）
      // 轻风：低频缓起缓落
      case 'wind_soft': {
        this._noise(v, {
          attack: 0.5,
          decay: 0.9,
          peak: 0.12,
          rate: 0.8,
          filters: [{ type: 'lowpass', f0: 520, f1: 900, q: 1.2, sweep: 1.0 }],
        })
        break
      }
      // 强风：带通 + 高通双层
      case 'wind_strong': {
        this._noise(v, {
          attack: 0.35,
          decay: 1.2,
          peak: 0.24,
          rate: 0.9,
          filters: [{ type: 'bandpass', f0: 700, f1: 320, q: 0.8, sweep: 1.4 }],
        })
        this._noise(v, {
          attack: 0.5,
          decay: 1.1,
          peak: 0.1,
          rate: 1.2,
          filters: [{ type: 'highpass', f0: 1800, f1: 900, sweep: 1.2 }],
        })
        break
      }
      // 沙尘阵风：随机振幅 + 带通上扬
      case 'dust_gust': {
        const pts = []
        let t = 0
        while (t < 1.1) {
          t += rand(0.06, 0.14)
          pts.push({ t, v: rand(0.06, 0.24) })
        }
        this._noise(v, {
          points: pts,
          decay: 0.3,
          rate: 1.0,
          filters: [{ type: 'bandpass', f0: 1100, f1: 1900, q: 0.9, sweep: 1.1 }],
        })
        break
      }
      // 远雷：只有低频隆隆，没有 crack
      case 'thunder_far': {
        this._noise(v, {
          attack: 0.18,
          decay: 1.9,
          peak: 0.14,
          rate: 0.5,
          filters: [{ type: 'lowpass', f0: 170, f1: 70, q: 1.4 }],
        })
        this._tone(v, { type: 'sine', f0: 38, f1: 26, attack: 0.2, decay: 1.8, peak: 0.12 })
        break
      }
      // 近雷：先炸裂再长尾隆隆
      case 'thunder_near': {
        this._noise(v, {
          attack: 0.002,
          decay: 0.25,
          peak: 0.4,
          rate: 1.3,
          filters: [{ type: 'bandpass', f0: 3000, f1: 900, q: 0.7, sweep: 0.2 }],
        })
        const pts = []
        let t = 0.05
        while (t < 1.9) {
          t += rand(0.05, 0.16)
          pts.push({ t, v: rand(0.15, 0.5) * (1 - t / 2.4) })
        }
        this._noise(v, { points: pts, decay: 0.5, rate: 0.6, filters: [{ type: 'lowpass', f0: 260, f1: 80, q: 1.1 }] })
        this._tone(v, { type: 'sine', f0: 46, f1: 24, attack: 0.06, decay: 2.1, peak: 0.2 })
        break
      }
      // 酸雨嘶嘶：纯高频噪声，无音调
      case 'acid_hiss': {
        this._noise(v, { attack: 0.12, decay: 0.8, peak: 0.16, rate: 1.3, filters: [{ type: 'highpass', f0: 3800, q: 0.7 }] })
        break
      }
      // 毒雾气泡：三个上行短音 + 低频咕嘟
      case 'toxic_bubble': {
        for (let i = 0; i < 3; i++) {
          this._tone(v, {
            t0: v.t0 + i * 0.13 + rand(0, 0.03),
            type: 'sine',
            f0: 300 + i * 70,
            f1: 520 + i * 90,
            attack: 0.01,
            decay: 0.09,
            peak: 0.1 - i * 0.02,
          })
        }
        this._noise(v, { attack: 0.03, decay: 0.25, peak: 0.08, rate: 0.7, filters: [{ type: 'lowpass', f0: 420, q: 2 }] })
        break
      }
      // 夜鸣：两个差频正弦形成的缓慢拍音
      case 'night_hum': {
        this._tone(v, { type: 'sine', f0: 48, attack: 0.6, decay: 1.6, peak: 0.12 })
        this._tone(v, { type: 'sine', f0: 49.5, attack: 0.6, decay: 1.6, peak: 0.1 })
        this._noise(v, { attack: 0.5, decay: 1.4, peak: 0.05, rate: 0.5, filters: [{ type: 'lowpass', f0: 220 }] })
        break
      }
      // 黎明钟：三音叠加的明亮长衰减
      case 'dawn_chime': {
        this._tone(v, { type: 'sine', f0: 880, attack: 0.01, decay: 1.2, peak: 0.14 })
        this._tone(v, { type: 'sine', f0: 1320, attack: 0.02, decay: 1.0, peak: 0.08 })
        this._tone(v, { type: 'sine', f0: 1760, attack: 0.03, decay: 0.8, peak: 0.05 })
        break
      }
      // 风暴警报：660 / 440 双音交替
      case 'storm_alarm': {
        this._tone(v, {
          type: 'square',
          f0: 660,
          f1: 640,
          attack: 0.03,
          decay: 0.22,
          peak: 0.14,
          filters: [{ type: 'lowpass', f0: 2200 }],
        })
        this._tone(v, {
          t0: v.t0 + 0.26,
          type: 'square',
          f0: 440,
          f1: 430,
          attack: 0.03,
          decay: 0.24,
          peak: 0.14,
          filters: [{ type: 'lowpass', f0: 2200 }],
        })
        this._tone(v, {
          t0: v.t0 + 0.52,
          type: 'square',
          f0: 660,
          f1: 640,
          attack: 0.03,
          decay: 0.22,
          peak: 0.12,
          filters: [{ type: 'lowpass', f0: 2200 }],
        })
        break
      }
      default:
        break
    }
  }

  // ---------------------------------------------------------------- 内部：音床构建

  // 洞穴底噪：循环噪声风 + 低频 drone，滤波缓慢漂移
  _startAmbience() {
    const ctx = this._ctx
    if (!ctx || this._amb) return
    if (!this._noiseBuf) this._ensureNoise()
    if (!this._noiseBuf) return
    try {
      const t = ctx.currentTime
      const g = ctx.createGain()
      g.gain.setValueAtTime(MIN_GAIN, t)
      g.connect(this._bedBus)

      // 风：循环噪声 -> 低通（带共振）-> 增益
      const wind = ctx.createBufferSource()
      wind.buffer = this._noiseBuf
      wind.loop = true
      const windLp = ctx.createBiquadFilter()
      windLp.type = 'lowpass'
      windLp.frequency.value = 380
      windLp.Q.value = 2.2
      const windGain = ctx.createGain()
      windGain.gain.value = 0.5
      wind.connect(windLp)
      windLp.connect(windGain)
      windGain.connect(g)

      // drone：两个微失谐锯齿 -> 低通
      const d1 = ctx.createOscillator()
      d1.type = 'sawtooth'
      d1.frequency.value = 54
      const d2 = ctx.createOscillator()
      d2.type = 'sawtooth'
      d2.frequency.value = 54.4
      const droneLp = ctx.createBiquadFilter()
      droneLp.type = 'lowpass'
      droneLp.frequency.value = 180
      droneLp.Q.value = 4
      const droneGain = ctx.createGain()
      droneGain.gain.value = 0.12
      d1.connect(droneLp)
      d2.connect(droneLp)
      droneLp.connect(droneGain)
      droneGain.connect(g)

      // 缓慢的滤波漂移
      const lfo1 = ctx.createOscillator()
      lfo1.type = 'sine'
      lfo1.frequency.value = 0.047
      const lfo1Gain = ctx.createGain()
      lfo1Gain.gain.value = 160
      lfo1.connect(lfo1Gain)
      lfo1Gain.connect(windLp.frequency)
      const lfo2 = ctx.createOscillator()
      lfo2.type = 'sine'
      lfo2.frequency.value = 0.031
      const lfo2Gain = ctx.createGain()
      lfo2Gain.gain.value = 55
      lfo2.connect(lfo2Gain)
      lfo2Gain.connect(droneLp.frequency)

      wind.start(t, Math.random() * 1.5)
      d1.start(t)
      d2.start(t)
      lfo1.start(t)
      lfo2.start(t)

      // 3.5 秒缓入，避免一进游戏就“啪”一声
      g.gain.linearRampToValueAtTime(0.42, t + 3.5)

      const bed = {
        g,
        sources: [wind, d1, d2, lfo1, lfo2],
        nodes: [windLp, windGain, droneLp, droneGain, lfo1Gain, lfo2Gain],
        timer: 0,
        dead: false,
      }
      this._beds.add(bed)
      this._amb = bed
    } catch (e) {
      this._amb = null
    }
  }

  // 雨幕：双层噪声（明亮嘶声 + 低频雨体），带缓慢漂移的滤波
  _startRainBed() {
    const ctx = this._ctx
    if (!ctx) return null
    if (!this._noiseBuf) this._ensureNoise()
    if (!this._noiseBuf) return null
    try {
      const t = ctx.currentTime
      const g = ctx.createGain()
      g.gain.setValueAtTime(MIN_GAIN, t)
      g.connect(this._bedBus)

      // 明亮层
      const w1 = ctx.createBufferSource()
      w1.buffer = this._noiseBuf
      w1.loop = true
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 800
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2600
      bp.Q.value = 0.8
      const bright = ctx.createGain()
      bright.gain.value = 0.75
      w1.connect(hp)
      hp.connect(bp)
      bp.connect(bright)
      bright.connect(g)

      // 低频雨体
      const w2 = ctx.createBufferSource()
      w2.buffer = this._noiseBuf
      w2.loop = true
      w2.playbackRate.value = 0.75
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 520
      lp.Q.value = 0.9
      const body = ctx.createGain()
      body.gain.value = 0.9
      w2.connect(lp)
      lp.connect(body)
      body.connect(g)

      // 缓慢游走的截止频率
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 0.087
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 340
      lfo.connect(lfoGain)
      lfoGain.connect(bp.frequency)

      w1.start(t, Math.random() * 1.6)
      w2.start(t, Math.random() * 1.6)
      lfo.start(t)

      const bed = {
        g,
        sources: [w1, w2, lfo],
        nodes: [hp, bp, bright, lp, body, lfoGain],
        bp,
        lp,
        timer: 0,
        dead: false,
      }
      this._beds.add(bed)
      return bed
    } catch (e) {
      return null
    }
  }

  // 凶兆脉冲：低音 + 低通锯齿，被 LFO 塑形成心跳式起伏
  _startDangerBed() {
    const ctx = this._ctx
    if (!ctx) return null
    try {
      const t = ctx.currentTime
      const g = ctx.createGain()
      g.gain.setValueAtTime(MIN_GAIN, t)
      g.connect(this._bedBus)

      const sub = ctx.createOscillator()
      sub.type = 'sine'
      sub.frequency.value = 39
      const saw = ctx.createOscillator()
      saw.type = 'sawtooth'
      saw.frequency.value = 78
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 170
      lp.Q.value = 5
      const pulse = ctx.createGain()
      pulse.gain.value = 0.55
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 1.1
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.42

      lfo.connect(lfoGain)
      lfoGain.connect(pulse.gain)
      sub.connect(pulse)
      saw.connect(lp)
      lp.connect(pulse)
      pulse.connect(g)

      sub.start(t)
      saw.start(t)
      lfo.start(t)

      const bed = {
        g,
        sources: [sub, saw, lfo],
        nodes: [lp, pulse, lfoGain],
        lfo,
        timer: 0,
        dead: false,
      }
      this._beds.add(bed)
      return bed
    } catch (e) {
      return null
    }
  }

  // 淡出后停源并回收（省 CPU，也免掉长期挂着的节点）
  _fadeBed(bed, to, sec) {
    if (!bed || bed.dead) return
    this._ramp(bed.g.gain, Math.max(MIN_GAIN, to), sec)
    bed.timer = this._clearTimer(bed.timer)
    bed.timer = this._later(() => {
      bed.timer = 0
      this._killBed(bed)
    }, (sec + 0.35) * 1000)
  }

  _killBed(bed) {
    if (!bed || bed.dead) return
    bed.dead = true
    bed.timer = this._clearTimer(bed.timer)
    for (let i = 0; i < bed.sources.length; i++) {
      try {
        bed.sources[i].stop()
      } catch (e) {
        /* ignore */
      }
    }
    for (let i = 0; i < bed.nodes.length; i++) {
      try {
        bed.nodes[i].disconnect()
      } catch (e) {
        /* ignore */
      }
    }
    try {
      bed.g.disconnect()
    } catch (e) {
      /* ignore */
    }
    bed.sources.length = 0
    bed.nodes.length = 0
    this._beds.delete(bed)
    if (this._amb === bed) this._amb = null
    if (this._rain === bed) this._rain = null
    if (this._danger === bed) this._danger = null
    if (this._layerBase === bed) this._layerBase = null
    if (this._layerWeather === bed) this._layerWeather = null
    if (this._layerWind === bed) this._layerWind = null
  }

  // ---------------------------------------------------------------- 内部：环境层（日夜 / 天气）

  _normPhase(v) {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
    const canon = PHASE_ALIAS[s] || s
    return BASE_KIND[canon] ? canon : 'noon'
  }

  _normWeather(v) {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
    const canon = WEATHER_ALIAS[s] || s
    return WEATHER_KIND[canon] ? canon : 'clear'
  }

  _layerGain(kind) {
    const g = LAYER_GAIN[kind]
    return g != null ? g : 0.15
  }

  // 只调增益（不排定回收），用于淡入
  _rampBed(bed, to, sec) {
    if (!bed || bed.dead || !this._ctx) return
    this._ramp(bed.g.gain, Math.max(MIN_GAIN, to), sec, this._ctx.currentTime)
  }

  /**
   * 构建一层持续环境声。所有层都是 loop 噪声/振荡器 + 滤波，只在切换时创建一次。
   * 返回 { kind, g, sources, nodes }，并登记进 _beds 以便 dispose 统一回收。
   */
  _buildLayer(kind) {
    const ctx = this._ctx
    if (!ctx || !this._bedBus) return null
    if (!this._noiseBuf) this._ensureNoise()
    if (!this._noiseBuf) return null
    try {
      const t = ctx.currentTime
      const g = ctx.createGain()
      g.gain.setValueAtTime(MIN_GAIN, t)
      g.connect(this._bedBus)
      const bed = { kind, g, sources: [], nodes: [], timer: 0, dead: false, _seq: ++this._bedSeq }
      const addNode = (n) => {
        bed.nodes.push(n)
        return n
      }
      const addSrc = (s) => {
        bed.sources.push(s)
        s.start(t)
        return s
      }
      const mkGain = (val, dest) => {
        const n = ctx.createGain()
        n.gain.value = val
        n.connect(dest)
        return addNode(n)
      }
      const mkFilter = (type, f, q, dest) => {
        const n = ctx.createBiquadFilter()
        n.type = type
        n.frequency.value = f
        if (q != null) n.Q.value = q
        n.connect(dest)
        return addNode(n)
      }
      const mkNoise = (dest, rate) => {
        const s = ctx.createBufferSource()
        s.buffer = this._noiseBuf
        s.loop = true
        s.playbackRate.value = rate != null ? rate : 1
        s.connect(dest)
        return addSrc(s)
      }
      const mkOsc = (type, f, dest) => {
        const o = ctx.createOscillator()
        o.type = type
        o.frequency.value = f
        o.connect(dest)
        return addSrc(o)
      }
      const mkLfo = (rate, depth, param) => {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = rate
        const lg = ctx.createGain()
        lg.gain.value = depth
        o.connect(lg)
        lg.connect(param)
        addNode(lg)
        return addSrc(o)
      }
      switch (kind) {
        // —— 日夜基础层 ——
        case 'day': {
          mkNoise(mkFilter('lowpass', 720, 0.8, g), 0.9)
          break
        }
        case 'dawn': {
          mkNoise(mkFilter('lowpass', 950, 0.9, g), 0.8)
          const pad = mkGain(0.5, g)
          const padLp = mkFilter('lowpass', 1600, 0.7, pad)
          mkOsc('triangle', 392, padLp)
          mkOsc('sine', 523.25, padLp)
          break
        }
        case 'dusk': {
          mkNoise(mkFilter('lowpass', 520, 1.1, g), 0.75)
          const drone = mkGain(0.28, g)
          mkOsc('sawtooth', 55, mkFilter('lowpass', 170, 3, drone))
          break
        }
        case 'night': {
          const hum = mkGain(0.5, g)
          mkOsc('sine', 48, hum)
          mkOsc('sine', 49.6, hum)
          const air = mkGain(0.18, g)
          mkNoise(mkFilter('lowpass', 240, 1.2, air), 0.6)
          break
        }
        // —— 天气层 ——
        case 'clear': {
          mkNoise(mkFilter('bandpass', 950, 0.6, g), 0.85)
          break
        }
        case 'cloudy': {
          mkNoise(mkFilter('lowpass', 820, 0.9, g), 0.9)
          break
        }
        case 'rain': {
          mkNoise(mkFilter('lowpass', 520, 0.9, mkGain(0.55, g)), 0.85)
          mkNoise(mkFilter('highpass', 700, null, mkFilter('bandpass', 2800, 0.7, mkGain(0.5, g))), 1.05)
          break
        }
        case 'acid': {
          mkNoise(mkFilter('highpass', 2200, 0.8, g), 1.15)
          mkNoise(mkFilter('lowpass', 420, 1.4, mkGain(0.16, g)), 0.8)
          break
        }
        case 'storm': {
          const bp = mkFilter('bandpass', 520, 0.75, g)
          mkLfo(0.13, 190, bp.frequency)
          mkNoise(bp, 1.0)
          mkOsc('sine', 38, mkFilter('lowpass', 150, 2.2, mkGain(0.3, g)))
          break
        }
        case 'dust': {
          const bp = mkFilter('bandpass', 1150, 1.1, g)
          const gust = mkGain(0.42, bp)
          mkLfo(0.21, 0.25, gust.gain)
          mkNoise(gust, 1.0)
          mkNoise(mkFilter('lowpass', 420, 0.9, g), 0.8)
          break
        }
        case 'toxic': {
          mkNoise(mkFilter('bandpass', 700, 2.2, g), 0.85)
          mkOsc('sine', 62, mkGain(0.3, g))
          break
        }
        case 'ash': {
          const am = mkGain(0.4, mkFilter('lowpass', 1200, 0.7, g))
          mkLfo(0.37, 0.12, am.gain)
          mkNoise(am, 1.0)
          break
        }
        // —— 风层 ——
        case 'wind': {
          const bp = mkFilter('bandpass', 600, 0.65, g)
          mkLfo(0.09, 220, bp.frequency)
          mkNoise(mkFilter('lowpass', 2400, 0.8, bp), 1.0)
          break
        }
        default: {
          mkNoise(mkFilter('lowpass', 700, 1, g), 0.9)
          break
        }
      }
      this._beds.add(bed)
      return bed
    } catch (e) {
      return null
    }
  }

  // 交叉淡入淡出地换掉某一槽的层（同 kind 直接复用）
  _swapLayer(slot, kind) {
    const cur = this[slot]
    if (cur && cur.kind === kind) return cur
    if (cur) {
      this[slot] = null
      this._fadeBed(cur, MIN_GAIN, AMB_XFADE)
    }
    if (!kind) return null
    const bed = this._buildLayer(kind)
    if (!bed) return null
    this[slot] = bed
    this._rampBed(bed, this._layerGain(kind), AMB_XFADE)
    // 防御：调用方若以极高频率翻转天气，别让淡出中的层无限堆积
    if (this._beds.size > 12) {
      let oldest = null
      for (const b of this._beds) {
        if (b === this._layerBase || b === this._layerWeather || b === this._layerWind) continue
        if (b === this._amb || b === this._rain || b === this._danger) continue
        if (!oldest || (b._seq || 0) < (oldest._seq || 0)) oldest = b
      }
      if (oldest) this._killBed(oldest)
    }
    return bed
  }

  _applyAmbience() {
    if (!this._alive()) return
    this._swapLayer('_layerBase', BASE_KIND[this._ambPhase] || 'day')
    this._swapLayer('_layerWeather', WEATHER_KIND[this._ambWeather] || 'clear')
    this._windApplied = -1 // 换场后强制重新落一次风量
    this._applyWind()
  }

  _windTarget() {
    // 引擎（game.audioAmbience）会持续把 config 里该天气的 wind 传进来，此时以它为准；
    // 没人调用 setWind 时才用天气自带的兜底风量。
    const w = this._windSet ? this._wantWind : this._weatherWind
    return clamp01(w) * AMB_WIND_MAX
  }

  _applyWind() {
    if (!this._alive()) return
    const target = this._windTarget()
    if (target > 0.012) {
      if (!this._layerWind) {
        // 构建失败时退避 2s，避免调用方每帧 setWind 导致每帧重试建节点
        if (this._ctx.currentTime < this._windNextTry) return
        this._swapLayer('_layerWind', 'wind')
        if (!this._layerWind) {
          this._windNextTry = this._ctx.currentTime + 2
          return
        }
      }
      const bed = this._layerWind
      if (!bed) return
      // 死区：每帧 setWind 同值时不重排自动化
      if (Math.abs(target - this._windApplied) <= 0.01) return
      this._windApplied = target
      this._rampBed(bed, target, 0.45)
      return
    }
    const bed = this._layerWind
    if (bed) {
      this._layerWind = null
      this._windApplied = 0
      this._fadeBed(bed, MIN_GAIN, 0.9)
    }
  }

  // 环境点缀音：只做计时与比较，秒级才触发一次（不违反“每帧不建节点”）
  _ambEvents(dt) {
    this._ambClock += dt
    if (this._layerBase && this._ambPhase === 'night' && this._ambClock >= this._nextMetal) {
      this._nextMetal = this._ambClock + rand(9, 20)
      // 夜晚远处金属响：低音量 + 降速 → 听起来很远
      this._ambOneShot('impact_metal', rand(0.1, 0.2), rand(0.55, 0.78))
    }
    if (this._ambWeather === 'storm' && this._layerWeather && this._ambClock >= this._nextThunder) {
      this._nextThunder = this._ambClock + rand(7, 16)
      const near = Math.random() < 0.4
      this._ambOneShot(near ? 'thunder_near' : 'thunder_far', near ? rand(0.35, 0.5) : rand(0.45, 0.7))
    }
    if ((this._ambWeather === 'acid' || this._ambWeather === 'toxic') && this._ambClock >= this._nextBubble) {
      this._nextBubble = this._ambClock + rand(1.6, 4.5)
      this._ambOneShot('toxic_bubble', rand(0.18, 0.4), rand(0.8, 1.2))
    }
  }

  _ambOneShot(name, vol, rate) {
    try {
      this.play(name, rate != null ? { vol, rate } : { vol })
    } catch (e) {
      /* ignore */
    }
  }

  _applyBeds() {
    if (!this._alive()) return
    if (this._wantAmbience && !this._amb) this._startAmbience()
    this._applyRain()
    this._applyDanger()
  }

  _applyRain() {
    if (!this._alive()) return
    const x = this._wantRain
    const bed = this._rain
    if (x <= 0.001) {
      if (bed) {
        this._rain = null
        this._rainApplied = -1
        this._fadeBed(bed, MIN_GAIN, 0.8)
      }
      return
    }
    // 死区：引擎每帧用几乎相同的值调用 setRain 时不再重排自动化
    if (bed && Math.abs(x - this._rainApplied) < 0.015) return
    let b = bed
    if (!b) {
      b = this._startRainBed()
      if (!b) return
      this._rain = b
    }
    this._rainApplied = x
    const t = this._ctx.currentTime
    // 感知上更接近线性；强度越大越亮
    this._ramp(b.g.gain, Math.max(MIN_GAIN, Math.pow(x, 1.25) * 0.55), 0.9, t)
    this._ramp(b.bp.frequency, 700 + x * 2500, 1.2, t)
    this._ramp(b.lp.frequency, 340 + x * 280, 1.2, t)
  }

  _applyDanger() {
    if (!this._alive()) return
    const x = this._wantDanger
    const bed = this._danger
    if (x <= 0.001) {
      if (bed) {
        this._danger = null
        this._dangerApplied = -1
        this._fadeBed(bed, MIN_GAIN, 0.7)
      }
      return
    }
    if (bed && Math.abs(x - this._dangerApplied) < 0.02) return
    let b = bed
    if (!b) {
      b = this._startDangerBed()
      if (!b) return
      this._danger = b
    }
    this._dangerApplied = x
    const t = this._ctx.currentTime
    this._ramp(b.g.gain, Math.max(MIN_GAIN, x * 0.55), 0.6, t)
    try {
      b.lfo.frequency.setTargetAtTime(0.75 + x * 2.1, t, 0.4)
    } catch (e) {
      /* ignore */
    }
  }
}

// 全局单例：引擎直接 import { audio } 使用
export const audio = new AudioSystem()
