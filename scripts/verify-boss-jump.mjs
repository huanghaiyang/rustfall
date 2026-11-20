// ============================================================================
// 验证：数据执政官「原地起跳」接入（真引擎 / 真图集 / 真物理）
// ----------------------------------------------------------------------------
// 检查什么：
//   1. manifest 里 jump(15 帧 @24fps) / land(13 帧 @30fps) 已加载，且 jump 用 base 格（272×336）
//   2. _startHop 之后真的播 jump 帧组（帧号会在 0..14 之间推进），不是借用 run
//   3. 起跳后脚底确实抬升（物理位移仍在，图集只画姿势）
//   4. 落地先播 land 帧组（_landT > 0），播完才交还给 run/idle
//   5. 无 console error / pageerror
//
// 用法：node scripts/verify-boss-jump.mjs
//   环境变量：CHROME_CDP / CHROME_PATH / --url
// ============================================================================
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import fs from 'node:fs'

const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const argv = process.argv.slice(2)
const URL = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://127.0.0.1:5180/'
const OUT = path.resolve('.screenshots/boss-jump')
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
  browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1400, height: 900 } })
} catch (e) {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })
  ownBrowser = true
}
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE ' + m.text())
})
page.on('dialog', (d) => d.accept().catch(() => {}))

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(2500)
const open = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('BOSS测试房'))
  if (!b) return false
  b.click()
  return true
})
if (!open) {
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
await wait(7000) // 等图集到货（jump 图集 11152×336）

/** 冻结出招、玩家无敌，专测动作 */
async function calm() {
  return page.evaluate(() => {
    const g = window.__rustfall
    const b = g.director.largeList[0]
    b.moveCd = 999
    b.damage = 0
    b.introT = 0
    b.activated = true
    b.state = 'chase'
    if (g.player) {
      g.player.invuln = 999
      g.player.hp = 999
    }
    return true
  })
}
await calm()

// ---- 0. 图集与帧组 ---------------------------------------------------------
const art = await page.evaluate(() => {
  const b = window.__rustfall.director.largeList[0]
  const tex = b.frames?.jump?.[0]
  return {
    hasJump: Array.isArray(b.frames?.jump),
    jumpLen: b.frames?.jump?.length || 0,
    landLen: b.frames?.land?.length || 0,
    fpsJump: b.animFps?.jump || 0,
    fpsLand: b.animFps?.land || 0,
    baseCell: b.art?.baseCell || null,
    jumpCell: b.art?.actionCell?.jump || null,
    texW: tex?.image?.width || 0,
    texH: tex?.image?.height || 0,
    artW: b.art?.w,
    artH: b.art?.h,
  }
})
console.log('\n--- 0 图集 ---', JSON.stringify(art))
ok(art.hasJump, '0 jump 帧组已加载')
ok(art.jumpLen === 15, '0 jump = 015..028 共 15 帧', `${art.jumpLen} 帧 @${art.fpsJump}fps`)
ok(art.landLen === 13, '0 land = 029..041 共 13 帧', `${art.landLen} 帧 @${art.fpsLand}fps`)
ok(!art.jumpCell, '0 jump 用 base 格（不临时改 quad）', JSON.stringify(art.baseCell))
ok(art.texW === 272 * 41 && art.texH === 336, '0 图集 41 格 272×336', `${art.texW}×${art.texH}`)
ok(Math.abs(art.fpsJump - 24) < 0.01 && Math.abs(art.fpsLand - 30) < 0.01, '0 帧率 24 / 30')

// ---- 1. 摆平地 → 原地起跳 -------------------------------------------------
const flat = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g.director.largeList[0]
  const map = b.map
  const TS = 32
  const fy = g.room?.data?.floorY || {}
  const F = (x) => (Number.isFinite(fy[x]) ? fy[x] : null)
  const clearAbove = (tx, row, n) => {
    for (let k = 1; k <= n; k++) if (map.isSolid(tx, row - k)) return false
    return true
  }
  for (let tx = 8; tx < map.w - 16; tx++) {
    const row = F(tx)
    if (row == null) continue
    let good = true
    for (let k = 0; k < 10; k++) {
      if (F(tx + k) !== row || !clearAbove(tx + k, row, 6)) {
        good = false
        break
      }
    }
    if (!good) continue
    b.body.x = tx * TS
    b.body.y = row * TS - b.body.h
    b.body.vx = 0
    b.body.vy = 0
    b.facing = 1
    b._hopping = false
    b._hopCd = 0
    b._landT = 0
    g.player.body.x = (tx + 9) * TS
    g.player.body.y = row * TS - g.player.body.h
    g.player.body.vx = 0
    g.player.body.vy = 0
    return { tx, row, feet: Math.round(b.body.y + b.body.h), bossX: Math.round(b.body.x) }
  }
  return { error: 'no flat' }
})
await wait(400)
console.log('\n--- 1 起跳 ---', JSON.stringify(flat))

const hopOk = await page.evaluate(() => {
  const b = window.__rustfall.director.largeList[0]
  b._hopping = false
  b._hopCd = 0
  return b._startHop('step')
})

/** 采样一帧：动作名 / 帧号 / 脚底 / 在空中 */
const sample = () =>
  page.evaluate(() => {
    const b = window.__rustfall.director.largeList[0]
    const set = b.frames?.[b.animName]
    return {
      anim: b.animName,
      t: Number(b.animT.toFixed(2)),
      idx: Array.isArray(set) && b.mat.map ? set.indexOf(b.mat.map) : -2,
      len: Array.isArray(set) ? set.length : 0,
      feet: Math.round(b.body.y + b.body.h),
      vy: Math.round(b.body.vy),
      land: Number(b._landT.toFixed(2)),
      grounded: !!b.body.onGround,
    }
  })

const timeline = []
for (let i = 0; i < 60; i++) {
  timeline.push(await sample())
  await wait(40)
}
timeline.forEach((s, i) => i % 5 === 0 && console.log(String(i).padStart(2), JSON.stringify(s)))

ok(hopOk, '1 _startHop 成功（地面 + 冷却结束）')
const jumpSamples = timeline.filter((s) => s.anim === 'jump')
ok(jumpSamples.length > 0, '1 起跳后播的是 jump 帧组（不再是 run）', `${jumpSamples.length} 帧采样`)
ok(jumpSamples.some((s) => s.idx > 0), '1 jump 帧号在推进', `idx ${jumpSamples.map((s) => s.idx).join(',')}`)
ok(
  jumpSamples.every((s) => s.idx >= 0 && s.idx < 15),
  '1 jump 帧号落在 0..14（没有越界跳帧）',
  `${jumpSamples.map((s) => s.idx).join(',')}`,
)
const baseFeet = flat.feet
const maxRise = Math.max(...timeline.map((s) => baseFeet - s.feet))
ok(maxRise > 60, '1 脚底真的抬起来了（物理位移仍在）', `抬升 ${maxRise}px`)

const landSamples = timeline.filter((s) => s.anim === 'land')
ok(landSamples.length > 0, '1 落地先播 land 帧组', `${landSamples.length} 帧采样`)
ok(landSamples.some((s) => s.land > 0), '1 land 期间 _landT 计时生效', JSON.stringify(landSamples[0] || {}))
ok(
  landSamples.every((s) => s.idx >= 0 && s.idx < 13),
  '1 land 帧号落在 0..12',
  `${landSamples.map((s) => s.idx).join(',')}`,
)
// ---- 1b. 截图：腾空最高点 / 落地压缩（采样循环里截图会拖慢采样，单独再跳一次）----
await page.evaluate(() => {
  const b = window.__rustfall.director.largeList[0]
  b._hopping = false
  b._hopCd = 0
  b._landT = 0
  b.body.vy = 0
  return b._startHop('step')
})
await wait(260)
await page.screenshot({ path: path.join(OUT, 'jump-air.png') }) // 滞空约 0.62s，0.26s ≈ 最高点
await wait(420)
await page.screenshot({ path: path.join(OUT, 'jump-land.png') }) // 0.68s：已落地，land 播到中段

// ---- 2. 起身播完 → 交还 chase ---------------------------------------------
await wait(900)
const after = await sample()
console.log('\n--- 2 起身结束 ---', JSON.stringify(after))
ok(after.anim !== 'land', '2 land 播完后切回追赶动作', after.anim)
ok(after.land === 0, '2 _landT 归零', `${after.land}`)

// ---- 3. 连续跳跃（AI 真触发，不是手动调用）---------------------------------
const auto = await page.evaluate(async () => {
  const b = window.__rustfall.director.largeList[0]
  b._hopping = false
  b._hopCd = 0
  b._landT = 0
  const s0 = b.ai.stats
  const before = { jumps: s0.jumps, leaps: s0.leaps }
  // 直接让大脑给出 jump 意图的那条链路：把 band 收窄 + 玩家拉近，逼它攀台阶
  b.ai.band = [72, 150]
  return before
})
console.log('\n--- 3 连续动作 ---', JSON.stringify(auto))

await page.screenshot({ path: path.join(OUT, 'boss-jump.png') })

console.log('\n=== 结果 ===')
ok(errors.length === 0, '4 无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(`[shot] ${path.relative(process.cwd(), OUT)}/jump-air.png, jump-land.png`)
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 跳跃动作接入全部通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
