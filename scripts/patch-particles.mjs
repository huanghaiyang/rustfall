import fs from "node:fs"
const f="src/game/systems/particles.js"; let s=fs.readFileSync(f,"utf8")
if(!s.includes("explosion: {")){
  s=s.replace(`  rain: { tex: 'glow', color: 0xa8cfe0, additive: true, opacity: 0.3, size: 9, gravity: 900, drag: 0.2 },`, `  rain: { tex: 'glow', color: 0xa8cfe0, additive: true, opacity: 0.3, size: 9, gravity: 900, drag: 0.2 },
  explosion: { tex: 'glow', color: 0xffb347, additive: true, opacity: 0.95, size: 28, gravity: 120, drag: 1.1 },
  acid: { tex: 'glow', color: 0x9ac84a, additive: true, opacity: 0.8, size: 12, gravity: 620, drag: 0.9 },
  smoke: { tex: 'dust', color: 0x6a6f66, additive: false, opacity: 0.42, size: 26, gravity: -24, drag: 1.2 },
  scrap: { tex: 'dust', color: 0xb0a48a, additive: false, opacity: 0.9, size: 9, gravity: 720, drag: 0.6 },
  muzzle: { tex: 'glow', color: 0xffe2a0, additive: true, opacity: 0.95, size: 18, gravity: 0, drag: 2.4 },
  ember: { tex: 'glow', color: 0xff8a3c, additive: true, opacity: 0.85, size: 7, gravity: -40, drag: 0.5 },
  toxic: { tex: 'glow', color: 0xc6e05a, additive: true, opacity: 0.55, size: 16, gravity: -30, drag: 0.8 },
  flash: { tex: 'glow', color: 0xffffff, additive: true, opacity: 1, size: 30, gravity: 0, drag: 3 },`)
  fs.writeFileSync(f,s); console.log("kinds added")
}
let s2=fs.readFileSync(f,"utf8")
if(!s2.includes("(KINDS[p.kind] || KINDS.dust).size")){
  s2=s2.replace("const base = KINDS[p.kind].size","const base = (KINDS[p.kind] || KINDS.dust).size")
  fs.writeFileSync(f,s2); console.log("update guarded")
}
