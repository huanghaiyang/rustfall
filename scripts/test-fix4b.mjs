import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,180))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,180))})
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4700)
// 关掉任何面板确保标题可见
await p.evaluate(()=>{ window.__rustfall && window.__rustfall.resume && window.__rustfall.resume(); if(window.__G) window.__G.ui.panel=null })
await wait(400)
const hasTitle = await p.evaluate(()=>!!document.querySelector(".title-menu .btn.primary"))
console.log("TITLE", hasTitle)
if(!hasTitle){ console.log("ERR state", await p.evaluate(()=>({phase:window.__G.phase,panel:window.__G.ui.panel,ready:!!window.__rustfall}))); }
await p.evaluate(()=>document.querySelector(".title-menu .btn.primary")?.click())
await wait(1700)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3000)
// 光块检查
const glow=await p.evaluate(()=>{ const g=window.__rustfall; g.dayNight.time=0.9; g.dayNight.apply(true)
  return {setting:window.__G.settings.glow, visible:g.robot.glow?g.robot.glow.visible:null, hasMap:!!(g.robot.glow&&g.robot.glow.material.map), opacity:g.robot.glow?g.robot.glow.material.opacity:null} })
console.log("GLOW", JSON.stringify(glow))
const clip=await p.evaluate(()=>{ const g=window.__rustfall; const v=g.viewSize()
  const sx=((g.robot.centerX-(g.camWorld.x-v.w/2))/v.w)*1600
  const sy=((g.camWorld.y-g.robot.centerY+v.h/2)/v.h)*900
  return {x:Math.max(0,Math.round(sx-130)),y:Math.max(0,Math.round(sy-130))} })
await wait(800); await p.screenshot({path:"screenshots-v3/fix-glow-off-closeup.png",clip:{x:clip.x,y:clip.y,width:260,height:260}})
// 噪点联动
const noise=await p.evaluate(async()=>{ const g=window.__rustfall
  const before={grain:window.__G.settings.grain, postfx:window.__G.settings.postfx}
  g.setSetting("postfx",true); await new Promise(r=>setTimeout(r,500))
  const u=(k)=>g.postfx?.material?.uniforms?.[k]?.value
  const grainOff=u("uGrain"); g.setSetting("grain",true); await new Promise(r=>setTimeout(r,400)); const grainOn=u("uGrain")
  g.setSetting("grain",false); await new Promise(r=>setTimeout(r,300)); const grainBack=u("uGrain")
  g.setSetting("postfx",false)
  return {before, grainOff, grainOn, grainBack} })
console.log("NOISE", JSON.stringify(noise))
console.log("FPS", await p.evaluate(()=>window.__G.fps), "ERR", JSON.stringify(errs.slice(0,6)))
await p.close(); await b.disconnect()
