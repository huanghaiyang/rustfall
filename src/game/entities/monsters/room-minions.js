import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'
import { ROOM_MINION_DEFS } from '../../world/rooms/index.js'
import { clamp } from '../../utils.js'

/**
 * 房间专属小怪（570 只）—— 数据在 world/rooms/*.js，本文件只负责「把数据变成能打的东西」。
 *
 * 设计目标：不给 570 只怪各写一套 AI，而是 6 种通用接敌模式 + 13 个通用招式，
 * 用 def.ai / def.moves 两个字段组合出不同的手感；美术仍由 BaseMonster 按 artId 加载。
 *
 * AI 模式（def.ai）：
 *   stalk   追到接触距离，近战（默认）
 *   skitter 快速乱窜：随机停顿、之字走位，撞墙/悬崖立刻反向
 *   orbit   保持舒适距离绕圈横移，进入射程就放远程招式
 *   hop     朝玩家弹跳突进，落地再跳；地面缺口也用短跳过去
 *   float   悬停飞行，飘向舒适距离并开火；高度基准贴着出生点缓慢起伏
 *   ambush  低伏不动，玩家进入触发半径才爆发冲刺；玩家跑远后重新伏击
 *   turret  基本原地不动，只转身朝向玩家，在射程内开火
 *
 * 招式表（def.moves，第 0 项为主招式，def.attackType 会被提到首位）：
 *   近战：claw 爪击 / peck 啄击 / lunge 突刺 / slam 踏地 AoE / tail 横扫 / charge 长冲刺 / burrow 潜地
 *   远程：spit 抛物线弹 / fan 扇形弹幕 / beam 直线预警光束 / ring 环身爆发
 *         spore 落脚延迟孢子 / web 地面减速网
 *
 * 攻击节奏：优先按距离选招（远远程、近近战），并且每第 2~3 次强制换第二招。
 * 所有可选引擎 API（spawnProjectile / damageArea / particles / sfx / shake / map 辅助）
 * 都做了存在性判断，缺失时退回本地弹道与本地判定，保证在裸环境里也不抛异常。
 */

const RANGE_TOL = 24
const NEAR_RANGE = 140

/** 招式参数表：windup 前摇秒数，dmg 是 this.damage 的倍率 */
const MOVE_TABLE = {
  claw: { kind: 'melee', windup: 0.14, reach: 44, vertical: 46, dmg: 1.0, facing: true },
  peck: { kind: 'melee', windup: 0.1, reach: 36, vertical: 40, dmg: 0.8, facing: true },
  lunge: { kind: 'melee', windup: 0.22, dash: 0.18, dashSpeed: 280, airSpeed: 460, dashRange: 150, dmg: 1.15 },
  slam: { kind: 'melee', windup: 0.42, radius: 78, dmg: 1.1 },
  tail: { kind: 'melee', windup: 0.18, reach: 66, vertical: 60, dmg: 0.95, facing: false },
  charge: { kind: 'melee', windup: 0.34, dash: 0.34, dashSpeed: 280, airSpeed: 520, dashRange: 220, dmg: 1.35 },
  burrow: { kind: 'melee', windup: 0.26, burrowT: 0.42, radius: 64, dmg: 1.2 },
  spit: { kind: 'ranged', windup: 0.34, dmg: 0.95, gravity: 820, speed: 260, color: 0xa8d64f },
  fan: { kind: 'ranged', windup: 0.4, dmg: 0.7, count: 4, gravity: 480, speed: 300, color: 0xffb45a },
  beam: { kind: 'ranged', windup: 0.55, dmg: 1.2, band: 30, color: 0x8fc4ff },
  ring: { kind: 'ranged', windup: 0.36, dmg: 1.0, radius: 112, color: 0xd28cff },
  spore: { kind: 'ranged', windup: 0.3, dmg: 1.05, delay: 0.55, radius: 64, color: 0xb07ad2 },
  web: { kind: 'ranged', windup: 0.28, dmg: 0.2, duration: 2.2, radius: 50, tickDmg: 2, color: 0xd6d6d6 },
}

/** 通用小怪基类：本文件内所有 570 个类都继承它 */
export class RoomMinion extends BaseMonster {
  constructor(game, def, x, y) {
    super(game, def, x, y)

    this.aiMode = def.ai || 'stalk'
    this.seed = Math.random() * Math.PI * 2

    // 招式序列：attackType 提到最前，未知招式一律丢弃
    const raw = Array.isArray(def.moves) ? def.moves.filter((m) => MOVE_TABLE[m]) : []
    if (MOVE_TABLE[def.attackType] && !raw.includes(def.attackType)) raw.unshift(def.attackType)
    if (MOVE_TABLE[def.attackType]) {
      this.moves = [def.attackType, ...raw.filter((m) => m !== def.attackType)]
    } else {
      this.moves = raw
    }
    if (!this.moves.length) this.moves = ['claw']
    this.primaryMove = this.moves[0]

    // 攻击状态机
    this.attackCount = 0
    this.pendingMove = null
    this.moveSpec = null
    this.windupT = 0
    this.recoverT = 0
    this.dashT = 0
    this.dashDir = -1
    this.dashHit = false
    this.dashSpeed = 0
    this.dashDmg = 0
    this.burrowT = 0
    this.burrowRadius = 0
    this.burrowDmg = 0
    this.evadeT = 0
    this.upHopCd = 0
    this.leapCd = 0
    this.hopDir = this.facing
    this.pauseT = 0
    this.strafeDir = Math.random() < 0.5 ? -1 : 1
    this.strafeT = 1.0 + Math.random() * 1.5

    // 舒适距离（orbit / float）
    this.preferredMin = Math.max(46, this.attackRange * 0.5)
    this.preferredMax = Math.max(this.preferredMin + 40, this.attackRange * 0.82)
    this.triggerR = Math.min(this.aggro, 250)

    // 伏击状态
    this.ambushArmed = true

    // 本地弹道 / 区域效果 / 预警
    this.shots = []
    this.spores = []
    this.patches = []
    this.fx = []
    this.tell = null
    this.beamAim = 0

    // 飞行悬停基准：贴在出生高度附近，随时间缓慢起伏
    this.homeX = this.body.x + this.w / 2
    this.homeTop = this.body.y
    this.hoverH = def.hover ?? (44 + this.h * 0.9)
    this.hoverBase = this.body.y - this.hoverH
    this.bobT = 0
    this.bobOff = 0
    this.bobPhase = Math.random() * 6.28
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 这些几何体由本文件的弹道/预警/特效复用；真正销毁交给 BaseMonster.dispose 的遍历
    this.shotGeo = new THREE.CircleGeometry(1, 8)
    this.circleGeo = new THREE.CircleGeometry(1, 20)
    this.ringGeo = new THREE.RingGeometry(0.72, 1, 22)
    this.planeGeo = new THREE.PlaneGeometry(1, 1)
  }

  // ------------------------------------------------------------------ 工具
  _mat(color, opacity = 0.9, additive = true) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    })
  }

  _sfx(name, vol = 0.25, rate = 1.2) {
    try {
      this.game.sfx?.(name, { vol, rate })
    } catch (e) {
      /* 缺失音频系统时忽略 */
    }
  }

  _puff(n, color = 0x93a8b2, size = 0.8, x = null, y = null) {
    const parts = this.game.particles
    if (!parts) return
    const px = x == null ? this.px : x
    const py = y == null ? this.py : y
    try {
      if (typeof parts.emit === 'function') {
        for (let i = 0; i < n; i++) {
          parts.emit('dust', px + (Math.random() - 0.5) * 18, py + (Math.random() - 0.5) * 12, {
            vx: (Math.random() - 0.5) * 90,
            vy: -Math.random() * 50,
            life: 0.22 + Math.random() * 0.25,
            size: Math.max(0.2, size * (0.5 + Math.random() * 0.6)),
            color,
          })
        }
      } else if (typeof parts.emitMany === 'function') {
        parts.emitMany('dust', px, py, n)
      }
    } catch (e) {
      /* 粒子系统不同实现，忽略 */
    }
  }

  _shake(v) {
    if (typeof this.game.shake !== 'function') return
    try {
      this.game.shake(v)
    } catch (e) {
      /* ignore */
    }
  }

  _hurtPlayer(dmg) {
    const p = this.player
    if (!p || p.dead || p.invuln > 0) return false
    if (typeof p.takeDamage !== 'function') return false
    this.hitPlayer(dmg)
    return true
  }

  _overlaps(extra = 4) {
    const p = this.player
    if (!p || p.dead || !p.body) return false
    const b = this.body
    const pb = p.body
    return (
      b.x < pb.x + pb.w + extra &&
      b.x + b.w > pb.x - extra &&
      b.y < pb.y + pb.h + extra &&
      b.y + b.h > pb.y - extra
    )
  }

  _shift(dx, dy) {
    const b = this.body
    const map = this.map
    let nx = b.x + dx
    let ny = b.y + dy
    if (map && typeof map.solidAt === 'function') {
      if (map.solidAt(nx + b.w / 2, b.y + b.h * 0.5)) nx = b.x
      if (map.solidAt(b.x + b.w / 2, ny + b.h * 0.5)) ny = b.y
    }
    b.x = nx
    b.y = ny
  }

  // ------------------------------------------------------------------ 更新主循环
  updateBehavior(dt) {
    this.evadeT = Math.max(0, this.evadeT - dt)
    this.upHopCd = Math.max(0, this.upHopCd - dt)
    this.leapCd = Math.max(0, this.leapCd - dt)
    this.bobT += dt * 1.7
    this.bobOff = Math.sin(this.bobT + this.bobPhase) * 5

    this._updateHazards(dt)

    // 潜地：不可选中、不可打断，浮出时再结算
    if (this.burrowT > 0) {
      this.burrowT -= dt
      this.vxTarget = 0
      this.body.vx = 0
      this.playAnim('idle')
      if (this.burrowT <= 0) this._surfaceFromBurrow()
      return
    }

    // 冲刺中：保持速度并逐帧检测接触
    if (this.dashT > 0) {
      this._updateDash(dt)
      return
    }

    // 受击打断前摇
    if (this.hurtT > 0) {
      if (this.windupT > 0) {
        this.windupT = 0
        this.pendingMove = null
        this.moveSpec = null
        this._clearTell()
      }
      this.vxTarget *= 0.25
      this.playAnim('hurt')
      return
    }

    if (this.windupT > 0) {
      this._updateWindup(dt)
      return
    }

    if (this.recoverT > 0) {
      this.recoverT -= dt
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }

    const p = this.player
    if (!p || p.dead) {
      this._wander(dt)
      return
    }

    this.strafeT -= dt
    if (this.strafeT <= 0) {
      this.strafeT = 1.0 + Math.random() * 1.6
      this.strafeDir *= -1
    }

    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)

    switch (this.aiMode) {
      case 'skitter':
        this._aiSkitter(dt, d, sees, p)
        break
      case 'orbit':
        this._aiOrbit(dt, d, sees, p)
        break
      case 'hop':
        this._aiHop(dt, d, sees, p)
        break
      case 'float':
        if (this.flying) this._aiFloat(dt, d, sees, p)
        else this._aiOrbit(dt, d, sees, p)
        break
      case 'ambush':
        this._aiAmbush(dt, d, sees, p)
        break
      case 'turret':
        this._aiTurret(dt, d, sees, p)
        break
      case 'stalk':
      default:
        this._aiStalk(dt, d, sees, p)
        break
    }
  }

  // ------------------------------------------------------------------ AI：深潜追猎
  _aiStalk(dt, d, sees, p) {
    if (!sees) {
      this._wander(dt)
      return
    }
    this.facePlayer()
    const reach = Math.max(this.attackRange, 52)
    if (d > reach * 0.9) {
      this._stepChase(p, dt, this.speed)
      this.playAnim('run')
      return
    }
    this.vxTarget = 0
    this.playAnim('idle')
    this._tryAttackNow(d)
  }

  // ------------------------------------------------------------------ AI：乱窜
  _aiSkitter(dt, d, sees, p) {
    if (!sees) {
      this._wander(dt)
      return
    }
    this.facePlayer()
    if (this.pauseT > 0) {
      this.pauseT -= dt
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    const zig = Math.sin(this.stateT * 8 + this.seed)
    if (this.flying) {
      this._airMoveTo(p.centerX + zig * 38, this._airTargetTop(p.centerY), this.speed * 1.05, dt)
    } else {
      const dir = this.facing
      if (this.wallAhead(dir) || !this.groundAhead(dir)) {
        this.facing = -dir
        this.pauseT = 0.12 + Math.random() * 0.2
        this.vxTarget = 0
      } else {
        this.vxTarget = this.facing * this.speed * (0.75 + Math.abs(zig) * 0.45)
      }
      this._maybeHopUp()
    }
    if (Math.random() < dt * 1.1) this.pauseT = 0.1 + Math.random() * 0.35
    this.playAnim(Math.abs(this.body.vx) > 12 ? 'run' : 'idle')
    if (d <= Math.max(this.attackRange, 46) + 8) this._tryAttackNow(d)
  }

  // ------------------------------------------------------------------ AI：绕圈
  _aiOrbit(dt, d, sees, p) {
    if (!sees) {
      this._wander(dt)
      return
    }
    this.facePlayer()
    const R = clamp(d, this.preferredMin, this.preferredMax)
    const wobble = Math.sin(this.stateT * 1.5 + this.seed) * 18
    const targetX = p.centerX + this.strafeDir * (R * 0.55) + wobble

    if (this.flying) {
      this._airMoveTo(targetX, this._airTargetTop(p.centerY), this.speed, dt)
    } else {
      let dir = targetX > this.px + 2 ? 1 : targetX < this.px - 2 ? -1 : this.facing
      if (d < this.preferredMin - 14) dir = p.centerX > this.px ? -1 : 1
      else if (d > this.preferredMax + 24) dir = p.centerX > this.px ? 1 : -1
      this._groundMove(dir, 1)
    }
    this.playAnim(Math.abs(this.body.vx) > 12 ? 'run' : 'idle')
    if (d <= this.attackRange + 10) this._tryAttackNow(d)
  }

  // ------------------------------------------------------------------ AI：弹跳
  _aiHop(dt, d, sees, p) {
    if (!sees) {
      this._wander(dt)
      return
    }
    this.facePlayer()

    if (this.flying) {
      const bounce = Math.sin(this.stateT * 3.6 + this.seed) * 26
      this._airMoveTo(p.centerX, this._airTargetTop(p.centerY - 20) + bounce, this.speed * 1.15, dt)
    } else if (this.body.onGround) {
      if (this.leapCd <= 0) {
        const dir = p.centerX >= this.px ? 1 : -1
        this.facing = dir
        this.hopDir = dir
        const g = this.gravity || 2000
        this.body.vy = -Math.sqrt(2 * g * (34 + Math.random() * 14))
        this.body.vx = dir * this.speed * 1.25
        this.vxTarget = dir * this.speed * 1.25
        this.leapCd = 0.36 + Math.random() * 0.28
        this._puff(3, 0x9aa8ad, 0.7, this.px, this.body.y + this.body.h)
        this._sfx('land', 0.14, 1.6)
      }
    } else {
      // 空中保持水平动量；缺口上也能滑过去
      this.vxTarget = this.hopDir * this.speed * 1.2
    }

    this.playAnim('run')
    if (d <= Math.max(this.attackRange, 52) + 6) this._tryAttackNow(d)
  }

  // ------------------------------------------------------------------ AI：悬浮
  _aiFloat(dt, d, sees, p) {
    if (!sees) {
      this._wander(dt)
      return
    }
    this.facePlayer()
    const R = clamp(d, this.preferredMin, this.preferredMax)
    const wobble = Math.sin(this.stateT * 1.2 + this.seed) * 24
    let tx = p.centerX + this.strafeDir * R * 0.75 + wobble
    if (d > this.preferredMax + 30) tx = p.centerX
    else if (d < this.preferredMin - 12) tx = this.px - (p.centerX >= this.px ? 1 : -1) * 70

    this._airMoveTo(tx, this._airTargetTop(p.centerY), this.speed, dt)
    this.playAnim('run')
    if (d <= this.attackRange + 10) this._tryAttackNow(d)
  }

  // ------------------------------------------------------------------ AI：伏击
  _aiAmbush(dt, d, sees, p) {
    if (this.ambushArmed) {
      // 低伏：不动，等玩家踩进触发半径
      this.vxTarget = 0
      if (this.flying) this._airMoveTo(this.homeX, this.hoverBase + this.bobOff, this.speed * 0.3, dt)
      this.playAnim('idle')
      if (sees && d <= this.triggerR) {
        this.ambushArmed = false
        this._puff(4, 0x8d3a34, 0.8)
        this._sfx('growl', 0.3, 0.85)
        this._tryAttackNow(d, this.moves.includes('charge') ? 'charge' : null)
      }
      return
    }

    if (d > this.aggro * 1.2) {
      this.ambushArmed = true
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }

    this.facePlayer()
    this._stepChase(p, dt, this.speed * 1.45)
    this.playAnim('run')
    this._tryAttackNow(d, this.moves.includes('charge') ? 'charge' : null)
  }

  // ------------------------------------------------------------------ AI：炮台
  _aiTurret(dt, d, sees, p) {
    this.vxTarget = 0
    this.facePlayer()
    if (this.flying) this._airMoveTo(this.homeX, this.hoverBase + this.bobOff, this.speed * 0.4, dt)
    this.playAnim('idle')
    if (d <= this.attackRange + 12 && sees) this._tryAttackNow(d)
  }

  // ------------------------------------------------------------------ AI 辅助
  _wander(dt) {
    if (this.flying) {
      const tx = this.homeX + Math.sin(this.stateT * 0.7 + this.seed) * 60
      this._airMoveTo(tx, this.hoverBase + this.bobOff * 1.6, this.speed * 0.32, dt)
      this.playAnim('run')
      return
    }
    if (this.pauseT > 0) {
      this.pauseT -= dt
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    if (this.wallAhead() || !this.groundAhead()) {
      this.facing *= -1
      this.pauseT = 0.15 + Math.random() * 0.3
      this.vxTarget = 0
    } else {
      this.vxTarget = this.facing * this.speed * 0.35
    }
    if (Math.random() < dt * 0.6) this.pauseT = 0.3 + Math.random() * 0.8
    this.playAnim('run')
  }

  _groundMove(dir, mul = 1) {
    if (!dir) {
      this.vxTarget = 0
      return false
    }
    this.facing = dir
    if (this.wallAhead(dir) || !this.groundAhead(dir)) {
      this.vxTarget = 0
      return false
    }
    this.vxTarget = dir * this.speed * mul
    return true
  }

  _stepChase(p, dt, speed) {
    if (this.flying) {
      this._airMoveTo(p.centerX, this._airTargetTop(p.centerY), speed, dt)
      return
    }
    const dir = p.centerX >= this.px ? 1 : -1
    this.facing = dir
    if (this.wallAhead(dir) || !this.groundAhead(dir)) {
      this.vxTarget = 0
    } else {
      this.vxTarget = dir * speed
    }
    this._maybeHopUp()
  }

  /** 玩家站高处时短跳一下（地面单位） */
  _maybeHopUp() {
    if (this.flying || !this.body.onGround || this.upHopCd > 0) return
    const p = this.player
    if (!p || p.dead) return
    if (p.centerY < this.py - 34 && this.distToPlayer() < 130) {
      const g = this.gravity || 2000
      this.body.vy = -Math.sqrt(2 * g * 50)
      this.upHopCd = 1.2
      this._puff(3, 0x9aa8ad, 0.6, this.px, this.body.y + this.body.h)
    }
  }

  /** 飞行体：目标高度贴合出生悬停基线，只允许小幅上下追玩家 */
  _airTargetTop(centerY) {
    const top = (centerY ?? this.py) - this.h / 2
    return clamp(top, this.hoverBase - 100, this.hoverBase + 70) + this.bobOff
  }

  /** 飞行体逐轴插值 + 瓦片避障（BaseMonster 对飞行体不跑 moveBody） */
  _airMoveTo(cx, topY, speed, dt) {
    const b = this.body
    const map = this.map
    const dx = cx - b.w / 2 - b.x
    const dy = topY - b.y
    const len = Math.hypot(dx, dy)
    this.vxTarget = 0
    if (len < 0.6) return

    const step = Math.min(len, Math.max(20, speed) * dt)
    let nx = b.x + (dx / len) * step
    let ny = b.y + (dy / len) * step
    if (map && typeof map.solidAt === 'function') {
      const cy = b.y + b.h * 0.5
      if (map.solidAt(nx + b.w / 2, cy)) nx = b.x
      const cxNow = nx + b.w / 2
      // 头顶 / 脚下顶住就原地保留 y，避免钻进实体
      if (map.solidAt(cxNow, ny + b.h * 0.5) || map.solidAt(cxNow, ny + 2)) ny = b.y
    }

    const roomW = this.game.room?.data?.worldW ?? this.game.roomW ?? 4000
    const roomH = this.game.room?.data?.worldH ?? this.game.roomH ?? 2000
    b.x = clamp(nx, 8, Math.max(16, roomW - b.w - 8))
    b.y = clamp(ny, 8, Math.max(16, roomH - b.h - 8))
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1
  }

  // ------------------------------------------------------------------ 出招
  _tryAttackNow(d, preferred = null) {
    if (this.attackCd > 0 || this.windupT > 0 || this.dashT > 0 || this.burrowT > 0) return false
    const p = this.player
    const sees = p ? this.hasLineOfSight(p.centerX, p.centerY) : false
    let id = null
    if (preferred && this.moves.includes(preferred) && this._moveUsable(preferred, d, sees)) id = preferred
    if (!id) id = this._pickMove(d, sees)
    if (!id) return false
    this._beginAttack(id)
    return true
  }

  _moveUsable(id, d, sees) {
    const sp = MOVE_TABLE[id]
    if (!sp) return false
    if (sp.kind === 'ranged') {
      if (!sees) return false
      return d <= this.attackRange + RANGE_TOL
    }
    const reach = Math.max(this.attackRange, sp.reach || 0, sp.radius || 0, sp.dashRange || 0)
    return d <= reach + (sp.dashRange ? 80 : 56)
  }

  /** 距离优先选招 + 每第 2~3 次强制换第二招 */
  _pickMove(d, sees) {
    const usable = this.moves.filter((id) => this._moveUsable(id, d, sees))
    if (!usable.length) return null
    this.attackCount++
    if (usable.length === 1) return usable[0]
    if (this.attackCount % 2 === 0 || this.attackCount % 3 === 0) return usable[1]

    const far = Math.max(NEAR_RANGE, this.attackRange * 0.6)
    const ranged = usable.find((id) => MOVE_TABLE[id].kind === 'ranged')
    const melee = usable.find((id) => MOVE_TABLE[id].kind === 'melee')
    if (d > far && ranged) return ranged
    if (d < far * 0.8 && melee) return melee
    return usable[0]
  }

  _beginAttack(id) {
    const sp = MOVE_TABLE[id]
    this.pendingMove = id
    this.moveSpec = sp
    this.windupT = sp.windup
    this.state = 'windup'
    this.stateT = 0
    this.vxTarget = 0
    this.facePlayer()
    this.playAnim('attack')
    this.attackCd = Math.max(0.3, this.def.attackCooldown ?? 1.6)
    this._beginTell(id)
    this._sfx(sp.kind === 'ranged' ? 'alarm' : 'growl', 0.24, 1.1 + Math.random() * 0.4)
  }

  _updateWindup(dt) {
    this.windupT -= dt
    this.vxTarget = 0
    this.playAnim('attack')
    this._updateTell(dt)
    if (this.windupT > 0) return
    this._executeMove()
  }

  _executeMove() {
    const id = this.pendingMove
    const sp = this.moveSpec || MOVE_TABLE[id]
    this.pendingMove = null
    this.moveSpec = null
    this.windupT = 0
    this._clearTell()
    if (!sp) {
      this.recoverT = 0.15
      return
    }

    switch (id) {
      case 'claw':
      case 'peck':
      case 'tail': {
        this._meleeStrike({
          reach: sp.reach,
          vertical: sp.vertical,
          mult: sp.dmg,
          facing: sp.facing !== false,
        })
        this._puff(3, 0xb7924f, 0.6, this.px + this.facing * 14, this.py)
        break
      }
      case 'slam': {
        this._slamAoe(sp)
        break
      }
      case 'lunge':
      case 'charge': {
        const p = this.player
        this.dashDir = p ? (p.centerX >= this.px ? 1 : -1) : this.facing
        this.facing = this.dashDir
        this.dashT = sp.dash
        this.dashSpeed = this.flying ? (sp.airSpeed || 480) : 280
        this.dashDmg = Math.max(1, Math.round(this.damage * sp.dmg))
        this.dashHit = false
        this.state = 'dash'
        this.stateT = 0
        this._puff(4, 0x9aa8ad, 0.8, this.px, this.body.y + this.body.h)
        this._sfx('growl', 0.3, 1.5)
        break
      }
      case 'burrow': {
        this._beginBurrow(sp)
        break
      }
      case 'spit': {
        this._fireAtPlayer(sp)
        break
      }
      case 'fan': {
        const count = clamp(sp.count || 4, 3, 5)
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 24
          this._fireAtPlayer(sp, off)
        }
        break
      }
      case 'beam': {
        this._executeBeam(sp)
        break
      }
      case 'ring': {
        this._executeRing(sp)
        break
      }
      case 'spore': {
        this._spawnSporeAtPlayer(sp)
        break
      }
      case 'web': {
        this._spawnWebAtPlayer(sp)
        break
      }
      default: {
        this._meleeStrike({ reach: Math.max(this.attackRange, 44), vertical: 50, mult: 1, facing: true })
        break
      }
    }

    // 冲刺 / 潜地会自己接管后续状态
    if (this.dashT <= 0 && this.burrowT <= 0) {
      this.state = 'recover'
      this.stateT = 0
      this.recoverT = sp.kind === 'ranged' ? 0.22 : 0.14
    }
  }

  // ------------------------------------------------------------------ 近战结算
  _meleeStrike(opts) {
    const p = this.player
    if (!p || p.dead) return false
    this.facePlayer()
    const dx = p.centerX - this.px
    if (opts.facing && Math.sign(dx) !== 0 && Math.sign(dx) !== this.facing) return false

    const dy = Math.abs(p.centerY - this.py)
    const pbw = p.body?.w ?? 24
    const pbh = p.body?.h ?? 42
    const reachX = opts.reach + pbw * 0.5 + 10
    const reachY = Math.max(opts.vertical ?? 44, (this.h + pbh) * 0.5 + 12)
    if (Math.abs(dx) > reachX || dy > reachY) return false

    const dmg = Math.max(1, Math.round(this.damage * (opts.mult ?? 1)))
    const ok = this._hurtPlayer(dmg)
    if (ok) {
      this._puff(4, 0x8d3a34, 0.8, p.centerX, p.centerY)
      this._shake(0.06)
    }
    return ok
  }

  _slamAoe(sp) {
    const x = this.px + this.facing * this.w * 0.35
    const y = this.body.y + this.body.h
    const dmg = Math.max(1, Math.round(this.damage * sp.dmg))

    let handled = false
    if (typeof this.game.damageArea === 'function') {
      try {
        this.game.damageArea(x, y, sp.radius, dmg)
        handled = true
      } catch (e) {
        handled = false
      }
    }
    if (!handled) {
      const p = this.player
      if (p && !p.dead) {
        const dx = p.centerX - x
        const dy = p.centerY - y
        if (Math.hypot(dx, dy) <= sp.radius + (p.body?.w ?? 24) * 0.3) this._hurtPlayer(dmg)
      }
    }
    this._puff(9, 0x9a8d7a, 1.1, x, y)
    this._sfx('land', 0.35, 0.9)
    this._shake(0.12)
  }

  // ------------------------------------------------------------------ 冲刺
  _updateDash(dt) {
    this.dashT -= dt
    this.playAnim('attack')
    if (this.flying) {
      this._shift(this.dashDir * this.dashSpeed * dt, 0)
    } else {
      this.vxTarget = this.dashDir * this.dashSpeed
    }

    if (!this.dashHit && this._overlaps(8)) {
      this.dashHit = true
      if (this._hurtPlayer(this.dashDmg)) {
        this._puff(5, 0x8d3a34, 0.9, this.px, this.py)
        this._shake(0.08)
      }
    }

    if (this.dashT <= 0) {
      this.dashT = 0
      this.dashHit = false
      this.state = 'recover'
      this.stateT = 0
      this.recoverT = 0.18
      this.vxTarget = 0
    }
  }

  // ------------------------------------------------------------------ 潜地
  _beginBurrow(sp) {
    this.evadeT = sp.burrowT + 0.2
    this.burrowT = sp.burrowT
    this.burrowRadius = sp.radius
    this.burrowDmg = Math.max(1, Math.round(this.damage * sp.dmg))
    this.mesh.visible = false
    this._puff(10, 0x7a6a55, 1, this.px, this.body.y + this.body.h)
    this._sfx('dig', 0.3, 0.9)
  }

  _surfaceFromBurrow() {
    this.mesh.visible = true
    const p = this.player
    const map = this.map

    if (p && !p.dead) {
      let tx = p.centerX - this.w / 2
      let ty = (p.body ? p.body.y + p.body.h : p.centerY + 20) - this.h
      if (this.flying) {
        ty = this._airTargetTop(p.centerY)
      } else if (map && typeof map.solidAt === 'function' && map.solidAt(p.centerX, ty + this.h * 0.5)) {
        // 落脚点被实体占住就留在原地浮出
        tx = this.body.x
        ty = this.body.y
      }
      this.body.x = tx
      this.body.y = ty
      this.body.vx = 0
      this.body.vy = 0
      if (this.distToPlayer() <= this.burrowRadius) this._hurtPlayer(this.burrowDmg)
    }

    this.state = 'recover'
    this.stateT = 0
    this.recoverT = 0.22
    this._puff(10, 0x7a6a55, 1, this.px, this.body.y + this.body.h)
    this._sfx('land', 0.3, 1.1)
    this._shake(0.08)
  }

  // ------------------------------------------------------------------ 远程结算
  _fireAtPlayer(sp, xOff = 0) {
    const p = this.player
    if (!p) return
    const sx = this.px + this.facing * (this.w * 0.35 + 6)
    const sy = this.py - this.h * 0.2
    const lead = 0.28
    const tx = p.centerX + (p.body?.vx ?? 0) * lead + xOff
    const ty = p.centerY
    const dmg = Math.max(1, Math.round(this.damage * (sp.dmg ?? 1)))
    const color = sp.color || 0xffb45a
    const radius = sp.radius || 5
    const gravity = sp.gravity ?? 800
    const dist = Math.hypot(tx - sx, ty - sy)
    const T = clamp(dist / (sp.speed || 260), 0.35, 1.2)
    const vx = (tx - sx) / T
    const vy = (ty - sy - 0.5 * gravity * T * T) / T

    const g = this.game
    if (typeof g.spawnProjectile === 'function') {
      try {
        const ok = g.spawnProjectile({ x: sx, y: sy, vx, vy, gravity, radius, damage: dmg, color, type: 'acid', source: this.id, life: 2.6, owner: this })
        if (ok) {
          this._puff(2, color, 0.6, sx, sy)
          return
        }
      } catch (e) {
        /* 引擎弹道不可用，走本地兜底 */
      }
    }
    this._spawnLocalShot(sx, sy, vx, vy, { gravity, radius, color, dmg })
    this._puff(3, color, 0.7, sx, sy)
    this._sfx('splash', 0.2, 1.4)
  }

  _spawnLocalShot(x, y, vx, vy, opts) {
    const mat = this._mat(opts.color, 0.95)
    const mesh = new THREE.Mesh(this.shotGeo, mat)
    mesh.renderOrder = 6
    const r = opts.radius || 5
    mesh.scale.set(r, r, 1)
    mesh.position.set(x, -y, 3.6)
    this.group.add(mesh)
    this.shots.push({ mesh, mat, x, y, vx, vy, gravity: opts.gravity ?? 800, t: 0, life: 3.2, r, dmg: opts.dmg ?? this.damage })
  }

  _updateShots(dt) {
    const map = this.map
    const p = this.player
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.t += dt
      s.vy += s.gravity * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.mesh.position.set(s.x, -s.y, 3.6)
      s.mesh.rotation.z += dt * 6

      let hit = false
      if (p && !p.dead) {
        const dx = p.centerX - s.x
        const dy = p.centerY - s.y
        const rr = s.r + 16
        if (dx * dx + dy * dy <= rr * rr) {
          this._hurtPlayer(s.dmg)
          hit = true
        }
      }
      if (!hit && map && typeof map.solidAt === 'function' && map.solidAt(s.x, s.y)) hit = true

      if (hit || s.t > s.life) {
        this._puff(4, 0x9a8d7a, 0.7, s.x, s.y)
        this._removeShot(i)
      }
    }
  }

  _removeShot(i) {
    const s = this.shots[i]
    if (!s) return
    this.group.remove(s.mesh)
    s.mat.dispose()
    this.shots.splice(i, 1)
  }

  _beamEnd(ang) {
    const map = this.map
    const maxLen = Math.min(520, Math.max(this.attackRange + 80, 180))
    let x = this.px + Math.cos(ang) * maxLen
    let y = this.py + Math.sin(ang) * maxLen
    if (map && typeof map.solidAt === 'function') {
      const step = 14
      const n = Math.ceil(maxLen / step)
      x = this.px
      y = this.py
      for (let i = 1; i <= n; i++) {
        const nx = this.px + Math.cos(ang) * step * i
        const ny = this.py + Math.sin(ang) * step * i
        if (map.solidAt(nx, ny)) break
        x = nx
        y = ny
      }
    }
    return { x, y }
  }

  _updateBeamTell() {
    const p = this.player
    if (!p || !this.tell || this.tell.type !== 'beam') return
    const ang = Math.atan2(p.centerY - this.py, p.centerX - this.px)
    this.beamAim = ang
    const end = this._beamEnd(ang)
    const sx = this.px
    const sy = this.py
    const len = Math.max(8, Math.hypot(end.x - sx, end.y - sy))
    const mesh = this.tell.mesh
    mesh.scale.set(len, MOVE_TABLE.beam.band * 0.8, 1)
    mesh.position.set((sx + end.x) * 0.5, -((sy + end.y) * 0.5), 5)
    mesh.rotation.z = Math.atan2(-(end.y - sy), end.x - sx)
  }

  _executeBeam(sp) {
    const ang = this.beamAim
    const end = this._beamEnd(ang)
    const len = Math.max(0, Math.hypot(end.x - this.px, end.y - this.py))
    const p = this.player

    if (p && !p.dead) {
      const dx = p.centerX - this.px
      const dy = p.centerY - this.py
      const along = dx * Math.cos(ang) + dy * Math.sin(ang)
      const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang))
      const pad = (p.body?.w ?? 24) * 0.35
      if (along >= 0 && along <= len + pad && perp <= sp.band * 0.5 + pad) {
        this._hurtPlayer(Math.max(1, Math.round(this.damage * sp.dmg)))
      }
    }

    const mat = this._mat(sp.color, 0.85)
    const mesh = new THREE.Mesh(this.planeGeo, mat)
    mesh.renderOrder = 7
    mesh.scale.set(Math.max(10, len), sp.band, 1)
    mesh.position.set(this.px + Math.cos(ang) * len * 0.5, -(this.py + Math.sin(ang) * len * 0.5), 6)
    mesh.rotation.z = Math.atan2(-Math.sin(ang), Math.cos(ang))
    this.group.add(mesh)
    this.fx.push({ mesh, mat, t: 0, life: 0.2, fade: true, opacity0: 0.85 })
    this._sfx('alarm', 0.3, 1.6)
  }

  _executeRing(sp) {
    const dmg = Math.max(1, Math.round(this.damage * sp.dmg))
    const p = this.player
    if (p && !p.dead) {
      const dx = p.centerX - this.px
      const dy = p.centerY - this.py
      const pad = (p.body?.h ?? 42) * 0.3
      if (Math.hypot(dx, dy) <= sp.radius + pad) this._hurtPlayer(dmg)
    }

    const mat = this._mat(sp.color, 0.55)
    const mesh = new THREE.Mesh(this.ringGeo, mat)
    mesh.renderOrder = 6
    mesh.position.set(this.px, -this.py, 4.5)
    mesh.scale.set(12, 12, 1)
    this.group.add(mesh)
    this.fx.push({ mesh, mat, t: 0, life: 0.34, grow: true, from: 12, to: sp.radius * 1.6, fade: true, opacity0: 0.55, squash: 0.6 })
    this._puff(8, sp.color, 0.9, this.px, this.py)
    this._sfx('thunder', 0.25, 1.5)
  }

  _groundYAt(x, y, maxDrop = 150) {
    const map = this.map
    if (map && typeof map.groundBelow === 'function') {
      const g = map.groundBelow(x, y - 6, maxDrop)
      if (g != null) return g
    }
    return y
  }

  _spawnSporeAtPlayer(sp) {
    const p = this.player
    if (!p) return
    const feet = p.body ? p.body.y + p.body.h : p.centerY + 20
    const x = p.centerX + (Math.random() - 0.5) * 16
    const y = this._groundYAt(x, feet, 120)
    const mat = this._mat(sp.color, 0.18)
    const mesh = new THREE.Mesh(this.circleGeo, mat)
    mesh.renderOrder = 3.2
    mesh.position.set(x, -y + 2, 3.1)
    mesh.scale.set(sp.radius * 0.35, sp.radius * 0.35, 1)
    this.group.add(mesh)
    this.spores.push({ x, y, t: 0, delay: sp.delay, r: sp.radius, dmg: Math.max(1, Math.round(this.damage * sp.dmg)), color: sp.color, mesh, mat })
    this._puff(3, sp.color, 0.6, x, y)
    this._sfx('splash', 0.18, 0.95)
  }

  _updateSpores(dt) {
    const p = this.player
    for (let i = this.spores.length - 1; i >= 0; i--) {
      const s = this.spores[i]
      s.t += dt
      const k = clamp(s.t / Math.max(0.05, s.delay), 0, 1)
      const sc = s.r * (0.35 + 0.65 * k)
      s.mesh.scale.set(sc, sc, 1)
      s.mat.opacity = 0.12 + k * 0.3
      if (s.t < s.delay) continue

      if (p && !p.dead) {
        const dx = p.centerX - s.x
        const dy = p.centerY - s.y
        if (dx * dx + dy * dy <= (s.r + 8) * (s.r + 8)) this._hurtPlayer(s.dmg)
      }
      this._puff(10, s.color, 1, s.x, s.y)
      this._sfx('splash', 0.22, 0.8)
      this.group.remove(s.mesh)
      s.mat.dispose()
      this.spores.splice(i, 1)
    }
  }

  _spawnWebAtPlayer(sp) {
    const p = this.player
    if (!p) return
    const feet = p.body ? p.body.y + p.body.h : p.centerY + 20
    const x = p.centerX
    const y = this._groundYAt(x, feet, 140)
    const mat = this._mat(sp.color, 0.32, false)
    const mesh = new THREE.Mesh(this.circleGeo, mat)
    mesh.renderOrder = 3.15
    mesh.position.set(x, -y + 2, 3.05)
    mesh.scale.set(sp.radius, sp.radius * 0.42, 1)
    this.group.add(mesh)
    this.patches.push({ x, y, t: sp.duration, tick: 0, r: sp.radius, dmg: sp.tickDmg, mesh, mat })
    this._puff(5, sp.color, 0.6, x, y)
    this._sfx('splash', 0.18, 0.7)
  }

  _updatePatches(dt) {
    const p = this.player
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const q = this.patches[i]
      q.t -= dt
      q.tick -= dt
      q.mat.opacity = 0.18 + Math.max(0, q.t / 2.2) * 0.2

      if (p && !p.dead && p.body) {
        const dx = p.centerX - q.x
        const dy = p.centerY - q.y
        if (dx * dx + dy * dy <= (q.r + 10) * (q.r + 10)) {
          // 没有全局减速接口，直接给水平速度做阻尼（只影响踩在网里的那一小会儿）
          p.body.vx *= Math.max(0, 1 - dt * 4)
          if (q.tick <= 0) {
            q.tick = 0.45
            this._hurtPlayer(q.dmg)
          }
        }
      }

      if (q.t <= 0) {
        this.group.remove(q.mesh)
        q.mat.dispose()
        this.patches.splice(i, 1)
      }
    }
  }

  // ------------------------------------------------------------------ 预警 / 特效
  _beginTell(id) {
    if (id === 'beam') {
      const mat = this._mat(MOVE_TABLE.beam.color, 0.22)
      const mesh = new THREE.Mesh(this.planeGeo, mat)
      mesh.renderOrder = 5
      this.group.add(mesh)
      this.tell = { type: 'beam', mesh, mat }
      this._updateBeamTell()
    } else if (id === 'slam') {
      const mat = this._mat(0xff8a5a, 0.18)
      const mesh = new THREE.Mesh(this.circleGeo, mat)
      mesh.renderOrder = 3.2
      mesh.position.set(this.px, -(this.body.y + this.body.h), 3.1)
      mesh.scale.set(20, 20, 1)
      this.group.add(mesh)
      this.tell = { type: 'slam', mesh, mat, radius: MOVE_TABLE.slam.radius }
    } else {
      this.tell = null
    }
  }

  _updateTell(dt) {
    if (!this.tell) return
    if (this.tell.type === 'beam') {
      this._updateBeamTell()
    } else if (this.tell.type === 'slam') {
      const total = Math.max(0.001, this.moveSpec?.windup || 0.4)
      const k = 1 - clamp(this.windupT / total, 0, 1)
      const s = this.tell.radius * (0.4 + 0.6 * k)
      this.tell.mesh.scale.set(s, s, 1)
      this.tell.mat.opacity = 0.16 + k * 0.22
      this.tell.mesh.position.set(this.px, -(this.body.y + this.body.h), 3.1)
    }
  }

  _clearTell() {
    if (!this.tell) return
    this.group.remove(this.tell.mesh)
    this.tell.mat.dispose()
    this.tell = null
  }

  _updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]
      f.t += dt
      const k = clamp(f.t / Math.max(0.01, f.life), 0, 1)
      if (f.grow) {
        const s = f.from + (f.to - f.from) * k
        f.mesh.scale.set(s, s * (f.squash ?? 1), 1)
      }
      if (f.fade) f.mat.opacity = (f.opacity0 ?? 0.6) * (1 - k)
      if (k >= 1) {
        this.group.remove(f.mesh)
        f.mat.dispose()
        this.fx.splice(i, 1)
      }
    }
  }

  // ------------------------------------------------------------------ 汇总
  _updateHazards(dt) {
    this._updateShots(dt)
    this._updateSpores(dt)
    this._updatePatches(dt)
    this._updateFx(dt)
  }

  _clearHazards() {
    this._clearTell()
    for (const s of this.shots) {
      this.group.remove(s.mesh)
      s.mat.dispose()
    }
    this.shots.length = 0
    for (const s of this.spores) {
      this.group.remove(s.mesh)
      s.mat.dispose()
    }
    this.spores.length = 0
    for (const q of this.patches) {
      this.group.remove(q.mesh)
      q.mat.dispose()
    }
    this.patches.length = 0
    for (const f of this.fx) {
      this.group.remove(f.mesh)
      f.mat.dispose()
    }
    this.fx.length = 0
  }

  // ------------------------------------------------------------------ 受击 / 死亡
  takeDamage(n, fromX = null) {
    // 潜地期间不可选中
    if (this.evadeT > 0) return
    super.takeDamage(n, fromX)
  }

  die() {
    this._clearHazards()
    this.mesh.visible = true
    super.die()
  }

  dispose() {
    this._clearHazards()
    super.dispose()
  }
}

// ==================================================================== 建类与注册
export const ROOM_MINION_CLASSES = {}
export const ROOM_MINION_IDS = []

for (const raw of Object.values(ROOM_MINION_DEFS)) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) continue
  // BaseMonster 用 def.artId || def.id 取图；房间数据没有 artId，这里补成 id 本身
  const def = raw.artId ? raw : { ...raw, artId: raw.id }

  const MinionClass = class extends RoomMinion {
    constructor(game, x, y) {
      super(game, def, x, y)
    }
  }

  ROOM_MINION_CLASSES[def.id] = MinionClass
  ROOM_MINION_IDS.push(def.id)
  Content.register(KIND.MONSTER, def.id, def, 'rooms')
}
