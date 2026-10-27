// 生成展示用截图：标题 / 庇护所 / 长廊 / 蜥蜴 / 水中 / 暴雨 / 休眠 / 死亡
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9333'
const OUT = path.resolve('screenshots')
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '.png') })
  console.log('shot', name)
}

const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1600, height: 900 } })
const page = await browser.newPage()
await page.bringToFront()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)) })

await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180', { waitUntil: 'networkidle2' })
await wait(1600)
await shot(page, 'hero-title')

await page.click('.menu .btn.primary')
await wait(1800)
// 站在庇护所前，等镜头稳定
await page.evaluate(() => {
  const g = window.__rainCycle
  g.player.body.x = g.room.data.shelter.x + 40
  g.player.body.y = g.room.data.shelter.y - 30
  g.player.facing = -1
})
await wait(1400)
await shot(page, 'hero-shelter')

// r1 长廊
await page.evaluate(() => {
  const g = window.__rainCycle
  g.loadRoom('r1', 'left')
  g.player.body.x = g.room.data.worldW * 0.45
  g.player.body.y = g.room.data.floorY[Math.floor(g.room.data.w * 0.45)] * 32 - 30
})
await wait(1600)
await shot(page, 'hero-corridor')

// r2 + 蜥蜴特写
await page.evaluate(() => {
  const g = window.__rainCycle
  g.loadRoom('r2', 'left')
  const liz = g.room.lizards[0]
  g.player.invuln = 999
  g.player.body.x = liz.head.x - 210
  g.player.body.y = liz.head.y - 20
  window.__G.timeLeft = 200
})
await wait(2200)
for (let i = 0; i < 26; i++) {
  const st = await page.evaluate(() => {
    const g = window.__rainCycle
    const liz = g.room.lizards[0]
    return { state: liz.state, dist: Math.abs(g.player.body.x - liz.head.x) }
  })
  if (st.state === 'windup' || (st.state === 'chase' && st.dist < 130)) break
  await wait(120)
}
await wait(120)
await shot(page, 'hero-lizard')
await page.evaluate(() => {
  const g = window.__rainCycle
  g.player.invuln = 0.2
  g.player.body.x = g.room.data.fruits[0].x - 40
  g.player.body.y = g.room.data.fruits[0].y - 30
})
await wait(1200)
await shot(page, 'hero-forage')

// 水中
await page.evaluate(() => {
  const g = window.__rainCycle
  const pool = g.room.data.pools[0]
  g.player.invuln = 0.2
  g.player.body.x = (pool.x + pool.w / 2) * 32 - 10
  g.player.body.y = (pool.floor - 2) * 32
})
await wait(900)
await shot(page, 'hero-water')

// 暴雨
await page.evaluate(() => {
  const g = window.__rainCycle
  const fd = g.room.data.floorY[22]
  g.player.body.x = 22 * 32
  g.player.body.y = fd * 32 - 30
  window.__G.timeLeft = 0.8
})
await wait(2800)
await shot(page, 'hero-rain')

// 休眠
await page.evaluate(() => {
  const g = window.__rainCycle
  if (window.__G.phase === 'dead') g.retryAfterDeath()
})
await wait(1300)
await page.evaluate(() => {
  const g = window.__rainCycle
  g.loadRoom('r0', 'shelter')
  const s = g.room.data.shelter
  g.player.invuln = 999
  g.player.body.x = s.x - 10
  g.player.body.y = s.y - 30
  window.__G.food = 3
  window.__G.timeLeft = 200
})
await wait(900)
await page.keyboard.down('KeyS')
await wait(1400)
await page.keyboard.up('KeyS')
await wait(700)
await shot(page, 'hero-hibernate')

// 死亡
await page.evaluate(() => {
  const g = window.__rainCycle
  g.nextCycle()
})
await wait(1300)
await page.evaluate(() => window.__rainCycle.die('被绿蜥蜴咬住'))
await wait(900)
await shot(page, 'hero-death')

console.log('FPS', await page.evaluate(() => window.__G.fps))
console.log('ERRORS', JSON.stringify(errs))
await page.close()
await browser.disconnect()
