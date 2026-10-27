import * as THREE from 'three'
import { BaseMonster } from '../base.js'
import { Content, KIND } from '../../../core/registry.js'
import { TS } from '../../../config.js'
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
 * 群聚核心 —— 大型移动巢（beast）。
 *
 * 本体在「闭壳」状态完全无敌：任何攻击只冒火花，伤害为 0。
 * 它不停地从身体两侧产出 crawler（本巢上限 8 只，走 game.director.spawn）。
 *
 * 破法：把巢产下的小怪全部清光 → 核心**暴露 6 秒**（核心亮红灯、受到 1.15 倍伤害）。
 *   6 秒内没打死它 → 重新闭壳并立刻补 2 只小怪。
 *   击杀核心 → 所有属于这个巢的小怪立刻倒地死亡。
 *
 * 近身时它会鼓起身体「孵化脉冲」：0.5s 前摇（地面红环）→ 范围伤害 + 击退。
 *
 * 移动很慢（38px/s），是典型的区域封锁型大型敌人。
 */

export const DEF = {
  id: 'swarm_core',
  name: '群聚核心',
  en: 'SWARM CORE',
  family: 'beast',
  hp: 240,
  speed: 38,
  damage: 18,
  size: [150, 130],
  aggro: 520,
  attackRange: 150,
  attackType: 'swarm',
  attackCooldown: 3,
  xp: 140,
  gravity: 2000,
  elite: true,
  loot: [
    { id: 'chemical', chance: 1, min: 2, max: 3 },
    { id: 'cloth', chance: 0.9, min: 1, max: 2 },
    { id: 'rubber', chance: 0.8, min: 1, max: 2 },
    { id: 'rare_earth', chance: 0.45 },
    { id: 'scrap_plate', chance: 0.6, min: 1, max: 2 },
    { id: 'rad_meds', chance: 0.2 },
  ],
  artId: 'swarm_core',
  sound: 'growl',
  biome: ['dump', 'factory', 'city'],
  desc: '那不是一只怪物，是一窝。壳底下有东西在动，很多。',
}

const BROOD_MAX = 8
const SPAWN_CD = 3.2
const EXPOSE_T = 6
const PULSE_WIND = 0.5
const PULSE_RADIUS = 165
const PULSE_DAMAGE = 18
const EXPOSED_DMG_MUL = 1.15

export class SwarmCore extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.brood = new Set()
    this.spawnCd = 1.2
    this.exposed = false
    this.exposeT = 0
    this.pulseCd = 1.5
    this.immunityFlash = 0
    this.waves = []
    this.broodEverSpawned = 0
    this.noBroodT = 0
    this.tell = null
    initLarge(this, { intro: 1.4, activateRange: 760 })
    applyLargeArt(this)
    this.tell = createTell(this, { inner: 52, outer: 80, color: 0xc2553f })
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 外壳
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x5c5149, toneMapped: false })
    this.shellMat = shellMat
    this.shellGeo = new THREE.PlaneGeometry(1, 1)
    this.shellA = new THREE.Mesh(this.shellGeo, shellMat)
    this.shellA.renderOrder = 4.1
    this.shellB = new THREE.Mesh(this.shellGeo, shellMat)
    this.shellB.renderOrder = 4.1
    this.group.add(this.shellA)
    this.group.add(this.shellB)

    // 核心（暴露时亮起）
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff5644,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.coreMat = coreMat
    this.coreMesh = new THREE.Mesh(new THREE.CircleGeometry(34, 16), coreMat)
    this.coreMesh.renderOrder = 4.6
    this.group.add(this.coreMesh)

    // 虫囊：三个会脉动的小球
    this.sacMats = []
    this.sacMeshes = []
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x8d3a34,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(13, 10), mat)
      mesh.renderOrder = 4.4
      this.group.add(mesh)
      this.sacMats.push(mat)
      this.sacMeshes.push(mesh)
    }
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

  _updateVisuals(dt) {
    const feet = this.body.y + this.body.h
    const cx = this.px
    if (this.shellA && this.shellB) {
      const w = this.w * 0.52
      const h = this.h * 0.42
      this.shellA.scale.set(w, h, 1)
      this.shellB.scale.set(w, h, 1)
      this.shellA.position.set(cx - this.w * 0.24, -feet + h * 0.5 + 8, 4.15)
      this.shellB.position.set(cx + this.w * 0.24, -feet + h * 0.5 + 8, 4.15)
      const open = this.exposed ? 1 : 0
      this.shellA.rotation.z = -0.18 - open * 0.3
      this.shellB.rotation.z = 0.18 + open * 0.3
    }
    if (this.coreMesh && this.coreMat) {
      this.coreMesh.position.set(cx, -feet + this.h * 0.52, 4.7)
      const base = this.exposed ? 0.55 + Math.sin(this.stateT * 11) * 0.25 : 0.04
      const flash = this.immunityFlash > 0 ? 0.5 : 0
      this.coreMat.color.setHex(this.exposed ? 0xff5644 : this.immunityFlash > 0 ? 0x9fd3e0 : 0x4a4238)
      this.coreMat.opacity = Math.min(0.95, base + flash)
      this.coreMesh.visible = this.coreMat.opacity > 0.03
    }
    for (let i = 0; i < this.sacMeshes.length; i++) {
      const m = this.sacMeshes[i]
      const phase = this.stateT * 2.4 + i * 2.1
      m.position.set(cx + (i - 1) * this.w * 0.26, -feet + this.h * 0.3 + Math.sin(phase) * 4, 4.3)
      m.scale.setScalar(0.85 + Math.sin(phase) * 0.16)
      this.sacMats[i].opacity = this.exposed ? 0.3 : 0.45 + Math.sin(phase) * 0.15
    }
    if (this.tell) {
      placeTell(this.tell, cx, feet + 2, 1)
      if (this.tell.mat.opacity > 0) showTell(this.tell, Math.max(0, this.tell.mat.opacity - dt * 1.8))
    }
    this._updateWaves(dt)
  }

  _ring(radius, color = 0xc2553f) {
    const feet = this.body.y + this.body.h
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 10, radius, 26, 1), mat)
    mesh.position.set(this.px, -feet + 3, 3.3)
    mesh.scale.setScalar(0.14)
    this.group.add(mesh)
    this.waves.push({ mesh, mat, t: 0 })
  }

  _updateWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      w.t += dt
      const k = Math.min(1, w.t / 0.45)
      w.mesh.scale.setScalar(0.14 + k * 0.86)
      w.mat.opacity = 0.7 * (1 - k)
      if (w.t >= 0.47) {
        this.group.remove(w.mesh)
        w.mesh.geometry.dispose()
        w.mat.dispose()
        this.waves.splice(i, 1)
      }
    }
  }

  _pruneBrood() {
    let n = 0
    for (const m of this.brood) {
      if (!m || !m.alive) this.brood.delete(m)
      else n++
    }
    return n
  }

  _spawnBrood(count = 1) {
    const spawn = this.game?.director?.spawn
    if (typeof spawn !== 'function') return 0
    const alive = this._pruneBrood()
    let spawned = 0
    for (let i = 0; i < count && alive + spawned < BROOD_MAX; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const x = clamp(this.px + side * (this.w * 0.6 + 20 + Math.random() * 40), 40, roomBounds(this).w - 40)
      const y = this._groundYAt(x)
      let m = null
      try {
        m = spawn.call(this.game.director, 'crawler', x, y)
      } catch (e) {
        m = null
      }
      if (!m) break
      this.brood.add(m)
      this.broodEverSpawned++
      spawned++
      puff(this, 6, 0x8d3a34, 0.9)
    }
    if (spawned > 0) sfx(this, 'growl', 0.35, 1.3)
    return spawned
  }

  _killBrood() {
    for (const m of this.brood) {
      if (m && m.alive) {
        try {
          m.takeDamage(99999, this.px)
        } catch (e) {
          /* ignore */
        }
      }
    }
    this.brood.clear()
  }

  _openCore() {
    this.exposed = true
    this.exposeT = EXPOSE_T
    this.spawnCd = Math.max(this.spawnCd, 0.8)
    spark(this, this.px, this.body.y + this.body.h * 0.5, 0xff5644, 16, 240)
    sfx(this, 'hurt', 0.6, 0.7)
    shake(this, 0.35)
  }

  _closeCore() {
    this.exposed = false
    this.exposeT = 0
    sfx(this, 'growl', 0.45, 0.8)
    this._spawnBrood(2)
  }

  _pulse() {
    const feet = this.body.y + this.body.h
    this._ring(PULSE_RADIUS)
    aoe(this, this.px, feet - 20, PULSE_RADIUS, PULSE_DAMAGE)
    puff(this, 18, 0x8d3a34, 1.5)
    spark(this, this.px, feet - 30, 0xc2553f, 12, 260)
    shake(this, 0.45)
    sfx(this, 'thunder', 0.42, 1.15)
  }

  // ------------------------------------------------------------------ 伤害
  takeDamage(n, fromX = null) {
    if (!this.alive) return
    if (!this.exposed) {
      // 闭壳：本体无敌
      this.immunityFlash = 0.22
      spark(this, this.px + (Math.random() - 0.5) * this.w * 0.6, this.body.y + this.body.h * 0.5, 0x9fd3e0, 5, 180)
      sfx(this, 'hurt', 0.2, 1.5)
      return
    }
    super.takeDamage(n * EXPOSED_DMG_MUL, fromX)
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this._updateVisuals(dt)
    this.immunityFlash = Math.max(0, this.immunityFlash - dt)
    this.spawnCd = Math.max(0, this.spawnCd - dt)
    this.pulseCd = Math.max(0, this.pulseCd - dt)
    const broodAlive = this._pruneBrood()

    if (playIntro(this, dt)) {
      this.vxTarget = 0
      if (this.broodEverSpawned === 0) this._spawnBrood(2)
      return
    }

    // 暴露计时
    if (this.exposed) {
      this.exposeT -= dt
      if (this.exposeT <= 0) this._closeCore()
    } else {
      if (broodAlive === 0) this.noBroodT += dt
      else this.noBroodT = 0
      if (this.broodEverSpawned > 0 && broodAlive === 0) {
        // 小怪被清光 → 暴露核心
        this._openCore()
      } else if (this.broodEverSpawned === 0 && this.noBroodT > 8) {
        // 同屏上限 / 没有 director，一只小怪都产不出来时
        // 也必须给一个窗口，否则本体永远无敌会把房间卡死
        this._openCore()
        this.noBroodT = 0
      }
    }

    if (this.stunT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }
    if (this.hurtT > 0 && this.exposed) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }

    const p = this.player
    const active = updateActivation(this, dt)
    if (!p || p.dead || !active) {
      this.state = 'roam'
      roamStep(this, dt, { speedMul: 0.55 })
      return
    }

    const hd = Math.abs(p.centerX - this.px)
    const feet = this.body.y + this.body.h
    const dy = Math.abs(p.centerY - feet)

    // 产卵
    if (!this.exposed && this.spawnCd <= 0 && broodAlive < BROOD_MAX) {
      this.spawnCd = SPAWN_CD
      this._spawnBrood(broodAlive < 3 ? 2 : 1)
    }

    switch (this.state) {
      case 'pulseWind': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.tell) showTell(this.tell, 0.35 + Math.sin(this.stateT * 26) * 0.3)
        if (this.stateT >= PULSE_WIND) {
          this.state = 'pulse'
          this.stateT = 0
          if (this.tell) showTell(this.tell, 0)
          this._pulse()
        }
        break
      }

      case 'pulse': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= 0.4) {
          this.state = 'chase'
          this.stateT = 0
        }
        break
      }

      case 'chase':
      default: {
        this.playAnim('run')
        if (hd > 100) {
          this.facing = p.centerX > this.px ? 1 : -1
          this.vxTarget = this.facing * this.speed
          if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
        } else {
          this.vxTarget = 0
        }
        if (this.pulseCd <= 0 && hd < 170 && dy < 150) {
          this.state = 'pulseWind'
          this.stateT = 0
          this.vxTarget = 0
          this.pulseCd = 3.2
          this.playAnim('attack')
          if (this.tell) showTell(this.tell, 0.5)
          sfx(this, 'growl', 0.45, 0.95)
        }
        break
      }
    }

    const { w } = roomBounds(this)
    this.body.x = clamp(this.body.x, 24, w - this.body.w - 24)
  }

  // ------------------------------------------------------------------ 死亡
  die() {
    this._killBrood()
    if (this.tell) {
      disposeTell(this, this.tell)
      this.tell = null
    }
    largeDeathFx(this, {
      particles: 34,
      sparks: 18,
      shake: 0.8,
      color: 0x6b5f55,
      sound: 'death',
      extraLoot: [{ id: 'chemical', n: 2, spread: 110 }],
    })
    super.die()
  }

  dispose() {
    this._pruneBrood()
    this.brood.clear()
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.group.remove(this.waves[i].mesh)
      this.waves[i].mesh.geometry.dispose()
      this.waves[i].mat.dispose()
    }
    this.waves.length = 0
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    super.dispose()
  }
}

export const CLASS = SwarmCore
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
export default SwarmCore
