import * as THREE from 'three'
import { fixSpriteMesh } from '../render/materials.js'
import { TS } from '../config.js'
import { T } from './tilemap.js'
import { hash2 } from '../render/rng.js'
import { getBiomeArt, getSkyArt, getStarField } from '../render/art/world.js'
import { getPropArt } from '../render/art/props.js'
import { getWeatherArt } from '../render/art/atmosphere.js'
import { getPortrait } from '../render/art/portraits.js'
import { getToxicPoolArt } from '../render/art/atmosphere.js'
import {
  getTileTextures,
  getShelterTexture,
  getDoorTexture,
  getGlowTexture,
  getWaterTexture,
} from '../render/textures.js'
import { LootDrop } from '../loot/world-items.js'
import { Content, KIND } from '../core/registry.js'
import { G } from '../state.js'
import { PROPS, getProp } from './props-data.js'

const Z = {
  sky: -170,
  far: -150,
  mid: -120,
  near: -90,
  backProps: -30,
  tiles: 0,
  water: 1.2,
  props: 2,
  actors: 3,
  front: 9,
  fx: 12,
}

/** 一间废土房间：地形、生态背景、道具、战利品、牢笼、地标、同伴 */
export class Room {
  constructor(game, data) {
    this.game = game
    this.data = data
    this.map = data.map
    this.group = new THREE.Group()
    this.lootDrops = []
    this.interactables = []
    this.cages = []
    this.landmarks = []
    this.npcHolograms = []
    this.time = 0
    this._rebuildQueued = false
    this._rebuildT = 0

    this.bg = this.buildBackground()
    this.buildTiles()
    this.buildDoors()
    this.buildProps()
    this.buildLandmarks()
    this.buildCages()
    this.buildLoot()
    this.buildNpcs()
    this.buildSmoke()
    this.buildShelter()
    this.group.position.z = 0
    this.fixRoomSprites()
    this.game.scene.add(this.group)
  }

  /** 房间里所有普通精灵统一硬边（光晕/加色层跳过） */
  fixRoomSprites() {
    this.group.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.map) return
      if (o.material.blending === THREE.AdditiveBlending) return
      fixSpriteMesh(o)
    })
  }

  // ---------------------------------------------------------------- 背景
  floorBase() {
    const f = this.data.floorY
    if (typeof f === 'number') return f
    if (Array.isArray(f)) {
      const nums = f.filter((n) => typeof n === 'number')
      if (nums.length) return nums.sort((a, b) => a - b)[Math.floor(nums.length / 2)]
    }
    if (f && typeof f === 'object') {
      const nums = Object.values(f).filter((n) => typeof n === 'number')
      if (nums.length) return nums.sort((a, b) => a - b)[Math.floor(nums.length / 2)]
    }
    return Math.floor(this.data.h * 0.75)
  }

  buildBackground() {
    let art = null
    try {
      art = getBiomeArt(this.data.biome)
    } catch (e) {
      art = null
    }
    this.biomeArt = art
    const group = new THREE.Group()
    this.game.scene.add(group)
    const layers = []
    const baseY = this.floorBase() * TS + 40
    this.bgBaseY = baseY

    // 天空：跟随相机的渐变底
    if (art?.sky) {
      const tex = art.sky
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7600, 4200), mat)
      mesh.position.set(this.game.roomW ? this.game.roomW / 2 : 0, -(baseY - 1200), Z.sky)
      group.add(mesh)
      layers.push({ mesh, p: 0.99, mat, sky: true, yOff: 0 })
    }

    const texW = 1280
    const texH = 560
    const roomW = this.data.worldW || 2000
    const tilesX = Math.max(3, Math.ceil((roomW + 4200) / texW))
    const addLandscape = (tex, p, tint, opacity, yOff) => {
      if (!tex) return null
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.repeat.set(tilesX, 1)
      tex.offset.set(0, 0)
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        color: tint,
        depthWrite: false,
        toneMapped: false,
      })
      const w = texW * tilesX
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, texH), mat)
      mesh.position.set(0, -(baseY + (yOff || 0)) + texH / 2, Z.far)
      group.add(mesh)
      const entry = { mesh, p, mat, texW, texH, yOff: yOff || 0, tilesX }
      layers.push(entry)
      return entry
    }

    addLandscape(art?.far, 0.88, 0xd9c9a8, 0.95, 0)
    addLandscape(art?.mid, 0.7, 0xfff0d8, 0.98, 0)
    addLandscape(art?.near, 0.48, 0x6a5c4a, 0.98, 0)

    this.bgLayers = layers
    this.buildSkyLayers(group)
    return group
  }

  /** 日夜天空：渐变底 + 星野 + 三层云 + 天气幕 */
  buildSkyLayers(group) {
    const phase = G.dayNight?.phase || 'morning'
    let skyArt = null
    try {
      skyArt = getSkyArt(phase)
    } catch (e) {
      skyArt = null
    }
    this.skyArt = skyArt
    this.skyPhase = phase
    this.cloudOffset = [0, 0, 0]
    this.weatherId = G.dayNight?.weather || 'clear'

    // 天空底
    const skyTex = skyArt?.sky || this.biomeArt?.sky || null
    if (skyTex) {
      skyTex.wrapS = THREE.ClampToEdgeWrapping
      skyTex.wrapT = THREE.ClampToEdgeWrapping
      const mat = new THREE.MeshBasicMaterial({ map: skyTex, depthWrite: false, toneMapped: false, transparent: true })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7600, 4200), mat)
      mesh.position.set(0, -(this.bgBaseY - 1200), Z.sky - 2)
      group.add(mesh)
      this.skyMesh = mesh
      this.skyMat = mat
    }

    // 星野（仅夜晚）
    let stars = null
    try {
      stars = getStarField()
    } catch (e) {
      stars = null
    }
    if (stars) {
      stars.wrapS = THREE.RepeatWrapping
      stars.wrapT = THREE.RepeatWrapping
      stars.repeat.set(3, 2)
      const mat = new THREE.MeshBasicMaterial({
        map: stars,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5200, 3000), mat)
      mesh.position.set(0, -(this.bgBaseY - 1300), Z.sky + 1)
      group.add(mesh)
      this.starMesh = mesh
      this.starMat = mat
    }

    // 云层
    this.cloudLayers = []
    const cloudMeta = skyArt?.cloudMeta || []
    const cloudTex = skyArt?.cloudLayers || []
    for (let i = 0; i < Math.min(3, cloudTex.length); i++) {
      const tex = cloudTex[i]
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      const meta = cloudMeta[i] || { y: -900, h: 200, speed: 1, alpha: 0.6 }
      tex.repeat.set(4, 1)
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: meta.alpha ?? 0.6,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6400, meta.h || 200), mat)
      mesh.position.set(0, -(this.bgBaseY - (meta.y || 0) - 300), Z.sky + 2 + i)
      group.add(mesh)
      this.cloudLayers.push({ mesh, mat, tex, speed: meta.speed || 1, base: meta.alpha ?? 0.6 })
    }

    // 天气幕（跟随相机）
    const wx = this.safeWeatherArt(this.weatherId)
    if (wx?.overlay) {
      wx.overlay.wrapS = THREE.RepeatWrapping
      wx.overlay.wrapT = THREE.ClampToEdgeWrapping
      wx.overlay.repeat.set(3, 1)
      const mat = new THREE.MeshBasicMaterial({
        map: wx.overlay,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5200, 2600), mat)
      mesh.position.z = Z.front + 6
      this.game.scene.add(mesh)
      this.overlayMesh = mesh
      this.overlayMat = mat
    }
  }

  safeWeatherArt(id) {
    try {
      return getWeatherArt(id)
    } catch (e) {
      return null
    }
  }

  /** 切换日夜阶段 */
  setSkyPhase(phase) {
    if (phase === this.skyPhase) return
    this.skyPhase = phase
    let art = null
    try {
      art = getSkyArt(phase)
    } catch (e) {
      art = null
    }
    if (!art) return
    this.skyArt = art
    if (this.skyMesh && art.sky) {
      this.skyMat.map = art.sky
      this.skyMat.needsUpdate = true
    }
    if (this.starMat) {
      this.starMat.opacity = phase === 'night' ? 0.85 : phase === 'dusk' || phase === 'dawn' ? 0.25 : 0
    }
    const layers = art.cloudLayers || []
    for (let i = 0; i < this.cloudLayers.length; i++) {
      const cl = this.cloudLayers[i]
      if (layers[i]) {
        cl.tex = layers[i]
        cl.mat.map = layers[i]
        cl.mat.needsUpdate = true
      }
    }
  }

  /** 切换天气幕 */
  setWeatherOverlay(id) {
    if (id === this.weatherId) return
    this.weatherId = id
    const wx = this.safeWeatherArt(id)
    if (!wx?.overlay || !this.overlayMat) return
    wx.overlay.wrapS = THREE.RepeatWrapping
    wx.overlay.wrapT = THREE.ClampToEdgeWrapping
    wx.overlay.repeat.set(3, 1)
    this.overlayMat.map = wx.overlay
    this.overlayMat.color.setRGB(wx.tint?.[0] ?? 1, wx.tint?.[1] ?? 1, wx.tint?.[2] ?? 1)
    this.overlayMat.needsUpdate = true
  }

  applyDayNight(params) {
    if (!params) return
    this.setSkyPhase(params.phase?.id)
    this.setWeatherOverlay(params.weather?.id)
    if (this.overlayMat) {
      const d = params.weather?.density ?? params.fog ?? 0
      this.overlayMat.opacity = Math.min(0.62, 0.06 + d * 0.55)
    }
    if (this.cloudLayers) {
      for (const cl of this.cloudLayers) cl.mat.opacity = cl.base * (0.55 + (params.amb ?? 1) * 0.45)
    }
    if (this.starMat && params.phase?.id !== 'night' && params.phase?.id !== 'dusk' && params.phase?.id !== 'dawn') {
      this.starMat.opacity = 0
    }
  }

  updateBackground(camera) {
    const cx = camera.position.x
    const cy = camera.position.y
    for (const l of this.bgLayers) {
      if (l.sky) {
        l.mesh.position.x = cx
        l.mesh.position.y = cy - 220
        continue
      }
      l.mesh.position.x = cx * l.p
      l.mesh.position.z = Z.far + (1 - l.p) * 40
      l.mesh.position.y = -(this.bgBaseY + l.yOff) + l.texH / 2 - (cy + this.bgBaseY) * 0.04
    }
  }

  // ---------------------------------------------------------------- 地形
  get groundTex() {
    return this.biomeArt?.ground || getTileTextures().fill[0]
  }
  get groundTopTex() {
    return this.biomeArt?.groundTop || getTileTextures().top[0]
  }

  buildTiles() {
    this.tileGroup = new THREE.Group()
    this.group.add(this.tileGroup)
    this.rebuildTiles()
  }

  rebuildTiles() {
    if (this.tileGroup) {
      for (const m of [...this.tileGroup.children]) {
        this.tileGroup.remove(m)
        if (m.geometry) m.geometry.dispose()
        if (m.material) m.material.dispose()
        if (m.dispose) m.dispose()
      }
    }
    const d = this.data
    const map = this.map
    const buckets = {
      solid: [],
      top: [],
      cracked: [],
      soil: [],
      plat: [],
      pole: [],
      water: [],
      toxic: [],
    }
    for (let ty = 0; ty < d.h; ty++) {
      for (let tx = 0; tx < d.w; tx++) {
        const v = map.get(tx, ty)
        if (v === T.SOLID) {
          const above = map.get(tx, ty - 1)
          const exposed =
            above !== T.SOLID && above !== T.PLATFORM && above !== T.CRACKED && above !== T.SOIL
          ;(exposed ? buckets.top : buckets.solid).push({ tx, ty })
        } else if (v === T.CRACKED) buckets.cracked.push({ tx, ty })
        else if (v === T.SOIL) buckets.soil.push({ tx, ty })
        else if (v === T.PLATFORM) buckets.plat.push({ tx, ty })
        else if (v === T.POLE) buckets.pole.push({ tx, ty })
        else if (v === T.WATER) buckets.water.push({ tx, ty })
        else if (v === T.TOXIC) buckets.toxic.push({ tx, ty })
      }
    }

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const floorBase = this.floorBase()
    const instFor = (list, geo, mat, colorFn) => {
      if (!list.length) return
      const mesh = new THREE.InstancedMesh(geo, mat, list.length)
      for (let i = 0; i < list.length; i++) {
        const { tx, ty } = list[i]
        dummy.position.set(tx * TS + TS / 2, -(ty * TS + TS / 2), 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        const h = hash2(tx, ty, 11)
        const deep = ty > floorBase + 2
        color.setScalar(colorFn(h, deep))
        mesh.setColorAt(i, color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.frustumCulled = false
      this.tileGroup.add(mesh)
    }

    const tileGeo = new THREE.PlaneGeometry(TS, TS)
    this.tileGeo = tileGeo
    const groundMat = new THREE.MeshBasicMaterial({ map: this.groundTex, toneMapped: false })
    const topMat = new THREE.MeshBasicMaterial({ map: this.groundTopTex, toneMapped: false })
    this.groundMat = groundMat
    this.topMat = topMat
    instFor(buckets.solid, tileGeo, groundMat, (h, deep) => (deep ? 0.17 + h * 0.12 : 0.6 + h * 0.24))
    instFor(buckets.top, tileGeo, topMat, (h) => 0.82 + h * 0.3)

    if (buckets.cracked.length) {
      const mat = new THREE.MeshBasicMaterial({ map: this.groundTex, color: 0x9a8068, toneMapped: false })
      instFor(buckets.cracked, tileGeo, mat, (h) => 0.55 + h * 0.4)
      this.crackedMat = mat
    }
    if (buckets.soil.length) {
      const mat = new THREE.MeshBasicMaterial({ map: this.groundTopTex, color: 0xa07a4a, toneMapped: false })
      instFor(buckets.soil, tileGeo, mat, (h) => 0.6 + h * 0.3)
      this.soilMat = mat
    }

    if (buckets.plat.length) {
      const platGeo = new THREE.PlaneGeometry(TS, 12)
      const platMat = new THREE.MeshBasicMaterial({ map: this.groundTex, color: 0x8c8a80, toneMapped: false })
      const mesh = new THREE.InstancedMesh(platGeo, platMat, buckets.plat.length)
      for (let i = 0; i < buckets.plat.length; i++) {
        const { tx, ty } = buckets.plat[i]
        dummy.position.set(tx * TS + TS / 2, -(ty * TS) - 6, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = false
      this.tileGroup.add(mesh)
      this.platGeo = platGeo
      this.platMat = platMat
    }

    if (buckets.pole.length) {
      const poleGeo = new THREE.PlaneGeometry(10, TS)
      const poleMat = new THREE.MeshBasicMaterial({ color: 0x6f828c, toneMapped: false })
      const mesh = new THREE.InstancedMesh(poleGeo, poleMat, buckets.pole.length)
      for (let i = 0; i < buckets.pole.length; i++) {
        const { tx, ty } = buckets.pole[i]
        dummy.position.set(tx * TS + TS / 2, -(ty * TS + TS / 2), 1.1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = false
      this.tileGroup.add(mesh)
    }

    if (buckets.water.length) {
      let wtex = null
      try {
        wtex = getWaterTexture()
      } catch (e) {
        wtex = null
      }
      const wmat = new THREE.MeshBasicMaterial({
        map: wtex,
        color: 0x5a8a8a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        toneMapped: false,
      })
      this.waterMat = wmat
      this.waterTex = wtex
      const wgeo = new THREE.PlaneGeometry(TS, TS)
      const mesh = new THREE.InstancedMesh(wgeo, wmat, buckets.water.length)
      for (let i = 0; i < buckets.water.length; i++) {
        const { tx, ty } = buckets.water[i]
        dummy.position.set(tx * TS + TS / 2, -(ty * TS + TS / 2), Z.water)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = false
      this.tileGroup.add(mesh)
      this.waterGeo = wgeo
    }

    if (buckets.toxic.length) {
      let ttex = null
      try {
        ttex = getToxicPoolArt()
      } catch (e) {
        ttex = null
      }
      const tmat = new THREE.MeshBasicMaterial({
        map: ttex,
        color: 0x9ac84a,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        toneMapped: false,
      })
      this.toxicMat = tmat
      const tgeo = new THREE.PlaneGeometry(TS, TS)
      const mesh = new THREE.InstancedMesh(tgeo, tmat, buckets.toxic.length)
      for (let i = 0; i < buckets.toxic.length; i++) {
        const { tx, ty } = buckets.toxic[i]
        dummy.position.set(tx * TS + TS / 2, -(ty * TS + TS / 2), Z.water + 0.1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = false
      this.tileGroup.add(mesh)
      this.toxicGeo = tgeo
    }

    this.tileCounts = {
      solid: buckets.solid.length + buckets.top.length,
      cracked: buckets.cracked.length,
      soil: buckets.soil.length,
      water: buckets.water.length,
      toxic: buckets.toxic.length,
    }
  }

  onTileEdited() {
    this._rebuildQueued = true
  }

  unburyNear(x, y) {
    for (const l of this.lootDrops) {
      if (!l.buried) continue
      if (Math.hypot(l.x - x, l.y - y) < 120) l.unbury()
    }
  }

  // ---------------------------------------------------------------- 门 / 庇护所
  buildDoors() {
    const d = this.data
    const mat = new THREE.MeshBasicMaterial({
      map: getDoorTexture(),
      transparent: true,
      opacity: 0.9,
      color: 0xb09070,
      toneMapped: false,
    })
    this.doorMat = mat
    const geo = new THREE.PlaneGeometry(64, 96)
    this.doorGeo = geo
    const add = (x, floorY, flip) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, -floorY + 48, -1)
      m.scale.x = flip ? -1 : 1
      this.group.add(m)
    }
    if (d.exits?.left) add(d.doorLeft.x - 12, d.doorLeft.y, false)
    if (d.exits?.right) add(d.doorRight.x + 12, d.doorRight.y, true)
  }

  buildShelter() {
    const s = this.data.shelter
    if (!s) return
    const mat = new THREE.MeshBasicMaterial({
      map: getShelterTexture(),
      transparent: true,
      color: 0xc0a070,
      toneMapped: false,
    })
    this.shelterMat = mat
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(96, 128), mat)
    mesh.position.set(s.x, -s.y + 64, -2)
    this.group.add(mesh)
    const glowMat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: 0xf2b34a,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    this.shelterGlowMat = glowMat
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(300, 240), glowMat)
    glow.position.set(s.x, -s.y + 60, -1.5)
    this.group.add(glow)
    this.shelterGlow = glow
  }

  // ---------------------------------------------------------------- 道具
  buildProps() {
    this.propMeshes = []
    for (const p of this.data.props || []) {
      const def = getProp(p.kind) || PROPS[p.kind] || { solid: false }
      let tex = null
      try {
        tex = getPropArt(p.kind)
      } catch (e) {
        tex = null
      }
      const w = tex?.image?.width || 48
      const h = tex?.image?.height || 48
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: tex ? 0xffffff : 0x5a4a3a,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.96,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      const scale = p.scale || 1
      mesh.scale.set(scale * (p.flip ? -1 : 1), scale, 1)
      mesh.position.set(p.x, -p.y + (h * scale) / 2, p.z ?? Z.props)
      mesh.renderOrder = 2
      this.group.add(mesh)
      this.propMeshes.push({ mesh, def, prop: p })
      if (def.interact || def.loot || def.destructible) {
        this.interactables.push({
          kind: def.destructible ? 'destructible' : 'prop',
          propKind: p.kind,
          x: p.x,
          y: p.y,
          radius: 50,
          def,
          mesh,
          opened: false,
          hp: def.destructible ? 2 : 0,
          questTarget: def.questTarget || null,
        })
      }
    }
  }

  // ---------------------------------------------------------------- 地标
  buildLandmarks() {
    for (const lm of this.data.landmarks || []) {
      const repaired = !!G.flags[`repaired:${lm.id}`]
      let tex = null
      try {
        tex = getPropArt(lm.kind === 'antenna' ? 'antenna' : lm.kind === 'relay' ? 'relay' : 'generator')
      } catch (e) {
        tex = null
      }
      const w = tex?.image?.width || 64
      const h = tex?.image?.height || 64
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        color: repaired ? 0x9fe8b0 : 0xd0a070,
        toneMapped: false,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      mesh.position.set(lm.x, -lm.y + h / 2, Z.props)
      this.group.add(mesh)
      const glowMat = new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color: repaired ? 0x6ff0d0 : 0xf2b34a,
        transparent: true,
        opacity: repaired ? 0.16 : 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), glowMat)
      glow.position.set(lm.x, -lm.y + h * 0.6, Z.props - 0.5)
      this.group.add(glow)
      const entry = {
        kind: 'landmark',
        id: lm.id,
        landmarkKind: lm.kind,
        x: lm.x,
        y: lm.y,
        radius: 76,
        mesh,
        glow,
        mat,
        glowMat,
        repaired,
      }
      this.landmarks.push(entry)
      this.interactables.push(entry)
    }
  }

  markLandmarkRepaired(id) {
    const lm = this.landmarks.find((l) => l.id === id)
    if (!lm) return
    lm.repaired = true
    lm.mat.color.setHex(0x9fe8b0)
    lm.glowMat.color.setHex(0x6ff0d0)
    lm.glowMat.opacity = 0.2
    G.flags[`repaired:${id}`] = true
  }

  // ---------------------------------------------------------------- 牢笼（营救）
  buildCages() {
    for (const c of this.data.cages || []) {
      let tex = null
      try {
        tex = getPropArt('cage')
      } catch (e) {
        tex = null
      }
      const w = tex?.image?.width || 64
      const h = tex?.image?.height || 56
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      mesh.position.set(c.x, -c.y + h / 2, Z.props)
      this.group.add(mesh)
      const glowMat = new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color: 0xff5644,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), glowMat)
      glow.position.set(c.x, -c.y + 30, Z.props - 0.5)
      this.group.add(glow)

      let holo = null
      try {
        const comp = Content.get(KIND.COMPANION, c.companionId || String(c.rescueQuest || '').replace('rescue_', ''))
        if (comp) {
          const holoTex = getPortrait(comp.id)
          if (holoTex) {
            const hMat = new THREE.MeshBasicMaterial({
              map: holoTex,
              transparent: true,
              opacity: 0.5,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              toneMapped: false,
            })
            holo = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), hMat)
            holo.position.set(c.x, -c.y + 34, Z.props + 0.2)
            this.group.add(holo)
          }
        }
      } catch (e) {
        holo = null
      }

      const entry = {
        kind: 'cage',
        id: c.id,
        rescueQuest: c.rescueQuest,
        companionId: c.companionId,
        x: c.x,
        y: c.y,
        radius: 68,
        mesh,
        glow,
        mat,
        glowMat,
        holo,
        opened: !!G.flags[`cage:${c.id}`],
      }
      if (entry.opened) {
        entry.glowMat.opacity = 0.04
        entry.mat.opacity = 0.55
      }
      this.cages.push(entry)
      this.interactables.push(entry)
    }
  }

  // ---------------------------------------------------------------- 战利品
  buildLoot() {
    for (const l of this.data.loot || []) {
      if (G.flags[`taken:${this.data.roomId}:${l.lid ?? l.id}:${Math.round(l.x)}`]) continue
      const drop = new LootDrop(this.game, l.id, l.x, l.y, {
        hidden: !!l.hidden,
        buried: !!l.buried,
        questItem: !!l.questItem,
      })
      this.lootDrops.push(drop)
      this.group.add(drop.group)
      if (drop.hidden || drop.buried) {
        this.interactables.push({
          kind: 'loot',
          x: l.x,
          y: l.y,
          radius: 44,
          drop,
          hidden: drop.hidden,
          buried: drop.buried,
          label: Content.get(KIND.ITEM, l.id)?.name || l.id,
        })
      }
    }
  }

  // ---------------------------------------------------------------- 避难所同伴
  buildNpcs() {
    const roomId = this.data.roomId
    for (const comp of Content.all(KIND.COMPANION)) {
      const meta = G.companions[comp.id]
      const isHere = comp.shelter === roomId && (!comp.rescue || meta?.rescued)
      if (!isHere) continue
      const s = this.data.shelter
      if (!s) continue
      const side = comp.id.charCodeAt(0) % 2 === 0 ? -1 : 1
      const x = s.x + side * 120
      const y = s.y
      let tex = null
      try {
        tex = getPortrait(comp.id)
      } catch (e) {
        tex = null
      }
      let holo = null
      if (tex) {
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
        holo = new THREE.Mesh(new THREE.PlaneGeometry(104, 104), mat)
        holo.position.set(x, -y + 70, Z.props + 0.4)
        holo.renderOrder = 4
        this.group.add(holo)
      }
      let base = null
      try {
        const bt = getPropArt('terminal')
        if (bt) {
          const bm = new THREE.MeshBasicMaterial({ map: bt, transparent: true, toneMapped: false })
          base = new THREE.Mesh(new THREE.PlaneGeometry(bt.image.width, bt.image.height), bm)
          base.position.set(x, -y + bt.image.height / 2, Z.props)
          this.group.add(base)
        }
      } catch (e) {
        base = null
      }
      const entry = {
        kind: 'npc',
        npcId: comp.id,
        name: comp.name,
        x,
        y,
        radius: 76,
        holo,
        base,
        def: comp,
      }
      this.npcHolograms.push(entry)
      this.interactables.push(entry)
    }
  }

  // ---------------------------------------------------------------- 浓烟
  buildSmoke() {
    const w = this.game.weather
    if (!w) return
    for (const s of this.data.smokeSources || []) {
      w.addSmokeSource(s.x, s.y, s.radius || 80, s.intensity ?? 1)
    }
  }

  // ---------------------------------------------------------------- 每帧
  update(dt) {
    this.time += dt
    for (const l of this.lootDrops) l.update(dt)
    for (const n of this.npcHolograms) {
      if (!n.holo) continue
      n.holo.position.y = -n.y + 70 + Math.sin(this.time * 1.4 + n.x * 0.01) * 5
      n.holo.material.opacity = 0.42 + Math.sin(this.time * 2 + n.x) * 0.12
    }
    for (const c of this.cages) {
      if (!c.opened) c.glowMat.opacity = 0.1 + Math.sin(this.time * 2.2 + c.x) * 0.05
    }
    for (const lm of this.landmarks) {
      if (!lm.repaired) lm.glowMat.opacity = 0.08 + Math.sin(this.time * 1.7 + lm.x) * 0.04
    }
    if (this.shelterGlowMat) {
      this.shelterGlowMat.opacity = 0.14 + Math.sin(this.time * 1.5) * 0.05 + (G.weatherPhase === 'storm' ? 0.08 : 0)
    }
    if (this.cloudLayers) {
      for (const cl of this.cloudLayers) {
        cl.tex.offset.x = (cl.tex.offset.x + 0.0035 * cl.speed * dt) % 1
      }
    }
    if (this.overlayMesh && this.game.camera) {
      this.overlayMesh.position.x = this.game.camera.position.x
      this.overlayMesh.position.y = this.game.camera.position.y
    }
    if (this.waterTex) {
      this.waterTex.offset.x = Math.sin(this.time * 0.3) * 0.1
      this.waterTex.offset.y = Math.sin(this.time * 0.2) * 0.05
    }
    if (this.toxicMat?.map) {
      this.toxicMat.map.offset.x = this.time * 0.02
      this.toxicMat.map.offset.y = Math.sin(this.time * 0.4) * 0.04
    }
    if (this._rebuildQueued) {
      this._rebuildT += dt
      if (this._rebuildT > 0.18) {
        this._rebuildQueued = false
        this._rebuildT = 0
        this.rebuildTiles()
      }
    }
  }

  inShelter(px, py) {
    const s = this.data.shelter
    if (!s) return false
    return Math.abs(px - s.x) < 78 && py > s.y - 190 && py <= s.y + 10
  }

  dispose() {
    this.game.scene.remove(this.bg)
    for (const l of this.bgLayers) {
      l.mesh.geometry.dispose()
      l.mat.dispose()
    }
    this.bgLayers.length = 0
    for (const l of this.lootDrops) l.dispose()
    this.lootDrops.length = 0
    if (this.tileGroup) {
      this.tileGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
    }
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
    if (this.overlayMesh) {
      this.game.scene.remove(this.overlayMesh)
      this.overlayMesh.geometry.dispose()
      this.overlayMat.dispose()
    }
    this.game.scene.remove(this.group)
    this.game.weather?.clearSmokeSources()
  }
}
