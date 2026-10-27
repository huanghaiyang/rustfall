import * as THREE from 'three'
import { getAcidRainArt, getAshArt, getSmokeArt, getEmberArt } from '../render/art/atmosphere.js'
import { createSmokeMaterial } from '../render/fx/shaders.js'
import { makeRng } from '../render/rng.js'

const RAIN_COUNT = 900
const ASH_COUNT = 220

/**
 * 天气与氛围：酸雨（三个相位）、飘灰、浓烟、毒雾、闪电。
 * 场景内用实例化 mesh + shader，屏幕级色调由 postfx 负责。
 */
export class WeatherSystem {
  constructor(scene) {
    this.scene = scene
    this.phase = 'calm'
    this.intensity = 0
    this.targetIntensity = 0
    this.time = 0
    this.flash = 0
    this.flashTimer = 8
    this.smokeSources = []
    this.smokeGroup = new THREE.Group()
    scene.add(this.smokeGroup)
    this.postfx = null

    // ---------- 酸雨 ----------
    let rainTex = null
    try {
      rainTex = getAcidRainArt()
    } catch (e) {
      rainTex = null
    }
    const geo = new THREE.PlaneGeometry(2.4, 48)
    const mat = new THREE.MeshBasicMaterial({
      map: rainTex,
      color: 0xb7d06a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.rainGeo = geo
    this.rainMat = mat
    this.rain = new THREE.InstancedMesh(geo, mat, RAIN_COUNT)
    this.rain.frustumCulled = false
    this.rain.renderOrder = 21
    this.rain.visible = false
    scene.add(this.rain)
    const rng = makeRng(0x5eed)
    this.drops = []
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.drops.push({
        x: rng.range(-1600, 1600),
        y: rng.range(-900, 900),
        speed: rng.range(760, 1480),
        len: rng.range(0.7, 1.9),
        lean: rng.range(0.08, 0.18),
      })
    }
    this.dummy = new THREE.Object3D()

    // ---------- 飘灰 ----------
    let ashTex = null
    try {
      ashTex = getAshArt()
    } catch (e) {
      ashTex = null
    }
    const ashMat = new THREE.PointsMaterial({
      map: ashTex,
      color: 0xb9b2a4,
      size: 5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      toneMapped: false,
    })
    const ashGeo = new THREE.BufferGeometry()
    this.ashPos = new Float32Array(ASH_COUNT * 3)
    for (let i = 0; i < ASH_COUNT; i++) {
      this.ashPos[i * 3 + 0] = rng.range(-1500, 1500)
      this.ashPos[i * 3 + 1] = rng.range(-900, 900)
      this.ashPos[i * 3 + 2] = 10 + rng.range(0, 8)
    }
    ashGeo.setAttribute('position', new THREE.BufferAttribute(this.ashPos, 3))
    this.ashMat = ashMat
    this.ash = new THREE.Points(ashGeo, ashMat)
    this.ash.frustumCulled = false
    this.ash.renderOrder = 20
    scene.add(this.ash)

    // 酸性薄雾（贴地）
    let smokeArt = null
    try {
      smokeArt = getSmokeArt()
    } catch (e) {
      smokeArt = null
    }
    this.fogMat = new THREE.MeshBasicMaterial({
      map: smokeArt,
      color: 0x6a7a3a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.fog = new THREE.Mesh(new THREE.PlaneGeometry(2400, 800), this.fogMat)
    this.fog.position.z = 12
    this.fog.renderOrder = 20
    scene.add(this.fog)
  }

  setPhase(phase, intensity = null) {
    if (phase === this.phase && intensity == null) return
    this.phase = phase
    if (phase === 'calm') this.targetIntensity = 0.04
    else if (phase === 'warning') this.targetIntensity = 0.42
    else if (phase === 'storm') this.targetIntensity = 1
    if (intensity != null) this.targetIntensity = intensity
  }

  setPostFx(fx) {
    this.postfx = fx
  }

  // ---------- 浓烟源（由房间注册） ----------
  clearSmokeSources() {
    for (const s of this.smokeSources) {
      this.smokeGroup.remove(s.mesh)
      s.mesh.geometry.dispose()
      s.mesh.material.dispose?.()
    }
    this.smokeSources.length = 0
  }

  addSmokeSource(x, y, radius = 90, intensity = 1) {
    let mesh = null
    try {
      const smokeTex = getSmokeArt()
      const mat = new THREE.MeshBasicMaterial({
        map: smokeTex || null,
        color: smokeTex ? 0x6a6f66 : 0x3a3f3c,
        transparent: true,
        opacity: (smokeTex ? 0.34 : 0.14) * intensity,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
      })
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.6, radius * 2.6), mat)
      mesh.position.set(x, -y - radius * 0.5, 8)
      mesh.renderOrder = 15
      this.smokeGroup.add(mesh)
    } catch (e) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3a3f3c,
        transparent: true,
        opacity: 0.12 * intensity,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat)
      mesh.position.set(x, -y, 8)
      this.smokeGroup.add(mesh)
    }
    this.smokeSources.push({ x, y, radius, intensity, mesh, seed: Math.random() * 10 })
  }

  update(dt, camera, viewW, viewH, game) {
    this.time += dt
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 1.8)
    const cam = camera.position
    const I = this.intensity
    const halfW = viewW / 2 + 280
    const halfH = viewH / 2 + 320

    // 酸雨
    const rainVisible = I > 0.02
    this.rain.visible = rainVisible
    if (rainVisible) {
      const speedScale = 0.5 + I * 1.1
      for (let i = 0; i < RAIN_COUNT; i++) {
        const d = this.drops[i]
        d.y -= d.speed * speedScale * dt
        d.x -= 150 * speedScale * dt
        if (d.y < cam.y - halfH) {
          d.y = cam.y + halfH + Math.random() * 140
          d.x = cam.x + (Math.random() - 0.5) * viewW * 2.2
        }
        if (d.x < cam.x - halfW) d.x += halfW * 2
        else if (d.x > cam.x + halfW) d.x -= halfW * 2
        this.dummy.position.set(d.x, d.y, 12)
        this.dummy.rotation.z = d.lean
        this.dummy.scale.set(1, d.len, 1)
        this.dummy.updateMatrix()
        this.rain.setMatrixAt(i, this.dummy.matrix)
      }
      this.rain.instanceMatrix.needsUpdate = true
      this.rainMat.opacity = Math.min(0.52, I * 0.62)
    }

    // 飘灰（一直有）
    const arr = this.ashPos
    const ashRate = 12 + I * 40
    for (let i = 0; i < ASH_COUNT; i++) {
      const i3 = i * 3
      arr[i3 + 1] -= (ashRate + (i % 7) * 2) * dt
      arr[i3 + 0] += Math.sin(this.time * 0.7 + i) * 9 * dt
      if (arr[i3 + 1] < cam.y - halfH) {
        arr[i3 + 1] = cam.y + halfH
        arr[i3 + 0] = cam.x + (Math.random() - 0.5) * viewW * 2
      }
      if (arr[i3 + 0] < cam.x - halfW) arr[i3 + 0] += halfW * 2
      else if (arr[i3 + 0] > cam.x + halfW) arr[i3 + 0] -= halfW * 2
    }
    this.ash.geometry.attributes.position.needsUpdate = true
    this.ashMat.opacity = 0.35 + I * 0.2

    // 贴地酸雾
    this.fog.position.set(cam.x, cam.y - viewH * 0.32, 12)
    this.fogMat.opacity = Math.max(0, (I - 0.15) * 0.42)

    // 烟源
    for (const s of this.smokeSources) {
      const mat = s.mesh.material
      if (mat.uniforms?.uTime) {
        mat.uniforms.uTime.value = this.time + s.seed
        mat.uniforms.uOpacity.value = (0.16 + Math.sin(this.time * 0.5 + s.seed) * 0.04) * s.intensity * (0.6 + I * 0.7)
      } else if (mat.opacity != null) {
        mat.opacity = (0.12 + Math.sin(this.time * 0.6 + s.seed) * 0.04) * s.intensity
      }
      s.mesh.scale.setScalar(1 + Math.sin(this.time * 0.22 + s.seed) * 0.08)
    }

    // 闪电
    this.flash = Math.max(0, this.flash - dt * 2.6)
    if (I > 0.7) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.flash = 0.4 + Math.random() * 0.35
        this.flashTimer = 5 + Math.random() * 9
        game?.sfx?.('thunder', { vol: 0.65 })
      }
    }

    // postfx 参数
    if (this.postfx) {
      this.postfx.setUniforms({
        toxicity: I * 0.55,
        smoke: 0.15 + I * 0.35,
        damage: Math.max(this.flash * 0.5, game?.damageFx || 0),
      })
    }
  }

  /** 天气系统（日夜/天气循环）驱动的强度与闪电 */
  setIntensity(v) {
    this.targetIntensity = Math.max(0, Math.min(1, Number(v) || 0))
  }

  setSmoke(v) {
    this.targetSmoke = Math.max(0, Math.min(1, Number(v) || 0))
  }

  triggerLightning(strength = 0.6) {
    this.flash = Math.max(this.flash, Math.min(1, strength))
    if (this.flash > 0.5) this.flashTimer = 4 + Math.random() * 6
  }

  dispose() {
    this.scene.remove(this.rain)
    this.scene.remove(this.ash)
    this.scene.remove(this.fog)
    this.scene.remove(this.smokeGroup)
    this.rainGeo.dispose()
    this.rainMat.dispose()
    this.ash.geometry.dispose()
    this.ashMat.dispose()
    this.fog.geometry.dispose()
    this.fogMat.dispose()
    this.clearSmokeSources()
  }
}
