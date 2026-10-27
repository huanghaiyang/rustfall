import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4700)
await p.click(".title-menu .btn.primary"); await wait(1600)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3200)
// 稳定后测 3 秒真实帧率 + 帧时间分位
const perf=await p.evaluate(async()=>{ const times=[]; let last=performance.now(); const t0=last
  await new Promise(res=>{ const tick=()=>{ const n=performance.now(); times.push(n-last); last=n; if(n-t0<3000) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
  times.sort((a,b)=>a-b)
  const q=(p)=>times[Math.min(times.length-1,Math.floor(times.length*p))]
  return { frames: times.length, ms_avg: +(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2), p50:+q(0.5).toFixed(2), p95:+q(0.95).toFixed(2), max:+times[times.length-1].toFixed(2), gameFps: window.__G.fps } })
console.log("PERF", JSON.stringify(perf))
// 走动 + 战斗时
await p.keyboard.down("KeyD"); await wait(1500); await p.keyboard.up("KeyD")
const perf2=await p.evaluate(async()=>{ const times=[]; let last=performance.now(); const t0=last
  await new Promise(res=>{ const tick=()=>{ const n=performance.now(); times.push(n-last); last=n; if(n-t0<2000) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
  times.sort((a,b)=>a-b); const q=(p)=>times[Math.min(times.length-1,Math.floor(times.length*p))]
  return { frames: times.length, avg:+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2), p95:+q(0.95).toFixed(2), gameFps: window.__G.fps } })
console.log("PERF MOVE", JSON.stringify(perf2))
await p.close(); await b.disconnect()
