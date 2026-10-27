export { clamp, lerp, damp, makeRng, mulberry32 } from './render/rng.js'

export function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target)
  if (current > target) return Math.max(current - maxDelta, target)
  return current
}

export function smoothstep(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}
