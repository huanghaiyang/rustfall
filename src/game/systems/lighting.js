// 拟真光照 —— 给「一片 Basic 材质 + 全局压暗」的画面加真实光源。
//
// 结构：
//   · 静态光源   —— 扫描 room.data.props 里会发光的道具（路灯 / 篝火 / 终端 / 霓虹…），
//                   每个光源是一张加法混合的径向渐变面片，半径、颜色、闪烁按道具类型配。
//   · 机体头灯   —— 环境越暗越亮，微偏向前进方向，夜色里给玩家一小片视野。
//   · 瞬时闪光   —— 枪口 / 弹着 / 爆炸 / EMP 触发，池化复用，按 life 淡出。
//   · 环境耦合   —— 光源强度跟 G.dayNight 的 night/amb 挂钩：白天几乎不亮，夜里满功率；
//                   闪电时由 applyDayNight 抬高 ambient，整个画面会白一下。
//
// 全部使用加法混合（AdditiveBlending），配合 postfx 的 ambient 乘法压暗，
// 形成「暗场 + 灯池」的关系，不需要给任何 sprite 换受光材质。

import * as THREE from 'three'
import { G } from '../state.js'

const LIGHT_Z = 5
const MAX_STATIC = 44
const MAX_BURSTS = 14

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/** 会发光的道具：半径、颜色、亮度、闪烁、脉动、灯头相对底边的抬高 */
const LIGHT_PROPS = {
  streetlight: { r: 260, color: 0xffc46b, i: 0.9, flicker: 0.16, yOff: 108 },
  stadium_light: { r: 360, color: 0xe6f3ff, i: 0.85, flicker: 0.06, yOff: 62 },
  beacon: { r: 300, color: 0xff4a3a, i: 0.95, pulse: 1.15, yOff: 44 },
  campfire: { r: 210, color: 0xff9a44, i: 1.0, flicker: 0.4, rate: 9, yOff: 6 },
  neon_poster: { r: 190, color: 0xff5cc8, i: 0.7, flicker: 0.22, rate: 11, yOff: 46 },
  metro_sign: { r: 200, color: 0x8fc9ff, i: 0.65, flicker: 0.12, yOff: 34 },
  tv: { r: 150, color: 0x8fd3ff, i: 0.6, flicker: 0.3, rate: 14, yOff: 22 },
  terminal: { r: 165, color: 0x6cf6cc, i: 0.6, flicker: 0.1, yOff: 16 },
  mech_console: { r: 175, color: 0x6cf6cc, i: 0.6, flicker: 0.12, yOff: 20 },
  generator: { r: 200, color: 0xffb14a, i: 0.7, flicker: 0.14, yOff: 26 },
  relay: { r: 180, color: 0x6cf6cc, i: 0.55, flicker: 0.18, yOff: 20 },
  server_rack: { r: 230, color: 0x6ea8ff, i: 0.6, flicker: 0.1, yOff: 62 },
  lab_tank: { r: 230, color: 0x8cff9a, i: 0.7, pulse: 0.45, yOff: 44 },
  alien_pod: { r: 220, color: 0xa8ff6a, i: 0.75, pulse: 0.6, yOff: 28 },
  lunar_flower: { r: 150, color: 0x9dffc9, i: 0.5, pulse: 0.35, yOff: 8 },
  solar_panel: { r: 160, color: 0x9fc4ff, i: 0.35, flicker: 0.05, yOff: 42 },
}

/** 径向渐变贴图（中心白 → 外透明，带一点暖核） */
let _tex = null
function lightTexture() {
  if (_tex) return _tex
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.62)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.26)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.08)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  _tex = new THREE.CanvasTexture(cv)
  _tex.colorSpace = THREE.SRGBColorSpace
  _tex.needsUpdate = true
  return _tex
}

function makeMesh(radius, color, opacity) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 1.7)
  const mat = new THREE.MeshBasicMaterial({
    map: lightTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 7
  mesh.visible = false
  return mesh
}

export function createLighting(game) {
  const group = new THREE.Group()
  group.name = 'lighting'
  try {
    game.scene?.add(group)
  } catch (e) {
    /* ignore */
  }

  /** @type {Array<{mesh:THREE.Mesh, base:number, def:object, phase:number}>} */
  let statics = []
  /** @type {Array<{mesh:THREE.Mesh, t:number, life:number, base:number}>} */
  const bursts = []
  let playerLamp = null
  let roomKey = ''
  let time = 0
  let enabled = true

  // ---------------------------------------------------------------- 环境亮度
  function darkness() {
    const dn = G.dayNight || {}
    const night = Number(dn.night) || 0
    const amb = Number.isFinite(dn.amb) ? dn.amb : 1
    // 主题房间可以强制变暗（恐怖酒店 / 暗影迷宫 / 地下）
    const roomDark = Number(game.room?.data?.env?.dark) || 0
    // 夜里或天气压暗时，灯才亮起来
    return clamp(Math.max(night, 1 - amb, roomDark), 0, 1)
  }

  // ---------------------------------------------------------------- 静态光源
  function clearStatics() {
    for (const s of statics) {
      try {
        group.remove(s.mesh)
        s.mesh.geometry.dispose()
        s.mesh.material.dispose()
      } catch (e) {
        /* ignore */
      }
    }
    statics = []
  }

  function buildForRoom(room) {
    const data = room?.data
    const key = data ? `${data.regionId || ''}:${data.roomId || ''}:${data.props?.length || 0}` : ''
    if (key && key === roomKey) return statics.length
    roomKey = key
    clearStatics()
    if (!data || !Array.isArray(data.props)) return 0

    for (const p of data.props) {
      const def = LIGHT_PROPS[p?.kind]
      if (!def) continue
      if (statics.length >= MAX_STATIC) break
      const scale = Number(p.scale) || 1
      const radius = def.r * (0.75 + 0.25 * scale)
      const mesh = makeMesh(radius, def.color, 0)
      const y = (Number(p.y) || 0) - def.yOff * scale
      mesh.position.set(Number(p.x) || 0, -y, LIGHT_Z)
      group.add(mesh)
      statics.push({
        mesh,
        def,
        base: def.i,
        phase: Math.random() * Math.PI * 2,
        seed: Math.random(),
      })
    }
    return statics.length
  }

  // ---------------------------------------------------------------- 头灯
  function ensureLamp() {
    if (playerLamp) return playerLamp
    playerLamp = makeMesh(190, 0xfff0c8, 0)
    playerLamp.position.z = LIGHT_Z + 0.2
    group.add(playerLamp)
    return playerLamp
  }

  // ---------------------------------------------------------------- 瞬时闪光
  function flash(x, y, radius = 140, color = 0xffd08a, life = 0.16, intensity = 1) {
    if (!enabled) return
    let slot = bursts.find((b) => b.t <= 0)
    if (!slot) {
      if (bursts.length >= MAX_BURSTS) {
        slot = bursts.reduce((a, b) => (b.t < a.t ? b : a), bursts[0])
      } else {
        const mesh = makeMesh(radius, color, 0)
        group.add(mesh)
        slot = { mesh, t: 0, life: 0.001, base: 1, radius }
        bursts.push(slot)
      }
    }
    slot.t = life
    slot.life = life
    slot.base = intensity
    slot.mesh.position.set(x, -y, LIGHT_Z + 0.4)
    slot.mesh.scale.setScalar((radius / (slot.radius || radius)) || 1)
    slot.mesh.material.color.setHex(color)
    slot.mesh.material.opacity = intensity
    slot.mesh.visible = true
  }

  // ---------------------------------------------------------------- 每帧
  function update(dt) {
    time += dt
    if (!enabled) return
    const dk = darkness()
    const lampOn = dk > 0.22

    for (const s of statics) {
      const def = s.def
      let v = s.base * (0.06 + 0.94 * dk)
      if (def.flicker) {
        const rate = def.rate || 3
        const n = Math.sin(time * rate + s.phase) * 0.5 + 0.5
        v *= 1 - def.flicker + def.flicker * (n * 0.7 + Math.random() * 0.3)
      }
      if (def.pulse) {
        const w = 0.5 + 0.5 * Math.sin(time * (1.3 + (s.seed || 0) * 0.8) + s.phase)
        v *= 0.55 + def.pulse * 0.45 * w
      }
      s.mesh.material.opacity = clamp(v, 0, 1.2)
      s.mesh.visible = v > 0.012
    }

    const lamp = ensureLamp()
    const robot = game.robot
    if (lampOn && robot?.body) {
      const dir = robot.facing || 1
      lamp.position.set(robot.body.x + robot.body.w / 2 + dir * 46, -(robot.body.y + robot.body.h * 0.42), LIGHT_Z + 0.2)
      lamp.material.opacity = clamp(dk * 0.55, 0, 0.75)
      lamp.visible = true
    } else {
      lamp.visible = false
    }

    for (const b of bursts) {
      if (b.t <= 0) {
        b.mesh.visible = false
        continue
      }
      b.t = Math.max(0, b.t - dt)
      const k = b.life > 0 ? b.t / b.life : 0
      b.mesh.material.opacity = b.base * k * k
      b.mesh.visible = k > 0.02
    }
  }

  function clear() {
    clearStatics()
    bursts.length = 0
    roomKey = ''
  }

  function dispose() {
    clear()
    try {
      group.parent?.remove(group)
    } catch (e) {
      /* ignore */
    }
    if (_tex) {
      _tex.dispose()
      _tex = null
    }
  }

  return {
    update,
    buildForRoom,
    flash,
    clear,
    dispose,
    setEnabled(v) {
      enabled = !!v
      group.visible = enabled
    },
    get lightCount() {
      return statics.length
    },
    get darkness() {
      return darkness()
    },
  }
}
