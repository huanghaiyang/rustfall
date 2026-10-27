import * as THREE from 'three'
import * as monsterArt from '../../../render/art/monsters.js'

/**
 * 大型敌人公共工具（junk_golem / sky_warden / mimic_beast / swarm_core 共用）。
 *
 * 这里只放「和引擎打交道」以及「舞台演出」的通用件，不实现任何具体 AI：
 *   · applyLargeArt   —— 尝试 getLargeMonsterArt(id)，失败退回 getMonsterArt('hulkbot')
 *   · initLarge       —— 补 py 战斗中心、player 兼容、巡逻点、激活范围等字段
 *   · aoe / puff / spark / sfx / shake / dropExtra —— 全防御式调用引擎
 *   · createTell / placeTell / showTell —— 程序化前摇提示环（不依赖美术）
 *   · updateActivation / roamStep —— 房间内游荡 + 800px 激活（director 只负责发巡逻点）
 *   · largeDeathFx    —— 出场/死亡演出的统一大特效
 */

export const LARGE_ART_FALLBACK = 'hulkbot'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export { clamp }

/** 引擎里玩家叫 robot；老代码/工具里叫 player。两种都认。 */
export function getPlayer(m) {
  const g = m && m.game
  if (!g) return null
  return g.player || g.robot || null
}

export function roomBounds(m) {
  const d = m?.game?.room?.data || {}
  return {
    w: d.worldW || m?.game?.roomW || 4000,
    h: d.worldH || m?.game?.roomH || 2400,
  }
}

// ---------------------------------------------------------------------------
// 美术：getLargeMonsterArt 由美术同学提供；没有就退回 hulkbot 的贴图
// ---------------------------------------------------------------------------

function tryLargeArt(id) {
  try {
    if (typeof monsterArt.getLargeMonsterArt === 'function') {
      const a = monsterArt.getLargeMonsterArt(id)
      if (a && a.frames) return a
    }
  } catch (e) {
    /* 美术模块可能还没实现大怪，静默降级 */
  }
  return null
}

/**
 * 换用大型敌人美术。
 * BaseMonster 构造时会用 getMonsterArt(def.artId) 建好 mesh——未知 id 时美术模块会
 * 退回 crawler 尺寸，所以这里重建几何尺寸并替换帧；找不到美术就保持基类兜底色块。
 */
export function applyLargeArt(m) {
  const id = String(m?.def?.artId || m?.def?.id || '')
  let art = tryLargeArt(id)
  if (!art) {
    try {
      const fb = monsterArt.getMonsterArt(LARGE_ART_FALLBACK)
      if (fb && fb.frames) art = fb
    } catch (e) {
      art = null
    }
  }
  if (!art || !m.mesh) return false

  const frames = art.frames || null
  // 显示尺寸：美术给的够大就用美术尺寸；太小（例如退回 hulkbot 88×64）
  // 就拉伸到 DEF 尺寸——大怪首先得「看起来大」，否则玩家读不对手感。
  let dw = Number(art.w) || m.spriteW || m.w
  let dh = Number(art.h) || m.spriteH || m.h
  if (!(dw >= m.w * 0.55)) dw = m.w + 8
  if (!(dh >= m.h * 0.55)) dh = m.h + 10

  m.art = art
  m.frames = frames
  m.spriteW = dw
  m.spriteH = dh

  const geo = m.mesh.geometry
  const gw = geo?.parameters?.width
  const gh = geo?.parameters?.height
  if (Math.abs((gw || 0) - dw) > 0.5 || Math.abs((gh || 0) - dh) > 0.5) {
    m.mesh.geometry = new THREE.PlaneGeometry(dw, dh)
    try {
      geo?.dispose?.()
    } catch (e) {
      /* ignore */
    }
  }
  const tex = frames?.idle?.[0] || null
  if (m.mat && tex) {
    m.mat.map = tex
    m.mat.color.setHex(0xffffff)
    m.mat.needsUpdate = true
  }
  return true
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * @param {object} m     大型敌人实例（已 super() 完成）
 * @param {object} opts  { intro, activateRange, deactivateRange, combatOffset }
 */
export function initLarge(m, opts = {}) {
  m.isLarge = true
  m.elite = true
  m.activated = false
  m.introT = opts.intro ?? 1.25
  m.introDur = m.introT
  m.state = m.introT > 0 ? 'intro' : 'roam'
  m.stateT = 0
  m.patrol = []
  m.patrolIdx = 0
  m.patrolWait = 0
  m.activateRange = opts.activateRange ?? 800
  m.deactivateRange = opts.deactivateRange ?? 1200
  m.combatT = 0
  m.deadEmitted = false
  m.phase = 1

  try {
    // 兼容引擎的 game.robot 命名（base.js 的 get player 只读 game.player）
    Object.defineProperty(m, 'player', {
      configurable: true,
      get() {
        const g = m.game
        return (g && (g.player || g.robot)) || null
      },
    })
    // 战斗中心下移：大怪身体很高，玩家站在地面也该能挥到它
    Object.defineProperty(m, 'py', {
      configurable: true,
      get() {
        const b = m.body
        return b.y + b.h - Math.min(m.h * 0.34, 62)
      },
    })
  } catch (e) {
    /* 极端情况下允许失败 */
  }

  /** director 发巡逻点；房间内来回走，不会追出房间 */
  m.setPatrol = (points) => {
    const list = Array.isArray(points) ? points : []
    m.patrol = list.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    m.patrolIdx = 0
    m.patrolWait = 0.6 + Math.random() * 1.2
  }

  m.isActivated = () => m.activated

  return m
}

// ---------------------------------------------------------------------------
// 引擎交互（全部防御式）
// ---------------------------------------------------------------------------

export function sfx(m, name, vol = 0.5, rate = 1) {
  try {
    m.game?.sfx?.(name, { vol, rate })
  } catch (e) {
    /* ignore */
  }
}

export function shake(m, amount = 0.3) {
  const g = m?.game
  if (!g) return
  try {
    if (typeof g.cameraShake === 'function') g.cameraShake(amount)
    else if (typeof g.shake === 'function') g.shake(amount)
  } catch (e) {
    /* ignore */
  }
}

export function puff(m, n = 8, color = 0x93a8b2, size = 1) {
  const parts = m?.game?.particles
  if (!parts) return
  const cx = m.px
  const cy = m.body.y + m.body.h
  for (let i = 0; i < n; i++) {
    try {
      const emit = parts.emit || parts.emitMany
      if (typeof emit !== 'function') break
      emit.call(parts, 'dust', cx + (Math.random() - 0.5) * m.w, cy, {
        vx: (Math.random() - 0.5) * 260,
        vy: -Math.random() * 140,
        life: 0.4 + Math.random() * 0.5,
        size: size * (0.7 + Math.random() * 0.9),
        color,
      })
    } catch (e) {
      break
    }
  }
}

export function spark(m, x, y, color = 0xe5a33c, n = 8, spread = 240) {
  const parts = m?.game?.particles
  if (!parts) return
  for (let i = 0; i < n; i++) {
    try {
      const emit = parts.emit || parts.emitMany
      if (typeof emit !== 'function') break
      emit.call(parts, 'spark', x, y, {
        vx: (Math.random() - 0.5) * spread,
        vy: (Math.random() - 0.5) * spread,
        life: 0.18 + Math.random() * 0.28,
        size: 0.5 + Math.random() * 0.8,
        color,
      })
    } catch (e) {
      break
    }
  }
}

export function aoe(m, x, y, radius, dmg) {
  const g = m?.game
  let handled = false
  if (g && typeof g.damageArea === 'function') {
    try {
      g.damageArea(x, y, radius, dmg)
      handled = true
    } catch (e) {
      handled = false
    }
  }
  if (handled) return
  const p = m.player
  if (!p || p.dead || p.invuln > 0) return
  const dx = (p.centerX ?? 0) - x
  const dy = (p.centerY ?? 0) - y
  if (dx * dx + dy * dy <= radius * radius && typeof p.takeDamage === 'function') {
    try {
      p.takeDamage(dmg, x)
    } catch (e) {
      /* ignore */
    }
  }
}

/** 批量补掉落（死亡演出用） */
export function dropExtra(m, list) {
  const g = m?.game
  if (!g || typeof g.dropLoot !== 'function') return
  for (const item of list || []) {
    const n = item.n ?? 1
    for (let i = 0; i < n; i++) {
      try {
        g.dropLoot(item.id, m.px + (Math.random() - 0.5) * (item.spread ?? 90), m.body.y + m.body.h - 20, {
          vx: (Math.random() - 0.5) * 180,
          vy: -130 - Math.random() * 110,
        })
      } catch (e) {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 前摇提示环（程序化，无贴图依赖）
// ---------------------------------------------------------------------------

export function createTell(m, opts = {}) {
  const inner = opts.inner ?? 26
  const outer = opts.outer ?? 38
  const color = opts.color ?? 0xe5a33c
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, opts.segments ?? 26, 1), mat)
  mesh.renderOrder = 6
  mesh.visible = false
  m.group.add(mesh)
  return { mesh, mat, inner, outer, baseScale: 1 }
}

export function placeTell(tell, x, y, scale = 1) {
  if (!tell) return
  tell.mesh.position.set(x, -y, 3.1)
  tell.mesh.scale.setScalar(scale)
}

export function showTell(tell, opacity) {
  if (!tell) return
  tell.mat.opacity = opacity
  tell.mesh.visible = opacity > 0.02
}

export function disposeTell(m, tell) {
  if (!tell) return
  try {
    m.group.remove(tell.mesh)
    tell.mesh.geometry.dispose()
    tell.mat.dispose()
  } catch (e) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// 游荡 / 激活
// ---------------------------------------------------------------------------

/**
 * 玩家进入 activateRange 才激活；离太远自动回到游荡。
 * @returns {boolean} 是否处于激活（战斗）状态
 */
export function updateActivation(m, dt) {
  const p = m.player
  const d = p && !p.dead ? m.distToPlayer() : Infinity
  if (m.activated) {
    if (d > m.deactivateRange) {
      m.activated = false
      m.state = 'roam'
      m.stateT = 0
    }
  } else if (d < m.activateRange && p && !p.dead) {
    m.activated = true
    m.state = 'alert'
    m.stateT = 0
    sfx(m, 'growl', 0.6, 0.72)
    shake(m, 0.2)
  }
  return m.activated
}

/** 地面大怪的巡逻：走向巡逻点，到达后停一会，遇墙换点 */
export function roamStep(m, dt, opts = {}) {
  const patrol = m.patrol || []
  if (!patrol.length) {
    m.vxTarget = 0
    m.playAnim('idle')
    return
  }
  const pt = patrol[m.patrolIdx % patrol.length]
  const dx = pt.x - m.px
  if (Math.abs(dx) < 26) {
    m.vxTarget = 0
    m.playAnim('idle')
    m.patrolWait -= dt
    if (m.patrolWait <= 0) {
      m.patrolIdx = (m.patrolIdx + 1) % patrol.length
      m.patrolWait = 1.2 + Math.random() * 1.8
    }
    return
  }
  const dir = dx > 0 ? 1 : -1
  m.facing = dir
  const mul = opts.speedMul ?? 0.5
  m.vxTarget = dir * m.speed * mul
  m.playAnim('run')
  if (m.wallAhead(dir) || !m.groundAhead(dir)) {
    m.vxTarget = 0
    m.patrolIdx = (m.patrolIdx + 1) % patrol.length
    m.patrolWait = 0.8
    m.facing = -dir
  }
}

// ---------------------------------------------------------------------------
// 演出
// ---------------------------------------------------------------------------

/** 入场：1.25s 内站起来/降落，尘土 + 屏幕震动 + 低频吼声 */
export function playIntro(m, dt, opts = {}) {
  if (m.introT <= 0) return false
  m.introT -= dt
  m.vxTarget = 0
  m.playAnim('idle')
  if (Math.random() < dt * 22) puff(m, 2, opts.dust ?? 0x93a8b2, 1.1)
  if (m.introT <= 0) {
    m.introT = 0
    m.state = 'roam'
    m.stateT = 0
    shake(m, opts.shake ?? 0.4)
    sfx(m, opts.sound ?? 'growl', 0.7, 0.62)
    puff(m, 16, opts.dust ?? 0xb7924f, 1.5)
  }
  return true
}

/** 死亡演出：大爆炸 + 掉一地战利品 */
export function largeDeathFx(m, opts = {}) {
  const x = m.px
  const y = m.body.y + m.body.h * 0.6
  puff(m, opts.particles ?? 30, opts.color ?? 0x6b5f55, 1.8)
  spark(m, x, y, 0xffd0b0, opts.sparks ?? 22, 340)
  shake(m, opts.shake ?? 0.75)
  sfx(m, opts.sound ?? 'thunder', opts.vol ?? 0.65, opts.rate ?? 0.8)
  if (opts.aoeRadius) aoe(m, x, y, opts.aoeRadius, opts.aoeDamage ?? 0)
  if (opts.extraLoot) dropExtra(m, opts.extraLoot)
}

/**
 * 线形激光命中判定：玩家中心到线段的距离 <= halfWidth 即命中。
 */
export function beamHitsPlayer(m, x0, y0, x1, y1, halfWidth = 16) {
  const p = m.player
  if (!p || p.dead) return false
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy || 1
  const t = clamp(((p.centerX - x0) * dx + (p.centerY - y0) * dy) / len2, 0, 1)
  const cx = x0 + dx * t
  const cy = y0 + dy * t
  return Math.hypot(p.centerX - cx, p.centerY - cy) <= halfWidth
}

/** 把 1×1 面片摆成线段（线性激光/预警线用） */
export function placeSegment(mesh, x0, y0, x1, y1, thickness = 3) {
  if (!mesh) return
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.max(1, Math.hypot(dx, dy))
  mesh.position.set((x0 + x1) * 0.5, -(y0 + y1) * 0.5, 3.6)
  mesh.rotation.z = Math.atan2(-dy, dx)
  mesh.scale.set(len, thickness, 1)
}

/** 玩家是否在正前方（用于弱点/处决判定） */
export function isInFront(m, x) {
  return (x - m.px) * m.facing > 0
}

export function distTo(m, x, y) {
  return Math.hypot(m.px - x, (m.body.y + m.body.h) - y)
}

export { THREE }
