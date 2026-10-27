import * as THREE from 'three'
import { Content, KIND } from '../core/registry.js'
import { Events } from '../core/events.js'
import { makeRng } from '../render/rng.js'
import { TS, TOOL_DAMAGE, ATTACK_RANGE } from '../config.js'
import { G } from '../state.js'
import { PAL } from '../render/palette.js'
import * as ecoArtModule from '../render/art/eco.js'

/**
 * 生态系统 —— 房间里的「非威胁」生物层，由刷怪导演驱动（也可单独创建）。
 *
 *   createEcosystem(game) -> {
 *     populate(roomData), update(dt), clear(), dispose(),
 *     stats(),      // 引擎 HUD/读法：game.ecosystem.stats().total
 *     entities, spawnGroup(kind, n, x, y),
 *     damageAt(x, y, radius, dmg, opts),   // 玩家挥击/引擎主动调用
 *     itemId(preferred, ...fallbacks),     // 安全的物品 id 解析
 *   }
 *
 * 内容：
 *   roach 机器蟑螂（3~8 只 + 1 个巢）
 *     地面快速爬行；会去搬地上的 scrap_plate / copper_wire 回巢；
 *     玩家靠近 140px 四散逃跑，不攻击（harmless）；
 *     巢是可破坏的小堆（hp 40），拆掉会吐出它攒下的废料。
 *   plant 植物拟态（无害、不会动）
 *     随风摆动；每 14~26 秒在附近长出 1 个**隐匿战利品**
 *     （fiber / seed_pod，隐藏物，用扫描仪才能发现）；被打会掉纤维。
 *   fly / rat 小型环境生物
 *     无伤害、会躲玩家；被击杀掉 raw_meat / chitin。
 *
 * 物品 id 兜底：fiber / seed_pod / raw_meat / chitin 若在 catalog 里不存在，
 * 会自动降级到同类已有物品（carbon_fiber / cloth / dog_food / rubber…），
 * 保证永远不会掉出未注册的 id。
 *
 * 性能：每房实体上限 40；全部用简单 PlaneGeometry；几何/材质随实体销毁。
 *
 * 与引擎交互（全部防御式）：game.room.{data,lootDrops,map}、game.robot/game.player、
 * game.dropLoot、game.particles、game.sfx、G.ecosystem（HUD 统计）。
 * 玩家伤害：引擎的 robot.attack 只打 director.list 里的怪物，生态不参与；
 * 本模块自己检测 robot.swingT 的「新一次挥击」来结算采集伤害，
 * 同时导出 damageAt() 供引擎主动调用。
 */

export const MAX_ECO_ENTITIES = 40
const DEATH_LINGER = 0.7

const FALLBACK = {
  fiber: ['fiber', 'carbon_fiber', 'cloth', 'chemical'],
  seed_pod: ['seed_pod', 'carbon_fiber', 'chemical', 'cloth'],
  raw_meat: ['raw_meat', 'dog_food', 'cloth', 'chemical'],
  chitin: ['chitin', 'rubber', 'scrap_plate', 'cloth'],
  scrap: ['scrap_plate', 'aluminum_sheet'],
  copper: ['copper_wire', 'connector_bundle', 'solder'],
}

// ---------------------------------------------------------------------------
// 生态美术：getEcoArt(kind) 由美术同学提供（render/art/eco.js）
// 返回 CanvasTexture（也兼容 { w,h,frames:{idle:[tex...]} } 的写法）
// ---------------------------------------------------------------------------

const artCache = new Map()

function ecoArtSource() {
  if (ecoArtModule && typeof ecoArtModule.getEcoArt === 'function') return ecoArtModule
  return null
}

function normalizeEcoArt(art) {
  if (!art) return null
  if (art.isTexture) {
    const img = art.image || {}
    return {
      w: img.width || 24,
      h: img.height || 24,
      frames: { idle: [art], move: [art], dead: [] },
      texture: art,
    }
  }
  const raw = art.frames || {}
  const pick = (name) => {
    const f = raw[name]
    if (!f) return []
    return Array.isArray(f) ? f.filter(Boolean) : [f]
  }
  const idle = pick('idle')
  return {
    w: art.w || 24,
    h: art.h || 24,
    frames: {
      idle: idle.length ? idle : pick('run'),
      move: pick('run').length ? pick('run') : idle,
      dead: pick('dead'),
    },
    texture: idle[0] || null,
  }
}

/** 取生态美术；null = 美术尚未提供，用色块兜底 */
export function getEcoArtSafe(kind) {
  if (artCache.has(kind)) return artCache.get(kind)
  const mod = ecoArtSource()
  if (!mod) return null
  let art = null
  try {
    art = mod.getEcoArt(kind)
  } catch (e) {
    art = null
  }
  const norm = normalizeEcoArt(art)
  if (norm) artCache.set(kind, norm)
  return norm
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function playerPos(game) {
  const p = game.robot || game.player
  if (!p || p.dead) return null
  const x = typeof p.centerX === 'number' ? p.centerX : p.body ? p.body.x + p.body.w / 2 : null
  const y = typeof p.centerY === 'number' ? p.centerY : p.body ? p.body.y + p.body.h / 2 : null
  if (x == null || y == null) return null
  return { x, y, facing: p.facing || 1, tool: p.tool || null, body: p.body || null }
}

function roomWorld(game, data) {
  const d = data || game.room?.data
  return {
    w: d?.worldW || game.roomW || 4000,
    h: d?.worldH || game.roomH || 2400,
  }
}

function groundYAt(game, data, x) {
  const d = data || game.room?.data
  if (d && d.floorY) {
    const tx = Math.floor(x / TS)
    if (tx >= 0 && tx < d.floorY.length) return d.floorY[tx] * TS
  }
  const map = game.room?.map
  if (map && typeof map.groundBelow === 'function') {
    const g = map.groundBelow(x, 0, 6000)
    if (g != null) return g
  }
  return (d?.worldH || game.roomH || 2000) - 120
}

function mapSolid(game, x, y) {
  const map = game.room?.map
  if (!map || typeof map.solidAt !== 'function') return false
  return map.solidAt(x, y)
}

// ---------------------------------------------------------------------------
// 实体基类
// ---------------------------------------------------------------------------

class EcoEntity {
  constructor(eco, x, y, opts = {}) {
    this.eco = eco
    this.game = eco.game
    this.kind = opts.kind || 'eco'
    this.x = x
    this.y = y // 脚底世界 y
    this.alive = true
    this.hp = opts.hp ?? 6
    this.maxHp = this.hp
    this.w = opts.w ?? 16
    this.h = opts.h ?? 12
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.t = Math.random() * 6
    this.animT = 0
    this.deadT = 0
    this.flashT = 0
    this.moving = false
    this.harmless = opts.harmless !== false
    this.z = opts.z ?? 3
    this.group = new THREE.Group()
    this.group.position.set(x, -y, this.z)
    this.mats = []
    this.geos = []
    this.art = getEcoArtSafe(this.kind)
    this.artMesh = null
  }

  get px() {
    return this.x
  }
  get py() {
    return this.y - this.h * 0.5
  }

  /** 加一块平面（本地坐标），支持贴图或纯色 */
  addPlane(w, h, color, opts = {}) {
    const geo = new THREE.PlaneGeometry(w, h)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opts.opacity ?? 1,
      depthWrite: false,
      toneMapped: false,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    })
    if (opts.tex) {
      mat.map = opts.tex
      mat.color.setHex(0xffffff)
      mat.needsUpdate = true
    }
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(opts.x || 0, opts.y || 0, opts.z || 0)
    mesh.rotation.z = opts.rot || 0
    mesh.renderOrder = 3
    this.group.add(mesh)
    this.mats.push(mat)
    this.geos.push(geo)
    return mesh
  }

  /** 若生态美术可用，用它作为主体；否则用色块。返回主 mesh */
  useArtMesh(fallbackW, fallbackH, fallbackColor, opts = {}) {
    const art = this.art
    const tex = art?.texture || null
    const w = tex ? art.w || fallbackW : fallbackW
    const h = tex ? art.h || fallbackH : fallbackH
    const mesh = this.addPlane(w, h, fallbackColor, { ...opts, tex })
    this.artMesh = mesh
    return mesh
  }

  syncPosition() {
    this.group.position.set(this.x, -this.y, this.z)
  }

  takeDamage(n, fromX = null) {
    if (!this.alive) return
    this.hp -= n
    this.flashT = 0.14
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      this.deadT = 0
      this.onDeath()
    }
    this.eco.statsDirty = true
  }

  onDeath() {}

  update(dt) {
    this.t += dt
    if (!this.alive) {
      this.deadT += dt
      this.group.visible = false
      return
    }
    this.animT += dt
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt)
    this.behave(dt)
    this.syncPosition()
    this._animateFrames()
  }

  _animateFrames() {
    const art = this.art
    if (!this.artMesh || !art) return
    const set = this.moving && art.frames.move?.length ? art.frames.move : art.frames.idle
    if (!set || set.length < 2) return
    const tex = set[Math.floor(this.animT * 9) % set.length]
    if (tex && this.artMesh.material.map !== tex) {
      this.artMesh.material.map = tex
      this.artMesh.material.needsUpdate = true
    }
  }

  behave() {}

  dispose() {
    try {
      const par = this.group.parent
      if (par) par.remove(this.group)
    } catch (e) {
      /* ignore */
    }
    for (const g of this.geos) {
      try {
        g.dispose()
      } catch (e) {
        /* ignore */
      }
    }
    for (const m of this.mats) {
      try {
        m.dispose()
      } catch (e) {
        /* ignore */
      }
    }
    this.geos.length = 0
    this.mats.length = 0
    this.artMesh = null
  }
}

// ---------------------------------------------------------------------------
// 机器蟑螂 + 巢
// ---------------------------------------------------------------------------

class Roach extends EcoEntity {
  constructor(eco, x, y, nest) {
    super(eco, x, y, { kind: 'roach', hp: 5, w: 12, h: 7, z: 2.15 })
    this.nest = nest
    this.state = 'wander'
    this.target = null
    this.carryItem = null
    this.wanderT = 0.5 + Math.random() * 2
    this.fleeT = 0
    this.speed = 78 + Math.random() * 30
    this.body = this.useArtMesh(14, 8, PAL.oil || 0x2a2420, { x: 0, y: 3.5 })
    // 触须
    this.addPlane(6, 1.2, 0x6d7f86, { x: 2, y: 7, rot: 0.5 })
    this.addPlane(6, 1.2, 0x6d7f86, { x: 5, y: 6.4, rot: -0.5 })
    // 搬运的废料
    this.carryMesh = this.addPlane(7, 5, 0x8a7f6a, { x: 0, y: 9, z: 0.3 })
    this.carryMesh.visible = false
  }

  _home() {
    return this.nest ? this.nest.x : this.x
  }

  _moveToward(tx, speed, dt) {
    const dx = tx - this.x
    if (Math.abs(dx) < 0.5) {
      this.moving = false
      return true
    }
    const dir = dx > 0 ? 1 : -1
    const nx = this.x + dir * speed * dt
    if (mapSolid(this.game, nx + dir * 6, this.y - 6)) {
      this.dir = -dir
      this.moving = false
      return false
    }
    const gy = groundYAt(this.game, this.eco.data, nx)
    if (this.y - gy > 40) {
      // 不下悬崖
      this.moving = false
      return false
    }
    this.x = clamp(nx, 20, roomWorld(this.game, this.eco.data).w - 20)
    this.y = gy
    this.dir = dir
    this.moving = true
    this.group.scale.x = dir
    return true
  }

  behave(dt) {
    const p = playerPos(this.game)
    const d = p ? Math.hypot(p.x - this.x, p.y - this.y) : Infinity
    if (d < 140) {
      this.fleeT = 0.45
      this.state = 'flee'
    }

    if (this.state === 'flee') {
      this.fleeT -= dt
      if (p) {
        const away = p.x > this.x ? -1 : 1
        this._moveToward(this.x + away * 90, this.speed * 1.5, dt)
      }
      this.moving = true
      if (this.fleeT <= 0 && d > 200) {
        this.state = 'wander'
        this.wanderT = 0.4 + Math.random()
      }
      return
    }

    if (this.state === 'carry') {
      if (!this.nest || !this.nest.alive) {
        this._releaseCarry()
        this.state = 'wander'
        return
      }
      this._moveToward(this.nest.x, this.speed, dt)
      if (Math.abs(this.x - this.nest.x) < 26) {
        const item = this.carryItem
        this.carryItem = null
        this.carryMesh.visible = false
        this.nest.addScrap(item)
        this.state = 'wander'
        this.wanderT = 0.8 + Math.random() * 1.4
      }
      return
    }

    if (this.state === 'forage') {
      const loot = this.target
      if (!loot || loot.picked || loot.hidden || loot.buried) {
        this._clearTarget()
        this.state = 'wander'
        this.wanderT = 0.3
        return
      }
      if (Math.abs(loot.x - this.x) < 20) {
        this._pickUp(loot)
        return
      }
      this._moveToward(loot.x, this.speed * 1.15, dt)
      return
    }

    // 闲逛：在巢附近晃
    this.wanderT -= dt
    if (this.wanderT <= 0) {
      this.wanderT = 1 + Math.random() * 2.6
      if (Math.random() < 0.45) {
        const loot = this.eco.findScrapFor(this)
        if (loot) {
          this.target = loot
          this.state = 'forage'
          return
        }
      }
      this.dir = Math.random() < 0.5 ? -1 : 1
    }
    const home = this._home()
    if (Math.abs(this.x - home) > 160) this.dir = home > this.x ? 1 : -1
    if (!this._moveToward(this.x + this.dir * 30, this.speed * 0.55, dt)) this.dir *= -1
    if (Math.random() < dt * 0.6) this.moving = false
  }

  _pickUp(loot) {
    this.carryItem = loot.itemId
    this.carryMesh.visible = true
    loot.picked = true
    loot.__roachClaimed = null
    if (loot.group) loot.group.visible = false
    this.target = null
    this.state = 'carry'
    this.eco.sfx('step', 0.18, 1.6)
  }

  _releaseCarry() {
    this.carryItem = null
    this.carryMesh.visible = false
  }

  _clearTarget() {
    if (this.target && this.target.__roachClaimed === this) this.target.__roachClaimed = null
    this.target = null
  }

  onDeath() {
    if (this.carryItem) {
      this.eco.drop(this.carryItem, this.x, this.y - 4)
      this.carryItem = null
    }
    this.eco.sfx('hurt', 0.15, 1.8)
    this.eco.spark(this.x, this.y - 4, 0x8a7f6a, 4)
  }
}

class RoachNest extends EcoEntity {
  constructor(eco, x, y) {
    super(eco, x, y, { kind: 'nest', hp: 40, w: 40, h: 22, z: 1.95 })
    this.stock = []
    this.roaches = []
    this.pulse = Math.random() * 6
    this.addPlane(38, 16, PAL.rustDark || 0x4a3a2c, { y: 8 })
    this.addPlane(26, 12, PAL.rust || 0x6b4a32, { x: -6, y: 13, rot: 0.12 })
    this.addPlane(20, 10, PAL.dust || 0x8a8272, { x: 8, y: 14, rot: -0.16 })
    this.scrapMeshes = []
  }

  addScrap(itemId) {
    if (!itemId) return
    if (this.stock.length >= 12) this.stock.shift()
    this.stock.push(itemId)
    this.eco.statsDirty = true
    if (this.scrapMeshes.length < 8) {
      const m = this.addPlane(8, 6, 0x8a7f6a, {
        x: -14 + this.scrapMeshes.length * 4,
        y: 19 + (this.scrapMeshes.length % 3) * 3,
        rot: (Math.random() - 0.5) * 0.6,
        z: 0.2,
      })
      this.scrapMeshes.push(m)
    }
    this.eco.sfx('pickup', 0.1, 1.8)
  }

  behave(dt) {
    this.pulse += dt
    this.group.scale.y = 1 + Math.sin(this.pulse * 2.2) * 0.02
  }

  onDeath() {
    const stock = this.stock.slice(0, 8)
    this.stock.length = 0
    this.eco.statsDirty = true
    for (const id of stock) this.eco.drop(id, this.x + (Math.random() - 0.5) * 40, this.y - 6)
    this.eco.drop(this.eco.itemId(...FALLBACK.scrap), this.x, this.y - 8)
    this.eco.drop(this.eco.itemId(...FALLBACK.copper), this.x + 10, this.y - 8)
    this.eco.spark(this.x, this.y - 8, 0x8a7f6a, 14)
    this.eco.sfx('hurt', 0.4, 0.9)
    for (const r of this.roaches) {
      if (r && r.alive) {
        r.fleeT = 2.5
        r.state = 'flee'
      }
    }
    Events.emit('ecosystem:nestBroken', { x: this.x, y: this.y, stock: stock.length })
  }
}

// ---------------------------------------------------------------------------
// 植物拟态
// ---------------------------------------------------------------------------

class Plant extends EcoEntity {
  constructor(eco, x, y) {
    super(eco, x, y, { kind: 'plant', hp: 12, w: 28, h: 40, z: 1.9 })
    this.swayPhase = Math.random() * 6.28
    this.growT = 14 + Math.random() * 12
    this.grown = 0
    this.maxGrown = 3
    const color = PAL.mossDead || 0x6b6a3a
    this.stem = this.useArtMesh(28, 40, color, { y: 20 })
    if (!this.art || !this.art.texture) {
      this.leafL = this.addPlane(20, 7, color, { x: -9, y: 20, rot: 0.4, doubleSide: true })
      this.leafR = this.addPlane(18, 6, color, { x: 9, y: 24, rot: -0.35, doubleSide: true })
    }
    // 成熟期微光
    this.glowMat = new THREE.MeshBasicMaterial({
      color: PAL.toxic || 0x9ac84a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.glowGeo = new THREE.PlaneGeometry(34, 30)
    this.glow = new THREE.Mesh(this.glowGeo, this.glowMat)
    this.glow.position.set(0, 18, -0.2)
    this.glow.renderOrder = 2.7
    this.group.add(this.glow)
    this.mats.push(this.glowMat)
    this.geos.push(this.glowGeo)
  }

  behave(dt) {
    const sway = Math.sin(this.t * 1.6 + this.swayPhase) * 0.09
    if (this.stem) this.stem.rotation.z = sway
    if (this.leafL) this.leafL.rotation.z = 0.4 + sway * 1.6
    if (this.leafR) this.leafR.rotation.z = -0.35 + sway * 1.2

    if (this.grown < this.maxGrown) {
      this.growT -= dt
      this.glowMat.opacity = Math.max(0, 0.1 - this.growT * 0.004) + (this.growT < 3 ? 0.12 : 0)
      if (this.growT <= 0) this._grow()
    } else {
      this.glowMat.opacity = 0
    }
  }

  _grow() {
    this.grown++
    this.growT = 18 + Math.random() * 14
    const useSeed = this.grown % 2 === 0
    const id = useSeed ? this.eco.itemId(...FALLBACK.seed_pod) : this.eco.itemId(...FALLBACK.fiber)
    if (!id) return
    const x = this.x + (Math.random() - 0.5) * 46
    const y = this.y - 4
    const d = this.eco.drop(id, x, y, { hidden: true })
    // 引擎 dropLoot 不认识 hidden：这里补上（LootDrop 有 hidden 字段与 setVisibleState）
    if (d) {
      try {
        if ('hidden' in d) d.hidden = true
        if (typeof d.setVisibleState === 'function') d.setVisibleState()
      } catch (e) {
        /* ignore */
      }
    }
    this.eco.sfx('step', 0.1, 1.9)
    this.eco.spark(x, y - 6, PAL.toxic || 0x9ac84a, 3)
  }

  onDeath() {
    const id = this.eco.itemId(...FALLBACK.fiber)
    const n = Math.min(3, 1 + this.grown)
    for (let i = 0; i < n; i++) this.eco.drop(id, this.x + (Math.random() - 0.5) * 26, this.y - 4)
    this.eco.sfx('hurt', 0.25, 1.3)
  }
}

// ---------------------------------------------------------------------------
// 小型环境生物：fly / rat
// ---------------------------------------------------------------------------

class Critter extends EcoEntity {
  constructor(eco, x, y, kind) {
    const fly = kind === 'fly'
    super(eco, x, y, { kind, hp: fly ? 4 : 5, w: fly ? 10 : 18, h: fly ? 8 : 10, z: fly ? 2.25 : 2.1 })
    this.fly = fly
    this.baseY = y
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.wanderT = 0.4 + Math.random() * 2
    this.speed = fly ? 105 : 92
    this.fleeT = 0
    this.wingPhase = Math.random() * 6.28
    const bodyColor = fly ? 0x2a2420 : PAL.boneDark || 0x6b6355
    this.body = this.useArtMesh(fly ? 10 : 20, fly ? 8 : 12, bodyColor, { y: fly ? 5 : 6 })
    if (fly) {
      this.wingL = this.addPlane(10, 4, 0x9fd3e0, { x: -6, y: 9, rot: 0.4, doubleSide: true, opacity: 0.6 })
      this.wingR = this.addPlane(10, 4, 0x9fd3e0, { x: 6, y: 9, rot: -0.4, doubleSide: true, opacity: 0.6 })
    } else {
      this.addPlane(14, 2, 0x2a2420, { x: -10, y: 4, rot: 0.2 })
    }
  }

  _move(dt, dir, speed) {
    const nx = this.x + dir * speed * dt
    if (mapSolid(this.game, nx + dir * 8, this.y - 8)) {
      this.dir = -dir
      return
    }
    this.x = clamp(nx, 20, roomWorld(this.game, this.eco.data).w - 20)
    this.dir = dir
    this.moving = true
    this.group.scale.x = dir
    if (!this.fly) this.y = groundYAt(this.game, this.eco.data, this.x)
  }

  behave(dt) {
    const p = playerPos(this.game)
    const d = p ? Math.hypot(p.x - this.x, p.y - this.y) : Infinity
    if (d < (this.fly ? 130 : 160)) this.fleeT = 0.5

    this.wingPhase += dt * 22
    if (this.wingL) this.wingL.rotation.z = 0.4 + Math.sin(this.wingPhase) * 0.5
    if (this.wingR) this.wingR.rotation.z = -0.4 - Math.sin(this.wingPhase) * 0.5

    if (this.fleeT > 0) {
      this.fleeT -= dt
      this.moving = true
      const away = p ? (p.x > this.x ? -1 : 1) : this.dir
      this._move(dt, away, this.speed * 1.6)
      if (this.fly) this.y = this.baseY - Math.sin(this.t * 6) * 10
      return
    }

    this.wanderT -= dt
    if (this.wanderT <= 0) {
      this.wanderT = 0.6 + Math.random() * 2.2
      if (Math.random() < 0.5) this.dir *= -1
    }
    if (this.fly) {
      this.moving = true
      this.x = clamp(this.x + this.dir * this.speed * 0.35 * dt, 20, roomWorld(this.game, this.eco.data).w - 20)
      this.y = this.baseY + Math.sin(this.t * 2.1) * 8
      this.group.scale.x = this.dir
    } else if (Math.random() < 0.6) {
      this._move(dt, this.dir, this.speed * 0.6)
    } else {
      this.moving = false
    }
  }

  onDeath() {
    const meat = this.eco.itemId(...FALLBACK.raw_meat)
    const chitin = this.eco.itemId(...FALLBACK.chitin)
    const useMeat = this.fly ? Math.random() < 0.4 : Math.random() < 0.7
    const id = useMeat ? meat : chitin
    if (id) this.eco.drop(id, this.x, this.y - 4)
    this.eco.sfx('hurt', 0.16, 1.7)
    this.eco.spark(this.x, this.y - 4, useMeat ? 0x8d3a34 : 0x6b6355, 3)
  }
}

// ---------------------------------------------------------------------------
// 生态系统工厂
// ---------------------------------------------------------------------------

/**
 * @param {object} game Game 实例
 * @returns {object} ecosystem API
 */
export function createEcosystem(game) {
  const entities = []
  let data = null
  let rng = makeRng(1)
  let time = 0
  let lastSwing = 0
  let statsT = 0
  const itemCache = new Map()

  const eco = {
    game,
    entities,
    data: null,
    statsDirty: true,
    /** 活体计数（内部实时对象；外部请用 stats() 拿快照） */
    counts: { roaches: 0, plants: 0, critters: 0, nests: 0, scrap: 0, active: 0, total: 0 },
    /** 引擎按 `game.ecosystem.stats().total` 读，所以必须是方法 */
    stats() {
      return { ...eco.counts }
    },

    // ---------------------------------------------------------------- 工具
    /** 解析一个「存在」的物品 id：优先 preferred，其次 fallbacks；都没有返回 null */
    itemId(preferred, ...fallbacks) {
      const list = [preferred, ...fallbacks].filter(Boolean)
      const key = list.join('|')
      if (itemCache.has(key)) return itemCache.get(key)
      let found = null
      for (const id of list) {
        try {
          if (Content.has(KIND.ITEM, id)) {
            found = id
            break
          }
        } catch (e) {
          /* ignore */
        }
      }
      itemCache.set(key, found)
      return found
    },

    drop(itemId, x, y, opts) {
      if (!itemId) return null
      if (typeof game.dropLoot !== 'function') return null
      try {
        return game.dropLoot(itemId, x, y, opts || {})
      } catch (e) {
        return null
      }
    },

    sfx(name, vol = 0.2, rate = 1) {
      try {
        game.sfx?.(name, { vol, rate })
      } catch (e) {
        /* ignore */
      }
    },

    spark(x, y, color = 0xe5a33c, n = 6) {
      const parts = game.particles
      if (!parts) return
      for (let i = 0; i < n; i++) {
        try {
          const emit = parts.emit || parts.emitMany
          if (typeof emit !== 'function') break
          emit.call(parts, 'dust', x, y, {
            vx: (Math.random() - 0.5) * 120,
            vy: -Math.random() * 60,
            life: 0.3 + Math.random() * 0.3,
            size: 0.5 + Math.random() * 0.6,
            color,
          })
        } catch (e) {
          break
        }
      }
    },

    player: () => playerPos(game),
    groundY: (x) => groundYAt(game, data, x),
    random: () => rng.next(),

    /** 蟑螂找地上的废料（读引擎的 room.lootDrops） */
    findScrapFor(roach) {
      const drops = game.room?.lootDrops
      if (!Array.isArray(drops)) return null
      const wanted = new Set([this.itemId(...FALLBACK.scrap), this.itemId(...FALLBACK.copper)])
      let best = null
      let bd = Infinity
      for (const l of drops) {
        if (!l || l.picked || l.hidden || l.buried) continue
        if (!wanted.has(l.itemId)) continue
        if (l.__roachClaimed && l.__roachClaimed !== roach) continue
        const d = Math.abs((l.x || 0) - roach.x)
        if (d > 320) continue
        if (d < bd) {
          bd = d
          best = l
        }
      }
      if (best) best.__roachClaimed = roach
      return best
    },

    /**
     * 玩家挥击/主动采集判定。
     * @returns {number} 命中实体数
     */
    damageAt(x, y, radius = ATTACK_RANGE + 10, dmg = 8, opts = {}) {
      let hits = 0
      const facing = opts.facing
      const dyMax = opts.dyMax ?? 90
      for (const e of entities) {
        if (!e.alive) continue
        const dx = e.px - x
        const dy = e.py - y
        if (Math.abs(dy) > dyMax) continue
        if (Math.abs(dx) > radius + (e.w || 12)) continue
        if (facing != null && Math.sign(dx) !== Math.sign(facing) && Math.abs(dx) > 14) continue
        e.takeDamage(dmg, opts.fromX ?? x)
        hits++
        if (hits >= 4) break
      }
      return hits
    },

    populate,
    update,
    clear,
    spawnGroup,
    dispose() {
      clear()
    },
  }

  // ---------------------------------------------------------------- 刷生态
  function defaultSpecs(biome) {
    const base =
      {
        city: [
          { kind: 'roach', n: 5 },
          { kind: 'plant', n: 3 },
          { kind: 'fly', n: 2 },
        ],
        village: [
          { kind: 'plant', n: 4 },
          { kind: 'fly', n: 3 },
          { kind: 'rat', n: 1 },
        ],
        factory: [
          { kind: 'roach', n: 4 },
          { kind: 'plant', n: 1 },
          { kind: 'fly', n: 2 },
        ],
        dump: [
          { kind: 'roach', n: 6 },
          { kind: 'plant', n: 2 },
          { kind: 'rat', n: 2 },
        ],
      }[biome] || [
        { kind: 'plant', n: 3 },
        { kind: 'roach', n: 4 },
        { kind: 'fly', n: 2 },
      ]
    const out = []
    for (const s of base) {
      if (!rng.chance(0.82)) continue
      let n = s.n
      if (rng.chance(0.4)) n += 1
      if (rng.chance(0.25)) n -= 1
      out.push({ kind: s.kind, n: Math.max(1, n) })
    }
    if (!out.length) out.push({ kind: 'plant', n: 1 })
    return out
  }

  function pickSpot(minX) {
    const { w } = roomWorld(game, data)
    const x = clamp(rng.range(minX, Math.max(minX + 1, w - minX)), 60, w - 60)
    return { x, y: groundYAt(game, data, x) }
  }

  function addEntity(e) {
    if (!e) return null
    if (entities.length >= MAX_ECO_ENTITIES) {
      try {
        e.dispose()
      } catch (err) {
        /* ignore */
      }
      return null
    }
    const par = game.scene || game.room?.group || null
    if (par) par.add(e.group)
    entities.push(e)
    eco.statsDirty = true
    return e
  }

  /**
   * 刷一组生态。
   * @param {string} kind roach | plant | fly | rat
   * @param {number} n
   * @param {number} x 可选中心
   * @param {number} y 可选脚底
   */
  function spawnGroup(kind, n, x, y) {
    const { w } = roomWorld(game, data)
    const count = Math.max(1, Math.min(12, Math.floor(n || 1)))
    if (entities.length >= MAX_ECO_ENTITIES) return 0

    if (kind === 'roach') {
      const spot = Number.isFinite(x)
        ? { x, y: Number.isFinite(y) ? y : groundYAt(game, data, x) }
        : pickSpot(120)
      const nest = addEntity(new RoachNest(eco, spot.x, spot.y))
      const roachCount = clamp(count, 3, 8)
      let made = nest ? 1 : 0
      for (let i = 0; i < roachCount && entities.length < MAX_ECO_ENTITIES; i++) {
        const rx = clamp(spot.x + rng.range(-90, 90), 40, w - 40)
        const ry = groundYAt(game, data, rx)
        const r = addEntity(new Roach(eco, rx, ry, nest))
        if (r) {
          made++
          if (nest) nest.roaches.push(r)
        }
      }
      return made
    }

    if (kind === 'plant') {
      let made = 0
      for (let i = 0; i < count && entities.length < MAX_ECO_ENTITIES; i++) {
        const spot = Number.isFinite(x) ? { x: clamp(x + i * 40 - count * 20, 60, w - 60), y: 0 } : pickSpot(100)
        const py = spot.y || groundYAt(game, data, spot.x)
        if (addEntity(new Plant(eco, spot.x, py))) made++
      }
      return made
    }

    // fly / rat
    let made = 0
    for (let i = 0; i < count && entities.length < MAX_ECO_ENTITIES; i++) {
      const spot = Number.isFinite(x) ? { x: clamp(x + rng.range(-80, 80), 60, w - 60), y: 0 } : pickSpot(100)
      const gy = spot.y || groundYAt(game, data, spot.x)
      const startY = kind === 'fly' ? gy - (70 + Math.random() * 70) : gy
      if (addEntity(new Critter(eco, spot.x, startY, kind))) made++
    }
    return made
  }

  function populate(roomData) {
    clear()
    const d = roomData && roomData.map ? roomData : roomData?.data || {}
    data = d
    eco.data = d
    const biome = d.biome || game.room?.data?.biome || 'city'
    const kind = d.kind || d.spec?.kind || (d.shelter ? 'shelter' : 'standard')
    // 只在非 shelter 房间刷
    if (d.shelter || String(kind).toLowerCase() === 'shelter') return 0

    const seed = (d.seed ?? 0x9e3779b9) ^ 0x51ed270b
    rng = makeRng(seed >>> 0)
    time = 0
    statsT = 0

    const specs = Array.isArray(d.ecosystem) ? d.ecosystem.filter(Boolean) : defaultSpecs(biome)
    for (const spec of specs) {
      if (entities.length >= MAX_ECO_ENTITIES) break
      if (!spec) continue
      const k = typeof spec === 'string' ? spec : spec.kind
      if (!k || !['roach', 'plant', 'fly', 'rat'].includes(k)) continue
      const n = typeof spec === 'object' ? spec.n ?? 3 : 3
      const x = typeof spec === 'object' && Number.isFinite(spec.x) ? spec.x : undefined
      const y = typeof spec === 'object' && Number.isFinite(spec.y) ? spec.y : undefined
      spawnGroup(k, n, x, y)
    }
    updateStats(true)
    return entities.length
  }

  function updateStats(force = false) {
    if (!force && !eco.statsDirty) return
    let roaches = 0
    let plants = 0
    let critters = 0
    let nests = 0
    let scrap = 0
    let active = 0
    for (const e of entities) {
      if (!e.alive) continue
      active++
      if (e.kind === 'roach') roaches++
      else if (e.kind === 'plant') plants++
      else if (e.kind === 'fly' || e.kind === 'rat') critters++
      else if (e.kind === 'nest') {
        nests++
        scrap += e.stock?.length || 0
      }
    }
    const st = eco.counts
    st.roaches = roaches
    st.plants = plants
    st.critters = critters
    st.nests = nests
    st.scrap = scrap
    st.active = active
    st.total = active
    eco.statsDirty = false
    try {
      if (G && G.ecosystem) {
        G.ecosystem.roaches = roaches
        G.ecosystem.plants = plants
        G.ecosystem.critters = critters
        G.ecosystem.scrap = scrap
        G.ecosystem.active = active
      }
    } catch (e) {
      /* ignore */
    }
  }

  /** 玩家挥击检测：引擎的 robot.attack 只打怪物，这里自己做一次生态采集判定 */
  function detectSwing() {
    const p = game.robot || game.player
    if (!p) return null
    const s = typeof p.swingT === 'number' ? p.swingT : 0
    const prev = lastSwing
    lastSwing = s
    if (!(s > prev + 0.01)) return null
    if (s <= 0.05) return null
    const pos = playerPos(game)
    if (!pos) return null
    return { x: pos.x, y: pos.y, facing: pos.facing, tool: pos.tool }
  }

  function onSwing(swing) {
    const tool = swing.tool
    if (tool && tool.scan) return // 扫描仪不伤害生态
    const dmg = (TOOL_DAMAGE && TOOL_DAMAGE[tool?.id]) || 8
    eco.damageAt(swing.x, swing.y, ATTACK_RANGE + 12, dmg, {
      facing: swing.facing,
      fromX: swing.x,
      dyMax: 78,
    })
  }

  function update(dt) {
    const step = Math.min(Math.max(Number(dt) || 0, 0), 0.05)
    time += step

    const swing = detectSwing()
    if (swing) onSwing(swing)

    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i]
      if (!e) {
        entities.splice(i, 1)
        continue
      }
      try {
        e.update(step)
      } catch (err) {
        console.error(`[ecosystem] ${e.kind} update 失败`, err)
      }
      if (!e.alive && e.deadT >= DEATH_LINGER) {
        entities.splice(i, 1)
        try {
          e.dispose()
        } catch (err) {
          /* ignore */
        }
        eco.statsDirty = true
      }
    }

    statsT += step
    if (statsT > 0.5) {
      statsT = 0
      updateStats()
    }
  }

  function clear() {
    for (const e of entities) {
      try {
        e.dispose()
      } catch (err) {
        /* ignore */
      }
    }
    entities.length = 0
    data = null
    eco.data = null
    eco.statsDirty = true
    const st = eco.counts
    st.roaches = 0
    st.plants = 0
    st.critters = 0
    st.nests = 0
    st.scrap = 0
    st.active = 0
    st.total = 0
    try {
      if (G && G.ecosystem) {
        G.ecosystem.roaches = 0
        G.ecosystem.plants = 0
        G.ecosystem.critters = 0
        G.ecosystem.scrap = 0
        G.ecosystem.active = 0
      }
    } catch (e) {
      /* ignore */
    }
  }

  return eco
}

export default createEcosystem
