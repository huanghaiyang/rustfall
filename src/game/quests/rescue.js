// RescueSystem —— 营救运行时
//
// 流程：
//   1. 玩家在房间里靠近牢笼 → interact(cageId)
//      → G.rescue = { active, targetName, stage:'escort' }
//      → 激活对应的营救任务（如果还没接）
//      → emit EV.RESCUE_STARTED + toast
//   2. 玩家把被救者带回「该同伴定义里的 shelter」→ atShelter(roomId)
//      → G.companions[id].rescued = true / met = true / trust += 1
//      → emit EV.RESCUE_COMPLETED + toast，清空 G.rescue
//
// 注意：
//   · 同伴数据里的 rescue.room 是笼子所在房间，shelter 是救出来以后待的地方。
//     两者不一致时，以 companion.shelter 为送达目标（任务说明的要求）。
//   · 一次只能带一个人（G.rescue.active 只有一个位置），
//     带人期间可以正常做别的事，但要先送回去才能去开下一个笼子。
//   · 牢笼坐标由房间生成器通过 registerCages(roomData) 注册；
//     即使没注册，也能靠同伴数据里的 rescue.cage 兜底交互。

import { Content, KIND } from '../core/registry.js'
import { Events, EV } from '../core/events.js'
import { G, toast, notify as pushNotify } from '../state.js'

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export class RescueSystem {
  constructor(game) {
    this.game = game || null
    /** cageId -> {id, x, y, roomId, rescueQuest, companionId} */
    this.cages = new Map()
    this._warned = new Set()
    this._ensureState()
    this._registerFromCompanions()
  }

  // ---------------------------------------------------------------- 状态

  _ensureState() {
    if (!G.rescue || typeof G.rescue !== 'object') {
      G.rescue = { active: null, targetName: '', stage: '' }
    }
    if (G.rescue.active === undefined) G.rescue.active = null
    if (typeof G.rescue.targetName !== 'string') G.rescue.targetName = ''
    if (typeof G.rescue.stage !== 'string') G.rescue.stage = ''
    if (!G.companions || typeof G.companions !== 'object') G.companions = {}
  }

  /**
   * 同伴数据里带着 rescue 字段的，先在系统里登记一份（坐标 0,0）。
   * 房间生成器调用 registerCages 时会用真实坐标覆盖。
   */
  _registerFromCompanions() {
    for (const comp of Content.all(KIND.COMPANION)) {
      const r = comp.rescue
      if (!r || !r.cage) continue
      if (this.cages.has(r.cage)) continue
      this.cages.set(r.cage, {
        id: r.cage,
        x: 0,
        y: 0,
        roomId: r.room || '',
        rescueQuest: r.quest || '',
        companionId: comp.id,
      })
    }
  }

  /**
   * 注册一个房间里的牢笼。
   * @param {object} roomData 房间生成结果，需要 .cages = [{id,x,y,rescueQuest}]
   * @returns {number} 新登记/更新的牢笼数量
   */
  registerCages(roomData) {
    if (!roomData) return 0
    const list = roomData.cages
    if (!Array.isArray(list) || !list.length) return 0
    const roomId = roomData.id || roomData.roomId || roomData.spec?.id || G.roomId || ''
    let n = 0
    for (const cage of list) {
      if (!cage || !cage.id) continue
      const companion = this._companionByCage(cage.id)
      const prev = this.cages.get(cage.id)
      const rescueQuest =
        cage.rescueQuest ||
        (companion && companion.rescue ? companion.rescue.quest : '') ||
        prev?.rescueQuest ||
        ''
      this.cages.set(cage.id, {
        id: cage.id,
        x: num(cage.x, prev?.x || 0),
        y: num(cage.y, prev?.y || 0),
        roomId: cage.roomId || roomId,
        rescueQuest,
        companionId: cage.companionId || companion?.id || prev?.companionId || '',
      })
      n++
    }
    return n
  }

  /** 一次性注册多个房间（区域加载时方便） */
  registerRooms(roomList) {
    if (!Array.isArray(roomList)) return 0
    let n = 0
    for (const r of roomList) n += this.registerCages(r)
    return n
  }

  /** 取牢笼记录 */
  cage(cageId) {
    return this.cages.get(cageId) || null
  }

  /** 某房间里的牢笼（UI 小地图 / 交互提示用） */
  cagesInRoom(roomId) {
    const out = []
    for (const c of this.cages.values()) if (c.roomId === roomId) out.push(c)
    return out
  }

  /**
   * 离玩家最近的牢笼（交互系统可以直接用这个找目标）。
   * 传了 roomId 就只在该房间里找，避免跨房间误判。
   */
  nearestCage(x, y, range = 96, roomId = '') {
    let best = null
    let bestD = range * range
    for (const c of this.cages.values()) {
      if (roomId && c.roomId && c.roomId !== roomId) continue
      const dx = num(c.x) - num(x)
      const dy = num(c.y) - num(y)
      const d = dx * dx + dy * dy
      if (d <= bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  /** 当前正在护送的对象；没有就返回 null */
  get active() {
    this._ensureState()
    if (!G.rescue.active || G.rescue.stage !== 'escort') return null
    const companionId = G.rescue.companionId || ''
    return {
      questId: typeof G.rescue.active === 'string' ? G.rescue.active : '',
      companionId,
      name: G.rescue.targetName || this._companionName(companionId),
      stage: 'escort',
      shelter: G.rescue.shelter || '',
    }
  }

  /** 当前护送目标是否已完成送达（只在 atShelter 那一帧为真） */
  get delivered() {
    return G.rescue.stage === 'delivered'
  }

  /** 送人期间给 UI 的一行文案 */
  get escortHint() {
    const a = this.active
    if (!a) return ''
    const dest = Content.get(KIND.ROOM, a.shelter)
    const roomName = dest?.name || a.shelter || '避难所'
    return `护送中：把 ${a.name} 送回${roomName}`
  }

  // ---------------------------------------------------------------- 交互

  /**
   * 打开牢笼。
   * @returns {{ok:boolean, message:string, companionId?:string, questId?:string}}
   */
  interact(cageId) {
    this._ensureState()
    if (!cageId) return { ok: false, message: '这里没有可以打开的东西。' }

    let cage = this.cage(cageId)
    if (!cage) {
      // 未注册坐标时的兜底：靠同伴数据找
      const comp = this._companionByCage(cageId)
      if (!comp) return { ok: false, message: '这里没有可以打开的东西。' }
      cage = {
        id: cageId,
        x: 0,
        y: 0,
        roomId: comp.rescue?.room || '',
        rescueQuest: comp.rescue?.quest || '',
        companionId: comp.id,
      }
      this.cages.set(cageId, cage)
    }

    const companion = Content.get(KIND.COMPANION, cage.companionId) || this._companionByCage(cageId)
    if (!companion) {
      return { ok: false, message: '笼子是空的。' }
    }
    if (this.isRescued(companion.id)) {
      return { ok: false, message: `笼子是空的。${companion.name}已经出去了。` }
    }
    if (this.active) {
      const current = this.active
      if (current.companionId === companion.id) {
        return { ok: false, message: `${companion.name}已经跟着你了。` }
      }
      return {
        ok: false,
        message: `你手上还带着${current.name}。先送回去，再来开这个。`,
      }
    }

    const rescueQuest = cage.rescueQuest || companion.rescue?.quest || ''
    const quests = this._quests()

    // 激活营救任务（已激活/已完成时 start 返回 false，不报错）
    if (rescueQuest && quests && !quests.isActive(rescueQuest) && !quests.isCompleted(rescueQuest)) {
      quests.start(rescueQuest)
    }

    // 状态：开始护送
    G.rescue.active = rescueQuest || companion.id
    G.rescue.companionId = companion.id
    G.rescue.targetName = companion.name
    G.rescue.stage = 'escort'
    G.rescue.shelter = companion.shelter || ''

    const state = this._companionState(companion.id)
    state.met = true
    state.rescued = false
    state.trust = num(state.trust, 0)
    state.shelter = companion.shelter || ''
    state.rescueQuest = rescueQuest || state.rescueQuest || ''

    // 通知任务：抵达笼子房间 + 打开牢笼
    if (quests) {
      if (cage.roomId) quests.notify('reach', { roomId: cage.roomId })
      quests.notify('rescue', {
        rescueId: rescueQuest,
        questId: rescueQuest,
        companionId: companion.id,
        cageId: companion.rescue?.cage || cage.id,
      })
    }

    Events.emit(EV.RESCUE_STARTED, {
      questId: rescueQuest,
      companionId: companion.id,
      name: companion.name,
      cageId: cage.id,
      roomId: cage.roomId,
      shelter: companion.shelter,
    })
    toast(`你打开了笼子。${companion.name}跟在你身后。`, 'good', 4)
    pushNotify(`营救中 · ${companion.name}`, 'quest', 4.5)

    const dest = Content.get(KIND.ROOM, companion.shelter)
    return {
      ok: true,
      message: `你打开了笼子。带着${companion.name}回${dest?.name || companion.shelter || '避难所'}。`,
      companionId: companion.id,
      questId: rescueQuest,
    }
  }

  /**
   * 玩家进入某个房间时调用。
   * 如果护送目标的 shelter 就是这里，完成营救。
   * @returns {boolean} 是否完成了送达
   */
  atShelter(roomId) {
    this._ensureState()
    const current = this.active
    if (!current) return false
    const companion = Content.get(KIND.COMPANION, current.companionId)
    if (!companion) {
      this._clear()
      return false
    }
    // 送达目标是 companion.shelter（不是 rescue.room，后者是笼子所在房间）
    const destId = companion.shelter || current.shelter
    if (!destId || roomId !== destId) return false

    const quests = this._quests()
    const questId = current.questId || companion.rescue?.quest || ''

    // 标记同伴状态
    const state = this._companionState(companion.id)
    state.met = true
    state.rescued = true
    state.trust = num(state.trust, 0) + 1
    state.shelter = destId
    state.rescuedAt = num(G.cycle, 0)
    state.rescueQuest = questId

    G.rescue.stage = 'delivered'

    // 通知任务：抵达避难所 + 营救完成
    if (quests) {
      quests.notify('reach', { roomId })
      quests.notify('rescue', {
        rescueId: questId,
        questId,
        companionId: companion.id,
        delivered: true,
      })
      // 若目标已经全部达标，补一次完成（正常情况 notify 里已经自动完成）
      if (questId && quests.isActive(questId) && quests.allObjectivesDone(questId)) {
        quests.complete(questId)
      }
    }

    Events.emit(EV.RESCUE_COMPLETED, {
      questId,
      companionId: companion.id,
      name: companion.name,
      shelter: destId,
      trust: state.trust,
    })
    toast(`${companion.name}安全了。`, 'good', 4.2)
    pushNotify(`营救完成 · ${companion.name}`, 'good', 5)

    this._clear()
    return true
  }

  /** 同伴是否已经被救出来 */
  isRescued(companionId) {
    this._ensureState()
    return !!G.companions[companionId]?.rescued
  }

  /** 手动标记同伴「见过面」（例如剧情里见过但没救） */
  markMet(companionId) {
    if (!companionId) return false
    const state = this._companionState(companionId)
    state.met = true
    return true
  }

  /** 同伴运行时状态（同伴列表 / 信任度 UI 读这个） */
  companionState(companionId) {
    this._ensureState()
    return G.companions[companionId] || null
  }

  /** 当前所有同伴的运行态，按数据顺序 */
  roster() {
    this._ensureState()
    return Content.all(KIND.COMPANION).map((comp) => {
      const st = G.companions[comp.id] || {}
      return {
        id: comp.id,
        name: comp.name,
        role: comp.role,
        shelter: comp.shelter,
        portrait: comp.portrait,
        met: !!st.met,
        rescued: !!st.rescued,
        trust: num(st.trust, 0),
        registered: !comp.rescue || this.isRescued(comp.id) || !!st.met,
      }
    })
  }

  /** 没被救出来的同伴数量（主线 / 统计用） */
  pendingRescues() {
    let n = 0
    for (const comp of Content.all(KIND.COMPANION)) {
      if (comp.rescue && !this.isRescued(comp.id)) n++
    }
    return n
  }

  // ---------------------------------------------------------------- 存档

  serialize() {
    this._ensureState()
    const companions = {}
    for (const comp of Content.all(KIND.COMPANION)) {
      const st = G.companions[comp.id]
      if (!st) continue
      companions[comp.id] = {
        met: !!st.met,
        rescued: !!st.rescued,
        trust: num(st.trust, 0),
        shelter: st.shelter || comp.shelter || '',
        rescuedAt: num(st.rescuedAt, 0),
        rescueQuest: st.rescueQuest || '',
      }
    }
    return {
      active: this.active
        ? {
            questId: this.active.questId,
            companionId: this.active.companionId,
            name: this.active.name,
            stage: this.active.stage,
            shelter: this.active.shelter,
          }
        : null,
      companions,
    }
  }

  load(data) {
    this._ensureState()
    this._clear()
    if (!data || typeof data !== 'object') return false

    const comps = data.companions && typeof data.companions === 'object' ? data.companions : {}
    for (const id of Object.keys(comps)) {
      if (!Content.has(KIND.COMPANION, id)) continue
      const raw = comps[id] || {}
      G.companions[id] = {
        met: !!raw.met,
        rescued: !!raw.rescued,
        trust: num(raw.trust, 0),
        shelter: raw.shelter || Content.get(KIND.COMPANION, id)?.shelter || '',
        rescuedAt: num(raw.rescuedAt, 0),
        rescueQuest: raw.rescueQuest || '',
      }
    }

    const a = data.active
    if (a && a.companionId) {
      const comp = Content.get(KIND.COMPANION, a.companionId)
      if (comp && !this.isRescued(a.companionId)) {
        G.rescue.active = a.questId || comp.rescue?.quest || comp.id
        G.rescue.companionId = a.companionId
        G.rescue.targetName = a.name || comp.name
        G.rescue.stage = a.stage === 'delivered' ? 'escort' : a.stage || 'escort'
        G.rescue.shelter = a.shelter || comp.shelter || ''
      }
    }
    return true
  }

  /** 新档：清空同伴状态与护送 */
  reset() {
    this._ensureState()
    G.companions = {}
    this._clear()
    return true
  }

  // ---------------------------------------------------------------- 内部

  _clear() {
    if (!G.rescue || typeof G.rescue !== 'object') {
      G.rescue = { active: null, targetName: '', stage: '' }
      return
    }
    G.rescue.active = null
    G.rescue.companionId = ''
    G.rescue.targetName = ''
    G.rescue.stage = ''
    G.rescue.shelter = ''
  }

  _companionByCage(cageId) {
    if (!cageId) return null
    for (const comp of Content.all(KIND.COMPANION)) {
      if (comp.rescue && comp.rescue.cage === cageId) return comp
    }
    return null
  }

  _companionName(companionId) {
    if (!companionId) return ''
    return Content.get(KIND.COMPANION, companionId)?.name || companionId
  }

  _companionState(companionId) {
    this._ensureState()
    if (!G.companions[companionId]) {
      const comp = Content.get(KIND.COMPANION, companionId)
      G.companions[companionId] = {
        met: false,
        rescued: false,
        trust: 0,
        shelter: comp?.shelter || '',
      }
    }
    return G.companions[companionId]
  }

  _quests() {
    const q = this.game && this.game.quests
    if (q && typeof q.notify === 'function' && typeof q.isActive === 'function') return q
    return null
  }

  _warnOnce(key, msg) {
    if (this._warned.has(key)) return
    this._warned.add(key)
    console.warn('[rescue]', msg)
  }

  /** 调试统计 */
  stats() {
    const all = Content.all(KIND.COMPANION)
    return {
      cages: this.cages.size,
      rescuable: all.filter((c) => !!c.rescue).length,
      rescued: all.filter((c) => this.isRescued(c.id)).length,
      escorting: this.active ? this.active.companionId : null,
      shelters: all.map((c) => ({ id: c.id, shelter: c.shelter, rescued: this.isRescued(c.id) })),
    }
  }
}

export default RescueSystem
