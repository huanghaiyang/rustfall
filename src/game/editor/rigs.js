// ============================================================================
// 锈雨 · RUSTFALL —— 骨骼拓扑 / 碰撞角色定义（族系装备表）
// ----------------------------------------------------------------------------
// 这里只描述「一台机体应该有哪些骨头、谁挂谁下面、碰撞体承担什么职责」，
// 具体坐标由 skeleton-fit.js 从图像里识别（anchors）或由本文件的默认模板给出。
//
// 坐标系（重要，之前的模板就是栽在这上面）：
//   · 骨骼 / 碰撞都在 **帧像素坐标** 里：原点 = 当前帧左上角，x 向右，y 向下。
//   · 不是 sprite.w/h —— 那是逻辑命中框（数据执政官 136×168，而帧是 272×336）。
//     之前模板写死 ±16 这类小数字，套上去全挤在帧左上角，看着像「没生效」。
//   · 归一化坐标 nn = [nx, ny]，nx/ny ∈ [0,1]，相对帧宽/帧高。
//
// 角度：0° = +x（右），90° = +y（下），-90° = 上。骨骼由 head→tail 两点决定。
// ============================================================================

/** 骨骼种类（影响配色 / 分组 / 未来接引擎 IK） */
export const BONE_KINDS = [
  { id: 'root', name: '根', en: 'ROOT', color: '#d8cfba' },
  { id: 'pelvis', name: '骨盆', en: 'PELVIS', color: '#b8a98a' },
  { id: 'spine', name: '脊柱', en: 'SPINE', color: '#8fc4ff' },
  { id: 'chest', name: '胸腔/躯干', en: 'CHEST', color: '#6fb3ff' },
  { id: 'neck', name: '颈', en: 'NECK', color: '#9ad0c0' },
  { id: 'head', name: '头/座舱', en: 'HEAD', color: '#ffd479' },
  { id: 'crown', name: '顶饰/天线', en: 'CROWN', color: '#ffb454' },
  { id: 'shoulder', name: '肩', en: 'SHOULDER', color: '#c58fff' },
  { id: 'arm', name: '上臂', en: 'ARM', color: '#a78bfa' },
  { id: 'forearm', name: '前臂', en: 'FOREARM', color: '#8b7bfa' },
  { id: 'hand', name: '手/夹爪', en: 'HAND', color: '#6f5ffa' },
  { id: 'hip', name: '髋', en: 'HIP', color: '#7fd08a' },
  { id: 'thigh', name: '大腿', en: 'THIGH', color: '#5fc46a' },
  { id: 'shin', name: '小腿', en: 'SHIN', color: '#4aa858' },
  { id: 'foot', name: '足', en: 'FOOT', color: '#3a8a46' },
  { id: 'tail', name: '尾/拖挂', en: 'TAIL', color: '#a8763a' },
  { id: 'wing', name: '翼', en: 'WING', color: '#7fd8e0' },
  { id: 'prop', name: '道具/武器座', en: 'PROP', color: '#c07038' },
  { id: 'sensor', name: '传感器', en: 'SENSOR', color: '#e0e0a8' },
]
export const BONE_KIND_MAP = Object.fromEntries(BONE_KINDS.map((k) => [k.id, k]))
export const boneKindColor = (kind) => (BONE_KIND_MAP[kind] || BONE_KIND_MAP.root).color

/** 碰撞体职责 */
export const SHAPE_ROLES = [
  { id: 'hitbox', name: '总命中框', en: 'HITBOX', hint: '整体包围盒，给引擎做粗判定' },
  { id: 'hurtbox', name: '受击区', en: 'HURTBOX', hint: '躯干主受击面' },
  { id: 'body', name: '躯干', en: 'BODY', hint: '身体块' },
  { id: 'head', name: '头部', en: 'HEAD', hint: '头部/座舱（爆头倍率）' },
  { id: 'leg', name: '腿', en: 'LEG', hint: '腿（断腿机制）' },
  { id: 'arm', name: '手臂', en: 'ARM', hint: '手臂 / 武器臂' },
  { id: 'prop', name: '道具', en: 'PROP', hint: '手持/拖挂物' },
  { id: 'foot', name: '落脚点', en: 'FOOT', hint: '地面接触' },
  { id: 'sensor', name: '传感区', en: 'SENSOR', hint: '弱点 / 探测器' },
]
export const SHAPE_ROLE_MAP = Object.fromEntries(SHAPE_ROLES.map((r) => [r.id, r]))
export const shapeRoleColor = (role) => {
  switch (role) {
    case 'hitbox':
      return '#ffd479'
    case 'hurtbox':
      return '#ff6b5a'
    case 'head':
      return '#ffb454'
    case 'leg':
      return '#5fc46a'
    case 'arm':
      return '#a78bfa'
    case 'prop':
      return '#c07038'
    case 'foot':
      return '#3a8a46'
    case 'sensor':
      return '#7fd8e0'
    default:
      return '#ff6b5a'
  }
}

// ---------------------------------------------------------------------------
// 骨架构型：每根骨头声明「起点槽 / 终点槽」，坐标由 anchors 决定
//   slot 名 → skeleton-fit 里的锚点（head 位置 / tail 位置）
//   找不到锚点时用 norm（归一化默认值）兜底
// ---------------------------------------------------------------------------

/** 锚点对（头、尾）+ 兜底归一化坐标 */
const B = (name, kind, parent, from, to, fallbackFrom, fallbackTo) => ({
  name,
  kind,
  parent,
  from,
  to,
  fb: [fallbackFrom, fallbackTo],
})

/** 双足 / 机械人形（数据执政官、机甲 BOSS 都用这套） */
const MECH_RIG = [
  B('root', 'root', null, 'hipC', 'hipC', [0.5, 0.62], [0.5, 0.62]),
  B('pelvis', 'pelvis', 'root', 'hipC', 'spineBase', [0.5, 0.62], [0.5, 0.58]),
  B('spine', 'spine', 'pelvis', 'spineBase', 'chest', [0.5, 0.58], [0.5, 0.44]),
  B('chest', 'chest', 'spine', 'chest', 'torsoTop', [0.5, 0.44], [0.5, 0.34]),
  B('head', 'head', 'chest', 'torsoTop', 'headTop', [0.5, 0.34], [0.5, 0.22]),
  B('crown', 'crown', 'head', 'headTop', 'crownTop', [0.5, 0.22], [0.5, 0.10]),
  B('shoulderF', 'shoulder', 'chest', 'chest', 'shoulderF', [0.5, 0.44], [0.6, 0.48]),
  B('armF', 'arm', 'shoulderF', 'shoulderF', 'elbowF', [0.6, 0.48], [0.7, 0.54]),
  B('forearmF', 'forearm', 'armF', 'elbowF', 'handF', [0.7, 0.54], [0.78, 0.6]),
  B('handF', 'hand', 'forearmF', 'handF', 'handTipF', [0.78, 0.6], [0.84, 0.62]),
  B('shoulderB', 'shoulder', 'chest', 'chest', 'shoulderB', [0.5, 0.44], [0.4, 0.48]),
  B('armB', 'arm', 'shoulderB', 'shoulderB', 'elbowB', [0.4, 0.48], [0.3, 0.54]),
  B('forearmB', 'forearm', 'armB', 'elbowB', 'handB', [0.3, 0.54], [0.22, 0.6]),
  B('handB', 'hand', 'forearmB', 'handB', 'handTipB', [0.22, 0.6], [0.16, 0.62]),
  B('thighF', 'thigh', 'root', 'hipF', 'kneeF', [0.54, 0.62], [0.56, 0.8]),
  B('shinF', 'shin', 'thighF', 'kneeF', 'ankleF', [0.56, 0.8], [0.58, 0.95]),
  B('footF', 'foot', 'shinF', 'ankleF', 'toeF', [0.58, 0.95], [0.64, 0.98]),
  B('thighB', 'thigh', 'root', 'hipB', 'kneeB', [0.46, 0.62], [0.44, 0.8]),
  B('shinB', 'shin', 'thighB', 'kneeB', 'ankleB', [0.44, 0.8], [0.42, 0.95]),
  B('footB', 'foot', 'shinB', 'ankleB', 'toeB', [0.42, 0.95], [0.48, 0.98]),
  B('prop', 'prop', 'handB', 'propTop', 'propBottom', [0.22, 0.66], [0.22, 0.78]),
]

/** 四足：脊柱横放，四条腿 */
const QUAD_RIG = [
  B('root', 'root', null, 'hipC', 'hipC', [0.5, 0.5], [0.5, 0.5]),
  B('spine', 'spine', 'root', 'hipC', 'chest', [0.35, 0.5], [0.65, 0.5]),
  B('head', 'head', 'spine', 'chest', 'headTip', [0.7, 0.5], [0.85, 0.5]),
  B('legFL', 'thigh', 'spine', 'shoulderF', 'footFL', [0.6, 0.55], [0.62, 0.95]),
  B('legFR', 'thigh', 'spine', 'handF', 'footFR', [0.65, 0.55], [0.7, 0.95]),
  B('legBL', 'thigh', 'spine', 'shoulderB', 'footBL', [0.4, 0.55], [0.38, 0.95]),
  B('legBR', 'thigh', 'spine', 'handB', 'footBR', [0.35, 0.55], [0.3, 0.95]),
  B('tail', 'tail', 'spine', 'hipC', 'toeB', [0.38, 0.5], [0.2, 0.55]),
]

/** 飞行/悬浮：机身 + 两翼 + 尾 */
const FLYER_RIG = [
  B('root', 'root', null, 'chest', 'chest', [0.5, 0.5], [0.5, 0.5]),
  B('body', 'spine', 'root', 'hipC', 'headTip', [0.5, 0.6], [0.5, 0.35]),
  B('head', 'head', 'body', 'headTip', 'headTop', [0.5, 0.35], [0.5, 0.25]),
  B('wingL', 'wing', 'body', 'chest', 'handB', [0.5, 0.5], [0.15, 0.4]),
  B('wingR', 'wing', 'body', 'chest', 'handF', [0.5, 0.5], [0.85, 0.4]),
  B('tail', 'tail', 'body', 'hipC', 'toeF', [0.5, 0.6], [0.5, 0.85]),
]

/** 群集/浮游核心：核心 + 触须 */
const SWARM_RIG = [
  B('root', 'root', null, 'centroid', 'centroid', [0.5, 0.5], [0.5, 0.5]),
  B('core', 'chest', 'root', 'centroid', 'chest', [0.5, 0.5], [0.5, 0.4]),
  B('tentF', 'arm', 'core', 'centroid', 'handF', [0.5, 0.5], [0.8, 0.7]),
  B('tentB', 'arm', 'core', 'centroid', 'handB', [0.5, 0.5], [0.2, 0.7]),
  B('tentU', 'arm', 'core', 'centroid', 'headTop', [0.5, 0.5], [0.5, 0.15]),
  B('tentD', 'arm', 'core', 'centroid', 'toeF', [0.5, 0.5], [0.5, 0.9]),
]

/** 植物/触手：根 + 茎 + 头 + 卷须 */
const PLANT_RIG = [
  B('root', 'root', null, 'hipC', 'hipC', [0.5, 0.95], [0.5, 0.95]),
  B('stem', 'spine', 'root', 'hipC', 'chest', [0.5, 0.95], [0.5, 0.35]),
  B('head', 'head', 'stem', 'chest', 'headTop', [0.5, 0.35], [0.5, 0.15]),
  B('tendrilF', 'arm', 'stem', 'chest', 'handF', [0.5, 0.4], [0.85, 0.55]),
  B('tendrilB', 'arm', 'stem', 'chest', 'handB', [0.5, 0.4], [0.15, 0.55]),
]

/** 轻量/小型：极简 */
const LIGHT_RIG = [
  B('root', 'root', null, 'hipC', 'hipC', [0.5, 0.65], [0.5, 0.65]),
  B('torso', 'spine', 'root', 'hipC', 'chest', [0.5, 0.65], [0.5, 0.4]),
  B('head', 'head', 'torso', 'chest', 'headTop', [0.5, 0.4], [0.5, 0.25]),
  B('legF', 'thigh', 'root', 'hipF', 'ankleF', [0.55, 0.65], [0.55, 0.95]),
  B('legB', 'thigh', 'root', 'hipB', 'ankleB', [0.45, 0.65], [0.45, 0.95]),
]

export const RIGS = {
  mech: MECH_RIG,
  biped: MECH_RIG,
  boss: MECH_RIG,
  quad: QUAD_RIG,
  flyer: FLYER_RIG,
  swarm: SWARM_RIG,
  plant: PLANT_RIG,
  minion: LIGHT_RIG,
  light: LIGHT_RIG,
  wheel: LIGHT_RIG,
  track: LIGHT_RIG,
  arm: MECH_RIG,
  unknown: LIGHT_RIG,
}

export function rigForFamily(familyId) {
  return RIGS[familyId] || LIGHT_RIG
}

/** 碰撞模板：同样用归一化 from→to；role 决定语义
 *  槽名命中 skeleton-fit 的锚点时用检测到的真实框，否则退回归一化兜底值。 */
const SH = (name, role, from, to, fbFrom, fbTo) => ({
  name,
  role,
  type: 'rect',
  from,
  to,
  fb: [fbFrom || from, fbTo || to],
})

const MECH_SHAPES = [
  SH('hitbox', 'hitbox', 'bboxTL', 'bboxBR', [0.1, 0.04], [0.92, 1.0]),
  SH('torso', 'hurtbox', 'torsoTL', 'torsoBR', [0.22, 0.14], [0.78, 0.56]),
  SH('head', 'head', 'headTL', 'headBR', [0.34, 0.03], [0.66, 0.14]),
  SH('legF', 'leg', 'legFTL', 'legFBR', [0.5, 0.6], [0.64, 1.0]),
  SH('legB', 'leg', 'legBTL', 'legBBR', [0.36, 0.6], [0.5, 1.0]),
  SH('armF', 'arm', 'armFTL', 'armFBR', [0.72, 0.42], [0.92, 0.6]),
  SH('armB', 'arm', 'armBTL', 'armBBR', [0.08, 0.42], [0.28, 0.6]),
  SH('prop', 'prop', 'propTL', 'propBR', [0.12, 0.6], [0.3, 0.78]),
]
const QUAD_SHAPES = [
  SH('hitbox', 'hitbox', 'bboxTL', 'bboxBR', [0.1, 0.2], [0.95, 0.95]),
  SH('body', 'hurtbox', 'torsoTL', 'torsoBR', [0.3, 0.28], [0.72, 0.66]),
  SH('head', 'head', 'headTL', 'headBR', [0.72, 0.28], [0.95, 0.5]),
]
const FLYER_SHAPES = [
  SH('hitbox', 'hitbox', 'bboxTL', 'bboxBR', [0.1, 0.1], [0.9, 0.85]),
  SH('body', 'hurtbox', 'torsoTL', 'torsoBR', [0.35, 0.3], [0.65, 0.7]),
]
const SIMPLE_SHAPES = [
  SH('hitbox', 'hitbox', 'bboxTL', 'bboxBR', [0.15, 0.1], [0.85, 0.95]),
  SH('body', 'hurtbox', 'torsoTL', 'torsoBR', [0.25, 0.2], [0.75, 0.8]),
]

export const SHAPE_RIGS = {
  mech: MECH_SHAPES,
  biped: MECH_SHAPES,
  boss: MECH_SHAPES,
  arm: MECH_SHAPES,
  quad: QUAD_SHAPES,
  flyer: FLYER_SHAPES,
  swarm: SIMPLE_SHAPES,
  plant: SIMPLE_SHAPES,
  minion: SIMPLE_SHAPES,
  light: SIMPLE_SHAPES,
  wheel: SIMPLE_SHAPES,
  track: SIMPLE_SHAPES,
  unknown: SIMPLE_SHAPES,
}

export function shapeRigForFamily(familyId) {
  return SHAPE_RIGS[familyId] || SIMPLE_SHAPES
}

// ---------------------------------------------------------------------------
// 把「锚点 + 构型」拼成绝对坐标的骨头数组
// ---------------------------------------------------------------------------

const norm2abs = (p, w, h) => ({ x: (Number(p?.[0]) || 0) * w, y: (Number(p?.[1]) || 0) * h })

/** 这几根是躯干主轴：识别不到锚点也必须用模板坐标兜底，否则整个骨架散架 */
const CORE_BONES = new Set(['root', 'pelvis', 'spine', 'chest', 'head'])

/**
 * @param {string} familyId
 * @param {object} anchors  { 槽名: {x,y} } 绝对像素；缺的槽用模板归一化值补
 * @param {{w:number,h:number}} box  帧像素尺寸
 * @param {{skipMissing?:boolean}} opts skipMissing=true 时，缺锚点的非主轴骨骼直接不生成
 * @returns {Array<{name,kind,parent,x,y,len,angle,conf}>}  parent 用**名字**（落库前再转 id）
 */
export function assembleRig(familyId, anchors, box, opts = {}) {
  const w = box?.w || 1
  const h = box?.h || 1
  const rig = rigForFamily(familyId)
  const out = []
  const seen = new Map()
  const skipped = []
  for (const spec of rig) {
    const hasFrom = !!anchors?.[spec.from]
    const hasTo = !!anchors?.[spec.to]
    if (opts.skipMissing && !CORE_BONES.has(spec.name) && (!hasFrom || !hasTo)) {
      skipped.push(spec.name)
      continue
    }
    const a = anchors?.[spec.from] || norm2abs(spec.fb[0], w, h)
    const b = anchors?.[spec.to] || norm2abs(spec.fb[1], w, h)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const angle = len > 0.001 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0
    const conf = Math.min(
      1,
      Number(anchors?.[spec.from] ? 1 : 0.35) * 0.5 + Number(anchors?.[spec.to] ? 1 : 0.35) * 0.5,
    )
    const bone = {
      name: spec.name,
      kind: spec.kind,
      parent: spec.parent,
      x: round2(a.x),
      y: round2(a.y),
      len: round2(len),
      angle: round2(angle),
      conf: round2(conf),
    }
    out.push(bone)
    seen.set(bone.name, bone)
  }
  // 父级必须在列表里，且不能成环
  for (const b of out) {
    if (b.parent && !seen.has(b.parent)) b.parent = null
  }
  out.skipped = skipped
  return out
}

/** 把归一化碰撞模板拼成绝对矩形（skipMissing=true 时缺锚点的部位不生成） */
export function assembleShapes(familyId, anchors, box, opts = {}) {
  const w = box?.w || 1
  const h = box?.h || 1
  const tpl = shapeRigForFamily(familyId)
  const out = []
  const skipped = []
  for (const spec of tpl) {
    const hasFrom = !!anchors?.[spec.from]
    const hasTo = !!anchors?.[spec.to]
    if (opts.skipMissing && spec.role !== 'hitbox' && spec.role !== 'hurtbox' && (!hasFrom || !hasTo)) {
      skipped.push(spec.name)
      continue
    }
    const pa = anchors?.[spec.from] || norm2abs(spec.fb[0], w, h)
    const pb = anchors?.[spec.to] || norm2abs(spec.fb[1], w, h)
    const x0 = Math.min(pa.x, pb.x)
    const y0 = Math.min(pa.y, pb.y)
    const x1 = Math.max(pa.x, pb.x)
    const y1 = Math.max(pa.y, pb.y)
    out.push({
      name: spec.name,
      role: spec.role,
      type: 'rect',
      x: round2(x0),
      y: round2(y0),
      w: round2(Math.max(1, x1 - x0)),
      h: round2(Math.max(1, y1 - y0)),
      angle: 0,
    })
  }
  out.skipped = skipped
  return out
}

function round2(v) {
  return Math.round(v * 100) / 100
}

/**
 * 绝对坐标 → 编辑器要求的「层级相对」坐标。
 *
 * 编辑器（sprite-store.boneTransforms）里子骨骼的 x/y 是**父骨骼末端坐标系里的偏移**，
 * 角度也是相对父级累加的；而识别器（skeleton-fit）产出的是整帧绝对坐标。
 * 不做这一步转换，层级会一层层叠加偏移，骨骼会飞出去。
 *
 * 顺序要求：parents-first（assembleRig 的输出天然满足）。
 */
export function absoluteToLocal(list) {
  const absById = new Map() // name → { x, y, a, len }（绝对）
  const out = []
  for (const b of list) {
    const parentAbs = b.parent ? absById.get(b.parent) : null
    let x = b.x
    let y = b.y
    let angle = b.angle
    if (parentAbs) {
      const prad = (parentAbs.a * Math.PI) / 180
      const tipX = parentAbs.x + Math.cos(prad) * parentAbs.len
      const tipY = parentAbs.y + Math.sin(prad) * parentAbs.len
      const dx = b.x - tipX
      const dy = b.y - tipY
      const c = Math.cos(-prad)
      const s = Math.sin(-prad)
      x = c * dx - s * dy
      y = s * dx + c * dy
      angle = b.angle - parentAbs.a
    }
    absById.set(b.name, { x: b.x, y: b.y, a: b.angle, len: b.len })
    out.push({ ...b, x: round2(x), y: round2(y), angle: round2(normAngle(angle)) })
  }
  return out
}

/** 角度归一到 (-180, 180]，避免层级累加出 -450° 这种看不懂的数 */
function normAngle(a) {
  let v = Number(a) || 0
  while (v <= -180) v += 360
  while (v > 180) v -= 360
  return v
}
/** 归一化默认锚点（等价于「模板位置」）—— 识别失败时兜底用 */
export function templateAnchors(familyId, box) {
  const w = box?.w || 1
  const h = box?.h || 1
  const rig = rigForFamily(familyId)
  const anchors = {}
  for (const spec of rig) {
    if (spec.from) anchors[spec.from] = norm2abs(spec.fb[0], w, h)
    if (spec.to) anchors[spec.to] = norm2abs(spec.fb[1], w, h)
  }
  return anchors
}
