// 蜥蜴特写：把镜头对准蜥蜴并裁剪放大
import puppeteer from 'puppeteer-core'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1600, height: 900 } })
const page = await browser.newPage()
await page.bringToFront()
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180', { waitUntil: 'networkidle2' })
await wait(1500)
await page.click('.menu .btn.primary')
await wait(1200)
await page.evaluate(() => {
  const g = window.__rainCycle
  g.loadRoom('r2', 'left')
  const liz = g.room.lizards[0]
  g.player.invuln = 999
  g.player.body.x = liz.head.x - 180
  g.player.body.y = liz.head.y - 20
  window.__G.timeLeft = 200
  // 强制放大
  g.__forceZoom = 2.4
  const orig = g.updateCamera.bind(g)
  g.updateCamera = function (dt, instant) {
    orig(dt, instant)
    this.zoom = this.__forceZoom
    this.applyProjection()
    this.camera.position.set(this.camWorld.x, -this.camWorld.y, 200)
  }
})
await wait(2200)
for (let i = 0; i < 20; i++) {
  const st = await page.evaluate(() => {
    const g = window.__rainCycle
    const liz = g.room.lizards[0]
    return { state: liz.state, dist: Math.abs(g.player.body.x - liz.head.x) }
  })
  if (st.state === 'windup' || (st.state === 'chase' && st.dist < 120)) break
  await wait(100)
}
const box = await page.evaluate(() => {
  const g = window.__rainCycle
  const liz = g.room.lizards[0]
  const v = new (window.THREE ? window.THREE.Vector3 : Object)()
  const p = { x: liz.head.x, y: -liz.head.y, z: 2 }
  const cam = g.camera
  // 手动投影：正交相机
  const ndcX = (p.x - cam.position.x) / ((cam.right - cam.left) / 2 / cam.zoom)
  const ndcY = (p.y - cam.position.y) / ((cam.top - cam.bottom) / 2 / cam.zoom)
  const canvas = document.querySelector('canvas')
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  return { x: (ndcX * 0.5 + 0.5) * w, y: (-ndcY * 0.5 + 0.5) * h, w, h, state: liz.state }
})
console.log('LIZ SCREEN', JSON.stringify(box))
const cw = 520
const ch = 380
const clip = {
  x: Math.max(0, Math.min(box.w - cw, box.x - cw / 2)),
  y: Math.max(0, Math.min(box.h - ch, box.y - ch / 2)),
  width: cw,
  height: ch,
}
await page.screenshot({ path: 'screenshots/lizard-closeup.png', clip })
await page.screenshot({ path: 'screenshots/lizard-wide.png' })
await browser.disconnect()
