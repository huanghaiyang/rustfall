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
p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 240)) })
await p.goto('http://127.0.0.1:4180', { waitUntil: 'networkidle2', timeout: 40000 })
await wait(4800)

const boot = await p.evaluate(() => {
  const g = window.__rustfall
  const R = g.regionsMod.REGIONS
  const order = g.regionsMod.REGION_ORDER
  return {
    order,
    rooms: order.reduce((n, r) => n + Object.keys(R[r].rooms).length, 0),
    weapons: !!g.weapons,
    eco: !!g.ecosystem,
    dayNight: { time: window.__G.dayNight.time, phase: window.__G.dayNight.phase },
  }
})
console.log('BOOT', JSON.stringify(boot))
await p.click('.title-menu .btn.primary')
await wait(1800)
// 卡片重叠：按列判断
const cards = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.card')].map((c) => {
    const r = c.getBoundingClientRect()
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, sh: c.scrollHeight }
  })
  let overlaps = 0
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], c = rows[j]
      const xOverlap = Math.min(a.r, c.r) - Math.max(a.l, c.l) > 4
      const yOverlap = Math.min(a.b, c.b) - Math.max(a.t, c.t) > 4
      if (xOverlap && yOverlap) overlaps++
    }
  return { count: rows.length, overlaps, contentOverflow: rows.filter((r) => r.sh > r.h + 2).length }
})
console.log('CARDS', JSON.stringify(cards))
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))?.click())
await wait(3000)

// 7 个区域巡览
const order = await p.evaluate(() => window.__rustfall.regionsMod.REGION_ORDER.slice())
for (const r of order) {
  const info = await p.evaluate((r) => {
    const g = window.__rustfall
    const reg = g.regionsMod.REGIONS[r]
    const roomId = Object.keys(reg.rooms).find((id) => reg.rooms[id].kind !== 'shelter')
    g.loadRoom(r, roomId, 'left')
    g.robot.invuln = 999
    const d = g.room.data
    return {
      region: r,
      room: d.roomId,
      size: [d.w, d.h],
      monsters: g.director?.list?.filter((m) => m.alive).length,
      large: g.director?.list?.filter((m) => m.def?.elite || /junk_golem|sky_warden|mimic_beast|swarm_core/.test(m.id)).length,
      eco: window.__G.ecosystem.active,
      weapons: d.weapons?.length || 0,
      drops: g.room.lootDrops.length,
      tiles: g.room.tileCounts,
    }
  }, r)
  await wait(1600)
  console.log('REGION', JSON.stringify(info))
  await p.screenshot({ path: `${OUT}/v4-${r}.png` })
}

// 武器拾取 + 开火
const w = await p.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom('city', 'city_street', 'left')
  g.robot.invuln = 999
  const ids = g.room.lootDrops.map((d) => d.itemId).filter((id) => /laser|pistol|pipe|dagger|hammer|nail|arc|rail|baton|scrap|wrench/.test(id))
  return { roomWeapons: g.room.data.weapons?.length, dropped: ids.slice(0, 6), drops: g.room.lootDrops.length }
})
console.log('WEAPONS IN ROOM', JSON.stringify(w))
const fire = await p.evaluate(async () => {
  const g = window.__rustfall
  g.inventory.add('laser_rifle', 1)
  g.inventory.add('ammo_laser', 40)
  g.equipItem('laser_rifle')
  g.robot.facing = 1
  await new Promise((r) => setTimeout(r, 400))
  const before = { ammo: window.__G.weapon.ammo, shots: g.weapons.shotCount, mesh: !!g.robot.weaponMesh, anim: g.robot.animName }
  for (let i = 0; i < 4; i++) g.weapons.fire()
  await new Promise((r) => setTimeout(r, 500))
  return { before, after: { ammo: window.__G.weapon.ammo, shots: g.weapons.shotCount, anim: g.robot.animName } }
})
console.log('FIRE', JSON.stringify(fire))
await p.screenshot({ path: `${OUT}/v4-fire.png` })

// 大怪专场
const large = await p.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom('factory', 'factory_hall', 'left')
  g.robot.invuln = 999
  const list = g.director?.list || []
  return { total: list.length, ids: list.map((m) => m.id), large: list.filter((m) => /junk_golem|sky_warden|mimic_beast|swarm_core/.test(m.id)).length }
})
console.log('LARGE', JSON.stringify(large))
await wait(2000)
await p.screenshot({ path: `${OUT}/v4-large.png` })

// 待机 + 存档
const save = await p.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom('city', 'city_shelter', 'shelter')
  window.__G.power = 4
  window.__G.timeLeft = 220
  g.hibernate()
  const raw = JSON.parse(localStorage.getItem('rustfall.save.v1') || 'null')
  return { phase: window.__G.phase, signal: window.__G.signal, savedDayNight: !!raw?.dayNight, savedSettings: !!raw?.settings }
})
console.log('SAVE', JSON.stringify(save))

const perf = await p.evaluate(() => ({ fps: window.__G.fps }))
console.log('PERF', JSON.stringify(perf))
console.log('ERRORS', JSON.stringify(errs.slice(0, 10), null, 2))
await p.close()
await b.disconnect()
