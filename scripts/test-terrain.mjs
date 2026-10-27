import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,200))); p.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)) })
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(4200)
await p.click(".title-menu .btn.primary"); await wait(1500)
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => /以此机体开始/.test(x.textContent))?.click())
await wait(2800)
const rooms = [["city","city_street"],["village","village_field"],["factory","factory_hall"],["dump","dump_pit"]]
for (const [r, rm] of rooms) {
  const info = await p.evaluate(({r, rm}) => { const g = window.__rustfall; g.loadRoom(r, rm, "left"); g.robot.invuln = 999; return { room: g.room.data.roomId, tiles: g.room.tileCounts, terrain: g.room.data.terrainFeatures, loot: g.room.lootDrops.length, buried: g.room.lootDrops.filter(l=>l.buried).length } }, {r, rm})
  console.log("ROOM", JSON.stringify(info))
}
// 挖土
const digInfo = await p.evaluate(() => {
  const g = window.__rustfall
  g.loadRoom("city", "city_street", "left"); g.robot.invuln = 999
  const d = g.room.data
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.map.get(x,y) === 6) {
    g.robot.body.x = x*32 - 8; g.robot.body.y = y*32 - 44; g.robot.facing = 1
    return { found: true, x, y, before: g.room.tileCounts }
  }
  return { found: false, before: g.room.tileCounts }
})
console.log("DIG SETUP", JSON.stringify(digInfo))
await wait(600)
await p.evaluate(() => window.__rustfall.switchTool("shovel"))
for (let i=0;i<6;i++){ await p.keyboard.down("KeyJ"); await wait(260); await p.keyboard.up("KeyJ"); await wait(220) }
await wait(700)
console.log("DIG AFTER", JSON.stringify(await p.evaluate(() => ({ tiles: window.__rustfall.room.tileCounts, dirty: window.__rustfall.room.data.map.dirty.size, loot: window.__rustfall.room.lootDrops.length }))))
await p.screenshot({ path: "screenshots-v2/v2-dig.png" })
// 裂墙 + 毒液
console.log("CRACK/TOXIC", JSON.stringify(await p.evaluate(() => { const g = window.__rustfall; g.loadRoom("factory","factory_hall","left"); const t = g.room.tileCounts; return { t, toxic: t.toxic, cracked: t.cracked } })))
await wait(1000)
const toxicHp = await p.evaluate(() => {
  const g = window.__rustfall
  for (let y = 0; y < g.room.data.h; y++) for (let x = 0; x < g.room.data.w; x++) if (g.room.data.map.get(x,y) === 7) {
    g.robot.body.x = x*32; g.robot.body.y = y*32; g.robot.invuln = 0
    return { placed: true, hp: window.__G.hp }
  }
  return { placed: false }
})
await wait(1800)
console.log("TOXIC DMG", JSON.stringify(toxicHp), JSON.stringify(await p.evaluate(() => ({ hp: Math.round(window.__G.hp), inToxic: window.__rustfall.robot.inToxic }))))
await p.screenshot({ path: "screenshots-v2/v2-toxic.png" })
console.log("ERR", JSON.stringify(errs.slice(0,6)))
await p.close(); await b.disconnect()
