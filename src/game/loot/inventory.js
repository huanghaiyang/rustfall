// 背包运行时（Inventory）—— 纯逻辑，无 DOM / 无 three 依赖，可在 node 里直接单测。
// 契约见 docs/CONTENT-API.md §2 / §10。与引擎的约定：
//   - 槽位定长（默认 INVENTORY_SLOTS = 24），空格为 null。
//   - 负重上限 = baseCapacity × capacityMultiplier × (1 + 已装备组件的 carry 加成)。
//     baseCapacity 默认 BASE_CARRY_WEIGHT = 42kg；机体自带的 carry 请用
//     setCapacityMultiplier(chassisCarry) 从外部注入（本类不 import 游戏状态）。
//   - 任何实际变化后 emit(EV.INVENTORY_CHANGED, { inventory: this, ... })。
//   - 负重/格数不足：不 throw，返回 0 或部分数量，原因写在 this.lastError（'weight' | 'slots'）。
//   - 未知 id：忽略，同一 id 只 console.warn 一次。
//   - 装备：维护自己的一份 {slot: itemId|null}，与 G.equipped 同结构；equip/unequip 会把物品
//     在背包与槽位之间搬动，不会凭空产生或销毁。equipped 支持整体赋值（读档用，会校验）。
//   - use() 只返回 effect，不直接改游戏状态；消耗品/材料扣 1 个，工具不消耗。
//   - bonus 语义（与 chassis/index.js computeStats 对齐）：speed / dig / carry / jump / attack
//     是倍率增量；hp / energyMax 是平值；armor 是 0~1 的减伤比例；energyRegen 是每秒回复。
import { Content, KIND } from '../core/registry.js'
import { Events, EV } from '../core/events.js'
import { INVENTORY_SLOTS, BASE_CARRY_WEIGHT } from '../config.js'

// 槽位顺序固定，UI 不用再自己排。
export const EQUIP_SLOTS = Object.freeze(['joint', 'cpu', 'power', 'armor', 'sensor', 'utility'])

// totals() 的固定返回键：没有装备时全 0，UI 可以直接读。
// speed / dig / carry / jump / attack 是「倍率增量」（1 + totals.speed），
// hp / energyMax 是「平值增量」，armor 是「0~1 减伤比例」，energyRegen 是「每秒回复」，
// scan / radResist 是留给扫描/抗辐射玩法的增量。
export const TOTAL_KEYS = Object.freeze([
  'speed',
  'hp',
  'dig',
  'carry',
  'attack',
  'armor',
  'jump',
  'scan',
  'energyRegen',
  'radResist',
  'energyMax',
])

const SAVE_VERSION = 1
const MAX_STACK = 9999
const EPS = 1e-9

function round2(v) {
  return Math.round(v * 100) / 100
}

function toInt(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.floor(n)
}

export class Inventory {
  /**
   * @param {object} [opts]
   * @param {number} [opts.slots=INVENTORY_SLOTS] 槽位数
   * @param {number} [opts.capacityWeight=BASE_CARRY_WEIGHT] 基础负重（kg）
   * @param {(payload:object)=>void} [opts.onChange] 变化回调（等价于 onChange(cb)）
   * @param {object} [opts.equipped] 初始装备（可选，用于读档）
   * @param {boolean} [opts.quiet] 为 true 时不 console.warn 未知 id（测试用）
   */
  constructor(opts = {}) {
    const slots = toInt(opts.slots)
    this._slotCount = Math.max(1, slots > 0 ? slots : INVENTORY_SLOTS)
    const cap = Number(opts.capacityWeight)
    this._baseCapacity = Number.isFinite(cap) && cap > 0 ? cap : BASE_CARRY_WEIGHT
    const mult = Number(opts.capacityMultiplier)
    this._capacityMultiplier = Number.isFinite(mult) && mult > 0 ? mult : 1
    this._slots = new Array(this._slotCount).fill(null)
    this._equipped = {}
    for (const s of EQUIP_SLOTS) this._equipped[s] = null
    this._listeners = new Set()
    this._warned = new Set()
    this._quiet = !!opts.quiet
    this.lastError = null
    if (typeof opts.onChange === 'function') this.onChange(opts.onChange)
    if (opts.equipped) this._loadEquipped(opts.equipped)
  }

  // -------------------------------------------------------------------------
  // 只读视图
  // -------------------------------------------------------------------------

  /** 定长数组；每格是 { id, n, item } 或 null（返回副本，外部改不动内部状态） */
  get slots() {
    const out = new Array(this._slotCount)
    for (let i = 0; i < this._slotCount; i++) {
      const s = this._slots[i]
      out[i] = s ? { id: s.id, n: s.n, item: s.item } : null
    }
    return out
  }

  get slotsMax() {
    return this._slotCount
  }

  get usedSlots() {
    let n = 0
    for (let i = 0; i < this._slotCount; i++) if (this._slots[i]) n++
    return n
  }

  get freeSlots() {
    return this._slotCount - this.usedSlots
  }

  get isEmpty() {
    return this.usedSlots === 0 && !this.equippedList().length
  }

  /** 总重量（kg，保留 2 位） */
  get weight() {
    let w = 0
    for (let i = 0; i < this._slotCount; i++) {
      const s = this._slots[i]
      if (!s) continue
      const per = Number(s.item?.weight) || 0
      w += per * s.n
    }
    return round2(w)
  }

  /** 基础负重（kg），不含任何倍率；game.js 用它再乘机体 carry 显示 */
  get baseCapacity() {
    return this._baseCapacity
  }

  /** 外部负重倍率（机体 carry）。默认 1，由引擎调用 setCapacityMultiplier 注入。 */
  get capacityMultiplier() {
    return this._capacityMultiplier
  }

  /**
   * 设置外部负重倍率（机体基础 carry）。不触发 change（这是配置，不是背包内容变化）。
   * @param {number} v 正数；非法值会被忽略
   */
  setCapacityMultiplier(v) {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return false
    this._capacityMultiplier = n
    return true
  }

  /** 负重上限（kg，保留 2 位）= base × 机体倍率 × (1 + 组件 carry 加成) */
  get capacityWeight() {
    const bonus = this.totals().carry
    return round2(this._baseCapacity * this._capacityMultiplier * (1 + bonus))
  }

  /** 剩余可承载重量（kg，保留 2 位） */
  get freeWeight() {
    return round2(Math.max(0, this.capacityWeight - this.weight))
  }

  /** { slot: itemId|null }；赋值时走校验（读档路径：game.js 会直接给 equipped 赋值） */
  get equipped() {
    const out = {}
    for (const s of EQUIP_SLOTS) out[s] = this._equipped[s] || null
    return out
  }

  set equipped(value) {
    this._loadEquipped(value)
    this._commit({ type: 'load_equipped' })
  }

  /** [{slot, id, item}] 便于 UI 遍历 */
  equippedList() {
    const out = []
    for (const slot of EQUIP_SLOTS) {
      const id = this._equipped[slot]
      if (!id) continue
      out.push({ slot, id, item: this._defQuiet(id) })
    }
    return out
  }

  /** 背包快照，用于同步到 G.inventory，避免 UI 每帧 getter 复制 */
  toState() {
    return {
      slots: this.slots,
      weight: this.weight,
      capacityWeight: this.capacityWeight,
      slotsMax: this._slotCount,
    }
  }

  // -------------------------------------------------------------------------
  // 查询
  // -------------------------------------------------------------------------

  count(itemId) {
    let n = 0
    for (let i = 0; i < this._slotCount; i++) {
      const s = this._slots[i]
      if (s && s.id === itemId) n += s.n
    }
    return n
  }

  has(itemId, n = 1) {
    const need = toInt(n)
    if (need <= 0) return true
    return this.count(itemId) >= need
  }

  /**
   * 整批 n 个是否放得下（重量 + 格数）。不改背包内容，但会把诊断信息写进 lastError
   * （'weight' | 'slots' | 'unknown'），方便 UI 直接显示「负重不足 / 格子不够」。
   */
  canAdd(itemId, n = 1) {
    this.lastError = null
    const item = this._def(itemId)
    if (!item) {
      this.lastError = 'unknown'
      return false
    }
    const want = toInt(n)
    if (want <= 0) {
      this.lastError = 'count'
      return false
    }
    const plan = this._calcAdd(item, want)
    if (plan.take < want) this.lastError = plan.reason || 'slots'
    return plan.take >= want
  }

  /** 最多还能放几个（不改变背包内容），用于「拾取部分」提示；partial 时同样写 lastError */
  addableCount(itemId, n = 1) {
    this.lastError = null
    const item = this._def(itemId)
    if (!item) {
      this.lastError = 'unknown'
      return 0
    }
    const want = toInt(n)
    if (want <= 0) return 0
    const plan = this._calcAdd(item, want)
    if (plan.take < want) this.lastError = plan.reason || 'slots'
    return plan.take
  }

  /** 该物品当前还能堆进已有格子的数量（不含空格） */
  stackRoom(itemId) {
    const item = this._defQuiet(itemId)
    if (!item) return 0
    const stack = Math.max(1, toInt(item.stack) || 1)
    let room = 0
    for (let i = 0; i < this._slotCount; i++) {
      const s = this._slots[i]
      if (s && s.id === itemId) room += Math.max(0, stack - s.n)
    }
    return room
  }

  /** 第一个装该物品的格子下标，没有返回 -1 */
  indexOf(itemId) {
    for (let i = 0; i < this._slotCount; i++) {
      if (this._slots[i] && this._slots[i].id === itemId) return i
    }
    return -1
  }

  // -------------------------------------------------------------------------
  // 增删
  // -------------------------------------------------------------------------

  /**
   * 加入物品。返回实际加入数量（0 ~ n）。
   * 部分加入时 lastError 标明卡在哪：'weight' 或 'slots'。
   */
  add(itemId, n = 1) {
    this.lastError = null
    const item = this._def(itemId)
    if (!item) {
      this.lastError = 'unknown'
      return 0
    }
    const want = toInt(n)
    if (want <= 0) {
      this.lastError = 'count'
      return 0
    }
    const added = this._addRaw(itemId, want)
    if (added > 0) this._commit({ type: 'add', itemId, n: added })
    return added
  }

  /**
   * 移除物品。返回实际移除数量。空格会被清成 null。
   */
  remove(itemId, n = 1) {
    this.lastError = null
    const want = toInt(n)
    if (want <= 0) {
      this.lastError = 'count'
      return 0
    }
    const removed = this._removeRaw(itemId, want)
    if (removed > 0) this._commit({ type: 'remove', itemId, n: removed })
    return removed
  }

  /**
   * 丢弃：语义上等价于 remove，返回数量。引擎根据返回值生成地面掉落物。
   * 若格子里的数量不够，丢弃全部现有的。
   */
  drop(itemId, n = 1) {
    return this.remove(itemId, n)
  }

  /**
   * 使用物品（走 item.use）。消耗品会被扣掉 1 个，工具类不消耗（可重复使用）。
   * 返回的 effect 由 game 应用，本类不改 hp/energy 等游戏状态。
   * @returns {{ok:boolean, reason?:string, itemId?:string, effect?:object, consumed?:boolean}}
   */
  use(itemId) {
    const item = this._def(itemId)
    if (!item) return { ok: false, reason: 'unknown' }
    if (!item.use || typeof item.use !== 'object') return { ok: false, reason: 'no_use' }
    if (!this.has(itemId, 1)) return { ok: false, reason: 'missing' }
    // 工具（铲/镐/焊枪/扫描仪）是装备，不是消耗品：使用只产生效果，不扣物品。
    // 材料（如润滑油）和消耗品会消耗 1 个。
    const reusable = item.category === 'tool'
    if (!reusable) this.remove(itemId, 1)
    return { ok: true, itemId, effect: { ...item.use }, consumed: !reusable }
  }

  // -------------------------------------------------------------------------
  // 装备（组件槽位）
  // -------------------------------------------------------------------------

  /**
   * 把背包里的一件组件装到对应槽位。旧的会被换回背包。
   * @returns {{ok:boolean, slot?:string, replaced?:string|null, reason?:string}}
   */
  equip(itemId) {
    this.lastError = null
    const item = this._def(itemId)
    if (!item) return { ok: false, reason: 'unknown' }
    const slot = item.slot
    if (!slot || !EQUIP_SLOTS.includes(slot)) return { ok: false, reason: 'not_equippable' }
    if (this._equipped[slot] === itemId) return { ok: false, reason: 'equipped' }
    if (!this.has(itemId, 1)) return { ok: false, reason: 'missing' }

    const prev = this._equipped[slot] || null
    // 先确认换下来的能放回背包，否则不动任何状态。
    if (prev && !this.canAdd(prev, 1)) {
      this.lastError = this._calcAdd(this._defQuiet(prev), 1).reason
      return { ok: false, reason: this.lastError || 'slots', blocked: prev }
    }
    this._removeRaw(itemId, 1)
    this._equipped[slot] = itemId
    if (prev) this._addRaw(prev, 1)
    this._commit({ type: 'equip', itemId, slot, replaced: prev })
    return { ok: true, slot, replaced: prev }
  }

  /**
   * 卸下某槽位，物品回到背包。
   * @returns {{ok:boolean, itemId?:string, reason?:string}}
   */
  unequip(slot) {
    this.lastError = null
    if (!EQUIP_SLOTS.includes(slot)) return { ok: false, reason: 'bad_slot' }
    const cur = this._equipped[slot] || null
    if (!cur) return { ok: false, reason: 'empty' }
    const added = this._addRaw(cur, 1)
    if (added < 1) {
      return { ok: false, reason: this.lastError || 'slots' }
    }
    this._equipped[slot] = null
    this._commit({ type: 'unequip', itemId: cur, slot })
    return { ok: true, itemId: cur, slot }
  }

  /** 汇总已装备组件的 bonus；没有的键也会以 0 出现 */
  totals() {
    const out = {}
    for (const k of TOTAL_KEYS) out[k] = 0
    for (const slot of EQUIP_SLOTS) {
      const id = this._equipped[slot]
      if (!id) continue
      const item = this._defQuiet(id)
      if (!item || !item.bonus) continue
      for (const key of Object.keys(item.bonus)) {
        const v = Number(item.bonus[key])
        if (!Number.isFinite(v)) continue
        out[key] = (out[key] || 0) + v
      }
    }
    return out
  }

  // -------------------------------------------------------------------------
  // 序列化
  // -------------------------------------------------------------------------

  serialize() {
    return {
      v: SAVE_VERSION,
      slotsMax: this._slotCount,
      baseCapacity: this._baseCapacity,
      capacityMultiplier: this._capacityMultiplier,
      slots: this._slots.map((s) => (s ? [s.id, s.n] : null)),
      equipped: this.equipped,
    }
  }

  /** 读档：容错（未知 id 丢弃并 warn，超堆叠会被夹住），失败不 throw */
  load(data) {
    this.lastError = null
    if (!data || typeof data !== 'object') {
      this.lastError = 'bad_data'
      return false
    }
    if (data.slotsMax != null) {
      const n = toInt(data.slotsMax)
      if (n > 0 && n !== this._slotCount) {
        this._slotCount = Math.min(n, 512)
        this._slots = new Array(this._slotCount).fill(null)
      }
    }
    const base = Number(data.baseCapacity)
    if (Number.isFinite(base) && base > 0) this._baseCapacity = base
    const mult = Number(data.capacityMultiplier)
    if (Number.isFinite(mult) && mult > 0) this._capacityMultiplier = mult

    this._slots = new Array(this._slotCount).fill(null)
    const raw = Array.isArray(data.slots) ? data.slots : []
    for (let i = 0; i < raw.length && i < this._slotCount; i++) {
      const entry = raw[i]
      if (!entry) continue
      let id = null
      let n = 0
      if (Array.isArray(entry)) {
        id = entry[0]
        n = toInt(entry[1])
      } else if (typeof entry === 'object') {
        id = entry.id
        n = toInt(entry.n)
      } else if (typeof entry === 'string') {
        id = entry
        n = 1
      }
      if (!id || n <= 0) continue
      const item = this._def(id)
      if (!item) continue
      const stack = Math.max(1, toInt(item.stack) || 1)
      this._slots[i] = { id, n: Math.min(n, stack), item }
    }
    this._loadEquipped(data.equipped)
    this._commit({ type: 'load' })
    return true
  }

  // -------------------------------------------------------------------------
  // 变更订阅 / 清空
  // -------------------------------------------------------------------------

  /** 注册变化回调，返回取消函数 */
  onChange(cb) {
    if (typeof cb !== 'function') throw new TypeError('[inventory] onChange needs a function')
    this._listeners.add(cb)
    return () => this.offChange(cb)
  }

  offChange(cb) {
    this._listeners.delete(cb)
  }

  /** 清空背包与装备，并通知一次 */
  clear() {
    for (let i = 0; i < this._slotCount; i++) this._slots[i] = null
    for (const s of EQUIP_SLOTS) this._equipped[s] = null
    this.lastError = null
    this._commit({ type: 'clear' })
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  /** 取定义；未知 id 只 warn 一次 */
  _def(itemId) {
    if (typeof itemId !== 'string' || !itemId) return null
    const def = Content.get(KIND.ITEM, itemId)
    if (def) return def
    this._warnOnce(itemId)
    return null
  }

  /** 取定义；静默（读档/装备槽里的旧 id 不该刷屏） */
  _defQuiet(itemId) {
    if (typeof itemId !== 'string' || !itemId) return null
    return Content.get(KIND.ITEM, itemId)
  }

  _warnOnce(itemId) {
    if (this._quiet) return
    const key = String(itemId)
    if (this._warned.has(key)) return
    this._warned.add(key)
    console.warn(`[inventory] unknown item id "${key}" (ignored)`)
  }

  /** 纯计算：{take, reason}。reason 是卡住的约束，take 是能放进去的数量 */
  _calcAdd(item, want) {
    const stack = Math.max(1, Math.min(MAX_STACK, toInt(item.stack) || 1))
    const per = Math.max(0, Number(item.weight) || 0)
    const freeWeight = Math.max(0, this.capacityWeight - this.weight)

    let byWeight = want
    if (per > 0) {
      byWeight = Math.floor(freeWeight / per + EPS)
      if (byWeight < 0) byWeight = 0
    }

    // 先填已有半格，再开新格
    let bySlots = 0
    for (let i = 0; i < this._slotCount; i++) {
      const s = this._slots[i]
      if (!s) {
        bySlots += stack
      } else if (s.id === item.id) {
        bySlots += Math.max(0, stack - s.n)
      }
      if (bySlots >= want) {
        bySlots = want
        break
      }
    }

    const take = Math.max(0, Math.min(want, byWeight, bySlots))
    let reason = null
    if (take < want) reason = byWeight <= bySlots ? 'weight' : 'slots'
    return { take, reason }
  }

  /** 实际写入（不 commit），返回加入数量 */
  _addRaw(itemId, want) {
    const item = this._defQuiet(itemId)
    if (!item) {
      this.lastError = 'unknown'
      return 0
    }
    const stack = Math.max(1, Math.min(MAX_STACK, toInt(item.stack) || 1))
    const plan = this._calcAdd(item, want)
    if (plan.take <= 0) {
      this.lastError = plan.reason || 'slots'
      return 0
    }
    let left = plan.take
    // 1) 合并到已有堆叠
    for (let i = 0; i < this._slotCount && left > 0; i++) {
      const s = this._slots[i]
      if (!s || s.id !== itemId) continue
      const room = Math.max(0, stack - s.n)
      if (room <= 0) continue
      const put = Math.min(room, left)
      s.n += put
      left -= put
    }
    // 2) 开新格
    for (let i = 0; i < this._slotCount && left > 0; i++) {
      if (this._slots[i]) continue
      const put = Math.min(stack, left)
      this._slots[i] = { id: itemId, n: put, item }
      left -= put
    }
    const added = plan.take - left
    if (added < want) this.lastError = plan.reason || 'slots'
    return added
  }

  /** 实际移除（不 commit），返回移除数量；优先从后往前清，保持前面的堆叠完整 */
  _removeRaw(itemId, want) {
    let left = want
    for (let i = this._slotCount - 1; i >= 0 && left > 0; i--) {
      const s = this._slots[i]
      if (!s || s.id !== itemId) continue
      const take = Math.min(s.n, left)
      s.n -= take
      left -= take
      if (s.n <= 0) this._slots[i] = null
    }
    return want - left
  }

  _loadEquipped(raw) {
    for (const s of EQUIP_SLOTS) this._equipped[s] = null
    if (!raw || typeof raw !== 'object') return
    for (const slot of EQUIP_SLOTS) {
      const id = raw[slot]
      if (!id || typeof id !== 'string') continue
      const item = this._defQuiet(id)
      if (!item) continue
      if (item.slot !== slot) continue
      this._equipped[slot] = id
    }
  }

  _commit(payload = {}) {
    const info = { inventory: this, ...payload }
    // 引擎侧统一入口
    Events.emit(EV.INVENTORY_CHANGED, info)
    // 本实例自己的订阅者（多个 UI 面板可以各挂一个）
    for (const fn of [...this._listeners]) {
      try {
        fn(info)
      } catch (err) {
        console.error('[inventory] change handler failed', err)
      }
    }
  }
}

/** 工厂函数：引擎里直接 new 也行 */
export function createInventory(opts = {}) {
  return new Inventory(opts)
}

export default Inventory
