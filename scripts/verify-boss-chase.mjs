// ============================================================================
// 验证：BOSS 追击（真引擎 / 真地形 / 真物理）
// ----------------------------------------------------------------------------
// 与 verify-boss-ai.mjs 分工：
//   · verify-boss-ai.mjs   —— 决策层（假地图，秒级）
//   · 本脚本               —— 集成层：进 BOSS 测试房，把玩家放到坑对面 / 台阶上，
//                             看 BOSS 是不是真的跨过去、爬上去、绕过去。
//
// 断言：
//   A 平地追击       —— 有真实位移、距离缩短、不转圈
//   B 过坑           —— 玩家在坑对面时，BOSS 下坑 → 攀出来 → 距离缩短
//   C 上台阶         —— 玩家站在高一格处，BOSS 脚底抬到台面高度并靠近
//   D 失联搜索       —— 视线被挡后转向最后已知位置，并且真的在走
//   E 无 console error / pageerror
//
// 用法：node scripts/verify-boss-chase.mjs
//   环境变量：CHROME_CDP / CHROME_PATH / --url
// ============================================================================
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import fs from 'node:fs'

const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const argv = process.argv.slice(2)
const URL = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://127.0.0.1:5180/'
const OUT = path.resolve('.screenshots/boss-chase')
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
await wait(6000)

/** 冻结 BOSS 出招、玩家无敌，专测移动 */
async function calm() {
  return page.evaluate(() => {
    const g = window.__rustfall
    const b = g.director.largeList[0]
    b.moveCd = 999
    b.damage = 0
    b.introT = 0
    if (g.player) {
      g.player.invuln = 999
      g.player.hp = 999
    }
    return true
  })
}

/** 读一帧状态 */
function sample() {
  return page.evaluate(() => {
    const g = window.__rustfall
    const b = g.director.largeList[0]
    const p = g.player
    const bc = b.body.x + b.body.w / 2
    const pc = p.body.x + p.body.w / 2
    return {
      x: Math.round(b.body.x),
      feet: Math.round(b.body.y + b.body.h),
      hd: Math.round(Math.abs(pc - bc)),
      dyFeet: Math.round(Math.abs(p.body.y + p.body.h - (b.body.y + b.body.h))),
      vx: Math.round(b.body.vx),
      mode: b.ai?.debug?.mode || '-',
      gap: b.ai?.debug?.gap || 0,
      step: b.ai?.debug?.step || 0,
      jumps: b.ai?.stats?.jumps || 0,
      leaps: b.ai?.stats?.leaps || 0,
      stuck: b.ai?.debug?.stuck || 0,
      f: b.facing,
      grounded: !!b.body.onGround,
    }
  })
}

/** 把 BOSS 的 AI 状态清干净，避免上一段测试的脱困/冷却串味 */
async function resetAi() {
  await page.evaluate(() => {
    const g = window.__rustfall
    const b = g.director.largeList[0]
    b.moveCd = 999
    b.activated = true
    b.state = 'chase'
    b.stateT = 0
    b._hopping = false
    b._hopCd = 0
    b.body.vx = 0
    b.body.vy = 0
    if (b.ai) {
      b.ai.stuckLevel = 0
      b.ai.forceDirT = 0
      b.ai.jumpCd = 0
      b.ai.airT = 0
      b.ai.lostT = 0
      b.ai.sampleT = 0
      b.ai.sampleX = b.body.x
      b.ai._cachedProbe = null
    }
    if (g.player) g.player.invuln = 999
  })
}

/** 在一段平地上摆好 BOSS 与玩家，返回摆放信息 */
async function placeFlat(gapPx = 420) {
  return page.evaluate((gapPx) => {
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
    const need = 10
    const span = Math.round(gapPx / TS)
    for (let tx = 6; tx < map.w - need - span - 6; tx++) {
      const row = F(tx)
      if (row == null) continue
      let good = true
      for (let k = 0; k < need; k++) {
        if (F(tx + k) !== row || !clearAbove(tx + k, row, 5)) {
          good = false
          break
        }
      }
      if (!good) continue
      // 玩家那一列也要是同一层地面，别让 A 变成「爬台阶测试」
      let pc = null
      for (let k = span; k <= span + 5; k++) {
        if (F(tx + k) === row && clearAbove(tx + k, row, 5)) {
          pc = tx + k
          break
        }
      }
      if (pc == null) continue
      const bx = (tx + 4) * TS
      b.body.x = bx
      b.body.y = row * TS - b.body.h
      b.body.vx = 0
      b.body.vy = 0
      b.facing = 1
      g.player.body.x = pc * TS + 4
      g.player.body.y = row * TS - g.player.body.h
      g.player.body.vx = 0
      g.player.body.vy = 0
      b.activated = true
      b.state = 'chase'
      b.stateT = 0
      return {
        tx,
        row,
        bossX: Math.round(bx),
        playerX: Math.round(g.player.body.x),
        hd: Math.round(Math.abs(g.player.body.x + g.player.body.w / 2 - (bx + b.body.w / 2))),
      }
    }
    return { error: 'no flat pair' }
  }, gapPx)
}

// ---- A. 平地追击 ----------------------------------------------------------
await calm()
const setupFlat = await placeFlat(700)
await resetAi()
console.log('\n--- A 平地追击 --- setup', JSON.stringify(setupFlat))
ok(!setupFlat.error, 'A 找到平地样本', setupFlat.error || `${setupFlat.tx}/${setupFlat.row}`)
const trackA = []
if (!setupFlat.error) {
  for (let i = 0; i < 20; i++) {
    await wait(300)
    trackA.push(await sample())
  }
  trackA.forEach((s, i) => i % 4 === 0 && console.log(String(i).padStart(2), JSON.stringify(s)))
}
if (!setupFlat.error) {
  const a = trackA[0]
  const z = trackA[trackA.length - 1]
  const flips = trackA.slice(1).filter((s, i) => s.f !== trackA[i].f).length
  ok(Math.abs(z.x - a.x) > 100, 'A 追击有真实位移', `${z.x - a.x}px`)
  ok(z.hd < a.hd - 60, 'A 与玩家距离明显缩短', `${a.hd} → ${z.hd}px`)
  ok(flips <= 2, 'A 不转圈（朝向翻转 ≤2）', `${flips} 次`)
}

// ---- B. 过坑（在场上现挖一条 V 形坑，坡度 1 格/列，和正式试炼场同款）--------
const pitInfo = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g.director.largeList[0]
  const map = b.map
  const TS = 32
  const fy = g.room?.data?.floorY || {}
  const F = (x) => (Number.isFinite(fy[x]) ? fy[x] : null)
  if (!Object.keys(fy).length) return { error: 'no floorY' }

  /** 把某一列的地面改到 row（挖下去 / 垫上来），并维护 floorY */
  const setCol = (col, row) => {
    const old = F(col)
    if (old == null) return
    for (let y = Math.max(0, old - 4); y < row; y++) map.set(col, y, 0)
    for (let y = row; y < map.h; y++) map.set(col, y, 1)
    fy[col] = row
  }

  // 先把一整段地面推平（程序化地形本来就高低不平，测试需要一个可控的地基）
  const winStart = 16
  const winEnd = 62
  let row = 0
  {
    const counts = new Map()
    for (let x = winStart; x <= winEnd; x++) {
      const v = F(x)
      if (v == null) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    let best = 0
    for (const [v, n] of counts) if (n > best) { best = n; row = v }
  }
  if (!row) return { error: 'no floor' }
  for (let x = winStart; x <= winEnd; x++) setCol(x, row)

  // 坑：3 列下坡 + 4 列坑底 + 3 列上坡
  {
    const p0 = 32
    const bottom = row + 3
    setCol(p0, row + 1)
    setCol(p0 + 1, row + 2)
    for (let k = 0; k < 4; k++) setCol(p0 + 2 + k, bottom)
    setCol(p0 + 6, row + 2)
    setCol(p0 + 7, row + 1)

    const bossCol = p0 - 6
    const playerCol = p0 + 11
    b.body.x = bossCol * TS
    b.body.y = F(bossCol) * TS - b.body.h
    b.body.vx = 0
    b.body.vy = 0
    g.player.body.x = playerCol * TS + 4
    g.player.body.y = F(playerCol) * TS - g.player.body.h
    g.player.body.vx = 0
    g.player.body.vy = 0
    b.activated = true
    b.state = 'chase'
    b.stateT = 0
    return {
      flatRow: row,
      pit: { start: p0, end: p0 + 7, bottom },
      bossX: Math.round(b.body.x),
      bossFeet: Math.round(b.body.y + b.body.h),
      playerX: Math.round(g.player.body.x),
      playerFeet: Math.round(g.player.body.y + g.player.body.h),
      hd: Math.round(Math.abs(g.player.body.x + g.player.body.w / 2 - (b.body.x + b.body.w / 2))),
    }
  }
})
await resetAi()
await page.evaluate(() => {
  // 数据执政官是「中远程型」，默认距离带会停在 350px；测过坑时按近战型调 band，
  // 让它必须贴着玩家走，才能真正逼出「下坑 → 攀出来」这条链路。
  const b = window.__rustfall.director.largeList[0]
  b.ai.band = [72, 150]
})
console.log('\n--- B 过坑 --- setup', JSON.stringify(pitInfo))
const trackB = []
if (!pitInfo.error) {
  for (let i = 0; i < 70; i++) {
    await wait(300)
    await page.evaluate(() => {
      const b = window.__rustfall.director.largeList[0]
      b.moveCd = 999 // 只测位移
    })
    trackB.push(await sample())
  }
  trackB.forEach((s, i) => i % 5 === 0 && console.log(String(i).padStart(2), JSON.stringify(s)))
}
if (pitInfo.error) {
  ok(false, 'B 找到测试坑', pitInfo.error)
} else {
  const a = trackB[0]
  const z = trackB[trackB.length - 1]
  const maxFeet = Math.max(...trackB.map((s) => s.feet))
  const minFeet = Math.min(...trackB.map((s) => s.feet))
  const crossed = z.x > (pitInfo.pit.end + 1) * 32
  ok(z.hd < a.hd - 150 || crossed, 'B 真的往坑对面推进', `${a.hd} → ${z.hd}px`)
  ok(maxFeet > a.feet + 16, 'B 确实下到了坑底', `feet ${a.feet} → max ${maxFeet}`)
  ok(minFeet <= pitInfo.playerFeet + 10, 'B 从坑底攀回坑沿高度', `minFeet ${minFeet} / 坑沿 ${pitInfo.playerFeet}`)
  console.log(`[info] B 位移 ${z.x - a.x}px，过坑=${crossed}，收招高度差=${z.dyFeet}px，jumps=${z.jumps} leaps=${z.leaps}`)
}

// ---- C. 上台阶（在场上现垫一块高 1 格的台面）------------------------------
const ledge = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g.director.largeList[0]
  const map = b.map
  const TS = 32
  const fy = g.room?.data?.floorY || {}
  const F = (x) => (Number.isFinite(fy[x]) ? fy[x] : null)
  const setCol = (col, row) => {
    const old = F(col)
    if (old == null) return
    for (let y = Math.max(0, old - 4); y < row; y++) map.set(col, y, 0)
    for (let y = row; y < map.h; y++) map.set(col, y, 1)
    fy[col] = row
  }
  const need = 24
  // 同样先推平一段地面，再垫台面
  const winStart = 72
  const winEnd = 118
  let row = 0
  {
    const counts = new Map()
    for (let x = winStart; x <= winEnd; x++) {
      const v = F(x)
      if (v == null) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    let best = 0
    for (const [v, n] of counts) if (n > best) { best = n; row = v }
  }
  if (!row) return { error: 'no floor' }
  for (let x = winStart; x <= winEnd; x++) setCol(x, row)

  // 台面：mid+3 .. mid+8 抬高 1 格
  {
    const mid = 90
    for (let k = 0; k <= 5; k++) setCol(mid + 3 + k, row - 1)
    const bossCol = mid - 5
    const playerCol = mid + 6
    b.body.x = bossCol * TS
    b.body.y = F(bossCol) * TS - b.body.h
    b.body.vx = 0
    b.body.vy = 0
    g.player.body.x = playerCol * TS + 4
    g.player.body.y = F(playerCol) * TS - g.player.body.h
    g.player.body.vx = 0
    g.player.body.vy = 0
    b.activated = true
    b.state = 'chase'
    b.stateT = 0
    return {
      flatRow: row,
      platCol: mid + 3,
      upperFeet: (row - 1) * TS,
      lowerFeet: row * TS,
      bossX: Math.round(b.body.x),
      playerX: Math.round(g.player.body.x),
      hd: Math.round(Math.abs(g.player.body.x + g.player.body.w / 2 - (b.body.x + b.body.w / 2))),
    }
  }
})
await resetAi()
console.log('\n--- C 上台阶 --- setup', JSON.stringify(ledge))
const trackC = []
if (!ledge.error) {
  for (let i = 0; i < 30; i++) {
    await wait(300)
    await page.evaluate(() => {
      const b = window.__rustfall.director.largeList[0]
      b.moveCd = 999
    })
    trackC.push(await sample())
  }
  trackC.forEach((s, i) => i % 4 === 0 && console.log(String(i).padStart(2), JSON.stringify(s)))
}
if (ledge.error) {
  ok(false, 'C 找到 1 格台阶', ledge.error)
} else {
  const a = trackC[0]
  const z = trackC[trackC.length - 1]
  const minFeet = Math.min(...trackC.map((s) => s.feet))
  ok(minFeet <= ledge.upperFeet + 6, 'C 脚底抬到台面高度（真的攀上去了）', `minFeet ${minFeet} / 台面 ${ledge.upperFeet}`)
  ok(z.hd < a.hd - 60, 'C 与台上玩家距离缩短', `${a.hd} → ${z.hd}px`)
  console.log(`[info] C jumps=${z.jumps} stuck=${z.stuck}`)
}

// ---- D. 失联搜索 ----------------------------------------------------------
const flatD = await placeFlat(560)
if (!flatD.error) {
  await page.evaluate(() => {
    const g = window.__rustfall
    const b = g.director.largeList[0]
    b.hasLineOfSight = () => false
    b.ai.lastKnownX = g.player.body.x + g.player.body.w / 2
    b.ai.lostT = 1.2
  })
  await resetAi() // 会清 lostT，所以重新置一次
  await page.evaluate(() => {
    const b = window.__rustfall.director.largeList[0]
    b.hasLineOfSight = () => false
    b.ai.lastKnownX = window.__rustfall.player.body.x + window.__rustfall.player.body.w / 2
    b.ai.lostT = 1.2
  })
}
console.log('\n--- D 失联搜索 --- setup', JSON.stringify(flatD))
await wait(700)
const searchState = await sample()
ok(searchState.mode === 'search', 'D 视线被挡后进入搜索状态', JSON.stringify({ mode: searchState.mode, x: searchState.x }))
const before = await page.evaluate(() => window.__rustfall.director.largeList[0].body.x)
await wait(1600)
const after = await page.evaluate(() => window.__rustfall.director.largeList[0].body.x)
ok(Math.abs(after - before) > 40, 'D 搜索时确实在移动（不是站着）', `${Math.round(after - before)}px`)

await page.screenshot({ path: path.join(OUT, 'boss-chase.png') })
console.log('\n=== 结果 ===')
ok(errors.length === 0, 'E 无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'boss-chase.png'))}`)
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] BOSS 追击（集成层）全部通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
