// 极简事件总线：内容注册、任务进度、UI 通知都走这里
export class EventBus {
  constructor() {
    this._map = new Map()
  }
  on(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('handler must be a function')
    let set = this._map.get(type)
    if (!set) {
      set = new Set()
      this._map.set(type, set)
    }
    set.add(fn)
    return () => this.off(type, fn)
  }
  once(type, fn) {
    const off = this.on(type, (payload) => {
      off()
      fn(payload)
    })
    return off
  }
  off(type, fn) {
    const set = this._map.get(type)
    if (set) {
      set.delete(fn)
      if (!set.size) this._map.delete(type)
    }
  }
  emit(type, payload) {
    const set = this._map.get(type)
    if (!set) return
    for (const fn of [...set]) {
      try {
        fn(payload)
      } catch (err) {
        console.error(`[events] handler for "${type}" failed`, err)
      }
    }
  }
  clear(type) {
    if (type) this._map.delete(type)
    else this._map.clear()
  }
  count(type) {
    return this._map.get(type)?.size || 0
  }
}

export const Events = new EventBus()

// 常用事件名（避免拼写漂移）
export const EV = {
  REGISTER: 'content:register',
  INVENTORY_CHANGED: 'inventory:changed',
  ITEM_ADDED: 'inventory:added',
  ITEM_REMOVED: 'inventory:removed',
  QUEST_STARTED: 'quest:started',
  QUEST_PROGRESS: 'quest:progress',
  QUEST_COMPLETED: 'quest:completed',
  QUEST_FAILED: 'quest:failed',
  DIALOGUE_START: 'dialogue:start',
  DIALOGUE_END: 'dialogue:end',
  CHASSIS_SWITCH: 'player:chassis',
  TOOL_SWITCH: 'player:tool',
  PLAYER_HURT: 'player:hurt',
  PLAYER_DEATH: 'player:death',
  MONSTER_KILLED: 'monster:killed',
  LOOT_PICKED: 'loot:picked',
  ROOM_ENTER: 'room:enter',
  ROOM_DIRTY: 'room:dirty',
  NOTIFY: 'ui:notify',
  ARCHIVE_ADD: 'archive:add',
  MOD_LOADED: 'mod:loaded',
  MOD_ERROR: 'mod:error',
  FLAG_SET: 'state:flag',
  SIGNAL_CHANGED: 'state:signal',
  RESCUE_STARTED: 'rescue:started',
  RESCUE_COMPLETED: 'rescue:completed',
  SAVE_WRITTEN: 'save:written',
}
