# 怪物招式总览（657 个敌人条目）

> 本目录是《雨世界 / RAIN WORLD》横版像素游戏的全部敌人招式文档。
> 所有招式 id、名称、前摇、冷却、距离带、伤害与判定都取自源码实现，未做推测性补值；源码里不存在的字段不做虚构。
> 文档只读参考：如果玩法代码改动，请以源码为准并同步更新对应章节。

## 一、文档索引

| 文档 | 覆盖对象 | 数量 | 数据来源 |
|---|---|---|---|
| [theme-bosses.md](./theme-bosses.md) | 主题站点 BOSS | 51 只 / 306 招（每只 6 招，其中 3 招标 ★） | `large/theme-bosses.js`、`theme-boss-kits.js`、`boss-signatures.js` |
| [large-bosses.md](./large-bosses.md) | 大型精英 BOSS | 7 只 | `large/tyrants.js`、`junk_golem.js`、`sky_warden.js`、`mimic_beast.js`、`swarm_core.js` |
| [minions.md](./minions.md) | 命名小怪 | 29 种 | `monsters/*.js`（基础 8 + 新种群 4 + 主题 14 + 劫匪 3） |
| [room-minions.md](./room-minions.md) | 房间专属小怪 | 570 只（190 间房 × 3 只） | `world/rooms/*.js` + `monsters/room-minions.js` |

合计 **657 个敌人条目**。除主题 BOSS 外，其余敌人没有独立的招式 id，文档按「招式/行为名 + 触发条件」描述。

## 二、四套战斗系统

### 1. 普通小怪（`BaseMonster`）

- 攻击冷却初始为 `0.8 + rand×0.8` 秒；`tryAttack()` 要求冷却归零且 `canReachPlayer()`（水平距离 ≤ `attackRange`，垂直差 < `max(60, 身高×0.9)`）。
- 默认 `performAttack()` 即 `hitPlayer(damage)`；玩家处于无敌帧时不结算，命中会派发 `PLAYER_HURT`。
- 受击：`hurtT=0.18s`、击退（水平 ±120、垂直 -140）、血条显示 2.2s；HP≤0 死亡并按 `loot` 概率掉落。
- 默认 AI：进入 `aggro` 且有视线 → 面向玩家、全速追击并尝试攻击；否则以 `speed×0.45` 巡逻，遇墙或悬崖转向。
- 飞行体不走重力与瓦片物理，由各自子类的悬停逻辑接管。

### 2. 房间小怪（`RoomMinion`）

- 570 只不各写 AI，而是由 **6 种接敌模式**（stalk / float / skitter / hop / ambush / orbit）+ **13 个共享招式**组合。
- 出招按距离选招（远优先远程、近优先近战），并且每第 2~3 次攻击强制换第二招；受击会打断前摇。
- 远程招需要视线；`spore` 延迟 0.55s 爆炸、`web` 持续 2.2s 减速并每 0.45s 跳 2 点伤害、`beam` 预警后锁定直线。
- 详细参数见 [room-minions.md](./room-minions.md) 第三节。

### 3. 大型 BOSS

- 每只在 `initLarge` 里配置 `intro` 与 `activateRange`：玩家进入激活范围才苏醒（入场演出期间不行动），未激活时以怠速巡游。
- 招式普遍是「状态机 + 前摇预警 + 一次性结算」，多数带独立冷却；部分 BOSS 拥有多阶段（断腿、过载、暴露、拟态）与召唤物。
- 逐只时序、倍率与破法见 [large-bosses.md](./large-bosses.md)。

### 4. 主题站点 BOSS

- 通用循环：`chase → wind:<move>（前摇）→ exec → recover（0.45s）→ chase`；每招独立冷却，两招之间另有 1.1–1.5s（二阶段 0.9s）的选招间隔。
- 距离带：`range` 外不主动出招；最大距离 ≥ 400 的远程招贴身时仍可释放。
- 连招：收招后 55% 概率立刻接下一招；一阶段最多追加 1 段，二阶段最多 2 段。
- 二阶段：HP ≤ 50% 触发——移速 ×1.16、基础攻击 ×1.18、立即释放首个签名招，签名招概率 35%→55%。
- 入场：玩家进入 780 距离激活，`intro` 1.25s；未激活时 0.5 倍速巡游。
- ★ 标记为签名招（kit 首招 + 两招专属签名），在选招池里带概率优先。

## 三、阅读指南

- **前摇**：从开始出招到判定生效的时间；期间会播放预警（地面圈/预警线/火花）。
- **冷却**：该招自身的再次可用时间；主题 BOSS 另有公共选招间隔，见上。
- **距离带**：`[最小, 最大]` 水平距离；`全场` 表示无距离上限。主题 BOSS 的伤害写作「×倍率」，乘该 BOSS 的基础攻击力即为实际伤害。
- **判定与表现**：按时间顺序列出预警圈、弹道、扇形/环形弹幕、范围冲击、召唤等；`r=` 是半径，`速` 是弹速 px/s。
- **★ / 二阶段**：主题 BOSS 表内会单独标注二阶段的参数变化；大型 BOSS 与小怪在「阶段/破法」小节说明阈值与倍率。

## 四、已确认的源码问题（文档正文均有标注）

| 位置 | 问题 | 影响 |
|---|---|---|
| `boss-signatures.js` `prf_peer_review` | `after(delay, () => …)` 少传 BOSS 参数，被 `after` 的守卫静默丢弃 | 四段落弹不生效，只剩预警圈 |
| `theme-minions.js` `CultFanatic` / `AlienOrb` | 构造器 `super(game, x, y)` 漏传 DEF | 面板与掉落全部回退基类默认；狂信者的燃烧瓶距离条件退化为 `d>100 && d<70`，远程招失效 |
| `theme-minions.js` `WeldBrute` | 喷火计时 `_flameT -= dt` 后又 `-= 0.9` | 喷火只存在 1 帧，前摇与持续段都消失 |
| `theme-minions.js` `ViralWraith` | 震击后写 `this.attackCd = this.attackCooldown`（属性不存在） | 冷却变 `NaN`，此后可无限出招 |
| `large/tyrants.js` `ClawTyrant` | 跃扑落地后置 `state='slam'` 但不调用 `_slam()` | 落地只有 0.38s 硬直，没有二段伤害 |

> 其余问题（飞行体不积分位移、`WingRat` 俯冲穿墙、`CastleKnight` 破盾被每帧覆盖、`GhoulHusk` 扑击无判定等）在各章对应招式处标注「源码 bug」。

## 五、维护方式

- 主题 BOSS 的 306 招由 `theme-boss-kits.js` / `boss-signatures.js` 的招式对象自动抽取：字段 `name / en / sig / wind / cool / range / exec`，执行轨迹由招式原子件（`mark / after / shot / fan / ring / lob / groundWave / burst / summonWave / chargeAt` 等）记录。
- 大型 BOSS 与小怪章节由源码逐行核对后手写；新增怪物时按同样格式补一节即可。
- 所有相对链接都指向本目录内的 Markdown 文件，可离线阅读。
