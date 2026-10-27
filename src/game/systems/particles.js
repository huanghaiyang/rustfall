import * as THREE from 'three'
import { getDustTexture, getGlowTexture } from '../render/textures.js'

/**
 * 轻量粒子池：预建固定数量的面片，重复复用，不产生 GC。
 * kind: dust / splash / food / bubble / spark / blood / rain
 */
const KINDS = {
  dust: { tex: 'dust', color: 0x93a8b2, additive: false, opacity: 0.5, size: 12, gravity: 40, drag: 2.4 },
  blood: { tex: 'dust', color: 0x8d3a34, additive: false, opacity: 0.85, size: 14, gravity: 520, drag: 1.4 },
  splash: { tex: 'glow', color: 0x9fd8e6, additive: true, opacity: 0.8, size: 18, gravity: 760, drag: 0.8 },
  food: { tex: 'glow', color: 0x7ad6c2, additive: true, opacity: 0.95, size: 24, gravity: 120, drag: 1.6 },
  bubble: { tex: 'glow', color: 0xa8dfef, additive: true, opacity: 0.5, size: 10, gravity: -70, drag: 1.2 },
  spark: { tex: 'glow', color: 0xe5a33c, additive: true, opacity: 0.9, size: 14, gravity: 0, drag: 0.4 },
  mote: { tex: 'glow', color: 0x9fc0d0, additive: true, opacity: 0.22, size: 6, gravity: -6, drag: 0.12 },
  rain: { tex: 'glow', color: 0xa8cfe0, additive: true, opacity: 0.3, size: 9, gravity: 900, drag: 0.2 },
  explosion: { tex: 'glow', color: 0xffb347, additive: true, opacity: 0.95, size: 28, gravity: 120, drag: 1.1 },
  acid: { tex: 'glow', color: 0x9ac84a, additive: true, opacity: 0.8, size: 12, gravity: 620, drag: 0.9 },
  smoke: { tex: 'dust', color: 0x6a6f66, additive: false, opacity: 0.42, size: 26, gravity: -24, drag: 1.2 },
  scrap: { tex: 'dust', color: 0xb0a48a, additive: false, opacity: 0.9, size: 9, gravity: 720, drag: 0.6 },
  muzzle: { tex: 'glow', color: 0xffe2a0, additive: true, opacity: 0.95, size: 18, gravity: 0, drag: 2.4 },
  ember: { tex: 'glow', color: 0xff8a3c, additive: true, opacity: 0.85, size: 7, gravity: -40, drag: 0.5 },
  toxic: { tex: 'glow', color: 0xc6e05a, additive: true, opacity: 0.55, size: 16, gravity: -30, drag: 0.8 },
  flash: { tex: 'glow', color: 0xffffff, additive: true, opacity: 1, size: 30, gravity: 0, drag: 3 },
}

const POOL_NORMAL = 70
const POOL_ADD = 150

export class Particles {
  constructor(scene) {
    this.scene = scene
    const tex = { dust: getDustTexture(), glow: getGlowTexture() }
    this.tex = tex
    const geo = new THREE.PlaneGeometry(1, 1)
    this.geo = geo
    this.pools = { normal: [], add: [] }

    const build = (count, additive) => {
      const list = []
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: additive ? tex.glow : tex.dust,
          color: 0xffffff,
          transparent: true,
          opacity: 0.8,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: false,
          toneMapped: false,
        })
        const m = new THREE.Mesh(geo, mat)
        m.visible = false
        m.renderOrder = 7
        m.position.z = 3
        scene.add(m)
        list.push({ mesh: m, life: 0, maxLife: 1, vx: 0, vy: 0, kind: 'dust', size: 1, gravity: 0, drag: 1, opacity: 0.8 })
      }
      return list
    }
    this.pools.normal = build(POOL_NORMAL, false)
    this.pools.add = build(POOL_ADD, true)
    this.cursors = { normal: 0, add: 0 }
  }

  _spawn(list, key, kind, x, y, opts, cfg) {
    let p = null
    for (let i = 0; i < list.length; i++) {
      const idx = (this.cursors[key] + i) % list.length
      if (list[idx].life <= 0) {
        p = list[idx]
        this.cursors[key] = (idx + 1) % list.length
        break
      }
    }
    if (!p) return null
    p.kind = kind
    p.life = opts.life ?? 0.6
    p.maxLife = p.life
    p.vx = opts.vx ?? (Math.random() - 0.5) * 40
    p.vy = opts.vy ?? 0
    p.gravity = opts.gravity ?? cfg.gravity
    p.drag = cfg.drag
    p.size = opts.size ?? 1
    p.opacity = opts.opacity ?? cfg.opacity
    const mat = p.mesh.material
    mat.map = this.tex[cfg.tex]
    mat.color.setHex(opts.color ?? cfg.color)
    mat.opacity = p.opacity
    p.mesh.visible = true
    p.mesh.position.set(x, -y, 3)
    p.mesh.rotation.z = opts.rot ?? 0
    p.mesh.scale.setScalar((opts.scale ?? cfg.size) * p.size)
    return p
  }

  emit(kind, x, y, opts = {}) {
    const cfg = KINDS[kind] || KINDS.dust
    const key = cfg.additive ? 'add' : 'normal'
    this._spawn(this.pools[key], key, kind, x, y, opts, cfg)
  }

  /** 批量发射（robot / loot / monsters 都调用这个接口） */
  emitMany(kind, x, y, count = 6, opts = {}) {
    const n = Math.max(1, Math.round(count))
    for (let i = 0; i < n; i++) {
      const spread = opts.spread ?? 1
      this.emit(kind, x + (Math.random() - 0.5) * 26 * spread, y + (Math.random() - 0.5) * 22 * spread, {
        vx: (opts.vx ?? (Math.random() - 0.5) * 180) * spread,
        vy: (opts.vy ?? -Math.random() * 160 - 20) * spread,
        life: (opts.life ?? 0.55) * (0.7 + Math.random() * 0.6),
        size: (opts.size ?? 1) * (0.7 + Math.random() * 0.6),
        color: opts.color,
      })
    }
  }

  update(dt) {
    for (const key of ['normal', 'add']) {
      for (const p of this.pools[key]) {
        if (p.life <= 0) continue
        p.life -= dt
        if (p.life <= 0) {
          p.mesh.visible = false
          continue
        }
        p.vy += p.gravity * dt
        const d = Math.max(0, 1 - p.drag * dt)
        p.vx *= d
        p.vy *= d
        p.mesh.position.x += p.vx * dt
        p.mesh.position.y -= p.vy * dt // 物理 y 向下 → 场景 y 向上
        const k = Math.max(0, p.life / p.maxLife)
        p.mesh.material.opacity = p.opacity * k
        const base = (KINDS[p.kind] || KINDS.dust).size
        p.mesh.scale.setScalar(base * p.size * (0.55 + k * 0.65))
      }
    }
  }

  clear() {
    for (const key of ['normal', 'add']) {
      for (const p of this.pools[key]) {
        p.life = 0
        p.mesh.visible = false
      }
    }
  }

  dispose() {
    this.geo.dispose()
    for (const key of ['normal', 'add']) {
      for (const p of this.pools[key]) {
        p.mesh.material.dispose()
        this.scene.remove(p.mesh)
      }
      this.pools[key].length = 0
    }
  }
}
