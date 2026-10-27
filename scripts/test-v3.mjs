import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'screenshots-v3'
fs.mkdirSync(OUT, { recursive: true })
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage()
await p.bringToFront()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.message).slice(0, 240)))
p.on('console', (m) => {
  if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 240))
})
await p.goto('http://127.0.0.1:4180', { waitUntil: 'networkidle2', timeout: 40000 })
await wait(4500)
const boot = await p.evaluate(() => {
  const g = window.__rustfall
  return {
    dayNight: window.__G.dayNight,
    settings: window.__G.settings,
    rooms: g?.regionsMod?.REGION_ORDER,
    regionKeys: Object.keys(g?.regionsMod?.REGIONS || {}),
    roomCount: g?.regionsMod?.REGION_ORDER?.reduce((n, r) => n + Object.keys(g.regionsMod.REGIONS[r].rooms || {}).length, 0),
    mods: window.__G.mods.list?.length,
    weapons: !!g?.weapons,
    eco: !!g?.ecosystem,
    large: !!g?.entities?.large,
  }
})
console.log('BOOT', JSON.stringify(boot))
await p.screenshot({ path: `${OUT}/01-title.png` })

// 设置面板
await p.evaluate(() => [...document.querySelectorAll('.title-menu .btn')].find((x) => x.textContent.includes('设'))?.click())
await wait(900)
console.log('SETTINGS', JSON.stringify(await p.evaluate(() => ({ panel: window.__G.ui.panel, txt: document.body.innerText.slice(0, 120) }))))
await p.screenshot({ path: `${OUT}/02-settings.png` })
await p.keyboard.press('Escape')
await wait(400)

// 开局
await p.click('.title-menu .btn.primary')
await wait(1800)
await p.screenshot({ path: `${OUT}/03-chassis.png` })
const cards = await p.evaluate(() => {
  const cs = [...document.querySelectorAll('.card')]
  const rows = cs.map((c) => { const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, scroll: c.scrollHeight } })
  const overlaps = []
  for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 1) overlaps.push([i - 1, i, Math.round(rows[i - 1].bottom - rows[i].top)])
  return { count: cs.length, overlaps, sample: rows.slice(0, 3) }
})
console.log('CARDS', JSON.stringify(cards))
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))?.click())
await wait(3200)
console.log('PLAY', JSON.stringify(await p.evaluate(() => {
  const g = window.__rustfall
  return {
    phase: window.__G.phase,
    room: g.room?.data?.roomId,
    dayNight: window.__G.dayNight,
    ecos: window.__G.ecosystem,
    monsters: g.director?.list?.length,
    weaponsOnGround: g.room?.data?.weapons?.length,
    large: g.director?.largeList?.length ?? g.director?.list?.filter((m) => m.def?.elite)?.length,
    tiles: g.room?.tileCounts,
  }
})))
await p.screenshot({ path: `${OUT}/04-shelter.png` })

// 拿起武器（找世界里的武器掉落）
const wr = await p.evaluate(() => {
  const g = window.__rustfall
  const drop = g.room?.lootDrops?.find((d) => /laser|pistol|pipe|dagger|hammer|nail|arc|rail|baton|scrap|wrench/.test(d.itemId))
  if (!drop) return { none: true, ids: g.room?.lootDrops?.slice(0, 8).map((d) => d.itemId) }
  g.robot.body.x = drop.x - 10
  g.robot.body.y = drop.y - 30
  return { id: drop.itemId }
})
await wait(1200)
console.log('WEAPON DROP', JSON.stringify(wr))
const eq = await p.evaluate(() => {
  const g = window.__rustfall
  const wid = window.__G.inventory.slots.filter(Boolean).map((s) => s.id).find((id) => /laser|pistol|pipe|dagger|hammer|nail|arc|rail|baton|scrap|wrench/.test(id))
  if (!wid) return { none: true, inv: window.__G.inventory.slots.filter(Boolean).map((s) => s.id) }
  g.equipItem(wid)
  return { wid, state: window.__G.weapon }
})
console.log('EQUIP', JSON.stringify(eq))
await wait(600)
await p.evaluate(() => { const g = window.__rustfall; g.robot.facing = 1 })
for (let i = 0; i < 6; i++) {
  await p.keyboard.down('KeyJ')
  await wait(180)
  await p.keyboard.up('KeyJ')
  await wait(120)
}
console.log('FIRE', JSON.stringify(await p.evaluate(() => ({ weapon: window.__G.weapon, shots: window.__rustfall.weapons?.shotCount, ammo: window.__G.weapon?.ammo }))))
await p.screenshot({ path: `${OUT}/05-fire.png` })

// 大房间 / 新区域
const regions = await p.evaluate(() => window.__rustfall.regionsMod.REGION_ORDER.slice())
for (const r of regions) {
  const info = await p.evaluate((r) => {
    const g = window.__rustfall
    const reg = g.regionsMod.REGIONS[r]
    const roomId = Object.keys(reg.rooms).find((id) => !reg.rooms[id].kind?.includes('shelter')) || Object.keys(reg.rooms)[0]
    g.loadRoom(r, roomId, 'left')
    g.robot.invuln = 999
    return {
      region: r,
      room: g.room?.data?.roomId,
      w: g.room?.data?.w,
      h: g.room?.data?.h,
      monsters: g.director?.list?.length,
      large: g.director?.list?.filter((m) => m.def?.elite)?.length,
      eco: window.__G.ecosystem.active,
      weapons: g.room?.data?.weapons?.length,
      tiles: g.room?.tileCounts,
    }
  }, r)
  console.log('REGION', JSON.stringify(info))
  await wait(1500)
  await p.screenshot({ path: `${OUT}/region-${r}.png` })
}

// 日夜快进 + 天气
const dn = await p.evaluate(() => {
  const g = window.__rustfall
  g.dayNight.time = 0.9
  g.dayNight.setWeather('toxicfog', 60)
  return { time: g.dayNight.time, weather: g.dayNight.weatherId }
})
await wait(1800)
console.log('DAYNIGHT', JSON.stringify(await p.evaluate(() => window.__G.dayNight)))
await p.screenshot({ path: `${OUT}/06-night-toxicfog.png` })

console.log('FPS', await p.evaluate(() => window.__G.fps))
console.log('ERRORS', JSON.stringify(errs.slice(0, 12), null, 2))
await p.close()
await b.disconnect()
if (errs.length) process.exitCode = 1
