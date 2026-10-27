import puppeteer from "puppeteer-core"
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9333",defaultViewport:{width:1600,height:900}})
const p=await b.newPage(); await p.bringToFront()
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,200))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200))})
await p.goto("http://127.0.0.1:4180",{waitUntil:"networkidle2"}); await wait(4700)
await p.click(".title-menu .btn.primary"); await wait(1700)
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>/以此机体开始/.test(x.textContent))?.click()); await wait(3000)
// 武器：从房间掉落直接拾取
const res=await p.evaluate(async()=>{ const g=window.__rustfall; g.loadRoom("metro","metro_platform","left"); g.robot.invuln=999
  const drop=g.room.lootDrops.find(d=>/laser_rifle|nailgun|laser_pistol/.test(d.itemId))
  if(!drop) return {none:true, ids:g.room.lootDrops.map(d=>d.itemId)}
  drop.tryPickup()
  await new Promise(r=>setTimeout(r,300))
  const inv=window.__G.inventory.slots.filter(Boolean).map(s=>s.id)
  const wid=inv.find(id=>/laser_rifle|nailgun|laser_pistol/.test(id))
  if(wid){ g.equipItem(wid); g.weapons.reload(); await new Promise(r=>setTimeout(r,1800)) }
  return {drop:drop.itemId, inv, wid, weapon:{ammo:window.__G.weapon.ammo,max:window.__G.weapon.ammoMax,reserve:window.__G.weapon.reserve,mesh:!!g.robot.weaponMesh,name:window.__G.weapon.name} }
})
console.log("PICK", JSON.stringify(res))
await p.screenshot({path:"screenshots-v3/v6-weapon-hold.png"})
const fire=await p.evaluate(async()=>{ const g=window.__rustfall; g.robot.facing=1; g.weapons.fire(); await new Promise(r=>setTimeout(r,120)); return {ammo:window.__G.weapon.ammo,shots:g.weapons.shotCount,anim:g.robot.animName} })
console.log("FIRE", JSON.stringify(fire)); await p.screenshot({path:"screenshots-v3/v6-fire.png"})
// 大型敌人 spawnLarge
const large=await p.evaluate(async()=>{ const g=window.__rustfall; g.loadRoom("factory","factory_intake","left"); g.robot.invuln=999
  const out=[]
  for(const id of ["junk_golem","sky_warden","mimic_beast","swarm_core"]){
    try{ const m=g.director.spawnLarge(id, g.robot.centerX+240, g.robot.body.y+g.robot.body.h-40); out.push({id, ok:!!m, size:m?[m.w,m.h]:null}) }catch(e){ out.push({id, err:String(e).slice(0,60)}) }
  }
  return out })
console.log("LARGE", JSON.stringify(large)); await wait(2200); await p.screenshot({path:"screenshots-v3/v6-large.png"})
// 特写
const clip=await p.evaluate(()=>{ const g=window.__rustfall; const v=g.viewSize()
  const sx=((g.robot.centerX-(g.camWorld.x-v.w/2))/v.w)*1600
  const sy=((g.camWorld.y-g.robot.centerY+v.h/2)/v.h)*900
  return {x:Math.max(0,Math.round(sx-160)),y:Math.max(0,Math.round(sy-160))} })
await p.screenshot({path:"screenshots-v3/v6-closeup.png",clip:{x:clip.x,y:clip.y,width:320,height:320}})
console.log("FPS", await p.evaluate(()=>window.__G.fps), "ERR", JSON.stringify(errs.slice(0,6)))
await p.close(); await b.disconnect()
