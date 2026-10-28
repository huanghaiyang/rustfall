// 区域拓扑：7 区 = 4 老区（各 18 房）+ 3 新区（各 16 房）= 120 间房
//
// 世界线（一条闭合长链，port_gate 通回 city 的入口房）：
//   city → village → factory → dump → metro → hospital → port → (city)
//
// 老 4 区保留原来 6 间房的 id 与它们之间的门链（任务 / 营救 / 地标都引用这些 id）：
//   每区 18 = 6 间「西侧外围」+ 老 6 间（相对顺序与互相之间的门不变）+ 6 间「东侧外围」。
//   city 老链：city_shelter → city_street → city_plaza → city_slum → city_tower → city_gate
//   village 老链：village_shelter → village_field → village_house → village_well → village_barn → village_gate
//   factory 老链：factory_shelter → factory_line → factory_hall → factory_furnace → factory_control → factory_gate
//   dump 老链：dump_shelter → dump_pit → dump_mountain → dump_crane → dump_core → dump_gate
//
// 房间尺寸：w 96~160，h 44~68。门链由 order 数组自动生成，首尾相接。

import { THEME_LIST } from './themes.js'

/** 一行描述一间房（builder 会补 biome/region/exits/monsterCount/lootDensity） */
function R(id, label, kind, variant, w, h, seed, extra = {}) {
  return { id, label, kind, variant, w, h, seed, ...extra }
}

// =====================================================================
// 锈城废墟（18）
// =====================================================================
const CITY_ROOMS = [
  // —— 西侧外围（进入锈城前的废墟带）——
  R('city_underpass', '高架下', 'standard', 'street', 108, 50, 0x1a01c3, { notes: '高架把天遮住一半，桥墩下面堆着十几年的垃圾。' }),
  R('city_market', '塌市场', 'arena', 'plaza', 128, 56, 0x1a02d7, { notes: '菜市场的棚顶整片塌下来，称还挂在柱子上。' }),
  R('city_school', '第八小学', 'standard', 'slum', 116, 52, 0x1a03e9, { notes: '走廊两侧的教室门都开着，黑板上留着没擦完的字。' }),
  R('city_clinic', '社区诊所', 'standard', 'street', 104, 48, 0x1a04f1, { notes: '候诊椅排得整整齐齐，叫号屏还停在 47 号。' }),
  R('city_busstop', '公交总站', 'standard', 'street', 112, 50, 0x1a050b, { notes: '站牌下的雨棚还在，下面全是烧过的轮胎。' }),
  R('city_roofway', '屋顶道', 'arena', 'tower', 96, 62, 0x1a0617, { notes: '从这栋楼顶能走到那栋，中间只隔着几块塌下来的楼板。' }),
  // —— 老 6 间（id / 门链不得改动）——
  R('city_shelter', '锈城营地', 'shelter', 'shelter', 120, 52, 0x1c0a31, {
    shelterSide: 'left',
    notes: '半塌的银行大厅改的营地。火盆靠着柜台，柜台上还留着防弹玻璃的框。',
  }),
  R('city_street', '断街', 'standard', 'street', 132, 54, 0x2d52b7, { notes: '街面被雨水沟切开，中间一段高架塌了半截，正好当桥。' }),
  R('city_plaza', '中庭广场', 'arena', 'plaza', 140, 58, 0x3ab9c4, {
    landmark: 'generator_city',
    notes: '写字楼中庭。发电机就架在干涸的喷泉池里，看台一层层塌下来围成一圈。',
  }),
  R('city_slum', '棚户区', 'standard', 'slum', 124, 54, 0x4f18e2, {
    cage: { id: 'cage_huique', rescueQuest: 'rescue_huique' },
    notes: '铁皮和楼板搭出来的窄巷。有个笼子焊在承重柱上，里面还有人。',
  }),
  R('city_tower', '锈塔', 'arena', 'tower', 108, 66, 0x5b7d09, {
    landmark: 'relay_a',
    notes: '写字楼的核心筒，五层楼板全塌成了错开的台阶。中继站架在最上面。',
  }),
  R('city_gate', '东闸', 'gate', 'gate', 116, 50, 0x6e2c55, { notes: '绕城高架的断口。闸门早就不通电了，但还立着。' }),
  // —— 东侧外围（出城，往枯穗村方向）——
  R('city_ringroad', '环路', 'standard', 'street', 136, 54, 0x1a0721, { notes: '匝道绕了一圈又一圈，护栏全被撞平了。' }),
  R('city_billboard', '广告牌阵', 'standard', 'plaza', 128, 56, 0x1a082f, { notes: '十几块广告牌的钢架立着，布面早被风撕没了。' }),
  R('city_parking', '地下停车场', 'arena', 'slum', 120, 58, 0x1a093d, { notes: '坡道下去是黑的，车停得整整齐齐，一辆都没开出去。' }),
  R('city_metro_mouth', '地铁口', 'standard', 'street', 112, 52, 0x1a0a4b, { notes: '出入口朝上张着嘴，扶梯早就不动了，井底有水声。' }),
  R('city_depot_row', '仓库排', 'standard', 'street', 132, 52, 0x1a0b59, { notes: '一排卷帘门，只有两扇是开的。' }),
  R('city_border', '城界', 'arena', 'gate', 124, 56, 0x1a0c67, { notes: '收费站的水泥顶塌了一半，再往外就是田了。' }),
]

// =====================================================================
// 枯穗村（18）
// =====================================================================
const VILLAGE_ROOMS = [
  R('village_henhouse', '鸡舍', 'standard', 'field', 100, 46, 0x2b01a1, { notes: '铁丝网里全是羽毛和碎蛋壳，鸡早就没了。' }),
  R('village_mill', '磨坊', 'arena', 'house', 120, 56, 0x2b02b3, { notes: '石磨还在，皮带上挂着一层灰。' }),
  R('village_orchard', '果园', 'standard', 'field', 140, 50, 0x2b03c5, { notes: '果树全成了黑桩子，一棵一棵排到坡下。' }),
  R('village_pond', '池塘', 'standard', 'well', 112, 48, 0x2b04d7, { notes: '塘底裂成龟壳，中间还剩一汪绿汤。' }),
  R('village_shed', '柴棚', 'standard', 'field', 104, 46, 0x2b05e9, { notes: '柴劈了一半，斧头还在墩子上。' }),
  R('village_bridge', '石桥', 'standard', 'field', 120, 50, 0x2b06f1, { notes: '桥面塌了个洞，能看见底下的干河床。' }),
  // —— 老 6 间 ——
  R('village_shelter', '村口灶屋', 'shelter', 'shelter', 116, 50, 0x7183ac, {
    shelterSide: 'left',
    notes: '灶屋的屋顶塌了一半，灶台还能生火。摇篮被搬到最里面的角落。',
  }),
  R('village_field', '龟裂农田', 'standard', 'field', 150, 52, 0x82be41, { notes: '垄沟被雨水冲成了浅沟，麦秆全倒了，踩上去会响。' }),
  R('village_house', '斜屋', 'arena', 'house', 128, 58, 0x93d0f8, { notes: '两层小楼斜着陷进地里，楼板成了坡，家具全滑到低的那一头。' }),
  R('village_well', '枯井', 'standard', 'well', 120, 54, 0xa41f6d, {
    landmark: 'relay_b',
    notes: '井绳断了，井底有水。中继站被架在井台边，天线指着一片黄天。',
  }),
  R('village_barn', '塌谷仓', 'arena', 'barn', 144, 60, 0xb5c372, {
    landmark: 'generator_village',
    notes: '谷仓的墙倒了一面，三道横梁还横在头顶。发电机被拖进来，接在一台脱粒机上。',
  }),
  R('village_gate', '田埂尽头', 'gate', 'gate', 112, 48, 0xc6e8b3, { notes: '篱笆到这里就断了，前面是工厂排出来的黑水沟。' }),
  // —— 东侧外围 ——
  R('village_hollow', '洼地', 'standard', 'field', 136, 52, 0x2b071d, { notes: '整片地陷下去两米，积着一层黏土色的水。' }),
  R('village_chapel', '小教堂', 'arena', 'house', 120, 58, 0x2b082b, { notes: '长椅倒了一半，彩窗只剩铁框。' }),
  R('village_kiln', '砖窑', 'standard', 'barn', 132, 56, 0x2b0939, { notes: '窑门塌了，里面码着的砖还是热的。' }),
  R('village_graveyard', '坟地', 'standard', 'field', 124, 50, 0x2b0a47, { notes: '木牌一片一片歪着，看不出名字。' }),
  R('village_wellfield', '井田', 'standard', 'well', 116, 48, 0x2b0b55, { notes: '田中间打了七口小井，六口干着。' }),
  R('village_ridge', '山脊', 'arena', 'field', 142, 54, 0x2b0c63, { notes: '风从这道脊上过去，能看见工厂的烟。' }),
]

// =====================================================================
// 熔渣工厂（18）
// =====================================================================
const FACTORY_ROOMS = [
  R('factory_intake', '进料口', 'standard', 'line', 116, 54, 0x3c01a5, { notes: '传送带从这里进去，上面什么也没送。' }),
  R('factory_boiler', '锅炉房', 'arena', 'hall', 130, 62, 0x3c02b7, { notes: '三台锅炉并排躺着，压力表全指到零以下。' }),
  R('factory_chem', '化学品间', 'standard', 'control', 108, 50, 0x3c03c9, { notes: '架子上的瓶子按颜色排过，只剩三个是满的。' }),
  R('factory_machine', '机加车间', 'standard', 'line', 138, 56, 0x3c04d1, { notes: '车床还在，夹具上卡着半截没做完的轴。' }),
  R('factory_paint', '喷漆线', 'standard', 'line', 126, 52, 0x3c05e3, { notes: '整条线还是橙色的，地面积了半指厚的漆皮。' }),
  R('factory_scrap_yard', '废料场', 'standard', 'line', 140, 54, 0x3c06f5, { notes: '压成方块的废钢码到顶，边角还在渗水。' }),
  // —— 老 6 间 ——
  R('factory_shelter', '值班室', 'shelter', 'shelter', 118, 52, 0xd7394e, {
    shelterSide: 'right',
    notes: '值班室的行军床还在，墙上贴着排班表，最后一天的格子空着。',
  }),
  R('factory_line', '流水线', 'standard', 'line', 148, 56, 0xe84710, { notes: '传送带还在转，只是上面运的是空箱。头顶四根管道从这头穿到那头。' }),
  R('factory_hall', '铸造主厅', 'arena', 'hall', 160, 64, 0xf92588, {
    landmark: 'generator_factory',
    notes: '厂房高得看不到顶。检修走道一圈圈挂着，发电机接在主母线上。',
  }),
  R('factory_furnace', '熔炉坑', 'standard', 'furnace', 138, 62, 0x10aa3c, {
    cage: { id: 'cage_tiezhua', rescueQuest: 'rescue_tiezhua' },
    notes: '出渣口下面是个坑。坑底积着绿色的水，热气一阵阵往上冒。铁爪被关在坑边的笼子里。',
  }),
  R('factory_control', '控制室', 'arena', 'control', 126, 58, 0x11b6d1, {
    landmark: 'relay_c',
    notes: '一整排屏幕全黑着，只有一台还亮。中继站被拆下来架在舱体外壳上。',
  }),
  R('factory_gate', '排渣闸', 'gate', 'gate', 114, 50, 0x12c2e7, { notes: '排渣闸的闸板升到一半就卡住了，底下那道槽通向倾倒场。' }),
  // —— 东侧外围 ——
  R('factory_power', '配电房', 'arena', 'control', 120, 58, 0x3c070d, { notes: '配电柜一排一排，被撬开的那台还冒过火花。' }),
  R('factory_lab', '化验室', 'standard', 'control', 112, 52, 0x3c081b, { notes: '操作台上摆着滴管架，试管里剩的东西已经结晶。' }),
  R('factory_coolant', '冷却池', 'standard', 'furnace', 130, 56, 0x3c0929, { notes: '池子里的水是温的，表面浮着一层白汽。' }),
  R('factory_rail', '货运轨道', 'standard', 'line', 144, 54, 0x3c0a37, { notes: '两条铁轨从厂房里伸出去，尽头是一节翻倒的车皮。' }),
  R('factory_silo', '料仓', 'arena', 'hall', 136, 60, 0x3c0b45, { notes: '四个圆筒料仓立着，第三个裂了，里面的颗粒结成了柱。' }),
  R('factory_outfall', '排污口', 'standard', 'gate', 122, 54, 0x3c0c53, { notes: '水泥管口比人高，黑水早就干了，只剩一层壳。' }),
]

// =====================================================================
// 倾倒深坑（18）
// =====================================================================
const DUMP_ROOMS = [
  R('dump_gateway', '入口坡道', 'standard', 'mountain', 118, 52, 0x4d01a9, { notes: '垃圾车从这里倒下去，坡道两边全是滑下来的碎料。' }),
  R('dump_sortline', '分拣线', 'standard', 'crane', 134, 54, 0x4d02bb, { notes: '一条窄传送带，分拣台前还站着人形的东西。' }),
  R('dump_burner_row', '焚烧炉排', 'arena', 'pit', 128, 58, 0x4d03cd, { notes: '六个焚烧炉排成一排，只有第三个还在冒烟。' }),
  R('dump_tire_valley', '轮胎谷', 'standard', 'mountain', 140, 56, 0x4d04df, { notes: '轮胎堆成了山谷，踩上去是软的，会往下陷。' }),
  R('dump_scrap_flat', '废钢平场', 'standard', 'mountain', 146, 54, 0x4d05e1, { notes: '压平的钢皮铺了一大片，走上去哐哐响。' }),
  R('dump_press', '压块机', 'standard', 'crane', 120, 56, 0x4d06f3, { notes: '压块机的模具里还卡着一整块压了一半的东西。' }),
  // —— 老 6 间 ——
  R('dump_shelter', '守夜棚', 'shelter', 'shelter', 114, 50, 0x13d4a2, {
    shelterSide: 'left',
    notes: '拿集装箱改的守夜棚，铁皮上焊了一圈防爬刺。棚外全是垃圾。',
  }),
  R('dump_pit', '焚烧坑', 'standard', 'pit', 132, 58, 0x14e6b8, {
    landmark: 'generator_dump',
    cage: { id: 'cage_k9', rescueQuest: 'rescue_k9' },
    notes: '坑里的垃圾一直在阴燃，绿烟整天不散。K-9 被锁在坑边的笼子里，发电机就在旁边。',
  }),
  R('dump_mountain', '垃圾山', 'arena', 'mountain', 148, 60, 0x15f7c9, { notes: '整座山是一层一层倒出来的，每一步都是踩实的旧报纸和铁皮。' }),
  R('dump_crane', '吊车轨道', 'standard', 'crane', 138, 62, 0x1608d5, { notes: '龙门吊停在半路，轨道横跨整个坑。吊钩下面挂着的集装箱里还有东西。' }),
  R('dump_core', '深核', 'arena', 'core', 126, 62, 0x1719e4, {
    landmark: 'antenna_signal',
    notes: '山坡正中塌出一个洞，一路往下。天线从这里指向天空，信号就是打这儿发出去的。',
  }),
  R('dump_gate', '界桩', 'gate', 'gate', 112, 50, 0x182a0f, { notes: '一根歪掉的水泥界桩，再往外是没被标过图的荒地。' }),
  // —— 东侧外围 ——
  R('dump_leachate', '渗滤池', 'standard', 'pit', 130, 56, 0x4d070b, { notes: '黑水从垃圾底下渗出来，在池子里积成一层油。' }),
  R('dump_windrow', '风选带', 'standard', 'mountain', 136, 52, 0x4d0819, { notes: '风把轻的吹到一边，重的留在中间，堆出一条直脊。' }),
  R('dump_compost', '堆肥区', 'arena', 'mountain', 128, 54, 0x4d0927, { notes: '这一片是热过的，到现在还温着，长出一层白毛。' }),
  R('dump_radio', '辐射区', 'standard', 'core', 124, 58, 0x4d0a35, { notes: '盖革计数器在这里响得最密，废料堆的缝里透出蓝。' }),
  R('dump_underpass', '垃圾下穿', 'standard', 'crane', 132, 52, 0x4d0b43, { notes: '一条被垃圾压出来的通道，从底下能钻到山的另一边。' }),
  R('dump_edge', '边缘', 'arena', 'gate', 126, 50, 0x4d0c51, { notes: '垃圾到这里就断了，再往外是一片被挖平的空地。' }),
]

// =====================================================================
// 废弃地铁（16）
// =====================================================================
const METRO_ROOMS = [
  R('metro_platform', '站台', 'standard', 'platform', 148, 56, 0x5e01a1, { notes: '站台比轨道高一层，屏蔽门只剩框。' }),
  R('metro_turnstile', '闸机厅', 'standard', 'platform', 120, 50, 0x5e02b3, { notes: '闸机还立着，票口里卡着一张过期的票。' }),
  R('metro_shelter', '值班室', 'shelter', 'shelter', 112, 48, 0x5e03c5, {
    shelterSide: 'left',
    notes: '站长室的玻璃隔断裂了，桌上还摊着一张线路图，被水泡得起皱。',
  }),
  R('metro_tunnel_a', '一号隧道', 'standard', 'tunnel', 156, 52, 0x5e04d7, { notes: '隧道一眼看不到头，轨道上积着半尺厚的灰。' }),
  R('metro_flood', '积水段', 'standard', 'flood', 144, 54, 0x5e05e9, { notes: '这一段塌了顶，雨水灌下来，把轨道泡成了水渠。' }),
  R('metro_escalator', '扶梯', 'standard', 'escalator', 124, 60, 0x5e06f1, { notes: '扶梯的踏板全锈死了，一节一节像台阶。' }),
  R('metro_signal', '信号室', 'arena', 'signal', 130, 58, 0x5e070d, {
    landmark: 'relay_d',
    notes: '信号机和线路板挂了一墙，中继站还接着电。',
  }),
  R('metro_crossing', '换乘通道', 'standard', 'tunnel', 152, 54, 0x5e081b, { notes: '两条线在这里交叉，通道顶上的指示牌掉了一半。' }),
  R('metro_car', '车厢段', 'standard', 'tunnel', 136, 50, 0x5e0929, { notes: '两节车厢斜插在隧道里，门是开的。' }),
  R('metro_sump', '集水井', 'standard', 'flood', 118, 56, 0x5e0a37, { notes: '泵房的水泵停了，井里能照见自己的脸。' }),
  R('metro_vent', '通风井', 'arena', 'escalator', 110, 62, 0x5e0b45, { notes: '竖井一直通到地面，风从上面下来，带着雨腥味。' }),
  R('metro_depot', '车库', 'arena', 'depot', 150, 58, 0x5e0c53, { notes: '检修沟一条条排着，车没回来。' }),
  R('metro_arch', '拱顶大厅', 'arena', 'signal', 146, 64, 0x5e0d65, { notes: '拱顶高得看不见，吊灯掉下来了，砸出一个坑。' }),
  R('metro_deep', '深层隧道', 'standard', 'tunnel', 158, 54, 0x5e0e77, { notes: '越往里越热，墙缝里有水在渗。' }),
  R('metro_terminus', '终点站', 'standard', 'platform', 138, 56, 0x5e0f89, { notes: '轨道在这里到头，尽头是一堵封死的砖墙。' }),
  R('metro_gate', '区界', 'gate', 'gate', 116, 50, 0x5e10a1, { notes: '出了这道闸，就是医院那片的地基。' }),
]

// =====================================================================
// 坍塌医院（16）
// =====================================================================
const HOSPITAL_ROOMS = [
  R('hospital_lobby', '门厅', 'standard', 'gate', 130, 56, 0x6f01a3, { notes: '挂号窗口的玻璃全碎了，号码机还夹着一张 47 号。' }),
  R('hospital_triage', '分诊台', 'standard', 'ward', 118, 52, 0x6f02b5, { notes: '分诊台后面的白板上写着三行字，最后一行划掉了。' }),
  R('hospital_shelter', '护士站', 'shelter', 'shelter', 116, 50, 0x6f03c7, {
    shelterSide: 'right',
    notes: '护士站的柜子被清空过，只剩一沓没写完的护理记录。',
  }),
  R('hospital_ward_a', '甲病房', 'standard', 'ward', 146, 54, 0x6f04d9, { notes: '六张床排成两列，帘子全拉着，看不出哪张床上有人。' }),
  R('hospital_stair', '楼梯井', 'standard', 'stairwell', 112, 64, 0x6f05e1, { notes: '楼梯从中间断下去，扶手还挂在半空。' }),
  R('hospital_surgery', '手术室', 'arena', 'surgery', 132, 58, 0x6f06f3, { notes: '手术灯歪着，无影灯罩里积了水。' }),
  R('hospital_pharmacy', '药房', 'standard', 'pharmacy', 124, 54, 0x6f0705, { notes: '药架一格一格排过去，抽屉全被拉出来过。' }),
  R('hospital_morgue', '太平间', 'standard', 'morgue', 120, 52, 0x6f0817, { notes: '不锈钢抽屉一共二十四个，四个是开的。' }),
  R('hospital_atrium', '中庭', 'arena', 'atrium', 152, 66, 0x6f0929, {
    landmark: 'generator_hospital',
    notes: '中庭从顶塌到底，环形走廊一层层断在半空。发电机被架在塌下来的平台上。',
  }),
  R('hospital_xray', '放射科', 'standard', 'surgery', 118, 54, 0x6f0a3b, { notes: '铅门是开着的，暗室里还挂着没冲的片子。' }),
  R('hospital_icu', '重症室', 'standard', 'ward', 138, 56, 0x6f0b4d, { notes: '呼吸机一排排停着，管子垂到地上。' }),
  R('hospital_corridor', '长廊', 'standard', 'ward', 154, 52, 0x6f0c5f, { notes: '走廊长得看不到头，每隔十步一盏灯还亮着。' }),
  R('hospital_lab', '化验室', 'standard', 'pharmacy', 122, 54, 0x6f0d71, { notes: '离心机里还有一管没取出来的血。' }),
  R('hospital_boiler', '锅炉房', 'standard', 'stairwell', 126, 60, 0x6f0e83, { notes: '锅炉冷透了，煤堆上盖着一层白霜。' }),
  R('hospital_roof', '塌顶', 'arena', 'atrium', 142, 62, 0x6f0f95, { notes: '屋顶整个塌进来，雨水直接落到三楼的地板上。' }),
  R('hospital_gate', '区界', 'gate', 'gate', 114, 50, 0x6f10a7, { notes: '医院的后门，门外是港口方向的泥地。' }),
]

// =====================================================================
// 淤塞港口（16）
// =====================================================================
const PORT_ROOMS = [
  R('port_dock', '码头', 'standard', 'dock', 150, 54, 0x7a01a5, { notes: '码头面比水面高六层，系缆桩上的缆绳还绷着。' }),
  R('port_shelter', '值班棚', 'shelter', 'shelter', 114, 50, 0x7a02b7, {
    shelterSide: 'left',
    notes: '港务值班棚，窗玻璃贴着胶带。潮气把墙皮整片顶了起来。',
  }),
  R('port_silt', '淤泥滩', 'standard', 'silt', 142, 52, 0x7a03c9, { notes: '水退下去以后留下的泥滩，一脚能陷到小腿。' }),
  R('port_warehouse', '仓库', 'arena', 'warehouse', 148, 60, 0x7a04db, { notes: '货架从地排到顶，中间只留一条能过人的道。' }),
  R('port_crane', '龙门吊', 'arena', 'crane', 138, 64, 0x7a05e3, { notes: '龙门吊停在半路，轨道横跨整个货场，钩子下面挂着半只柜。' }),
  R('port_lighthouse', '灯塔', 'arena', 'lighthouse', 108, 66, 0x7a06f5, {
    landmark: 'beacon_port',
    notes: '灯塔的螺旋梯断了几级，顶上的航标灯还在一明一灭。',
  }),
  R('port_hull', '搁浅船体', 'arena', 'hull', 144, 58, 0x7a070d, { notes: '一条货船斜插在泥里，船壳被撬开一个大口子。' }),
  R('port_container_yard', '货柜场', 'standard', 'warehouse', 152, 56, 0x7a081f, { notes: '集装箱堆成街区，编号漆得整整齐齐。' }),
  R('port_fishmarket', '鱼市', 'standard', 'dock', 134, 52, 0x7a0931, { notes: '水泥台子一排排，腥味还压在缝隙里。' }),
  R('port_fuel', '油料库', 'standard', 'warehouse', 128, 56, 0x7a0a43, { notes: '油罐横躺着，管口还在滴黑色的东西。' }),
  R('port_customs', '海关', 'standard', 'gate', 122, 52, 0x7a0b55, { notes: '报关大厅的窗口全封了，地上散着盖过章的纸。' }),
  R('port_breakwater', '防波堤', 'standard', 'silt', 146, 50, 0x7a0c67, { notes: '消波块堆到齐腰高，浪打上来在缝里炸开。' }),
  R('port_slipway', '船台', 'standard', 'hull', 136, 58, 0x7a0d79, { notes: '船台上还架着一副没造完的龙骨。' }),
  R('port_radio', '无线电塔', 'arena', 'lighthouse', 112, 64, 0x7a0e8b, { notes: '铁塔从塔身中间折过，上半截挂在缆线上。' }),
  R('port_anchor', '锚地', 'standard', 'dock', 140, 52, 0x7a0f9d, { notes: '几副锚链垂在水里，锚早不知道抓在哪儿。' }),
  R('port_gate', '区界', 'gate', 'gate', 118, 50, 0x7a10af, { notes: '港口的界门。门外的公路绕一圈，又通回锈城。' }),
]

// =====================================================================
// 边境残骸带（22 = 1 间驿站 + 21 个主题站点）
// 每间房用 spec.biome 复用已有生成器，spec.theme 让 game.getRoomData 注入
// 主题景物 / 专属怪池 / 站点 BOSS。
// =====================================================================

const FRONTIER_ROOMS = [
  R('frontier_shelter', '边境驿站', 'shelter', 'shelter', 118, 52, 0x8b01a1, {
    shelterSide: 'left',
    biome: 'city',
    notes: '一截水泥涵洞改的驿站，洞口焊着挡雨的檐板。墙上钉满别人留下的标记。',
  }),
  ...THEME_LIST.map((t, i) =>
    R(
      `frontier_${t.id}`,
      t.name,
      i % 3 === 1 ? 'standard' : 'arena',
      t.variant,
      t.w,
      t.h,
      (0x8b0200 + i * 0x1d3) | 0,
      { biome: t.biome, theme: t.id, notes: t.desc },
    ),
  ),
]

// =====================================================================
// 锈土旧城（16）—— 图书馆 / 学校 / 大学 / 纸厂 / 遗迹 / 监狱 / 旅馆 / 港区
// =====================================================================
const OLDTOWN_ROOMS = [
  R('oldtown_shelter', '旧城营地', 'shelter', 'shelter', 118, 52, 0x9a01a1, {
    shelterSide: 'left',
    biome: 'city',
    notes: '旧城消防站改的营地，卷帘门只拉下来一半，车库深处还停着一辆没轮子的消防车。',
  }),
  R('oldtown_post', '旧邮局', 'standard', 'street', 120, 52, 0x9a02b3, {
    biome: 'city',
    notes: '分拣格架从地排到顶，格子里塞着没人来取的信。柜台上的邮戳日期是同一个。',
  }),
  R('oldtown_library', '市立图书馆', 'arena', 'ward', 140, 58, 0x9a03c5, { biome: 'hospital', theme: 'library', notes: '还书箱满了，借阅证摊在桌上，日期停在同一场酸雨之前。' }),
  R('oldtown_school', '第九中学', 'standard', 'ward', 136, 56, 0x9a04d7, { biome: 'hospital', theme: 'school', notes: '黑板上最后一行板书没擦，值日表还挂在门后。' }),
  R('oldtown_university', '理工大学', 'arena', 'atrium', 148, 60, 0x9a05e9, { biome: 'hospital', theme: 'university', notes: '阶梯教室的椅子全朝一个方向，讲台上的录音机还在转。' }),
  R('oldtown_papermill', '造纸厂', 'standard', 'line', 150, 58, 0x9a06f1, { biome: 'factory', theme: 'paper_mill', notes: '纸浆池泛着灰白，烘干辊上还卷着一层没切完的纸。' }),
  R('oldtown_ruins', '考古遗迹', 'arena', 'pit', 146, 56, 0x9a070d, { biome: 'dump', theme: 'archaeological_site', notes: '探方一格一格排开，塑料标签被晒得发白。' }),
  R('oldtown_prison', '废弃监狱', 'arena', 'depot', 150, 60, 0x9a081b, { biome: 'metro', theme: 'prison', notes: '牢门全开着，操场的探照灯还慢慢转。' }),
  R('oldtown_hotel', '无人旅馆', 'standard', 'ward', 142, 58, 0x9a0929, { biome: 'hospital', theme: 'hotel', notes: '前台铃一按就响，钥匙架上的房间号全被翻成了 13。' }),
  R('oldtown_cinema', '旧电影院', 'standard', 'plaza', 134, 56, 0x9a0a37, { biome: 'city', notes: '银幕破了一个洞，放映机的胶片卡在同一格。' }),
  R('oldtown_dock', '旧码头', 'standard', 'dock', 152, 58, 0x9a0b45, { biome: 'port', theme: 'dock', notes: '系缆桩上缠着断绳，水面上漂着一层油。' }),
  R('oldtown_lighthouse', '断光灯塔', 'arena', 'lighthouse', 120, 62, 0x9a0c53, { biome: 'port', theme: 'lighthouse', notes: '透镜还转，光会在半途折回来。' }),
  R('oldtown_shipyard', '造船厂', 'arena', 'hull', 154, 60, 0x9a0d65, { biome: 'port', theme: 'shipyard', notes: '船骨焊到一半，焊缝一路延伸进墙里。' }),
  R('oldtown_drydock', '干船坞', 'standard', 'hull', 148, 58, 0x9a0e77, { biome: 'port', theme: 'drydock', notes: '闸门合着，坞底的水位却每天涨一指。' }),
  R('oldtown_substation', '变电站', 'arena', 'control', 132, 56, 0x9a0f89, { biome: 'factory', theme: 'substation', notes: '绝缘子还在冒蓝火，电表倒着走。' }),
  R('oldtown_gate', '旧城界门', 'gate', 'gate', 116, 50, 0x9a10a1, { biome: 'city', notes: '门楣上的旧城徽被酸雨蚀掉一半，门轴还能转动。' }),
]

// =====================================================================
// 地底深井（16）—— 堡垒 / 矿 / 电力 / 辐射 / 军械 / 朋克 / 暗影 / 城堡 / 血巢
// =====================================================================
const UNDERWORLD_ROOMS = [
  R('underworld_shelter', '地底驿站', 'shelter', 'shelter', 116, 50, 0x9b01a3, {
    shelterSide: 'right',
    biome: 'metro',
    notes: '竖井底部的检修平台，头顶能看见一小块天。墙角堆着别人留下的空水桶。',
  }),
  R('underworld_bunker', '地下堡垒', 'arena', 'depot', 146, 58, 0x9b02b5, { biome: 'metro', theme: 'bunker', notes: '防爆门内侧写着一句「里面还有人」，敲门声每隔七小时响一次。' }),
  R('underworld_coalmine', '煤矿厂', 'standard', 'pit', 150, 58, 0x9b03c7, { biome: 'dump', theme: 'coal_mine', notes: '矿车还在往上升，斗里的煤压着别的东西。' }),
  R('underworld_vent', '通风井', 'standard', 'escalator', 112, 62, 0x9b04d9, { biome: 'metro', notes: '竖井一直通到地面，风带着雨腥味灌下来。' }),
  R('underworld_drain', '排水渠', 'standard', 'flood', 144, 54, 0x9b05e1, { biome: 'metro', notes: '水在膝盖以下，渠壁上是一层滑腻的黑。' }),
  R('underworld_lift', '升降机', 'standard', 'control', 124, 60, 0x9b06f3, { biome: 'factory', notes: '货运升降机的钢缆还绷着，楼层指示停在 −7。' }),
  R('underworld_thermal', '火电厂', 'arena', 'furnace', 152, 60, 0x9b0705, { biome: 'factory', theme: 'thermal_plant', notes: '锅炉压力表停在红区，值夜班的记录本只剩一个「热」字。' }),
  R('underworld_nuclear', '核电厂', 'arena', 'hall', 154, 62, 0x9b0817, { biome: 'factory', theme: 'nuclear_plant', notes: '控制棒的刻度被人用粉笔画了箭头，指向「再深一点」。' }),
  R('underworld_radiation', '辐射区', 'standard', 'core', 150, 56, 0x9b0929, { biome: 'dump', theme: 'radiation_zone', notes: '废料堆的缝里透出蓝光，盖革计数器一直在响。' }),
  R('underworld_arsenal', '轰隆不停的兵工厂', 'arena', 'line', 152, 60, 0x9b0a3b, { biome: 'factory', theme: 'arsenal', notes: '流水线不停，弹壳落进筐里，盖住所有别的声音。' }),
  R('underworld_scrapyard', '废料仓', 'standard', 'mountain', 136, 54, 0x9b0b4d, { biome: 'dump', notes: '废料按牌号分堆，标签在潮气里烂成了纸浆。' }),
  R('underworld_repair', '维修巷道', 'standard', 'tunnel', 128, 52, 0x9b0c5f, { biome: 'metro', notes: '巷道两侧摆着拆到一半的机架，工具还插在螺丝上。' }),
  R('underworld_punk', '朋克机械', 'arena', 'line', 146, 58, 0x9b0d71, { biome: 'factory', theme: 'punk_mech', notes: '音箱堆成墙，鼓点自己响。' }),
  R('underworld_shadow', '暗影迷踪', 'standard', 'tunnel', 150, 60, 0x9b0e83, { biome: 'metro', theme: 'shadow_labyrinth', notes: '走廊的灯只亮一半，监控画面里总多一个人影。' }),
  R('underworld_castle', '混乱城堡', 'arena', 'tower', 154, 62, 0x9b0f95, { biome: 'city', theme: 'chaos_castle', notes: '王座上的盔甲是空的，钟一响它就换个坐姿。' }),
  R('underworld_vampire', '吸血巢穴', 'arena', 'morgue', 142, 58, 0x9b10a7, { biome: 'hospital', theme: 'vampire_lair', notes: '棺材盖反着钉，冷藏柜里码着写日期的血袋。' }),
]

// =====================================================================
// 雾海禁区（16）—— 重力 / 浓雾 / 海峡 / 泥沼 / 枯林 / 赤潮 / 灰港 / 恐怖酒店
// =====================================================================
const MIST_ROOMS = [
  R('mist_shelter', '雾海驿站', 'shelter', 'shelter', 118, 52, 0x9c01a5, {
    shelterSide: 'left',
    biome: 'port',
    notes: '航标站改的驿站，窗上钉着塑料布。雾太厚的时候，连门都看不清。',
  }),
  R('mist_gravity', '重力异常区', 'arena', 'plaza', 148, 60, 0x9c02b7, { biome: 'city', theme: 'gravity_anomaly', notes: '碎石往天上掉，雨滴悬在半空。' }),
  R('mist_fog', '浓雾区', 'standard', 'silt', 150, 58, 0x9c03c9, { biome: 'port', theme: 'dense_fog', notes: '雾里能听见自己的脚步声晚半拍。' }),
  R('mist_road', '雾中公路', 'standard', 'street', 140, 54, 0x9c04db, { biome: 'city', notes: '车道线一段一段被雾吞掉，路牌只剩背面的铁皮。' }),
  R('mist_saltflat', '盐碱滩', 'standard', 'silt', 146, 52, 0x9c05e3, { biome: 'port', notes: '地面结着一层白盐，踩上去会碎成粉。' }),
  R('mist_strait', '嚎叫海峡', 'arena', 'breakwater', 154, 58, 0x9c06f5, { biome: 'port', theme: 'howling_strait', notes: '风从海峡那头灌过来，带着像人声一样的呜咽。' }),
  R('mist_brokenbridge', '断桥', 'standard', 'crane', 148, 60, 0x9c070d, { biome: 'port', notes: '桥面从中间断下去，断口还挂着几根钢筋。' }),
  R('mist_swamp', '深渊泥沼', 'standard', 'silt', 150, 56, 0x9c081f, { biome: 'port', theme: 'abyss_swamp', notes: '泥面冒着泡，每个泡破开都像有人在下面换气。' }),
  R('mist_forest', '干枯树林', 'standard', 'field', 148, 56, 0x9c0931, { biome: 'village', theme: 'withered_forest', notes: '树皮全是裂口，风一吹，树干里传出空腔的回声。' }),
  R('mist_gasstation', '废弃加油站', 'standard', 'street', 130, 54, 0x9c0a43, { biome: 'city', notes: '加油枪还挂在机器上，价格牌定格在最后一个数字。' }),
  R('mist_tide', '红色潮水', 'arena', 'silt', 152, 56, 0x9c0b55, { biome: 'port', theme: 'red_tide', notes: '海水是红的，潮线一天比一天高。' }),
  R('mist_harbor', '灰色港湾', 'standard', 'crane', 154, 58, 0x9c0c67, { biome: 'port', theme: 'grey_harbor', notes: '雾把吊机切成一段一段，汽笛每十分钟响一次。' }),
  R('mist_observatory', '潮汐观测站', 'standard', 'lighthouse', 120, 62, 0x9c0d79, { biome: 'port', notes: '观测站的记录纸一直在走，潮位线越画越高。' }),
  R('mist_wreck', '沉船滩', 'standard', 'hull', 144, 58, 0x9c0e8b, { biome: 'port', notes: '半条渔船埋在沙里，船舱里灌满了黑水。' }),
  R('mist_hotel', '恐怖酒店', 'arena', 'ward', 144, 60, 0x9c0f9d, { biome: 'hospital', theme: 'horror_hotel', notes: '走廊尽头的房间号永远是 13。' }),
  R('mist_trail', '雾林小径', 'standard', 'field', 138, 52, 0x9c10af, { biome: 'village', notes: '小径两边的草压向同一个方向，像有什么刚走过去。' }),
]

// =====================================================================
// 组装
// =====================================================================

const REGION_DEFS = [
  {
    id: 'city',
    name: '锈城废墟',
    en: 'RUST CITY',
    sky: '#a8834a',
    desc: '楼板一层层塌进街道，地铁口朝天张着。雨把整座城泡成一摊锈。',
    rooms: CITY_ROOMS,
  },
  {
    id: 'village',
    name: '枯穗村',
    en: 'WITHER VILLAGE',
    sky: '#8d8f6a',
    desc: '田垄还在，麦子没了。井里剩下的一汪水比酸雨还毒。',
    rooms: VILLAGE_ROOMS,
  },
  {
    id: 'factory',
    name: '熔渣工厂',
    en: 'SLAG WORKS',
    sky: '#7c4a34',
    desc: '炉子还在烧，没人再加料。管道里的东西已经流了几十年。',
    rooms: FACTORY_ROOMS,
  },
  {
    id: 'dump',
    name: '倾倒深坑',
    en: 'THE DUMP',
    sky: '#8a7b4a',
    desc: '整座城的垃圾倒在这里，堆成了山。山底下压着还没坏的东西。',
    rooms: DUMP_ROOMS,
  },
  {
    id: 'metro',
    name: '废弃地铁',
    en: 'DEAD METRO',
    sky: '#4d5a5e',
    desc: '闸机还在，车没了。隧道一直往下，积水流到看不见的地方。',
    rooms: METRO_ROOMS,
  },
  {
    id: 'hospital',
    name: '坍塌医院',
    en: 'COLLAPSED WARD',
    sky: '#7f8f8a',
    desc: '走廊一格一格塌下来，病床还排在原地。消毒水味早就没了，只剩霉。',
    rooms: HOSPITAL_ROOMS,
  },
  {
    id: 'port',
    name: '淤塞港口',
    en: 'SILTED PORT',
    sky: '#7a7f6a',
    desc: '水退了，船搁在泥里。吊机还吊着半个集装箱，缆绳绷了二十年。',
    rooms: PORT_ROOMS,
  },
  {
    id: 'frontier',
    name: '边境残骸带',
    en: 'FRONTIER BELT',
    sky: '#6e6a58',
    desc: '港口再往外，地图上就没有标了。二十一处地标散在荒野里，每一处都住着人。',
    rooms: FRONTIER_ROOMS,
  },
  {
    id: 'old_town',
    name: '锈土旧城',
    en: 'OLD TOWN',
    sky: '#8a7a5a',
    biome: 'city',
    desc: '旧城没有被彻底拆掉，图书馆、学校、监狱和港区都还在。门牌掉在地上，房间里的东西一件没少。',
    rooms: OLDTOWN_ROOMS,
  },
  {
    id: 'underworld',
    name: '地底深井',
    en: 'UNDERWORLD',
    sky: '#4a4a52',
    biome: 'metro',
    desc: '竖井一路往下打着，矿道、机房、堡垒和更下面的东西都接在这口井上。风是从底下吹上来的。',
    rooms: UNDERWORLD_ROOMS,
  },
  {
    id: 'mist',
    name: '雾海禁区',
    en: 'MIST SEA',
    sky: '#6a7a7a',
    biome: 'port',
    desc: '海雾推进到岸上就不退了。重力在这里会打弯，潮水是红的，走进去的人多半原路退回来。',
    rooms: MIST_ROOMS,
  },
]

/** 确定性散列：给房间一个稳定的 monsterCount / lootDensity（不用 Math.random） */
function hashSeed(id, seed) {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  h = Math.imul(h ^ (seed | 0), 0x9e3779b1)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/** 建一个区域：order 决定门链，exits 自动生成 */
function buildRegion(def) {
  const rooms = {}
  const order = def.rooms.map((r) => r.id)
  for (const spec of def.rooms) {
    const f = hashSeed(spec.id, spec.seed)
    const isShelter = spec.kind === 'shelter'
    rooms[spec.id] = {
      ...spec,
      biome: spec.biome || def.id,
      region: def.id,
      regionName: def.name,
      // 怪物 5~9（shelter 恒为 0）
      monsterCount: spec.monsterCount != null ? spec.monsterCount : isShelter ? 0 : 5 + Math.floor(f * 5),
      lootDensity:
        spec.lootDensity != null
          ? spec.lootDensity
          : Math.round((0.8 + Math.floor(f * 6) * 0.1) * 100) / 100,
      exits: { left: null, right: null },
      notes: spec.notes || '',
    }
  }
  return {
    id: def.id,
    name: def.name,
    en: def.en,
    biome: def.biome || def.id,
    sky: def.sky,
    desc: def.desc,
    order,
    rooms,
    startRoom: order.find((id) => rooms[id].kind === 'shelter') || order[0],
    entryRoom: order[0],
    exitRoom: order[order.length - 1],
    // 老 4 区的 <region>_gate 保留为「区内标志性闸门」，不一定是最末一间
    gate: rooms[`${def.id}_gate`] ? `${def.id}_gate` : order[order.length - 1],
  }
}

export const REGIONS = {}
for (const def of REGION_DEFS) REGIONS[def.id] = buildRegion(def)

/** 区域顺序（世界线） */
export const REGION_ORDER = [
  'city',
  'village',
  'factory',
  'dump',
  'metro',
  'hospital',
  'port',
  'frontier',
  'old_town',
  'underworld',
  'mist',
]

// 1) 先连区内相邻房间（order[i] ⇄ order[i+1]）
for (const rid of REGION_ORDER) {
  const region = REGIONS[rid]
  const order = region.order
  for (let i = 0; i < order.length - 1; i++) {
    region.rooms[order[i]].exits.right = order[i + 1]
    region.rooms[order[i + 1]].exits.left = order[i]
  }
}
// 2) 再串跨区：每区最后一间（exitRoom）接下一区第一间（entryRoom）
for (let i = 0; i < REGION_ORDER.length; i++) {
  const cur = REGIONS[REGION_ORDER[i]]
  const next = REGIONS[REGION_ORDER[(i + 1) % REGION_ORDER.length]]
  cur.rooms[cur.exitRoom].exits.right = next.entryRoom
  next.rooms[next.entryRoom].exits.left = cur.exitRoom
  cur.next = next.id
  cur.prev = REGIONS[REGION_ORDER[(i - 1 + REGION_ORDER.length) % REGION_ORDER.length]].id
}
// 闭合由上面的跨区循环完成：… → port → frontier → city（无需额外钉死）

// =====================================================================
// 查询函数
// =====================================================================

/** 取区域（未知返回 null） */
export function getRegion(id) {
  return REGIONS[id] || null
}

/** 区域里所有房间 id（按房间链顺序） */
export function regionRoomIds(regionId) {
  const region = getRegion(regionId)
  if (!region) return []
  return region.order.slice()
}

/** 全局按 roomId 找 { region, spec, regionId } —— 常用于跨区传送 */
export function findRoom(roomId) {
  if (!roomId) return null
  for (const rid of REGION_ORDER) {
    const region = REGIONS[rid]
    if (region.rooms[roomId]) return { region, spec: region.rooms[roomId], regionId: rid }
  }
  return null
}

/** 取一个房间 spec。支持 (regionId, roomId) 与 (roomId) 两种用法 */
export function getRoomSpec(regionId, roomId) {
  if (roomId == null) {
    const hit = findRoom(regionId)
    return hit ? hit.spec : null
  }
  const region = getRegion(regionId)
  if (region && region.rooms[roomId]) return region.rooms[roomId]
  const hit = findRoom(roomId)
  return hit ? hit.spec : null
}

/** 取房间 spec（跨区也能找） */
export function findRoomSpec(roomId) {
  const r = findRoom(roomId)
  return r ? r.spec : null
}

/** 房间所在区域 id */
export function regionOfRoom(roomId) {
  const r = findRoom(roomId)
  return r ? r.regionId : null
}

/** 中文房名。roomLabel(regionId, roomId) 或 roomLabel(roomId) */
export function roomLabel(regionId, roomId) {
  if (roomId == null) {
    const spec = findRoomSpec(regionId)
    return spec ? spec.label : String(regionId || '')
  }
  const spec = getRoomSpec(regionId, roomId)
  return spec ? spec.label : roomId
}

/** 房间的完整标题：区域名 · 房名 */
export function roomTitle(regionId, roomId) {
  const region = getRegion(regionId) || findRoom(roomId)?.region
  if (!region) return roomId || ''
  const spec = region.rooms[roomId]
  return spec ? `${region.name} · ${spec.label}` : roomId
}

/** 由 exits 推出邻居。返回 { left, right, regionLeft, regionRight } */
export function neighbors(regionId, roomId) {
  const spec = getRoomSpec(regionId, roomId)
  if (!spec) return { left: null, right: null, regionLeft: null, regionRight: null }
  const left = spec.exits?.left ?? null
  const right = spec.exits?.right ?? null
  return {
    left,
    right,
    regionLeft: left ? findRoom(left)?.regionId ?? null : null,
    regionRight: right ? findRoom(right)?.regionId ?? null : null,
  }
}

/** 下一区 / 上一区（闭合，永不返回 null） */
export function nextRegion(regionId) {
  const i = REGION_ORDER.indexOf(regionId)
  if (i < 0) return null
  return REGION_ORDER[(i + 1) % REGION_ORDER.length]
}
export function prevRegion(regionId) {
  const i = REGION_ORDER.indexOf(regionId)
  if (i < 0) return null
  return REGION_ORDER[(i - 1 + REGION_ORDER.length) % REGION_ORDER.length]
}

/** 全部房间 id（世界线顺序） */
export function allRoomIds() {
  const out = []
  for (const rid of REGION_ORDER) out.push(...regionRoomIds(rid))
  return out
}

/** 世界线顺序的房间列表 [{regionId, roomId, spec, index}] */
export function worldRooms() {
  const out = []
  for (const rid of REGION_ORDER) {
    for (const roomId of regionRoomIds(rid)) {
      out.push({ regionId: rid, roomId, spec: REGIONS[rid].rooms[roomId], index: out.length })
    }
  }
  return out
}

/** 某个地标放在哪间房 */
export function findLandmarkRoom(landmarkId) {
  for (const rid of REGION_ORDER) {
    for (const [roomId, spec] of Object.entries(REGIONS[rid].rooms)) {
      if (spec.landmark === landmarkId) return { regionId: rid, roomId, spec }
    }
  }
  return null
}

/** 某条营救任务对应哪间房 */
export function findRescueRoom(rescueQuest) {
  for (const rid of REGION_ORDER) {
    for (const [roomId, spec] of Object.entries(REGIONS[rid].rooms)) {
      if (spec.cage && spec.cage.rescueQuest === rescueQuest) return { regionId: rid, roomId, spec }
    }
  }
  return null
}

/** 区域的出生房 spec */
export function startRoomOf(regionId) {
  const region = getRegion(regionId)
  return region ? region.rooms[region.startRoom] : null
}

/** 世界总房间数 */
export function roomCount() {
  return REGION_ORDER.reduce((n, rid) => n + REGIONS[rid].order.length, 0)
}

/**
 * 区域数据自检：引用完整性 + 链路对称 + 必备地标 + 尺寸/怪物数量约束。
 * 返回问题数组（空 = 通过）。scripts/check-biomes.mjs 会调用。
 */
export function validateRegions() {
  const problems = []
  const IDs = new Set()
  // 新增区域（old_town / underworld / mist）借用已有 biome 生成器，因此只校验 biome 合法性
  const LEGAL_BIOMES = ['city', 'village', 'factory', 'dump', 'metro', 'hospital', 'port']
  for (const rid of REGION_ORDER) {
    const region = REGIONS[rid]
    if (!region) {
      problems.push(`缺少区域 ${rid}`)
      continue
    }
    // frontier 是纯主题区，区域自身 biome 沿用旧值 'frontier'，允许保留
    if (!LEGAL_BIOMES.includes(region.biome) && region.biome !== rid)
      problems.push(`${rid}: biome=${region.biome} 不是合法 biome（应为 ${LEGAL_BIOMES.join('/')}）`)
    const rooms = Object.keys(region.rooms)
    if (rooms.length < 16) problems.push(`${rid}: 房间数 ${rooms.length} < 16`)
    if (region.order.length !== rooms.length) problems.push(`${rid}: order 与 rooms 数量不一致`)
    if (new Set(region.order).size !== region.order.length) problems.push(`${rid}: order 有重复`)
    let shelterCount = 0
    for (const [roomId, spec] of Object.entries(region.rooms)) {
      if (IDs.has(roomId)) problems.push(`重复 roomId: ${roomId}`)
      IDs.add(roomId)
      if (spec.id !== roomId) problems.push(`${roomId}: spec.id 不一致（${spec.id}）`)
      if (!spec.label) problems.push(`${roomId}: 缺 label`)
      if (!LEGAL_BIOMES.includes(spec.biome)) problems.push(`${roomId}: biome=${spec.biome} 不合法`)
      if (!spec.exits) problems.push(`${roomId}: 缺 exits`)
      if (!Number.isInteger(spec.seed)) problems.push(`${roomId}: seed 必须是整数`)
      if (!(spec.w >= 96 && spec.w <= 160)) problems.push(`${roomId}: w=${spec.w} 不在 96~160`)
      if (!(spec.h >= 44 && spec.h <= 68)) problems.push(`${roomId}: h=${spec.h} 不在 44~68`)
      if (!(spec.lootDensity >= 0.5 && spec.lootDensity <= 1.5))
        problems.push(`${roomId}: lootDensity=${spec.lootDensity} 不在 0.5~1.5`)
      if (spec.kind === 'shelter') {
        shelterCount++
        if (!spec.shelterSide) problems.push(`${roomId}: shelter 房必须有 shelterSide`)
        if (spec.monsterCount !== 0) problems.push(`${roomId}: shelter 的 monsterCount 必须是 0`)
      } else if (!(spec.monsterCount >= 5 && spec.monsterCount <= 9)) {
        problems.push(`${roomId}: monsterCount=${spec.monsterCount} 不在 5~9`)
      }
      for (const side of ['left', 'right']) {
        const n = spec.exits?.[side] ?? null
        if (!n) {
          problems.push(`${roomId}.${side} 是断头（世界链必须闭合）`)
          continue
        }
        const other = findRoom(n)
        if (!other) {
          problems.push(`${roomId}.${side} 指向不存在的房间 ${n}`)
          continue
        }
        const back = other.spec.exits?.[side === 'left' ? 'right' : 'left'] ?? null
        if (back !== roomId) problems.push(`${roomId}.${side}=${n} 但反向不是自己（${back}）`)
      }
    }
    if (shelterCount !== 1) problems.push(`${rid}: 应恰有 1 间 shelter，实际 ${shelterCount}`)
    if (!region.rooms[region.startRoom]) problems.push(`${rid}: startRoom 不存在`)
    if (!region.rooms[region.exitRoom]) problems.push(`${rid}: exitRoom 不存在`)
    if (region.next && !REGIONS[region.next]) problems.push(`${rid}.next 指向不存在的区域`)
  }
  // 必备地标
  const required = {
    relay_a: 'city_tower',
    relay_b: 'village_well',
    relay_c: 'factory_control',
    antenna_signal: 'dump_core',
    generator_city: 'city_plaza',
    generator_village: 'village_barn',
    generator_factory: 'factory_hall',
    generator_dump: 'dump_pit',
  }
  for (const [lm, roomId] of Object.entries(required)) {
    const hit = findLandmarkRoom(lm)
    if (!hit) problems.push(`缺少地标 ${lm}（应在 ${roomId}）`)
    else if (hit.roomId !== roomId) problems.push(`地标 ${lm} 应在 ${roomId}，实际在 ${hit.roomId}`)
  }
  // 营救牢笼
  const rescues = {
    rescue_huique: 'city_slum',
    rescue_tiezhua: 'factory_furnace',
    rescue_k9: 'dump_pit',
  }
  for (const [quest, roomId] of Object.entries(rescues)) {
    const hit = findRescueRoom(quest)
    if (!hit) problems.push(`缺少营救点 ${quest}（应在 ${roomId}）`)
    else if (hit.roomId !== roomId) problems.push(`营救点 ${quest} 应在 ${roomId}，实际在 ${hit.roomId}`)
  }
  // 老 4 区的 6 间老房必须还在，且门链首尾相接
  const oldChains = {
    city: ['city_shelter', 'city_street', 'city_plaza', 'city_slum', 'city_tower', 'city_gate'],
    village: ['village_shelter', 'village_field', 'village_house', 'village_well', 'village_barn', 'village_gate'],
    factory: ['factory_shelter', 'factory_line', 'factory_hall', 'factory_furnace', 'factory_control', 'factory_gate'],
    dump: ['dump_shelter', 'dump_pit', 'dump_mountain', 'dump_crane', 'dump_core', 'dump_gate'],
  }
  for (const [rid, chain] of Object.entries(oldChains)) {
    const order = REGIONS[rid].order
    const idx = chain.map((id) => order.indexOf(id))
    for (let i = 0; i < chain.length; i++) {
      if (idx[i] < 0) problems.push(`老房间 ${chain[i]} 丢了`)
      else if (i > 0 && idx[i] <= idx[i - 1]) problems.push(`老门链顺序被打乱：${chain[i - 1]} → ${chain[i]}`)
    }
    for (let i = 1; i < chain.length; i++) {
      const spec = REGIONS[rid].rooms[chain[i]]
      if (spec && spec.exits.left !== chain[i - 1])
        problems.push(`老门链断了：${chain[i]}.left=${spec.exits.left}，应为 ${chain[i - 1]}`)
    }
  }
  return problems
}

export default REGIONS
