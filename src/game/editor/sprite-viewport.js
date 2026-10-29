// ============================================================================
// 精灵编辑器 · 画布视口
// ----------------------------------------------------------------------------
// 纯 Canvas2D 实现（不依赖 Vue），负责：
//   · 绘制精灵图 / 网格 / sprite 框 / 帧 / 骨骼 / 碰撞 / slot
//   · 指针交互：选择、拖拽、框选新建、缩放平移
//
// 坐标系：屏幕(css px) ↔ 精灵图像素。缩放平移由 view.zoom / view.panX / panY 控制。
// ============================================================================

import {
  SE,
  currentSheet,
  currentSprite,
  currentAction,
  currentEffect,
  sheetImage,
  boneTransforms,
  orderedBones,
} from './sprite-store.js'

const C = {
  grid: 'rgba(140, 160, 170, 0.16)',
  gridMajor: 'rgba(140, 160, 170, 0.32)',
  sprite: 'rgba(111, 240, 208, 0.85)',
  spriteFill: 'rgba(111, 240, 208, 0.08)',
  spriteSel: '#f2b34a',
  spriteSelFill: 'rgba(242, 179, 74, 0.14)',
  frame: 'rgba(143, 196, 255, 0.9)',
  frameSel: '#ffffff',
  bone: '#6ff0d0',
  boneSel: '#f2b34a',
  boneLink: 'rgba(111, 240, 208, 0.55)',
  shape: '#ff5644',
  shapeSel: '#ffffff',
  grip: '#ffb03a',
  cast: '#8fc4ff',
  effect: '#c6e05a',
  effectSel: '#ffffff',
  text: '#d8cfba',
  dim: 'rgba(216, 207, 186, 0.55)',
}

export class SpriteViewport {
  constructor(canvas, onChange) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onChange = onChange || (() => {})
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = 0
    this.h = 0
    this.hover = null
    this.drag = null
    this.polyPts = []
    this.imgCache = new Map()

    this._onResize = () => this.resize()
    this._onDown = (e) => this.pointerDown(e)
    this._onMove = (e) => this.pointerMove(e)
    this._onUp = (e) => this.pointerUp(e)
    this._onWheel = (e) => this.wheel(e)
    this._onCtx = (e) => e.preventDefault()

    canvas.addEventListener('pointerdown', this._onDown)
    canvas.addEventListener('pointermove', this._onMove)
    window.addEventListener('pointerup', this._onUp)
    canvas.addEventListener('wheel', this._onWheel, { passive: false })
    canvas.addEventListener('contextmenu', this._onCtx)
    window.addEventListener('resize', this._onResize)
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
  }

  resize() {
    const c = this.canvas
    const rect = c.getBoundingClientRect()
    this.w = Math.max(1, Math.round(rect.width))
    this.h = Math.max(1, Math.round(rect.height))
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(this.w * this.dpr)
    c.height = Math.round(this.h * this.dpr)
    this.render()
  }

  // ------------------------------------------------------------ 坐标换算
  toSheet(cx, cy) {
    const v = SE.view
    return { x: (cx - v.panX) / v.zoom, y: (cy - v.panY) / v.zoom }
  }

  toScreen(sx, sy) {
    const v = SE.view
    return { x: sx * v.zoom + v.panX, y: sy * v.zoom + v.panY }
  }

  localPos(sx, sy) {
    const sp = currentSprite()
    if (!sp) return { x: sx, y: sy }
    return { x: sx - sp.x, y: sy - sp.y }
  }

  // ------------------------------------------------------------ 指针
  pointerDown(e) {
    // 指针捕获在某些场景（指针已释放 / 合成事件）会抛异常，不能让它中断后续处理
    try {
      this.canvas.setPointerCapture?.(e.pointerId)
    } catch (err) {
      /* ignore */
    }
    const rect = this.canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const sheetPt = this.toSheet(cx, cy)
    const tool = SE.sel.tool

    // 中键 / Alt 平移
    if (e.button === 1 || e.altKey) {
      this.drag = { kind: 'pan', cx, cy, panX: SE.view.panX, panY: SE.view.panY }
      return
    }
    if (e.button === 2) {
      this.polyPts = []
      return
    }

    if (tool === 'bone') {
      const sp = currentSprite()
      if (!sp) return
      const local = this.localPos(sheetPt.x, sheetPt.y)
      // Shift+点击 = 以当前选中的骨骼为父级；普通点击 = 根骨骼
      const canParent = e.shiftKey && SE.sel.boneId && sp.bones.some((b) => b.id === SE.sel.boneId)
      const parent = canParent ? SE.sel.boneId : null
      this.onChange({ type: 'addBone', x: local.x, y: local.y, parent })
      return
    }
    if (tool === 'grip' || tool === 'cast') {
      const sp = currentSprite()
      if (!sp) return
      const local = this.localPos(sheetPt.x, sheetPt.y)
      this.onChange({ type: 'setSlot', kind: tool, x: local.x, y: local.y })
      return
    }
    if (tool === 'rect' || tool === 'circle') {
      this.drag = { kind: 'newShape', shapeType: tool, x0: sheetPt.x, y0: sheetPt.y, x1: sheetPt.x, y1: sheetPt.y }
      return
    }
    if (tool === 'poly') {
      this.polyPts.push(sheetPt)
      return
    }
    if (tool === 'frame') {
      this.drag = { kind: 'newFrame', x0: sheetPt.x, y0: sheetPt.y, x1: sheetPt.x, y1: sheetPt.y }
      return
    }

    // 选择工具：先命中骨骼 / 碰撞 / slot / 帧 / sprite
    const hit = this.hitTest(sheetPt)
    if (!hit) {
      this.onChange({ type: 'select', what: null })
      this.drag = { kind: 'none' }
      return
    }
    this.onChange({ type: 'select', what: hit })
    if (hit.type === 'bone') {
      const b = currentSprite().bones.find((q) => q.id === hit.id)
      const t = boneTransforms().get(hit.id)
      this.drag = {
        kind: 'bone',
        id: hit.id,
        part: hit.part,
        startX: sheetPt.x,
        startY: sheetPt.y,
        originX: b.x,
        originY: b.y,
        angle: b.angle,
        len: b.len,
        worldX: t.x,
        worldY: t.y,
      }
    } else if (hit.type === 'shape') {
      const s = currentSprite().shapes.find((q) => q.id === hit.id)
      this.drag = {
        kind: 'shape',
        id: hit.id,
        startX: sheetPt.x,
        startY: sheetPt.y,
        ox: s.x,
        oy: s.y,
        ow: s.w,
        oh: s.h,
        or: s.r,
        oangle: s.angle,
        opoints: s.points.map((p) => ({ ...p })),
      }
    } else if (hit.type === 'frame') {
      const act = currentAction()
      const f = act.frames.find((q) => q.id === hit.id)
      this.drag = { kind: 'frame', id: hit.id, startX: sheetPt.x, startY: sheetPt.y, ox: f.x, oy: f.y }
    } else if (hit.type === 'sprite') {
      const sp = currentSprite()
      this.drag = { kind: 'sprite', startX: sheetPt.x, startY: sheetPt.y, ox: sp.x, oy: sp.y }
    }
  }

  pointerMove(e) {
    const rect = this.canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const sheetPt = this.toSheet(cx, cy)
    this.lastCx = cx
    this.lastCy = cy

    if (!this.drag) {
      this.hover = this.hitTest(sheetPt)
      this.canvas.style.cursor = this.cursorFor(this.hover)
      this.render()
      return
    }

    const d = this.drag
    if (d.kind === 'pan') {
      SE.view.panX = d.panX + (cx - d.cx)
      SE.view.panY = d.panY + (cy - d.cy)
      this.render()
      return
    }
    if (d.kind === 'newShape' || d.kind === 'newFrame') {
      d.x1 = sheetPt.x
      d.y1 = sheetPt.y
      this.render()
      return
    }
    const dx = sheetPt.x - d.startX
    const dy = sheetPt.y - d.startY
    const sp = currentSprite()
    if (!sp) return

    if (d.kind === 'bone') {
      const b = sp.bones.find((q) => q.id === d.id)
      if (!b) return
      const t = boneTransforms().get(b.id)
      if (d.part === 'tip') {
        const wx = t.x + dx
        const wy = t.y + dy
        const ang = (Math.atan2(wy - t.y, wx - t.x) * 180) / Math.PI
        const len = Math.max(2, Math.hypot(wx - t.x, wy - t.y))
        if (b.parent) {
          // 子骨骼：换算到父坐标系
          const parent = sp.bones.find((q) => q.id === b.parent)
          const pt = parent ? boneTransforms().get(parent.id) : null
          const pa = pt ? pt.a : 0
          const rad = (pa * Math.PI) / 180
          b.angle = ang - pa
          b.len = len
        } else {
          b.angle = ang
          b.len = len
        }
      } else {
        // 移动原点（子骨骼按父坐标系换算）
        if (b.parent) {
          const parent = sp.bones.find((q) => q.id === b.parent)
          const pt = parent ? boneTransforms().get(parent.id) : null
          const pa = pt ? pt.a : 0
          const rad = (pa * Math.PI) / 180
          b.x = d.originX + (dx * Math.cos(rad) + dy * Math.sin(rad))
          b.y = d.originY + (-dx * Math.sin(rad) + dy * Math.cos(rad))
        } else {
          b.x = d.originX + dx
          b.y = d.originY + dy
        }
      }
      this.render()
      this.onChange({ type: 'edit' })
      return
    }
    if (d.kind === 'shape') {
      const s = sp.shapes.find((q) => q.id === d.id)
      if (!s) return
      if (s.type === 'poly') {
        s.points = d.opoints.map((p) => ({ x: p.x + dx, y: p.y + dy }))
      } else if (s.type === 'circle') {
        const r = Math.max(2, Math.max(Math.abs(dx), Math.abs(dy)))
        s.x = d.ox + (dx < 0 ? -r : r) / 2
        s.y = d.oy + (dy < 0 ? -r : r) / 2
        s.r = r
      } else {
        s.x = d.ox + dx
        s.y = d.oy + dy
        s.w = d.ow
        s.h = d.oh
      }
      this.render()
      this.onChange({ type: 'edit' })
      return
    }
    if (d.kind === 'frame') {
      const act = currentAction()
      const f = act?.frames.find((q) => q.id === d.id)
      if (!f) return
      f.x = d.ox + dx
      f.y = d.oy + dy
      this.render()
      this.onChange({ type: 'edit' })
      return
    }
    if (d.kind === 'sprite') {
      sp.x = d.ox + dx
      sp.y = d.oy + dy
      this.render()
      this.onChange({ type: 'edit' })
    }
  }

  pointerUp() {
    const d = this.drag
    this.drag = null
    if (!d) return
    if (d.kind === 'newShape') {
      const w = Math.abs(d.x1 - d.x0)
      const h = Math.abs(d.y1 - d.y0)
      if (w > 2 && h > 2) {
        const sp = currentSprite()
        const x = Math.min(d.x0, d.x1) - (sp?.x || 0)
        const y = Math.min(d.y0, d.y1) - (sp?.y || 0)
        this.onChange({
          type: 'addShape',
          shape:
            d.shapeType === 'circle'
              ? { type: 'circle', x, y, r: Math.max(w, h) / 2 }
              : { type: 'rect', x, y, w, h },
        })
      }
      this.render()
      return
    }
    if (d.kind === 'newFrame') {
      const w = Math.abs(d.x1 - d.x0)
      const h = Math.abs(d.y1 - d.y0)
      if (w > 2 && h > 2) {
        this.onChange({
          type: 'addFrame',
          rect: { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w, h },
        })
      }
      this.render()
      return
    }
    if (d.kind) this.onChange({ type: 'editEnd' })
  }

  wheel(e) {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const before = this.toSheet(cx, cy)
    const k = e.deltaY < 0 ? 1.12 : 1 / 1.12
    SE.view.zoom = Math.max(0.1, Math.min(12, SE.view.zoom * k))
    const after = this.toSheet(cx, cy)
    SE.view.panX += (after.x - before.x) * SE.view.zoom
    SE.view.panY += (after.y - before.y) * SE.view.zoom
    this.render()
  }

  cursorFor(hit) {
    if (SE.sel.tool === 'bone') return 'crosshair'
    if (SE.sel.tool === 'rect' || SE.sel.tool === 'circle' || SE.sel.tool === 'frame') return 'crosshair'
    if (SE.sel.tool === 'grip' || SE.sel.tool === 'cast') return 'crosshair'
    if (hit?.type === 'bone') return 'pointer'
    return 'default'
  }

  // ------------------------------------------------------------ 命中测试
  hitTest(p) {
    const sp = currentSprite()
    if (sp) {
      const t = boneTransforms(sp)
      // 骨骼末端优先
      for (const { bone } of orderedBones(sp).slice().reverse()) {
        const tr = t.get(bone.id)
        const rad = (tr.a * Math.PI) / 180
        const tipX = sp.x + tr.x + Math.cos(rad) * bone.len
        const tipY = sp.y + tr.y + Math.sin(rad) * bone.len
        if (Math.hypot(p.x - tipX, p.y - tipY) < 6 / SE.view.zoom) return { type: 'bone', id: bone.id, part: 'tip' }
      }
      for (const { bone } of orderedBones(sp).slice().reverse()) {
        const tr = t.get(bone.id)
        const ox = sp.x + tr.x
        const oy = sp.y + tr.y
        if (Math.hypot(p.x - ox, p.y - oy) < 6 / SE.view.zoom) return { type: 'bone', id: bone.id, part: 'origin' }
      }
      for (const s of sp.shapes.slice().reverse()) {
        if (this.hitShape(s, p, sp)) return { type: 'shape', id: s.id }
      }
      for (const kind of ['grip', 'cast']) {
        const slot = sp[kind]
        if (slot && Math.hypot(p.x - (sp.x + slot.x), p.y - (sp.y + slot.y)) < 7 / SE.view.zoom) {
          return { type: 'slot', id: kind, kind }
        }
      }
      const act = currentAction()
      if (act) {
        for (const f of act.frames.slice().reverse()) {
          if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) {
            return { type: 'frame', id: f.id }
          }
        }
      }
    }
    // sprite 框
    for (const s of SE.project.sprites.slice().reverse()) {
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
        return { type: 'sprite', id: s.id }
      }
    }
    // 特效帧
    for (const e of SE.project.effects.slice().reverse()) {
      for (const f of e.frames) {
        if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) {
          return { type: 'effect', id: e.id }
        }
      }
    }
    return null
  }

  hitShape(s, p, sp) {
    const lx = p.x - sp.x
    const ly = p.y - sp.y
    if (s.type === 'rect') {
      return lx >= s.x && lx <= s.x + s.w && ly >= s.y && ly <= s.y + s.h
    }
    if (s.type === 'circle') {
      return Math.hypot(lx - s.x, ly - s.y) <= s.r
    }
    if (s.type === 'poly') {
      return pointInPoly(lx, ly, s.points)
    }
    return false
  }

  // ------------------------------------------------------------ 绘制
  render() {
    const ctx = this.ctx
    const v = SE.view
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)

    // 背景
    ctx.fillStyle = '#0b0d0f'
    ctx.fillRect(0, 0, this.w, this.h)

    const sheet = currentSheet()
    ctx.save()
    ctx.translate(v.panX, v.panY)
    ctx.scale(v.zoom, v.zoom)

    if (sheet) {
      this.drawSheet(ctx, sheet)
      if (v.grid) this.drawGrid(ctx, sheet)
      this.drawSprites(ctx)
      this.drawFrames(ctx)
      this.drawEffects(ctx)
      const sp = currentSprite()
      if (sp) {
        if (v.shapes) this.drawShapes(ctx, sp)
        if (v.bones) this.drawBones(ctx, sp)
        if (v.slots) this.drawSlots(ctx, sp)
      }
    }

    // 正在框选的新对象
    const d = this.drag
    if (d && (d.kind === 'newShape' || d.kind === 'newFrame')) {
      const x = Math.min(d.x0, d.x1)
      const y = Math.min(d.y0, d.y1)
      const w = Math.abs(d.x1 - d.x0)
      const h = Math.abs(d.y1 - d.y0)
      ctx.setLineDash([4 / v.zoom, 3 / v.zoom])
      ctx.strokeStyle = d.kind === 'newFrame' ? C.frame : C.shape
      ctx.lineWidth = 1.5 / v.zoom
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }
    if (this.polyPts.length) {
      ctx.setLineDash([4 / v.zoom, 3 / v.zoom])
      ctx.strokeStyle = C.shape
      ctx.lineWidth = 1.5 / v.zoom
      ctx.beginPath()
      this.polyPts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
      ctx.setLineDash([])
      for (const p of this.polyPts) {
        ctx.fillStyle = C.shape
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3 / v.zoom, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.restore()

    // 缩放指示
    ctx.fillStyle = C.dim
    ctx.font = '11px monospace'
    ctx.fillText(`${Math.round(v.zoom * 100)}%`, 8, this.h - 8)
    if (sheet) {
      ctx.fillText(`${sheet.width}×${sheet.height}`, 52, this.h - 8)
    }
  }

  drawSheet(ctx, sheet) {
    const img = sheetImage(sheet)
    ctx.save()
    ctx.imageSmoothingEnabled = !SE.view.pixels
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, sheet.width, sheet.height)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.fillRect(0, 0, sheet.width, sheet.height)
    }
    ctx.strokeStyle = 'rgba(216,207,186,0.35)'
    ctx.lineWidth = 1 / SE.view.zoom
    ctx.strokeRect(0, 0, sheet.width, sheet.height)
    ctx.restore()
  }

  drawGrid(ctx, sheet) {
    const v = SE.view
    const gw = Math.max(4, sheet.gridW || 32)
    const gh = Math.max(4, sheet.gridH || 32)
    ctx.save()
    ctx.lineWidth = 1 / v.zoom
    for (let x = 0; x <= sheet.width; x += gw) {
      ctx.strokeStyle = x % (gw * 4) === 0 ? C.gridMajor : C.grid
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, sheet.height)
      ctx.stroke()
    }
    for (let y = 0; y <= sheet.height; y += gh) {
      ctx.strokeStyle = y % (gh * 4) === 0 ? C.gridMajor : C.grid
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(sheet.width, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  drawSprites(ctx) {
    const v = SE.view
    for (const s of SE.project.sprites) {
      const sel = s.id === SE.sel.spriteId
      ctx.save()
      ctx.lineWidth = (sel ? 2 : 1) / v.zoom
      ctx.strokeStyle = sel ? C.spriteSel : C.sprite
      ctx.fillStyle = sel ? C.spriteSelFill : C.spriteFill
      ctx.fillRect(s.x, s.y, s.w, s.h)
      ctx.strokeRect(s.x, s.y, s.w, s.h)
      ctx.fillStyle = sel ? C.spriteSel : C.sprite
      ctx.font = `${11 / v.zoom}px monospace`
      ctx.fillText(s.name, s.x + 2 / v.zoom, s.y - 3 / v.zoom)
      ctx.restore()
    }
  }

  drawFrames(ctx) {
    const sp = currentSprite()
    if (!sp) return
    const act = currentAction()
    if (!act) return
    const v = SE.view
    act.frames.forEach((f, i) => {
      const sel = f.id === SE.sel.frameId
      ctx.save()
      ctx.lineWidth = (sel ? 2 : 1) / v.zoom
      ctx.strokeStyle = sel ? C.frameSel : C.frame
      ctx.fillStyle = sel ? 'rgba(143,196,255,0.18)' : 'rgba(143,196,255,0.06)'
      ctx.fillRect(f.x, f.y, f.w, f.h)
      ctx.strokeRect(f.x, f.y, f.w, f.h)
      ctx.fillStyle = sel ? C.frameSel : C.frame
      ctx.font = `${10 / v.zoom}px monospace`
      ctx.fillText(`${i}`, f.x + 2 / v.zoom, f.y + 10 / v.zoom)
      ctx.restore()
    })
  }

  drawEffects(ctx) {
    const v = SE.view
    for (const e of SE.project.effects) {
      const sel = e.id === SE.sel.effectId
      e.frames.forEach((f) => {
        ctx.save()
        ctx.lineWidth = (sel ? 2 : 1) / v.zoom
        ctx.strokeStyle = sel ? C.effectSel : C.effect
        ctx.fillStyle = 'rgba(198,224,90,0.10)'
        ctx.fillRect(f.x, f.y, f.w, f.h)
        ctx.strokeRect(f.x, f.y, f.w, f.h)
        ctx.restore()
      })
    }
  }

  drawShapes(ctx, sp) {
    const v = SE.view
    for (const s of sp.shapes) {
      const sel = s.id === SE.sel.shapeId
      ctx.save()
      ctx.strokeStyle = sel ? C.shapeSel : C.shape
      ctx.fillStyle = 'rgba(255,86,68,0.16)'
      ctx.lineWidth = (sel ? 2 : 1) / v.zoom
      if (s.type === 'circle') {
        ctx.beginPath()
        ctx.arc(sp.x + s.x, sp.y + s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else if (s.type === 'poly') {
        ctx.beginPath()
        s.points.forEach((p, i) => (i ? ctx.lineTo(sp.x + p.x, sp.y + p.y) : ctx.moveTo(sp.x + p.x, sp.y + p.y)))
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.fillRect(sp.x + s.x, sp.y + s.y, s.w, s.h)
        ctx.strokeRect(sp.x + s.x, sp.y + s.y, s.w, s.h)
      }
      ctx.restore()
    }
  }

  drawBones(ctx, sp) {
    const v = SE.view
    const t = boneTransforms(sp)
    ctx.save()
    // 父连线
    for (const { bone } of orderedBones(sp)) {
      if (!bone.parent) continue
      const tr = t.get(bone.id)
      const pt = t.get(bone.parent)
      if (!tr || !pt) continue
      const rad = (pt.a * Math.PI) / 180
      const px = sp.x + pt.x + Math.cos(rad) * (sp.bones.find((q) => q.id === bone.parent)?.len || 0)
      const py = sp.y + pt.y + Math.sin(rad) * (sp.bones.find((q) => q.id === bone.parent)?.len || 0)
      ctx.strokeStyle = C.boneLink
      ctx.lineWidth = 1 / v.zoom
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(sp.x + tr.x, sp.y + tr.y)
      ctx.stroke()
    }
    for (const { bone } of orderedBones(sp)) {
      const tr = t.get(bone.id)
      if (!tr) continue
      const sel = bone.id === SE.sel.boneId
      const ox = sp.x + tr.x
      const oy = sp.y + tr.y
      const rad = (tr.a * Math.PI) / 180
      const tx = ox + Math.cos(rad) * bone.len
      const ty = oy + Math.sin(rad) * bone.len
      ctx.strokeStyle = sel ? C.boneSel : C.bone
      ctx.lineWidth = (sel ? 2.5 : 1.6) / v.zoom
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      // 端点
      ctx.fillStyle = sel ? C.boneSel : C.bone
      ctx.beginPath()
      ctx.arc(ox, oy, 3.5 / v.zoom, 0, Math.PI * 2)
      ctx.fill()
      if (sel) {
        ctx.beginPath()
        ctx.arc(tx, ty, 4.5 / v.zoom, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  drawSlots(ctx, sp) {
    const v = SE.view
    const draw = (slot, color, label) => {
      if (!slot) return
      const x = sp.x + slot.x
      const y = sp.y + slot.y
      ctx.save()
      ctx.strokeStyle = color
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = 2 / v.zoom
      ctx.beginPath()
      ctx.arc(x, y, 7 / v.zoom, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - 4 / v.zoom, y)
      ctx.lineTo(x + 4 / v.zoom, y)
      ctx.moveTo(x, y - 4 / v.zoom)
      ctx.lineTo(x, y + 4 / v.zoom)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.font = `${10 / v.zoom}px monospace`
      ctx.fillText(label, x + 9 / v.zoom, y + 3 / v.zoom)
      ctx.restore()
    }
    draw(sp.grip, C.grip, '抓握')
    draw(sp.cast, C.cast, '施放')
  }

  // ------------------------------------------------------------ 外部动作
  /** 完成多边形（双击或回车） */
  commitPoly() {
    if (this.polyPts.length < 3) {
      this.polyPts = []
      return
    }
    const sp = currentSprite()
    const pts = this.polyPts.map((p) => ({ x: p.x - (sp?.x || 0), y: p.y - (sp?.y || 0) }))
    this.polyPts = []
    this.onChange({ type: 'addShape', shape: { type: 'poly', x: 0, y: 0, points: pts } })
  }

  zoomToFit() {
    const sheet = currentSheet()
    if (!sheet || !sheet.width || !sheet.height) return
    const z = Math.min(this.w / sheet.width, this.h / sheet.height) * 0.92
    SE.view.zoom = Math.max(0.1, z)
    SE.view.panX = (this.w - sheet.width * SE.view.zoom) / 2
    SE.view.panY = (this.h - sheet.height * SE.view.zoom) / 2
    this.render()
  }

  zoomTo(factor) {
    const cx = this.w / 2
    const cy = this.h / 2
    const before = this.toSheet(cx, cy)
    SE.view.zoom = Math.max(0.1, Math.min(12, SE.view.zoom * factor))
    const after = this.toSheet(cx, cy)
    SE.view.panX += (after.x - before.x) * SE.view.zoom
    SE.view.panY += (after.y - before.y) * SE.view.zoom
    this.render()
  }
}

function pointInPoly(x, y, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
