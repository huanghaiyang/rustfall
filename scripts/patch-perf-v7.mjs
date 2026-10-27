import fs from "node:fs"
const f="src/game/game.js"; let s=fs.readFileSync(f,"utf8")
// 去掉旧的按 update 次数算 fps（与 loop 冲突）
s=s.replace("    this.updateFps(dt)\n","")
// 武器状态 10Hz 同步 + 复用对象
s=s.replace(`      this.weapons.update?.(dt)
      this.syncWeaponState()`, `      this.weapons.update?.(dt)
      this._wstateT = (this._wstateT || 0) + dt
      if (this._wstateT >= 0.1) {
        this._wstateT = 0
        this.syncWeaponState()
      }`)
s=s.replace(`    const st = this.weapons.state ? this.weapons.state() : null
    if (st) G.weapon = { ...G.weapon, ...st }`, `    const st = this.weapons.state ? this.weapons.state() : null
    if (st && G.weapon) Object.assign(G.weapon, st)`)
fs.writeFileSync(f,s); console.log("game: fps conflict + weapon throttle")
// daynight 10Hz apply
const d="src/game/systems/daynight.js"; let t=fs.readFileSync(d,"utf8")
t=t.replace(`    this.worldFlash = this.lightning
    this.apply(false)
    return this.state()`, `    this.worldFlash = this.lightning
    this._applyAcc = (this._applyAcc || 0) + dt
    const changed = phase.id !== this._appliedPhase || this.weatherId !== this._appliedWeather
    if (changed || this._applyAcc >= 0.1) {
      this._appliedPhase = phase.id
      this._appliedWeather = this.weatherId
      this._applyAcc = 0
      this.apply(false)
    }
    return this.state()`)
fs.writeFileSync(d,t); console.log("daynight throttle", t.includes("_applyAcc"))
