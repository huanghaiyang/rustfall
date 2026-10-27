import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,180))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,180))})
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4800)
await p.click(".title-menu .btn.primary"); await wait(1700)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3000)
for (const [r,rm] of [["metro","metro_platform"],["hospital","hospital_lobby"],["port","port_dock"]]) {
  const info=await p.evaluate(({r,rm})=>{ const g=window.__rustfall; g.loadRoom(r,rm,"left"); g.robot.invuln=999; g.dayNight.time=0.42; g.dayNight.apply(true); const d=g.room.data
    return {room:d.roomId, biome:d.biome, monsters:g.director?.list?.length, large:(g.director?.largeList||[]).length, props:g.room.propMeshes.length, eco:window.__G.ecosystem.active, weapons:(d.weapons||[]).length} }, {r,rm})
  await wait(1700)
  await p.screenshot({path:`screenshots-v3/final-${r}.png`})
  console.log("REGION", JSON.stringify(info))
}
console.log("FPS", await p.evaluate(()=>window.__G.fps), "ERR", JSON.stringify(errs.slice(0,4)))
await p.close(); await b.disconnect()
