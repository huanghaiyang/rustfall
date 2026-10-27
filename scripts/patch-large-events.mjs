import fs from "node:fs"
const f="src/game/game.js"; let s=fs.readFileSync(f,"utf8")
if(!s.includes("large:spawn")){
  s=s.replace(`    this.applySettings()
    if (this.postfx) this.postfx.setEnabled?.(G.settings.postfx)`, `    this.applySettings()
    if (this.postfx) this.postfx.setEnabled?.(G.settings.postfx)
    Events.on('large:spawn', (e) => {
      if (!e) return
      notify(\`大型目标：\${e.name || e.id}\`, 'danger', 4)
      this.sfx('storm_alarm', { vol: 0.35 })
    })
    Events.on('large:dead', (e) => {
      if (!e) return
      G.stats.largeKills = (G.stats.largeKills || 0) + 1
      notify(\`已击破：\${e.name || e.id}\`, 'quest', 5)
      this.saveGame()
    })`)
  fs.writeFileSync(f,s); console.log("large events wired")
}
