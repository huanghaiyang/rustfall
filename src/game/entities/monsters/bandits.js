import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/**
 * 匪徒小怪（非攻击性）——望风 / 掠货 / 拾荒。
 *
 * 设计目标：给废土房间添「活人」而不是又一个威胁源。
 *   · 不主动攻击：tryAttack 恒 false，performAttack 空实现，damage 0。
 *   · 平时各干各的：望风来回踱步、掠货背着麻袋挪动、拾荒蹲着翻找。
 *   · 玩家靠近（约 240px）立刻逃跑；被打中后 panic 3.2 秒，逃得更快更远。
 *   · 击杀掉落日用小件（绷带 / 布料 / 零件），不爆武器。
 */

const FLEE_NEAR = 240
const FLEE_FAR = 340

export class BanditBase extends BaseMonster {
  constructor(game, def, x, y) {
    super(game, def, x, y)
    this.panicT = 0
    this.yelped = false
  }

  /** 匪徒永远不还手 */
  tryAttack() {
    return false
  }

  performAttack() {}

  takeDamage(n, fromX = null) {
    super.takeDamage(n, fromX)
    if (this.alive) this.panicT = 3.2
  }

  updateBehavior(dt) {
    this.panicT = Math.max(0, this.panicT - dt)
    if (this.hurtT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }

    const p = this.player
    const d = p && !p.dead ? this.distToPlayer() : Infinity
    const fleeR = this.panicT > 0 ? FLEE_FAR : FLEE_NEAR

    if (d < fleeR) {
      // 背对玩家跑；被墙/悬崖挡住就掉头（慌不择路，可能短暂朝玩家冲）
      let dir = this.px >= p.centerX ? 1 : -1
      if (this.wallAhead(dir) || !this.groundAhead(dir)) dir = -dir
      if (this.wallAhead(dir) || !this.groundAhead(dir)) {
        // 两头都是墙：原地贴着不动，等玩家走开
        this.facing = dir
        this.vxTarget = 0
      } else {
        this.facing = dir
        this.vxTarget = dir * this.speed * (this.panicT > 0 ? 1.45 : 1)
      }
      this.playAnim('run')
      if (!this.yelped && d < FLEE_NEAR * 0.65) {
        this.yelped = true
        this.game.sfx?.('hurt', { vol: 0.14, rate: 2.2 })
      }
      return
    }

    if (d > fleeR + 80) this.yelped = false
    this.idleBehavior(dt)
  }

  /** 默认：慢速游荡 */
  idleBehavior(dt) {
    this.state = 'patrol'
    if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
    this.vxTarget = this.facing * this.speed * 0.32
    this.playAnim(Math.abs(this.body.vx) > 12 ? 'run' : 'idle')
  }
}

export class BanditLookout extends BanditBase {
  constructor(game, x, y) {
    super(game, DEF_LOOKOUT, x, y)
  }

  /** 望风：在自己的据点附近来回踱步，走两步停一下。 */
  idleBehavior(dt) {
    this.pauseT = (this.pauseT ?? 1.2) - dt
    this.walkT = (this.walkT ?? 0) - dt
    if (this.pauseT > 0) {
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    if (this.walkT <= 0) {
      this.walkT = 1.4 + Math.random() * 1.4
      this.pauseT = 0.9 + Math.random() * 1.8
      if (Math.random() < 0.6) this.facing *= -1
    }
    if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
    this.vxTarget = this.facing * this.speed * 0.3
    this.playAnim('run')
  }
}

export class BanditLooter extends BanditBase {
  constructor(game, x, y) {
    super(game, DEF_LOOTER, x, y)
  }
}

export class BanditScav extends BanditBase {
  constructor(game, x, y) {
    super(game, DEF_SCAV, x, y)
  }

  /** 拾荒：大部分时间蹲着翻找（idle 帧就是蹲姿），偶尔挪两步换地方。 */
  idleBehavior(dt) {
    this.restT = (this.restT ?? 2.5) - dt
    this.stepT = (this.stepT ?? 0) - dt
    if (this.restT > 0) {
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    if (this.stepT <= 0) {
      this.stepT = 1.1 + Math.random() * 1.3
      this.restT = 2.6 + Math.random() * 3.2
      if (Math.random() < 0.5) this.facing *= -1
    }
    if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
    this.vxTarget = this.facing * this.speed * 0.28
    this.playAnim('run')
  }
}

export const DEF_LOOKOUT = {
  id: 'bandit_lookout',
  name: '望风匪徒',
  en: 'LOOKOUT',
  family: 'bandit',
  hp: 26,
  speed: 152,
  damage: 0,
  size: [28, 42],
  aggro: 0,
  attackRange: 0,
  attackType: 'none',
  attackCooldown: 9,
  xp: 5,
  gravity: 2000,
  loot: [
    { id: 'bandage', chance: 0.5 },
    { id: 'cloth', chance: 0.6, min: 1, max: 2 },
    { id: 'glass_shard', chance: 0.4 },
    { id: 'fuse', chance: 0.25 },
  ],
  artId: 'bandit_lookout',
  sound: 'hurt',
  biome: ['city', 'metro', 'hospital', 'port'],
  desc: '匪帮的眼睛，兜帽里只剩一只亮的义眼。它不负责动手，只负责记住你的脸。',
}

export const DEF_LOOTER = {
  id: 'bandit_looter',
  name: '掠货匪徒',
  en: 'LOOTER',
  family: 'bandit',
  hp: 38,
  speed: 132,
  damage: 0,
  size: [30, 44],
  aggro: 0,
  attackRange: 0,
  attackType: 'none',
  attackCooldown: 9,
  xp: 7,
  gravity: 2000,
  loot: [
    { id: 'scrap_plate', chance: 0.55 },
    { id: 'copper_wire', chance: 0.45 },
    { id: 'cell_small', chance: 0.3 },
    { id: 'lubricant', chance: 0.3 },
    { id: 'repair_kit', chance: 0.08 },
  ],
  artId: 'bandit_looter',
  sound: 'hurt',
  biome: ['city', 'dump', 'port', 'factory'],
  desc: '背上的麻袋比它还沉，绳结打得很紧。它只抢不会动的废墟，不会动的你它也不碰。',
}

export const DEF_SCAV = {
  id: 'bandit_scav',
  name: '拾荒匪徒',
  en: 'SCAVENGER',
  family: 'bandit',
  hp: 30,
  speed: 118,
  damage: 0,
  size: [28, 40],
  aggro: 0,
  attackRange: 0,
  attackType: 'none',
  attackCooldown: 9,
  xp: 6,
  gravity: 2000,
  loot: [
    { id: 'plastic_chunk', chance: 0.55 },
    { id: 'rubber', chance: 0.45 },
    { id: 'dog_food', chance: 0.25 },
    { id: 'bandage', chance: 0.35 },
    { id: 'cloth', chance: 0.3 },
  ],
  artId: 'bandit_scav',
  sound: 'hurt',
  biome: ['village', 'dump', 'metro'],
  desc: '蹲在废料堆里翻找的人。撬棍只用来撬铁皮，见人就跑，跑得比谁都快。',
}

Content.register(KIND.MONSTER, DEF_LOOKOUT.id, DEF_LOOKOUT, 'core')
Content.register(KIND.MONSTER, DEF_LOOTER.id, DEF_LOOTER, 'core')
Content.register(KIND.MONSTER, DEF_SCAV.id, DEF_SCAV, 'core')
