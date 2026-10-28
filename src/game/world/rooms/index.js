// 锈雨 · RUSTFALL —— 190 间房的专属内容总索引
//
// 数据源：rooms/{region}.js（纯数据）。本模块只做扁平化，不注册任何东西：
//   ROOM_CONTENT               roomId -> { props, minions, collectibles }
//   ROOM_PROP_DEFS             kind   -> prop def（由 props-data.js 合并）
//   ROOM_PROP_SPECS_BY_ROOM    roomId -> [prop def]（scene-terrain 摆放用）
//   ROOM_MINION_DEFS           id     -> minion def（由 room-minions.js 建类）
//   ROOM_MINION_IDS_BY_ROOM    roomId -> [minion id]（biomes 刷怪用）
//   ROOM_COLLECTIBLE_DEFS      id     -> item def（由 loot/collectibles.js 注册）
//   ROOM_COLLECTIBLE_IDS_BY_ROOM roomId -> [item id]（placeLoot 掉落用）

import { CITY_ROOM_CONTENT } from './city.js'
import { VILLAGE_ROOM_CONTENT } from './village.js'
import { FACTORY_ROOM_CONTENT } from './factory.js'
import { DUMP_ROOM_CONTENT } from './dump.js'
import { METRO_ROOM_CONTENT } from './metro.js'
import { HOSPITAL_ROOM_CONTENT } from './hospital.js'
import { PORT_ROOM_CONTENT } from './port.js'
import { FRONTIER_ROOM_CONTENT } from './frontier.js'
import { OLD_TOWN_ROOM_CONTENT } from './old_town.js'
import { UNDERWORLD_ROOM_CONTENT } from './underworld.js'
import { MIST_ROOM_CONTENT } from './mist.js'

export const ROOM_CONTENT = {
  ...CITY_ROOM_CONTENT,
  ...VILLAGE_ROOM_CONTENT,
  ...FACTORY_ROOM_CONTENT,
  ...DUMP_ROOM_CONTENT,
  ...METRO_ROOM_CONTENT,
  ...HOSPITAL_ROOM_CONTENT,
  ...PORT_ROOM_CONTENT,
  ...FRONTIER_ROOM_CONTENT,
  ...OLD_TOWN_ROOM_CONTENT,
  ...UNDERWORLD_ROOM_CONTENT,
  ...MIST_ROOM_CONTENT,
}

export const ROOM_IDS = Object.keys(ROOM_CONTENT)

export const ROOM_PROP_DEFS = {}
export const ROOM_PROP_SPECS_BY_ROOM = {}
export const ROOM_MINION_DEFS = {}
export const ROOM_MINION_IDS_BY_ROOM = {}
export const ROOM_COLLECTIBLE_DEFS = {}
export const ROOM_COLLECTIBLE_IDS_BY_ROOM = {}

for (const [roomId, content] of Object.entries(ROOM_CONTENT)) {
  ROOM_PROP_SPECS_BY_ROOM[roomId] = content.props
  ROOM_MINION_IDS_BY_ROOM[roomId] = content.minions.map((m) => m.id)
  ROOM_COLLECTIBLE_IDS_BY_ROOM[roomId] = content.collectibles.map((c) => c.id)
  for (const p of content.props) ROOM_PROP_DEFS[p.kind] = p
  for (const m of content.minions) ROOM_MINION_DEFS[m.id] = m
  for (const c of content.collectibles) ROOM_COLLECTIBLE_DEFS[c.id] = c
}

export const ROOM_CONTENT_STATS = {
  rooms: 190,
  props: 1900,
  minions: 570,
  collectibles: 570,
}