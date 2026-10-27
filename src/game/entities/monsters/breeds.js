// 新增怪物种群：辐射尸鬼 / 隧道猎犬 / 义体螳螂 / 赛博精神病。
// 灵感分别来自《辐射》《地铁》《赛博朋克》。四个类都继承 BaseMonster，
// 只重写 updateBehavior 与 performAttack，保持与旧怪物的手感一致。
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

// ============================================================= 辐尸（FALLOUT）
export const GHOUL_DEF = {
  id: 'ghoul_husk',
  name: '辐尸',
  en: 'GHOUL HUSK',
  family: 'mutant',
  hp: 30,
  speed: 118,
  damage: 9,
  size: [38, 40],
  aggro: 340,
  attackRange: 48,
  attackCooldown: 1.1,
  xp: 7,
  gravity: 2000,
  pack: [2, 4],
  loot: [
    { id: 'cloth', chance: 0.5 },
    { id: 'chemical', chance: 0.3 },
    { id: 'rad_meds', chance: 0.12 },
  ],
  artId: 'ghoul_husk',
  sound: 'growl',
  biome: ['city', 'dump', 'factory'],
  desc: '皮肤像风干的皮革一样贴在骨头上。它还会扑，而且扑完还会再扑一次。',
}

export class GhoulHusk extends BaseMonster {
  constructor(game, x, y) {
    super(game, GHOUL_DEF, x, y)
    this.lungeCd = 0.6 + Math.random()
    this.lungeT = 0
  }

  updateBehavior(dt) {
    this.lungeCd = Math.max(0, this.lungeCd - dt)
    const p = this.player
    if (!p || p.dead) {
      this.state = 'idle'
      this.vxTarget = 0
      this.playAnim('idle')
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
      this.state = 'patrol'
      if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      this.vxTarget = this.facing * this.speed * 0.35
      this.playAnim('run')
      return
    }
    this.facePlayer()
    // 中距离扑击：一次前摇后猛地弹出去
    if (this.lungeT > 0) {
      this.lungeT -= dt
      this.vxTarget = this.facing * this.speed * 2.1
      this.playAnim('attack')
      if (this.lungeT <= 0) this.attackCd = 0.9
      return
    }
    if (d < 220 && d > 60 && this.lungeCd <= 0 && this.body.onGround) {
      this.lungeT = 0.22
      this.lungeCd = 2.6 + Math.random()
      this.body.vy = -220
      this.game.sfx?.('growl', { vol: 0.2, rate: 1.5 })
      return
    }
    this.state = 'chase'
    this.vxTarget = this.facing * this.speed
    this.playAnim('run')
    if (d <= this.attackRange) this.tryAttack()
  }

  performAttack() {
    this.hitPlayer(this.damage)
    this.game.sfx?.('hurt', { vol: 0.2, rate: 1.7 })
  }
}

Content.register(KIND.MONSTER, GHOUL_DEF.id, GHOUL_DEF, 'core')

// ============================================================= 隧道猎犬（METRO）
export const HOUND_DEF = {
  id: 'tunnel_hound',
  name: '隧道猎犬',
  en: 'TUNNEL HOUND',
  family: 'beast',
  hp: 46,
  speed: 156,
  damage: 12,
  size: [46, 28],
  aggro: 460,
  attackRange: 52,
  attackCooldown: 1.25,
  xp: 9,
  gravity: 2000,
  pack: [2, 3],
  loot: [
    { id: 'scrap_plate', chance: 0.45 },
    { id: 'rubber', chance: 0.3 },
    { id: 'chemical', chance: 0.2 },
  ],
  artId: 'tunnel_hound',
  sound: 'growl',
  biome: ['factory', 'dump'],
  desc: '没有眼睛，靠震动找路。它跑起来时，整条隧道都在替你数秒。',
}

export class TunnelHound extends BaseMonster {
  constructor(game, x, y) {
    super(game, HOUND_DEF, x, y)
    this.jumpCd = 0.8
    this.sniffT = 0
  }

  updateBehavior(dt) {
    this.jumpCd = Math.max(0, this.jumpCd - dt)
    const p = this.player
    if (!p || p.dead) {
      this.state = 'idle'
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    if (this.hurtT > 0) {
      this.playAnim('hurt')
      return
    }
    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)
    if (!sees) {
      this.state = 'patrol'
      this.sniffT -= dt
      if (this.sniffT <= 0) {
        this.sniffT = 0.8 + Math.random() * 1.4
        if (Math.random() < 0.4) this.facing *= -1
      }
      if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      this.vxTarget = this.facing * this.speed * 0.4
      this.playAnim('run')
      return
    }
    this.facePlayer()
    this.state = 'chase'
    this.vxTarget = this.facing * this.speed
    // 光凭嗅觉冲上来，遇到高低差直接跳
    if (this.body.onGround && (p.centerY < this.py - 24 || this.wallAhead()) && this.jumpCd <= 0 && d < 260) {
      this.body.vy = -320
      this.jumpCd = 1.4
      this.game.sfx?.('growl', { vol: 0.24, rate: 1.35 })
    }
    this.playAnim('run')
    if (d <= this.attackRange) this.tryAttack()
  }

  performAttack() {
    this.hitPlayer(this.damage)
    this.body.vx = this.facing * 160
  }
}

Content.register(KIND.MONSTER, HOUND_DEF.id, HOUND_DEF, 'core')

// ============================================================= 义体螳螂（CYBERPUNK）
export const MANTIS_DEF = {
  id: 'cyber_mantis',
  name: '义体螳螂',
  en: 'CHROME MANTIS',
  family: 'rogue',
  hp: 64,
  speed: 92,
  damage: 17,
  size: [52, 38],
  aggro: 380,
  attackRange: 82,
  attackCooldown: 2.0,
  xp: 14,
  gravity: 2000,
  loot: [
    { id: 'servo_motor', chance: 0.4 },
    { id: 'copper_wire', chance: 0.5 },
    { id: 'scrap_plate', chance: 0.6 },
    { id: 'board_cpu', chance: 0.25 },
  ],
  artId: 'cyber_mantis',
  biome: ['factory', 'city'],
  desc: '一双手术刀级别的镰臂，出厂时是用来拆弹的。现在它只拆你。',
}

const MANTIS_WIND = 0.34

export class CyberMantis extends BaseMonster {
  constructor(game, x, y) {
    super(game, MANTIS_DEF, x, y)
    this.windT = 0
    this.dashT = 0
  }

  updateBehavior(dt) {
    const p = this.player
    if (this.windT > 0) {
      this.windT -= dt
      this.vxTarget = 0
      this.playAnim('attack')
      if (this.windT <= 0) {
        this.dashT = 0.26
        this.attackCd = this.def.attackCooldown
        this.facePlayer()
        this.performAttack()
      }
      return
    }
    if (this.dashT > 0) {
      this.dashT -= dt
      this.vxTarget = this.facing * this.speed * 3.4
      this.playAnim('attack')
      return
    }
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
    if (!sees) {
      this.state = 'patrol'
      if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      this.vxTarget = this.facing * this.speed * 0.4
      this.playAnim('run')
      return
    }
    this.facePlayer()
    this.state = 'chase'
    this.vxTarget = this.facing * this.speed
    this.playAnim('run')
    if (d <= this.attackRange && this.attackCd <= 0) this.windT = MANTIS_WIND
  }

  performAttack() {
    // 镰臂横扫：判定比普通近战宽一点
    const p = this.player
    if (!p || p.dead) return
    const dx = Math.abs(p.centerX - this.px)
    const dy = Math.abs(p.centerY - this.py)
    if (dx < 120 && dy < 70) this.hitPlayer(this.damage)
    this.game.sfx?.('servo', { vol: 0.3, rate: 1.4 })
    this.game.cameraShake?.(0.12)
  }
}

Content.register(KIND.MONSTER, MANTIS_DEF.id, MANTIS_DEF, 'core')

// ============================================================= 赛博精神病（CYBERPUNK）
export const PSYCHO_DEF = {
  id: 'psycho_punk',
  name: '赛博精神病',
  en: 'CYBERPSYCHO',
  family: 'rogue',
  hp: 72,
  speed: 74,
  damage: 12,
  size: [38, 56],
  aggro: 480,
  attackRange: 360,
  attackCooldown: 1.9,
  xp: 18,
  gravity: 2000,
  loot: [
    { id: 'cell_small', chance: 0.8, min: 2, max: 4 },
    { id: 'stim_patch', chance: 0.4 },
    { id: 'board_cpu', chance: 0.3 },
    { id: 'cloth', chance: 0.6 },
  ],
  artId: 'psycho_punk',
  sound: 'alarm',
  biome: ['city', 'factory'],
  desc: '他一直在自言自语，内容从股票行情变成了一段军规。枪口始终对着你。',
}

export class PsychoPunk extends BaseMonster {
  constructor(game, x, y) {
    super(game, PSYCHO_DEF, x, y)
    this.strafeDir = Math.random() < 0.5 ? -1 : 1
    this.strafeT = 1 + Math.random()
    this.muzzleT = 0
  }

  updateBehavior(dt) {
    this.muzzleT = Math.max(0, this.muzzleT - dt)
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
    if (!sees) {
      this.state = 'patrol'
      if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      this.vxTarget = this.facing * this.speed * 0.35
      this.playAnim('run')
      return
    }
    this.facePlayer()
    this.strafeT -= dt
    if (this.strafeT <= 0) {
      this.strafeT = 1.1 + Math.random() * 1.5
      this.strafeDir *= -1
    }
    // 保持射击距离：太近后退，太远接近，其余横向游走
    if (d < 140) {
      const back = -this.facing
      this.vxTarget = this.groundAhead(back) ? back * this.speed * 1.1 : 0
    } else if (d > 300) {
      this.vxTarget = this.facing * this.speed
    } else {
      this.vxTarget = this.strafeDir * this.speed * 0.45
      if (this.wallAhead(this.strafeDir) || !this.groundAhead(this.strafeDir)) {
        this.strafeDir *= -1
        this.vxTarget = this.strafeDir * this.speed * 0.4
      }
    }
    this.playAnim(Math.abs(this.body.vx) > 12 ? 'run' : 'idle')
    if (this.attackCd <= 0 && d <= this.attackRange && Math.abs(p.centerY - this.py) < 220) {
      this.tryAttack()
    }
  }

  performAttack() {
    const p = this.player
    if (!p) return
    const sx = this.px + this.facing * 16
    const sy = this.py - 8
    const dx = p.centerX - sx
    const dy = p.centerY - sy
    const len = Math.max(1, Math.hypot(dx, dy))
    const speed = 520
    this.muzzleT = 0.12
    this.game.sfx?.('alarm', { vol: 0.24, rate: 1.7 })
    this.game.particles?.emitMany?.('spark', sx, sy, 4)
    let handled = false
    if (typeof this.game.spawnProjectile === 'function') {
      try {
        handled = !!this.game.spawnProjectile({
          x: sx,
          y: sy,
          vx: (dx / len) * speed,
          vy: (dy / len) * speed,
          gravity: 0,
          radius: 4,
          damage: this.damage,
          color: 0xffb45a,
          life: 1.6,
          type: 'bullet',
          source: this.id,
        })
      } catch (e) {
        handled = false
      }
    }
    if (!handled && Math.hypot(p.centerX - this.px, p.centerY - this.py) < this.attackRange) {
      this.hitPlayer(this.damage)
    }
  }
}

Content.register(KIND.MONSTER, PSYCHO_DEF.id, PSYCHO_DEF, 'core')

export const BREED_DEFS = [GHOUL_DEF, HOUND_DEF, MANTIS_DEF, PSYCHO_DEF]
