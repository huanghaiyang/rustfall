# 锈雨 · 编辑器

> 开发者用的可视化编辑工具，直接写 `localStorage`，游戏运行时热读生效。
> 全部走 Canvas2D 视口 + Vue 3.5 reactive 状态，不依赖 Three.js 画布。

---

## 0. 入口与调试

- dev server：`http://localhost:5180/`
- 编辑器入口：主菜单 / 开发者工具面板里的「精灵编辑器」「房间编辑器」
- 调试钩子（浏览器控制台可用）：

```js
window.__spriteEditor  // 精灵编辑器 hook
window.__roomEditor    // 房间编辑器 hook
```

两个 hook 都暴露了完整 store 单例、持久化函数、注册表单例与工程导入/导出函数，用于手动触发、读取状态或做单测。

---

## 1. 精灵编辑器（Sprite Editor）

**源码**

| 文件 | 职责 |
|---|---|
| `src/game/editor/sprite-store.js` | 数据中枢：注册表快照、Sheet/Sprite/Action/Frame/Bone/Shape 模型、族系模板、持久化 |
| `src/game/editor/sprite-viewport.js` | Canvas2D 视口：网格、骨骼、碰撞框、slot 手柄渲染与指针交互 |
| `src/components/panels/SpriteEditor/SpriteEditorPanel.vue` | 左栏 + 中 Canvas + 顶部工具条 |
| `src/components/panels/SpriteEditor/SpriteInspector.vue` | 右栏检视器（Sheet / Sprite / Bone / Shape 各项） |
| `src/components/panels/SpriteEditor/SpriteTimeline.vue` | Action 时间轴 |

### 1.1 持久化

- 工程文件整体存 `localStorage['rustfall.spriteeditor.v1']`（JSON）
- 可导出 / 导入 `.json` 工程（菜单 → 导出工程 / 导入工程）

### 1.2 实体注册表（左栏「游戏实体」区块）

模块在 `src/game/editor/sprite-store.js` 初始化时会调用 `Content.all(KIND.CHASSIS / KIND.MONSTER)` 把内容注册表的快照灌进三份 reactive 数组：

| 数组 | 填充来源 | 过滤 | 数量 |
|---|---|---|---|
| `ROLE_LIST` | `KIND.CHASSIS` 全部 | — | 约 11 |
| `MONSTER_LIST` | `MONSTER_IDS`（官方顺序） | 剔除 `rm_*` 关卡专属小怪 | 29 |
| `BOSS_LIST` | `LARGE_IDS`（7 大型怪 + 51 `tb_*` 主题站 BOSS） | — | 58 |

> **为什么用 reactive 数组**：内容注册表在模块加载时可能还没全部填完（chassis 由 `content/index.js` 总入口注册），`loadRegistry()` 允许重复填充，左栏依赖 reactive 才能在重填后刷新。

每个条目是：

```js
{ id, name, family, biome, elite, boss: true|false, hitbox: [w, h], color, artId }
```

### 1.3 先选目标 → 再上传精灵图

左栏顶部「游戏实体」区块：

- 搜索框：按 `name` / `id` 过滤三组
- 三个可折叠分组：角色 ROLES / 怪物 MONSTERS / BOSS BOSSES
- 点选任一实体后，区块头部显示当前目标徽标，左栏底部提示「目标「X」已绑 N 个 sprite」
- 顶部「导入精灵图」按钮：若已选目标 → 调 `importSheetForTarget(file, SE.sel.target)`，自动为该目标创建 sprite；否则走旧的 `importSheetFile(file)`

核心 API（见 `sprite-store.js`）：

| API | 作用 |
|---|---|
| `setTarget(kind, refId, boss=false)` | 设当前目标（写入 `SE.sel.target`） |
| `clearTarget()` | 清目标 |
| `targetDef(target)` | 取目标实体定义 |
| `findEntityDef(kind, refId)` | 按 kind + refId 查三份列表，返回 `{def, boss}` |
| `isBossRef(refId)` | 是否是 BOSS 引用 |
| `targetGroups()` | 左栏三组元数据 |
| `spritesOfTarget(refId)` | 已绑定该 refId 的 sprite 数组 |
| `createSpriteForTarget(target, sheet)` | 按目标自动建 sprite：`kind`、`refId`、`family`、`name`、`w/h`（取 hitbox）、自动套骨骼 + 碰撞模板 |
| `importSheetForTarget(file, target)` | 导入 PNG → 自动 `createSpriteForTarget` |

族系判定（`guessFamilyFromRef`）：

- BOSS → `boss`
- 角色 → `FAMILY_FROM_CHASSIS[机体.family] || 'biped'`
- 怪物 → 按 id 关键字：`fly/wing/drone → flyer`、`swarm/orb → swarm`、`boss/tyrant/golem/warden → boss`、`plant/cult/tentacle → plant`，默认 `minion`

### 1.4 Sprite 族系与模板

`SPRITE_FAMILIES` 定义了族系选项：

| family id | 说明 |
|---|---|
| `unknown` | 未分配（默认） |
| `biped` | 双足步行（玩家机体绝大多数） |
| `wheel` | 轮式（buggy/hopper） |
| `track` | 履带（tank/crane） |
| `arm` | 机械臂（lift） |
| `hover` | 悬浮（speeder） |
| `quad` | 四足 / 爬行 |
| `light` | 轻量 / 小型 |
| `flyer` | 飞行敌人 |
| `minion` | 普通小怪 |
| `swarm` | 群聚（爬虫 / 核心） |
| `boss` | BOSS |
| `plant` | 植物拟态 |
| `prop` | 道具 / 装饰 |
| `item` | 可拾取物 |

每个族系有预置骨骼（`bonesForFamily`）与碰撞模板（`shapesForFamily`），`applyFamilyBones / applyFamilyShapes / applyBoth` 一键套用，可选择覆盖或叠加。

### 1.5 工具条

主 Canvas 工具：

| id | 作用 | 快捷键 |
|---|---|---|
| `select` | 选择 Sprite / 骨骼 / 碰撞 | `1` |
| `frame` | 框选帧（从 sheet 上切 Action 帧） | `2` |
| `bone` | 在 Sprite 上点击加骨骼 | `3` |
| `rect` | 拖拽加矩形碰撞 | `4` |
| `circle` | 拖拽加圆形碰撞 | `5` |
| `poly` | 多边形碰撞 | `6` |
| `grip` | 武器抓握点 | `7` |
| `cast` | 技能施放点 | `8` |

### 1.6 数据模型速查

```js
SE.project = {
  sheets:  [],   // { id, name, src, width, height, naturalW, naturalH, scale, gridW, gridH }
  sprites: [],   // { id, sheetId, name, kind:'role'|'monster'|'generic', refId, family,
                 //   x, y, w, h, originX, originY,
                 //   bones:[{id,name,x,y,len,angle,parent}],
                 //   shapes:[{id,name,type:'rect'|'circle'|'poly', ...}],
                 //   slots:[{kind:'grip'|'cast',x,y}],
                 //   actions:[{id,name,loop,frames:[{id,x,y,w,h,duration}]}] }
  effects: [],   // 独立的特效帧（非 sprite）
  presets: [],   // 尺寸预设（批量新建 sprite 用）
}
SE.sel = {
  sheetId, spriteId, actionId, frameId, boneId, shapeId, effectId,
  tool,     // select|frame|bone|rect|circle|poly|grip|cast
  target,   // { kind, refId, boss }  —— 先选目标再导入精灵图
}
```

---

## 2. 房间编辑器（Room Editor）

**源码**

| 文件 | 职责 |
|---|---|
| `src/game/editor/room-store.js` | 房间 spec 生成、地形编辑、道具编辑、背景层编辑、持久化 |
| `src/game/editor/room-viewport.js` | Canvas2D 视口：tilemap / 道具 / 背景层渲染 + 指针交互 |
| `src/components/panels/RoomEditor/RoomEditorPanel.vue` | 左栏房间列表 + 中 Canvas + 顶部工具条 |
| `src/components/panels/RoomEditor/RoomInspector.vue` | 右栏检视器（房间参数 / 地形 / 道具 / 背景层） |
| `src/components/panels/RoomEditor/RoomCanvas.vue` | Canvas 包装 + 热补丁通道监听 |
| `src/game/world/room.js` | 游戏运行时房间生成（`generateBiomeRoom`）+ `buildUserBgLayers` 读背景层 |

### 2.1 持久化 & 运行时热补丁

- 房间编辑（tile + prop + bg 层）整体存 `localStorage['rustfall.roomeditor.v1']`
- 运行时地形差分同步走 `CustomEvent('rustfall:terrain-patch', { key, tiles })`，游戏 Canvas 在收到事件后原地改 tilemap，**不重开房间即可看到改动**
- 背景层编辑写 `rustfall.bgedits.v1[\`${regionId}:${roomId}\`].layers[]`，游戏 `buildUserBgLayers` 直接读这份表

> **为什么房间编辑器也写 `rustfall.bgedits.v1`**：之前房间编辑器和精灵编辑器共用运行时背景存储，统一 key 避免两份表不同步。

### 2.2 房间生成架构

```
regions.js :: worldRooms()              → 190 间静态 spec（tile 大小、props 类型、door 位置等）
  ↓
room-store.js :: generateRoom(spec)    → BASE_CACHE（基础生成，无覆写） + GEN_CACHE（差分展示层）
  ↓
room.js :: generateBiomeRoom(spec)      → 游戏运行时房间实例（tilemap + props + 门）
```

两层生成模型：`BASE_CACHE` 存程序生成的基础地形；`GEN_CACHE` 存编辑器的差分 patch。编辑器的 `setTile / eraseTile / fillTiles / addProp / removeProp` 都只写差分，不改基础层。这样 clear 即可还原。

### 2.3 Tile 类型

| id | 名称 | 渲染色 | 行为 |
|---|---|---|---|
| 0 | `EMPTY` | — | 空气 |
| 1 | `SOLID` | 灰 | 实体地面 / 墙 |
| 2 | `PLATFORM` | 浅灰 | 可跳上、可下穿（S） |
| 3 | `WATER` | 蓝 | 致死 / 水效 |
| 4 | `POLE` | 棕 | 可攀爬 |
| 5 | `CRACKED` | 裂纹 | 裂墙，可敲碎 |
| 6 | `SOIL` | 土黄 | 泥土（可挖） |
| 7 | `TOXIC` | 毒绿 | 酸液 |

`TS = 32`（每 tile 像素）。房间尺寸 96×44 ~ 160×68 tile。

### 2.4 工具条

| id | 作用 | 快捷键 |
|---|---|---|
| `terrain` | 地形绘制（选 tile 类型，点/涂/填充） | `1` |
| `prop` | 道具编辑（增删 props） | `2` |
| `door` | 门编辑 | `3` |
| `bg` | 背景层选择 / 移动 | `4` |

### 2.5 视图操作（滚轮 / 平移）

| 操作 | 行为 |
|---|---|
| 滚轮上下 | **直接缩放**（无需按 Ctrl / Shift），以光标位置为锚点，光标下的那一格保持不动 |
| 滚轮左右（触控板横滑） | 无效果（既不缩放也不平移） |
| 中键拖拽 / Alt+左键拖拽 | 平移画布 |
| 右上角 ＋ / － / 适应 / 1:1 | 以视口中心缩放 / 缩放到装下整间房 / 重置为 zoom=4 |

> **滚轮不再平移画布**：早期实现里 `wheel` 会做 `panX -= deltaX; panY -= deltaY`（滚轮上下推着画面走），现已移除。
> 现在滚轮唯一的作用是缩放，缩放时 pan 会按锚点公式补偿，所以缩放后光标指向的格子不变。

#### 性能：为什么以前平移会卡

`room-viewport.js` 现在做了三件事（改之前这三项都会让中键拖拽掉帧）：

1. **地形离屏缓存**（`terrainLayer()`）——整间房的地形预渲染到一张离屏 canvas（按 tile 颜色批量成 `Path2D` 一次填充），平移时只做一次 `drawImage` blit，不再逐格 `fillRect`（最大 160×68 = 10880 格/帧）。缓存键 = 地形内容哈希 + 缓存分辨率 + 房间尺寸，地形被改动后自动失效重建。缓存分辨率上限 8px/格，避免高倍缩放时离屏画布过大。
2. **rAF 节流**（`requestRender()`）——`pointermove` / `wheel` 期间同一帧内只重绘一次，合并高频事件。
3. **画布矩形缓存**（`this._rect`）——不再每次 `pointermove` 都调 `getBoundingClientRect()`（会触发强制同步重排）；只在 `resize` / `scroll`（capture）时刷新。

### 2.6 背景分层编辑（重点）

房间的游戏内背景由 `room.js :: buildBackground()` 生成，内置 biome 三层视差（far p=0.88 / mid p=0.7 / near p=0.48，Z.far = -150）。

**用户背景层**通过 `buildUserBgLayers(group, layers)` 叠加在视差层之后。每层数据结构：

```js
{
  id, name,
  parallax,    // 0~1。0 = 随地形不动；越接近 1 = 紧贴镜头（视差公式：mesh.x = user.x*(1-p) + cx*p）
  opacity,     // 0~1
  tint,        // 十六进制颜色，用离屏 canvas 在加载时 multiply 叠色 + destination-in 裁回原 alpha
  yOff,        // 世界像素，正值向下
  img: {
    src,        // dataURL
    w, h,       // 原始图像像素
    x, y,       // 图像中心，tile 单位（32px 为一格）
    scale,      // 0.1~10
  } | null      // 未上传图像的空层
}
```

**运行时视差公式**（`room.js :: updateBackground`）：

```js
if (l.user) {
  l.mesh.position.x = l.user.x * (1 - l.p) + cx * l.p
  l.mesh.position.z = Z.far + (1 - l.p) * 40    // p=0 靠近地面，p=1 贴近镜头
  l.mesh.position.y = -(l.user.y + l.yOff) - (cy + this.bgBaseY) * 0.04
  continue
}
```

**编辑器里的视差提示文案**：
> 视差 0 = 贴地面不动，1 = 随镜头移动（不参与视差）
> yOff 正值向下偏移

**tint 实现**（`room-viewport.js :: bgImgTinted`）：离屏 canvas 先生成原图像，再用 `multiply` 混色，然后 `destination-in` 用原 alpha 遮回去——避免把图像外的透明区域也染色。

**选中层后在画布上会**：画虚线描边 + 显示层名 + 在图像中心画一个小手柄（拖动即 `setBgImage(id, {x, y})`）。

#### 背景层 API

| API | 作用 |
|---|---|
| `bgLayers` | `computed(() => currentEdits()?.bg?.layers || [])` |
| `currentBgLayer` | 当前选中层（`RE.sel.bgLayerId`） |
| `addBgLayer(name)` | 新增空层 |
| `removeBgLayer(id)` | 删除层 |
| `moveBgLayer(id, 'up'|'down')` | 上下移动（数组尾 = 最上层，最后绘制） |
| `setBgLayerParam(id, 'name'|'parallax'|'opacity'|'tint'|'yOff', v)` | 调层参数 |
| `setBgImage(id, {x?, y?, scale?})` | 增量改图像位置 / 缩放 |
| `setBgLayerImageFile(id, file)` | 上传 PNG / JPG 作为该层图像 |
| `clearBgImage(id)` | 移除图像（保留层） |
| `syncAllBgTables()` | 读档 / 导入工程后把 `bg` 表回灌到 `rustfall.bgedits.v1`（在 `loadProject` / `importProjectJson` 里自动调用） |
| `bgLayerCount` | 当前房间层数 |

### 2.7 数据模型速查

```js
RE.project = {
  rooms: {
    // key = 'regionId:roomId'
    'city:r01': {
      spec: { /* 来自 worldRooms() 的静态 spec */ },
      // 差分 patch：只存变化量
      tiles:    { add: { 'x,y': type },    del: ['x,y'] },
      props:    { add: [ {kind, x, y, tx, ty} ], del: ['propId'] },
      bg:       { layers: [ /* 见 2.6 */ ] },
    }
  }
}
RE.sel = { regionId, roomId, bgLayerId, tool }
RE.view = { grid: true, bg: true }
```

> **注意**：`BASE_CACHE` / `GEN_CACHE` 是 `room-store.js` 内部的两层运行时缓存，不进 `RE.project`，也不持久化。持久化的只有差分 patch。

---

## 3. 内容注册表速查（`src/game/core/registry.js`）

```js
import Content, { KIND } from '../core/registry.js'

Content.register(KIND.MONSTER, 'claw_tyrant', { name, size:[w,h], biome, elite, xp, ... })
Content.all(KIND.MONSTER)           // → Array
Content.get(KIND.MONSTER, 'radboar') // → def | null
Content.stats()                      // → { monster: N, chassis: N, item: N, ... }
```

`KIND` 取值：`item | chassis | monster | quest | dialogue | companion | region | room | prop | tool | recipe | lore | biome | lootTable | mod`

### 3.1 怪物 / BOSS id 约定

- 常规小怪：静态 id（`radboar / crawler / spitter / wingrat / sentry / scrapper / drone / hulkbot / ghoul_husk / tunnel_hound / cyber_mantis / psycho_punk / server_wraith / weld_brute / cult_fanatic / alien_orb / vault_puppet / mine_shade / blood_thrall / fog_stalker / punk_raider / castle_knight / rogue_ai / dark_web_ghost / viral_wraith / nano_swarm / bandit_lookout / bandit_looter / bandit_scav`），共 **29** 条
- 7 个大型敌人：`junk_golem / sky_warden / mimic_beast / swarm_core / claw_tyrant / cyberpsycho_boss / esper_berserk`
- 51 个主题站 BOSS：全部 `tb_*` 前缀（`tb_data_archon / tb_assembly_overseer / tb_orbit_judge / ... / tb_hotel_nightmare`），见 `src/game/entities/monsters/large/theme-bosses.js`
- 关卡专属小怪：`rm_<roomId>_NN`（约 570 只），程序生成，**不进精灵编辑器左栏**

`LARGE_IDS = [7 大型怪, ...THEME_BOSS_IDS]` → 共 **58** 条 BOSS

---

## 4. localStorage Key 速查

| key | 用途 | 读写方 |
|---|---|---|
| `rustfall.save.v1` | 游戏主存档 | 游戏 `systems/save.js` |
| `rustfall.terrain.v1` | 编辑器地形差分（room-store 写，游戏 roomgen 读） | 房间编辑器 + 游戏 |
| `rustfall.bgedits.v1` | 背景层编辑（room-store 写，游戏 `buildUserBgLayers` 读） | 房间编辑器 + 游戏 |
| `rustfall.roomeditor.v1` | 房间编辑器工程文件 | 房间编辑器 |
| `rustfall.spriteeditor.v1` | 精灵编辑器工程文件 | 精灵编辑器 |
| `rustfall.settings.v1` | 设置（画面 / 音频 / 手柄） | 游戏 |

---

## 5. 草稿与发布

两个编辑器都支持「草稿 → 发布」两阶段工作流，避免编辑过程中频繁打扰游戏运行时。

### 状态枚举

| 值 | 含义 | 房间编辑器运行时推送 | 精灵编辑器运行时推送 |
|---|---|---|---|
| `published` | 已发布（默认，向后兼容） | **实时**：每次编辑都写 `rustfall.terrain.v1` / `rustfall.bgedits.v1` + 发 `rustfall:terrain-patch` CustomEvent | 标记 published + 发 `rustfall:sprite-editor-published` CustomEvent（游戏尚未接入） |
| `draft` | 草稿 | **不推**：所有编辑只改工程 localStorage（`rustfall.roomeditor.v1`），运行时表保持「上一次发布」版本 | 仅标记 draft（无运行时通路） |

### 工程状态字段（两个编辑器的 project 对象）

```js
{
  version: 2,
  status: 'published' | 'draft',
  updatedAt: '2026-10-29T12:34:56.789Z',   // 最近编辑时间
  publishedAt: '2026-10-28T08:00:00.000Z',  // 最近发布时间
  // ... 原有字段
}
```

### 核心 API（两个 store 同构）

```js
// 房间编辑器
publish()          // 切 published + 全量推送 edits → 运行时通道
setDraft()         // 切 draft，关 _runtimePushesEnabled
isDraft()          // 查询当前是否草稿
projectStatus      // computed：面板顶部徽标用

// 精灵编辑器
publish()          // 切 published + 发 CustomEvent
setDraft()
isDraft()
projectStatus
```

### 房间编辑器 publish() 内部流程

```
1. _runtimePushesEnabled = true
2. for (key of RE.project.edits 所有房间):
     pushBgTable(key)              // 背景层 → rustfall.bgedits.v1
     notifyTerrainPatch(key, tiles, clear=true)  // 地形 → CustomEvent
     terrainTable[key] = tiles     // 地形 → rustfall.terrain.v1
3. 写 localStorage['rustfall.terrain.v1']
4. status = 'published', publishedAt = now()
5. saveProject()  // 工程同步写 localStorage['rustfall.roomeditor.v1']
```

草稿模式下，setTile / eraseTile / fillTiles / addBgLayer / setBgLayerParam / setBgImage / setBgLayerImageFile / clearBgImage 的**内部** pushTerrain / pushBgTable 会看到 `_runtimePushesEnabled === false` 直接 return，所以运行时表完全不受影响。

### UI

顶栏状态徽标 + 按钮（两个编辑器样式一致）：

- **已发布**（默认）：绿点 + neon 色「已发布」；按钮组显示「保存草稿」→ 「保存工程」
- **草稿**：灰点 + 灰色「草稿」；按钮组显示「发布」（primary 高亮）→ 「保存工程」

### 向后兼容

- 旧工程没有 `status` 字段，`loadProject()` 时默认按 `published` 处理（因为旧版实时生效）
- `resetProject()` 重置到 `published` + `updatedAt/publishedAt = null`
- import/export 工程 JSON 都带上这三个字段

### 调试钩子

```js
// 浏览器控制台
window.__roomEditor.publish()
window.__roomEditor.setDraft()
window.__roomEditor.isDraft()          // → boolean
window.__roomEditor.projectStatus       // → 'published' | 'draft'

window.__spriteEditor.publish()
window.__spriteEditor.setDraft()
window.__spriteEditor.projectStatus
```

### 精灵编辑器的运行时通路（未来）

目前游戏运行时**不**从精灵编辑器工程加载 sprite——精灵还在纯 `public/sprites/*` 的 asset 通道里。发布时的 `CustomEvent('rustfall:sprite-editor-published', { sheets, sprites })` 是给未来接入用的。当游戏侧实现 sprite 加载时：

```js
window.addEventListener('rustfall:sprite-editor-published', ({ detail }) => {
  // 按 detail.sheets / detail.sprites 重新构建游戏运行时 sprite 表
  // 读同一个 localStorage['rustfall.spriteeditor.v1'] 拿 dataURL
})
```

---

## 6. 开发陷阱

1. **Vue computed 的 `._value` 是缓存**，debug 钩子若暴露 computed，调试时要读 `.value` 而非 `._value`。
2. **注册表填充时序**：`sprite-store.js` 在模块初始化时立刻 `_fillRegistry()` 一次，但 chassis 可能还没注册，所以 `loadRegistry()` 设计成可重复调——`SpriteEditorPanel.vue` 的 `onMounted` 里会再调一次。列表数组必须是 `reactive` 的，否则重填不触发 Vue 重渲染。
3. **`rm_*` 关卡专属小怪**：约 570 只，进左栏会把 UI 挤爆，必须在 `_fillRegistry` 时过滤。
4. **tint 实现污染**：初版在主画布用 `multiply + fillRect` 染整幅矩形，会把图像外透明区域也压暗。必须用离屏 canvas，先 `multiply` 再 `destination-in` 裁回原 alpha。
5. **运行时背景视差文案**：公式 `mesh.x = X0*(1-p) + cx*p` → p=0 贴地面、p→1 锁定镜头；yOff 正值向下（世界坐标系 y 轴向下）。文案要跟公式对齐，不要凭直觉写。
6. **房间地形双层缓存**：编辑器只改 `GEN_CACHE` 差分层，不要碰 `BASE_CACHE`。`clearRoomEdits()` 只是把差分层干掉，基础生成重放一遍。
7. **monsters index.js 会自动 `Content.register`**：import `entities/monsters/index.js` 或 `entities/monsters/large/index.js` 时就会注册，不需要手动调 register。
