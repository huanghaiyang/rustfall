// 任务数据：两条主线、三条营救、九条支线。
//
// 字段约定（对齐 docs/CONTENT-API.md §5）：
//   id / title / en / type / giver / desc / objectives / rewards / next / repeatable
//
// objective: { id, type, target, count, label, npc? }
//   type ∈ collect | kill | reach | talk | repair | rescue | deliver | survive | inspect
//   · collect / deliver 的 target 是物品 id
//   · kill 的 target 是怪物 id
//   · reach 的 target 是房间 id
//   · repair 的 target 是地标 id
//   · talk 的 target 是同伴 id
//   · rescue 的 target 是营救任务 id
//   · deliver 可以带 npc 字段，表示要交给谁（运行时用来避免交错交付）
//
// 文案：所有 desc ≥ 40 字，所有 label ≥ 6 字。奖励只用安全物品 id。
// 一条主线跑完大概要二十多个循环——如果玩家活得下来的话。

import { Content, KIND } from '../../core/registry.js'

// ================================================================ 主线

Content.register(KIND.QUEST, 'main_signal', {
  id: 'main_signal',
  title: '信号源',
  en: 'THE SIGNAL',
  type: 'main',
  giver: 'baiya',
  desc:
    '白鸦在锈城塔顶截到一段重复了十一年的信号：三个短音，一个长音。她说这不叫求救，' +
    '求救不会这么有耐心。三座中继锈死了两座，第三座在工厂控制室的酸液里泡着。' +
    '修好它们，信号就能指向回收场深处——那里有个东西，一直在等一个回话。',
  objectives: [
    { id: 'relay_a', type: 'repair', target: 'relay_a', count: 1, label: '修复锈城塔顶的中继 A' },
    { id: 'relay_b', type: 'repair', target: 'relay_b', count: 1, label: '修复枯谷水井的中继 B' },
    { id: 'relay_c', type: 'repair', target: 'relay_c', count: 1, label: '修复工厂控制室的中继 C' },
    { id: 'reach_core', type: 'reach', target: 'dump_core', count: 1, label: '抵达回收场的核心' },
    { id: 'talk_ghost', type: 'talk', target: 'ghost', count: 1, label: '跟那个东西谈一谈' },
  ],
  rewards: {
    items: [
      { id: 'cell_large', n: 2 },
      { id: 'repair_kit', n: 1 },
    ],
    signal: 1,
    unlockChassis: ['spider'],
    flag: 'main_signal_done',
  },
  next: 'main_antenna',
  repeatable: false,
  tags: ['main', 'signal', 'relay'],
})

Content.register(KIND.QUEST, 'main_antenna', {
  id: 'main_antenna',
  title: '天线',
  en: 'THE ANTENNA',
  type: 'main',
  giver: 'ghost',
  desc:
    '幽灵说天线还能用，缺的是两段中继管和三份稀土——稀土在酸雨里会自己发光，捡的时候别用手。' +
    '它没说要把什么发出去，也没说发出去以后谁会听见。它只是每隔一会儿就重复一遍那段三个短音，' +
    '像一个已经等了太久的人，不再指望，但也没打算停。',
  objectives: [
    { id: 'part', type: 'collect', target: 'relay_part', count: 2, label: '收集中继管 ×2' },
    { id: 'rare', type: 'collect', target: 'rare_earth', count: 3, label: '收集稀土 ×3' },
    { id: 'antenna', type: 'repair', target: 'antenna_signal', count: 1, label: '修复信号天线' },
    { id: 'final', type: 'talk', target: 'ghost', count: 1, label: '听完幽灵的最后一句话' },
  ],
  rewards: {
    items: [
      { id: 'reactor_core', n: 1 },
      { id: 'cell_large', n: 2 },
    ],
    signal: 1,
    flag: 'ending_signal_sent',
  },
  next: null,
  repeatable: false,
  tags: ['main', 'signal', 'ending'],
})

// ================================================================ 营救

Content.register(KIND.QUEST, 'rescue_huique', {
  id: 'rescue_huique',
  title: '笼子里的孩子',
  en: 'THE CAGE',
  type: 'rescue',
  giver: 'baiya',
  desc:
    '贫民窟的巷子尽头多了一个铁笼，笼子上盖着防雨布。白鸦说里面关着个活人，小孩，八九岁，' +
    '还在数数。她没说要去救，也没说不去救，只是把撬棍放在门后的桌上，' +
    '然后转身去擦一把其实一点都不脏的扳手。',
  objectives: [
    { id: 'find', type: 'reach', target: 'city_slum', count: 1, label: '找到贫民窟巷尾的铁笼' },
    { id: 'open', type: 'rescue', target: 'rescue_huique', count: 1, label: '撬开牢笼救出灰雀' },
    { id: 'home', type: 'reach', target: 'city_shelter', count: 1, label: '把灰雀带回锈城避难所' },
  ],
  rewards: {
    items: [
      { id: 'cloth', n: 3 },
      { id: 'cell_small', n: 2 },
    ],
    signal: 1,
    flag: 'huique_home',
  },
  next: null,
  repeatable: false,
  tags: ['rescue', 'human', 'city'],
})

Content.register(KIND.QUEST, 'rescue_tiezhua', {
  id: 'rescue_tiezhua',
  title: '炉膛里的十一天',
  en: 'ELEVEN DAYS',
  type: 'rescue',
  giver: 'laoqian',
  desc:
    '老钎的旧搭档铁爪去熔渣工厂打捞，十一天没回来。老钎每天在村口坐一个循环，说再等等，' +
    '说那家伙只是又挖到好东西忘了时间。工厂的炉膛早就不烧了，但里面的温度还是能把人烤干——' +
    '如果人还活着，说明他在喝冷凝水，也说明他一直清醒着。',
  objectives: [
    { id: 'find', type: 'reach', target: 'factory_furnace', count: 1, label: '下到工厂的炉膛底部' },
    { id: 'open', type: 'rescue', target: 'rescue_tiezhua', count: 1, label: '打开炉膛里的铁笼' },
    { id: 'home', type: 'reach', target: 'village_shelter', count: 1, label: '把铁爪送回枯谷村避难所' },
  ],
  rewards: {
    items: [
      { id: 'hydraulic_rod', n: 1 },
      { id: 'scrap_plate', n: 4 },
    ],
    signal: 1,
    flag: 'tiezhua_home',
  },
  next: null,
  repeatable: false,
  tags: ['rescue', 'human', 'factory'],
})

Content.register(KIND.QUEST, 'rescue_k9', {
  id: 'rescue_k9',
  title: '不会吹的哨子',
  en: 'THE WHISTLE',
  type: 'rescue',
  giver: 'med3',
  desc:
    'MED-3 在回收场的坑底听见狗叫，叫得很规律，每隔十分钟一次。她说那是一条巡逻犬，编号 K-9，' +
    '项圈还在工作，主人早就不在了。她的药箱里没有给机器的药，' +
    '但她把最后一支润滑油放进你手里，说这个大概也能算药。',
  objectives: [
    { id: 'find', type: 'reach', target: 'dump_pit', count: 1, label: '下到回收场的废料坑' },
    { id: 'open', type: 'rescue', target: 'rescue_k9', count: 1, label: '打开坑底的铁笼放出 K-9' },
    { id: 'home', type: 'reach', target: 'dump_shelter', count: 1, label: '把 K-9 带回回收场避难所' },
  ],
  rewards: {
    items: [
      { id: 'cell_large', n: 1 },
      { id: 'servo_motor', n: 1 },
    ],
    signal: 1,
    flag: 'k9_home',
  },
  next: null,
  repeatable: false,
  tags: ['rescue', 'bot', 'dump'],
})

// ================================================================ 支线

Content.register(KIND.QUEST, 'side_oil', {
  id: 'side_oil',
  title: '关节的响声',
  en: 'THE KNOCK',
  type: 'side',
  giver: 'baiya',
  desc:
    '白鸦的右肘在响。每弯一次响一声，像有人在很远的门后面敲门。她说不用管，说她习惯了这个声音，' +
    '说这声音还算准时。但你注意到她拿扳手的手腕开始抖了，一次比一次明显。' +
    '她需要四份稠一点的润滑油——或者一个能说服她去看医生的理由，后者不存在。',
  objectives: [
    { id: 'oil', type: 'collect', target: 'lubricant', count: 4, label: '收集 4 份稠润滑油' },
    { id: 'give', type: 'deliver', target: 'lubricant', count: 4, npc: 'baiya', label: '把润滑油交给白鸦' },
  ],
  rewards: {
    items: [
      { id: 'servo_motor', n: 1 },
      { id: 'cell_small', n: 2 },
    ],
    flag: 'oil_fixed',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'baiya', 'repair'],
})

Content.register(KIND.QUEST, 'side_diary', {
  id: 'side_diary',
  title: '三本日记',
  en: 'THREE NOTEBOOKS',
  type: 'side',
  giver: 'baiya',
  desc:
    '白鸦从废墟里翻出两本日记，纸页粘连，字迹被水泡开。她说这是同一户人家的笔迹：' +
    '第一本记日常，第二本记存货，第二本最后一行写着「明天开始记在第三本上」。' +
    '第三本还没找到——她说三号楼那户人家的床垫底下可能还有东西。她想知道这家人后来怎么样了，' +
    '嘴上却说她只是想核对时间线。',
  objectives: [
    { id: 'first', type: 'collect', target: 'diary_1', count: 1, label: '找到第一本日记' },
    { id: 'second', type: 'collect', target: 'diary_2', count: 1, label: '找到第二本日记' },
    { id: 'third', type: 'collect', target: 'diary_3', count: 1, label: '在床垫底下找到第三本' },
    { id: 'show', type: 'deliver', target: 'diary_1', count: 1, npc: 'baiya', label: '把三本日记摊给白鸦看' },
  ],
  rewards: {
    items: [
      { id: 'cloth', n: 2 },
      { id: 'cell_small', n: 1 },
    ],
    signal: 1,
    flag: 'diary_read',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'baiya', 'artifact'],
})

Content.register(KIND.QUEST, 'side_generator', {
  id: 'side_generator',
  title: '三台发电机',
  en: 'THREE GENERATORS',
  type: 'side',
  giver: 'med3',
  desc:
    'MED-3 的手术灯靠三台发电机撑着，现在只剩一台能转，而且是转得最慢的那台。' +
    '她说没有灯也能做手术，她做过，成功率她没记住。三台发电机分别在城市广场、村子的谷仓和工厂主厅，' +
    '修的时候别站在地上——漏电会沿着积水找人，而且它找得比你快。',
  objectives: [
    { id: 'city', type: 'repair', target: 'generator_city', count: 1, label: '修好锈城广场的发电机' },
    { id: 'village', type: 'repair', target: 'generator_village', count: 1, label: '修好枯谷谷仓的发电机' },
    { id: 'factory', type: 'repair', target: 'generator_factory', count: 1, label: '修好工厂主厅的发电机' },
  ],
  rewards: {
    items: [
      { id: 'cell_large', n: 1 },
      { id: 'repair_kit', n: 1 },
    ],
    signal: 1,
    flag: 'power_restored',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'med3', 'power'],
})

Content.register(KIND.QUEST, 'side_hunt', {
  id: 'side_hunt',
  title: '猪和哨兵',
  en: 'PIGS AND SENTRIES',
  type: 'side',
  giver: 'laoqian',
  desc:
    '辐射野猪拱开了村口的地，把埋着的过滤器翻出来嚼了。老钎说得打掉四头，' +
    '不然它们会把这个冬天要用的储备一路拱到地底下去。另外城边那两台哨兵还在扫射，' +
    '谁路过谁挨打——老钎说他反正不过去了，但别人要过。',
  objectives: [
    { id: 'boar', type: 'kill', target: 'radboar', count: 4, label: '清理 4 头辐射野猪' },
    { id: 'sentry', type: 'kill', target: 'sentry', count: 2, label: '摧毁 2 台失控哨兵' },
  ],
  rewards: {
    items: [
      { id: 'scrap_plate', n: 3 },
      { id: 'cell_small', n: 2 },
    ],
    flag: 'hunt_cleared',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'laoqian', 'combat'],
})

Content.register(KIND.QUEST, 'side_toy', {
  id: 'side_toy',
  title: '铁皮狗',
  en: 'TIN DOG',
  type: 'side',
  giver: 'huique',
  desc:
    '灰雀把一只没有腿的铁皮狗塞进你手里，说这是她的，说她在笼子里的时候是它陪着她。' +
    '她说它被一个「好大的人」踩坏了，腿掉在这座城市的某个地方。' +
    '她没说请你帮忙，她只是在描述一件事，然后把铁皮狗放在你脚边，退开两步，看着你的脚。',
  objectives: [
    { id: 'find', type: 'collect', target: 'huique_toy', count: 1, label: '找回灰雀的铁皮狗' },
    { id: 'back', type: 'deliver', target: 'huique_toy', count: 1, npc: 'huique', label: '把铁皮狗还给灰雀' },
  ],
  rewards: {
    items: [
      { id: 'cloth', n: 2 },
      { id: 'cell_small', n: 1 },
    ],
    flag: 'huique_toy_back',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'huique', 'artifact'],
})

Content.register(KIND.QUEST, 'side_photos', {
  id: 'side_photos',
  title: '一张照片',
  en: 'ONE PHOTOGRAPH',
  type: 'side',
  giver: 'laoqian',
  desc:
    '老钎弄丢了一张照片。他说照片上有四个人，站在一辆还没坏的车前面，其中一个是他上一个主人。' +
    '他说他记不清那四个人长什么样了，但照片还在的话，他就不用记。' +
    '他把它押给一个收破烂的，换了半罐油。他说这买卖不亏，说的时候没看你。',
  objectives: [
    { id: 'find', type: 'collect', target: 'photo_2', count: 1, label: '找回老钎押掉的照片' },
    { id: 'back', type: 'deliver', target: 'photo_2', count: 1, npc: 'laoqian', label: '把照片还给老钎' },
  ],
  rewards: {
    items: [
      { id: 'bearing', n: 2 },
      { id: 'cell_small', n: 1 },
    ],
    signal: 1,
    flag: 'photo_back',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'laoqian', 'artifact'],
})

Content.register(KIND.QUEST, 'side_dogfood', {
  id: 'side_dogfood',
  title: '狗粮',
  en: 'DOG FOOD',
  type: 'side',
  giver: 'k9',
  desc:
    'K-9 不吃东西。它吃不了，可它每天把鼻子凑到空罐头上闻，闻很久，闻完把罐头推回原位。' +
    'MED-3 说那是习惯，不是需求，删不掉，删了会掉别的。' +
    '村里人说回收场以前的补给站还有狗粮罐头，铁皮的那种，人不能吃，机器也不该吃，但 K-9 是狗。',
  objectives: [
    { id: 'find', type: 'collect', target: 'dog_food', count: 1, label: '找到一个狗粮罐头' },
    { id: 'feed', type: 'deliver', target: 'dog_food', count: 1, npc: 'k9', label: '把罐头放在 K-9 面前' },
  ],
  rewards: {
    items: [{ id: 'optical_module', n: 1 }],
    flag: 'k9_fed',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'k9', 'bot'],
})

Content.register(KIND.QUEST, 'side_unlock', {
  id: 'side_unlock',
  title: '军用外壳',
  en: 'MILITARY SHELL',
  type: 'side',
  giver: 'laoqian',
  desc:
    '老钎压低声音——他的音量调节坏了，压低也很响——说他见过一块军用外壳，' +
    '挂在废车场的吊钩上，编号被酸雨啃掉了，但厚度骗不了人。' +
    '他说那东西能给你换一副新骨架，也确实能把你的负重上限顶上去。他说这话的时候在发抖，' +
    '因为那个地方有一只很大的东西在看门。',
  objectives: [
    { id: 'shell', type: 'collect', target: 'military_shell', count: 1, label: '取回军用外壳' },
    { id: 'forge', type: 'deliver', target: 'military_shell', count: 1, npc: 'laoqian', label: '把外壳交给老钎改装' },
  ],
  rewards: {
    items: [{ id: 'cell_large', n: 2 }],
    signal: 1,
    unlockChassis: ['hulk'],
    flag: 'hulk_forged',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'laoqian', 'chassis'],
})

Content.register(KIND.QUEST, 'side_archive', {
  id: 'side_archive',
  title: '六件遗物',
  en: 'SIX RELICS',
  type: 'side',
  giver: 'ghost',
  desc:
    '幽灵请你带六件「人留下的东西」到回收场。它不要求贵重，只要求有主人的痕迹——' +
    '一本写过的本子、一张照过人的照片、一首被录下来的歌。' +
    '它说它现在记住的只有声音，它想记住形状。它说这话的时候，人形的边缘在抖，' +
    '抖出来的全是听不清的杂音。',
  objectives: [
    { id: 'r_diary1', type: 'collect', target: 'diary_1', count: 1, label: '遗物：一本写过字的日记' },
    { id: 'r_diary2', type: 'collect', target: 'diary_2', count: 1, label: '遗物：第二本日记' },
    { id: 'r_photo', type: 'collect', target: 'photo_2', count: 1, label: '遗物：一张有几张脸的照片' },
    { id: 'r_jewelry', type: 'collect', target: 'jewelry_1', count: 1, label: '遗物：一件戴过很久的首饰' },
    { id: 'r_cassette', type: 'collect', target: 'cassette_1', count: 1, label: '遗物：一盘录过歌的磁带' },
    { id: 'r_recorder', type: 'collect', target: 'signal_recorder', count: 1, label: '遗物：一台信号记录仪' },
    { id: 'report', type: 'talk', target: 'ghost', count: 1, label: '让幽灵把这些看完' },
  ],
  rewards: {
    items: [
      { id: 'optical_module', n: 1 },
      { id: 'rare_earth', n: 2 },
    ],
    signal: 1,
    flag: 'archive_six',
  },
  next: null,
  repeatable: false,
  tags: ['side', 'ghost', 'artifact'],
})

// 供外部快速判断：主线顺序（UI 的地图/任务日志可直接读这个数组）
export const MAIN_QUEST_ORDER = ['main_signal', 'main_antenna']

// 营救任务与其对应的同伴（RescueSystem 不依赖它，但 UI 面板需要）
export const RESCUE_QUEST_MAP = {
  rescue_huique: 'huique',
  rescue_tiezhua: 'tiezhua',
  rescue_k9: 'k9',
}

export default true
