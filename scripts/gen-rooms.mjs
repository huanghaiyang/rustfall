// 逐关专属背景生成清单：从 .tools/room-list.json 读全部房间，按
// biome 基调 + variant 场景 + indoor + 房间备注 构造 prompt，调 ARK 出图。
// 原图落 .tools/ark-raw/backdrops/rooms/<roomId>.jpg；后处理由 post_ark.py rooms 分支完成。
// 用法: node scripts/gen-rooms.mjs [plain|themed|all] [comma roomId list]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate, download } from '../.tools/ark_gen.mjs'

const MODEL = 'doubao-seedream-5-0-pro-260628'
const SIZE_BG = '1664x928'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW_ROOM = path.join(ROOT, '.tools', 'ark-raw', 'backdrops', 'rooms')
fs.mkdirSync(RAW_ROOM, { recursive: true })

const BG_STYLE =
  'Pixel art 2D side-scroller platformer distant backdrop, wide panoramic, post-apocalyptic wasteland, dark moody overcast dusk, layered parallax silhouettes, empty flat ground strip along the very bottom, no characters, no people, no animals, no text, no letters, no numbers, no watermark, no signature, no logo, no UI, muted rust brown and ash gray palette, hand-crafted game art'

// biome 基调场景（与 BIOME_BACKDROPS 保持一致）
export const BIOME_SCENE = {
  city: 'ruined modern city skyline, collapsed concrete high-rises, broken elevated highway bridges, rusted steel towers, distant smog and haze',
  village: 'abandoned rural village, cracked dry farmland rows, withered dead tree stumps, tilted crumbling farm houses, sagging wooden barn, dry well and broken fence, dust and dead yellow grass',
  factory: 'derelict industrial factory yard, rusted pipes and chimneys, idle conveyor belts, steel framework gantry, storage tanks, faint distant furnace orange glow, thin smoke haze',
  dump: 'vast garbage landfill mountain, stacked scrap metal and crushed cars, rusty shipping containers, gantry crane rails, smoldering waste pit with thin green smoke, piles of refuse',
  metro: 'abandoned subway station and tunnel, concrete platform edge, rusted train tracks, dim arched vault ceiling, shallow flood water reflections, dark cold blue-gray tones, deep tunnel vanishing into shadow',
  hospital: 'collapsed old hospital corridor and ward, broken windows, tilted beds and lockers, cracked concrete walls, cold moldy green-gray palette, dusty dim hall, hanging loose cables',
  port: 'silted-up abandoned seaport, muddy dock yard, idle gantry cranes, stacked rusty shipping containers, half-buried wrecked cargo ship, muddy tidal flats, gray overcast foggy sea',
}

// variant -> 房间特定场景词（叠加在 biome 基调之后）
export const VARIANT_SCENE = {
  street: 'street-level ruin, broken roadside sidewalks, wrecked vehicles and street furniture along the way',
  plaza: 'open concrete square, collapsed fountain basin ring, scattered market stalls and floodlight pylons',
  slum: 'cramped makeshift alley patched from sheet metal and loose planks, narrow gap between shacks',
  tower: 'high-rise core with staggered collapsed floor slabs forming rising steps, dangling cables and signs',
  shelter: 'makeshift shelter built inside a gutted hall, campfire corner, rough bunks and stored supplies along the walls',
  gate: 'fortified checkpoint gate, broken barrier arm, sandbag and barbed-wire fence line, concrete compound wall',
  field: 'cracked dry farmland furrows in rows, withered crop stalks, dry clods and broken fence posts',
  house: 'tilted half-collapsed two-story house, interior wall gaps, furniture slid toward the low side',
  well: 'dry stone well and cracked earth banks, frayed rope and old bucket, dusty open ground',
  barn: 'sagging barn interior, exposed wooden tie beams, scattered straw and old farm tools',
  line: 'conveyor production line, idle belts and rollers, overhead pipe racks and cable runs',
  hall: 'tall factory main hall, catwalk galleries hanging in the dark height, steel columns receding into shadow',
  control: 'control room wall of dark monitor screens and consoles, panels and blinking broken indicators',
  furnace: 'furnace pit with greenish standing water, faint hot steam rising, scorched brick lining',
  mountain: 'layered refuse mountain slope, stacked scrap, crumpled metal and flattened cars at different heights',
  crane: 'gantry crane rail span overhead, hanging hook and half container, dusty scrap yard below',
  pit: 'open smoldering waste pit, thin green smoke, refuse slopes dropping into the hollow',
  core: 'deep hollow crater with an antenna mast, dark shaft descending into the earth, sparse signal gear',
  platform: 'subway platform edge, broken platform screen-door frames, rusted tracks beyond the edge',
  tunnel: 'long subway tunnel vanishing into shadow, rusted rails, grime on tiled walls, dim vault',
  flood: 'flooded tunnel section, shallow water covering the tracks, dull reflections on the surface',
  escalator: 'dead escalator steps rusted into a stair flight, sloped concrete shaft, broken handrails',
  signal: 'signal room wall of signal boards, relay panels and bundled cable runs',
  depot: 'train depot with repair trenches in rows, empty siding bays and idle rolling stock frames',
  ward: 'hospital ward with rows of beds, torn hanging curtains, lockers and cabinets along the wall',
  stairwell: 'broken stairwell shaft, concrete flights offset, handrail hanging in mid air',
  surgery: 'operating room with tilted surgical lamp, sterile instrument cabinets, pale cold tile',
  pharmacy: 'pharmacy shelf rows with pulled-out drawers, dusty bottles and medicine boxes',
  morgue: 'cold morgue, rows of stainless freezer drawers, bare concrete, dim chill',
  atrium: 'open atrium collapsed from top to bottom, ring corridor galleries broken in mid air',
  dock: 'cargo dock wooden and concrete pier, mooring bollards, crates and cargo nets on the boards',
  silt: 'muddy tidal flat with sticky silt mounds, half-buried debris, shallow murky water',
  warehouse: 'warehouse racking from floor to ceiling, narrow aisle between stacked crates',
  lighthouse: 'rocky coast with weathered lighthouse, jagged reefs, lonely narrow beam through gray sea mist',
  hull: 'stranded cargo hull tilted in mud, a torn hull breach gap, exposed ribs and plates',
  breakwater: 'breakwater tetrapod blocks piled to waist height, gray sea surf exploding in the gaps',
  deep: 'deepest tunnel section, seeping water in wall cracks, oppressive heat and darkness',
}

// 主题地标专属场景词（叠加在 biome/variant 之后；纯英文，不传入中文房名）
export const THEME_SCENE = {
  data_center: 'rows of dark server racks, cabinet aisles, cable bundles along the floor, faint blue indicator glows',
  robot_factory: 'assembly line with idle robot frames, hydraulic arms and gear assemblies, half-built mechanical bodies on the belt',
  spaceport: 'rocket launch pad scaffold, tilted gantry tower, satellite dishes and empty holding bay, cold night sky',
  solar_center: 'vast array of tilted solar mirror panels stretching to the horizon, rusted support frames, faint sun glare',
  dam: 'massive concrete dam face with locked gate, spillway chute, gray water churning below, valve galleries',
  bridge: 'broken steel truss bridge deck split in two, hanging suspension cables, collapsed roadway segments over dark river',
  highway: 'empty multi-lane highway overpass, rows of wrecked cars along lanes, broken streetlights, cracked asphalt',
  skyscraper: 'staggered collapsed floor slabs of a high-rise, dangling cables and broken window frames, interior open shafts',
  stadium: 'abandoned sports stadium bowl, empty tiered stands, dead floodlight pylons, trampled turf pit',
  battlefield: 'shell-cratered no man\'s land, sandbag lines, coiled barbed wire, discarded military crates and wrecked armor',
  rescue_center: 'rows of shelter beds reaching down the corridor, neat blankets, locked supply cabinets, dim civic hall',
  robot_rally: 'open ground with rows of abandoned robot chassis facing one direction, bare mechanical frames and clamps',
  storm_farm: 'storm-battered farmyard, sheet-metal torn and bent one way, splintered barn frame, dead crops and tire piles',
  acid_basin: 'basin pooling green toxic liquid, steam rising from puddles, corroded stone, dead skeletal trees',
  rot_jungle: 'overgrown ruins swallowed by vines and moss, metal frames wrapped in creeping plants, dense damp greenery',
  church: 'tilted old church facade, broken bell tower, worn pews inside, cracked stone arches',
  ai_origin: 'deep dim vault lined with old cables and server gear, a single primitive machine in the center, oppressive darkness',
  virus_lab: 'broken cultivation tanks along the wall, pale sterile lab tiles, tilted instrument cabinets, shattered glass',
  ai_lab: 'laboratory wall of terminal screens and cable runs, old control consoles, stacked server cabinets',
  alien_center: 'observation pods with non-human specimens, glass tanks and alien flower lamps, cold clinical room',
  military_base: 'fortified base compound, parade ground white lines, guard booth and barbed wire fence, supply crates',
  library: 'tall book-shelf rows with fallen books, reading tables and broken sofas, dusty civic hall',
  school: 'classroom rows of old school desks, a cracked blackboard, stacked shelves, faded hall',
  university: 'grand atrium open from top to bottom, broken ring galleries, desks and glass tanks scattered below',
  paper_mill: 'paper pulp pools and wide paper rollers, conveyor belts, damp factory hall, stacked raw material',
  archaeological_site: 'excavation grid trenches with unearthed relics, exposed skeleton and skulls, stacked rebar and mounds',
  prison: 'cell blocks with iron bars and cages, narrow corridor, rusted barred doors, concrete punishment hall',
  hotel: 'empty hotel lobby with worn reception counter, old sofas and wardrobes, dim carpeted corridor',
  dock: 'old cargo pier with bollards and ropes, stacked crates and cargo nets, idle winch, murky harbor water',
  lighthouse: 'weathered lighthouse on rocky coast, broken lens room, jagged reefs, lonely beam through sea mist',
  shipyard: 'half-welded ship frame on the slips, exposed ribs and plates, crane hook overhead, hull plates stacked',
  drydock: 'sealed dry dock basin with gate, exposed hull ribs, valve pipes and pump machinery, empty muddy bottom',
  substation: 'transformers and insulators with faint blue arcs, cable runs, generator units, fenced electrical yard',
  bunker: 'underground bunker corridor, blast door, stacked military crates and sandbags, generator and consoles',
  coal_mine: 'deep mine pit with rail carts, timber supports, coal heaps, dim tunnel receding into darkness',
  thermal_plant: 'boiler hall with furnaces and turbines, scorched pipes and gauges, rising hot steam, dark industrial height',
  nuclear_plant: 'reactor hall with containment core, transformer and turbine line, console walls, sterile industrial floor',
  radiation_zone: 'rad-contaminated hollow with reactor core remnants, toxic puddles, rusted barrels, sparse dead ground',
  arsenal: 'weapons assembly line, stacked ammo crates and barrels, workbenches, belt-driven machinery',
  punk_mech: 'wall of stacked speakers and amplifiers, exposed pistons and gears, wiring and neon tubes, cluttered machine hall',
  shadow_labyrinth: 'half-lit corridor maze, shadowed walls, caged dividers and terminals, deep purple darkness',
  chaos_castle: 'gothic stone castle interior, stone throne hall, cages and hanging banners, broken arches',
  vampire_lair: 'cold morgue-like lair with coffin drawers, coffins, trailing ivy, dim blood-red dark room',
  gravity_anomaly: 'open plaza with debris hovering, dish and antenna rigs, tangled rebar, unsteady air',
  dense_fog: 'dockside swallowed by thick fog, faint car wreck and streetlight silhouettes, mounds barely visible',
  howling_strait: 'open sea strait breakwater, truss frames and life rings, cargo net, fierce misty surf',
  abyss_swamp: 'dark muddy swamp with bubbling mounds, moss rocks and trailing vines, stagnant toxic water',
  withered_forest: 'grove of dead cracked trees, dry weeds and graves, dry earth, sparse dead branches',
  red_tide: 'shoreline with red-tinted shallow water, silt mounds and hull plates, scattered bones, pale salt crust',
  grey_harbor: 'foggy grey harbor, crane hooks and half containers, faint beacon and streetlight, mist-choked water',
  horror_hotel: 'haunted hotel corridor, worn counter and old beds, wardrobe and sofa, deep shadowed carpet',
}

export function hashSeed(id) {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return ((h ^ (h >>> 15)) >>> 0) % 2147483647
}

function buildPrompt(room) {
  const indoorPrefix = room.indoor ? ', dim interior' : ''
  const base = BIOME_SCENE[room.biome] || BIOME_SCENE.city
  const variant = VARIANT_SCENE[room.variant] || ''
  const parts = [
    `${BG_STYLE}${indoorPrefix}`,
    `Base setting: ${base}.`,
  ]
  if (variant) parts.push(`This room: ${variant}.`)
  if (room.theme && THEME_SCENE[room.theme]) parts.push(`Theme setting: ${THEME_SCENE[room.theme]}.`)
  parts.push('No signage, no plaques, no street signs, no posters, no written characters or symbols anywhere.')
  return parts.join(' ')
}

async function genOne(room, retries = 2) {
  const dst = path.join(RAW_ROOM, `${room.roomId}.jpg`)
  if (fs.existsSync(dst) && fs.statSync(dst).size > 20000) {
    console.log('skip', path.basename(dst))
    return 'skip'
  }
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await generate({ model: MODEL, prompt: buildPrompt(room), size: SIZE_BG, n: 1, seed: hashSeed(room.roomId) })
      const d = res?.data?.[0]
      if (!d) throw new Error('no image: ' + JSON.stringify(res).slice(0, 300))
      if (d.url) await download(d.url, dst)
      else if (d.b64_json) fs.writeFileSync(dst, Buffer.from(d.b64_json, 'base64'))
      if (fs.statSync(dst).size < 20000) throw new Error('file too small')
      console.log('ok', room.roomId, Math.round(fs.statSync(dst).size / 1024), 'KB')
      return 'ok'
    } catch (e) {
      lastErr = e
      console.log(`retry ${attempt + 1} ${room.roomId}: ${e?.message || e}`)
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)))
    }
  }
  console.error('ERR', room.roomId, lastErr?.message || lastErr)
  return 'err'
}

async function pool(rooms, concurrency, worker) {
  let idx = 0
  const results = { ok: 0, skip: 0, err: 0 }
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < rooms.length) {
      const room = rooms[idx++]
      const r = await worker(room)
      results[r] = (results[r] || 0) + 1
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  const scope = process.argv[2] || 'plain'
  const onlyArg = process.argv[3] || ''
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, '.tools', 'room-list.json'), 'utf8'))
  let rooms = all
  if (scope === 'plain') rooms = rooms.filter((r) => !r.theme)
  else if (scope === 'themed') rooms = rooms.filter((r) => r.theme)
  if (onlyArg) {
    const ids = onlyArg.split(',').map((s) => s.trim()).filter(Boolean)
    rooms = rooms.filter((r) => ids.includes(r.roomId))
  }
  console.log(`scope=${scope} rooms=${rooms.length}`)
  const results = await pool(rooms, 3, genOne)
  console.log('DONE', JSON.stringify(results))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('\nERR', e?.message || e)
    process.exit(1)
  })
}
