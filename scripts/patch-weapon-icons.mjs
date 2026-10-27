// 武器/弹药物品使用专属图标
import fs from 'node:fs'
const log = (n, ok) => console.log((ok ? 'OK   ' : 'FAIL ') + n)

// LootDrop: 武器用 getWeaponArt
{
  const f = 'src/game/loot/world-items.js'
  let s = fs.readFileSync(f, 'utf8')
  if (!s.includes('getWeaponArt')) {
    s = s.replace(
      `import { getItemArt } from '../render/art/items.js'`,
      `import { getItemArt } from '../render/art/items.js'
import { getWeaponArt } from '../render/art/weapons.js'`,
    )
    s = s.replace(
      `      tex = getItemArt(itemId)`,
      `      const wdef = Content.get(KIND.ITEM, itemId)
      tex = wdef && (wdef.category === 'weapon' || wdef.slot === 'weapon') ? getWeaponArt(itemId) : getItemArt(itemId)`,
    )
    fs.writeFileSync(f, s)
    log('loot weapon icon', true)
  } else log('loot weapon icon', true)
}

// ItemIcon.vue: 武器走 getWeaponArt
{
  const f = 'src/components/panels/ItemIcon.vue'
  if (fs.existsSync(f)) {
    let s = fs.readFileSync(f, 'utf8')
    if (!s.includes('getWeaponArt')) {
      s = s.replace(
        /import \{ getItemArt \} from '\.\.\/\.\.\/game\/render\/art\/items\.js'/,
        `import { getItemArt } from '../../game/render/art/items.js'
import { getWeaponArt } from '../../game/render/art/weapons.js'`,
      )
      const had = s.includes('getWeaponArt')
      // 在取图处替换（兼容常见写法）
      s = s.replace(/getItemArt\(([^)]+)\)/g, (m, arg) => `(def?.category === 'weapon' || def?.slot === 'weapon' ? getWeaponArt(${arg}) : getItemArt(${arg}))`)
      fs.writeFileSync(f, s)
      log('ItemIcon weapon', had)
    } else log('ItemIcon weapon', true)
  }
}
