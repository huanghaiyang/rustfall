import { TS } from '../config.js'

export const T = {
  EMPTY: 0,
  SOLID: 1,
  PLATFORM: 2, // 单向平台：只能从上方落下
  WATER: 3,
  POLE: 4, // 可攀爬的杆
  CRACKED: 5, // 裂墙：镐可破坏
  SOIL: 6, // 松土：铲可挖开
  TOXIC: 7, // 酸液：可游但有腐蚀伤害
}

export const TILE_HP = { [T.CRACKED]: 3, [T.SOIL]: 2 }

const EPS = 0.001

export class Tilemap {
  constructor(w, h, fill = T.EMPTY) {
    this.w = w
    this.h = h
    this.data = new Uint8Array(w * h)
    if (fill) this.data.fill(fill)
    this.health = new Uint8Array(w * h)
    this.dirty = new Set()
  }
  idx(x, y) {
    return y * this.w + x
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }
  get(x, y) {
    if (x < 0 || x >= this.w) return T.SOLID
    if (y >= this.h) return T.SOLID
    if (y < 0) return T.EMPTY
    return this.data[y * this.w + x]
  }
  set(x, y, v, mark = false) {
    if (!this.inBounds(x, y)) return
    this.data[y * this.w + x] = v
    const idx = y * this.w + x
    this.health[idx] = TILE_HP[v] || 0
    if (mark) this.dirty.add(`${x},${y}`)
  }
  damageTile(x, y, amount = 1) {
    if (!this.inBounds(x, y)) return { destroyed: false, hp: 0, type: T.EMPTY }
    const idx = y * this.w + x
    const type = this.data[idx]
    if (!TILE_HP[type]) return { destroyed: false, hp: 0, type }
    this.health[idx] = Math.max(0, (this.health[idx] || TILE_HP[type]) - amount)
    this.dirty.add(`${x},${y}`)
    if (this.health[idx] <= 0) {
      this.data[idx] = T.EMPTY
      this.health[idx] = 0
      return { destroyed: true, hp: 0, type }
    }
    return { destroyed: false, hp: this.health[idx], type }
  }
  isSolid(x, y) {
    const v = this.get(x, y)
    return v === T.SOLID || v === T.CRACKED || v === T.SOIL
  }
  isPlatform(x, y) {
    return this.get(x, y) === T.PLATFORM
  }
  isWater(x, y) {
    return this.get(x, y) === T.WATER
  }
  isToxic(x, y) {
    return this.get(x, y) === T.TOXIC
  }
  isPole(x, y) {
    return this.get(x, y) === T.POLE
  }
  isBreakable(x, y) {
    return this.get(x, y) === T.CRACKED
  }
  isDiggable(x, y) {
    return this.get(x, y) === T.SOIL
  }
  isLiquid(x, y) {
    const v = this.get(x, y)
    return v === T.WATER || v === T.TOXIC
  }
  waterAt(px, py) {
    return this.isLiquid(Math.floor(px / TS), Math.floor(py / TS))
  }
  solidAt(px, py) {
    return this.isSolid(Math.floor(px / TS), Math.floor(py / TS))
  }
  poleAt(px, py) {
    return this.isPole(Math.floor(px / TS), Math.floor(py / TS))
  }
  rectWater(x, y, w, h) {
    return this.rectWaterRatio(x, y, w, h) > 0
  }
  rectWaterRatio(x, y, w, h) {
    const x0 = Math.floor(x / TS)
    const x1 = Math.floor((x + w - EPS) / TS)
    const y0 = Math.floor(y / TS)
    const y1 = Math.floor((y + h - EPS) / TS)
    let total = 0
    let wet = 0
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        total++
        if (this.isLiquid(tx, ty)) wet++
      }
    return total ? wet / total : 0
  }
  rectToxic(x, y, w, h) {
    const x0 = Math.floor(x / TS)
    const x1 = Math.floor((x + w - EPS) / TS)
    const y0 = Math.floor(y / TS)
    const y1 = Math.floor((y + h - EPS) / TS)
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) if (this.isToxic(tx, ty)) return true
    return false
  }
  rectPole(x, y, w, h) {
    const x0 = Math.floor((x + 4) / TS)
    const x1 = Math.floor((x + w - 4 - EPS) / TS)
    const y0 = Math.floor((y + 2) / TS)
    const y1 = Math.floor((y + h - 2 - EPS) / TS)
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) if (this.get(tx, ty) === T.POLE) return true
    return false
  }
  groundBelow(px, py, maxPx = TS * 8) {
    let ty = Math.floor(py / TS)
    const tx = Math.floor(px / TS)
    const maxTy = Math.floor((py + maxPx) / TS)
    for (; ty <= maxTy; ty++) {
      const t = this.get(tx, ty)
      if (t === T.SOLID || t === T.PLATFORM || t === T.CRACKED || t === T.SOIL) return ty * TS
    }
    return null
  }
  wallAhead(px, py, dir) {
    const tx = Math.floor((px + dir * TS * 0.9) / TS)
    const ty = Math.floor(py / TS)
    return this.isSolid(tx, ty) || this.isSolid(tx, ty - 1)
  }
  waterSurface(px) {
    const tx = Math.floor(px / TS)
    for (let ty = 0; ty < this.h; ty++) if (this.isLiquid(tx, ty)) return ty * TS
    return null
  }
  tileAt(px, py) {
    return { tx: Math.floor(px / TS), ty: Math.floor(py / TS) }
  }
  diff() {
    return [...this.dirty]
  }
  applyDiff(list) {
    if (!Array.isArray(list)) return
    for (const key of list) this.dirty.add(key)
  }
}

/** 创建物理刚体；x,y 为左上角世界坐标（y 向下） */
export function makeBody(x, y, w, h) {
  return {
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    onGround: false,
    onCeiling: false,
    wallDir: 0,
    dropThrough: 0,
    inWater: false,
    inToxic: false,
    waterRatio: 0,
  }
}

/** AABB <-> 瓦片碰撞，分轴解算（扫描式防穿透） */
export function moveBody(map, b, dt) {
  b.wallDir = 0
  const prevBottom = b.y + b.h
  const prevTop = b.y

  // X 轴
  if (b.vx !== 0) {
    b.x += b.vx * dt
    const dir = b.vx > 0 ? 1 : -1
    const tx = dir > 0 ? Math.floor((b.x + b.w - EPS) / TS) : Math.floor(b.x / TS)
    const y0 = Math.floor((b.y + 2) / TS)
    const y1 = Math.floor((b.y + b.h - 2 - EPS) / TS)
    for (let ty = y0; ty <= y1; ty++) {
      if (map.isSolid(tx, ty)) {
        b.x = dir > 0 ? tx * TS - b.w - EPS : (tx + 1) * TS + EPS
        b.vx = 0
        b.wallDir = dir
        break
      }
    }
  }

  // Y 轴
  if (b.vy !== 0) {
    b.y += b.vy * dt
    const x0 = Math.floor((b.x + 3) / TS)
    const x1 = Math.floor((b.x + b.w - 3 - EPS) / TS)
    if (b.vy > 0) {
      const startRow = Math.floor((prevBottom - EPS) / TS)
      const endRow = Math.floor((b.y + b.h - EPS) / TS)
      let landed = false
      let landY = 0
      for (let ty = startRow; ty <= endRow && !landed; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = map.get(tx, ty)
          if (t === T.SOLID || t === T.CRACKED || t === T.SOIL) {
            landed = true
            landY = ty * TS
            break
          }
          if (t === T.PLATFORM && b.dropThrough <= 0 && prevBottom <= ty * TS + 2) {
            landed = true
            landY = ty * TS
            break
          }
        }
      }
      if (landed) {
        b.y = landY - b.h - EPS
        b.vy = 0
        b.onGround = true
      }
    } else {
      const startRow = Math.floor((prevTop - EPS) / TS)
      const endRow = Math.floor(b.y / TS)
      for (let ty = endRow; ty <= startRow; ty++) {
        let hit = false
        for (let tx = x0; tx <= x1; tx++) {
          if (map.isSolid(tx, ty)) {
            hit = true
            break
          }
        }
        if (hit) {
          b.y = (ty + 1) * TS + EPS
          b.vy = 0
          b.onCeiling = true
          break
        }
      }
    }
  }

  // 地面探测
  b.onGround = false
  if (b.vy >= 0) {
    const ty = Math.floor((b.y + b.h + 1.5) / TS)
    const x0 = Math.floor((b.x + 3) / TS)
    const x1 = Math.floor((b.x + b.w - 3 - EPS) / TS)
    for (let tx = x0; tx <= x1; tx++) {
      const t = map.get(tx, ty)
      if (t === T.SOLID || t === T.CRACKED || t === T.SOIL) {
        b.onGround = true
        break
      }
      if (t === T.PLATFORM && b.dropThrough <= 0 && b.y + b.h <= ty * TS + 2) {
        b.onGround = true
        break
      }
    }
  }
  if (b.onGround && b.vy > 0) b.vy = 0

  // 液体
  b.waterRatio = map.rectWaterRatio(b.x, b.y, b.w, b.h)
  b.inWater = b.waterRatio > 0.3
  b.inToxic = b.inWater && map.rectToxic(b.x, b.y, b.w, b.h)

  if (b.dropThrough > 0) b.dropThrough = Math.max(0, b.dropThrough - dt)
  return b
}

export function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return a + d * t
}
