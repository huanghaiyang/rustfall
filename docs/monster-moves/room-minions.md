# 房间专属小怪 · 570 只（程序化房怪系统）

> 数据源：`src/game/world/rooms/*.js` 的 `ROOM_MINION_DEFS`（190 间房 × 3 只，共 570 只）。
> 行为实现：`src/game/entities/monsters/room-minions.js` 的 `RoomMinion`（继承 `BaseMonster`）。
> 这 570 只不各写一套 AI，而是用 6 种接敌模式 + 13 个共享招式组合出手感；美术按 `artId` 加载。
>
> 相关文档：[总览](./README.md)｜[主题 BOSS](./theme-bosses.md)｜[大型 BOSS](./large-bosses.md)｜[小怪](./minions.md)

## 一、通用面板与基础规则

| 项目 | 规则 |
|---|---|
| 血量 | 24 ~ 94（平均 46.8） |
| 家族 | beast 559 / machine 11 |
| 飞行 | 是 214 / 否 356 |
| 仇恨 | `def.aggro`，必须同时满足距离与视线（`hasLineOfSight`）才进入战斗 |
| 攻击距离 | `def.attackRange`，远程招额外允许 +24 的容差 |
| 冷却 | `def.attackCooldown`；起手瞬间写入，且不低于 0.3s |
| 受击 | `hurtT=0.18s`，会被击退（水平 ±120、垂直 -140），并**打断前摇**（`windupT` 清零、预警圈消失） |
| 死亡 | 按 `loot` 概率掉落；死亡动画 1.6s 后隐藏 |
| 地面单位 | 玩家高出 34px 且距离 <130 时短跳（`upHopCd` 1.2s）；巡逻/追击遇到墙或悬崖会停下或转向 |
| 飞行单位 | 悬停基准 = 出生高度 - `hover`（默认 44 + 身高×0.9），上下最多追 ±100/70px，并做瓦片避障 |

## 二、6 种 AI 模式（`def.ai`）

| 模式 | 数量 | 行为 |
|---|---|---|
| `stalk` 追猎（默认） | 249 | 冲向玩家，进入 `attackRange` 后停下出招 |
| `float` 悬浮 | 100 | 飞行体，飘向舒适距离并开火；高度贴出生基线缓慢起伏 |
| `skitter` 乱窜 | 76 | 之字走位、随机停顿；撞墙/悬崖立刻反向并短暂停顿 |
| `hop` 弹跳 | 76 | 朝玩家连续弹跳突进（落地再跳），用短跳跨越缺口 |
| `ambush` 伏击 | 63 | 低伏不动，玩家进入 `min(aggro,250)` 触发半径才爆发冲刺；玩家跑远（>1.2×aggro）后重新伏击 |
| `orbit` 绕圈 | 6 | 保持舒适距离（`attackRange×0.5 ~ ×0.82`）横移绕圈，进入射程就放招 |
| `turret` 炮台 | 0（数据未使用） | 原地只转身，射程内开火 |

> 数据里没有用到 `turret`，但代码支持；`float` 模式若非飞行体会自动退化为 `orbit`。

## 三、13 个共享招式（`MOVE_TABLE`）

伤害均为 `this.damage` 的倍率；近战判定还会加上玩家体积的一半 +10px 的横向余量。

| id | 类型 | 前摇 | 判定 / 弹道 | 伤害倍率 | 备注 |
|---|---|---|---|---|---|
| `claw` 爪击 | 近战 | 0.14s | 前方 44px、垂直 46px | ×1.0 | 只打面向的一侧 |
| `peck` 啄击 | 近战 | 0.10s | 前方 36px、垂直 40px | ×0.8 | 最快的前摇 |
| `tail` 横扫 | 近战 | 0.18s | 66px、垂直 60px | ×0.95 | **不限制朝向**，身后也能打到 |
| `slam` 踏地 | 近战 AoE | 0.42s | 自身前方 `w×0.35` 处半径 78 | ×1.1 | 地面红圈随前摇放大 |
| `lunge` 突刺 | 近战冲刺 | 0.22s | 冲刺 0.18s、速度 280（飞行 460），射程 150 | ×1.15 | 冲刺途中接触即结算一次 |
| `charge` 长冲 | 近战冲刺 | 0.34s | 冲刺 0.34s、速度 280（飞行 520），射程 220 | ×1.35 | 距离远时才可用，伤害最高 |
| `burrow` 潜地 | 近战位移 | 0.26s | 潜地 0.42s（不可选中），在玩家脚下浮出，半径 64 | ×1.2 | 全程只有浮出瞬间结算 |
| `spit` 抛物线弹 | 远程 | 0.34s | 弹速 260、重力 820、半径 5 | ×0.95 | 预判玩家速度 0.28s |
| `fan` 扇形弹幕 | 远程 | 0.40s | 3~5 发，横向偏移 24px，弹速 300、重力 480 | ×0.7/发 | 覆盖一整片区域 |
| `beam` 光束 | 远程 | 0.55s | 预警线锁定后开火，带宽 30，长度 max(攻击Range+80,180) 且 ≤520 | ×1.2 | 被地形阻挡；预警期间跟着玩家转 |
| `ring` 环身爆发 | 远程 | 0.36s | 自身半径 112 | ×1.0 | 近身惩罚，专治贴脸 |
| `spore` 延迟孢子 | 远程 | 0.30s | 落在玩家脚下，延迟 0.55s 后爆开，半径 64 | ×1.05 | 逼玩家离开原地 |
| `web` 减速网 | 远程 | 0.28s | 地面网半径 50、持续 2.2s，每 0.45s 跳 2 点伤害 | ×0.2 | 踩网会被持续阻尼减速 |

## 四、出招节奏

1. **按距离选招**：可用招里，距离大于 `max(140, attackRange×0.6)` 优先远程；小于其 80% 优先近战。
2. **强制换招**：第 2、3 次攻击必定切到可用列表的第二招，避免复读。
3. **前摇可打断**：受击会取消整个招式（不消耗后续冷却之外的资源）。
4. **收招**：远程 0.22s、近战 0.14s；冲刺与潜地自行接管后续，结束后 0.18/0.22s 收招。
5. **远程条件**：`spit/fan/beam/ring/spore/web` 必须满足视线；近战只要距离够（冲刺额外放宽 80px，其余 56px）。

## 五、逐只数据（附录）

> 下表按大区 → 房间列出每只房怪。`招式` 列的顺序即优先级（`attackType` 会被提到首位）。
> `rm_*` 是运行时注册 id，与房间绑定，不会在别的房间刷出。


## 锈城废墟 RUST CITY

### 高架下 · `city_underpass`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 桥墩伏影 | `rm_city_underpass_01` | stalk | lunge → spit | 48 | 10 | 115 | 54 | 1.6s | — |
| 钢筋蜱 | `rm_city_underpass_02` | skitter | claw → fan | 27 | 8 | 132 | 38 | 1.05s | — |
| 涵洞嗅犬 | `rm_city_underpass_03` | stalk | lunge → ring | 42 | 10 | 102 | 54 | 2s | — |

### 塌市场 · `city_market`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 秤砣蛛 | `rm_city_market_01` | skitter | web → claw | 34 | 7 | 134 | 38 | 1.35s | — |
| 烂菜蛆王 | `rm_city_market_02` | ambush | spore → slam | 51 | 11 | 64 | 50 | 2.2s | — |
| 摊底鼠 | `rm_city_market_03` | stalk | lunge → peck | 46 | 11 | 104 | 54 | 1.9s | — |

### 第八小学 · `city_school`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 课桌寄生蛛 | `rm_city_school_01` | skitter | web → spit | 29 | 8 | 135 | 38 | 0.95s | 是 |
| 走廊粉笔鬼 | `rm_city_school_02` | float | fan → spore | 38 | 10 | 79 | 190 | 2.4s | 是 |
| 操场啃骨犬 | `rm_city_school_03` | stalk | lunge → tail | 41 | 11 | 112 | 54 | 1.6s | — |

### 社区诊所 · `city_clinic`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 输液蛭 | `rm_city_clinic_01` | ambush | spit → lunge | 53 | 11 | 55 | 50 | 2.2s | — |
| 病历蛾 | `rm_city_clinic_02` | hop | fan → spore | 31 | 10 | 125 | 46 | 1.7s | 是 |
| 药柜佝偻 | `rm_city_clinic_03` | stalk | claw → slam | 44 | 12 | 92 | 56 | 2s | — |

### 公交总站 · `city_busstop`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 站牌伏蛾 | `rm_city_busstop_01` | hop | fan → spit | 25 | 8 | 123 | 46 | 1.4s | 是 |
| 轮胎蟒 | `rm_city_busstop_02` | stalk | lunge → tail | 47 | 11 | 101 | 56 | 1.9s | — |
| 投币箱蟹 | `rm_city_busstop_03` | stalk | claw → beam | 67 | 15 | 59 | 50 | 2.3s | — |

### 屋顶道 · `city_roofway`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 屋脊跃鼠 | `rm_city_roofway_01` | stalk | lunge → peck | 51 | 11 | 113 | 54 | 1.7s | — |
| 天线鹫 | `rm_city_roofway_02` | hop | beam → fan | 30 | 9 | 125 | 46 | 1.5s | 是 |
| 水箱漂影 | `rm_city_roofway_03` | float | spore → ring | 38 | 11 | 72 | 190 | 2.1s | 是 |

### 锈城营地 · `city_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 营地守夜人 | `rm_city_shelter_01` | stalk | claw → slam | 46 | 13 | 86 | 56 | 2s | — |
| 灶灰蛆 | `rm_city_shelter_02` | ambush | spore → lunge | 48 | 13 | 57 | 50 | 2.4s | — |
| 哨灯蛾 | `rm_city_shelter_03` | hop | beam → fan | 26 | 9 | 124 | 46 | 1.3s | 是 |

### 断街 · `city_street`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 街垒拾荒者 | `rm_city_street_01` | stalk | charge → claw | 45 | 11 | 86 | 56 | 2.2s | — |
| 消防栓蟹 | `rm_city_street_02` | stalk | claw → beam | 60 | 13 | 52 | 50 | 2.2s | — |
| 断线蛇 | `rm_city_street_03` | stalk | beam → lunge | 45 | 12 | 98 | 56 | 1.8s | — |

### 中庭广场 · `city_plaza`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 铜像残影 | `rm_city_plaza_01` | stalk | slam → ring | 90 | 15 | 39 | 56 | 2.4s | — |
| 喷泉鳃虫 | `rm_city_plaza_02` | ambush | spit → fan | 53 | 11 | 69 | 50 | 2.1s | — |
| 广场鸽魇 | `rm_city_plaza_03` | hop | peck → lunge | 33 | 8 | 127 | 46 | 1.4s | 是 |

### 棚户区 · `city_slum`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 棚户钩手 | `rm_city_slum_01` | stalk | claw → lunge | 44 | 13 | 84 | 56 | 2.2s | — |
| 晾衣绳蟒 | `rm_city_slum_02` | stalk | tail → lunge | 45 | 10 | 90 | 56 | 1.7s | — |
| 煤炉鼹 | `rm_city_slum_03` | stalk | spit → slam | 50 | 11 | 108 | 54 | 1.6s | — |

### 锈塔 · `city_tower`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 缆绳攀客 | `rm_city_tower_01` | stalk | claw → charge | 56 | 13 | 83 | 56 | 1.8s | — |
| 电梯坠影 | `rm_city_tower_02` | float | slam → ring | 33 | 11 | 71 | 190 | 2s | 是 |
| 齿轮甲虫 | `rm_city_tower_03` | skitter | claw → beam | 33 | 9 | 140 | 38 | 1.35s | — |

### 东闸 · `city_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 闸门卫兵 | `rm_city_gate_01` | orbit | beam → slam | 65 | 13 | 71 | 200 | 2.2s | — |
| 铁丝网蛛 | `rm_city_gate_02` | skitter | web → spit | 38 | 7 | 143 | 38 | 1.15s | — |
| 哨塔鼬 | `rm_city_gate_03` | stalk | lunge → peck | 49 | 10 | 115 | 54 | 1.9s | — |

### 环路 · `city_ringroad`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 环路飙客 | `rm_city_ringroad_01` | stalk | charge → lunge | 54 | 12 | 96 | 56 | 2.1s | — |
| 护栏蜈蚣 | `rm_city_ringroad_02` | skitter | claw → fan | 27 | 7 | 132 | 38 | 0.95s | — |
| 收费亭幽灵 | `rm_city_ringroad_03` | float | spore → beam | 37 | 12 | 71 | 190 | 2.3s | 是 |

### 广告牌阵 · `city_billboard`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 海报蛾 | `rm_city_billboard_01` | ambush | fan → spore | 34 | 8 | 129 | 46 | 1.4s | 是 |
| 射灯蟹 | `rm_city_billboard_02` | stalk | beam → claw | 61 | 14 | 58 | 50 | 2.4s | — |
| 脚手架猿 | `rm_city_billboard_03` | stalk | lunge → slam | 44 | 13 | 88 | 56 | 2s | — |

### 地下停车场 · `city_parking`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 车库伏影 | `rm_city_parking_01` | stalk | lunge → spit | 40 | 10 | 116 | 54 | 1.7s | — |
| 监控眼 | `rm_city_parking_02` | float | beam → ring | 43 | 10 | 72 | 190 | 2.3s | 是 |
| 油污蛞蝓 | `rm_city_parking_03` | stalk | spore → slam | 77 | 13 | 49 | 44 | 2.2s | — |

### 地铁口 · `city_metro_mouth`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 闸机蟹 | `rm_city_metro_mouth_01` | stalk | claw → beam | 59 | 15 | 57 | 50 | 2.1s | — |
| 隧道鼹 | `rm_city_metro_mouth_02` | stalk | burrow → lunge | 48 | 9 | 103 | 54 | 1.6s | — |
| 售票机幽灵 | `rm_city_metro_mouth_03` | float | fan → spore | 38 | 11 | 69 | 190 | 2.2s | 是 |

### 仓库排 · `city_depot_row`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 货架潜行者 | `rm_city_depot_row_01` | stalk | claw → lunge | 56 | 12 | 87 | 56 | 2.2s | — |
| 托盘甲虫 | `rm_city_depot_row_02` | skitter | claw → slam | 38 | 7 | 144 | 38 | 1.25s | — |
| 吊扇魇 | `rm_city_depot_row_03` | float | ring → beam | 38 | 12 | 76 | 190 | 2.3s | 是 |

### 城界 · `city_border`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 界碑石像 | `rm_city_border_01` | ambush | slam → ring | 86 | 16 | 41 | 56 | 2.8s | — |
| 边检犬 | `rm_city_border_02` | skitter | lunge → peck | 43 | 10 | 105 | 54 | 2s | — |
| 界旗蛾 | `rm_city_border_03` | hop | fan → spore | 34 | 9 | 121 | 46 | 1.6s | 是 |


## 锈雨村 VILLAGE

### 鸡舍 · `village_henhouse`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 鸡舍羽虱 | `rm_village_henhouse_01` | skitter | claw → fan | 28 | 9 | 140 | 38 | 1.25s | — |
| 稻草蛇 | `rm_village_henhouse_02` | stalk | lunge → tail | 43 | 12 | 100 | 56 | 1.6s | — |
| 偷蛋鼬 | `rm_village_henhouse_03` | stalk | peck → lunge | 47 | 9 | 114 | 54 | 1.9s | — |

### 磨坊 · `village_mill`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 磨盘甲虫 | `rm_village_mill_01` | skitter | slam → claw | 36 | 7 | 132 | 38 | 1.15s | 是 |
| 面粉蛾 | `rm_village_mill_02` | hop | spore → fan | 30 | 8 | 117 | 46 | 1.5s | 是 |
| 谷仓鼠 | `rm_village_mill_03` | stalk | lunge → peck | 40 | 11 | 111 | 54 | 1.7s | — |

### 果园 · `village_orchard`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 果腐蜂 | `rm_village_orchard_01` | skitter | peck → fan | 36 | 8 | 139 | 38 | 1.35s | — |
| 枯枝螳螂 | `rm_village_orchard_02` | skitter | claw → lunge | 35 | 8 | 139 | 38 | 1.05s | — |
| 果园鸦 | `rm_village_orchard_03` | hop | peck → spore | 32 | 10 | 127 | 46 | 1.4s | 是 |

### 池塘 · `village_pond`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 塘泥蛭 | `rm_village_pond_01` | ambush | spit → slam | 49 | 11 | 70 | 50 | 2.2s | — |
| 芦花鹭 | `rm_village_pond_02` | ambush | peck → lunge | 28 | 9 | 128 | 46 | 1.7s | 是 |
| 渔网蛛 | `rm_village_pond_03` | skitter | web → fan | 29 | 9 | 140 | 38 | 1.35s | 是 |

### 柴棚 · `village_shed`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 柴垛甲虫 | `rm_village_shed_01` | skitter | claw → slam | 29 | 8 | 140 | 38 | 1.05s | — |
| 锯木螳螂 | `rm_village_shed_02` | skitter | claw → lunge | 33 | 8 | 143 | 38 | 1.35s | — |
| 柴棚鼠 | `rm_village_shed_03` | skitter | peck → lunge | 45 | 11 | 108 | 54 | 1.8s | — |

### 石桥 · `village_bridge`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 桥下鳗 | `rm_village_bridge_01` | stalk | beam → lunge | 45 | 12 | 105 | 56 | 1.6s | — |
| 石狮残影 | `rm_village_bridge_02` | stalk | slam → ring | 85 | 17 | 35 | 56 | 2.6s | — |
| 苔藓蟹 | `rm_village_bridge_03` | ambush | claw → spit | 66 | 14 | 57 | 50 | 2.3s | — |

### 村口灶屋 · `village_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 灶灰蛆 | `rm_village_shelter_01` | ambush | spore → lunge | 53 | 12 | 67 | 50 | 2.4s | — |
| 腌菜坛蟹 | `rm_village_shelter_02` | stalk | claw → slam | 62 | 13 | 50 | 50 | 2.3s | — |
| 烟囱鸦 | `rm_village_shelter_03` | hop | fan → beam | 27 | 9 | 120 | 46 | 1.7s | 是 |

### 龟裂农田 · `village_field`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 田埂蝗虫 | `rm_village_field_01` | skitter | lunge → fan | 33 | 7 | 144 | 38 | 1.35s | — |
| 枯秆螳螂 | `rm_village_field_02` | skitter | claw → lunge | 37 | 7 | 134 | 38 | 1.35s | — |
| 犁头兽 | `rm_village_field_03` | stalk | charge → slam | 51 | 10 | 112 | 54 | 1.8s | — |

### 斜屋 · `village_house`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 纺车蛛 | `rm_village_house_01` | skitter | web → claw | 34 | 8 | 132 | 38 | 0.95s | — |
| 衣柜鼬 | `rm_village_house_02` | ambush | lunge → peck | 48 | 9 | 111 | 54 | 1.9s | — |
| 摇篮幽影 | `rm_village_house_03` | float | spore → ring | 44 | 11 | 75 | 190 | 2.1s | 是 |

### 枯井 · `village_well`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 井底蛙人 | `rm_village_well_01` | stalk | lunge → spit | 51 | 11 | 90 | 56 | 2.1s | — |
| 辘轳蛇 | `rm_village_well_02` | ambush | tail → lunge | 38 | 10 | 98 | 56 | 1.9s | — |
| 苔井蟹 | `rm_village_well_03` | stalk | claw → beam | 61 | 15 | 52 | 50 | 2.1s | — |

### 塌谷仓 · `village_barn`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 谷仓猫魇 | `rm_village_barn_01` | stalk | lunge → claw | 45 | 11 | 105 | 54 | 1.6s | — |
| 谷堆蟒 | `rm_village_barn_02` | stalk | lunge → tail | 40 | 10 | 101 | 56 | 1.7s | — |
| 梁上蛾 | `rm_village_barn_03` | hop | fan → spore | 35 | 10 | 116 | 46 | 1.7s | 是 |

### 田埂尽头 · `village_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 田埂猎犬 | `rm_village_gate_01` | stalk | lunge → peck | 51 | 9 | 111 | 54 | 1.9s | — |
| 界石像 | `rm_village_gate_02` | stalk | slam → ring | 84 | 17 | 32 | 56 | 2.6s | — |
| 草垛蛾 | `rm_village_gate_03` | hop | spore → fan | 27 | 9 | 129 | 46 | 1.7s | 是 |

### 洼地 · `village_hollow`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 洼地蟾 | `rm_village_hollow_01` | stalk | spit → slam | 76 | 14 | 47 | 44 | 2.3s | — |
| 沼气鬼 | `rm_village_hollow_02` | ambush | spore → ring | 32 | 10 | 76 | 190 | 2s | 是 |
| 骨刺蛇 | `rm_village_hollow_03` | stalk | lunge → tail | 42 | 11 | 105 | 56 | 1.6s | — |

### 小教堂 · `village_chapel`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 圣像石像 | `rm_village_chapel_01` | stalk | slam → beam | 85 | 17 | 28 | 56 | 2.5s | — |
| 烛火蛾 | `rm_village_chapel_02` | hop | fan → spore | 31 | 9 | 122 | 46 | 1.5s | 是 |
| 钟楼蝙蝠 | `rm_village_chapel_03` | hop | ring → lunge | 27 | 8 | 129 | 46 | 1.3s | 是 |

### 砖窑 · `village_kiln`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 窑火蜥 | `rm_village_kiln_01` | stalk | lunge → spit | 43 | 9 | 113 | 54 | 1.6s | — |
| 砖垛甲虫 | `rm_village_kiln_02` | ambush | slam → claw | 27 | 7 | 137 | 38 | 1.15s | — |
| 窑烟鬼 | `rm_village_kiln_03` | ambush | spore → beam | 42 | 10 | 81 | 190 | 2s | 是 |

### 坟地 · `village_graveyard`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 坟土蛆 | `rm_village_graveyard_01` | ambush | spore → slam | 54 | 11 | 58 | 50 | 2.5s | — |
| 墓碑石像 | `rm_village_graveyard_02` | stalk | slam → ring | 84 | 17 | 41 | 56 | 2.7s | — |
| 纸钱蛾 | `rm_village_graveyard_03` | hop | fan → spore | 25 | 10 | 122 | 46 | 1.7s | 是 |

### 井田 · `village_wellfield`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 井田鳗 | `rm_village_wellfield_01` | stalk | beam → lunge | 40 | 10 | 98 | 56 | 1.8s | — |
| 水槽蟹 | `rm_village_wellfield_02` | stalk | claw → spit | 65 | 13 | 56 | 50 | 2.2s | — |
| 稻草人偶 | `rm_village_wellfield_03` | skitter | slam → lunge | 53 | 12 | 88 | 56 | 2s | — |

### 山脊 · `village_ridge`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 山脊鹰 | `rm_village_ridge_01` | hop | lunge → fan | 31 | 9 | 121 | 46 | 1.6s | 是 |
| 岩脊羊 | `rm_village_ridge_02` | stalk | charge → slam | 42 | 10 | 105 | 54 | 1.6s | — |
| 风车影 | `rm_village_ridge_03` | float | ring → beam | 41 | 10 | 75 | 190 | 2.2s | 是 |


## 旧厂区 FACTORY

### 进料口 · `factory_intake`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 进料颚兽 | `rm_factory_intake_01` | stalk | slam → charge | 49 | 10 | 104 | 54 | 1.6s | — |
| 传送带蜈蚣 | `rm_factory_intake_02` | skitter | claw → beam | 27 | 9 | 133 | 38 | 0.95s | — |
| 料斗蛛 | `rm_factory_intake_03` | skitter | web → spit | 36 | 7 | 140 | 38 | 1.15s | — |

### 锅炉房 · `factory_boiler`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 锅炉炎鬼 | `rm_factory_boiler_01` | float | spore → beam | 32 | 11 | 72 | 190 | 2.2s | 是 |
| 压力表蟹 | `rm_factory_boiler_02` | stalk | claw → slam | 67 | 14 | 49 | 50 | 2.3s | — |
| 煤渣蛆 | `rm_factory_boiler_03` | ambush | spit → lunge | 56 | 11 | 70 | 50 | 2.1s | — |

### 化学品间 · `factory_chem`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 酸液蛞蝓 | `rm_factory_chem_01` | ambush | spit → slam | 74 | 13 | 44 | 44 | 2.3s | — |
| 试剂蛾 | `rm_factory_chem_02` | hop | fan → spore | 34 | 9 | 117 | 46 | 1.3s | 是 |
| 防毒面具客 | `rm_factory_chem_03` | stalk | claw → lunge | 45 | 12 | 94 | 56 | 2.1s | — |

### 机加车间 · `factory_machine`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 车床臂 | `rm_factory_machine_01` | skitter | claw → slam | 63 | 12 | 58 | 200 | 2.6s | — |
| 铁屑鼠 | `rm_factory_machine_02` | stalk | peck → lunge | 51 | 11 | 107 | 54 | 1.8s | — |
| 砂轮眼 | `rm_factory_machine_03` | float | beam → ring | 33 | 10 | 78 | 190 | 2s | 是 |

### 喷漆线 · `factory_paint`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 漆雾鬼 | `rm_factory_paint_01` | float | spore → beam | 39 | 10 | 73 | 190 | 2s | 是 |
| 喷枪蟹 | `rm_factory_paint_02` | skitter | beam → fan | 66 | 13 | 61 | 50 | 2.1s | — |
| 晾干架蛛 | `rm_factory_paint_03` | skitter | web → claw | 36 | 9 | 133 | 38 | 1.25s | — |

### 废料场 · `factory_scrap_yard`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 废钢蟹 | `rm_factory_scrap_yard_01` | stalk | claw → slam | 61 | 15 | 61 | 50 | 2.1s | — |
| 磁选蛾 | `rm_factory_scrap_yard_02` | float | ring → beam | 36 | 11 | 73 | 190 | 2s | 是 |
| 抓斗猿 | `rm_factory_scrap_yard_03` | ambush | lunge → slam | 53 | 11 | 89 | 56 | 1.9s | — |

### 值班室 · `factory_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 值班影 | `rm_factory_shelter_01` | stalk | claw → lunge | 56 | 12 | 85 | 56 | 1.8s | — |
| 电炉蛆 | `rm_factory_shelter_02` | ambush | spit → slam | 55 | 12 | 56 | 50 | 2.4s | — |
| 对讲机蟹 | `rm_factory_shelter_03` | stalk | beam → claw | 65 | 13 | 51 | 50 | 2.3s | — |

### 流水线 · `factory_line`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 装配臂 | `rm_factory_line_01` | orbit | slam → beam | 71 | 13 | 59 | 200 | 2.3s | — |
| 螺丝蛛 | `rm_factory_line_02` | skitter | web → fan | 33 | 9 | 135 | 38 | 1.35s | — |
| 检测眼 | `rm_factory_line_03` | float | beam → ring | 40 | 10 | 70 | 190 | 2.3s | 是 |

### 铸造主厅 · `factory_hall`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 铁水鬼 | `rm_factory_hall_01` | skitter | beam → spore | 37 | 10 | 68 | 190 | 2.3s | 是 |
| 砂箱甲虫 | `rm_factory_hall_02` | skitter | slam → claw | 27 | 8 | 141 | 38 | 1.25s | — |
| 钢包猿 | `rm_factory_hall_03` | stalk | slam → lunge | 44 | 12 | 89 | 56 | 2.2s | — |

### 熔炉坑 · `factory_furnace`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 炉渣蜥 | `rm_factory_furnace_01` | stalk | lunge → spit | 41 | 9 | 107 | 54 | 1.6s | — |
| 耐火砖蟹 | `rm_factory_furnace_02` | stalk | slam → claw | 63 | 14 | 54 | 50 | 2.2s | — |
| 熔炉烟鬼 | `rm_factory_furnace_03` | float | ring → beam | 41 | 12 | 67 | 190 | 2s | 是 |

### 控制室 · `factory_control`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 仪表眼 | `rm_factory_control_01` | float | beam → ring | 39 | 10 | 76 | 190 | 2s | 是 |
| 键盘蛛 | `rm_factory_control_02` | skitter | claw → fan | 31 | 8 | 140 | 38 | 1.25s | — |
| 控制台幽影 | `rm_factory_control_03` | stalk | slam → spit | 51 | 13 | 92 | 56 | 2.2s | — |

### 排渣闸 · `factory_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 排渣犬 | `rm_factory_gate_01` | stalk | lunge → peck | 44 | 10 | 108 | 54 | 1.7s | — |
| 闸门石像 | `rm_factory_gate_02` | stalk | slam → ring | 87 | 15 | 31 | 56 | 2.4s | — |
| 闸门蟹 | `rm_factory_gate_03` | stalk | claw → beam | 67 | 14 | 53 | 50 | 2s | — |

### 配电房 · `factory_power`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 电弧鬼 | `rm_factory_power_01` | float | beam → ring | 41 | 11 | 72 | 190 | 2.2s | 是 |
| 电缆蟒 | `rm_factory_power_02` | stalk | lunge → tail | 42 | 11 | 91 | 56 | 1.9s | — |
| 配电蟹 | `rm_factory_power_03` | stalk | claw → slam | 70 | 14 | 61 | 50 | 2.1s | — |

### 化验室 · `factory_lab`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 培养蛆 | `rm_factory_lab_01` | ambush | spore → slam | 50 | 11 | 69 | 50 | 2.3s | — |
| 显微镜蟹 | `rm_factory_lab_02` | stalk | beam → claw | 70 | 15 | 52 | 50 | 2.3s | — |
| 样本蛾 | `rm_factory_lab_03` | hop | fan → spore | 29 | 8 | 129 | 46 | 1.3s | 是 |

### 冷却池 · `factory_coolant`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 冷却鳗 | `rm_factory_coolant_01` | stalk | beam → lunge | 50 | 10 | 97 | 56 | 1.5s | — |
| 水垢蟹 | `rm_factory_coolant_02` | stalk | claw → slam | 64 | 13 | 50 | 50 | 2.4s | — |
| 冷却雾鬼 | `rm_factory_coolant_03` | float | spore → ring | 41 | 10 | 75 | 190 | 2.4s | 是 |

### 货运轨道 · `factory_rail`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 轨道螳螂 | `rm_factory_rail_01` | skitter | claw → lunge | 27 | 8 | 134 | 38 | 1.15s | 是 |
| 矿车蟹 | `rm_factory_rail_02` | stalk | slam → claw | 67 | 13 | 52 | 50 | 2.3s | — |
| 信号灯蛾 | `rm_factory_rail_03` | hop | beam → fan | 24 | 10 | 123 | 46 | 1.6s | 是 |

### 料仓 · `factory_silo`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 料仓螨 | `rm_factory_silo_01` | skitter | web → fan | 27 | 8 | 141 | 38 | 1.25s | 是 |
| 螺旋蛇 | `rm_factory_silo_02` | stalk | lunge → tail | 50 | 10 | 92 | 56 | 1.8s | — |
| 料位眼 | `rm_factory_silo_03` | float | beam → ring | 36 | 11 | 75 | 190 | 2.2s | 是 |

### 排污口 · `factory_outfall`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 排污蛞蝓 | `rm_factory_outfall_01` | stalk | spit → slam | 78 | 12 | 54 | 44 | 2.3s | — |
| 格栅蟹 | `rm_factory_outfall_02` | stalk | claw → beam | 65 | 15 | 64 | 50 | 2.3s | — |
| 污水鬼 | `rm_factory_outfall_03` | float | spore → ring | 34 | 10 | 76 | 190 | 2.1s | 是 |


## 废料场 DUMP

### 入口坡道 · `dump_gateway`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 地磅蟹 | `rm_dump_gateway_01` | stalk | slam → claw | 67 | 13 | 53 | 50 | 2.4s | — |
| 坡道鼠 | `rm_dump_gateway_02` | stalk | lunge → peck | 42 | 11 | 105 | 54 | 1.7s | — |
| 道闸幽灵 | `rm_dump_gateway_03` | skitter | beam → spore | 39 | 11 | 77 | 190 | 2.3s | 是 |

### 分拣线 · `dump_sortline`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 分拣蛾 | `rm_dump_sortline_01` | hop | fan → spore | 29 | 9 | 128 | 46 | 1.5s | 是 |
| 传送蜈蚣 | `rm_dump_sortline_02` | skitter | claw → beam | 27 | 8 | 140 | 38 | 1.35s | — |
| 塑料蛆 | `rm_dump_sortline_03` | ambush | spit → slam | 49 | 13 | 55 | 50 | 2.5s | — |

### 焚烧炉排 · `dump_burner_row`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 炉排蜥 | `rm_dump_burner_row_01` | stalk | lunge → spit | 44 | 11 | 112 | 54 | 1.8s | — |
| 烟囱鬼 | `rm_dump_burner_row_02` | float | ring → beam | 43 | 10 | 72 | 190 | 2.2s | 是 |
| 灰渣蟹 | `rm_dump_burner_row_03` | stalk | claw → slam | 68 | 13 | 49 | 50 | 2s | — |

### 轮胎谷 · `dump_tire_valley`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 轮胎蟒 | `rm_dump_tire_valley_01` | skitter | lunge → tail | 50 | 12 | 102 | 56 | 1.8s | — |
| 橡胶蚊 | `rm_dump_tire_valley_02` | skitter | fan → spit | 31 | 9 | 130 | 38 | 1.35s | — |
| 钢丝蟹 | `rm_dump_tire_valley_03` | stalk | claw → beam | 62 | 15 | 58 | 50 | 2.4s | — |

### 废钢平场 · `dump_scrap_flat`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 废钢甲虫 | `rm_dump_scrap_flat_01` | skitter | claw → slam | 33 | 9 | 146 | 38 | 1.35s | — |
| 钢筋蛇 | `rm_dump_scrap_flat_02` | stalk | lunge → beam | 38 | 12 | 93 | 56 | 1.5s | — |
| 磁铁蟹 | `rm_dump_scrap_flat_03` | stalk | slam → ring | 70 | 14 | 59 | 50 | 2.2s | — |

### 压块机 · `dump_press`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 压块臂 | `rm_dump_press_01` | stalk | slam → charge | 70 | 12 | 67 | 200 | 2.3s | — |
| 液压蛆 | `rm_dump_press_02` | ambush | spit → lunge | 48 | 12 | 56 | 50 | 2.3s | — |
| 铁屑鼠 | `rm_dump_press_03` | ambush | peck → lunge | 41 | 11 | 113 | 54 | 1.9s | — |

### 守夜棚 · `dump_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 守夜犬 | `rm_dump_shelter_01` | stalk | lunge → peck | 43 | 9 | 116 | 54 | 2s | — |
| 篝火蛾 | `rm_dump_shelter_02` | hop | fan → spore | 30 | 10 | 132 | 46 | 1.4s | 是 |
| 棚影 | `rm_dump_shelter_03` | stalk | claw → slam | 49 | 12 | 81 | 56 | 2.1s | — |

### 焚烧坑 · `dump_pit`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 坑底蛆 | `rm_dump_pit_01` | ambush | spit → slam | 49 | 13 | 58 | 50 | 2.5s | — |
| 焦土犬 | `rm_dump_pit_02` | stalk | lunge → tail | 48 | 9 | 112 | 54 | 1.8s | — |
| 烟柱鬼 | `rm_dump_pit_03` | ambush | ring → beam | 33 | 10 | 82 | 190 | 2.2s | 是 |

### 垃圾山 · `dump_mountain`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 垃圾山蟹 | `rm_dump_mountain_01` | stalk | claw → slam | 70 | 15 | 63 | 50 | 2.2s | — |
| 沼气鬼 | `rm_dump_mountain_02` | float | spore → ring | 32 | 12 | 75 | 190 | 2.1s | 是 |
| 山道鼠 | `rm_dump_mountain_03` | stalk | peck → lunge | 46 | 11 | 111 | 54 | 1.6s | — |

### 吊车轨道 · `dump_crane`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 吊钩蟹 | `rm_dump_crane_01` | stalk | beam → slam | 67 | 15 | 49 | 50 | 2.4s | — |
| 钢缆蛇 | `rm_dump_crane_02` | stalk | lunge → tail | 45 | 12 | 105 | 56 | 1.7s | — |
| 吊车幽灵 | `rm_dump_crane_03` | float | ring → beam | 32 | 11 | 71 | 190 | 2.4s | 是 |

### 深核 · `dump_core`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 辐射蛞蝓 | `rm_dump_core_01` | stalk | spit → ring | 78 | 14 | 46 | 44 | 2.6s | — |
| 控制棒螳螂 | `rm_dump_core_02` | skitter | claw → beam | 36 | 7 | 137 | 38 | 0.95s | — |
| 深核眼 | `rm_dump_core_03` | float | beam → ring | 43 | 10 | 79 | 190 | 2.3s | 是 |

### 界桩 · `dump_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 界桩石像 | `rm_dump_gate_01` | stalk | slam → ring | 94 | 16 | 41 | 56 | 2.8s | — |
| 边检犬 | `rm_dump_gate_02` | stalk | lunge → peck | 45 | 9 | 101 | 54 | 1.8s | — |
| 界旗蛾 | `rm_dump_gate_03` | ambush | fan → spore | 28 | 10 | 125 | 46 | 1.5s | 是 |

### 渗滤池 · `dump_leachate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 渗滤蛭 | `rm_dump_leachate_01` | ambush | spit → slam | 50 | 13 | 56 | 50 | 2.5s | — |
| 黑水鬼 | `rm_dump_leachate_02` | float | spore → ring | 32 | 11 | 77 | 190 | 2.3s | 是 |
| 泵站蟹 | `rm_dump_leachate_03` | stalk | claw → beam | 69 | 13 | 54 | 50 | 2.4s | — |

### 风选带 · `dump_windrow`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 风选蛾 | `rm_dump_windrow_01` | hop | fan → spore | 26 | 9 | 118 | 46 | 1.4s | 是 |
| 纸屑鬼 | `rm_dump_windrow_02` | float | ring → beam | 44 | 11 | 79 | 190 | 2.4s | 是 |
| 风机蟹 | `rm_dump_windrow_03` | stalk | claw → slam | 64 | 14 | 59 | 50 | 2s | — |

### 堆肥区 · `dump_compost`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 堆肥蛆 | `rm_dump_compost_01` | ambush | spore → slam | 46 | 11 | 54 | 50 | 2.5s | — |
| 菌床鬼 | `rm_dump_compost_02` | float | ring → beam | 37 | 11 | 71 | 190 | 2s | 是 |
| 翻堆蟹 | `rm_dump_compost_03` | stalk | claw → lunge | 60 | 13 | 48 | 50 | 2.3s | — |

### 辐射区 · `dump_radio`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 辐射鸦 | `rm_dump_radio_01` | hop | beam → fan | 32 | 10 | 132 | 46 | 1.6s | 是 |
| 铅桶蟹 | `rm_dump_radio_02` | stalk | slam → claw | 67 | 13 | 61 | 50 | 2.4s | — |
| 辐射鬼 | `rm_dump_radio_03` | float | ring → spore | 34 | 12 | 70 | 190 | 2.3s | 是 |

### 垃圾下穿 · `dump_underpass`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 桥洞鼠 | `rm_dump_underpass_01` | stalk | lunge → peck | 44 | 11 | 100 | 54 | 1.6s | — |
| 纸板鬼 | `rm_dump_underpass_02` | float | spore → fan | 35 | 10 | 81 | 190 | 2.1s | 是 |
| 排水鳗 | `rm_dump_underpass_03` | stalk | beam → lunge | 38 | 10 | 100 | 56 | 1.6s | — |

### 边缘 · `dump_edge`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 边缘鬣狗 | `rm_dump_edge_01` | stalk | lunge → peck | 48 | 10 | 109 | 54 | 1.7s | — |
| 瞭望蛾 | `rm_dump_edge_02` | hop | fan → beam | 31 | 8 | 130 | 46 | 1.6s | 是 |
| 界石像 | `rm_dump_edge_03` | stalk | slam → ring | 87 | 15 | 27 | 56 | 2.4s | — |


## 地铁隧道 METRO

### 站台 · `metro_platform`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 站台蛾 | `rm_metro_platform_01` | skitter | fan → spore | 27 | 9 | 120 | 46 | 1.4s | 是 |
| 轨道鳗 | `rm_metro_platform_02` | stalk | beam → lunge | 44 | 10 | 105 | 56 | 1.7s | — |
| 闸机蟹 | `rm_metro_platform_03` | stalk | claw → slam | 63 | 14 | 63 | 50 | 2.3s | — |

### 闸机厅 · `metro_turnstile`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 闸机蛛 | `rm_metro_turnstile_01` | skitter | web → claw | 31 | 9 | 135 | 38 | 1.15s | — |
| 安检眼 | `rm_metro_turnstile_02` | float | beam → ring | 36 | 12 | 68 | 190 | 2.1s | 是 |
| 票亭幽灵 | `rm_metro_turnstile_03` | float | spore → fan | 42 | 10 | 69 | 190 | 2.3s | 是 |

### 值班室 · `metro_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 值班影 | `rm_metro_shelter_01` | stalk | claw → lunge | 48 | 13 | 85 | 56 | 2.1s | — |
| 电炉蛆 | `rm_metro_shelter_02` | ambush | spit → slam | 56 | 11 | 68 | 50 | 2.4s | — |
| 对讲机蟹 | `rm_metro_shelter_03` | stalk | beam → claw | 62 | 13 | 53 | 50 | 2.1s | — |

### 一号隧道 · `metro_tunnel_a`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 隧道鼹 | `rm_metro_tunnel_a_01` | stalk | burrow → lunge | 45 | 9 | 116 | 54 | 2s | — |
| 轨道螳螂 | `rm_metro_tunnel_a_02` | skitter | claw → beam | 32 | 8 | 146 | 38 | 0.95s | 是 |
| 电缆蛇 | `rm_metro_tunnel_a_03` | stalk | lunge → tail | 47 | 12 | 102 | 56 | 1.9s | — |

### 积水段 · `metro_flood`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 积水蛭 | `rm_metro_flood_01` | skitter | spit → slam | 48 | 13 | 54 | 50 | 2.4s | — |
| 防水蟹 | `rm_metro_flood_02` | stalk | claw → beam | 60 | 13 | 48 | 50 | 2.3s | — |
| 积水鬼 | `rm_metro_flood_03` | float | ring → spore | 43 | 11 | 80 | 190 | 2.2s | 是 |

### 扶梯 · `metro_escalator`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 扶梯甲虫 | `rm_metro_escalator_01` | skitter | claw → slam | 28 | 9 | 138 | 38 | 1.35s | — |
| 扶手蛇 | `rm_metro_escalator_02` | stalk | lunge → tail | 39 | 10 | 106 | 56 | 1.7s | — |
| 齿轮眼 | `rm_metro_escalator_03` | float | beam → ring | 34 | 11 | 69 | 190 | 2.2s | 是 |

### 信号室 · `metro_signal`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 信号眼 | `rm_metro_signal_01` | float | beam → ring | 33 | 10 | 73 | 190 | 2.3s | 是 |
| 继电器蛛 | `rm_metro_signal_02` | skitter | web → fan | 27 | 9 | 134 | 38 | 1.35s | — |
| 信号员幽影 | `rm_metro_signal_03` | stalk | slam → spit | 51 | 12 | 89 | 56 | 1.8s | — |

### 换乘通道 · `metro_crossing`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 换乘蛾 | `rm_metro_crossing_01` | hop | fan → spore | 29 | 10 | 128 | 46 | 1.4s | 是 |
| 通道蟹 | `rm_metro_crossing_02` | stalk | claw → slam | 68 | 15 | 54 | 50 | 2.3s | — |
| 指示牌鬼 | `rm_metro_crossing_03` | float | beam → spore | 33 | 12 | 77 | 190 | 2.3s | 是 |

### 车厢段 · `metro_car`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 车厢蛾 | `rm_metro_car_01` | hop | fan → spore | 25 | 9 | 122 | 46 | 1.6s | 是 |
| 吊环蛇 | `rm_metro_car_02` | stalk | lunge → tail | 39 | 11 | 92 | 56 | 1.7s | — |
| 行李架蟹 | `rm_metro_car_03` | stalk | claw → slam | 68 | 13 | 52 | 50 | 2.2s | — |

### 集水井 · `metro_sump`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 集水蛭 | `rm_metro_sump_01` | ambush | spit → slam | 46 | 11 | 65 | 50 | 2.1s | — |
| 水泵蟹 | `rm_metro_sump_02` | stalk | claw → beam | 65 | 15 | 58 | 50 | 2.3s | — |
| 井底鬼 | `rm_metro_sump_03` | float | ring → spore | 42 | 10 | 73 | 190 | 2s | 是 |

### 通风井 · `metro_vent`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 通风蛾 | `rm_metro_vent_01` | hop | fan → beam | 24 | 10 | 120 | 46 | 1.4s | 是 |
| 风管蛇 | `rm_metro_vent_02` | stalk | lunge → tail | 43 | 11 | 105 | 56 | 1.5s | — |
| 灰尘鬼 | `rm_metro_vent_03` | skitter | ring → spore | 36 | 10 | 69 | 190 | 2.3s | 是 |

### 车库 · `metro_depot`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 车库蟹 | `rm_metro_depot_01` | stalk | claw → slam | 67 | 13 | 51 | 50 | 2s | — |
| 检修蛇 | `rm_metro_depot_02` | stalk | lunge → beam | 43 | 10 | 91 | 56 | 1.8s | — |
| 车头幽灵 | `rm_metro_depot_03` | float | ring → beam | 37 | 12 | 67 | 190 | 2.2s | 是 |

### 拱顶大厅 · `metro_arch`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 拱顶蛾 | `rm_metro_arch_01` | hop | fan → spore | 31 | 9 | 127 | 46 | 1.7s | 是 |
| 石柱像 | `rm_metro_arch_02` | stalk | slam → ring | 91 | 17 | 33 | 56 | 2.7s | — |
| 壁画鬼 | `rm_metro_arch_03` | float | spore → beam | 41 | 12 | 66 | 190 | 2.3s | 是 |

### 深层隧道 · `metro_deep`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 深层蠕虫 | `rm_metro_deep_01` | ambush | burrow → slam | 51 | 11 | 61 | 50 | 2.1s | — |
| 轨道螳螂 | `rm_metro_deep_02` | skitter | claw → beam | 27 | 9 | 139 | 38 | 1.05s | — |
| 深隧眼 | `rm_metro_deep_03` | float | beam → ring | 40 | 10 | 77 | 190 | 2s | 是 |

### 终点站 · `metro_terminus`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 终点蛾 | `rm_metro_terminus_01` | hop | fan → spore | 36 | 10 | 129 | 46 | 1.7s | 是 |
| 缓冲器蟹 | `rm_metro_terminus_02` | stalk | slam → claw | 66 | 14 | 59 | 50 | 2.2s | — |
| 站台幽灵 | `rm_metro_terminus_03` | float | spore → ring | 44 | 11 | 67 | 190 | 2.1s | 是 |

### 区界 · `metro_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 区界石像 | `rm_metro_gate_01` | stalk | slam → ring | 90 | 15 | 35 | 56 | 2.8s | — |
| 区界犬 | `rm_metro_gate_02` | stalk | lunge → peck | 52 | 11 | 110 | 54 | 1.6s | — |
| 区界蛾 | `rm_metro_gate_03` | hop | fan → spore | 25 | 9 | 120 | 46 | 1.6s | 是 |


## 废弃医院 HOSPITAL

### 门厅 · `hospital_lobby`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 门厅蛾 | `rm_hospital_lobby_01` | ambush | fan → spore | 25 | 10 | 125 | 46 | 1.7s | 是 |
| 轮椅蟹 | `rm_hospital_lobby_02` | stalk | claw → slam | 64 | 13 | 53 | 50 | 2.1s | — |
| 导诊幽影 | `rm_hospital_lobby_03` | stalk | slam → beam | 55 | 12 | 81 | 56 | 1.8s | — |

### 分诊台 · `hospital_triage`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 病历蛾 | `rm_hospital_triage_01` | ambush | fan → spore | 35 | 10 | 119 | 46 | 1.6s | 是 |
| 血压蛛 | `rm_hospital_triage_02` | skitter | web → claw | 37 | 8 | 135 | 38 | 1.05s | — |
| 分诊鬼 | `rm_hospital_triage_03` | float | beam → spore | 39 | 11 | 70 | 190 | 2.2s | 是 |

### 护士站 · `hospital_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 护士影 | `rm_hospital_shelter_01` | stalk | claw → lunge | 55 | 13 | 84 | 56 | 2.2s | — |
| 药车蟹 | `rm_hospital_shelter_02` | stalk | beam → slam | 69 | 14 | 60 | 50 | 2.3s | — |
| 保温蛆 | `rm_hospital_shelter_03` | ambush | spit → lunge | 52 | 13 | 59 | 50 | 2.5s | — |

### 甲病房 · `hospital_ward_a`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 病床蛾 | `rm_hospital_ward_a_01` | hop | fan → spore | 36 | 9 | 131 | 46 | 1.4s | 是 |
| 输液蛭 | `rm_hospital_ward_a_02` | ambush | spit → lunge | 55 | 11 | 70 | 50 | 2.5s | — |
| 屏风鬼 | `rm_hospital_ward_a_03` | float | beam → ring | 37 | 10 | 82 | 190 | 2.1s | 是 |

### 楼梯井 · `hospital_stair`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 楼梯蟹 | `rm_hospital_stair_01` | stalk | claw → slam | 60 | 15 | 50 | 50 | 2.4s | — |
| 扶手蛇 | `rm_hospital_stair_02` | stalk | lunge → tail | 39 | 10 | 98 | 56 | 1.8s | — |
| 楼梯井鬼 | `rm_hospital_stair_03` | float | ring → beam | 40 | 12 | 68 | 190 | 2.4s | 是 |

### 手术室 · `hospital_surgery`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 手术蛾 | `rm_hospital_surgery_01` | hop | fan → beam | 28 | 9 | 116 | 46 | 1.3s | 是 |
| 器械蛛 | `rm_hospital_surgery_02` | skitter | web → claw | 29 | 7 | 132 | 38 | 1.15s | — |
| 无影灯鬼 | `rm_hospital_surgery_03` | float | ring → beam | 33 | 10 | 66 | 190 | 2.3s | 是 |

### 药房 · `hospital_pharmacy`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 药瓶蛛 | `rm_hospital_pharmacy_01` | skitter | web → spit | 36 | 8 | 144 | 38 | 1.05s | — |
| 处方蛾 | `rm_hospital_pharmacy_02` | skitter | fan → spore | 31 | 8 | 125 | 46 | 1.6s | 是 |
| 药柜佝偻 | `rm_hospital_pharmacy_03` | stalk | claw → slam | 52 | 13 | 95 | 56 | 2s | — |

### 太平间 · `hospital_morgue`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 尸柜鬼 | `rm_hospital_morgue_01` | float | ring → spore | 39 | 12 | 73 | 190 | 2.1s | 是 |
| 白布蛇 | `rm_hospital_morgue_02` | stalk | lunge → tail | 41 | 10 | 92 | 56 | 1.8s | — |
| 解剖蟹 | `rm_hospital_morgue_03` | stalk | claw → slam | 61 | 14 | 56 | 50 | 2.2s | — |

### 中庭 · `hospital_atrium`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 中庭蛾 | `rm_hospital_atrium_01` | hop | fan → spore | 24 | 8 | 124 | 46 | 1.6s | 是 |
| 喷泉蛭 | `rm_hospital_atrium_02` | ambush | spit → slam | 46 | 11 | 62 | 50 | 2.4s | — |
| 玻璃顶鬼 | `rm_hospital_atrium_03` | float | beam → ring | 41 | 11 | 77 | 190 | 2.4s | 是 |

### 放射科 · `hospital_xray`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 放射鬼 | `rm_hospital_xray_01` | float | beam → ring | 42 | 10 | 73 | 190 | 2.3s | 是 |
| 胶片蛾 | `rm_hospital_xray_02` | hop | fan → spore | 25 | 8 | 126 | 46 | 1.3s | 是 |
| 铅门蟹 | `rm_hospital_xray_03` | stalk | slam → claw | 64 | 15 | 57 | 50 | 2.1s | — |

### 重症室 · `hospital_icu`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 监护眼 | `rm_hospital_icu_01` | float | beam → ring | 44 | 12 | 80 | 190 | 2.1s | 是 |
| 呼吸机蟹 | `rm_hospital_icu_02` | stalk | claw → slam | 59 | 15 | 48 | 50 | 2.3s | — |
| 输液泵蛇 | `rm_hospital_icu_03` | ambush | lunge → beam | 48 | 10 | 106 | 56 | 1.8s | — |

### 长廊 · `hospital_corridor`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 长廊蛾 | `rm_hospital_corridor_01` | hop | fan → spore | 30 | 9 | 124 | 46 | 1.5s | 是 |
| 病历车蟹 | `rm_hospital_corridor_02` | stalk | claw → beam | 69 | 15 | 60 | 50 | 2.1s | — |
| 走廊影 | `rm_hospital_corridor_03` | ambush | ring → spore | 41 | 12 | 66 | 190 | 2.1s | 是 |

### 化验室 · `hospital_lab`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 培养蛆 | `rm_hospital_lab_01` | ambush | spore → slam | 50 | 11 | 69 | 50 | 2.5s | — |
| 显微镜蟹 | `rm_hospital_lab_02` | stalk | beam → claw | 59 | 13 | 64 | 50 | 2.4s | — |
| 样本蛾 | `rm_hospital_lab_03` | hop | fan → spore | 35 | 10 | 123 | 46 | 1.6s | 是 |

### 锅炉房 · `hospital_boiler`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 锅炉炎鬼 | `rm_hospital_boiler_01` | float | spore → beam | 39 | 10 | 82 | 190 | 2.1s | 是 |
| 压力表蟹 | `rm_hospital_boiler_02` | stalk | claw → slam | 70 | 14 | 55 | 50 | 2.3s | — |
| 煤渣蛆 | `rm_hospital_boiler_03` | ambush | spit → lunge | 58 | 11 | 70 | 50 | 2.5s | — |

### 塌顶 · `hospital_roof`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 屋顶鹫 | `rm_hospital_roof_01` | hop | fan → beam | 35 | 10 | 124 | 46 | 1.4s | 是 |
| 水箱漂影 | `rm_hospital_roof_02` | skitter | spore → ring | 35 | 11 | 73 | 190 | 2.2s | 是 |
| 瓦砾蟹 | `rm_hospital_roof_03` | stalk | claw → slam | 62 | 13 | 53 | 50 | 2.4s | — |

### 区界 · `hospital_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 区界石像 | `rm_hospital_gate_01` | stalk | slam → ring | 88 | 17 | 32 | 56 | 2.6s | — |
| 区界犬 | `rm_hospital_gate_02` | stalk | lunge → peck | 51 | 9 | 101 | 54 | 2s | — |
| 区界蛾 | `rm_hospital_gate_03` | hop | fan → spore | 36 | 10 | 126 | 46 | 1.6s | 是 |


## 锈港 PORT

### 码头 · `port_dock`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 码头蟹 | `rm_port_dock_01` | stalk | claw → slam | 68 | 14 | 49 | 50 | 2s | — |
| 系缆蟒 | `rm_port_dock_02` | skitter | lunge → tail | 45 | 12 | 92 | 56 | 1.6s | — |
| 码头鸥 | `rm_port_dock_03` | ambush | peck → fan | 32 | 10 | 127 | 46 | 1.4s | 是 |

### 值班棚 · `port_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 值班影 | `rm_port_shelter_01` | skitter | claw → lunge | 56 | 12 | 82 | 56 | 2.2s | — |
| 电炉蛆 | `rm_port_shelter_02` | ambush | spit → slam | 53 | 12 | 55 | 50 | 2.2s | — |
| 对讲机蟹 | `rm_port_shelter_03` | stalk | beam → claw | 61 | 13 | 64 | 50 | 2.1s | — |

### 淤泥滩 · `port_silt`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 淤泥蛭 | `rm_port_silt_01` | skitter | spit → slam | 50 | 13 | 64 | 50 | 2.5s | — |
| 贝壳蟹 | `rm_port_silt_02` | stalk | claw → beam | 70 | 14 | 57 | 50 | 2.2s | — |
| 滩涂鹭 | `rm_port_silt_03` | hop | peck → lunge | 24 | 8 | 120 | 46 | 1.4s | 是 |

### 仓库 · `port_warehouse`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 仓库蟹 | `rm_port_warehouse_01` | stalk | claw → slam | 61 | 14 | 55 | 50 | 2s | — |
| 货架潜行者 | `rm_port_warehouse_02` | stalk | claw → lunge | 55 | 12 | 86 | 56 | 2s | — |
| 吊扇魇 | `rm_port_warehouse_03` | float | ring → beam | 37 | 10 | 73 | 190 | 2.3s | 是 |

### 龙门吊 · `port_crane`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 吊钩蟹 | `rm_port_crane_01` | stalk | beam → slam | 68 | 13 | 49 | 50 | 2.1s | — |
| 钢缆蛇 | `rm_port_crane_02` | stalk | lunge → tail | 38 | 10 | 94 | 56 | 1.6s | — |
| 吊车幽灵 | `rm_port_crane_03` | ambush | ring → beam | 44 | 10 | 77 | 190 | 2.1s | 是 |

### 灯塔 · `port_lighthouse`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 灯塔蛾 | `rm_port_lighthouse_01` | ambush | beam → ring | 24 | 9 | 128 | 46 | 1.3s | 是 |
| 透镜眼 | `rm_port_lighthouse_02` | float | beam → ring | 35 | 12 | 79 | 190 | 2.3s | 是 |
| 灯塔蟹 | `rm_port_lighthouse_03` | stalk | claw → slam | 61 | 13 | 59 | 50 | 2.2s | — |

### 搁浅船体 · `port_hull`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 船体蟹 | `rm_port_hull_01` | skitter | claw → slam | 62 | 15 | 51 | 50 | 2.3s | — |
| 锚链蛇 | `rm_port_hull_02` | stalk | lunge → tail | 46 | 10 | 97 | 56 | 1.6s | — |
| 舵轮鬼 | `rm_port_hull_03` | ambush | ring → beam | 36 | 10 | 70 | 190 | 2.1s | 是 |

### 货柜场 · `port_container_yard`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 货柜蟹 | `rm_port_container_yard_01` | stalk | claw → slam | 65 | 13 | 53 | 50 | 2.3s | — |
| 锁杆螳螂 | `rm_port_container_yard_02` | skitter | claw → lunge | 34 | 7 | 139 | 38 | 1.25s | — |
| 货柜幽灵 | `rm_port_container_yard_03` | skitter | ring → beam | 33 | 11 | 67 | 190 | 2.3s | 是 |

### 鱼市 · `port_fishmarket`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 鱼市蛾 | `rm_port_fishmarket_01` | hop | fan → spore | 35 | 8 | 127 | 46 | 1.4s | 是 |
| 冰柜蟹 | `rm_port_fishmarket_02` | stalk | claw → slam | 67 | 14 | 56 | 50 | 2.4s | — |
| 鱼摊蛆 | `rm_port_fishmarket_03` | ambush | spit → lunge | 48 | 11 | 66 | 50 | 2.5s | — |

### 油料库 · `port_fuel`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 油罐蟹 | `rm_port_fuel_01` | stalk | claw → slam | 69 | 15 | 61 | 50 | 2.2s | — |
| 油泵蛇 | `rm_port_fuel_02` | stalk | beam → lunge | 46 | 11 | 93 | 56 | 1.8s | — |
| 油气鬼 | `rm_port_fuel_03` | float | ring → spore | 39 | 12 | 71 | 190 | 2.4s | 是 |

### 海关 · `port_customs`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 海关蛾 | `rm_port_customs_01` | hop | fan → spore | 26 | 10 | 118 | 46 | 1.5s | 是 |
| 检查台蟹 | `rm_port_customs_02` | stalk | claw → slam | 68 | 14 | 50 | 50 | 2.2s | — |
| 关员幽影 | `rm_port_customs_03` | stalk | beam → spit | 53 | 12 | 90 | 56 | 2.1s | — |

### 防波堤 · `port_breakwater`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 防波蟹 | `rm_port_breakwater_01` | stalk | claw → slam | 61 | 14 | 64 | 50 | 2.3s | — |
| 堤石像 | `rm_port_breakwater_02` | stalk | slam → ring | 90 | 16 | 40 | 56 | 2.7s | — |
| 海草蛇 | `rm_port_breakwater_03` | stalk | lunge → tail | 43 | 10 | 97 | 56 | 1.8s | — |

### 船台 · `port_slipway`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 船台蟹 | `rm_port_slipway_01` | stalk | claw → slam | 60 | 13 | 56 | 50 | 2.1s | — |
| 龙骨蛇 | `rm_port_slipway_02` | stalk | lunge → beam | 49 | 11 | 93 | 56 | 1.7s | — |
| 焊渣鬼 | `rm_port_slipway_03` | float | ring → spore | 40 | 12 | 82 | 190 | 2.2s | 是 |

### 无线电塔 · `port_radio`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 电波蛾 | `rm_port_radio_01` | hop | beam → ring | 32 | 9 | 124 | 46 | 1.3s | 是 |
| 天线蛇 | `rm_port_radio_02` | stalk | lunge → fan | 45 | 11 | 103 | 56 | 1.8s | — |
| 电台鬼 | `rm_port_radio_03` | float | spore → beam | 32 | 11 | 66 | 190 | 2.3s | 是 |

### 锚地 · `port_anchor`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 锚链蟹 | `rm_port_anchor_01` | stalk | claw → slam | 69 | 14 | 48 | 50 | 2.3s | — |
| 锚地鳗 | `rm_port_anchor_02` | stalk | beam → lunge | 42 | 12 | 91 | 56 | 1.8s | — |
| 沉船鬼 | `rm_port_anchor_03` | float | ring → spore | 35 | 11 | 78 | 190 | 2.1s | 是 |

### 区界 · `port_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 区界石像 | `rm_port_gate_01` | stalk | slam → ring | 82 | 16 | 35 | 56 | 2.7s | — |
| 区界犬 | `rm_port_gate_02` | stalk | lunge → peck | 45 | 10 | 104 | 54 | 1.9s | — |
| 区界蛾 | `rm_port_gate_03` | hop | fan → spore | 25 | 10 | 131 | 46 | 1.4s | 是 |


## 边境 FRONTIER

### 边境驿站 · `frontier_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 驿站守夜人 | `rm_frontier_shelter_01` | stalk | claw → slam | 56 | 11 | 86 | 56 | 2.1s | — |
| 边境犬 | `rm_frontier_shelter_02` | stalk | lunge → peck | 40 | 11 | 115 | 54 | 1.7s | — |
| 篝火蛾 | `rm_frontier_shelter_03` | hop | fan → spore | 36 | 9 | 119 | 46 | 1.4s | 是 |

### 失落的数据中心 · `frontier_data_center`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 数据蛾 | `rm_frontier_data_center_01` | skitter | fan → beam | 36 | 8 | 130 | 46 | 1.4s | 是 |
| 机柜蟹 | `rm_frontier_data_center_02` | stalk | claw → slam | 66 | 14 | 51 | 50 | 2.3s | — |
| 数据幽灵 | `rm_frontier_data_center_03` | float | ring → spore | 39 | 11 | 72 | 190 | 2.4s | 是 |

### 机器人工厂 · `frontier_robot_factory`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 装配臂 | `rm_frontier_robot_factory_01` | orbit | slam → beam | 63 | 13 | 68 | 200 | 2.3s | — |
| 骨架蟹 | `rm_frontier_robot_factory_02` | stalk | claw → lunge | 70 | 15 | 48 | 50 | 2.3s | — |
| 伺服蛾 | `rm_frontier_robot_factory_03` | skitter | fan → beam | 30 | 7 | 142 | 38 | 1.25s | — |

### 航天基地 · `frontier_spaceport`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 航天鬼 | `rm_frontier_spaceport_01` | float | beam → ring | 35 | 12 | 79 | 190 | 2.4s | 是 |
| 发射架蟹 | `rm_frontier_spaceport_02` | stalk | claw → slam | 65 | 15 | 49 | 50 | 2.3s | — |
| 雷达蛾 | `rm_frontier_spaceport_03` | hop | fan → beam | 36 | 8 | 122 | 46 | 1.4s | 是 |

### 太阳能中心 · `frontier_solar_center`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 光伏蛾 | `rm_frontier_solar_center_01` | hop | beam → fan | 36 | 9 | 121 | 46 | 1.4s | 是 |
| 电池蟹 | `rm_frontier_solar_center_02` | stalk | slam → claw | 61 | 15 | 55 | 50 | 2.2s | — |
| 阳光鬼 | `rm_frontier_solar_center_03` | float | ring → beam | 37 | 11 | 68 | 190 | 2.2s | 是 |

### 蓄水大坝 · `frontier_dam`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 大坝蟹 | `rm_frontier_dam_01` | stalk | claw → slam | 58 | 15 | 57 | 50 | 2.1s | — |
| 水轮蛇 | `rm_frontier_dam_02` | stalk | beam → lunge | 47 | 11 | 93 | 56 | 1.9s | — |
| 泄洪鬼 | `rm_frontier_dam_03` | float | ring → beam | 33 | 11 | 78 | 190 | 2.4s | 是 |

### 跨江大桥 · `frontier_bridge`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 斜拉蛛 | `rm_frontier_bridge_01` | skitter | web → beam | 32 | 8 | 144 | 38 | 1.35s | 是 |
| 桥塔像 | `rm_frontier_bridge_02` | stalk | slam → ring | 92 | 17 | 36 | 56 | 2.6s | — |
| 桥面鬼 | `rm_frontier_bridge_03` | float | ring → spore | 39 | 12 | 75 | 190 | 2.4s | 是 |

### 高速公路 · `frontier_highway`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 公路飙客 | `rm_frontier_highway_01` | stalk | charge → lunge | 56 | 12 | 82 | 56 | 2.1s | — |
| 路牌蛾 | `rm_frontier_highway_02` | hop | fan → beam | 27 | 9 | 118 | 46 | 1.4s | 是 |
| 隔离墩蟹 | `rm_frontier_highway_03` | stalk | slam → claw | 63 | 13 | 52 | 50 | 2s | — |

### 摩天大楼 · `frontier_skyscraper`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 幕墙蛾 | `rm_frontier_skyscraper_01` | hop | fan → beam | 33 | 8 | 124 | 46 | 1.6s | 是 |
| 电梯鬼 | `rm_frontier_skyscraper_02` | float | ring → slam | 34 | 11 | 69 | 190 | 2s | 是 |
| 办公椅蟹 | `rm_frontier_skyscraper_03` | stalk | claw → lunge | 70 | 14 | 57 | 50 | 2.3s | — |

### 体育中心 · `frontier_stadium`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 看台蛾 | `rm_frontier_stadium_01` | hop | fan → spore | 27 | 9 | 120 | 46 | 1.7s | 是 |
| 记分牌鬼 | `rm_frontier_stadium_02` | float | beam → ring | 44 | 10 | 79 | 190 | 2s | 是 |
| 球场蟹 | `rm_frontier_stadium_03` | stalk | claw → slam | 61 | 14 | 58 | 50 | 2.4s | — |

### 战场 · `frontier_battlefield`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 战场犬 | `rm_frontier_battlefield_01` | stalk | lunge → peck | 51 | 10 | 104 | 54 | 1.9s | — |
| 坦克蟹 | `rm_frontier_battlefield_02` | stalk | slam → beam | 59 | 13 | 50 | 50 | 2.2s | — |
| 硝烟鬼 | `rm_frontier_battlefield_03` | float | ring → spore | 35 | 12 | 71 | 190 | 2.3s | 是 |

### 人类救助中心 · `frontier_rescue_center`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 救助蛾 | `rm_frontier_rescue_center_01` | hop | fan → spore | 28 | 10 | 121 | 46 | 1.5s | 是 |
| 担架蟹 | `rm_frontier_rescue_center_02` | stalk | claw → lunge | 59 | 15 | 63 | 50 | 2.3s | — |
| 救助幽影 | `rm_frontier_rescue_center_03` | stalk | beam → spit | 50 | 12 | 81 | 56 | 1.8s | — |

### 机器人集结场 · `frontier_robot_rally`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 集结甲虫 | `rm_frontier_robot_rally_01` | stalk | claw → slam | 63 | 13 | 62 | 200 | 2.5s | — |
| 充电蟹 | `rm_frontier_robot_rally_02` | stalk | beam → claw | 65 | 14 | 59 | 50 | 2.2s | — |
| 指挥眼 | `rm_frontier_robot_rally_03` | float | beam → ring | 42 | 11 | 82 | 190 | 2.1s | 是 |

### 风暴肆虐农场 · `frontier_storm_farm`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 风暴蛾 | `rm_frontier_storm_farm_01` | hop | fan → beam | 26 | 10 | 125 | 46 | 1.7s | 是 |
| 风车蟹 | `rm_frontier_storm_farm_02` | stalk | claw → slam | 63 | 13 | 58 | 50 | 2.3s | — |
| 谷仓蛇 | `rm_frontier_storm_farm_03` | stalk | lunge → tail | 42 | 12 | 102 | 56 | 1.7s | — |

### 酸雨盆地 · `frontier_acid_basin`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 酸池蛭 | `rm_frontier_acid_basin_01` | ambush | spit → slam | 52 | 13 | 66 | 50 | 2.2s | — |
| 酸蚀蟹 | `rm_frontier_acid_basin_02` | stalk | claw → beam | 70 | 13 | 59 | 50 | 2.1s | — |
| 酸雾鬼 | `rm_frontier_acid_basin_03` | float | ring → spore | 35 | 11 | 77 | 190 | 2.1s | 是 |

### 腐败雨林 · `frontier_rot_jungle`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 腐林螳螂 | `rm_frontier_rot_jungle_01` | skitter | claw → lunge | 35 | 8 | 133 | 38 | 1.25s | — |
| 藤蔓蛇 | `rm_frontier_rot_jungle_02` | stalk | tail → lunge | 38 | 12 | 102 | 56 | 1.9s | — |
| 腐菌鬼 | `rm_frontier_rot_jungle_03` | float | ring → spore | 33 | 12 | 71 | 190 | 2.4s | 是 |

### 人类教堂 · `frontier_church`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 圣像像 | `rm_frontier_church_01` | stalk | slam → beam | 83 | 17 | 41 | 56 | 2.7s | — |
| 烛火蛾 | `rm_frontier_church_02` | skitter | fan → spore | 33 | 8 | 126 | 46 | 1.4s | 是 |
| 钟楼蝠 | `rm_frontier_church_03` | hop | ring → lunge | 27 | 8 | 122 | 46 | 1.4s | 是 |

### AI起源之地 · `frontier_ai_origin`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| AI核心眼 | `rm_frontier_ai_origin_01` | skitter | beam → ring | 42 | 11 | 71 | 190 | 2.3s | 是 |
| 数据柱蟹 | `rm_frontier_ai_origin_02` | stalk | claw → slam | 67 | 13 | 48 | 50 | 2.1s | — |
| 逻辑鬼 | `rm_frontier_ai_origin_03` | float | spore → beam | 37 | 11 | 81 | 190 | 2.2s | 是 |

### 病毒研究室 · `frontier_virus_lab`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 病毒蛆 | `rm_frontier_virus_lab_01` | ambush | spore → slam | 50 | 12 | 70 | 50 | 2.2s | — |
| 培养罐蟹 | `rm_frontier_virus_lab_02` | stalk | claw → beam | 68 | 14 | 59 | 50 | 2.3s | — |
| 防护服客 | `rm_frontier_virus_lab_03` | stalk | beam → lunge | 52 | 12 | 95 | 56 | 2.1s | — |

### 人工智能研究室 · `frontier_ai_lab`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 机械臂 | `rm_frontier_ai_lab_01` | orbit | slam → beam | 70 | 13 | 69 | 200 | 2.2s | — |
| 芯片蛛 | `rm_frontier_ai_lab_02` | skitter | web → beam | 38 | 9 | 136 | 38 | 1.25s | — |
| AI幽影 | `rm_frontier_ai_lab_03` | float | ring → spore | 44 | 12 | 66 | 190 | 2.1s | 是 |

### 外星人研究中心 · `frontier_alien_center`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 外星眼 | `rm_frontier_alien_center_01` | float | beam → ring | 40 | 11 | 74 | 190 | 2.2s | 是 |
| 培养舱蟹 | `rm_frontier_alien_center_02` | stalk | claw → slam | 61 | 13 | 49 | 50 | 2.3s | — |
| 外星鬼 | `rm_frontier_alien_center_03` | float | spore → beam | 36 | 11 | 66 | 190 | 2s | 是 |

### 军事基地 · `frontier_military_base`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 基地卫兵 | `rm_frontier_military_base_01` | orbit | beam → slam | 72 | 12 | 61 | 200 | 2.4s | — |
| 军械蟹 | `rm_frontier_military_base_02` | stalk | claw → lunge | 58 | 13 | 62 | 50 | 2.3s | — |
| 雷达蛾 | `rm_frontier_military_base_03` | skitter | fan → beam | 27 | 9 | 125 | 46 | 1.4s | 是 |


## 旧城区 OLD TOWN

### 旧城营地 · `oldtown_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 营地守夜人 | `rm_oldtown_shelter_01` | stalk | claw → slam | 55 | 11 | 95 | 56 | 2.1s | — |
| 灶灰蛆 | `rm_oldtown_shelter_02` | ambush | spore → lunge | 55 | 12 | 60 | 50 | 2.5s | — |
| 哨灯蛾 | `rm_oldtown_shelter_03` | hop | beam → fan | 33 | 8 | 119 | 46 | 1.6s | 是 |

### 旧邮局 · `oldtown_post`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 邮包蛾 | `rm_oldtown_post_01` | hop | fan → spore | 29 | 10 | 128 | 46 | 1.6s | 是 |
| 邮筒蟹 | `rm_oldtown_post_02` | stalk | claw → slam | 63 | 13 | 61 | 50 | 2.1s | — |
| 邮差幽影 | `rm_oldtown_post_03` | stalk | beam → lunge | 53 | 12 | 89 | 56 | 1.9s | — |

### 市立图书馆 · `oldtown_library`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 书页蛾 | `rm_oldtown_library_01` | hop | fan → spore | 27 | 8 | 127 | 46 | 1.5s | 是 |
| 书架蟹 | `rm_oldtown_library_02` | skitter | claw → slam | 70 | 14 | 64 | 50 | 2s | — |
| 图书馆鬼 | `rm_oldtown_library_03` | float | ring → beam | 32 | 11 | 68 | 190 | 2.1s | 是 |

### 第九中学 · `oldtown_school`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 课桌蛛 | `rm_oldtown_school_01` | skitter | web → spit | 36 | 9 | 144 | 38 | 1.05s | 是 |
| 走廊粉笔鬼 | `rm_oldtown_school_02` | float | fan → spore | 33 | 12 | 77 | 190 | 2.4s | 是 |
| 操场犬 | `rm_oldtown_school_03` | stalk | lunge → peck | 49 | 10 | 102 | 54 | 1.9s | — |

### 理工大学 · `oldtown_university`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 论文蛾 | `rm_oldtown_university_01` | hop | fan → spore | 24 | 8 | 117 | 46 | 1.3s | 是 |
| 实验台蟹 | `rm_oldtown_university_02` | ambush | claw → slam | 58 | 13 | 55 | 50 | 2.1s | — |
| 校园幽灵 | `rm_oldtown_university_03` | stalk | beam → ring | 49 | 12 | 91 | 56 | 2s | — |

### 造纸厂 · `oldtown_papermill`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 纸浆蛆 | `rm_oldtown_papermill_01` | ambush | spit → slam | 54 | 11 | 62 | 50 | 2.1s | — |
| 纸卷蛾 | `rm_oldtown_papermill_02` | hop | fan → beam | 25 | 8 | 125 | 46 | 1.3s | 是 |
| 造纸机蟹 | `rm_oldtown_papermill_03` | stalk | claw → slam | 63 | 13 | 56 | 50 | 2.1s | — |

### 考古遗迹 · `oldtown_ruins`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 遗迹石像 | `rm_oldtown_ruins_01` | stalk | slam → ring | 83 | 16 | 42 | 56 | 2.6s | — |
| 陶罐蟹 | `rm_oldtown_ruins_02` | stalk | claw → slam | 70 | 14 | 53 | 50 | 2.3s | — |
| 考古幽影 | `rm_oldtown_ruins_03` | float | beam → spore | 41 | 10 | 66 | 190 | 2.1s | 是 |

### 废弃监狱 · `oldtown_prison`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 囚犯幽影 | `rm_oldtown_prison_01` | stalk | claw → lunge | 53 | 12 | 80 | 56 | 1.8s | — |
| 铁栏蟹 | `rm_oldtown_prison_02` | stalk | slam → claw | 64 | 13 | 57 | 50 | 2.4s | — |
| 岗楼蛾 | `rm_oldtown_prison_03` | hop | beam → fan | 25 | 8 | 123 | 46 | 1.5s | 是 |

### 无人旅馆 · `oldtown_hotel`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 旅馆蛾 | `rm_oldtown_hotel_01` | hop | fan → spore | 33 | 8 | 122 | 46 | 1.4s | 是 |
| 行李车蟹 | `rm_oldtown_hotel_02` | stalk | claw → slam | 70 | 14 | 59 | 50 | 2s | — |
| 客房鬼 | `rm_oldtown_hotel_03` | float | ring → beam | 37 | 10 | 76 | 190 | 2.2s | 是 |

### 旧电影院 · `oldtown_cinema`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 银幕蛾 | `rm_oldtown_cinema_01` | hop | fan → beam | 33 | 8 | 129 | 46 | 1.7s | 是 |
| 座椅蟹 | `rm_oldtown_cinema_02` | stalk | claw → slam | 69 | 13 | 51 | 50 | 2s | — |
| 放映鬼 | `rm_oldtown_cinema_03` | float | ring → spore | 38 | 12 | 72 | 190 | 2.3s | 是 |

### 旧码头 · `oldtown_dock`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 码头蟹 | `rm_oldtown_dock_01` | stalk | claw → slam | 66 | 13 | 61 | 50 | 2.2s | — |
| 系缆蛇 | `rm_oldtown_dock_02` | stalk | lunge → tail | 45 | 10 | 94 | 56 | 1.7s | — |
| 码头鸥 | `rm_oldtown_dock_03` | hop | peck → fan | 29 | 10 | 119 | 46 | 1.3s | 是 |

### 断光灯塔 · `oldtown_lighthouse`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 灯塔蛾 | `rm_oldtown_lighthouse_01` | hop | beam → ring | 35 | 9 | 128 | 46 | 1.6s | 是 |
| 透镜眼 | `rm_oldtown_lighthouse_02` | float | beam → ring | 32 | 12 | 68 | 190 | 2.1s | 是 |
| 灯塔蟹 | `rm_oldtown_lighthouse_03` | stalk | claw → slam | 68 | 13 | 56 | 50 | 2.4s | — |

### 造船厂 · `oldtown_shipyard`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 船台蟹 | `rm_oldtown_shipyard_01` | stalk | claw → slam | 59 | 14 | 48 | 50 | 2.3s | — |
| 龙骨蛇 | `rm_oldtown_shipyard_02` | stalk | lunge → beam | 48 | 10 | 100 | 56 | 1.8s | — |
| 焊渣鬼 | `rm_oldtown_shipyard_03` | float | ring → spore | 41 | 11 | 79 | 190 | 2.2s | 是 |

### 干船坞 · `oldtown_drydock`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 坞门蟹 | `rm_oldtown_drydock_01` | stalk | slam → claw | 61 | 13 | 50 | 50 | 2.1s | — |
| 船底蛇 | `rm_oldtown_drydock_02` | stalk | lunge → tail | 43 | 11 | 93 | 56 | 1.9s | — |
| 干坞鬼 | `rm_oldtown_drydock_03` | float | ring → beam | 33 | 10 | 82 | 190 | 2.4s | 是 |

### 变电站 · `oldtown_substation`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 电弧鬼 | `rm_oldtown_substation_01` | float | beam → ring | 40 | 10 | 66 | 190 | 2s | 是 |
| 电缆蟒 | `rm_oldtown_substation_02` | stalk | lunge → tail | 44 | 11 | 96 | 56 | 1.6s | — |
| 配电蟹 | `rm_oldtown_substation_03` | stalk | claw → slam | 59 | 15 | 58 | 50 | 2.1s | — |

### 旧城界门 · `oldtown_gate`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 城门石像 | `rm_oldtown_gate_01` | stalk | slam → ring | 94 | 17 | 36 | 56 | 2.8s | — |
| 界门犬 | `rm_oldtown_gate_02` | stalk | lunge → peck | 50 | 9 | 114 | 54 | 1.9s | — |
| 城楼蛾 | `rm_oldtown_gate_03` | hop | fan → spore | 28 | 9 | 129 | 46 | 1.5s | 是 |


## 地下世界 UNDERWORLD

### 地底驿站 · `underworld_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 地底守夜人 | `rm_underworld_shelter_01` | stalk | claw → slam | 46 | 12 | 83 | 56 | 1.9s | — |
| 灶灰蛆 | `rm_underworld_shelter_02` | ambush | spore → lunge | 46 | 12 | 56 | 50 | 2.1s | — |
| 哨灯蛾 | `rm_underworld_shelter_03` | hop | beam → fan | 35 | 9 | 120 | 46 | 1.4s | 是 |

### 地下堡垒 · `underworld_bunker`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 堡垒卫兵 | `rm_underworld_bunker_01` | ambush | beam → slam | 67 | 14 | 59 | 200 | 2.5s | — |
| 弹药蟹 | `rm_underworld_bunker_02` | stalk | claw → lunge | 67 | 13 | 62 | 50 | 2s | — |
| 机枪眼 | `rm_underworld_bunker_03` | float | ring → beam | 43 | 10 | 68 | 190 | 2.4s | 是 |

### 煤矿厂 · `underworld_coalmine`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 煤矿鼹 | `rm_underworld_coalmine_01` | stalk | burrow → lunge | 41 | 10 | 114 | 54 | 1.7s | — |
| 矿车蟹 | `rm_underworld_coalmine_02` | stalk | slam → claw | 58 | 13 | 60 | 50 | 2.1s | — |
| 煤尘鬼 | `rm_underworld_coalmine_03` | float | ring → spore | 36 | 11 | 80 | 190 | 2.1s | 是 |

### 通风井 · `underworld_vent`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 通风蛾 | `rm_underworld_vent_01` | hop | fan → beam | 26 | 9 | 117 | 46 | 1.5s | 是 |
| 风管蛇 | `rm_underworld_vent_02` | skitter | lunge → tail | 43 | 12 | 97 | 56 | 1.5s | — |
| 灰尘鬼 | `rm_underworld_vent_03` | float | ring → spore | 34 | 10 | 81 | 190 | 2.3s | 是 |

### 排水渠 · `underworld_drain`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 排水蛭 | `rm_underworld_drain_01` | ambush | spit → slam | 46 | 13 | 59 | 50 | 2.4s | — |
| 格栅蟹 | `rm_underworld_drain_02` | stalk | claw → beam | 66 | 15 | 57 | 50 | 2.3s | — |
| 渠底鬼 | `rm_underworld_drain_03` | float | ring → spore | 42 | 12 | 80 | 190 | 2.3s | 是 |

### 升降机 · `underworld_lift`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 升降蟹 | `rm_underworld_lift_01` | stalk | claw → slam | 68 | 15 | 63 | 50 | 2s | — |
| 钢缆蛇 | `rm_underworld_lift_02` | stalk | lunge → tail | 50 | 11 | 91 | 56 | 1.6s | — |
| 升降鬼 | `rm_underworld_lift_03` | float | ring → beam | 37 | 11 | 66 | 190 | 2.1s | 是 |

### 火电厂 · `underworld_thermal`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 火电炎鬼 | `rm_underworld_thermal_01` | skitter | beam → ring | 38 | 12 | 73 | 190 | 2.2s | 是 |
| 汽轮蟹 | `rm_underworld_thermal_02` | stalk | claw → slam | 69 | 13 | 58 | 50 | 2s | — |
| 煤渣蛆 | `rm_underworld_thermal_03` | ambush | spit → lunge | 50 | 11 | 66 | 50 | 2.3s | — |

### 核电厂 · `underworld_nuclear`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 核能鬼 | `rm_underworld_nuclear_01` | float | ring → beam | 43 | 11 | 73 | 190 | 2.2s | 是 |
| 反应堆蟹 | `rm_underworld_nuclear_02` | stalk | claw → slam | 61 | 15 | 51 | 50 | 2.4s | — |
| 辐射蛆 | `rm_underworld_nuclear_03` | ambush | spit → lunge | 46 | 13 | 62 | 50 | 2.3s | — |

### 辐射区 · `underworld_radiation`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 辐射鸦 | `rm_underworld_radiation_01` | ambush | beam → fan | 33 | 10 | 117 | 46 | 1.3s | 是 |
| 铅桶蟹 | `rm_underworld_radiation_02` | stalk | slam → claw | 58 | 13 | 48 | 50 | 2.2s | — |
| 辐射鬼 | `rm_underworld_radiation_03` | float | ring → spore | 37 | 10 | 81 | 190 | 2s | 是 |

### 轰隆不停的兵工厂 · `underworld_arsenal`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 兵工臂 | `rm_underworld_arsenal_01` | skitter | slam → beam | 71 | 13 | 56 | 200 | 2.4s | — |
| 弹壳蟹 | `rm_underworld_arsenal_02` | stalk | claw → lunge | 68 | 13 | 51 | 50 | 2.2s | — |
| 炮管蛇 | `rm_underworld_arsenal_03` | stalk | beam → lunge | 47 | 12 | 96 | 56 | 1.6s | — |

### 废料仓 · `underworld_scrapyard`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 废钢蟹 | `rm_underworld_scrapyard_01` | stalk | claw → slam | 58 | 14 | 60 | 50 | 2.2s | — |
| 磁选蛾 | `rm_underworld_scrapyard_02` | float | ring → beam | 38 | 10 | 74 | 190 | 2.1s | 是 |
| 抓斗猿 | `rm_underworld_scrapyard_03` | stalk | lunge → slam | 54 | 12 | 92 | 56 | 2.2s | — |

### 维修巷道 · `underworld_repair`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 维修臂 | `rm_underworld_repair_01` | orbit | claw → beam | 64 | 13 | 62 | 200 | 2.6s | — |
| 零件蛛 | `rm_underworld_repair_02` | skitter | web → fan | 30 | 9 | 132 | 38 | 1.35s | 是 |
| 机油蛆 | `rm_underworld_repair_03` | ambush | spit → slam | 48 | 13 | 61 | 50 | 2.1s | — |

### 朋克机械 · `underworld_punk`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 朋克蛾 | `rm_underworld_punk_01` | hop | fan → beam | 31 | 8 | 124 | 46 | 1.3s | 是 |
| 音箱蟹 | `rm_underworld_punk_02` | stalk | slam → claw | 58 | 14 | 52 | 50 | 2.1s | — |
| 霓虹鬼 | `rm_underworld_punk_03` | float | ring → spore | 35 | 11 | 77 | 190 | 2.3s | 是 |

### 暗影迷踪 · `underworld_shadow`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 暗影鬼 | `rm_underworld_shadow_01` | skitter | ring → beam | 35 | 10 | 69 | 190 | 2.1s | 是 |
| 黑石像 | `rm_underworld_shadow_02` | stalk | slam → ring | 93 | 17 | 29 | 56 | 2.5s | — |
| 石棺蛇 | `rm_underworld_shadow_03` | stalk | lunge → tail | 45 | 12 | 90 | 56 | 1.8s | — |

### 混乱城堡 · `underworld_castle`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 城堡石像鬼 | `rm_underworld_castle_01` | stalk | slam → ring | 85 | 16 | 34 | 56 | 2.6s | — |
| 盔甲蟹 | `rm_underworld_castle_02` | stalk | claw → slam | 62 | 13 | 60 | 50 | 2.1s | — |
| 王座鬼 | `rm_underworld_castle_03` | float | beam → spore | 35 | 10 | 70 | 190 | 2.1s | 是 |

### 吸血巢穴 · `underworld_vampire`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 吸血蛾 | `rm_underworld_vampire_01` | hop | fan → beam | 27 | 8 | 125 | 46 | 1.3s | 是 |
| 血池蛭 | `rm_underworld_vampire_02` | ambush | spit → slam | 53 | 13 | 58 | 50 | 2.2s | — |
| 棺椁鬼 | `rm_underworld_vampire_03` | float | ring → spore | 33 | 10 | 78 | 190 | 2s | 是 |


## 迷雾 MIST

### 雾海驿站 · `mist_shelter`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 雾海守夜人 | `rm_mist_shelter_01` | stalk | claw → slam | 48 | 12 | 82 | 56 | 2s | — |
| 雾犬 | `rm_mist_shelter_02` | skitter | lunge → peck | 44 | 10 | 110 | 54 | 2s | — |
| 哨灯蛾 | `rm_mist_shelter_03` | hop | beam → fan | 25 | 10 | 131 | 46 | 1.7s | 是 |

### 重力异常区 · `mist_gravity`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 重力眼 | `rm_mist_gravity_01` | float | beam → ring | 33 | 11 | 76 | 190 | 2.1s | 是 |
| 浮石蟹 | `rm_mist_gravity_02` | stalk | slam → claw | 65 | 14 | 51 | 50 | 2.3s | — |
| 重力鬼 | `rm_mist_gravity_03` | float | spore → beam | 37 | 11 | 82 | 190 | 2.4s | 是 |

### 浓雾区 · `mist_fog`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 雾影蛾 | `rm_mist_fog_01` | hop | fan → spore | 31 | 10 | 116 | 46 | 1.3s | 是 |
| 雾中犬 | `rm_mist_fog_02` | stalk | lunge → peck | 47 | 9 | 115 | 54 | 1.6s | — |
| 雾鬼 | `rm_mist_fog_03` | float | ring → beam | 36 | 10 | 73 | 190 | 2s | 是 |

### 雾中公路 · `mist_road`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 公路飙客 | `rm_mist_road_01` | stalk | charge → lunge | 56 | 11 | 91 | 56 | 2.2s | — |
| 路牌蛾 | `rm_mist_road_02` | hop | fan → beam | 29 | 10 | 131 | 46 | 1.4s | 是 |
| 隔离墩蟹 | `rm_mist_road_03` | stalk | slam → claw | 65 | 15 | 57 | 50 | 2.3s | — |

### 盐碱滩 · `mist_saltflat`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 盐壳蟹 | `rm_mist_saltflat_01` | stalk | claw → slam | 69 | 13 | 62 | 50 | 2s | — |
| 盐碱蛭 | `rm_mist_saltflat_02` | ambush | spit → lunge | 50 | 12 | 56 | 50 | 2.3s | — |
| 盐滩鹭 | `rm_mist_saltflat_03` | hop | peck → fan | 29 | 10 | 125 | 46 | 1.3s | 是 |

### 嚎叫海峡 · `mist_strait`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 海峡鳗 | `rm_mist_strait_01` | stalk | beam → lunge | 39 | 12 | 99 | 56 | 1.7s | — |
| 礁石蟹 | `rm_mist_strait_02` | stalk | claw → slam | 59 | 14 | 48 | 50 | 2.3s | — |
| 嚎叫鬼 | `rm_mist_strait_03` | float | ring → beam | 44 | 11 | 76 | 190 | 2.3s | 是 |

### 断桥 · `mist_brokenbridge`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 断桥蟹 | `rm_mist_brokenbridge_01` | stalk | claw → slam | 69 | 15 | 49 | 50 | 2.1s | — |
| 断缆蛇 | `rm_mist_brokenbridge_02` | stalk | lunge → tail | 47 | 10 | 96 | 56 | 1.8s | — |
| 桥下鬼 | `rm_mist_brokenbridge_03` | float | ring → spore | 39 | 11 | 71 | 190 | 2.2s | 是 |

### 深渊泥沼 · `mist_swamp`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 泥沼蛭 | `rm_mist_swamp_01` | ambush | spit → slam | 52 | 13 | 60 | 50 | 2.5s | — |
| 沼气鬼 | `rm_mist_swamp_02` | float | ring → spore | 33 | 10 | 73 | 190 | 2.1s | 是 |
| 沼树螳螂 | `rm_mist_swamp_03` | skitter | claw → lunge | 29 | 9 | 140 | 38 | 1.05s | 是 |

### 干枯树林 · `mist_forest`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 枯林螳螂 | `rm_mist_forest_01` | skitter | claw → lunge | 37 | 8 | 137 | 38 | 0.95s | — |
| 枯枝蛇 | `rm_mist_forest_02` | stalk | tail → lunge | 44 | 10 | 92 | 56 | 1.9s | — |
| 林鸮 | `rm_mist_forest_03` | hop | lunge → fan | 31 | 9 | 118 | 46 | 1.4s | 是 |

### 废弃加油站 · `mist_gasstation`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 加油站蟹 | `rm_mist_gasstation_01` | stalk | claw → slam | 61 | 15 | 50 | 50 | 2.1s | — |
| 油气鬼 | `rm_mist_gasstation_02` | skitter | ring → spore | 37 | 11 | 77 | 190 | 2.4s | 是 |
| 价格牌蛾 | `rm_mist_gasstation_03` | hop | fan → beam | 32 | 9 | 129 | 46 | 1.6s | 是 |

### 红色潮水 · `mist_tide`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 红潮蛭 | `rm_mist_tide_01` | ambush | spit → slam | 49 | 12 | 66 | 50 | 2.5s | — |
| 潮水鬼 | `rm_mist_tide_02` | float | ring → beam | 33 | 12 | 74 | 190 | 2s | 是 |
| 红潮蟹 | `rm_mist_tide_03` | stalk | claw → slam | 59 | 13 | 51 | 50 | 2.3s | — |

### 灰色港湾 · `mist_harbor`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 港湾蟹 | `rm_mist_harbor_01` | stalk | claw → slam | 68 | 15 | 53 | 50 | 2.1s | — |
| 港湾鳗 | `rm_mist_harbor_02` | stalk | beam → lunge | 43 | 11 | 105 | 56 | 1.8s | — |
| 港湾鸥 | `rm_mist_harbor_03` | hop | peck → fan | 26 | 9 | 119 | 46 | 1.4s | 是 |

### 潮汐观测站 · `mist_observatory`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 观测蛾 | `rm_mist_observatory_01` | hop | beam → fan | 29 | 8 | 130 | 46 | 1.5s | 是 |
| 潮汐蟹 | `rm_mist_observatory_02` | stalk | claw → slam | 67 | 13 | 55 | 50 | 2s | — |
| 观测鬼 | `rm_mist_observatory_03` | float | ring → beam | 40 | 10 | 73 | 190 | 2s | 是 |

### 沉船滩 · `mist_wreck`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 沉船蟹 | `rm_mist_wreck_01` | stalk | claw → slam | 69 | 14 | 48 | 50 | 2.1s | — |
| 桅杆蛇 | `rm_mist_wreck_02` | stalk | lunge → tail | 47 | 10 | 99 | 56 | 1.9s | — |
| 沉船鬼 | `rm_mist_wreck_03` | float | ring → spore | 38 | 11 | 70 | 190 | 2s | 是 |

### 恐怖酒店 · `mist_hotel`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 酒店蛾 | `rm_mist_hotel_01` | hop | fan → spore | 35 | 9 | 118 | 46 | 1.4s | 是 |
| 行李车蟹 | `rm_mist_hotel_02` | stalk | claw → slam | 63 | 15 | 58 | 50 | 2.4s | — |
| 客房鬼 | `rm_mist_hotel_03` | float | ring → beam | 42 | 10 | 75 | 190 | 2.2s | 是 |

### 雾林小径 · `mist_trail`

| 小怪 | id | AI | 招式（按优先级） | HP | 伤害 | 速度 | 攻击距离 | 冷却 | 飞行 |
|---|---|---|---|---|---|---|---|---|---|
| 小径螳螂 | `rm_mist_trail_01` | skitter | claw → lunge | 28 | 7 | 131 | 38 | 1.05s | — |
| 雾林犬 | `rm_mist_trail_02` | stalk | lunge → peck | 42 | 9 | 112 | 54 | 2s | — |
| 路标蛾 | `rm_mist_trail_03` | hop | fan → spore | 34 | 10 | 125 | 46 | 1.5s | 是 |

