// =============================================================================
// 地图彩蛋：把《辐射》《上古卷轴5》《尼尔：机械纪元》《地铁》《阿基拉》
// 《赛博朋克》的经典意象散布到各个生物群系。
// 只做两件事：
//   injectEasterEggs(data, regionId, roomId) —— 往房间 props 里塞 0~2 个彩蛋
//   handleEgg(game, it, def)                —— 处理调查交互（一次性给经验 + 文本）
// 贴图/尺寸在 render/art/props.js 与 world/props-data.js 里登记。
// =============================================================================
import { G, notify, toast } from '../state.js'
import { addXp } from '../systems/growth.js'

/** 稳定哈希：同一房间每次生成结果一致 */
function hashStr(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const EGGS = {
  vault_door: {
    name: '避难所大门',
    biome: ['city', 'factory'],
    xp: 22,
    text: '齿轮形的钢门半嵌在土里，门牌上还能认出「VAULT 117」。里面没有回应，只有一段循环了太久的欢迎录音。',
    toast: '你听见门后传来一句：「欢迎回家。」',
  },
  word_wall: {
    name: '龙语墙',
    biome: ['factory', 'dump'],
    xp: 24,
    text: '一面被酸雨泡黑的石墙，刻痕还在发微光。你认不出文字，但机体的语音模块自动拼出了一句话：「吼声即语言。」',
    toast: '墙上的刻痕亮了一下，又暗下去。',
  },
  lunar_flower: {
    name: '月之泪',
    biome: ['dump', 'city', 'factory'],
    xp: 18,
    text: '一朵不该存在于废土的白花，在辐射尘里安静地开着。花心有一点蓝色的光，像谁把月亮弄丢在了这里。',
    toast: '白花在你靠近时轻轻晃了一下。',
  },
  metro_sign: {
    name: '地铁站牌',
    biome: ['factory', 'city'],
    xp: 16,
    text: '生锈的站牌只亮着半个字母：「...ETRO」。下面的线路图被人用粉笔补了一行字——「别在隧道里回头」。',
    toast: '隧道深处传来一声很远的金属摩擦。',
  },
  akira_bike: {
    name: '赤色摩托',
    biome: ['city', 'factory'],
    xp: 20,
    text: '一辆红色摩托侧躺在瓦砾中，油箱上烫着「金田」两个字。引擎早就死了，但车灯还在按某种节奏闪。',
    toast: '车灯闪了三下，像在回应谁。',
  },
  neon_poster: {
    name: '霓虹海报',
    biome: ['city'],
    xp: 14,
    text: '半张被雨泡烂的海报贴在墙上，只剩一句「WAKE UP, SAMURAI」。你盯着看了一会儿，广告牌忽然自己亮了一秒。',
    toast: '海报亮起的一瞬，你听见了电流里的笑声。',
  },
  nier_whale: {
    name: '白色巨鲸残骸',
    biome: ['dump', 'factory'],
    xp: 26,
    text: '一具巨大的白色骨架横在垃圾场尽头，肋骨像教堂的梁。没有人知道它是不是机器，也没有人敢拆它。',
    toast: '风穿过骨架，发出像歌声一样的低鸣。',
  },
}

const EGG_IDS = Object.keys(EGGS)

function pickEgg(rnd, biome) {
  const candidates = EGG_IDS.filter((id) => EGGS[id].biome.includes(biome))
  if (!candidates.length) return null
  return candidates[Math.floor(rnd() * candidates.length)]
}

// 简单的确定性随机（与房间 id 绑定）
function makeRnd(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * 往房间数据里注入彩蛋。
 * 规则：避难所不刷；每个房间约 38% 概率出 1 个，12% 概率出 2 个。
 */
export function injectEasterEggs(data, regionId, roomId) {
  if (!data || data.shelter) return
  const key = `${regionId}:${roomId}`
  const rnd = makeRnd(hashStr(key) ^ 0x9e3779b9)
  const roll = rnd()
  let count = roll < 0.12 ? 2 : roll < 0.5 ? 1 : 0
  if (!count) return
  const worldW = data.worldW || 1600
  const floorY = data.floorY || 0
  data.props = data.props || []
  const used = new Set()
  for (let i = 0; i < count; i++) {
    let id = pickEgg(rnd, data.biome)
    if (!id) break
    if (used.has(id)) id = EGG_IDS.find((x) => !used.has(x)) || id
    used.add(id)
    const def = EGGS[id]
    const margin = 180
    const x = Math.round(margin + rnd() * Math.max(1, worldW - margin * 2))
    data.props.push({
      kind: id,
      x,
      y: floorY,
      scale: def.scale || 1,
      flip: rnd() < 0.5,
      egg: true,
    })
  }
}

/** 调查彩蛋：一次性文本 + 经验；重复调查只给一句提示。 */
export function handleEgg(game, it, def) {
  if (!def || !def.egg) return false
  const kind = it.propKind
  const meta = EGGS[kind]
  if (!meta) return false
  const flag = `egg:${game.regionId}:${game.roomId}:${kind}`
  if (G.flags[flag]) {
    toast('这里已经没有新的东西了。', 'info', 2)
    return true
  }
  G.flags[flag] = true
  addXp(meta.xp || 15)
  game.sfx?.('uiClick', { vol: 0.35 })
  game.particles?.emitMany?.('spark', it.x, it.y - 30, 8)
  notify(`${meta.name}：${meta.text}`, 'info', 6)
  return true
}
