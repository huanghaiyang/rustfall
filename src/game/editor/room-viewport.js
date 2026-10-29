// ============================================================================
// 房间编辑器 · 画布视口
// ----------------------------------------------------------------------------
// 纯 Canvas2D 实现（不依赖 Vue），负责：
//   · 绘制地形网格（8 种 tile 按类型着色）
//   · 绘制道具（用 getPropArt 的贴图画布，缩放到格子）
//   · 绘制门洞 / 出生点 / 庇护所 / 怪物 / 掉落标记
//   · 指针交互：涂地形、擦地形、放道具、删道具
//
// 坐标系：屏幕(css px) ↔ 房间格子(x,y)。缩放平移由 RE.view.zoom / panX / panY 控制。
// ============================================================================

import { RE, setTile, eraseTile, addProp, removeProp, bgLayers, currentBgLayer, setBgImage } from './room-store.js'
import { T } from '../world/tilemap.js'
import { TS } from '../config.js'
import { getPropArt } from '../render/art/props.js'

const C = {
  bg: '#080a0c',
  grid: 'rgba(120, 140, 150, 0.10)',
  hover: '#f2b34a',
  hoverFill: 'rgba(242, 179, 74, 0.18)',
  propFallback: '#6ff0d0',
  door: '#c6e05a',
  spawn: '#ffb03a',
  shelter: '#8fc4ff',
  monster: '#ff5644',
  loot: '#f2b34a',
  label: '#d8cfba',
  dim: 'rgba(216, 207, 186, 0.5)',
}

export class RoomViewport {
  constructor(canvas, onChange) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onChange = onChange || (() => {})
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = 0
    this.h = 0
    this.hover = null
    this.drag = null
    this.artCache = new Map()
    this.bgImgCache = new Map() // dataURL -> { img, ready }
    this.bgTintCache = new Map() // dataURL|tint -> canvas

    this._onResize = () => this.resize()
    this._onDown = (e) => this.pointerDown(e)
    this._onMove = (e) => this.pointerMove(e)
    this._onUp = () => this.pointerUp()
    this._onWheel = (e) => this.wheel(e)
    this._onCtx = (e) => e.preventDefault()
    this._onScroll = () => this.syncRect()

    // 渲染节流：pointermove / wheel 一帧最多重绘一次
    this._rafId = 0
    // 画布屏幕矩形缓存（避免每次 pointermove 触发 getBoundingClientRect 强制重排）
    this._rect = { left: 0, top: 0, width: 1, height: 1 }
    // 地形离屏缓存（整间房预渲染成一张图，平移时一次 blit）
    this._terrain = null

    canvas.addEventListener('pointerdown', this._onDown)
    canvas.addEventListener('pointermove', this._onMove)
    window.addEventListener('pointerup', this._onUp)
    canvas.addEventListener('wheel', this._onWheel, { passive: false })
    canvas.addEventListener('contextmenu', this._onCtx)
    window.addEventListener('resize', this._onResize)
    window.addEventListener('scroll', this._onScroll, true)
    this.resize()
  }

  dispose() {
    const c = this.canvas
    c.removeEventListener('pointerdown', this._onDown)
    c.removeEventListener('pointermove', this._onMove)
    window.removeEventListener('pointerup', this._onUp)
    c.removeEventListener('wheel', this._onWheel)
    c.removeEventListener('contextmenu', this._onCtx)
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('scroll', this._onScroll, true)
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = 0
    }
    this._terrain = null
  }

  /** 刷新缓存的画布屏幕矩形 */
  syncRect() {
    const r = this.canvas.getBoundingClientRect()
    this._rect = { left: r.left, top: r.top, width: r.width, height: r.height }
    return this._rect
  }

  resize() {
    const c = this.canvas
    this.syncRect()
    this.w = Math.max(1, Math.round(this._rect.width))
    this.h = Math.max(1, Math.round(this._rect.height))
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(this.w * this.dpr)
    c.height = Math.round(this.h * this.dpr)
    this.render()
  }

  // ------------------------------------------------------------ 坐标换算
  /** 屏幕 css 坐标 → 房间格子坐标 */
  toTile(cx, cy) {
    const v = RE.view
    return { x: Math.floor((cx - v.panX) / v.zoom), y: Math.floor((cy - v.panY) / v.zoom) }
  }

  /** 房间格子坐标 → 屏幕 css 坐标 */
  toScreen(tx, ty) {
    const v = RE.view
    return { x: tx * v.zoom + v.panX, y: ty * v.zoom + v.panY }
  }

  // ------------------------------------------------------------ 视图控制
  /** 以视口中心为锚点缩放 */
  zoomTo(factor) {
    const v = RE.view
    const nz = Math.max(1, Math.min(24, v.zoom * factor))
    const k = nz / v.zoom
    v.panX = this.w / 2 - (this.w / 2 - v.panX) * k
    v.panY = this.h / 2 - (this.h / 2 - v.panY) * k
    v.zoom = nz
    this.render()
  }

  /** 缩放到刚好装下整间房 */
  zoomToFit() {
    const gen = RE.gen
    if (!gen) return
    const z = Math.max(1, Math.min(24, Math.floor(Math.min(this.w / gen.w, this.h / gen.h))))
    RE.view.zoom = z
    RE.view.panX = Math.round((this.w - gen.w * z) / 2)
    RE.view.panY = Math.round((this.h - gen.h * z) / 2)
    this.render()
  }

  // ------------------------------------------------------------ 指针
  pointerDown(e) {
    try {
      this.canvas.setPointerCapture?.(e.pointerId)
    } catch (err) {
      /* 指针已释放时 setPointerCapture 会抛异常，不能中断后续处理 */
    }
    const rect = this.syncRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const t = this.toTile(cx, cy)
    const gen = RE.gen
    if (!gen) return

    // 中键 / Alt 拖拽 = 平移视图
    if (e.button === 1 || e.altKey) {
      // 阻止中键自带的自动滚动 / 拖拽手势
      e.preventDefault()
      this.drag = { mode: 'pan', sx: cx, sy: cy, panX: RE.view.panX, panY: RE.view.panY }
      return
    }

    const tool = RE.sel.tool
    if (tool === 'bg') {
      // 背景层工具：点中图像则选中并拖动（按数组尾→头，先选最上层）
      const hit = this.bgImageAt(cx, cy)
      if (hit) {
        RE.sel.bgLayerId = hit.id
        this.drag = { mode: 'bgmove', id: hit.id, sx: cx, sy: cy, x0: hit.img.x, y0: hit.img.y }
      } else {
        RE.sel.bgLayerId = ''
      }
      this.render()
      return
    }
    if (tool === 'tile') {
      if (e.button === 2) {
        this.drag = { mode: 'erase' }
        eraseTile(t.x, t.y)
      } else {
        this.drag = { mode: 'paint', type: RE.sel.tile }
        setTile(t.x, t.y, RE.sel.tile)
      }
    } else if (tool === 'prop') {
      if (e.button === 2) {
        const p = this.propAt(gen, t.x, t.y)
        if (p) removeProp(p)
      } else if (RE.sel.propKind) {
        addProp(RE.sel.propKind, t.x, t.y)
      }
    } else {
      this.onChange({ type: 'inspect', tile: t })
    }
    this.render()
  }

  pointerMove(e) {
    const rect = this._rect
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const t = this.toTile(cx, cy)
    const prev = this.hover
    this.hover = t
    if (this.drag) {
      if (this.drag.mode === 'paint') setTile(t.x, t.y, this.drag.type)
      else if (this.drag.mode === 'erase') eraseTile(t.x, t.y)
      else if (this.drag.mode === 'pan') {
        RE.view.panX = this.drag.panX + (cx - this.drag.sx)
        RE.view.panY = this.drag.panY + (cy - this.drag.sy)
      } else if (this.drag.mode === 'bgmove') {
        const z = RE.view.zoom
        setBgImage(this.drag.id, {
          x: this.drag.x0 + (cx - this.drag.sx) / z,
          y: this.drag.y0 + (cy - this.drag.sy) / z,
        })
      }
    }
    if (!prev || prev.x !== t.x || prev.y !== t.y || this.drag?.mode === 'bgmove') this.requestRender()
  }

  pointerUp() {
    if (this.drag) {
      this.drag = null
      this.onChange({ type: 'commit' })
    }
  }

  /** 滚轮：默认直接缩放（无需按 Ctrl），以光标为锚点；不再用滚轮平移画布 */
  wheel(e) {
    e.preventDefault()
    // 纯横向滚动（触控板左右滑）不做任何事：既不缩放也不平移
    if (!e.deltaY) return
    const rect = this._rect
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const v = RE.view
    const nz = Math.max(1, Math.min(24, v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
    if (nz === v.zoom) return
    const k = nz / v.zoom
    v.panX = cx - (cx - v.panX) * k
    v.panY = cy - (cy - v.panY) * k
    v.zoom = nz
    this.requestRender()
  }

  /** 找到某格上的道具 */
  propAt(gen, tx, ty) {
    if (!gen?.props?.length) return null
    for (let i = gen.props.length - 1; i >= 0; i--) {
      const p = gen.props[i]
      if (Math.floor(p.x / TS) === tx && Math.floor(p.y / TS) === ty) return p
    }
    return null
  }

  // ------------------------------------------------------------ 背景层
  /** 背景层图像的屏幕矩形（css px），img.x/y 为 tile 单位、表示图像中心 */
  bgImageRect(layer) {
    const img = layer.img
    if (!img) return null
    const z = RE.view.zoom
    const k = (z / TS) * (img.scale || 1)
    const dw = (img.w || 1) * k
    const dh = (img.h || 1) * k
    const cx = img.x * z + RE.view.panX
    const cy = img.y * z + RE.view.panY + (layer.yOff || 0) * (z / TS)
    return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh, cx, cy }
  }

  /** 命中测试（数组尾 = 最上层，优先命中） */
  bgImageAt(cx, cy) {
    const layers = bgLayers.value
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]
      const r = this.bgImageRect(l)
      if (r && cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return l
    }
    return null
  }

  /** dataURL 图像（懒加载 + 缓存，加载完成后自动重绘） */
  bgImg(src) {
    let entry = this.bgImgCache.get(src)
    if (!entry) {
      entry = { img: new Image(), ready: false }
      entry.img.onload = () => {
        entry.ready = true
        this.render()
      }
      entry.img.src = src
      this.bgImgCache.set(src, entry)
    }
    return entry
  }

  /** 染色版本（source-atop 只染图像像素，缓存到离屏画布） */
  bgImgTinted(src, tint) {
    if (!tint || tint === '#ffffff') return null
    const key = `${src}|${tint}`
    let canvas = this.bgTintCache.get(key)
    if (canvas) return canvas
    const entry = this.bgImg(src)
    if (!entry.ready) return null
    const img = entry.img
    canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const c = canvas.getContext('2d')
    c.drawImage(img, 0, 0)
    c.globalCompositeOperation = 'multiply'
    c.fillStyle = tint
    c.fillRect(0, 0, canvas.width, canvas.height)
    // multiply 会把透明区染成纯色，再用 destination-in 按原图 alpha 裁回
    c.globalCompositeOperation = 'destination-in'
    c.drawImage(img, 0, 0)
    this.bgTintCache.set(key, canvas)
    return canvas
  }

  // ------------------------------------------------------------ 绘制
  /** 合并同一帧内的多次重绘请求（pointermove / wheel 高频触发时只画一次） */
  requestRender() {
    if (this._rafId) return
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0
      this.render()
    })
  }

  /** 地图内容哈希：地形被改动后据此失效离屏缓存 */
  mapHash(map) {
    const d = map.data
    let h = 2166136261 >>> 0
    for (let i = 0; i < d.length; i++) {
      h = (h ^ d[i]) >>> 0
      h = Math.imul(h, 16777619) >>> 0
    }
    return h
  }

  /**
   * 地形离屏层：把整间房的地形预渲染成一张图（按颜色批量成路径一次填充），
   * 平移 / 缩放时只需一次 drawImage，避免逐格 fillRect 造成的卡顿。
   * 缓存分辨率上限 8px/格（再放大只是拉伸纯色块，不影响观感），防止超大画布吃内存。
   */
  terrainLayer(gen, z) {
    const map = gen.map
    const dpr = this.dpr
    const cs = Math.max(1, Math.min(z, 8)) * dpr // 缓存里每格占多少设备像素
    const key = `${this.mapHash(map)}|${cs}|${map.w}x${map.h}`
    const cache = this._terrain
    if (cache && cache.key === key) return cache

    const tw = map.w
    const th = map.h
    const cw = Math.max(1, tw * cs)
    const ch = Math.max(1, th * cs)
    let canvas = cache?.canvas
    if (!canvas || canvas.width !== cw || canvas.height !== ch) {
      canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
    }
    const c = canvas.getContext('2d')
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, cw, ch)

    const data = map.data
    const mw = map.w
    const mh = map.h
    const paths = new Map()
    for (let y = 0; y < mh; y++) {
      const row = y * mw
      for (let x = 0; x < mw; x++) {
        const t = data[row + x]
        if (t === T.EMPTY) continue
        const color = TILE_COLORS[t]
        if (!color) continue
        let p = paths.get(color)
        if (!p) {
          p = new Path2D()
          paths.set(color, p)
        }
        p.rect(x * cs, y * cs, cs + 0.5, cs + 0.5)
      }
    }
    for (const [color, p] of paths) {
      c.fillStyle = color
      c.fill(p)
    }

    // 平台高光条 / 攀爬杆
    const thin = Math.max(1, cs * 0.16)
    const plat = new Path2D()
    const pole = new Path2D()
    for (let y = 0; y < mh; y++) {
      const row = y * mw
      for (let x = 0; x < mw; x++) {
        const t = data[row + x]
        if (t === T.PLATFORM) plat.rect(x * cs, y * cs, cs + 0.5, thin)
        else if (t === T.POLE) pole.rect(x * cs + cs * 0.42, y * cs, thin, cs + 0.5)
      }
    }
    c.fillStyle = '#c0a878'
    c.fill(plat)
    c.fillStyle = '#d0a060'
    c.fill(pole)

    const layer = { key, canvas, cw, ch, tw, th }
    this._terrain = layer
    return layer
  }

  render() {
    const ctx = this.ctx
    if (!ctx) return
    const gen = RE.gen
    ctx.save()
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, this.w, this.h)

    if (!gen) {
      ctx.fillStyle = C.dim
      ctx.font = '13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('选择一间房开始编辑', this.w / 2, this.h / 2)
      ctx.restore()
      return
    }

    const v = RE.view
    const z = v.zoom
    const map = gen.map

    const x0 = Math.max(0, Math.floor(-v.panX / z))
    const x1 = Math.min(gen.w - 1, Math.ceil((this.w - v.panX) / z))
    const y0 = Math.max(0, Math.floor(-v.panY / z))
    const y1 = Math.min(gen.h - 1, Math.ceil((this.h - v.panY) / z))

    // ---- 背景层（数组顺序 = 绘制顺序，尾部最前）----
    if (v.bg) {
      const layers = bgLayers.value
      const selId = RE.sel.bgLayerId
      for (const layer of layers) {
        if (!layer.img?.src) continue
        const entry = this.bgImg(layer.img.src)
        if (!entry.ready) continue
        const r = this.bgImageRect(layer)
        if (!r) continue
        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1))
        const tinted = this.bgImgTinted(layer.img.src, layer.tint)
        ctx.drawImage(tinted || entry.img, r.x, r.y, r.w, r.h)
        ctx.restore()
        // 选中层高亮描边 + 层名
        if (layer.id === selId) {
          ctx.strokeStyle = C.hover
          ctx.lineWidth = 1.5
          ctx.setLineDash([6, 4])
          ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4)
          ctx.setLineDash([])
          ctx.fillStyle = C.hover
          ctx.font = '11px monospace'
          ctx.textAlign = 'left'
          ctx.fillText(`◈ ${layer.name || layer.id}`, r.x, r.y - 6)
          // 中心手柄
          ctx.fillStyle = C.hover
          ctx.fillRect(r.cx - 3, r.cy - 3, 6, 6)
        }
      }
    }

    // ---- 地形（离屏缓存，一次 blit；平移时不再逐格重绘）----
    const terrain = this.terrainLayer(gen, z)
    ctx.drawImage(
      terrain.canvas,
      0,
      0,
      terrain.cw,
      terrain.ch,
      v.panX,
      v.panY,
      terrain.tw * z,
      terrain.th * z
    )

    // ---- 网格 ----
    if (v.grid && z >= 3) {
      ctx.strokeStyle = C.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = x0; x <= x1 + 1; x++) {
        const px = Math.round(x * z + v.panX) + 0.5
        ctx.moveTo(px, y0 * z + v.panY)
        ctx.lineTo(px, y1 * z + v.panY + z)
      }
      for (let y = y0; y <= y1 + 1; y++) {
        const py = Math.round(y * z + v.panY) + 0.5
        ctx.moveTo(x0 * z + v.panX, py)
        ctx.lineTo(x1 * z + v.panX + z, py)
      }
      ctx.stroke()
    }

    // ---- 门洞 / 出生点 / 庇护所 ----
    if (gen.doorLeft) {
      const s = this.toScreen(Math.floor(gen.doorLeft.x / TS), Math.floor(gen.doorLeft.y / TS))
      ctx.fillStyle = C.door
      ctx.fillRect(s.x, s.y, Math.max(3, z * 0.5), Math.max(3, z * 3))
    }
    if (gen.doorRight) {
      const s = this.toScreen(Math.floor(gen.doorRight.x / TS), Math.floor(gen.doorRight.y / TS))
      ctx.fillStyle = C.door
      ctx.fillRect(s.x, s.y, Math.max(3, z * 0.5), Math.max(3, z * 3))
    }
    if (gen.shelter) {
      const s = this.toScreen(Math.floor(gen.shelter.x / TS), Math.floor(gen.shelter.y / TS))
      ctx.strokeStyle = C.shelter
      ctx.lineWidth = 2
      ctx.strokeRect(s.x - z * 0.5, s.y - z * 2, z * 2, z * 2.5)
    }
    if (gen.spawn) {
      const s = this.toScreen(Math.floor(gen.spawn.x / TS), Math.floor(gen.spawn.y / TS))
      ctx.fillStyle = C.spawn
      ctx.beginPath()
      ctx.arc(s.x, s.y, Math.max(2.5, z * 0.28), 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- 道具 ----
    if (v.props && gen.props?.length) {
      for (const p of gen.props) {
        const tx = Math.floor(p.x / TS)
        const ty = Math.floor(p.y / TS)
        const s = this.toScreen(tx, ty)
        const art = this.propArt(p.kind)
        if (art) {
          const scale = Math.max(0.05, (z * 1.7) / Math.max(art.width, art.height))
          const dw = art.width * scale
          const dh = art.height * scale
          ctx.drawImage(art, s.x - dw / 2, s.y - dh + z * 0.15, dw, dh)
        } else {
          ctx.fillStyle = C.propFallback
          ctx.fillRect(s.x - z * 0.3, s.y - z * 0.7, z * 0.6, z * 0.7)
        }
      }
    }

    // ---- 实体标记 ----
    if (v.entities) {
      ctx.font = `${Math.max(9, Math.min(13, z * 0.75))}px monospace`
      ctx.textAlign = 'center'
      if (gen.monsters?.length) {
        ctx.fillStyle = C.monster
        for (const m of gen.monsters) {
          const s = this.toScreen(Math.floor(m.x / TS), Math.floor(m.y / TS))
          ctx.fillText('▲', s.x, s.y)
        }
      }
      if (gen.loot?.length) {
        ctx.fillStyle = C.loot
        for (const l of gen.loot) {
          const s = this.toScreen(Math.floor(l.x / TS), Math.floor(l.y / TS))
          ctx.fillText('◆', s.x, s.y)
        }
      }
    }

    // ---- 悬停格 ----
    if (this.hover && RE.sel.tool === 'tile' && map.inBounds(this.hover.x, this.hover.y)) {
      const s = this.toScreen(this.hover.x, this.hover.y)
      ctx.strokeStyle = C.hover
      ctx.fillStyle = C.hoverFill
      ctx.lineWidth = 1.5
      ctx.fillRect(s.x, s.y, z, z)
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, z - 1, z - 1)
    }

    // ---- 房间名 ----
    if (v.labels) {
      ctx.fillStyle = C.label
      ctx.font = '13px serif'
      ctx.textAlign = 'left'
      ctx.fillText(gen.label || gen.roomId || '', 10, 20)
      ctx.fillStyle = C.dim
      ctx.font = '10px monospace'
      ctx.fillText(`${gen.w}×${gen.h}  seed ${gen.seed ?? '-'}  ${gen.biome || ''}`, 10, 34)
    }

    ctx.restore()
  }

  /** 取道具贴图画布（懒加载 + 缓存） */
  propArt(kind) {
    if (this.artCache.has(kind)) return this.artCache.get(kind)
    let art = null
    try {
      const tex = getPropArt(kind)
      art = tex?.image || null
    } catch (e) {
      art = null
    }
    this.artCache.set(kind, art)
    return art
  }
}

/** tile 类型 → 填充色（与 store 的 TILE_TYPES 保持一致） */
const TILE_COLORS = {
  [T.EMPTY]: null,
  [T.SOLID]: '#4a4438',
  [T.PLATFORM]: '#8a7a5a',
  [T.WATER]: '#2f5f7f',
  [T.POLE]: '#a8763a',
  [T.CRACKED]: '#7a6a5a',
  [T.SOIL]: '#6a543a',
  [T.TOXIC]: '#6ac040',
}
