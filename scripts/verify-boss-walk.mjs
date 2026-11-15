// ============================================================================
// 验证：数据执政官的走路动画是否真的在运行时生效
// ----------------------------------------------------------------------------
// 1. 主菜单 → BOSS 测试房 → 数据执政官（真点 UI）
// 2. 读场上 BOSS 的 frames：各动作帧数 / 帧率 / 是否来自精灵编辑器覆盖
// 3. 把运行时纹理按 UV 逐个还原成一张拼图（证明真的是这 10 帧，而不是磁盘图集）
// 4. 强制播放 run，抓走路中的画面
//
// 用法：node scripts/verify-boss-walk.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const URL = argOf('url', 'http://127.0.0.1:5180/')
const BOSS_ID = argOf('boss', 'tb_data_archon')
const OUT = path.resolve(argOf('out', '.screenshots/boss-walk-verify'))
/** --no-editor：先清掉精灵编辑器工程，验证「只靠磁盘图集」也能出走路帧 */
const NO_EDITOR = argv.includes('--no-editor')
fs.mkdirSync(OUT, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let browser = null
let ownBrowser = false
try {
  browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1600, height: 900 } })
} catch (e) {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  })
  ownBrowser = true
}
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text())
})

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
if (NO_EDITOR) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem('rustfall.spriteeditor.v1')
    } catch (e) { /* ignore */ }
  })
  console.log('[mode] --no-editor：已清空精灵编辑器工程，只验磁盘图集')
  await page.reload({ waitUntil: 'domcontentloaded' })
}
await wait(3000)

// 主菜单 → BOSS 测试房
let hit = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('BOSS测试房'))
  if (!b) return false
  b.click()
  return true
})
if (!hit) {
  console.error('[fail] 主菜单没有 BOSS 测试房 按钮')
  process.exit(1)
}
await wait(1200)

// 找到数据执政官那张卡
const card = await page.evaluate((id) => {
  const els = [...document.querySelectorAll('button, [role="button"], li, article, .card')]
  const c = els.find((x) => x.textContent.includes('数据执政官'))
  if (!c) return { ok: false, names: [...document.querySelectorAll('body *')].length }
  c.click()
  return { ok: true }
}, BOSS_ID)
if (!card.ok) {
  console.error('[fail] BOSS 测试房里没找到数据执政官卡片')
  process.exit(1)
}
await wait(4200)

// ---- 读运行时状态 ---------------------------------------------------------
const state = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g?.director?.largeList?.find((m) => (m.def?.id || '') === 'tb_data_archon') || g?.director?.largeList?.[0]
  if (!b) return { error: '场上没有大型敌人' }
  const frames = b.frames || {}
  const counts = {}
  for (const [k, v] of Object.entries(frames)) counts[k] = Array.isArray(v) ? v.length : 0
  const tex = frames.walk?.[0] || frames.run?.[0] || null
  const srcOf = (t) => String(t?.image?.src || '')
  return {
    id: b.def?.id,
    artId: b.def?.artId,
    anim: b.animName,
    counts,
    fps: b.animFps || null,
    spriteW: b.spriteW,
    spriteH: b.spriteH,
    fromEditor: !!b.art?.fromEditor,
    // 决定性证据：编辑器纹理的图源是 dataURL，磁盘图集是 /sprites/... 的 URL
    texFromEditor: !!tex?.userData?.fromEditor,
    texSrcKind: srcOf(tex).startsWith('data:') ? 'dataURL(编辑器)' : srcOf(tex).slice(0, 60),
    editorProjectKB: (() => {
      try {
        return Math.round((localStorage.getItem('rustfall.spriteeditor.v1') || '').length / 1024)
      } catch (e) {
        return -1
      }
    })(),
    imgSize: tex?.image ? { w: tex.image.width, h: tex.image.height } : null,
    uv: tex ? { rx: tex.repeat.x, ry: tex.repeat.y, ox: tex.offset.x, oy: tex.offset.y } : null,
    pos: b.body ? { x: Math.round(b.body.x), y: Math.round(b.body.y) } : null,
  }
})
console.log('[run ]', JSON.stringify(state, null, 1))
if (state.error) {
  console.error('[fail]', state.error)
  process.exit(1)
}

// ---- 把运行时纹理还原成拼图 -------------------------------------------------
const montage = await page.evaluate((animName) => {
  const g = window.__rustfall
  const b = g?.director?.largeList?.find((m) => (m.def?.id || '') === 'tb_data_archon') || g?.director?.largeList?.[0]
  const list = b?.frames?.[animName] || b?.frames?.run || b?.frames?.walk || []
  if (!list.length) return { error: '没有帧' }
  const first = list[0]
  const img = first.image
  const imgW = img.width
  const imgH = img.height
  const cw = Math.round(first.repeat.x * imgW)
  const ch = Math.round(first.repeat.y * imgH)
  const cv = document.createElement('canvas')
  cv.width = cw * list.length
  cv.height = ch
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingEnabled = false
  list.forEach((t, i) => {
    const sx = Math.round(t.offset.x * imgW)
    const sy = Math.round((1 - t.offset.y - t.repeat.y) * imgH)
    ctx.drawImage(img, sx, sy, cw, ch, i * cw, 0, cw, ch)
  })
  return { png: cv.toDataURL('image/png'), cw, ch, n: list.length, animName }
}, 'run')

if (montage.error) {
  console.error('[fail] montage', montage.error)
} else {
  const p = path.join(OUT, 'runtime-run-frames.png')
  fs.writeFileSync(p, Buffer.from(montage.png.split(',')[1], 'base64'))
  console.log(`[mont] 运行时 run 帧 ${montage.n} × ${montage.cw}×${montage.ch} → ${p}`)
}

// ---- 让它真的走起来：抓 8 张「贴着 BOSS 的裁剪帧」+ 采样当前帧序号 -------------
await page.evaluate(() => {
  const g = window.__rustfall
  const b = g?.director?.largeList?.[0]
  if (b && g.player) {
    g.player.body.x = b.body.x - 190
    b.state = 'chase'
    b.activated = true
    b.facing = -1
  }
})

/** BOSS 在屏幕上的位置（three 投影），用于裁剪截图 */
const screenPos = () =>
  page.evaluate(() => {
    const g = window.__rustfall
    const b = g?.director?.largeList?.[0]
    if (!b?.mesh || !g?.camera) return null
    const V = b.mesh.position.constructor
    const v = b.mesh.getWorldPosition(new V())
    v.project(g.camera)
    const el = document.querySelector('canvas')
    const W = el?.clientWidth || 1600
    const H = el?.clientHeight || 900
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }
  })

const CLIP = 300
const samples = []
let shots = 0
for (let i = 0; i < 40 && shots < 6; i++) {
  // 只抓「正在跑」的画面：把玩家摆到够远、状态钉在 chase
  const st = await page.evaluate(() => {
    const g = window.__rustfall
    const b = g?.director?.largeList?.[0]
    if (!b || !g?.player) return null
    if (b.animName !== 'run') {
      g.player.body.x = b.body.x - 240
      b.state = 'chase'
      b.activated = true
      b.moveCd = 1
    }
    return { anim: b.animName, ox: Number(b.mat?.map?.offset.x || 0) }
  })
  await wait(60)
  if (!st || st.anim !== 'run') continue

  const p = await screenPos()
  if (!p) break
  const clip = {
    x: Math.max(0, Math.min(1600 - CLIP, Math.round(p.x - CLIP / 2))),
    y: Math.max(0, Math.min(900 - CLIP, Math.round(p.y - CLIP * 0.62))),
    width: CLIP,
    height: CLIP,
  }
  const idx = await page.evaluate(() => {
    const g = window.__rustfall
    const b = g?.director?.largeList?.[0]
    const t = b?.mat?.map
    if (!t) return null
    return { ox: Number(t.offset.x.toFixed(3)), frame: Math.round(t.offset.x * 10), anim: b.animName }
  })
  shots++
  await page.screenshot({ path: path.join(OUT, `clip-${shots}.png`), clip })
  samples.push({ ...idx, x: Math.round(p.x), y: Math.round(p.y) })
  await wait(45)
}
console.log('[clip]', JSON.stringify(samples))

await page.screenshot({ path: path.join(OUT, 'gameplay.png') })
const after = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g?.director?.largeList?.[0]
  return { anim: b?.animName, state: b?.state, vx: Math.round(b?.body?.vx || 0), dead: !!b?.dead }
})
console.log('[live]', JSON.stringify(after))

// ---- 发布事件热更新：场上 BOSS 不重进房间就能换帧 ---------------------------
const live = await page.evaluate(async () => {
  const g = window.__rustfall
  const b = g?.director?.largeList?.[0]
  if (!b?.frames?.run?.[0]) return { error: '没有 run 帧' }
  const before = b.frames.run[0].uuid
  window.dispatchEvent(new CustomEvent('rustfall:sprite-editor-published'))
  await new Promise((r) => setTimeout(r, 700))
  const afterUuid = b.frames.run[0].uuid
  const bound = b.mat?.map === b.frames[String(b.animName)]?.[0] || b.frames[String(b.animName)]?.includes(b.mat?.map)
  return { before, afterUuid, hotSwapped: before !== afterUuid, frameCount: b.frames.run.length, boundToMesh: !!bound }
})
console.log('[hot ]', JSON.stringify(live))
console.log(errors.length ? '[warn] ' + JSON.stringify(errors.slice(0, 8)) : '[ok ] 无 console error / pageerror')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
