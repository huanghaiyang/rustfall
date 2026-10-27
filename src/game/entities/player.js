import * as THREE from 'three'
import { PLAYER, TS } from '../config.js'
import { makeBody, moveBody } from '../world/tilemap.js'
import { approach, clamp } from '../utils.js'
import { getSlugcatTextures } from '../render/textures.js'

const SPRITE_W = 44
const SPRITE_H = 40

export class Player {
  constructor(game, x, y) {
    this.game = game
    this.body = makeBody(x, y, PLAYER.w, PLAYER.h)
    this.facing = 1
    this.state = 'idle'
    this.animName = 'idle'
    this.animT = 0
    this.frame = 0
    this.coyote = 0
    this.jumpBuffer = 0
    this.jumpHeld = false
    this.climbing = false
    this.crouching = false
    this.wasGround = false
    this.stepTimer = 0
    this.squash = 1
    this.hurtTimer = 0
    this.dead = false
    this.invuln = 0
    this.splashCooldown = 0
    this.tex = getSlugcatTextures()

    const geo = new THREE.PlaneGeometry(SPRITE_W, SPRITE_H)
    const mat = new THREE.MeshBasicMaterial({
      map: this.pickFrame('idle'),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.renderOrder = 5
    this.mesh.position.z = 2

    // 呼吸光晕（让白猫在暗场里可读）
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x9fd3e0,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), glowMat)
    this.glow.position.z = 1.5
    this.glow.renderOrder = 4

    this.group = new THREE.Group()
    this.group.add(this.glow)
    this.group.add(this.mesh)
  }

  get map() {
    return this.game.room.map
  }

  pickFrame(name) {
    const t = this.tex[name] || this.tex.idle
    if (!t) return null
    if (Array.isArray(t)) return t[0]
    return t
  }

  setAnim(name) {
    if (this.animName === name) return
    this.animName = name
    this.animT = 0
    this.frame = 0
    this.applyFrame()
  }

  applyFrame() {
    const tex = this.tex[this.animName] || this.tex.idle
    if (!tex) return
    const frames = Array.isArray(tex) ? tex : [tex]
    const frame = frames[Math.floor(this.frame) % frames.length]
    if (frame && this.mesh.material.map !== frame) {
      this.mesh.material.map = frame
      this.mesh.material.needsUpdate = true
    }
  }

  get centerX() {
    return this.body.x + this.body.w / 2
  }
  get centerY() {
    return this.body.y + this.body.h / 2
  }

  update(dt) {
    if (this.dead) return
    const b = this.body
    const map = this.map
    const input = this.game.input

    this.splashCooldown = Math.max(0, this.splashCooldown - dt)
    this.hurtTimer = Math.max(0, this.hurtTimer - dt)
    this.invuln = Math.max(0, this.invuln - dt)

    const ix = input.axisX()
    const wantUp = input.isDown('up')
    const wantDown = input.isDown('down')

    b.inWater = map.rectWaterRatio(b.x, b.y, b.w, b.h) > 0.3
    const nearPole = map.rectPole(b.x, b.y, b.w, b.h)
    const wasInWater = this.wasInWater

    // ---------- 入水/出水音效与粒子 ----------
    if (b.inWater && !wasInWater && this.splashCooldown <= 0) {
      this.sfx('splash', { vol: 0.6 })
      for (let i = 0; i < 8; i++) {
        this.game.particles.emit('splash', b.x + b.w / 2, b.y + 4, {
          vx: (Math.random() - 0.5) * 180,
          vy: -Math.random() * 170,
          life: 0.5 + Math.random() * 0.4,
        })
      }
      this.splashCooldown = 0.35
    }
    this.wasInWater = b.inWater

    // ---------- 蹲伏 ----------
    const shrink = PLAYER.h - PLAYER.crouchH
    const canStandUp = !this.mapSolidAt(b.x, b.y - shrink + 1, b.w, shrink - 2)
    const wantCrouch = b.onGround && wantDown && !b.inWater && !this.climbing
    this.crouching = wantCrouch || (this.crouching && !canStandUp)
    if (!b.onGround || b.inWater) this.crouching = false

    // 保持脚底位置不变地改变碰撞盒高度
    const targetH = this.crouching ? PLAYER.crouchH : PLAYER.h
    if (targetH !== b.h) {
      const feet = b.y + b.h
      b.h = targetH
      b.y = feet - targetH
    }

    // ---------- 攀爬 ----------
    if (nearPole && !b.inWater && (wantUp || wantDown || this.climbing)) {
      this.climbing = true
    }
    if (!nearPole || b.inWater) this.climbing = false
    if (this.climbing && b.onGround && wantDown) this.climbing = false

    // ---------- 水平移动 ----------
    const maxSpeed = b.inWater
      ? PLAYER.swimSpeed
      : this.climbing
        ? PLAYER.climb * 0.7
        : this.crouching
          ? PLAYER.crouchWalk
          : PLAYER.walk
    const accel = b.onGround || this.climbing ? PLAYER.accel : PLAYER.airAccel
    if (ix !== 0) {
      b.vx = approach(b.vx, ix * maxSpeed, accel * dt)
      this.facing = ix
    } else if (b.onGround || this.climbing || b.inWater) {
      b.vx = approach(b.vx, 0, PLAYER.friction * dt)
    }

    // ---------- 跳跃缓冲 / coyote ----------
    if (input.wasPressed('jump')) this.jumpBuffer = PLAYER.buffer
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)
    if (b.onGround) this.coyote = PLAYER.coyote
    else this.coyote = Math.max(0, this.coyote - dt)

    const canJump = !b.inWater && !this.crouching && (b.onGround || this.coyote > 0)
    if (this.jumpBuffer > 0 && canJump) {
      b.vy = -PLAYER.jump
      b.onGround = false
      this.coyote = 0
      this.jumpBuffer = 0
      this.climbing = false
      this.squash = 1.18
      this.sfx('jump', { vol: 0.55 })
      this.game.particles.emit('dust', b.x + b.w / 2, b.y, {
        vx: (Math.random() - 0.5) * 60,
        vy: 20,
        life: 0.35,
        size: 0.7,
      })
    }
    // 松开跳跃键 → 短跳
    if (input.wasReleased('jump') && b.vy < -120 && !b.inWater) {
      b.vy *= PLAYER.jumpCut
    }
    // 下落穿过单向平台
    if (wantDown && b.onGround && this.standingOnPlatform()) {
      b.dropThrough = 0.18
      b.y -= 2
      b.onGround = false
    }

    // ---------- 垂直运动 ----------
    if (b.inWater) {
      if (wantUp) b.vy = approach(b.vy, -PLAYER.swimUp, 900 * dt)
      else if (wantDown) b.vy = approach(b.vy, 210, 900 * dt)
      else b.vy = approach(b.vy, 46, 240 * dt)
      b.vy = clamp(b.vy, -PLAYER.swimUp, 260)
      if (input.wasPressed('jump') && this.coyote <= 0) {
        b.vy = -PLAYER.swimUp * 1.1
        this.sfx('swim', { vol: 0.3 })
      }
      if (Math.random() < dt * 4 && b.vy < -30) {
        this.game.particles.emit('bubble', b.x + b.w / 2, b.y + b.h, { vy: -30, life: 0.9 })
      }
    } else if (this.climbing) {
      const dirY = (wantDown ? 1 : 0) - (wantUp ? 1 : 0)
      b.vy = dirY * PLAYER.climb
      if (dirY !== 0 && Math.random() < dt * 6) {
        this.game.particles.emit('dust', b.x + b.w / 2, b.y + (dirY > 0 ? b.h : 0), {
          vx: (Math.random() - 0.5) * 40,
          vy: 10,
          life: 0.3,
          size: 0.6,
        })
      }
      if (input.wasPressed('jump')) {
        b.vy = -PLAYER.jump * 0.86
        b.vx = this.facing * 150
        this.climbing = false
        this.sfx('jump', { vol: 0.5 })
      }
    } else {
      b.vy += PLAYER.gravity * dt
      b.vy = Math.min(b.vy, PLAYER.maxFall)
    }

    const preVy = b.vy
    moveBody(map, b, dt)

    // 落地反馈
    if (b.onGround && !this.wasGround) {
      this.squash = 0.76
      if (preVy > 260) {
        this.sfx('land', { vol: clamp(preVy / 900, 0.3, 1) })
        this.game.shake(clamp(preVy / 2200, 0, 0.35))
        for (let i = 0; i < 7; i++) {
          this.game.particles.emit('dust', b.x + b.w / 2, b.y, {
            vx: (Math.random() - 0.5) * 120,
            vy: -Math.random() * 40,
            life: 0.45,
            size: 0.8,
          })
        }
      }
    }
    this.wasGround = b.onGround

    // 脚步声
    if (b.onGround && Math.abs(b.vx) > 40) {
      this.stepTimer -= dt
      if (this.stepTimer <= 0) {
        this.sfx('step', { vol: 0.28, rate: 0.9 + Math.random() * 0.2 })
        this.stepTimer = 0.3
        this.game.particles.emit('dust', b.x + b.w / 2, b.y, {
          vx: (Math.random() - 0.5) * 40,
          vy: 10,
          life: 0.28,
          size: 0.6,
        })
      }
    } else {
      this.stepTimer = 0
    }

    // 掉出房间底部（理论上不会发生，保险起见）
    if (b.y < -500 || b.y > this.game.room.data.worldH + 400) {
      this.game.die('失足坠落')
      return
    }

    this.updateAnim(dt)
    this.syncMesh(dt)
  }

  mapSolidAt(x, y, w, h) {
    const map = this.map
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

  updateAnim(dt) {
    const b = this.body
    let name = 'idle'
    if (b.inWater) name = 'swim'
    else if (this.climbing) name = 'climb'
    else if (!b.onGround) name = b.vy < 0 ? 'jump' : 'fall'
    else if (this.crouching) name = 'crouch'
    else if (Math.abs(b.vx) > 26) name = 'run'

    this.state = name
    this.setAnim(name)

    const fps = { idle: 2.2, run: 11, swim: 6, climb: 7, jump: 1, fall: 1, crouch: 1, land: 1 }[name] || 4
    this.animT += dt * fps
    this.frame = this.animT
    this.applyFrame()

    // 挤压/拉伸回落
    this.squash += (1 - this.squash) * Math.min(1, dt * 14)
  }

  syncMesh(dt) {
    const b = this.body
    const tex = this.mesh.material.map
    const th = tex && tex.image ? tex.image.height : SPRITE_H
    const scaleY = (th / SPRITE_H) * this.squash
    this.mesh.scale.set(this.facing, scaleY, 1)
    this.mesh.position.x = b.x + b.w / 2
    // 物理坐标 y 向下；场景坐标 y 向上 → 取负。脚底对齐 b.y + b.h
    this.mesh.position.y = -(b.y + b.h) + (th * scaleY) / 2
    this.mesh.rotation.z = this.climbing ? Math.sin(this.animT * 2) * 0.05 : 0
    this.glow.position.x = b.x + b.w / 2
    this.glow.position.y = -(b.y + b.h / 2)
    this.glow.material.opacity = 0.12 + Math.sin(performance.now() * 0.002) * 0.025
  }

  sfx(name, opts) {
    this.game.sfx(name, opts)
  }

  kill(reason) {
    if (this.dead) return
    this.dead = true
    this.game.die(reason)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.glow.geometry.dispose()
    this.glow.material.dispose()
  }
}
