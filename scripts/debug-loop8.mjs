import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(4300)
await p.click(".title-menu .btn.primary"); await wait(1600)
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => /以此机体开始/.test(x.textContent))?.click()); await wait(2600)
await p.evaluate(() => { const g=window.__rustfall; g.inventory.add("laser_pistol",1); g.inventory.add("ammo_laser",60); g.equipItem("laser_pistol") })
await p.evaluate(() => {
  const g = window.__rustfall
  window.__hits = []
  for (const k of ["weapons","ecosystem","director","room","particles","weather"]) {
    const o = g[k]
    if (o && typeof o.update === "function") {
      const f = o.update.bind(o)
      o.update = (...a) => { try { return f(...a) } catch (e) { if (window.__hits.length < 3) window.__hits.push(k + ": " + (e.stack||e.message).slice(0,300)); throw e } }
    }
  }
})
await p.keyboard.down("KeyJ"); await wait(800); await p.keyboard.up("KeyJ"); await wait(500)
const hits = await p.evaluate(() => window.__hits)
console.log("HITS:" + JSON.stringify(hits).slice(0, 1800))
await p.close(); await b.disconnect()
