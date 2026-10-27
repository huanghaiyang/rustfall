import * as THREE from 'three'
import { spriteMaterial } from '../../render/materials.js'
import { TS, PLAYER } from '../../config.js'
import { makeBody, moveBody } from '../../world/tilemap.js'
import { Events, EV } from '../../core/events.js'
import { clamp, dist2 } from '../../utils.js'
import { Content } from '../../core/registry.js'
import { getMonsterArt } from '../../render/art/monsters.js'

/**
 * 所有怪物的基类。子类只需实现：
 *   updateBehavior(dt)   —— 设置 this.moveDir / 调用 this.tryAttack()
 *   performAttack()      —— 攻击动作与判定
 *   buildExtraVisual()   —— 可选：额外视觉（枪口/舌头/电弧…）
 */
export class BaseMonster {
  constructor(game, def, x, y) {
    this.game = game
    this.def = def
    this.id = def.id
    this.alive = true
    this.hp = def.hp ?? 40
    this.maxHp = this.hp
    this.damage = def.damage ?? 10
    this.facing = -1
    this.state = 'idle'
    this.stateT = 0
    this.hurtT = 0
    this.attackCd = 0.8 + Math.random() * 0.8
    this.stunT = 0
    this.deadT = 0
    this.moveDir = 0
    this.vxTarget = 0
    this.speed = def.speed ?? 60
    this.aggro = def.aggro ?? 320
    this.attackRange = def.attackRange ?? 70
    this.gravity = def.gravity ?? 2000
    this.flying = !!def.flying
    this.flyingHover = def.hover ?? 120

    const [w, h] = def.size || [48, 36]
    this.w = w
    this.h = h
    this.body = makeBody(x, y - h, w, h)
    this.group = new THREE.Group()
    this.group.position.z = 2
    this.hurtFlash = 0
    this.art = null
    try {
      this.art = getMonsterArt(def.artId || def.id)
    } catch (e) {
      this.art = null
    }
    this.frames = this.art?.frames || null
    this.animName = 'idle'
    this.animT = 0
    this.buildVisual()
  }

  get map() {
    return this.game.room?.map
  }
  get player() {
    return this.game.player
  }
  get px() {
    return this.body.x + this.body.w / 2
  }
  get py() {
    return this.body.y + this.body.h / 2
  }

  buildVisual() {
    const art = this.art
    const w = art?.w || this.w + 10
    const h = art?.h || this.h + 6
    this.spriteW = w
    this.spriteH = h
    const tex = this.frames?.idle?.[0] || null
    const mat = spriteMaterial(tex, { color: tex ? 0xffffff : this.def.color || 0x8a4b26 })
    this.mat = mat
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    this.mesh.renderOrder = 4
    this.group.add(this.mesh)

    // 血条（受击后短暂显示）
    const barW = Math.max(28, w * 0.7)
    this.hpBgMat = new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.85, depthWrite: false })
    this.hpFgMat = new THREE.MeshBasicMaterial({ color: 0xb8452f, transparent: true, opacity: 0.95, depthWrite: false })
    this.hpBg = new THREE.Mesh(new THREE.PlaneGeometry(barW, 3), this.hpBgMat)
    this.hpFg = new THREE.Mesh(new THREE.PlaneGeometry(barW, 3), this.hpFgMat)
    this.hpBarW = barW
    this.hpBg.renderOrder = 8
    this.hpFg.renderOrder = 9
    this.hpBg.visible = false
    this.hpFg.visible = false
    this.group.add(this.hpBg)
    this.group.add(this.hpFg)

    this.buildExtraVisual()
    this.applyFrame()
  }

  buildExtraVisual() {}

  playAnim(name) {
    if (this.animName === name) return
    this.animName = name
    this.animT = 0
    this.applyFrame()
  }

  applyFrame() {
    const set = this.frames?.[this.animName]
    if (!set) return
    const arr = Array.isArray(set) ? set : [set]
    const tex = arr[Math.floor(this.animT) % arr.length]
    if (tex && this.mat.map !== tex) {
      this.mat.map = tex
      this.mat.needsUpdate = true
      this.mat.color.setHex(0xffffff)
    }
  }

  distToPlayer() {
    if (!this.player) return Infinity
    return Math.hypot(this.player.centerX - this.px, this.player.centerY - this.py)
  }

  hasLineOfSight(tx, ty) {
    const map = this.map
    if (!map) return true
    const x0 = this.px
    const y0 = this.py
    const dx = tx - x0
    const dy = ty - y0
    const len = Math.hypot(dx, dy)
    const steps = Math.max(2, Math.floor(len / 20))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (map.solidAt(x0 + dx * t, y0 + dy * t)) return false
    }
    return true
  }

  facePlayer() {
    if (!this.player) return
    this.facing = this.player.centerX >= this.px ? 1 : -1
  }

  /** 前方是否有地面（防止走下悬崖），dir=1/-1 */
  groundAhead(dir = this.facing) {
    const map = this.map
    if (!map) return true
    const x = this.body.x + (dir > 0 ? this.body.w + 8 : -8)
    const y = this.body.y + this.body.h + 6
    return map.solidAt(x, y) || map.solidAt(x, y + TS * 0.6)
  }

  wallAhead(dir = this.facing) {
    const map = this.map
    if (!map) return false
    const x = this.body.x + (dir > 0 ? this.body.w + 4 : -4)
    return map.solidAt(x, this.body.y + this.body.h * 0.5)
  }

  /** 玩家是否在攻击范围内且大致同高 */
  canReachPlayer() {
    if (!this.player) return false
    const d = this.distToPlayer()
    const dy = Math.abs(this.player.centerY - this.py)
    return d <= this.attackRange && dy < Math.max(60, this.h * 0.9)
  }

  tryAttack() {
    if (this.attackCd > 0 || !this.canReachPlayer()) return false
    this.attackCd = this.def.attackCooldown ?? 1.6
    this.state = 'attack'
    this.stateT = 0
    this.playAnim('attack')
    this.performAttack()
    return true
  }

  performAttack() {
    this.hitPlayer(this.damage)
  }

  hitPlayer(dmg) {
    const p = this.player
    if (!p || p.dead) return
    if (p.invuln > 0) return
    p.takeDamage(dmg, this.px)
    Events.emit(EV.PLAYER_HURT, { damage: dmg, from: this.id })
  }

  takeDamage(n, fromX = null) {
    if (!this.alive) return
    this.hp -= n
    this.hurtT = 0.18
    this.hurtFlash = 1
    if (fromX != null) {
      const dir = this.px >= fromX ? 1 : -1
      this.body.vx += dir * 120
      this.body.vy = -140
    }
    this.hpBg.visible = true
    this.hpFg.visible = true
    this.hpBarT = 2.2
    if (this.hp <= 0) {
      this.die()
    } else {
      this.state = 'hurt'
      this.stateT = 0
      this.playAnim('hurt')
      this.game.sfx?.('hurt', { vol: 0.35, rate: 1.3 })
    }
  }

  die() {
    this.alive = false
    this.deadT = 0
    this.state = 'dead'
    this.hpBarVisible = false
    this.hpBg.visible = false
    this.hpFg.visible = false
    this.playAnim('dead')
    this.game.onMonsterKilled?.(this)
    this.game.sfx?.('death', { vol: 0.4, rate: 1.5 })
    const drops = this.def.loot || []
    for (const d of drops) {
      const chance = d.chance ?? 1
      if (Math.random() > chance) continue
      const n = d.min != null ? d.min + Math.floor(Math.random() * (d.max - d.min + 1)) : 1
      for (let i = 0; i < n; i++) {
        this.game.dropLoot?.(d.id, this.px + (Math.random() - 0.5) * 30, this.py, {
          vx: (Math.random() - 0.5) * 120,
          vy: -120 - Math.random() * 100,
        })
      }
    }
  }

  update(dt) {
    if (!this.alive) {
      this.deadT += dt
      this.animT += dt * 6
      this.applyFrame()
      this.syncMesh()
      if (this.deadT > 1.6) {
        this.group.visible = false
      }
      return
    }
    this.stateT += dt
    this.attackCd = Math.max(0, this.attackCd - dt)
    this.hurtT = Math.max(0, this.hurtT - dt)
    this.stunT = Math.max(0, this.stunT - dt)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4)
    if (this.hpBarT > 0) {
      this.hpBarT -= dt
      if (this.hpBarT <= 0) {
        this.hpBg.visible = false
        this.hpFg.visible = false
      }
    }

    this.updateBehavior(dt)

    // 物理推进
    if (!this.flying) {
      this.body.vx = clamp(this.body.vx + (this.vxTarget - this.body.vx) * Math.min(1, dt * 8), -280, 280)
      this.body.vy = Math.min(this.body.vy + this.gravity * dt, 980)
      moveBody(this.map, this.body, dt)
    } else {
      this.body.vx += (this.vxTarget - this.body.vx) * Math.min(1, dt * 4)
    }

    // 动画
    this.animT += dt * 9
    this.applyFrame()
    this.syncMesh()
    if (this.hurtFlash > 0.01) {
      this.mat.color.setRGB(1, 0.55, 0.45)
    } else if (!this.frames?.idle?.[0]) {
      this.mat.color.setHex(this.def.color || 0x8a4b26)
    } else {
      this.mat.color.setRGB(1, 1, 1)
    }
  }

  /** 子类在这里写 AI；默认：巡逻 → 追击 → 攻击 */
  updateBehavior(dt) {
    const p = this.player
    if (!p || p.dead) {
      this.state = 'idle'
      this.vxTarget = 0
      return
    }
    const d = this.distToPlayer()
    const sees = d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)
    if (sees) {
      this.facePlayer()
      this.state = 'chase'
      this.vxTarget = this.facing * this.speed
      this.tryAttack()
    } else {
      this.state = 'patrol'
      if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      this.vxTarget = this.facing * this.speed * 0.45
    }
    this.playAnim(this.state === 'chase' ? 'run' : this.state === 'attack' ? 'attack' : 'idle')
  }

  syncMesh() {
    const b = this.body
    this.mesh.position.x = b.x + b.w / 2
    this.mesh.position.y = -(b.y + b.h) + (this.spriteH || this.h) / 2
    this.mesh.scale.x = this.facing
    if (this.frames?.idle?.[0] === undefined && this.art == null) {
      // 兜底：没有贴图时用色块
      this.mesh.scale.x = this.facing * ((this.spriteW || this.w) / 32)
      this.mesh.scale.y = (this.spriteH || this.h) / 32
    }
    if (this.hpBg.visible) {
      const ratio = clamp(this.hp / this.maxHp, 0, 1)
      this.hpBg.position.set(b.x + b.w / 2, -(b.y) + 16, 6)
      this.hpFg.position.set(b.x + b.w / 2 - (this.hpBarW * (1 - ratio)) / 2, -(b.y) + 16, 6.1)
      this.hpFg.scale.x = Math.max(0.001, ratio)
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material && o.material !== this.mat) o.material.dispose()
    })
    this.mat.dispose()
    this.hpBgMat.dispose()
    this.hpFgMat.dispose()
  }
}

export function defineMonster(id, def) {
  return { id, ...def }
}
