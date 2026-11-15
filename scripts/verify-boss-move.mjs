// ============================================================================
// 验证：大怪 / BOSS 的行走位移（修复「原地打转、走不动」）
// ----------------------------------------------------------------------------
// 背景（数据执政官上暴露的 bug）：
//   base.js 的 groundAhead 只在脚下方 6px / 6+0.6格 处探地面。BOSS 身高 168px，
//   只要前方 8px 处有一个 32px 的台阶边沿（程序化地形里到处都是），它就判定
//   「没有地面」→ vxTarget=0；而 roamStep 同时把 facing 取反，下一帧又取反回来
//   → 表现就是**原地打转、零位移**；追击时同样永远停在原地，靠不近玩家。
//
// 修复：
//   1. groundAhead(dir, maxDrop)：浅层探测保持不变（小怪手感不变），
//      身高 >1.5 格的目标额外向下探到「身高 30%（封顶 2 格）」，走下小台阶算走路。
//   2. wallAhead：身高 >2 格的目标补一个脚踝高度探测，避免顶着台阶磨。
//   3. roamStep：被挡住时不再每帧翻面（否则就是原地抽搐），改成 0.6s 冷却换巡逻点。
//
// 本脚本验证：
//   A. 追击：BOSS 真的会被玩家拉近距离（位移 >100px 且距离变小）
//   B. 不转圈：朝向翻转 ≤2 次 / 3s
//   C. 走路动画：移动时 anim=run
//   D. 巡逻：玩家远离时也能靠巡逻点走起来
//   E. 探测语义：新 groundAhead 是旧逻辑的超集（大个子能走的地方变多）
//   F. 小怪回归：body.h ≤ 1.5 格时结果与旧逻辑完全一致（零行为变化）
//
// 用法：node scripts/verify-boss-move.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import fs from 'node:fs'

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
await wait(5500)

// ---- E/F：探测语义（同一张图上跑旧公式 vs 新实现）----------------------
const probe = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g.director.largeList[0]
  const map = b.map
  const TS = 32
  const hReal = b.body.h
  const W = b.body.w
  const body = b.body
  const y0 = body.y
  // 旧逻辑：脚下 6px 与 6+0.6格
  const oldFormula = (dir) => {
    const x = body.x + (dir > 0 ? body.w + 8 : -8)
    const y = body.y + body.h + 6
    return !!(map.solidAt(x, y) || map.solidAt(x, y + TS * 0.6))
  }
  // 沿整个房间横扫，统计「有地」的比例
  let oldOk = 0
  let newOk = 0
  let n = 0
  const worse = []
  const startX = body.x
  for (let dx = -600; dx <= 600; dx += 12) {
    body.x = startX + dx
    for (const dir of [-1, 1]) {
      n++
      const o = oldFormula(dir)
      const nn = b.groundAhead(dir)
      if (o) oldOk++
      if (nn) newOk++
      // 新实现必须是旧实现的超集：旧说有地，新必须也说有
      if (o && !nn) worse.push({ dx, dir })
    }
  }
  body.x = startX
  // 小怪回归：h 改小后，新结果必须与旧逻辑逐点一致
  let smallMismatch = 0
  body.h = 32
  for (let dx = -600; dx <= 600; dx += 24) {
    body.x = startX + dx
    for (const dir of [-1, 1]) {
      if (oldFormula(dir) !== b.groundAhead(dir)) smallMismatch++
    }
  }
  body.h = hReal
  body.x = startX
  return { n, oldOk, newOk, worse, smallMismatch, h: hReal, w: W, bossX: Math.round(startX) }
})
console.log('\n--- 探测语义（沿房间横扫 ±600px，前后各算一次） ---')
console.log(
  `旧逻辑「有地」${probe.oldOk}/${probe.n}（${Math.round((probe.oldOk / probe.n) * 100)}%）` +
    ` → 新逻辑 ${probe.newOk}/${probe.n}（${Math.round((probe.newOk / probe.n) * 100)}%）`,
)
ok(probe.worse.length === 0, '新 groundAhead 是旧逻辑的超集（不会把原来能走的地方判成不能走）', `反例 ${probe.worse.length}`)
ok(probe.newOk > probe.oldOk, '大个子可通行判定确实变多了', `+${probe.newOk - probe.oldOk} 处`)
ok(probe.smallMismatch === 0, '小怪（h=32）探测结果与旧逻辑完全一致（零回归）', `差异 ${probe.smallMismatch}`)

// ---- A/B/C/D：实际移动 -------------------------------------------------
// 把玩家放到 BOSS 右侧有地面的位置，触发追击
const setup = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g.director.largeList[0]
  g.player.body.x = b.body.x + b.body.w + 340
  g.player.body.y = b.body.y + b.body.h - g.player.body.h
  g.player.body.vx = 0
  b.activated = true
  b.state = 'roam'
  b.stateT = 0
  b.moveCd = 6 // 先别放招，专心走路
  return { bossX: Math.round(b.body.x), playerX: Math.round(g.player.body.x), hp: g.player.hp }
})

const track = []
for (let i = 0; i < 20; i++) {
  await wait(300)
  const s = await page.evaluate(() => {
    const g = window.__rustfall
    const b = g.director.largeList[0]
    const pc = g.player.body.x + g.player.body.w / 2
    const bc = b.body.x + b.body.w / 2
    return {
      x: Math.round(b.body.x),
      hd: Math.round(Math.abs(pc - bc)),
      vx: Math.round(b.body.vx),
      vxT: Math.round(b.vxTarget || 0),
      f: b.facing,
      st: b.state,
      anim: b.animName,
    }
  })
  track.push(s)
}
console.log('\n--- 追击追踪（每 300ms） ---')
track.forEach((s, i) => console.log(String(i).padStart(2), JSON.stringify(s)))

const a = track[0]
const z = track[track.length - 1]
const dx = z.x - a.x
const flips = track.slice(1).filter((s, i) => s.f !== track[i].f).length
const moving = track.filter((s) => s.anim === 'run')
ok(Math.abs(dx) > 100, '追击时产生实际位移', `位移 ${dx}px（${a.x} → ${z.x}）`)
ok(z.hd < a.hd - 60, '与玩家的水平距离明显缩短', `${a.hd} → ${z.hd}px`)
ok(flips <= 2, '不再原地打转（朝向翻转 ≤2 次 / 6s）', `翻转 ${flips} 次`)
ok(moving.length >= 6, '移动期间播放跑步动画', `run 采样 ${moving.length}/${track.length}`)

// ---- D：巡逻（玩家远离 → 回到 roam，靠巡逻点走）----------------------
// 找一个「够宽、上方无遮挡」的平地，把 BOSS 直接放上去，
// 这样测的是 roamStep 本身，而不是测试房那段有台阶的怪地形。
const flat = await page.evaluate(() => {
  const g = window.__rustfall
  const b = g.director.largeList[0]
  const map = b.map
  const TS = 32
  const need = Math.ceil(b.body.w / TS) + 4
  for (let ty = 6; ty < map.h - 2; ty++) {
    for (let tx = 4; tx < map.w - need - 4; tx++) {
      let okRow = true
      for (let k = 0; k < need; k++) {
        if (!map.isSolid(tx + k, ty)) {
          okRow = false
          break
        }
        for (let ry = ty - 6; ry < ty; ry++) {
          if (map.isSolid(tx + k, ry)) {
            okRow = false
            break
          }
        }
        if (!okRow) break
      }
      if (!okRow) continue
      // 找到平地：把 BOSS 与玩家都挪过去
      const px = (tx + 1) * TS
      b.body.x = px
      b.body.y = ty * TS - b.body.h
      b.body.vx = 0
      b.body.vy = 0
      g.player.body.x = px + 900
      g.player.body.y = ty * TS - g.player.body.h
      b.activated = false
      b.state = 'roam'
      b.stateT = 0
      b.setPatrol([
        { x: px - 220, y: ty * TS },
        { x: px + 200, y: ty * TS },
      ])
      b.patrolIdx = 0
      b.patrolWait = 0
      b._roamBlockCd = 0
      return { tx, ty, bossX: Math.round(b.body.x), patrol: b.patrol.map((p) => Math.round(p.x)) }
    }
  }
  return { error: '房间里找不到平地' }
})
console.log('\n--- 巡逻（平地） ---')
console.log('平地:', JSON.stringify(flat))
if (flat.error) {
  ok(false, '找到平地用于巡逻测试', flat.error)
} else {
  const p0 = { x: flat.bossX }
  let maxDelta = 0
  let lastX = p0.x
  const samples = []
  for (let i = 0; i < 16; i++) {
    await wait(300)
    const s = await page.evaluate(() => {
      const b = window.__rustfall.director.largeList[0]
      return { x: Math.round(b.body.x), vx: Math.round(b.body.vx), vxT: Math.round(b.vxTarget || 0), f: b.facing, st: b.state, anim: b.animName }
    })
    samples.push(s)
    maxDelta = Math.max(maxDelta, Math.abs(s.x - lastX))
    lastX = s.x
  }
  samples.forEach((s, i) => console.log(String(i).padStart(2), JSON.stringify(s)))
  const pz = samples[samples.length - 1]
  console.log(`巡逻：${p0.x} → ${pz.x}（单段最大 ${maxDelta}px）`)
  ok(Math.abs(pz.x - p0.x) > 80 || maxDelta > 40, '玩家远离后仍能靠巡逻点走动', `位移 ${pz.x - p0.x}px / 单段最大 ${maxDelta}px`)
}

await page.screenshot({ path: path.join(OUT, 'boss-walk-move-verify.png') })
console.log('\n=== 结果 ===')
ok(errors.length === 0, '无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'boss-walk-move-verify.png'))}`)
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 大怪/BOSS 行走位移 全部通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
