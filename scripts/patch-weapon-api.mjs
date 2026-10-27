import fs from "node:fs"
const f = "src/game/entities/robot.js"
let s = fs.readFileSync(f, "utf8")
s = s.replace("const wid = this.game.weapons ? this.game.weapons.currentId() : null", "const wid = this.game.weapons ? this.game.weapons.weaponId : null")
s = s.replace("if (w && w.hasWeapon && w.hasWeapon()) {", "if (w && w.weaponId) {")
fs.writeFileSync(f, s)
console.log("robot weapon api patched:", s.includes("w.weaponId"))
const g = "src/game/game.js"
let src = fs.readFileSync(g, "utf8")
src = src.replace("    this.weapons?.update?.(dt)\n    this.ecosystem?.update?.(dt)", "    if (this.weapons) {\n      this.weapons.setHolding?.(this.input.isDown('attack'))\n      if (this.input.wasPressed('reload')) this.weapons.reload?.()\n      this.weapons.update?.(dt)\n      this.syncWeaponState()\n    }\n    this.ecosystem?.update?.(dt)")
fs.writeFileSync(g, src)
console.log("game weapon holding patched:", src.includes("setHolding"))
