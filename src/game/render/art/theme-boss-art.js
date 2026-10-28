// 锈雨 · RUSTFALL —— 51 只主题 BOSS 的独占立绘注册表
// ----------------------------------------------------------------------------
// 每只 BOSS 一个独有的体型 + 冠饰 + 武器 + 调色 + 随机种子，不复用任何其他立绘。
// 由 large-monsters.js 在构建帧时按 id 取用；外部只需 getThemeBossArtDef(id)。

import { bossPalette, bossRng } from './theme-boss-parts.js'
import { planMechTitan, planBruteHuman, planBeastQuad, planTankTread } from './theme-boss-plans-a.js'
import { planCoreOrb, planDroneRing, planCrystalHusk, planGravenStatue } from './theme-boss-plans-b.js'
import {
  planWraithCloak,
  planBlobMass,
  planInsectCarapace,
  planPlantBulb,
  planWingedDemon,
} from './theme-boss-plans-c.js'
import { planWalkerTurret } from './theme-boss-plans-d.js'
import { UNIQUE_BOSS_PLANS } from './theme-boss-unique.js'

const PLANS = {
  mech_titan: planMechTitan,
  brute_human: planBruteHuman,
  beast_quad: planBeastQuad,
  tank_tread: planTankTread,
  core_orb: planCoreOrb,
  drone_ring: planDroneRing,
  crystal_husk: planCrystalHusk,
  graven_statue: planGravenStatue,
  wraith_cloak: planWraithCloak,
  blob_mass: planBlobMass,
  insect_carapace: planInsectCarapace,
  plant_bulb: planPlantBulb,
  winged_demon: planWingedDemon,
  walker_turret: planWalkerTurret,
}

/** id / family / w / h / accent / 体型 / 冠饰 / 武器 */
const ROWS = [
  ['tb_data_archon', 'machine', 136, 168, 0x8fc4ff, 'core_orb', 2, 0],
  ['tb_assembly_overseer', 'machine', 150, 180, 0xff8a3c, 'mech_titan', 3, 3],
  ['tb_orbit_judge', 'machine', 132, 160, 0xa8c4d8, 'drone_ring', 2, 2],
  ['tb_helios', 'machine', 140, 172, 0xffc24a, 'crystal_husk', 4, 1],
  ['tb_flood_colossus', 'mutant', 168, 196, 0x6a9aa8, 'blob_mass', 0, 0],
  ['tb_bridge_raider', 'human', 146, 176, 0xc07038, 'brute_human', 0, 3],
  ['tb_highway_king', 'human', 142, 174, 0xff5644, 'tank_tread', 2, 2],
  ['tb_skyline_baron', 'human', 138, 170, 0xd8c070, 'brute_human', 1, 4],
  ['tb_arena_champion', 'mutant', 154, 182, 0xff7a4a, 'brute_human', 0, 0],
  ['tb_scrap_warlord', 'human', 148, 178, 0xa8763a, 'mech_titan', 1, 2],
  ['tb_caregiver', 'machine', 140, 172, 0xd8e08a, 'drone_ring', 1, 1],
  ['tb_rally_boss', 'machine', 160, 188, 0x8fc4ff, 'mech_titan', 2, 2],
  ['tb_storm_reaper', 'mutant', 152, 180, 0x9ab84a, 'winged_demon', 3, 1],
  ['tb_acid_mother', 'mutant', 172, 198, 0xc6e05a, 'blob_mass', 4, 0],
  ['tb_rot_queen', 'mutant', 156, 186, 0x6b8a3a, 'plant_bulb', 1, 0],
  ['tb_bell_bishop', 'human', 144, 176, 0xf2b34a, 'wraith_cloak', 4, 4],
  ['tb_prime_core', 'machine', 164, 190, 0x6ff0d0, 'core_orb', 4, 0],
  ['tb_zero_strain', 'mutant', 158, 184, 0x9ab84a, 'insect_carapace', 2, 1],
  ['tb_proto_mind', 'machine', 142, 174, 0x8fe8ff, 'core_orb', 3, 0],
  ['tb_observer', 'alien', 150, 182, 0x8fc4ff, 'drone_ring', 4, 0],
  ['tb_iron_colonel', 'human', 160, 186, 0xc8553f, 'walker_turret', 3, 2],
  ['tb_librarian', 'machine', 138, 172, 0xd8c070, 'wraith_cloak', 2, 4],
  ['tb_schoolmaster', 'human', 142, 174, 0xe0b060, 'brute_human', 3, 3],
  ['tb_professor', 'machine', 144, 176, 0xdcd8e8, 'walker_turret', 2, 4],
  ['tb_paper_press', 'machine', 158, 182, 0xc8b080, 'tank_tread', 1, 3],
  ['tb_curator', 'human', 146, 176, 0xc8a060, 'wraith_cloak', 1, 4],
  ['tb_warden', 'human', 150, 178, 0x9aa0a8, 'brute_human', 3, 4],
  ['tb_hotel_clerk', 'machine', 138, 172, 0xc8a8d8, 'wraith_cloak', 1, 4],
  ['tb_dockmaster', 'human', 150, 180, 0x8fb8c8, 'brute_human', 2, 3],
  ['tb_lighthouse_keeper', 'machine', 140, 174, 0xffe08a, 'core_orb', 2, 0],
  ['tb_shipwright', 'machine', 156, 184, 0xc8a060, 'mech_titan', 4, 3],
  ['tb_drydock_rig', 'machine', 172, 198, 0x8fb0b8, 'mech_titan', 3, 2],
  ['tb_substation', 'machine', 142, 176, 0x88e0ff, 'crystal_husk', 2, 1],
  ['tb_bunker_commander', 'human', 152, 182, 0x8fa8b8, 'tank_tread', 3, 2],
  ['tb_mine_foreman', 'mutant', 152, 180, 0x9a8a70, 'brute_human', 4, 3],
  ['tb_boiler_king', 'machine', 166, 192, 0xff9a5a, 'mech_titan', 1, 2],
  ['tb_reactor_priest', 'machine', 160, 188, 0x9af0c0, 'crystal_husk', 4, 4],
  ['tb_rad_colossus', 'mutant', 170, 196, 0xb8f060, 'blob_mass', 2, 0],
  ['tb_arsenal_sergeant', 'human', 148, 178, 0xe8a040, 'walker_turret', 0, 2],
  ['tb_punk_amp', 'machine', 150, 180, 0xff5ab0, 'mech_titan', 4, 1],
  ['tb_shadow_walker', 'machine', 144, 176, 0x7a6aff, 'wraith_cloak', 3, 1],
  ['tb_castle_tyrant', 'machine', 158, 186, 0xd04a6a, 'graven_statue', 1, 4],
  ['tb_vampire_count', 'mutant', 148, 180, 0xc02244, 'winged_demon', 1, 1],
  ['tb_gravity_eye', 'alien', 148, 178, 0x9ad8ff, 'core_orb', 0, 0],
  ['tb_fog_wraith', 'mutant', 146, 178, 0xc8d8e0, 'wraith_cloak', 4, 0],
  ['tb_strait_howler', 'mutant', 154, 182, 0x88b8d8, 'beast_quad', 0, 0],
  ['tb_swamp_maw', 'mutant', 168, 192, 0x7a9a60, 'plant_bulb', 0, 0],
  ['tb_forest_hollow', 'mutant', 150, 180, 0xa89070, 'plant_bulb', 4, 0],
  ['tb_red_tide', 'mutant', 162, 188, 0xe05040, 'blob_mass', 0, 0],
  ['tb_grey_harbor', 'machine', 164, 190, 0xa8b0b8, 'walker_turret', 0, 2],
  ['tb_hotel_nightmare', 'mutant', 152, 182, 0xb04060, 'wraith_cloak', 1, 1],
]

function hashSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) || 1
}

/** id -> 大型美术定义（w/h/seed/draw/warm/outline），供 large-monsters.js 复用统一管线。 */
export const THEME_BOSS_LARGE_DEFS = {}
export const THEME_BOSS_ART_IDS = []

for (const [id, family, w, h, accent, plan, crest, weapon] of ROWS) {
  const cfg = { id, family, w, h, accent, crest, weapon, seed: hashSeed(id) }
  const pal = bossPalette(cfg)
  cfg.rng = bossRng(cfg.seed)
  const def = {
    w,
    h,
    seed: cfg.seed,
    warm: pal.warm,
    outline: pal.outline,
    draw(s, P) {
      // 51 只 BOSS 各自独占体型（form + 头 + 背饰 + 标志物），彻底避免换皮换色。
      const unique = UNIQUE_BOSS_PLANS[id]
      if (unique) {
        unique(s, P, def, cfg, pal)
        return
      }
      const fn = PLANS[plan]
      if (fn) fn(s, P, def, cfg, pal)
    },
  }
  THEME_BOSS_LARGE_DEFS[id] = def
  THEME_BOSS_ART_IDS.push(id)
}

export function getThemeBossArtDef(id) {
  return THEME_BOSS_LARGE_DEFS[String(id || '')] || null
}
