// ============================================================================
// 验证：编辑器内的「智能识别骨骼 + 碰撞体」全链路
// ----------------------------------------------------------------------------
//   1. 打开精灵编辑器，选中数据执政官 sprite
//   2. autoFitRig(mode=all) → 骨骼/碰撞体写进工程
//   3. 坐标系往返校验：落库的是「层级相对」坐标，经 boneTransforms 还原成绝对坐标后，
//      必须和识别器直接给的绝对坐标吻合（误差 ≤2px）。这一步最容易悄悄错位。
//   4. 截图：编辑器里骨骼按种类配色、碰撞按职责配色
//   5. 发布 → 磁盘 project.json 里能看到 rig 元数据 + kind/role 字段
//
// 用法：node scripts/verify-editor-rig.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const argv = process.argv.slice(2)
const URL = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://127.0.0.1:5180/'
const OUT = path.resolve('.screenshots/boss-walk')
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const fails = []
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '[ ok ]' : '[FAIL]'} ${label}${extra ? '  ' + extra : ''}`)
  if (!cond) fails.push(label)
}

let browser
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
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE ' + m.text())
})
page.on('dialog', (d) => d.accept().catch(() => {}))

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(2400)
const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('精灵/骨骼编辑器'))
  if (!b) return false
  b.click()
  return true
})
if (!opened) {
  console.error('[fail] 打不开精灵编辑器')
  process.exit(1)
}
await page.waitForSelector('.sec-canvas', { timeout: 15000 })
await wait(1200)

// ---- 选出数据执政官 sprite 并识别 ----
const R = await page.evaluate(async () => {
  const E = window.__spriteEditor
  for (let i = 0; i < 60 && (E.BOSS_LIST?.length || 0) === 0; i++) await new Promise((r) => setTimeout(r, 100))
  const sp = E.SE.project.sprites.find((s) => s.refId === 'tb_data_archon') || E.SE.project.sprites[0]
  if (!sp) return { error: '工程里没有 sprite（先用 scripts/sprite-editor-apply-walk.mjs 导入图集）' }
  E.SE.sel.spriteId = sp.id
  E.SE.sel.actionId = sp.actions[0]?.id || ''
  E.SE.sel.frameId = sp.actions[0]?.frames?.[0]?.id || ''

  // 识别前先记下识别器直出的绝对坐标（作为往返校验基准）
  const fit = await import('/src/game/editor/skeleton-fit.js')
  const img = new Image()
  img.src = E.SE.project.sheets.find((s) => s.id === sp.sheetId)?.src || ''
  await img.decode()
  const f0 = sp.actions[0]?.frames?.[0]
  const cv = document.createElement('canvas')
  cv.width = f0.w
  cv.height = f0.h
  const cx = cv.getContext('2d', { willReadFrequently: true })
  cx.imageSmoothingEnabled = false
  cx.drawImage(img, f0.x, f0.y, f0.w, f0.h, 0, 0, f0.w, f0.h)
  const alpha = fit.alphaFromRGBA(cx.getImageData(0, 0, f0.w, f0.h).data, f0.w, f0.h)
  const base = fit.fitSkeleton({ alpha, w: f0.w, h: f0.h, family: 'mech' })

  // (a) 先跑「当前帧」：与识别器直出的那一帧一一对应，做坐标系往返校验
  E.SE.sel.actionId = sp.actions[0]?.id || ''
  E.SE.sel.frameId = f0?.id || ''
  const resCur = await E.autoFitRig(sp, { mode: 'current', family: 'mech' })
  const xfCur = E.boneTransforms(sp)
  const byName = new Map(sp.bones.map((b) => [b.name, b]))
  const diffs = []
  for (const b of base.bones || []) {
    const sb = byName.get(b.name)
    if (!sb) continue
    const t = xfCur.get(sb.id)
    if (!t) continue
    diffs.push({ name: b.name, dx: Math.abs(t.x - b.x), dy: Math.abs(t.y - b.y) })
  }
  const maxErr = diffs.reduce((m, d) => Math.max(m, d.dx, d.dy), 0)
  const worst = diffs.slice().sort((a, b) => Math.max(b.dx, b.dy) - Math.max(a.dx, a.dy))[0]

  // (b) 再跑「整条动作」：这才是落库发布的稳定骨架
  const res = await E.autoFitRig(sp, { mode: 'all', family: 'mech' })
  // 绝对坐标必须都落在帧框附近（层级算错会整片飞出去）
  const xf = E.boneTransforms(sp)
  const outside = []
  for (const b of sp.bones) {
    const t = xf.get(b.id)
    if (!t) continue
    if (t.x < -10 || t.y < -10 || t.x > f0.w + 10 || t.y > f0.h + 10) {
      outside.push(b.name + '(' + Math.round(t.x) + ',' + Math.round(t.y) + ')')
    }
  }

  // 截图画布：把视图对准 sprite 帧
  const sh = document.querySelector('.sec-canvas')
  const W = sh?.clientWidth || 900
  const H = sh?.clientHeight || 500
  const zoom = Math.min((W - 80) / f0.w, (H - 80) / f0.h)
  E.SE.view.zoom = Math.max(0.2, zoom)
  E.SE.view.panX = 0
  E.SE.view.panY = 0
  E.SE.sel.tool = 'select'

  return {
    sprite: { id: sp.id, name: sp.name, family: sp.family, bones: sp.bones.length, shapes: sp.shapes.length },
    fit: { ok: res.ok, bones: res.bones, shapes: res.shapes, stats: res.stats, warnings: res.warnings },
    fitCur: { ok: resCur.ok, bones: resCur.bones },
    baseBones: (base.bones || []).length,
    maxErr: Math.round(maxErr * 100) / 100,
    worst,
    outside,
    sample: sp.bones.slice(0, 6).map((b) => `${b.name}(${b.kind}) x${Math.round(b.x)} y${Math.round(b.y)} a${Math.round(b.angle)}`),
    rig: sp.rig ? JSON.parse(JSON.stringify(sp.rig)) : null,
    frameBox: res.frameBox,
    zoom: E.SE.view.zoom,
  }
})
console.log(JSON.stringify(R, null, 1))
if (R.error) {
  console.error('[fail]', R.error)
  process.exit(1)
}

ok(R.fit.ok, '编辑器内识别成功', `${R.fit.bones} 骨 / ${R.fit.shapes} 碰撞`)
ok(Math.abs(R.fitCur.bones - R.baseBones) <= 1, '当前帧识别骨骼数与识别器输出一致', `${R.fitCur.bones} vs ${R.baseBones}`)
ok(R.fit.shapes >= 4, '碰撞体数量合理', String(R.fit.shapes))
ok(R.maxErr <= 2, '坐标系往返误差 ≤2px（层级相对 ↔ 绝对）', `maxErr=${R.maxErr}px worst=${R.worst && R.worst.name}`)
ok(R.outside.length === 0, '所有骨骼绝对坐标都在帧框内', R.outside.slice(0, 4).join(','))
ok(!!R.rig && R.rig.source === 'local', 'sprite.rig 元数据已写入', JSON.stringify(R.rig && R.rig.stats))
ok(R.sprite.family === 'mech', '族系已切到 mech', R.sprite.family)

// 截图前：先「1:1」（左上角对齐帧 0），再在第一帧中心滚轮放大，让骨骼看得清
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '1:1')
  b?.click()
})
await wait(300)
await page.evaluate(() => {
  const cv = document.querySelector('.sec-canvas')
  if (!cv) return
  const r = cv.getBoundingClientRect()
  const x = r.left + 136 // 帧 0 中心（272/2）
  const y = r.top + 168 // 帧 0 中心（336/2）
  for (let i = 0; i < 5; i++) {
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: x, clientY: y, bubbles: true, cancelable: true }))
  }
})
// 截图（等一帧渲染）
await wait(900)
await page.screenshot({ path: path.join(OUT, 'editor-skeleton-published.png') })

// ---- 发布 + 磁盘校验 ----
const pub = await page.evaluate(async () => {
  const E = window.__spriteEditor
  E.publish()
  await E.recordHistory('发布')
  await E.flushDiskProject(true)
  const list = await E.historyEntries()
  return { status: E.SE.project.status, history: list.length, newest: list[0]?.reason }
})
console.log('[pub]', JSON.stringify(pub))
ok(pub.status === 'published', '已发布')

await wait(600)
const projPath = path.resolve('editor-data/sprite-editor/project.json')
const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'))
const spDisk = proj.sprites?.[0]
const bonesDisk = spDisk?.bones || []
const shapesDisk = spDisk?.shapes || []
ok(bonesDisk.length >= 12, '磁盘工程里有骨骼', `${bonesDisk.length} 根`)
ok(bonesDisk.every((b) => typeof b.kind === 'string' || b.kind === ''), '骨骼带 kind 字段')
ok(shapesDisk.every((s) => typeof s.role === 'string' || s.role === ''), '碰撞体带 role 字段')
ok(!!spDisk?.rig?.stats, '磁盘工程里有 rig 识别元数据', JSON.stringify(spDisk?.rig?.stats))
ok(spDisk?.rig?.frames >= 5, '多帧联合拟合帧数', String(spDisk?.rig?.frames))

console.log('\n=== 结果 ===')
ok(errors.length === 0, '无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'editor-skeleton-published.png'))}`)
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 编辑器内骨骼 / 碰撞识别全链路 通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
