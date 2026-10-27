// 1) UI 层级  2) 固定步长  3) 角色光块  4) 噪点默认关
import fs from 'node:fs'
const log = (n, ok) => console.log((ok ? 'OK   ' : 'FAIL ') + n)

// ---------- 1. state: 面板栈 ----------
{
  const f = 'src/game/state.js'
  let s = fs.readFileSync(f, 'utf8')
  s = s.replace(
    `export function openPanel(name) {
  G.ui.panel = G.ui.panel === name ? null : name
  G.paused = G.phase === 'playing' && !!G.ui.panel
}`,
    `export function openPanel(name) {
  if (G.ui.panel === name) {
    closePanel()
    return
  }
  G.ui.panel = name
  if (!Array.isArray(G.ui.stack)) G.ui.stack = []
  const i = G.ui.stack.indexOf(name)
  if (i >= 0) G.ui.stack.splice(i, 1)
  G.ui.stack.push(name)
  G.paused = G.phase === 'playing' && !!G.ui.panel
}`,
  )
  s = s.replace(
    `export function closePanel() {
  G.ui.panel = null
  if (G.phase === 'playing') G.paused = false
}`,
    `export function closePanel() {
  const name = G.ui.panel
  G.ui.panel = null
  if (Array.isArray(G.ui.stack)) {
    const i = G.ui.stack.indexOf(name)
    if (i >= 0) G.ui.stack.splice(i, 1)
    G.ui.stack.length = 0
  }
  if (G.phase === 'playing') G.paused = false
}`,
  )
  if (!s.includes('stack: []')) {
    s = s.replace(`    toolBeltOpen: false,`, `    toolBeltOpen: false,
    stack: [],`)
  }
  fs.writeFileSync(f, s)
  log('state panel stack', s.includes('G.ui.stack'))
}

// ---------- 1b. App：层级 + 标题让位 ----------
{
  const f = 'src/App.vue'
  let s = fs.readFileSync(f, 'utf8')
  s = s.replace(
    `<div v-if="G.ui.panel === 'inventory'" class="overlay">`,
    `<div v-if="G.ui.panel === 'inventory'" class="overlay z-panel">`,
  )
  for (const name of ['quests', 'archive', 'mods', 'companions', 'settings', 'help']) {
    s = s.replace(`<div v-if="G.ui.panel === '${name}'" class="overlay">`, `<div v-if="G.ui.panel === '${name}'" class="overlay z-panel">`)
  }
  s = s.replace(
    `v-if="G.phase === 'title' && !showChassisPicker && G.ui.panel !== 'mods'"`,
    `v-if="G.phase === 'title' && !showChassisPicker && !G.ui.panel"`,
  )
  s = s.replace(`<div v-if="showChassisPicker || G.phase === 'chassis'" class="overlay">`, `<div v-if="showChassisPicker || G.phase === 'chassis'" class="overlay z-chassis">`)
  s = s.replace(`<DialogueBox v-if="G.dialogue.active" />`, `<div v-if="G.dialogue.active" class="z-dialogue-wrap"><DialogueBox /></div>`)
  s = s.replace(`      v-if="G.phase === 'paused' && !G.ui.panel"`, `      v-if="G.phase === 'paused' && !G.ui.panel"
      class="z-pause"`)
  s = s.replace(`    <DeathScreen
      v-if="G.phase === 'dead'"`, `    <DeathScreen
      class="z-result"
      v-if="G.phase === 'dead'"`)
  s = s.replace(`    <HibernateScreen
      v-if="G.phase === 'hibernate'"`, `    <HibernateScreen
      class="z-result"
      v-if="G.phase === 'hibernate'"`)
  s = s.replace(`    <div v-if="!ready" class="loading-screen">`, `    <div v-if="!ready" class="loading-screen z-loading">`)
  fs.writeFileSync(f, s)
  log('App layers', s.includes('z-panel') && s.includes('!G.ui.panel'))
}

// ---------- 1c. CSS 层级 ----------
{
  const f = 'src/style.css'
  let s = fs.readFileSync(f, 'utf8')
  if (!s.includes('.z-panel')) {
    s += `

/* ============================================================
   叠层顺序：后打开的 UI 永远压住先打开的
   ============================================================ */
.overlay.z-title { z-index: 10; }
.overlay.z-chassis { z-index: 14; }
.overlay.z-pause { z-index: 18; }
.z-dialogue-wrap { position: absolute; inset: 0; z-index: 22; pointer-events: none; }
.z-dialogue-wrap > * { pointer-events: auto; }
.overlay.z-panel { z-index: 30; }
.overlay.z-result { z-index: 40; }
.z-result { z-index: 40; }
.loading-screen.z-loading { z-index: 60; }
`
    fs.writeFileSync(f, s)
  }
  log('css layers', true)
}

// ---------- 2. 固定步长 ----------
{
  const f = 'src/game/game.js'
  let s = fs.readFileSync(f, 'utf8')
  s = s.replace(
    `  loop() {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 1 / 25) dt = 1 / 25
    if (dt < 0) dt = 0
    try {
      this.update(dt)
      this.render(dt)
    } catch (err) {
      console.error('[rustfall] loop error', err)
    }
  }`,
    `  loop() {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let raw = (now - this.last) / 1000
    this.last = now
    if (!(raw > 0)) raw = 0
    // 卡顿/切后台时不要一次模拟十几秒
    if (raw > 0.25) raw = 0.25
    this.acc = (this.acc || 0) + raw
    const STEP = 1 / 60
    const MAX_STEPS = 4
    let steps = 0
    try {
      // 固定步长：掉帧时补步，避免整局变慢动作
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.update(STEP)
        this.acc -= STEP
        steps++
      }
      if (steps === MAX_STEPS && this.acc > STEP) this.acc = 0 // 追不上就丢弃，防螺旋
      if (steps === 0) this.update(raw) // 高刷新率：直接推进真实时间
      this.render(raw)
    } catch (err) {
      console.error('[rustfall] loop error', err)
      this.acc = 0
    }
  }`,
  )
  fs.writeFileSync(f, s)
  log('fixed timestep', s.includes('fixed') || s.includes('MAX_STEPS'))
}

// ---------- 3. 角色光块：加贴图 + 默认关闭 ----------
{
  const f = 'src/game/entities/robot.js'
  let s = fs.readFileSync(f, 'utf8')
  if (!s.includes("map: getGlowTexture()")) {
    s = s.replace(
      `      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xf2b34a,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      this.glow = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), glowMat)`,
      `      const glowMat = new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color: 0xf2b34a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      this.glow = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), glowMat)`,
    )
    if (!/import \{[^}]*getGlowTexture/.test(s)) {
      s = s.replace(
        `import { spriteMaterial } from '../render/materials.js'`,
        `import { spriteMaterial } from '../render/materials.js'
import { getGlowTexture } from '../render/textures.js'`,
      )
    }
    fs.writeFileSync(f, s)
  }
  log('robot glow', s.includes('getGlowTexture'))

  // 同步处把光晕跟设置绑起来
  let r = fs.readFileSync(f, 'utf8')
  r = r.replace(
    `      this.glow.material.opacity = (this.stats.abilities.includes('nightVision') ? 0.17 : 0.1) + Math.sin(performance.now() * 0.002) * 0.02`,
    `      const glowOn = !!(G.settings && G.settings.glow)
      this.glow.visible = glowOn
      this.glow.material.opacity = glowOn ? (this.stats.abilities.includes('nightVision') ? 0.16 : 0.1) : 0`,
  )
  fs.writeFileSync(f, r)
  log('robot glow gate', r.includes('const glowOn'))
}

// ---------- 4. 噪点默认关 + 与 postfx 联动 ----------
{
  const f = 'src/game/game.js'
  let s = fs.readFileSync(f, 'utf8')
  s = s.replace(
    `    if (settings.display && typeof settings.display === 'object') {
      Object.assign(G.settings, settings.display)
    }
    this.applySettings()`,
    `    if (settings.display && typeof settings.display === 'object') {
      Object.assign(G.settings, settings.display)
      // v3 迁移：老存档/测试存档可能把噪点与扫描线留成开启状态，统一关掉
      if (!settings.version || settings.version < 3) {
        G.settings.grain = false
        G.settings.scanlines = false
      }
    }
    this.applySettings()`,
  )
  s = s.replace(
    `  applySettings() {
    const st = G.settings
    if (this.postfx) {
      this.postfx.setEnabled?.(!!st.postfx)
      this.postfx.setGlow?.(!!st.glow)
    }`,
    `  applySettings() {
    const st = G.settings
    if (this.postfx) {
      this.postfx.setEnabled?.(!!st.postfx)
      this.postfx.setGlow?.(!!st.glow)
      this.postfx.setUniforms?.({
        grain: st.grain ? 0.12 : 0,
        scanline: st.scanlines ? 0.12 : 0,
        vignette: st.vignette ? 0.55 : 0,
      })
    }`,
  )
  s = s.replace(`    saveSettings({ display: { ...G.settings } })`, `    saveSettings({ display: { ...G.settings }, version: 3 })`)
  fs.writeFileSync(f, s)
  log('grain default/migration', s.includes("st.grain ? 0.12 : 0"))
}
