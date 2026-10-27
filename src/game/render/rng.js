// 确定性伪随机：同一房间种子每次生成同样的地形
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRng(seed) {
  const r = mulberry32(seed)
  return {
    next: r,
    range: (a, b) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    sign: () => (r() < 0.5 ? -1 : 1),
  }
}

// 一维值噪声（平滑），用于地形起伏
export function valueNoise1D(seed, len, scale = 8) {
  const r = mulberry32(seed)
  const ctrl = []
  const n = Math.ceil(len / scale) + 3
  for (let i = 0; i < n; i++) ctrl.push(r() * 2 - 1)
  const out = new Array(len)
  const smooth = (t) => t * t * (3 - 2 * t)
  for (let i = 0; i < len; i++) {
    const p = i / scale
    const i0 = Math.floor(p)
    const f = smooth(p - i0)
    out[i] = ctrl[i0] * (1 - f) + ctrl[i0 + 1] * f
  }
  return out
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}
export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
