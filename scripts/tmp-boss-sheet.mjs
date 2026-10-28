// 临时：把 51 张 BOSS 立绘拼成一张 9×6 总览图，便于一次核对全部造型
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const DIR = path.resolve('public/sprites/boss')
const OUT = path.resolve('scripts/.tmp/boss-sheet.png')
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'))
const ids = Object.keys(manifest).sort()

const cells = ids
  .map((id) => {
    const b64 = fs.readFileSync(path.join(DIR, `${id}.png`)).toString('base64')
    return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${id}</figcaption></figure>`
  })
  .join('')

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#141018;font-family:Consolas,monospace}
.grid{display:grid;grid-template-columns:repeat(9,1fr);gap:4px;padding:6px}
figure{margin:0;background:#221c28;display:flex;flex-direction:column;align-items:center;padding:2px}
img{width:100%;height:150px;object-fit:contain;image-rendering:pixelated}
figcaption{color:#c8c0d8;font-size:11px;padding:2px 0}
</style><div class="grid">${cells}</div>`

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1800, height: 1200 },
})
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.screenshot({ path: OUT, fullPage: true })
await browser.close()
console.log('OK', OUT, ids.length)
