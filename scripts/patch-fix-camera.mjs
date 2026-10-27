import fs from "node:fs"
{
  const f="src/game/world/room.js"; let s=fs.readFileSync(f,"utf8")
  s=s.replace(`    if (this.overlayMesh) {
      this.overlayMesh.position.x = camera ? 0 : 0
      this.overlayMesh.position.y = this.game.camera.position.y
      this.overlayMesh.position.x = this.game.camera.position.x
    }`, `    if (this.overlayMesh && this.game.camera) {
      this.overlayMesh.position.x = this.game.camera.position.x
      this.overlayMesh.position.y = this.game.camera.position.y
    }`)
  fs.writeFileSync(f,s); console.log("room camera fixed", !s.includes("camera ? 0"))
}
{
  const f="src/game/systems/daynight.js"; let s=fs.readFileSync(f,"utf8")
  if(!s.includes("this.phaseDef = this.phaseFor(this.time)\n    const w = WEATHERS")){
    s=s.replace(`  apply(force = false) {
    const st = this.state()`, `  apply(force = false) {
    this.phaseDef = this.phaseFor(this.time)
    const st = this.state()`)
    fs.writeFileSync(f,s); console.log("daynight apply phase", true)
  }
}
