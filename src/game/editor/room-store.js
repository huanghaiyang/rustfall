// ============================================================================
// 房间编辑器 · 状态仓库
// ----------------------------------------------------------------------------
// 与精灵编辑器（sprite-store.js）同构：Vue reactive 全局状态 + localStorage 持久化。
//
// 编辑对象 = 「一间房」的静态定义 + 程序化生成结果的覆写：
//   · 参数覆写  edits[key].params  —— label/w/h/seed/kind/variant/biome/monsterCount…
//   · 地形覆写  edits[key].tiles   —— { "x,y": tileType } 稀疏差分
//   · 道具增删  edits[key].props   —— { add: [...], remove: [...] }
//
// 生成采用「基础房 + 差分」两层：
//   baseGen(key)  —— 无覆写的原始生成结果（缓存）
//   RE.gen        —— 应用差分后的展示对象（缓存的 baseGen 上叠加 tiles / props）
// 撤销单格编辑时，直接从 baseGen 取原值写回即可。
//
// 持久化：
//   · rustfall.roomeditor.v1 —— 编辑器工程（参数 / 地形 / 道具）
//   · rustfall.terrain.v1    —— 与游戏运行时共用（game.js 读它把地形差分写回 gen.map）
//
// 房间列表直接来自 regions.js 的 worldRooms()（190 间房，世界线顺序）。
// ============================================================================

import { reactive, computed, markRaw } from 'vue'
import { worldRooms, getRoomSpec } from '../world/regions.js'
import { generateBiomeRoom } from '../world/biomes/index.js'
import { T, Tilemap } from '../world/tilemap.js'
import { TS } from '../config.js'
import { PROP_ART_KINDS } from '../render/art/props.js'

const KEY = 'rustfall.roomeditor.v1'
const TERRAIN_KEY = 'rustfall.terrain.v1'
const BG_KEY = 'rustfall.bgedits.v1'

/** 房间唯一键：与 game.js 的 terrainEdits 键格式保持一致 */
export const roomKey = (regionId, roomId) => `${regionId}:${roomId}`

/** 8 种 tile 的可编辑元数据 */
export const TILE_TYPES = [
  { id: T.EMPTY, name: '空气', en: 'AIR', color: '#1a1f24' },
  { id: T.SOLID, name: '实心', en: 'SOLID', color: '#4a4438' },
  { id: T.PLATFORM, name: '平台', en: 'PLATFORM', color: '#8a7a5a' },
  { id: T.WATER, name: '水', en: 'WATER', color: '#2f5f7f' },
  { id: T.POLE, name: '攀爬杆', en: 'POLE', color: '#a8763a' },
  { id: T.CRACKED, name: '裂墙', en: 'CRACKED', color: '#7a6a5a' },
  { id: T.SOIL, name: '松土', en: 'SOIL', color: '#6a543a' },
  { id: T.TOXIC, name: '酸液', en: 'TOXIC', color: '#6ac040' },
]

export const TILE_BY_ID = Object.fromEntries(TILE_TYPES.map((t) => [t.id, t]))

/** 房间 kind */
export const ROOM_KINDS = ['standard', 'shelter', 'arena', 'gate']
/** 可选 biome */
export const BIOME_LIST = ['city', 'village', 'factory', 'dump', 'metro', 'hospital', 'port']

// ============================================================================
// 缓存（放在 reactive 之外，避免 Vue 代理 Map）
// ============================================================================
/** key -> 基础生成结果（无覆写） */
const BASE_CACHE = new Map()
/** key -> 展示用生成结果（已叠加覆写） */
const GEN_CACHE = new Map()
/** key -> 基础 spec 快照（用于参数覆写去重） */
const BASE_PARAMS = new Map()

// ============================================================================
// 全局状态
// ============================================================================

// 是否把编辑推送到游戏运行时通道（terrain / bg / CustomEvent）。
// 草稿模式：编辑器里编辑只改 RE.project，不动运行时；publish() 时一次性推送。
let _runtimePushesEnabled = true

/** 工程状态：published=已发布 / draft=草稿 / mixed=部分发布 */
const STATUS = { PUBLISHED: 'published', DRAFT: 'draft', MIXED: 'mixed' }

export const RE = reactive({
  /** 编辑器工程 */
  project: {
    version: 2,
    name: '房间工程',
    status: STATUS.PUBLISHED,     // 旧工程加载时按 published 处理（向后兼容）
    updatedAt: null,               // 最近编辑时间（ISO）
    publishedAt: null,             // 最近发布时间（ISO）
    edits: {}, // roomKey -> { params: {}, tiles: {}, props: { add: [], remove: [] }, bg: { layers: [] } }
  },
  sel: {
    regionId: '',
    roomId: '',
    tile: T.SOLID,
    tool: 'inspect', // inspect | tile | prop | bg
    propKind: '',
    bgLayerId: '',
  },
  view: {
    zoom: 4,
    panX: 0,
    panY: 0,
    grid: true,
    props: true,
    entities: true,
    labels: true,
    bg: true,
  },
  /** 当前房间的展示数据（含覆写） */
  gen: null,
  /** 生成耗时提示 */
  genMs: 0,
})

// ============================================================================
// 房间列表
// ============================================================================

/** 全部房间（世界线顺序） */
export const ALL_ROOMS = worldRooms()

/** 按区域分组的房间 */
export const ROOM_GROUPS = (() => {
  const groups = []
  const byId = new Map()
  for (const r of ALL_ROOMS) {
    let g = byId.get(r.regionId)
    if (!g) {
      g = { id: r.regionId, name: r.spec.regionName || r.regionId, rooms: [] }
      byId.set(r.regionId, g)
      groups.push(g)
    }
    g.rooms.push(r)
  }
  return groups
})()

export const currentRoomMeta = computed(
  () => ALL_ROOMS.find((r) => r.regionId === RE.sel.regionId && r.roomId === RE.sel.roomId) || null
)

export const currentKey = computed(() => (RE.sel.roomId ? roomKey(RE.sel.regionId, RE.sel.roomId) : ''))

// ============================================================================
// 编辑存取
// ============================================================================

/** 取某房间的编辑块（不存在则创建） */
export function editsOf(key) {
  if (!key) return null
  if (!RE.project.edits[key]) {
    RE.project.edits[key] = { params: {}, tiles: {}, props: { add: [], remove: [] }, bg: { layers: [] } }
  }
  const e = RE.project.edits[key]
  if (!e.params) e.params = {}
  if (!e.tiles) e.tiles = {}
  if (!e.props) e.props = { add: [], remove: [] }
  if (!e.props.add) e.props.add = []
  if (!e.props.remove) e.props.remove = []
  if (!e.bg) e.bg = { layers: [] }
  if (!e.bg.layers) e.bg.layers = []
  return e
}

/** 只读取（不创建） */
export function peekEdits(key) {
  return RE.project.edits[key] || null
}

/** 基础 spec 快照（参数覆写去重用） */
function baseParamsOf(key) {
  let p = BASE_PARAMS.get(key)
  if (!p) {
    const hit = ALL_ROOMS.find((r) => roomKey(r.regionId, r.roomId) === key)
    if (!hit) return null
    p = { ...hit.spec }
    BASE_PARAMS.set(key, p)
  }
  return p
}

/** 当前房间的有效 spec = 基础 spec + 参数覆写 */
export function effectiveSpec(regionId, roomId) {
  const base = getRoomSpec(regionId, roomId)
  if (!base) return null
  const e = peekEdits(roomKey(regionId, roomId))
  if (!e || !Object.keys(e.params).length) return { ...base }
  return { ...base, ...e.params }
}

/** 设置参数覆写（值等于基础值则删掉覆写，保持工程干净） */
export function setRoomParam(key, name, value) {
  if (!key) return
  const base = baseParamsOf(key)
  const e = editsOf(key)
  if (base && base[name] === value) delete e.params[name]
  else e.params[name] = value
  const hit = ALL_ROOMS.find((r) => roomKey(r.regionId, r.roomId) === key)
  if (hit) invalidate(hit.regionId, hit.roomId)
}

// ============================================================================
// 生成（基础层 + 差分层）
// ============================================================================

/** 克隆一份 tilemap：展示层与基础层互不干扰，撤销时能取回原值 */
function cloneMap(map) {
  const m = new Tilemap(map.w, map.h, T.EMPTY)
  m.data.set(map.data)
  m.health.set(map.health)
  return markRaw(m)
}

/** 基础生成结果（无覆写），带缓存 */
function baseGen(regionId, roomId) {
  const key = roomKey(regionId, roomId)
  if (BASE_CACHE.has(key)) return BASE_CACHE.get(key)
  const spec = effectiveSpec(regionId, roomId)
  if (!spec) return null
  const gen = generateBiomeRoom({ ...spec, id: roomId, regionId })
  BASE_CACHE.set(key, gen)
  return gen
}

/** 展示用生成结果（叠加覆写），带缓存 */
export function generateRoom(regionId, roomId, { force = false } = {}) {
  const key = roomKey(regionId, roomId)
  if (!force && GEN_CACHE.has(key)) return GEN_CACHE.get(key)
  const base = baseGen(regionId, roomId)
  if (!base) return null
  const e = peekEdits(key)

  const gen = {
    ...base,
    map: cloneMap(base.map),
    props: base.props.slice(),
  }
  // 应用地形差分
  if (e && e.tiles) {
    for (const [tile, type] of Object.entries(e.tiles)) {
      const [tx, ty] = tile.split(',').map(Number)
      gen.map.set(tx, ty, type)
    }
  }
  // 应用道具增删
  if (e && e.props) {
    if (e.props.remove?.length) {
      gen.props = gen.props.filter(
        (p) => !e.props.remove.some((r) => r.kind === p.kind && r.x === p.x && r.y === p.y)
      )
    }
    if (e.props.add?.length) {
      gen.props = gen.props.concat(e.props.add.map((p) => ({ ...p })))
    }
  }
  GEN_CACHE.set(key, gen)
  return gen
}

/** 丢弃某房间的缓存（改了参数后调用） */
export function invalidate(regionId, roomId) {
  const key = roomKey(regionId, roomId)
  GEN_CACHE.delete(key)
  BASE_CACHE.delete(key)
}

/** 重新生成当前房间（丢弃差分缓存，基础结果保留） */
export function regenerate() {
  const { regionId, roomId } = RE.sel
  if (!roomId) return null
  invalidate(regionId, roomId)
  RE.gen = generateRoom(regionId, roomId, { force: true })
  return RE.gen
}

/** 选中房间并生成 */
export function selectRoom(regionId, roomId) {
  const t0 = performance.now()
  RE.sel.regionId = regionId
  RE.sel.roomId = roomId
  RE.sel.bgLayerId = ''
  const key = roomKey(regionId, roomId)
  baseParamsOf(key)
  RE.gen = generateRoom(regionId, roomId, { force: true })
  RE.genMs = Math.round(performance.now() - t0)
  resetView()
  return RE.gen
}

// ============================================================================
// 地形编辑
// ============================================================================

/** 写一个 tile（进差分表） */
export function setTile(x, y, type) {
  const key = currentKey.value
  const gen = RE.gen
  if (!key || !gen || !gen.map.inBounds(x, y)) return
  if (gen.map.get(x, y) === type) return
  const e = editsOf(key)
  e.tiles[`${x},${y}`] = type
  gen.map.set(x, y, type)
  // 同步进游戏的 terrainEdits 表（key 格式一致 → 游戏运行时自动生效）
  pushTerrain(key, `${x},${y}`, type)
}

/** 撤销一个 tile 编辑（恢复基础生成值） */
export function eraseTile(x, y) {
  const key = currentKey.value
  const gen = RE.gen
  if (!key || !gen || !gen.map.inBounds(x, y)) return
  const e = editsOf(key)
  delete e.tiles[`${x},${y}`]
  const base = baseGen(RE.sel.regionId, RE.sel.roomId)
  const orig = base ? base.map.get(x, y) : T.EMPTY
  gen.map.set(x, y, orig)
  // 地形差分里留一条「恢复原值」的记录（游戏侧需要显式写回）
  pushTerrain(key, `${x},${y}`, orig)
}

/** 矩形填充 */
export function fillTiles(x0, y0, x1, y1, type) {
  const a = Math.min(x0, x1)
  const b = Math.max(x0, x1)
  const c = Math.min(y0, y1)
  const d = Math.max(y0, y1)
  for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) setTile(x, y, type)
}

/** 读 terrainEdits 表 */
function readTerrainTable() {
  try {
    return JSON.parse(localStorage.getItem(TERRAIN_KEY) || '{}')
  } catch (e) {
    return {}
  }
}

/** 写一条地形差分到游戏的 terrainEdits 表；草稿模式下跳过 */
function pushTerrain(key, tile, type) {
  if (!_runtimePushesEnabled) return
  const table = readTerrainTable()
  if (!table[key]) table[key] = {}
  table[key][tile] = type
  try {
    localStorage.setItem(TERRAIN_KEY, JSON.stringify(table))
  } catch (e) {
    /* 存储满 / 隐私模式，忽略 */
  }
  // 通知正在运行的游戏：立刻把这一格改掉（否则存档时会被游戏内存里的旧表覆盖）
  notifyTerrainPatch(key, { [tile]: type })
}

/** 通知正在运行的游戏（地形差分变更） */
function notifyTerrainPatch(key, tiles, clear = false) {
  try {
    window.dispatchEvent(
      new CustomEvent('rustfall:terrain-patch', { detail: { key, tiles, clear } })
    )
  } catch (e) {
    /* 非浏览器环境，忽略 */
  }
}

/** 当前房间的地形差分条数 */
export const tileEditCount = computed(() => {
  const e = peekEdits(currentKey.value)
  return e ? Object.keys(e.tiles).length : 0
})

// ============================================================================
// 道具编辑
// ============================================================================

/** 可用道具 kind 列表（来自美术注册表） */
export const PROP_KINDS = PROP_ART_KINDS.slice()

/** 道具坐标：世界坐标 → tile 坐标 */
export function propTilePos(p) {
  return { x: Math.floor(p.x / TS), y: Math.floor(p.y / TS) }
}

/** 放置一个道具 */
export function addProp(kind, tx, ty) {
  const key = currentKey.value
  const gen = RE.gen
  if (!key || !gen) return
  const e = editsOf(key)
  const p = { kind, x: tx * TS + TS / 2, y: ty * TS }
  const dup = gen.props.some((q) => q.kind === kind && q.x === p.x && q.y === p.y)
  if (dup) return
  e.props.add.push(p)
  gen.props = gen.props.concat([{ ...p }])
}

/** 移除一个道具（基础生成的记入 remove 表；编辑器新加的从 add 表移除） */
export function removeProp(p) {
  const key = currentKey.value
  const gen = RE.gen
  if (!key || !gen) return
  const e = editsOf(key)
  const inAdded = e.props.add.findIndex((q) => q.kind === p.kind && q.x === p.x && q.y === p.y)
  if (inAdded >= 0) e.props.add.splice(inAdded, 1)
  else e.props.remove.push({ kind: p.kind, x: p.x, y: p.y })
  gen.props = gen.props.filter((q) => !(q.kind === p.kind && q.x === p.x && q.y === p.y))
}

/** 当前房间道具数 */
export const propCount = computed(() => RE.gen?.props?.length || 0)

// ============================================================================
// 背景分层编辑
// ----------------------------------------------------------------------------
// 每间房的自定义背景层存在 edits[key].bg.layers，运行时由 room.js 读
// rustfall.bgedits.v1 叠加在 biome 默认背景之上。
// 层结构：{ id, name, parallax(0~1, 越小越远), opacity, tint, yOff(世界px),
//           img: { src(dataURL), w, h, x, y(tile 单位), scale } | null }
// ============================================================================

let _bgId = 0
const newBgId = () => `bg${Date.now().toString(36)}_${++_bgId}`

/** 当前房间的背景层列表（引用工程数据，直接改即生效） */
export const bgLayers = computed(() => {
  const e = peekEdits(currentKey.value)
  return e?.bg?.layers || []
})

/** 当前选中的背景层 */
export const currentBgLayer = computed(() => {
  return bgLayers.value.find((l) => l.id === RE.sel.bgLayerId) || null
})

/** 读 / 写运行时背景差分表 */
function readBgTable() {
  try {
    return JSON.parse(localStorage.getItem(BG_KEY) || '{}')
  } catch (e) {
    return {}
  }
}

/** 把某房间当前全部背景层同步到运行时表（层为空则清掉该房间条目）；草稿模式下跳过 */
function pushBgTable(key) {
  if (!_runtimePushesEnabled) return
  const e = peekEdits(key)
  const table = readBgTable()
  const layers = e?.bg?.layers || []
  if (layers.length) table[key] = { layers: JSON.parse(JSON.stringify(layers)) }
  else delete table[key]
  try {
    localStorage.setItem(BG_KEY, JSON.stringify(table))
  } catch (err) {
    /* 图太大写不进 localStorage 时忽略，工程 JSON 里仍有 */
  }
}

/** 新增一层（默认叠在 biome 背景之上：视差取 0.6、全不透明） */
export function addBgLayer(name = '') {
  const key = currentKey.value
  if (!key) return null
  const e = editsOf(key)
  const layer = {
    id: newBgId(),
    name: name || `图层 ${e.bg.layers.length + 1}`,
    parallax: 0.6,
    opacity: 1,
    tint: '#ffffff',
    yOff: 0,
    img: null,
  }
  e.bg.layers.push(layer)
  RE.sel.bgLayerId = layer.id
  pushBgTable(key)
  return layer
}

/** 删除一层 */
export function removeBgLayer(id) {
  const key = currentKey.value
  if (!key) return
  const e = editsOf(key)
  const i = e.bg.layers.findIndex((l) => l.id === id)
  if (i < 0) return
  e.bg.layers.splice(i, 1)
  if (RE.sel.bgLayerId === id) RE.sel.bgLayerId = ''
  pushBgTable(key)
}

/** 调整层顺序（dir = -1 上移 / +1 下移；数组尾部最后绘制 = 最前） */
export function moveBgLayer(id, dir) {
  const key = currentKey.value
  if (!key) return
  const e = editsOf(key)
  const i = e.bg.layers.findIndex((l) => l.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= e.bg.layers.length) return
  const [l] = e.bg.layers.splice(i, 1)
  e.bg.layers.splice(j, 0, l)
  pushBgTable(key)
}

/** 改层的标量参数（name/parallax/opacity/tint/yOff） */
export function setBgLayerParam(id, name, value) {
  const key = currentKey.value
  const layer = bgLayers.value.find((l) => l.id === id)
  if (!key || !layer) return
  layer[name] = value
  pushBgTable(key)
}

/** 图像几何：x/y 是 tile 单位（图像中心），scale 是相对原图像素的倍率 */
export function setBgImage(id, patch) {
  const key = currentKey.value
  const layer = bgLayers.value.find((l) => l.id === id)
  if (!key || !layer || !layer.img) return
  Object.assign(layer.img, patch)
  pushBgTable(key)
}

/** 从 File 读入一张图挂到层上（dataURL 存工程） */
export function setBgLayerImageFile(id, file) {
  return new Promise((resolve, reject) => {
    const key = currentKey.value
    const layer = bgLayers.value.find((l) => l.id === id)
    if (!key || !layer) return reject(new Error('未选中图层'))
    const rd = new FileReader()
    rd.onload = () => {
      const src = String(rd.result || '')
      const im = new Image()
      im.onload = () => {
        layer.img = {
          src,
          w: im.naturalWidth,
          h: im.naturalHeight,
          x: Math.floor((RE.gen?.w || 100) / 2),
          y: Math.floor((RE.gen?.h || 50) / 2),
          scale: 1,
        }
        pushBgTable(key)
        resolve(layer.img)
      }
      im.onerror = () => reject(new Error('图像解码失败'))
      im.src = src
    }
    rd.onerror = () => reject(new Error('文件读取失败'))
    rd.readAsDataURL(file)
  })
}

/** 移除层上的图像（保留层） */
export function clearBgImage(id) {
  const key = currentKey.value
  const layer = bgLayers.value.find((l) => l.id === id)
  if (!key || !layer) return
  layer.img = null
  pushBgTable(key)
}

/** 当前房间背景层数 */
export const bgLayerCount = computed(() => bgLayers.value.length)

/** 把工程里全部房间的背景层回灌运行时表（读档 / 导入工程后调用） */
function syncAllBgTables() {
  const table = {}
  for (const [k, e] of Object.entries(RE.project.edits || {})) {
    if (e?.bg?.layers?.length) table[k] = { layers: JSON.parse(JSON.stringify(e.bg.layers)) }
  }
  try {
    localStorage.setItem(BG_KEY, JSON.stringify(table))
  } catch (err) {
    /* 图太大写不进时忽略，工程 JSON 里仍有 */
  }
}

// ============================================================================
// 视图
// ============================================================================

export function resetView() {
  RE.view.zoom = 4
  RE.view.panX = 0
  RE.view.panY = 0
}

// ============================================================================
// 持久化
// ============================================================================

export function saveProject() {
  try {
    RE.project.updatedAt = new Date().toISOString()
    localStorage.setItem(KEY, JSON.stringify(RE.project))
    return true
  } catch (e) {
    console.warn('[room-editor] 保存失败', e)
    return false
  }
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return false
    RE.project.edits = data.edits || {}
    RE.project.name = data.name || '房间工程'
    // 向后兼容：旧工程没有 status 字段，默认为 published（旧版实时生效）
    RE.project.status = data.status || STATUS.PUBLISHED
    RE.project.updatedAt = data.updatedAt || null
    RE.project.publishedAt = data.publishedAt || null
    // 草稿模式：关闭运行时推送，让现有运行时表保持"最后一次发布"状态
    _runtimePushesEnabled = RE.project.status !== STATUS.DRAFT
    syncAllBgTables()
    return true
  } catch (e) {
    console.warn('[room-editor] 读取失败', e)
    return false
  }
}

export function resetProject() {
  RE.project.edits = {}
  RE.project.status = STATUS.PUBLISHED
  RE.project.updatedAt = null
  RE.project.publishedAt = null
  _runtimePushesEnabled = true
  GEN_CACHE.clear()
  BASE_CACHE.clear()
  RE.gen = null
  try {
    localStorage.removeItem(KEY)
  } catch (e) {
    /* ignore */
  }
}

/** 导出工程 JSON */
export function exportProjectJson() {
  return JSON.stringify(
    {
      version: RE.project.version,
      name: RE.project.name,
      status: RE.project.status,
      updatedAt: RE.project.updatedAt,
      publishedAt: RE.project.publishedAt,
      exportedAt: new Date().toISOString(),
      edits: RE.project.edits,
    },
    null,
    2
  )
}

/** 导入工程 JSON（接受 File 或 JSON 字符串） */
export async function importProjectJson(fileOrText) {
  const text = typeof fileOrText === 'string' ? fileOrText : await fileOrText.text()
  const data = JSON.parse(text)
  if (!data || typeof data !== 'object') throw new Error('工程格式错误')
  RE.project.edits = data.edits || {}
  RE.project.name = data.name || '房间工程'
  RE.project.status = data.status || STATUS.PUBLISHED
  RE.project.updatedAt = data.updatedAt || null
  RE.project.publishedAt = data.publishedAt || null
  _runtimePushesEnabled = RE.project.status !== STATUS.DRAFT
  GEN_CACHE.clear()
  BASE_CACHE.clear()
  RE.gen = null
  saveProject()
  syncAllBgTables()
  return true
}

/** 下载文本文件 */
export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 清空某房间的全部编辑（含游戏的 terrainEdits / bgedits 记录） */
export function clearRoomEdits(regionId, roomId) {
  const key = roomKey(regionId, roomId)
  delete RE.project.edits[key]
  invalidate(regionId, roomId)
  const table = readTerrainTable()
  if (table[key]) {
    delete table[key]
    try {
      localStorage.setItem(TERRAIN_KEY, JSON.stringify(table))
    } catch (e) {
      /* ignore */
    }
  }
  const bgTable = readBgTable()
  if (bgTable[key]) {
    delete bgTable[key]
    try {
      localStorage.setItem(BG_KEY, JSON.stringify(bgTable))
    } catch (e) {
      /* ignore */
    }
  }
  if (RE.sel.bgLayerId) RE.sel.bgLayerId = ''
  notifyTerrainPatch(key, {}, true)
  RE.gen = generateRoom(regionId, roomId, { force: true })
}

/** 全工程清空（含游戏的 terrainEdits / bgedits） */
export function clearAllEdits() {
  RE.project.edits = {}
  GEN_CACHE.clear()
  BASE_CACHE.clear()
  const table = readTerrainTable()
  try {
    localStorage.removeItem(TERRAIN_KEY)
  } catch (e) {
    /* ignore */
  }
  try {
    localStorage.removeItem(BG_KEY)
  } catch (e) {
    /* ignore */
  }
  RE.sel.bgLayerId = ''
  for (const k of Object.keys(table)) notifyTerrainPatch(k, {}, true)
  if (RE.sel.roomId) RE.gen = generateRoom(RE.sel.regionId, RE.sel.roomId, { force: true })
}

// ============================================================================
// 草稿 / 发布
// ============================================================================

/** 当前状态 computed（面板顶部徽标用） */
export const projectStatus = computed(() => RE.project.status)

/** 把当前工程版本一次性推送到游戏运行时通道（地形 / 背景层）。
 *  推送完成后状态切 published，后续编辑实时生效。 */
export function publish() {
  _runtimePushesEnabled = true
  // 1. 全量推送地形差分 + 背景层
  const terrainTable = readTerrainTable()
  for (const key of Object.keys(RE.project.edits)) {
    const e = RE.project.edits[key]
    if (!e) continue
    // 地形差分（整房间覆盖，用 clear=true 让游戏清旧表）
    const tiles = e.tiles || {}
    if (Object.keys(tiles).length) terrainTable[key] = { ...tiles }
    else delete terrainTable[key]
    // 背景层
    pushBgTable(key)
    // 通知正在运行的游戏
    notifyTerrainPatch(key, { ...tiles }, true)
  }
  try {
    localStorage.setItem(TERRAIN_KEY, JSON.stringify(terrainTable))
  } catch (e) { /* 忽略 */ }
  // 2. 状态切换
  RE.project.status = STATUS.PUBLISHED
  RE.project.publishedAt = new Date().toISOString()
  saveProject()
  return true
}

/** 切到草稿模式：后续编辑只改工程文件，不推运行时通道。
 *  运行时表保持「上一次发布」的版本不变。 */
export function setDraft() {
  RE.project.status = STATUS.DRAFT
  _runtimePushesEnabled = false
  saveProject()
  return true
}

/** 是否草稿模式（store 内部推送函数和 UI 都可直接查） */
export function isDraft() {
  return RE.project.status === STATUS.DRAFT
}

// ============================================================================
// 调试钩子
// ============================================================================

if (typeof window !== 'undefined') {
  window.__roomEditor = {
    RE,
    ALL_ROOMS,
    ROOM_GROUPS,
    TILE_TYPES,
    TILE_BY_ID,
    PROP_KINDS,
    ROOM_KINDS,
    BIOME_LIST,
    roomKey,
    selectRoom,
    generateRoom,
    regenerate,
    effectiveSpec,
    setRoomParam,
    setTile,
    eraseTile,
    fillTiles,
    addProp,
    removeProp,
    propTilePos,
    saveProject,
    loadProject,
    resetProject,
    exportProjectJson,
    importProjectJson,
    clearRoomEdits,
    clearAllEdits,
    resetView,
    addBgLayer,
    removeBgLayer,
    moveBgLayer,
    setBgLayerParam,
    setBgImage,
    setBgLayerImageFile,
    clearBgImage,
    get bgLayerCount() {
      return bgLayerCount.value
    },
    get currentBgLayer() {
      return currentBgLayer.value
    },
    // 用 getter 暴露「当前值」：直接读 computed 的 _value 会拿到缓存的旧值
    get tileEditCount() {
      return tileEditCount.value
    },
    get propCount() {
      return propCount.value
    },
    publish,
    setDraft,
    isDraft,
    get projectStatus() {
      return projectStatus.value
    },
  }
}
