// QuestSystem —— 任务运行时
//
// 职责：
//   · 管理任务生命周期（start / 进度推进 / 自动完成 / 失败 / next 接续）
//   · 把进度、激活列表、完成列表写进 G.quests，UI 直接读，不需要再算一遍
//   · 提供唯一入口 notify(type, payload)，由游戏层在拾取、击杀、进门、对话、修复、营救时调用
//   · 所有目标类型都实现：collect / kill / reach / talk / repair / rescue / deliver / survive / inspect
//
// 设计约定：
//   · 进度只增不减，上限为 objective.count；全部达标即自动 complete。
//   · complete() 优先调用 game.grantQuestRewards(def)（由主游戏统一发奖）；
//     若主游戏没有实现该方法，则用内置兜底逻辑发奖，保证任务链在集成前也能跑通。
//   · deliver 需要显式交付（对话里的 {type:'deliver'}），不会因为背包里攒够了就自动完成。
//   · collect / inspect 类目标在任务开始时会对背包与档案做一次存量扫描，
//     这样「先捡到东西后接任务」也能正确计数，也不会因为物品后来被交出去而卡死。
//   · 未知目标类型只告警一次，不抛错——mod 写错类型不应该让整局游戏停下来。

import { Content, KIND } from '../core/registry.js'
import { Events, EV } from '../core/events.js'
import { G, toast, notify as pushNotify } from '../state.js'

// 规范化 notify 的类型别名：游戏层可能用更口语化的名字调用
const TYPE_ALIAS = Object.freeze({
  item: 'collect',
  items: 'collect',
  pickup: 'collect',
  loot: 'collect',
  itemPickup: 'collect',
  monster: 'kill',
  monsterKilled: 'kill',
  killMonster: 'kill',
  combat: 'kill',
  room: 'reach',
  enterRoom: 'reach',
  visit: 'reach',
  place: 'reach',
  npc: 'talk',
  dialog: 'talk',
  dialogue: 'talk',
  speech: 'talk',
  landmark: 'repair',
  repairLandmark: 'repair',
  fix: 'repair',
  cage: 'rescue',
  rescueCage: 'rescue',
  handIn: 'deliver',
  give: 'deliver',
  scan: 'inspect',
  examine: 'inspect',
})

// 合法的目标类型（用于数据自检与告警）
export const OBJECTIVE_TYPES = Object.freeze([
  'collect',
  'kill',
  'reach',
  'talk',
  'repair',
  'rescue',
  'deliver',
  'survive',
  'inspect',
])

const TYPE_LABEL = {
  collect: '收集',
  kill: '击杀',
  reach: '抵达',
  talk: '对话',
  repair: '修复',
  rescue: '营救',
  deliver: '交付',
  survive: '生存',
  inspect: '查看',
}

/** 归一化 notify 类型；未知类型原样返回，交由 canObjective 判定 */
export function canonicalType(type) {
  if (!type) return ''
  return TYPE_ALIAS[type] || type
}

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export class QuestSystem {
  constructor(game) {
    /** 主游戏实例（可为 null，纯数据自检时用） */
    this.game = game || null
    /** 已告警过的未知类型，避免刷屏 */
    this._warned = new Set()
    /** 事件绑定解绑函数集合 */
    this._unbind = []
    this._ensureState()
  }

  // ---------------------------------------------------------------- 状态

  _ensureState() {
    if (!G.quests || typeof G.quests !== 'object') {
      G.quests = { active: [], completed: [], tracked: null, logOpen: false }
    }
    if (!Array.isArray(G.quests.active)) G.quests.active = []
    if (!Array.isArray(G.quests.completed)) G.quests.completed = []
    if (G.quests.tracked === undefined) G.quests.tracked = null
    if (!G.flags || typeof G.flags !== 'object') G.flags = {}
  }

  /** 取任务定义 */
  def(questId) {
    return Content.get(KIND.QUEST, questId)
  }

  /** 取 G.quests.active 里的条目 */
  entry(questId) {
    return G.quests.active.find((e) => e && e.id === questId) || null
  }

  isActive(questId) {
    return !!this.entry(questId)
  }

  isCompleted(questId) {
    return G.quests.completed.includes(questId)
  }

  /** 供 UI：激活中的任务详情（带 def） */
  active() {
    const out = []
    for (const entry of G.quests.active) {
      const def = this.def(entry.id)
      if (!def) continue
      out.push({
        id: entry.id,
        def,
        progress: entry.progress || {},
        startedAt: entry.startedAt || 0,
        done: !!entry.done,
        tracked: G.quests.tracked === entry.id,
        percent: this.percentOf(entry.id),
      })
    }
    return out
  }

  completedList() {
    return G.quests.completed.slice()
  }

  /** 已完成任务的定义列表（结局回顾 / 成就面板用） */
  completedDefs() {
    return G.quests.completed.map((id) => this.def(id)).filter(Boolean)
  }

  /** 目标完成度百分比（0~100，整数） */
  percentOf(questId) {
    const def = this.def(questId)
    const entry = this.entry(questId)
    if (!def || !entry) return this.isCompleted(questId) ? 100 : 0
    const objs = def.objectives || []
    if (!objs.length) return 0
    let sum = 0
    for (const obj of objs) {
      const cur = num(entry.progress?.[obj.id])
      const need = Math.max(1, num(obj.count, 1))
      sum += Math.min(1, cur / need)
    }
    return Math.round((sum / objs.length) * 100)
  }

  progressOf(questId) {
    return this.entry(questId)?.progress || null
  }

  objectiveDone(questId, objectiveId) {
    const def = this.def(questId)
    const entry = this.entry(questId)
    if (!def) return this.isCompleted(questId)
    if (!entry) return this.isCompleted(questId)
    const obj = (def.objectives || []).find((o) => o.id === objectiveId)
    if (!obj) return false
    return num(entry.progress?.[objectiveId]) >= Math.max(1, num(obj.count, 1))
  }

  /** 某任务的全部目标是否都达标（对话 require.objectives 会用到） */
  allObjectivesDone(questId, objectiveIds) {
    const def = this.def(questId)
    if (!def) return false
    if (this.isCompleted(questId)) return true
    const ids = objectiveIds && objectiveIds.length
      ? objectiveIds
      : (def.objectives || []).map((o) => o.id)
    return ids.every((id) => this.objectiveDone(questId, id))
  }

  // ---------------------------------------------------------------- 开/完/败

  /**
   * 开始一个任务。
   * 已激活 / 已完成（且不可重复）/ 不存在 → false
   */
  start(questId) {
    const def = this.def(questId)
    if (!def) {
      this._warnOnce(`missing-quest:${questId}`, `任务不存在：${questId}`)
      return false
    }
    if (this.isActive(questId)) return false
    if (this.isCompleted(questId)) {
      // 可重复任务允许再次接取：从完成列表里摘出来，重新开一轮
      if (!def.repeatable) return false
      const i = G.quests.completed.indexOf(questId)
      if (i >= 0) G.quests.completed.splice(i, 1)
    }

    const progress = {}
    for (const obj of def.objectives || []) {
      progress[obj.id] = 0
      // 数据自检：类型与必填字段
      if (!OBJECTIVE_TYPES.includes(obj.type)) {
        this._warnOnce(`bad-type:${questId}:${obj.id}`, `任务 ${questId} 的目标 ${obj.id} 类型未知：${obj.type}`)
      }
    }

    G.quests.active.push({
      id: questId,
      // 冗余一份轻量快照：UI 直接读 G.quests.active 就能渲染，不必再查注册表
      title: def.title,
      type: def.type,
      giver: def.giver || '',
      progress,
      startedAt: num(G.cycle, 1),
      done: false,
    })
    if (!G.quests.tracked) G.quests.tracked = questId

    // 先广播「已开始」，再做存量扫描——扫描有可能直接完成整个任务
    Events.emit(EV.QUEST_STARTED, {
      questId,
      id: questId,
      title: def.title,
      type: def.type,
      def,
    })
    toast(`接受任务：${def.title}`, 'info', 2.8)
    pushNotify(`新任务 · ${def.title}`, 'quest', 3.6)

    // 存量扫描：先捡到东西、后接任务的情况
    this._scanInventory(questId)

    this._emitChanged()
    return true
  }

  /**
   * 完成任务并结算奖励。
   * 不要求目标全部达标——对话 / 脚本可以强制完成（例如结局）。
   */
  complete(questId) {
    const def = this.def(questId)
    if (!def) {
      this._warnOnce(`complete-missing:${questId}`, `无法完成不存在的任务：${questId}`)
      return false
    }
    const idx = G.quests.active.findIndex((e) => e && e.id === questId)
    let wasActive = idx >= 0
    if (!wasActive && this.isCompleted(questId)) return false
    if (wasActive) {
      G.quests.active[idx].done = true
      G.quests.active.splice(idx, 1)
    }
    if (!G.quests.completed.includes(questId)) G.quests.completed.push(questId)
    if (G.quests.tracked === questId) {
      G.quests.tracked = G.quests.active[0]?.id || null
    }

    const rewards = def.rewards || {}
    this._grant(def, rewards)

    Events.emit(EV.QUEST_COMPLETED, {
      questId,
      id: questId,
      title: def.title,
      type: def.type,
      rewards,
      def,
      forced: !wasActive,
    })
    toast(`任务完成：${def.title}`, 'good', 3.4)
    pushNotify(`已完成 · ${def.title}`, 'good', 4)
    this._emitChanged()

    // next 自动接续（或提示可接续）
    if (def.next) this._chain(questId, def.next)
    return true
  }

  fail(questId, reason = '') {
    const def = this.def(questId)
    const idx = G.quests.active.findIndex((e) => e && e.id === questId)
    if (idx < 0) return false
    G.quests.active.splice(idx, 1)
    if (G.quests.tracked === questId) {
      G.quests.tracked = G.quests.active[0]?.id || null
    }
    Events.emit(EV.QUEST_FAILED, { questId, id: questId, title: def?.title || questId, reason })
    toast(`任务失败：${def?.title || questId}`, 'danger', 3.4)
    this._emitChanged()
    return true
  }

  /** 任务接续：next 有效且未开始、未完成时自动开始 */
  _chain(fromId, nextId) {
    const nextDef = this.def(nextId)
    if (!nextDef) {
      this._warnOnce(`bad-next:${fromId}:${nextId}`, `任务 ${fromId} 的 next 指向不存在的任务：${nextId}`)
      return false
    }
    if (this.isCompleted(nextId) || this.isActive(nextId)) return false
    const started = this.start(nextId)
    if (started) {
      Events.emit(EV.QUEST_PROGRESS, { reason: 'chain', from: fromId, to: nextId })
      pushNotify(`任务接续 · ${nextDef.title}`, 'info', 4)
    }
    return started
  }

  // ---------------------------------------------------------------- 进度

  /**
   * 统一进度入口。
   * @param {string} type 事件类型（可用别名，如 item / monster / room / npc / landmark）
   * @param {object} payload 载荷，按类型取字段：
   *   collect/deliver/inspect → { itemId, n? }
   *   kill                   → { monsterId, n? }
   *   reach                  → { roomId }
   *   talk                   → { npcId }
   *   repair                 → { landmarkId }
   *   rescue                 → { rescueId | questId | companionId }
   *   survive                → { n }
   * @returns {number} 本次推进了的目标数量
   */
  notify(type, payload = {}) {
    if (!type) return 0
    const canonical = canonicalType(type)
    const p = payload && typeof payload === 'object' ? payload : {}
    let touched = 0

    // 拷贝一份：complete() 会修改 active 数组
    for (const entry of G.quests.active.slice()) {
      const def = this.def(entry.id)
      if (!def) continue
      let changed = false

      for (const obj of def.objectives || []) {
        if (!this._typeMatches(obj, canonical, type)) continue
        if (!this.canObjective(obj, p, canonical)) continue
        const gained = this._gain(obj, p)
        if (gained <= 0) continue
        const need = Math.max(1, num(obj.count, 1))
        const cur = num(entry.progress?.[obj.id])
        if (cur >= need) continue
        const next = Math.min(need, cur + gained)
        entry.progress[obj.id] = next
        changed = true
        touched++
        this._emitProgress(entry, def, obj, next, need)
      }

      if (changed && !entry.done && this._allDone(def, entry)) {
        this.complete(entry.id)
      }
    }
    return touched
  }

  /** 判断某个 payload 是否能推进某个目标（供调试与外部预览） */
  canObjective(obj, payload, type) {
    if (!obj || !obj.type) return false
    const p = payload || {}
    switch (obj.type) {
      case 'collect':
        return p.itemId === obj.target || p.id === obj.target
      case 'deliver':
        if (p.itemId !== obj.target && p.id !== obj.target) return false
        // 目标指定了 npc 时必须交给正确的对象
        if (obj.npc && p.npcId && p.npcId !== obj.npc) return false
        return true
      case 'kill':
        return p.monsterId === obj.target || p.id === obj.target || p.def?.id === obj.target
      case 'reach':
        return p.roomId === obj.target || p.id === obj.target
      case 'talk':
        return p.npcId === obj.target || p.id === obj.target
      case 'repair':
        return p.landmarkId === obj.target || p.id === obj.target
      case 'rescue':
        return (
          p.rescueId === obj.target ||
          p.questId === obj.target ||
          p.companionId === obj.target ||
          p.id === obj.target
        )
      case 'inspect':
        return p.itemId === obj.target || p.landmarkId === obj.target || p.id === obj.target
      case 'survive':
        // survive 由 update(dt) 推进，notify('survive', {n}) 可手动加时
        return true
      default:
        this._warnOnce(
          `unknown-obj-type:${obj.type}`,
          `未实现的目标类型：${obj.type}（目标 ${obj.id}）。该目标会被忽略，不影响其它目标。`,
        )
        return false
    }
  }

  /** 目标类型与 notify 类型是否匹配（两种写法都接受 obj.type 或事件类型） */
  _typeMatches(obj, canonical, rawType) {
    if (obj.type === canonical) return true
    // 兼容：任务里写 'repair'，游戏层却直接 notify('landmark') 的情况已在 canonical 里归一
    // 这里再保险一次：rawType 恰好等于 obj.type 也放行
    if (rawType && obj.type === rawType) return true
    return false
  }

  _gain(obj, payload) {
    const p = payload || {}
    if (obj.type === 'reach' || obj.type === 'talk' || obj.type === 'repair' || obj.type === 'rescue') {
      return 1
    }
    if (obj.type === 'deliver') {
      // 一次交付 4 份润滑油只产生一个 deliver 事件，所以这里要认 payload.n
      return Math.max(1, num(p.n ?? 1, 1))
    }
    if (obj.type === 'survive') {
      const n = num(p.n ?? p.seconds ?? p.dt, 0)
      return n > 0 ? n : 0
    }
    const raw = p.n ?? p.count ?? p.amount ?? 1
    const n = num(raw, 1)
    return n > 0 ? n : 0
  }

  _allDone(def, entry) {
    const objs = def.objectives || []
    if (!objs.length) return true
    for (const obj of objs) {
      const need = Math.max(1, num(obj.count, 1))
      const cur = num(entry.progress?.[obj.id])
      if (cur < need) return false
    }
    return true
  }

  _emitProgress(entry, def, obj, current, need) {
    const payload = {
      questId: entry.id,
      objectiveId: obj.id,
      type: obj.type,
      target: obj.target,
      label: obj.label,
      progress: current,
      count: need,
      percent: Math.round((current / need) * 100),
      def,
    }
    Events.emit(EV.QUEST_PROGRESS, payload)
    // 只在达成时提示，避免刷屏；UI 有进度条自己会更新
    if (current >= need) {
      toast(`目标完成：${obj.label || obj.id}`, 'good', 2.2)
    }
  }

  // ---------------------------------------------------------------- 奖励

  _grant(def, rewards) {
    const game = this.game
    if (game && typeof game.grantQuestRewards === 'function') {
      try {
        game.grantQuestRewards(def)
        // 主游戏负责发奖时不再兜底，避免双发
        this._grantFlags(rewards)
        return
      } catch (err) {
        console.error('[quest] game.grantQuestRewards 失败，改用内置发奖', err)
      }
    }
    this._grantFallback(rewards)
  }

  _grantFallback(rewards) {
    const rw = rewards || {}
    if (Array.isArray(rw.items)) {
      for (const it of rw.items) {
        if (!it || !it.id) continue
        this._addItem(it.id, Math.max(1, num(it.n, 1)))
      }
    }
    if (rw.signal) {
      const before = num(G.signal)
      G.signal = Math.min(num(G.signalMax, 5), before + num(rw.signal))
      if (G.signal !== before) {
        Events.emit(EV.SIGNAL_CHANGED, { value: G.signal, delta: G.signal - before })
        toast(`信号强度 +${G.signal - before}`, 'good', 2.4)
      }
    }
    if (rw.unlockChassis) {
      const list = Array.isArray(rw.unlockChassis) ? rw.unlockChassis : [rw.unlockChassis]
      for (const cid of list) {
        if (!cid || !Array.isArray(G.chassisUnlocked)) continue
        if (G.chassisUnlocked.includes(cid)) continue
        G.chassisUnlocked.push(cid)
        const cdef = Content.get(KIND.CHASSIS, cid)
        pushNotify(`机体解锁 · ${cdef?.name || cid}`, 'good', 5)
        Events.emit(EV.CHASSIS_SWITCH, { unlocked: cid })
      }
    }
    this._grantFlags(rw)
  }

  _grantFlags(rewards) {
    const flag = rewards?.flag
    if (typeof flag === 'string' && flag) {
      G.flags[flag] = true
      Events.emit(EV.FLAG_SET, { flag, value: true })
    }
  }

  /** 发物品：优先走主游戏 / 背包模块，最后兜底写 G.inventory.slots */
  _addItem(itemId, n = 1) {
    const game = this.game
    if (game) {
      if (typeof game.addItem === 'function') {
        try {
          if (game.addItem(itemId, n) !== false) return true
        } catch (err) {
          console.warn('[quest] game.addItem 失败', err)
        }
      }
      const inv = game.inventory
      if (inv && typeof inv.add === 'function') {
        try {
          if (inv.add(itemId, n) !== false) return true
        } catch (err) {
          console.warn('[quest] inventory.add 失败', err)
        }
      }
    }
    const slots = G.inventory?.slots
    if (Array.isArray(slots)) {
      const stack = slots.find((s) => s && (s.id === itemId || s.itemId === itemId))
      if (stack) {
        stack.n = num(stack.n ?? stack.count ?? 1) + n
      } else {
        slots.push({ id: itemId, n })
      }
      Events.emit(EV.ITEM_ADDED, { itemId, n })
      Events.emit(EV.INVENTORY_CHANGED, { reason: 'quest-reward', itemId, n })
      return true
    }
    this._warnOnce('no-inventory', '没有可用的背包接口，任务奖励物品无法发放')
    return false
  }

  // ---------------------------------------------------------------- 存量扫描

  /**
   * 开始任务时扫描背包与档案，给 collect / inspect 目标补进度。
   * （inspect 也算：物品被归档过，就等于被「看过」。）
   */
  _scanInventory(questId) {
    const def = this.def(questId)
    const entry = this.entry(questId)
    if (!def || !entry) return
    for (const obj of def.objectives || []) {
      if (obj.type !== 'collect' && obj.type !== 'inspect') continue
      if (!obj.target) continue
      const have = this._countItem(obj.target) + this._countArchive(obj.target)
      if (have <= 0) continue
      const need = Math.max(1, num(obj.count, 1))
      const next = Math.min(need, have)
      if (next > num(entry.progress[obj.id])) {
        entry.progress[obj.id] = next
        this._emitProgress(entry, def, obj, next, need)
      }
    }
    if (this._allDone(def, entry)) this.complete(questId)
  }

  /** 统计背包内某物品数量（兼容多种背包数据结构） */
  _countItem(itemId) {
    const game = this.game
    if (game) {
      if (typeof game.countItem === 'function') {
        try {
          const n = num(game.countItem(itemId), -1)
          if (n >= 0) return n
        } catch (e) {
          /* ignore */
        }
      }
      if (typeof game.hasItem === 'function') {
        try {
          // hasItem 只给布尔值的实现很常见，退化成 1
          if (game.hasItem(itemId)) {
            const inv = game.inventory
            const n = inv && typeof inv.count === 'function' ? num(inv.count(itemId), 0) : 0
            return n > 0 ? n : 1
          }
        } catch (e) {
          /* ignore */
        }
      }
      const inv = game.inventory
      if (inv && typeof inv.count === 'function') {
        try {
          return num(inv.count(itemId), 0)
        } catch (e) {
          /* ignore */
        }
      }
    }
    const slots = G.inventory?.slots
    if (!Array.isArray(slots)) return 0
    let total = 0
    for (const s of slots) {
      if (!s) continue
      const sid = typeof s === 'string' ? s : s.id || s.itemId
      if (sid !== itemId) continue
      total += num(s.n ?? s.count ?? s.qty ?? s.amount ?? 1, 1)
    }
    return total
  }

  /** 统计档案里某条目记录次数（幽灵的归档算作「见过」） */
  _countArchive(itemId) {
    const list = G.archive?.entries
    if (!Array.isArray(list)) return 0
    let n = 0
    for (const e of list) {
      if (!e) continue
      const eid = e.id || e.itemId || e.artifactId
      if (eid === itemId) n++
    }
    return n
  }

  // ---------------------------------------------------------------- 追踪

  track(questId) {
    if (!this.isActive(questId)) return false
    G.quests.tracked = questId
    this._emitChanged()
    return true
  }

  untrack() {
    G.quests.tracked = null
    this._emitChanged()
    return true
  }

  get tracked() {
    const id = G.quests.tracked
    if (!id) return null
    const entry = this.entry(id)
    if (!entry) return null
    return { id, def: this.def(id), progress: entry.progress, percent: this.percentOf(id) }
  }

  // ---------------------------------------------------------------- 每帧

  /**
   * survive 类目标按秒推进。其它目标不在这里处理。
   * 为了不让 UI 每帧重排，进度事件按整秒节流。
   */
  update(dt) {
    const d = num(dt, 0)
    if (d <= 0) return
    for (const entry of G.quests.active.slice()) {
      const def = this.def(entry.id)
      if (!def) continue
      let changed = false
      for (const obj of def.objectives || []) {
        if (obj.type !== 'survive') continue
        const need = Math.max(1, num(obj.count, 1))
        const cur = num(entry.progress?.[obj.id])
        if (cur >= need) continue
        const next = Math.min(need, cur + d)
        const crossed = Math.floor(next) > Math.floor(cur) || next >= need
        entry.progress[obj.id] = next
        changed = true
        if (crossed) this._emitProgress(entry, def, obj, next, need)
      }
      if (changed && this._allDone(def, entry)) this.complete(entry.id)
    }
  }

  // ---------------------------------------------------------------- 事件桥

  /**
   * 可选：把常用事件直接桥接到 notify。
   * 由集成方显式调用（quests.attachEvents()），避免与主游戏自己的 notify 重复计数。
   * @returns {Function} 解绑函数
   */
  attachEvents() {
    this.detachEvents()
    const onKill = (p) => {
      const monsterId = p?.monsterId || p?.def?.id || p?.id || p?.monster?.def?.id
      if (monsterId) this.notify('kill', { monsterId, n: 1 })
    }
    const onRoom = (p) => {
      const roomId = p?.roomId || p?.id || p?.room?.id || G.roomId
      if (roomId) this.notify('reach', { roomId })
    }
    const onItem = (p) => {
      const itemId = p?.itemId || p?.id || p?.item?.id
      const n = num(p?.n ?? p?.count ?? 1, 1)
      if (itemId) this.notify('collect', { itemId, n })
    }
    const onLoot = (p) => {
      const itemId = p?.itemId || p?.id || p?.item?.id
      if (itemId) this.notify('collect', { itemId, n: num(p?.n ?? 1, 1) })
    }
    this._unbind.push(Events.on(EV.MONSTER_KILLED, onKill))
    this._unbind.push(Events.on(EV.ROOM_ENTER, onRoom))
    this._unbind.push(Events.on(EV.ITEM_ADDED, onItem))
    this._unbind.push(Events.on(EV.LOOT_PICKED, onLoot))
    return () => this.detachEvents()
  }

  detachEvents() {
    for (const off of this._unbind) {
      try {
        if (typeof off === 'function') off()
      } catch (e) {
        /* ignore */
      }
    }
    this._unbind.length = 0
  }

  // ---------------------------------------------------------------- 存档

  serialize() {
    return {
      active: G.quests.active.map((e) => ({
        id: e.id,
        progress: { ...(e.progress || {}) },
        startedAt: e.startedAt || 0,
        done: !!e.done,
      })),
      completed: G.quests.completed.slice(),
      tracked: G.quests.tracked || null,
    }
  }

  load(data) {
    this._ensureState()
    G.quests.active.length = 0
    G.quests.completed.length = 0
    G.quests.tracked = null
    if (!data || typeof data !== 'object') return false

    for (const raw of Array.isArray(data.active) ? data.active : []) {
      if (!raw || !raw.id) continue
      const def = this.def(raw.id)
      if (!def) continue
      const progress = {}
      for (const obj of def.objectives || []) {
        progress[obj.id] = Math.min(
          Math.max(1, num(obj.count, 1)),
          Math.max(0, num(raw.progress?.[obj.id], 0)),
        )
      }
      G.quests.active.push({
        id: raw.id,
        title: def.title,
        type: def.type,
        giver: def.giver || '',
        progress,
        startedAt: num(raw.startedAt, 1),
        done: false,
      })
    }
    for (const id of Array.isArray(data.completed) ? data.completed : []) {
      if (typeof id === 'string' && this.def(id) && !G.quests.completed.includes(id)) {
        G.quests.completed.push(id)
      }
    }
    if (typeof data.tracked === 'string' && this.isActive(data.tracked)) {
      G.quests.tracked = data.tracked
    } else {
      G.quests.tracked = G.quests.active[0]?.id || null
    }
    this._emitChanged()
    return true
  }

  /** 新的一次循环 / 新档：清空任务状态（同伴、档案等由各自系统处理） */
  reset() {
    this._ensureState()
    G.quests.active.length = 0
    G.quests.completed.length = 0
    G.quests.tracked = null
    this._emitChanged()
  }

  // ---------------------------------------------------------------- 内部

  _emitChanged() {
    // 列表结构变化（接取 / 完成 / 追踪切换）。Vue 的响应式会自己刷新 UI，
    // 这个事件只是给非响应式的外壳（音效、日志、成就）留一个钩子。
    Events.emit('quest:changed', {
      active: G.quests.active.length,
      completed: G.quests.completed.length,
      tracked: G.quests.tracked,
    })
  }

  _warnOnce(key, msg) {
    if (this._warned.has(key)) return
    this._warned.add(key)
    console.warn('[quest]', msg)
  }

  /** 调试用：清空告警记录 */
  clearWarnings() {
    this._warned.clear()
  }

  /** 统计信息（调试面板） */
  stats() {
    return {
      active: G.quests.active.length,
      completed: G.quests.completed.length,
      tracked: G.quests.tracked,
      total: Content.count(KIND.QUEST),
    }
  }
}

/** 便于外部直接读「目标类型 → 中文名」 */
export function objectiveTypeLabel(type) {
  return TYPE_LABEL[canonicalType(type)] || type || '未知'
}

export default QuestSystem
