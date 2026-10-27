import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,160))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,160))})
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4600)
await p.evaluate(()=>localStorage.removeItem("rustfall.settings.v1")); await p.reload({waitUntil:"networkidle2"}); await wait(4600)
await p.evaluate(()=>document.querySelector(".title-menu .btn.primary")?.click()); await wait(1600)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3200)
await wait(1500)
const perf=await p.evaluate(async()=>{ const times=[]; let last=performance.now(); const t0=last
  await new Promise(res=>{ const tick=()=>{ const n=performance.now(); times.push(n-last); last=n; if(n-t0<2500) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
  times.sort((a,b)=>a-b); const q=(x)=>times[Math.min(times.length-1,Math.floor(times.length*x))]
  return {frames:times.length, avg:+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2), p95:+q(0.95).toFixed(2), max:+times.at(-1).toFixed(1), gameFps:window.__G.fps} })
console.log("PERF", JSON.stringify(perf))
const defaults=await p.evaluate(()=>({...window.__G.settings}))
console.log("DEFAULT", JSON.stringify(defaults))
// 移动中
await p.keyboard.down("KeyD"); await wait(800)
const perf2=await p.evaluate(async()=>{ const times=[]; let last=performance.now(); const t0=last
  await new Promise(res=>{ const tick=()=>{ const n=performance.now(); times.push(n-last); last=n; if(n-t0<2000) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
  times.sort((a,b)=>a-b); const q=(x)=>times[Math.min(times.length-1,Math.floor(times.length*x))]
  return {frames:times.length, avg:+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2), p95:+q(0.95).toFixed(2), gameFps:window.__G.fps} })
await p.keyboard.up("KeyD")
console.log("PERF MOVE", JSON.stringify(perf2))
// 暂停→设置→Esc回到暂停
await p.keyboard.press("Escape"); await wait(500); await p.keyboard.press("F2"); await wait(600)
const st1=await p.evaluate(()=>({panel:window.__G.ui.panel, pause:!!document.querySelector(".overlay.z-pause"), pz:getComputedStyle(document.querySelector(".overlay.z-panel")).zIndex}))
await p.keyboard.press("Escape"); await wait(500)
const st2=await p.evaluate(()=>({phase:window.__G.phase, panel:window.__G.ui.panel, pause:!!document.querySelector(".overlay.z-pause")}))
console.log("STACK", JSON.stringify({st1,st2}))
console.log("ERR", JSON.stringify(errs.slice(0,5)))
await p.close(); await b.disconnect()
