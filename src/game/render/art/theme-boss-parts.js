// 锈雨 · RUSTFALL —— 主题 BOSS 立绘零件库
// 51 只主题 BOSS 每只独占造型：本文件提供调色、冠饰、武器、核心光等共用零件，
// 具体体型由 theme-boss-plans-*.js 里的体型函数绘制。
// 约定：画布底部一行是脚/投影，朝向 +x（朝右）；alpha 只 0/255。

import { PAL } from '../palette.js'
import { mix, shade, mulberry32 } from './core.js'

export const TAU = Math.PI * 2

/** 0x8fc4ff -> '#8fc4ff' */
export function hexOf(n) {
  return '#' + (Number(n) || 0).toString(16).padStart(6, '0')
}

/** 家族基色（机器 / 人类 / 变异 / 异种），再按每只 BOSS 的 accent 调色。 */
const FAM_BASE = {
  machine: PAL.steelBlue,
  human: PAL.rust,
  mutant: PAL.moss,
  alien: PAL.waterHi,
}

export function bossPalette(cfg) {
  const accent = hexOf(cfg.accent)
  const fam = FAM_BASE[cfg.family] || PAL.steelBlue
  const body = mix(fam, accent, 0.22)
  const bodyD = mix(body, PAL.void, 0.4)
  const bodyL = mix(body, PAL.white, 0.16)
  const plate = mix(fam, PAL.ashPale, 0.32)
  const plateD = mix(plate, PAL.void, 0.34)
  const trim = mix(accent, PAL.white, 0.12)
  const warm = mix(body, accent, 0.5)
  const outline = mix(PAL.void, accent, 0.16)
  return { accent, body, bodyD, bodyL, plate, plateD, trim, warm, outline, core: accent }
}

/** 接地投影（所有体型统一）。 */
export function baseShadow(s, def, cx) {
  s.shadow(cx, s.h - 2, def.w * 0.3, 4, 0.55)
}

/** 动画相位：返回 -1..1，用于腿/臂摆动。 */
export function legPhase(P) {
  if (P.anim === 'move') return Math.sin(((P.i % 3) / 3) * TAU)
  if (P.anim === 'attack') return 0.4
  if (P.anim === 'hurt') return -0.3
  return 0
}

/** 呼吸/起伏偏移（像素）。 */
export function bob(P, amp = 2) {
  if (P.anim === 'idle') return (P.i % 2 ? -1 : 1) * amp * 0.5
  if (P.anim === 'move') return Math.sin(((P.i % 3) / 3) * TAU) * amp
  if (P.anim === 'attack') return -amp * (1 + P.i * 0.6)
  return -amp * 0.4
}

/** 冠饰：0 双角 / 1 王冠 / 2 天线碟 / 3 面甲视缝 / 4 光环尖刺 */
export function crest(s, x, y, k, c, cD, accent, sc = 1) {
  const u = sc
  switch (k % 5) {
    case 0: {
      // 双角：向外上再前钩
      s.thick(x - 7 * u, y, x - 12 * u, y - 9 * u, 1.8 * u, cD)
      s.thick(x - 12 * u, y - 9 * u, x - 9 * u, y - 15 * u, 1.2 * u, c)
      s.px(x - 9 * u, y - 15 * u, PAL.bone)
      s.thick(x + 7 * u, y, x + 11 * u, y - 8 * u, 1.6 * u, cD)
      s.thick(x + 11 * u, y - 8 * u, x + 8 * u, y - 13 * u, 1.1 * u, c)
      break
    }
    case 1: {
      // 王冠：三段锯齿 + 宝石
      s.poly(
        [
          [x - 10 * u, y], [x - 10 * u, y - 5 * u], [x - 6 * u, y - 3 * u],
          [x - 4 * u, y - 9 * u], [x - 1 * u, y - 4 * u],
          [x + 2 * u, y - 10 * u], [x + 5 * u, y - 4 * u],
          [x + 9 * u, y - 6 * u], [x + 9 * u, y],
        ],
        c,
      )
      s.line(x - 10 * u, y - 5 * u, x + 9 * u, y - 6 * u, cD)
      s.px(x - 2 * u, y - 5 * u, accent)
      s.px(x + 3 * u, y - 4 * u, accent)
      break
    }
    case 2: {
      // 天线 + 小碟
      s.thick(x + 2 * u, y, x + 5 * u, y - 16 * u, 0.9 * u, cD)
      s.line(x + 5 * u, y - 16 * u, x + 5 * u, y - 10 * u, c, 0.6)
      s.ell(x + 5 * u, y - 18 * u, 4 * u, 1.6 * u, c)
      s.px(x + 5 * u, y - 19 * u, accent)
      break
    }
    case 3: {
      // 面甲：横向视缝 + 两颗铆钉
      s.rect(x - 8 * u, y - 6 * u, 16 * u, 4 * u, cD)
      s.rect(x - 6 * u, y - 5 * u, 12 * u, 1.4 * u, accent)
      s.px(x - 8 * u, y - 6 * u, c)
      s.px(x + 8 * u, y - 6 * u, c)
      break
    }
    default: {
      // 光环 + 尖刺
      s.ell(x, y - 13 * u, 12 * u, 3.4 * u, c, 0.45)
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI
        const px = x + Math.cos(a) * 12 * u
        const py = y - 13 * u - Math.sin(a) * 3.4 * u
        s.thick(px, py, px + Math.cos(a) * 3 * u, py - 4 * u, 0.8 * u, cD)
      }
      s.px(x, y - 13 * u, accent)
      break
    }
  }
}

/**
 * 手持武器（画在手的末端）：0 巨拳 / 1 刀锋 / 2 炮管 / 3 战锤 / 4 长枪
 * 返回 [tipX, tipY]，便于武器尖端加发光。
 */
export function weaponAt(s, hx, hy, k, c, cD, accent, len, aim = 0) {
  const L = len
  switch (k % 5) {
    case 0: {
      // 巨拳：前臂 + 指节
      s.thick(hx, hy, hx + L * 0.55, hy + 2, 4.2, c)
      s.ell(hx + L * 0.66, hy + 2, L * 0.2, L * 0.17, c)
      s.ell(hx + L * 0.66, hy + 2, L * 0.2, L * 0.17, cD, 0.25)
      for (let i = 0; i < 3; i++) s.px(hx + L * 0.56 + i * 3, hy + 0.5, cD)
      s.px(hx + L * 0.7, hy - 2, accent, 0.8)
      return [hx + L * 0.8, hy + 4]
    }
    case 1: {
      // 刀锋：斜向长刃，刃口高亮
      const ex = hx + L * 0.75
      const ey = hy - L * 0.35 + aim
      s.thick(hx, hy, hx + L * 0.3, hy - L * 0.1, 2.2, cD)
      s.poly([[hx + L * 0.25, hy], [ex, ey], [ex - L * 0.1, ey + L * 0.22], [hx + L * 0.3, hy + 3]], c)
      s.line(hx + L * 0.3, hy + 3, ex - L * 0.1, ey + L * 0.22, PAL.white, 0.55)
      s.line(hx + L * 0.32, hy + 1, ex - L * 0.02, ey + 1, accent, 0.7)
      return [ex, ey]
    }
    case 2: {
      // 炮管：粗管 + 炮口
      s.thick(hx, hy, hx + L * 0.55, hy - L * 0.12, 3.6, cD)
      s.rect(hx + L * 0.45, hy - L * 0.24, L * 0.45, 6, c)
      s.rect(hx + L * 0.45, hy - L * 0.24, L * 0.45, 2, cD)
      s.rect(hx + L * 0.86, hy - L * 0.3, 3, 8, cD)
      s.px(hx + L * 0.9, hy - L * 0.12, accent)
      return [hx + L * 0.9, hy - L * 0.12]
    }
    case 3: {
      // 战锤：柄 + 方块锤头
      s.thick(hx, hy, hx + L * 0.55, hy - L * 0.5, 1.8, cD)
      const hxp = hx + L * 0.55
      const hyp = hy - L * 0.5
      s.rect(hxp - L * 0.1, hyp - 8, L * 0.3, 16, c)
      s.rect(hxp - L * 0.1, hyp - 8, L * 0.3, 3, cD)
      s.px(hxp + L * 0.06, hyp - 4, accent)
      return [hxp + L * 0.2, hyp]
    }
    default: {
      // 长枪 / 法杖：细长杆 + 尖端
      const ex = hx + L * 0.85
      const ey = hy - L * 0.55
      s.thick(hx, hy, ex, ey, 1.2, cD)
      s.poly([[ex, ey - 4], [ex + 5, ey + 1], [ex, ey + 4]], accent)
      s.px(ex + 1, ey, PAL.white)
      return [ex + 5, ey]
    }
  }
}

/** 发光核心：中心亮点 + 脉动光晕，同时登记到 F.g 供统一 glow 管线。 */
export function core(s, F, x, y, r, c, amp = 1, P = null) {
  const pulse = P && P.anim === 'attack' ? 1.35 : 1
  s.disc(x, y, r * 0.62 * pulse, c)
  s.disc(x, y, r * 0.34 * pulse, PAL.white)
  if (F && F.g) F.g.push({ x, y, r: r * 2.1 * amp * pulse, c, p: 0.85 })
}

/** 铆钉排。 */
export function rivets(s, rnd, x, y, w, n, c) {
  for (let i = 0; i < n; i++) {
    s.px(x + (i / Math.max(1, n - 1)) * w, y, c)
  }
}

/** 装甲板：亮边 + 暗底 + 一两道接缝。 */
export function panel(s, x, y, w, h, c, cD, cL) {
  s.rect(x, y, w, h, c)
  s.rect(x, y, w, 1.4, cL || mix(c, PAL.white, 0.2))
  s.line(x, y + h - 1, x + w - 1, y + h - 1, cD)
  s.line(x + w * 0.62, y + 1, x + w * 0.62, y + h - 2, cD, 0.7)
}

/** 破布 / 破损布条（人类与亡魂共用）。 */
export function rags(s, rnd, x, y, w, h, c, cD, n = 4) {
  for (let i = 0; i < n; i++) {
    const rx = x + rnd() * w
    const rw = 3 + rnd() * 6
    const rh = h * (0.4 + rnd() * 0.6)
    s.poly(
      [
        [rx, y],
        [rx + rw, y + 1],
        [rx + rw - 1 + rnd() * 2, y + rh],
        [rx + 1, y + rh - 1],
      ],
      rnd() < 0.5 ? c : cD,
      0.9,
    )
  }
}

/** 小圆碟（关节 / 轨道球 / 眼球）。 */
export function orb(s, x, y, r, c, cD, hi) {
  s.disc(x, y, r, c)
  s.disc(x - r * 0.3, y - r * 0.3, r * 0.4, hi || mix(c, PAL.white, 0.4))
  s.ell(x, y + r * 0.7, r, r * 0.3, cD, 0.6)
}

/** 分叉状肢体（虫腿 / 根须）。返回膝盖点。 */
export function bentLimb(s, x0, y0, x1, y1, knee, r, c, cD) {
  const mx = (x0 + x1) / 2 + knee
  const my = (y0 + y1) / 2 - Math.abs(knee) * 0.6
  s.thick(x0, y0, mx, my, r, c)
  s.thick(mx, my, x1, y1, r * 0.72, cD || c)
  s.disc(mx, my, r * 0.8, c)
  return [mx, my]
}

/** 人形 BOSS 的专属配件：0 残旗 / 1 后肩尖刺 / 2 腰侧工具包 / 3 背部燃料罐。画在身体后方。 */
export function accessoryHuman(s, cfg, pal, x, shY, hipY, w, h) {
  const k = (cfg.seed >>> 5) % 4
  switch (k) {
    case 0: {
      // 背后旗杆 + 破旗（向左后方飘）
      const px = x - w * 0.3
      const topY = shY - h * 0.22
      s.thick(px, hipY + h * 0.06, px - w * 0.06, topY, 1.6, pal.plateD)
      s.poly(
        [
          [px - w * 0.06, topY],
          [px - w * 0.42, topY + h * 0.03],
          [px - w * 0.36, topY + h * 0.06],
          [px - w * 0.43, topY + h * 0.1],
          [px - w * 0.07, topY + h * 0.12],
        ],
        pal.accent,
      )
      s.line(px - w * 0.07, topY + h * 0.02, px - w * 0.07, topY + h * 0.11, pal.bodyD)
      s.px(px - w * 0.06, topY, pal.plate)
      break
    }
    case 1: {
      // 后肩三根尖刺
      for (let i = 0; i < 3; i++) {
        const sx = x - w * 0.21 + i * w * 0.055
        const sy = shY + 2 - i * 2.5
        s.poly([[sx - 3, sy], [sx, sy - h * 0.1], [sx + 3, sy]], pal.plateD)
        s.px(sx, sy - h * 0.1, pal.accent, 0.7)
      }
      break
    }
    case 2: {
      // 腰侧工具包 + 挂链
      s.rect(x - w * 0.29, hipY - h * 0.06, w * 0.13, h * 0.1, pal.plateD)
      s.rect(x - w * 0.29, hipY - h * 0.06, w * 0.13, 2, pal.plate)
      s.line(x - w * 0.25, hipY - h * 0.06, x - w * 0.17, hipY - 4, pal.bodyD, 0.8)
      s.px(x - w * 0.26, hipY - h * 0.005, pal.accent, 0.8)
      break
    }
    default: {
      // 背部双燃料罐
      for (let i = 0; i < 2; i++) {
        const tx = x - w * 0.35 + i * w * 0.08
        s.ell(tx, shY + h * 0.07, w * 0.045, h * 0.075, pal.plateD)
        s.ell(tx - 1, shY + h * 0.05, w * 0.03, h * 0.045, pal.plate, 0.7)
        s.rect(tx - w * 0.03, shY + h * 0.13, w * 0.06, 2, pal.bodyD)
      }
      break
    }
  }
}

/** 机甲 BOSS 的专属配件：0 吊臂 / 1 导弹巢 / 2 塔盾 / 3 天线阵列。画在身体后方。 */
export function accessoryMech(s, cfg, pal, x, shY, hipY, w, h) {
  const k = (cfg.seed >>> 7) % 4
  switch (k) {
    case 0: {
      // 肩后吊臂：两段折臂 + 吊钩
      const bx = x - w * 0.26
      s.thick(bx, shY + 4, bx - w * 0.14, shY - h * 0.11, 2.6, pal.plateD)
      s.thick(bx - w * 0.14, shY - h * 0.11, bx + w * 0.02, shY - h * 0.2, 2.2, pal.plateD)
      s.line(bx + w * 0.02, shY - h * 0.2, bx + w * 0.02, shY - h * 0.14, pal.bodyD)
      s.poly(
        [
          [bx + w * 0.02 - 3, shY - h * 0.14],
          [bx + w * 0.02 + 3, shY - h * 0.14],
          [bx + w * 0.02, shY - h * 0.1],
        ],
        pal.plateD,
      )
      break
    }
    case 1: {
      // 肩顶导弹巢：两排三孔
      const mx = x - w * 0.12
      const my = shY - h * 0.065
      s.rect(mx - w * 0.12, my, w * 0.2, h * 0.055, pal.plateD)
      s.rect(mx - w * 0.12, my, w * 0.2, 1.6, pal.plate)
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          const px = mx - w * 0.07 + c * w * 0.05
          const py = my + h * 0.018 + r * h * 0.022
          s.disc(px, py, 1.6, PAL.void)
          s.px(px + 1, py - 1, pal.accent, 0.8)
        }
      }
      break
    }
    case 2: {
      // 背后塔盾：竖长方形带观察缝
      s.poly(
        [
          [x - w * 0.35, shY + h * 0.02],
          [x - w * 0.2, shY - h * 0.02],
          [x - w * 0.18, hipY + h * 0.05],
          [x - w * 0.33, hipY + h * 0.08],
        ],
        pal.plateD,
      )
      s.line(x - w * 0.3, shY + h * 0.03, x - w * 0.27, hipY + h * 0.06, pal.plate)
      s.rect(x - w * 0.3, shY + h * 0.05, w * 0.05, 2, pal.accent, 0.7)
      break
    }
    default: {
      // 天线阵列：三条不等高管
      for (let i = 0; i < 3; i++) {
        const ax = x - w * 0.3 + i * w * 0.07
        const ah = h * (0.1 + i * 0.03)
        s.thick(ax, shY + 2, ax - 2, shY - ah, 0.9, pal.plateD)
        s.px(ax - 2, shY - ah, pal.accent, i === 1 ? 1 : 0.6)
      }
      break
    }
  }
}

/** 植物 BOSS 的专属配件：0 垂果串 / 1 蘑菇伞 / 2 荆棘环 / 3 侧叶扇。画在本体后方。 */
export function accessoryPlant(s, cfg, pal, cx, hdY, h, w) {
  const k = (cfg.seed >>> 4) % 4
  switch (k) {
    case 0: {
      // 左侧垂果串
      const bx = cx - w * 0.14
      s.thick(bx, hdY + h * 0.05, bx - w * 0.1, hdY + h * 0.01, 1.4, pal.bodyD)
      for (let i = 0; i < 3; i++) {
        const fx = bx - w * 0.07 + (i % 2) * w * 0.05
        const fy = hdY + h * 0.09 + i * h * 0.042
        s.line(fx, hdY + h * 0.02, fx, fy - h * 0.02, pal.bodyD, 0.8)
        s.ell(fx, fy, w * 0.028, h * 0.03, pal.accent, 0.9)
        s.px(fx - 1, fy - 2, pal.trim)
      }
      break
    }
    case 1: {
      // 左后蘑菇伞
      const mx = cx - w * 0.3
      const my = hdY + h * 0.06
      s.thick(mx, my + h * 0.09, mx, my, 2.4, pal.plateD)
      s.ell(mx, my, w * 0.13, h * 0.035, pal.plate)
      s.ell(mx, my - h * 0.01, w * 0.09, h * 0.024, pal.plateD, 0.8)
      for (let i = 0; i < 3; i++) s.px(mx - w * 0.06 + i * w * 0.05, my, pal.accent, 0.8)
      break
    }
    case 2: {
      // 荆棘环：绕花苞一圈朝外的刺
      const rx = w * 0.22
      const ry = h * 0.13
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU
        const px = cx + Math.cos(a) * rx
        const py = hdY + Math.sin(a) * ry
        s.poly(
          [
            [px + Math.cos(a) * 5, py + Math.sin(a) * 6],
            [px + Math.cos(a + 0.3) * 2, py + Math.sin(a + 0.3) * 2],
            [px + Math.cos(a - 0.3) * 2, py + Math.sin(a - 0.3) * 2],
          ],
          pal.bodyD,
        )
      }
      break
    }
    default: {
      // 左侧大叶扇
      for (let i = 0; i < 3; i++) {
        const ly = hdY + h * (0.03 + i * 0.05)
        const len = w * (0.3 - i * 0.04)
        s.poly(
          [
            [cx - w * 0.12, ly],
            [cx - w * 0.12 - len, ly - h * 0.05 + i * h * 0.02],
            [cx - w * 0.12 - len * 0.82, ly + h * 0.05],
          ],
          i % 2 ? pal.body : pal.bodyD,
        )
        s.line(cx - w * 0.12, ly, cx - w * 0.12 - len * 0.8, ly, pal.trim, 0.4)
      }
      break
    }
  }
}

/** 亡魂 BOSS 的专属配件：0 背后长幡 / 1 提灯 / 2 破碎光环 / 3 背部骨肋。画在本体后方。 */
export function accessoryWraith(s, cfg, pal, cx, shY, h, w) {
  const k = (cfg.seed >>> 6) % 4
  switch (k) {
    case 0: {
      // 背后长幡：斜插旗杆 + 竖条破布
      const px = cx - w * 0.26
      s.thick(px, shY + h * 0.32, px - 6, shY - h * 0.13, 1.2, pal.bodyD)
      s.poly(
        [
          [px - 6, shY - h * 0.13],
          [px + w * 0.02, shY - h * 0.11],
          [px + 4, shY + h * 0.05],
          [px - 10, shY + h * 0.07],
        ],
        pal.accent,
        0.8,
      )
      s.line(px - 6, shY - h * 0.12, px - 10, shY + h * 0.06, pal.bodyD, 0.6)
      break
    }
    case 1: {
      // 提灯：垂在左后侧，暖光芯
      const lx = cx - w * 0.3
      const ly = shY + h * 0.16
      s.line(cx - w * 0.2, shY + h * 0.04, lx, ly - 6, pal.bodyD, 0.8)
      s.rect(lx - 4, ly - 6, 8, 10, pal.plateD)
      s.rect(lx - 3, ly - 5, 6, 7, pal.accent)
      s.px(lx, ly - 1, PAL.white)
      s.rect(lx - 4, ly + 4, 8, 2, pal.plate)
      break
    }
    case 2: {
      // 破碎光环：头上半圈断环
      const hy = shY - h * 0.115
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.12 + (i / 9) * Math.PI * 0.95
        s.thick(
          cx + Math.cos(a) * w * 0.2,
          hy - Math.sin(a) * h * 0.034,
          cx + Math.cos(a + 0.1) * w * 0.2,
          hy - Math.sin(a + 0.1) * h * 0.034,
          0.9,
          pal.accent,
        )
      }
      break
    }
    default: {
      // 背部骨肋：三条斜肋拱起
      for (let i = 0; i < 3; i++) {
        const ry = shY + h * (0.02 + i * 0.06)
        s.thick(cx - w * 0.17, ry, cx - w * 0.32 - i * 2, ry + h * 0.1, 1.3, pal.plateD)
        s.px(cx - w * 0.32 - i * 2, ry + h * 0.1, pal.accent, 0.6)
      }
      break
    }
  }
}

/** 每只 BOSS 专属随机源（同一 id 每次生成一致）。 */
export function bossRng(seed) {
  return mulberry32(seed >>> 0)
}

/** 把 accent 混进暗部，避免成为黑色块。 */
export function liftDark(c) {
  return mix(c, PAL.void0, 0)
}

export { shade }
