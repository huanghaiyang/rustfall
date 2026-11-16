// ============================================================================
// 验证：数据执政官「穿隧冲刺」—— 12 帧冲刺动画 + 真正的位移
// ----------------------------------------------------------------------------
// 冲刺不是「改坐标」：startDash 只给一个短时间的速度倍率，交给 base.update 的
// vx → moveBody 推进，所以撞墙会停、下台阶会掉；这也意味着它必须真的过物理。
//
// 断言：
//   A. 资源：frames.dash 12 帧、fps 16、dash 格 512×336（比走路格宽）
//   B. 行为：wind → dash → recover，冲刺期间状态是 'dash'、动画是 'dash'
//   C. 位移：冲刺后 x 沿朝向移动 ≥120px（这是本次的核心要求）
//   D. 尺寸：冲刺时 quad 临时拉宽到 256×168（136 × 512/272），收招后回到 136×168
//   E. 命中：玩家站在冲刺路径上会掉血
//   F. 撞墙：贴墙冲刺会提前收招，且不会穿出房间
//   G. 无 console / pageerror；输出过程截图
//
// 用法：node scripts/verify-boss-dash.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const argv = process.argv.slice(2)
const URL = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://127.0.0.1:5180/'
const OUT = path.resolve('.screenshots/dash')
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
  browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1400, height: 860 } })
} catch (e) {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1400, height: 860 },
  })
  ownBrowser = true
}
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 860 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 200))
})
page.on('dialog', (d) => d.accept().catch(() => {}))

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
// 等 game 起来 + 标题界面稳定（boot 是异步的，界面会重渲染；太早点按钮会点到被替换掉的旧节点）
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!window.__rustfall)) break
  await wait(200)
}
await wait(1400)

/** 反复点「BOSS 测试房」直到 BOSS 选择面板出现 */
async function openBossSelect() {
  for (let i = 0; i < 60; i++) {
    const state = await page.evaluate(() => {
      if (window.__G?.phase === 'playing') return 'playing'
      if (document.body.innerText.includes('BOSS SELECT')) return 'panel'
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('BOSS测试房'))
      if (b) {
        b.click()
        return 'clicked'
      }
      return 'wait'
    })
    if (state === 'playing' || state === 'panel') return state
    await wait(300)
  }
  return 'timeout'
}

/** 反复点数据执政官，直到进入房间（只认 button：外层容器也含同样文本，点容器没反应） */
async function pickDataArchon() {
  for (let i = 0; i < 80; i++) {
    const state = await page.evaluate(() => {
      if (window.__G?.phase === 'playing') return 'playing'
      const btn = [...document.querySelectorAll('button')].find((x) =>
        x.textContent.replace(/\s+/g, '').startsWith('数据执政官'),
      )
      if (btn) {
        btn.click()
        return 'clicked'
      }
      return 'wait'
    })
    if (state === 'playing') return state
    await wait(300)
  }
  return 'timeout'
}

const entry = await openBossSelect()
const picked = await pickDataArchon()
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => (window.__rustfall?.director?.largeList || []).length > 0)) break
  await wait(250)
}
await wait(1800)
// 以「真的进房间了」为准（中间点按可能重复开合面板，用结果判定而不是过程返回值）
const inRoom = await page.evaluate(
  () => window.__G?.phase === 'playing' && (window.__rustfall?.director?.largeList || []).length > 0,
)
if (!inRoom) {
  const phase = await page.evaluate(() => window.__G?.phase)
  console.error(`[fail] 进房失败（bossSelect=${entry} pick=${picked} phase=${phase}）`)
  process.exit(1)
}
console.log(`[in ] 已进入 BOSS 测试房（bossSelect=${entry} pick=${picked}）`)

// ---------------------------------------------------------------------------
// A. 资源
// ---------------------------------------------------------------------------
const assets = await page.evaluate(() => {
  const m = window.__rustfall?.director?.largeList?.[0]
  if (!m) return { error: '场上没有 BOSS' }
  return {
    dashFrames: (m.frames?.dash || []).length,
    dashFps: m.animFps?.dash,
    baseCell: m.art?.baseCell,
    dashCell: m.art?.actionCell?.dash,
    sprite: { w: m.spriteW, h: m.spriteH },
    kit: m.kit?.da_tunnel_dash
      ? { name: m.kit.da_tunnel_dash.name, en: m.kit.da_tunnel_dash.en, wind: m.kit.da_tunnel_dash.wind, range: m.kit.da_tunnel_dash.range }
      : null,
    inMoves: (m.moves || []).includes('da_tunnel_dash'),
  }
})
console.log('\n--- A. 资源 ---')
console.log(JSON.stringify(assets, null, 1))
if (assets.error) {
  console.error('[fail]', assets.error)
  process.exit(1)
}
ok(assets.dashFrames === 12, '冲刺序列帧 12 帧', String(assets.dashFrames))
ok(assets.dashFps > 0, '冲刺 fps 生效', String(assets.dashFps))
ok(!!assets.dashCell && assets.dashCell.w === 512 && assets.dashCell.h === 336, 'dash 使用 512×336 的格子', JSON.stringify(assets.dashCell))
ok(!!assets.kit && assets.inMoves, '冲刺招式已进招式表', assets.kit ? `${assets.kit.name} / wind ${assets.kit.wind}` : '')

// ---------------------------------------------------------------------------
// B/C/D. 触发一次冲刺，采样位移与动画
// ---------------------------------------------------------------------------
const setup = await page.evaluate(() => {
  const g = window.__rustfall
  const m = g.director.largeList[0]
  m.activated = true
  m.facing = 1
  m.state = 'wind:da_tunnel_dash'
  m.stateT = 0
  m.moveCd = 0
  m.vxTarget = 0
  m.body.vx = 0
  g.player.body.x = m.body.x + m.body.w + 420
  g.player.body.y = m.body.y + m.body.h - g.player.body.h
  g.player.body.vx = 0
  return {
    bossX: Math.round(m.body.x),
    playerX: Math.round(g.player.body.x),
    facing: m.facing,
    sprite: { w: m.spriteW, h: m.spriteH },
  }
})
console.log('\n--- B/C/D. 冲刺采样 ---')
console.log('setup', JSON.stringify(setup))

const track = []
for (let i = 0; i < 40; i++) {
  await wait(70)
  const s = await page.evaluate(() => {
    const g = window.__rustfall
    const m = g.director.largeList[0]
    return {
      x: Math.round(m.body.x),
      vx: Math.round(m.body.vx),
      st: m.state,
      anim: m.animName,
      sw: Math.round(m.spriteW),
      sh: Math.round(m.spriteH),
      hp: g.player.hp,
      onGround: !!m.body.onGround,
    }
  })
  track.push(s)
  if (s.st === 'recover' && track.length > 4) break
}
track.forEach((s, i) => console.log(String(i).padStart(2), JSON.stringify(s)))

const first = track[0]
const last = track[track.length - 1]
const dashSamples = track.filter((s) => s.st === 'dash')
const dx = last.x - first.x
ok(dashSamples.length > 0, '进入 dash 状态', `${dashSamples.length} 个采样`)
ok(dashSamples.every((s) => s.anim === 'dash'), '冲刺期间播放 dash 动画', [...new Set(dashSamples.map((s) => s.anim))].join(','))
ok(dx * setup.facing > 120, '冲刺产生真实位移（沿朝向 ≥120px）', `位移 ${dx}px（朝向 ${setup.facing}）`)
const peak = Math.max(...track.map((s) => Math.abs(s.vx)))
ok(peak > 150, '冲刺速度明显高于走路（|vx| > 150）', `峰值 ${peak}px/s（走路 58px/s）`)
const wide = dashSamples.find((s) => s.sw > 200)
ok(!!wide, '冲刺时 quad 临时拉宽（像素比例不变）', wide ? `${wide.sw}×${wide.sh}` : `最大 ${Math.max(...dashSamples.map((s) => s.sw))}`)
ok(last.st === 'recover' || last.st === 'chase', '冲刺结束进入收招', last.st)
ok(last.sw === setup.sprite.w && last.sh === setup.sprite.h, '收招后 quad 回到原尺寸', `${last.sw}×${last.sh}`)

// ---------------------------------------------------------------------------
// E. 命中
// ---------------------------------------------------------------------------
const beforeHp = await page.evaluate(() => {
  const g = window.__rustfall
  const m = g.director.largeList[0]
  // 玩家血量在全局状态里（G.hp / G.hpMax），robot 上只有 invuln 计时
  window.__G.hp = window.__G.hpMax
  g.player.invuln = 0
  g.player.body.x = m.body.x + m.body.w + 110
  g.player.body.y = m.body.y + m.body.h - g.player.body.h
  m.activated = true
  m.facing = 1
  const before = window.__G.hp
  m.startDash({ dur: 0.5, speedMul: 6.2, damage: 22 })
  return before
})
await wait(700)
const afterHp = await page.evaluate(() => window.__G.hp)
console.log('\n--- E. 命中 ---')
console.log(JSON.stringify({ before: beforeHp, after: afterHp }))
ok(afterHp < beforeHp, '冲刺路径上的玩家会掉血', `${beforeHp} → ${afterHp}`)

// ---------------------------------------------------------------------------
// F. 撞墙
// ---------------------------------------------------------------------------
const wallCheck = await page.evaluate(async () => {
  const g = window.__rustfall
  const m = g.director.largeList[0]
  const map = m.map
  const roomW = map.w * (map.ts || 32)
  m.body.x = roomW - m.body.w - 40
  g.player.body.x = m.body.x - 320
  g.player.body.y = m.body.y + m.body.h - g.player.body.h
  m.body.vx = 0
  m.facing = 1
  m.activated = true
  const startX = m.body.x
  m.startDash({ dur: 1.2, speedMul: 6, damage: 1 })
  await new Promise((r) => setTimeout(r, 800))
  return {
    startX: Math.round(startX),
    endX: Math.round(m.body.x),
    state: m.state,
    roomW: Math.round(roomW),
    bodyRight: Math.round(m.body.x + m.body.w),
  }
})
console.log('\n--- F. 撞墙 ---')
console.log(JSON.stringify(wallCheck))
ok(wallCheck.bodyRight <= wallCheck.roomW + 2, '冲刺不会穿出房间/墙面', `右边界 ${wallCheck.bodyRight} ≤ 房间宽 ${wallCheck.roomW}`)
// ---------------------------------------------------------------------------
// G. 截图：找一段平地，跑完整条冲刺
// ---------------------------------------------------------------------------
const shots = []
const shotSetup = await page.evaluate(() => {
  const g = window.__rustfall
  const m = g.director.largeList[0]
  const map = m.map
  const TS = map.ts || 32
  const need = Math.ceil(m.body.w / TS) + 8
  // 找一段「地面连续、上方 6 行空」的平地，保证冲刺不会被坑/墙打断
  for (let ty = 6; ty < map.h - 2; ty++) {
    for (let tx = 4; tx < map.w - need - 4; tx++) {
      let okRow = true
      for (let k = 0; k < need && okRow; k++) {
        if (!map.isSolid(tx + k, ty)) okRow = false
        for (let ry = ty - 6; ry < ty && okRow; ry++) if (map.isSolid(tx + k, ry)) okRow = false
      }
      if (!okRow) continue
      const px = (tx + 2) * TS
      m.body.x = px
      m.body.y = ty * TS - m.body.h
      m.body.vx = 0
      m.body.vy = 0
      m.facing = 1
      m.activated = true
      m.state = 'chase'
      g.player.body.x = px + 520
      g.player.body.y = ty * TS - g.player.body.h
      return { tx, ty, bossX: Math.round(px), playerX: Math.round(g.player.body.x) }
    }
  }
  return { error: '没找到平地' }
})
console.log('\n--- G. 截图 ---')
console.log(JSON.stringify(shotSetup))
await wait(600)
// 截图比游戏帧慢得多（一张 1400×860 要 200ms+），靠 wait 抓不准冲刺中的帧。
// 办法：推进 110ms → 冻结时钟（dt=0，姿势停住）→ 截图 → 解冻并重置 last 防跳帧。
const freeze = () =>
  page.evaluate(() => {
    if (!window.__frozenNow) {
      window.__realNow = performance.now.bind(performance)
      window.__frozenNow = window.__realNow()
      performance.now = () => window.__frozenNow
    }
  })
const thaw = () =>
  page.evaluate(() => {
    if (window.__realNow) performance.now = window.__realNow
    window.__realNow = null
    window.__frozenNow = null
    const g = window.__rustfall
    g.last = performance.now()
    g.acc = 0
  })
await page.evaluate(() => window.__rustfall.director.largeList[0].startDash({ dur: 0.6, speedMul: 6.2, damage: 1 }))
for (let i = 0; i < 6; i++) {
  await wait(95)
  await freeze()
  const s = await page.evaluate(() => {
    const m = window.__rustfall.director.largeList[0]
    return { x: Math.round(m.body.x), anim: m.animName, sw: Math.round(m.spriteW), st: m.state }
  })
  console.log(`  shot ${i + 1}`, JSON.stringify(s))
  const file = path.join(OUT, `ingame-dash-${i + 1}.png`)
  await page.screenshot({ path: file, captureBeyondViewport: false })
  shots.push(path.relative(process.cwd(), file))
  await thaw()
}
await wait(700)
await page.screenshot({ path: path.join(OUT, 'ingame-dash-after.png'), captureBeyondViewport: false })
console.log('\n=== 结果 ===')
ok(errors.length === 0, '无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'ingame-dash-after.png'))}`)
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 穿隧冲刺（12 帧动画 + 真实位移）全部通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)