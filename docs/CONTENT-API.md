# 锈雨 · RUSTFALL —— 内容接口契约（所有并行开发必须遵守）

> 项目：`D:\sgames\rain-world`（Vue 3 + Three.js，ESM，无外部美术/音频素材）。
> 主题：雨世界式「酸雨循环」生存玩法 × 废土机器人拾荒。像素风格。
> 参考氛围：《Fallout 1/2》《Wasteland》《Rain World》《Hyper Light Drifter》《Dead Cells》《NieR》废土段。

## 0. 铁律

1. **只写你被分配的文件**（任务描述里列出的 scope）。不要修改别人的文件、`package.json`、`vite.config.js`。
2. 只允许 import：`three`、以及本项目 `src/game/**` 里已存在的模块。**不要新增 npm 依赖**。
3. 所有导出必须真实可用：不允许 `throw new Error('TODO')`、空函数占位。
4. 纯 ESM。不使用 `require`。浏览器端代码禁止 `fs` / `path` / 网络请求（mod 加载器除外）。
5. 随机必须可复现：用 `src/game/render/rng.js` 的 `mulberry32/makeRng/hash2`，不要用 `Math.random()` 生成美术/地形/文案内容。
6. 像素风：Canvas2D 绘制，`NearestFilter`，硬边、抖动（dithering）、有限调色板（见 §9）。**禁止抗锯齿渐变糊成一团**（光晕类除外）。
7. 配色只允许用 §9 调色板（可加透明度/明度变化，不要引入高饱和霓虹之外的新色系；霓虹仅用于电子设备/UI）。
8. 完成前自检：`node --check <你的每个文件>` 必须通过；如果是数据文件，再跑一个临时 node 脚本验证结构（key 唯一、引用 id 存在）。
9. 完成后用一句话汇报：文件清单 + 行数 + 导出清单 + 已知注意事项。

## 1. 注册表（统一内容挂载点）

`src/game/core/registry.js` 已存在：

```js
import { Content, KIND } from '../core/registry.js'

Content.register(KIND.ITEM, 'lubricant', { ...def })
Content.register(KIND.MONSTER, 'radboar', { ...def })
```

`KIND` 取值：`item, chassis, monster, quest, dialogue, companion, region, room, prop, tool, recipe, lore, biome, mod, lootTable`。

- `Content.register(kind, id, def, source='core')`：重复 id 会抛错；mod 可传 `source='mod:<id>'`。
- `Content.get(kind, id)` / `Content.all(kind)` / `Content.has(kind, id)` / `Content.filter(kind, fn)`。
- 数据文件在模块顶层注册即可，被 import 时自动生效。

## 2. 物品 / 战利品

文件：`src/game/loot/catalog.js`（数据）+ `src/game/loot/lore-artifacts.js`（人类遗物条目）。

```js
Content.register(KIND.ITEM, 'lubricant', {
  id: 'lubricant',
  name: '润滑油',
  en: 'Lubricant',
  category: 'material',        // material | component | tool | consumable | artifact | data | rare | quest
  rarity: 1,                   // 1 常见 … 5 稀有
  weight: 0.6,                 // kg，影响背包负重
  value: 12,                   // 废土货币（废料券）
  stack: 20,                   // 最大堆叠；1 = 不可堆叠
  desc: '黏稠、发黑，混着金属碎屑。关节还能再撑几个循环。',
  lore: '',                    // 可选，长文本（遗物/数据类）
  tags: ['oil'],
  use: { energy: 1 },          // 可选：使用效果 energy/heal/repair/scan
  slot: 'joint',               // 可选：可安装组件槽位（见 §10）
  bonus: { speed: 0.08 },      // 可选：安装加成
  art: 'bottle',               // 可选：图标造型提示（见 §6）
})
```

分类约定（必须齐全，数量要求见任务）：`material`（铁/铜/稀土/布料/化学品…）、`component`（轴承/主板/内存条/光模块/陀螺仪/伺服电机…）、`tool`（铲子/镐/焊枪/扫描仪/电池组…）、`consumable`（电池/维修包/酸中和剂…）、`artifact`（日记/照片/书/首饰/衣物/磁带/儿童玩具…）、`data`（卡带/硬盘/纸条/信号记录…）、`rare`（外壳/反应堆芯/军用件…）、`quest`（任务物品）。

**总量要求：`catalog.js` ≥ 70 个物品；`lore-artifacts.js` ≥ 30 个带长文本的人类遗物（日记/照片/书籍/首饰/衣物/儿童物件/信件），每条 `lore` ≥ 60 字，风格：绝望、具体、有生活细节、不煽情。**

## 3. 机器人机体（玩家）

数据文件：`src/game/chassis/index.js`；美术：`src/game/render/art/chassis.js`（美术同学负责，见 §6）。

```js
Content.register(KIND.CHASSIS, 'unit7', {
  id: 'unit7',
  name: 'UNIT-7 游侠',
  en: 'RANGER',
  family: 'biped',           // biped | wheel | track | quad | arm | light
  maker: '宇树',             // 参考厂商：宇树/智元/特斯拉/波士顿动力/自研
  desc: '…',
  lore: '…',
  unlocked: true,            // 初始可选
  hp: 100,
  speed: 1.0,                // 移动倍率
  jump: 1.0,                 // 跳跃倍率
  dig: 1.0,                  // 挖掘倍率
  carry: 1.0,                // 负重倍率
  energyMax: 6,
  energyStart: 3,
  attack: 12,                // 近战（工具）伤害加成
  abilities: ['doubleJump?'], // 见下
  color: 0xb0713a,
  artId: 'unit7',
})
```

机体至少 8 台：`unit7`(双足游侠)、`tesla`(轮式拾荒者)、`agibot`(轮足搬运工)、`atlas`(机械臂施工者)、`spider`(四足勘探者)、`mule`(轻型信使)、`ghost`(潜行侦察)、`hulk`(重型破拆)。初始解锁 4 台，其余通过任务/稀有部件/mods 解锁。

能力标识（运行时我实现）：`doubleJump`、`fastSwim`、`wallClimb`、`digBoost`、`carryBoost`、`nightVision`、`radShield`、`hover`。

切换：游戏内随时 `Q` 循环切换已解锁机体（1.2s 变形冷却，消耗 1 能量）；标题界面先选初始机体。

## 4. 怪物

文件：`src/game/entities/monsters/*.js`，每个文件导出 `registerMonster()` 并注册：

```js
Content.register(KIND.MONSTER, 'radboar', {
  id: 'radboar',
  name: '辐射野猪',
  en: 'RADBOAR',
  family: 'beast',            // beast | rogue
  hp: 60,
  speed: 70,
  damage: 22,
  size: [64, 40],
  aggro: 380,
  attackRange: 90,
  attackType: 'lunge',        // lunge | spit | laser | charge | bomb | melee | swarm
  xp: 12,
  loot: [ { id: 'scrap_plate', chance: 0.9, min: 1, max: 2 }, ... ],
  artId: 'radboar',           // 由美术提供
  sound: 'growl',             // 复用 systems/audio 的音效名
  desc: '…',
  biome: ['village', 'city'], // 生成区域
})
```

**运行时约定**：`src/game/entities/monsters/base.js` 提供 `BaseMonster`（我写，包含血条、受击帧、死亡掉落、物理、寻路、通用状态机）。子类继承并实现 `updateBehavior(dt)`、`performAttack()`、可选 `buildVisual()`（默认用 art 帧）。**必须暴露**：`constructor(game, def, x, y)`、`update(dt)`、`takeDamage(n, fromX)`、`dispose()`、`group`、`alive`、`def`。

至少 8 种：`radboar`、`crawler`（群居爬虫）、`spitter`（喷酸）、`wingrat`（飞鼠）、`sentry`（失控哨兵，激光）、`scrapper`（拾荒机器人，近战/拆件）、`drone`（无人机，俯冲/炸弹）、`hulk`（重装残骸，冲撞）。beast 与 rogue 各 ≥ 4。

## 5. 任务 / 对话 / 同伴 / 营救

数据：`src/game/quests/data/quests.js`、`dialogues.js`、`companions.js`、`lore.js`（若与遗物合并可省略）。

```js
Content.register(KIND.QUEST, 'main_signal', {
  id: 'main_signal',
  title: '信号源',
  type: 'main',                    // main | side | rescue
  giver: 'baiya',                  // companion id
  desc: '白鸦说她截到一段重复信号……',
  objectives: [
    { id: 'relay1', type: 'repair', target: 'relay_a', count: 1, label: '修复中继站 A' },
    { id: 'reach', type: 'reach', target: 'factory_hall', count: 1, label: '抵达熔渣工厂主厅' },
    { id: 'talk', type: 'talk', target: 'laoqian', count: 1, label: '向老钎问话' },
    { id: 'collect', type: 'collect', target: 'board_cpu', count: 3, label: '收集 3 块主板' },
    { id: 'kill', type: 'kill', target: 'sentry', count: 2, label: '摧毁 2 台哨兵' },
    { id: 'rescue', type: 'rescue', target: 'rescue_huique', count: 1, label: '营救灰雀' },
  ],
  rewards: { items: [ { id: 'cell_large', n: 2 } ], signal: 1, unlockChassis: ['spider'] },
  next: 'main_relay',
  repeatable: false,
})
```

支持的 objective 类型（运行时我实现）：`collect | kill | reach | talk | repair | rescue | deliver | survive | inspect`。

对话（节点图）：

```js
Content.register(KIND.DIALOGUE, 'baiya_intro', {
  id: 'baiya_intro',
  npc: 'baiya',               // companion id
  once: true,
  nodes: {
    start: {
      speaker: 'baiya',
      text: '又是你。……别站在雨里，进来。',
      portrait: 'baiya',      // 立绘 id
      choices: [
        { text: '（点头）', next: 'brief' },
        { text: '你是谁？', next: 'who', once: true },
      ],
      effects: [ { type: 'startQuest', id: 'side_oil' } ],
    },
    who: { speaker: 'baiya', text: '……', next: 'brief' },
    brief: { speaker: 'baiya', text: '……', effects: [ { type: 'giveItem', id: 'cell_small', n: 1 } ], end: true },
  },
  startNode: 'start',
})
```

支持 effect：`startQuest | completeQuest | giveItem | takeItem | unlockChassis | setFlag | addSignal | heal | endDialogue`。

**对话内容要求**：≥ 6 位同伴/关键 NPC，≥ 22 段对话，总字数 ≥ 4000 字，包含分支、条件（`require: {quest:'x', item:'y', flag:'z'}`）、可重复闲谈。

同伴（避难所可交互 NPC）：

```js
Content.register(KIND.COMPANION, 'baiya', {
  id: 'baiya', name: '白鸦', en: 'BAIYA', role: 'mechanic'|'scavenger'|'medic'|'survivor'|'bot',
  shelter: 'shelter_city',      // 所在避难所 room id
  portrait: 'baiya',
  desc: '半张脸是金属的年轻女人。',
  dialogue: 'baiya_intro',
  services: ['repair', 'trade'], // 交互后可用功能
  rescue: null,                  // 若是被营救对象：{ quest, room, cage:'cage_1' }
  ambient: ['（她在给一只机械蟑螂上油）', '雨还没停。'],  // 随机闲聊
})
```

**营救任务**：至少 3 条。数据在 quests 里 `type:'rescue'`；被营救者定义 `rescue: { room:'city_slum_house', cage:'cage_grayfinch', escort: false }`。运行时：靠近牢笼 → 交互 → 目标加入 → 返回避难所 → 完成。数据里必须给出 `rescue` 字段与对应的 `KIND.PROP` 牢笼 id（见 §8）。

## 6. 美术 API（美术同学实现，我调用）

### 6.1 `src/game/render/art/chassis.js`
```js
export const CHASSIS_ART_IDS = [...]
export function getChassisArt(id) -> {
  w, h,                        // 精灵尺寸（像素=世界单位）
  frames: {                    // 每帧都是 THREE.CanvasTexture
    idle: [t],                 // 2 帧呼吸
    run: [t, t, t, t, t, t],   // 6 帧
    jump: t, fall: t, land: t, crouch: t, dig: t, hurt: t, dead: t,
  },
  portrait: t,                 // 64x64 立绘（半身）
}
```
尺寸建议：biped 40×46、wheel 46×34、track 50×36、quad 44×40、arm 46×48、light 36×44。**脚在画布底边、水平居中，朝右**。

### 6.2 `src/game/render/art/monsters.js`
```js
export function getMonsterArt(id) -> {
  w, h,
  frames: { idle:[t], run:[t...], attack:[t...], hurt:t, dead:t },
  anchor: 'bottom-center',
}
```

### 6.3 `src/game/render/art/items.js`
```js
export function getItemArt(itemId) -> THREE.CanvasTexture   // 20×20 图标，按 category/art 提示程序化生成
export function getCategoryIcon(category) -> t              // 16×16
```

### 6.4 `src/game/render/art/props.js`
```js
export function getPropArt(kind) -> t
// kind: skeleton_human, skeleton_animal, corpse, skull, ribcage, car_wreck, bus_wreck,
//       building_facade, house_facade, factory_pipe, barrel, crate, tire_pile, fence,
//       streetlight, tv, sofa, wardrobe, cradle, grave, cage, workbench, terminal,
//       generator, relay, antenna, satellite, campfire, tent, junk_heap, tree_dead, weed, puddle_toxic
export function getPortrait(npcId) -> t    // 96×96 像素立绘（头肩），风格参考废土 CRPG 头像
export function getToolArt(toolId) -> t    // 20×20
```

### 6.5 `src/game/render/art/world.js`
```js
export function getBiomeArt(biomeId) -> {
  sky: t,                       // 256×256 渐变（可拉伸）
  far: t, mid: t, near: t,      // 1024×512，横向无缝，透明天空
  ground: t,                    // 32×32 地面/墙面的可平铺材质（替代旧 tile 材质）
  fogColor: 0xRRGGBB,
}
// biomeId: city | village | factory | dump
export function getSmokeArt() -> t      // 128×128 柔和烟团
export function getAshArt() -> t        // 8×8 灰烬
export function getRainArt() -> t       // 8×64 酸雨条纹（偏黄绿）
```

### 6.6 Shader / 后期
文件：`src/game/render/fx/postfx.js` + `src/game/render/fx/shaders.js`（美术同学写，我集成）：

```js
export function createPostFX(renderer) -> {
  render(scene, camera, dt): void,   // 内部：低分辨率 RT（640×360 基准，按 aspect）+ 全屏 quad
  resize(w, h, aspect): void,
  setUniforms({ grain, scanline, vignette, chromatic, toxicity, smoke, damage, saturate, tint }): void,
  setPixelSize(v): void,             // 内部像素放大倍率（默认 2）
  dispose(): void,
}
export function createSmokeMaterial() -> THREE.ShaderMaterial   // 屏幕/世界空间缓慢翻卷浓烟
export function createGodRayMaterial() -> THREE.ShaderMaterial   // 尘光柱
export function createToxicWaterMaterial() -> THREE.ShaderMaterial // 毒液/酸水
```

后期必须：像素化（最近邻放大）、胶片颗粒、轻微色差、暗角、扫描线（很淡）、黄绿毒雾染色、受伤红闪。整体色调：铁锈橙 + 灰蓝 + 病态黄绿。

## 7. 世界 / 房间生成

文件：`src/game/world/regions/*.js`、`src/game/world/biomes/*.js`、`src/game/world/props.js`（道具布置数据）。

```js
export function generateBiomeRoom(spec) -> gen
// spec: { id, seed, biome, w, h, kind:'standard'|'shelter'|'gate'|'arena', shelterSide, exits:{left,right}, density }
// gen 契约（必须完全一致）：
{
  map,                       // Tilemap 实例（src/game/world/tilemap.js）
  w, h, floorY, ceilY, worldW, worldH,
  doorLeft: {x,y}, doorRight: {x,y},
  spawn: {x, y},             // 玩家默认出生（脚下 y）
  shelter: {x, y} | null,
  exits: {left:'roomId'|null, right:'roomId'|null},
  biome,
  loot: [ { id, x, y, hidden?:true, buried?:true } ],       // 战利品坐标（item id 来自 §2）
  monsters: [ { id, x, y } ],                                // 怪物 id 来自 §4
  props: [ { kind, x, y, scale?, flip?, z? } ],              // kind 来自 §6.4
  smokeSources: [ { x, y, radius, intensity } ],
  cages: [ { id, x, y, rescueQuest } ],                      // 营救牢笼
  landmarks: [ { id, x, y, kind } ],                         // 'relay_a' 等可交互目标
  dirtyTiles: []                                             // 不填
}
```

区域：`REGIONS = { city, village, factory, dump }`，每区 4–6 间房，包含 1 个避难所、若干营救点、1 个地标。

## 8. 道具 / 可交互物

`KIND.PROP` 数据（`src/game/world/props.js` 的 `PROPS`）：`kind`（美术 id）、`solid`、`interact`（shovel/pickaxe/welder/scanner）、`loot`、`questTarget`。牢笼 prop `interact:'rescue'`。

## 9. 调色板

`src/game/render/palette.js` 已更新为废土色板。可用键：
`void, ash, dust, rust, rustDark, rustLight, ochre, sand, bone, boneDark, blood, toxic, toxicDark, steel, steelBlue, steelLight, glass, oil, mossDead, skyDay, skyDusk, skyToxic, neon, neonWarm, neonCold, white, black`
（具体值见文件）。UI 用 CSS 变量，与色板一致。

## 10. 组件槽位（用于可替换组件）

`slot`: `joint`（关节/伺服）、`cpu`（主板/内存/光模块）、`power`（电池/反应堆）、`armor`（外壳/装甲）、`sensor`（传感器/探测器）、`utility`（工具/机械臂）。
安装逻辑我在 `src/game/loot/inventory.js`/`src/game/chassis/upgrades.js` 实现；数据里给出 `slot` 与 `bonus` 即可。

## 11. 字体 / UI 文案

UI 中文为主、英文小字副标题。文案风格：冷、干、具体，不要热血/中二。所有玩家可见文本用中文。

## 12. 验证

- `node --check` 每个文件。
- 数据引用完整性：写临时脚本 import 你的数据模块，断言：id 唯一、quest objectives 的 target 能在 items/props/companions/rooms 里找到、dialogue 的 next 节点都存在、monster loot 的 item id 都存在。
- 不要开着 `npm run dev` 反复改同一文件（会 HMR 重载），批量写完再自检。
