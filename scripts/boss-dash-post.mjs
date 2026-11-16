// ============================================================================
// BOSS 冲刺序列帧后处理：12 张单帧 PNG → 横向图集 + manifest 帧组
// ----------------------------------------------------------------------------
// 输入（数据执政官「原地冲刺」，按给的顺序：033 起手 → 022…032）
//   D:/sgames/image-clip/data/library/rustfall/data_archon/图片/冲刺/关键帧-去背景-裁剪/
// 输出
//   public/sprites/boss-action/<bossId>_dash.png   12 格 × (512 × 336)
//   public/sprites/boss-action/manifest.json       kinds.dash(frameW/frameH) + frames.dash + fps.dash
//
// 为什么格子要 512 宽（走路是 272）：
//   冲刺姿势是大幅前倾 + 提箱拖在身后，源图并集 1022×637。按「内容高度对齐走路」算，
//   需要 ~0.44 缩放 → 内容 431×269，塞不进 272 宽的格子；硬塞只能缩到 0.39，
//   角色会比走路小一圈（观感是「冲刺瞬间变小」）。所以给 dash 单独一个 512×336 的格子，
//   并在 manifest 的 kinds 里带上 frameW/frameH；loader 按格的宽高比把 BOSS 的 quad
//   临时拉宽，像素比例和走路完全一致。
//
// 与 boss-walk-post.mjs 相同的处理（每条都对应踩过的坑）：
//   1. 抠底线：源图底部有一条横向基准线，整带删掉（脚底只被削 ~3px，换来 12 帧统一地面线）
//   2. 小连通块：面积 < 最大块 0.5% 的碎块（速度线残留）剔除
//   3. 统一缩放 + 统一落点：12 帧共用并集包围盒，逐帧各自 fit 会让身体每帧伸缩抖动
//   4. alpha 二值 + 14 级量化：沿用 boss-action-post.mjs 的像素规范
//
// 用法
//   node scripts/boss-dash-post.mjs
//   node scripts/boss-dash-post.mjs --boss tb_data_archon --frames 033,022,023 --content 0.8
//   node scripts/boss-dash-post.mjs --preview        # 额外导出每帧清理后的预览
// ============================================================================
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const OUT = path.resolve('public/sprites/boss-action')
const MANIFEST = path.join(OUT, 'manifest.json')

const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}

const BOSS = argOf('boss', 'tb_data_archon')
const SRC = argOf('src', 'D:/sgames/image-clip/data/library/rustfall/data_archon/图片/冲刺/关键帧-去背景-裁剪')
const PREFIX = argOf('prefix', '数据执政官-原地冲刺-')
/** 帧序：用户给的顺序就是播放顺序（033 是起手，然后 022…032） */
const ORDER = argOf('frames', '033,022,023,024,025,026,027,028,029,030,031,032')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
/** dash 专用格宽（走路是 272） */
const CELL_W = Number(argOf('cellw', 512))
const CELL_H = Number(argOf('cellh', 336))
/** 每格内容目标高度占格高比例：对齐走路（269/336） */
const CONTENT = Number(argOf('content', 0.8))
/** 源图里「横向长线」判定：一行最长连续不透明段 ≥ 宽 × 该比例 */
const LINE_RATIO = Number(argOf('line', 0.45))
const FPS = Number(argOf('fps', 16))

// ---------------------------------------------------------------------------
// 源文件
// ---------------------------------------------------------------------------
const all = fs.readdirSync(SRC)
const files = ORDER.map((tag) => {
  const f = all.find((n) => n.startsWith(PREFIX + tag + '-') || n.includes('-' + tag + '-'))
  if (!f) {
    console.error(`[fail] 找不到第 ${tag} 帧（${PREFIX}${tag}-*）`)
    process.exit(1)
  }
  return path.join(SRC, f)
})
const N = files.length
console.log(`[in ] ${BOSS} ← ${N} 帧 @ ${SRC}`)
console.log(`[ord] ${ORDER.join(' → ')}`)

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {}
const info = manifest[BOSS] || {}
console.log(`[cfg] dash 格 ${CELL_W}×${CELL_H}（base 格 ${info.frameW || 272}×${info.frameH || 336}）  内容高 ${Math.round(CELL_H * CONTENT)}px`)

const parts = files.map((f) => ({ b64: fs.readFileSync(f).toString('base64'), name: path.basename(f) }))

// ---------------------------------------------------------------------------
// 浏览器（优先连已开的调试口；沙箱里 launch 可能 EPERM）
// ---------------------------------------------------------------------------
let browser = null
let ownBrowser = false
try {
  browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 400, height: 400 } })
} catch (e) {
  console.log(`[cdp ] connect ${CDP} 失败（${e.message.split('\n')[0]}），改为自己 launch`)
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 400, height: 400 },
  })
  ownBrowser = true
}
const page = await browser.newPage()
await page.goto('about:blank')

const res = await page.evaluate(
  async ({ parts, frameW, frameH, N, contentH, lineRatio }) => {
    const ALPHA_T = 110
    const load = async (b64) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      return img
    }

    function clean(img) {
      const W = img.naturalWidth
      const H = img.naturalHeight
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      const image = ctx.getImageData(0, 0, W, H)
      const d = image.data
      const op = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? d[(y * W + x) * 4 + 3] >= ALPHA_T : false)

      const longestRun = (y) => {
        let best = 0
        let cur = 0
        for (let x = 0; x < W; x++) {
          if (op(x, y)) {
            cur++
            if (cur > best) best = cur
          } else cur = 0
        }
        return best
      }

      // ---- 1. 底部横向基准线 ------------------------------------------------
      let lineBottom = -1
      let lineTop = -1
      const minRun = W * lineRatio
      for (let y = H - 1; y >= 0 && H - 1 - y <= 24; y--) {
        if (longestRun(y) >= minRun) {
          if (lineBottom < 0) lineBottom = y
          lineTop = y
        } else if (lineBottom >= 0) break
      }
      let removedLine = 0
      if (lineTop >= 0) {
        for (let k = 0; k < 5 && lineTop > 0; k++) {
          if (longestRun(lineTop - 1) >= minRun * 0.5) lineTop--
          else break
        }
        for (let y = lineTop; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!op(x, y)) continue
            d[(y * W + x) * 4 + 3] = 0
            removedLine++
          }
        }
      }

      // ---- 2. 小连通块 -----------------------------------------------------
      const seen = new Uint8Array(W * H)
      const comps = []
      const stack = []
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i0 = y * W + x
          if (seen[i0] || d[i0 * 4 + 3] < ALPHA_T) continue
          let area = 0
          let x0 = x
          let y0 = y
          let x1 = x
          let y1 = y
          stack.length = 0
          stack.push(i0)
          seen[i0] = 1
          while (stack.length) {
            const p = stack.pop()
            const py = (p / W) | 0
            const px = p - py * W
            area++
            if (px < x0) x0 = px
            if (px > x1) x1 = px
            if (py < y0) y0 = py
            if (py > y1) y1 = py
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = px + dx
                const ny = py + dy
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
                const ni = ny * W + nx
                if (seen[ni] || d[ni * 4 + 3] < ALPHA_T) continue
                seen[ni] = 1
                stack.push(ni)
              }
            }
          }
          comps.push({ area, x0, y0, x1, y1, idx: i0 })
        }
      }
      comps.sort((a, b) => b.area - a.area)
      const minArea = Math.max(8, (comps[0]?.area || 1) * 0.005)
      let removedBits = 0
      for (const cp of comps.slice(1)) {
        if (cp.area >= minArea) continue
        const local = []
        stack.length = 0
        stack.push(cp.idx)
        const mark = new Set([cp.idx])
        while (stack.length) {
          const p = stack.pop()
          local.push(p)
          const py = (p / W) | 0
          const px = p - py * W
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx
              const ny = py + dy
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
              const ni = ny * W + nx
              if (mark.has(ni) || d[ni * 4 + 3] < ALPHA_T) continue
              mark.add(ni)
              stack.push(ni)
            }
          }
        }
        for (const p of local) d[p * 4 + 3] = 0
        removedBits += local.length
      }

      // alpha 二值
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= ALPHA_T ? 255 : 0
      ctx.putImageData(image, 0, 0)

      let bx0 = W
      let by0 = H
      let bx1 = -1
      let by1 = -1
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (d[(y * W + x) * 4 + 3] > 0) {
            if (x < bx0) bx0 = x
            if (x > bx1) bx1 = x
            if (y < by0) by0 = y
            if (y > by1) by1 = y
          }
        }
      }
      return {
        canvas: c,
        w: W,
        h: H,
        bbox: bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 },
        line: lineTop >= 0 ? { top: lineTop, bottom: lineBottom, px: removedLine } : null,
        bits: removedBits,
        comps: comps.length,
      }
    }

    const frames = []
    for (const p of parts) frames.push(clean(await load(p.b64)))

    // ---- 3. 并集包围盒 → 统一缩放 / 统一落点 ------------------------------
    let ux0 = 1e9
    let uy0 = 1e9
    let ux1 = -1
    let uy1 = -1
    for (const f of frames) {
      if (!f.bbox) continue
      ux0 = Math.min(ux0, f.bbox.x0)
      uy0 = Math.min(uy0, f.bbox.y0)
      ux1 = Math.max(ux1, f.bbox.x1)
      uy1 = Math.max(uy1, f.bbox.y1)
    }
    if (ux1 < 0) return { error: '全部帧都是空的' }
    const uw = ux1 - ux0 + 1
    const uh = uy1 - uy0 + 1
    const scale = Math.min((frameW - 8) / uw, contentH / uh)
    const dw = Math.max(2, Math.round(uw * scale))
    const dh = Math.max(2, Math.round(uh * scale))
    const dx = Math.round((frameW - dw) / 2)
    const dy = frameH - dh - 1

    // ---- 4. 画图集 -------------------------------------------------------
    const atlas = document.createElement('canvas')
    atlas.width = frameW * N
    atlas.height = frameH
    const actx = atlas.getContext('2d', { willReadFrequently: true })
    actx.imageSmoothingEnabled = true
    actx.imageSmoothingQuality = 'high'
    for (let i = 0; i < N; i++) {
      const f = frames[i]
      if (!f.bbox) continue
      actx.drawImage(f.canvas, ux0, uy0, uw, uh, i * frameW + dx, dy, dw, dh)
    }

    // ---- 5. 量化 + alpha 二值 -------------------------------------------
    const imgData = actx.getImageData(0, 0, atlas.width, atlas.height)
    const dd = imgData.data
    const L = 14
    for (let i = 0; i < dd.length; i += 4) {
      if (dd[i + 3] < ALPHA_T) {
        dd[i + 3] = 0
        continue
      }
      dd[i + 3] = 255
      dd[i] = Math.round((Math.round((dd[i] / 255) * (L - 1)) / (L - 1)) * 255)
      dd[i + 1] = Math.round((Math.round((dd[i + 1] / 255) * (L - 1)) / (L - 1)) * 255)
      dd[i + 2] = Math.round((Math.round((dd[i + 2] / 255) * (L - 1)) / (L - 1)) * 255)
    }
    actx.putImageData(imgData, 0, 0)

    // 逐格实测
    const perFrame = []
    for (let i = 0; i < N; i++) {
      let bx0 = 1e9
      let by0 = 1e9
      let bx1 = -1
      let by1 = -1
      for (let y = 0; y < frameH; y++) {
        for (let x = i * frameW; x < (i + 1) * frameW; x++) {
          if (dd[(y * atlas.width + x) * 4 + 3] > 0) {
            if (x < bx0) bx0 = x
            if (x > bx1) bx1 = x
            if (y < by0) by0 = y
            if (y > by1) by1 = y
          }
        }
      }
      perFrame.push(bx1 < 0 ? null : { w: bx1 - bx0 + 1, h: by1 - by0 + 1, x: bx0 - i * frameW, bot: by1 })
    }

    return {
      png: atlas.toDataURL('image/png'),
      previews: frames.map((f) => f.canvas.toDataURL('image/png')),
      w: atlas.width,
      h: atlas.height,
      scale,
      union: { x0: ux0, y0: uy0, w: uw, h: uh },
      content: { w: dw, h: dh, x: dx, y: dy },
      frames: frames.map((f) => ({ bbox: f.bbox, line: f.line, bits: f.bits, comps: f.comps })),
      perFrame,
    }
  },
  { parts, frameW: CELL_W, frameH: CELL_H, N, contentH: Math.round(CELL_H * CONTENT), lineRatio: LINE_RATIO },
)

if (res.error) {
  console.error('[fail]', res.error)
  await page.close()
  if (ownBrowser) await browser.close()
  else browser.disconnect()
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 写盘
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true })
const outName = `${BOSS}_dash.png`
const buf = Buffer.from(res.png.split(',')[1], 'base64')
fs.writeFileSync(path.join(OUT, outName), buf)

if (argv.includes('--preview')) {
  const dir = path.resolve('.screenshots/dash/post')
  fs.mkdirSync(dir, { recursive: true })
  res.previews.forEach((d, i) => {
    fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(2, '0')}-${ORDER[i]}.png`), Buffer.from(d.split(',')[1], 'base64'))
  })
  console.log(`[prev] ${dir}`)
}

console.log(`[ok ] ${outName}  ${res.w}×${res.h}  ${N} 格  ${(buf.length / 1024).toFixed(1)}KB`)
console.log(
  `[fit] 并集 ${res.union.w}×${res.union.h} → 缩放 ${res.scale.toFixed(4)} → 内容 ${res.content.w}×${res.content.h} @ (${res.content.x},${res.content.y})`,
)
res.frames.forEach((f, i) => {
  const l = f.line ? `底线 y${f.line.top}-${f.line.bottom} 删 ${f.line.px}px` : '无底线'
  const b = f.bbox ? `内容 ${f.bbox.x1 - f.bbox.x0 + 1}×${f.bbox.y1 - f.bbox.y0 + 1} @${f.bbox.x0},${f.bbox.y0}` : '空'
  const o = res.perFrame[i] ? `${res.perFrame[i].w}×${res.perFrame[i].h} bot=${res.perFrame[i].bot}` : '空'
  console.log(`  ${ORDER[i]} ${b}  ${l}  碎块 ${f.comps - 1} 删 ${f.bits}px  出图 ${o}`)
})

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------
const kinds = Object.assign({}, info.kinds || {})
if (!kinds.base && info.file) kinds.base = { file: info.file, frames: 12 }
kinds.dash = { file: `sprites/boss-action/${outName}`, frames: N, frameW: CELL_W, frameH: CELL_H }

const dashIdx = Array.from({ length: N }, (_, i) => `dash:${i}`)
const frames = Object.assign({}, info.frames || {})
frames.dash = dashIdx

const fps = Object.assign({}, info.fps || {})
fps.dash = FPS

const ordered = {}
for (const k of ['idle', 'walk', 'run', 'move', 'dash', 'attack', 'cast', 'hurt', 'dead']) {
  if (frames[k]) ordered[k] = frames[k]
}

manifest[BOSS] = Object.assign({}, info, {
  kinds,
  frames: ordered,
  fps,
})
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`[man] kinds.dash = ${kinds.dash.file}  ${N} 格 @ ${CELL_W}×${CELL_H}  fps ${FPS}`)
console.log(`[man] frames.dash = ${dashIdx.join(' ')}`)

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
