// 玩法验证：非避难所房间 → 怪物战斗 → 掉落拾取 → 挖掘 → 切房 → 待机 → 死亡 → 存档续玩 → 四区域截图
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const URL = process.env.GAME_URL || 'http://127.0.0.1:4180'
const OUT = path.resolve('screenshots-v2')
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (p, n) => {
  await p.screenshot({ path: path.join(OUT, n + '.png') })
  console.log('  shot', n)
}

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const page = await browser.newPage()
await page.bringToFront()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message).slice(0, 500)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300))
})
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 40000 })
await wait(4200)
await page.click('.title-menu .btn.primary')
await wait(1500)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))
  b?.click()
})
await wait(3000)

// 直接进入街道房间（有怪/战利品）
const street = await page.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom('city', 'city_street', 'left')
  const d = g.room.data
  return {
    room: d.roomId,
    monsters: g.director?.list?.length,
    loot: g.room.lootDrops.length,
    props: g.room.propMeshes.length,
    tiles: g.room.tileCounts,
    landmarks: d.landmarks?.map((l) => l.id),
    player: { x: Math.round(g.robot.body.x), y: Math.round(g.robot.body.y) },
  }
})
console.log('STREET', JSON.stringify(street))
await wait(1500)
await shot(page, '20-street')

// 战斗：靠近最近的怪并持续攻击
const combat = await page.evaluate(() => {
  const g = window.__rustfall
  const m = g.director?.list?.find((x) => x.alive)
  if (!m) return { noMonster: true }
  g.robot.body.x = m.px - 40
  g.robot.body.y = m.py - 40
  g.robot.facing = 1
  g.robot.invuln = 999
  return { monster: m.id, hp: m.hp, x: m.px, y: m.py }
})
console.log('COMBAT SETUP', JSON.stringify(combat))
const hpTrail = []
for (let i = 0; i < 14; i++) {
  await page.keyboard.down('KeyJ')
  await wait(220)
  await page.keyboard.up('KeyJ')
  await wait(120)
  const info = await page.evaluate(() => {
    const g = window.__rustfall
    const m = g.director?.list?.find((x) => x.alive)
    return m ? { hp: Math.round(m.hp), kills: window.__G.stats.kills, drops: g.room.lootDrops.length } : { dead: true, kills: window.__G.stats.kills, drops: g.room.lootDrops.length }
  })
  hpTrail.push(info)
  if (info.dead) break
}
console.log('COMBAT TRAIL', JSON.stringify(hpTrail.slice(-5)))
await shot(page, '21-combat')

// 捡掉落
const pick = await page.evaluate(async () => {
  const g = window.__rustfall
  const drop = g.room.lootDrops.find((d) => !d.picked && !d.buried)
  if (!drop) return { noDrop: true }
  g.robot.body.x = drop.x - 10
  g.robot.body.y = drop.y - 20
  return { drop: drop.itemId, inv: window.__G.inventory.slots.filter(Boolean).length }
})
await wait(1200)
const picked = await page.evaluate(() => ({
  inv: window.__G.inventory.slots.filter(Boolean).length,
  weight: window.__G.inventory.weight,
  looted: window.__G.stats.looted,
  archive: window.__G.archive.entries.length,
}))
console.log('PICKUP', JSON.stringify(pick), '->', JSON.stringify(picked))

// 挖土
const dig = await page.evaluate(() => {
  const g = window.__rustfall
  g.switchTool('shovel')
  const d = g.room.data
  // 找一块 SOIL
  for (let ty = 0; ty < d.h; ty++) {
    for (let tx = 0; tx < d.w; tx++) {
      if (d.map.get(tx, ty) === 6) {
        g.robot.body.x = tx * 32 - 10
        g.robot.body.y = ty * 32 - 40
        return { soil: true, tx, ty, tiles: g.room.tileCounts }
      }
    }
  }
  return { soil: false, tiles: g.room.tileCounts }
})
console.log('DIG SETUP', JSON.stringify(dig))
await wait(700)
for (let i = 0; i < 4; i++) {
  await page.keyboard.down('KeyJ')
  await wait(300)
  await page.keyboard.up('KeyJ')
  await wait(200)
}
console.log('DIG RESULT', JSON.stringify(await page.evaluate(() => ({ tiles: window.__rustfall.room.tileCounts, dirty: window.__rustfall.room.data.map.dirty.size }))))
await shot(page, '22-dig')

// 切房（走到右边界）
await page.evaluate(() => {
  const g = window.__rustfall
  g.robot.body.x = g.room.data.worldW - 30
  g.robot.body.y = g.room.data.doorRight.y - 40
})
await wait(1800)
const trans = await page.evaluate(() => ({ room: window.__rustfall.room?.data?.roomId, label: window.__G.roomName, phase: window.__G.phase }))
console.log('TRANSITION', JSON.stringify(trans))
await shot(page, '23-room2')

// 四区域巡览截图
for (const [region, room, file] of [
  ['village', 'village_field', '30-village'],
  ['factory', 'factory_hall', '31-factory'],
  ['dump', 'dump_mountain', '32-dump'],
]) {
  const info = await page.evaluate(
    ({ region, room }) => {
      const g = window.__rustfall
      g.loadRoom(region, room, 'left')
      return { room: g.room?.data?.roomId, biome: g.room?.data?.biome, monsters: g.director?.list?.length, props: g.room?.propMeshes?.length }
    },
    { region, room },
  )
  await wait(1400)
  console.log('REGION', region, JSON.stringify(info))
  await shot(page, file)
}

// 回到避难所待机
await page.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom('city', 'city_shelter', 'shelter')
  window.__G.power = 4
})
await wait(900)
await page.keyboard.down('KeyS')
await wait(1800)
await page.keyboard.up('KeyS')
const hib = await page.evaluate(() => ({ phase: window.__G.phase, signal: window.__G.signal, title: document.querySelector('.panel-title')?.textContent }))
console.log('HIBERNATE', JSON.stringify(hib))
await shot(page, '33-hibernate')
await page.evaluate(() => window.__rustfall.nextCycle())
await wait(1600)
console.log('NEXT CYCLE', JSON.stringify(await page.evaluate(() => ({ phase: window.__G.phase, cycle: window.__G.cycle, room: window.__rustfall.room?.data?.roomId }))))
await shot(page, '34-next-cycle')

// 存档 / 续玩
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('rustfall.save.v1') || 'null'))
console.log('SAVE', JSON.stringify(save ? { cycle: save.cycle, signal: save.signal, chassis: save.chassisId, inv: save.inventory?.slots?.filter(Boolean).length, quests: save.quests?.active?.length } : null))
await page.reload({ waitUntil: 'networkidle2' })
await wait(4200)
const title = await page.evaluate(() => ({ buttons: [...document.querySelectorAll('.title-menu .btn')].map((b) => b.textContent.trim()), hasSave: window.__G.hasSave }))
console.log('RELOAD TITLE', JSON.stringify(title))
if (title.buttons.some((t) => /继续/.test(t))) {
  await page.evaluate(() => [...document.querySelectorAll('.title-menu .btn')].find((b) => /继续/.test(b.textContent))?.click())
  await wait(3000)
  console.log('CONTINUE', JSON.stringify(await page.evaluate(() => ({ phase: window.__G.phase, cycle: window.__G.cycle, room: window.__rustfall.room?.data?.roomId, inv: window.__G.inventory.slots.filter(Boolean).length }))))
  await shot(page, '35-continue')
}

// 死亡 → 重启
await page.evaluate(() => window.__rustfall.die('测试：被塌方压碎'))
await wait(900)
console.log('DEATH', JSON.stringify(await page.evaluate(() => ({ phase: window.__G.phase, reason: window.__G.deathReason }))))
await shot(page, '36-death')
await page.evaluate(() => window.__rustfall.retryAfterDeath())
await wait(2200)
console.log('RETRY', JSON.stringify(await page.evaluate(() => ({ phase: window.__G.phase, room: window.__rustfall.room?.data?.roomId, signal: window.__G.signal, hp: window.__G.hp }))))

console.log('FPS', await page.evaluate(() => window.__G.fps))
console.log('ERRORS', JSON.stringify(errors.slice(0, 15), null, 2))
await page.close()
await browser.disconnect()
if (errors.length) process.exitCode = 1
