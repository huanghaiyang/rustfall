// 主题 BOSS 体型 C：亡魂斗篷 / 无定形肉块 / 虫形 / 植物母体 / 翼魔
import { PAL } from '../palette.js'
import { mix } from './core.js'
import { baseShadow, bob, legPhase, crest, core, orb, bentLimb, rags, accessoryPlant, accessoryWraith, TAU } from './theme-boss-parts.js'

/* ------------------------------------------------------------------ 亡魂斗篷 */
export function planWraithCloak(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const hover = g - h * 0.1 + bob(P, 3)
  const atk = P.anim === 'attack'
  const shY = hover - h * 0.46
  baseShadow(s, def, cx)
  accessoryWraith(s, cfg, pal, cx, shY, h, w)

  // ---- 下摆：漂浮的破布尖（不落地，留一道影）
  const hemY = hover - h * 0.02
  for (let i = 0; i < 7; i++) {
    const ox = cx - w * 0.24 + i * w * 0.08
    const len = h * (0.06 + (i % 3) * 0.035) + Math.sin(P.i * 1.1 + i) * 3
    s.poly(
      [
        [ox - w * 0.045, hemY],
        [ox + w * 0.045, hemY],
        [ox + Math.sin(P.i + i) * 4, hemY + len],
      ],
      i % 2 ? pal.bodyD : pal.body,
      0.95,
    )
  }
  // 下摆内的虚空（深紫，不是纯黑）
  s.ell(cx, hemY - h * 0.02, w * 0.19, h * 0.02, mix(pal.bodyD, PAL.void, 0.5), 0.9)

  // ---- 袍身：上窄下宽的斗篷
  s.poly(
    [
      [cx - w * 0.26, hemY],
      [cx - w * 0.19, shY + h * 0.04],
      [cx + w * 0.19, shY + h * 0.04],
      [cx + w * 0.26, hemY],
    ],
    pal.body,
  )
  // 褶皱
  for (let i = 0; i < 4; i++) {
    const fx = cx - w * 0.16 + i * w * 0.105
    s.line(fx, shY + h * 0.05, fx + (i - 1.5) * 3, hemY - 2, pal.bodyD, 0.55)
  }
  // 领口 / 肩披
  s.poly(
    [
      [cx - w * 0.2, shY + h * 0.05],
      [cx - w * 0.12, shY - h * 0.02],
      [cx + w * 0.12, shY - h * 0.02],
      [cx + w * 0.2, shY + h * 0.05],
    ],
    pal.bodyD,
  )
  s.line(cx - w * 0.16, shY - h * 0.01, cx + w * 0.16, shY - h * 0.01, pal.trim, 0.35)

  // ---- 兜帽 + 虚空面 + 发光眼
  const hdY = shY - h * 0.035
  s.poly(
    [
      [cx - w * 0.13, hdY + h * 0.03],
      [cx - w * 0.09, hdY - h * 0.09],
      [cx + w * 0.05, hdY - h * 0.11],
      [cx + w * 0.14, hdY + h * 0.01],
      [cx + w * 0.1, hdY + h * 0.04],
    ],
    pal.body,
  )
  s.poly(
    [
      [cx - w * 0.06, hdY - h * 0.075],
      [cx - w * 0.03, hdY - h * 0.015],
      [cx + w * 0.07, hdY - h * 0.02],
      [cx + w * 0.09, hdY - h * 0.07],
    ],
    mix(pal.bodyD, PAL.void, 0.7),
  )
  // 眼
  s.px(cx - w * 0.005, hdY - h * 0.045, pal.accent)
  s.px(cx + w * 0.042, hdY - h * 0.045, pal.accent)
  s.px(cx - w * 0.005, hdY - h * 0.048, PAL.white, 0.7)
  s.px(cx + w * 0.042, hdY - h * 0.048, PAL.white, 0.7)
  crest(s, cx + w * 0.02, hdY - h * 0.1, cfg.crest, pal.bodyL, pal.bodyD, pal.accent, w / 140)

  // ---- 袖口 + 爪手
  for (let i = 0; i < 2; i++) {
    const dx = i === 0 ? -1 : 1
    const sx = cx + dx * w * 0.2
    const sy = shY + h * 0.1
    const reach = atk ? (i === 1 ? w * 0.26 : w * 0.1) : w * (i === 1 ? 0.12 : 0.06)
    const hy = sy + h * (atk ? 0.02 : 0.16)
    s.poly(
      [
        [sx - dx * 3, sy - 4],
        [sx + dx * reach, hy],
        [sx + dx * (reach - 8), hy + 6],
        [sx - dx * 5, sy + 7],
      ],
      pal.bodyD,
    )
    // 爪
    for (let k = 0; k < 3; k++) {
      s.thick(sx + dx * reach, hy, sx + dx * (reach + 6), hy + 3 + k * 3, 0.9, pal.trim)
    }
  }

  // ---- 漂浮的余烬 / 雨滴
  for (let i = 0; i < 6; i++) {
    const ex = cx - w * 0.3 + ((i * 0.12 + P.i * 0.05) % 0.6) * w
    const ey = hover - h * 0.2 - ((i * 0.07 + P.i * 0.03) % 0.3) * h
    s.px(ex, ey, pal.accent, 0.25)
  }
}

/* ------------------------------------------------------------------ 无定形肉块 */
export function planBlobMass(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const wob = Math.sin((P.i / (P.anim === 'move' ? 3 : 2)) * TAU) * w * 0.02
  const squash = atk ? 1.08 : 1
  baseShadow(s, def, cx)

  // ---- 主体：多个椭圆叠成的软体，底部铺开
  const baseY = g - h * 0.03
  s.ell(cx + wob, baseY - h * 0.14, w * 0.34, h * 0.17 * squash, pal.bodyD)
  s.ell(cx - w * 0.04 + wob, baseY - h * 0.26, w * 0.27, h * 0.16, pal.body)
  s.ell(cx + wob, baseY - h * 0.36, w * 0.2, h * 0.12, pal.body)
  s.ell(cx - w * 0.03 + wob, baseY - h * 0.22, w * 0.18, h * 0.09, pal.bodyL, 0.2)
  // 脓疱 / 突起
  const rnd = cfg.rng
  for (let i = 0; i < 7; i++) {
    const bx = cx - w * 0.28 + rnd() * w * 0.55 + wob
    const by = baseY - h * (0.06 + rnd() * 0.34)
    const br = 3 + rnd() * 5
    s.disc(bx, by, br, pal.bodyL, 0.5)
    s.disc(bx, by, br * 0.5, pal.trim, 0.6)
  }

  // ---- 拟足：左右各伸出一条触手
  const armSwing = Math.sin(P.i * 1.2) * 4
  s.thick(cx - w * 0.28 + wob, baseY - h * 0.2, cx - w * 0.4, baseY - h * 0.1 + armSwing, w * 0.035, pal.bodyD)
  s.thick(cx - w * 0.4, baseY - h * 0.1 + armSwing, cx - w * 0.44, g - 3, w * 0.026, pal.body)
  const reach = atk ? w * 0.16 : w * 0.06
  s.thick(cx + w * 0.26 + wob, baseY - h * 0.22, cx + w * 0.38 + reach, baseY - h * (atk ? 0.3 : 0.16), w * 0.035, pal.bodyD)
  s.disc(cx + w * 0.38 + reach, baseY - h * (atk ? 0.3 : 0.16), w * 0.03, pal.body)

  // ---- 嘴：横裂大嘴 + 参差尖牙
  const mY = baseY - h * (atk ? 0.2 : 0.16)
  const mW = w * (atk ? 0.26 : 0.18)
  s.ell(cx + w * 0.03 + wob, mY, mW, h * (atk ? 0.07 : 0.035), PAL.bloodDark)
  s.ell(cx + w * 0.03 + wob, mY, mW * 0.82, h * (atk ? 0.055 : 0.022), mix(PAL.blood, PAL.void, 0.35))
  const teeth = atk ? 7 : 5
  for (let i = 0; i < teeth; i++) {
    const tx = cx + w * 0.03 + wob - mW * 0.7 + (i / (teeth - 1)) * mW * 1.4
    const dir = i % 2 ? 1 : -1
    s.poly([[tx, mY], [tx + 2.4, mY + dir * h * 0.028], [tx + 5, mY]], PAL.bone)
  }

  // ---- 眼：主眼 + 数只小眼
  orb(s, cx - w * 0.06 + wob, baseY - h * 0.38, w * 0.045, PAL.white, pal.bodyD, PAL.white)
  s.disc(cx - w * 0.06 + wob, baseY - h * 0.38, w * 0.02, pal.accent)
  s.disc(cx - w * 0.06 + wob, baseY - h * 0.38, w * 0.008, PAL.void)
  for (const [ex, ey, er] of [
    [0.12, 0.3, 0.022],
    [0.17, 0.22, 0.016],
    [-0.15, 0.24, 0.018],
    [0.06, 0.42, 0.014],
  ]) {
    s.disc(cx + w * ex + wob, baseY - h * ey, w * er, pal.accent, 0.9)
    s.disc(cx + w * ex + wob, baseY - h * ey, w * er * 0.45, PAL.void)
  }

  // ---- 流下的酸液 / 黏液
  for (let i = 0; i < 5; i++) {
    const dx = cx - w * 0.22 + i * w * 0.11 + wob
    const dy = baseY - h * 0.04 + (i % 2) * 3
    s.thick(dx, baseY - h * 0.1, dx, dy + 4, 1.3, pal.accent, 0.35)
    s.px(dx, dy + 4, pal.accent, 0.5)
  }
  core(s, P, cx + wob, baseY - h * 0.3, w * (atk ? 0.05 : 0.032), pal.core, 0.8, P)
}

/* ------------------------------------------------------------------ 虫形 */
export function planInsectCarapace(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const by = bob(P, 2)
  const lp = legPhase(P)
  const bodyY = g - h * 0.34 + by
  const atk = P.anim === 'attack'
  baseShadow(s, def, cx)

  // ---- 六条节肢：每侧三条，交替摆动
  for (let side = 0; side < 2; side++) {
    const dx = side === 0 ? -1 : 1
    for (let i = 0; i < 3; i++) {
      const ox = cx + dx * w * (0.12 + i * 0.05)
      const ay = bodyY + h * 0.02 + i * h * 0.03
      const sw = (i % 2 ? lp : -lp) * 6
      const footX = ox + dx * w * (0.2 + i * 0.02) + sw
      const footY = g - 3 - Math.max(0, (i % 2 ? lp : -lp) * 4)
      bentLimb(s, ox, ay, footX, footY, dx * w * 0.07, 1.5, pal.bodyD, pal.body)
      s.px(footX, footY, pal.accent, 0.5)
    }
  }

  // ---- 腹 / 胸：甲壳分节
  s.ell(cx - w * 0.12, bodyY + h * 0.03, w * 0.2, h * 0.13, pal.bodyD)
  s.ell(cx - w * 0.12, bodyY - h * 0.02, w * 0.17, h * 0.08, pal.body, 0.8)
  s.ell(cx + w * 0.05, bodyY, w * 0.19, h * 0.11, pal.body)
  for (let i = 0; i < 3; i++) {
    s.line(cx - w * 0.24 + i * w * 0.07, bodyY - h * 0.08, cx - w * 0.2 + i * w * 0.07, bodyY + h * 0.08, pal.bodyD, 0.6)
  }
  s.line(cx - w * 0.2, bodyY - h * 0.06, cx + w * 0.1, bodyY - h * 0.08, pal.bodyL, 0.5)

  // ---- 头：三角头 + 复眼 + 触角
  const hdX = cx + w * 0.24
  const hdY = bodyY - h * 0.05
  s.poly(
    [
      [hdX - w * 0.06, hdY + h * 0.04],
      [hdX - w * 0.02, hdY - h * 0.05],
      [hdX + w * 0.1, hdY - h * 0.02],
      [hdX + w * 0.06, hdY + h * 0.045],
    ],
    pal.body,
  )
  orb(s, hdX + w * 0.045, hdY - h * 0.012, w * 0.026, pal.accent, pal.bodyD, mix(pal.accent, PAL.white, 0.5))
  // 触角
  const ant = Math.sin(P.i * 1.4) * 3
  s.thick(hdX + w * 0.02, hdY - h * 0.04, hdX + w * 0.1, hdY - h * 0.16 + ant, 0.8, pal.bodyD)
  s.thick(hdX + w * 0.02, hdY - h * 0.04, hdX - w * 0.04, hdY - h * 0.17 - ant, 0.8, pal.bodyD)
  s.px(hdX + w * 0.1, hdY - h * 0.16 + ant, pal.accent, 0.7)
  // 口器
  s.thick(hdX + w * 0.05, hdY + h * 0.03, hdX + w * 0.09, hdY + h * 0.06, 0.8, PAL.bloodDark)
  crest(s, hdX, hdY - h * 0.05, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 140)

  // ---- 镰刀前肢（攻击帧抬起）
  for (let i = 0; i < 2; i++) {
    const sy = bodyY - h * 0.02 - i * 4
    const sx = cx + w * 0.13
    const tipX = sx + w * (atk ? 0.24 : 0.13)
    const tipY = sy - h * (atk ? 0.24 : 0.06) + i * 2
    s.thick(sx, sy, sx + w * 0.08, sy - h * 0.06, 2.2, pal.bodyD)
    s.poly(
      [
        [sx + w * 0.07, sy - h * 0.04],
        [tipX, tipY],
        [tipX - w * 0.03, tipY + h * 0.06],
        [sx + w * 0.06, sy + 2],
      ],
      i === 0 ? pal.bodyD : pal.body,
    )
    s.line(sx + w * 0.07, sy - h * 0.04, tipX, tipY, pal.trim, 0.6)
  }

  // ---- 尾部产卵管
  s.thick(cx - w * 0.26, bodyY + h * 0.02, cx - w * 0.36, bodyY + h * 0.1 + Math.sin(P.i) * 2, 2, pal.bodyD)
  s.poly([[cx - w * 0.36, bodyY + h * 0.08], [cx - w * 0.42, bodyY + h * 0.14], [cx - w * 0.34, bodyY + h * 0.13]], pal.trim)
}

/* ------------------------------------------------------------------ 植物母体 */
export function planPlantBulb(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const by = bob(P, 2)
  const atk = P.anim === 'attack'
  const stemTop = g - h * 0.52 + by
  const hdY = stemTop - h * 0.02
  baseShadow(s, def, cx)
  accessoryPlant(s, cfg, pal, cx, hdY, h, w)

  // ---- 根须：扎进地面并向两侧铺开
  for (let i = 0; i < 6; i++) {
    const ox = cx - w * 0.18 + i * w * 0.072
    const dx = ox < cx ? -1 : 1
    s.thick(ox, g - h * 0.12, ox + dx * w * 0.06, g - 2, 1.6, pal.bodyD)
    s.px(ox + dx * w * 0.06, g - 2, pal.accent, 0.4)
  }

  // ---- 茎：粗壮、带刺
  s.thick(cx, g - 2, cx + by * 0.6, stemTop, w * 0.07, pal.bodyD)
  s.thick(cx - 2, g - 2, cx + by * 0.6 - 2, stemTop, 2.2, pal.body, 0.55)
  for (let i = 0; i < 5; i++) {
    const ty = g - h * 0.1 - i * h * 0.07
    const dx = i % 2 ? 1 : -1
    s.poly([[cx + dx * 3, ty], [cx + dx * (10 - i), ty - 4], [cx + dx * 2, ty - 2]], pal.trim)
  }

  // ---- 花苞头：外瓣 + 内口 + 牙
  const petal = atk ? 1.35 : 1
  // 外瓣（左右上下各一片）
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * TAU
    const px = cx + Math.cos(a) * w * 0.14 * petal
    const py = hdY - h * 0.06 + Math.sin(a) * h * 0.1 * petal
    s.poly(
      [
        [cx, hdY],
        [px - Math.cos(a + 0.4) * 5, py - Math.sin(a + 0.4) * 3],
        [px, py],
        [px + Math.cos(a - 0.4) * 5, py + Math.sin(a - 0.4) * 3],
      ],
      i % 2 ? pal.body : pal.bodyD,
    )
  }
  // 内口（暗）+ 牙
  const mouthR = w * (atk ? 0.1 : 0.06)
  s.ell(cx, hdY, mouthR, mouthR * (atk ? 0.9 : 0.6), PAL.bloodDark)
  s.ell(cx, hdY, mouthR * 0.7, mouthR * (atk ? 0.7 : 0.4), mix(PAL.blood, PAL.void, 0.4))
  const teeth = atk ? 8 : 6
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU
    const tx = cx + Math.cos(a) * mouthR * 0.9
    const ty = hdY + Math.sin(a) * mouthR * (atk ? 0.8 : 0.52)
    s.poly([[tx, ty], [tx + Math.cos(a) * 3.4, ty + Math.sin(a) * 3.4], [tx + 3, ty + 3]], PAL.bone, 0.95)
  }
  core(s, P, cx, hdY, mouthR * 0.5, pal.core, atk ? 1.3 : 0.6, P)
  crest(s, cx, hdY - h * 0.13 * petal, cfg.crest, pal.bodyL, pal.bodyD, pal.accent, w / 150)

  // ---- 藤蔓双臂：带刺，攻击时前伸
  for (let i = 0; i < 2; i++) {
    const dx = i === 0 ? -1 : 1
    const sy = hdY + h * 0.1
    const sx = cx + dx * w * 0.14
    const ex = cx + dx * w * (atk ? 0.42 : 0.3)
    const ey = sy + h * (atk ? -0.02 : 0.14)
    const mid = bentLimb(s, sx, sy, ex, ey, dx * w * 0.05, 2, pal.bodyD, pal.body)
    for (let k = 0; k < 3; k++) {
      s.poly([[mid[0] - 4 + k * 3, mid[1]], [mid[0] - 2 + k * 3, mid[1] - 4], [mid[0], mid[1]]], pal.trim)
    }
    s.px(ex, ey, pal.accent)
  }

  // ---- 孢子粒（漂浮）
  for (let i = 0; i < 6; i++) {
    const ax = cx - w * 0.2 + ((i * 0.1 + P.i * 0.04) % 0.4) * w
    const ay = hdY - h * 0.1 - ((i * 0.05 + P.i * 0.02) % 0.2) * h
    s.px(ax, ay, pal.accent, 0.25)
  }
}

/* ------------------------------------------------------------------ 翼魔 */
export function planWingedDemon(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const by = bob(P, 2)
  const hipY = g - h * 0.32 + by
  const atk = P.anim === 'attack'
  baseShadow(s, def, cx)

  // ---- 翅膀：左右各一，攻击时扬起
  const flap = atk ? 1 : Math.sin((P.i / 2) * TAU) * 0.5
  for (let i = 0; i < 2; i++) {
    const dx = i === 0 ? -1 : 1
    const wx = cx + dx * w * 0.12
    const wy = hipY - h * 0.28
    const span = w * (0.34 + flap * 0.04)
    const lift = h * (0.12 + flap * 0.08)
    s.poly(
      [
        [wx, wy],
        [wx + dx * span * 0.5, wy - lift],
        [wx + dx * span, wy - lift * 0.3],
        [wx + dx * span * 0.7, wy + h * 0.06],
        [wx + dx * span * 0.3, wy + h * 0.1],
      ],
      i === 0 ? pal.bodyD : pal.body,
      0.95,
    )
    // 翼骨
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + k * 0.25
      s.line(wx, wy, wx + dx * span * t, wy - lift * (1 - t) * 1.2, pal.bodyD, 0.8)
    }
    s.line(wx, wy, wx + dx * span, wy - lift * 0.3, pal.trim, 0.35)
    s.px(wx + dx * span, wy - lift * 0.3, pal.accent, 0.6)
  }

  // ---- 腿：蹄足
  const drawLeg = (x, swing, lift, back) => {
    const c = back ? pal.bodyD : pal.body
    s.thick(x, hipY, x + swing, g - h * 0.16, w * 0.045, c)
    s.thick(x + swing, g - h * 0.16, x + swing * 0.5, g - 6 - lift, w * 0.04, c)
    s.poly(
      [
        [x + swing * 0.5 - w * 0.045, g - 6 - lift],
        [x + swing * 0.5 + w * 0.045, g - 6 - lift],
        [x + swing * 0.5 + w * 0.03, g - 1],
        [x + swing * 0.5 - w * 0.03, g - 1],
      ],
      PAL.boneDeep,
    )
  }
  drawLeg(cx - w * 0.1, -lp * 4, Math.max(0, -lp * 3), true)
  drawLeg(cx + w * 0.09, lp * 4, Math.max(0, lp * 3), false)

  // ---- 躯干
  const shY = hipY - h * 0.26
  s.poly(
    [
      [cx - w * 0.14, hipY],
      [cx + w * 0.15, hipY],
      [cx + w * 0.2, shY],
      [cx - w * 0.19, shY],
    ],
    pal.body,
  )
  s.ell(cx + w * 0.02, (hipY + shY) / 2, w * 0.12, h * 0.07, pal.bodyD, 0.45)
  core(s, P, cx + w * 0.02, shY + h * 0.1, w * 0.04, pal.core, 1, P)

  // ---- 头：犄角 + 尖耳 + 獠牙
  const hdX = cx + w * 0.02
  const hdY = shY - h * 0.05 + by * 0.5
  s.ell(hdX, hdY, w * 0.065, h * 0.045, pal.body)
  s.poly([[hdX - w * 0.03, hdY - h * 0.02], [hdX - w * 0.08, hdY - h * 0.06], [hdX - w * 0.01, hdY - h * 0.035]], pal.bodyD)
  s.poly([[hdX + w * 0.03, hdY - h * 0.02], [hdX + w * 0.09, hdY - h * 0.065], [hdX + w * 0.02, hdY - h * 0.035]], pal.bodyD)
  s.px(hdX + w * 0.02, hdY - h * 0.008, pal.accent)
  s.px(hdX + w * 0.02, hdY - h * 0.008, PAL.white, 0.6)
  s.poly([[hdX + w * 0.01, hdY + h * 0.02], [hdX + w * 0.03, hdY + h * 0.05], [hdX + w * 0.05, hdY + h * 0.02]], PAL.bone)
  crest(s, hdX, hdY - h * 0.045, cfg.crest, PAL.boneDark, pal.bodyD, pal.accent, w / 140)

  // ---- 手：爪
  for (let i = 0; i < 2; i++) {
    const dx = i === 0 ? -1 : 1
    const sx = cx + dx * w * 0.19
    const sy = shY + 4
    const hx = cx + dx * w * (atk && i === 1 ? 0.38 : 0.26)
    const hy = sy + h * (atk && i === 1 ? 0.02 : 0.18)
    s.thick(sx, sy, hx, hy, 3.4, i === 0 ? pal.bodyD : pal.body)
    for (let k = 0; k < 3; k++) {
      s.thick(hx, hy, hx + dx * 6, hy + 4 + k * 3, 0.9, PAL.boneDark)
    }
    if (atk && i === 1) core(s, P, hx + dx * 6, hy + 8, w * 0.03, pal.core, 1.2, P)
  }
}
