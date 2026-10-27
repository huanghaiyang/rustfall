import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'screenshots-v3'
fs.mkdirSync(OUT, { recursive: true })
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage()
await p.bringToFront()
const errs = []
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
await p.goto('http://127.0.0.1:4180', { waitUntil: 'networkidle2' })
await wait(4700)
await p.click('.title-menu .btn.primary')
await wait(1700)
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))?.click())
await wait(3000)

// 1) 武器拾取（metro 房间有 weapons 数据）
const pickup = await p.evaluate(async () => {
  const g = window.__rustfall
  g.loadRoom('metro', 'metro_platform', 'left')
  g.robot.invuln = 999
  const de = g.room.data.weapons?.[0]
  const drop = g.room.lootDrops.find((d) => /laser|pistol|pipe|dagger|hammer|nail|arc|rail|baton|scrap|wrench/.test(d.itemId))
  if (!drop) return { none: true, data: de, drops: g.room.lootDrops.map((d) => d.itemId).slice(0, 12) }
  g.robot.body.x = drop.x - 8
  g.robot.body.y = drop.y - 30
  await new Promise((r) => setTimeout(r, 700))
  const inv = window.__G.inventory.slots.filter(Boolean).map((s) => s.id)
  const wid = inv.find((id) => /laser|pistol|pipe|dagger|hammer|nail|arc|rail|baton|scrap|wrench/.test(id))
  if (wid) {
    g.equipItem(wid)
    g.weapons.reload()
    await new Promise((r) => setTimeout(r, 1700))
  }
  return { got: wid, inv, weapon: { ammo: window.__G.weapon.ammo, ammoMax: window.__G.weapon.ammoMax, reserve: window.__G.weapon.reserve, mesh: !!g.robot.weaponMesh } }
})
console.log('PICKUP', JSON.stringify(pickup))
await p.screenshot({ path: `${OUT}/v5-weapon-hold.png` })

// 2) 开火（等换弹完成）
const fire = await p.evaluate(async () => {
  const g = window.__rustfall
  g.robot.facing = 1
  const before = { ammo: window.__G.weapon.ammo, shots: g.weapons.shotCount }
  for (let i = 0; i < 3; i++) g.weapons.fire()
  await new Promise((r) => setTimeout(r, 140))
  return { before, mid: { ammo: window.__G.weapon.ammo, shots: g.weapons.shotCount, anim: g.robot.animName } }
})
console.log('FIRE', JSON.stringify(fire))
await p.screenshot({ path: `${OUT}/v5-fire.png` })

// 3) 三种大型敌人
const large = await p.evaluate(async () => {
  const g = window.__rustfall
  g.loadRoom('factory', 'factory_intake', 'left')
  g.robot.invuln = 999
  const out = []
  for (const id of ['junk_golem', 'sky_warden', 'mimic_beast', 'swarm_core']) {
    try {
      const m = g.director.spawn(id, g.robot.centerX + 260, g.robot.body.y + g.robot.body.h - 60)
      if (m) out.push({ id, ok: true, size: [m.w, m.h], art: !!m.frames })
    } catch (e) {
      out.push({ id, error: String(e).slice(0, 80) })
    }
  }
  return out
})
console.log('LARGE SPAWN', JSON.stringify(large))
await wait(1800)
await p.screenshot({ path: `${OUT}/v5-large-golem.png` })
await p.evaluate(() => { const g = window.__rustfall; const m = g.director.list.find((x) => x.id === 'sky_warden'); if (m) { g.robot.body.x = m.px - 200; g.robot.body.y = m.py - 60 } })
await wait(1200)
await p.screenshot({ path: `${OUT}/v5-large-warden.png` })

// 4) 特写（正确投影）
const clip = await p.evaluate(() => {
  const g = window.__rustfall
  const v = g.viewSize()
  const sx = ((g.robot.centerX - (g.camWorld.x - v.w / 2)) / v.w) * 1600
  const sy = ((g.camWorld.y - g.robot.centerY + v.h / 2) / v.h) * 900
  return { x: Math.max(0, Math.round(sx - 160)), y: Math.max(0, Math.round(sy - 160)), w: 320, h: 320 }
})
await p.screenshot({ path: `${OUT}/v5-closeup.png`, clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h } })

// 5) 移动动画帧
const anim = await p.evaluate(async () => {
  const g = window.__rustfall
  g.loadRoom('city', 'city_street', 'left')
  g.robot.invuln = 999
  const frames = []
  g.input.down.add('KeyD')
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 90))
    frames.push({ anim: g.robot.animName, f: Math.floor(g.robot.frame) })
  }
  g.input.down.delete('KeyD')
  return frames
})
console.log('ANIM', JSON.stringify(anim))

// 6) 手柄完整映射
const pad = await p.evaluate(() => {
  const g = window.__rustfall
  const fake = {
    index: 0, id: 'Xbox Wireless Controller', connected: true, mapping: 'standard',
    axes: [0.9, -0.8, 0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  }
  fake.buttons[2] = { pressed: true, value: 1 } // X
  fake.buttons[1] = { pressed: true, value: 1 } // B
  navigator.getGamepads = () => [fake]
  g.input.pad.connected = true; g.input.pad.index = 0
  g.input.pollGamepad(0.016)
  return {
    right: g.input.isDown('right'), up: g.input.isDown('up'), attack: g.input.isDown('attack'),
    interact: g.input.isDown('interact'), axisX: g.input.axisX(), aim: g.input.aimVector(),
    connected: window.__G.gamepad.connected, usingPad: g.input.usingGamepad(),
  }
})
console.log('GAMEPAD', JSON.stringify(pad))

console.log('FPS', await p.evaluate(() => window.__G.fps))
console.log('ERRORS', JSON.stringify(errs.slice(0, 8)))
await p.close()
await b.disconnect()
