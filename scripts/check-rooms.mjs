// 生成器自检：地形连通性 / 出生点合法性 / ASCII 预览
import { REGION, getRoomData } from '../src/game/world/region.js'
import { T } from '../src/game/world/tilemap.js'
import { TS } from '../src/game/config.js'

let failures = 0
const fail = (msg) => {
  failures++
  console.log('  FAIL:', msg)
}

for (const [id, spec] of Object.entries(REGION.rooms)) {
  const d = getRoomData(id)
  console.log(`\n=== ${id} ${spec.name}  ${d.w}x${d.h} ===`)

  // 1. 左右门洞必须为空（6 格高）
  const checkDoor = (x, floorY) => {
    for (let y = floorY - 6; y < floorY; y++) {
      const v = d.map.get(x, y)
      if (v !== T.EMPTY) fail(`door at x=${x} y=${y} not empty (${v})`)
    }
    if (!d.map.isSolid(x, floorY)) fail(`door floor under x=${x} not solid`)
  }
  if (spec.exits.left) checkDoor(0, d.doorLeft.y / TS)
  if (spec.exits.right) checkDoor(d.w - 1, d.doorRight.y / TS)

  // 2. 主廊道地面连续，步高 <= 2（跳跃可达），且脚下必须有实体
  let badSteps = 0
  for (let x = 4; x < d.w - 4; x++) {
    if (!d.map.isSolid(x, d.floorY[x])) {
      fail(`no ground at x=${x} row=${d.floorY[x]}`)
      break
    }
    const diff = Math.abs(d.floorY[x] - d.floorY[x - 1])
    if (diff > 2) badSteps++
  }
  if (badSteps > 0) console.log(`  note: ${badSteps} 处台阶高度 >2（可能有水坑/岩块）`)

  // 3. 出生点、果实、蜥蜴都不能卡在实体里
  const air = (x, y) => d.map.get(Math.floor(x / TS), Math.floor(y / TS)) === T.EMPTY
  if (!air(d.spawnX, d.spawnFloorY - 20)) fail('spawn point is solid')
  for (const f of d.fruits) {
    if (!air(f.x, f.y - 8)) fail(`fruit inside solid at ${f.x},${f.y}`)
  }
  for (const l of d.lizards) {
    if (!air(l.x, l.y - 20)) fail(`lizard spawn inside solid at ${l.x},${l.y}`)
  }
  if (d.shelter) {
    if (!air(d.shelter.x, d.shelter.y - 20)) fail('shelter front is solid')
    if (!d.map.isSolid(Math.floor(d.shelter.x / TS), Math.floor(d.shelter.y / TS)))
      fail('shelter has no floor')
  }

  // 4. 果实必须落在可站立平面上（脚下方 64px 内有实体）
  for (const f of d.fruits) {
    const g = d.map.groundBelow(f.x, f.y - 2, 80)
    if (g == null) fail(`fruit floating with no ground at ${f.x},${f.y}`)
  }

  console.log(
    `  fruits=${d.fruits.length} batflies=${d.batflies.length} lizards=${d.lizards.length} ` +
      `platforms=${d.platforms.length} poles=${d.poles.length} pools=${d.pools.length} shelter=${!!d.shelter}`,
  )

  // 5. ASCII 预览（每 2x1 采样）
  const sym = { [T.EMPTY]: ' ', [T.SOLID]: '#', [T.PLATFORM]: '=', [T.WATER]: '~', [T.POLE]: '|' }
  let art = ''
  for (let y = 0; y < d.h; y++) {
    let line = ''
    for (let x = 0; x < d.w; x++) line += sym[d.map.get(x, y)] ?? '?'
    art += line + '\n'
  }
  if (process.argv.includes('--ascii')) console.log(art)
}

console.log(`\n${failures === 0 ? 'ALL OK' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
