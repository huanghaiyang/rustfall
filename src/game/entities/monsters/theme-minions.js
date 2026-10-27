// 主题站点专属小怪：服务器游魂 / 焊接壮汉 / 狂信者 / 外星浮球。
//
// 四只都继承 BaseMonster，各自有不同的接敌逻辑与两段以上招式，
// 由世界生成器按主题站点（themes.js）分配到房间的 monsters 列表里。
import { BaseMonster } from './base.js'
import { Content, KIND } from '../../core/registry.js'

/** 朝目标发射一枚投射物；引擎没有投射物系统时退化为近身判定。 */
function shoot(m, opts = {}) {
  const p = m.player
  if (!p) return false
  const sx = opts.x ?? m.px + m.facing * 18
  const sy = opts.y ?? m.py - 6
  const tx = opts.tx ?? p.centerX
  const ty = opts.ty ?? p.centerY - 8
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.max(1, Math.hypot(dx, dy))
  const speed = opts.speed ?? 420
  const g = m.game
  if (typeof g.spawnProjectile === 'function') {
    try {
      const ok = !!g.spawnProjectile({
        x: sx,
        y: sy,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed + (opts.lift ?? 0),
        gravity: opts.gravity ?? 0,
        radius: opts.radius ?? 4,
        damage: opts.damage ?? m.damage,
        color: opts.color ?? 0xff8a4a,
        life: opts.life ?? 1.6,
        type: opts.type ?? 'bullet',
        source: m.id,
      })
      if (ok) {
        m.game.sfx?.('alarm', { vol: 0.18, rate: 1.6 })
        return true
      }
    } catch (e) {
      /* ignore */
    }
  }
  if (m.distToPlayer() < m.attackRange) m.hitPlayer(m.damage)
  return false
}

// ============================================================ 服务器游魂
export const WRAITH_DEF = {
  id: 'server_wraith',
  name: '服务器游魂',
  en: 'SERVER WRAITH',
  family: 'machine',
  hp: 42,
  speed: 74,
  damage: 9,
  size: [34, 40],
  aggro: 400,
  attackRange: 300,
  attackCooldown: 1.7,
  xp: 10,
  gravity: 0,
  flying: true,
  hover: 66,
  loot: [
    { id: 'board_cpu', chance: 0.4 },
    { id: 'ram_stick', chance: 0.3 },
    { id: 'copper_wire', chance: 0.5 },
  ],
  artId: 'server_wraith',
  sound: 'alarm',
  desc: '坏掉的机房把自己重新启动了一次，于是机柜长出了手脚。它开火前显示屏会先花屏。',
}

export class ServerWraith extends BaseMonster {
  constructor(game, x, y) {
    super(game, WRAITH_DEF, x, y)
    this.burstT = 0
    this.blinkCd = 4
    this.drift = Math.random() * Math.PI * 2
  }

  updateBehavior(dt) {
    this.blinkCd = Math.max(0, this.blinkCd - dt)
    if (this.burstT > 0) {
      this.burstT -= dt
      this.vxTarget = 0
      this.playAnim('attack')
      if (this.burstT <= 0) this.attackCd = 1.5
      return
    }
    const p = this.player
    if (!p || p.dead) {
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    const d = this.distToPlayer()
    this.drift += dt * 1.7
    // 受击后瞬移拉开距离，逼玩家换位
    if (this.hurtT > 0 && d < 150 && this.blinkCd <= 0) {
      this.blinkCd = 5
      const dir = this.px >= p.centerX ? 1 : -1
      this.body.x = Math.max(40, Math.min((this.game.room?.data?.worldW || 3000) - 80, this.body.x + dir * 240))
      this.body.y -= 60
      for (let k = 0; k < 8; k++) this.game.spark?.(this.px, this.py, 0x8fc4ff, 1, 120)
    }
    this.facing = p.centerX >= this.px ? 1 : -1
    this.body.vx += Math.sin(this.drift) * 30 * dt
    this.vxTarget = this.body.vx
    this.body.vy = Math.sin(this.drift * 0.7) * 18
    this.playAnim('run')
    if (this.attackCd <= 0 && d < this.attackRange && this.hasLineOfSight(p.centerX, p.centerY)) {
      this.state = 'attack'
      this.burstT = 0.24
      this.attackCd = 9
      shoot(this, { speed: 460, color: 0x8fc4ff, damage: WRAITH_DEF.damage })
      shoot(this, { speed: 400, color: 0x8fc4ff, damage: WRAITH_DEF.damage, lift: -40, ty: p.centerY - 26 })
    }
  }

  performAttack() {
    shoot(this, { speed: 460, color: 0x8fc4ff })
  }
}

Content.register(KIND.MONSTER, WRAITH_DEF.id, WRAITH_DEF, 'core')

// ============================================================ 焊接壮汉
export const WELDER_DEF = {
  id: 'weld_brute',
  name: '焊接壮汉',
  en: 'WELD BRUTE',
  family: 'machine',
  hp: 96,
  speed: 52,
  damage: 17,
  size: [48, 52],
  aggro: 330,
  attackRange: 92,
  attackCooldown: 1.9,
  xp: 16,
  gravity: 2000,
  loot: [
    { id: 'scrap_plate', chance: 0.5 },
    { id: 'hydraulic_rod', chance: 0.35 },
    { id: 'servo_motor', chance: 0.25 },
  ],
  artId: 'weld_brute',
  sound: 'dig',
  desc: '他把焊枪当近战武器用。贴上来先抡一下，退开又会冲你喷一道火。',
}

export class WeldBrute extends BaseMonster {
  constructor(game, x, y) {
    super(game, WELDER_DEF, x, y)
    this.fireCd = 1.6
    this.slamCd = 0.8
  }

  _aoe(dmg, radius) {
    const x = this.px + this.facing * 46
    const y = this.body.y + this.body.h - 6
    const g = this.game
    if (typeof g.damageArea === 'function') g.damageArea(x, y, radius, dmg)
    else if (this.distToPlayer() < radius) this.hitPlayer(dmg)
    g.spark?.(x, y, 0xffb45a, 10, 220)
    g.sfx?.('thunder', { vol: 0.25, rate: 1.4 })
  }

  updateBehavior(dt) {
    this.fireCd = Math.max(0, this.fireCd - dt)
    this.slamCd = Math.max(0, this.slamCd - dt)
    const p = this.player
    if (!p || p.dead) {
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
    this.facePlayer()
    // 近距离抡焊枪
    if (d < 96 && this.slamCd <= 0) {
      this.slamCd = 2.6
      this.attackCd = 9
      this.state = 'attack'
      this.playAnim('attack')
      this._aoe(WELDER_DEF.damage, 84)
      return
    }
    // 中距离喷火（前摇 0.35s）
    if (d > 100 && d < 250 && this.fireCd <= 0) {
      this.fireCd = 3.4
      this.attackCd = 9
      this.state = 'attack'
      this.playAnim('attack')
      this._flameT = 0.22
      this.game.sfx?.('weld', { vol: 0.3 })
      return
    }
    if (this._flameT > 0) {
      this._flameT -= dt
      this.vxTarget = 0
      this.playAnim('attack')
      this._aoe(WELDER_DEF.damage * 0.8, 118)
      this._flameT -= 0.9
      return
    }
    this.state = 'chase'
    this.vxTarget = this.facing * this.speed
    this.playAnim('run')
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
    if (d < this.attackRange) this.tryAttack()
  }

  performAttack() {
    this._aoe(this.damage, 84)
  }
}

Content.register(KIND.MONSTER, WELDER_DEF.id, WELDER_DEF, 'core')

// ============================================================ 狂信者
export const FANATIC_DEF = {
  id: 'cult_fanatic',
  name: '狂信者',
  en: 'CULT FANATIC',
  family: 'human',
  hp: 34,
  speed: 92,
  damage: 11,
  size: [30, 52],
  aggro: 460,
  attackRange: 320,
  attackCooldown: 2.0,
  xp: 9,
  gravity: 2000,
  loot: [
    { id: 'cloth', chance: 0.6 },
    { id: 'chemical', chance: 0.4 },
    { id: 'rad_meds', chance: 0.15 },
  ],
  artId: 'cult_fanatic',
  sound: 'growl',
  desc: '他一边念着谁也听不懂的祷词，一边把燃烧瓶扔过来。靠近他会被炉子砸。',
}

export class CultFanatic extends BaseMonster {
  constructor(game, x, y) {
    super(game, x, y)
    this.throwCd = 1.4 + Math.random()
    this.zeal = false
  }

  updateBehavior(dt) {
    this.throwCd = Math.max(0, this.throwCd - dt)
    const p = this.player
    if (!p || p.dead) {
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    const d = this.distToPlayer()
    this.facePlayer()
    if (!this.zeal && this.hp / this.maxHp < 0.4) {
      this.zeal = true
      this.speed *= 1.35
      this.game.sfx?.('growl', { vol: 0.3, rate: 1.2 })
    }
    // 保持投掷距离
    if (d < 120) {
      this.vxTarget = -this.facing * this.speed
      this.playAnim('run')
    } else if (d > 300) {
      this.vxTarget = this.facing * this.speed
      this.playAnim('run')
    } else {
      this.vxTarget = 0
      this.playAnim('idle')
    }
    if (d < 90 && this.attackCd <= 0) {
      this.attackCd = 1.4
      this.throwCd = 0.8
      this.state = 'attack'
      this.playAnim('attack')
      this.hitPlayer(this.damage)
      return
    }
    if (this.throwCd <= 0 && d > 100 && d < this.attackRange) {
      this.throwCd = this.zeal ? 1.8 : 2.9
      this.attackCd = 9
      this.state = 'attack'
      this.playAnim('attack')
      shoot(this, {
        speed: 330,
        gravity: 700,
        lift: -160,
        damage: this.damage,
        color: 0xffb45a,
        radius: 5,
        life: 2.2,
        type: 'molotov',
      })
      this.game.sfx?.('pickup', { vol: 0.2 })
    }
  }

  performAttack() {
    this.hitPlayer(this.damage)
  }
}

Content.register(KIND.MONSTER, FANATIC_DEF.id, FANATIC_DEF, 'core')

// ============================================================ 外星浮球
export const ORB_DEF = {
  id: 'alien_orb',
  name: '外星浮球',
  en: 'ALIEN ORB',
  family: 'alien',
  hp: 52,
  speed: 66,
  damage: 13,
  size: [36, 34],
  aggro: 420,
  attackRange: 150,
  attackCooldown: 2.4,
  xp: 13,
  gravity: 0,
  flying: true,
  hover: 96,
  loot: [
    { id: 'rare_earth', chance: 0.3 },
    { id: 'sensor_unit', chance: 0.35 },
    { id: 'chemical', chance: 0.3 },
  ],
  artId: 'alien_orb',
  sound: 'alarm',
  desc: '它不落地。被击中一次就会换一个位置，然后再张开外壳放一圈脉冲。',
}

export class AlienOrb extends BaseMonster {
  constructor(game, x, y) {
    super(game, x, y)
    this.ringCd = 1.2
    this.phase = Math.random() * Math.PI * 2
    this.blinkCd = 2.2
  }

  _ring() {
    const g = this.game
    if (typeof g.damageArea === 'function') g.damageArea(this.px, this.py, 120, ORB_DEF.damage)
    else if (this.distToPlayer() < 120) this.hitPlayer(ORB_DEF.damage)
    g.spark?.(this.px, this.py, 0x8fc4ff, 14, 300)
    g.shake?.(0.25)
    this.ringCd = 2.8
  }

  updateBehavior(dt) {
    this.ringCd = Math.max(0, this.ringCd - dt)
    this.blinkCd = Math.max(0, this.blinkCd - dt)
    const p = this.player
    if (!p || p.dead) {
      this.vxTarget = 0
      this.playAnim('idle')
      return
    }
    const d = this.distToPlayer()
    this.phase += dt * 1.4
    this.facing = p.centerX >= this.px ? 1 : -1
    // 受击瞬移
    if (this.hurtT > 0 && this.blinkCd <= 0) {
      this.blinkCd = 3.4
      const dir = this.px >= p.centerX ? 1 : -1
      const w = this.game.room?.data?.worldW || 3000
      this.body.x = Math.max(50, Math.min(w - 70, this.body.x + dir * 210))
      this.body.y = Math.max(60, this.body.y - 70)
      this.game.spark?.(this.px, this.py, 0x8fc4ff, 10, 180)
      return
    }
    // 环绕玩家漂移
    const targetX = p.centerX - this.facing * 150
    this.vxTarget = Math.max(-80, Math.min(80, (targetX - this.px) * 0.9))
    this.body.vy = Math.cos(this.phase) * 26
    this.playAnim('run')
    if (this.ringCd <= 0 && d < 130) {
      this.state = 'attack'
      this.playAnim('attack')
      this._ring()
      return
    }
    if (this.attackCd <= 0 && d < 240) {
      this.attackCd = 2.6
      this.playAnim('attack')
      shoot(this, { speed: 380, color: 0x8fc4ff, damage: ORB_DEF.damage, ty: p.centerY })
    }
  }

  performAttack() {
    this._ring()
  }
}

Content.register(KIND.MONSTER, ORB_DEF.id, ORB_DEF, 'core')

export const THEME_MINION_IDS = [WRAITH_DEF.id, WELDER_DEF.id, FANATIC_DEF.id, ORB_DEF.id]
