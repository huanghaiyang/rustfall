// 手柄 UI 导航：让面板 / 暂停 / 标题 / 机体选择 / 对话都能用 Xbox 手柄操作。
// 通过 Game.update 注入的 padUi(input, dt) 每帧驱动，与游戏内手柄输入共用一次采样。
import { G, closePanel } from './state.js'
import { A } from './ui-actions.js'

const FOCUS_SELECTOR =
  'button:not([disabled]), [data-pad], input[type="range"], select'

let focusEl = null
let lastCtx = ''
let navCd = 0

export function installGamepadUi(game) {
  if (!game) return () => {}
  game.padUi = (input, dt) => tick(game, input, dt)
  return () => {
    if (game.padUi) game.padUi = null
    clearFocus()
    focusEl = null
    lastCtx = ''
  }
}

/** 找到当前最上层可见的覆盖层（面板/暂停/标题/机体选择/死亡/对话） */
function activeOverlay() {
  if (typeof document === 'undefined') return null
  const list = Array.from(document.querySelectorAll('.overlay, .z-dialogue-wrap')).filter(
    (el) => el.offsetParent !== null,
  )
  return list.length ? list[list.length - 1] : null
}

function focusables(root) {
  if (!root) return []
  return Array.from(root.querySelectorAll(FOCUS_SELECTOR)).filter((el) => {
    if (el.offsetParent === null) return false
    if (el.classList.contains('rp-cell') && el.disabled) return false
    return true
  })
}

function clearFocus() {
  if (focusEl) focusEl.classList.remove('pad-focus')
}

function setFocus(el) {
  if (!el) return
  if (focusEl === el) return
  clearFocus()
  focusEl = el
  try {
    el.focus({ preventScroll: true })
    el.classList.add('pad-focus')
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  } catch (e) {
    /* ignore */
  }
}

function rectOf(el) {
  return el.getBoundingClientRect()
}

/** 按方向在可聚焦元素间做几何寻路 */
function moveFocus(dir) {
  const root = activeOverlay()
  const list = focusables(root)
  if (!list.length) return
  if (!focusEl || !list.includes(focusEl)) {
    setFocus(list[0])
    return
  }
  const a = rectOf(focusEl)
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best = null
  let bestScore = Infinity
  for (const el of list) {
    if (el === focusEl) continue
    const b = rectOf(el)
    if (b.width === 0 && b.height === 0) continue
    const bx = b.left + b.width / 2
    const by = b.top + b.height / 2
    const dx = bx - ax
    const dy = by - ay
    let primary = 0
    let secondary = 0
    if (dir === 'right') {
      if (dx < 8) continue
      primary = dx
      secondary = Math.abs(dy)
    } else if (dir === 'left') {
      if (dx > -8) continue
      primary = -dx
      secondary = Math.abs(dy)
    } else if (dir === 'down') {
      if (dy < 8) continue
      primary = dy
      secondary = Math.abs(dx)
    } else if (dir === 'up') {
      if (dy > -8) continue
      primary = -dy
      secondary = Math.abs(dx)
    }
    // 主要方向距离为主，垂直错位加权，保证同一行/列优先
    const score = primary + secondary * 2.2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  if (best) setFocus(best)
}

/** LB/RB 切换面板标签页 */
function cycleTabs(step) {
  const root = activeOverlay()
  if (!root) return
  const tabs = Array.from(root.querySelectorAll('.rp-tabs .rp-tab')).filter((el) => el.offsetParent !== null)
  if (!tabs.length) return
  const cur = tabs.findIndex((el) => el.classList.contains('on'))
  const idx = (cur + step + tabs.length) % tabs.length
  try {
    tabs[idx].click()
    setFocus(tabs[idx])
  } catch (e) {
    /* ignore */
  }
}

function confirmFocused() {
  if (focusEl && focusEl.offsetParent !== null) {
    try {
      focusEl.click()
      return true
    } catch (e) {
      /* ignore */
    }
  }
  return false
}

function tick(game, input, dt) {
  if (!G.settings?.gamepad || !input?.pad?.connected) {
    if (focusEl) clearFocus()
    focusEl = null
    lastCtx = ''
    if (game) game._padUiFocus = false
    return
  }
  const overlay = activeOverlay()
  // 设置面板正在捕获手柄键：这一帧的所有手柄输入都归绑定使用，不做导航/确认/关闭
  // 捕获刚结束时保留一小段冷却，避免残留的按住状态立刻触发面板导航
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  if (G.ui && (G.ui.padCapture || (G.ui.padCaptureT && now < G.ui.padCaptureT))) {
    if (game) game._padUiFocus = false
    return
  }
  // 游戏中没有覆盖层时，手柄交给玩法输入处理
  if (!overlay) {
    if (focusEl) clearFocus()
    focusEl = null
    lastCtx = ''
    if (game) game._padUiFocus = false
    return
  }
  const ctx = `${G.ui.panel || ''}|${G.phase}|${G.dialogue.active ? 1 : 0}|${overlay.className}`
  if (ctx !== lastCtx) {
    lastCtx = ctx
    focusEl = null
    navCd = 0
    clearFocus()
    const list = focusables(overlay)
    // 对话中只有选项出现时才自动聚焦，正文推进交给 dialogue.advance
    const chooseOnly = G.dialogue.active ? overlay.querySelector('.choices button') : null
    if (chooseOnly) setFocus(chooseOnly)
    else if (!G.dialogue.active && list.length) {
      const primary = list.find((el) => el.classList.contains('primary') || el.classList.contains('on'))
      setFocus(primary || list[0])
    }
  }
  // 对话正文仍在打字时，选项会被销毁，及时清掉焦点
  if (G.dialogue.active && !overlay.querySelector('.choices button') && focusEl) {
    clearFocus()
    focusEl = null
  }
  if (game) game._padUiFocus = !!(G.dialogue.active && focusEl)

  navCd = Math.max(0, navCd - dt)
  const pressed = input.pad.pressed
  const axes = input.pad.axes || [0, 0]
  let dir = ''
  // 十字键在玩法里是切武器，在菜单里必须当作方向键使用
  const left = pressed.has('left') || pressed.has('weaponPrev')
  const right = pressed.has('right') || pressed.has('weaponNext')
  const up = pressed.has('up') || pressed.has('quests')
  const down = pressed.has('down')
  if (left || right || up || down) {
    dir = left ? 'left' : right ? 'right' : up ? 'up' : 'down'
    navCd = 0.2
  } else if (navCd <= 0) {
    const [ax, ay] = axes
    if (Math.abs(ax) > 0.55) dir = ax > 0 ? 'right' : 'left'
    else if (Math.abs(ay) > 0.55) dir = ay > 0 ? 'down' : 'up'
    if (dir) navCd = 0.2
  }
  if (dir) moveFocus(dir)

  // LB/RB：切换标签页；如果没有标签页，则交给玩法（不会在覆盖层时进入玩法）
  if (pressed.has('toolPrev')) cycleTabs(-1)
  if (pressed.has('toolNext')) cycleTabs(1)

  // A 确认
  if (pressed.has('jump')) {
    if (G.dialogue.active) {
      // 有选项焦点时点击选项；普通正文推进由 Game 的 dialogue.advance 负责
      if (focusEl) confirmFocused()
    } else {
      confirmFocused()
    }
  }
  // B 返回 / 关闭
  if (pressed.has('interact')) {
    if (G.dialogue.active) A.closeDialogue()
    else if (G.ui.panel) closePanel()
    else if (G.phase === 'paused') A.resume()
    else if (G.phase === 'dead') A.retryAfterDeath()
  }
}
