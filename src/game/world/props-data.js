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
    interact: null,
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
}

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
