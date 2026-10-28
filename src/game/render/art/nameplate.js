// BOSS 头顶名牌：Canvas 纹理 + 朝向相机不变的平面
import * as THREE from 'three'

const cache = new Map()

function hexColor(n) {
  return '#' + (Number(n) >>> 0).toString(16).padStart(6, '0').slice(-6)
}

/**
 * 生成（并缓存）一张 BOSS 名牌纹理。
 * 透明底、深色铭牌、主题色描边，中文名居中。
 * @param {string} name
 * @param {number} accent 0xRRGGBB
 * @returns {THREE.CanvasTexture|null}
 */
export function getNameplateTexture(name, accent = 0xd8b070) {
  const text = String(name || '').trim()
  if (!text) return null
  if (typeof document === 'undefined') return null
  const key = text + '|' + accent
  if (cache.has(key)) return cache.get(key)

  const W = 512
  const H = 88
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  let size = 34
  ctx.font = `700 ${size}px "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif`
  while (size > 20 && ctx.measureText(text).width > W - 120) {
    size -= 2
    ctx.font = `700 ${size}px "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif`
  }
  const tw = ctx.measureText(text).width
  const panelW = Math.min(W - 20, Math.max(240, tw + 84))
  const x0 = Math.round((W - panelW) / 2)
  const y0 = 14
  const h = 58
  const accentCss = hexColor(accent)

  // 底板 + 缺角
  ctx.fillStyle = 'rgba(5, 8, 9, 0.86)'
  ctx.fillRect(x0, y0, panelW, h)
  ctx.clearRect(x0 - 6, y0 - 6, 6, 6)
  ctx.clearRect(x0 + panelW, y0 + h, 6, 6)
  // 主题色描边
  ctx.strokeStyle = accentCss
  ctx.lineWidth = 2
  ctx.strokeRect(x0 + 1, y0 + 1, panelW - 2, h - 2)
  // 左侧标记块
  ctx.fillStyle = accentCss
  ctx.fillRect(x0 + 8, y0 + 12, 7, h - 24)
  ctx.fillRect(x0 + 8, y0 + 6, 22, 3)
  // 顶部小字
  ctx.font = '600 11px "Microsoft YaHei", monospace'
  ctx.fillStyle = 'rgba(220, 214, 200, 0.7)'
  ctx.textAlign = 'left'
  ctx.fillText('TARGET // 目标', x0 + 22, y0 + 16)

  // 名字
  ctx.font = `700 ${size}px "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
  ctx.fillText(text, W / 2 + 2, y0 + 35 + 2)
  ctx.fillStyle = '#f2ead8'
  ctx.fillText(text, W / 2, y0 + 35)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

/**
 * 给大型敌人挂名牌。名牌固定在头顶，不随朝向镜像。
 * 同时把血条抬到头顶下方，避免与名牌/地面重叠。
 * @param {object} m 已 initLarge 的大型敌人
 */
export function attachNameplate(m) {
  if (!m || !m.group || m.nameplate) return null
  const name = m.def?.name || m.def?.en || m.id
  const accent = Number.isFinite(m.def?.accent) ? m.def.accent : 0xd8b070
  const tex = getNameplateTexture(name, accent)
  if (!tex) return null
  try {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.95,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(270, 46.4), mat)
    mesh.renderOrder = 30
    mesh.frustumCulled = false
    m.group.add(mesh)
    m.nameplate = mesh

    const baseSync = typeof m.syncMesh === 'function' ? m.syncMesh.bind(m) : null
    m.syncMesh = () => {
      if (baseSync) baseSync()
      const b = m.body
      if (!b) return
      // 以实际立绘顶端为基准，避免按 body 高度估算导致名牌飘到屏幕外
      const spriteH = Math.max(m.spriteH || 0, m.h || 0)
      const meshY = Number.isFinite(m.mesh?.position?.y) ? m.mesh.position.y : -(b.y + b.h)
      const headTop = meshY + spriteH / 2
      const badgeY = headTop + 42
      mesh.position.set(b.x + b.w / 2, badgeY, 12)
      // 大型敌人血条放在名牌下方、头顶上方
      if (m.hpBg && m.hpBg.visible) {
        const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp))
        m.hpBg.position.set(b.x + b.w / 2, headTop + 8, 11)
        m.hpFg.position.set(b.x + b.w / 2 - (m.hpBarW * (1 - ratio)) / 2, headTop + 8, 11.1)
        m.hpFg.scale.x = Math.max(0.001, ratio)
      }
    }
    return mesh
  } catch (e) {
    return null
  }
}

export function clearNameplateCache() {
  for (const tex of cache.values()) {
    try {
      tex.dispose()
    } catch (e) {
      /* ignore */
    }
  }
  cache.clear()
}
