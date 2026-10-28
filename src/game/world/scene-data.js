// 关卡场景数据（非主题房间）
// ----------------------------------------------------------------------------
// 每间房按名字配一套「场景配方」：
//   arch   —— 地形原型（scene-terrain.js 里按此施工，决定房间骨架）
//   painter—— 背景立绘画笔（复用 backdrops.js 主题地标画法，按画家选剪影）
//   accent —— 该关的强调色（霓虹 / 反光 / 云层染色，逐关不同）
//   tint   —— 地面染色（乘在材质上，制造冷暖差异）
//   props  —— 本关标志性放置物（生成后替换通用杂物，只留这些 + 功能件）
//   env    —— 可选房间环境（雾 / 暗），不写则用默认
//
// 主题房（spec.theme）不走这里：它们已有专属全景立绘与主题景物。
function S(arch, painter, accent, tint, props, env) {
  return { arch, painter, accent, tint, props, env }
}

export const SCENES = {
  // ======================================================= 锈城废墟（18）
  city_underpass: S('deck', 'highway', 0xd0a35c, 0xc9c1ae, ['car_wreck', 'streetlight', 'fence', 'junk_heap_bags', 'sandbag']),
  city_market: S('stalls', 'stadium', 0xd8843c, 0xc4b49c, ['torn_flag', 'crate', 'barrel', 'junk_heap_bags', 'fence']),
  city_school: S('partitions', 'school', 0x7fa6c8, 0xbfb8a8, ['school_desk', 'blackboard', 'paper_trash', 'library_shelf']),
  city_clinic: S('benches', 'rescue_center', 0x8fc4b8, 0xc9c6bd, ['sofa', 'gurney', 'stretcher', 'vending_machine']),
  city_busstop: S('canopy', 'highway', 0xd9b34a, 0xc0b8a4, ['bus_wreck', 'tire_pile', 'streetlight', 'fence']),
  city_roofway: S('rooftops', 'skyscraper', 0x9fc7d8, 0xb8b8b4, ['antenna', 'streetlight', 'mech_cable_run']),
  city_shelter: S('flats', 'highway', 0xd8a860, 0xc6bba6, ['campfire', 'crate', 'barrel', 'workbench']),
  city_street: S('bridge', 'highway', 0xd4544a, 0xc2b8a4, ['car_wreck', 'bus_wreck', 'tire_pile', 'fence', 'rubble_small']),
  city_plaza: S('ring', 'stadium', 0xe0b04a, 0xc9c0ac, ['building_facade', 'streetlight', 'sofa', 'crate']),
  city_slum: S('alleys', 'rescue_center', 0xa85f4a, 0xb8a894, ['house_facade', 'wardrobe', 'cradle', 'grave', 'junk_heap_bags']),
  city_tower: S('tiers', 'skyscraper', 0xd66a3a, 0xb4b4b0, ['antenna', 'mech_cable_run', 'terminal', 'building_facade']),
  city_gate: S('gate', 'military_base', 0xc96a3a, 0xbfb29c, ['military_crate', 'sandbag', 'fence', 'barrel']),
  city_ringroad: S('ramp', 'highway', 0xd8a03a, 0xc6bcae, ['car_wreck', 'streetlight', 'fence', 'tire_pile']),
  city_billboard: S('billboards', 'skyscraper', 0xe0557a, 0xb8b6b0, ['tv', 'torn_flag', 'streetlight', 'mech_cable_run']),
  city_parking: S('pillars', 'bunker', 0x8f9aa0, 0xaeaba6, ['car_wreck', 'tire_pile', 'streetlight', 'puddle_toxic']),
  city_metro_mouth: S('shaft', 'shadow_labyrinth', 0x53c8c0, 0xb6b4ae, ['metro_sign', 'turnstile', 'mech_rail', 'streetlight']),
  city_depot_row: S('shelves', 'robot_factory', 0xc7a35a, 0xb8b0a0, ['container_small', 'crate', 'barrel', 'mech_rail']),
  city_border: S('gate', 'military_base', 0xd0b050, 0xc6bca6, ['military_crate', 'sandbag', 'fence', 'streetlight']),

  // ======================================================= 枯穗村（18）
  village_henhouse: S('stalls', 'storm_farm', 0xd9c05a, 0xc8bf9e, ['fence', 'weed', 'skeleton_animal', 'junk_heap_bags']),
  village_mill: S('tiers', 'storm_farm', 0xd8b060, 0xc6baa0, ['gear_assembly', 'workbench', 'crate', 'mech_turbine']),
  village_orchard: S('trees', 'withered_forest', 0x9aa35a, 0xb3ab94, ['tree_dead', 'weed', 'ivy', 'fence']),
  village_pond: S('basin', 'dam', 0x7fb0a8, 0xb6b2a2, ['silt_mound', 'puddle_toxic', 'weed', 'life_ring']),
  village_shed: S('shelves', 'storm_farm', 0xc09258, 0xc0b49c, ['crate', 'workbench', 'tree_dead', 'tire_pile']),
  village_bridge: S('bridge', 'bridge', 0xb0a080, 0xc2b8a2, ['rebar_pile', 'fence', 'silt_mound', 'rubble_small']),
  village_shelter: S('flats', 'storm_farm', 0xd9b060, 0xc9bda2, ['campfire', 'crate', 'barrel', 'workbench']),
  village_field: S('flats', 'storm_farm', 0xc8b84a, 0xcabf9e, ['weed', 'fence', 'farm_silo', 'tree_dead']),
  village_house: S('partitions', 'rescue_center', 0xa88a6a, 0xbeb2a0, ['house_facade', 'sofa', 'wardrobe', 'cradle']),
  village_well: S('shaft', 'dam', 0x9ab0a8, 0xbcb8aa, ['silt_mound', 'crate', 'rebar_pile', 'mech_pipe_bundle']),
  village_barn: S('arch', 'storm_farm', 0xd0a060, 0xc3b49a, ['farm_silo', 'torn_flag', 'rebar_pile', 'tree_dead']),
  village_gate: S('gate', 'military_base', 0xd8b050, 0xc9bfa4, ['fence', 'torn_flag', 'sandbag', 'weed']),
  village_hollow: S('basin', 'acid_basin', 0xa8a05a, 0xb8b09a, ['puddle_toxic', 'silt_mound', 'weed', 'grave']),
  village_chapel: S('arch', 'church', 0xc8a0c0, 0xb8ae9e, ['church_bell', 'grave', 'lunar_flower', 'sofa']),
  village_kiln: S('piles', 'coal_mine', 0xc07a4a, 0xb9ab94, ['rebar_pile', 'workbench', 'junk_heap_scrap', 'sandbag']),
  village_graveyard: S('graves', 'church', 0x9a9a7a, 0xbab6a6, ['grave', 'skeleton_human', 'skull', 'weed']),
  village_wellfield: S('shaft', 'dam', 0x9ab0b8, 0xbcb8ac, ['silt_mound', 'fence', 'rebar_pile']),
  village_ridge: S('rooftops', 'storm_farm', 0xc0a05a, 0xb6b09a, ['tree_dead', 'torn_flag', 'weed', 'skeleton_animal']),

  // ======================================================= 熔渣工厂（18）
  factory_intake: S('catwalk', 'robot_factory', 0xd0a040, 0xb0a898, ['conveyor_segment', 'gear_assembly', 'factory_pipe', 'crate']),
  factory_boiler: S('tiers', 'thermal_plant', 0xd06a3a, 0xaea598, ['mech_turbine', 'factory_pipe', 'mech_valve', 'hydraulic_press']),
  factory_chem: S('shelves', 'virus_lab', 0x8adb6a, 0xaab0a0, ['lab_tank', 'barrel', 'mech_valve', 'mech_console']),
  factory_machine: S('press', 'robot_factory', 0xd0a050, 0xafa89a, ['gear_assembly', 'mech_servo_arm', 'workbench', 'mech_piston']),
  factory_paint: S('catwalk', 'robot_factory', 0xe07a3a, 0xb2a294, ['conveyor_segment', 'barrel', 'mech_servo_arm']),
  factory_scrap_yard: S('piles', 'coal_mine', 0xc09a4a, 0xaba294, ['junk_heap_scrap', 'rebar_pile', 'container_small', 'mech_clamp']),
  factory_shelter: S('flats', 'substation', 0xd9a050, 0xb4ad9e, ['campfire', 'crate', 'workbench', 'terminal']),
  factory_line: S('catwalk', 'robot_factory', 0xd0b040, 0xaea89a, ['conveyor_segment', 'robot_torso', 'gear_assembly', 'mech_servo_arm']),
  factory_hall: S('catwalk', 'robot_factory', 0xe0703a, 0xb0a696, ['mech_turbine', 'factory_pipe', 'crane_hook', 'hydraulic_press']),
  factory_furnace: S('shaft', 'thermal_plant', 0xe04a2a, 0xb09a88, ['factory_pipe', 'barrel', 'mech_valve', 'rebar_pile']),
  factory_control: S('benches', 'substation', 0x6ab0d0, 0xa8aeb0, ['mech_console', 'terminal', 'server_rack', 'antenna']),
  factory_gate: S('gate', 'military_base', 0xd0703a, 0xb2a696, ['factory_pipe', 'barrel', 'mech_valve', 'sandbag']),
  factory_power: S('pillars', 'substation', 0x70c0e0, 0xa8acae, ['transformer', 'mech_cable_run', 'generator', 'mech_console']),
  factory_lab: S('shelves', 'virus_lab', 0x7ad0b0, 0xacb2a8, ['lab_tank', 'mech_console', 'workbench', 'barrel']),
  factory_coolant: S('basin', 'thermal_plant', 0x6ab0c0, 0xa8b0ae, ['mech_pipe_bundle', 'mech_valve', 'factory_pipe', 'puddle_toxic']),
  factory_rail: S('train', 'drydock', 0xc0a050, 0xaea89c, ['mech_rail', 'container_small', 'coal_cart', 'crate']),
  factory_silo: S('tiers', 'robot_factory', 0xd0a860, 0xb2a898, ['farm_silo', 'container_small', 'mech_pipe_bundle', 'factory_pipe']),
  factory_outfall: S('arch', 'red_tide', 0x8aba5a, 0xa6ac9c, ['factory_pipe', 'mech_valve', 'puddle_toxic', 'barrel']),

  // ======================================================= 倾倒深坑（18）
  dump_gateway: S('ramp', 'coal_mine', 0xc0a050, 0xafa792, ['junk_heap_scrap', 'rubble_small', 'rebar_pile', 'tire_pile']),
  dump_sortline: S('catwalk', 'coal_mine', 0xd0a040, 0xaea690, ['conveyor_segment', 'junk_heap_cans', 'junk_heap_bags', 'crate']),
  dump_burner_row: S('pillars', 'thermal_plant', 0xe06a3a, 0xb09c88, ['mech_turbine', 'factory_pipe', 'barrel', 'junk_heap_scrap']),
  dump_tire_valley: S('piles', 'acid_basin', 0x8a8a5a, 0xa8a694, ['tire_pile', 'tire_pile', 'junk_heap_bags', 'weed']),
  dump_scrap_flat: S('flats', 'coal_mine', 0xb8a060, 0xb0a894, ['junk_heap_scrap', 'rebar_pile', 'mech_servo_arm', 'hull_plate']),
  dump_press: S('press', 'robot_factory', 0xd08040, 0xaea494, ['hydraulic_press', 'mech_clamp', 'junk_heap_scrap', 'rebar_pile']),
  dump_shelter: S('flats', 'coal_mine', 0xd0a050, 0xb2a896, ['campfire', 'crate', 'barrel', 'workbench']),
  dump_pit: S('basin', 'acid_basin', 0xa8d05a, 0xa8ae96, ['junk_heap', 'barrel', 'puddle_toxic', 'rebar_pile']),
  dump_mountain: S('tiers', 'coal_mine', 0xc0a050, 0xb2a98e, ['junk_heap_scrap', 'junk_heap_bags', 'container_small', 'rebar_pile']),
  dump_crane: S('catwalk', 'robot_factory', 0xd0b040, 0xaea894, ['crane_hook', 'cargo_net', 'container_small', 'mech_rail']),
  dump_core: S('shaft', 'nuclear_plant', 0x5ad0c0, 0x9ea89e, ['antenna', 'generator', 'rebar_pile', 'mech_console']),
  dump_gate: S('gate', 'military_base', 0xc0a060, 0xb0a892, ['fence', 'sandbag', 'barrel', 'military_crate']),
  dump_leachate: S('basin', 'acid_basin', 0x9ac05a, 0xa4a894, ['puddle_toxic', 'barrel', 'silt_mound', 'mech_valve']),
  dump_windrow: S('piles', 'acid_basin', 0xb8a05a, 0xaea690, ['junk_heap_plastic', 'junk_heap_bags', 'torn_flag', 'weed']),
  dump_compost: S('piles', 'acid_basin', 0xa8a05a, 0xaaa892, ['junk_heap_bags', 'silt_mound', 'weed', 'moss_rock']),
  dump_radio: S('shaft', 'radiation_zone', 0x6ad0e0, 0xa2aa9e, ['reactor_core', 'barrel', 'skeleton_human', 'satellite_dish']),
  dump_underpass: S('deck', 'highway', 0xb0a06a, 0xaaa692, ['rebar_pile', 'junk_heap_scrap', 'container_small', 'streetlight']),
  dump_edge: S('flats', 'military_base', 0xc0b070, 0xb4ac94, ['fence', 'container_small', 'junk_heap_bags', 'sandbag']),

  // ======================================================= 废弃地铁（16）
  metro_platform: S('benches', 'shadow_labyrinth', 0x53c8c0, 0xa6a8a8, ['metro_sign', 'turnstile', 'mech_rail', 'sofa']),
  metro_turnstile: S('gate', 'prison', 0x53a8c0, 0xa4a6a8, ['turnstile', 'mech_console', 'tv']),
  metro_shelter: S('flats', 'shadow_labyrinth', 0x53c8c0, 0xa8aaa8, ['campfire', 'crate', 'workbench', 'terminal']),
  metro_tunnel_a: S('arch', 'dense_fog', 0x5aa8b0, 0x9ea4a4, ['mech_rail', 'mech_cable_run', 'metro_sign', 'streetlight']),
  metro_flood: S('basin', 'abyss_swamp', 0x53a8a8, 0x9ea6a6, ['silt_mound', 'life_ring', 'mech_rail', 'puddle_toxic']),
  metro_escalator: S('ramp', 'shadow_labyrinth', 0x53c8d0, 0xa2a6a6, ['streetlight', 'mech_rail', 'mech_cable_run']),
  metro_signal: S('benches', 'substation', 0x5ac0e0, 0xa2a8ac, ['mech_console', 'server_rack', 'antenna', 'tv']),
  metro_crossing: S('bridge', 'dense_fog', 0x5aa8b0, 0x9fa5a4, ['metro_sign', 'mech_cable_run', 'mech_rail']),
  metro_car: S('train', 'shadow_labyrinth', 0x5a98b0, 0x9ea4a6, ['sofa', 'mech_rail', 'container_small', 'cargo_net']),
  metro_sump: S('shaft', 'abyss_swamp', 0x5ac0b0, 0x9ea6a4, ['mech_valve', 'silt_mound', 'life_ring', 'mech_turbine']),
  metro_vent: S('shaft', 'dense_fog', 0x5ac0d0, 0xa0a6a6, ['mech_turbine', 'mech_cable_run', 'streetlight']),
  metro_depot: S('train', 'drydock', 0x5a98c0, 0xa0a6aa, ['mech_rail', 'mech_servo_arm', 'workbench', 'mech_piston']),
  metro_arch: S('arch', 'shadow_labyrinth', 0x5ac0c0, 0xa2a8a6, ['metro_sign', 'mech_console', 'sofa', 'streetlight']),
  metro_deep: S('arch', 'dense_fog', 0x4a98a8, 0x989e9e, ['server_rack', 'mech_cable_run', 'lab_tank', 'mech_pipe_bundle']),
  metro_terminus: S('gate', 'prison', 0x5a98b0, 0xa0a4a6, ['metro_sign', 'turnstile', 'fence', 'sofa']),
  metro_gate: S('gate', 'military_base', 0x5ac0b0, 0xa4a8a4, ['turnstile', 'military_crate', 'sandbag', 'fence']),

  // ======================================================= 坍塌医院（16）
  hospital_lobby: S('benches', 'rescue_center', 0x9ad0c0, 0xbcbeb8, ['hospital_bed', 'sofa', 'vending_machine', 'mech_console']),
  hospital_triage: S('shelves', 'rescue_center', 0x8ac8b8, 0xb8bcb6, ['hospital_bed', 'workbench', 'mech_console', 'gurney']),
  hospital_shelter: S('flats', 'rescue_center', 0x9ad0c0, 0xbabcba, ['campfire', 'crate', 'workbench', 'terminal']),
  hospital_ward_a: S('benches', 'rescue_center', 0x9ac8c0, 0xbabeba, ['hospital_bed', 'gurney', 'stretcher', 'ivy']),
  hospital_stair: S('spiral', 'school', 0x9ac0c0, 0xb4b6b4, ['rebar_pile', 'hospital_bed', 'mech_cable_run']),
  hospital_surgery: S('ring', 'virus_lab', 0x8ad0d0, 0xb6bcbc, ['gurney', 'stretcher', 'lab_tank', 'mech_console']),
  hospital_pharmacy: S('shelves', 'library', 0x9ad0a0, 0xb8bcb2, ['library_shelf', 'workbench', 'mech_console', 'vending_machine']),
  hospital_morgue: S('pillars', 'vampire_lair', 0x90a0b0, 0xaeb0b2, ['hospital_bed', 'gurney', 'shadow_veil', 'corpse']),
  hospital_atrium: S('ring', 'rescue_center', 0x9ac8d0, 0xb6bab8, ['hospital_bed', 'sofa', 'lunar_flower', 'mech_console']),
  hospital_xray: S('pillars', 'virus_lab', 0x90b0d0, 0xb0b4b8, ['lab_tank', 'mech_console', 'gurney', 'shadow_veil']),
  hospital_icu: S('benches', 'rescue_center', 0x8ad0c0, 0xb8bcba, ['hospital_bed', 'mech_console', 'gurney', 'ivy']),
  hospital_corridor: S('partitions', 'school', 0x9ac8c0, 0xb8bab6, ['hospital_bed', 'streetlight', 'gurney', 'ivy']),
  hospital_lab: S('shelves', 'virus_lab', 0x8ad0a0, 0xb4bab4, ['lab_tank', 'mech_console', 'workbench', 'barrel']),
  hospital_boiler: S('tiers', 'thermal_plant', 0x9ab0a0, 0xb0b2ac, ['mech_turbine', 'factory_pipe', 'mech_valve', 'rebar_pile']),
  hospital_roof: S('rooftops', 'rescue_center', 0x9ac8d0, 0xb6bab8, ['rebar_pile', 'hospital_bed', 'antenna', 'rubble_small']),
  hospital_gate: S('gate', 'military_base', 0x9ac0b0, 0xb8b8b0, ['hospital_bed', 'military_crate', 'fence', 'sandbag']),

  // ======================================================= 淤塞港口（16）
  port_dock: S('bridge', 'dock', 0x6ac0d0, 0xacb4b4, ['crate', 'cargo_net', 'container_small', 'life_ring', 'crane_hook']),
  port_shelter: S('flats', 'dock', 0x6ac0d0, 0xaeb4b2, ['campfire', 'crate', 'workbench', 'cargo_net']),
  port_silt: S('flats', 'grey_harbor', 0x6aa8b0, 0xaab0ac, ['silt_mound', 'life_ring', 'cargo_net', 'weed']),
  port_warehouse: S('shelves', 'dock', 0x6ab0c0, 0xaab0aa, ['crate', 'container_small', 'cargo_net', 'library_shelf']),
  port_crane: S('catwalk', 'dock', 0x6ac0e0, 0xacb2b0, ['crane_hook', 'cargo_net', 'container_small', 'mech_rail']),
  port_lighthouse: S('spiral', 'lighthouse', 0x8ad0e0, 0xacb4b8, ['beacon_lamp', 'beacon', 'antenna', 'workbench']),
  port_hull: S('piles', 'shipyard', 0x6aa8c0, 0xa6aeae, ['hull_plate', 'life_ring', 'cargo_net', 'ship_frame']),
  port_container_yard: S('piles', 'dock', 0x6ac0b0, 0xa8b0ac, ['container_small', 'cargo_net', 'crate', 'mech_clamp']),
  port_fishmarket: S('stalls', 'dock', 0x6ab0b0, 0xacb2ae, ['crate', 'barrel', 'workbench', 'cargo_net']),
  port_fuel: S('tiers', 'grey_harbor', 0x6aa0a8, 0xa8aeac, ['barrel', 'mech_valve', 'factory_pipe', 'mech_pipe_bundle']),
  port_customs: S('gate', 'rescue_center', 0x6ab0c0, 0xaeb2ae, ['workbench', 'mech_console', 'crate', 'military_crate']),
  port_breakwater: S('piles', 'grey_harbor', 0x6a98a0, 0xacb0ac, ['silt_mound', 'beacon', 'life_ring', 'cargo_net']),
  port_slipway: S('ramp', 'drydock', 0x6aa8b8, 0xaab0ae, ['ship_frame', 'hull_plate', 'mech_pipe_bundle', 'mech_cable_run']),
  port_radio: S('spiral', 'lighthouse', 0x8ad0d0, 0xacb2b4, ['antenna', 'satellite_dish', 'mech_cable_run', 'beacon']),
  port_anchor: S('basin', 'grey_harbor', 0x6aa8c0, 0xaab0b0, ['cargo_net', 'life_ring', 'silt_mound', 'crane_hook']),
  port_gate: S('gate', 'military_base', 0x6ab0c0, 0xacb2ae, ['container_small', 'military_crate', 'fence', 'sandbag']),

  // ======================================================= 边境 / 旧城 / 地底 / 雾海
  frontier_shelter: S('flats', 'highway', 0xc8a060, 0xb8b09c, ['campfire', 'crate', 'workbench', 'sandbag']),

  oldtown_shelter: S('flats', 'highway', 0xd0a060, 0xb8b0a0, ['campfire', 'crate', 'workbench', 'terminal']),
  oldtown_post: S('shelves', 'library', 0xc8a060, 0xb4ae9e, ['library_shelf', 'workbench', 'paper_trash', 'mech_console']),
  oldtown_cinema: S('benches', 'stadium', 0xd05060, 0xaea29a, ['sofa', 'tv', 'torn_flag', 'mech_console']),
  oldtown_gate: S('gate', 'military_base', 0xc8a060, 0xb6ae9c, ['fence', 'military_crate', 'sandbag', 'streetlight']),

  underworld_shelter: S('flats', 'bunker', 0x6ad0c0, 0xa2a8a4, ['campfire', 'crate', 'workbench', 'terminal']),
  underworld_vent: S('shaft', 'dense_fog', 0x6ac0c0, 0xa2a8a8, ['mech_turbine', 'mech_cable_run', 'streetlight', 'mech_valve']),
  underworld_drain: S('basin', 'abyss_swamp', 0x6aa0a0, 0x9ea4a2, ['silt_mound', 'mech_valve', 'mech_pipe_bundle', 'puddle_toxic']),
  underworld_lift: S('shaft', 'substation', 0x6ac0e0, 0xa2a6a8, ['mech_cable_run', 'mech_console', 'generator', 'mech_rail']),
  underworld_scrapyard: S('piles', 'coal_mine', 0x6ac0b0, 0xa4a89e, ['junk_heap_scrap', 'rebar_pile', 'mech_clamp', 'container_small']),
  underworld_repair: S('shelves', 'robot_factory', 0x6ac0c0, 0xa2a6a2, ['mech_servo_arm', 'workbench', 'mech_piston', 'mech_rail']),

  mist_shelter: S('flats', 'grey_harbor', 0x8ab0c0, 0xa8aeae, ['campfire', 'crate', 'workbench', 'beacon_lamp'], { fog: 1.1 }),
  mist_road: S('flats', 'dense_fog', 0x8ab0b0, 0xa8aeac, ['streetlight', 'car_wreck', 'fence', 'rubble_small'], { fog: 1.0 }),
  mist_saltflat: S('flats', 'acid_basin', 0x9ab0b0, 0xb0b4b0, ['silt_mound', 'weed', 'bone_scatter', 'crack_ground'], { fog: 0.8 }),
  mist_brokenbridge: S('bridge', 'bridge', 0x8aa0b0, 0xa6acac, ['rebar_pile', 'hull_plate', 'cargo_net', 'fence'], { fog: 0.9 }),
  mist_observatory: S('spiral', 'lighthouse', 0x8ab0d0, 0xacb2b6, ['beacon_lamp', 'mech_console', 'antenna', 'satellite_dish'], { fog: 0.9 }),
  mist_wreck: S('piles', 'shipyard', 0x8aa0b0, 0xa6acae, ['hull_plate', 'ship_frame', 'cargo_net', 'life_ring'], { fog: 0.9 }),
  mist_trail: S('trees', 'withered_forest', 0x8aa080, 0xaab0a4, ['tree_dead', 'weed', 'ivy', 'grave'], { fog: 1.15 }),
}

// 室内关卡：背景换成建筑内部（顶棚/墙板/窗格），而不是露天街景
// 只收录真正「在屋里」的房间；高架下、市场、楼顶、灯塔、海关、观测站等
// 露天场景保留各自的地标背景（painter），否则会被同一套室内墙抹平。
export const INDOOR = new Set([
  'city_school', 'city_clinic', 'city_shelter', 'city_parking',
  'village_henhouse', 'village_mill', 'village_shed', 'village_house', 'village_barn',
  'village_chapel', 'village_kiln', 'village_shelter',
  'factory_boiler', 'factory_chem', 'factory_machine', 'factory_paint',
  'factory_shelter', 'factory_line', 'factory_hall', 'factory_furnace', 'factory_control',
  'factory_power', 'factory_lab',
  'dump_sortline', 'dump_shelter',
  'metro_platform', 'metro_turnstile', 'metro_shelter', 'metro_tunnel_a', 'metro_flood',
  'metro_escalator', 'metro_signal', 'metro_crossing', 'metro_car', 'metro_sump',
  'metro_vent', 'metro_depot', 'metro_arch', 'metro_deep', 'metro_terminus', 'metro_gate',
  'hospital_lobby', 'hospital_triage', 'hospital_shelter', 'hospital_ward_a', 'hospital_stair',
  'hospital_surgery', 'hospital_pharmacy', 'hospital_morgue', 'hospital_atrium', 'hospital_xray',
  'hospital_icu', 'hospital_corridor', 'hospital_lab', 'hospital_boiler',
  'port_shelter', 'port_warehouse', 'port_fishmarket',
  'frontier_shelter',
  'oldtown_shelter', 'oldtown_post', 'oldtown_cinema',
  'underworld_shelter', 'underworld_vent', 'underworld_drain', 'underworld_lift',
  'underworld_scrapyard', 'underworld_repair',
  'mist_shelter',
])

for (const id of Object.keys(SCENES)) {
  if (INDOOR.has(id)) SCENES[id].indoor = true
}

export function getRoomScene(roomId) {
  return SCENES[roomId] || null
}
