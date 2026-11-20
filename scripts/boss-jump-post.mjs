// ============================================================================
// BOSS 跳跃序列帧后处理：41 张单帧 PNG（已去背景 / 已裁剪）→ 横向图集 + manifest
// ----------------------------------------------------------------------------
// 输入（默认：数据执政官「原地起跳」关键帧 001~041）
//   D:/sgames/image-clip/data/library/rustfall/data_archon/图片/原地起跳/关键帧-去背景-裁剪/
//   数据执政官-原地起跳-裁剪-001.png … 041
// 输出
//   public/sprites/boss-action/<bossId>_jump.png     41 格 × (frameW × frameH)
//   public/sprites/boss-action/manifest.json         kinds.jump + frames.jump / frames.land
//
// 和 boss-walk-post.mjs 的差别（跳跃不能用走路的「并集包围盒」）：
//   · 走路：并集 bbox 统一缩放 + 统一落点，保证 10 帧脚底不抖。
//   · 跳跃：源图是一整段「蹲 → 蹬 → 腾空 → 落地 → 起身」，身体在画布里上下大幅移动。
//     如果沿用并集，起跳高度会被烘进图里，再叠加引擎的 body.y 就会「跳两次」。
//     所以这里**逐帧取自己的 bbox、统一缩放（按站立帧定身高）、统一贴底**：
//     图里只有姿势，腾空的位移交给物理。
//
// 帧组（0 基）：
//   jump  013..028  （蹬地 → 腾空）  26fps ≈ 0.62s，正好等于 _startHop 的滞空时间
//   land  030..041  （落地压缩 → 起身）28fps ≈ 0.43s
//   001..012 的蹲伏/预备与 029 的探地帧不入组，仍保留在图集里（可随时改映射）。
//
// 用法
//   node scripts/boss-jump-post.mjs
//   node scripts/boss-jump-post.mjs --boss tb_data_archon --from 1 --to 41
//   node scripts/boss-jump-post.mjs --src "<目录>" --content 0.8
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
const SRC = argOf('src', 'D:/sgames/image-clip/data/library/rustfall/data_archon/图片/原地起跳/关键帧-去背景-裁剪')
const PREFIX = argOf('prefix', '数据执政官-原地起跳-裁剪-')
const FROM = Number(argOf('from', 1))
const TO = Number(argOf('to', 41))
/** 站立帧的内容高度占格高比例：和 idle/walk 对齐，切动作时不变大变小 */
const CONTENT = Number(argOf('content', 0.8))
const LINE_RATIO = Number(argOf('line', 0.45))

// ---------------------------------------------------------------------------
// 找源文件
// ---------------------------------------------------------------------------
const files = []
for (let i = FROM; i <= TO; i++) {
  const tag = String(i).padStart(3, '0')
  const f = fs.readdirSync(SRC).find((n) => n.startsWith(PREFIX + tag))
  if (!f) {
    console.error(`[fail] 找不到第 ${tag} 帧（${PREFIX}${tag}*）`)
    process.exit(1)
  }
  files.push(path.join(SRC, f))
}
console.log(`[in ] ${BOSS} ← ${files.length} 帧 @ ${SRC}`)

// ---------------------------------------------------------------------------
// 读 manifest 拿格尺寸（必须和既有图集同格，否则 loader 会算错帧数）
// ---------------------------------------------------------------------------
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {}
const info = manifest[BOSS] || {}
const frameW = Number(info.frameW) || 272
const frameH = Number(info.frameH) || 336
const logicalW = Number(info.logicalW) || Math.round(frameW / 2)
const logicalH = Number(info.logicalH) || Math.round(frameH / 2)
const N = files.length
console.log(`[cfg] 格 ${frameW}×${frameH}  逻辑 ${logicalW}×${logicalH}  站立内容高 ${Math.round(frameH * CONTENT)}px`)

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
    const ALPHA_T = 110

    /** 去底线 + 去碎块 + alpha 二值，返回 canvas 与 bbox */
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

      // 底线（跳跃帧一般情况下没有，检测不到就跳过）
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

      // 小连通块（阈值 0.5%）
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

      for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= ALPHA_T ? 255 : 0
      ctx.putImageData(image, 0, 0)

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
        bbox: bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 },
        line: lineTop >= 0 ? { top: lineTop, bottom: lineBottom, px: removedLine } : null,
        bits: removedBits,
        comps: comps.length,
      }
    }

    const frames = []
    for (const p of parts) {
      frames.push(clean(await load(p.b64)))
    }
    if (frames.every((f) => !f.bbox)) return { error: '全部帧都是空的' }

    // ---- 用「站立帧」定身高（1~4 与 37~41），逐帧贴底绘制 ----------------
    const standing = [0, 1, 2, 3, 35, 36, 37, 38, 39, 40].filter((i) => frames[i]?.bbox)
    const hs = standing
      .map((i) => frames[i].bbox.y1 - frames[i].bbox.y0 + 1)
      .sort((a, b) => a - b)
    const refH = hs[Math.floor(hs.length / 2)] || Math.max(...frames.filter((f) => f.bbox).map((f) => f.bbox.y1 - f.bbox.y0 + 1))
    const refW = Math.max(...standing.map((i) => frames[i].bbox.x1 - frames[i].bbox.x0 + 1))

    // 站立帧按 contentH 缩放；再受格宽限制（腾空姿势可能更宽）
    let scale = contentH / refH
    const widest = Math.max(...frames.filter((f) => f.bbox).map((f) => f.bbox.x1 - f.bbox.x0 + 1))
    scale = Math.min(scale, (frameW - 8) / widest, (frameW - 8) / refW)

    const atlas = document.createElement('canvas')
    atlas.width = frameW * N
    atlas.height = frameH
    const actx = atlas.getContext('2d', { willReadFrequently: true })
    actx.imageSmoothingEnabled = true
    actx.imageSmoothingQuality = 'high'

    const placed = []
    for (let i = 0; i < N; i++) {
      const f = frames[i]
      if (!f.bbox) {
        placed.push(null)
        continue
      }
      const sw = f.bbox.x1 - f.bbox.x0 + 1
      const sh = f.bbox.y1 - f.bbox.y0 + 1
      const dw = Math.max(2, Math.round(sw * scale))
      const dh = Math.max(2, Math.round(sh * scale))
      // 水平居中、垂直贴底：姿势不抖，腾空位移交给引擎的 body.y
      const dx = Math.round((frameW - dw) / 2) + i * frameW
      const dy = frameH - dh - 1
      actx.drawImage(f.canvas, f.bbox.x0, f.bbox.y0, sw, sh, dx, dy, dw, dh)
      placed.push({ i, w: dw, h: dh, bot: dy + dh, top: dy })
    }

    // ---- 量化 + alpha 二值（与既有图集同规范）----------------------------
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

    // 逐格实测（验证站立高度统一、没有逐帧抖动）
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
      perFrame.push(bx1 < 0 ? null : { w: bx1 - bx0 + 1, h: by1 - by0 + 1, x: bx0 - i * frameW, bot: by1 })
    }

    return {
      png: atlas.toDataURL('image/png'),
      w: atlas.width,
      h: atlas.height,
      scale,
      refH,
      contentH: Math.round(refH * scale),
      perFrame,
      frames: frames.map((f, i) => ({ bbox: f.bbox, line: f.line, bits: f.bits, comps: f.comps, placed: placed[i] })),
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
const outName = `${BOSS}_jump.png`
const buf = Buffer.from(res.png.split(',')[1], 'base64')
fs.writeFileSync(path.join(OUT, outName), buf)

if (argv.includes('--preview')) {
  const dir = path.resolve('.screenshots/boss-jump-post')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'atlas.png'), buf)
  console.log(`[prev] ${dir}/atlas.png`)
}

console.log(`[ok ] ${outName}  ${res.w}×${res.h}  ${N} 格  ${(buf.length / 1024).toFixed(1)}KB`)
console.log(`[fit] 站立内容 ${res.refH}px → 缩放 ${res.scale.toFixed(4)} → 内容高 ${res.contentH}px（目标 ${Math.round(frameH * CONTENT)}）`)
res.frames.forEach((f, i) => {
  const b = f.bbox ? `源 ${f.bbox.x1 - f.bbox.x0 + 1}×${f.bbox.y1 - f.bbox.y0 + 1}` : '空'
  const o = res.perFrame[i] ? `${res.perFrame[i].w}×${res.perFrame[i].h} bot=${res.perFrame[i].bot}` : '空'
  const l = f.line ? ` 底线 y${f.line.top}-${f.line.bottom} 删${f.line.px}px` : ''
  console.log(`  ${String(i + 1).padStart(3, '0')} ${b} → ${o}${l}`)
})

// ---------------------------------------------------------------------------
// manifest：kinds.jump + frames.jump / frames.land
// ---------------------------------------------------------------------------
const JUMP_FROM = Number(argOf('jump-from', 13)) // 1 基
const JUMP_TO = Number(argOf('jump-to', 28))
const LAND_FROM = Number(argOf('land-from', 30))
const LAND_TO = Number(argOf('land-to', 41))
const JUMP_FPS = Number(argOf('jump-fps', 26))
const LAND_FPS = Number(argOf('land-fps', 28))

const kinds = Object.assign({}, info.kinds || {})
kinds.jump = { file: `sprites/boss-action/${outName}`, frames: N }

const climb = (from, to) => {
  const list = []
  for (let i = from; i <= to; i++) if (i >= 1 && i <= N) list.push(`jump:${i - 1}`)
  return list
}

const oldFrames = info.frames || {}
const frames = {
  idle: oldFrames.idle || ['base:0', 'base:1'],
  walk: oldFrames.walk || [],
  run: oldFrames.run || oldFrames.walk || [],
  dash: oldFrames.dash || [],
  jump: climb(JUMP_FROM, JUMP_TO),
  land: climb(LAND_FROM, LAND_TO),
  attack: oldFrames.attack || ['base:6', 'base:7'],
  cast: oldFrames.cast || ['base:8', 'base:9'],
  hurt: oldFrames.hurt || ['base:10'],
  dead: oldFrames.dead || ['base:11'],
}
const ordered = {}
for (const k of ['idle', 'walk', 'run', 'dash', 'jump', 'land', 'attack', 'cast', 'hurt', 'dead']) {
  if (frames[k] && frames[k].length) ordered[k] = frames[k]
}

const fps = Object.assign({}, info.fps || {})
fps.jump = JUMP_FPS
fps.land = LAND_FPS

manifest[BOSS] = {
  kinds,
  frameW,
  frameH,
  logicalW,
  logicalH,
  fps,
  frames: ordered,
}
if (info.file) manifest[BOSS].file = info.file
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
console.log(
  `[ok ] manifest.json ← ${BOSS}: kinds ${Object.keys(kinds).join('/')}  ` +
    `frames ${Object.keys(ordered).join('/')}  jump=${JUMP_FROM}..${JUMP_TO}@${JUMP_FPS}fps land=${LAND_FROM}..${LAND_TO}@${LAND_FPS}fps`,
)

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
