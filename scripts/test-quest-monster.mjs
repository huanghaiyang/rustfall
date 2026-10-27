import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,200))); p.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)) })
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(4200)
await p.click(".title-menu .btn.primary"); await wait(1500)
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => /以此机体开始/.test(x.textContent))?.click()); await wait(2800)
console.log("QUEST BEFORE", JSON.stringify(await p.evaluate(() => window.__G.quests.active.map(q => ({ id: q.id, progress: q.progress })))))
await p.evaluate(() => { const g = window.__rustfall; g.inventory.add("lubricant", 5); g.inventory.add("diary_1", 1) })
await wait(900)
console.log("QUEST AFTER", JSON.stringify(await p.evaluate(() => window.__G.quests.active.map(q => ({ id: q.id, progress: q.progress, pct: 0 }))))
)
console.log("EQUIP", JSON.stringify(await p.evaluate(() => {
  const g = window.__rustfall
  g.inventory.add("armor_plate_mil", 1)
  const before = { hp: window.__G.hpMax, armor: g.robot.stats.armor, speed: g.robot.stats.speed }
  g.equipItem("armor_plate_mil")
  return { before, after: { hp: window.__G.hpMax, armor: g.robot.stats.armor, speed: g.robot.stats.speed }, equipped: Object.entries(window.__G.equipped).filter(([k,v]) => v) }
})))
// 怪物特写
await p.evaluate(() => { const g = window.__rustfall; g.loadRoom("city","city_street","left"); g.robot.invuln = 999 })
await wait(1200)
const m = await p.evaluate(() => {
  const g = window.__rustfall
  const mon = g.director.list.find(x => x.alive)
  if (!mon) return null
  g.robot.body.x = mon.px - 90; g.robot.body.y = mon.py - 60; g.robot.facing = 1
  return { id: mon.id, hp: mon.hp, x: Math.round(mon.px), y: Math.round(mon.py) }
})
await wait(1400)
await p.screenshot({ path: "screenshots-v2/v2-monster.png" })
console.log("MONSTER", JSON.stringify(m), JSON.stringify(await p.evaluate(() => ({ alive: window.__rustfall.director.list.filter(x=>x.alive).length, visible: window.__rustfall.director.list.filter(x=>x.group?.visible).length }))))
// 酸雨
await p.evaluate(() => { const g = window.__rustfall; g.loadRoom("city","city_plaza","left"); window.__G.timeLeft = 0.3 })
await wait(5500)
await p.screenshot({ path: "screenshots-v2/v2-rain.png" })
console.log("RAIN", JSON.stringify(await p.evaluate(() => ({ phase: window.__G.weatherPhase, i: window.__G.weatherIntensity, exposed: Math.round(window.__G.exposed*10)/10 }))))
console.log("ERR", JSON.stringify(errs.slice(0,6)))
await p.close(); await b.disconnect()
