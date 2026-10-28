// 临时冒烟：BOSS 测试房菜单 → 进入 tb_data_archon → 抓状态与截图
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'C:\\Users\\huanh\\AppData\\Local\\Temp\\rf-shot'
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text())
})
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText))

await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(5000)
await page.screenshot({ path: path.join(OUT, '01-title.png') })

const boot = await page.evaluate(() => ({
  hasGame: !!window.__rustfall,
  phase: window.__G?.phase,
  buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 14),
}))
console.log('BOOT', JSON.stringify(boot))

// 点标题界面「BOSS 测试房」
const clickedMenu = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('BOSS测试房'))
  if (!b) return false
  b.click()
  return true
})
await wait(900)
await page.screenshot({ path: path.join(OUT, '02-panel.png') })
const panel = await page.evaluate(() => ({
  panel: window.__G?.ui?.panel,
  cards: document.querySelectorAll('[class*="boss"]').length,
  text: document.body.innerText.slice(0, 240).replace(/\n+/g, ' | '),
}))
console.log('PANEL', clickedMenu, JSON.stringify(panel))

// 点第一张卡（数据执政官）
const clickedCard = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, [role="button"], .card, li, article')]
  const c = els.find((x) => x.textContent.includes('数据执政官'))
  if (!c) return false
  c.click()
  return true
})
await wait(3500)
await page.screenshot({ path: path.join(OUT, '03-room.png') })

const state = await page.evaluate(() => {
  const g = window.__rustfall
  const room = g?.room
  const boss = g?.director?.largeList?.[0] || null
  return {
    phase: window.__G?.phase,
    regionId: g?.regionId,
    roomId: g?.roomId,
    roomName: window.__G?.roomName,
    regionName: window.__G?.regionName,
    testRoom: !!room?.data?.testRoom,
    worldW: room?.data?.worldW,
    worldH: room?.data?.worldH,
    floorRange: room?.data?.floorY
      ? [Math.min(...room.data.floorY), Math.max(...room.data.floorY)]
      : null,
    spawn: room?.data?.spawn,
    player: g?.player ? { x: Math.round(g.player.body.x), y: Math.round(g.player.body.y) } : null,
    monsters: room?.data?.monsters?.length,
    large: room?.data?.largeEnemies,
    boss: boss
      ? {
          id: boss.def?.id || boss.id,
          anim: boss.animName,
          frameCount: boss.frames ? Object.fromEntries(Object.entries(boss.frames).map(([k, v]) => [k, v?.length])) : null,
          hasTex: !!boss.mat?.map,
          hp: boss.hp,
        }
      : null,
    vfx: g?.scene?.children?.filter?.((c) => c.renderOrder === 20).length ?? null,
    calls: g?.renderer?.info?.render?.calls,
    fps: window.__G?.fps,
  }
})
console.log('STATE', JSON.stringify(state, null, 1))

// 等 BOSS 出手：靠近并停留几秒
await page.evaluate(() => {
  const g = window.__rustfall
  const b = g.director?.largeList?.[0]
  if (b && g.player) g.player.body.x = b.body.x - 150
})
for (let i = 0; i < 6; i++) {
  await wait(1200)
  const s = await page.evaluate(() => {
    const g = window.__rustfall
    const b = g.director?.largeList?.[0]
    return {
      anim: b?.animName,
      state: b?.state,
      lastMove: b?.lastMove || null,
      vfx: g?.scene?.children?.filter?.((c) => c.renderOrder === 20).length ?? null,
      hp: window.__G?.hp,
      dead: b?.dead,
    }
  })
  console.log('T+' + i, JSON.stringify(s))
  if (i === 2) await page.screenshot({ path: path.join(OUT, '04-fight.png') })
}
await page.screenshot({ path: path.join(OUT, '05-fight2.png') })

console.log('ERRORS', JSON.stringify(errors.slice(0, 20), null, 1))
await browser.close()

