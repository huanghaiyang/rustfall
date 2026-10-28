// BOSS 特效图集后处理 v2：品红抠底 → 4×2 序列格切分 → 逐帧归一 → 横向 8 帧 RGBA 图集
// 输入：art-source/vfx/<name>.jpg（纯品红 RGB(255,0,255) 背景、8 格特效序列）
// 输出：public/sprites/vfx/<name>.png（透明底）+ manifest.json（含 key/blend 标记）
//
// 为什么改品红：黑底素材的底色永远不纯（AI 会画出灰雾、渐变、暗边），
// AdditiveBlending 下会整体发灰；品红键控能把底真正扣成 alpha=0，
// 配合 NormalBlending 边缘干净，不会在场景上叠一层雾。
//
// 用法：node scripts/boss-vfx-post.mjs [name ...]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const SRC = path.resolve('art-source/vfx')
const OUT = path.resolve('public/sprites/vfx')
const FRAME = 256 // 单帧方形尺寸
const COLS = 4
const ROWS = 2
const COUNT = COLS * ROWS

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const all = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => /\.(jpg|png)$/i.test(f)).map((f) => f.replace(/\.(jpg|png)$/i, ''))
  : []
const names = (only.length ? only : all).sort()

fs.mkdirSync(OUT, { recursive: true })
const manifestPath = path.join(OUT, 'manifest.json')
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}

function findFile(name) {
  for (const ext of ['jpg', 'png']) {
    const f = path.join(SRC, `${name}.${ext}`)
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
for (const name of names) {
  const file = findFile(name)
  if (!file) {
    console.warn('[skip] 缺少素材', name)
    continue
  }
  const b64 = fs.readFileSync(file).toString('base64')
  const res = await page.evaluate(
    async ({ b64, FRAME, COUNT, COLS, ROWS }) => {
      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      const src = ctx.getImageData(0, 0, c.width, c.height)
      const d = src.data
      const W = c.width
      const H = c.height

      // ---------- 1. 品红键控 ----------
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]
        const g = d[i + 1]
        const b = d[i + 2]
        const magenta = r > 100 && b > 85 && g < Math.min(r, b) * 0.76 && r - g > 45 && b - g > 28
        if (magenta) {
          d[i + 3] = 0
          continue
        }
        // 边缘紫溢色去边
        if (r > g + 12 && b > g + 12) {
          const m = (r + b) * 0.5
          d[i] = Math.round(r * 0.55 + m * 0.45)
          d[i + 2] = Math.round(b * 0.55 + m * 0.45)
          d[i + 1] = Math.min(255, Math.round(g * 1.12))
        }
        d[i + 3] = d[i + 3] >= 128 ? 255 : 0
      }
      ctx.putImageData(src, 0, 0)

      // ---------- 2. 格线判定（画布比例优先） ----------
      function score(cols, rows) {
        const band = 3
        let clear = 0
        let n = 0
        for (let i = 1; i < cols; i++) {
          const x = Math.round((W * i) / cols)
          let op = 0
          let tot = 0
          for (let dx = -band; dx <= band; dx++) {
            const px = Math.min(W - 1, Math.max(0, x + dx))
            for (let y = 0; y < H; y += 2) {
              tot++
              if (d[(y * W + px) * 4 + 3] > 0) op++
            }
          }
          clear += 1 - op / Math.max(1, tot)
          n++
        }
        for (let i = 1; i < rows; i++) {
          const y = Math.round((H * i) / rows)
          let op = 0
          let tot = 0
          for (let dy = -band; dy <= band; dy++) {
            const py = Math.min(H - 1, Math.max(0, y + dy))
            for (let x = 0; x < W; x += 2) {
              tot++
              if (d[(py * W + x) * 4 + 3] > 0) op++
            }
          }
          clear += 1 - op / Math.max(1, tot)
          n++
        }
        return clear / Math.max(1, n)
      }

      const aspect = W / H
      let best
      if (aspect >= 1.4) best = [COLS, ROWS]
      else if (aspect <= 0.72) best = [ROWS, COLS]
      else best = score(COLS, ROWS) >= score(ROWS, COLS) ? [COLS, ROWS] : [ROWS, COLS]
      const [cols, rows] = best

      // ---------- 3. 逐格量包围盒 ----------
      const boxes = []
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          const x0 = Math.floor((W * cc) / cols)
          const x1 = Math.floor((W * (cc + 1)) / cols)
          const y0 = Math.floor((H * r) / rows)
          const y1 = Math.floor((H * (r + 1)) / rows)
          const m = 4
          let bx0 = x1
          let by0 = y1
          let bx1 = -1
          let by1 = -1
          for (let y = y0 + m; y < y1 - m; y++) {
            for (let x = x0 + m; x < x1 - m; x++) {
              if (d[(y * W + x) * 4 + 3] > 0) {
                if (x < bx0) bx0 = x
                if (y < by0) by0 = y
                if (x > bx1) bx1 = x
                if (y > by1) by1 = y
              }
            }
          }
          boxes.push(bx1 < 0 ? null : { sx: bx0, sy: by0, bw: bx1 - bx0 + 1, bh: by1 - by0 + 1 })
        }
      }

      // ---------- 4. 统一缩放 + 居中拼图集（透明底） ----------
      let maxBw = 1
      let maxBh = 1
      for (const b of boxes) {
        if (!b) continue
        maxBw = Math.max(maxBw, b.bw)
        maxBh = Math.max(maxBh, b.bh)
      }
      const scale = Math.min((FRAME - 6) / maxBw, (FRAME - 6) / maxBh)

      const atlas = document.createElement('canvas')
      atlas.width = FRAME * COUNT
      atlas.height = FRAME
      const actx = atlas.getContext('2d', { willReadFrequently: true })
      actx.imageSmoothingEnabled = true
      actx.imageSmoothingQuality = 'high'

      const used = []
      for (let i = 0; i < COUNT; i++) {
        const b = boxes[i] || boxes.find((x) => x)
        if (!b) continue
        const dw = Math.max(2, Math.round(b.bw * scale))
        const dh = Math.max(2, Math.round(b.bh * scale))
        const dx = i * FRAME + Math.round((FRAME - dw) / 2)
        const dy = Math.round((FRAME - dh) / 2)
        actx.drawImage(c, b.sx, b.sy, b.bw, b.bh, dx, dy, dw, dh)
        used.push([dw, dh])
      }

      // ---------- 5. 量化 + alpha 二值 ----------
      const out = actx.getImageData(0, 0, atlas.width, atlas.height)
      const od = out.data
      const L = 12
      for (let i = 0; i < od.length; i += 4) {
        if (od[i + 3] < 110) {
          od[i + 3] = 0
          continue
        }
        od[i + 3] = 255
        od[i] = Math.round((Math.round((od[i] / 255) * (L - 1)) / (L - 1)) * 255)
        od[i + 1] = Math.round((Math.round((od[i + 1] / 255) * (L - 1)) / (L - 1)) * 255)
        od[i + 2] = Math.round((Math.round((od[i + 2] / 255) * (L - 1)) / (L - 1)) * 255)
      }
      actx.putImageData(out, 0, 0)

      return {
        png: atlas.toDataURL('image/png'),
        w: atlas.width,
        h: atlas.height,
        grid: `${cols}x${rows}`,
        used,
      }
    },
    { b64, FRAME, COUNT, COLS, ROWS },
  )

  const png = Buffer.from(res.png.split(',')[1], 'base64')
  fs.writeFileSync(path.join(OUT, name + '.png'), png)
  manifest[name] = {
    file: `sprites/vfx/${name}.png`,
    w: res.w,
    h: res.h,
    frameW: FRAME,
    frameH: FRAME,
    count: COUNT,
    fps: 18,
    grid: res.grid,
    key: 'magenta',
    blend: 'normal',
  }
  ok++
  console.log(`[ok] ${name}  ${res.w}x${res.h}  格 ${res.grid}  ${(png.length / 1024).toFixed(1)}KB`)
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`[done] ${ok}/${names.length} 张 → manifest ${Object.keys(manifest).length} 条`)
await browser.close()
