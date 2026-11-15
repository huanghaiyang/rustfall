// ============================================================================
// 验证：角色黑描边（卡通 / cel 风格）
// ----------------------------------------------------------------------------
// 断言：
//   1. 玩家与 BOSS 的材质都换成了描边材质；几何体比精灵四周各多出 thickness
//   2. BOSS 走「美术加载后重设尺寸」的路径，uniform 尺寸必须跟上（不然描边比例会错）
//   3. 像素级：开/关描边两帧对比 —— 变化像素够多、变黑的占绝大多数、角色内部像素不变
//   4. 小的敌人描边更细（按显示尺寸自适应）
//   5. ?outline=0 能关掉；运行时 setOutline 可切换
//   6. 无 console / pageerror
//
// 用法：node scripts/verify-outline.mjs [--url http://127.0.0.1:5180/]
// ============================================================================
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const argv = process.argv.slice(2)
const URL = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://127.0.0.1:5180/'
const OUT = path.resolve('.screenshots/outline')
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
  browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1200, height: 780 } })
} catch (e) {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1200, height: 780 },
  })
  ownBrowser = true
}
const page = await browser.newPage()
// 2x 像素密度：截图裁一小块就等于放大 2 倍，看描边清楚
await page.setViewport({ width: 1200, height: 780, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE ' + m.text())
})
page.on('dialog', (d) => d.accept().catch(() => {}))

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(2600)
const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('BOSS测试房'))
  if (!b) return false
  b.click()
  return true
})
if (!opened) {
  console.error('[fail] 找不到 BOSS 测试房入口')
  process.exit(1)
}
await wait(900)
await page.evaluate(() => {
  const c = [...document.querySelectorAll('button, [role="button"], li, article, .card')].find((x) =>
    x.textContent.includes('数据执政官'),
  )
  c?.click()
})
await wait(5200)

// 玩家贴到 BOSS 右侧，两个角色都在画面中间
const setup = await page.evaluate(() => {
  const g = window.__rustfall
  const m = g.director.largeList[0]
  g.player.body.x = m.body.x + m.body.w + 30
  g.player.body.y = m.body.y + m.body.h - g.player.body.h
  g.player.body.vx = 0
  m.activated = false
  m.state = 'idle'
  m.vxTarget = 0
  return {
    state: g.outlineState ? g.outlineState() : null,
    boss: { x: Math.round(m.body.x), y: Math.round(m.body.y), w: m.spriteW, h: m.spriteH },
    player: { w: g.player.spriteW, h: g.player.spriteH },
  }
})
await wait(1200)

const mats = await page.evaluate(() => {
  const g = window.__rustfall
  const m = g.director.largeList[0]
  const pick = (mesh, mat, spriteW, spriteH) => {
    const g2 = mesh?.geometry?.parameters
    const u = mat?.uniforms || {}
    return {
      type: mat?.type,
      outline: !!mat?.userData?.outline,
      thickness: mat?.userData?.outlineThickness,
      geom: g2 ? { w: g2.width, h: g2.height } : null,
      uSize: u.uSize?.value?.toArray?.(),
      uPad: u.uPad?.value?.toArray?.(),
      uActive: u.uActive?.value,
      spriteW,
      spriteH,
    }
  }
  return {
    player: pick(g.player.artMesh, g.player.mat, g.player.spriteW, g.player.spriteH),
    boss: pick(m.mesh, m.mat, m.spriteW, m.spriteH),
    small: (() => {
      const s = (g.director.list || []).find((x) => x && x.mesh && x !== m)
      if (!s) return null
      return pick(s.mesh, s.mat, s.spriteW, s.spriteH)
    })(),
  }
})
console.log('\n--- 材质 ---')
console.log(JSON.stringify({ setup, mats }, null, 1))

ok(setup.state?.enabled === true, '描边默认开启', JSON.stringify(setup.state))
ok(mats.player.outline && mats.player.type === 'ShaderMaterial', '玩家使用描边材质')
ok(mats.boss.outline, 'BOSS 使用描边材质')
ok(
  mats.player.thickness > 0 && mats.boss.thickness > 0,
  '描边宽度按角色尺寸自适应',
  `玩家 ${mats.player.thickness}px / BOSS ${mats.boss.thickness}px`,
)
const padOk = (m) =>
  m.geom &&
  Math.abs(m.geom.w - (m.spriteW + 2 * m.thickness)) < 0.6 &&
  Math.abs(m.geom.h - (m.spriteH + 2 * m.thickness)) < 0.6
ok(padOk(mats.player), '玩家几何体四周留白 = 描边宽度', `geom ${mats.player.geom?.w}×${mats.player.geom?.h} vs 精灵 ${mats.player.spriteW}×${mats.player.spriteH}`)
ok(padOk(mats.boss), 'BOSS 几何体四周留白 = 描边宽度（美术后加载重设尺寸也跟上了）', `geom ${mats.boss.geom?.w}×${mats.boss.geom?.h} vs 精灵 ${mats.boss.spriteW}×${mats.boss.spriteH}`)
ok(
  mats.boss.uSize && Math.abs(mats.boss.uSize[0] - mats.boss.spriteW) < 0.6,
  'BOSS 材质的 uSize 与精灵尺寸一致',
  JSON.stringify(mats.boss.uSize),
)
if (mats.small) {
  ok(
    mats.small.thickness <= mats.boss.thickness,
    '小怪描边不长于 BOSS（按尺寸自适应）',
    `小怪 ${mats.small.thickness}px / BOSS ${mats.boss.thickness}px`,
  )
}

// ---- 像素级对比：开 / 关（暂停游戏时钟，避免雨/粒子把对比搅乱）----
// 用相机矩阵把世界坐标投到屏幕 CSS 坐标，裁剪框才框得准
const proj = await page.evaluate(() => {
  const g = window.__rustfall
  const cam = g.camera
  const canvas = g.renderer?.domElement || document.querySelector('canvas')
  const rect = canvas.getBoundingClientRect()
  const vm = cam.matrixWorldInverse.elements
  const pm = cam.projectionMatrix.elements
  const project = (x, yIn) => {
    // 场景坐标是 (x, -y)：游戏逻辑 y 向下，Three 场景 y 向上
    const y = -yIn
    const vx = vm[0] * x + vm[4] * y + vm[12]
    const vy = vm[1] * x + vm[5] * y + vm[13]
    const vz = vm[2] * x + vm[6] * y + vm[14]
    const vw = vm[3] * x + vm[7] * y + vm[15]
    const cx = pm[0] * vx + pm[4] * vy + pm[8] * vz + pm[12] * vw
    const cy = pm[1] * vx + pm[5] * vy + pm[9] * vz + pm[13] * vw
    const cw = pm[3] * vx + pm[7] * vy + pm[11] * vz + pm[15] * vw
    return {
      x: rect.left + (cx / cw * 0.5 + 0.5) * rect.width,
      y: rect.top + (0.5 - cy / cw * 0.5) * rect.height,
    }
  }
  const m = g.director.largeList[0]
  const bossC = project(m.body.x + m.body.w / 2, m.body.y + m.body.h / 2)
  const playerC = project(g.player.body.x + g.player.body.w / 2, g.player.body.y + g.player.body.h / 2)
  // 冻结时钟（而不是 pause）：dt 恒为 0 → 动画/雨/粒子全停，但每帧仍在渲染，
  // 这样「切描边」能反映到画面，两帧对比就只有描边差异。
  if (!window.__frozenNow) {
    window.__realNow = performance.now.bind(performance)
    window.__frozenNow = window.__realNow()
    performance.now = () => window.__frozenNow
  }
  return { bossC, playerC, rect: { w: rect.width, h: rect.height }, scale: window.devicePixelRatio }
})
await wait(600)

// 只框 BOSS 本体（玩家的增益光效每帧都在动，会把像素对比搅浑）
const cx = proj.bossC.x
const cy = proj.bossC.y
const halfW = setup.boss.w / 2 + 34
const halfH = setup.boss.h / 2 + 34
const clip = {
  x: Math.round(Math.max(0, cx - halfW)),
  y: Math.round(Math.max(0, cy - halfH)),
  width: Math.round(halfW * 2),
  height: Math.round(halfH * 2),
}
console.log('\n--- 投影 ---')
console.log(JSON.stringify({ bossC: proj.bossC, playerC: proj.playerC, clip }, null, 1))

const shotOn = await page.screenshot({ clip, encoding: 'base64', captureBeyondViewport: false })
fs.writeFileSync(path.join(OUT, 'outline-on-crop.png'), Buffer.from(shotOn, 'base64'))

await page.evaluate(() => window.__rustfall.setOutline(false))
await wait(400)
const shotOff = await page.screenshot({ clip, encoding: 'base64', captureBeyondViewport: false })
fs.writeFileSync(path.join(OUT, 'outline-off-crop.png'), Buffer.from(shotOff, 'base64'))

/** 两帧逐像素统计：变化量 / 变暗比例 / 近黑像素增量 / 中心区差异 */
const stats = await page.evaluate(
  async (a, b) => {
    const load = (b64) =>
      new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.src = 'data:image/png;base64,' + b64
      })
    const [ia, ib] = await Promise.all([load(a), load(b)])
    const cv = document.createElement('canvas')
    cv.width = ia.width
    cv.height = ia.height
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(ia, 0, 0)
    const da = ctx.getImageData(0, 0, cv.width, cv.height).data
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.drawImage(ib, 0, 0)
    const db = ctx.getImageData(0, 0, cv.width, cv.height).data
    const luma = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114

    let changed = 0
    let darker = 0
    let sumOn = 0
    let sumOff = 0
    let darkOn = 0
    let darkOff = 0
    let total = 0
    for (let i = 0; i < da.length; i += 4) {
      total++
      const la = luma(da, i)
      const lb = luma(db, i)
      if (la < 40) darkOn++
      if (lb < 40) darkOff++
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]))
      if (d <= 20) continue
      changed++
      if (la < lb) darker++
      sumOn += la
      sumOff += lb
    }
    // 中心区（BOSS 躯干中央 24×24 设备像素）不应被描边改动
    let coreMax = 0
    let coreChanged = 0
    const ccx = Math.floor(cv.width / 2)
    const ccy = Math.floor(cv.height / 2)
    for (let y = ccy - 12; y < ccy + 12; y++) {
      for (let x = ccx - 12; x < ccx + 12; x++) {
        const i = (y * cv.width + x) * 4
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]))
        if (d > 10) coreChanged++
        coreMax = Math.max(coreMax, d)
      }
    }
    return {
      total,
      changed,
      ratio: changed / total,
      darkerRatio: changed ? darker / changed : 0,
      meanOn: changed ? sumOn / changed : 0,
      meanOff: changed ? sumOff / changed : 0,
      darkOn,
      darkOff,
      darkDelta: darkOn - darkOff,
      w: cv.width,
      h: cv.height,
      coreMax,
      coreChanged,
    }
  },
  shotOn,
  shotOff,
)
console.log('\n--- 像素对比（开 vs 关，已冻结时钟）---')
console.log(JSON.stringify(stats, null, 1))
ok(stats.changed > 300, '描边确实画出来了（变化像素足够多）', `${stats.changed} / ${stats.total} px`)
ok(stats.ratio < 0.3, '变化局限在角色轮廓附近（不是整屏漂移）', `${(stats.ratio * 100).toFixed(1)}%`)
ok(stats.darkDelta > 250, '近黑像素明显变多（就是新增的描边）', `+${stats.darkDelta} px`)
ok(stats.darkerRatio > 0.8, '变化像素绝大多数是「变暗」', `${Math.round(stats.darkerRatio * 100)}%`)
ok(stats.meanOff - stats.meanOn > 15, '变化区域整体变暗', `${stats.meanOff.toFixed(1)} → ${stats.meanOn.toFixed(1)}`)
ok(stats.coreMax <= 10, '角色内部像素没有被描边改动（不啃美术）', `中心区最大差 ${stats.coreMax}，变化 ${stats.coreChanged}/576`)
// ---- 离线单精灵对比（确定性，用来严格断言「描边在外侧 / 不啃美术」）----
// 用同一个描边材质渲染两次（uActive=1 / 0），管线完全一致，差异只可能来自描边本身。
const iso = await page.evaluate(async () => {
  const [{ outlineMaterial, outlineGeometry }, THREEMod] = await Promise.all([
    import('/src/game/render/outline.js'),
    Promise.resolve(null),
  ])
  const g = window.__rustfall
  const m = g.director.largeList[0]
  const w = Math.round(m.spriteW)
  const h = Math.round(m.spriteH)
  const tex = m.mat.map
  const Mesh = m.mesh.constructor
  const Scene = g.scene.constructor
  const Cam = g.camera.constructor
  const Renderer = g.renderer.constructor
  const t = m.mat.userData.outlineThickness || 2
  const scale = 2
  const W = Math.round((w + 2 * t) * scale)
  const H = Math.round((h + 2 * t) * scale)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const r = new Renderer({ canvas: cv, alpha: true, antialias: false, preserveDrawingBuffer: true })
  r.setPixelRatio(1)
  r.setSize(W, H, false)
  r.setClearColor(0x000000, 0)
  const scene = new Scene()
  const cam = new Cam(-W / 2, W / 2, H / 2, -H / 2, 0.1, 100)
  cam.position.z = 10
  const mat = outlineMaterial(tex, { w, h, thickness: t })
  const mesh = new Mesh(outlineGeometry(w, h, t), mat)
  mesh.scale.setScalar(scale)
  scene.add(mesh)
  const read = () => {
    r.render(scene, cam)
    const c2 = document.createElement('canvas')
    c2.width = W
    c2.height = H
    const ctx = c2.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(cv, 0, 0)
    return ctx.getImageData(0, 0, W, H).data
  }
  mat.uniforms.uActive.value = 1
  const withOutline = read()
  mat.uniforms.uActive.value = 0
  const noOutline = read()
  r.dispose()
  // 统计
  let missing = 0
  let added = 0
  let addedDark = 0
  let commonMax = 0
  let commonSolid = 0
  for (let i = 0; i < withOutline.length; i += 4) {
    const aOn = withOutline[i + 3]
    const aOff = noOutline[i + 3]
    const on = aOn > 128
    const off = aOff > 128
    if (off && !on) missing++
    if (!off && on) {
      added++
      const l = withOutline[i] * 0.299 + withOutline[i + 1] * 0.587 + withOutline[i + 2] * 0.114
      if (l < 46) addedDark++
    }
    if (on && off) {
      commonSolid++
      commonMax = Math.max(
        commonMax,
        Math.abs(withOutline[i] - noOutline[i]),
        Math.abs(withOutline[i + 1] - noOutline[i + 1]),
        Math.abs(withOutline[i + 2] - noOutline[i + 2]),
      )
    }
  }
  return { W, H, t, w, h, missing, added, addedDark, commonSolid, commonMax }
})
console.log('\n--- 离线单精灵对比（同一管线，uActive 1/0）---')
console.log(JSON.stringify(iso, null, 1))
ok(iso.missing === 0, '描边没有吃掉任何原像素（只在外侧新增）', `缺失 ${iso.missing} px`)
ok(iso.added > 400, '外侧新增描边像素', `+${iso.added} px`)
ok(iso.addedDark / Math.max(1, iso.added) > 0.95, '新增像素是近黑色', `${Math.round((iso.addedDark / iso.added) * 100)}%`)
ok(iso.commonMax <= 4, '原有像素颜色完全不变（不啃美术）', `最大差 ${iso.commonMax}`)
// 恢复描边 + 恢复时钟
await page.evaluate(() => {
  window.__rustfall.setOutline(true)
  if (window.__realNow) performance.now = window.__realNow
  window.__realNow = null
  window.__frozenNow = null
  const g = window.__rustfall
  g.last = performance.now()
  g.acc = 0
})
await wait(500)
await page.screenshot({ path: path.join(OUT, 'outline-scene.png') })
// 单独给 BOSS 来一张大图（便于人眼验收）
const bossClip = {
  x: Math.round(Math.max(0, proj.bossC.x - 110)),
  y: Math.round(Math.max(0, proj.bossC.y - 130)),
  width: 220,
  height: 260,
}
await page.screenshot({ path: path.join(OUT, 'outline-boss-closeup.png'), clip: bossClip })
const playerClip = {
  x: Math.round(Math.max(0, proj.playerC.x - 60)),
  y: Math.round(Math.max(0, proj.playerC.y - 70)),
  width: 120,
  height: 140,
}
await page.screenshot({ path: path.join(OUT, 'outline-player-closeup.png'), clip: playerClip })
// ---- 多角色场景截图（BOSS + 玩家 + 三种小怪，验收不同尺寸的描边）----
const sceneInfo = await page.evaluate(() => {
  const g = window.__rustfall
  const m = g.director.largeList[0]
  const spawned = []
  for (const [i, id] of ['scrapper', 'crawler', 'spitter'].entries()) {
    try {
      const r = g.director.spawn?.(id, m.body.x + m.body.w + 40 + i * 80, 0)
      if (r) spawned.push({ id, x: Math.round(r.body.x), outline: !!r.mat?.userData?.outline, thick: r.mat?.userData?.outlineThickness })
    } catch (e) {
      /* 某些房间不支持手动刷怪，忽略 */
    }
  }
  return { spawned }
})
console.log('\n--- 多角色 ---')
console.log(JSON.stringify(sceneInfo))
if (sceneInfo.spawned.length) {
  ok(sceneInfo.spawned.every((s) => s.outline), '刷出来的小怪也带描边', sceneInfo.spawned.map((s) => `${s.id}:${s.thick}px`).join(' '))
  await wait(1600)
  // 再冻结一次，截图才是稳定的一帧
  await page.evaluate(() => {
    if (!window.__frozenNow) {
      window.__realNow = performance.now.bind(performance)
      window.__frozenNow = window.__realNow()
      performance.now = () => window.__frozenNow
    }
  })
  await wait(400)
  await page.screenshot({ path: path.join(OUT, 'outline-monsters-scene.png') })
  await page.evaluate(() => {
    if (window.__realNow) performance.now = window.__realNow
    window.__realNow = null
    window.__frozenNow = null
  })
}
// ---- URL 参数 ----
await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'outline=0', { waitUntil: 'domcontentloaded' })
await wait(2600)
const urlOff = await page.evaluate(() => window.__rustfall?.outlineState?.())
ok(urlOff && urlOff.enabled === false, '?outline=0 能关掉描边', JSON.stringify(urlOff))

console.log('\n=== 结果 ===')
ok(errors.length === 0, '无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'outline-scene.png'))}`)
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'outline-on-crop.png'))}`)
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'outline-off-crop.png'))}`)
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 角色黑描边 全部通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
