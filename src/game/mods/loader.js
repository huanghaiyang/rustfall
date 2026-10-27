import * as THREE from 'three'
import { Content, KIND } from '../core/registry.js'
import { Events, EV } from '../core/events.js'
import { BaseMonster } from '../entities/monsters/base.js'
import { PAL } from '../render/palette.js'
import { getItemArt } from '../render/art/items.js'

const JSON_KINDS = {
  item: KIND.ITEM,
  items: KIND.ITEM,
  chassis: KIND.CHASSIS,
  monster: KIND.MONSTER,
  monsters: KIND.MONSTER,
  quest: KIND.QUEST,
  quests: KIND.QUEST,
  dialogue: KIND.DIALOGUE,
  dialogues: KIND.DIALOGUE,
  companion: KIND.COMPANION,
  companions: KIND.COMPANION,
  prop: KIND.PROP,
  props: KIND.PROP,
  lootTable: KIND.LOOT_TABLE,
  lootTables: KIND.LOOT_TABLE,
  tool: KIND.TOOL,
  recipe: KIND.RECIPE,
  region: KIND.REGION,
}

const MODS_INDEX = '/mods/index.json'

/**
 * Mod 加载器：
 *  - public/mods/index.json 列出 mod 目录
 *  - 每个目录有 manifest.json（id/name/version/author/description/content/main）
 *  - content 里的 JSON 按类型批量注册为数据内容
 *  - main（.js）通过动态 import 执行，拿到统一 api（可注册怪物子类、监听事件、画 UI 贴图等）
 * 所有 mod 内容 source = "mod:<id>"，可整体卸载。
 */
export class ModLoader {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/mods'
    this.mods = []
    this.loaded = []
    this.errors = []
    this.api = this.createApi()
    this.enabled = options.enabled || null // Set<string> | null
  }

  createApi() {
    const loader = this
    const reg = (kind) => (def, source = 'mod') => {
      if (!def || !def.id) throw new Error(`[mod] ${kind} 需要 id`)
      return Content.register(kind, def.id, def, source)
    }
    const api = {
      THREE,
      Content,
      KIND,
      Events,
      EV,
      BaseMonster,
      palette: PAL,
      getItemArt,
      version: '1.0',
      /** 当前 mod 的 source 会在 loadMod 期间指向 mod:<id> */
      _source: 'mod',
      registerItem: (def) => reg(KIND.ITEM)(def, api._source),
      registerChassis: (def) => reg(KIND.CHASSIS)(def, api._source),
      registerMonster: (def) => reg(KIND.MONSTER)(def, api._source),
      registerQuest: (def) => reg(KIND.QUEST)(def, api._source),
      registerDialogue: (def) => reg(KIND.DIALOGUE)(def, api._source),
      registerCompanion: (def) => reg(KIND.COMPANION)(def, api._source),
      registerProp: (def) => reg(KIND.PROP)(def, api._source),
      registerLootTable: (def) => reg(KIND.LOOT_TABLE)(def, api._source),
      registerTool: (def) => reg(KIND.TOOL)(def, api._source),
      registerRecipe: (def) => reg(KIND.RECIPE)(def, api._source),
      /** 注册一个可用可运行逻辑的怪物类（继承 api.BaseMonster） */
      registerMonsterClass: (id, Cls, def) => {
        if (def) reg(KIND.MONSTER)({ ...def, id, __class: Cls }, api._source)
        else reg(KIND.MONSTER)({ id, __class: Cls, name: id, en: id.toUpperCase(), family: 'rogue', hp: 40, speed: 60, damage: 10, size: [40, 32], aggro: 300, attackRange: 60, loot: [], biome: ['city'] }, api._source)
        loader.classes.set(id, Cls)
        return Cls
      },
      on: (type, fn) => Events.on(type, fn),
      log: (...args) => console.log('[mod]', ...args),
      warn: (...args) => console.warn('[mod]', ...args),
    }
    return api
  }

  classes = new Map()

  async discover() {
    try {
      const res = await fetch(`${this.baseUrl}/index.json`, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`index ${res.status}`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : data.mods || []
      const out = []
      for (const entry of list) {
        const dir = typeof entry === 'string' ? entry : entry.dir
        if (!dir) continue
        try {
          const mres = await fetch(`${this.baseUrl}/${dir}/manifest.json`, { cache: 'no-cache' })
          if (!mres.ok) throw new Error(`manifest ${mres.status}`)
          const manifest = await mres.json()
          out.push({ ...manifest, dir, url: `${this.baseUrl}/${dir}`, enabled: true })
        } catch (err) {
          this.errors.push({ mod: dir, error: String(err) })
        }
      }
      this.mods = out
      return out
    } catch (err) {
      // 没有 mod 目录/离线是正常情况
      this.errors.push({ mod: '*', error: String(err) })
      this.mods = []
      return []
    }
  }

  isEnabled(mod, enabledSet) {
    if (!enabledSet) return true
    return enabledSet.has(mod.id)
  }

  async loadAll(enabledSet = this.enabled) {
    if (!this.mods.length) await this.discover()
    const results = []
    for (const mod of this.mods) {
      if (!this.isEnabled(mod, enabledSet)) continue
      results.push(await this.loadMod(mod))
    }
    this.loaded = results.filter((r) => r.ok)
    Events.emit(EV.MOD_LOADED, { loaded: this.loaded, errors: this.errors })
    return results
  }

  async loadMod(mod) {
    const source = `mod:${mod.id}`
    this.api._source = source
    const result = { id: mod.id, name: mod.name || mod.id, version: mod.version || '0.0.0', ok: true, items: 0, errors: [] }
    try {
      // 数据内容
      for (const rel of mod.content || []) {
        const url = `${mod.url}/${rel}`
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`${rel}: ${res.status}`)
        const json = await res.json()
        this.registerJson(json, source, result)
      }
      // 逻辑内容
      if (mod.main) {
        const url = `${mod.url}/${mod.main}`
        const module = await import(/* @vite-ignore */ url)
        const init = module.default || module.register || module.init
        if (typeof init === 'function') await init(this.api)
      }
      Content.register(KIND.MOD, mod.id, { ...mod, id: mod.id, source }, source)
      result.ok = true
      Events.emit(EV.MOD_LOADED, result)
    } catch (err) {
      result.ok = false
      result.errors.push(String(err))
      this.errors.push({ mod: mod.id, error: String(err) })
      Events.emit(EV.MOD_ERROR, { mod: mod.id, error: String(err) })
      console.error(`[mod] ${mod.id} 加载失败`, err)
    }
    return result
  }

  registerJson(json, source, result) {
    if (Array.isArray(json)) {
      for (const entry of json) this.registerEntry(entry, source, result)
      return
    }
    for (const [key, value] of Object.entries(json)) {
      const kind = JSON_KINDS[key]
      if (kind && Array.isArray(value)) {
        for (const entry of value) this.registerEntry(entry, source, result, kind)
      } else if (kind && value && typeof value === 'object') {
        this.registerEntry(value, source, result, kind)
      } else if (key === 'items' || key === 'quests') {
        for (const entry of value || []) this.registerEntry(entry, source, result, JSON_KINDS[key])
      }
    }
  }

  registerEntry(entry, source, result, forcedKind = null) {
    if (!entry) return
    const kind = forcedKind || JSON_KINDS[entry.kind] || (entry.category ? KIND.ITEM : null)
    if (!kind) {
      result.errors.push(`无法判断内容类型: ${JSON.stringify(entry).slice(0, 80)}`)
      return
    }
    try {
      const { kind: _k, ...def } = entry
      Content.register(kind, def.id, def, source)
      if (kind === KIND.ITEM) result.items++
    } catch (err) {
      result.errors.push(String(err))
    }
  }

  unload(modId) {
    const n = Content.unregisterSource(`mod:${modId}`)
    this.loaded = this.loaded.filter((m) => m.id !== modId)
    return n
  }

  /** 供 UI 使用的摘要 */
  summary() {
    return this.mods.map((m) => {
      const r = this.loaded.find((l) => l.id === m.id)
      const errs = this.errors.filter((e) => e.mod === m.id)
      return {
        id: m.id,
        name: m.name || m.id,
        version: m.version || '0.0.0',
        author: m.author || '未知',
        description: m.description || '',
        dir: m.dir,
        enabled: this.isEnabled(m),
        loaded: !!r?.ok,
        items: r?.items || 0,
        errors: [...(r?.errors || []), ...errs.map((e) => e.error)],
      }
    })
  }
}

export function setModEnabled(modId, on) {
  try {
    const key = 'rustfall.mods'
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    data[modId] = !!on
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch (e) {
    return false
  }
}

export function getModEnabledMap() {
  try {
    return JSON.parse(localStorage.getItem('rustfall.mods') || '{}')
  } catch (e) {
    return {}
  }
}

export function enabledModSet() {
  const map = getModEnabledMap()
  const off = new Set(Object.keys(map).filter((k) => map[k] === false))
  return { isEnabled: (id) => !off.has(id) }
}
