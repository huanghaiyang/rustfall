// 浏览器冒烟测试：连接已启动的 Chrome(CDP)，真实操作游戏并抓错误与截图
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const URL = process.env.GAME_URL || 'http://127.0.0.1:5173'
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9333'
const OUT = path.resolve('screenshots')
fs.mkdirSync(OUT, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.connect({
  browserURL: CDP,
  defaultViewport: { width: 1440, height: 810 },
})

const page = await browser.newPage()
await page.bringToFront()
const errors = []
const warns = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (msg) => {
  const t = msg.type()
  if (t === 'error') errors.push('CONSOLE: ' + msg.text())
  else if (t === 'warning') warns.push('WARN: ' + msg.text())
})
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
await wait(1500)

const initial = await page.evaluate(() => {
  const g = window.__rainCycle
  return g
    ? {
        booted: true,
        canvas: !!document.querySelector('canvas'),
        title: document.querySelector('.title-main')?.textContent?.trim(),
        room: g.room?.data?.spec?.name,
        tiles: g.room?.tileCounts,
        entities: { fruits: g.room?.fruits?.length, lizards: g.room?.lizards?.length },
        drawCalls: g.renderer?.info?.render?.calls,
        phase: window.__G?.phase,
      }
    : { booted: false }
})
console.log('INITIAL', JSON.stringify(initial))
await page.screenshot({ path: path.join(OUT, '01-title.png') })

await page.evaluate(() => window.__rainCycle.startNewGame())
await wait(1000)
let st = await page.evaluate(() => {
  const g = window.__rainCycle
  return {
    phase: window.__G?.phase,
    player: g.player ? { x: g.player.body.x, y: g.player.body.y, onGround: g.player.body.onGround } : null,
    room: g.room?.data?.spec?.name,
    anim: g.player?.animName,
    calls: g.renderer.info.render.calls,
  }
})
console.log('STARTED', JSON.stringify(st))
await page.screenshot({ path: path.join(OUT, '02-start.png') })

// 向右跑 2 秒
const x0 = st.player?.x
await page.keyboard.down('KeyD')
await wait(2000)
await page.keyboard.up('KeyD')
await wait(300)
st = await page.evaluate(() => {
  const g = window.__rainCycle
  return {
    player: { x: g.player.body.x, y: g.player.body.y, vx: g.player.body.vx, onGround: g.player.body.onGround },
    phase: window.__G?.phase,
    anim: g.player.animName,
    calls: g.renderer.info.render.calls,
    tris: g.renderer.info.render.triangles,
  }
})
console.log('AFTER RUN', JSON.stringify(st), 'dx=', (st.player.x - x0).toFixed(1))
await page.screenshot({ path: path.join(OUT, '03-run.png') })

// 跳跃
await page.keyboard.down('Space')
await wait(200)
const midJump = await page.evaluate(() => {
  const g = window.__rainCycle
  return { y: g.player.body.y, vy: g.player.body.vy, anim: g.player.animName, onGround: g.player.body.onGround }
})
await page.keyboard.up('Space')
await wait(700)
const afterJump = await page.evaluate(() => {
  const g = window.__rainCycle
  return { y: g.player.body.y, vy: g.player.body.vy, anim: g.player.animName, onGround: g.player.body.onGround }
})
console.log('JUMP', JSON.stringify(midJump), '->', JSON.stringify(afterJump))
await page.screenshot({ path: path.join(OUT, '04-jump.png') })

const hud = await page.evaluate(() => ({
  hint: document.querySelector('.hint')?.textContent?.trim(),
  region: document.querySelector('.region')?.textContent?.trim(),
  room: document.querySelector('.room')?.textContent?.trim(),
  karma: document.querySelectorAll('.karma-rune.on').length,
  food: document.querySelectorAll('.food-pip.on').length,
  timer: document.querySelector('.timer-time')?.textContent?.trim(),
}))
console.log('HUD', JSON.stringify(hud))

// 暂停
await page.keyboard.press('Escape')
await wait(450)
const paused = await page.evaluate(() => ({
  panel: document.querySelector('.panel-title')?.textContent?.trim(),
  phase: window.__G?.phase,
  fps: window.__G?.fps,
}))
console.log('PAUSE', JSON.stringify(paused))
await page.screenshot({ path: path.join(OUT, '05-pause.png') })
await page.keyboard.press('Escape')
await wait(300)

// 帮助
await page.keyboard.press('KeyH')
await wait(500)
console.log('HELP visible', await page.evaluate(() => !!document.querySelector('.help-grid')))
await page.screenshot({ path: path.join(OUT, '06-help.png') })
await page.keyboard.press('KeyH')
await wait(300)

// 房间切换
const before = await page.evaluate(() => {
  const g = window.__rainCycle
  g.player.body.x = g.room.data.worldW - 30
  return { room: g.room.data.spec.id, w: g.room.data.worldW }
})
await wait(1800)
const afterTrans = await page.evaluate(() => {
  const g = window.__rainCycle
  return {
    room: g.room.data.spec.id,
    roomName: g.room.data.spec.name,
    playerX: Math.round(g.player.body.x),
    phase: window.__G?.phase,
    entities: { fruits: g.room.fruits.length, lizards: g.room.lizards.length },
    calls: g.renderer.info.render.calls,
  }
})
console.log('TRANSITION', JSON.stringify(before), '->', JSON.stringify(afterTrans))
await page.screenshot({ path: path.join(OUT, '07-room2.png') })

// 下雨
await page.evaluate(() => (window.__G.timeLeft = 2))
await wait(4000)
const rain = await page.evaluate(() => ({
  rainPhase: window.__G.rainPhase,
  intensity: Number(window.__G.rainIntensity.toFixed(2)),
  exposed: Number(window.__G.exposed.toFixed(1)),
  phase: window.__G.phase,
}))
console.log('RAIN', JSON.stringify(rain))
await page.screenshot({ path: path.join(OUT, '08-rain.png') })

// 死亡
await page.evaluate(() => window.__rainCycle.die('测试暴雨'))
await wait(800)
const dead = await page.evaluate(() => ({
  phase: window.__G.phase,
  title: document.querySelector('.panel-title')?.textContent?.trim(),
  reason: document.querySelector('.panel-reason')?.textContent?.trim(),
}))
console.log('DEATH', JSON.stringify(dead))
await page.screenshot({ path: path.join(OUT, '09-death.png') })

await page.evaluate(() => window.__rainCycle.retryAfterDeath())
await wait(1000)
const retried = await page.evaluate(() => ({
  phase: window.__G.phase,
  room: window.__rainCycle.room.data.spec.id,
  karma: window.__G.karma,
  cycle: window.__G.cycle,
  player: { x: Math.round(window.__rainCycle.player.body.x), y: Math.round(window.__rainCycle.player.body.y) },
}))
console.log('RETRY', JSON.stringify(retried))
await page.screenshot({ path: path.join(OUT, '10-respawn.png') })

// 走到庇护所并休眠
const hib = await page.evaluate(async () => {
  const g = window.__rainCycle
  const s = g.room.data.shelter
  if (!s) return { skipped: true }
  g.player.body.x = s.x - 10
  g.player.body.y = s.y - 30
  window.__G.food = 3
  return { shelter: s, food: window.__G.food }
})
await wait(400)
await page.keyboard.down('KeyS')
await wait(1800)
await page.keyboard.up('KeyS')
const hibState = await page.evaluate(() => ({
  phase: window.__G.phase,
  progress: window.__G.shelterProgress,
  karma: window.__G.karma,
  title: document.querySelector('.panel-title')?.textContent?.trim(),
  result: window.__G.result,
}))
console.log('HIBERNATE', JSON.stringify(hib), '->', JSON.stringify(hibState))
await page.screenshot({ path: path.join(OUT, '11-hibernate.png') })

// 下一循环
await page.evaluate(() => window.__rainCycle.nextCycle())
await wait(1200)
const nextCycle = await page.evaluate(() => ({
  phase: window.__G.phase,
  cycle: window.__G.cycle,
  karma: window.__G.karma,
  timeLeft: Math.round(window.__G.timeLeft),
  room: window.__rainCycle.room.data.spec.id,
}))
console.log('NEXT CYCLE', JSON.stringify(nextCycle))
await page.screenshot({ path: path.join(OUT, '12-next-cycle.png') })

// 性能采样
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
  return {
    fps: Math.round((frames / (performance.now() - t0)) * 1000),
    calls: window.__rainCycle.renderer.info.render.calls,
    tris: window.__rainCycle.renderer.info.render.triangles,
    geometries: window.__rainCycle.renderer.info.memory.geometries,
    textures: window.__rainCycle.renderer.info.memory.textures,
  }
})
console.log('PERF', JSON.stringify(perf))

console.log('ERRORS', JSON.stringify(errors.slice(0, 25), null, 2))
console.log('WARNS', JSON.stringify(warns.slice(0, 10), null, 2))

await page.close()
await browser.disconnect()
if (errors.length) process.exitCode = 1
