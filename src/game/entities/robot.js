import * as THREE from 'three'
import { spriteMaterial } from '../render/materials.js'
import { getGlowTexture } from '../render/textures.js'
import { getWeaponArt, getWeaponHoldArt } from '../render/art/weapons.js'
import { getToolArt } from '../render/art/tools.js'
import { getItemArt } from '../render/art/items.js'
import {
  PLAYER,
  TS,
  ATTACK_CD,
  ATTACK_RANGE,
  CHASSIS_SWITCH_CD,
  CHASSIS_SWITCH_COST,
  TOOL_DAMAGE,
} from '../config.js'
import { makeBody, moveBody } from '../world/tilemap.js'
import { getChassisArt } from '../render/art/chassis.js'
import { computeStats, getChassis } from '../chassis/index.js'
import { getTool, editTerrain, scanArea } from '../tools/index.js'
import { growthTotals } from '../systems/growth.js'
import { Events, EV } from '../core/events.js'
import { G, toast, notify } from '../state.js'
import { approach, clamp } from '../utils.js'

const FAMILY_STEP = { biped: 'step', wheel: 'servo', track: 'step', quad: 'step', arm: 'land', light: 'step' }

/** 玩家：可切换机体的废土机器人 */
export class Robot {
  constructor(game, chassisId, x, y) {
    this.game = game
    this.chassisId = chassisId || G.chassisId || 'unit7'
    this.stats = computeStats(this.chassisId, G.equipped)
    this.maxJumps = this.stats.abilities.includes('doubleJump') ? 2 : 1
    this.jumpsLeft = this.maxJumps
    this.body = makeBody(x, y - 32, this.hitW, this.hitH)
    this.facing = 1
    this.animName = 'idle'
    this.animT = 0
    this.frame = 0
    this.coyote = 0
    this.jumpBuffer = 0
    this.climbing = false
    this.wallSliding = false
    this.crouching = false
    this.swim = false
    this.wasGround = false
    this.stepTimer = 0
    this.squash = 1
    this.attackCd = 0
    this.swingT = 0
    this.landT = 0
    this.attackT = 0
    this.shootT = 0
    this.hurtT = 0
    this.deadT = 0
    this.heldWeapon = null
    this.weaponMesh = null
    this.heldTool = null
    this.toolMesh = null
    this.equippedKey = ''
    this.moduleMesh = null
    this.useT = 0
    this.useKind = ''
    this.switchCd = 0
    this.dead = false
    this.invuln = 1.2
    this.hovering = false
    this.energyRegenT = 0
    this.lastChassisCheck = 0
    this.art = null
    this.buildVisual()
  }

  get hitW() {
    return (getChassis(this.chassisId)?.hitbox || [22, 32])[0]
  }
  get hitH() {
    return (getChassis(this.chassisId)?.hitbox || [22, 32])[1]
  }
  get centerX() {
    return this.body.x + this.body.w / 2
  }
  get centerY() {
    return this.body.y + this.body.h / 2
  }
  get frontX() {
    return this.centerX + this.facing * 26
  }
  get frontY() {
    return this.centerY + 2
  }
  get map() {
    return this.game.room?.map
  }
  get tool() {
    return getTool(G.toolId)
  }

  buildVisual() {
    if (this.artMesh) {
      this.group.remove(this.artMesh)
      this.artMesh.geometry.dispose()
      this.artMesh.material.dispose()
    }
    try {
      this.art = getChassisArt(this.chassisId)
    } catch (e) {
      this.art = null
    }
    const w = this.art?.w || 44
    const h = this.art?.h || 48
    this.spriteW = w
    this.spriteH = h
    const tex = this.art?.frames?.idle?.[0] || null
    const mat = spriteMaterial(tex, { color: 0xffffff })
    this.mat = mat
    this.artMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    this.artMesh.renderOrder = 5
    this.artMesh.position.z = 2
    if (this.group) {
      this.group.add(this.artMesh)
    } else {
      // 头灯光锥
      const glowMat = new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color: 0xf2b34a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      this.glow = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), glowMat)
      this.glow.renderOrder = 4
      this.glow.position.z = 1.5
      this.group = new THREE.Group()
      this.group.add(this.glow)
      this.group.add(this.artMesh)
    }
    this.applyFrame()
  }

  pickFrame(name) {
    const set = this.art?.frames?.[name]
    if (!set) return null
    return Array.isArray(set) ? set[Math.floor(this.frame) % set.length] : set
  }

  setAnim(name) {
    if (this.animName === name) return
    this.animName = name
    this.animT = 0
    this.frame = 0
    this.applyFrame()
  }

  applyFrame() {
    const tex = this.pickFrame(this.animName)
    if (tex && this.mat.map !== tex) {
      this.mat.map = tex
      this.mat.needsUpdate = true
    }
  }

  refreshStats() {
    // 装备加成 + 成长加成合并后再计算机体属性
    const bonus = { ...(this.game.inventory?.totals() || {}) }
    const grow = growthTotals()
    for (const k in grow) bonus[k] = (bonus[k] || 0) + grow[k]
    // 限时增益（药物、信号棒、临时伺服超频等）
    for (const buf of G.buffs || []) {
      if (!buf || !buf.stats) continue
      for (const k in buf.stats) bonus[k] = (bonus[k] || 0) + buf.stats[k]
    }
    this.stats = computeStats(this.chassisId, G.equipped, bonus)
    G.hpMax = this.stats.hp
    G.energyMax = this.stats.energyMax
    G.hp = Math.min(G.hp, G.hpMax)
    G.energy = Math.min(G.energy, G.energyMax)
    this.maxJumps = this.stats.abilities.includes('doubleJump') ? 2 : 1
    // 负重量随机体基础 carry 缩放（组件 bonus 由 inventory 自己算）
    try {
      const baseCarry = getChassis(this.chassisId)?.carry || 1
      this.game.inventory?.setCapacityMultiplier?.(baseCarry)
    } catch (e) {
      /* ignore */
    }
  }

  switchChassis(newId) {
    if (newId === this.chassisId) return { ok: false, reason: 'same' }
    if (!G.chassisUnlocked.includes(newId)) return { ok: false, reason: 'locked' }
    if (this.switchCd > 0) return { ok: false, reason: 'cooldown' }
    if (G.energy < 8) return { ok: false, reason: 'energy' }
    const ratio = G.hp / G.hpMax
    this.chassisId = newId
    G.chassisId = newId
    this.switchCd = CHASSIS_SWITCH_CD
    G.energy = Math.max(0, G.energy - 8)
    this.refreshStats()
    G.hp = Math.max(1, Math.round(G.hpMax * ratio))
    // 保持脚底位置
    const feet = this.body.y + this.body.h
    this.body.w = this.hitW
    this.body.h = this.hitH
    this.body.y = feet - this.body.h
    this.buildVisual()
    this.game.cameraShake?.(0.35)
    this.game.particles?.emitMany?.('spark', this.centerX, this.centerY, 14)
    this.game.sfx?.('servo', { vol: 0.7 })
    Events.emit(EV.CHASSIS_SWITCH, { chassisId: newId })
    toast(`已切换：${getChassis(newId)?.name || newId}`, 'good', 2)
    return { ok: true }
  }

  update(dt) {
    if (this.dead) return
    const b = this.body
    const map = this.map
    const input = this.game.input
    this.attackCd = Math.max(0, this.attackCd - dt)
    this.swingT = Math.max(0, this.swingT - dt)
    this.switchCd = Math.max(0, this.switchCd - dt)
    this.invuln = Math.max(0, this.invuln - dt)
    this.landT = Math.max(0, this.landT - dt)
    this.attackT = Math.max(0, this.attackT - dt)
    this.shootT = Math.max(0, this.shootT - dt)
    this.hurtT = Math.max(0, this.hurtT - dt)
    if (this.dead) this.deadT += dt
    this.useT = Math.max(0, this.useT - dt)
    const wid = this.game.weapons ? this.game.weapons.weaponId : null
    if (wid !== this.heldWeapon) this.setHeldWeapon(wid)
    // 没有武器时，把手里的工具真正画出来；同时同步肩部模块
    const tid = wid ? null : G.toolId
    if (tid !== this.heldTool) this.setHeldTool(tid)
    const eqKey = `${G.equipped.sensor || ''}|${G.equipped.utility || ''}`
    if (eqKey !== this.equippedKey) this.refreshModule()
    G.hurt = Math.max(0, G.hurt - dt * 2)

    // 能量缓慢回复
    const regen = 2 + (this.stats.regen || 0)
    G.energy = Math.min(G.energyMax, G.energy + regen * dt)

    const ix = input.axisX()
    const wantUp = input.isDown('up')
    const wantDown = input.isDown('down')
    const jumpHeld = input.isDown('jump')

    b.inWater = map.rectWaterRatio(b.x, b.y, b.w, b.h) > 0.3
    b.inToxic = map.rectToxic(b.x, b.y, b.w, b.h)
    this.swim = b.inWater
    const nearPole = map.rectPole(b.x, b.y, b.w, b.h)

    // 酸水持续伤害
    if (b.inToxic) {
      this.toxicTimer = (this.toxicTimer || 0) + dt
      if (this.toxicTimer > 0.6) {
        this.toxicTimer = 0
        const dmg = Math.max(1, 6 * dt * 3 * (this.stats.abilities.includes('radShield') ? 0.4 : 1))
        this.applyDamage(dmg, null, '酸液腐蚀')
      }
      if (Math.random() < dt * 2) this.game.particles?.emit?.('bubble', this.centerX, this.body.y + b.h, {})
    } else {
      this.toxicTimer = 0
    }

    // 蹲伏
    const shrink = this.hitH - Math.max(18, this.hitH - 12)
    const canStand = !this.solidAt(b.x, b.y - shrink + 1, b.w, shrink - 2)
    const wantCrouch = b.onGround && wantDown && !b.inWater && !this.climbing
    this.crouching = wantCrouch || (this.crouching && !canStand)
    if (!b.onGround || b.inWater) this.crouching = false
    const targetH = this.crouching ? Math.max(18, this.hitH - 12) : this.hitH
    if (targetH !== b.h) {
      const feet = b.y + b.h
      b.h = targetH
      b.y = feet - targetH
    }

    // 攀爬（墙）
    const wallClimb = this.stats.abilities.includes('wallClimb')
    this.wallSliding = false
    if (wallClimb && !b.onGround && !b.inWater) {
      const wallDir = map.solidAt(b.x - 4, b.y + b.h * 0.4) ? -1 : map.solidAt(b.x + b.w + 4, b.y + b.h * 0.4) ? 1 : 0
      if (wallDir !== 0 && ix === wallDir) {
        this.wallSliding = true
        if (wantUp) {
          b.vy = Math.min(b.vy, -PLAYER.climb * this.stats.speed)
          this.jumpsLeft = Math.max(this.jumpsLeft, 1)
        } else {
          b.vy = Math.min(b.vy, 120)
        }
      }
    }

    // 杆攀爬
    if (nearPole && !b.inWater && (wantUp || wantDown || this.climbing)) this.climbing = true
    if (!nearPole || b.inWater) this.climbing = false
    if (this.climbing && b.onGround && wantDown) this.climbing = false

    // 水平移动
    const baseSpeed = PLAYER.walk * this.stats.speed
    const maxSpeed = b.inWater
      ? PLAYER.swimSpeed * this.stats.speed * (this.stats.abilities.includes('fastSwim') ? 1.35 : 1)
      : this.climbing
        ? PLAYER.climb * 0.75
        : this.crouching
          ? PLAYER.crouchWalk * this.stats.speed
          : baseSpeed
    const accel = b.onGround || this.climbing ? PLAYER.accel : PLAYER.airAccel
    if (ix !== 0) {
      b.vx = approach(b.vx, ix * maxSpeed, accel * dt)
      this.facing = ix
    } else if (b.onGround || this.climbing || b.inWater) {
      b.vx = approach(b.vx, 0, PLAYER.friction * dt)
    }

    // 跳跃
    if (b.onGround) {
      this.coyote = PLAYER.coyote
      this.jumpsLeft = this.maxJumps
    } else {
      this.coyote = Math.max(0, this.coyote - dt)
    }
    if (input.wasPressed('jump')) this.jumpBuffer = PLAYER.buffer
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)
    const jumpPower = PLAYER.jump * this.stats.jump

    if (b.inWater) {
      if (wantUp) b.vy = approach(b.vy, -PLAYER.swimUp, 900 * dt)
      else if (wantDown) b.vy = approach(b.vy, 220, 900 * dt)
      else b.vy = approach(b.vy, 50, 240 * dt)
      b.vy = clamp(b.vy, -PLAYER.swimUp, 280)
      if (input.wasPressed('jump')) {
        b.vy = -PLAYER.swimUp * 1.08
        this.game.sfx?.('splash', { vol: 0.3 })
      }
    } else if (this.climbing) {
      const dirY = (wantDown ? 1 : 0) - (wantUp ? 1 : 0)
      b.vy = dirY * PLAYER.climb
      if (input.wasPressed('jump')) {
        b.vy = -jumpPower * 0.8
        b.vx = this.facing * 140
        this.climbing = false
        this.game.sfx?.('jump', { vol: 0.5 })
      }
    } else {
      // 二段跳 / 悬停
      if (this.jumpBuffer > 0) {
        if (b.onGround || this.coyote > 0) {
          b.vy = -jumpPower
          this.jumpBuffer = 0
          this.coyote = 0
          this.jumpsLeft = this.maxJumps - 1
          this.squash = 1.16
          this.game.sfx?.('jump', { vol: 0.6, rate: 0.9 + Math.random() * 0.1 })
        } else if ((this.jumpsLeft > 1 && G.energy >= 8) || G.settings?.infiniteJump) {
          b.vy = -jumpPower * 0.88
          // 测试选项：无限跳不消耗跳跃次数与电量
          if (!G.settings?.infiniteJump) {
            this.jumpsLeft--
            G.energy -= 8
          }
          this.jumpBuffer = 0
          this.game.sfx?.('servo', { vol: 0.6 })
          this.game.particles?.emitMany?.('spark', this.centerX, this.body.y + b.h, 5)
        }
      }
      if (input.wasReleased('jump') && b.vy < -120) b.vy *= PLAYER.jumpCut
      this.hovering = false
      if (this.stats.abilities.includes('hover') && jumpHeld && !b.onGround && b.vy > 30 && G.energy > 1) {
        b.vy = Math.min(b.vy, 70)
        G.energy = Math.max(0, G.energy - 14 * dt)
        this.hovering = true
      }
      b.vy = Math.min(b.vy + PLAYER.gravity * dt, PLAYER.maxFall)
    }

    // 下穿平台
    if (wantDown && b.onGround && this.standingOnPlatform()) {
      b.dropThrough = 0.18
      b.y -= 2
      b.onGround = false
    }

    const preVy = b.vy
    moveBody(map, b, dt)
    this.usedMoveBodyDt = dt

    if (b.onGround && !this.wasGround) {
      this.squash = 0.78
      this.landT = 0.24
      if (preVy > 260) {
        this.game.sfx?.(preVy > 620 ? 'land' : 'step', { vol: clamp(preVy / 1000, 0.2, 0.8) })
        this.game.cameraShake?.(clamp(preVy / 3200, 0, 0.25))
        this.game.particles?.emitMany?.('dust', this.centerX, this.body.y + b.h, 5)
      }
      this.jumpsLeft = this.maxJumps
    }
    this.wasGround = b.onGround

    // 脚步声
    if (b.onGround && Math.abs(b.vx) > 40) {
      this.stepTimer -= dt
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.32
        const snd = FAMILY_STEP[getChassis(this.chassisId)?.family] || 'step'
        this.game.sfx?.(snd, { vol: 0.22, rate: 0.9 + Math.random() * 0.2 })
        if (Math.random() < 0.5) this.game.particles?.emit?.('dust', this.centerX, this.body.y + b.h, { life: 0.4 })
      }
    }

    if (b.y > this.game.room.data.worldH + 300 || b.y < -600) {
      this.game.die?.('失足坠落')
      return
    }

    // 攻击/使用工具
    if ((this.game.input.isDown('attack') || this.game.input.isDown('interactTool')) && this.attackCd <= 0) {
      this.tryAttack()
    }

    this.updateAnim(dt)
    this.syncMesh(dt)
  }

  solidAt(x, y, w, h) {
    const map = this.map
    if (!map) return false
    const x0 = Math.floor(x / TS)
    const x1 = Math.floor((x + w - 0.01) / TS)
    const y0 = Math.floor(y / TS)
    const y1 = Math.floor((y + h - 0.01) / TS)
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) if (map.isSolid(tx, ty)) return true
    return false
  }

  standingOnPlatform() {
    const b = this.body
    const ty = Math.floor((b.y - 0.5) / TS)
    const x0 = Math.floor((b.x + 3) / TS)
    const x1 = Math.floor((b.x + b.w - 3) / TS)
    for (let tx = x0; tx <= x1; tx++) if (this.map.isPlatform(tx, ty)) return true
    return false
  }

  /** 有武器先开火，没武器/没弹药再用工具 */
  tryAttack() {
    const w = this.game.weapons
    if (w && w.weaponId) {
      const res = w.fire()
      if (res && res.ok) {
        this.shootT = 0.18
        this.attackT = 0.22
        this.attackCd = 0.08
        this.game.cameraShake?.(0.05)
        return true
      }
      if (res && res.reason && this.game.input.wasPressed && this.game.input.wasPressed('attack')) {
        this.game.showHint?.(res.reason, 1.6)
      }
      this.attackCd = 0.22
      return false
    }
    this.attack()
    this.attackT = 0.24
    return true
  }

  setHeldWeapon(id) {
    this.heldWeapon = id || null
    if (this.weaponMesh) {
      this.group.remove(this.weaponMesh)
      this.weaponMesh.geometry.dispose()
      this.weaponMesh.material.dispose()
      this.weaponMesh = null
    }
    if (!id) return
    let tex = null
    try {
      tex = getWeaponHoldArt(id)
    } catch (e) {
      tex = null
    }
    if (!tex) {
      try {
        tex = getWeaponArt(id)
      } catch (e) {
        tex = null
      }
    }
    if (!tex) return
    const mat = spriteMaterial(tex)
    const w = tex.image?.width || 32
    const h = tex.image?.height || 24
    this.weaponMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    this.weaponMesh.position.z = 3
    this.weaponMesh.renderOrder = 6
    this.group.add(this.weaponMesh)
  }

  /** 无武器时把当前工具真实握在手上 */
  setHeldTool(id) {
    this.heldTool = id || null
    if (this.toolMesh) {
      this.group.remove(this.toolMesh)
      this.toolMesh.geometry.dispose()
      this.toolMesh.material.dispose()
      this.toolMesh = null
    }
    if (!id) return
    let tex = null
    try {
      tex = getToolArt(id)
    } catch (e) {
      tex = null
    }
    if (!tex) return
    const mat = spriteMaterial(tex)
    const size = 20
    this.toolMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat)
    this.toolMesh.position.z = 3.2
    this.toolMesh.renderOrder = 6
    this.group.add(this.toolMesh)
  }

  /** 装备的传感器/功能模块挂在肩甲（上臂）外侧 */
  refreshModule() {
    const sensor = G.equipped.sensor
    const utility = G.equipped.utility
    const key = `${sensor || ''}|${utility || ''}`
    if (key === this.equippedKey) return
    this.equippedKey = key
    if (this.moduleMesh) {
      this.group.remove(this.moduleMesh)
      this.moduleMesh.geometry.dispose()
      this.moduleMesh.material.dispose()
      this.moduleMesh = null
    }
    const itemId = utility || sensor
    if (!itemId) return
    let tex = null
    try {
      tex = getItemArt(itemId)
    } catch (e) {
      tex = null
    }
    if (!tex) return
    const mat = spriteMaterial(tex)
    this.moduleMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat)
    this.moduleMesh.position.z = 3.4
    this.moduleMesh.renderOrder = 7
    this.group.add(this.moduleMesh)
  }

  /** 使用道具时的机体动作与手部特效 */
  playUse(kind = 'use') {
    this.useT = 0.45
    this.useKind = kind
    const types = {
      heal: 'food',
      energy: 'spark',
      repair: 'spark',
      radClear: 'bubble',
      light: 'spark',
      scan: 'spark',
      use: 'dust',
    }
    this.game.particles?.emitMany?.(types[kind] || 'dust', this.frontX, this.frontY, 8)
    const sounds = {
      heal: 'pickup',
      energy: 'pickup',
      repair: 'weld',
      radClear: 'splash',
      light: 'flare',
      scan: 'scan',
    }
    this.game.sfx?.(sounds[kind] || 'pickup', { vol: 0.45 })
  }

  attack() {
    const tool = this.tool
    if (!tool) return
    this.attackCd = (tool.cooldown || ATTACK_CD) * (1 - Math.min(0.35, (this.stats.speed - 1) * 0.4))
    this.swingT = 0.26
    this.game.sfx?.(tool.sound || 'step', { vol: 0.5, rate: 0.9 })

    const dmgBase = (TOOL_DAMAGE[tool.id] || 8) * (this.stats.attack / 12)
    const range = ATTACK_RANGE + (tool.id === 'pickaxe' ? 8 : 0)
    let hitSomething = false

    // 打怪
    const director = this.game.director
    if (director) {
      for (const m of director.list) {
        if (!m.alive) continue
        const dx = m.px - this.centerX
        const dy = m.py - this.centerY
        if (Math.abs(dy) > 62) continue
        if (Math.abs(dx) > range + m.w * 0.4) continue
        if (Math.sign(dx) !== this.facing && Math.abs(dx) > 16) continue
        m.takeDamage(dmgBase, this.centerX)
        hitSomething = true
        this.game.particles?.emitMany?.('spark', m.px, m.py, 6)
      }
    }

    // 工具特性
    if (tool.scan) {
      if (G.energy >= 12) {
        G.energy -= 12
        const res = scanArea(this.game, tool.reach || 320)
        const n = res.loot.length + res.props.length + res.cages.length
        toast(n > 0 ? `扫描到 ${n} 个目标` : '附近没有可扫描的东西', n > 0 ? 'good' : 'info', 2)
      } else {
        toast('电量不足，无法扫描', 'warn', 1.6)
      }
    } else if (tool.dig || tool.breakTiles) {
      const res = editTerrain(this.game.room, tool.id, this.centerX, this.centerY + 6, this.facing)
      if (res.destroyed > 0) {
        hitSomething = true
        this.game.room.onTileEdited?.()
        for (const h of res.hits) {
          if (h.destroyed) {
            this.game.particles?.emitMany?.('dust', (h.tx + 0.5) * TS, (h.ty + 0.5) * TS, 6)
          }
        }
        this.game.sfx?.(tool.id === 'pickaxe' ? 'land' : 'dig', { vol: 0.6 })
        this.game.room.unburyNear?.(this.centerX, this.centerY)
      }
    } else if (tool.repair) {
      const repaired = this.game.tryRepairInFront?.(this.frontX, this.frontY, this)
      if (repaired) hitSomething = true
    }

    if (hitSomething) {
      this.game.cameraShake?.(0.16)
    }
  }

  takeDamage(n, fromX = null) {
    this.applyDamage(n, fromX, null)
  }

  applyDamage(n, fromX = null, reason = null) {
    if (this.dead || this.invuln > 0) return
    // 测试选项：无敌
    if (G.settings?.godMode) return
    this.hurtT = 0.34
    const reduced = Math.max(1, Math.round(n * (1 - this.stats.armor)))
    G.hp = Math.max(0, G.hp - reduced)
    G.hurt = 1
    this.invuln = 0.55
    this.game.cameraShake?.(0.45)
    G.flash = Math.min(0.6, G.flash + 0.35)
    this.game.sfx?.('hurt', { vol: 0.6 })
    this.game.particles?.emitMany?.('blood', this.centerX, this.centerY, 6)
    if (fromX != null) {
      const dir = this.centerX >= fromX ? 1 : -1
      this.body.vx = dir * 160
      this.body.vy = -160
    }
    Events.emit(EV.PLAYER_HURT, { damage: reduced, reason })
    if (G.hp <= 0) {
      this.dead = true
      this.game.die?.(reason || '机体损毁')
    }
  }

  heal(n) {
    G.hp = Math.min(G.hpMax, G.hp + n)
  }

  updateAnim(dt) {
    const b = this.body
    const frames = this.art?.frames || {}
    const armed = !!this.heldWeapon
    let name = 'idle'
    if (this.dead) name = 'dead'
    else if (this.hurtT > 0) name = 'hurt'
    else if (this.shootT > 0) name = 'shoot'
    else if (this.attackT > 0) name = 'attack'
    else if (this.swingT > 0) name = 'dig'
    else if (this.swim) name = 'swim'
    else if (this.climbing || this.wallSliding) name = 'climb'
    else if (!b.onGround) name = b.vy < 0 ? (this.jumpsLeft < this.maxJumps ? 'jump2' : 'jump') : 'fall'
    else if (this.landT > 0) name = 'land'
    else if (this.crouching) name = 'crouch'
    else if (Math.abs(b.vx) > 22) name = 'run'
    else if (armed) name = 'hold'

    // 缺帧回退链，保证任何美术缺帧都不会卡住
    const chain = {
      dead: ['dead', 'hurt', 'idle'],
      hurt: ['hurt', 'idle'],
      shoot: ['shoot', 'attack', 'idle'],
      attack: ['attack', 'dig', 'idle'],
      hold: ['hold', 'idle'],
      dig: ['dig', 'attack', 'idle'],
      swim: ['swim', 'run', 'idle'],
      climb: ['climb', 'run', 'idle'],
      jump2: ['jump2', 'jump', 'fall'],
      jump: ['jump', 'fall', 'idle'],
      fall: ['fall', 'jump', 'idle'],
      land: ['land', 'crouch', 'idle'],
      crouch: ['crouch', 'idle'],
      run: ['run', 'idle'],
    }
    if (!frames[name]) {
      for (const cand of chain[name] || ['idle']) {
        if (frames[cand]) {
          name = cand
          break
        }
      }
    }
    if (this.animName !== name) this.setAnim(name)

    const fps = {
      idle: 4,
      run: 14,
      jump: 2,
      jump2: 2,
      fall: 2,
      land: 24,
      crouch: 2,
      dig: 8,
      attack: 14,
      shoot: 16,
      hold: 3,
      swim: 8,
      climb: 9,
      hurt: 6,
      dead: 4,
    }[name] || 4
    this.animT += dt * fps
    const count = Array.isArray(frames[name]) ? frames[name].length : 1
    this.frame = name === 'land' ? Math.min(count - 1, Math.floor((1 - this.landT / 0.24) * count)) : this.animT
    this.applyFrame()
    this.squash += (1 - this.squash) * Math.min(1, dt * 14)
  }

  syncMesh(dt) {
    const b = this.body
    const scaleY = (this.spriteH / (this.art?.h || this.spriteH)) * this.squash
    if (this.artMesh) {
      this.artMesh.scale.set(this.facing, scaleY, 1)
      this.artMesh.position.x = b.x + b.w / 2
      this.artMesh.position.y = -(b.y + b.h) + (this.spriteH * scaleY) / 2
      if (this.swingT > 0) {
        this.artMesh.rotation.z = -this.facing * Math.sin((0.26 - this.swingT) / 0.26 * Math.PI) * 0.55
      } else {
        this.artMesh.rotation.z = 0
      }
    }
    if (this.weaponMesh) {
      this.weaponMesh.position.x = b.x + b.w / 2 + this.facing * (b.w * 0.34)
      this.weaponMesh.position.y = -(b.y + b.h * 0.62)
      this.weaponMesh.scale.x = this.facing
      this.weaponMesh.rotation.z = this.facing * (this.shootT > 0 ? 0.16 : 0)
      this.weaponMesh.visible = !this.dead
    }
    if (this.toolMesh) {
      this.toolMesh.position.x = b.x + b.w / 2 + this.facing * (b.w * 0.34)
      this.toolMesh.position.y = -(b.y + b.h * 0.58)
      this.toolMesh.scale.x = this.facing
      this.toolMesh.rotation.z = this.facing * (this.swingT > 0 ? Math.sin((0.26 - this.swingT) / 0.26 * Math.PI) * 0.7 : 0)
      this.toolMesh.visible = !this.dead
    }
    if (this.moduleMesh) {
      // 挂在肩甲/上臂外侧，随朝向翻转
      this.moduleMesh.position.x = b.x + b.w / 2 - this.facing * (b.w * 0.18)
      this.moduleMesh.position.y = -(b.y + b.h * 0.86)
      this.moduleMesh.scale.x = this.facing
      this.moduleMesh.visible = !this.dead
    }
    if (this.glow) {
      this.glow.position.x = b.x + b.w / 2
      this.glow.position.y = -(b.y + b.h / 2)
      const glowOn = !!(G.settings && G.settings.glow)
      this.glow.visible = glowOn
      this.glow.material.opacity = glowOn ? (this.stats.abilities.includes('nightVision') ? 0.16 : 0.1) : 0
    }
  }

  dispose() {
    for (const o of [this.artMesh, this.glow, this.weaponMesh, this.toolMesh, this.moduleMesh]) {
      if (!o) continue
      o.geometry?.dispose()
      o.material?.dispose()
    }
  }
}

