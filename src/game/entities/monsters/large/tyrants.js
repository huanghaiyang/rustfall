// 三个 BOSS：裂爪暴君（《阿基拉》暴走体）、赛博精神病（《赛博朋克》）、
// 超能暴走体（《阿基拉》/《地铁》的超自然异常）。
// 全部走 large/ 的公共管线：入场特写、激活、 roam、死亡特效。
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
} from './common.js'

// ========================================================== 裂爪暴君
export const CLAW_DEF = {
  id: 'claw_tyrant',
  name: '裂爪暴君',
  en: 'CLAW TYRANT',
  family: 'mutant',
  hp: 780,
  speed: 64,
  damage: 32,
  size: [148, 188],
  aggro: 660,
  attackRange: 170,
  attackType: 'melee',
  attackCooldown: 2.3,
  xp: 220,
  gravity: 2000,
  elite: true,
  loot: [
    { id: 'composite_armor', chance: 0.8 },
    { id: 'hydraulic_rod', chance: 0.7, min: 1, max: 2 },
    { id: 'servo_motor', chance: 0.6 },
    { id: 'rare_earth', chance: 0.5 },
    { id: 'reactor_core', chance: 0.18 },
  ],
  artId: 'claw_tyrant',
  sound: 'thunder',
  biome: ['factory', 'dump'],
  desc: '一只从生物实验室里长出来的巨爪，和半台工程机焊在了一起。它挥爪的时候，钢筋像草一样断。',
}

export class ClawTyrant extends BaseMonster {
  constructor(game, x, y) {
    super(game, CLAW_DEF, x, y)
    this.slamCd = 1.2
    this.leapCd = 3
    this.enraged = false
    this.baseSpeed = CLAW_DEF.speed
    initLarge(this, { intro: 1.4, activateRange: 760 })
    applyLargeArt(this)
    this.tell = createTell(this, { inner: 46, outer: 74, color: 0xff7a4a })
  }

  _feetY() {
    return this.body.y + this.body.h
  }

  _hd() {
    const p = this.player
    return p ? Math.abs(p.centerX - this.px) : Infinity
  }

  _slam() {
    const p = this.player
    if (!p) return
    const x = this.px + this.facing * 82
    const radius = this.enraged ? 150 : 126
    aoe(this, x, this._feetY() - 10, radius, this.enraged ? CLAW_DEF.damage + 8 : CLAW_DEF.damage)
    puff(this, 20, 0x6b5f55, 1.5)
    spark(this, x, this._feetY() - 24, 0xffb45a, 16, 320)
    shake(this, 0.7)
    sfx(this, 'thunder', 0.6, 1.0)
  }

  updateBehavior(dt) {
    this.slamCd = Math.max(0, this.slamCd - dt)
    this.leapCd = Math.max(0, this.leapCd - dt)
    if (this.tell) {
      placeTell(this.tell, this.px, this._feetY() + 2, 1)
      if (this.tell.mat.opacity > 0) showTell(this.tell, Math.max(0, this.tell.mat.opacity - dt * 2))
    }
    if (playIntro(this, dt)) return
    if (this.stunT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }
    const p = this.player
    const active = updateActivation(this, dt)
    if (!p || p.dead || !active) {
      this.state = 'roam'
      roamStep(this, dt, { speedMul: 0.5 })
      return
    }
    const hd = this._hd()
    switch (this.state) {
      case 'slamWind':
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.tell) showTell(this.tell, 0.35 + Math.sin(this.stateT * 24) * 0.3)
        if (this.stateT >= (this.enraged ? 0.42 : 0.55)) {
          this.state = 'slam'
          this.stateT = 0
          if (this.tell) showTell(this.tell, 0)
          this._slam()
        }
        return
      case 'slam':
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= 0.38) {
          this.state = 'chase'
          this.stateT = 0
          this.slamCd = this.enraged ? 1.5 : 2.4
        }
        return
      case 'leapWind':
        this.vxTarget = 0
        this.playAnim('attack')
        this.facePlayer()
        if (this.stateT >= 0.42) {
          this.state = 'leap'
          this.stateT = 0
          this.body.vy = -470
          this.body.vx = this.facing * (this.enraged ? 320 : 270)
          sfx(this, 'growl', 0.55, 0.75)
          shake(this, 0.3)
        }
        return
      case 'leap':
        this.vxTarget = this.facing * (this.enraged ? 320 : 270)
        this.playAnim('attack')
        if (this.body.onGround && this.stateT > 0.18) {
          aoe(this, this.px, this._feetY() - 8, 118, CLAW_DEF.damage * 0.8)
          puff(this, 18, 0x6b5f55, 1.4)
          shake(this, 0.55)
          this.state = 'slam'
          this.stateT = 0
          this.leapCd = this.enraged ? 2.2 : 3.4
        }
        return
      default:
        break
    }
    // chase
    this.facePlayer()
    this.playAnim('run')
    if (hd < 180 && this.slamCd <= 0) {
      this.state = 'slamWind'
      this.stateT = 0
      this.vxTarget = 0
      if (this.tell) showTell(this.tell, 0.6)
      sfx(this, 'growl', 0.45, 0.8)
      return
    }
    if (hd > 270 && this.leapCd <= 0 && this.body.onGround) {
      this.state = 'leapWind'
      this.stateT = 0
      this.vxTarget = 0
      if (this.tell) showTell(this.tell, 0.45)
      return
    }
    this.vxTarget = hd > 96 ? this.facing * this.speed : 0
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
    const { w } = roomBounds(this)
    if (this.body.x < 30) this.body.x = 30
    else if (this.body.x > w - this.body.w - 30) this.body.x = w - this.body.w - 30
  }

  takeDamage(n, fromX = null) {
    super.takeDamage(n, fromX)
    if (this.alive && !this.enraged && this.hp / this.maxHp <= 0.5) {
      this.enraged = true
      this.speed = this.baseSpeed * 1.18
      puff(this, 22, 0xff7a4a, 1.6)
      shake(this, 0.5)
      sfx(this, 'growl', 0.7, 0.6)
    }
  }

  die() {
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    largeDeathFx(this, {
      particles: 40,
      sparks: 30,
      shake: 1,
      color: 0x8a5a3a,
      extraLoot: [{ id: 'scrap_plate', n: 3, spread: 140 }],
    })
    super.die()
  }

  dispose() {
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    super.dispose()
  }
}

Content.register(KIND.MONSTER, CLAW_DEF.id, CLAW_DEF, 'core')

// ========================================================== 赛博精神病·暴走体
export const PSYCHO_BOSS_DEF = {
  id: 'cyberpsycho_boss',
  name: '赛博精神病·暴走体',
  en: 'CYBERPSYCHO OVERDRIVE',
  family: 'rogue',
  hp: 640,
  speed: 96,
  damage: 20,
  size: [74, 122],
  aggro: 720,
  attackRange: 540,
  attackType: 'ranged',
  attackCooldown: 1.8,
  xp: 200,
  gravity: 2000,
  elite: true,
  loot: [
    { id: 'optical_module', chance: 0.8 },
    { id: 'processor', chance: 0.7 },
    { id: 'stim_patch', chance: 0.6, min: 2, max: 3 },
    { id: 'quantum_chip', chance: 0.2 },
    { id: 'arc_emitter', chance: 0.25 },
  ],
  artId: 'cyberpsycho_boss',
  sound: 'alarm',
  biome: ['city', 'factory'],
  desc: '他签了那份植入体合同，然后忘了自己是谁。现在他只会重复一句话：「还不够快。」',
}

export class CyberPsychoBoss extends BaseMonster {
  constructor(game, x, y) {
    super(game, PSYCHO_BOSS_DEF, x, y)
    this.burstCd = 1.4
    this.dashCd = 2.6
    this.strafeDir = Math.random() < 0.5 ? -1 : 1
    this.strafeT = 1
    this.overclocked = false
    this.baseSpeed = PSYCHO_BOSS_DEF.speed
    initLarge(this, { intro: 1.4, activateRange: 800 })
    applyLargeArt(this)
  }

  _feetY() {
    return this.body.y + this.body.h
  }

  _hd() {
    const p = this.player
    return p ? Math.abs(p.centerX - this.px) : Infinity
  }

  _burst() {
    const p = this.player
    if (!p) return
    const sx = this.px + this.facing * 22
    const sy = this._feetY() - this.h * 0.62
    sfx(this, 'alarm', 0.35, 1.6)
    for (let k = -1; k <= 1; k++) {
      const tx = p.centerX + k * 26
      const ty = p.centerY + k * 10
      const dx = tx - sx
      const dy = ty - sy
      const len = Math.max(1, Math.hypot(dx, dy))
      const speed = 560
      let ok = false
      if (typeof this.game.spawnProjectile === 'function') {
        try {
          ok = !!this.game.spawnProjectile({
            x: sx,
            y: sy,
            vx: (dx / len) * speed,
            vy: (dy / len) * speed,
            gravity: 0,
            radius: 5,
            damage: PSYCHO_BOSS_DEF.damage,
            color: 0xff5644,
            life: 1.5,
            type: 'bullet',
            source: this.id,
          })
        } catch (e) {
          ok = false
        }
      }
      if (!ok && k === 0) this.hitPlayer(PSYCHO_BOSS_DEF.damage)
      spark(this, sx, sy, 0xff5644, 6, 220)
    }
  }

  updateBehavior(dt) {
    this.burstCd = Math.max(0, this.burstCd - dt)
    this.dashCd = Math.max(0, this.dashCd - dt)
    if (playIntro(this, dt)) return
    if (this.stunT > 0) {
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
    const hd = this._hd()
    switch (this.state) {
      case 'burstWind':
        this.vxTarget = 0
        this.facePlayer()
        this.playAnim('attack')
        if (this.stateT >= (this.overclocked ? 0.2 : 0.3)) {
          this.state = 'burst'
          this.stateT = 0
          this._burst()
        }
        return
      case 'burst':
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= 0.28) {
          this.state = 'chase'
          this.stateT = 0
          this.burstCd = this.overclocked ? 1.2 : 1.9
        }
        return
      case 'dashWind':
        this.vxTarget = 0
        this.facePlayer()
        this.playAnim('attack')
        if (this.stateT >= 0.26) {
          this.state = 'dash'
          this.stateT = 0
          this.body.vx = this.facing * this.speed * 3.2
          sfx(this, 'servo', 0.4, 1.4)
        }
        return
      case 'dash':
        this.vxTarget = this.facing * this.speed * 3.2
        this.playAnim('attack')
        if (this.stateT >= 0.3) {
          this.state = 'chase'
          this.stateT = 0
          this.dashCd = this.overclocked ? 1.4 : 2.4
        }
        return
      default:
        break
    }
    // chase：保持中距离、左右游走
    this.facePlayer()
    this.playAnim(Math.abs(this.body.vx) > 16 ? 'run' : 'idle')
    this.strafeT -= dt
    if (this.strafeT <= 0) {
      this.strafeT = 1.2 + Math.random()
      this.strafeDir *= -1
    }
    if (hd < 150) {
      this.vxTarget = -this.facing * this.speed * 0.9
    } else if (hd > 320) {
      this.vxTarget = this.facing * this.speed
    } else {
      this.vxTarget = this.strafeDir * this.speed * 0.5
    }
    if (hd < 170 && this.dashCd <= 0) {
      this.state = 'dashWind'
      this.stateT = 0
      this.vxTarget = 0
      return
    }
    if (this.burstCd <= 0 && hd < 540) {
      this.state = 'burstWind'
      this.stateT = 0
      this.vxTarget = 0
      return
    }
  }

  takeDamage(n, fromX = null) {
    super.takeDamage(n, fromX)
    if (this.alive && !this.overclocked && this.hp / this.maxHp <= 0.4) {
      this.overclocked = true
      this.speed = this.baseSpeed * 1.25
      spark(this, this.px, this._feetY() - 60, 0xff5644, 24, 320)
      shake(this, 0.4)
      sfx(this, 'alarm', 0.6, 0.8)
    }
  }

  die() {
    largeDeathFx(this, {
      particles: 32,
      sparks: 34,
      shake: 0.85,
      color: 0xff5644,
      extraLoot: [{ id: 'cell_small', n: 3, spread: 110 }],
    })
    super.die()
  }
}

Content.register(KIND.MONSTER, PSYCHO_BOSS_DEF.id, PSYCHO_BOSS_DEF, 'core')

// ========================================================== 超能暴走体
export const ESPER_DEF = {
  id: 'esper_berserk',
  name: '超能暴走体',
  en: 'ESPER BERSERK',
  family: 'anomaly',
  hp: 600,
  speed: 76,
  damage: 24,
  size: [98, 150],
  aggro: 700,
  attackRange: 560,
  attackType: 'ranged',
  attackCooldown: 2.0,
  xp: 190,
  gravity: 2000,
  elite: true,
  loot: [
    { id: 'reactor_core', chance: 0.5 },
    { id: 'fusion_lattice', chance: 0.35 },
    { id: 'quantum_chip', chance: 0.5 },
    { id: 'rare_earth', chance: 0.7, min: 2, max: 3 },
    { id: 'arc_emitter', chance: 0.3 },
  ],
  artId: 'esper_berserk',
  sound: 'thunder',
  biome: ['dump', 'factory', 'city'],
  desc: '它没有皮肤，只有一层不断抖动的光。靠近时，你的伺服电机会自己转向。',
}

export class EsperBerserk extends BaseMonster {
  constructor(game, x, y) {
    super(game, ESPER_DEF, x, y)
    this.psiCd = 1.6
    this.crushCd = 3
    this.phase2 = false
    this.baseSpeed = ESPER_DEF.speed
    initLarge(this, { intro: 1.5, activateRange: 820 })
    applyLargeArt(this)
    this.tell = createTell(this, { inner: 40, outer: 66, color: 0x9fd3e0 })
  }

  _feetY() {
    return this.body.y + this.body.h
  }

  _hd() {
    const p = this.player
    return p ? Math.abs(p.centerX - this.px) : Infinity
  }

  _barrage() {
    const p = this.player
    if (!p) return
    const sx = this.px
    const sy = this._feetY() - this.h * 0.7
    sfx(this, 'alarm', 0.35, 1.2)
    for (let k = 0; k < 5; k++) {
      const spread = (k - 2) * 0.22
      const tx = p.centerX + (k - 2) * 30
      const ty = p.centerY
      const dx = tx - sx
      const dy = ty - sy
      const len = Math.max(1, Math.hypot(dx, dy))
      const speed = 420
      const vx = (dx / len) * speed + Math.sin(spread) * 90
      const vy = (dy / len) * speed - 60
      let ok = false
      if (typeof this.game.spawnProjectile === 'function') {
        try {
          ok = !!this.game.spawnProjectile({
            x: sx,
            y: sy,
            vx,
            vy,
            gravity: 180,
            radius: 6,
            damage: ESPER_DEF.damage * 0.6,
            color: 0x9fd3e0,
            life: 2.2,
            type: 'psi',
            source: this.id,
          })
        } catch (e) {
          ok = false
        }
      }
      if (!ok) {
        this.hitPlayer(ESPER_DEF.damage * 0.5)
        break
      }
    }
    spark(this, sx, sy, 0x9fd3e0, 14, 260)
  }

  _crush() {
    const p = this.player
    if (!p) return
    aoe(this, p.centerX, p.centerY + 20, 96, ESPER_DEF.damage)
    puff(this, 18, 0x9fd3e0, 1.4)
    shake(this, 0.5)
    sfx(this, 'thunder', 0.5, 1.4)
  }

  updateBehavior(dt) {
    this.psiCd = Math.max(0, this.psiCd - dt)
    this.crushCd = Math.max(0, this.crushCd - dt)
    if (this.tell) {
      placeTell(this.tell, this.px, this._feetY() + 2, 1)
      if (this.tell.mat.opacity > 0) showTell(this.tell, Math.max(0, this.tell.mat.opacity - dt * 2))
    }
    if (playIntro(this, dt)) return
    if (this.stunT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }
    const p = this.player
    const active = updateActivation(this, dt)
    if (!p || p.dead || !active) {
      this.state = 'roam'
      roamStep(this, dt, { speedMul: 0.45 })
      return
    }
    const hd = this._hd()
    switch (this.state) {
      case 'psiWind':
        this.vxTarget = 0
        this.facePlayer()
        this.playAnim('attack')
        if (this.stateT >= (this.phase2 ? 0.34 : 0.46)) {
          this.state = 'psi'
          this.stateT = 0
          this._barrage()
        }
        return
      case 'psi':
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.stateT >= 0.4) {
          this.state = 'chase'
          this.stateT = 0
          this.psiCd = this.phase2 ? 1.4 : 2.2
          // 二阶段：放完弹幕后瞬移到房间另一侧
          if (this.phase2) {
            const { w } = roomBounds(this)
            const targetX = this.px > w / 2 ? 60 : w - this.body.w - 60
            spark(this, this.px, this._feetY() - 60, 0x9fd3e0, 18, 280)
            this.body.x = targetX
            spark(this, this.px, this._feetY() - 60, 0x9fd3e0, 18, 280)
          }
        }
        return
      case 'crushWind':
        this.vxTarget = 0
        this.playAnim('attack')
        if (this.tell) showTell(this.tell, 0.4 + Math.sin(this.stateT * 22) * 0.3)
        if (this.stateT >= 0.55) {
          this.state = 'chase'
          this.stateT = 0
          if (this.tell) showTell(this.tell, 0)
          this._crush()
          this.crushCd = this.phase2 ? 2.6 : 3.6
        }
        return
      default:
        break
    }
    // chase：缓慢逼近，偶尔悬浮抖动
    this.facePlayer()
    this.playAnim('run')
    this.vxTarget = hd > 220 ? this.facing * this.speed : 0
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
    if (hd < 200 && this.crushCd <= 0) {
      this.state = 'crushWind'
      this.stateT = 0
      this.vxTarget = 0
      if (this.tell) showTell(this.tell, 0.5)
      return
    }
    if (this.psiCd <= 0 && hd < 620) {
      this.state = 'psiWind'
      this.stateT = 0
      this.vxTarget = 0
      return
    }
  }

  takeDamage(n, fromX = null) {
    super.takeDamage(n, fromX)
    if (this.alive && !this.phase2 && this.hp / this.maxHp <= 0.45) {
      this.phase2 = true
      this.speed = this.baseSpeed * 1.2
      puff(this, 24, 0x9fd3e0, 1.6)
      shake(this, 0.5)
      sfx(this, 'thunder', 0.65, 0.9)
    }
  }

  die() {
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    largeDeathFx(this, {
      particles: 44,
      sparks: 30,
      shake: 1.1,
      color: 0x9fd3e0,
      extraLoot: [{ id: 'rare_earth', n: 2, spread: 120 }],
    })
    super.die()
  }

  dispose() {
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    super.dispose()
  }
}

Content.register(KIND.MONSTER, ESPER_DEF.id, ESPER_DEF, 'core')

export const TYRANT_DEFS = [CLAW_DEF, PSYCHO_BOSS_DEF, ESPER_DEF]
