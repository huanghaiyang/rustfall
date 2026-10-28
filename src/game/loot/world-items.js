import * as THREE from 'three'
import { spriteMaterial } from '../render/materials.js'
import { TS, LOOT_PICKUP_RANGE } from '../config.js'
import { makeBody, moveBody } from '../world/tilemap.js'
import { Content, KIND } from '../core/registry.js'
import { Events, EV } from '../core/events.js'
import { getItemArt } from '../render/art/items.js'
import { getWeaponArt } from '../render/art/weapons.js'
import { getGlowArt } from '../render/art/atmosphere.js'
import { dist2 } from '../utils.js'
import { G } from '../state.js'

const RARITY_GLOW = { 1: 0x8a8a72, 2: 0xa9b6bc, 3: 0x8fe8ff, 4: 0xf2b34a, 5: 0xff5644 }

/** 地上的战利品实体 */
export class LootDrop {
  constructor(game, itemId, x, y, opts = {}) {
    this.game = game
    this.itemId = itemId
    this.def = Content.get(KIND.ITEM, itemId)
    this.rarity = this.def?.rarity || 1
    this.x = x
    this.y = y
    this.hidden = !!opts.hidden
    this.buried = !!opts.buried
    this.questItem = !!opts.questItem
    this.flagKey = opts.flagKey || null
    this.picked = false
    this.bob = Math.random() * Math.PI * 2
    this.t = 0
    this.magnet = false
    this.body = makeBody(x - 8, y - 16, 16, 16)
    this.body.vx = opts.vx || 0
    this.body.vy = opts.vy || 0

    this.group = new THREE.Group()
    this.group.position.z = 3
    let tex = null
    try {
      const wdef = Content.get(KIND.ITEM, itemId)
      tex = wdef && (wdef.category === 'weapon' || wdef.slot === 'weapon') ? getWeaponArt(itemId) : getItemArt(itemId)
    } catch (e) {
      tex = null
    }
    const mat = spriteMaterial(tex, { color: this.hidden || this.buried ? 0x40382c : 0xffffff })
    this.mat = mat
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), mat)
    this.group.add(this.mesh)

    const glowColor = RARITY_GLOW[this.rarity] || 0x8a8a72
    const glowMat = new THREE.MeshBasicMaterial({
      map: getGlowArt(),
      color: glowColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    this.glowMat = glowMat
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), glowMat)
    this.glow.position.z = -0.1
    this.group.add(this.glow)

    if (this.questItem) {
      // 任务物品加一圈脉冲环
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf2b34a,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      this.ringMat = ringMat
      this.ring = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), ringMat)
      this.ring.position.z = -0.2
      this.group.add(this.ring)
    }

    this.setVisibleState()
  }

  setVisibleState() {
    if (this.buried) {
      this.group.visible = false
      return
    }
    this.group.visible = true
    this.mat.color.setHex(this.hidden ? 0x40382c : 0xffffff)
    this.mat.opacity = this.hidden ? 0.45 : 1
    this.glowMat.opacity = this.hidden ? 0.05 : 0.12 + this.rarity * 0.05
  }

  reveal() {
    if (!this.hidden) return
    this.hidden = false
    this.setVisibleState()
    this.game.sfx?.('pickup', { vol: 0.35, rate: 1.4 })
  }

  unbury() {
    if (!this.buried) return
    this.buried = false
    this.hidden = false
    this.setVisibleState()
    this.game.sfx?.('dig', { vol: 0.5 })
    this.game.particles?.emitMany?.('dust', this.x, this.y, 8)
  }

  update(dt) {
    this.t += dt
    if (this.picked || this.buried) return
    const p = this.game.player
    if (!p || p.dead) return

    // 磁吸 / 拾取
    const d2 = dist2(this.x, this.y, p.centerX, p.centerY)
    if (!this.hidden && d2 < 120 * 120) {
      const d = Math.sqrt(d2) || 1
      const pull = Math.min(1, dt * (d < 60 ? 9 : 3))
      this.x += ((p.centerX - this.x) / d) * 180 * pull * dt
      this.y += ((p.centerY - this.y) / d) * 180 * pull * dt
      this.magnet = true
    }
    if (!this.hidden && d2 < LOOT_PICKUP_RANGE * LOOT_PICKUP_RANGE) {
      this.tryPickup()
      return
    }

    // 物理（未磁吸时）
    if (!this.magnet) {
      this.body.vy = Math.min(this.body.vy + 1600 * dt, 900)
      this.body.vx *= 1 - Math.min(1, dt * 3)
      moveBody(this.game.room.map, this.body, dt)
      this.x = this.body.x + 8
      this.y = this.body.y + 16
    }
    this.bob += dt * 3
    this.group.position.set(this.x, -this.y + Math.sin(this.bob) * 2.5, 3)
    if (this.glowMat) this.glowMat.opacity = (this.hidden ? 0.04 : 0.12 + this.rarity * 0.05) + Math.sin(this.bob * 1.4) * 0.04
    if (this.ring) {
      this.ring.rotation.z += dt * 1.6
      this.ringMat.opacity = 0.3 + Math.sin(this.t * 4) * 0.25
    }
  }

  tryPickup() {
    const inv = this.game.inventory
    if (!inv) return
    if (!inv.canAdd(this.itemId, 1)) {
      if (!this.warned) {
        this.warned = true
        this.game.toast?.('背包满了，或者太重了', 'warn')
        this.game.sfx?.('uiClick', { vol: 0.4, rate: 0.7 })
      }
      return
    }
    const added = inv.add(this.itemId, 1)
    if (added > 0) {
      this.picked = true
      this.group.visible = false
      if (this.flagKey) G.flags[this.flagKey] = true
      // 收藏品 / 遗物：全局唯一，捡过之后任何房间都不再生成
      if (this.def?.unique || this.def?.category === 'artifact') G.flags[`got:${this.itemId}`] = true
      this.game.onLootPicked?.(this.itemId, this.def)
      this.game.particles?.emitMany?.('spark', this.x, this.y, 5)
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
    })
    this.mat.dispose()
    this.glowMat.dispose()
    this.ringMat?.dispose()
  }
}


