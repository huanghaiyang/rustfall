<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { Game } from './game/game.js'
import { G } from './game/state.js'
import { A } from './game/ui-actions.js'
import './styles/panels.css'

import Hud from './components/Hud.vue'
import TitleScreen from './components/TitleScreen.vue'
import PauseMenu from './components/PauseMenu.vue'
import DeathScreen from './components/DeathScreen.vue'
import HibernateScreen from './components/HibernateScreen.vue'
import HelpOverlay from './components/HelpOverlay.vue'
import InventoryPanel from './components/panels/InventoryPanel.vue'
import QuestPanel from './components/panels/QuestPanel.vue'
import DialogueBox from './components/panels/DialogueBox.vue'
import ChassisPicker from './components/panels/ChassisPicker.vue'
import SettingsPanel from './components/panels/SettingsPanel.vue'
import DayNightHud from './components/DayNightHud.vue'
import GamepadHint from './components/GamepadHint.vue'
import ModManager from './components/panels/ModManager.vue'
import ArchivePanel from './components/panels/ArchivePanel.vue'
import ToolBelt from './components/panels/ToolBelt.vue'
import NotificationFeed from './components/panels/NotificationFeed.vue'
import CompanionPanel from './components/panels/CompanionPanel.vue'

const host = ref(null)
const ready = ref(false)
let game = null

const showChassisPicker = ref(false)
const showHud = computed(() => G.showHud && G.phase !== 'title' && G.phase !== 'dead')

// 开始游戏后（ChassisPicker 内部会调用 A.startNewGame）自动收起遮罩
watch(
  () => G.phase,
  (phase) => {
    if (phase !== 'title' && phase !== 'chassis') showChassisPicker.value = false
  },
)
watch(
  () => G.showHud,
  (v) => {
    if (v) showChassisPicker.value = false
  },
)

function onStart() {
  showChassisPicker.value = true
}
function onStartChassis(id) {
  showChassisPicker.value = false
  A.startNewGame(id)
}
function onContinue() {
  showChassisPicker.value = false
  A.continueGame()
}
function onRetry() {
  A.retryAfterDeath()
}
function onNextCycle() {
  A.nextCycle()
}
function onTitle() {
  A.quitToTitle()
}
function onKey(e) {
  if (!ready.value) return
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (G.phase === 'dead') onRetry()
    else if (G.phase === 'hibernate') onNextCycle()
  }
  if (e.code === 'F2') A.openPanel('settings')
  if (e.code === 'Escape' && showChassisPicker.value) showChassisPicker.value = false
}

onMounted(async () => {
  game = new Game(host.value)
  window.__rustfall = game
  try {
    await game.bootPromise
  } catch (e) {
    console.error('[app] boot failed', e)
  }
  ready.value = true
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  game?.dispose()
  game = null
})
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      game?.dispose()
    } catch (e) {
      /* ignore */
    }
    game = null
  })
}
</script>

<template>
  <div class="app-rustfall">
    <div ref="host" class="stage"></div>

    <div class="fx-toxic" :style="{ opacity: Math.min(0.45, G.weatherIntensity * 0.45) }"></div>
    <div v-if="G.settings.grain" class="fx-grain"></div>
    <div v-if="G.settings.scanlines" class="fx-scanlines"></div>
    <div v-if="G.settings.vignette" class="fx-vignette"></div>
    <div class="fx-hurt" :style="{ opacity: Math.min(0.85, G.hurt * 0.7) }"></div>
    <div class="fx-flash" :style="{ opacity: Math.min(0.5, G.flash * 0.5) }"></div>
    <div class="fx-fade" :style="{ opacity: G.fade }"></div>

    <Hud v-if="showHud" />
    <DayNightHud v-if="showHud && G.settings.showClock" />
    <GamepadHint />
    <ToolBelt v-if="showHud" />
    <NotificationFeed v-if="ready" />

    <div v-if="G.dialogue.active" class="z-dialogue-wrap"><DialogueBox /></div>

    <div v-if="G.ui.panel === 'inventory'" class="overlay z-panel">
      <InventoryPanel />
    </div>
    <div v-if="G.ui.panel === 'quests'" class="overlay z-panel">
      <QuestPanel />
    </div>
    <div v-if="G.ui.panel === 'archive'" class="overlay z-panel">
      <ArchivePanel />
    </div>
    <div v-if="G.ui.panel === 'mods'" class="overlay z-panel">
      <ModManager />
    </div>
    <div v-if="G.ui.panel === 'companions'" class="overlay z-panel">
      <CompanionPanel />
    </div>
    <div v-if="G.ui.panel === 'settings'" class="overlay z-panel">
      <SettingsPanel @close="A.closePanel()" />
    </div>
    <div v-if="G.ui.panel === 'help'" class="overlay z-panel">
      <HelpOverlay @close="A.closePanel()" />
    </div>

    <TitleScreen
      v-if="G.phase === 'title' && !showChassisPicker && !G.ui.panel"
      :has-save="!!G.hasSave"
      :save-info="G.saveInfo"
      :ready="ready"
      @start="onStart"
      @continue="onContinue"
      @mods="A.openPanel('mods')"
      @settings="A.openPanel('settings')"
      @help="A.openPanel('help')"
    />

    <div v-if="showChassisPicker || G.phase === 'chassis'" class="overlay z-chassis">
      <ChassisPicker :mode="'start'" @confirm="onStartChassis" @cancel="showChassisPicker = false" />
    </div>

    <PauseMenu
      v-if="G.phase === 'paused' && !G.ui.panel"
      class="z-pause"
      @resume="A.resume"
      @help="A.openPanel('help')"
      @mods="A.openPanel('mods')"
      @restart="A.restartRun"
      @title="onTitle"
      @mute="A.toggleMute"
      @volume="A.setVolume"
    />

    <DeathScreen v-if="G.phase === 'dead'" :reason="G.deathReason" @retry="onRetry" @title="onTitle" />
    <HibernateScreen v-if="G.phase === 'hibernate'" @next="onNextCycle" @title="onTitle" />

    <div v-if="!ready" class="loading-screen z-loading">
      <div>RUSTFALL · 正在唤醒机体</div>
      <div class="loading-bar"><i></i></div>
    </div>
  </div>
</template>
