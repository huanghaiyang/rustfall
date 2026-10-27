import { G, openPanel, closePanel, toast } from './state.js'
import { Content, KIND } from './core/registry.js'

let gameRef = null

export function bindGame(game) {
  gameRef = game
}

const game = () => gameRef

function safe(fn, fallback = undefined) {
  try {
    return fn()
  } catch (err) {
    console.error('[ui-action]', err)
    return fallback
  }
}

/** UI 层唯一的动作入口 */
export const A = {
  // —— 面板 ——
  openPanel(name) {
    openPanel(name)
  },
  closePanel() {
    closePanel()
  },
  togglePause() {
    const g = game()
    if (!g) return
    if (G.phase === 'playing') g.pause()
    else if (G.phase === 'paused') g.resume()
  },
  pause() {
    safe(() => game()?.pause())
  },
  resume() {
    safe(() => game()?.resume())
  },

  // —— 物品 ——
  selectItem(id) {
    G.ui.selectedItem = id
  },
  useItem(id) {
    const g = game()
    if (!g) return
    safe(() => g.useItem(id))
  },
  equipItem(id) {
    const g = game()
    if (!g) return
    safe(() => g.equipItem(id))
  },
  unequip(slot) {
    const g = game()
    if (!g) return
    safe(() => g.unequipSlot(slot))
  },
  dropItem(id, n = 1) {
    const g = game()
    if (!g) return
    safe(() => g.dropItem(id, n))
  },
  craft(recipeId) {
    const g = game()
    if (!g) return
    safe(() => g.craft(recipeId))
  },

  // —— 成长 ——
  spendGrowth(key) {
    const g = game()
    if (!g) return
    safe(() => g.spendGrowth(key))
  },

  // —— 任务/档案 ——
  selectQuest(id) {
    G.ui.selectedQuest = id
  },
  trackQuest(id) {
    const g = game()
    safe(() => g?.quests?.track(id))
    G.quests.tracked = id
    toast(`已追踪：${Content.get(KIND.QUEST, id)?.title || id}`, 'info', 1.8)
  },
  selectArchive(id) {
    G.ui.selectedArchive = id
    const g = game()
    safe(() => g?.markArchiveRead(id))
  },

  // —— 对话 ——
  chooseDialogue(i) {
    safe(() => game()?.dialogue?.choose(i))
  },
  advanceDialogue() {
    safe(() => game()?.dialogue?.advance())
  },
  closeDialogue() {
    safe(() => game()?.dialogue?.close())
  },

  // —— 角色 ——
  switchChassis(id) {
    const g = game()
    if (!g) return
    safe(() => g.switchChassis(id))
  },
  switchTool(id) {
    const g = game()
    if (!g) return
    safe(() => g.switchTool(id))
  },
  talkTo(npcId) {
    const g = game()
    if (!g) return
    safe(() => g.talkTo(npcId))
  },

  // —— 营地/流程 ——
  startNewGame(chassisId) {
    safe(() => game()?.startNewGame(chassisId))
  },
  continueGame() {
    safe(() => game()?.continueGame())
  },
  retryAfterDeath() {
    safe(() => game()?.retryAfterDeath())
  },
  nextCycle() {
    safe(() => game()?.nextCycle())
  },
  quitToTitle() {
    safe(() => game()?.quitToTitle())
  },
  restartRun() {
    safe(() => game()?.restartRun())
  },
  hibernate() {
    safe(() => game()?.hibernate())
  },
  interact() {
    safe(() => game()?.interact())
  },

  // —— 设置 / mods ——
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
  },
  toggleMute() {
    safe(() => game()?.toggleMute())
  },
  setVolume(v) {
    safe(() => game()?.setVolume(v))
  },
  installMod(id) {
    safe(() => game()?.installMod(id))
  },
  enableMod(id, on) {
    safe(() => game()?.setModEnabled(id, on))
  },
}

// 供 canvas / 调试访问
if (typeof window !== 'undefined') {
  window.__rustfallActions = A
}
