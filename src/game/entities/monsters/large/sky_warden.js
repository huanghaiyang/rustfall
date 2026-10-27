import * as THREE from 'three'
import { BaseMonster } from '../base.js'
import { Content, KIND } from '../../../core/registry.js'
import { TS } from '../../../config.js'
import {
  initLarge,
  applyLargeArt,
  playIntro,
  updateActivation,
  puff,
  spark,
  sfx,
  shake,
  createTell,
  placeTell,
  showTell,
  disposeTell,
  largeDeathFx,
  beamHitsPlayer,
  placeSegment,
  roomBounds,
  clamp,
} from './common.js'

/**
 * 天穹守望者 —— 大型飞行指挥母机（rogue，flying）。
 *
 * 多阶段：
 *   阶段 1（100%~50%）
 *     · 高空悬停（约 210px），主炮扫射：0.8s 红色预警线（前 0.55s 跟随、后 0.25s 锁定）
 *       → 开火 → 冷却。锁定之后才躲得掉的玩家会被惩罚。
 *     · 每 7 秒俯冲「低空掠过」一次（降到 ~60px）：这是近战能砍到它的窗口。
 *     · 每 ~8 秒打开机腹舱门召唤 1~2 架 drone（走 game.director.spawn）。
 *   阶段 2（≤50%）过载
 *     · 移速 ×1.5、主炮冷却 ×0.7，但每 ~7 秒会「过热坠落」：掉到地面 1.9s，
 *       期间受到 1.6 倍伤害；然后重启爬升。
 *
 * 死亡：失去悬停 → 坠落 → 触地爆炸（对周围也造成伤害）。
 */

export const DEF = {
  id: 'sky_warden',
  name: '天穹守望者',
  en: 'SKY WARDEN',
  family: 'rogue',
  hp: 380,
  speed: 96,
  damage: 22,
  size: [180, 110],
  aggro: 700,
  attackRange: 560,
  attackType: 'laser',
  attackCooldown: 2.6,
  xp: 160,
  gravity: 0,
  flying: true,
  hover: 210,
  elite: true,
  loot: [
    { id: 'board_cpu', chance: 1, min: 1, max: 2 },
    { id: 'sensor_unit', chance: 0.9 },
    { id: 'gyro', chance: 0.8 },
    { id: 'optical_module', chance: 0.7 },
    { id: 'battery_cell', chance: 0.8, min: 1, max: 2 },
    { id: 'aluminum_sheet', chance: 0.75, min: 2, max: 3 },
    { id: 'rare_earth', chance: 0.5 },
    { id: 'reactor_core', chance: 0.2 },
  ],
  artId: 'sky_warden',
  sound: 'thunder',
  biome: ['city', 'factory'],
  desc: '它管着这片空域。你听见的每一次嗡鸣，都是它在决定要不要清场。',
}

const AIM_TRACK = 0.55
const AIM_TOTAL = 0.8
const FIRE_T = 0.32
const RECOVER_T = 1.25
const SUMMON_CD = 8.5
const SUMMON_MAX = 2
const DIP_CD = 7
const DIP_ALT = 58
const HIGH_ALT = 210
const OVERHEAT_CD = 7
const OVERHEAT_T = 1.9
const REBOOT_T = 1.2
const OVERHEAT_DMG_MUL = 1.6
const CRASH_T = 1.4

export class SkyWarden extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.altitude = HIGH_ALT
    this.targetAlt = HIGH_ALT
    this.laserCd = 1.6
    this.summonCd = SUMMON_CD * 0.6
    this.dipCd = DIP_CD
    this.overheatCd = OVERHEAT_CD
    this.overheated = false
    this.overload = false
    this.drones = []
    this.beepT = 0
    this.lockX = 0
    this.lockY = 0
    this.locked = false
    this.crashing = false
    this.crashT = 0
    this.crashDone = false
    this.spin = 0
    this.tell = createTell(this, { inner: 46, outer: 70, color: 0xc2553f })
    this.warnMat = new THREE.MeshBasicMaterial({
      color: 0xff6b52,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.warnMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.warnMat)
    this.warnMesh.renderOrder = 7
    this.warnMesh.visible = false
    this.group.add(this.warnMesh)
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd0b0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.beamMesh = new THREE.Mesh(this.warnMesh.geometry, this.beamMat)
    this.beamMesh.renderOrder = 8
    this.beamMesh.visible = false
    this.group.add(this.beamMesh)
    this.dotMesh = new THREE.Mesh(
      new THREE.RingGeometry(8, 14, 14, 1),
      new THREE.MeshBasicMaterial({
        color: 0xff6b52,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    )
    this.dotMesh.renderOrder = 7
    this.dotMesh.visible = false
    this.group.add(this.dotMesh)
    initLarge(this, { intro: 1.6, activateRange: 900, deactivateRange: 1400 })
    applyLargeArt(this)
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 机腹弱点：过载坠落时亮起
    const bellyMat = new THREE.MeshBasicMaterial({
      color: 0xe5a33c,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.bellyMat = bellyMat
    this.belly = new THREE.Mesh(new THREE.PlaneGeometry(46, 18), bellyMat)
    this.belly.renderOrder = 5
    this.group.add(this.belly)

    // 推进器
    const thrMat = new THREE.MeshBasicMaterial({
      color: 0x9fd3e0,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.thrMat = thrMat
    this.thrGeo = new THREE.PlaneGeometry(22, 34)
    this.thrA = new THREE.Mesh(this.thrGeo, thrMat)
    this.thrB = new THREE.Mesh(this.thrGeo, thrMat)
    this.thrA.renderOrder = 5
    this.thrB.renderOrder = 5
    this.group.add(this.thrA)
    this.group.add(this.thrB)

    // 召唤舱门
    const hatchMat = new THREE.MeshBasicMaterial({
      color: 0x9fd3e0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.hatchMat = hatchMat
    this.hatch = new THREE.Mesh(new THREE.CircleGeometry(13, 12), hatchMat)
    this.hatch.renderOrder = 6
    this.group.add(this.hatch)
  }

  // ------------------------------------------------------------------ 工具
  _groundYAt(x) {
    const d = this.game?.room?.data
    if (d && d.floorY) {
      const tx = Math.floor(x / TS)
      if (tx >= 0 && tx < d.floorY.length) return d.floorY[tx] * TS
    }
    const map = this.map
    if (map && typeof map.groundBelow === 'function') {
      const g = map.groundBelow(x, 0, 5000)
      if (g != null) return g
    }
    return (roomBounds(this).h || 2000) - 120
  }

  _centerYForAlt(x, alt) {
    return this._groundYAt(x) - alt - this.h * 0.5
  }

  _fly(dt, tx, ty, mul = 1) {
    const b = this.body
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const dx = tx - cx
    const dy = ty - cy
    const len = Math.hypot(dx, dy)
    if (len < 0.001) return
    const step = Math.min(len, this.speed * mul * dt)
    const map = this.map
    let nx = b.x + (dx / len) * step
    let ny = b.y + (dy / len) * step
    if (map && typeof map.solidAt === 'function') {
      if (map.solidAt(nx + b.w / 2, cy)) nx = b.x
      if (map.solidAt(b.x + b.w / 2, ny + b.h / 2)) ny = b.y
      if (map.solidAt(b.x + b.w / 2, ny - 4)) ny = b.y
    }
    const { w, h } = roomBounds(this)
    b.x = clamp(nx, 30, w - b.w - 30)
    b.y = clamp(ny, 20, h - b.h - 20)
    if (Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1
    this.vxTarget = 0
  }

  _muzzle() {
    return { x: this.px + this.facing * 62, y: this.body.y + this.body.h * 0.62 }
  }

  _hideAim() {
    this.warnMat.opacity = 0
    this.warnMesh.visible = false
    this.dotMesh.visible = false
    this.dotMesh.material.opacity = 0
  }

  _hideBeam() {
    this.beamMat.opacity = 0
    this.beamMesh.visible = false
  }

  _hoverAt(dt, alt, mul = 1) {
    this.altitude += (alt - this.altitude) * Math.min(1, dt * 3)
    const p = this.player
    const tx = p ? p.centerX + this.facing * 150 : this.px
    this._fly(dt, tx, this._centerYForAlt(this.px, this.altitude), mul)
  }

  _updateVisuals(dt) {
    const feetCenter = this.body.y + this.body.h
    const cx = this.px
    const cy = this.body.y + this.body.h * 0.5
    if (this.belly) {
      this.belly.position.set(cx, -feetCenter + 6, 4.2)
      this.bellyMat.opacity = this.overheated || this.crashing ? 0.4 + Math.sin(this.stateT * 12) * 0.25 : 0.1
    }
    if (this.thrA && this.thrB) {
      const flick = 0.24 + Math.abs(Math.sin(this.stateT * 18)) * 0.18
      this.thrMat.opacity = this.crashing ? 0.05 : flick
      this.thrA.position.set(cx - 54, -feetCenter + 40, 4.3)
      this.thrB.position.set(cx + 54, -feetCenter + 40, 4.3)
      const scale = this.overheated ? 0.4 : 1
      this.thrA.scale.set(1, scale, 1)
      this.thrB.scale.set(1, scale, 1)
    }
    if (this.hatch) {
      this.hatch.position.set(cx, -feetCenter + 22, 4.4)
      if (this.state !== 'summon') this.hatchMat.opacity = Math.max(0, this.hatchMat.opacity - dt * 2)
    }
    if (this.tell) {
      placeTell(this.tell, cx, feetCenter + 2, 1)
      if (this.tell.mat.opacity > 0) showTell(this.tell, Math.max(0, this.tell.mat.opacity - dt * 1.6))
    }
  }

  // ------------------------------------------------------------------ 攻击
  _fireBeam() {
    const p = this.player
    if (!p) return
    const m = this._muzzle()
    const tx = this.locked ? this.lockX : p.centerX
    const ty = this.locked ? this.lockY : p.centerY
    placeSegment(this.beamMesh, m.x, m.y, tx, ty, 5)
    this.beamMat.opacity = 1
    this.beamMesh.visible = true
    spark(this, tx, ty, 0xffd0b0, 12, 260)
    shake(this, 0.25)
    sfx(this, 'hurt', 0.45, 0.8)
    if (beamHitsPlayer(this, m.x, m.y, tx, ty, 19)) this.hitPlayer(DEF.damage)
  }

  _summonDrones() {
    this.drones = this.drones.filter((d) => d && d.alive)
    if (this.drones.length >= SUMMON_MAX) return 0
    const spawn = this.game?.director?.spawn
    if (typeof spawn !== 'function') return 0
    let n = 0
    const want = this.drones.length === 0 ? 2 : 1
    for (let i = 0; i < want && this.drones.length < SUMMON_MAX; i++) {
      const ox = this.px + (i === 0 ? -80 : 80)
      const oy = this.body.y + this.body.h + 26
      let d = null
      try {
        d = spawn.call(this.game.director, 'drone', ox, oy)
      } catch (e) {
        d = null
      }
      if (d) {
        this.drones.push(d)
        n++
      }
    }
    if (n > 0) {
      this.hatchMat.opacity = 0.8
      sfx(this, 'wake', 0.4, 1.3)
      puff(this, 10, 0x9fd3e0, 1)
    }
    return n
  }

  // ------------------------------------------------------------------ 伤害
  takeDamage(n, fromX = null) {
    if (!this.alive) return
    let dmg = n
    if (this.overheated) dmg = n * OVERHEAT_DMG_MUL
    super.takeDamage(dmg, fromX)
    if (this.alive && !this.overload && this.hp / this.maxHp <= 0.5) {
      this.overload = true
      this.overheatCd = 3
      sfx(this, 'thunder', 0.5, 1.3)
      shake(this, 0.45)
      puff(this, 20, 0xb7924f, 1.4)
    }
  }

  // ------------------------------------------------------------------ 死亡
  _startCrash() {
    this.crashing = true
    this.crashT = 0
    this.crashDone = false
    this.state = 'crash'
    this.stateT = 0
    this._hideAim()
    this._hideBeam()
    this.playAnim('hurt')
    sfx(this, 'thunder', 0.6, 1.1)
    shake(this, 0.5)
    spark(this, this.px, this.py, 0xffd0b0, 20, 320)
  }

  _crashExplode() {
    if (this.crashDone) return false
    this.crashDone = true
    largeDeathFx(this, {
      particles: 34,
      sparks: 24,
      shake: 0.85,
      color: 0x6b5f55,
      aoeRadius: 140,
      aoeDamage: 20,
      extraLoot: [{ id: 'aluminum_sheet', n: 2, spread: 120 }],
    })
    return true
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this._updateVisuals(dt)
    this.laserCd = Math.max(0, this.laserCd - dt)
    this.summonCd = Math.max(0, this.summonCd - dt)
    this.dipCd = Math.max(0, this.dipCd - dt)
    this.overheatCd = Math.max(0, this.overheatCd - dt)

    // 坠落：螺旋下坠，触地爆炸
    if (this.crashing) {
      this.crashT += dt
      this.spin += dt * 7
      this.mesh.rotation.z = this.spin
      this.body.y += (300 + this.crashT * 700) * dt
      this.body.x += Math.sin(this.crashT * 9) * 90 * dt
      if (Math.random() < dt * 28) puff(this, 2, 0x6b5f55, 1.4)
      const gy = this._groundYAt(this.px)
      const feet = this.body.y + this.body.h
      if (this.crashT >= CRASH_T || feet >= gy - 4) {
        this.mesh.rotation.z = 0
        this._crashExplode()
        super.die()
      }
      return
    }

    if (playIntro(this, dt)) {
      // 入场：从高空压到悬停高度
      this._hoverAt(dt, HIGH_ALT, 1.1)
      return
    }

    const p = this.player
    const active = updateActivation(this, dt)
    if (!p || p.dead || !active) {
      const pt = this.patrol[this.patrolIdx % Math.max(1, this.patrol.length)]
      if (pt) {
        const dx = pt.x - this.px
        if (Math.abs(dx) < 40) {
          this.patrolWait -= dt
          if (this.patrolWait <= 0) {
            this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length
            this.patrolWait = 2 + Math.random() * 2.5
          }
        } else {
          this.facing = dx > 0 ? 1 : -1
        }
      }
      const targetX = pt ? pt.x : this.px
      const targetY = pt ? this._centerYForAlt(targetX, HIGH_ALT - 30) : this._centerYForAlt(this.px, HIGH_ALT - 30)
      this._fly(dt, targetX, targetY, 0.55)
      this.playAnim('run')
      return
    }

    if (this.hurtT > 0 && !['aim', 'fire', 'overheat'].includes(this.state)) {
      this.playAnim('hurt')
    }

    switch (this.state) {
      case 'hover':
      case 'alert': {
        this.playAnim('idle')
        this._hoverAt(dt, HIGH_ALT, this.overload ? 1.5 : 1)
        if (this.overload && this.overheatCd <= 0) {
          this.state = 'overheat'
          this.stateT = 0
          this.overheated = true
          this.overheatCd = OVERHEAT_CD
          sfx(this, 'hurt', 0.6, 0.6)
          puff(this, 18, 0x6b5f55, 1.5)
          shake(this, 0.35)
          break
        }
        if (this.dipCd <= 0) {
          this.state = 'dipDown'
          this.stateT = 0
          this.dipCd = DIP_CD + Math.random() * 2
          break
        }
        if (this.summonCd <= 0) {
          this.state = 'summon'
          this.stateT = 0
          this.summonCd = SUMMON_CD
          this.vxTarget = 0
          sfx(this, 'wake', 0.45, 1.15)
          break
        }
        if (this.laserCd <= 0) {
          this.state = 'aim'
          this.stateT = 0
          this.locked = false
          showTell(this.tell, 0.35)
          sfx(this, 'hurt', 0.3, 1.5)
          break
        }
        break
      }

      case 'aim': {
        this.playAnim('attack')
        this._hoverAt(dt, HIGH_ALT, 0.6)
        const m = this._muzzle()
        const tx = this.locked ? this.lockX : p.centerX
        const ty = this.locked ? this.lockY : p.centerY
        if (!this.locked && this.stateT >= AIM_TRACK) {
          this.locked = true
          this.lockX = p.centerX
          this.lockY = p.centerY
          sfx(this, 'hurt', 0.25, 2.0)
        }
        if (!this.locked) {
          this.lockX = p.centerX
          this.lockY = p.centerY
        }
        placeSegment(this.warnMesh, m.x, m.y, this.lockX, this.lockY, this.locked ? 4 : 2)
        this.warnMesh.visible = true
        this.warnMat.opacity = (this.locked ? 0.6 : 0.3) + Math.sin(this.stateT * 30) * 0.18
        this.dotMesh.visible = true
        this.dotMesh.position.set(this.lockX, -this.lockY, 3.7)
        this.dotMesh.material.opacity = 0.5 + Math.sin(this.stateT * 26) * 0.3
        this.beepT -= dt
        if (this.beepT <= 0) {
          this.beepT = 0.16
          sfx(this, 'hurt', 0.12, 1.4 + this.stateT * 1.2)
        }
        if (this.stateT >= AIM_TOTAL) {
          this._hideAim()
          this._fireBeam()
          this.state = 'fire'
          this.stateT = 0
        }
        break
      }

      case 'fire': {
        this.playAnim('attack')
        this._hoverAt(dt, HIGH_ALT, 0.5)
        this.beamMat.opacity = Math.max(0, 1 - this.stateT / FIRE_T)
        this.beamMesh.visible = this.beamMat.opacity > 0.03
        if (this.stateT >= FIRE_T) {
          this._hideBeam()
          this.state = 'recover'
          this.stateT = 0
          this.laserCd = this.overload ? (RECOVER_T + 0.5) * 0.75 : RECOVER_T + 0.5
        }
        break
      }

      case 'recover': {
        this.playAnim('idle')
        this._hoverAt(dt, HIGH_ALT, 0.8)
        if (this.stateT >= RECOVER_T) {
          this.state = 'hover'
          this.stateT = 0
        }
        break
      }

      case 'dipDown': {
        this.playAnim('run')
        this._hoverAt(dt, DIP_ALT, 1.4)
        const gy = this._groundYAt(this.px)
        const feet = this.body.y + this.body.h
        if (this.stateT > 0.5 && feet > gy - DIP_ALT - 14) {
          this.state = 'dipFire'
          this.stateT = 0
          this.locked = false
          showTell(this.tell, 0.5)
          sfx(this, 'growl', 0.5, 0.9)
          shake(this, 0.25)
        }
        if (this.stateT > 2.2) {
          this.state = 'dipUp'
          this.stateT = 0
        }
        break
      }

      case 'dipFire': {
        this.playAnim('attack')
        this._hoverAt(dt, DIP_ALT, 0.5)
        const m = this._muzzle()
        this.lockX = p.centerX
        this.lockY = p.centerY
        placeSegment(this.warnMesh, m.x, m.y, this.lockX, this.lockY, 3)
        this.warnMesh.visible = true
        this.warnMat.opacity = 0.45 + Math.sin(this.stateT * 26) * 0.2
        if (this.stateT >= 0.55) {
          this._hideAim()
          this._fireBeam()
          this.state = 'dipUp'
          this.stateT = 0
        }
        if (this.stateT > 1.6) {
          this.state = 'dipUp'
          this.stateT = 0
        }
        break
      }

      case 'dipUp': {
        this.playAnim('run')
        this._hoverAt(dt, HIGH_ALT, 1.3)
        if (this.stateT >= 0.9) {
          this.state = 'hover'
          this.stateT = 0
          this.laserCd = Math.max(this.laserCd, 0.8)
        }
        break
      }

      case 'summon': {
        this.playAnim('attack')
        this._hoverAt(dt, HIGH_ALT - 20, 0.5)
        this.vxTarget = 0
        this.hatchMat.opacity = 0.4 + Math.sin(this.stateT * 20) * 0.35
        if (this.stateT >= 0.9) {
          this.hatchMat.opacity = 0
          this._summonDrones()
          this.state = 'hover'
          this.stateT = 0
        }
        break
      }

      case 'overheat': {
        // 过热：失速下坠到地面附近，期间受到 1.6 倍伤害
        this.playAnim('hurt')
        this.overheated = true
        this.overheatCd = OVERHEAT_CD
        this._hoverAt(dt, 12, 1.8)
        this.mesh.rotation.z = Math.sin(this.stateT * 9) * 0.14
        if (Math.random() < dt * 20) puff(this, 2, 0x6b5f55, 1.3)
        if (Math.random() < dt * 8) spark(this, this.px, this.py, 0xe5a33c, 2, 160)
        if (this.stateT >= OVERHEAT_T) {
          this.mesh.rotation.z = 0
          this.state = 'reboot'
          this.stateT = 0
          sfx(this, 'wake', 0.45, 1.1)
        }
        break
      }

      case 'reboot': {
        this.playAnim('idle')
        this._hoverAt(dt, HIGH_ALT, 1.1)
        if (this.stateT >= REBOOT_T) {
          this.overheated = false
          this.state = 'hover'
          this.stateT = 0
          this.laserCd = Math.max(this.laserCd, 0.6)
        }
        break
      }

      default: {
        this.state = 'hover'
        this.stateT = 0
        break
      }
    }
  }

  die() {
    if (this.crashing || !this.alive) return
    this._startCrash()
  }

  dispose() {
    this._hideAim()
    this._hideBeam()
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    super.dispose()
  }
}

export const CLASS = SkyWarden
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
export default SkyWarden
