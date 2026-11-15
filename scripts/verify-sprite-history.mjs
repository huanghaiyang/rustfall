// ============================================================================
// 验证：精灵编辑器「历史编辑记录」+ 落盘（防丢失）
// ----------------------------------------------------------------------------
// 覆盖 4 件事：
//   1. 历史确实在磁盘上（editor-data/sprite-editor/history/）
//   2. 面板能列出「数据执政官 上一次的编辑内容」并预览帧
//   3. 「恢复此版本」真的把工程换回去，并且自动留一条「恢复前」快照
//   4. 清掉浏览器存储（localStorage + IndexedDB）后重开，工程从磁盘恢复
//
// 用法：node scripts/verify-sprite-history.mjs
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
const BOSS = argOf('boss', 'tb_data_archon')
const OUT = path.resolve(argOf('out', '.screenshots/boss-walk'))
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

async function openEditor() {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await wait(2500)
  const hit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('精灵/骨骼编辑器'))
    if (!b) return false
    b.click()
    return true
  })
  if (!hit) throw new Error('主菜单没有精灵编辑器入口')
  await page.waitForSelector('.sec-canvas', { timeout: 15000 })
  await wait(900)
}

/** 等 onMounted 里的异步恢复/迁移跑完 */
async function settle() {
  for (let i = 0; i < 40; i++) {
    const busy = await page.evaluate(() => {
      const E = window.__spriteEditor
      return !E || !E.SE || E.SE.project.sheets.length === 0 ? 'wait' : 'idle'
    })
    if (busy === 'idle') break
    await wait(120)
  }
  await wait(400)
}

console.log('\n=== 1) 历史 & 落盘 ===')
await openEditor()
await settle()

const disk = await page.evaluate(async () => {
  const E = window.__spriteEditor
  const { historyBackend, historyDiskDir, listHistory } = await import('/src/game/editor/sprite-history.js')
  const backend = await historyBackend()
  const dir = await historyDiskDir()
  const list = await listHistory()
  return {
    backend,
    dir,
    count: list.length,
    items: list.map((m) => ({
      id: m.id,
      at: m.at,
      reason: m.reason,
      actions: m.counts.actions,
      frames: m.counts.frames,
      targets: (m.targets || []).map((t) => `${t.refId}:${t.actions}`),
    })),
  }
})
console.log(JSON.stringify(disk, null, 1))
ok(disk.backend === 'disk', '后端是磁盘', `${disk.backend} ${disk.dir}`)
ok(disk.count >= 2, '至少 2 条历史', `count=${disk.count}`)
const mine = disk.items.filter((m) => m.targets.some((t) => t.startsWith(BOSS)))
ok(mine.length >= 2, `有 ≥2 条属于 ${BOSS} 的记录`, `count=${mine.length}`)
const older = mine[mine.length - 1]
ok(older.actions === 1, '较旧那条只有 1 个动作（上一次编辑 = 只切了 walk）', `actions=${older.actions} frames=${older.frames}`)

// 磁盘文件确实存在
const histDir = path.resolve('editor-data/sprite-editor/history')
const files = fs.existsSync(histDir) ? fs.readdirSync(histDir).filter((f) => f.endsWith('.json')) : []
ok(files.includes('index.json'), '磁盘上有 history/index.json')
ok(files.filter((f) => f !== 'index.json').length >= 2, '磁盘上有 ≥2 个快照文件', `files=${files.length}`)
ok(fs.existsSync(path.resolve('editor-data/sprite-editor/project.json')), '磁盘上有 project.json')

console.log('\n=== 2) 面板查看「上一次的编辑内容」 ===')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').startsWith('历史'))
  b?.click()
})
await page.waitForSelector('.sh-item', { timeout: 8000 })
await wait(600)
// 列表：最新在前 → 点较旧的那条（只看当前目标已默认勾选）
const picked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.sh-item')]
  if (items.length < 2) return { ok: false, n: items.length }
  items[items.length - 1].click()
  return { ok: true, n: items.length, text: items[items.length - 1].innerText.replace(/\n/g, ' | ') }
})
ok(picked.ok, '面板列出历史并选中较早的一条', `n=${picked.n}`)
console.log('   选中:', picked.text)
await wait(900)
const detail = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.sh-tab')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
  diff: [...document.querySelectorAll('.sh-diff li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
  canvasPainted: (() => {
    const c = document.querySelector('.sh-canvas')
    if (!c) return false
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) n++
    return n > 0
  })(),
  backendText: document.querySelector('.sh-backend')?.textContent?.trim() || '',
}))
console.log(JSON.stringify({ ...detail, canvasPainted: detail.canvasPainted }, null, 1))
ok(detail.tabs.length >= 1, '详情里能切动作帧', JSON.stringify(detail.tabs))
ok(detail.diff.length >= 1, '详情里给出了与当前版本的差异', JSON.stringify(detail.diff))
ok(detail.canvasPainted, '帧预览画布有内容')
ok(/落盘|editor-data/.test(detail.backendText), '面板显示「已落盘」', detail.backendText)
await page.screenshot({ path: path.join(OUT, 'history-panel.png') })

console.log('\n=== 3) 恢复此版本 ===')
const beforeRestore = await page.evaluate(async () => {
  const E = window.__spriteEditor
  const { projectHash } = await import('/src/game/editor/sprite-history.js')
  const sp = E.SE.project.sprites[0]
  return {
    actions: sp?.actions?.map((a) => `${a.name}:${a.frames.length}`) || [],
    hash: projectHash(E.SE.project),
  }
})
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sh-btn')].find((x) => x.textContent.includes('恢复此版本'))
  b?.click()
})
await wait(1600)
const afterRestore = await page.evaluate(async () => {
  const E = window.__spriteEditor
  const sp = E.SE.project.sprites[0]
  const list = await E.historyEntries()
  return {
    actions: sp?.actions?.map((a) => `${a.name}:${a.frames.length}`) || [],
    count: list.length,
    reasons: list.map((m) => m.reason),
    hashes: list.map((m) => m.hash),
  }
})
console.log(' before:', JSON.stringify(beforeRestore.actions), 'hash', beforeRestore.hash)
console.log(' after :', JSON.stringify(afterRestore.actions), 'history=', afterRestore.count, afterRestore.reasons.join(','))
ok(afterRestore.actions.length === 1, '恢复后只剩 walk（= 上一次的工程）', JSON.stringify(afterRestore.actions))
// 反悔能力：恢复前那一刻的工程必须在历史里（要么本来就是最新那条，要么新留一条「恢复前」）
ok(afterRestore.hashes.includes(beforeRestore.hash), '恢复前的工程仍可在历史里找到（可反悔）',
  afterRestore.reasons.join(','))

// 再验一次「未发布过的改动」也会被留档：改 walk 的 fps 后恢复
console.log('\n=== 3b) 未发布的改动恢复前也会留档 ===')
const dirty = await page.evaluate(async () => {
  const E = window.__spriteEditor
  const sp = E.SE.project.sprites[0]
  const walk = sp.actions.find((a) => a.name === 'walk')
  walk.fps = 7
  const { projectHash } = await import('/src/game/editor/sprite-history.js')
  return { hash: projectHash(E.SE.project), fps: walk.fps }
})
const restoreId = await page.evaluate(async (boss) => {
  const E = window.__spriteEditor
  const list = await E.historyEntries()
  const target = list.find((m) => (m.targets || []).some((t) => t.refId === boss) && m.counts.actions === 2)
  if (!target) return null
  await E.restoreHistory(target.id)
  const list2 = await E.historyEntries()
  return { count: list2.length, reasons: list2.map((m) => m.reason), hashes: list2.map((m) => m.hash) }
}, BOSS)
console.log(' dirty hash', dirty.hash, '→', JSON.stringify(restoreId))
ok(restoreId && restoreId.reasons.includes('恢复前'), '未发布的改动被存成「恢复前」快照', JSON.stringify(restoreId?.reasons))
ok(restoreId && restoreId.hashes.includes(dirty.hash), '「恢复前」快照就是那一刻的工程', '')

console.log('\n=== 4) 恢复回最新版本 ===')
const backId = await page.evaluate(async (boss) => {
  const E = window.__spriteEditor
  const list = await E.historyEntries()
  const target = list.find((m) => (m.targets || []).some((t) => t.refId === boss) && m.counts.actions >= 2)
  if (!target) return null
  await E.restoreHistory(target.id)
  const sp = E.SE.project.sprites[0]
  return { id: target.id, actions: sp?.actions?.map((a) => `${a.name}:${a.frames.length}`) || [] }
}, BOSS)
console.log(' back  :', JSON.stringify(backId))
ok(backId && backId.actions.length === 2, '已恢复回 walk+run 两动作', JSON.stringify(backId?.actions))

// 磁盘工程也应是这一版
await page.evaluate(async () => {
  const E = window.__spriteEditor
  await E.flushDiskProject(true)
})
await wait(400)
const onDisk = JSON.parse(fs.readFileSync(path.resolve('editor-data/sprite-editor/project.json'), 'utf8'))
const diskActions = (onDisk.sprites?.[0]?.actions || []).map((a) => `${a.name}:${(a.frames || []).length}`)
ok(diskActions.length === 2, '磁盘 project.json 同步为 walk+run', JSON.stringify(diskActions))

console.log('\n=== 5) 清浏览器存储 → 从磁盘恢复 ===')
await page.evaluate(async () => {
  localStorage.clear()
  try {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('rustfall-sprite-editor')
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    })
  } catch (e) { /* ignore */ }
})
await openEditor()
await settle()
const recovered = await page.evaluate(() => {
  const E = window.__spriteEditor
  const sp = E.SE.project.sprites[0]
  return {
    sheets: E.SE.project.sheets.length,
    sprites: E.SE.project.sprites.length,
    refId: sp?.refId || '',
    actions: sp?.actions?.map((a) => `${a.name}:${a.frames.length}`) || [],
    localHas: !!localStorage.getItem('rustfall.spriteeditor.v1'),
  }
})
console.log(JSON.stringify(recovered, null, 1))
ok(recovered.sprites >= 1 && recovered.actions.length === 2, '清空浏览器存储后工程从磁盘恢复', JSON.stringify(recovered.actions))
ok(recovered.localHas, '恢复后回填了 localStorage')

await page.screenshot({ path: path.join(OUT, 'history-restored-from-disk.png') })

console.log('\n=== 结果 ===')
ok(errors.length === 0, '无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(fails.length ? `\n[FAILED] ${fails.length} 项：\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 历史记录 + 落盘 + 恢复 + 从磁盘重建 全部通过')
console.log(`[shot] ${path.relative(process.cwd(), path.join(OUT, 'history-panel.png'))}`)

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
