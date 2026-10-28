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
  const ang = Math.atan2(dy, dx) + (opts.spread ?? 0)
  const g = m.game
  if (typeof g.spawnProjectile === 'function') {
    try {
      const ok = !!g.spawnProjectile({
        x: sx,
        y: sy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed + (opts.lift ?? 0),
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

// ============================================================ 新增主题小怪（10）
// 共同约定：每个至少两种接敌手段（远/近或位移+范围），避免只会直线冲脸。

/** 短距离扑击：朝面向方向冲刺 t 秒 */
function lunge(m, mul = 2.6, t = 0.22) {
  m._lungeT = t
  m._lungeMul = mul
  m.game?.sfx?.('step', { vol: 0.12, rate: 1.5 })
}

/** 在 updateBehavior 开头调用：冲刺期间接管水平速度，返回 true 表示本帧已被冲刺占用 */
function dashStep(m, dt) {
  if (!(m._lungeT > 0)) return false
  m._lungeT -= dt
  m.vxTarget = m.facing * m.speed * (m._lungeMul || 2.6)
  m.playAnim('run')
  return true
}

/** 在怪物脚边做一次范围伤害 */
function stomp(m, radius, dmg, color = 0xffb45a) {
  const g = m.game
  const y = m.body.y + m.body.h - 4
  if (typeof g.damageArea === 'function') g.damageArea(m.px, y, radius, dmg)
  else if (m.distToPlayer() < radius) m.hitPlayer(dmg)
  g.spark?.(m.px, y, color, 10, 200)
  g.shake?.(0.2)
}

// ------------------------------------------------------------ 保管库傀儡
export const VAULT_PUPPET_DEF = {
  id: 'vault_puppet',
  name: '保管库傀儡',
  en: 'VAULT PUPPET',
  family: 'machine',
  hp: 124,
  speed: 36,
  damage: 18,
  size: [44, 56],
  aggro: 360,
  attackRange: 104,
  attackCooldown: 2.3,
  xp: 20,
  gravity: 2000,
  loot: [
    { id: 'scrap_plate', chance: 0.55 },
    { id: 'bearing', chance: 0.35 },
    { id: 'keycard_archive', chance: 0.2 },
  ],
  artId: 'vault_puppet',
  sound: 'servo',
  desc: '寄存柜的锁芯焊在一具旧机体上。左手挡，右手扔钥匙串，正面硬打会被它格掉一半。',
}
export class VaultPuppet extends BaseMonster {
  constructor(game, x, y) {
    super(game, VAULT_PUPPET_DEF, x, y)
    this.throwCd = 1.4
    this.bashCd = 1.2
  }
  takeDamage(n, fromX = null) {
    // 正面盾牌减伤：从面向侧打过来只吃一半
    if (fromX != null && Math.sign(fromX - this.px) === this.facing) n *= 0.5
    super.takeDamage(n, fromX)
  }
  updateBehavior(dt) {
    this.throwCd = Math.max(0, this.throwCd - dt)
    this.bashCd = Math.max(0, this.bashCd - dt)
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.facePlayer()
    if (d < 108 && this.bashCd <= 0) {
      this.bashCd = 2.6
      this.state = 'attack'
      this.playAnim('attack')
      stomp(this, 92, this.damage, 0xd8c070)
      return
    }
    if (d > 120 && d < 340 && this.throwCd <= 0) {
      this.throwCd = 3.2
      this.state = 'attack'
      this.playAnim('attack')
      shoot(this, { speed: 360, gravity: 620, lift: -170, radius: 5, color: 0xd8c070, type: 'bolt' })
      return
    }
    this.vxTarget = d > 90 ? this.facing * this.speed : 0
    this.playAnim(this.vxTarget ? 'run' : 'idle')
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
  }
}
Content.register(KIND.MONSTER, VAULT_PUPPET_DEF.id, VAULT_PUPPET_DEF, 'core')

// ------------------------------------------------------------ 矿洞暗影
export const MINE_SHADE_DEF = {
  id: 'mine_shade',
  name: '矿洞暗影',
  en: 'MINE SHADE',
  family: 'mutant',
  hp: 58,
  speed: 96,
  damage: 12,
  size: [36, 50],
  aggro: 460,
  attackRange: 88,
  attackCooldown: 1.5,
  xp: 11,
  gravity: 2000,
  loot: [
    { id: 'uranium_dust', chance: 0.25 },
    { id: 'cloth', chance: 0.5 },
    { id: 'lubricant', chance: 0.3 },
  ],
  artId: 'mine_shade',
  sound: 'growl',
  desc: '它只在没有直射光的地方成形。你打它它会沉进地里，从另一个影子里站起来。',
}
export class MineShade extends BaseMonster {
  constructor(game, x, y) {
    super(game, MINE_SHADE_DEF, x, y)
    this.sinkCd = 2.8
    this.shadeT = 0
    this.throwCd = 2.2
  }
  _shadeStep() {
    const p = this.player
    if (!p) return
    const dir = p.centerX >= this.px ? 1 : -1
    const w = this.game.room?.data?.worldW || 3000
    this.body.x = Math.max(40, Math.min(w - 70, this.body.x + dir * 130))
    this.game.spark?.(this.px, this.body.y + this.body.h - 6, 0x3a2a4a, 12, 150)
    this.sinkCd = 4.2
    this.shadeT = 0.35
  }
  updateBehavior(dt) {
    this.sinkCd = Math.max(0, this.sinkCd - dt)
    this.throwCd = Math.max(0, this.throwCd - dt)
    if (this.shadeT > 0) { this.shadeT -= dt; this.vxTarget = 0; this.playAnim('hurt'); return }
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.facePlayer()
    if (this.hurtT > 0 && this.sinkCd <= 0 && d < 180) return this._shadeStep()
    if (d > 130 && this.throwCd <= 0) {
      this.throwCd = 3.0
      this.playAnim('attack')
      shoot(this, { speed: 320, gravity: 520, lift: -120, radius: 4, color: 0x6a5a7a, type: 'rock' })
      return
    }
    if (d < 96 && this.attackCd <= 0) return this.tryAttack()
    this.state = 'chase'
    this.vxTarget = this.facing * this.speed
    this.playAnim('run')
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
  }
  performAttack() { stomp(this, 76, this.damage, 0x6a5a7a) }
}
Content.register(KIND.MONSTER, MINE_SHADE_DEF.id, MINE_SHADE_DEF, 'core')

// ------------------------------------------------------------ 血仆
export const BLOOD_THRALL_DEF = {
  id: 'blood_thrall',
  name: '血仆',
  en: 'BLOOD THRALL',
  family: 'mutant',
  hp: 68,
  speed: 104,
  damage: 13,
  size: [34, 48],
  aggro: 520,
  attackRange: 92,
  attackCooldown: 1.4,
  xp: 12,
  gravity: 2000,
  loot: [
    { id: 'med_gel', chance: 0.18 },
    { id: 'cloth', chance: 0.5 },
    { id: 'rad_meds', chance: 0.12 },
  ],
  artId: 'blood_thrall',
  sound: 'growl',
  desc: '它扑上来咬一口就退回暗处，咬中会把自己的伤口补上。血袋串在腰上，跑起来叮当响。',
}
export class BloodThrall extends BaseMonster {
  constructor(game, x, y) {
    super(game, BLOOD_THRALL_DEF, x, y)
    this.leapCd = 1.6
    this.retreatT = 0
    this.frenzy = false
  }
  performAttack() {
    const dmg = this.damage
    this.hitPlayer(dmg)
    // 吸血：命中回复少量生命
    this.hp = Math.min(this.maxHp, this.hp + 7)
    this.game.spark?.(this.px, this.py, 0xb03040, 8, 160)
  }
  updateBehavior(dt) {
    this.leapCd = Math.max(0, this.leapCd - dt)
    if (dashStep(this, dt)) return
    if (this.retreatT > 0) { this.retreatT -= dt; this.vxTarget = -this.facing * this.speed; this.playAnim('run'); return }
    if (!this.frenzy && this.hp / this.maxHp < 0.45) {
      this.frenzy = true
      this.speed *= 1.3
      this.game.sfx?.('growl', { vol: 0.3, rate: 1.15 })
    }
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.facePlayer()
    if (d > 120 && d < 320 && this.leapCd <= 0) {
      this.leapCd = this.frenzy ? 1.6 : 2.4
      this.body.vy = -190
      lunge(this, 3.0, 0.26)
      this.playAnim('run')
      return
    }
    if (d < 92 && this.attackCd <= 0) {
      this.tryAttack()
      this.retreatT = 0.28
      return
    }
    this.state = 'chase'
    this.vxTarget = this.facing * this.speed
    this.playAnim('run')
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
  }
}
Content.register(KIND.MONSTER, BLOOD_THRALL_DEF.id, BLOOD_THRALL_DEF, 'core')

// ------------------------------------------------------------ 浓雾潜行者
export const FOG_STALKER_DEF = {
  id: 'fog_stalker',
  name: '浓雾潜行者',
  en: 'FOG STALKER',
  family: 'mutant',
  hp: 74,
  speed: 82,
  damage: 14,
  size: [38, 50],
  aggro: 380,
  attackRange: 96,
  attackCooldown: 1.8,
  xp: 13,
  gravity: 0,
  flying: true,
  hover: 44,
  loot: [
    { id: 'cloth', chance: 0.55 },
    { id: 'sensor_unit', chance: 0.2 },
    { id: 'chemical', chance: 0.3 },
  ],
  artId: 'fog_stalker',
  sound: 'growl',
  desc: '雾里只能看见它的一对眼。它先绕着你走半圈，再从侧后方贴上来。',
}
export class FogStalker extends BaseMonster {
  constructor(game, x, y) {
    super(game, FOG_STALKER_DEF, x, y)
    this.orbit = Math.random() * Math.PI * 2
    this.orbitDir = Math.random() < 0.5 ? 1 : -1
    this.lungeCd = 2.6
    this.puffCd = 1.2
  }
  updateBehavior(dt) {
    this.lungeCd = Math.max(0, this.lungeCd - dt)
    this.puffCd = Math.max(0, this.puffCd - dt)
    if (dashStep(this, dt)) return
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.orbit += dt * 0.9 * this.orbitDir
    this.facing = p.centerX >= this.px ? 1 : -1
    if (this.puffCd <= 0) {
      this.puffCd = 1.6
      this.game.spark?.(this.px, this.py + 10, 0xa8b8b8, 5, 80)
    }
    if (this.lungeCd <= 0 && d < 170) {
      this.lungeCd = 3.4
      this.facePlayer()
      lunge(this, 3.4, 0.3)
      this.playAnim('attack')
      this.attackCd = 1.1
      return
    }
    // 绕着玩家画弧，而不是直线扑
    const tx = p.centerX + Math.cos(this.orbit) * 150
    this.vxTarget = Math.max(-this.speed, Math.min(this.speed, (tx - this.px) * 1.6))
    this.body.vy = Math.sin(this.orbit * 1.3) * 22
    this.playAnim('run')
    if (d < 96 && this.attackCd <= 0) this.tryAttack()
  }
  performAttack() { stomp(this, 80, this.damage, 0xa8b8b8) }
}
Content.register(KIND.MONSTER, FOG_STALKER_DEF.id, FOG_STALKER_DEF, 'core')

// ------------------------------------------------------------ 朋克劫匪
export const PUNK_RAIDER_DEF = {
  id: 'punk_raider',
  name: '朋克劫匪',
  en: 'PUNK RAIDER',
  family: 'human',
  hp: 62,
  speed: 88,
  damage: 12,
  size: [32, 50],
  aggro: 480,
  attackRange: 300,
  attackCooldown: 1.9,
  xp: 11,
  gravity: 2000,
  loot: [
    { id: 'cloth', chance: 0.5 },
    { id: 'chemical', chance: 0.35 },
    { id: 'cell_small', chance: 0.25 },
  ],
  artId: 'punk_raider',
  sound: 'radio',
  desc: '削短的双管、自制的燃烧瓶、钉了钉子的靴子。他先扫一枪，再扔一瓶，最后才上来踹。',
}
export class PunkRaider extends BaseMonster {
  constructor(game, x, y) {
    super(game, PUNK_RAIDER_DEF, x, y)
    this.shotCd = 1.2
    this.molotovCd = 3.2
    this.strafe = Math.random() < 0.5 ? 1 : -1
    this.strafeT = 1.4
  }
  updateBehavior(dt) {
    this.shotCd = Math.max(0, this.shotCd - dt)
    this.molotovCd = Math.max(0, this.molotovCd - dt)
    this.strafeT -= dt
    if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random(); this.strafe *= -1 }
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.facePlayer()
    // 近距离：踹一脚
    if (d < 70 && this.attackCd <= 0) { this.tryAttack(); return }
    // 中距离：双管散射
    if (d < 250 && this.shotCd <= 0) {
      this.shotCd = 2.4
      this.playAnim('attack')
      for (let k = -1; k <= 1; k++) shoot(this, { speed: 620, radius: 3, color: 0xffd27a, spread: k * 0.1 })
      this.game.sfx?.('hit', { vol: 0.18, rate: 1.4 })
      return
    }
    // 远距离：燃烧瓶抛物线
    if (d >= 250 && this.molotovCd <= 0) {
      this.molotovCd = 4.2
      this.playAnim('attack')
      shoot(this, { speed: 320, gravity: 700, lift: -190, radius: 5, color: 0xff8a4a, type: 'molotov' })
      return
    }
    // 侧向游走，保持射击距离
    this.vxTarget = d > 220 ? this.facing * this.speed * 0.7 : this.strafe * this.speed * 0.6
    this.playAnim('run')
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
  }
  performAttack() { this.hitPlayer(this.damage) }
}
Content.register(KIND.MONSTER, PUNK_RAIDER_DEF.id, PUNK_RAIDER_DEF, 'core')

// ------------------------------------------------------------ 城堡骑士
export const CASTLE_KNIGHT_DEF = {
  id: 'castle_knight',
  name: '城堡骑士',
  en: 'CASTLE KNIGHT',
  family: 'machine',
  hp: 158,
  speed: 46,
  damage: 20,
  size: [48, 62],
  aggro: 400,
  attackRange: 108,
  attackCooldown: 2.2,
  xp: 22,
  gravity: 2000,
  loot: [
    { id: 'scrap_plate', chance: 0.6 },
    { id: 'composite_armor', chance: 0.15 },
    { id: 'bearing', chance: 0.3 },
  ],
  artId: 'castle_knight',
  sound: 'servo',
  desc: '盔甲里没有人，只有一套还在执行册封仪式的程序。举盾推进，落盾时劈出一道剑气。',
}
export class CastleKnight extends BaseMonster {
  constructor(game, x, y) {
    super(game, CASTLE_KNIGHT_DEF, x, y)
    this.waveCd = 2.0
    this.chargeCd = 3.4
    this.guard = true
  }
  takeDamage(n, fromX = null) {
    if (this.guard && fromX != null && Math.sign(fromX - this.px) === this.facing) n *= 0.55
    super.takeDamage(n, fromX)
    if (this.hp / this.maxHp < 0.5) this.guard = false
  }
  updateBehavior(dt) {
    this.waveCd = Math.max(0, this.waveCd - dt)
    this.chargeCd = Math.max(0, this.chargeCd - dt)
    if (dashStep(this, dt)) return
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.facePlayer()
    if (d < 112 && this.attackCd <= 0) { this.tryAttack(); return }
    if (d > 130 && d < 330 && this.waveCd <= 0) {
      this.waveCd = 3.0
      this.playAnim('attack')
      this.guard = false
      shoot(this, { speed: 420, radius: 7, color: 0xc8a24a, life: 1.4 })
      return
    }
    if (d > 300 && this.chargeCd <= 0) {
      this.chargeCd = 4.5
      this.body.vy = -150
      lunge(this, 3.1, 0.4)
      this.playAnim('run')
      return
    }
    this.guard = d > 120
    this.vxTarget = d > 100 ? this.facing * this.speed : 0
    this.playAnim(this.vxTarget ? 'run' : 'idle')
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
  }
  performAttack() { stomp(this, 96, this.damage, 0xc8a24a) }
}
Content.register(KIND.MONSTER, CASTLE_KNIGHT_DEF.id, CASTLE_KNIGHT_DEF, 'core')

// ------------------------------------------------------------ 失控 AI
export const ROGUE_AI_DEF = {
  id: 'rogue_ai',
  name: '失控 AI',
  en: 'ROGUE AI',
  family: 'machine',
  hp: 66,
  speed: 72,
  damage: 12,
  size: [38, 42],
  aggro: 520,
  attackRange: 340,
  attackCooldown: 2.1,
  xp: 14,
  gravity: 0,
  flying: true,
  hover: 82,
  loot: [
    { id: 'board_cpu', chance: 0.45 },
    { id: 'quantum_chip', chance: 0.12 },
    { id: 'copper_wire', chance: 0.4 },
  ],
  artId: 'rogue_ai',
  sound: 'alarm',
  desc: '它把自己复制进了三台巡检机。开火前会先念一遍你的编号，念完就扫射。',
}
export class RogueAI extends BaseMonster {
  constructor(game, x, y) {
    super(game, ROGUE_AI_DEF, x, y)
    this.orbit = Math.random() * Math.PI * 2
    this.blinkCd = 3.2
    this.sweepCd = 1.4
    this.sweepT = 0
  }
  _beamSweep() {
    for (let k = -2; k <= 2; k++) shoot(this, { speed: 540, radius: 3, color: 0x8fe8ff, spread: k * 0.12, life: 1.2 })
    this.game.spark?.(this.px, this.py, 0x8fe8ff, 10, 200)
    this.sweepCd = 2.6
  }
  updateBehavior(dt) {
    this.sweepCd = Math.max(0, this.sweepCd - dt)
    this.blinkCd = Math.max(0, this.blinkCd - dt)
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.orbit += dt * 1.1
    this.facing = p.centerX >= this.px ? 1 : -1
    if (this.hurtT > 0 && this.blinkCd <= 0 && d < 200) {
      this.blinkCd = 4.6
      const w = this.game.room?.data?.worldW || 3000
      this.body.x = Math.max(50, Math.min(w - 80, this.body.x + (p.centerX >= this.px ? -1 : 1) * 200))
      this.game.spark?.(this.px, this.py, 0x8fe8ff, 12, 180)
      return
    }
    if (this.sweepCd <= 0 && d < 340 && this.hasLineOfSight(p.centerX, p.centerY)) {
      this.playAnim('attack')
      this._beamSweep()
      return
    }
    const tx = p.centerX + Math.cos(this.orbit) * 190
    this.vxTarget = Math.max(-this.speed, Math.min(this.speed, (tx - this.px) * 1.4))
    this.body.vy = Math.sin(this.orbit * 0.8) * 20
    this.playAnim('run')
  }
  performAttack() { this._beamSweep() }
}
Content.register(KIND.MONSTER, ROGUE_AI_DEF.id, ROGUE_AI_DEF, 'core')

// ------------------------------------------------------------ 暗网幽灵
export const DARK_WEB_GHOST_DEF = {
  id: 'dark_web_ghost',
  name: '暗网幽灵',
  en: 'DARK WEB GHOST',
  family: 'machine',
  hp: 56,
  speed: 64,
  damage: 11,
  size: [36, 44],
  aggro: 460,
  attackRange: 320,
  attackCooldown: 2.0,
  xp: 14,
  gravity: 0,
  flying: true,
  hover: 70,
  loot: [
    { id: 'board_cpu', chance: 0.35 },
    { id: 'optical_module', chance: 0.2 },
    { id: 'ram_stick', chance: 0.4 },
  ],
  artId: 'dark_web_ghost',
  sound: 'alarm',
  desc: '它从一个断掉的摄像头里爬出来，身上挂着没发出去的数据包。打它一下，它会先断线再重连。',
}
export class DarkWebGhost extends BaseMonster {
  constructor(game, x, y) {
    super(game, DARK_WEB_GHOST_DEF, x, y)
    this.packetCd = 1.2
    this.phaseT = 0
    this.blinkCd = 2.4
    this.drift = Math.random() * Math.PI * 2
  }
  updateBehavior(dt) {
    this.packetCd = Math.max(0, this.packetCd - dt)
    this.blinkCd = Math.max(0, this.blinkCd - dt)
    if (this.phaseT > 0) {
      this.phaseT -= dt
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.drift += dt * 1.9
    this.facing = p.centerX >= this.px ? 1 : -1
    if (this.hurtT > 0 && this.blinkCd <= 0) {
      this.blinkCd = 4.2
      this.body.x = Math.max(40, Math.min((this.game.room?.data?.worldW || 3000) - 70, this.body.x + (p.centerX >= this.px ? -1 : 1) * 220))
      this.body.y -= 70
      this.phaseT = 0.3
      this.game.spark?.(this.px, this.py, 0x8f5aff, 10, 160)
      return
    }
    this.body.vx += Math.sin(this.drift) * 26 * dt
    this.vxTarget = this.body.vx
    this.body.vy = Math.cos(this.drift * 0.9) * 16
    this.playAnim('run')
    if (this.packetCd <= 0 && d < this.attackRange) {
      this.packetCd = 2.4
      this.playAnim('attack')
      for (let k = 0; k < 3; k++) shoot(this, { speed: 380 + k * 60, radius: 4, color: 0x8f5aff, lift: (k - 1) * 60, life: 1.5 })
    }
  }
  performAttack() { shoot(this, { speed: 460, radius: 4, color: 0x8f5aff }) }
}
Content.register(KIND.MONSTER, DARK_WEB_GHOST_DEF.id, DARK_WEB_GHOST_DEF, 'core')

// ------------------------------------------------------------ 流窜病毒
export const VIRAL_WRAITH_DEF = {
  id: 'viral_wraith',
  name: '流窜病毒',
  en: 'VIRAL WRAITH',
  family: 'machine',
  hp: 50,
  speed: 84,
  damage: 11,
  size: [34, 44],
  aggro: 440,
  attackRange: 260,
  attackCooldown: 1.8,
  xp: 12,
  gravity: 0,
  flying: true,
  hover: 56,
  loot: [
    { id: 'chemical', chance: 0.4 },
    { id: 'board_cpu', chance: 0.3 },
    { id: 'cell_small', chance: 0.35 },
  ],
  artId: 'viral_wraith',
  sound: 'alarm',
  desc: '一段会自己找载体的代码。它把孢子吐在设备上，再从设备里钻出来，跳得毫无规律。',
}
export class ViralWraith extends BaseMonster {
  constructor(game, x, y) {
    super(game, VIRAL_WRAITH_DEF, x, y)
    this.spitCd = 1.4
    this.jumpCd = 1.0
    this.seed = Math.random() * 10
  }
  updateBehavior(dt) {
    this.spitCd = Math.max(0, this.spitCd - dt)
    this.jumpCd = Math.max(0, this.jumpCd - dt)
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    this.seed += dt
    const d = this.distToPlayer()
    this.facing = p.centerX >= this.px ? 1 : -1
    // 不规则跳动：正弦 + 随机相位，不能直线预判
    const hop = Math.sin(this.seed * 6.2) * 130
    this.body.vx += (hop - this.body.vx) * Math.min(1, dt * 4)
    this.vxTarget = this.body.vx
    this.body.vy = Math.sin(this.seed * 4.1) * 58
    this.playAnim('run')
    if (this.spitCd <= 0 && d < this.attackRange) {
      this.spitCd = 1.9
      this.playAnim('attack')
      shoot(this, { speed: 300, gravity: 420, lift: -100, radius: 4, color: 0x9ab84a, type: 'spore', life: 2.0 })
      shoot(this, { speed: 300, gravity: 420, lift: -160, radius: 4, color: 0x9ab84a, type: 'spore', life: 2.0 })
      return
    }
    if (d < 90 && this.attackCd <= 0) {
      this.playAnim('attack')
      stomp(this, 74, this.damage, 0x9ab84a)
      this.attackCd = this.attackCooldown
    }
  }
  performAttack() { stomp(this, 74, this.damage, 0x9ab84a) }
}
Content.register(KIND.MONSTER, VIRAL_WRAITH_DEF.id, VIRAL_WRAITH_DEF, 'core')

// ------------------------------------------------------------ 纳米啃噬者
export const NANO_SWARM_DEF = {
  id: 'nano_swarm',
  name: '纳米啃噬者',
  en: 'NANO SWARM',
  family: 'machine',
  hp: 44,
  speed: 96,
  damage: 9,
  size: [34, 28],
  aggro: 500,
  attackRange: 140,
  attackCooldown: 1.2,
  xp: 10,
  gravity: 0,
  flying: true,
  hover: 30,
  loot: [
    { id: 'rare_earth', chance: 0.3 },
    { id: 'scrap_plate', chance: 0.4 },
    { id: 'cell_small', chance: 0.3 },
  ],
  artId: 'nano_swarm',
  sound: 'alarm',
  desc: '一团会散开的灰。它贴住你就开始啃，被打散后会在两步外重新聚起来。',
}
export class NanoSwarm extends BaseMonster {
  constructor(game, x, y) {
    super(game, NANO_SWARM_DEF, x, y)
    this.auraCd = 0
    this.scatterT = 0
    this.drift = Math.random() * Math.PI * 2
    this.chase = 0
  }
  _scatter() {
    this.scatterT = 0.6
    this.chase = 0.9
    const a = Math.random() * Math.PI * 2
    this.body.x += Math.cos(a) * 70
    this.body.y += Math.sin(a) * 40
    this.game.spark?.(this.px, this.py, 0x9aa8a8, 14, 160)
  }
  updateBehavior(dt) {
    this.auraCd = Math.max(0, this.auraCd - dt)
    if (this.scatterT > 0) { this.scatterT -= dt; this.vxTarget = 0; this.playAnim('hurt'); return }
    const p = this.player
    if (!p || p.dead) { this.vxTarget = 0; this.playAnim('idle'); return }
    const d = this.distToPlayer()
    this.drift += dt * 2.2
    this.facing = p.centerX >= this.px ? 1 : -1
    if (this.hurtT > 0 && Math.random() < dt * 6) return this._scatter()
    this.chase -= dt
    this.vxTarget = this.facing * this.speed
    this.body.vy = Math.sin(this.drift) * 34
    this.playAnim('run')
    if (d < 96 && this.auraCd <= 0) {
      this.auraCd = 0.8
      stomp(this, 88, this.damage, 0x9aa8a8)
      this.playAnim('attack')
    }
  }
  performAttack() { stomp(this, 88, this.damage, 0x9aa8a8) }
}
Content.register(KIND.MONSTER, NANO_SWARM_DEF.id, NANO_SWARM_DEF, 'core')

export const THEME_MINION_IDS = [
  WRAITH_DEF.id,
  WELDER_DEF.id,
  FANATIC_DEF.id,
  ORB_DEF.id,
  VAULT_PUPPET_DEF.id,
  MINE_SHADE_DEF.id,
  BLOOD_THRALL_DEF.id,
  FOG_STALKER_DEF.id,
  PUNK_RAIDER_DEF.id,
  CASTLE_KNIGHT_DEF.id,
  ROGUE_AI_DEF.id,
  DARK_WEB_GHOST_DEF.id,
  VIRAL_WRAITH_DEF.id,
  NANO_SWARM_DEF.id,
]
