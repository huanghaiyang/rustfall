// 功能验证：标题按钮启动 / 房间切换 / 蜥蜴 AI / 水体 / 暴雨 / 庇护所休眠 / 存档 / 音频
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const URL = process.env.GAME_URL || 'http://127.0.0.1:5180'
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9333'
const OUT = path.resolve('screenshots')
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1440, height: 810 } })
const page = await browser.newPage()
await page.bringToFront()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300))
})

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
await wait(1600)

// ---------- 0. 通过真实点击启动（顺便满足音频解锁的用户手势要求） ----------
await page.click('.menu .btn.primary')
await wait(1400)
const boot = await page.evaluate(() => ({
  phase: window.__G.phase,
  room: window.__rainCycle.room.data.spec.id,
  audioReady: window.__audio?.ready ?? null,
  ctxState: window.__audio?.ctx?.state ?? 'n/a',
}))
console.log('BOOT', JSON.stringify(boot))

// 试一点音效，确认不抛异常
const sfx = await page.evaluate(() => {
  const names = ['jump', 'land', 'step', 'eat', 'hurt', 'death', 'pickup', 'throw', 'hibernate', 'wake', 'door', 'growl', 'splash', 'swim', 'rainStart', 'thunder', 'heartbeat', 'uiClick', 'uiHover']
  const out = {}
  for (const n of names) out[n] = window.__audio.play(n, { vol: 0.4 })
  window.__audio.setRain(0.5)
  window.__audio.setDanger(0.3)
  return { played: out, ready: window.__audio.ready }
})
console.log('AUDIO', JSON.stringify(sfx))

// ---------- 1. 逐间房穿越 ----------
for (const expected of ['r1', 'r2']) {
  await page.evaluate(() => {
    const g = window.__rainCycle
    g.player.body.x = g.room.data.worldW - 20
    g.player.body.y = g.room.data.doorRight.y - 30
    g.player.body.vx = 0
    g.player.body.vy = 0
  })
  await wait(1800)
  const st = await page.evaluate(() => {
    const g = window.__rainCycle
    return {
      room: g.room.data.spec.id,
      name: g.room.data.spec.name,
      x: Math.round(g.player.body.x),
      phase: window.__G.phase,
      entities: { fruits: g.room.fruits.length, lizards: g.room.lizards.length, batflies: g.room.batflies.length },
    }
  })
  console.log(`TRANSITION -> ${expected}:`, st.room === expected ? 'OK' : 'FAILED', JSON.stringify(st))
  if (st.room !== expected) errors.push(`transition to ${expected} failed: ${st.room}`)
  await page.screenshot({ path: path.join(OUT, `t-${expected}.png`) })
}

// ---------- 2. 蜥蜴 AI（把玩家放在蜥蜴左侧，避开房间右边界） ----------
const lizInit = await page.evaluate(() => {
  const g = window.__rainCycle
  const liz = g.room.lizards[0]
  if (!liz) return null
  g.player.body.x = Math.max(120, liz.head.x - 260)
  g.player.body.y = liz.head.y - 20
  g.player.body.vx = 0
  g.player.body.vy = 0
  g.player.dead = false
  g.player.invuln = 0
  return {
    head: { x: Math.round(liz.head.x), y: Math.round(liz.head.y) },
    playerX: Math.round(g.player.body.x),
    state: liz.state,
    segments: liz.segments.length,
    spread: Math.round(Math.hypot(liz.segments[0].x - liz.segments.at(-1).x, liz.segments[0].y - liz.segments.at(-1).y)),
  }
})
console.log('LIZARD INIT', JSON.stringify(lizInit))
const seenStates = []
for (let i = 0; i < 30; i++) {
  await wait(160)
  const s = await page.evaluate(() => {
    const g = window.__rainCycle
    const liz = g.room.lizards[0]
    return { state: liz.state, jaw: Number(liz.jaw.toFixed(2)), phase: window.__G.phase, dist: Math.round(Math.abs(g.player.body.x - liz.head.x)) }
  })
  seenStates.push(s)
  if (s.state === 'windup' || s.state === 'lunge') {
    await page.screenshot({ path: path.join(OUT, 't-lizard-attack.png') })
  }
  if (s.phase === 'dead') break
}
const uniqueStates = [...new Set(seenStates.map((s) => s.state))]
console.log('LIZARD STATES', JSON.stringify(uniqueStates), 'died=', seenStates.some((s) => s.phase === 'dead'))
console.log('LIZARD TRAIL', JSON.stringify(seenStates.filter((s) => s.state !== 'patrol').slice(0, 8)))
await page.screenshot({ path: path.join(OUT, 't-lizard.png') })

// 重置
await page.evaluate(() => {
  const g = window.__rainCycle
  if (window.__G.phase === 'dead') {
    g.retryAfterDeath()
  } else {
    g.loadRoom('r2', 'left')
  }
})
await wait(1400)

// ---------- 3. 水体 ----------
const water = await page.evaluate(() => {
  const g = window.__rainCycle
  if (g.room.data.spec.id !== 'r2') g.loadRoom('r2', 'left')
  const pool = g.room.data.pools[0]
  if (!pool) return { noPool: true }
  g.player.body.x = (pool.x + pool.w / 2) * 32 - 10
  g.player.body.y = (pool.floor - 2) * 32
  g.player.body.vx = 0
  g.player.body.vy = 0
  window.__G.timeLeft = 200
  return { pool }
})
await wait(900)
const waterState = await page.evaluate(() => {
  const g = window.__rainCycle
  return {
    phase: window.__G.phase,
    inWater: g.player.body.inWater,
    ratio: Number((g.player.body.waterRatio || 0).toFixed(2)),
    anim: g.player.animName,
  }
})
console.log('WATER', JSON.stringify(water), '->', JSON.stringify(waterState))
await page.screenshot({ path: path.join(OUT, 't-water.png') })

// ---------- 4. 暴雨 ----------
await page.evaluate(() => {
  const g = window.__rainCycle
  const fd = g.room.data.floorY[20]
  g.player.body.x = 640
  g.player.body.y = fd * 32 - 30
  g.player.body.vx = 0
  g.player.body.vy = 0
  window.__G.timeLeft = 1.2
})
await wait(2600)
console.log(
  'RAIN T+2.6s',
  JSON.stringify(await page.evaluate(() => ({ rain: window.__G.rainPhase, intensity: Number(window.__G.rainIntensity.toFixed(2)), exposed: Number(window.__G.exposed.toFixed(1)), phase: window.__G.phase }))),
)
await page.screenshot({ path: path.join(OUT, 't-rain.png') })
await wait(3200)
const rain2 = await page.evaluate(() => ({
  phase: window.__G.phase,
  rainPhase: window.__G.rainPhase,
  exposed: Number(window.__G.exposed.toFixed(1)),
  reason: window.__G.deathReason,
  title: document.querySelector('.panel-title')?.textContent?.trim(),
}))
console.log('RAIN AFTER', JSON.stringify(rain2))
await page.screenshot({ path: path.join(OUT, 't-rain-death.png') })

// ---------- 5. 庇护所休眠 ----------
await page.evaluate(() => {
  const g = window.__rainCycle
  if (window.__G.phase === 'dead') g.retryAfterDeath()
})
await wait(1200)
await page.evaluate(() => {
  const g = window.__rainCycle
  if (g.room.data.spec.id !== 'r0') g.loadRoom('r0', 'shelter')
  const s = g.room.data.shelter
  g.player.body.x = s.x - 10
  g.player.body.y = s.y - 30
  g.player.body.vx = 0
  g.player.body.vy = 0
  window.__G.food = 3
  window.__G.timeLeft = 220
})
await wait(600)
await page.keyboard.down('KeyS')
await wait(1800)
await page.keyboard.up('KeyS')
const hib = await page.evaluate(() => ({
  phase: window.__G.phase,
  progress: Number(window.__G.shelterProgress.toFixed(2)),
  karma: window.__G.karma,
  resultOk: window.__G.result?.ok,
  karmaBefore: window.__G.result?.karmaBefore,
  karmaAfter: window.__G.result?.karmaAfter,
  title: document.querySelector('.panel-title')?.textContent?.trim(),
  save: JSON.parse(localStorage.getItem('raincircle.save.v2') || 'null'),
}))
console.log('HIBERNATE', JSON.stringify(hib))
await page.screenshot({ path: path.join(OUT, 't-hibernate.png') })

await page.click('.btn.primary')
await wait(1400)
const nextC = await page.evaluate(() => ({
  phase: window.__G.phase,
  cycle: window.__G.cycle,
  food: window.__G.food,
  timeLeft: Math.round(window.__G.timeLeft),
  fruitsReady: window.__rainCycle.room.fruits.filter((f) => !f.eaten).length,
  room: window.__rainCycle.room.data.spec.id,
}))
console.log('NEXT CYCLE', JSON.stringify(nextC))
await page.screenshot({ path: path.join(OUT, 't-next.png') })

// ---------- 6. 存档续玩 ----------
await page.reload({ waitUntil: 'networkidle2' })
await wait(1400)
const reloaded = await page.evaluate(() => ({
  phase: window.__G.phase,
  hasSave: window.__G.hasSave,
  continueBtn: [...document.querySelectorAll('.menu .btn')].map((b) => b.textContent.trim()),
}))
console.log('RELOAD TITLE', JSON.stringify(reloaded))
const contBtn = await page.$('.menu .btn:nth-child(2)')
if (contBtn) await contBtn.click()
await wait(1400)
console.log(
  'CONTINUE',
  JSON.stringify(await page.evaluate(() => ({ phase: window.__G.phase, cycle: window.__G.cycle, karma: window.__G.karma, room: window.__rainCycle.room.data.spec.id }))),
)
await page.screenshot({ path: path.join(OUT, 't-continue.png') })

console.log('FPS', await page.evaluate(() => window.__G.fps))
console.log('ERRORS', JSON.stringify(errors, null, 2))
await page.close()
await browser.disconnect()
if (errors.length) process.exitCode = 1
