# 分层背景 · 待补清单（49 间）

> 状态：**部分完成，待账户充值后补齐**
> 记录日期：2026-11-21
> 关联：`scripts/gen-room-layers.mjs`、`.tools/post_ark.py`、`src/game/world/room.js`

## 一、现状总览

关卡背景已从「单层整图」改造为 **far / mid / near 三条可平铺分层条带**，运行时按各自视差与深度叠加：

| 层 | 视差系数 p | Z 深度 | 素材层高 | 内容 |
|----|-----------|--------|----------|------|
| far  | 0.88 | -150 | 928 | 天空、乌云、远山、远楼群与雾霭（不透明打底） |
| mid  | 0.70 | -120 | 560 | 中景楼群 / 工业轮廓行 |
| near | 0.48 | -90  | 380 | 底部近景剪影条（枯树、废车、断墙、桁架） |

- 横向：纹理 `RepeatWrapping` 循环平铺，`offset.x` 随时间循环滚动，无限延展、不靠关卡宽度硬切。
- 动态：每层带自动漂移（drift）、竖直浮动（bob）、近景明灭（flicker），由 `this.time` 每帧驱动。
- 叠放方案：**纵向分区不透明条带 + 运行时底部裁条**（`AI_LAYER_CFG.strip`，mid/near 裁除上半天空）。
  低对比废土图上明度抠图无法把亮天空与暗剪影分开，故不做透明通道叠加。

### 覆盖统计（以 `public/sprites/backdrops/rooms/` 成品 PNG 为准）

- 总房间：**190**
- 三层齐全并接入：**141**（far / mid / near 各 141 张）
- 待补：**49**（当前回退既有整图 `rooms/<roomId>.png`，不白屏、无报错）

## 二、阻塞原因

批量生成在 ARK 图像接口返回 **HTTP 403 `AccountOverdueError`（账户欠费）** 后中断：

```
HTTP 403: {"error":{"code":"AccountOverdueError",
"message":"The request failed because your account has an overdue balance."}}
```

重试 2 次仍 403，后续请求全部失败。进程已停止，未产生半截素材（待补房间均为 0 层，无半套残留）。

## 三、待补房间清单（49 间）

### frontier 边境残骸带（1）

| roomId | 名称 | biome | theme |
|--------|------|-------|-------|
| frontier_military_base | 军事基地 | factory | military_base |

### old_town 锈土旧城（16）

| roomId | 名称 | biome | theme |
|--------|------|-------|-------|
| oldtown_shelter | 旧城营地 | city | - |
| oldtown_post | 旧邮局 | city | - |
| oldtown_library | 市立图书馆 | hospital | library |
| oldtown_school | 第九中学 | hospital | school |
| oldtown_university | 理工大学 | hospital | university |
| oldtown_papermill | 造纸厂 | factory | paper_mill |
| oldtown_ruins | 考古遗迹 | dump | archaeological_site |
| oldtown_prison | 废弃监狱 | metro | prison |
| oldtown_hotel | 无人旅馆 | hospital | hotel |
| oldtown_cinema | 旧电影院 | city | - |
| oldtown_dock | 旧码头 | port | dock |
| oldtown_lighthouse | 断光灯塔 | port | lighthouse |
| oldtown_shipyard | 造船厂 | port | shipyard |
| oldtown_drydock | 干船坞 | port | drydock |
| oldtown_substation | 变电站 | factory | substation |
| oldtown_gate | 旧城界门 | city | - |

### underworld 地底深井（16）

| roomId | 名称 | biome | theme |
|--------|------|-------|-------|
| underworld_shelter | 地底驿站 | metro | - |
| underworld_bunker | 地下堡垒 | metro | bunker |
| underworld_coalmine | 煤矿厂 | dump | coal_mine |
| underworld_vent | 通风井 | metro | - |
| underworld_drain | 排水渠 | metro | - |
| underworld_lift | 升降机 | factory | - |
| underworld_thermal | 火电厂 | factory | thermal_plant |
| underworld_nuclear | 核电厂 | factory | nuclear_plant |
| underworld_radiation | 辐射区 | dump | radiation_zone |
| underworld_arsenal | 轰隆不停的兵工厂 | factory | arsenal |
| underworld_scrapyard | 废料仓 | dump | - |
| underworld_repair | 维修巷道 | metro | - |
| underworld_punk | 朋克机械 | factory | punk_mech |
| underworld_shadow | 暗影迷踪 | metro | shadow_labyrinth |
| underworld_castle | 混乱城堡 | city | chaos_castle |
| underworld_vampire | 吸血巢穴 | hospital | vampire_lair |

### mist 雾海（16）

| roomId | 名称 | biome | theme |
|--------|------|-------|-------|
| mist_shelter | 雾海驿站 | port | - |
| mist_gravity | 重力异常区 | city | gravity_anomaly |
| mist_fog | 浓雾区 | port | dense_fog |
| mist_road | 雾中公路 | city | - |
| mist_saltflat | 盐碱滩 | port | - |
| mist_strait | 嚎叫海峡 | port | howling_strait |
| mist_brokenbridge | 断桥 | port | - |
| mist_swamp | 深渊泥沼 | port | abyss_swamp |
| mist_forest | 干枯树林 | village | withered_forest |
| mist_gasstation | 废弃加油站 | city | - |
| mist_tide | 红色潮水 | port | red_tide |
| mist_harbor | 灰色港湾 | port | grey_harbor |
| mist_observatory | 潮汐观测站 | port | - |
| mist_wreck | 沉船滩 | port | - |
| mist_hotel | 恐怖酒店 | hospital | horror_hotel |
| mist_trail | 雾林小径 | village | - |

## 四、补齐步骤

账户充值（或更换可用 `ARK_API_KEY`）后，在项目根目录依次执行：

```powershell
# 1. 生成缺失房间的 far/mid/near 原图（已存在的自动 skip，不会重复出图）
node scripts/gen-room-layers.mjs all far,mid,near

# 2. 后处理：裁剪、缩放、调色，输出 public/sprites/backdrops/rooms/<id>_{far,mid,near}.png
python .tools/post_ark.py layers

# 3. 构建复验
npm run build
```

如需只补某一组，可用房间清单过滤：

```powershell
# 示例：只补 underworld 一组（逗号分隔 roomId）
node scripts/gen-room-layers.mjs all underworld_shelter,underworld_bunker,... far,mid,near
```

## 五、验收要点（补齐后抽查）

- 三层 PNG 均 200 加载，控制台无非模组 error（`duplicate` 类 mod 噪音可忽略）。
- far 天空远山连贯；mid 楼群行不越界；near 仅底部剪影条，上半天空被裁除、无黑幕压住下层。
- 横向走动背景连续平铺、不露白；far 缓漂、near 有轻微浮动 / 明灭。
- 未生成成功的房间应自动回退整图或程序化背景，不白屏。
