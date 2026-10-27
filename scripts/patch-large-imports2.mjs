import fs from "node:fs"
const files=["src/game/entities/monsters/large/common.js","src/game/entities/monsters/large/junk_golem.js","src/game/entities/monsters/large/sky_warden.js","src/game/entities/monsters/large/mimic_beast.js","src/game/entities/monsters/large/swarm_core.js"]
for(const f of files){
  if(!fs.existsSync(f)) continue
  let s=fs.readFileSync(f,"utf8")
  const before=s
  s=s.replaceAll("'../../render/","'../../../render/")
  s=s.replaceAll("'../../core/","'../../../core/")
  s=s.replaceAll("'../../state.js'","'../../../state.js'")
  s=s.replaceAll("'../../config.js'","'../../../config.js'")
  s=s.replaceAll("'../../base.js'","'../base.js'")
  s=s.replaceAll("'../../utils.js'","'../../../utils.js'")
  if(s!==before){ fs.writeFileSync(f,s); console.log("patched",f) }
}
