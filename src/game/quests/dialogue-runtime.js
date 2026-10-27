// DialogueRuntime —— 对话运行时（节点图解释器）
//
// 职责：
//   · 根据同伴数据挑一段对话（带条件的候选表 → 第一个满足条件的）
//   · 在节点图里推进：无选项时 advance() 走 next / 收尾；有选项时 choose(i) 才动
//   · 选项的 require 不满足时给出可读中文原因（enabled:false, reason:'缺少润滑剂×4'）
//   · 执行 effects：优先交给 game.applyDialogueEffect(effect)，
//     主游戏没实现或只处理了一部分时用内置兜底把常见类型补上
//   · 对话打开期间把完整状态写进 G.dialogue 供 UI 渲染，关闭时清空
//
// once 标记（对话 / 节点 / 选项）全部记在 G.flags 里，键名以 'dlg:' 开头，
// 所以存档只要存 G.flags 就够了；serialize() 只是把它们单独挑出来。

import { Content, KIND } from '../core/registry.js'
import { Events, EV } from '../core/events.js'
import { G, toast, notify as pushNotify } from '../state.js'

// 这些 effect 类型是本模块的扩展：即使主游戏实现了 applyDialogueEffect，
// 也仍然走本地兜底，避免集成方没接这两种时对话给了东西却推不动任务。
const EXTENSION_EFFECTS = new Set(['deliver', 'inspect', 'archive', 'endDialogue'])

// 交给主游戏处理的标准 effect（docs/CONTENT-API.md §5 列表）
const STANDARD_EFFECTS = new Set([
  'startQuest',
  'completeQuest',
  'failQuest',
  'giveItem',
  'takeItem',
  'unlockChassis',
  'setFlag',
  'addSignal',
  'heal',
  'notify',
])

const FLAG_PREFIX = 'dlg:'

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export class DialogueRuntime {
  constructor(game) {
    this.game = game || null
    /** 当前对话定义 */
    this.def = null
    /** G.dialogue 对应的候选条目（来自 companion.dialogues） */
    this.entry = null
    /** 当前同伴定义 */
    this.companion = null
    /** 当前节点 id / 节点对象 */
    this.nodeId = ''
    this.node = null
    /** 本次会话内已经点过的选项（避免重复点击同一分支） */
    this._choiceSeen = new Set()
    this._warned = new Set()
    this._clearState()
  }

  // ---------------------------------------------------------------- 状态

  get active() {
    return !!this.def
  }

  /** UI 直接渲染的快照（无副作用，随时可读） */
  get state() {
    if (!this.def || !this.node) {
      return {
        active: false,
        npcId: '',
        npcName: '',
        portrait: '',
        nodeId: '',
        speaker: '',
        speakerName: '',
        text: '',
        choices: [],
        end: true,
      }
    }
    const node = this.node
    const choices = this._choicesView()
    return {
      active: true,
      npcId: this.def.npc,
      npcName: this.companion?.name || this.def.npc,
      portrait: node.portrait || this.companion?.portrait || '',
      nodeId: this.nodeId,
      speaker: node.speaker || '',
      speakerName: this._speakerName(node.speaker),
      text: node.text || '',
      choices,
      end: this._isEndNode(node, choices),
      dialogueId: this.def.id,
    }
  }

  /** 对外暴露当前对话 id（存档/调试用） */
  get dialogueId() {
    return this.def?.id || ''
  }

  // ---------------------------------------------------------------- 开局

  /**
   * 和某个同伴说话。
   * @returns {boolean} 是否成功打开
   */
  start(npcId) {
    if (!npcId) return false
    const companion = Content.get(KIND.COMPANION, npcId)
    if (!companion) {
      this._warnOnce(`npc:${npcId}`, `对话目标不是同伴：${npcId}`)
      return false
    }
    // 营救目标在救出来之前不在避难所里，不能直接对话
    if (companion.rescue) {
      const q = companion.rescue.quest
      const quests = this._quests()
      const done = quests ? quests.isCompleted(q) : !!G.flags[`rescue_done:${q}`]
      if (!done) return false
    }
    // 已经开着别的对话，先收掉
    if (this.active) this.close()

    const picked = this._pickDialogue(companion)
    if (!picked) {
      this._warnOnce(`no-dialogue:${npcId}`, `同伴 ${npcId} 没有可用的对话`)
      return false
    }

    this.companion = companion
    this.def = picked.def
    this.entry = picked.entry || null
    this._choiceSeen = new Set()

    Events.emit(EV.DIALOGUE_START, {
      dialogueId: this.def.id,
      npcId,
      npcName: companion.name,
      def: this.def,
    })

    const ok = this._goto(this.def.startNode || 'start', { initial: true })
    if (!ok) {
      this.close()
      return false
    }

    // 「和某人谈谈」类目标：开口就算谈过了
    this._questNotify('talk', { npcId })
    return true
  }

  /** start 的别名，方便集成层按语义调用 */
  open(npcId) {
    return this.start(npcId)
  }

  /**
   * 从 companion.dialogues 里挑第一个条件满足且没看过的（once）。
   * companion.dialogues 的最后一项应当是不带 require 的兜底闲聊。
   */
  _pickDialogue(companion) {
    const list = []
    if (Array.isArray(companion.dialogues)) {
      for (const item of companion.dialogues) {
        if (!item) continue
        list.push(typeof item === 'string' ? { id: item } : item)
      }
    }
    // 保证 companion.dialogue 也在候选里（放在最前面，作为「默认对话」）
    if (companion.dialogue && !list.some((e) => e.id === companion.dialogue)) {
      list.unshift({ id: companion.dialogue })
    }

    for (const item of list) {
      if (!item.id) continue
      const def = Content.get(KIND.DIALOGUE, item.id)
      if (!def) {
        this._warnOnce(`missing-dialogue:${item.id}`, `对话不存在：${item.id}`)
        continue
      }
      const once = item.once ?? def.once
      if (once && this._seenDialogue(def.id)) continue
      const check = this.checkRequire(item.require || def.require)
      if (!check.ok) continue
      return { def, entry: item }
    }
    return null
  }

  // ---------------------------------------------------------------- 推进

  /** 无选项时：走 next，否则结束对话 */
  advance() {
    if (!this.active) return false
    const node = this.node
    if (!node) return false
    const choices = node.choices || []
    if (choices.length) {
      // 有选项必须选；UI 上应该把「继续」按钮禁用
      return false
    }
    if (node.next) return this._goto(node.next)
    return this._finish()
  }

  /**
   * 选择第 index 个选项。
   * require 不满足 / 已经问过（once）→ false，不改变状态。
   */
  choose(index) {
    if (!this.active) return false
    const node = this.node
    if (!node) return false
    const choices = node.choices || []
    const choice = choices[index]
    if (!choice) return false
    const view = this._choicesView()[index]
    if (!view || !view.enabled) return false

    const key = this._choiceKey(index)
    if (choice.once) this._markSeen(key)

    if (Array.isArray(choice.effects) && choice.effects.length) {
      this._runEffects(choice.effects)
    }
    if (!this.active) return true

    if (choice.next) return this._goto(choice.next)
    if (choice.end) return this._finish()
    // 选项没有指定去向：沿用节点的 next，没有就收尾
    if (node.next) return this._goto(node.next)
    return this._finish()
  }

  /** 关闭对话（UI 的「离开」按钮 / 外部强制打断都走这里） */
  close() {
    const def = this.def
    if (!def) {
      this._clearState()
      return false
    }
    if (def.once) this._markSeen(this._dialogueKey(def.id))
    Events.emit(EV.DIALOGUE_END, {
      dialogueId: def.id,
      npcId: def.npc,
      npcName: this.companion?.name || def.npc,
    })
    this.def = null
    this.node = null
    this.nodeId = ''
    this.entry = null
    this.companion = null
    this._choiceSeen = new Set()
    this._clearState()
    return true
  }

  // ---------------------------------------------------------------- 节点跳转

  _goto(nodeId, opts = {}) {
    if (!this.def) return false
    const nodes = this.def.nodes || {}
    const node = nodes[nodeId]
    if (!node) {
      this._warnOnce(`node:${this.def.id}:${nodeId}`, `对话 ${this.def.id} 里找不到节点 ${nodeId}`)
      this.close()
      return false
    }
    // 节点级 once：已经看过就直接跳过（沿 next 前进；没有 next 则收尾）
    const nodeKey = this._nodeKey(nodeId)
    if (node.once && this._seen(nodeKey) && !opts.force) {
      if (node.next) return this._goto(node.next, opts)
      return this._finish()
    }

    this.nodeId = nodeId
    this.node = node
    if (node.once) this._markSeen(nodeKey)

    if (Array.isArray(node.effects) && node.effects.length) {
      this._runEffects(node.effects)
      // effect 里可能调用了 endDialogue / 强制关闭
      if (!this.active) return true
    }

    this._syncState()
    return true
  }

  _finish() {
    this.close()
    return true
  }

  // ---------------------------------------------------------------- 效果

  /**
   * 执行一个 effect。
   * 先交给 game.applyDialogueEffect；扩展类型无论主游戏是否实现都跑本地兜底。
   */
  applyEffect(effect) {
    if (!effect || !effect.type) return false
    let delegated = false
    const game = this.game
    if (game && typeof game.applyDialogueEffect === 'function') {
      try {
        const r = game.applyDialogueEffect(effect)
        // 返回 false 表示「我不处理」，其它（true / undefined）都当作已处理
        delegated = r !== false
      } catch (err) {
        console.error('[dialogue] game.applyDialogueEffect 抛错', err)
      }
    }
    if (delegated && STANDARD_EFFECTS.has(effect.type) && !EXTENSION_EFFECTS.has(effect.type)) {
      return true
    }
    return this._fallbackEffect(effect)
  }

  _runEffects(list) {
    for (const effect of list) {
      try {
        this.applyEffect(effect)
      } catch (err) {
        console.error('[dialogue] effect 执行失败', effect, err)
      }
      if (!this.active) return
    }
  }

  _fallbackEffect(effect) {
    const type = effect.type
    const quests = this._quests()
    switch (type) {
      case 'startQuest': {
        if (!effect.id) return false
        if (quests) {
          quests.start(effect.id)
        } else {
          this._warnOnce('no-quest-system', '没有 QuestSystem，startQuest 无法生效')
          return false
        }
        return true
      }
      case 'completeQuest': {
        if (!effect.id) return false
        if (quests) quests.complete(effect.id)
        return true
      }
      case 'failQuest': {
        if (!effect.id) return false
        if (quests) quests.fail(effect.id, effect.reason || '')
        return true
      }
      case 'deliver': {
        if (!effect.itemId) return false
        if (quests) {
          quests.notify('deliver', {
            itemId: effect.itemId,
            npcId: effect.npcId || this.def?.npc || '',
            n: num(effect.n, 1),
          })
        }
        return true
      }
      case 'inspect': {
        if (!effect.itemId && !effect.landmarkId) return false
        if (quests) {
          quests.notify('inspect', {
            itemId: effect.itemId,
            landmarkId: effect.landmarkId,
            n: num(effect.n, 1),
          })
        }
        return true
      }
      case 'giveItem': {
        if (!effect.id) return false
        const n = Math.max(1, num(effect.n, 1))
        if (this._addItem(effect.id, n)) return true
        return false
      }
      case 'takeItem': {
        if (!effect.id) return false
        return this._removeItem(effect.id, Math.max(1, num(effect.n, 1)))
      }
      case 'unlockChassis': {
        const id = effect.id || effect.chassis
        if (!id) return false
        if (!Array.isArray(G.chassisUnlocked)) G.chassisUnlocked = []
        if (!G.chassisUnlocked.includes(id)) {
          G.chassisUnlocked.push(id)
          const cdef = Content.get(KIND.CHASSIS, id)
          pushNotify(`机体解锁 · ${cdef?.name || id}`, 'good', 5)
        }
        return true
      }
      case 'setFlag': {
        const flag = effect.flag || effect.id
        if (!flag) return false
        G.flags[flag] = effect.value === undefined ? true : effect.value
        Events.emit(EV.FLAG_SET, { flag, value: G.flags[flag] })
        return true
      }
      case 'addSignal': {
        const n = num(effect.n, 1)
        const before = num(G.signal)
        G.signal = Math.min(num(G.signalMax, 5), Math.max(0, before + n))
        Events.emit(EV.SIGNAL_CHANGED, { value: G.signal, delta: G.signal - before })
        if (G.signal !== before) toast(`信号强度 ${G.signal > before ? '+' : ''}${G.signal - before}`, 'good', 2.4)
        return true
      }
      case 'heal': {
        const n = Math.max(0, num(effect.n, 10))
        const before = num(G.hp)
        const max = num(G.hpMax, 100)
        G.hp = Math.min(max, before + n)
        if (G.hp > before) toast(`修理 +${G.hp - before}`, 'good', 2)
        return true
      }
      case 'archive': {
        const id = effect.id || effect.itemId
        if (!id) return false
        if (!G.archive || typeof G.archive !== 'object') G.archive = { entries: [], unread: 0 }
        if (!Array.isArray(G.archive.entries)) G.archive.entries = []
        const item = Content.get(KIND.ITEM, id)
        const entry = {
          id,
          title: effect.title || item?.name || id,
          lore: effect.lore || item?.lore || item?.desc || '',
          from: effect.from || this.def?.npc || 'unknown',
          cycle: num(G.cycle, 0),
        }
        if (G.archive.entries.some((e) => e && e.id === id && e.title === entry.title)) {
          return true
        }
        G.archive.entries.push(entry)
        G.archive.unread = num(G.archive.unread) + 1
        Events.emit(EV.ARCHIVE_ADD, entry)
        pushNotify(`档案 +1 · ${entry.title}`, 'info', 3)
        return true
      }
      case 'notify': {
        const text = effect.text || effect.message
        if (!text) return false
        pushNotify(text, effect.kind || 'info', num(effect.secs, 4))
        return true
      }
      case 'endDialogue': {
        this.close()
        return true
      }
      default: {
        this._warnOnce(`effect:${type}`, `未实现的对话效果类型：${type}`)
        return false
      }
    }
  }

  // ---------------------------------------------------------------- require

  /**
   * 求值 require 对象。
   * @returns {{ok:boolean, reason:string}} 不满足时 reason 是给玩家看的中文原因
   */
  checkRequire(req) {
    if (!req) return { ok: true, reason: '' }
    if (typeof req === 'string') req = { quest: req }
    if (typeof req !== 'object') return { ok: true, reason: '' }
    const quests = this._quests()

    // 物品：最先判断，因为它给出的原因最具体（「缺少润滑剂×4」）
    if (req.item) {
      const need = typeof req.item === 'string' ? { id: req.item, n: 1 } : req.item
      const have = this.countItem(need.id)
      const want = Math.max(1, num(need.n, 1))
      if (have < want) {
        return { ok: false, reason: `缺少${this.itemName(need.id)}×${want}` }
      }
    }
    if (req.items && Array.isArray(req.items)) {
      for (const it of req.items) {
        if (!it || !it.id) continue
        const want = Math.max(1, num(it.n, 1))
        if (this.countItem(it.id) < want) {
          return { ok: false, reason: `缺少${this.itemName(it.id)}×${want}` }
        }
      }
    }
    if (req.quest) {
      if (!quests || !quests.isActive(req.quest)) {
        return { ok: false, reason: `需要任务「${this.questTitle(req.quest)}」` }
      }
    }
    if (req.notQuest) {
      if (quests && quests.isActive(req.notQuest)) {
        return { ok: false, reason: `「${this.questTitle(req.notQuest)}」还没办完` }
      }
    }
    if (req.completed) {
      if (!quests || !quests.isCompleted(req.completed)) {
        return { ok: false, reason: `需要先完成「${this.questTitle(req.completed)}」` }
      }
    }
    if (req.notCompleted) {
      if (quests && quests.isCompleted(req.notCompleted)) {
        return { ok: false, reason: '这件事已经办完了' }
      }
    }
    if (req.flag) {
      const flags = Array.isArray(req.flag) ? req.flag : [req.flag]
      for (const f of flags) {
        if (!G.flags[f]) return { ok: false, reason: '现在还不是说这个的时候' }
      }
    }
    if (req.notFlag) {
      const flags = Array.isArray(req.notFlag) ? req.notFlag : [req.notFlag]
      for (const f of flags) {
        if (G.flags[f]) return { ok: false, reason: '这件事已经说过了' }
      }
    }
    if (req.signal !== undefined) {
      const need = num(req.signal, 0)
      if (num(G.signal) < need) {
        return { ok: false, reason: `信号强度需要 ${need}（现在 ${num(G.signal)}）` }
      }
    }
    if (req.hp !== undefined) {
      if (num(G.hp) < num(req.hp, 0)) return { ok: false, reason: '状态太差了' }
    }
    if (req.objectives) {
      const qid = req.quest || req.completed
      const ids = Array.isArray(req.objectives) ? req.objectives : [req.objectives]
      if (!qid) return { ok: true, reason: '' }
      if (quests && !quests.allObjectivesDone(qid, ids)) {
        return { ok: false, reason: '还没到时候' }
      }
    }
    return { ok: true, reason: '' }
  }

  // ---------------------------------------------------------------- 选项视图

  _choicesView() {
    const node = this.node
    if (!node || !Array.isArray(node.choices)) return []
    return node.choices.map((choice, i) => {
      const key = this._choiceKey(i)
      const once = !!choice.once
      const already = once && this._seen(key)
      const check = already ? { ok: false, reason: '已经问过这件事了' } : this.checkRequire(choice.require)
      return {
        index: i,
        text: choice.text || '……',
        enabled: check.ok,
        reason: check.ok ? '' : check.reason,
        next: choice.next || '',
        once,
      }
    })
  }

  _isEndNode(node, choices) {
    if (!node) return true
    if (node.end) return true
    if (choices && choices.length) return false
    return !node.next
  }

  // ---------------------------------------------------------------- 状态同步

  _syncState() {
    const s = this.state
    if (!G.dialogue || typeof G.dialogue !== 'object') {
      G.dialogue = {
        active: false,
        npcId: '',
        npcName: '',
        portrait: '',
        nodeId: '',
        text: '',
        speaker: '',
        choices: [],
        typing: 0,
      }
    }
    Object.assign(G.dialogue, {
      active: s.active,
      npcId: s.npcId,
      npcName: s.npcName,
      portrait: s.portrait,
      nodeId: s.nodeId,
      speaker: s.speaker,
      speakerName: s.speakerName,
      text: s.text,
      choices: s.choices,
      end: s.end,
      dialogueId: s.dialogueId || '',
      typing: 0,
    })
  }

  _clearState() {
    if (!G.dialogue || typeof G.dialogue !== 'object') return
    Object.assign(G.dialogue, {
      active: false,
      npcId: '',
      npcName: '',
      portrait: '',
      nodeId: '',
      speaker: '',
      speakerName: '',
      text: '',
      choices: [],
      end: true,
      dialogueId: '',
      typing: 0,
    })
  }

  _speakerName(speaker) {
    if (!speaker) return ''
    if (speaker === 'player') return '你'
    if (speaker === 'narrator') return ''
    const comp = Content.get(KIND.COMPANION, speaker)
    if (comp) return comp.name
    const item = Content.get(KIND.ITEM, speaker)
    if (item) return item.name
    return speaker
  }

  // ---------------------------------------------------------------- 物品

  countItem(itemId) {
    if (!itemId) return 0
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

  itemName(itemId) {
    const item = Content.get(KIND.ITEM, itemId)
    return item?.name || itemId
  }

  questTitle(questId) {
    const def = Content.get(KIND.QUEST, questId)
    return def?.title || questId
  }

  _addItem(itemId, n) {
    const game = this.game
    if (game) {
      if (typeof game.addItem === 'function') {
        try {
          if (game.addItem(itemId, n) !== false) return true
        } catch (e) {
          /* ignore */
        }
      }
      const inv = game.inventory
      if (inv && typeof inv.add === 'function') {
        try {
          if (inv.add(itemId, n) !== false) return true
        } catch (e) {
          /* ignore */
        }
      }
    }
    const slots = G.inventory?.slots
    if (!Array.isArray(slots)) return false
    const stack = slots.find((s) => s && (s.id === itemId || s.itemId === itemId))
    if (stack) {
      stack.n = num(stack.n ?? stack.count ?? 1) + n
    } else {
      slots.push({ id: itemId, n })
    }
    Events.emit(EV.ITEM_ADDED, { itemId, n })
    Events.emit(EV.INVENTORY_CHANGED, { reason: 'dialogue', itemId, n })
    return true
  }

  _removeItem(itemId, n) {
    const game = this.game
    if (game) {
      if (typeof game.removeItem === 'function') {
        try {
          if (game.removeItem(itemId, n) !== false) return true
        } catch (e) {
          /* ignore */
        }
      }
      const inv = game.inventory
      if (inv && typeof inv.remove === 'function') {
        try {
          if (inv.remove(itemId, n) !== false) return true
        } catch (e) {
          /* ignore */
        }
      }
    }
    const slots = G.inventory?.slots
    if (!Array.isArray(slots)) return false
    let left = n
    for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
      const s = slots[i]
      if (!s) continue
      const sid = typeof s === 'string' ? s : s.id || s.itemId
      if (sid !== itemId) continue
      const have = num(s.n ?? s.count ?? 1, 1)
      const take = Math.min(have, left)
      left -= take
      if (have - take <= 0) slots.splice(i, 1)
      else if (typeof s === 'object') s.n = have - take
    }
    if (left < n) {
      Events.emit(EV.ITEM_REMOVED, { itemId, n: n - left })
      Events.emit(EV.INVENTORY_CHANGED, { reason: 'dialogue', itemId, n: -(n - left) })
      return true
    }
    return false
  }

  // ---------------------------------------------------------------- once 标记

  _dialogueKey(id) {
    return `${FLAG_PREFIX}${id}`
  }

  _nodeKey(nodeId) {
    return `${FLAG_PREFIX}${this.def?.id || '?'}:node:${nodeId}`
  }

  _choiceKey(index) {
    return `${FLAG_PREFIX}${this.def?.id || '?'}:choice:${this.nodeId}:${index}`
  }

  _seen(key) {
    return !!G.flags[key]
  }

  _markSeen(key) {
    G.flags[key] = true
    Events.emit(EV.FLAG_SET, { flag: key, value: true })
  }

  _seenDialogue(id) {
    return !!G.flags[this._dialogueKey(id)]
  }

  // ---------------------------------------------------------------- 存档

  /** 只保存 once 相关标记（都在 G.flags 里，这里挑出 'dlg:' 前缀的） */
  serialize() {
    const seen = {}
    for (const key of Object.keys(G.flags || {})) {
      if (key.startsWith(FLAG_PREFIX) && G.flags[key]) seen[key] = true
    }
    return { seen }
  }

  load(data) {
    if (!data || typeof data !== 'object') return false
    const seen = data.seen && typeof data.seen === 'object' ? data.seen : null
    if (seen) {
      for (const key of Object.keys(seen)) {
        if (!key.startsWith(FLAG_PREFIX)) continue
        if (seen[key]) G.flags[key] = true
      }
    }
    // 兼容：如果存档里直接存了对话 id 列表
    if (Array.isArray(data.dialogues)) {
      for (const id of data.dialogues) {
        if (typeof id === 'string') G.flags[this._dialogueKey(id)] = true
      }
    }
    return true
  }

  /** 强制关闭并清空（换场景 / 死亡时调用） */
  reset() {
    if (this.active) this.close()
    this._clearState()
    this._choiceSeen = new Set()
  }

  // ---------------------------------------------------------------- 内部

  _quests() {
    const q = this.game && this.game.quests
    if (q && typeof q.start === 'function' && typeof q.notify === 'function') return q
    return null
  }

  _questNotify(type, payload) {
    const q = this._quests()
    if (q) q.notify(type, payload)
  }

  _warnOnce(key, msg) {
    if (this._warned.has(key)) return
    this._warned.add(key)
    console.warn('[dialogue]', msg)
  }
}

export default DialogueRuntime
