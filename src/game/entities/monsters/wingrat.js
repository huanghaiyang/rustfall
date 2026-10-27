import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 翼鼠 —— 空中骚扰者（beast，flying）。
 *
 * 栖息在天花板附近；玩家进入感知范围后起飞，绕着玩家画圈（半径约 130~180），
 * 圈 1~2 秒后进入 0.35s 俯冲前摇（收翅 + 尖叫 + 红光），然后直线俯冲撕咬；
 * 咬中或冲过头都会「拉起」回到空中，再重新绕圈。
 *
 * 飞行体不走 BaseMonster 的地面物理（flying:true），位置由本文件直接插值，
 * 每轴单独做一次实体瓦片检测，避免穿墙；被击落时不适用（它会拉起）。
 */

export const DEF = {
  id: 'wingrat',
  name: '翼鼠',
  en: 'WINGRAT',
  family: 'beast',
  hp: 34,
  speed: 150,
  damage: 10,
  size: [30, 24],
  aggro: 360,
  attackRange: 60,
  attackType: 'dive',
  attackCooldown: 2.1,
  xp: 8,
  gravity: 0,
  flying: true,
  hover: 150,
  loot: [
    { id: 'cloth', chance: 0.6 },
    { id: 'rubber', chance: 0.3 },
    { id: 'dog_food', chance: 0.35 },
    { id: 'copper_wire', chance: 0.25 },
  ],
  artId: 'wingrat',
  sound: 'growl',
  biome: ['factory', 'dump', 'city'],
  desc: '倒挂在管道下面，像一团破布。等它张开翅膀的时候，已经太近了。',
}

const CIRCLE_T_MIN = 1.0
const CIRCLE_T_MAX = 1.9
const DIVE_WIND = 0.35
const DIVE_SPEED = 470
const PULLUP_T = 0.65

export class Wingrat extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.home = { x, y }
    this.perch = null
    this.state = 'perch'
    this.stateT = 0
    this.angle = Math.random() * Math.PI * 2
    this.orbitDir = Math.random() < 0.5 ? -1 : 1
    this.orbitR = 130 + Math.random() * 50
    this.circleT = CIRCLE_T_MIN + Math.random() * (CIRCLE_T_MAX - CIRCLE_T_MIN)
    this.diveTarget = { x, y }
    this.diveHit = false
    this.hoverPhase = Math.random() * 6.28
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 一对会扇动的翼膜（挂在贴图上，随 facing 翻面）
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0x5b6b72,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.wingMat = wingMat
    this.wingGeo = new THREE.PlaneGeometry(20, 9)
    this.wingL = new THREE.Mesh(this.wingGeo, wingMat)
    this.wingL.position.set(-7, 4, 0.2)
    this.mesh.add(this.wingL)
    this.wingR = new THREE.Mesh(this.wingGeo, wingMat)
    this.wingR.position.set(7, 4, 0.2)
    this.mesh.add(this.wingR)

    // 俯冲前摇：翼根泛红
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc2553f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.tellMat = mat
    this.tellMesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 30), mat)
    this.tellMesh.renderOrder = 6
    this.tellMesh.visible = false
    this.group.add(this.tellMesh)
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
      parts.emit('dust', this.px + (Math.random() - 0.5) * this.w, this.py, {
        vx: (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.5) * 60,
        life: 0.25 + Math.random() * 0.25,
        size: size * (0.5 + Math.random() * 0.6),
        color,
      })
    }
  }

  /** 天花板栖息点：从出生点向上找最近的实体顶 */
  _perchPoint() {
    if (this.perch) return this.perch
    const map = this.map
    let py = this.body.y - 140
    if (map && typeof map.solidAt === 'function') {
      let y = this.body.y
      for (let i = 0; i < 120; i++) {
        y -= 16
        if (map.solidAt(this.px, y)) {
          py = y + 34
          break
        }
        if (y < 24) {
          py = 34
          break
        }
      }
    }
    this.perch = { x: this.home.x, y: Math.max(30, py) }
    return this.perch
  }

  /** 直接位置插值（飞行体），每轴单独避障 */
  _moveTowards(tx, ty, speed, dt) {
    const b = this.body
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    let dx = tx - cx
    let dy = ty - cy
    const len = Math.hypot(dx, dy)
    if (len < 0.001) return
    const step = Math.min(len, speed * dt)
    const map = this.map
    let nx = b.x + (dx / len) * step
    let ny = b.y + (dy / len) * step

    if (map && typeof map.solidAt === 'function') {
      if (map.solidAt(nx + b.w / 2, cy)) nx = b.x
      if (map.solidAt(b.x + b.w / 2, ny + b.h / 2)) ny = b.y
      // 头顶顶住了就往下让一点，避免卡在半空
      if (map.solidAt(b.x + b.w / 2, ny - 2)) ny = b.y
    }

    const roomW = this.game.room?.data?.worldW ?? (this.game.roomW || 4000)
    const roomH = this.game.room?.data?.worldH ?? (this.game.roomH || 2000)
    b.x = Math.max(16, Math.min(roomW - b.w - 16, nx))
    b.y = Math.max(12, Math.min(roomH - b.h - 12, ny))
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1
    this.vxTarget = 0
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
    if (!this.tellMat || !this.tellMesh) return
    this.tellMat.opacity = opacity
    this.tellMesh.visible = opacity > 0.02
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    const p = this.player
    this.hoverPhase += dt * 3

    // 扇翅：俯冲收翅，平时慢扇
    if (this.wingL && this.wingR) {
      const fold = this.state === 'dive' ? 0.15 : this.state === 'diveWind' ? 0.35 : 1
      const flap = Math.sin(this.animT * 1.6 + this.hoverPhase) * 0.55 * fold
      this.wingL.rotation.z = 0.35 + flap
      this.wingR.rotation.z = -0.35 - flap
      this.wingL.scale.x = 1 - (1 - fold) * 0.35
      this.wingR.scale.x = 1 - (1 - fold) * 0.35
    }

    // 提示光跟随身体
    if (this.tellMesh) {
      this.tellMesh.position.set(this.px, -(this.body.y + this.body.h / 2), 3.2)
      if (this.tellMat.opacity > 0) {
        this.tellMat.opacity = Math.max(0, this.tellMat.opacity - dt * 1.4)
        this.tellMesh.visible = this.tellMat.opacity > 0.02
      }
    }

    if (!p || p.dead) {
      this._enter('perch')
      const perch = this._perchPoint()
      this._moveTowards(perch.x, perch.y + Math.sin(this.hoverPhase * 0.6) * 6, this.speed * 0.7, dt)
      this.playAnim('idle')
      return
    }

    // 受击：往上窜一下再重新评估
    if (this.hurtT > 0) {
      this._moveTowards(this.px - this.facing * 40, this.py - 70, this.speed * 1.3, dt)
      this.playAnim('hurt')
      return
    }

    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)
    const perch = this._perchPoint()

    if (!sees && (this.state === 'perch' || this.state === 'relocate')) {
      this._enter('relocate')
      this._moveTowards(perch.x, perch.y + Math.sin(this.hoverPhase * 0.7) * 8, this.speed * 0.75, dt)
      this.playAnim(Math.abs(this.body.vy) > 20 ? 'run' : 'idle')
      return
    }

    if (!sees && (this.state === 'circle' || this.state === 'pullup')) {
      this._enter('relocate')
      this._moveTowards(perch.x, perch.y, this.speed * 0.8, dt)
      this.playAnim('run')
      return
    }

    switch (this.state) {
      case 'perch':
      case 'relocate': {
        // 发现玩家：起飞
        this._enter('circle')
        this.circleT = CIRCLE_T_MIN + Math.random() * (CIRCLE_T_MAX - CIRCLE_T_MIN)
        this._sfx('growl', 0.26, 1.55)
        break
      }

      case 'circle': {
        this.angle += dt * 2.1 * this.orbitDir
        const tx = p.centerX + Math.cos(this.angle) * this.orbitR
        const ty = p.centerY - 105 + Math.sin(this.angle * 1.7) * 26
        this._moveTowards(tx, ty, this.speed, dt)
        this.playAnim('run')

        this.circleT -= dt
        if (this.hurtT <= 0 && this.circleT <= 0) {
          this._enter('diveWind')
          this._showTell(0.5)
          this._sfx('growl', 0.32, 1.85)
          this._puff(4, 0xb7924f, 0.7)
        }
        break
      }

      case 'diveWind': {
        // 悬停蓄势：轻微上抬，翼收紧
        this._moveTowards(this.px, this.py - 18, this.speed * 0.35, dt)
        this.tellMat && (this.tellMat.opacity = 0.35 + Math.sin(this.stateT * 30) * 0.25)
        this.tellMesh && (this.tellMesh.visible = true)
        if (this.stateT >= DIVE_WIND) {
          this.diveHit = false
          this.diveTarget = { x: p.centerX, y: p.centerY }
          this._enter('dive')
          this._showTell(0.18)
          this._sfx('growl', 0.42, 2.1)
        }
        break
      }

      case 'dive': {
        this._moveTowards(this.diveTarget.x, this.diveTarget.y, DIVE_SPEED, dt)
        this.playAnim('attack')
        if (!this.diveHit && this._overlapsPlayer()) {
          this.diveHit = true
          this.hitPlayer(this.damage)
          this._puff(6, 0x8d3a34, 0.9)
          this.game.shake?.(0.12)
        }
        // 冲过头 / 咬到 / 撞地 → 拉起
        const reached = Math.hypot(this.diveTarget.x - this.px, this.diveTarget.y - this.py) < 12
        const hitWall = this.body.wallDir !== 0
        if (this.stateT > 0.5 || reached || hitWall) {
          this._enter('pullup')
          if (!this.diveHit) this._sfx('splash', 0.12, 1.7)
        }
        break
      }

      case 'pullup': {
        const tx = p.centerX - this.facing * 40
        const ty = p.centerY - 150
        this._moveTowards(tx, ty, this.speed * 1.15, dt)
        this.playAnim('run')
        if (this.stateT >= PULLUP_T) {
          this.orbitDir = Math.random() < 0.5 ? -1 : 1
          this.circleT = CIRCLE_T_MIN + Math.random() * (CIRCLE_T_MAX - CIRCLE_T_MIN)
          this._enter('circle')
        }
        break
      }

      default:
        this._enter('circle')
        break
    }
  }

  die() {
    this._showTell(0)
    super.die()
  }
}

export const CLASS = Wingrat
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
