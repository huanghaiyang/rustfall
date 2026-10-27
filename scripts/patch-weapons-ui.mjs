import fs from "node:fs"
const log=(n,ok)=>console.log((ok?"OK  ":"FAIL ")+n)
// 1 content/index
{
  const f="src/game/content/index.js"; let s=fs.readFileSync(f,"utf8")
  if(!s.includes("weapons/data.js")){ s=s.replace("import '../loot/loot-tables.js'","import '../loot/loot-tables.js'\nimport '../weapons/data.js'"); fs.writeFileSync(f,s); log("content weapons import",true) } else log("content weapons import",true)
}
// 2 SFX_MAP laser
{
  const f="src/game/game.js"; let s=fs.readFileSync(f,"utf8")
  s=s.replace("  laser: 'hurt',\n","")
  fs.writeFileSync(f,s); log("sfx laser unmapped",!s.includes("laser: 'hurt'"))
}
// 3 weapons reset + useItem + equip category
{
  const f="src/game/game.js"; let s=fs.readFileSync(f,"utf8")
  if(!s.includes("this.weapons?.reset")){
    s=s.replace(`    this.autoEquipStarter()`, `    this.autoEquipStarter()
    this.weapons?.reset?.()`)
    fs.writeFileSync(f,s)
  }
  // useItem 忽略武器/弹药
  if(!s.includes("category === 'weapon'")){
    s=s.replace(`  useItem(itemId, opts = {}) {
    const def = Content.get(KIND.ITEM, itemId)
    if (!def) return`, `  useItem(itemId, opts = {}) {
    const def = Content.get(KIND.ITEM, itemId)
    if (!def) return
    if (def.category === 'weapon' || def.category === 'ammo') {
      if (def.category === 'weapon') this.equipItem(itemId)
      return
    }`)
  }
  s=s.replace(`    if (def.slot === 'weapon') {`, `    if (def.slot === 'weapon' || def.category === 'weapon') {`)
  fs.writeFileSync(f,s); log("useItem/equip category",true)
}
// 4 InventoryPanel tabs
{
  const f="src/components/panels/InventoryPanel.vue"; let s=fs.readFileSync(f,"utf8")
  const i=s.indexOf("const TABS = [")
  const j=s.indexOf("]", i)
  const block=s.slice(i, j+1)
  if(!block.includes("'weapon'")){
    const ins=block.replace(/\n\]$/, `,\n  { id: 'weapon', label: '武器' },\n  { id: 'ammo', label: '弹药' },\n]`)
    s=s.slice(0,i)+ins+s.slice(j+1)
    fs.writeFileSync(f,s); log("inventory tabs",true)
  } else log("inventory tabs",true)
}
// 5 HUD 武器块
{
  const f="src/components/Hud.vue"; let s=fs.readFileSync(f,"utf8")
  if(!s.includes("hud-weapon")){
    s=s.replace(`    <div class="hud-keys">`, `    <div v-if="G.weapon && G.weapon.id" class="hud-weapon">
      <div class="hw-name">{{ G.weapon.name || G.weapon.id }}</div>
      <div class="hw-line">
        <span v-if="G.weapon.class === 'ranged'">{{ G.weapon.ammo }}/{{ G.weapon.ammoMax }} · 备 {{ G.weapon.reserve }}</span>
        <span v-else>近战 · {{ G.weapon.damage }} 伤害</span>
        <span v-if="G.weapon.reloading" class="hw-reload">换弹 {{ Math.round((G.weapon.reloadProgress || 0) * 100) }}%</span>
        <span v-else-if="G.weapon.compatible === false" class="hw-bad">不兼容</span>
      </div>
    </div>

    <div class="hud-keys">`)
    fs.writeFileSync(f,s); log("hud weapon block",true)
  } else log("hud weapon block",true)
}
