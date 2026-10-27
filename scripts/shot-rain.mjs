// 暴雨展示图：无蜥蜴的房间，玩家在场中淋雨
import puppeteer from 'puppeteer-core'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const page = await browser.newPage()
await page.bringToFront()
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180', { waitUntil: 'networkidle2' })
await wait(1500)
await page.click('.menu .btn.primary')
await wait(1200)
await page.evaluate(() => {
  const g = window.__rainCycle
  g.loadRoom('r1', 'left')
  const x = 30 * 32
  const fy = g.room.data.floorY[30]
  g.player.invuln = 9999
  g.player.body.x = x
  g.player.body.y = fy * 32 - 30
  window.__G.timeLeft = 1.0
})
await wait(2200)
console.log(
  'RAIN STATE',
  JSON.stringify(await page.evaluate(() => ({ rain: window.__G.rainPhase, intensity: Number(window.__G.rainIntensity.toFixed(2)), exposed: Number(window.__G.exposed.toFixed(1)), phase: window.__G.phase }))),
)
await page.screenshot({ path: 'screenshots/hero-rain.png' })
// 雨将至的警告态
await page.evaluate(() => {
  window.__G.timeLeft = 30
  window.__G.rainPhase = 'warning'
})
await wait(900)
await page.screenshot({ path: 'screenshots/hero-warning.png' })
await browser.disconnect()
