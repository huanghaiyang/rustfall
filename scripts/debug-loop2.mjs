import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(4200)
await p.click(".title-menu .btn.primary"); await wait(1600)
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => /以此机体开始/.test(x.textContent))?.click())
await wait(2600)
const out = await p.evaluate(async () => {
  const g = window.__rustfall
  const logs = []
  for (const k of ["weapons", "ecosystem", "director", "room", "particles", "weather", "robot"]) {
    const o = g[k]
    if (o && typeof o.update === "function") {
      const f = o.update.bind(o)
      o.update = (...a) => { try { return f(...a) } catch (e) { logs.push(k + ": " + (e.stack || e.message).slice(0, 400)); throw e } }
    }
  }
  await new Promise(r => setTimeout(r, 1500))
  return logs.slice(0, 3)
})
console.log(JSON.stringify(out, null, 1).slice(0, 2500))
await p.close(); await b.disconnect()
