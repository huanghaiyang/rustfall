import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 失控哨兵 —— 固定炮塔（rogue）。
 *
 * 它最危险的地方是「看见你之前」：炮口会缓慢左右扫描（±0.5rad 的扇面），
 * 只有扇形视野 + 视线通畅才会锁定。锁定后 0.7s 会拉出一条红色瞄准线，
 * 这条线就是它给你的全部警告——线不动的时候别待在线上。
 *
 * 属性：护盾让所有伤害 ×0.6；背面（facing 反方向）命中 ×1.5 且不吃护盾减免，
 * 所以趁它扫向另一边时绕后拆掉它，比正面硬拼划算得多。
 */

export const DEF = {
  id: 'sentry',
  name: '失控哨兵',
  en: 'SENTRY',
  family: 'rogue',
  hp: 90,
  speed: 0,
  damage: 16,
  size: [46, 40],
  aggro: 430,
  attackRange: 460,
  attackType: 'laser',
  attackCooldown: 2.2,
  xp: 16,
  gravity: 2000,
  loot: [
    { id: 'scrap_plate', chance: 0.7, min: 1, max: 2 },
    { id: 'servo_motor', chance: 0.5 },
    { id: 'sensor_unit', chance: 0.45 },
    { id: 'battery_cell', chance: 0.35 },
    { id: 'board_cpu', chance: 0.25 },
    { id: 'aluminum_sheet', chance: 0.4 },
  ],
  artId: 'sentry',
  sound: 'hurt',
  biome: ['city', 'factory'],
  desc: '它还记着自己的巡逻扇区。扇区里一切会动的东西，都算入侵者。',
}

const FAN_HALF = 0.62 // 扇形视野半角（弧度）
const LOCK_T = 0.7 // 瞄准激光持续
const FIRE_T = 0.12 // 开火
const COOL_T = 1.5 // 冷却
const BEAM_HALF = 18 // 激光命中半宽
const SHIELD_MUL = 0.6 // 护盾减伤 40%
const BACK_MUL = 1.5 // 背部弱点

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export class Sentry extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.facing = -1
    this.baseAim = Math.PI
    this.aim = Math.PI
    this.sweepT = Math.random() * 6
    this.state = 'scan'
    this.stateT = 0
    this.aggroT = 0
    this.fireCd = 0
    this.shieldFlash = 0
    this.beepT = 0
    this.flipT = 2.2 + Math.random() * 1.6
    this.fixedX = this.body.x
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 护盾：一圈贴地的六边形感觉的环
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x9fd3e0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.shieldMat = shieldMat
    this.shieldMesh = new THREE.Mesh(new THREE.RingGeometry(26, 34, 6, 1), shieldMat)
    this.shieldMesh.renderOrder = 6
    this.group.add(this.shieldMesh)

    // 瞄准激光：1×1 的细长面片，按段位缩放
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xff6b52,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.laserMat = laserMat
    this.laserGeo = new THREE.PlaneGeometry(1, 1)
    this.laserMesh = new THREE.Mesh(this.laserGeo, laserMat)
    this.laserMesh.renderOrder = 7
    this.laserMesh.visible = false
    this.group.add(this.laserMesh)

    // 落点光点
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xff6b52,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.dotMat = dotMat
    this.dotMesh = new THREE.Mesh(new THREE.RingGeometry(6, 11, 12, 1), dotMat)
    this.dotMesh.renderOrder = 7
    this.dotMesh.visible = false
    this.group.add(this.dotMesh)

    // 开火光束（比瞄准线粗、更亮）
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd0b0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.beamMat = beamMat
    this.beamMesh = new THREE.Mesh(this.laserGeo, beamMat)
    this.beamMesh.renderOrder = 8
    this.beamMesh.visible = false
    this.group.add(this.beamMesh)

    // 背部弱点：贴在贴图背面的小红灯
    const weakMat = new THREE.MeshBasicMaterial({ color: 0xc2553f, toneMapped: false })
    this.weakMat = weakMat
    this.weakMesh = new THREE.Mesh(new THREE.CircleGeometry(4, 8), weakMat)
    this.weakMesh.position.set(-16, 0, 0.3)
    this.mesh.add(this.weakMesh)
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
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 0.5) * 220,
        life: 0.2 + Math.random() * 0.3,
        size: 0.5 + Math.random() * 0.7,
        color,
      })
    }
  }

  _muzzle() {
    return { x: this.px + this.facing * 22, y: this.py - 4 }
  }

  /** 把 1×1 面片摆成从 (x0,y0) 到 (x1,y1) 的线段 */
  _placeSegment(mesh, x0, y0, x1, y1, thickness) {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.max(1, Math.hypot(dx, dy))
    mesh.position.set((x0 + x1) * 0.5, -(y0 + y1) * 0.5, 3.4)
    mesh.rotation.z = Math.atan2(-dy, dx)
    mesh.scale.set(len, thickness, 1)
  }

  _beamHitsPlayer(mx, my, tx, ty) {
    const p = this.player
    if (!p || p.dead) return false
    const dx = tx - mx
    const dy = ty - my
    const len2 = dx * dx + dy * dy || 1
    const t = clamp(((p.centerX - mx) * dx + (p.centerY - my) * dy) / len2, 0, 1)
    const cx = mx + dx * t
    const cy = my + dy * t
    return Math.hypot(p.centerX - cx, p.centerY - cy) <= BEAM_HALF
  }

  _angleToPlayer(p) {
    return Math.atan2(p.centerY - this.py, p.centerX - this.px)
  }

  _enter(name) {
    if (this.state === name) return
    this.state = name
    this.stateT = 0
  }

  _hideAim() {
    if (this.laserMat) this.laserMat.opacity = 0
    if (this.laserMesh) this.laserMesh.visible = false
    if (this.dotMat) this.dotMat.opacity = 0
    if (this.dotMesh) this.dotMesh.visible = false
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    // 固定在原地：炮塔不吃击退
    this.body.x = this.fixedX
    this.vxTarget = 0
    this.aggroT = Math.max(0, this.aggroT - dt)
    this.fireCd = Math.max(0, this.fireCd - dt)
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3.5)

    if (this.shieldMat && this.shieldMesh) {
      this.shieldMesh.position.set(this.px, -(this.body.y + this.body.h * 0.55), 3.05)
      this.shieldMat.opacity = 0.1 + this.shieldFlash * 0.5 + Math.sin(this.stateT * 4) * 0.03
    }

    const p = this.player
    if (!p || p.dead) {
      this._enter('scan')
      this._hideAim()
      this._sweep(dt)
      this.playAnim('idle')
      return
    }
    if (this.hurtT > 0 && this.state !== 'lock' && this.state !== 'fire') {
      this.playAnim('hurt')
    }

    const d = this.distToPlayer()
    const los = this.hasLineOfSight(p.centerX, p.centerY)
    const targetAngle = this._angleToPlayer(p)

    switch (this.state) {
      case 'scan': {
        this._sweep(dt)
        this.playAnim('idle')
        const inFan = Math.abs(angleDiff(this.aim, targetAngle)) <= FAN_HALF
        const alerted = this.aggroT > 0
        if ((d < this.aggro && los && inFan) || (alerted && d < this.aggro * 1.2 && los)) {
          this._enter('lock')
          this.facing = p.centerX >= this.px ? 1 : -1
          this.aim = targetAngle
          this.baseAim = this.facing === 1 ? 0 : Math.PI
          this._sfx('hurt', 0.22, 1.9)
        }
        break
      }

      case 'lock': {
        // 瞄准线持续跟随玩家：这是可以读、也可以躲的前摇
        this.aim = targetAngle
        this.facing = p.centerX >= this.px ? 1 : -1
        const mx = this._muzzle().x
        const my = this._muzzle().y
        const tx = p.centerX
        const ty = p.centerY
        this._placeSegment(this.laserMesh, mx, my, tx, ty, 2)
        this.laserMesh.visible = true
        const pulse = 0.28 + Math.sin(this.stateT * 34) * 0.18
        this.laserMat.opacity = pulse
        this.dotMat.opacity = 0.55 + Math.sin(this.stateT * 30) * 0.3
        this.dotMesh.visible = true
        this.dotMesh.position.set(tx, -ty, 3.5)
        this.dotMesh.rotation.z += dt * 5
        this.playAnim('attack')

        // 伺服伺服声：一声一声催
        this.beepT -= dt
        if (this.beepT <= 0) {
          this.beepT = 0.2
          this._sfx('hurt', 0.12, 1.2 + (1 - this.stateT / LOCK_T) * 0.9)
        }

        // 玩家跑出视线：锁定中断
        if (!los || d > this.attackRange * 1.15) {
          this._hideAim()
          this._enter('cool')
          this.fireCd = 0.4
          break
        }

        if (this.stateT >= LOCK_T) {
          this._hideAim()
          this._fireBeam(p, d, los)
          this._enter('fire')
        }
        break
      }

      case 'fire': {
        this.playAnim('attack')
        this.beamT = Math.max(0, (this.beamT ?? FIRE_T) - dt)
        this.beamMat.opacity = Math.max(0, this.beamT / FIRE_T)
        this.beamMesh.visible = this.beamMat.opacity > 0.02
        if (this.stateT >= FIRE_T) {
          this.beamMesh.visible = false
          this.beamMat.opacity = 0
          this._enter('cool')
          this.fireCd = COOL_T
          this.attackCd = this.def.attackCooldown ?? 2.2
        }
        break
      }

      case 'cool': {
        this._hideAim()
        this.playAnim('idle')
        // 冷却时炮口缓慢回正，扫向下一个扇区
        this.baseAim = this.facing === 1 ? 0 : Math.PI
        this.aim += angleDiff(this.baseAim, this.aim) * Math.min(1, dt * 3)
        if (this.fireCd <= 0) this._enter('scan')
        break
      }

      default:
        this._enter('scan')
        break
    }
  }

  /**
   * 扫描：每 2~4s 整个炮塔翻一次面（伺服声），期间炮口在 ±0.5rad 内缓慢扫。
   * 这样背上来的玩家只能「等它转过去」才有机会，正面玩家也能看到它转开。
   */
  _sweep(dt) {
    this.sweepT += dt
    this.flipT -= dt
    if (this.flipT <= 0) {
      this.flipT = 3.0 + Math.random() * 1.6
      this.facing *= -1
      this._sfx('hurt', 0.12, 0.85)
    }
    this.baseAim = this.facing === 1 ? 0 : Math.PI
    this.aim = this.baseAim + Math.sin(this.sweepT * 0.85) * 0.5
  }

  _fireBeam(p, d, los) {
    const mx = this._muzzle().x
    const my = this._muzzle().y
    const tx = p.centerX
    const ty = p.centerY
    this.beamT = FIRE_T
    this._placeSegment(this.beamMesh, mx, my, tx, ty, 4)
    this.beamMesh.visible = true
    this.beamMat.opacity = 1
    this._spark(0xffd0b0, 10)
    this._sfx('hurt', 0.4, 0.85)
    this.game.shake?.(0.18)

    if (los && d <= this.attackRange && this._beamHitsPlayer(mx, my, tx, ty)) {
      this.hitPlayer(this.damage)
      const parts = this.game.particles
      if (parts && typeof parts.emit === 'function') {
        for (let i = 0; i < 8; i++) {
          parts.emit('spark', p.centerX, p.centerY, {
            vx: (Math.random() - 0.5) * 220,
            vy: (Math.random() - 0.5) * 220,
            life: 0.2 + Math.random() * 0.2,
            size: 0.6,
            color: 0xffd0b0,
          })
        }
      }
    }
  }

  // ------------------------------------------------------------------ 伤害修正
  takeDamage(n, fromX = null) {
    if (!this.alive) return
    let dmg = n * SHIELD_MUL
    let weak = false
    if (fromX != null) {
      const behind = (fromX - this.px) * this.facing < 0
      if (behind) {
        dmg = n * BACK_MUL
        weak = true
      }
    }
    this.shieldFlash = 1
    const x0 = this.body.x
    super.takeDamage(dmg, fromX)
    // 固定炮塔：强制回到原位，不吃击退
    this.body.x = x0
    this.fixedX = x0
    this.body.vx = 0
    this.body.vy = 0
    this.aggroT = Math.max(this.aggroT, 4)
    this._spark(weak ? 0xe5a33c : 0x9fd3e0, weak ? 12 : 6)
    if (weak) this.game.shake?.(0.1)
    if (this.alive && this.state === 'scan') this._enter('lock')
  }

  dispose() {
    super.dispose()
  }
}

export const CLASS = Sentry
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
