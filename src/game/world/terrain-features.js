import { T } from './tilemap.js'
import { mulberry32 } from '../render/rng.js'
import { rollLoot, tableFor } from '../loot/loot-tables.js'

/**
 * 在生成好的房间上追加「可交互地形」：
 *  - SOIL：地表泥土带，工兵铲可挖开，里面常埋着东西
 *  - CRACKED：裂墙，破拆镐可打穿（会挖出通路，可能通向埋藏点）
 *  - TOXIC：工厂/垃圾场的酸液池（走进去持续腐蚀）
 *  - 埋藏战利品：挂在土里，扫描仪可显形，挖开后可捡
 *
 * 纯确定性：同一房间 + 同一 seed 总是同样结果；不写回存档，属于地形基线。
 */
export function decorateTerrain(gen, opts = {}) {
  const map = gen.map
  const w = gen.w
  const h = gen.h
  const biome = gen.biome || 'city'
  const seed = (gen.seed | 0) || (opts.seed | 0) || 12345
  const rnd = mulberry32(seed ^ 0x9e3779b9)
  const counts = { soil: 0, cracked: 0, toxic: 0, buried: 0 }

  const floors = normalizeFloors(gen.floorY)
  const base = floors.length ? floors[Math.floor(floors.length / 2)] : Math.floor(h * 0.75)

  const solid = (x, y) => map.get(x, y) === T.SOLID
  const air = (x, y) => {
    const v = map.get(x, y)
    return v === T.EMPTY || v === T.PLATFORM || v === T.POLE
  }

  // ---- 1. 泥土带：只出现在「地表第一层实心」且上方是空气的列 ----
  for (let x = 2; x < w - 2; x++) {
    if (rnd() > 0.34) continue
    const f = floors[x] ?? base
    let y = f
    // 找到该列的地表实心行
    let guard = 0
    while (y < h - 4 && !(solid(x, y) && air(x, y - 1)) && guard++ < 8) y++
    if (y >= h - 4 || !solid(x, y)) continue
    const len = 1 + Math.floor(rnd() * 3)
    for (let k = 0; k < len && x + k < w - 2; k++) {
      if (solid(x + k, y) && air(x + k, y - 1)) {
        map.set(x + k, y, T.SOIL)
        counts.soil++
      }
    }
    // 土里埋东西
    if (rnd() < 0.5) {
      const table = tableFor(biome, 'buried') || tableFor(biome, 'rubble')
      const drops = rollLoot(table, rnd)
      if (drops.length) {
        const d = drops[0]
        gen.loot = gen.loot || []
        gen.loot.push({ id: d.id, x: x * 32 + 16, y: y * 32 + 10, buried: true, n: d.n || 1 })
        counts.buried++
      }
    }
  }

  // ---- 2. 裂墙：贴着空气的实心墙，成簇 ----
  const crackedTries = 60 + Math.floor(rnd() * 30)
  for (let i = 0; i < crackedTries; i++) {
    const x = 3 + Math.floor(rnd() * (w - 6))
    const y = 4 + Math.floor(rnd() * Math.max(4, base - 6))
    if (!solid(x, y)) continue
    if (!air(x - 1, y) && !air(x + 1, y) && !air(x, y - 1) && !air(x, y + 1)) continue
    const size = 3 + Math.floor(rnd() * 4)
    const vertical = rnd() < 0.55
    for (let k = 0; k < size; k++) {
      const tx = vertical ? x : x + k
      const ty = vertical ? y + k : y
      if (solid(tx, ty) && tx > 1 && tx < w - 2 && ty > 1 && ty < h - 2) {
        map.set(tx, ty, T.CRACKED)
        counts.cracked++
      }
    }
  }

  // ---- 3. 酸液池：工厂 / 垃圾场把部分水体换成毒液，并补几个地面酸洼 ----
  if (biome === 'factory' || biome === 'dump') {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (map.get(x, y) === T.WATER && rnd() < 0.75) {
          map.set(x, y, T.TOXIC)
          counts.toxic++
        }
      }
    }
    const puddles = 3 + Math.floor(rnd() * 4)
    for (let i = 0; i < puddles; i++) {
      const x = 3 + Math.floor(rnd() * (w - 6))
      const f = floors[x] ?? base
      if (air(x, f - 1) && air(x, f - 2) && solid(x, f)) {
        for (let k = 0; k < 2 + Math.floor(rnd() * 3) && x + k < w - 2; k++) {
          if (air(x + k, f - 1) && solid(x + k, f)) {
            map.set(x + k, f - 1, T.TOXIC)
            counts.toxic++
          }
        }
      }
    }
  }

  gen.terrainFeatures = counts
  return counts
}

function normalizeFloors(f) {
  if (typeof f === 'number') return [f]
  if (Array.isArray(f)) return f.filter((n) => typeof n === 'number')
  if (f && typeof f === 'object') return Object.values(f).filter((n) => typeof n === 'number')
  return []
}
