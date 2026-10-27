import * as THREE from 'three'
import { BaseMonster } from '../base.js'
import { Content, KIND } from '../../../core/registry.js'
import {
  initLarge,
  applyLargeArt,
  playIntro,
  updateActivation,
  roamStep,
  aoe,
  puff,
  spark,
  sfx,
  shake,
  createTell,
  placeTell,
  showTell,
  disposeTell,
  largeDeathFx,
  roomBounds,
  clamp,
} from './common.js'

/**
 * 废弃垃圾组合体 —— 大型（beast/rogue 混合体，本作算 rogue）。
 *
 * 多阶段：
 *   阶段 1（双腿完好）  逼近 → 抡击（0.55s 前摇 + 地面金环）震地 AoE；
 *                       远距离拆下背上部件抛掷（落地成可回收部件）。
 *   阶段 2（断一条腿）  必定趴下 5s（可处决窗口，受到 2.2 倍伤害），
 *                       起身后瘸腿：速度 ×0.65、不能再抛掷。
 *   阶段 3（双断 / 残血）双腿全断会一直趴着直到被处决；残血进入暴怒，
 *                       抡击半径与抛掷频率提升。
 *
 * 弱点：两条腿。攻击落点（fromX）靠近哪条腿就砍哪条腿（腿吃全额伤害、
 *       身体只吃 35%）。被砸下来的部件掉在地上，它会在你不注意时走过去捡回来。
 *
 * 死亡：炸成一地战利品（基类掉落表 + 额外废铁）。
 */

export const DEF = {
  id: 'junk_golem',
  name: '废弃垃圾组合体',
  en: 'JUNK GOLEM',
  family: 'rogue',
  hp: 520,
  speed: 54,
  damage: 30,
  size: [140, 170],
  aggro: 560,
  attackRange: 150,
  attackType: 'melee',
  attackCooldown: 2.2,
  xp: 140,
  gravity: 2000,
  elite: true,
  loot: [
    { id: 'scrap_plate', chance: 1, min: 3, max: 5 },
    { id: 'aluminum_sheet', chance: 0.9, min: 1, max: 2 },
    { id: 'copper_wire', chance: 0.8, min: 2, max: 3 },
    { id: 'bearing', chance: 0.6 },
    { id: 'servo_motor', chance: 0.55 },
    { id: 'hydraulic_rod', chance: 0.45 },
    { id: 'rare_earth', chance: 0.3 },
    { id: 'repair_kit', chance: 0.25 },
  ],
  artId: 'junk_golem',
  sound: 'thunder',
  biome: ['dump', 'factory', 'city'],
  desc: '集装箱、卷帘门、半辆车，还有谁的一条手臂。它把自己拼起来了，还差两条腿。',
}

const LEG_HP = 62
const SLAM_WIND = 0.55
const SLAM_RADIUS = 118
const SLAM_DAMAGE = 26
const THROW_WIND = 0.55
const THROW_RANGE = 560
const DOWN_DURATION = 5.0
const DOWN_MUL = 2.2
const BODY_LEG_SHARE = 0.35

export class JunkGolem extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.legs = [
      { side: -1, hp: LEG_HP, maxHp: LEG_HP, broken: false },
      { side: 1, hp: LEG_HP, maxHp: LEG_HP, broken: false },
    ]
    this.partsLeft = 3
    this.groundParts = []
    this.partShots = []
    this.throwCd = 2.4
    this.slamCd = 1.2
    this.downedT = 0
    this.downedDur = 0
    this.brokenCount = 0
    this.enraged = false
    this.baseSpeed = DEF.speed
    initLarge(this, { intro: 1.3, activateRange: 720 })
    applyLargeArt(this)
    this.tell = createTell(this, { inner: 40, outer: 62, color: 0xe5a33c })
    this.throwTell = createTell(this, { inner: 30, outer: 46, color: 0x9fd3e0 })
    this.groundPartGeo = new THREE.PlaneGeometry(30, 16)
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 注意：buildExtraVisual 在 super() 内部执行，早于构造函数体 —— 这里用到的数组必须就地初始化
    this.legMeshes = []
    this.parts = []
    this.waves = []
    // 腿（世界坐标，每帧重排；断腿会变暗+歪倒）
    const legMat = new THREE.MeshBasicMaterial({ color: 0x7a6d5c, toneMapped: false })
    this.legMatA = new THREE.MeshBasicMaterial({ color: 0x7a6d5c, toneMapped: false })
    this.legMatB = new THREE.MeshBasicMaterial({ color: 0x7a6d5c, toneMapped: false })
    const geo = new THREE.PlaneGeometry(26, 58)
    const a = new THREE.Mesh(geo, this.legMatA)
    const b = new THREE.Mesh(geo, this.legMatB)
    a.renderOrder = 4
    b.renderOrder = 4
    this.group.add(a)
    this.group.add(b)
    this.legMeshes.push({ mesh: a, mat: this.legMatA, side: -1 })
    this.legMeshes.push({ mesh: b, mat: this.legMatB, side: 1 })
    this.legGeo = geo
    this.legMat = legMat

    // 背上待抛掷的部件
    const pGeo = new THREE.PlaneGeometry(34, 15)
    this.partGeo = pGeo
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8a7f6a, toneMapped: false })
      const mesh = new THREE.Mesh(pGeo, mat)
      mesh.renderOrder = 5
      this.group.add(mesh)
      this.parts.push({ mesh, mat, hidden: false })
    }

    // 核心（趴下时暴露的弱点）
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xc2553f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.coreMat = coreMat
    this.coreMesh = new THREE.Mesh(new THREE.CircleGeometry(17, 12), coreMat)
    this.coreMesh.renderOrder = 5
    this.group.add(this.coreMesh)
  }

  // ------------------------------------------------------------------ 工具
  _updateVisuals(dt) {
    const feet = this.body.y + this.body.h
    for (const leg of this.legMeshes) {
      const legState = this.legs.find((l) => l.side === leg.side)
      const x = this.px + leg.side * this.w * 0.34
      leg.mesh.position.set(x, -feet + 29, 3.9)
      leg.mesh.rotation.z = legState && legState.broken ? leg.side * 1.1 : 0
      leg.mat.color.setHex(legState && legState.broken ? 0x5a4038 : 0x7a6d5c)
    }
    // 背上的部件跟着身体
    let slot = 0
    for (const p of this.parts) {
      if (p.hidden) {
        p.mesh.visible = false
        continue
      }
      p.mesh.visible = true
      p.mesh.position.set(this.px - this.facing * 12 + slot * 10 - 10, -feet + this.h * 0.72 - slot * 9, 4.2)
      p.mesh.rotation.z = -this.facing * (0.12 + slot * 0.1)
      slot++
    }
    // 核心
    if (this.coreMat) {
      const down = this.state === 'downed'
      this.coreMat.opacity = down ? 0.35 + Math.sin(this.stateT * 9) * 0.25 : 0
      this.coreMesh.visible = this.coreMat.opacity > 0.03
      this.coreMesh.position.set(this.px, -feet + this.h * 0.45, 4.4)
    }
    // 提示环
    if (this.tell) {
      placeTell(this.tell, this.px, feet + 2, 1)
      if (this.tell.mat.opacity > 0) showTell(this.tell, Math.max(0, this.tell.mat.opacity - dt * 1.8))
    }
    if (this.throwTell) {
      placeTell(this.throwTell, this.px, feet + 2, 1)
      if (this.throwTell.mat.opacity > 0) showTell(this.throwTell, Math.max(0, this.throwTell.mat.opacity - dt * 1.8))
    }
    this._updateWaves(dt)
  }

  _ring(x, y, radius, color = 0xe5a33c) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 8, radius, 26, 1), mat)
    mesh.position.set(x, -y + 3, 3.3)
    mesh.scale.setScalar(0.12)
    this.group.add(mesh)
    this.waves.push({ mesh, mat, t: 0 })
  }

  _updateWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      w.t += dt
      const k = Math.min(1, w.t / 0.42)
      w.mesh.scale.setScalar(0.12 + k * 0.88)
      w.mat.opacity = 0.7 * (1 - k)
      if (w.t >= 0.44) {
        this.group.remove(w.mesh)
        w.mesh.geometry.dispose()
        w.mat.dispose()
        this.waves.splice(i, 1)
      }
    }
  }

  _feetY() {
    return this.body.y + this.body.h
  }

  _horizDist() {
    const p = this.player
    if (!p) return Infinity
    return Math.abs(p.centerX - this.px)
  }

  _clearGroundParts() {
    for (const g of this.groundParts) {
      this.group.remove(g.mesh)
      g.mat.dispose()
    }
    this.groundParts.length = 0
    for (let i = this.partShots.length - 1; i >= 0; i--) {
      this.group.remove(this.partShots[i].mesh)
      this.partShots[i].mat.dispose()
    }
    this.partShots.length = 0
  }

  // ------------------------------------------------------------------ 攻击
  _slam() {
    const feet = this._feetY()
    const radius = this.enraged ? SLAM_RADIUS + 24 : SLAM_RADIUS
    const dmg = this.enraged ? SLAM_DAMAGE + 6 : SLAM_DAMAGE
    this._ring(this.px, feet, radius)
    aoe(this, this.px, feet - 12, radius, dmg)
    puff(this, 18, 0x6b5f55, 1.4)
    spark(this, this.px, feet - 20, 0xe5a33c, 12, 260)
    shake(this, 0.55)
    sfx(this, 'thunder', 0.5, 1.1)
  }

  _throwPart() {
    const p = this.player
    if (!p) return false
    const part = this.parts.find((x) => !x.hidden)
    if (!part) return false
    part.hidden = true
    this.partsLeft = this.parts.filter((x) => !x.hidden).length

    const sx = this.px
    const sy = this._feetY() - this.h * 0.66
    const tx = p.centerX
    const ty = p.centerY
    const g = 1100
    const dist = Math.hypot(tx - sx, ty - sy)
    const T = clamp(dist / 420, 0.35, 0.95)
    const vx = (tx - sx) / T
    const vy = (ty - sy - 0.5 * g * T * T) / T
    const dmg = this.enraged ? DEF.damage * 0.9 : DEF.damage * 0.75

    let handled = false
    const engine = this.game
    if (engine && typeof engine.spawnProjectile === 'function') {
      try {
        handled = !!engine.spawnProjectile({
          x: sx,
          y: sy,
          vx,
          vy,
          damage: dmg,
          radius: 15,
          color: 0x8a7f6a,
          gravity: g,
          life: 3.2,
          onLand: (hx, hy) => this._spawnGroundPart(hx, hy),
        })
      } catch (e) {
        handled = false
      }
    }
    if (!handled) this._spawnLocalPartShot(sx, sy, vx, vy)
    spark(this, sx, sy, 0xe5a33c, 8, 200)
    sfx(this, 'growl', 0.4, 0.9)
    return true
  }

  _spawnLocalPartShot(x, y, vx, vy) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a7f6a, toneMapped: false })
    const mesh = new THREE.Mesh(this.partGeo, mat)
    mesh.renderOrder = 5
    mesh.position.set(x, -y, 4.3)
    this.group.add(mesh)
    this.partShots.push({ x, y, vx, vy, t: 0, mesh, mat })
  }

  _updatePartShots(dt) {
    const map = this.map
    for (let i = this.partShots.length - 1; i >= 0; i--) {
      const s = this.partShots[i]
      s.t += dt
      s.vy += 1100 * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.mesh.position.set(s.x, -s.y, 4.3)
      s.mesh.rotation.z += dt * 9
      const p = this.player
      let hitPlayer = false
      if (p && !p.dead) {
        const dx = p.centerX - s.x
        const dy = p.centerY - s.y
        hitPlayer = dx * dx + dy * dy < 30 * 30
      }
      const hitGround = (map && map.solidAt(s.x, s.y)) || s.t > 3
      if (!hitPlayer && !hitGround) continue
      if (hitPlayer && p && !(p.invuln > 0) && typeof p.takeDamage === 'function') {
        p.takeDamage(DEF.damage * 0.75, this.px)
      }
      this._spawnGroundPart(s.x, Math.min(s.y, this._feetY()))
      this.group.remove(s.mesh)
      s.mat.dispose()
      this.partShots.splice(i, 1)
    }
  }

  _spawnGroundPart(x, y) {
    const feet = this._feetY()
    const gy = Math.min(y + 18, feet)
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a7f6a, toneMapped: false })
    const mesh = new THREE.Mesh(this.groundPartGeo, mat)
    mesh.renderOrder = 4.5
    mesh.position.set(x, -gy + 8, 4)
    this.group.add(mesh)
    this.groundParts.push({ x, y: gy, mesh, mat, age: 0 })
    puff(this, 8, 0x93a8b2, 1)
    spark(this, x, gy, 0xe5a33c, 5, 140)
  }

  _tryPickupPart(dt) {
    for (let i = this.groundParts.length - 1; i >= 0; i--) {
      const g = this.groundParts[i]
      g.age += dt
      g.mesh.rotation.z += dt * 1.4
      if (g.age > 26) {
        this.group.remove(g.mesh)
        g.mat.dispose()
        this.groundParts.splice(i, 1)
        continue
      }
      if (Math.abs(g.x - this.px) < 48) {
        // 捡回来了：补部件 + 回血
        const part = this.parts.find((x) => x.hidden)
        if (part) part.hidden = false
        this.partsLeft = this.parts.filter((x) => !x.hidden).length
        this.hp = Math.min(this.maxHp, this.hp + 22)
        spark(this, this.px, this._feetY() - 40, 0x9fd3e0, 10, 180)
        sfx(this, 'hurt', 0.3, 0.8)
        this.group.remove(g.mesh)
        g.mat.dispose()
        this.groundParts.splice(i, 1)
      }
    }
  }

  _nearestGroundPart() {
    let best = null
    let bd = Infinity
    for (const g of this.groundParts) {
      const d = Math.abs(g.x - this.px)
      if (d < bd) {
        bd = d
        best = g
      }
    }
    return best ? { part: best, d: bd } : null
  }

  // ------------------------------------------------------------------ 部位
  _breakLeg(leg) {
    leg.broken = true
    leg.hp = 0
    this.brokenCount = this.legs.filter((l) => l.broken).length
    this.downedDur = this.brokenCount >= 2 ? Infinity : DOWN_DURATION
    this.downedT = 0
    this.state = 'downed'
    this.stateT = 0
    this.vxTarget = 0
    this.throwCd = Math.max(this.throwCd, 1.5)
    this.mesh.rotation.z = this.facing * -0.32
    spark(this, this.px + leg.side * this.w * 0.34, this._feetY() - 20, 0xffd0b0, 18, 300)
    puff(this, 14, 0x6b5f55, 1.3)
    shake(this, 0.45)
    sfx(this, 'thunder', 0.45, 1.25)
    // 断腿会甩掉一个部件
    const part = this.parts.find((x) => !x.hidden)
    if (part) {
      part.hidden = true
      this.partsLeft = this.parts.filter((x) => !x.hidden).length
      this._spawnGroundPart(this.px + leg.side * 70, this._feetY() - 10)
    }
  }

  _getUp() {
    const leg = this.legs.find((l) => l.broken)
    if (leg) {
      leg.broken = false
      leg.hp = Math.round(leg.maxHp * 0.5)
    }
    this.brokenCount = this.legs.filter((l) => l.broken).length
    this.state = 'alert'
    this.stateT = 0
    this.mesh.rotation.z = 0
    this.speed = this.baseSpeed * (this.brokenCount > 0 ? 0.65 : 1)
    puff(this, 14, 0x93a8b2, 1.3)
    sfx(this, 'growl', 0.55, 0.85)
    shake(this, 0.25)
  }

  // ------------------------------------------------------------------ 伤害
  takeDamage(n, fromX = null) {
    if (!this.alive) return
    const downed = this.state === 'downed'
    let dmg = downed ? n * DOWN_MUL : n

    // 腿部弱点：攻击落点靠近某条腿就砍腿
    let targetLeg = null
    let brokeLeg = false
    if (!downed && fromX != null) {
      for (const leg of this.legs) {
        if (leg.broken) continue
        const lx = this.px + leg.side * this.w * 0.34
        if (Math.abs(fromX - lx) <= 34) {
          targetLeg = leg
          break
        }
      }
    }

    if (targetLeg) {
      targetLeg.hp -= n
      dmg = n * BODY_LEG_SHARE
      spark(this, this.px + targetLeg.side * this.w * 0.34, this._feetY() - 26, 0x9fd3e0, 7, 180)
      sfx(this, 'hurt', 0.35, 0.9)
      if (targetLeg.hp <= 0) {
        this._breakLeg(targetLeg)
        brokeLeg = true
      }
    }

    super.takeDamage(dmg, fromX)

    if (brokeLeg && this.alive) {
      // 基类受击会把 state 改成 hurt，这里钉回「趴下」状态
      this.state = 'downed'
      this.stateT = 0
      this.vxTarget = 0
      this.hurtT = 0
    }

    if (this.alive && !this.enraged && this.hp / this.maxHp <= 0.35) {
      this.enraged = true
      this.speed = this.baseSpeed * 1.12
      sfx(this, 'growl', 0.7, 0.6)
      shake(this, 0.35)
      puff(this, 18, 0xb7924f, 1.4)
    }
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this._updateVisuals(dt)
    this._updatePartShots(dt)
    this._tryPickupPart(dt)
    this.throwCd = Math.max(0, this.throwCd - dt)
    this.slamCd = Math.max(0, this.slamCd - dt)

    if (playIntro(this, dt)) return

    if (this.stunT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }
    if (this.hurtT > 0 && this.state !== 'downed') {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }

    const p = this.player
    const active = updateActivation(this, dt)
    if (!p || p.dead) {
      this.state = 'roam'
      roamStep(this, dt, { speedMul: 0.5 })
      return
    }

    const hd = this._horizDist()
    const los = this.hasLineOfSight(p.centerX, p.centerY)
    if (!active) {
      this.state = 'roam'
      roamStep(this, dt, { speedMul: 0.5 })
      return
    }

    switch (this.state) {
      case 'downed': {
        this.vxTarget = 0
        this.facePlayer()
        this.playAnim('hurt')
        this.downedT += dt
        if (this.coreMat) this.coreMat.opacity = 0.3 + Math.sin(this.stateT * 8) * 0.25
        if (this.downedT >= this.downedDur) this._getUp()
        break
      }

      case 'downedGetUp': {
        this.vxTarget = 0
        this.playAnim('idle')
        if (this.stateT > 1.1) {
          this.state = 'alert'
          this.stateT = 0
        }
        break
      }

      case 'alert': {
        this.vxTarget = 0
        this.facePlayer()
        this.playAnim('attack')
        if (this.stateT > 0.45) {
          this.state = 'chase'
          this.stateT = 0
        }
        break
      }

      case 'chase': {
        this.facePlayer()
        this.playAnim('run')

        // 断腿后优先去捡部件（玩家离部件远时才敢去）
        const near = this._nearestGroundPart()
        if (near && this.brokenCount < 2) {
          const pDistToPart = p ? Math.abs(p.centerX - near.part.x) : Infinity
          if (pDistToPart > 130 && near.d < 460) {
            this.state = 'pickup'
            this.stateT = 0
            break
          }
        }

        if (hd < (this.enraged ? 190 : 170) && this.slamCd <= 0 && Math.abs(p.centerY - this._feetY()) < 140) {
          this.state = 'slamWind'
          this.stateT = 0
          this.vxTarget = 0
          this.slamCd = this.enraged ? 2.1 : 2.8
          this.playAnim('attack')
          showTell(this.tell, 0.55)
          sfx(this, 'growl', 0.45, 0.85)
          break
        }

        if (
          this.partsLeft > 0 &&
          this.throwCd <= 0 &&
          hd > 200 &&
          hd < THROW_RANGE &&
          los &&
          this.brokenCount < 2
        ) {
          this.state = 'throwWind'
          this.stateT = 0
          this.vxTarget = 0
          this.throwCd = this.enraged ? 2.2 : 3.4
          this.playAnim('attack')
          showTell(this.throwTell, 0.4)
          sfx(this, 'growl', 0.4, 1.05)
          break
        }

        if (hd > 110) {
          this.vxTarget = this.facing * this.speed
          if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
        } else {
          this.vxTarget = 0
        }
        break
      }

      case 'slamWind': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.tell) showTell(this.tell, 0.35 + Math.sin(this.stateT * 26) * 0.3)
        if (this.stateT >= SLAM_WIND) {
          this.state = 'slam'
          this.stateT = 0
          showTell(this.tell, 0)
          this._slam()
        }
        break
      }

      case 'slam': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= 0.35) {
          this.state = 'chase'
          this.stateT = 0
        }
        break
      }

      case 'throwWind': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= THROW_WIND) {
          this.state = 'chase'
          this.stateT = 0
          this._throwPart()
        }
        break
      }

      case 'pickup': {
        const near = this._nearestGroundPart()
        if (!near) {
          this.state = 'chase'
          this.stateT = 0
          break
        }
        const dx = near.part.x - this.px
        if (Math.abs(dx) < 26) {
          this.vxTarget = 0
          this.state = 'chase'
          this.stateT = 0
          break
        }
        this.facing = dx > 0 ? 1 : -1
        this.vxTarget = this.facing * this.speed * 0.85
        if (this.wallAhead(this.facing)) this.vxTarget = 0
        this.playAnim('run')
        break
      }

      default: {
        this.state = 'chase'
        this.stateT = 0
        break
      }
    }

    // 房间边界保护：不追出房间
    const { w } = roomBounds(this)
    if (this.body.x < 24) {
      this.body.x = 24
      this.facing = 1
      this.vxTarget = 0
    } else if (this.body.x > w - this.body.w - 24) {
      this.body.x = w - this.body.w - 24
      this.facing = -1
      this.vxTarget = 0
    }
  }

  // ------------------------------------------------------------------ 死亡
  die() {
    this.mesh.rotation.z = 0
    this._clearGroundParts()
    if (this.tell) disposeTell(this, this.tell)
    if (this.throwTell) disposeTell(this, this.throwTell)
    this.tell = null
    this.throwTell = null
    largeDeathFx(this, {
      particles: 36,
      sparks: 26,
      shake: 0.9,
      color: 0x6b5f55,
      // 死亡只做视觉（不在玩家补刀瞬间反伤，避免"打死它反而被炸死"的恶感）
      extraLoot: [
        { id: 'scrap_plate', n: 4, spread: 150 },
        { id: 'copper_wire', n: 2, spread: 130 },
      ],
    })
    super.die()
  }

  dispose() {
    this._clearGroundParts()
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.group.remove(this.waves[i].mesh)
      this.waves[i].mesh.geometry.dispose()
      this.waves[i].mat.dispose()
    }
    this.waves.length = 0
    if (this.tell) disposeTell(this, this.tell)
    if (this.throwTell) disposeTell(this, this.throwTell)
    this.tell = null
    this.throwTell = null
    super.dispose()
  }
}

export const CLASS = JunkGolem
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
export default JunkGolem
