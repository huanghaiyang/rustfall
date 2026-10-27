// RUSTFALL v2 冒烟：标题 → 选机体 → 游玩 → 背包/任务/档案 → 对话 → 切机体 → 切房 → 酸雨
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const URL = process.env.GAME_URL || 'http://127.0.0.1:4180'
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9333'
const OUT = path.resolve('screenshots-v2')
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (page, n) => {
  await page.screenshot({ path: path.join(OUT, n + '.png') })
  console.log('  shot', n)
}

const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1600, height: 900 } })
const page = await browser.newPage()
await page.bringToFront()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message).slice(0, 400)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300))
})
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 40000 })
await wait(4000)

const boot = await page.evaluate(() => {
  const g = window.__rustfall
  return {
    booted: !!g,
    phase: window.__G?.phase,
    hasSave: window.__G?.hasSave,
    mods: window.__G?.mods,
    rooms: g?.regionsMod?.REGION_ORDER,
    biomes: !!g?.generateRoom,
    title: document.querySelector('.title-cn')?.textContent,
    buttons: [...document.querySelectorAll('.title-menu .btn')].map((b) => b.textContent.trim()),
    bootError: g?.bootError,
    drawCalls: g?.renderer?.info?.render?.calls,
  }
})
console.log('BOOT', JSON.stringify(boot))
await shot(page, '01-title')

// 开始 → 选机体
await page.click('.title-menu .btn.primary')
await wait(1600)
await shot(page, '02-chassis')
const chassis = await page.evaluate(() => ({
  cards: document.querySelectorAll('.rf-chassis-card, [class*="chassis"]').length,
  text: document.body.innerText.slice(0, 300),
}))
console.log('CHASSIS UI', JSON.stringify(chassis).slice(0, 500))

// 点击第一个机体卡的确认/开始按钮
const started = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find((x) => /安装|开始|确认|出发|启用/.test(x.textContent))
  if (b) {
    b.click()
    return b.textContent.trim()
  }
  return null
})
console.log('CLICK START CHASSIS', started)
console.log('AFTER CLICK PHASE', await page.evaluate(() => window.__G.phase))
await wait(3200)

let st = await page.evaluate(() => {
  const g = window.__rustfall
  return {
    phase: window.__G.phase,
    room: g?.room?.data?.roomId,
    region: window.__G.regionId,
    roomName: window.__G.roomName,
    player: g?.robot ? { x: Math.round(g.robot.body.x), y: Math.round(g.robot.body.y), hp: window.__G.hp, chassis: window.__G.chassisId } : null,
    monsters: g?.director?.list?.length,
    interactables: g?.room?.interactables?.length,
    loot: g?.room?.lootDrops?.length,
    props: g?.room?.propMeshes?.length,
    tiles: g?.room?.tileCounts,
    inventory: window.__G.inventory.slots.filter(Boolean).length,
    quests: window.__G.quests.active.map((q) => q.id),
    dialogue: window.__G.dialogue.active,
    calls: g?.renderer?.info?.render?.calls,
    tris: g?.renderer?.info?.render?.triangles,
  }
})
console.log('PLAYING', JSON.stringify(st))
await shot(page, '03-playing')

// 移动 + 跳跃
await page.keyboard.down('KeyD')
await wait(1200)
await page.keyboard.up('KeyD')
await page.keyboard.down('Space')
await wait(160)
await page.keyboard.up('Space')
await wait(600)
console.log('MOVE', JSON.stringify(await page.evaluate(() => {
  const g = window.__rustfall
  return { x: Math.round(g.robot.body.x), y: Math.round(g.robot.body.y), onGround: g.robot.body.onGround, anim: g.robot.animName }
})))
await shot(page, '04-move')

// 背包 / 任务 / 档案 / 同伴
for (const [key, file] of [['KeyI', '05-inventory'], ['KeyL', '06-quests'], ['KeyC', '07-archive'], ['KeyR', '08-companions']]) {
  await page.keyboard.press(key)
  await wait(700)
  const panel = await page.evaluate(() => document.querySelector('.rp-panel, .rf-panel, .overlay .panel')?.innerText?.slice(0, 120) || null)
  console.log('PANEL', key, JSON.stringify(panel))
  await shot(page, file)
  await page.keyboard.press('Escape')
  await wait(400)
}

// 与同伴对话
const npcInfo = await page.evaluate(() => {
  const g = window.__rustfall
  const npc = g.room.interactables.find((i) => i.kind === 'npc')
  if (!npc) return null
  g.robot.body.x = npc.x - 40
  g.robot.body.y = npc.y - 40
  g.robot.facing = 1
  return { npcId: npc.npcId, x: npc.x, y: npc.y }
})
console.log('NPC', JSON.stringify(npcInfo))
await wait(600)
await page.keyboard.press('KeyE')
await wait(900)
const dlg = await page.evaluate(() => ({
  active: window.__G.dialogue.active,
  npc: window.__G.dialogue.npcName,
  text: (window.__G.dialogue.text || '').slice(0, 60),
  choices: (window.__G.dialogue.choices || []).map((c) => c.text),
}))
console.log('DIALOGUE', JSON.stringify(dlg))
await shot(page, '09-dialogue')
await page.keyboard.press('Enter')
await wait(700)
await page.keyboard.press('Digit1')
await wait(600)
await shot(page, '10-dialogue-choice')
await page.keyboard.press('Escape')
await wait(500)

// 切换机体
const switchBefore = await page.evaluate(() => window.__G.chassisId)
await page.keyboard.press('KeyQ')
await wait(1600)
const switchAfter = await page.evaluate(() => ({ id: window.__G.chassisId, hp: window.__G.hp, hpMax: window.__G.hpMax, energy: Math.round(window.__G.energy) }))
console.log('CHASSIS SWITCH', switchBefore, '->', JSON.stringify(switchAfter))
await shot(page, '11-chassis-switch')

// 工具切换 + 挖掘尝试
await page.keyboard.press('Digit2')
await wait(400)
await page.keyboard.down('KeyJ')
await wait(400)
await page.keyboard.up('KeyJ')
await wait(500)
console.log('TOOL/ATTACK', JSON.stringify(await page.evaluate(() => ({ tool: window.__G.toolId, scanFx: window.__rustfall.scanFx.length }))))
await shot(page, '12-tool')

// 切房：走到右门
const before = await page.evaluate(() => {
  const g = window.__rustfall
  g.robot.body.x = g.room.data.worldW - 80
  g.robot.body.y = g.room.data.doorRight.y - 40
  return { room: g.room.data.roomId, w: g.room.data.worldW }
})
await wait(1600)
const after = await page.evaluate(() => ({
  room: window.__rustfall.room?.data?.roomId,
  label: window.__G.roomName,
  phase: window.__G.phase,
  props: window.__rustfall.room?.propMeshes?.length,
  monsters: window.__rustfall.director?.list?.length,
}))
console.log('ROOM TRANSITION', JSON.stringify(before), '->', JSON.stringify(after))
await shot(page, '13-room2')

// 酸雨
await page.evaluate(() => {
  window.__G.timeLeft = 1
})
await wait(4000)
const rain = await page.evaluate(() => ({
  phase: window.__G.weatherPhase,
  intensity: Number(window.__G.weatherIntensity.toFixed(2)),
  exposed: Number(window.__G.exposed.toFixed(1)),
  gamePhase: window.__G.phase,
}))
console.log('ACID RAIN', JSON.stringify(rain))
await shot(page, '14-acid-rain')

// 性能
const perf = await page.evaluate(async () => {
  const t0 = performance.now()
  let frames = 0
  await new Promise((resolve) => {
    const tick = () => {
      frames++
      if (performance.now() - t0 > 2000) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const g = window.__rustfall
  return {
    fps: Math.round((frames / (performance.now() - t0)) * 1000),
    calls: g.renderer.info.render.calls,
    tris: g.renderer.info.render.triangles,
    geometries: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
  }
})
console.log('PERF', JSON.stringify(perf))
console.log('ERRORS', JSON.stringify(errors.slice(0, 20), null, 2))
await page.close()
await browser.disconnect()
if (errors.length) process.exitCode = 1




