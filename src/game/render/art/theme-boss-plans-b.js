// 主题 BOSS 体型 B：漂浮核心 / 环形体 / 晶体巨像 / 石像
import { PAL } from '../palette.js'
import { mix } from './core.js'
import { baseShadow, bob, crest, core, orb, rivets, bentLimb, TAU } from './theme-boss-parts.js'

/** 用一串圆点画环（可以倾斜）。 */
function ring(s, cx, cy, rx, ry, thick, c, steps = 34, alpha = 1) {
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU
    s.disc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, thick, c, alpha)
  }
}

/* ------------------------------------------------------------------ 漂浮核心 */
export function planCoreOrb(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const hover = g - h * 0.52 + bob(P, 3)
  const atk = P.anim === 'attack'
  const spin = (P.i / (P.anim === 'move' ? 3 : 2)) * TAU
  baseShadow(s, def, cx)

  // ---- 垂下的线缆 / 触须（落在地上，给悬浮体一个锚）
  for (let i = 0; i < 4; i++) {
    const ox = cx - w * 0.16 + i * w * 0.11
    const sw = Math.sin(P.i * 1.3 + i) * 3
    s.thick(ox, hover + h * 0.14, ox + sw, g - h * 0.1, 1.6, pal.bodyD)
    s.thick(ox + sw, g - h * 0.1, ox + sw * 1.6, g - 2, 1.2, pal.plateD)
    s.px(ox + sw * 1.6, g - 2, pal.accent, 0.6)
  }

  // ---- 外壳：分层的球体（暗壳 + 亮缘）
  const R = w * 0.23
  s.ell(cx, hover, R, R * 0.94, pal.bodyD)
  s.ell(cx - R * 0.14, hover - R * 0.2, R * 0.72, R * 0.6, pal.body, 0.95)
  // 外壳板缝（三块）
  s.line(cx - R, hover - R * 0.3, cx + R * 0.9, hover + R * 0.2, pal.plateD, 0.7)
  s.line(cx - R * 0.2, hover - R, cx - R * 0.1, hover + R * 0.9, pal.plateD, 0.5)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.4
    s.px(cx + Math.cos(a) * R * 0.82, hover + Math.sin(a) * R * 0.8, pal.plate, 0.8)
  }

  // ---- 环：两条倾斜轨道 + 上面跑的轨道球
  const rx = R * (atk ? 1.75 : 1.45)
  const ry = R * (atk ? 0.62 : 0.4)
  ring(s, cx, hover + 2, rx, ry, atk ? 1.8 : 1.3, pal.trim, 40, 0.9)
  ring(s, cx, hover - 2, rx * 0.72, ry * 1.35, 1.1, pal.accent, 36, 0.65)
  for (let k = 0; k < 3; k++) {
    const a = spin + (k / 3) * TAU
    const sx = cx + Math.cos(a) * rx
    const sy = hover + 2 + Math.sin(a) * ry
    s.disc(sx, sy, 2.6, pal.trim)
    s.px(sx, sy - 1, PAL.white)
  }

  // ---- 内核：高饱和发光球（弱点）
  core(s, P, cx, hover, R * (atk ? 0.55 : 0.42), pal.core, atk ? 1.6 : 1.1, P)
  s.disc(cx, hover, R * 0.18, PAL.white, 0.9)

  // ---- 攻击：环外放射短光刺
  if (atk) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU
      s.thick(
        cx + Math.cos(a) * R * 0.5,
        hover + Math.sin(a) * R * 0.5,
        cx + Math.cos(a) * R * 1.5,
        hover + Math.sin(a) * R * 1.5,
        1.2,
        pal.accent,
        0.8,
      )
    }
  }

  // ---- 顶部冠饰 / 底部配重块
  crest(s, cx, hover - R * 0.96, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 140)
  s.rect(cx - w * 0.05, hover + R * 0.86, w * 0.1, h * 0.03, pal.plateD)
  rivets(s, cfg.rng, cx - w * 0.04, hover + R * 0.87, w * 0.08, 3, pal.plate)
}

/* ------------------------------------------------------------------ 环形体 */
export function planDroneRing(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const hover = g - h * 0.58 + bob(P, 3)
  const atk = P.anim === 'attack'
  const tilt = Math.sin((P.i / (P.anim === 'move' ? 3 : 2)) * TAU) * 0.18
  baseShadow(s, def, cx)

  // ---- 下垂的机械臂（3 条，末端是工具）
  for (let i = 0; i < 3; i++) {
    const ox = cx - w * 0.13 + i * w * 0.13
    const sw = Math.sin(P.i * 1.1 + i * 2) * 2
    const endY = g - h * (0.12 + (atk ? 0.05 : 0)) - i * 3
    s.thick(ox, hover + h * 0.1, ox + sw, hover + h * 0.24, 1.7, pal.plateD)
    s.disc(ox + sw, hover + h * 0.24, 2.2, pal.plate)
    s.thick(ox + sw, hover + h * 0.24, ox + sw * 1.5, endY, 1.2, pal.bodyD)
    // 末端工具：钳 / 针 / 钻
    if (i === 0) {
      s.thick(ox + sw * 1.5, endY, ox + sw * 1.5 + 4, endY - 3, 1.2, pal.trim)
      s.thick(ox + sw * 1.5, endY, ox + sw * 1.5 + 4, endY + 3, 1.2, pal.trim)
    } else if (i === 1) {
      s.thick(ox + sw * 1.5, endY, ox + sw * 1.5 + 2, endY + 7, 0.9, pal.trim)
      s.px(ox + sw * 1.5 + 2, endY + 7, pal.accent)
    } else {
      s.disc(ox + sw * 1.5, endY + 2, 2.6, pal.plate)
      s.px(ox + sw * 1.5 + 1, endY + 5, pal.accent)
    }
  }

  // ---- 主环：外环 + 内环 + 连接辐条
  const R = w * 0.26
  const ry = R * (0.42 + tilt)
  ring(s, cx, hover, R, ry, 2.4, pal.bodyD, 44)
  ring(s, cx, hover, R - 3, ry - 2, 1.3, pal.plate, 44, 0.9)
  for (let i = 0; i < 4; i++) {
    const a = tilt + (i / 4) * TAU
    s.thick(cx, hover, cx + Math.cos(a) * R * 0.92, hover + Math.sin(a) * ry * 0.92, 1.2, pal.plateD)
  }
  // 环上的信号灯
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - tilt
    s.px(cx + Math.cos(a) * R * 0.82, hover + Math.sin(a) * ry * 0.82, pal.accent)
  }

  // ---- 中央眼：主眼 + 上下副眼
  s.ell(cx, hover, R * 0.46, R * (0.3 + tilt), pal.body)
  s.ell(cx, hover, R * 0.34, R * 0.22, pal.bodyD)
  core(s, P, cx, hover, R * (atk ? 0.34 : 0.22), pal.core, atk ? 1.6 : 1, P)
  s.px(cx, hover, PAL.white)
  for (const dy of [-1, 1]) {
    orb(s, cx + R * 0.02, hover + dy * R * 0.42, 2.4, pal.accent, pal.bodyD, PAL.white)
  }

  // ---- 攻击：眼射出的锥形光束
  if (atk) {
    s.poly(
      [
        [cx + R * 0.2, hover - 3],
        [cx + R * 1.7, hover - 9],
        [cx + R * 1.7, hover + 9],
        [cx + R * 0.2, hover + 3],
      ],
      pal.accent,
      0.35,
    )
    s.line(cx + R * 0.2, hover, cx + R * 1.6, hover, PAL.white, 0.75)
    core(s, P, cx + R * 1.55, hover, w * 0.05, pal.core, 1.4, P)
  }

  // ---- 顶部天线碟 + 侧挂推进器
  crest(s, cx, hover - R * 0.92, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 140)
  for (const dx of [-1, 1]) {
    s.rect(cx + dx * R * 0.9 - 3, hover - 6, 6, 12, pal.plateD)
    s.rect(cx + dx * R * 0.9 - 2, hover - 4, 4, 8, pal.body)
    s.px(cx + dx * R * 0.9, hover + 6, pal.accent, 0.8)
  }
}

/* ------------------------------------------------------------------ 晶体巨像 */
export function planCrystalHusk(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const by = bob(P, 1.5)
  const atk = P.anim === 'attack'
  baseShadow(s, def, cx)

  // ---- 底盘：根系晶体插进地面
  for (let i = 0; i < 5; i++) {
    const ox = cx - w * 0.2 + i * w * 0.1
    s.poly(
      [
        [ox, g],
        [ox + 4, g - h * (0.12 + (i % 2) * 0.04)],
        [ox + 9, g],
      ],
      i % 2 ? pal.bodyD : pal.body,
    )
  }

  // ---- 躯干：三层晶体柱，越往上越窄
  const baseY = g - h * 0.06
  s.poly(
    [
      [cx - w * 0.26, baseY],
      [cx - w * 0.2, baseY - h * 0.34],
      [cx + w * 0.2, baseY - h * 0.34],
      [cx + w * 0.26, baseY],
    ],
    pal.body,
  )
  s.poly(
    [
      [cx - w * 0.17, baseY - h * 0.3],
      [cx - w * 0.12, baseY - h * 0.52],
      [cx + w * 0.13, baseY - h * 0.52],
      [cx + w * 0.18, baseY - h * 0.3],
    ],
    pal.bodyD,
  )
  // 晶体切面高光（斜线）
  s.line(cx - w * 0.18, baseY - 2, cx - w * 0.13, baseY - h * 0.3, pal.bodyL, 0.45)
  s.line(cx + w * 0.19, baseY - 2, cx + w * 0.14, baseY - h * 0.3, pal.bodyD, 0.7)
  s.line(cx - w * 0.15, baseY - h * 0.3, cx - w * 0.1, baseY - h * 0.5, pal.bodyL, 0.35)
  // 内部裂纹发光
  s.line(cx - 4, baseY - h * 0.06, cx + 6, baseY - h * 0.28, pal.accent, 0.55)
  s.line(cx + 6, baseY - h * 0.28, cx - 2, baseY - h * 0.46, pal.accent, 0.4)

  // ---- 核心：胸腔里的发光结晶
  core(s, P, cx + w * 0.01, baseY - h * 0.34, w * (atk ? 0.1 : 0.07), pal.core, atk ? 1.7 : 1.1, P)

  // ---- 头部：棱锥晶体 + 冠饰
  const hdY = baseY - h * 0.55
  s.poly(
    [
      [cx - w * 0.1, hdY + h * 0.03],
      [cx - w * 0.05, hdY - h * 0.06],
      [cx + w * 0.07, hdY - h * 0.05],
      [cx + w * 0.11, hdY + h * 0.03],
    ],
    pal.body,
  )
  s.line(cx - w * 0.05, hdY - h * 0.06, cx + w * 0.11, hdY + h * 0.03, pal.bodyL, 0.5)
  s.rect(cx - w * 0.02, hdY - h * 0.02, w * 0.08, 2.4, pal.accent)
  crest(s, cx + w * 0.01, hdY - h * 0.06, cfg.crest, pal.bodyL, pal.bodyD, pal.accent, w / 140)

  // ---- 悬浮碎晶（围绕身体，帧间漂浮）
  const shards = [
    [-w * 0.36, -h * 0.36],
    [w * 0.34, -h * 0.48],
    [-w * 0.3, -h * 0.62],
    [w * 0.28, -h * 0.2],
  ]
  for (let i = 0; i < shards.length; i++) {
    const sx = cx + shards[i][0]
    const sy = baseY + shards[i][1] + Math.sin(P.i * 1.2 + i) * 3 + by * 0.5
    const sz = 4 + (i % 2) * 3 + (atk ? 3 : 0)
    s.poly([[sx, sy - sz], [sx + sz * 0.6, sy], [sx, sy + sz * 0.8], [sx - sz * 0.6, sy]], pal.trim, 0.9)
    s.px(sx, sy - sz * 0.4, PAL.white, 0.7)
  }

  // ---- 双臂：晶体刃（前臂抬起）
  for (let i = 0; i < 2; i++) {
    const dx = i === 0 ? -1 : 1
    const sy = baseY - h * (i === 0 ? 0.26 : 0.32)
    const sx = cx + dx * w * 0.24
    s.thick(cx + dx * w * 0.14, baseY - h * 0.4, sx, sy, 3, pal.bodyD)
    const tipY = sy - h * (atk ? 0.12 : 0.06)
    s.poly(
      [
        [sx, sy],
        [sx + dx * w * 0.14, tipY],
        [sx + dx * w * 0.03, tipY + h * 0.04],
      ],
      i === 0 ? pal.bodyD : pal.body,
    )
    s.line(sx, sy, sx + dx * w * 0.14, tipY, pal.trim, 0.6)
  }
}

/* ------------------------------------------------------------------ 石像 */
export function planGravenStatue(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const by = atk ? -4 - P.i * 2 : bob(P, 0.8)
  baseShadow(s, def, cx)

  // ---- 台座：两级石阶（移动时不迈腿，整座滑移）
  s.rect(cx - w * 0.28, g - h * 0.1, w * 0.56, h * 0.1, pal.plateD)
  s.rect(cx - w * 0.28, g - h * 0.1, w * 0.56, 2, pal.plate)
  s.rect(cx - w * 0.22, g - h * 0.14, w * 0.44, h * 0.045, pal.bodyD)
  for (let i = 0; i < 4; i++) s.px(cx - w * 0.2 + i * w * 0.13, g - h * 0.06, pal.plate, 0.7)

  // ---- 下身：石袍（垂直褶皱）
  const bodyY = g - h * 0.14
  s.poly(
    [
      [cx - w * 0.24, bodyY],
      [cx - w * 0.16, bodyY - h * 0.36 + by],
      [cx + w * 0.17, bodyY - h * 0.36 + by],
      [cx + w * 0.25, bodyY],
    ],
    pal.body,
  )
  for (let i = 0; i < 5; i++) {
    const fx = cx - w * 0.19 + i * w * 0.095
    s.line(fx, bodyY - 2, fx + (i - 2) * 1.6, bodyY - h * 0.34 + by, pal.bodyD, 0.55)
  }
  // 断裂缺口
  const rnd = cfg.rng
  for (let i = 0; i < 5; i++) {
    s.px(cx - w * 0.2 + rnd() * w * 0.4, bodyY - rnd() * h * 0.3, PAL.void, 0.35)
  }

  // ---- 胸：石板 + 发光裂缝
  const chY = bodyY - h * 0.36 + by
  s.poly(
    [
      [cx - w * 0.16, chY],
      [cx - w * 0.13, chY - h * 0.16],
      [cx + w * 0.14, chY - h * 0.16],
      [cx + w * 0.17, chY],
    ],
    pal.bodyD,
  )
  s.line(cx - w * 0.1, chY - 2, cx + w * 0.02, chY - h * 0.1, pal.accent, 0.7)
  s.line(cx + w * 0.02, chY - h * 0.1, cx + w * 0.09, chY - h * 0.04, pal.accent, 0.5)
  core(s, P, cx + w * 0.02, chY - h * 0.07, w * (atk ? 0.045 : 0.03), pal.core, 1, P)

  // ---- 头：方石首 + 冠饰
  const hdY = chY - h * 0.16
  s.rect(cx - w * 0.075, hdY - h * 0.07, w * 0.16, h * 0.08, pal.body)
  s.rect(cx - w * 0.075, hdY - h * 0.07, w * 0.16, 1.6, pal.bodyL)
  s.rect(cx - w * 0.05, hdY - h * 0.045, w * 0.1, 2.2, atk ? pal.accent : pal.bodyD)
  s.px(cx - w * 0.03, hdY - h * 0.04, pal.accent, 0.8)
  crest(s, cx, hdY - h * 0.07, cfg.crest, pal.bodyL, pal.bodyD, pal.accent, w / 140)

  // ---- 双臂：抱胸 / 抬臂（攻击）
  const shY = chY - h * 0.13
  for (let i = 0; i < 2; i++) {
    const dx = i === 0 ? -1 : 1
    const sx = cx + dx * w * 0.14
    const hy = atk ? shY - h * 0.22 : chY - h * 0.02
    const hx = atk ? cx + dx * w * 0.2 : cx + dx * w * 0.03
    s.thick(sx, shY, hx, hy, 4.2, pal.bodyD)
    s.rect(hx - 3.5, hy - 3, 7, 7, pal.body)
    s.px(hx + dx * 2, hy, pal.accent, 0.6)
  }
  // 前手武器（石杖 / 剑）
  if (cfg.weapon === 4) {
    const sx = cx + w * 0.22
    const sy = atk ? shY - h * 0.2 : chY
    s.thick(sx - w * 0.08, sy + h * 0.16, sx, sy - h * 0.2, 1.8, pal.plateD)
    s.poly([[sx, sy - h * 0.24], [sx + 5, sy - h * 0.2], [sx, sy - h * 0.16]], pal.accent)
  }

  // ---- 苔痕 / 风化
  for (let i = 0; i < 8; i++) {
    s.px(cx - w * 0.22 + rnd() * w * 0.44, bodyY - rnd() * h * 0.5, PAL.weed, 0.18)
  }
}
