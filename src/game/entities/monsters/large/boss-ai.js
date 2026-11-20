// ============================================================================
// BOSS 追击大脑 · BossBrain
// ----------------------------------------------------------------------------
// 把「追击」从「朝玩家方向一直按走」升级成能读地形的追击：
//
//   1. 距离带  band      —— 按招式配置决定贴身 / 中距 / 拉距，不再一律走到 110px 就停
//   2. 跨沟    leap      —— 窄沟起跳过去；宽沟/深渊停在崖边，改用远程招
//   3. 攀台阶  step      —— 1~2 格高的台阶用「攀跳」上去，连续台阶会连续攀
//   4. 绕路    approach  —— 玩家在高台上、正面是爬不上去的高墙时，沿墙找可上的斜坡
//   5. 失联    search    —— 视线被挡后去最后已知位置，到了再左右扫视
//   6. 脱困    stuck     —— 0.5s 位移 <8px 判卡住 → 反向 + 攀跳，别顶着墙磨
//   7. 朝向滞回          —— 边缘处不每帧翻面
//
// 只输出「意图」（dir / speedMul / jump / mode），位移仍由
// BaseMonster.update → moveBody 完成：撞墙照样被拦、掉坑照样下坠、
// 天花板照样顶头——不会有穿墙或瞬移那种假追击。
// ============================================================================

import { TS } from '../../../config.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0)

/** 脚底往下多远还算「有地」（超过就是沟） */
const WALK_DROP = TS * 2.2

/**
 * 某一列在脚底下方多远有可站立面。
 * @returns {number} 距离（px）；maxScan 内没有返回 Infinity
 */
export function groundDepth(map, x, feet, maxScan = TS * 4) {
  for (let d = 2; d <= maxScan; d += 6) {
    if (map.solidAt(x, feet + d)) return d
  }
  return Infinity
}

/**
 * 脚底上方这一列的「表面高度」：从脚底往上找到第一段实心堆的顶面。
 * 平地返回脚底高度；1 格台阶返回脚底 - 32。
 */
export function surfaceAt(map, x, feet, up = TS * 3) {
  const tx = Math.floor(x / TS)
  const ty = Math.floor((feet - 2) / TS)
  const rows = Math.ceil(up / TS)
  for (let k = 0; k <= rows; k++) {
    if (!map.isSolid(tx, ty - k)) return (ty - k + 1) * TS
  }
  return (ty - rows) * TS
}

/**
 * 正前方是不是台阶；是的话台阶多高、顶面够不够宽、上方有没有身体空间。
 * @returns {{ h:number, topY:number|null, standable:boolean }}
 */
export function probeStep(m, dir, maxTiles = 2) {
  const map = m.map
  const body = m.body
  if (!map || !body) return { h: 0, topY: null, standable: false }
  const feet = body.y + body.h
  // 身体前缘往后 26px 内扫几处：贴墙时前缘那一格就是墙，离墙 20px 时也能提前发现
  let x = null
  for (const o of [2, 8, 14, 20, 26]) {
    const xx = body.x + (dir > 0 ? body.w + o : -o)
    if (map.solidAt(xx, feet - 4)) {
      x = xx
      break
    }
  }
  if (x == null) return { h: 0, topY: null, standable: false }

  const topY = surfaceAt(map, x, feet, maxTiles * TS + TS)
  let h = feet - topY
  if (!Number.isFinite(h) || h <= 0) return { h: 0, topY: null, standable: false }

  const tooHigh = h > maxTiles * TS + 2
  // 顶面上方要有足够高度容纳身体（别一头顶进平台底）。
  // 注意**不要求顶面有「一个身宽」那么宽**：程序化地形的坑壁/高台斜坡全是
  // 1 列 1 格的窄台阶，136px 宽的 BOSS 一样能踩上去（落地会落在脚下最高的那格），
  // 按身宽判宽会把这类台阶全部判死，BOSS 就永远爬不出坑。
  let clear = true
  for (const oy of [12, body.h * 0.45, body.h * 0.82]) {
    if (map.solidAt(x + dir * 24, topY - oy)) {
      clear = false
      break
    }
  }
  return { h, topY, standable: !tooHigh && clear }
}

/**
 * 正前方的沟有多宽、多深。
 * @returns {{ width:number, depth:number }} width=0 表示没有沟
 */
export function probeGap(m, dir, maxScan = 260) {
  const map = m.map
  const body = m.body
  if (!map || !body) return { width: 0, depth: 0 }
  const feet = body.y + body.h
  const front = body.x + (dir > 0 ? body.w : 0)
  let width = 0
  let depth = Infinity
  for (let d = 8; d <= maxScan; d += 8) {
    const x = front + dir * d
    const g = groundDepth(map, x, feet, TS * 4.2)
    if (g <= WALK_DROP) {
      // 碰到能站的地方，沟结束
      return width > 0 ? { width, depth } : { width: 0, depth: 0 }
    }
    width = d
    depth = Math.min(depth, g)
  }
  return { width, depth }
}

/**
 * 沿墙找一个「爬得上去」的落脚面（玩家在更高处时用）。
 * 只在墙太高压根上不去时调用，0.4s 一次，不是每帧。
 */
export function findApproach(m, preferDir, maxScan = 340) {
  const map = m.map
  const body = m.body
  if (!map || !body) return null
  const feet = body.y + body.h
  for (let d = 32; d <= maxScan; d += 16) {
    // 先看朝向玩家的方向，再看反方向
    for (const s of [preferDir, -preferDir]) {
      if (!s) continue
      const x = body.x + body.w / 2 + s * d
      const top = surfaceAt(map, x, feet, TS * 3)
      const rise = feet - top
      // 只要「真的往上抬」的落脚面：平地/下坡不算绕路目标
      if (rise < TS * 0.75) continue
      if (rise > TS * 2.6) continue // 太高：爬不上
      // 落脚面够宽 + 上方有空间
      let wide = 0
      for (const o of [-body.w * 0.45, 0, body.w * 0.45]) {
        if (map.solidAt(x + o, top + 6)) wide++
      }
      if (wide < 2) continue
      if (map.solidAt(x, top - body.h * 0.6)) continue
      return { x, y: top, rise }
    }
  }
  return null
}

export class BossBrain {
  /**
   * @param {object} host  ThemeBoss 实例（BaseMonster）
   * @param {object} opts  { band, maxStepTiles, jumpVy, leapSpeedMul }
   */
  constructor(host, opts = {}) {
    this.host = host
    this.band = opts.band ? opts.band.slice() : [110, 210]
    this.maxStepTiles = opts.maxStepTiles ?? 2
    this.jumpVy = opts.jumpVy ?? -600
    this.leapSpeedMul = opts.leapSpeedMul ?? 2.8
    this.phase = 1

    this.mode = 'idle'
    this.dir = 0
    this.speedMul = 0
    this.facing = host?.facing ?? 1
    this.reason = ''

    // 计时器
    this.jumpCd = 0
    this.jumpHold = 0
    this.airT = 0
    this.sampleT = 0
    this.sampleX = host?.px ?? 0
    this.wasPushing = false
    this.forceDirT = 0
    this.forceDir = 0
    this.probeT = 0
    this.approachT = 0
    this.approach = null

    // 感知
    this.lostT = 0
    this.lastKnownX = host?.px ?? 0
    this.lostSweepT = 0
    this.lostSweepDir = 1

    this.stuckLevel = 0
    this._wasOnGround = true
    this.stats = { jumps: 0, leaps: 0, steps: 0, stuck: 0, searches: 0, approaches: 0 }
    this.debug = { mode: 'idle', dir: 0, speedMul: 0, gap: 0, gapDepth: 0, step: 0, band: this.band, stuck: 0 }
    this._cachedProbe = null
  }

  /** 用招式表推「这个 BOSS 该站多远」：近战招多就贴，纯远程就拉开 */
  setBandFromKit(kit) {
    let melee = 0
    let total = 0
    for (const k in kit || {}) {
      const spec = kit[k]
      if (!spec) continue
      total++
      const r = spec.range
      if (!Array.isArray(r)) melee++ // 没写范围的按近身判定处理
      else if ((r[1] ?? 0) <= 260) melee++
    }
    const ratio = total ? melee / total : 0.5
    if (ratio >= 0.5) this.band = [72, 150]
    else if (ratio >= 0.25) this.band = [130, 240]
    else this.band = [220, 380]
    this.debug.band = this.band
    return this.band
  }

  /** 二阶段：距离带收紧一点，更有压迫感 */
  setPhase(p) {
    this.phase = p
    if (p > 1) {
      const mid = (this.band[0] + this.band[1]) / 2
      this.band = [Math.max(50, this.band[0] * 0.82), Math.max(mid, this.band[1] * 0.86)]
    }
    this.debug.band = this.band
  }

  /** 当前意图（供外部 / 测试读取） */
  get intent() {
    return {
      dir: this.dir,
      speedMul: this.speedMul,
      mode: this.mode,
      facing: this.facing,
      jump: null,
      anim: Math.abs(this.dir) > 0 && this.speedMul > 0.4 ? 'run' : 'idle',
      reason: this.reason,
    }
  }

  _emit(dir, mul, mode, jump = null) {
    this.dir = dir
    this.speedMul = mul
    this.mode = mode
    this.reason = mode
    this.debug.mode = mode
    this.debug.dir = dir
    this.debug.speedMul = Math.round(mul * 100) / 100
    return {
      dir,
      speedMul: mul,
      mode,
      facing: this.facing,
      jump,
      // 带内 0.28 的微调速度不值得播跑步（地形挡住时就是原地踏步）
      anim: Math.abs(dir) > 0 && mul > 0.4 ? 'run' : 'idle',
      reason: mode,
    }
  }

  _jump(kind, dir, mul) {
    this.stats.jumps++
    if (kind === 'leap') this.stats.leaps++
    else this.stats.steps++
    this.jumpCd = kind === 'leap' ? 1.0 : 0.62
    this.jumpHold = kind === 'leap' ? 0.5 : 0.4
    this.airT = 0.05
    this.dir = dir
    this.speedMul = mul
    this.facing = dir || this.facing
    return this._emit(dir, mul, kind, kind)
  }

  /**
   * 每帧调用。返回意图；host 负责写 vxTarget / body.vy / facing / 动画。
   * @param {number} dt
   */
  think(dt) {
    const m = this.host
    if (!m || !m.body) return this._emit(0, 0, 'idle')

    this.jumpCd = Math.max(0, this.jumpCd - dt)
    this.jumpHold = Math.max(0, this.jumpHold - dt)
    this.lostT = Math.max(0, this.lostT)

    const p = m.player
    if (!p || p.dead) {
      this.statsResetSearch()
      return this._emit(0, 0, 'idle')
    }

    const body = m.body
    const feet = body.y + body.h
    const pc = p.centerX ?? m.px
    const dx = pc - m.px
    const adx = Math.abs(dx)
    const pFeet = p.body ? p.body.y + p.body.h : (p.centerY ?? feet)
    const dFeet = pFeet - feet // 正 = 玩家更低

    // ---- 感知：视线 / 最后已知位置 ----
    let los = true
    try {
      los = typeof m.hasLineOfSight === 'function' ? m.hasLineOfSight(pc, p.centerY ?? pFeet) : true
    } catch (e) {
      los = true
    }
    if (los) {
      this.lostT = 0
      this.lastKnownX = pc
    } else {
      this.lostT += dt
    }

    // ---- 朝向滞回：近处不翻面 ----
    if (Math.abs(adx) > 30 || !body.onGround) this.facing = dx >= 0 ? 1 : -1

    // ---- 卡死检测：全速推进却 0.5s 没位移 ----
    // 只看「上一帧是不是全力推进」：带内回正(0.28)/后退拉距(0.55)/绕路(0.85) 本来就慢，
    // 0.5s 走不到 8px 很正常，算作推墙会每 0.5s 误判一次卡住 → 原地连跳、越跳越贴脸。
    this.sampleT += dt
    if (this.sampleT >= 0.5) {
      const moved = Math.abs(m.px - this.sampleX)
      const pushing = Math.abs(this.dir) > 0 && this.speedMul >= 0.9 && body.onGround
      if (pushing && moved < 8) {
        this.stuckLevel++
        this.stats.stuck++
        if (this.stuckLevel >= 2 && this.forceDirT <= 0) {
          this.forceDirT = 0.7
          this.forceDir = -(sign(this.dir) || this.facing)
        }
        // 卡住时优先试着跳一下（台阶 / 贴墙 / 站进了凹槽）
        if (this.stuckLevel === 1 && body.onGround) {
          this.sampleT = 0
          this.sampleX = m.px
          return this._jump('step', this.forceDir || this.facing, 1.1)
        }
      } else {
        this.stuckLevel = Math.max(0, this.stuckLevel - 1)
      }
      this.sampleT = 0
      this.sampleX = m.px
    }
    this.debug.stuck = this.stuckLevel

    // ---- 空中：不重新决策，保持起跳方向 ----
    if (!body.onGround) {
      this.airT += dt
      if (this.airT > 0.04) {
        const mode = this.jumpHold > 0 ? (this.dir === 0 ? 'air' : 'leap') : 'air'
        return this._emit(this.dir, this.speedMul, mode)
      }
    } else {
      this.airT = 0
      this.speedMul = Math.min(this.speedMul, 1.4)
    }

    // ---- 脱困：反向走一小段 ----
    if (this.forceDirT > 0) {
      this.forceDirT -= dt
      return this._emit(this.forceDir, 0.8, 'reposition')
    }

    // ---- 失联：去最后已知位置，然后左右扫视 ----
    if (this.lostT > 0.7) {
      if (this.mode !== 'search') this.stats.searches++
      const ldx = this.lastKnownX - m.px
      if (Math.abs(ldx) > 40) {
        return this._emit(sign(ldx), 0.95, 'search')
      }
      this.lostSweepT -= dt
      if (this.lostSweepT <= 0) {
        this.lostSweepT = 0.9 + Math.random() * 0.6
        this.lostSweepDir = -this.lostSweepDir
      }
      return this._emit(this.lostSweepDir, 0.55, 'search')
    }

    // ---- 距离带 ----
    // 进/出带各留 12px 回差：正好卡在 band 边界上时，「贴太近要后退」和
    // 「偏离带心要回正」两条会每帧互相打架，BOSS 会在原地 1px 来回抖。
    // 回差只加在「进入追击」一侧（adx > band[1]+12），后退一侧必须用准 band[0]：
    // 后退阈值一旦也往外推，边界上就会变成 1px 抖动的死循环。
    const band = this.band
    const center = (band[0] + band[1]) / 2
    const HYST = 12
    let dir = 0
    let mul = 0
    let mode = 'hold'
    if (adx > band[1] + HYST) {
      dir = sign(dx)
      mul = 1.0
      mode = 'press'
    } else if (adx < band[0]) {
      // 太近：远程型往后拉，近战型原地顶住
      if (band[0] >= 120) {
        dir = -sign(dx)
        mul = 0.55
        mode = 'hold'
      } else {
        dir = 0
        mul = 0
        mode = 'hold'
      }
    } else if (Math.abs(adx - center) > 55) {
      // 在带内但偏离带心太多 → 小幅回正（不是抖动，阈值 55px）
      dir = sign(dx)
      mul = 0.28
      mode = 'hold'
    }

    // ---- 玩家明显更高（跳上台/台阶）→ 先往上够 ----
    if (dFeet < -TS * 0.9 && adx > 24) {
      dir = sign(dx)
      mul = Math.max(mul, 0.7)
      mode = 'climb'
    }

    // ---- 地形探测（每 0.06s 一次，够用且省 CPU）----
    const probeDir = dir || this.facing
    this.probeT -= dt
    if (this.probeT <= 0 || !this._cachedProbe || this._cachedProbe.dir !== probeDir) {
      this.probeT = 0.06
      const step = probeStep(m, probeDir, this.maxStepTiles)
      const gap = step.h > 0 ? { width: 0, depth: 0 } : probeGap(m, probeDir, 260)
      this._cachedProbe = { dir: probeDir, step, gap }
    }
    const probe = this._cachedProbe
    const step = probe.step
    const gap = probe.gap
    this.debug.gap = Math.round(gap.width)
    this.debug.gapDepth = Number.isFinite(gap.depth) ? Math.round(gap.depth) : 999
    this.debug.step = Math.round(step.h)

    // ---- 后退拉距时也别把自己退下悬崖 ----
    if (dir !== 0 && dir === -sign(dx) && (gap.width > 0 || step.h > 0)) {
      const behindDrop = gap.width > 0 && gap.depth > TS * 1.1
      if (behindDrop) {
        dir = 0
        mul = 0
        mode = 'hold'
      }
    }

    // ---- 沟：窄的跳过去，能落底的走下去，深渊停在崖边 ----
    if (gap.width > 0 && dir === sign(dx)) {
      const leap = Math.min(150, Math.max(80, (m.speed || 58) * 1.7))
      if (gap.width <= leap && gap.depth > TS * 1.1 && this.jumpCd <= 0 && body.onGround) {
        return this._jump('leap', dir, this.leapSpeedMul)
      }
      if (gap.depth > TS * 4.2) return this._emit(0, 0, 'edge')
      // 浅坑：放慢速度走进去（下来容易，上去靠攀跳）
      mul = Math.min(mul || 0.7, 0.75)
    }

    // ---- 台阶：1~2 格攀跳；更高的墙别顶着磨 ----
    if (dir === sign(dx) && step.h > 0) {
      if (step.h <= TS * this.maxStepTiles + 2 && step.standable) {
        if (this.jumpCd <= 0 && body.onGround) return this._jump('step', dir, 1.2)
        return this._emit(0, 0, 'climb')
      }
      // 玩家更高时，沿墙找一处爬得上去的落脚面
      if (dFeet < -TS * 1.2) {
        this.approachT -= dt
        if (this.approachT <= 0) {
          this.approachT = 0.4
          this.approach = findApproach(m, sign(dx), 340)
        }
        const app = this.approach
        if (app && Math.abs(app.x - m.px) > 44) {
          return this._emit(sign(app.x - m.px), 0.85, 'search')
        }
      }
      return this._emit(0, 0, 'edge')
    }

    // ---- 边界：别把自己挤进墙角 ----
    const rw = (m.game?.room?.data?.worldW || m.game?.roomW || 4000) - body.w - 30
    if (body.x < 34 && dir < 0) {
      if (adx < band[1]) return this._emit(0, 0, 'hold')
      dir = 1
    } else if (body.x > rw && dir > 0) {
      if (adx < band[1]) return this._emit(0, 0, 'hold')
      dir = -1
    }

    this.wasPushing = dir !== 0 && mul >= 0.9
    return this._emit(dir, mul, mode)
  }

  statsResetSearch() {
    this.lostT = 0
  }
}
