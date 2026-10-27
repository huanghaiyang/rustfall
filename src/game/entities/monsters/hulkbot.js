import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 重装残骸 —— 精英（rogue）。
 *
 * 两段式威胁：
 *   1) 冲锋：0.6s 蓄力（机身下压 + 头顶红光 + 蒸汽）→ 1.25s 直线冲撞；
 *      撞墙会失去平衡 0.9s，这是它最大的破绽。
 *   2) 震地：玩家贴近（<170px）时主动起跳，落地冲击波半径 170 / 伤害 22，
 *      两侧同时判定，不存在「站背后就安全」。
 *
 * 护甲：正面（facing 一侧）所有伤害 ×0.5，背面正常 —— 绕背是唯一的输出方式。
 * 死亡必掉稀有物（reactor_core 100%）。
 */

export const DEF = {
  id: 'hulkbot',
  name: '重装残骸',
  en: 'HULKBOT',
  family: 'rogue',
  hp: 260,
  speed: 52,
  damage: 30,
  size: [88, 84],
  aggro: 480,
  attackRange: 120,
  attackType: 'charge',
  attackCooldown: 3.2,
  xp: 60,
  gravity: 2000,
  elite: true,
  loot: [
    { id: 'reactor_core', chance: 1 },
    { id: 'hydraulic_rod', chance: 0.9 },
    { id: 'aluminum_sheet', chance: 0.8, min: 2, max: 3 },
    { id: 'servo_motor', chance: 0.7 },
    { id: 'battery_cell', chance: 0.6, min: 1, max: 2 },
    { id: 'rare_earth', chance: 0.5 },
  ],
  artId: 'hulkbot',
  sound: 'thunder',
  biome: ['factory', 'city'],
  desc: '一台没电的工程机，靠腐烂的液压油站起来。它转身很慢——这是它唯一的仁慈。',
}

const WINDUP_T = 0.6
const CHARGE_T = 1.25
const CHARGE_SPEED = 245
const CHARGE_RANGE = 280
const STAGGER_T = 0.9
const RECOVER_T = 0.6
const SLAM_WIND = 0.45
const SLAM_JUMP = -560
const SLAM_RADIUS = 170
const SLAM_DAMAGE = 22
const SLAM_TRIGGER = 170
const ARMOR_FRONT = 0.5

export class Hulkbot extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.chargeDir = -1
    this.chargeElapsed = 0
    this.chargeHit = false
    this.stepT = 0
    this.pauseT = 0
    this.waves = []
    this.slamCd = 2
    // tellMesh / tellMat 由 buildExtraVisual() 创建（super() 内已执行），不要覆盖
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 头顶警示灯 + 蓄力环
    const tellMat = new THREE.MeshBasicMaterial({
      color: 0xc2553f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.tellMat = tellMat
    this.tellMesh = new THREE.Mesh(new THREE.RingGeometry(30, 42, 24, 1), tellMat)
    this.tellMesh.renderOrder = 6
    this.tellMesh.visible = false
    this.group.add(this.tellMesh)

    // 装甲板（挂在贴图上，随 facing 翻面）
    const plateMat = new THREE.MeshBasicMaterial({ color: 0x6b7a80, toneMapped: false })
    this.plateMat = plateMat
    this.plateGeo = new THREE.PlaneGeometry(34, 12)
    const plate = new THREE.Mesh(this.plateGeo, plateMat)
    plate.position.set(20, -2, 0.3)
    plate.rotation.z = 0.08
    this.mesh.add(plate)

    // 喷气口：蓄力时喷白汽
    this.ventMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 24),
      new THREE.MeshBasicMaterial({
        color: 0xd8cbb0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.ventMesh.position.set(-26, 6, 0.3)
    this.mesh.add(this.ventMesh)
  }

  // ------------------------------------------------------------------ 工具
  _sfx(name, vol, rate) {
    const opts = vol && typeof vol === 'object' ? vol : { vol, rate }
    this.game.sfx?.(name, opts)
  }

  _puff(n, color = 0x93a8b2, size = 1) {
    const parts = this.game.particles
    if (!parts || typeof parts.emit !== 'function') return
    for (let i = 0; i < n; i++) {
      parts.emit('dust', this.px + (Math.random() - 0.5) * this.w, this.body.y + this.body.h, {
        vx: (Math.random() - 0.5) * 200,
        vy: -Math.random() * 90,
        life: 0.35 + Math.random() * 0.4,
        size: size * (0.8 + Math.random() * 0.9),
        color,
      })
    }
  }

  _aoe(x, y, radius, dmg) {
    let handled = false
    const g = this.game
    if (typeof g.damageArea === 'function') {
      try {
        g.damageArea(x, y, radius, dmg)
        handled = true
      } catch (err) {
        handled = false
      }
    }
    if (!handled) {
      const p = this.player
      if (p && !p.dead && !(p.invuln > 0)) {
        const dx = p.centerX - x
        const dy = p.centerY - y
        if (dx * dx + dy * dy <= radius * radius) {
          if (typeof p.takeDamage === 'function') p.takeDamage(dmg, x)
        }
      }
    }
  }

  _overlapsPlayer() {
    const p = this.player
    if (!p || p.dead) return false
    const b = this.body
    const pb = p.body
    return b.x < pb.x + pb.w && b.x + b.w > pb.x && b.y < pb.y + pb.h && b.y + b.h > pb.y
  }

  _enter(name) {
    if (this.state === name) return
    this.state = name
    this.stateT = 0
  }

  _showTell(opacity) {
    if (!this.tellMat) return
    this.tellMat.opacity = opacity
    this.tellMesh.visible = opacity > 0.02
  }

  /** 震地冲击波：一圈迅速扩散的环 */
  _shockwave(x, y) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe5a33c,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(SLAM_RADIUS - 10, SLAM_RADIUS, 28, 1), mat)
    mesh.position.set(x, -y + 3, 3.2)
    mesh.scale.set(0.12, 0.12, 1)
    this.group.add(mesh)
    this.waves.push({ mesh, mat, t: 0 })
    this._aoe(x, y, SLAM_RADIUS, SLAM_DAMAGE)
    this._puff(22, 0x6b5f55, 1.4)
    this.game.shake?.(0.6)
    this._sfx('thunder', 0.55, 0.9)
  }

  _updateWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      w.t += dt
      const k = Math.min(1, w.t / 0.4)
      w.mesh.scale.set(0.12 + k * 0.88, 0.12 + k * 0.88, 1)
      w.mat.opacity = 0.75 * (1 - k)
      if (w.t >= 0.42) {
        this.group.remove(w.mesh)
        w.mesh.geometry.dispose()
        w.mat.dispose()
        this.waves.splice(i, 1)
      }
    }
  }

  _patrolStep(dt) {
    this.playAnim(Math.abs(this.body.vx) > 12 ? 'run' : 'idle')
    this.pauseT -= dt
    if (this.pauseT > 0) {
      this.vxTarget = 0
      return
    }
    if (this.wallAhead() || !this.groundAhead()) {
      this.facing *= -1
      this.pauseT = 0.6
    }
    this.vxTarget = this.facing * this.speed * 0.6
    // 沉重的脚步
    this.stepT -= dt
    if (this.stepT <= 0 && this.body.onGround) {
      this.stepT = 0.85
      this._puff(3, 0x93a8b2, 0.8)
      this._sfx('land', 0.16, 0.7)
      this.game.shake?.(0.06)
    }
    if (Math.random() < dt * 0.18) this.pauseT = 0.8 + Math.random() * 1.2
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this.slamCd = Math.max(0, this.slamCd - dt)
    this._updateWaves(dt)

    if (this.tellMat) {
      if (this.tellMat.opacity > 0) {
        this.tellMat.opacity = Math.max(0, this.tellMat.opacity - dt * 1.6)
        if (this.tellMesh.visible) {
          this.tellMesh.position.set(this.px, -(this.body.y + this.body.h) + 6, 3.1)
        }
        if (this.tellMat.opacity <= 0.02) this.tellMesh.visible = false
      }
    }
    if (this.ventMesh) {
      this.ventMesh.material.opacity = Math.max(0, this.ventMesh.material.opacity - dt * 2)
    }

    const p = this.player
    if (!p || p.dead) {
      this._enter('patrol')
      this._patrolStep(dt)
      return
    }

    // 冲撞撞墙后的失衡：完全静止，是主要输出窗口
    if (this.stunT > 0) {
      this._enter('stagger')
      this.vxTarget = 0
      this.playAnim('hurt')
      this._puff(1, 0x6b5f55, 0.8)
      return
    }
    if (this.hurtT > 0 && this.state !== 'charge') {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }

    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)

    switch (this.state) {
      case 'alert': {
        this.vxTarget = 0
        this.facePlayer()
        this.playAnim('idle')
        this._puff(4, 0xd8cbb0, 0.9)
        if (this.stateT > 0.35) this._enter('stalk')
        break
      }

      case 'stalk': {
        this.facePlayer()
        this.playAnim('run')
        const dy = Math.abs(p.centerY - this.py)
        if (d < SLAM_TRIGGER && this.slamCd <= 0 && dy < 40) {
          this._enter('slamWind')
          this.vxTarget = 0
          this.playAnim('attack')
          this._showTell(0.6)
          this._sfx('growl', 0.4, 0.7)
          break
        }
        if (d < CHARGE_RANGE && this.attackCd <= 0 && dy < 120) {
          this._enter('windup')
          this.vxTarget = 0
          this.playAnim('attack')
          this._showTell(0.55)
          this._sfx('growl', 0.55, 0.6)
          this._puff(8, 0xd8cbb0, 1.2)
          if (this.ventMesh) this.ventMesh.material.opacity = 0.7
          break
        }
        this.vxTarget = d > this.attackRange ? this.facing * this.speed : 0
        if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
        this.stepT -= dt
        if (this.stepT <= 0 && Math.abs(this.vxTarget) > 1) {
          this.stepT = 0.7
          this._puff(3, 0x93a8b2, 0.9)
          this._sfx('land', 0.18, 0.68)
          this.game.shake?.(0.07)
        }
        if (!sees) this._enter('patrol')
        break
      }

      case 'windup': {
        this.vxTarget = -this.facing * 16
        this.playAnim('attack')
        if (this.ventMesh) this.ventMesh.material.opacity = 0.5
        if (this.stateT >= WINDUP_T) {
          this.chargeDir = Math.abs(p.centerX - this.px) > 6 ? (p.centerX > this.px ? 1 : -1) : this.facing
          this.facing = this.chargeDir
          this.chargeHit = false
          this.chargeElapsed = 0
          this._enter('charge')
          this._showTell(0.15)
          this._sfx('growl', 0.6, 0.9)
          this._puff(12, 0xbfa06a, 1.2)
        }
        break
      }

      case 'charge': {
        this.chargeElapsed += dt
        this.vxTarget = this.chargeDir * CHARGE_SPEED
        this.playAnim('run')
        this.stepT -= dt
        if (this.stepT <= 0) {
          this.stepT = 0.16
          this._puff(3, 0x93a8b2, 0.9)
          this.game.shake?.(0.08)
        }

        if (this.body.wallDir !== 0) {
          this.stunT = STAGGER_T
          this.body.vx = -this.chargeDir * 30
          this._enter('stagger')
          this.vxTarget = 0
          this._puff(20, 0xd8cbb0, 1.4)
          this._sfx('thunder', 0.4, 1.2)
          this.game.shake?.(0.45)
          break
        }
        if (!this.chargeHit && this._overlapsPlayer()) {
          this.chargeHit = true
          this.hitPlayer(this.damage)
          this._puff(10, 0x8d3a34, 1.2)
          this.game.shake?.(0.35)
        }
        if (this.chargeElapsed >= CHARGE_T) {
          this._enter('recover')
          this.attackCd = this.def.attackCooldown ?? 3.2
        }
        break
      }

      case 'stagger': {
        this.vxTarget = 0
        this.playAnim('hurt')
        if (this.stateT > 0.25) this.facePlayer()
        if (this.stateT >= STAGGER_T) this._enter(sees ? 'stalk' : 'patrol')
        break
      }

      case 'slamWind': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.tellMat) this.tellMat.opacity = 0.4 + Math.sin(this.stateT * 28) * 0.3
        if (this.stateT >= SLAM_WIND) {
          this.body.vy = SLAM_JUMP
          this.body.vx = this.facing * 90
          this._enter('slamAir')
          this._showTell(0)
          this._puff(14, 0x93a8b2, 1.3)
          this._sfx('growl', 0.4, 0.55)
        }
        break
      }

      case 'slamAir': {
        this.playAnim('run')
        // 空中轻微朝玩家修正
        if (this.stateT < 0.3) this.body.vx += Math.sign(p.centerX - this.px) * 220 * dt
        if (this.stateT > 0.15 && this.body.onGround) {
          this._enter('slamImpact')
          this._shockwave(this.px, this.body.y + this.body.h)
          this.slamCd = 4.5 + Math.random() * 2
        }
        break
      }

      case 'slamImpact': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= 0.35) {
          this.attackCd = Math.max(this.attackCd, 1.4)
          this._enter('recover')
        }
        break
      }

      case 'recover': {
        this.vxTarget = this.chargeDir * 12
        this.playAnim('idle')
        if (this.stateT >= RECOVER_T) this._enter(sees ? 'stalk' : 'patrol')
        break
      }

      case 'patrol':
      default: {
        if (sees) {
          this._enter('alert')
          this.facePlayer()
          this.vxTarget = 0
          this._sfx('growl', 0.45, 0.55)
          this._showTell(0.22)
          break
        }
        this._patrolStep(dt)
        break
      }
    }
  }

  // ------------------------------------------------------------------ 护甲
  takeDamage(n, fromX = null) {
    if (!this.alive) return
    let dmg = n
    if (fromX != null) {
      const inFront = (fromX - this.px) * this.facing > 0
      if (inFront) {
        dmg = n * ARMOR_FRONT
        // 正面命中：火花四溅，提示「这样打不痛」
        const parts = this.game.particles
        if (parts && typeof parts.emit === 'function') {
          for (let i = 0; i < 6; i++) {
            parts.emit('spark', this.px + this.facing * this.w * 0.4, this.py, {
              vx: -this.facing * (60 + Math.random() * 160),
              vy: (Math.random() - 0.5) * 160,
              life: 0.2,
              size: 0.5,
              color: 0x9fd3e0,
            })
          }
        }
      }
    }
    const x0 = this.body.x
    super.takeDamage(dmg, fromX)
    // 重装：击退大幅削弱
    this.body.vx *= 0.25
    this.body.x = x0 + (this.body.x - x0) * 0.25
  }

  die() {
    // 冲击波不要留在场上（基类 dead 分支不再跑 updateBehavior）
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.group.remove(this.waves[i].mesh)
      this.waves[i].mesh.geometry.dispose()
      this.waves[i].mat.dispose()
    }
    this.waves.length = 0
    if (this.tellMesh) this.tellMesh.visible = false
    if (this.tellMat) this.tellMat.opacity = 0
    super.die()
  }

  dispose() {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.group.remove(this.waves[i].mesh)
      this.waves[i].mesh.geometry.dispose()
      this.waves[i].mat.dispose()
    }
    this.waves.length = 0
    super.dispose()
  }
}

export const CLASS = Hulkbot
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
