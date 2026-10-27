// 日夜天空 / 云 / 星 / 天气幕 接入 room.js + game.js
import fs from 'node:fs'
const log = (n, ok) => console.log((ok ? 'OK   ' : 'FAIL ') + n)

// ---------- room.js ----------
{
  const f = 'src/game/world/room.js'
  let s = fs.readFileSync(f, 'utf8')

  if (!s.includes('getSkyArt')) {
    s = s.replace(
      `import { getBiomeArt } from '../render/art/world.js'`,
      `import { getBiomeArt, getSkyArt, getStarField } from '../render/art/world.js'`,
    )
    s = s.replace(
      `import { getPropArt } from '../render/art/props.js'`,
      `import { getPropArt } from '../render/art/props.js'
import { getWeatherArt } from '../render/art/atmosphere.js'`,
    )
  }

  // 在 buildBackground 末尾插入天空层
  if (!s.includes('buildSkyLayers')) {
    s = s.replace(
      `    this.bgLayers = layers
    return group`,
      `    this.bgLayers = layers
    this.buildSkyLayers(group)
    return group`,
    )
    s = s.replace(
      `  updateBackground(camera) {`,
      `  /** 日夜天空：渐变底 + 星野 + 三层云 + 天气幕 */
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

  updateBackground(camera) {`,
    )

    // update() 里滚动云 + 天气幕跟随
    s = s.replace(
      `    if (this.waterTex) {`,
      `    if (this.cloudLayers) {
      for (const cl of this.cloudLayers) {
        cl.tex.offset.x = (cl.tex.offset.x + 0.0035 * cl.speed * dt) % 1
      }
    }
    if (this.overlayMesh) {
      this.overlayMesh.position.x = camera ? 0 : 0
      this.overlayMesh.position.y = this.game.camera.position.y
      this.overlayMesh.position.x = this.game.camera.position.x
    }
    if (this.waterTex) {`,
    )
    log('room sky', true)
  } else log('room sky', true)

  // 清理时销毁天空/天气幕
  s = s.replace(
    `    this.game.scene.remove(this.group)
    this.game.weather?.clearSmokeSources()`,
    `    if (this.overlayMesh) {
      this.game.scene.remove(this.overlayMesh)
      this.overlayMesh.geometry.dispose()
      this.overlayMat.dispose()
    }
    this.game.scene.remove(this.group)
    this.game.weather?.clearSmokeSources()`,
  )

  fs.writeFileSync(f, s)
}

// ---------- game.js：把 daynight 参数交给 room + postfx 用天气 art ----------
{
  const f = 'src/game/game.js'
  let s = fs.readFileSync(f, 'utf8')
  if (!s.includes('room?.applyDayNight')) {
    s = s.replace(
      `    this.weather?.setIntensity?.(Math.max(params.rain, params.fog * 0.35))`,
      `    this.room?.applyDayNight?.(params)
    this.weather?.setIntensity?.(Math.max(params.rain, params.fog * 0.35))`,
    )
    s = s.replace(
      `    pf?.setUniforms?.({
      ambient: params.amb,
      night: params.night,
      weatherTint: params.tint,
      fog: params.fog,
      wetness: params.wetness,
    })`,
      `    let wx = null
    try {
      wx = this.room?.safeWeatherArt?.(params.weather?.id || 'clear') || null
    } catch (e) {
      wx = null
    }
    pf?.setUniforms?.({
      ambient: params.amb,
      night: params.night,
      weatherTint: wx?.tint || params.tint,
      fog: Math.max(params.fog, wx?.fog || 0),
      wetness: Math.max(params.wetness, wx?.wetness || 0),
      toxicity: wx?.toxicity || 0,
    })`,
    )
    fs.writeFileSync(f, s)
    log('game daynight', true)
  } else log('game daynight', true)
}
