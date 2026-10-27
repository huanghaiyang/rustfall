// 输入映射：键盘 + 鼠标 + Xbox / 通用手柄
import { G } from './state.js'
import { GAMEPAD } from './config.js'

const ACTIONS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  attack: ['KeyJ', 'KeyK'],
  interact: ['KeyE', 'Enter'],
  reload: ['KeyR'],
  tool1: ['Digit1'],
  tool2: ['Digit2'],
  tool3: ['Digit3'],
  tool4: ['Digit4'],
  weaponPrev: ['BracketLeft'],
  weaponNext: ['BracketRight'],
  chassis: ['KeyQ'],
  inventory: ['KeyI', 'Tab'],
  quests: ['KeyL'],
  archive: ['KeyC'],
  companions: ['KeyR'],
  mods: ['KeyO'],
  settings: ['F2'],
  help: ['KeyH', 'Slash'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  map: ['KeyN'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  scan: ['KeyF'],
}
const BLOCK_DEFAULT = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'Tab',
  'Slash',
  'F2',
])

// 标准 Xbox 布局（navigator.getGamepads 的 standard mapping）
const PAD_BUTTONS = {
  0: 'jump', // A
  1: 'interact', // B
  2: 'attack', // X
  3: 'chassis', // Y
  4: 'weaponPrev', // LB
  5: 'weaponNext', // RB
  6: 'reload', // LT 也当攻击辅助（下面按扳机值处理）
  7: 'attack', // RT
  8: 'inventory', // Back / View
  9: 'pause', // Start / Menu
  10: 'sprint', // L3
  11: 'scan', // R3
  12: 'quests', // 十字键上
  13: 'down', // 十字键下
  14: 'weaponPrev', // 十字键左
  15: 'weaponNext', // 十字键右
}

export class Input {
  constructor(target = window) {
    this.target = target
    this.down = new Set()
    this.pressed = new Set()
    this.released = new Set()
    this.mouse = { x: 0, y: 0, down: false, pressed: false }
    this.pad = {
      index: -1,
      id: '',
      connected: false,
      down: new Set(),
      pressed: new Set(),
      released: new Set(),
      axes: [0, 0, 0, 0],
      prevAxes: [0, 0, 0, 0],
      triggerL: 0,
      triggerR: 0,
      deadzone: GAMEPAD.deadzone,
      lastActive: 0,
    }

    this._onDown = (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault()
      if (e.repeat) return
      this.down.add(e.code)
      this.pressed.add(e.code)
    }
    this._onUp = (e) => {
      this.down.delete(e.code)
      this.released.add(e.code)
    }
    this._onBlur = () => {
      this.down.clear()
      this.mouse.down = false
    }
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        this.mouse.down = true
        this.mouse.pressed = true
      }
    }
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.down = false
    }
    this._onMouseMove = (e) => {
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
    }
    this._onConnected = (e) => {
      this.pad.index = e.gamepad.index
      this.pad.connected = true
      this.pad.id = e.gamepad.id
      this.syncPadState()
    }
    this._onDisconnected = () => {
      this.pad.connected = false
      this.pad.index = -1
      this.pad.id = ''
      this.pad.down.clear()
      this.syncPadState()
    }

    target.addEventListener('keydown', this._onDown, { passive: false })
    target.addEventListener('keyup', this._onUp)
    target.addEventListener('blur', this._onBlur)
    target.addEventListener('mousedown', this._onMouseDown, { passive: true })
    target.addEventListener('mouseup', this._onMouseUp)
    target.addEventListener('mousemove', this._onMouseMove, { passive: true })
    target.addEventListener('gamepadconnected', this._onConnected)
    target.addEventListener('gamepaddisconnected', this._onDisconnected)
  }

  // ---------------------------------------------------------------- 手柄
  pollGamepad(dt = 0.016) {
    if (!G.settings?.gamepad || typeof navigator === 'undefined' || !navigator.getGamepads) return
    const pads = navigator.getGamepads()
    let pad = null
    if (this.pad.index >= 0 && pads[this.pad.index]) pad = pads[this.pad.index]
    else {
      for (const p of pads) {
        if (p && p.connected) {
          pad = p
          break
        }
      }
    }
    const prevDown = this.pad.down
    const nextDown = new Set()
    const pressed = new Set()
    const released = new Set()

    if (!pad) {
      if (this.pad.connected) {
        this.pad.connected = false
        this.pad.index = -1
        this.pad.id = ''
        this.syncPadState()
      }
      this.pad.down = nextDown
      return
    }

    if (!this.pad.connected) {
      this.pad.connected = true
      this.pad.index = pad.index
      this.pad.id = pad.id || 'Gamepad'
    }

    const dz = this.pad.deadzone
    const ax = pad.axes || []
    const lx = this._dz(ax[0] || 0, dz)
    const ly = this._dz(ax[1] || 0, dz)
    const rx = this._dz(ax[2] || 0, dz)
    const ry = this._dz(ax[3] || 0, dz)
    this.pad.axes = [lx, ly, rx, ry]
    this.pad.triggerL = pad.buttons?.[6]?.value || 0
    this.pad.triggerR = pad.buttons?.[7]?.value || 0

    if (Math.abs(lx) > 0.35) nextDown.add(lx > 0 ? 'right' : 'left')
    if (Math.abs(ly) > 0.45) nextDown.add(ly > 0 ? 'down' : 'up')
    if (this.pad.triggerR > GAMEPAD.triggerDeadzone) nextDown.add('attack')
    if (this.pad.triggerL > GAMEPAD.triggerDeadzone) nextDown.add('reload')

    for (const [idx, action] of Object.entries(PAD_BUTTONS)) {
      const btn = pad.buttons?.[Number(idx)]
      if (!btn) continue
      const isDown = !!btn.pressed || (btn.value ?? 0) > 0.5
      if (!isDown) continue
      nextDown.add(action)
    }

    for (const a of nextDown) if (!prevDown.has(a)) pressed.add(a)
    for (const a of prevDown) if (!nextDown.has(a)) released.add(a)
    if (pressed.size) this.pad.lastActive = performance.now()

    this.pad.pressed = pressed
    this.pad.released = released
    this.pad.down = nextDown
    this.syncPadState()
  }

  _dz(v, dz) {
    const a = Math.abs(v)
    if (a < dz) return 0
    return Math.sign(v) * ((a - dz) / (1 - dz))
  }

  syncPadState() {
    if (!G.gamepad) return
    G.gamepad.connected = this.pad.connected
    G.gamepad.id = this.pad.id
    G.gamepad.axes = this.pad.axes.slice(0, 2)
    G.gamepad.buttons = this.pad.down.size
  }

  /** 手柄瞄准方向（右摇杆），没有输入时返回 null */
  aimVector() {
    const [rx, ry] = this.pad.axes
    if (Math.abs(rx) < 0.3 && Math.abs(ry) < 0.3) return null
    const len = Math.hypot(rx, ry) || 1
    return { x: rx / len, y: ry / len }
  }

  usingGamepad() {
    return this.pad.connected && performance.now() - this.pad.lastActive < 2500
  }

  // ---------------------------------------------------------------- 查询
  isDown(action) {
    if (this.pad.down.has(action)) return true
    const keys = ACTIONS[action]
    if (!keys) return false
    for (const k of keys) if (this.down.has(k)) return true
    if (action === 'attack' && this.mouse.down) return true
    return false
  }
  wasPressed(action) {
    if (this.pad.pressed.has(action)) return true
    const keys = ACTIONS[action]
    if (!keys) return false
    for (const k of keys) if (this.pressed.has(k)) return true
    if (action === 'attack' && this.mouse.pressed) return true
    return false
  }
  wasReleased(action) {
    if (this.pad.released.has(action)) return true
    const keys = ACTIONS[action]
    if (!keys) return false
    for (const k of keys) if (this.released.has(k)) return true
    return false
  }
  axisX() {
    if (this.pad.connected) {
      const a = this.pad.axes[0]
      if (Math.abs(a) > 0.35) return Math.sign(a)
    }
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0)
  }
  axisY() {
    if (this.pad.connected) {
      const a = this.pad.axes[1]
      if (Math.abs(a) > 0.45) return Math.sign(a)
    }
    return (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0)
  }

  rumble(strong = 0.35, weak = 0.2, ms = GAMEPAD.rumbleMs) {
    if (!G.settings?.rumble) return
    try {
      const pad = navigator.getGamepads?.()[this.pad.index]
      const act = pad?.vibrationActuator
      if (act?.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })
    } catch (e) {
      /* 不支持震动 */
    }
  }

  endFrame() {
    this.pressed.clear()
    this.released.clear()
    this.mouse.pressed = false
    this.pad.pressed.clear()
    this.pad.released.clear()
  }

  detach() {
    this.target.removeEventListener('keydown', this._onDown)
    this.target.removeEventListener('keyup', this._onUp)
    this.target.removeEventListener('blur', this._onBlur)
    this.target.removeEventListener('mousedown', this._onMouseDown)
    this.target.removeEventListener('mouseup', this._onMouseUp)
    this.target.removeEventListener('mousemove', this._onMouseMove)
    this.target.removeEventListener('gamepadconnected', this._onConnected)
    this.target.removeEventListener('gamepaddisconnected', this._onDisconnected)
  }
}
