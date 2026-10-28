import { BOSS_TESTS } from '../src/game/world/boss-test.js'
import { THEME_BOSS_DEFS } from '../src/game/entities/monsters/large/theme-bosses.js'

const byId = new Map(THEME_BOSS_DEFS.map((d) => [d.id, d]))
let i = 0
for (const t of BOSS_TESTS) {
  const d = byId.get(t.bossId)
  i++
  console.log(
    `${String(i).padStart(2, '0')} | ${t.bossId} | ${t.themeId} | ${d?.name || t.name} | ${d?.en || t.en} | art=${d?.artId} | fam=${d?.family} | accent=#${(d?.accent ?? 0).toString(16).padStart(6, '0')} | size=${d?.size?.[0]}x${d?.size?.[1]}`,
  )
}
console.log('TOTAL', i)
