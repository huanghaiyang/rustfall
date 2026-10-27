import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(4500)
console.log(JSON.stringify(await p.evaluate(() => ({
  dk: Object.keys(window.__G.dayNight).length,
  dkeys: Object.keys(window.__G.dayNight).slice(0, 8),
  dtime: window.__G.dayNight.time,
  phase: window.__G.dayNight.phase,
  sk: Object.keys(window.__G.settings),
  postfx: window.__G.settings.postfx,
  ek: Object.keys(window.__G.ecosystem),
  wpnKeys: Object.keys(window.__G.weapon),
  json: JSON.stringify(window.__G.dayNight).slice(0, 120),
})), null, 1))
await p.close(); await b.disconnect()
