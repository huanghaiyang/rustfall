import fs from "node:fs"
const f="src/game/game.js"; let s=fs.readFileSync(f,"utf8")
s=s.replace(`      if (!settings.version || settings.version < 3) {
        G.settings.grain = false
        G.settings.scanlines = false
      }`, `      if (!settings.version || settings.version < 4) {
        G.settings.grain = false
        G.settings.scanlines = false
        G.settings.postfx = false
        G.settings.glow = false
      }`)
s=s.replace(`saveSettings({ display: { ...G.settings }, version: 3 })`, `saveSettings({ display: { ...G.settings }, version: 4 })`)
fs.writeFileSync(f,s); console.log("migration v4")
