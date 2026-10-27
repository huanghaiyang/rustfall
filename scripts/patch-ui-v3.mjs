import fs from "node:fs"
const log = (n, ok) => console.log((ok ? "OK  " : "FAIL") + " " + n)
// ---- weather 方法 ----
{
  const f = "src/game/systems/weather.js"
  let s = fs.readFileSync(f, "utf8")
  if (!s.includes("setIntensity(v)")) {
    s = s.replace("  dispose() {", `  /** 天气系统（日夜/天气循环）驱动的强度与闪电 */
  setIntensity(v) {
    this.targetIntensity = Math.max(0, Math.min(1, Number(v) || 0))
  }

  setSmoke(v) {
    this.targetSmoke = Math.max(0, Math.min(1, Number(v) || 0))
  }

  triggerLightning(strength = 0.6) {
    this.flash = Math.max(this.flash, Math.min(1, strength))
    if (this.flash > 0.5) this.flashTimer = 4 + Math.random() * 6
  }

  dispose() {`)
    log("weather methods", true)
  } else log("weather methods", true)
  fs.writeFileSync(f, s)
}
// ---- ui-actions ----
{
  const f = "src/game/ui-actions.js"
  let s = fs.readFileSync(f, "utf8")
  if (!s.includes("setSetting(")) {
    s = s.replace("  // —— 设置 / mods ——", `  // —— 设置 / mods ——
  setSetting(key, value) {
    const g = game()
    if (!g) return
    safe(() => g.setSetting(key, value))
  },
  setDeadzone(v) {
    const g = game()
    if (!g) return
    safe(() => g.setDeadzone(v))
  },
  setWeather(id) {
    const g = game()
    if (!g) return
    safe(() => g.dayNight?.setWeather(id, 45))
  },
  skipPhase() {
    const g = game()
    if (!g) return
    safe(() => {
      if (g.dayNight) g.dayNight.time = (g.dayNight.time + 0.14) % 1
    })
  },`)
    log("ui-actions", true)
  } else log("ui-actions", true)
  fs.writeFileSync(f, s)
}
// ---- App.vue ----
{
  const f = "src/App.vue"
  let s = fs.readFileSync(f, "utf8")
  if (!s.includes("SettingsPanel")) {
    s = s.replace(`import ChassisPicker from './components/panels/ChassisPicker.vue'`, `import ChassisPicker from './components/panels/ChassisPicker.vue'
import SettingsPanel from './components/panels/SettingsPanel.vue'
import DayNightHud from './components/DayNightHud.vue'
import GamepadHint from './components/GamepadHint.vue'`)
    s = s.replace(`    <div v-if="G.ui.panel === 'help'" class="overlay">`, `    <div v-if="G.ui.panel === 'settings'" class="overlay">
      <SettingsPanel @close="A.closePanel()" />
    </div>
    <div v-if="G.ui.panel === 'help'" class="overlay">`)
    s = s.replace(`    <Hud v-if="showHud" />`, `    <Hud v-if="showHud" />
    <DayNightHud v-if="showHud && G.settings.showClock" />
    <GamepadHint />`)
    s = s.replace(`    <div class="fx-grain"></div>
    <div class="fx-scanlines"></div>
    <div class="fx-vignette"></div>`, `    <div v-if="G.settings.grain" class="fx-grain"></div>
    <div v-if="G.settings.scanlines" class="fx-scanlines"></div>
    <div v-if="G.settings.vignette" class="fx-vignette"></div>`)
    s = s.replace(`      @mods="A.openPanel('mods')"
      @help="A.openPanel('help')"`, `      @mods="A.openPanel('mods')"
      @settings="A.openPanel('settings')"
      @help="A.openPanel('help')"`)
    s = s.replace(`  if (e.code === 'Escape' && showChassisPicker.value) showChassisPicker.value = false`, `  if (e.code === 'F2') A.openPanel('settings')
  if (e.code === 'Escape' && showChassisPicker.value) showChassisPicker.value = false`)
    log("App.vue", true)
  } else log("App.vue", true)
  fs.writeFileSync(f, s)
}
// ---- TitleScreen: 设置按钮 ----
{
  const f = "src/components/TitleScreen.vue"
  let s = fs.readFileSync(f, "utf8")
  s = s.replace(`defineEmits(['start', 'continue', 'mods', 'help'])`, `defineEmits(['start', 'continue', 'mods', 'settings', 'help'])`)
  s = s.replace(`      <button class="btn" @click="$emit('mods')">模 组 管 理</button>`, `      <button class="btn" @click="$emit('mods')">模 组 管 理</button>
      <button class="btn" @click="$emit('settings')">设 置 · 画 面 与 手 柄</button>`)
  fs.writeFileSync(f, s)
  log("TitleScreen", true)
}
// ---- PauseMenu: 设置按钮 + emit ----
{
  const f = "src/components/PauseMenu.vue"
  let s = fs.readFileSync(f, "utf8")
  s = s.replace(`defineEmits(['resume', 'help', 'mods', 'restart', 'title', 'mute', 'volume'])`, `defineEmits(['resume', 'help', 'mods', 'settings', 'restart', 'title', 'mute', 'volume'])`)
  s = s.replace(`        <button class="btn" @click="$emit('mods')">模 组</button>`, `        <button class="btn" @click="$emit('mods')">模 组</button>
        <button class="btn" @click="$emit('settings')">设 置</button>`)
  fs.writeFileSync(f, s)
  log("PauseMenu", true)
}
