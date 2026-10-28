// 武器 / 装备快捷槽位绑定（键盘 + 手柄）
import { G } from './state.js'

export const HOTKEY_ACTIONS = [
  { id: 'weapon1', label: '武器快捷 1', en: 'WEAPON 1', kind: 'weapon' },
  { id: 'weapon2', label: '武器快捷 2', en: 'WEAPON 2', kind: 'weapon' },
  { id: 'weapon3', label: '武器快捷 3', en: 'WEAPON 3', kind: 'weapon' },
  { id: 'weapon4', label: '武器快捷 4', en: 'WEAPON 4', kind: 'weapon' },
  { id: 'tool1', label: '工具快捷 1', en: 'TOOL 1', kind: 'tool' },
  { id: 'tool2', label: '工具快捷 2', en: 'TOOL 2', kind: 'tool' },
  { id: 'tool3', label: '工具快捷 3', en: 'TOOL 3', kind: 'tool' },
  { id: 'tool4', label: '工具快捷 4', en: 'TOOL 4', kind: 'tool' },
]

export const HOTKEY_DEFAULTS = {
  weapon1: { key: 'Digit5', pad: null },
  weapon2: { key: 'Digit6', pad: null },
  weapon3: { key: 'Digit7', pad: null },
  weapon4: { key: 'Digit8', pad: null },
  tool1: { key: 'Digit1', pad: null },
  tool2: { key: 'Digit2', pad: null },
  tool3: { key: 'Digit3', pad: null },
  tool4: { key: 'Digit4', pad: null },
}

export const PAD_LABELS = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
  'Back', 'Start', 'L3', 'R3', '↑', '↓', '←', '→',
  'Guide', 'C', 'Z',
]

const KEY_LABELS = {
  Space: '空格',
  Enter: 'Enter',
  NumpadEnter: '小键盘 Enter',
  Escape: 'ESC',
  Backspace: 'Backspace',
  Tab: 'Tab',
  ShiftLeft: '左 Shift',
  ShiftRight: '右 Shift',
  ControlLeft: '左 Ctrl',
  ControlRight: '右 Ctrl',
  AltLeft: '左 Alt',
  AltRight: '右 Alt',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Numpad0: '小键盘 0',
  Numpad1: '小键盘 1',
  Numpad2: '小键盘 2',
  Numpad3: '小键盘 3',
  Numpad4: '小键盘 4',
  Numpad5: '小键盘 5',
  Numpad6: '小键盘 6',
  Numpad7: '小键盘 7',
  Numpad8: '小键盘 8',
  Numpad9: '小键盘 9',
}

export function keyLabel(code) {
  const c = String(code || '')
  if (!c) return '未绑定'
  if (KEY_LABELS[c]) return KEY_LABELS[c]
  if (c.startsWith('Key')) return c.slice(3)
  if (c.startsWith('Digit')) return c.slice(5)
  if (c.startsWith('Numpad')) return '小键盘 ' + c.slice(6)
  return c
}

export function padLabel(index) {
  if (index === null || index === undefined || index === '') return '未绑定'
  const i = Number(index)
  if (!Number.isFinite(i) || i < 0) return '未绑定'
  return PAD_LABELS[i] || `按键 ${i}`
}

export function ensureHotkeys() {
  if (!G.settings || typeof G.settings !== 'object') G.settings = {}
  if (!G.settings.hotkeys || typeof G.settings.hotkeys !== 'object') G.settings.hotkeys = {}
  for (const id of Object.keys(HOTKEY_DEFAULTS)) {
    const cur = G.settings.hotkeys[id]
    const def = HOTKEY_DEFAULTS[id]
    if (!cur || typeof cur !== 'object') {
      G.settings.hotkeys[id] = { ...def }
    } else {
      if (cur.key === undefined) cur.key = def.key
      if (cur.pad === undefined) cur.pad = def.pad
    }
  }
  return G.settings.hotkeys
}

export function getHotkey(action) {
  const def = HOTKEY_DEFAULTS[action] || { key: null, pad: null }
  const hk = G.settings?.hotkeys?.[action]
  return {
    key: hk && hk.key !== undefined ? hk.key : def.key,
    pad: hk && hk.pad !== undefined ? hk.pad : def.pad,
  }
}

export function setHotkey(action, patch) {
  if (!HOTKEY_DEFAULTS[action]) return false
  ensureHotkeys()
  const cur = G.settings.hotkeys[action]
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'key')) cur.key = patch.key || null
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'pad')) {
    const n = Number(patch.pad)
    cur.pad = Number.isFinite(n) && n >= 0 ? Math.round(n) : null
  }
  return true
}

export function resetHotkeys() {
  if (!G.settings) return
  G.settings.hotkeys = {}
  ensureHotkeys()
}
