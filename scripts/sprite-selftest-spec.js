;(async () => {
  const E = window.__spriteEditor
  const S = E.SE
  // 等待注册表加载（异步 import）
  for (let i = 0; i < 40 && S.project.sheets.length === 0; i++) await new Promise((r) => setTimeout(r, 30))
  // 额外等待 registry
  for (let i = 0; i < 30 && (E.ROLE_LIST?.length || 0) === 0; i++) await new Promise((r) => setTimeout(r, 100))
  await new Promise((r) => setTimeout(r, 50))

  const out = {}
  const step = (k, fn) => { try { out[k] = fn() } catch (e) { out[k] = 'ERR:' + e.message } }

  // 0. 初始状态
  step('rolesLoaded', () => (E.ROLE_LIST || []).length)
  step('monstersLoaded', () => (E.MONSTER_LIST || []).length)
  step('families', () => (E.SPRITE_FAMILIES || []).map((f) => f.id))
  step('hasSheet', () => S.project.sheets.length > 0)
  const sheetId = S.project.sheets[0]?.id

  // 1. 新建角色 sprite 绑定 refId='unit7' 并自动套用模板
  step('makeRole', () => {
    const sp = E.addSprite(sheetId, { x: 0, y: 0 }, {
      kind: 'role', refId: 'unit7', autoBones: true, autoShapes: true,
    })
    if (!sp) return null
    return {
      id: sp.id, kind: sp.kind, refId: sp.refId, family: sp.family,
      name: sp.name, w: sp.w, h: sp.h,
      bones: sp.bones.length, shapes: sp.shapes.length,
      boneNames: sp.bones.map((b) => b.name),
      parentsFirst3: sp.bones.slice(0, 3).map((b) => ({ name: b.name, parent: b.parent })),
    }
  })

  // 2. 切换 family
  step('changeFamily', () => {
    const sp = S.project.sprites[0]
    sp.family = 'quad'
    return E.applyFamilyBones(sp, 'quad', { replace: true }) + E.applyFamilyShapes(sp, 'quad', { replace: true })
  })
  step('quadResult', () => {
    const sp = S.project.sprites[0]
    return { family: sp.family, bones: sp.bones.length, boneNames: sp.bones.map((b) => b.name), shapes: sp.shapes.length }
  })

  // 3. 新建 boss 怪物 sprite
  step('makeBossMonster', () => {
    const sp = E.addSprite(sheetId, { x: 0, y: 0 }, {
      kind: 'monster', refId: 'alien_orb', autoBones: true, autoShapes: true,
    })
    if (!sp) return null
    return {
      id: sp.id, kind: sp.kind, refId: sp.refId, family: sp.family,
      name: sp.name, bones: sp.bones.length, shapes: sp.shapes.length,
    }
  })

  // 4. 按 kind 过滤
  step('filterRoles', () => E.filteredSprites('role').length)
  step('filterMonsters', () => E.filteredSprites('monster').length)
  step('filterAll', () => E.filteredSprites('all').length)

  // 5. setSpriteRef 自动猜 family + 尺寸
  step('setRefAuto', () => {
    const sp = S.project.sprites[S.project.sprites.length - 1]
    sp.kind = 'role'; sp.refId = 'tesla'
    E.setSpriteRef({ kind: 'role', refId: 'tesla' })
    return { kind: sp.kind, refId: sp.refId, family: sp.family, w: sp.w, h: sp.h, name: sp.name }
  })

  // 6. 持久化（含 kind/family/refId）
  step('persist', () => {
    E.saveProject()
    const raw = localStorage.getItem('rustfall.spriteeditor.v1')
    const parsed = JSON.parse(raw)
    const sp = parsed.sprites[0]
    return {
      len: raw.length,
      spriteKind: sp.kind, spriteRef: sp.refId, spriteFamily: sp.family,
      spriteBones: sp.bones.length,
      sheets: parsed.sheets.length,
    }
  })

  // 7. registry load
  step('registryRoleFirst', () => E.ROLE_LIST[0]?.id)
  step('registryMonsterFirst', () => E.MONSTER_LIST[0]?.id)

  return JSON.stringify(out)
})()
