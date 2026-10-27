// 一次性修补脚本：把角色/怪物/战利品的精灵材质换成 alphaTest 硬边材质
import fs from 'node:fs'

function patch(file, marker, replacement, ensureImport) {
  let src = fs.readFileSync(file, 'utf8')
  const before = src
  if (!src.includes(marker)) {
    console.log(`SKIP (marker not found): ${file}`)
  } else {
    src = src.replace(marker, replacement)
  }
  if (ensureImport && !src.includes("render/materials.js")) {
    src = src.replace(/^import \* as THREE from 'three'$/m, `import * as THREE from 'three'\n${ensureImport}`)
  }
  fs.writeFileSync(file, src)
  console.log(`${file}: ${before === src ? 'unchanged' : 'patched'}`)
}

patch(
  'src/game/entities/monsters/base.js',
  `    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: tex ? 0xffffff : this.def.color || 0x8a4b26,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })`,
  `    const mat = spriteMaterial(tex, { color: tex ? 0xffffff : this.def.color || 0x8a4b26 })`,
  `import { spriteMaterial } from '../../render/materials.js'`,
)

patch(
  'src/game/entities/monsters/base.js',
  `    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: tex ? 0xffffff : this.def.color || 0x8a4b26,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    })`,
  `    const mat = spriteMaterial(tex, { color: tex ? 0xffffff : this.def.color || 0x8a4b26 })`,
  null,
)

patch(
  'src/game/loot/world-items.js',
  `    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      color: this.hidden || this.buried ? 0x40382c : 0xffffff,
    })`,
  `    const mat = spriteMaterial(tex, { color: this.hidden || this.buried ? 0x40382c : 0xffffff })`,
  `import { spriteMaterial } from '../render/materials.js'`,
)

// room.js：构造末尾统一补硬边（跳过 additive 光晕）
{
  const file = 'src/game/world/room.js'
  let src = fs.readFileSync(file, 'utf8')
  if (!src.includes("render/materials.js")) {
    src = src.replace(
      /^import \* as THREE from 'three'$/m,
      `import * as THREE from 'three'\nimport { fixSpriteMesh } from '../render/materials.js'`,
    )
  }
  if (!src.includes('fixRoomSprites')) {
    src = src.replace(
      /    this\.group\.position\.z = 0\n    this\.game\.scene\.add\(this\.group\)/,
      `    this.group.position.z = 0
    this.fixRoomSprites()
    this.game.scene.add(this.group)`,
    )
    src = src.replace(
      /  \/\/ ---------------------------------------------------------------- 背景/,
      `  /** 房间里所有普通精灵统一硬边（光晕/加色层跳过） */
  fixRoomSprites() {
    this.group.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.map) return
      if (o.material.blending === THREE.AdditiveBlending) return
      fixSpriteMesh(o)
    })
  }

  // ---------------------------------------------------------------- 背景`,
    )
  }
  fs.writeFileSync(file, src)
  console.log(`${file}: patched fixRoomSprites=${src.includes('fixRoomSprites')}`)
}
