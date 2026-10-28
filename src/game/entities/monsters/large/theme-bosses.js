// 主题站点 BOSS：21 个站点各一只，共用一台「招式机」但配置不同。
//
// 设计目的：避免 21 份重复代码，同时保证每只 BOSS 至少 4 种招式、两阶段，
// 且招式组合按站点语义区分（数据枢纽偏光束/召唤，军事基地偏冲锋/导弹，
// 酸雨盆地偏范围爆发……）。美术复用 large/ 里已有的 7 具巨物轮廓，
// 用站点色的落地光环与不同的招式颜色做区分。
import * as THREE from 'three'
import { BaseMonster } from '../base.js'
import { Content, KIND } from '../../../core/registry.js'
import {
  initLarge,
  applyLargeArt,
  playIntro,
  updateActivation,
  roamStep,
  aoe,
  puff,
  spark,
  sfx,
  shake,
  createTell,
  placeTell,
  showTell,
  disposeTell,
  largeDeathFx,
  roomBounds,
} from './common.js'
import { BOSS_KIT_FACTORIES } from './theme-boss-kits.js'
import { updateFx, clearFx } from './theme-boss-fx.js'

/** 各站点 BOSS 的配置表。moves 即该 BOSS 独占的四招，按出招优先级排列。 */
export const THEME_BOSS_DEFS = [
  {
    id: 'tb_data_archon',
    theme: 'data_center',
    name: '数据执政官 ARCHON-9',
    en: 'DATA ARCHON',
    family: 'machine',
    hp: 820,
    speed: 58,
    damage: 26,
    size: [136, 168],
    artId: 'cyberpsycho_boss',
    accent: 0x8fc4ff,
    moves: ['da_delete_beam', 'da_packet_fan', 'da_node_sentry', 'da_buffer_overflow'],
    summonIds: ['server_wraith', 'sentry'],
    desc: '失落数据中心的最后一道权限。它把入侵者当成待清理的脏数据，先标记，再删除。',
  },
  {
    id: 'tb_assembly_overseer',
    theme: 'robot_factory',
    name: '装配线监工·铁颚',
    en: 'ASSEMBLY OVERSEER',
    family: 'machine',
    hp: 900,
    speed: 62,
    damage: 30,
    size: [150, 180],
    artId: 'claw_tyrant',
    accent: 0xff8a3c,
    moves: ['ao_beat_slam', 'ao_piston_punch', 'ao_bolt_volley', 'ao_shift_call'],
    summonIds: ['weld_brute', 'scrapper'],
    desc: '流水线的节拍器还没停。它按拍子砸人，砸完就喊下一批工人上来。',
  },
  {
    id: 'tb_orbit_judge',
    theme: 'spaceport',
    name: '轨道裁决者',
    en: 'ORBIT JUDGE',
    family: 'machine',
    hp: 760,
    speed: 70,
    damage: 28,
    size: [132, 160],
    artId: 'sky_warden',
    accent: 0xa8c4d8,
    moves: ['oj_orbital_drop', 'oj_docking_tether', 'oj_debris_spread', 'oj_launch_queue'],
    summonIds: ['drone', 'sentry'],
    desc: '发射架上的导航AI。它记着每次被放弃的发射，于是把坠落物一件件还回来。',
  },
  {
    id: 'tb_helios',
    theme: 'solar_center',
    name: '聚光塔灵',
    en: 'HELIOS CORE',
    family: 'machine',
    hp: 780,
    speed: 54,
    damage: 27,
    size: [140, 172],
    artId: 'swarm_core',
    accent: 0xffc24a,
    moves: ['hc_mirror_focus', 'hc_solar_flare', 'hc_photon_lance', 'hc_lens_servants'],
    summonIds: ['drone', 'cyber_mantis'],
    desc: '镜阵把阳光聚成一根针。它站在针尖上，用你的影子瞄准。',
  },
  {
    id: 'tb_flood_colossus',
    theme: 'dam',
    name: '溃坝巨像',
    en: 'FLOOD COLOSSUS',
    family: 'mutant',
    hp: 980,
    speed: 42,
    damage: 34,
    size: [168, 196],
    artId: 'junk_golem',
    accent: 0x6a9aa8,
    moves: ['fc_flood_surge', 'fc_mud_slam', 'fc_boulder_toss', 'fc_spill_vortex'],
    summonIds: ['ghoul_husk', 'crawler'],
    desc: '闸门塌的那天它正好卡在泄洪口。现在它一跺脚，整条河谷都会回响。',
  },
  {
    id: 'tb_bridge_raider',
    theme: 'bridge',
    name: '断桥劫掠者',
    en: 'BRIDGE RAIDER',
    family: 'human',
    hp: 840,
    speed: 78,
    damage: 31,
    size: [146, 176],
    artId: 'claw_tyrant',
    accent: 0xc07038,
    moves: ['br_toll_hook', 'br_plank_sweep', 'br_gap_drop', 'br_raider_camp'],
    summonIds: ['psycho_punk', 'cult_fanatic'],
    desc: '桥面断在半空，他们就住在断口上。过桥要交过路费，不交就把你推下去。',
  },
  {
    id: 'tb_highway_king',
    theme: 'highway',
    name: '公路暴走王',
    en: 'HIGHWAY KING',
    family: 'human',
    hp: 800,
    speed: 88,
    damage: 29,
    size: [142, 174],
    artId: 'cyberpsycho_boss',
    accent: 0xff5644,
    moves: ['hk_road_rush', 'hk_exhaust_jet', 'hk_cone_barrage', 'hk_pit_crew'],
    summonIds: ['psycho_punk', 'tunnel_hound'],
    desc: '他把一整条高速当成自己的赛道。谁的车比他快，他就先打谁。',
  },
  {
    id: 'tb_skyline_baron',
    theme: 'skyscraper',
    name: '顶层男爵',
    en: 'SKYLINE BARON',
    family: 'human',
    hp: 790,
    speed: 66,
    damage: 28,
    size: [138, 170],
    artId: 'sky_warden',
    accent: 0xd8c070,
    moves: ['sb_chandelier', 'sb_beam_drop', 'sb_carpet_charge', 'sb_roof_guard'],
    summonIds: ['drone', 'psycho_punk'],
    desc: '楼塌到他那一层就停了。他把顶楼当领地，用吊灯和钢梁布防。',
  },
  {
    id: 'tb_arena_champion',
    theme: 'stadium',
    name: '角斗场卫冕者',
    en: 'ARENA CHAMPION',
    family: 'mutant',
    hp: 920,
    speed: 74,
    damage: 33,
    size: [154, 182],
    artId: 'claw_tyrant',
    accent: 0xff7a4a,
    moves: ['ac_bell_round', 'ac_rope_rebound', 'ac_crowd_roar', 'ac_contender'],
    summonIds: ['radboar', 'hulkbot'],
    desc: '观众席空了很多年，它还在等下一场。铃一响，它就从球员通道里冲出来。',
  },
  {
    id: 'tb_scrap_warlord',
    theme: 'battlefield',
    name: '战地拾荒王',
    en: 'SCRAP WARLORD',
    family: 'human',
    hp: 860,
    speed: 60,
    damage: 30,
    size: [148, 178],
    artId: 'mimic_beast',
    accent: 0xa8763a,
    moves: ['sw_salvage_turrets', 'sw_scrap_shotgun', 'sw_magnet_yank', 'sw_salvage_call'],
    summonIds: ['cult_fanatic', 'scrapper'],
    desc: '他收尸、收枪、收炮弹，最后把自己也收进了一台拆来的机甲里。',
  },
  {
    id: 'tb_caregiver',
    theme: 'rescue_center',
    name: '失控护理机·慈母',
    en: 'BROKEN CAREGIVER',
    family: 'machine',
    hp: 830,
    speed: 56,
    damage: 27,
    size: [140, 172],
    artId: 'esper_berserk',
    accent: 0xd8e08a,
    moves: ['cg_forced_care', 'cg_syringe_volley', 'cg_wheelchair_ram', 'cg_ward_call'],
    summonIds: ['server_wraith', 'ghoul_husk'],
    desc: '它还在执行「保护伤员」的指令，只是把所有人都判定成了伤员，也包括你。',
  },
  {
    id: 'tb_rally_boss',
    theme: 'robot_rally',
    name: '集结号',
    en: 'RALLY HORN',
    family: 'machine',
    hp: 950,
    speed: 64,
    damage: 31,
    size: [160, 188],
    artId: 'hulkbot',
    accent: 0x8fc4ff,
    moves: ['rb_horn_call', 'rb_formation_fire', 'rb_rally_charge', 'rb_drum_shock'],
    summonIds: ['hulkbot', 'weld_brute', 'scrapper'],
    desc: '它的喇叭一响，附近的机器人就都归队。先拆喇叭，否则你会被围死。',
  },
  {
    id: 'tb_storm_reaper',
    theme: 'storm_farm',
    name: '风暴收割者',
    en: 'STORM REAPER',
    family: 'mutant',
    hp: 870,
    speed: 72,
    damage: 30,
    size: [152, 180],
    artId: 'mimic_beast',
    accent: 0x9ab84a,
    moves: ['sr_barn_tornado', 'sr_sheet_slash', 'sr_lightning_rod', 'sr_storm_herd'],
    summonIds: ['radboar', 'wingrat'],
    desc: '风把谷仓的铁皮卷起来，它把这些铁皮穿在身上。转身的时候像一场小风暴。',
  },
  {
    id: 'tb_acid_mother',
    theme: 'acid_basin',
    name: '酸沼母体',
    en: 'ACID MOTHER',
    family: 'mutant',
    hp: 1000,
    speed: 46,
    damage: 33,
    size: [172, 198],
    artId: 'junk_golem',
    accent: 0xc6e05a,
    moves: ['am_acid_tide', 'am_corrosive_spit', 'am_body_crush', 'am_spawn_pods'],
    summonIds: ['spitter', 'ghoul_husk'],
    desc: '盆底那层绿水是它泡出来的。它不追人，只让酸液一点点涨上来。',
  },
  {
    id: 'tb_rot_queen',
    theme: 'rot_jungle',
    name: '腐殖女王',
    en: 'ROT QUEEN',
    family: 'mutant',
    hp: 940,
    speed: 62,
    damage: 31,
    size: [156, 186],
    artId: 'swarm_core',
    accent: 0x6b8a3a,
    moves: ['rq_vine_throne', 'rq_spore_bloom', 'rq_thorn_whip', 'rq_brood_call'],
    summonIds: ['spitter', 'cyber_mantis', 'wingrat'],
    desc: '雨林把整栋研究站吞了，只剩女王还坐在藤蔓编的椅子上。',
  },
  {
    id: 'tb_bell_bishop',
    theme: 'church',
    name: '断钟主教',
    en: 'BELL BISHOP',
    family: 'human',
    hp: 880,
    speed: 58,
    damage: 29,
    size: [144, 176],
    artId: 'esper_berserk',
    accent: 0xf2b34a,
    moves: ['bb_broken_bell', 'bb_censer_swing', 'bb_sermon_bolt', 'bb_congregation'],
    summonIds: ['cult_fanatic', 'ghoul_husk'],
    desc: '他敲的不是钟，是信号。钟声一停，走廊里的信徒就会走出来。',
  },
  {
    id: 'tb_prime_core',
    theme: 'ai_origin',
    name: '初代核心',
    en: 'PRIME CORE',
    family: 'machine',
    hp: 1020,
    speed: 52,
    damage: 34,
    size: [164, 190],
    artId: 'cyberpsycho_boss',
    accent: 0x6ff0d0,
    moves: ['pc_protocol_zero', 'pc_logic_bomb', 'pc_prime_wave', 'pc_fork_process'],
    summonIds: ['server_wraith', 'drone', 'sentry'],
    desc: '它是最早那个会问「我是谁」的程序。现在它有很多身体，也很确定你不是它。',
  },
  {
    id: 'tb_zero_strain',
    theme: 'virus_lab',
    name: '零号病株',
    en: 'STRAIN ZERO',
    family: 'mutant',
    hp: 960,
    speed: 60,
    damage: 32,
    size: [158, 184],
    artId: 'swarm_core',
    accent: 0x9ab84a,
    moves: ['zs_infection_cloud', 'zs_mutation_burst', 'zs_airborne_virus', 'zs_host_call'],
    summonIds: ['spitter', 'ghoul_husk', 'crawler'],
    desc: '培养罐裂了。它顺着通风管长满了整层楼，然后开始学人说话。',
  },
  {
    id: 'tb_proto_mind',
    theme: 'ai_lab',
    name: '原型心智',
    en: 'PROTOTYPE MIND',
    family: 'machine',
    hp: 900,
    speed: 68,
    damage: 30,
    size: [142, 174],
    artId: 'esper_berserk',
    accent: 0x8fe8ff,
    moves: ['pm_predictive_shot', 'pm_mind_probe', 'pm_feedback_loop', 'pm_servitor'],
    summonIds: ['server_wraith', 'cyber_mantis'],
    desc: '研究员给它装了太多传感器。它现在能看见你下一步想往哪走。',
  },
  {
    id: 'tb_observer',
    theme: 'alien_center',
    name: '观测体·外来者',
    en: 'THE OBSERVER',
    family: 'alien',
    hp: 1040,
    speed: 74,
    damage: 35,
    size: [150, 182],
    artId: 'sky_warden',
    accent: 0x8fc4ff,
    moves: ['ob_abduction_beam', 'ob_sample_orbs', 'ob_scan_sweep', 'ob_alien_escort'],
    summonIds: ['alien_orb', 'sentry'],
    desc: '它不攻击「人类」，只采样。被采样的人都不再需要吃饭。',
  },
  {
    id: 'tb_iron_colonel',
    theme: 'military_base',
    name: '铁幕上校',
    en: 'IRON COLONEL',
    family: 'human',
    hp: 980,
    speed: 70,
    damage: 33,
    size: [160, 186],
    artId: 'claw_tyrant',
    accent: 0xc8553f,
    moves: ['ic_artillery_grid', 'ic_bayonet_charge', 'ic_crossfire', 'ic_reinforce'],
    summonIds: ['weld_brute', 'hulkbot'],
    desc: '基地的自动防御还在听他的。他站在弹药库前，把整片操场都算进了射界。',
  },
  // ============================================================ 旧城 / 深井 / 雾海（30）
  {
    id: 'tb_librarian',
    theme: 'library',
    name: '编目长·书脊',
    en: 'THE LIBRARIAN',
    family: 'machine',
    hp: 760,
    speed: 50,
    damage: 24,
    size: [138, 172],
    artId: 'esper_berserk',
    accent: 0xd8c070,
    moves: ['lb_page_storm', 'lb_shelf_slam', 'lb_index_beam', 'lb_archive_call'],
    summonIds: ['vault_puppet', 'server_wraith'],
    desc: '它把每一本被烧掉的书都重新抄了一遍。抄到你的名字时，它决定先把你归档。',
  },
  {
    id: 'tb_schoolmaster',
    theme: 'school',
    name: '值周校长',
    en: 'THE SCHOOLMASTER',
    family: 'human',
    hp: 780,
    speed: 76,
    damage: 26,
    size: [142, 174],
    artId: 'claw_tyrant',
    accent: 0xe0b060,
    moves: ['sm_ruler_line', 'sm_chalk_dust', 'sm_detention', 'sm_roll_call'],
    summonIds: ['vault_puppet', 'psycho_punk'],
    desc: '他手里那根教鞭是钢筋改的。走廊里的每一扇门他都记得，包括你进来的那扇。',
  },
  {
    id: 'tb_professor',
    theme: 'university',
    name: '终身教授',
    en: 'TENURED PROFESSOR',
    family: 'machine',
    hp: 820,
    speed: 56,
    damage: 27,
    size: [144, 176],
    artId: 'cyberpsycho_boss',
    accent: 0xb8d8e8,
    moves: ['pf_lecture_lights', 'pf_thesis_volley', 'pf_tenure_grip', 'pf_ta_summon'],
    summonIds: ['vault_puppet', 'cyber_mantis'],
    desc: '他的讲稿还在自动翻页。翻到结论那一页，整间阶梯教室的灯会一起亮起来。',
  },
  {
    id: 'tb_paper_press',
    theme: 'paper_mill',
    name: '压辊·三号',
    en: 'PRESS ROLLER III',
    family: 'machine',
    hp: 900,
    speed: 44,
    damage: 31,
    size: [158, 182],
    artId: 'junk_golem',
    accent: 0xc8b080,
    moves: ['pp_roller_crush', 'pp_pulp_spray', 'pp_stack_drop', 'pp_recycle'],
    summonIds: ['viral_wraith', 'crawler'],
    desc: '三号压辊从来没有停过。它把废纸、铁皮和闯进来的人都压成同一厚度。',
  },
  {
    id: 'tb_curator',
    theme: 'archaeological_site',
    name: '值守馆长',
    en: 'THE CURATOR',
    family: 'human',
    hp: 800,
    speed: 66,
    damage: 28,
    size: [146, 176],
    artId: 'mimic_beast',
    accent: 0xc8a060,
    moves: ['cu_tag_archive', 'cu_dig_pit', 'cu_relic_toss', 'cu_museum_guard'],
    summonIds: ['ghoul_husk', 'mine_shade'],
    desc: '他把探方里的东西一件件贴上标签。标签不够用了，就开始给别人贴。',
  },
  {
    id: 'tb_warden',
    theme: 'prison',
    name: '最后一班狱长',
    en: 'THE WARDEN',
    family: 'human',
    hp: 880,
    speed: 64,
    damage: 30,
    size: [150, 178],
    artId: 'hulkbot',
    accent: 0x9aa0a8,
    moves: ['wd_searchlight', 'wd_baton_slam', 'wd_gate_lock', 'wd_inmate_call'],
    summonIds: ['psycho_punk', 'tunnel_hound'],
    desc: '巡夜的灯还在扫。他数人头的习惯没改，只是现在数的是还剩几个能站着的。',
  },
  {
    id: 'tb_hotel_clerk',
    theme: 'hotel',
    name: '前台·夜班',
    en: 'NIGHT CLERK',
    family: 'machine',
    hp: 740,
    speed: 60,
    damage: 25,
    size: [138, 172],
    artId: 'esper_berserk',
    accent: 0xc8a8d8,
    moves: ['hcl_room13_door', 'hcl_key_volley', 'hcl_luggage_slam', 'hcl_guest_register'],
    summonIds: ['blood_thrall', 'ghoul_husk'],
    desc: '它一直问你有没有预订。不管你答什么，它都会递过来一把 13 号房的钥匙。',
  },
  {
    id: 'tb_dockmaster',
    theme: 'dock',
    name: '老码头工头',
    en: 'THE DOCKMASTER',
    family: 'human',
    hp: 860,
    speed: 72,
    damage: 30,
    size: [150, 180],
    artId: 'claw_tyrant',
    accent: 0x8fb8c8,
    moves: ['dm_winch_pull', 'dm_hook_swing', 'dm_mooring_wave', 'dm_dock_crew'],
    summonIds: ['scrapper', 'hulkbot'],
    desc: '他管过所有靠岸的船。现在没有船了，他就把缆绳一头拴在自己腰上。',
  },
  {
    id: 'tb_lighthouse_keeper',
    theme: 'lighthouse',
    name: '守灯人',
    en: 'THE LIGHTHOUSE KEEPER',
    family: 'machine',
    hp: 770,
    speed: 58,
    damage: 26,
    size: [140, 174],
    artId: 'sky_warden',
    accent: 0xffe08a,
    moves: ['lk_lens_sweep', 'lk_signal_flare', 'lk_shipwreck', 'lk_lamp_servants'],
    summonIds: ['drone', 'server_wraith'],
    desc: '透镜转一圈是十二秒。它每转一圈就朝海面扫一次，也顺带扫一次岸上。',
  },
  {
    id: 'tb_shipwright',
    theme: 'shipyard',
    name: '船匠·铆钉手',
    en: 'THE SHIPWRIGHT',
    family: 'machine',
    hp: 920,
    speed: 52,
    damage: 32,
    size: [156, 184],
    artId: 'hulkbot',
    accent: 0xa8c0c8,
    moves: ['shp_rivet_gun', 'shp_weld_arc', 'shp_hull_slam', 'shp_forge_call'],
    summonIds: ['weld_brute', 'scrapper'],
    desc: '他焊的船没有一条下过水。船骨焊到一半，他把自己的胳膊也焊了上去。',
  },
  {
    id: 'tb_drydock_rig',
    theme: 'drydock',
    name: '坞架机',
    en: 'DRYDOCK RIG',
    family: 'machine',
    hp: 940,
    speed: 46,
    damage: 33,
    size: [160, 186],
    artId: 'junk_golem',
    accent: 0x8fb0b8,
    moves: ['dr_keel_hoist', 'dr_rig_arm_sweep', 'dr_bolt_rain', 'dr_skeleton_crew'],
    summonIds: ['weld_brute', 'crawler'],
    desc: '支撑船体的钢架自己站了起来。它把整座干坞当成一副骨架，正在找船首。',
  },
  {
    id: 'tb_substation',
    theme: 'substation',
    name: '过载变电体',
    en: 'OVERLOAD TRANSFORMER',
    family: 'machine',
    hp: 800,
    speed: 62,
    damage: 28,
    size: [142, 176],
    artId: 'cyberpsycho_boss',
    accent: 0x88e0ff,
    moves: ['ss_arc_jump', 'ss_overload_pulse', 'ss_transformer_hum', 'ss_grid_feed'],
    summonIds: ['sentry', 'drone'],
    desc: '电弧在绝缘子之间来回跳。它一放电，整片废墟的电表都会倒着转。',
  },
  {
    id: 'tb_bunker_commander',
    theme: 'bunker',
    name: '堡垒司令',
    en: 'BUNKER COMMANDER',
    family: 'human',
    hp: 960,
    speed: 58,
    damage: 31,
    size: [152, 182],
    artId: 'hulkbot',
    accent: 0x8fa8b8,
    moves: ['bc_blast_door', 'bc_slit_fire', 'bc_grenade_lob', 'bc_garrison'],
    summonIds: ['sentry', 'weld_brute'],
    desc: '防爆门内侧那句「里面还有人」是他写的。门开之后，他就不打算让任何人再出去。',
  },
  {
    id: 'tb_mine_foreman',
    theme: 'coal_mine',
    name: '矿井工头',
    en: 'MINE FOREMAN',
    family: 'mutant',
    hp: 880,
    speed: 54,
    damage: 31,
    size: [152, 180],
    artId: 'junk_golem',
    accent: 0x9a8a70,
    moves: ['mf_headlamp', 'mf_gas_pocket', 'mf_pick_slam', 'mf_tunnel_rats'],
    summonIds: ['mine_shade', 'crawler'],
    desc: '他头上那盏灯还亮着，是他身上唯一还亮的地方。矿石把他压成了另一种形状。',
  },
  {
    id: 'tb_boiler_king',
    theme: 'thermal_plant',
    name: '锅炉王',
    en: 'BOILER KING',
    family: 'machine',
    hp: 1000,
    speed: 42,
    damage: 34,
    size: [166, 192],
    artId: 'hulkbot',
    accent: 0xff9a5a,
    moves: ['bk_pressure_valve', 'bk_furnace_blast', 'bk_scalding_rain', 'bk_stoker_crew'],
    summonIds: ['weld_brute', 'hulkbot'],
    desc: '炉膛里的火一天没灭。它坐在压力表前面，等指针转满一整圈。',
  },
  {
    id: 'tb_reactor_priest',
    theme: 'nuclear_plant',
    name: '反应堆祭司',
    en: 'REACTOR PRIEST',
    family: 'machine',
    hp: 1020,
    speed: 50,
    damage: 35,
    size: [160, 188],
    artId: 'esper_berserk',
    accent: 0x9af0c0,
    moves: ['rp_radiation_pool', 'rp_control_rod', 'rp_irradiation', 'rp_core_acolytes'],
    summonIds: ['spitter', 'radboar'],
    desc: '它把控制棒当成香。每插一根，它就念一段听不懂的编号。',
  },
  {
    id: 'tb_rad_colossus',
    theme: 'radiation_zone',
    name: '辐照巨像',
    en: 'RADIATION COLOSSUS',
    family: 'mutant',
    hp: 1040,
    speed: 44,
    damage: 36,
    size: [170, 196],
    artId: 'junk_golem',
    accent: 0xb8f060,
    moves: ['rc_hot_pile', 'rc_geiger_scream', 'rc_crushing_mass', 'rc_mutant_brood'],
    summonIds: ['radboar', 'ghoul_husk', 'nano_swarm'],
    desc: '废料堆底下压着的东西一直在长。它一站起来，盖革计数器就只剩一种声音。',
  },
  {
    id: 'tb_arsenal_sergeant',
    theme: 'arsenal',
    name: '弹药库军士长',
    en: 'ARSENAL SERGEANT',
    family: 'human',
    hp: 900,
    speed: 74,
    damage: 33,
    size: [148, 178],
    artId: 'claw_tyrant',
    accent: 0xe8a040,
    moves: ['as_turret_array', 'as_shell_volley', 'as_bayonet_rush', 'as_ammo_detail'],
    summonIds: ['psycho_punk', 'sentry'],
    desc: '他把流水线调到最快，弹壳堆到膝盖。谁进来都会被算进当天的产量。',
  },
  {
    id: 'tb_punk_amp',
    theme: 'punk_mech',
    name: '音箱塔·失真',
    en: 'DISTORTION AMP',
    family: 'machine',
    hp: 860,
    speed: 68,
    damage: 30,
    size: [150, 180],
    artId: 'cyberpsycho_boss',
    accent: 0xff5ab0,
    moves: ['pa_bass_wall', 'pa_feedback_howl', 'pa_stage_dive', 'pa_punk_crew'],
    summonIds: ['psycho_punk', 'punk_raider'],
    desc: '它把整面墙的音箱接在自己身上。低音一响，地上的碎玻璃就会跳起来。',
  },
  {
    id: 'tb_shadow_walker',
    theme: 'shadow_labyrinth',
    name: '暗影行者',
    en: 'SHADOW WALKER',
    family: 'machine',
    hp: 840,
    speed: 82,
    damage: 29,
    size: [144, 176],
    artId: 'esper_berserk',
    accent: 0x7a6aff,
    moves: ['sh_delayed_clone', 'sh_shadow_grasp', 'sh_blackout', 'sh_fog_stalkers'],
    summonIds: ['dark_web_ghost', 'fog_stalker'],
    desc: '监控里它永远比画面晚半拍。你回头的时候，它已经在你要去的那条走廊尽头。',
  },
  {
    id: 'tb_castle_tyrant',
    theme: 'chaos_castle',
    name: '空王座',
    en: 'THE HOLLOW THRONE',
    family: 'machine',
    hp: 980,
    speed: 56,
    damage: 33,
    size: [158, 186],
    artId: 'hulkbot',
    accent: 0xd04a6a,
    moves: ['ct_hollow_throne', 'ct_knight_charge', 'ct_ballroom_waltz', 'ct_court_summon'],
    summonIds: ['castle_knight', 'psycho_punk'],
    desc: '王座上的盔甲是空的，钟一响就换个坐姿。臣民都还在，只是都不会说话了。',
  },
  {
    id: 'tb_vampire_count',
    theme: 'vampire_lair',
    name: '血伯爵',
    en: 'BLOOD COUNT',
    family: 'mutant',
    hp: 930,
    speed: 78,
    damage: 32,
    size: [148, 180],
    artId: 'claw_tyrant',
    accent: 0xc02244,
    moves: ['vc_blood_bags', 'vc_bat_swarm', 'vc_crimson_grip', 'vc_thrall_call'],
    summonIds: ['blood_thrall', 'ghoul_husk'],
    desc: '冷藏柜里的血袋按日期码得整整齐齐。他每天只开一袋，今天开的是你的。',
  },
  {
    id: 'tb_gravity_eye',
    theme: 'gravity_anomaly',
    name: '重力之眼',
    en: 'GRAVITY EYE',
    family: 'alien',
    hp: 900,
    speed: 60,
    damage: 30,
    size: [148, 178],
    artId: 'sky_warden',
    accent: 0x9ad8ff,
    moves: ['ge_gravity_well', 'ge_meteor_lance', 'ge_singularity', 'ge_orb_escort'],
    summonIds: ['alien_orb', 'nano_swarm'],
    desc: '碎石绕着它慢慢转。它看你的时候，你脚下的重力会先迟疑一下。',
  },
  {
    id: 'tb_fog_wraith',
    theme: 'dense_fog',
    name: '雾中形',
    en: 'FOG WRAITH',
    family: 'mutant',
    hp: 850,
    speed: 66,
    damage: 29,
    size: [146, 178],
    artId: 'esper_berserk',
    accent: 0xc8d8e0,
    moves: ['fw_fog_shapes', 'fw_whisper', 'fw_drown', 'fw_stalkers'],
    summonIds: ['fog_stalker', 'crawler'],
    desc: '雾浓到能看见它的轮廓，走近又只剩一层水汽。它靠你的脚步声定位。',
  },
  {
    id: 'tb_strait_howler',
    theme: 'howling_strait',
    name: '海峡嚎叫者',
    en: 'STRAIT HOWLER',
    family: 'mutant',
    hp: 940,
    speed: 70,
    damage: 32,
    size: [154, 182],
    artId: 'sky_warden',
    accent: 0x88b8d8,
    moves: ['st_wail', 'st_tide_crash', 'st_gale', 'st_flock'],
    summonIds: ['wingrat', 'fog_stalker'],
    desc: '海峡的风从它胸腔里过，发出的声音像整片海在哭。听见的人会想往回走。',
  },
  {
    id: 'tb_swamp_maw',
    theme: 'abyss_swamp',
    name: '泥沼巨口',
    en: 'SWAMP MAW',
    family: 'mutant',
    hp: 1000,
    speed: 40,
    damage: 35,
    size: [168, 192],
    artId: 'mimic_beast',
    accent: 0x7a9a60,
    moves: ['swp_mire_sink', 'swp_bubble_burst', 'swp_mud_spit', 'swp_swamp_brood'],
    summonIds: ['ghoul_husk', 'spitter'],
    desc: '泥面冒的泡是它在换气。它不追人，只把整片沼往你脚下推。',
  },
  {
    id: 'tb_forest_hollow',
    theme: 'withered_forest',
    name: '枯林空腔',
    en: 'HOLLOW OF THE WOODS',
    family: 'mutant',
    hp: 880,
    speed: 72,
    damage: 30,
    size: [150, 180],
    artId: 'mimic_beast',
    accent: 0xa89070,
    moves: ['fh_hollow_resonance', 'fh_branch_sweep', 'fh_leaf_storm', 'fh_woodland_call'],
    summonIds: ['mine_shade', 'wingrat'],
    desc: '树干是空的，声音从每一道裂口里出来。你砍断一棵，剩下的会一起响。',
  },
  {
    id: 'tb_red_tide',
    theme: 'red_tide',
    name: '赤潮母',
    en: 'RED TIDE MOTHER',
    family: 'mutant',
    hp: 960,
    speed: 48,
    damage: 33,
    size: [162, 188],
    artId: 'swarm_core',
    accent: 0xe05040,
    moves: ['rt_red_tide', 'rt_shell_barrage', 'rt_undertow', 'rt_spawn_beds'],
    summonIds: ['nano_swarm', 'spitter'],
    desc: '红色的潮水是它推上岸的。每涨一次，滩上就多一层壳。',
  },
  {
    id: 'tb_grey_harbor',
    theme: 'grey_harbor',
    name: '灰港吊机',
    en: 'GREY HARBOUR CRANE',
    family: 'machine',
    hp: 920,
    speed: 58,
    damage: 31,
    size: [156, 184],
    artId: 'sky_warden',
    accent: 0xa8b0b8,
    moves: ['gh_crane_hook', 'gh_foghorn', 'gh_container_drop', 'gh_dockhands'],
    summonIds: ['drone', 'scrapper'],
    desc: '汽笛是它发出来的。它用吊钩在雾里探路，钩到什么就往水里放。',
  },
  {
    id: 'tb_hotel_nightmare',
    theme: 'horror_hotel',
    name: '十三号房客',
    en: 'GUEST OF ROOM 13',
    family: 'mutant',
    hp: 980,
    speed: 74,
    damage: 33,
    size: [152, 182],
    artId: 'swarm_core',
    accent: 0xb04060,
    moves: ['hn_room13', 'hn_blood_trail', 'hn_key_turn', 'hn_guests'],
    summonIds: ['blood_thrall', 'dark_web_ghost'],
    desc: '地毯上的水渍从它房间一路拖出来。它每晚换一间房，只有 13 号永远亮着灯。',
  },
]

class ThemeBoss extends BaseMonster {
  constructor(game, x, y, cfg) {
    super(game, cfg, x, y)
    this.cfg = cfg
    this.accent = cfg.accent
    this.baseSpeed = cfg.speed
    this.baseDamage = cfg.damage
    // 每只 BOSS 独占的四招由对应 kit 工厂提供，moves 直接取 kit 的键
    this.kit = BOSS_KIT_FACTORIES[cfg.id] ? BOSS_KIT_FACTORIES[cfg.id](this) : {}
    this.moves = Object.keys(this.kit)
    this.moveCd = 1.1
    this.phase = 1
    this.chargeT = 0
    this.fired = false
    this.moveReady = {}
    this.lastMove = null
    this.comboCount = 0
    this._fx = []
    initLarge(this, { intro: 1.25, activateRange: 780 })
    applyLargeArt(this)
    this.tell = createTell(this, { inner: 44, outer: 76, color: cfg.accent })
    this._buildAura()
  }

  _buildAura() {
    try {
      const geo = new THREE.RingGeometry(30, 40, 28)
      const mat = new THREE.MeshBasicMaterial({
        color: this.accent,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Mesh(geo, mat)
      ring.position.y = this.h * 0.22
      ring.renderOrder = 7
      this.group.add(ring)
      this.aura = { mesh: ring, mat }
    } catch (e) {
      this.aura = null
    }
  }

  _feetY() {
    return this.body.y + this.body.h
  }

  _hd() {
    const p = this.player
    return p ? Math.abs(p.centerX - this.px) : Infinity
  }

  _bullet(opts) {
    const g = this.game
    if (typeof g.spawnProjectile === 'function') {
      try {
        return !!g.spawnProjectile({
          x: opts.x,
          y: opts.y,
          vx: opts.vx,
          vy: opts.vy,
          gravity: opts.gravity ?? 0,
          radius: opts.radius ?? 6,
          damage: opts.damage ?? this.damage,
          color: opts.color ?? this.accent,
          life: opts.life ?? 1.8,
          type: 'bullet',
          source: this.id,
        })
      } catch (e) {
        return false
      }
    }
    return false
  }

  _aimShoot(spread = 0, speed = 480) {
    const p = this.player
    if (!p) return
    const sx = this.px + this.facing * 26
    const sy = this.py - this.h * 0.16
    const dx = p.centerX - sx
    const dy = p.centerY - 10 - sy
    const len = Math.max(1, Math.hypot(dx, dy))
    const a = Math.atan2(dy, dx) + spread
    this._bullet({
      x: sx,
      y: sy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage: this.damage,
    })
  }

  /** 招式距离区间是否覆盖当前水平距离 */
  _inRange(spec, hd) {
    const r = spec && spec.range
    if (!r) return true
    return hd >= r[0] && hd <= r[1]
  }

  /** 冷却结束且距离合适的招式；距离带外只保留远程/全图招（近战不朝空气挥） */
  _readyMoves() {
    const hd = this._hd()
    const inRange = []
    const farOk = []
    for (const k of this.moves) {
      const spec = this.kit[k]
      if (!spec || (this.moveReady[k] || 0) > 0) continue
      if (this._inRange(spec, hd)) inRange.push(k)
      else if ((spec.range?.[1] ?? 0) >= 400) farOk.push(k)
    }
    return inRange.length ? inRange : farOk
  }

  _pickMove() {
    const pool = this._readyMoves()
    if (!pool.length) return null
    // 不连续重名（有替代时）
    const rest = pool.length > 1 ? pool.filter((k) => k !== this.lastMove) : pool
    // 二阶段更愿意主动放签名招
    if (this.phase > 1) {
      const sig = rest.find((k) => this.kit[k].sig)
      if (sig && Math.random() < 0.5) return sig
    }
    // 连招中段优先短前摇招，衔接更顺
    if (this.comboCount > 0) {
      const quick = rest.filter((k) => (this.kit[k].wind ?? 0.5) <= 0.55)
      if (quick.length) return quick[(Math.random() * quick.length) | 0]
    }
    return rest[(Math.random() * rest.length) | 0]
  }

  _exec(move) {
    const spec = this.kit[move]
    if (!spec || typeof spec.exec !== 'function') return
    spec.exec(this)
    this.moveReady[move] = spec.cool ?? 2
    this.lastMove = move
  }

  updateBehavior(dt) {
    this.moveCd = Math.max(0, this.moveCd - dt)
    for (const k in this.moveReady) {
      if (this.moveReady[k] > 0) this.moveReady[k] = Math.max(0, this.moveReady[k] - dt)
    }
    updateFx(this, dt)
    if (this.aura) {
      const t = this.game.time || 0
      this.aura.mat.opacity = 0.16 + Math.sin(t * 3) * 0.08 + (this.phase > 1 ? 0.1 : 0)
      this.aura.mesh.rotation.z = t * 0.6
    }
    if (this.tell) {
      placeTell(this.tell, this.px, this._feetY() + 2, 1)
      if (this.tell.mat.opacity > 0) showTell(this.tell, Math.max(0, this.tell.mat.opacity - dt * 2))
    }
    if (playIntro(this, dt)) return
    if (this.stunT > 0) {
      this.vxTarget = 0
      this.playAnim('hurt')
      return
    }
    const p = this.player
    const active = updateActivation(this, dt)
    if (!p || p.dead || !active) {
      this.state = 'roam'
      this.comboCount = 0
      roamStep(this, dt, { speedMul: 0.5 })
      return
    }

    // 冲锋进行中
    if (this.state === 'charge') {
      this.chargeT -= dt
      this.playAnim('run')
      this.vxTarget = this.facing * this.speed * 3.2
      if (this.distToPlayer() < 120 || this.chargeT <= 0) {
        aoe(this, this.px, this._feetY() - 10, 110, this.damage * 0.9)
        puff(this, 16, 0x6b5f55, 1.3)
        shake(this, 0.45)
        this.state = 'chase'
        this.stateT = 0
        this.moveCd = (this.phase > 1 ? 1.1 : 1.7) * (0.8 + Math.random() * 0.5)
      }
      return
    }

    if (this.state.startsWith('wind:')) {
      const move = this.state.slice(5)
      this.vxTarget = 0
      this.playAnim('attack')
      this.facePlayer()
      if (this.tell) showTell(this.tell, 0.35 + Math.sin(this.stateT * 22) * 0.3)
      const wind = this.kit[move] ? this.kit[move].wind : 0.5
      if (this.stateT >= wind) {
        if (this.tell) showTell(this.tell, 0)
        this._exec(move)
        if (this.state === 'charge') return
        this.state = 'recover'
        this.stateT = 0
      }
      return
    }

    if (this.state === 'recover') {
      this.vxTarget = 0
      this.playAnim('idle')
      if (this.stateT >= 0.45) {
        this.state = 'chase'
        this.stateT = 0
        // 连招：前招收尾后还有合用的招，概率立刻接下一招（一阶段最多 2 段、二阶段 3 段）
        const maxCombo = this.phase > 1 ? 2 : 1
        if (this.comboCount < maxCombo && this._readyMoves().length && Math.random() < 0.55) {
          this.comboCount++
          this.moveCd = 0
        } else {
          this.comboCount = 0
          this.moveCd = (this.phase > 1 ? 0.9 : 1.5) * (0.8 + Math.random() * 0.5)
        }
      }
      return
    }

    // 追击 + 选招
    const hd = this._hd()
    this.facePlayer()
    if (hd > 110) {
      this.state = 'chase'
      this.vxTarget = this.facing * this.speed
      this.playAnim('run')
    } else {
      this.vxTarget = 0
      this.playAnim('idle')
    }
    if (this.wallAhead() || !this.groundAhead()) this.vxTarget = 0
    const { w } = roomBounds(this)
    if (this.body.x < 30) this.body.x = 30
    else if (this.body.x > w - this.body.w - 30) this.body.x = w - this.body.w - 30

    if (this.moveCd <= 0) {
      const move = this._pickMove()
      if (move) {
        this.state = 'wind:' + move
        this.stateT = 0
        this.vxTarget = 0
        if (this.tell) showTell(this.tell, 0.55)
        sfx(this, 'growl', 0.4, 0.85)
      }
    }
  }

  takeDamage(n, fromX = null) {
    super.takeDamage(n, fromX)
    if (this.alive && this.phase === 1 && this.hp / this.maxHp <= 0.5) {
      this.phase = 2
      this.speed = this.baseSpeed * 1.16
      this.damage = this.baseDamage * 1.18
      this.moveCd = 0.5
      puff(this, 26, this.accent, 1.7)
      shake(this, 0.55)
      sfx(this, 'growl', 0.7, 0.6)
      // 二阶段开场：立刻释放该 BOSS 的签名招，给玩家一个明确的信号
      const sigKey = this.moves.find((k) => this.kit[k] && this.kit[k].sig)
      if (sigKey) this._exec(sigKey)
    }
  }

  die() {
    clearFx(this)
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    if (this.aura) {
      try {
        this.group.remove(this.aura.mesh)
        this.aura.mesh.geometry.dispose()
        this.aura.mat.dispose()
      } catch (e) {
        /* ignore */
      }
      this.aura = null
    }
    largeDeathFx(this, {
      particles: 44,
      sparks: 34,
      shake: 1,
      color: this.accent,
      extraLoot: [{ id: 'scrap_plate', n: 3, spread: 150 }],
    })
    super.die()
  }

  dispose() {
    clearFx(this)
    if (this.tell) disposeTell(this, this.tell)
    this.tell = null
    super.dispose()
  }
}

/** 生成每只 BOSS 的 DEF + 类，并按 id 注册进 Content。 */
export const THEME_BOSS_CLASSES = new Map()

for (const cfg of THEME_BOSS_DEFS) {
  const def = {
    id: cfg.id,
    name: cfg.name,
    en: cfg.en,
    family: cfg.family,
    hp: cfg.hp,
    speed: cfg.speed,
    damage: cfg.damage,
    size: cfg.size,
    aggro: 700,
    attackRange: 180,
    attackCooldown: 2.2,
    xp: 240,
    gravity: 2000,
    elite: true,
    artId: cfg.artId,
    accent: cfg.accent,
    moves: cfg.moves,
    summonIds: cfg.summonIds,
    theme: cfg.theme,
    themes: [cfg.theme],
    // 只由主题站点房显式指定，不进普通房间的随机大怪池
    biome: [],
    loot: [
      { id: 'composite_armor', chance: 0.85 },
      { id: 'hydraulic_rod', chance: 0.7, min: 1, max: 2 },
      { id: 'servo_motor', chance: 0.65 },
      { id: 'rare_earth', chance: 0.55 },
      { id: 'reactor_core', chance: 0.22 },
    ],
    desc: cfg.desc,
  }
  Content.register(KIND.MONSTER, def.id, def, 'core')
  const Cls = class extends ThemeBoss {
    constructor(game, x, y) {
      super(game, x, y, def)
    }
  }
  Object.defineProperty(Cls, 'name', { value: 'ThemeBoss_' + cfg.id })
  THEME_BOSS_CLASSES.set(def.id, Cls)
}

export const THEME_BOSS_IDS = [...THEME_BOSS_CLASSES.keys()]

/** themeId → boss def id */
export const THEME_BOSS_BY_THEME = Object.fromEntries(THEME_BOSS_DEFS.map((c) => [c.theme, c.id]))
