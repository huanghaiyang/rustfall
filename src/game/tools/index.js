// 工具定义 + 地形编辑（挖土/破墙/焊接/扫描）
import { TS } from '../config.js'
import { T } from '../world/tilemap.js'
import { Content, KIND } from '../core/registry.js'
import { Events, EV } from '../core/events.js'

export const TOOLS = [
  {
    id: 'shovel',
    name: '工兵铲',
    en: 'SHOVEL',
    desc: '挖开松土，翻出埋在废墟下的东西。也能砸东西。',
    damage: 9,
    dig: true,
    digRadius: 1,
    cooldown: 0.42,
    reach: 58,
    color: 0xc07038,
    sound: 'step',
  },
  {
    id: 'pickaxe',
    name: '破拆镐',
    en: 'PICKAXE',
    desc: '裂墙的克星。挥起来也够重，适合打开机器人的外壳。',
    damage: 18,
    breakTiles: true,
    cooldown: 0.6,
    reach: 58,
    color: 0x9aa8ae,
    sound: 'land',
  },
  {
    id: 'welder',
    name: '电弧焊枪',
    en: 'WELDER',
    desc: '修补中继、发电机、牢笼和同伴。别对着自己的关节。',
    damage: 6,
    repair: true,
    cooldown: 0.55,
    reach: 66,
    color: 0xf2b34a,
    sound: 'thunder',
  },
  {
    id: 'scanner',
    name: '回响扫描仪',
    en: 'SCANNER',
    desc: '发出一次脉冲，标出附近的埋藏物与可交互目标。',
    damage: 4,
    scan: true,
    cooldown: 1.1,
    reach: 320,
    color: 0x8fe8ff,
    sound: 'uiHover',
  },
]

for (const t of TOOLS) {
  Content.register(KIND.TOOL, t.id, t, 'core')
}

export function getTool(id) {
  return Content.get(KIND.TOOL, id) || TOOLS[0]
}

/** 地形编辑结果 */
export function editTerrain(room, toolId, x, y, dir = 1) {
  const map = room.map
  if (!map) return { changed: false }
  const tool = getTool(toolId)
  const hits = []
  const reach = tool.reach || 56
  const cx = x + dir * Math.min(20, reach * 0.35)
  const { tx, ty } = map.tileAt(cx, y)
  const radius = tool.digRadius || 1
  let destroyed = 0
  let dug = 0

  const tryTile = (tx2, ty2) => {
    const t = map.get(tx2, ty2)
    if (tool.dig && t === T.SOIL) {
      const r = map.damageTile(tx2, ty2, 2)
      if (r.destroyed) {
        destroyed++
        dug++
        hits.push({ tx: tx2, ty: ty2, tile: t, destroyed: true })
        Events.emit(EV.ROOM_DIRTY, { roomId: room.data.roomId, tx: tx2, ty: ty2, type: T.EMPTY })
        room.onTileDug?.(tx2, ty2)
      } else {
        hits.push({ tx: tx2, ty: ty2, tile: t, destroyed: false })
      }
      return
    }
    if (tool.breakTiles && t === T.CRACKED) {
      const r = map.damageTile(tx2, ty2, 1)
      if (r.destroyed) {
        destroyed++
        hits.push({ tx: tx2, ty: ty2, tile: t, destroyed: true })
        Events.emit(EV.ROOM_DIRTY, { roomId: room.data.roomId, tx: tx2, ty: ty2, type: T.EMPTY })
        room.onTileDug?.(tx2, ty2)
      } else {
        hits.push({ tx: tx2, ty: ty2, tile: t, destroyed: false, hp: r.hp })
      }
    }
  }

  if (tool.dig || tool.breakTiles) {
    for (let dy = -1; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        tryTile(tx + dx, ty + dy)
      }
    }
    // 也试试脚下与正前方
    tryTile(tx, ty + 1)
    tryTile(tx + dir, ty)
  }

  return { changed: destroyed > 0, destroyed, dug, hits, tool }
}

/** 扫描：返回附近可关注目标（埋藏物/隐藏物/可交互物） */
export function scanArea(game, radius = 320) {
  const p = game.player
  if (!p) return { loot: [], props: [], landmarks: [] }
  const out = { loot: [], props: [], landmarks: [], cages: [] }
  const cx = p.centerX
  const cy = p.centerY
  const near = (x, y) => Math.hypot(x - cx, y - cy) <= radius
  for (const l of game.room?.lootDrops || []) {
    if (l.hidden || l.buried) {
      if (near(l.x, l.y)) {
        l.reveal()
        out.loot.push(l)
      }
    }
  }
  for (const pr of game.room?.interactables || []) {
    if (pr.hidden) {
      if (near(pr.x, pr.y)) {
        pr.reveal?.()
        out.props.push(pr)
      }
    } else if (near(pr.x, pr.y) && pr.questTarget) {
      out.props.push(pr)
    }
  }
  for (const cage of game.room?.cages || []) {
    if (near(cage.x, cage.y)) out.cages.push(cage)
  }
  game.scanPulseFx?.(cx, cy)
  Events.emit('scan:done', out)
  return out
}
