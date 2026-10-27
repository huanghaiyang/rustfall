// 一次性给 Robot 打动画/武器补丁
import fs from 'node:fs'
const f = 'src/game/entities/robot.js'
let s = fs.readFileSync(f, 'utf8')
const log = (name, ok) => console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`)

function rep(name, from, to) {
  if (!s.includes(from)) return log(name, false)
  s = s.replace(from, to)
  log(name, true)
}

// 1. 构造字段
rep(
  'fields',
  `    this.attackCd = 0
    this.swingT = 0`,
  `    this.attackCd = 0
    this.swingT = 0
    this.landT = 0
    this.attackT = 0
    this.shootT = 0
    this.hurtT = 0
    this.deadT = 0
    this.heldWeapon = null
    this.weaponMesh = null`,
)

// 2. 计时器
rep(
  'timers',
  `    this.invuln = Math.max(0, this.invuln - dt)`,
  `    this.invuln = Math.max(0, this.invuln - dt)
    this.landT = Math.max(0, this.landT - dt)
    this.attackT = Math.max(0, this.attackT - dt)
    this.shootT = Math.max(0, this.shootT - dt)
    this.hurtT = Math.max(0, this.hurtT - dt)
    if (this.dead) this.deadT += dt
    const wid = this.game.weapons ? this.game.weapons.currentId() : null
    if (wid !== this.heldWeapon) this.setHeldWeapon(wid)`,
)

// 3. 落地计时
rep(
  'landTimer',
  `    if (b.onGround && !this.wasGround) {
      this.squash = 0.78`,
  `    if (b.onGround && !this.wasGround) {
      this.squash = 0.78
      this.landT = 0.24`,
)

// 4. 攻击入口
rep(
  'attackEntry',
  `      this.attack()
    }`,
  `      this.tryAttack()
    }`,
)

// 5. 受伤计时
rep(
  'hurtTimer',
  `  applyDamage(n, fromX = null, reason = null) {
    if (this.dead || this.invuln > 0) return`,
  `  applyDamage(n, fromX = null, reason = null) {
    if (this.dead || this.invuln > 0) return
    this.hurtT = 0.34`,
)

// 6. 插入 tryAttack / setHeldWeapon
const insertBefore = `  attack() {
    const tool = this.tool`
const methods = `  /** 有武器先开火，没武器/没弹药再用工具 */
  tryAttack() {
    const w = this.game.weapons
    if (w && w.hasWeapon && w.hasWeapon()) {
      const res = w.fire()
      if (res && res.ok) {
        this.shootT = 0.18
        this.attackT = 0.22
        this.attackCd = 0.08
        this.game.cameraShake?.(0.05)
        return true
      }
      if (res && res.reason && this.game.input.wasPressed && this.game.input.wasPressed('attack')) {
        this.game.showHint?.(res.reason, 1.6)
      }
      this.attackCd = 0.22
      return false
    }
    this.attack()
    this.attackT = 0.24
    return true
  }

  setHeldWeapon(id) {
    this.heldWeapon = id || null
    if (this.weaponMesh) {
      this.group.remove(this.weaponMesh)
      this.weaponMesh.geometry.dispose()
      this.weaponMesh.material.dispose()
      this.weaponMesh = null
    }
    if (!id) return
    let tex = null
    try {
      tex = getWeaponHoldArt(id)
    } catch (e) {
      tex = null
    }
    if (!tex) {
      try {
        tex = getWeaponArt(id)
      } catch (e) {
        tex = null
      }
    }
    if (!tex) return
    const mat = spriteMaterial(tex)
    const w = tex.image?.width || 32
    const h = tex.image?.height || 24
    this.weaponMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    this.weaponMesh.position.z = 3
    this.weaponMesh.renderOrder = 6
    this.group.add(this.weaponMesh)
  }

  attack() {
    const tool = this.tool`
rep('methods', insertBefore, methods)

// 7. 重写 updateAnim
const animStart = s.indexOf('  updateAnim(dt) {')
const animEnd = s.indexOf('  syncMesh(dt) {')
if (animStart > 0 && animEnd > animStart) {
  const newAnim = `  updateAnim(dt) {
    const b = this.body
    const frames = this.art?.frames || {}
    const armed = !!this.heldWeapon
    let name = 'idle'
    if (this.dead) name = 'dead'
    else if (this.hurtT > 0) name = 'hurt'
    else if (this.shootT > 0) name = 'shoot'
    else if (this.attackT > 0) name = 'attack'
    else if (this.swingT > 0) name = 'dig'
    else if (this.swim) name = 'swim'
    else if (this.climbing || this.wallSliding) name = 'climb'
    else if (!b.onGround) name = b.vy < 0 ? (this.jumpsLeft < this.maxJumps ? 'jump2' : 'jump') : 'fall'
    else if (this.landT > 0) name = 'land'
    else if (this.crouching) name = 'crouch'
    else if (Math.abs(b.vx) > 22) name = 'run'
    else if (armed) name = 'hold'

    // 缺帧回退链，保证任何美术缺帧都不会卡住
    const chain = {
      dead: ['dead', 'hurt', 'idle'],
      hurt: ['hurt', 'idle'],
      shoot: ['shoot', 'attack', 'idle'],
      attack: ['attack', 'dig', 'idle'],
      hold: ['hold', 'idle'],
      dig: ['dig', 'attack', 'idle'],
      swim: ['swim', 'run', 'idle'],
      climb: ['climb', 'run', 'idle'],
      jump2: ['jump2', 'jump', 'fall'],
      jump: ['jump', 'fall', 'idle'],
      fall: ['fall', 'jump', 'idle'],
      land: ['land', 'crouch', 'idle'],
      crouch: ['crouch', 'idle'],
      run: ['run', 'idle'],
    }
    if (!frames[name]) {
      for (const cand of chain[name] || ['idle']) {
        if (frames[cand]) {
          name = cand
          break
        }
      }
    }
    if (this.animName !== name) this.setAnim(name)

    const fps = {
      idle: 4,
      run: 14,
      jump: 2,
      jump2: 2,
      fall: 2,
      land: 24,
      crouch: 2,
      dig: 8,
      attack: 14,
      shoot: 16,
      hold: 3,
      swim: 8,
      climb: 9,
      hurt: 6,
      dead: 4,
    }[name] || 4
    this.animT += dt * fps
    const count = Array.isArray(frames[name]) ? frames[name].length : 1
    this.frame = name === 'land' ? Math.min(count - 1, Math.floor((1 - this.landT / 0.24) * count)) : this.animT
    this.applyFrame()
    this.squash += (1 - this.squash) * Math.min(1, dt * 14)
  }

`
  s = s.slice(0, animStart) + newAnim + s.slice(animEnd)
  log('updateAnim', true)
} else log('updateAnim', false)

// 8. syncMesh：武器跟随手部
if (!s.includes('weaponMesh.position.x')) {
  s = s.replace(
    `    if (this.glow) {`,
    `    if (this.weaponMesh) {
      this.weaponMesh.position.x = b.x + b.w / 2 + this.facing * (b.w * 0.34)
      this.weaponMesh.position.y = -(b.y + b.h * 0.62)
      this.weaponMesh.scale.x = this.facing
      this.weaponMesh.rotation.z = this.facing * (this.shootT > 0 ? 0.16 : 0)
      this.weaponMesh.visible = !this.dead
    }
    if (this.glow) {`,
  )
  log('syncMeshWeapon', true)
} else log('syncMeshWeapon', true)

// 9. 导入武器贴图
if (!s.includes('getWeaponHoldArt')) {
  s = s.replace(
    `import { spriteMaterial } from '../render/materials.js'`,
    `import { spriteMaterial } from '../render/materials.js'
import { getWeaponArt, getWeaponHoldArt } from '../render/art/weapons.js'`,
  )
  log('imports', true)
} else log('imports', true)

fs.writeFileSync(f, s)
console.log('written', f)
