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

## 6. 已知取舍

- 大怪可以走下 1~2 格台阶，但**没有上台阶能力**（`moveBody` 无 step-up）。
  掉进不可攀爬的坑里会留在原地——这是既有设计，不在本次修复范围内。
  如果以后要改，建议在 `updateBehavior` 里给大怪加「起跳/攀爬」或让关卡生成器避免刷在坑里。
- 反向行走只是兜底，不改变「巡逻点由 director 生成」的架构（`makePatrol`：以刷新点为中心 ±220px）。
