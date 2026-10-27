import puppeteer from 'puppeteer-core'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1440, height: 810 } })
const page = await browser.newPage()
await page.bringToFront()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)) })
await page.goto('http://127.0.0.1:5180', { waitUntil: 'networkidle2' })
await wait(1500)
await page.click('.menu .btn.primary')
await wait(1300)
console.log('CANVASES', await page.evaluate(() => document.querySelectorAll('canvas').length))

const state = () => page.evaluate(() => {
  const g = window.__rainCycle
  return {
    phase: window.__G.phase,
    room: g.room?.data?.spec?.id,
    dead: g.player?.dead,
    timeLeft: Number(window.__G.timeLeft.toFixed(1)),
    inShelter: window.__G.sheltered,
    progress: Number(window.__G.shelterProgress.toFixed(2)),
    shelteredZone: g.room ? g.room.inShelter(g.player.centerX, g.player.centerY) : null,
    body: g.player ? { x: Math.round(g.player.body.x), y: Math.round(g.player.body.y), inWater: g.player.body.inWater, ratio: Number((g.player.body.waterRatio || 0).toFixed(2)), anim: g.player.animName } : null,
  }
})

// 水坑
await page.evaluate(() => {
  const g = window.__rainCycle
  g.loadRoom('r2', 'left')
  const pool = g.room.data.pools[0]
  g.player.body.x = (pool.x + pool.w / 2) * 32 - 10
  g.player.body.y = (pool.floor - 2) * 32
  g.player.body.vx = 0
  g.player.body.vy = 0
})
await wait(900)
console.log('WATER', JSON.stringify(await state()))
await page.screenshot({ path: 'screenshots/dbg-water.png' })

// 暴雨
await page.evaluate(() => {
  const g = window.__rainCycle
  const fd = g.room.data.floorY[20]
  g.player.body.x = 640
  g.player.body.y = fd * 32 - 30
  g.player.body.vx = 0
  g.player.body.vy = 0
  window.__G.timeLeft = 1.0
})
for (let i = 0; i < 8; i++) {
  await wait(700)
  const s = await state()
  console.log('RAIN', i, JSON.stringify({ phase: s.phase, dead: s.dead, t: s.timeLeft, exposed: await page.evaluate(() => Number(window.__G.exposed.toFixed(1))), rain: await page.evaluate(() => window.__G.rainPhase) }))
  if (s.phase === 'dead') break
}
await page.screenshot({ path: 'screenshots/dbg-rain.png' })

// 庇护所
await page.evaluate(() => {
  const g = window.__rainCycle
  if (window.__G.phase === 'dead') g.retryAfterDeath()
})
await wait(1200)
console.log('AFTER RETRY', JSON.stringify(await state()))
await page.evaluate(() => {
  const g = window.__rainCycle
  g.loadRoom('r0', 'shelter')
  const s = g.room.data.shelter
  g.player.body.x = s.x - 10
  g.player.body.y = s.y - 30
  g.player.body.vx = 0
  g.player.body.vy = 0
  window.__G.timeLeft = 220
})
await wait(700)
console.log('SHELTER SET', JSON.stringify(await state()))
await page.keyboard.down('KeyS')
await wait(1400)
console.log('SHELTER HOLD', JSON.stringify(await state()))
await page.keyboard.up('KeyS')
await page.screenshot({ path: 'screenshots/dbg-shelter.png' })

console.log('ERRS', JSON.stringify(errs))
await page.close()
await browser.disconnect()
