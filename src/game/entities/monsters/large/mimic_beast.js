import * as THREE from 'three'
import { BaseMonster } from '../base.js'
import { Content, KIND } from '../../../core/registry.js'
import { Events } from '../../../core/events.js'
import { G } from '../../../state.js'
import * as propsArt from '../../../render/art/props.js'
import * as chassisArt from '../../../render/art/chassis.js'
import {
  initLarge,
  applyLargeArt,
  playIntro,
  updateActivation,
  roamStep,
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
 * 拟态兽 —— 大型动物拟态体（beast）。
 *
 * 伪装期：完全静止，外形随机取 car_wreck / corpse / junk_heap 的道具贴图。
 *   · 玩家进入 90px 现形；
 *   · 被攻击现形；
 *   · **被扫描仪扫到也会现形**（监听引擎的 scan:done 事件，扫描半径内即识破）。
 *
 * 战斗：
 *   扑咬  0.45s 蓄力（压低身体 + 地面红环 + 低吼）→ 0.45s 高速扑击（单次命中）。
 *   拟态  每 6 秒左右，它会短暂变成**玩家机体的外形**（用当前机体贴图）：
 *         这 1.3 秒内它站在原处不动、攻击打上去只会打出火花（骗攻击），
 *         结束后立刻接一次扑咬。血量越低用得越频繁。
 *
 * 死亡：软倒 + 掉落生物材料（布/橡胶/罐头）。
 */

export const DEF = {
  id: 'mimic_beast',
  name: '拟态兽',
  en: 'MIMIC BEAST',
  family: 'beast',
  hp: 260,
  speed: 148,
  damage: 30,
  size: [120, 90],
  aggro: 420,
  attackRange: 118,
  attackType: 'lunge',
  attackCooldown: 2.4,
  xp: 110,
  gravity: 2000,
  elite: true,
  loot: [
    { id: 'cloth', chance: 0.9, min: 1, max: 2 },
    { id: 'rubber', chance: 0.7 },
    { id: 'dog_food', chance: 0.6 },
    { id: 'chemical', chance: 0.45 },
    { id: 'scrap_plate', chance: 0.5, min: 1, max: 2 },
    { id: 'repair_kit', chance: 0.15 },
  ],
  artId: 'mimic_beast',
  sound: 'growl',
  biome: ['dump', 'city', 'village'],
  desc: '那堆废铁刚刚呼吸了。它甚至学会了你的样子——你确定镜子里的那个是你吗？',
}

const DISGUISES = ['car_wreck', 'corpse', 'junk_heap']
const REVEAL_RANGE = 90
const EMERGE_T = 0.7
const LUNGE_WIND = 0.45
const LUNGE_T = 0.45
const LUNGE_SPEED = 470
const RECOVER_T = 0.5
const MIMIC_T = 1.3
const MIMIC_WIND = 0.25
const MIMIC_CD = 6.2

export class MimicBeast extends BaseMonster {
  constructor(game, x, y) {
    super(game, DEF, x, y)
    this.revealed = false
    this.lungeHit = false
    this.lungeDir = 1
    this.mimicCd = 3 + Math.random() * 2
    this.mimicInvuln = false
    this.decoy = null
    this.tell = null
    this.phaseSpeed = DEF.speed
    this._offScan = null
    initLarge(this, { intro: 0, activateRange: 800, deactivateRange: 1200 })
    applyLargeArt(this)
    this.tell = createTell(this, { inner: 44, outer: 66, color: 0xc2553f })
    this.playAnim('idle')
    // 扫描仪可以识破伪装
    try {
      this._offScan = Events.on('scan:done', () => {
        if (!this.alive || this.revealed) return
        const p = this.player
        if (!p) return
        if (this.distToPlayer() <= 360) this._reveal('scan')
      })
    } catch (e) {
      this._offScan = null
    }
  }

  // ------------------------------------------------------------------ 视觉
  buildExtraVisual() {
    // 伪装成道具：用道具贴图代替本体（构造顺序：buildExtraVisual 在构造函数体之前执行）
    this.disguiseKind = DISGUISES[Math.floor(Math.random() * DISGUISES.length)]
    const kind = this.disguiseKind
    let tex = null
    let size = { w: 110, h: 60 }
    try {
      tex = propsArt.getPropArt ? propsArt.getPropArt(kind) : null
      if (propsArt.getPropSize) size = propsArt.getPropSize(kind) || size
    } catch (e) {
      tex = null
    }
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: tex ? 0xffffff : 0x6b5f55,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.disguiseW = size.w
    this.disguiseH = size.h
    this.disguiseMat = mat
    this.disguiseMesh = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.h), mat)
    this.disguiseMesh.renderOrder = 4
    this.group.add(this.disguiseMesh)
    // 本体先藏起来（只留伪装）
    if (this.mesh) this.mesh.visible = false

    // 拟态道具的"呼吸"微光（玩家凑近才看得出来）
    const breathMat = new THREE.MeshBasicMaterial({
      color: 0xc2553f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.breathMat = breathMat
    this.breath = new THREE.Mesh(new THREE.PlaneGeometry(size.w * 0.7, 8), breathMat)
    this.breath.renderOrder = 4.5
    this.group.add(this.breath)
    this.decoy = null
  }

  _makeDecoy() {
    // 拟态成玩家机体：拿当前机体的 idle 帧
    let tex = null
    let w = 46
    let h = 44
    try {
      if (chassisArt.getChassisArt) {
        const art = chassisArt.getChassisArt(G?.chassisId || 'unit7')
        if (art) {
          w = art.w || w
          h = art.h || h
          const idle = art.frames?.idle
          tex = Array.isArray(idle) ? idle[0] : idle || null
        }
      }
    } catch (e) {
      tex = null
    }
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: tex ? 0xffffff : 0xb0713a,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    mesh.renderOrder = 5
    this.group.add(mesh)
    return { mesh, mat }
  }

  _setDisguiseVisible(v) {
    if (this.disguiseMesh) this.disguiseMesh.visible = v
    if (this.breath) this.breath.visible = v
  }

  _reveal(reason = 'near') {
    if (this.revealed || !this.alive) return
    this.revealed = true
    this._setDisguiseVisible(false)
    if (this.mesh) this.mesh.visible = true
    this.state = 'emerge'
    this.stateT = 0
    this.vxTarget = 0
    this.playAnim('attack')
    if (reason === 'scan') {
      sfx(this, 'hurt', 0.4, 1.8)
      spark(this, this.px, this.py, 0x9fd3e0, 14, 260)
    } else {
      sfx(this, 'growl', 0.65, 1.1)
    }
    puff(this, 16, 0x6b5f55, 1.3)
    shake(this, 0.25)
  }

  // ------------------------------------------------------------------ 工具
  _horizDist() {
    const p = this.player
    if (!p) return Infinity
    return Math.abs(p.centerX - this.px)
  }

  _overlapsPlayer() {
    const p = this.player
    if (!p || p.dead) return false
    const b = this.body
    const pb = p.body
    return b.x < pb.x + pb.w && b.x + b.w > pb.x && b.y < pb.y + pb.h && b.y + b.h > pb.y
  }

  _updateDisguisePose(dt) {
    const feet = this.body.y + this.body.h
    if (this.disguiseMesh && this.disguiseMesh.visible) {
      this.disguiseMesh.position.set(
        this.px + this.facing * 4,
        -feet + this.disguiseH / 2,
        3.8,
      )
      this.disguiseMesh.scale.x = this.facing
      if (this.breath) {
        this.breath.position.set(this.px, -feet + this.disguiseH * 0.32, 4)
        this.breathMat.opacity = 0.05 + Math.abs(Math.sin(this.animT * 0.7)) * 0.12
      }
    }
    if (this.decoy && this.decoy.mesh.visible) {
      this.decoy.mesh.position.set(this.px, -feet + 22, 4.2)
      this.decoy.mesh.scale.x = this.facing
      this.decoy.mat.opacity = 0.75 + Math.sin(this.stateT * 14) * 0.2
    }
    if (this.tell) {
      placeTell(this.tell, this.px, feet + 2, 1)
      if (this.tell.mat.opacity > 0) showTell(this.tell, Math.max(0, this.tell.mat.opacity - dt * 1.8))
    }
  }

  // ------------------------------------------------------------------ 伤害
  takeDamage(n, fromX = null) {
    if (!this.alive) return
    if (!this.revealed) this._reveal('hit')
    // 拟态期：这一下打空（骗攻击），只冒火花
    if (this.mimicInvuln) {
      spark(this, this.px, this.py, 0x9fd3e0, 6, 160)
      sfx(this, 'hurt', 0.16, 1.9)
      return
    }
    super.takeDamage(n, fromX)
    if (this.alive && this.hp / this.maxHp <= 0.5) this.phaseSpeed = DEF.speed * 1.18
    if (this.alive && this.hp / this.maxHp <= 0.2) this.phaseSpeed = DEF.speed * 1.35
  }

  // ------------------------------------------------------------------ AI
  updateBehavior(dt) {
    this._updateDisguisePose(dt)
    this.mimicCd = Math.max(0, this.mimicCd - dt)
    const p = this.player
    const active = updateActivation(this, dt)

    // 伪装：完全静止，等玩家靠近
    if (!this.revealed) {
      this.vxTarget = 0
      this.playAnim('idle')
      if (p && !p.dead && this.distToPlayer() < REVEAL_RANGE) this._reveal('near')
      return
    }

    if (playIntro(this, dt)) return
    if (this.hurtT > 0 && this.state !== 'lunge' && this.state !== 'mimic') {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }

    // 没有激活（玩家很远）：回到游荡
    if (!p || p.dead || !active) {
      this._endMimic()
      this.state = 'roam'
      roamStep(this, dt, { speedMul: 0.5 })
      return
    }

    const hd = this._horizDist()
    const los = this.hasLineOfSight(p.centerX, p.centerY)

    switch (this.state) {
      case 'emerge': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= EMERGE_T) {
          this.state = 'chase'
          this.stateT = 0
          this.playAnim('run')
        }
        break
      }

      case 'chase': {
        this.facePlayer()
        this.playAnim('run')
        this.vxTarget = this.facing * this.phaseSpeed
        if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0

        // 拟态骗攻击
        if (this.mimicCd <= 0 && hd > 100 && hd < 460) {
          this.state = 'mimicWind'
          this.stateT = 0
          this.vxTarget = 0
          this.mimicCd = MIMIC_CD + Math.random() * 2
          this.playAnim('idle')
          spark(this, this.px, this.py, 0x9fd3e0, 8, 140)
          break
        }

        if (hd < DEF.attackRange && this.attackCd <= 0 && los) {
          this.state = 'lungeWind'
          this.stateT = 0
          this.vxTarget = 0
          this.playAnim('attack')
          showTell(this.tell, 0.55)
          sfx(this, 'growl', 0.5, 1.2)
          break
        }
        break
      }

      case 'lungeWind': {
        this.vxTarget = -this.facing * 30
        this.playAnim('attack')
        if (this.tell) showTell(this.tell, 0.35 + Math.sin(this.stateT * 28) * 0.28)
        if (this.stateT >= LUNGE_WIND) {
          this.lungeDir = this.facing
          this.lungeHit = false
          this.state = 'lunge'
          this.stateT = 0
          showTell(this.tell, 0)
          sfx(this, 'growl', 0.55, 1.4)
          break
        }
        break
      }

      case 'lunge': {
        this.vxTarget = this.lungeDir * LUNGE_SPEED
        this.playAnim('run')
        if (!this.lungeHit && this._overlapsPlayer()) {
          this.lungeHit = true
          this.hitPlayer(DEF.damage)
          puff(this, 8, 0x8d3a34, 1)
          shake(this, 0.22)
        }
        if (this.stateT >= LUNGE_T || this.body.wallDir !== 0) {
          this.state = 'recover'
          this.stateT = 0
          this.attackCd = this.def.attackCooldown ?? 2.4
        }
        break
      }

      case 'recover': {
        this.vxTarget = this.lungeDir * 16
        this.playAnim('idle')
        if (this.stateT >= RECOVER_T) {
          this.state = 'chase'
          this.stateT = 0
        }
        break
      }

      case 'mimicWind': {
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= MIMIC_WIND) {
          this._startMimic()
        }
        break
      }

      case 'mimic': {
        this.vxTarget = 0
        this.playAnim('idle')
        if (this.decoy?.mesh) this.decoy.mesh.visible = true
        if (this.tell) showTell(this.tell, 0)
        if (this.stateT >= MIMIC_T) {
          this._endMimic()
          // 现形后立刻接一次扑咬
          this.state = 'lungeWind'
          this.stateT = 0
          this.attackCd = 0
          showTell(this.tell, 0.5)
          sfx(this, 'growl', 0.6, 1.5)
        }
        break
      }

      default: {
        this.state = 'chase'
        this.stateT = 0
        break
      }
    }

    // 不追出房间
    const { w } = roomBounds(this)
    this.body.x = clamp(this.body.x, 24, w - this.body.w - 24)
  }

  _startMimic() {
    if (!this.decoy) this.decoy = this._makeDecoy()
    this.decoy.mesh.visible = true
    if (this.mesh) this.mesh.visible = false
    this.mimicInvuln = true
    this.state = 'mimic'
    this.stateT = 0
    this.vxTarget = 0
    sfx(this, 'wake', 0.3, 1.6)
    spark(this, this.px, this.py, 0x9fd3e0, 12, 220)
  }

  _endMimic() {
    if (!this.mimicInvuln) return
    this.mimicInvuln = false
    if (this.decoy?.mesh) this.decoy.mesh.visible = false
    if (this.mesh) this.mesh.visible = true
    puff(this, 8, 0x93a8b2, 1)
  }

  // ------------------------------------------------------------------ 死亡
  die() {
    this._endMimic()
    this._setDisguiseVisible(false)
    if (this.mesh) this.mesh.visible = true
    if (this.tell) {
      disposeTell(this, this.tell)
      this.tell = null
    }
    largeDeathFx(this, {
      particles: 22,
      sparks: 8,
      shake: 0.5,
      color: 0x8d3a34,
      sound: 'death',
      extraLoot: [{ id: 'cloth', n: 2, spread: 80 }],
    })
    super.die()
  }

  dispose() {
    try {
      this._offScan?.()
    } catch (e) {
      /* ignore */
    }
    this._offScan = null
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    if (this.decoy?.mesh) {
      this.group.remove(this.decoy.mesh)
      this.decoy.mesh.geometry.dispose()
      this.decoy.mat.dispose()
    }
    this.decoy = null
    super.dispose()
  }
}


export const CLASS = MimicBeast
Content.register(KIND.MONSTER, DEF.id, DEF, 'core')
export default MimicBeast
