import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync('screenshots-v2', { recursive: true })
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage()
await p.bringToFront()
const errs = []
p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
await p.goto('http://127.0.0.1:4180', { waitUntil: 'networkidle2' })
await wait(4200)
await p.click('.title-menu .btn.primary')
await wait(1500)
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))?.click())
await wait(2800)

const rooms = [
  ['city', 'city_street', 'v2-city-street'],
  ['city', 'city_plaza', 'v2-city-plaza'],
  ['village', 'village_field', 'v2-village'],
  ['factory', 'factory_hall', 'v2-factory'],
  ['dump', 'dump_mountain', 'v2-dump'],
  ['city', 'city_shelter', 'v2-shelter'],
]
for (const [region, room, name] of rooms) {
  const info = await p.evaluate(
    ({ region, room }) => {
      const g = window.__rustfall
      g.loadRoom(region, room, room.includes('shelter') ? 'shelter' : 'left')
      g.robot.invuln = 999
      const d = g.room.data
      return { room: g.room.data.roomId, biome: d.biome, tiles: g.room.tileCounts, monsters: g.director?.list?.length, props: g.room.propMeshes.length, npcs: g.room.npcHolograms.length }
    },
    { region, room },
  )
  await wait(1600)
  await p.screenshot({ path: `screenshots-v2/${name}.png` })
  console.log(name, JSON.stringify(info))
}
// 酸雨
await p.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom('city', 'city_plaza', 'left')
  window.__G.timeLeft = 0.4
})
await wait(5000)
await p.screenshot({ path: 'screenshots-v2/v2-acid-rain.png' })
console.log('rain', JSON.stringify(await p.evaluate(() => ({ phase: window.__G.weatherPhase, i: window.__G.weatherIntensity, fog: window.__rustfall.weather.intensity }))))
// 待机
await p.evaluate(() => { const g = window.__rustfall; g.loadRoom('city', 'city_shelter', 'shelter'); window.__G.power = 4 })
await wait(900)
await p.keyboard.down('KeyS')
await wait(1700)
await p.keyboard.up('KeyS')
await wait(500)
await p.screenshot({ path: 'screenshots-v2/v2-hibernate.png' })
console.log('hib', await p.evaluate(() => window.__G.phase))
console.log('ERRORS', JSON.stringify(errs.slice(0, 8)))
await p.close()
await b.disconnect()
