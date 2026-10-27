// 休眠结算与死亡结算展示图
import puppeteer from 'puppeteer-core'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const page = await browser.newPage()
await page.bringToFront()
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180', { waitUntil: 'networkidle2' })
await wait(1500)
await page.click('.menu .btn.primary')
await wait(1400)
await page.evaluate(() => {
  const g = window.__rainCycle
  const s = g.room.data.shelter
  g.player.body.x = s.x - 10
  g.player.body.y = s.y - 30
  g.player.body.vx = 0
  g.player.body.vy = 0
  window.__G.food = 3
  window.__G.timeLeft = 190
  window.__G.karma = 2
})
await wait(600)
await page.keyboard.down('KeyS')
for (let i = 0; i < 12; i++) {
  await wait(160)
  const st = await page.evaluate(() => ({ phase: window.__G.phase, p: Number(window.__G.shelterProgress.toFixed(2)), inS: window.__G.sheltered }))
  if (st.phase === 'hibernate') break
}
await page.keyboard.up('KeyS')
await wait(900)
console.log('STATE', JSON.stringify(await page.evaluate(() => ({ phase: window.__G.phase, title: document.querySelector('.panel-title')?.textContent?.trim(), karma: window.__G.karma }))))
await page.screenshot({ path: 'screenshots/hero-hibernate.png' })

// 死亡
await page.click('.btn.primary')
await wait(1400)
await page.evaluate(() => window.__rainCycle.die('被暴雨吞没'))
await wait(1200)
console.log('DEATH', JSON.stringify(await page.evaluate(() => ({ phase: window.__G.phase, title: document.querySelector('.panel-title')?.textContent?.trim() }))))
await page.screenshot({ path: 'screenshots/hero-death.png' })
await browser.disconnect()
