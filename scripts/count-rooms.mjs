import { REGIONS, REGION_ORDER } from "../src/game/world/regions.js"
console.log("regions:", REGION_ORDER.join(","))
let total = 0
for (const r of REGION_ORDER) {
  const rooms = Object.keys(REGIONS[r].rooms || {})
  total += rooms.length
  console.log(r, rooms.length)
}
console.log("TOTAL ROOMS", total)
