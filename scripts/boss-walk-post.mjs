// ============================================================================
// BOSS 走路序列帧后处理：N 张单帧 PNG（已去背景 / 已裁剪）→ 一张横向图集 + manifest 帧组
// ----------------------------------------------------------------------------
// 输入（默认：数据执政官「原地走路」关键帧 001~010）
//   D:/sgames/image-clip/data/library/rustfall/data_archon/图片/原地走路/关键帧-去背景-裁剪/
//   数据执政官-原地走路-001-去背景-透明裁剪.png … 010
// 输出
//   public/sprites/boss-action/<bossId>_walk.png   10 格 × (frameW × frameH)
//   public/sprites/boss-action/manifest.json       追加 kinds.walk + frames.walk/run
//
// 用法
//   node scripts/boss-walk-post.mjs
//   node scripts/boss-walk-post.mjs --boss tb_data_archon --from 1 --to 10
//   node scripts/boss-walk-post.mjs --src "<目录>" --content 0.8
//
// 浏览器来源：默认连已有的 Chrome 调试口（--cdp，默认 127.0.0.1:9333）；
// 连不上再自己 launch（本机沙箱下 spawn 可能 EPERM，所以优先 connect）。
//
// 关键处理（每一条都对应一个真实坑）
//   1. 抠底线：源图底部有一条 ~7px 高的横向基准线（外加几段短横线）。整行裁掉会削脚趾，
//      所以只删「上方若干行内没有身体延伸」的列 —— 脚底与线相接处保留。
//   2. 小连通块：那几段短线是独立连通块，按「面积 < 最大块 0.5%」剔除。
//   3. 统一缩放 + 统一落点：10 帧共用同一个缩放和一个落点（并集包围盒），
//      逐帧各自 fit 会让身体每帧伸缩抖动。
//   4. 目标高度对齐 idle 帧（≈0.8 格高），否则 idle→run 会出现尺寸跳变。
//   5. alpha 二值 + 14 级量化：沿用 boss-action-post.mjs 的像素规范，避免半透明灰边。
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
const SRC = argOf('src', 'D:/sgames/image-clip/data/library/rustfall/data_archon/图片/原地走路/关键帧-去背景-裁剪')
const PREFIX = argOf('prefix', '数据执政官-原地走路-')
const FROM = Number(argOf('from', 1))
const TO = Number(argOf('to', 10))
/** 目标内容高度占格高的比例：对齐既有 idle 帧（273/336≈0.81、262/336≈0.78） */
const CONTENT = Number(argOf('content', 0.8))
/** 源图里「横向长线」判定：一行最长的连续不透明段 ≥ 宽 × 该比例 */
const LINE_RATIO = Number(argOf('line', 0.45))

// ---------------------------------------------------------------------------
// 找源文件
// ---------------------------------------------------------------------------
const files = []
for (let i = FROM; i <= TO; i++) {
  const tag = String(i).padStart(3, '0')
  const f = fs.readdirSync(SRC).find((n) => n.startsWith(PREFIX + tag + '-'))
  if (!f) {
    console.error(`[fail] 找不到第 ${tag} 帧（${PREFIX}${tag}-*）`)
    process.exit(1)
  }
  files.push(path.join(SRC, f))
}
console.log(`[in ] ${BOSS} ← ${files.length} 帧 @ ${SRC}`)

// ---------------------------------------------------------------------------
// 读 manifest 拿格尺寸（必须和既有 12 帧图集同格，否则 loader 会算错帧数）
// ---------------------------------------------------------------------------
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {}
const info = manifest[BOSS] || {}
const frameW = Number(info.frameW) || 272
const frameH = Number(info.frameH) || 336
const logicalW = Number(info.logicalW) || Math.round(frameW / 2)
const logicalH = Number(info.logicalH) || Math.round(frameH / 2)
const N = files.length
console.log(`[cfg] 格 ${frameW}×${frameH}  逻辑 ${logicalW}×${logicalH}  内容高 ${Math.round(frameH * CONTENT)}px`)

const parts = files.map((f) => ({ b64: fs.readFileSync(f).toString('base64'), name: path.basename(f) }))

// ---------------------------------------------------------------------------
// 浏览器
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
    const load = async (b64) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      return img
    }

    // ---- 1. 去底线 + 2. 剔除小连通块 -------------------------------------
    // 全局统一的 alpha 阈值：判定/去块/二值必须用同一个数，否则二值化会凭空造出新像素
    const ALPHA_T = 110

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

      // 每行最长连续不透明段
      function longestRun(y) {
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

      // 从底部向上扫「长线行」带
      let lineBottom = -1
      let lineTop = -1
      const minRun = W * lineRatio
      for (let y = H - 1; y >= 0 && H - 1 - y <= 24; y--) {
        if (longestRun(y) >= minRun) {
          if (lineBottom < 0) lineBottom = y
          lineTop = y
        } else if (lineBottom >= 0) {
          break
        }
      }
      let removedLine = 0
      if (lineTop >= 0) {
        // 线带的「顶部反锯齿行」可能只有半宽，达不到 lineRatio 判定线，会残留一整行细线；
        // 所以从 lineTop 再往上吃掉几行「半长横线」行（脚部每行最长段只有 ~0.13W，不会被误吃）。
        for (let k = 0; k < 5 && lineTop > 0; k++) {
          if (longestRun(lineTop - 1) >= minRun * 0.5) lineTop--
          else break
        }
        // 整条带一律删掉。只删「身体没延伸到的列」会留下一小段线挂在脚边（线比脚宽），
        // 而线的厚度只有 7 源像素（缩放后 ~3px），整带删掉的代价只是脚底被削 3px，
        // 换来的是 10 帧统一的地面线 —— 走路循环更需要这个。
        for (let y = lineTop; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!op(x, y)) continue
            d[(y * W + x) * 4 + 3] = 0
            removedLine++
          }
        }
      }

      // 连通块：剔除面积 < 最大块 0.5% 的碎块（底线两侧的短横线等）
      const seen = new Uint8Array(W * H)
      const comps = []
      const stack = []
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i0 = y * W + x
          if (seen[i0] || d[i0 * 4 + 3] < ALPHA_T) continue
          let area = 0
          let x0 = x, y0 = y, x1 = x, y1 = y
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
        // 重扫一次该块，清零
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

      // alpha 二值（RGBA 保持原色，缩放交给浏览器在预乘空间做，避免白边）
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= ALPHA_T ? 255 : 0
      ctx.putImageData(image, 0, 0)

      // 实测包围盒
      let bx0 = W, by0 = H, bx1 = -1, by1 = -1
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
    for (const p of parts) {
      const img = await load(p.b64)
      frames.push(clean(img))
    }

    // ---- 3. 并集包围盒 → 统一缩放 / 统一落点 -----------------------------
    let ux0 = 1e9, uy0 = 1e9, ux1 = -1, uy1 = -1
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

    // ---- 画图集 ---------------------------------------------------------
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

    // 逐格实测内容尺寸（验证 10 帧一致、无逐帧抖动）
    const perFrame = []
    for (let i = 0; i < N; i++) {
      let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1
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
      perFrame.push(
        bx1 < 0
          ? null
          : { w: bx1 - bx0 + 1, h: by1 - by0 + 1, x: bx0 - i * frameW, bot: by1 },
      )
    }

    return {
      png: atlas.toDataURL('image/png'),
      previews: frames.map((f) => f.canvas.toDataURL('image/png')),
      w: atlas.width,
      h: atlas.height,
      scale,
      union: { x0: ux0, y0: uy0, w: uw, h: uh },
      content: { w: dw, h: dh, x: dx, y: dy },
      frames: frames.map((f) => ({
        bbox: f.bbox,
        line: f.line,
        bits: f.bits,
        comps: f.comps,
      })),
      perFrame,
    }
  },
  { parts, frameW, frameH, N, contentH: Math.round(frameH * CONTENT), lineRatio: LINE_RATIO },
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
const outName = `${BOSS}_walk.png`
const buf = Buffer.from(res.png.split(',')[1], 'base64')
fs.writeFileSync(path.join(OUT, outName), buf)

if (argv.includes('--preview')) {
  const dir = path.resolve('.screenshots/boss-walk-post')
  fs.mkdirSync(dir, { recursive: true })
  res.previews.forEach((d, i) => {
    fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(2, '0')}.png`), Buffer.from(d.split(',')[1], 'base64'))
  })
  console.log(`[prev] ${dir}/01..${String(N).padStart(2, '0')}.png`)
}

console.log(`[ok ] ${outName}  ${res.w}×${res.h}  ${N} 格  ${(buf.length / 1024).toFixed(1)}KB`)
console.log(`[fit] 并集 ${res.union.w}×${res.union.h} → 缩放 ${res.scale.toFixed(4)} → 内容 ${res.content.w}×${res.content.h} @ (${res.content.x},${res.content.y})`)
res.frames.forEach((f, i) => {
  const l = f.line ? `底线 y${f.line.top}-${f.line.bottom} 删 ${f.line.px}px` : '无底线'
  const b = f.bbox ? `内容 ${f.bbox.x1 - f.bbox.x0 + 1}×${f.bbox.y1 - f.bbox.y0 + 1} @${f.bbox.x0},${f.bbox.y0}` : '空'
  const out = res.perFrame[i] ? `${res.perFrame[i].w}×${res.perFrame[i].h} bot=${res.perFrame[i].bot}` : '空'
  console.log(`  ${String(i + 1).padStart(2, '0')} ${b}  ${l}  碎块 ${f.comps - 1} 删 ${f.bits}px  出图 ${out}`)
})

// manifest：kinds 分图集 + frames 用 "kind:index" 引用
const kinds = Object.assign({}, info.kinds || {})
if (!kinds.base) {
  kinds.base = { file: info.file, frames: Math.max(1, Math.round(3264 / frameW)) }
  // 旧格式只有一张合并图集：帧数从旧 frames 的最大下标推断不出来，用文件实际宽度兜底
  try {
    const p = path.resolve('public', (info.file || '').replace(/^\/+/, ''))
    if (fs.existsSync(p)) {
      const w = pngWidth(fs.readFileSync(p))
      if (w) kinds.base.frames = Math.max(1, Math.round(w / frameW))
    }
  } catch (e) { /* 保留默认 */ }
}
kinds.walk = { file: `sprites/boss-action/${outName}`, frames: N }

const oldFrames = info.frames || {}
const baseFrames = oldFrames.base || {
  idle: [0, 1],
  run: [2, 3, 4, 5],
  attack: [6, 7],
  cast: [8, 9],
  hurt: [10],
  dead: [11],
}
// 旧帧号 → base 图集帧号
const baseIdxOf = (name) => {
  const v = baseFrames[name]
  if (!Array.isArray(v)) return null
  return v.map((x) => (typeof x === 'number' ? x : null)).filter((x) => x !== null)
}

const walkIdx = Array.from({ length: N }, (_, i) => `walk:${i}`)
const frames = {}
for (const name of ['idle', 'attack', 'cast', 'hurt', 'dead', 'move']) {
  const idx = baseIdxOf(name)
  if (idx && idx.length) frames[name] = idx.map((i) => `base:${i}`)
}
frames.walk = walkIdx
frames.run = walkIdx.slice()
// frames 顺序固定一下，便于 diff
const ordered = {}
for (const k of ['idle', 'walk', 'run', 'move', 'attack', 'cast', 'hurt', 'dead']) {
  if (frames[k]) ordered[k] = frames[k]
}

manifest[BOSS] = {
  kinds,
  frameW,
  frameH,
  logicalW,
  logicalH,
  fps: info.fps || { idle: 6, walk: 11, run: 11, move: 11, attack: 12, cast: 10, hurt: 8, dead: 5 },
  frames: ordered,
}
if (info.file) manifest[BOSS].file = info.file
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
console.log(`[ok ] manifest.json ← ${BOSS}: kinds ${Object.keys(kinds).join('/')}  frames ${Object.keys(ordered).join('/')}`)

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()

// ---------------------------------------------------------------------------
// 只读 PNG IHDR 拿宽度（避免为了数帧再起一次浏览器）
// ---------------------------------------------------------------------------
function pngWidth(buf) {
  if (buf.length < 24) return 0
  if (buf.readUInt32BE(0) !== 0x89504e47) return 0
  return buf.readUInt32BE(16)
}
