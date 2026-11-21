// 道具 / 可交互物数据（CONTENT-API §6.4 + §8）
//
// 每个 kind 都对应 src/game/render/art/props.js 的 getPropArt(kind)。
// 字段：
//   solid        是否阻挡通行。引擎若不做实体碰撞，可只用于「放置时避让主路」。
//   interact     交互所需工具：shovel | pickaxe | welder | scanner | rescue | talk
//                null = 不需要工具，靠近即可搜刮 / 查看。
//   loot         搜刮产物（item id，见 loot/catalog.js）；null = 没有产出。
//   questTarget  任务目标标识。quests 里 objective.target 会引用它（如 'relay' / 'generator'）。
//   destructible 是否可被工具摧毁（摧毁后掉落 loot）。
//
// 所有坐标都是「道具脚下」的世界坐标（y = 支撑面顶部），由生成器保证有支撑。

import { ROOM_PROP_DEFS } from './rooms/index.js'

export const PROPS = {
  // ---------------- 人 / 动物残骸：直接搜刮 ----------------
  skeleton_human: {
    name: '人类骸骨',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '靠墙坐着，膝盖上摊着一本被雨泡烂的册子。衣服还能撕出几块布。',
  },
  skeleton_animal: {
    name: '兽骨',
    solid: false,
    interact: null,
    loot: 'dog_food',
    questTarget: null,
    destructible: false,
    desc: '肋骨被什么东西啃开过。旁边有个没吃完的罐头。',
  },
  corpse: {
    name: '尸体',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '死了没多久，雨水还没把他泡胀。',
  },
  skull: {
    name: '头骨',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '半个头骨，边缘发黑。',
  },
  ribcage: {
    name: '胸腔骨架',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '像一只翻过来的笼子。',
  },

  // ---------------- 车辆残骸：需要焊枪切开 ----------------
  car_wreck: {
    name: '轿车残骸',
    solid: true,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '底盘压在沥青里。线束还能抽出来一段。',
  },
  bus_wreck: {
    name: '巴士残骸',
    solid: true,
    interact: 'welder',
    loot: 'aluminum_sheet',
    questTarget: null,
    destructible: false,
    desc: '侧翻在车道中央，车窗全碎。外皮是整块的铝。',
  },

  // ---------------- 建筑残件：需要镐 ----------------
  building_facade: {
    name: '楼体断面',
    solid: true,
    interact: 'pickaxe',
    loot: 'cement',
    questTarget: null,
    destructible: false,
    desc: '一整面被掀开的楼。钢筋像断掉的梳齿。',
  },
  house_facade: {
    name: '民房断面',
    solid: true,
    interact: 'pickaxe',
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '还留着半张贴纸和一排挂钉。',
  },
  factory_pipe: {
    name: '工厂管道',
    solid: true,
    interact: 'welder',
    loot: 'rubber',
    questTarget: null,
    destructible: false,
    desc: '比人粗的旧管道，法兰盘上结着盐。',
  },

  // ---------------- 容器 / 杂物 ----------------
  barrel: {
    name: '铁桶',
    solid: true,
    interact: 'pickaxe',
    loot: 'chemical',
    questTarget: null,
    destructible: true,
    desc: '桶身印着看不懂的编号，晃一晃还有半桶。',
  },
  crate: {
    name: '木箱',
    solid: true,
    interact: null,
    loot: 'scrap_plate',
    questTarget: null,
    destructible: true,
    desc: '钉得潦草，但还结实。',
  },
  tire_pile: {
    name: '轮胎堆',
    solid: false,
    interact: null,
    loot: 'rubber',
    questTarget: null,
    destructible: false,
    desc: '烧过一半的轮胎堆，还冒着胶味。',
  },
  fence: {
    name: '铁篱笆',
    solid: true,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: true,
    desc: '锈得只剩轮廓，碰一下就掉渣。',
  },
  streetlight: {
    name: '路灯',
    solid: false,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '灯罩里积了半盆黑水。杆子是空心的，塞满了线。',
  },
  tv: {
    name: '电视机',
    solid: false,
    interact: 'scanner',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '屏幕上是一层灰。通电也不会亮了。',
  },
  sofa: {
    name: '沙发',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '坐垫被啃出洞，弹簧翘着。',
  },
  wardrobe: {
    name: '衣柜',
    solid: true,
    interact: null,
    loot: 'clothes_1',
    questTarget: null,
    destructible: true,
    desc: '门是开的，里面挂着一件还看得清颜色的外套。',
  },
  cradle: {
    name: '摇篮',
    solid: false,
    interact: null,
    loot: 'huique_toy',
    questTarget: null,
    destructible: false,
    desc: '摇篮里侧刻着一道道身高线。',
  },
  grave: {
    name: '土坟',
    solid: false,
    interact: 'shovel',
    loot: 'jewelry_1',
    questTarget: null,
    destructible: false,
    desc: '木牌上的字被雨冲没了，坟头压着一只铁盒。',
  },
  cage: {
    name: '牢笼',
    solid: false,
    interact: 'rescue',
    loot: null,
    questTarget: 'rescue',
    destructible: false,
    desc: '焊在墙上的铁笼，里面有人。',
  },

  // ---------------- 设施：扫描 / 焊接 ----------------
  workbench: {
    name: '工作台',
    solid: true,
    interact: 'welder',
    loot: 'hydraulic_rod',
    questTarget: null,
    destructible: false,
    desc: '台钳还夹着一根没做完的活塞杆。',
  },
  terminal: {
    name: '终端机',
    solid: false,
    interact: 'scanner',
    loot: 'ram_stick',
    questTarget: 'data_terminal',
    destructible: false,
    desc: '屏幕还在闪一行无意义的字样。键盘上全是灰。',
  },
  generator: {
    name: '发电机',
    solid: true,
    interact: 'welder',
    loot: 'battery_cell',
    questTarget: 'power_node',
    destructible: false,
    desc: '外壳烫手。里面还有一格电。',
  },
  relay: {
    name: '中继器',
    solid: false,
    interact: 'welder',
    loot: 'relay_part',
    questTarget: 'relay',
    destructible: false,
    desc: '半人高的信号中继器，指示灯还在一明一灭。',
  },
  antenna: {
    name: '天线',
    solid: false,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: 'antenna',
    destructible: false,
    desc: '指向天空的铁架，缆线垂到地上。',
  },
  satellite: {
    name: '卫星锅',
    solid: true,
    interact: 'scanner',
    loot: 'satellite_gyro',
    questTarget: 'satellite',
    destructible: false,
    desc: '锅面凹了一块，云台还能转。',
  },

  // ---------------- 营地 / 自然 ----------------
  campfire: {
    name: '营火',
    solid: false,
    interact: 'rest',
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '铁桶改的火盆，炭还是红的。酸雨落进来会嘶一声。',
  },
  tent: {
    name: '帐篷',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '补丁摞补丁，但是干的。',
  },
  junk_heap: {
    name: '垃圾堆',
    solid: false,
    interact: 'shovel',
    loot: 'scrap_plate',
    questTarget: null,
    destructible: false,
    desc: '一整堆压扁的罐头盒和塑料。下面常常压着好东西。',
  },
  tree_dead: {
    name: '枯树',
    solid: false,
    interact: 'pickaxe',
    loot: 'rubber',
    questTarget: null,
    destructible: true,
    desc: '树皮裂成一块块，掰下来能当引火物。',
  },
  weed: {
    name: '杂草',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: true,
    desc: '在酸雨里也活下来的东西，根扎得很深。',
  },
  puddle_toxic: {
    name: '毒水洼',
    solid: false,
    interact: null,
    loot: 'chemical',
    questTarget: null,
    destructible: false,
    desc: '水面浮着一层油膜，颜色不太对。',
  },

  // ---------------- 扩展：地铁 / 医院 / 港口 + 通用工业件 ----------------
  vent: {
    name: '通风口',
    solid: false,
    interact: 'welder',
    loot: 'relay_part',
    questTarget: null,
    destructible: false,
    desc: '格栅后面有风，说明另一头还通着。',
  },
  duct: {
    name: '通风管',
    solid: true,
    interact: 'welder',
    loot: 'aluminum_sheet',
    questTarget: null,
    destructible: false,
    desc: '方形的镀锌铁皮管，接缝处用胶带缠过。',
  },
  rebar_pile: {
    name: '钢筋堆',
    solid: false,
    interact: 'pickaxe',
    loot: 'scrap_plate',
    questTarget: null,
    destructible: false,
    desc: '一捆生锈的螺纹钢，断口是新的。',
  },
  sandbag: {
    name: '沙袋',
    solid: true,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: true,
    desc: '麻袋里灌的是湿沙，已经硬成一整块。',
  },
  stretcher: {
    name: '担架',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '帆布上有一圈干掉的血迹，绑带还系着。',
  },
  gurney: {
    name: '推床',
    solid: true,
    interact: 'welder',
    loot: 'servo_motor',
    questTarget: null,
    destructible: false,
    desc: '床轮卡死了，床身还能拆出一组电机。',
  },
  ivy: {
    name: '常春藤',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: true,
    desc: '顺着墙爬满了，根须钻进砖缝里。',
  },
  moss_rock: {
    name: '苔石',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '石头上长了一层黄绿色的苔，摸上去是湿的。',
  },
  container_small: {
    name: '小货柜',
    solid: true,
    interact: 'welder',
    loot: 'aluminum_sheet',
    questTarget: null,
    destructible: false,
    desc: '两米长的转运柜，门锁被撬过又焊死了。',
  },
  cable_spool: {
    name: '电缆盘',
    solid: true,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '还剩大半盘线，外皮脆得一掰就掉。',
  },
  life_ring: {
    name: '救生圈',
    solid: false,
    interact: null,
    loot: 'rubber',
    questTarget: null,
    destructible: false,
    desc: '挂在栏杆上，白漆写着船名，被雨冲得只剩两个字。',
  },
  crane_hook: {
    name: '吊钩',
    solid: false,
    interact: 'welder',
    loot: 'hydraulic_rod',
    questTarget: null,
    destructible: false,
    desc: '钩头砸进地里，钢缆还绷着一段。',
  },
  turnstile: {
    name: '闸机',
    solid: true,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '三根不锈钢转杆，转起来还在响。',
  },
  hospital_bed: {
    name: '病床',
    solid: true,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: true,
    desc: '床垫被啃开，弹簧支棱出来，床栏上刻着一个名字。',
  },
  silt_mound: {
    name: '淤泥堆',
    solid: false,
    interact: 'shovel',
    loot: 'cement',
    questTarget: null,
    destructible: false,
    desc: '港水退下去留下的淤泥，一脚能陷到小腿。',
  },
  cargo_net: {
    name: '货网',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: true,
    desc: '尼龙网兜着半箱泡水的零件，绳子一扯就断。',
  },
  hull_plate: {
    name: '船体钢板',
    solid: true,
    interact: 'welder',
    loot: 'scrap_plate',
    questTarget: null,
    destructible: false,
    desc: '一块卷边的船壳板，焊缝比旁边的锈还厚。',
  },
  beacon: {
    name: '航标灯',
    solid: false,
    interact: 'scanner',
    loot: 'battery_cell',
    questTarget: null,
    destructible: false,
    desc: '灯塔的小航标灯，镜片碎了，底座还有电。',
  },

  // ---------------- 彩蛋（Fallout / Skyrim / NieR / Metro / Akira / Cyberpunk） ----------------
  vault_door: {
    name: '避难所大门',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '齿轮状的钢门半嵌在土里，门牌上写着 VAULT 117。',
  },
  word_wall: {
    name: '龙语墙',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '被酸雨泡黑的石墙，刻痕还在发微光。',
  },
  lunar_flower: {
    name: '月之泪',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '一朵不该存在于废土的白花。',
  },
  metro_sign: {
    name: '地铁站牌',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '生锈的站牌只亮着半个字母。',
  },
  akira_bike: {
    name: '赤色摩托',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '一辆红色摩托侧躺在瓦砾中，油箱上烫着「金田」。',
  },
  neon_poster: {
    name: '霓虹海报',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '半张被雨泡烂的海报，只剩一句 WAKE UP, SAMURAI。',
  },
  nier_whale: {
    name: '白色巨鲸残骸',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '巨大的白色骨架横在垃圾场尽头。',
  },

  // ---------------- 垃圾堆变体（小尺寸，避免遮住主路） ----------------
  junk_heap_bags: {
    name: '垃圾袋堆',
    solid: false,
    interact: 'shovel',
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '十几个扎口的黑袋摞在一起，最上面的被雨泡得发亮。',
  },
  junk_heap_scrap: {
    name: '碎铁堆',
    solid: false,
    interact: 'shovel',
    loot: 'scrap_plate',
    questTarget: null,
    destructible: false,
    desc: '切下来的边角料堆成一小堆，边口还很利。',
  },
  junk_heap_appliance: {
    name: '家电堆',
    solid: false,
    interact: 'scanner',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '冰箱、风扇和一台没有门的微波炉摞在一起。',
  },
  junk_heap_plastic: {
    name: '塑料山',
    solid: false,
    interact: null,
    loot: 'rubber',
    questTarget: null,
    destructible: false,
    desc: '晒到发白的塑料瓶和包装带压成一团。',
  },
  junk_heap_cans: {
    name: '罐头堆',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '空罐头码成一小垛，标签早泡没了。',
  },

  // ---------------- 机械元素（地图的工业骨架） ----------------
  gear_assembly: {
    name: '齿轮组',
    solid: true,
    interact: 'welder',
    loot: 'bearing',
    questTarget: null,
    destructible: false,
    desc: '三个咬合的齿轮卡死在同一个角度，齿面上全是旧油。',
  },
  hydraulic_press: {
    name: '液压压机',
    solid: true,
    interact: 'pickaxe',
    loot: 'hydraulic_rod',
    questTarget: null,
    destructible: false,
    desc: '压头悬在半空，液压管裂开后凝固成一圈黑色。',
  },
  conveyor_segment: {
    name: '传送带段',
    solid: false,
    interact: 'welder',
    loot: 'rubber',
    questTarget: null,
    destructible: false,
    desc: '一段断掉的传送带，滚筒还能用手推动。',
  },
  mech_servo_arm: {
    name: '伺服机械臂',
    solid: false,
    interact: 'welder',
    loot: 'servo_motor',
    questTarget: null,
    destructible: false,
    desc: '从装配线上折下来的机械臂，抓钳半张着。',
  },
  mech_piston: {
    name: '液压活塞',
    solid: false,
    interact: 'welder',
    loot: 'hydraulic_rod',
    questTarget: null,
    destructible: false,
    desc: '一根斜插在地上的活塞杆，密封圈还挂在上头。',
  },
  mech_rail: {
    name: '导轨段',
    solid: false,
    interact: null,
    loot: 'aluminum_sheet',
    questTarget: null,
    destructible: false,
    desc: '行车导轨断成两截，螺栓孔里长出了锈花。',
  },
  mech_valve: {
    name: '阀组',
    solid: true,
    interact: 'welder',
    loot: 'chemical',
    questTarget: null,
    destructible: false,
    desc: '一排手轮阀门，只有一个还能转。',
  },
  mech_turbine: {
    name: '涡轮机',
    solid: true,
    interact: 'welder',
    loot: 'gyro',
    questTarget: null,
    destructible: false,
    desc: '巨大的涡轮壳，叶片从裂口里露出来。',
  },
  mech_cable_run: {
    name: '电缆束',
    solid: false,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '成束的粗电缆从墙里垂下来，末端被剪过。',
  },
  robot_torso: {
    name: '机器人残躯',
    solid: true,
    interact: 'scanner',
    loot: 'board_cpu',
    questTarget: null,
    destructible: false,
    desc: '只剩上半身的人形机器人靠在墙上，胸口编号被刮掉。',
  },
  mech_console: {
    name: '控制台',
    solid: true,
    interact: 'scanner',
    loot: 'ram_stick',
    questTarget: null,
    destructible: false,
    desc: '一排按钮和推杆，指示灯里还有一盏在闪。',
  },
  mech_clamp: {
    name: '固定夹具',
    solid: false,
    interact: null,
    loot: 'scrap_plate',
    questTarget: null,
    destructible: false,
    desc: '用来夹住工件的铁钳，开口里卡着一块弯板。',
  },
  mech_pipe_bundle: {
    name: '管束',
    solid: false,
    interact: 'welder',
    loot: 'rubber',
    questTarget: null,
    destructible: false,
    desc: '三根不同粗细的管道捆在一起，保温层被撕开。',
  },
  solar_panel: {
    name: '太阳能板',
    solid: false,
    interact: 'scanner',
    loot: 'sensor_unit',
    questTarget: null,
    destructible: false,
    desc: '斜靠在支架上的电池板，裂成蛛网但还没完全报废。',
  },
  server_rack: {
    name: '机柜',
    solid: true,
    interact: 'scanner',
    loot: 'board_cpu',
    questTarget: null,
    destructible: false,
    desc: '半人高的机柜，抽出的一格格服务器里还有灯亮着。',
  },
  satellite_dish: {
    name: '通信天线',
    solid: true,
    interact: 'scanner',
    loot: 'satellite_gyro',
    questTarget: null,
    destructible: false,
    desc: '指向天空的白色天线，馈源烧成了黑点。',
  },
  bridge_truss: {
    name: '桥架',
    solid: true,
    interact: 'pickaxe',
    loot: 'aluminum_sheet',
    questTarget: null,
    destructible: false,
    desc: '一截断裂的钢桁架，铆钉孔里全是泥。',
  },
  stadium_light: {
    name: '场地灯柱',
    solid: false,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '体育场剩下的灯柱，灯罩碎了一半。',
  },
  lab_tank: {
    name: '培养罐',
    solid: true,
    interact: 'scanner',
    loot: 'chemical',
    questTarget: null,
    destructible: false,
    desc: '玻璃罐里还剩半罐浑液，标签上的编号被泡掉。',
  },
  church_bell: {
    name: '铜钟',
    solid: false,
    interact: 'look',
    loot: 'jewelry_1',
    questTarget: null,
    destructible: false,
    desc: '从教堂顶上掉下来的铜钟，钟口卡在瓦砾里。',
  },
  military_crate: {
    name: '军用箱',
    solid: true,
    interact: 'pickaxe',
    loot: 'military_shell',
    questTarget: null,
    destructible: false,
    desc: '绿色铁箱，锁扣被撬坏，箱盖压着半张清单。',
  },
  alien_pod: {
    name: '异形舱',
    solid: true,
    interact: 'scanner',
    loot: 'rare_earth',
    questTarget: null,
    destructible: false,
    desc: '不是人做的舱体，外壳有一层会反光的膜。',
  },
  farm_silo: {
    name: '料仓',
    solid: true,
    interact: 'pickaxe',
    loot: 'chemical',
    questTarget: null,
    destructible: false,
    desc: '铁皮料仓被风撕开一道口子，里面全是结成块的肥料。',
  },
  torn_flag: {
    name: '破旗',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '插在瓦砾上的旗，图案已经看不出是哪一边的。',
  },

  // ---------------- 主题场景件：图书馆 / 学校 / 工厂 / 遗迹 / 监狱 / 旅馆 ----------------
  library_shelf: {
    name: '书架',
    solid: true,
    interact: null,
    loot: 'textbook',
    questTarget: null,
    destructible: false,
    desc: '整面墙的书架塌了一半，剩下的一排书脊褪成同一种灰。抽一本出来，纸页一碰就碎。',
  },
  school_desk: {
    name: '课桌',
    solid: true,
    interact: null,
    loot: 'pencil_case',
    questTarget: null,
    destructible: false,
    desc: '桌面上刻满了名字和日期，最后一行的日期之后就没有字了。',
  },
  blackboard: {
    name: '黑板',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '黑板上还留着半道没擦完的算式，粉笔槽里积着粉笔灰和雨水。',
  },
  paper_roller: {
    name: '造纸压辊机',
    solid: true,
    interact: 'welder',
    loot: 'scrap_plate',
    questTarget: null,
    destructible: false,
    desc: '上下两根压辊咬着一段干硬的纸浆，轴承里的油早就凝成了黑块。',
  },
  dig_grid: {
    name: '探方网格',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '木桩拉起的方格把土层切成一块块，标签早已看不清编号。',
  },
  prison_bars: {
    name: '牢门栅栏',
    solid: true,
    interact: 'pickaxe',
    loot: 'scrap_plate',
    questTarget: null,
    destructible: false,
    desc: '竖栏焊在门框上，锁舌被人从里面撬弯了一截。',
  },
  hotel_counter: {
    name: '旅馆前台',
    solid: true,
    interact: null,
    loot: 'hotel_keycard',
    questTarget: null,
    destructible: false,
    desc: '柜台后的房号牌还整齐挂着，只有 13 号的钥匙不见了。',
  },
  vending_machine: {
    name: '自动售货机',
    solid: true,
    interact: null,
    loot: 'can',
    questTarget: null,
    destructible: false,
    desc: '玻璃上贴着「暂停营业」，货道里还剩几罐看不出牌子的饮料。',
  },
  beacon_lamp: {
    name: '灯塔灯组',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '菲涅尔透镜一圈圈地转，灯芯还亮着，光柱扫过的地方空无一物。',
  },
  ship_frame: {
    name: '船体龙骨',
    solid: false,
    interact: 'welder',
    loot: 'steel_rod',
    questTarget: null,
    destructible: false,
    desc: '一排肋骨状的船架撑在半空，龙骨上的焊瘤比锈还硬。',
  },
  drydock_gate: {
    name: '船坞闸门',
    solid: true,
    interact: 'welder',
    loot: 'aluminum_sheet',
    questTarget: null,
    destructible: false,
    desc: '钢闸门上的桁架拧成了麻花，止水条从缝里挤出来一截。',
  },
  transformer: {
    name: '变压器',
    solid: true,
    interact: 'welder',
    loot: 'copper_wire',
    questTarget: null,
    destructible: false,
    desc: '散热片之间塞满了鸟窝和灰，瓷瓶上还挂着一段被剪断的线。',
  },
  coal_cart: {
    name: '矿车',
    solid: true,
    interact: null,
    loot: 'graphite_rod',
    questTarget: null,
    destructible: false,
    desc: '矿车歪在断轨上，车斗里的煤结成了硬壳，底下还能敲出几块。',
  },
  reactor_core: {
    name: '反应堆核心',
    solid: false,
    interact: null,
    loot: 'uranium_dust',
    questTarget: null,
    destructible: false,
    desc: '燃料棒在观察窗后泛着冷光，盖革计数器靠得越近叫得越急。',
  },
  ammo_stack: {
    name: '弹药箱堆',
    solid: false,
    interact: null,
    loot: 'military_shell',
    questTarget: null,
    destructible: false,
    desc: '三只绿箱叠在一起，箱扣全锈死了，弹带从缝里垂下来。',
  },
  punk_amp: {
    name: '朋克音箱堆',
    solid: false,
    interact: null,
    loot: 'radio',
    questTarget: null,
    destructible: false,
    desc: '音箱堆成一面墙，纸盆全破了，接通电却还有鼓点在响。',
  },
  shadow_veil: {
    name: '暗影帷幕',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '厚重的帘子从天花板垂到地面，掀开时后面比外面还暗。',
  },
  chaos_throne: {
    name: '混乱王座',
    solid: true,
    interact: null,
    loot: 'jewelry_1',
    questTarget: null,
    destructible: false,
    desc: '王座歪着一条腿，靠背上焊满尖刺，坐垫上有一圈干了的血迹。',
  },
  coffin: {
    name: '棺木',
    solid: false,
    interact: null,
    loot: 'cloth',
    questTarget: null,
    destructible: false,
    desc: '六角棺盖反钉着，十字是拿两颗钉子随手划出来的。',
  },

  // ---------------- 彩蛋：银幕 / 科幻 ----------------
  t800_endoskeleton: {
    name: 'T-800 残骸',
    solid: false,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '银灰色金属骨架被液压机压住，胸腔里的红灯还按两秒一次的节奏闪。',
  },
  delorean: {
    name: '鸥翼门跑车',
    solid: true,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '楔形银灰跑车停在路肩，鸥翼门开着，车尾一圈铜线圈还在发蓝光。',
  },
  earth_engine: {
    name: '行星发动机',
    solid: true,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '比山还高的喷口斜插在地平线上，冰蓝的等离子柱一直烧到云里。',
  },
  matrix_phonebooth: {
    name: '红色电话亭',
    solid: true,
    interact: 'look',
    loot: null,
    questTarget: null,
    destructible: false,
    egg: true,
    desc: '玻璃上淌着绿色的字符雨，听筒悬在半空，亭子里放着两颗药丸。',
  },

  // ---------------- 地面小杂物：纯装饰散布件（不搜刮 / 不阻挡） ----------------
  rubble_small: {
    name: '小碎石堆',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '碎水泥和断砖滚成一小堆，缝里积着沙。',
  },
  scrap_bits: {
    name: '散落金属碎片',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '几片弯折的薄板和一把螺栓，像是从什么机器上崩下来的。',
  },
  glass_shards: {
    name: '玻璃渣',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '一扇碎窗撒了一地，边缘还泛着青色的光。',
  },
  cable_coil: {
    name: '盘卷线缆',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '一盘胶皮线，线头拖出去，铜芯露在外面。',
  },
  paper_trash: {
    name: '纸屑破布',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '被雨打烂又被风吹干的纸片，字迹早就糊了。',
  },
  shell_casings: {
    name: '弹壳堆',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '一小堆黄铜弹壳，底下洇着一片火药渍。',
  },
  bone_scatter: {
    name: '碎骨',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '两三根散骨，看不出是人还是兽。',
  },
  crack_ground: {
    name: '地面裂缝',
    solid: false,
    interact: null,
    loot: null,
    questTarget: null,
    destructible: false,
    desc: '应力撕开的一道口子，边缘微微翘起。',
  },

  // ---------------- 第二轮 AI 道具：废旧家电（装饰件） ----------------
  fridge: {
    name: '报废冰箱', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '双门冰箱凹陷变形，密封条烂成一条黑边，里面结着霉。',
  },
  washing_machine: {
    name: '旧洗衣机', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '滚筒门圈锈死，桶里积着半筒发臭的浑水。',
  },
  microwave: {
    name: '坏微波炉', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '炉门半开，转盘碎在里面，按键全掉了漆。',
  },
  ac_unit: {
    name: '空调外机', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '风扇叶片缺了一片，散热片上糊满灰和虫壳。',
  },
  standing_fan: {
    name: '落地扇', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '铁丝护网歪着，扇叶上缠着干硬的布丝。',
  },
  radio: {
    name: '旧收音机', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '木壳磨得起毛，伸缩天线折了一截，拧开只有沙沙声。',
  },
  vacuum: {
    name: '吸尘器', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '软管裂着口子，尘杯里堵满成团的灰。',
  },
  desk_lamp: {
    name: '台灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '折臂台灯耷拉着灯罩，灯泡不知什么时候碎的。',
  },
  electric_heater: {
    name: '电暖器', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '散热栅后面还留着一点暗红，通电估计会跳闸。',
  },

  // ---------------- 第二轮 AI 道具：废弃车辆 ----------------
  pickup_wreck: {
    name: '皮卡残骸', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '蓝色皮卡侧门瘪进一块，货斗里只剩生锈的螺栓。',
  },
  van_wreck: {
    name: '厢式货车残骸', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '白厢货顶盖塌了一角，挡风玻璃碎成蛛网。',
  },
  motorbike: {
    name: '旧摩托', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '黑色摩托撑着单边脚撑，油箱上刮出一道深痕。',
  },
  tricycle: {
    name: '三轮货车', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '车斗木板裂着缝，车把歪向一边。',
  },
  dumpster: {
    name: '垃圾箱', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '绿色大型垃圾箱塞得冒尖，轮胎和铁件顶在盖板上。',
  },
  sedan_wreck: {
    name: '轿车残骸', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '红轿车车尾被撞瘪，后排车窗全空。',
  },
  route_bus: {
    name: '报废面包车', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '青灰色面包车横在路边，窗框只剩深色的洞。',
  },
  trailer: {
    name: '平板拖车', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '空货斗竖着锈栏杆，牵引钩上挂着半截断缆。',
  },
  forklift: {
    name: '旧叉车', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '黄色叉车货叉着地，座椅靠背裂开口子。',
  },

  // ---------------- 第二轮 AI 道具：灯具 ----------------
  floodlight: {
    name: '投光灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '高杆投光灯蒙着油灰，反光碗里积了水。',
  },
  hanging_lamp: {
    name: '吊灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '电线从天花板垂下来，灯罩歪成一个角度。',
  },
  signal_lamp: {
    name: '信号灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '立式信号灯只剩一个还透光，灯壳掉着锈皮。',
  },
  neon_sign: {
    name: '霓虹招牌', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '灯管缺了一半，剩下的几段也早就不亮了。',
  },
  oil_lamp: {
    name: '煤油灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '玻璃灯罩有一道裂纹，灯芯结着黑结。',
  },
  wall_light: {
    name: '壁灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '墙上的小壁灯，支架歪了，灯泡不见踪影。',
  },
  searchlight: {
    name: '探照灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '大口径探照灯斜指着天，透镜上蒙着一层雾。',
  },
  string_light: {
    name: '串灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '一串挂着的小灯，半数泡壳碎了，线皮发脆。',
  },
  warning_beacon: {
    name: '警示灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '圆顶警示灯斜靠在铁架上，顶盖磕出凹痕。',
  },

  // ---------------- 第二轮 AI 道具：建筑小件 ----------------
  door_frame: {
    name: '破门框', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '旧木门框斜撑着一根木棍，门板上破了两个洞。',
  },
  brick_wall: {
    name: '残砖墙', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '半堵红砖墙被砸穿一个豁口，墙根堆着碎砖。',
  },
  staircase: {
    name: '残楼梯', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '水泥台阶缺了边角，铁扶手锈得发暗。',
  },
  arch_window: {
    name: '拱窗', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '石砌拱形窗只剩空框，棂条断了两根。',
  },
  scaffold: {
    name: '脚手架', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '钢管脚手架歪架在墙边，扣件松了一半。',
  },
  trash_bin: {
    name: '铁皮垃圾桶', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '圆桶垃圾桶翻盖敞着，桶壁被踩出几个坑。',
  },
  mailbox: {
    name: '旧邮箱', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '深蓝色邮箱翻着投信口，旗片锈成褐色。',
  },
  billboard_frame: {
    name: '广告牌架', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '空广告牌铁架立在两根立柱上，面板早被拆走。',
  },
  broken_pillar: {
    name: '断石柱', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '半截石柱歪倒，柱头裂成碎瓣，柱身爬着裂纹。',
  },

  // ---------------- 第三批 AI 道具：废旧家具 ----------------
  armchair: {
    name: '破扶手椅', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '坐垫撕出大洞，弹簧翘着，扶手包皮磨穿。',
  },
  wooden_table: {
    name: '瘸腿木桌', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '三条腿垫着碎砖，桌面裂着长缝，沾着干涸的油渍。',
  },
  broken_chair: {
    name: '散架木椅', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '靠背断了两根横档，椅面翘成斜面。',
  },
  iron_bed: {
    name: '铁架床', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '锈铁架床板塌了一半，床垫霉得发黑。',
  },
  drawer_cabinet: {
    name: '抽屉柜', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '几格抽屉半开，拉手掉了两个，柜角磕出凹痕。',
  },
  sideboard: {
    name: '餐边矮柜', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '旧木矮柜门歪斜，台面积着一层灰。',
  },
  cracked_mirror: {
    name: '裂框镜子', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '镜面爬满蛛网裂纹，木框起皮脱落。',
  },
  toilet: {
    name: '破马桶', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '陶瓷马桶发黄开裂，水箱盖不知去向。',
  },
  wash_basin: {
    name: '旧水槽', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '挂墙搪瓷水槽锈住龙头，池壁结着垢。',
  },

  // ---------------- 第三批 AI 道具：工业机械 ----------------
  oil_tank: {
    name: '立式储油罐', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '立式锈罐架在短腿上，罐顶接管弯曲，漆面成片剥落。',
  },
  engine_block: {
    name: '旧发动机', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '裸机缸体积着油泥，附件皮带轮缺了大半。',
  },
  water_pump: {
    name: '水泵机组', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '电机连带离心泵，进出水管锈死在法兰上。',
  },
  gas_cylinder: {
    name: '气瓶', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '立式高压气瓶阀口蒙尘，瓶身锈出一道深痕。',
  },
  radiator: {
    name: '旧暖气片', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '铸铁散热片堵满灰，接头处渗着锈水。',
  },
  air_duct: {
    name: '锈蚀风管', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '方形铁皮风管段，接缝开胶，叶片里塞满絮状物。',
  },
  battery_bank: {
    name: '电池组', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '一排旧工业电池单元接线松散，外壳鼓着锈包。',
  },
  drill_press: {
    name: '台钻', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '台式钻床立柱歪斜，钻头夹里空无一物。',
  },
  old_lathe: {
    name: '旧车床', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '废弃普通车床导轨磨亮，卡盘上夹着半截废件。',
  },

  // ---------------- 第三批 AI 道具：户外废墟 ----------------
  traffic_cone: {
    name: '压扁路锥', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '褪色塑料路锥被车压扁，反光条磨没了。',
  },
  road_block: {
    name: '水泥路障', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '混凝土隔离墩边角崩裂，表面糊着旧漆皮。',
  },
  shopping_cart: {
    name: '锈购物车', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '铁丝购物车缺了一轮，筐网歪向一边。',
  },
  wreck_bicycle: {
    name: '旧自行车', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '锈自行车斜靠着，车胎瘪平，链条脱落。',
  },
  boulder: {
    name: '风化石块', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '灰灰岩块裂成几瓣，表面蒙着风沙。',
  },
  dead_bush: {
    name: '枯灌木', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '一丛枯死的细枝灌木，没有一片叶子。',
  },
  plank_pile: {
    name: '断木板堆', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '长短不一的旧木板摞在一起，端头钉着锈钉。',
  },
  phone_booth: {
    name: '破电话亭', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '铁皮电话亭玻璃全碎，门板凹陷，顶盖锈穿。',
  },
  sign_post: {
    name: '歪斜路牌', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '木柱路牌歪向一侧，牌面字迹被雨冲光。',
  },

  // ---------------- 第三批 AI 道具：容器杂物 ----------------
  cardboard_box: {
    name: '压扁纸箱', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '胶带发黄的纸箱被压扁，边角受潮发软。',
  },
  suitcase: {
    name: '旧行李箱', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '皮箱磨得起毛，提手断裂，锁扣锈死。',
  },
  backpack: {
    name: '丢弃背包', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '帆布背包撕裂一道口子，背带耷拉着。',
  },
  bucket: {
    name: '铁皮水桶', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '镀锌铁皮桶凹了一块，桶梁锈得发暗。',
  },
  wicker_basket: {
    name: '破竹篮', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '藤条篮脱了好几根篾，篮底塌出一个洞。',
  },
  medicine_box: {
    name: '壁挂药柜', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '墙上小药柜门半掩，玻璃蒙着一层灰。',
  },
  first_aid_case: {
    name: '急救箱', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '金属急救箱掉漆，红十字磨得只剩淡痕。',
  },
  gas_can: {
    name: '汽油桶', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '红色铁皮油桶瘪着，旋塞口渗着干硬油渍。',
  },
  bottle_jars: {
    name: '瓶罐杂物堆', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '几个旧玻璃瓶和罐头罐摞在一起，标签全糊。',
  },

  // ---------------- 第四批 AI 道具：医疗专用件 ----------------
  iv_drip: {
    name: '输液架', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '落地输液杆挂着空囊袋，滚轮锈住，管路垂到地上。',
  },
  medicine_cart: {
    name: '换药推车', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '不锈钢两层推车，抽屉半开，盘面结着干涸药渍。',
  },
  wheelchair: {
    name: '破轮椅', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '旧轮椅大轮变形，扶手蒙皮开裂，刹车拉杆断掉。',
  },
  microscope: {
    name: '旧显微镜', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '蒙尘的台式显微镜，物镜缺了一只，调焦轮打滑。',
  },
  filing_cabinet: {
    name: '病历柜', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '铁皮多斗柜抽屉卡死半格，把手掉了两个，柜面掉漆。',
  },
  sterilizer: {
    name: '灭菌锅', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '立式高压灭菌锅压力表归零，锅盖密封圈发硬开裂。',
  },
  xray_viewer: {
    name: '观片灯箱', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '挂墙 X 光观片灯箱发黑，夹着半张碎裂的胶片。',
  },
  surgical_light: {
    name: '无影灯', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '悬吊式手术无影灯横臂歪斜，灯罩里灯泡全碎。',
  },
  petri_stack: {
    name: '培养器皿堆', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '几摞培养皿和试剂瓶混在一起，皿底结着干膜。',
  },

  // ---------------- 第四批 AI 道具：农田农具 ----------------
  plow: {
    name: '旧铁犁', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '锈蚀的犁铧斜靠在木架上，刃口卷了边。',
  },
  hay_bale: {
    name: '干草捆', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '压扁的干草捆散出碎秸秆，捆绳朽得发脆。',
  },
  water_barrel: {
    name: '储水缸', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '木制箍桶存着浑水，铁箍锈穿一块，桶身渗水。',
  },
  chicken_coop: {
    name: '小鸡舍', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '木板鸡舍顶塌一角，栅栏门歪斜，里面空无一物。',
  },
  windmill: {
    name: '残破风车', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '农场老风车叶片缺了大半，塔身木架爬着锈。',
  },
  sack_stack: {
    name: '粮袋堆', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '几个旧麻袋摞在一起，袋口散开，漏出干瘪谷粒。',
  },
  wooden_cart: {
    name: '木轮手推车', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '双轮木斗车车辐断了两根，车斗底板裂着长缝。',
  },
  scarecrow: {
    name: '稻草人', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '木杆上的稻草人衣裳破烂，草帽歪掉，秸秆露出来。',
  },
  crop_dryer: {
    name: '晾晒架', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '木梁搭成的晾晒架空空荡荡，横杆上挂着碎布条。',
  },

  // ---------------- 第四批 AI 道具：港口 / 轨道机械 ----------------
  bollard: {
    name: '系船柱', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '码头锈铸铁系船柱，柱身缠着半截断缆绳。',
  },
  anchor: {
    name: '旧船锚', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '锈船锚斜靠在墙边，锚爪豁了一个缺口。',
  },
  ship_propeller: {
    name: '螺旋桨', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '废弃铜质船用螺旋桨，叶片缺角，轮毂积着水垢。',
  },
  pallet: {
    name: '木托盘', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '货运木托盘板条开裂，垫块朽烂，钉子外露。',
  },
  hand_cart: {
    name: '拖板车', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '两轮平板手推车板面凹陷，扶手管锈穿。',
  },
  rail_buffer: {
    name: '挡车器', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '轨道尽头的锈铁缓冲挡，木楔烂成一截。',
  },
  signal_box: {
    name: '信号箱', solid: true, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '铁路信号控制箱门敞开，面板按钮脱落，线缆外露。',
  },
  coil_rigging: {
    name: '索具卷', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '盘成圈的旧缆绳和钢索，绳皮磨出毛刺。',
  },
  mooring_chain: {
    name: '锚链堆', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '一摞粗重的锈锚链，链环之间卡着海泥。',
  },

  // ---------------- 第四批 AI 道具：植被自然件 ----------------
  pine_dead: {
    name: '枯松树', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '高大的死松枝桠光秃，树皮剥落，树干劈着裂缝。',
  },
  stump: {
    name: '树桩', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '风化老树桩露出断根，截面年轮发黑开裂。',
  },
  reed_cluster: {
    name: '芦苇丛', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '一丛干枯芦苇和香蒲，穗子垂向水面。',
  },
  mushroom_cluster: {
    name: '蘑菇簇', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '几株红顶小蘑菇簇生在潮黑的泥地上。',
  },
  tangled_root: {
    name: '盘根', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '露出地表的纠结老根，虬结成一团。',
  },
  grass_tuft: {
    name: '枯草簇', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '一小撮发干发黄的枯草，根须扎进裂土。',
  },
  fern: {
    name: '枯蕨', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '蔫掉的蕨类叶片卷边发褐，贴在地面上。',
  },
  dry_cactus: {
    name: '枯仙人掌', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '干瘪发皱的仙人掌，刺座发黑，株身歪倒。',
  },
  fallen_log: {
    name: '倒木', solid: false, interact: null, loot: null, questTarget: null, destructible: false,
    desc: '横在地上的腐木，树皮脱落，木心生着霉斑。',
  },
}

// 190 间房的专属摆放物（rp_<roomId>_NN）：数据来自 rooms/index.js，
// 与内置 kind 一样参与 solid / interact / loot / questTarget 判定。
Object.assign(PROPS, ROOM_PROP_DEFS)

/** 所有 kind（顺序稳定，便于校验 / 生成美术表） */
export const PROP_KINDS = Object.keys(PROPS)

/** 需要工具的 kind 分组 */
export const PROPS_BY_INTERACT = PROP_KINDS.reduce((acc, kind) => {
  const it = PROPS[kind].interact
  if (!it) return acc
  ;(acc[it] = acc[it] || []).push(kind)
  return acc
}, {})

/** 有产出物的 kind */
export const LOOTABLE_PROPS = PROP_KINDS.filter((k) => PROPS[k].loot)

/** 可破坏的 kind */
export const DESTRUCTIBLE_PROPS = PROP_KINDS.filter((k) => PROPS[k].destructible)

/** 阻挡通行的 kind */
export const SOLID_PROPS = PROP_KINDS.filter((k) => PROPS[k].solid)

const FALLBACK = {
  name: '未知物件',
  solid: false,
  interact: null,
  loot: null,
  questTarget: null,
  destructible: false,
  desc: '',
}

/**
 * 取一个道具定义。未知 kind 返回一份安全的空定义（不抛错，
 * 避免内容拼错一个字母就让整间房生成失败）。
 */
export function getProp(kind) {
  const def = PROPS[kind]
  if (def) return def
  return FALLBACK
}

/** 是否阻挡通行 */
export function isPropSolid(kind) {
  return !!getProp(kind).solid
}

/** 交互所需工具（null = 无工具要求） */
export function propInteract(kind) {
  return getProp(kind).interact || null
}

/** 搜刮产出 item id（null = 无） */
export function propLoot(kind) {
  return getProp(kind).loot || null
}

/** 是否是任务目标型道具（relay / generator / antenna / terminal…） */
export function isQuestProp(kind) {
  const d = getProp(kind)
  return !!(d.questTarget || d.interact === 'rescue')
}

/** 交互提示文案（UI 用；不带工具要求时返回「搜刮」） */
export function propPrompt(kind) {
  const d = getProp(kind)
  if (d.interact === 'rescue') return '撬开'
  if (!d.interact) return d.loot ? '搜刮' : '查看'
  const label = { shovel: '挖掘', pickaxe: '破拆', welder: '切割', scanner: '扫描', talk: '交谈' }
  return label[d.interact] || '检查'
}
