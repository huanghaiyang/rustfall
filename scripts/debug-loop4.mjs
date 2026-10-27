import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(4200)
await p.evaluate(() => { window.__errs = []; const old = console.error; console.error = (...a) => { window.__errs.push(a.map(x => (x && x.stack) || String(x)).join(' | ')); old(...a) } })
await p.click(".title-menu .btn.primary"); await wait(1600)
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => /以此机体开始/.test(x.textContent))?.click())
await wait(2500)
const chk = async (label) => { await wait(900); const e = await p.evaluate(() => { const n = window.__errs.length; window.__errs.length=0; return n }); console.log(label, "errors:", e) }
await p.evaluate(() => { const g=window.__rustfall; g.inventory.add("laser_pistol",1); g.inventory.add("ammo_laser",30); g.equipItem("laser_pistol") }); await chk("equip")
await p.evaluate(() => { const g=window.__rustfall; g.robot.facing=1 }); 
for (let i=0;i<3;i++){ await p.keyboard.down("KeyJ"); await wait(180); await p.keyboard.up("KeyJ"); await wait(160) }
await chk("fire")
await p.evaluate(() => { const g=window.__rustfall; window.__G.chassisId="ghost"; g.robot.switchChassis("ghost") }); await chk("switch ghost")
const err = await p.evaluate(() => window.__errs.slice(0,2)); console.log(JSON.stringify(err,null,1).slice(0,2000))
await p.close(); await b.disconnect()
