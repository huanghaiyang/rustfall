// 火山方舟 seedream 素材生成清单：
//   · biome 远景背景（7）
//   · scene 主题背景（32 种 painter，按关卡名字主题出图）
//   · 道具图集 sheet（每张 3×3 排多个物体，后处理切割成独立透明 PNG）
// 原图下载到 .tools/ark-raw；抠幕布 / 去水印 / 切割 / 归一由 .tools/post_ark.py 完成。
// 用法: node scripts/gen-assets.mjs [backdrops|scenes|sheets|all]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate, download } from '../.tools/ark_gen.mjs'

const MODEL = 'doubao-seedream-5-0-pro-260628'
const SIZE_BG = '1664x928'
const SIZE_SHEET = '1024x1024'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, '.tools', 'ark-raw')
const RAW_BG = path.join(RAW, 'backdrops')
const RAW_SCENE = path.join(RAW_BG, 'scenes')
const RAW_SHEET = path.join(RAW, 'props', 'sheets')
for (const d of [RAW_BG, RAW_SCENE, RAW_SHEET]) fs.mkdirSync(d, { recursive: true })

const BG_STYLE =
  'Pixel art 2D side-scroller platformer distant backdrop, wide panoramic, post-apocalyptic wasteland, dark moody overcast dusk, layered parallax silhouettes, empty flat ground strip along the very bottom, no characters, no people, no animals, no text, no letters, no numbers, no watermark, no signature, no logo, no UI, muted rust brown and ash gray palette, hand-crafted game art'

// ---------------- biome 远景（7） ----------------
export const BIOME_BACKDROPS = [
  { id: 'city', prompt: `${BG_STYLE}. Scene: ruined modern city skyline, collapsed concrete high-rises, broken elevated highway bridges, rusted steel towers, distant smog and haze.` },
  { id: 'village', prompt: `${BG_STYLE}. Scene: abandoned rural village, cracked dry farmland rows, withered dead tree stumps, tilted crumbling farm houses, sagging wooden barn, dry well and broken fence, dust and dead yellow grass.` },
  { id: 'factory', prompt: `${BG_STYLE}. Scene: derelict industrial factory yard, rusted pipes and chimneys, idle conveyor belts, steel framework gantry, storage tanks, faint distant furnace orange glow, thin smoke haze.` },
  { id: 'dump', prompt: `${BG_STYLE}. Scene: vast garbage landfill mountain, stacked scrap metal and crushed cars, rusty shipping containers, gantry crane rails, smoldering waste pit with thin green smoke, piles of refuse.` },
  { id: 'metro', prompt: `${BG_STYLE}, dim underground interior. Scene: abandoned subway station and tunnel, concrete platform edge, rusted train tracks, dim arched vault ceiling, shallow flood water reflections, dark cold blue-gray tones, deep tunnel vanishing into shadow.` },
  { id: 'hospital', prompt: `${BG_STYLE}, dim interior. Scene: collapsed old hospital corridor and ward, broken windows, tilted beds and lockers, cracked concrete walls, cold moldy green-gray palette, dusty dim hall, hanging loose cables.` },
  { id: 'port', prompt: `${BG_STYLE}. Scene: silted-up abandoned seaport, muddy dock yard, idle gantry cranes, stacked rusty shipping containers, half-buried wrecked cargo ship, muddy tidal flats, gray overcast foggy sea.` },
]

// ---------------- scene 主题背景（painter → 场景描述） ----------------
// indoor=true 的画建筑内部视角。
const SC = (id, prompt, indoor = false) => ({ id, prompt, indoor })
export const SCENE_BACKDROPS = [
  SC('highway', `${BG_STYLE}. Scene: broken elevated highway and interchange ramps, collapsed overpass pillars, rusted road deck, distant city ruins in haze.`),
  SC('stadium', `${BG_STYLE}. Scene: abandoned stadium grandstand and roof truss, cracked concrete bowl, scattered floodlight pylons, dusty field.`),
  SC('skyscraper', `${BG_STYLE}. Scene: dense ruined skyscraper skyline, shattered office towers, dangling signs, smoky dusk sky.`),
  SC('military_base', `${BG_STYLE}. Scene: fortified checkpoint, barbed wire fence, sandbag barricades, guard tower, concrete compound walls.`),
  SC('bunker', `${BG_STYLE}. Scene: heavy concrete bunker and blast walls, armored door, thick pillars, dim underground concrete yard.`),
  SC('robot_factory', `${BG_STYLE}. Scene: mechanical assembly plant interior yard, steel gantry frames, idle robotic arms, conveyor lines, oil-stained floor.`),
  SC('storm_farm', `${BG_STYLE}. Scene: abandoned farmland, dry furrows, sagging barn and silo, dead trees, broken windmill, dust and withered grass.`),
  SC('withered_forest', `${BG_STYLE}. Scene: barren dead forest, twisted bare tree silhouettes, dry underbrush, pale fog between trunks.`),
  SC('dam', `${BG_STYLE}. Scene: cracked concrete dam wall and spillway, stagnant green-brown water, broken sluice gates, muddy banks.`),
  SC('bridge', `${BG_STYLE}. Scene: rusted steel truss bridge spanning murky water, broken deck sections, hanging cables, foggy river.`),
  SC('coal_mine', `${BG_STYLE}. Scene: coal mine headframe, inclined conveyor, coal slag piles, rusted mine carts, black dust haze.`),
  SC('thermal_plant', `${BG_STYLE}. Scene: thermal power plant, cooling towers and chimneys, dense pipe racks, faint furnace glow, smoke haze.`),
  SC('acid_basin', `${BG_STYLE}. Scene: toxic waste basin, stagnant greenish puddles, cracked mud banks, rusted barrels, thin acrid vapor.`),
  SC('dense_fog', `${BG_STYLE}. Scene: heavy fog swallowing ruined city blocks, faint building silhouettes barely visible through mist, wet ground.`),
  SC('abyss_swamp', `${BG_STYLE}. Scene: dark flooded swamp, rotting dead trees half in water, murky pools, oppressive dim green-gray haze.`),
  SC('substation', `${BG_STYLE}. Scene: electrical substation, steel lattice pylons, transformers and insulators, tangled cable runs, gray overcast.`),
  SC('drydock', `${BG_STYLE}. Scene: dry dock slipway, empty ship cradle, steel keel blocks, gantry rails, muddy concrete basin.`),
  SC('red_tide', `${BG_STYLE}. Scene: polluted riverbank stained rust-red, broken embankment walls, rusty debris in shallow reddish water, foul haze.`),
  SC('nuclear_plant', `${BG_STYLE}. Scene: nuclear power station silhouette, reactor containment dome and cooling towers, warning haze, desolate ground.`),
  SC('radiation_zone', `${BG_STYLE}. Scene: irradiated wasteland, rusted storage tanks, dead yellowed grass, cracked earth, sickly green-gray sky.`),
  SC('dock', `${BG_STYLE}. Scene: old cargo dock, wooden and concrete pier, mooring bollards, stacked crates and nets, gray water.`),
  SC('grey_harbor', `${BG_STYLE}. Scene: silted gray harbor, muddy tidal flats, half-buried wrecked boats, distant cranes in thick fog.`),
  SC('shipyard', `${BG_STYLE}. Scene: shipyard, half-built steel hull frames, scaffolding, gantry crane, stacked hull plates, oily ground.`),
  SC('lighthouse', `${BG_STYLE}. Scene: rocky coast with a weathered lighthouse, jagged reefs, crashing gray sea mist, lonely beam.`),
  SC('school', `${BG_STYLE}, dim interior. Scene: abandoned school classroom corridor, broken windows, scattered desks and chairs, cracked blackboard, dusty tile floor.`, true),
  SC('rescue_center', `${BG_STYLE}, dim interior. Scene: collapsed first-aid station, overturned stretchers and beds, torn green curtains, medicine lockers, cracked walls.`, true),
  SC('church', `${BG_STYLE}, dim interior. Scene: ruined old church interior, arched vault, broken pews, shattered stained glass, dusty stone floor.`, true),
  SC('library', `${BG_STYLE}, dim interior. Scene: derelict library, collapsed bookshelves, piles of rotting books, broken reading tables, dust.`, true),
  SC('prison', `${BG_STYLE}, dim interior. Scene: bleak prison corridor, iron bars and cell doors, bare concrete walls, cold dim light.`, true),
  SC('shadow_labyrinth', `${BG_STYLE}, dim interior. Scene: dark maze-like underground arcade, repeated stone arches and passageways, shallow water, cold blue-gray shadow.`, true),
  SC('virus_lab', `${BG_STYLE}, dim interior. Scene: abandoned laboratory, glass specimen tanks, work benches, hanging pipes and cables, pale green dim light.`, true),
  SC('vampire_lair', `${BG_STYLE}, dim interior. Scene: cold stone crypt, pillars and burial niches, old stone sarcophagus, damp dark walls, faint cold mist.`, true),
]

// ---------------- 道具图集（3×3，后处理按格切割） ----------------
const PROP_TAIL =
  'plain solid green background #00FF00, no ground shadow on background, no text, no watermark, no logo, no signature'

function sheet(id, items) {
  const cols = 3, rows = 3
  const listed = items.map((it, i) => `${i + 1}) ${it.subject}`).join('; ')
  const prompt =
    `Pixel art sprite sheet, ${cols}x${rows} grid of ${items.length} separate post-apocalyptic scrap game props, one object centered in each equal cell with clear gaps between cells, evenly arranged, ${PROP_TAIL}. ` +
    `Weathered rusty metal, worn plastic and wood, clean readable silhouettes, side or front view. Objects in row-major order: ${listed}.`
  return { id, cols, rows, items, prompt }
}

export const SHEETS = [
  sheet('sheet_appliance', [
    { kind: 'fridge', w: 40, h: 64, subject: 'dented abandoned refrigerator with hanging door' },
    { kind: 'washing_machine', w: 40, h: 52, subject: 'old rusted front-loading washing machine' },
    { kind: 'microwave', w: 38, h: 28, subject: 'broken microwave oven with open door' },
    { kind: 'ac_unit', w: 52, h: 34, subject: 'wall-mounted air conditioner outdoor unit with fan grill' },
    { kind: 'standing_fan', w: 28, h: 64, subject: 'tall rusted standing electric fan' },
    { kind: 'radio', w: 34, h: 22, subject: 'old tube radio with dial and antenna' },
    { kind: 'vacuum', w: 30, h: 34, subject: 'dusty canister vacuum cleaner with hose' },
    { kind: 'desk_lamp', w: 26, h: 30, subject: 'bent-arm work desk lamp' },
    { kind: 'electric_heater', w: 30, h: 40, subject: 'old rusted electric space heater' },
  ]),
  sheet('sheet_vehicle', [
    { kind: 'pickup_wreck', w: 130, h: 54, subject: 'rusty abandoned pickup truck, crushed cab' },
    { kind: 'van_wreck', w: 120, h: 50, subject: 'rotting boxy delivery van wreck' },
    { kind: 'motorbike', w: 80, h: 44, subject: 'rusted broken motorcycle on kickstand' },
    { kind: 'tricycle', w: 90, h: 46, subject: 'three-wheeled cargo tricycle with wooden bed' },
    { kind: 'dumpster', w: 90, h: 50, subject: 'large rusted dumpster overflowing with scrap' },
    { kind: 'sedan_wreck', w: 110, h: 48, subject: 'second crushed sedan, missing wheels' },
    { kind: 'route_bus', w: 150, h: 56, subject: 'old battered minibus with broken windows' },
    { kind: 'trailer', w: 120, h: 44, subject: 'rusted flat cargo trailer on wheels' },
    { kind: 'forklift', w: 90, h: 56, subject: 'abandoned yellow forklift with fork arms' },
  ]),
  sheet('sheet_lamp', [
    { kind: 'floodlight', w: 30, h: 70, subject: 'tall pole floodlight with broken lamp head' },
    { kind: 'hanging_lamp', w: 24, h: 40, subject: 'pendulum hanging industrial lamp with chain' },
    { kind: 'signal_lamp', w: 26, h: 50, subject: 'railway signal light with colored lenses' },
    { kind: 'neon_sign', w: 44, h: 58, subject: 'flickering rectangular neon sign panel on bracket' },
    { kind: 'oil_lamp', w: 20, h: 30, subject: 'old glass kerosene lamp' },
    { kind: 'wall_light', w: 22, h: 26, subject: 'rusted wall sconce light' },
    { kind: 'searchlight', w: 40, h: 80, subject: 'rotating searchlight on tripod stand' },
    { kind: 'string_light', w: 60, h: 24, subject: 'dangling string of small bare bulbs' },
    { kind: 'warning_beacon', w: 24, h: 34, subject: 'small warning beacon lamp with dome' },
  ]),
  sheet('sheet_structure', [
    { kind: 'door_frame', w: 56, h: 96, subject: 'broken wooden door frame with half door' },
    { kind: 'brick_wall', w: 80, h: 60, subject: 'section of cracked crumbling brick wall' },
    { kind: 'staircase', w: 70, h: 60, subject: 'broken concrete stair flight with railing' },
    { kind: 'arch_window', w: 50, h: 80, subject: 'tall arched broken window with stone frame' },
    { kind: 'scaffold', w: 70, h: 100, subject: 'rusted tubular scaffold frame section' },
    { kind: 'trash_bin', w: 34, h: 44, subject: 'dented metal trash bin with lid ajar' },
    { kind: 'mailbox', w: 26, h: 36, subject: 'old wall-mounted metal mailbox' },
    { kind: 'billboard_frame', w: 90, h: 70, subject: 'empty rusted billboard steel frame on poles' },
    { kind: 'broken_pillar', w: 34, h: 90, subject: 'tilted broken concrete pillar capital' },
  ]),
  sheet('sheet_furniture', [
    { kind: 'armchair', w: 36, h: 40, subject: 'tattered old armchair with torn cushion' },
    { kind: 'wooden_table', w: 60, h: 36, subject: 'wobbly old wooden table, one leg missing' },
    { kind: 'broken_chair', w: 28, h: 34, subject: 'splintered broken wooden chair' },
    { kind: 'iron_bed', w: 70, h: 36, subject: 'rusted old iron-frame bed with torn mattress' },
    { kind: 'drawer_cabinet', w: 34, h: 50, subject: 'old multi-drawer wooden cabinet' },
    { kind: 'sideboard', w: 56, h: 44, subject: 'low worn wooden sideboard cupboard' },
    { kind: 'cracked_mirror', w: 30, h: 48, subject: 'tall cracked mirror in dented frame' },
    { kind: 'toilet', w: 30, h: 38, subject: 'grimy old broken ceramic toilet' },
    { kind: 'wash_basin', w: 40, h: 30, subject: 'old wall ceramic wash basin with rusted tap' },
  ]),
  sheet('sheet_industrial', [
    { kind: 'oil_tank', w: 50, h: 80, subject: 'vertical rusted storage oil tank on legs' },
    { kind: 'engine_block', w: 56, h: 40, subject: 'abandoned bare car engine block' },
    { kind: 'water_pump', w: 44, h: 44, subject: 'old water pump unit with motor and pipe' },
    { kind: 'gas_cylinder', w: 26, h: 56, subject: 'rusted standing gas cylinder tank' },
    { kind: 'radiator', w: 34, h: 44, subject: 'old cast-iron radiator heating panel' },
    { kind: 'air_duct', w: 56, h: 40, subject: 'section of rusted square ventilation duct' },
    { kind: 'battery_bank', w: 40, h: 34, subject: 'row of old industrial battery cells' },
    { kind: 'drill_press', w: 40, h: 50, subject: 'old bench drill press machine' },
    { kind: 'old_lathe', w: 70, h: 44, subject: 'abandoned metal lathe machine' },
  ]),
  sheet('sheet_outdoor', [
    { kind: 'traffic_cone', w: 20, h: 30, subject: 'crushed faded plastic traffic cone' },
    { kind: 'road_block', w: 50, h: 36, subject: 'concrete road barrier curb block' },
    { kind: 'shopping_cart', w: 34, h: 40, subject: 'rusted abandoned shopping cart' },
    { kind: 'wreck_bicycle', w: 40, h: 34, subject: 'rusted broken bicycle leaning' },
    { kind: 'boulder', w: 40, h: 30, subject: 'weathered cracked grey boulder rock' },
    { kind: 'dead_bush', w: 36, h: 30, subject: 'withered dead bare bush shrub' },
    { kind: 'plank_pile', w: 50, h: 26, subject: 'stack of broken weathered wooden planks' },
    { kind: 'phone_booth', w: 34, h: 60, subject: 'dilapidated old telephone booth' },
    { kind: 'sign_post', w: 26, h: 46, subject: 'tilted wooden roadside signpost' },
  ]),
  sheet('sheet_container', [
    { kind: 'cardboard_box', w: 36, h: 28, subject: 'flattened taped cardboard box' },
    { kind: 'suitcase', w: 34, h: 26, subject: 'old worn leather suitcase' },
    { kind: 'backpack', w: 30, h: 30, subject: 'discarded torn canvas backpack' },
    { kind: 'bucket', w: 24, h: 30, subject: 'dented galvanized iron bucket' },
    { kind: 'wicker_basket', w: 30, h: 24, subject: 'broken wicker basket' },
    { kind: 'medicine_box', w: 30, h: 34, subject: 'wall-mounted old medicine cabinet' },
    { kind: 'first_aid_case', w: 32, h: 24, subject: 'battered first aid metal case' },
    { kind: 'gas_can', w: 26, h: 34, subject: 'rusted red fuel jerry can' },
    { kind: 'bottle_jars', w: 34, h: 22, subject: 'messy pile of old glass bottles and jars' },
  ]),
  sheet('sheet_medical', [
    { kind: 'iv_drip', w: 26, h: 64, subject: 'IV drip stand with hanging fluid bag and pole' },
    { kind: 'medicine_cart', w: 44, h: 44, subject: 'old stainless medicine trolley cart with shelves' },
    { kind: 'wheelchair', w: 40, h: 40, subject: 'broken old wheelchair with bent wheel' },
    { kind: 'microscope', w: 30, h: 28, subject: 'dusty old laboratory microscope' },
    { kind: 'filing_cabinet', w: 36, h: 56, subject: 'tall old metal filing cabinet with drawers' },
    { kind: 'sterilizer', w: 36, h: 44, subject: 'old pressure steam sterilizer autoclave pot' },
    { kind: 'xray_viewer', w: 40, h: 30, subject: 'broken X-ray film viewer light box' },
    { kind: 'surgical_light', w: 44, h: 34, subject: 'overhead surgical shadowless lamp with arms' },
    { kind: 'petri_stack', w: 34, h: 26, subject: 'stack of specimen bottles and petri dishes' },
  ]),
  sheet('sheet_farm', [
    { kind: 'plow', w: 50, h: 26, subject: 'rusted old iron plow blade' },
    { kind: 'hay_bale', w: 40, h: 28, subject: 'dry hay bale with loose straw' },
    { kind: 'water_barrel', w: 30, h: 40, subject: 'old wooden water barrel with iron hoops' },
    { kind: 'chicken_coop', w: 60, h: 40, subject: 'small dilapidated wooden chicken coop' },
    { kind: 'windmill', w: 34, h: 90, subject: 'broken old farm windmill tower' },
    { kind: 'sack_stack', w: 36, h: 30, subject: 'stack of old grain sacks' },
    { kind: 'wooden_cart', w: 60, h: 34, subject: 'two-wheeled wooden hand cart' },
    { kind: 'scarecrow', w: 34, h: 60, subject: 'ragged scarecrow on wooden pole' },
    { kind: 'crop_dryer', w: 46, h: 30, subject: 'wooden rack frame for drying crops' },
  ]),
  sheet('sheet_port', [
    { kind: 'bollard', w: 26, h: 30, subject: 'rusted mooring bollard on pier' },
    { kind: 'anchor', w: 40, h: 36, subject: 'old rusted ship anchor' },
    { kind: 'ship_propeller', w: 40, h: 36, subject: 'abandoned bronze ship propeller' },
    { kind: 'pallet', w: 44, h: 16, subject: 'wooden shipping pallet' },
    { kind: 'hand_cart', w: 50, h: 30, subject: 'two-wheel platform hand trolley' },
    { kind: 'rail_buffer', w: 40, h: 26, subject: 'rusted railway buffer stop' },
    { kind: 'signal_box', w: 28, h: 36, subject: 'old railway signal control box' },
    { kind: 'coil_rigging', w: 34, h: 30, subject: 'coiled rope and cable rigging' },
    { kind: 'mooring_chain', w: 40, h: 24, subject: 'piled heavy rusted anchor chain' },
  ]),
  sheet('sheet_nature', [
    { kind: 'pine_dead', w: 34, h: 80, subject: 'tall dead bare pine tree' },
    { kind: 'stump', w: 30, h: 28, subject: 'weathered tree stump with roots' },
    { kind: 'reed_cluster', w: 28, h: 44, subject: 'cluster of dry reeds and cattails' },
    { kind: 'mushroom_cluster', w: 26, h: 24, subject: 'cluster of small red-capped mushrooms' },
    { kind: 'tangled_root', w: 40, h: 24, subject: 'tangled exposed tree roots' },
    { kind: 'grass_tuft', w: 36, h: 20, subject: 'tuft of dry dead grass' },
    { kind: 'fern', w: 30, h: 26, subject: 'wilted dry fern plant' },
    { kind: 'dry_cactus', w: 24, h: 40, subject: 'withered dry cactus' },
    { kind: 'fallen_log', w: 60, h: 20, subject: 'fallen rotting log on ground' },
  ]),
]

// ---------------- 生成 ----------------
async function downloadImage(it, dst) {
  if (fs.existsSync(dst) && fs.statSync(dst).size > 20000) return console.log('skip', path.basename(dst))
  const res = await generate({ model: MODEL, prompt: it.prompt, size: it.size || SIZE_BG, n: 1 })
  const d = res?.data?.[0]
  if (!d) throw new Error('no image: ' + JSON.stringify(res).slice(0, 300))
  if (d.url) await download(d.url, dst)
  else if (d.b64_json) fs.writeFileSync(dst, Buffer.from(d.b64_json, 'base64'))
  console.log('ok', path.basename(dst), Math.round(fs.statSync(dst).size / 1024), 'KB')
}

async function runBiomes() {
  for (const b of BIOME_BACKDROPS) await downloadImage(b, path.join(RAW_BG, `${b.id}.jpg`))
}
async function runScenes() {
  for (const s of SCENE_BACKDROPS) await downloadImage(s, path.join(RAW_SCENE, `${s.id}.jpg`))
}
async function runSheets() {
  for (const sh of SHEETS) {
    await downloadImage({ ...sh, size: SIZE_SHEET }, path.join(RAW_SHEET, `${sh.id}.jpg`))
  }
}

const target = process.argv[2] || 'all'
try {
  if (target === 'backdrops') await runBiomes()
  else if (target === 'scenes') await runScenes()
  else if (target === 'sheets') await runSheets()
  else if (target === 'all') {
    await runBiomes()
    await runScenes()
    await runSheets()
  } else throw new Error('unknown target ' + target)
  console.log('DONE')
} catch (e) {
  console.error('\nERR', e?.message || e)
  process.exit(1)
}
