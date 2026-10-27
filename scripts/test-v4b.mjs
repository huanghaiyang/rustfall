import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4600)
await p.click(".title-menu .btn.primary"); await wait(1700)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3000)
// 有武器的房间
const w=await p.evaluate(()=>{ const g=window.__rustfall; g.loadRoom("city","city_underpass","left"); g.robot.invuln=999; return { dataW:(g.room.data.weapons||[]).map(x=>x.id), drops:g.room.lootDrops.map(d=>d.itemId).filter(id=>/laser|pistol|pipe|dagger|hammer|nail|arc|rail|baton|scrap_launch|wrench/.test(id)) } })
console.log("SPAWNED", JSON.stringify(w))
// 拿一把并开火
const fire=await p.evaluate(async()=>{ const g=window.__rustfall; g.inventory.add("laser_rifle",1); g.inventory.add("ammo_laser",40); g.equipItem("laser_rifle"); g.robot.facing=1; await new Promise(r=>setTimeout(r,300)); const s0={ammo:window.__G.weapon.ammo,reserve:window.__G.weapon.reserve,mesh:!!g.robot.weaponMesh}; for(let i=0;i<4;i++) g.weapons.fire(); await new Promise(r=>setTimeout(r,450)); return {s0, s1:{ammo:window.__G.weapon.ammo,shots:g.weapons.shotCount,anim:g.robot.animName,mesh:!!g.robot.weaponMesh}} })
console.log("FIRE", JSON.stringify(fire))
await p.screenshot({path:"screenshots-v3/v4-weapon.png"})
// 大怪特写
const li=await p.evaluate(()=>{ const g=window.__rustfall
  for (const [r,rm] of [["factory","factory_intake"],["dump","dump_gateway"],["port","port_dock"]]) {
    g.loadRoom(r,rm,"left"); g.robot.invuln=999
    const m=(g.director?.list||[]).find(m=>/junk_golem|sky_warden|mimic_beast|swarm_core/.test(m.id))
    if (m) { g.robot.body.x=m.px-120; g.robot.body.y=m.py-60; g.robot.facing=1; return {room:rm,id:m.id,x:Math.round(m.px),y:Math.round(m.py)} }
  }
  return {none:true} })
console.log("LARGE", JSON.stringify(li)); await wait(2000); await p.screenshot({path:"screenshots-v3/v4-large2.png"})
// 生态特写
await p.evaluate(()=>{ const g=window.__rustfall; g.loadRoom("metro","metro_platform","left"); g.robot.invuln=999 })
await wait(1600); await p.screenshot({path:"screenshots-v3/v4-metro.png"})
console.log("FPS", await p.evaluate(()=>window.__G.fps))
await p.close(); await b.disconnect()
