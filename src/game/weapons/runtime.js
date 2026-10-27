// 武器运行时（WeaponSystem）—— 冷却 / 弹药 / 换弹 / 兼容校验 / 命中结算。
//
// 设计边界：
//   · 本文件不 import game.js，只通过构造时注入的 game 对象做防御式调用。
//   · 武器本体留在背包里（不搬进 G.equipped），本系统只记录「当前激活的武器 id」。
//   · 弹药从 game.inventory 扣：count / remove / add（换弹中途取消会退回）。
//   · 远程弹道交给 game.spawnProjectile（引擎已实现）；但**伤害由本系统自己结算**：
//     game.updateProjectiles 里 projectile 命中判定针对的是 robot（game.js:1000），
//     把 damage 传过去会导致玩家被自己的子弹打中；所以 spawnProjectile 的 damage 传 0，
//     由 _updateShots 每帧对 game.director.list 里的怪物做命中检测并调用 takeDamage。
//     若引擎以后把 spawnProjectile 的命中改成面向怪物，本系统仍然只结算一次，不会双倍。
//   · 近战优先遍历 game.director.list；只有在引擎没有 director（或在单测里）时才回退到
//     game.damageArea（注意：现有 game.damageArea 结算的是 robot 自身，正常游戏里不会走到）。
//   · 所有 game.* / G.* 调用都在 try 里，任何缺失都降级为 reason 字符串，不抛异常。
//
// 引擎接线（需要 Lead 在 game.js 里做，本文件不碰）：
//   1) this.weapons = new WeaponSystem(this)
//   2) 每帧 this.weapons.setHolding(输入开火键按住); this.weapons.update(dt)
//   3) HUD 读 G.weapon（state() 每帧写）显示名称/弹匣/备弹/换弹进度/兼容提示
//   4) 背包 UI 需要把 category 'weapon' / 'ammo' 加进分类页签与图标分支
import { Content, KIND } from '../core/registry.js'
import { G } from '../state.js'
import {
  WEAPON_CATEGORY,
  AMMO_CATEGORY,
  getWeapon,
  ammoForWeapon,
  cooldownOf,
  reloadTimeOf,
  heroHasArm,
  chassisCarry,
} from './data.js'

/** 近战攻击的纵向容差（世界像素） */
const MELEE_YTOL = 26

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}

/** 取实体中心（怪物 px/py 是 getter；兼容 x/y 字段的假对象） */
function entityX(e) {
  if (!e) return 0
  if (typeof e.px === 'number') return e.px
  if (typeof e.x === 'number') return e.x
  if (typeof e.centerX === 'number') return e.centerX
  return 0
}

function entityY(e) {
  if (!e) return 0
  if (typeof e.py === 'number') return e.py
  if (typeof e.y === 'number') return e.y
  if (typeof e.centerY === 'number') return e.centerY
  return 0
}

function isAlive(e) {
  if (!e) return false
  if (e.alive === false) return false
  if (e.dead === true) return false
  if (typeof e.hp === 'number' && e.hp <= 0) return false
  return true
}

export class WeaponSystem {
  /**
   * @param {object} game 引擎实例（需提供 robot / inventory / director / spawnProjectile / sfx / particles / shake）
   */
  constructor(game) {
    this.game = game || {}
    /** 当前激活武器 id，null = 空手 */
    this.weaponId = null
    /** 弹匣内已装填数量 */
    this.mag = 0
    /** 距离下次可开火的剩余秒数 */
    this.cooldown = 0
    /** 是否正在换弹 */
    this.reloading = false
    /** 换弹剩余 / 总时长 */
    this.reloadT = 0
    this.reloadTotal = 0
    /** 换弹完成后要压进弹匣的子弹数 + 来源（取消时按来源退回） */
    this.pending = 0
    this.pendingPrimary = 0
    this.pendingFallbackCells = 0
    /** 按住开火（引擎每帧 setHolding） */
    this.holding = false
    /** 在飞行的弹药（用于本系统结算命中） */
    this._shots = []
    /** 最近一次失败原因（调试/HUD 用） */
    this.lastError = ''
    this._autoReason = ''
    this.lastFire = null
    // 初始写一次 G.weapon，保证 HUD 首帧就有结构
    this.state()
  }

  // ===========================================================================
  // 查询
  // ===========================================================================

  /** 当前武器定义（无武器返回 null） */
  weaponDef() {
    if (!this.weaponId) return null
    return getWeapon(this.weaponId)
  }

  /** 当前机体 id（读 G，缺失时回退 unit7） */
  chassisId() {
    try {
      return G.chassisId || 'unit7'
    } catch (e) {
      return 'unit7'
    }
  }

  _robot() {
    const r = this.game && this.game.robot
    if (!r) return null
    if (r.dead) return null
    return r
  }

  _inv() {
    const inv = this.game && this.game.inventory
    if (!inv || typeof inv.count !== 'function' || typeof inv.remove !== 'function') return null
    return inv
  }

  /**
   * 兼容校验：武器 + 当前机体。
   * @param {string} weaponId
   * @param {string} [chassisId] 不传则读 G.chassisId（单测可显式传）
   * @returns {{ok:boolean, reason:string}}
   */
  canEquip(weaponId, chassisId = null) {
    const def = getWeapon(weaponId)
    if (!def) return { ok: false, reason: '没有这件武器' }
    const cid = chassisId || this.chassisId()
    const chassis = Content.get(KIND.CHASSIS, cid)
    // 机体数据缺失：不拦（避免内容未加载时整把武器不可用）
    if (!chassis) return { ok: true, reason: '' }

    const compat = def.compat || {}
    const list = Array.isArray(compat.chassis) && compat.chassis.length ? compat.chassis : null

    if (list && !list.includes(cid)) {
      return { ok: false, reason: compat.reason || `${chassis.name || cid}装不上${def.name}` }
    }
    if (compat.requiresArm && !heroHasArm(cid)) {
      return { ok: false, reason: compat.reason || '这条机械臂握不住它' }
    }
    const minCarry = num(compat.minCarry, 0)
    if (minCarry > 0 && chassisCarry(cid) < minCarry) {
      return { ok: false, reason: compat.reason || '这台机体的负重撑不住它' }
    }
    // 机架宽度：重武器需要足够的挂载面（读 def.hitbox[0]）
    const minHitbox = num(compat.minHitbox, 0)
    if (minHitbox > 0) {
      const hb = Array.isArray(chassis.hitbox) ? num(chassis.hitbox[0], 0) : 0
      if (hb > 0 && hb < minHitbox) {
        return { ok: false, reason: compat.reason || '这台机体的机架太窄，装不下它' }
      }
    }
    return { ok: true, reason: '' }
  }

  /** 当前武器在背包里的备弹总数（含 cell_small 换算），用于 HUD */
  ammoReserve(weaponId = null) {
    const def = weaponId ? getWeapon(weaponId) : this.weaponDef()
    if (!def) return 0
    const inv = this._inv()
    if (!inv) return 0
    let n = 0
    try {
      if (def.ammoType) n += inv.count(def.ammoType)
    } catch (e) {
      /* ignore */
    }
    if (def.ammoFallback) {
      try {
        const cells = inv.count(def.ammoFallback.id)
        n += cells * Math.max(1, num(def.ammoFallback.rounds, 1))
      } catch (e) {
        /* ignore */
      }
    }
    return n
  }

  /** 武器自带的 bonus（若 Lead 想合并进机体属性，可读这个；本系统不改 stats） */
  bonus() {
    const def = this.weaponDef()
    return def && def.bonus ? { ...def.bonus } : {}
  }

  /**
   * 图标：优先用注入的 game.getWeaponArt（art-char 提供），任何异常都兜底 null。
   * UI 侧建议：拿不到就退回 ItemIcon 的分类字形。
   */
  icon() {
    const id = this.weaponId
    if (!id) return null
    try {
      const fn = this.game.getWeaponArt || (this.game.art && this.game.art.getWeaponArt)
      if (typeof fn !== 'function') return null
      return fn(id) || null
    } catch (e) {
      return null
    }
  }

  // ===========================================================================
  // 装备 / 卸下
  // ===========================================================================

  /**
   * 装备武器。武器必须在这台机体的兼容清单里，且（通常）在背包里。
   * 装备后若背包有备弹，会自动开始一次换弹（避免第一次开火是空仓）。
   * @returns {{ok:boolean, reason:string, reloading?:boolean}}
   */
  equip(weaponId) {
    const check = this.canEquip(weaponId)
    if (!check.ok) {
      this.lastError = check.reason
      return { ok: false, reason: check.reason }
    }
    const def = getWeapon(weaponId)
    if (!def) return { ok: false, reason: '没有这件武器' }

    const inv = this._inv()
    const inBag = inv ? inv.count(weaponId) > 0 : true // 没有背包系统时不拦
    let altEquipped = false
    try {
      altEquipped = !!(G.equipped && G.equipped.weapon === weaponId)
    } catch (e) {
      /* ignore */
    }
    if (!inBag && !altEquipped && this.weaponId !== weaponId) {
      const reason = '背包里没有这件武器'
      this.lastError = reason
      return { ok: false, reason }
    }

    // 换武器 = 取消未完成的换弹（把已经取出的子弹退回背包）
    this._cancelReload(true)

    this.weaponId = weaponId
    this.mag = 0
    this.cooldown = 0
    this.holding = false
    this.lastError = ''

    // 自动装填：有备弹就立刻开始换弹，没有就保持空仓（fire 会给中文原因）
    if (def.class === 'ranged' && num(def.magazine, 0) > 0) {
      const reserve = this.ammoReserve(weaponId)
      if (reserve > 0) this.reload()
    }
    this.state()
    return { ok: true, reason: '', reloading: this.reloading }
  }

  /** 卸下当前武器（不改变背包内容） */
  unequip() {
    const prev = this.weaponId
    if (!prev) return { ok: false, reason: '没有装备武器' }
    this._cancelReload(true)
    this.weaponId = null
    this.mag = 0
    this.cooldown = 0
    this.holding = false
    this.reloading = false
    this.reloadT = 0
    this.reloadTotal = 0
    this.state()
    return { ok: true, itemId: prev }
  }

  /** 引擎每帧设置「开火键是否按住」，update 内据此自动射击 */
  setHolding(v) {
    this.holding = !!v
    if (!this.holding) this._autoReason = ''
  }

  // ===========================================================================
  // 开火
  // ===========================================================================

  /**
   * 单次开火。所有失败都用中文 reason 表达，不抛异常。
   * @returns {{ok:boolean, reason:string, kind?:string, hits?:number, mag?:number, autoReload?:boolean}}
   */
  fire() {
    const robot = this._robot()
    if (!robot) {
      this.lastError = '没有可操作的机体'
      return { ok: false, reason: '没有可操作的机体' }
    }
    const def = this.weaponDef()
    if (!def) {
      this.lastError = '没有装备武器'
      return { ok: false, reason: '没有装备武器' }
    }
    const check = this.canEquip(def.id)
    if (!check.ok) {
      this.lastError = check.reason
      return { ok: false, reason: check.reason }
    }
    if (this.reloading) {
      this.lastError = '换弹中'
      return { ok: false, reason: '换弹中' }
    }
    if (this.cooldown > 0) {
      const reason = `还在冷却（${this.cooldown.toFixed(2)}s）`
      this.lastError = reason
      return { ok: false, reason }
    }

    let result = null
    try {
      result = def.class === 'melee' ? this._fireMelee(def, robot) : this._fireRanged(def, robot)
    } catch (err) {
      // 防御：任何美术/引擎侧异常都不该让游戏崩
      console.error('[weapons] fire failed', err)
      result = { ok: false, reason: '武器卡壳了' }
    }
    this.lastFire = result
    if (result && !result.ok) this.lastError = result.reason
    this.state()
    return result
  }

  /** 近战：扇形判定怪物（director.list），无 director 时回退 damageArea */
  _fireMelee(def, robot) {
    const facing = num(robot.facing, 1) >= 0 ? 1 : -1
    const cx = num(robot.centerX, 0)
    const cy = num(robot.centerY, 0)
    const reach = num(def.range, 48)
    const arc = num(def.melee && def.melee.arc, 0.9)

    this.cooldown = cooldownOf(def.id)

    let hits = 0
    const list = this.game.director && Array.isArray(this.game.director.list) ? this.game.director.list : null
    if (list && list.length) {
      for (const m of list) {
        if (!isAlive(m)) continue
        const mx = entityX(m)
        const my = entityY(m)
        const dx = (mx - cx) * facing // 只用前方，后方不判定
        if (dx < -12) continue
        const dy = my - cy
        if (Math.abs(dy) > reach * 0.9 + MELEE_YTOL) continue
        const dist = Math.hypot(dx, dy)
        const bodyR = Math.max(10, num(m.w, 24) * 0.5)
        if (dist > reach + bodyR) continue
        // 扇形纵向容差：arctan(|dy| / 前方距离) 不超过 arc 的一半 + 一点宽限
        const ang = Math.atan2(Math.abs(dy), Math.max(1, dx))
        if (ang > Math.PI * arc * 0.4 + 0.35) continue

        try {
          if (typeof m.takeDamage === 'function') m.takeDamage(num(def.damage, 10), cx + facing * 12)
        } catch (e) {
          console.error('[weapons] monster takeDamage failed', e)
        }
        // 额外击退（takeDamage 自带一点，数据里的 knockback 再加一层，封顶）
        try {
          const kb = num(def.melee && def.melee.knockback, 0)
          if (kb > 0 && m.body) {
            m.body.vx = num(m.body.vx, 0) + facing * Math.min(360, kb * 0.35)
          }
        } catch (e) {
          /* ignore */
        }
        hits++
      }
    } else {
      // 兜底：本仓库当前的 game.damageArea 结算的是 robot 自身（game.js:1020），
      // 只有单测/引擎没有 director 时才会走到这里。
      const areaFn = this.game.damageMonstersArea || this.game.damageArea
      if (typeof areaFn === 'function') {
        try {
          areaFn.call(this.game, cx + facing * reach * 0.6, cy, reach, num(def.damage, 10))
        } catch (e) {
          console.error('[weapons] damageArea failed', e)
        }
      }
    }

    // 手感：镜头抖动 + 声音 + 火花
    try {
      if (typeof this.game.shake === 'function') this.game.shake(0.12)
      else if (typeof this.game.cameraShake === 'function') this.game.cameraShake(0.12)
    } catch (e) {
      /* ignore */
    }
    try {
      this.game.sfx && this.game.sfx(hits > 0 ? 'hurt' : 'throw', { vol: 0.45, rate: hits > 0 ? 1.15 : 1.5 })
    } catch (e) {
      /* ignore */
    }
    try {
      const px = cx + facing * reach * 0.7
      this.game.particles && this.game.particles.emitMany('spark', px, cy, hits > 0 ? 7 : 3)
    } catch (e) {
      /* ignore */
    }

    return { ok: true, reason: '', kind: 'melee', hits, damage: num(def.damage, 10) }
  }

  /** 远程：扣弹 → 生成引擎弹道 → 本系统跟踪命中 */
  _fireRanged(def, robot) {
    const per = Math.max(1, Math.floor(num(def.ammoPerShot, 1)))
    const magSize = Math.floor(num(def.magazine, 0))
    const inv = this._inv()

    if (magSize > 0) {
      if (this.mag < per) {
        const reserve = this.ammoReserve(def.id)
        const reason = reserve > 0 ? '弹匣空了，按 R 换弹' : '没有弹药了'
        this.lastError = reason
        return { ok: false, reason }
      }
      this.mag -= per
    } else {
      // 无弹匣武器（数据异常兜底）：直接从背包扣
      if (!inv) {
        this.lastError = '背包不可用'
        return { ok: false, reason: '背包不可用' }
      }
      const ammoId = def.ammoType
      if (!ammoId || inv.count(ammoId) < per) {
        this.lastError = '没有弹药了'
        return { ok: false, reason: '没有弹药了' }
      }
      inv.remove(ammoId, per)
    }

    const facing = num(robot.facing, 1) >= 0 ? 1 : -1
    // 枪口 = 玩家中心 + facing*24，y 中心 - 6
    const mx = num(robot.centerX, 0) + facing * 24
    const my = num(robot.centerY, 0) - 6

    const proj = def.projectile || {}
    const spread = clamp(num(def.spread, 0), 0, 1)
    const ang = (Math.random() * 2 - 1) * spread
    const speed = Math.max(1, num(proj.speed, 700))
    const vx = facing * speed * Math.cos(ang)
    const vy = speed * Math.sin(ang) - num(proj.lift, 0)

    if (typeof this.game.spawnProjectile !== 'function') {
      this.mag += per // 回滚弹药
      this.lastError = '弹道系统不可用'
      return { ok: false, reason: '弹道系统不可用' }
    }

    let p = null
    try {
      p = this.game.spawnProjectile({
        x: mx,
        y: my,
        vx,
        vy,
        // 重要：伤害不在引擎侧结算（见文件头注释），由 _updateShots 自己算
        damage: 0,
        radius: num(proj.radius, 4),
        color: num(proj.color, 0x9ac84a),
        life: num(proj.life, 1.2),
        gravity: num(proj.gravity, 0),
        onHit: null,
        onLand: null,
      })
    } catch (err) {
      console.error('[weapons] spawnProjectile failed', err)
      p = null
    }

    if (!p) {
      if (magSize > 0) this.mag += per
      else if (inv) {
        try {
          inv.add(def.ammoType, per)
        } catch (e) {
          /* ignore */
        }
      }
      this.lastError = '弹道系统不可用'
      return { ok: false, reason: '弹道系统不可用' }
    }

    this._shots.push({
      p,
      weaponId: def.id,
      damage: num(def.damage, 10),
      pierce: !!proj.pierce,
      splash: num(proj.splash, 0),
      splashed: false,
      done: false,
      hitIds: new Set(),
    })

    this.cooldown = cooldownOf(def.id)

    try {
      this.game.sfx && this.game.sfx('throw', { vol: 0.35, rate: 1.7 })
    } catch (e) {
      /* ignore */
    }
    try {
      this.game.particles && this.game.particles.emitMany('spark', mx, my, 3)
    } catch (e) {
      /* ignore */
    }
    if (magSize > 0) {
      try {
        if (typeof this.game.shake === 'function') this.game.shake(0.05)
      } catch (e) {
        /* ignore */
      }
    }

    // 打空弹匣：还有备弹就自动换弹
    let autoReload = false
    if (magSize > 0 && this.mag <= 0 && this.ammoReserve(def.id) > 0) {
      const r = this.reload()
      autoReload = !!r.ok
    }

    return { ok: true, reason: '', kind: 'ranged', mag: this.mag, autoReload }
  }

  // ===========================================================================
  // 换弹
  // ===========================================================================

  /**
   * 开始换弹：从背包取弹（优先主弹药，激光类可用 cell_small 折算）。
   * 换弹过程中再调用返回「正在换弹」。
   * @returns {{ok:boolean, reason:string, rounds?:number, time?:number}}
   */
  reload() {
    const def = this.weaponDef()
    if (!def) return { ok: false, reason: '没有装备武器' }
    if (def.class !== 'ranged' || !num(def.magazine, 0)) {
      return { ok: false, reason: '这件武器不需要换弹' }
    }
    if (this.reloading) return { ok: false, reason: '正在换弹' }
    const magSize = Math.floor(num(def.magazine, 0))
    if (this.mag >= magSize) return { ok: false, reason: '弹匣是满的' }

    const inv = this._inv()
    if (!inv) return { ok: false, reason: '背包不可用' }

    const need = magSize - this.mag
    const primaryNeed = need
    let gotPrimary = 0
    if (def.ammoType) {
      try {
        const have = inv.count(def.ammoType)
        const take = Math.min(primaryNeed, have)
        if (take > 0) {
          inv.remove(def.ammoType, take)
          gotPrimary = take
        }
      } catch (e) {
        console.error('[weapons] reload primary failed', e)
      }
    }

    let gotFallback = 0
    let cellsUsed = 0
    if (gotPrimary < need && def.ammoFallback) {
      const fb = def.ammoFallback
      const roundsPer = Math.max(1, Math.floor(num(fb.rounds, 1)))
      try {
        const cells = inv.count(fb.id)
        if (cells > 0) {
          const needRounds = need - gotPrimary
          cellsUsed = Math.min(cells, Math.ceil(needRounds / roundsPer))
          if (cellsUsed > 0) {
            inv.remove(fb.id, cellsUsed)
            gotFallback = Math.min(needRounds, cellsUsed * roundsPer)
          }
        }
      } catch (e) {
        console.error('[weapons] reload fallback failed', e)
      }
    }

    const rounds = gotPrimary + gotFallback
    if (rounds <= 0) {
      this.lastError = '没有弹药了'
      return { ok: false, reason: '没有弹药了' }
    }

    this.pending = rounds
    this.pendingPrimary = gotPrimary
    this.pendingFallbackCells = cellsUsed
    this.reloading = true
    this.reloadTotal = reloadTimeOf(def.id)
    this.reloadT = this.reloadTotal

    try {
      this.game.sfx && this.game.sfx('uiClick', { vol: 0.3, rate: 1.1 })
    } catch (e) {
      /* ignore */
    }
    this.state()
    return { ok: true, reason: '', rounds, time: this.reloadTotal }
  }

  /** 取消换弹；refund=true 时把已取出的子弹按来源退回背包 */
  _cancelReload(refund = true) {
    if (!this.reloading && this.pending <= 0) return
    const inv = this._inv()
    const def = this.weaponDef()
    if (refund && inv && def) {
      try {
        if (this.pendingPrimary > 0 && def.ammoType) inv.add(def.ammoType, this.pendingPrimary)
      } catch (e) {
        /* ignore */
      }
      try {
        const cells = this.pendingFallbackCells || 0
        if (cells > 0 && def.ammoFallback) inv.add(def.ammoFallback.id, cells)
      } catch (e) {
        /* ignore */
      }
    }
    this.reloading = false
    this.reloadT = 0
    this.reloadTotal = 0
    this.pending = 0
    this.pendingPrimary = 0
    this.pendingFallbackCells = 0
  }

  // ===========================================================================
  // 每帧更新
  // ===========================================================================

  /**
   * 每帧调用：冷却 / 换弹计时 / 在飞弹药命中 / 按住自动射击。
   * @param {number} dt 秒
   */
  update(dt) {
    let step = num(dt, 0)
    if (step <= 0) step = 0
    // 不夹 dt：切后台后一次大步长只应结算一次开火（由 cooldown 天然限制），
    // 但换弹/冷却计时必须按真实 dt 推进，否则长帧会让换弹永远差一点点。

    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - step)

    if (this.reloading) {
      this.reloadT -= step
      if (this.reloadT <= 0) this._finishReload()
    }

    this._updateShots(step)

    if (this.holding) {
      const r = this.fire()
      if (!r.ok) this._autoReason = r.reason
      else this._autoReason = ''
    }

    this.state()
  }

  _finishReload() {
    const def = this.weaponDef()
    const magSize = def ? Math.floor(num(def.magazine, 0)) : 0
    this.mag = Math.min(magSize, this.mag + this.pending)
    this.pending = 0
    this.pendingPrimary = 0
    this.pendingFallbackCells = 0
    this.reloading = false
    this.reloadT = 0
    this.reloadTotal = 0
    try {
      this.game.sfx && this.game.sfx('pickup', { vol: 0.32, rate: 1.6 })
    } catch (e) {
      /* ignore */
    }
  }

  /** 在飞弹药的命中结算（只对 director.list 里的怪物） */
  _updateShots(dt) {
    if (!this._shots.length) return
    const list = this.game.director && Array.isArray(this.game.director.list) ? this.game.director.list : null
    for (let i = this._shots.length - 1; i >= 0; i--) {
      const shot = this._shots[i]
      const p = shot.p

      // 引擎已回收（life 归零 / 从场景移除 / 从 projectiles 数组消失）
      const gone = !p || p.life <= 0 || (p.mesh && p.mesh.parent === null)
      if (!gone && list && list.length) {
        for (const m of list) {
          if (!isAlive(m)) continue
          if (shot.hitIds.has(m)) continue
          const r = num(p.radius, 4) + Math.max(8, num(m.w, 24) * 0.45)
          const dx = entityX(m) - p.x
          const dy = entityY(m) - p.y
          if (dx * dx + dy * dy > r * r) continue

          try {
            if (typeof m.takeDamage === 'function') m.takeDamage(shot.damage, p.x)
          } catch (e) {
            console.error('[weapons] projectile takeDamage failed', e)
          }
          // 防止引擎侧二次结算（如果以后 engine 也判定怪物命中）
          try {
            p.damage = 0
          } catch (e) {
            /* ignore */
          }
          shot.hitIds.add(m)
          if (!shot.pierce || !shot.p.damage) {
            if (!shot.pierce) {
              shot.done = true
              break
            }
          }
        }
      }

      if (shot.done || gone) {
        if (!shot.splashed) this._splash(shot)
        this._shots.splice(i, 1)
      }
    }
  }

  /** 命中结束时的小范围溅射（废料发射器之类），对怪物结算 */
  _splash(shot) {
    if (!shot || shot.splashed) return
    shot.splashed = true
    const radius = num(shot.splash, 0)
    if (radius <= 0) return
    const p = shot.p
    if (!p) return
    const list = this.game.director && Array.isArray(this.game.director.list) ? this.game.director.list : null
    if (list && list.length) {
      const dmg = Math.max(1, Math.round(shot.damage * 0.6))
      for (const m of list) {
        if (!isAlive(m)) continue
        // 直接命中的目标不再吃一次溅射，避免一发双倍
        if (shot.hitIds && shot.hitIds.has(m)) continue
        const dx = entityX(m) - p.x
        const dy = entityY(m) - p.y
        if (dx * dx + dy * dy > radius * radius) continue
        try {
          if (typeof m.takeDamage === 'function') m.takeDamage(dmg, p.x)
        } catch (e) {
          /* ignore */
        }
      }
    }
    try {
      this.game.particles && this.game.particles.emitMany('explosion', p.x, p.y, 8)
    } catch (e) {
      /* ignore */
    }
    try {
      if (typeof this.game.shake === 'function') this.game.shake(0.18)
    } catch (e) {
      /* ignore */
    }
  }

  // ===========================================================================
  // 状态
  // ===========================================================================

  /**
   * 写 G.weapon 并返回同一份快照。
   * 字段：{ id, name, class, ammo, ammoMax, reserve, ammoType, reloading,
   *         reloadProgress, cooldown, cooldownMax, compatible, reason, holding, damage }
   */
  state() {
    const def = this.weaponDef()
    const robot = this._robot()
    let compatible = false
    let reason = ''
    if (!def) {
      reason = '没有装备武器'
    } else {
      const check = this.canEquip(def.id)
      compatible = check.ok
      reason = check.ok ? '' : check.reason
    }
    if (def && !robot) {
      compatible = false
      reason = '没有可操作的机体'
    }
    const magSize = def ? Math.floor(num(def.magazine, 0)) : 0
    const rate = def ? num(def.rate, 0) : 0
    const progress = this.reloadTotal > 0 ? clamp(1 - this.reloadT / this.reloadTotal, 0, 1) : 1

    const out = {
      id: def ? def.id : null,
      name: def ? def.name : '空手',
      en: def ? def.en || '' : '',
      class: def ? def.class : null,
      damage: def ? num(def.damage, 0) : 0,
      ammo: def && magSize > 0 ? this.mag : 0,
      ammoMax: magSize,
      reserve: def ? this.ammoReserve(def.id) : 0,
      ammoType: def ? def.ammoType || null : null,
      reloading: !!this.reloading,
      reloadProgress: this.reloading ? progress : 1,
      cooldown: this.cooldown,
      cooldownMax: rate > 0 ? 1 / rate : 0,
      holding: !!this.holding,
      compatible,
      reason,
      reloadTime: this.reloadTotal,
      lastError: this.lastError,
      autoReason: this._autoReason,
    }
    try {
      G.weapon = out
    } catch (e) {
      /* 状态层不可写时静默（单测/无 DOM 环境） */
    }
    return out
  }

  /** 完全重置（新开局 / 换机体） */
  reset() {
    this._cancelReload(true)
    this.weaponId = null
    this.mag = 0
    this.cooldown = 0
    this.reloading = false
    this.reloadT = 0
    this.reloadTotal = 0
    this.holding = false
    this._shots.length = 0
    this.lastError = ''
    this._autoReason = ''
    this.lastFire = null
    this.state()
  }

  /** 调试用：当前在飞弹药数量 */
  get shotCount() {
    return this._shots.length
  }
}

/** 工厂函数 */
export function createWeaponSystem(game) {
  return new WeaponSystem(game)
}

export default WeaponSystem
