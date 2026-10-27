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

// 1) UI 层级：标题 → 设置
await p.evaluate(() => [...document.querySelectorAll('.title-menu .btn')].find((x) => x.textContent.includes('设'))?.click())
await wait(900)
const ui = await p.evaluate(() => {
  const t = document.querySelector('.title-screen')
  const panel = document.querySelector('.rp-panel')
  const ov = [...document.querySelectorAll('.overlay')].map((o) => ({ z: getComputedStyle(o).zIndex, cls: o.className }))
  return {
    titleVisible: !!t && getComputedStyle(t).display !== 'none',
    titleZ: t ? getComputedStyle(t).zIndex : null,
    panelVisible: !!panel,
    panelZ: panel ? getComputedStyle(panel.closest('.overlay') || panel).zIndex : null,
    overlays: ov,
  }
})
console.log('UI STACK', JSON.stringify(ui))
await p.screenshot({ path: `${OUT}/fix-settings-over-title.png` })
await p.keyboard.press('Escape')
await wait(500)

// 2) 帧时间稳定性（CPU 限速 4x，测游戏时间 / 真实时间）
const cdp = await p.createCDPSession()
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
const t0 = await p.evaluate(() => ({ wall: performance.now(), gt: window.__rustfall.time, fps: window.__G.fps }))
await wait(3000)
const t1 = await p.evaluate(() => ({ wall: performance.now(), gt: window.__rustfall.time, fps: window.__G.fps }))
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
const ratio = (t1.gt - t0.gt) / ((t1.wall - t0.wall) / 1000)
console.log('TIMESTEP under 4x CPU throttle: ratio=', ratio.toFixed(3), 'fps=', t1.fps)
await wait(600)

// 3) 角色光块：默认关闭 / 开启对比
await p.click('.title-menu .btn.primary')
await wait(1700)
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /以此机体开始/.test(x.textContent))?.click())
await wait(2800)
const glow = await p.evaluate(() => {
  const g = window.__rustfall
  g.dayNight.time = 0.9
  g.dayNight.apply(true)
  return { settingGlow: window.__G.settings.glow, glowVisible: g.robot.glow ? g.robot.glow.visible : null, hasMap: !!(g.robot.glow && g.robot.glow.material.map) }
})
console.log('GLOW', JSON.stringify(glow))
const clip = await p.evaluate(() => {
  const g = window.__rustfall
  const v = g.viewSize()
  const sx = ((g.robot.centerX - (g.camWorld.x - v.w / 2)) / v.w) * 1600
  const sy = ((g.camWorld.y - g.robot.centerY + v.h / 2) / v.h) * 900
  return { x: Math.max(0, Math.round(sx - 130)), y: Math.max(0, Math.round(sy - 130)) }
})
await wait(900)
await p.screenshot({ path: `${OUT}/fix-glow-off-closeup.png`, clip: { x: clip.x, y: clip.y, width: 260, height: 260 } })

// 4) 噪点默认值 + postfx 联动
const noise = await p.evaluate(async () => {
  const g = window.__rustfall
  const before = { ...window.__G.settings }
  g.setSetting('postfx', true)
  await new Promise((r) => setTimeout(r, 500))
  const uniforms = g.postfx?.params || g.postfx?.uniforms || null
  const grainUniform = g.postfx?.material?.uniforms?.uGrain?.value
  g.setSetting('grain', true)
  await new Promise((r) => setTimeout(r, 400))
  const grainOn = g.postfx?.material?.uniforms?.uGrain?.value
  g.setSetting('grain', false)
  await new Promise((r) => setTimeout(r, 300))
  const grainOff = g.postfx?.material?.uniforms?.uGrain?.value
  g.setSetting('postfx', false)
  return { defaultGrain: before.grain, defaultPostfx: before.postfx, grainOn, grainOff, uniformKeys: uniforms ? Object.keys(uniforms).length : null }
})
console.log('NOISE', JSON.stringify(noise))
console.log('FPS', await p.evaluate(() => window.__G.fps))
console.log('ERRORS', JSON.stringify(errs.slice(0, 8), null, 2))
await p.close()
await b.disconnect()
