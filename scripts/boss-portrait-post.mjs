// AI BOSS 立绘后处理：品红键抠底 → 去地平线 → 裁包围盒 → 降采样 → 量化 → alpha 二值化 → PNG
// 输入：art-source/boss/<id>.jpg（GenerateImage 产物，纯 #FF00FF 底）
// 输出：public/sprites/boss/<id>.png + manifest.json
//
// 用法：node scripts/boss-portrait-post.mjs [id ...]
//   不带参数：处理 art-source/boss 下的全部素材
//   带参数：只处理指定的 id（便于迭代单张）
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const SRC = path.resolve('art-source/boss')
const OUT = path.resolve('public/sprites/boss')
const ART_DEFS = path.resolve('src/game/render/art/theme-boss-art.js')

// 游戏内逻辑尺寸取自 theme-boss-art.js 的 ROWS 表（[id, family, w, h, ...]）
const SIZE = new Map()
{
  const txt = fs.readFileSync(ART_DEFS, 'utf8')
  const re = /\[\s*'(tb_[a-z0-9_]+)'\s*,\s*'[a-z_]+'\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g
  let m
  while ((m = re.exec(txt))) SIZE.set(m[1], [Number(m[2]), Number(m[3])])
}

// 输出 2 倍图，游戏里按 1 倍世界尺寸显示
const SCALE = 2

const only = process.argv.slice(2)
const ids = (only.length ? only : fs.readdirSync(SRC).filter((f) => f.endsWith('.jpg')).map((f) => f.replace(/\.jpg$/, '')))
  .sort()

fs.mkdirSync(OUT, { recursive: true })

const manifestPath = path.join(OUT, 'manifest.json')
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}

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
  const file = path.join(SRC, id + '.jpg')
  if (!fs.existsSync(file)) {
    console.warn('[skip] 缺少素材', file)
    continue
  }
  const size = SIZE.get(id)
  if (!size) {
    console.warn('[skip] theme-boss-art.js 里没有尺寸', id)
    continue
  }
  const [lw, lh] = size
  const b64 = fs.readFileSync(file).toString('base64')
  const tw = Math.round(lw * SCALE)
  const th = Math.round(lh * SCALE)

  const res = await page.evaluate(async ({ b64, tw, th }) => {
    const img = new Image()
    img.src = 'data:image/jpeg;base64,' + b64
    await img.decode()

    // ---- 1. 原始像素 ----
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

    // ---- 2. 品红键抠底（含 JPG 压缩造成的边缘溢色） ----
    let cleared = 0
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      const magenta = r > 110 && b > 90 && g < Math.min(r, b) * 0.72 && r - g > 55 && b - g > 35
      if (magenta) {
        d[i + 3] = 0
        cleared++
      } else if (r > g + 12 && b > g + 12) {
        // despill：粉边去饱和，避免抠图后残留紫边
        const m = (r + b) * 0.5
        d[i] = Math.round(r * 0.55 + m * 0.45)
        d[i + 2] = Math.round(b * 0.55 + m * 0.45)
        d[i + 1] = Math.min(255, Math.round(g * 1.12))
      }
    }
    // alpha 二值化（原始尺寸先清干净）
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0

    // ---- 2.5 去掉 AI 画的地平线（底部区域的超长横向连续不透明 run） ----
    const bandTop = Math.floor(H * 0.9)
    for (let y = bandTop; y < H; y++) {
      let run = 0
      let best = 0
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 0) {
          run++
          if (run > best) best = run
        } else run = 0
      }
      if (best > W * 0.5) {
        for (let x = 0; x < W; x++) d[(y * W + x) * 4 + 3] = 0
      }
    }

    ctx.putImageData(src, 0, 0)

    // ---- 3. 内容包围盒 ----
    let x0 = W
    let y0 = H
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x
          if (y < y0) y0 = y
          if (x > x1) x1 = x
          if (y > y1) y1 = y
        }
      }
    }
    if (x1 < 0) return { error: '抠图后为空' }
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1

    // ---- 4. 缩放（高质量重采样）到目标像素尺寸，保持比例，底部对齐 ----
    const scale = Math.min((tw - 4) / bw, (th - 4) / bh)
    const dw = Math.max(4, Math.round(bw * scale))
    const dh = Math.max(4, Math.round(bh * scale))
    const out = document.createElement('canvas')
    out.width = tw
    out.height = th
    const octx = out.getContext('2d', { willReadFrequently: true })
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    const ox = Math.round((tw - dw) / 2)
    const oy = th - dh - 1
    octx.drawImage(c, x0, y0, bw, bh, ox, oy, dw, dh)

    // ---- 5. 量化 + 二值 alpha ----
    const oimg = octx.getImageData(0, 0, tw, th)
    const od = oimg.data
    const L = 14 // 每通道 14 级 → 2744 色上限，足够精细但清掉 JPG 噪点
    for (let i = 0; i < od.length; i += 4) {
      const a = od[i + 3]
      if (a < 110) {
        od[i + 3] = 0
        continue
      }
      od[i + 3] = 255
      od[i] = Math.round((Math.round(od[i] / 255 * (L - 1)) / (L - 1)) * 255)
      od[i + 1] = Math.round((Math.round(od[i + 1] / 255 * (L - 1)) / (L - 1)) * 255)
      od[i + 2] = Math.round((Math.round(od[i + 2] / 255 * (L - 1)) / (L - 1)) * 255)
    }
    octx.putImageData(oimg, 0, 0)

    return { png: out.toDataURL('image/png'), w: tw, h: th, cleared, box: [bw, bh] }
  }, { b64, tw, th })

  if (res.error) {
    console.warn(`[fail] ${id}: ${res.error}`)
    continue
  }
  const png = Buffer.from(res.png.split(',')[1], 'base64')
  fs.writeFileSync(path.join(OUT, id + '.png'), png)
  manifest[id] = { file: `sprites/boss/${id}.png`, w: res.w, h: res.h, logicalW: lw, logicalH: lh }
  ok++
  console.log(`[ok] ${id}  ${res.w}x${res.h}  抠掉 ${res.cleared} 像素  内容盒 ${res.box.join('x')}  ${(png.length / 1024).toFixed(1)}KB`)
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`[done] ${ok}/${ids.length} 张 → manifest ${Object.keys(manifest).length} 条`)

await browser.close()
