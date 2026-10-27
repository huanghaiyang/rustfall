import { generateRoom } from './roomgen.js'

// 地区：一条由四间房组成的线性遗迹。两端各有一处庇护所。
export const REGION = {
  id: 'foundations',
  name: '沉默的地基',
  subtitle: 'THE SILENT FOUNDATIONS',
  startRoom: 'r0',
  rooms: {
    r0: {
      id: 'r0',
      name: '空巢',
      seed: 0x1a2b3c,
      w: 56,
      h: 32,
      fruits: 4,
      batflies: 1,
      lizards: 0,
      shelter: true,
      shelterSide: 'left',
      exits: { right: 'r1' },
    },
    r1: {
      id: 'r1',
      name: '裂缝长廊',
      seed: 0x5f1e77,
      w: 64,
      h: 34,
      fruits: 4,
      batflies: 2,
      lizards: 0,
      exits: { left: 'r0', right: 'r2' },
    },
    r2: {
      id: 'r2',
      name: '沉柱之厅',
      seed: 0x77c9d1,
      w: 70,
      h: 36,
      fruits: 5,
      batflies: 2,
      lizards: 1,
      water: true,
      exits: { left: 'r1', right: 'r3' },
    },
    r3: {
      id: 'r3',
      name: '育巢',
      seed: 0x2e9f44,
      w: 58,
      h: 32,
      fruits: 4,
      batflies: 2,
      lizards: 1,
      shelter: true,
      shelterSide: 'right',
      exits: { left: 'r2' },
    },
  },
}

const cache = new Map()

/** 取得（并缓存）某房间的生成结果 */
export function getRoomData(id) {
  if (cache.has(id)) return cache.get(id)
  const spec = REGION.rooms[id]
  if (!spec) throw new Error('unknown room ' + id)
  const data = generateRoom(spec)
  cache.set(id, data)
  return data
}

/** 每个雨循环重置房间内实体状态（地形不变） */
export function resetRoomData(data) {
  data.fruits.forEach((f) => (f.eaten = false))
  data.batflies.forEach((b) => (b.caught = false))
}
