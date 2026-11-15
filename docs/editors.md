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
- **同时落盘**到 `<workspace>/editor-data/sprite-editor/project.json`（防浏览器数据被清；见 1.7）
- 可导出 / 导入 `.json` 工程（菜单 → 导出工程 / 导入工程）
- 历史版本快照见 **1.7 历史编辑记录**

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

### 1.7 历史编辑记录 + 落盘（防丢失）

**为什么**：`localStorage` 会被「清除站点数据」清掉、换浏览器/隐身模式直接没有、配额还只有 ~5MB
（一份工程带 dataURL 约 0.4~1MB）。所以编辑数据现在**双写**：浏览器存一份（快），磁盘存一份（稳）。

**落盘位置**（dev server 提供文件接口，见下）：

```
editor-data/sprite-editor/
├─ project.json            当前工程（自包含，连 sheet 的 dataURL 一起）
├─ project.prev.json       上一版（每次覆盖前的自动备份）
└─ history/
   ├─ index.json           历史索引（只剩 meta：时间/原因/计数/绑定目标）
   └─ <id>.json            单条快照 { meta, project }（自包含，可单文件拷走）
```

**什么时候记一条历史**：

| 触发 | reason |
|---|---|
| 顶栏「发布」 | `发布` |
| 顶栏「清空」 | `清空前`（先存再清） |
| 「导入工程」 | `导入前` |
| 历史面板「恢复此版本」 | `恢复前`（内容与最新一条相同则去重，不产生垃圾条目） |
| 历史面板「存当前快照」 | `手动快照`（force，不去重） |

**存储优先级**（自动降级）：磁盘 → IndexedDB → localStorage（最后兜底只留 3 条）。
上限 **24 条 / 60MB**，超了从最旧的开始丢。

**面板**（顶栏「历史 N」）：左列表 / 右详情。
- 左：目标下拉（默认跟当前选中的游戏实体走，可直接看「数据执政官上一次的编辑」）+ 搜索 + 时间倒序
- 右：那一刻的绑定目标、结构摘要（图集/角色/动作/帧/骨骼/碰撞）、**与当前版本的结构差异**、
  动作帧预览（图集缩略 + 帧矩形编号，可切动作）
- 底：「恢复此版本」/「删除这条」

**恢复语义**：先把当前工程存成「恢复前」→ 装入历史版本 → 若该版本是已发布状态，
直接 `publish()`（走 5.5 的运行时覆盖通道，场上 BOSS 立刻换帧，不再重复记快照）。

**API**（`sprite-store.js` / `sprite-history.js` 导出，`window.__spriteEditor` 也挂了）

| API | 作用 |
|---|---|
| `recordHistory(reason, {force})` | 把当前工程存成一条历史（内容相同 → null） |
| `historyEntries()` | 历史 meta 列表（时间倒序，不读 payload） |
| `historyProject(id)` | 某条快照的整份工程 |
| `restoreHistory(id)` | 恢复（含「恢复前」留档 + 自动发布） |
| `deleteHistory(id)` / `wipeHistory()` | 删一条 / 清空 |
| `flushDiskProject(force)` | 立刻把当前工程写盘（不等 600ms 防抖） |
| `restoreProjectFromDiskIfEmpty()` | localStorage 空 → 从磁盘捞回工程（清过浏览器数据的场景） |
| `migrateHistoryToDisk()` | 把浏览器里已有的历史补写进磁盘 |
| `diffProjects(prev, cur)` / `summarizeProject(p)` | 纯函数，结构差异 / 摘要（面板和自检共用） |

**dev server 文件接口**（`scripts/editor-fs-plugin.mjs`，只允许 localhost）：

```
GET    /__editor/sprite/ping          → { ok, dir, fileApi:'disk' }
GET    /__editor/sprite/project       → 工程 JSON（没有则 204）
POST   /__editor/sprite/project       → 覆盖写（自动备份 project.prev.json）
GET    /__editor/sprite/history       → meta 列表
POST   /__editor/sprite/history       → { meta, project } 写一条
GET    /__editor/sprite/history/:id   → { meta, project }
DELETE /__editor/sprite/history/:id   → 删一条
DELETE /__editor/sprite/history       → 清空
```

> 生产构建没有这个中间件 → 探测 404 → 自动退回 IndexedDB，编辑器和游戏都不会报错。
> 历史面板顶部会显示当前到底是「已落盘 · <绝对路径>」还是「IndexedDB（无落盘接口）」。

**坑**：

1. `SE.project` 是 Vue reactive proxy，**不能直接塞进 IndexedDB / `JSON.stringify`** → 一律先 `plainProject()` 拍平。
2. 「发布」里的 `recordHistory` 是 fire-and-forget，外部再 `await` 一次会**并发**读同一个「最新一条」→ 写出重复快照。
   `addHistory` 内部用一条 promise 链串行化，去重才可靠。
3. `saveProject()` 默认防抖 600ms 落盘；**发布 / 关面板 / 关页面**必须显式 `flushDiskProject()`，
   否则最后 0.6s 的编辑会丢。
4. 写盘用「先写 `.tmp` 再 `rename`」，断电不会留下半截 JSON；`index.json` 的读-改-写也串行。

### 1.8 骨骼 / 碰撞体 与「智能识别」

**源码**

| 文件 | 职责 |
|---|---|
| `src/game/editor/rigs.js` | 族系构型表（骨头 / 碰撞体 / 颜色 / 层级）、`assembleRig`、`absoluteToLocal` |
| `src/game/editor/skeleton-fit.js` | 从 alpha 轮廓识别锚点与骨骼（纯函数，可离线单测） |
| `src/game/editor/ai-mask.js` | 可选：Hugging Face 分割蒙版客户端 |
| `SpriteInspector.vue` | 「智能识别 · AUTO RIG」区块、骨骼/碰撞体列表与编辑器 |
| `sprite-viewport.js` | 骨骼按 `kind` 配色、碰撞按 `role` 配色、放大后标骨骼名 |

#### 坐标系（最容易错的一处）

- 骨骼 / 碰撞都活在 **帧像素坐标**：原点 = 当前帧左上角，`x` 右、`y` 下。
  不是 `sprite.w/h` —— 那是逻辑命中框（数据执政官 136×168，帧是 272×336）。
- 落库时骨骼必须是 **层级相对**：`boneTransforms()` 里子骨骼的 `x/y` 是
  「父骨骼末端坐标系里的偏移」、角度相对父级累加。识别器产出的是**绝对坐标**，
  所以 `toStoredBones()` 会先过一遍 `absoluteToLocal()`。
  > 不做这一步，层级会一层层叠加偏移，骨骼整片飞出去。
  > 反过来，编辑老工程里那些「写死绝对坐标」的模板骨骼本身就是错的 —— 新模板已按帧框归一化。

#### 构型（`rigs.js`）

每个骨头声明 `{ name, kind, parent, from, to, fb }`：`from/to` 是锚点槽名（识别结果），
`fb` 是归一化兜底值（识别不到时用模板位置）。碰撞体同构：`{ name, role, from, to, fb }`。

| family | 骨头 | 说明 |
|---|---|---|
| `mech` / `biped` / `boss` / `arm` | 21 | 机械人形：root→pelvis→spine→chest→head→crown、双肩+上臂/前臂/手、双髋+大腿/小腿/足、prop |
| `quad` | 8 | 脊柱横放 + 四条腿 + 尾 |
| `flyer` | 6 | 机身 + 双翼 + 尾 |
| `swarm` | 6 | 核心 + 四条触须 |
| `plant` | 5 | 根 + 茎 + 头 + 卷须 |
| `minion` / `light` / `wheel` / `track` | 5 | 极简 |

骨骼 `kind`（19 种）与碰撞体 `role`（9 种）见 `BONE_KINDS` / `SHAPE_ROLES`，
种类决定配色与未来接引擎 IK / 断肢 / 爆头倍率的语义。

#### 识别算法（`skeleton-fit.js`，确定性、离线、无模型依赖）

```
alpha ──► 掩码 / 包围盒
      ──► 倒角距离变换（厚度场）
      ──► 躯干块：厚度 ≥0.5×max 的核心定位置 → 放宽到 0.18×max 取真实外框
      ──► 髋线 = 躯干底（夹在 42%~82% 帧高）
      ──► 腿：先在「贴地 13% 带」找脚簇（掐掉弱边）→ 各自向上取腿的列窗
              只能找到一只脚 → 退回「髋线以下列聚类」；再不行 → 中线对半拆
      ──► 手臂：躯干中下段、躯干外侧、厚度 ≥6%×max 的突起 → 肩/肘/手/指尖
      ──► 头：只在「躯干正上方那一列带」里找（否则两侧线缆/光环会撑大头部框）
      ──► 道具：两腿外侧、宽高都 ≥12% 帧尺寸的独立块（严格验收，宁可不出假框）
      ──► assembleRig/Shapes（缺锚点的零件不生成，而不是拿兜底值硬凑）
      ──► 置信度 = 骨骼支撑度(采样点落在掩码内的比例)×0.7 + 长度合理性×0.3
            覆盖率 = 掩码像素被碰撞体覆盖的比例（另算「排除总命中框」的体表覆盖率）
```

多帧联合拟合 `fitFrames()`：每条动作的每一帧各识别一次，**关节取中位数**当静息骨架
（走路循环这种「躯干不动、四肢晃」的动作最稳），零件类骨骼要求「半数以上帧都认出来」，
否则宁可不生成。数据执政官 10 帧实测：`20 骨 / 7 碰撞体 / 置信 0.80 / 体表覆盖 76~94%`。

#### UI 用法

精灵编辑器 → 右栏「智能识别 · AUTO RIG」：

- 模式：`整条动作（多帧取中位，最稳）` / `当前动作` / `当前帧`
- 「识别骨骼 + 碰撞」→ 直接覆盖该 sprite 的 bones / shapes，并把元数据写进 `sprite.rig`
  （来源 / 模式 / 帧数 / 置信度 / 覆盖率 / 警告），面板上显示「上次识别：local · all · 10 帧 · 置信 80%」
- 骨骼列表显示 `种类色点 + 角度 + 单骨置信度`；点开可改 `种类`；碰撞体列表显示 `type · role`
- 参数手调（X/Y/长度/角度/父级）照旧，识别只是把初值填对，不是锁定

#### API

| API | 作用 |
|---|---|
| `autoFitRig(sprite, {mode:'all'\|'action'\|'current', useAiMask, family})` | 识别并覆盖 bones/shapes，返回 `{ok, bones, shapes, stats, warnings}` |
| `placeBonesForFamily(family, {w,h})` / `placeShapesForFamily(...)` | 用模板锚点摆一套（不依赖图集内容） |
| `frameBoxOf(sprite)` | 取「绘制框」：优先帧矩形，其次 `sprite.w/h` |
| `absoluteToLocal(list)` | 绝对坐标 → 层级相对（落库前必过） |
| `fitSkeleton({alpha,w,h,family})` / `fitFrames(frames, opts)` | 纯识别器（Node 里也能跑，只吃 alpha 数组） |
| `findAnchors(alpha,w,h)` | 只要锚点（调试 / 画叠加图用） |

#### Hugging Face 分割蒙版（可选增强）

**为什么不是姿态估计模型**：COCO 关键点那类模型训练分布是真人照片，
喂「侧面像素机甲」只会得到离谱的关键点。真正有用的只是**干净的前景蒙版**，
骨架交给几何识别。所以接的是抠图/分割模型（默认 `briaai/RMBG-1.4`）。

配置（二选一）：

```bash
# 环境变量
set HF_TOKEN=hf_xxx
# 或者落一份配置文件（会被 dev server 读，token 不进前端）
editor-data/ai-config.json → { "token": "hf_xxx", "model": "briaai/RMBG-1.4" }
```

接口：`GET /__editor/ai/status`、`POST /__editor/ai/segment`（经 dev server 代理，
token 不出服务端、同图结果按 sha1 缓存 12 条、`x-wait-for-model: true`）。
没配 token / 离线 / 模型报错时，`/status` 返回 `available:false` + 具体原因，
面板显示「AI 蒙版不可用：…」，识别自动走纯本地路径，**不会报错也不会卡住**。

#### 验证

```bash
node scripts/verify-skeleton-fit.mjs   # 识别算法：10 帧样本 + 确定性 + 鲁棒性 + AI 降级 + 叠加图
node scripts/verify-editor-rig.mjs     # 编辑器全链路：坐标系往返 ≤2px + 落库字段 + 磁盘工程
```

两个脚本都会输出「骨骼 / 碰撞体 / 置信度 / 覆盖率」明细并落一张可视化叠加图。

#### 坑

1. **层级相对 vs 绝对**：见上文坐标系。往返校验是 `maxErr ≤2px`（实测 0.01px）。
2. **帧框 ≠ sprite.w/h**：模板/识别一律用 `frameBoxOf()`，否则 272×336 的帧上骨头会挤在左上角。
3. **躯干阈值**：只用 `0.5×maxDist` 会只框住机柜最厚的一条带（实测 63px 宽），
   必须「核心定位置、放宽阈值定尺寸」。
4. **髋线**：按「宽度突然变窄」找髋线，在提着箱子/叉腿时会一路漂到 271（真值 205），
   所以直接用躯干底 + 夹取。
5. **脚簇弱边**：手提箱在地面带会压出 1~2px 浅痕，脚簇的列范围要掐掉弱边（≥50% 峰值），
   否则整条箱子会并进后腿。
6. **道具宁缺毋滥**：与身体相连的挂件严格来说需要实例分割，几何上只认「两腿外侧、够大够方」的块。


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
| IndexedDB `rustfall-sprite-editor` | 精灵编辑器历史（无落盘接口时的缓存） | 精灵编辑器 |
| `rustfall.se.history.meta.v1` / `.body.v1.*` | 历史（localStorage 兜底，最多 3 条） | 精灵编辑器 |

**磁盘上的编辑数据**（`editor-data/`，已 gitignore —— 属于本机工作数据，不入库）：

| 路径 | 用途 |
|---|---|
| `editor-data/sprite-editor/project.json` | 精灵编辑器当前工程（自动落盘，清浏览器数据后可恢复） |
| `editor-data/sprite-editor/project.prev.json` | 上一版工程（覆盖前备份） |
| `editor-data/sprite-editor/history/index.json` | 历史索引（meta） |
| `editor-data/sprite-editor/history/<id>.json` | 单条历史快照（自包含） |
| `editor-data/blobs/room-editor.json` | 房间编辑器：工程 + 地形表 + 背景表（一份 JSON） |

房间编辑器同样在 `saveProject()` / 地形与背景表写入时镜像到
`editor-data/blobs/room-editor.json`（防抖 800ms），面板打开时如果 localStorage 是空的，
会先尝试从磁盘恢复。API：`flushDiskBackup()` / `restoreProjectFromDiskIfEmpty()` /
`diskBackupState()`（`window.__roomEditor` 上也挂了）。通用文件接口
`GET|PUT|DELETE /__editor/blob/:name`，写入 `editor-data/blobs/<name>.json`。

---

## 5. 草稿与发布

两个编辑器都支持「草稿 → 发布」两阶段工作流，避免编辑过程中频繁打扰游戏运行时。

### 状态枚举

| 值 | 含义 | 房间编辑器运行时推送 | 精灵编辑器运行时推送 |
|---|---|---|---|
| `published` | 已发布（默认，向后兼容） | **实时**：每次编辑都写 `rustfall.terrain.v1` / `rustfall.bgedits.v1` + 发 `rustfall:terrain-patch` CustomEvent | 标记 published + 发 `rustfall:sprite-editor-published` CustomEvent；**BOSS 动作已接入**（见 5.5） |
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

### 精灵编辑器的运行时通路（已接入：BOSS 动作覆盖）

精灵编辑器发布的 sprite 现在会**真的落到游戏里的角色身上**，通路在
`src/game/render/art/sprite-editor-bridge.js`，消费方是 `render/art/boss-action.js`：

```
精灵编辑器 publish()
  → localStorage['rustfall.spriteeditor.v1']（含 sheet 的 dataURL）
  → CustomEvent('rustfall:sprite-editor-published')
  → boss-action.js: invalidateEditorSprites() + clearBossActionCache() + _version++
  → 下一次 loadBossAction(id)：磁盘图集 frames 打底，编辑器同名动作整组覆盖
  → 场上 BOSS 的 updateBehavior 发现 bossActionVersion() 变了 → _loadActionFrames() 就地换帧
```

优先级与语义：

| 项 | 规则 |
|---|---|
| 谁生效 | 编辑器 `sprite.refId` 命中 + 该动作有帧 → 覆盖；否则继续用磁盘图集 |
| 覆盖粒度 | **按动作名整组替换**（`idle / walk / run / attack / cast / hurt / dead / move`），不做逐帧混拼 |
| 帧率 | 编辑器 action 的 `fps` 压过磁盘 `manifest.fps` |
| 尺寸 | 编辑器 sprite 的 `w/h`（= 命中框）作为无图集时的逻辑尺寸兜底 |
| 热更新 | 发布即生效，不用重进房间、不用重新 build |

桥接实现里三个必须知道的点：

1. **帧矩形是逻辑坐标**：`offset/repeat` 一律除以 `sheet.width/height`（逻辑尺寸），
   别用 `naturalW` —— `sheet.scale ≠ 1` 时会对不上。
2. **THREE 纹理 `flipY = true`**（`v=0` 在图片底部），所以帧的 `y` 要翻过来：
   `offset.y = 1 - (frame.y + frame.h) / sheetH`。
3. **一张 sheet 只上传一次 GPU**：同一 sheet 的所有帧都是同一张纹理的 `clone()`，
   只差 `offset/repeat`；不 clone 会让 N 个动作抢同一个 offset。

> 为什么是「覆盖」而不是「编辑器工程替代 public/sprites」：磁盘图集是**可发布、可入库**的
> 成品（新机器 / 无 localStorage 也能跑），编辑器工程是**随时可调**的覆盖层。
> 两条路读同一份数据形状，所以调满意了再用 `scripts/boss-walk-post.mjs` 烘回磁盘。

#### 5.5 实操：把一条序列帧绑到角色（数据执政官走路为例）

```bash
# 1) N 张单帧 PNG → 一张横向图集 + manifest 帧组
node scripts/boss-walk-post.mjs            # 默认 数据执政官 原地走路 001~010

# 2) 用内嵌编辑器绑定到目标并发布（真点 UI：主菜单 → 精灵编辑器 → 选目标 → 导入精灵图）
node scripts/sprite-editor-apply-walk.mjs  # --boss / --strip / --cols / --cellw / --cellh / --fps

# 3) 进 BOSS 测试房验：帧数 / 帧率 / 「纹理图源是 dataURL」= 确实走了编辑器
node scripts/verify-boss-walk.mjs          # --no-editor 只验磁盘图集那条路
```

图集规范（`public/sprites/boss-action/manifest.json`）：

```jsonc
{
  "tb_data_archon": {
    "kinds": {                       // 一只 BOSS 可以有任意多张图集
      "base": { "file": "sprites/boss-action/tb_data_archon.png",      "frames": 12 },
      "walk": { "file": "sprites/boss-action/tb_data_archon_walk.png", "frames": 10 }
    },
    "frameW": 272, "frameH": 336,    // 每格像素（= logicalW/H × 2）
    "logicalW": 136, "logicalH": 168,
    "fps": { "idle": 6, "walk": 11, "run": 11, "attack": 12, "cast": 10, "hurt": 8, "dead": 5 },
    "frames": {
      "idle":   ["base:0", "base:1"],
      "walk":   ["walk:0", "…", "walk:9"],
      "run":    ["walk:0", "…", "walk:9"],   // 引擎里「移动」读的是 run
      "attack": ["base:6", "base:7"]
    }
  }
}
```

帧引用两种写法：`"<kind>:<index>"`（多图集必须用这个）或纯数字 `<index>`（旧格式，按动作名猜图集）。
`walk / run / move` 三个名字都归一化到移动循环；`hurt / dead` 旧格式映射到 `react` 图集。

---

## 6. 开发陷阱

1. **Vue computed 的 `._value` 是缓存**，debug 钩子若暴露 computed，调试时要读 `.value` 而非 `._value`。
2. **注册表填充时序**：`sprite-store.js` 在模块初始化时立刻 `_fillRegistry()` 一次，但 chassis 可能还没注册，所以 `loadRegistry()` 设计成可重复调——`SpriteEditorPanel.vue` 的 `onMounted` 里会再调一次。列表数组必须是 `reactive` 的，否则重填不触发 Vue 重渲染。
3. **`rm_*` 关卡专属小怪**：约 570 只，进左栏会把 UI 挤爆，必须在 `_fillRegistry` 时过滤。
4. **tint 实现污染**：初版在主画布用 `multiply + fillRect` 染整幅矩形，会把图像外透明区域也压暗。必须用离屏 canvas，先 `multiply` 再 `destination-in` 裁回原 alpha。
5. **运行时背景视差文案**：公式 `mesh.x = X0*(1-p) + cx*p` → p=0 贴地面、p→1 锁定镜头；yOff 正值向下（世界坐标系 y 轴向下）。文案要跟公式对齐，不要凭直觉写。
6. **房间地形双层缓存**：编辑器只改 `GEN_CACHE` 差分层，不要碰 `BASE_CACHE`。`clearRoomEdits()` 只是把差分层干掉，基础生成重放一遍。
7. **monsters index.js 会自动 `Content.register`**：import `entities/monsters/index.js` 或 `entities/monsters/large/index.js` 时就会注册，不需要手动调 register。
