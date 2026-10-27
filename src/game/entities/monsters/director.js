import { Events, EV } from '../../core/events.js'
import { makeRng } from '../../render/rng.js'
import { Content, KIND } from '../../core/registry.js'
import { TS } from '../../config.js'
import { createMonster, monsterDef, monsterCountForBiome } from './index.js'
import { createLargeMonster, isLarge, LARGE_IDS, largeDef, largeIdsForBiome } from './large/index.js'
import { createEcosystem } from '../../ecosystem/index.js'

/**
 * 刷怪导演 —— 房间内所有生物实例的唯一起点（小怪 + 大型敌人 + 生态系统）。
 *
 * 小怪：MAX_ALIVE = 10；大型敌人在场时少刷 2 只（=8），避免同屏过载。
 * 大型：MAX_LARGE_ALIVE = 2；从 roomData.largeEnemies[] 读；shelter 房间不刷任何东西。
 *
 * 第二轮新增：
 *   · spawnLarge(id,x,y,opts)   实例化大型敌人并派发巡逻点；emit 'large:spawn'
 *   · 死亡时 emit 'large:dead'（每只只发一次），HUD 由引擎监听事件去做
 *   · 大型敌人「游荡→800px 激活」由 large/common.js 执行，director 只负责生成
 *     房间内的巡逻点（不追出房间）
 *   · 生态系统：director 拥有一个 ecosystem（game.ecosystem 若已存在则复用），
 *     随房间 populate / update / clear；引擎只读 game.ecosystem.stats 即可
 *
 * 与引擎的一致约定（全部防御式，缺了会降级）：
 *   game.player 或 game.robot   —— 玩家实体（director 会补一个只读别名 player→robot）
 *   game.spawnProjectile / damageArea / dropLoot / particles / sfx / shake / cameraShake
 *   game.onMonsterKilled → director.onMonsterKilled（引擎已这样接）
 *   game.settleMonsterKill(m, payload) 可选，用于任务/统计结算（与 onMonsterKilled 不同名，
 *   避免递归）
 *
 * 刷怪防呆：
 *   · 出生点距离玩家 < 200px 会被挪到更远的一侧；
 *   · 地面怪物按 room.data.floorY 落地，飞行怪物抬到 hover 高度；
 *   · 超上限的请求进入队列，每 0.5s 补一只；
 *   · 定义里有 pack: [3,5] 的怪物（如 crawler）自动成群刷出。
 */

export const MAX_ALIVE = 10
export const MAX_LARGE_ALIVE = 2
const LARGE_SMALL_RESERVE = 2
const CORPSE_LINGER = 2.0
const LARGE_CORPSE_LINGER = 2.8
const QUEUE_INTERVAL = 0.5
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * 引擎里玩家叫 robot；怪物基类/工具函数读 game.player。
 * 这里给 game 补一个 player 访问器（只读转发到 robot），不覆盖已有定义。
 */
function ensurePlayerAlias(game) {
  try {
    if (game.player) return
    if (Object.getOwnPropertyDescriptor(game, 'player')) return
    let fallback = null
    Object.defineProperty(game, 'player', {
      configurable: true,
      get() {
        return this.robot || fallback || null
      },
      set(v) {
        fallback = v
      },
    })
  } catch (e) {
    /* 某些引擎对象可能被冻结，忽略 */
  }
}

/**
 * @param {object} game Game 实例
 * @returns {object} director API
 */
export function createMonsterDirector(game) {
  if (!game) throw new Error('[monsters] createMonsterDirector 需要 game 实例')
  ensurePlayerAlias(game)

  /** @type {Array<object>} 小怪 + 大型敌人 */
  const list = []
  /** @type {Array<{id:string,x:number,y:number}>} */
  const queue = []

  let kills = 0
  let largeKills = 0
  let roomId = ''
  let settling = false
  let spawnTick = 0
  let time = 0
  let rng = makeRng(1)
  let currentData = null

  // ------------------------------------------------------------------ 生态
  // 引擎（game.js）有 ecosystemFactory 时会自己 new 一个 ecosystem 并在 loadRoom 里
  // populate，并在 update 里调用 ecosystem.update(dt)。
  //   · 那种情况下 director 不创建、不 populate、也不 update（否则会双倍推进）；
  //   · 引擎没有 factory 时（脚本自检 / 精简引擎），director 自己创建 + populate + update；
  //   · 如果某个引擎只创建/populate 而不调用 update，可以设
  //     `game.ecosystemTickedByEngine = false` 让 director 代为 update。
  const engineOwnsEco = typeof game.ecosystemFactory === 'function'
  let eco = null
  try {
    if (engineOwnsEco) {
      eco = game.ecosystem && typeof game.ecosystem.update === 'function' ? game.ecosystem : null
    } else {
      const existing = game.ecosystem
      if (existing && typeof existing.populate === 'function' && typeof existing.update === 'function') {
        eco = existing
      } else {
        eco = createEcosystem(game)
      }
      if (!game.ecosystem) {
        try {
          game.ecosystem = eco
        } catch (e) {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.warn('[monsters] 生态系统初始化失败（不影响刷怪）', err)
    eco = null
  }

  /** 取当前生效的 ecosystem（引擎可能在 loadRoom 里替换实例） */
  function activeEco() {
    const g = game.ecosystem
    if (g && typeof g.update === 'function') return g
    return eco
  }

  // ------------------------------------------------------------------ 基础
  const parent = () => game.scene || game.room?.group || null

  function worldSize(data) {
    const d = data || currentData || game.room?.data
    return {
      w: d?.worldW ?? game.roomW ?? 4000,
      h: d?.worldH ?? game.roomH ?? 2400,
    }
  }

  function playerX() {
    const p = game.player || game.robot
    if (!p) return null
    if (typeof p.centerX === 'number') return p.centerX
    if (p.body) return p.body.x + p.body.w / 2
    return null
  }

  /** 出生点离玩家 / 房间出生点太近就往另一侧挪（200px 安全距离） */
  function shiftAwayFromPlayer(x) {
    const { w } = worldSize()
    const SAFE = 200
    const pts = []
    const px = playerX()
    if (px != null) pts.push(px)
    const sp = currentData?.spawn
    if (sp && Number.isFinite(sp.x)) pts.push(sp.x)
    if (!pts.length) return x
    let out = x
    for (let pass = 0; pass < 2; pass++) {
      for (const p of pts) {
        if (Math.abs(out - p) >= SAFE) continue
        const dir = out >= p ? 1 : -1
        const candidates = [p + dir * SAFE, p - dir * SAFE, p + dir * SAFE * 1.8, p - dir * SAFE * 1.8]
        let chosen = null
        for (const c of candidates) {
          if (c > 48 && c < w - 48) {
            chosen = c
            break
          }
        }
        out = chosen != null ? chosen : clamp(p + dir * SAFE, 48, w - 48)
      }
    }
    return out
  }

  /** 某列的地板世界 y（脚底）；优先用生成器给的 floorY */
  function groundYAt(x, data) {
    const d = data || currentData || game.room?.data
    if (d && d.floorY) {
      const tx = Math.floor(x / TS)
      if (tx >= 0 && tx < d.floorY.length) return d.floorY[tx] * TS
    }
    const map = game.room?.map
    const { h } = worldSize(d)
    if (map && typeof map.groundBelow === 'function') {
      const g = map.groundBelow(x, 0, h)
      if (g != null) return g
    }
    return h - 64
  }

  function isLargeMonster(m) {
    return !!(m && (m.isLarge || isLarge(m.id)))
  }

  function smallAlive() {
    let n = 0
    for (const m of list) if (m.alive && !isLargeMonster(m)) n++
    return n
  }

  function largeAliveCount() {
    let n = 0
    for (const m of list) if (m.alive && isLargeMonster(m)) n++
    return n
  }

  /** 大型敌人在场时，小怪上限降 2 */
  function smallCap() {
    return Math.max(1, MAX_ALIVE - (largeAliveCount() > 0 ? LARGE_SMALL_RESERVE : 0))
  }

  function removeAt(i) {
    const m = list[i]
    if (!m) return
    list.splice(i, 1)
    try {
      const par = m.group?.parent
      if (par) par.remove(m.group)
    } catch (e) {
      /* 场景已随房间销毁 */
    }
    try {
      m.dispose?.()
    } catch (e) {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ 小怪
  /**
   * 立刻刷一只小怪（受同屏上限与玩家距离约束）。
   * 大型敌人也用它来召唤小怪（sky_warden → drone / swarm_core → crawler）。
   * @returns {object|null}
   */
  function spawn(id, x, y) {
    if (smallAlive() >= smallCap()) return null
    const def = monsterDef(id)
    if (!def) {
      console.warn(`[monsters] 无法刷出未知怪物 "${id}"`)
      return null
    }
    const { w } = worldSize()
    const sx = clamp(shiftAwayFromPlayer(Number.isFinite(x) ? x : w / 2), 48, w - 48)
    let sy
    if (def.flying) {
      const gy = Number.isFinite(y) && y > 0 ? y : groundYAt(sx)
      sy = Math.max(40, gy - (def.hover ?? 140))
    } else {
      sy = Number.isFinite(y) && y > 0 ? y : groundYAt(sx)
    }
    const m = createMonster(game, id, sx, sy)
    if (!m) return null
    const par = parent()
    if (par) par.add(m.group)
    list.push(m)
    return m
  }

  /** 带 pack 的怪物一次刷一群（受同屏上限约束） */
  function spawnGroup(id, x, y) {
    const def = monsterDef(id)
    const first = spawn(id, x, y)
    if (!first) return 0
    if (!def || !Array.isArray(def.pack) || def.pack.length < 2) return 1
    let spawned = 1
    const total = rng.int(def.pack[0], def.pack[1])
    const { w } = worldSize()
    for (let i = 1; i < total; i++) {
      const ox = clamp(x + rng.range(-100, 100), 48, w - 48)
      const ok = spawn(id, ox, y)
      if (!ok) {
        queue.push({ id, x: ox, y })
        continue
      }
      spawned++
    }
    return spawned
  }

  function enqueue(id, x, y) {
    if (!id) return
    queue.push({ id, x, y })
  }

  function flushImmediate() {
    let guard = 0
    while (queue.length && smallAlive() < smallCap() && guard++ < 64) {
      const s = queue.shift()
      spawnGroup(s.id, s.x, s.y)
    }
  }

  function autoFill(biome, kind, data) {
    const count = monsterCountForBiome(biome, kind)
    if (count <= 0) return
    let pool = Content.all(KIND.MONSTER).filter((d) => !d.biome || d.biome.includes(biome))
    if (!pool.length) pool = Content.all(KIND.MONSTER)
    if (!pool.length) return
    const normal = pool.filter((d) => !d.elite)
    const elites = pool.filter((d) => d.elite)
    const { w } = worldSize(data)
    for (let i = 0; i < count; i++) {
      let def = null
      const allowElite = (kind === 'arena' || kind === 'standard') && i > 0 && elites.length > 0
      if (allowElite && rng.chance(kind === 'arena' ? 0.4 : 0.18)) def = rng.pick(elites)
      if (!def) def = normal.length ? rng.pick(normal) : rng.pick(pool)
      const x = rng.range(140, Math.max(180, w - 140))
      enqueue(def.id, x, 0)
    }
  }

  // ------------------------------------------------------------------ 大型敌人
  function makePatrol(x, gy, w) {
    const xs = [clamp(x - 220, 140, w - 140), clamp(x, 140, w - 140), clamp(x + 220, 140, w - 140)]
    const pts = []
    for (const px of xs) {
      if (!pts.some((p) => Math.abs(p.x - px) < 40)) pts.push({ x: px, y: gy })
    }
    return pts
  }

  /** 世界生成器没有提供 roomData.largeEnemies 时的兜底（0~2 只，确定性种子） */
  function fallbackLargeSpecs(biome, kind, data) {
    const k = String(kind || 'standard').toLowerCase()
    if (k === 'shelter' || k === 'gate') return []
    const chance = k === 'arena' ? 1 : ({ city: 0.4, factory: 0.5, dump: 0.55, village: 0.22 }[biome] ?? 0.35)
    if (!rng.chance(chance)) return []
    const { w } = worldSize(data)
    const pool = largeIdsForBiome(biome)
    const specs = [{ id: rng.pick(pool.length ? pool : LARGE_IDS), x: rng.range(220, Math.max(260, w - 220)) }]
    if ((k === 'arena' || k === 'boss') && rng.chance(0.5) && pool.length > 1) {
      specs.push({ id: rng.pick(pool), x: rng.range(220, Math.max(260, w - 220)) })
    }
    return specs
  }

  /**
   * 刷一只大型敌人。emit 'large:spawn'。
   * @param {string} id
   * @param {number} x
   * @param {number} y  脚底 y（<=0 时按地板自动取）
   * @param {object} opts { patrol }
   */
  function spawnLarge(id, x, y, opts = {}) {
    if (largeAliveCount() >= MAX_LARGE_ALIVE) return null
    if (!isLarge(id)) {
      console.warn(`[monsters:large] 未知大型敌人 "${id}"，可用：${LARGE_IDS.join(', ')}`)
      return null
    }
    const def = largeDef(id)
    const { w } = worldSize()
    const sx = clamp(shiftAwayFromPlayer(Number.isFinite(x) ? x : w / 2), 140, w - 140)
    const groundY = groundYAt(sx)
    let sy = Number.isFinite(y) && y > 0 ? y : groundY
    if (def?.flying) sy = Math.max(80, sy - (def.hover ?? 200))

    const m = createLargeMonster(game, id, sx, sy)
    if (!m) return null
    const par = parent()
    if (par) par.add(m.group)
    const patrol = Array.isArray(opts.patrol) && opts.patrol.length ? opts.patrol : makePatrol(sx, groundY, w)
    if (typeof m.setPatrol === 'function') m.setPatrol(patrol)
    list.push(m)

    Events.emit('large:spawn', {
      id,
      name: def?.name || id,
      x: sx,
      y: sy,
      roomId,
      def: def || null,
      monster: m,
      elite: true,
      patrol,
    })
    return m
  }

  function emitLargeDead(monster, payload = null) {
    if (!monster || monster.__largeDeadEmitted) return
    monster.__largeDeadEmitted = true
    largeKills++
    Events.emit('large:dead', {
      id: monster.id,
      name: monster.def?.name || monster.id,
      x: monster.px,
      y: monster.py,
      xp: monster.def?.xp || 0,
      roomId,
      monster,
      payload,
    })
  }

  // ------------------------------------------------------------------ 房间
  /**
   * 进入房间时调用。roomData 可以是 Room 实例或 generateBiomeRoom 的产物。
   */
  function populate(roomData) {
    clear()
    const data = roomData && roomData.map ? roomData : roomData?.data || {}
    currentData = data
    roomId = data.roomId || data.id || data.spec?.id || game.room?.data?.roomId || ''
    const seed = (data.seed ?? data.spec?.seed ?? 0x9e3779b9) ^ 0x5f3759df
    rng = makeRng(seed >>> 0)

    const biome = data.biome || data.spec?.biome || game.room?.data?.biome || 'city'
    const kind = data.kind || data.spec?.kind || (data.shelter ? 'shelter' : 'standard')
    const isShelter = !!(data.shelter || String(kind).toLowerCase() === 'shelter')

    if (isShelter) {
      // 庇护所不刷怪（大型 / 小怪 / 生态都不刷）
      if (!engineOwnsEco && eco?.populate) {
        try {
          eco.populate(data)
        } catch (e) {
          console.warn('[monsters] 生态 populate 失败', e)
        }
      }
      return 0
    }

    // ---- 大型敌人（0~2） ----
    const largeSpecs = Array.isArray(data.largeEnemies)
      ? data.largeEnemies
      : fallbackLargeSpecs(biome, kind, data)
    for (const spec of largeSpecs || []) {
      if (largeAliveCount() >= MAX_LARGE_ALIVE) break
      if (!spec) continue
      const id = typeof spec === 'string' ? spec : spec.id
      const wanted = isLarge(id) ? id : rng.pick(largeIdsForBiome(biome))
      const { w } = worldSize(data)
      const sx = typeof spec === 'object' && Number.isFinite(spec.x) ? spec.x : rng.range(200, Math.max(240, w - 200))
      const sy = typeof spec === 'object' && Number.isFinite(spec.y) ? spec.y : 0
      spawnLarge(wanted, sx, sy, { patrol: typeof spec === 'object' ? spec.patrol : null })
    }

    // ---- 小怪 ----
    const specs = Array.isArray(data.monsters) ? data.monsters.filter(Boolean) : []
    if (specs.length) {
      const { w } = worldSize(data)
      for (const s of specs) {
        if (typeof s === 'string') {
          enqueue(s, rng.range(160, Math.max(200, w - 160)), 0)
          continue
        }
        if (!s.id) continue
        const sx = Number.isFinite(s.x) ? s.x : rng.range(160, Math.max(200, w - 160))
        const sy = Number.isFinite(s.y) ? s.y : 0
        enqueue(s.id, sx, sy)
      }
    } else {
      autoFill(biome, kind, data)
    }
    flushImmediate()
    spawnTick = 0

    // ---- 生态 ----
    // 引擎自己管理 ecosystem 时不重复 populate（否则会清掉引擎刚生成的实体）
    if (!engineOwnsEco && eco?.populate) {
      try {
        eco.populate(data)
      } catch (e) {
        console.warn('[monsters] 生态 populate 失败', e)
      }
    }
    return list.length
  }

  function removeAll() {
    for (let i = list.length - 1; i >= 0; i--) removeAt(i)
    list.length = 0
  }

  /** 切房 / 重开时清空 */
  function clear() {
    removeAll()
    queue.length = 0
    spawnTick = 0
    currentData = null
    const target = activeEco()
    if (target?.clear) {
      try {
        target.clear()
      } catch (e) {
        /* ignore */
      }
    }
    if (eco && eco !== target && eco.clear) {
      try {
        eco.clear()
      } catch (e) {
        /* ignore */
      }
    }
  }

  function update(dt) {
    const step = Math.min(Math.max(Number(dt) || 0, 0), 0.05)
    time += step
    const { h } = worldSize()

    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (!m) continue
      try {
        m.update(step)
      } catch (err) {
        console.error(`[monsters] ${m.id} update 失败`, err)
      }
      if (m.alive === false) {
        if (isLargeMonster(m)) emitLargeDead(m)
        const linger = isLargeMonster(m) ? LARGE_CORPSE_LINGER : CORPSE_LINGER
        if ((m.deadT || 0) >= linger) {
          removeAt(i)
          continue
        }
      }
      if (m.body && m.body.y > h + 500) removeAt(i)
    }

    // 队列补充：每 QUEUE_INTERVAL 秒最多补一只，避免瞬间同屏炸满
    if (queue.length && smallAlive() < smallCap()) {
      spawnTick += step
      if (spawnTick >= QUEUE_INTERVAL) {
        spawnTick = 0
        const s = queue.shift()
        if (s) spawnGroup(s.id, s.x, s.y)
      }
    }

    // 引擎（loadRoom）可能替换了 ecosystem 实例：每帧对齐一次，保证读到的是活的
    const liveEco = activeEco()
    if (liveEco && liveEco !== eco) eco = liveEco
    // 引擎自己有 update 时不要重复推进（否则植物/蟑螂都双倍速）；可用 game.ecosystemTickedByEngine=false 覆盖
    const engineTicksEco = engineOwnsEco && game.ecosystemTickedByEngine !== false
    if (!engineTicksEco && eco?.update) {
      try {
        eco.update(step)
      } catch (err) {
        console.error('[ecosystem] update 失败', err)
      }
    }
  }

  function aliveCount() {
    return smallAlive()
  }

  /**
   * 死亡结算入口。引擎的 game.onMonsterKilled 会转到这里（base.js die() 调用）。
   * 大怪死亡会额外 emit 'large:dead'（每只一次）。
   * @returns {object|null} 结算 payload
   */
  function onMonsterKilled(monster) {
    if (!monster) return null
    const big = isLargeMonster(monster)
    if (big) emitLargeDead(monster)

    if (settling) return null
    settling = true
    try {
      kills++
      const def = monster.def || {}
      const payload = {
        id: monster.id,
        name: def.name || monster.id,
        family: def.family || 'beast',
        elite: !!(def.elite || monster.elite),
        large: big,
        xp: def.xp || 0,
        x: monster.px,
        y: monster.py,
        roomId,
        monster,
      }
      Events.emit(EV.MONSTER_KILLED, payload)
      // 交给 game 侧结算（不同名，避免与 game.onMonsterKilled 递归）
      if (typeof game.settleMonsterKill === 'function') game.settleMonsterKill(monster, payload)
      else if (typeof game.onKill === 'function') game.onKill(monster, payload)
      return payload
    } finally {
      settling = false
    }
  }

  const api = {
    populate,
    update,
    clear,
    spawn,
    spawnLarge,
    aliveCount,
    largeAliveCount,
    onMonsterKilled,
    /**
     * 手动推进生态系统（引擎自己也在 update 时不要调用，会双倍速）。
     * 给「只创建/populate 但不 update 生态」的精简引擎用。
     */
    updateEcosystem(dt) {
      const target = activeEco()
      if (target !== eco) eco = target
      if (!eco?.update) return false
      const step = Math.min(Math.max(Number(dt) || 0, 0), 0.05)
      try {
        eco.update(step)
        return true
      } catch (err) {
        console.error('[ecosystem] update 失败', err)
        return false
      }
    },
    get list() {
      return list
    },
    get smallList() {
      return list.filter((m) => !isLargeMonster(m))
    },
    get largeList() {
      return list.filter((m) => isLargeMonster(m))
    },
    get ecosystem() {
      return activeEco()
    },
    get queued() {
      return queue.length
    },
    get killCount() {
      return kills
    },
    get largeKillCount() {
      return largeKills
    },
    get roomId() {
      return roomId
    },
    get time() {
      return time
    },
    get maxAlive() {
      return MAX_ALIVE
    },
    get maxLargeAlive() {
      return MAX_LARGE_ALIVE
    },
    get stats() {
      return {
        small: smallAlive(),
        large: largeAliveCount(),
        smallCap: smallCap(),
        queued: queue.length,
        kills,
        largeKills,
        roomId,
        ecosystem: activeEco()?.stats?.() || null,
      }
    },
    dispose() {
      clear()
    },
  }

  // 引擎没自己实现 onMonsterKilled 时，直接把导演接上去
  if (typeof game.onMonsterKilled !== 'function') {
    game.onMonsterKilled = onMonsterKilled
  }
  if (!game.director) {
    try {
      game.director = api
    } catch (e) {
      /* ignore */
    }
  }

  return api
}

export default createMonsterDirector
