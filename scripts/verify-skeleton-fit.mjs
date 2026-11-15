// ============================================================================
// 验证：骨骼 / 碰撞体「智能识别」
// ----------------------------------------------------------------------------
// 用数据执政官的 10 帧走路图集当样本，检查：
//   1. 单帧识别：骨骼数 / 碰撞数 / 置信度 / 覆盖率 / 每条骨骼都在帧框内
//   2. 层级合法：parent 存在、无环、脚在底部、头在躯干上方
//   3. 确定性：同一输入两次结果完全一致（识别必须可复现，不能是随机）
//   4. 多帧联合拟合：整条动作取中位数，覆盖率与置信度的下限
//   5. 空帧 / 全透明 → 明确失败而不是乱给结果
//   6. 12 个族系的模板都能摆出来（不会因为缺锚点崩）
//   7. AI 蒙版通道：不可用时给出原因，且不影响本地识别
//   8. 产出可视化叠加图（骨骼按种类配色 + 碰撞体按职责配色）
//
// 用法：node scripts/verify-skeleton-fit.mjs
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
  browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1280, height: 900 } })
} catch (e) {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1280, height: 900 },
  })
  ownBrowser = true
}
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE ' + m.text())
})
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(2200)

const R = await page.evaluate(async () => {
  const fit = await import('/src/game/editor/skeleton-fit.js')
  const rigs = await import('/src/game/editor/rigs.js')
  const { fitSkeleton, fitFrames, alphaFromRGBA } = fit
  const { boneKindColor, shapeRoleColor, RIGS, templateAnchors, assembleRig, assembleShapes } = rigs

  // ---- 载入数据执政官走路图集 ----
  const img = new Image()
  img.src = '/sprites/boss-action/tb_data_archon_walk.png'
  await img.decode()
  const FW = 272
  const FH = 336
  const N = Math.floor(img.naturalWidth / FW)
  const cv = document.createElement('canvas')
  cv.width = img.naturalWidth
  cv.height = img.naturalHeight
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  const frames = []
  for (let i = 0; i < N; i++) {
    const d = ctx.getImageData(i * FW, 0, FW, FH)
    frames.push({ i, alpha: alphaFromRGBA(d.data, FW, FH), w: FW, h: FH })
  }

  // ---- 1. 单帧 ----
  const one = fitSkeleton({ alpha: frames[0].alpha, w: FW, h: FH, family: 'mech' })
  const one2 = fitSkeleton({ alpha: frames[0].alpha, w: FW, h: FH, family: 'mech' })
  const deterministic = JSON.stringify(one) === JSON.stringify(one2)

  // 骨骼合法性
  const inBox = one.ok
    ? one.bones.every((b) => b.x >= -6 && b.y >= -6 && b.x <= FW + 6 && b.y <= FH + 6)
    : false
  const byId = new Map((one.bones || []).map((b) => [b.name, b]))
  const parentsOk = (one.bones || []).every((b) => !b.parent || byId.has(b.parent))
  // 环检测
  let cycle = false
  for (const b of one.bones || []) {
    let cur = b
    let guard = 0
    const seen = new Set()
    while (cur?.parent && guard++ < 64) {
      if (seen.has(cur.name)) {
        cycle = true
        break
      }
      seen.add(cur.name)
      cur = byId.get(cur.parent)
    }
  }
  const feet = (one.bones || []).filter((b) => b.kind === 'foot')
  const footBottom = feet.length
    ? Math.max(...feet.map((b) => b.y + Math.sin((b.angle * Math.PI) / 180) * b.len))
    : -1
  const head = (one.bones || []).find((b) => b.name === 'head')
  const torso = one.stats?.torso
  const headAboveTorso = head && torso ? head.y <= torso.y1 : false

  // ---- 4. 多帧联合 ----
  const all = fitFrames(frames, { family: 'mech' })

  // ---- 5. 空帧 ----
  const empty = fitSkeleton({ alpha: new Uint8Array(FW * FH), w: FW, h: FH, family: 'mech' })

  // ---- 6. 各族系模板 ----
  const famStats = Object.keys(RIGS).map((fam) => {
    const anchors = templateAnchors(fam, { w: FW, h: FH })
    const bones = assembleRig(fam, anchors, { w: FW, h: FH })
    const shapes = assembleShapes(fam, anchors, { w: FW, h: FH })
    const bad = bones.filter((b) => !Number.isFinite(b.x) || !Number.isFinite(b.len) || !Number.isFinite(b.angle))
    return { fam, bones: bones.length, shapes: shapes.length, bad: bad.length }
  })

  // ---- 7. AI 通道 ----
  const { aiStatus, aiSegment } = await import('/src/game/editor/ai-mask.js')
  const ai = await aiStatus()
  const aiTry = await aiSegment({ sheet: { src: '/sprites/boss-action/tb_data_archon_walk.png' }, rect: { x: 0, y: 0, w: FW, h: FH } })

  // ---- 8. 可视化：10 帧各自识别，画骨骼 + 碰撞 ----
  const COLS = 5
  const ROWS = 2
  const pad = 8
  const oc = document.createElement('canvas')
  oc.width = COLS * (FW + pad) + pad
  oc.height = ROWS * (FH + pad) + pad
  const o = oc.getContext('2d')
  o.imageSmoothingEnabled = false
  o.fillStyle = '#0b0e12'
  o.fillRect(0, 0, oc.width, oc.height)
  const perFrame = []
  for (let i = 0; i < N; i++) {
    const r = fitSkeleton({ alpha: frames[i].alpha, w: FW, h: FH, family: 'mech' })
    perFrame.push({ i, ok: r.ok, conf: r.stats?.meanConf, cov: r.stats?.bodyCoverage, bones: r.bones?.length, shapes: r.shapes?.length })
    const cx = pad + (i % COLS) * (FW + pad)
    const cy = pad + Math.floor(i / COLS) * (FH + pad)
    o.drawImage(cv, i * FW, 0, FW, FH, cx, cy, FW, FH)
    o.save()
    o.translate(cx, cy)
    for (const s of r.shapes || []) {
      o.strokeStyle = shapeRoleColor(s.role)
      o.fillStyle = shapeRoleColor(s.role) + '22'
      o.lineWidth = 0.8
      o.fillRect(s.x, s.y, s.w, s.h)
      o.strokeRect(s.x, s.y, s.w, s.h)
    }
    for (const b of r.bones || []) {
      const rad = (b.angle * Math.PI) / 180
      const x2 = b.x + Math.cos(rad) * b.len
      const y2 = b.y + Math.sin(rad) * b.len
      o.strokeStyle = boneKindColor(b.kind)
      o.lineWidth = 1.3
      o.beginPath()
      o.moveTo(b.x, b.y)
      o.lineTo(x2, y2)
      o.stroke()
      o.fillStyle = boneKindColor(b.kind)
      o.beginPath()
      o.arc(b.x, b.y, 1.6, 0, Math.PI * 2)
      o.fill()
    }
    o.fillStyle = 'rgba(216,207,186,0.85)'
    o.font = '9px monospace'
    o.fillText(`#${i + 1} conf ${Math.round((r.stats?.meanConf || 0) * 100)}%`, 4, 11)
    o.restore()
  }

  return {
    n: N,
    one: one.ok
      ? {
          bones: one.bones.length,
          shapes: one.shapes.length,
          stats: one.stats,
          warnings: one.warnings,
          inBox,
          parentsOk,
          cycle,
          footBottom,
          headAboveTorso,
          boneList: one.bones.map((b) => `${b.name}(${b.kind}) ${Math.round(b.x)},${Math.round(b.y)} L${Math.round(b.len)} A${Math.round(b.angle)} ${Math.round(b.conf * 100)}%`),
          shapeList: one.shapes.map((s) => `${s.name}[${s.role}] ${Math.round(s.x)},${Math.round(s.y)} ${Math.round(s.w)}x${Math.round(s.h)}`),
        }
      : { error: one.reason },
    deterministic,
    all: all.ok
      ? {
          frames: all.frames,
          stats: all.stats,
          warnings: all.warnings,
          bones: all.bones.length,
          shapes: all.shapes.length,
        }
      : { error: all.reason },
    empty: { ok: empty.ok, reason: empty.reason },
    famStats,
    ai: { status: ai, try: { ok: aiTry.ok, reason: aiTry.reason } },
    perFrame,
    png: oc.toDataURL('image/png'),
  }
})

fs.writeFileSync(path.join(OUT, 'skeleton-fit-overlay.png'), Buffer.from(R.png.split(',')[1], 'base64'))
console.log(`\n=== 样本：数据执政官走路图集 ${R.n} 帧（每帧 272×336） ===`)

console.log('\n--- 单帧 ---')
console.log(JSON.stringify(R.one.stats || R.one, null, 1))
ok(!!R.one.bones, '单帧识别成功', `${R.one.bones} 骨 / ${R.one.shapes} 碰撞`)
ok(R.one.bones >= 12 && R.one.bones <= 26, '骨骼数量合理', String(R.one.bones))
ok(R.one.shapes >= 4, '碰撞体数量合理', String(R.one.shapes))
ok(R.one.inBox, '所有骨骼都在帧框内（±6px）')
ok(R.one.parentsOk, '骨骼父级都存在')
ok(!R.one.cycle, '骨骼层级无环')
ok(R.one.footBottom >= 336 * 0.82, '脚骨末端到底部（≥82% 帧高）', `y=${Math.round(R.one.footBottom)}`)
ok(R.one.headAboveTorso, '头骨在躯干上方')
ok(R.one.stats.meanConf >= 0.6, '平均置信度 ≥0.6', String(R.one.stats.meanConf))
ok(R.one.stats.bodyCoverage >= 0.6, '体表覆盖率 ≥60%', String(R.one.stats.bodyCoverage))
console.log('\n  骨骼：')
R.one.boneList.forEach((s) => console.log('   ', s))
console.log('  碰撞：')
R.one.shapeList.forEach((s) => console.log('   ', s))

console.log('\n--- 多帧联合拟合（整条动作） ---')
console.log(JSON.stringify(R.all.stats || R.all, null, 1))
ok(R.all.stats, '联合拟合成功', `${R.all.frames} 帧 / ${R.all.bones} 骨 / ${R.all.shapes} 碰撞`)
ok(R.all.stats && R.all.stats.coverageMin >= 0.55, '最差帧的覆盖率 ≥55%', String(R.all.stats && R.all.stats.coverageMin))
ok(R.all.stats && R.all.stats.meanConf >= 0.6, '联合置信度 ≥0.6', String(R.all.stats && R.all.stats.meanConf))

console.log('\n--- 鲁棒性 ---')
ok(R.deterministic, '同一输入两次结果完全一致（确定性）')
ok(R.empty.ok === false, '全透明帧明确失败而不是乱给结果', R.empty.reason || '')
ok(R.famStats.every((f) => f.bad === 0), '全部族系模板都能摆出合法骨骼', R.famStats.map((f) => `${f.fam}:${f.bones}骨`).join(' '))

console.log('\n--- AI 蒙版通道（Hugging Face，可选） ---')
console.log('status:', JSON.stringify(R.ai.status))
console.log('segment:', JSON.stringify(R.ai.try))
ok(
  R.ai.status.available ? !!R.ai.status.model : !!R.ai.status.reason,
  'AI 通道状态明确（可用给模型名，不可用给原因）',
  R.ai.status.available ? R.ai.status.model : R.ai.status.reason,
)
ok(!R.ai.status.available ? R.ai.try.ok === false : true, 'AI 不可用时 aiSegment 软失败（不影响本地识别）')

console.log('\n--- 逐帧 ---')
console.log(R.perFrame.map((f) => `#${f.i + 1} ${f.bones}骨/${f.shapes}碰 conf${Math.round((f.conf || 0) * 100)}% cov${Math.round((f.cov || 0) * 100)}%`).join('\n'))

console.log('\n=== 结果 ===')
ok(errors.length === 0, '无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'skeleton-fit-overlay.png'))}`)
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 骨骼 / 碰撞体智能识别 全部通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
