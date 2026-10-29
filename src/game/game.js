import * as THREE from 'three'
import {
  VIEW_H,
  CYCLE_TIME,
  RAIN_WARN,
  RAIN_KILL_TIME,
  NEED_POWER,
  INTERACT_RANGE,
} from './config.js'
import { G, toast, notify, clearToast, openPanel, closePanel, resetState } from './state.js'
import './content/index.js'
import { bootstrapContent, contentSummary } from './content/index.js'
import { Events, EV } from './core/events.js'
import { Content, KIND } from './core/registry.js'
import { Input } from './input.js'
import { Room } from './world/room.js'
import { decorateTerrain } from './world/terrain-features.js'
import { Robot } from './entities/robot.js'
import { LootDrop } from './loot/world-items.js'
import { WeatherSystem } from './systems/weather.js'
import { Particles } from './systems/particles.js'
import { audio } from './systems/audio.js'
import {
  loadSave,
  writeSave,
  clearSave,
  hasSave,
  loadSettings,
  saveSettings,
  loadTerrainEdits,
  writeTerrainEdits,
} from './systems/save.js'
import { getChassis } from './chassis/index.js'
import { getTool, TOOLS } from './tools/index.js'
import { Inventory } from './loot/inventory.js'
import { rollLoot, tableFor } from './loot/loot-tables.js'
import { craft as craftWithInventory } from './loot/recipes.js'
import { ModLoader, setModEnabled as persistModEnabled, getModEnabledMap } from './mods/loader.js'
import { DayNightSystem } from './systems/daynight.js'
import { WEATHERS, DAY_PARTS } from './config.js'
import { bindGame } from './ui-actions.js'
import { addXp, initGrowth, spendGrowth as applyGrowthPoint } from './systems/growth.js'
import { injectEasterEggs, handleEgg } from './world/easter-eggs.js'
import { getTheme } from './world/themes.js'
import { buildBossTestSpec, carveBossTestArena, getBossTest } from './world/boss-test.js'
import { updateBossVfx, clearBossVfx } from './render/art/boss-vfx.js'
import { getRoomScene } from './world/scene-data.js'
import { getProp } from './world/props-data.js'
import { createChaosAI } from './systems/chaos-ai.js'
import { createLighting } from './systems/lighting.js'
import { clamp, damp } from './utils.js'
import { ensureHotkeys, setHotkey as applyHotkey, resetHotkeys as resetHotkeyDefaults } from './hotkeys.js'

// 任务物品保底：collect 目标适合出现在哪些 biome（房间生成时保证至少能捡到）
const QUEST_ITEM_BIOMES = {
  diary_1: ['city', 'metro', 'hospital'],
  diary_2: ['village', 'hospital'],
  diary_3: ['city', 'village'],
  photo_2: ['village', 'hospital'],
  jewelry_1: ['city', 'hospital', 'dump'],
  cassette_1: ['city', 'metro'],
  signal_recorder: ['port', 'dump', 'factory'],
  rare_earth: ['factory', 'dump'],
  relay_part: ['factory', 'metro'],
  lubricant: ['city', 'metro', 'factory'],
  dog_food: ['village', 'dump'],
  military_shell: ['factory', 'dump', 'port'],
  huique_toy: ['city', 'village'],
}

const SFX_MAP = {
  servo: 'step',
  dig: 'step',
  weld: 'thunder',
  scan: 'uiHover',
  pickup: 'eat',
  explosion: 'land',
  wheel: 'step',
  track: 'step',
  mechStep: 'step',
  alarm: 'hurt',
  radio: 'uiClick',
  hit: 'hurt',
}

export class Game {
  constructor(container) {
    if (window.__rustfall && typeof window.__rustfall.dispose === 'function') {
      try {
        window.__rustfall.dispose()
      } catch (e) {
        /* ignore */
      }
      window.__rustfall = null
    }
    this.container = container
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.setClearColor(0x0a0906, 1)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-VIEW_H / 2, VIEW_H / 2, VIEW_H / 2, -VIEW_H / 2, 0.1, 600)
    this.camera.position.set(0, 0, 200)
    this.zoom = 1
    this.zoomTarget = 1
    this.camWorld = { x: 0, y: 0 }
    this.shakeAmt = 0
    this.ambientShake = 0
    this.time = 0
    this.input = new Input()
    this.room = null
    this.robot = null
    this.director = null
    this.quests = null
    this.dialogue = null
    this.rescue = null
    this.inventory = null
    this.trans = null
    this.transitioning = false
    this.lastShelter = { regionId: 'city', roomId: 'city_shelter' }
    this.roomCache = new Map()
    this.terrainEdits = loadTerrainEdits()
    // 房间编辑器在运行中改动地形 → 热更新到当前房间
    this._onTerrainPatch = (e) => this.applyTerrainPatch(e.detail)
    window.addEventListener('rustfall:terrain-patch', this._onTerrainPatch)
    this.hintShelter = false
    this.hintFull = false
    this.scanFx = []
    this.projectiles = []
    this.fpsAcc = 0
    this.fpsFrames = 0
    this.interactTarget = null
    this.postfx = null
    this.bootError = null
    this.generateRoom = null
    this.regionsMod = null
    this.mods = new ModLoader()
    this.createDirector = null
    this.QuestSystemClass = null
    this.DialogueClass = null
    this.RescueClass = null
    this.dayNight = null
    this.weapons = null
    this.ecosystem = null
    this.weaponClass = null
    this.ecosystemFactory = null
    this.war = null
    this.warFactory = null

    this.weather = new WeatherSystem(this.scene)
    this.particles = new Particles(this.scene)

    this.onResize = () => this.resize()
    window.addEventListener('resize', this.onResize)
    this.resize()

    this.last = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)

    bindGame(this)
    window.__rustfall = this
    window.__G = G

    this.bootPromise = this.boot()
  }

  // ================================================================ 启动
  async boot() {
    const contentStats = bootstrapContent()
    console.log('[rustfall] content ready', contentStats, contentSummary())
    await this.loadSettingsAndMods()
    this.buildLevelIndex()
    this.setupSystems()
    this.buildTitleScene()
    this.resize()
    this.updateCamera(1, true)
    G.phase = 'title'
    G.showHud = false
    G.hasSave = hasSave()
    G.saveInfo = G.hasSave ? this.describeSave(loadSave()) : null
    G.chassisUnlocked = this.computeUnlockedChassis()
    this.applySettings()
    if (this.postfx) this.postfx.setEnabled?.(G.settings.postfx)
    Events.on('large:spawn', (e) => {
      if (!e) return
      notify(`大型目标：${e.name || e.id}`, 'danger', 4)
      this.sfx('storm_alarm', { vol: 0.35 })
    })
    Events.on('large:dead', (e) => {
      if (!e) return
      G.stats.largeKills = (G.stats.largeKills || 0) + 1
      notify(`已击破：${e.name || e.id}`, 'quest', 5)
      this.saveGame()
    })
    this.dayNight?.reset(1, 0.27)
  }

  async loadSettingsAndMods() {
    const settings = loadSettings()
    G.volume = typeof settings.volume === 'number' ? settings.volume : 0.72
    G.muted = !!settings.muted
    if (settings.display && typeof settings.display === 'object') {
      Object.assign(G.settings, settings.display)
      // v3 迁移：老存档/测试存档可能把噪点与扫描线留成开启状态，统一关掉
      if (!settings.version || settings.version < 4) {
        G.settings.grain = false
        G.settings.scanlines = false
        G.settings.postfx = false
        G.settings.glow = false
      }
    }
    this.applySettings()
    audio.setVolume(G.volume)
    audio.setMuted(G.muted)
    // 老存档没有快捷键字段：补齐武器/工具槽位默认值
    ensureHotkeys()

    try {
      await this.mods.discover()
      await this.mods.loadAll()
      G.mods.list = this.mods.summary()
      G.mods.loaded = this.mods.loaded.map((m) => m.id)
      G.mods.errors = this.mods.errors.map((e) => `${e.mod}: ${e.error}`)
    } catch (e) {
      G.mods.errors.push(String(e))
    }

    try {
      const w = await import('./world/regions.js')
      const b = await import('./world/biomes/index.js')
      this.regionsMod = w
      this.generateRoom = b.generateBiomeRoom
    } catch (e) {
      console.error('[rustfall] 世界生成模块加载失败', e)
      this.bootError = '世界生成模块缺失（src/game/world/biomes/）'
    }
    try {
      this.createDirector = (await import('./entities/monsters/director.js')).createMonsterDirector
    } catch (e) {
      console.warn('[rustfall] 怪物系统缺失', e)
    }
    try {
      this.QuestSystemClass = (await import('./quests/runtime.js')).QuestSystem
    } catch (e) {
      console.warn('[rustfall] 任务系统缺失', e)
    }
    try {
      this.DialogueClass = (await import('./quests/dialogue-runtime.js')).DialogueRuntime
    } catch (e) {
      console.warn('[rustfall] 对话系统缺失', e)
    }
    try {
      this.RescueClass = (await import('./quests/rescue.js')).RescueSystem
    } catch (e) {
      console.warn('[rustfall] 营救系统缺失', e)
    }
    try {
      this.weaponClass = (await import('./weapons/runtime.js')).WeaponSystem
    } catch (e) {
      console.warn('[rustfall] 武器系统缺失', e)
    }
    try {
      this.ecosystemFactory = (await import('./ecosystem/index.js')).createEcosystem
    } catch (e) {
      console.warn('[rustfall] 生态模块缺失', e)
    }
    try {
      this.warFactory = (await import('./systems/ecosystem-war.js')).createEcosystemWar
    } catch (e) {
      console.warn('[rustfall] 生态战争模块缺失', e)
    }
    try {
      const fx = await import('./render/fx/postfx.js')
      this.postfx = fx.createPostFX(this.renderer)
      this.postfx.resize(this.renderer.domElement.width, this.renderer.domElement.height)
      this.weather.setPostFx(this.postfx)
    } catch (e) {
      console.warn('[rustfall] 后期特效不可用，使用直出渲染', e)
      this.postfx = null
    }
  }

  setupSystems() {
    this.inventory = new Inventory({
      slots: G.inventory.slotsMax,
      capacityWeight: G.inventory.capacityWeight,
      onChange: () => this.syncInventoryState(),
    })
    // Inventory 的订阅接口（构造参数不一定被支持，两种都挂一次）
    if (typeof this.inventory.onChange === 'function') {
      this.inventory.onChange(() => this.syncInventoryState())
    }
    if (!this.dayNight) this.dayNight = new DayNightSystem(this)
    else this.dayNight.reset(1, 0.27)
    if (this.weaponClass) this.weapons = new this.weaponClass(this)
    else this.weapons = null
    if (this.QuestSystemClass) this.quests = new this.QuestSystemClass(this)
    if (this.DialogueClass) this.dialogue = new this.DialogueClass(this)
    if (this.RescueClass) this.rescue = new this.RescueClass(this)
    if (!this.chaos) this.chaos = createChaosAI(this)
    if (!this.lighting) this.lighting = createLighting(this)
    if (!this.war && this.warFactory) this.war = this.warFactory(this)
    this.syncInventoryState()
  }

  computeUnlockedChassis() {
    const list = [...G.chassisUnlocked]
    const save = loadSave()
    if (save?.chassisUnlocked) for (const id of save.chassisUnlocked) if (!list.includes(id)) list.push(id)
    return list
  }

  describeSave(save) {
    if (!save) return null
    return {
      cycle: save.cycle || 1,
      signal: save.signal || 2,
      chassis: getChassis(save.chassisId)?.name || 'UNIT-7 游侠',
      room: save.roomId || '未知',
      survivors: save.companions ? Object.values(save.companions).filter((c) => c?.rescued).length : 0,
    }
  }

  // ================================================================ 世界
  buildTitleScene() {
    if (!this.generateRoom || !this.regionsMod) return
    const start = this.startRoomSpec()
    if (!start) return
    try {
      this.loadRoom(start.regionId, start.roomId, 'shelter', { preview: true })
    } catch (e) {
      console.error('[rustfall] 标题场景加载失败', e)
    }
  }

  startRoomSpec() {
    const regions = this.regionsMod?.REGIONS
    if (!regions) return null
    const regionId = this.regionsMod.REGION_ORDER?.[0] || Object.keys(regions)[0]
    const region = regions[regionId]
    return { regionId, roomId: region.startRoom || Object.keys(region.rooms)[0] }
  }

  /** 关卡索引：按世界线顺序铺平所有房间，附主题 / BOSS 信息 */
  buildLevelIndex() {
    const mod = this.regionsMod
    if (!mod?.REGIONS) return []
    const out = []
    for (const rid of mod.REGION_ORDER || Object.keys(mod.REGIONS)) {
      const region = mod.REGIONS[rid]
      if (!region) continue
      for (const roomId of region.order || []) {
        const spec = region.rooms[roomId]
        if (!spec) continue
        const theme = spec.theme ? getTheme(spec.theme) : null
        out.push({
          index: out.length,
          regionId: rid,
          regionName: region.name,
          regionEn: region.en,
          roomId,
          label: spec.label || roomId,
          kind: spec.kind || 'standard',
          themeId: theme?.id || null,
          themeName: theme?.name || null,
          boss: theme?.boss || null,
          landmark: spec.landmark || null,
          regionRoomCount: (region.order || []).length,
        })
      }
    }
    G.levels = out
    return out
  }

  /** 调试 / 反馈用：直接跳到任意关卡（区域 + 房间） */
  jumpToLevel(regionId, roomId) {
    const spec = this.regionsMod?.getRoomSpec?.(regionId, roomId)
    if (!spec) {
      toast('关卡不存在', 'danger', 2.4)
      return false
    }
    this.audioUnlock()
    if (!this.robot || G.phase === 'title' || G.phase === 'chassis' || G.phase === 'hibernate') {
      const chassis = G.chassisUnlocked?.includes(G.chassisId) ? G.chassisId : G.chassisUnlocked?.[0] || G.chassisId
      this.startNewGame(chassis)
    }
    closePanel()
    G.phase = 'playing'
    G.showHud = true
    G.paused = false
    G.dialogue.active = false
    this.loadRoom(regionId, roomId, 'left')
    if (this.robot) {
      this.robot.dead = false
      this.robot.refreshStats?.()
      G.hp = this.robot.stats?.hp || G.hp
      G.energy = this.robot.stats?.energyMax || G.energy
    }
    this.weapons?.reset?.()
    this.snapCamera()
    this.saveGame()
    toast(`已跳转：${G.regionName} · ${G.roomName}`, 'info', 2.6)
    return true
  }

  /** 从菜单进入某只 BOSS 的专属测试房。 */
  startBossTest(bossId) {
    const test = getBossTest(bossId)
    if (!test) {
      toast('BOSS 测试房不存在', 'danger', 2.4)
      return false
    }
    this.audioUnlock()
    if (!this.robot || G.phase === 'title' || G.phase === 'chassis' || G.phase === 'hibernate') {
      const chassis = G.chassisUnlocked?.includes(G.chassisId) ? G.chassisId : G.chassisUnlocked?.[0] || G.chassisId
      this.startNewGame(chassis)
    }
    closePanel()
    G.phase = 'playing'
    G.showHud = true
    G.paused = false
    G.dialogue.active = false
    this.loadRoom('boss_test', bossId, 'center', { bossTest: true })
    if (this.robot) {
      this.robot.dead = false
      this.robot.refreshStats?.()
      this.robot.stats.hp = this.robot.stats.hpMax
      G.hp = this.robot.stats.hpMax
      G.energy = this.robot.stats.energyMax
    }
    this.weapons?.reset?.()
    this.snapCamera()
    toast(`BOSS 测试房 · ${test.name}`, 'info', 2.6)
    return true
  }

  /** BOSS 测试房：主题站点场景 + 由 bossId 派生的高低落差试炼场。 */
  getBossTestData(bossId) {
    const key = `boss_test:${bossId}`
    if (this.roomCache.has(key)) return this.roomCache.get(key)
    const spec = buildBossTestSpec(bossId)
    if (!spec) throw new Error(`missing boss test ${bossId}`)
    const gen = this.generateRoom({ ...spec, regionId: 'boss_test', roomId: bossId })
    gen.regionId = 'boss_test'
    gen.roomId = bossId
    gen.biome = spec.biome
    gen.label = spec.label
    this.applyThemeRoom(gen, spec)
    gen.monsters = []
    gen.testRoom = true
    gen.kind = 'boss'
    gen.largeEnemies = [{ id: bossId, x: Math.round((gen.worldW || 4000) * 0.66), y: 0 }]
    carveBossTestArena(gen, getBossTest(bossId))
    try {
      decorateTerrain(gen)
    } catch (e) {
      console.warn('[rustfall] 测试房地形装饰失败', e)
    }
    this.roomCache.set(key, gen)
    return gen
  }

  getRoomData(regionId, roomId) {
    if (regionId === 'boss_test') return this.getBossTestData(roomId)
    const key = `${regionId}:${roomId}`
    if (this.roomCache.has(key)) return this.roomCache.get(key)
    const spec = this.regionsMod.getRoomSpec(regionId, roomId)
    if (!spec) throw new Error(`missing room ${key}`)
    const regionBiome = this.regionsMod.REGIONS[regionId]?.biome || 'city'
    const gen = this.generateRoom({ ...spec, regionId, roomId, biome: spec.biome || regionBiome })
    gen.regionId = regionId
    gen.roomId = roomId
    gen.biome = spec.biome || regionBiome
    gen.label = spec.label || roomId
    this.applyThemeRoom(gen, spec)
    // 普通关卡的环境（雾 / 暗）由关卡场景提供；主题房已有自己的 env
    const scene = spec.theme ? null : getRoomScene(roomId)
    if (scene) {
      gen.sceneId = roomId
      if (scene.env) gen.env = { ...(gen.env || {}), ...scene.env }
    }
    this.ensureQuestItems(gen, regionId, roomId)
    try {
      decorateTerrain(gen)
    } catch (e) {
      console.warn('[rustfall] 地形装饰失败', e)
    }
    try {
      injectEasterEggs(gen, regionId, roomId)
    } catch (e) {
      console.warn('[rustfall] 彩蛋注入失败', e)
    }
    const edits = this.terrainEdits[key]
    if (edits) {
      for (const [tile, type] of Object.entries(edits)) {
        const [tx, ty] = tile.split(',').map(Number)
        gen.map.set(tx, ty, type)
      }
    }
    this.roomCache.set(key, gen)
    return gen
  }

  /**
   * 主题站点覆盖：边境残骸带的每个房间都用已有 biome 生成，这里再按 theme
   * 换掉景物、怪池与 BOSS，让它读起来像一个独立地标。
   */
  applyThemeRoom(gen, spec) {
    const theme = spec?.theme ? getTheme(spec.theme) : null
    if (!theme) return
    gen.themeId = theme.id
    gen.themeName = theme.name
    gen.themeEn = theme.en
    gen.themeAccent = theme.accent
    gen.themeFamily = theme.family
    gen.sceneryKinds = theme.sceneryKinds
    // 房间环境：重力 / 雾 / 风 / 减速 / 黑暗，交给 player/weather/lighting 读取
    if (theme.env) gen.env = { ...(gen.env || {}), ...theme.env }

    // 道具合理放置：主题房里的 biome 标志性杂物（车壳、病床、路灯……）换成主题件，
    // 只保留真正的功能件（箱桶 / 贩卖机 / 终端 / 工作台 / 营火 / 保险门等）与任务目标。
    const themeKinds = Array.isArray(theme.sceneryKinds) ? theme.sceneryKinds.filter(Boolean) : []
    if (themeKinds.length && Array.isArray(gen.props)) {
      const allowed = new Set(themeKinds)
      const keep = new Set([
        'crate', 'barrel', 'military_crate', 'vending_machine', 'terminal', 'workbench',
        'campfire', 'vault_door', 'beacon', 'beacon_lamp', 'cargo_net',
      ])
      let swap = 0
      for (const p of gen.props) {
        if (!p || allowed.has(p.kind) || keep.has(p.kind)) continue
        if (getProp(p.kind)?.questTarget) continue
        p.kind = themeKinds[swap++ % themeKinds.length]
        p.theme = theme.id
      }
    }

    // 主题战利品：替换房间内已有的地面掉落（沿用已校验过的落点，不凭空造位置）
    const themedLoot = Array.isArray(theme.loot) ? theme.loot.filter(Boolean) : []
    if (themedLoot.length && Array.isArray(gen.loot)) {
      const open = gen.loot.filter((e) => e && !e.hidden && !e.buried)
      const seed = (spec?.seed || 0) >>> 0
      for (let i = 0; i < themedLoot.length; i++) {
        if (!open.length) break
        const slot = open[(seed + i * 7 + 3) % open.length]
        if (!slot) continue
        slot.id = themedLoot[i]
        slot.theme = theme.id
      }
    }

    // 小怪：固定池按 monsterCount 铺开，避免 director 走 biome 兜底池
    const pool = Array.isArray(theme.monsters) && theme.monsters.length ? theme.monsters : null
    if (pool) {
      const count = clamp(spec.monsterCount ?? 6, 4, 9)
      gen.monsters = []
      for (let i = 0; i < count; i++) gen.monsters.push(pool[i % pool.length])
    }

    // 大型敌人：站点 BOSS 唯一，落点偏右，玩家从左门进来
    if (theme.boss) {
      const w = gen.worldW || 2000
      gen.largeEnemies = [{ id: theme.boss, x: Math.round(w * 0.68), y: 0 }]
    }
  }

  /**
   * 任务物品保底：激活中的 collect 目标必须在世界里真的能捡到。
   * 每件物品在合适的 biome 里挑 count 间房各塞一份（复用已校验的掉落点），
   * 同一房间重复生成时位置不变，避免「日志里写着收集，地图上却没有」。
   */
  ensureQuestItems(gen, regionId, roomId) {
    const active = this.quests?.active?.() || []
    if (!active.length || !Array.isArray(gen.loot) || !gen.loot.length) return
    const biome = gen.biome || 'city'
    const need = new Map()
    for (const q of active) {
      for (const obj of q.def?.objectives || []) {
        if (obj.type !== 'collect' || !obj.target) continue
        if (this.quests.objectiveDone(q.id, obj.id)) continue
        const count = Math.max(1, Number(obj.count) || 1)
        const have = Math.max(0, this.inventory?.count?.(obj.target) || 0)
        const miss = count - have
        if (miss <= 0) continue
        need.set(obj.target, Math.max(need.get(obj.target) || 0, miss))
      }
    }
    if (!need.size) return
    if (!G.quests || typeof G.quests !== 'object') return
    const sources = (G.quests.itemSources = G.quests.itemSources || {})
    const key = `${regionId}:${roomId}`
    let seed = 0
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) & 0xffff
    for (const [itemId, want] of need) {
      const biomes = QUEST_ITEM_BIOMES[itemId]
      if (biomes && !biomes.includes(biome)) continue
      const used = Array.isArray(sources[itemId]) ? sources[itemId] : (sources[itemId] = [])
      const here = used.includes(key)
      if (!here && used.length >= want) continue
      if (!here) used.push(key)
      if (gen.loot.some((e) => e && e.id === itemId)) continue
      const open = gen.loot.filter((e) => e && !e.hidden && !e.buried && !e.quest)
      if (!open.length) continue
      const slot = open[(seed + itemId.length * 13) % open.length]
      slot.id = itemId
      slot.quest = true
    }
  }

  loadRoom(regionId, roomId, entry = null, opts = {}) {
    clearBossVfx()
    try {
      this.war?.leaveRoom?.()
    } catch (e) {
      /* ignore */
    }
    if (this.room) {
      this.scene.remove(this.room.group)
      this.room.dispose()
      this.room = null
    }
    if (this.director) {
      this.director.clear()
      this.director = null
    }
    const data = this.getRoomData(regionId, roomId)
    this.room = new Room(this, data)
    this.lighting?.buildForRoom?.(this.room)
    this.roomId = roomId
    this.regionId = regionId
    G.regionId = regionId
    G.roomId = roomId
    G.roomName = data.testRoom
      ? data.label || 'BOSS 测试房'
      : this.regionsMod?.getRoomSpec?.(regionId, roomId)?.label || roomId
    G.regionName = data.testRoom ? 'BOSS 测试房' : this.regionsMod?.REGIONS?.[regionId]?.name || regionId
    G.biome = data.biome
    G.isShelter = !!data.shelter
    G.hint = ''
    G.shelterProgress = 0
    this.roomW = data.worldW
    this.roomH = data.worldH
    if (data.shelter) this.lastShelter = { regionId, roomId }

    if (this.createDirector && !opts.preview && !data.shelter) {
      try {
        this.director = this.createDirector(this)
        this.director.populate(data)
      } catch (e) {
        console.warn('[rustfall] 刷怪失败', e)
      }
    }
    this.chaos?.reset?.(data)
    if (!opts.preview && !data.shelter && !data.testRoom) {
      try {
        this.war?.enterRoom?.({ ...data, regionId, roomId })
      } catch (e) {
        console.warn('[rustfall] 生态战争恢复失败', e)
      }
    }
    if (this.rescue) {
      try {
        this.rescue.registerCages(data)
      } catch (e) {
        console.warn('[rustfall] 营救登记失败', e)
      }
    }

    if (opts.preview) this.placePreviewRobot(entry)
    else this.placeRobot(entry)

    this.spawnRoomWeapons(data)
    this.ecosystem?.clear?.()
    if (this.ecosystemFactory && !opts.preview && !data.testRoom) {
      try {
        this.ecosystem = this.ecosystemFactory(this)
        this.ecosystem.populate(data)
        G.ecosystem.active = this.ecosystem.stats?.().total || 0
      } catch (e) {
        console.warn('[rustfall] 生态生成失败', e)
      }
    }
    this.snapCamera()
    Events.emit(EV.ROOM_ENTER, { regionId, roomId })
    if (!opts.preview && !data.testRoom) {
      G.stats.roomsExplored = (G.stats.roomsExplored || 0) + 1
      // 首次进入某房间给探索经验
      const vk = `visited:${regionId}:${roomId}`
      if (!G.flags[vk]) {
        G.flags[vk] = true
        addXp(12)
      }
      if (this.quests) this.quests.notify('reach', { roomId, regionId })
      this.saveGame()
      if (this.room.data.cages?.length) toast('这一带有求救信号', 'info', 2.6)
    }
  }

  spawnPoint(entry) {
    const d = this.room.data
    if (entry === 'left' || entry === 'right') {
      const door = entry === 'left' ? d.doorLeft : d.doorRight
      return { x: door.x + (entry === 'left' ? 58 : -58), y: door.y }
    }
    if (entry === 'shelter' && d.shelter) return { x: d.shelter.x, y: d.shelter.y }
    return { x: d.spawn?.x ?? 200, y: d.spawn?.y ?? d.worldH - 200 }
  }

  placeRobot(entry) {
    if (!this.robot) {
      const sp = this.spawnPoint(entry)
      this.robot = new Robot(this, G.chassisId, sp.x, sp.y)
      this.scene.add(this.robot.group)
    } else {
      const sp = this.spawnPoint(entry)
      this.robot.dead = false
      this.robot.body.x = sp.x - this.robot.body.w / 2
      this.robot.body.y = sp.y - this.robot.body.h
      this.robot.body.vx = 0
      this.robot.body.vy = 0
      this.robot.invuln = 1.5
      this.robot.crouching = false
      this.robot.climbing = false
      this.robot.group.visible = true
      this.robot.syncMesh(0)
    }
    this.robot.refreshStats()
    if (!G.hp) G.hp = G.hpMax
    G.hp = Math.min(G.hp, G.hpMax)
    if (!G.energy) G.energy = G.energyMax
    G.energy = Math.min(G.energy, G.energyMax)
  }

  placePreviewRobot(entry) {
    const sp = this.spawnPoint(entry)
    if (!this.robot) {
      this.robot = new Robot(this, G.chassisId, sp.x, sp.y)
      this.scene.add(this.robot.group)
    }
    this.robot.body.x = sp.x - this.robot.body.w / 2
    this.robot.body.y = sp.y - this.robot.body.h
    this.robot.syncMesh(0)
    this.robot.refreshStats()
  }

  // ================================================================ 相机
  resize() {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.aspect = w / h
    this.applyProjection()
    if (this.postfx) this.postfx.resize(this.renderer.domElement.width, this.renderer.domElement.height)
  }

  applyProjection() {
    const vw = VIEW_H * this.aspect
    this.camera.left = -vw / 2
    this.camera.right = vw / 2
    this.camera.top = VIEW_H / 2
    this.camera.bottom = -VIEW_H / 2
    this.camera.zoom = this.zoom
    this.camera.updateProjectionMatrix()
  }

  viewSize() {
    const h = VIEW_H / this.zoom
    return { w: h * this.aspect, h }
  }

  cameraTarget() {
    const r = this.robot
    if (!r) return { x: (this.roomW || 1000) / 2, y: (this.roomH || 800) / 2 }
    const b = r.body
    return {
      x: b.x + b.w / 2 + clamp(b.vx * 0.24, -110, 110),
      y: b.y + b.h / 2 - 26 + clamp(b.vy * 0.05, -30, 80),
    }
  }

  clampCamX(x, vw) {
    if (!this.roomW || this.roomW <= vw) return (this.roomW || 1000) / 2
    return clamp(x, vw / 2, this.roomW - vw / 2)
  }
  clampCamY(y, vh) {
    if (!this.roomH || this.roomH <= vh) return (this.roomH || 800) / 2
    return clamp(y, vh / 2, this.roomH - vh / 2)
  }

  snapCamera() {
    const v = this.viewSize()
    const t = this.cameraTarget()
    this.camWorld.x = this.clampCamX(t.x, v.w)
    this.camWorld.y = this.clampCamY(t.y, v.h)
    this.camera.position.set(this.camWorld.x, -this.camWorld.y, 200)
    this.room?.updateBackground(this.camera)
  }

  updateCamera(dt, instant = false) {
    const r = this.robot
    if (!r) return
    const speed = Math.abs(r.body.vy)
    this.zoomTarget = 1 - clamp((speed - 240) / 1100, 0, 1) * 0.08
    this.zoom = damp(this.zoom, this.zoomTarget, 2.4, dt)
    this.applyProjection()
    const v = this.viewSize()
    const t = this.cameraTarget()
    const tx = this.clampCamX(t.x, v.w)
    const ty = this.clampCamY(t.y, v.h)
    if (instant) {
      this.camWorld.x = tx
      this.camWorld.y = ty
    } else {
      this.camWorld.x = damp(this.camWorld.x, tx, 6.2, dt)
      this.camWorld.y = damp(this.camWorld.y, ty, 4.8, dt)
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2)
    const s = this.shakeAmt * this.shakeAmt * 16 + this.ambientShake * 2.4
    const sx = (Math.random() - 0.5) * s
    const sy = (Math.random() - 0.5) * s
    this.camera.position.set(this.camWorld.x + sx, -this.camWorld.y + sy, 200)
    this.room?.updateBackground(this.camera)
  }

  cameraShake(amount) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount)
  }

  // 怪物系统使用的别名
  shake(amount) {
    this.cameraShake(amount)
  }

  damageFx(amount = 0.4) {
    G.flash = Math.min(0.8, G.flash + amount)
  }

  // ================================================================ 主循环
  loop() {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let raw = (now - this.last) / 1000
    this.last = now
    this.fpsFrames = (this.fpsFrames || 0) + 1
    this.fpsWall = (this.fpsWall || 0) + raw
    if (this.fpsWall >= 0.5) {
      G.fps = Math.round(this.fpsFrames / this.fpsWall)
      this.fpsFrames = 0
      this.fpsWall = 0
    }
    if (!(raw > 0)) raw = 0
    // 卡顿/切后台时不要一次模拟十几秒
    if (raw > 0.25) raw = 0.25
    this.acc = (this.acc || 0) + raw
    const STEP = 1 / 60
    const MAX_STEPS = 6
    let steps = 0
    try {
      // 固定步长：掉帧时补步，避免整局变慢动作
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.update(STEP)
        this.acc -= STEP
        steps++
      }
      if (steps === MAX_STEPS && this.acc > STEP) this.acc = 0 // 追不上就丢弃，防螺旋
      if (steps === 0) this.update(raw) // 高刷新率：直接推进真实时间
      this.render(raw)
    } catch (err) {
      console.error('[rustfall] loop error', err)
      this.acc = 0
    }
  }

  render(dt) {
    if (this.postfx) {
      try {
        this.postfx.render(this.scene, this.camera, dt)
        return
      } catch (e) {
        console.warn('[rustfall] postfx failed, fallback', e)
        this.postfx = null
      }
    }
    this.renderer.render(this.scene, this.camera)
  }

  update(dt) {
    this.input.pollGamepad(dt)
    // 手柄已连接且未在设置里关闭时，所有 UI 按键提示都改用 A/B/X/Y 语义
    G.ui.padActive = !!(G.settings.gamepad && this.input.pad.connected)
    this.time += dt
    G.hurt = Math.max(0, G.hurt - dt * 2)
    G.flash = Math.max(0, G.flash - dt * 2.6)
    // 手柄 UI 导航（面板 / 暂停 / 标题 / 对话选项），由 gamepad-ui 注入。
    // 先于全局按键处理，便于在对话中标记「当前焦点在选项上」。
    this.padUi?.(this.input, dt)
    this.handleGlobalKeys()
    const phase = G.phase
    const v = this.viewSize()

    if (phase === 'title' || phase === 'chassis') {
      this.weather.setPhase('calm')
      this.weather.update(dt, this.camera, v.w, v.h, this)
      this.room?.update(dt)
      this.particles.update(dt)
      this.animateIdleRobot(dt)
      this.updateCamera(dt)
      this.input.endFrame()
      return
    }
    if (phase === 'paused' || (G.ui.panel && phase === 'playing')) {
      this.room?.update(dt * 0.25)
      this.particles.update(dt)
      this.updateCamera(dt)
      this.input.endFrame()
      return
    }
    if (phase === 'dead' || phase === 'hibernate') {
      this.weather.update(dt, this.camera, v.w, v.h, this)
      this.particles.update(dt)
      this.room?.update(dt * 0.4)
      this.updateCamera(dt)
      this.updateProjectiles(dt)
      this.input.endFrame()
      return
    }
    if (phase === 'transition') {
      this.updateTransition(dt)
      this.weather.update(dt, this.camera, v.w, v.h, this)
      this.particles.update(dt)
      this.updateCamera(dt)
      this.input.endFrame()
      return
    }
    this.updatePlaying(dt, v)
    this.input.endFrame()
  }

  animateIdleRobot(dt) {
    if (!this.robot) return
    this.robot.animT += dt * 2.2
    this.robot.frame = this.robot.animT
    this.robot.applyFrame()
    this.robot.syncMesh(dt)
  }

  updatePlaying(dt, v) {
    const r = this.robot
    if (!r || !this.room) return
    r.update(dt)
    this.room.update(dt)
    if (this.director) this.director.update(dt)
    this.chaos?.update?.(dt)
    this.war?.update?.(dt)
    this.lighting?.update?.(dt)
    if (this.weapons) {
      this.weapons.setHolding?.(this.input.isDown('attack'))
      if (this.input.wasPressed('reload')) this.weapons.reload?.()
      this.weapons.update?.(dt)
      this._wstateT = (this._wstateT || 0) + dt
      if (this._wstateT >= 0.1) {
        this._wstateT = 0
        this.syncWeaponState()
      }
    }
    this.ecosystem?.update?.(dt)
    this.updateWeatherCycle(dt)
    this.updateBuffs(dt)
    this.updateProjectiles(dt)
    updateBossVfx(dt)
    this.interactTarget = this.findInteractable()
    this.updateInteractHint()
    this.handleInteractions()
    this.checkExit()
    this.weather.update(dt, this.camera, v.w, v.h, this)
    this.particles.update(dt)
    this.updateCamera(dt)
    this.updateScanFx(dt)
    if (this.quests) this.quests.update?.(dt)
    if (this.rescue) this.rescue.atShelter?.(G.roomId)
  }

  updateBuffs(dt) {
    const list = G.buffs
    if (!list || !list.length) return
    let changed = false
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]
      if (!b) continue
      b.t -= dt
      if (b.t <= 0) {
        list.splice(i, 1)
        changed = true
        if (b.name) notify(`状态结束：${b.name}`, 'info', 2)
      }
    }
    if (changed) this.robot?.refreshStats()
  }

  /** 施加一个限时增益（同名覆盖） */
  addBuff(key, name, dur, stats = {}) {
    if (!key || !(dur > 0)) return null
    const list = G.buffs || (G.buffs = [])
    let b = list.find((x) => x.key === key)
    if (!b) {
      b = { key, name: name || key, t: dur, dur, stats }
      list.push(b)
    } else {
      b.t = dur
      b.dur = dur
      b.name = name || b.name
      b.stats = stats
    }
    notify(`状态：${b.name}（${Math.round(dur)}s）`, 'good', 2)
    this.robot?.refreshStats()
    return b
  }

  updateFps(dt) {
    this.fpsAcc += dt
    this.fpsFrames++
    if (this.fpsAcc >= 0.5) {
      G.fps = Math.round(this.fpsFrames / this.fpsAcc)
      this.fpsAcc = 0
      this.fpsFrames = 0
    }
  }

  handleGlobalKeys() {
    const input = this.input
    // 记录本帧开始时的面板状态：避免“开面板”与“同键收面板”在同一帧互相抵消
    const panelBefore = G.ui.panel
    if (input.wasPressed('mute')) this.toggleMute()
    if (input.wasPressed('help')) {
      G.ui.panel = G.ui.panel === 'help' ? null : 'help'
      this.sfx('uiClick')
    }
    if (input.wasPressed('pause') && G.ui.panel !== 'sprite_editor') {
      if (G.phase === 'playing' && G.dialogue.active) {
        this.dialogue.close()
        this.sfx('uiClick')
      } else if (G.phase === 'playing' && G.ui.panel) {
        closePanel()
        this.sfx('uiClick')
      } else if (G.phase === 'paused' && G.ui.panel) {
        closePanel()
        this.sfx('uiClick')
      } else if (G.phase === 'playing') this.pause()
      else if (G.phase === 'paused') this.resume()
    }
    if (G.phase === 'playing' && !G.dialogue.active && !G.ui.panel) {
      if (input.wasPressed('inventory')) this.togglePanel('inventory')
      if (input.wasPressed('quests')) this.togglePanel('quests')
      if (input.wasPressed('archive')) this.togglePanel('archive')
      if (input.wasPressed('companions')) this.togglePanel('companions')
      if (input.wasPressed('mods')) this.togglePanel('mods')
      if (input.wasPressed('growth')) this.togglePanel('growth')
      if (input.wasPressed('tool1')) this.switchTool('shovel')
      if (input.wasPressed('tool2')) this.switchTool('pickaxe')
      if (input.wasPressed('tool3')) this.switchTool('welder')
      if (input.wasPressed('tool4')) this.switchTool('scanner')
      for (let i = 0; i < 4; i++) {
        if (input.wasPressed('weapon' + (i + 1))) this.equipWeaponSlot(i)
      }
      if (input.wasPressed('toolPrev')) this.cycleTool(-1)
      if (input.wasPressed('toolNext')) this.cycleTool(1)
      if (input.wasPressed('weaponPrev')) this.switchWeapon(-1)
      if (input.wasPressed('weaponNext')) this.switchWeapon(1)
      if (input.wasPressed('chassis')) this.cycleChassis()
    }
    // 面板打开时，用与打开面板相同的键收回（手柄/键盘都适用）
    if (G.ui.panel && G.ui.panel === panelBefore && !G.dialogue.active) {
      const keyOfPanel = { inventory: 'inventory', quests: 'quests', archive: 'archive', companions: 'companions', mods: 'mods', growth: 'growth' }
      const key = keyOfPanel[G.ui.panel]
      if (key && input.wasPressed(key)) {
        closePanel()
        this.sfx('uiClick')
      }
    }
    if (G.phase === 'playing' && G.dialogue.active) {
      // 手柄焦点落在选项按钮上时，A 由 UI 点击处理，不再重复推进文本
      if (!this._padUiFocus && (input.wasPressed('interact') || input.wasPressed('jump'))) this.dialogue.advance()
      if (input.wasPressed('choice1')) this.dialogue.choose(0)
      if (input.wasPressed('choice2')) this.dialogue.choose(1)
      if (input.wasPressed('choice3')) this.dialogue.choose(2)
    }
  }

  togglePanel(name) {
    if (G.ui.panel === name) {
      closePanel()
    } else {
      openPanel(name)
      G.ui.selectedQuest = G.quests?.tracked || G.quests?.active?.[0] || null
      G.ui.selectedArchive = G.ui.selectedArchive || G.archive.entries[0] || null
    }
    this.sfx('uiClick')
  }

  // ================================================================ 天气 / 循环
  updateWeatherCycle(dt) {
    if (!this.robot || this.robot.dead) return
    G.timeLeft = Math.max(0, G.timeLeft - dt)
    if (this.dayNight) {
      const dn = this.dayNight.update(dt, G.timeLeft, G.biome)
      G.dayNight = { ...G.dayNight, ...dn }
    }
    const acidWeather = this.dayNight?.weatherId === 'acidrain' || this.dayNight?.weatherId === 'radstorm'
    const storm = acidWeather || G.timeLeft <= 0
    const warn = G.timeLeft <= RAIN_WARN || this.dayNight?.weatherId === 'acidrain'

    if (warn && !storm && G.weatherPhase !== 'warning') {
      G.weatherPhase = 'warning'
      this.weather.setPhase('warning')
      notify('远处传来酸雨落地的嘶嘶声', 'warn', 5)
      toast('酸雨将至：回到避难所，或者钻进地底', 'warn', 5)
      this.sfx('rainStart', { vol: 0.5 })
    }
    if (storm && G.weatherPhase !== 'storm') {
      G.weatherPhase = 'storm'
      this.weather.setPhase('storm')
      notify('酸雨倾盆而下', 'danger', 5)
      toast('酸雨倾盆！暴露在室外会迅速腐蚀机体', 'danger', 4)
      this.cameraShake(0.3)
      G.flash = 0.4
    }
    // 酸雨天气自然结束（轮换走）而循环还没完：把相位降回去，否则抖动/危险音永不解除
    if (!storm && G.weatherPhase === 'storm') {
      G.weatherPhase = warn ? 'warning' : 'calm'
      this.weather.setPhase(G.weatherPhase)
      if (!warn) {
        notify('酸雨停了。机体还在滴水。', 'good', 4)
        audio.setRain?.(0.03)
      }
    }

    const inShelter = this.room.inShelter(this.robot.centerX, this.robot.centerY)
    G.sheltered = inShelter

    if (G.weatherPhase === 'storm') {
      // 轻微环境抖动：低幅度持续微震，不衰减到零也不累加到失控
      this.ambientShake = Math.min(0.45, this.ambientShake + dt * 0.5)
      if (!inShelter) {
        const hazard = this.dayNight?.hazard?.() ?? 1
        if (G.settings?.godMode) G.exposed = 0
        else G.exposed += dt * (0.6 + hazard * 0.8)
        // 酸雨持续腐蚀：结构缓慢掉血，5 秒暴露直接报废（测试选项：无敌时跳过）
        if (!G.settings?.godMode) {
          G.hp = Math.max(0, G.hp - dt * 4.2 * (0.5 + hazard))
          G.hurt = Math.max(G.hurt, 0.28)
          if (G.hp <= 0) {
            this.die('被酸雨腐蚀殆尽')
            return
          }
          if (G.exposed > RAIN_KILL_TIME) {
            this.die('被酸雨腐蚀殆尽')
            return
          }
        }
        if (Math.random() < dt * 10) {
          this.particles.emit('rain', this.robot.centerX + (Math.random() - 0.5) * 60, this.robot.body.y, {
            vx: (Math.random() - 0.5) * 40,
            vy: 160,
            life: 0.4,
          })
        }
        if (Math.random() < dt * 1.2) this.sfx('hurt', { vol: 0.1, rate: 1.6 })
      } else {
        G.exposed = 0
      }
    } else {
      G.exposed = 0
      // 非风暴相位：环境微抖平滑衰减，酸雨一停抖动随之消失
      this.ambientShake = Math.max(0, this.ambientShake - dt * 1.1)
    }
    let danger = 0
    if (this.director) {
      for (const m of this.director.list) {
        if (!m.alive) continue
        const d = Math.hypot(m.px - this.robot.centerX, m.py - this.robot.centerY)
        danger = Math.max(danger, clamp(1 - d / 460, 0, 1))
      }
    }
    audio.setDanger(Math.max(danger, G.weatherPhase === 'storm' ? 0.65 : 0))

    if (inShelter) {
      if (this.input.isDown('down')) {
        G.shelterProgress = Math.min(1, G.shelterProgress + dt / 1.25)
        if (G.shelterProgress >= 1) {
          this.hibernate()
          return
        }
      } else {
        G.shelterProgress = Math.max(0, G.shelterProgress - dt * 2.4)
      }
      if (!this.hintShelter) {
        this.hintShelter = true
        toast(`避难所。按住 ↓ 待机充电（需要 ${NEED_POWER} 格电量）`, 'info', 4)
      }
    } else {
      G.shelterProgress = Math.max(0, G.shelterProgress - dt * 2.4)
      this.hintShelter = false
    }

    if (!this.hintFull && G.power >= NEED_POWER) {
      this.hintFull = true
      notify('电量足够待机了', 'good', 4)
    }
    if (G.power < NEED_POWER) this.hintFull = false

    G.weatherIntensity = this.weather.intensity
    this.postfx?.setUniforms?.({ smoke: 0.12 + this.weather.intensity * 0.3 })
  }

  // ================================================================ 设置 / 画面
  applySettings() {
    const st = G.settings
    if (this.postfx) {
      this.postfx.setEnabled?.(!!st.postfx)
      this.postfx.setGlow?.(!!st.glow)
      this.postfx.setUniforms?.({
        grain: st.grain ? 0.12 : 0,
        scanline: st.scanlines ? 0.12 : 0,
        vignette: st.vignette ? 0.55 : 0,
      })
    }
    if (document?.documentElement) {
      const root = document.documentElement
      root.classList.toggle('fx-off-scanlines', !st.scanlines)
      root.classList.toggle('fx-off-grain', !st.grain)
      root.classList.toggle('fx-off-vignette', !st.vignette)
    }
  }

  setSetting(key, value) {
    if (!(key in G.settings)) return
    G.settings[key] = value
    this.applySettings()
    saveSettings({ display: { ...G.settings }, version: 4 })
    if (key === 'gamepad' && !value) {
      G.gamepad.connected = false
    }
    // 测试选项：开启无敌时立刻回满
    if (key === 'godMode') {
      if (value) {
        G.hp = G.hpMax
        G.exposed = 0
        if (this.robot) this.robot.dead = false
      }
      toast(value ? '测试模式：无敌已开启' : '测试模式：无敌已关闭', 'info', 2)
    } else if (key === 'infiniteJump') {
      toast(value ? '测试模式：无限跳已开启' : '测试模式：无限跳已关闭', 'info', 2)
    }
    return value
  }

  setDeadzone(v) {
    const dz = clamp(Number(v) || 0.24, 0.05, 0.6)
    G.settings.deadzone = dz
    if (this.input?.pad) this.input.pad.deadzone = dz
    saveSettings({ display: { ...G.settings } })
  }

  /** 设置武器/工具快捷槽位绑定（键盘 code 或手柄按键索引） */
  setHotkey(action, patch) {
    if (!applyHotkey(action, patch)) return false
    saveSettings({ display: { ...G.settings } })
    return true
  }

  resetHotkeys() {
    resetHotkeyDefaults()
    saveSettings({ display: { ...G.settings } })
    toast('快捷键已恢复默认', 'good', 1.8)
  }

  // ================================================================ 日夜 / 天气
  applyDayNight(params, st) {
    if (!params) return
    const pf = this.postfx
    let wx = null
    try {
      wx = this.room?.safeWeatherArt?.(params.weather?.id || 'clear') || null
    } catch (e) {
      wx = null
    }
    // 天气淡入淡出系数：wx 的离散参数按它缩放，切换天气时画面不跳变
    const wk = params.weatherK ?? 1
    const roomEnv = this.room?.data?.env || null
    const roomDark = clamp(Number(roomEnv?.dark) || 0, 0, 1)
    const baseTint = params.tint || [1, 1, 1]
    let tint = baseTint
    if (wx?.tint && wk > 0) {
      tint = [
        baseTint[0] + (wx.tint[0] - baseTint[0]) * wk,
        baseTint[1] + (wx.tint[1] - baseTint[1]) * wk,
        baseTint[2] + (wx.tint[2] - baseTint[2]) * wk,
      ]
    }
    pf?.setUniforms?.({
      // 闪电：整屏瞬时提亮（daynight 每 0.1s apply 一次，闪电在 ~0.4s 内衰减）
      ambient: clamp((params.amb + (params.lightning || 0) * 0.85) * (1 - roomDark * 0.8), 0, 1.35),
      night: Math.max(params.night || 0, roomDark),
      weatherTint: tint,
      fog: Math.max(params.fog, (wx?.fog || 0) * wk, Number(roomEnv?.fog) || 0),
      wetness: Math.max(params.wetness, (wx?.wetness || 0) * wk),
      toxicity: (wx?.toxicity || 0) * wk,
    })
    this.room?.applyDayNight?.(params)
    this.weather?.setIntensity?.(Math.max(params.rain, params.fog * 0.35))
    this.weather?.setRain?.(params.rain)
    this.audioAmbience(params.phase?.id, st?.weather)
    // 背景视差层随环境光压暗/染色
    const room = this.room
    if (room?.bgLayers) {
      for (const l of room.bgLayers) {
        if (!l.mat) continue
        if (l.baseColor === undefined) l.baseColor = l.mat.color.getHex()
        const tint = params.tint || [1, 1, 1]
        const amb = (0.35 + params.amb * 0.65) * (1 - roomDark * 0.8)
        l.mat.color.setRGB(
          clamp(((l.baseColor >> 16) & 255) / 255 * tint[0] * amb, 0, 1),
          clamp(((l.baseColor >> 8) & 255) / 255 * tint[1] * amb, 0, 1),
          clamp((l.baseColor & 255) / 255 * tint[2] * amb, 0, 1),
        )
      }
    }
  }

  audioAmbience(phase, weather) {
    try {
      audio.setAmbience?.(phase, weather)
      audio.setWind?.(this.dayNight?.params?.().wind ?? 0.1)
    } catch (e) {
      /* 音频未实现 */
    }
  }

  onWeatherChange(id, prev, opts = {}) {
    const w = WEATHERS[id]
    if (!w) return
    const stormy = id === 'acidrain' || id === 'radstorm'
    if (stormy) this.weather?.setPhase?.('storm')
    else if (id === 'toxicfog' || id === 'duststorm') this.weather?.setPhase?.('warning')
    else this.weather?.setPhase?.('calm')
    this.weather?.setSmoke?.((w.fog || 0) + (id === 'toxicfog' ? 0.4 : 0))
    this.sfx(stormy ? 'thunder' : 'uiClick', { vol: stormy ? 0.4 : 0.12 })
  }

  onDayPhase(phase, prev) {
    if (!prev) return
    const def = DAY_PARTS.find((p) => p.id === phase)
    if (!def) return
    const msg = {
      dawn: '天快亮了，空气里的酸味淡了一点。',
      morning: '清晨。远处有金属在冷却的声音。',
      noon: '正午。影子缩到脚边。',
      afternoon: '午后。风里开始带灰。',
      dusk: '天在暗下去，该找地方了。',
      night: '夜晚。只有机体的指示灯还亮着。',
    }[phase]
    if (msg) notify(msg, 'info', 3.4)
    if (phase === 'night') G.flash = Math.min(0.3, G.flash + 0.12)
  }

  showHint(text, dur = 2) {
    toast(text, 'warn', dur)
  }

  // ================================================================ 交互
  findInteractable() {
    const r = this.robot
    if (!r || !this.room) return null
    let best = null
    let bestScore = Infinity
    for (const it of this.room.interactables) {
      const dx = it.x - r.centerX
      const dy = it.y - (r.centerY + 6)
      const d = Math.hypot(dx, dy)
      const range = it.radius || INTERACT_RANGE
      if (d > range) continue
      if (it.kind === 'loot' && it.drop?.picked) continue
      if (Math.abs(dx) > 14 && Math.sign(dx) !== r.facing) continue
      const score = d + (it.kind === 'npc' ? 4 : 0)
      if (score < bestScore) {
        best = it
        bestScore = score
      }
    }
    return best
  }

  handleInteractions() {
    if (!this.input.wasPressed('interact')) return
    if (G.dialogue.active) return
    if (this.interactTarget) this.interact(this.interactTarget)
  }

  updateInteractHint() {
    const it = this.interactTarget
    if (!it) {
      G.interactHint = null
      return
    }
    let label = ''
    let sub = ''
    switch (it.kind) {
      case 'npc':
        label = `交谈 · ${it.name || ''}`
        sub = '同伴'
        break
      case 'cage':
        label = it.opened ? '牢笼（已打开）' : '撬开牢笼'
        sub = it.opened ? '' : '营救'
        break
      case 'landmark':
        label = it.repaired ? '已修复' : it.landmarkKind === 'antenna' ? '架设天线' : '修理地标'
        sub = it.repaired ? '' : '需要焊枪'
        break
      case 'loot':
        label = it.drop?.buried ? '埋藏的物品' : '拾取'
        sub = it.drop?.buried ? '需要工兵铲' : it.label || ''
        break
      case 'destructible':
        label = it.hp > 0 ? '砸开' : '已破坏'
        break
      case 'prop':
        label = it.def?.egg
          ? `调查 · ${it.def.name || '异常物件'}`
          : it.propKind === 'workbench'
            ? '使用工作台'
            : it.propKind === 'terminal'
              ? '读取终端'
              : it.def?.loot
                ? it.opened
                  ? '已搜查'
                  : '搜索'
                : '查看'
        break
      default:
        label = '交互'
    }
    G.interactHint = { label, sub }
  }

  interact(target = null) {
    const it = target || this.interactTarget || this.findInteractable()
    if (!it) return
    if (it.kind === 'npc') return this.talkTo(it.npcId)
    if (it.kind === 'cage') {
      if (it.opened) return toast('牢笼已经打开了', 'info', 1.6)
      if (it.rescueQuest && this.quests) {
        const q = Content.get(KIND.QUEST, it.rescueQuest)
        if (q && !this.quests.isActive(it.rescueQuest) && !this.quests.isCompleted(it.rescueQuest)) {
          this.quests.start(it.rescueQuest)
          toast(`接到营救：${q.title}`, 'quest', 3)
        }
      }
      if (this.rescue) {
        const res = this.rescue.interact(it.id)
        if (res?.ok) {
          it.opened = true
          it.glowMat.opacity = 0.04
          it.mat.opacity = 0.55
          G.flags[`cage:${it.id}`] = true
          this.quests?.notify('rescue', { rescueId: it.rescueQuest, companionId: it.companionId, cageId: it.id })
          this.sfx('pickup', { vol: 0.6 })
          this.particles.emitMany('spark', it.x, it.y - 20, 16)
          toast(res.message || '牢笼打开了', 'good', 3)
        } else if (res?.message) {
          toast(res.message, 'warn', 2.4)
        }
      } else {
        toast('需要撬开牢笼（装备焊枪）', 'warn', 2)
      }
      return
    }
    if (it.kind === 'landmark') return this.interactLandmark(it)
    if (it.kind === 'loot') {
      if (it.drop?.buried) return toast('埋在土里，需要用工兵铲挖开', 'info', 2)
      if (it.drop) {
        it.drop.reveal()
        it.drop.tryPickup()
      }
      return
    }
    if (it.kind === 'destructible') {
      if (it.hp <= 0) return toast('这里已经空了', 'info', 1.4)
      it.hp = (it.hp || 2) - 1
      this.sfx('land', { vol: 0.5 })
      this.particles.emitMany('dust', it.x, it.y - 10, 8)
      if (it.hp <= 0) {
        it.mesh.visible = false
        if (it.flagKey) G.flags[it.flagKey] = true
        const drops = rollLoot(tableFor(this.room.data.biome, it.propKind), Math.random)
        for (const d of drops) this.dropLoot(d.id, it.x, it.y, { n: d.n })
        toast('箱子被砸开了', 'good', 1.6)
      }
      return
    }
    if (it.kind === 'prop') return this.interactProp(it)
  }

  interactLandmark(lm) {
    if (lm.repaired) return toast('这里已经修好了', 'info', 1.8)
    if (lm.landmarkKind === 'antenna') {
      const parts = this.inventory.count('relay_part')
      const rare = this.inventory.count('rare_earth')
      if (parts >= 2 && rare >= 3) {
        this.inventory.remove('relay_part', 2)
        this.inventory.remove('rare_earth', 3)
        this.repairLandmark(lm, '天线重新亮起，信号穿透了酸雨云层。')
        this.quests?.notify('repair', { landmarkId: lm.id })
      } else {
        toast(`需要 relay_part ×2（${parts}）与 rare_earth ×3（${rare}）`, 'warn', 3)
      }
      return
    }
    if (G.toolId !== 'welder') return toast('需要装备电弧焊枪才能修理', 'warn', 2.2)
    this.repairLandmark(lm, '焊接的火花在废墟里格外亮。')
    this.quests?.notify('repair', { landmarkId: lm.id })
  }

  repairLandmark(lm, msg) {
    this.room.markLandmarkRepaired(lm.id)
    this.sfx('weld', { vol: 0.6 })
    this.particles.emitMany('spark', lm.x, lm.y - 30, 18)
    toast(msg, 'good', 3)
  }

  interactProp(it) {
    const def = it.def || {}
    if (def.egg) {
      handleEgg(this, it, def)
      return
    }
    if (def.interact === 'rescue') {
      if (this.rescue) {
        const res = this.rescue.interact(it.propKind || 'cage')
        toast(res?.message || '牢笼打开了', res?.ok ? 'good' : 'warn', 2.6)
      }
      return
    }
    // 工具门槛：拆焊/挖掘需要对应工具握在手上（工作台保持随时可用）
    const TOOL_GATE = { welder: 1, pickaxe: 1, shovel: 1 }
    if (
      def.interact &&
      def.interact !== 'rescue' &&
      def.interact !== 'rest' &&
      TOOL_GATE[def.interact] &&
      it.propKind !== 'workbench' &&
      G.toolId !== def.interact
    ) {
      const toolDef = Content.get(KIND.ITEM, def.interact)
      return toast(`需要装备${toolDef?.name || def.interact}`, 'warn', 2.2)
    }
    if (it.propKind === 'campfire') {
      this.addBuff('warmth', '余温', 60, { armor: 0.04 })
      this.robot.heal(10)
      this.particles.emitMany('spark', it.x, it.y - 6, 10)
      return toast('在火边烤了一会儿，机体暖和起来。', 'good', 2.4)
    }
    // 用工具拆/挖时给机械臂一个动作 + 粒子
    if (def.interact === 'welder' || def.interact === 'pickaxe' || def.interact === 'shovel') {
      this.robot?.playUse?.(def.interact === 'welder' ? 'repair' : 'dig')
    }
    if (def.loot && !it.opened) {
      it.opened = true
      if (it.flagKey) G.flags[it.flagKey] = true
      if (it.mesh) it.mesh.material.opacity = 0.55
      const drops = rollLoot(def.loot, Math.random)
      for (const d of drops.length ? drops : [{ id: 'scrap_plate', n: 1 }]) {
        this.dropLoot(d.id, it.x, it.y - 20, { n: d.n })
      }
      this.sfx('pickup', { vol: 0.5 })
      toast('搜出一个补给包', 'good', 1.8)
      return
    }
    if (it.propKind === 'workbench') {
      const hasKit = this.inventory.count('repair_kit') > 0
      if (hasKit) {
        this.inventory.remove('repair_kit', 1)
        this.robot.heal(Math.round(this.robot.stats.hp * 0.5))
        toast('用维修包修复了机体', 'good', 2)
        this.sfx('weld', { vol: 0.4 })
      } else {
        toast('工作台：需要一个维修包才能修复机体', 'info', 2.4)
      }
      openPanel('inventory')
      return
    }
    if (it.propKind === 'terminal') {
      toast('终端里只剩一行重复的求救信号。', 'info', 2.6)
      this.quests?.notify('inspect', { propKind: 'terminal', roomId: this.roomId })
      return
    }
    if (it.propKind === 'grave') {
      if (it.opened) return toast('墓碑前已经搜过了。', 'info', 1.6)
      const drops = rollLoot(tableFor(this.room.data.biome, 'grave'), Math.random)
      for (const d of drops) this.dropLoot(d.id, it.x, it.y - 20, { n: d.n })
      toast('墓碑前放着几样东西。', 'info', 2.4)
      it.opened = true
      if (it.flagKey) G.flags[it.flagKey] = true
      return
    }
    toast('没什么可做的。', 'info', 1.4)
  }

  talkTo(npcId) {
    this.quests?.notify('talk', { npcId })
    if (this.dialogue) {
      const ok = this.dialogue.start(npcId)
      if (!ok) {
        const comp = Content.get(KIND.COMPANION, npcId)
        toast(comp ? `${comp.name} 暂时不想说话。` : '没有人回应。', 'info', 2)
      }
      return
    }
    const comp = Content.get(KIND.COMPANION, npcId)
    toast(comp ? `${comp.name}：……（对话系统未加载）` : '没有人回应。', 'info', 2)
  }

  /** 房间里散落的武器 + 对应弹药（世界生成器的 data.weapons） */
  spawnRoomWeapons(data) {
    const list = Array.isArray(data.weapons) ? data.weapons : []
    for (const w of list) {
      const def = Content.get(KIND.ITEM, w.id)
      if (!def) continue
      const flag = `weapon:${this.roomId}:${w.id}:${Math.round(w.x)}:${Math.round(w.y)}`
      if (G.flags[flag]) continue
      const drop = new LootDrop(this, w.id, w.x, w.y, { flagKey: flag })
      this.room.lootDrops.push(drop)
      this.room.group.add(drop.group)
      this.room.interactables.push({
        kind: 'loot',
        x: w.x,
        y: w.y,
        radius: 46,
        drop,
        label: def.name,
      })
      // 弹药：按武器类型配一小包
      const ammoId = /laser|arc|rail/.test(w.id)
        ? 'ammo_laser'
        : /nail/.test(w.id)
          ? 'ammo_nail'
          : /scrap/.test(w.id)
            ? 'ammo_scrap'
            : 'ammo_9mm'
      if (Content.get(KIND.ITEM, ammoId)) {
        const ammo = new LootDrop(this, ammoId, w.x + 18, w.y, {
          flagKey: `ammo:${this.roomId}:${ammoId}:${Math.round(w.x)}:${Math.round(w.y)}`,
        })
        this.room.lootDrops.push(ammo)
        this.room.group.add(ammo.group)
      }
    }
  }

  // ================================================================ 战斗 / 掉落
  /** 触发一次瞬时点光（枪口 / 弹着 / 爆炸），池化在 lighting 里 */
  lightBurst(x, y, radius = 160, color = 0xffd08a, life = 0.18, intensity = 0.9) {
    this.lighting?.flash?.(x, y, radius, color, life, intensity)
  }

  spawnProjectile(opts = {}) {
    const {
      x,
      y,
      vx = 0,
      vy = 0,
      damage = 10,
      radius = 6,
      color = 0x9ac84a,
      life = 2.2,
      gravity = 900,
      onHit = null,
      onLand = null,
    } = opts
    this.lightBurst(x, y, 70 + radius * 5, color, 0.1, 0.7)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 10), mat)
    mesh.position.set(x, -y, 6)
    this.scene.add(mesh)
    const p = { x, y, vx, vy, damage, radius, life, gravity, mesh, mat, onHit, onLand }
    this.projectiles.push(p)
    return p
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      p.life -= dt
      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.mesh.position.set(p.x, -p.y, 6)
      let hit = this.room?.map?.solidAt(p.x, p.y)
      const r = this.robot
      if (!hit && r && !r.dead && Math.hypot(p.x - r.centerX, p.y - r.centerY) < 18 + p.radius) {
        r.takeDamage(p.damage, p.x)
        hit = true
      }
      if (hit || p.life <= 0) {
        this.particles.emitMany('acid', p.x, p.y, 6)
        try {
          p.onLand?.(p.x, p.y)
        } catch (e) {
          /* ignore */
        }
        p.onHit?.(p)
        this.scene.remove(p.mesh)
        p.mesh.geometry.dispose()
        p.mat.dispose()
        this.projectiles.splice(i, 1)
      }
    }
  }

  damageArea(x, y, radius, damage) {
    const r = this.robot
    if (r && !r.dead) {
      const d = Math.hypot(r.centerX - x, r.centerY - y)
      if (d < radius) {
        const falloff = 1 - clamp((d - radius * 0.4) / (radius * 0.6), 0, 1)
        r.takeDamage(Math.max(1, Math.round(damage * falloff)), x)
      }
    }
    this.particles.emitMany('explosion', x, y, 10)
    this.cameraShake(0.3)
  }

  dropLoot(itemId, x, y, opts = {}) {
    const def = Content.get(KIND.ITEM, itemId)
    if (!def) return null
    const n = opts.n || 1
    let created = null
    for (let i = 0; i < n; i++) {
      const d = new LootDrop(this, itemId, x + (Math.random() - 0.5) * 16, y - 12, {
        vx: opts.vx ?? (Math.random() - 0.5) * 90,
        vy: opts.vy ?? -110 - Math.random() * 80,
        questItem: !!opts.questItem,
      })
      this.room?.lootDrops.push(d)
      this.room?.group.add(d.group)
      created = d
    }
    return created
  }

  onLootPicked(itemId, def) {
    G.stats.looted++
    this.quests?.notify('collect', { itemId, n: 1 })
    if (def?.lore) this.addArchive(itemId, def)
    // 稀有度换算经验：越难找的东西越值经验
    const RARITY_XP = { 0: 2, 1: 3, 2: 5, 3: 9, 4: 16, 5: 26 }
    const rarity = Number(def?.rarity ?? 0)
    addXp(RARITY_XP[rarity] ?? 3)
    this.sfx('pickup', { vol: 0.5, rate: 1.1 + Math.random() * 0.2 })
    notify(`拾取 ${def?.name || itemId}`, 'loot', 2)
  }

  addArchive(itemId, def) {
    if (G.archive.entries.includes(itemId)) return
    G.archive.entries.push(itemId)
    G.archive.unread++
    Events.emit(EV.ARCHIVE_ADD, { itemId })
    notify(`档案 +1：${def?.name || itemId}`, 'good', 2.6)
  }

  onMonsterKilled(monster) {
    // 生态冲突中互相打死的：不计入玩家击杀/经验，只走导演的结算（掉落照常）
    if (monster.__warKilled) {
      try {
        this.director?.onMonsterKilled?.(monster)
      } catch (e) {
        /* ignore */
      }
      return
    }
    G.stats.kills++
    G.bestiary[monster.id] = (G.bestiary[monster.id] || 0) + 1
    this.quests?.notify('kill', { monsterId: monster.id, n: 1 })
    this.particles.emitMany('blood', monster.px, monster.py, 14)
    // 经验：定义里的 xp 优先，否则按体型/精英估算
    const baseXp = Number(monster.def?.xp)
    const fallback = monster.boss ? 90 : monster.large || monster.isLarge ? 35 : 8
    addXp(Number.isFinite(baseXp) && baseXp > 0 ? baseXp : fallback)
    // director 需要自己移除尸体/计数
    try {
      this.director?.onMonsterKilled?.(monster)
    } catch (e) {
      /* ignore */
    }
  }

  /** 成长面板加点（A.spendGrowth 门面调用） */
  spendGrowth(key) {
    const res = applyGrowthPoint(key)
    if (res.ok) {
      this.robot?.refreshStats()
      this.sfx('servo', { vol: 0.45 })
      this.saveGame()
    } else if (res.reason === 'max' || res.reason === 'points') {
      this.sfx('uiClick', { vol: 0.4 })
    }
    return res
  }

  // ================================================================ 道具 / 机体
  useItem(itemId, opts = {}) {
    const def = Content.get(KIND.ITEM, itemId)
    if (!def) return
    if (def.category === 'weapon' || def.category === 'ammo') {
      if (def.category === 'weapon') this.equipItem(itemId)
      return
    }
    let res = null
    try {
      res = this.inventory.use(itemId)
    } catch (e) {
      res = null
    }
    if (res && res.ok === false) {
      toast(res.reason || '不能使用这个物品。', 'info', 1.8)
      return
    }
    const effect = (res && res.effect) || def.use || opts.effect || null
    if (!effect) {
      // 没有可解释的效果：装备类走安装
      if (def.slot) return this.equipItem(itemId)
      toast('这个东西不能直接用。', 'info', 1.6)
      return
    }
    let acted = false
    let useKind = 'use'
    if (effect.energy) {
      G.power = Math.min(G.powerMax, G.power + effect.energy)
      G.energy = Math.min(G.energyMax, G.energy + effect.energy * 20)
      notify(`+${effect.energy} 电量`, 'good', 2)
      acted = true
      useKind = 'energy'
    }
    if (effect.heal) {
      this.robot.heal(effect.heal)
      notify(`修复 ${effect.heal} 点结构`, 'good', 2)
      acted = true
      useKind = 'heal'
    }
    if (effect.repair) {
      this.robot.heal(effect.repair)
      notify(`维修包修复了 ${effect.repair} 点结构`, 'good', 2)
      acted = true
      useKind = 'repair'
    }
    if (effect.scan) {
      this.scanPulseFx(this.robot.centerX, this.robot.centerY)
      acted = true
      useKind = 'scan'
    }
    if (effect.cleanse) {
      G.toxicity = 0
      toast('酸中和剂生效了', 'good', 1.8)
      acted = true
      useKind = 'bubble'
    }
    if (effect.radClear) {
      G.toxicity = Math.max(0, G.toxicity - 60)
      G.exposed = Math.max(0, G.exposed - 40)
      this.addBuff('radshield', '抗辐射涂层', 45, { armor: 0.06 })
      acted = true
      useKind = 'bubble'
    }
    if (effect.light) {
      this.addBuff('flare', '照明信号', 25, {})
      acted = true
      useKind = 'spark'
    }
    // 进攻道具：以玩家为中心命中范围内所有敌人
    if (effect.emp || effect.fire) {
      const spec = effect.emp || effect.fire
      const radius = spec.radius || 240
      const dmg = spec.damage || 24
      const cx = this.robot.centerX
      const cy = this.robot.centerY
      const list = this.director?.list || []
      let hit = 0
      for (const m of list) {
        if (!m || m.dead || !m.alive) continue
        const d = Math.hypot(m.px - cx, m.py - cy)
        if (d > radius) continue
        m.takeDamage?.(dmg, cx)
        if (effect.emp && spec.stun) {
          m.stunT = Math.max(m.stunT || 0, spec.stun)
          m.__glitchT = Math.max(m.__glitchT || 0, spec.stun * 0.8)
        }
        hit++
      }
      const color = effect.emp ? 0x8fc4ff : 0xff7a3c
      this.particles?.emitMany?.('spark', cx, cy, 26, { color, spread: 2.4, life: 0.6, size: 1.4 })
      this.cameraShake?.(0.35)
      this.sfx(effect.emp ? 'alarm' : 'explosion', { vol: 0.55 })
      if (hit) notify(`${def.name}命中 ${hit} 个目标`, 'good', 2)
      else toast('附近没有目标。', 'info', 1.6)
      this.chaos?.boost?.(8)
      acted = true
      useKind = 'repair'
    }
    if (effect.buff && typeof effect.buff === 'object') {
      const b = effect.buff
      this.addBuff(b.key || itemId, b.name || def.name, b.dur || 20, b.stats || {})
      acted = true
    }
    if (acted) this.robot?.playUse?.(useKind)
    if (!acted) {
      toast('用了，但好像没什么用。', 'info', 1.6)
    }
    this.sfx('eat', { vol: 0.6 })
    this.syncInventoryState()
  }

  equipItem(itemId) {
    const def = Content.get(KIND.ITEM, itemId)
    if (!def?.slot) return toast('这不是可安装的组件。', 'info', 1.6)
    if (def.slot === 'weapon' || def.category === 'weapon') {
      if (!this.weapons) return toast('武器系统未加载', 'warn', 2)
      const wr = this.weapons.equip(itemId)
      if (wr?.ok) {
        this.weapons.reload?.()
        this.syncWeaponState()
        this.sfx('weapon_swap', { vol: 0.5 })
        notify(`装备：${def.name}`, 'good', 2)
      } else {
        toast(wr?.reason || '这台机体装不了这件武器', 'warn', 2.4)
      }
      return
    }
    const res = this.inventory.equip(itemId)
    if (res.ok) {
      this.applyEquipment()
      notify(`已安装：${def.name}`, 'good', 2.2)
      this.sfx('servo', { vol: 0.5 })
    } else toast(res.reason || '无法安装', 'warn', 2)
  }

  unequipSlot(slot) {
    const res = this.inventory.unequip(slot)
    if (res.ok) {
      this.applyEquipment()
      this.sfx('servo', { vol: 0.4 })
    } else if (res.reason) toast(res.reason, 'warn', 2)
  }

  syncWeaponState() {
    if (!this.weapons) return
    const st = this.weapons.state ? this.weapons.state() : null
    if (st && G.weapon) Object.assign(G.weapon, st)
  }

  applyEquipment() {
    if (this.robot) this.robot.refreshStats()
    this.syncInventoryState()
  }

  dropItem(itemId, n = 1) {
    const removed = this.inventory.drop(itemId, n)
    if (removed > 0) {
      this.dropLoot(itemId, this.robot.centerX, this.robot.centerY, { n: removed })
      this.sfx('uiClick', { vol: 0.4 })
    }
  }

  craft(recipeId) {
    if (!recipeId) {
      toast('合成需要靠近工作台。', 'info', 2)
      return { ok: false }
    }
    const res = craftWithInventory(this.inventory, recipeId)
    if (res.ok) {
      notify('合成完成', 'good', 2)
      this.sfx('weld', { vol: 0.5 })
      if (res.repair) {
        this.robot?.heal(res.repair)
        notify(`修复了 ${res.repair} 点结构`, 'good', 2)
      }
      this.syncInventoryState()
    } else {
      toast(res.reason || '材料不足', 'warn', 2)
    }
    return res
  }

  syncInventoryState() {
    if (!this.inventory) return
    G.inventory.slots = this.inventory.slots.map((s) => (s ? { id: s.id, n: s.n } : null))
    G.inventory.weight = this.inventory.weight
    G.inventory.slotsMax = this.inventory.slots.length
    G.equipped = { ...this.inventory.equipped }
    if (this.robot) this.robot.refreshStats()
    G.inventory.capacityWeight = Math.round(
      (this.inventory.baseCapacity || this.inventory.capacityWeight || 42) * (this.robot?.stats?.carry || 1),
    )
    this.syncInventoryQuests()
  }

  /** 背包内容变化时把「收集类」任务推进（掉落、奖励、购买都走这里） */
  syncInventoryQuests() {
    if (!this.quests || !this.inventory) return
    const counts = {}
    for (const s of this.inventory.slots) {
      if (!s) continue
      counts[s.id] = (counts[s.id] || 0) + s.n
    }
    const prev = this._invCounts || {}
    try {
      for (const [id, n] of Object.entries(counts)) {
        const d = n - (prev[id] || 0)
        if (d > 0) this.quests.notify('collect', { itemId: id, n: d })
      }
    } catch (e) {
      /* ignore */
    }
    this._invCounts = counts
  }

  switchChassis(id) {
    if (!this.robot) return false
    const res = this.robot.switchChassis(id)
    if (!res.ok) {
      if (res.reason === 'locked') toast('这台机体还没解锁。', 'warn', 2)
      else if (res.reason === 'cooldown') toast('变形冷却中……', 'warn', 1.4)
      else if (res.reason === 'energy') toast('电量不足，无法变形。', 'warn', 2)
      return false
    }
    this.saveGame()
    return true
  }

  cycleChassis() {
    const unlocked = G.chassisUnlocked
    if (!unlocked.length) return
    const idx = unlocked.indexOf(G.chassisId)
    this.switchChassis(unlocked[(idx + 1) % unlocked.length])
  }

  switchTool(id) {
    if (!TOOLS.find((t) => t.id === id) || G.toolId === id) return
    G.toolId = id
    this.sfx('uiClick', { vol: 0.5 })
    toast(`工具：${getTool(id).name}`, 'info', 1.2)
    Events.emit(EV.TOOL_SWITCH, { toolId: id })
  }

  /** 按顺序循环切换工具（手柄 LB/RB） */
  cycleTool(dir = 1) {
    if (!TOOLS.length) return
    const idx = TOOLS.findIndex((t) => t.id === G.toolId)
    const next = TOOLS[(idx + (dir > 0 ? 1 : TOOLS.length - 1)) % TOOLS.length]
    if (next) this.switchTool(next.id)
  }

  /** 背包里的武器按槽位排序（供快捷槽与循环切换共用） */
  weaponSlotIds() {
    const ids = []
    const seen = new Set()
    const add = (id) => {
      if (!id || seen.has(id)) return
      const def = Content.get(KIND.ITEM, id)
      if (!def || (def.category !== 'weapon' && def.slot !== 'weapon')) return
      seen.add(id)
      ids.push(id)
    }
    for (const s of this.inventory?.slots || []) add(s?.id)
    // 兼容旧存档：装备栏/当前武器即使不在背包里也要能切回
    add(G.equipped?.weapon)
    add(this.weapons?.weaponId)
    return ids
  }

  /** 快捷槽：装备背包里的第 index 把武器（0-3） */
  equipWeaponSlot(index) {
    if (!this.weapons) return
    const ids = this.weaponSlotIds()
    const id = ids[index]
    if (!id) {
      toast(`快捷槽 ${index + 1} 没有武器`, 'info', 1.4)
      return
    }
    const def = Content.get(KIND.ITEM, id)
    const res = this.weapons.equip(id)
    if (res?.ok) {
      this.syncWeaponState()
      this.sfx('weapon_swap', { vol: 0.5 })
      toast(`武器 ${index + 1}：${def?.name || id}`, 'info', 1.4)
    } else toast(res?.reason || '无法装备武器', 'warn', 1.8)
  }

  /** 按顺序循环切换武器（十字键 / 方括号） */
  switchWeapon(dir = 1) {
    if (!this.weapons) return
    const ids = this.weaponSlotIds()
    if (ids.length === 0) {
      toast('背包里没有可切换的武器', 'info', 1.6)
      return
    }
    const order = dir > 0 ? ids : [...ids].reverse()
    const cur = this.weapons.weaponId
    const start = order.indexOf(cur)
    // 从当前位置往后找第一把能装的武器；装不了就跳过，别卡在不可用武器上
    let lastReason = ''
    for (let step = 1; step <= order.length; step++) {
      const idx = start < 0 ? step - 1 : (start + step) % order.length
      const id = order[idx]
      const res = this.weapons.equip(id)
      if (res?.ok) {
        this.syncWeaponState()
        toast(`武器：${Content.get(KIND.ITEM, id)?.name || id}`, 'info', 1.4)
        return
      }
      lastReason = res?.reason || lastReason
    }
    toast(lastReason || '没有装得上的武器', 'warn', 2)
  }

  // ================================================================ 门 / 转场
  checkExit() {
    if (this.transitioning || !this.robot) return
    const b = this.robot.body
    const exits = this.room.data.exits || {}
    if (b.x + b.w < 56 && exits.left) this.beginTransition(exits.left, 'right')
    else if (b.x > this.roomW - 56 && exits.right) this.beginTransition(exits.right, 'left')
  }

  beginTransition(target, entry) {
    this.transitioning = true
    this.trans = { t: 0, stage: 'out', target, entry }
    G.phase = 'transition'
    G.fade = 0
    this.sfx('door', { vol: 0.5 })
  }

  beginCycleTransition() {
    this.transitioning = true
    this.trans = {
      t: 0,
      stage: 'out',
      target: { regionId: this.lastShelter.regionId, roomId: this.lastShelter.roomId },
      entry: 'shelter',
      after: 'playing',
    }
    G.phase = 'transition'
    G.fade = 0
  }

  updateTransition(dt) {
    const tr = this.trans
    if (!tr) {
      G.phase = 'playing'
      this.transitioning = false
      return
    }
    tr.t += dt
    if (tr.stage === 'out') {
      G.fade = clamp(tr.t / 0.26, 0, 1)
      if (tr.t >= 0.28) {
        if (typeof tr.target === 'string') {
          this.loadRoom(this.regionId, tr.target, tr.entry)
        } else if (tr.target?.regionId) {
          this.loadRoom(tr.target.regionId, tr.target.roomId, tr.entry)
        }
        tr.stage = 'in'
        tr.t = 0
      }
    } else {
      G.fade = clamp(1 - tr.t / 0.34, 0, 1)
      if (tr.t >= 0.36) {
        G.fade = 0
        G.phase = tr.after || 'playing'
        this.transitioning = false
        this.trans = null
        if (this.robot) this.robot.invuln = 0.8
      }
    }
  }

  // ================================================================ 生死 / 循环
  die(reason) {
    if (G.phase !== 'playing' && G.phase !== 'transition') return
    if (!this.robot) return
    // 测试选项：无敌 —— 不死，回满血并送回出生点
    if (G.settings?.godMode) {
      G.hp = G.hpMax
      G.exposed = 0
      G.shelterProgress = 0
      this.robot.invuln = 1
      this.placeRobot?.()
      return
    }
    this.robot.dead = true
    G.phase = 'dead'
    G.deathReason = reason
    G.stats.deaths++
    G.exposed = 0
    G.shelterProgress = 0
    G.flash = 0.8
    this.cameraShake(1)
    this.sfx('death', { vol: 0.9 })
    audio.setRain(0.1)
    audio.setDanger(0)
    this.particles.emitMany('blood', this.robot.centerX, this.robot.centerY, 22)
    this.saveGame()
  }

  hibernate() {
    if (G.phase !== 'playing') return
    const ok = G.power >= NEED_POWER
    const signalBefore = G.signal
    if (ok) {
      G.signal = Math.min(G.signalMax, G.signal + 1)
      G.stats.cyclesSurvived++
    } else {
      G.signal = Math.max(1, G.signal - 1)
    }
    G.power = Math.max(0, G.power - NEED_POWER)
    G.result = {
      ok,
      signalBefore,
      signalAfter: G.signal,
      cycle: G.cycle,
      rescued: Object.values(G.companions).filter((c) => c?.rescued).length,
    }
    G.phase = 'hibernate'
    G.shelterProgress = 0
    this.lastShelter = { regionId: this.regionId, roomId: this.roomId }
    this.saveGame()
    this.sfx('hibernate', { vol: 0.85 })
    audio.setRain(0.03)
    audio.setDanger(0)
    G.weatherIntensity = 0
    this.weather.setPhase('calm')
  }

  nextCycle() {
    G.cycle++
    if (this.robot) {
      this.robot.dead = false
      this.robot.heal(this.robot.stats.hp)
    }
    this.beginCycleState()
    this.beginCycleTransition()
    this.sfx('wake', { vol: 0.6 })
  }

  beginCycleState() {
    G.timeLeft = CYCLE_TIME
    G.cycleTotal = CYCLE_TIME
    G.weatherPhase = 'calm'
    G.weatherIntensity = 0.03
    G.exposed = 0
    G.shelterProgress = 0
    G.sheltered = false
    G.flash = 0
    this.weather.setPhase('calm')
    this.hintShelter = false
    this.hintFull = false
    audio.setRain(0.03)
    audio.startAmbience()
    if (this.robot) this.robot.invuln = 1.5
    toast(`第 ${G.cycle} 个循环 · 攒够 ${NEED_POWER} 格电量后回避难所待机`, 'info', 4)
  }

  retryAfterDeath() {
    G.signal = Math.max(1, G.signal - 1)
    G.power = 0
    G.cycle++
    if (this.robot) {
      this.robot.dead = false
      G.hp = this.robot.stats.hp
    }
    this.beginCycleState()
    this.beginCycleTransition()
  }

  // ================================================================ 对话效果 / 任务奖励
  applyDialogueEffect(effect) {
    if (!effect) return
    switch (effect.type) {
      case 'giveItem': {
        if (!this.inventory) return
        if (!this.inventory.canAdd(effect.id, effect.n || 1)) {
          toast('背包满了，物品掉在地上', 'warn', 2.4)
          this.dropLoot(effect.id, this.robot.centerX, this.robot.centerY, { n: effect.n || 1 })
        } else {
          this.inventory.add(effect.id, effect.n || 1)
          notify(`获得 ${Content.get(KIND.ITEM, effect.id)?.name || effect.id} ×${effect.n || 1}`, 'loot', 2.4)
        }
        break
      }
      case 'takeItem':
        this.inventory?.remove(effect.id, effect.n || 1)
        break
      case 'startQuest':
        this.quests?.start(effect.id)
        break
      case 'completeQuest':
        this.quests?.complete?.(effect.id)
        break
      case 'unlockChassis':
        this.unlockChassis(effect.id)
        break
      case 'setFlag':
        G.flags[effect.flag || effect.id] = effect.value ?? true
        break
      case 'addSignal':
        G.signal = Math.min(G.signalMax, G.signal + (effect.n || 1))
        break
      case 'heal':
        this.robot?.heal(effect.n || 20)
        break
      case 'archive': {
        const def = Content.get(KIND.ITEM, effect.id)
        if (def) this.addArchive(effect.id, def)
        break
      }
      case 'notify':
        notify(effect.text || '', effect.kind || 'info', 3)
        break
      case 'endDialogue':
        this.dialogue?.close()
        break
      default:
        break
    }
  }

  grantQuestRewards(def) {
    if (!def) return
    const rw = def.rewards || {}
    for (const it of rw.items || []) {
      const n = it.n || 1
      if (this.inventory.canAdd(it.id, n)) this.inventory.add(it.id, n)
      else this.dropLoot(it.id, this.robot.centerX, this.robot.centerY, { n })
    }
    if (rw.signal) G.signal = Math.min(G.signalMax, G.signal + rw.signal)
    for (const id of rw.unlockChassis || []) this.unlockChassis(id)
    if (rw.flag) G.flags[rw.flag] = true
    notify(`任务完成：${def.title}`, 'quest', 4)
    this.sfx('hibernate', { vol: 0.5 })
    this.saveGame()
  }

  unlockChassis(id) {
    if (G.chassisUnlocked.includes(id)) return
    G.chassisUnlocked.push(id)
    notify(`机体解锁：${getChassis(id)?.name || id}（按 Q 切换）`, 'quest', 5)
    this.saveGame()
  }

  markArchiveRead(id) {
    if (!G.archive.entries.includes(id)) return
    G.archive.unread = Math.max(0, G.archive.unread - 1)
  }

  // ================================================================ 面板 / 流程
  startNewGame(chassisId = 'unit7') {
    if (this.bootError) {
      toast(this.bootError, 'danger', 5)
      return
    }
    this.audioUnlock()
    resetState()
    clearToast()
    initGrowth()
    G.chassisId = chassisId
    G.chassisUnlocked = this.computeUnlockedChassis()
    G.phase = 'playing'
    G.showHud = true
    G.cycle = 1
    G.signal = 2
    G.power = 0
    G.hp = 100
    G.energy = 60
    this.lastShelter = { regionId: 'city', roomId: 'city_shelter' }
    this.roomCache.clear()
    this.terrainEdits = loadTerrainEdits()
    if (!this.inventory) this.setupSystems()
    this.inventory.clear()
    if (this.quests) {
      this.quests.load?.({ active: [], completed: [], progress: {} })
      this.quests.start('main_signal')
      this.quests.start('side_oil')
    }
    G.companions = {}
    G.archive.entries = []
    G.archive.unread = 0
    G.flags = {}
    G.bestiary = {}
    G.stats = { deaths: 0, kills: 0, looted: 0, cyclesSurvived: 0, roomsExplored: 0, distance: 0 }
    try {
      this.loadRoom('city', 'city_shelter', 'shelter')
    } catch (e) {
      console.error(e)
      toast('世界数据缺失，无法开始游戏', 'danger', 5)
      return
    }
    this.beginCycleState()
    G.phase = 'playing'
    this.robot.refreshStats()
    G.hp = this.robot.stats.hp
    G.energy = this.robot.stats.energyMax
    this.autoEquipStarter()
    this.weapons?.reset?.()
    this.saveGame()
    this.sfx('wake', { vol: 0.6 })
    Events.emit('game:start', { chassisId })
  }

  autoEquipStarter() {
    if (!this.inventory) return
    this.inventory.add('cell_small', 2)
    this.inventory.add('repair_kit', 1)
    this.inventory.add('lubricant', 1)
  }

  continueGame() {
    const save = loadSave()
    if (!save) return this.startNewGame()
    this.audioUnlock()
    resetState()
    G.hasSave = true
    G.phase = 'playing'
    G.showHud = true
    if (!this.inventory) this.setupSystems()
    G.cycle = save.cycle || 1
    G.signal = save.signal || 2
    G.power = save.power || 0
    G.energy = save.energy || 60
    G.chassisId = save.chassisId || 'unit7'
    G.chassisUnlocked = [...new Set([...this.computeUnlockedChassis(), ...(save.chassisUnlocked || [])])]
    G.toolId = save.toolId || 'shovel'
    this.inventory.load(save.inventory || {})
    if (this.inventory.equipped && save.equipped) this.inventory.equipped = save.equipped
    G.companions = save.companions || {}
    G.archive.entries = save.archive?.entries || []
    G.archive.unread = save.archive?.unread || 0
    G.flags = save.flags || {}
    G.bestiary = save.bestiary || {}
    G.stats = save.stats || G.stats
    initGrowth()
    if (save.growth && typeof save.growth === 'object') {
      for (const k of Object.keys(save.growth)) {
        if (k === 'perks') G.growth.perks = { ...(G.growth.perks || {}), ...(save.growth.perks || {}) }
        else if (k in G.growth) G.growth[k] = save.growth[k]
      }
    }
    G.buffs = Array.isArray(save.buffs)
      ? save.buffs.filter((b) => b && b.key && Number(b.t) > 0).map((b) => ({ ...b }))
      : []
    G.timeLeft = save.timeLeft ?? CYCLE_TIME
    G.cycleTotal = CYCLE_TIME
    if (save.settings) Object.assign(G.settings, save.settings)
    this.applySettings()
    this.dayNight?.load?.(save.dayNight)
    this.war?.load?.(save.war)
    this.quests?.load?.(save.quests || {})
    this.rescue?.load?.(save.rescue || {})
    this.lastShelter = save.lastShelter || { regionId: 'city', roomId: 'city_shelter' }
    this.roomCache.clear()
    this.terrainEdits = loadTerrainEdits()
    const regionId = save.regionId || this.lastShelter.regionId
    const roomId = save.roomId || this.lastShelter.roomId
    try {
      this.loadRoom(regionId, roomId, 'shelter')
    } catch (e) {
      console.error(e)
      this.loadRoom('city', 'city_shelter', 'shelter')
    }
    if (this.robot) {
      this.robot.dead = false
      this.robot.refreshStats()
    }
    G.hp = Math.min(save.hp || this.robot?.stats?.hp || 100, this.robot?.stats?.hp || 100)
    this.syncInventoryState()
    this.sfx('wake', { vol: 0.6 })
  }

  pause() {
    if (G.phase !== 'playing') return
    G.phase = 'paused'
    this.sfx('uiClick')
  }
  resume() {
    if (G.phase !== 'paused' && !G.ui.panel) return
    G.phase = 'playing'
    closePanel()
    this.sfx('uiClick')
  }

  quitToTitle() {
    G.phase = 'title'
    G.showHud = false
    G.ui.panel = null
    G.fade = 0
    G.dialogue.active = false
    if (this.robot) this.robot.dead = false
    this.roomCache.clear()
    this.buildTitleScene()
    this.weather.setPhase('calm')
    this.sfx('uiClick')
  }

  restartRun() {
    clearSave()
    this.terrainEdits = {}
    writeTerrainEdits({})
    this.roomCache.clear()
    G.hasSave = false
    this.startNewGame(G.chassisId || 'unit7')
  }

  async audioUnlock() {
    try {
      await audio.unlock()
      audio.setVolume(G.volume)
      audio.setMuted(G.muted)
      audio.startAmbience()
    } catch (e) {
      /* ignore */
    }
  }

  toggleMute() {
    G.muted = !G.muted
    audio.setMuted(G.muted)
    saveSettings({ muted: G.muted })
    this.sfx('uiClick')
  }

  setVolume(v) {
    G.volume = clamp(v, 0, 1)
    audio.setVolume(G.volume)
    saveSettings({ volume: G.volume })
  }

  installMod() {
    toast('把 mod 目录放进 public/mods/，刷新页面自动加载', 'info', 4)
  }

  setModEnabled(id, on) {
    persistModEnabled(id, on)
    toast(`${on ? '启用' : '禁用'} ${id} —— 刷新后生效`, 'info', 3)
    G.mods.list = this.mods.summary()
  }

  sfx(name, opts = {}) {
    try {
      audio.play(SFX_MAP[name] || name, opts)
    } catch (e) {
      /* ignore */
    }
  }

  // ================================================================ 存档
  saveGame() {
    if (!this.robot) return
    const data = {
      version: 1,
      cycle: G.cycle,
      signal: G.signal,
      power: G.power,
      hp: G.hp,
      energy: G.energy,
      timeLeft: G.timeLeft,
      chassisId: G.chassisId,
      chassisUnlocked: G.chassisUnlocked,
      toolId: G.toolId,
      regionId: this.regionId,
      roomId: this.roomId,
      lastShelter: this.lastShelter,
      inventory: this.inventory?.serialize?.() || {},
      equipped: this.inventory?.equipped || {},
      quests: this.quests?.serialize?.() || {},
      companions: G.companions,
      archive: { entries: G.archive.entries, unread: G.archive.unread },
      flags: G.flags,
      bestiary: G.bestiary,
      stats: G.stats,
      growth: JSON.parse(JSON.stringify(G.growth || {})),
      buffs: (G.buffs || []).map((b) => ({ ...b })),
      rescue: this.rescue?.serialize?.() || {},
      dayNight: this.dayNight?.serialize?.() || null,
      war: this.war?.serialize?.() || null,
      settings: { ...G.settings },
      mods: getModEnabledMap(),
    }
    G.hasSave = true
    G.saveInfo = this.describeSave(data)
    const ok = writeSave(data)
    this.persistTerrainEdits()
    Events.emit(EV.SAVE_WRITTEN, { ok })
    return ok
  }

  persistTerrainEdits() {
    const out = {}
    for (const [key, data] of this.roomCache) {
      if (!data.map?.dirty?.size) continue
      const edit = {}
      for (const tile of data.map.dirty) {
        const [tx, ty] = tile.split(',').map(Number)
        edit[tile] = data.map.get(tx, ty)
      }
      if (Object.keys(edit).length) out[key] = edit
    }
    this.terrainEdits = { ...this.terrainEdits, ...out }
    writeTerrainEdits(this.terrainEdits)
  }

  /**
   * 房间编辑器热补丁：编辑器改了某格地形后立刻生效，
   * 不用等下次进房（同时写回 localStorage，避免存档时把编辑器的改动覆盖掉）。
   */
  applyTerrainPatch(detail) {
    if (!detail?.key || !detail.tiles) return
    if (detail.clear) {
      delete this.terrainEdits[detail.key]
      writeTerrainEdits(this.terrainEdits)
      this.roomCache.delete(detail.key)
      return
    }
    const edit = { ...(this.terrainEdits[detail.key] || {}), ...detail.tiles }
    this.terrainEdits[detail.key] = edit
    writeTerrainEdits(this.terrainEdits)
    const cached = this.roomCache.get(detail.key)
    if (!cached?.map) return
    for (const [tile, type] of Object.entries(detail.tiles)) {
      const [tx, ty] = tile.split(',').map(Number)
      cached.map.set(tx, ty, type)
    }
  }

  // ================================================================ 扫描特效
  scanPulseFx(x, y) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8fe8ff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(10, 16, 28), mat)
    mesh.position.set(x, -y, 6)
    this.scene.add(mesh)
    this.scanFx.push({ mesh, t: 0, mat })
    this.sfx('scan', { vol: 0.5 })
  }

  updateScanFx(dt) {
    for (let i = this.scanFx.length - 1; i >= 0; i--) {
      const s = this.scanFx[i]
      s.t += dt
      s.mesh.scale.setScalar(1 + s.t * 12)
      s.mat.opacity = Math.max(0, 0.6 - s.t * 1.2)
      if (s.t > 0.9) {
        this.scene.remove(s.mesh)
        s.mesh.geometry.dispose()
        s.mat.dispose()
        this.scanFx.splice(i, 1)
      }
    }
  }

  get player() {
    return this.robot
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('rustfall:terrain-patch', this._onTerrainPatch)
    this.input.detach()
    if (this.room) {
      this.room.dispose()
      this.room = null
    }
    if (this.robot) {
      this.scene.remove(this.robot.group)
      this.robot.dispose()
      this.robot = null
    }
    this.weather.dispose()
    this.particles.dispose()
    this.postfx?.dispose?.()
    audio.stopAmbience()
    try {
      audio.setRain(0)
    } catch (e) {
      /* ignore */
    }
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
    if (window.__rustfall === this) window.__rustfall = null
  }
}
