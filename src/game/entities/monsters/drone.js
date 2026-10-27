import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 无人机 —— 空中投弹手（rogue，flying）。
 *
 * 悬停在玩家上方偏后的位置（约 150~260px），投掷带落地延迟的炸弹：
 * 投弹前 0.4s 舱门泛红 + 蜂鸣；炸弹下落期间地面会显示一个闪烁的落点圈，
 * 圈的颜色和节奏就是「快离开这里」的全部信息。
 *
 * 被击落后不会立刻消失：它螺旋下坠约 1s，落地再炸一次（更大的范围），
 * 所以别站在坠落的无人机的正下方补刀。
 */

export const DEF = {
  id: 'drone',
  name: '无人机',
  en: 'DRONE',
  family: 'rogue',
  hp: 40,
  speed: 118,
  damage: 12,
  size: [38, 28],
  aggro: 420,
  attackRange: 300,
  attackType: 'bomb',
  attackCooldown: 2.4,
  xp: 12,
  gravity: 0,
  flying: true,
  hover: 190,
  loot: [
    { id: 'sensor_unit', chance: 0.45 },
    { id: 'gyro', chance: 0.4 },
    { id: 'copper_wire', chance: 0.5, min: 1, max: 2 },
    { id: 'battery_cell', chance: 0.35 },
    { id: 'scrap_plate', chance: 0.6 },
  ],
  artId: 'drone',
  sound: 'hurt',
  biome: ['factory', 'city'],
  desc: '它还在执行投递任务。货物清单上写着你的坐标。',
}

const BOMB_WIND = 0.4
const BOMB_GRAVITY = 760
const BOMB_RADIUS = 68
const BOMB_DAMAGE = 20
const CRASH_GRAVITY = 900
const CRASH_T = 1.2
const CRASH_RADIUS = 92
const CRASH_DAMAGE = 24
const STANDOFF_X = 205 // 冷却期与玩家的水平间距

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export class Drone extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.bombs = []
    this.bobPhase = Math.random() * 6.28
    this.crashing = false
    this.crashT = 0
    this.exploded = false
    this.bayT = 0
    this.rotorT = 0
    this.sideDir = Math.random() < 0.5 ? -1 : 1
    this.sideT = 0
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 旋翼：两条细面片，飞行时快速旋转
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x9aa8ad, transparent: true, opacity: 0.7, toneMapped: false })
    this.rotorMat = rotorMat
    this.rotorGeo = new THREE.PlaneGeometry(18, 2)
    this.rotorA = new THREE.Mesh(this.rotorGeo, rotorMat)
    this.rotorA.position.set(-9, 12, 0.2)
    this.rotorA.rotation.z = 0.3
    this.mesh.add(this.rotorA)
    this.rotorB = new THREE.Mesh(this.rotorGeo, rotorMat)
    this.rotorB.position.set(9, 12, 0.2)
    this.rotorB.rotation.z = -0.3
    this.mesh.add(this.rotorB)

    // 投弹舱门：泛红提示
    const bayMat = new THREE.MeshBasicMaterial({
      color: 0xc2553f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.bayMat = bayMat
    this.bayMesh = new THREE.Mesh(new THREE.CircleGeometry(6, 10), bayMat)
    this.bayMesh.position.set(0, -9, 0.3)
    this.mesh.add(this.bayMesh)
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
        life: 0.2 + Math.random() * 0.3,
        size: 0.5 + Math.random() * 0.7,
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

  _fly(dt, tx, ty, mul = 1) {
    const b = this.body
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const dx = tx - cx
    const dy = ty - cy
    const len = Math.hypot(dx, dy)
    if (len < 0.001) {
      this.vxTarget = 0
      return
    }
    const speed = this.speed * mul
    const step = Math.min(len, speed * dt)
    const map = this.map
    let nx = b.x + (dx / len) * step
    let ny = b.y + (dy / len) * step
    if (map && typeof map.solidAt === 'function') {
      if (map.solidAt(nx + b.w / 2, cy)) nx = b.x
      if (map.solidAt(b.x + b.w / 2, ny + b.h / 2)) ny = b.y
      if (map.solidAt(b.x + b.w / 2, ny - 2)) ny = b.y
    }
    const roomW = this.game.room?.data?.worldW ?? (this.game.roomW || 4000)
    const roomH = this.game.room?.data?.worldH ?? (this.game.roomH || 2000)
    b.x = clamp(nx, 16, roomW - b.w - 16)
    b.y = clamp(ny, 14, roomH - b.h - 14)
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1
    this.vxTarget = 0
  }

  _groundBelow(x, y) {
    const map = this.map
    if (map && typeof map.groundBelow === 'function') {
      const g = map.groundBelow(x, y, 600)
      if (g != null) return g
    }
    const roomH = this.game.room?.data?.worldH ?? (this.game.roomH || 2000)
    return roomH - 40
  }

  // ------------------------------------------------------------------ 炸弹
  _dropBomb() {
    const p = this.player
    const x = this.px
    const y = this.py + 8
    const groundY = this._groundBelow(x, y)
    const fallH = Math.max(24, groundY - y)
    const vy0 = 70
    // 下落时间（解 0.5gt² + v0t - h = 0）
    const T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * BOMB_GRAVITY * fallH)) / BOMB_GRAVITY
    // 提前量：按玩家当前水平速度推导落点（跑动就能躲开）
    let bx = 0
    if (p && !p.dead) {
      const pxv = p.body?.vx ?? 0
      const targetX = p.centerX + pxv * T
      bx = clamp((targetX - x) / Math.max(0.2, T), -170, 170)
    }
    const landX = x + bx * T

    const mat = new THREE.MeshBasicMaterial({ color: 0x4a4238, toneMapped: false })
    const geo = new THREE.CircleGeometry(5, 8)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, -y, 3.2)
    this.group.add(mesh)

    // 地面落点圈：从投下那一刻就开始预警（落在预测点上，不会骗人）
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe5a33c,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const ring = new THREE.Mesh(new THREE.RingGeometry(BOMB_RADIUS - 7, BOMB_RADIUS, 20, 1), ringMat)
    ring.position.set(landX, -groundY + 3, 3.1)
    ring.scale.set(1, 0.35, 1)
    this.group.add(ring)

    this.bombs.push({ x, y, vx: bx, vy: vy0, t: 0, groundY, landX, mesh, mat, geo, ring, ringMat })
    this._sfx('hurt', 0.24, 1.6)
  }

  _destroyBomb(i) {
    const b = this.bombs[i]
    if (!b) return
    this.group.remove(b.mesh)
    this.group.remove(b.ring)
    b.mat.dispose()
    b.geo.dispose()
    b.ring.geometry.dispose()
    b.ringMat.dispose()
    this.bombs.splice(i, 1)
  }

  _updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]
      b.t += dt
      b.vy += BOMB_GRAVITY * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.mesh.position.set(b.x, -b.y, 3.2)
      b.mesh.rotation.z += dt * 10

      // 落点圈脉动：越接近落地跳得越快
      const k = Math.min(1, b.t / 1.1)
      b.ringMat.opacity = 0.28 + Math.sin(b.t * (10 + k * 26)) * 0.22
      b.ring.rotation.z += dt * 1.5

      const landed = b.y >= b.groundY - 6
      if (landed || b.t > 3) {
        const ex = b.landX
        const ey = b.groundY - 4
        this._aoe(ex, ey, BOMB_RADIUS, BOMB_DAMAGE)
        this._spark(0xffd0b0, 18)
        const parts = this.game.particles
        if (parts && typeof parts.emit === 'function') {
          for (let j = 0; j < 12; j++) {
            parts.emit('dust', ex + (Math.random() - 0.5) * BOMB_RADIUS, ey, {
              vx: (Math.random() - 0.5) * 260,
              vy: -Math.random() * 150,
              life: 0.35 + Math.random() * 0.4,
              size: 1 + Math.random(),
              color: 0x6b5f55,
            })
          }
        }
        this.game.shake?.(0.4)
        this._sfx('thunder', 0.34, 1.5)
        this._destroyBomb(i)
      }
    }
  }

  _clearBombs() {
    for (let i = this.bombs.length - 1; i >= 0; i--) this._destroyBomb(i)
  }

  // ------------------------------------------------------------------ 坠落
  _startCrash() {
    this.crashing = true
    this.crashT = 0
    this.state = 'crash'
    this.stateT = 0
    this.playAnim('hurt')
    this._sfx('hurt', 0.42, 0.8)
    this._spark(0xc2553f, 14)
    this._clearBombs()
  }

  _crashExplode() {
    if (this.exploded) return
    this.exploded = true
    this._aoe(this.px, this.py, CRASH_RADIUS, CRASH_DAMAGE)
    this._spark(0xffd0b0, 24)
    const parts = this.game.particles
    if (parts && typeof parts.emit === 'function') {
      for (let j = 0; j < 14; j++) {
        parts.emit('dust', this.px + (Math.random() - 0.5) * 60, this.py, {
          vx: (Math.random() - 0.5) * 300,
          vy: -Math.random() * 160,
          life: 0.4 + Math.random() * 0.4,
          size: 1.1 + Math.random(),
          color: 0x6b5f55,
        })
      }
    }
    this.game.shake?.(0.5)
    this._sfx('thunder', 0.38, 1.4)
    if (this.bayMesh) this.bayMesh.visible = false
    if (this.rotorA) this.rotorA.visible = false
    if (this.rotorB) this.rotorB.visible = false
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this._updateBombs(dt)

    // 旋翼
    this.rotorT += dt
    if (this.rotorA && this.rotorB) {
      const spin = this.crashing ? 0.2 : 1
      this.rotorA.rotation.z = Math.sin(this.rotorT * 42) * spin
      this.rotorB.rotation.z = -Math.sin(this.rotorT * 42) * spin
    }

    // 坠落中：螺旋下坠，落地再炸
    if (this.crashing) {
      this.crashT += dt
      const b = this.body
      b.x += Math.sin(this.crashT * 9) * 34 * dt
      b.y += CRASH_GRAVITY * dt * this.crashT * 0.9
      this.mesh.rotation.z = this.crashT * 7
      if (Math.random() < dt * 22) this._spark(0x6b5f55, 1)
      const groundY = this._groundBelow(this.px, this.py)
      if (this.crashT >= CRASH_T || this.py >= groundY - 8) {
        this._crashExplode()
        this.mesh.rotation.z = 0
        super.die()
      }
      return
    }

    const p = this.player
    if (!p || p.dead) {
      // 无目标：悬停飘着
      this._fly(dt, this.px + Math.sin(this.bobPhase) * 30, this.py - 10, 0.25)
      this.playAnim('idle')
      return
    }
    if (this.hurtT > 0) {
      this._fly(dt, this.px - this.facing * 40, this.py - 30, 0.8)
      this.playAnim('hurt')
      return
    }

    // 投弹前摇
    if (this.state === 'bombWind') {
      this.playAnim('attack')
      // 一边抬升一边对齐到玩家正上方，投弹点才不会偏
      if (p && !p.dead) this._fly(dt, p.centerX + this.facing * 8, p.centerY - 150, 1.3)
      const k = Math.min(1, this.stateT / BOMB_WIND)
      if (this.bayMat) this.bayMat.opacity = 0.25 + k * 0.6 + Math.sin(this.stateT * 30) * 0.15
      if (this.stateT >= BOMB_WIND) {
        this.state = 'idle'
        this.stateT = 0
        this.attackCd = this.def.attackCooldown ?? 2.4
        if (this.bayMat) this.bayMat.opacity = 0
        this._dropBomb()
      }
      return
    }
    if (this.bayMat) this.bayMat.opacity = Math.max(0, this.bayMat.opacity - dt * 2)

    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)

    // 悬停节奏
    this.sideT -= dt
    if (this.sideT <= 0) {
      this.sideT = 1.8 + Math.random() * 1.8
      this.sideDir *= -1
    }
    this.bobPhase += dt * 2

    if (!sees) {
      this._fly(dt, this.px + Math.sin(this.bobPhase) * 60, this.py - 24, 0.5)
      this.playAnim('idle')
      return
    }

    this.playAnim('run')
    // 冷却期保持侧后方悬停；攻击就绪时飞到玩家正上方瞄准投弹
    const ready = this.attackCd <= 0
    const hoverX = ready ? p.centerX + this.facing * 10 : p.centerX + this.sideDir * STANDOFF_X
    const hoverY = p.centerY - 160 + Math.sin(this.bobPhase + this.stateT * 2) * 12
    this._fly(dt, hoverX, hoverY, ready ? 1.15 : 0.85)

    if (ready && d <= this.attackRange && Math.abs(this.px - p.centerX) < 78) {
      this.state = 'bombWind'
      this.stateT = 0
      this.vxTarget = 0
      this.playAnim('attack')
      this._sfx('hurt', 0.2, 2.0)
    }
  }

  // ------------------------------------------------------------------ 死亡：先坠落，落地再炸
  die() {
    if (this.crashing || !this.alive) return
    if (!this.exploded) {
      this._startCrash()
      return
    }
    super.die()
  }
}

export const CLASS = Drone
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
