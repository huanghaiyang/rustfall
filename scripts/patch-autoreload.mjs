import fs from "node:fs"
const f="src/game/game.js"; let s=fs.readFileSync(f,"utf8")
if(!s.includes("this.weapons.reload?.()\n        this.syncWeaponState()")){
  s=s.replace(`      const wr = this.weapons.equip(itemId)
      if (wr?.ok) {
        this.syncWeaponState()`, `      const wr = this.weapons.equip(itemId)
      if (wr?.ok) {
        this.weapons.reload?.()
        this.syncWeaponState()`)
  fs.writeFileSync(f,s); console.log("auto reload on equip")
}
