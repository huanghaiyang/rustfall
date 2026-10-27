import fs from "node:fs"
const f="src/game/game.js"; let s=fs.readFileSync(f,"utf8")
// MAX_STEPS 6
s=s.replace("const MAX_STEPS = 4","const MAX_STEPS = 6")
// 真实帧率统计移到 loop（不再按 update 次数）
s=s.replace(`  loop() {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let raw = (now - this.last) / 1000
    this.last = now`, `  loop() {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let raw = (now - this.last) / 1000
    this.last = now
    this.fpsFrames = (this.fpsFrames || 0) + 1
    this.fpsWall = (this.fpsWall || 0) + raw
    if (this.fpsWall >= 0.5) {
      G.fps = Math.round(this.fpsFrames / this.fpsWall)
      this.fpsFrames = 0
      this.fpsWall = 0
    }`)
// paused + panel 时 Esc 只关面板，回到暂停菜单
s=s.replace(`      } else if (G.phase === 'playing' && G.ui.panel) {
        closePanel()
        this.sfx('uiClick')
      } else if (G.phase === 'playing') this.pause()`, `      } else if (G.phase === 'playing' && G.ui.panel) {
        closePanel()
        this.sfx('uiClick')
      } else if (G.phase === 'paused' && G.ui.panel) {
        closePanel()
        this.sfx('uiClick')
      } else if (G.phase === 'playing') this.pause()`)
fs.writeFileSync(f,s); console.log("loop fps + maxsteps + pause esc patched")
