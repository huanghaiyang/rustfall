// 主题 BOSS 招式原子件。
//
// 只提供「弹道 / 预警 / 延时 / 位移 / 召唤」这类最底层能力，
// 具体每个 BOSS 的招式组合写在 theme-boss-kits.js 的 51 个 kit 里。
// 这里不实现任何完整招式，避免招式被复用。
import * as THREE from 'three'
import {
  createTell,
  placeTell,
  showTell,
  disposeTell,
  aoe,
  puff,
  spark,
  sfx,
  shake,
  roomBounds,
} from './common.js'

/** 地面预警圈：到点自动消失；opts.pulse 控制呼吸缩放。 */
export function mark(m, x, y, radius, color, life = 0.7, opts = {}) {
  if (!m || !Number.isFinite(x) || !Number.isFinite(y)) return null
  try {
    const tell = createTell(m, {
      inner: Math.max(4, radius * 0.8),
      outer: Math.max(6, radius),
      color,
      segments: opts.segments ?? 34,
    })
    placeTell(tell, x, y, 1)
    showTell(tell, 0.8)
    const item = { kind: 'tell', tell, t: 0, life, pulse: opts.pulse !== false }
    m._fx.push(item)
    return tell
  } catch (e) {
    return null
  }
}

/** 延时执行；死亡/离开房间时随 _fx 一起清掉。 */
export function after(m, delay, fn) {
  if (!m || typeof fn !== 'function') return
  m._fx.push({ kind: 'timer', t: 0, delay: Math.max(0, delay), fn })
}

/** 每帧推进 _fx。由 ThemeBoss.updateBehavior 调用。 */
export function updateFx(m, dt) {
  const list = m._fx
  if (!list || !list.length) return
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]
    e.t += dt
    if (e.kind === 'timer') {
      if (e.t >= e.delay) {
        list.splice(i, 1)
        try {
          e.fn()
        } catch (err) {
          /* 单个延时回调失败不应打断 BOSS */
        }
      }
      continue
    }
    if (e.kind !== 'tell') continue
    if (e.t >= e.life) {
      disposeTell(m, e.tell)
      list.splice(i, 1)
      continue
    }
    const k = e.t / e.life
    showTell(e.tell, 0.8 * (1 - k * 0.85))
    if (e.pulse) {
      try {
        e.tell.mesh.scale.setScalar(1 + Math.sin(e.t * 20) * 0.05)
      } catch (err) {
        /* ignore */
      }
    }
  }
}

/** 死亡/销毁时清掉所有预警与未触发的延时。 */
export function clearFx(m) {
  if (!m || !m._fx) return
  for (const e of m._fx) {
    if (e.kind === 'tell') disposeTell(m, e.tell)
  }
  m._fx.length = 0
}

export function feetY(m) {
  return m._feetY() - 12
}

/** 从任意点朝目标射一发。 */
export function shot(m, x, y, tx, ty, speed, opts = {}) {
  const dx = tx - x
  const dy = ty - y
  const len = Math.max(1, Math.hypot(dx, dy))
  const a = Math.atan2(dy, dx) + (opts.spread || 0)
  return m._bullet({
    x,
    y,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    gravity: opts.gravity ?? 0,
    radius: opts.radius ?? 5,
    damage: opts.damage ?? m.damage,
    color: opts.color ?? m.accent,
    life: opts.life ?? 1.8,
  })
}

/** 从 BOSS 胸口朝玩家扇形射击。 */
export function fan(m, n, step, speed, opts = {}) {
  const p = m.player
  if (!p) return
  const sx = opts.x ?? m.px
  const sy = opts.y ?? m.py - m.h * 0.18
  const dx = p.centerX - sx
  const dy = p.centerY - 8 - sy
  const base = Math.atan2(dy, dx)
  for (let k = 0; k < n; k++) {
    const a = base + (k - (n - 1) / 2) * step
    m._bullet({
      x: sx,
      y: sy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      gravity: opts.gravity ?? 0,
      radius: opts.radius ?? 5,
      damage: opts.damage ?? m.damage,
      color: opts.color ?? m.accent,
      life: opts.life ?? 1.8,
    })
  }
}

/** 环形弹幕，phase 控制起始角错位。 */
export function ring(m, n, speed, opts = {}) {
  const x = opts.x ?? m.px
  const y = opts.y ?? m.py - m.h * 0.1
  const off = opts.offset ?? 0
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + off
    m._bullet({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      gravity: opts.gravity ?? 0,
      radius: opts.radius ?? 5,
      damage: opts.damage ?? m.damage * 0.8,
      color: opts.color ?? m.accent,
      life: opts.life ?? 1.6,
    })
  }
}

/** 抛物线投掷：按 opts.t 秒后落在 (tx, ty)。 */
export function lob(m, tx, ty, opts = {}) {
  const T = Math.max(0.2, opts.t ?? 0.95)
  const g = opts.gravity ?? 900
  const x = opts.x ?? m.px
  const y = opts.y ?? m.py - m.h * 0.85
  return m._bullet({
    x,
    y,
    vx: (tx - x) / T,
    vy: ((ty - y) - 0.5 * g * T * T) / T,
    gravity: g,
    radius: opts.radius ?? 7,
    damage: opts.damage ?? m.damage,
    color: opts.color ?? m.accent,
    life: opts.life ?? T + 1.1,
  })
}

/** 贴地冲击波：必须跳起来躲的那一类。 */
export function groundWave(m, dir, speed, opts = {}) {
  const y = m._feetY() - 14
  return m._bullet({
    x: m.px + dir * 22,
    y,
    vx: dir * speed,
    vy: 0,
    gravity: 0,
    radius: opts.radius ?? 12,
    damage: opts.damage ?? m.damage * 0.8,
    color: opts.color ?? m.accent,
    life: opts.life ?? 2.1,
  })
}

/** 把玩家往某个方向推开 / 拽起。 */
export function pushPlayer(m, sign, vx = 420, lift = 110, dx = 18) {
  const p = m.player
  if (!p || p.dead) return
  try {
    p.body.vx += sign * vx
    p.body.vy = Math.min(p.body.vy, -lift)
    p.body.x += sign * dx
  } catch (e) {
    /* ignore */
  }
}

/** 预判玩家 t 秒后的 x。 */
export function predictX(m, t = 0.4) {
  const p = m.player
  if (!p) return m.px
  return p.centerX + (p.body?.vx || 0) * t
}

export function clampW(m, x, pad = 46) {
  const { w } = roomBounds(m)
  return Math.max(pad, Math.min(w - pad, x))
}

/** 冲击命中 + 尘土 + 火花 + 震屏的组合件。 */
export function burst(m, x, y, radius, opts = {}) {
  aoe(m, x, y, radius, opts.damage ?? m.damage)
  puff(m, opts.puff ?? 16, opts.dust ?? 0x6b5f55, 1.4)
  spark(m, x, y, opts.color ?? m.accent, opts.sparks ?? 14, opts.spread ?? 280)
  shake(m, opts.shake ?? 0.45)
  if (opts.sound !== false) sfx(m, opts.sound ?? 'thunder', 0.45, 1.1)
}

/** 沿线段撒火花（电弧 / 激光轨迹用）。 */
export function sparkLine(m, x0, y0, x1, y1, color, n = 9, spread = 130) {
  for (let k = 0; k <= n; k++) {
    const t = k / n
    spark(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color, 2, spread)
  }
}

/** 召唤一批小怪（保留原有 spark + radio 演出）。 */
export function summonWave(m, n, opts = {}) {
  const d = m.game?.director
  if (!d || typeof d.spawn !== 'function') return
  const ids = opts.ids || m.cfg?.summonIds || []
  if (!ids.length) return
  const base = opts.base ?? 96
  const gap = opts.gap ?? 46
  for (let k = 0; k < n; k++) {
    const id = ids[(k + (opts.first ?? 0)) % ids.length]
    const side = k % 2 ? 1 : -1
    try {
      d.spawn(id, m.px + side * (base + Math.floor(k / 2) * gap), 0)
    } catch (e) {
      /* ignore */
    }
  }
  spark(m, m.px, m.py, opts.color ?? m.accent, opts.sparks ?? 20, 260)
  sfx(m, opts.sound ?? 'radio', 0.4, 0.8)
}

/** 进入现有 charge 状态；具体冲刺演出由各 kit 自己补。 */
export function chargeAt(m, opts = {}) {
  m.chargeT = opts.hold ?? 0.62
  m.state = 'charge'
  m.stateT = 0
  m.vxTarget = m.facing * m.speed * (opts.boost ?? 3.2)
  m.body.vy = -120
  puff(m, opts.puff ?? 14, 0x6b5f55, 1.2)
  sfx(m, opts.sound ?? 'growl', 0.5, 0.8)
}

export { THREE }
