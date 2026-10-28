// 主题 BOSS 体型 D：反关节步行机
import { PAL } from '../palette.js'
import { mix } from './core.js'
import { baseShadow, bob, legPhase, crest, core, orb, rivets } from './theme-boss-parts.js'

export function planWalkerTurret(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const recoil = atk ? -(P.i + 1) * 3 : 0
  const crouch = atk ? 4 : 0
  const bodyY = g - h * (0.46 + (P.anim === 'move' ? Math.abs(lp) * 0.02 : 0)) + bob(P, 1.5) + crouch
  baseShadow(s, def, cx)

  // ---- 反关节双腿：大腿向前，小腿向后折
  const drawLeg = (x, swing, back) => {
    const c = back ? pal.bodyD : pal.body
    const cp = back ? pal.plateD : pal.plate
    const kneeX = x + swing
    const kneeY = g - h * 0.26
    const ankleX = kneeX - swing * 1.4
    const ankleY = g - h * 0.1
    s.thick(x, bodyY + h * 0.04, kneeX, kneeY, w * 0.038, c)
    s.disc(kneeX, kneeY, w * 0.042, cp)
    s.thick(kneeX, kneeY, ankleX, ankleY, w * 0.028, c)
    s.disc(ankleX, ankleY, w * 0.03, cp)
    // 足：三趾
    for (let i = 0; i < 3; i++) {
      s.thick(ankleX, ankleY, ankleX + (i - 1) * w * 0.05, g - 2, 1.4, pal.plateD)
    }
    s.px(ankleX, ankleY, pal.accent, 0.6)
  }
  drawLeg(cx - w * 0.14, -lp * 5, true)
  drawLeg(cx + w * 0.1, lp * 5, false)

  // ---- 髋部机架：横梁 + 液压杆
  s.poly(
    [
      [cx - w * 0.2, bodyY + h * 0.05],
      [cx - w * 0.14, bodyY - h * 0.02],
      [cx + w * 0.15, bodyY - h * 0.02],
      [cx + w * 0.2, bodyY + h * 0.05],
    ],
    pal.plateD,
  )
  s.line(cx - w * 0.18, bodyY + h * 0.05, cx + w * 0.18, bodyY + h * 0.05, pal.plate)
  for (const dx of [-1, 1]) {
    s.thick(cx + dx * w * 0.16, bodyY + h * 0.04, cx + dx * w * 0.09, bodyY - h * 0.1, 1.6, pal.bodyL, 0.5)
  }

  // ---- 机身：竖立的驾驶舱
  const torY = bodyY - h * 0.1
  s.poly(
    [
      [cx - w * 0.19, torY],
      [cx - w * 0.15, torY - h * 0.22],
      [cx + w * 0.15, torY - h * 0.22],
      [cx + w * 0.19, torY],
    ],
    pal.body,
  )
  s.rect(cx - w * 0.11, torY - h * 0.19, w * 0.22, h * 0.06, pal.bodyD)
  s.rect(cx - w * 0.09, torY - h * 0.18, w * 0.18, 2.4, pal.accent, 0.85)
  s.line(cx - w * 0.15, torY - h * 0.03, cx + w * 0.15, torY - h * 0.03, pal.plateD)
  rivets(s, cfg.rng, cx - w * 0.12, torY - h * 0.06, w * 0.24, 7, pal.plate)

  // ---- 顶置炮塔：单眼 + 长炮
  const tuX = cx + w * 0.01 + recoil
  const tuY = torY - h * 0.26
  s.ell(tuX, tuY, w * 0.13, h * 0.07, pal.plate)
  s.ell(tuX, tuY - 1, w * 0.11, h * 0.05, pal.bodyL, 0.3)
  // 主炮
  const gunLen = w * 0.34
  s.rect(tuX + w * 0.05, tuY - 2, gunLen, 7, pal.bodyD)
  s.rect(tuX + w * 0.05, tuY - 2, gunLen, 1.6, pal.bodyL, 0.6)
  s.rect(tuX + w * 0.05 + gunLen - 5, tuY - 3.5, 5, 10, pal.plateD)
  // 副炮（短）
  s.rect(tuX + w * 0.02, tuY + h * 0.03, w * 0.12, 4, pal.plateD)
  // 单眼
  orb(s, tuX - w * 0.03, tuY - h * 0.005, w * 0.038, pal.accent, pal.bodyD, mix(pal.accent, PAL.white, 0.6))
  s.disc(tuX - w * 0.03, tuY - h * 0.005, w * 0.014, PAL.void)
  if (atk) {
    core(s, P, tuX + w * 0.05 + gunLen + 2, tuY + 1, w * 0.045, pal.core, 1.5, P)
    s.line(tuX + w * 0.05 + gunLen, tuY + 1, tuX + w * 0.05 + gunLen + w * 0.12, tuY - 2, pal.accent, 0.5)
  } else {
    s.px(tuX + w * 0.05 + gunLen, tuY + 1, pal.accent, 0.8)
  }

  // ---- 天线 / 冠饰 / 侧挂散热片
  crest(s, tuX, tuY - h * 0.06, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 150)
  for (const dx of [-1, 1]) {
    s.rect(cx + dx * w * 0.18 - 2, torY - h * 0.18, 4, h * 0.1, pal.plateD)
    for (let i = 0; i < 3; i++) s.px(cx + dx * w * 0.18, torY - h * 0.17 + i * 4, pal.plate)
  }
  // 尾喷（行走时冒气）
  s.rect(cx - w * 0.22, torY - h * 0.06, 6, 10, pal.plateD)
  if (P.anim === 'move') s.px(cx - w * 0.23 - (P.i % 2) * 2, torY - h * 0.02, PAL.ashPale, 0.4)
}
