import { Tilemap, T } from './tilemap.js'
import { TS } from '../config.js'
import { makeRng, valueNoise1D, clamp } from '../render/rng.js'

/**
 * 程序化生成一个房间：连续的可行走主廊道 + 天花/地面起伏 + 单向平台 +
 * 攀爬杆井 + 水坑 + 左右通道口 + 可选庇护所 + 食物/生物出生点。
 * 同一 seed 永远生成同一房间。
 */
export function generateRoom(spec) {
  const rng = makeRng(spec.seed)
  const w = spec.w
  const h = spec.h
  const map = new Tilemap(w, h, T.SOLID)

  const baseFloor = h - 7
  const floorY = new Int16Array(w)
  const ceilY = new Int16Array(w)

  // ---------- 1. 地面与天花板曲线（限定坡度保证可通行） ----------
  const n1 = valueNoise1D(spec.seed * 7 + 11, w, 11)
  const n2 = valueNoise1D(spec.seed * 13 + 29, w, 3.5)
  const n3 = valueNoise1D(spec.seed * 31 + 7, w, 14)
  let prev = baseFloor
  for (let x = 0; x < w; x++) {
    let target = baseFloor + Math.round(n1[x] * 5 + n2[x] * 1.7)
    target = clamp(target, h - 12, h - 5)
    target = clamp(target, prev - 1, prev + 1)
    floorY[x] = target
    prev = target
  }
  for (let x = 0; x < w; x++) {
    const corridor = clamp(Math.round(12 + n3[x] * 5.5), 8, 19)
    ceilY[x] = clamp(floorY[x] - corridor, 2, floorY[x] - 7)
  }

  // ---------- 2. 挖出主廊道 ----------
  const carveColumn = (x, top, bottom) => {
    for (let y = top; y < bottom; y++) map.set(x, y, T.EMPTY)
  }
  for (let x = 0; x < w; x++) carveColumn(x, ceilY[x], floorY[x])

  // ---------- 3. 左右通道口（与相邻房间衔接） ----------
  const doorH = 6
  const doorInset = 4
  const leftFloor = floorY[doorInset]
  const rightFloor = floorY[w - 1 - doorInset]
  const carveDoor = (x, floorTop) => {
    floorY[x] = floorTop
    ceilY[x] = floorTop - doorH
    for (let y = 0; y < h; y++) {
      const open = y >= floorTop - doorH && y < floorTop
      map.set(x, y, open ? T.EMPTY : T.SOLID)
    }
  }
  for (let x = 0; x < doorInset + 1; x++) carveDoor(x, leftFloor)
  for (let x = w - 1 - doorInset; x < w; x++) carveDoor(x, rightFloor)

  // ---------- 4. 水坑（若允许） ----------
  const pools = []
  if (spec.water) {
    const poolCount = rng.int(1, 2)
    for (let i = 0; i < poolCount; i++) {
      const pw = rng.int(4, 7)
      const px = rng.int(Math.floor(w * 0.3), Math.floor(w * 0.75))
      const poolFloor = Math.min(h - 5, Math.max(...floorY.slice(px, px + pw)) + 3)
      for (let x = px; x < px + pw && x < w - doorInset - 1; x++) {
        floorY[x] = poolFloor
        for (let y = ceilY[x]; y < poolFloor; y++) map.set(x, y, T.EMPTY)
        for (let y = poolFloor - 3; y < poolFloor; y++) map.set(x, y, T.WATER)
      }
      pools.push({ x: px, w: pw, floor: poolFloor })
    }
  }

  // ---------- 5. 单向平台 ----------
  const platforms = []
  const platformCount = Math.round(w / 5)
  for (let i = 0; i < platformCount; i++) {
    const px = rng.int(doorInset + 3, w - doorInset - 8)
    const py = floorY[px] - rng.int(4, 9)
    if (py <= ceilY[px] + 1) continue
    const pw = rng.int(2, 4)
    let ok = true
    for (let x = px; x < px + pw; x++) {
      if (map.get(x, py) !== T.EMPTY) ok = false
    }
    if (!ok) continue
    for (let x = px; x < px + pw; x++) map.set(x, py, T.PLATFORM)
    platforms.push({ x: px, y: py, w: pw })
  }

  // ---------- 6. 地面石块 / 天花板钟乳石 ----------
  for (let i = 0; i < Math.round(w / 14); i++) {
    const bx = rng.int(doorInset + 5, w - doorInset - 7)
    const bw = rng.int(1, 2)
    const bh = rng.int(1, 2)
    for (let x = bx; x < bx + bw; x++) {
      for (let y = floorY[x] - bh; y < floorY[x]; y++) map.set(x, y, T.SOLID)
    }
  }
  for (let i = 0; i < Math.round(w / 8); i++) {
    const bx = rng.int(3, w - 4)
    const bl = rng.int(1, 2)
    for (let y = ceilY[bx]; y < ceilY[bx] + bl; y++) {
      if (map.get(bx, y) === T.EMPTY) map.set(bx, y, T.SOLID)
    }
  }

  // ---------- 7. 攀爬杆井（廊道够高时） ----------
  const poles = []
  const poleCount = rng.int(1, 2)
  for (let i = 0; i < poleCount; i++) {
    const px = rng.int(doorInset + 8, w - doorInset - 10)
    if (floorY[px] - ceilY[px] < 12) continue
    const pw = 2
    for (let x = px; x < px + pw; x++)
      for (let y = ceilY[x] + 1; y < floorY[x]; y++) map.set(x, y, T.EMPTY)
    for (let y = ceilY[px] + 1; y < floorY[px] - 1; y++) map.set(px, y, T.POLE)
    poles.push({ x: px, top: ceilY[px] + 1, bottom: floorY[px] - 1 })
  }

  // ---------- 8. 庇护所（贴地平面 + 门洞标记） ----------
  let shelter = null
  if (spec.shelter) {
    const sx = spec.shelterSide === 'right' ? w - 16 : 12
    for (let x = sx - 4; x <= sx + 4; x++) {
      if (x < doorInset + 2 || x > w - doorInset - 2) continue
      floorY[x] = floorY[sx]
      for (let y = floorY[x] - 6; y < floorY[x]; y++) if (map.get(x, y) === T.SOLID) map.set(x, y, T.EMPTY)
      for (let y = floorY[x]; y < h; y++) map.set(x, y, T.SOLID)
    }
    shelter = { x: sx * TS + TS / 2, y: floorY[sx] * TS }
  }

  // ---------- 9. 出生点 ----------
  const blocked = (wx) => {
    if (shelter && Math.abs(wx - shelter.x) < 150) return true
    return false
  }
  const fruits = []
  const fruitCount = spec.fruits ?? 4
  for (let i = 0; i < fruitCount; i++) {
    let tries = 0
    while (tries++ < 60) {
      const tx = rng.int(doorInset + 4, w - doorInset - 5)
      const wx = tx * TS + TS / 2
      if (blocked(wx)) continue
      let y = floorY[tx] * TS
      // 一部分果实长在平台上
      if (platforms.length && rng.chance(0.4)) {
        const p = rng.pick(platforms)
        const pt = { x: p.x + p.w * 0.5, y: p.y }
        if (Math.abs(pt.x * TS - wx) < TS * 2) continue
        y = pt.y * TS
        fruits.push({ x: pt.x * TS, y })
      } else {
        if (map.get(tx, floorY[tx] - 1) !== T.EMPTY) continue
        fruits.push({ x: wx, y })
      }
      break
    }
  }

  const batflies = []
  const batCount = spec.batflies ?? 2
  for (let i = 0; i < batCount; i++) {
    const tx = rng.int(doorInset + 6, w - doorInset - 7)
    const ty = rng.int(ceilY[tx] + 2, Math.max(ceilY[tx] + 3, floorY[tx] - 4))
    batflies.push({ x: tx * TS + TS / 2, y: ty * TS + TS / 2 })
  }

  const lizards = []
  const lizardCount = spec.lizards ?? 0
  for (let i = 0; i < lizardCount; i++) {
    let tries = 0
    while (tries++ < 80) {
      const tx = rng.int(Math.floor(w * 0.4), w - doorInset - 4)
      const wx = tx * TS
      if (blocked(wx)) continue
      if (map.isWater(tx, floorY[tx] - 1)) continue
      lizards.push({ x: wx, y: floorY[tx] * TS, dir: rng.sign() })
      break
    }
  }

  // ---------- 10. 装饰（背景残柱 / 前景植被） ----------
  const deco = { back: [], front: [] }
  for (let i = 0; i < Math.round(w / 9); i++) {
    const dx = rng.int(2, w - 6)
    deco.back.push({
      x: dx * TS,
      y: (floorY[dx] - rng.int(2, 9)) * TS,
      w: rng.int(1, 4) * TS,
      h: rng.int(3, 12) * TS,
      tilt: rng.range(-0.08, 0.08),
    })
  }
  for (let i = 0; i < Math.round(w / 6); i++) {
    const dx = rng.int(1, w - 3)
    deco.front.push({
      x: dx * TS + rng.range(0, TS),
      y: floorY[dx] * TS,
      h: rng.range(18, 52),
      kind: rng.chance(0.5) ? 'grass' : 'fern',
    })
  }

  return {
    spec,
    map,
    w,
    h,
    floorY,
    ceilY,
    worldW: w * TS,
    worldH: h * TS,
    doorLeft: { x: 1.5 * TS, y: leftFloor * TS },
    doorRight: { x: (w - 1.5) * TS, y: rightFloor * TS },
    shelter,
    fruits,
    batflies,
    lizards,
    platforms,
    poles,
    pools,
    deco,
    spawnX: (spec.shelter && spec.shelterSide !== 'right' ? 12 : 6) * TS,
    spawnFloorY: (spec.shelter && spec.shelterSide !== 'right' ? floorY[12] : floorY[6]) * TS,
    rng,
  }
}
