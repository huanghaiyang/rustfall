import * as THREE from 'three'
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 喷酸者 —— 远程风筝手（beast）。
 *
 * 核心 AI：kite。玩家逼近到 150px 内就后退（贴墙时改为后跳），
 * 250~310px 是最舒服的射击距离；到了这个区间就停下抛射酸液。
 *
 * 攻击：0.45s 前摇（喉咙发绿光 + 低吼）→ 抛射一枚带重力的酸液弹，
 * 落点形成 2.6s 的酸池，池内每 0.5s 掉一次血。抛射角与初速按玩家的
 * 提前量解算（不是直射），所以横向移动可以躲开。
 *
 * 弹道优先交给引擎：game.spawnProjectile(spec)；引擎没实现时用本文件
 * 内部的简化弹道 + 毒池兜底，保证行为一致。
 */

export const DEF = {
  id: 'spitter',
  name: '喷酸者',
  en: 'SPITTER',
  family: 'beast',
  hp: 48,
  speed: 54,
  damage: 14,
  size: [44, 36],
  aggro: 430,
  attackRange: 330,
  attackType: 'spit',
  attackCooldown: 2.3,
  xp: 10,
  gravity: 2000,
  loot: [
    { id: 'chemical', chance: 0.7, min: 1, max: 2 },
    { id: 'rubber', chance: 0.3 },
    { id: 'rad_meds', chance: 0.15 },
    { id: 'cloth', chance: 0.25 },
  ],
  artId: 'spitter',
  sound: 'growl',
  biome: ['dump', 'factory'],
  desc: '喉囊鼓起来的时候，它其实是在算抛物线。别站在落点上。',
}

const WINDUP_T = 0.45
const SHOT_GRAVITY = 900
const POOL_T = 2.4
const POOL_R = 36
const POOL_TICK = 0.55
const POOL_TICK_DMG = 3
const PREFERRED_MIN = 150 // 更近就后退
const PREFERRED_MAX = 300 // 更远就靠近

export class Spitter extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.shots = []
    this.pools = []
    this.strafeDir = Math.random() < 0.5 ? -1 : 1
    this.strafeT = 1.2 + Math.random() * 1.4
    this.hopCd = 0
    this.tellT = 0
    // shotGeo 由 buildExtraVisual() 创建（super() 内已执行），此处不要再赋 null
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 喉囊：挂在贴图上的绿色光点，蓄力时鼓大
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9ad24a,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.throatMat = mat
    this.throat = new THREE.Mesh(new THREE.CircleGeometry(8, 12), mat)
    this.throat.position.set(13, -4, 0.3)
    this.mesh.add(this.throat)
    this.shotGeo = new THREE.CircleGeometry(6, 10)
  }

  // ------------------------------------------------------------------ 工具
  _sfx(name, vol, rate) {
    // 允许 _sfx('growl', 0.3, 1.2) 与 _sfx('growl', { vol, rate }) 两种写法
    const opts = vol && typeof vol === 'object' ? vol : { vol, rate }
    this.game.sfx?.(name, opts)
  }

  _spray(x, y) {
    const parts = this.game.particles
    if (!parts || typeof parts.emit !== 'function') return
    parts.emit('splash', x, y, {
      vx: (Math.random() - 0.5) * 70,
      vy: -Math.random() * 40,
      life: 0.25 + Math.random() * 0.2,
      size: 0.5 + Math.random() * 0.5,
      color: 0x9ad24a,
    })
  }

  _splashBurst(x, y, n = 8) {
    for (let i = 0; i < n; i++) this._spray(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 10)
  }

  _destroyShot(i) {
    const s = this.shots[i]
    if (!s) return
    this.group.remove(s.mesh)
    s.mat.dispose()
    this.shots.splice(i, 1)
  }

  // ------------------------------------------------------------------ 弹道
  /** 按飞行时间反解初速，做一条真正吃重力的弧线 */
  _solveArc(sx, sy, tx, ty) {
    const dist = Math.hypot(tx - sx, ty - sy)
    const T = Math.min(1.35, Math.max(0.5, dist / 260))
    return {
      vx: (tx - sx) / T,
      vy: (ty - sy - 0.5 * SHOT_GRAVITY * T * T) / T,
      T,
    }
  }

  _fire() {
    const p = this.player
    if (!p) return
    const sx = this.px + this.facing * 18
    const sy = this.py - 8
    // 提前量：按玩家水平速度预测一点点（可被反向跑动骗过）
    const lead = 0.35
    const tx = p.centerX + (p.body?.vx ?? 0) * lead
    const ty = p.centerY
    const arc = this._solveArc(sx, sy, tx, ty)
    const spec = {
      x: sx,
      y: sy,
      vx: arc.vx,
      vy: arc.vy,
      gravity: SHOT_GRAVITY,
      radius: 7,
      damage: this.damage,
      type: 'acid',
      source: this.id,
      owner: this,
      from: this,
      onLand: (hx, hy) => this._makePool(hx, hy),
    }

    let handled = false
    if (typeof this.game.spawnProjectile === 'function') {
      try {
        handled = !!this.game.spawnProjectile(spec)
      } catch (err) {
        handled = false
      }
    }
    if (!handled) this._spawnLocalShot(sx, sy, arc.vx, arc.vy)
    this._sfx('splash', { vol: 0.3, rate: 1.35 })
    this._splashBurst(sx, sy, 5)
  }

  _spawnLocalShot(x, y, vx, vy) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa8d64f,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(this.shotGeo, mat)
    mesh.renderOrder = 6
    mesh.position.set(x, -y, 3.2)
    this.group.add(mesh)
    this.shots.push({ mesh, mat, x, y, vx, vy, t: 0 })
  }

  _updateShots(dt) {
    const map = this.map
    const p = this.player
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.t += dt
      s.vy += SHOT_GRAVITY * dt
      const prevX = s.x
      const prevY = s.y
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.mesh.position.set(s.x, -s.y, 3.2)
      s.mesh.rotation.z += dt * 7
      if (Math.random() < dt * 22) this._spray(s.x, s.y)

      let hitPlayer = false
      if (p && !p.dead) {
        const dx = p.centerX - s.x
        const dy = p.centerY - s.y
        hitPlayer = dx * dx + dy * dy < 26 * 26
      }
      const hitGround = (map && map.solidAt(s.x, s.y)) || s.t > 3.2
      if (!hitPlayer && !hitGround) continue

      if (hitPlayer && p && !p.dead && !(p.invuln > 0)) {
        if (typeof p.takeDamage === 'function') p.takeDamage(this.damage, this.px)
        else this.hitPlayer(this.damage)
      }
      const hx = hitPlayer ? s.x : (prevX + s.x) * 0.5
      const hy = hitPlayer ? s.y : (prevY + s.y) * 0.5
      this._makePool(hx, hy)
      this._destroyShot(i)
    }
    this._updatePools(dt)
  }

  // ------------------------------------------------------------------ 酸池
  _makePool(x, y) {
    const map = this.map
    let gy = y
    if (map && typeof map.groundBelow === 'function') {
      const g = map.groundBelow(x, y - 10, 110)
      if (g != null) gy = g
    }
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8fbf4a,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(POOL_R, 14), mat)
    mesh.renderOrder = 3.5
    mesh.scale.y = 0.42
    mesh.position.set(x, -gy + 3, 3)
    this.group.add(mesh)
    this.pools.push({ x, y: gy, t: POOL_T, tick: 0, mesh, mat, r: POOL_R })
    this._splashBurst(x, gy, 10)
    this._sfx('splash', { vol: 0.32, rate: 1.05 })
  }

  _updatePools(dt) {
    const p = this.player
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const q = this.pools[i]
      q.t -= dt
      q.tick -= dt
      const k = Math.max(0, q.t / POOL_T)
      q.mat.opacity = 0.12 + k * 0.22 + Math.sin(q.t * 9) * 0.04
      const sc = 1 + Math.sin(q.t * 7) * 0.06
      q.mesh.scale.set(sc, sc * 0.42, 1)
      if (q.tick <= 0) {
        q.tick = POOL_TICK
        if (p && !p.dead && !(p.invuln > 0)) {
          const dx = p.centerX - q.x
          const dy = p.centerY - q.y
          if (dx * dx + dy * dy <= q.r * q.r) {
            if (typeof p.takeDamage === 'function') p.takeDamage(POOL_TICK_DMG, q.x)
            this._spray(p.centerX, p.centerY)
          }
        }
      }
      if (q.t <= 0) {
        this.group.remove(q.mesh)
        q.mesh.geometry.dispose()
        q.mat.dispose()
        this.pools.splice(i, 1)
      }
    }
  }

  _clearAcid() {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      this.group.remove(this.shots[i].mesh)
      this.shots[i].mat.dispose()
    }
    this.shots.length = 0
    for (let i = this.pools.length - 1; i >= 0; i--) {
      this.group.remove(this.pools[i].mesh)
      this.pools[i].mesh.geometry.dispose()
      this.pools[i].mat.dispose()
    }
    this.pools.length = 0
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this.hopCd = Math.max(0, this.hopCd - dt)

    // 蓄力时喉囊鼓起来
    if (this.throatMat) {
      if (this.state === 'spitWind') {
        this.tellT += dt
        const k = Math.min(1, this.tellT / WINDUP_T)
        this.throatMat.opacity = 0.3 + k * 0.6 + Math.sin(this.tellT * 26) * 0.15
        this.throat.scale.setScalar(0.8 + k * 1.1)
      } else {
        this.tellT = Math.max(0, this.tellT - dt * 2)
        this.throatMat.opacity = Math.max(0.16, this.throatMat.opacity - dt * 1.6)
        this.throat.scale.setScalar(1 + Math.sin(this.stateT * 3) * 0.08)
      }
    }

    this._updateShots(dt)

    const p = this.player
    if (!p || p.dead) {
      this.state = 'idle'
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    if (this.hurtT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }

    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)
    this.facePlayer()

    if (this.state === 'spitWind') {
      this.vxTarget = 0
      this.playAnim('attack')
      if (this.stateT >= WINDUP_T) {
        this.state = 'idle'
        this.stateT = 0
        this.attackCd = this.def.attackCooldown ?? 2.3
        this._fire()
      }
      return
    }

    if (!sees) {
      this.state = 'idle'
      this.playAnim(Math.abs(this.body.vx) > 12 ? 'run' : 'idle')
      // 没看到玩家：慢悠悠地来回蹭，撞墙转向
      if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      this.vxTarget = this.facing * this.speed * 0.4
      if (Math.random() < dt * 0.5) this.vxTarget = 0
      return
    }

    // ---- kite 逻辑 ----
    this.strafeT -= dt
    if (this.strafeT <= 0) {
      this.strafeT = 1.2 + Math.random() * 1.6
      this.strafeDir *= -1
    }

    if (d < PREFERRED_MIN) {
      // 太近：后退；背后没地就原地后跳
      const back = -this.facing
      const canBack = this.groundAhead(back) && !this.wallAhead(back)
      if (canBack) {
        this.vxTarget = back * this.speed * 1.15
      } else {
        this.vxTarget = 0
        if (this.body.onGround && this.hopCd <= 0 && d < 110) {
          this.body.vy = -300
          this.body.vx = back * this.speed
          this.hopCd = 1.8
          this._sfx('growl', 0.3, 1.25)
        }
      }
      this.playAnim('run')
    } else if (d > PREFERRED_MAX) {
      this.vxTarget = this.facing * this.speed * 0.85
      if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
      this.playAnim('run')
    } else {
      // 舒适距离：横向游走，保持不好瞄准
      this.vxTarget = this.strafeDir * this.speed * 0.45
      if (this.wallAhead(this.strafeDir) || !this.groundAhead(this.strafeDir)) {
        this.strafeDir *= -1
        this.vxTarget = this.strafeDir * this.speed * 0.35
      }
      this.playAnim('idle')
    }

    // 开喷
    if (this.attackCd <= 0 && d <= this.attackRange && Math.abs(p.centerY - this.py) < 240) {
      this.state = 'spitWind'
      this.stateT = 0
      this.tellT = 0
      this.vxTarget = 0
      this.playAnim('attack')
      this._sfx('growl', 0.34, 1.2)
    }
  }

  // ------------------------------------------------------------------ 死亡
  die() {
    this._splashBurst(this.px, this.py, 12)
    this._clearAcid()
    super.die()
  }

  dispose() {
    this._clearAcid()
    super.dispose()
  }
}

export const CLASS = Spitter
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
