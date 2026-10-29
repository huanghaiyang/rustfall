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

export function saveProject() {
  try {
    SE.project.updatedAt = new Date().toISOString()
    localStorage.setItem(KEY, JSON.stringify(SE.project))
    return true
  } catch (e) {
    console.warn('[sprite-editor] 保存失败', e)
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
      x: Number(b.x) || 0,
      y: Number(b.y) || 0,
      len: Number(b.len) || 12,
      angle: Number(b.angle) || 0,
      parent: b.parent || null,
    })),
    shapes: (s.shapes || []).map((q) => ({
      id: q.id || uid('shp'),
      name: q.name || '碰撞',
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
    bones: opts.autoBones ? bonesForFamily(familyFinal) : [],
    shapes: opts.autoShapes ? shapesForFamily(familyFinal) : [],
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
  const tpl = bonesForFamily(familyId)
  if (!tpl || !tpl.length) return 0
  if (replace) { sp.bones = [] }
  // 模板里父级是字符串名，这里按模板顺序解析
  const newIds = new Map() // 模板内名 → 新 id
  const pending = []
  for (const def of tpl) {
    const id = uid('bn')
    newIds.set(def.name, id)
    pending.push({ def, id })
  }
  for (const { def, id } of pending) {
    sp.bones.push({
      id,
      name: def.name,
      x: (Number(def.x) || 0) * scale,
      y: (Number(def.y) || 0) * scale,
      len: (Number(def.len) || 0) * scale,
      angle: Number(def.angle) || 0,
      parent: def.parent ? newIds.get(def.parent) || null : null,
    })
  }
  if (replace) SE.sel.boneId = sp.bones[0]?.id || ''
  sp.family = familyId
  saveProject()
  return tpl.length
}

/** 套用某族系的碰撞模板（追加） */
export function applyFamilyShapes(sprite, familyId, { replace = true, scale = 1 } = {}) {
  const sp = sprite || currentSprite()
  if (!sp) return 0
  const tpl = shapesForFamily(familyId)
  if (!tpl || !tpl.length) return 0
  if (replace) { sp.shapes = [] }
  for (const def of tpl) {
    const s = {
      id: uid('shp'),
      name: def.name,
      type: def.type,
      x: (Number(def.x) || 0) * scale,
      y: (Number(def.y) || 0) * scale,
      w: (Number(def.w) || 0) * scale,
      h: (Number(def.h) || 0) * scale,
      r: (Number(def.r) || 0) * scale,
      angle: Number(def.angle) || 0,
      points: Array.isArray(def.points) ? def.points.map((p) => ({ x: Number(p.x) * scale, y: Number(p.y) * scale })) : [],
    }
    sp.shapes.push(s)
  }
  saveProject()
  return tpl.length
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

export async function importProjectJson(file) {
  const text = await file.text()
  const data = JSON.parse(text)
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
  SE.project = tmp
  clearSelection()
  SE.sel.sheetId = tmp.sheets[0]?.id || ''
  saveProject()
  return tmp
}

// ============================================================================
// 草稿 / 发布
// ============================================================================

import { computed } from 'vue'

/** 当前状态 computed（面板顶部徽标用） */
export const projectStatus = computed(() => SE.project.status)

/** 发布精灵工程：标记 published 并通知未来的游戏加载器。
 *  目前游戏尚未从精灵编辑器工程直接加载，发布 = 打标签 + 发 CustomEvent。
 *  后续游戏侧实现 sprite 加载时，只需监听 rustfall:sprite-editor-published 即可。 */
export function publish() {
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
    saveProject,
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
    get projectStatus() { return projectStatus.value },
  }
}
