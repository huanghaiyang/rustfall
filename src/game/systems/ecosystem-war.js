// 生态战争 —— 让「不同家族」的怪物之间自己打起来，并让这场战争在玩家离开后继续。
//
// 两层：
//   1) 当前房间：每隔几秒在敌对家族的小怪之间点一对「小规模冲突」，
//      双方靠近、互相攻击（走 BaseMonster.updateBehavior 的包裹层，不改怪物类）。
//   2) 持久层：G.war.rooms 按 regionId:roomId 记录人口 / 阵亡队列 / 前线。
//      离开房间后按游戏内时钟继续推演（偶发伤亡），死亡单位按稀有度延迟重生：
//      普通小怪 ~45s，精英 ×1.9，大型 ×2.6（上限 320s）。
import { Events, EV } from '../core/events.js'
import { G, toast } from '../state.js'
import { clamp } from '../utils.js'
import { monsterDef } from '../entities/monsters/index.js'

const SCAN_INTERVAL = 2.4
const CLASH_RANGE = 380
const OFFSCREEN_TICK = 8
const OFFSCREEN_FRONT_TTL = 600
const RESPAWN_MIN = 45
const RESPAWN_MAX = 320

/** 敌对关系表（只写单向，查询时双向判断） */
const ENEMIES = {
  beast: ['human', 'machine', 'rogue', 'mutant', 'alien'],
  human: ['beast', 'machine', 'mutant', 'alien', 'rogue'],
  machine: ['beast', 'human', 'mutant', 'alien', 'rogue'],
  mutant: ['beast', 'human', 'machine', 'rogue', 'alien'],
  alien: ['beast', 'human', 'machine', 'mutant', 'rogue'],
  // 失控机械会无差别攻击其他族群，保证城市等常见房间也会爆发冲突
  rogue: ['beast', 'human', 'machine', 'mutant', 'alien'],
  anomaly: ['human', 'machine', 'beast', 'mutant', 'alien', 'rogue'],
}

const FAMILY_LABEL = {
  beast: '异兽',
  human: '人类',
  machine: '机械',
  mutant: '变异体',
  alien: '异星',
  rogue: '失控机械',
  anomaly: '异常体',
}

function hostileFamily(a, b) {
  if (!a || !b || a === b) return false
  if (a === 'anomaly' || b === 'anomaly') return true
  return !!(ENEMIES[a]?.includes(b) || ENEMIES[b]?.includes(a))
}

function familyOf(m) {
  return (m && m.def && m.def.family) || 'beast'
}

function roomKey(regionId, roomId) {
  return `${regionId || ''}:${roomId || ''}`
}

/** 按稀有度算重生间隔（游戏内秒）。 */
function respawnDelay(info = {}) {
  const def = monsterDef(info.id) || {}
  const hp = Number(def.hp) || 40
  const xp = Number(def.xp) || 6
  const elite = !!(info.elite || def.elite)
  const large = !!info.large
  let base = 26 + hp * 0.32 + xp * 1.4
  if (elite) base *= 1.9
  if (large) base *= 2.6
  return clamp(base, RESPAWN_MIN, RESPAWN_MAX)
}

export function createEcosystemWar(game) {
  let clock = 0
  let here = null
  let scanT = 0
  let offT = 0
  let pendingT = 0
  let fights = 0
  let kills = 0
  let stateRef = null

  function state() {
    if (!G.war || typeof G.war !== 'object') G.war = { clock: 0, rooms: {} }
    if (!G.war.rooms || typeof G.war.rooms !== 'object') G.war.rooms = {}
    // 重开一局时 resetState 会换掉 G.war 对象：同步时钟并丢弃当前房间引用
    if (stateRef !== G.war) {
      stateRef = G.war
      clock = Number(G.war.clock) || 0
      here = null
    }
    return G.war
  }

  function aliveCounts() {
    const out = {}
    const list = game.director?.list || []
    for (const m of list) {
      if (!m || m.alive === false) continue
      out[m.id] = (out[m.id] || 0) + 1
    }
    return out
  }

  function spark(x, y, color, n = 8) {
    try {
      game.particles?.emitMany?.('spark', x, y, n, { color, spread: 1.6, life: 0.5, size: 1.1 })
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- 战斗包裹层
  function patch(m) {
    if (!m || m.__warPatched) return
    const orig = m.updateBehavior
    if (typeof orig !== 'function') return
    m.__warPatched = true
    m.__warT = 0
    m.__warFoe = null
    m.__warCd = 0

    m.updateBehavior = function updateBehaviorWar(dt) {
      this.__warCd = Math.max(0, (this.__warCd || 0) - dt)
      const foe = this.__warFoe
      const foeAlive = foe && foe.alive !== false && !foe.dead
      if (this.__warT > 0 && foeAlive) {
        this.__warT -= dt
        const dx = foe.px - this.px
        const d = Math.abs(dx)
        const dy = Math.abs(foe.py - this.py)
        this.facing = dx >= 0 ? 1 : -1
        if (d > Math.max(28, (this.attackRange || 70) * 0.85) || dy > 90) {
          this.state = 'chase'
          this.vxTarget = this.facing * this.speed * 0.92
          this.playAnim?.('run')
        } else {
          this.vxTarget = 0
          this.state = 'attack'
          this.playAnim?.('attack')
          if (this.__warCd <= 0) {
            this.__warCd = 0.7 + Math.random() * 0.5
            foe.__warKilled = true
            foe.takeDamage?.(Math.max(4, (this.damage || 8) * 1.1), this.px)
            spark(foe.px, foe.py, 0xffa63d, 8)
          }
        }
        return
      }
      if (this.__warT > 0) this.__warT = 0
      this.__warFoe = null
      return orig.call(this, dt)
    }
  }

  function startFight(a, b, rec) {
    patch(a)
    patch(b)
    const t = 6 + Math.random() * 4
    a.__warT = t
    b.__warT = t
    a.__warFoe = b
    b.__warFoe = a
    a.__warCd = 0.3 + Math.random() * 0.3
    b.__warCd = 0.3 + Math.random() * 0.3
    fights++
    if (rec) {
      rec.front = { a: familyOf(a), b: familyOf(b), t: clock }
      // 同一房间只提示一次，避免刷屏
      const key = `war:told:${rec.key}`
      if (!G.flags[key]) {
        G.flags[key] = true
        toast(`${FAMILY_LABEL[rec.front.a] || '异类'} 与 ${FAMILY_LABEL[rec.front.b] || '异类'} 正在交火`, 'warn', 3.2)
      }
    }
  }

  /** 每轮最多点一对，保持「小规模」。 */
  function scanClash(rec) {
    const list = (game.director?.list || []).filter(
      (m) => m && m.alive !== false && !m.isLarge && !m.boss && !(m.__warT > 0),
    )
    if (list.length < 2) return
    let a = null
    let b = null
    let best = CLASH_RANGE
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const m = list[i]
        const n = list[j]
        if (!hostileFamily(familyOf(m), familyOf(n))) continue
        const d = Math.hypot(n.px - m.px, n.py - m.py)
        if (d < best) {
          best = d
          a = m
          b = n
        }
      }
    }
    if (a && b) startFight(a, b, rec)
  }

  // ---------------------------------------------------------------- 人口 / 重生
  function processDue(rec) {
    if (!rec || !Array.isArray(rec.dead)) return
    for (let i = rec.dead.length - 1; i >= 0; i--) {
      const e = rec.dead[i]
      if (!e || e.at > clock) continue
      rec.dead.splice(i, 1)
      rec.pop[e.id] = (rec.pop[e.id] || 0) + 1
      rec.pending.push({ id: e.id, large: !!e.large })
    }
  }

  function spawnPending(rec) {
    if (!rec || !rec.pending || !rec.pending.length) return
    if (pendingT > 0) return
    const d = game.director
    if (!d) return
    const p = rec.pending[0]
    // 目标人口已满足（例如导演刚刷过一批）就直接丢弃这条待补
    const have = aliveCounts()[p.id] || 0
    if (have >= (rec.pop[p.id] || 0)) {
      rec.pending.shift()
      return
    }
    const w = Math.max(600, game.roomW || 2000)
    const x = clamp(140 + Math.random() * (w - 280), 60, w - 60)
    const ok = p.large ? d.spawnLarge?.(p.id, x, 0) : d.spawn?.(p.id, x, 0)
    if (ok) {
      rec.pending.shift()
      pendingT = 0.4
    } else {
      pendingT = 2.5
    }
  }

  /** 只清掉当前房间多出来的小怪（大型敌人不动，避免误触发击杀结算）。 */
  function trimTo(rec, d) {
    const list = Array.isArray(d?.list) ? d.list : []
    const keep = { ...rec.pop }
    let trimmed = 0
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (!m || m.alive === false) continue
      if (m.isLarge || m.boss) continue
      if ((keep[m.id] || 0) > 0) {
        keep[m.id] -= 1
        continue
      }
      m.alive = false
      m.deadT = 999
      if (m.group) m.group.visible = false
      trimmed++
    }
    return trimmed
  }

  // ---------------------------------------------------------------- 生命周期
  function enterRoom(data = {}) {
    const st = state()
    const regionId = data.regionId || game.regionId || G.regionId || ''
    const roomId = data.roomId || game.roomId || G.roomId || ''
    const key = roomKey(regionId, roomId)
    if (data.shelter) {
      here = null
      return null
    }
    const d = game.director
    if (!d) {
      here = null
      return null
    }

    let rec = st.rooms[key]
    if (!rec) {
      // 首次进入：把当前刷出来的怪当成这个房间的初始生态
      rec = {
        key,
        regionId,
        roomId,
        biome: data.biome || G.biome || 'city',
        pop: aliveCounts(),
        dead: [],
        pending: [],
        front: null,
        lastSim: clock,
      }
      st.rooms[key] = rec
      here = rec
      return rec
    }

    // 再次进入：恢复上次离开时的人口，并处理已经到期的重生
    d.clearQueue?.()
    trimTo(rec, d)
    const have = aliveCounts()
    for (const id of Object.keys(rec.pop)) {
      const missing = (rec.pop[id] || 0) - (have[id] || 0)
      for (let i = 0; i < missing; i++) rec.pending.push({ id, large: false })
    }
    processDue(rec)
    if (rec.front && clock - rec.front.t < OFFSCREEN_FRONT_TTL) {
      toast(
        `生态冲突仍在继续：${FAMILY_LABEL[rec.front.a] || '异类'} 与 ${FAMILY_LABEL[rec.front.b] || '异类'}`,
        'warn',
        3.2,
      )
    } else {
      rec.front = null
    }
    rec.lastSim = clock
    here = rec
    return rec
  }

  function leaveRoom() {
    if (!here) return
    here.pop = aliveCounts()
    // 离场时还有正在打的一对，就把前线记下来，交给离屏推演
    const list = (game.director?.list || []).filter((m) => m && m.alive !== false && m.__warT > 0)
    if (list.length >= 2) {
      here.front = { a: familyOf(list[0]), b: familyOf(list[1]), t: clock }
    }
    here.lastSim = clock
    here = null
  }

  function recordKill(payload) {
    const rec = here
    if (!rec || !payload || !payload.id) return
    if (payload.roomId && rec.roomId && payload.roomId !== rec.roomId) return
    kills++
    rec.pop[payload.id] = Math.max(0, (rec.pop[payload.id] || 0) - 1)
    rec.dead.push({
      id: payload.id,
      at: clock + respawnDelay(payload),
      large: !!payload.large,
    })
  }

  /** 离开的房间按游戏内时间继续推演：偶尔有人阵亡，阵亡者排队重生。 */
  function simulateAway() {
    const st = state()
    for (const key of Object.keys(st.rooms)) {
      const rec = st.rooms[key]
      if (!rec || rec === here) continue
      if (clock - (rec.lastSim || 0) < OFFSCREEN_TICK) continue
      rec.lastSim = clock
      if (rec.front && clock - rec.front.t < OFFSCREEN_FRONT_TTL && Math.random() < 0.45) {
        const ids = Object.keys(rec.pop).filter((id) => (rec.pop[id] || 0) > 0)
        if (ids.length > 1) {
          const id = ids[Math.floor(Math.random() * ids.length)]
          rec.pop[id] -= 1
          rec.dead.push({ id, at: clock + respawnDelay({ id }), large: false })
        }
        if (Math.random() < 0.5) rec.front = null
      }
      processDue(rec)
    }
  }

  function update(dt) {
    const step = Math.min(Math.max(Number(dt) || 0, 0), 0.1)
    state()
    clock += step
    G.war.clock = clock
    pendingT = Math.max(0, pendingT - step)
    offT += step
    if (offT >= 2) {
      offT = 0
      simulateAway()
    }
    if (!here) return
    processDue(here)
    spawnPending(here)
    scanT += step
    if (scanT >= SCAN_INTERVAL) {
      scanT = 0
      scanClash(here)
    }
    // 前线已经打完就清掉标记
    if (here.front) {
      const list = (game.director?.list || []).filter((m) => m && m.alive !== false && m.__warT > 0)
      if (!list.length) here.front = null
    }
  }

  // ---------------------------------------------------------------- 存档
  function serialize() {
    const st = state()
    const rooms = {}
    for (const key of Object.keys(st.rooms)) {
      const r = st.rooms[key]
      if (!r) continue
      rooms[key] = {
        regionId: r.regionId,
        roomId: r.roomId,
        biome: r.biome,
        pop: { ...r.pop },
        dead: (r.dead || []).map((e) => ({ id: e.id, at: e.at, large: !!e.large })),
        front: r.front ? { ...r.front } : null,
        lastSim: r.lastSim || 0,
      }
    }
    return { clock, rooms }
  }

  function load(save) {
    const st = state()
    st.rooms = {}
    if (!save || typeof save !== 'object') return
    clock = Number(save.clock) || 0
    st.clock = clock
    const rooms = save.rooms && typeof save.rooms === 'object' ? save.rooms : {}
    for (const key of Object.keys(rooms)) {
      const r = rooms[key]
      if (!r) continue
      st.rooms[key] = {
        key,
        regionId: r.regionId || '',
        roomId: r.roomId || '',
        biome: r.biome || 'city',
        pop: r.pop && typeof r.pop === 'object' ? { ...r.pop } : {},
        dead: Array.isArray(r.dead) ? r.dead.filter((e) => e && e.id).map((e) => ({ ...e })) : [],
        pending: [],
        front: r.front && typeof r.front === 'object' ? { ...r.front } : null,
        lastSim: Number(r.lastSim) || 0,
      }
    }
    here = null
  }

  try {
    Events.on?.(EV.MONSTER_KILLED, recordKill)
  } catch (e) {
    /* ignore */
  }

  return {
    update,
    enterRoom,
    leaveRoom,
    serialize,
    load,
    /** 手动触发一对冲突（调试 / 道具） */
    skirmish() {
      if (here) scanClash(here)
    },
    get clock() {
      return clock
    },
    get room() {
      return here
    },
    get fights() {
      return fights
    },
    get kills() {
      return kills
    },
    stats() {
      const st = state()
      const rec = here || null
      return {
        clock,
        fights,
        kills,
        rooms: Object.keys(st.rooms).length,
        pop: rec ? rec.pop : {},
        dead: rec ? rec.dead.length : 0,
        front: rec ? rec.front : null,
      }
    },
  }
}

export default createEcosystemWar
