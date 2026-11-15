// ============================================================================
// 用「内嵌精灵编辑器」把一条动作序列帧绑到指定角色 / BOSS 身上，并发布。
// ----------------------------------------------------------------------------
// 做的事（全部走编辑器自己的 store API + 面板 UI，不是绕过编辑器改文件）：
//   1. 打开 http://127.0.0.1:5180/ → 主菜单点「精灵 / 骨骼编辑器」
//   2. 左栏选目标（角色 / 怪物 / BOSS）
//   3. 「导入精灵图」：读走图集 PNG → File → importSheetForTarget(file, target)
//      → 自动建 sprite（kind/refId/family/name/hitbox + 骨骼/碰撞模板）
//   4. 把图集按格切成动作帧：每个动作一条 action，帧矩形逐格填
//   5. publish() —— 写 localStorage + 发 rustfall:sprite-editor-published
//      → 游戏侧 sprite-editor-bridge 会把它变成运行时帧纹理（局部覆盖磁盘图集）
//   6. 截图留证
//
// 用法：
//   node scripts/sprite-editor-apply-walk.mjs
//   node scripts/sprite-editor-apply-walk.mjs --boss tb_data_archon --actions walk,run
//   node scripts/sprite-editor-apply-walk.mjs --url http://127.0.0.1:5180 --shot .screenshots/se.png
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
const STRIP = argOf('strip', `sprites/boss-action/${BOSS}_walk.png`)
const COLS = Number(argOf('cols', 10))
const CELL_W = Number(argOf('cellw', 272))
const CELL_H = Number(argOf('cellh', 336))
const FPS = Number(argOf('fps', 11))
const ACTIONS = argOf('actions', 'walk,run').split(',').map((s) => s.trim()).filter(Boolean)
const SHEET_NAME = argOf('sheet', `数据执政官·走路 ${COLS} 帧`)
const SHOT = argOf('shot', `.screenshots/sprite-editor-${BOSS}.png`)

let browser = null
let ownBrowser = false
try {
  browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 1600, height: 900 } })
} catch (e) {
  console.log(`[cdp ] connect 失败（${e.message.split('\n')[0]}），改为自己 launch`)
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
await new Promise((r) => setTimeout(r, 2500))

// ---- 1. 主菜单 → 精灵编辑器（真点按钮） ------------------------------------
const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.textContent.replace(/\s/g, '').includes('精灵/骨骼编辑器'),
  )
  if (!b) return { ok: false, buttons: [...document.querySelectorAll('button')].map((x) => x.textContent.trim()).slice(0, 12) }
  b.click()
  return { ok: true }
})
if (!opened.ok) {
  console.error('[fail] 主菜单里没找到精灵编辑器入口：', JSON.stringify(opened.buttons))
  process.exit(1)
}
await page.waitForSelector('.sec-canvas', { timeout: 15000 })
await new Promise((r) => setTimeout(r, 600))
console.log('[ui  ] 精灵编辑器已打开')

// ---- 2~5. 编辑器内：选目标 → 导入图集 → 切帧 → 发布 ------------------------
const out = await page.evaluate(
  async ({ BOSS, STRIP, COLS, CELL_W, CELL_H, FPS, ACTIONS, SHEET_NAME }) => {
    const E = window.__spriteEditor
    if (!E) return { error: 'window.__spriteEditor 不可用（编辑器模块没加载）' }
    const S = E.SE

    // 注册表是异步 import 出来的，等 BOSS 列表就位
    for (let i = 0; i < 80 && (E.BOSS_LIST?.length || 0) === 0; i++) await new Promise((r) => setTimeout(r, 100))
    E.loadRegistry()

    const found = E.findEntityDef('monster', BOSS)
    if (!found) return { error: `BOSS_LIST 里没有 ${BOSS}`, count: E.BOSS_LIST.length }

    // 选目标：BOSS 组
    const target = { kind: 'monster', refId: BOSS, boss: !!found.boss }
    E.setTarget(target.kind, target.refId, target.boss)

    // 幂等：先清掉这个目标之前绑过的 sprite（以及它独占的 sheet），重复跑不会堆垃圾
    for (const old of S.project.sprites.filter((s) => s.refId === BOSS)) {
      const sheetId = old.sheetId
      E.removeSprite(old.id)
      if (sheetId && !S.project.sprites.some((s) => s.sheetId === sheetId)) E.removeSheet(sheetId)
    }

    // 图集 → File → 走编辑器的「导入精灵图」入口（自动为该目标建 sprite）
    const resp = await fetch('/' + STRIP.replace(/^\/+/, ''), { cache: 'no-cache' })
    if (!resp.ok) return { error: `取图集失败 ${resp.status} ${STRIP}` }
    const blob = await resp.blob()
    const file = new File([blob], STRIP.split('/').pop(), { type: 'image/png' })
    const sheet = await E.importSheetForTarget(file, target, SHEET_NAME)
    const sp = S.project.sprites.filter((s) => s.refId === BOSS).pop()
    if (!sp) return { error: 'importSheetForTarget 之后没找到绑定该 refId 的 sprite' }
    S.sel.spriteId = sp.id

    // 先删掉自动建的空白 idle 动作（没帧的动作对运行时无意义）
    for (const a of sp.actions.filter((x) => !x.frames.length && x !== null)) {
      E.removeAction(a.id)
    }

    // 按格切帧：一条动作 = 一条 action，帧矩形逐格
    const made = []
    for (const name of ACTIONS) {
      const act = E.addAction(name)
      if (!act) return { error: 'addAction 失败：' + name }
      act.fps = FPS
      act.loop = true
      for (let i = 0; i < COLS; i++) {
        const f = E.addFrame(act.id, { x: i * CELL_W, y: 0, w: CELL_W, h: CELL_H })
        if (!f) break
        f.name = `${name}-${String(i + 1).padStart(2, '0')}`
      }
      made.push(name)
    }

    // 选中第一个动作 + 第一帧，方便截图看
    S.sel.spriteId = sp.id
    S.sel.actionId = sp.actions[0]?.id || ''
    S.sel.frameId = sp.actions[0]?.frames[0]?.id || ''
    S.sel.tool = 'select'

    E.saveProject()
    E.publish()

    const raw = localStorage.getItem('rustfall.spriteeditor.v1') || ''
    return {
      target,
      boss: { id: found.def.id, name: found.def.name, hitbox: found.def.hitbox, boss: !!found.boss },
      sheet: { id: sheet.id, name: sheet.name, w: sheet.width, h: sheet.height, gridW: sheet.gridW, gridH: sheet.gridH },
      sprite: {
        id: sp.id,
        name: sp.name,
        kind: sp.kind,
        refId: sp.refId,
        family: sp.family,
        w: sp.w,
        h: sp.h,
        bones: sp.bones.length,
        shapes: sp.shapes.length,
      },
      actions: sp.actions.map((a) => ({
        name: a.name,
        fps: a.fps,
        loop: a.loop,
        frames: a.frames.length,
        first: a.frames[0] ? { x: a.frames[0].x, y: a.frames[0].y, w: a.frames[0].w, h: a.frames[0].h } : null,
        last: a.frames.length
          ? {
              x: a.frames[a.frames.length - 1].x,
              y: a.frames[a.frames.length - 1].y,
              w: a.frames[a.frames.length - 1].w,
              h: a.frames[a.frames.length - 1].h,
            }
          : null,
      })),
      made,
      status: S.project.status,
      publishedAt: S.project.publishedAt,
      storageKB: Math.round(raw.length / 1024),
      spritesBound: S.project.sprites.filter((s) => s.refId === BOSS).length,
    }
  },
  { BOSS, STRIP, COLS, CELL_W, CELL_H, FPS, ACTIONS, SHEET_NAME },
)

if (out.error) {
  console.error('[fail]', out.error)
  await page.close()
  if (ownBrowser) await browser.close()
  else browser.disconnect()
  process.exit(1)
}

// ---- 6. 点「适应窗口」让整张图集铺满画布，再截图 --------------------------
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.title === '适应窗口')
  b?.click()
})
await new Promise((r) => setTimeout(r, 700))

fs.mkdirSync(path.dirname(path.resolve(SHOT)), { recursive: true })
await page.screenshot({ path: path.resolve(SHOT) })

console.log('[ok  ] 已绑定并发布')
console.log(
  JSON.stringify(
    {
      target: out.target,
      boss: out.boss,
      sheet: out.sheet,
      sprite: out.sprite,
      actions: out.actions,
      status: out.status,
      publishedAt: out.publishedAt,
      storageKB: out.storageKB,
      spritesBound: out.spritesBound,
    },
    null,
    1,
  ),
)
console.log(`[shot] ${SHOT}`)
if (errors.length) console.log('[warn] 页面报错', JSON.stringify(errors.slice(0, 8), null, 1))
else console.log('[ok  ] 无 console error / pageerror')

await page.close()
if (ownBrowser) await browser.close()
else browser.disconnect()
