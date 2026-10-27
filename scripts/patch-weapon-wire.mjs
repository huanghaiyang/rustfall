import fs from "node:fs"
// ecosystem 改为静态导入 eco.js
const f = "src/game/ecosystem/index.js"
let s = fs.readFileSync(f, "utf8")
s = s.replace(/let getEcoArt = null[\s\S]*?\n}\n/, "import { getEcoArt } from '../render/art/eco.js'\n")
fs.writeFileSync(f, s)
console.log("eco import patched")
// game.js：武器装备路由
const g = "src/game/game.js"
let src = fs.readFileSync(g, "utf8")
if (!src.includes("slot === 'weapon'")) {
  src = src.replace(`    const def = Content.get(KIND.ITEM, itemId)
    if (!def?.slot) return toast('这不是可安装的组件。', 'info', 1.6)
    const res = this.inventory.equip(itemId)`, `    const def = Content.get(KIND.ITEM, itemId)
    if (!def?.slot) return toast('这不是可安装的组件。', 'info', 1.6)
    if (def.slot === 'weapon') {
      if (!this.weapons) return toast('武器系统未加载', 'warn', 2)
      const wr = this.weapons.equip(itemId)
      if (wr?.ok) {
        this.syncWeaponState()
        this.sfx('weapon_swap', { vol: 0.5 })
        notify(\`装备：\${def.name}\`, 'good', 2)
      } else {
        toast(wr?.reason || '这台机体装不了这件武器', 'warn', 2.4)
      }
      return
    }
    const res = this.inventory.equip(itemId)`)
  src = src.replace(`  applyEquipment() {`, `  syncWeaponState() {
    if (!this.weapons) return
    const st = this.weapons.state ? this.weapons.state() : null
    if (st) G.weapon = { ...G.weapon, ...st }
  }

  applyEquipment() {`)
  fs.writeFileSync(g, src)
  console.log("weapon equip patched")
}
