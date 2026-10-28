// 锈雨 · RUSTFALL —— 关卡专属收集品注册
//
// 570 件遗物（190 房 × 3）的数据在 world/rooms/*.js，本模块只负责把它们
// 注册进 Content(KIND.ITEM)，让 loot / 背包 / 图鉴 / 图标系统统一识别。
// 每件都带 iconSpec，render/art/items.js 会走 paintCollectibleIcon 画专属图标。
import { Content, KIND } from '../core/registry.js'
import { ROOM_COLLECTIBLE_DEFS } from '../world/rooms/index.js'

export const ROOM_COLLECTIBLE_COUNT = Object.keys(ROOM_COLLECTIBLE_DEFS).length

let registered = 0
for (const def of Object.values(ROOM_COLLECTIBLE_DEFS)) {
  if (Content.get(KIND.ITEM, def.id)) continue
  Content.register(
    KIND.ITEM,
    def.id,
    {
      ...def,
      id: def.id,
      // 收集品不做装备/消耗，只用于收藏与兑换；art 提示走专属 iconSpec
      art: 'relic',
      slot: null,
      use: null,
      stack: 1,
    },
    'rooms',
  )
  registered++
}

/** 本模块实际新注册的数量（自检用） */
export const ROOM_COLLECTIBLES_REGISTERED = registered
