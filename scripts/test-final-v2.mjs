// 终验：继续游戏 / 死亡重启 / 营救 / 装备 / 任务进度 / 模组面板
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync('screenshots-v2', { recursive: true })
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage()
await p.bringToFront()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.message).slice(0, 300)))
p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)) })
const log = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v))

await p.goto('http://127.0.0.1:4180', { waitUntil: 'networkidle2' })
await wait(4200)
await p.click('.title-menu .btn.primary')
await wait(1500)
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))?.click())
await wait(2800)
log('START', await p.evaluate(() => ({ phase: window.__G.phase, room: window.__rustfall.room.data.roomId, mods: window.__G.mods.list?.map((m) => `${m.id}:${m.loaded ? 'ok' : 'fail'}/${m.items}`) })))

// 装备组件 + 任务进度
log('EQUIP', await p.evaluate(() => {
  const g = window.__rustfall
  g.inventory.add('armor_plate_mil', 1)
  const before = window.__G.hpMax
  g.equipItem('armor_plate_mil')
  return { before, after: window.__G.hpMax, equipped: Object.keys(window.__G.equipped || {}), slots: window.__G.inventory.slots.filter(Boolean).length }
}))
log('QUEST', await p.evaluate(() => {
  const g = window.__rustfall
  g.inventory.add('lubricant', 5)
  return { active: window.__G.quests.active.map((q) => ({ id: q.id, progress: q.progress })), tracked: window.__G.quests.tracked }
}))

// 模组面板
await p.keyboard.press('KeyO')
await wait(800)
log('MOD PANEL', await p.evaluate(() => ({
  panel: window.__G.ui.panel,
  text: document.querySelector('.rp-panel')?.innerText?.slice(0, 220) || null,
})))
await p.screenshot({ path: 'screenshots-v2/v2-mods.png' })
await p.keyboard.press('Escape')
await wait(400)

// 营救：灰雀在 city_slum
const cage = await p.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom('city', 'city_slum', 'left')
  g.robot.invuln = 999
  const c = g.room.cages[0]
  if (!c) return { none: true, interactables: g.room.interactables.map((i) => i.kind) }
  g.robot.body.x = c.x - 40
  g.robot.body.y = c.y - 40
  g.robot.facing = 1
  return { cage: c.id, rescueQuest: c.rescueQuest, companion: c.companionId }
})
log('CAGE', cage)
await wait(900)
await p.keyboard.press('KeyE')
await wait(1200)
log('RESCUE', await p.evaluate(() => ({
  rescue: window.__G.rescue,
  companion: window.__G.companions.huique || null,
  quests: window.__G.quests.active.map((q) => q.id),
  flags: Object.keys(window.__G.flags).filter((k) => k.includes('cage')),
})))
await p.screenshot({ path: 'screenshots-v2/v2-rescue.png' })
// 带回避难所
await p.evaluate(() => window.__rustfall.loadRoom('city', 'city_shelter', 'shelter'))
await wait(1600)
log('RESCUE DELIVER', await p.evaluate(() => ({
  rescue: window.__G.rescue?.active,
  companion: window.__G.companions.huique || null,
  toast: window.__G.hint,
})))

// 存档后重载 → 继续
await p.evaluate(() => window.__rustfall.saveGame())
await p.reload({ waitUntil: 'networkidle2' })
await wait(4200)
const buttons = await p.evaluate(() => [...document.querySelectorAll('.title-menu .btn')].map((b) => b.textContent.trim()))
log('RELOAD BUTTONS', buttons)
const clicked = await p.evaluate(() => {
  const b = [...document.querySelectorAll('.title-menu .btn')].find((x) => x.textContent.includes('继'))
  if (!b) return false
  b.click()
  return true
})
await wait(3200)
log('CONTINUE', { clicked, ...(await p.evaluate(() => ({
  phase: window.__G.phase,
  cycle: window.__G.cycle,
  room: window.__rustfall.room?.data?.roomId,
  inv: window.__G.inventory.slots.filter(Boolean).length,
  rescued: window.__G.companions.huique?.rescued || false,
  chassis: window.__G.chassisId,
}))) })
await p.screenshot({ path: 'screenshots-v2/v2-continue.png' })

// 死亡 → 重启
await p.evaluate(() => window.__rustfall.die('酸雨烧穿了主板'))
await wait(900)
log('DEATH', await p.evaluate(() => ({ phase: window.__G.phase, reason: window.__G.deathReason, panel: document.querySelector('.panel-title')?.textContent })))
await p.screenshot({ path: 'screenshots-v2/v2-death.png' })
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /重\s*启/.test(x.textContent))?.click())
await wait(2400)
log('RETRY', await p.evaluate(() => ({ phase: window.__G.phase, room: window.__rustfall.room?.data?.roomId, signal: window.__G.signal, hp: window.__G.hp })))
log('FPS', await p.evaluate(() => window.__G.fps))
log('ERRORS', errs.slice(0, 10))
await p.close()
await b.disconnect()
if (errs.length) process.exitCode = 1
