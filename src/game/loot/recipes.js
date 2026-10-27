// 合成 / 维修 / 拆解配方。契约见 docs/CONTENT-API.md §2（KIND.RECIPE）。
// 设计原则：
//   - 配方只描述「消耗什么、得到什么」，不碰游戏状态；扣料/产物由 craft() 在背包上完成。
//   - repair 类型的 output 为 null，返回 repair 描述给 game 应用（修耐久/修已装备组件）。
//   - salvage 类型把组件拆成材料，产物多于一件时用 outputs 数组，output 取第一件（兼容契约）。
//   - station：workbench（工作台）| chem_table（化学台）| recycler（拆解台）。
import { Content, KIND } from '../core/registry.js'

export const STATION = Object.freeze({
  WORKBENCH: 'workbench',
  CHEM_TABLE: 'chem_table',
  RECYCLER: 'recycler',
})

export const STATION_LABEL = Object.freeze({
  workbench: '工作台',
  chem_table: '化学台',
  recycler: '拆解台',
})

export const RECIPE_CATEGORY = Object.freeze({
  CRAFT: 'craft',
  REPAIR: 'repair',
  SALVAGE: 'salvage',
})

function recipe(id, def) {
  return Content.register(KIND.RECIPE, id, { id, ...def })
}

// ---------------------------------------------------------------------------
// repair —— 维修：吃掉材料，修好一件（通常是已装备的）组件
// ---------------------------------------------------------------------------

recipe('repair_bearing', {
  name: '修复轴承',
  en: 'Repair Bearing',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'scrap_plate', n: 1 },
    { id: 'lubricant', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'bearing', slot: 'joint', amount: 40 },
  time: 5,
  desc: '把变形的滚道敲回去，补两颗滚珠，灌满油。修好的轴承会响，但能转。',
})

recipe('repair_servo_motor', {
  name: '重绕伺服电机',
  en: 'Rewind Servo Motor',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'scrap_plate', n: 2 },
    { id: 'copper_wire', n: 2 },
    { id: 'lubricant', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'servo_motor', slot: 'joint', amount: 35 },
  time: 12,
  desc: '拆开外壳，把烧黑的那一组线包重绕。绕歪一圈，转速就会差一点，但总比拖着腿走强。',
})

recipe('repair_board_cpu', {
  name: '补主板',
  en: 'Patch Mainboard',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'copper_wire', n: 2 },
    { id: 'chemical', n: 1 },
    { id: 'solder', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'board_cpu', slot: 'cpu', amount: 30 },
  time: 14,
  desc: '换掉鼓包的电容，用细铜线飞过断掉的走线。上电前先祈祷，上电后先看烟。',
})

recipe('repair_hydraulic_rod', {
  name: '修液压杆',
  en: 'Repair Hydraulic Rod',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'scrap_plate', n: 2 },
    { id: 'rubber', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'hydraulic_rod', slot: 'joint', amount: 30 },
  time: 10,
  desc: '换油封，抛光活塞杆上的划痕，补一小块焊。漏出来的那点油，抹在门轴上刚好。',
})

recipe('repair_reactor_core', {
  name: '稳压反应堆芯',
  en: 'Stabilize Reactor Core',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'rare_earth', n: 2 },
    { id: 'chemical', n: 2 },
    { id: 'uranium_dust', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'reactor_core', slot: 'power', amount: 50 },
  time: 18,
  desc: '换掉老化的屏蔽垫，补一格燃料，把输出压回标称值。手要稳，屏住呼吸，别数辐射。',
})

recipe('repair_battery_cell', {
  name: '重配电池芯',
  en: 'Rebuild Battery Cell',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'copper_wire', n: 1 },
    { id: 'chemical', n: 1 },
    { id: 'lead_plate', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'battery_cell', slot: 'power', amount: 35 },
  time: 8,
  desc: '把鼓包的两节换掉，剩下的做均衡，再包一层铅皮。别用金属镊子，也别用牙咬。',
})

recipe('repair_sensor_unit', {
  name: '校准传感器',
  en: 'Calibrate Sensor',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'copper_wire', n: 1 },
    { id: 'glass_shard', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'sensor_unit', slot: 'sensor', amount: 40 },
  time: 6,
  desc: '擦掉探头上的酸蚀层，换一片保护玻璃，拿已知浓度的东西重新标一遍。读数信一半。',
})

recipe('repair_optical_module', {
  name: '修光模块',
  en: 'Repair Optical Module',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'glass_shard', n: 2 },
    { id: 'copper_wire', n: 1 },
    { id: 'chemical', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'optical_module', slot: 'cpu', amount: 35 },
  time: 12,
  desc: '尾纤断在接口里，得用酸把胶泡开，再熔一次。熔歪了也还能用，只是看得近一点。',
})

recipe('repair_military_shell', {
  name: '补装甲外壳',
  en: 'Patch Military Shell',
  station: 'workbench',
  category: 'repair',
  inputs: [
    { id: 'scrap_plate', n: 3 },
    { id: 'titan_alloy', n: 1 },
    { id: 'lead_plate', n: 1 },
  ],
  output: null,
  repair: { target: 'component', item: 'military_shell', slot: 'armor', amount: 45 },
  time: 16,
  desc: '把凹坑顶出来，从内侧贴一块钛板，缝里灌铅。补完会重两公斤，挨那一下的时候不觉得重。',
})

// ---------------------------------------------------------------------------
// craft —— 制作：材料变成品
// ---------------------------------------------------------------------------

recipe('craft_bandage', {
  name: '做绷带',
  en: 'Make Bandages',
  station: 'chem_table',
  category: 'craft',
  inputs: [
    { id: 'cloth', n: 2 },
    { id: 'rubber', n: 1 },
  ],
  output: { id: 'bandage', n: 2 },
  time: 3,
  desc: '布条裁成条，衬一层薄橡胶防渗，煮过再晾干。不算干净，但比直接裹强。',
})

recipe('craft_battery_shell', {
  name: '敲电池壳',
  en: 'Hammer Battery Shell',
  station: 'workbench',
  category: 'craft',
  inputs: [{ id: 'scrap_plate', n: 2 }],
  output: { id: 'battery_shell', n: 1 },
  time: 4,
  desc: '把铁皮剪成展开图，卷圆，咬口，敲紧。正极帽的位置要留准，偏一点就装不进电箱。',
})

recipe('craft_battery_cell', {
  name: '组装电池芯',
  en: 'Assemble Battery Cell',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'battery_shell', n: 1 },
    { id: 'copper_wire', n: 2 },
    { id: 'chemical', n: 1 },
  ],
  output: { id: 'battery_cell', n: 1 },
  time: 9,
  desc: '卷极片，灌电解液，封口，测电压。每一步都有味道，每一步都不能急。',
})

recipe('craft_cell_small', {
  name: '做小电池',
  en: 'Make Small Cells',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'battery_shell', n: 1 },
    { id: 'copper_wire', n: 1 },
    { id: 'chemical', n: 1 },
  ],
  output: { id: 'cell_small', n: 2 },
  time: 5,
  desc: '边角料也能做，容量小，胜在快。一次做两节，一节总会先漏。',
})

recipe('craft_cell_large', {
  name: '做大电池',
  en: 'Make Large Cell',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'battery_shell', n: 2 },
    { id: 'battery_cell', n: 1 },
    { id: 'lead_plate', n: 1 },
  ],
  output: { id: 'cell_large', n: 1 },
  time: 11,
  desc: '两壳套一节，铅板做隔层，扎带勒紧。拎着像块砖，插上去能多跑半个循环。',
})

recipe('craft_repair_kit', {
  name: '打包维修包',
  en: 'Pack Repair Kit',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'cloth', n: 1 },
    { id: 'chemical', n: 1 },
    { id: 'scrap_plate', n: 1 },
  ],
  output: { id: 'repair_kit', n: 1 },
  time: 7,
  desc: '铁盒里塞补片、密封胶、润滑脂，再抄一张自己看得懂的图。别人打开会骂人。',
})

recipe('craft_acid_neutralizer', {
  name: '配酸中和剂',
  en: 'Mix Neutralizer',
  station: 'chem_table',
  category: 'craft',
  inputs: [
    { id: 'chemical', n: 2 },
    { id: 'cement', n: 1 },
  ],
  output: { id: 'acid_neutralizer', n: 1 },
  time: 6,
  desc: '碱性粉掺生石灰，磨细，过筛。撒上去会发热冒泡，别在密闭空间里开盖。',
})

recipe('craft_lubricant', {
  name: '熬润滑油',
  en: 'Render Lubricant',
  station: 'chem_table',
  category: 'craft',
  inputs: [
    { id: 'oil_sludge', n: 2 },
    { id: 'chemical', n: 1 },
  ],
  output: { id: 'lubricant', n: 2 },
  time: 5,
  desc: '油泥加热，沉淀，滤掉金属屑，兑一点轻质油。颜色还是很脏，关节不在乎。',
})

recipe('craft_dog_food', {
  name: '压狗粮',
  en: 'Press Dog Food',
  station: 'chem_table',
  category: 'craft',
  inputs: [
    { id: 'oil_sludge', n: 1 },
    { id: 'chemical', n: 1 },
    { id: 'scrap_plate', n: 1 },
  ],
  output: { id: 'dog_food', n: 2 },
  time: 4,
  desc: '铁屑、油脂、一点糖，压成颗粒。机械狗闻不出好坏，但吃得出来有没有糖。',
})

recipe('craft_gyro', {
  name: '装陀螺仪',
  en: 'Build Gyroscope',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'bearing', n: 1 },
    { id: 'copper_wire', n: 2 },
    { id: 'aluminum_sheet', n: 1 },
  ],
  output: { id: 'gyro', n: 1 },
  time: 12,
  desc: '三只轴承套成三个轴，绕线做定子，铝壳减重。上电后要等它自己找到北。',
})

recipe('craft_sensor_unit', {
  name: '组装传感器',
  en: 'Assemble Sensor Unit',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'board_cpu', n: 1 },
    { id: 'copper_wire', n: 2 },
    { id: 'glass_shard', n: 1 },
  ],
  output: { id: 'sensor_unit', n: 1 },
  time: 10,
  desc: '旧主板上裁一块，接探头，罩玻璃，灌胶。标的数不准，但变化是真的。',
})

recipe('craft_optical_module', {
  name: '熔光模块',
  en: 'Fuse Optical Module',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'glass_shard', n: 2 },
    { id: 'copper_wire', n: 1 },
    { id: 'solder', n: 1 },
  ],
  output: { id: 'optical_module', n: 1 },
  time: 9,
  desc: '把断掉的尾纤重新熔上，套管，打胶，测损耗。熔两次就能有一次过。',
})

recipe('craft_solar_film', {
  name: '贴光伏膜',
  en: 'Lay Solar Film',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'aluminum_sheet', n: 1 },
    { id: 'glass_shard', n: 2 },
    { id: 'chemical', n: 1 },
  ],
  output: { id: 'solar_film', n: 1 },
  time: 8,
  desc: '铝板做衬，玻璃压平，膜贴上刮气泡。阴天也能发一点，够你多走一段路。',
})

recipe('craft_ram_stick', {
  name: '焊内存条',
  en: 'Solder RAM Stick',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'rare_earth', n: 1 },
    { id: 'board_cpu', n: 1 },
    { id: 'solder', n: 1 },
  ],
  output: { id: 'ram_stick', n: 1 },
  time: 13,
  desc: '从主板上吹下颗粒，植球，回焊到空条上。成功率和手抖的程度成反比。',
})

recipe('craft_shovel', {
  name: '打一把铲',
  en: 'Forge Shovel',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'steel_rod', n: 1 },
    { id: 'scrap_plate', n: 1 },
  ],
  output: { id: 'shovel', n: 1 },
  time: 6,
  desc: '铁板裁出铲头，磨刃，钢管做柄，铆两下。挖土够用，打架也凑合。',
})

recipe('craft_pickaxe', {
  name: '打一把镐',
  en: 'Forge Pickaxe',
  station: 'workbench',
  category: 'craft',
  inputs: [
    { id: 'steel_rod', n: 2 },
    { id: 'scrap_plate', n: 2 },
    { id: 'rubber', n: 1 },
  ],
  output: { id: 'pickaxe', n: 1 },
  time: 9,
  desc: '两头锻尖，淬火，缠胶带。锤头要用铁丝再箍一道，不然第三下就飞。',
})

// ---------------------------------------------------------------------------
// salvage —— 拆解：组件变材料，产量稳定但永远亏
// ---------------------------------------------------------------------------

recipe('salvage_servo_motor', {
  name: '拆伺服电机',
  en: 'Salvage Servo',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'servo_motor', n: 1 }],
  output: { id: 'scrap_plate', n: 1 },
  outputs: [
    { id: 'scrap_plate', n: 1 },
    { id: 'copper_wire', n: 1 },
    { id: 'bearing', n: 1 },
  ],
  time: 4,
  desc: '拆外壳，抽线包，取磁钢和轴承。装回去是不可能的，材料倒是实在。',
})

recipe('salvage_bearing', {
  name: '拆轴承',
  en: 'Salvage Bearing',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'bearing', n: 1 }],
  output: { id: 'scrap_plate', n: 1 },
  outputs: [{ id: 'scrap_plate', n: 1 }],
  time: 2,
  desc: '滚珠留着，套圈砸平。一个轴承换一小块铁皮，这买卖谁做谁亏。',
})

recipe('salvage_board_cpu', {
  name: '拆主板',
  en: 'Salvage Mainboard',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'board_cpu', n: 1 }],
  output: { id: 'copper_wire', n: 2 },
  outputs: [
    { id: 'copper_wire', n: 2 },
    { id: 'glass_shard', n: 1 },
    { id: 'solder', n: 1 },
  ],
  time: 4,
  desc: '热风枪吹下元件，撕铜箔，刮锡。板子越新，拆出来的东西越多。',
})

recipe('salvage_optical_module', {
  name: '拆光模块',
  en: 'Salvage Optical Module',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'optical_module', n: 1 }],
  output: { id: 'glass_shard', n: 2 },
  outputs: [
    { id: 'glass_shard', n: 2 },
    { id: 'copper_wire', n: 1 },
  ],
  time: 3,
  desc: '砸开陶瓷壳，取透镜和尾纤。镜片很薄，十片里能完整取下两片。',
})

recipe('salvage_hydraulic_rod', {
  name: '拆液压杆',
  en: 'Salvage Hydraulic Rod',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'hydraulic_rod', n: 1 }],
  output: { id: 'steel_rod', n: 1 },
  outputs: [
    { id: 'steel_rod', n: 1 },
    { id: 'rubber', n: 1 },
  ],
  time: 5,
  desc: '放油，切缸筒，取活塞杆。油接在桶里还能用，别倒在地上。',
})

recipe('salvage_battery_cell', {
  name: '拆电池芯',
  en: 'Salvage Battery Cell',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'battery_cell', n: 1 }],
  output: { id: 'lead_plate', n: 1 },
  outputs: [
    { id: 'lead_plate', n: 1 },
    { id: 'chemical', n: 1 },
  ],
  time: 4,
  desc: '切开外壳，取铅板，电解液倒进带盖的桶。手上有伤口就别干这个。',
})

recipe('salvage_cell_large', {
  name: '拆大电池',
  en: 'Salvage Large Cell',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'cell_large', n: 1 }],
  output: { id: 'lead_plate', n: 1 },
  outputs: [
    { id: 'lead_plate', n: 1 },
    { id: 'battery_shell', n: 1 },
    { id: 'chemical', n: 1 },
  ],
  time: 3,
  desc: '敲开外壳，把还能用的电芯挑出来，剩下的按材料分。鼓包的不要碰。',
})

recipe('salvage_military_shell', {
  name: '拆军用外壳',
  en: 'Salvage Military Shell',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'military_shell', n: 1 }],
  output: { id: 'titan_alloy', n: 1 },
  outputs: [
    { id: 'titan_alloy', n: 1 },
    { id: 'scrap_plate', n: 2 },
  ],
  time: 8,
  desc: '等离子切不开，只能用砂轮磨。磨下来的粉要收好，那也是钱。',
})

recipe('salvage_processor', {
  name: '拆处理器',
  en: 'Salvage Processor',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'processor', n: 1 }],
  output: { id: 'rare_earth', n: 1 },
  outputs: [
    { id: 'rare_earth', n: 1 },
    { id: 'copper_wire', n: 2 },
    { id: 'solder', n: 1 },
  ],
  time: 6,
  desc: '一颗处理器里有几十种元素，你只能分离出两三种。剩下的随酸水倒掉。',
})

recipe('salvage_reactor_core', {
  name: '拆反应堆芯',
  en: 'Salvage Reactor Core',
  station: 'recycler',
  category: 'salvage',
  inputs: [{ id: 'reactor_core', n: 1 }],
  output: { id: 'rare_earth', n: 3 },
  outputs: [
    { id: 'rare_earth', n: 3 },
    { id: 'uranium_dust', n: 1 },
    { id: 'graphite_rod', n: 1 },
  ],
  time: 15,
  desc: '拆开一个堆芯，等于拆开半个城市。屏蔽要戴好，计数器响了就往外走，别回头。',
})

// ---------------------------------------------------------------------------
// 查询 / 执行
// ---------------------------------------------------------------------------

/** 配方产物列表（兼容只有 output 的旧数据） */
export function outputsOf(def) {
  if (!def) return []
  if (Array.isArray(def.outputs) && def.outputs.length) return def.outputs
  return def.output ? [def.output] : []
}

/** 该配方还缺什么： [{id, need, have, n}]，n 是还差的数量 */
export function missingInputs(inv, def) {
  const missing = []
  if (!def || !Array.isArray(def.inputs)) return missing
  for (const inp of def.inputs) {
    const have = inv && typeof inv.count === 'function' ? inv.count(inp.id) : 0
    if (have < inp.n) missing.push({ id: inp.id, need: inp.n, have, n: inp.n - have })
  }
  return missing
}

/**
 * 列出全部配方及是否可做。
 * @returns {Array<{def:object, canCraft:boolean, missing:Array}>}
 */
export function availableRecipes(inv) {
  return Content.all(KIND.RECIPE).map((def) => {
    const missing = missingInputs(inv, def)
    return { def, canCraft: missing.length === 0, missing }
  })
}

/** 只看某个台子/类别的可做配方 */
export function availableAt(inv, station, category = null) {
  return availableRecipes(inv).filter((r) => {
    if (r.def.station !== station) return false
    if (category && r.def.category !== category) return false
    return true
  })
}

/** 某个 id 的配方定义 */
export function recipeDef(recipeId) {
  return Content.get(KIND.RECIPE, recipeId)
}

/** 按 category 过滤：craft | repair | salvage */
export function recipesByCategory(category) {
  return Content.filter(KIND.RECIPE, (d) => d.category === category)
}

/** 配方数量 */
export function recipeCount() {
  return Content.count(KIND.RECIPE)
}

/**
 * 执行配方：扣料 → 加产物。产物放不下时回滚，不吞材料。
 * repair 类配方不产物品，返回 repair 描述给 game 应用。
 * @returns {{ok:boolean, reason?:string, recipeId?:string, outputs?:Array, repair?:object|null, missing?:Array}}
 */
export function craft(inv, recipeId) {
  const def = Content.get(KIND.RECIPE, recipeId)
  if (!def) return { ok: false, reason: 'unknown_recipe' }
  if (!inv || typeof inv.has !== 'function' || typeof inv.add !== 'function') {
    return { ok: false, reason: 'no_inventory' }
  }

  const missing = missingInputs(inv, def)
  if (missing.length) return { ok: false, reason: 'missing', missing }

  const outs = outputsOf(def)
  // 先粗查一遍产物空间，减少回滚（回滚仍然保留，处理多产物叠加的情况）
  for (const o of outs) {
    if (typeof inv.canAdd === 'function' && !inv.canAdd(o.id, o.n)) {
      return { ok: false, reason: inv.lastError || 'slots', missing: [] }
    }
  }

  const taken = []
  for (const inp of def.inputs) {
    const got = inv.remove(inp.id, inp.n)
    taken.push({ id: inp.id, n: got })
  }

  const added = []
  let failed = null
  for (const o of outs) {
    const got = inv.add(o.id, o.n)
    added.push({ id: o.id, n: got })
    if (got < o.n && !failed) failed = { id: o.id, want: o.n, got }
  }

  if (failed) {
    // 回滚：撤掉已加产物，退回材料
    for (const a of added) {
      if (a.n > 0) inv.remove(a.id, a.n)
    }
    for (const t of taken) {
      if (t.n > 0) inv.add(t.id, t.n)
    }
    return { ok: false, reason: inv.lastError || 'slots', failed, missing: [] }
  }

  return {
    ok: true,
    recipeId,
    outputs: added,
    repair: def.repair || null,
    time: Number(def.time) || 0,
  }
}

/** 便捷判断：只问能不能做 */
export function canCraft(inv, recipeId) {
  const def = Content.get(KIND.RECIPE, recipeId)
  if (!def) return false
  return missingInputs(inv, def).length === 0
}

export default {
  craft,
  availableRecipes,
  availableAt,
  canCraft,
  recipeDef,
  recipesByCategory,
  outputsOf,
  missingInputs,
  recipeCount,
  STATION,
  RECIPE_CATEGORY,
}
