import fs from "node:fs"
const f = "src/components/panels/ChassisPicker.vue"
let s = fs.readFileSync(f, "utf8")
if (!s.includes("grid-auto-rows")) {
  s = s.replace(`  align-content: start;
  padding-right: 2px;`, `  align-content: start;
  grid-auto-rows: max-content;
  align-items: start;
  padding-right: 2px;`)
  s = s.replace(`.card {
  position: relative;`, `.card {
  position: relative;
  overflow: hidden;`)
  fs.writeFileSync(f, s)
  console.log("chassis css patched")
} else console.log("already patched")
