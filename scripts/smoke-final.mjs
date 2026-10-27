import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,160))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,160))})
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4700)
await p.click(".title-menu .btn.primary"); await wait(1700)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3000)
const out=await p.evaluate(()=>{ const g=window.__rustfall
  const rooms={}
  for (const [r,rm] of [["hospital","hospital_lobby"],["port","port_dock"],["metro","metro_platform"]]) { g.loadRoom(r,rm,"left"); g.robot.invuln=999; rooms[rm]={monsters:g.director?.list?.length, large:(g.director?.largeList||[]).length, eco:window.__G.ecosystem.active, weapons:(g.room.data.weapons||[]).length} }
  return rooms })
console.log("ROOMS", JSON.stringify(out)); console.log("FPS", await p.evaluate(()=>window.__G.fps)); console.log("ERR", JSON.stringify(errs.slice(0,5)))
await p.close(); await b.disconnect()
