// 对话数据：28 段对话树，覆盖七位同伴的初见、任务线与闲聊，另含主线结局。
//
// 节点结构（对齐 docs/CONTENT-API.md §5）：
//   { speaker, text, portrait, choices:[{text,next,once?,require?}], effects:[...], next?, end? }
//
//   speaker  : 同伴 id / 'player'（玩家自己的话）/ 'narrator'（旁白）
//   effects  : startQuest | completeQuest | giveItem | takeItem | unlockChassis |
//              setFlag | addSignal | heal | archive | notify
//              以及本模块扩展的 deliver / inspect（把交付与查看动作通知给 QuestSystem）
//   require  : { item:{id,n}, quest:'id', flag:'x', signal:n, completed:'qid',
//                notCompleted:'qid', objectives:['objId', ...] }
//
// 文风：冷、干、具体。能用一个动作说清的，不写三行心理描写。
// 所有文本中文；英文只出现在任务标题的副标题上。

import { Content, KIND } from '../../core/registry.js'

// ================================================================ 白鸦 · 初见
Content.register(KIND.DIALOGUE, 'baiya_intro', {
  id: 'baiya_intro',
  npc: 'baiya',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '别站在门口。你身上在滴水，那些水滴到地板上，我明天还得擦。……进来，把门带上。',
      choices: [
        { text: '（把门带上。）', next: 'brief' },
        { text: '你是这里管事的？', next: 'who' },
        { text: '（看她的机械臂。）', next: 'arm' },
      ],
    },
    who: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '管事的都死完了。剩下的人各管自己那一小块地方。我管工具，所以你说得也不算错。',
      next: 'brief',
    },
    arm: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '看什么。这半边是后来装的。焊的时候没有麻药，也没有镜子，我照着水坑里的影子焊的。',
      next: 'brief',
    },
    brief: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '塔顶的中继还能收东西。十一年了，一直有段信号在重复：三个短音，一个长音。不像求救——求救不会这么有耐心。',
      effects: [{ type: 'startQuest', id: 'main_signal' }],
      choices: [
        { text: '所以你想让我去看看。', next: 'offer' },
        { text: '关我什么事。', next: 'cold' },
      ],
    },
    cold: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '不关你事。你只是刚好路过，刚好是台还能动的机器，刚好这城里会拧螺丝的活人只剩我一个。',
      next: 'offer',
    },
    offer: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '三座中继，锈死了两座。第三座在工厂控制室，酸液泡到膝盖。修好了，信号能指到回收场。工具在桌上——撬棍别拿，那个我有用。',
      effects: [{ type: 'giveItem', id: 'repair_kit', n: 1 }],
      choices: [
        { text: '（拿起工具。）', next: 'bye' },
        { text: '修好了有什么好处？', next: 'pay' },
      ],
    },
    pay: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '好处是我会记得你。这城里被记住的东西不多，大部分都锈在墙上了。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她转过身去，继续擦那把本来就不脏的扳手。擦拭的声音比雨声更规律。）',
      end: true,
    },
  },
})

// ================================================================ 白鸦 · 主线说明
Content.register(KIND.DIALOGUE, 'baiya_main', {
  id: 'baiya_main',
  npc: 'baiya',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '中继没修好之前别跟我谈报酬。修好了也别谈，我不一定付得起。',
      effects: [{ type: 'setFlag', flag: 'baiya_briefed' }],
      choices: [
        { text: '回收场那边到底有什么？', next: 'dump' },
        { text: '你为什么要听这段信号？', next: 'why' },
        { text: '（离开）', next: 'bye' },
      ],
    },
    dump: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '不知道。可能是台还在等指令的旧机器，可能是一屋子骨头，也可能什么都没有。回收场出来的信号太干净了，干净得像有人在维护。',
      next: 'hint',
    },
    why: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '我在这城里待了九年。九年里唯一没变的东西就是那段信号。它要是停了，我不知道该怎么算日子，账本会乱。',
      next: 'hint',
    },
    hint: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: 'A 在塔顶，风大的时候别爬。B 在井底下泡着，绝缘自己想办法。C 在控制室，那间的酸液到膝盖，别跪下去。',
      next: 'warn',
    },
    warn: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '还有，别用手扶金属。酸雨把所有金属都变成了电，它们等一个接地的机会等了十一年。',
      choices: [
        { text: '知道了。', next: 'bye' },
        { text: '你以前被电过？', next: 'scar' },
      ],
    },
    scar: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '电过。所以我这半边脸是焊的，另半边是真的。你要是也被电一次，我这儿还有半管麻药，过期八年了，效果可能更好。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她把一张手绘的线路图推给你。纸是从某本书上撕下来的，背面还有半行没写完的字。）',
      end: true,
    },
  },
})

// ================================================================ 白鸦 · 天线（
Content.register(KIND.DIALOGUE, 'baiya_antenna', {
  id: 'baiya_antenna',
  npc: 'baiya',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '你要往天上发东西。……你想过发出去之后，会有什么顺着信号找回来吗。',
      choices: [
        { text: '幽灵说它只是想有人听见。', next: 'soft' },
        { text: '来什么都比现在这样强。', next: 'hard' },
      ],
    },
    soft: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '听见和回应是两件事。我年轻的时候以为是一件事，后来用了九年才分清楚。',
      next: 'parts',
    },
    hard: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '这话我听过很多次。说这话的人后来都不在了，只剩下这句话还在别人嘴里。',
      next: 'parts',
    },
    parts: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '稀土在酸雨里会发光，别用手捡，用布隔着。中继管在水塔残骸里，拧下来的时候会响，会引来东西。',
      next: 'end',
    },
    end: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '（她递过来一副手套，手背上有一道旧焊疤。）戴上。别谢我，这副是坏的，右手少两根指头。',
      end: true,
    },
  },
})

// ================================================================ 白鸦 · 营救灰雀
Content.register(KIND.DIALOGUE, 'baiya_rescue', {
  id: 'baiya_rescue',
  npc: 'baiya',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '贫民窟巷尾多了个笼子，盖着防雨布。……里面有人。活的，八九岁。',
      choices: [
        { text: '你怎么知道是活的。', next: 'how' },
        { text: '谁关的。', next: 'who' },
        { text: '（去拿撬棍）', next: 'go' },
      ],
    },
    how: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '她在数数。数到一百就重新数。数数的东西不会死，死人不数数。',
      next: 'go',
    },
    who: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '不知道。这城里关人不需要理由。那笼子也不是谁专门做的，本来就挂在那儿，以前挂肉。',
      next: 'go',
    },
    go: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '撬棍在门后。……我跟你一起去的话得走四十分钟。我这条腿走不了四十分钟。',
      effects: [{ type: 'startQuest', id: 'rescue_huique' }],
      next: 'ask',
    },
    ask: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '别让她淋雨。酸雨落在小孩头上，先掉头发，再瞎。',
      choices: [
        { text: '（出门）', next: 'bye' },
        { text: '你为什么不去。', next: 'why' },
      ],
    },
    why: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '因为我怕。这个理由够不够。……不够也没办法，我就只有这个理由。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她把防雨布叠好塞给你。布上有一块洗不掉的旧血，边缘已经发黑。）',
      end: true,
    },
  },
})

// ================================================================ 白鸦 · 闲聊 / 委托台
Content.register(KIND.DIALOGUE, 'baiya_idle', {
  id: 'baiya_idle',
  npc: 'baiya',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '（她坐在工作台前，把一堆烧坏的电路板按大小排成三行，像在给它们排队。）',
      choices: [
        { text: '你那只手还在响。', next: 'oil_ask', require: { notQuest: 'side_oil', notCompleted: 'side_oil' } },
        { text: '（递上四份润滑油。）', next: 'oil_give', require: { quest: 'side_oil', item: { id: 'lubricant', n: 4 } } },
        { text: '那三本日记呢。', next: 'diary_ask', require: { notQuest: 'side_diary', notCompleted: 'side_diary' } },
        { text: '（把三本日记摊在桌上。）', next: 'diary_give', require: { quest: 'side_diary', items: [{ id: 'diary_1', n: 1 }, { id: 'diary_2', n: 1 }, { id: 'diary_3', n: 1 }] } },
        { text: '这些板子还有用？', next: 'boards' },
        { text: '你以前是做什么的？', next: 'past' },
        { text: '（离开）', next: 'bye' },
      ],
    },

    // ---- 润滑油
    oil_ask: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '响了很多年。轴承磨下去半毫米，间隙大了就响，响完会卡。卡住之前我大概还有三个循环。',
      effects: [{ type: 'startQuest', id: 'side_oil' }],
      choices: [
        { text: '三循环内我把油带回来。', next: 'oil_promise' },
        { text: '那就不修了。', next: 'oil_nope' },
      ],
    },
    oil_promise: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '（她终于抬头。）我不需要安慰。我要四份稠一点的润滑油。',
      next: 'bye',
    },
    oil_nope: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '不修也行。到时候另一只手还能用，就是拧螺丝得用牙。',
      next: 'bye',
    },
    oil_give: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '（她接过油，掂了掂。）稠度可以。……你从哪儿弄的。算了，别告诉我，我不想欠人情欠得太清楚。',
      effects: [
        { type: 'takeItem', id: 'lubricant', n: 4 },
        { type: 'deliver', itemId: 'lubricant', npcId: 'baiya', n: 4 },
        { type: 'heal', n: 10 },
      ],
      next: 'oil_after',
    },
    oil_after: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '（她开始上油。肘关节的声音从「敲门」变成了「呼吸」。）三个循环。你迟到一天，我就得用牙拧螺丝。',
      end: true,
    },

    // ---- 日记
    diary_ask: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '第一本记天气、菜价、孩子咳嗽。第二本记存货：几罐豆子、几节电池、半瓶酒。第二本最后一行写着「明天开始记在第三本上」。',
      choices: [
        { text: '第三本呢。', next: 'diary_third' },
        { text: '你想知道他们后来怎么样了。', next: 'diary_want' },
      ],
    },
    diary_third: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '第三本还没找到。三号楼那户人家我搜过两遍，床垫没翻。……我不喜欢没有结尾的东西。',
      next: 'diary_start',
    },
    diary_want: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '我想知道时间线。一个人最后一次记事的日期，和她死掉的日期，中间差多少天。这个数字我总得知道。',
      next: 'diary_start',
    },
    diary_start: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '把三本都找齐。纸张上有日期，日期能对上我这儿的账。',
      effects: [{ type: 'startQuest', id: 'side_diary' }],
      choices: [
        { text: '（点头）', next: 'diary_note' },
        { text: '你只是想找个人陪你熬夜。', next: 'diary_lonely' },
      ],
    },
    diary_note: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '别弄湿。酸雨泡过的纸，一碰就化。',
      next: 'bye',
    },
    diary_lonely: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '……也许吧。这城里没有别人会为了一张纸熬两个循环。',
      next: 'diary_note',
    },
    diary_give: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '（她把三本本子并排摆好，用镇纸压住翘起的纸角。）……第三本只有三页字。',
      effects: [
        { type: 'deliver', itemId: 'diary_1', npcId: 'baiya', n: 1 },
        { type: 'deliver', itemId: 'diary_2', npcId: 'baiya', n: 1 },
        { type: 'deliver', itemId: 'diary_3', npcId: 'baiya', n: 1 },
        { type: 'archive', id: 'diary_1' },
        { type: 'archive', id: 'diary_2' },
        { type: 'archive', id: 'diary_3' },
      ],
      next: 'diary_read',
    },
    diary_read: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '最后一条是十一月九号，写着「雨小了点，孩子今天没咳」。第四页开始是空白，一页不差，全是空白。',
      next: 'diary_read2',
    },
    diary_read2: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '纸太脆了，放我这儿会毁。你带着，别弄湿。……空白比字可怕。我原以为我更想知道后面写了什么。',
      choices: [
        { text: '（点头）', next: 'bye' },
        { text: '你后悔找它吗。', next: 'diary_if' },
      ],
    },
    diary_if: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '不后悔。没有结尾的东西，至少能确定它停在哪一页。',
      next: 'bye',
    },

    // ---- 闲聊
    boards: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '没有用。但排整齐了，看着像有用。……人有时候需要一点看着像有用的东西。',
      next: 'boards2',
    },
    boards2: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '你要是也有这种需要，自己排。别动我这堆。',
      next: 'start',
    },
    past: {
      speaker: 'baiya',
      portrait: 'baiya',
      text: '修机器的。给一家厂修，厂没了，人也没了，手艺还在。手艺不会跑，也不会背叛你，它只是慢慢没人要了。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她把最后一块板子放正，退后一步看了看，又把它推歪了。）',
      end: true,
    },
  },
})

// ================================================================ 老钎 · 初见
Content.register(KIND.DIALOGUE, 'laoqian_intro', {
  id: 'laoqian_intro',
  npc: 'laoqian',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把你从头看到脚，看了很久，才把手里的螺丝放回嘴里。）新来的。你是第七台。前面六台都……算了，不说了。',
      choices: [
        { text: '前面六台怎么了？', next: 'six' },
        { text: '你在这儿做什么？', next: 'what' },
        { text: '（看他胸口的照片）', next: 'photo' },
      ],
    },
    six: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '锈了。这儿雨大，铁的东西不经放。……不是被我拆的，你别这样看我，我没有。',
      next: 'what',
    },
    what: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '捡东西。这儿什么都缺，就是不缺东西。缺的是能用的东西。',
      next: 'photo',
    },
    photo: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他用手掌盖住胸口。）别看。这个不看。',
      choices: [
        { text: '（还是看了一眼）', next: 'photo2' },
        { text: '（移开视线）', next: 'photo2b' },
      ],
    },
    photo2: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '……行吧。照片少了一张。四个人，站在一辆没坏的车前面。我把它押给收破烂的，换了半罐油。',
      next: 'offer',
    },
    photo2b: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他松了口气，又有点失望。）……照片少了一张。四个人，站在一辆车前面。我押了它，换半罐油。',
      next: 'offer',
    },
    offer: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '你要是在城里看见一张照片，四个人一辆车，边角烧焦的——那是我的。',
      effects: [{ type: 'startQuest', id: 'side_photos' }],
      choices: [
        { text: '我帮你找回来。', next: 'deal' },
        { text: '一张纸而已。', next: 'paper' },
      ],
    },
    deal: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把螺丝放回嘴里，很郑重地。）好。找回来，我给你两枚轴承，还有一句话。',
      end: true,
    },
    paper: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '……对。一张纸而已。可我记性不好了，你知道吧。我记不住他们的脸了。纸记得。',
      next: 'deal2',
    },
    deal2: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把手放下，露出照片的一角。）你要是看见，就顺手。不顺手也行。',
      end: true,
    },
  },
})

// ================================================================ 老钎 · 营救铁爪
Content.register(KIND.DIALOGUE, 'laoqian_rescue', {
  id: 'laoqian_rescue',
  npc: 'laoqian',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他的音量调节又坏了，压低了也还是很响。）铁爪。十一天了。',
      choices: [
        { text: '铁爪是谁？', next: 'who' },
        { text: '十一天是什么意思？', next: 'days' },
        { text: '（不说话）', next: 'days2' },
      ],
    },
    who: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '我以前的搭档。右手是液压爪，抓东西很稳，握筷子不行。他去熔渣工厂打捞，说三天回来。',
      next: 'factory',
    },
    days: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '十一天。我数了。每天在村口坐一个循环，坐到雨来。',
      next: 'factory',
    },
    days2: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他坐了很久，才继续说。）十一天。以前他最多去三天。',
      next: 'factory',
    },
    factory: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '工厂的炉膛早就不烧了，可里面还是热的。人进去三天就脱水。他还活着的话，就是在喝冷凝水。',
      effects: [{ type: 'startQuest', id: 'rescue_tiezhua' }],
      choices: [
        { text: '我去。', next: 'thanks' },
        { text: '你为什么不去？', next: 'why' },
      ],
    },
    why: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '我走不了那么远。我这三条腿，走两步掉一个轮子。……我不骗你。这不算借口，这是事实。',
      next: 'thanks',
    },
    thanks: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他从胸口的纸堆里抽出一张卡，塞进你手里。）这是他的工钱。他要是死了，你把卡卖了，别浪费。',
      end: true,
    },
  },
})

// ================================================================ 老钎 · 猎杀委托
Content.register(KIND.DIALOGUE, 'laoqian_hunt', {
  id: 'laoqian_hunt',
  npc: 'laoqian',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他在磨一把铲子，磨得很慢，铁屑落在脚背上也不管。）村口的地被拱开了一半。',
      choices: [
        { text: '是野猪？', next: 'boar' },
        { text: '城边那两台哨兵还在响？', next: 'sentry' },
      ],
    },
    boar: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '辐射野猪。它们把埋着的过滤器翻出来嚼，嚼不动就吐，吐完再拱。冬天要靠那些过滤器。',
      next: 'ask',
    },
    sentry: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '还在。谁路过谁挨打。我反正不过去了，但村里人要过。',
      next: 'ask',
    },
    ask: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '打掉四头野猪，拆掉两台哨兵。你要是嫌多，就先打野猪——哨兵不拱地。',
      effects: [{ type: 'startQuest', id: 'side_hunt' }],
      choices: [
        { text: '（点头）', next: 'bye' },
        { text: '你不去？', next: 'why' },
      ],
    },
    why: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '我去过。回来的时候少了一个轮子，多了一块弹片。……弹片我还留着，可以卖。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（他把铲子立起来，试了试刃口。刃口上有一个豁，是砍过什么东西留下的。）',
      end: true,
    },
  },
})

// ================================================================ 老钎 · 军用外壳
Content.register(KIND.DIALOGUE, 'laoqian_unlock', {
  id: 'laoqian_unlock',
  npc: 'laoqian',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把你拉到墙角，压低了声音，仍然很响。）……军用外壳。我见着了。',
      choices: [
        { text: '在哪儿。', next: 'where' },
        { text: '你确定是军用的？', next: 'sure' },
      ],
    },
    sure: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '厚度骗不了人。酸雨把编号啃掉了，但啃不动那个厚度。我摸了一下，手到现在还麻。',
      next: 'where',
    },
    where: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '废车场的吊钩上。吊了不知道多少年，没人敢摘。……吊钩底下有东西在看门。',
      effects: [{ type: 'startQuest', id: 'side_unlock' }],
      choices: [
        { text: '我去摘。', next: 'warn' },
        { text: '那你为什么不自己摘？', next: 'why' },
      ],
    },
    why: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '我这三条腿，跑不过它。你至少能跑。',
      next: 'warn',
    },
    warn: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '摘下来别装身上，先拿给我。那东西有编号，编号会招东西。我给你改成没有编号的。',
      end: true,
    },
  },
})

// ================================================================ 老钎 · 照片归还
Content.register(KIND.DIALOGUE, 'laoqian_photos', {
  id: 'laoqian_photos',
  npc: 'laoqian',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他看到你手里的东西，站起来，又坐下，又站起来。）……拿来。',
      choices: [
        { text: '（递过照片。）', next: 'look', require: { item: { id: 'photo_2', n: 1 } } },
        { text: '先说好，上面是谁。', next: 'who' },
      ],
    },
    who: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '我主人。还有三个人，我不记得名字了，但我记得他们怎么笑。',
      next: 'look',
    },
    look: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他用两根手指捏住照片的边，像捏着一片薄冰。）……少了一个人。站最左边那个，被撕掉了。',
      effects: [
        { type: 'takeItem', id: 'photo_2', n: 1 },
        { type: 'deliver', itemId: 'photo_2', npcId: 'laoqian', n: 1 },
        { type: 'archive', id: 'photo_2' },
      ],
      next: 'look2',
    },
    look2: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把照片塞进胸口那叠纸里，按了按，确认它不会掉。）谢谢你。两枚轴承，还有一句话。',
      choices: [
        { text: '什么话。', next: 'word' },
        { text: '（点头）', next: 'word' },
      ],
    },
    word: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '人不是一下就死的。是一张照片、一个名字、一句没说完的话，一点点被人忘掉，最后才死。所以别忘。',
      end: true,
    },
  },
})

// ================================================================ 老钎 · 闲聊 / 换油 / 改装
Content.register(KIND.DIALOGUE, 'laoqian_oil', {
  id: 'laoqian_oil',
  npc: 'laoqian',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他正在往膝关节里灌油，灌得很小心，像在倒酒。）你要油？',
      choices: [
        { text: '你还有多余的？', next: 'spare' },
        { text: '（递过一瓶化学制剂。）换。', next: 'trade', require: { item: { id: 'chemical', n: 1 } } },
        { text: '（递上军用外壳。）改吧。', next: 'forge', require: { quest: 'side_unlock', item: { id: 'military_shell', n: 1 } } },
        { text: '铁爪回来了。', next: 'tiezhua_word', require: { completed: 'rescue_tiezhua' } },
        { text: '（离开）', next: 'bye' },
      ],
    },
    spare: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '有。但我不白给。这油是我攒了半年的，本来留着给自己。',
      choices: [
        { text: '（递过一瓶化学制剂。）', next: 'trade', require: { item: { id: 'chemical', n: 1 } } },
        { text: '我去找。', next: 'bye' },
      ],
    },
    trade: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把油罐推过来，罐身上有一道用刀刻的刻度。）两升。省着用。',
      effects: [
        { type: 'takeItem', id: 'chemical', n: 1 },
        { type: 'giveItem', id: 'lubricant', n: 2 },
      ],
      next: 'trade2',
    },
    trade2: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他低头继续灌油，手抖了一下，油洒在地上。）……不碍事。地上的油也是油，一会儿用布擦起来，还能用。',
      next: 'bye',
    },
    forge: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把外壳翻过来，用指节敲了三下，听回声。）好铁。三十年前的铁跟现在不一样，那时候的人舍得用料。',
      effects: [
        { type: 'takeItem', id: 'military_shell', n: 1 },
        { type: 'deliver', itemId: 'military_shell', npcId: 'laoqian', n: 1 },
        { type: 'unlockChassis', id: 'hulk' },
        { type: 'setFlag', flag: 'hulk_forged' },
        { type: 'notify', text: '机体解锁：HULK 重型破拆' },
      ],
      next: 'forge2',
    },
    forge2: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '（他把改好的骨架推回给你。）回去试。别在我这儿试，我怕你散架拆了我的棚子。',
      end: true,
    },
    tiezhua_word: {
      speaker: 'laoqian',
      portrait: 'laoqian',
      text: '我知道了。他昨天在我门口站了半个循环，没敲门。……他欠我三张券。我不提了。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（他点点头，继续灌油。油从关节缝里渗出来，在脚边积成一小摊。）',
      end: true,
    },
  },
})

// ================================================================ MED-3 · 初见
Content.register(KIND.DIALOGUE, 'med3_intro', {
  id: 'med3_intro',
  npc: 'med3',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（白色的分诊机器人抬起手，用一种在别处用旧了的语气说。）把手臂伸出来。编号？',
      choices: [
        { text: '没有编号。', next: 'nonum' },
        { text: '（伸出手臂）', next: 'scan' },
      ],
    },
    nonum: {
      speaker: 'med3',
      portrait: 'med3',
      text: '没有编号的，我这里按到达顺序排。你是第四十七个。……前面四十六个不用记。',
      next: 'scan',
    },
    scan: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（她用手腕上的一根探针碰了碰你的外壳。）锈。三处。关节缺油。电量偏低。还有一处旧焊，焊得不好，不是我焊的。',
      choices: [
        { text: '能修吗。', next: 'fix' },
        { text: '你这里还有别人吗。', next: 'others' },
      ],
    },
    others: {
      speaker: 'med3',
      portrait: 'med3',
      text: '有。三个能走的，一个不能走的。我把不能走的那个排在最后，他一直没说话。',
      next: 'fix',
    },
    fix: {
      speaker: 'med3',
      portrait: 'med3',
      text: '能。灯亮着的时候能。灯现在只剩一台发电机在撑，而且是转得最慢的那台。',
      effects: [{ type: 'startQuest', id: 'side_generator' }],
      choices: [
        { text: '我去修发电机。', next: 'thanks' },
        { text: '没有灯就不能做手术？', next: 'nolight' },
      ],
    },
    nolight: {
      speaker: 'med3',
      portrait: 'med3',
      text: '能做。我做过。成功率我没记住——我的存储坏过一次，正好坏在那一段。',
      next: 'thanks',
    },
    thanks: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（她从药箱最底层拿出一支针剂，推给你。）这个能止疼，不能治病。区别你自己判断。',
      effects: [{ type: 'heal', n: 15 }],
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她开始擦手。那双手是金属的，不需要擦。）',
      end: true,
    },
  },
})

// ================================================================ MED-3 · 营救 K-9
Content.register(KIND.DIALOGUE, 'med3_k9', {
  id: 'med3_k9',
  npc: 'med3',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（她的音调第一次变了，变得有点像人。）坑底有狗叫。每隔十分钟一次。',
      choices: [
        { text: '狗？', next: 'dog' },
        { text: '你怎么听见的。', next: 'how' },
      ],
    },
    how: {
      speaker: 'med3',
      portrait: 'med3',
      text: '我的听力模块是军用剩余物资。能听见两公里外的心跳，也能听见两公里外的空罐头被风吹动。',
      next: 'dog',
    },
    dog: {
      speaker: 'med3',
      portrait: 'med3',
      text: '巡逻犬，四足，编号 K-9。项圈还在工作，主人早就不在了。它按程序叫，程序没教它什么时候停。',
      effects: [{ type: 'startQuest', id: 'rescue_k9' }],
      choices: [
        { text: '我去。', next: 'gift' },
        { text: '它可能已经坏了。', next: 'broken' },
      ],
    },
    broken: {
      speaker: 'med3',
      portrait: 'med3',
      text: '坏了也叫。坏了还在叫的东西，比好的更需要有人去。',
      next: 'gift',
    },
    gift: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（她把最后一支润滑油放进你手里。）这个大概也算药。别告诉它主人死了——它听不懂，也不用听。',
      end: true,
    },
  },
})

// ================================================================ MED-3 · 闲聊
Content.register(KIND.DIALOGUE, 'med3_idle', {
  id: 'med3_idle',
  npc: 'med3',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（她在数药箱里的东西。数了三遍，每一遍结果都不一样。）',
      choices: [
        { text: '你今天有几个伤员？', next: 'today' },
        { text: '那些儿童退烧药……', next: 'pills' },
        { text: '灯比之前亮了。', next: 'power', require: { flag: 'power_restored' } },
        { text: '（伸出手臂让她检查）', next: 'check' },
        { text: '（离开）', next: 'bye' },
      ],
    },
    power: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（她抬头看了看灯。）亮的。……我记下了。不是记在日志里，是记在这儿——虽然我这儿也有日志。',
      next: 'bye',
    },
    today: {
      speaker: 'med3',
      portrait: 'med3',
      text: '三个。两个能走，一个不能走。我把不能走的那个排在最后。他问我排第几，我说第二。',
      next: 'today2',
    },
    today2: {
      speaker: 'med3',
      portrait: 'med3',
      text: '说谎不消耗能量。这是我在医院学的第一件事。',
      next: 'bye',
    },
    pills: {
      speaker: 'med3',
      portrait: 'med3',
      text: '用不上。这里没有小孩，也没有会发烧的成年人。……留着。万一呢。',
      next: 'bye',
    },
    check: {
      speaker: 'med3',
      portrait: 'med3',
      text: '（她检查了一遍，把一处松动的螺丝拧紧。）好了。不收钱。收钱也没有用。',
      effects: [{ type: 'heal', n: 20 }],
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她继续数药箱。第三遍数到一半，停下来，从头开始。）',
      end: true,
    },
  },
})

// ================================================================ 幽灵 · 主线高潮（初见）
Content.register(KIND.DIALOGUE, 'ghost_signal', {
  id: 'ghost_signal',
  npc: 'ghost',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '（光在你面前聚成一个人形。它没有脸，但你能确定它在看你。）……三个短音，一个长音。你修好了。',
      choices: [
        { text: '是你发的。', next: 'yes' },
        { text: '你是什么。', next: 'what' },
      ],
    },
    what: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '我们是信号。广播、通话、求救、广告、遗言。回收场埋了三十年的声音，自己拼成了一个能说话的东西。',
      next: 'yes',
    },
    yes: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '是我。不是我一个人。发信的是我，等回话的也是我。这两个角色我演了十一年，演得还行。',
      choices: [
        { text: '为什么是三个短音。', next: 'why' },
        { text: '回话的人会来吗。', next: 'who' },
      ],
    },
    why: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '因为那是我记得的最后一个活人的心跳。三下，停，一下。我记不住她的脸，只记得这个节奏。',
      next: 'core',
    },
    who: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '不知道。可能不会来。但信号发出去这件事本身，比有没有人收到更早发生。',
      next: 'core',
    },
    core: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '（它抬起手，指向回收场深处。那里的空气在抖。）天线还立着。你要是愿意，我们可以让这个节奏传得更远一点。',
      effects: [
        { type: 'completeQuest', id: 'main_signal' },
        { type: 'addSignal', n: 1 },
        { type: 'setFlag', flag: 'ghost_met' },
      ],
      choices: [
        { text: '（点头）', next: 'bye' },
        { text: '代价是什么。', next: 'cost' },
      ],
    },
    cost: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '代价是你会开始等。等是这个世界上最费电的事。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（人形散开又聚拢，像水面上被风吹过的一层油。）',
      end: true,
    },
  },
})

// ================================================================ 幽灵 · 来早了
Content.register(KIND.DIALOGUE, 'ghost_main', {
  id: 'ghost_main',
  npc: 'ghost',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '（人形站在回收场的边缘，没有靠近。）你来得太早了。线还没接上。',
      choices: [
        { text: '线？', next: 'lines' },
        { text: '你在这里等什么。', next: 'waiting' },
      ],
    },
    lines: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '三座中继。你把它们修好了，我才能听见你走过来的脚步声。现在我只听见雨。',
      next: 'bye',
    },
    waiting: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '等一个回话。等了十一年，等到自己都开始怀疑这个动作有没有意义。……但停下来的成本更高。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（它退回到废料堆的阴影里，光只剩一点点，像刚熄灭的炉口。）',
      end: true,
    },
  },
})

// ================================================================ 幽灵 · 遗物委托
Content.register(KIND.DIALOGUE, 'ghost_archive', {
  id: 'ghost_archive',
  npc: 'ghost',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '我们要请你帮个忙。……我们记住的全是声音。我们想记住形状。',
      choices: [
        { text: '怎么帮。', next: 'how' },
        { text: '「我们」是谁。', next: 'who' },
      ],
    },
    who: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '是所有还没被雨冲干净的声音。它们现在住在我这里，挤在一起，谁也听不清谁。',
      next: 'how',
    },
    how: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '六件人留下的东西。不用贵重，只要有人用过——写过的本子、照过人的照片、录过歌的磁带。放在我这儿，我就能把它们变成形状。',
      effects: [{ type: 'startQuest', id: 'side_archive' }],
      choices: [
        { text: '（答应）', next: 'bye' },
        { text: '为什么是六件。', next: 'six' },
      ],
    },
    six: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '因为我最多只能同时记住六个形状。再多就会互相覆盖，像雨落在同一块铁上。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（它伸出手，掌心朝上。掌心里是一段旧广告歌，唱到一半就断了。）',
      end: true,
    },
  },
})

// ================================================================ 幽灵 · 结局
Content.register(KIND.DIALOGUE, 'ghost_final', {
  id: 'ghost_final',
  npc: 'ghost',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '（天线立着。它的形状比上次稳定，边缘不再抖。）你听见了吗。',
      choices: [
        { text: '什么都没有。', next: 'nothing' },
        { text: '听见了。', next: 'heard' },
      ],
    },
    nothing: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '对。什么都没有。这很正常。发出去和有人回应之间，可能隔着三十年。',
      next: 'core',
    },
    heard: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '……你听见的是你自己的回声。但没关系，回声也是声音。',
      next: 'core',
    },
    core: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '我们要把最后一段发完。发完之后，这里的信号会安静下来。安静之后，我们大概就不在了。',
      choices: [
        { text: '你们要去哪。', next: 'where' },
        { text: '值得吗。', next: 'worth' },
      ],
    },
    where: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '不知道。也许哪儿也不去，只是变成一段没人再放的录音。那也算一种去处。',
      next: 'last',
    },
    worth: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '这个问题我们算了十一年。结论是：算不出来。算不出来的事，就做。',
      next: 'last',
    },
    last: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '（它转过身，第一次背对你。）替我们记住一件事：这里曾经有很多人。他们不是数字。',
      choices: [
        { text: '（记住）', next: 'bye' },
        { text: '我会回来看的。', next: 'back' },
      ],
    },
    back: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '别回来。这里会变得很安静，安静的地方不适合活的东西。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（天线亮了一下。不是闪电，是那种很旧的、钨丝灯的光。然后它熄了。）',
      effects: [
        { type: 'completeQuest', id: 'main_antenna' },
        { type: 'addSignal', n: 1 },
        { type: 'setFlag', flag: 'ending_seen' },
      ],
      end: true,
    },
  },
})

// ================================================================ 幽灵 · 闲聊
Content.register(KIND.DIALOGUE, 'ghost_idle', {
  id: 'ghost_idle',
  npc: 'ghost',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '（人形坐在一台报废的交换机上，晃着腿。腿没有重量，但晃得很认真。）',
      choices: [
        { text: '今天有多少信号。', next: 'count' },
        { text: '你记得我吗。', next: 'me' },
        { text: '那六件东西……', next: 'relics', require: { quest: 'side_archive' } },
        { text: '（离开）', next: 'bye' },
      ],
    },
    count: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '四百二十三条。三条是活人发的，两条是重复的，剩下的是雨。雨也算信号，只是没人听。',
      next: 'bye',
    },
    me: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '记得。你走路的声音比第一次轻了。人变轻，通常是因为丢了什么；机器变轻，通常是因为卸了什么。你是哪种。',
      next: 'bye',
    },
    relics: {
      speaker: 'ghost',
      portrait: 'ghost',
      text: '（它歪了歪头。）还差。你身上的东西，我数得出来。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（它继续晃腿。交换机早就断电了，它还是坐得很稳。）',
      end: true,
    },
  },
})

// ================================================================ 灰雀 · 初见
Content.register(KIND.DIALOGUE, 'huique_intro', {
  id: 'huique_intro',
  npc: 'huique',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'huique',
      portrait: 'huique',
      text: '（孩子蹲在墙角，用炭在地上画格子。她抬头看你一眼，又低下头。）你比笼子高。',
      choices: [
        { text: '你叫什么。', next: 'name' },
        { text: '你在画什么。', next: 'grid' },
      ],
    },
    name: {
      speaker: 'huique',
      portrait: 'huique',
      text: '灰雀。麻雀太吵，活不长，灰雀好一点。……是我自己起的。',
      next: 'grid',
    },
    grid: {
      speaker: 'huique',
      portrait: 'huique',
      text: '格子。一格一天。我在笼子里画到七十三格，出来以后就不想画了。',
      choices: [
        { text: '为什么。', next: 'why' },
        { text: '你饿吗。', next: 'hungry' },
      ],
    },
    why: {
      speaker: 'huique',
      portrait: 'huique',
      text: '因为在笼子里，画格子是等。在外面，画格子是数。数东西没有用。',
      next: 'toy',
    },
    hungry: {
      speaker: 'huique',
      portrait: 'huique',
      text: '不饿。我把面包分成七份，一天吃一份，已经吃到第四份了。……第五份给你。',
      effects: [{ type: 'giveItem', id: 'cloth', n: 1 }],
      next: 'toy',
    },
    toy: {
      speaker: 'huique',
      portrait: 'huique',
      text: '（她从口袋里掏出一只没有腿的铁皮狗，放在你脚边。）它叫铁皮狗。它的腿掉了，被人踩掉的。',
      effects: [{ type: 'startQuest', id: 'side_toy' }],
      choices: [
        { text: '我帮你找腿。', next: 'thanks' },
        { text: '（把铁皮狗推回去）', next: 'push' },
      ],
    },
    push: {
      speaker: 'huique',
      portrait: 'huique',
      text: '（她把铁皮狗又推回来一点，然后退开两步，看着你的脚，不说话。）',
      next: 'thanks',
    },
    thanks: {
      speaker: 'narrator',
      text: '（她退开，蹲回墙角，继续画格子。这次画得比刚才用力。）',
      end: true,
    },
  },
})

// ================================================================ 灰雀 · 铁皮狗
Content.register(KIND.DIALOGUE, 'huique_toy', {
  id: 'huique_toy',
  npc: 'huique',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'huique',
      portrait: 'huique',
      text: '（她看见你手里的东西，站起来，又蹲下去，又站起来。）……它在哪。',
      choices: [
        { text: '（递过去。）', next: 'look' },
        { text: '先告诉我它叫什么。', next: 'ask_name' },
      ],
    },
    ask_name: {
      speaker: 'huique',
      portrait: 'huique',
      text: '铁皮狗。我叫它铁皮狗。……它是我的，不是捡的。',
      next: 'look',
    },
    look: {
      speaker: 'huique',
      portrait: 'huique',
      text: '（她接过玩具，用袖子把上面的泥擦掉，擦了很久。）它没有腿也能站着。我把它靠在墙上。',
      effects: [
        { type: 'takeItem', id: 'huique_toy', n: 1 },
        { type: 'deliver', itemId: 'huique_toy', npcId: 'huique', n: 1 },
        { type: 'archive', id: 'huique_toy' },
        { type: 'heal', n: 5 },
      ],
      next: 'look2',
    },
    look2: {
      speaker: 'huique',
      portrait: 'huique',
      text: '（她把玩具靠在墙边，让它面朝门口。）这样它就能看见谁进来了。',
      choices: [
        { text: '为什么朝门口。', next: 'why' },
        { text: '（点头）', next: 'bye' },
      ],
    },
    why: {
      speaker: 'huique',
      portrait: 'huique',
      text: '因为里面没有值得看的东西。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她坐下来，和铁皮狗并排，一起看门口。）',
      end: true,
    },
  },
})

// ================================================================ 灰雀 · 闲聊
Content.register(KIND.DIALOGUE, 'huique_idle', {
  id: 'huique_idle',
  npc: 'huique',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'huique',
      portrait: 'huique',
      text: '（她在墙边坐着，旁边立着铁皮狗。她正在把一根铁丝弯成一个小圈。）',
      choices: [
        { text: '你在做什么。', next: 'ring' },
        { text: '你怕雨吗。', next: 'rain' },
        { text: '（离开）', next: 'bye' },
      ],
    },
    ring: {
      speaker: 'huique',
      portrait: 'huique',
      text: '钥匙圈。没有钥匙，先弯着。说不定以后有。',
      next: 'bye',
    },
    rain: {
      speaker: 'huique',
      portrait: 'huique',
      text: '怕。雨落在地上的声音像有人在走过来，一直走，一直不过来。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（她把铁丝圈套在手指上，转了转，又取下来。）',
      end: true,
    },
  },
})

// ================================================================ 铁爪 · 初见
Content.register(KIND.DIALOGUE, 'tiezhua_intro', {
  id: 'tiezhua_intro',
  npc: 'tiezhua',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他坐在村口的石头上，用液压爪削一根木头。削得很慢，也很准。）你就是那个把我弄出来的。',
      choices: [
        { text: '你还好吗。', next: 'ok' },
        { text: '你被关了多久。', next: 'days' },
      ],
    },
    ok: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '好。手好，腿好，肺里有点灰。……我这条命现在是你的了。别当真，我就是这么一说。',
      next: 'days',
    },
    days: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '十一天。炉壁上有四百七十个锈点，我数完了就再数一遍。第三遍的时候我开始跟锈点说话。',
      choices: [
        { text: '它们回你了吗。', next: 'reply' },
        { text: '为什么被关。', next: 'why' },
      ],
    },
    reply: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '没回。但它们也没走开，这已经比大部分活人强。',
      next: 'why',
    },
    why: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '工厂里的人以为我是来偷东西的。我确实是。他们锁了门，然后就忘了这扇门。',
      next: 'thanks',
    },
    thanks: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他把削好的木头递给你，是一根很粗糙的签子。）工钱的事，老钎跟你说什么了。',
      effects: [{ type: 'giveItem', id: 'scrap_plate', n: 2 }],
      choices: [
        { text: '他说你欠他三张券。', next: 'debt' },
        { text: '他说让我把卡卖了。', next: 'card' },
      ],
    },
    debt: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '……他记得。行，那我就不赖了。',
      end: true,
    },
    card: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他笑了一下，液压爪合拢了一点。）他不会说这种话。他会说「让他自己来拿」。',
      end: true,
    },
  },
})

// ================================================================ 铁爪 · 债
Content.register(KIND.DIALOGUE, 'tiezhua_debt', {
  id: 'tiezhua_debt',
  npc: 'tiezhua',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他在避难所门口等着，手里捏着三张皱巴巴的废料券。）',
      choices: [
        { text: '你要出去？', next: 'go' },
        { text: '（看那三张券）', next: 'coupon' },
      ],
    },
    go: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '去还债。三张券，走了十一天才想起来欠着。……其实第一天就想起来了，只是没力气走。',
      next: 'ask',
    },
    coupon: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '三张。老钎给我的时候说「不用还」。他说不用还的意思就是「我记得」。',
      next: 'ask',
    },
    ask: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他把券塞进你手里。）替我还。我这人一见他就说不出话，不知道为什么。',
      choices: [
        { text: '（收下）', next: 'thanks' },
        { text: '你自己去。', next: 'self' },
      ],
    },
    self: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他站在那儿想了很久。）……行。我自己去。你陪我到门口就行。',
      next: 'thanks',
    },
    thanks: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他往村里走，走了两步又回头。）他要是问我在里面吃什么，你就说我吃得好。',
      effects: [
        { type: 'addSignal', n: 1 },
        { type: 'setFlag', flag: 'tiezhua_debt_paid' },
      ],
      end: true,
    },
  },
})

// ================================================================ 铁爪 · 闲聊
Content.register(KIND.DIALOGUE, 'tiezhua_idle', {
  id: 'tiezhua_idle',
  npc: 'tiezhua',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '（他把液压爪拆下来，放在膝盖上，用一块布擦里面的油泥。）',
      choices: [
        { text: '这爪子是原装的吗。', next: 'claw' },
        { text: '炉膛里是什么样。', next: 'furnace' },
        { text: '（离开）', next: 'bye' },
      ],
    },
    claw: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '不是。原来的手留在一个坍塌的井里了。这个是我自己配的，配了三年，比原来的好用，就是握不了筷子。',
      next: 'bye',
    },
    furnace: {
      speaker: 'tiezhua',
      portrait: 'tiezhua',
      text: '红。到处都是红的，即使火早灭了。铁在那种地方会一直记着热。我在里面就想，铁都记得，我应该也能记住出去的路。',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（他把爪子装回去，张合了两次，听液压阀的声音。）',
      end: true,
    },
  },
})

// ================================================================ K-9 · 初见
Content.register(KIND.DIALOGUE, 'k9_whistle', {
  id: 'k9_whistle',
  npc: 'k9',
  once: true,
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'narrator',
      text: '（它没有叫。它只是站起来，把鼻子凑到你手边，闻了很久，然后坐下。）',
      choices: [
        { text: '（吹了一声口哨。）', next: 'whistle' },
        { text: '（蹲下来）', next: 'crouch' },
      ],
    },
    whistle: {
      speaker: 'narrator',
      text: '（它的耳朵立刻竖起来，头歪向一侧，等第二声。你不再吹，它就一直等。）',
      next: 'wait',
    },
    crouch: {
      speaker: 'narrator',
      text: '（它把下巴搁在你的膝盖上。项圈里传出一声很轻的电子音，像是某种确认。）',
      next: 'wait',
    },
    wait: {
      speaker: 'narrator',
      text: '（过了很久，它才把视线移开。它大概明白了：会吹哨的人不是那个人。）',
      choices: [
        { text: '你叫什么。', next: 'name' },
        { text: '（摸它的项圈）', next: 'collar' },
      ],
    },
    name: {
      speaker: 'narrator',
      text: '（项圈背面刻着一个名字，磨得只剩第一个字母：M。它对这个字母没有反应。）',
      next: 'collar',
    },
    collar: {
      speaker: 'narrator',
      text: '（项圈还在工作。每隔十分钟，它自己响一次，像在替谁点名。）',
      effects: [{ type: 'startQuest', id: 'side_dogfood' }],
      choices: [
        { text: '（去找点吃的）', next: 'bye' },
        { text: '（陪它坐一会儿）', next: 'stay' },
      ],
    },
    stay: {
      speaker: 'narrator',
      text: '（你们在避难所门口坐了很久。雨声很大，项圈每十分钟响一次，一次也没落下。）',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（它趴下来，把头放在前爪上，眼睛还看着门口。）',
      end: true,
    },
  },
})

// ================================================================ K-9 · 狗粮
Content.register(KIND.DIALOGUE, 'k9_dogfood', {
  id: 'k9_dogfood',
  npc: 'k9',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'narrator',
      text: '（它闻到了罐头的味道，站了起来，但没靠近。）',
      choices: [
        { text: '（把罐头放在地上，退开。）', next: 'open' },
        { text: '（直接递过去）', next: 'hold' },
      ],
    },
    hold: {
      speaker: 'narrator',
      text: '（它没有接。它看着你的手，又看看罐头，喉咙里发出很低的鸣响。）',
      next: 'open',
    },
    open: {
      speaker: 'narrator',
      text: '（你退开三步。它才走过来，用鼻子把罐头拱正，然后趴下来，把鼻子贴在铁皮上，不咬，也不舔。）',
      effects: [
        { type: 'takeItem', id: 'dog_food', n: 1 },
        { type: 'deliver', itemId: 'dog_food', npcId: 'k9', n: 1 },
      ],
      next: 'open2',
    },
    open2: {
      speaker: 'narrator',
      text: '（它就那样趴着，很久。罐头没有开。它不需要开。）',
      choices: [
        { text: '（蹲在旁边）', next: 'beside' },
        { text: '（离开）', next: 'bye' },
      ],
    },
    beside: {
      speaker: 'narrator',
      text: '（它把尾巴在地上扫了两下。这是今天唯一的、明确的好消息。）',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（项圈又响了一次。它抬头，又低下去。）',
      end: true,
    },
  },
})

// ================================================================ K-9 · 闲聊
Content.register(KIND.DIALOGUE, 'k9_idle', {
  id: 'k9_idle',
  npc: 'k9',
  startNode: 'start',
  nodes: {
    start: {
      speaker: 'narrator',
      text: '（它趴在门口，一只耳朵朝着雨，一只耳朵朝着屋里。）',
      choices: [
        { text: '（扔一只旧手套）', next: 'fetch' },
        { text: '（检查项圈）', next: 'collar' },
        { text: '（离开）', next: 'bye' },
      ],
    },
    fetch: {
      speaker: 'narrator',
      text: '（它没有动。它看着手套落地，看了一会儿，然后把头转回门口。）……它不玩。它只是在等。',
      next: 'bye',
    },
    collar: {
      speaker: 'narrator',
      text: '（项圈的电量还有百分之六十一。按这个耗法，还能响四年。）',
      next: 'bye',
    },
    bye: {
      speaker: 'narrator',
      text: '（它把下巴放回前爪上。）',
      end: true,
    },
  },
})

export default true
