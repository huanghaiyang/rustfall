import fs from "node:fs"
const f="src/game/entities/monsters/large/index.js"; let s=fs.readFileSync(f,"utf8")
s=s.replaceAll("'../../core/registry.js'","'../../../core/registry.js'")
s=s.replaceAll("'../../render/art/monsters.js'","'../../../render/art/monsters.js'")
s=s.replaceAll("'../../base.js'","'../base.js'")
fs.writeFileSync(f,s); console.log("large imports patched")
