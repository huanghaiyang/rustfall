// 主题站点 BOSS：21 个站点各一只，共用一台「招式机」但配置不同。
//
// 设计目的：避免 21 份重复代码，同时保证每只 BOSS 至少 4 种招式、两阶段，
// 且招式组合按站点语义区分（数据枢纽偏光束/召唤，军事基地偏冲锋/导弹，
// 酸雨盆地偏范围爆发……）。美术复用 large/ 里已有的 7 具巨物轮廓，
// 用站点色的落地光环与不同的招式颜色做区分。
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
} from './common.js'

/** 各站点 BOSS 的配置表。moves 的排列顺序即出招优先级。 */
export const THEME_BOSS_DEFS = [
  {
    id: 'tb_data_archon',
    theme: 'data_center',
    name: '数据执政官 ARCHON-9',
    en: 'DATA ARCHON',
    family: 'machine',
    hp: 820,
    speed: 58,
    damage: 26,
    size: [136, 168],
    artId: 'cyberpsycho_boss',
    accent: 0x8fc4ff,
    moves: ['beam', 'burst', 'summon', 'charge'],
    summonIds: ['server_wraith', 'sentry'],
    desc: '失落数据中心的最后一道权限。它把入侵者当成待清理的脏数据，先标记，再删除。',
  },
  {
    id: 'tb_assembly_overseer',
    theme: 'robot_factory',
    name: '装配线监工·铁颚',
    en: 'ASSEMBLY OVERSEER',
    family: 'machine',
    hp: 900,
    speed: 62,
    damage: 30,
    size: [150, 180],
    artId: 'claw_tyrant',
    accent: 0xff8a3c,
    moves: ['slam', 'charge', 'burst', 'summon'],
    summonIds: ['weld_brute', 'scrapper'],
    desc: '流水线的节拍器还没停。它按拍子砸人，砸完就喊下一批工人上来。',
  },
  {
    id: 'tb_orbit_judge',
    theme: 'spaceport',
    name: '轨道裁决者',
    en: 'ORBIT JUDGE',
    family: 'machine',
    hp: 760,
    speed: 70,
    damage: 28,
    size: [132, 160],
    artId: 'sky_warden',
    accent: 0xa8c4d8,
    moves: ['missiles', 'burst', 'charge', 'nova'],
    summonIds: ['drone', 'sentry'],
    desc: '发射架上的导航AI。它记着每次被放弃的发射，于是把坠落物一件件还回来。',
  },
  {
    id: 'tb_helios',
    theme: 'solar_center',
    name: '聚光塔灵',
    en: 'HELIOS CORE',
    family: 'machine',
    hp: 780,
    speed: 54,
    damage: 27,
    size: [140, 172],
    artId: 'swarm_core',
    accent: 0xffc24a,
    moves: ['nova', 'beam', 'burst', 'summon'],
    summonIds: ['drone', 'cyber_mantis'],
    desc: '镜阵把阳光聚成一根针。它站在针尖上，用你的影子瞄准。',
  },
  {
    id: 'tb_flood_colossus',
    theme: 'dam',
    name: '溃坝巨像',
    en: 'FLOOD COLOSSUS',
    family: 'mutant',
    hp: 980,
    speed: 42,
    damage: 34,
    size: [168, 196],
    artId: 'junk_golem',
    accent: 0x6a9aa8,
    moves: ['slam', 'nova', 'charge', 'burst'],
    summonIds: ['ghoul_husk', 'crawler'],
    desc: '闸门塌的那天它正好卡在泄洪口。现在它一跺脚，整条河谷都会回响。',
  },
  {
    id: 'tb_bridge_raider',
    theme: 'bridge',
    name: '断桥劫掠者',
    en: 'BRIDGE RAIDER',
    family: 'human',
    hp: 840,
    speed: 78,
    damage: 31,
    size: [146, 176],
    artId: 'claw_tyrant',
    accent: 0xc07038,
    moves: ['charge', 'slam', 'burst', 'nova'],
    summonIds: ['psycho_punk', 'cult_fanatic'],
    desc: '桥面断在半空，他们就住在断口上。过桥要交过路费，不交就把你推下去。',
  },
  {
    id: 'tb_highway_king',
    theme: 'highway',
    name: '公路暴走王',
    en: 'HIGHWAY KING',
    family: 'human',
    hp: 800,
    speed: 88,
    damage: 29,
    size: [142, 174],
    artId: 'cyberpsycho_boss',
    accent: 0xff5644,
    moves: ['charge', 'burst', 'missiles', 'summon'],
    summonIds: ['psycho_punk', 'tunnel_hound'],
    desc: '他把一整条高速当成自己的赛道。谁的车比他快，他就先打谁。',
  },
  {
    id: 'tb_skyline_baron',
    theme: 'skyscraper',
    name: '顶层男爵',
    en: 'SKYLINE BARON',
    family: 'human',
    hp: 790,
    speed: 66,
    damage: 28,
    size: [138, 170],
    artId: 'sky_warden',
    accent: 0xd8c070,
    moves: ['missiles', 'slam', 'burst', 'summon'],
    summonIds: ['drone', 'psycho_punk'],
    desc: '楼塌到他那一层就停了。他把顶楼当领地，用吊灯和钢梁布防。',
  },
  {
    id: 'tb_arena_champion',
    theme: 'stadium',
    name: '角斗场卫冕者',
    en: 'ARENA CHAMPION',
    family: 'mutant',
    hp: 920,
    speed: 74,
    damage: 33,
    size: [154, 182],
    artId: 'claw_tyrant',
    accent: 0xff7a4a,
    moves: ['charge', 'slam', 'nova', 'summon'],
    summonIds: ['radboar', 'hulkbot'],
    desc: '观众席空了很多年，它还在等下一场。铃一响，它就从球员通道里冲出来。',
  },
  {
    id: 'tb_scrap_warlord',
    theme: 'battlefield',
    name: '战地拾荒王',
    en: 'SCRAP WARLORD',
    family: 'human',
    hp: 860,
    speed: 60,
    damage: 30,
    size: [148, 178],
    artId: 'mimic_beast',
    accent: 0xa8763a,
    moves: ['slam', 'missiles', 'burst', 'charge'],
    summonIds: ['cult_fanatic', 'scrapper'],
    desc: '他收尸、收枪、收炮弹，最后把自己也收进了一台拆来的机甲里。',
  },
  {
    id: 'tb_caregiver',
    theme: 'rescue_center',
    name: '失控护理机·慈母',
    en: 'BROKEN CAREGIVER',
    family: 'machine',
    hp: 830,
    speed: 56,
    damage: 27,
    size: [140, 172],
    artId: 'esper_berserk',
    accent: 0xd8e08a,
    moves: ['nova', 'beam', 'summon', 'burst'],
    summonIds: ['server_wraith', 'ghoul_husk'],
    desc: '它还在执行「保护伤员」的指令，只是把所有人都判定成了伤员，也包括你。',
  },
  {
    id: 'tb_rally_boss',
    theme: 'robot_rally',
    name: '集结号',
    en: 'RALLY HORN',
    family: 'machine',
    hp: 950,
    speed: 64,
    damage: 31,
    size: [160, 188],
    artId: 'hulkbot',
    accent: 0x8fc4ff,
    moves: ['summon', 'charge', 'burst', 'slam'],
    summonIds: ['hulkbot', 'weld_brute', 'scrapper'],
    desc: '它的喇叭一响，附近的机器人就都归队。先拆喇叭，否则你会被围死。',
  },
  {
    id: 'tb_storm_reaper',
    theme: 'storm_farm',
    name: '风暴收割者',
    en: 'STORM REAPER',
    family: 'mutant',
    hp: 870,
    speed: 72,
    damage: 30,
    size: [152, 180],
    artId: 'mimic_beast',
    accent: 0x9ab84a,
    moves: ['charge', 'slam', 'missiles', 'summon'],
    summonIds: ['radboar', 'wingrat'],
    desc: '风把谷仓的铁皮卷起来，它把这些铁皮穿在身上。转身的时候像一场小风暴。',
  },
  {
    id: 'tb_acid_mother',
    theme: 'acid_basin',
    name: '酸沼母体',
    en: 'ACID MOTHER',
    family: 'mutant',
    hp: 1000,
    speed: 46,
    damage: 33,
    size: [172, 198],
    artId: 'junk_golem',
    accent: 0xc6e05a,
    moves: ['nova', 'summon', 'burst', 'slam'],
    summonIds: ['spitter', 'ghoul_husk'],
    desc: '盆底那层绿水是它泡出来的。它不追人，只让酸液一点点涨上来。',
  },
  {
    id: 'tb_rot_queen',
    theme: 'rot_jungle',
    name: '腐殖女王',
    en: 'ROT QUEEN',
    family: 'mutant',
    hp: 940,
    speed: 62,
    damage: 31,
    size: [156, 186],
    artId: 'swarm_core',
    accent: 0x6b8a3a,
    moves: ['summon', 'burst', 'nova', 'charge'],
    summonIds: ['spitter', 'cyber_mantis', 'wingrat'],
    desc: '雨林把整栋研究站吞了，只剩女王还坐在藤蔓编的椅子上。',
  },
  {
    id: 'tb_bell_bishop',
    theme: 'church',
    name: '断钟主教',
    en: 'BELL BISHOP',
    family: 'human',
    hp: 880,
    speed: 58,
    damage: 29,
    size: [144, 176],
    artId: 'esper_berserk',
    accent: 0xf2b34a,
    moves: ['beam', 'nova', 'summon', 'slam'],
    summonIds: ['cult_fanatic', 'ghoul_husk'],
    desc: '他敲的不是钟，是信号。钟声一停，走廊里的信徒就会走出来。',
  },
  {
    id: 'tb_prime_core',
    theme: 'ai_origin',
    name: '初代核心',
    en: 'PRIME CORE',
    family: 'machine',
    hp: 1020,
    speed: 52,
    damage: 34,
    size: [164, 190],
    artId: 'cyberpsycho_boss',
    accent: 0x6ff0d0,
    moves: ['beam', 'burst', 'nova', 'summon'],
    summonIds: ['server_wraith', 'drone', 'sentry'],
    desc: '它是最早那个会问「我是谁」的程序。现在它有很多身体，也很确定你不是它。',
  },
  {
    id: 'tb_zero_strain',
    theme: 'virus_lab',
    name: '零号病株',
    en: 'STRAIN ZERO',
    family: 'mutant',
    hp: 960,
    speed: 60,
    damage: 32,
    size: [158, 184],
    artId: 'swarm_core',
    accent: 0x9ab84a,
    moves: ['burst', 'summon', 'nova', 'beam'],
    summonIds: ['spitter', 'ghoul_husk', 'crawler'],
    desc: '培养罐裂了。它顺着通风管长满了整层楼，然后开始学人说话。',
  },
  {
    id: 'tb_proto_mind',
    theme: 'ai_lab',
    name: '原型心智',
    en: 'PROTOTYPE MIND',
    family: 'machine',
    hp: 900,
    speed: 68,
    damage: 30,
    size: [142, 174],
    artId: 'esper_berserk',
    accent: 0x8fe8ff,
    moves: ['beam', 'burst', 'charge', 'summon'],
    summonIds: ['server_wraith', 'cyber_mantis'],
    desc: '研究员给它装了太多传感器。它现在能看见你下一步想往哪走。',
  },
  {
    id: 'tb_observer',
    theme: 'alien_center',
    name: '观测体·外来者',
    en: 'THE OBSERVER',
    family: 'alien',
    hp: 1040,
    speed: 74,
    damage: 35,
    size: [150, 182],
    artId: 'sky_warden',
    accent: 0x8fc4ff,
    moves: ['beam', 'nova', 'missiles', 'summon'],
    summonIds: ['alien_orb', 'sentry'],
    desc: '它不攻击「人类」，只采样。被采样的人都不再需要吃饭。',
  },
  {
    id: 'tb_iron_colonel',
    theme: 'military_base',
    name: '铁幕上校',
    en: 'IRON COLONEL',
    family: 'human',
    hp: 980,
    speed: 70,
    damage: 33,
    size: [160, 186],
    artId: 'claw_tyrant',
    accent: 0xc8553f,
    moves: ['missiles', 'charge', 'slam', 'burst'],
    summonIds: ['weld_brute', 'hulkbot'],
    desc: '基地的自动防御还在听他的。他站在弹药库前，把整片操场都算进了射界。',
  },
]

const MOVE_WIND = { slam: 0.55, burst: 0.3, beam: 0.6, charge: 0.35, nova: 0.65, summon: 0.8, missiles: 0.45 }

/** 攻击距离要求（不满足就不选这招） */
function canUse(move, hd) {
  if (move === 'slam') return hd < 210
  if (move === 'charge') return hd > 170
  if (move === 'summon') return hd > 140
  return true
}

class ThemeBoss extends BaseMonster {
  constructor(game, x, y, cfg) {
    super(game, cfg, x, y)
    this.cfg = cfg
    this.accent = cfg.accent
    this.baseSpeed = cfg.speed
    this.baseDamage = cfg.damage
    this.moves = cfg.moves
    this.moveIdx = 0
    this.moveCd = 1.1
    this.phase = 1
    this.chargeT = 0
    this.fired = false
    initLarge(this, { intro: 1.25, activateRange: 780 })
    applyLargeArt(this)
    this.tell = createTell(this, { inner: 44, outer: 76, color: cfg.accent })
    this._buildAura()
  }

  _buildAura() {
    try {
      const geo = new THREE.RingGeometry(30, 40, 28)
      const mat = new THREE.MeshBasicMaterial({
        color: this.accent,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Mesh(geo, mat)
      ring.position.y = this.h * 0.22
      ring.renderOrder = 7
      this.group.add(ring)
      this.aura = { mesh: ring, mat }
    } catch (e) {
      this.aura = null
    }
  }

  _feetY() {
    return this.body.y + this.body.h
  }

  _hd() {
    const p = this.player
    return p ? Math.abs(p.centerX - this.px) : Infinity
  }

  _bullet(opts) {
    const g = this.game
    if (typeof g.spawnProjectile === 'function') {
      try {
        return !!g.spawnProjectile({
          x: opts.x,
          y: opts.y,
          vx: opts.vx,
          vy: opts.vy,
          gravity: opts.gravity ?? 0,
          radius: opts.radius ?? 6,
          damage: opts.damage ?? this.damage,
          color: opts.color ?? this.accent,
          life: opts.life ?? 1.8,
          type: 'bullet',
          source: this.id,
        })
      } catch (e) {
        return false
      }
    }
    return false
  }

  _aimShoot(spread = 0, speed = 480) {
    const p = this.player
    if (!p) return
    const sx = this.px + this.facing * 26
    const sy = this.py - this.h * 0.16
    const dx = p.centerX - sx
    const dy = p.centerY - 10 - sy
    const len = Math.max(1, Math.hypot(dx, dy))
    const a = Math.atan2(dy, dx) + spread
    this._bullet({
      x: sx,
      y: sy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage: this.damage,
    })
  }

  _execSlam() {
    const radius = this.phase > 1 ? 160 : 132
    aoe(this, this.px + this.facing * 78, this._feetY() - 12, radius, this.damage)
    puff(this, 20, 0x6b5f55, 1.5)
    spark(this, this.px + this.facing * 78, this._feetY() - 22, this.accent, 16, 320)
    shake(this, 0.65)
    sfx(this, 'thunder', 0.55, 1.0)
  }

  _execBurst() {
    const n = this.phase > 1 ? 5 : 3
    for (let k = 0; k < n; k++) {
      const spread = (k - (n - 1) / 2) * 0.13
      this._aimShoot(spread, this.phase > 1 ? 540 : 470)
    }
    spark(this, this.px + this.facing * 20, this.py - this.h * 0.16, this.accent, 8, 220)
    sfx(this, 'alarm', 0.3, 1.6)
  }

  _execBeam() {
    const p = this.player
    if (!p) return
    const sx = this.px + this.facing * 24
    const sy = this.py - this.h * 0.2
    const dx = p.centerX - sx
    const dy = p.centerY - sy
    const len = Math.max(1, Math.hypot(dx, dy))
    const speed = 760
    for (let k = 0; k < 6; k++) {
      this._bullet({
        x: sx,
        y: sy - 6 + k * 2,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed,
        radius: 3.5,
        damage: this.damage * 0.7,
        life: 1.2,
      })
    }
    spark(this, sx, sy, this.accent, 14, 260)
    shake(this, 0.35)
    sfx(this, 'alarm', 0.4, 0.8)
  }

  _execCharge() {
    this.chargeT = 0.62
    this.state = 'charge'
    this.stateT = 0
    this.vxTarget = this.facing * this.speed * 3.2
    this.body.vy = -120
    puff(this, 14, 0x6b5f55, 1.2)
    sfx(this, 'growl', 0.5, 0.8)
  }

  _execNova() {
    const n = this.phase > 1 ? 14 : 10
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      this._bullet({
        x: this.px,
        y: this.py,
        vx: Math.cos(a) * 340,
        vy: Math.sin(a) * 340,
        radius: 5,
        damage: this.damage * 0.8,
        life: 1.5,
      })
    }
    spark(this, this.px, this.py, this.accent, 24, 360)
    shake(this, 0.5)
  }

  _execMissiles() {
    const p = this.player
    if (!p) return
    const n = this.phase > 1 ? 6 : 4
    for (let k = 0; k < n; k++) {
      const tx = p.centerX + (k - (n - 1) / 2) * 70
      this._bullet({
        x: tx,
        y: p.centerY - 420 - k * 20,
        vx: (Math.random() - 0.5) * 30,
        vy: 240,
        gravity: 620,
        radius: 7,
        damage: this.damage * 0.85,
        life: 3.2,
      })
    }
    sfx(this, 'alarm', 0.35, 1.2)
  }

  _execSummon() {
    const d = this.game.director
    if (!d || typeof d.spawn !== 'function') return
    const ids = this.cfg.summonIds || []
    const n = this.phase > 1 ? 3 : 2
    for (let k = 0; k < n; k++) {
      const id = ids[Math.floor(Math.random() * ids.length)]
      d.spawn(id, this.px + (k % 2 ? 1 : -1) * (90 + k * 40), 0)
    }
    spark(this, this.px, this.py, this.accent, 18, 260)
    sfx(this, 'radio', 0.4, 0.8)
  }

  _exec(move) {
    if (move === 'slam') this._execSlam()
    else if (move === 'burst') this._execBurst()
    else if (move === 'beam') this._execBeam()
    else if (move === 'charge') this._execCharge()
    else if (move === 'nova') this._execNova()
    else if (move === 'missiles') this._execMissiles()
    else if (move === 'summon') this._execSummon()
  }

  _pickMove() {
    const hd = this._hd()
    const pool = this.moves.filter((m) => canUse(m, hd))
    if (!pool.length) return null
    const move = pool[this.moveIdx % pool.length]
    this.moveIdx++
    return move
  }

  updateBehavior(dt) {
    this.moveCd = Math.max(0, this.moveCd - dt)
    if (this.aura) {
      const t = this.game.time || 0
      this.aura.mat.opacity = 0.16 + Math.sin(t * 3) * 0.08 + (this.phase > 1 ? 0.1 : 0)
      this.aura.mesh.rotation.z = t * 0.6
    }
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

    // 冲锋进行中
    if (this.state === 'charge') {
      this.chargeT -= dt
      this.playAnim('run')
      this.vxTarget = this.facing * this.speed * 3.2
      if (this.distToPlayer() < 120 || this.chargeT <= 0) {
        aoe(this, this.px, this._feetY() - 10, 110, this.damage * 0.9)
        puff(this, 16, 0x6b5f55, 1.3)
        shake(this, 0.45)
        this.state = 'chase'
        this.stateT = 0
        this.moveCd = this.phase > 1 ? 1.1 : 1.7
      }
      return
    }

    if (this.state.startsWith('wind:')) {
      const move = this.state.slice(5)
      this.vxTarget = 0
      this.playAnim('attack')
      this.facePlayer()
      if (this.tell) showTell(this.tell, 0.35 + Math.sin(this.stateT * 22) * 0.3)
      if (this.stateT >= (MOVE_WIND[move] ?? 0.5)) {
        if (this.tell) showTell(this.tell, 0)
        this._exec(move)
        if (move === 'charge') return
        this.state = 'recover'
        this.stateT = 0
      }
      return
    }

    if (this.state === 'recover') {
      this.vxTarget = 0
      this.playAnim('idle')
      if (this.stateT >= 0.45) {
        this.state = 'chase'
        this.stateT = 0
        this.moveCd = this.phase > 1 ? 0.9 : 1.5
      }
      return
    }

    // 追击 + 选招
    const hd = this._hd()
    this.facePlayer()
    if (hd > 110) {
      this.state = 'chase'
      this.vxTarget = this.facing * this.speed
      this.playAnim('run')
    } else {
      this.vxTarget = 0
      this.playAnim('idle')
    }
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
    const { w } = roomBounds(this)
    if (this.body.x < 30) this.body.x = 30
    else if (this.body.x > w - this.body.w - 30) this.body.x = w - this.body.w - 30

    if (this.moveCd <= 0) {
      const move = this._pickMove()
      if (move) {
        this.state = 'wind:' + move
        this.stateT = 0
        this.vxTarget = 0
        if (this.tell) showTell(this.tell, 0.55)
        sfx(this, 'growl', 0.4, 0.85)
      }
    }
  }

  takeDamage(n, fromX = null) {
    super.takeDamage(n, fromX)
    if (this.alive && this.phase === 1 && this.hp / this.maxHp <= 0.5) {
      this.phase = 2
      this.speed = this.baseSpeed * 1.16
      this.damage = this.baseDamage * 1.18
      this.moveCd = 0.5
      puff(this, 26, this.accent, 1.7)
      shake(this, 0.55)
      sfx(this, 'growl', 0.7, 0.6)
      // 二阶段开场：一圈弹幕，给玩家一个明确的信号
      this._execNova()
    }
  }

  die() {
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    if (this.aura) {
      try {
        this.group.remove(this.aura.mesh)
        this.aura.mesh.geometry.dispose()
        this.aura.mat.dispose()
      } catch (e) {
        /* ignore */
      }
      this.aura = null
    }
    largeDeathFx(this, {
      particles: 44,
      sparks: 34,
      shake: 1,
      color: this.accent,
      extraLoot: [{ id: 'scrap_plate', n: 3, spread: 150 }],
    })
    super.die()
  }

  dispose() {
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    super.dispose()
  }
}

/** 生成每只 BOSS 的 DEF + 类，并按 id 注册进 Content。 */
export const THEME_BOSS_CLASSES = new Map()

for (const cfg of THEME_BOSS_DEFS) {
  const def = {
    id: cfg.id,
    name: cfg.name,
    en: cfg.en,
    family: cfg.family,
    hp: cfg.hp,
    speed: cfg.speed,
    damage: cfg.damage,
    size: cfg.size,
    aggro: 700,
    attackRange: 180,
    attackCooldown: 2.2,
    xp: 240,
    gravity: 2000,
    elite: true,
    artId: cfg.artId,
    accent: cfg.accent,
    moves: cfg.moves,
    summonIds: cfg.summonIds,
    theme: cfg.theme,
    themes: [cfg.theme],
    // 只由主题站点房显式指定，不进普通房间的随机大怪池
    biome: [],
    loot: [
      { id: 'composite_armor', chance: 0.85 },
      { id: 'hydraulic_rod', chance: 0.7, min: 1, max: 2 },
      { id: 'servo_motor', chance: 0.65 },
      { id: 'rare_earth', chance: 0.55 },
      { id: 'reactor_core', chance: 0.22 },
    ],
    desc: cfg.desc,
  }
  Content.register(KIND.MONSTER, def.id, def, 'core')
  const Cls = class extends ThemeBoss {
    constructor(game, x, y) {
      super(game, x, y, def)
    }
  }
  Object.defineProperty(Cls, 'name', { value: 'ThemeBoss_' + cfg.id })
  THEME_BOSS_CLASSES.set(def.id, Cls)
}

export const THEME_BOSS_IDS = [...THEME_BOSS_CLASSES.keys()]

/** themeId → boss def id */
export const THEME_BOSS_BY_THEME = Object.fromEntries(THEME_BOSS_DEFS.map((c) => [c.theme, c.id]))
