import * as THREE from 'three'
import { getRainTexture, getGlowTexture } from '../render/textures.js'

const COUNT = 820

/** 暴雨系统：实例化的细长雨条 + 底部水雾 + 闪电 */
export class RainSystem {
  constructor(scene) {
    this.scene = scene
    this.intensity = 0
    this.targetIntensity = 0
    this.time = 0
    this.flash = 0
    this.flashTimer = 2
    this.viewW = 1440
    this.viewH = 810

    const geo = new THREE.PlaneGeometry(2.2, 46)
    const mat = new THREE.MeshBasicMaterial({
      map: getRainTexture(),
      color: 0x9dc2d4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.geo = geo
    this.mat = mat
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 20
    this.mesh.visible = false
    scene.add(this.mesh)

    this.drops = []
    for (let i = 0; i < COUNT; i++) {
      this.drops.push({
        x: (Math.random() - 0.5) * 2600,
        y: (Math.random() - 0.5) * 1400,
        speed: 780 + Math.random() * 620,
        len: 0.7 + Math.random() * 1.6,
        lean: 0.1 + Math.random() * 0.08,
      })
    }
    this.dummy = new THREE.Object3D()

    // 底部水雾
    this.mistMat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: 0x223d49,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.mist = new THREE.Mesh(new THREE.PlaneGeometry(1900, 520), this.mistMat)
    this.mist.position.z = 11
    this.mist.renderOrder = 19
    scene.add(this.mist)
  }

  setIntensity(v) {
    this.targetIntensity = v
  }

  update(dt, cam, viewW, viewH) {
    this.viewW = viewW
    this.viewH = viewH
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 2.2)
    this.time += dt
    const I = this.intensity
    this.mesh.visible = I > 0.012
    if (this.mesh.visible) {
      const halfW = viewW / 2 + 260
      const halfH = viewH / 2 + 300
      const top = cam.y + halfH
      const bottom = cam.y - halfH
      const speedScale = 0.45 + I * 1.1
      const dummy = this.dummy
      for (let i = 0; i < COUNT; i++) {
        const d = this.drops[i]
        d.y -= d.speed * speedScale * dt
        d.x -= 120 * speedScale * dt
        if (d.y < bottom) {
          d.y = top + Math.random() * 120
          d.x = cam.x + (Math.random() - 0.5) * viewW * 2.2
        }
        if (d.x < cam.x - halfW) d.x += halfW * 2
        else if (d.x > cam.x + halfW) d.x -= halfW * 2
        dummy.position.set(d.x, d.y, 12)
        dummy.rotation.z = d.lean
        dummy.scale.set(1, d.len, 1)
        dummy.updateMatrix()
        this.mesh.setMatrixAt(i, dummy.matrix)
      }
      this.mesh.instanceMatrix.needsUpdate = true
      this.mat.opacity = Math.min(0.42, I * 0.5)
    }

    this.mist.position.set(cam.x, cam.y - viewH * 0.4, 11)
    this.mistMat.opacity = Math.max(0, (I - 0.25) * 0.22)

    // 闪电
    this.flash = Math.max(0, this.flash - dt * 3.2)
    if (I > 0.6) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.flash = 0.35 + Math.random() * 0.35
        this.flashTimer = 4 + Math.random() * 8
        if (this.onThunder) this.onThunder()
      }
    }
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.scene.remove(this.mist)
    this.geo.dispose()
    this.mat.dispose()
    this.mist.geometry.dispose()
    this.mistMat.dispose()
  }
}
