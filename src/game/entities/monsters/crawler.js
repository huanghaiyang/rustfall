import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 群居爬虫 —— 小、快、成群（beast）。
 *
 * 行为：待机时零散乱窜；发现玩家后从两侧包夹（每只分配自己的 orbit 半径与方向），
 * 贴近后快速扑咬；玩家站高处时会短跳扑上来。
 *
 * 群体联动：任何一只被击杀，附近 300px 内的同伴会「惊慌」约 2.4s——背向逃跑、
 * 不再攻击，然后才重新聚拢。这让清理虫群有节奏感，而不是无脑互殴。
 * 刷怪时由 director 读取 DEF.pack（3~5 只一组）。
 */

export const DEF = {
  id: 'crawler',
  name: '群居爬虫',
  en: 'CRAWLER',
  family: 'beast',
  hp: 22,
  speed: 132,
  damage: 8,
  size: [26, 18],
  aggro: 300,
  attackRange: 36,
  attackType: 'swarm',
  attackCooldown: 0.75,
  xp: 4,
  gravity: 2000,
  pack: [3, 5],
  loot: [
    { id: 'cloth', chance: 0.5 },
    { id: 'rubber', chance: 0.35 },
    { id: 'chemical', chance: 0.22 },
    { id: 'scrap_plate', chance: 0.3 },
  ],
  artId: 'crawler',
  sound: 'growl',
  biome: ['city', 'dump', 'factory'],
  desc: '一窝六条腿的东西。它们不聪明，但它们一起动。拍死一只，剩下的会先散开。',
}

const LIVING = new Set() // 同族在线表：死亡时通知附近同伴
const PANIC_RANGE = 300
const PANIC_TIME = 2.4
const HOP_IMPULSE = -330

export class Crawler extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    LIVING.add(this)
    this.orbitSide = Math.random() < 0.5 ? -1 : 1
    this.orbitR = 30 + Math.random() * 40
    this.orbitFlipT = 1.2 + Math.random() * 1.5
    this.panicT = 0
    this.panicDir = -1
    this.hopCd = 0
    this.pauseT = 0
    this.squirm = Math.random() * 6.28
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    this.antennaMat = new THREE.MeshBasicMaterial({ color: 0x6d7f86, toneMapped: false })
    this.antennaGeo = new THREE.PlaneGeometry(8, 2)
    const a = new THREE.Mesh(this.antennaGeo, this.antennaMat)
    a.position.set(7, 12, 0.3)
    a.rotation.z = 0.6
    this.mesh.add(a)
    const b = new THREE.Mesh(this.antennaGeo, this.antennaMat)
    b.position.set(11, 9, 0.3)
    b.rotation.z = -0.9
    this.mesh.add(b)

    // 惊慌时背部泛红，提示玩家「它现在不打你」
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc2553f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.panicMat = mat
    this.panicMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 28), mat)
    this.panicMesh.renderOrder = 6
    this.panicMesh.visible = false
    this.group.add(this.panicMesh)
  }

  // ------------------------------------------------------------------ 工具
  _sfx(name, vol, rate) {
    this.game.sfx?.(name, { vol, rate })
  }

  _puff(n, color = 0x93a8b2, size = 1) {
    const parts = this.game.particles
    if (!parts || typeof parts.emit !== 'function') return
    for (let i = 0; i < n; i++) {
      parts.emit('dust', this.px + (Math.random() - 0.5) * this.w, this.body.y + this.body.h, {
        vx: (Math.random() - 0.5) * 90,
        vy: -Math.random() * 40,
        life: 0.22 + Math.random() * 0.22,
        size: size * (0.5 + Math.random() * 0.6),
        color,
      })
    }
  }

  /** 同伴死亡时被调用：背向逃跑一小段时间 */
  panic(seconds = PANIC_TIME) {
    if (!this.alive) return
    this.panicT = Math.max(this.panicT, seconds)
    this.panicDir = this.player && this.player.centerX > this.px ? -1 : 1
    this.state = 'panic'
    this.stateT = 0
    this.attackCd = 1.2
    this.playAnim('run')
    this._sfx('hurt', 0.18, 1.6)
  }

  _skitter(dt) {
    this.playAnim(Math.abs(this.body.vx) > 10 ? 'run' : 'idle')
    this.pauseT -= dt
    if (this.pauseT > 0) {
      this.vxTarget = 0
      return
    }
    if (this.wallAhead() || !this.groundAhead()) {
      this.facing *= -1
      this.pauseT = 0.15 + Math.random() * 0.3
    }
    this.vxTarget = this.facing * this.speed * 0.5
    if (Math.random() < dt * 1.4) this.pauseT = 0.2 + Math.random() * 0.7
  }

  /** 包夹：以玩家为圆心、各自不同的半径/方向选一个目标点 */
  _orbitTarget(p, dt) {
    this.orbitFlipT -= dt
    if (this.orbitFlipT <= 0) {
      this.orbitFlipT = 1.4 + Math.random() * 1.6
      this.orbitSide *= -1
    }
    const wobble = Math.sin(this.stateT * 1.7 + this.squirm) * 12
    const side = this.orbitSide
    return {
      x: p.centerX + side * (this.orbitR + wobble),
      y: p.centerY + 6 - this.orbitR * 0.22,
    }
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this.hopCd = Math.max(0, this.hopCd - dt)

    // 惊慌：背向玩家跑，不攻击
    if (this.panicT > 0) {
      this.panicT -= dt
      const p = this.player
      if (p && !p.dead) {
        this.panicDir = p.centerX > this.px ? -1 : 1
        this.facing = this.panicDir
        this.vxTarget = this.panicDir * this.speed * 1.5
        if (this.wallAhead() || !this.groundAhead()) {
          if (this.body.onGround && this.hopCd <= 0) {
            this.body.vy = HOP_IMPULSE * 0.9
            this.hopCd = 1.1
          } else {
            this.facing *= -1
            this.vxTarget = -this.vxTarget
          }
        }
      } else {
        this.vxTarget = this.panicDir * this.speed * 1.3
      }
      this.playAnim('run')
      if (this.panicMat) {
        this.panicMat.opacity = 0.22 + Math.sin(this.stateT * 12) * 0.1
        this.panicMesh.visible = true
        this.panicMesh.position.set(this.px, -(this.body.y + this.body.h / 2), 3.2)
      }
      if (this.panicT <= 0) {
        this.state = 'idle'
        this.stateT = 0
      }
      return
    }
    if (this.panicMat && this.panicMesh.visible) {
      this.panicMat.opacity = Math.max(0, this.panicMat.opacity - dt * 2)
      this.panicMesh.visible = this.panicMat.opacity > 0.02
    }

    const p = this.player
    if (!p || p.dead) {
      this.state = 'skitter'
      this._skitter(dt)
      return
    }

    if (this.hurtT > 0) {
      this.vxTarget *= 0.2
      this.playAnim('hurt')
      return
    }

    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)

    if (!sees) {
      this.state = 'skitter'
      this._skitter(dt)
      return
    }

    this.state = 'swarm'
    this.facePlayer()

    // 玩家站高处 → 短跳扑上去
    if (p.centerY < this.py - 26 && d < 132 && this.body.onGround && this.hopCd <= 0) {
      this.body.vy = HOP_IMPULSE
      this.hopCd = 1.25
      this._puff(4, 0x9aa8ad, 0.7)
      this._sfx('growl', 0.16, 1.7)
    }

    // 近身扑咬
    if (d <= this.attackRange + 6) {
      this.vxTarget = this.facing * this.speed * 0.4
      this.tryAttack()
      return
    }

    // 包夹：走向自己的环绕位
    const tgt = this._orbitTarget(p, dt)
    const dx = tgt.x - this.px
    const dir = dx > 2 ? 1 : dx < -2 ? -1 : this.facing
    this.facing = dir
    let want = dir * this.speed
    // 别冲进玩家身体里：距离小于 26 时往外撤半步
    if (d < 26) want = -dir * this.speed * 0.6
    if (this.wallAhead(dir) || !this.groundAhead(dir)) want = 0
    this.vxTarget = want
    this.playAnim('run')

    if (this.attackCd <= 0 && d <= this.attackRange + 16) this.tryAttack()
  }

  // ------------------------------------------------------------------ 攻击
  performAttack() {
    const p = this.player
    if (!p) return
    this.facePlayer()
    this.body.vx = this.facing * 200
    this.hitPlayer(this.damage)
    this._puff(3, 0x8d3a34, 0.8)
    this._sfx('growl', 0.2, 1.5)
  }

  // ------------------------------------------------------------------ 死亡 / 群体联动
  die() {
    if (!this.alive) return
    LIVING.delete(this)
    // 通知附近同伴惊慌逃跑
    for (const other of LIVING) {
      if (other === this || !other.alive) continue
      const dx = other.px - this.px
      const dy = other.py - this.py
      if (dx * dx + dy * dy <= PANIC_RANGE * PANIC_RANGE) other.panic(PANIC_TIME)
    }
    if (this.panicMesh) this.panicMesh.visible = false
    super.die()
  }

  dispose() {
    LIVING.delete(this)
    super.dispose()
  }
}

export const CLASS = Crawler
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
