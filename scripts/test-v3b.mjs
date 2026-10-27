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
await p.goto('http://127.0.0.1:4180', { waitUntil: 'networkidle2' })
await wait(4300)
await p.click('.title-menu .btn.primary')
await wait(1700)
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))?.click())
await wait(3200)

// 1) 注入武器 + 装弹 + 开火
const wset = await p.evaluate(() => {
  const g = window.__rustfall
  const inv = g.inventory
  inv.add('laser_pistol', 1)
  inv.add('ammo_laser', 40)
  g.equipItem('laser_pistol')
  return { inv: window.__G.inventory.slots.filter(Boolean).map((s) => s.id + 'x' + s.n), weapon: window.__G.weapon }
})
console.log('W1', JSON.stringify(wset))
await wait(700)
await p.evaluate(() => { window.__rustfall.robot.facing = 1 })
for (let i = 0; i < 5; i++) {
  await p.keyboard.down('KeyJ')
  await wait(160)
  await p.keyboard.up('KeyJ')
  await wait(140)
}
const fire = await p.evaluate(() => ({
  weapon: window.__G.weapon,
  shots: window.__rustfall.weapons.shotCount,
  ammo: window.__G.weapon.ammo,
  reserve: window.__G.weapon.reserve,
  anim: window.__rustfall.robot.animName,
  held: window.__rustfall.robot.heldWeapon,
  weaponMesh: !!window.__rustfall.robot.weaponMesh,
}))
console.log('FIRE', JSON.stringify(fire))
await p.screenshot({ path: `${OUT}/10-fire.png` })

// 2) 不可装配机型：hammer 在 ghost 上应失败
const compat = await p.evaluate(() => {
  const g = window.__rustfall
  window.__G.chassisId = 'ghost'
  g.robot?.switchChassis?.('ghost')
  g.inventory.add('hammer', 1)
  const wr = g.weapons.equip('hammer')
  return { ok: wr.ok, reason: wr.reason }
})
console.log('COMPAT', JSON.stringify(compat))

// 3) 手柄模拟
const pad = await p.evaluate(async () => {
  const g = window.__rustfall
  const fake = {
    index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard',
    axes: [1, 0, 0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  }
  fake.buttons[0] = { pressed: true, value: 1 }
  navigator.getGamepads = () => [fake]
  g.input.pad.connected = true
  g.input.pad.index = 0
  g.input.pollGamepad(0.016)
  return {
    connected: window.__G.gamepad.connected,
    jumpDown: g.input.isDown('jump'),
    jumpPressed: g.input.wasPressed('jump'),
    hint: !!document.querySelector('.pad-hint'),
  }
})
console.log('GAMEPAD', JSON.stringify(pad))
await p.screenshot({ path: `${OUT}/11-gamepad.png` })
await p.waitForFunction(() => !!document.querySelector('.pad-hint'), { timeout: 3000 }).catch(() => {})

// 4) 精灵特写（角色四周是否有透明脏边）
const rect = await p.evaluate(() => {
  const g = window.__rustfall
  const v = g.viewSize()
  const cam = g.camWorld
  const sx = ((g.robot.centerX - (cam.x - v.w / 2)) / v.w) * 1600
  const sy = ((-(g.robot.centerY) - (cam.y - v.h / 2) * -1) / v.h) * 900
  return { x: Math.round(sx), y: Math.round(sy) }
})
await p.screenshot({ path: `${OUT}/12-closeup.png`, clip: { x: Math.max(0, rect.x - 150), y: Math.max(0, rect.y - 150), width: 300, height: 300 } })

// 5) 设置：开后期后 drawcall 变化
const pfx = await p.evaluate(async () => {
  const g = window.__rustfall
  const before = { settings: { ...window.__G.settings }, postfx: !!g.postfx }
  g.setSetting('postfx', true)
  g.setSetting('glow', true)
  await new Promise((r) => setTimeout(r, 600))
  return { before, after: { ...window.__G.settings }, postfxObj: !!g.postfx }
})
console.log('PFX', JSON.stringify(pfx))
await p.screenshot({ path: `${OUT}/13-postfx-on.png` })

console.log('DAY', JSON.stringify(await p.evaluate(() => ({ time: window.__G.dayNight.time, phase: window.__G.dayNight.phase, weather: window.__G.dayNight.weather }))))
console.log('ERRORS', JSON.stringify(errs.slice(0, 10), null, 2))
await p.close()
await b.disconnect()
