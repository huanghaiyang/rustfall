import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(4200)
await p.click(".title-menu .btn.primary"); await wait(1800)
console.log(JSON.stringify(await p.evaluate(() => {
  const cards = [...document.querySelectorAll(".card")]
  const grid = document.querySelector(".cards")
  const gs = grid ? getComputedStyle(grid) : null
  const rows = cards.map(c => { const r = c.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), scrollH: c.scrollHeight, ov: getComputedStyle(c).overflow, pos: getComputedStyle(c).position } })
  const overlaps = []
  for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i-1].bottom) overlaps.push([i-1, i, rows[i-1].bottom - rows[i].top])
  return { grid: gs ? { cols: gs.gridTemplateColumns, rows: gs.gridTemplateRows, gap: gs.gap, alignContent: gs.alignContent } : null, count: cards.length, rows: rows.slice(0, 8), overlaps }
}), null, 1).slice(0, 2500))
await p.screenshot({ path: "screenshots-v2/bug-cards.png" })
await p.close(); await b.disconnect()
