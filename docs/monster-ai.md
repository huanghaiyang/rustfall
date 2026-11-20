# 怪物 / BOSS 移动与地面探测

> 这份文档只讲一件事：**敌人为什么走不动 / 走错方向**，以及地面、墙体探测的语义。
> 2025-11 修过一例：数据执政官「原地打转、零位移」，根因就在 `groundAhead` 的探测深度。

## 1. 移动链路

```
updateBehavior(dt)            # 子类 AI：decision only，写出 this.vxTarget / state / anim
  ↓
BaseMonster.update(dt)        # 物理推进
  body.vx += (vxTarget - body.vx) * min(1, dt*8)
  body.vy += gravity * dt
  moveBody(map, body, dt)     # AABB ↔ 瓦片，分轴解算（会写 body.wallDir / onGround，并把撞墙的 vx 归零）
  ↓
applyFrame / syncMesh         # 动画帧 + 3D 摆位
```

关键点：**AI 只写 `vxTarget`**，真正能不能动由 `moveBody` 决定。
如果 `vxTarget` 被 AI 自己清成 0，角色就一动不动——即使物理层完全通畅。

## 2. 探测语义

`BaseMonster` 上两个方法（`src/game/entities/monsters/base.js`）：

| 方法 | 探测点 | 容差 |
|---|---|---|
| `groundAhead(dir, maxDrop=0)` | 脚下方 `+6px`、`+6+0.6格` | 身高 >1.5 格时额外向下探到 `min(2格, 身高×30%)` |
| `wallAhead(dir)` | 身前 4px、`0.5×身高` 处 | 身高 >2 格时补一个 `0.85×身高`（脚踝）探测 |

为什么要有分段容差：

- 小怪（身高 ≤ 48px）只认脚下那 25px 左右——它们**不该**走下台阶，防止掉坑，手感也依赖这个。
- 大怪/BOSS 身高 168px，脚掌就有 136px 宽。程序化地形里 1 格（32px）的台阶边沿到处都是，
  如果只探 25px，它会认为「前方没有地面」而永远不走。放宽到身高 30%（封顶 2 格）后，
  **走下小台阶**算正常走路；只有真正的深坑（下方 2 格内都是空的）才会停。

## 3. 「原地打转」的三条成因

1. **`groundAhead` 太浅 → `vxTarget=0`**
   BOSS 抬脚就是 32px 落差，浅探测判「没地」→ 每帧清零速度 → 零位移。
2. **被挡住时每帧翻面 → 朝向抽搐**
   `roamStep` 原来在受阻时执行 `m.facing = -dir`，下一帧又按目标方向设回 `dir`，
   于是朝向每帧翻转，看起来就是原地打转。
3. **巡逻点在台阶上方 / 坑对面 → 走不到也不换方向**
   只能靠 `patrolIdx++` 循环重试，三个点全不可达时永远杵在原地。

对应修复（`large/common.js` + `base.js`）：

- 大个子放宽 `groundAhead` 落差容差（小怪逐点等价，零回归）；
- 受阻时**不再翻面**，改为「停住 + 0.6s 冷却后换巡逻点」；
- 受阻且**反方向通畅**时，直接朝反方向走（`vxTarget = -dir * speed * mul`），避免装死；
- 高个子补一个脚踝高度的 `wallAhead`，否则会顶着台阶磨。

## 4. 验证

```bash
node scripts/verify-boss-move.mjs
```

断言（全部在真实运行时里跑，不是 stub）：

| 项 | 判据 | 实测 |
|---|---|---|
| 追击位移 | >100px | 300px |
| 距离缩短 | 明显变小 | 404 → 87px |
| 不转圈 | 朝向翻转 ≤2 次/6s | 0 次 |
| 走路动画 | 移动时 `anim=run` | 17/20 采样 |
| 巡逻 | 平地巡逻位移 >80px | 143px |
| 探测语义 | 新逻辑是旧逻辑的超集 | 反例 0 |
| 小怪回归 | `h=32` 时逐点与旧逻辑一致 | 差异 0 |

同一张测试房地图上横扫 ±600px：旧逻辑判「有地」34%，新逻辑 87%——
这就是这个 bug 的影响面（三分之二的位置它都以为前面没路）。

## 5. 冲刺（TUNNEL DASH）：动画 + 真正的位移

数据执政官的突进招式。两件事分开做：**美术管线**出新图集，**行为层**给真实位移。

### 5.1 美术管线

```bash
node scripts/boss-dash-post.mjs --preview   # 12 张 PNG → tb_data_archon_dash.png + manifest
```

- 输入顺序就是播放顺序（默认 `033,022,023,…,032`，可用 `--frames` 改）。
- **dash 用 512×336 的格子**（走路是 272×336）：冲刺姿势大幅前倾 + 提箱拖在身后，
  源图并集 1022×637；按走路的内容高度（269px）对齐需要 ~0.43 缩放 → 内容 415×269，
  272 宽的格子装不下，硬塞只能缩到 0.39，角色会明显变小。
- manifest 里 `kinds.dash` 自带 `frameW/frameH`，loader 把每种图集的格尺寸记进 `art.actionCell`；
  `BaseMonster._syncFrameScale()` 在切换动作时按格的宽高比把 quad 拉宽/还原（走 136×168，冲刺 256×168），
  所以**像素比例与走路完全一致**，不会「冲刺瞬间变小」。
- 编辑器覆盖层只替换它自己有的动作（walk/run），不会动 dash。

### 5.2 行为层（真的有位移）

```js
startDash({ dur, speedMul, damage })   // 招式 exec 里调
_updateDash(dt)                        // state === 'dash' 时每帧跑
```

- 只设 `vxTarget = facing * speed * speedMul`，位移由 `base.update` 的
  `body.vx → moveBody()` 完成 → **撞墙会被拦住、下台阶会自然掉下去**，不是改坐标。
- 起手额外给 `body.vx` 一记冲量（速度的一半）：`vx` 的平滑加速有 ~0.15s 迟滞，
  不给冲量的话前 100ms 几乎不动，手感会「黏」。
- 冲刺期间**不 facePlayer()**：冲刺是承诺动作，每帧转向会变成追着玩家拐弯
  （撞墙测试里直接冲反了）。
- 结束条件：时间到 / `body.wallDir !== 0`（撞墙）/ `!groundAhead(facing)`（前面是坑）。
  撞墙会给尘爆 + 震屏。
- 接触伤害：每段冲刺最多命中一次，用 `game.damageArea()` 打玩家，不新增伤害通道。

招式参数（`theme-boss-kits.js`）：一阶段 `dur 0.5 / speedMul 6.2`，二阶段 `0.58 / 7.0`，
实战位移 ~140~160px（走路 58px/s × 0.5s ≈ 29px，所以是实打实的突进）。

### 5.3 验证

```bash
node scripts/verify-boss-dash.mjs
```

| 项 | 判据 | 实测 |
|---|---|---|
| 资源 | 12 帧 / fps 16 / dash 格 512×336 | 全部命中 |
| 状态机 | wind → dash → recover | ✓ |
| 动画 | 冲刺期间 `animName === 'dash'` | ✓ |
| **位移** | 沿朝向 ≥120px | **142~158px** |
| 速度 | 峰值 >150px/s | **280px/s**（走路 58） |
| 尺寸 | 冲刺时 quad 256×168，收招回 136×168 | ✓ |
| 命中 | 玩家在路径上掉血 | 100 → 78 |
| 撞墙 | 不穿墙、提前收招 | 只推进 5px 就收招 |

截图：`.screenshots/dash/ingame-dash-1..6.png`（推进 95ms → 冻结时钟 → 截图，
因为一张 1400×860 截图要 200ms+，靠 `wait` 抓不准冲刺中的帧）。

## 6. BOSS 追击大脑（boss-ai.js）

主题站点 BOSS（51 只）的追击不走 `BaseMonster` 的默认逻辑，而是交给
`src/game/entities/monsters/large/boss-ai.js` 里的 `BossBrain`：

```
ThemeBoss.updateBehavior
  └─ BossBrain.think(dt) → { dir, speedMul, mode, facing, jump }
       ├─ ThemeBoss 写 vxTarget / facing / 动画
       ├─ jump → this._startHop(kind) 只给 body.vy + body.vx 冲量
       └─ 其余照旧：base.update → moveBody（真物理）
```

**大脑只出意图，不碰坐标。** 所以跨沟会真的掉下去、攀台阶会真的被天花板挡、
撞墙会被 `moveBody` 拦——不会出现「穿墙追击 / 瞬移贴脸」。

| 行为 | 触发条件 | 做法 |
|---|---|---|
| `press` | 距离 > 距离带上限 | 全速朝玩家走 |
| `hold` | 在距离带内 | 停下；远程型贴太近会后退拉距 |
| `leap` | 前方沟宽 ≤ `speed×1.7`（80~150px）、深 ≥1 格 | 起跳 + 2.8× 水平速度 |
| `climb` / `step` | 前方 1~2 格台阶且顶面够宽、上方有空间 | 负 vy 攀跳 + 1.2× 水平冲量 |
| `edge` | 前方是无底深渊，或 >2 格爬不上的高墙 | 停在崖边/墙下，改用远程招 |
| `search` | 视线（`hasLineOfSight`）丢失 >0.7s | 去最后已知位置；到了左右扫视 |
| `reposition` | 推着走 0.5s 位移 <8px | 反向 0.7s + 起跳脱困 |

距离带由招式表推出来（`setBandFromKit`），不是写死：

| 近战招占比 | band（px） | 观感 |
|---|---|---|
| ≥50% | 72 ~ 150 | 贴脸型：走到脸上砸 |
| 25%~50% | 130 ~ 240 | 中距型：打一套就挪 |
| <25% | 220 ~ 380 | 远程型：保持射程，被贴就后撤 |

二阶段（`takeDamage` 掉到半血）会把 band 收窄到 0.82/0.86，压迫感更强。

几何探测（都是纯函数，可单测）：

- `probeStep(m, dir, maxTiles)` —— 前缘 2~26px 逐点找「挡脚」的实心格，
  往上找到顶面，判断高度、顶面宽度（≥ 0.55×身宽）、头顶空间。
- `probeGap(m, dir, maxScan)` —— 逐列量「脚下多深才有地」，返回沟宽与最浅落底深度。
- `findApproach(m, dir, maxScan)` —— 玩家在高台上、正面爬不上去时，沿墙 ±340px
  找抬升 ≤2.6 格、落面够宽、上方有空间的落脚点，绕过去。

### 6.1 验证

```bash
node scripts/verify-boss-ai.mjs     # 决策层（假地图，秒级）
node scripts/verify-boss-chase.mjs  # 集成层（真引擎 / 真地形 / 真物理）
```

决策层断言：距离带（近战/远程）、1 格与 2 格台阶攀跳、5 格墙不硬攀、
窄沟 leap、深渊 edge、失联 search（且只计一次）、钉住 0.5s 判卡住并脱困、
`findApproach` 能找到斜坡并往那个方向走。

集成层在「数据执政官」测试房里把玩家放到坑对面 / 高一格的台面上，
断言 BOSS 真的下坑再爬出来、真的抬脚上台、失联后真的移动。

实测（2026-11-20，数据执政官，测试房里现挖 3 格深 V 形坑 / 现垫 1 格台面）：

| 场景 | 判据 | 实测 |
|---|---|---|
| 平地追击 | 位移 >100px、距离缩短 >60px、翻面 ≤2 | 位移 **222px**，508 → 286px，翻面 0 |
| 过坑（坑宽 8 列 / 深 3 格） | 下坑、回到坑沿高度、距离缩短 | 脚底 1568 → 1614（下坑）→ 1468（出坑），距离 472 → 142px，1 次 leap |
| 上 1 格台阶 | 脚底抬到台面 | 1568 → 1510（继续爬到 1536 台面），距离 282 → 144px |
| 失联搜索 | mode=search 且真的移动 | 1.7s 内移动 89px |
| 控制台 | 无 error | 0 |

调试时可以直接在控制台看 `__rustfall.director.largeList[0].ai.debug`：
`{ mode, dir, speedMul, gap, gapDepth, step, band, stuck }`。

调参入口（`new BossBrain(host, opts)`）：

```js
maxStepTiles   2       // 能攀几格台阶
jumpVy        -620    // 攀跳初速（h≈96px）
leapSpeedMul  2.8      // 跨沟时的水平速度倍率
```

### 6.2 攀跳动作：jump / land 两组帧

「原地起跳」源素材共 41 帧（461×672，已去背景），美术管线：

```bash
node scripts/boss-jump-post.mjs --preview \
  --jump-from 14 --jump-to 28 --jump-fps 24 \
  --land-from 29 --land-to 41 --land-fps 30
```

产出 `tb_data_archon_jump.png`（41 格 272×336，1.4MB）+ manifest 的 `kinds.jump`、
`frames.jump`（15 帧）与 `frames.land`（13 帧）。

**和走路管线的关键差别：跳跃不能用「并集包围盒」。** 走路 10 帧的脚底位置基本一致，
并集对齐能消抖；跳跃是一整段「蹲 → 蹬 → 腾空 → 落地 → 起身」，身体在画布里上下大幅移动，
若整体并集缩放，起跳高度会被烘进图里，再叠加引擎的 `body.y` 就会「跳两次」。所以改为：

- 逐帧取自己的 bbox，**统一缩放**（用站立帧 001~004 / 037~041 的中位身高定标，
  内容高 269px，与 idle/walk 一致，切动作不变大变小）；
- **统一贴底**：每帧 bbox 底边压到格子底部，图里只留姿势，腾空位移交给物理。

帧组切分（0 基）：

| 组 | 帧 | fps | 时长 | 用途 |
|---|---|---|---|---|
| `jump` | 013..027（源 014~028） | 24 | 0.625s | 蹬地伸展 + 腾空收腿，正好等于滞空时间 |
| `land` | 028..040（源 029~041） | 30 | 0.433s | 落地压缩 + 起身 |

行为层（`theme-bosses.js`）：

- `_startHop` 播 `jump`（没有 jump 帧组的 BOSS 仍回退 `run`）。
- **滞空期间锁帧**：chase 分支每帧都会 `playAnim(intent.anim)`，不锁的话起跳那一帧就被
  `run` 抢回去（实测第一次接入时 jump 只闪了 1 帧）。
- **必须先离地再判落地**：起跳瞬间 `vy` 刚给上、身体还在地上，`onGround` 仍是 true，
  `_updateHopLanding` 会立刻判「落地」并切 land。现在用 `_hopAir` + `_hopT`（≥0.3s 兜底）。
- 落地后 `_landT = land帧数/fps`，这段时间 chase 让位给 `land`，播完自动交还；
  `animT` 夹在最后一帧（`applyFrame` 是取模循环，不夹会跳回第 1 帧）。
- jump/land 都是 base 格（272×336），`actionCell` 不新增条目，quad 保持 136×168。

验证：

```bash
node scripts/verify-boss-jump.mjs
```

| 项 | 判据 | 实测 |
|---|---|---|
| 资源 | jump 15 帧 / land 13 帧 / 24·30fps / 图集 41 格 | 全部命中 |
| 位置 | jump 用 base 格，quad 不变 | 272×336，136×168 |
| 起跳 | `animName === 'jump'`，帧号 0→14 推进 | 0,3,6,8,9,10,12,13 |
| 物理 | 脚底抬升 >60px | 91px |
| 落地 | 先播 land，帧号 0..12，`_landT` 计时 | 2,3,6,9,11 |
| 收尾 | land 播完回到 run / idle，`_landT` 归零 | ✓ |
| 控制台 | 无 error | 0 |

截图：`.screenshots/boss-jump/jump-air.png`（0.26s 最高点）、`jump-land.png`（0.68s 落地）。

### 6.3 顺带修掉的两个抖动源

接入跳跃动作后，两个原本被「没有 jump 帧」掩盖的 AI 问题变得很明显，一并修了：

- **原地连跳**：卡死判据是「0.5s 位移 <8px」，但它用的是上一帧的 `wasPushing`
  （阈值 0.15×speed）。带内 ±55px 的回正速度只有 0.28，0.5s 走不到 8px → 每 0.5s
  误判一次卡住 → 起跳脱困 → 每次落地都比之前更贴近玩家，最后一只远程 BOSS 一路跳到
  21px 贴脸。现在只在 `speedMul ≥ 0.9`（全速推进）时才武装卡死检测。
- **带边 1px 抖动**：`adx < band[0]` 后退与「偏离带心 >55px 回正」在边界上每帧互相打架。
  现在只在「进入追击」一侧加 12px 回差（`adx > band[1]+12`），后退阈值必须用准 `band[0]`；
  另外 `speedMul ≤ 0.4` 的微调不再播 `run`（地形挡住时就是原地踏步）。


## 7. 已知取舍

- **大怪（junk_golem 等 4 种）仍走旧的 `roamStep` / 各写各的 chase**：本次只把
  51 只主题 BOSS 接进 `BossBrain`，避免一次性改动 6 份行为代码。
  它们可以走下 1~2 格台阶，但还不能上台阶；掉进只有 1 格斜坡的坑仍然爬不出来。
  要接的话在它们的 `chase` 分支里换成 `new BossBrain(this)` 即可（接口一致）。
- BOSS 的「攀跳」是 **真物理**（负 vy + 水平冲量），不是补间动画，所以：
  顶到天花板会被拦、踩到单向平台不会穿过去、跳跃高度受 gravity 影响。
  数据执政官已接上 jump/land 帧组；其余 50 只没有跳跃素材的 BOSS 仍沿用 `run`，
  落地也不会播 land（`_updateHopLanding` 找不到 `frames.land` 就跳过）。
- 距离带只用招式表的静态范围，不看玩家是否在弹道死角；斜上方/正上方的死角判断
  仍由各招式自己的 `range` 与命中判定负责。
- 反向行走只是兜底，不改变「巡逻点由 director 生成」的架构（`makePatrol`：以刷新点为中心 ±220px）。
