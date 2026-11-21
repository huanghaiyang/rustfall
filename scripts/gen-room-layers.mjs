// 逐关三层（far / mid / near）可平铺背景条带生成。
// 与整图 gen-rooms.mjs 并行：三层用于真正的视差分层 + 无限横向滚动。
// 原图落 .tools/ark-raw/backdrops/rooms/<roomId>_<layer>.jpg；
// 后处理由 post_ark.py 的 layers 分支完成。
// 用法: node scripts/gen-room-layers.mjs [plain|themed|all] [comma roomIds] [far,mid,near]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate, download } from '../.tools/ark_gen.mjs'
import { BIOME_SCENE, VARIANT_SCENE, THEME_SCENE, hashSeed } from './gen-rooms.mjs'

const MODEL = 'doubao-seedream-5-0-pro-260628'
const SIZE_BG = '1664x928'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW_ROOM = path.join(ROOT, '.tools', 'ark-raw', 'backdrops', 'rooms')
fs.mkdirSync(RAW_ROOM, { recursive: true })

const BASE_STYLE =
  'Pixel art 2D side-scroller platformer background layer, wide panoramic, post-apocalyptic wasteland, dark moody overcast dusk, layered parallax, muted rust brown and ash gray palette, hand-crafted game art, no characters, no people, no animals, no watermark, no signature, no logo, no UI'

// 三层专属构图：far 天空远山 / mid 楼群轮廓 / near 近景剪影条
const LAYERS = {
  far: {
    desc: 'Far background layer only: moody overcast sky with heavy dark clouds and a faint distant mountain skyline silhouette low on the horizon, thin haze, everything light and hazy. No foreground buildings, no market stalls, no lamps, no trees, no cars, no ground objects; the lower half fades into plain haze',
    seedSalt: '|far',
  },
  mid: {
    desc: 'Middle ground layer only: one continuous row of ruined building and industrial structure silhouettes forming a broken skyline, sitting on the lower half against a plain flat sky. No stalls, no lamps, no trees, no cars, no ground rubble; the building bases end cleanly at the bottom edge',
    seedSalt: '|mid',
  },
  near: {
    desc: 'Foreground layer only: a dark wreckage silhouette strip along the bottom quarter, broken walls, dead trees, crushed cars, fence posts and rubble in near-black outline. The upper three quarters are an empty flat uniform dark background completely clear of objects',
    seedSalt: '|near',
  },
}

function buildLayerPrompt(room, layer) {
  const meta = LAYERS[layer]
  const indoorPrefix = room.indoor ? ', dim interior' : ''
  const base = BIOME_SCENE[room.biome] || BIOME_SCENE.city
  const variant = VARIANT_SCENE[room.variant] || ''
  const parts = [
    `${BASE_STYLE}${indoorPrefix}`,
    `Base setting: ${base}.`,
  ]
  if (variant) parts.push(`This room: ${variant}.`)
  if (room.theme && THEME_SCENE[room.theme]) parts.push(`Theme setting: ${THEME_SCENE[room.theme]}.`)
  parts.push(meta.desc)
  parts.push('Seamless horizontally tileable strip: the left edge matches the right edge for infinite horizontal scrolling. No signage, no plaques, no street signs, no posters, no written characters or symbols anywhere.')
  return parts.join(' ')
}

async function genOne(room, layer, retries = 2) {
  const dst = path.join(RAW_ROOM, `${room.roomId}_${layer}.jpg`)
  if (fs.existsSync(dst) && fs.statSync(dst).size > 20000) {
    console.log('skip', path.basename(dst))
    return 'skip'
  }
  const meta = LAYERS[layer]
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await generate({
        model: MODEL,
        prompt: buildLayerPrompt(room, layer),
        size: SIZE_BG,
        n: 1,
        seed: hashSeed(room.roomId + meta.seedSalt),
      })
      const d = res?.data?.[0]
      if (!d) throw new Error('no image: ' + JSON.stringify(res).slice(0, 300))
      if (d.url) await download(d.url, dst)
      else if (d.b64_json) fs.writeFileSync(dst, Buffer.from(d.b64_json, 'base64'))
      if (fs.statSync(dst).size < 20000) throw new Error('file too small')
      console.log('ok', path.basename(dst), Math.round(fs.statSync(dst).size / 1024), 'KB')
      return 'ok'
    } catch (e) {
      lastErr = e
      console.log(`retry ${attempt + 1} ${path.basename(dst)}: ${e?.message || e}`)
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)))
    }
  }
  console.error('ERR', path.basename(dst), lastErr?.message || lastErr)
  return 'err'
}

async function pool(rooms, layers, concurrency, worker) {
  let idx = 0
  const tasks = []
  for (const room of rooms) for (const layer of layers) tasks.push({ room, layer })
  const results = { ok: 0, skip: 0, err: 0 }
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < tasks.length) {
      const t = tasks[idx++]
      const r = await worker(t.room, t.layer)
      results[r] = (results[r] || 0) + 1
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  const tokens = process.argv.slice(2)
  // 层名 token（far/mid/near）与位置参数解耦：含层名的归 layers，其余依次为 scope、ids
  const layerTok = tokens.find((t) => {
    if (!t) return false
    return t.split(',').some((x) => !!LAYERS[x.trim()])
  })
  const layerArg = (layerTok || 'far,mid,near').toLowerCase()
  const layers = layerArg.split(',').map((s) => s.trim()).filter((l) => LAYERS[l])
  const rest = tokens.filter((t) => t !== layerTok)
  const scope = rest[0] || 'all'
  const onlyArg = rest[1] || ''
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, '.tools', 'room-list.json'), 'utf8'))
  let rooms = all
  if (scope === 'plain') rooms = rooms.filter((r) => !r.theme)
  else if (scope === 'themed') rooms = rooms.filter((r) => r.theme)
  if (onlyArg) {
    const ids = onlyArg.split(',').map((s) => s.trim()).filter(Boolean)
    rooms = rooms.filter((r) => ids.includes(r.roomId))
  }
  console.log(`scope=${scope} rooms=${rooms.length} layers=${layers.join('+')}`)
  const results = await pool(rooms, layers, 3, genOne)
  console.log('DONE', JSON.stringify(results))
}

main().catch((e) => {
  console.error('\nERR', e?.message || e)
  process.exit(1)
})
