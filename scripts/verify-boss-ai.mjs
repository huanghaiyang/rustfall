// ============================================================================
// 验证：BOSS 追击大脑（BossBrain）的决策层
// ----------------------------------------------------------------------------
// 纯 Node 跑，不依赖浏览器：用假地图 / 假宿主喂给 brain.think()，
// 断言「它在什么地形下做什么决定」，位移本身在 verify-boss-chase.mjs 里用真引擎验证。
//
// 覆盖：
//   A 距离带       —— 远了追、进了停、纯远程招式会拉距
//   B 台阶         —— 1 格台阶发 climb 起跳；>2 格高墙不硬攀
//   C 跨沟         —— 窄沟 leap；深渊停在崖边（edge）
//   D 失联搜索     —— 视线丢失后去最后已知位置
//   E 脱困         —— 顶墙 0.5s 零位移 → 反向 / 起跳
//   F 探测函数     —— probeStep / probeGap / findApproach 的几何正确性
//
// 用法：node scripts/verify-boss-ai.mjs
// ============================================================================
import { BossBrain, probeStep, probeGap, findApproach } from '../src/game/entities/monsters/large/boss-ai.js'

const TS = 32
const fails = []
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '[ ok ]' : '[FAIL]'} ${label}${extra ? '  ' + extra : ''}`)
  if (!cond) fails.push(label)
}

class FakeMap {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.data = new Uint8Array(w * h)
  }
  get(x, y) {
    if (x < 0 || x >= this.w) return 1
    if (y >= this.h) return 1
    if (y < 0) return 0
    return this.data[y * this.w + x]
  }
  set(x, y, v = 1) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.data[y * this.w + x] = v
  }
  isSolid(x, y) {
    return this.get(x, y) === 1
  }
  solidAt(px, py) {
    return this.isSolid(Math.floor(px / TS), Math.floor(py / TS))
  }
  /** 从 fromX 到 toX 铺地面（tile 行 floorRow 为最上层实心） */
  floor(fromX, toX, floorRow) {
    for (let x = fromX; x <= toX; x++) for (let y = floorRow; y < this.h; y++) this.set(x, y, 1)
  }
}

function makeBoss(map, opts = {}) {
  const feet = opts.feet ?? 1600
  const body = { x: opts.x ?? 1000, y: feet - 168, w: 136, h: 168, vx: 0, vy: 0, onGround: true, wallDir: 0 }
  const player = {
    centerX: opts.playerX ?? 1500,
    centerY: feet - 20,
    dead: false,
    body: { x: (opts.playerX ?? 1500) - 16, y: feet - 60, w: 32, h: 60 },
  }
  const host = {
    game: { room: { data: { worldW: map.w * TS } } },
    map,
    body,
    speed: opts.speed ?? 58,
    facing: 1,
    state: 'chase',
    player,
    los: true,
    get px() {
      return body.x + body.w / 2
    },
    get py() {
      return body.y + body.h - 56
    },
    distToPlayer() {
      return Math.abs(player.centerX - this.px)
    },
    hasLineOfSight() {
      return host.los
    },
  }
  const brain = new BossBrain(host, { maxStepTiles: opts.maxStepTiles ?? 2, jumpVy: -620 })
  return { host, brain, body, player }
}

function step(brain, n, dt = 1 / 60) {
  let last = null
  for (let i = 0; i < n; i++) last = brain.think(dt)
  return last
}

/** 跑 n 帧，返回最后一帧意图 + 「这几帧里出现过什么」 */
function run(brain, n, dt = 1 / 60) {
  let last = null
  let sawJump = null
  const modes = new Set()
  const dirs = new Set()
  for (let i = 0; i < n; i++) {
    last = brain.think(dt)
    if (last.jump) sawJump = last.jump
    modes.add(last.mode)
    dirs.add(last.dir)
  }
  return { last, sawJump, modes: [...modes], dirs: [...dirs] }
}

console.log('\n=== A. 距离带 ===')
{
  const map = new FakeMap(160, 60)
  map.floor(2, 150, 50)
  const meleeKit = {
    a: { range: [0, 120], exec() {} },
    b: { range: [0, 150], exec() {} },
  }
  const rangedKit = {
    a: { range: [300, 520], exec() {} },
    b: { range: [240, 460], exec() {} },
  }
  const melee = makeBoss(map, { playerX: 1010 + 260, feet: 1600 })
  melee.brain.setBandFromKit(meleeKit)
  ok(melee.brain.band[0] === 72 && melee.brain.band[1] === 150, '近战招多的 BOSS 距离带 = 贴身', JSON.stringify(melee.brain.band))

  const far = step(makeBoss(map, { playerX: 1000 + 68 + 600 }).brain, 20)
  const farB = makeBoss(map, { playerX: 1600 })
  farB.brain.setBandFromKit(meleeKit)
  const farIntent = step(farB.brain, 20)
  ok(farIntent.dir === 1 && farIntent.speedMul > 0.9, '玩家在远处 → 全速追击', JSON.stringify({ dir: farIntent.dir, mul: farIntent.speedMul, mode: farIntent.mode }))

  const near = makeBoss(map, { playerX: 1000 + 68 + 100 })
  near.brain.setBandFromKit(meleeKit)
  const nearIntent = step(near.brain, 20)
  ok(nearIntent.dir === 0, '进入距离带 → 停下（不再贴着墙磨）', JSON.stringify({ dir: nearIntent.dir, mode: nearIntent.mode }))

  const r = makeBoss(map, { playerX: 1000 + 68 + 100 })
  r.brain.setBandFromKit(rangedKit)
  const rIntent = step(r.brain, 20)
  ok(r.brain.band[1] >= 220 && rIntent.dir === -1, '纯远程 BOSS 被贴身 → 后退拉距', JSON.stringify({ band: r.brain.band, dir: rIntent.dir }))
}

console.log('\n=== B. 台阶 / 高墙 ===')
{
  const map = new FakeMap(160, 60)
  map.floor(2, 150, 50) // 地面 top = 1600
  // 2 格高台：x 36..44，顶面 1536
  for (let x = 36; x <= 44; x++) for (let y = 48; y < 50; y++) map.set(x, y, 1)
  const b = makeBoss(map, { x: 1000, feet: 1600, playerX: 1600 })
  const p = probeStep(b.host, 1, 2)
  ok(p.h === 64 && p.standable, 'probeStep 认出 2 格台阶且可攀', JSON.stringify({ h: p.h, standable: p.standable }))

  const it = run(b.brain, 6)
  ok(it.sawJump === 'step' && it.dirs.includes(1), '追击时对 2 格台阶发起攀跳', JSON.stringify({ jump: it.sawJump, dirs: it.dirs }))

  // 5 格高墙：不硬攀
  const map2 = new FakeMap(160, 60)
  map2.floor(2, 150, 50)
  for (let x = 36; x <= 60; x++) for (let y = 45; y < 50; y++) map2.set(x, y, 1)
  const b2 = makeBoss(map2, { x: 1000, feet: 1600, playerX: 1400 })
  const p2 = probeStep(b2.host, 1, 2)
  ok(p2.h > 96 && !p2.standable, 'probeStep 把 5 格墙判为「爬不上」', JSON.stringify({ h: p2.h, standable: p2.standable }))
  const it2 = step(b2.brain, 30)
  ok(it2.jump === null && it2.dir === 0, '面对爬不上的高墙不空跳、不顶着磨', JSON.stringify({ jump: it2.jump, dir: it2.dir, mode: it2.mode }))
}

console.log('\n=== C. 跨沟 ===')
{
  // 2 格宽、3 格深的窄沟
  const map = new FakeMap(160, 60)
  map.floor(2, 34, 50)
  map.floor(37, 150, 50)
  for (let x = 35; x <= 36; x++) for (let y = 50; y < 60; y++) map.set(x, y, 0)
  map.floor(35, 36, 53) // 沟底（3 格深）
  const b = makeBoss(map, { x: 1000, feet: 1600, playerX: 1500 })
  const g = probeGap(b.host, 1, 260)
  ok(g.width >= 40 && g.width <= 96 && g.depth <= TS * 3.2, 'probeGap 量出窄沟宽度/深度', JSON.stringify({ width: g.width, depth: g.depth }))
  const it = run(b.brain, 6)
  ok(it.sawJump === 'leap', '窄沟主动跃过去', JSON.stringify({ jump: it.sawJump, dirs: it.dirs }))

  // 深渊：200px 全空（下面也没有地）
  const map2 = new FakeMap(160, 60)
  map2.floor(2, 34, 50)
  map2.floor(110, 150, 50)
  const b2 = makeBoss(map2, { x: 1000, feet: 1600, playerX: 1500 })
  const g2 = probeGap(b2.host, 1, 260)
  ok(g2.depth === Infinity, 'probeGap 把无底沟判为深渊', `depth=${g2.depth}`)
  const it2 = step(b2.brain, 6)
  ok(it2.jump === null && it2.dir === 0 && it2.mode === 'edge', '深渊停在崖边不出手', JSON.stringify({ jump: it2.jump, dir: it2.dir, mode: it2.mode }))
}

console.log('\n=== D. 失联搜索 ===')
{
  const map = new FakeMap(160, 60)
  map.floor(2, 150, 50)
  const b = makeBoss(map, { x: 1000, feet: 1600, playerX: 1500 })
  // 先在视线内建立最后已知位置
  b.brain.think(1 / 60)
  b.host.los = false
  const it = step(b.brain, 60) // 1s 视线丢失
  ok(it.mode === 'search' && it.dir === 1, '视线丢失 0.7s 后转为搜索最后已知位置', JSON.stringify({ mode: it.mode, dir: it.dir }))
  ok(b.brain.stats.searches === 1, '搜索只计一次（不是每帧累加）', `searches=${b.brain.stats.searches}`)
}

console.log('\n=== E. 脱困 ===')
{
  // 平地 + 玩家在远处：大脑一直想往前走，但把身体钉死 = 被卡住
  const map = new FakeMap(160, 60)
  map.floor(2, 150, 50)
  const b = makeBoss(map, { x: 1000, feet: 1600, playerX: 1600 })
  let sawReposition = false
  let sawJump = false
  for (let i = 0; i < 90; i++) {
    b.host.body.x = 1000 // 钉住不动
    const it = b.brain.think(1 / 60)
    if (it.mode === 'reposition') sawReposition = true
    if (it.jump) sawJump = true
  }
  ok(b.brain.stats.stuck > 0, '0.5s 零位移被判定卡住', `stuck=${b.brain.stats.stuck}`)
  ok(sawJump || sawReposition, '卡住后没有装死（会起跳或反向）', JSON.stringify({ reposition: sawReposition, jump: sawJump }))
}

console.log('\n=== F. 绕路 / 边界 ===')
{
  // 玩家在高台上，正面是 5 格墙；左侧 200px 处有一段 2 格斜坡
  const map = new FakeMap(160, 60)
  map.floor(2, 150, 50)
  for (let x = 35; x <= 70; x++) for (let y = 45; y < 50; y++) map.set(x, y, 1) // 高墙
  // 在 x=26..28 处做 1 格 / 2 格台阶（可上去）
  for (let x = 26; x <= 28; x++) for (let y = 49; y < 50; y++) map.set(x, y, 1)
  for (let x = 24; x <= 25; x++) for (let y = 48; y < 50; y++) map.set(x, y, 1)
  const b = makeBoss(map, { x: 1000, feet: 1600, playerX: 1700 })
  b.player.centerY = 1600 - 64
  b.player.body.y = 1600 - 64 - 60
  const app = findApproach(b.host, 1, 340)
  ok(app && app.rise > 0 && app.rise <= TS * 2.6, 'findApproach 找到可上的落脚面', JSON.stringify(app && { x: Math.round(app.x), rise: app.rise }))
  // 沿着找出来的方向走（不需要跳到精确位置，只要求朝那里移动）
  b.host.body.x = 1000
  let dirs = new Set()
  for (let i = 0; i < 60; i++) {
    const it = b.brain.think(1 / 60)
    dirs.add(it.dir)
  }
  ok(dirs.has(-1), '玩家在高台上且正面不可攀 → 会往可上的方向绕', `dirs=${[...dirs]}`)
}

console.log('\n=== G. 边界 ===')
{
  const map = new FakeMap(100, 60)
  map.floor(2, 98, 50)
  const b = makeBoss(map, { x: 10, feet: 1600, playerX: 60 })
  b.host.body.x = 6
  const it = step(b.brain, 10)
  ok(it.dir >= 0, '贴近左边界时不继续把身体挤进墙里', JSON.stringify({ dir: it.dir, mode: it.mode }))
}

console.log('\n=== 结果 ===')
console.log(fails.length ? `[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '[ALL PASS] BOSS 追击大脑决策层 全部通过')
process.exit(fails.length ? 1 : 0)
