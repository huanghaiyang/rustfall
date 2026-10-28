// ============================================================================
// 锈雨 · RUSTFALL —— 场景道具（PROP）程序化像素美术
// ----------------------------------------------------------------------------
// 契约：
//   export function getPropArt(kind) -> THREE.CanvasTexture
//
// 约定：
//   · 每种 kind 尺寸固定（见 SIZES 表），底部贴地（最后一行 = 地面），
//     水平中心对齐（x = w/2），朝右或正对镜头。
//   · 骨骼 / 尸骸必须读得出人形 / 动物形；全部半埋、破败，带接触阴影。
//   · 每个 prop 都走同一条收尾管线：
//       造型 → 锈蚀/裂纹/积尘（确定性）→ 上缘高光/下缘暗部 → 1px 描边 → 发光
//   · 未知 kind 退回通用废物堆（不会返回空）。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'
import { mulberry32 } from '../rng.js'
import { Surf, mix, shade, rgb, setArtModule, ALPHA_STATS } from './core.js'
import { ROOM_PROP_ART_DEFS } from './room-props.js'
setArtModule('props')

const TAU = Math.PI * 2

/* ============================================================================
 * 1. 颜色 / 像素表面（与其它 art 模块同构，自带一份避免跨模块耦合）
 * ========================================================================== */


/* ============================================================================
 * 2. 通用零件画笔
 * ========================================================================== */

/** 贴地投影（宽椭圆）。 */
function ground(s, cx, rx, al = 0.34) {
  s.shadow(cx, s.h - 1.5, rx, 1.8, al)
}

/** 骨：中段杆 + 两端骨节。 */
function bone(s, x0, y0, x1, y1, r = 1.3, c = PAL.bone) {
  s.thick(x0, y0, x1, y1, r, PAL.boneDeep)
  s.thick(x0, y0, x1, y1, r - 0.5, c)
  s.disc(x0, y0, r + 0.9, PAL.boneDark)
  s.disc(x1, y1, r + 0.9, PAL.boneDark)
  s.disc(x0, y0, r + 0.2, c)
  s.disc(x1, y1, r + 0.2, c)
  s.px(x0, y0 - 1, PAL.white, 0.5)
}

/** 竖直锈痕（从孔洞 / 接缝往下淌）。 */
function rustStreak(s, x, y, len, seed) {
  const rnd = mulberry32(seed >>> 0)
  for (let i = 0; i < len; i++) {
    const p = i / len
    if (rnd() < 0.22 + p * 0.4) continue
    s.px(x + (rnd() < 0.2 ? 1 : 0), y + i, rnd() < 0.5 ? PAL.rustDark : PAL.rust, 0.35 + rnd() * 0.4)
  }
}

/** 裂纹：一条主线 + 两条分叉。 */
function crack(s, x, y, len, dir, seed) {
  const rnd = mulberry32(seed >>> 0)
  let px = x
  let py = y
  for (let i = 0; i < len; i++) {
    px += dir * (rnd() < 0.7 ? 1 : 0)
    py += rnd() < 0.75 ? 1 : 0
    s.px(px, py, PAL.void, 0.55 + rnd() * 0.3)
    if (rnd() < 0.18) {
      s.px(px + (rnd() < 0.5 ? 1 : -1), py, PAL.void, 0.4)
      s.px(px, py + 1, PAL.void, 0.35)
    }
    if (i === Math.floor(len * 0.5)) {
      for (let k = 0; k < 4; k++) s.px(px - dir * k, py + k, PAL.void, 0.35)
    }
  }
}

/** 碎石 / 瓦砾。 */
function rubble(s, x, y, w, n, seed) {
  const rnd = mulberry32(seed >>> 0)
  for (let k = 0; k < n; k++) {
    const px = x + rnd() * w
    const py = y - rnd() * 3
    const r = 0.8 + rnd() * 1.6
    s.ell(px, py, r, r * 0.7, rnd() < 0.5 ? PAL.ashPale : PAL.dust)
    s.px(px - 0.5, py - 1, PAL.dustLight, 0.6)
  }
}

/** 木板（带纹理与端头）。 */
function plank(s, x, y, w, h, tone = PAL.dust, seed = 1) {
  s.rect(x, y, w, h, tone)
  s.rect(x, y, w, 1, shade(tone, 0.18))
  s.rect(x, y + h - 1, w, 1, shade(tone, -0.3))
  const rnd = mulberry32(seed >>> 0)
  for (let i = 0; i < Math.floor(w / 3); i++) {
    s.px(x + 1 + rnd() * (w - 2), y + 1 + rnd() * (h - 2), shade(tone, -0.18), 0.5)
  }
}

/** 散热格栅 / 板缝。 */
function vent(s, x, y, w, n, c, step = 2) {
  for (let k = 0; k < n; k++) s.rect(x, y + k * step, w, 1, c)
}

/** 窗户（碎玻璃 / 黑洞 / 微光）。 */
function window(s, x, y, w, h, mode, seed) {
  const frame = PAL.steelDark
  s.rect(x, y, w, h, PAL.void)
  if (mode === 'broken') {
    s.rect(x, y, w, h, PAL.black)
    // 残玻璃锯齿
    const rnd = mulberry32(seed >>> 0)
    for (let i = 0; i < w; i++) {
      const d = Math.floor(rnd() * (h - 1))
      for (let k = 0; k < d; k++) s.px(x + i, y + k, PAL.glass, 0.18)
      s.px(x + i, y + d, PAL.glass, 0.45)
    }
    s.line(x, y + h - 1, x + w - 1, y + 1, PAL.steelLight, 0.2)
  } else if (mode === 'lit') {
    s.rect(x, y, w, h, PAL.ochre, 0.35)
    s.rect(x + 1, y + 1, w - 2, h - 2, PAL.neonWarm, 0.25)
    s.glow(x + w / 2, y + h / 2, Math.max(w, h) * 0.7, PAL.neonWarm, 0.14)
  } else {
    s.rect(x, y, w, h, PAL.ash, 0.7)
  }
  // 窗框（十字）
  s.rect(x, y, w, 1, frame)
  s.rect(x, y + h - 1, w, 1, frame)
  s.rect(x, y, 1, h, frame)
  s.rect(x + w - 1, y, 1, h, frame)
  if (w > 8) s.rect(x + Math.floor(w / 2), y, 1, h, frame, 0.85)
}

/* ============================================================================
 * 3. 各民族：33 种道具
 * ========================================================================== */

/** 人形骨架（半埋、侧躺，能读出人形）。 */
function propSkeletonHuman(s) {
  const g = s.h - 1
  ground(s, 44, 30)
  const boneC = PAL.bone
  const boneD = PAL.boneDark
  // 土堆（半埋）
  s.poly(
    [
      [8, g],
      [16, g - 6],
      [34, g - 8],
      [58, g - 5],
      [70, g],
    ],
    PAL.dust,
  )
  s.speck(10, g - 8, 60, 9, PAL.sandDark, 0.25)
  // 脊柱（从骨盆到颈椎）
  bone(s, 40, g - 6, 74, g - 5, 1.4, boneC)
  for (let k = 0; k < 8; k++) {
    const x = 42 + k * 4
    s.px(x, g - 7, boneD, 0.7)
  }
  // 骨盆
  s.ell(40, g - 6, 5, 3, boneD)
  s.ell(40, g - 6, 4, 2.2, boneC)
  s.px(39, g - 8, PAL.void, 0.8)
  // 胸腔（肋骨，压在土堆上，向右前倾）
  const rc = [54, g - 9]
  s.ell(rc[0], rc[1], 7.5, 4.6, boneD)
  s.ell(rc[0], rc[1], 6.5, 3.7, boneC)
  for (let k = 0; k < 4; k++) {
    s.line(rc[0] - 6, rc[1] - 3 + k * 2, rc[0] + 6, rc[1] - 4 + k * 2, PAL.boneDeep, 0.65)
  }
  s.rect(rc[0] - 1, rc[1] - 3, 2, 6, PAL.void, 0.5)
  // 锁骨
  bone(s, 60, g - 11, 68, g - 12, 1.1, boneC)
  // 头骨（略仰，朝向右侧）
  const sk = [74, g - 12]
  s.ell(sk[0], sk[1], 5.5, 5, boneD)
  s.ell(sk[0], sk[1], 4.6, 4.2, boneC)
  s.ell(sk[0] + 1, sk[1] + 2, 2.6, 2.2, boneD)
  // 眼窝 / 鼻腔
  s.rect(sk[0] - 2, sk[1] - 2, 2, 2, PAL.void)
  s.rect(sk[0] + 1, sk[1] - 2, 2, 2, PAL.void)
  s.px(sk[0], sk[1] + 1, PAL.void)
  // 牙
  for (let k = 0; k < 4; k++) s.px(sk[0] - 2 + k, sk[1] + 3, PAL.white, 0.8)
  // 下颌（脱开，落在地上）
  s.poly(
    [
      [sk[0] + 2, g - 6],
      [sk[0] + 7, g - 5],
      [sk[0] + 6, g - 3],
      [sk[0] + 2, g - 4],
    ],
    boneD,
  )
  // 左臂（伸向画外）
  bone(s, 66, g - 12, 78, g - 8, 1.2, boneC)
  bone(s, 78, g - 8, 88, g - 9, 1.1, boneC)
  // 右臂（折在胸前）
  bone(s, 64, g - 10, 60, g - 4, 1.2, boneD)
  bone(s, 60, g - 4, 68, g - 3, 1.1, boneD)
  // 腿（一条伸直、一条屈起）
  bone(s, 36, g - 5, 22, g - 3, 1.4, boneC)
  bone(s, 22, g - 3, 10, g - 4, 1.3, boneC)
  bone(s, 38, g - 5, 30, g - 9, 1.4, boneD)
  bone(s, 30, g - 9, 20, g - 7, 1.2, boneD)
  // 指骨 / 散落
  for (let k = 0; k < 4; k++) s.px(86 + k, g - 7 + (k % 2), boneD, 0.9)
  // 残留布料
  s.poly(
    [
      [48, g - 4],
      [56, g - 6],
      [60, g - 3],
      [52, g - 1],
    ],
    PAL.rustDark,
    0.9,
  )
  s.line(49, g - 3, 58, g - 2, PAL.rust, 0.5)
  // 压在土里的骨屑
  rubble(s, 12, g, 70, 8, 0x51)
}

/** 动物骨架（四足、肋骨外露）。 */
function propSkeletonAnimal(s) {
  const g = s.h - 1
  ground(s, 34, 22)
  const bc = PAL.bone
  const bd = PAL.boneDark
  // 土堆
  s.poly(
    [
      [6, g],
      [14, g - 5],
      [40, g - 6],
      [56, g - 4],
      [64, g],
    ],
    PAL.dust,
  )
  // 脊柱（横贯）
  bone(s, 22, g - 8, 54, g - 7, 1.3, bc)
  for (let k = 0; k < 7; k++) s.px(24 + k * 4, g - 9, bd, 0.75)
  // 胸腔
  s.ell(33, g - 9, 5, 4, bd)
  s.ell(33, g - 9, 4.2, 3.2, bc)
  for (let k = 0; k < 3; k++) s.line(29, g - 11 + k * 2, 38, g - 12 + k * 2, PAL.boneDeep, 0.6)
  // 肩胛 / 骨盆
  s.ell(43, g - 6, 4, 2.6, bd)
  s.ell(43, g - 6, 3.2, 2, bc)
  s.ell(21, g - 7, 3, 2, bd)
  // 头骨（长吻、朝右）
  const sk = [60, g - 10]
  s.poly(
    [
      [sk[0] - 5, sk[1] - 2],
      [sk[0] + 2, sk[1] - 4],
      [sk[0] + 7, sk[1] - 1],
      [sk[0] + 5, sk[1] + 2],
      [sk[0] - 4, sk[1] + 2],
    ],
    bc,
  )
  s.poly(
    [
      [sk[0] + 1, sk[1] + 2],
      [sk[0] + 6, sk[1] + 1],
      [sk[0] + 5, sk[1] + 3],
      [sk[0] + 1, sk[1] + 4],
    ],
    bd,
  )
  s.rect(sk[0] - 2, sk[1] - 2, 2, 2, PAL.void)
  s.px(sk[0] + 3, sk[1], PAL.void)
  // 角（骨刺）
  s.line(sk[0] - 1, sk[1] - 3, sk[0] - 4, sk[1] - 7, bc)
  s.line(sk[0] + 1, sk[1] - 3, sk[0] + 1, sk[1] - 7, bd)
  // 四条腿（折叠）
  for (const [hx, kx, fx] of [
    [22, 20, 16],
    [24, 28, 30],
    [42, 40, 36],
    [44, 48, 52],
  ]) {
    bone(s, hx, g - 6, kx, g - 3, 1.1, bd)
    bone(s, kx, g - 3, fx, g - 2, 0.9, bc)
  }
  // 尾骨
  bone(s, 19, g - 7, 12, g - 9, 1, bd)
  bone(s, 12, g - 9, 8, g - 6, 0.8, bd)
  // 残毛 / 皮
  s.poly(
    [
      [26, g - 5],
      [34, g - 7],
      [40, g - 4],
      [30, g - 2],
    ],
    PAL.rustDark,
    0.8,
  )
  rubble(s, 10, g, 50, 6, 0x66)
}

/** 尸体（还带衣物，比骨架完整）。 */
function propCorpse(s) {
  const g = s.h - 1
  ground(s, 40, 26)
  const cloth = mix(PAL.dust, PAL.rustDark, 0.35)
  // 身体（蜷曲侧躺）
  s.poly(
    [
      [12, g - 6],
      [18, g - 12],
      [34, g - 14],
      [46, g - 12],
      [54, g - 8],
      [46, g - 3],
      [22, g - 2],
    ],
    cloth,
  )
  s.line(16, g - 10, 30, g - 12, PAL.dustLight, 0.6)
  s.line(24, g - 4, 46, g - 6, PAL.rustDark, 0.8)
  // 头（侧脸贴地）
  const hx = 60
  const hy = g - 9
  s.ell(hx, hy, 6, 5, PAL.boneDark)
  s.ell(hx, hy, 5, 4.2, PAL.bone)
  s.ell(hx + 4, hy + 2, 2.6, 1.8, PAL.boneDark, 0.6)
  s.rect(hx - 2, hy - 2, 1, 2, PAL.void, 0.8)
  s.px(hx + 1, hy + 4, PAL.bloodDark)
  // 头发（稀疏）
  s.line(hx - 4, hy - 3, hx + 2, hy - 5, PAL.ink, 0.8)
  // 手臂（一只手伸出）
  s.thick(52, g - 6, 66, g - 2, 2, cloth)
  s.thick(66, g - 2, 72, g - 1, 1.7, PAL.boneDark)
  for (let k = 0; k < 3; k++) s.px(73 + k, g - 1 - (k % 2), PAL.bone)
  // 腿（一条弯曲）
  s.thick(20, g - 5, 8, g - 6, 2.4, cloth)
  s.thick(26, g - 4, 16, g - 1, 2.2, shade(cloth, -0.2))
  s.rect(6, g - 7, 4, 2, PAL.ink)
  // 血渍
  s.ell(40, g - 1, 10, 2, PAL.bloodDark, 0.55)
  s.ell(46, g - 2, 5, 1.4, PAL.blood, 0.35)
  // 破洞 / 渗透
  s.speck(16, g - 12, 38, 10, PAL.bloodDark, 0.05, 0.5)
  s.px(58, g - 4, PAL.void, 0.7)
  rubble(s, 4, g, 20, 4, 0x71)
}

/** 头骨。 */
function propSkull(s) {
  const g = s.h - 1
  ground(s, 10, 6, 0.3)
  s.ell(10, 9, 6.5, 6, PAL.boneDark)
  s.ell(10, 9, 5.6, 5.2, PAL.bone)
  // 颅顶高光
  s.line(6, 6, 11, 4, PAL.white, 0.55)
  // 眼窝
  s.rect(7, 8, 2, 3, PAL.void)
  s.rect(12, 8, 2, 3, PAL.void)
  s.px(7, 8, PAL.boneDark)
  // 鼻腔
  s.px(10, 11, PAL.void)
  s.px(10, 12, PAL.void)
  // 上颌牙
  s.rect(7, 13, 6, 2, PAL.boneDark)
  for (let k = 0; k < 5; k++) s.px(7 + k, 13, PAL.white, 0.75)
  // 下颌（掉落在右下）
  s.poly(
    [
      [12, 15],
      [17, 14],
      [16, 17],
      [13, 17],
    ],
    PAL.boneDark,
  )
  s.px(14, 16, PAL.bone)
  // 裂纹 + 缺角
  s.line(13, 4, 15, 8, PAL.boneDeep, 0.7)
  s.px(4, 9, PAL.boneDeep)
  // 土
  s.ell(10, g, 8, 1.4, PAL.dust, 0.5)
}

/** 肋骨（半埋、斜插在土里）。 */
function propRibcage(s) {
  const g = s.h - 1
  ground(s, 28, 18)
  s.poly(
    [
      [8, g],
      [16, g - 5],
      [36, g - 6],
      [48, g - 3],
      [52, g],
    ],
    PAL.dust,
  )
  const cx = 28
  const cy = g - 14
  // 胸骨
  s.thick(cx - 2, cy - 4, cx + 2, cy + 12, 1.6, PAL.boneDark)
  s.thick(cx - 2, cy - 4, cx + 2, cy + 12, 1, PAL.bone)
  // 左右肋骨各 7 根（弧线）
  for (let k = 0; k < 7; k++) {
    const t = k / 6
    const y = cy - 3 + k * 2.2
    const len = 15 * Math.sin(Math.PI * (0.35 + t * 0.6))
    s.line(cx - 1, y, cx - 1 - len, y + 3 + t * 2, PAL.boneDark, 0.95)
    s.line(cx + 1, y, cx + 1 + len, y + 3 + t * 2, PAL.boneDark, 0.95)
    s.line(cx - 2, y - 0.4, cx - len, y + 2.6 + t * 2, PAL.bone, 0.9)
    s.line(cx + 2, y - 0.4, cx + len, y + 2.6 + t * 2, PAL.bone, 0.9)
  }
  // 断口 / 土覆盖底部
  s.ell(cx, g - 3, 20, 3, PAL.dust, 0.8)
  s.speck(10, g - 5, 38, 5, PAL.sandDark, 0.25)
  rubble(s, 12, g, 34, 7, 0x88)
}

/** 汽车残骸（压扁、缺轮、碎窗）。 */
function propCarWreck(s) {
  const g = s.h - 1
  ground(s, 60, 44)
  const body = mix(PAL.rust, PAL.rustDark, 0.35)
  const bodyL = mix(PAL.rust, PAL.rustLight, 0.45)
  // 车体（侧视，车头朝右，压低）
  s.poly(
    [
      [8, g - 8],
      [14, g - 20],
      [40, g - 24],
      [56, g - 30],
      [78, g - 28],
      [96, g - 22],
      [110, g - 16],
      [112, g - 8],
      [104, g - 4],
      [16, g - 4],
    ],
    body,
  )
  // 顶部高光 / 腰线
  s.line(16, g - 19, 98, g - 21, bodyL, 0.9)
  s.line(12, g - 10, 108, g - 10, PAL.rustDark, 0.8)
  // 车窗（碎）
  window(s, 34, g - 24, 18, 8, 'broken', 0x31)
  window(s, 58, g - 28, 20, 8, 'broken', 0x32)
  // 前挡风（塌陷）
  s.poly(
    [
      [82, g - 26],
      [98, g - 22],
      [94, g - 16],
      [80, g - 18],
    ],
    PAL.black,
  )
  s.line(84, g - 24, 92, g - 18, PAL.glass, 0.3)
  // 车门缝 / 把手
  s.line(56, g - 22, 56, g - 6, PAL.void, 0.55)
  s.rect(46, g - 15, 5, 1, PAL.steelLight, 0.6)
  // 轮拱（轮子没了）
  s.ell(30, g - 6, 9, 7, PAL.void, 0.9)
  s.ell(90, g - 6, 9, 7, PAL.void, 0.9)
  s.ell(30, g - 6, 8, 6, PAL.black, 0.8)
  s.ell(90, g - 6, 8, 6, PAL.black, 0.8)
  // 保险杠 / 车灯
  s.rect(106, g - 12, 6, 5, PAL.steelDark)
  s.rect(108, g - 11, 4, 2, PAL.glass, 0.5)
  s.px(110, g - 10, PAL.neonWarm, 0.5)
  s.rect(6, g - 12, 5, 5, PAL.steelDark)
  // 锈斑 / 破洞 / 弹孔
  s.speck(14, g - 26, 90, 22, PAL.rustDark, 0.14, 0.6)
  s.speck(14, g - 26, 90, 22, PAL.rustLight, 0.06, 0.5)
  s.ell(70, g - 14, 3, 2, PAL.void, 0.85)
  crack(s, 24, g - 20, 8, 1, 0x41)
  // 悬空的破线 / 弹簧
  s.line(52, g - 5, 48, g - 1, PAL.oilSheen)
  s.line(70, g - 5, 74, g - 2, PAL.oilSheen)
  rubble(s, 4, g, 112, 10, 0x21)
  // 杂草
  for (let k = 0; k < 5; k++) {
    s.line(20 + k * 18, g, 22 + k * 18, g - 4, PAL.weed, 0.7)
  }
}

/** 公交车残骸（侧视长条，车窗成排）。 */
function propBusWreck(s) {
  const g = s.h - 1
  ground(s, 100, 78)
  const body = mix(PAL.skyDay, PAL.rustDark, 0.55)
  const bodyL = mix(body, PAL.sand, 0.35)
  // 车身
  s.poly(
    [
      [6, g - 10],
      [10, g - 44],
      [26, g - 52],
      [166, g - 52],
      [190, g - 44],
      [194, g - 12],
      [186, g - 4],
      [14, g - 4],
    ],
    body,
  )
  // 车顶高光 / 腰线 / 裙边
  s.line(16, g - 50, 172, g - 50, bodyL, 0.9)
  s.line(8, g - 38, 192, g - 38, PAL.sand, 0.28)
  s.rect(10, g - 14, 182, 4, PAL.rustDark, 0.85)
  s.rect(10, g - 10, 182, 2, PAL.rust, 0.6)
  // 车窗（7 扇，多数碎）
  for (let k = 0; k < 7; k++) {
    const x = 22 + k * 23
    const mode = k === 2 || k === 5 ? 'lit' : k === 3 ? 'dark' : 'broken'
    window(s, x, g - 44, 17, 12, mode, 0x100 + k)
  }
  // 车门（开着）
  s.poly(
    [
      [150, g - 42],
      [166, g - 42],
      [168, g - 10],
      [148, g - 10],
    ],
    PAL.void,
  )
  s.line(150, g - 42, 148, g - 10, PAL.steelLight, 0.5)
  // 前脸 / 车灯
  s.poly(
    [
      [186, g - 44],
      [198, g - 38],
      [198, g - 20],
      [186, g - 16],
    ],
    PAL.steelDark,
  )
  s.rect(189, g - 34, 7, 6, PAL.glass, 0.45)
  s.px(192, g - 31, PAL.neonWarm, 0.7)
  s.glow(192, g - 31, 8, PAL.neonWarm, 0.18)
  // 车轮（左前爆胎、右后缺失）
  for (const [wx, flat] of [
    [40, true],
    [148, false],
  ]) {
    s.disc(wx, g - 7, 8, PAL.oil)
    s.disc(wx, g - 7, 5.5, PAL.steelDark)
    s.disc(wx, g - 7, 2, PAL.steelLight)
    if (flat) {
      s.ell(wx, g - 1, 9, 2, PAL.oil, 0.9)
      s.disc(wx, g - 5, 8, PAL.oil)
    }
  }
  s.ell(100, g - 4, 10, 6, PAL.void, 0.85)
  // 锈 / 涂鸦 / 弹孔
  s.speck(14, g - 50, 170, 46, PAL.rustDark, 0.1, 0.55)
  s.speck(14, g - 50, 170, 46, PAL.rustLight, 0.04, 0.45)
  for (let k = 0; k < 5; k++) rustStreak(s, 30 + k * 34, g - 50, 14 + k * 3, 0x200 + k)
  s.line(70, g - 30, 86, g - 26, PAL.bloodDark, 0.5)
  s.line(72, g - 26, 84, g - 30, PAL.bloodDark, 0.4)
  crack(s, 120, g - 48, 10, 1, 0x51)
  // 地面杂草 / 碎玻璃
  for (let k = 0; k < 8; k++) s.px(20 + k * 22, g - 1 - (k % 2), PAL.weed, 0.6)
  for (let k = 0; k < 12; k++) s.px(20 + s.r() * 160, g - 1, PAL.glass, 0.3)
}

/** 楼房立面（窗格 / 阳台 / 破洞）。 */
function propBuildingFacade(s) {
  const g = s.h - 1
  ground(s, 80, 74, 0.3)
  const wall = mix(PAL.dust, PAL.ash, 0.45)
  const wallL = mix(wall, PAL.sand, 0.3)
  const wallD = mix(wall, PAL.void, 0.4)
  // 主体
  s.rect(4, 6, 152, g - 6, wall)
  s.rect(4, 6, 152, 3, wallL)
  s.rect(4, 6, 3, g - 6, wallL, 0.7)
  s.rect(153, 6, 3, g - 6, wallD)
  // 楼顶檐口 + 女儿墙
  s.rect(2, 2, 156, 5, PAL.ashPale)
  s.rect(2, 2, 156, 1, PAL.steelLight, 0.5)
  s.rect(2, 6, 156, 2, PAL.void, 0.5)
  // 窗格（5 列 × 7 行），部分破损
  const cols = 5
  const rows = 7
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 12 + c * 28
      const y = 16 + r * 27
      const rnd = mulberry32(0x300 + r * 17 + c)
      const mode = rnd() < 0.22 ? 'lit' : rnd() < 0.6 ? 'broken' : 'dark'
      window(s, x, y, 18, 14, mode, 0x300 + r * 17 + c)
      // 窗台
      s.rect(x - 2, y + 14, 22, 2, PAL.ashPale)
      s.rect(x - 2, y + 14, 22, 1, PAL.steelLight, 0.4)
      // 铁栏 / 空调 / 花盆
      if (rnd() < 0.3) {
        for (let k = 0; k < 6; k++) s.line(x + 1 + k * 3, y, x + 1 + k * 3, y + 13, PAL.steelDark, 0.55)
      }
      if (rnd() < 0.18) {
        s.rect(x + 4, y + 16, 9, 6, PAL.steelDark)
        vent(s, x + 5, y + 18, 7, 2, PAL.steelLight)
      }
    }
  }
  // 楼层分隔线
  for (let r = 0; r <= rows; r++) {
    const y = 12 + r * 27
    if (y < g - 4) s.line(4, y, 155, y, wallD, 0.35)
  }
  // 破洞（露出内部与钢筋）
  s.ell(120, g - 60, 12, 16, PAL.void, 0.92)
  s.ell(120, g - 60, 9, 12, PAL.black, 0.8)
  for (let k = 0; k < 5; k++) {
    s.line(112 + k * 4, g - 50, 116 + k * 4, g - 70, PAL.rustDark, 0.8)
  }
  s.ell(40, g - 110, 8, 10, PAL.void, 0.75)
  // 门洞（底层）
  s.rect(24, g - 42, 26, 42, PAL.void)
  s.rect(24, g - 42, 26, 2, PAL.ashPale)
  s.rect(24, g - 42, 2, 42, PAL.ashPale)
  s.line(30, g - 30, 46, g - 26, PAL.rust, 0.5)
  // 涂鸦 / 裂纹 / 锈水痕
  s.line(60, g - 30, 74, g - 14, PAL.bloodDark, 0.45)
  s.line(74, g - 14, 66, g - 2, PAL.bloodDark, 0.35)
  for (let k = 0; k < 8; k++) rustStreak(s, 8 + k * 19, 20 + (k % 3) * 40, 30 + k * 2, 0x400 + k)
  crack(s, 60, 10, 40, 1, 0x71)
  crack(s, 100, 40, 30, -1, 0x72)
  // 底部瓦砾与草
  rubble(s, 0, g, 160, 18, 0x81)
  for (let k = 0; k < 10; k++) s.line(6 + k * 15, g, 8 + k * 15, g - 5, PAL.weed, 0.6)
}

/** 民居立面（坡顶 + 门廊）。 */
function propHouseFacade(s) {
  const g = s.h - 1
  ground(s, 70, 62, 0.3)
  const wall = mix(PAL.dust, PAL.sand, 0.25)
  const wallL = mix(wall, PAL.sand, 0.28)
  const wallD = mix(wall, PAL.void, 0.42)
  // 墙体
  s.rect(8, 34, 124, g - 34, wall)
  s.rect(8, 34, 3, g - 34, wallL, 0.8)
  s.rect(129, 34, 3, g - 34, wallD)
  // 坡屋顶（两坡）
  s.poly(
    [
      [4, 36],
      [70, 6],
      [136, 36],
      [130, 40],
      [70, 12],
      [10, 40],
    ],
    mix(PAL.rustDark, PAL.dust, 0.4),
  )
  for (let k = 0; k < 5; k++) {
    s.line(10 + k * 2, 38 - k * 6, 130 - k * 1, 38 - k * 6, PAL.rust, 0.35)
  }
  s.line(70, 6, 70, 12, PAL.rustDark, 0.8)
  // 屋顶破洞
  s.ell(40, 26, 5, 4, PAL.void, 0.85)
  s.line(34, 30, 46, 22, PAL.rustDark, 0.7)
  // 门窗
  s.rect(58, g - 34, 20, 34, PAL.void)
  s.rect(58, g - 34, 20, 2, PAL.ashPale)
  s.rect(58, g - 34, 2, 34, PAL.ashPale)
  s.rect(76, g - 34, 2, 34, PAL.ashPale)
  s.px(74, g - 18, PAL.neonWarm, 0.7)
  window(s, 24, 54, 18, 14, 'broken', 0x901)
  window(s, 96, 54, 18, 14, 'lit', 0x902)
  // 窗下花箱 / 晾衣绳
  s.rect(22, 69, 22, 3, PAL.rustDark)
  s.line(96, 70, 130, 66, PAL.oilSheen, 0.7)
  s.rect(104, 66, 5, 4, PAL.dust, 0.8)
  s.rect(116, 65, 4, 5, PAL.rustDark, 0.8)
  // 墙皮剥落 / 霉斑 / 裂纹
  s.poly(
    [
      [12, 44],
      [26, 42],
      [24, 54],
      [14, 56],
    ],
    PAL.ash, 0.5,
  )
  s.speck(10, 36, 118, g - 38, PAL.rustDark, 0.06, 0.45)
  s.speck(10, g - 20, 118, 18, PAL.mossDead, 0.05, 0.5)
  crack(s, 40, 40, 26, 1, 0xa01)
  crack(s, 110, 44, 20, -1, 0xa02)
  // 台阶
  s.rect(54, g - 8, 30, 3, PAL.ashPale)
  s.rect(54, g - 5, 34, 4, PAL.ash)
  rubble(s, 6, g, 130, 14, 0xb01)
}

/** 工厂管道（竖直，法兰 + 阀门）。 */
function propFactoryPipe(s) {
  const g = s.h - 1
  ground(s, 24, 14)
  const pipe = mix(PAL.steel, PAL.rustDark, 0.4)
  const pipeL = mix(pipe, PAL.steelLight, 0.45)
  const pipeD = mix(pipe, PAL.void, 0.45)
  // 管身
  s.rect(12, 6, 24, g - 6, pipe)
  s.rect(12, 6, 4, g - 6, pipeL)
  s.rect(32, 6, 4, g - 6, pipeD)
  s.rect(17, 6, 3, g - 6, PAL.ashPale, 0.25)
  // 法兰（三道）
  for (const fy of [16, 66, 130]) {
    s.rect(7, fy, 34, 8, PAL.steelDark)
    s.rect(7, fy, 34, 1, PAL.steelLight)
    s.rect(7, fy + 7, 34, 1, PAL.void, 0.6)
    for (let k = 0; k < 4; k++) {
      s.px(10 + k * 8, fy + 3, PAL.steelWhite, 0.7)
      s.px(10 + k * 8, fy + 4, PAL.steelDark)
    }
  }
  // 阀门
  s.disc(24, 104, 9, PAL.steelDark)
  s.disc(24, 104, 6, PAL.rust)
  s.disc(24, 104, 2, PAL.steelDark)
  s.line(15, 104, 33, 104, PAL.steelLight, 0.6)
  s.line(24, 95, 24, 113, PAL.steelLight, 0.6)
  s.rect(22, 92, 4, 6, PAL.steel)
  // 保温层（破布缠的一段）
  for (let k = 0; k < 5; k++) s.rect(12, 40 + k * 5, 24, 3, mix(PAL.dust, PAL.ash, 0.5), 0.8)
  // 锈流 / 裂口
  for (let k = 0; k < 6; k++) rustStreak(s, 14 + k * 4, 24 + k * 18, 18 + k * 5, 0xc00 + k)
  s.ell(30, 74, 4, 6, PAL.void, 0.8)
  s.line(28, 70, 32, 82, PAL.void, 0.6)
  // 底部支撑与碎石
  s.rect(8, g - 8, 32, 4, PAL.steelDark)
  rubble(s, 4, g, 40, 8, 0xd01)
}

/** 油桶。 */
function propBarrel(s) {
  const g = s.h - 1
  ground(s, 14, 11)
  const body = mix(PAL.rust, PAL.rustDark, 0.3)
  s.rect(4, 8, 20, g - 8, body)
  s.rect(4, 8, 3, g - 8, mix(body, PAL.rustLight, 0.5))
  s.rect(21, 8, 3, g - 8, shade(body, -0.35))
  // 顶盖（椭圆）
  s.ell(14, 8, 10, 3, PAL.steelDark)
  s.ell(14, 8, 8.5, 2.2, mix(PAL.steel, PAL.rust, 0.4))
  s.ell(14, 8, 2, 1, PAL.void, 0.8)
  // 两道箍
  for (const y of [16, 27]) {
    s.rect(4, y, 20, 2, PAL.steelDark)
    s.rect(4, y, 20, 1, PAL.steelLight, 0.6)
  }
  // 标签（褪色的危险三角）
  s.rect(7, 19, 14, 8, PAL.sand, 0.55)
  s.poly(
    [
      [14, 20],
      [18, 25],
      [10, 25],
    ],
    PAL.ink, 0.65,
  )
  s.px(14, 22, PAL.warn, 0.8)
  // 锈 / 凹陷 / 漏液
  s.speck(4, 8, 20, g - 8, PAL.rustDark, 0.2, 0.6)
  s.speck(4, 8, 20, g - 8, PAL.rustLight, 0.07, 0.5)
  s.ell(18, 22, 3, 4, PAL.void, 0.35)
  s.ell(14, g - 1, 9, 1.6, PAL.oil, 0.5)
  s.px(11, 10, PAL.steelWhite, 0.4)
}

/** 木箱。 */
function propCrate(s) {
  const g = s.h - 1
  ground(s, 20, 14)
  const wood = PAL.dust
  // 箱体
  s.rect(4, 6, 32, g - 6, wood)
  s.rect(4, 6, 32, 2, mix(wood, PAL.sand, 0.4))
  s.rect(4, g - 5, 32, 2, shade(wood, -0.35))
  // 木板横纹
  for (let k = 0; k < 4; k++) s.rect(4, 10 + k * 6, 32, 1, shade(wood, -0.25), 0.7)
  // X 形加固
  s.line(5, 7, 35, g - 5, shade(wood, -0.28), 0.8)
  s.line(35, 7, 5, g - 5, shade(wood, -0.28), 0.8)
  s.line(6, 8, 34, g - 6, mix(wood, PAL.sand, 0.35), 0.5)
  // 金属包角
  for (const [x, y] of [
    [4, 6],
    [30, 6],
    [4, g - 8],
    [30, g - 8],
  ]) {
    s.rect(x, y, 6, 2, PAL.steelDark)
    s.rect(x, y, 2, 6, PAL.steelDark)
    s.px(x + 1, y + 1, PAL.steelLight)
  }
  // 钉子 / 破洞 / 污渍
  for (let k = 0; k < 5; k++) s.px(7 + k * 6, 12, PAL.steelLight, 0.6)
  s.px(22, 20, PAL.void, 0.7)
  s.poly(
    [
      [26, 24],
      [33, 22],
      [34, 29],
      [28, 30],
    ],
    shade(wood, -0.45),
  )
  s.speck(4, 6, 32, g - 6, PAL.rust, 0.05, 0.4)
  rubble(s, 2, g, 36, 5, 0xe01)
}

/** 轮胎堆。 */
function propTirePile(s) {
  const g = s.h - 1
  ground(s, 28, 22)
  const tires = [
    [16, g - 6, 13, 6],
    [38, g - 6, 13, 6],
    [26, g - 15, 13, 6],
    [36, g - 22, 11, 5],
  ]
  for (const [cx, cy, rx, ry] of tires) {
    s.ell(cx, cy, rx, ry, PAL.oil)
    s.ell(cx, cy, rx - 2, ry - 1.4, PAL.black)
    s.ell(cx, cy, rx - 4.5, ry - 2.4, PAL.void)
    // 胎纹
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI
      s.px(cx - Math.cos(a) * (rx - 2.4), cy - Math.sin(a) * (ry - 1.2), PAL.ashPale, 0.55)
    }
    // 侧壁高光
    s.line(cx - rx + 3, cy - ry + 1, cx + rx - 3, cy - ry + 1, PAL.ashPale, 0.4)
  }
  // 靠着的半只
  s.ell(48, g - 10, 7, 9, PAL.oil)
  s.ell(48, g - 10, 4.5, 6.6, PAL.black)
  // 杂草 / 水渍
  s.ell(28, g - 1, 20, 1.6, PAL.oil, 0.4)
  for (let k = 0; k < 4; k++) s.line(8 + k * 12, g, 10 + k * 12, g - 4, PAL.weed, 0.55)
}

/** 围栏（铁丝网 + 立柱，破口）。 */
function propFence(s) {
  const g = s.h - 1
  ground(s, 32, 30)
  // 立柱
  for (const x of [3, 59]) {
    s.rect(x, 4, 3, g - 4, PAL.steelDark)
    s.rect(x, 4, 1, g - 4, PAL.steelLight, 0.6)
    s.rect(x - 1, 4, 5, 2, PAL.steelDark)
  }
  // 上下横杆
  s.rect(4, 8, 56, 2, PAL.steel)
  s.rect(4, 8, 56, 1, PAL.steelLight, 0.6)
  s.rect(4, g - 8, 56, 2, PAL.steel)
  // 铁丝网格（菱形）
  for (let x = 6; x < 58; x += 5) {
    s.line(x, 10, x + 4, g - 8, PAL.ashPale, 0.35)
    s.line(x + 4, 10, x, g - 8, PAL.ashPale, 0.35)
  }
  // 破口（下缘被撕开）
  s.poly(
    [
      [22, g - 8],
      [38, g - 8],
      [36, g - 2],
      [26, g - 4],
    ],
    PAL.void, 0.0,
  )
  // 锈
  s.speck(4, 4, 56, g - 4, PAL.rustDark, 0.14, 0.6)
  s.line(28, 12, 34, 22, PAL.void, 0.55)
  // 挂在上面的破布
  s.poly(
    [
      [44, 14],
      [50, 16],
      [48, 24],
      [43, 22],
    ],
    PAL.dust, 0.85,
  )
  rubble(s, 2, g, 60, 6, 0xf01)
}

/** 路灯（弯曲灯臂，灯罩碎了）。 */
function propStreetlight(s) {
  const g = s.h - 1
  ground(s, 12, 9)
  // 基座
  s.rect(5, g - 8, 14, 8, PAL.ashPale)
  s.rect(5, g - 8, 14, 1, PAL.steelLight, 0.5)
  // 灯杆
  s.rect(10, 22, 4, g - 30, PAL.steel)
  s.rect(10, 22, 1, g - 30, PAL.steelLight, 0.7)
  s.rect(13, 22, 1, g - 30, PAL.steelDark)
  // 弯臂
  for (let k = 0; k <= 8; k++) {
    const t = k / 8
    const x = 12 + Math.sin(t * Math.PI * 0.5) * 9
    const y = 22 - t * 12
    s.disc(x, y, 1.4, PAL.steel)
    s.px(x, y - 1, PAL.steelLight, 0.6)
  }
  // 灯罩（破）
  s.poly(
    [
      [16, 8],
      [24, 8],
      [22, 14],
      [18, 14],
    ],
    PAL.steelDark,
  )
  s.rect(17, 13, 4, 2, PAL.glass, 0.35)
  s.line(18, 9, 22, 12, PAL.glass, 0.4)
  s.px(20, 15, PAL.neonWarm, 0.25)
  s.glow(20, 15, 9, PAL.neonWarm, 0.1)
  // 锈与藤
  for (let k = 0; k < 4; k++) rustStreak(s, 10 + k, 40 + k * 14, 22, 0x110 + k)
  s.line(14, g - 30, 16, g - 40, PAL.mossDead, 0.6)
  s.line(16, g - 40, 12, g - 46, PAL.weed, 0.5)
  // 底座阴影
  s.ell(12, g, 9, 1.6, PAL.void, 0.3)
}

/** 老电视（CRT，碎屏）。 */
function propTv(s) {
  const g = s.h - 1
  ground(s, 18, 12)
  // 机身（后厚前薄）
  s.poly(
    [
      [3, 6],
      [26, 8],
      [24, g - 6],
      [4, g - 6],
    ],
    PAL.ashPale,
  )
  s.poly(
    [
      [5, 8],
      [23, 10],
      [22, g - 8],
      [6, g - 8],
    ],
    PAL.ash,
  )
  // 屏幕
  s.rect(7, 10, 13, 11, PAL.black)
  s.rect(8, 11, 11, 9, PAL.ash, 0.5)
  // 裂纹（蛛网）
  s.line(10, 12, 18, 19, PAL.steelLight, 0.5)
  s.line(17, 11, 9, 18, PAL.steelLight, 0.4)
  s.line(13, 10, 13, 20, PAL.steelLight, 0.3)
  s.glow(13, 16, 7, PAL.neon, 0.08)
  // 旋钮 / 喇叭
  s.disc(23, 13, 1.6, PAL.steelDark)
  s.disc(23, 17, 1.6, PAL.steelDark)
  s.rect(21, 20, 3, 5, PAL.steelDark, 0.8)
  vent(s, 21, 21, 2, 2, PAL.steelLight)
  // 天线（断了）
  s.line(8, 6, 4, 1, PAL.steelLight)
  s.line(12, 6, 14, 2, PAL.steelDark)
  s.px(14, 2, PAL.steelLight)
  // 支架 / 灰
  s.rect(8, g - 5, 3, 4, PAL.steelDark)
  s.rect(18, g - 5, 3, 4, PAL.steelDark)
  s.speck(3, 6, 24, g - 6, PAL.dust, 0.1, 0.5)
  s.speck(3, 6, 24, g - 6, PAL.rustDark, 0.06, 0.5)
}

/** 沙发（塌陷、破皮）。 */
function propSofa(s) {
  const g = s.h - 1
  ground(s, 32, 28)
  const fab = mix(PAL.bloodDark, PAL.dust, 0.45)
  const fabL = mix(fab, PAL.dustLight, 0.4)
  // 靠背
  s.poly(
    [
      [6, 4],
      [58, 4],
      [56, 16],
      [8, 16],
    ],
    fab,
  )
  s.line(6, 5, 58, 5, fabL, 0.8)
  // 坐垫（塌）
  s.poly(
    [
      [4, 15],
      [60, 15],
      [58, g - 5],
      [6, g - 5],
    ],
    mix(fab, PAL.rustDark, 0.25),
  )
  s.line(4, 15, 60, 15, fabL, 0.6)
  // 扶手
  s.poly(
    [
      [2, 8],
      [8, 8],
      [8, g - 4],
      [2, g - 4],
    ],
    fab,
  )
  s.poly(
    [
      [56, 8],
      [62, 8],
      [62, g - 4],
      [56, g - 4],
    ],
    fab,
  )
  s.rect(2, 8, 6, 1, fabL, 0.8)
  s.rect(56, 8, 6, 1, fabL, 0.8)
  // 裂口露填充物 / 弹簧
  s.ell(30, 20, 9, 3, PAL.void, 0.7)
  for (let k = 0; k < 4; k++) s.line(22 + k * 5, 18, 24 + k * 5, 22, PAL.rustDark, 0.8)
  s.speck(26, 16, 14, 8, PAL.boneDark, 0.25, 0.7)
  // 腿
  s.rect(6, g - 4, 3, 3, PAL.rustDark)
  s.rect(54, g - 4, 3, 3, PAL.rustDark)
  // 污渍
  s.ell(44, 22, 6, 3, PAL.bloodDark, 0.45)
  s.speck(4, 4, 56, g - 8, PAL.dust, 0.08, 0.4)
}

/** 衣柜（门开、内部黑）。 */
function propWardrobe(s) {
  const g = s.h - 1
  ground(s, 24, 16)
  const wood = mix(PAL.rustDark, PAL.dust, 0.35)
  const woodL = mix(wood, PAL.sand, 0.25)
  // 柜体
  s.rect(6, 4, 36, g - 4, wood)
  s.rect(6, 4, 3, g - 4, woodL)
  s.rect(39, 4, 3, g - 4, shade(wood, -0.4))
  s.rect(4, 2, 40, 4, mix(wood, PAL.dust, 0.3))
  s.rect(4, 2, 40, 1, woodL)
  // 左门（关）
  s.rect(8, 8, 16, g - 16, mix(wood, PAL.dust, 0.15))
  s.line(8, 8, 24, 8, woodL, 0.7)
  s.rect(19, 40, 2, 4, PAL.steelLight, 0.7)
  // 右门（开，内部黑）
  s.poly(
    [
      [26, 8],
      [34, 6],
      [36, g - 12],
      [27, g - 10],
    ],
    PAL.void,
  )
  s.poly(
    [
      [36, 6],
      [41, 10],
      [42, g - 8],
      [37, g - 12],
    ],
    mix(wood, PAL.dust, 0.2),
  )
  // 内部：挂着的破衣
  s.line(27, 12, 34, 12, PAL.steelLight, 0.5)
  s.poly(
    [
      [28, 12],
      [32, 12],
      [32, 30],
      [28, 28],
    ],
    PAL.dust, 0.7,
  )
  // 底板 / 灰
  s.rect(6, g - 8, 36, 3, PAL.rustDark)
  s.speck(6, 4, 36, g - 8, PAL.rustDark, 0.08, 0.45)
  s.speck(6, g - 14, 36, 10, PAL.dust, 0.12, 0.4)
}

/** 婴儿摇篮（翻倒）。 */
function propCradle(s) {
  const g = s.h - 1
  ground(s, 20, 15)
  const wood = mix(PAL.sand, PAL.dust, 0.4)
  // 篮子（翻倒，开口朝左）
  s.poly(
    [
      [16, g - 16],
      [34, g - 14],
      [33, g - 4],
      [14, g - 5],
    ],
    wood,
  )
  s.poly(
    [
      [18, g - 15],
      [31, g - 13],
      [30, g - 5],
      [16, g - 6],
    ],
    PAL.void,
  )
  // 板条
  for (let k = 0; k < 5; k++) s.line(19 + k * 3, g - 15, 18 + k * 3, g - 5, shade(wood, 0.2), 0.7)
  // 弧形摇脚
  s.line(14, g - 4, 18, g - 1, PAL.rustDark)
  s.line(18, g - 1, 30, g - 1, PAL.rustDark)
  s.line(30, g - 1, 34, g - 4, PAL.rustDark)
  // 破毯子（垂在外面）
  s.poly(
    [
      [12, g - 7],
      [18, g - 6],
      [17, g - 1],
      [10, g - 2],
    ],
    PAL.dust, 0.85,
  )
  s.line(11, g - 5, 16, g - 4, PAL.sandDark, 0.6)
  // 木纹 / 坠落时磕掉的角
  s.px(33, g - 14, PAL.void, 0.7)
  s.speck(14, g - 16, 20, 14, PAL.rust, 0.12, 0.5)
  rubble(s, 1, g, 36, 5, 0x120)
}

/** 墓碑（歪斜、半埋）。 */
function propGrave(s) {
  const g = s.h - 1
  ground(s, 14, 10)
  // 土堆
  s.ell(14, g - 1, 12, 2.4, PAL.dust)
  s.speck(3, g - 4, 22, 4, PAL.sandDark, 0.3)
  // 石碑（右倾）
  s.poly(
    [
      [7, g - 4],
      [20, g - 5],
      [21, 8],
      [16, 3],
      [8, 6],
    ],
    PAL.ashPale,
  )
  s.poly(
    [
      [9, g - 5],
      [19, g - 6],
      [19.5, 9],
      [15.5, 5],
      [9, 7],
    ],
    PAL.ash,
  )
  // 高光边
  s.line(9, 7, 10, g - 5, PAL.steelLight, 0.5)
  // 刻字（磨损）
  s.rect(11, 11, 6, 1, PAL.void, 0.35)
  s.rect(11, 14, 7, 1, PAL.void, 0.3)
  s.rect(11, 17, 5, 1, PAL.void, 0.25)
  // 十字 / 符号
  s.line(15, 8, 15, 12, PAL.void, 0.4)
  s.line(13, 10, 17, 10, PAL.void, 0.4)
  // 裂缝 / 苔
  crack(s, 12, 12, 8, 1, 0x130)
  s.speck(8, 12, 12, 10, PAL.mossDead, 0.1, 0.5)
  // 歪倒
  s.rect(7, g - 5, 3, 3, PAL.ash, 0.8)
  rubble(s, 4, g, 20, 4, 0x131)
}

/** 牢笼（营救点：铁栅 + 锁）。 */
function propCage(s) {
  const g = s.h - 1
  ground(s, 32, 28)
  const iron = PAL.steelDark
  const ironL = PAL.steelLight
  // 底板
  s.rect(4, g - 6, 56, 6, iron)
  s.rect(4, g - 6, 56, 1, ironL, 0.6)
  // 后栅（暗）
  for (let k = 0; k < 8; k++) s.rect(8 + k * 7, 10, 2, g - 16, shade(iron, -0.35))
  // 两侧立柱（粗）
  s.rect(2, 4, 5, g - 4, iron)
  s.rect(2, 4, 1, g - 4, ironL, 0.8)
  s.rect(57, 4, 5, g - 4, iron)
  s.rect(61, 4, 1, g - 4, ironL, 0.5)
  // 顶横梁 + 顶栅
  s.rect(2, 4, 60, 4, iron)
  s.rect(2, 4, 60, 1, ironL, 0.7)
  for (let k = 0; k < 8; k++) s.line(7 + k * 7, 8, 12 + k * 7, 4, iron, 0.9)
  // 前栅（可读的竖条 + 横档）
  for (let k = 0; k < 8; k++) {
    const x = 8 + k * 7
    s.rect(x, 12, 2, g - 18, k % 2 ? iron : shade(iron, 0.12))
    s.px(x, 12, ironL, 0.7)
  }
  s.rect(4, 26, 56, 2, iron)
  s.rect(4, 26, 56, 1, ironL, 0.35)
  s.rect(4, g - 12, 56, 2, iron)
  // 锁与链（点题：这是“牢笼”）
  s.rect(28, 30, 8, 7, PAL.rust)
  s.rect(29, 31, 6, 5, PAL.rustLight)
  s.rect(30, 33, 4, 1, PAL.void)
  s.line(26, 32, 28, 32, PAL.rustDark)
  s.line(36, 32, 38, 34, PAL.rustDark)
  s.px(34, 36, PAL.steelWhite, 0.6)
  // 地上的稻草 / 骨头 / 划痕
  for (let k = 0; k < 7; k++) {
    s.line(10 + k * 7, g - 7, 14 + k * 7, g - 9, PAL.ochre, 0.35)
  }
  s.px(20, g - 8, PAL.bone, 0.8)
  s.px(21, g - 8, PAL.boneDark)
  for (let k = 0; k < 5; k++) s.line(12 + k * 4, g - 14, 14 + k * 4, g - 10, PAL.ashPale, 0.35)
  // 锈
  s.speck(2, 4, 60, g - 4, PAL.rustDark, 0.09, 0.5)
  for (let k = 0; k < 4; k++) rustStreak(s, 8 + k * 14, 12, 20, 0x140 + k)
  rubble(s, 0, g, 60, 6, 0x141)
}

/** 工作台（台面、台钳、工具）。 */
function propWorkbench(s) {
  const g = s.h - 1
  ground(s, 36, 30)
  const wood = mix(PAL.dust, PAL.sand, 0.18)
  // 台面
  s.rect(4, 12, 64, 5, wood)
  s.rect(4, 12, 64, 1, mix(wood, PAL.sand, 0.45))
  s.rect(4, 16, 64, 1, shade(wood, -0.4))
  // 台腿
  s.rect(8, 17, 4, g - 17, shade(wood, -0.25))
  s.rect(60, 17, 4, g - 17, shade(wood, -0.25))
  s.rect(8, 17, 1, g - 17, wood, 0.6)
  // 横撑
  s.rect(10, g - 12, 52, 2, shade(wood, -0.3))
  // 台钳（左侧）
  s.rect(6, 6, 10, 6, PAL.steelDark)
  s.rect(7, 7, 8, 4, PAL.steel)
  s.rect(4, 8, 3, 3, PAL.steelLight)
  s.px(12, 8, PAL.steelWhite, 0.7)
  // 工具：锤子 / 扳手 / 螺丝
  s.line(24, 12, 30, 4, PAL.rustDark)
  s.rect(29, 2, 5, 3, PAL.steelLight)
  s.rect(30, 3, 3, 1, PAL.steelDark)
  s.line(40, 12, 46, 6, PAL.steelLight)
  s.rect(45, 4, 4, 3, PAL.steel)
  s.rect(52, 10, 6, 2, PAL.rust)
  // 零件散落 / 油污
  s.px(58, 11, PAL.steelLight)
  s.px(37, 11, PAL.ochre)
  s.ell(20, 13, 7, 1.6, PAL.oil, 0.4)
  s.speck(4, 12, 64, 6, PAL.rustDark, 0.12, 0.5)
  // 台下杂物
  s.rect(24, g - 8, 10, 8, PAL.rustDark)
  s.px(26, g - 6, PAL.rust)
  rubble(s, 2, g, 68, 7, 0x150)
}

/** 终端（亮屏，青绿冷光）。 */
function propTerminal(s) {
  const g = s.h - 1
  ground(s, 22, 17)
  // 机柜
  s.rect(6, 18, 32, g - 18, PAL.ashPale)
  s.rect(6, 18, 32, 2, PAL.steelLight, 0.6)
  s.rect(36, 18, 2, g - 18, PAL.steelDark)
  // 键盘
  s.poly(
    [
      [8, g - 8],
      [34, g - 8],
      [38, g - 2],
      [6, g - 2],
    ],
    PAL.steelDark,
  )
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      s.px(9 + c * 3 + r, g - 7 + r * 2, PAL.ashPale, 0.8)
    }
  }
  // 显示器
  s.poly(
    [
      [4, 4],
      [40, 4],
      [38, 22],
      [6, 22],
    ],
    PAL.ashPale,
  )
  s.rect(7, 7, 28, 12, PAL.black)
  // 屏幕内容：扫描线 + 光标 + 数据条
  for (let y = 8; y < 19; y += 2) s.rect(8, y, 26, 1, PAL.toxicDark, 0.55)
  s.rect(9, 9, 12, 1, PAL.neon, 0.75)
  s.rect(9, 12, 18, 1, PAL.neon, 0.45)
  s.rect(9, 15, 8, 1, PAL.neonWarm, 0.6)
  s.rect(9, 17, 2, 2, PAL.neon)
  s.glow(21, 13, 13, PAL.neon, 0.28)
  // 侧面板 / 散热 / 线
  vent(s, 30, 24, 6, 4, PAL.steelDark)
  s.line(38, 30, 44, g - 4, PAL.oilSheen)
  s.px(44, g - 4, PAL.rust)
  // 锈与灰
  s.speck(4, 4, 36, g - 4, PAL.rustDark, 0.08, 0.5)
  s.speck(6, g - 14, 32, 10, PAL.dust, 0.1, 0.4)
  rubble(s, 2, g, 40, 5, 0x160)
}

/** 发电机（柴油机 + 排气 + 电缆）。 */
function propGenerator(s) {
  const g = s.h - 1
  ground(s, 32, 28)
  const metal = mix(PAL.steelBlue, PAL.rustDark, 0.35)
  // 底座
  s.rect(4, g - 8, 56, 8, PAL.ash)
  s.rect(4, g - 8, 56, 1, PAL.steelLight, 0.4)
  // 主机体
  s.poly(
    [
      [6, 16],
      [56, 14],
      [58, g - 8],
      [6, g - 8],
    ],
    metal,
  )
  s.line(7, 17, 55, 15, mix(metal, PAL.steelLight, 0.5))
  // 散热格栅
  for (let k = 0; k < 5; k++) s.rect(10, 22 + k * 4, 18, 2, PAL.ashPale)
  s.rect(8, 20, 22, 22, PAL.steelDark, 0.5)
  // 排气筒
  s.rect(48, 2, 6, 14, PAL.steelDark)
  s.rect(48, 2, 2, 14, PAL.steelLight, 0.6)
  s.rect(47, 1, 8, 2, PAL.rust)
  s.ell(51, 1, 4, 1.4, PAL.ashPale, 0.5)
  // 控制面板 + 指示灯
  s.rect(36, 22, 16, 12, PAL.ash)
  s.rect(38, 24, 5, 3, PAL.toxicDark)
  s.rect(39, 25, 3, 1, PAL.toxicGlow)
  s.disc(46, 26, 1.6, PAL.steelDark)
  s.px(46, 26, PAL.neonWarm, 0.9)
  s.glow(46, 26, 4, PAL.neonWarm, 0.3)
  // 电缆
  s.thick(58, g - 12, 62, g - 5, 1.4, PAL.oil)
  s.thick(58, g - 12, 62, g - 5, 0.7, PAL.oilSheen, 0.6)
  s.px(62, g - 5, PAL.rustLight)
  // 油污 / 锈
  s.speck(6, 14, 50, g - 22, PAL.rustDark, 0.12, 0.55)
  s.ell(20, g - 9, 14, 2, PAL.oil, 0.45)
  rubble(s, 2, g, 60, 6, 0x170)
}

/** 中继站（中继塔 + 天线盘）。 */
function propRelay(s) {
  const g = s.h - 1
  ground(s, 20, 14)
  // 底座
  s.rect(8, g - 8, 24, 8, PAL.ash)
  s.rect(8, g - 8, 24, 1, PAL.steelLight, 0.4)
  // 桅杆
  s.rect(17, 8, 6, g - 16, PAL.steel)
  s.rect(17, 8, 2, g - 16, PAL.steelLight, 0.7)
  s.rect(22, 8, 1, g - 16, PAL.steelDark)
  // 三角支撑
  s.line(20, g - 10, 8, g - 2, PAL.steelDark)
  s.line(20, g - 10, 32, g - 2, PAL.steelDark)
  // 中继器箱
  s.rect(8, 46, 24, 12, PAL.ashPale)
  s.rect(8, 46, 24, 1, PAL.steelLight, 0.5)
  s.rect(11, 49, 8, 3, PAL.toxicDark)
  s.rect(12, 50, 6, 1, PAL.neon)
  s.disc(26, 50, 1.6, PAL.steelDark)
  s.px(26, 50, PAL.neonRed, 0.9)
  s.glow(26, 50, 4, PAL.neonRed, 0.3)
  // 抛物面天线（左上）
  s.poly(
    [
      [4, 18],
      [16, 12],
      [20, 24],
      [8, 28],
    ],
    PAL.steelDark,
  )
  s.poly(
    [
      [6, 19],
      [15, 14],
      [18, 23],
      [9, 26],
    ],
    PAL.steelLight,
  )
  s.line(16, 20, 20, 18, PAL.steelLight)
  s.px(20, 18, PAL.neonWarm, 0.8)
  s.glow(19, 19, 5, PAL.neonWarm, 0.25)
  // 顶灯 + 拉线
  s.rect(19, 4, 2, 4, PAL.steelDark)
  s.px(20, 3, PAL.neonRed)
  s.glow(20, 3, 6, PAL.neonRed, 0.45)
  s.line(18, 10, 4, g - 6, PAL.ashPale, 0.3)
  s.line(22, 10, 36, g - 6, PAL.ashPale, 0.3)
  // 锈
  s.speck(4, 2, 32, g - 2, PAL.rustDark, 0.1, 0.5)
  rubble(s, 4, g, 32, 5, 0x180)
}

/** 天线（高塔，桁架结构）。 */
function propAntenna(s) {
  const g = s.h - 1
  ground(s, 15, 12)
  // 基座
  s.rect(7, g - 8, 16, 8, PAL.ash)
  s.rect(7, g - 8, 16, 1, PAL.steelLight, 0.35)
  // 主杆（收分）
  for (let y = 12; y < g - 8; y++) {
    const t = (y - 12) / (g - 20)
    const half = 1.2 + t * 4
    s.rect(15 - half, y, half * 2, 1, PAL.steel)
    if (Math.abs(y % 6) < 1) s.px(15 - half, y, PAL.steelLight, 0.6)
  }
  s.rect(14, 8, 2, g - 16, PAL.steelDark, 0.8)
  // 桁架斜撑
  for (let y = 20; y < g - 14; y += 12) {
    const t = (y - 12) / (g - 20)
    const half = 1.2 + t * 4
    s.line(15 - half, y, 15 + half, y + 10, PAL.steelDark, 0.8)
    s.line(15 + half, y, 15 - half, y + 10, PAL.steelDark, 0.8)
    s.line(15 - half, y, 15 + half, y, PAL.steel, 0.7)
  }
  // 顶部天线杆 + 航空灯
  s.rect(14.5, 2, 1, 7, PAL.steelLight)
  s.px(15, 1, PAL.neonRed)
  s.glow(15, 1, 7, PAL.neonRed, 0.5)
  // 横担 + 绝缘子
  for (const y of [30, 58, 86]) {
    s.rect(4, y, 22, 1.5, PAL.steelDark)
    s.px(5, y - 1, PAL.glass, 0.8)
    s.px(24, y - 1, PAL.glass, 0.8)
  }
  // 垂落的电线
  s.line(4, 30, 2, g - 4, PAL.oilSheen, 0.6)
  s.line(25, 58, 28, g - 10, PAL.oilSheen, 0.5)
  // 锈与积雪般的灰
  s.speck(6, 4, 20, g - 8, PAL.rustDark, 0.12, 0.5)
  s.speck(10, 4, 12, 30, PAL.sandDark, 0.08, 0.4)
}

/** 卫星天线（落地式）。 */
function propSatellite(s) {
  const g = s.h - 1
  ground(s, 30, 24)
  // 支架
  s.rect(24, g - 14, 12, 14, PAL.steelDark)
  s.line(30, g - 14, 12, g - 2, PAL.steelDark)
  s.line(30, g - 14, 46, g - 2, PAL.steelDark)
  s.rect(20, g - 4, 20, 4, PAL.ash)
  // 抛物面（斜向天空）
  s.poly(
    [
      [8, 16],
      [34, 2],
      [56, 14],
      [40, 36],
      [14, 30],
    ],
    PAL.steelDark,
  )
  s.poly(
    [
      [11, 17],
      [34, 5],
      [52, 15],
      [38, 32],
      [16, 27],
    ],
    PAL.steelLight,
  )
  // 盘面同心环
  s.ell(33, 18, 16, 11, PAL.steel, 0.7)
  s.ell(33, 18, 9, 6, PAL.steelLight, 0.8)
  s.ell(33, 18, 3, 2, PAL.steelDark)
  s.px(33, 18, PAL.steelWhite)
  // 馈源支架 + 接收头
  s.line(33, 18, 30, 12, PAL.steelDark)
  s.rect(28, 9, 4, 4, PAL.steelDark)
  s.px(30, 10, PAL.neon)
  s.glow(30, 10, 6, PAL.neon, 0.35)
  // 破损（缺角 + 破洞）
  s.poly(
    [
      [44, 24],
      [54, 16],
      [50, 28],
    ],
    PAL.void,
  )
  s.ell(24, 12, 3, 2, PAL.void, 0.5)
  // 锈 / 苔
  s.speck(10, 4, 44, 30, PAL.rustDark, 0.1, 0.5)
  s.speck(8, 24, 16, 10, PAL.mossDead, 0.08, 0.4)
  rubble(s, 12, g, 36, 6, 0x190)
}

/** 营火（火焰 + 光晕）。 */
function propCampfire(s) {
  const g = s.h - 1
  ground(s, 18, 13)
  // 石圈
  for (let k = 0; k < 6; k++) {
    const x = 5 + k * 5
    s.ell(x, g - 3, 2.4, 1.8, PAL.ashPale)
    s.px(x - 0.5, g - 4, PAL.steelLight, 0.5)
  }
  // 柴堆
  s.thick(8, g - 5, 26, g - 8, 1.8, PAL.rustDark)
  s.thick(10, g - 8, 24, g - 4, 1.8, PAL.dust)
  s.px(15, g - 7, PAL.rust)
  // 火焰（抖动块 + 内焰）
  s.poly(
    [
      [18, g - 8],
      [14, g - 14],
      [17, g - 13],
      [16, g - 20],
      [20, g - 15],
      [22, g - 22],
      [23, g - 14],
      [26, g - 12],
      [22, g - 7],
    ],
    PAL.rustHot,
  )
  s.poly(
    [
      [18, g - 8],
      [17, g - 13],
      [20, g - 17],
      [21, g - 11],
      [23, g - 9],
    ],
    PAL.neonWarm,
  )
  s.poly(
    [
      [18, g - 8],
      [19, g - 11],
      [21, g - 9],
    ],
    PAL.white,
  )
  // 余烬飞升
  for (let k = 0; k < 7; k++) {
    const r = mulberry32(0x1a0 + k)
    s.px(16 + r() * 10, g - 14 - r() * 8, PAL.neonWarm, 0.4 + r() * 0.5)
  }
  s.glow(20, g - 12, 13, PAL.neonWarm, 0.45)
  s.glow(20, g - 6, 10, PAL.rustHot, 0.2)
}

/** 帐篷（补丁帆布）。 */
function propTent(s) {
  const g = s.h - 1
  ground(s, 35, 30)
  const canvas = mix(PAL.sand, PAL.dust, 0.35)
  const canvasL = mix(canvas, PAL.sand, 0.4)
  const canvasD = mix(canvas, PAL.dust, 0.5)
  // 帐篷主体（三角）
  s.poly(
    [
      [4, g - 2],
      [35, 6],
      [66, g - 2],
    ],
    canvas,
  )
  // 受光面
  s.poly(
    [
      [6, g - 3],
      [35, 8],
      [35, g - 3],
    ],
    canvasL,
  )
  // 门帘（拉开）
  s.poly(
    [
      [28, g - 3],
      [35, 16],
      [42, g - 3],
    ],
    PAL.void,
  )
  s.poly(
    [
      [26, g - 3],
      [33, 18],
      [29, 17],
    ],
    canvasD,
  )
  // 布褶
  for (let k = 0; k < 4; k++) {
    s.line(12 + k * 14, g - 4, 30 + k * 2, 10 + k * 2, canvasD, 0.5)
  }
  // 补丁
  s.rect(42, 24, 9, 7, PAL.rustDark, 0.9)
  s.line(42, 24, 51, 24, PAL.rust, 0.7)
  s.rect(16, 32, 8, 6, PAL.dustLight, 0.6)
  // 拉绳 + 地钉
  s.line(35, 6, 3, g - 1, PAL.ashPale, 0.5)
  s.line(35, 6, 68, g - 1, PAL.ashPale, 0.5)
  s.px(3, g - 1, PAL.steelLight)
  s.px(68, g - 1, PAL.steelLight)
  // 顶旗
  s.line(35, 6, 35, 1, PAL.steelDark)
  s.poly(
    [
      [36, 1],
      [42, 3],
      [36, 5],
    ],
    PAL.blood,
    0.9,
  )
  // 污渍与破洞
  s.poly(
    [
      [50, 30],
      [56, 32],
      [54, 38],
      [48, 36],
    ],
    PAL.void, 0.75,
  )
  s.speck(10, 10, 54, g - 12, PAL.dust, 0.1, 0.4)
  rubble(s, 2, g, 64, 6, 0x1b0)
}

/** 废物堆。 */
function propJunkHeap(s) {
  const g = s.h - 1
  ground(s, 45, 38)
  const r = mulberry32(0x1c0)
  // 底层碎石
  for (let k = 0; k < 12; k++) {
    const x = 6 + r() * 78
    s.ell(x, g - 2 - r() * 3, 3 + r() * 4, 2 + r() * 2, r() < 0.5 ? PAL.ash : PAL.dust)
  }
  // 轮廓堆
  s.poly(
    [
      [4, g - 2],
      [14, g - 20],
      [30, g - 34],
      [52, g - 30],
      [72, g - 18],
      [86, g - 4],
    ],
    PAL.steelDark,
  )
  // 废件：板、管、齿轮、轮胎
  s.rect(12, g - 16, 20, 4, PAL.rust)
  s.rect(12, g - 16, 20, 1, PAL.rustLight)
  s.line(30, g - 24, 50, g - 12, PAL.steel)
  s.line(30, g - 24, 50, g - 12, PAL.steelLight, 0.5)
  s.disc(56, g - 22, 6, PAL.steelDark)
  s.disc(56, g - 22, 4, PAL.steel)
  s.disc(56, g - 22, 1.6, PAL.void)
  s.ell(70, g - 8, 8, 4, PAL.oil)
  s.ell(70, g - 8, 5, 2.4, PAL.black)
  s.rect(24, g - 30, 14, 5, PAL.rustDark)
  s.rect(24, g - 30, 14, 1, PAL.rust, 0.8)
  s.poly(
    [
      [40, g - 32],
      [50, g - 26],
      [42, g - 22],
    ],
    PAL.ashPale,
  )
  // 露出的线缆 / 弹簧
  wireJunk(s, 34, g - 28, r)
  // 锈与高光
  s.speck(6, g - 34, 78, 32, PAL.rustDark, 0.12, 0.55)
  s.speck(6, g - 34, 78, 32, PAL.steelLight, 0.03, 0.35)
  rubble(s, 2, g, 84, 8, 0x1c1)
}

function wireJunk(s, x, y, r) {
  let px = x
  let py = y
  for (let k = 0; k < 10; k++) {
    px += (r() - 0.5) * 4
    py += 1 + r() * 1.5
    s.px(px, py, PAL.oilSheen)
    s.px(px + 1, py, PAL.oil, 0.8)
  }
}

/** 枯树。 */
function propTreeDead(s) {
  const g = s.h - 1
  ground(s, 30, 20)
  const bark = mix(PAL.rustDark, PAL.dust, 0.3)
  const barkL = mix(bark, PAL.sand, 0.28)
  const barkD = mix(bark, PAL.void, 0.4)
  // 根
  s.poly(
    [
      [22, g - 2],
      [24, g - 10],
      [34, g - 10],
      [40, g - 1],
    ],
    bark,
  )
  // 主干（略弯）
  for (let y = g - 8; y > 20; y--) {
    const t = (g - 8 - y) / (g - 30)
    const x = 28 + Math.sin(t * 2.2) * 3
    const w = 7 - t * 4
    s.rect(x - w / 2, y, w, 1, bark)
    s.px(x - w / 2, y, barkL, 0.8)
    s.px(x + w / 2 - 1, y, barkD, 0.9)
  }
  // 大枝
  const branches = [
    [28, 32, 12, 20, 2.6],
    [29, 46, 46, 32, 2.4],
    [28, 58, 14, 48, 2.2],
    [29, 68, 44, 58, 2],
    [28, 80, 20, 74, 1.8],
  ]
  for (const [x0, y0, x1, y1, r] of branches) {
    s.thick(x0, y0, x1, y1, r, bark)
    s.thick(x0, y0 - 1, x1, y1 - 1, r * 0.5, barkL, 0.5)
    s.thick(x0, y0 + 1, x1, y1 + 1, r * 0.45, barkD, 0.6)
  }
  // 细枝（枯枝交错）
  const twigs = [
    [12, 20, 4, 8],
    [12, 20, 18, 6],
    [46, 32, 56, 22],
    [46, 32, 50, 42],
    [14, 48, 4, 40],
    [14, 48, 8, 56],
    [44, 58, 56, 50],
    [20, 74, 8, 66],
    [20, 74, 26, 64],
  ]
  for (const [x0, y0, x1, y1] of twigs) {
    s.line(x0, y0, x1, y1, barkD)
    s.px(x1, y1, bark, 0.9)
  }
  // 树皮纹理 / 断口
  for (let k = 0; k < 10; k++) {
    const r = mulberry32(0x1d0 + k)
    s.px(24 + r() * 9, 24 + r() * (g - 34), barkD, 0.5)
  }
  s.ell(28, 24, 3, 2, PAL.void, 0.6)
  s.ell(12, 20, 2, 1.4, PAL.void, 0.5)
  // 树下碎枝
  for (let k = 0; k < 5; k++) {
    s.line(6 + k * 6, g - 1, 10 + k * 6, g - 3, barkD, 0.7)
  }
  rubble(s, 6, g, 46, 7, 0x1d1)
}

/** 枯草（几丛）。 */
function propWeed(s) {
  const g = s.h - 1
  ground(s, 15, 11, 0.26)
  for (let k = 0; k < 9; k++) {
    const r = mulberry32(0x1e0 + k)
    const bx = 4 + r() * 23
    const h = 8 + r() * 10
    const lean = (r() - 0.5) * 8
    const c = r() < 0.5 ? PAL.weed : PAL.mossDead
    let x = bx
    for (let i = 0; i < h; i++) {
      const t = i / h
      x = bx + lean * t * t
      s.px(x, g - 1 - i, c, 0.85 - t * 0.35)
      if (i % 4 === 2) s.px(x + (lean > 0 ? 1 : -1), g - 1 - i, mix(c, PAL.sand, 0.4), 0.7)
    }
    // 穗
    if (h > 12) {
      s.px(x, g - 2 - h, PAL.sandDark, 0.8)
      s.px(x + 1, g - 3 - h, PAL.sandDark, 0.6)
    }
  }
  // 底部枯叶
  for (let k = 0; k < 5; k++) s.line(5 + k * 5, g, 3 + k * 5, g - 2, PAL.dust, 0.5)
}

/** 毒水洼。 */
function propPuddleToxic(s) {
  const g = s.h - 1
  const cy = g - 6
  // 湿痕
  s.ell(40, g - 4, 38, 5, PAL.toxicDark, 0.25)
  // 水面
  s.ell(38, cy, 34, 6.5, PAL.toxicDark)
  s.ell(38, cy, 31, 5, mix(PAL.toxicDark, PAL.toxic, 0.45))
  s.ell(38, cy - 1, 26, 3.4, PAL.toxic)
  // 反光（横向短线，不使用渐变）
  for (let k = 0; k < 7; k++) {
    const r = mulberry32(0x1f0 + k)
    const x = 12 + r() * 50
    s.line(x, cy - 2 + r() * 3, x + 4 + r() * 6, cy - 2 + r() * 3, PAL.toxicGlow, 0.5)
  }
  // 气泡（几个亮点 + 破泡环）
  for (let k = 0; k < 5; k++) {
    const r = mulberry32(0x200 + k)
    const x = 18 + r() * 42
    const y = cy - 2 + r() * 4
    s.disc(x, y, 1.4, PAL.toxicGlow, 0.5)
    s.px(x - 0.5, y - 0.5, PAL.white, 0.8)
  }
  // 边缘污垢
  s.ell(38, cy + 2, 33, 4, PAL.toxicDark, 0.5)
  s.speck(6, cy - 4, 64, 10, PAL.toxicGlow, 0.06, 0.4)
  s.glow(38, cy, 26, PAL.toxicGlow, 0.12)
  // 岸边的死草、骨头
  s.line(4, g - 1, 8, g - 4, PAL.mossDead, 0.6)
  s.line(74, g - 2, 70, g - 5, PAL.mossDead, 0.5)
  s.px(66, cy + 1, PAL.bone, 0.85)
  s.px(67, cy + 1, PAL.boneDark)
}

/* ============================================================================
 * 3a+. 地面小杂物（纯装饰贴地散布件，无交互 —— 不占位、不搜刮）
 * ========================================================================== */

/** 小碎石堆：碎水泥 + 断砖 + 沙土。 */
function propRubbleSmall(s) {
  const g = s.h - 1
  ground(s, 17, 13, 0.22)
  s.ell(17, g - 0.5, 14, 2.2, PAL.dust, 0.5)
  rubble(s, 5, g - 1, 24, 8, 0x7101)
  // 两块大点的断砖 / 水泥块
  s.rect(8, g - 5, 6, 4, PAL.ashPale)
  s.rect(8, g - 5, 6, 1, PAL.dustLight)
  s.px(13, g - 3, PAL.rustDark, 0.7)
  s.rect(21, g - 4, 5, 4, PAL.rust)
  s.rect(21, g - 4, 5, 1, PAL.rustLight)
  s.speck(6, g - 6, 22, 6, PAL.sandDark, 0.12, 0.5)
}

/** 散落金属碎片：弯折薄板 + 螺栓 + 一小截弹簧。 */
function propScrapBits(s) {
  const g = s.h - 1
  ground(s, 19, 15, 0.2)
  s.poly([[6, g - 1], [16, g - 5], [18, g - 1]], PAL.steel)
  s.line(6, g - 1, 16, g - 5, PAL.steelLight, 0.8)
  s.poly([[22, g - 1], [30, g - 6], [34, g - 1]], PAL.steelDark)
  s.line(22, g - 1, 30, g - 6, PAL.steelBlue, 0.8)
  // 螺栓 / 铆钉点
  const rnd = mulberry32(0x7202)
  for (let k = 0; k < 7; k++) {
    const x = 4 + rnd() * 30
    s.px(x, g - 1 - rnd() * 2, rnd() < 0.4 ? PAL.rustLight : PAL.steelLight, 0.9)
  }
  // 一小截弹簧（斜向锯齿）
  for (let k = 0; k < 5; k++) s.px(11 + k * 2, g - 7 + (k % 2), PAL.steelWhite, 0.8)
  s.line(10, g - 6, 20, g - 6, PAL.steelLight, 0.3)
}

/** 玻璃渣：碎窗撒了一地。 */
function propGlassShards(s) {
  const g = s.h - 1
  ground(s, 15, 12, 0.14)
  const rnd = mulberry32(0x7303)
  for (let k = 0; k < 11; k++) {
    const x = 3 + rnd() * 24
    const y = g - rnd() * 4
    const sz = 1 + rnd() * 1.6
    s.poly([[x, y], [x + sz, y - sz * 0.7], [x + sz * 1.6, y]], PAL.glass, 0.75)
    if (rnd() < 0.6) s.px(x + 0.4, y - 0.6, PAL.white, 0.85)
  }
  s.speck(4, g - 4, 22, 4, PAL.glass, 0.1, 0.4)
}

/** 盘卷线缆：一盘胶皮线，线头拖出去露着铜芯。 */
function propCableCoil(s) {
  const g = s.h - 1
  ground(s, 18, 15, 0.24)
  // 三圈同心线盘
  for (let k = 0; k < 3; k++) {
    s.ell(17, g - 3, 11 - k * 2.4, 4.5 - k * 1.2, k % 2 ? PAL.oil : PAL.rustDeep, 0.95)
  }
  s.ell(17, g - 3, 3, 1.4, PAL.void)
  s.line(7, g - 5, 27, g - 5, PAL.oilSheen, 0.5)
  // 拖出去的线头（铜芯露出）
  s.thick(26, g - 2, 38, g - 1, 1.1, PAL.oil)
  s.line(30, g - 2, 38, g - 1, PAL.oilSheen, 0.4)
  s.px(38, g - 1, PAL.ochre)
  s.px(39, g - 2, PAL.rustLight, 0.8)
}

/** 纸屑破布：被雨打烂又被风吹干。 */
function propPaperTrash(s) {
  const g = s.h - 1
  ground(s, 18, 14, 0.12)
  const rnd = mulberry32(0x7505)
  // 几张能读出轮廓的纸片（翻卷：上缘亮、下缘暗）
  for (let k = 0; k < 5; k++) {
    const x = 2 + rnd() * 26
    const y = g - 1 - rnd() * 3
    const w = 5 + rnd() * 4
    const h = 3 + rnd() * 2
    const c = rnd() < 0.55 ? PAL.paper : rnd() < 0.5 ? PAL.white : PAL.sandDark
    s.poly([[x, y], [x + w, y - 1], [x + w - 1, y - h], [x - 1, y - h + 1]], c, 0.95)
    s.line(x, y - h + 1, x + w - 1, y - h, PAL.white, 0.4)
    if (rnd() < 0.5) s.line(x + 1, y - 2, x + w - 2, y - 2.5, PAL.ink, 0.4)
  }
  // 一片破布（比纸片大，带撕边）
  s.poly([[24, g - 1], [34, g - 1], [32, g - 5], [26, g - 4]], PAL.mossDead, 0.9)
  s.px(28, g - 4, PAL.dustLight, 0.6)
  s.px(31, g - 2, PAL.dustLight, 0.5)
  s.px(27, g - 2, PAL.void, 0.4)
}

/** 弹壳小堆：黄铜壳 + 一小片火药渍。 */
function propShellCasings(s) {
  const g = s.h - 1
  ground(s, 13, 10, 0.18)
  s.ell(13, g - 0.5, 9, 1.4, PAL.oil, 0.4)
  const rnd = mulberry32(0x7606)
  for (let k = 0; k < 9; k++) {
    const x = 3 + rnd() * 20
    const y = g - 0.8 - rnd() * 2.6
    if (rnd() < 0.7) {
      s.rect(x, y, 3, 1.4, PAL.ochre)
      s.px(x + 2.6, y + 0.2, PAL.sandDark, 0.9)
      s.px(x, y, PAL.sand, 0.7)
    } else {
      s.rect(x, y - 2, 1.4, 3, PAL.ochre)
      s.px(x + 0.2, y - 2.4, PAL.sandDark)
    }
  }
}

/** 碎骨：两根散骨 + 骨渣。 */
function propBoneScatter(s) {
  const g = s.h - 1
  ground(s, 17, 13, 0.16)
  bone(s, 6, g - 2, 16, g - 3.5, 1.2)
  bone(s, 20, g - 1.5, 28, g - 4, 1.1)
  s.thick(12, g - 1, 22, g - 1.5, 0.9, PAL.boneDark)
  const rnd = mulberry32(0x7707)
  for (let k = 0; k < 6; k++) s.px(5 + rnd() * 24, g - 1 - rnd() * 2, PAL.boneDeep, 0.8)
}

/** 地面裂缝：应力撕开的一道口子，边缘微微翘起。 */
function propCrackGround(s) {
  const g = s.h - 1
  const rnd = mulberry32(0x7808)
  let x = 4
  let y = g - 2.5
  while (x < s.w - 6) {
    const nx = x + 3 + rnd() * 4
    const ny = Math.max(g - 6, Math.min(g - 0.5, y + (rnd() - 0.5) * 3.2))
    s.thick(x, y, nx, ny, 1.1, PAL.void, 0.85)
    s.line(x, y - 1, nx, ny - 1, PAL.dustLight, 0.35)
    if (rnd() < 0.4) {
      const mx = (x + nx) / 2
      const my = (y + ny) / 2
      s.thick(mx, my, mx + 3, my - 2.5, 0.7, PAL.void, 0.6)
    }
    x = nx
    y = ny
  }
  s.speck(4, g - 5, s.w - 8, 5, PAL.dust, 0.08, 0.4)
}

/* ============================================================================
 * 3b. 港口 / 医疗 / 工业扩展件（worldgen 51 kind 对齐）
 * ========================================================================== */

/** 通风口：嵌入式格栅，百叶有一片被压弯。 */
function propVent(s) {
  const g = s.h - 1
  ground(s, 23, 17)
  // 外框（水泥/铁框）
  s.rect(3, 4, 40, g - 6, PAL.ash)
  s.rect(3, 4, 40, 2, PAL.ashPale)
  s.rect(4, 6, 38, g - 10, PAL.void)
  s.rect(5, 7, 36, g - 12, PAL.black)
  // 百叶（6 片）
  for (let k = 0; k < 6; k++) {
    const y = 8 + k * 2.2
    s.rect(6, y, 34, 2, PAL.steelDark)
    s.rect(6, y, 34, 1, PAL.steel)
    s.line(7, y, 38, y, PAL.steelLight, 0.6)
  }
  // 压弯的一片
  s.poly(
    [
      [6, 15],
      [24, 13],
      [38, 17],
      [38, 19],
      [6, 18],
    ],
    PAL.steelLight,
  )
  s.line(8, 16, 34, 17, PAL.steelWhite, 0.7)
  // 框上的螺丝 + 锈
  for (const [x, y] of [
    [5, 6],
    [40, 6],
    [5, 17],
    [40, 17],
  ]) {
    s.px(x, y, PAL.steelLight)
    s.px(x + 1, y + 1, PAL.steelDark)
  }
  for (let k = 0; k < 4; k++) rustStreak(s, 8 + k * 9, 6, 10 + k * 2, 0x610 + k)
  // 里面的风：一点灰
  for (let k = 0; k < 5; k++) s.px(12 + k * 5, g - 2, PAL.dust, 0.8)
  rubble(s, 2, g, 42, 4, 0x611)
}

/** 通风管：方形镀锌管，接缝缠胶带。 */
function propDuct(s) {
  const g = s.h - 1
  ground(s, 32, 26)
  // 管体（侧面 + 顶面）
  s.poly(
    [
      [4, 6],
      [58, 4],
      [60, 10],
      [60, g - 4],
      [4, g - 3],
    ],
    PAL.steel,
  )
  s.poly(
    [
      [4, 6],
      [58, 4],
      [60, 10],
      [6, 12],
    ],
    PAL.steelLight,
  )
  // 顶面高光
  s.line(6, 7, 57, 5, PAL.steelWhite, 0.8)
  // 侧面分节
  for (let k = 1; k < 4; k++) {
    const x = 4 + k * 14
    s.line(x, 9, x, g - 3, PAL.steelDark, 0.9)
    s.line(x + 1, 9, x + 1, g - 4, PAL.ashPale, 0.5)
  }
  // 底部阴影
  s.rect(4, g - 5, 56, 2, shade(PAL.steel, -0.45))
  // 吊装带（两条）
  for (const bx of [18, 44]) {
    s.rect(bx, 2, 3, g - 4, PAL.ashPale)
    s.line(bx, 3, bx, g - 4, PAL.steelLight, 0.5)
    s.px(bx + 1, 3, PAL.rust)
  }
  // 胶带补丁
  s.rect(30, 12, 9, 6, mix(PAL.dust, PAL.sand, 0.3))
  s.line(30, 13, 38, 13, PAL.sandDark, 0.8)
  s.line(30, 16, 38, 16, PAL.sandDark, 0.6)
  // 锈与凹痕
  for (let k = 0; k < 4; k++) rustStreak(s, 8 + k * 13, 10, 9 + k * 2, 0x620 + k)
  s.ell(50, 18, 3, 2, PAL.void, 0.5)
  rubble(s, 2, g, 58, 5, 0x621)
}

/** 钢筋堆：一捆生锈螺纹钢，断口是新的。 */
function propRebarPile(s) {
  const g = s.h - 1
  ground(s, 27, 22)
  const rods = [
    [3, g - 3, 50, g - 4],
    [2, g - 6, 51, g - 7],
    [4, g - 9, 49, g - 10],
    [6, g - 12, 47, g - 13],
    [10, g - 15, 44, g - 16],
  ]
  for (const [x0, y0, x1, y1] of rods) {
    s.thick(x0, y0, x1, y1, 1.6, PAL.rustDark)
    s.thick(x0, y0 - 0.4, x1, y1 - 0.4, 0.9, PAL.rust)
    // 螺纹肋
    for (let x = x0 + 3; x < x1 - 2; x += 4) {
      s.px(x, y0 - 1, PAL.rustLight, 0.9)
      s.px(x + 1, y0 + 1, PAL.rustDark, 0.8)
    }
    // 断口（亮金属）
    s.px(x1, y1, PAL.steelWhite)
    s.px(x1 - 1, y1, PAL.steelLight)
  }
  // 一截斜靠在堆上
  s.thick(38, g - 16, 52, g - 2, 1.4, PAL.rust)
  for (let k = 0; k < 4; k++) s.px(40 + k * 3, g - 14 + k * 3, PAL.rustDark, 0.9)
  s.px(52, g - 2, PAL.steelWhite)
  // 捆扎铁丝
  s.thick(16, g - 14, 18, g - 2, 0.8, PAL.steelDark)
  s.thick(34, g - 15, 36, g - 3, 0.8, PAL.steelDark)
  rubble(s, 2, g, 50, 5, 0x630)
}

/** 沙袋：三层码放，灌的是湿沙。 */
function propSandbag(s) {
  const g = s.h - 1
  ground(s, 20, 16)
  const burlap = mix(PAL.dust, PAL.sand, 0.35)
  const burlapD = shade(burlap, -0.3)
  const burlapL = shade(burlap, 0.25)
  const bag = (cx, cy, w, h) => {
    s.ell(cx, cy, w, h, burlapD)
    s.ell(cx, cy - 0.6, w - 0.6, h - 0.6, burlap)
    s.ell(cx - w * 0.2, cy - h * 0.35, w * 0.55, h * 0.45, burlapL, 0.5)
    // 缝线 / 褶皱
    s.line(cx - w + 1, cy, cx + w - 1, cy - 0.5, burlapD, 0.9)
    s.line(cx - w * 0.6, cy + h * 0.4, cx + w * 0.5, cy + h * 0.2, PAL.sandDark, 0.7)
    // 潮湿暗斑
    s.ell(cx + w * 0.25, cy + h * 0.25, w * 0.3, h * 0.3, PAL.dust, 0.9)
  }
  bag(12, g - 5, 10, 5)
  bag(30, g - 5, 10, 5)
  bag(21, g - 14, 11, 5)
  // 袋与袋之间的深缝（让三层袋子读得出来）
  s.line(4, g - 3, 36, g - 3, PAL.void)
  s.ell(21, g - 9.5, 10.5, 1.2, PAL.void, 1)
  s.ell(21, g - 9.5, 9, 0.8, PAL.black, 1)
  s.px(9, g - 6, PAL.void)
  s.px(29, g - 6, PAL.void)
  // 顶袋破了，漏沙
  s.poly(
    [
      [26, g - 17],
      [31, g - 18],
      [30, g - 12],
      [25, g - 12],
    ],
    PAL.void,
    0.8,
  )
  for (let k = 0; k < 6; k++) s.px(26 + k * 1.5, g - 12 + (k % 3), PAL.sand, 0.9)
  // 地面漏出的沙
  s.ell(28, g - 1, 8, 1.6, PAL.sand, 0.8)
  rubble(s, 2, g, 36, 4, 0x640)
}

/** 担架：两根杆 + 帆布，血迹干在布上。 */
function propStretcher(s) {
  const g = s.h - 1
  ground(s, 36, 32)
  // 两根杆
  for (const dy of [0, 8]) {
    s.thick(3, g - 4 - dy, 68, g - 5 - dy, 1.4, PAL.steelDark)
    s.thick(3, g - 4.4 - dy, 68, g - 5.4 - dy, 0.8, PAL.steelLight)
    // 握把胶套
    s.rect(2, g - 6 - dy, 6, 4, PAL.ink)
    s.rect(63, g - 6 - dy, 6, 4, PAL.ink)
  }
  // 帆布
  s.poly(
    [
      [9, g - 5],
      [62, g - 6],
      [61, g - 13],
      [10, g - 12],
    ],
    mix(PAL.dust, PAL.sand, 0.25),
  )
  s.line(10, g - 12, 61, g - 13, PAL.sandDark, 0.9)
  // 折痕
  s.line(20, g - 12, 19, g - 6, PAL.sandDark, 0.6)
  s.line(34, g - 12, 35, g - 6, PAL.sandDark, 0.5)
  s.line(48, g - 12, 47, g - 6, PAL.sandDark, 0.6)
  // 干掉的血迹
  s.ell(30, g - 9, 8, 2.4, PAL.bloodDark, 0.9)
  s.ell(26, g - 8, 4, 1.4, PAL.blood, 0.8)
  s.px(37, g - 8, PAL.blood, 0.7)
  // 垂下来的绑带
  s.line(24, g - 6, 22, g - 1, PAL.dust, 0.9)
  s.line(44, g - 6, 46, g - 1, PAL.dust, 0.8)
  rubble(s, 4, g, 60, 4, 0x650)
}

/** 推床：床轮卡死，床身还能拆电机。 */
function propGurney(s) {
  const g = s.h - 1
  ground(s, 36, 30)
  // 床面
  s.rect(6, 10, 60, 5, PAL.steel)
  s.rect(6, 10, 60, 1, PAL.steelLight)
  s.rect(7, 11, 58, 3, PAL.ashPale)
  // 床垫
  s.poly(
    [
      [8, 9],
      [64, 9],
      [63, 5],
      [9, 5],
    ],
    mix(PAL.sand, PAL.dust, 0.3),
  )
  s.line(9, 6, 62, 6, PAL.sand)
  s.px(20, 7, PAL.bloodDark)
  s.px(21, 7, PAL.bloodDark)
  s.px(42, 8, PAL.dust)
  // 侧栏
  s.rect(10, 2, 2, 7, PAL.steelLight)
  s.rect(9, 2, 46, 1, PAL.steelLight)
  for (let k = 0; k < 4; k++) s.rect(12 + k * 11, 3, 1, 4, PAL.steelLight, 0.8)
  // 腿 + 脚轮
  for (const lx of [12, 58]) {
    s.rect(lx, 15, 3, g - 18, PAL.steelDark)
    s.rect(lx + 1, 15, 1, g - 18, PAL.steel)
    s.disc(lx + 1.5, g - 2, 2.4, PAL.oil)
    s.px(lx + 1, g - 3, PAL.steelLight)
  }
  // 横撑 + 锈
  s.rect(14, g - 12, 46, 2, PAL.steelDark)
  for (let k = 0; k < 3; k++) rustStreak(s, 20 + k * 16, 10, 8, 0x660 + k)
  rubble(s, 4, g, 60, 4, 0x661)
}

/** 常春藤：顺墙爬满，根须钻进砖缝。 */
function propIvy(s) {
  const g = s.h - 1
  ground(s, 15, 12, 0.3)
  const stem = mix(PAL.mossDead, PAL.weed, 0.5)
  const leaf = mix(PAL.toxicDark, PAL.mossDead, 0.5)
  const leafL = mix(leaf, PAL.toxic, 0.45)
  const rnd = mulberry32(0x670)
  // 三条主藤
  for (let v = 0; v < 3; v++) {
    let x = 5 + v * 9 + rnd() * 2
    for (let y = g - 1; y > 2; y--) {
      const t = (g - y) / g
      x += Math.sin((y + v * 7) * 0.16) * 0.9
      s.px(x, y, stem)
      if (rnd() < 0.22) s.px(x + 1, y, shade(stem, 0.2))
      // 叶片（左右交替）
      if (y % 5 === 0) {
        const dir = rnd() < 0.5 ? -1 : 1
        const lx = x + dir * 2
        s.poly(
          [
            [x, y],
            [lx + dir * 2, y - 2],
            [lx + dir * 2, y + 2],
          ],
          leaf,
        )
        s.px(lx + dir, y - 1, leafL, 0.9)
        s.px(x, y, leafL, 0.6)
      }
      // 根须
      if (y % 11 === 0 && rnd() < 0.6) s.line(x, y, x + (rnd() < 0.5 ? -1 : 1), y + 2, PAL.dust, 0.9)
    }
  }
  // 枯叶 / 更密的底部
  for (let k = 0; k < 14; k++) {
    const x = 2 + rnd() * 26
    const y = g - 2 - rnd() * 8
    s.px(x, y, rnd() < 0.5 ? PAL.mossDead : PAL.rustDark, 0.9)
  }
  // 底部泥土
  s.ell(15, g - 1, 10, 1.6, PAL.dust, 0.8)
}

/** 苔石：石头上一层黄绿苔，摸上去是湿的。 */
function propMossRock(s) {
  const g = s.h - 1
  ground(s, 24, 20)
  const rock = mix(PAL.ash, PAL.dust, 0.4)
  const rockD = shade(rock, -0.35)
  const rockL = shade(rock, 0.3)
  s.poly(
    [
      [4, g - 2],
      [7, g - 14],
      [16, g - 22],
      [30, g - 24],
      [42, g - 16],
      [45, g - 5],
      [38, g - 1],
      [10, g - 1],
    ],
    rockD,
  )
  s.poly(
    [
      [6, g - 3],
      [9, g - 13],
      [17, g - 20],
      [29, g - 21],
      [40, g - 14],
      [42, g - 6],
      [36, g - 3],
    ],
    rock,
  )
  // 棱面
  s.poly(
    [
      [10, g - 12],
      [18, g - 19],
      [28, g - 20],
      [24, g - 12],
    ],
    rockL,
  )
  s.line(12, g - 10, 26, g - 11, rockD, 0.8)
  s.line(26, g - 11, 39, g - 14, rockD, 0.6)
  // 裂缝
  crack(s, 30, g - 20, 10, 1, 0x680)
  // 苔（顶部一厚层 + 侧面斑）
  for (let k = 0; k < 3; k++) {
    s.dith(6 + k * 2, g - 22 + k * 3, 36 - k * 4, 5 + k * 2, k === 0 ? PAL.toxic : PAL.mossDead, 0.55 - k * 0.12)
  }
  for (let k = 0; k < 8; k++) s.px(8 + k * 4, g - 8 + (k % 2), PAL.mossDead, 0.8)
  // 湿亮边
  for (let k = 0; k < 5; k++) s.px(12 + k * 5, g - 21, PAL.toxicGlow, 0.7)
  rubble(s, 2, g, 44, 6, 0x681)
}

/** 小货柜：两米转运柜，门锁撬过又焊死。 */
function propContainerSmall(s) {
  const g = s.h - 1
  ground(s, 60, 56)
  const c1 = mix(PAL.skyDay, PAL.rustDark, 0.5)
  const c2 = mix(c1, PAL.sand, 0.3)
  const c3 = shade(c1, -0.4)
  // 箱体
  s.rect(4, 8, 112, g - 8, c1)
  s.rect(4, 8, 112, 2, c2)
  s.rect(4, g - 6, 112, 5, c3)
  // 波纹（竖向瓦楞）
  for (let k = 0; k < 20; k++) {
    const x = 8 + k * 5.4
    s.rect(x, 10, 2, g - 18, c2, 0.65)
    s.rect(x + 1, 10, 1, g - 18, c3, 0.5)
  }
  // 顶部横梁
  s.rect(4, 6, 112, 3, PAL.steelDark)
  s.rect(4, 6, 112, 1, PAL.steelLight, 0.6)
  // 门端（右侧）：门框 + 锁杆
  s.rect(96, 8, 20, g - 8, c3)
  s.rect(98, 10, 16, g - 12, shade(c1, -0.2))
  for (const lx of [102, 110]) {
    s.rect(lx, 9, 2, g - 11, PAL.steelDark)
    s.px(lx, 20, PAL.steelLight)
    s.px(lx + 1, 34, PAL.steelLight)
  }
  // 焊接痕（锁被焊死）
  s.line(99, 30, 114, 31, PAL.rustHot, 0.9)
  s.line(99, 32, 114, 33, PAL.rust, 0.8)
  s.rect(104, 24, 6, 3, PAL.rust)
  // 标识 / 编号
  s.rect(14, 22, 22, 9, PAL.sand, 0.55)
  s.rect(16, 24, 8, 2, PAL.ink, 0.5)
  s.rect(16, 27, 12, 1, PAL.ink, 0.4)
  s.rect(44, 26, 16, 2, PAL.ink, 0.35)
  // 锈流 / 破洞 / 底部碎石
  for (let k = 0; k < 6; k++) rustStreak(s, 12 + k * 17, 12, 16 + k * 3, 0x690 + k)
  s.poly(
    [
      [66, 40],
      [76, 38],
      [74, 48],
      [66, 49],
    ],
    PAL.void,
    0.85,
  )
  s.line(66, 40, 74, 48, PAL.rustLight, 0.7)
  s.rect(4, g - 10, 112, 3, PAL.rustDark, 0.8)
  rubble(s, 2, g, 116, 8, 0x691)
}

/** 电缆盘：木盘 + 还剩大半盘线。 */
function propCableSpool(s) {
  const g = s.h - 1
  ground(s, 22, 18)
  const wood = mix(PAL.dust, PAL.rustDark, 0.3)
  const woodL = shade(wood, 0.3)
  const woodD = shade(wood, -0.4)
  // 侧盘（面向镜头的大圆）
  s.ell(22, 24, 17, 17, woodD)
  s.ell(22, 24, 15.5, 15.5, wood)
  s.ell(22, 24, 5, 5, woodD)
  s.ell(22, 24, 3.6, 3.6, PAL.black)
  // 木盘板缝（放射状）
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    s.line(22 + Math.cos(a) * 6, 24 + Math.sin(a) * 6, 22 + Math.cos(a) * 15, 24 + Math.sin(a) * 15, woodD, 0.7)
  }
  s.line(9, 14, 14, 9, woodL, 0.8)
  // 线缆（缠在盘上，从左下绕出）
  for (let k = 0; k < 5; k++) {
    const r = 8 + k * 1.6
    s.ell(22, 24, r, r, PAL.oil, 0)
  }
  for (let k = 0; k < 4; k++) {
    const rr = 9 + k * 2
    for (let a = 0.4; a < 3.2; a += 0.12) {
      s.px(22 + Math.cos(a) * rr, 24 + Math.sin(a) * rr, k % 2 ? PAL.oil : PAL.oilSheen, 0.95)
    }
  }
  // 线头拖到地上
  s.thick(12, 38, 4, g - 1, 1, PAL.oil)
  s.px(3, g - 1, PAL.rustLight)
  s.thick(30, 38, 40, g - 2, 0.9, PAL.oilSheen)
  // 支架（木架）
  s.rect(4, g - 6, 36, 3, woodD)
  s.rect(4, g - 6, 36, 1, woodL, 0.7)
  // 锈 / 灰
  for (let k = 0; k < 6; k++) s.px(10 + k * 5, 14 + (k % 4) * 5, PAL.rustDark, 0.85)
  rubble(s, 2, g, 40, 4, 0x6a0)
}

/** 救生圈：挂在栏杆上，白漆的字被雨冲掉一半。 */
function propLifeRing(s) {
  const g = s.h - 1
  ground(s, 12, 9)
  // 环（正面圆环）
  s.ell(12, 13, 9.5, 9.5, PAL.boneDark)
  s.ell(12, 13, 8.5, 8.5, PAL.bone)
  s.ell(12, 13, 4, 4, PAL.void)
  s.ell(12, 13, 3.2, 3.2, PAL.ash, 0.8)
  // 红色分段（四段）
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2 + 0.4
    for (let a = a0; a < a0 + 0.55; a += 0.08) {
      for (let r = 4.6; r < 8.6; r += 0.8) {
        s.px(12 + Math.cos(a) * r, 13 + Math.sin(a) * r, PAL.danger, 0.95)
      }
    }
  }
  // 高光 / 磨损
  s.line(6, 8, 10, 5, PAL.white, 0.8)
  s.px(18, 17, PAL.rustDark, 0.8)
  s.px(8, 19, PAL.dust, 0.9)
  // 绳子（四向绑带）
  for (const a of [0.5, 2.1, 3.7, 5.3]) {
    s.line(12 + Math.cos(a) * 8, 13 + Math.sin(a) * 8, 12 + Math.cos(a) * 11, 13 + Math.sin(a) * 11, PAL.dust, 0.95)
  }
  // 半截字（白漆）
  s.px(9, 11, PAL.white, 0.9)
  s.px(10, 11, PAL.white, 0.8)
  s.px(11, 12, PAL.white, 0.6)
  s.shadow(12, g - 0.5, 8, 1.4, 0.5)
}

/** 吊钩：钩头砸进地里，钢缆还绷着一段。 */
function propCraneHook(s) {
  const g = s.h - 1
  ground(s, 14, 10)
  const steel = mix(PAL.steel, PAL.rust, 0.35)
  // 钢缆（从顶上下来）
  for (let y = 0; y < 20; y++) {
    s.px(13 + (y % 2), y, PAL.steelDark)
    s.px(14 - (y % 2), y, PAL.steel, 0.9)
  }
  s.px(13, 2, PAL.steelLight)
  s.px(14, 9, PAL.steelLight)
  // 滑轮组 / 吊钩座
  s.rect(8, 20, 13, 9, PAL.steelDark)
  s.rect(9, 21, 11, 7, steel)
  s.disc(14, 24, 3.2, PAL.ashPale)
  s.disc(14, 24, 1.6, PAL.steelDark)
  s.px(12, 22, PAL.steelWhite, 0.8)
  // 钩颈
  s.thick(14, 29, 14, 34, 2.4, steel)
  s.thick(14, 29, 14, 34, 1.2, PAL.steelLight, 0.7)
  // 钩身（弯钩，砸进地面）
  s.thick(14, 34, 12, 42, 2.6, steel)
  s.thick(12, 42, 14, 47, 2.4, steel)
  s.thick(14, 47, 18, 48, 2.2, steel)
  s.thick(18, 48, 20, 45, 2, steel)
  s.thick(15, 35, 13, 42, 1.2, PAL.steelLight, 0.6)
  // 钩尖
  s.poly(
    [
      [20, 45],
      [22, 42],
      [19, 45],
    ],
    PAL.steelWhite,
  )
  // 钩上的锈 / 泥
  for (let k = 0; k < 8; k++) s.px(10 + (k % 8), 30 + k * 2, PAL.rustDark, 0.9)
  s.ell(13, g - 1, 9, 2, PAL.dust, 0.9)
  s.ell(16, g - 1, 6, 1.4, PAL.rust, 0.5)
  rubble(s, 4, g, 20, 4, 0x6b0)
}

/** 闸机：三根不锈钢转杆，转起来还在响。 */
function propTurnstile(s) {
  const g = s.h - 1
  ground(s, 22, 16)
  const steel = PAL.steelLight
  const steelD = PAL.steelDark
  // 底座 + 立柱
  s.rect(10, g - 6, 24, 5, steelD)
  s.rect(10, g - 6, 24, 1, steel, 0.8)
  s.rect(18, 12, 8, g - 18, steelD)
  s.rect(19, 12, 6, g - 18, PAL.steel)
  s.line(20, 13, 20, g - 8, PAL.steelWhite, 0.7)
  // 顶部转盘
  s.disc(22, 16, 5, steelD)
  s.disc(22, 16, 3.6, steel)
  s.disc(22, 16, 1.4, PAL.void)
  // 三根转杆（其中一根被撞弯）
  const arms = [
    [-1, 0.25, 16],
    [1, -0.1, 18],
    [0, 1, 0],
  ]
  s.thick(22, 16, 6, 12, 1.6, steel)
  s.thick(22, 16, 38, 13, 1.6, steel)
  s.thick(22, 16, 26, 6, 1.6, steel)
  s.line(21, 16, 6, 12, PAL.steelWhite, 0.6)
  s.line(23, 16, 38, 13, PAL.steelWhite, 0.5)
  // 撞弯的那根（垂下来）
  s.thick(22, 16, 30, 24, 1.4, steel)
  // 划痕 / 指纹 / 贴纸
  s.px(20, 26, PAL.rustDark, 0.9)
  s.px(21, 30, PAL.dust, 0.8)
  s.rect(25, 20, 3, 2, PAL.ochre, 0.7)
  // 侧面读卡器
  s.rect(27, 26, 5, 8, steelD)
  s.rect(28, 27, 3, 3, PAL.black)
  s.px(29, 28, PAL.neonRed, 0.9)
  rubble(s, 6, g, 30, 4, 0x6c0)
}

/** 病床：床垫被啃开，弹簧支棱出来。 */
function propHospitalBed(s) {
  const g = s.h - 1
  ground(s, 40, 34)
  const frame = PAL.steel
  // 床头 / 床尾栏杆
  for (const bx of [6, 64]) {
    s.rect(bx, 4, 3, g - 8, PAL.steelDark)
    s.rect(bx + 1, 4, 1, g - 8, frame)
    s.rect(bx - 1, 6, 5, 2, PAL.steelDark)
    s.rect(bx - 1, 9, 5, 1, PAL.steelLight, 0.7)
  }
  // 床板 + 床垫
  s.rect(8, 12, 58, 4, PAL.steelDark)
  s.rect(8, 12, 58, 1, PAL.steelLight, 0.8)
  s.poly(
    [
      [9, 11],
      [65, 11],
      [64, 6],
      [10, 7],
    ],
    mix(PAL.boneDark, PAL.sand, 0.3),
  )
  // 被啃开的洞 + 弹簧
  s.ell(30, 8, 9, 3, PAL.void)
  s.ell(30, 8, 6, 2, PAL.black)
  for (let k = 0; k < 4; k++) {
    s.line(23 + k * 4, 6, 24 + k * 4, 11, PAL.rust, 0.9)
    s.px(23 + k * 4, 6, PAL.rustLight)
  }
  // 血渍 / 污
  s.ell(48, 9, 7, 2, PAL.bloodDark, 0.85)
  s.ell(52, 8, 3, 1.4, PAL.blood, 0.7)
  for (let k = 0; k < 5; k++) s.px(12 + k * 4, 9 + (k % 2), PAL.dust, 0.8)
  // 床腿 + 轮
  for (const lx of [12, 58]) {
    s.rect(lx, 16, 3, g - 20, PAL.steelDark)
    s.disc(lx + 1.5, g - 3, 2.6, PAL.oil)
    s.px(lx + 1, g - 4, PAL.steelLight)
  }
  s.rect(14, g - 14, 44, 2, PAL.steelDark, 0.9)
  // 刻名（床栏上的划痕）
  s.rect(66, 14, 1, 5, PAL.steelWhite, 0.6)
  s.rect(68, 14, 1, 5, PAL.steelWhite, 0.4)
  // 输液架断了，靠在床边
  s.line(60, 4, 68, g - 6, PAL.steelLight, 0.5)
  rubble(s, 4, g, 68, 5, 0x6d0)
}

/** 淤泥堆：港水退下去留下的淤泥，一脚陷到小腿。 */
function propSiltMound(s) {
  const g = s.h - 1
  ground(s, 30, 26, 0.7)
  const mud = mix(PAL.dust, PAL.void, 0.35)
  const mudL = mix(PAL.dust, PAL.sandDark, 0.35)
  const mudD = mix(mud, PAL.void, 0.4)
  // 主体（低而宽）
  s.poly(
    [
      [2, g - 1],
      [6, g - 8],
      [16, g - 14],
      [30, g - 16],
      [46, g - 12],
      [56, g - 6],
      [58, g - 1],
    ],
    mudD,
  )
  s.poly(
    [
      [4, g - 2],
      [9, g - 9],
      [18, g - 13],
      [30, g - 14],
      [44, g - 11],
      [54, g - 5],
      [55, g - 2],
    ],
    mud,
  )
  // 湿亮面（顶部）
  s.ell(28, g - 12, 16, 3, mudL, 0.9)
  for (let k = 0; k < 5; k++) s.px(16 + k * 6, g - 13, PAL.glass, 0.55)
  // 脚印 / 凹陷
  s.ell(38, g - 6, 4, 2, mudD, 0.9)
  s.ell(20, g - 5, 3, 1.6, mudD, 0.8)
  // 卡在泥里的杂物
  s.rect(34, g - 9, 7, 3, PAL.rustDark)
  s.px(36, g - 10, PAL.rustLight)
  s.line(12, g - 8, 18, g - 10, PAL.steelDark, 0.9)
  s.px(46, g - 7, PAL.steel, 0.9)
  // 水洼反光
  s.ell(10, g - 2, 7, 1.6, PAL.oil, 0.7)
  s.px(8, g - 3, PAL.glass, 0.6)
  rubble(s, 2, g, 54, 5, 0x6e0)
}

/** 货网：尼龙网兜着半箱泡水的零件。 */
function propCargoNet(s) {
  const g = s.h - 1
  ground(s, 32, 26)
  // 底下的货（半箱零件）
  s.rect(12, g - 12, 40, 11, PAL.rustDark)
  s.rect(13, g - 11, 38, 9, mix(PAL.rust, PAL.steel, 0.4))
  for (let k = 0; k < 6; k++) s.px(15 + k * 6, g - 9 + (k % 3), PAL.steelLight, 0.8)
  s.rect(12, g - 12, 40, 1, PAL.rust)
  // 网（斜向网格，罩在货上）
  const net = mix(PAL.sandDark, PAL.dust, 0.4)
  for (let k = 0; k < 12; k++) {
    s.line(2 + k * 6, g - 2, 12 + k * 6, g - 20, net, 0.9)
    s.line(4 + k * 6, g - 2, 18 + k * 6, g - 18, net, 0.75)
  }
  for (let k = 0; k < 7; k++) {
    s.line(2, g - 3 - k * 3, 62, g - 4 - k * 3, net, 0.55)
  }
  // 网结（增粗的点）
  for (let i = 0; i < 10; i++) {
    const x = 6 + i * 6
    const y = g - 4 - ((i * 5) % 14)
    s.px(x, y, PAL.sand, 0.9)
  }
  // 破口（网被扯开）
  s.poly(
    [
      [38, g - 14],
      [46, g - 16],
      [44, g - 6],
      [36, g - 5],
    ],
    PAL.void,
    0.55,
  )
  s.line(38, g - 14, 44, g - 6, net, 0.9)
  // 从网里漏出的零件
  s.px(48, g - 2, PAL.steelLight)
  s.px(50, g - 1, PAL.rust)
  // 顶上的绳结 / 挂钩
  s.thick(30, g - 20, 30, 2, 1, PAL.dust)
  s.disc(30, 2, 2.4, PAL.steelDark)
  s.px(30, 2, PAL.steelLight)
  rubble(s, 6, g, 52, 4, 0x6f0)
}

/** 船体钢板：卷边的船壳板，焊缝比锈还厚。 */
function propHullPlate(s) {
  const g = s.h - 1
  ground(s, 34, 28)
  const hull = mix(PAL.steelBlue, PAL.rustDark, 0.45)
  const hullL = mix(hull, PAL.steelLight, 0.4)
  const hullD = shade(hull, -0.4)
  // 钢板（略微卷边，斜靠）
  s.poly(
    [
      [4, g - 2],
      [10, 8],
      [58, 4],
      [66, 10],
      [62, g - 4],
      [40, g - 1],
    ],
    hullD,
  )
  s.poly(
    [
      [6, g - 4],
      [12, 10],
      [57, 6],
      [63, 11],
      [60, g - 6],
      [40, g - 3],
    ],
    hull,
  )
  // 卷边高光（上缘）
  s.line(12, 9, 57, 5, hullL, 0.9)
  s.line(7, g - 6, 12, 11, hullL, 0.6)
  // 焊缝（两条，比锈还厚）
  for (const [x0, y0, x1, y1] of [
    [20, 12, 26, g - 5],
    [44, 8, 50, g - 6],
  ]) {
    s.thick(x0, y0, x1, y1, 1.8, PAL.rustDark)
    for (let t = 0; t <= 1; t += 0.05) {
      s.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, PAL.rustHot, 0.85)
    }
  }
  // 铆钉（两排）
  for (let k = 0; k < 7; k++) {
    s.px(14 + k * 7, 12, PAL.steelLight)
    s.px(15 + k * 7, 13, PAL.steelDark)
    s.px(18 + k * 7, g - 8, PAL.steelLight, 0.9)
  }
  // 锈斑 / 破洞 / 掉漆
  for (let k = 0; k < 10; k++) {
    const r = mulberry32(0x700 + k)
    s.px(12 + r() * 48, 10 + r() * (g - 20), r() < 0.5 ? PAL.rustDark : PAL.rust, 0.9)
  }
  s.ell(30, 20, 4, 3, PAL.void, 0.85)
  s.line(28, 22, 32, 18, PAL.rustLight, 0.7)
  // 斜靠的支撑（一截管子）
  s.thick(62, g - 2, 54, g - 14, 1.4, PAL.steelDark, 0.9)
  rubble(s, 2, g, 62, 6, 0x701)
}

/** 灯塔：塔身 + 灯室（光是不透明像素，不透明加色）。 */
function propBeacon(s) {
  const g = s.h - 1
  ground(s, 24, 18)
  const tower = mix(PAL.boneDark, PAL.rust, 0.45)
  const towerL = mix(tower, PAL.sand, 0.35)
  const towerD = shade(tower, -0.4)
  // 基座
  s.rect(8, g - 10, 32, 9, PAL.ash)
  s.rect(8, g - 10, 32, 2, PAL.ashPale)
  s.rect(10, g - 12, 28, 3, PAL.steelDark)
  // 塔身（上收分）
  for (let y = 18; y < g - 12; y++) {
    const t = (y - 18) / (g - 30)
    const half = 7 + t * 5
    s.rect(24 - half, y, half * 2, 1, tower)
    s.px(24 - half, y, towerL, 0.85)
    s.px(24 + half - 1, y, towerD, 0.95)
  }
  // 红白条带（三圈）
  for (let k = 0; k < 3; k++) {
    const y = 42 + k * 22
    const t = (y - 18) / (g - 30)
    const half = 7 + t * 5
    s.rect(24 - half, y, half * 2, 4, PAL.danger, 0.9)
    s.rect(24 - half, y, half * 2, 1, PAL.warn, 0.6)
  }
  // 窗（两个）
  for (const [wy, ww] of [
    [60, 4],
    [86, 3],
  ]) {
    s.rect(22, wy, ww, 5, PAL.black)
    s.rect(23, wy + 1, 1, 3, PAL.neonWarm, 0.8)
  }
  // 平台 + 灯室
  s.rect(14, 14, 20, 4, PAL.steelDark)
  s.rect(14, 14, 20, 1, PAL.steelLight, 0.8)
  s.rect(18, 4, 12, 11, PAL.steelDark)
  // 灯室玻璃 + 灯
  s.rect(19, 6, 10, 7, PAL.black)
  s.rect(20, 7, 8, 5, PAL.neonWarm, 0.95)
  s.rect(22, 8, 4, 3, PAL.white, 1)
  s.glow(24, 9, 14, PAL.neonWarm, 1)
  // 灯室顶
  s.poly(
    [
      [17, 4],
      [31, 4],
      [27, 1],
      [21, 1],
    ],
    PAL.steelDark,
  )
  s.px(24, 0, PAL.steelLight)
  // 锈 / 藤 / 灰
  for (let k = 0; k < 8; k++) rustStreak(s, 12 + k * 3, 30 + (k % 4) * 18, 10 + k, 0x710 + k)
  s.line(16, g - 16, 12, g - 30, PAL.mossDead, 0.7)
  s.line(12, g - 30, 9, g - 40, PAL.weed, 0.6)
  rubble(s, 6, g, 36, 5, 0x711)
}

/* ============================================================================
 * 3.9 彩蛋道具（Fallout / Skyrim / NieR / Metro / Akira / Cyberpunk）
 * ========================================================================== */

/** 辐射：半埋的齿轮避难所大门。 */
function propVaultDoor(s) {
  const g = s.h - 1
  const cx = s.w / 2
  // 混凝土门框
  s.rect(4, 12, s.w - 8, s.h - 14, PAL.steel)
  s.rect(2, 8, s.w - 4, 14, PAL.steelLight, 0.9)
  s.rect(0, g - 8, s.w, 9, PAL.ash)
  // 圆门
  s.disc(cx, g - 34, 30, PAL.steelDark)
  s.disc(cx, g - 34, 27, PAL.steel)
  s.disc(cx, g - 34, 22, mix(PAL.steel, PAL.rust, 0.2))
  // 齿轮齿
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU
    const x = cx + Math.cos(a) * 31
    const y = g - 34 + Math.sin(a) * 31
    s.rect(x - 3, y - 3, 6, 6, PAL.steelDark)
  }
  // 中央轮盘 + 编号
  s.disc(cx, g - 34, 13, PAL.steelDark)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4
    s.line(cx, g - 34, cx + Math.cos(a) * 12, g - 34 + Math.sin(a) * 12, PAL.steelLight, 0.9)
  }
  s.disc(cx, g - 34, 3, PAL.rustLight)
  // 门牌
  s.rect(cx - 14, 16, 28, 9, PAL.steelDark)
  s.rect(cx - 13, 17, 26, 7, PAL.rust)
  s.px(cx - 10, 20, PAL.neonWarm)
  s.px(cx - 8, 20, PAL.neonWarm)
  s.px(cx - 5, 20, PAL.neonWarm)
  // 锈 / 灰
  for (let k = 0; k < 9; k++) rustStreak(s, 8 + k * 9, 30 + (k % 3) * 20, 8 + k, 0x810 + k)
  crack(s, cx + 22, g - 60, 10, 1, 0x820)
  rubble(s, 4, g, s.w - 8, 8, 0x821)
}

/** 老滚5：发光的龙语石墙。 */
function propWordWall(s) {
  const g = s.h - 1
  s.rect(2, 6, s.w - 4, s.h - 8, PAL.steelDark)
  s.rect(4, 8, s.w - 8, s.h - 12, mix(PAL.ash, PAL.steel, 0.4))
  // 石块接缝
  for (let y = 14; y < g - 6; y += 12) {
    s.line(4, y, s.w - 4, y, PAL.steelDark, 0.55)
    const off = ((y / 12) % 2) * 14
    for (let x = 18 + off; x < s.w - 8; x += 28) s.line(x, y, x, y + 12, PAL.steelDark, 0.45)
  }
  // 发光刻痕：三道爪痕一样的符文
  const glyphs = [
    [0.22, 0.2, 0.22, 0.62],
    [0.34, 0.28, 0.42, 0.7],
    [0.56, 0.18, 0.48, 0.58],
    [0.66, 0.32, 0.72, 0.72],
    [0.76, 0.24, 0.82, 0.6],
  ]
  for (let k = 0; k < glyphs.length; k++) {
    const [x0, y0, x1, y1] = glyphs[k]
    s.line(s.w * x0, s.h * y0, s.w * x1, s.h * y1, PAL.toxicGlow, 0.8)
    s.line(s.w * x0 + 1, s.h * y0, s.w * x1 + 1, s.h * y1, PAL.neon, 0.35)
    s.px(s.w * x0, s.h * y0, PAL.white, 0.9)
  }
  s.speck(4, 8, s.w - 8, s.h - 14, PAL.toxicGlow, 0.06, 0.5)
  for (let k = 0; k < 6; k++) rustStreak(s, 6 + k * 16, 10 + (k % 2) * 30, 12 + k, 0x830 + k)
}

/** 尼尔：辐射尘里的白色月之泪。 */
function propLunarFlower(s) {
  const g = s.h - 1
  const cx = s.w / 2
  ground(s, cx, 8, 0.28)
  // 茎
  s.thick(cx, g - 2, cx + 1, 10, 1.2, PAL.mossDead)
  s.line(cx - 3, g - 8, cx + 2, g - 4, PAL.weed, 0.7)
  // 花瓣
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    const x = cx + Math.cos(a) * 6
    const y = 9 + Math.sin(a) * 5
    s.ell(x, y, 4, 3, PAL.white, 0.95)
    s.ell(x + 0.5, y + 0.5, 2.4, 1.6, PAL.paper, 0.9)
  }
  // 花心：蓝光
  s.disc(cx, 9, 3, PAL.neonCold)
  s.disc(cx, 9, 1.6, PAL.white)
  s.speck(cx - 7, 3, 14, 12, PAL.neonCold, 0.1, 0.5)
}

/** 地铁：只剩半个字母的站牌。 */
function propMetroSign(s) {
  const g = s.h - 1
  const cx = s.w / 2
  ground(s, cx, 12, 0.3)
  // 立柱
  s.rect(cx - 2, 6, 4, s.h - 8, PAL.steelDark)
  s.rect(cx - 1, 6, 2, s.h - 8, PAL.steel)
  // 站牌
  s.rect(4, 4, s.w - 8, 26, PAL.steelDark)
  s.rect(6, 6, s.w - 12, 22, PAL.rust)
  s.rect(8, 8, s.w - 16, 18, mix(PAL.rust, PAL.black || PAL.void, 0.35))
  // 字母：M E T R O（缺一半）
  const letters = [8, 18, 26, 34, 42]
  for (let k = 0; k < letters.length; k++) {
    const x = letters[k]
    if (k > 2 && k !== 4) continue
    s.rect(x, 12, 2, 10, PAL.neonWarm, 0.9)
    if (k < 2) s.rect(x, 12, 6, 2, PAL.neonWarm, 0.9)
    if (k === 4) s.rect(x, 20, 5, 2, PAL.neonWarm, 0.9)
  }
  // 下方线路图
  s.rect(6, 34, s.w - 12, 18, PAL.paper, 0.75)
  s.line(10, 42, s.w - 10, 42, PAL.rustDark, 0.8)
  s.px(14, 42, PAL.neonRed)
  s.px(s.w - 14, 42, PAL.neonRed)
  // 锈
  for (let k = 0; k < 6; k++) rustStreak(s, 8 + k * 8, 30, 10 + k, 0x840 + k)
  rubble(s, 4, g, s.w - 8, 5, 0x841)
}

/** 阿基拉：瓦砾里的赤色摩托。 */
function propAkiraBike(s) {
  const g = s.h - 1
  const cx = s.w / 2
  ground(s, cx, 40, 0.36)
  // 车轮
  s.disc(cx - 28, g - 12, 11, PAL.ink)
  s.disc(cx - 28, g - 12, 7, PAL.steelDark)
  s.disc(cx - 28, g - 12, 2, PAL.steelLight)
  s.disc(cx + 30, g - 12, 11, PAL.ink)
  s.disc(cx + 30, g - 12, 7, PAL.steelDark)
  s.disc(cx + 30, g - 12, 2, PAL.steelLight)
  // 车架
  s.poly(
    [
      [cx - 24, g - 18],
      [cx + 24, g - 22],
      [cx + 20, g - 32],
      [cx - 20, g - 30],
    ],
    PAL.neonRed
  )
  s.rect(cx - 20, g - 34, 38, 10, mix(PAL.neonRed, PAL.rust, 0.3))
  s.rect(cx - 22, g - 36, 10, 6, PAL.steelDark)
  // 油箱
  s.ell(cx - 2, g - 34, 14, 7, mix(PAL.neonRed, PAL.white, 0.15))
  s.line(cx - 12, g - 36, cx + 10, g - 34, PAL.white, 0.5)
  // 座垫
  s.rect(cx - 18, g - 38, 14, 5, PAL.ink)
  // 车灯
  s.disc(cx + 24, g - 26, 4, PAL.steelDark)
  s.disc(cx + 24, g - 26, 2.4, PAL.neonWarm)
  s.speck(cx + 18, g - 34, 16, 12, PAL.neonWarm, 0.1, 0.5)
  // 车身上的字
  s.rect(cx - 6, g - 27, 12, 3, PAL.white, 0.8)
  s.px(cx - 5, g - 26, PAL.neonRed)
  s.px(cx + 3, g - 26, PAL.neonRed)
  // 锈 / 瓦砾
  for (let k = 0; k < 5; k++) rustStreak(s, cx - 20 + k * 10, g - 30, 6 + k, 0x850 + k)
  rubble(s, 4, g, s.w - 8, 6, 0x851)
}

/** 赛博朋克：只剩一句口号的霓虹海报。 */
function propNeonPoster(s) {
  const g = s.h - 1
  // 墙面背板
  s.rect(2, 2, s.w - 4, s.h - 4, PAL.steelDark)
  s.rect(4, 6, s.w - 8, s.h - 12, mix(PAL.ash, PAL.steel, 0.5))
  // 撕烂的海报纸
  s.poly(
    [
      [6, 8],
      [s.w - 6, 10],
      [s.w - 8, s.h - 16],
      [10, s.h - 12],
    ],
    PAL.paper,
    0.85
  )
  s.poly(
    [
      [s.w - 6, 10],
      [s.w - 14, 18],
      [s.w - 10, s.h - 17],
      [s.w - 8, s.h - 16],
    ],
    PAL.steelDark,
    0.95
  )
  // 人物剪影
  s.ell(s.w / 2, 26, 6, 8, PAL.ink)
  s.poly(
    [
      [s.w / 2 - 8, s.h - 16],
      [s.w / 2 - 5, 34],
      [s.w / 2 + 5, 34],
      [s.w / 2 + 8, s.h - 16],
    ],
    PAL.ink
  )
  // 霓虹字
  for (let k = 0; k < 4; k++) {
    s.rect(10, 14 + k * 5, 3, 2, k % 2 ? PAL.neonRed : PAL.neon, 0.9)
    s.rect(15, 14 + k * 5, 8, 1, PAL.neon, 0.75)
  }
  s.line(9, s.h - 12, s.w - 12, s.h - 14, PAL.neonRed, 0.7)
  s.speck(6, 6, s.w - 12, s.h - 12, PAL.neon, 0.06, 0.4)
  // 贴纸边缘的锈
  for (let k = 0; k < 4; k++) rustStreak(s, 8 + k * 8, s.h - 18, 6 + k, 0x860 + k)
}

/** 尼尔：垃圾场尽头的白色巨鲸骨架。 */
function propNierWhale(s) {
  const g = s.h - 1
  const cx = s.w / 2
  ground(s, cx, 74, 0.34)
  const boneCol = mix(PAL.bone, PAL.white, 0.5)
  const boneDim = mix(PAL.boneDark, PAL.steel, 0.25)
  // 脊椎：一条向上的弧
  const spine = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const x = 16 + t * (s.w - 32)
    const y = g - 18 - Math.sin(t * Math.PI) * 40
    spine.push([x, y])
  }
  for (let i = 0; i < spine.length - 1; i++) {
    s.thick(spine[i][0], spine[i][1], spine[i + 1][0], spine[i + 1][1], 4, boneDim)
    s.thick(spine[i][0], spine[i][1] - 1, spine[i + 1][0], spine[i + 1][1] - 1, 2, boneCol)
  }
  // 肋骨
  for (let i = 2; i < spine.length - 2; i += 1) {
    const [x, y] = spine[i]
    const span = 26 + Math.sin((i / 12) * Math.PI) * 18
    s.thick(x, y, x - span * 0.2, y + span, 2, boneDim)
    s.thick(x, y, x + span * 0.2, y + span, 2, boneDim)
  }
  // 头骨
  const hx = s.w - 26
  const hy = g - 34
  s.ell(hx, hy, 16, 12, boneDim)
  s.ell(hx + 1, hy - 1, 13, 9, boneCol)
  s.ell(hx + 6, hy - 2, 3, 2, PAL.void)
  s.line(hx + 6, hy + 4, hx + 14, hy + 3, PAL.void, 0.7)
  // 尾骨
  s.thick(16, g - 18, 4, g - 8, 3, boneDim)
  // 灰尘 / 苔
  s.speck(8, g - 60, s.w - 16, 56, PAL.dust, 0.06, 0.4)
  s.speck(8, g - 16, s.w - 16, 12, PAL.mossDead, 0.08, 0.4)
}

/* ============================================================================
 * 4. 表：kind → 尺寸 / 绘制函数
 * ========================================================================== */

/* ============================================================================
 * 3b. 垃圾堆变体 / 机械元素（第二批内容）
 * ========================================================================== */

/** 垃圾袋堆：几只鼓胀的黑袋，袋口扎着。 */
function propJunkBags(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.42)
  const r = mulberry32(0x7a1)
  const bags = [
    [14, 10, 14, 13],
    [34, 8, 12, 11],
    [48, 12, 11, 12],
    [22, 6, 9, 7],
  ]
  for (let i = 0; i < bags.length; i++) {
    const [x, y, rx, ry] = bags[i]
    const c = i % 2 ? PAL.ashPale : PAL.ash
    s.ell(x + rx, g - y - ry, rx, ry, c)
    s.ell(x + rx - 2, g - y - ry - 2, rx * 0.6, ry * 0.55, mix(c, PAL.steelLight, 0.25), 0.5)
    s.thick(x + rx, g - y - ry * 2, x + rx + 1, g - y - ry * 2 - 3, 1, PAL.rustDark)
    s.px(x + rx, g - y - ry * 2 - 3, PAL.steelLight, 0.7)
  }
  s.speck(6, g - 34, s.w - 12, 32, PAL.dust, 0.1, 0.4)
  rubble(s, 2, g, s.w - 4, 5, 0x7a2)
}

/** 碎铁堆：锐角板片叠起来，边缘反光。 */
function propJunkScrap(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.44)
  const r = mulberry32(0x7b1)
  for (let k = 0; k < 7; k++) {
    const x = 6 + r() * (s.w - 22)
    const y = g - 6 - r() * 24
    const w = 10 + r() * 16
    const h = 4 + r() * 7
    s.poly(
      [
        [x, y + h],
        [x + 3, y],
        [x + w, y + 2],
        [x + w - 2, y + h],
      ],
      k % 2 ? PAL.steel : PAL.steelDark,
    )
    s.line(x + 3, y + 1, x + w - 2, y + 3, PAL.steelLight, 0.6)
  }
  s.speck(4, g - 30, s.w - 8, 28, PAL.rust, 0.08, 0.45)
  rubble(s, 2, g, s.w - 4, 6, 0x7b2)
}

/** 家电堆：冰箱、风扇、微波炉。 */
function propJunkAppliance(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.44)
  // 冰箱（左，立着）
  s.rect(6, g - 34, 20, 32, PAL.ashPale)
  s.rect(6, g - 34, 20, 2, PAL.steelLight, 0.5)
  s.line(6, g - 22, 26, g - 22, PAL.steelDark)
  s.rect(22, g - 28, 2, 5, PAL.rust)
  // 微波炉（右，斜靠）
  s.poly(
    [
      [30, g - 1],
      [34, g - 19],
      [58, g - 19],
      [56, g - 1],
    ],
    PAL.steel,
  )
  s.poly(
    [
      [36, g - 16],
      [53, g - 16],
      [52, g - 6],
      [38, g - 6],
    ],
    PAL.void,
  )
  // 风扇
  s.disc(44, g - 26, 8, PAL.steelDark)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU
    s.thick(44, g - 26, 44 + Math.cos(a) * 7, g - 26 + Math.sin(a) * 7, 1.6, PAL.steelLight)
  }
  s.rect(40, g - 18, 8, 3, PAL.rustDark)
  s.speck(6, g - 30, s.w - 12, 26, PAL.rustDark, 0.1, 0.5)
  rubble(s, 2, g, s.w - 4, 6, 0x7c2)
}

/** 塑料山：瓶子与包装带。 */
function propJunkPlastic(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.44)
  const r = mulberry32(0x7d1)
  for (let k = 0; k < 12; k++) {
    const x = 5 + r() * (s.w - 14)
    const y = g - 3 - r() * 20
    s.rect(x, y, 3 + r() * 3, 6 + r() * 6, k % 3 ? PAL.sandDark : PAL.dustLight, 0.85)
    s.px(x + 1, y - 1, PAL.sand, 0.5)
  }
  s.thick(6, g - 12, s.w - 8, g - 20, 1.2, PAL.dust, 0.6)
  s.speck(4, g - 26, s.w - 8, 24, PAL.sand, 0.08, 0.35)
  rubble(s, 2, g, s.w - 4, 4, 0x7d2)
}

/** 罐头堆：码成一小垛的空罐头。 */
function propJunkCans(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.4)
  const r = mulberry32(0x7e1)
  for (let row = 0; row < 4; row++) {
    const n = 5 - row
    for (let i = 0; i < n; i++) {
      const x = 6 + i * 9 + row * 4 + r() * 2
      const y = g - 5 - row * 6
      s.rect(x, y, 7, 6, row % 2 ? PAL.ashPale : PAL.steel)
      s.rect(x, y, 7, 1, PAL.steelLight, 0.6)
      s.px(x + 3, y + 3, PAL.rust, 0.7)
    }
  }
  rubble(s, 2, g, s.w - 4, 5, 0x7e2)
}

/** 齿轮组：三个咬合齿轮。 */
function propGearAssembly(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 24)
  s.rect(4, g - 10, s.w - 8, 10, PAL.ash)
  const gears = [
    [24, g - 26, 15],
    [46, g - 20, 11],
    [16, g - 44, 9],
  ]
  for (let i = 0; i < gears.length; i++) {
    const [cx, cy, rr] = gears[i]
    const teeth = Math.max(8, Math.round(rr * 1.2))
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * TAU
      s.rect(cx + Math.cos(a) * rr - 2, cy + Math.sin(a) * rr - 2, 4, 4, PAL.steelDark)
    }
    s.disc(cx, cy, rr, PAL.steel)
    s.disc(cx, cy, rr * 0.62, PAL.ashPale)
    s.disc(cx, cy, rr * 0.22, PAL.void)
    s.px(cx - rr * 0.45, cy - rr * 0.45, PAL.steelLight, 0.6)
  }
  s.speck(6, g - 46, s.w - 12, 36, PAL.rustDark, 0.12, 0.5)
  rubble(s, 2, g, s.w - 4, 5, 0x801)
}

/** 液压压机：门形机架 + 压头。 */
function propHydraulicPress(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.42)
  // 左右立柱
  s.rect(6, 4, 10, g - 4, PAL.steelDark)
  s.rect(6, 4, 4, g - 4, PAL.steel)
  s.rect(s.w - 16, 4, 10, g - 4, PAL.steelDark)
  s.rect(s.w - 16, 4, 4, g - 4, PAL.steel)
  // 顶梁 + 油缸
  s.rect(6, 6, s.w - 12, 12, PAL.steel)
  s.rect(6, 6, s.w - 12, 3, PAL.steelLight, 0.6)
  s.rect(s.w / 2 - 6, 16, 12, 18, PAL.ashPale)
  s.rect(s.w / 2 - 4, 34, 8, 12, PAL.steelLight)
  // 压头
  s.rect(s.w / 2 - 16, g - 34, 32, 10, PAL.steelDark)
  s.rect(s.w / 2 - 16, g - 34, 32, 2, PAL.steelLight, 0.6)
  // 底座
  s.rect(10, g - 12, s.w - 20, 12, PAL.ash)
  s.line(10, g - 12, s.w - 10, g - 12, PAL.steelLight, 0.4)
  s.speck(8, 18, s.w - 16, g - 30, PAL.rustDark, 0.12, 0.5)
  rubble(s, 2, g, s.w - 4, 5, 0x811)
}

/** 传送带段：滚筒 + 皮带。 */
function propConveyor(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.46)
  s.poly(
    [
      [6, g - 18],
      [s.w - 6, g - 22],
      [s.w - 6, g - 14],
      [6, g - 10],
    ],
    PAL.ashPale,
  )
  s.poly(
    [
      [6, g - 18],
      [s.w - 6, g - 22],
      [s.w - 6, g - 20],
      [6, g - 16],
    ],
    PAL.steelLight,
    0.5,
  )
  for (let x = 14; x < s.w - 10; x += 16) {
    s.disc(x, g - 13, 4, PAL.steelDark)
    s.disc(x, g - 13, 2, PAL.steel)
  }
  s.rect(10, g - 10, 6, 10, PAL.steelDark)
  s.rect(s.w - 18, g - 10, 6, 10, PAL.steelDark)
  s.speck(6, g - 22, s.w - 12, 12, PAL.rustDark, 0.14, 0.5)
  rubble(s, 2, g, s.w - 4, 5, 0x821)
}

/** 伺服机械臂：两节臂 + 抓钳。 */
function propServoArm(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 26)
  s.rect(8, g - 14, 26, 14, PAL.ash)
  s.rect(8, g - 14, 26, 2, PAL.steelLight, 0.5)
  // 第一节
  s.thick(20, g - 16, 40, g - 38, 5, PAL.steelDark)
  s.thick(20, g - 16, 40, g - 38, 3, PAL.steel)
  s.disc(20, g - 16, 6, PAL.steelLight)
  s.disc(20, g - 16, 3, PAL.void)
  // 第二节
  s.thick(40, g - 38, 62, g - 30, 4, PAL.steelDark)
  s.thick(40, g - 38, 62, g - 30, 2, PAL.steelLight)
  s.disc(40, g - 38, 5, PAL.ashPale)
  s.disc(40, g - 38, 2.5, PAL.void)
  // 抓钳
  s.thick(62, g - 30, 74, g - 38, 2, PAL.steel)
  s.thick(62, g - 30, 74, g - 23, 2, PAL.steel)
  s.px(74, g - 38, PAL.rustLight)
  s.px(74, g - 23, PAL.rustLight)
  s.thick(28, g - 20, 22, g - 6, 1.2, PAL.oil)
  s.thick(28, g - 20, 22, g - 6, 0.6, PAL.oilSheen, 0.6)
  s.speck(10, g - 36, 58, 30, PAL.rustDark, 0.1, 0.45)
  rubble(s, 2, g, s.w - 4, 5, 0x831)
}

/** 液压活塞：斜插的缸体 + 活塞杆。 */
function propPiston(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 16)
  s.thick(14, g - 4, 22, g - 46, 7, PAL.steelDark)
  s.thick(14, g - 4, 22, g - 46, 4.5, PAL.steel)
  s.thick(20, g - 46, 26, g - 78, 2.4, PAL.steelWhite)
  s.rect(17, g - 52, 8, 8, PAL.ashPale)
  s.rect(17, g - 52, 8, 2, PAL.rust)
  s.line(26, g - 78, 34, g - 80, PAL.steelLight, 0.7)
  s.speck(10, g - 80, 24, 74, PAL.rustDark, 0.1, 0.45)
  rubble(s, 2, g, s.w - 4, 5, 0x841)
}

/** 行车导轨段。 */
function propRail(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.46)
  s.poly(
    [
      [4, g - 8],
      [s.w - 8, g - 14],
      [s.w - 4, g - 8],
      [8, g - 2],
    ],
    PAL.steel,
  )
  s.line(6, g - 8, s.w - 8, g - 14, PAL.steelLight, 0.6)
  for (let x = 10; x < s.w - 16; x += 18) {
    s.disc(x, g - 8 - ((x - 10) / (s.w - 20)) * 5, 1.6, PAL.void)
  }
  s.thick(s.w - 8, g - 14, s.w - 2, g - 4, 1.4, PAL.rust)
  s.speck(4, g - 16, s.w - 8, 12, PAL.rustDark, 0.12, 0.4)
  rubble(s, 2, g, s.w - 4, 4, 0x851)
}

/** 阀组：一排手轮。 */
function propValve(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 18)
  s.rect(6, 16, 10, g - 16, PAL.steelDark)
  s.rect(6, 16, 3, g - 16, PAL.steel)
  s.rect(24, 16, 10, g - 16, PAL.steelDark)
  s.rect(24, 16, 3, g - 16, PAL.steel)
  const wheels = [
    [18, g - 30],
    [30, g - 44],
  ]
  for (const [cx, cy] of wheels) {
    s.disc(cx, cy, 7, PAL.steelDark)
    s.disc(cx, cy, 5, PAL.rust)
    s.disc(cx, cy, 2, PAL.void)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU
      s.thick(cx, cy, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 0.9, PAL.rustLight, 0.8)
    }
  }
  s.thick(10, g - 8, 34, g - 8, 2, PAL.steel)
  s.speck(8, 18, 24, g - 24, PAL.rustDark, 0.12, 0.45)
  rubble(s, 2, g, s.w - 4, 4, 0x861)
}

/** 涡轮机：大圆壳 + 叶片。 */
function propTurbine(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.4)
  const cx = s.w / 2
  const cy = g - 34
  s.disc(cx, cy, 32, PAL.steelDark)
  s.disc(cx, cy, 28, PAL.steel)
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU
    s.poly(
      [
        [cx + Math.cos(a) * 8, cy + Math.sin(a) * 8],
        [cx + Math.cos(a + 0.3) * 26, cy + Math.sin(a + 0.3) * 26],
        [cx + Math.cos(a - 0.1) * 24, cy + Math.sin(a - 0.1) * 24],
      ],
      PAL.steelLight,
    )
  }
  s.disc(cx, cy, 9, PAL.ashPale)
  s.disc(cx, cy, 4, PAL.void)
  s.rect(cx - 8, g - 12, 16, 12, PAL.ash)
  s.speck(6, g - 12, s.w - 12, 10, PAL.rustDark, 0.14, 0.5)
  rubble(s, 2, g, s.w - 4, 5, 0x871)
}

/** 电缆束：从上方垂下的成束电缆。 */
function propCableRun(s) {
  const g = s.h - 1
  const r = mulberry32(0x881)
  for (let k = 0; k < 5; k++) {
    const x = 8 + k * 19
    const sag = 10 + r() * 10
    s.thick(x, 1, x + 3, g - 6, 1.6, PAL.black)
    s.thick(x + 8, 2, x + 8 + sag, g - 4, 1.4, PAL.oil)
  }
  for (let k = 0; k < 4; k++) {
    const x = 14 + k * 22
    s.thick(x, 2, x + 16, g - 2, 1.4, PAL.steelDark)
    s.thick(x, 2, x + 16, g - 2, 0.7, PAL.steelLight, 0.5)
  }
  s.speck(6, g - 10, s.w - 12, 8, PAL.rustDark, 0.1, 0.4)
}

/** 机器人残躯：上半身靠在墙边。 */
function propRobotTorso(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 22)
  // 肩与胸腔
  s.poly(
    [
      [10, g - 4],
      [14, g - 34],
      [30, g - 40],
      [48, g - 36],
      [52, g - 4],
    ],
    PAL.steel,
  )
  s.poly(
    [
      [16, g - 8],
      [18, g - 30],
      [30, g - 34],
      [44, g - 30],
      [46, g - 8],
    ],
    PAL.ashPale,
  )
  // 胸口灯与编号
  s.rect(24, g - 24, 10, 6, PAL.void)
  s.px(26, g - 22, PAL.neonRed, 0.8)
  s.glow(26, g - 22, 4, PAL.neonRed, 0.22)
  // 头
  s.rect(24, g - 52, 14, 12, PAL.steelDark)
  s.rect(26, g - 50, 10, 6, PAL.void)
  s.px(29, g - 47, PAL.neonCold, 0.7)
  // 垂下的线
  s.thick(16, g - 34, 12, g - 12, 1, PAL.oil)
  s.thick(46, g - 32, 50, g - 14, 1, PAL.oil)
  s.speck(12, g - 50, 44, 44, PAL.rustDark, 0.1, 0.5)
  rubble(s, 2, g, s.w - 4, 5, 0x891)
}

/** 工业控制台：斜面 + 指示灯。 */
function propConsole(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.42)
  s.poly(
    [
      [6, g - 26],
      [s.w - 6, g - 30],
      [s.w - 6, g - 2],
      [6, g - 2],
    ],
    PAL.ash,
  )
  s.poly(
    [
      [10, g - 24],
      [s.w - 10, g - 28],
      [s.w - 10, g - 18],
      [10, g - 14],
    ],
    PAL.steelDark,
  )
  for (let k = 0; k < 5; k++) {
    const x = 14 + k * 10
    s.rect(x, g - 20, 4, 3, k % 2 ? PAL.toxicDark : PAL.steelLight)
    s.px(x + 1, g - 19, k % 2 ? PAL.toxicGlow : PAL.neonWarm, 0.8)
  }
  s.rect(10, g - 12, s.w - 20, 8, PAL.ashPale)
  for (let k = 0; k < 4; k++) s.line(14 + k * 14, g - 10, 14 + k * 14, g - 5, PAL.steelDark)
  s.speck(8, g - 28, s.w - 16, 24, PAL.rustDark, 0.1, 0.45)
  rubble(s, 2, g, s.w - 4, 4, 0x8a1)
}

/** 固定夹具。 */
function propClamp(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 20)
  s.rect(8, g - 12, s.w - 16, 12, PAL.ashPale)
  s.rect(8, g - 12, s.w - 16, 2, PAL.steelLight, 0.5)
  s.rect(14, g - 34, 8, 24, PAL.steelDark)
  s.rect(36, g - 34, 8, 24, PAL.steelDark)
  s.rect(20, g - 34, 18, 6, PAL.steel)
  s.rect(20, g - 34, 18, 2, PAL.rust)
  s.thick(44, g - 30, 50, g - 16, 1.6, PAL.steelLight)

  s.speck(8, g - 34, s.w - 16, 24, PAL.rustDark, 0.12, 0.5)
  rubble(s, 2, g, s.w - 4, 4, 0x8b1)
}

/** 管束。 */
function propPipeBundle(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 26)
  const pipes = [
    [8, g - 22, 12],
    [20, g - 40, 10],
    [34, g - 16, 14],
  ]
  for (let i = 0; i < pipes.length; i++) {
    const [x, y, w] = pipes[i]
    s.rect(x, y, s.w - x - 6, w, PAL.steelDark)
    s.rect(x, y + 2, s.w - x - 6, w - 4, PAL.steel)
    s.rect(x, y + 2, s.w - x - 6, 2, PAL.steelLight, 0.6)
    s.rect(x - 2, y + w - 4, 4, w - 2, PAL.rust)
  }
  s.thick(10, g - 10, s.w - 8, g - 26, 1.2, PAL.rustDark)
  s.speck(8, g - 42, s.w - 16, 36, PAL.rustDark, 0.1, 0.45)
  rubble(s, 2, g, s.w - 4, 4, 0x8c1)
}

/** 太阳能板（斜靠）。 */
function propSolarPanel(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.4)
  s.poly(
    [
      [6, g - 4],
      [16, g - 40],
      [s.w - 10, g - 50],
      [s.w - 2, g - 12],
    ],
    PAL.steelDark,
  )
  const n = 6
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1)
    const x = 16 + t * (s.w - 26)
    const top = g - 40 - t * 10
    s.thick(11 + t * (s.w - 28), g - 7 - t * 5, x, top, 1, PAL.steelBlue)
  }
  s.poly(
    [
      [14, g - 40],
      [s.w - 12, g - 48],
      [s.w - 10, g - 44],
      [16, g - 36],
    ],
    PAL.glass,
    0.5,
  )
  s.line(20, g - 36, 34, g - 32, PAL.white, 0.5)
  s.rect(s.w - 16, g - 14, 4, 14, PAL.steelDark)
  s.speck(8, g - 50, s.w - 16, 44, PAL.rustDark, 0.08, 0.4)
  rubble(s, 2, g, s.w - 4, 4, 0x8d1)
}

/** 机柜：一格格服务器。 */
function propServerRack(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 18)
  s.rect(8, 6, s.w - 16, g - 6, PAL.steelDark)
  s.rect(8, 6, 3, g - 6, PAL.steel)
  s.rect(s.w - 11, 6, 3, g - 6, PAL.steel)
  for (let y = 12; y < g - 12; y += 11) {
    s.rect(13, y, s.w - 26, 8, PAL.ash)
    s.rect(13, y, s.w - 26, 1, PAL.steelLight, 0.4)
    for (let k = 0; k < 3; k++) {
      s.px(17 + k * 5, y + 4, k === 1 ? PAL.neon : PAL.toxicDark, 0.9)
      if (k === 1) s.glow(17 + k * 5, y + 4, 3, PAL.neon, 0.2)
    }
    s.rect(s.w - 22, y + 2, 6, 4, PAL.void)
  }
  s.speck(10, 8, s.w - 20, g - 18, PAL.rustDark, 0.08, 0.4)
  rubble(s, 2, g, s.w - 4, 4, 0x8e1)
}

/** 通信天线：抛物面 + 支架。 */
function propSatelliteDish(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 22)
  s.rect(s.w / 2 - 3, 20, 6, g - 20, PAL.steel)
  s.rect(s.w / 2 - 3, 20, 2, g - 20, PAL.steelLight)
  s.rect(s.w / 2 - 12, g - 8, 24, 8, PAL.ash)
  s.poly(
    [
      [6, g - 44],
      [42, g - 46],
      [50, g - 26],
      [18, g - 18],
    ],
    PAL.steelDark,
  )
  s.poly(
    [
      [9, g - 41],
      [39, g - 43],
      [46, g - 27],
      [19, g - 21],
    ],
    PAL.sand,
    0.55,
  )
  s.line(s.w / 2 - 3, g - 20, 30, g - 36, PAL.steelLight, 0.7)
  s.px(30, g - 36, PAL.neonRed, 0.85)
  s.glow(30, g - 36, 4, PAL.neonRed, 0.2)
  s.speck(8, g - 46, 44, 30, PAL.rustDark, 0.1, 0.45)
  rubble(s, 2, g, s.w - 4, 5, 0x8f1)
}

/** 桥架：钢桁架断面。 */
function propBridgeTruss(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.46)
  s.rect(0, 6, s.w, 5, PAL.steel)
  s.rect(0, g - 10, s.w, 6, PAL.steelDark)
  const n = 7
  for (let k = 0; k < n; k++) {
    const x0 = 4 + (k / n) * (s.w - 8)
    const x1 = 4 + ((k + 1) / n) * (s.w - 8)
    s.thick(x0, 11, x1, g - 11, 1.6, PAL.steelLight, 0.8)
    s.thick(x1, 11, x0, g - 11, 1.2, PAL.steel, 0.8)
  }
  s.speck(2, 8, s.w - 4, g - 18, PAL.rustDark, 0.12, 0.5)
  rubble(s, 2, g, s.w - 4, 5, 0x901)
}

/** 场地灯柱。 */
function propStadiumLight(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 18)
  s.rect(s.w / 2 - 4, 16, 8, g - 16, PAL.steelDark)
  s.rect(s.w / 2 - 4, 16, 3, g - 16, PAL.steelLight, 0.7)
  s.rect(s.w / 2 - 12, g - 10, 24, 10, PAL.ash)
  // 灯架
  s.rect(8, 8, s.w - 16, 12, PAL.steel)
  for (let k = 0; k < 4; k++) {
    const x = 10 + k * ((s.w - 20) / 3.5)
    s.rect(x, 10, 7, 8, PAL.void)
    s.px(x + 3, 13, PAL.neonWarm, 0.85)
    s.glow(x + 3, 14, 6, PAL.neonWarm, 0.16)
  }
  s.line(10, 20, s.w / 2 - 2, 30, PAL.steelLight, 0.5)
  s.line(s.w - 10, 20, s.w / 2 + 2, 30, PAL.steelLight, 0.5)
  s.speck(10, 22, s.w - 20, g - 30, PAL.rustDark, 0.1, 0.45)
  rubble(s, 2, g, s.w - 4, 4, 0x911)
}

/** 培养罐：柱状玻璃罐 + 液面。 */
function propLabTank(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 20)
  s.rect(10, 8, s.w - 20, g - 8, PAL.steelDark)
  s.rect(12, 10, s.w - 24, g - 14, PAL.glass, 0.4)
  // 液面
  s.rect(12, g - 40, s.w - 24, 26, PAL.toxicDark, 0.75)
  s.rect(12, g - 42, s.w - 24, 3, PAL.acid, 0.6)
  // 泡
  const r = mulberry32(0x921)
  for (let k = 0; k < 7; k++) {
    s.disc(16 + r() * (s.w - 32), g - 18 - r() * 20, 1 + r() * 2, PAL.toxicGlow, 0.5)
  }
  // 顶盖与管线
  s.rect(8, 4, s.w - 16, 7, PAL.ashPale)
  s.rect(8, 4, s.w - 16, 2, PAL.steelLight, 0.6)
  s.thick(s.w - 14, 8, s.w - 6, 22, 1.4, PAL.steel)
  s.rect(10, g - 10, s.w - 20, 10, PAL.ash)
  s.speck(12, 12, s.w - 24, g - 24, PAL.rustDark, 0.08, 0.4)
  rubble(s, 2, g, s.w - 4, 4, 0x931)
}

/** 铜钟。 */
function propChurchBell(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 20)
  s.poly(
    [
      [12, g - 4],
      [16, 10],
      [s.w - 16, 10],
      [s.w - 12, g - 4],
    ],
    PAL.ochre,
  )
  s.poly(
    [
      [16, g - 6],
      [20, 14],
      [s.w - 20, 14],
      [s.w - 16, g - 6],
    ],
    PAL.sandDark,
    0.8,
  )
  s.rect(18, g - 6, s.w - 36, 4, PAL.rustDark)
  s.thick(s.w / 2, 10, s.w / 2, 4, 3, PAL.steelDark)
  s.line(20, 16, s.w / 2, g - 22, PAL.rust, 0.6)
  s.line(s.w - 20, 16, s.w / 2, g - 22, PAL.rust, 0.6)
  s.px(s.w / 2, g - 20, PAL.sand, 0.8)
  s.speck(14, 12, s.w - 28, g - 22, PAL.rustDark, 0.1, 0.5)
  rubble(s, 2, g, s.w - 4, 4, 0x941)
}

/** 军用箱。 */
function propMilitaryCrate(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, s.w * 0.42)
  s.rect(4, g - 32, s.w - 8, 32, PAL.mossDead)
  s.rect(4, g - 32, s.w - 8, 3, PAL.weed, 0.6)
  s.rect(4, g - 18, s.w - 8, 2, PAL.black, 0.5)
  s.rect(8, g - 28, 6, 6, PAL.steelDark)
  s.rect(s.w - 16, g - 28, 6, 6, PAL.steelDark)
  for (let k = 0; k < 5; k++) s.rect(10 + k * 12, g - 12, 3, 9, PAL.mossDead, 0.6)
  s.line(8, g - 10, s.w - 8, g - 10, PAL.steelDark, 0.5)
  // 编号漆字
  s.rect(s.w / 2 - 8, g - 26, 16, 2, PAL.paper, 0.5)
  s.rect(s.w / 2 - 5, g - 22, 10, 2, PAL.paper, 0.4)
  s.speck(6, g - 32, s.w - 12, 28, PAL.rustDark, 0.1, 0.45)
  rubble(s, 2, g, s.w - 4, 4, 0x951)
}

/** 异形舱。 */
function propAlienPod(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 22)
  s.ell(s.w / 2, g - 30, 22, 30, PAL.steelDark)
  s.ell(s.w / 2, g - 32, 18, 26, PAL.steelBlue)
  s.ell(s.w / 2, g - 34, 13, 20, PAL.neonCold, 0.35)
  s.ell(s.w / 2, g - 36, 8, 12, PAL.signal, 0.5)
  // 外骨环
  for (let k = 0; k < 4; k++) {
    const y = g - 10 - k * 14
    s.thick(s.w / 2 - 21, y, s.w / 2 + 21, y - 3, 1.2, PAL.steelLight, 0.6)
  }
  s.thick(s.w / 2 - 10, g - 2, s.w / 2 - 16, g - 14, 2, PAL.ashPale)
  s.thick(s.w / 2 + 10, g - 2, s.w / 2 + 16, g - 14, 2, PAL.ashPale)
  s.glow(s.w / 2, g - 34, 18, PAL.neonCold, 0.22)
  s.speck(10, g - 56, s.w - 20, 52, PAL.neonCold, 0.03, 0.25)
  rubble(s, 2, g, s.w - 4, 4, 0x961)
}

/** 料仓。 */
function propFarmSilo(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 20)
  s.rect(12, 8, s.w - 24, g - 8, PAL.steel)
  s.rect(12, 8, s.w - 24, 3, PAL.steelLight, 0.5)
  // 环筋
  for (let y = 20; y < g - 8; y += 14) {
    s.rect(11, y, s.w - 22, 2, PAL.steelDark)
    s.rect(11, y, s.w - 22, 1, PAL.steelLight, 0.3)
  }
  // 撕开的口子
  s.poly(
    [
      [10, g - 44],
      [24, g - 40],
      [18, g - 28],
      [8, g - 32],
    ],
    PAL.void,
  )
  s.ell(16, g - 34, 4, 2, PAL.toxicDark, 0.7)
  // 顶盖
  s.ell(s.w / 2, 8, s.w / 2 - 10, 5, PAL.ashPale)
  s.rect(14, g - 16, s.w - 28, 16, PAL.rustDark, 0.7)
  s.speck(14, 10, s.w - 28, g - 20, PAL.rustDark, 0.1, 0.5)
  rubble(s, 2, g, s.w - 4, 4, 0x971)
}

/** 破旗。 */
function propTornFlag(s) {
  const g = s.h - 1
  ground(s, s.w * 0.5, 12)
  s.rect(s.w / 2 - 2, 6, 4, g - 6, PAL.steelDark)
  s.rect(s.w / 2 - 2, 6, 1.5, g - 6, PAL.steelLight, 0.5)
  s.poly(
    [
      [s.w / 2 + 2, 8],
      [s.w - 6, 12],
      [s.w - 14, 20],
      [s.w - 8, 26],
      [s.w - 18, 34],
      [s.w / 2 + 2, 32],
    ],
    PAL.rustDark,
    0.9,
  )
  s.line(s.w / 2 + 4, 12, s.w - 12, 16, PAL.rust, 0.6)
  s.px(s.w / 2 + 10, 22, PAL.sand, 0.5)
  s.speck(s.w / 2 + 2, 10, s.w / 2 - 8, 22, PAL.rustDark, 0.12, 0.5)
  rubble(s, 2, g, s.w - 4, 4, 0x981)
}

/* ============================================================================
 * 3.10 主题场景件（图书馆 / 学校 / 工厂 / 遗迹 / 监狱 / 旅馆 / 灯塔 / 船坞…）
 * ========================================================================== */

/** 书架（分层隔板 + 参差书脊，留出缺口）。 */
function propLibraryShelf(s) {
  const g = s.h - 1
  ground(s, 50, 42)
  const wood = mix(PAL.rustDark, PAL.dust, 0.45)
  const woodL = mix(wood, PAL.sand, 0.3)
  const woodD = shade(wood, -0.35)
  // 背板 / 侧板
  s.rect(8, 2, 84, g - 2, PAL.rustDeep)
  s.rect(6, 2, 6, g - 2, wood)
  s.rect(88, 2, 6, g - 2, wood)
  s.rect(6, 2, 2, g - 2, woodL)
  s.rect(92, 2, 2, g - 2, woodD)
  // 顶檐 / 踢脚
  s.rect(3, 0, 94, 8, wood)
  s.rect(3, 0, 94, 2, woodL)
  s.rect(3, 6, 94, 2, woodD)
  s.rect(6, g - 8, 88, 8, woodD)
  // 四层隔板
  const shelves = [26, 50, 74, 98]
  for (const y of shelves) {
    s.rect(10, y, 80, 4, wood)
    s.rect(10, y, 80, 1, woodL)
    s.rect(10, y + 3, 80, 1, woodD)
  }
  // 书脊
  const colors = [PAL.rustDark, PAL.steelBlue, PAL.ochre, PAL.mossDead, PAL.bloodDark, PAL.dust, PAL.toxicDark, PAL.sandDark]
  const rnd = mulberry32(0xc01)
  for (let row = 0; row < 4; row++) {
    const bottom = shelves[row] - 1
    const top = row === 0 ? 10 : shelves[row - 1] + 4
    let x = 12
    while (x < 84) {
      if (rnd() < 0.13) {
        x += 4
        continue
      }
      const bw = 3 + Math.floor(rnd() * 3)
      const bh = Math.min(bottom - top - 2, 12 + Math.floor(rnd() * 8))
      const c = colors[Math.floor(rnd() * colors.length)]
      s.rect(x, bottom - bh, bw, bh, c)
      s.rect(x, bottom - bh, bw, 1, shade(c, 0.3))
      s.rect(x, bottom - 2, bw, 1, shade(c, -0.3))
      s.px(x + Math.floor(bw / 2), bottom - Math.floor(bh / 2), mix(c, PAL.paper, 0.5))
      x += bw + 1
    }
  }
  // 倒下的书 / 抽走留下的空位
  s.poly(
    [
      [58, 45],
      [66, 38],
      [69, 40],
      [61, 47],
    ],
    PAL.bloodDark,
  )
  s.rect(44, 30, 3, 20, PAL.paper)
}

/** 课桌（桌面、桌箱、桌腿与横撑）。 */
function propSchoolDesk(s) {
  const g = s.h - 1
  ground(s, 35, 26)
  const wood = mix(PAL.dust, PAL.rustDark, 0.35)
  const woodL = mix(wood, PAL.sand, 0.45)
  const woodD = shade(wood, -0.35)
  // 桌面
  s.rect(6, 22, 58, 6, wood)
  s.rect(6, 22, 58, 2, woodL)
  s.rect(6, 27, 58, 1, woodD)
  // 桌箱 / 抽屉
  s.rect(12, 29, 46, 9, mix(wood, PAL.rustDark, 0.3))
  s.rect(12, 29, 46, 1, woodL)
  s.rect(30, 33, 12, 2, PAL.steelLight)
  // 桌腿 + 横撑
  s.rect(9, 36, 4, g - 36, PAL.steelDark)
  s.rect(57, 36, 4, g - 36, PAL.steelDark)
  s.rect(9, 36, 1, g - 36, PAL.steelLight)
  s.rect(57, 36, 1, g - 36, PAL.steelLight)
  s.rect(11, g - 7, 48, 3, PAL.steelDark)
  // 桌面上的书与刻字
  s.rect(16, 17, 18, 5, PAL.bloodDark)
  s.rect(16, 17, 18, 1, PAL.rust)
  s.rect(17, 19, 16, 1, PAL.paper)
  s.line(40, 24, 52, 24, PAL.rust, 1)
  s.line(46, 26, 54, 26, PAL.rust, 1)
  // 脚垫
  s.rect(7, g - 2, 8, 2, PAL.rustDark)
  s.rect(55, g - 2, 8, 2, PAL.rustDark)
}

/** 黑板（木框、未擦净的粉笔字与粉笔槽）。 */
function propBlackboard(s) {
  const g = s.h - 1
  ground(s, 50, 34)
  const frame = mix(PAL.rustDark, PAL.dust, 0.4)
  const frameL = mix(frame, PAL.sand, 0.35)
  const board = mix(PAL.toxicDark, PAL.ash, 0.45)
  // 支架腿
  s.rect(8, 44, 5, g - 44, frame)
  s.rect(87, 44, 5, g - 44, frame)
  s.rect(8, 44, 1, g - 44, frameL)
  s.rect(6, g - 3, 12, 3, frame)
  s.rect(82, g - 3, 12, 3, frame)
  // 边框 + 板面
  s.rect(3, 4, 94, 38, frame)
  s.rect(3, 4, 94, 2, frameL)
  s.rect(7, 8, 86, 30, board)
  // 没擦净的粉笔字：算式 + 圆
  const chalk = mix(PAL.paper, PAL.ash, 0.3)
  s.line(13, 16, 45, 16, chalk, 1)
  s.line(13, 20, 33, 20, chalk, 1)
  s.line(13, 24, 40, 24, chalk, 1)
  s.ell(68, 20, 12, 8, chalk, 1)
  s.line(56, 31, 74, 31, chalk, 1)
  s.px(24, 28, PAL.white, 1)
  s.rect(48, 12, 2, 6, chalk)
  // 粉笔槽
  s.rect(3, 42, 94, 4, frame)
  s.rect(5, 43, 90, 2, shade(frame, -0.3))
  s.rect(16, 40, 7, 2, PAL.white)
  s.rect(30, 41, 5, 1, PAL.sand)
  // 板擦
  s.rect(68, 38, 13, 4, PAL.ashPale)
  s.rect(68, 38, 13, 1, PAL.steelLight)
}

/** 造纸压辊机（上下滚筒 + 垂下的纸幅）。 */
function propPaperRoller(s) {
  const g = s.h - 1
  ground(s, 55, 42)
  const steel = PAL.steel
  const steelL = PAL.steelLight
  const steelD = PAL.steelDark
  // 侧机架
  for (const x of [8, 94]) {
    s.rect(x, 16, 9, g - 16, steelD)
    s.rect(x, 16, 2, g - 16, steelL)
    s.rect(x - 2, g - 5, 13, 4, steel)
  }
  // 上压辊
  s.rect(14, 14, 82, 26, steel)
  s.rect(14, 14, 82, 3, steelL)
  s.rect(14, 37, 82, 3, steelD)
  s.disc(94, 27, 13, steelD)
  s.disc(94, 27, 10, steel)
  s.disc(94, 27, 3, steelL)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    s.line(94, 27, 94 + Math.cos(a) * 9, 27 + Math.sin(a) * 9, steelD, 1)
  }
  // 下压辊
  s.rect(14, 40, 82, 22, steelD)
  s.rect(14, 40, 82, 2, steelL)
  s.rect(14, 59, 82, 3, PAL.rustDark)
  s.disc(94, 51, 11, steel)
  s.disc(94, 51, 8, steelD)
  s.disc(94, 51, 2, steelL)
  // 纸幅（从辊缝里出来，向下垂）
  s.poly(
    [
      [20, 38],
      [86, 38],
      [92, 54],
      [76, 66],
      [36, 64],
      [22, 50],
    ],
    PAL.paper,
  )
  s.line(24, 44, 86, 44, PAL.sandDark, 1)
  s.line(28, 52, 80, 52, PAL.sandDark, 1)
  // 右侧电机
  s.rect(88, 22, 18, 12, steelD)
  s.rect(88, 22, 2, 12, steelL)
  s.disc(100, 28, 4, PAL.rust)
  // 铆钉
  for (let y = 22; y < g - 8; y += 16) {
    s.px(10, y, steelL)
    s.px(97, y, steelL)
  }
  // 地上纸卷
  s.ell(28, g - 6, 12, 5, PAL.paper)
  s.ell(28, g - 6, 7, 3, PAL.sandDark)
}

/** 考古探方（木桩拉线格 + 出土物）。 */
function propDigGrid(s) {
  const g = s.h - 1
  ground(s, 60, 50)
  // 土台
  s.rect(8, 10, 104, g - 10, PAL.dust)
  s.rect(8, 10, 104, 2, PAL.dustLight)
  // 挖开的探方
  s.rect(14, 15, 92, g - 17, mix(PAL.dust, PAL.rustDeep, 0.35))
  s.rect(14, 15, 92, 2, PAL.sandDark)
  // 木桩
  for (const x of [12, 36, 60, 84, 108]) {
    s.rect(x - 1, 6, 3, 10, PAL.rustDark)
    s.rect(x - 1, 6, 3, 1, PAL.sandDark)
  }
  // 拉线网格
  for (const y of [16, 24, 32]) s.line(12, y, 108, y, PAL.sand, 1)
  for (const x of [12, 36, 60, 84, 108]) s.line(x, 15, x, 32, PAL.sand, 1)
  // 出土物
  s.poly(
    [
      [40, 30],
      [46, 27],
      [50, 31],
      [44, 33],
    ],
    PAL.ochre,
  )
  s.ell(72, 22, 5, 2, PAL.bone)
  s.line(60, 36, 72, 34, PAL.boneDark, 1)
  s.px(84, 28, PAL.bone, 1)
  // 刷子 / 标签牌
  s.rect(94, 24, 3, 8, PAL.rustDark)
  s.rect(93, 30, 5, 3, PAL.sand)
  // 土堆
  s.poly(
    [
      [100, g],
      [112, g - 8],
      [119, g],
    ],
    PAL.sandDark,
  )
}

/** 牢门栅栏（门框、竖栏、横梁与锁盒）。 */
function propPrisonBars(s) {
  const g = s.h - 1
  ground(s, 40, 34)
  const steel = PAL.steel
  const steelL = PAL.steelLight
  const steelD = PAL.steelDark
  // 门框
  for (const x of [3, 71]) {
    s.rect(x, 3, 6, g - 3, steelD)
    s.rect(x, 3, 2, g - 3, steelL)
    s.rect(x - 1, 3, 8, 4, steel)
  }
  // 竖栏
  for (let x = 12; x <= 60; x += 11) {
    s.rect(x, 10, 4, g - 10, steel)
    s.rect(x, 10, 1, g - 10, steelL)
    s.rect(x + 3, 10, 1, g - 10, steelD)
  }
  // 横梁
  for (const y of [14, 50, 84, 100]) {
    s.rect(8, y, 64, 5, steelD)
    s.rect(8, y, 64, 1, steelL)
  }
  // 中缝 + 斜撑
  s.rect(39, 10, 2, g - 10, steelD)
  s.line(40, 19, 70, 82, steel, 1)
  // 锁盒 / 铰链
  s.rect(34, 56, 12, 12, steel)
  s.rect(34, 56, 12, 2, steelL)
  s.rect(38, 60, 3, 4, PAL.void)
  s.px(39, 61, PAL.rust)
  for (const y of [18, 96]) {
    s.rect(69, y, 5, 8, steelL)
    s.px(70, y + 2, steelD)
  }
  // 焊点 / 锈痕
  for (let k = 0; k < 5; k++) rustStreak(s, 16 + k * 11, 12, 12 + k * 3, 0xc06 + k)
}

/** 旅馆前台（柜台 + 房号牌 + 台面铃与登记簿）。 */
function propHotelCounter(s) {
  const g = s.h - 1
  ground(s, 60, 52)
  const wood = mix(PAL.rustDark, PAL.dust, 0.5)
  const woodL = mix(wood, PAL.sand, 0.35)
  const woodD = shade(wood, -0.35)
  // 房号挂牌
  s.rect(8, 2, 46, 24, PAL.rustDark)
  s.rect(8, 2, 46, 2, woodL)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const x = 12 + c * 11
      const y = 7 + r * 10
      s.rect(x, y, 7, 7, PAL.steelDark)
      s.rect(x + 1, y + 1, 5, 5, PAL.paper)
      s.px(x + 3, y + 3, PAL.ink)
      s.px(x + 3, y + 7, PAL.steelLight)
    }
  }
  // 柜台
  s.rect(6, 28, 108, g - 28, wood)
  s.rect(6, 28, 108, 6, mix(wood, PAL.sand, 0.45))
  s.rect(6, 28, 108, 2, woodL)
  s.rect(6, g - 6, 108, 4, woodD)
  for (let x = 14; x < 108; x += 12) s.rect(x, 38, 2, g - 44, woodD)
  // 台面铃 / 登记簿
  s.ell(82, 24, 6, 4, PAL.steelLight)
  s.ell(82, 24, 4, 2, PAL.steelWhite)
  s.rect(81, 19, 3, 5, PAL.steel)
  s.rect(56, 20, 18, 6, PAL.paper)
  s.line(57, 22, 72, 22, PAL.ink, 1)
  s.line(57, 24, 68, 24, PAL.ink, 1)
  // 台前告示
  s.rect(24, 46, 16, 8, PAL.paper)
  s.rect(26, 49, 12, 2, PAL.ink)
  s.rect(26, 52, 8, 1, PAL.ink)
}

/** 自动售货机（灯箱、玻璃货道与取物口）。 */
function propVendingMachine(s) {
  const g = s.h - 1
  ground(s, 25, 18)
  const body = mix(PAL.steelBlue, PAL.steelDark, 0.35)
  const bodyL = mix(body, PAL.steelLight, 0.5)
  const bodyD = shade(body, -0.3)
  // 柜体
  s.rect(4, 4, 42, g - 4, body)
  s.rect(4, 4, 42, 3, bodyL)
  s.rect(4, 4, 2, g - 4, bodyL)
  s.rect(44, 4, 2, g - 4, bodyD)
  s.rect(6, g - 6, 38, 6, bodyD)
  // 灯箱
  s.rect(6, 7, 38, 8, mix(PAL.danger, PAL.rustDark, 0.25))
  s.rect(8, 9, 34, 4, PAL.warn)
  s.rect(10, 10, 8, 2, PAL.paper)
  // 玻璃货道
  s.rect(7, 18, 36, 44, bodyD)
  s.rect(9, 20, 32, 40, mix(PAL.steelBlue, PAL.ash, 0.5))
  const cans = [PAL.sand, PAL.toxicDark, PAL.rust, PAL.neonCold, PAL.ochre, PAL.bloodDark]
  for (let row = 0; row < 3; row++) {
    const y = 26 + row * 12
    s.rect(10, y + 8, 30, 1, bodyL)
    for (let c = 0; c < 5; c++) {
      const x = 11 + c * 6
      const c2 = cans[(row * 3 + c) % cans.length]
      s.rect(x, y, 4, 7, c2)
      s.rect(x, y, 4, 1, shade(c2, 0.3))
      s.px(x + 1, y + 2, PAL.paper)
    }
  }
  // 硬币口 / 取物口
  s.rect(37, 20, 4, 14, PAL.steelDark)
  s.rect(38, 22, 2, 8, PAL.void)
  s.rect(10, 66, 30, 14, PAL.ash)
  s.rect(12, 68, 26, 10, PAL.oil)
  s.rect(14, 68, 22, 2, PAL.steelLight)
  // 支脚
  s.rect(6, g - 2, 8, 2, PAL.steelDark)
  s.rect(36, g - 2, 8, 2, PAL.steelDark)
  s.glow(25, 11, 12, PAL.warn, 0.5)
}

/** 灯塔灯组（菲涅尔透镜 + 转动光束）。 */
function propBeaconLamp(s) {
  const g = s.h - 1
  ground(s, 20, 14)
  // 底座与立柱
  s.rect(7, g - 18, 26, 18, PAL.ochre)
  s.rect(7, g - 18, 26, 2, PAL.sand)
  s.rect(5, g - 5, 30, 4, PAL.rustDark)
  s.rect(18, 40, 4, 8, PAL.rustDark)
  // 菲涅尔透镜
  s.ell(20, 26, 14, 15, PAL.steelDark)
  s.ell(20, 26, 12, 13, PAL.glass)
  s.ell(20, 26, 10, 11, PAL.neonWarm)
  for (let k = 0; k < 4; k++) {
    s.ell(20, 26, 12 - k * 2, 13 - k * 3, k % 2 ? PAL.sandDark : PAL.sand, 1)
  }
  s.rect(18, 20, 4, 12, PAL.white)
  s.glow(20, 26, 18, PAL.neonWarm, 1)
  // 顶盖 / 通风帽
  s.poly(
    [
      [6, 12],
      [34, 12],
      [29, 3],
      [11, 3],
    ],
    PAL.steelDark,
  )
  s.rect(8, 10, 24, 3, PAL.steel)
  s.rect(16, 0, 8, 3, PAL.steelDark)
  // 旋转光束
  s.line(33, 26, 39, 14, PAL.neonWarm, 1)
  s.line(33, 26, 39, 38, PAL.neonWarm, 1)
  s.line(34, 26, 38, 20, PAL.white, 1)
  s.glow(36, 26, 10, PAL.neonWarm, 0.6)
}

/** 船体龙骨（龙骨、艏艉柱与肋骨状船架）。 */
function propShipFrame(s) {
  const g = s.h - 1
  ground(s, 90, 78)
  const steel = mix(PAL.steel, PAL.rustDark, 0.35)
  const steelL = mix(steel, PAL.sand, 0.35)
  const steelD = shade(steel, -0.35)
  // 龙骨
  s.thick(8, g - 6, 166, g - 16, 4, steelD)
  s.thick(8, g - 6, 166, g - 16, 2.4, steel)
  s.line(8, g - 8, 166, g - 18, steelL, 1)
  // 艏柱 / 艉柱
  s.thick(166, g - 18, 174, 8, 4, steelD)
  s.thick(166, g - 18, 174, 8, 2.2, steel)
  s.thick(8, g - 6, 6, 18, 3, steelD)
  // 肋骨
  for (let i = 0; i < 8; i++) {
    const x = 26 + i * 19
    const ky = g - 6 - i * 1.3
    s.thick(x, ky, x - 5, ky - 28, 2.2, steelD)
    s.thick(x - 5, ky - 28, x - 12, ky - 52, 2.2, steelD)
    s.thick(x - 12, ky - 52, x - 6, ky - 70, 2.2, steel)
    s.line(x - 1, ky, x - 12, ky - 52, steelL, 1)
  }
  // 纵向纵骨 / 脚手架
  for (const y of [30, 46]) s.line(20, y, 160, y - 14, steel, 1)
  for (let i = 0; i < 5; i++) s.rect(30 + i * 30, 58, 14, 3, PAL.dust)
  // 铆钉
  for (let x = 18; x < 160; x += 14) s.px(x, g - 12 - Math.floor((x - 18) * 0.06), steelL)
}

/** 船坞闸门（桁架、加劲肋与底部止水条）。 */
function propDrydockGate(s) {
  const g = s.h - 1
  ground(s, 60, 56)
  const steel = PAL.steelBlue
  const steelL = PAL.steelLight
  const steelD = PAL.steelDark
  // 闸体
  s.rect(8, 4, 104, g - 4, steel)
  s.rect(8, 4, 104, 4, steelL)
  s.rect(8, 4, 3, g - 4, steelL)
  s.rect(109, 4, 3, g - 4, steelD)
  // 横向主梁
  for (const y of [10, 38, 66, 94, 120]) {
    s.rect(8, y, 104, 7, steelD)
    s.rect(8, y, 104, 2, steelL)
  }
  // 竖向加劲肋
  for (let x = 18; x < 108; x += 15) {
    s.rect(x, 14, 4, g - 18, steelD)
    s.rect(x, 14, 1, g - 18, steelL)
  }
  // 桁架斜撑
  for (let i = 0; i < 4; i++) {
    const x0 = 20 + i * 22
    s.line(x0, 17, x0 + 20, 36, steelL, 1)
    s.line(x0 + 20, 17, x0, 36, steelD, 1)
    s.line(x0, 45, x0 + 20, 64, steelL, 1)
    s.line(x0 + 20, 45, x0, 64, steelD, 1)
  }
  // 水线污痕
  s.rect(8, 100, 104, 22, mix(steel, PAL.toxicDark, 0.35))
  s.rect(8, 100, 104, 2, PAL.toxicDark)
  // 止水条
  s.rect(8, g - 8, 104, 8, PAL.oil)
  s.rect(10, g - 8, 100, 2, PAL.ashPale)
  for (let x = 16; x < 108; x += 14) s.px(x, g - 4, steelL)
  // 警示斜条
  for (let x = 32; x < 72; x += 8) {
    s.poly(
      [
        [x, 24],
        [x + 5, 24],
        [x, 32],
        [x - 5, 32],
      ],
      PAL.warn,
    )
  }
  // 铆钉
  for (let y = 18; y < 96; y += 18) for (let x = 12; x < 108; x += 22) s.px(x, y, steelL)
}

/** 变压器（散热片 + 瓷瓶 + 警示牌）。 */
function propTransformer(s) {
  const g = s.h - 1
  ground(s, 30, 22)
  const steel = PAL.steel
  const steelL = PAL.steelLight
  const steelD = PAL.steelDark
  // 底座
  s.rect(8, g - 8, 44, 8, steelD)
  s.rect(8, g - 8, 44, 2, steelL)
  // 散热片
  for (const x of [2, 5, 8, 51, 54, 57]) {
    s.rect(x, 26, 3, 44, steelD)
    s.rect(x, 26, 1, 44, steelL)
  }
  // 油箱
  s.rect(13, 22, 34, g - 30, steel)
  s.rect(13, 22, 34, 3, steelL)
  s.rect(13, 22, 2, g - 30, steelL)
  s.rect(45, 22, 2, g - 30, steelD)
  // 顶盖
  s.rect(10, 17, 40, 6, steelD)
  s.rect(10, 17, 40, 2, steelL)
  // 瓷瓶
  for (const cx of [19, 30, 41]) {
    s.rect(cx - 2, 4, 5, 13, PAL.boneDark)
    for (let k = 0; k < 4; k++) s.rect(cx - 3, 6 + k * 3, 7, 2, PAL.sandDark)
    s.rect(cx - 1, 2, 3, 3, steelL)
    s.line(cx, 2, cx + 8, 0, steelD, 1)
  }
  // 铭牌 / 警示
  s.rect(19, 46, 18, 12, PAL.warn)
  s.rect(21, 49, 14, 2, PAL.ink)
  s.rect(21, 53, 10, 2, PAL.ink)
  // 接地线
  s.line(8, 70, 2, g - 2, PAL.steelDark, 1)
  s.line(52, 70, 58, g - 2, PAL.steelDark, 1)
  s.rect(2, g - 3, 5, 2, steelD)
}

/** 矿车（车轮、轨道、车斗与煤堆）。 */
function propCoalCart(s) {
  const g = s.h - 1
  ground(s, 40, 30)
  const steel = PAL.steel
  const steelL = PAL.steelLight
  const steelD = PAL.steelDark
  // 轨道 + 枕木
  s.rect(6, g - 5, 68, 3, steelD)
  s.rect(6, g - 5, 68, 1, steelL)
  for (let x = 8; x < 72; x += 12) s.rect(x, g - 2, 7, 2, PAL.rustDark)
  // 车轮
  for (const cx of [26, 56]) {
    s.disc(cx, g - 13, 9, PAL.oil)
    s.disc(cx, g - 13, 7, steelD)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4
      s.line(cx, g - 13, cx + Math.cos(a) * 6, g - 13 + Math.sin(a) * 6, steelL, 1)
    }
    s.disc(cx, g - 13, 2, steelL)
  }
  // 车斗
  s.poly(
    [
      [8, g - 21],
      [70, g - 21],
      [64, g - 40],
      [16, g - 40],
    ],
    steel,
  )
  s.poly(
    [
      [12, g - 23],
      [66, g - 23],
      [61, g - 37],
      [19, g - 37],
    ],
    steelD,
  )
  for (let i = 0; i < 5; i++) s.rect(18 + i * 10, g - 37, 2, 14, steel)
  s.rect(8, g - 21, 62, 2, steelL)
  // 把手
  s.line(8, g - 30, 2, g - 34, steelL, 1)
  // 煤堆
  s.ell(40, g - 39, 22, 5, PAL.oil)
  for (let k = 0; k < 9; k++) {
    const x = 22 + k * 4
    s.ell(x, g - 40 - (k % 3), 3, 2, k % 2 ? PAL.ash : PAL.oil)
    s.px(x, g - 42 - (k % 2), PAL.ashPale)
  }
}

/** 反应堆核心（外筒、观察窗与冷光燃料棒）。 */
function propReactorCore(s) {
  const g = s.h - 1
  ground(s, 35, 26)
  const steel = PAL.steel
  const steelL = PAL.steelLight
  const steelD = PAL.steelDark
  // 基座
  s.rect(6, g - 14, 58, 14, steelD)
  s.rect(6, g - 14, 58, 2, steelL)
  s.rect(2, g - 6, 66, 6, PAL.ash)
  // 外筒
  s.rect(14, 10, 42, g - 24, steel)
  s.rect(14, 10, 42, 3, steelL)
  s.rect(14, 10, 2, g - 24, steelL)
  s.rect(54, 10, 2, g - 24, steelD)
  // 环箍
  for (let y = 22; y < g - 18; y += 16) {
    s.rect(12, y, 46, 4, steelD)
    s.rect(12, y, 46, 1, steelL)
  }
  // 观察窗 + 燃料棒
  s.rect(21, 27, 28, 48, steelD)
  s.rect(23, 29, 24, 44, mix(PAL.steelBlue, PAL.toxicDark, 0.45))
  for (const x of [26, 30, 34, 38, 42]) {
    s.rect(x, 32, 2, 38, PAL.neonCold)
    s.rect(x, 32, 1, 38, PAL.signal)
    s.px(x, 36, PAL.white)
  }
  s.glow(35, 50, 26, PAL.neonCold, 1)
  s.glow(35, 50, 12, PAL.signal, 0.8)
  // 顶盖 / 管道
  s.rect(11, 4, 48, 8, steelD)
  s.rect(11, 4, 48, 2, steelL)
  s.thick(20, 5, 14, 0, 2, steel)
  s.thick(50, 5, 56, 0, 2, steel)
  // 警示条
  for (let x = 18; x < 52; x += 8) {
    s.poly(
      [
        [x, g - 12],
        [x + 4, g - 12],
        [x, g - 7],
        [x - 4, g - 7],
      ],
      PAL.warn,
    )
  }
}

/** 弹药箱堆（箱扣、编号与垂下的弹带）。 */
function propAmmoStack(s) {
  const g = s.h - 1
  ground(s, 30, 24)
  const olive = PAL.mossDead
  const oliveL = mix(olive, PAL.weed, 0.5)
  const oliveD = shade(olive, -0.4)
  // 底层两只箱
  for (const x of [5, 31]) {
    s.rect(x, g - 20, 24, 20, olive)
    s.rect(x, g - 20, 24, 2, oliveL)
    s.rect(x, g - 3, 24, 2, oliveD)
    s.rect(x + 3, g - 17, 5, 6, PAL.steelDark)
    s.rect(x + 16, g - 17, 5, 6, PAL.steelDark)
    s.rect(x + 6, g - 12, 12, 2, PAL.paper)
  }
  // 上层箱
  s.rect(14, g - 36, 30, 16, olive)
  s.rect(14, g - 36, 30, 2, oliveL)
  s.rect(14, g - 22, 30, 2, oliveD)
  s.rect(20, g - 33, 6, 6, PAL.steelLight)
  s.rect(34, g - 33, 6, 6, PAL.steelLight)
  s.rect(22, g - 26, 16, 3, PAL.paper)
  // 弹带从箱缝垂下
  for (let k = 0; k < 7; k++) {
    const x = 40 + k * 2
    const y = g - 24 + k * 3
    s.rect(x, y, 4, 3, PAL.ochre)
    s.rect(x, y, 4, 1, PAL.sand)
  }
  s.rect(44, g - 6, 4, 4, PAL.sandDark)
}

/** 朋克音箱堆（大喇叭、喇叭网与控制旋钮）。 */
function propPunkAmp(s) {
  const g = s.h - 1
  ground(s, 30, 24)
  const cab = mix(PAL.steelDark, PAL.ashPale, 0.25)
  const cabL = mix(cab, PAL.steelLight, 0.6)
  const cabD = shade(cab, -0.35)
  // 下箱体
  s.rect(5, 32, 50, g - 32, cab)
  s.rect(5, 32, 50, 3, cabL)
  s.rect(5, 32, 2, g - 32, cabL)
  s.rect(53, 32, 2, g - 32, cabD)
  // 大喇叭
  s.disc(30, 50, 15, cabL)
  s.disc(30, 50, 13, PAL.oil)
  s.disc(30, 50, 5, cab)
  s.disc(30, 50, 2, cabL)
  for (let y = 39; y < 62; y += 4) s.rect(18, y, 24, 1, cabL)
  for (let x = 20; x < 42; x += 5) s.rect(x, 38, 1, 24, cabD)
  // 上箱体（箱头）
  s.rect(7, 4, 46, 26, cab)
  s.rect(7, 4, 46, 2, cabL)
  s.rect(7, 4, 2, 26, cabL)
  s.rect(51, 4, 2, 26, cabD)
  // 小喇叭
  s.disc(19, 18, 8, cabL)
  s.disc(19, 18, 6, PAL.oil)
  s.disc(19, 18, 2, cabL)
  // 旋钮 / 推子
  for (let k = 0; k < 4; k++) {
    s.disc(32 + k * 5, 13, 2, PAL.steelLight)
    s.px(32 + k * 5, 12, PAL.white)
  }
  s.rect(30, 21, 20, 2, PAL.steelDark)
  // 霓虹贴纸 / 接线
  s.rect(39, 24, 11, 4, PAL.neon)
  s.line(51, 26, 58, 34, PAL.oilSheen, 1)
  s.line(51, 26, 58, 42, PAL.oilSheen, 1)
}

/** 暗影帷幕（挂杆、褶皱与流苏）。 */
function propShadowVeil(s) {
  const g = s.h - 1
  ground(s, 45, 34)
  const cloth = mix(PAL.steelBlue, PAL.bloodDark, 0.35)
  const clothL = mix(cloth, PAL.neonCold, 0.16)
  const clothD = mix(cloth, PAL.void, 0.32)
  // 挂杆
  s.rect(5, 6, 80, 4, PAL.steelDark)
  s.rect(5, 6, 80, 1, PAL.steelLight)
  s.rect(9, 0, 4, 7, PAL.steelDark)
  s.rect(77, 0, 4, 7, PAL.steelDark)
  // 帷幕
  s.poly(
    [
      [10, 10],
      [80, 10],
      [84, g - 12],
      [76, g - 2],
      [60, g - 8],
      [45, g],
      [30, g - 6],
      [16, g - 2],
      [6, g - 12],
    ],
    cloth,
  )
  // 褶皱
  for (let x = 16; x <= 76; x += 8) {
    s.line(x, 12, x + (x % 16 === 0 ? 3 : -3), g - 6, clothL, 1)
    s.line(x + 2, 14, x + 2 + (x % 16 === 0 ? 2 : -2), g - 10, clothD, 1)
  }
  // 流苏
  for (let x = 8; x <= 82; x += 4) {
    const len = 5 + ((x * 7) % 6)
    s.line(x, g - 12, x, g - 12 + len, clothD, 1)
    s.px(x, g - 12 + len, clothL)
  }
  // 破口
  s.poly(
    [
      [34, 40],
      [40, 44],
      [37, 58],
      [31, 52],
    ],
    clothD,
  )
  s.poly(
    [
      [58, 70],
      [64, 74],
      [60, 88],
      [55, 82],
    ],
    clothD,
  )
  s.glow(45, 40, 26, PAL.neonCold, 0.25)
}

/** 混乱王座（歪斜靠背、尖刺与混沌印记）。 */
function propChaosThrone(s) {
  const g = s.h - 1
  ground(s, 35, 28)
  const metal = mix(PAL.steelDark, PAL.rustDark, 0.35)
  const metalL = mix(metal, PAL.steelLight, 0.55)
  const metalD = shade(metal, -0.35)
  // 台座
  s.rect(8, g - 8, 54, 8, metalD)
  s.rect(8, g - 8, 54, 2, metalL)
  // 王座主体
  s.rect(16, 38, 38, 26, metal)
  s.rect(16, 38, 38, 2, metalL)
  // 座垫
  s.rect(18, 34, 34, 6, PAL.bloodDark)
  s.rect(18, 34, 34, 1, PAL.rust)
  // 歪斜靠背
  s.poly(
    [
      [22, 40],
      [25, 8],
      [43, 3],
      [50, 36],
    ],
    metal,
  )
  s.poly(
    [
      [27, 34],
      [29, 12],
      [42, 8],
      [46, 33],
    ],
    metalD,
  )
  // 尖刺
  for (let k = 0; k < 5; k++) {
    const x = 23 + k * 6
    s.poly(
      [
        [x, 10],
        [x + 3, 0],
        [x + 6, 10],
      ],
      metalL,
    )
  }
  // 扶手
  s.rect(8, 42, 9, 6, metal)
  s.rect(53, 42, 9, 6, metal)
  s.rect(11, 46, 4, 12, metalD)
  s.rect(55, 46, 4, 12, metalD)
  // 椅腿（一条歪）
  s.rect(19, 62, 6, 14, metalD)
  s.poly(
    [
      [44, 64],
      [51, 64],
      [54, 78],
      [47, 78],
    ],
    metalD,
  )
  // 混沌印记
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU
    s.line(35, 22, 35 + Math.cos(a) * 9, 22 + Math.sin(a) * 9, PAL.rust, 1)
  }
  s.disc(35, 22, 3, PAL.rustDeep)
  s.px(34, 21, PAL.rustLight)
}

/** 棺木（六角棺身 + 反钉十字）。 */
function propCoffin(s) {
  const g = s.h - 1
  ground(s, 35, 28)
  const wood = mix(PAL.rustDark, PAL.dust, 0.55)
  const woodL = mix(wood, PAL.sand, 0.35)
  const woodD = shade(wood, -0.4)
  // 棺座
  s.rect(10, g - 5, 48, 4, woodD)
  // 六角棺身
  s.poly(
    [
      [12, g - 8],
      [16, 18],
      [25, 8],
      [45, 8],
      [54, 18],
      [58, g - 8],
    ],
    wood,
  )
  s.poly(
    [
      [16, g - 10],
      [20, 20],
      [28, 12],
      [42, 12],
      [50, 20],
      [53, g - 10],
    ],
    mix(wood, PAL.dust, 0.2),
  )
  // 十字
  s.rect(33, 15, 3, 20, woodD)
  s.rect(26, 21, 17, 3, woodD)
  s.px(34, 16, PAL.steelLight)
  s.px(27, 22, PAL.steelLight)
  // 边缘高光 / 暗部
  s.line(16, 18, 25, 8, woodL, 1)
  s.line(25, 8, 45, 8, woodL, 1)
  s.line(12, g - 8, 16, 18, woodD, 1)
  s.line(54, 18, 58, g - 8, woodD, 1)
  // 钉扣
  for (const [x, y] of [
    [18, g - 12],
    [50, g - 12],
    [22, 22],
    [46, 22],
  ]) {
    s.rect(x, y, 2, 2, PAL.steelLight)
    s.px(x + 1, y + 1, PAL.steelDark)
  }
}

/* ============================================================================
 * 3.11 彩蛋：银幕 / 科幻
 * ========================================================================== */

/** T-800：被液压机压住的金属骨架，胸腔红灯。 */
function propT800Endoskeleton(s) {
  const g = s.h - 1
  ground(s, 45, 36)
  const chrome = PAL.steelWhite
  const chromeM = PAL.steelLight
  const chromeD = PAL.steelDark
  // 液压机机架
  s.rect(5, 3, 9, g - 3, chromeD)
  s.rect(5, 3, 3, g - 3, chromeM)
  s.rect(76, 3, 9, g - 3, chromeD)
  s.rect(76, 3, 3, g - 3, chromeM)
  s.rect(4, 3, 82, 9, PAL.steel)
  s.rect(4, 3, 82, 2, chrome)
  s.rect(4, g - 6, 14, 6, chromeD)
  s.rect(72, g - 6, 14, 6, chromeD)
  // 活塞 / 压头
  s.rect(40, 11, 7, 12, chromeM)
  s.rect(28, 22, 32, 8, chromeD)
  s.rect(28, 22, 32, 2, chrome)
  s.rect(44, 30, 4, 14, chromeM)
  // 骨盆 / 脊柱
  s.thick(28, g - 12, 62, g - 15, 2.4, chromeD)
  s.thick(28, g - 12, 62, g - 15, 1.2, chrome)
  for (const x of [32, 40, 48, 56]) s.rect(x, g - 17, 3, 6, chromeM)
  // 肋骨
  for (let k = 0; k < 4; k++) {
    const y = g - 26 - k * 5
    s.line(38, y + 4, 56, y, chromeM, 1)
    s.line(38, y + 3, 56, y - 1, chrome, 1)
  }
  // 骷髅（朝右）
  s.ell(66, g - 20, 7, 6, chromeD)
  s.ell(66, g - 20, 5.6, 4.8, chrome)
  s.rect(64, g - 23, 2, 2, PAL.oil)
  s.rect(69, g - 23, 2, 2, PAL.oil)
  s.rect(66, g - 17, 6, 2, chromeM)
  for (let k = 0; k < 3; k++) s.px(66 + k * 2, g - 17, chrome)
  // 手臂（伸向画外）
  s.thick(56, g - 20, 74, g - 12, 1.6, chromeM)
  s.thick(74, g - 12, 86, g - 14, 1.4, chrome)
  // 胸腔红灯
  s.rect(45, g - 28, 6, 4, PAL.bloodDark)
  s.rect(46, g - 27, 4, 2, PAL.neonRed)
  s.glow(48, g - 26, 12, PAL.neonRed, 0.9)
  // 液压油渍
  s.thick(30, g - 4, 36, g - 2, 1.2, PAL.oil)
}

/** 德罗宁：楔形银灰跑车、鸥翼门与车尾蓝色时间电路。 */
function propDelorean(s) {
  const g = s.h - 1
  ground(s, 65, 52)
  const silver = mix(PAL.steelWhite, PAL.steelLight, 0.45)
  const silverL = mix(silver, PAL.white, 0.25)
  const silverD = mix(silver, PAL.steelDark, 0.35)
  // 车轮
  for (const cx of [30, 102]) {
    s.disc(cx, g - 12, 11, PAL.oil)
    s.disc(cx, g - 12, 8, PAL.steelDark)
    s.disc(cx, g - 12, 4, PAL.steelLight)
    s.disc(cx, g - 12, 2, PAL.steelWhite)
  }
  // 车身楔形
  s.poly(
    [
      [10, g - 12],
      [20, 27],
      [48, 22],
      [82, 22],
      [98, 28],
      [120, 38],
      [118, g - 12],
    ],
    silver,
  )
  s.poly(
    [
      [14, g - 16],
      [24, 31],
      [50, 26],
      [80, 26],
      [96, 31],
      [114, 40],
      [112, g - 16],
    ],
    silverD,
  )
  // 前脸 / 侧裙
  s.rect(10, g - 14, 108, 5, silverD)
  s.rect(96, 32, 20, 5, silverD)
  // 车窗
  s.poly(
    [
      [42, 30],
      [48, 24],
      [64, 24],
      [64, 30],
    ],
    PAL.glass,
  )
  s.poly(
    [
      [66, 30],
      [66, 24],
      [80, 24],
      [86, 30],
    ],
    PAL.glass,
  )
  // 鸥翼门（向上开）
  s.poly(
    [
      [50, 22],
      [56, 4],
      [76, 6],
      [76, 22],
    ],
    silver,
  )
  s.poly(
    [
      [54, 21],
      [58, 8],
      [72, 10],
      [72, 21],
    ],
    PAL.glass,
  )
  s.rect(50, 20, 26, 2, silverL)
  // 车尾时间电路（铜线圈 + 蓝光）
  s.rect(104, 30, 12, 10, PAL.steelDark)
  s.ell(110, 35, 6, 5, PAL.ochre)
  s.ell(110, 35, 3, 2, PAL.neonCold)
  s.rect(104, 40, 12, 3, PAL.steelLight)
  s.glow(110, 34, 16, PAL.neonCold, 0.9)
  // 车灯 / 散热格栅
  s.rect(14, 33, 6, 4, PAL.neonWarm)
  s.glow(16, 35, 8, PAL.neonWarm, 0.5)
  for (let k = 0; k < 4; k++) s.rect(100, 42 + k * 2, 14, 1, PAL.steelDark)
}

/** 行星发动机：巨型喷口与冰蓝等离子光柱。 */
function propEarthEngine(s) {
  const g = s.h - 1
  ground(s, 60, 56)
  const steel = PAL.steel
  const steelL = PAL.steelLight
  const steelD = PAL.steelDark
  // 基座
  s.rect(4, 122, 112, 17, PAL.ash)
  s.rect(4, 122, 112, 2, steelL)
  s.rect(8, 104, 104, 20, steelD)
  s.rect(8, 104, 104, 3, steelL)
  // 喷口钟形
  s.poly(
    [
      [30, 56],
      [90, 56],
      [106, 106],
      [14, 106],
    ],
    steel,
  )
  s.poly(
    [
      [34, 60],
      [86, 60],
      [98, 104],
      [22, 104],
    ],
    steelD,
  )
  s.rect(14, 102, 92, 5, steelL)
  // 机体上部收窄
  s.poly(
    [
      [40, 28],
      [80, 28],
      [90, 58],
      [30, 58],
    ],
    steel,
  )
  s.rect(40, 24, 40, 6, steelD)
  s.rect(40, 24, 40, 2, steelL)
  // 环肋
  for (const y of [50, 66, 82]) {
    s.rect(20 + (y - 50) / 4, y, 80 - (y - 50) / 2, 3, steelL)
  }
  // 等离子光柱
  s.poly(
    [
      [48, 28],
      [72, 28],
      [76, 0],
      [44, 0],
    ],
    mix(PAL.neonCold, PAL.signal, 0.5),
  )
  s.rect(54, 0, 12, 28, PAL.white)
  s.glow(60, 20, 44, PAL.neonCold, 1)
  s.glow(60, 20, 18, PAL.signal, 0.9)
  // 支架
  s.rect(4, 100, 12, 24, steelD)
  s.rect(104, 100, 12, 24, steelD)
  s.rect(2, 118, 116, 5, steelD)
  // 警示条
  for (let x = 18; x < 104; x += 12) {
    s.poly(
      [
        [x, 110],
        [x + 6, 110],
        [x, 118],
        [x - 6, 118],
      ],
      PAL.warn,
    )
  }
}

/** 红色电话亭：玻璃上的绿色字符雨与红蓝两颗药丸。 */
function propMatrixPhonebooth(s) {
  const g = s.h - 1
  ground(s, 25, 18)
  const red = mix(PAL.danger, PAL.bloodDark, 0.3)
  const redL = mix(red, PAL.warn, 0.4)
  const redD = mix(red, PAL.rustDeep, 0.45)
  // 顶灯 / 顶牌
  s.rect(9, 0, 32, 7, PAL.steelDark)
  s.rect(13, 2, 24, 3, PAL.paper)
  s.rect(5, 7, 40, 8, redD)
  s.rect(5, 7, 40, 1, redL)
  s.rect(9, 9, 32, 4, PAL.paper)
  s.px(12, 11, PAL.ink)
  s.px(18, 11, PAL.ink)
  s.px(26, 11, PAL.ink)
  s.px(34, 11, PAL.ink)
  // 亭身
  s.rect(5, 15, 40, g - 15, redD)
  s.rect(7, 15, 36, g - 15, red)
  s.rect(7, 15, 2, g - 15, redL)
  s.rect(41, 15, 2, g - 15, redD)
  // 玻璃
  s.rect(9, 22, 32, 54, PAL.steelDark)
  s.rect(11, 24, 28, 50, mix(PAL.steelBlue, PAL.ash, 0.45))
  s.line(25, 24, 25, 74, PAL.steelDark, 1)
  s.line(11, 48, 39, 48, PAL.steelDark, 1)
  // 绿色字符雨
  for (let x = 13; x < 38; x += 4) {
    const len = 4 + ((x * 5) % 9)
    for (let k = 0; k < len; k++) s.px(x, 26 + k * 2, PAL.toxicGlow)
    s.px(x + 1, 26 + len * 2, PAL.acid)
  }
  // 听筒（悬在半空）
  s.rect(28, 32, 10, 4, PAL.oil)
  s.rect(27, 30, 3, 8, PAL.oil)
  for (let k = 0; k < 5; k++) s.px(33 + (k % 2), 38 + k * 3, PAL.oilSheen)
  // 红色 / 蓝色药丸
  s.rect(14, 60, 5, 3, PAL.neonRed)
  s.rect(14, 60, 5, 1, PAL.warn)
  s.rect(21, 60, 5, 3, PAL.neonCold)
  s.rect(21, 60, 5, 1, PAL.signal)
  // 门把手 / 底部
  s.rect(39, 52, 2, 9, PAL.steelLight)
  s.rect(5, g - 6, 40, 6, redD)
  s.rect(7, g - 4, 36, 2, PAL.steelDark)
  s.glow(25, 12, 12, PAL.toxicGlow, 0.25)
}

const DEFS = {
  skeleton_human: { w: 90, h: 44, fn: propSkeletonHuman, seed: 0x11 },
  skeleton_animal: { w: 70, h: 34, fn: propSkeletonAnimal, seed: 0x12 },
  corpse: { w: 80, h: 36, fn: propCorpse, seed: 0x13 },
  skull: { w: 20, h: 18, fn: propSkull, seed: 0x14 },
  ribcage: { w: 56, h: 30, fn: propRibcage, seed: 0x15 },
  car_wreck: { w: 120, h: 52, fn: propCarWreck, seed: 0x16 },
  bus_wreck: { w: 200, h: 70, fn: propBusWreck, seed: 0x17 },
  building_facade: { w: 160, h: 220, fn: propBuildingFacade, seed: 0x18 },
  house_facade: { w: 140, h: 120, fn: propHouseFacade, seed: 0x19 },
  factory_pipe: { w: 48, h: 160, fn: propFactoryPipe, seed: 0x1a },
  barrel: { w: 28, h: 40, fn: propBarrel, seed: 0x1b },
  crate: { w: 40, h: 34, fn: propCrate, seed: 0x1c },
  tire_pile: { w: 56, h: 44, fn: propTirePile, seed: 0x1d },
  fence: { w: 64, h: 40, fn: propFence, seed: 0x1e },
  streetlight: { w: 24, h: 120, fn: propStreetlight, seed: 0x1f },
  tv: { w: 36, h: 28, fn: propTv, seed: 0x20 },
  sofa: { w: 64, h: 30, fn: propSofa, seed: 0x21 },
  wardrobe: { w: 48, h: 80, fn: propWardrobe, seed: 0x22 },
  cradle: { w: 40, h: 30, fn: propCradle, seed: 0x23 },
  grave: { w: 28, h: 26, fn: propGrave, seed: 0x24 },
  cage: { w: 64, h: 56, fn: propCage, seed: 0x25 },
  workbench: { w: 72, h: 36, fn: propWorkbench, seed: 0x26 },
  terminal: { w: 44, h: 50, fn: propTerminal, seed: 0x27 },
  generator: { w: 64, h: 46, fn: propGenerator, seed: 0x28 },
  relay: { w: 40, h: 90, fn: propRelay, seed: 0x29 },
  antenna: { w: 30, h: 150, fn: propAntenna, seed: 0x2a },
  satellite: { w: 60, h: 40, fn: propSatellite, seed: 0x2b },
  campfire: { w: 36, h: 26, fn: propCampfire, seed: 0x2c },
  tent: { w: 70, h: 44, fn: propTent, seed: 0x2d },
  junk_heap: { w: 90, h: 50, fn: propJunkHeap, seed: 0x2e },
  tree_dead: { w: 60, h: 110, fn: propTreeDead, seed: 0x2f },
  weed: { w: 30, h: 22, fn: propWeed, seed: 0x30 },
  puddle_toxic: { w: 80, h: 16, fn: propPuddleToxic, seed: 0x31 },
  vent: { w: 46, h: 22, fn: propVent, seed: 0x611 },
  duct: { w: 64, h: 24, fn: propDuct, seed: 0x621 },
  rebar_pile: { w: 54, h: 20, fn: propRebarPile, seed: 0x631 },
  sandbag: { w: 40, h: 22, fn: propSandbag, seed: 0x641 },
  stretcher: { w: 72, h: 20, fn: propStretcher, seed: 0x651 },
  ivy: { w: 30, h: 80, fn: propIvy, seed: 0x671 },
  moss_rock: { w: 48, h: 32, fn: propMossRock, seed: 0x681 },
  container_small: { w: 120, h: 60, fn: propContainerSmall, seed: 0x691 },
  cable_spool: { w: 44, h: 44, fn: propCableSpool, seed: 0x6a1 },
  life_ring: { w: 24, h: 24, fn: propLifeRing, seed: 0x6b1 },
  crane_hook: { w: 28, h: 52, fn: propCraneHook, seed: 0x6b2 },
  turnstile: { w: 44, h: 40, fn: propTurnstile, seed: 0x6c1 },
  gurney: { w: 72, h: 30, fn: propGurney, seed: 0x661 },
  hospital_bed: { w: 80, h: 36, fn: propHospitalBed, seed: 0x6d1 },
  silt_mound: { w: 60, h: 24, fn: propSiltMound, seed: 0x6e1 },
  cargo_net: { w: 64, h: 28, fn: propCargoNet, seed: 0x6f1 },
  hull_plate: { w: 72, h: 30, fn: propHullPlate, seed: 0x701 },
  beacon: { w: 48, h: 110, fn: propBeacon, seed: 0x711 },
  vault_door: { w: 96, h: 128, fn: propVaultDoor, seed: 0x901 },
  word_wall: { w: 104, h: 72, fn: propWordWall, seed: 0x902 },
  lunar_flower: { w: 26, h: 30, fn: propLunarFlower, seed: 0x903 },
  metro_sign: { w: 56, h: 66, fn: propMetroSign, seed: 0x904 },
  akira_bike: { w: 104, h: 58, fn: propAkiraBike, seed: 0x905 },
  neon_poster: { w: 44, h: 58, fn: propNeonPoster, seed: 0x906 },
  nier_whale: { w: 184, h: 92, fn: propNierWhale, seed: 0x907 },

  // —— 垃圾堆变体（小尺寸）——
  junk_heap_bags: { w: 66, h: 44, fn: propJunkBags, seed: 0xa01 },
  junk_heap_scrap: { w: 68, h: 40, fn: propJunkScrap, seed: 0xa02 },
  junk_heap_appliance: { w: 64, h: 48, fn: propJunkAppliance, seed: 0xa03 },
  junk_heap_plastic: { w: 58, h: 36, fn: propJunkPlastic, seed: 0xa04 },
  junk_heap_cans: { w: 54, h: 30, fn: propJunkCans, seed: 0xa05 },

  // —— 地面小杂物（纯装饰散布件）——
  rubble_small: { w: 34, h: 16, fn: propRubbleSmall, seed: 0xe01 },
  scrap_bits: { w: 38, h: 14, fn: propScrapBits, seed: 0xe02 },
  glass_shards: { w: 30, h: 10, fn: propGlassShards, seed: 0xe03 },
  cable_coil: { w: 42, h: 18, fn: propCableCoil, seed: 0xe04 },
  paper_trash: { w: 36, h: 12, fn: propPaperTrash, seed: 0xe05 },
  shell_casings: { w: 26, h: 9, fn: propShellCasings, seed: 0xe06 },
  bone_scatter: { w: 34, h: 12, fn: propBoneScatter, seed: 0xe07 },
  crack_ground: { w: 48, h: 10, fn: propCrackGround, seed: 0xe08 },

  // —— 机械元素 ——
  gear_assembly: { w: 66, h: 58, fn: propGearAssembly, seed: 0xb01 },
  hydraulic_press: { w: 74, h: 66, fn: propHydraulicPress, seed: 0xb02 },
  conveyor_segment: { w: 96, h: 32, fn: propConveyor, seed: 0xb03 },
  mech_servo_arm: { w: 82, h: 58, fn: propServoArm, seed: 0xb04 },
  mech_piston: { w: 42, h: 92, fn: propPiston, seed: 0xb05 },
  mech_rail: { w: 110, h: 28, fn: propRail, seed: 0xb06 },
  mech_valve: { w: 40, h: 58, fn: propValve, seed: 0xb07 },
  mech_turbine: { w: 86, h: 86, fn: propTurbine, seed: 0xb08 },
  mech_cable_run: { w: 96, h: 26, fn: propCableRun, seed: 0xb09 },
  robot_torso: { w: 62, h: 74, fn: propRobotTorso, seed: 0xb0a },
  mech_console: { w: 66, h: 54, fn: propConsole, seed: 0xb0b },
  mech_clamp: { w: 58, h: 46, fn: propClamp, seed: 0xb0c },
  mech_pipe_bundle: { w: 72, h: 56, fn: propPipeBundle, seed: 0xb0d },
  solar_panel: { w: 96, h: 56, fn: propSolarPanel, seed: 0xb0e },
  server_rack: { w: 58, h: 98, fn: propServerRack, seed: 0xb0f },
  satellite_dish: { w: 86, h: 66, fn: propSatelliteDish, seed: 0xb10 },
  bridge_truss: { w: 122, h: 42, fn: propBridgeTruss, seed: 0xb11 },
  stadium_light: { w: 62, h: 142, fn: propStadiumLight, seed: 0xb12 },
  lab_tank: { w: 64, h: 102, fn: propLabTank, seed: 0xb13 },
  church_bell: { w: 48, h: 62, fn: propChurchBell, seed: 0xb14 },
  military_crate: { w: 74, h: 48, fn: propMilitaryCrate, seed: 0xb15 },
  alien_pod: { w: 66, h: 90, fn: propAlienPod, seed: 0xb16 },
  farm_silo: { w: 66, h: 112, fn: propFarmSilo, seed: 0xb17 },
  torn_flag: { w: 54, h: 86, fn: propTornFlag, seed: 0xb18 },

  // —— 主题场景件：图书馆 / 学校 / 工厂 / 遗迹 / 监狱 / 旅馆 ——
  library_shelf: { w: 100, h: 120, fn: propLibraryShelf, seed: 0xc01 },
  school_desk: { w: 70, h: 50, fn: propSchoolDesk, seed: 0xc02 },
  blackboard: { w: 100, h: 60, fn: propBlackboard, seed: 0xc03 },
  paper_roller: { w: 110, h: 70, fn: propPaperRoller, seed: 0xc04 },
  dig_grid: { w: 120, h: 40, fn: propDigGrid, seed: 0xc05 },
  prison_bars: { w: 80, h: 110, fn: propPrisonBars, seed: 0xc06 },
  hotel_counter: { w: 120, h: 60, fn: propHotelCounter, seed: 0xc07 },
  vending_machine: { w: 50, h: 90, fn: propVendingMachine, seed: 0xc08 },
  beacon_lamp: { w: 40, h: 60, fn: propBeaconLamp, seed: 0xc09 },
  ship_frame: { w: 180, h: 100, fn: propShipFrame, seed: 0xc0a },
  drydock_gate: { w: 120, h: 140, fn: propDrydockGate, seed: 0xc0b },
  transformer: { w: 60, h: 80, fn: propTransformer, seed: 0xc0c },
  coal_cart: { w: 80, h: 50, fn: propCoalCart, seed: 0xc0d },
  reactor_core: { w: 70, h: 100, fn: propReactorCore, seed: 0xc0e },
  ammo_stack: { w: 60, h: 40, fn: propAmmoStack, seed: 0xc0f },
  punk_amp: { w: 60, h: 70, fn: propPunkAmp, seed: 0xc10 },
  shadow_veil: { w: 90, h: 120, fn: propShadowVeil, seed: 0xc11 },
  chaos_throne: { w: 70, h: 80, fn: propChaosThrone, seed: 0xc12 },
  coffin: { w: 70, h: 40, fn: propCoffin, seed: 0xc13 },

  // —— 彩蛋：银幕 / 科幻 ——
  t800_endoskeleton: { w: 90, h: 70, fn: propT800Endoskeleton, seed: 0xd01 },
  delorean: { w: 130, h: 60, fn: propDelorean, seed: 0xd02 },
  earth_engine: { w: 120, h: 140, fn: propEarthEngine, seed: 0xd03 },
  matrix_phonebooth: { w: 50, h: 90, fn: propMatrixPhonebooth, seed: 0xd04 },
}

// 190 间房的专属摆放物：每件一张独立贴图，标记 lazy 的项按需生成（避免启动预载 1900 张）。
Object.assign(DEFS, ROOM_PROP_ART_DEFS)

export const PROP_ART_KINDS = Object.keys(DEFS)

const CACHE = new Map()

/**
 * 道具贴图。kind 未知时退回 junk_heap 尺寸的通用废物堆（不会返回空）。
 */
// （返回的 texture.userData.cleanAlpha = true；alpha 仅 0/255，无半透明脏边）
export function getPropArt(kind) {
  const key = String(kind || '')
  let tex = CACHE.get(key)
  if (tex) return tex
  const def = DEFS[key]
  const s = def ? new Surf(def.w, def.h, def.seed) : new Surf(90, 50, 0x999)
  if (def) {
    def.fn(s)
  } else {
    propJunkHeap(s)
  }
  // 统一收尾：脏污 → 三层 → 描边
  s.speck(0, 0, s.w, s.h, PAL.rustDark, 0.03, 0.35)
  s.edges(mix(PAL.white, PAL.sand, 0.55), PAL.void, 0.3, 0.45)
  s.outline(mix(PAL.void, PAL.rustDark, 0.22))
  tex = s.tex()
  tex.userData.propKind = key
  CACHE.set(key, tex)
  return tex
}

/** 预载全部道具贴图（lazy 的关卡专属件不预载，第一次进入房间时才画）。 */
export function preloadArt() {
  for (const k of PROP_ART_KINDS) {
    if (DEFS[k]?.lazy) continue
    getPropArt(k)
  }
  return CACHE.size
}

/** 清缓存（热重载 / 换色用）。 */
export function clearPropCache() {
  CACHE.clear()
}

/** 尺寸查询（布置道具时算 AABB 用）。 */
export function getPropSize(kind) {
  const def = DEFS[kind]
  return def ? { w: def.w, h: def.h } : { w: 90, h: 50 }
}


