// 物品目录（catalog）—— 酸雨废土世界的基础物资、组件、工具、消耗品、稀有件与任务物。
// 契约见 docs/CONTENT-API.md §2 / §10。数据在模块顶层注册，被 import 时自动生效。
// 风格约束：desc 冷、干、具体；写清材质、尺寸、用途暗示，不写情绪，不写中二台词。
import { Content, KIND } from '../core/registry.js'

// 分类常量：UI 排序与 loot/recipes 的 category 判定都用这一份，避免拼写漂移。
export const ITEM_CATEGORY = Object.freeze({
  MATERIAL: 'material',
  COMPONENT: 'component',
  TOOL: 'tool',
  CONSUMABLE: 'consumable',
  ARTIFACT: 'artifact',
  DATA: 'data',
  RARE: 'rare',
  QUEST: 'quest',
})

// 装备槽位（与 §10 一致）
export const EQUIP_SLOT = Object.freeze({
  JOINT: 'joint',
  CPU: 'cpu',
  POWER: 'power',
  ARMOR: 'armor',
  SENSOR: 'sensor',
  UTILITY: 'utility',
})

export const EQUIP_SLOT_ORDER = Object.freeze([
  EQUIP_SLOT.JOINT,
  EQUIP_SLOT.CPU,
  EQUIP_SLOT.POWER,
  EQUIP_SLOT.ARMOR,
  EQUIP_SLOT.SENSOR,
  EQUIP_SLOT.UTILITY,
])

// 稀有度中文标签（UI 用）
export const RARITY_LABEL = Object.freeze({
  1: '常见',
  2: '少见',
  3: '稀有',
  4: '军用',
  5: '孤品',
})

export const CATEGORY_LABEL = Object.freeze({
  material: '材料',
  component: '组件',
  tool: '工具',
  consumable: '消耗品',
  artifact: '遗物',
  data: '数据',
  rare: '稀有件',
  quest: '任务物',
})

// 统一注册入口：省掉重复的 id 字段，返回值是注册表里的条目。
function item(id, def) {
  return Content.register(KIND.ITEM, id, { id, ...def })
}

// ---------------------------------------------------------------------------
// material —— 材料：废铁、有色金属、土建、化工、稀土、放射物
// ---------------------------------------------------------------------------

item('scrap_plate', {
  name: '废铁板',
  en: 'Scrap Plate',
  category: 'material',
  rarity: 1,
  weight: 1.6,
  value: 6,
  stack: 40,
  desc: '从楼板上撬下来的镀锌板，边缘卷曲，还带着半截钉子和一枚锈死的螺丝。三块能拼出一扇像样的门。',
  tags: ['metal', 'scrap', 'build'],
  art: 'plate',
})

item('steel_rod', {
  name: '钢筋',
  en: 'Rebar',
  category: 'material',
  rarity: 1,
  weight: 2.4,
  value: 8,
  stack: 20,
  desc: '一截带肋钢筋，断口是被液压剪咬的，不是锯的。当撬棍太短，当矛太长，当建筑材料刚好。',
  tags: ['metal', 'build', 'rod'],
  art: 'rod',
})

item('aluminum_sheet', {
  name: '铝板',
  en: 'Aluminum Sheet',
  category: 'material',
  rarity: 2,
  weight: 0.9,
  value: 14,
  stack: 20,
  desc: '航空铝，一面还印着褪色的编号和检验章。轻，不导磁，酸雨里比铁板多撑两个雨季。',
  tags: ['metal', 'light', 'build'],
  art: 'sheet',
})

item('copper_wire', {
  name: '铜线',
  en: 'Copper Wire',
  category: 'material',
  rarity: 2,
  weight: 0.3,
  value: 10,
  stack: 60,
  desc: '一卷剥了皮的铜线，粗细不均，是有人从变压器里硬拽出来的。导电，也能当绑扎绳用。',
  tags: ['copper', 'wire', 'conductive'],
  art: 'wire',
})

item('rubber', {
  name: '橡胶',
  en: 'Rubber',
  category: 'material',
  rarity: 1,
  weight: 0.7,
  value: 7,
  stack: 40,
  desc: '轮胎内胎剪下的橡胶片，表层龟裂，内侧还滑着粉。密封、减震、补鞋底，都能凑合。',
  tags: ['rubber', 'seal', 'flexible'],
  art: 'rubber',
})

item('cloth', {
  name: '布料',
  en: 'Cloth',
  category: 'material',
  rarity: 1,
  weight: 0.2,
  value: 4,
  stack: 50,
  desc: '从窗帘和床单上撕下的布条，洗过太多次，薄得能看见手指。裹伤口、擦镜头、做滤网。',
  tags: ['fabric', 'bandage', 'filter'],
  art: 'cloth',
})

item('cement', {
  name: '水泥',
  en: 'Cement',
  category: 'material',
  rarity: 1,
  weight: 2.5,
  value: 5,
  stack: 20,
  desc: '半袋结块的水泥，纸袋一碰就碎。筛一筛还能用，抹在墙缝上，挡得住风，挡不住雨。',
  tags: ['stone', 'build'],
  art: 'bag',
})

item('chemical', {
  name: '化学品',
  en: 'Chemicals',
  category: 'material',
  rarity: 2,
  weight: 0.8,
  value: 15,
  stack: 30,
  desc: '没有标签的塑料桶，残留着三种颜色的沉淀。开盖要屏住呼吸，关盖要记得拧两圈。',
  tags: ['chem', 'reagent', 'hazard'],
  art: 'canister',
})

item('rare_earth', {
  name: '稀土矿',
  en: 'Rare Earth Ore',
  category: 'material',
  rarity: 3,
  weight: 0.5,
  value: 45,
  stack: 20,
  desc: '拳头大的一块黑褐色矿石，断面泛着油光。磁性极强，能吸住一串铁钉，也能烧掉一块主板。',
  tags: ['rare', 'magnet', 'ore'],
  art: 'ore',
})

item('uranium_dust', {
  name: '铀尘',
  en: 'Uranium Dust',
  category: 'material',
  rarity: 4,
  weight: 0.3,
  value: 90,
  stack: 12,
  desc: '装在铅衬铁盒里的黄色粉末，盒盖内侧有一圈手写的辐射标志。计数器靠近它会叫得像警报。',
  tags: ['radioactive', 'rare', 'hazard'],
  art: 'vial',
})

item('glass_shard', {
  name: '碎玻璃',
  en: 'Glass Shards',
  category: 'material',
  rarity: 1,
  weight: 0.4,
  value: 3,
  stack: 40,
  desc: '一整块窗玻璃碎成的几十片，挑几块平的还能当镜片。边缘比刀片耐用，也更难取出来。',
  tags: ['glass', 'sharp'],
  art: 'shard',
})

item('plastic_chunk', {
  name: '塑料块',
  en: 'Plastic Chunk',
  category: 'material',
  rarity: 1,
  weight: 0.35,
  value: 3,
  stack: 40,
  desc: '熔过又凝固的塑料，颜色是几种废料混出来的脏绿。刀削不动，锯开会冒白烟。',
  tags: ['plastic', 'insulator'],
  art: 'chunk',
})

item('lead_plate', {
  name: '铅板',
  en: 'Lead Plate',
  category: 'material',
  rarity: 2,
  weight: 3.2,
  value: 18,
  stack: 15,
  desc: '从旧 X 光室墙上拆下的铅板，一米见方，折痕处发白。沉得离谱，但能挡住不该进来的东西。',
  tags: ['metal', 'shield', 'heavy'],
  art: 'plate',
})

item('titan_alloy', {
  name: '钛合金锭',
  en: 'Titanium Ingot',
  category: 'material',
  rarity: 3,
  weight: 1.8,
  value: 60,
  stack: 10,
  desc: '巴掌长的银灰锭子，侧面打着军用批号，被砂轮切过一角。锉刀在上面只留下一条浅痕。',
  tags: ['metal', 'military', 'rare'],
  art: 'ingot',
})

item('carbon_fiber', {
  name: '碳纤维',
  en: 'Carbon Fiber',
  category: 'material',
  rarity: 3,
  weight: 0.4,
  value: 38,
  stack: 20,
  desc: '一束未浸胶的碳丝，黑得发哑，揉起来像头发。断口会扎进指腹，取出来要用镊子。',
  tags: ['carbon', 'light', 'rare'],
  art: 'fiber',
})

item('oil_sludge', {
  name: '油泥',
  en: 'Oil Sludge',
  category: 'material',
  rarity: 1,
  weight: 1.1,
  value: 4,
  stack: 30,
  desc: '从油底壳刮出来的黑泥，混着金属屑和一点水。能烧，能润滑，能把手洗成三天洗不掉的颜色。',
  tags: ['oil', 'fuel', 'dirty'],
  art: 'bucket',
})

item('ceramic_plate', {
  name: '陶瓷片',
  en: 'Ceramic Plate',
  category: 'material',
  rarity: 1,
  weight: 0.6,
  value: 6,
  stack: 30,
  desc: '从高压绝缘子上敲下的瓷片，釉面还有半朵蓝花。绝缘、耐酸，就是经不起再一次敲。',
  tags: ['ceramic', 'insulator'],
  art: 'shard',
})

item('silica_sand', {
  name: '硅砂',
  en: 'Silica Sand',
  category: 'material',
  rarity: 1,
  weight: 1.3,
  value: 4,
  stack: 30,
  desc: '筛过的细白砂，装在剪开的饮料瓶里。烧玻璃、做滤芯、垫在电箱底下防潮都用得上。',
  tags: ['sand', 'glass', 'filter'],
  art: 'pouch',
})

item('sulfur_lump', {
  name: '硫磺块',
  en: 'Sulfur Lump',
  category: 'material',
  rarity: 1,
  weight: 0.9,
  value: 6,
  stack: 25,
  desc: '从排污管口结出来的黄色硬块，敲开有硫磺味。配化学品能中和酸，配错了会放出更糟的东西。',
  tags: ['chem', 'sulfur', 'hazard'],
  art: 'lump',
})

item('graphite_rod', {
  name: '石墨棒',
  en: 'Graphite Rod',
  category: 'material',
  rarity: 2,
  weight: 0.7,
  value: 12,
  stack: 20,
  desc: '反应堆里退下来的慢化棒，表面有一层细灰。导电耐热，写字也顺手，就是永远擦不干净。',
  tags: ['carbon', 'conductive', 'reactor'],
  art: 'rod',
})

item('solder', {
  name: '焊锡',
  en: 'Solder',
  category: 'material',
  rarity: 2,
  weight: 0.25,
  value: 9,
  stack: 40,
  desc: '半卷含铅焊锡，缠在木轴上，锡丝中段被掐出过一排牙印。修电路时比胶布体面一百倍。',
  tags: ['metal', 'repair', 'electronics'],
  art: 'spool',
})

item('acid_sludge', {
  name: '酸泥',
  en: 'Acid Sludge',
  category: 'material',
  rarity: 2,
  weight: 1.0,
  value: 8,
  stack: 20,
  desc: '积在排水沟底的黄绿色稠泥，pH 试纸放进去会直接变白。能蚀穿鞋底，也能拿来清洗锈死的螺栓。',
  tags: ['acid', 'hazard', 'chem'],
  art: 'bucket',
})

item('ash_brick', {
  name: '灰砖',
  en: 'Ash Brick',
  category: 'material',
  rarity: 1,
  weight: 2.0,
  value: 3,
  stack: 25,
  desc: '用灰烬和水泥压出来的砖，比普通砖轻，保温差，敲起来声音发闷。垒墙够用，垒灶台会裂。',
  tags: ['stone', 'build'],
  art: 'brick',
})

item('wire_mesh', {
  name: '铁丝网',
  en: 'Wire Mesh',
  category: 'material',
  rarity: 1,
  weight: 0.8,
  value: 5,
  stack: 30,
  desc: '一卷锈成褐色的菱形网，剪口参差。挡不住人，挡得住爬虫和大多数会飞的东西。',
  tags: ['metal', 'mesh', 'build'],
  art: 'mesh',
})

item('lubricant', {
  name: '润滑油',
  en: 'Lubricant',
  category: 'material',
  rarity: 1,
  weight: 0.6,
  value: 12,
  stack: 20,
  desc: '黏稠、发黑，混着金属碎屑。瓶身标签写的是齿轮油，实际上什么关节都能灌，能再撑几个循环。',
  tags: ['oil', 'repair', 'joint'],
  use: { repair: 8, energy: 1 },
  art: 'bottle',
})

item('battery_shell', {
  name: '电池壳',
  en: 'Battery Shell',
  category: 'material',
  rarity: 1,
  weight: 0.5,
  value: 8,
  stack: 20,
  desc: '空的白铁皮电池壳，正极帽还在，负极片被人拆走了。塞进电芯和电解液就是一块能用的电池。',
  tags: ['metal', 'power', 'part'],
  art: 'shell',
})

// ---------------------------------------------------------------------------
// component —— 组件：可安装到机体槽位，带 slot + bonus
// ---------------------------------------------------------------------------

item('servo_motor', {
  name: '伺服电机',
  en: 'Servo Motor',
  category: 'component',
  rarity: 3,
  weight: 1.4,
  value: 70,
  stack: 6,
  desc: '拆自机械臂关节的伺服电机，编码器还在，轴端有一道被卡死的划痕。换上它，腿会听话很多。',
  tags: ['joint', 'motor', 'component'],
  slot: 'joint',
  bonus: { speed: 0.12, attack: 0.05 },
  art: 'motor',
})

item('bearing', {
  name: '轴承',
  en: 'Bearing',
  category: 'component',
  rarity: 2,
  weight: 0.4,
  value: 22,
  stack: 12,
  desc: '密封轴承，转起来有一声很轻的沙响。滚珠少了两颗，装到不承重的位置还能用一整个雨季。',
  tags: ['joint', 'mechanical', 'component'],
  slot: 'joint',
  bonus: { speed: 0.06 },
  art: 'bearing',
})

item('gyro', {
  name: '陀螺仪',
  en: 'Gyroscope',
  category: 'component',
  rarity: 3,
  weight: 0.6,
  value: 55,
  stack: 8,
  desc: '三轴陀螺，外壳有一道裂缝，用胶封过。上电后自检通过，落地时能替你少摔半跤。',
  tags: ['joint', 'balance', 'component'],
  slot: 'joint',
  bonus: { speed: 0.05, jump: 0.08 },
  art: 'gyro',
})

item('board_cpu', {
  name: '主板',
  en: 'Mainboard',
  category: 'component',
  rarity: 3,
  weight: 0.5,
  value: 80,
  stack: 8,
  desc: '一块绿色主板，电容鼓了两个，插槽里卡着半截断针。修一修能点亮，点不亮也能拆出不少铜。',
  tags: ['cpu', 'electronics', 'component'],
  slot: 'cpu',
  bonus: { energyMax: 8, scan: 0.05 },
  art: 'board',
})

item('ram_stick', {
  name: '内存条',
  en: 'RAM Stick',
  category: 'component',
  rarity: 2,
  weight: 0.08,
  value: 30,
  stack: 16,
  desc: '金手指被橡皮擦过很多次，颗粒上贴着写有日期的胶带。插上它能多记一点东西，也可能多蓝屏一次。',
  tags: ['cpu', 'memory', 'component'],
  slot: 'cpu',
  bonus: { energyMax: 4 },
  art: 'ram',
})

item('optical_module', {
  name: '光模块',
  en: 'Optical Module',
  category: 'component',
  rarity: 3,
  weight: 0.3,
  value: 65,
  stack: 10,
  desc: '带尾纤的收发模块，接口处套着防尘帽，帽子里积了灰。装上去，扫描的距离和精度都不太一样。',
  tags: ['cpu', 'optic', 'component'],
  slot: 'cpu',
  bonus: { scan: 0.15, energyMax: 2 },
  art: 'module',
})

item('processor', {
  name: '处理器',
  en: 'Processor',
  category: 'component',
  rarity: 4,
  weight: 0.2,
  value: 120,
  stack: 6,
  desc: '针脚密得数不清的处理器，基板四角有拆焊留下的焦痕。它还算得快，只是偶尔会自己算错。',
  tags: ['cpu', 'electronics', 'rare'],
  slot: 'cpu',
  bonus: { attack: 0.08, energyMax: 5 },
  art: 'chip',
})

item('hydraulic_rod', {
  name: '液压杆',
  en: 'Hydraulic Rod',
  category: 'component',
  rarity: 3,
  weight: 2.6,
  value: 58,
  stack: 6,
  desc: '工程机械上的液压杆，镀层磨掉一段，活塞杆上有细密划痕。撑得住两百公斤，漏油就得补。',
  tags: ['joint', 'hydraulic', 'component'],
  slot: 'joint',
  bonus: { carry: 0.15, attack: 0.05 },
  art: 'piston',
})

item('battery_cell', {
  name: '电池芯',
  en: 'Battery Cell',
  category: 'component',
  rarity: 2,
  weight: 1.2,
  value: 26,
  stack: 12,
  desc: '一板六节的锂电芯，两节已经鼓包，剩下的电压还算齐。并联起来够跑一段夜路。',
  tags: ['power', 'battery', 'component'],
  slot: 'power',
  bonus: { energyMax: 12 },
  art: 'cell',
})

item('sensor_unit', {
  name: '传感器单元',
  en: 'Sensor Unit',
  category: 'component',
  rarity: 2,
  weight: 0.25,
  value: 34,
  stack: 12,
  desc: '集成温湿度和辐射计的小方块，探头被酸雾蚀成磨砂色。读数偏一点，但还能告诉你该往哪走。',
  tags: ['sensor', 'detect', 'component'],
  slot: 'sensor',
  bonus: { scan: 0.2, radResist: 0.1 },
  art: 'sensor',
})

item('capacitor_bank', {
  name: '电容组',
  en: 'Capacitor Bank',
  category: 'component',
  rarity: 3,
  weight: 0.9,
  value: 48,
  stack: 8,
  desc: '一排螺栓固定的电解电容，最大的那只鼓了顶。上电时会嗡一声，那一瞬间够你跳一次。',
  tags: ['power', 'energy', 'component'],
  slot: 'power',
  bonus: { energyMax: 6, energyRegen: 0.02 },
  art: 'capacitor',
})

item('actuator_gear', {
  name: '齿轮组',
  en: 'Gear Set',
  category: 'component',
  rarity: 2,
  weight: 0.8,
  value: 24,
  stack: 10,
  desc: '一整套减速齿轮，齿面磨出镜光，其中一枚缺了半个齿。装到关节里会响，但扭矩实在。',
  tags: ['joint', 'mechanical', 'component'],
  slot: 'joint',
  bonus: { speed: 0.04, dig: 0.05 },
  art: 'gear',
})

item('coolant_pump', {
  name: '冷却泵',
  en: 'Coolant Pump',
  category: 'component',
  rarity: 3,
  weight: 1.1,
  value: 52,
  stack: 6,
  desc: '微型离心泵，叶轮被水垢卡过，转起来有细碎的摩擦声。装上去，连跑三个房间也不会烫停。',
  tags: ['utility', 'cooling', 'component'],
  slot: 'utility',
  bonus: { energyRegen: 0.03 },
  art: 'pump',
})

item('connector_bundle', {
  name: '接插件',
  en: 'Connector Bundle',
  category: 'material',
  rarity: 1,
  weight: 0.2,
  value: 9,
  stack: 20,
  desc: '一把剪断的航空插头和线束，针脚颜色还对得上。修东西时最缺的往往就是这一小把。',
  tags: ['electronics', 'wire', 'part'],
  art: 'connector',
})

item('solar_film', {
  name: '光伏膜',
  en: 'Solar Film',
  category: 'component',
  rarity: 3,
  weight: 0.35,
  value: 44,
  stack: 10,
  desc: '柔性光伏膜，背面胶还粘，正面有一道被酸雨烧出的白痕。阴天也有输出，只是少得可怜。',
  tags: ['armor', 'power', 'solar'],
  slot: 'armor',
  bonus: { energyRegen: 0.04 },
  art: 'film',
})

item('motor_brush', {
  name: '碳刷',
  en: 'Motor Brush',
  category: 'material',
  rarity: 1,
  weight: 0.05,
  value: 6,
  stack: 30,
  desc: '两根石墨碳刷，长度只剩原厂的三分之一。电机打火、转速不稳，换它比换电机便宜。',
  tags: ['motor', 'part', 'repair'],
  art: 'brush',
})

item('fuse', {
  name: '保险丝',
  en: 'Fuse',
  category: 'material',
  rarity: 1,
  weight: 0.05,
  value: 5,
  stack: 50,
  desc: '一盒玻璃管保险丝，规格混着装，其中三根已经烧黑。电子设备死于进水之前，通常先死于这个。',
  tags: ['electronics', 'part', 'repair'],
  art: 'fuse',
})

// ---------------------------------------------------------------------------
// tool —— 工具：手持/机械臂，slot utility + bonus
// ---------------------------------------------------------------------------

item('shovel', {
  name: '工兵铲',
  en: 'Entrenching Shovel',
  category: 'tool',
  rarity: 1,
  weight: 2.2,
  value: 18,
  stack: 1,
  desc: '折叠工兵铲，木柄换过一截，铲口被石头卷了刃。挖浅坑、撬木板、拍爬虫，都还算称手。',
  tags: ['tool', 'dig', 'melee'],
  slot: 'utility',
  bonus: { dig: 0.1, attack: 0.06 },
  art: 'shovel',
})

item('pickaxe', {
  name: '镐',
  en: 'Pickaxe',
  category: 'tool',
  rarity: 2,
  weight: 3.1,
  value: 34,
  stack: 1,
  desc: '一头尖一头扁的旧镐，柄上缠着防滑胶带，锤头用铁丝加固过两次。敲混凝土比敲人有用。',
  tags: ['tool', 'dig', 'melee'],
  slot: 'utility',
  bonus: { dig: 0.25, attack: 0.15 },
  art: 'pickaxe',
})

item('welder', {
  name: '焊枪',
  en: 'Arc Welder',
  category: 'tool',
  rarity: 3,
  weight: 2.0,
  value: 120,
  stack: 1,
  desc: '改装的电弧焊枪，线缆接头缠满绝缘胶布，扳机要按到底才起弧。能焊铁，也能把门烧开一个洞。',
  tags: ['tool', 'repair', 'melee'],
  slot: 'utility',
  bonus: { dig: 0.05, attack: 0.08 },
  use: { repair: 15, energy: 2 },
  art: 'welder',
})

item('scanner', {
  name: '扫描仪',
  en: 'Scanner',
  category: 'tool',
  rarity: 2,
  weight: 1.1,
  value: 90,
  stack: 1,
  desc: '手持扫描仪，屏幕左上角有一道压痕，按键要按两下才有反应。能看穿薄墙后面的金属和活物。',
  tags: ['tool', 'scan', 'sensor'],
  slot: 'utility',
  bonus: { scan: 0.3 },
  use: { scan: 1 },
  art: 'scanner',
})

item('wrench', {
  name: '扳手',
  en: 'Wrench',
  category: 'tool',
  rarity: 1,
  weight: 1.0,
  value: 14,
  stack: 1,
  desc: '活动扳手，蜗杆有点滑，咬不住大号螺母。当锤子用会崩口，当武器用会弯。',
  tags: ['tool', 'repair', 'melee'],
  slot: 'utility',
  bonus: { attack: 0.03 },
  art: 'wrench',
})

item('crowbar', {
  name: '撬棍',
  en: 'Crowbar',
  category: 'tool',
  rarity: 2,
  weight: 2.4,
  value: 20,
  stack: 1,
  desc: '一米长的六棱撬棍，一头弯钩一头扁凿，漆全掉了。门、箱子、锁扣，在它面前只是建议。',
  tags: ['tool', 'dig', 'melee'],
  slot: 'utility',
  bonus: { attack: 0.12, dig: 0.08 },
  art: 'crowbar',
})

item('core_drill', {
  name: '岩芯钻',
  en: 'Core Drill',
  category: 'tool',
  rarity: 4,
  weight: 5.6,
  value: 260,
  stack: 1,
  desc: '背包式岩芯钻，汽油机换成电机，钻头是钨钢的，还能咬动混凝土里的钢筋。重得让人想骂人。',
  tags: ['tool', 'dig', 'heavy'],
  slot: 'utility',
  bonus: { dig: 0.6 },
  use: { energy: 4 },
  art: 'drill',
})

item('multimeter', {
  name: '万用表',
  en: 'Multimeter',
  category: 'tool',
  rarity: 2,
  weight: 0.5,
  value: 40,
  stack: 1,
  desc: '指针式万用表，表笔是自己焊的，电阻档偏了半格。量不了精密的东西，量得出哪根线在骗你。',
  tags: ['tool', 'repair', 'scan'],
  slot: 'utility',
  bonus: { scan: 0.1 },
  art: 'meter',
})

item('signal_antenna', {
  name: '便携天线',
  en: 'Portable Antenna',
  category: 'tool',
  rarity: 3,
  weight: 1.6,
  value: 110,
  stack: 1,
  desc: '三节伸缩天线，底座带磁吸，馈线接口是 BNC 的。架高两米，能多收到一段不该收到的信号。',
  tags: ['tool', 'signal', 'scan'],
  slot: 'utility',
  bonus: { scan: 0.2 },
  use: { scan: 1 },
  art: 'antenna',
})

// ---------------------------------------------------------------------------
// consumable —— 消耗品：电池、维修、净化、药品、狗粮
// ---------------------------------------------------------------------------

item('cell_small', {
  name: '小电池',
  en: 'Small Cell',
  category: 'consumable',
  rarity: 1,
  weight: 0.3,
  value: 12,
  stack: 20,
  desc: '标准方块电池，外皮被酸雾咬出白斑，摇一摇里面有响动。还能放出小半格电，够跑一段。',
  tags: ['power', 'battery', 'consume'],
  use: { energy: 20 },
  art: 'cell_small',
})

item('cell_large', {
  name: '大电池',
  en: 'Large Cell',
  category: 'consumable',
  rarity: 2,
  weight: 1.1,
  value: 38,
  stack: 10,
  desc: '砖头大的动力电池，外壳有两道扎带勒痕，电量灯只剩一格在闪。插进机体能顶一阵。',
  tags: ['power', 'battery', 'consume'],
  use: { energy: 60 },
  art: 'cell_large',
})

item('repair_kit', {
  name: '维修包',
  en: 'Repair Kit',
  category: 'consumable',
  rarity: 2,
  weight: 1.5,
  value: 45,
  stack: 5,
  desc: '铁盒装的维修包，里面有补片、密封胶、两管润滑脂和一张看不懂的图。说明书是给别人写的。',
  tags: ['repair', 'consume'],
  use: { repair: 40 },
  art: 'kit',
})

item('acid_neutralizer', {
  name: '酸中和剂',
  en: 'Acid Neutralizer',
  category: 'consumable',
  rarity: 2,
  weight: 0.5,
  value: 30,
  stack: 10,
  desc: '碱性的白色粉末，装在带勺的塑料罐里。撒在关节和伤口上会发热，冒白沫，然后不疼了。',
  tags: ['chem', 'acid', 'consume'],
  use: { heal: 18, cleanse: 1 },
  art: 'powder',
})

item('rad_meds', {
  name: '抗辐射药',
  en: 'Anti-Rad Meds',
  category: 'consumable',
  rarity: 2,
  weight: 0.15,
  value: 35,
  stack: 10,
  desc: '铝箔板里的六粒白色药片，板背面印着已经过期四年的日期。吃了恶心，不吃更恶心。',
  tags: ['med', 'rad', 'consume'],
  use: { heal: 10, radClear: 1 },
  art: 'pills',
})

item('dog_food', {
  name: '机械狗粮',
  en: 'Mech Dog Food',
  category: 'consumable',
  rarity: 2,
  weight: 0.9,
  value: 22,
  stack: 10,
  desc: '压缩的金属颗粒，掺了一点润滑脂和糖。包装上印着一只四条腿的机器狗，看着比你开心。',
  tags: ['companion', 'repair', 'consume'],
  use: { energy: 12, repair: 5 },
  art: 'can',
})

item('bandage', {
  name: '绷带',
  en: 'Bandage',
  category: 'consumable',
  rarity: 1,
  weight: 0.1,
  value: 8,
  stack: 15,
  desc: '用布条和一片薄橡胶压出来的简易绷带，纱布层数不均。缠紧了会勒，缠松了会掉。',
  tags: ['med', 'bandage', 'consume'],
  use: { heal: 12 },
  art: 'bandage',
})

item('coolant_flask', {
  name: '冷却液瓶',
  en: 'Coolant Flask',
  category: 'consumable',
  rarity: 2,
  weight: 0.8,
  value: 24,
  stack: 8,
  desc: '一升装的不冻液，瓶口用生料带缠过。灌进背部的循环泵，能让发烫的机体再跑半小时。',
  tags: ['cooling', 'energy', 'consume'],
  use: { energy: 15 },
  art: 'flask',
})

item('fuel_canister', {
  name: '燃料罐',
  en: 'Fuel Canister',
  category: 'consumable',
  rarity: 3,
  weight: 3.0,
  value: 50,
  stack: 4,
  desc: '五升的铁皮油桶，桶身凹了一块，盖子里垫着橡胶。燃料有股甜味，烧起来烟是黑的。',
  tags: ['fuel', 'energy', 'consume'],
  use: { energy: 45 },
  art: 'canister',
})

item('flare', {
  name: '信号棒',
  en: 'Signal Flare',
  category: 'consumable',
  rarity: 1,
  weight: 0.2,
  value: 7,
  stack: 10,
  desc: '红色镁光信号棒，擦火帽有点潮，划三下才着。烧起来很亮，也很招东西。',
  tags: ['light', 'signal', 'consume'],
  use: { scan: 0.6, light: 1 },
  art: 'flare',
})

item('stim_patch', {
  name: '电击贴片',
  en: 'Stim Patch',
  category: 'consumable',
  rarity: 2,
  weight: 0.08,
  value: 28,
  stack: 12,
  desc: '两片自粘电极连着一只小电容，贴上去会强制上电一次。疼，但伺服会重新转起来。',
  tags: ['med', 'energy', 'consume'],
  use: { energy: 12, heal: 4 },
  art: 'patch',
})

// ---------------------------------------------------------------------------
// consumable —— 第二批：防护 / 进攻 / 治疗
// ---------------------------------------------------------------------------

item('shield_plate', {
  name: '磁力护盾板',
  en: 'Mag Shield Plate',
  category: 'consumable',
  rarity: 3,
  weight: 2.0,
  value: 72,
  stack: 5,
  desc: '三块叠在一起的复合板，边角焊了磁吸卡扣。拍在后背上会「咔」一声吸住，撑开一层淡蓝色的场。',
  tags: ['armor', 'shield', 'consume'],
  use: { buff: { key: 'shield_plate', name: '磁力护盾', dur: 30, stats: { armor: 0.3 } } },
  art: 'plate',
})

item('mirage_canister', {
  name: '折射雾罐',
  en: 'Mirage Canister',
  category: 'consumable',
  rarity: 2,
  weight: 0.9,
  value: 40,
  stack: 6,
  desc: '巴掌大的铝罐，拉开环会喷出一团折射微粒，贴着机体裹一层。雾里看你是重影，打你就容易打偏。',
  tags: ['armor', 'smoke', 'consume'],
  use: {
    cleanse: 1,
    buff: { key: 'mirage', name: '折射雾幕', dur: 18, stats: { armor: 0.16, speed: 0.1 } },
  },
  art: 'canister_small',
})

item('brace_kit', {
  name: '加固支架',
  en: 'Brace Kit',
  category: 'consumable',
  rarity: 2,
  weight: 2.4,
  value: 46,
  stack: 6,
  desc: '一套可调的斜撑，卡扣上刻着别家的编号。装上以后关节不再乱晃，挨打时也不容易散架。',
  tags: ['armor', 'repair', 'consume'],
  use: { heal: 8, buff: { key: 'brace', name: '加固支架', dur: 50, stats: { armor: 0.18 } } },
  art: 'kit',
})

item('emp_charge', {
  name: '电磁脉冲雷',
  en: 'EMP Charge',
  category: 'consumable',
  rarity: 3,
  weight: 1.2,
  value: 88,
  stack: 5,
  desc: '罐头大小的线圈炸弹，外壳缠了铜带。引爆后周围所有机体会短暂断电，伺服线一根根软下去。',
  tags: ['offense', 'emp', 'consume'],
  use: { emp: { radius: 280, damage: 30, stun: 2.6 } },
  art: 'charge',
})

item('firebomb', {
  name: '燃烧瓶',
  en: 'Firebomb',
  category: 'consumable',
  rarity: 2,
  weight: 1.0,
  value: 42,
  stack: 6,
  desc: '玻璃瓶装的稠油，瓶口塞着浸过油的布条。点着了往外扔，砸碎的地方会烧一阵子。',
  tags: ['offense', 'fire', 'consume'],
  use: { fire: { radius: 210, damage: 22 } },
  art: 'bottle',
})

item('overdrive_amp', {
  name: '超频放大器',
  en: 'Overdrive Amp',
  category: 'consumable',
  rarity: 3,
  weight: 1.3,
  value: 95,
  stack: 5,
  desc: '把主母线电压顶到标称值之上的一块小板。接上去时机体快得不像话，代价是壳体会更脆。',
  tags: ['offense', 'buff', 'consume'],
  use: {
    buff: {
      key: 'overdrive',
      name: '超频运转',
      dur: 20,
      stats: { attack: 4, speed: 0.18, armor: -0.06 },
    },
  },
  art: 'amp',
})

item('nano_syringe', {
  name: '纳米修复针',
  en: 'Nano Syringe',
  category: 'consumable',
  rarity: 3,
  weight: 0.2,
  value: 110,
  stack: 8,
  desc: '一次性注射器，里面的不是药，是一管会自己找裂缝的灰色浆液。推进关节缝里，能听见细小的滋滋声。',
  tags: ['med', 'heal', 'consume'],
  use: { heal: 34, cleanse: 1 },
  art: 'syringe',
})

item('med_gel', {
  name: '医用凝胶',
  en: 'Med Gel',
  category: 'consumable',
  rarity: 2,
  weight: 0.6,
  value: 36,
  stack: 8,
  desc: '管装的淡蓝色凝胶，管口挤出来是半透明的。抹在裂口上会自己流进去，然后慢慢变硬。',
  tags: ['med', 'heal', 'consume'],
  use: { heal: 24 },
  art: 'gel',
})

item('regen_patch', {
  name: '自愈贴片',
  en: 'Regen Patch',
  category: 'consumable',
  rarity: 2,
  weight: 0.1,
  value: 58,
  stack: 10,
  desc: '贴着皮肤的一面长着细小的纤维，撕下来以后还在抽动。贴上去会持续往伤口里送材料。',
  tags: ['med', 'heal', 'buff', 'consume'],
  use: { heal: 8, buff: { key: 'regen_patch', name: '自愈贴片', dur: 30, stats: { regen: 2 } } },
  art: 'patch',
})

// ---------------------------------------------------------------------------
// rare —— 稀有件：反应堆、军用外壳、量子芯片、卫星陀螺
// ---------------------------------------------------------------------------

item('reactor_core', {
  name: '反应堆芯',
  en: 'Reactor Core',
  category: 'rare',
  rarity: 5,
  weight: 4.5,
  value: 420,
  stack: 1,
  desc: '巴掌大的密封堆芯，外壳是整块车出来的，接缝处有蓝色氧化痕。不再发热，但靠近时计数器的声音会变。',
  tags: ['power', 'reactor', 'rare'],
  slot: 'power',
  bonus: { energyMax: 40, energyRegen: 0.08 },
  art: 'reactor',
})

item('military_shell', {
  name: '军用外壳',
  en: 'Military Shell',
  category: 'rare',
  rarity: 4,
  weight: 6.2,
  value: 300,
  stack: 1,
  desc: '覆合装甲外壳，内侧印着部队编号和血型，外侧有一处被击穿的凹坑，补过。穿上它，走路会沉，命会硬。',
  tags: ['armor', 'military', 'rare'],
  slot: 'armor',
  bonus: { armor: 0.18, hp: 20, radResist: 0.2 },
  art: 'armor',
})

item('quantum_chip', {
  name: '量子芯片',
  en: 'Quantum Chip',
  category: 'rare',
  rarity: 5,
  weight: 0.1,
  value: 520,
  stack: 1,
  desc: '封装在陶瓷壳里的量子芯片，引脚被金丝键合过，边缘有一道激光刻的序列号。它算的东西，你看不懂。',
  tags: ['cpu', 'quantum', 'rare'],
  slot: 'cpu',
  bonus: { scan: 0.4, energyMax: 10, attack: 0.1 },
  art: 'qchip',
})

item('satellite_gyro', {
  name: '卫星陀螺',
  en: 'Satellite Gyro',
  category: 'rare',
  rarity: 4,
  weight: 1.2,
  value: 260,
  stack: 1,
  desc: '从气象卫星姿态系统里拆下的陀螺，真空腔还好好的，支架上刻着发射年份。它记得自己该朝哪。',
  tags: ['sensor', 'gyro', 'rare'],
  slot: 'sensor',
  bonus: { scan: 0.3, jump: 0.1 },
  art: 'gyro_sat',
})

item('sentry_core', {
  name: '哨兵核心',
  en: 'Sentry Core',
  category: 'rare',
  rarity: 4,
  weight: 1.8,
  value: 210,
  stack: 2,
  desc: '失控哨兵的主控核心，散热片上还挂着焦黑的线路。通电后它会先问一遍口令，然后才肯听你的。',
  tags: ['cpu', 'combat', 'rare'],
  slot: 'cpu',
  bonus: { attack: 0.12 },
  art: 'core',
})

item('fusion_lattice', {
  name: '聚变格栅',
  en: 'Fusion Lattice',
  category: 'rare',
  rarity: 5,
  weight: 3.0,
  value: 480,
  stack: 1,
  desc: '钨合金格栅，每个孔里都嵌着未燃尽的燃料球，摸上去还是温的。它本来该待在一座反应堆里。',
  tags: ['power', 'fusion', 'rare'],
  slot: 'power',
  bonus: { energyMax: 30, energyRegen: 0.05 },
  art: 'lattice',
})

item('composite_armor', {
  name: '复合装甲板',
  en: 'Composite Armor',
  category: 'rare',
  rarity: 4,
  weight: 3.4,
  value: 180,
  stack: 1,
  desc: '陶瓷夹层加钛背板的装甲片，正面有三处崩瓷，背面完整。螺栓孔对得上大多数民用机体。',
  tags: ['armor', 'military', 'rare'],
  slot: 'armor',
  bonus: { armor: 0.12, hp: 10 },
  art: 'armor_plate',
})

item('arc_emitter', {
  name: '电弧发射器',
  en: 'Arc Emitter',
  category: 'rare',
  rarity: 5,
  weight: 2.2,
  value: 400,
  stack: 1,
  desc: '装在机械臂前端的电弧发射器，电容组是后配的，铭牌被磨掉了。充能时会有一股臭氧味。',
  tags: ['utility', 'weapon', 'rare'],
  slot: 'utility',
  bonus: { attack: 0.2 },
  art: 'emitter',
})

// ---------------------------------------------------------------------------
// quest —— 任务物：中继零件、灰雀的玩具、信号记录仪等
// ---------------------------------------------------------------------------

item('relay_part', {
  name: '中继器零件',
  en: 'Relay Part',
  category: 'quest',
  rarity: 3,
  weight: 1.9,
  value: 0,
  stack: 1,
  desc: '一整套中继站功放模块，散热鳍片断了两片，接口封着防水胶。没有它，信号传不出这条街。',
  tags: ['quest', 'signal', 'relay'],
  art: 'relay',
})

item('huique_toy', {
  name: '灰雀的玩具',
  en: 'Greyfinch Toy',
  category: 'quest',
  rarity: 2,
  weight: 0.3,
  value: 0,
  stack: 1,
  desc: '一只铁皮小鸟，发条断了，翅膀还能动。底面用钉子刻了两个字，刻得很浅，要侧着光才看得见。',
  tags: ['quest', 'toy', 'child'],
  art: 'toy_bird',
})

item('signal_recorder', {
  name: '信号记录仪',
  en: 'Signal Recorder',
  category: 'quest',
  rarity: 4,
  weight: 1.2,
  value: 0,
  stack: 1,
  desc: '带磁带仓的记录仪，磁带卡在里面取不出来，播放键被按平了。里面有一个女人的声音，循环了十一年。',
  tags: ['quest', 'data', 'signal'],
  art: 'recorder',
})

item('keycard_archive', {
  name: '档案库门禁卡',
  en: 'Archive Keycard',
  category: 'quest',
  rarity: 3,
  weight: 0.05,
  value: 0,
  stack: 1,
  desc: '磁条门禁卡，卡面照片被人撕掉了，只剩一小块胶。背面用圆珠笔写着一个日期和一个不是名字的编号。',
  tags: ['quest', 'key', 'archive'],
  art: 'keycard',
})

item('factory_valve', {
  name: '熔渣工厂阀栓',
  en: 'Slagworks Valve',
  category: 'quest',
  rarity: 3,
  weight: 2.2,
  value: 0,
  stack: 1,
  desc: '铜质阀栓，螺纹里塞满黑色的渣，转不动。工厂铭牌上写着它是三号线的最后一环。',
  tags: ['quest', 'factory', 'valve'],
  art: 'valve',
})

item('water_sample', {
  name: '水样瓶',
  en: 'Water Sample',
  category: 'quest',
  rarity: 2,
  weight: 0.6,
  value: 0,
  stack: 1,
  desc: '棕色玻璃瓶，瓶口封着蜡，标签上的采样点编号被人改成了一串看不懂的符号。水是清的，这不对劲。',
  tags: ['quest', 'sample', 'water'],
  art: 'bottle',
})

item('drone_blackbox', {
  name: '无人机黑匣子',
  en: 'Drone Black Box',
  category: 'quest',
  rarity: 4,
  weight: 0.9,
  value: 0,
  stack: 1,
  desc: '罩着钢壳的飞行记录仪，外壳被高温烧出彩虹色。指示灯还在慢闪，说明它觉得任务还没有结束。',
  tags: ['quest', 'data', 'drone'],
  art: 'blackbox',
})

item('antenna_dish', {
  name: '天线碟',
  en: 'Antenna Dish',
  category: 'quest',
  rarity: 4,
  weight: 4.2,
  value: 0,
  stack: 1,
  desc: '拼装式抛物面天线，碟面有一道贯穿的裂缝，馈源还在。架起来能指向山那边，也可能指向别的东西。',
  tags: ['quest', 'signal', 'antenna'],
  art: 'dish',
})

// ---------------------------------------------------------------------------
// 人类生活用品 —— 按房间主题散落：厨房、卧室、教室、旅馆、码头、工地、机房
// ---------------------------------------------------------------------------

item('kettle', {
  name: '电水壶',
  en: 'Electric Kettle',
  category: 'material',
  rarity: 1,
  weight: 1.1,
  value: 8,
  stack: 4,
  desc: '白色塑料外壳的电水壶，底座不见了，壶嘴有一圈烧焦的痕。壶盖内侧贴着手写的「烧开再喝」。',
  tags: ['household', 'kitchen'],
  art: 'kettle',
})

item('umbrella_old', {
  name: '旧雨伞',
  en: 'Old Umbrella',
  category: 'material',
  rarity: 1,
  weight: 0.8,
  value: 5,
  stack: 6,
  desc: '伞骨断了两根，伞面补过三块不同颜色的布。撑开时能挡住酸雨，也只能挡住一会儿。',
  tags: ['household', 'rain'],
  art: 'umbrella',
})

item('wall_clock', {
  name: '挂钟',
  en: 'Wall Clock',
  category: 'material',
  rarity: 1,
  weight: 1.3,
  value: 10,
  stack: 4,
  desc: '圆形石英挂钟，停在四点十七分。玻璃罩上有指印，从里侧按上去的那种。',
  tags: ['household', 'time'],
  art: 'clock',
})

item('old_shoe', {
  name: '旧皮鞋',
  en: 'Worn Shoe',
  category: 'material',
  rarity: 1,
  weight: 0.6,
  value: 3,
  stack: 10,
  desc: '左脚的皮鞋，鞋头磨出了白底，鞋带被打了死结。鞋垫下压着一张折过很多次的公交票。',
  tags: ['household', 'cloth'],
  art: 'shoe',
})

item('toothbrush', {
  name: '牙刷',
  en: 'Toothbrush',
  category: 'material',
  rarity: 1,
  weight: 0.1,
  value: 2,
  stack: 10,
  desc: '刷毛已经发黄，手柄上用记号笔写了名字，字迹被擦掉了一半。',
  tags: ['household', 'bathroom'],
  art: 'brush',
})

item('soap_bar', {
  name: '肥皂',
  en: 'Soap Bar',
  category: 'consumable',
  rarity: 1,
  weight: 0.2,
  value: 3,
  stack: 10,
  desc: '半块洗衣皂，表面刻着厂标，边缘被水泡得发软。刮掉表面还能闻出一点皂角味。',
  tags: ['household', 'bathroom', 'clean'],
  art: 'soap',
})

item('lunchbox', {
  name: '铝饭盒',
  en: 'Tin Lunchbox',
  category: 'material',
  rarity: 1,
  weight: 0.7,
  value: 6,
  stack: 6,
  desc: '长方铝饭盒，卡扣松了，里面是一层干掉的面条和一把缠着胶布的小勺。',
  tags: ['household', 'kitchen'],
  art: 'lunchbox',
})

item('folding_chair', {
  name: '折叠椅',
  en: 'Folding Chair',
  category: 'material',
  rarity: 1,
  weight: 2.4,
  value: 7,
  stack: 3,
  desc: '铁管折叠椅，椅面的人造革裂成一张地图。坐上去会先晃一下，再慢慢稳住。',
  tags: ['household', 'furniture'],
  art: 'chair',
})

item('desk_fan', {
  name: '台式风扇',
  en: 'Desk Fan',
  category: 'material',
  rarity: 1,
  weight: 2.0,
  value: 9,
  stack: 3,
  desc: '三叶台扇，网罩变形，扇叶上积着一层黑色的灰。插上电会先咳两声，然后转起来。',
  tags: ['household', 'appliance'],
  art: 'fan',
})

item('old_tv', {
  name: '旧电视',
  en: 'Old TV',
  category: 'material',
  rarity: 2,
  weight: 6.5,
  value: 18,
  stack: 1,
  desc: '显像管电视，屏幕中央有一道烧灼的黑斑。打开只有雪花，偶尔能听见半句新闻。',
  tags: ['household', 'appliance', 'electronic'],
  art: 'tv',
})

item('microwave', {
  name: '微波炉',
  en: 'Microwave',
  category: 'material',
  rarity: 2,
  weight: 5.5,
  value: 16,
  stack: 1,
  desc: '转盘裂了一半，门上的金属网被撬开过。里面放着一只没有取出来的搪瓷杯。',
  tags: ['household', 'appliance', 'kitchen'],
  art: 'microwave',
})

item('fridge', {
  name: '冰箱',
  en: 'Refrigerator',
  category: 'material',
  rarity: 2,
  weight: 12,
  value: 24,
  stack: 1,
  desc: '单门冰箱，门封条老化，压缩机早就不转了。冷冻层结着霜，霜里冻着几张便签。',
  tags: ['household', 'appliance', 'kitchen'],
  art: 'fridge',
})

item('washer', {
  name: '洗衣机',
  en: 'Washing Machine',
  category: 'material',
  rarity: 2,
  weight: 11,
  value: 22,
  stack: 1,
  desc: '波轮洗衣机，桶里还有半桶发黑的水。脱水时的声音像有人在里面敲桶壁。',
  tags: ['household', 'appliance'],
  art: 'washer',
})

item('typewriter', {
  name: '打字机',
  en: 'Typewriter',
  category: 'material',
  rarity: 3,
  weight: 4.8,
  value: 30,
  stack: 1,
  desc: '机械打字机，色带干成一条硬边。滚筒上夹着一张没打完的信，最后一行重复了同一个字。',
  tags: ['household', 'office', 'writing'],
  art: 'typewriter',
})

item('camera_old', {
  name: '旧相机',
  en: 'Old Camera',
  category: 'material',
  rarity: 2,
  weight: 0.9,
  value: 26,
  stack: 2,
  desc: '旁轴胶片相机，取景窗有裂纹，快门还能按。胶卷仓里剩着一张曝光过度的底片。',
  tags: ['household', 'electronic', 'photo'],
  art: 'camera',
})

item('radio', {
  name: '收音机',
  en: 'Radio',
  category: 'material',
  rarity: 2,
  weight: 1.4,
  value: 20,
  stack: 2,
  desc: '便携收音机，天线断了一截。夜里能把旋钮拧到一个只播报数字的频道。',
  tags: ['household', 'electronic', 'signal'],
  art: 'radio',
})

item('textbook', {
  name: '旧课本',
  en: 'Textbook',
  category: 'material',
  rarity: 1,
  weight: 0.8,
  value: 6,
  stack: 6,
  desc: '封皮被磨白的课本，页边写满铅笔批注。最后几页被撕掉了，断口很整齐。',
  tags: ['household', 'school', 'book'],
  art: 'book',
})

item('pencil_case', {
  name: '文具盒',
  en: 'Pencil Case',
  category: 'material',
  rarity: 1,
  weight: 0.3,
  value: 4,
  stack: 8,
  desc: '铁皮文具盒，盖子上印着已经褪色的卡通图案。里面有两支削短的铅笔和一个掰弯的圆规。',
  tags: ['household', 'school'],
  art: 'pencil',
})

item('globe', {
  name: '地球仪',
  en: 'Globe',
  category: 'material',
  rarity: 2,
  weight: 1.8,
  value: 15,
  stack: 1,
  desc: '桌面地球仪，支架锈死。海面被刮掉一层，露出一片不属于任何国家的底色。',
  tags: ['household', 'school'],
  art: 'globe',
})

item('microscope', {
  name: '显微镜',
  en: 'Microscope',
  category: 'material',
  rarity: 3,
  weight: 3.2,
  value: 40,
  stack: 1,
  desc: '单目光学显微镜，物镜少了一个，载物台上还夹着一片标本。看进去只有一团缓慢移动的东西。',
  tags: ['household', 'school', 'science'],
  art: 'microscope',
})

item('hard_hat', {
  name: '安全帽',
  en: 'Hard Hat',
  category: 'material',
  rarity: 1,
  weight: 1.0,
  value: 8,
  stack: 6,
  desc: '黄色安全帽，帽檐裂了一道，内衬上的编号被磨掉。戴着能挡落石，也能挡一次钝击。',
  tags: ['household', 'work', 'armor'],
  art: 'helmet',
})

item('power_drill', {
  name: '电钻',
  en: 'Power Drill',
  category: 'tool',
  rarity: 2,
  weight: 2.6,
  value: 28,
  stack: 1,
  desc: '手枪式电钻，电池仓用胶带缠着，钻头断在夹头里。转速还能调，声音很大。',
  tags: ['household', 'tool', 'work'],
  art: 'drill',
})

item('bucket', {
  name: '铁皮水桶',
  en: 'Tin Bucket',
  category: 'material',
  rarity: 1,
  weight: 1.2,
  value: 5,
  stack: 6,
  desc: '镀锌铁皮桶，桶底有一处焊补。提手是弯的，拎起来会歪向一边。',
  tags: ['household', 'tool', 'water'],
  art: 'bucket',
})

item('fishing_rod', {
  name: '鱼竿',
  en: 'Fishing Rod',
  category: 'tool',
  rarity: 2,
  weight: 1.5,
  value: 18,
  stack: 1,
  desc: '三节玻璃钢鱼竿，导环缺了两个，轮座还能用。线轴上缠着一段发绿的旧线。',
  tags: ['household', 'tool', 'water'],
  art: 'rod',
})

item('hotel_keycard', {
  name: '旅馆房卡',
  en: 'Hotel Keycard',
  category: 'material',
  rarity: 1,
  weight: 0.05,
  value: 0,
  stack: 6,
  desc: '白色磁卡，正面印着旅馆标志，房号被磨掉了。背面贴着一张写着「不用打扫」的纸条。',
  tags: ['household', 'key', 'hotel'],
  art: 'keycard',
})

item('suitcase', {
  name: '旧行李箱',
  en: 'Suitcase',
  category: 'material',
  rarity: 2,
  weight: 3.6,
  value: 14,
  stack: 1,
  desc: '硬壳行李箱，拉链头没了，用铁丝别着。里面叠着两件没送洗的衬衫和一本空白护照。',
  tags: ['household', 'hotel', 'travel'],
  art: 'suitcase',
})

item('wristwatch', {
  name: '手表',
  en: 'Wristwatch',
  category: 'material',
  rarity: 2,
  weight: 0.1,
  value: 20,
  stack: 2,
  desc: '机械手表，表蒙有细划痕，表带是后配的。秒针还在走，比广播里的报时慢四分钟。',
  tags: ['household', 'time', 'jewelry'],
  art: 'watch',
})

item('brick', {
  name: '红砖',
  en: 'Red Brick',
  category: 'material',
  rarity: 1,
  weight: 2.2,
  value: 3,
  stack: 30,
  desc: '一块普通红砖，棱角磕掉了一点。侧面印着砖厂的缩写，被雨水泡得发白。',
  tags: ['household', 'build'],
  art: 'brick',
})

item('steel_mesh', {
  name: '钢丝网',
  en: 'Steel Mesh',
  category: 'material',
  rarity: 1,
  weight: 1.8,
  value: 7,
  stack: 10,
  desc: '被剪成方块的钢丝网，边缘卷曲，网格里卡着几片碎玻璃。铺在窗洞上很合适。',
  tags: ['household', 'build', 'metal'],
  art: 'mesh',
})

item('pressure_meter', {
  name: '压力表',
  en: 'Pressure Gauge',
  category: 'component',
  rarity: 2,
  weight: 0.9,
  value: 18,
  stack: 4,
  desc: '铜壳压力表，表面玻璃有一道裂纹，指针停在红区外。接头处还缠着生料带。',
  tags: ['industrial', 'gauge', 'component'],
  art: 'meter',
})

item('hand_pump', {
  name: '手摇泵',
  en: 'Hand Pump',
  category: 'tool',
  rarity: 2,
  weight: 3.4,
  value: 24,
  stack: 1,
  desc: '铸铁手摇泵，摇柄包着一层黑胶，进出水口都还在。压下去时会发出很长的吱声。',
  tags: ['industrial', 'tool', 'water'],
  art: 'pump',
})

item('valve_handle', {
  name: '阀门手轮',
  en: 'Valve Handwheel',
  category: 'component',
  rarity: 1,
  weight: 1.7,
  value: 9,
  stack: 6,
  desc: '红色铸铁手轮，轮辐断了一根，中心轴孔还带着键槽。拧起来很沉，但确实能转动。',
  tags: ['industrial', 'valve', 'component'],
  art: 'valve',
})

item('canvas_bag', {
  name: '帆布袋',
  en: 'Canvas Bag',
  category: 'material',
  rarity: 1,
  weight: 0.6,
  value: 4,
  stack: 8,
  desc: '厚帆布袋，提手被缝过两次，袋底有一圈洗不掉的泥。里面还剩半截粉笔。',
  tags: ['household', 'bag'],
  art: 'bag',
})

item('metal_dish', {
  name: '搪瓷盘',
  en: 'Enamel Plate',
  category: 'material',
  rarity: 1,
  weight: 0.4,
  value: 4,
  stack: 8,
  desc: '搪瓷盘，盘沿磕掉了几块瓷，露出黑色的铁。盘底印着一圈蓝色的麦穗图案。',
  tags: ['household', 'kitchen'],
  art: 'dish',
})

item('cloth_sheet', {
  name: '旧床单',
  en: 'Old Sheet',
  category: 'material',
  rarity: 1,
  weight: 0.9,
  value: 4,
  stack: 8,
  desc: '洗到发灰的棉布床单，中间有一大片洗不掉的黄渍。撕成条可以当绷带用。',
  tags: ['household', 'cloth'],
  art: 'sheet',
})

item('signal_flare', {
  name: '信号焰棒',
  en: 'Signal Flare',
  category: 'consumable',
  rarity: 2,
  weight: 0.4,
  value: 12,
  stack: 4,
  desc: '红色信号焰棒，外壳受潮，擦火头还能用。点燃后能亮三分钟，光很刺眼。',
  tags: ['household', 'light', 'survival'],
  art: 'flare',
})

item('gyro_compass', {
  name: '陀螺罗盘',
  en: 'Gyro Compass',
  category: 'component',
  rarity: 3,
  weight: 1.2,
  value: 35,
  stack: 1,
  desc: '航空陀螺罗盘，玻璃罩内有一小滴油。通电后指针会慢慢转向一个不属于北方的方向。',
  tags: ['industrial', 'navigation', 'component'],
  art: 'gyro',
})

item('rope_coil', {
  name: '缆绳',
  en: 'Rope Coil',
  category: 'material',
  rarity: 1,
  weight: 2.8,
  value: 8,
  stack: 6,
  desc: '盘成圈的尼龙缆绳，外层的编股磨毛了，绳头用火烧过。能承住一个人的重量。',
  tags: ['household', 'rope', 'harbor'],
  art: 'coil',
})

item('can', {
  name: '罐头',
  en: 'Tin Can',
  category: 'consumable',
  rarity: 1,
  weight: 0.4,
  value: 6,
  stack: 12,
  desc: '没有标签的铁皮罐头，拉环断了一半。里面的东西是咸的，嚼起来像浸过油的豆子。',
  tags: ['household', 'food'],
  art: 'can',
})

// ---------------------------------------------------------------------------
// 收藏品 —— 旧世代游戏机，全图仅一件，拾取后不再生成
// ---------------------------------------------------------------------------

item('collect_gba', {
  name: 'GBA 掌机',
  en: 'Game Boy Advance',
  category: 'artifact',
  rarity: 5,
  weight: 0.3,
  value: 0,
  stack: 1,
  unique: true,
  desc: '横版掌机，屏幕有一道斜划痕，电池仓盖用胶布粘着。开机后只剩下一格电和一段没有声音的开机动画。',
  tags: ['artifact', 'collectible', 'console', 'game'],
  art: 'console_gba',
})

item('collect_subor', {
  name: '小霸王学习机',
  en: 'Subor Learning Machine',
  category: 'artifact',
  rarity: 5,
  weight: 1.6,
  value: 0,
  stack: 1,
  unique: true,
  desc: '灰白色的键盘式主机，卡槽里插着一盘「学习卡」。接上电视，屏幕上出现的是九十年代的开机画面。',
  tags: ['artifact', 'collectible', 'console', 'game'],
  art: 'console_subor',
})

item('collect_ps1', {
  name: 'PlayStation 主机',
  en: 'PlayStation Console',
  category: 'artifact',
  rarity: 5,
  weight: 2.2,
  value: 0,
  stack: 1,
  unique: true,
  desc: '初代灰色 PlayStation，光驱盖卡住，托盘里有一张划花的碟。插电后风扇会先转起来。',
  tags: ['artifact', 'collectible', 'console', 'game'],
  art: 'console_ps',
})

item('collect_ps2', {
  name: 'PS2 主机',
  en: 'PlayStation 2',
  category: 'artifact',
  rarity: 5,
  weight: 2.4,
  value: 0,
  stack: 1,
  unique: true,
  desc: '薄版 PS2，竖放支架不见了。背面贴着一张保修贴，日期早于这个世界最后一场雨。',
  tags: ['artifact', 'collectible', 'console', 'game'],
  art: 'console_ps2',
})

item('collect_psp', {
  name: 'PSP 掌机',
  en: 'PlayStation Portable',
  category: 'artifact',
  rarity: 5,
  weight: 0.35,
  value: 0,
  stack: 1,
  unique: true,
  desc: '黑色 PSP，屏幕亮着，停在游戏标题界面。UMD 仓里没有碟，读盘灯却一直在闪。',
  tags: ['artifact', 'collectible', 'console', 'game'],
  art: 'console_psp',
})

item('game_cartridge', {
  name: '游戏卡带',
  en: 'Game Cartridge',
  category: 'artifact',
  rarity: 4,
  weight: 0.2,
  value: 0,
  stack: 1,
  unique: true,
  desc: '黄色塑料卡带，标签已经泡烂，金属触点发黑。擦干净后插进旧机器，还能亮起一个开始界面。',
  tags: ['artifact', 'collectible', 'console', 'game'],
  art: 'cartridge',
})

// ---------------------------------------------------------------------------
// 查询辅助：只读，供 UI / loot / recipes 使用
// ---------------------------------------------------------------------------

/** 全部物品定义（含遗物） */
export function allItems() {
  return Content.all(KIND.ITEM)
}

/** 按 id 取物品定义，不存在返回 null */
export function itemDef(id) {
  return Content.get(KIND.ITEM, id)
}

/** 按分类分组，返回 { category: [def, ...] } */
export function itemsByCategory() {
  const out = {}
  for (const def of allItems()) {
    const c = def.category || 'material'
    if (!out[c]) out[c] = []
    out[c].push(def)
  }
  return out
}

/** 带某个 tag 的物品 */
export function itemsWithTag(tag) {
  return Content.filter(KIND.ITEM, (d) => Array.isArray(d.tags) && d.tags.includes(tag))
}

/** 可安装到某槽位的物品 */
export function itemsForSlot(slot) {
  return Content.filter(KIND.ITEM, (d) => d.slot === slot)
}

/** 分类计数（自检/UI 用） */
export function categoryCounts() {
  const out = {}
  for (const def of allItems()) {
    const c = def.category || 'unknown'
    out[c] = (out[c] || 0) + 1
  }
  return out
}
