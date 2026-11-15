// ============================================================================
// 精灵编辑器 · 数据层
// ----------------------------------------------------------------------------
// 一个工程（Project）包含：
//   · sheets   导入的精灵图（PNG / 其它位图，存 dataURL）
//   · sprites  sprite 列表 —— 每个 sprite = 一个角色 / 怪物 + 其全部动作
//   · effects  特效列表 —— 特效本身也是一组精灵帧
//   · presets  尺寸预设（内置 + 用户自定义命名保存）
//
// Sprite 分类（专项编辑）：
//   · kind   'role'（玩家机体）| 'monster'（怪物）| 'generic'（未分配）
//   · refId  对应 chassis id / monster id（可空，未绑定）
//   · family 机体族系：biped | wheel | track | arm | quad | light | boss |
//             minion | flyer | swarm | plant | unknown
//
// 坐标约定：
//   · sheet 坐标系：像素原点在图左上角，y 向下
//   · sprite 坐标系：原点 = sprite 在 sheet 上的左上角，y 向下
//   · 骨骼 / 碰撞 / slot 全部使用 sprite 局部坐标
// ============================================================================

import { reactive } from 'vue'
import Content, { KIND } from '../core/registry.js'
import { MONSTER_IDS } from '../entities/monsters/index.js'
import { LARGE_IDS } from '../entities/monsters/large/index.js'
import { assembleRig, assembleShapes, templateAnchors, absoluteToLocal } from './rigs.js'
import { fitSkeleton, fitFrames, alphaFromRGBA } from './skeleton-fit.js'
import {
  addHistory,
  listHistory,
  getHistory,
  removeHistory,
  clearHistory,
  plainProject,
  hashText,
  syncHistoryToDisk,
} from './sprite-history.js'
import { diskGetProject, diskPutProject } from './disk-store.js'

const KEY = 'rustfall.spriteeditor.v1'

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** 内置尺寸预设 */
export const BUILTIN_PRESETS = [
  { id: 'p16', name: '16×16', w: 16, h: 16, builtin: true },
  { id: 'p24', name: '24×32', w: 24, h: 32, builtin: true },
  { id: 'p32', name: '32×32', w: 32, h: 32, builtin: true },
  { id: 'p48', name: '48×48', w: 48, h: 48, builtin: true },
  { id: 'p64', name: '64×64', w: 64, h: 64, builtin: true },
  { id: 'p96', name: '96×96', w: 96, h: 96, builtin: true },
  { id: 'p128', name: '128×128', w: 128, h: 128, builtin: true },
  { id: 'p256', name: '256×256', w: 256, h: 256, builtin: true },
]

// ============================================================================
// 专项编辑：机体族系 + 骨骼模板 + 碰撞模板
// ============================================================================

/** 机体族系（body-plan family）——每个 family 提供一套默认骨骼层级与碰撞形状 */
export const SPRITE_FAMILIES = [
  { id: 'mech',   name: '机械人形(侧面)', en: 'MECH', hint: '数据执政官 / 机柜躯干 + 双足' },
  { id: 'biped',  name: '双足人形', en: 'BIPED',  hint: 'UNIT-7 / GHOST-0 / HOPPER-2 / MULE-1' },
  { id: 'wheel',  name: '轮式底盘', en: 'WHEEL',  hint: 'TESLA-9 拾荒者' },
  { id: 'track',  name: '履带/轮足', en: 'TRACK',  hint: 'AGI-X / HULK-6 / WARDEN-4' },
  { id: 'arm',    name: '机械臂重型', en: 'ARM',    hint: 'ATLAS-2 施工者' },
  { id: 'quad',   name: '四足',     en: 'QUAD',   hint: 'SPIDER-3 勘探者' },
  { id: 'light',  name: '轻量机体', en: 'LIGHT',  hint: 'MULE-1 / GHOST-0 / HOPPER-2' },
  { id: 'boss',   name: '大型 BOSS', en: 'BOSS',   hint: 'TYRANT / SWARM_CORE / JUNK_GOLEM' },
  { id: 'minion', name: '小型地面怪', en: 'MINION', hint: 'RADBOAR / CRAWLER / SPITTER' },
  { id: 'flyer',  name: '飞行怪物',  en: 'FLYER',  hint: 'WINGRAT / DRONE / DARK_WEB_GHOST' },
  { id: 'swarm',  name: '群集/浮游', en: 'SWARM',  hint: 'NANO_SWARM / ALIEN_ORB' },
  { id: 'plant',  name: '植物/触手', en: 'PLANT',  hint: 'CULT_FANATIC / VIRAL_WRAITH' },
  { id: 'unknown',name: '通用/自定义',en: 'GENERIC', hint: '手动搭建骨骼' },
]

/** 从 chassis family 字符串到族系 id 的映射（兼容现有 chassis 字段） */
export const FAMILY_FROM_CHASSIS = {
  biped: 'biped',
  wheel: 'wheel',
  track: 'track',
  arm: 'arm',
  quad: 'quad',
  light: 'light',
}

// ---- 骨骼模板（相对 sprite 原点，单位像素）----
// 每个模板返回数组，元素 = 骨骼定义；父级引用用模板内部骨骼名（apply 时自动映射到新 id）。
const bipedTemplate = () => [
  { name: 'pelvis', x: 0, y: -10, len: 0, angle: 0, parent: null },
  { name: 'torso',  x: 0, y: 0,   len: 14, angle: 0, parent: 'pelvis' },
  { name: 'head',   x: 0, y: 0,   len: 8,  angle: 0, parent: 'torso' },
  { name: 'armL',   x: -6, y: 2,  len: 10, angle: -20, parent: 'torso' },
  { name: 'armR',   x: 6,  y: 2,  len: 10, angle: 20,  parent: 'torso' },
  { name: 'legL',   x: -4, y: 10, len: 12, angle: 0,   parent: 'pelvis' },
  { name: 'legR',   x: 4,  y: 10, len: 12, angle: 0,   parent: 'pelvis' },
]
const wheelTemplate = () => [
  { name: 'chassis',  x: 0, y: -6, len: 0, angle: 0, parent: null },
  { name: 'torso',    x: 0, y: 0,  len: 14, angle: 0, parent: 'chassis' },
  { name: 'head',     x: 0, y: 0,  len: 7,  angle: 0, parent: 'torso' },
  { name: 'armL',     x: -6, y: 2, len: 10, angle: -10, parent: 'torso' },
  { name: 'armR',     x: 6,  y: 2, len: 10, angle: 10,  parent: 'torso' },
  { name: 'wheelL',   x: -8, y: 10, len: 0, angle: 0, parent: 'chassis' },
  { name: 'wheelR',   x: 8,  y: 10, len: 0, angle: 0, parent: 'chassis' },
]
const trackTemplate = () => [
  { name: 'hull',     x: 0, y: -4, len: 0, angle: 0, parent: null },
  { name: 'torso',    x: 0, y: 0,  len: 14, angle: 0, parent: 'hull' },
  { name: 'head',     x: 0, y: 0,  len: 7,  angle: 0, parent: 'torso' },
  { name: 'armL',     x: -7, y: 3, len: 11, angle: -15, parent: 'torso' },
  { name: 'armR',     x: 7,  y: 3, len: 11, angle: 15,  parent: 'torso' },
  { name: 'trackL',   x: -10, y: 10, len: 0, angle: 0, parent: 'hull' },
  { name: 'trackR',   x: 10,  y: 10, len: 0, angle: 0, parent: 'hull' },
]
const armTemplate = () => [
  { name: 'hull',      x: 0, y: -6, len: 0, angle: 0, parent: null },
  { name: 'torso',     x: 0, y: 0,  len: 14, angle: 0, parent: 'hull' },
  { name: 'head',      x: 0, y: 0,  len: 6,  angle: 0, parent: 'torso' },
  { name: 'toolArm',   x: 6,  y: 2, len: 18, angle: 25, parent: 'torso' },
  { name: 'legL',      x: -5, y: 10, len: 12, angle: 0, parent: 'hull' },
  { name: 'legR',      x: 5,  y: 10, len: 12, angle: 0, parent: 'hull' },
]
const quadTemplate = () => [
  { name: 'spine',  x: 0, y: -6, len: 14, angle: 0, parent: null },
  { name: 'head',   x: 0, y: 0,  len: 8,  angle: 0, parent: 'spine' },
  { name: 'legFL',  x: -8, y: 12, len: 10, angle: 0, parent: 'spine' },
  { name: 'legFR',  x: 8,  y: 12, len: 10, angle: 0, parent: 'spine' },
  { name: 'legBL',  x: -8, y: -8, len: 10, angle: 0, parent: 'spine' },
  { name: 'legBR',  x: 8,  y: -8, len: 10, angle: 0, parent: 'spine' },
]
const lightTemplate = () => [
  { name: 'root',  x: 0, y: -8, len: 0, angle: 0, parent: null },
  { name: 'torso', x: 0, y: 0,  len: 12, angle: 0, parent: 'root' },
  { name: 'head',  x: 0, y: 0,  len: 6,  angle: 0, parent: 'torso' },
  { name: 'armL',  x: -5, y: 2, len: 8, angle: -15, parent: 'torso' },
  { name: 'armR',  x: 5,  y: 2, len: 8, angle: 15,  parent: 'torso' },
  { name: 'leg',   x: 0,  y: 8, len: 14, angle: 0, parent: 'root' },
]
const bossTemplate = () => [
  { name: 'spine',  x: 0, y: -14, len: 22, angle: 0, parent: null },
  { name: 'head',   x: 0, y: 0,    len: 10, angle: 0, parent: 'spine' },
  { name: 'hornL',  x: -4, y: 0,   len: 8, angle: -35, parent: 'head' },
  { name: 'hornR',  x: 4,  y: 0,   len: 8, angle: 35,  parent: 'head' },
  { name: 'armL',   x: -12, y: 8,  len: 16, angle: -30, parent: 'spine' },
  { name: 'armR',   x: 12,  y: 8,  len: 16, angle: 30,  parent: 'spine' },
  { name: 'legL',   x: -8,  y: 18, len: 16, angle: 0,   parent: 'spine' },
  { name: 'legR',   x: 8,   y: 18, len: 16, angle: 0,   parent: 'spine' },
  { name: 'tail',   x: 0,   y: 22, len: 14, angle: 250, parent: 'spine' },
]
const minionTemplate = () => [
  { name: 'body',  x: 0, y: -8, len: 10, angle: 0, parent: null },
  { name: 'head',  x: 0, y: 0,  len: 6,  angle: 0, parent: 'body' },
  { name: 'armL',  x: -5, y: 2, len: 6, angle: -20, parent: 'body' },
  { name: 'armR',  x: 5,  y: 2, len: 6, angle: 20,  parent: 'body' },
  { name: 'legL',  x: -3, y: 8, len: 8, angle: 0,   parent: 'body' },
  { name: 'legR',  x: 3,  y: 8, len: 8, angle: 0,   parent: 'body' },
]
const flyerTemplate = () => [
  { name: 'body',  x: 0, y: -4, len: 8, angle: 0, parent: null },
  { name: 'head',  x: 0, y: 0,  len: 5, angle: 0, parent: 'body' },
  { name: 'wingL', x: -2, y: -2, len: 14, angle: -50, parent: 'body' },
  { name: 'wingR', x: 2,  y: -2, len: 14, angle: 50,  parent: 'body' },
  { name: 'tail',  x: 0,  y: 6,  len: 8, angle: 0,    parent: 'body' },
]
const swarmTemplate = () => [
  { name: 'core',   x: 0, y: 0,   len: 0, angle: 0, parent: null },
  { name: 'tent1',  x: 0, y: 0,   len: 12, angle: -20, parent: 'core' },
  { name: 'tent2',  x: 0, y: 0,   len: 12, angle: 20,  parent: 'core' },
  { name: 'tent3',  x: 0, y: 0,   len: 12, angle: 135, parent: 'core' },
  { name: 'tent4',  x: 0, y: 0,   len: 12, angle: 225, parent: 'core' },
]
const plantTemplate = () => [
  { name: 'root',    x: 0, y: 0,   len: 0, angle: 0, parent: null },
  { name: 'stem',    x: 0, y: 0,   len: 16, angle: 0, parent: 'root' },
  { name: 'head',    x: 0, y: 0,   len: 8,  angle: 0, parent: 'stem' },
  { name: 'tendril1',x: -2, y: 0,  len: 10, angle: -40, parent: 'stem' },
  { name: 'tendril2',x: 2,  y: 0,  len: 10, angle: 40,  parent: 'stem' },
]
const unknownTemplate = () => [
  { name: 'root', x: 0, y: 0, len: 0, angle: 0, parent: null },
]

const TEMPLATE_FACTORIES = {
  biped: bipedTemplate,
  wheel: wheelTemplate,
  track: trackTemplate,
  arm: armTemplate,
  quad: quadTemplate,
  light: lightTemplate,
  boss: bossTemplate,
  minion: minionTemplate,
  flyer: flyerTemplate,
  swarm: swarmTemplate,
  plant: plantTemplate,
  unknown: unknownTemplate,
}

/** 碰撞形状模板（跟 family 配套）—— 返回一个 shape 数组 */
export const FAMILY_SHAPE_TEMPLATES = {
  biped: [
    { name: 'bodyBox', type: 'rect', x: -6, y: -10, w: 12, h: 18 },
    { name: 'headHit', type: 'rect', x: -4, y: -18, w: 8, h: 8 },
    { name: 'legLBox', type: 'rect', x: -5, y: 8, w: 4, h: 8 },
    { name: 'legRBox', type: 'rect', x: 1,  y: 8, w: 4, h: 8 },
  ],
  wheel: [
    { name: 'hull',   type: 'rect', x: -10, y: -8, w: 20, h: 14 },
    { name: 'wheels', type: 'rect', x: -10, y: 6,  w: 20, h: 6 },
  ],
  track: [
    { name: 'hull',  type: 'rect', x: -12, y: -8, w: 24, h: 14 },
    { name: 'track', type: 'rect', x: -12, y: 6,  w: 24, h: 6 },
  ],
  arm: [
    { name: 'body', type: 'rect', x: -10, y: -10, w: 20, h: 20 },
    { name: 'tool', type: 'rect', x: 8,   y: -4,  w: 10, h: 8 },
  ],
  quad: [
    { name: 'body', type: 'rect', x: -10, y: -6, w: 20, h: 10 },
    { name: 'legs', type: 'rect', x: -10, y: 4,  w: 20, h: 8 },
  ],
  light: [
    { name: 'body', type: 'rect', x: -5, y: -8, w: 10, h: 14 },
    { name: 'leg',  type: 'rect', x: -2, y: 6,  w: 4,  h: 10 },
  ],
  boss: [
    { name: 'body',    type: 'rect',  x: -16, y: -20, w: 32, h: 28 },
    { name: 'head',    type: 'rect',  x: -8,  y: -28, w: 16, h: 10 },
    { name: 'armLBox', type: 'circle', x: -20, y: -6, r: 6 },
    { name: 'armRBox', type: 'circle', x: 20,  y: -6, r: 6 },
    { name: 'legs',    type: 'rect',  x: -14, y: 8,  w: 28, h: 10 },
  ],
  minion: [
    { name: 'body', type: 'rect', x: -6, y: -6, w: 12, h: 12 },
    { name: 'feet', type: 'rect', x: -6, y: 6,  w: 12, h: 4 },
  ],
  flyer: [
    { name: 'body', type: 'rect', x: -4, y: -4, w: 8,  h: 10 },
    { name: 'wingL', type: 'rect', x: -16, y: -4, w: 12, h: 4 },
    { name: 'wingR', type: 'rect', x: 4,   y: -4, w: 12, h: 4 },
  ],
  swarm: [
    { name: 'core', type: 'circle', x: 0, y: 0, r: 8 },
  ],
  plant: [
    { name: 'stem',  type: 'rect', x: -2, y: -8, w: 4, h: 14 },
    { name: 'head',  type: 'circle', x: 0, y: -10, r: 6 },
  ],
  unknown: [],
}

export function bonesForFamily(familyId) {
  const f = TEMPLATE_FACTORIES[familyId] || unknownTemplate
  return f()
}

export function shapesForFamily(familyId) {
  return FAMILY_SHAPE_TEMPLATES[familyId] || []
}

// ---- 新构型（rigs.js）：归一化 from→to，按「帧像素框」摆放 -------------------
// 老模板写死 ±16 这种小数字，套到 272×336 的帧上全挤在左上角（看着像没生效）；
// 新构型按帧宽高归一化，用 skeleton-fit 识别出的锚点，识别失败才退回模板兜底值。

/** sprite 的「绘制框」像素尺寸：优先帧矩形，其次 sprite.w/h（逻辑命中框） */
export function frameBoxOf(sprite) {
  const sp = sprite || currentSprite()
  if (!sp) return { w: 32, h: 32 }
  const act = sp.actions?.find((a) => a.frames?.length)
  const f = act?.frames?.[0]
  if (f && f.w > 0 && f.h > 0) return { w: f.w, h: f.h }
  return { w: Math.max(1, Number(sp.w) || 32), h: Math.max(1, Number(sp.h) || 32) }
}

/** 用模板锚点生成骨头（绝对坐标，parent 已转 id） */
export function placeBonesForFamily(familyId, box) {
  const b = box || { w: 32, h: 32 }
  return toStoredBones(assembleRig(familyId, templateAnchors(familyId, b), b))
}

/** 用模板锚点生成碰撞体 */
export function placeShapesForFamily(familyId, box) {
  const b = box || { w: 32, h: 32 }
  return toStoredShapes(assembleShapes(familyId, templateAnchors(familyId, b), b))
}

/**
 * 名字父级 → id 父级，并补齐编辑器需要的字段。
 * 关键：识别/模板给的都是**绝对坐标**，而编辑器 boneTransforms 要求子骨骼用
 * 「父骨骼末端坐标系里的偏移 + 相对角度」，所以先 absoluteToLocal 再落库。
 */
function toStoredBones(list) {
  const local = absoluteToLocal(list)
  const ids = new Map()
  for (const b of local) ids.set(b.name, uid('bn'))
  return local.map((b) => ({
    id: ids.get(b.name),
    name: b.name,
    kind: b.kind || 'root',
    x: b.x,
    y: b.y,
    len: b.len,
    angle: b.angle,
    parent: b.parent ? ids.get(b.parent) || null : null,
    conf: b.conf,
  }))
}

function toStoredShapes(list) {
  return list.map((s) => ({
    id: uid('shp'),
    name: s.name,
    role: s.role || 'body',
    type: s.type || 'rect',
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
    r: s.r || 0,
    angle: s.angle || 0,
    points: s.points || [],
  }))
}

// ---- 从游戏注册表拉机体/怪物参考数据 ----
// Content / KIND 已从顶部静态 import

function _fillRegistry() {
  try {
    ROLE_LIST.length = 0
    for (const c of Content.all(KIND.CHASSIS)) {
      ROLE_LIST.push({
        id: c.id,
        name: c.name,
        family: c.family || 'biped',
        hitbox: c.hitbox || [24, 32],
        color: c.color,
        artId: c.artId || c.id,
      })
    }
    const mkMonster = (m, boss) => ({
      id: m.id,
      name: m.name || m.id,
      biome: m.biome || [],
      elite: !!m.elite,
      boss,
      hitbox: m.hitbox || m.size || [20, 24],
    })
    const all = Content.all(KIND.MONSTER)
    const byId = new Map(all.map((m) => [m.id, m]))
    MONSTER_LIST.length = 0
    BOSS_LIST.length = 0
    // 常规小怪（按官方顺序）；rm_* 是关卡专属小怪（几百条），不入列
    for (const id of MONSTER_IDS) {
      if (id.startsWith('rm_')) continue
      const m = byId.get(id)
      if (m) MONSTER_LIST.push(mkMonster(m, false))
    }
    // 大型 / BOSS（含主题站 BOSS tb_*）
    for (const id of LARGE_IDS) {
      const m = byId.get(id)
      if (m) BOSS_LIST.push(mkMonster(m, true))
    }
    _registryLoaded = true
  } catch (e) {
    console.warn('[sprite-editor] registry 加载失败', e)
  }
}

let _registryLoaded = false
// 用 reactive 数组：注册表可能在模块初始化之后才填充完，
// loadRegistry() 重填时左栏列表需要跟着刷新。
export const ROLE_LIST = reactive([])  // { id, name, family, hitbox:[w,h], color, artId }
export const MONSTER_LIST = reactive([])  // { id, name, biome, elite, boss:false, hitbox:[w,h] }
export const BOSS_LIST = reactive([])  // { id, name, biome, elite, boss:true, hitbox:[w,h] }

export function loadRegistry() {
  // 允许重复填充：模块初始化时注册表可能还没就绪（chassis 由 content 总入口注册）
  _fillRegistry()
}
// ESM 初始化时立刻填充一次
_fillRegistry()

export function registryIsLoaded() { return _registryLoaded }

/** 根据 refId + kind 自动猜测 family */
export function guessFamilyFromRef(kind, refId) {
  if (kind === 'role') {
    const def = ROLE_LIST.find((d) => d.id === refId)
    if (!def) return null
    return FAMILY_FROM_CHASSIS[def.family] || 'biped'
  }
  // 怪物：BOSS 一律 boss 族
  if (BOSS_LIST.some((d) => d.id === refId)) return 'boss'
  const def = MONSTER_LIST.find((d) => d.id === refId)
  if (!def) return null
  // 怪物：按 id 关键字归类
  const id = def.id.toLowerCase()
  if (id.includes('fly') || id.includes('wing') || id.includes('drone')) return 'flyer'
  if (id.includes('swarm') || id.includes('swarmer') || id.includes('orb')) return 'swarm'
  if (id.includes('boss') || id.includes('tyrant') || id.includes('golem') || id.includes('warden')) return 'boss'
  if (id.includes('plant') || id.includes('cult') || id.includes('tentacle')) return 'plant'
  return 'minion'
}

const STATUS = { PUBLISHED: 'published', DRAFT: 'draft' }

function emptyProject() {
  return {
    version: 2,
    name: '未命名工程',
    status: STATUS.PUBLISHED,
    updatedAt: null,
    publishedAt: null,
    sheets: [],
    sprites: [],
    effects: [],
    presets: BUILTIN_PRESETS.map((p) => ({ ...p })),
  }
}

/** 编辑器全局状态（响应式） */
export const SE = reactive({
  project: emptyProject(),
  sel: {
    sheetId: '',
    spriteId: '',
    actionId: '',
    frameId: '',
    boneId: '',
    shapeId: '',
    effectId: '',
    tool: 'select', // select | frame | bone | rect | circle | poly | grip | cast
    /** 当前选中的游戏内目标（角色 / 怪物 / BOSS）——先选目标再导入精灵图 */
    target: { kind: '', refId: '', boss: false },
  },
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
    grid: true,
    bones: true,
    shapes: true,
    slots: true,
    frames: true,
    pixels: false,
  },
  play: { on: false, t: 0, actionId: '' },
  /** 导入图片时缓存的 Image 对象（非响应式，避免深层代理开销） */
})

const IMG_CACHE = new Map()

export function sheetImage(sheet) {
  if (!sheet?.src) return null
  let img = IMG_CACHE.get(sheet.id)
  if (img && img.src === sheet.src) return img
  img = new Image()
  img.src = sheet.src
  IMG_CACHE.set(sheet.id, img)
  return img
}

// ============================================================================
// 查询
// ============================================================================

export const currentSheet = () => SE.project.sheets.find((s) => s.id === SE.sel.sheetId) || SE.project.sheets[0] || null
export const currentSprite = () => SE.project.sprites.find((s) => s.id === SE.sel.spriteId) || null
export const currentAction = () => {
  const sp = currentSprite()
  if (!sp) return null
  return sp.actions.find((a) => a.id === SE.sel.actionId) || sp.actions[0] || null
}
export const currentFrame = () => {
  const a = currentAction()
  if (!a) return null
  return a.frames.find((f) => f.id === SE.sel.frameId) || a.frames[0] || null
}
export const currentBone = () => {
  const sp = currentSprite()
  if (!sp) return null
  return sp.bones.find((b) => b.id === SE.sel.boneId) || null
}
export const currentShape = () => {
  const sp = currentSprite()
  if (!sp) return null
  return sp.shapes.find((s) => s.id === SE.sel.shapeId) || null
}
export const currentEffect = () => SE.project.effects.find((e) => e.id === SE.sel.effectId) || null

/** 当前 sprite 的所有骨骼（按父级先于子级排序） */
export function orderedBones(sprite) {
  const sp = sprite || currentSprite()
  if (!sp) return []
  const byId = new Map(sp.bones.map((b) => [b.id, b]))
  const out = []
  const seen = new Set()
  const walk = (b, depth) => {
    if (seen.has(b.id)) return
    seen.add(b.id)
    out.push({ bone: b, depth })
    for (const c of sp.bones) if (c.parent === b.id) walk(c, depth + 1)
  }
  for (const b of sp.bones) if (!b.parent || !byId.has(b.parent)) walk(b, 0)
  return out
}

/** 骨骼的世界（sprite 局部）位置与角度，含父子链 */
export function boneTransforms(sprite, pose) {
  const sp = sprite || currentSprite()
  const map = new Map()
  if (!sp) return map
  const resolve = (b, seen = 0) => {
    if (map.has(b.id)) return map.get(b.id)
    if (seen > 24) return { x: b.x, y: b.y, a: b.angle }
    let x = b.x
    let y = b.y
    let a = b.angle
    if (pose && pose[b.id]) {
      const p = pose[b.id]
      if (Number.isFinite(p.x)) x = p.x
      if (Number.isFinite(p.y)) y = p.y
      if (Number.isFinite(p.rot)) a = p.rot
    }
    if (b.parent) {
      const parent = sp.bones.find((q) => q.id === b.parent)
      if (parent) {
        const pt = resolve(parent, seen + 1)
        const rad = (pt.a * Math.PI) / 180
        // 父骨骼末端为锚点，子骨骼的 x/y 是父坐标系里的偏移
        const tipX = pt.x + Math.cos(rad) * parent.len
        const tipY = pt.y + Math.sin(rad) * parent.len
        x = tipX + Math.cos(rad) * b.x - Math.sin(rad) * b.y
        y = tipY + Math.sin(rad) * b.x + Math.cos(rad) * b.y
        a = pt.a + a
      }
    }
    const t = { x, y, a }
    map.set(b.id, t)
    return t
  }
  for (const b of sp.bones) resolve(b)
  return map
}

// ============================================================================
// 持久化
// ============================================================================

// ---- 落盘（防丢失）：浏览器存储 + 磁盘文件双写 -----------------------------
// localStorage 说清就清、换浏览器就没、隐私模式还会直接抛异常。
// 所以每次保存都顺手把工程写到 <root>/editor-data/sprite-editor/project.json
// （经 dev server 的 /__editor/sprite/* 接口）。防抖 600ms，内容没变不写。
const DISK_DEBOUNCE_MS = 600
let _diskTimer = null
let _diskLastHash = ''
let _diskWriting = null

function scheduleDiskSave() {
  if (_diskTimer) clearTimeout(_diskTimer)
  _diskTimer = setTimeout(() => {
    _diskTimer = null
    void flushDiskProject()
  }, DISK_DEBOUNCE_MS)
}

/**
 * 立刻把当前工程写到磁盘。
 * @param {boolean} force 内容没变也写（脚本 / 关面板时用）
 * @returns {Promise<{ok:boolean, skipped?:boolean, bytes?:number, error?:string}>}
 */
export async function flushDiskProject(force = false) {
  if (_diskTimer) {
    clearTimeout(_diskTimer)
    _diskTimer = null
  }
  const plain = plainProject(SE.project)
  if (!plain) return { ok: false, error: 'empty-project' }
  // 去重只看内容：updatedAt 每次保存都会变，把它排除掉，否则永远判定「变了」
  const hashSrc = plainProject(plain)
  if (hashSrc) delete hashSrc.updatedAt
  const hash = hashText(JSON.stringify(hashSrc || plain))
  if (!force && hash === _diskLastHash) return { ok: true, skipped: true }
  _diskWriting = diskPutProject(plain).then((r) => {
    if (r.ok) _diskLastHash = hash
    return r
  })
  return _diskWriting
}

/** 上次落盘结果 / 状态（UI 徽标用）。 */
export function diskSaveState() {
  return { lastHash: _diskLastHash, pending: !!_diskTimer, writing: !!_diskWriting }
}

/** localStorage 里没有工程时，从磁盘恢复（清过浏览器数据的场景）。 */
export async function restoreProjectFromDiskIfEmpty() {
  let hasLocal = false
  try {
    hasLocal = !!localStorage.getItem(KEY)
  } catch (e) {
    hasLocal = false
  }
  if (hasLocal) return { ok: false, reason: 'local-exists' }
  const proj = await diskGetProject()
  if (!proj) return { ok: false, reason: 'no-disk-project' }
  applyProjectData(proj, { save: true })
  return { ok: true, sheets: (proj.sheets || []).length, sprites: (proj.sprites || []).length }
}

/** 把浏览器里已有的历史补写到磁盘（迁移 / 首次落盘）。 */
export async function migrateHistoryToDisk() {
  try {
    return await syncHistoryToDisk()
  } catch (e) {
    return { ok: false, migrated: 0, reason: String(e?.message || e) }
  }
}

export function saveProject() {
  try {
    SE.project.updatedAt = new Date().toISOString()
    localStorage.setItem(KEY, JSON.stringify(SE.project))
    scheduleDiskSave()
    return true
  } catch (e) {
    console.warn('[sprite-editor] 保存失败', e)
    // localStorage 写不进去（配额 / 隐私模式）至少还有磁盘
    scheduleDiskSave()
    return false
  }
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.sheets)) return false
    const p = emptyProject()
    p.name = data.name || p.name
    // 向后兼容：旧工程没有 status，按 published 处理
    p.status = data.status || STATUS.PUBLISHED
    p.updatedAt = data.updatedAt || null
    p.publishedAt = data.publishedAt || null
    p.sheets = (data.sheets || []).map((s) => ({
      id: s.id || uid('sh'),
      name: s.name || '精灵图',
      src: s.src || '',
      width: s.width | 0,
      height: s.height | 0,
      naturalW: Number(s.naturalW) || s.width | 0,
      naturalH: Number(s.naturalH) || s.height | 0,
      scale: Number(s.scale) || 1,
      gridW: Number(s.gridW) || 32,
      gridH: Number(s.gridH) || 32,
    }))
    p.sprites = (data.sprites || []).map(normalizeSprite)
    p.effects = (data.effects || []).map(normalizeEffect)
    p.presets = (data.presets && data.presets.length ? data.presets : BUILTIN_PRESETS).map((q) => ({
      id: q.id || uid('pre'),
      name: q.name || '预设',
      w: Number(q.w) || 32,
      h: Number(q.h) || 32,
      builtin: !!q.builtin,
    }))
    SE.project = p
    return true
  } catch (e) {
    console.warn('[sprite-editor] 读取失败', e)
    return false
  }
}

export function resetProject() {
  recordHistory('清空前')
  SE.project = emptyProject()
  clearSelection()
}

export function clearSelection() {
  SE.sel.sheetId = ''
  SE.sel.spriteId = ''
  SE.sel.actionId = ''
  SE.sel.frameId = ''
  SE.sel.boneId = ''
  SE.sel.shapeId = ''
  SE.sel.effectId = ''
  SE.play.on = false
  SE.play.t = 0
}

function normalizeSprite(s) {
  const kind = s.kind === 'monster' ? 'monster' : s.kind === 'role' ? 'role' : 'generic'
  return {
    id: s.id || uid('sp'),
    name: s.name || (kind === 'monster' ? '怪物' : kind === 'role' ? '角色' : 'Sprite'),
    sheetId: s.sheetId || '',
    kind,
    refId: s.refId || '',
    family: s.family || 'unknown',
    x: Number(s.x) || 0,
    y: Number(s.y) || 0,
    w: Number(s.w) || 32,
    h: Number(s.h) || 32,
    actions: (s.actions || []).map(normalizeAction),
    bones: (s.bones || []).map((b) => ({
      id: b.id || uid('bn'),
      name: b.name || '骨骼',
      kind: b.kind || '',
      x: Number(b.x) || 0,
      y: Number(b.y) || 0,
      len: Number(b.len) || 0,
      angle: Number(b.angle) || 0,
      parent: b.parent || null,
      conf: b.conf === undefined || b.conf === null ? undefined : Number(b.conf) || 0,
    })),
    shapes: (s.shapes || []).map((q) => ({
      id: q.id || uid('shp'),
      name: q.name || '碰撞',
      role: q.role || '',
      type: q.type || 'rect',
      x: Number(q.x) || 0,
      y: Number(q.y) || 0,
      w: Number(q.w) || 0,
      h: Number(q.h) || 0,
      r: Number(q.r) || 0,
      angle: Number(q.angle) || 0,
      points: Array.isArray(q.points) ? q.points.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [],
    })),
    grip: q2(s.grip),
    cast: q2(s.cast),
    // 智能识别元数据（来源 / 置信度 / 覆盖率 / 警告）：只做展示与追溯，不参与运行
    rig: s.rig && typeof s.rig === 'object' ? { ...s.rig } : null,
  }
}
function q2(v) {
  if (!v) return null
  return { x: Number(v.x) || 0, y: Number(v.y) || 0, angle: Number(v.angle) || 0 }
}

function normalizeAction(a) {
  return {
    id: a.id || uid('ac'),
    name: a.name || '动作',
    fps: Number(a.fps) || 10,
    loop: a.loop !== false,
    frames: (a.frames || []).map((f) => ({
      id: f.id || uid('fr'),
      name: f.name || '',
      x: Number(f.x) || 0,
      y: Number(f.y) || 0,
      w: Number(f.w) || 32,
      h: Number(f.h) || 32,
      pose: f.pose && typeof f.pose === 'object' ? { ...f.pose } : {},
    })),
  }
}

function normalizeEffect(e) {
  return {
    id: e.id || uid('ef'),
    name: e.name || '特效',
    sheetId: e.sheetId || '',
    fps: Number(e.fps) || 12,
    loop: e.loop !== false,
    anchorX: Number(e.anchorX) || 0.5,
    anchorY: Number(e.anchorY) || 0.5,
    frames: (e.frames || []).map((f) => ({
      id: f.id || uid('efr'),
      name: f.name || '',
      x: Number(f.x) || 0,
      y: Number(f.y) || 0,
      w: Number(f.w) || 32,
      h: Number(f.h) || 32,
      pose: {},
    })),
  }
}

// ============================================================================
// 精灵图
// ============================================================================

/** 导入图片文件 → 精灵图 */
export async function importSheetFile(file, name) {
  const src = await fileToDataUrl(file)
  const img = await loadImage(src)
  return addSheet({
    name: name || file.name?.replace(/\.[^.]+$/, '') || '精灵图',
    src,
    width: img.naturalWidth,
    height: img.naturalHeight,
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
  })
}

export function addSheet({ name = '精灵图', src = '', width = 0, height = 0, naturalW = 0, naturalH = 0 }) {
  const sheet = {
    id: uid('sh'),
    name,
    src,
    width,
    height,
    naturalW: naturalW || width,
    naturalH: naturalH || height,
    scale: 1,
    gridW: 32,
    gridH: 32,
  }
  SE.project.sheets.push(sheet)
  SE.sel.sheetId = sheet.id
  return sheet
}

/** 设置精灵图缩放：逻辑尺寸 = 原始尺寸 × 缩放 */
export function setSheetScale(sheet, scale) {
  if (!sheet) return
  const s = Math.max(0.05, Number(scale) || 1)
  sheet.scale = s
  if (sheet.naturalW) sheet.width = Math.max(1, Math.round(sheet.naturalW * s))
  if (sheet.naturalH) sheet.height = Math.max(1, Math.round(sheet.naturalH * s))
  saveProject()
}

/** 直接设定精灵图逻辑尺寸，缩放随之更新 */
export function setSheetSize(sheet, w, h) {
  if (!sheet) return
  const nw = Math.max(1, Math.round(Number(w) || sheet.width))
  const nh = Math.max(1, Math.round(Number(h) || sheet.height))
  sheet.width = nw
  sheet.height = nh
  if (sheet.naturalW) sheet.scale = nw / sheet.naturalW
  saveProject()
}

export function removeSheet(id) {
  const i = SE.project.sheets.findIndex((s) => s.id === id)
  if (i < 0) return
  SE.project.sheets.splice(i, 1)
  SE.project.sprites = SE.project.sprites.filter((s) => s.sheetId !== id)
  if (SE.sel.sheetId === id) {
    SE.sel.sheetId = SE.project.sheets[0]?.id || ''
    SE.sel.spriteId = ''
    SE.sel.actionId = ''
    SE.sel.frameId = ''
  }
  saveProject()
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}

// ============================================================================
// Sprite（角色）
// ============================================================================

export function addSprite(sheetId, rect, opts = {}) {
  const sheet = SE.project.sheets.find((s) => s.id === sheetId) || SE.project.sheets[0]
  if (!sheet) return null
  const kind = opts.kind || 'generic'
  const family = opts.family || 'unknown'
  // 如果提供了 refId，自动猜 family + 建议尺寸
  let w = rect?.w ?? 32
  let h = rect?.h ?? 32
  let name = opts.name || `${kind === 'monster' ? '怪物' : kind === 'role' ? '角色' : 'Sprite'} ${SE.project.sprites.length + 1}`
  let kindFinal = kind
  let familyFinal = family
  let refId = opts.refId || ''
  if (opts.refId) {
    const found = findEntityDef(kind, opts.refId)
    familyFinal = opts.family || guessFamilyFromRef(kind, opts.refId) || family
    if (found) {
      const def = found.def
      name = def.name || name
      if (def.hitbox) { w = def.hitbox[0] || w; h = def.hitbox[1] || h }
    }
  } else if (opts.family) {
    familyFinal = opts.family
  }
  const sp = normalizeSprite({
    name,
    sheetId: sheet.id,
    kind: kindFinal,
    refId,
    family: familyFinal,
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
    w, h,
    actions: [{ name: 'idle', fps: 8, loop: true, frames: [] }],
    // autoBones/autoShapes 走「按帧框摆放」的新构型（老模板坐标写死，尺寸对不上）
    bones: opts.autoBones ? placeBonesForFamily(familyFinal, { w, h }) : [],
    shapes: opts.autoShapes ? placeShapesForFamily(familyFinal, { w, h }) : [],
  })
  SE.project.sprites.push(sp)
  SE.sel.spriteId = sp.id
  SE.sel.actionId = sp.actions[0].id
  SE.sel.frameId = ''
  SE.sel.boneId = ''
  SE.sel.shapeId = ''
  saveProject()
  return sp
}

export function removeSprite(id) {
  const i = SE.project.sprites.findIndex((s) => s.id === id)
  if (i < 0) return
  SE.project.sprites.splice(i, 1)
  if (SE.sel.spriteId === id) {
    SE.sel.spriteId = ''
    SE.sel.actionId = ''
    SE.sel.frameId = ''
  }
  saveProject()
}

// ============================================================================
// 目标选择（角色 / 怪物 / BOSS → 先选目标，再上传精灵图）
// ============================================================================

/** 按 kind + refId 找实体定义（怪物侧含 BOSS 列表） */
export function findEntityDef(kind, refId) {
  if (!refId) return null
  if (kind === 'role') {
    const d = ROLE_LIST.find((x) => x.id === refId)
    return d ? { def: d, boss: false } : null
  }
  const m = MONSTER_LIST.find((x) => x.id === refId)
  if (m) return { def: m, boss: false }
  const b = BOSS_LIST.find((x) => x.id === refId)
  if (b) return { def: b, boss: true }
  return null
}

/** 某 refId 是否是 BOSS */
export function isBossRef(refId) {
  return !!BOSS_LIST.find((x) => x.id === refId)
}

/** 左栏分组（角色 / 怪物 / BOSS） */
export function targetGroups() {
  return [
    { id: 'role', name: '角色', en: 'ROLES', kind: 'role', boss: false, items: ROLE_LIST },
    { id: 'monster', name: '怪物', en: 'MONSTERS', kind: 'monster', boss: false, items: MONSTER_LIST },
    { id: 'boss', name: 'BOSS', en: 'BOSSES', kind: 'monster', boss: true, items: BOSS_LIST },
  ]
}

/** 选中目标 */
export function setTarget(kind, refId, boss = false) {
  SE.sel.target = { kind, refId, boss: !!boss }
}

/** 取消选中目标 */
export function clearTarget() {
  SE.sel.target = { kind: '', refId: '', boss: false }
}

/** 目标定义（未选中返回 null） */
export function targetDef(target = SE.sel.target) {
  if (!target?.refId) return null
  return findEntityDef(target.kind, target.refId)?.def || null
}

/** 已绑定该目标的 sprite 列表 */
export function spritesOfTarget(refId) {
  if (!refId) return []
  return SE.project.sprites.filter((s) => s.refId === refId)
}

/** 为目标创建 sprite（自动定族系 + 套骨骼/碰撞模板） */
export function createSpriteForTarget(target, sheet) {
  const sh = sheet || SE.project.sheets[0]
  if (!sh || !target?.refId) return null
  const kind = target.kind === 'role' ? 'role' : 'monster'
  const found = findEntityDef(kind, target.refId)
  let family
  if (target.boss) family = 'boss'
  else if (kind === 'role') family = FAMILY_FROM_CHASSIS[found?.def?.family] || 'biped'
  else family = guessFamilyFromRef(kind, target.refId) || 'minion'
  return addSprite(sh.id, { x: 0, y: 0 }, {
    kind,
    refId: target.refId,
    family,
    name: found?.def?.name,
    autoBones: true,
    autoShapes: true,
  })
}

/** 导入精灵图：若已选目标，导入后自动为该目标创建 sprite */
export async function importSheetForTarget(file, target, name) {
  const sheet = await importSheetFile(file, name)
  if (target?.refId) createSpriteForTarget(target, sheet)
  return sheet
}

// ============================================================================
// 专项编辑：分类 / 模板
// ============================================================================

/** 给 sprite 设置 kind / refId / family，并可选地套用模板 */
export function setSpriteRef(opts) {
  const sp = currentSprite()
  if (!sp) return null
  if (opts.kind) {
    sp.kind = opts.kind === 'role' || opts.kind === 'monster' ? opts.kind : 'generic'
  }
  if (opts.refId !== undefined) sp.refId = opts.refId || ''
  if (opts.family) sp.family = opts.family
  // 自动推导
  if (opts.kind && opts.refId) {
    if (!opts.family) {
      const f = guessFamilyFromRef(opts.kind, opts.refId)
      if (f) sp.family = f
    }
    const found = findEntityDef(opts.kind, opts.refId)
    if (found) {
      const def = found.def
      sp.name = def.name || sp.name
      if (def.hitbox) {
        sp.w = def.hitbox[0] || sp.w
        sp.h = def.hitbox[1] || sp.h
      }
    }
  }
  saveProject()
  return sp
}

/**
 * 套用某族系的骨骼模板。
 * replace=true 先清空现有骨骼；false 在现有骨骼基础上追加（默认 true）。
 */
export function applyFamilyBones(sprite, familyId, { replace = true, scale = 1 } = {}) {
  const sp = sprite || currentSprite()
  if (!sp) return 0
  const box = frameBoxOf(sp)
  const placed = placeBonesForFamily(familyId, { w: box.w * scale, h: box.h * scale })
  if (!placed.length) return 0
  if (replace) {
    sp.bones = placed
  } else {
    const byName = new Map(sp.bones.map((b) => [b.name, b.id]))
    for (const b of placed) {
      if (b.parent && !sp.bones.some((q) => q.id === b.parent)) b.parent = byName.get(b.name) || null
      sp.bones.push(b)
    }
  }
  if (replace) SE.sel.boneId = sp.bones[0]?.id || ''
  sp.family = familyId
  saveProject()
  return placed.length
}

/** 套用某族系的碰撞模板（替换 / 追加） */
export function applyFamilyShapes(sprite, familyId, { replace = true, scale = 1 } = {}) {
  const sp = sprite || currentSprite()
  if (!sp) return 0
  const box = frameBoxOf(sp)
  const placed = placeShapesForFamily(familyId, { w: box.w * scale, h: box.h * scale })
  if (!placed.length) return 0
  if (replace) sp.shapes = placed
  else sp.shapes.push(...placed)
  saveProject()
  return placed.length
}

// ============================================================================
// 智能识别（骨骼 + 碰撞体）
// ============================================================================

/** 把 sheet 的某个矩形区域读成紧凑 alpha（识别器只吃 alpha） */
function readSheetAlpha(sheet, rect) {
  return new Promise((resolve) => {
    const img = sheetImage(sheet)
    if (!img || !img.complete || !img.naturalWidth) {
      // 图还在解码：等一次 onload
      if (img && !img.complete) {
        img.onload = () => resolve(readSheetAlpha(sheet, rect))
        img.onerror = () => resolve(null)
        return
      }
      resolve(null)
      return
    }
    const w = Math.max(1, Math.round(rect.w))
    const h = Math.max(1, Math.round(rect.h))
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, rect.x, rect.y, w, h, 0, 0, w, h)
    resolve({ alpha: alphaFromRGBA(ctx.getImageData(0, 0, w, h).data, w, h), w, h })
  })
}

/**
 * 智能识别骨骼 + 碰撞体并写回 sprite。
 * @param {object} sprite
 * @param {{mode?:'all'|'action'|'current', useAiMask?:boolean, family?:string, threshold?:number}} opts
 *        mode=all      整条动作一起拟合（关节取中位数，最稳，默认）
 *        mode=action   只有当前动作
 *        mode=current  只有当前帧
 * @returns {Promise<object>} { ok, bones, shapes, stats, warnings }
 */
export async function autoFitRig(sprite, opts = {}) {
  const sp = sprite || currentSprite()
  if (!sp) return { ok: false, reason: '没有选中 sprite' }
  const sheet = SE.project.sheets.find((s) => s.id === sp.sheetId) || SE.project.sheets[0]
  if (!sheet) return { ok: false, reason: '这个 sprite 没有图集' }

  const family = opts.family || sp.family || 'unknown'
  const mode = opts.mode || 'all'
  const act = mode === 'current' ? currentAction() : sp.actions.find((a) => a.frames?.length)
  const box = frameBoxOf(sp)

  // 选帧：current 只取当前帧；action 取该动作全部；all 取所有动作
  let frames = []
  if (mode === 'current') {
    const f = currentFrame() || act?.frames?.[0]
    if (f) frames.push(f)
  } else if (mode === 'action') {
    frames = (act?.frames || []).slice()
  } else {
    const seen = new Set()
    for (const a of sp.actions || []) {
      for (const f of a.frames || []) {
        const key = `${f.x},${f.y},${f.w},${f.h}`
        if (seen.has(key)) continue
        seen.add(key)
        frames.push(f)
      }
    }
  }
  if (!frames.length) return { ok: false, reason: '这个 sprite 还没有切帧' }

  const loaded = []
  for (const f of frames) {
    const px = await readSheetAlpha(sheet, f)
    if (px) loaded.push({ f, ...px })
  }
  if (!loaded.length) return { ok: false, reason: '帧图像读取失败（图集还没解码完？）' }

  // AI 蒙版（Hugging Face，可选）：拿不到就用图集自带的 alpha
  let ai = null
  if (opts.useAiMask) {
    try {
      const { aiSegment } = await import('./ai-mask.js')
      ai = await aiSegment({ sheet, rect: loaded[0].f })
    } catch (e) {
      ai = { ok: false, reason: String(e?.message || e) }
    }
  }
  if (ai?.ok && ai.alpha && ai.w === loaded[0].w && ai.h === loaded[0].h) {
    loaded[0] = { ...loaded[0], alpha: ai.alpha }
  }

  const fit =
    mode === 'current' && loaded.length === 1
      ? fitSkeleton({ alpha: loaded[0].alpha, w: loaded[0].w, h: loaded[0].h, family, threshold: opts.threshold })
      : fitFrames(
          loaded.map((q) => ({ alpha: q.alpha, w: q.w, h: q.h })),
          { family, threshold: opts.threshold },
        )
  if (!fit.ok) return { ...fit, reason: fit.reason || '识别失败' }

  sp.bones = toStoredBones(fit.bones)
  sp.shapes = toStoredShapes(fit.shapes)
  sp.family = family
  sp.rig = {
    fittedAt: new Date().toISOString(),
    source: ai?.ok ? 'ai+local' : 'local',
    mode,
    family,
    frames: fit.frames || 1,
    stats: fit.stats || null,
    warnings: fit.warnings || [],
  }
  SE.sel.boneId = sp.bones[0]?.id || ''
  SE.sel.shapeId = ''
  saveProject()
  return {
    ok: true,
    bones: sp.bones.length,
    shapes: sp.shapes.length,
    stats: fit.stats,
    warnings: fit.warnings || [],
    frameBox: box,
  }
}

/** 按 kind 过滤 sprite 列表；传 null = 全部 */
export function filteredSprites(kind = null) {
  const list = SE.project.sprites
  if (!kind || kind === 'all') return list
  return list.filter((s) => s.kind === kind || (kind === 'role' && s.kind === 'generic' && !s.refId))
}

// ============================================================================
// 动作编排（顺序即精灵图排布顺序）
// ============================================================================

export function addAction(name) {
  const sp = currentSprite()
  if (!sp) return null
  const act = normalizeAction({ name: name || `动作 ${sp.actions.length + 1}`, fps: 10, loop: true, frames: [] })
  sp.actions.push(act)
  SE.sel.actionId = act.id
  SE.sel.frameId = ''
  saveProject()
  return act
}

export function removeAction(id) {
  const sp = currentSprite()
  if (!sp) return
  const i = sp.actions.findIndex((a) => a.id === id)
  if (i < 0) return
  sp.actions.splice(i, 1)
  if (SE.sel.actionId === id) {
    SE.sel.actionId = sp.actions[0]?.id || ''
    SE.sel.frameId = ''
  }
  saveProject()
}

/** 上移 / 下移动作（改变精灵图中的排布顺序） */
export function moveAction(id, dir) {
  const sp = currentSprite()
  if (!sp) return
  const i = sp.actions.findIndex((a) => a.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sp.actions.length) return
  const [a] = sp.actions.splice(i, 1)
  sp.actions.splice(j, 0, a)
  saveProject()
}

export function moveFrame(actionId, frameId, dir) {
  const sp = currentSprite()
  if (!sp) return
  const act = sp.actions.find((a) => a.id === actionId)
  if (!act) return
  const i = act.frames.findIndex((f) => f.id === frameId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= act.frames.length) return
  const [f] = act.frames.splice(i, 1)
  act.frames.splice(j, 0, f)
  saveProject()
}

/**
 * 自动排布：按「动作顺序 → 帧顺序」把帧铺到精灵图上（行优先）。
 * 这是"动作编排主要为精灵图排序"的落地——编排好动作后一键铺图。
 */
export function autoLayout(sprite, opts = {}) {
  const sp = sprite || currentSprite()
  if (!sp) return
  const sheet = SE.project.sheets.find((s) => s.id === sp.sheetId) || SE.project.sheets[0]
  if (!sheet) return
  const cw = Math.max(1, opts.cellW || sp.w || sheet.gridW || 32)
  const ch = Math.max(1, opts.cellH || sp.h || sheet.gridH || 32)
  const perRow = Math.max(1, Math.floor((sheet.width || cw) / cw))
  let idx = 0
  for (const act of sp.actions) {
    for (const f of act.frames) {
      const col = idx % perRow
      const row = Math.floor(idx / perRow)
      f.x = col * cw
      f.y = row * ch
      f.w = cw
      f.h = ch
      idx++
    }
  }
  // 角色框对齐到第一帧
  const first = sp.actions[0]?.frames[0]
  if (first) {
    sp.x = first.x
    sp.y = first.y
  }
  saveProject()
}

// ============================================================================
// 帧
// ============================================================================

export function addFrame(actionId, rect) {
  const sp = currentSprite()
  if (!sp) return null
  const act = sp.actions.find((a) => a.id === actionId) || currentAction()
  if (!act) return null
  const f = normalizeAction({ frames: [rect || {}] }).frames[0]
  f.name = `帧 ${act.frames.length + 1}`
  act.frames.push(f)
  SE.sel.frameId = f.id
  saveProject()
  return f
}

export function removeFrame(actionId, frameId) {
  const sp = currentSprite()
  if (!sp) return
  const act = sp.actions.find((a) => a.id === actionId)
  if (!act) return
  const i = act.frames.findIndex((f) => f.id === frameId)
  if (i < 0) return
  act.frames.splice(i, 1)
  if (SE.sel.frameId === frameId) SE.sel.frameId = act.frames[Math.min(i, act.frames.length - 1)]?.id || ''
  saveProject()
}

// ============================================================================
// 骨骼 / 碰撞 / slot
// ============================================================================

export function addBone(x, y, parent) {
  const sp = currentSprite()
  if (!sp) return null
  const b = {
    id: uid('bn'),
    name: `骨骼 ${sp.bones.length + 1}`,
    x,
    y,
    len: 12,
    angle: 0,
    parent: parent || null,
  }
  sp.bones.push(b)
  SE.sel.boneId = b.id
  saveProject()
  return b
}

export function removeBone(id) {
  const sp = currentSprite()
  if (!sp) return
  const i = sp.bones.findIndex((b) => b.id === id)
  if (i < 0) return
  const parent = sp.bones[i].parent
  sp.bones.splice(i, 1)
  for (const b of sp.bones) if (b.parent === id) b.parent = parent
  if (SE.sel.boneId === id) SE.sel.boneId = ''
  saveProject()
}

export function addShape(shape) {
  const sp = currentSprite()
  if (!sp) return null
  const s = normalizeSprite({ shapes: [shape] }).shapes[0]
  sp.shapes.push(s)
  SE.sel.shapeId = s.id
  saveProject()
  return s
}

export function removeShape(id) {
  const sp = currentSprite()
  if (!sp) return
  const i = sp.shapes.findIndex((s) => s.id === id)
  if (i < 0) return
  sp.shapes.splice(i, 1)
  if (SE.sel.shapeId === id) SE.sel.shapeId = ''
  saveProject()
}

export function setSlot(kind, x, y) {
  const sp = currentSprite()
  if (!sp) return
  sp[kind] = { x, y, angle: sp[kind]?.angle ?? 0 }
  saveProject()
}

export function clearSlot(kind) {
  const sp = currentSprite()
  if (!sp) return
  sp[kind] = null
  saveProject()
}

// ============================================================================
// 特效
// ============================================================================

export function addEffect(sheetId, rect) {
  const sheet = SE.project.sheets.find((s) => s.id === sheetId) || SE.project.sheets[0]
  if (!sheet) return null
  const e = normalizeEffect({
    name: `特效 ${SE.project.effects.length + 1}`,
    sheetId: sheet.id,
    frames: [rect || {}],
  })
  SE.project.effects.push(e)
  SE.sel.effectId = e.id
  saveProject()
  return e
}

export function removeEffect(id) {
  const i = SE.project.effects.findIndex((e) => e.id === id)
  if (i < 0) return
  SE.project.effects.splice(i, 1)
  if (SE.sel.effectId === id) SE.sel.effectId = ''
  saveProject()
}

// ============================================================================
// 尺寸预设
// ============================================================================

export function addPreset(name, w, h) {
  const p = { id: uid('pre'), name: name || `${w}×${h}`, w: Number(w) || 32, h: Number(h) || 32, builtin: false }
  SE.project.presets.push(p)
  saveProject()
  return p
}

export function removePreset(id) {
  const i = SE.project.presets.findIndex((p) => p.id === id)
  if (i < 0) return
  if (SE.project.presets[i].builtin) return
  SE.project.presets.splice(i, 1)
  saveProject()
}

export function applyPresetToSprite(presetId) {
  const sp = currentSprite()
  const p = SE.project.presets.find((q) => q.id === presetId)
  if (!sp || !p) return
  sp.w = p.w
  sp.h = p.h
  saveProject()
}

// ============================================================================
// 导入 / 导出工程
// ============================================================================

export function exportProjectJson() {
  return JSON.stringify({
    version: SE.project.version,
    name: SE.project.name,
    status: SE.project.status,
    updatedAt: SE.project.updatedAt,
    publishedAt: SE.project.publishedAt,
    exportedAt: new Date().toISOString(),
    sheets: SE.project.sheets,
    sprites: SE.project.sprites,
    effects: SE.project.effects,
    presets: SE.project.presets,
  }, null, 2)
}

/** 工程 JSON → 规范化的工程对象（导入工程 / 恢复历史共用）。 */
function projectFromData(data) {
  const tmp = emptyProject()
  tmp.name = data.name || '导入工程'
  tmp.status = data.status || STATUS.PUBLISHED
  tmp.updatedAt = data.updatedAt || null
  tmp.publishedAt = data.publishedAt || null
  tmp.sheets = (data.sheets || []).map((s) => ({
    id: s.id || uid('sh'),
    name: s.name || '精灵图',
    src: s.src || '',
    width: s.width | 0,
    height: s.height | 0,
    naturalW: Number(s.naturalW) || s.width | 0,
    naturalH: Number(s.naturalH) || s.height | 0,
    scale: Number(s.scale) || 1,
    gridW: Number(s.gridW) || 32,
    gridH: Number(s.gridH) || 32,
  }))
  tmp.sprites = (data.sprites || []).map(normalizeSprite)
  tmp.effects = (data.effects || []).map(normalizeEffect)
  tmp.presets = (data.presets || []).map((q) => ({
    id: q.id || uid('pre'),
    name: q.name || '预设',
    w: Number(q.w) || 32,
    h: Number(q.h) || 32,
    builtin: !!q.builtin,
  }))
  return tmp
}

/**
 * 把一份工程装进编辑器（导入工程 / 恢复历史版本共用）。
 * @param {object} data    工程 JSON
 * @param {{save?:boolean, publish?:boolean}} opts
 */
export function applyProjectData(data, opts = {}) {
  if (!data || typeof data !== 'object') return null
  const tmp = projectFromData(data)
  SE.project = tmp
  clearSelection()
  SE.sel.sheetId = tmp.sheets[0]?.id || ''
  if (opts.publish) publish({ record: false })
  else if (opts.save !== false) saveProject()
  return tmp
}

export async function importProjectJson(file) {
  const text = await file.text()
  const data = JSON.parse(text)
  await recordHistory('导入前')
  return applyProjectData(data, { save: true })
}

// ============================================================================
// 历史编辑记录（查看 / 恢复）
// ============================================================================

/** 把当前工程存进历史。同一内容不会重复存（除非 force）。 */
export async function recordHistory(reason = '手动快照', opts = {}) {
  try {
    return await addHistory(SE.project, { reason, ...opts })
  } catch (e) {
    console.warn('[sprite-editor] 历史快照失败', e)
    return null
  }
}

/** 历史列表（meta，时间倒序）。 */
export function historyEntries() {
  return listHistory()
}

/** 取某条历史里的整份工程。 */
export function historyProject(id) {
  return getHistory(id)
}

/**
 * 恢复到某个历史版本。
 *   1. 先把「当前」存一份（原因「恢复前」），所以恢复本身也能反悔
 *   2. 装入历史版本
 *   3. 如果它原来是已发布状态 → 直接发布（走运行时覆盖通道，不再重复记快照）
 */
export async function restoreHistory(id) {
  const data = await getHistory(id)
  if (!data) return null
  await recordHistory('恢复前')
  const tmp = applyProjectData(data, { save: true, publish: false })
  if ((tmp?.status || STATUS.PUBLISHED) === STATUS.PUBLISHED) publish({ record: false })
  else saveProject()
  return tmp
}

export async function deleteHistory(id) {
  return removeHistory(id)
}

export async function wipeHistory() {
  return clearHistory()
}

// ============================================================================
// 草稿 / 发布
// ============================================================================

import { computed } from 'vue'

/** 当前状态 computed（面板顶部徽标用） */
export const projectStatus = computed(() => SE.project.status)

/** 发布精灵工程：标记 published + 通知游戏运行时（BOSS 动作覆盖层）。
 *  @param {{record?:boolean}} opts record=false 时不额外记历史（恢复历史后重发用） */
export function publish(opts = {}) {
  SE.project.status = STATUS.PUBLISHED
  SE.project.publishedAt = new Date().toISOString()
  try {
    window.dispatchEvent(
      new CustomEvent('rustfall:sprite-editor-published', {
        detail: {
          name: SE.project.name,
          sheets: SE.project.sheets.map((s) => ({ id: s.id, name: s.name, w: s.width, h: s.height })),
          sprites: SE.project.sprites.map((s) => ({ id: s.id, refId: s.refId, family: s.family, kind: s.kind })),
        },
      })
    )
  } catch (e) { /* 非浏览器环境忽略 */ }
  saveProject()
  // 发布是「重要断点」，不等防抖：立刻落盘 + 记历史
  void flushDiskProject()
  if (opts.record !== false) void recordHistory('发布')
  return true
}

/** 切到草稿模式：工程标记为 draft，后续发布可继续推送。 */
export function setDraft() {
  SE.project.status = STATUS.DRAFT
  saveProject()
  return true
}

/** 是否草稿模式 */
export function isDraft() {
  return SE.project.status === STATUS.DRAFT
}

export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// 调试钩子：便于在控制台 / 自动化测试里直接操作编辑器数据
if (typeof window !== 'undefined') {
  window.__spriteEditor = {
    SE,
    ROLE_LIST,
    MONSTER_LIST,
    BOSS_LIST,
    SPRITE_FAMILIES,
    FAMILY_SHAPE_TEMPLATES,
    addSheet,
    addSprite,
    addAction,
    addFrame,
    addBone,
    addShape,
    setSlot,
    addEffect,
    addPreset,
    autoLayout,
    // 增删改查（自动化脚本 / 单测要能删，不然只能用 splice 绕过 store）
    removeSheet,
    removeSprite,
    removeAction,
    removeFrame,
    removeBone,
    removeShape,
    removeEffect,
    moveAction,
    moveFrame,
    setSheetScale,
    setSheetSize,
    currentSheet,
    currentSprite,
    currentAction,
    currentFrame,
    saveProject,
    flushDiskProject,
    diskSaveState,
    restoreProjectFromDiskIfEmpty,
    migrateHistoryToDisk,
    loadProject,
    resetProject,
    exportProjectJson,
    boneTransforms,
    orderedBones,
    loadRegistry,
    filteredSprites,
    setSpriteRef,
    applyFamilyBones,
    applyFamilyShapes,
    bonesForFamily,
    shapesForFamily,
    // 骨骼 / 碰撞体：按帧框摆放 + 智能识别
    frameBoxOf,
    placeBonesForFamily,
    placeShapesForFamily,
    autoFitRig,
    guessFamilyFromRef,
    targetGroups,
    setTarget,
    clearTarget,
    targetDef,
    spritesOfTarget,
    createSpriteForTarget,
    importSheetForTarget,
    findEntityDef,
    isBossRef,
    publish,
    setDraft,
    isDraft,
    // 历史编辑记录
    recordHistory,
    historyEntries,
    historyProject,
    restoreHistory,
    deleteHistory,
    wipeHistory,
    applyProjectData,
    get projectStatus() { return projectStatus.value },
  }
}
