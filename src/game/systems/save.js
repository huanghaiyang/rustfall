import { SAVE_KEY, SETTINGS_KEY } from '../config.js'

/** v1 存档：机体、背包、装备、任务、同伴、档案、旗标、房间、天气状态、mod 开关 */
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch (e) {
    return null
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }))
    return true
  } catch (e) {
    return false
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch (e) {
    /* ignore */
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY)
  } catch (e) {
    return false
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch (e) {
    return {}
  }
}

export function saveSettings(patch) {
  try {
    const cur = loadSettings()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...cur, ...patch }))
    return true
  } catch (e) {
    return false
  }
}

const TERRAIN_KEY = 'rustfall.terrain.v1'

export function loadTerrainEdits() {
  try {
    return JSON.parse(localStorage.getItem(TERRAIN_KEY) || '{}')
  } catch (e) {
    return {}
  }
}
export function writeTerrainEdits(data) {
  try {
    localStorage.setItem(TERRAIN_KEY, JSON.stringify(data))
    return true
  } catch (e) {
    return false
  }
}
