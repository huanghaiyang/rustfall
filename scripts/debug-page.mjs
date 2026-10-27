import puppeteer from 'puppeteer-core'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: { width: 1440, height: 810 } })
const page = await browser.newPage()
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + (e.stack || e.message)))
await page.evaluateOnNewDocument(() => {
  window.__bootErrors = []
  window.addEventListener('error', (e) => {
    window.__bootErrors.push('ERROR: ' + (e.error?.stack || e.message))
  })
  window.addEventListener('unhandledrejection', (e) => {
    window.__bootErrors.push('REJECTION: ' + (e.reason?.stack || String(e.reason)))
  })
})
await page.goto((process.env.GAME_URL || 'http://127.0.0.1:5180'), { waitUntil: 'networkidle2', timeout: 30000 })
await wait(3000)
const info = await page.evaluate(() => ({
  hasGame: !!window.__rainCycle,
  hasG: !!window.__G,
  bootErrors: window.__bootErrors,
  canvases: document.querySelectorAll('canvas').length,
  appHTML: document.querySelector('#app')?.innerHTML?.slice(0, 800),
}))
console.log(JSON.stringify(info, null, 2))
console.log('--- LOGS ---\n' + logs.slice(0, 60).join('\n'))
await browser.disconnect()
