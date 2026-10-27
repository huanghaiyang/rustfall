import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'
import { G } from '../../state.js'

/**
 * 拾荒机器人 —— 近战抢劫者（rogue）。
 *
 * 它不只打你，还「拆」你：机械爪命中时额外抽走 5 点能量（优先走
 * player.drainEnergy，其次 player.energy，最后写 G.energy）。
 * 所以被它缠住会同时掉血和掉电，比同等伤害的野兽更该优先处理。
 *
 * 攻击前摇 0.3s：爪子抬起的扇形红光；命中瞬间火花四溅。
 *
 * 自毁：HP ≤ 30% 时进入 1.0s 引信（机身抖动 + 红圈急速脉动 + 蜂鸣），
 * 然后范围爆炸（半径 96 / 伤害 30）；如果它在引信完成前被打死，也会当场炸。
 */

export const DEF = {
  id: 'scrapper',
  name: '拾荒机器人',
  en: 'SCRAPPER',
  family: 'rogue',
  hp: 70,
  speed: 96,
  damage: 13,
  size: [40, 36],
  aggro: 340,
  attackRange: 58,
  attackType: 'melee',
  attackCooldown: 0.95,
  xp: 14,
  gravity: 2000,
  loot: [
    { id: 'scrap_plate', chance: 0.8, min: 1, max: 2 },
    { id: 'copper_wire', chance: 0.6 },
    { id: 'servo_motor', chance: 0.45 },
    { id: 'bearing', chance: 0.4 },
    { id: 'aluminum_sheet', chance: 0.35 },
    { id: 'repair_kit', chance: 0.1 },
  ],
  artId: 'scrapper',
  sound: 'hurt',
  biome: ['city', 'dump', 'factory'],
  desc: '它原本是拆废墟的。现在它把你算进了「废墟」。',
}

const CLAW_WIND = 0.3
const CLAW_RANGE = 70
const DRAIN = 5
const FUSE_T = 1.0
const FUSE_HP_RATIO = 0.3
const BOOM_RADIUS = 96
const BOOM_DAMAGE = 30

export class Scrapper extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.fuseArmed = false
    this.fuseT = 0
    this.exploded = false
    this.beepT = 0
    // clawMesh / fuseMesh 等由 buildExtraVisual() 创建（super() 内已执行），不要覆盖
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 爪子扇形前摇
    const clawMat = new THREE.MeshBasicMaterial({
      color: 0xe5a33c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.clawMat = clawMat
    this.clawMesh = new THREE.Mesh(new THREE.RingGeometry(16, 30, 12, 1, -0.65, 1.3), clawMat)
    this.clawMesh.renderOrder = 6
    this.clawMesh.visible = false
    this.group.add(this.clawMesh)

    // 自毁引信红圈
    const fuseMat = new THREE.MeshBasicMaterial({
      color: 0xc2553f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.fuseMat = fuseMat
    this.fuseMesh = new THREE.Mesh(new THREE.RingGeometry(20, 26, 18, 1), fuseMat)
    this.fuseMesh.renderOrder = 6
    this.fuseMesh.visible = false
    this.group.add(this.fuseMesh)

    // 机械爪（挂在贴图上，随 facing 翻面）
    const clawGeo = new THREE.PlaneGeometry(12, 4)
    const clawSteel = new THREE.MeshBasicMaterial({ color: 0x8f9aa0, toneMapped: false })
    this.gearMesh = new THREE.Mesh(clawGeo, clawSteel)
    this.gearMesh.position.set(15, -6, 0.3)
    this.mesh.add(this.gearMesh)
  }

  // ------------------------------------------------------------------ 工具
  _sfx(name, vol, rate) {
    const opts = vol && typeof vol === 'object' ? vol : { vol, rate }
    this.game.sfx?.(name, opts)
  }

  _spark(color = 0xe5a33c, n = 8) {
    const parts = this.game.particles
    if (!parts || typeof parts.emit !== 'function') return
    for (let i = 0; i < n; i++) {
      parts.emit('spark', this.px + (Math.random() - 0.5) * this.w, this.py + (Math.random() - 0.5) * this.h, {
        vx: (Math.random() - 0.5) * 240,
        vy: (Math.random() - 0.5) * 240,
        life: 0.18 + Math.random() * 0.28,
        size: 0.5 + Math.random() * 0.7,
        color,
      })
    }
  }

  /** 抽玩家能量：三级兜底 */
  _drainEnergy(n) {
    const p = this.player
    let drained = false
    if (p) {
      if (typeof p.drainEnergy === 'function') {
        p.drainEnergy(n)
        drained = true
      } else if (typeof p.energy === 'number') {
        p.energy = Math.max(0, p.energy - n)
        drained = true
      }
    }
    if (!drained && G && typeof G.energy === 'number') {
      G.energy = Math.max(0, G.energy - n)
    }
    this._spark(0x9fd3e0, 5)
  }

  /** 范围伤害：优先 game.damageArea，否则用玩家距离判定 */
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

  _armFuse() {
    if (this.fuseArmed || this.exploded) return
    this.fuseArmed = true
    this.fuseT = 0
    this.beepT = 0
    this.state = 'fuse'
    this.stateT = 0
    this.vxTarget = 0
    this.playAnim('attack')
    this._sfx('hurt', 0.4, 0.6)
    this._spark(0xc2553f, 8)
  }

  _explode(scale = 1) {
    if (this.exploded) return
    this.exploded = true
    const radius = BOOM_RADIUS * scale
    const dmg = BOOM_DAMAGE * scale
    this._aoe(this.px, this.py, radius, dmg)
    this._spark(0xffd0b0, 26)
    const parts = this.game.particles
    if (parts && typeof parts.emit === 'function') {
      for (let i = 0; i < 16; i++) {
        parts.emit('dust', this.px + (Math.random() - 0.5) * radius, this.py + (Math.random() - 0.5) * 40, {
          vx: (Math.random() - 0.5) * 320,
          vy: -Math.random() * 180,
          life: 0.4 + Math.random() * 0.5,
          size: 1.2 + Math.random(),
          color: 0x6b5f55,
        })
      }
    }
    this.game.shake?.(0.55)
    this._sfx('thunder', 0.42, 1.35)
    if (this.fuseMesh) this.fuseMesh.visible = false
    if (this.fuseMat) this.fuseMat.opacity = 0
    if (this.clawMesh) this.clawMesh.visible = false
    if (this.clawMat) this.clawMat.opacity = 0
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    // 引信：1s 预警，抖动加速
    if (this.fuseArmed) {
      this.fuseT += dt
      const k = Math.min(1, this.fuseT / FUSE_T)
      this.vxTarget = Math.sin(this.fuseT * 60) * 40
      this.playAnim('attack')
      if (this.fuseMesh) {
        this.fuseMesh.visible = true
        this.fuseMesh.position.set(this.px, -(this.body.y + this.body.h / 2), 3.3)
        this.fuseMesh.scale.setScalar(0.8 + k * 0.9)
        this.fuseMesh.rotation.z += dt * (6 + k * 20)
      }
      if (this.fuseMat) this.fuseMat.opacity = 0.35 + Math.sin(this.fuseT * (10 + k * 26)) * 0.3

      this.beepT -= dt
      if (this.beepT <= 0) {
        this.beepT = 0.18 - k * 0.1
        this._sfx('hurt', 0.18, 1.9 + k)
      }
      if (this.fuseT >= FUSE_T) {
        this._explode(1)
        this.hp = 0
        this.die()
      }
      return
    }

    // 低血自动布雷
    if (!this.exploded && this.hp / this.maxHp <= FUSE_HP_RATIO) {
      this._armFuse()
      return
    }

    const p = this.player
    if (!p || p.dead) {
      this.state = 'idle'
      this.vxTarget = 0
      this.playAnim('idle')
      this._hideTelegraph()
      return
    }
    if (this.hurtT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      this._hideTelegraph()
      return
    }

    // 爪子前摇
    if (this.state === 'clawWind') {
      this.vxTarget = 0
      this.playAnim('attack')
      const face = this.facing
      if (this.clawMesh) {
        this.clawMesh.visible = true
        this.clawMesh.position.set(this.px + face * 16, -(this.body.y + this.body.h * 0.55), 3.3)
        this.clawMesh.rotation.z = face === 1 ? 0 : Math.PI
      }
      if (this.clawMat) this.clawMat.opacity = 0.3 + Math.sin(this.stateT * 30) * 0.25
      if (this.stateT >= CLAW_WIND) {
        this.state = 'idle'
        this.stateT = 0
        this.attackCd = this.def.attackCooldown ?? 0.95
        this._claw()
      }
      return
    }
    this._hideTelegraph()

    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)

    if (!sees) {
      this.state = 'idle'
      this.playAnim(Math.abs(this.body.vx) > 14 ? 'run' : 'idle')
      if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      this.vxTarget = this.facing * this.speed * 0.45
      return
    }

    this.state = 'chase'
    this.facePlayer()

    if (d <= this.attackRange && this.attackCd <= 0 && Math.abs(p.centerY - this.py) < 60) {
      this.state = 'clawWind'
      this.stateT = 0
      this.vxTarget = 0
      this.playAnim('attack')
      this._sfx('hurt', 0.2, 1.45)
      return
    }

    this.vxTarget = this.facing * this.speed
    if (this.wallAhead() || !this.groundAhead()) {
      this.vxTarget = 0
      // 被墙挡住：贴着墙等人下来，别原地抖
      if (this.body.onGround && this.attackCd <= 0.2) this.facing *= -1
    }
    this.playAnim('run')
  }

  _hideTelegraph() {
    if (this.clawMesh && this.clawMesh.visible) this.clawMesh.visible = false
    if (this.clawMat) this.clawMat.opacity = 0
  }

  _claw() {
    const p = this.player
    if (!p || p.dead) return
    const d = this.distToPlayer()
    this.playAnim('attack')
    this._spark(0xe5a33c, 12)
    this._sfx('hurt', 0.3, 1.1)
    if (d <= CLAW_RANGE && Math.abs(p.centerY - this.py) < 70) {
      this.hitPlayer(this.damage)
      this._drainEnergy(DRAIN)
      this.game.shake?.(0.12)
    }
  }

  // ------------------------------------------------------------------ 死亡
  die() {
    if (!this.exploded) this._explode(0.75)
    super.die()
  }
}

export const CLASS = Scrapper
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
