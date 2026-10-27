import * as THREE from 'three'
import { getFruitTextures, getBatflyTextures } from '../render/textures.js'
import { dist2, clamp } from '../utils.js'

/** 发光果实：碰到即进食 */
export class Fruit {
  constructor(game, x, groundY) {
    this.game = game
    this.x = x
    this.y = groundY
    this.eaten = false
    this.phase = Math.random() * Math.PI * 2
    this.tex = getFruitTextures()

    const mat = new THREE.MeshBasicMaterial({
      map: this.tex[0],
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), mat)
    this.mesh.position.z = 1.8
    this.mesh.renderOrder = 4

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x6fe3d0,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), glowMat)
    this.glow.position.z = 1.7
    this.glow.renderOrder = 3

    this.group = new THREE.Group()
    this.group.add(this.glow)
    this.group.add(this.mesh)
    // 物理 y 向下 → 场景 y 向上；果实中心在离地 9px 处
    this.wy = groundY - 9
    this.group.position.set(x, -this.wy, 0)
  }

  update(dt, t) {
    if (this.eaten) return
    const bob = Math.sin(t * 2 + this.phase) * 2
    this.mesh.position.y = bob
    this.glow.position.y = bob
    this.glow.material.opacity = 0.16 + Math.sin(t * 2.4 + this.phase) * 0.07
    const frames = this.tex
    const f = Math.floor((t * 3 + this.phase) % frames.length)
    if (this.mesh.material.map !== frames[f]) {
      this.mesh.material.map = frames[f]
      this.mesh.material.needsUpdate = true
    }
    const p = this.game.player
    if (p.dead) return
    const d2 = dist2(p.centerX, p.centerY, this.x, this.wy)
    if (d2 < 28 * 28) this.eat()
  }

  eat() {
    if (this.eaten) return
    this.eaten = true
    this.group.visible = false
    this.game.addFood(1, this.x, this.wy)
  }

  reset() {
    this.eaten = false
    this.group.visible = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.glow.geometry.dispose()
    this.glow.material.dispose()
  }
}

/** 蝠虫：会在空中游荡，靠近时逃走 */
export class Batfly {
  constructor(game, x, y) {
    this.game = game
    this.home = { x, y }
    this.x = x
    this.y = y
    this.vx = 0
    this.vy = 0
    this.caught = false
    this.respawn = 0
    this.t = Math.random() * 10
    this.tex = getBatflyTextures()

    const mat = new THREE.MeshBasicMaterial({
      map: this.tex[0],
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), mat)
    this.mesh.renderOrder = 4
    this.group = new THREE.Group()
    this.group.add(this.mesh)
    this.group.position.set(x, -y, 2)
  }

  update(dt) {
    this.t += dt
    if (this.caught) {
      this.respawn -= dt
      if (this.respawn <= 0) {
        this.caught = false
        this.group.visible = true
        this.x = this.home.x
        this.y = this.home.y
      }
      return
    }
    const p = this.game.player
    const dx = this.x - p.centerX
    const dy = this.y - p.centerY
    const d = Math.hypot(dx, dy) || 1
    let ax = 0
    let ay = 0
    if (d < 150) {
      ax += (dx / d) * 620
      ay += (dy / d) * 620
    }
    // 围绕巢穴游荡
    const tx = this.home.x + Math.sin(this.t * 0.7) * 60
    const ty = this.home.y + Math.sin(this.t * 1.13 + 1.7) * 40
    ax += (tx - this.x) * 2.2
    ay += (ty - this.y) * 2.2
    this.vx = clamp((this.vx + ax * dt) * (1 - dt * 2.2), -220, 220)
    this.vy = clamp((this.vy + ay * dt) * (1 - dt * 2.2), -220, 220)
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.group.position.set(this.x, -this.y, 2)
    this.mesh.scale.x = this.vx < 0 ? -1 : 1

    const frames = this.tex
    const f = Math.floor(this.t * 14) % frames.length
    if (this.mesh.material.map !== frames[f]) {
      this.mesh.material.map = frames[f]
      this.mesh.material.needsUpdate = true
    }

    if (!p.dead && dist2(this.x, this.y, p.centerX, p.centerY) < 20 * 20) {
      this.caught = true
      this.group.visible = false
      this.respawn = 7 + Math.random() * 5
      this.game.addFood(1, this.x, this.y)
    }
  }

  reset() {
    this.caught = false
    this.group.visible = true
    this.respawn = 0
    this.x = this.home.x
    this.y = this.home.y
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
