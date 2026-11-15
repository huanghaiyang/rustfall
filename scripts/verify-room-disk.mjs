// ============================================================================
// 验证：房间编辑器「工程 + 地形表 + 背景表」落盘（防丢失）
// ----------------------------------------------------------------------------
// 1. 打开房间编辑器 → 在 draft 模式画一格（draft 不会推运行时，安全）
// 2. 等落盘 → 检查 editor-data/blobs/room-editor.json 里有那格
// 3. 清 localStorage → 重开编辑器 → 编辑从磁盘恢复
// 4. 清掉测试改动（并删除磁盘快照），把现场还原干净
//
// 用法：node scripts/verify-room-disk.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CDP = process.env.CHROME_CDP || 'http://127.0.0.1:9333'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:5180/'
const BLOB = path.resolve('editor-data/blobs/room-editor.json')
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

async function openRoomEditor() {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await wait(2500)
  const hit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s/g, '').includes('房间编辑器'))
    if (!b) return false
    b.click()
    return true
  })
  if (!hit) throw new Error('主菜单没有房间编辑器入口')
  await page.waitForSelector('.rm-root', { timeout: 15000 })
  await wait(1200)
}

await openRoomEditor()

console.log('\n=== 1) draft 模式下画一格 → 等落盘 ===')
const edit = await page.evaluate(() => {
  const E = window.__roomEditor
  const R = E.RE
  E.setDraft()  // 草稿：不推运行时，安全
  const key = `${R.sel.regionId}:${R.sel.roomId}`
  // 找一格 EMPTY 再画成 SOLID（setTile 对「值没变」会直接 return）
  let spot = null
  for (let y = 4; y < 24 && !spot; y++) {
    for (let x = 4; x < 48 && !spot; x++) {
      if (R.gen?.map?.get(x, y) === 0) spot = [x, y]
    }
  }
  if (spot) E.setTile(spot[0], spot[1], 1)
  E.saveProject()
  const e = E.RE.project.edits[key]
  return {
    key,
    spot,
    tile: spot ? e?.tiles?.[spot.join(',')] ?? null : null,
    draft: E.isDraft(),
  }
})
console.log(JSON.stringify(edit))
ok(edit.tile === 1, '工程里记下了这一格')

await page.evaluate(() => window.__roomEditor.flushDiskBackup())
await wait(500)
ok(fs.existsSync(BLOB), '磁盘上有 editor-data/blobs/room-editor.json')
const snap = JSON.parse(fs.readFileSync(BLOB, 'utf8'))
const diskTile = snap?.project?.edits?.[edit.key]?.tiles?.[edit.spot.join(',')]
ok(diskTile === 1, '磁盘快照里也有这一格', `${edit.key} ${edit.spot} → ${diskTile}`)
ok(Object.prototype.hasOwnProperty.call(snap, 'terrain') && Object.prototype.hasOwnProperty.call(snap, 'bg'),
  '快照同时带上了地形表 / 背景表')

console.log('\n=== 2) 清 localStorage → 从磁盘恢复 ===')
await page.evaluate(() => {
  localStorage.removeItem('rustfall.roomeditor.v1')
  localStorage.removeItem('rustfall.terrain.v1')
  localStorage.removeItem('rustfall.bgedits.v1')
})
await openRoomEditor()
await wait(1500)
const recovered = await page.evaluate(({ key, spot }) => {
  const E = window.__roomEditor
  return {
    tile: E.RE.project.edits?.[key]?.tiles?.[spot.join(',')] ?? null,
    rooms: Object.keys(E.RE.project.edits || {}).length,
    localHas: !!localStorage.getItem('rustfall.roomeditor.v1'),
  }
}, { key: edit.key, spot: edit.spot })
console.log(JSON.stringify(recovered))
ok(recovered.tile === 1, '清空浏览器存储后编辑从磁盘恢复', `tile=${recovered.tile}`)
ok(recovered.localHas, '恢复后回填了 localStorage')

console.log('\n=== 3) 还原现场（删测试改动 + 删磁盘快照）===')
const cleaned = await page.evaluate(async (key) => {
  const E = window.__roomEditor
  const [regionId, roomId] = key.split(':')
  E.clearRoomEdits(regionId, roomId)
  E.publish()
  await E.flushDiskBackup()
  const e = E.RE.project.edits?.[key]
  return { tiles: e?.tiles ? Object.keys(e.tiles).length : 0, rooms: Object.keys(E.RE.project.edits || {}).length }
}, edit.key)
console.log(JSON.stringify(cleaned))
ok(cleaned.tiles === 0, '测试格子已清除')

// 磁盘快照也删掉（回到「从未用过房间编辑器」的干净状态）
const del = await fetch('http://127.0.0.1:5180/__editor/blob/room-editor', { method: 'DELETE' }).then((r) => r.status)
ok(del === 200, '磁盘测试快照已删除', `status=${del}`)
await page.evaluate(() => {
  localStorage.removeItem('rustfall.roomeditor.v1')
  localStorage.removeItem('rustfall.terrain.v1')
  localStorage.removeItem('rustfall.bgedits.v1')
})

console.log('\n=== 结果 ===')
ok(errors.length === 0, '无 console error / pageerror', errors.slice(0, 4).join(' | '))
console.log(fails.length ? `\n[FAILED] ${fails.length} 项:\n - ${fails.join('\n - ')}` : '\n[ALL PASS] 房间编辑器落盘 + 从磁盘恢复 通过')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
process.exit(fails.length ? 1 : 0)
