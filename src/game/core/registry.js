// 内容注册表：所有物品/机体/怪物/任务/对话/房间/道具/工具/mods 统一挂载在这里。
// 设计目标：核心内容与 mod 走同一条注册通道，mod 可在运行时增删。
import { Events, EV } from './events.js'

export const KIND = Object.freeze({
  ITEM: 'item',
  CHASSIS: 'chassis',
  MONSTER: 'monster',
  QUEST: 'quest',
  DIALOGUE: 'dialogue',
  COMPANION: 'companion',
  REGION: 'region',
  ROOM: 'room',
  PROP: 'prop',
  TOOL: 'tool',
  RECIPE: 'recipe',
  LORE: 'lore',
  BIOME: 'biome',
  LOOT_TABLE: 'lootTable',
  MOD: 'mod',
})

const VALID = new Set(Object.values(KIND))

class ContentRegistry {
  constructor() {
    this._kinds = new Map()
    this._sources = new Map() // source -> Set(kind:id)
    this._order = []
  }

  _bucket(kind) {
    let m = this._kinds.get(kind)
    if (!m) {
      m = new Map()
      this._kinds.set(kind, m)
    }
    return m
  }

  register(kind, id, def, source = 'core') {
    if (!VALID.has(kind)) throw new Error(`[content] unknown kind "${kind}"`)
    if (typeof id !== 'string' || !id) throw new Error(`[content] ${kind} needs a string id`)
    if (!def || typeof def !== 'object') throw new Error(`[content] ${kind}:${id} needs an object def`)
    const bucket = this._bucket(kind)
    const prev = bucket.get(id)
    if (prev && !def.override) {
      throw new Error(`[content] duplicate ${kind}:${id} (existing source: ${prev.__source}, new: ${source})`)
    }
    const entry = { ...def, id, __source: source, __kind: kind }
    bucket.set(id, entry)
    let set = this._sources.get(source)
    if (!set) {
      set = new Set()
      this._sources.set(source, set)
    }
    set.add(`${kind}:${id}`)
    Events.emit(EV.REGISTER, { kind, id, def: entry, source, replaced: !!prev })
    return entry
  }

  get(kind, id) {
    const e = this._kinds.get(kind)?.get(id)
    if (!e) return null
    return e
  }

  require(kind, id) {
    const e = this.get(kind, id)
    if (!e) throw new Error(`[content] missing ${kind}:${id}`)
    return e
  }

  has(kind, id) {
    return !!this._kinds.get(kind)?.has(id)
  }

  all(kind) {
    return [...(this._kinds.get(kind)?.values() || [])]
  }

  filter(kind, fn) {
    return this.all(kind).filter(fn)
  }

  count(kind) {
    return this._kinds.get(kind)?.size || 0
  }

  ids(kind) {
    return [...(this._kinds.get(kind)?.keys() || [])]
  }

  /** 移除某个来源注册的全部内容（mod 卸载/热重载用） */
  unregisterSource(source) {
    const set = this._sources.get(source)
    if (!set) return 0
    let n = 0
    for (const key of set) {
      const idx = key.indexOf(':')
      const kind = key.slice(0, idx)
      const id = key.slice(idx + 1)
      const bucket = this._kinds.get(kind)
      if (bucket && bucket.get(id)?.__source === source) {
        bucket.delete(id)
        n++
        Events.emit('content:unregister', { kind, id, source })
      }
    }
    this._sources.delete(source)
    return n
  }

  stats() {
    const out = {}
    for (const [kind, bucket] of this._kinds) out[kind] = bucket.size
    return out
  }

  clear() {
    this._kinds.clear()
    this._sources.clear()
    this._order.length = 0
  }
}

export const Content = new ContentRegistry()
export default Content
