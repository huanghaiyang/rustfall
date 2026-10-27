import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,200))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200))})
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4600)
await p.click(".title-menu .btn.primary"); await wait(1700)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3000)
await p.evaluate(()=>{ const g=window.__rustfall; g.loadRoom("city","city_street","left"); g.robot.invuln=999; window.__G.timeLeft=280 })
await wait(1200)
const phases=[["dawn",0.02],["noon",0.36],["dusk",0.74],["night",0.9]]
for (const [name,t] of phases) {
  await p.evaluate((t)=>{ const g=window.__rustfall; g.dayNight.time=t; g.dayNight.setWeather("clear",80); g.dayNight.apply(true) }, t)
  await wait(1400)
  await p.screenshot({path:`screenshots-v3/day-${name}.png`})
  console.log("PHASE",name, await p.evaluate(()=>window.__G.dayNight.phase+" | "+window.__G.dayNight.weatherLabel))
}
const wx=["duststorm","acidrain","toxicfog"]
for (const w of wx) {
  await p.evaluate((w)=>{ const g=window.__rustfall; g.dayNight.setWeather(w,80); g.dayNight.time=0.42 }, w)
  await wait(1500)
  await p.screenshot({path:`screenshots-v3/wx-${w}.png`})
  console.log("WEATHER",w, await p.evaluate(()=>window.__G.dayNight.weatherLabel+" fog="+window.__G.dayNight.time))
}
// 有武器的房间 + 大怪
const info=await p.evaluate(()=>{ const g=window.__rustfall
  const out={}
  for (const [r,rm] of [["city","city_underpass"],["metro","metro_platform"],["dump","dump_gateway"]]) {
    g.loadRoom(r,rm,"left"); g.robot.invuln=999
    out[rm]={ weapons:(g.room.data.weapons||[]).map(x=>x.id), large:(g.director?.list||[]).filter(m=>/junk_golem|sky_warden|mimic_beast|swarm_core/.test(m.id)).map(m=>m.id), drops:g.room.lootDrops.length }
  }
  return out })
console.log("ROOMS", JSON.stringify(info))
// 移到武器掉落旁截一张
await p.evaluate(()=>{ const g=window.__rustfall
  const d=g.room.lootDrops.find(d=>/laser|pistol|hammer|pipe|dagger|nail|arc|rail|baton|scrap|wrench/.test(d.itemId))
  if(d){ g.robot.body.x=d.x-40; g.robot.body.y=d.y-40 } })
await wait(1200); await p.screenshot({path:"screenshots-v3/v4-weapon-drop.png"})
console.log("FPS", await p.evaluate(()=>window.__G.fps), "ERR", JSON.stringify(errs.slice(0,5)))
await p.close(); await b.disconnect()
