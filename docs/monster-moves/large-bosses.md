# 大型 BOSS 招式图鉴（7 只）

> 数据来自 `src/game/entities/monsters/large/*.js`，数值与判定均取自代码。
> 相关：[总览](./README.md)｜[主题 BOSS](./theme-bosses.md)｜[小怪](./minions.md)｜[房怪附录](./room-minions.md)

## 一、大型敌人通用规则

以下全部来自 `large/common.js` 与 `monsters/base.js`，未在代码里出现的规则不写。

### 1.1 初始化 `initLarge(m, opts)`

| 字段 | 取值 | 说明 |
|---|---|---|
| `isLarge` / `elite` | `true` | 标记为大型精英 |
| `introT` / `introDur` | `opts.intro ?? 1.25` | 入场演出时长；拟态兽传 `0`，直接进 `roam` |
| 初始 `state` | `introT > 0 ? 'intro' : 'roam'` | 入场期间 `playIntro` 每帧置 `vxTarget = 0`，只播 `idle`、不接敌 |
| `activateRange` | `opts.activateRange ?? 800` | 激活半径 |
| `deactivateRange` | `opts.deactivateRange ?? 1200` | 脱战半径（仅天空守望者改成 1400） |
| `patrol` / `patrolIdx` / `patrolWait` | `[] / 0 / 0` | 巡逻点由 director 通过 `m.setPatrol(points)` 下发 |
| `phase` | `1` | 通用占位字段，这 7 只都没有用 `phase` 做状态机 |
| `player` | 重定义 getter | 同时认 `game.player` 与 `game.robot` |
| `py` | 重定义 getter | `body.y + body.h − min(h × 0.34, 62)`，把战斗中心下移，玩家站地面也能挥到 |
| 名字板 | `attachNameplate(m)` | 头顶挂名字，血条上移 |

### 1.2 激活 / 脱战 `updateActivation`

- 玩家存活且 `distToPlayer() < activateRange` → `activated = true`，`state = 'alert'`，播放 `growl`（vol 0.6、rate 0.72）并 `shake(0.2)`。
- 已激活且 `distToPlayer() > deactivateRange` → `activated = false`，`state = 'roam'`。
- 所以「进入 800 打你、跑出 1200 才脱战」是默认节奏；天空守望者是 900 / 1400。

### 1.3 巡游 `roamStep(m, dt, { speedMul })`

- 默认 `speedMul = 0.5`（各怪实际传入 0.45 ~ 0.55）。
- 走向当前巡逻点；水平差 `< 26` 判到达 → `idle`，等 `patrolWait`（切换后重置为 `1.2 ~ 3.0s`）。
- 前方有墙或没地面 → 放弃该点、`patrolIdx + 1`、`patrolWait = 0.8`、`facing` 反转。
- 没有巡逻点时原地 `idle`，不主动追人。

### 1.4 入场 `playIntro`

- 每帧 `introT -= dt`，`vxTarget = 0`，播 `idle`，随机喷尘。
- 结束时 `state = 'roam'`、`shake(0.4)`、`growl`（vol 0.7、rate 0.62）、`puff(16)`。
- `introT <= 0` 时直接返回 `false`，不占用行为帧。除拟态兽（`intro = 0`）外，入场期间不接敌。

### 1.5 AoE `aoe(m, x, y, radius, dmg)`

- 优先走引擎 `game.damageArea(x, y, radius, dmg)`。
- 没有该函数时回退：玩家中心到 `(x, y)` 的直线距离 `<= radius` 且 `invuln <= 0` 才 `takeDamage(dmg, x)`。
- 判定一律是**圆形**，不区分高度层。

### 1.6 激光 `beamHitsPlayer(m, x0, y0, x1, y1, halfWidth)`

- 玩家中心到线段的最近距离 `<= halfWidth` 即命中；只用于天空守望者。

### 1.7 死亡 `largeDeathFx`

- 默认：`puff(30)` + `spark(22)` + `shake(0.75)` + `thunder`（vol 0.65、rate 0.8）。
- 可选 `aoeRadius`（默认 `aoeDamage = 0`）与 `extraLoot`（走 `dropLoot`，带随机初速）。
- 随后 `super.die()`：铺 `def.loot` 掉落表、`onMonsterKilled`、播 `dead`；`deadT > 1.6` 后 `group.visible = false`。

### 1.8 受伤与打断（`BaseMonster`）

- `takeDamage(n, fromX)`：`hp -= n`、`hurtT = 0.18`、`state = 'hurt'`、`stateT = 0`；`fromX != null` 时附带击退 `vx ±120 / vy −140`。
- **所有大型 BOSS 都没有霸体**：一次命中就会把状态机重置为 `hurt`，等于打断前摇（各怪对 `hurt` 的处理不同，见各节）。
- `attackCd` 初始 `0.8 + rand × 0.8`；这 7 只都不走 `tryAttack()`，全部自写状态机。
- `def.aggro` / `def.attackRange` 对这 7 只**只做展示**，实际出招距离是代码里的硬编码阈值。

### 1.9 各怪状态机差异速查

| BOSS | 是否有 `hurtT` 守卫 | 被打断后去哪 | 冷却写入时机 | 出招优先级 |
|---|---|---|---|---|
| 裂爪暴君 | 无（只挡 `stunT`） | `hurt` → 兜底 `chase` | 抡击在**收招**写、跃扑在**落地**写 | 抡击 → 跃扑 |
| 赛博精神病 | 无 | `hurt` → `chase` | 收招后写 | 冲刺 → 点射 |
| 超能暴走体 | 无 | `hurt` → `chase` | 收招后写 | 碾压 → 弹幕 |
| 废弃垃圾组合体 | 有（但会把 `hurt` 转回 `chase`） | `chase`，趴下状态会被钉回 | **起手**即写 | 拾回 → 抡击 → 抛掷 |
| 天穹守望者 | 有（`aim` / `fire` / `overheat` 除外） | `hover` | 开火时写 `laserCd` | 过热 → 俯冲 → 召唤 → 主炮 |
| 拟态兽 | 有（`lunge` / `mimic` 除外） | `chase` | 扑咬在收招写、拟态在起手写 | 拟态 → 扑咬 |
| 群聚核心 | 仅暴露期有 | `chase` | 脉冲起手写 | 脉冲（产卵独立，不受状态机限制） |

## 二、一览表

| BOSS | id | 家族 | HP | 速度 | 伤害 | 体型 | 攻击距离 | XP | 阶段阈值 | 召唤 |
|---|---|---|---|---|---|---|---|---|---|---|
| 裂爪暴君 | `claw_tyrant` | mutant | 780 | 64 | 32 | 148×188 | 170（实际 180 / 270） | 220 | HP ≤ 50% 暴怒 | 无 |
| 赛博精神病·暴走体 | `cyberpsycho_boss` | rogue | 640 | 96 | 20 | 74×122 | 540 | 200 | HP ≤ 40% 超频 | 无 |
| 超能暴走体 | `esper_berserk` | anomaly | 600 | 76 | 24 | 98×150 | 560 | 190 | HP ≤ 45% 二阶段 | 无 |
| 废弃垃圾组合体 | `junk_golem` | rogue | 520 | 54 | 30 | 140×170 | 150 | 140 | HP ≤ 35% 暴怒 + 断腿阶段 | 无（投掷可回收部件） |
| 天穹守望者 | `sky_warden` | rogue | 380 | 96 | 22 | 180×110 | 560 | 160 | HP ≤ 50% 过载 | `drone` ×2 |
| 拟态兽 | `mimic_beast` | beast | 260 | 148 | 30 | 120×90 | 118 | 110 | HP ≤ 50% / ≤ 20% 提速 | 无 |
| 群聚核心 | `swarm_core` | beast | 240 | 38 | 18 | 150×130 | 150 | 140 | 无 HP 阶段（清巢暴露） | `crawler` ×8 |

## 三、逐只详解

### 3.1 裂爪暴君 CLAW TYRANT · `claw_tyrant`

**面板**：`family: mutant` ｜ HP 780 ｜ 速度 64 ｜ 伤害 32 ｜ 体型 148×188 ｜ `aggro` 660 ｜ `attackRange` 170 ｜ `attackType: melee` ｜ `attackCooldown` 2.3 ｜ XP 220 ｜ 重力 2000 ｜ 入场 1.4s ｜ 激活 760 / 脱战 1200 ｜ `artId: claw_tyrant` ｜ 音效 `thunder` ｜ 出没 `factory` / `dump` ｜ 掉落：`composite_armor` 0.8、`hydraulic_rod` 0.7（1~2）、`servo_motor` 0.6、`rare_earth` 0.5、`reactor_core` 0.18。

**招式**

| 招式 | 触发条件 | 前摇 | 冷却 | 判定与伤害 | 后续/硬直 |
|---|---|---|---|---|---|
| 抡击 SLAM | `hd < 180` 且 `slamCd <= 0` | 0.55s（暴怒 0.42s），前摇环 opacity 0.35±0.3 闪烁 | 出招后置 2.4s（暴怒 1.5s），从收招瞬间开始算 | 落点 `px + facing × 82`，y = `feet − 10`；半径 126（暴怒 150）；伤害 32（暴怒 40） | 收招 0.38s → `chase` |
| 跃扑 LEAP | `hd > 270` 且 `leapCd <= 0` 且 `body.onGround` | 0.42s，期间 `facePlayer()` | 落地后置 3.4s（暴怒 2.2s） | 起跳 `vy = −470`、`vx = facing × 270`（暴怒 320）；落地（`onGround && stateT > 0.18`）在 `(px, feet − 8)` 造成 r = 118、伤害 25.6（`32 × 0.8`，暴怒不涨） | 直接进 `slam` 状态 0.38s 作为硬直，同时会把 `slamCd` 重置为 2.4 / 1.5 |
| 追击 CHASE | 兜底状态 | — | — | 无判定；`hd > 96` 时以 `speed` 前进，撞墙/悬崖停下 | 进入 180 内可抡击，> 270 可跃扑 |

**阶段与破法**

- **HP ≤ 50% 暴怒**（`takeDamage` 里判定，仅触发一次）：`speed = 64 × 1.18 = 75.5`；抡击前摇 0.55 → 0.42、半径 126 → 150、伤害 32 → 40、冷却 2.4 → 1.5；跃扑冷却 3.4 → 2.2、起跳速度 270 → 320。跃扑落地的 25.6 伤害与 118 半径**不变**。
- 弱点/安全位：抡击落点前偏 82px，所以站在**背后**只有 126−82 = 44px 的判定余量；站远于 150 即可完全避开。
- 可打断点：任何命中都会把 `hurt` 打进状态机，`slamWind` / `leapWind` 会被打断（`slamCd` 尚未置数，可立即重来）；`leap` 空中被打断会掉回地面。
- 180 ≤ `hd` ≤ 270 是**空档带**：两招都不满足条件，它只会走过来。

**时序（抡击一轮）**

1. `chase` 中判定 `hd < 180`、`slamCd <= 0` → `slamWind`。
2. 0.55s（暴怒 0.42s）内原地不动，前摇环闪烁。
3. 到点的那一帧一次性结算圆形 AoE（只有一个判定帧，没有持续伤害）。
4. 进 `slam` 播 0.38s 攻击帧，结束时写 `slamCd = 2.4 / 1.5`。
5. 全周期（暴怒）约 0.42 + 0.38 + 1.5 = 2.3s，即最快每 2.3s 抡一次。

**源码要点 / bug**

- 跃扑落地后进入的 `slam` 状态**不会调用 `_slam()`**，只是 0.38s 的收招动画，却顺带重置了 `slamCd`——等于落地白送一次抡击冷却。
- 所有距离判定（`_hd`）只比水平 X，没有高度差或视线检查：玩家站在 180px 高的平台上也会被地面抡击命中，跃扑也会朝墙起跳。
- `leap` 撞墙后仍要靠 `onGround` 才收招，短时间内会贴着墙反复起跳。

### 3.2 赛博精神病·暴走体 CYBERPSYCHO OVERDRIVE · `cyberpsycho_boss`

**面板**：`family: rogue` ｜ HP 640 ｜ 速度 96 ｜ 伤害 20 ｜ 体型 74×122 ｜ `aggro` 720 ｜ `attackRange` 540 ｜ `attackType: ranged` ｜ `attackCooldown` 1.8 ｜ XP 200 ｜ 重力 2000 ｜ 入场 1.4s ｜ 激活 800 / 脱战 1200 ｜ 音效 `alarm` ｜ 出没 `city` / `factory` ｜ 掉落：`optical_module` 0.8、`processor` 0.7、`stim_patch` 0.6（2~3）、`quantum_chip` 0.2、`arc_emitter` 0.25。

**招式**

| 招式 | 触发条件 | 前摇 | 冷却 | 判定与伤害 | 后续/硬直 |
|---|---|---|---|---|---|
| 三连点射 BURST | `burstCd <= 0` 且 `hd < 540`（且不满足冲刺条件） | 0.30s（超频 0.20s），期间 `facePlayer()` | 0.28s 收招后置 1.9s（超频 1.2s） | 枪口 `px + facing × 22`，`y = feet − h × 0.62`；3 发，目标点 `(p.centerX + k×26, p.centerY + k×10)`，`k ∈ {−1, 0, 1}`；弹速 560、重力 0、半径 5、伤害 20、寿命 1.5，type `bullet` | `burst` 0.28s → `chase` |
| 冲刺 DASH | `hd < 170` 且 `dashCd <= 0`（优先于点射） | 0.26s，`facePlayer()` | 0.30s 后置 2.4s（超频 1.4s） | **无伤害判定**；`body.vx = facing × speed × 3.2`（96 → 307，超频 120 → 384），持续 0.30s，`vxTarget` 同步维持 | `dash` 结束 → `chase` |
| 中距游走 STRAFE | 兜底状态 | — | `strafeT` 每 1.2 ~ 2.2s 换向一次 | `hd < 150` → 后退 `speed × 0.9`；`hd > 320` → 前进 `speed`；中间 → 横移 `speed × 0.5` | 无 |

**阶段与破法**

- **HP ≤ 40% 超频**（仅一次）：`speed = 96 × 1.25 = 120`，点射前摇 0.30 → 0.20、冷却 1.9 → 1.2，冲刺冷却 2.4 → 1.4。冲刺速度随 `speed` 一起变大（384）。
- 破法：贴脸（< 150）会逼它后退，但 < 170 又触发冲刺——**保持 170 ~ 320 的中距离**只会吃到点射，而点射是三发扇形、落点带 26px 横向偏移，侧向走位最有效。
- 可打断点：`burstWind` / `dashWind` 被打中即转 `hurt`，`burstCd` / `dashCd` 尚未置数，可被连续压制到无法出招。
- 冲刺是纯位移，不会撞伤玩家；被冲到身后才是真正的危险位（`facePlayer` 会立刻转身点射）。

**时序（点射 / 冲刺）**

1. `chase` 每帧先查冲刺：`hd < 170 && dashCd <= 0` → `dashWind`（优先于点射）。
2. `dashWind` 0.26s → `dash` 0.30s，`vx = 307`（超频 384），结束写 `dashCd`。
3. 否则查点射：`burstCd <= 0 && hd < 540` → `burstWind` 0.30s（超频 0.20s）。
4. 到点同一帧生成 3 发子弹（无间隔、无连发延迟），再进 `burst` 0.28s，结束写 `burstCd`。
5. 两种弹道都是 `gravity = 0` 直线，速度 560，寿命 1.5s（射程约 840px）。

**源码要点 / bug**

- `_burst` 的三发都只按**施放瞬间**的玩家位置取目标，没有追踪；命中后无锁定，玩家移动即可躲。
- 投射物创建失败时只对 `k === 0` 那一发回退成 `hitPlayer(20)`，两侧两发直接消失；即引擎无 `spawnProjectile` 时实际只有 20 伤害。
- 三发全中理论总伤害 60（超频不变），但纵向偏移 `k × 10` 让上下两发经常擦身而过。
- `dash` 期间没有 `hurt` 保护，也没有无敌帧，属纯送头位移。

### 3.3 超能暴走体 ESPER BERSERK · `esper_berserk`

**面板**：`family: anomaly` ｜ HP 600 ｜ 速度 76 ｜ 伤害 24 ｜ 体型 98×150 ｜ `aggro` 700 ｜ `attackRange` 560 ｜ `attackType: ranged` ｜ `attackCooldown` 2.0 ｜ XP 190 ｜ 重力 2000 ｜ 入场 1.5s ｜ 激活 820 / 脱战 1200 ｜ 音效 `thunder` ｜ 出没 `dump` / `factory` / `city` ｜ 掉落：`reactor_core` 0.5、`fusion_lattice` 0.35、`quantum_chip` 0.5、`rare_earth` 0.7（2~3）、`arc_emitter` 0.3。

**招式**

| 招式 | 触发条件 | 前摇 | 冷却 | 判定与伤害 | 后续/硬直 |
|---|---|---|---|---|---|
| 念力弹幕 PSI BARRAGE | `psiCd <= 0` 且 `hd < 620`（抡压优先） | 0.46s（二阶段 0.34s），`facePlayer()` | 0.40s 收招后置 2.2s（二阶段 1.4s） | 枪口 `(px, feet − h × 0.7)`；5 发，`k = 0..4`，目标 `(p.centerX + (k−2)×30, p.centerY)`；初速 420 沿目标方向，另加 `vx += sin((k−2)×0.22) × 90`、`vy −= 60`；重力 180、半径 6、伤害 14.4（`24 × 0.6`）、寿命 2.2，type `psi` | `psi` 0.4s → `chase`；**二阶段在此时瞬移** |
| 念力碾压 PSI CRUSH | `hd < 200` 且 `crushCd <= 0` | 0.55s，前摇环 0.4±0.3 闪烁 | 结算时置 3.6s（二阶段 2.6s） | 落点 = **前摇结束那一帧**的玩家位置 `(p.centerX, p.centerY + 20)`，半径 96，伤害 24（不随阶段变化），圆形判定 | 立即回 `chase`，无额外硬直 |
| 逼近 CHASE | 兜底状态 | — | — | 无判定；`hd > 220` 时以 `speed` 前进，撞墙/悬崖停 | 200 内可碾压、620 内可弹幕 |

**阶段与破法**

- **HP ≤ 45% 二阶段**（仅一次）：`speed = 76 × 1.2 = 91.2`；弹幕前摇 0.46 → 0.34、冷却 2.2 → 1.4；碾压冷却 3.6 → 2.6。弹幕伤害、碾压半径/伤害均不变。
- 瞬移行为：二阶段每次 `psi` 收招时，若 `px > 房间宽/2` 传送到 `x = 60`，否则传送到 `x = 房间宽 − 体型宽 − 60`（贴两侧墙）。**没有落点合法性检查**，可能直接落进墙里。
- 破法：碾压在**结算帧**才取玩家坐标并立刻判定，等于贴脸必中——只能在结算瞬间靠 `invuln`（翻滚/受击无敌）扛掉，或靠地形把自己挤出 96 半径；弹幕是 5 发扇形 + 上抛，贴地/下蹲位反而容易吃满。
- 可打断点：`psiWind` / `crushWind` 被命中即中断；但 `crushCd` / `psiCd` **都还没写**（写在收招里），所以打断后下一帧就能再次起手，等于零惩罚。

**时序（弹幕 / 瞬移）**

1. `chase` 中 `hd < 200 && crushCd <= 0` → 先抢碾压；否则 `psiCd <= 0 && hd < 620` → 弹幕。
2. `psiWind` 0.46s（二阶段 0.34s）→ 同一帧生成 5 发，`psi` 0.4s。
3. `psi` 收招那一帧写 `psiCd`；**仅二阶段**再执行一次瞬移（贴对侧墙 60px）。
4. 瞬移后 `state = 'chase'`，`stateT = 0`，下一帧立刻以 `speed × 1.2` 逼近。
5. 弹幕弹道带 `gravity = 180`，飞行中会下坠，实际落点比瞄准点更低；寿命 2.2s。

**源码要点 / bug**

- `spread` 变量算了 `(k−2)×0.22` 弧度，但只用了 `sin(spread) × 90` 加在水平速度上，纵向并没有使用——所谓"扇散"实际是横向速度微扰，5 发仍各自瞄准 5 个横向目标点。
- 弹幕创建失败时回退为 `hitPlayer(12)` 并 `break`，即无 `spawnProjectile` 时整套弹幕只有 12 点伤害。
- 瞬移只改 `body.x`，不改 `body.y`、不查 `solidAt`，可能卡进地形或悬空。
- 碾压无视高度：玩家在 96px 半径内（圆形，含纵向 96）即在判定内，没有视线检查。

### 3.4 废弃垃圾组合体 JUNK GOLEM · `junk_golem`

**面板**：`family: rogue` ｜ HP 520 ｜ 速度 54 ｜ 伤害 30 ｜ 体型 140×170 ｜ `aggro` 560 ｜ `attackRange` 150 ｜ `attackType: melee` ｜ `attackCooldown` 2.2 ｜ XP 140 ｜ 重力 2000 ｜ 入场 1.3s ｜ 激活 720 / 脱战 1200 ｜ 音效 `thunder` ｜ 出没 `dump` / `factory` / `city` ｜ 掉落：`scrap_plate` 1.0（3~5）、`aluminum_sheet` 0.9（1~2）、`copper_wire` 0.8（2~3）、`bearing` 0.6、`servo_motor` 0.55、`hydraulic_rod` 0.45、`rare_earth` 0.3、`repair_kit` 0.25。

**结构常量**：每条腿 `LEG_HP = 62`；`SLAM_WIND 0.55`、`SLAM_RADIUS 118`、`SLAM_DAMAGE 26`；`THROW_WIND 0.55`、`THROW_RANGE 560`；`DOWN_DURATION 5.0`、`DOWN_MUL 2.2`、`BODY_LEG_SHARE 0.35`；出生带 3 个可抛部件。

**招式**

| 招式 | 触发条件 | 前摇 | 冷却 | 判定与伤害 | 后续/硬直 |
|---|---|---|---|---|---|
| 震地抡击 SLAM | `hd < 170`（暴怒 190）且 `slamCd <= 0` 且纵向差 `abs(p.centerY − feet) < 140` | 0.55s（金环提示 0.55） | **起手即置** 2.8s（暴怒 2.1s） | 以 `(px, feet − 12)` 为圆心，半径 118（暴怒 142），伤害 26（暴怒 32） | `slam` 收招 0.35s → `chase` |
| 部件抛掷 THROW | `partsLeft > 0`、`throwCd <= 0`、`200 < hd < 560`、有视线、`brokenCount < 2` | 0.55s（蓝环提示 0.4） | **起手即置** 3.4s（暴怒 2.2s） | 从 `(px, feet − h×0.66)` 抛向玩家当前中心；`g = 1100`；飞行 `T = clamp(dist / 420, 0.35, 0.95)`；`vx = dx / T`、`vy = (dy − 0.5·g·T²) / T`；弹半径 15、伤害 `30 × 0.75 = 22.5`（暴怒 `× 0.9 = 27`）、寿命 3.2；落点生成可回收部件 | 立即回 `chase`；落地 `onLand` 生成地面部件 |
| 拾回 PICKUP | `chase` 中检测到地面部件且 `brokenCount < 2`、玩家离部件 > 130、部件距本体 < 460 | — | — | 以 `speed × 0.85` 走过去；水平差 `abs(g.x − px) < 48` 即拾回 | 拾回：恢复 1 个隐藏部件、**回血 +22**（不超过上限） |

**腿部系统（数值来源 `takeDamage` / `_breakLeg` / `_getUp`）**

| 事件 | 判定 | 结果 |
|---|---|---|
| 打腿 | `fromX` 落在某条未断腿中心 `px ± w × 0.34`（±47.6）的 **±34** 范围内 | 该腿扣**全额** `n`；本体只吃 `n × 0.35`；两腿中心向外 13.6 ~ 81.6px 是有效打腿区，正中央 13.6px 内算打身体 |
| 腿断（hp ≤ 0） | 上一条命中 | 进入 `downed`：`downedDur = 5.0`（双断则 `Infinity`）；`throwCd` 至少 1.5；甩落 1 个部件到 `px ± 70` |
| 趴下期间 | `state = 'downed'` | 受到 **2.2 倍**伤害（唯一乘区），核心红光亮起，`facePlayer()` 但不移动 |
| 起身 `_getUp` | 单腿断满 5.0s | 断腿恢复为 `maxHp × 0.5 = 31` HP 且**重新接上**；`brokenCount` 归零；速度按 `brokenCount > 0 ? 0.65 : 1` 重算 |
| 双断 | 两条腿 hp 都归零 | `downedDur = Infinity`，永久趴地直到被打死；此时 `brokenCount = 2` |
| 残血暴怒 | HP ≤ 35% | `speed = 54 × 1.12 = 60.5`，抡击半径 118 → 142、伤害 26 → 32、冷却 2.8 → 2.1；抛掷冷却 3.4 → 2.2、伤害 22.5 → 27 |

**阶段与破法**

- 有效破法：贴到腿边（±13.6 ~ 81.6px）打腿。腿 62 HP，打满即倒 5 秒，5 秒内以 2.2 倍打本体，是主要输出窗口。
- 打腿的代价：本体只掉 35%，所以「只打腿」会拖长总时长；腿断后溢出伤害**不会**转到本体（`leg.hp -= n` 超杀丢弃）。
- 断腿后它会主动去捡自己甩落的部件，捡到回 22 血并补一个抛掷弹——必须在它捡之前把地上的部件踩掉（部件 26s 后自行消失）。
- 双断是最优解：永久趴地 + 2.2 倍易伤，直接处决；但两条腿各 62 HP，需要 124 点"腿伤害"。
- 可打断点：命中会把它打进 `hurt`（切换回 `chase`），但 `slamCd` / `throwCd` 在**起手时**就已写入，打断等于白嫖它的冷却。

**时序（腿 / 趴下 / 起身）**

1. `chase` 优先检查拾回：附近有地面部件且玩家离得远 → `pickup`，走到 48px 内自动拾回（+22 HP）。
2. 否则 `hd < 170`（暴怒 190）且纵向差 < 140 → `slamWind` 0.55s（起手即写 `slamCd`）→ `_slam` 结算 → `slam` 0.35s。
3. 否则 `200 < hd < 560`、有视线、`partsLeft > 0`、`brokenCount < 2` → `throwWind` 0.55s（起手写 `throwCd`）→ `_throwPart` 立刻回 `chase`。
4. 投掷物按 `T = clamp(dist / 420, 0.35, 0.95)` 秒后落地，落点 `_spawnGroundPart` 生成部件，26s 后消失。
5. 打腿 62 点 → `_breakLeg` → `downed`：5.0s 内静止、受 2.2 倍伤害、甩落 1 个部件。
6. 5.0s 到 → `_getUp`：该腿修回 31 HP 并重新接上，`brokenCount = 0`，回 `alert` 0.45s → `chase`。
7. 两条腿都断 → `downedDur = Infinity`，永久趴地直到 HP 归零。

**源码要点 / bug**

- 文件头注释写「起身后瘸腿：速度 ×0.65、不能再抛掷」，**代码并非如此**：`_getUp` 会把断腿修回 31 HP 并 `broken = false`，`brokenCount` 变 0，于是 `speed` 恢复 `baseSpeed × 1`；抛掷只被 `brokenCount < 2` 限制，单断起身后照常抛。`×0.65` 分支在实践中不可达。
- `'downedGetUp'` 状态分支存在但**无人写入**，是死代码。
- 腿是可再生的：断 → 修 31 → 再断 → 再修，每次循环只消耗玩家 31 点腿伤害却各掉一个部件（并回 22 血），长期战会拖。
- 引擎无 `spawnProjectile` 时走本地弹道：重力同为 1100，但伤害固定 `30 × 0.75 = 22.5`，**不吃暴怒加成**，命中半径也从 15 变成 30。
- 死亡特效刻意不带 `aoeRadius`（注释写明避免"打死反被炸"）。

### 3.5 天穹守望者 SKY WARDEN · `sky_warden`

**面板**：`family: rogue` ｜ HP 380 ｜ 速度 96 ｜ 伤害 22 ｜ 体型 180×110 ｜ `aggro` 700 ｜ `attackRange` 560 ｜ `attackType: laser` ｜ `attackCooldown` 2.6 ｜ XP 160 ｜ 重力 0 ｜ `flying: true`、`hover: 210` ｜ 入场 1.6s ｜ 激活 900 / **脱战 1400** ｜ 音效 `thunder` ｜ 出没 `city` / `factory` ｜ 掉落：`board_cpu` 1.0（1~2）、`sensor_unit` 0.9、`gyro` 0.8、`optical_module` 0.7、`battery_cell` 0.8（1~2）、`aluminum_sheet` 0.75（2~3）、`rare_earth` 0.5、`reactor_core` 0.2。

**常量**：`AIM_TRACK 0.55`、`AIM_TOTAL 0.8`、`FIRE_T 0.32`、`RECOVER_T 1.25`、`SUMMON_CD 8.5`、`SUMMON_MAX 2`、`DIP_CD 7`、`DIP_ALT 58`、`HIGH_ALT 210`、`OVERHEAT_CD 7`、`OVERHEAT_T 1.9`、`REBOOT_T 1.2`、`OVERHEAT_DMG_MUL 1.6`、`CRASH_T 1.4`。初始：`laserCd 1.6`、`summonCd 5.1`（8.5×0.6）、`dipCd 7`、`overheatCd 7`。

**招式**

| 招式 | 触发条件 | 前摇 | 冷却 | 判定与伤害 | 后续/硬直 |
|---|---|---|---|---|---|
| 主炮·瞄准 AIM | `hover` 中 `laserCd <= 0`，且不满足过热/俯冲/召唤 | **0.80s**：0 ~ 0.55s 预警线跟随玩家（粗细 2、opacity 0.3±0.18、0.16s 一次滴滴声）；**0.55s 锁定**（记录 `lockX/lockY`，线变粗 4、opacity 0.6±0.18） | 见 FIRE | 无伤害 | 0.8s 到点转 `fire` |
| 主炮·开火 FIRE | `aim` 到时 | — | 开火后置 `1.75s`（基础 `RECOVER_T + 0.5`；过载 `×0.75 = 1.31s`） | 枪口 `(px + facing × 62, body.y + body.h × 0.62)` → 锁定点；**瞬时命中线**，`beamHitsPlayer` 半径 **19**；伤害 **22**；光束视觉厚 5、持续 0.32s | 转 `recover` 1.25s → `hover` |
| 俯冲 DIP | `dipCd <= 0`（优先级高于召唤/主炮） | `dipDown`：降到 `alt ≈ 58`（mul 1.4）；`stateT > 0.5` 且 `feet > 地面 − 58 − 14` 才转 `dipFire` | 起手置 `7 + rand × 2`（7 ~ 9s） | `dipFire`：0.55s 预警线（opacity 0.45±0.2，线宽 3）→ `_fireBeam` 同款 22 伤害 / 19 半径；**不锁定**，光束始终指向开火瞬间的玩家 | `dipUp` 爬升 0.9s → `hover`，并保证 `laserCd ≥ 0.8`；`dipDown` 硬超时 2.2s、`dipFire` 硬超时 1.6s |
| 召唤 SUMMON | `summonCd <= 0`（优先级高于主炮） | 0.9s 舱门闪烁（`hoverAt(高 190, mul 0.5)`） | 8.5s | 周围无人机存活为 0 → 一次 2 架；否则 1 架；总数上限 2；从 `px ± 80`、`body 底部 + 26` 处经 `director.spawn('drone')` 生成 | 回 `hover` |
| 过热 OVERHEAT | 仅 `overload`（HP ≤ 50%）后 `overheatCd <= 0` | 状态开始时即 `overheated = true`；以 mul 1.8 压到 `alt ≈ 12`，机身抖动 ±0.14 rad | 进入即重置 7s | 伤害承受 `× 1.6`（`takeDamage` 中判定）；自身无伤害技能 | 1.9s 后 `reboot` 1.2s → `hover`，期间 `overheated` 仍为真，结束时清掉并保证 `laserCd ≥ 0.6` |
| 死亡坠落 CRASH | HP 归零触发 `die()` → `_startCrash()` | 立即生效 | — | `body.y += (300 + crashT × 700) × dt`，螺旋 `spin += dt × 7`；`crashT ≥ 1.4` 或触地即爆 | 爆炸：`aoe` r = 140、伤害 20（**会打到玩家**）、`shake 0.85`、额外掉 `aluminum_sheet × 2`，然后才 `super.die()` |

**阶段与破法**

- **HP ≤ 50% 过载**：`overload = true`、`overheatCd = 3`（3 秒后第一次过热）；此后悬停/瞄准的飞行速度乘 `1.5`，主炮冷却 `× 0.75`。注意 `this.speed` 仍是 96——加速只体现在 `_hoverAt(..., mul)` 上。
- 近战窗口：`dip` 阶段低空 ~58px，从降到低空到爬升结束约 2 ~ 3s；`dipFire` 的 0.55s 预警是唯一"站桩"时间。
- 输出窗口：过热坠地 1.9s + 重启 1.2s，全程 `× 1.6` 受伤，是主要爆发期；每 7s 一次。
- 破法：主炮在 0.55s **锁定之后**才定死弹道，所以要在锁定后再移动才能躲；前 0.55s 内移动只会让预警线跟着你。俯冲光束不锁定，开火瞬间平移即可。
- 可打断点：`aim` 期间被命中会转 `hurt`（switch 无 `hurt` 分支 → `default` → `hover`），锁定作废、`laserCd` 不返还，等于白刷一次冷却。

**时序（主炮 aim → fire → recover）**

1. `aim` 第 0 ~ 0.55s：预警线跟着玩家走（虚线、细），每 0.16s 一声滴响，音调随 `stateT` 升高。
2. `aim` 0.55s：`locked = true`，`lockX/lockY` 冻结，线变粗、变亮，此后玩家再移动就会脱离弹道。
3. `aim` 0.80s：`_fireBeam` 瞬时结算一次 `beamHitsPlayer`（半径 19），同一帧进 `fire`。
4. `fire` 0.32s：光束视觉按 1 → 0 线性淡出，**不再判定**。
5. 开火瞬间写 `laserCd = 1.75s`（过载 1.31s），`recover` 1.25s 结束后回 `hover`，等 `laserCd` 归零再瞄准。

**时序（俯冲）**

1. `dipDown`：以 mul 1.4 压向 58px 低空；`stateT > 0.5` 且已接近低空才转 `dipFire`（硬超时 2.2s 直接爬升）。
2. `dipFire`：0.55s 预警线（每帧重取玩家位置）→ 开火；硬超时 1.6s。
3. `dipUp` 0.9s 爬回 210px，并保证 `laserCd ≥ 0.8`。

**源码要点 / bug**

- 判定宽度 19 与视觉光束厚度 5 不一致，实际命中范围约为看到的 3.8 倍。
- 注释说"移速 ×1.5"，代码里没有改 `speed`，只把 `_hoverAt` 的移动倍率设成 1.5；`_fly` 的步长仍按 `speed × mul` 走。
- 主炮周期：0.8 + 0.32 后写 `laserCd`，最短约 2.87s 一轮（过载 2.43s）；`recover` 的 1.25s 与冷却并行，所以"冷却"实际从开火瞬间计。
- 死亡坠落期间 `alive` 仍为 `true`（`super.die()` 要等爆炸后才调用），此时再被命中会进 `die()` → 因 `crashing` 直接 return，等于坠落期无敌；爆炸的 20 点 AoE 却能反杀玩家。
- `summonCd` 初始 5.1s，所以开场第一波无人机比"每 8.5s"要早得多。
- `dipFire` 每帧刷新 `lockX/lockY` 但从不置 `locked = true`，`_fireBeam` 走的是"取玩家当前坐标"分支——俯冲炮没有锁定语义。

### 3.6 拟态兽 MIMIC BEAST · `mimic_beast`

**面板**：`family: beast` ｜ HP 260 ｜ 速度 148 ｜ 伤害 30 ｜ 体型 120×90 ｜ `aggro` 420 ｜ `attackRange` 118 ｜ `attackType: lunge` ｜ `attackCooldown` 2.4 ｜ XP 110 ｜ 重力 2000 ｜ 入场 **0**（`initLarge({ intro: 0 })`，直接 `roam`） ｜ 激活 800 / 脱战 1200 ｜ 音效 `growl` ｜ 出没 `dump` / `city` / `village` ｜ 掉落：`cloth` 0.9（1~2）、`rubber` 0.7、`dog_food` 0.6、`chemical` 0.45、`scrap_plate` 0.5（1~2）、`repair_kit` 0.15。

**常量**：`DISGUISES = car_wreck / corpse / junk_heap`；`REVEAL_RANGE 90`；`EMERGE_T 0.7`；`LUNGE_WIND 0.45`；`LUNGE_T 0.45`；`LUNGE_SPEED 470`；`RECOVER_T 0.5`；`MIMIC_T 1.3`；`MIMIC_WIND 0.25`；`MIMIC_CD 6.2`；初始 `mimicCd = 3 + rand × 2`（3 ~ 5s）。

**招式**

| 招式 | 触发条件 | 前摇 | 冷却 | 判定与伤害 | 后续/硬直 |
|---|---|---|---|---|---|
| 伪装 DISGUISE | 出生即伪装（随机取一件道具贴图，本体 `mesh.visible = false`），完全静止 | — | — | 无判定；胸口有极弱呼吸微光（opacity 0.05 ~ 0.17） | 三种显形条件见下 |
| 显形 EMERGE | ① 玩家 2D 距离 < **90**；② 被攻击命中；③ 监听到 `scan:done` 且距离 ≤ **360** | 0.70s 起身动画 | — | 无伤害 | 转 `chase` |
| 扑咬 LUNGE | `hd < 118` 且 `attackCd <= 0` 且 **有视线** | 0.45s：向后退 `-facing × 30`、红环 0.35±0.28 闪烁、低吼 | 收招时置 2.4s | 以 `LUNGE_SPEED = 470` 沿起手方向直冲 0.45s；与玩家 **body 矩形重叠**时结算一次 30 伤害（`lungeHit` 保证单次） | `recover` 0.5s（以 `lungeDir × 16` 前滑）→ `chase`；撞墙（`body.wallDir !== 0`）提前收招 |
| 拟态 MIMIC | `mimicCd <= 0` 且 `100 < hd < 460` | `mimicWind` 0.25s | 起手置 `6.2 + rand × 2`（6.2 ~ 8.2s） | 变成**玩家当前机体**的 idle 帧（`getChassisArt(G.chassisId || 'unit7')`），本体隐藏；`mimicInvuln = true`，1.3s 内**所有攻击 0 伤害**，只冒火花 | 1.3s 结束立刻转 `lungeWind`，且 **`attackCd = 0`**（无冷却扑咬），红环 0.5 |
| 追击 CHASE | 兜底状态 | — | — | 以 `phaseSpeed` 前进，撞墙/悬崖停 | — |

**阶段与破法**

- 速度档位（在 `takeDamage` 里逐次判定）：HP ≤ 50% → `148 × 1.18 = 174.6`；HP ≤ 20% → `148 × 1.35 = 199.8`（两段都在时取后者）。
- 破法：伪装期只在 90px 内现形，远距离用扫描仪（360px 内）或直接打它都能提前触发；现形有 0.7s 硬直，是白送的首轮输出。
- 拟态骗招：看到"自己的机体"站在原地且打上去只冒火花，就停手等 1.3s——结束后它会立刻无冷却扑咬，必须提前拉开 118px 以上或准备侧闪。
- 可打断点：`lungeWind` / `mimicWind` 被命中即转 `hurt`（`hurtT` 守卫只在 `state` 非 `lunge`/`mimic` 时生效）；`mimic` 期间不可打断。
- `lunge` 撞墙会提前结束，把玩家逼到墙角反而能缩短它的突进距离。

**时序（伪装 → 显形 → 拟态 → 扑咬）**

1. 伪装：静止，道具贴图 + 呼吸微光；每帧检查 90px 与 `scan:done`。
2. 显形 `emerge` 0.7s（被扫描时换成蓝火花 + 高频 hurt 音效）。
3. `chase` 以 `phaseSpeed` 直冲；`100 < hd < 460` 且 `mimicCd` 好 → `mimicWind`。
4. `mimicWind` 0.25s（起手写 `mimicCd = 6.2 ~ 8.2s`）→ `mimic` 1.3s 无敌。
5. 1.3s 到点 → `_endMimic` → 直接进 `lungeWind`，且 `attackCd = 0`。
6. `lungeWind` 0.45s → `lunge` 0.45s @470，body 重叠判定一次 30 伤害。
7. `recover` 0.5s，写 `attackCd = 2.4` → 回 `chase`。

**源码要点 / bug**

- 文件头写"每 6 秒左右"拟态，实际是 6.2 ~ 8.2s（初始 3 ~ 5s），且只在 100 < `hd` < 460 的窗口才可能触发；贴脸与远距离都不会拟态。
- 扫描显形半径硬编码 360，**没有读取扫描仪的实际半径**：只要同房间内任意一次 `scan:done` 事件触发且它距玩家 ≤ 360，就无条件现形。
- 显形用 2D `distToPlayer()`（含纵向），扑咬与追击只用水平 `_hd`；两者判定口径不一致。
- 拟态贴图在第一次拟态时创建并缓存（`if (!this.decoy)`），此后机体涂装变化不会刷新。
- 伪装期仍每帧跑 `updateActivation`，会把它改成 `alert` 并播 `growl`——音效可能暴露伪装。
- `_endMimic()` 在 `!mimicInvuln` 时直接 return，脱战/死亡路径调用是安全的。

### 3.7 群聚核心 SWARM CORE · `swarm_core`

**面板**：`family: beast` ｜ HP 240 ｜ 速度 38 ｜ 伤害 18 ｜ 体型 150×130 ｜ `aggro` 520 ｜ `attackRange` 150 ｜ `attackType: swarm` ｜ `attackCooldown` 3 ｜ XP 140 ｜ 重力 2000 ｜ 入场 1.4s ｜ 激活 760 / 脱战 1200 ｜ 音效 `growl` ｜ 出没 `dump` / `factory` / `city` ｜ 掉落：`chemical` 1.0（2~3）、`cloth` 0.9（1~2）、`rubber` 0.8（1~2）、`rare_earth` 0.45、`scrap_plate` 0.6（1~2）、`rad_meds` 0.2。

**常量**：`BROOD_MAX 8`、`SPAWN_CD 3.2`、`EXPOSE_T 6`、`PULSE_WIND 0.5`、`PULSE_RADIUS 165`、`PULSE_DAMAGE 18`、`EXPOSED_DMG_MUL 1.15`；初始 `spawnCd 1.2`、`pulseCd 1.5`。

**招式**

| 招式 | 触发条件 | 前摇 | 冷却 | 判定与伤害 | 后续/硬直 |
|---|---|---|---|---|---|
| 产卵 SPAWN | 未暴露且 `spawnCd <= 0` 且存活小怪 < 8 | — | 3.2s | 从 `px ± (w×0.6 + 20 + rand×40)`（约 ±110 ~ ±150px）经 `director.spawn('crawler')` 产出；存活 < 3 只时一次产 **2**，否则产 **1**；总数上限 8 | 无硬直，可与游走并行 |
| 孵化脉冲 PULSE | `pulseCd <= 0` 且 `hd < 170` 且纵向差 `abs(p.centerY − feet) < 150` | 0.50s（红环 0.35±0.3 闪烁） | 起手即置 3.2s | 以 `(px, feet − 20)` 为圆心、**半径 165**、伤害 18 | `pulse` 收招 0.4s → `chase` |
| 闭壳无敌 | 默认状态 | — | — | `takeDamage` 在 `!exposed` 时**直接 return**：0 伤害，只闪 0.22s 蓝光与火花 | 无 |
| 暴露 EXPOSE | `broodEverSpawned > 0` 且**存活小怪数 = 0**（任意时刻、任意状态检查） | 触发瞬间开口 | — | 持续 **6.0s**，期间受伤 `× 1.15`，壳张开、核心亮红 | 6s 内没打死 → `_closeCore()`：闭壳并**立刻补 2 只**小怪 |
| 兜底暴露 | `broodEverSpawned === 0` 且 `noBroodT > 8`（产不出小怪时，如无 director / 无同屏额度） | — | — | 同样暴露 6s | 同上 |
| 死亡清巢 | HP 归零 | — | — | `_killBrood()` 对所有存活巢内小怪 `takeDamage(99999)` | 大特效 + 掉 `chemical × 2` |

**时序（暴露循环）**

1. 闭壳 → 每 3.2s 产 1 ~ 2 只，最多 8 只。
2. 玩家清空巢内小怪 → 同帧 `exposeT = 6.0`，`spawnCd` 至少 0.8（暴露期间不产卵）。
3. 6.0s 内本体可被打（×1.15）；未击杀则 `_closeCore()` → 立即 `_spawnBrood(2)` 补 2 只。
4. 补的小怪被秒清 → 下一帧再次暴露，形成 6s 一轮的输出窗口循环。

**阶段与破法**

- 无 HP 阶段（`phase` 字段未被使用）；强度完全由"巢内小怪是否清空"决定。
- 破法：先清杂兵再打本体。本体 240 HP，暴露期 1.15 倍易伤 ≈ 需要 209 点等效输出，通常能在一轮 6s 内解决。
- 近身会吃脉冲：r = 165 比触发距离 170 略小，贴边（170）起手时后退一步即可躲；纵向还需 `dy < 150` 才起手。
- 死亡即清场：`_killBrood` 用 `takeDamage(99999)` 杀小怪，会照常触发小怪的死亡掉落与击杀计数。
- 可打断点：只有暴露期可打断（闭壳期 `takeDamage` 提前 return，连 `hurt` 都不会进）。

**源码要点 / bug**

- 暴露判定写在 `playIntro` 之后、激活判断之前：**玩家还没激活/在房间外**时清光小怪，也会照常开壳计时，6s 后闭壳补怪——白丢一轮窗口。
- `pulse` 触发距离 170 > 半径 165，边缘 5px 内起手会打空。
- `_openCore()` 把 `spawnCd` 抬到 ≥ 0.8，但暴露期间不产卵，这个值实际无意义。
- 闭壳期无 `hurt`、无 `state` 变化，因此它能在 `pulseWind` 中被玩家白打而不中断（唯一一只前摇不可打断的）。
- 若场景没有 `director.spawn`，`_spawnBrood` 返回 0，`broodEverSpawned` 恒为 0，必须靠 `noBroodT > 8` 的兜底暴露，否则本体永久无敌卡房。
- 死亡清巢只清 `brood` 里的引用；被 director 另行生成的同类小怪不受影响。
