// 主题 BOSS 体型 A：重装机甲 / 人形壮汉 / 四足野兽 / 履带战车
import { PAL } from '../palette.js'
import { mix } from './core.js'
import {
  baseShadow,
  legPhase,
  bob,
  crest,
  weaponAt,
  core,
  rivets,
  panel,
  rags,
  orb,
  accessoryHuman,
  accessoryMech,
  TAU,
} from './theme-boss-parts.js'

/* ------------------------------------------------------------------ 重装机甲 */
export function planMechTitan(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const by = bob(P, 2)
  const lp = legPhase(P)
  const hipY = g - h * 0.3 + by
  const legW = w * 0.1
  const shY = hipY - h * 0.3
  baseShadow(s, def, cx)
  accessoryMech(s, cfg, pal, cx, shY, hipY, w, h)

  // ---- 双腿：大腿 + 膝关节球 + 小腿 + 脚板
  const drawLeg = (x, swing, lift, back) => {
    const c = back ? pal.bodyD : pal.body
    const cp = back ? pal.plateD : pal.plate
    s.thick(x, hipY, x + swing, g - h * 0.14, legW * 0.46, c)
    s.disc(x + swing, g - h * 0.14, legW * 0.4, cp)
    s.thick(x + swing, g - h * 0.14, x + swing * 0.5, g - 4 - lift, legW * 0.36, c)
    s.rect(x + swing * 0.5 - legW * 0.62, g - 5 - lift, legW * 1.24, 5, cp)
    s.rect(x + swing * 0.5 - legW * 0.62, g - 5 - lift, legW * 1.24, 1.4, pal.bodyL)
    s.px(x + swing * 0.5 + legW * 0.4, g - 3 - lift, pal.accent, 0.8)
  }
  drawLeg(cx - w * 0.14, -lp * 4, 0, true)
  drawLeg(cx + w * 0.07, lp * 4, Math.max(0, lp * 3), false)

  // ---- 骨盆 / 腰
  s.rect(cx - w * 0.16, hipY - 5, w * 0.32, 11, pal.plateD)
  s.rect(cx - w * 0.16, hipY - 5, w * 0.32, 1.6, pal.plate)
  s.px(cx, hipY - 2, pal.accent)

  // ---- 躯干：上宽下窄的梯形 + 胸甲
  s.poly(
    [
      [cx - w * 0.17, hipY - 1],
      [cx + w * 0.18, hipY - 1],
      [cx + w * 0.28, shY + 2],
      [cx - w * 0.27, shY + 2],
    ],
    pal.body,
  )
  s.poly(
    [
      [cx - w * 0.11, hipY - 4],
      [cx + w * 0.12, hipY - 4],
      [cx + w * 0.18, shY + 6],
      [cx - w * 0.17, shY + 6],
    ],
    pal.plate,
  )
  s.line(cx - w * 0.11, hipY - 4, cx - w * 0.17, shY + 6, pal.plateD, 0.8)
  s.line(cx + w * 0.12, hipY - 4, cx + w * 0.18, shY + 6, pal.plateD, 0.8)
  // 胸口核心（每只 BOSS 的 accent 光）
  core(s, P, cx + w * 0.02, shY + h * 0.1, w * 0.05, pal.core, 1, P)

  // ---- 肩甲：左右两大块，前肩稍大
  const shS = w * 0.13
  s.ell(cx - w * 0.26, shY + 4, shS, shS * 0.72, pal.plate)
  s.ell(cx - w * 0.26, shY + 2, shS * 0.9, shS * 0.44, pal.bodyL, 0.4)
  s.ell(cx + w * 0.27, shY + 4, shS * 1.05, shS * 0.76, pal.plate)
  s.ell(cx + w * 0.27, shY + 2, shS * 0.95, shS * 0.46, pal.bodyL, 0.4)
  for (let i = 0; i < 4; i++) s.px(cx + w * 0.2 + i * 5, shY + 8, pal.plateD)

  // ---- 头：小头嵌在肩间，视缝发光
  const hx = cx + w * 0.03
  const hy = shY - h * 0.045 + by * 0.5
  s.rect(hx - w * 0.075, hy - h * 0.05, w * 0.15, h * 0.055, pal.bodyD)
  s.rect(hx - w * 0.05, hy - h * 0.038, w * 0.11, h * 0.02, pal.accent)
  s.rect(hx - w * 0.05, hy - h * 0.038, w * 0.11, 1, PAL.white, 0.7)
  crest(s, hx, hy - h * 0.045, cfg.crest, pal.bodyL, pal.plateD, pal.accent, w / 140)

  // ---- 手臂：后臂自然下垂，前臂持武器
  const armY = shY + 8
  s.thick(cx - w * 0.26, armY, cx - w * 0.31, armY + h * 0.16, 5, pal.bodyD)
  s.disc(cx - w * 0.31, armY + h * 0.16, 5, pal.plateD)
  const atk = P.anim === 'attack'
  const aLift = atk ? -h * 0.09 - P.i * h * 0.03 : Math.sin(P.i + 1) * 2
  const wxp = weaponAt(
    s,
    cx + w * 0.26,
    armY + h * 0.14 + aLift,
    cfg.weapon,
    pal.body,
    pal.bodyD,
    pal.accent,
    w * (cfg.weapon === 2 ? 0.34 : 0.28),
    aLift,
  )
  if (cfg.weapon === 2) core(s, P, wxp[0], wxp[1], w * (atk ? 0.05 : 0.025), pal.core, atk ? 1.5 : 0.6, P)

  // ---- 背包 / 排气：锈管 + 烟
  s.rect(cx - w * 0.22, shY - h * 0.03, w * 0.16, h * 0.13, pal.plateD)
  s.thick(cx - w * 0.2, shY - h * 0.03, cx - w * 0.24, shY - h * 0.16, 3, pal.plateD)
  s.thick(cx - w * 0.15, shY - h * 0.03, cx - w * 0.17, shY - h * 0.19, 2.6, pal.plateD)
  s.px(cx - w * 0.24, shY - h * 0.16, pal.accent, 0.7)

  // ---- 装甲板细节 + 铆钉
  const rnd = cfg.rng
  for (let i = 0; i < 7; i++) {
    const rx = cx - w * 0.26 + rnd() * w * 0.52
    const ry = shY + 10 + rnd() * h * 0.14
    s.px(rx, ry, pal.plateD, 0.9)
  }
  rivets(s, rnd, cx - w * 0.09, hipY + 2, w * 0.18, 5, pal.plateD)
}

/* ------------------------------------------------------------------ 人形壮汉 */
export function planBruteHuman(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const by = bob(P, 1.6)
  const lp = legPhase(P)
  const hipY = g - h * 0.34 + by
  const shY = hipY - h * 0.26
  baseShadow(s, def, cx)
  accessoryHuman(s, cfg, pal, cx, shY, hipY, w, h)

  // ---- 腿：粗布裤 + 皮靴
  const drawLeg = (x, swing, lift, back) => {
    const c = back ? mix(pal.bodyD, pal.body, 0.3) : pal.body
    s.thick(x, hipY, x + swing, g - h * 0.16, w * 0.05, c)
    s.thick(x + swing, g - h * 0.16, x + swing * 0.6, g - 5 - lift, w * 0.045, c)
    s.rect(x + swing * 0.6 - w * 0.055, g - 6 - lift, w * 0.11, 6, pal.bodyD)
    s.rect(x + swing * 0.6 - w * 0.055, g - 6 - lift, w * 0.11, 1.4, pal.plate)
  }
  drawLeg(cx - w * 0.1, -lp * 5, Math.max(0, -lp * 4), true)
  drawLeg(cx + w * 0.09, lp * 5, Math.max(0, lp * 4), false)

  // ---- 腰布 / 皮带
  s.rect(cx - w * 0.15, hipY - 3, w * 0.3, 8, pal.bodyD)
  s.rect(cx - w * 0.15, hipY - 3, w * 0.3, 1.5, pal.plate)
  s.px(cx + w * 0.02, hipY + 1, pal.accent)
  rags(s, cfg.rng, cx - w * 0.14, hipY + 4, w * 0.26, h * 0.09, pal.bodyD, pal.plateD, 4)

  // ---- 躯干：桶状胸 + 背带
  s.ell(cx, (hipY + shY) / 2, w * 0.2, (hipY - shY) / 2 + 3, pal.body)
  s.ell(cx + w * 0.03, (hipY + shY) / 2 - 2, w * 0.13, (hipY - shY) / 2 - 3, pal.bodyL, 0.22)
  // 交叉皮带
  s.line(cx - w * 0.14, shY + 4, cx + w * 0.14, hipY - 6, pal.bodyD, 0.95)
  s.line(cx + w * 0.12, shY + 4, cx - w * 0.12, hipY - 6, pal.bodyD, 0.7)
  s.px(cx + w * 0.12, shY + 4, pal.accent)

  // ---- 肩：前肩带护甲，后肩裸露
  s.ell(cx - w * 0.19, shY + 5, w * 0.075, w * 0.065, pal.bodyD)
  s.ell(cx + w * 0.2, shY + 5, w * 0.085, w * 0.075, pal.plate)
  s.ell(cx + w * 0.2, shY + 3, w * 0.075, w * 0.04, pal.bodyL, 0.4)

  // ---- 头：小头 + 冠饰 + 疤痕
  const hx = cx + w * 0.01
  const hy = shY - h * 0.05 + by * 0.5
  s.ell(hx, hy, w * 0.062, h * 0.042, pal.bodyD)
  s.ell(hx + w * 0.012, hy - 1, w * 0.045, h * 0.032, pal.body, 0.8)
  s.px(hx + w * 0.03, hy - 2, pal.accent)
  s.px(hx - w * 0.01, hy + 1, PAL.void, 0.6)
  crest(s, hx, hy - h * 0.036, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 140)

  // ---- 手臂：后臂摆动，前臂持武器
  const armY = shY + 8
  s.thick(cx - w * 0.19, armY, cx - w * 0.24 + lp * 3, armY + h * 0.2, 4.4, pal.bodyD)
  s.disc(cx - w * 0.24 + lp * 3, armY + h * 0.2, 4.4, pal.body)
  const atk = P.anim === 'attack'
  const fwd = atk ? w * 0.06 * (P.i + 1) : 0
  const wxp = weaponAt(
    s,
    cx + w * 0.2 + fwd,
    armY + h * 0.17 - (atk ? h * 0.05 : 0),
    cfg.weapon,
    pal.body,
    pal.bodyD,
    pal.accent,
    w * (cfg.weapon === 4 ? 0.36 : 0.3),
    atk ? -6 : 0,
  )
  if (atk && cfg.weapon === 0) core(s, P, wxp[0], wxp[1], w * 0.03, pal.core, 1.2, P)

  // ---- 胸口战纹
  const rnd = cfg.rng
  for (let i = 0; i < 6; i++) {
    s.px(cx - w * 0.16 + rnd() * w * 0.32, shY + 10 + rnd() * h * 0.1, pal.accent, 0.22)
  }
}

/* ------------------------------------------------------------------ 四足野兽 */
export function planBeastQuad(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.48
  const by = bob(P, 2)
  const lp = legPhase(P)
  const bodyY = g - h * 0.42 + by
  baseShadow(s, def, cx)

  // ---- 四条腿：前后两对，交替抬
  const legPairs = [
    [cx - w * 0.3, -lp, true],
    [cx - w * 0.16, lp, false],
    [cx + w * 0.18, -lp, true],
    [cx + w * 0.32, lp, false],
  ]
  for (const [lx, sw, back] of legPairs) {
    const c = back ? pal.bodyD : pal.body
    const lift = Math.max(0, sw * 4)
    s.thick(lx, bodyY + h * 0.04, lx + sw * 5, bodyY + h * 0.16, w * 0.032, c)
    s.thick(lx + sw * 5, bodyY + h * 0.16, lx + sw * 6, g - 3 - lift, w * 0.028, c)
    s.rect(lx + sw * 6 - w * 0.035, g - 4 - lift, w * 0.07, 4, pal.bodyD)
    s.px(lx + sw * 6 + w * 0.02, g - 5 - lift, pal.accent, 0.7)
  }

  // ---- 躯干：椭圆长身 + 背脊骨刺
  s.ell(cx, bodyY, w * 0.34, h * 0.13, pal.body)
  s.ell(cx + w * 0.06, bodyY - h * 0.03, w * 0.22, h * 0.08, pal.bodyL, 0.25)
  s.ell(cx - w * 0.1, bodyY + h * 0.03, w * 0.2, h * 0.07, pal.bodyD, 0.35)
  for (let i = 0; i < 5; i++) {
    const sx = cx - w * 0.22 + i * w * 0.1
    const sy = bodyY - h * 0.1 + Math.abs(i - 2) * 1.6
    s.thick(sx, sy, sx - 2, sy - h * (0.05 + (i % 2) * 0.02), 1.6, pal.bodyD)
    s.px(sx - 2, sy - h * 0.05, pal.plate)
  }

  // ---- 头：低位前伸，长吻 + 獠牙 + 双角
  const hdX = cx + w * 0.34
  const hdY = bodyY - h * 0.05 + (P.anim === 'attack' ? h * 0.05 : 0)
  s.ell(hdX, hdY, w * 0.13, h * 0.075, pal.body)
  s.poly(
    [
      [hdX + w * 0.05, hdY - h * 0.02],
      [hdX + w * 0.2, hdY + h * 0.005],
      [hdX + w * 0.18, hdY + h * 0.045],
      [hdX + w * 0.04, hdY + h * 0.05],
    ],
    pal.bodyD,
  )
  // 上下颚与牙
  if (P.anim === 'attack') {
    s.poly(
      [
        [hdX + w * 0.1, hdY + h * 0.02],
        [hdX + w * 0.2, hdY + h * 0.03],
        [hdX + w * 0.17, hdY + h * 0.075],
        [hdX + w * 0.08, hdY + h * 0.06],
      ],
      PAL.bloodDark,
    )
    for (let i = 0; i < 4; i++) {
      const tx = hdX + w * 0.11 + i * w * 0.026
      s.poly([[tx, hdY + h * 0.022], [tx + 2, hdY + h * 0.05], [tx + 4, hdY + h * 0.022]], PAL.bone)
    }
  }
  s.px(hdX + w * 0.05, hdY - h * 0.02, pal.accent)
  s.px(hdX + w * 0.05, hdY - h * 0.02, PAL.white, 0.5)
  crest(s, hdX - w * 0.02, hdY - h * 0.06, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 140)

  // ---- 尾巴：向后拖，末端带骨刺
  const tw = lp * 3
  s.thick(cx - w * 0.3, bodyY + h * 0.02, cx - w * 0.44, bodyY - h * 0.06 + tw, w * 0.028, pal.bodyD)
  s.thick(cx - w * 0.44, bodyY - h * 0.06 + tw, cx - w * 0.52, bodyY - h * 0.12 + tw, w * 0.02, pal.body)
  s.px(cx - w * 0.52, bodyY - h * 0.12 + tw, pal.accent)

  // ---- 肩部骨刺 / 斑纹
  const rnd = cfg.rng
  for (let i = 0; i < 10; i++) {
    s.px(cx - w * 0.3 + rnd() * w * 0.62, bodyY - h * 0.02 + rnd() * h * 0.06, pal.accent, 0.18)
  }
}

/* ------------------------------------------------------------------ 履带战车 */
export function planTankTread(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const recoil = P.anim === 'attack' ? -(P.i + 1) * 4 : 0
  baseShadow(s, def, cx)

  // ---- 履带：圆角矩形 + 负重轮 + 移动时的纹路
  const trH = h * 0.16
  const trY = g - trH - 1
  const trW = w * 0.66
  const trX = cx - trW / 2
  s.ell(cx, trY + trH / 2, trW * 0.52, trH * 0.56, pal.bodyD)
  s.rect(trX + 2, trY + 2, trW - 4, trH - 4, pal.bodyD)
  s.rect(trX + 2, trY + 2, trW - 4, 2, pal.plate)
  // 负重轮
  const wpn = 6
  for (let i = 0; i < wpn; i++) {
    const wx = trX + 8 + (i / (wpn - 1)) * (trW - 16)
    s.disc(wx, trY + trH / 2, trH * 0.28, pal.plateD)
    s.disc(wx, trY + trH / 2, trH * 0.12, pal.plate)
    const rot = P.anim === 'move' ? (P.i / 3) * TAU : 0
    s.px(wx + Math.cos(rot) * trH * 0.16, trY + trH / 2 + Math.sin(rot) * trH * 0.16, pal.bodyL)
  }
  // 履带齿纹（随帧移动）
  const shift = P.anim === 'move' ? P.i * 4 : 0
  for (let i = 0; i < 14; i++) {
    const tx = trX + 3 + ((i * 8 + shift) % (trW - 6))
    s.rect(tx, trY + 1, 2, 2, pal.plate)
    s.rect(tx, trY + trH - 3, 2, 2, pal.plate)
  }

  // ---- 车体：斜面装甲
  const hullY = trY - h * 0.1
  s.poly(
    [
      [trX + 4, hullY + h * 0.1],
      [trX + w * 0.1, hullY],
      [trX + trW - w * 0.1, hullY],
      [trX + trW - 4, hullY + h * 0.1],
    ],
    pal.body,
  )
  s.line(trX + w * 0.1, hullY, trX + trW - w * 0.1, hullY, pal.bodyL, 0.7)
  s.line(trX + 4, hullY + h * 0.1, trX + trW - 4, hullY + h * 0.1, pal.bodyD)
  // 侧裙板
  s.rect(trX + 2, hullY + h * 0.04, trW - 4, h * 0.05, pal.plateD)
  rivets(s, cfg.rng, trX + 8, hullY + h * 0.055, trW - 16, 9, pal.plate)

  // ---- 炮塔 + 主炮
  const tuX = cx + w * 0.04 + recoil
  const tuY = hullY - h * 0.06
  s.poly(
    [
      [tuX - w * 0.14, tuY + h * 0.07],
      [tuX - w * 0.1, tuY],
      [tuX + w * 0.1, tuY],
      [tuX + w * 0.15, tuY + h * 0.07],
    ],
    pal.plate,
  )
  s.ell(tuX, tuY + h * 0.02, w * 0.1, h * 0.03, pal.bodyL, 0.35)
  // 主炮
  const gunLen = w * 0.38
  s.rect(tuX + w * 0.08, tuY + h * 0.022, gunLen, h * 0.026, pal.bodyD)
  s.rect(tuX + w * 0.08, tuY + h * 0.022, gunLen, 1.4, pal.bodyL, 0.6)
  s.rect(tuX + w * 0.08 + gunLen - 4, tuY + h * 0.018, 4, h * 0.034, pal.plateD)
  if (P.anim === 'attack') core(s, P, tuX + w * 0.08 + gunLen + 2, tuY + h * 0.035, w * 0.045, pal.core, 1.5, P)
  else s.px(tuX + w * 0.08 + gunLen, tuY + h * 0.034, pal.accent)

  // ---- 指挥塔 / 天线 / 排气
  s.rect(tuX - w * 0.04, tuY - h * 0.045, w * 0.09, h * 0.05, pal.bodyD)
  s.rect(tuX - w * 0.03, tuY - h * 0.038, w * 0.05, 2.4, pal.accent)
  crest(s, tuX, tuY - h * 0.045, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 150)
  s.thick(trX + w * 0.12, hullY, trX + w * 0.1, hullY - h * 0.1, 2.6, pal.plateD)
  s.thick(trX + w * 0.17, hullY, trX + w * 0.16, hullY - h * 0.08, 2.2, pal.plateD)
  for (let i = 0; i < 3; i++) s.px(trX + w * 0.1 - i, hullY - h * 0.11 - i * 3, PAL.ashPale, 0.4 - i * 0.1)

  // ---- 车头撞角 + 侧灯
  s.poly(
    [
      [trX + trW - 2, hullY + h * 0.02],
      [trX + trW + w * 0.06, hullY + h * 0.06],
      [trX + trW - 2, hullY + h * 0.1],
    ],
    pal.plateD,
  )
  orb(s, trX + 2, hullY + h * 0.02, w * 0.018, pal.accent, pal.bodyD, PAL.white)
}
