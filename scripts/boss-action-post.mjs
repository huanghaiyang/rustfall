// BOSS 动作序列帧后处理 v2：5 张动作总表 → 每只 40 帧
// 输入：art-source/boss-action/<id>_<kind>.jpg（kind = idle|move|attack|cast|react）
//       每张为 4 列 × 2 行 = 8 格，纯品红 RGB(255,0,255) 背景
// 输出：public/sprites/boss-action/<id>_<kind>.png（8 帧横向图集）+ manifest.json
//
// 帧序（manifest.frames）：
//   idle   : <id>_idle   0..7
//   walk   : <id>_move   0..3
//   run    : <id>_move   4..7
//   attack : <id>_attack 0..7
//   cast   : <id>_cast   0..7
//   hurt   : <id>_react  0..2
//   dead   : <id>_react  3..7
//
// 用法：node scripts/boss-action-post.mjs [id ...]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const SRC = path.resolve('art-source/boss-action')
const OUT = path.resolve('public/sprites/boss-action')
const ART_DEFS = path.resolve('src/game/render/art/theme-boss-art.js')

const KINDS = ['idle', 'move', 'attack', 'cast', 'react']
const FRAMES_PER_SHEET = 8
const SCALE = 2

const FPS = { idle: 6, walk: 9, run: 13, move: 13, attack: 12, cast: 10, hurt: 8, dead: 5 }

const SIZE = new Map()
{
  const txt = fs.readFileSync(ART_DEFS, 'utf8')
  const re = /\[\s*'(tb_[a-z0-9_]+)'\s*,\s*'[a-z_]+'\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g
  let m
  while ((m = re.exec(txt))) SIZE.set(m[1], [Number(m[2]), Number(m[3])])
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const all = fs.existsSync(SRC)
  ? [...new Set(
      fs.readdirSync(SRC)
        .filter((f) => /_(idle|move|attack|cast|react)\.(jpg|png)$/i.test(f))
        .map((f) => f.replace(/_(idle|move|attack|cast|react)\.(jpg|png)$/i, '')),
    )]
  : []
const ids = (only.length ? only : all).sort()

fs.mkdirSync(OUT, { recursive: true })
const manifestPath = path.join(OUT, 'manifest.json')
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}

function findFile(id, kind) {
  for (const ext of ['jpg', 'png']) {
    const f = path.join(SRC, `${id}_${kind}.${ext}`)
    if (fs.existsSync(f)) return f
  }
  return null
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 400, height: 400 },
})
const page = await browser.newPage()
await page.goto('about:blank')

let ok = 0
for (const id of ids) {
  const size = SIZE.get(id)
  if (!size) {
    console.warn('[skip] theme-boss-art.js 里没有尺寸', id)
    continue
  }
  const [lw, lh] = size
  const tw = Math.round(lw * SCALE)
  const th = Math.round(lh * SCALE)

  const parts = []
  for (const kind of KINDS) {
    const f = findFile(id, kind)
    if (f) parts.push({ kind, b64: fs.readFileSync(f).toString('base64') })
  }
  if (!parts.length) {
    console.warn('[skip] 没有任何动作表', id)
    continue
  }

  const res = await page.evaluate(
    async ({ parts, tw, th, expect }) => {
      const load = async (b64) => {
        const img = new Image()
        img.src = 'data:image/jpeg;base64,' + b64
        await img.decode()
        return img
      }

      // 品红键抠底 + 去紫边 + alpha 二值
      function prep(img) {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0)
        const image = ctx.getImageData(0, 0, c.width, c.height)
        const d = image.data
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]
          const g = d[i + 1]
          const b = d[i + 2]
          // 品红判定：红蓝都高、绿明显低
          const magenta = r > 100 && b > 85 && g < Math.min(r, b) * 0.76 && r - g > 45 && b - g > 28
          if (magenta) {
            d[i + 3] = 0
            continue
          }
          // 边缘紫溢色：把红蓝往灰拉、绿提一点
          if (r > g + 12 && b > g + 12) {
            const m = (r + b) * 0.5
            d[i] = Math.round(r * 0.55 + m * 0.45)
            d[i + 2] = Math.round(b * 0.55 + m * 0.45)
            d[i + 1] = Math.min(255, Math.round(g * 1.12))
          }
          d[i + 3] = d[i + 3] >= 128 ? 255 : 0
        }
        ctx.putImageData(image, 0, 0)
        return { canvas: c, ctx, d, w: c.width, h: c.height }
      }

      // 格线：横向 4 列 × 纵向 2 行（画布 2:1 时首选；接近方形时按内容覆盖率再判一次）
      function detectGrid(sheet) {
        const score = (cols, rows) => {
          const band = 3
          let purity = 0
          let n = 0
          for (let c = 1; c < cols; c++) {
            const x = Math.round((sheet.w * c) / cols)
            let op = 0
            let tot = 0
            for (let dx = -band; dx <= band; dx++) {
              const px = x + dx
              if (px < 0 || px >= sheet.w) continue
              for (let y = 0; y < sheet.h; y++) {
                tot++
                if (sheet.d[(y * sheet.w + px) * 4 + 3] > 0) op++
              }
            }
            purity += 1 - op / Math.max(1, tot)
            n++
          }
          for (let r = 1; r < rows; r++) {
            const y = Math.round((sheet.h * r) / rows)
            let op = 0
            let tot = 0
            for (let dy = -band; dy <= band; dy++) {
              const py = y + dy
              if (py < 0 || py >= sheet.h) continue
              for (let x = 0; x < sheet.w; x++) {
                tot++
                if (sheet.d[(py * sheet.w + x) * 4 + 3] > 0) op++
              }
            }
            purity += 1 - op / Math.max(1, tot)
            n++
          }
          // 每格都要有内容，防止把空带当成格线
          let minCov = 1
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const x0 = Math.floor((sheet.w * c) / cols)
              const x1 = Math.floor((sheet.w * (c + 1)) / cols)
              const y0 = Math.floor((sheet.h * r) / rows)
              const y1 = Math.floor((sheet.h * (r + 1)) / rows)
              let op = 0
              for (let y = y0 + 6; y < y1 - 6; y += 3) {
                for (let x = x0 + 6; x < x1 - 6; x += 3) {
                  if (sheet.d[(y * sheet.w + x) * 4 + 3] > 0) op++
                }
              }
              minCov = Math.min(minCov, op / Math.max(1, ((x1 - x0) * (y1 - y0)) / 9))
            }
          }
          return purity / Math.max(1, n) + Math.min(0.25, minCov * 0.5)
        }

        const aspect = sheet.w / sheet.h
        if (aspect >= 1.4) return [4, 2]
        if (aspect <= 0.72) return [2, 4]
        return score(4, 2) >= score(2, 4) ? [4, 2] : [2, 4]
      }

      function cellsOf(sheet) {
        const [cols, rows] = detectGrid(sheet)
        const out = []
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x0 = Math.floor((sheet.w * c) / cols)
            const x1 = Math.floor((sheet.w * (c + 1)) / cols)
            const y0 = Math.floor((sheet.h * r) / rows)
            const y1 = Math.floor((sheet.h * (r + 1)) / rows)
            const m = 4 // 清掉格边，防止 AI 画的分隔线进包围盒
            for (let y = y0; y < Math.min(y1, y0 + m); y++)
              for (let x = x0; x < x1; x++) sheet.d[(y * sheet.w + x) * 4 + 3] = 0
            for (let y = Math.max(y0, y1 - m); y < y1; y++)
              for (let x = x0; x < x1; x++) sheet.d[(y * sheet.w + x) * 4 + 3] = 0
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < Math.min(x1, x0 + m); x++) sheet.d[(y * sheet.w + x) * 4 + 3] = 0
              for (let x = Math.max(x0, x1 - m); x < x1; x++) sheet.d[(y * sheet.w + x) * 4 + 3] = 0
            }
            let bx0 = x1
            let by0 = y1
            let bx1 = -1
            let by1 = -1
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                if (sheet.d[(y * sheet.w + x) * 4 + 3] > 0) {
                  if (x < bx0) bx0 = x
                  if (y < by0) by0 = y
                  if (x > bx1) bx1 = x
                  if (y > by1) by1 = y
                }
              }
            }
            out.push(bx1 < 0 ? null : { sx: bx0, sy: by0, bw: bx1 - bx0 + 1, bh: by1 - by0 + 1 })
          }
        }
        sheet.ctx.putImageData(new ImageData(sheet.d, sheet.w, sheet.h), 0, 0)
        return { cells: out, cols, rows }
      }

      const result = {}
      for (const part of parts) {
        const img = await load(part.b64)
        const sheet = prep(img)
        const sliced = cellsOf(sheet)
        const cells = sliced.cells.slice(0, expect)
        const firstIdx = cells.findIndex((c) => c)
        if (firstIdx < 0) {
          result[part.kind] = { error: 'all empty' }
          continue
        }
        // 空格用第一格顶上，保证帧数固定
        for (let i = 0; i < cells.length; i++) if (!cells[i]) cells[i] = cells[firstIdx]

        // 同一张表内统一缩放（防止逐帧大小跳动）
        let maxBh = 1
        let maxBw = 1
        for (const c of cells) {
          maxBh = Math.max(maxBh, c.bh)
          maxBw = Math.max(maxBw, c.bw)
        }
        const scale = Math.min((th - 4) / maxBh, (tw - 4) / maxBw)

        const atlas = document.createElement('canvas')
        atlas.width = tw * expect
        atlas.height = th
        const actx = atlas.getContext('2d', { willReadFrequently: true })
        actx.imageSmoothingEnabled = true
        actx.imageSmoothingQuality = 'high'

        const used = []
        for (let i = 0; i < expect; i++) {
          const c = cells[i]
          const dw = Math.max(2, Math.round(c.bw * scale))
          const dh = Math.max(2, Math.round(c.bh * scale))
          const dx = i * tw + Math.round((tw - dw) / 2)
          const dy = th - dh - 1
          actx.drawImage(sheet.canvas, c.sx, c.sy, c.bw, c.bh, dx, dy, dw, dh)
          used.push([dw, dh])
        }

        // 量化 + alpha 二值
        const imgData = actx.getImageData(0, 0, atlas.width, atlas.height)
        const d = imgData.data
        const L = 14
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 110) {
            d[i + 3] = 0
            continue
          }
          d[i + 3] = 255
          d[i] = Math.round((Math.round((d[i] / 255) * (L - 1)) / (L - 1)) * 255)
          d[i + 1] = Math.round((Math.round((d[i + 1] / 255) * (L - 1)) / (L - 1)) * 255)
          d[i + 2] = Math.round((Math.round((d[i + 2] / 255) * (L - 1)) / (L - 1)) * 255)
        }
        actx.putImageData(imgData, 0, 0)

        result[part.kind] = {
          png: atlas.toDataURL('image/png'),
          w: atlas.width,
          h: atlas.height,
          grid: `${sliced.cols}x${sliced.rows}`,
          cov: cells.map((c) => Math.round((c.bw * scale) / tw * 100)),
        }
      }
      return result
    },
    { parts, tw, th, expect: FRAMES_PER_SHEET },
  )

  let added = 0
  for (const kind of KINDS) {
    const r = res[kind]
    if (!r || r.error) continue
    const png = Buffer.from(r.png.split(',')[1], 'base64')
    fs.writeFileSync(path.join(OUT, `${id}_${kind}.png`), png)
    added++
    console.log(
      `[ok] ${id}_${kind}  ${r.w}x${r.h}  格 ${r.grid}  ` +
        `宽占比 ${r.cov.join(',')}  ${(png.length / 1024).toFixed(1)}KB`,
    )
  }
  if (!added) {
    console.warn('[fail] 所有动作表都切空了', id)
    continue
  }

  const kinds = {}
  for (const kind of KINDS) {
    if (!res[kind] || res[kind].error) continue
    kinds[kind] = { file: `sprites/boss-action/${id}_${kind}.png`, frames: FRAMES_PER_SHEET }
  }
  manifest[id] = {
    kinds,
    frameW: tw,
    frameH: th,
    logicalW: lw,
    logicalH: lh,
    fps: FPS,
    frames: {
      idle: kinds.idle ? [0, 1, 2, 3, 4, 5, 6, 7] : null,
      walk: kinds.move ? [0, 1, 2, 3] : null,
      run: kinds.move ? [4, 5, 6, 7] : null,
      attack: kinds.attack ? [0, 1, 2, 3, 4, 5, 6, 7] : null,
      cast: kinds.cast ? [0, 1, 2, 3, 4, 5, 6, 7] : null,
      hurt: kinds.react ? [0, 1, 2] : null,
      dead: kinds.react ? [3, 4, 5, 6, 7] : null,
    },
  }
  ok++
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`[done] ${ok}/${ids.length} 只 → manifest ${Object.keys(manifest).length} 条`)
await browser.close()
