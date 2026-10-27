import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4600)
await p.click(".title-menu .btn.primary"); await wait(1700)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(2800)
console.log(JSON.stringify(await p.evaluate(()=>{ const g=window.__rustfall; g.loadRoom("metro","metro_platform","left")
  const d=g.room.data
  const before=g.room.lootDrops.length
  const flagKeys=Object.keys(window.__G.flags).filter(k=>k.startsWith("weapon:"))
  g.spawnRoomWeapons(d)
  return { weapons:d.weapons, dropsBefore:before, dropsAfter:g.room.lootDrops.length, weaponDrops:g.room.lootDrops.map(x=>x.itemId).filter(id=>/laser|pistol|pipe|dagger|hammer|nail|arc|rail|baton|scrap|wrench/.test(id)), flags:flagKeys.length, hasItem:!!window.__rustfall.inventory, itemDef: (()=>{try{return window.__rustfall.constructor.name}catch(e){return "?"}})() }
}),null,1).slice(0,1200))
await p.close(); await b.disconnect()
