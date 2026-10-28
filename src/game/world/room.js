import * as THREE from 'three'
import { fixSpriteMesh } from '../render/materials.js'
import { TS } from '../config.js'
import { T } from './tilemap.js'
import { hash2 } from '../render/rng.js'
import { getBiomeArt, getSkyArt, getStarField, getSunArt, getMoonArt } from '../render/art/world.js'
import { getThemeBackdrop } from '../render/art/backdrops.js'
import { Surf, mix } from '../render/art/core.js'
import { PAL } from '../render/palette.js'
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

const PANEL_CACHE = new Map()

/** 避难所面板底纹：铆钉 + 板缝 + 划痕 + 锈斑 + 噪点（128×64 可平铺，颜色由 material.color 染色）。 */
function getPanelArt() {
  let tex = PANEL_CACHE.get('panel')
  if (tex) return tex
  const s = new Surf(128, 64, 0x5a17, 'room-panel')
  const base = mix(PAL.steelLight, PAL.dust, 0.35)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 128; x++) {
      const r = hash2(x, y, 0x5a17)
      const c = r > 0.9 ? mix(base, PAL.white, 0.14) : r < 0.1 ? mix(base, PAL.void, 0.16) : base
      s.set(x, y, c)
    }
  }
  // 板缝（凹槽 + 高光）
  for (const y of [15, 31, 47]) {
    s.rect(0, y, 128, 1, mix(base, PAL.void, 0.3))
    s.rect(0, y + 1, 128, 1, mix(base, PAL.white, 0.1))
  }
  s.rect(63, 0, 1, 64, mix(base, PAL.void, 0.26))
  s.rect(64, 0, 1, 64, mix(base, PAL.white, 0.08))
  // 铆钉
  for (let y = 6; y < 64; y += 15) {
    for (let x = 5; x < 128; x += 21) {
      s.ell(x, y, 1.6, 1.6, mix(base, PAL.void, 0.25))
      s.px(x, y - 1, mix(base, PAL.white, 0.25))
    }
  }
  // 划痕 / 锈斑
  for (let i = 0; i < 26; i++) {
    const x = s.r() * 128
    const y = s.r() * 64
    const len = 4 + s.r() * 20
    if (s.r() < 0.5) s.line(x, y, x + len, y - s.r() * 6, mix(base, PAL.white, 0.12), 1)
    else s.line(x, y, x + len * 0.6, y + s.r() * 5, mix(base, PAL.void, 0.18), 1)
  }
  for (let i = 0; i < 14; i++) {
    s.ell(s.r() * 128, s.r() * 64, 1 + s.r() * 4, 1 + s.r() * 3, mix(PAL.rust, base, 0.45), 1)
  }
  tex = s.tex()
  tex.name = 'room-panel'
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  PANEL_CACHE.set('panel', tex)
  return tex
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
    this.buildScenery()
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

    // 天空：交给 buildSkyLayers 的日夜天空层统一绘制。
    // 旧版这里还叠一张 biome 静态天空，两张不同色调的半透明大平面叠在一起，
    // 抖动透明像素互相透出，形成满屏「交错斑块」——已移除。

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

    // 主题房间：专属全景立绘替换 biome 背景，避免「数据中心外面还是城市天际线」的乱搭配
    let themeBd = null
    if (this.data.themeId) {
      try {
        themeBd = getThemeBackdrop(this.data.themeId)
      } catch (e) {
        themeBd = null
      }
    }
    if (themeBd) {
      addLandscape(themeBd, 0.4, 0xffffff, 1.0, -6)
    } else {
      addLandscape(art?.far, 0.88, 0xd9c9a8, 0.95, 0)
      addLandscape(art?.mid, 0.7, 0xfff0d8, 0.98, 0)
      addLandscape(art?.near, 0.48, 0x6a5c4a, 0.98, 0)
    }

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
      // 交叉淡化层：时段切换时新天空从这层淡入，旧天空垫底，避免闪变
      const matB = new THREE.MeshBasicMaterial({ map: skyTex, depthWrite: false, toneMapped: false, transparent: true, opacity: 0 })
      const meshB = new THREE.Mesh(new THREE.PlaneGeometry(7600, 4200), matB)
      meshB.position.set(0, -(this.bgBaseY - 1200), Z.sky - 1)
      meshB.visible = false
      group.add(meshB)
      this.skyMeshB = meshB
      this.skyMatB = matB
      this.skyFade = 1
    }

    // 太阳 / 月亮（夕阳在黄昏低垂、放大、染橙）
    try {
      const sunTex = getSunArt()
      if (sunTex) {
        const mat = new THREE.MeshBasicMaterial({
          map: sunTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), mat)
        mesh.position.set(0, -(this.bgBaseY - 1200), Z.sky + 0.5)
        group.add(mesh)
        this.sunMesh = mesh
        this.sunMat = mat
      }
      const moonTex = getMoonArt()
      if (moonTex) {
        const mat = new THREE.MeshBasicMaterial({
          map: moonTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), mat)
        mesh.position.set(0, -(this.bgBaseY - 1200), Z.sky + 0.5)
        group.add(mesh)
        this.moonMesh = mesh
        this.moonMat = mat
      }
    } catch (e) {
      /* 天体贴图不可用则跳过 */
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

  /** 切换日夜阶段：新天空从 B 层淡入，旧天空垫底，~2.6s 完成 */
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
    if (this.skyMeshB && this.skyMat && art.sky) {
      // B 层承接新图并淡入；A 层保持旧图垫底
      art.sky.wrapS = THREE.ClampToEdgeWrapping
      art.sky.wrapT = THREE.ClampToEdgeWrapping
      this.skyMatB.map = art.sky
      this.skyMatB.opacity = 0
      this.skyMatB.needsUpdate = true
      this.skyMeshB.visible = true
      this.skyFade = 0
    } else if (this.skyMesh && art.sky) {
      this.skyMat.map = art.sky
      this.skyMat.needsUpdate = true
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
    const wk = params.weatherK ?? 1
    if (this.overlayMat) {
      const wx = this.safeWeatherArt(this.weatherId)
      const d = (wx?.density ?? params.fog ?? 0) * wk
      this.overlayMat.opacity = Math.min(0.62, (0.06 + d * 0.55) * wk)
    }
    if (this.cloudLayers) {
      const t = params.tint || [1, 1, 1]
      for (const cl of this.cloudLayers) {
        cl.mat.opacity = cl.base * (0.55 + (params.amb ?? 1) * 0.45)
        cl.mat.color.setRGB(t[0], t[1], t[2])
      }
    }
    // 星星按连续 night 值淡入淡出，不再按阶段跳变
    if (this.starMat) {
      const n = params.night || 0
      this.starMat.opacity = Math.max(0, Math.min(0.85, (n - 0.18) * 1.35)) * (1 - Math.min(1, (params.fog || 0) * 1.4))
    }
    // 太阳 / 月亮
    this.updateCelestial(params)
  }

  /** 太阳/月亮不透明度与颜色（applyDayNight 0.1s 节拍调用） */
  updateCelestial(params) {
    const night = params.night || 0
    const cover = Math.min(1, (params.fog || 0) * 1.6 + (params.rain || 0) * 0.9)
    if (this.sunMesh) {
      const show = Math.max(0, 1 - night * 1.5) * (1 - cover)
      this.sunMat.opacity = show * 0.85
      this.sunMesh.visible = show > 0.02
    }
    if (this.moonMesh) {
      const show = Math.max(0, (night - 0.3) * 1.6) * (1 - cover)
      this.moonMat.opacity = Math.min(0.9, show)
      this.moonMesh.visible = show > 0.02 && this._moonInWindow !== false
    }
  }

  /** 太阳/月亮位置：跟随相机横移（弱视差），黄昏低垂放大染橙（夕阳） */
  updateCelestialPos(camera) {
    if (!this.sunMesh && !this.moonMesh) return
    const time = G.dayNight?.time ?? 0.27
    const baseY = this.skyMesh ? this.skyMesh.position.y : -(this.bgBaseY - 1200)
    const baseZ = this.skyMesh ? this.skyMesh.position.z : Z.sky - 2
    const cx = camera.position.x
    if (this.sunMesh?.visible) {
      const p = Math.max(0, Math.min(1, (time - 0.02) / 0.84))
      const arc = Math.sin(Math.PI * p)
      this.sunMesh.position.set(cx + (p - 0.5) * 1100, baseY + 460 - arc * 1500, baseZ + 2)
      const low = 1 - arc
      this.sunMesh.scale.setScalar(2.4 + low * 1.6)
      const warm = low * low
      this.sunMat.color.setRGB(1, 0.96 - warm * 0.42, 0.86 - warm * 0.52)
    }
    if (this.moonMesh) {
      const mt = time >= 0.84 ? (time - 0.84) / 0.21 : time <= 0.05 ? (0.16 + time) / 0.21 : -1
      this._moonInWindow = mt >= 0 && mt <= 1
      if (this._moonInWindow && this.moonMesh.visible) {
        const arc = Math.sin(Math.PI * mt)
        this.moonMesh.position.set(cx + (mt - 0.5) * 900, baseY + 380 - arc * 1200, baseZ + 2)
      } else {
        this.moonMesh.visible = false
      }
    }
  }

  updateBackground(camera) {
    const cx = camera.position.x
    const cy = camera.position.y
    this.updateCelestialPos(camera)
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

    // —— 建筑结构：屋顶 / 立柱 / 雨棚 / 吊灯 / 招牌 ——
    // 酸雨只会落在屋顶上；inShelter() 的判定范围与屋顶投影一致。
    const addPanel = (w, h, ox, oy, color, z = -1.7, opacity = 1, rot = 0) => {
      const m = new THREE.MeshBasicMaterial({
        map: getPanelArt(),
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: false,
        toneMapped: false,
      })
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
      p.position.set(s.x + ox, -s.y + oy, z)
      p.rotation.z = rot
      this.group.add(p)
      return p
    }
    // 屋檐下的暗部：让避难所从背景里“凹”进去，读起来像一处入口
    addPanel(244, 132, 0, 66, 0x05080b, -2.05, 0.42)
    // 主屋顶：厚钢板 + 上层锈迹压边（提高明度，避免与远景糊在一起）
    addPanel(268, 22, 0, 146, 0x596a75, -1.72)
    addPanel(278, 7, 0, 159, 0x9fb2bd, -1.71)
    addPanel(268, 5, 0, 134, 0xa85c2c, -1.70)
    // 屋顶的横向桁架 + 两道纵向压筋
    for (let k = -2; k <= 2; k++) addPanel(4, 18, k * 52, 147, 0x93a8b2, -1.69, 0.85)
    addPanel(264, 3, 0, 141, 0x8ea2ad, -1.71, 0.9)
    addPanel(264, 2, 0, 152, 0x6f8792, -1.71, 0.9)
    // 前后立柱（支撑屋顶）+ 斜撑
    addPanel(12, 136, -126, 68, 0x4e5b64, -1.68)
    addPanel(12, 136, 126, 68, 0x4e5b64, -1.68)
    addPanel(4, 132, -126, 68, 0x71838d, -1.675, 0.8)
    addPanel(4, 132, 126, 68, 0x71838d, -1.675, 0.8)
    addPanel(34, 5, -108, 128, 0x5d6d77, -1.66, 0.95, 0.55)
    addPanel(34, 5, 108, 128, 0x5d6d77, -1.66, 0.95, -0.55)
    addPanel(12, 6, -126, 4, 0xa85c2c, -1.67)
    addPanel(12, 6, 126, 4, 0xa85c2c, -1.67)
    // 前沿雨棚：稍微外挑并向下倾斜，酸雨顺着流到两侧
    addPanel(300, 10, 0, 132, 0x4a565f, -1.66, 1, -0.035)
    addPanel(300, 3, 0, 128, 0x6ff0d0, -1.65, 0.45, -0.035)
    // 吊灯：灯罩 + 暖光
    addPanel(22, 7, 0, 128, 0x1b2125, -1.64)
    const lampMat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: 0xf2b34a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), lampMat)
    lamp.position.set(s.x, -s.y + 124, -1.63)
    this.group.add(lamp)
    this.shelterLampMat = lampMat
    // 招牌：挂在门楣上
    addPanel(64, 18, 0, 112, 0x4a2a18, -1.62)
    addPanel(58, 12, 0, 112, 0x8a4b26, -1.61)
    addPanel(40, 3, 0, 112, 0x6ff0d0, -1.60, 0.65)
    // 两侧的固定沙袋 / 配重
    addPanel(16, 10, -92, 5, 0x5a5548, -1.59)
    addPanel(16, 10, 92, 5, 0x5a5548, -1.59)
  }

  // ---------------------------------------------------------------- 远景装饰
  /** 在可玩层后面铺一层剪影建筑/残骸，增加纵深与群系辨识度。 */
  buildScenery() {
    const KINDS = {
      city: ['building_facade', 'streetlight', 'car_wreck', 'mech_cable_run', 'streetlight', 'house_facade', 'bus_wreck'],
      factory: ['factory_pipe', 'generator', 'gear_assembly', 'conveyor_segment', 'crane_hook', 'mech_turbine', 'antenna'],
      dump: ['junk_heap_bags', 'tree_dead', 'junk_heap_scrap', 'mech_servo_arm', 'container_small', 'tree_dead', 'junk_heap_plastic'],
      port: ['life_ring', 'hull_plate', 'cargo_net', 'beacon', 'mech_cable_run', 'container_small', 'satellite_dish'],
      village: ['house_facade', 'tree_dead', 'mech_pipe_bundle', 'farm_silo', 'weed', 'house_facade', 'torn_flag'],
      metro: ['server_rack', 'metro_sign', 'mech_cable_run', 'mech_rail', 'mech_console', 'neon_poster', 'mech_rail'],
      hospital: ['mech_console', 'lab_tank', 'gurney', 'mech_cable_run', 'hospital_bed', 'server_rack', 'lunar_flower'],
    }
    const biome = this.data.biome || 'city'
    const themed = Array.isArray(this.data.sceneryKinds) && this.data.sceneryKinds.length
    // 主题站点只用主题件做远景，避免「太阳能中心」背后立着居民楼、撞毁巴士之类的乱搭配
    const scenery = themed ? this.data.sceneryKinds : (KINDS[biome] || KINDS.city)
    const kinds = themed ? scenery : [...scenery, ...(KINDS[biome] || KINDS.city).slice(0, 2)]
    const worldW = this.data.worldW || 2000
    const floorY = typeof this.data.floorY === 'number' ? this.data.floorY : 0
    const count = Math.max(4, Math.min(9, Math.round(worldW / 430)))
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length]
      let tex = null
      try {
        tex = getPropArt(kind)
      } catch (e) {
        tex = null
      }
      if (!tex) continue
      const w = tex.image?.width || 48
      const h = tex.image?.height || 48
      const seed = hash2(Math.round(this.data.worldW || 0), i * 37 + biome.length)
      const rnd = (seed % 1000) / 1000
      const x = 180 + ((i + 0.5) / count) * (worldW - 360) + (rnd - 0.5) * 120
      const scale = 1.1 + ((seed >> 8) % 70) / 100
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.5,
        color: 0x5c6670,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      mesh.scale.set(scale * ((seed & 1) ? -1 : 1), scale, 1)
      mesh.position.set(x, -floorY + (h * scale) / 2, Z.backProps - i * 0.05)
      mesh.renderOrder = -1
      this.group.add(mesh)
      this.sceneryMeshes = this.sceneryMeshes || []
      this.sceneryMeshes.push({ mesh, mat })
    }
  }

  // ---------------------------------------------------------------- 道具
  buildProps() {
    this.propMeshes = []
    const roomId = this.data.roomId
    ;(this.data.props || []).forEach((p, idx) => {
      const flagKey = `prop:${roomId}:${idx}`
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
        const opened = !!G.flags[flagKey]
        if (opened) {
          if (def.destructible) mesh.visible = false
          else mat.opacity = 0.5
        }
        this.interactables.push({
          kind: def.destructible ? 'destructible' : 'prop',
          propKind: p.kind,
          x: p.x,
          y: p.y,
          radius: 50,
          def,
          mesh,
          flagKey,
          opened,
          hp: opened && def.destructible ? 0 : def.destructible ? 2 : 0,
          questTarget: def.questTarget || null,
        })
      }
    })
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
      const flagKey = `taken:${this.data.roomId}:${l.lid ?? l.id}:${Math.round(l.x)}`
      if (G.flags[flagKey]) continue
      // 收藏品 / 遗物全局唯一：捡过之后不再生成
      const def = Content.get(KIND.ITEM, l.id)
      if ((def?.unique || def?.category === 'artifact') && G.flags[`got:${l.id}`]) continue
      const drop = new LootDrop(this.game, l.id, l.x, l.y, {
        hidden: !!l.hidden,
        buried: !!l.buried,
        questItem: !!l.questItem,
        flagKey,
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
    // 天空交叉淡化：B 层淡入完成后落定为新底
    if (this.skyMeshB && this.skyFade < 1) {
      this.skyFade = Math.min(1, this.skyFade + dt / 2.6)
      this.skyMatB.opacity = this.skyFade
      if (this.skyFade >= 1) {
        this.skyMat.map = this.skyMatB.map
        this.skyMat.needsUpdate = true
        this.skyMeshB.visible = false
      }
    }
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
    if (this.shelterLampMat) {
      // 酸雨夜里吊灯会更亮一些，像在招呼人进来躲雨
      const tired = Math.sin(this.time * 7.3) > 0.96 ? 0.72 : 1
      this.shelterLampMat.opacity = (G.weatherPhase === 'storm' ? 0.7 : 0.55) * tired
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
    // 判定与屋顶投影一致：横向 ±136，纵向从地面向上 190
    return Math.abs(px - s.x) < 136 && py > s.y - 190 && py <= s.y + 10
  }

  dispose() {
    this.game.scene.remove(this.bg)
    // 天空/天体/云层等背景网格的材质与几何一并释放（贴图是共享缓存，不 dispose）
    this.bg.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
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
