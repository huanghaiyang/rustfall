// ============================================================================
// BOSS 测试房 —— 每只站点 BOSS 一间专属试炼场
// ----------------------------------------------------------------------------
// 场地复用该 BOSS 所属主题站点的 biome / variant / 景物 / 配色，
// 再按 bossId 派生独立种子，挖出「高台 + 深坑 + 单向平台」的高低落差地形：
//   · 左右两侧各一座可跳上的高台（带 1 格阶梯，不会卡死）
//   · 中场下沉 2~4 格的坑，坑壁带斜坡，BOSS 与玩家都能进出
//   · 不同高度的单向平台，方便测试跳跃、下落攻击与远程弹道
// 房间两端封门，避免误走出测试房；重生点固定在左侧低地。
// ============================================================================

import { THEMES } from './themes.js'
import { T } from './tilemap.js'
import { TS } from '../config.js'
import { makeRng } from '../render/rng.js'

function hashStr(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// 51 只主题 BOSS → 51 间测试房
export const BOSS_TESTS = Object.values(THEMES)
  .filter((t) => t && t.boss)
  .map((t) => ({
    bossId: t.boss,
    themeId: t.id,
    name: t.name,
    en: t.en,
    biome: t.biome,
    variant: t.variant,
    accent: t.accent,
    w: t.w,
    h: t.h,
    seed: (hashStr(t.boss) ^ 0x5bd1e995) >>> 0,
  }))
  .sort((a, b) => (a.themeId < b.themeId ? -1 : 1))

const BY_BOSS = new Map(BOSS_TESTS.map((t) => [t.bossId, t]))

export function getBossTest(bossId) {
  return BY_BOSS.get(String(bossId || '')) || null
}

export function bossTestRoomId(bossId) {
  return String(bossId || '')
}

/** 测试房 spec：直接把主题站点参数喂给 biome 生成器。 */
export function buildBossTestSpec(bossId) {
  const t = getBossTest(bossId)
  if (!t) return null
  return {
    regionId: 'boss_test',
    roomId: t.bossId,
    id: `test_${t.bossId}`,
    label: `BOSS 测试房 · ${t.name}`,
    biome: t.biome,
    kind: 'boss',
    variant: t.variant,
    theme: t.themeId,
    w: t.w,
    h: t.h,
    seed: t.seed,
    monsterCount: 0,
    fruits: 6,
    batflies: 3,
    lizards: 0,
  }
}

/**
 * 高低落差改造：原地形已保证主路连续，这里只加「可跳上去」的高台、
 * 「可走进走出」的深坑和不挡路的单向平台。
 */
export function carveBossTestArena(gen, test) {
  if (!gen || !gen.map || !Array.isArray(gen.floorY)) return gen
  const { map, floorY, ceilY, w, h } = gen
  const rng = makeRng((test?.seed ?? 1) ^ 0x9e3779b9)
  const padL = 8
  const padR = 8

  const pushPlatform = (x0, row, len) => {
    let made = 0
    for (let x = x0; x < x0 + len && x < w - padR; x++) {
      if (x < padL) continue
      if (row <= (ceilY[x] ?? 0) + 3) continue
      if (map.get(x, row) !== T.EMPTY) continue
      map.set(x, row, T.PLATFORM)
      made++
    }
    if (made && Array.isArray(gen.platforms)) gen.platforms.push({ x: x0, y: row, w: made })
  }

  const raise = (x0, x1, rise) => {
    for (let x = x0; x <= x1; x++) {
      if (x < padL || x >= w - padR) continue
      const limit = Math.max(0, floorY[x] - ((ceilY[x] ?? 0) + 5))
      const r = Math.min(rise, limit)
      if (r <= 0) continue
      const nf = floorY[x] - r
      for (let y = nf; y < floorY[x]; y++) map.set(x, y, T.SOLID)
      floorY[x] = nf
    }
    // 两侧补 1 格阶梯，保证能跳上去
    const ramp = (x, dir) => {
      for (let k = 1; k <= 2; k++) {
        const xx = x + dir * k
        if (xx < padL || xx >= w - padR) continue
        const nf = floorY[x] - Math.min(k, rise)
        if (nf < floorY[xx]) {
          for (let y = nf; y < floorY[xx]; y++) map.set(xx, y, T.SOLID)
          floorY[xx] = nf
        }
      }
    }
    ramp(x0, -1)
    ramp(x1, 1)
  }

  const sink = (x0, x1, depth) => {
    for (let x = x0; x <= x1; x++) {
      if (x < padL || x >= w - padR) continue
      const nf = Math.min(h - 2, floorY[x] + depth)
      for (let y = floorY[x]; y < nf; y++) if (map.get(x, y) !== T.WATER) map.set(x, y, T.EMPTY)
      map.set(x, nf, T.SOLID)
      floorY[x] = nf
    }
    // 坑壁斜坡：每列最多降 1 格，保证能走下去
    for (let x = x0 - 1; x >= x0 - 3 && x >= padL; x--) {
      const nf = Math.min(floorY[x + 1] - 1, floorY[x] + 3)
      if (nf > floorY[x]) {
        for (let y = floorY[x]; y < nf; y++) map.set(x, y, T.EMPTY)
        map.set(x, nf, T.SOLID)
        floorY[x] = nf
      }
    }
    for (let x = x1 + 1; x <= x1 + 3 && x < w - padR; x++) {
      const nf = Math.min(floorY[x - 1] - 1, floorY[x] + 3)
      if (nf > floorY[x]) {
        for (let y = floorY[x]; y < nf; y++) map.set(x, y, T.EMPTY)
        map.set(x, nf, T.SOLID)
        floorY[x] = nf
      }
    }
  }

  // 每只 BOSS 的布局由种子决定：高台左右、高度、坑的位置与深度
  const leftRise = 3 + (rng.int(0, 3) | 0)
  const rightRise = 4 + (rng.int(0, 4) | 0)
  const leftW = 8 + (rng.int(0, 5) | 0)
  const rightW = 9 + (rng.int(0, 5) | 0)
  raise(padL + 2, padL + 2 + leftW, leftRise)
  raise(w - padR - 2 - rightW, w - padR - 2, rightRise)

  const pitW = Math.max(10, Math.round(w * (0.12 + rng.range(0, 0.06))))
  const pitX = Math.round(w * (0.43 + rng.range(-0.04, 0.04)))
  sink(pitX, pitX + pitW, 2 + (rng.int(0, 2) | 0))

  // 三级单向平台：低位跨坑、中位贴高台、高位在坑上方
  const base = Math.min(...floorY.slice(padL, w - padR))
  pushPlatform(pitX + 2, base - 4, Math.max(4, pitW - 4))
  pushPlatform(padL + 4 + leftW + 2, base - 6, 4 + (rng.int(0, 3) | 0))
  pushPlatform(w - padR - 10 - rightW, base - 8, 4 + (rng.int(0, 3) | 0))
  pushPlatform(Math.round(w * 0.3), base - 10, 4 + (rng.int(0, 3) | 0))

  // 封住左右门洞（测试房不走出去），并把重生点放在左侧低地
  const doorSeal = (side) => {
    const cols = side === 'left' ? [0, 1, 2, 3, 4, 5] : [w - 6, w - 5, w - 4, w - 3, w - 2, w - 1]
    for (const x of cols) {
      const row = floorY[x]
      for (let y = 0; y < row; y++) map.set(x, y, T.SOLID)
      map.set(x, row, T.SOLID)
    }
  }
  doorSeal('left')
  doorSeal('right')

  const sx = Math.min(w - 20, padL + 4 + leftW + 6)
  gen.spawn = { x: sx * TS + TS / 2, y: floorY[sx] * TS }

  // 玩家重生点在改地形后可能悬空，向上找最近的落脚面
  const findFloor = (x) => {
    const tx = Math.max(1, Math.min(w - 2, Math.floor(x / TS)))
    for (let ty = 1; ty < h - 1; ty++) {
      if (map.isSolid(tx, ty) && !map.isSolid(tx, ty - 1)) return { x: tx * TS + TS / 2, y: ty * TS }
    }
    return { x: gen.spawn.x, y: floorY[tx] * TS }
  }
  const near = findFloor(gen.spawn.x)
  const dx = Math.abs(near.x - gen.spawn.x)
  if (dx < TS * 6 && near.y <= gen.spawn.y + TS * 2) gen.spawn = near

  gen.testRoom = true
  gen.kind = 'boss'
  gen.monsters = []
  return gen
}
