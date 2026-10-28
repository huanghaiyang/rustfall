// ============================================================================
// 锈雨 · RUSTFALL —— 主题 BOSS 独占剪影注册表（51/51，一只一套结构）
// ----------------------------------------------------------------------------
// 规则（铁律）：
//   1. 一 BOSS = 一剪影 + 一标志物。51 只 id 各自映射到一个独立绘制函数，
//      不再复用 theme-boss-plans-a/b/c/d 里的 14 套通用体型。
//   2. 共用“原型族”（archetype）时，必须换子结构：腿数/腿型/关节方向、
//      头的位置（前置 / 内嵌 / 悬浮 / 顶置）、背部挂件、臂数、身体轴线，
//      让同类族的两只 BOSS 仍能一眼区分。函数体各自独立，禁止整段复制。
//   3. 每只 BOSS 另外挂一个独有标志物（landmark）：轮 / 钟 / 注射器 /
//      吊钩 / 天线阵 / 炉门 / 镜 / 笼 / 涡轮 / 炮 / 巨眼 / 钉冠 / 吊链…
//      标志物按 LANDMARKS 索引显式指定，51 个互不重复。
//   4. 画布坐标：def.w × def.h，地面 s.h-1，重心 x ≈ w*0.46，朝向 +x。
//      身体占高 70%-95%。发光体写入 P.g（数组），由上层统一 glow。
//   5. 纯程序化像素：只用 Surf 的 rect/poly/line/thick/ell/disc/px/speck/
//      shadow/glow，alpha 只由 Surf 二值化处理；不引 Three.js、不读图片。
// ----------------------------------------------------------------------------
// 51 只 id → 原型 / 标志物（AR 见下方 archetype 常量）：
//   tb_data_archon          01 立方方舟        L01 数据环
//   tb_assembly_overseer    02 装配巨械        L02 装配吊钩
//   tb_orbit_judge          03 轨道梭          L03 轨道裁决环
//   tb_helios               04 太阳塔          L04 光帆板
//   tb_flood_colossus       05 潮汐膜          L05 泄洪闸
//   tb_bridge_raider        06 桥背掠袭者      L06 桥索桁架
//   tb_highway_king         07 轮式战车        L07 辐条巨轮
//   tb_skyline_baron        08 不对称巨臂      L08 塔吊配重
//   tb_arena_champion       09 角斗巨躯        L09 铁笼面罩
//   tb_scrap_warlord        10 废铁爬行者      L10 废铁磁叉
//   tb_caregiver            11 育婴方舱        L11 输液袋架
//   tb_rally_boss           12 广播尖塔        L12 广播喇叭阵
//   tb_storm_reaper         13 双翼收割        L13 挂穗镰架
//   tb_acid_mother          14 酸池母体        L14 酸液腹囊
//   tb_rot_queen            15 盘根树母        L15 腐果吊篮
//   tb_bell_bishop          16 钟形圣骸        L16 巨钟
//   tb_prime_core           17 双核裂变体      L17 分裂双芯
//   tb_zero_strain          18 蜈蚣引擎        L18 节肢注射器
//   tb_proto_mind           19 原生脑巢        L19 脑槽镜面
//   tb_observer             20 浮游眼球        L20 观测镜片环
//   tb_iron_colonel         21 铁履指挥        L21 勋章链
//   tb_librarian            22 书页亡魂        L22 悬浮书页
//   tb_schoolmaster         23 教鞭巨人        L23 讲台黑板
//   tb_professor            24 讲学步行机      L24 试管架
//   tb_paper_press          25 印刷压机        L25 滚筒印版
//   tb_curator              26 展柜守夜        L26 标本瓶
//   tb_warden               27 牢门看守        L27 钥匙串
//   tb_hotel_clerk          28 门房浮灵        L28 服务铃
//   tb_dockmaster           29 码头吊装        L29 船锚
//   tb_lighthouse_keeper    30 灯塔守望        L30 旋转灯室
//   tb_shipwright           31 船坞骨架        L31 龙骨肋
//   tb_drydock_rig          32 干坞门架        L32 坞门绞盘
//   tb_substation           33 变电站虫        L33 高压线圈
//   tb_bunker_commander     34 地堡炮座        L34 观察潜望镜
//   tb_mine_foreman         35 矿坑钻机        L35 巨型钻头
//   tb_boiler_king          36 锅炉王座        L36 炉门
//   tb_reactor_priest       37 反应堆祭司      L37 燃料棒束
//   tb_rad_colossus         38 辐射巨躯        L38 辐射三叶
//   tb_arsenal_sergeant     39 军械平台        L39 弹药带
//   tb_punk_amp             40 音箱机甲        L40 音箱阵列
//   tb_shadow_walker        41 影缝潜行者      L41 影刃镜
//   tb_castle_tyrant        42 城堡暴君        L42 城垛塔楼
//   tb_vampire_count        43 蝠翼伯爵        L43 血酒圣杯
//   tb_gravity_eye          44 重力古眼        L44 引力透镜
//   tb_fog_wraith           45 雾中亡魂        L45 雾灯
//   tb_strait_howler        46 海峡嗥兽        L46 骨笛
//   tb_swamp_maw            47 沼泽巨口        L47 泥沼藤笼
//   tb_forest_hollow        48 林中空壳        L48 空心树干
//   tb_red_tide             49 赤潮拟态        L49 潮汐浮标
//   tb_grey_harbor          50 灰港吊机        L50 港钟
//   tb_hotel_nightmare      51 长夜旅馆        L51 房门号牌
// ============================================================================

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
  orb,
  bentLimb,
  accessoryHuman,
  accessoryMech,
  accessoryPlant,
  accessoryWraith,
  TAU,
  hexOf,
} from './theme-boss-parts.js'

/* ========================================================================== */
/* 原型族常量（只在注释与索引中使用，便于核对“族内换子结构”）                  */
/* ========================================================================== */
export const ARCHETYPES = {
  cubeArk: '立方方舟',
  assemblyHulk: '装配巨械',
  orbitLance: '轨道梭',
  solarTower: '太阳塔',
  tideMembrane: '潮汐膜',
  bridgeStrider: '桥背掠袭',
  wheelChariot: '轮式战车',
  asymGiantArm: '不对称巨臂',
  colossusBrawl: '角斗巨躯',
  crawlerMagnet: '废铁爬行',
  cradlePod: '育婴方舱',
  broadcastSpire: '广播尖塔',
  twinWingReaper: '双翼收割',
  acidMother: '酸池母体',
  rootTree: '盘根树母',
  bellHusk: '钟形圣骸',
  splitCore: '双核裂变',
  centipedeEngine: '蜈蚣引擎',
  brainNest: '原生脑巢',
  floatingEye: '浮游眼球',
  commanderTread: '铁履指挥',
  wraithTome: '书页亡魂',
  schoolGiant: '教鞭巨人',
  lecternWalker: '讲学步行机',
  pressMachine: '印刷压机',
  curatorCase: '展柜守夜',
  jailerGate: '牢门看守',
  clerkWisp: '门房浮灵',
  dockCrane: '码头吊装',
  lighthouse: '灯塔守望',
  shipFrame: '船坞骨架',
  dockGantry: '干坞门架',
  coilBug: '变电站虫',
  bunkerTurret: '地堡炮座',
  drillRig: '矿坑钻机',
  boilerThrone: '锅炉王座',
  reactorPriest: '反应堆祭司',
  radColossus: '辐射巨躯',
  arsenalDeck: '军械平台',
  ampMech: '音箱机甲',
  seamStalker: '影缝潜行',
  castleKeep: '城堡暴君',
  batCount: '蝠翼伯爵',
  gravityOrb: '重力古眼',
  fogSpecter: '雾中亡魂',
  straitBeast: '海峡嗥兽',
  swampMaw: '沼泽巨口',
  hollowTrunk: '林中空壳',
  mimicTide: '赤潮拟态',
  harborCrane: '灰港吊机',
  innNightmare: '长夜旅馆',
}

/* ========================================================================== */
/* 通用绘制原语（本文件私有，均为 Surf 之上的 1px 硬边实现）                   */
/* ========================================================================== */

const g1 = (P, x, y, r, c, p = 0.8) => {
  if (P && P.g) P.g.push({ x, y, r, c, p })
}

/** 一笔收边：暗描边 + 底部压暗（不破坏剪影）。 */
function seal(s, pal, bottomY) {
  if (bottomY != null) {
    for (let x = 0; x < s.w; x++) {
      const y = Math.round(bottomY)
      if (s.solid(x, y)) s.px(x, y, pal.bodyD, 0.5)
    }
  }
}

/** 简易齿轮 / 环（in 像素）。 */
function ringOf(s, cx, cy, rx, ry, r, c, steps = 28, al = 1) {
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU
    s.disc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r, c, al)
  }
}

/** 弧形（只画 ang0..ang1）。 */
function arcOf(s, cx, cy, rx, ry, r, c, a0, a1, steps = 14, al = 1) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    s.disc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r, c, al)
  }
}

/** 齿圈：外齿 + 内轮毂 + 辐条，rot 驱动转动。 */
function gearWheel(s, cx, cy, R, teeth, rot, c, cD, cL) {
  s.ell(cx, cy, R, R, cD)
  s.ell(cx, cy, R * 0.86, R * 0.86, c)
  for (let i = 0; i < teeth; i++) {
    const a = rot + (i / teeth) * TAU
    const tx = cx + Math.cos(a) * R
    const ty = cy + Math.sin(a) * R
    s.rect(tx - 1.4, ty - 1.4, 2.8, 2.8, cD)
  }
  for (let i = 0; i < 4; i++) {
    const a = rot * 0.6 + (i / 4) * TAU
    s.thick(cx, cy, cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, 0.9, cD)
  }
  s.disc(cx, cy, Math.max(1.2, R * 0.2), cL || PAL.steelWhite)
  s.px(cx - R * 0.4, cy - R * 0.4, cL || PAL.white, 0.6)
}

/** 单摆链条（n 节小环）。 */
function chain(s, x0, y0, x1, y1, n, c, cD) {
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1)
    const cx = x0 + (x1 - x0) * t
    const cy = y0 + (y1 - y0) * t
    s.disc(cx, cy, 1.5, i % 2 ? cD : c)
    if (i % 2 === 0) s.px(cx, cy - 1, PAL.steelWhite, 0.4)
  }
}

/** 竖直管 / 燃料棒（带箍）。 */
function rod(s, x, y, len, r, c, cD, accent) {
  s.rect(x - r, y, r * 2, len, c)
  s.rect(x - r, y, 1, len, mix(c, PAL.white, 0.2))
  s.rect(x + r - 1, y, 1, len, cD)
  for (let i = 1; i < 4; i++) s.rect(x - r - 1, y + (len * i) / 4, r * 2 + 2, 1, cD)
  s.px(x, y - 1, accent)
}

/** 三叶辐射标。 */
function trefoil(s, cx, cy, R, c) {
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k / 3) * TAU
    s.poly(
      [
        [cx, cy],
        [cx + Math.cos(a - 0.5) * R, cy + Math.sin(a - 0.5) * R],
        [cx + Math.cos(a + 0.15) * R * 0.62, cy + Math.sin(a + 0.15) * R * 0.62],
        [cx + Math.cos(a + 0.5) * R, cy + Math.sin(a + 0.5) * R],
      ],
      c,
    )
  }
  s.disc(cx, cy, Math.max(1, R * 0.16), PAL.void)
}

/** 三齿叉（废铁磁叉 / 绞盘钩等）。 */
function trident(s, x, y, len, dx, c, cD) {
  s.thick(x, y, x + dx * len, y + len * 0.5, 1.4, cD)
  for (let i = -1; i <= 1; i++) {
    s.thick(x + dx * len, y + len * 0.5, x + dx * (len + 6), y + len * 0.5 + i * 6, 1, c)
  }
}

/** 喇叭 / 号角（开口朝 +x）。 */
function horn(s, x, y, len, r, c, cD, accent) {
  s.poly(
    [
      [x, y - r * 0.4],
      [x + len, y - r],
      [x + len, y + r],
      [x, y + r * 0.4],
    ],
    c,
  )
  s.ell(x + len, y, r * 0.35, r, cD, 0.8)
  s.disc(x + len, y, Math.max(1.2, r * 0.34), accent)
  s.line(x, y - r * 0.4, x + len, y - r, mix(c, PAL.white, 0.35), 0.6)
}

/** 玻璃管 / 灯罩（内部发光）。 */
function tube(s, x, y, w, h, c, cD, accent) {
  s.rect(x, y, w, h, cD)
  s.rect(x + 1, y + 1, w - 2, h - 2, c)
  s.rect(x + 2, y + 2, w - 4, h - 4, accent, 0.55)
  s.px(x + 2, y + 2, PAL.white, 0.8)
  s.rect(x, y, w, 1, mix(cD, PAL.white, 0.25))
}

/** 飘带 / 布条（自上而下摆动）。 */
function streamer(s, x, y, len, wid, sway, c, cD) {
  s.poly(
    [
      [x, y],
      [x + wid, y],
      [x + wid + sway * 0.6, y + len * 0.55],
      [x + wid * 0.4 + sway, y + len],
      [x + sway * 0.8, y + len * 0.72],
      [x - 1, y + len * 0.3],
    ],
    c,
  )
  s.line(x, y, x + sway * 0.8, y + len * 0.72, cD, 0.7)
}

/** 多面体（方尖碑 / 晶体）：返回顶点，便于后续接缝。 */
function shardPoly(s, cx, baseY, wTop, wMid, wBot, height, c, cD, cL) {
  s.poly(
    [
      [cx - wBot, baseY],
      [cx - wMid, baseY - height * 0.55],
      [cx - wTop, baseY - height],
      [cx + wTop, baseY - height],
      [cx + wMid, baseY - height * 0.55],
      [cx + wBot, baseY],
    ],
    c,
  )
  s.line(cx - wBot, baseY - 2, cx - wMid, baseY - height * 0.55, cL, 0.5)
  s.line(cx - wMid, baseY - height * 0.55, cx - wTop, baseY - height, cL, 0.4)
  s.line(cx + wTop, baseY - height, cx + wMid, baseY - height * 0.55, cD, 0.8)
  s.line(cx + wMid, baseY - height * 0.55, cx + wBot, baseY - 2, cD, 0.85)
}

/** 段节体（蜈蚣 / 蠕虫）：沿轴向排 n 个椭圆并回填体节缝。 */
function segmentBody(s, x0, y0, x1, y1, n, rx, ry, c, cD, cL) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1)
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    pts.push([x, y])
  }
  for (let i = n - 1; i >= 0; i--) {
    const [x, y] = pts[i]
    s.ell(x, y, rx * (1 - Math.abs(i / n - 0.5) * 0.35), ry * (1 - Math.abs(i / n - 0.5) * 0.25), cD)
  }
  for (let i = n - 1; i >= 0; i--) {
    const [x, y] = pts[i]
    s.ell(x, y - 1.4, rx * 0.8 * (1 - Math.abs(i / n - 0.5) * 0.35), ry * 0.7, c)
    if (i % 3 === 1) s.line(x - 1, y - ry * 0.5, x + 1, y + ry * 0.5, cD, 0.7)
    if (i === 1) s.px(x - rx * 0.3, y - ry * 0.6, cL, 0.5)
  }
  return pts
}

/** 尾迹 / 地面粉尘：只落在近地。 */
function dust(s, x, y, n, c, spread) {
  for (let i = 0; i < n; i++) {
    s.px(x + (i / n - 0.5) * spread, y - (i % 3), c, 0.4)
  }
}

/* 保留：给部分体型补通用零件（不做整段复制，只调用一次） */
function optionalAccessory(s, cfg, pal, kind, cx, shY, hipY, w, h) {
  if (kind === 'human') accessoryHuman(s, cfg, pal, cx, shY, hipY, w, h)
  else if (kind === 'mech') accessoryMech(s, cfg, pal, cx, shY, hipY, w, h)
}

/* ========================================================================== */
/* 原型 01 —— 立方方舟（tb_data_archon）                                      */
/* 悬浮立方 + 下挂四根数据脐带 + 正面门缝；无腿，靠脐带触地。                 */
/* ========================================================================== */
function codexCube(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const hover = g - h * 0.62 + bob(P, 2.5)
  const cube = w * 0.19
  const rot = (P.i / (P.anim === 'move' ? 3 : 2)) * TAU
  baseShadow(s, def, cx)

  // 四根数据脐带（先画，压在立方体后）
  for (let i = 0; i < 4; i++) {
    const ox = cx - w * 0.13 + i * w * 0.088
    const sway = Math.sin(P.i * 1.1 + i * 1.7) * 3
    s.thick(ox, hover + cube * 0.6, ox + sway, hover + h * 0.14, 1.5, pal.plateD)
    s.thick(ox + sway, hover + h * 0.14, ox + sway * 1.7, g - h * 0.06, 1.1, pal.bodyD)
    s.px(ox + sway * 1.7, g - h * 0.06, pal.accent, 0.55)
  }
  // 悬浮碎石（下缘）
  for (let i = 0; i < 5; i++) {
    const sx = cx - w * 0.2 + ((i * 0.13 + P.i * 0.03) % 0.5) * w
    const sy = hover + cube + 4 + (i % 2) * 5
    s.px(sx, sy, pal.plate, 0.6)
  }

  // 立方外壳：三段叠合的方舟
  s.rect(cx - cube, hover - cube, cube * 2, cube * 2, pal.bodyD)
  s.rect(cx - cube + 2, hover - cube + 2, cube * 2 - 4, cube * 2 - 4, pal.body)
  s.rect(cx - cube + 2, hover - cube + 2, cube * 2 - 4, 2, pal.bodyL)
  s.rect(cx - cube + 2, hover + cube - 3, cube * 2 - 4, 1.4, pal.plateD)
  // 层间腰线
  s.line(cx - cube, hover - cube * 0.25, cx + cube, hover - cube * 0.25, pal.plateD, 0.9)
  s.line(cx - cube, hover + cube * 0.4, cx + cube, hover + cube * 0.4, pal.plateD, 0.55)
  rivets(s, cfg.rng, cx - cube + 3, hover + cube * 0.55, cube * 2 - 6, 5, pal.plate)

  // 正面门缝（朝向 +x 的一侧）
  s.rect(cx + cube * 0.52, hover - cube * 0.5, cube * 0.3, cube * 1.1, pal.plateD)
  s.rect(cx + cube * 0.55, hover - cube * 0.44, cube * 0.16, cube * 0.94, atk ? pal.accent : pal.bodyD)
  s.rect(cx + cube * 0.55, hover - cube * 0.06, cube * 0.16, 1.4, PAL.white, 0.8)

  // 左上角切角天线
  s.thick(cx - cube * 0.7, hover - cube, cx - cube * 0.9, hover - cube * 1.45, 1.1, pal.plateD)
  s.px(cx - cube * 0.9, hover - cube * 1.45, pal.accent)
  // 右侧数据总线
  s.line(cx + cube, hover - cube * 0.6, cx + cube + w * 0.05, hover - cube * 0.2, pal.plateD, 0.7)

  // 内部核心（透过门缝）
  core(s, P, cx + cube * 0.05, hover + cube * 0.1, cube * (atk ? 0.4 : 0.28), pal.core, atk ? 1.5 : 1, P)
  // 扫描环
  ringOf(s, cx, hover, cube * (atk ? 1.5 : 1.18), cube * 0.32, 1, pal.trim, 30, 0.55)
  const sp = rot
  s.disc(cx + Math.cos(sp) * cube * 1.18, hover + Math.sin(sp) * cube * 0.32, 2, pal.trim)

  crest(s, cx, hover - cube * 1.02, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 150)
  return { x: cx - cube * 0.5, y: hover + cube * 0.45, s: w / 140 }
}

/* ========================================================================== */
/* 原型 02 —— 太阳塔（tb_helios）                                              */
/* 三阶方尖塔 + 顶部日盘 + 两片光帆；塔身无臂，靠光帆转动攻击。               */
/* ========================================================================== */
function heliosTower(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const by = bob(P, 1.5)
  const baseY = g - h * 0.05
  const sail = Math.sin((P.i / (P.anim === 'move' ? 3 : 2)) * TAU) * 0.22 + (atk ? 0.55 : 0)
  baseShadow(s, def, cx)

  // 基座：三级台阶
  s.rect(cx - w * 0.26, baseY - h * 0.06, w * 0.52, h * 0.06, pal.plateD)
  s.rect(cx - w * 0.26, baseY - h * 0.06, w * 0.52, 2, pal.plate)
  s.rect(cx - w * 0.2, baseY - h * 0.11, w * 0.4, h * 0.05, pal.bodyD)
  for (let i = 0; i < 5; i++) s.px(cx - w * 0.18 + i * w * 0.09, baseY - h * 0.03, pal.plate, 0.8)

  // 塔身：三段收窄方尖
  shardPoly(s, cx, baseY - h * 0.1, w * 0.075, w * 0.14, w * 0.2, h * 0.42, pal.body, pal.bodyD, pal.bodyL)
  // 塔身横缝与日纹
  for (let i = 1; i < 5; i++) {
    const yy = baseY - h * 0.1 - (h * 0.42 * i) / 5
    s.line(cx - w * 0.17 + i * 2, yy, cx + w * 0.17 - i * 2, yy, pal.bodyD, 0.5)
  }
  s.disc(cx, baseY - h * 0.28, w * 0.05, pal.accent, 0.55)
  s.disc(cx, baseY - h * 0.28, w * 0.02, PAL.white, 0.7)

  // 光帆：左右各一片，绕塔轴翻转
  for (let i = 0; i < 2; i++) {
    const dx = i === 0 ? -1 : 1
    const sx = cx + dx * w * 0.14
    const sy = baseY - h * 0.6
    const span = w * (0.26 + sail * 0.06)
    const rise = h * (0.1 + sail * 0.1)
    s.poly(
      [
        [sx, sy],
        [sx + dx * span, sy - rise],
        [sx + dx * span * 0.92, sy - rise * 0.55],
        [sx + dx * span * 0.8, sy + h * 0.02],
        [sx + dx * 3, sy + h * 0.06],
      ],
      i === 0 ? pal.plate : pal.bodyL,
      0.95,
    )
    // 帆骨
    for (let k = 0; k < 3; k++) {
      const t = 0.35 + k * 0.25
      s.line(sx, sy, sx + dx * span * t, sy - rise * t, pal.plateD, 0.7)
    }
    s.line(sx, sy + h * 0.05, sx + dx * span, sy - rise, pal.accent, 0.4)
    if (atk && i === 1) g1(P, sx + dx * span, sy - rise, w * 0.06, pal.accent, 0.8)
  }

  // 日光环（塔顶）
  const topY = baseY - h * 0.52
  ringOf(s, cx, topY - h * 0.08, w * 0.13, w * 0.045, 1, pal.accent, 26, atk ? 0.9 : 0.5)
  // 日盘
  s.disc(cx, topY - h * 0.08, w * 0.09, pal.bodyD)
  s.disc(cx, topY - h * 0.08, w * 0.072, pal.accent)
  s.disc(cx, topY - h * 0.08, w * 0.032, PAL.white)
  core(s, P, cx, topY - h * 0.08, w * (atk ? 0.1 : 0.06), pal.core, atk ? 1.6 : 1.1, P)
  // 日冕尖刺
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + P.i * 0.02
    s.thick(
      cx + Math.cos(a) * w * 0.09,
      topY - h * 0.08 + Math.sin(a) * w * 0.09,
      cx + Math.cos(a) * w * (atk ? 0.16 : 0.13),
      topY - h * 0.08 + Math.sin(a) * w * (atk ? 0.16 : 0.13),
      0.9,
      pal.accent,
      0.7,
    )
  }
  crest(s, cx, topY - h * 0.16, cfg.crest, pal.bodyL, pal.bodyD, pal.accent, w / 140)
  return { x: cx + w * 0.04, y: baseY - h * 0.24, s: w / 140 }
}

/* ========================================================================== */
/* 原型 03 —— 潮汐膜（tb_flood_colossus）                                      */
/* 一坨铺地的膜状巨躯 + 顶部拱背 + 正面泄洪口；没有头，靠背拱上的眼。          */
/* ========================================================================== */
function floodMembrane(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const wob = Math.sin((P.i / (P.anim === 'move' ? 3 : 2)) * TAU) * w * 0.018
  const lump = atk ? 1.06 : 1
  baseShadow(s, def, cx)

  // 摊开的膜：五条低矮弧，逐层叠起
  s.ell(cx + wob, g - h * 0.09, w * 0.42, h * 0.075, pal.bodyD)
  s.ell(cx - w * 0.03 + wob, g - h * 0.19, w * 0.36, h * 0.11, pal.body)
  s.ell(cx + w * 0.02 + wob, g - h * 0.29, w * 0.29, h * 0.1 * lump, pal.bodyD)
  s.ell(cx + wob, g - h * 0.41, w * 0.22, h * 0.09, pal.body)
  // 背拱
  s.ell(cx - w * 0.02 + wob, g - h * 0.52, w * 0.15, h * 0.07, pal.bodyD)
  s.line(cx - w * 0.3 + wob, g - h * 0.29, cx - w * 0.05 + wob, g - h * 0.5, pal.bodyL, 0.35)
  // 膜上的水光斑
  const rnd = cfg.rng
  for (let i = 0; i < 9; i++) {
    s.px(cx - w * 0.32 + rnd() * w * 0.64 + wob, g - h * (0.04 + rnd() * 0.42), pal.accent, 0.3)
  }

  // 垂挂的膜须（潮汐拖尾）
  for (let i = 0; i < 7; i++) {
    const ox = cx - w * 0.32 + i * w * 0.1
    const len = h * (0.05 + (i % 3) * 0.02) + Math.sin(P.i * 0.9 + i) * 2
    s.thick(ox, g - h * 0.1, ox + (i % 2 ? 3 : -3), g - 2 + len * 0.2, 1.2, pal.plateD)
  }

  // 正面泄洪口：横向裂口 + 闸齿
  const my = g - h * (atk ? 0.16 : 0.13)
  const mw = w * (atk ? 0.26 : 0.2)
  s.ell(cx + w * 0.02 + wob, my, mw, h * (atk ? 0.055 : 0.035), PAL.bloodDark)
  s.ell(cx + w * 0.02 + wob, my, mw * 0.7, h * (atk ? 0.04 : 0.02), mix(PAL.waterDeep, PAL.void, 0.4))
  for (let i = 0; i < 6; i++) {
    const tx = cx + w * 0.02 + wob - mw * 0.7 + (i / 5) * mw * 1.4
    s.poly([[tx, my], [tx + 2, my + h * 0.03], [tx + 4, my]], PAL.bone)
  }

  // 背拱上的三只眼（主眼最大）
  orb(s, cx - w * 0.02 + wob, g - h * 0.64, w * 0.04, PAL.white, pal.bodyD, PAL.white)
  s.disc(cx - w * 0.02 + wob, g - h * 0.64, w * 0.018, pal.accent)
  g1(P, cx - w * 0.02 + wob, g - h * 0.64, w * 0.06, pal.accent, 0.6)
  for (const [ex, ey] of [
    [0.11, 0.55],
    [-0.13, 0.58],
  ]) {
    s.disc(cx + w * ex + wob, g - h * ey, w * 0.017, pal.accent, 0.9)
    s.disc(cx + w * ex + wob, g - h * ey, w * 0.007, PAL.void)
  }

  // 侧膜翼（攻击时张开）
  for (const dx of [-1, 1]) {
    const wy = g - h * 0.32
    const span = w * (atk ? 0.44 : 0.38)
    s.poly(
      [
        [cx + dx * w * 0.3, wy],
        [cx + dx * span, wy - h * (atk ? 0.12 : 0.06)],
        [cx + dx * span * 0.8, wy + h * 0.1],
        [cx + dx * w * 0.28, wy + h * 0.08],
      ],
      pal.bodyD,
      0.85,
    )
    s.line(cx + dx * w * 0.3, wy, cx + dx * span, wy - h * 0.05, pal.accent, 0.35)
  }

  crest(s, cx - w * 0.02 + wob, g - h * 0.72, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 160)
  core(s, P, cx + wob, g - h * 0.44, w * (atk ? 0.05 : 0.032), pal.core, 0.9, P)
  return { x: cx - w * 0.3, y: g - h * 0.52, s: w / 140 }
}

/* ========================================================================== */
/* 原型 04 —— 桥背掠袭（tb_bridge_raider）                                     */
/* 长桥状横躯 + 前后两组斜撑腿 + 桥面栏杆与塔架；头低于桥面，从桥下探出。     */
/* ========================================================================== */
function bridgeStrider(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const deckY = g - h * 0.55
  baseShadow(s, def, cx)

  // 四条斜撑腿：前二后二，交替
  const legs = [
    [cx - w * 0.3, -lp, true],
    [cx - w * 0.12, lp, false],
    [cx + w * 0.12, -lp, false],
    [cx + w * 0.3, lp, true],
  ]
  for (const [lx, sw, back] of legs) {
    const c = back ? pal.bodyD : pal.body
    const lift = Math.max(0, sw * 4)
    s.thick(lx, deckY + h * 0.03, lx + sw * 4 - w * 0.05, g - h * 0.2, w * 0.032, c)
    s.disc(lx + sw * 4 - w * 0.05, g - h * 0.2, w * 0.035, pal.plateD)
    s.thick(lx + sw * 4 - w * 0.05, g - h * 0.2, lx + sw * 2, g - 4 - lift, w * 0.026, c)
    s.rect(lx + sw * 2 - w * 0.04, g - 5 - lift, w * 0.08, 4, pal.plateD)
  }

  // 桥面主梁：横向长箱
  s.rect(cx - w * 0.44, deckY, w * 0.86, h * 0.1, pal.bodyD)
  s.rect(cx - w * 0.44, deckY, w * 0.86, 2, pal.bodyL)
  s.rect(cx - w * 0.44, deckY + h * 0.075, w * 0.86, 2, pal.plateD)
  // 桥面铺板（斜线）
  for (let i = 0; i < 10; i++) {
    s.line(cx - w * 0.42 + i * w * 0.084, deckY + 2, cx - w * 0.4 + i * w * 0.084, deckY + h * 0.07, pal.plateD, 0.5)
  }
  // 栏杆：立柱 + 横杆
  for (let i = 0; i < 7; i++) {
    s.rect(cx - w * 0.42 + i * w * 0.14, deckY - h * 0.06, 1.6, h * 0.06, pal.plate)
  }
  s.line(cx - w * 0.42, deckY - h * 0.06, cx + w * 0.4, deckY - h * 0.06, pal.plate, 0.9)
  s.line(cx - w * 0.42, deckY - h * 0.03, cx + w * 0.4, deckY - h * 0.03, pal.bodyD, 0.7)

  // 桥塔：后段一座桁架塔
  const twX = cx - w * 0.26
  s.thick(twX - w * 0.05, deckY - h * 0.05, twX - w * 0.02, deckY - h * 0.3, 1.8, pal.plateD)
  s.thick(twX + w * 0.05, deckY - h * 0.05, twX + w * 0.02, deckY - h * 0.3, 1.8, pal.plateD)
  for (let i = 0; i < 4; i++) {
    const t = i / 3
    s.line(twX - w * 0.045 + t * w * 0.035, deckY - h * 0.08 - t * h * 0.19,
      twX + w * 0.045 - t * w * 0.035, deckY - h * 0.1 - t * h * 0.2, pal.plate, 0.8)
  }
  s.rect(twX - w * 0.07, deckY - h * 0.31, w * 0.14, 3, pal.plate)
  s.px(twX, deckY - h * 0.33, pal.accent)

  // 桥下探头：长颈向前下伸
  const nkX = cx + w * 0.2
  const nkY = deckY + h * 0.16
  s.thick(cx + w * 0.1, deckY + h * 0.06, nkX, nkY, w * 0.045, pal.bodyD)
  s.thick(nkX, nkY, cx + w * 0.34, nkY + (atk ? h * 0.02 : 0), w * 0.038, pal.body)
  s.ell(cx + w * 0.35, nkY + (atk ? h * 0.02 : 0), w * 0.075, h * 0.045, pal.body)
  // 头冠 / 视缝
  s.rect(cx + w * 0.31, nkY - h * 0.012, w * 0.08, 2.6, pal.accent)
  s.px(cx + w * 0.4, nkY - 1, PAL.white, 0.7)
  crest(s, cx + w * 0.33, nkY - h * 0.04, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 160)

  // 桥上装甲箱 / 灯具
  for (const dx of [-0.08, 0.06]) {
    s.rect(cx + dx * w, deckY - h * 0.12, w * 0.08, h * 0.06, pal.plateD)
    s.px(cx + dx * w + w * 0.04, deckY - h * 0.1, pal.accent, 0.8)
  }
  core(s, P, cx + w * 0.02, deckY - h * 0.02, w * (atk ? 0.04 : 0.026), pal.core, 0.9, P)
  return { x: cx - w * 0.02, y: deckY - h * 0.1, s: w / 140 }
}

/* ========================================================================== */
/* 原型 05 —— 轮式战车（tb_highway_king）                                      */
/* 一大一小两只辐条轮 + 斜背车斗 + 前置撞角；无腿，靠轮子滚。                  */
/* ========================================================================== */
function wheelChariot(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const rot = P.anim === 'move' ? (P.i / 3) * TAU : P.anim === 'attack' ? 0.5 : 0
  const jolt = P.anim === 'move' ? Math.abs(Math.sin((P.i / 3) * Math.PI)) * 2 : 0
  const bodyY = g - h * 0.3 + bob(P, 1) - jolt
  baseShadow(s, def, cx)

  // 后轮（大） + 前轮（小）
  gearWheel(s, cx - w * 0.2, g - h * 0.15, h * 0.148, 9, rot, pal.body, pal.bodyD, pal.plate)
  gearWheel(s, cx + w * 0.3, g - h * 0.11, h * 0.105, 7, rot * 1.3, pal.plate, pal.plateD, pal.bodyL)
  // 轮轴
  s.thick(cx - w * 0.2, g - h * 0.15, cx + w * 0.3, g - h * 0.11, 1.8, pal.plateD)

  // 车斗：后高前低斜箱
  s.poly(
    [
      [cx - w * 0.35, bodyY],
      [cx - w * 0.25, bodyY - h * 0.2],
      [cx + w * 0.2, bodyY - h * 0.17],
      [cx + w * 0.34, bodyY + h * 0.06],
      [cx - w * 0.32, bodyY + h * 0.06],
    ],
    pal.body,
  )
  s.line(cx - w * 0.25, bodyY - h * 0.2, cx + w * 0.2, bodyY - h * 0.17, pal.bodyL, 0.8)
  s.line(cx - w * 0.32, bodyY + h * 0.06, cx + w * 0.34, bodyY + h * 0.06, pal.plateD)
  // 车斗横板
  for (let i = 0; i < 4; i++) {
    const yy = bodyY - h * 0.16 + i * h * 0.055
    s.line(cx - w * 0.3 + i * 2, yy, cx + w * 0.28 - i * 2, yy, pal.plateD, 0.5)
  }
  rivets(s, cfg.rng, cx - w * 0.24, bodyY - h * 0.02, w * 0.44, 7, pal.plate)

  // 前置撞角
  s.poly(
    [
      [cx + w * 0.32, bodyY - h * 0.03],
      [cx + w * 0.46, bodyY + h * 0.02],
      [cx + w * 0.32, bodyY + h * 0.08],
    ],
    pal.plate,
  )
  s.line(cx + w * 0.33, bodyY - h * 0.02, cx + w * 0.44, bodyY + h * 0.02, PAL.steelWhite, 0.6)

  // 车斗上的驾驶棚 + 探照灯
  const cabX = cx - w * 0.1
  s.poly(
    [
      [cabX - w * 0.11, bodyY - h * 0.18],
      [cabX - w * 0.08, bodyY - h * 0.29],
      [cabX + w * 0.09, bodyY - h * 0.28],
      [cabX + w * 0.12, bodyY - h * 0.16],
    ],
    pal.bodyD,
  )
  s.rect(cabX - w * 0.06, bodyY - h * 0.26, w * 0.11, h * 0.035, pal.accent, 0.75)
  s.px(cabX + w * 0.05, bodyY - h * 0.25, PAL.white, 0.8)
  // 排气管
  s.thick(cx - w * 0.3, bodyY - h * 0.16, cx - w * 0.34, bodyY - h * 0.34, 1.8, pal.plateD)
  if (P.anim === 'move') s.px(cx - w * 0.35 - (P.i % 2) * 2, bodyY - h * 0.36, PAL.ashPale, 0.5)

  // 后斗上的旗杆
  s.thick(cx - w * 0.3, bodyY - h * 0.19, cx - w * 0.34, bodyY - h * 0.42, 1.2, pal.plateD)
  s.poly(
    [
      [cx - w * 0.34, bodyY - h * 0.42],
      [cx - w * 0.2, bodyY - h * 0.38],
      [cx - w * 0.23, bodyY - h * 0.33],
      [cx - w * 0.34, bodyY - h * 0.34],
    ],
    pal.accent,
    0.8,
  )

  // 前灯
  orb(s, cx + w * 0.36, bodyY - h * 0.04, w * 0.024, pal.accent, pal.bodyD, PAL.white)
  g1(P, cx + w * 0.36, bodyY - h * 0.04, w * 0.055, pal.accent, 0.6)
  crest(s, cabX, bodyY - h * 0.3, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 150)
  return { x: cx + w * 0.2, y: bodyY - h * 0.1, s: w / 150 }
}

/* ========================================================================== */
/* 原型 06 —— 不对称巨臂（tb_skyline_baron / tb_schoolmaster）                 */
/* 单腿粗柱 + 一侧巨臂（过肩）+ 另一侧萎缩小臂；轴线偏后。                    */
/* ========================================================================== */
function asymGiantArm(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.44
  const atk = P.anim === 'attack'
  const lp = legPhase(P)
  const by = bob(P, 1.5)
  const hipY = g - h * 0.3 + by
  const shY = hipY - h * 0.28
  baseShadow(s, def, cx)
  optionalAccessory(s, cfg, pal, 'human', cx, shY, hipY, w, h)

  // 双腿：一粗一细（不对称）
  s.thick(cx - w * 0.14, hipY, cx - w * 0.17, g - h * 0.12, w * 0.075, pal.bodyD)
  s.thick(cx - w * 0.17, g - h * 0.12, cx - w * 0.15 + lp * 2, g - 4, w * 0.055, pal.bodyD)
  s.rect(cx - w * 0.2, g - 5, w * 0.11, 5, pal.plateD)
  s.thick(cx + w * 0.1, hipY, cx + w * 0.13 + lp * 4, g - h * 0.1, w * 0.045, pal.body)
  s.thick(cx + w * 0.13 + lp * 4, g - h * 0.1, cx + w * 0.12 + lp * 2, g - 4, w * 0.04, pal.body)
  s.rect(cx + w * 0.07 + lp * 2, g - 5, w * 0.09, 5, pal.plateD)

  // 躯干：斜肩（右肩高）
  s.poly(
    [
      [cx - w * 0.16, hipY + 1],
      [cx + w * 0.16, hipY + 1],
      [cx + w * 0.22, shY + h * 0.02],
      [cx + w * 0.06, shY - h * 0.04],
      [cx - w * 0.15, shY + h * 0.04],
    ],
    pal.body,
  )
  s.line(cx - w * 0.15, shY + h * 0.04, cx + w * 0.06, shY - h * 0.04, pal.bodyL, 0.6)
  // 胸甲斜片
  s.poly(
    [
      [cx - w * 0.1, hipY - 2],
      [cx + w * 0.12, hipY - 2],
      [cx + w * 0.16, shY + h * 0.08],
      [cx - w * 0.08, shY + h * 0.06],
    ],
    pal.plate,
  )
  s.line(cx - w * 0.08, shY + h * 0.06, cx + w * 0.16, shY + h * 0.08, pal.plateD)
  core(s, P, cx + w * 0.02, shY + h * 0.12, w * 0.04, pal.core, 0.9, P)

  // 头：偏在巨臂一侧，被肩甲挡住半张脸
  const hx = cx + w * 0.02
  const hy = shY - h * 0.06 + by * 0.4
  s.ell(hx, hy, w * 0.055, h * 0.04, pal.bodyD)
  s.rect(hx - w * 0.03, hy - 2, w * 0.075, 2.4, pal.accent)
  s.px(hx + w * 0.035, hy - 1, PAL.white, 0.7)
  crest(s, hx, hy - h * 0.038, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 150)

  // 巨臂（右侧，过肩、三节）：攻击时砸向前下
  const gx = cx + w * 0.26
  const gy = shY + h * 0.02
  const drop = atk ? h * 0.16 : 0
  s.ell(cx + w * 0.17, shY + h * 0.01, w * 0.1, w * 0.075, pal.plate)
  s.thick(cx + w * 0.2, gy, gx, gy - h * 0.1, w * 0.06, pal.body)
  s.disc(gx, gy - h * 0.1, w * 0.055, pal.plateD)
  s.thick(gx, gy - h * 0.1, gx + w * 0.02, gy + h * 0.1 + drop, w * 0.07, pal.bodyD)
  const fistX = gx + w * 0.02
  const fistY = gy + h * 0.16 + drop
  s.ell(fistX, fistY, w * 0.085, w * 0.075, pal.body)
  for (let i = 0; i < 3; i++) s.px(fistX + w * 0.02 + i * 4, fistY - 3, pal.plateD)
  if (atk) g1(P, fistX, fistY, w * 0.1, pal.accent, 0.8)

  // 萎缩小臂（左侧）：细、短、带夹钳
  s.thick(cx - w * 0.2, shY + h * 0.06, cx - w * 0.27, shY + h * 0.2, 2.4, pal.bodyD)
  s.ell(cx - w * 0.27, shY + h * 0.22, w * 0.032, w * 0.032, pal.plate)
  s.thick(cx - w * 0.27, shY + h * 0.22, cx - w * 0.33, shY + h * 0.27, 1.2, pal.plateD)
  s.thick(cx - w * 0.27, shY + h * 0.22, cx - w * 0.32, shY + h * 0.3, 1.2, pal.plateD)

  // 武器挂在巨臂侧（只在前臂外缘）
  if (cfg.weapon === 2 || cfg.weapon === 4) {
    s.rect(gx - w * 0.05, gy - h * 0.02, w * 0.16, 4, pal.plateD)
    s.px(gx + w * 0.13, gy, pal.accent)
  }
  dust(s, cx, g, 8, pal.plateD, w * 0.4)
  return { x: cx - w * 0.24, y: shY + h * 0.24, s: w / 150 }
}

/* ========================================================================== */
/* 原型 07 —— 角斗巨躯（tb_arena_champion）                                    */
/* 极宽肩 + 缩头 + 四段腰带 + 双短腿；比人类壮汉更“方块”，更贴地。            */
/* ========================================================================== */
function brawlColossus(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const lp = legPhase(P)
  const by = bob(P, 2)
  const hipY = g - h * 0.34 + by
  const shY = hipY - h * 0.3
  baseShadow(s, def, cx)

  // 粗短双腿：外八
  for (const [dx, sw, back] of [
    [-1, -lp, true],
    [1, lp, false],
  ]) {
    const x = cx + dx * w * 0.15
    const c = back ? pal.bodyD : pal.body
    s.thick(x, hipY, x + dx * w * 0.05 + sw * 3, g - h * 0.1, w * 0.075, c)
    s.thick(x + dx * w * 0.05 + sw * 3, g - h * 0.1, x + dx * w * 0.02 + sw * 2, g - 4, w * 0.065, c)
    s.rect(x + dx * w * 0.02 + sw * 2 - w * 0.06, g - 6, w * 0.13, 6, pal.plateD)
  }
  // 四段腰带
  s.rect(cx - w * 0.19, hipY - 6, w * 0.38, 9, pal.plateD)
  for (let i = 0; i < 4; i++) s.rect(cx - w * 0.17 + i * w * 0.085, hipY - 5, w * 0.06, 6, pal.plate)
  s.px(cx, hipY - 1, pal.accent)

  // 躯干：上宽下窄的倒梯形，肩极宽
  s.poly(
    [
      [cx - w * 0.2, hipY - 2],
      [cx + w * 0.2, hipY - 2],
      [cx + w * 0.31, shY + h * 0.04],
      [cx - w * 0.31, shY + h * 0.04],
    ],
    pal.body,
  )
  s.poly(
    [
      [cx - w * 0.15, hipY - 4],
      [cx + w * 0.15, hipY - 4],
      [cx + w * 0.22, shY + h * 0.08],
      [cx - w * 0.22, shY + h * 0.08],
    ],
    pal.plate,
  )
  // 胸肌线
  s.line(cx, shY + h * 0.08, cx, hipY - 4, pal.plateD, 0.7)
  s.line(cx - w * 0.2, shY + h * 0.12, cx + w * 0.2, shY + h * 0.12, pal.plateD, 0.5)

  // 肩甲：两大块铆钉壳，压住脖子
  for (const dx of [-1, 1]) {
    s.ell(cx + dx * w * 0.29, shY + h * 0.05, w * 0.12, h * 0.075, pal.plate)
    s.ell(cx + dx * w * 0.29, shY + h * 0.03, w * 0.1, h * 0.045, pal.bodyL, 0.35)
    for (let i = 0; i < 3; i++) s.px(cx + dx * w * 0.24 + i * dx * 6, shY + h * 0.08, pal.plateD)
  }

  // 缩头：几乎埋在肩里
  const hx = cx + w * 0.01
  const hy = shY + h * 0.01 + by * 0.3
  s.ell(hx, hy, w * 0.058, h * 0.036, pal.bodyD)
  s.rect(hx - w * 0.032, hy - 1, w * 0.075, 2, pal.accent)
  crest(s, hx, hy - h * 0.038, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 150)

  // 双臂：左臂自然下垂，右臂持武器（短而粗）
  s.thick(cx - w * 0.3, shY + h * 0.08, cx - w * 0.34, shY + h * 0.24, w * 0.06, pal.bodyD)
  s.ell(cx - w * 0.34, shY + h * 0.26, w * 0.045, w * 0.045, pal.plate)
  const wx = cx + w * 0.29
  const wy = shY + h * 0.22 - (atk ? h * 0.08 : 0)
  s.thick(cx + w * 0.27, shY + h * 0.08, wx, wy, w * 0.055, pal.body)
  const tip = weaponAt(s, wx, wy, cfg.weapon, pal.body, pal.bodyD, pal.accent, w * 0.18, atk ? -5 : 0)
  if (atk) core(s, P, tip[0], tip[1], w * 0.03, pal.core, 1.2, P)

  // 腿上镣铐（角斗士记号）
  for (const dx of [-1, 1]) {
    s.rect(cx + dx * w * 0.16 - w * 0.055, g - h * 0.09, w * 0.11, 3, pal.plate)
    s.px(cx + dx * w * 0.16, g - h * 0.08, pal.accent, 0.8)
  }
  return { x: cx - w * 0.02, y: shY + h * 0.2, s: w / 150 }
}

/* ========================================================================== */
/* 原型 08 —— 废铁爬行（tb_scrap_warlord）                                     */
/* 低矮六足（前四后二）+ 背驮磁叉架 + 前伸双钳；无直立躯干。                   */
/* ========================================================================== */
function crawlerMagnet(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.47
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const bodyY = g - h * 0.3 + bob(P, 1.6)
  baseShadow(s, def, cx)

  // 六足：每侧三条，前两对向前后方伸展
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ox = cx + side * w * (0.1 + i * 0.055)
      const ay = bodyY + h * 0.02 + i * h * 0.02
      const sw = (i % 2 ? lp : -lp) * 5
      const footX = ox + side * w * (0.16 + i * 0.03) + sw
      const footY = g - 3 - Math.max(0, (i % 2 ? lp : -lp) * 3)
      bentLimb(s, ox, ay, footX, footY, side * w * 0.05, 1.6, pal.bodyD, pal.body)
      s.px(footX, footY, pal.accent, 0.4)
    }
  }

  // 低矮身架：横长梯形
  s.poly(
    [
      [cx - w * 0.28, bodyY + h * 0.06],
      [cx - w * 0.22, bodyY - h * 0.08],
      [cx + w * 0.18, bodyY - h * 0.1],
      [cx + w * 0.3, bodyY + h * 0.04],
      [cx + w * 0.26, bodyY + h * 0.1],
      [cx - w * 0.26, bodyY + h * 0.1],
    ],
    pal.body,
  )
  s.line(cx - w * 0.22, bodyY - h * 0.08, cx + w * 0.18, bodyY - h * 0.1, pal.bodyL, 0.6)
  // 焊疤 / 拼板
  const rnd = cfg.rng
  for (let i = 0; i < 8; i++) {
    s.px(cx - w * 0.24 + rnd() * w * 0.5, bodyY - h * 0.06 + rnd() * h * 0.13, pal.plateD, 0.8)
  }
  for (let i = 0; i < 3; i++) {
    s.line(cx - w * 0.14 + i * w * 0.13, bodyY + 2, cx - w * 0.1 + i * w * 0.13, bodyY + h * 0.06, pal.plate, 0.5)
  }

  // 前伸双钳（驾驶位两侧）
  for (const dx of [1, -1]) {
    const bx = cx + dx * w * 0.18
    const by2 = bodyY - h * 0.04
    const reach = atk ? w * 0.2 : w * 0.1
    s.thick(bx, by2, bx + dx * reach, by2 + h * 0.02, 2.6, pal.bodyD)
    s.thick(bx + dx * reach, by2 + h * 0.02, bx + dx * (reach + 8), by2 - h * 0.03, 1.6, pal.plate)
    s.thick(bx + dx * reach, by2 + h * 0.02, bx + dx * (reach + 8), by2 + h * 0.06, 1.6, pal.plate)
    if (atk && dx === 1) g1(P, bx + dx * (reach + 8), by2 + h * 0.01, w * 0.05, pal.accent, 0.7)
  }

  // 驾驶座：露出上半身的 warlord（小）
  const drX = cx - w * 0.02
  const drY = bodyY - h * 0.13
  s.rect(drX - w * 0.1, drY - h * 0.05, w * 0.2, h * 0.09, pal.plateD)
  s.rect(drX - w * 0.1, drY - h * 0.05, w * 0.2, 1.6, pal.plate)
  s.ell(drX, drY - h * 0.11, w * 0.05, h * 0.035, pal.bodyD)
  s.rect(drX - w * 0.03, drY - h * 0.12, w * 0.07, 2, pal.accent)
  crest(s, drX, drY - h * 0.145, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 160)
  // 背上的磁叉架
  s.thick(drX - w * 0.16, drY - h * 0.03, drX - w * 0.2, drY - h * 0.2, 2, pal.plateD)
  trident(s, drX - w * 0.2, drY - h * 0.2, w * 0.1, -1, pal.plate, pal.bodyD)
  s.px(drX - w * 0.22, drY - h * 0.27, pal.accent)
  dust(s, cx + w * 0.1, g, 10, pal.plateD, w * 0.5)
  return { x: cx - w * 0.22, y: bodyY - h * 0.12, s: w / 150 }
}

/* ========================================================================== */
/* 原型 09 —— 育婴方舱（tb_caregiver）                                         */
/* 立式医疗舱（圆角长箱）+ 六条悬挂式护理臂 + 底座滚轮，无头（舱门即脸）。      */
/* ========================================================================== */
function cradlePod(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.45
  const atk = P.anim === 'attack'
  const by = bob(P, 1.4)
  const podH = h * 0.66
  const podW = w * 0.3
  const topY = g - h * 0.08 - podH + by
  const podY = topY
  baseShadow(s, def, cx)

  // 底座 + 四个滚轮
  s.rect(cx - podW * 0.75, g - h * 0.07, podW * 1.5, h * 0.05, pal.plateD)
  s.rect(cx - podW * 0.75, g - h * 0.07, podW * 1.5, 2, pal.plate)
  for (let i = 0; i < 4; i++) {
    s.disc(cx - podW * 0.55 + i * podW * 0.36, g - h * 0.02, w * 0.026, pal.bodyD)
    s.px(cx - podW * 0.55 + i * podW * 0.36, g - h * 0.02, pal.plate, 0.7)
  }

  // 舱体：圆角长箱（用矩形 + 上下椭圆收角）
  s.rect(cx - podW, podY, podW * 2, podH, pal.bodyD)
  s.rect(cx - podW + 2, podY + 2, podW * 2 - 4, podH - 4, pal.body)
  s.ell(cx, podY + 4, podW - 2, podW * 0.22, pal.bodyD)
  s.ell(cx, podY + podH - 4, podW - 2, podW * 0.22, pal.bodyD)
  // 玻璃前窗（朝 +x）
  s.rect(cx + podW * 0.18, podY + podH * 0.16, podW * 0.6, podH * 0.5, pal.plateD)
  s.rect(cx + podW * 0.22, podY + podH * 0.18, podW * 0.5, podH * 0.44, mix(PAL.glass, PAL.void, 0.35))
  s.rect(cx + podW * 0.22, podY + podH * 0.4, podW * 0.5, 2, PAL.white, 0.5)
  // 内部小影（护理对象）
  s.ell(cx + podW * 0.42, podY + podH * 0.44, podW * 0.18, podH * 0.1, pal.accent, 0.5)
  s.disc(cx + podW * 0.46, podY + podH * 0.37, podW * 0.08, pal.accent, 0.7)
  // 舱顶十字标
  s.rect(cx - podW * 0.2, podY - h * 0.02, podW * 0.4, h * 0.03, pal.plate)
  s.rect(cx - podW * 0.06, podY - h * 0.045, podW * 0.12, h * 0.08, pal.trim)

  // 六条悬挂护理臂：从舱顶两侧垂下，末端是夹 / 针 / 瓶
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1
    const k = i % 3
    const sx = cx + side * podW * (0.55 + k * 0.18)
    const sy = podY + h * 0.02
    const sway = Math.sin(P.i * 1.1 + i) * 2.5
    const ex = sx + side * (w * 0.05 + k * 4) + sway
    const ey = podY + podH * (0.35 + k * 0.16) - (atk ? h * 0.06 : 0)
    bentLimb(s, sx, sy, ex, ey, side * w * 0.05, 1.3, pal.plateD, pal.plate)
    if (k === 0) {
      s.thick(ex, ey, ex + side * 4, ey + 6, 0.9, pal.trim)
      s.thick(ex, ey, ex + side * 8, ey + 4, 0.9, pal.trim)
    } else if (k === 1) {
      s.thick(ex, ey, ex, ey + 9, 0.8, PAL.steelWhite)
      s.px(ex, ey + 9, pal.accent)
    } else {
      s.rect(ex - 2, ey, 4, 8, pal.plateD)
      s.rect(ex - 1, ey + 1, 2, 5, pal.accent, 0.7)
    }
  }

  // 舱顶读卡器 / 输液杆
  s.thick(cx - podW * 0.5, podY, cx - podW * 0.7, podY - h * 0.16, 1.4, pal.plateD)
  s.ell(cx - podW * 0.7, podY - h * 0.17, w * 0.03, h * 0.03, pal.plate)
  s.px(cx - podW * 0.7, podY - h * 0.17, pal.accent)
  crest(s, cx + podW * 0.1, podY - h * 0.02, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 160)
  g1(P, cx + podW * 0.46, podY + podH * 0.4, w * 0.09, pal.accent, 0.55)
  return { x: cx - podW * 0.7, y: podY + podH * 0.1, s: w / 150 }
}

/* 原型 10 —— 广播尖塔（tb_rally_boss）：桁架塔 + 四层喇叭盘 + 底部三支脚 */
function broadcastSpire(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.44
  const atk = P.anim === 'attack'
  const by = bob(P, 1.2)
  const topY = g - h * 0.82 + by
  const botY = g - h * 0.2
  baseShadow(s, def, cx)

  // 三支外张支脚
  for (const [dx, sw] of [[-0.16, -4], [0, 0], [0.16, 4]]) {
    s.thick(cx + w * dx, botY, cx + w * (dx + 0.08 * Math.sign(dx || 1)), g - 3, 2, pal.plateD)
    s.px(cx + w * (dx + 0.08 * Math.sign(dx || 1)), g - 3, pal.accent, 0.5)
  }
  // 主桅杆
  s.thick(cx, botY, cx, topY, 2.2, pal.bodyD)
  s.thick(cx - 1, botY, cx - 1, topY, 0.9, pal.bodyL, 0.5)
  // 桁架交叉：随高度收窄
  for (let i = 0; i < 7; i++) {
    const t0 = i / 7
    const t1 = (i + 1) / 7
    const yy0 = botY + (topY - botY) * t0
    const yy1 = botY + (topY - botY) * t1
    const half0 = w * 0.14 * (1 - t0) + 2
    const half1 = w * 0.14 * (1 - t1) + 2
    s.line(cx - half0, yy0, cx + half1, yy1, pal.plate, 0.75)
    s.line(cx + half0, yy0, cx - half1, yy1, pal.plate, 0.55)
    s.line(cx - half0, yy0, cx + half0, yy0, pal.plateD, 0.8)
  }
  // 四层喇叭盘：越往上越小，交替朝向
  for (let i = 0; i < 4; i++) {
    const ly = botY + (topY - botY) * (0.2 + i * 0.18)
    const dir = i % 2 ? -1 : 1
    horn(s, cx + dir * 2, ly, w * (0.16 - i * 0.02), h * (0.045 - i * 0.006) + 3, pal.plate, pal.plateD, pal.accent)
    if (atk && i === 3) g1(P, cx + dir * w * 0.18, ly, w * 0.08, pal.accent, 0.8)
  }
  // 顶部航空灯
  s.disc(cx, topY, w * 0.028, pal.accent)
  s.disc(cx, topY, w * 0.012, PAL.white)
  g1(P, cx, topY, w * 0.07, pal.accent, 0.7)
  for (let i = 0; i < 3; i++) s.thick(cx, topY - 3, cx + (i - 1) * 7, topY - 10, 0.7, pal.plateD)
  // 塔身操作舱
  s.rect(cx - w * 0.09, botY + h * 0.06, w * 0.18, h * 0.08, pal.bodyD)
  s.rect(cx - w * 0.07, botY + h * 0.08, w * 0.14, 2.4, pal.accent, 0.8)
  crest(s, cx, topY - 4, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  core(s, P, cx, botY + h * 0.1, w * 0.025, pal.core, 0.8, P)
  return { x: cx - w * 0.18, y: botY + h * 0.03, s: w / 160 }
}

/* 原型 11 —— 双翼收割（tb_storm_reaper）：悬浮长袍 + 上折双翼 + 长柄镰 */
function twinWingReaper(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const hover = g - h * 0.06 + bob(P, 3)
  const shY = hover - h * 0.48
  const flap = atk ? 1 : Math.sin((P.i / 2) * TAU) * 0.45
  baseShadow(s, def, cx)

  // 双翼：高折角（V 形），翼尖超过头顶
  for (const dx of [-1, 1]) {
    const wx = cx + dx * w * 0.07
    const wy = shY + h * 0.08
    const span = w * (0.32 + flap * 0.04)
    const lift = h * (0.22 + flap * 0.1)
    s.poly(
      [
        [wx, wy],
        [wx + dx * span * 0.55, wy - lift],
        [wx + dx * span, wy - lift * 0.72],
        [wx + dx * span * 0.8, wy + h * 0.02],
        [wx + dx * span * 0.32, wy + h * 0.1],
      ],
      dx < 0 ? pal.bodyD : pal.body,
      0.95,
    )
    for (let k = 1; k <= 3; k++) {
      const t = k / 4
      s.line(wx, wy, wx + dx * span * t, wy - lift * (1 - t * 0.4), pal.plateD, 0.7)
    }
    s.line(wx, wy + h * 0.06, wx + dx * span, wy - lift * 0.72, pal.accent, 0.4)
  }
  // 长袍：下摆破布
  const hemY = hover
  for (let i = 0; i < 7; i++) {
    const ox = cx - w * 0.2 + i * w * 0.066
    const len = h * (0.05 + (i % 3) * 0.03) + Math.sin(P.i * 1.2 + i) * 2
    s.poly([[ox - w * 0.04, hemY - h * 0.1], [ox + w * 0.04, hemY - h * 0.1], [ox + Math.sin(P.i + i) * 3, hemY + len]], i % 2 ? pal.bodyD : pal.body)
  }
  s.poly([[cx - w * 0.2, hemY - h * 0.1], [cx - w * 0.14, shY + h * 0.04], [cx + w * 0.14, shY + h * 0.04], [cx + w * 0.2, hemY - h * 0.1]], pal.body)
  for (let i = 0; i < 3; i++) s.line(cx - w * 0.12 + i * w * 0.12, shY + h * 0.06, cx - w * 0.13 + i * w * 0.12, hemY - h * 0.12, pal.bodyD, 0.5)
  // 兜帽 + 双眼
  const hy = shY + h * 0.02
  s.poly([[cx - w * 0.11, hy], [cx - w * 0.08, hy - h * 0.1], [cx + w * 0.04, hy - h * 0.115], [cx + w * 0.12, hy + h * 0.01], [cx + w * 0.07, hy + h * 0.05]], pal.bodyD)
  s.px(cx - w * 0.005, hy - h * 0.05, pal.accent)
  s.px(cx + w * 0.05, hy - h * 0.052, pal.accent)
  g1(P, cx + w * 0.02, hy - h * 0.05, w * 0.05, pal.accent, 0.5)
  crest(s, cx + w * 0.02, hy - h * 0.11, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 150)
  // 长柄镰：从右手斜伸向前上，攻击时横扫
  const handX = cx + w * 0.15
  const handY = shY + h * 0.22
  const tipX = handX + w * (atk ? 0.26 : 0.2)
  const tipY = handY + h * (atk ? 0.02 : 0.06)
  s.thick(handX - w * 0.1, handY + h * 0.24, tipX, tipY, 1.4, pal.plateD)
  s.poly([[tipX, tipY], [tipX - w * 0.02, tipY + h * 0.13], [tipX + w * 0.1, tipY + h * 0.09], [tipX + w * 0.02, tipY + h * 0.03]], pal.plate)
  s.line(tipX + w * 0.02, tipY + h * 0.03, tipX + w * 0.1, tipY + h * 0.09, PAL.steelWhite, 0.6)
  if (atk) core(s, P, tipX + w * 0.05, tipY + h * 0.07, w * 0.04, pal.core, 1.2, P)
  return { x: cx - w * 0.16, y: shY + h * 0.3, s: w / 150 }
}

/* 原型 12 —— 酸池母体（tb_acid_mother）：宽腹囊 + 四条短肢 + 背部酸囊管 */
function acidMother(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const lp = legPhase(P)
  const wob = Math.sin((P.i / (P.anim === 'move' ? 3 : 2)) * TAU) * w * 0.012
  const bodyY = g - h * 0.34 + bob(P, 2)
  baseShadow(s, def, cx)

  // 四条短肢：两侧各两条，膝外翻
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const hx = cx + side * w * 0.24 + wob
      const hy = bodyY + h * (0.08 + i * 0.04)
      const sw = (i % 2 ? lp : -lp) * 4
      bentLimb(s, hx, hy, hx + side * w * 0.12 + sw, g - 4 - Math.max(0, sw * 0.5), side * w * 0.07, 2.2, pal.bodyD, pal.body)
    }
  }
  // 腹囊：下垂的巨大囊袋
  s.ell(cx + wob, bodyY + h * 0.04, w * 0.3, h * 0.16, pal.bodyD)
  s.ell(cx + wob, bodyY - h * 0.04, w * 0.24, h * 0.13, pal.body)
  s.ell(cx + wob, bodyY - h * 0.1, w * 0.17, h * 0.1, pal.bodyD)
  // 囊内酸液透光（腹侧光斑）
  s.ell(cx + wob, bodyY + h * 0.08, w * 0.2, h * 0.07, pal.accent, 0.35)
  s.px(cx - w * 0.06 + wob, bodyY + h * 0.05, PAL.white, 0.4)
  g1(P, cx + wob, bodyY + h * 0.04, w * 0.22, pal.accent, 0.55)

  // 背部四条酸囊管（后上方向外弯）
  for (let i = 0; i < 4; i++) {
    const bx = cx - w * 0.16 + i * w * 0.1 + wob
    const by = bodyY - h * 0.16
    const ex = bx + (i - 1.5) * 3
    const ey = by - h * (0.21 + (i % 2) * 0.05) - (atk ? h * 0.03 : 0)
    bentLimb(s, bx, by, ex, ey, side2(i, w), 1.4, pal.bodyD, pal.body)
    s.disc(ex, ey, 2, pal.accent, 0.7)
  }
  // 头：低位小头 + 长舌
  const hdX = cx + w * 0.24 + wob
  const hdY = bodyY - h * 0.02
  s.ell(hdX, hdY, w * 0.09, h * 0.05, pal.body)
  s.ell(hdX + w * 0.02, hdY + h * 0.02, w * 0.05, h * 0.02, PAL.bloodDark)
  if (atk) s.thick(hdX + w * 0.02, hdY + h * 0.025, hdX + w * 0.14, hdY + h * 0.06, 1, pal.accent)
  s.px(hdX + w * 0.02, hdY - h * 0.02, pal.accent)
  s.px(hdX + w * 0.02, hdY - h * 0.02, PAL.white, 0.6)
  crest(s, hdX - 2, hdY - h * 0.04, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 160)
  // 滴落的酸
  for (let i = 0; i < 5; i++) {
    const dx = cx - w * 0.2 + i * w * 0.1
    s.thick(dx, bodyY + h * 0.13, dx, g - h * 0.04, 1, pal.accent, 0.35)
  }
  core(s, P, cx + wob, bodyY - h * 0.02, w * (atk ? 0.045 : 0.03), pal.core, 0.8, P)
  return { x: cx - w * 0.24, y: bodyY - h * 0.1, s: w / 150 }
}
function side2(i, w) {
  return (i % 2 ? 1 : -1) * w * 0.04
}

/* 原型 13 —— 盘根树母（tb_rot_queen）：板根底座 + 树干 + 根冠，冠中藏着子宫 */
function rootTree(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const by = bob(P, 1.4)
  const trunkTop = g - h * 0.64 + by
  baseShadow(s, def, cx)

  // 板根：六条外扩根
  for (let i = 0; i < 6; i++) {
    const dx = i < 3 ? -1 : 1
    const k = i % 3
    const x0 = cx + dx * w * (0.04 + k * 0.07)
    s.poly(
      [
        [x0 - w * 0.035, g],
        [x0 + w * 0.03, g],
        [cx + dx * w * (0.12 + k * 0.05), g - h * (0.12 + k * 0.03)],
        [cx + dx * w * (0.06 + k * 0.04), g - h * 0.05],
      ],
      k % 2 ? pal.bodyD : pal.body,
    )
    s.line(x0, g, cx + dx * w * (0.1 + k * 0.05), g - h * 0.16, pal.bodyL, 0.25)
  }
  // 树干：上粗下细，带瘤节
  s.poly(
    [
      [cx - w * 0.2, g - h * 0.08],
      [cx - w * 0.11, trunkTop],
      [cx + w * 0.12, trunkTop],
      [cx + w * 0.21, g - h * 0.08],
    ],
    pal.body,
  )
  s.poly(
    [
      [cx - w * 0.08, g - h * 0.1],
      [cx - w * 0.05, trunkTop + h * 0.02],
      [cx + w * 0.06, trunkTop + h * 0.02],
      [cx + w * 0.09, g - h * 0.1],
    ],
    pal.bodyD,
  )
  for (let i = 0; i < 4; i++) {
    const yy = g - h * 0.14 - i * h * 0.1
    s.disc(cx + (i % 2 ? 1 : -1) * w * 0.12, yy, w * 0.03, pal.bodyD)
    s.px(cx + (i % 2 ? 1 : -1) * w * 0.12, yy, pal.trim, 0.6)
  }
  // 树冠：根须向上翻卷成冠
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI
    const ax = cx + Math.cos(a) * w * 0.24
    const ay = trunkTop - h * 0.02 + Math.sin(a) * h * 0.04
    const tipX = cx + Math.cos(a) * w * (atk ? 0.4 : 0.34)
    const tipY = trunkTop - h * (atk ? 0.16 : 0.1) + Math.sin(a) * h * 0.05
    bentLimb(s, cx, trunkTop - h * 0.03, tipX, tipY, Math.cos(a) * w * 0.06, 1.4, i % 2 ? pal.bodyD : pal.body, pal.bodyD)
    s.px(tipX, tipY, pal.accent, 0.4)
    void ax, ay
  }
  // 冠中子宫（裂口 + 眼）
  const coreX = cx + w * 0.02
  const coreY = trunkTop - h * 0.06
  s.ell(coreX, coreY, w * 0.11, h * 0.06, pal.bodyD)
  s.ell(coreX, coreY, w * 0.075, h * 0.04, PAL.bloodDark)
  for (let i = 0; i < 5; i++) {
    const tx = coreX - w * 0.06 + i * w * 0.03
    s.poly([[tx, coreY], [tx + 1.6, coreY + h * 0.02], [tx + 3.2, coreY]], PAL.bone)
  }
  core(s, P, coreX, coreY, w * (atk ? 0.07 : 0.04), pal.core, atk ? 1.5 : 0.9, P)
  // 两侧垂枝（结果串）
  for (const dx of [-1, 1]) {
    s.thick(cx + dx * w * 0.12, trunkTop + h * 0.02, cx + dx * w * 0.28, trunkTop + h * 0.1, 0.9, pal.bodyD)
    s.disc(cx + dx * w * 0.28, trunkTop + h * 0.12, w * 0.022, pal.accent, 0.7)
  }
  crest(s, coreX, trunkTop - h * 0.12, cfg.crest, pal.bodyL, pal.bodyD, pal.accent, w / 160)
  return { x: cx - w * 0.24, y: trunkTop + h * 0.06, s: w / 160 }
}

/* 原型 14 —— 钟形圣骸（tb_bell_bishop）：整只身体是一只倒扣钟，下缘悬布，钟舌触地 */
function bellHusk(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const by = bob(P, 1.6)
  const bellTop = g - h * 0.8 + by
  const rimY = g - h * 0.22
  const swing = Math.sin((P.i / (P.anim === 'move' ? 3 : 2)) * TAU) * 0.14
  baseShadow(s, def, cx)

  // 钟体：上窄下宽的弧壳
  s.poly(
    [
      [cx - w * 0.05, bellTop],
      [cx + w * 0.05, bellTop],
      [cx + w * 0.12, bellTop + h * 0.08],
      [cx + w * 0.24, rimY - h * 0.02],
      [cx + w * 0.3, rimY],
      [cx - w * 0.3, rimY],
      [cx - w * 0.24, rimY - h * 0.02],
      [cx - w * 0.12, bellTop + h * 0.08],
    ],
    pal.bodyD,
  )
  s.poly(
    [
      [cx - w * 0.04, bellTop + 2],
      [cx + w * 0.02, bellTop + 2],
      [cx + w * 0.09, bellTop + h * 0.1],
      [cx + w * 0.19, rimY - h * 0.03],
      [cx + w * 0.24, rimY - 3],
      [cx - w * 0.24, rimY - 3],
      [cx - w * 0.18, rimY - h * 0.03],
      [cx - w * 0.08, bellTop + h * 0.1],
    ],
    pal.body,
  )
  // 钟面竖纹 + 高光
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const bx = cx - w * 0.19 + t * w * 0.38
    s.line(bx, bellTop + h * 0.12, bx * 1.0 + (bx - cx) * 0.35, rimY - 4, pal.bodyD, 0.5)
  }
  s.line(cx - w * 0.18, rimY - h * 0.2, cx - w * 0.07, bellTop + h * 0.1, pal.bodyL, 0.35)
  // 钟口缘 + 铭文
  s.rect(cx - w * 0.3, rimY - 3, w * 0.6, 5, pal.plateD)
  s.rect(cx - w * 0.3, rimY - 3, w * 0.6, 1.4, pal.plate)
  for (let i = 0; i < 7; i++) s.px(cx - w * 0.24 + i * w * 0.08, rimY - 1, pal.accent, 0.5)
  // 钟面雕纹：主教冠形
  s.poly([[cx - w * 0.07, rimY - h * 0.12], [cx, rimY - h * 0.22], [cx + w * 0.07, rimY - h * 0.12], [cx, rimY - h * 0.09]], pal.trim)
  s.px(cx, rimY - h * 0.15, pal.accent)
  // 钟摆 / 钟舌：垂到地面，攻击时摆起
  const clapX = cx + w * 0.1 * swing * 3 + (atk ? w * 0.16 : 0)
  const clapY = g - h * 0.08
  s.thick(cx, rimY + h * 0.14, clapX, clapY, 2, pal.plateD)
  s.ell(clapX, clapY, w * 0.055, h * 0.05, pal.plate)
  s.ell(clapX, clapY, w * 0.03, h * 0.03, pal.bodyL, 0.6)
  if (atk) g1(P, clapX, clapY, w * 0.1, pal.accent, 0.8)
  // 下缘垂布
  for (let i = 0; i < 6; i++) {
    const ox = cx - w * 0.24 + i * w * 0.09
    streamer(s, ox, rimY + 4, h * (0.13 + (i % 2) * 0.03), w * 0.03, Math.sin(P.i * 0.9 + i) * 3, pal.bodyD, pal.plateD)
  }
  // 顶部小十字
  s.rect(cx - 1, bellTop - h * 0.07, 2, h * 0.07, pal.plate)
  s.rect(cx - w * 0.035, bellTop - h * 0.05, w * 0.07, 2, pal.plate)
  crest(s, cx, bellTop - h * 0.075, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  core(s, P, cx, rimY - h * 0.16, w * (atk ? 0.05 : 0.03), pal.core, 0.9, P)
  return { x: cx - w * 0.26, y: rimY + h * 0.02, s: w / 150 }
}

/* 原型 15 —— 双核裂变（tb_prime_core）：上下两颗球核 + 中轴束带 + 四根支撑棘 */
function splitCore(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const by = bob(P, 2)
  const midY = g - h * 0.48 + by
  const R = w * 0.16
  baseShadow(s, def, cx)

  // 四根支撑棘（八字撑地）
  for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) {
    const ox = cx + dx * R * 0.8
    const oy = midY + (dy ? R * 0.7 : -R * 0.4)
    const ex = cx + dx * (R * 1.8 + dy * R * 0.3)
    const ey = g - 3
    bentLimb(s, ox, oy, ex, ey, dx * w * 0.07, 1.6, pal.plateD, pal.bodyD)
    s.disc(ex, ey, 1.6, pal.accent, 0.5)
  }
  // 中轴束带
  s.rect(cx - R * 0.34, midY - R * 1.5, R * 0.68, R * 3, pal.bodyD)
  s.rect(cx - R * 0.24, midY - R * 1.5, R * 0.48, R * 3, pal.body)
  for (let i = 0; i < 5; i++) s.rect(cx - R * 0.4, midY - R * 1.2 + i * R * 0.6, R * 0.8, 1.4, pal.plateD)
  // 上核（亮） / 下核（暗），攻击时两核拉开
  const gap = atk ? R * 1.1 : R * 0.72
  for (const [dy, c] of [[-1, pal.body], [1, pal.bodyD]]) {
    const cy = midY + dy * gap
    s.ell(cx, cy, R * 0.78, R * 0.74, c)
    s.ell(cx - R * 0.2, cy - R * 0.2, R * 0.4, R * 0.3, pal.bodyL, 0.4)
    // 核壳上的齿环
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + dy * 0.2
      s.px(cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.66, pal.plate)
    }
  }
  // 两核之间的电弧
  for (let i = 0; i < 4; i++) {
    const t = i / 3
    s.line(cx - R * 0.5 + t * R, midY - gap + R * 0.6, cx + R * 0.4 - t * R * 0.7, midY + gap - R * 0.6, pal.accent, 0.5)
  }
  core(s, P, cx, midY - gap, R * (atk ? 0.4 : 0.3), pal.core, atk ? 1.6 : 1.1, P)
  core(s, P, cx, midY + gap, R * 0.24, pal.accent, 0.8, P)
  // 顶部冠饰 / 侧面小推进器
  crest(s, cx, midY - gap - R * 0.8, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  for (const dx of [-1, 1]) {
    s.rect(cx + dx * R * 1.15 - 2, midY - 4, 4, 8, pal.plateD)
    s.px(cx + dx * R * 1.15, midY + 4, pal.accent, 0.6)
  }
  return { x: cx - R, y: midY, s: w / 150 }
}

/* 原型 16 —— 蜈蚣引擎（tb_zero_strain）：横向多节躯干 + 两侧成排步足 + 尾部分节 */
function centipedeEngine(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.48
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const bodyY = g - h * 0.44 + bob(P, 1.4)
  const rnd = cfg.rng
  baseShadow(s, def, cx)

  // 两侧各 7 条步足（越靠后越长）
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6
      const ox = cx - w * 0.26 + t * w * 0.5
      const sw = Math.sin(i * 1.5 + (side > 0 ? 0.6 : 0)) * lp * 5
      const footX = ox + side * w * (0.13 + t * 0.03) + sw
      const footY = g - 3 - Math.max(0, Math.cos(i * 1.5) * lp * 3)
      bentLimb(s, ox, bodyY + h * 0.02, footX, footY, side * w * 0.05, 1.4, i % 2 ? pal.bodyD : pal.plateD, pal.body)
    }
  }
  // 分节躯干：由前到后渐宽再收尖
  const pts = segmentBody(s, cx - w * 0.3, bodyY + h * 0.02, cx + w * 0.3, bodyY - h * 0.04, 8, w * 0.07, h * 0.075, pal.body, pal.bodyD, pal.bodyL)
  // 背脊甲片（每节一块亮片）
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]
    s.poly([[px - w * 0.04, py - h * 0.03], [px, py - h * 0.06], [px + w * 0.045, py - h * 0.025], [px, py + h * 0.01]], pal.plate, 0.9)
    s.px(px, py - h * 0.05, pal.accent, 0.5)
  }
  // 头：三对复眼 + 上颚
  const hdX = cx + w * 0.32
  const hdY = bodyY - h * 0.05
  s.poly([[hdX - w * 0.05, hdY - h * 0.03], [hdX + w * 0.09, hdY - h * 0.01], [hdX + w * 0.06, hdY + h * 0.05], [hdX - w * 0.04, hdY + h * 0.04]], pal.bodyD)
  for (let i = 0; i < 3; i++) {
    s.disc(hdX + w * 0.01 + i * 5, hdY - h * 0.005 + (i % 2) * 4, 2.2, pal.accent, 0.9)
    s.px(hdX + w * 0.01 + i * 5, hdY - 1, PAL.white, 0.5)
  }
  if (atk) {
    s.thick(hdX + w * 0.05, hdY + h * 0.02, hdX + w * 0.12, hdY + h * 0.06, 0.9, PAL.bone)
    s.thick(hdX + w * 0.05, hdY + h * 0.02, hdX + w * 0.12, hdY - h * 0.02, 0.9, PAL.bone)
  }
  // 尾：上翘双叉
  const [tx, ty] = pts[0]
  s.thick(tx, ty, tx - w * 0.1, ty - h * 0.2 + Math.sin(P.i) * 2, 1.4, pal.bodyD)
  s.thick(tx - w * 0.1, ty - h * 0.2, tx - w * 0.16, ty - h * 0.08, 0.9, pal.plate)
  s.thick(tx - w * 0.1, ty - h * 0.2, tx - w * 0.15, ty - h * 0.3, 0.9, pal.plate)
  s.px(tx - w * 0.16, ty - h * 0.06, pal.accent)
  crest(s, hdX, hdY - h * 0.04, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 160)
  // 背上的散热孔
  for (let i = 0; i < 5; i++) s.px(cx - w * 0.2 + i * w * 0.08 + rnd() * 3, bodyY - h * 0.11, pal.plate, 0.7)
  core(s, P, cx + w * 0.12, bodyY - h * 0.06, w * (atk ? 0.035 : 0.024), pal.core, 0.8, P)
  return { x: cx - w * 0.24, y: bodyY - h * 0.1, s: w / 160 }
}

/* 原型 17 —— 原生脑巢（tb_proto_mind）：外露脑叶 + 蛛网状神经腿 + 无头 */
function brainNest(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const by = bob(P, 1.8)
  const brainY = g - h * 0.55 + by
  const R = w * 0.23
  baseShadow(s, def, cx)

  // 神经腿：八条细线从脑下垂向四周落地
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 0.15 + (i / 7) * Math.PI * 0.7
    const sx = cx + Math.cos(a) * R * 0.6 * (i % 2 ? 1 : -1) * 0.6
    const sy = brainY + h * 0.08
    const ex = cx + (i / 7 - 0.5) * w * 0.62 + Math.sin(P.i * 0.8 + i) * 3
    const ey = g - 3
    s.thick(sx, sy, ex, ey, 0.9, pal.bodyD)
    s.px(ex, ey, pal.accent, 0.4)
  }
  // 脑叶：三团叠合
  s.ell(cx - R * 0.3, brainY - R * 0.1, R * 0.62, R * 0.5, pal.bodyD)
  s.ell(cx + R * 0.28, brainY - R * 0.15, R * 0.6, R * 0.48, pal.bodyD)
  s.ell(cx, brainY - R * 0.3, R * 0.72, R * 0.5, pal.body)
  s.ell(cx, brainY - R * 0.05, R * 0.8, R * 0.5, pal.body)
  // 脑沟
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3
    s.line(cx, brainY - R * 0.2, cx + Math.cos(a) * R * 0.75, brainY - R * 0.2 + Math.sin(a) * R * 0.42, pal.bodyL, 0.3)
  }
  s.line(cx - R * 0.05, brainY - R * 0.75, cx + R * 0.12, brainY - R * 0.05, pal.bodyD, 0.5)
  // 脑干 / 脊索（垂到地面）
  s.thick(cx, brainY + R * 0.4, cx + w * 0.03, g - h * 0.12, 2.4, pal.plateD)
  for (let i = 0; i < 4; i++) s.rect(cx - 2, brainY + R * 0.5 + i * h * 0.06, 4 + (i % 2) * 2, 2, pal.plate)
  // 神经节小灯
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.1 + (i / 4) * Math.PI * 0.8
    s.px(cx + Math.cos(a) * R * 0.85, brainY - R * 0.3 - Math.sin(a) * R * 0.5, pal.accent, 0.7)
  }
  core(s, P, cx, brainY - R * 0.25, R * (atk ? 0.5 : 0.34), pal.core, atk ? 1.5 : 1, P)
  // 悬浮培养液滴
  for (let i = 0; i < 4; i++) s.px(cx - w * 0.3 + i * w * 0.18, brainY + R * 0.6 + Math.sin(P.i + i) * 3, pal.accent, 0.3)
  crest(s, cx, brainY - R * 0.85, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  return { x: cx - w * 0.26, y: brainY + R * 0.3, s: w / 170 }
}

/* 原型 18 —— 浮游眼球（tb_observer / tb_gravity_eye）：单眼主体 + 眼柄环带 + 下悬触须 */
function floatingEye(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const by = bob(P, 2.5)
  const eyeY = g - h * 0.6 + by
  const R = w * 0.24
  baseShadow(s, def, cx)

  // 下悬触须（4 条，长短不一）
  for (let i = 0; i < 4; i++) {
    const ox = cx - w * 0.16 + i * w * 0.105
    const sway = Math.sin(P.i * 1.2 + i * 2) * 3
    s.thick(ox, eyeY + R * 0.6, ox + sway, eyeY + R + h * 0.1, 1.4, pal.bodyD)
    s.thick(ox + sway, eyeY + R + h * 0.1, ox + sway * 1.6, g - h * 0.05, 0.9, pal.plateD)
    s.px(ox + sway * 1.6, g - h * 0.05, pal.accent, 0.5)
  }
  // 眼白：分层椭圆（上亮下暗）
  s.ell(cx, eyeY, R, R * 0.9, pal.bodyD)
  s.ell(cx, eyeY, R * 0.9, R * 0.8, pal.body)
  s.ell(cx - R * 0.16, eyeY - R * 0.14, R * 0.6, R * 0.52, pal.bodyL, 0.35)
  // 虹膜 + 瞳孔（朝 +x 偏）
  const ix = cx + R * 0.24
  const iy = eyeY - R * 0.04
  const ir = R * (atk ? 0.46 : 0.4)
  s.disc(ix, iy, ir, pal.accent)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU
    s.line(ix, iy, ix + Math.cos(a) * ir * 0.86, iy + Math.sin(a) * ir * 0.86, pal.bodyD, 0.5)
  }
  s.disc(ix, iy, ir * 0.52, PAL.void)
  s.px(ix - ir * 0.3, iy - ir * 0.3, PAL.white, 0.9)
  core(s, P, ix, iy, ir * (atk ? 1.1 : 0.8), pal.core, atk ? 1.4 : 0.9, P)
  // 眼周钳制环：三片金属弧
  for (let i = 0; i < 3; i++) {
    const a = -0.5 + i * 2.2
    arcOf(s, cx, eyeY, R * 1.06, R * 0.98, 1.6, pal.plateD, a, a + 1.4, 8)
  }
  // 眼柄 / 顶部冠
  s.thick(cx, eyeY - R * 0.9, cx - w * 0.03, eyeY - R * 1.35, 1.8, pal.plateD)
  s.disc(cx - w * 0.03, eyeY - R * 1.4, w * 0.026, pal.plate)
  s.px(cx - w * 0.03, eyeY - R * 1.4, pal.accent)
  crest(s, cx, eyeY - R * 0.94, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 180)
  return { x: cx - R, y: eyeY + R * 0.3, s: w / 170 }
}

/* 原型 19 —— 铁履指挥（tb_iron_colonel / tb_bunker_commander）：履带底盘 + 指挥塔 + 半身舱口 */
function commanderTread(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.45
  const atk = P.anim === 'attack'
  const shift = P.anim === 'move' ? P.i * 4 : 0
  const trH = h * 0.2
  const trY = g - trH
  const trW = w * 0.62
  const trX = cx - trW / 2
  baseShadow(s, def, cx)

  // 履带：外框 + 负重轮 + 齿纹
  s.ell(cx, trY + trH / 2, trW * 0.5, trH * 0.6, pal.bodyD)
  s.rect(trX + 2, trY + 2, trW - 4, trH - 4, pal.bodyD)
  for (let i = 0; i < 6; i++) {
    const wx = trX + 8 + (i / 5) * (trW - 16)
    s.disc(wx, trY + trH / 2, trH * 0.3, pal.plateD)
    s.disc(wx, trY + trH / 2, trH * 0.11, pal.plate)
  }
  for (let i = 0; i < 12; i++) {
    const tx = trX + 3 + ((i * 9 + shift) % (trW - 6))
    s.rect(tx, trY + 1, 2, 2, pal.plate)
    s.rect(tx, trY + trH - 3, 2, 2, pal.plate)
  }
  // 车体：前倾装甲盒
  const hullY = trY - h * 0.26
  s.poly(
    [
      [trX + 2, trY + 2],
      [trX + w * 0.06, hullY],
      [trX + trW - w * 0.12, hullY],
      [trX + trW - 2, trY + 2],
    ],
    pal.body,
  )
  s.line(trX + w * 0.06, hullY, trX + trW - w * 0.12, hullY, pal.bodyL, 0.7)
  s.rect(trX + 4, hullY + h * 0.06, trW - 8, h * 0.06, pal.plateD)
  rivets(s, cfg.rng, trX + 8, hullY + h * 0.08, trW - 16, 9, pal.plate)
  // 指挥塔 + 半身舱口
  const tuX = cx + w * 0.03
  const tuY = hullY - h * 0.14
  s.rect(tuX - w * 0.11, tuY, w * 0.22, h * 0.16, pal.plateD)
  s.rect(tuX - w * 0.09, tuY + 2, w * 0.18, h * 0.13, pal.body)
  // 舱口里的上校半身
  s.ell(tuX, tuY + h * 0.04, w * 0.045, h * 0.035, pal.bodyD)
  s.rect(tuX - w * 0.04, tuY - h * 0.005, w * 0.09, 2.2, pal.accent)
  crest(s, tuX, tuY - h * 0.01, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  // 顶置小炮 + 天线
  s.rect(tuX + w * 0.05, tuY + h * 0.04, w * 0.2, 4, pal.bodyD)
  s.rect(tuX + w * 0.05, tuY + h * 0.04, w * 0.2, 1, pal.bodyL, 0.6)
  if (atk) core(s, P, tuX + w * 0.25, tuY + h * 0.05, w * 0.04, pal.core, 1.4, P)
  s.thick(tuX - w * 0.08, tuY, tuX - w * 0.12, tuY - h * 0.18, 0.9, pal.plateD)
  s.px(tuX - w * 0.12, tuY - h * 0.18, pal.accent)
  // 车头挡泥板 + 灯
  s.poly([[trX + trW - 2, trY + 1], [trX + trW + w * 0.04, trY - h * 0.04], [trX + trW - 2, hullY + h * 0.08]], pal.plateD)
  orb(s, trX + 6, hullY + h * 0.02, w * 0.017, pal.accent, pal.bodyD, PAL.white)
  core(s, P, cx, hullY + h * 0.08, w * 0.026, pal.core, 0.8, P)
  return { x: cx - trW * 0.3, y: hullY, s: w / 160 }
}

/* 原型 20 —— 装配巨械（tb_assembly_overseer）：四足龙门 + 头顶吊梁 + 双锤臂 */
function assemblyHulk(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const beamY = g - h * 0.72 + bob(P, 1.6)
  baseShadow(s, def, cx)

  // 四足：两对液压腿，膝外翻
  for (const [dx, sw] of [[-0.22, -lp], [-0.08, lp], [0.1, -lp], [0.24, lp]]) {
    const x = cx + w * dx
    const kneeX = x + sw * 4
    s.thick(x, beamY + h * 0.16, kneeX, g - h * 0.2, w * 0.04, sw < 0 ? pal.bodyD : pal.body)
    s.disc(kneeX, g - h * 0.2, w * 0.042, pal.plateD)
    s.thick(kneeX, g - h * 0.2, kneeX - sw * 2, g - 4, w * 0.032, pal.plate)
    s.rect(kneeX - sw * 2 - w * 0.045, g - 5, w * 0.09, 4, pal.plateD)
  }
  // 龙门横梁 + 中央机箱
  s.rect(cx - w * 0.3, beamY, w * 0.6, h * 0.06, pal.plateD)
  s.rect(cx - w * 0.3, beamY, w * 0.6, 2, pal.bodyL)
  s.poly([[cx - w * 0.14, beamY + h * 0.06], [cx - w * 0.1, beamY + h * 0.22], [cx + w * 0.12, beamY + h * 0.22], [cx + w * 0.16, beamY + h * 0.06]], pal.body)
  s.rect(cx - w * 0.05, beamY + h * 0.1, w * 0.1, h * 0.06, pal.accent, 0.6)
  core(s, P, cx, beamY + h * 0.13, w * (atk ? 0.04 : 0.026), pal.core, 0.9, P)
  // 吊梁：向 +x 悬出，挂装配钩
  s.thick(cx + w * 0.06, beamY, cx + w * 0.28, beamY, 2.4, pal.plateD)
  chain(s, cx + w * 0.26, beamY, cx + w * 0.3, beamY + h * 0.18, 7, pal.plate, pal.bodyD)
  s.thick(cx + w * 0.27, beamY + h * 0.18, cx + w * 0.3, beamY + h * 0.23, 1.4, pal.plate)
  s.thick(cx + w * 0.3, beamY + h * 0.23, cx + w * 0.34, beamY + h * 0.2, 1.2, pal.plate)
  // 双锤臂：左右各一，攻击时抬起
  for (const dx of [-1, 1]) {
    const sx = cx + dx * w * 0.26
    const sy = beamY + h * 0.14
    const hx = sx + dx * w * 0.1
    const hy = sy + h * (atk ? -0.12 : 0.16)
    s.thick(sx, sy, hx, hy, 4, pal.bodyD)
    s.rect(hx - 5, hy - 5, 10, 10, pal.plate)
    s.px(hx, hy, pal.accent)
    if (atk) g1(P, hx, hy, w * 0.06, pal.accent, 0.7)
  }
  crest(s, cx + w * 0.02, beamY - h * 0.01, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  return { x: cx + w * 0.18, y: beamY + h * 0.1, s: w / 160 }
}

/* 原型 21 —— 轨道梭（tb_orbit_judge）：细长梭体 + 双前叉 + 背鳍，无腿悬浮 */
function orbitLance(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const hover = g - h * 0.52 + bob(P, 3.5)
  const tilt = P.anim === 'move' ? 0.12 : Math.sin(P.i * 0.8) * 0.05
  baseShadow(s, def, cx)

  // 尾部推进器 + 尾焰
  s.poly([[cx - w * 0.34, hover - h * 0.03], [cx - w * 0.2, hover - h * 0.09], [cx - w * 0.2, hover + h * 0.09], [cx - w * 0.34, hover + h * 0.03]], pal.bodyD)
  s.rect(cx - w * 0.37, hover - 4, 4, 8, pal.plateD)
  s.px(cx - w * 0.4, hover, pal.accent)
  if (P.anim === 'move') for (let i = 0; i < 4; i++) s.px(cx - w * 0.42 - i * 3, hover + (i % 2), pal.accent, 0.5)
  // 梭体：长六边
  s.poly(
    [
      [cx - w * 0.24, hover - h * 0.055],
      [cx + w * 0.14, hover - h * 0.08 - tilt * 8],
      [cx + w * 0.34, hover - h * 0.01],
      [cx + w * 0.14, hover + h * 0.07 - tilt * 8],
      [cx - w * 0.24, hover + h * 0.055],
    ],
    pal.body,
  )
  s.line(cx - w * 0.2, hover - h * 0.04, cx + w * 0.3, hover - h * 0.02, pal.bodyL, 0.6)
  s.line(cx - w * 0.24, hover + h * 0.045, cx + w * 0.3, hover + h * 0.01, pal.bodyD, 0.7)
  // 背鳍（上折）
  s.poly([[cx - w * 0.1, hover - h * 0.055], [cx + w * 0.04, hover - h * 0.055], [cx - w * 0.02, hover - h * 0.22], [cx - w * 0.12, hover - h * 0.16]], pal.plate)
  s.line(cx - w * 0.06, hover - h * 0.06, cx - w * 0.02, hover - h * 0.21, pal.accent, 0.4)
  // 前双叉（裁决叉）
  for (const dy of [-1, 1]) {
    s.thick(cx + w * 0.3, hover, cx + w * 0.44, hover + dy * h * 0.09, 1.6, pal.plate)
    s.thick(cx + w * 0.44, hover + dy * h * 0.09, cx + w * 0.5, hover + dy * h * 0.04, 1.1, pal.plateD)
    s.px(cx + w * 0.5, hover + dy * h * 0.04, pal.accent)
  }
  // 侧翼稳定器
  for (const dx of [-1, 1]) {
    s.rect(cx + dx * w * 0.14 - 3, hover + h * 0.05, 6, h * 0.06, pal.plateD)
    s.px(cx + dx * w * 0.14, hover + h * 0.11, pal.accent, 0.7)
  }
  // 舷窗 / 裁决之眼
  const eyeX = cx + w * 0.16
  const eyeY = hover - h * 0.01
  s.disc(eyeX, eyeY, w * 0.055, pal.bodyD)
  s.disc(eyeX, eyeY, w * 0.036, pal.accent)
  s.disc(eyeX + 2, eyeY, w * 0.014, PAL.void)
  core(s, P, eyeX, eyeY, w * (atk ? 0.07 : 0.045), pal.core, atk ? 1.4 : 0.9, P)
  crest(s, cx - w * 0.06, hover - h * 0.09, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  for (let i = 0; i < 4; i++) s.px(cx - w * 0.26 + i * 6, hover + h * 0.03, pal.plate, 0.5)
  return { x: cx - w * 0.1, y: hover - h * 0.05, s: w / 170 }
}

/* 原型 22 —— 教鞭巨人（tb_schoolmaster）：粗柱双腿 + 背黑板 + 单手教鞭（区别于 08） */
function schoolGiant(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const hipY = g - h * 0.28 + bob(P, 1.4)
  const shY = hipY - h * 0.3
  baseShadow(s, def, cx)

  // 双腿：笔直粗柱 + 方靴
  for (const [dx, sw] of [[-0.12, -lp], [0.12, lp]]) {
    const x = cx + w * dx
    s.rect(x - w * 0.055, hipY, w * 0.11, g - hipY - 6, dx < 0 ? pal.bodyD : pal.body)
    s.rect(x - w * 0.07 + sw * 3, g - 7, w * 0.14, 7, pal.plateD)
    s.rect(x - w * 0.07 + sw * 3, g - 7, w * 0.14, 1.6, pal.plate)
  }
  // 躯干：直筒长袍（与 06 的斜肩不同）
  s.poly([[cx - w * 0.17, hipY + 2], [cx - w * 0.14, shY], [cx + w * 0.14, shY], [cx + w * 0.17, hipY + 2]], pal.body)
  s.rect(cx - w * 0.12, shY + h * 0.03, w * 0.24, h * 0.12, pal.plate)
  for (let i = 0; i < 4; i++) s.px(cx - w * 0.08 + i * w * 0.05, shY + h * 0.08, pal.accent, 0.5)
  // 背黑板：从肩后立起，超出头顶
  const bX = cx - w * 0.24
  s.poly([[bX, shY + h * 0.06], [bX - w * 0.04, shY + h * 0.06], [bX - w * 0.04, shY - h * 0.22], [bX, shY - h * 0.24]], pal.plateD)
  s.rect(bX - w * 0.035, shY - h * 0.22, w * 0.03, h * 0.26, pal.bodyD)
  s.line(bX - w * 0.03, shY - h * 0.16, bX - w * 0.005, shY - h * 0.12, PAL.paper, 0.5)
  s.line(bX - w * 0.03, shY - h * 0.1, bX - w * 0.005, shY - h * 0.14, PAL.paper, 0.4)
  // 头 + 眼镜
  const hx = cx
  const hy = shY - h * 0.055
  s.ell(hx, hy, w * 0.06, h * 0.042, pal.bodyD)
  s.rect(hx - w * 0.045, hy - 2, w * 0.09, 2.4, pal.plate)
  s.px(hx - w * 0.02, hy - 1, pal.accent)
  s.px(hx + w * 0.03, hy - 1, pal.accent)
  crest(s, hx, hy - h * 0.04, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 170)
  // 双臂：左手教鞭，右手戒尺
  s.thick(cx - w * 0.16, shY + h * 0.04, cx - w * 0.24, shY + h * 0.2, 2.6, pal.bodyD)
  s.thick(cx + w * 0.16, shY + h * 0.04, cx + w * 0.24, shY + h * 0.17 - (atk ? h * 0.1 : 0), 2.6, pal.body)
  s.thick(cx + w * 0.24, shY + h * 0.17 - (atk ? h * 0.1 : 0), cx + w * 0.42, shY + h * (atk ? 0.02 : 0.12), 0.9, pal.plate)
  s.px(cx + w * 0.42, shY + h * 0.12, pal.accent)
  if (atk) s.rect(cx - w * 0.3, shY + h * 0.14, w * 0.05, h * 0.1, pal.plate)
  core(s, P, cx, shY + h * 0.1, w * 0.026, pal.core, 0.8, P)
  return { x: cx - w * 0.28, y: shY + h * 0.02, s: w / 170 }
}

/* 原型 23 —— 书页亡魂（tb_librarian）：无躯干，漂浮翻开的书 + 页翼 + 锁链 */
function wraithTome(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const hover = g - h * 0.5 + bob(P, 2.6)
  const R = w * 0.22
  baseShadow(s, def, cx)
  // 摊开的书：两片斜页
  for (const dx of [-1, 1]) {
    s.poly([[cx, hover + h * 0.1], [cx + dx * R * 1.3, hover + h * (atk ? 0.02 : 0.12)], [cx + dx * R * 1.15, hover - h * 0.14], [cx, hover - h * 0.05]], dx < 0 ? pal.bodyD : PAL.paper)
    s.line(cx, hover - h * 0.04, cx + dx * R * 1.15, hover - h * 0.13, pal.plateD, 0.7)
  }
  // 页翼：散开的书页
  for (let i = 0; i < 5; i++) {
    const dx = i < 3 ? -1 : 1
    const t = i % 3
    const px = cx + dx * w * (0.16 + t * 0.1)
    const py = hover - h * (0.16 + t * 0.06)
    s.poly([[cx + dx * w * 0.08, hover - h * 0.03], [px, py], [px + dx * w * 0.05, py + h * 0.09], [cx + dx * w * 0.1, hover + h * 0.03]], atk ? PAL.paper : pal.plate, 0.9)
    s.line(cx + dx * w * 0.08, hover - h * 0.02, px, py, pal.plateD, 0.4)
  }
  // 书脊 / 锁链
  s.rect(cx - 3, hover - h * 0.05, 6, h * 0.16, pal.plateD)
  chain(s, cx, hover + h * 0.12, cx + w * 0.02, g - h * 0.06, 9, pal.plate, pal.bodyD)
  s.disc(cx + w * 0.02, g - h * 0.06, 3, pal.plate)
  // 书页间的脸
  const hy = hover - h * 0.02
  s.ell(cx, hy, w * 0.055, h * 0.045, pal.bodyD)
  s.px(cx - 5, hy - 2, pal.accent)
  s.px(cx + 4, hy - 2, pal.accent)
  g1(P, cx, hy - 2, w * 0.045, pal.accent, 0.5)
  crest(s, cx, hover - h * 0.19, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 180)
  core(s, P, cx, hover + h * 0.03, w * (atk ? 0.05 : 0.03), pal.core, 0.9, P)
  // 飘散字母般的碎屑
  for (let i = 0; i < 7; i++) s.px(cx - w * 0.28 + ((i * 0.09 + P.i * 0.02) % 0.56) * w, hover - h * 0.2 - (i % 3) * 5, PAL.paper, 0.35)
  return { x: cx - w * 0.22, y: hover + h * 0.02, s: w / 180 }
}

/* 原型 24 —— 讲学步行机（tb_professor）：鸟式三足 + 斜讲台躯 + 试管架背 */
function lecternWalker(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const bodyY = g - h * 0.44 + bob(P, 1.5)
  baseShadow(s, def, cx)
  // 三足：两前一后，反关节
  for (const [dx, sw, back] of [[-0.13, -lp, true], [0.11, lp, false], [0.28, -lp, false]]) {
    const x = cx + w * dx
    const kneeX = x + sw * 4
    s.thick(x, bodyY + h * 0.03, kneeX, g - h * 0.22, 1.8, back ? pal.bodyD : pal.body)
    s.disc(kneeX, g - h * 0.22, 2, pal.plateD)
    s.thick(kneeX, g - h * 0.22, kneeX + dx * w * 0.05, g - 3, 1.4, pal.plate)
    for (let k = 0; k < 3; k++) s.thick(kneeX + dx * w * 0.05, g - 3, kneeX + dx * w * 0.05 + (k - 1) * 4, g - 1, 0.7, pal.plateD)
  }
  // 斜讲台躯干
  s.poly([[cx - w * 0.2, bodyY + h * 0.08], [cx - w * 0.12, bodyY - h * 0.12], [cx + w * 0.16, bodyY - h * 0.2], [cx + w * 0.22, bodyY + h * 0.02]], pal.body)
  s.poly([[cx - w * 0.1, bodyY - h * 0.13], [cx + w * 0.15, bodyY - h * 0.2], [cx + w * 0.19, bodyY - h * 0.16], [cx - w * 0.06, bodyY - h * 0.08]], pal.plate)
  s.line(cx - w * 0.1, bodyY - h * 0.13, cx + w * 0.19, bodyY - h * 0.18, PAL.paper, 0.5)
  // 台面上的讲义
  s.rect(cx + w * 0.04, bodyY - h * 0.25, w * 0.12, h * 0.05, PAL.paper)
  s.line(cx + w * 0.05, bodyY - h * 0.23, cx + w * 0.14, bodyY - h * 0.23, pal.plateD, 0.7)
  // 试管架（背后三根玻璃管）
  for (let i = 0; i < 3; i++) {
    const tx = cx - w * 0.16 + i * w * 0.05
    tube(s, tx, bodyY - h * 0.3, 5, 12, mix(PAL.glass, pal.bodyD, 0.3), pal.plateD, i === 1 ? pal.accent : PAL.toxicGlow)
    s.rect(tx - 1, bodyY - h * 0.19, 7, 2, pal.plateD)
  }
  // 头：圆头 + 单片眼镜
  const hx = cx + w * 0.2
  const hy = bodyY - h * 0.24
  s.ell(hx, hy, w * 0.05, h * 0.04, pal.bodyD)
  s.disc(hx + 2, hy - 1, 2.6, pal.plate)
  s.px(hx + 2, hy - 1, pal.accent)
  crest(s, hx, hy - h * 0.04, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 180)
  // 夹着粉笔的手
  s.thick(cx + w * 0.16, bodyY - h * 0.05, cx + w * 0.26, bodyY + h * (atk ? 0.02 : 0.08), 1.6, pal.bodyD)
  s.rect(cx + w * 0.26, bodyY, 5, 2, PAL.paper)
  core(s, P, cx + w * 0.08, bodyY - h * 0.13, w * (atk ? 0.04 : 0.026), pal.core, 0.8, P)
  return { x: cx - w * 0.18, y: bodyY - h * 0.3, s: w / 180 }
}

/* 原型 25 —— 印刷压机（tb_paper_press）：门形机架 + 中央螺旋压板 + 两侧滚筒 */
function pressMachine(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const press = atk ? h * 0.08 : 0
  baseShadow(s, def, cx)
  // 底座
  s.rect(cx - w * 0.3, g - h * 0.08, w * 0.6, h * 0.08, pal.plateD)
  s.rect(cx - w * 0.3, g - h * 0.08, w * 0.6, 2, pal.plate)
  // 门形立柱（左右）
  for (const dx of [-1, 1]) {
    s.rect(cx + dx * w * 0.24 - w * 0.05, g - h * 0.78, w * 0.1, h * 0.7, pal.bodyD)
    s.rect(cx + dx * w * 0.24 - w * 0.05, g - h * 0.78, w * 0.1, 2, pal.bodyL)
    rivets(s, cfg.rng, cx + dx * w * 0.24 - w * 0.04, g - h * 0.6, w * 0.08, 4, pal.plate)
  }
  // 顶梁 + 大螺旋
  s.rect(cx - w * 0.3, g - h * 0.8, w * 0.6, h * 0.08, pal.body)
  s.rect(cx - w * 0.3, g - h * 0.8, w * 0.6, 2, pal.bodyL)
  s.rect(cx - 3, g - h * 0.74, 6, h * 0.3, pal.plateD)
  for (let i = 0; i < 7; i++) s.line(cx - 5, g - h * 0.72 + i * h * 0.04, cx + 5, g - h * 0.7 + i * h * 0.04, pal.plate, 0.8)
  // 压板
  s.rect(cx - w * 0.2, g - h * 0.4 + press, w * 0.4, h * 0.07, pal.plate)
  s.rect(cx - w * 0.2, g - h * 0.4 + press, w * 0.4, 2, PAL.steelWhite, 0.6)
  s.rect(cx - w * 0.17, g - h * 0.35 + press, w * 0.34, h * 0.012, PAL.paper, 0.8)
  // 压板下被压的纸胚
  s.rect(cx - w * 0.22, g - h * 0.1, w * 0.44, h * 0.02, PAL.paper)
  // 两侧滚筒（带轴）
  for (const dx of [-1, 1]) {
    const rx = cx + dx * w * 0.34
    s.disc(rx, g - h * 0.28, w * 0.055, pal.plateD)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + (P.anim === 'move' ? P.i * 0.4 : 0)
      s.line(rx, g - h * 0.28, rx + Math.cos(a) * w * 0.04, g - h * 0.28 + Math.sin(a) * w * 0.04, pal.plate, 0.7)
    }
    s.disc(rx, g - h * 0.28, w * 0.012, pal.accent, 0.8)
  }
  // 头：嵌在顶梁正中的印刷眼
  const hy = g - h * 0.87
  s.rect(cx - w * 0.11, hy - h * 0.04, w * 0.22, h * 0.055, pal.bodyD)
  s.rect(cx - w * 0.08, hy - h * 0.03, w * 0.16, 2, pal.accent)
  crest(s, cx, hy - h * 0.045, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 180)
  core(s, P, cx, g - h * 0.37 + press, w * (atk ? 0.055 : 0.035), pal.core, atk ? 1.4 : 0.9, P)
  // 侧排纸架
  for (let i = 0; i < 3; i++) s.rect(cx - w * 0.3 - 3, g - h * (0.15 + i * 0.04), w * 0.05, h * 0.02, PAL.paper, 0.9)
  return { x: cx + w * 0.2, y: g - h * 0.5, s: w / 170 }
}

/* 原型 26 —— 展柜守夜（tb_curator）：玻璃展柜躯 + 柜内标本 + 四根细足 */
function curatorCase(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const caseH = h * 0.56
  const caseW = w * 0.26
  const caseY = g - h * 0.2 - caseH + bob(P, 1.3)
  baseShadow(s, def, cx)
  // 四根细高足（展柜腿）
  for (const [dx, sw] of [[-0.24, -1], [-0.13, 1], [0.13, -1], [0.24, 1]]) {
    const x = cx + w * dx
    s.thick(x, g - h * 0.2, x + sw * 3, g - 3, 1.2, pal.plateD)
    s.disc(x + sw * 3, g - 3, 1.6, pal.plate)
  }
  // 柜座
  s.rect(cx - caseW * 0.9, g - h * 0.22, caseW * 1.8, h * 0.06, pal.plateD)
  s.rect(cx - caseW * 0.9, g - h * 0.22, caseW * 1.8, 2, pal.plate)
  // 柜体玻璃
  s.rect(cx - caseW, caseY, caseW * 2, caseH, pal.bodyD)
  s.rect(cx - caseW + 2, caseY + 2, caseW * 2 - 4, caseH - 4, mix(PAL.glass, PAL.void, 0.4))
  s.rect(cx - caseW + 2, caseY + 2, 2, caseH - 4, PAL.white, 0.4)
  // 柜内标本：一只蜷曲的骨架
  const spY = caseY + caseH * 0.5
  s.ell(cx - caseW * 0.1, spY, caseW * 0.45, caseH * 0.1, PAL.bone, 0.9)
  for (let i = 0; i < 4; i++) s.thick(cx - caseW * 0.5 + i * caseW * 0.22, spY - 2, cx - caseW * 0.42 + i * caseW * 0.22, spY + caseH * 0.16, 0.9, PAL.boneDark)
  s.ell(cx + caseW * 0.4, spY - caseH * 0.08, caseW * 0.2, caseH * 0.07, PAL.bone)
  s.px(cx + caseW * 0.45, spY - caseH * 0.09, pal.accent)
  // 柜顶铭牌 + 铜钉
  s.rect(cx - caseW * 0.62, caseY - h * 0.035, caseW * 1.24, h * 0.03, pal.plate)
  s.rect(cx - caseW * 0.4, caseY - h * 0.026, caseW * 0.8, 1.6, pal.accent, 0.8)
  crest(s, cx, caseY - h * 0.045, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 180)
  // 柜外的策展人残影（半身贴柜）
  s.ell(cx - caseW * 1.1, caseY + caseH * 0.35, w * 0.05, h * 0.05, pal.bodyD)
  s.px(cx - caseW * 1.1 + 2, caseY + caseH * 0.34, pal.accent)
  g1(P, cx + caseW * 0.45, spY - caseH * 0.09, w * 0.055, pal.accent, 0.5)
  core(s, P, cx, caseY + caseH * 0.4, w * (atk ? 0.05 : 0.03), pal.core, 0.8, P)
  return { x: cx - caseW, y: caseY + h * 0.02, s: w / 180 }
}

/* 原型 27 —— 牢门看守（tb_warden）：铁栅门盾 + 单一巨拳 + 拖链 */
function jailerGate(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.44
  const atk = P.anim === 'attack'
  const lp = legPhase(P)
  const hipY = g - h * 0.22 + bob(P, 1.2)
  const shY = hipY - h * 0.34
  baseShadow(s, def, cx)
  // 双腿：短粗
  for (const [dx, sw] of [[-0.1, -lp], [0.12, lp]]) {
    const x = cx + w * dx
    s.thick(x, hipY, x + sw * 3, g - h * 0.06, w * 0.065, dx < 0 ? pal.bodyD : pal.body)
    s.rect(x + sw * 3 - w * 0.06, g - 7, w * 0.12, 6, pal.plateD)
  }
  // 躯干：方肩
  s.poly([[cx - w * 0.16, hipY], [cx + w * 0.16, hipY], [cx + w * 0.2, shY], [cx - w * 0.18, shY]], pal.body)
  s.rect(cx - w * 0.12, shY + h * 0.03, w * 0.24, h * 0.09, pal.plateD)
  rivets(s, cfg.rng, cx - w * 0.1, shY + h * 0.05, w * 0.2, 5, pal.plate)
  // 头部：铁桶盔 + 单条视缝
  const hx = cx + w * 0.02
  const hy = shY - h * 0.055
  s.rect(hx - w * 0.07, hy - h * 0.045, w * 0.15, h * 0.055, pal.bodyD)
  s.rect(hx - w * 0.05, hy - h * 0.03, w * 0.11, 2.4, pal.accent)
  crest(s, hx, hy - h * 0.045, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 180)
  // 左臂拖着铁栅门（盾）
  const gw = w * 0.24
  const gh = h * 0.44
  const gx = cx - w * 0.3 - gw * 0.5
  const gy = shY + h * 0.06
  s.thick(cx - w * 0.2, shY + h * 0.1, gx + gw, gy + h * 0.02, 2.8, pal.bodyD)
  s.rect(gx, gy, gw, gh, pal.plateD)
  for (let i = 0; i < 4; i++) s.rect(gx + 3 + i * (gw / 4), gy + 2, 1.6, gh - 4, pal.plate)
  for (let i = 0; i < 3; i++) s.rect(gx + 1, gy + h * 0.05 + i * h * 0.13, gw - 2, 1.4, pal.plate)
  s.rect(gx, gy, gw, 2, pal.bodyL)
  s.px(gx + gw * 0.8, gy + gh * 0.7, pal.accent, 0.8)
  // 右巨拳（攻击时前伸）
  const fx = cx + w * (atk ? 0.42 : 0.3)
  const fy = shY + h * (atk ? 0.13 : 0.2)
  s.thick(cx + w * 0.18, shY + h * 0.06, fx, fy, 4, pal.body)
  s.disc(fx, fy, w * 0.055, pal.plate)
  if (atk) g1(P, fx, fy, w * 0.08, pal.accent, 0.7)
  // 脚踝拖链
  chain(s, cx + w * 0.14, g - 5, cx + w * 0.34, g - 2, 8, pal.plate, pal.bodyD)
  core(s, P, cx, shY + h * 0.1, w * (atk ? 0.04 : 0.026), pal.core, 0.9, P)
  return { x: gx + gw * 0.5, y: gy - h * 0.02, s: w / 180 }
}

/* 原型 28 —— 门房浮灵（tb_hotel_clerk）：悬浮制服空壳 + 分离手套 + 服务台悬浮 */
function clerkWisp(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const hover = g - h * 0.12 + bob(P, 3)
  const shY = hover - h * 0.56
  const sway = Math.sin((P.i / (P.anim === 'move' ? 3 : 2)) * TAU)
  baseShadow(s, def, cx)
  // 制服空壳：无腿，下摆散成雾
  s.poly([[cx - w * 0.18, hover - h * 0.02], [cx - w * 0.14, shY], [cx + w * 0.14, shY], [cx + w * 0.18, hover - h * 0.02]], pal.body)
  s.rect(cx - w * 0.03, shY + h * 0.03, w * 0.06, h * 0.26, pal.plate)
  for (let i = 0; i < 3; i++) s.px(cx - w * 0.02 + (i % 2) * w * 0.04, shY + h * 0.08 + i * h * 0.06, pal.plateD)
  // 下摆雾脚
  for (let i = 0; i < 5; i++) {
    const ox = cx - w * 0.16 + i * w * 0.08
    s.thick(ox, hover - h * 0.03, ox + sway * 3, hover + h * (0.04 + (i % 2) * 0.03), 1.2, pal.bodyD, 0.5)
  }
  // 领结 + 胸牌
  s.poly([[cx - w * 0.03, shY + h * 0.02], [cx, shY + h * 0.035], [cx + w * 0.03, shY + h * 0.02], [cx, shY + h * 0.05]], pal.accent)
  s.rect(cx + w * 0.06, shY + h * 0.08, w * 0.05, h * 0.02, PAL.paper, 0.9)
  // 空领口 + 无头，只有帽
  s.ell(cx, shY - h * 0.005, w * 0.075, h * 0.015, mix(PAL.void, pal.bodyD, 0.4))
  s.rect(cx - w * 0.08, shY - h * 0.045, w * 0.16, h * 0.04, pal.bodyD)
  s.rect(cx - w * 0.1, shY - h * 0.015, w * 0.2, 2, pal.plate)
  s.px(cx + w * 0.06, shY - h * 0.03, pal.accent)
  crest(s, cx, shY - h * 0.05, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  // 两只分离的白手套（浮在身侧，攻击时前推）
  for (const [dx, phase] of [[-1, 0], [1, 1]]) {
    const gx = cx + dx * w * (atk && dx > 0 ? 0.34 : 0.22)
    const gy = shY + h * (0.17 + Math.sin(P.i * 1.4 + phase) * 0.012)
    s.ell(gx, gy, w * 0.045, w * 0.04, PAL.bone)
    for (let i = 0; i < 3; i++) s.thick(gx + dx * 2, gy - 2 + i * 2, gx + dx * 7, gy - 3 + i * 3, 0.9, PAL.bone)
    s.px(gx, gy, pal.accent, 0.5)
  }
  // 悬浮服务台（下方）
  const dY = hover + h * 0.1
  s.rect(cx - w * 0.2, dY, w * 0.4, h * 0.035, pal.plateD)
  s.rect(cx - w * 0.2, dY, w * 0.4, 2, pal.plate)
  s.rect(cx - w * 0.05, dY - h * 0.02, w * 0.1, h * 0.025, pal.body)
  g1(P, cx, shY + h * 0.1, w * 0.05, pal.accent, 0.4)
  core(s, P, cx, shY + h * 0.2, w * (atk ? 0.04 : 0.024), pal.core, 0.7, P)
  return { x: cx - w * 0.18, y: shY + h * 0.1, s: w / 190 }
}

/* 原型 29 —— 码头吊装（tb_dockmaster）：门式吊机 + 单侧悬臂 + 吊着的船锚 */
function dockCrane(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.42
  const atk = P.anim === 'attack'
  const topY = g - h * 0.82 + bob(P, 1)
  baseShadow(s, def, cx)
  // 门架双腿 + 底轮
  for (const dx of [-1, 1]) {
    const x = cx + dx * w * 0.2
    s.thick(x, topY + h * 0.06, x + dx * w * 0.04, g - h * 0.08, 3.2, pal.bodyD)
    s.rect(x + dx * w * 0.04 - w * 0.06, g - h * 0.08, w * 0.12, h * 0.07, pal.plateD)
    s.disc(x + dx * w * 0.04, g - h * 0.01, w * 0.024, pal.plate)
  }
  // 门架横梁
  s.rect(cx - w * 0.3, topY, w * 0.6, h * 0.07, pal.body)
  s.rect(cx - w * 0.3, topY, w * 0.6, 2, pal.bodyL)
  rivets(s, cfg.rng, cx - w * 0.26, topY + h * 0.04, w * 0.52, 7, pal.plate)
  // 悬臂：向 +x 伸出，带三角斜撑
  s.thick(cx + w * 0.1, topY + h * 0.02, cx + w * 0.46, topY - h * 0.02, 2.6, pal.plateD)
  s.line(cx + w * 0.2, topY, cx + w * 0.4, topY - h * 0.15, pal.plateD, 0.9)
  s.line(cx + w * 0.24, topY, cx + w * 0.4, topY - h * 0.02, pal.plate, 0.6)
  // 吊索 + 船锚（随攻击摆动）
  const hookX = cx + w * 0.44
  const hookY = topY + h * (atk ? 0.24 : 0.36)
  chain(s, hookX, topY, hookX, hookY - h * 0.06, 10, pal.plate, pal.bodyD)
  s.thick(hookX - 4, hookY, hookX, hookY + 4, 1.2, pal.plate)
  s.thick(hookX, hookY + 4, hookX + 4, hookY, 1.2, pal.plate)
  s.poly([[hookX + 4, hookY], [hookX + w * 0.03, hookY + h * 0.08], [hookX + 2, hookY + h * 0.1]], pal.plateD)
  s.px(hookX + w * 0.02, hookY + h * 0.08, pal.accent)
  // 吊机驾驶舱（后侧）
  s.rect(cx - w * 0.14, topY + h * 0.1, w * 0.14, h * 0.09, pal.bodyD)
  s.rect(cx - w * 0.12, topY + h * 0.12, w * 0.1, h * 0.04, pal.accent, 0.7)
  crest(s, cx - w * 0.02, topY - h * 0.02, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 180)
  // 集装箱堆
  s.rect(cx + w * 0.24, g - h * 0.14, w * 0.16, h * 0.06, pal.plateD)
  s.rect(cx + w * 0.28, g - h * 0.2, w * 0.12, h * 0.06, pal.bodyD)
  core(s, P, cx - w * 0.06, topY + h * 0.13, w * (atk ? 0.04 : 0.025), pal.core, 0.8, P)
  return { x: hookX, y: hookY + h * 0.1, s: w / 170 }
}

/* 原型 30 —— 灯塔守望（tb_lighthouse_keeper）：锥形塔 + 顶部灯室 + 环绕回廊 */
function lighthouse(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const beamRot = (P.i / (P.anim === 'move' ? 3 : 2)) * TAU
  const by = bob(P, 1)
  const baseY = g - h * 0.04
  const towerTop = baseY - h * 0.62 + by
  baseShadow(s, def, cx)
  // 塔基岩台
  s.ell(cx, baseY - h * 0.03, w * 0.3, h * 0.05, pal.plateD)
  s.ell(cx, baseY - h * 0.02, w * 0.24, h * 0.035, pal.bodyD)
  // 锥形塔身（条纹）
  s.poly([[cx - w * 0.22, baseY - h * 0.04], [cx - w * 0.1, towerTop], [cx + w * 0.1, towerTop], [cx + w * 0.22, baseY - h * 0.04]], pal.body)
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5
    const t1 = (i + 1) / 5
    const y0 = baseY - h * 0.04 - (h * 0.58 * t0)
    const y1 = baseY - h * 0.04 - (h * 0.58 * t1)
    const h0 = w * 0.22 - t0 * w * 0.12
    const h1 = w * 0.22 - t1 * w * 0.12
    if (i % 2 === 0) s.poly([[cx - h0, y0], [cx + h0, y0], [cx + h1, y1], [cx - h1, y1]], pal.bodyD)
  }
  // 回廊
  s.rect(cx - w * 0.14, towerTop, w * 0.28, h * 0.03, pal.plateD)
  s.rect(cx - w * 0.16, towerTop - 2, w * 0.32, 2, pal.plate)
  // 灯室：玻璃柱 + 旋转光束
  const lY = towerTop - h * 0.12
  s.rect(cx - w * 0.11, lY, w * 0.22, h * 0.12, pal.plateD)
  s.rect(cx - w * 0.09, lY + 2, w * 0.18, h * 0.1, mix(PAL.glass, PAL.void, 0.25))
  for (let i = 0; i < 3; i++) s.rect(cx - w * 0.09 + i * w * 0.06, lY + 2, 1.4, h * 0.1, pal.plate)
  s.disc(cx, lY + h * 0.05, w * 0.045, pal.accent)
  s.disc(cx, lY + h * 0.05, w * 0.02, PAL.white)
  core(s, P, cx, lY + h * 0.05, w * (atk ? 0.13 : 0.09), pal.core, atk ? 1.6 : 1, P)
  // 光束（攻击时可见扇形）
  if (atk) {
    const dir = Math.cos(beamRot) > 0 ? 1 : -1
    s.poly([[cx, lY + h * 0.05], [cx + dir * w * 0.5, lY - h * 0.04], [cx + dir * w * 0.5, lY + h * 0.14]], pal.accent, 0.35)
  }
  // 塔顶
  s.poly([[cx - w * 0.12, lY], [cx, lY - h * 0.09], [cx + w * 0.12, lY]], pal.bodyD)
  s.px(cx, lY - h * 0.09, pal.accent)
  crest(s, cx, lY - h * 0.1, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  // 塔身门洞
  s.rect(cx - w * 0.04, baseY - h * 0.14, w * 0.08, h * 0.1, PAL.void)
  s.rect(cx - w * 0.05, baseY - h * 0.15, w * 0.1, 2, pal.plateD)
  return { x: cx - w * 0.2, y: baseY - h * 0.16, s: w / 190 }
}

/* 原型 31 —— 船坞骨架（tb_shipwright）：暴露的龙骨 + 外肋 + 半成形船首 */
function shipFrame(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const keelY = g - h * 0.34 + bob(P, 1.2)
  baseShadow(s, def, cx)
  // 龙骨（横向长梁，前段上翘成船首）
  s.poly([[cx - w * 0.42, keelY], [cx + w * 0.3, keelY], [cx + w * 0.46, keelY - h * 0.14], [cx + w * 0.42, keelY - h * 0.02], [cx - w * 0.42, keelY + h * 0.05]], pal.bodyD)
  s.line(cx - w * 0.4, keelY + 1, cx + w * 0.3, keelY + 1, pal.bodyL, 0.6)
  // 外肋：五根弧形肋骨
  for (let i = 0; i < 5; i++) {
    const rx = cx - w * 0.3 + i * w * 0.16
    const rh = h * (0.3 + i * 0.03)
    s.thick(rx, keelY, rx - w * 0.02, keelY - rh, 2.2, pal.plateD)
    s.thick(rx - w * 0.02, keelY - rh, rx + w * 0.08, keelY - rh * 0.86, 1.6, pal.plate)
    s.px(rx + w * 0.08, keelY - rh * 0.86, pal.accent, 0.5)
  }
  // 纵桁（两根长木）
  s.thick(cx - w * 0.36, keelY - h * 0.18, cx + w * 0.34, keelY - h * 0.2, 1.4, pal.plate)
  s.thick(cx - w * 0.34, keelY - h * 0.34, cx + w * 0.28, keelY - h * 0.36, 1.2, pal.plate)
  // 船首柱 + 锚链
  s.thick(cx + w * 0.4, keelY - h * 0.01, cx + w * 0.5, keelY - h * 0.2, 2.2, pal.plateD)
  s.px(cx + w * 0.5, keelY - h * 0.2, pal.accent)
  // 下方支撑墩（四条短腿）
  for (const [dx, sw] of [[-0.3, -lp], [-0.16, lp], [0.14, -lp], [0.3, lp]]) {
    const x = cx + w * dx
    s.thick(x, keelY + h * 0.03, x + sw * 3, g - 3, 1.6, pal.bodyD)
    s.rect(x + sw * 3 - w * 0.045, g - 4, w * 0.09, 3, pal.plateD)
  }
  // 船匠站在龙骨上：小半身 + 锤
  const mX = cx - w * 0.08
  const mY = keelY - h * 0.05
  s.ell(mX, mY - h * 0.05, w * 0.045, h * 0.04, pal.bodyD)
  s.rect(mX - w * 0.03, mY - h * 0.07, w * 0.07, 2, pal.accent)
  s.thick(mX + w * 0.02, mY - h * 0.02, mX + w * 0.1, mY - h * (atk ? 0.14 : 0.06), 1.4, pal.plateD)
  s.rect(mX + w * 0.1, mY - h * (atk ? 0.17 : 0.09), 6, 4, pal.plate)
  crest(s, mX, mY - h * 0.09, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  core(s, P, cx + w * 0.12, keelY - h * 0.12, w * (atk ? 0.04 : 0.026), pal.core, 0.8, P)
  return { x: cx - w * 0.3, y: keelY - h * 0.06, s: w / 180 }
}

/* 原型 32 —— 干坞门架（tb_drydock_rig）：双塔 + 顶桁架 + 中间沉箱坞门 + 绞盘 */
function drydockGantry(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const topY = g - h * 0.86 + bob(P, 1)
  baseShadow(s, def, cx)
  // 双塔：塔身交叉斜撑
  for (const dx of [-1, 1]) {
    const x = cx + dx * w * 0.21
    s.rect(x - w * 0.05, topY + h * 0.05, w * 0.1, h * 0.74, pal.bodyD)
    s.rect(x - w * 0.05, topY + h * 0.05, w * 0.1, 2, pal.bodyL, 0.5)
    for (let i = 0; i < 4; i++) {
      const y0 = topY + h * (0.12 + i * 0.16)
      s.line(x - w * 0.05, y0, x + w * 0.05, y0 + h * 0.1, pal.plate, 0.55)
      s.line(x + w * 0.05, y0, x - w * 0.05, y0 + h * 0.1, pal.plate, 0.55)
    }
    // 塔基履靴
    s.rect(x - w * 0.07, g - h * 0.08, w * 0.14, h * 0.07, pal.plateD)
    s.disc(x - w * 0.045, g - h * 0.02, w * 0.018, pal.plate)
    s.disc(x + w * 0.045, g - h * 0.02, w * 0.018, pal.plate)
  }
  // 顶梁 + 上弦桁架
  s.rect(cx - w * 0.28, topY, w * 0.56, h * 0.06, pal.body)
  s.rect(cx - w * 0.28, topY, w * 0.56, 2, pal.bodyL)
  for (let i = 0; i < 5; i++) {
    const x0 = cx - w * 0.26 + i * w * 0.13
    s.line(x0, topY, x0 + w * 0.06, topY - h * 0.05, pal.plateD, 0.7)
  }
  // 中央沉箱坞门：攻击时抬起
  const doorY = g - h * 0.62 + (atk ? -h * 0.18 : Math.abs(lp) * h * 0.01)
  s.rect(cx - w * 0.13, doorY, w * 0.26, h * 0.42, pal.plateD)
  s.rect(cx - w * 0.11, doorY + 2, w * 0.22, h * 0.4, pal.body)
  for (let i = 0; i < 4; i++) s.rect(cx - w * 0.11, doorY + h * (0.06 + i * 0.09), w * 0.22, 2, pal.plateD)
  s.thick(cx, doorY, cx, topY, 2.2, pal.plate)
  // 坞门底缘水线
  s.rect(cx - w * 0.2, g - h * 0.04, w * 0.4, h * 0.03, pal.plateD)
  for (let i = 0; i < 6; i++) s.px(cx - w * 0.18 + i * w * 0.072, g - h * 0.045, pal.accent, 0.4)
  // 左侧绞盘 + 吊索
  const capX = cx - w * 0.3
  const capY = topY + h * 0.1
  gearWheel(s, capX, capY, w * 0.045, 8, P.i * 0.2, pal.plate, pal.bodyD, pal.accent)
  chain(s, capX, capY, cx, topY, 8, pal.plate, pal.bodyD)
  crest(s, cx, topY - h * 0.05, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  core(s, P, cx, topY + h * 0.1, w * (atk ? 0.045 : 0.028), pal.core, 0.9, P)
  return { x: capX, y: capY, s: w / 180 }
}

/* 原型 33 —— 变电站虫（tb_substation）：竖立绝缘子堆躯干 + 四根线圈腿 + 电弧触角 */
function coilBug(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const bodyY = g - h * 0.34 + bob(P, 1.5)
  baseShadow(s, def, cx)
  // 四根弹簧线圈腿
  for (const [dx, ph] of [[-0.16, -1], [-0.05, 1], [0.08, -1], [0.19, 1]]) {
    const x = cx + w * dx
    const sy = bodyY + h * 0.06
    for (let i = 0; i < 7; i++) {
      const t = i / 6
      const sw = Math.sin(t * Math.PI * 3 + ph * lp * 1.4) * w * 0.02
      s.px(x + sw, sy + (g - 4 - sy) * t, pal.plateD)
    }
    s.rect(x - w * 0.02, g - 4, w * 0.04, 3, pal.plate)
  }
  // 躯干：绝缘子瓷盘一层层堆起
  for (let i = 0; i < 5; i++) {
    const ry = bodyY - i * h * 0.075
    const rw = w * (0.14 - i * 0.012)
    s.ell(cx, ry, rw, h * 0.02, i % 2 ? pal.bodyD : pal.body)
    s.ell(cx, ry - 1, rw * 0.9, h * 0.008, pal.bodyL, 0.35)
  }
  s.rect(cx - w * 0.045, bodyY - h * 0.31, w * 0.09, h * 0.06, pal.plate)
  // 顶部电极球 + 两道电弧触角
  const ty = bodyY - h * 0.36
  s.disc(cx, ty, w * 0.055, pal.plateD)
  s.disc(cx, ty, w * 0.035, pal.accent, 0.85)
  const arc = atk ? h * 0.16 : h * 0.09
  s.thick(cx, ty - h * 0.02, cx - w * 0.16, ty - arc, 1.2, pal.accent, 0.75)
  s.thick(cx, ty - h * 0.02, cx + w * 0.18, ty - arc * 0.7, 1.2, pal.accent, 0.75)
  s.px(cx - w * 0.16, ty - arc, PAL.white)
  s.px(cx + w * 0.18, ty - arc * 0.7, PAL.white)
  // 高压警示牌
  s.rect(cx - w * 0.2, bodyY - h * 0.1, w * 0.06, h * 0.05, PAL.warn, 0.9)
  s.px(cx - w * 0.17, bodyY - h * 0.08, PAL.ink)
  crest(s, cx, ty - h * 0.07, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  core(s, P, cx, ty, w * (atk ? 0.06 : 0.04), pal.core, atk ? 1.3 : 0.9, P)
  return { x: cx - w * 0.2, y: bodyY - h * 0.12, s: w / 190 }
}

/* 原型 34 —— 地堡炮座（tb_bunker_commander）：低矮混凝土基座 + 半球炮塔 + 潜望镜 */
function bunkerTurret(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const recoil = atk ? -(P.i + 1) * 2 : 0
  const baseY = g - h * 0.06 + bob(P, 0.8)
  baseShadow(s, def, cx)
  // 低矮混凝土基座 + 沙袋
  s.poly([[cx - w * 0.34, baseY], [cx - w * 0.3, baseY - h * 0.18], [cx + w * 0.3, baseY - h * 0.18], [cx + w * 0.34, baseY]], pal.bodyD)
  s.rect(cx - w * 0.34, baseY - h * 0.04, w * 0.68, h * 0.04, pal.plateD)
  for (let i = 0; i < 5; i++) s.ell(cx - w * 0.28 + i * w * 0.14, baseY - h * 0.02, w * 0.07, h * 0.022, PAL.sandDark, 0.9)
  // 半球炮座
  s.ell(cx, baseY - h * 0.2, w * 0.24, h * 0.16, pal.body)
  s.ell(cx, baseY - h * 0.24, w * 0.2, h * 0.1, pal.bodyL, 0.35)
  s.line(cx - w * 0.24, baseY - h * 0.2, cx + w * 0.24, baseY - h * 0.2, pal.plateD)
  rivets(s, cfg.rng, cx - w * 0.18, baseY - h * 0.16, w * 0.36, 6, pal.plate)
  // 潜望镜塔 + 顶端横镜
  s.rect(cx - w * 0.14, baseY - h * 0.58, w * 0.05, h * 0.38, pal.plateD)
  s.rect(cx - w * 0.15, baseY - h * 0.6, w * 0.1, h * 0.03, pal.plate)
  s.px(cx - w * 0.15, baseY - h * 0.585, pal.accent)
  s.rect(cx - w * 0.13, baseY - h * 0.44, w * 0.03, 2, pal.accent, 0.8)
  // 主炮：从半球伸出，攻击时后坐
  const gunX = cx + w * 0.12 + recoil
  const gunY = baseY - h * 0.25
  s.rect(gunX, gunY - 3, w * 0.3, 6, pal.plateD)
  s.rect(gunX, gunY - 3, w * 0.3, 1.6, pal.plate)
  s.rect(gunX + w * 0.26, gunY - 4.5, 5, 9, pal.bodyD)
  if (atk) {
    s.line(gunX + w * 0.3, gunY, gunX + w * 0.42, gunY - 2, pal.accent, 0.7)
    core(s, P, gunX + w * 0.31, gunY, w * 0.05, pal.core, 1.6, P)
  }
  // 舱门 + 观察缝
  s.rect(cx - w * 0.06, baseY - h * 0.33, w * 0.12, h * 0.02, PAL.void)
  s.px(cx, baseY - h * 0.32, pal.accent, 0.6)
  crest(s, cx - w * 0.11, baseY - h * 0.62, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, baseY - h * 0.24, w * (atk ? 0.05 : 0.03), pal.core, 0.9, P)
  return { x: cx - w * 0.11, y: baseY - h * 0.5, s: w / 200 }
}

/* 原型 35 —— 矿坑钻机（tb_mine_foreman）：A 形井架 + 前伸巨型钻头 + 履带底盘 */
function drillRig(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const spin = P.anim === 'move' || atk ? P.i * 0.9 : P.i * 0.25
  const topY = g - h * 0.84 + bob(P, 0.8)
  baseShadow(s, def, cx)
  // A 形井架
  s.thick(cx - w * 0.3, g - h * 0.04, cx - w * 0.02, topY, 3, pal.bodyD)
  s.thick(cx + w * 0.22, g - h * 0.04, cx + w * 0.02, topY, 3, pal.body)
  for (let i = 0; i < 3; i++) {
    const t = 0.25 + i * 0.22
    s.line(cx - w * 0.28 + t * w * 0.24, g - h * 0.04 - t * h * 0.8, cx + w * 0.2 - t * w * 0.18, g - h * 0.04 - t * h * 0.8, pal.plate, 0.6)
  }
  s.rect(cx - w * 0.16, topY, w * 0.3, h * 0.05, pal.body)
  // 顶滑轮 + 吊索
  gearWheel(s, cx, topY + h * 0.03, w * 0.05, 7, spin, pal.plate, pal.bodyD, pal.accent)
  chain(s, cx, topY + h * 0.06, cx + w * 0.1, g - h * 0.3, 8, pal.plate, pal.bodyD)
  // 前伸钻臂 + 锥形巨钻
  const dx0 = cx + w * 0.06
  const dy0 = g - h * 0.34
  s.rect(dx0, dy0 - h * 0.04, w * 0.16, h * 0.08, pal.plateD)
  const tipX = dx0 + w * (atk ? 0.36 : 0.28)
  s.poly([[dx0 + w * 0.12, dy0 - h * 0.06], [tipX, dy0], [dx0 + w * 0.12, dy0 + h * 0.06]], pal.plate)
  for (let i = 0; i < 5; i++) {
    const t = i / 5
    s.line(dx0 + w * (0.14 + t * 0.16), dy0 - h * 0.05 * (1 - t), dx0 + w * (0.17 + t * 0.16), dy0 + h * 0.05 * (1 - t), pal.bodyD, 0.7)
  }
  s.disc(tipX, dy0, w * 0.02, pal.accent, 0.9)
  // 钻臂液压缸
  s.thick(dx0 + w * 0.04, dy0 - h * 0.1, dx0 + w * 0.14, dy0 - h * 0.04, 1.8, pal.bodyL, 0.6)
  // 履带底盘
  s.rect(cx - w * 0.36, g - h * 0.16, w * 0.62, h * 0.14, pal.bodyD)
  for (let i = 0; i < 5; i++) s.disc(cx - w * 0.3 + i * w * 0.12, g - h * 0.09, w * 0.032, pal.plate)
  s.rect(cx - w * 0.36, g - h * 0.16, w * 0.62, 2, pal.plate)
  // 矿灯
  s.disc(cx - w * 0.26, g - h * 0.5, w * 0.03, pal.accent, 0.9)
  g1(P, cx - w * 0.26, g - h * 0.5, w * 0.06, pal.accent, 0.5)
  crest(s, cx + w * 0.04, topY - h * 0.02, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, topY + h * 0.09, w * (atk ? 0.045 : 0.028), pal.core, 0.9, P)
  return { x: tipX + w * 0.03, y: dy0, s: w / 190 }
}

/* 原型 36 —— 锅炉王座（tb_boiler_king）：横置圆筒锅炉 + 双烟囱 + 后靠王座 + 炉门 */
function boilerThrone(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const heat = atk ? 1 : 0.55 + Math.sin(P.i * 0.7) * 0.1
  baseShadow(s, def, cx)
  // 砖砌炉台
  s.rect(cx - w * 0.32, g - h * 0.14, w * 0.64, h * 0.13, pal.plateD)
  for (let i = 0; i < 6; i++) s.rect(cx - w * 0.3 + i * w * 0.11, g - h * 0.13, w * 0.09, h * 0.05, pal.bodyD, 0.6)
  // 横置圆筒锅炉
  const bY = g - h * 0.40
  s.ell(cx, bY, w * 0.3, h * 0.25, pal.body)
  s.ell(cx - w * 0.06, bY - h * 0.05, w * 0.22, h * 0.17, pal.bodyL, 0.25)
  s.line(cx - w * 0.3, bY, cx + w * 0.3, bY, pal.plateD, 0.6)
  for (let i = 0; i < 3; i++) s.line(cx - w * 0.26 + i * w * 0.26, bY - h * 0.2, cx - w * 0.26 + i * w * 0.26, bY + h * 0.2, pal.plateD, 0.5)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    s.px(cx + Math.cos(a) * w * 0.28, bY + Math.sin(a) * h * 0.23, pal.plate)
  }
  // 炉门（+x 正面，攻击时全开）
  const doorW = w * 0.17
  const doorH = h * 0.15
  s.rect(cx + w * 0.06, bY - doorH * 0.5, doorW, doorH, pal.plateD)
  s.rect(cx + w * 0.08, bY - doorH * 0.5 + 2, doorW - 4, doorH - 4, atk ? PAL.warn : mix(PAL.rustHot, PAL.void, 0.25), atk ? 0.95 : 0.85)
  if (!atk) s.dith(cx + w * 0.08, bY - doorH * 0.5 + 2, doorW - 4, doorH - 4, PAL.rustHot, 0.5, 0.7)
  s.rect(cx + w * 0.08, bY - 1, doorW - 4, 1.6, pal.plate)
  // 双烟囱
  for (const dx of [-0.16, 0.02]) {
    s.rect(cx + w * dx, bY - h * 0.36, w * 0.07, h * 0.18, pal.plateD)
    s.rect(cx + w * dx - 1, bY - h * 0.36, w * 0.09, 3, pal.plate)
    if (P.anim === 'move') s.px(cx + w * dx + 2, bY - h * 0.38 - (P.i % 3), PAL.ashPale, 0.35)
  }
  // 后靠王座 + 钉冠
  s.poly([[cx - w * 0.28, bY - h * 0.2], [cx - w * 0.2, bY - h * 0.4], [cx - w * 0.02, bY - h * 0.46], [cx + w * 0.06, bY - h * 0.3]], pal.bodyD)
  s.rect(cx - w * 0.2, bY - h * 0.36, w * 0.18, h * 0.06, pal.plate)
  crest(s, cx - w * 0.1, bY - h * 0.46, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  // 王座上的小铁王 + 扶手仪表
  s.disc(cx - w * 0.1, bY - h * 0.3, w * 0.035, PAL.bone, 0.9)
  s.px(cx - w * 0.11, bY - h * 0.31, pal.accent)
  for (let i = 0; i < 2; i++) {
    s.rect(cx - w * 0.24 + i * w * 0.1, bY - h * 0.12, w * 0.05, h * 0.02, PAL.void)
    s.px(cx - w * 0.215 + i * w * 0.1, bY - h * 0.11, pal.accent, 0.7)
  }
  core(s, P, cx + w * 0.16, bY, w * 0.11, pal.core, heat * 1.5, P)
  return { x: cx + w * 0.16, y: bY, s: w / 180 }
}

/* 原型 37 —— 反应堆祭司（tb_reactor_priest）：三座冷却塔作背光 + 祭司长袍 + 燃料棒长杖 */
function reactorPriest(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const hover = g - h * 0.08 + bob(P, 2)
  const shY = hover - h * 0.44
  baseShadow(s, def, cx)
  // 背后三座冷却塔（弧形排列，越远越小）
  for (const [dx, sc, c] of [[-0.3, 0.75, pal.bodyD], [0.28, 0.62, pal.bodyD], [0.0, 0.95, pal.body]]) {
    const tx = cx + w * dx
    const th = h * 0.42 * sc
    const topY = shY - th
    s.poly([[tx - w * 0.1 * sc, shY], [tx - w * 0.06 * sc, topY], [tx + w * 0.06 * sc, topY], [tx + w * 0.1 * sc, shY]], c)
    s.ell(tx, shY - 1, w * 0.1 * sc, h * 0.015, c)
    s.rect(tx - w * 0.07 * sc, topY - h * 0.02, w * 0.14 * sc, h * 0.02, pal.plateD)
  }
  // 祭司袍：上窄下宽的锥形，下摆落地
  s.poly([[cx - w * 0.3, hover], [cx - w * 0.14, shY], [cx + w * 0.14, shY], [cx + w * 0.3, hover]], pal.body)
  for (let i = 0; i < 4; i++) {
    const fx = cx - w * 0.18 + i * w * 0.12
    s.line(fx, shY + h * 0.04, fx + (i - 1.5) * 4, hover - 2, pal.bodyD, 0.55)
  }
  // 袍前的辐射纹章
  trefoil(s, cx, shY + h * 0.14, w * 0.07, pal.accent)
  // 兜帽 + 防毒面具 + 软管
  const hdY = shY - h * 0.03
  s.ell(cx, hdY, w * 0.09, h * 0.07, pal.bodyD)
  s.rect(cx - w * 0.06, hdY - h * 0.02, w * 0.12, 3, pal.accent, 0.85)
  s.disc(cx + w * 0.05, hdY + h * 0.01, w * 0.02, pal.plateD)
  s.thick(cx + w * 0.05, hdY + h * 0.03, cx + w * 0.12, hdY + h * 0.14, 1.4, pal.bodyD)
  // 左袖 + 右手燃料棒长杖
  s.poly([[cx - w * 0.14, shY + h * 0.04], [cx - w * 0.24, shY + h * 0.2], [cx - w * 0.16, shY + h * 0.22], [cx - w * 0.1, shY + h * 0.08]], pal.bodyD)
  const staffX = cx + w * 0.22
  s.thick(cx + w * 0.12, shY + h * 0.1, staffX, shY - h * (atk ? 0.06 : 0.02), 1.8, pal.plateD)
  s.rect(staffX - w * 0.03, shY - h * 0.3, w * 0.06, h * 0.3, mix(PAL.glass, pal.accent, 0.3))
  for (let i = 0; i < 4; i++) s.rect(staffX - w * 0.035, shY - h * 0.28 + i * h * 0.07, w * 0.07, 2, pal.plateD)
  core(s, P, staffX, shY - h * 0.32, w * (atk ? 0.06 : 0.035), pal.core, atk ? 1.5 : 1, P)
  crest(s, cx, hdY - h * 0.07, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  // 脚下冷却剂水汽
  for (let i = 0; i < 5; i++) s.px(cx - w * 0.24 + i * w * 0.11, hover - h * 0.02 - (i % 2) * 3, PAL.steelWhite, 0.3)
  return { x: staffX, y: shY - h * 0.32, s: w / 180 }
}

/* 原型 38 —— 辐射巨躯（tb_rad_colossus）：驼背三臂 + 背部散热鳍 + 畸形粗腿 */
function radColossus(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const hipY = g - h * 0.3 + bob(P, 1.2)
  const shY = hipY - h * 0.3
  baseShadow(s, def, cx)
  // 一条粗腿一条细腿
  s.thick(cx - w * 0.16, hipY, cx - w * 0.2 + lp * 2, g - 4, w * 0.075, pal.bodyD)
  s.thick(cx + w * 0.12, hipY - 2, cx + w * 0.16 - lp * 2, g - 4, w * 0.045, pal.body)
  s.rect(cx - w * 0.26, g - 6, w * 0.13, 5, pal.plateD)
  s.rect(cx + w * 0.1, g - 5, w * 0.1, 4, pal.plateD)
  // 驼背躯干：左高右低
  s.poly([[cx - w * 0.2, hipY], [cx + w * 0.2, hipY], [cx + w * 0.16, shY + h * 0.02], [cx - w * 0.26, shY]], pal.body)
  s.ell(cx - w * 0.09, shY + h * 0.05, w * 0.16, h * 0.1, pal.bodyL, 0.2)
  // 背部散热鳍
  for (let i = 0; i < 5; i++) {
    const fx = cx - w * 0.3 + i * w * 0.07
    const fy = shY + h * 0.02 - i * 2
    s.poly([[fx, fy], [fx - w * 0.05, fy - h * (0.14 + i * 0.02)], [fx + w * 0.04, fy - h * 0.04]], pal.plateD)
  }
  // 头缩进胸腔，只剩面罩与外露眼
  s.ell(cx - w * 0.02, shY + h * 0.01, w * 0.075, h * 0.055, pal.bodyD)
  s.rect(cx - w * 0.07, shY + h * 0.02, w * 0.1, 2.4, pal.accent, 0.8)
  orb(s, cx + w * 0.04, shY - h * 0.01, w * 0.03, PAL.white, pal.bodyD, pal.accent)
  // 三臂：右侧巨臂 + 左侧两条细臂
  const fx = cx + w * (atk ? 0.46 : 0.34)
  const fy = shY + h * (atk ? 0.04 : 0.2)
  s.thick(cx + w * 0.12, shY + h * 0.08, fx - w * 0.03, fy - h * 0.03, w * 0.05, pal.body)
  s.disc(fx - w * 0.03, fy - h * 0.03, w * 0.065, pal.plate)
  s.disc(fx - w * 0.03, fy - h * 0.03, w * 0.03, pal.bodyD)
  for (const [dy, sw] of [[0.09, 0.1], [0.18, 0.06]]) {
    s.thick(cx - w * 0.16, shY + h * dy, cx - w * 0.3 - sw * w, shY + h * (dy + 0.12), 1.8, pal.bodyD)
    s.disc(cx - w * 0.3 - sw * w, shY + h * (dy + 0.12), w * 0.022, pal.plate)
  }
  // 腰间辐射三叶徽 + 泄漏雾
  trefoil(s, cx - w * 0.18, hipY - h * 0.02, w * 0.045, pal.accent)
  for (let i = 0; i < 6; i++) s.px(cx - w * 0.1 + (i % 3) * w * 0.09, hipY - h * 0.08 - i * 3, PAL.toxicGlow, 0.3)
  crest(s, cx - w * 0.02, shY - h * 0.05, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  core(s, P, cx - w * 0.02, shY + h * 0.12, w * (atk ? 0.06 : 0.04), pal.core, atk ? 1.4 : 1, P)
  return { x: fx - w * 0.03, y: fy - h * 0.03, s: w / 180 }
}

/* 原型 39 —— 军械平台（tb_arsenal_sergeant）：低矮弹药箱平台 + 三座小炮塔 + 长主炮 */
function arsenalDeck(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const recoil = atk ? -(P.i + 1) * 2 : 0
  const deckY = g - h * 0.4 + bob(P, 0.8)
  baseShadow(s, def, cx)
  // 低矮宽扁履带
  s.rect(cx - w * 0.4, g - h * 0.16, w * 0.8, h * 0.14, pal.bodyD)
  for (let i = 0; i < 8; i++) s.disc(cx - w * 0.34 + i * w * 0.096, g - h * 0.09, w * 0.026, pal.plate)
  // 弹药箱平台
  s.rect(cx - w * 0.36, deckY, w * 0.72, h * 0.14, pal.body)
  s.rect(cx - w * 0.36, deckY, w * 0.72, 2, pal.bodyL, 0.6)
  // 平台支柱（把抬高的甲板接到履带上）
  s.rect(cx - w * 0.17, deckY + h * 0.13, w * 0.34, h * 0.14, pal.bodyD)
  s.rect(cx - w * 0.17, deckY + h * 0.13, w * 0.34, 2, pal.bodyL, 0.5)
  for (let i = 0; i < 4; i++) s.rect(cx - w * 0.34 + i * w * 0.17, deckY + h * 0.03, w * 0.14, h * 0.09, i % 2 ? pal.plateD : pal.bodyD)
  s.rect(cx - w * 0.2, deckY - h * 0.1, w * 0.3, h * 0.1, pal.plateD)
  s.px(cx - w * 0.16, deckY - h * 0.05, PAL.warn)
  // 三座小炮塔：一大两小
  for (const [dx, rr] of [[-0.16, 0.8], [0.06, 1.2], [0.26, 0.66]]) {
    const tx = cx + w * dx
    const ty = deckY - h * (0.09 + rr * 0.05)
    s.ell(tx, ty, w * 0.07 * (rr + 0.4), h * 0.04 * (rr + 0.4), pal.plate)
    s.rect(tx, ty - 1.4, w * 0.11 * (rr + 0.4) + recoil * 0.5, 3, pal.bodyD)
    s.px(tx + 2, ty - 1, pal.accent, 0.7)
  }
  // 长主炮
  s.rect(cx + w * 0.1 + recoil, deckY - h * 0.18, w * 0.34, 5, pal.plateD)
  s.rect(cx + w * 0.1 + recoil, deckY - h * 0.18, w * 0.34, 1.4, pal.plate)
  s.rect(cx + w * 0.4 + recoil, deckY - h * 0.19, 4, 7, pal.bodyD)
  if (atk) core(s, P, cx + w * 0.43 + recoil, deckY - h * 0.18, w * 0.05, pal.core, 1.5, P)
  // 斜跨平台的弹药带
  for (let i = 0; i < 9; i++) {
    const bx = cx - w * 0.3 + i * w * 0.075
    const by = deckY - h * 0.02 - Math.sin((i / 8) * Math.PI) * h * 0.06
    s.rect(bx, by, 3, 5, i % 2 ? PAL.warn : pal.plateD)
  }
  // 平台上暴露的观察手
  s.ell(cx - w * 0.05, deckY - h * 0.18, w * 0.03, h * 0.03, PAL.bone, 0.9)
  s.rect(cx - w * 0.07, deckY - h * 0.17, w * 0.04, 1.6, pal.accent)
  crest(s, cx - w * 0.16, deckY - h * 0.3, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx + w * 0.02, deckY - h * 0.1, w * (atk ? 0.045 : 0.03), pal.core, 0.9, P)
  return { x: cx + w * 0.34, y: deckY - h * 0.16, s: w / 190 }
}

/* 原型 40 —— 音箱机甲（tb_punk_amp）：三只叠起的音箱躯干 + 喇叭炮双臂 */
function ampMech(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const hipY = g - h * 0.26 + bob(P, 1)
  const shY = hipY - h * 0.32
  const pulse = atk ? 1 : 0.4 + Math.sin(P.i * 1.2) * 0.2
  baseShadow(s, def, cx)
  // 支架式细腿
  for (const [dx, sw] of [[-0.14, -lp], [0.12, lp]]) {
    const x = cx + w * dx
    s.thick(x, hipY, x + sw * 4, g - h * 0.12, 2, pal.plateD)
    s.thick(x + sw * 4, g - h * 0.12, x + sw * 5, g - 3, 1.6, pal.bodyD)
    s.rect(x + sw * 5 - w * 0.05, g - 4, w * 0.1, 3, pal.plateD)
  }
  // 三只叠起来的音箱
  const cabW = w * 0.24
  for (let i = 0; i < 3; i++) {
    const cw = cabW * (1 - i * 0.12)
    const cy = hipY - i * h * 0.15 - h * 0.06
    s.rect(cx - cw, cy, cw * 2, h * 0.14, i % 2 ? pal.bodyD : pal.body)
    s.rect(cx - cw, cy, cw * 2, 2, pal.plate)
    s.disc(cx, cy + h * 0.07, cw * 0.55, pal.plateD)
    s.disc(cx, cy + h * 0.07, cw * 0.36, pal.bodyL, 0.45)
    s.disc(cx, cy + h * 0.07, cw * 0.12, pal.accent, pulse)
  }
  // 顶部混音台 + 天线
  s.rect(cx - cabW * 0.7, shY - h * 0.08, cabW * 1.4, h * 0.06, pal.body)
  s.px(cx - cabW * 0.4, shY - h * 0.05, pal.accent)
  s.thick(cx + cabW * 0.5, shY - h * 0.08, cx + cabW * 0.7, shY - h * 0.28, 1.2, pal.plateD)
  s.px(cx + cabW * 0.7, shY - h * 0.28, PAL.neonWarm)
  // 双臂：喇叭炮，攻击时前推并放出声波
  for (const [dx, reach] of [[-1, 0.14], [1, atk ? 0.18 : 0.14]]) {
    const hx = cx + dx * cabW
    const hy = shY + h * 0.08
    s.thick(cx + dx * cabW * 0.7, shY + h * 0.06, hx, hy, 2.4, pal.bodyD)
    s.poly([[hx, hy - h * 0.05], [hx + dx * w * reach, hy - h * 0.1], [hx + dx * w * reach, hy + h * 0.1], [hx, hy + h * 0.05]], pal.plateD)
    s.disc(hx + dx * w * reach * 0.9, hy, w * 0.026, pal.accent, 0.9)
    if (atk && dx > 0) {
      for (let i = 0; i < 3; i++) arcOf(s, hx + dx * w * reach, hy, w * (0.04 + i * 0.03), h * (0.08 + i * 0.05), 1, pal.accent, -0.5, 0.5, 8, 0.4)
    }
  }
  crest(s, cx, shY - h * 0.1, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 190)
  core(s, P, cx, hipY - h * 0.22, w * (atk ? 0.07 : 0.04), pal.core, pulse, P)
  return { x: cx + w * 0.3, y: shY + h * 0.06, s: w / 190 }
}

/* 原型 41 —— 影缝潜行者（tb_shadow_walker）：黑缝薄壳躯 + 四折刀腿 + 弹出影刃 */
function seamStalker(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.44
  const lp = legPhase(P)
  const atk = P.anim === 'attack'
  const hipY = g - h * 0.36 + bob(P, 1)
  const shY = hipY - h * 0.34
  baseShadow(s, def, cx)
  // 四条折刀腿
  for (const [dx, sw] of [[-0.16, -lp], [-0.06, lp], [0.07, -lp], [0.17, lp]]) {
    const x = cx + w * dx
    const kx = x + sw * w * 0.06 + w * 0.03
    const ky = hipY + h * 0.12
    s.thick(x, hipY, kx, ky, 1.2, pal.bodyD)
    s.thick(kx, ky, x + sw * w * 0.02, g - 2, 0.9, pal.body)
    s.px(x + sw * w * 0.02, g - 2, pal.accent, 0.7)
  }
  // 黑缝躯干
  s.poly([[cx - w * 0.05, hipY], [cx + w * 0.05, hipY], [cx + w * 0.07, shY], [cx - w * 0.07, shY]], pal.bodyD)
  s.rect(cx - w * 0.012, shY + h * 0.03, w * 0.024, h * 0.28, pal.accent, 0.55)
  // 尖肩甲
  for (const dx of [-1, 1]) {
    s.poly([[cx + dx * w * 0.03, shY], [cx + dx * w * 0.2, shY - h * 0.06], [cx + dx * w * 0.1, shY + h * 0.05]], pal.body)
    s.line(cx + dx * w * 0.03, shY, cx + dx * w * 0.2, shY - h * 0.06, pal.plateD, 0.6)
  }
  // 无脸尖锥头 + 横缝双眼
  const hY = shY - h * 0.08
  s.poly([[cx - w * 0.045, hY + h * 0.03], [cx, hY - h * 0.08], [cx + w * 0.05, hY + h * 0.03]], pal.bodyD)
  s.rect(cx - w * 0.02, hY - h * 0.005, w * 0.045, 1.6, pal.accent)
  s.px(cx - w * 0.01, hY, PAL.white)
  s.px(cx + w * 0.02, hY, PAL.white)
  // 折叠影刃双臂
  for (const dx of [-1, 1]) {
    const ex = cx + dx * w * (atk ? 0.24 : 0.16)
    const ey = shY + h * (atk ? 0.1 : 0.2)
    s.thick(cx + dx * w * 0.08, shY + h * 0.05, ex, ey, 1.4, pal.bodyD)
    s.poly([[ex, ey], [ex + dx * w * 0.14, ey - h * 0.06], [ex + dx * w * 0.1, ey + h * 0.02]], pal.plateD)
  }
  // 身后拖出的影带
  for (let i = 0; i < 4; i++) s.rect(cx - w * 0.06 - i * 4, hipY + i * 2, w * 0.05, 2, pal.bodyD, 0.4 - i * 0.08)
  crest(s, cx, hY - h * 0.09, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, shY + h * 0.14, w * (atk ? 0.045 : 0.028), pal.core, 0.9, P)
  return { x: cx - w * 0.18, y: shY + h * 0.05, s: w / 190 }
}

/* 原型 42 —— 城堡暴君（tb_castle_tyrant）：三塔并立的城堡 + 半升吊闸 + 塔顶旗 */
function castleKeep(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const lift = atk ? h * 0.12 : 0
  baseShadow(s, def, cx)
  // 主塔 + 两座副塔（不同高度）
  for (const [dx, tw, th] of [[-0.24, 0.12, 0.46], [0.22, 0.13, 0.56], [0.0, 0.2, 0.78]]) {
    const tx = cx + w * dx
    const topY = g - h * th + bob(P, 0.8)
    s.rect(tx - w * tw, topY, w * tw * 2, h * th, pal.bodyD)
    s.rect(tx - w * tw, topY, w * tw * 2, 2, pal.body)
    for (let i = 0; i < 3; i++) s.rect(tx - w * tw + i * w * tw * 0.8, topY - h * 0.03, w * tw * 0.45, h * 0.03, pal.bodyD)
    s.rect(tx - 1.5, topY + h * 0.12, 3, h * 0.05, PAL.void)
    if (dx !== 0) s.rect(tx - 1.5, topY + h * 0.26, 3, h * 0.04, PAL.void)
  }
  // 城墙基座
  s.rect(cx - w * 0.38, g - h * 0.2, w * 0.76, h * 0.19, pal.bodyD)
  for (let i = 0; i < 7; i++) s.rect(cx - w * 0.38 + i * w * 0.11, g - h * 0.2, w * 0.02, h * 0.19, pal.body)
  // 中央闸门 + 吊闸
  const gateY = g - h * 0.18
  s.poly([[cx - w * 0.1, gateY], [cx - w * 0.1, gateY - h * 0.22], [cx, gateY - h * 0.29], [cx + w * 0.1, gateY - h * 0.22], [cx + w * 0.1, gateY]], pal.plateD)
  s.rect(cx - w * 0.08, gateY - h * 0.2, w * 0.16, h * 0.2 - lift, mix(PAL.void, pal.bodyD, 0.3))
  for (let i = 0; i < 4; i++) s.rect(cx - w * 0.08 + i * w * 0.043, gateY - h * 0.2, 1.4, h * 0.2 - lift, pal.plate)
  for (let i = 0; i < 4; i++) s.rect(cx - w * 0.08, gateY - h * (0.04 + i * 0.045) - lift, w * 0.16, 1.2, pal.plate)
  // 塔顶旗杆 + 飘旗
  const flagY = g - h * 0.8 + bob(P, 0.8)
  s.rect(cx - 1, flagY, 2, h * 0.1, pal.plateD)
  const fl = Math.sin(P.i * 0.8) * 4
  s.poly([[cx + 1, flagY + 2], [cx + w * 0.16, flagY + 4 + fl], [cx + 1, flagY + h * 0.05]], pal.accent, 0.9)
  crest(s, cx, flagY - h * 0.01, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, gateY - h * 0.12, w * (atk ? 0.05 : 0.03), pal.core, 0.9, P)
  g1(P, cx + w * 0.1, flagY + h * 0.02, w * 0.05, pal.accent, 0.4)
  return { x: cx + w * 0.1, y: flagY + h * 0.02, s: w / 190 }
}

/* 原型 43 —— 蝠翼伯爵（tb_vampire_count）：横向三段蝠翼 + 高领 + 悬浮短披 + 圣杯 */
function batCount(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const hover = g - h * 0.2 + bob(P, 3)
  const shY = hover - h * 0.3
  const flap = Math.sin((P.i / (P.anim === 'move' ? 2 : 3)) * TAU)
  baseShadow(s, def, cx)
  // 双蝠翼：指骨 + 三段膜
  for (const dx of [-1, 1]) {
    const wy = shY + h * 0.02 - flap * h * (atk ? 0.05 : 0.03)
    const tipX = cx + dx * w * (atk ? 0.42 : 0.36)
    s.poly([[cx + dx * w * 0.1, wy], [tipX, wy - h * 0.18], [tipX - dx * w * 0.08, wy + h * 0.04]], pal.bodyD)
    for (let i = 0; i < 3; i++) {
      const ex = cx + dx * w * (0.16 + i * 0.08)
      s.poly([[ex, wy - h * 0.06], [ex + dx * w * 0.02, wy + h * (0.14 + i * 0.02)], [ex + dx * w * 0.1, wy + h * 0.04]], mix(pal.bodyD, PAL.void, 0.35))
      s.line(cx + dx * w * 0.1, wy, ex, wy - h * 0.08, pal.plateD, 0.7)
    }
  }
  // 短披风 + 高领
  s.poly([[cx - w * 0.13, hover], [cx - w * 0.16, shY - h * 0.02], [cx + w * 0.16, shY - h * 0.02], [cx + w * 0.13, hover]], pal.body)
  for (let i = 0; i < 3; i++) s.line(cx - w * 0.1 + i * w * 0.1, shY, cx - w * 0.13 + i * w * 0.09, hover - 2, pal.plateD, 0.5)
  for (const dx of [-1, 1]) s.poly([[cx + dx * w * 0.05, shY + h * 0.02], [cx + dx * w * 0.17, shY - h * 0.16], [cx + dx * w * 0.1, shY - h * 0.02]], pal.bodyD)
  // 苍白头 + 尖耳 + 红眼
  const hY = shY - h * 0.05
  s.ell(cx, hY, w * 0.055, h * 0.05, PAL.bone)
  s.poly([[cx - w * 0.05, hY - h * 0.02], [cx - w * 0.09, hY - h * 0.09], [cx - w * 0.02, hY - h * 0.04]], PAL.bone)
  s.poly([[cx + w * 0.05, hY - h * 0.02], [cx + w * 0.09, hY - h * 0.09], [cx + w * 0.02, hY - h * 0.04]], PAL.bone)
  s.px(cx - w * 0.02, hY - h * 0.01, PAL.neonRed)
  s.px(cx + w * 0.02, hY - h * 0.01, PAL.neonRed)
  // 右手血酒圣杯（攻击时举起）
  const cupX = cx + w * (atk ? 0.24 : 0.18)
  const cupY = shY + h * (atk ? -0.02 : 0.12)
  s.thick(cx + w * 0.12, shY + h * 0.08, cupX, cupY, 1.6, pal.bodyD)
  s.poly([[cupX - w * 0.03, cupY], [cupX + w * 0.03, cupY], [cupX + w * 0.02, cupY + h * 0.05], [cupX - w * 0.02, cupY + h * 0.05]], pal.plate)
  s.rect(cupX - w * 0.032, cupY - h * 0.008, w * 0.064, h * 0.008, PAL.blood)
  s.rect(cupX - 1, cupY + h * 0.05, 2, h * 0.03, pal.plateD)
  g1(P, cupX, cupY, w * 0.05, PAL.neonRed, 0.6)
  crest(s, cx, hY - h * 0.09, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, shY + h * 0.14, w * (atk ? 0.05 : 0.03), pal.core, 0.9, P)
  return { x: cupX, y: cupY, s: w / 200 }
}

/* 原型 44 —— 重力古眼（tb_gravity_eye）：石壳巨眼 + 两圈引力环 + 环绕碎石 */
function gravityOrb(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const orbit = (P.i / (P.anim === 'move' ? 3 : 2)) * TAU
  const baseY = g - h * 0.08
  const cy = g - h * 0.5 + bob(P, 1.5)
  const R = w * 0.3
  baseShadow(s, def, cx)
  // 石制底座（半埋的碎环）
  s.ell(cx, baseY - h * 0.06, w * 0.36, h * 0.09, pal.plateD)
  for (let i = 0; i < 8; i++) s.rect(cx - w * 0.34 + i * w * 0.085, baseY - h * 0.1, w * 0.05, h * 0.04, pal.bodyD, 0.7)
  // 石壳主球
  s.ell(cx, cy, R, R * 0.94, pal.bodyD)
  s.ell(cx - R * 0.1, cy - R * 0.12, R * 0.8, R * 0.72, pal.body, 0.5)
  // 眼白 + 虹膜 + 竖瞳
  s.ell(cx + R * 0.05, cy, R * 0.5, R * 0.38, PAL.bone)
  s.disc(cx + R * 0.1, cy, R * 0.26, pal.accent, 0.9)
  s.disc(cx + R * 0.1, cy, R * 0.1, PAL.void)
  s.px(cx + R * 0.02, cy - R * 0.14, PAL.white)
  // 引力环
  ringOf(s, cx, cy, R * 1.3, R * 0.42, 1.6, pal.plate, 34, 0.9)
  ringOf(s, cx, cy, R * 1.12, R * 0.9, 1, pal.accent, 40, 0.45)
  // 环绕碎石
  for (let i = 0; i < 6; i++) {
    const a = orbit + (i / 6) * TAU
    const sx = cx + Math.cos(a) * R * 1.35
    const sy = cy + Math.sin(a) * R * 0.5
    s.rect(sx - 2, sy - 2, 4 + (i % 2) * 2, 4, pal.plateD)
    s.px(sx, sy - 2, pal.plate)
  }
  // 顶部石冠（不规则尖石）
  for (let i = 0; i < 5; i++) {
    const a = -1.2 + i * 0.3
    s.poly([[cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9], [cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12], [cx + Math.cos(a + 0.14) * R * 0.9, cy + Math.sin(a + 0.14) * R * 0.9]], pal.bodyD)
  }
  crest(s, cx, cy - R * 1.05, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx + R * 0.1, cy, R * (atk ? 0.42 : 0.3), pal.core, atk ? 1.6 : 1.1, P)
  if (atk) for (let i = 0; i < 5; i++) s.px(cx + R * 1.3 + i * 4, cy + (i - 2) * 5, pal.accent, 0.5)
  return { x: cx + R * 1.3, y: cy, s: w / 180 }
}

/* 原型 45 —— 雾中亡魂（tb_fog_wraith）：无腿雾团下半身 + 残斗篷 + 提灯 */
function fogSpecter(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const drift = Math.sin(P.i * 0.6) * 4
  const shY = g - h * 0.72 + bob(P, 2)
  baseShadow(s, def, cx)
  // 下半身：四团叠起的雾
  for (let i = 0; i < 4; i++) {
    const fy = g - h * (0.06 + i * 0.12)
    const fw = w * (0.3 - i * 0.04)
    s.ell(cx + drift * (0.2 + i * 0.15), fy, fw, h * 0.1, mix(PAL.ashPale, pal.bodyD, 0.4), 0.35)
  }
  // 雾中残斗篷
  s.poly([[cx - w * 0.16, shY + h * 0.12], [cx - w * 0.13, shY], [cx + w * 0.13, shY], [cx + w * 0.18, shY + h * 0.16]], pal.body)
  for (let i = 0; i < 4; i++) {
    const fx = cx - w * 0.12 + i * w * 0.08
    s.thick(fx, shY + h * 0.12, fx + drift * 0.4, g - h * (0.1 + (i % 2) * 0.06), 1, pal.bodyD, 0.5)
  }
  // 兜帽
  const hY = shY - h * 0.06
  s.poly([[cx - w * 0.1, hY + h * 0.06], [cx - w * 0.06, hY - h * 0.07], [cx + w * 0.07, hY - h * 0.06], [cx + w * 0.11, hY + h * 0.04]], pal.body)
  s.ell(cx + w * 0.01, hY + h * 0.01, w * 0.055, h * 0.04, mix(PAL.void, pal.bodyD, 0.5))
  s.px(cx - w * 0.02, hY, pal.accent)
  s.px(cx + w * 0.03, hY, pal.accent)
  // 右手提灯
  const lx = cx + w * 0.26
  const ly = shY + h * (atk ? 0.06 : 0.16)
  s.thick(cx + w * 0.12, shY + h * 0.08, lx, ly - h * 0.1, 1.2, pal.plateD)
  s.rect(lx - w * 0.035, ly - h * 0.1, w * 0.07, h * 0.1, pal.plateD)
  s.rect(lx - w * 0.028, ly - h * 0.09, w * 0.056, h * 0.08, mix(PAL.glass, pal.accent, 0.35), 0.85)
  s.disc(lx, ly - h * 0.05, w * 0.018, pal.accent)
  core(s, P, lx, ly - h * 0.05, w * (atk ? 0.09 : 0.06), pal.core, atk ? 1.5 : 1, P)
  if (atk) s.poly([[lx, ly - h * 0.05], [lx + w * 0.34, ly - h * 0.16], [lx + w * 0.34, ly + h * 0.06]], pal.accent, 0.3)
  crest(s, cx, hY - h * 0.08, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  return { x: lx, y: ly - h * 0.05, s: w / 190 }
}

/* 原型 46 —— 海峡嗥兽（tb_strait_howler）：纺锤海兽躯 + 长颈 S 形前伸 + 鳍足 */
function straitBeast(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.42
  const atk = P.anim === 'attack'
  const lp = legPhase(P)
  const bodyY = g - h * 0.26 + bob(P, 1.5)
  baseShadow(s, def, cx)
  // 四只鳍足
  for (const [dx, sw] of [[-0.24, -lp], [-0.12, lp], [0.1, -lp], [0.22, lp]]) {
    const x = cx + w * dx
    s.thick(x, bodyY + h * 0.08, x + sw * 5 + w * 0.03, g - h * 0.05, w * 0.035, pal.bodyD)
    s.ell(x + sw * 5 + w * 0.05, g - h * 0.03, w * 0.055, h * 0.018, pal.plate)
  }
  // 纺锤海兽躯
  s.ell(cx, bodyY, w * 0.3, h * 0.14, pal.bodyD)
  s.ell(cx + w * 0.08, bodyY - h * 0.02, w * 0.24, h * 0.11, pal.body)
  // 背鳍三片
  for (let i = 0; i < 3; i++) s.poly([[cx - w * 0.1 - i * w * 0.1, bodyY - h * 0.1], [cx - w * 0.16 - i * w * 0.1, bodyY - h * (0.2 + i * 0.02)], [cx - w * 0.02 - i * w * 0.1, bodyY - h * 0.12]], pal.plateD)
  // S 形长颈 + 前伸的头
  const neckTop = bodyY - h * (atk ? 0.5 : 0.38)
  const hx = cx + w * (atk ? 0.3 : 0.24)
  s.thick(cx + w * 0.12, bodyY - h * 0.06, cx + w * 0.18, neckTop, w * 0.055, pal.body)
  s.thick(cx + w * 0.18, neckTop, hx, neckTop - h * 0.06, w * 0.048, pal.body)
  // 长吻 + 獠牙 + 眼
  s.poly([[hx - w * 0.03, neckTop - h * 0.1], [hx + w * 0.16, neckTop - h * 0.06], [hx + w * 0.14, neckTop - h * 0.02], [hx - w * 0.02, neckTop - h * 0.02]], pal.body)
  for (let i = 0; i < 4; i++) s.poly([[hx + w * 0.04 + i * w * 0.03, neckTop - h * 0.03], [hx + w * 0.055 + i * w * 0.03, neckTop - h * 0.005], [hx + w * 0.065 + i * w * 0.03, neckTop - h * 0.03]], PAL.bone)
  s.px(hx + w * 0.02, neckTop - h * 0.07, pal.accent)
  // 颏下的海藻须
  for (let i = 0; i < 4; i++) s.thick(hx + w * 0.08 + i * 3, neckTop - h * 0.02, hx + w * 0.08 + i * 3 + Math.sin(P.i + i) * 2, neckTop + h * 0.06, 0.8, PAL.weed, 0.7)
  // 胸鳍
  for (const dx of [-1, 1]) s.poly([[cx + dx * w * 0.14, bodyY + h * 0.04], [cx + dx * w * 0.3, bodyY + h * 0.14], [cx + dx * w * 0.2, bodyY + h * 0.16]], pal.bodyD)
  crest(s, hx + w * 0.02, neckTop - h * 0.1, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx + w * 0.02, bodyY, w * (atk ? 0.05 : 0.03), pal.core, 0.9, P)
  return { x: hx + w * 0.14, y: neckTop - h * 0.06, s: w / 190 }
}

/* 原型 47 —— 沼泽巨口（tb_swamp_maw）：低伏泥沼上下颚 + 背部藤笼 + 泥中三眼 */
function swampMaw(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const open = atk ? h * 0.1 : h * 0.04
  baseShadow(s, def, cx)
  // 泥沼底座
  s.ell(cx, g - h * 0.05, w * 0.42, h * 0.09, pal.bodyD)
  for (let i = 0; i < 5; i++) s.ell(cx - w * 0.3 + i * w * 0.15, g - h * 0.02, w * 0.08, h * 0.02, PAL.mossDead, 0.7)
  // 上颚：拱起的泥壳
  s.poly([[cx - w * 0.38, g - h * 0.18], [cx - w * 0.2, g - h * 0.4], [cx + w * 0.1, g - h * 0.34], [cx + w * 0.36, g - h * 0.22], [cx + w * 0.3, g - h * 0.16], [cx - w * 0.34, g - h * 0.12]], pal.body)
  // 下颚：贴地的厚泥板
  s.poly([[cx - w * 0.34, g - h * 0.14], [cx + w * 0.32, g - h * 0.18], [cx + w * 0.3, g - h * 0.04 - open], [cx - w * 0.34, g - h * 0.02 - open]], pal.bodyD)
  // 口腔
  s.poly([[cx - w * 0.28, g - h * 0.16], [cx + w * 0.28, g - h * 0.18], [cx + w * 0.26, g - h * 0.1 - open], [cx - w * 0.26, g - h * 0.08 - open]], PAL.bloodDark)
  s.ell(cx + w * 0.02, g - h * 0.13 - open * 0.5, w * 0.18, h * 0.025 + open * 0.4, PAL.blood, 0.8)
  // 上颚牙
  for (let i = 0; i < 7; i++) {
    const tx = cx - w * 0.26 + i * w * 0.075
    const ty = g - h * 0.16 - (i / 6) * h * 0.015
    s.poly([[tx, ty], [tx + 3, ty + h * 0.035], [tx + 6, ty]], PAL.bone)
  }
  // 下颚牙
  for (let i = 0; i < 6; i++) {
    const tx = cx - w * 0.22 + i * w * 0.075
    const ty = g - h * 0.09 - open
    s.poly([[tx, ty], [tx + 3, ty - h * 0.03], [tx + 6, ty]], PAL.bone)
  }
  // 背部藤笼
  const vineY = g - h * 0.5
  for (let i = 0; i < 4; i++) {
    const vx = cx - w * 0.2 + i * w * 0.12
    s.thick(vx, vineY + h * 0.06, vx + Math.sin(P.i * 0.8 + i) * 6, vineY - h * 0.16, 1.4, PAL.weed)
  }
  s.ell(cx - w * 0.02, vineY - h * 0.14, w * 0.1, h * 0.06, pal.plateD)
  for (let i = 0; i < 4; i++) s.thick(cx - w * 0.1 + i * w * 0.06, vineY - h * 0.16, cx - w * 0.1 + i * w * 0.06, vineY - h * 0.02, 0.7, pal.plate)
  // 泥中的三只毒黄小眼
  for (const [ex, ey] of [[-0.16, 0.26], [-0.04, 0.31], [0.08, 0.27]]) {
    s.disc(cx + w * ex, g - h * ey, w * 0.022, pal.accent, 0.9)
    s.disc(cx + w * ex, g - h * ey, w * 0.009, PAL.void)
  }
  crest(s, cx + w * 0.02, vineY - h * 0.24, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx + w * 0.02, g - h * 0.13 - open * 0.5, w * (atk ? 0.07 : 0.045), pal.core, atk ? 1.4 : 1, P)
  return { x: cx + w * 0.3, y: g - h * 0.14, s: w / 180 }
}

/* 原型 48 —— 林中空壳（tb_forest_hollow）：断顶空树干 + 树洞巨眼 + 鹿角枯枝 */
function hollowTrunk(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const bobY = bob(P, 1)
  baseShadow(s, def, cx)
  // 三条粗根
  for (const [dx, sw] of [[-0.24, -1], [0.02, 1], [0.22, -1]]) {
    const x = cx + w * dx
    s.poly([[x - w * 0.04, g - h * 0.12], [x + w * 0.08, g - h * 0.12], [x + w * 0.2 + sw * 8, g], [x - w * 0.06 + sw * 8, g]], pal.bodyD)
  }
  // 断顶树干
  const trunkTop = g - h * 0.62 + bobY
  s.poly([[cx - w * 0.2, g - h * 0.02], [cx - w * 0.12, trunkTop + h * 0.04], [cx - w * 0.06, trunkTop - h * 0.03], [cx + w * 0.1, trunkTop + h * 0.02], [cx + w * 0.18, g - h * 0.02]], pal.body)
  // 树皮纵纹
  for (let i = 0; i < 5; i++) {
    const tx = cx - w * 0.14 + i * w * 0.07
    s.line(tx, g - h * 0.04, tx + (i % 2 ? 3 : -2), trunkTop + h * 0.07, pal.bodyD, 0.6)
  }
  // 树洞空腔 + 独眼
  const holeY = g - h * 0.38 + bobY
  s.ell(cx, holeY, w * 0.13, h * 0.12, PAL.void)
  s.ell(cx, holeY, w * 0.11, h * 0.1, mix(PAL.void, pal.bodyD, 0.35))
  s.disc(cx + w * 0.01, holeY, w * 0.05, PAL.bone, 0.9)
  s.disc(cx + w * 0.02, holeY, w * 0.025, pal.accent)
  s.disc(cx + w * 0.02, holeY, w * 0.01, PAL.void)
  g1(P, cx + w * 0.02, holeY, w * 0.07, pal.accent, 0.7)
  // 洞口木瘤（像獠牙）
  for (const dx of [-1, 1]) {
    const tx = cx + dx * w * 0.14
    s.poly([[tx, holeY - h * 0.06], [tx + dx * w * 0.05, holeY + h * (atk ? 0.02 : 0.08)], [tx - dx * w * 0.01, holeY + h * 0.04]], pal.plateD)
  }
  // 鹿角状枯枝
  for (const [dx, len, spread] of [[-1, 0.22, 0.1], [1, 0.18, 0.1]]) {
    s.thick(cx + dx * w * 0.08, trunkTop + h * 0.02, cx + dx * w * 0.22, trunkTop - h * len, 1.8, pal.bodyD)
    s.thick(cx + dx * w * 0.17, trunkTop - h * len * 0.6, cx + dx * w * (0.17 + spread), trunkTop - h * (len + 0.06), 1.2, pal.bodyD)
  }
  // 垂下的枯藤
  for (let i = 0; i < 5; i++) s.thick(cx - w * 0.16 + i * w * 0.08, trunkTop + h * 0.03, cx - w * 0.16 + i * w * 0.08 + Math.sin(P.i + i) * 3, trunkTop + h * 0.18, 0.7, PAL.weed, 0.6)
  crest(s, cx + w * 0.02, trunkTop - h * 0.08, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx + w * 0.02, holeY, w * (atk ? 0.06 : 0.04), pal.core, atk ? 1.4 : 1, P)
  return { x: cx - w * 0.2, y: holeY, s: w / 190 }
}

/* 原型 49 —— 赤潮拟态（tb_red_tide）：人形浪柱 + 泡沫裙边 + 背上潮汐浮标 */
function mimicTide(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const lp = legPhase(P)
  const hipY = g - h * 0.34 + bob(P, 1.4)
  const shY = hipY - h * 0.26
  baseShadow(s, def, cx)
  // 泡沫裙边
  for (let i = 0; i < 7; i++) {
    const sx = cx - w * 0.32 + i * w * 0.11
    s.ell(sx, g - h * 0.03 + Math.sin(P.i * 0.8 + i) * 2, w * 0.09, h * 0.03, i % 2 ? pal.body : pal.bodyD, 0.8)
  }
  // 两道斜上的浪柱腿
  for (const [dx, sw] of [[-0.14, -lp], [0.12, lp]]) {
    const x = cx + w * dx
    s.thick(x, hipY, x + sw * 4 + dx * w * 0.04, g - h * 0.06, w * 0.05, pal.bodyD)
    for (let i = 0; i < 3; i++) s.px(x + sw * 4 + dx * w * 0.04 + (i - 1) * 6, g - h * 0.05, pal.body, 0.5)
  }
  // 竖直浪柱躯干 + 浪脊高光
  s.poly([[cx - w * 0.16, hipY + h * 0.02], [cx - w * 0.2, shY], [cx + w * 0.2, shY], [cx + w * 0.14, hipY + h * 0.02]], pal.body)
  for (let i = 0; i < 3; i++) s.line(cx - w * 0.12 + i * w * 0.1, hipY, cx - w * 0.14 + i * w * 0.1, shY + h * 0.02, pal.bodyL, 0.4)
  // 浪冠头 + 卷曲水舌 + 双眼
  const hY = shY - h * 0.08
  s.ell(cx, hY, w * 0.1, h * 0.07, pal.body)
  for (let i = 0; i < 4; i++) {
    const a = -2.4 + i * 0.5
    s.thick(cx + Math.cos(a) * w * 0.08, hY + Math.sin(a) * h * 0.05, cx + Math.cos(a) * w * 0.2, hY + Math.sin(a) * h * 0.14, 1.4, pal.bodyL, 0.7)
  }
  s.px(cx - w * 0.02, hY, PAL.white)
  s.px(cx + w * 0.03, hY, PAL.white)
  // 弧形水鞭双臂
  for (const [dx, reach] of [[-1, 0.16], [1, atk ? 0.4 : 0.24]]) {
    const ex = cx + dx * w * reach
    const ey = shY + h * (atk ? 0.04 : 0.14)
    s.thick(cx + dx * w * 0.14, shY + h * 0.04, ex, ey, 2.6, pal.bodyD)
    s.disc(ex, ey, w * 0.03, pal.body)
    for (let i = 0; i < 3; i++) s.px(ex + dx * (i - 1) * 4, ey + h * 0.02, pal.bodyL, 0.5)
  }
  // 背上潮汐浮标
  const bx = cx - w * 0.24
  const by = shY + h * 0.02
  s.rect(bx - w * 0.05, by - h * 0.16, w * 0.1, h * 0.18, pal.plateD)
  s.rect(bx - w * 0.06, by - h * 0.1, w * 0.12, h * 0.03, PAL.warn)
  s.rect(bx - w * 0.02, by - h * 0.22, w * 0.04, h * 0.06, pal.plate)
  g1(P, bx, by - h * 0.23, w * 0.06, PAL.warn, 0.7)
  crest(s, cx, hY - h * 0.09, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, hipY - h * 0.06, w * (atk ? 0.06 : 0.035), pal.core, atk ? 1.4 : 1, P)
  return { x: bx, y: by - h * 0.23, s: w / 190 }
}

/* 原型 50 —— 灰港吊机（tb_grey_harbor）：回转单柱 + 双向吊臂 + 中央港钟 */
function harborCrane(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.44
  const atk = P.anim === 'attack'
  const topY = g - h * 0.76 + bob(P, 1)
  const swing = Math.sin(P.i * 0.9) * (atk ? 0.14 : 0.04)
  baseShadow(s, def, cx)
  // 底座 + 回转盘
  s.rect(cx - w * 0.26, g - h * 0.14, w * 0.52, h * 0.13, pal.plateD)
  s.rect(cx - w * 0.3, g - h * 0.16, w * 0.6, h * 0.03, pal.plate)
  gearWheel(s, cx, g - h * 0.18, w * 0.07, 10, P.i * 0.15, pal.plate, pal.bodyD, pal.accent)
  // 格构单柱塔身
  s.rect(cx - w * 0.06, topY, w * 0.12, h * 0.6, pal.bodyD)
  for (let i = 0; i < 4; i++) {
    const y0 = g - h * 0.2 - i * h * 0.14
    s.line(cx - w * 0.06, y0, cx + w * 0.06, y0 - h * 0.08, pal.plate, 0.55)
    s.line(cx + w * 0.06, y0, cx - w * 0.06, y0 - h * 0.08, pal.plate, 0.55)
  }
  // 双向吊臂：左短右长
  for (const [dir, len] of [[-1, 0.28], [1, 0.4]]) {
    const tipX = cx + dir * w * len
    s.thick(cx, topY + h * 0.02, tipX, topY + h * 0.02 + swing * h, 2.4, pal.plateD)
    s.line(cx, topY - h * 0.05, tipX, topY + h * 0.02 + swing * h, pal.plate, 0.5)
    const hy = topY + h * (0.1 + (dir > 0 ? (atk ? 0.14 : 0.22) : 0.4))
    chain(s, tipX, topY + h * 0.02, tipX, hy, 8, pal.plate, pal.bodyD)
    s.thick(tipX - 3, hy, tipX + 3, hy, 1.2, pal.plate)
    s.px(tipX, hy, pal.accent)
  }
  // 塔顶司机室
  s.rect(cx - w * 0.08, topY - h * 0.1, w * 0.16, h * 0.09, pal.bodyD)
  s.rect(cx - w * 0.06, topY - h * 0.085, w * 0.12, h * 0.03, pal.accent, 0.7)
  // 中央悬挂的港钟
  const bellY = topY + h * 0.26
  s.thick(cx, topY + h * 0.04, cx, bellY - h * 0.04, 1.2, pal.plate)
  s.poly([[cx - w * 0.06, bellY], [cx - w * 0.04, bellY - h * 0.08], [cx + w * 0.04, bellY - h * 0.08], [cx + w * 0.06, bellY]], pal.plate)
  s.rect(cx - w * 0.06, bellY - h * 0.005, w * 0.12, h * 0.012, pal.plateD)
  s.thick(cx, bellY - h * 0.02, cx + Math.sin(P.i * 1.3) * 3, bellY + h * 0.05, 0.9, pal.bodyD)
  crest(s, cx, topY - h * 0.12, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, bellY - h * 0.04, w * (atk ? 0.05 : 0.03), pal.core, 0.9, P)
  return { x: cx + w * 0.4, y: topY + h * (0.1 + (atk ? 0.14 : 0.22)), s: w / 180 }
}

/* 原型 51 —— 长夜旅馆（tb_hotel_nightmare）：可行走的旅馆立面 + 门廊 + 屋顶招牌 */
function innNightmare(s, P, def, cfg, pal) {
  const { w, h } = def
  const g = s.h - 1
  const cx = w * 0.46
  const atk = P.anim === 'attack'
  const lp = legPhase(P)
  const bodyY = g - h * 0.16 + bob(P, 0.8)
  baseShadow(s, def, cx)
  // 两条门房腿 + 皮鞋
  for (const [dx, sw] of [[-0.12, -lp], [0.1, lp]]) {
    const x = cx + w * dx
    s.thick(x, bodyY, x + sw * 3, g - h * 0.05, 2.2, pal.bodyD)
    s.rect(x + sw * 3 - w * 0.05, g - 6, w * 0.1, 5, pal.plateD)
  }
  // 四层旅馆立面
  const fw = w * 0.34
  const topY = bodyY - h * 0.58
  s.rect(cx - fw, topY, fw * 2, bodyY - topY, pal.bodyD)
  s.rect(cx - fw + 2, topY + 2, fw * 2 - 4, bodyY - topY - 2, pal.body)
  for (let i = 1; i < 4; i++) s.rect(cx - fw, topY + i * h * 0.135, fw * 2, 2, pal.plateD)
  // 窗格：三列四层，部分亮灯
  for (let r = 0; r < 4; r++) {
    for (let c2 = 0; c2 < 3; c2++) {
      const wx = cx - fw + w * 0.06 + c2 * w * 0.17
      const wy = topY + h * 0.04 + r * h * 0.135
      const lit = (r * 3 + c2) % 4 === 1
      s.rect(wx, wy, w * 0.09, h * 0.09, lit ? PAL.warn : PAL.void)
      if (lit) g1(P, wx + w * 0.045, wy + h * 0.045, w * 0.04, PAL.warn, 0.5)
      s.line(wx + w * 0.045, wy, wx + w * 0.045, wy + h * 0.09, pal.plateD, 0.8)
    }
  }
  // 突出门廊 + 雨棚 + 旋转门
  const pY = bodyY - h * 0.16
  s.rect(cx - w * 0.16, pY - h * 0.12, w * 0.32, h * 0.12, pal.bodyD)
  s.poly([[cx - w * 0.2, pY - h * 0.12], [cx + w * 0.2, pY - h * 0.12], [cx + w * 0.14, pY - h * 0.18], [cx - w * 0.14, pY - h * 0.18]], pal.accent, 0.9)
  s.rect(cx - w * 0.06, pY - h * 0.1, w * 0.12, h * 0.1, mix(PAL.void, pal.bodyD, 0.2))
  // 门牌号
  s.rect(cx - w * 0.03, pY - h * 0.2, w * 0.06, h * 0.03, pal.plate)
  s.px(cx - w * 0.01, pY - h * 0.185, pal.accent)
  s.px(cx + w * 0.012, pY - h * 0.185, pal.accent)
  // 屋顶竖招牌
  s.rect(cx - w * 0.02, topY - h * 0.1, w * 0.04, h * 0.1, pal.plateD)
  s.rect(cx - w * 0.1, topY - h * 0.14, w * 0.2, h * 0.04, pal.plate)
  for (let i = 0; i < 4; i++) s.px(cx - w * 0.07 + i * w * 0.05, topY - h * 0.12, pal.accent, 0.8)
  // 檐口滴水兽
  for (const dx of [-1, 1]) s.poly([[cx + dx * fw, topY + h * 0.1], [cx + dx * (fw + w * 0.05), topY + h * 0.12], [cx + dx * fw, topY + h * 0.15]], pal.plateD)
  crest(s, cx, topY - h * 0.15, cfg.crest, pal.plate, pal.bodyD, pal.accent, w / 200)
  core(s, P, cx, pY - h * 0.06, w * (atk ? 0.06 : 0.035), pal.core, atk ? 1.4 : 1, P)
  return { x: cx - w * 0.02, y: topY - h * 0.13, s: w / 190 }
}

/* ========================================================================== */
/* 标志物表（LANDMARKS）：L01-L51，与头注释一一对应，互不重复。                 */
/* 每个 sign 的签名 (s, P, cfg, pal, x, y, k)：x/y 为 painter 返回的锚点，     */
/* k 为该 painter 给出的尺度系数。                                            */
/* ========================================================================== */
const LANDMARKS = []
const LM = (i, fn) => {
  LANDMARKS[i] = fn
}

// L01 数据环：两圈细环 + 环绕的数据点
LM(1, (s, P, cfg, pal, x, y, k) => {
  const rot = P.i * 0.22
  ringOf(s, x, y, 18 * k, 7 * k, 0.9, pal.accent, 30, 0.55)
  ringOf(s, x, y, 11 * k, 11 * k, 0.8, pal.plate, 24, 0.8)
  for (let i = 0; i < 8; i++) {
    const an = rot + (i / 8) * TAU
    s.rect(x + Math.cos(an) * 18 * k - 1, y + Math.sin(an) * 7 * k - 1, 2.4, 2.4, i % 2 ? pal.accent : PAL.signal)
  }
  s.rect(x - 3 * k, y - 3 * k, 6 * k, 6 * k, pal.bodyD)
  s.px(x, y, PAL.white)
  g1(P, x, y, 9 * k, pal.accent, 0.5)
})

// L02 装配吊钩：横梁 + 链条 + 双齿吊钩
LM(2, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 7 * k, y - 24 * k, 14 * k, 3 * k, pal.plateD)
  chain(s, x, y - 21 * k, x, y + 1 * k, 7, pal.plate, pal.bodyD)
  s.thick(x - 5 * k, y + 2 * k, x, y - 3 * k, 1.6, pal.plate)
  s.thick(x, y - 3 * k, x + 5 * k, y + 2 * k, 1.6, pal.plate)
  s.thick(x + 5 * k, y + 2 * k, x + 2 * k, y + 10 * k, 1.6, pal.plate)
  s.px(x + 2 * k, y + 10 * k, pal.accent)
  g1(P, x, y - 20 * k, 7 * k, pal.accent, 0.4)
})

// L03 轨道裁决环：倾斜审判环 + 环上三支法槌
LM(3, (s, P, cfg, pal, x, y, k) => {
  const an = P.i * 0.16
  ringOf(s, x, y, 20 * k, 8 * k, 1.2, pal.accent, 30, 0.7)
  for (let i = 0; i < 3; i++) {
    const a2 = an + (i / 3) * TAU
    const px2 = x + Math.cos(a2) * 20 * k
    const py2 = y + Math.sin(a2) * 8 * k
    s.rect(px2 - 1, py2 - 7 * k, 2, 7 * k, pal.plate)
    s.disc(px2, py2 - 8 * k, 2.2, PAL.bone)
  }
  s.rect(x - 4 * k, y - 1, 8 * k, 2, pal.plateD)
  g1(P, x, y, 14 * k, pal.accent, 0.45)
})

// L04 光帆板：三片展开的镜帆 + 太阳轮
LM(4, (s, P, cfg, pal, x, y, k) => {
  for (let i = 0; i < 3; i++) {
    const a2 = -0.9 + i * 0.5
    s.poly([[x, y], [x + Math.cos(a2) * 22 * k, y + Math.sin(a2) * 22 * k], [x + Math.cos(a2 + 0.28) * 22 * k, y + Math.sin(a2 + 0.28) * 22 * k]], mix(PAL.steelWhite, pal.accent, 0.25), 0.85)
    s.line(x, y, x + Math.cos(a2) * 22 * k, y + Math.sin(a2) * 22 * k, pal.plate, 0.8)
  }
  s.disc(x, y, 6 * k, pal.accent)
  s.disc(x, y, 2.6 * k, PAL.white)
  for (let i = 0; i < 6; i++) {
    const a2 = (i / 6) * TAU + P.i * 0.05
    s.px(x + Math.cos(a2) * 9 * k, y + Math.sin(a2) * 9 * k, PAL.warn, 0.8)
  }
  g1(P, x, y, 16 * k, PAL.warn, 0.55)
})

// L05 泄洪闸：闸框 + 三道闸板 + 下游水舌
LM(5, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 10 * k, y - 16 * k, 20 * k, 26 * k, pal.plateD)
  s.rect(x - 8 * k, y - 14 * k, 16 * k, 22 * k, PAL.waterDeep, 0.9)
  for (let i = 0; i < 3; i++) s.rect(x - 8 * k, y - 12 * k + i * 7 * k, 16 * k, 2, pal.plate)
  for (let i = 0; i < 4; i++) {
    const sx = x - 6 * k + i * 4.5 * k
    s.thick(sx, y + 8 * k, sx + Math.sin(P.i + i) * 2, y + 18 * k, 1.2, PAL.waterHi, 0.55)
  }
  s.disc(x, y + 9 * k, 2.4 * k, pal.accent)
  g1(P, x, y, 12 * k, PAL.waterHi, 0.4)
})

// L06 桥索桁架：双弦梁 + 三角腹杆 + 端墩
LM(6, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 16 * k, y - 2 * k, 32 * k, 3 * k, pal.plateD)
  for (let i = 0; i < 6; i++) {
    const c1 = x - 15 * k + i * 6 * k
    s.line(c1, y - 2 * k, c1 + 3 * k, y - 10 * k, pal.plate, 0.9)
    s.line(c1 + 3 * k, y - 10 * k, c1 + 6 * k, y - 2 * k, pal.plate, 0.9)
  }
  s.rect(x - 17 * k, y - 10 * k, 34 * k, 1.4, pal.plate)
  for (const dx of [-1, 1]) {
    s.rect(x + dx * 16 * k - 1.5, y - 2 * k, 3, 12 * k, pal.plateD)
    s.disc(x + dx * 16 * k, y + 11 * k, 2.2 * k, pal.plate)
  }
  g1(P, x, y - 7 * k, 8 * k, pal.accent, 0.35)
})

// L07 辐条巨轮：带八根辐条的旋转巨轮
LM(7, (s, P, cfg, pal, x, y, k) => {
  const R = 13 * k
  s.ell(x, y, R, R, pal.bodyD)
  s.ell(x, y, R - 2.5 * k, R - 2.5 * k, pal.plate, 0.9)
  for (let i = 0; i < 8; i++) {
    const a2 = (i / 8) * TAU + P.i * 0.25
    s.thick(x, y, x + Math.cos(a2) * (R - 3 * k), y + Math.sin(a2) * (R - 3 * k), 1.1, pal.plateD)
  }
  s.disc(x, y, 3.4 * k, pal.accent)
  s.disc(x, y, 1.4 * k, PAL.void)
  g1(P, x, y, 14 * k, PAL.warn, 0.35)
})

// L08 塔吊配重：悬臂 + 配重块 + 吊索
LM(8, (s, P, cfg, pal, x, y, k) => {
  s.thick(x - 14 * k, y, x + 16 * k, y - 6 * k, 2, pal.plateD)
  s.rect(x - 20 * k, y - 4 * k, 12 * k, 12 * k, pal.bodyD)
  s.rect(x - 20 * k, y - 4 * k, 12 * k, 2, pal.plate)
  for (let i = 0; i < 3; i++) s.px(x - 18 * k + i * 4 * k, y, pal.accent, 0.7)
  s.thick(x + 15 * k, y - 6 * k, x + 15 * k, y + 8 * k, 0.9, pal.plate)
  s.px(x + 15 * k, y + 8 * k, pal.accent)
  s.rect(x - 2 * k, y - 4 * k, 4, 8 * k, pal.plateD)
  g1(P, x - 14 * k, y + 4 * k, 8 * k, pal.accent, 0.4)
})

// L09 铁笼面罩：栅条椭圆面罩 + 双眼
LM(9, (s, P, cfg, pal, x, y, k) => {
  s.ell(x, y, 11 * k, 13 * k, pal.bodyD)
  s.ell(x, y, 10 * k, 12 * k, PAL.void)
  for (let i = 0; i < 4; i++) s.rect(x - 9 * k + i * 5 * k, y - 11 * k, 1.4, 22 * k, pal.plate)
  for (let i = 0; i < 2; i++) s.rect(x - 9 * k, y - 7 * k + i * 8 * k, 18 * k, 1.4, pal.plate)
  s.px(x - 4 * k, y - 2 * k, pal.accent)
  s.px(x + 4 * k, y - 2 * k, pal.accent)
  g1(P, x, y, 10 * k, pal.accent, 0.45)
})

// L10 废铁磁叉：马蹄形电磁铁 + 极头
LM(10, (s, P, cfg, pal, x, y, k) => {
  s.thick(x - 7 * k, y - 12 * k, x - 7 * k, y + 6 * k, 3.4, PAL.neonRed, 0.9)
  s.thick(x + 7 * k, y - 12 * k, x + 7 * k, y + 6 * k, 3.4, PAL.neonRed, 0.9)
  s.line(x - 7 * k, y + 6 * k, x + 7 * k, y + 6 * k, PAL.neonRed, 0.9)
  s.rect(x - 9 * k, y - 14 * k, 4, 6 * k, pal.plate)
  s.rect(x + 5 * k, y - 14 * k, 4, 6 * k, pal.plate)
  for (let i = 0; i < 3; i++) s.px(x + (i - 1) * 4 * k, y - 15 * k, pal.accent, 0.6)
  g1(P, x, y - 2 * k, 10 * k, PAL.neonRed, 0.5)
})

// L11 输液袋架：立杆 + 滴袋 + 导管
LM(11, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 1, y - 20 * k, 2, 30 * k, pal.plate)
  s.line(x, y - 20 * k, x + 8 * k, y - 20 * k, pal.plate, 0.9)
  s.poly([[x + 4 * k, y - 19 * k], [x + 12 * k, y - 19 * k], [x + 11 * k, y - 8 * k], [x + 5 * k, y - 8 * k]], mix(PAL.glass, pal.accent, 0.3), 0.8)
  s.rect(x + 5 * k, y - 11 * k, 6 * k, 2, pal.accent, 0.7)
  s.thick(x + 8 * k, y - 8 * k, x + 8 * k, y + 6 * k, 0.7, PAL.glass, 0.8)
  s.px(x + 8 * k, y + 6 * k, PAL.toxicGlow)
  s.rect(x - 5 * k, y + 10 * k, 10 * k, 2, pal.plateD)
  g1(P, x + 8 * k, y - 14 * k, 8 * k, pal.accent, 0.4)
})

// L12 广播喇叭阵：四只扇形排开的喇叭
LM(12, (s, P, cfg, pal, x, y, k) => {
  for (let i = 0; i < 4; i++) {
    const a2 = -0.6 + i * 0.4
    const ex = x + Math.cos(a2) * 16 * k
    const ey = y + Math.sin(a2) * 16 * k
    s.poly([[x, y], [ex + Math.cos(a2 + 1.4) * 5 * k, ey + Math.sin(a2 + 1.4) * 5 * k], [ex + Math.cos(a2 - 1.4) * 5 * k, ey + Math.sin(a2 - 1.4) * 5 * k]], pal.plateD)
    s.disc(ex, ey, 2.2 * k, pal.accent, 0.7)
    if (P.anim === 'attack') arcOf(s, ex, ey, 8 * k, 8 * k, 0.7, pal.accent, a2 - 0.4, a2 + 0.4, 6, 0.35)
  }
  s.disc(x, y, 5 * k, pal.bodyD)
  g1(P, x, y, 12 * k, pal.accent, 0.5)
})

// L13 挂穗镰架：长柄镰 + 倒挂的麦穗
LM(13, (s, P, cfg, pal, x, y, k) => {
  s.thick(x - 10 * k, y + 18 * k, x + 2 * k, y - 14 * k, 1.6, pal.plateD)
  s.poly([[x + 2 * k, y - 14 * k], [x + 18 * k, y - 20 * k], [x + 14 * k, y - 14 * k], [x + 2 * k, y - 10 * k]], pal.plate)
  s.line(x + 3 * k, y - 13 * k, x + 16 * k, y - 18 * k, PAL.steelWhite, 0.7)
  for (let i = 0; i < 5; i++) {
    const wx = x - 12 * k + i * 3 * k
    s.thick(wx, y + 6 * k, wx + (i - 2) * 2, y - 8 * k, 0.9, PAL.ochre, 0.9)
    s.poly([[wx + (i - 2) * 2, y - 8 * k], [wx + (i - 2) * 2 - 2, y - 13 * k], [wx + (i - 2) * 2 + 3, y - 12 * k]], PAL.warn, 0.9)
  }
  s.rect(x - 13 * k, y + 4 * k, 10 * k, 2, pal.plateD)
  g1(P, x + 6 * k, y - 16 * k, 8 * k, PAL.warn, 0.4)
})

// L14 酸液腹囊：三只垂挂的半透明酸囊
LM(14, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 12 * k, y - 12 * k, 24 * k, 2, pal.plateD)
  for (const [dx, dy, r] of [[-8, 0, 6], [0, 5, 7.5], [8, -2, 5]]) {
    s.thick(x + dx * k, y - 10 * k, x + dx * k, y + (dy - r) * k, 1.1, pal.bodyD)
    s.ell(x + dx * k, y + dy * k, r * k, (r + 2) * k, mix(PAL.toxicGlow, pal.accent, 0.4), 0.8)
    s.ell(x + dx * k - 1.5 * k, y + (dy - 2) * k, r * 0.4 * k, r * 0.5 * k, PAL.fruitHi, 0.5)
    s.px(x + dx * k, y + (dy + r + 2) * k, pal.accent)
    g1(P, x + dx * k, y + dy * k, r * 1.4 * k, PAL.toxicGlow, 0.5)
  }
})

// L15 腐果吊篮：藤篮 + 卡在篮里的腐果
LM(15, (s, P, cfg, pal, x, y, k) => {
  s.thick(x, y - 16 * k, x, y - 8 * k, 1, pal.plate)
  s.poly([[x - 10 * k, y - 8 * k], [x + 10 * k, y - 8 * k], [x + 7 * k, y + 6 * k], [x - 7 * k, y + 6 * k]], pal.plateD)
  for (let i = 0; i < 4; i++) s.rect(x - 9 * k + i * 4.5 * k, y - 8 * k, 1, 14 * k, pal.plate, 0.8)
  for (let i = 0; i < 3; i++) {
    const fx = x - 5 * k + i * 5 * k
    s.disc(fx, y - 2 * k + (i % 2) * 3 * k, 3 * k, PAL.mossDead)
    s.disc(fx - 1, y - 3 * k + (i % 2) * 3 * k, 1.2 * k, PAL.toxic)
    g1(P, fx, y - 2 * k, 4 * k, PAL.toxicGlow, 0.35)
  }
  s.px(x, y + 10 * k, pal.accent, 0.6)
})

// L16 巨钟：带裂缝的悬钟 + 摆动钟舌
LM(16, (s, P, cfg, pal, x, y, k) => {
  const sway = Math.sin(P.i * 1.1) * 2
  s.thick(x, y - 20 * k, x + sway, y - 12 * k, 1, pal.plate)
  s.poly([[x - 12 * k + sway, y + 6 * k], [x - 7 * k + sway, y - 13 * k], [x + 7 * k + sway, y - 13 * k], [x + 12 * k + sway, y + 6 * k]], pal.plate)
  s.rect(x - 12 * k + sway, y + 5 * k, 24 * k, 2.4 * k, pal.plateD)
  s.rect(x - 7 * k + sway, y - 14 * k, 14 * k, 2, pal.bodyL)
  for (let i = 0; i < 2; i++) s.line(x - 9 * k + sway, y - 8 * k + i * 5 * k, x - 4 * k + sway, y + 2 * k + i * 5 * k, pal.bodyD, 0.6)
  s.thick(x + sway * 2, y, x + sway * 2 + Math.sin(P.i * 1.6) * 4 * k, y + 12 * k, 1.1, pal.plateD)
  s.disc(x + sway * 2 + Math.sin(P.i * 1.6) * 4 * k, y + 12 * k, 2 * k, pal.plate)
  g1(P, x + sway, y - 4 * k, 14 * k, PAL.warn, 0.35)
})

// L17 分裂双芯：两枚互绕的发光核心
LM(17, (s, P, cfg, pal, x, y, k) => {
  const sep = 7 * k + Math.sin(P.i * 0.8) * 1.5 * k
  s.thick(x - sep, y, x + sep, y, 1.6, pal.plateD)
  s.disc(x - sep, y, 5 * k, pal.bodyD)
  s.disc(x + sep, y, 5 * k, pal.bodyD)
  s.disc(x - sep, y, 3 * k, pal.accent, 0.9)
  s.disc(x + sep, y, 3 * k, pal.accent, 0.9)
  s.disc(x - sep - 1, y - 1, 1.2 * k, PAL.white)
  s.disc(x + sep - 1, y - 1, 1.2 * k, PAL.white)
  for (let i = 0; i < 5; i++) s.px(x - sep + (i / 4) * sep * 2, y + Math.sin(P.i + i) * 2 * k, PAL.signal, 0.5)
  g1(P, x - sep, y, 8 * k, pal.accent, 0.55)
  g1(P, x + sep, y, 8 * k, pal.accent, 0.55)
})

// L18 节肢注射器：斜插在背上的巨型注射器，活塞随攻击帧推进
LM(18, (s, P, cfg, pal, x, y, k) => {
  const push = P.anim === 'attack' ? 3 * k : 0
  s.thick(x - 14 * k, y + 8 * k, x + 6 * k, y - 10 * k, 2.4 * k, pal.plateD)
  s.poly([[x + 4 * k, y - 12 * k], [x + 11 * k, y - 15 * k], [x + 9 * k, y - 7 * k]], pal.plate)
  s.thick(x + 7 * k, y - 11 * k, x + 15 * k, y - 19 * k, 1, PAL.steelWhite)
  s.rect(x - 6 * k + push, y - 5 * k - push, 10 * k, 4 * k, pal.bodyD)
  s.rect(x - 5 * k + push, y - 4.6 * k - push, 8 * k, 2 * k, mix(pal.accent, PAL.white, 0.3), 0.7)
  for (let i = 0; i < 3; i++) s.line(x - 11 * k + i * 5 * k, y + 5 * k - i * 4 * k, x - 9 * k + i * 5 * k, y + 2 * k - i * 4 * k, pal.plate, 0.8)
  s.px(x + 15 * k, y - 19 * k, PAL.signal, 0.9)
  g1(P, x + 6 * k, y - 9 * k, 9 * k, PAL.acid, 0.4)
})

// L19 脑槽镜面：半球玻璃罩内的脑，表面一道高光弧
LM(19, (s, P, cfg, pal, x, y, k) => {
  s.ell(x, y, 11 * k, 8 * k, pal.plateD)
  s.ell(x, y - 1 * k, 10 * k, 7 * k, mix(PAL.glass, PAL.void, 0.45), 0.9)
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i / 4) * Math.PI
    s.disc(x + Math.cos(a) * 6 * k, y + Math.sin(a) * 4 * k, 2.4 * k, PAL.ink, 0.7)
  }
  s.disc(x + 2 * k, y - 3 * k, 2.6 * k, pal.accent, 0.85)
  arcOf(s, x - 2 * k, y - 2 * k, 6 * k, 4.5 * k, 0.7, PAL.white, Math.PI * 1.1, Math.PI * 1.55, 8, 0.75)
  s.rect(x - 11 * k, y + 7 * k, 22 * k, 2 * k, pal.plate)
  s.px(x - 9 * k, y + 7 * k, pal.accent, 0.8)
  g1(P, x, y, 11 * k, pal.accent, 0.35)
})

// L20 观测镜片环：三层同心透镜 + 旋转刻度
LM(20, (s, P, cfg, pal, x, y, k) => {
  const rot = P.i * 0.25
  for (let r = 3; r >= 1; r--) {
    ringOf(s, x, y, r * 5 * k, r * 5 * k, 1, r % 2 ? pal.plate : pal.plateD, 30)
  }
  s.disc(x, y, 4.2 * k, PAL.glass, 0.55)
  s.disc(x, y, 2.6 * k, pal.accent, 0.9)
  s.disc(x - 1 * k, y - 1 * k, 1.1 * k, PAL.white)
  for (let i = 0; i < 4; i++) {
    const a = rot + (i / 4) * TAU
    s.rect(x + Math.cos(a) * 15 * k - 1, y + Math.sin(a) * 15 * k - 1, 2, 2, pal.plate)
  }
  s.thick(x - 15 * k, y, x - 6 * k, y, 1.6, pal.plateD)
  g1(P, x, y, 15 * k, PAL.neonCold, 0.3)
})

// L21 勋章链：斜挂胸前的绶带 + 三枚歪斜勋章
LM(21, (s, P, cfg, pal, x, y, k) => {
  s.poly([[x - 13 * k, y - 9 * k], [x - 8 * k, y - 10 * k], [x + 12 * k, y + 9 * k], [x + 7 * k, y + 11 * k]], mix(pal.accent, PAL.ink, 0.4), 0.95)
  for (let i = 0; i < 3; i++) {
    const t = [0.15, 0.45, 0.78][i]
    const mx = x - 13 * k + 25 * k * t
    const my = y - 9 * k + 20 * k * t
    s.disc(mx, my, 3.4 * k, PAL.warn)
    s.disc(mx, my, 2.2 * k, pal.plateD)
    s.px(mx, my, PAL.white, 0.7)
    s.line(mx, my + 3 * k, mx + Math.sin(P.i * 0.9 + i) * 1.5 * k, my + 7 * k, PAL.warn, 0.6)
  }
  s.px(x + 11 * k, y + 8 * k, pal.accent, 0.6)
})

// L22 悬浮书页：绕身旋转的四张残页
LM(22, (s, P, cfg, pal, x, y, k) => {
  for (let i = 0; i < 4; i++) {
    const a = P.i * 0.16 + (i / 4) * TAU
    const px = x + Math.cos(a) * 15 * k
    const py = y + Math.sin(a) * 6 * k
    const w = 6 * k
    s.poly([[px - w, py - 4 * k], [px + w, py - 5 * k], [px + w * 0.8, py + 4 * k], [px - w * 0.9, py + 3 * k]], PAL.paper, 0.92)
    for (let j = 0; j < 3; j++) s.line(px - w * 0.6, py - 2 * k + j * 2.5 * k, px + w * 0.5, py - 2.5 * k + j * 2.5 * k, PAL.boneDark, 0.6)
    s.px(px, py, pal.accent, 0.5)
  }
  g1(P, x, y, 15 * k, PAL.paper, 0.2)
})

// L23 讲台黑板：倾斜的板面 + 粉笔字迹 + 托架
LM(23, (s, P, cfg, pal, x, y, k) => {
  s.thick(x - 10 * k, y + 12 * k, x - 13 * k, y + 20 * k, 1.4, pal.plateD)
  s.thick(x + 9 * k, y + 12 * k, x + 12 * k, y + 20 * k, 1.4, pal.plateD)
  s.poly([[x - 15 * k, y - 12 * k], [x + 15 * k, y - 14 * k], [x + 13 * k, y + 12 * k], [x - 13 * k, y + 12 * k]], PAL.ink)
  s.rect(x - 14 * k, y - 13 * k, 29 * k, 1.6, PAL.boneDeep)
  for (let i = 0; i < 4; i++) {
    const ly = y - 8 * k + i * 5 * k
    s.line(x - 10 * k, ly, x - 10 * k + (7 + (i % 2) * 5) * k, ly, PAL.bone, 0.55)
  }
  s.line(x + 3 * k, y - 8 * k, x + 9 * k, y - 3 * k, PAL.sand, 0.4)
  s.rect(x - 15 * k, y + 12 * k, 30 * k, 3 * k, pal.plateD)
  g1(P, x + 8 * k, y - 12 * k, 8 * k, PAL.warn, 0.25)
})

// L24 试管架：木架 + 四支不同液面的试管
LM(24, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 15 * k, y + 6 * k, 30 * k, 3.4 * k, pal.plateD)
  s.rect(x - 15 * k, y - 2 * k, 30 * k, 2.4 * k, pal.plate)
  for (let i = 0; i < 4; i++) {
    const tx = x - 11 * k + i * 7.5 * k
    const lv = 0.35 + ((i * 37) % 50) / 100
    s.rect(tx - 1.8 * k, y - 12 * k, 3.6 * k, 18 * k, mix(PAL.glass, PAL.void, 0.5), 0.85)
    s.rect(tx - 1.4 * k, y - 12 * k + 18 * k * (1 - lv), 2.8 * k, 18 * k * lv, i % 2 ? PAL.toxicGlow : pal.accent, 0.8)
    s.rect(tx - 1.8 * k, y - 13 * k, 3.6 * k, 1.4, PAL.steelWhite, 0.8)
    if (i % 3 === 0) g1(P, tx, y - 4 * k, 4 * k, PAL.toxicGlow, 0.35)
  }
  s.rect(x - 15 * k, y + 2 * k, 30 * k, 1.4, pal.plate)
})

// L25 滚筒印版：两只对滚的印辊 + 压出的纸
LM(25, (s, P, cfg, pal, x, y, k) => {
  const rot = P.i * 0.4
  for (const [ox, dir] of [[-8, 1], [8, -1]]) {
    gearWheel(s, x + ox * k, y - 4 * k, 6 * k, 10, rot * dir, pal.plate, pal.plateD, pal.bodyL)
  }
  for (let i = 0; i < 4; i++) s.line(x - 15 * k + i * 9 * k, y + 2 * k, x - 13 * k + i * 9 * k, y + 8 * k, pal.plateD, 0.8)
  s.poly([[x - 14 * k, y + 8 * k], [x + 14 * k, y + 7 * k], [x + 13 * k, y + 14 * k], [x - 13 * k, y + 15 * k]], PAL.paper, 0.92)
  for (let i = 0; i < 3; i++) s.line(x - 10 * k, y + 10 * k + i * 1.6 * k, x + 10 * k, y + 9.6 * k + i * 1.6 * k, PAL.boneDeep, 0.55)
  g1(P, x, y - 4 * k, 10 * k, PAL.warn, 0.25)
})

// L26 标本瓶：圆柱玻璃瓶 + 泡在药水里的标本剪影
LM(26, (s, P, cfg, pal, x, y, k) => {
  const wob = Math.sin(P.i * 0.7) * 1.2 * k
  s.ell(x, y - 15 * k, 8 * k, 3 * k, pal.plateD)
  s.rect(x - 7 * k, y - 15 * k, 14 * k, 24 * k, mix(PAL.glass, PAL.void, 0.55), 0.85)
  s.rect(x - 6 * k, y - 4 * k, 12 * k, 11 * k, mix(PAL.toxic, PAL.void, 0.35), 0.85)
  s.disc(x, y - 9 * k, 3.2 * k, PAL.boneDark, 0.9)
  s.thick(x, y - 6 * k, x - 2 * k + wob, y + 1 * k, 1.2, PAL.boneDark, 0.9)
  s.thick(x, y - 4 * k, x + 3 * k + wob, y, 1, PAL.boneDark, 0.9)
  s.rect(x - 8 * k, y - 16 * k, 16 * k, 2 * k, pal.plate)
  s.rect(x - 10 * k, y + 8 * k, 20 * k, 3 * k, pal.plateD)
  s.px(x - 5 * k, y - 14 * k, PAL.white, 0.5)
  g1(P, x, y - 2 * k, 9 * k, PAL.toxicGlow, 0.3)
})

// L27 钥匙串：腰侧铁环上挂着的六把大小不一的钥匙
LM(27, (s, P, cfg, pal, x, y, k) => {
  const j = Math.sin(P.i * 1.3) * 1.5 * k
  ringOf(s, x, y - 4 * k, 5 * k, 5 * k, 0.9, pal.plate, 22)
  for (let i = 0; i < 6; i++) {
    const a = -0.3 + i * 0.36
    const kx = x + Math.sin(a) * 5 * k
    const ky = y - 4 * k + Math.cos(a) * 5 * k
    const len = (6 + (i % 3) * 3) * k
    s.thick(kx, ky, kx + j * 0.4, ky + len, 0.9, i % 2 ? pal.plateD : pal.plate)
    s.rect(kx + j * 0.4 - 1.6 * k, ky + len - 1 * k, 3.2 * k, 2.4 * k, pal.plate)
    s.rect(kx + j * 0.4 + 1 * k, ky + len - 3.6 * k, 1.6, 2.4 * k, pal.plate)
    s.rect(kx + j * 0.4 + 1 * k, ky + len - 6.4 * k, 1.6, 2.4 * k, pal.plate)
  }
  g1(P, x, y - 4 * k, 8 * k, PAL.warn, 0.2)
})

// L28 服务铃：黄铜前台铃 + 抖动的铃锤 + 底座
LM(28, (s, P, cfg, pal, x, y, k) => {
  const shake = P.anim === 'attack' ? Math.sin(P.i * 3) * 1.6 * k : 0
  s.rect(x - 12 * k, y + 4 * k, 24 * k, 3 * k, pal.plateD)
  s.ell(x, y + 4 * k, 10 * k, 2 * k, pal.plate)
  s.ell(x + shake, y - 1 * k, 9 * k, 7 * k, PAL.warn)
  s.ell(x + shake, y - 2 * k, 7 * k, 5 * k, mix(PAL.warn, PAL.white, 0.3), 0.5)
  s.rect(x + shake - 1.4 * k, y - 9 * k, 2.8 * k, 3 * k, pal.plateD)
  s.disc(x + shake, y - 9.5 * k, 1.8 * k, pal.plate)
  s.thick(x, y - 16 * k, x + shake, y - 10 * k, 0.8, PAL.steelWhite)
  if (P.anim === 'attack') {
    for (let i = 1; i <= 2; i++) arcOf(s, x + shake, y - 2 * k, (9 + i * 3) * k, (7 + i * 3) * k, 0.6, PAL.warn, -2.6, -0.5, 8, 0.4)
  }
  g1(P, x + shake, y - 3 * k, 9 * k, PAL.warn, 0.25)
})

// L29 船锚：十字锚杆 + 双爪 + 锚链
LM(29, (s, P, cfg, pal, x, y, k) => {
  const sway = Math.sin(P.i * 0.9) * 1.5 * k
  chain(s, x, y - 20 * k, x + sway, y - 8 * k, 5, pal.plate, pal.plateD)
  s.rect(x + sway - 1.4 * k, y - 9 * k, 2.8 * k, 20 * k, pal.plateD)
  s.rect(x + sway - 3.4 * k, y - 11 * k, 6.8 * k, 2 * k, pal.plate)
  s.thick(x + sway - 12 * k, y + 2 * k, x + sway + 12 * k, y + 2 * k, 1.8, pal.plateD)
  for (const dir of [-1, 1]) {
    s.poly([[x + sway + dir * 12 * k, y + 2 * k], [x + sway + dir * 16 * k, y + 7 * k], [x + sway + dir * 11 * k, y + 10 * k]], pal.plate)
    s.poly([[x + sway + dir * 11 * k, y + 10 * k], [x + sway + dir * 9 * k, y + 4 * k], [x + sway + dir * 6 * k, y + 6 * k]], pal.plateD)
    s.px(x + sway + dir * 15 * k, y + 6 * k, pal.accent, 0.5)
  }
  s.px(x + sway, y + 10 * k, pal.accent, 0.7)
  g1(P, x + sway, y - 2 * k, 10 * k, PAL.waterHi, 0.2)
})

// L30 旋转灯室：栏杆平台 + 四面透镜 + 扫射光柱
LM(30, (s, P, cfg, pal, x, y, k) => {
  const a = P.i * 0.12
  s.rect(x - 11 * k, y + 6 * k, 22 * k, 2 * k, pal.plateD)
  for (let i = 0; i < 5; i++) s.thick(x - 10 * k + i * 5 * k, y + 6 * k, x - 10 * k + i * 5 * k, y - 1 * k, 0.7, pal.plate, 0.8)
  s.rect(x - 11 * k, y - 1.4 * k, 22 * k, 1.4, pal.plate)
  s.rect(x - 7 * k, y - 9 * k, 14 * k, 8 * k, mix(PAL.glass, PAL.void, 0.4), 0.9)
  s.rect(x - 7 * k, y - 10 * k, 14 * k, 1.6, pal.plateD)
  for (let i = 0; i < 2; i++) {
    const la = a + i * Math.PI
    const lx = x + Math.cos(la) * 4 * k
    s.rect(Math.min(lx, x) - 1, y - 8 * k, 2, 6 * k, PAL.warn, 0.85)
  }
  const beam = Math.cos(a)
  s.poly(
    [
      [x + beam * 6 * k, y - 6 * k],
      [x + beam * 34 * k, y - 12 * k],
      [x + beam * 34 * k, y + 2 * k],
      [x + beam * 6 * k, y - 3 * k],
    ],
    PAL.warn,
    0.16,
  )
  g1(P, x, y - 5 * k, 12 * k, PAL.warn, 0.5)
})

// L31 龙骨肋：一排外露的船肋弧 + 中央脊梁
LM(31, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 2 * k, y - 20 * k, 4 * k, 38 * k, pal.plateD)
  for (let i = 0; i < 5; i++) {
    const ry = y - 16 * k + i * 8 * k
    const rr = (17 - i * 2.4) * k
    arcOf(s, x, ry, rr, rr * 0.8, 1.2, i % 2 ? pal.plate : pal.bodyL, Math.PI * 1.02, Math.PI * 1.98, 12, 0.95)
    s.px(x - 1, ry - rr * 0.8, pal.accent, 0.4)
  }
  for (let i = 0; i < 4; i++) s.line(x - 12 * k + i * 2 * k, y - 12 * k + i * 3 * k, x + 12 * k - i * 2 * k, y - 12 * k + i * 3 * k, pal.bodyD, 0.5)
  s.px(x, y + 16 * k, pal.accent, 0.6)
  g1(P, x, y, 14 * k, pal.accent, 0.15)
})

// L32 坞门绞盘：双齿轮 + 绕绳滚筒 + 闸门链
LM(32, (s, P, cfg, pal, x, y, k) => {
  const rot = P.i * (P.anim === 'attack' ? 0.5 : 0.18)
  gearWheel(s, x - 9 * k, y - 6 * k, 5.5 * k, 9, rot, pal.plate, pal.plateD, pal.bodyL)
  gearWheel(s, x + 9 * k, y - 6 * k, 5.5 * k, 9, -rot, pal.plate, pal.plateD, pal.bodyL)
  s.rect(x - 13 * k, y + 1 * k, 26 * k, 3 * k, pal.plateD)
  s.ell(x, y + 1 * k, 8 * k, 4 * k, mix(pal.plate, PAL.rustDark, 0.4), 0.9)
  for (let i = 0; i < 4; i++) s.line(x - 7 * k + i * 5 * k, y - 1 * k, x - 5 * k + i * 5 * k, y + 3 * k, pal.bodyD, 0.7)
  for (const dir of [-1, 1]) chain(s, x + dir * 9 * k, y + 2 * k, x + dir * 9 * k, y + 18 * k, 6, pal.plate, pal.plateD)
  s.rect(x - 2 * k, y + 16 * k, 4 * k, 4 * k, pal.plate)
  g1(P, x, y - 6 * k, 10 * k, PAL.warn, 0.2)
})

// L33 高压线圈：陶瓷绝缘柱 + 层层线圈 + 顶端电弧
LM(33, (s, P, cfg, pal, x, y, k) => {
  const zz = Math.sin(P.i * 2.2)
  s.rect(x - 4 * k, y - 14 * k, 8 * k, 22 * k, PAL.boneDark)
  for (let i = 0; i < 6; i++) {
    const yy = y - 12 * k + i * 4 * k
    s.ell(x, yy, 6 * k, 2 * k, i % 2 ? pal.plate : pal.plateD)
    s.rect(x - 12 * k, yy, 3 * k, 1.4, pal.plateD)
    if (i % 2 === 1) s.rect(x + 9 * k, yy, 3 * k, 1.4, pal.plateD)
  }
  s.disc(x, y - 16 * k, 3 * k, pal.plate)
  for (let i = 0; i < 3; i++) {
    const sag = (1 - Math.abs(i - 1)) * 2 * k
    s.line(x + (i - 1) * 8 * k, y + 9 * k, x + (i - 1) * 8 * k, y + 9 * k + sag + 3 * k, PAL.steelWhite, 0.7)
  }
  const fx = x + zz * 2 * k
  s.line(x, y - 18 * k, fx - 4 * k, y - 22 * k, PAL.signal, 0.85)
  s.line(fx - 4 * k, y - 22 * k, fx + 5 * k, y - 24 * k, PAL.signal, 0.85)
  s.line(fx + 5 * k, y - 24 * k, fx + 1 * k, y - 28 * k, PAL.signal, 0.85)
  g1(P, x, y - 20 * k, 9 * k, PAL.signal, 0.6)
})

// L34 观察潜望镜：L 形镜筒 + 顶部反射窗 + 手轮
LM(34, (s, P, cfg, pal, x, y, k) => {
  const pan = Math.sin(P.i * 0.6) * 3 * k
  s.rect(x - 3 * k, y - 2 * k, 6 * k, 20 * k, pal.plateD)
  s.rect(x - 3 * k, y - 2 * k, 1.4, 20 * k, pal.bodyL, 0.5)
  s.rect(x - 4 * k, y - 18 * k, 18 * k, 7 * k, pal.plate)
  s.rect(x + 12 * k, y - 17 * k + pan * 0.2, 2 * k, 5 * k, mix(PAL.glass, PAL.void, 0.35), 0.9)
  s.rect(x - 4 * k, y - 19 * k, 18 * k, 2 * k, pal.plateD)
  s.ell(x - 1 * k, y - 14.5 * k, 2 * k, 2 * k, PAL.neonCold, 0.55)
  ringOf(s, x, y + 8 * k, 4 * k, 3 * k, 0.8, pal.plate, 16)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + P.i * 0.1
    s.thick(x, y + 8 * k, x + Math.cos(a) * 5 * k, y + 8 * k + Math.sin(a) * 4 * k, 0.7, pal.plateD)
  }
  g1(P, x + 12 * k, y - 14.5 * k, 6 * k, PAL.neonCold, 0.45)
})

// L35 巨型钻头：锥形螺旋钻 + 液压推进座
LM(35, (s, P, cfg, pal, x, y, k) => {
  const spin = P.i * 0.5
  const down = P.anim === 'attack' ? 5 * k : 0
  s.rect(x - 9 * k, y - 16 * k, 18 * k, 9 * k, pal.plateD)
  s.rect(x - 7 * k, y - 15 * k, 14 * k, 3 * k, pal.plate)
  for (const dx of [-6, 6]) s.thick(x + dx * k, y - 7 * k, x + dx * 0.7 * k, y + 4 * k + down, 1.6, pal.bodyL, 0.7)
  const tipY = y + 20 * k + down
  s.poly([[x - 7 * k, y + 4 * k + down], [x + 7 * k, y + 4 * k + down], [x, tipY]], pal.plate)
  for (let i = 0; i < 6; i++) {
    const t = i / 6
    const yy = y + 5 * k + down + t * 14 * k
    const rr = (7 - t * 6.4) * k
    const off = Math.sin(spin + i * 1.1) * rr * 0.5
    s.line(x - rr + off, yy, x + rr + off, yy + 1.6 * k, pal.plateD, 0.95)
  }
  s.px(x, tipY, pal.accent, 0.9)
  s.px(x - 3 * k, tipY - 3 * k, PAL.steelWhite, 0.5)
  g1(P, x, y + 8 * k, 9 * k, pal.accent, 0.3)
})

// L36 炉门：铸铁炉膛口 + 栅栏 + 内部火光
LM(36, (s, P, cfg, pal, x, y, k) => {
  const flicker = 0.55 + Math.sin(P.i * 1.7) * 0.2
  s.rect(x - 14 * k, y - 13 * k, 28 * k, 26 * k, pal.plateD)
  s.rect(x - 12 * k, y - 11 * k, 24 * k, 22 * k, pal.plate)
  s.ell(x, y, 9 * k, 8 * k, PAL.rustDeep)
  s.ell(x, y + 1 * k, 7.5 * k, 6.5 * k, mix(PAL.rustHot, PAL.warn, 0.4), flicker)
  for (let i = 0; i < 4; i++) s.rect(x - 9 * k, y - 7 * k + i * 4 * k, 18 * k, 1.6, PAL.ink, 0.85)
  for (let i = 0; i < 6; i++) s.px(x - 14 * k + i * 5.6 * k, y - 13 * k, PAL.steelWhite, 0.6)
  s.rect(x - 15 * k, y + 12 * k, 30 * k, 3 * k, PAL.ink)
  for (let i = 0; i < 3; i++) s.px(x - 6 * k + i * 6 * k, y + 14 * k, pal.accent, 0.7)
  g1(P, x, y, 13 * k, PAL.rustHot, 0.7)
})

// L37 燃料棒束：七根带箍的发光棒 + 顶部吊架
LM(37, (s, P, cfg, pal, x, y, k) => {
  s.rect(x - 14 * k, y - 18 * k, 28 * k, 2.6 * k, pal.plateD)
  for (let i = 0; i < 7; i++) {
    const rx = x - 12 * k + i * 4 * k
    const len = (22 + (i % 3) * 4) * k
    rod(s, rx, y - 16 * k, len, 1.5 * k, mix(PAL.boneDark, PAL.void, 0.3), pal.plateD, pal.accent)
    const pulse = 0.45 + Math.sin(P.i * 0.9 + i) * 0.25
    s.rect(rx - 1 * k, y - 14 * k, 2 * k, len - 4 * k, pal.accent, pulse)
    g1(P, rx, y - 6 * k, 4 * k, pal.accent, 0.4)
  }
  s.rect(x - 14 * k, y + 10 * k, 28 * k, 2.4 * k, pal.plate)
  s.rect(x - 10 * k, y + 12 * k, 20 * k, 3 * k, pal.plateD)
  g1(P, x, y - 2 * k, 16 * k, pal.accent, 0.25)
})

// L38 辐射三叶：黄黑警示底盘 + 缓缓自转的三叶标
LM(38, (s, P, cfg, pal, x, y, k) => {
  const rot = P.i * 0.06
  s.disc(x, y, 15 * k, PAL.warn, 0.9)
  s.disc(x, y, 13 * k, PAL.ink, 0.9)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    s.rect(x + Math.cos(a) * 14 * k - 1, y + Math.sin(a) * 14 * k - 1, 2, 2, PAL.ink)
  }
  trefoil(s, x, y, 9 * k, mix(PAL.toxicGlow, PAL.warn, 0.25 + Math.sin(P.i * 0.5) * 0.1))
  s.disc(x, y, 2.6 * k, PAL.ink)
  s.disc(x - 0.6 * k, y - 0.6 * k, 1.1 * k, PAL.void)
  s.thick(x, y + 15 * k, x + rot * 12, y + 24 * k, 1.2, pal.plateD)
  g1(P, x, y, 16 * k, PAL.toxicGlow, 0.5)
})

// L39 弹药带：斜跨的弹链 + 露出的铜壳子弹
LM(39, (s, P, cfg, pal, x, y, k) => {
  const sag = Math.sin(P.i * 1.1) * 1.2 * k
  s.poly(
    [
      [x - 16 * k, y - 11 * k],
      [x - 11 * k, y - 12 * k],
      [x + 15 * k, y + 9 * k + sag],
      [x + 10 * k, y + 12 * k + sag],
    ],
    PAL.mossDead,
    0.95,
  )
  for (let i = 0; i < 6; i++) {
    const t = 0.1 + i * 0.15
    const bx = x - 16 * k + 31 * k * t
    const by = y - 11 * k + 22 * k * t + sag * t
    s.rect(bx - 1.6 * k, by - 4 * k, 3.2 * k, 8 * k, PAL.ochre)
    s.rect(bx - 1.6 * k, by - 4 * k, 1.2 * k, 8 * k, mix(PAL.ochre, PAL.white, 0.35), 0.7)
    s.rect(bx - 1.4 * k, by + 4 * k, 2.8 * k, 2 * k, PAL.warn, 0.85)
  }
  s.px(x + 15 * k, y + 9 * k + sag, pal.accent, 0.7)
  g1(P, x + 4 * k, y + 3 * k, 6 * k, PAL.warn, 0.2)
})

// L40 音箱阵列：三只叠放的箱体 + 中心震颤的纸盆
LM(40, (s, P, cfg, pal, x, y, k) => {
  const pump = P.anim === 'attack' ? Math.sin(P.i * 4) * 1.6 * k : Math.sin(P.i * 0.8) * 0.5 * k
  for (let i = 0; i < 3; i++) {
    const bx = x + (i - 1) * 7 * k
    const by = y - 12 * k + Math.abs(i - 1) * 5 * k
    s.rect(bx - 6 * k, by, 12 * k, 16 * k, PAL.ink)
    s.rect(bx - 5 * k, by + 1 * k, 10 * k, 14 * k, pal.plateD)
    s.ell(bx, by + 6 * k, 3.6 * k + pump, 3.6 * k + pump, PAL.ash)
    s.ell(bx, by + 6 * k, 2 * k + pump * 0.6, 2 * k + pump * 0.6, i === 1 ? pal.accent : pal.plate, 0.7)
    s.ell(bx, by + 12 * k, 1.6 * k, 1.6 * k, pal.plate)
    s.px(bx - 4 * k, by + 2 * k, PAL.steelWhite, 0.5)
    if (i === 1) g1(P, bx, by + 6 * k, 8 * k, pal.accent, 0.45)
  }
  for (let i = 0; i < 4; i++) {
    const a = -0.8 + i * 0.5
    s.line(x + Math.cos(a) * 12 * k, y + Math.sin(a) * 12 * k, x + Math.cos(a) * (20 + pump * 2) * k, y + Math.sin(a) * (20 + pump * 2) * k, pal.accent, 0.35)
  }
})

// L41 影刃镜：竖立的黑镜 + 镜中一道错位的紫色刃影
LM(41, (s, P, cfg, pal, x, y, k) => {
  const jitter = Math.sin(P.i * 1.9) * 1.8 * k
  s.poly([[x - 11 * k, y + 16 * k], [x - 13 * k, y - 14 * k], [x + 13 * k, y - 14 * k], [x + 11 * k, y + 16 * k]], pal.plateD)
  s.poly([[x - 8 * k, y + 14 * k], [x - 9 * k, y - 11 * k], [x + 9 * k, y - 11 * k], [x + 8 * k, y + 14 * k]], PAL.void)
  s.line(x - 9 * k, y - 11 * k, x + 8 * k, y + 14 * k, mix(pal.accent, PAL.void, 0.35), 0.5)
  s.thick(x - 4 * k + jitter, y + 12 * k, x + 4 * k + jitter, y - 10 * k, 1.2, pal.accent, 0.9)
  s.thick(x - 1 * k + jitter, y + 13 * k, x + 7 * k + jitter, y - 9 * k, 0.6, mix(pal.accent, PAL.white, 0.6), 0.8)
  s.rect(x - 13 * k, y + 15 * k, 26 * k, 2.4 * k, pal.plate)
  g1(P, x, y, 12 * k, pal.accent, 0.35)
})

// L42 城垛塔楼：带垛口的方塔 + 箭窗 + 旗
LM(42, (s, P, cfg, pal, x, y, k) => {
  const flag = Math.sin(P.i * 1.4) * 2 * k
  s.rect(x - 12 * k, y - 8 * k, 24 * k, 28 * k, pal.bodyD)
  s.rect(x - 10 * k, y - 6 * k, 20 * k, 24 * k, pal.body, 0.55)
  for (let i = 0; i < 4; i++) s.rect(x - 12 * k + i * 6.6 * k, y - 12 * k, 4 * k, 4 * k, pal.bodyD)
  s.rect(x - 12 * k, y - 9 * k, 24 * k, 2 * k, pal.plateD)
  for (let i = 0; i < 3; i++) {
    s.rect(x - 7 * k + i * 7 * k, y - 3 * k, 2.6 * k, 7 * k, PAL.void)
    s.rect(x - 7 * k + i * 7 * k, y + 9 * k, 2.6 * k, 5 * k, PAL.void)
  }
  s.rect(x - 1, y - 26 * k, 1.6, 16 * k, pal.plateD)
  s.poly([[x + 0.6, y - 26 * k], [x + 12 * k + flag, y - 22 * k], [x + 0.6, y - 18 * k]], pal.accent, 0.9)
  s.rect(x - 12 * k, y + 18 * k, 24 * k, 3 * k, PAL.ash)
  g1(P, x + 6 * k, y + 14 * k, 7 * k, pal.accent, 0.2)
})

// L43 血酒圣杯：高脚杯 + 晃动的暗红液面 + 杯沿高光
LM(43, (s, P, cfg, pal, x, y, k) => {
  const slosh = Math.sin(P.i * 0.9) * 1.4 * k
  s.poly([[x - 9 * k, y - 8 * k], [x + 9 * k, y - 8 * k], [x + 5 * k, y + 6 * k], [x - 5 * k, y + 6 * k]], pal.plateD)
  s.poly([[x - 7.5 * k, y - 7 * k], [x + 7.5 * k, y - 7 * k], [x + 4.5 * k, y + 5 * k], [x - 4.5 * k, y + 5 * k]], PAL.bloodDark)
  s.ell(x + slosh, y - 5.6 * k, 6.6 * k, 2 * k, PAL.blood)
  s.ell(x + slosh, y - 6.2 * k, 5 * k, 1.2 * k, mix(PAL.blood, PAL.neonRed, 0.4), 0.7)
  s.rect(x - 9 * k, y - 9 * k, 18 * k, 1.6, PAL.warn)
  s.rect(x - 1.4 * k, y + 6 * k, 2.8 * k, 8 * k, PAL.warn)
  s.ell(x, y + 15 * k, 7 * k, 2 * k, PAL.warn)
  s.ell(x, y + 16 * k, 5 * k, 1.2 * k, PAL.boneDeep)
  if (P.anim === 'attack') {
    s.px(x + slosh + 3 * k, y - 9 * k, PAL.neonRed, 0.9)
    s.px(x + slosh + 5 * k, y - 12 * k, PAL.neonRed, 0.7)
  }
  g1(P, x, y - 5 * k, 8 * k, PAL.neonRed, 0.35)
})

// L44 引力透镜：三重扭曲光环 + 中心吞噬黑点
LM(44, (s, P, cfg, pal, x, y, k) => {
  const warp = Math.sin(P.i * 0.7) * 0.16
  for (let r = 1; r <= 3; r++) {
    const rx = (6 + r * 4) * k * (1 + warp * (r % 2 ? 1 : -1))
    const ry = (3 + r * 2) * k * (1 - warp * (r % 2 ? 1 : -1))
    arcOf(s, x, y, rx, ry, 0.9, mix(pal.accent, PAL.void, 0.2), P.i * 0.05 * r, P.i * 0.05 * r + Math.PI * 1.75, 18, 0.85)
  }
  s.disc(x, y, 6 * k, mix(PAL.void, pal.accent, 0.25))
  s.disc(x, y, 4.4 * k, PAL.void)
  s.disc(x - 1 * k, y - 1 * k, 1.4 * k, mix(PAL.white, pal.accent, 0.4), 0.6)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + P.i * 0.1
    s.px(x + Math.cos(a) * 18 * k, y + Math.sin(a) * 11 * k, pal.accent, 0.55)
  }
  g1(P, x, y, 20 * k, pal.accent, 0.3)
})

// L45 雾灯：挂着的旧煤油灯 + 一圈雾状光晕
LM(45, (s, P, cfg, pal, x, y, k) => {
  const sway = Math.sin(P.i * 1.2) * 2 * k
  s.thick(x, y - 20 * k, x + sway, y - 12 * k, 0.6, pal.plateD)
  s.rect(x + sway - 4 * k, y - 12 * k, 8 * k, 3 * k, pal.plate)
  s.poly([[x + sway - 4 * k, y - 9 * k], [x + sway + 4 * k, y - 9 * k], [x + sway + 5 * k, y + 4 * k], [x + sway - 5 * k, y + 4 * k]], mix(PAL.glass, PAL.void, 0.5), 0.85)
  const fl = 0.5 + Math.sin(P.i * 2.6) * 0.2
  s.ell(x + sway, y - 2 * k, 2.4 * k, 3.6 * k, PAL.warn, fl)
  s.ell(x + sway, y - 3 * k, 1.2 * k, 2 * k, PAL.white, fl * 0.8)
  for (let i = 0; i < 3; i++) s.rect(x + sway - 5 * k, y - 9 * k + i * 4.5 * k, 10 * k, 1, pal.plateD)
  s.rect(x + sway - 6 * k, y + 4 * k, 12 * k, 2.4 * k, pal.plate)
  ringOf(s, x + sway, y - 2 * k, 13 * k, 13 * k, 1, PAL.ashPale, 20, 0.12)
  g1(P, x + sway, y - 2 * k, 15 * k, PAL.warn, 0.5)
})

// L46 骨笛：一排长短不一的骨管 + 吹口 + 指孔
LM(46, (s, P, cfg, pal, x, y, k) => {
  const breath = P.anim === 'attack' ? Math.sin(P.i * 3) * 1.2 * k : 0
  for (let i = 0; i < 5; i++) {
    const hx = x - 12 * k + i * 6 * k
    const len = (14 + (i % 3) * 5) * k
    s.rect(hx - 2 * k, y - len, 4 * k, len + 8 * k, PAL.bone, 0.95)
    s.rect(hx - 2 * k, y - len, 1.2 * k, len + 8 * k, mix(PAL.bone, PAL.white, 0.4), 0.7)
    s.ell(hx, y - len, 2 * k, 1.2 * k, PAL.void)
    s.disc(hx + 1 * k, y - len + 5 * k, 0.9 * k, PAL.void)
    s.disc(hx + 1 * k, y - len + 9 * k, 0.9 * k, PAL.void)
  }
  s.rect(x - 15 * k, y + 7 * k, 30 * k, 2.4 * k, PAL.boneDark)
  s.rect(x - 15 * k, y + 4 * k, 4 * k, 6 * k, PAL.boneDeep)
  if (breath !== 0) s.ell(x - 13 * k, y - 6 * k + breath, 3 * k, 5 * k, PAL.ashPale, 0.2)
  g1(P, x, y - 10 * k, 13 * k, PAL.bone, 0.15)
})

// L47 泥沼藤笼：藤条编成的吊笼 + 笼内沼气泡
LM(47, (s, P, cfg, pal, x, y, k) => {
  const sway = Math.sin(P.i * 0.8) * 2 * k
  s.thick(x, y - 22 * k, x + sway, y - 12 * k, 1, PAL.mossDead)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const cx = x + sway + Math.cos(a) * 10 * k
    const cy = y + Math.sin(a) * 8 * k + 2 * k
    s.thick(x + sway, y - 12 * k, cx, cy, 0.8, i % 2 ? PAL.weed : PAL.mossDead)
    s.thick(cx, cy, x + sway + Math.cos(a + 1.4) * 10 * k, y + Math.sin(a + 1.4) * 8 * k + 2 * k, 0.7, PAL.weed, 0.85)
  }
  s.ell(x + sway, y + 2 * k, 10 * k, 3 * k, mix(PAL.mossDead, PAL.void, 0.4), 0.85)
  for (let i = 0; i < 4; i++) {
    const bt = (P.i * 0.3 + i * 0.25) % 1
    s.disc(x + sway - 5 * k + (i % 3) * 4 * k, y + 2 * k - bt * 12 * k, 1.2 * k, PAL.toxicGlow, 0.5)
  }
  s.px(x + sway - 10 * k, y - 2 * k, PAL.weed, 0.7)
  g1(P, x + sway, y + 1 * k, 9 * k, PAL.toxicGlow, 0.25)
})

// L48 空心树干：劈裂的枯干 + 中空洞口 + 年轮
LM(48, (s, P, cfg, pal, x, y, k) => {
  const sway = Math.sin(P.i * 0.5) * 1.2 * k
  s.poly(
    [
      [x - 13 * k, y + 18 * k],
      [x - 9 * k, y - 12 * k],
      [x - 2 * k + sway, y - 22 * k],
      [x + 6 * k + sway, y - 18 * k],
      [x + 11 * k, y + 4 * k],
      [x + 14 * k, y + 18 * k],
    ],
    PAL.boneDeep,
  )
  s.poly(
    [
      [x - 8 * k, y + 16 * k],
      [x - 5 * k, y - 10 * k],
      [x + 1 * k + sway, y - 17 * k],
      [x + 6 * k + sway, y - 12 * k],
      [x + 8 * k, y + 6 * k],
      [x + 10 * k, y + 16 * k],
    ],
    PAL.ink,
  )
  for (let i = 0; i < 4; i++) {
    arcOf(s, x + 1 * k, y - 2 * k + i * 6 * k, (9 - i) * k, 3 * k, 0.6, mix(PAL.boneDeep, PAL.mossDead, 0.5), 0, Math.PI, 10, 0.5)
  }
  s.poly([[x - 6 * k, y - 20 * k], [x - 1 * k, y - 26 * k], [x + 4 * k, y - 20 * k]], PAL.boneDeep)
  for (let i = 0; i < 3; i++) s.px(x + 3 * k + i * 2 * k, y - 12 * k - i * 3 * k, PAL.mossDead, 0.6)
  g1(P, x + 1 * k, y + 4 * k, 9 * k, PAL.toxicGlow, 0.22)
})

// L49 潮汐浮标：半沉的浮筒 + 顶部闪灯 + 环绕浪线
LM(49, (s, P, cfg, pal, x, y, k) => {
  const bobY = Math.sin(P.i * 0.9) * 1.6 * k
  const flick = (P.i % 8) < 2 ? 1 : 0.35
  s.rect(x - 2 * k, y - 18 * k + bobY, 4 * k, 8 * k, pal.plateD)
  s.poly([[x - 11 * k, y - 10 * k + bobY], [x + 11 * k, y - 10 * k + bobY], [x + 8 * k, y + 8 * k + bobY], [x - 8 * k, y + 8 * k + bobY]], PAL.rustLight)
  s.rect(x - 11 * k, y - 4 * k + bobY, 22 * k, 2.4 * k, PAL.ink)
  s.rect(x - 8 * k, y + 2 * k + bobY, 16 * k, 2 * k, PAL.ink)
  s.disc(x, y - 19 * k + bobY, 3 * k, PAL.warn, flick)
  s.disc(x, y - 19 * k + bobY, 1.4 * k, PAL.white, flick)
  for (let i = 0; i < 2; i++) {
    const wy = y + 10 * k + i * 4 * k
    for (let j = 0; j < 3; j++) {
      arcOf(s, x - 12 * k + j * 12 * k, wy, 4 * k, 2 * k, 0.7, PAL.waterHi, Math.PI * 1.05, Math.PI * 1.95, 7, 0.45)
    }
  }
  g1(P, x, y - 19 * k + bobY, 10 * k, PAL.warn, 0.45)
})

// L50 港钟：钟架上倒挂的大钟 + 垂下的拉绳
LM(50, (s, P, cfg, pal, x, y, k) => {
  const sway = Math.sin(P.i * 0.7) * 1.6 * k
  s.rect(x - 16 * k, y - 20 * k, 2.4 * k, 22 * k, PAL.rustDark)
  s.rect(x + 14 * k, y - 20 * k, 2.4 * k, 22 * k, PAL.rustDark)
  s.rect(x - 17 * k, y - 22 * k, 34 * k, 3 * k, PAL.rustLight)
  chain(s, x, y - 19 * k, x + sway, y - 10 * k, 3, pal.plate, pal.plateD)
  s.poly([[x - 10 * k + sway, y + 6 * k], [x - 6 * k + sway, y - 10 * k], [x + 6 * k + sway, y - 10 * k], [x + 10 * k + sway, y + 6 * k]], mix(pal.plate, PAL.rustLight, 0.45))
  s.ell(x + sway, y + 6 * k, 10 * k, 2 * k, pal.plateD)
  s.rect(x - 6 * k + sway, y - 10 * k, 12 * k, 2 * k, pal.plate)
  for (let i = 0; i < 2; i++) s.line(x + sway - 7 * k + i * 5 * k, y - 6 * k, x + sway - 8 * k + i * 5 * k, y + 4 * k, pal.bodyD, 0.5)
  s.thick(x + sway, y + 6 * k, x + sway + Math.sin(P.i) * 3, y + 24 * k, 0.7, PAL.ochre)
  s.disc(x + sway + Math.sin(P.i) * 3, y + 24 * k, 1.6 * k, PAL.ochre)
  g1(P, x + sway, y, 12 * k, PAL.warn, 0.22)
})

// L51 房门号牌：黄铜号码牌 + 门缝光 + 悬链
LM(51, (s, P, cfg, pal, x, y, k) => {
  const sway = Math.sin(P.i * 0.6) * 1 * k
  chain(s, x - 10 * k, y - 22 * k, x - 10 * k + sway, y - 13 * k, 3, PAL.warn, PAL.ochre)
  chain(s, x + 10 * k, y - 22 * k, x + 10 * k + sway, y - 13 * k, 3, PAL.warn, PAL.ochre)
  s.rect(x - 13 * k + sway, y - 13 * k, 26 * k, 15 * k, PAL.ochre)
  s.rect(x - 11 * k + sway, y - 11 * k, 22 * k, 11 * k, PAL.warn)
  s.rect(x - 11 * k + sway, y - 11 * k, 22 * k, 1.4, mix(PAL.warn, PAL.white, 0.4), 0.7)
  // 数字 13（像素笔画）
  s.rect(x - 7 * k + sway, y - 8 * k, 1.6 * k, 6 * k, PAL.ink)
  s.rect(x - 8.2 * k + sway, y - 8 * k, 2.6 * k, 1.4, PAL.ink)
  s.rect(x - 2 * k + sway, y - 8 * k, 5 * k, 1.4, PAL.ink)
  s.rect(x + 2 * k + sway, y - 7 * k, 1.4, 3 * k, PAL.ink)
  s.rect(x - 1 * k + sway, y - 4.4 * k, 4 * k, 1.4, PAL.ink)
  s.rect(x + 1.6 * k + sway, y - 3.4 * k, 1.4, 3.4 * k, PAL.ink)
  s.rect(x - 2 * k + sway, y - 0.6 * k, 5 * k, 1.4, PAL.ink)
  for (const dx of [-10, 10]) s.px(x + dx * k + sway, y - 12 * k, PAL.white, 0.6)
  s.rect(x - 13 * k + sway, y + 1 * k, 26 * k, 1.2, PAL.ink, 0.5)
  g1(P, x + sway, y, 12 * k, PAL.warn, 0.25)
})

/* ========================================================================== */
/* 标志物分派：painter 返回锚点 { x, y, s }，landmark 画在该锚点上               */
/* ========================================================================== */
function drawLandmark(s, P, def, cfg, pal, L, a) {
  const fn = LANDMARKS[L]
  if (!fn) return
  const k = Math.max(0.45, (a && a.s ? a.s : 1) * (def.w / 150))
  fn(s, P, cfg, pal, a.x, a.y, k)
}

/* ========================================================================== */
/* 51 只 BOSS 的独占计划：每只绑定自己的 painter + 自己的 landmark 索引        */
/* ========================================================================== */
const wrap = (fn, L) => (s, P, def, cfg, pal) => {
  const a = fn(s, P, def, cfg, pal)
  if (a) drawLandmark(s, P, def, cfg, pal, L, a)
}

export const UNIQUE_BOSS_PLANS = {
  // 01 立方方舟 / L01 数据环
  tb_data_archon: wrap(codexCube, 1),
  // 02 装配巨械 / L02 装配吊钩
  tb_assembly_overseer: wrap(assemblyHulk, 2),
  // 03 轨道梭 / L03 轨道裁决环
  tb_orbit_judge: wrap(orbitLance, 3),
  // 04 太阳塔 / L04 光帆板
  tb_helios: wrap(heliosTower, 4),
  // 05 潮汐膜 / L05 泄洪闸
  tb_flood_colossus: wrap(floodMembrane, 5),
  // 06 桥背掠袭 / L06 桥索桁架
  tb_bridge_raider: wrap(bridgeStrider, 6),
  // 07 轮式战车 / L07 辐条巨轮
  tb_highway_king: wrap(wheelChariot, 7),
  // 08 不对称巨臂 / L08 塔吊配重
  tb_skyline_baron: wrap(asymGiantArm, 8),
  // 09 角斗巨躯 / L09 铁笼面罩
  tb_arena_champion: wrap(brawlColossus, 9),
  // 10 废铁爬行 / L10 废铁磁叉
  tb_scrap_warlord: wrap(crawlerMagnet, 10),
  // 11 育婴方舱 / L11 输液袋架
  tb_caregiver: wrap(cradlePod, 11),
  // 12 广播尖塔 / L12 广播喇叭阵
  tb_rally_boss: wrap(broadcastSpire, 12),
  // 13 双翼收割 / L13 挂穗镰架
  tb_storm_reaper: wrap(twinWingReaper, 13),
  // 14 酸池母体 / L14 酸液腹囊
  tb_acid_mother: wrap(acidMother, 14),
  // 15 盘根树母 / L15 腐果吊篮
  tb_rot_queen: wrap(rootTree, 15),
  // 16 钟形圣骸 / L16 巨钟
  tb_bell_bishop: wrap(bellHusk, 16),
  // 17 双核裂变 / L17 分裂双芯
  tb_prime_core: wrap(splitCore, 17),
  // 18 蜈蚣引擎 / L18 节肢注射器
  tb_zero_strain: wrap(centipedeEngine, 18),
  // 19 原生脑巢 / L19 脑槽镜面
  tb_proto_mind: wrap(brainNest, 19),
  // 20 浮游眼球 / L20 观测镜片环
  tb_observer: wrap(floatingEye, 20),
  // 21 铁履指挥 / L21 勋章链
  tb_iron_colonel: wrap(commanderTread, 21),
  // 22 书页亡魂 / L22 悬浮书页
  tb_librarian: wrap(wraithTome, 22),
  // 23 教鞭巨人 / L23 讲台黑板
  tb_schoolmaster: wrap(schoolGiant, 23),
  // 24 讲学步行机 / L24 试管架
  tb_professor: wrap(lecternWalker, 24),
  // 25 印刷压机 / L25 滚筒印版
  tb_paper_press: wrap(pressMachine, 25),
  // 26 展柜守夜 / L26 标本瓶
  tb_curator: wrap(curatorCase, 26),
  // 27 牢门看守 / L27 钥匙串
  tb_warden: wrap(jailerGate, 27),
  // 28 门房浮灵 / L28 服务铃
  tb_hotel_clerk: wrap(clerkWisp, 28),
  // 29 码头吊装 / L29 船锚
  tb_dockmaster: wrap(dockCrane, 29),
  // 30 灯塔守望 / L30 旋转灯室
  tb_lighthouse_keeper: wrap(lighthouse, 30),
  // 31 船坞骨架 / L31 龙骨肋
  tb_shipwright: wrap(shipFrame, 31),
  // 32 干坞门架 / L32 坞门绞盘
  tb_drydock_rig: wrap(drydockGantry, 32),
  // 33 变电站虫 / L33 高压线圈
  tb_substation: wrap(coilBug, 33),
  // 34 地堡炮座 / L34 观察潜望镜
  tb_bunker_commander: wrap(bunkerTurret, 34),
  // 35 矿坑钻机 / L35 巨型钻头
  tb_mine_foreman: wrap(drillRig, 35),
  // 36 锅炉王座 / L36 炉门
  tb_boiler_king: wrap(boilerThrone, 36),
  // 37 反应堆祭司 / L37 燃料棒束
  tb_reactor_priest: wrap(reactorPriest, 37),
  // 38 辐射巨躯 / L38 辐射三叶
  tb_rad_colossus: wrap(radColossus, 38),
  // 39 军械平台 / L39 弹药带
  tb_arsenal_sergeant: wrap(arsenalDeck, 39),
  // 40 音箱机甲 / L40 音箱阵列
  tb_punk_amp: wrap(ampMech, 40),
  // 41 影缝潜行 / L41 影刃镜
  tb_shadow_walker: wrap(seamStalker, 41),
  // 42 城堡暴君 / L42 城垛塔楼
  tb_castle_tyrant: wrap(castleKeep, 42),
  // 43 蝠翼伯爵 / L43 血酒圣杯
  tb_vampire_count: wrap(batCount, 43),
  // 44 重力古眼 / L44 引力透镜
  tb_gravity_eye: wrap(gravityOrb, 44),
  // 45 雾中亡魂 / L45 雾灯
  tb_fog_wraith: wrap(fogSpecter, 45),
  // 46 海峡嗥兽 / L46 骨笛
  tb_strait_howler: wrap(straitBeast, 46),
  // 47 沼泽巨口 / L47 泥沼藤笼
  tb_swamp_maw: wrap(swampMaw, 47),
  // 48 林中空壳 / L48 空心树干
  tb_forest_hollow: wrap(hollowTrunk, 48),
  // 49 赤潮拟态 / L49 潮汐浮标
  tb_red_tide: wrap(mimicTide, 49),
  // 50 灰港吊机 / L50 港钟
  tb_grey_harbor: wrap(harborCrane, 50),
  // 51 长夜旅馆 / L51 房门号牌
  tb_hotel_nightmare: wrap(innNightmare, 51),
}

