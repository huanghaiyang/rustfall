// ============================================================================
// 锈雨 · RUSTFALL —— 精灵编辑器 → 运行时 桥（局部覆盖层）
// ----------------------------------------------------------------------------
// 精灵编辑器把工程整体写进 localStorage['rustfall.spriteeditor.v1']（sheet 的 src 是
// dataURL）。这里把它翻译成运行时能直接用的 THREE 帧纹理组，于是「编辑器里发布」
// 就能真的落到角色身上，不用重新 build，也不用往 public/ 里塞文件。
//
// 几个必须注意的点（都是踩过的坑）：
//   1. 帧矩形是「逻辑坐标」，sheet.scale 可能 ≠ 1 → offset/repeat 一律除以
//      sheet.width/height（逻辑尺寸），与物理像素无关。
//   2. THREE 纹理默认 flipY = true（v=0 在图片底部），所以帧的 y 要翻过来算。
//   3. 一个 sheet 只上传一次 GPU：所有帧都是同一张纹理的 clone，只差 offset/repeat。
//   4. localStorage 里是几 MB 的 base64，解析必须缓存：按 raw 字符串同一性命中，
//      发布时 invalidate。
// ============================================================================

import * as THREE from 'three'

const KEY = 'rustfall.spriteeditor.v1'

let _raw = null
let _project = null
const SHEET_TEX = new Map()

/** 解析缓存：raw 没变就不重复 JSON.parse。 */
function project() {
  let raw = null
  try {
    raw = localStorage.getItem(KEY)
  } catch (e) {
    return null
  }
  if (!raw) {
    _raw = null
    _project = null
    return null
  }
  if (raw === _raw) return _project
  _raw = raw
  try {
    const p = JSON.parse(raw)
    _project = p && Array.isArray(p.sprites) && Array.isArray(p.sheets) ? p : null
  } catch (e) {
    _project = null
  }
  return _project
}

/** 发布 / 导入工程后调用：丢掉解析缓存与纹理缓存。 */
export function invalidateEditorSprites() {
  _raw = null
  _project = null
  SHEET_TEX.clear()
}

/** 编辑器里是否有任何可用工程（调试 / UI 提示用）。 */
export function hasEditorProject() {
  return !!project()
}

/** 找到绑到该 refId 的、且至少有一个带帧的动作的 sprite。 */
export function editorSpriteFor(refId) {
  const p = project()
  if (!p || !refId) return null
  const key = String(refId)
  const sp = p.sprites.find(
    (s) => s && String(s.refId || '') === key && Array.isArray(s.actions) && s.actions.some((a) => a?.frames?.length),
  )
  if (!sp) return null
  const sheet = p.sheets.find((s) => s.id === sp.sheetId) || null
  return sheet ? { sprite: sp, sheet } : null
}

function sheetKey(sheet) {
  const src = String(sheet.src || '')
  return `${sheet.id}|${src.length}|${src.slice(0, 64)}|${src.slice(-64)}`
}

/** dataURL → 基础纹理（每个 sheet 只加载一次）。 */
function sheetTexture(sheet) {
  const key = sheetKey(sheet)
  const hit = SHEET_TEX.get(key)
  if (hit) return hit.promise
  const promise = new Promise((resolve) => {
    if (!sheet.src) {
      resolve(null)
      return
    }
    new THREE.TextureLoader().load(
      sheet.src,
      (tex) => {
        tex.magFilter = THREE.NearestFilter
        tex.minFilter = THREE.NearestFilter
        tex.generateMipmaps = false
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      () => resolve(null),
    )
  })
  SHEET_TEX.set(key, { promise })
  return promise
}

/** 单帧纹理：同一张 sheet 纹理的 clone，按帧矩形改 offset/repeat。 */
function frameTexture(base, frame, sheet) {
  const lw = Number(sheet.width) || Number(sheet.naturalW) || 0
  const lh = Number(sheet.height) || Number(sheet.naturalH) || 0
  const fw = Number(frame.w) || 0
  const fh = Number(frame.h) || 0
  if (!base || lw <= 0 || lh <= 0 || fw <= 0 || fh <= 0) return null
  const t = base.clone()
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  t.repeat.set(fw / lw, fh / lh)
  t.offset.set(Number(frame.x) / lw, 1 - (Number(frame.y) + fh) / lh)
  t.needsUpdate = true
  t.userData.cleanAlpha = true
  t.userData.png = true
  t.userData.fromEditor = true
  return t
}

/**
 * 拿某角色在编辑器里的动作帧：`{ walk: [tex…], run: [tex…] }`。
 * 没有绑定 / 没有帧 / 图加载失败 → null（调用方继续用磁盘图集）。
 */
export function editorFramesFor(refId) {
  const found = editorSpriteFor(refId)
  if (!found) return Promise.resolve(null)
  const { sprite, sheet } = found
  return sheetTexture(sheet).then((base) => {
    if (!base) return null
    const out = {}
    for (const act of sprite.actions || []) {
      const name = String(act?.name || '').trim()
      if (!name) continue
      const list = []
      for (const f of act.frames || []) {
        const t = frameTexture(base, f, sheet)
        if (t) list.push(t)
      }
      if (list.length) out[name] = list
    }
    return Object.keys(out).length ? out : null
  })
}

/** sprite 声明的角色尺寸（编辑器里 sprite.w/h 就是命中框）——只画不接图集时兜底用。 */
export function editorSpriteSize(refId) {
  const found = editorSpriteFor(refId)
  if (!found) return null
  const w = Number(found.sprite.w) || 0
  const h = Number(found.sprite.h) || 0
  return w > 0 && h > 0 ? { w, h } : null
}

/**
 * 编辑器里编排的播放速度：`{ walk: 11, run: 11 }`。
 * 动作的 fps 是编辑器里的可编排项，所以让它压过磁盘图集里的 fps 表。
 */
export function editorFpsFor(refId) {
  const found = editorSpriteFor(refId)
  if (!found) return null
  const out = {}
  for (const act of found.sprite.actions || []) {
    const name = String(act?.name || '').trim()
    const fps = Number(act?.fps)
    if (name && fps > 0) out[name] = fps
  }
  return Object.keys(out).length ? out : null
}
