import fs from "node:fs"
const f="src/game/entities/robot.js"; let s=fs.readFileSync(f,"utf8")
if(!s.includes("art/weapons.js")){
  s=s.replace("import { spriteMaterial } from '../render/materials.js'","import { spriteMaterial } from '../render/materials.js'\nimport { getWeaponArt, getWeaponHoldArt } from '../render/art/weapons.js'")
  fs.writeFileSync(f,s); console.log("robot weapon import added")
} else console.log("already")
