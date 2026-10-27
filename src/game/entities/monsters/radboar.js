import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 辐射野猪 —— 地面重装突击手（beast）。
 *
 * 行为循环：巡逻 → 察觉（低吼 + 黄圈提示）→ 蓄力 0.5s → 锁定方向高速冲锋 1.15s
 *          → 撞墙自晕 1.2s（唯一的稳定输出窗口）/ 冲过头后疲劳 0.6s → 回到追击。
 *
 * 可读性设计：
 *   · 蓄力期间脚下出现脉动的黄圈（RingGeometry，非贴图依赖），身体微微后坐；
 *   · 冲锋方向在蓄力结束的一瞬间锁定（不再跟踪），玩家侧步即可闪避；
 *   · 撞墙时大量尘土 + 屏幕震动 + 1.2s 眩晕，冲锋的代价非常明确。
 */

export const DEF = {
  id: 'radboar',
  name: '辐射野猪',
  en: 'RADBOAR',
  family: 'beast',
  hp: 60,
  speed: 70,
  damage: 22,
  size: [64, 42],
  aggro: 380,
  attackRange: 96,
  attackType: 'lunge',
  attackCooldown: 2.4,
  xp: 12,
  gravity: 2000,
  loot: [
    { id: 'scrap_plate', chance: 0.85, min: 1, max: 2 },
    { id: 'chemical', chance: 0.35 },
    { id: 'dog_food', chance: 0.4 },
    { id: 'cloth', chance: 0.3 },
  ],
  artId: 'radboar',
  sound: 'growl',
  biome: ['village', 'city'],
  desc: '背脊上长着结晶的野猪。它先刨地，再撞过来——刨地的声音比獠牙更该听。',
}

const WINDUP_T = 0.5 // 蓄力
const CHARGE_T = 1.15 // 冲锋最长时间
const CHARGE_SPEED = 268 // 受基类 ±280 限速保护
const CHARGE_RANGE = 300 // 进入这个距离开始蓄力
const STUN_T = 1.2 // 撞墙自晕
const RECOVER_T = 0.6 // 冲过头后的疲劳

export class Radboar extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.chargeDir = -1
    this.chargeElapsed = 0
    this.chargeHit = false
    this.pauseT = 0
    this.dustT = 0
    // 注意：tellMesh / tellMat 由 buildExtraVisual() 创建（super() 里已经跑过），
    // 这里不能重置成 null，否则前摇提示会永远不显示。
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 蓄力/眩晕提示环：贴在脚下，蓄力时脉动，眩晕时快速旋转
    const ringGeo = new THREE.RingGeometry(18, 26, 22, 1)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe5a33c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.tellMat = ringMat
    this.tellMesh = new THREE.Mesh(ringGeo, ringMat)
    this.tellMesh.visible = false
    this.tellMesh.renderOrder = 6
    this.group.add(this.tellMesh)

    // 獠牙：挂在贴图上，跟随 facing 一起翻面
    const tuskMat = new THREE.MeshBasicMaterial({ color: 0xd8cbb0, toneMapped: false })
    this.tuskGeo = new THREE.PlaneGeometry(14, 5)
    const tuskA = new THREE.Mesh(this.tuskGeo, tuskMat)
    tuskA.position.set(12, -8, 0.3)
    tuskA.rotation.z = 0.18
    this.mesh.add(tuskA)
    const tuskB = new THREE.Mesh(this.tuskGeo, tuskMat)
    tuskB.position.set(18, -13, 0.3)
    tuskB.rotation.z = -0.22
    this.mesh.add(tuskB)
  }

  // ------------------------------------------------------------------ 工具
  _state(name) {
    if (this.state === name) return
    this.state = name
    this.stateT = 0
  }

  _sfx(name, vol, rate) {
    this.game.sfx?.(name, { vol, rate })
  }

  _puff(n, color = 0x93a8b2, size = 1) {
    const parts = this.game.particles
    if (!parts || typeof parts.emit !== 'function') return
    for (let i = 0; i < n; i++) {
      parts.emit('dust', this.px + (Math.random() - 0.5) * this.w, this.body.y + this.body.h, {
        vx: (Math.random() - 0.5) * 140,
        vy: -Math.random() * 70,
        life: 0.3 + Math.random() * 0.35,
        size: size * (0.6 + Math.random() * 0.7),
        color,
      })
    }
  }

  _showTell(opacity, pulse = false) {
    if (!this.tellMat || !this.tellMesh) return
    this.tellMat.opacity = opacity
    this.tellMesh.visible = opacity > 0.02
    this.tellPulse = pulse
  }

  _overlapsPlayer() {
    const p = this.player
    if (!p || p.dead) return false
    const b = this.body
    const pb = p.body
    return b.x < pb.x + pb.w && b.x + b.w > pb.x && b.y < pb.y + pb.h && b.y + b.h > pb.y
  }

  _patrolStep(dt) {
    this.playAnim(Math.abs(this.body.vx) > 14 ? 'run' : 'idle')
    this.pauseT -= dt
    if (this.pauseT > 0) {
      this.vxTarget = 0
      return
    }
    if (this.wallAhead() || !this.groundAhead()) {
      this.facing *= -1
      this.pauseT = 0.3
    }
    this.vxTarget = this.facing * this.speed * 0.45
    if (Math.random() < dt * 0.22) this.pauseT = 0.7 + Math.random() * 1.6
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    // 提示环跟随脚下 + 淡出
    if (this.tellMat) {
      if (this.tellPulse) {
        this.tellMat.opacity = 0.35 + Math.sin(this.stateT * 32) * 0.3
      } else if (this.tellMat.opacity > 0) {
        this.tellMat.opacity = Math.max(0, this.tellMat.opacity - dt * 2.2)
      }
      if (this.tellMesh) {
        this.tellMesh.visible = this.tellMat.opacity > 0.02
        this.tellMesh.position.set(this.px, -(this.body.y + this.body.h) + 4, 3.1)
        this.tellMesh.rotation.z += dt * (this.stunT > 0 ? 6 : 1.4)
      }
    }

    const p = this.player
    if (!p || p.dead) {
      this._state('patrol')
      this._patrolStep(dt)
      return
    }

    // 眩晕：完全不行动 —— 玩家的输出窗口
    if (this.stunT > 0) {
      this._state('stunned')
      this.vxTarget = 0
      this.playAnim('hurt')
      this.dustT -= dt
      if (this.dustT <= 0) {
        this.dustT = 0.24
        this._puff(5, 0xd8cbb0, 0.8)
      }
      return
    }

    // 受击硬直：会打断蓄力（一次伤害换一次冲锋）
    if (this.hurtT > 0) {
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
        if (this.stateT > 0.3) this._state('chase')
        break
      }

      case 'chase': {
        this.facePlayer()
        this.playAnim('run')
        if (!sees && d > this.aggro * 1.5) {
          this._state('patrol')
          break
        }
        const dy = Math.abs(p.centerY - this.py)
        if (d < CHARGE_RANGE && dy < 130 && this.attackCd <= 0) {
          // 蓄力
          this._state('windup')
          this.vxTarget = 0
          this.playAnim('attack')
          this._showTell(0.5, true)
          this._sfx('growl', 0.5, 0.82)
          this._puff(10, 0xb7924f, 1.1)
          break
        }
        // 靠近但不到冲锋距离：稳步逼近，别顶着玩家
        if (d > this.attackRange + 20) {
          this.vxTarget = this.facing * this.speed
          if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
        } else {
          this.vxTarget = 0
        }
        break
      }

      case 'windup': {
        // 后坐蓄势：脚不动，身体往回蹭一点
        this.vxTarget = -this.facing * 14
        this.playAnim('attack')
        if (this.stateT >= WINDUP_T) {
          this.chargeDir = Math.abs(p.centerX - this.px) > 4 ? (p.centerX > this.px ? 1 : -1) : this.facing
          this.facing = this.chargeDir
          this.chargeHit = false
          this.chargeElapsed = 0
          this._state('charge')
          this._showTell(0.18, false)
          this.playAnim('run')
          this._sfx('growl', 0.62, 1.15)
          this._puff(14, 0xbfa06a, 1.2)
        }
        break
      }

      case 'charge': {
        this.chargeElapsed += dt
        this.vxTarget = this.chargeDir * CHARGE_SPEED
        this.playAnim('run')

        this.dustT -= dt
        if (this.dustT <= 0) {
          this.dustT = 0.07
          this._puff(2, 0xa8b6ba, 0.7)
        }

        // 撞墙 → 自晕
        if (this.body.wallDir !== 0) {
          this.stunT = STUN_T
          this.body.vx = -this.chargeDir * 40
          this._state('stunned')
          this.vxTarget = 0
          this._showTell(0.4, false)
          this._sfx('hurt', 0.6, 0.72)
          this._puff(20, 0xd8cbb0, 1.3)
          this.game.shake?.(0.35)
          break
        }

        // 冲锋命中：一次冲锋只结算一次
        if (!this.chargeHit && this._overlapsPlayer()) {
          this.chargeHit = true
          this.hitPlayer(this.damage)
          this._puff(10, 0x8d3a34, 1.1)
          this.game.shake?.(0.28)
        }

        if (this.chargeElapsed >= CHARGE_T) {
          this._state('recover')
          this.attackCd = this.def.attackCooldown ?? 2.4
        }
        break
      }

      case 'recover': {
        // 冲过头：喘气，慢慢转向玩家
        this.vxTarget = this.chargeDir * 18
        this.playAnim('idle')
        if (this.stateT > 0.25) this.facePlayer()
        if (this.stateT >= RECOVER_T) {
          this._state(sees ? 'chase' : 'patrol')
        }
        break
      }

      case 'stunned':
        // 眩晕结束时（stunT 分支不再拦截）回到追击/巡逻
        this.vxTarget = 0
        this.playAnim('idle')
        if (this.stateT > 0.2) this._state(sees ? 'chase' : 'patrol')
        break

      case 'patrol':
      default: {
        if (sees) {
          this._state('alert')
          this.facePlayer()
          this.vxTarget = 0
          this._showTell(0.28, false)
          this._sfx('growl', 0.42, 0.9)
          break
        }
        this._patrolStep(dt)
        break
      }
    }
  }

  // ------------------------------------------------------------------ 死亡
  die() {
    if (!this.tellMesh) return super.die()
    this.tellMesh.visible = false
    if (this.tellMat) this.tellMat.opacity = 0
    super.die()
  }
}

export const CLASS = Radboar
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
