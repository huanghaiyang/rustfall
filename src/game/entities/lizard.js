import * as THREE from 'three'
import { LIZARD, TS } from '../config.js'
import { getLizardTextures } from '../render/textures.js'
import { approach, clamp, dist2 } from '../utils.js'

const SEG_N = LIZARD.segments

/**
 * 蜥蜴：头部沿地面巡游 + 程序化脊椎（ribbon）+ 分段腿部。
 * 状态机：patrol → alert → chase → windup → lunge → recover
 */
export class Lizard {
  constructor(game, x, floorTop, dir = 1) {
    this.game = game
    this.r = LIZARD.radius
    this.dir = dir || 1
    this.head = { x: x, y: floorTop - this.r - 2 }
    this.head.vx = 0
    this.state = 'patrol'
    this.stateT = 0
    this.pauseT = 0
    this.lungeCd = 0
    this.growlCd = 1 + Math.random() * 2
    this.jaw = 0
    this.segments = []
    for (let i = 0; i < SEG_N; i++) {
      this.segments.push({ x: x - this.dir * i * LIZARD.segSpacing, y: floorTop - this.r - 2 })
    }
    this.tint = Math.random() < 0.5 ? 0xffffff : 0xd8e6c8
    this.tex = getLizardTextures()
    this.buildMesh()
    this.syncMesh(0)
  }

  buildMesh() {
    this.group = new THREE.Group()
    // 身体 ribbon
    const geo = new THREE.BufferGeometry()
    const verts = new Float32Array(SEG_N * 2 * 3)
    const uvs = new Float32Array(SEG_N * 2 * 2)
    const idx = []
    for (let i = 0; i < SEG_N; i++) {
      uvs[i * 4 + 0] = i / (SEG_N - 1)
      uvs[i * 4 + 1] = 1
      uvs[i * 4 + 2] = i / (SEG_N - 1)
      uvs[i * 4 + 3] = 0
      if (i < SEG_N - 1) {
        const a = i * 2
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex(idx)
    const bodyMat = new THREE.MeshBasicMaterial({
      map: this.tex.body,
      color: this.tint,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.bodyMesh = new THREE.Mesh(geo, bodyMat)
    this.bodyMesh.renderOrder = 3
    this.bodyMesh.position.z = 1.6
    this.bodyMesh.frustumCulled = false
    this.group.add(this.bodyMesh)

    // 头部
    this.headMat = new THREE.MeshBasicMaterial({
      map: this.tex.head,
      color: this.tint,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.headMesh = new THREE.Mesh(new THREE.PlaneGeometry(52, 36), this.headMat)
    this.headMesh.renderOrder = 4
    this.headMesh.position.z = 2
    this.group.add(this.headMesh)

    // 眼睛发光
    this.eyeMat = new THREE.MeshBasicMaterial({
      map: this.tex.eye,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
      toneMapped: false,
    })
    this.eyes = []
    for (let i = 0; i < 2; i++) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), this.eyeMat)
      e.position.z = 2.2
      e.renderOrder = 5
      this.group.add(e)
      this.eyes.push(e)
    }

    // 腿
    this.legMat = new THREE.MeshBasicMaterial({
      map: this.tex.claw,
      color: 0x9aa37a,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.legs = []
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), this.legMat)
      l.position.z = 1.5
      l.renderOrder = 3
      this.group.add(l)
      this.legs.push(l)
    }
  }

  get map() {
    return this.game.room.map
  }

  update(dt) {
    this.stateT += dt
    this.lungeCd = Math.max(0, this.lungeCd - dt)
    this.growlCd = Math.max(0, this.growlCd - dt)
    const player = this.game.player
    const b = player.body
    const head = this.head
    const map = this.map

    const pdx = b.x + b.w / 2 - head.x
    const pdy = b.y + b.h / 2 - head.y
    const pdist = Math.hypot(pdx, pdy)

    // ---------- 感知 ----------
    const senseRange = player.crouching ? LIZARD.senseCrouch + 40 : LIZARD.sense
    const canSee =
      pdist < senseRange && !player.dead && this.hasLineOfSight(head.x, head.y, b.x + b.w / 2, b.y + b.h / 2)
    const veryClose = pdist < 90 && Math.abs(pdy) < 70

    if (this.state === 'patrol' && (canSee || veryClose)) {
      this.state = 'alert'
      this.stateT = 0
      this.dir = pdx >= 0 ? 1 : -1
      if (this.growlCd <= 0) {
        this.game.sfx('growl', { vol: 0.42, pan: clamp(pdx / 700, -1, 1) })
        this.growlCd = 3
      }
    }

    let targetSpeed = 0
    let desiredDir = this.dir

    switch (this.state) {
      case 'patrol': {
        if (this.pauseT > 0) {
          this.pauseT -= dt
          targetSpeed = 0
        } else {
          targetSpeed = LIZARD.patrolSpeed
          if (Math.random() < dt * 0.12) this.pauseT = 0.6 + Math.random() * 1.4
          if (Math.random() < dt * 0.06) this.dir *= -1
        }
        break
      }
      case 'alert': {
        targetSpeed = 0
        desiredDir = pdx >= 0 ? 1 : -1
        if (this.stateT > 0.45) {
          this.state = 'chase'
          this.stateT = 0
        }
        break
      }
      case 'chase': {
        desiredDir = pdx >= 0 ? 1 : -1
        targetSpeed = LIZARD.chaseSpeed
        if (pdist < LIZARD.lungeRange && Math.abs(pdy) < 60 && this.lungeCd <= 0) {
          this.state = 'windup'
          this.stateT = 0
          this.game.sfx('growl', { vol: 0.65, rate: 0.8, pan: clamp(pdx / 600, -1, 1) })
        }
        if ((canSee === false && pdist > senseRange * 1.35) || player.dead) {
          this.state = 'patrol'
          this.stateT = 0
        }
        break
      }
      case 'windup': {
        targetSpeed = 0
        desiredDir = pdx >= 0 ? 1 : -1
        this.jaw = Math.min(1, this.jaw + dt * 5)
        if (this.stateT > LIZARD.lungeWindup) {
          this.state = 'lunge'
          this.stateT = 0
          this.lungeDir = desiredDir
          this.lungeCd = 2.2
          this.game.sfx('hurt', { vol: 0.18, rate: 1.7 })
        }
        break
      }
      case 'lunge': {
        targetSpeed = LIZARD.lungeSpeed
        desiredDir = this.lungeDir
        if (this.stateT > LIZARD.lungeTime) {
          this.state = 'recover'
          this.stateT = 0
          this.jaw = 0
        }
        break
      }
      case 'recover': {
        targetSpeed = 0
        this.jaw = Math.max(0, this.jaw - dt * 3)
        if (this.stateT > LIZARD.recover) {
          this.state = 'chase'
          this.stateT = 0
        }
        break
      }
    }

    if (this.state !== 'windup' && this.state !== 'lunge') {
      this.jaw = Math.max(0, this.jaw - dt * 2)
    }
    if (this.state !== 'chase' && this.state !== 'alert' && this.state !== 'windup' && this.state !== 'lunge') {
      desiredDir = this.dir
    } else {
      this.dir = desiredDir
    }

    // ---------- 头部移动：贴地行走 ----------
    const speed = targetSpeed
    head.vx = approach(head.vx, this.dir * speed, 900 * dt)
    const nextX = head.x + head.vx * dt
    const groundTop = this.groundAhead(nextX, head.y)
    let blocked = false
    if (groundTop == null) {
      blocked = true // 前方无地面
    } else {
      const targetY = groundTop - this.r - 1
      if (targetY < head.y - 26) blocked = true // 前方是墙/太高
      else {
        head.y = approach(head.y, targetY, 420 * dt)
        head.x = nextX
      }
    }
    if (blocked) {
      head.vx = 0
      if (this.state === 'patrol') {
        this.dir *= -1
      } else if (this.state === 'chase' || this.state === 'alert') {
        // 卡住时稍等，避免抖动
        this.stateT += dt * 0.4
      }
      head.x += -this.dir * Math.max(0.4, 20 * dt) // 稍微退开
    }

    // 撞到比头部更高的墙：转向
    const wallX = head.x + this.dir * (this.r + 6)
    if (this.map.solidAt(wallX, head.y - this.r * 0.2)) {
      head.vx = 0
      if (this.state === 'patrol') this.dir *= -1
    }

    this.updateSpine(dt)
    this.checkContact()
    this.syncMesh(dt)
  }

  groundAhead(px, py) {
    return this.map.groundBelow(px, py - 34, 8 * TS)
  }

  hasLineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy)
    const steps = Math.max(2, Math.floor(len / 22))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.map.solidAt(x0 + dx * t, y0 + dy * t)) return false
    }
    return true
  }

  updateSpine(dt) {
    const pts = this.segments
    pts[0].x = this.head.x
    pts[0].y = this.head.y
    const spacing = LIZARD.segSpacing
    const solve = () => {
      for (let i = 1; i < SEG_N; i++) {
        const p = pts[i - 1]
        const s = pts[i]
        let dx = s.x - p.x
        let dy = s.y - p.y
        let d = Math.hypot(dx, dy) || 0.0001
        if (d > spacing) {
          s.x = p.x + (dx / d) * spacing
          s.y = p.y + (dy / d) * spacing
        }
      }
    }
    solve()
    // 重力下垂 + 贴地
    for (let i = 1; i < SEG_N; i++) {
      const s = pts[i]
      s.y += 340 * dt
      const gy = this.map.groundBelow(s.x, s.y - 10, 6 * TS)
      const rI = this.r * (1 - (i / SEG_N) * 0.6)
      if (gy != null) {
        const rest = gy - rI
        if (s.y > rest) s.y = rest
      }
    }
    // 平滑两遍，避免脊柱急折导致 ribbon 自交/翻面
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < SEG_N - 1; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        const c = pts[i + 1]
        b.x += ((a.x + c.x) * 0.5 - b.x) * 0.4
        b.y += ((a.y + c.y) * 0.5 - b.y) * 0.4
      }
      solve()
    }
  }

  checkContact() {
    const p = this.game.player
    if (p.dead || p.invuln > 0) return
    const b = p.body
    const head = this.head
    if (this.state !== 'lunge') return
    const d2 = dist2(head.x, head.y, b.x + b.w / 2, b.y + b.h / 2)
    if (d2 < 26 * 26) {
      p.kill('被绿蜥蜴咬住')
    }
  }

  syncMesh(dt) {
    const pts = this.segments
    const pos = this.bodyMesh.geometry.attributes.position
    const arr = pos.array
    for (let i = 0; i < SEG_N; i++) {
      const p = pts[i]
      const prev = pts[Math.max(0, i - 1)]
      const next = pts[Math.min(SEG_N - 1, i + 1)]
      let tx = next.x - prev.x
      let ty = next.y - prev.y
      const len = Math.hypot(tx, ty) || 1
      tx /= len
      ty /= len
      const nx = -ty
      const ny = tx
      const wI = this.r * (1 - (i / SEG_N) * 0.78)
      // 物理 y 向下 → 场景 y 向上
      arr[i * 6 + 0] = p.x + nx * wI
      arr[i * 6 + 1] = -(p.y + ny * wI)
      arr[i * 6 + 2] = 0
      arr[i * 6 + 3] = p.x - nx * wI
      arr[i * 6 + 4] = -(p.y - ny * wI)
      arr[i * 6 + 5] = 0
    }
    pos.needsUpdate = true
    this.bodyMesh.geometry.computeBoundingSphere()

    const head = this.head
    const d = pts[0].x - pts[1].x
    const dy = pts[0].y - pts[1].y
    const angle = Math.atan2(-dy, d) // 场景 y 向上
    const faceX = Math.cos(angle) >= 0 ? 1 : -1
    this.headMesh.position.x = head.x + faceX * 5
    this.headMesh.position.y = -head.y + 2
    if (Math.cos(angle) < 0) {
      this.headMesh.rotation.z = angle + Math.PI
      this.headMesh.scale.y = -1
    } else {
      this.headMesh.rotation.z = angle
      this.headMesh.scale.y = 1
    }
    const open = this.jaw > 0.5
    const wantTex = open ? this.tex.headOpen : this.tex.head
    if (this.headMat.map !== wantTex) {
      this.headMat.map = wantTex
      this.headMat.needsUpdate = true
    }
    const fx = Math.cos(angle)
    const eyeX = head.x + fx * 9
    const eyeY = -head.y + 4
    this.eyes[0].position.set(eyeX, eyeY + 4, 2.2)
    this.eyes[1].position.set(eyeX + (fx < 0 ? 9 : -9), eyeY - 2, 2.2)
    const glow = this.state === 'windup' || this.state === 'lunge' ? 1 : 0.55
    this.eyeMat.opacity = glow

    // 腿：沿身体交替摆动
    const walkPhase = performance.now() * 0.012 * (this.state === 'lunge' ? 2.2 : 1)
    for (let i = 0; i < this.legs.length; i++) {
      const seg = pts[Math.min(SEG_N - 1, 2 + i * 2)]
      const leg = this.legs[i]
      const side = i % 2 === 0 ? 1 : -1
      const swing = Math.sin(walkPhase + i * 1.7) * (this.head.vx !== 0 ? 5 : 1.5)
      leg.position.set(seg.x + side * 4, -(seg.y - this.r * 0.75 + swing), 1.5)
      leg.rotation.z = Math.sin(walkPhase + i) * 0.35
    }

    this.group.position.z = 0
  }

  dispose() {
    this.bodyMesh.geometry.dispose()
    this.bodyMesh.material.dispose()
    this.headMesh.geometry.dispose()
    this.headMat.dispose()
    this.eyeMat.dispose()
    this.legMat.dispose()
    this.eyes.forEach((e) => e.geometry.dispose())
    this.legs.forEach((l) => l.geometry.dispose())
  }
}
