// ============================================================================
// 锈雨 · RUSTFALL —— 武器 / 弹丸美术（WEAPON）
// ----------------------------------------------------------------------------
// 契约（覆盖同文件占位版，导出名保持不变；机器人实体按“贴图”消费）：
//   export function getWeaponArt(id)      -> THREE.CanvasTexture  // 28×14 图标
//   export function getWeaponHoldArt(id)  -> THREE.CanvasTexture  // 32×24 持握（朝右）
//   export function getProjectileArt(kind)-> THREE.CanvasTexture  // 12×6
//   export function preloadArt() / clearWeaponCache()
//
// 12 把武器（与 src/game/weapons/data.js 的 id 一一对应）：
//   laser_pistol  laser_rifle  rail_spike  semi_pistol  nailgun  scrap_launcher
//   arc_emitter   iron_pipe    dagger      hammer       wrench_heavy  shock_baton
// 弹丸 7 种：laser bullet nail scrap arc rail shock
//
// 所有贴图：透明底、硬边、alpha 仅 0/255、NearestFilter / SRGB / 无 mipmap / 缓存。
// 未知 id 用 FNV 哈希稳定映射到 12 把之一（同一 id 永远同一张图）。
// ============================================================================

import { PAL } from '../palette.js'
import { Surf, mix, shade, strSeed } from './core.js'

/* ============================================================================
 * 1. 局部坐标下的武器几何（x: 0..22 枪口在右，y: 0 为中轴）
 * ========================================================================== */

const GLOW = {
  laser_pistol: PAL.neon,
  laser_rifle: PAL.neon,
  rail_spike: PAL.neonCold,
  arc_emitter: PAL.signal,
  shock_baton: PAL.signal,
  nailgun: PAL.neonWarm,
  scrap_launcher: PAL.rustHot,
  semi_pistol: PAL.neonWarm,
  gravity_emitter: PAL.neonCold,
  tesla_arc: PAL.signal,
  plasma_cannon: PAL.toxicGlow,
  fatman: PAL.warn,
  smart_rifle: PAL.neonWarm,
  chainblade: PAL.warn,
}

/** 握把（斜向下）。 */
function grip(s, x, y, w, h, c, dark) {
  s.poly(
    [
      [x, y],
      [x + w, y],
      [x + w - 2, y + h],
      [x - 2, y + h],
    ],
    dark,
  )
  s.line(x + 1, y + 1, x + w - 1, y + 1, c, 1)
  s.line(x, y + 2, x - 1, y + h - 1, dark, 1)
  // 防滑纹
  for (let k = 0; k < 3; k++) s.px(x + 1, y + 3 + k * 2, c)
}

/** 枪管（带高光）。 */
function barrel(s, x, y, len, thick, c, lite, dark) {
  s.rect(x, y - thick / 2, len, thick, dark)
  s.rect(x, y - thick / 2 + 1, len, Math.max(1, thick - 2), c)
  s.line(x, y - thick / 2 + 1, x + len - 1, y - thick / 2 + 1, lite, 1)
}

/** 弹匣。 */
function magazine(s, x, y, w, h, c, dark) {
  s.rect(x, y, w, h, dark)
  s.rect(x + 1, y + 1, w - 2, h - 1, c)
  s.line(x + 1, y + h - 1, x + w - 2, y + h - 1, PAL.void, 1)
}

/** 瞄准镜 / 电池。 */
function scope(s, x, y, len, c, lite) {
  s.rect(x, y - 1, len, 3, PAL.steelDark)
  s.rect(x + 1, y, len - 2, 1, c)
  s.px(x + len - 2, y, lite)
}

/** 在局部坐标画一把武器。 */
function weaponBody(s, id, ox, oy) {
  const X = (x) => ox + x
  const Y = (y) => oy + y
  const steel = PAL.steel
  const steelD = PAL.steelDark
  const steelL = PAL.steelLight

  switch (id) {
    case 'laser_pistol': {
      // 紧凑能量手枪：短枪身 + 顶部电池 + 青镜头
      s.rect(X(4), Y(-3), 12, 5, steelD)
      s.rect(X(4), Y(-2), 12, 3, steel)
      s.rect(X(4), Y(-2), 9, 1, steelL)
      barrel(s, X(14), Y(-1), 6, 3, steel, steelL, steelD)
      s.rect(X(16), Y(-2), 2, 3, PAL.void)
      s.px(X(17), Y(-1), GLOW[id])
      s.rect(X(15), Y(-3), 3, 1, PAL.neon)
      scope(s, X(6), Y(-4), 6, PAL.steelLight, PAL.white)
      grip(s, X(5), Y(2), 4, 5, steel, steelD)
      s.px(X(1), Y(-1), PAL.steelLight)
      break
    }
    case 'laser_rifle': {
      // 长管能量步枪：枪托 + 长枪管 + 瞄准镜 + 线圈
      s.poly(
        [
          [X(0), Y(-1)],
          [X(4), Y(-3)],
          [X(6), Y(2)],
          [X(1), Y(3)],
        ],
        mix(PAL.dust, PAL.steel, 0.4),
      )
      s.rect(X(4), Y(-3), 10, 5, steelD)
      s.rect(X(4), Y(-2), 10, 3, steel)
      barrel(s, X(14), Y(-1), 11, 3, steel, steelL, steelD)
      for (let k = 0; k < 3; k++) s.rect(X(15 + k * 3), Y(-2), 1, 3, PAL.neon)
      s.rect(X(24), Y(-2), 2, 3, PAL.void)
      s.px(X(25), Y(-1), PAL.white)
      scope(s, X(6), Y(-5), 8, steelL, PAL.white)
      s.rect(X(7), Y(-4), 2, 1, GLOW[id])
      grip(s, X(6), Y(2), 3, 5, steel, steelD)
      magazine(s, X(10), Y(2), 4, 4, steelL, steelD)
      break
    }
    case 'rail_spike': {
      // 轨道钉：双轨 + 线圈 + 尖刺
      s.rect(X(2), Y(-2), 8, 4, steelD)
      s.rect(X(2), Y(-1), 8, 2, steel)
      for (let k = 0; k < 4; k++) {
        s.rect(X(10 + k * 3), Y(-3), 2, 6, PAL.steelDark)
        s.rect(X(10 + k * 3), Y(-2), 1, 4, PAL.neonCold)
      }
      // 双轨
      s.line(X(1), Y(-2), X(22), Y(-1), PAL.steelLight)
      s.line(X(1), Y(1), X(22), Y(0), PAL.steelLight)
      // 尖刺
      s.poly(
        [
          [X(20), Y(-1)],
          [X(25), Y(0)],
          [X(20), Y(2)],
        ],
        PAL.steelWhite,
      )
      s.px(X(24), Y(0), PAL.white)
      grip(s, X(4), Y(1), 3, 5, mix(PAL.dust, steel, 0.3), steelD)
      s.rect(X(0), Y(-2), 4, 4, mix(PAL.dust, PAL.rust, 0.35))
      break
    }
    case 'semi_pistol': {
      // 常规半自动手枪
      s.rect(X(4), Y(-3), 13, 4, steelD)
      s.rect(X(4), Y(-2), 13, 2, steel)
      s.line(X(5), Y(-3), X(15), Y(-3), steelL, 1)
      barrel(s, X(16), Y(-1), 5, 2, steel, steelL, steelD)
      s.px(X(20), Y(-1), PAL.void)
      // 套筒纹
      for (let k = 0; k < 3; k++) s.rect(X(9 + k * 2), Y(-2), 1, 2, steelD)
      grip(s, X(5), Y(1), 4, 5, mix(PAL.rust, steel, 0.4), steelD)
      // 扳机护圈
      s.line(X(9), Y(1), X(12), Y(1), steelD, 1)
      s.px(X(9), Y(2), steelD)
      s.px(X(11), Y(1), PAL.neonWarm)
      s.px(X(0), Y(-1), PAL.neonWarm, 0.9)
      break
    }
    case 'nailgun': {
      // 气动钉枪：气罐 + 细枪管 + 钉匣
      s.disc(X(4), Y(0), 4, steelD)
      s.disc(X(4), Y(0), 2.8, PAL.steelBlue)
      s.px(X(3), Y(-2), steelL)
      s.rect(X(7), Y(-3), 9, 5, PAL.rust)
      s.rect(X(7), Y(-2), 9, 3, mix(PAL.rust, PAL.steel, 0.4))
      barrel(s, X(16), Y(-1), 9, 2, steel, steelL, steelD)
      // 钉匣
      magazine(s, X(9), Y(2), 5, 3, steelL, steelD)
      grip(s, X(6), Y(1), 3, 5, PAL.dust, steelD)
      // 气压表
      s.disc(X(12), Y(-4), 2, steelD)
      s.px(X(12), Y(-4), PAL.neonWarm)
      break
    }
    case 'scrap_launcher': {
      // 废料发射器：粗管 + 料斗
      s.rect(X(2), Y(-4), 16, 9, steelD)
      s.rect(X(2), Y(-3), 16, 7, mix(PAL.rust, PAL.steel, 0.35))
      s.rect(X(2), Y(-3), 16, 1, PAL.rustLight)
      s.rect(X(2), Y(3), 16, 1, PAL.rustDark)
      // 管口
      s.rect(X(18), Y(-4), 4, 9, PAL.steelDark)
      s.rect(X(19), Y(-3), 3, 7, PAL.void)
      s.px(X(20), Y(0), PAL.rustHot)
      // 料斗（上面堆废料）
      s.poly(
        [
          [X(6), Y(-4)],
          [X(13), Y(-4)],
          [X(12), Y(-8)],
          [X(7), Y(-8)],
        ],
        PAL.steelDark,
      )
      s.rect(X(7), Y(-8), 5, 3, PAL.rust)
      s.px(X(8), Y(-9), PAL.steelLight)
      s.px(X(10), Y(-9), PAL.rustLight)
      grip(s, X(7), Y(4), 3, 4, PAL.dust, steelD)
      break
    }
    case 'arc_emitter': {
      // 电弧发射器：双叉 + 线圈 + 电弧
      s.rect(X(3), Y(-3), 11, 6, steelD)
      s.rect(X(3), Y(-2), 11, 4, PAL.steelBlue)
      for (let k = 0; k < 3; k++) s.rect(X(6 + k * 3), Y(-3), 2, 6, PAL.neon)
      // 双叉
      s.line(X(14), Y(-2), X(21), Y(-5), PAL.steelLight)
      s.line(X(14), Y(2), X(21), Y(5), PAL.steelLight)
      s.px(X(21), Y(-5), PAL.white)
      s.px(X(21), Y(5), PAL.white)
      // 电弧
      s.line(X(19), Y(-4), X(20), Y(-2), PAL.signal)
      s.line(X(20), Y(-2), X(19), Y(0), PAL.signal)
      s.line(X(19), Y(0), X(20), Y(2), PAL.signal)
      s.line(X(20), Y(2), X(19), Y(4), PAL.signal)
      grip(s, X(5), Y(2), 3, 5, PAL.dust, steelD)
      // 电容
      s.disc(X(4), Y(-4), 2, steelD)
      s.px(X(4), Y(-4), PAL.neon)
      break
    }
    case 'iron_pipe': {
      // 铁管（近战）：一根有胶带的管子
      s.thick(X(1), Y(0), X(21), Y(0), 2.2, PAL.steelDark)
      s.thick(X(1), Y(-0.5), X(20), Y(-0.5), 1.4, PAL.steel)
      s.line(X(2), Y(-1), X(19), Y(-1), PAL.steelWhite, 0.9)
      // 胶带握把
      for (let k = 0; k < 4; k++) s.rect(X(3 + k * 2), Y(-2), 1, 4, PAL.rust)
      // 弯头 + 锈
      s.poly(
        [
          [X(21), Y(-2)],
          [X(24), Y(-1)],
          [X(24), Y(1)],
          [X(21), Y(2)],
        ],
        PAL.steelLight,
      )
      s.px(X(10), Y(1), PAL.rustDark)
      s.px(X(14), Y(-1), PAL.rustDark)
      break
    }
    case 'dagger': {
      // 匕首：短刃 + 护手 + 缠布柄
      s.poly(
        [
          [X(10), Y(-2)],
          [X(22), Y(-1)],
          [X(22), Y(1)],
          [X(10), Y(2)],
        ],
        PAL.steelLight,
      )
      s.line(X(10), Y(-1), X(21), Y(0), PAL.white, 1)
      s.line(X(11), Y(1), X(21), Y(0), PAL.steel, 1)
      // 护手
      s.rect(X(8), Y(-4), 3, 8, PAL.rust)
      s.rect(X(8), Y(-4), 3, 1, PAL.rustLight)
      // 柄
      s.rect(X(2), Y(-2), 7, 4, PAL.dust)
      s.rect(X(2), Y(-2), 7, 1, PAL.sand)
      for (let k = 0; k < 3; k++) s.rect(X(3 + k * 2), Y(-1), 1, 3, PAL.rustDark)
      s.disc(X(1), Y(0), 2, PAL.steelDark)
      break
    }
    case 'hammer': {
      // 大锤：长柄 + 锤头
      s.thick(X(1), Y(0), X(15), Y(0), 1.8, PAL.rustDark)
      s.thick(X(1), Y(-0.5), X(15), Y(-0.5), 1.1, PAL.dust)
      s.rect(X(2), Y(-2), 1, 4, PAL.rust)
      s.rect(X(6), Y(-2), 1, 4, PAL.rust)
      // 锤头
      s.rect(X(14), Y(-5), 9, 10, PAL.steelDark)
      s.rect(X(15), Y(-4), 7, 8, PAL.steel)
      s.rect(X(15), Y(-4), 7, 2, PAL.steelLight)
      s.rect(X(21), Y(-4), 2, 8, mix(PAL.steel, PAL.rust, 0.4))
      // 打击面磨损
      s.px(X(22), Y(-2), PAL.steelWhite)
      s.px(X(22), Y(2), PAL.rustDark)
      s.px(X(17), Y(0), PAL.rustDark)
      break
    }
    case 'wrench_heavy': {
      // 重型扳手：柄 + 开口钳
      s.thick(X(1), Y(1), X(15), Y(-1), 2.4, PAL.steelDark)
      s.thick(X(1), Y(0.5), X(15), Y(-1.5), 1.6, PAL.steel)
      s.line(X(2), Y(0), X(14), Y(-2), PAL.steelLight, 1)
      // 开口钳（上/下颚）
      s.poly(
        [
          [X(14), Y(-4)],
          [X(23), Y(-6)],
          [X(23), Y(-2)],
          [X(15), Y(-1)],
        ],
        PAL.steel,
      )
      s.poly(
        [
          [X(14), Y(2)],
          [X(23), Y(4)],
          [X(23), Y(0)],
          [X(15), Y(-1)],
        ],
        PAL.steel,
      )
      s.line(X(15), Y(-4), X(22), Y(-5), PAL.steelLight, 1)
      s.px(X(23), Y(-5), PAL.steelWhite)
      s.px(X(23), Y(3), PAL.steelLight)
      // 螺母
      s.disc(X(15), Y(-1), 2, PAL.steelDark)
      s.px(X(15), Y(-1), PAL.steelLight)
      break
    }
    case 'shock_baton': {
      // 电棍：绝缘柄 + 双电极 + 电弧
      s.thick(X(2), Y(0), X(17), Y(0), 2, PAL.steelDark)
      s.thick(X(2), Y(-0.4), X(17), Y(-0.4), 1.2, PAL.steel)
      // 绝缘柄
      for (let k = 0; k < 5; k++) s.rect(X(2 + k * 2), Y(-2), 1, 4, PAL.ink)
      // 电极环
      s.rect(X(18), Y(-3), 3, 6, PAL.steelLight)
      s.rect(X(19), Y(-2), 1, 4, PAL.signal)
      s.px(X(22), Y(-3), PAL.white)
      s.px(X(22), Y(3), PAL.white)
      s.line(X(20), Y(-3), X(22), Y(-1), PAL.signal)
      s.line(X(22), Y(-1), X(20), Y(1), PAL.signal)
      s.line(X(20), Y(1), X(22), Y(3), PAL.signal)
      // 电量指示
      s.px(X(6), Y(-2), PAL.neonWarm)
      break
    }
    case 'gravity_emitter': {
      // 引力投射器：厚重的线圈机体 + 前端引力球
      s.rect(X(2), Y(-5), 12, 10, steelD)
      s.rect(X(3), Y(-4), 10, 8, PAL.steelBlue)
      // 三道线圈
      for (let k = 0; k < 3; k++) {
        s.rect(X(5 + k * 3), Y(-6), 2, 12, PAL.steelDark)
        s.rect(X(5 + k * 3), Y(-6), 2, 1, steelL)
      }
      s.rect(X(14), Y(-6), 4, 12, PAL.steelDark)
      s.rect(X(15), Y(-5), 4, 10, PAL.void)
      // 引力球
      s.disc(X(18), Y(0), 4, PAL.neonCold)
      s.disc(X(18), Y(0), 2.4, PAL.white)
      s.px(X(20), Y(-3), PAL.white)
      grip(s, X(5), Y(5), 4, 5, PAL.dust, steelD)
      magazine(s, X(9), Y(5), 4, 4, PAL.steelLight, steelD)
      break
    }
    case 'tesla_arc': {
      // 特斯拉连发器：变压器 + 铜线圈 + 双电极
      s.rect(X(2), Y(-4), 9, 8, PAL.steelDark)
      s.rect(X(3), Y(-3), 7, 6, mix(PAL.steel, PAL.rust, 0.45))
      for (let k = 0; k < 3; k++) s.rect(X(3 + k * 2), Y(-4), 1, 8, PAL.neonWarm)
      s.rect(X(11), Y(-3), 7, 6, steelD)
      s.rect(X(12), Y(-2), 6, 4, steel)
      // 双电极
      s.line(X(18), Y(-2), X(23), Y(-4), steelL)
      s.line(X(18), Y(2), X(23), Y(4), steelL)
      s.px(X(23), Y(-4), PAL.white)
      s.px(X(23), Y(4), PAL.white)
      // 电弧
      s.line(X(20), Y(-3), X(21), Y(-1), PAL.signal)
      s.line(X(21), Y(-1), X(20), Y(1), PAL.signal)
      s.line(X(20), Y(1), X(21), Y(3), PAL.signal)
      grip(s, X(6), Y(4), 3, 5, PAL.dust, steelD)
      break
    }
    case 'plasma_cannon': {
      // 等离子重炮：上下双导轨 + 中间悬着的绿色等离子团
      s.rect(X(1), Y(-6), 15, 3, steelD)
      s.rect(X(1), Y(3), 15, 3, steelD)
      s.rect(X(1), Y(-5), 15, 1, steelL)
      s.rect(X(1), Y(4), 15, 1, steelL)
      for (let k = 0; k < 3; k++) {
        s.rect(X(4 + k * 4), Y(-7), 1, 2, PAL.toxicGlow)
        s.rect(X(4 + k * 4), Y(5), 1, 2, PAL.toxicGlow)
      }
      s.rect(X(14), Y(-6), 4, 12, PAL.steelDark)
      s.rect(X(15), Y(-5), 3, 10, PAL.void)
      // 等离子团
      s.disc(X(18), Y(0), 4, PAL.toxic)
      s.disc(X(18), Y(0), 2.2, PAL.toxicGlow)
      s.px(X(20), Y(-1), PAL.white)
      grip(s, X(4), Y(4), 4, 5, PAL.dust, steelD)
      magazine(s, X(8), Y(5), 5, 4, PAL.steelLight, steelD)
      break
    }
    case 'fatman': {
      // 微型核弹发射器：粗短炮管 + 侧开的装填口 + 橄榄弹头
      s.rect(X(1), Y(-6), 17, 12, steelD)
      s.rect(X(2), Y(-5), 15, 10, mix(PAL.rust, PAL.steel, 0.5))
      s.rect(X(2), Y(-5), 15, 1, PAL.rustLight)
      s.rect(X(2), Y(4), 15, 1, PAL.rustDark)
      // 管口
      s.rect(X(16), Y(-7), 4, 14, PAL.steelDark)
      s.rect(X(17), Y(-6), 3, 12, PAL.void)
      // 弹头（露在管口）
      s.disc(X(19), Y(0), 3, PAL.mossDead)
      s.px(X(19), Y(-2), PAL.warn)
      // 手摇托架
      for (let k = 0; k < 3; k++) s.rect(X(4 + k * 4), Y(-8), 2, 2, PAL.steelDark)
      grip(s, X(6), Y(6), 3, 5, PAL.dust, steelD)
      s.rect(X(10), Y(6), 5, 3, PAL.steelDark)
      s.line(X(4), Y(-6), X(4), Y(6), PAL.rustLight)
      break
    }
    case 'smart_rifle': {
      // 智能追踪步枪：细长枪身 + 前端镜组 + 侧挂弹匣
      s.rect(X(2), Y(-3), 15, 5, steelD)
      s.rect(X(2), Y(-2), 15, 3, steel)
      s.line(X(3), Y(-2), X(16), Y(-2), steelL, 1)
      barrel(s, X(16), Y(-1), 7, 2, steel, steelL, steelD)
      // 前端镜组（追踪模块）
      s.rect(X(17), Y(-6), 5, 5, PAL.steelDark)
      s.disc(X(19), Y(-4), 2, PAL.void)
      s.px(X(19), Y(-4), PAL.neonWarm)
      s.rect(X(17), Y(-6), 5, 1, PAL.steelLight)
      scope(s, X(6), Y(-5), 7, steelL, PAL.white)
      grip(s, X(6), Y(2), 3, 5, PAL.dust, steelD)
      magazine(s, X(10), Y(2), 4, 5, PAL.steelLight, steelD)
      s.px(X(1), Y(-1), PAL.neonWarm)
      break
    }
    case 'chainblade': {
      // 链锯剑：角钢剑身 + 沿刃口转动的锯链 + 小马达
      s.rect(X(2), Y(-2), 8, 4, PAL.steelDark)
      s.rect(X(3), Y(-1), 7, 2, PAL.rustDark)
      // 剑身
      s.rect(X(9), Y(-3), 13, 2, steelD)
      s.rect(X(9), Y(-2), 13, 1, steelL)
      // 锯链齿
      for (let k = 0; k < 6; k++) {
        s.px(X(10 + k * 2), Y(-4), PAL.steelWhite)
        s.px(X(10 + k * 2), Y(1), PAL.steelWhite)
      }
      s.px(X(22), Y(-3), PAL.white)
      // 马达 + 握把
      s.disc(X(6), Y(0), 3, PAL.steelDark)
      s.disc(X(6), Y(0), 1.6, PAL.rustHot)
      grip(s, X(3), Y(2), 4, 5, PAL.dust, steelD)
      break
    }
    default: {
      // 未知：按哈希退化成“铁管”，稳定不崩
      s.thick(X(1), Y(0), X(21), Y(0), 2, PAL.steelDark)
      s.thick(X(1), Y(-0.5), X(20), Y(-0.5), 1.2, PAL.steel)
      s.line(X(2), Y(-1), X(19), Y(-1), PAL.steelLight, 0.9)
      s.rect(X(3), Y(-2), 2, 4, PAL.rust)
      break
    }
  }
}

/** 武器类别（用于持握姿态与枪口效果）。 */
const KIND = {
  laser_pistol: 'energy',
  laser_rifle: 'energy',
  rail_spike: 'energy',
  arc_emitter: 'energy',
  shock_baton: 'energy',
  semi_pistol: 'gun',
  nailgun: 'gun',
  scrap_launcher: 'gun',
  iron_pipe: 'melee',
  dagger: 'melee',
  hammer: 'melee',
  wrench_heavy: 'melee',
  gravity_emitter: 'energy',
  tesla_arc: 'energy',
  plasma_cannon: 'energy',
  fatman: 'gun',
  smart_rifle: 'gun',
  chainblade: 'melee',
}

const MUZZLE = {
  laser_pistol: PAL.neon,
  laser_rifle: PAL.neon,
  rail_spike: PAL.neonCold,
  arc_emitter: PAL.signal,
  shock_baton: PAL.signal,
  semi_pistol: PAL.neonWarm,
  nailgun: PAL.neonWarm,
  scrap_launcher: PAL.rustHot,
  gravity_emitter: PAL.neonCold,
  tesla_arc: PAL.signal,
  plasma_cannon: PAL.toxicGlow,
  fatman: PAL.warn,
  smart_rifle: PAL.neonWarm,
  chainblade: PAL.warn,
}

/* ============================================================================
 * 2. 图标（28×14）
 * ========================================================================== */

const ICON_CACHE = new Map()

function buildIcon(id) {
  const s = new Surf(28, 14, strSeed('weapon:' + id), 'weapons')
  // 底影（抖动不透明像素）
  s.shadow(14, 12.5, 10, 1.2, 0.5)
  weaponBody(s, id, 1, 7)
  // 细节：锈 / 划痕
  for (let k = 0; k < 8; k++) {
    const x = 2 + ((k * 5) % 24)
    const y = 2 + ((k * 3) % 10)
    if (s.a(x, y) < 200) continue
    s.px(x, y, PAL.rustDark, 0.9)
  }
  s.edges(mix(PAL.white, PAL.sand, 0.5), PAL.void, 0.4, 0.45)
  s.outline(mix(PAL.void, PAL.steel, 0.18))
  // 能量武器：枪口/刃口的一点自发光
  const g = MUZZLE[id]
  if (g) {
    const mx = KIND[id] === 'melee' ? 22 : 24
    s.px(mx, 6, g, 1)
    s.glow(mx, 6, 4, g, 0.9)
  }
  return s.tex()
}

/**
 * 武器图标（28×14，透明底硬边）。未知 id 稳定退化为铁管造型。
 * 同一 id 返回同一 texture 实例。
 */
export function getWeaponArt(id) {
  const key = String(id || '')
  let tex = ICON_CACHE.get(key)
  if (!tex) {
    tex = buildIcon(key)
    ICON_CACHE.set(key, tex)
  }
  return tex
}

/* ============================================================================
 * 3. 持握姿态（32×24，朝右，含枪口方向）
 * ========================================================================== */

const HOLD_CACHE = new Map()

function buildHold(id) {
  const s = new Surf(32, 24, strSeed('hold:' + id) + 7, 'weapons')
  const kind = KIND[id] || 'gun'
  const isMelee = kind === 'melee'
  // 手臂（右手握把、左手托前）
  const armC = mix(PAL.rust, PAL.dust, 0.4)
  const armL = mix(armC, PAL.sand, 0.35)
  // 右臂（从右下进画）
  s.thick(26, 23, 18, 15, 3.2, PAL.steelDark)
  s.thick(26, 23, 18, 15, 2.2, armC)
  s.line(24, 21, 19, 16, armL, 0.9)
  // 左手（前握）
  const leftX = isMelee ? 12 : 14
  s.thick(6, 23, leftX, 16, 3, PAL.steelDark)
  s.thick(6, 23, leftX, 16, 2, mix(armC, PAL.rustDark, 0.3))
  // 握把 / 手指
  s.rect(15, 12, 5, 4, PAL.steelDark)
  s.rect(16, 12, 3, 3, PAL.steel)
  s.rect(leftX, 12, 4, 4, PAL.steelDark)
  s.rect(leftX + 1, 12, 2, 3, PAL.steel)

  // 武器本体（放大一点：在 32×24 里占据 y=8..16）
  weaponBody(s, id, 4, 12)

  // 枪口方向提示：能量武器加一点光
  const g = MUZZLE[id]
  if (g && !isMelee) {
    const mx = 28
    s.rect(mx, 10, 2, 3, g, 1)
    s.px(mx + 2, 11, PAL.white, 1)
    s.glow(mx, 11, 5, g, 1)
  }
  // 细节
  for (let k = 0; k < 6; k++) {
    const x = 4 + ((k * 7) % 26)
    const y = 6 + ((k * 5) % 14)
    if (s.a(x, y) < 200) continue
    s.px(x, y, PAL.rustDark, 0.9)
  }
  s.edges(mix(PAL.white, PAL.sand, 0.5), PAL.void, 0.35, 0.45)
  s.outline(mix(PAL.void, PAL.steel, 0.2))
  return s.tex()
}

/** 持握姿态（32×24，枪口朝右）。未知 id 退化为常规枪械。 */
export function getWeaponHoldArt(id) {
  const key = String(id || '')
  let tex = HOLD_CACHE.get(key)
  if (!tex) {
    tex = buildHold(key)
    HOLD_CACHE.set(key, tex)
  }
  return tex
}

/* ============================================================================
 * 4. 弹丸（12×6）
 * ========================================================================== */

const PROJ_CACHE = new Map()

const PROJ_DRAW = {
  laser: (s) => {
    s.rect(1, 2, 10, 3, PAL.neon, 1)
    s.rect(2, 3, 9, 1, PAL.white, 1)
    s.px(0, 3, PAL.neon, 0.9)
    s.glow(6, 3, 5, PAL.neon, 1)
  },
  bullet: (s) => {
    s.rect(8, 2, 2, 2, PAL.neonWarm, 1)
    s.px(9, 2, PAL.white, 1)
    for (let k = 0; k < 5; k++) s.px(7 - k, 3, PAL.rustHot, k < 2 ? 1 : 0.7)
    s.px(2, 3, PAL.rust, 0.9)
  },
  nail: (s) => {
    s.line(1, 3, 8, 3, PAL.steelLight, 1)
    s.rect(8, 2, 2, 2, PAL.steel, 1)
    s.px(10, 2, PAL.white, 1)
    s.px(0, 3, PAL.rustDark, 1)
  },
  scrap: (s) => {
    s.poly(
      [
        [3, 1],
        [8, 2],
        [10, 4],
        [6, 5],
        [2, 4],
      ],
      PAL.rust,
    )
    s.px(8, 3, PAL.rustLight, 1)
    s.px(4, 2, PAL.steelLight, 1)
    s.px(1, 3, PAL.rustDark, 0.9)
  },
  arc: (s) => {
    s.line(0, 3, 3, 1, PAL.signal, 1)
    s.line(3, 1, 5, 4, PAL.signal, 1)
    s.line(5, 4, 7, 1, PAL.white, 1)
    s.line(7, 1, 9, 4, PAL.signal, 1)
    s.line(9, 4, 11, 2, PAL.signal, 1)
    s.glow(4, 2, 4, PAL.signal, 0.9)
  },
  rail: (s) => {
    s.rect(0, 2, 11, 2, PAL.neonCold, 1)
    s.rect(3, 3, 9, 1, PAL.white, 1)
    s.line(0, 2, 0, 4, PAL.neonWarm, 1)
    s.glow(8, 3, 5, PAL.neonCold, 1)
  },
  shock: (s) => {
    s.disc(6, 3, 2.6, PAL.signal, 1)
    s.disc(6, 3, 1.2, PAL.white, 1)
    s.line(1, 1, 3, 3, PAL.signal, 0.9)
    s.line(1, 5, 3, 3, PAL.signal, 0.9)
    s.line(11, 1, 9, 3, PAL.signal, 0.9)
    s.line(11, 5, 9, 3, PAL.signal, 0.9)
    s.glow(6, 3, 5, PAL.signal, 1)
  },
}

export const PROJECTILE_ART_IDS = Object.keys(PROJ_DRAW)

/** 弹丸（12×6）。未知 kind 退回 bullet。 */
export function getProjectileArt(kind) {
  const key = String(kind || 'bullet')
  let tex = PROJ_CACHE.get(key)
  if (tex) return tex
  const fn = PROJ_DRAW[key] || PROJ_DRAW.bullet
  const s = new Surf(12, 6, strSeed('proj:' + key), 'weapons')
  fn(s)
  s.outline(mix(PAL.void, PAL.steel, 0.15))
  tex = s.tex()
  tex.userData.projectile = PROJ_DRAW[key] ? key : 'bullet'
  PROJ_CACHE.set(key, tex)
  return tex
}

/* ============================================================================
 * 5. 公开表 / 缓存
 * ========================================================================== */

export const WEAPON_ART_IDS = [
  'laser_pistol',
  'laser_rifle',
  'rail_spike',
  'semi_pistol',
  'nailgun',
  'scrap_launcher',
  'arc_emitter',
  'iron_pipe',
  'dagger',
  'hammer',
  'wrench_heavy',
  'shock_baton',
]

/** 预载 12 把武器 ×2 形态 + 7 种弹丸。 */
export function preloadArt() {
  for (const id of WEAPON_ART_IDS) {
    getWeaponArt(id)
    getWeaponHoldArt(id)
  }
  for (const k of PROJECTILE_ART_IDS) getProjectileArt(k)
  return ICON_CACHE.size + HOLD_CACHE.size + PROJ_CACHE.size
}

/** 清缓存。 */
export function clearWeaponCache() {
  ICON_CACHE.clear()
  HOLD_CACHE.clear()
  PROJ_CACHE.clear()
}

