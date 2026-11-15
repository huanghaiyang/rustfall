# 角色黑描边（卡通 / cel 风格）

> 目标：给**角色**（玩家机甲 + 所有怪物 / BOSS）加一圈黑边，让轮廓从背景里跳出来，
> 做出「黑边缘卡通」的味道。2025-11 实现并验证。

## 1. 为什么是这个做法

角色全都是一张**带 alpha 的贴图 quad**：玩家 `robot.js`、所有怪物 `BaseMonster`，
动画 = 换 `material.map`。基于这个前提，描边的四个候选方案：

| 方案 | 为什么没选 |
|---|---|
| 后处理边缘检测 | 全屏生效，地形/道具也会被描黑；屏幕分辨率下的线脱离像素栅格，和像素美术不搭 |
| 放大一圈的黑色副本网格（inverted hull / 缩放剪影） | 多一次 draw call；「按中心缩放」不是等宽偏移 —— 离中心越远线越粗，细线缆几乎没边 |
| 直接烘进贴图 | 只能画在轮廓**内侧**，会啃美术；BOSS 贴图是 2 倍超采样，1 texel 的边在屏幕上只有半个像素，看不见 |
| **同一 quad 内做着色器 alpha 膨胀**（采用） | 输出在轮廓**外侧**、等宽、不啃美术、不加 draw call；代价是每个片元多 8 次采样 |

## 2. 实现（`src/game/render/outline.js`）

```
几何体 = PlaneGeometry(w + 2·t, h + 2·t)      // 四周各留白 t，精灵世界尺寸不变
片元：
  1. 几何体 UV → 精灵自身 UV：suv = (uv·(w+2t, h+2t) − t) / (w, h)
  2. 当前像素不透明 → 输出贴图颜色（乘 uTint，供受击闪白/染色用）
  3. 透明 → 向 8 个方向各采样一次 alpha（偏移 t / size，对角乘 0.7071）
  4. 任一邻居不透明 → 输出黑色；否则 discard
```

对外接口（`outline.js`）：

| API | 作用 |
|---|---|
| `outlineMaterial(tex, { w, h, thickness, color, outlineColor })` | 描边材质（`ShaderMaterial`），带 `map` / `color` / `opacity` / `alphaTest` 兼容层 |
| `outlineGeometry(w, h, thickness)` | 配套几何体（四周留白） |
| `resizeOutlineMesh(mesh, w, h)` | 大怪拿到美术后重设尺寸用：几何体与 uniform 一起更新 |
| `outlineThickness(w, h)` | 自适应宽度：`min(3, max(1, round(min(w,h)·0.045)))` |
| `setOutline(bool \| {enabled,thickness,color})` / `outlineState()` | 运行时开关（调试 / A/B 对比） |
| `applyOutlineFromUrl()` | `?outline=0` 关、`?outline=3` 加粗、`?outlineColor=0x101010` 换色 |

接入点：

| 位置 | 说明 |
|---|---|
| `entities/monsters/base.js` `buildVisual()` | 所有怪物 / BOSS / 小怪 |
| `entities/robot.js` `buildVisual()` | 玩家本体 |
| `entities/robot.js` `setHeldWeapon/setHeldTool` | 手持武器 / 工具（不然像浮在身上） |
| `entities/monsters/large/common.js` `applyLargeArt()` | 大怪美术后加载 → `resizeOutlineMesh` 重算留白与 uniform |
| `game.js` 构造末尾 | `applyOutlineFromUrl()` + `window.__rustfall.setOutline()` 调试入口 |

> 掉落物 / 道具（`loot/world-items.js`）**不描边**：卡通风格里只有「角色」需要黑边，
> 满屏物品都描边会糊成一团。

## 3. 三个坑（踩过）

1. **`ShaderMaterial` 不会自动套贴图的 `repeat/offset`**。
   BOSS 贴图是 10 帧横排的图集（`repeat.x = 0.1`），漏了这步会把整张图集压进一个格子，
   屏幕上是一团竖线噪点。做法：`uUvXform` uniform + `material.onBeforeRender` 每帧从
   `texture.repeat/offset` 同步（帧切换时 offset 会变）。
2. **几何体一定要留白**。留白不够 = 描边被 clip 掉；留白过大 = 精灵被缩小。
   `resizeOutlineMesh` 同时改几何体和 `uSize/uPad/uThick`，别只改一边。
3. **引擎侧会直接写 `mat.map` / `mat.color.setHex()`**。
   `ShaderMaterial` 没有这些字段，所以材质上做了 `defineProperty` 兼容层，
   `mat.color` 直接用 uniform 里那个 `Color` 实例（就地改值即可）。

## 4. 调参与风格

| 参数 | 默认 | 说明 |
|---|---|---|
| `OUTLINE_STYLE.color` | `0x0a0b0d` | 近黑（纯黑在暗场里显死板） |
| `OUTLINE_STYLE.thickness` | 2 | 上限；实际按角色尺寸自适应（小怪 1~2px，BOSS 3px） |
| `OUTLINE_STYLE.maxThickness` | 3 | 自适应上限 |
| `OUTLINE_STYLE.alphaThreshold` | 0.5 | 与 `spriteMaterial` 的 alphaTest 一致 |

运行时对比：

```js
window.__rustfall.setOutline(false)   // 关
window.__rustfall.setOutline({ enabled: true, thickness: 4 })
window.__rustfall.outlineState()      // { enabled, thickness, color, materials }
```

## 5. 验证

```bash
node scripts/verify-outline.mjs
```

- 材质 / 几何体 / uniform 断言（含大怪「美术后加载」的重设尺寸路径）
- 场景内开/关像素对比：变化像素 2.6 万、**100% 变暗**、平均亮度 45.3 → 6.5
- **离线单精灵对比**（同一管线 `uActive=1/0`，确定性）：
  缺失 0 px（没啃美术）、外侧新增 12884 px、新增像素 100% 近黑、原有像素最大差 **0**
- `?outline=0` 能关掉；无 console/pageerror

产物：`.screenshots/outline/{outline-scene,outline-on-crop,outline-off-crop,outline-boss-closeup,outline-player-closeup,outline-monsters-scene}.png`

## 6. 还可以往前走

- 现在只加了「黑边」，**没有改内部明暗**。真正的 cel 风格通常还要两步：
  ① 色阶量化（posterize）压平明暗；② 内部再压一层「阴影色 + 硬边高光」。
  这两步会改动美术观感，属于风格决策，没在这次一起做。
- 描边宽度现在跟着**世界像素**走：镜头拉远时线会变细（≤1px 时会发虚）。
  要做「恒定屏幕像素的线」，得把 `uThick` 换成按相机缩放反算的值。
- 若以后出现「角色半透明」的表现（隐身、幻影），需要在描边通道里单独处理 alpha。
