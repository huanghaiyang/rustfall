// 同伴数据：七个还活着（或还算活着）的东西。
//
// 写作约定：
//   · ambient 是避难所里的随机闲聊，4~6 条一组，每条 20~60 字，不推动剧情。
//   · dialogue 是「默认对话」；dialogues 是带条件的候选表，运行时按顺序挑第一个满足条件的。
//     最后一个不带 require 的条目就是兜底闲聊，所以数据里必须保证顺序。
//   · 被营救的三位（灰雀 / 铁爪 / K-9）在救出之前不出现，rescue 字段记录笼子位置。
//
// 语气：冷、干、具体。不喊口号，不谈希望，只谈还剩多少电、多少油、几张废料券。

import { Content, KIND } from '../../core/registry.js'

// ---------------------------------------------------------------- 白鸦
Content.register(KIND.COMPANION, 'baiya', {
  id: 'baiya',
  name: '白鸦',
  en: 'BAIYA',
  role: 'mechanic',
  shelter: 'city_shelter',
  portrait: 'baiya',
  desc:
    '三十来岁，左半张脸是后来焊上去的钛壳，接缝处有一圈干掉的血锈。' +
    '她说话的时候只有右半边脸会动。修东西之前她会用手背试一下金属的温度——那是她唯一还留着的旧习惯。',
  dialogue: 'baiya_intro',
  dialogues: [
    { id: 'baiya_intro', once: true },
    { id: 'baiya_main', require: { quest: 'main_signal' } },
    { id: 'baiya_antenna', require: { quest: 'main_antenna' } },
    { id: 'baiya_rescue', require: { notCompleted: 'rescue_huique' }, once: true },
    { id: 'baiya_idle' },
  ],
  services: ['repair', 'trade'],
  rescue: null,
  tags: ['human', 'half-mech', 'city'],
  ambient: [
    '（她把一颗轴承在掌心转来转去，听声音判断好坏，转了七圈才放下。）',
    '雨打在天窗上的动静跟三十年前不一样了。那时候是水，现在是别的东西。',
    '别问我饿不饿。我这半边胃是铁做的，饿了也只是响，不会疼。',
    '你走路的时候左脚落地轻了半拍。关节缺油，别拖，拖到卡死就不只是油的事了。',
    '（她抬头看你一眼，又把视线放回焊枪上。）你今天比昨天多带回来两样东西。我记下了。',
    '上一个帮我递工具的人现在在那边墙里。别多想，是他自己要求砌进去的，说这样能凉快点。',
  ],
})

// ---------------------------------------------------------------- 老钎
Content.register(KIND.COMPANION, 'laoqian', {
  id: 'laoqian',
  name: '老钎',
  en: 'LAOQIAN',
  role: 'scavenger',
  shelter: 'village_shelter',
  portrait: 'laoqian',
  desc:
    '一台比这个村子还老的三轮拾荒机，漆掉光了，只剩锈和补丁。' +
    '他把捡回来的人的照片贴在胸口，一张叠着一张，谁都不许碰。他记得所有东西的价格，记不住自己换过几个主人。',
  dialogue: 'laoqian_intro',
  dialogues: [
    { id: 'laoqian_intro', once: true },
    { id: 'laoqian_rescue', require: { notCompleted: 'rescue_tiezhua' }, once: true },
    { id: 'laoqian_hunt', require: { notCompleted: 'side_hunt' }, once: true },
    { id: 'laoqian_unlock', require: { notCompleted: 'side_unlock' }, once: true },
    { id: 'laoqian_photos', require: { quest: 'side_photos', item: { id: 'photo_2', n: 1 } } },
    { id: 'laoqian_oil' },
  ],
  services: ['trade'],
  rescue: null,
  tags: ['robot', 'old', 'village'],
  ambient: [
    '（他把一枚螺丝从嘴里拿出来，对着光看了看，又放回去。）',
    '今天收了七个瓶盖、两根铜线、一只左脚。左脚不值钱，鞋才值钱。',
    '我上一个主人说，等雨停就回来。我等了十九年，雨没好，我也没走。',
    '你身上有铁的味道，还有一点机油。是白鸦给你上的油？她手重，别让她碰你的陀螺仪。',
    '（他数了三遍手里的废料券，三遍数出来三个数。）',
    '捡东西有规矩：埋着的别挖，除非你确定底下不是人。',
  ],
})

// ---------------------------------------------------------------- MED-3
Content.register(KIND.COMPANION, 'med3', {
  id: 'med3',
  name: 'MED-3',
  en: 'MED-3',
  role: 'medic',
  shelter: 'factory_shelter',
  portrait: 'med3',
  desc:
    '一台医院剩下的分诊机器人，白色外壳被酸雨啃成了麻子脸。' +
    '她的药箱里只剩绷带、钳子和一整盒用不上的儿童退烧药。她给每个伤员编号，不叫名字——她说这样送走的时候不用难过。',
  dialogue: 'med3_intro',
  dialogues: [
    { id: 'med3_intro', once: true },
    { id: 'med3_k9', require: { notCompleted: 'rescue_k9' }, once: true },
    { id: 'med3_idle' },
  ],
  services: ['heal', 'repair'],
  rescue: null,
  tags: ['robot', 'medic', 'factory'],
  ambient: [
    '（她正在用酒精擦一双手。那双金属手不需要消毒，但她每天擦三遍。）',
    '今天三个伤员，两个能走，一个不能。我把不能走的那个排在最后，他一直没说话。',
    '我的程序让我先救活得久的。这个逻辑到现在还没出过错，这是最糟糕的部分。',
    '你体温偏高。……对，你没有体温。那当我没说，把手臂伸过来。',
    '（她数了数药箱，把儿童退烧药往前挪了挪，又挪回去。）',
    '别死在走廊上。搬起来很重，而且拖地要用水，水要过滤，过滤要电。',
  ],
})

// ---------------------------------------------------------------- 幽灵
Content.register(KIND.COMPANION, 'ghost', {
  id: 'ghost',
  name: '幽灵',
  en: 'GHOST',
  role: 'signal',
  shelter: 'dump_shelter',
  portrait: 'ghost',
  desc:
    '一团稳定的、人形的光和杂音。它由回收场里所有死掉的信号拼起来——广播、通话、求救、广告。' +
    '它记得每一个声音，却拼不出一个完整的人。它管这叫「档案」，管自己叫「我们」。',
  dialogue: 'ghost_signal',
  dialogues: [
    { id: 'ghost_final', require: { quest: 'main_antenna', objectives: ['part', 'rare', 'antenna'] }, once: true },
    { id: 'ghost_signal', require: { quest: 'main_signal', objectives: ['relay_a', 'relay_b', 'relay_c', 'reach_core'] }, once: true },
    { id: 'ghost_main', require: { quest: 'main_signal' } },
    { id: 'ghost_archive', require: { completed: 'main_signal' }, once: true },
    { id: 'ghost_idle' },
  ],
  services: ['archive', 'map'],
  rescue: null,
  tags: ['ai', 'hologram', 'dump'],
  ambient: [
    '（它的轮廓闪了一下，某个女人的声音从它胸口漏出来：……听到请回答……）',
    '今天有四百二十三条信号经过这里。三条是活人发的，两条是重复的，剩下的是雨。',
    '我记得你的脚步声。你第一次来的时候，比现在轻。',
    '（它伸出手，指尖是一段旧广告歌的旋律，唱到一半就断了，它也没有接下去。）',
    '「希望」这个词在档案里出现过六万次。最近一次是十七年前，一个卖净水器的。',
    '别关那台收音机。听着杂音，我会以为自己还连着谁。',
  ],
})

// ---------------------------------------------------------------- 灰雀（营救）
Content.register(KIND.COMPANION, 'huique', {
  id: 'huique',
  name: '灰雀',
  en: 'HUIQUE',
  role: 'survivor',
  shelter: 'city_shelter',
  portrait: 'huique',
  desc:
    '八九岁，头发用铁丝扎着，衣服是从三个人身上拼出来的。她不哭，也不怎么说话，' +
    '只在数东西的时候开口——面包渣、弹壳、能踩的台阶。她管自己叫灰雀，因为「麻雀太吵，活不长」。',
  dialogue: 'huique_intro',
  dialogues: [
    { id: 'huique_intro', require: { completed: 'rescue_huique' }, once: true },
    { id: 'huique_toy', require: { quest: 'side_toy', item: { id: 'huique_toy', n: 1 } } },
    { id: 'huique_idle' },
  ],
  services: [],
  rescue: { quest: 'rescue_huique', room: 'city_slum', cage: 'cage_huique' },
  tags: ['human', 'child', 'city'],
  ambient: [
    '（她在墙上用炭画格子，一格代表一天。）今天这一格还没画。',
    '叔叔，铁皮罐子里有雨声。你听，像有人在里面走。',
    '我不饿。我把面包分成七份，一天吃一份，已经吃到第四份了。',
    '我妈说数到一千就回来。我数到过两次一千，后来就不数了。数数没用。',
    '（她把一只没有腿的玩具狗摆正，让它面朝门口。）它叫铁爪。不对，铁爪是那个叔叔。',
    '你身上没有人的味道。这样好，人的味道会引来东西。',
  ],
})

// ---------------------------------------------------------------- 铁爪（营救）
Content.register(KIND.COMPANION, 'tiezhua', {
  id: 'tiezhua',
  name: '铁爪',
  en: 'TIEZHUA',
  role: 'scavenger',
  shelter: 'village_shelter',
  portrait: 'tiezhua',
  desc:
    '打捞工。右手是自己改的液压爪，抓东西很稳，握筷子不行。' +
    '他在熔渣工厂的炉膛里被关了十一天，靠舔冷凝水活着。出来以后第一句话是问他的工钱还在不在。',
  dialogue: 'tiezhua_intro',
  dialogues: [
    { id: 'tiezhua_intro', require: { completed: 'rescue_tiezhua' }, once: true },
    { id: 'tiezhua_debt', require: { completed: 'rescue_tiezhua' }, once: true },
    { id: 'tiezhua_idle' },
  ],
  services: [],
  rescue: { quest: 'rescue_tiezhua', room: 'factory_furnace', cage: 'cage_tiezhua' },
  tags: ['human', 'salvager', 'village'],
  ambient: [
    '（他用液压爪捏着一根钉子，捏了三次才捏起来。）手太大力了，吃饭费劲。',
    '十一天。我数着炉壁上的锈点数的，一共四百七十个。数完就没得数了，就再数一遍。',
    '我欠老钎三张废料券。他要是忘了，我就不提了；他要是记得，我就再拖两天。',
    '打捞这行，最值钱的不是铁，是没炸的。第二值钱的是炸了但没响的。',
    '你别站在下风口。我这身衣服三个月没洗，比酸雨还毒。',
    '（他把爪子张开又合上，听液压阀的声音。）这声音我在炉膛里听了十一天。那时候是它让我知道我还醒着。',
  ],
})

// ---------------------------------------------------------------- K-9（营救）
Content.register(KIND.COMPANION, 'k9', {
  id: 'k9',
  name: 'K-9',
  en: 'K-9',
  role: 'bot',
  shelter: 'dump_shelter',
  portrait: 'k9',
  desc:
    '一条四足巡逻犬，编号 K-9。脖子上的项圈还是好的，能响，但已经没人会吹那个哨子。' +
    '它不听口令，只听声音——口哨、罐头开启、脚步。它记得三万个名字，其中一个是它主人的。',
  dialogue: 'k9_whistle',
  dialogues: [
    { id: 'k9_whistle', require: { completed: 'rescue_k9' }, once: true },
    { id: 'k9_dogfood', require: { quest: 'side_dogfood', item: { id: 'dog_food', n: 1 } } },
    { id: 'k9_idle' },
  ],
  services: [],
  rescue: { quest: 'rescue_k9', room: 'dump_pit', cage: 'cage_k9' },
  tags: ['robot', 'dog', 'dump'],
  ambient: [
    '（它把下巴搁在你的脚背上，喉咙里发出一种接近引擎低鸣的声音。）',
    '（它对着一个空罐头舔了很久。罐头里什么都没有，它还是舔。）',
    '它把头歪向左边，又歪向右边，像在等一个不会响的哨子。',
    '（它突然站起来，对着雨里的某个方向低吼三声，然后又趴下，像是确认过了。）',
    '项圈背面刻着一个名字，磨得只剩第一个字母：M。',
    '（它把一只旧手套叼到你脚边，放在那里，退开两步，等你扔。）',
  ],
})

export default true
