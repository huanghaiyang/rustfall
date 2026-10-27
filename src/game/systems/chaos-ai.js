// 混乱 AI —— 让敌人不再「各自打自己的」。
//
// 一个全局混乱度（0~100）随时间、击杀与玩家低血量上涨；越高越容易触发
// 「混乱事件」。事件只改敌人行为，不改玩家数值：
//
//   infight   内讧   两只相邻的小怪互相开火
//   berserk   狂暴   一批小怪提速增伤（光环变红）
//   panic     恐慌   一批小怪掉头逃跑，不再攻击
//   reinforce 增援   站点再放一只同类怪
//   glitch    故障   一片小怪短路僵直，冒紫色电弧
//
// 实现方式是给每个小怪实例包一层 updateBehavior（只包一次），
// 通过 __fleeT / __berserkT / __glitchT 三个计时器临时接管行为，
// 计时结束原样交还给怪物自己的 AI —— 不改任何怪物类。
import { Events, EV } from '../core/events.js'
import { G, toast } from '../state.js'

const EVENT_MIN = 5.5
const EVENT_MAX = 10
const UP_PER_KILL = 3.2
const UP_PER_SEC = 0.55
const DECAY_PER_SEC = 0.35

const EVENTS = ['infight', 'berserk', 'panic', 'reinforce', 'glitch']

/** 每个事件的提示文案 */
const TEXT = {
  infight: '混乱同步：敌方单位开始互相攻击',
  berserk: '混乱同步：敌方单位进入狂暴',
  panic: '混乱同步：敌方单位陷入恐慌',
  reinforce: '混乱同步：检测到增援信号',
  glitch: '混乱同步：敌方单位逻辑短路',
}

export function createChaosAI(game) {
  let chaos = 0
  let roomId = ''
  let nextEvent = EVENT_MIN + Math.random() * (EVENT_MAX - EVENT_MIN)
  let pool = ['radboar', 'crawler', 'spitter']
  let active = 0
  let total = 0
  let hudT = 0
  const listeners = new Set()

  function report() {
    const state = chaos >= 75 ? 'critical' : chaos >= 45 ? 'unstable' : chaos >= 20 ? 'drifting' : 'stable'
    G.chaosLevel = chaos / 100
    G.chaosState = state
    for (const fn of listeners) {
      try {
        fn({ chaos, active, total })
      } catch (e) {
        /* ignore */
      }
    }
  }

  /** 小怪列表（大型敌人不参与恐慌/短路，只吃狂暴） */
  function smalls() {
    const d = game.director
    if (!d) return []
    const list = typeof d.smallList !== 'undefined' ? d.smallList : d.list || []
    return (list || []).filter((m) => m && m.alive && !m.dead)
  }

  /** 给怪物装上层：只装一次，永远复用它自己的 updateBehavior */
  function patch(m) {
    if (!m || m.__chaosPatched) return
    const orig = m.updateBehavior
    if (typeof orig !== 'function') return
    m.__chaosPatched = true
    m.__chaosBaseSpeed = m.speed
    m.__fleeT = 0
    m.__berserkT = 0
    m.__glitchT = 0
    m.__berserkOn = false

    m.updateBehavior = function updateBehaviorChaos(dt) {
      // 短暂僵直（故障）
      if (this.__glitchT > 0) {
        this.__glitchT -= dt
        this.vxTarget = 0
        this.playAnim?.('hurt')
        return
      }
      // 恐慌：背对玩家逃跑，禁止出招
      if (this.__fleeT > 0) {
        this.__fleeT -= dt
        const p = this.player
        if (p) {
          const dir = this.px >= p.centerX ? 1 : -1
          this.facing = dir
          const free = !this.wallAhead?.(dir) && this.groundAhead?.(dir)
          this.vxTarget = free ? dir * this.speed * 1.35 : 0
        } else {
          this.vxTarget = 0
        }
        this.playAnim?.('run')
        return
      }
      // 狂暴：改速度/伤害，结束时还原
      if (this.__berserkT > 0) {
        this.__berserkT -= dt
        if (!this.__berserkOn) {
          this.__berserkOn = true
          this.__chaosBaseSpeed = this.speed
          this.__chaosBaseDamage = this.damage
          this.speed = this.__chaosBaseSpeed * 1.4
          this.damage = this.__chaosBaseDamage * 1.22
        }
        if (this.__berserkT <= 0) {
          this.__berserkOn = false
          this.speed = this.__chaosBaseSpeed
          this.damage = this.__chaosBaseDamage
        }
      } else if (this.__berserkOn) {
        this.__berserkOn = false
        this.speed = this.__chaosBaseSpeed
        this.damage = this.__chaosBaseDamage
      }
      return orig.call(this, dt)
    }
  }

  function spark(x, y, color, n = 8, spread = 1.6) {
    try {
      game.particles?.emitMany?.('spark', x, y, n, { color, spread, life: 0.5, size: 1.1 })
    } catch (e) {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ 事件
  function evInfight() {
    const list = smalls()
    if (list.length < 2) return false
    const a = list[Math.floor(Math.random() * list.length)]
    let b = null
    let best = Infinity
    for (const m of list) {
      if (m === a) continue
      const d = Math.hypot(m.px - a.px, m.py - a.py)
      if (d < best) {
        best = d
        b = m
      }
    }
    if (!b || best > 340) return false
    const dmg = 5 + chaos * 0.09
    a.takeDamage?.(dmg, b.px)
    b.takeDamage?.(dmg, a.px)
    spark(a.px, a.py, 0xff7a4a, 10)
    spark(b.px, b.py, 0xff7a4a, 10)
    return true
  }

  function evBerserk() {
    // 只影响小怪：大型敌人（含主题 BOSS）有自己的二阶段，别去改它们的数值
    const list = smalls()
    if (!list.length) return false
    const n = Math.min(list.length, 3)
    for (let i = 0; i < n; i++) {
      const m = list[Math.floor(Math.random() * list.length)]
      patch(m)
      m.__berserkT = Math.max(m.__berserkT || 0, 7 + Math.random() * 3)
      spark(m.px, m.py, 0xff3b30, 8)
    }
    return true
  }

  function evPanic() {
    const list = smalls()
    if (!list.length) return false
    const n = Math.min(list.length, 4)
    for (let i = 0; i < n; i++) {
      const m = list[Math.floor(Math.random() * list.length)]
      patch(m)
      m.__fleeT = Math.max(m.__fleeT || 0, 3 + Math.random() * 2)
      spark(m.px, m.py - 10, 0x9ab8ff, 6, 1.2)
    }
    return true
  }

  function evReinforce() {
    const d = game.director
    if (!d || typeof d.spawn !== 'function') return false
    if (typeof d.aliveCount === 'function' && d.aliveCount() >= 12) return false
    const p = game.player
    const w = game.roomW || 2000
    let x = Math.random() * w
    if (p) {
      // 别刷在玩家脸上
      if (Math.abs(x - p.centerX) < 220) x = p.centerX > w / 2 ? 120 : w - 120
    }
    const id = pool[Math.floor(Math.random() * pool.length)] || 'crawler'
    const ok = d.spawn(id, x, 0)
    return !!ok
  }

  function evGlitch() {
    const list = smalls()
    if (!list.length) return false
    const p = game.player
    const n = Math.min(list.length, 5)
    let hit = 0
    for (let i = 0; i < n; i++) {
      const m = list[Math.floor(Math.random() * list.length)]
      if (p && Math.abs(m.px - p.centerX) > 460) continue
      patch(m)
      m.__glitchT = 1.2 + Math.random() * 0.9
      m.vxTarget = 0
      spark(m.px, m.py, 0xb06bff, 12, 1.8)
      hit++
    }
    return hit > 0
  }

  const RUNNERS = {
    infight: evInfight,
    berserk: evBerserk,
    panic: evPanic,
    reinforce: evReinforce,
    glitch: evGlitch,
  }

  function fireEvent(kind) {
    const ok = RUNNERS[kind]?.()
    if (!ok) return false
    active = 6.5
    total++
    try {
      toast(TEXT[kind], 'warn', 3.2)
    } catch (e) {
      /* ignore */
    }
    report()
    return true
  }

  // ------------------------------------------------------------ 生命周期
  function reset(data) {
    const nextRoom = data?.roomId || ''
    if (nextRoom !== roomId) {
      roomId = nextRoom
      nextEvent = EVENT_MIN + Math.random() * (EVENT_MAX - EVENT_MIN)
    }
    if (Array.isArray(data?.monsters) && data.monsters.length) {
      const ids = data.monsters
        .map((m) => (typeof m === 'string' ? m : m && m.id))
        .filter((id) => typeof id === 'string')
      if (ids.length) pool = ids
    }
    // 庇护所不搞事
    chaos = data?.shelter ? 0 : Math.min(chaos, 18)
    active = 0
    report()
  }

  function update(dt) {
    if (!game.room || !game.director) return
    if (game.room?.data?.shelter) {
      if (chaos > 0) {
        chaos = Math.max(0, chaos - dt * 8)
        report()
      }
      return
    }

    // 小怪进场就装层，事件触发时不用再找
    const list = smalls()
    for (const m of list) patch(m)

    const lowHp = G.hpMax && G.hp / G.hpMax < 0.35 ? 1 : 0
    chaos += dt * (UP_PER_SEC * (0.5 + lowHp * 1.6))
    chaos = Math.max(0, Math.min(100, chaos - dt * DECAY_PER_SEC))

    if (active > 0) {
      active -= dt
      if (active <= 0) report()
    }

    hudT += dt
    if (hudT >= 0.25) {
      hudT = 0
      report()
    }

    nextEvent -= dt
    if (nextEvent > 0) return
    // 混乱度不够就只是继续等，不消耗事件
    if (chaos < 32) {
      nextEvent = 2 + Math.random() * 3
      return
    }
    const kind = EVENTS[Math.floor(Math.random() * EVENTS.length)]
    fireEvent(kind)
    nextEvent = EVENT_MIN + Math.random() * (EVENT_MAX - EVENT_MIN) - chaos * 0.04
    if (nextEvent < 3) nextEvent = 3
  }

  function onKill() {
    chaos = Math.min(100, chaos + UP_PER_KILL)
    report()
  }

  // 击杀会让混乱度涨——这里只订阅一次，靠 roomId 判断是否还活着
  try {
    Events.on?.(EV.MONSTER_KILLED, onKill)
  } catch (e) {
    /* ignore */
  }

  const api = {
    update,
    reset,
    onKill,
    onStatus(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    get level() {
      return chaos
    },
    get level01() {
      return chaos / 100
    },
    get state() {
      if (chaos >= 75) return 'critical'
      if (chaos >= 45) return 'unstable'
      if (chaos >= 20) return 'drifting'
      return 'stable'
    },
    get active() {
      return active
    },
    get events() {
      return total
    },
    /** 手动触发（调试/道具） */
    trigger(kind) {
      return fireEvent(kind || EVENTS[Math.floor(Math.random() * EVENTS.length)])
    },
    boost(n = 20) {
      chaos = Math.max(0, Math.min(100, chaos + n))
      report()
    },
  }

  report()
  return api
}

export default createChaosAI
