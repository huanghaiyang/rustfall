import fs from "node:fs"
const f = "src/game/entities/robot.js"
let s = fs.readFileSync(f, "utf8")
s = s.replace(/const mat = new THREE\.MeshBasicMaterial\(\{[\s\S]{0,220}?map: tex,[\s\S]{0,220}?\}\)/, "const mat = spriteMaterial(tex, { color: 0xffffff })")
fs.writeFileSync(f, s)
console.log("robot mat:", /spriteMaterial\(tex/.test(s))
