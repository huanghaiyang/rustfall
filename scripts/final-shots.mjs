import puppeteer from "puppeteer-core"
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: { width: 1600, height: 900 } })
const p = await b.newPage(); await p.bringToFront()
const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,200)))
await p.goto("http://127.0.0.1:4180", { waitUntil: "networkidle2" }); await wait(5000)
await p.screenshot({ path: "screenshots-v2/final-01-title.png" })
await p.click(".title-menu .btn.primary"); await wait(1800)
await p.screenshot({ path: "screenshots-v2/final-02-chassis.png" })
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => /以此机体开始/.test(x.textContent))?.click()); await wait(3000)
await p.screenshot({ path: "screenshots-v2/final-03-shelter.png" })
// 对话
await p.evaluate(() => { const g = window.__rustfall; const n = g.room.npcHolograms[0]; if (n) { g.robot.body.x = n.x - 40; g.robot.body.y = n.y - 40; g.robot.facing = 1 } })
await wait(900); await p.keyboard.press("KeyE"); await wait(1200)
await p.screenshot({ path: "screenshots-v2/final-04-dialogue.png" })
await p.keyboard.press("Escape"); await wait(500)
// 背包
await p.keyboard.press("KeyI"); await wait(900)
await p.screenshot({ path: "screenshots-v2/final-05-inventory.png" })
await p.keyboard.press("Escape"); await wait(400)
// 各区域
for (const [r, rm, n] of [["city","city_street","final-06-city"],["village","village_field","final-07-village"],["factory","factory_hall","final-08-factory"],["dump","dump_pit","final-09-dump"]]) {
  await p.evaluate(({r,rm}) => { const g = window.__rustfall; g.loadRoom(r, rm, "left"); g.robot.invuln = 999 }, {r,rm})
  await wait(1800)
  await p.screenshot({ path: `screenshots-v2/${n}.png` })
}
// 酸雨
await p.evaluate(() => { const g = window.__rustfall; g.loadRoom("city","city_plaza","left"); g.robot.invuln = 999; window.__G.timeLeft = 0.3 })
await wait(5500)
await p.screenshot({ path: "screenshots-v2/final-10-acid-rain.png" })
// 待机
await p.evaluate(() => { const g = window.__rustfall; g.loadRoom("city","city_shelter","shelter"); window.__G.power = 4 })
await wait(1000); await p.keyboard.down("KeyS"); await wait(1800); await p.keyboard.up("KeyS")
await p.screenshot({ path: "screenshots-v2/final-11-hibernate.png" })
console.log("PHASE", await p.evaluate(() => window.__G.phase))
console.log("FPS", await p.evaluate(() => window.__G.fps))
console.log("ERR", JSON.stringify(errs.slice(0,5)))
await p.close(); await b.disconnect()
