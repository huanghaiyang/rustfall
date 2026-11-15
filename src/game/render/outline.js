// ============================================================================
// 锈雨 · RUSTFALL —— 角色黑描边（卡通 / cel 风格）
// ----------------------------------------------------------------------------
// 项目里角色都是一张**带 alpha 的贴图 quad**（玩家 Robot、所有怪物 BaseMonster），
// 动画 = 换 material.map。所以描边最省的做法不是后处理、也不是第二层网格，而是
// **在同一个 quad 里做着色器 alpha 膨胀**：
//
//   · 几何体比精灵本身四周各放大 thickness（留白），片元把 UV 映射回精灵自身；
//   · 片元里若当前像素透明，就向周围 8 个方向采样 alpha；
//   · 周围有实心像素 → 输出纯黑；否则 discard。
//
// 为什么不用别的方案：
//   · 后处理边缘检测：作用于全屏，会把地形/道具也描黑，而且屏幕分辨率下的线会
//     脱离像素栅格，和像素美术不搭。
//   · 放大一圈的黑色副本网格（inverted hull / 缩放剪影）：多一次 draw call，
//     且「按中心缩放」不是等宽偏移 —— 离中心越远线越粗，细天线几乎没边。
//   · 直接烘进贴图：只能画在轮廓**内侧**，会啃掉美术（BOSS 贴图是 2 倍超采样，
//     1 texel 的边在屏幕上只有半个像素，根本看不见）。
//
// 坐标系：thickness / size 都是**世界像素**（和 PlaneGeometry 的尺寸同单位，
// 也就是精灵在游戏里的显示大小），所以贴图分辨率变了对观感没有影响。
// ============================================================================
import * as THREE from 'three'
import { hardenAlpha } from './materials.js'

export const OUTLINE_STYLE = {
  enabled: true,
  color: 0x0a0b0d, // 近黑：纯黑 0x000000 在暗场里会显死板
  // 描边宽度（世界像素）= 基准宽度的一半，基准 = max(1, round(min(w,h)·0.045))。
  // 首版是 3px（BOSS）/ 2px（玩家），实际观感偏粗、细线缆容易被糊掉，故整体减半：
  //   BOSS 1.5px · 玩家 1px · 小怪 0.5px（下限 0.5，再细就只剩半像素会断断续续）
  thickness: 1,
  maxThickness: 1.5,
  minThickness: 0.5,
  baseScale: 0.045, // 基准宽度系数（减半前）
  widthScale: 0.5, // 默认取基准的一半；显式指定 thickness 时恢复成 1
  alphaThreshold: 0.5,
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uTint;
uniform vec3 uOutlineColor;
uniform vec2 uSize;      // 精灵显示尺寸（世界像素）
uniform vec2 uPad;       // 每边留白（世界像素）
uniform float uThick;    // 描边厚度（世界像素）
uniform float uAlphaTest;
uniform float uOpacity;
uniform float uActive;   // 0 = 关掉描边（几何体仍然留白，尺寸不变）
uniform float uHasMap;
uniform vec4 uUvXform;   // (repeat.xy, offset.zw)：图集帧用，等价于贴图的 uv 变换
varying vec2 vUv;

// 采样精灵 alpha：超出 [0,1] 一律当透明，
// 否则 clamp 会把边缘那列像素拉成一整块黑边。
// 注意必须自己套 repeat/offset —— ShaderMaterial 不像内置材质那样帮你做 uv 变换，
// BOSS 贴图是 10 帧横排的图集（repeat.x=0.1），漏了这步会把整张图集压进一个格子。
float alphaAt(vec2 suv) {
  vec2 lo = step(vec2(0.0), suv);
  vec2 hi = step(suv, vec2(1.0));
  float inside = lo.x * lo.y * hi.x * hi.y;
  vec2 tuv = suv * uUvXform.xy + uUvXform.zw;
  return texture2D(uMap, tuv).a * inside;
}

void main() {
  // 「几何体 UV」→「精灵自身 UV」：几何体四周多了 uPad 的留白
  vec2 total = uSize + 2.0 * uPad;
  vec2 uv = (vUv * total - uPad) / uSize;

  if (uHasMap < 0.5) {
    // 还没有贴图（占位色块）：保持原有表现，不描边
    gl_FragColor = vec4(uTint, uOpacity);
    return;
  }

  vec4 src = texture2D(uMap, uv * uUvXform.xy + uUvXform.zw);
  float a = alphaAt(uv);
  if (a >= uAlphaTest) {
    gl_FragColor = vec4(src.rgb * uTint, uOpacity);
    return;
  }
  if (uActive < 0.5) discard;

  // 八方向膨胀：正交 4 个 + 对角 4 个（对角用 0.7071 使半径一致，圆角更顺）
  vec2 o = uThick / uSize;
  vec2 d = o * 0.7071;
  float m = 0.0;
  m = max(m, alphaAt(uv + vec2(o.x, 0.0)));
  m = max(m, alphaAt(uv - vec2(o.x, 0.0)));
  m = max(m, alphaAt(uv + vec2(0.0, o.y)));
  m = max(m, alphaAt(uv - vec2(0.0, o.y)));
  m = max(m, alphaAt(uv + d));
  m = max(m, alphaAt(uv - d));
  m = max(m, alphaAt(uv + vec2(d.x, -d.y)));
  m = max(m, alphaAt(uv + vec2(-d.x, d.y)));

  if (m >= uAlphaTest) {
    gl_FragColor = vec4(uOutlineColor, uOpacity);
    return;
  }
  discard;
}
`

/** 已建材质登记表：运行时统一切换描边 */
const allMaterials = new Set()

/**
 * 按角色显示尺寸自适应描边粗细（世界像素），**默认减半**：
 *   小怪（min 28~40）→ 0.5~1px，BOSS（min 136）→ 1.5px
 * 下限 0.5：再细就是半像素线，NearestFilter 采样会断断续续（看着像脏边）。
 */
export function outlineThickness(w, h) {
  const base = Math.max(1, Math.round(Math.min(w, h) * OUTLINE_STYLE.baseScale))
  const scaled = base * (Number.isFinite(OUTLINE_STYLE.widthScale) ? OUTLINE_STYLE.widthScale : 0.5)
  return Math.min(OUTLINE_STYLE.maxThickness, Math.max(OUTLINE_STYLE.minThickness, scaled))
}

/**
 * 角色描边材质。
 * 兼容 MeshBasicMaterial 的几个常用字段（map / color / opacity / alphaTest），
 * 因为引擎侧会直接写 `mat.map = tex`、`mat.color.setHex(...)`。
 */
export function outlineMaterial(tex, opts = {}) {
  const w = Math.max(1, opts.w || tex?.image?.width || 32)
  const h = Math.max(1, opts.h || tex?.image?.height || 32)
  const thick = Number.isFinite(opts.thickness) ? opts.thickness : outlineThickness(w, h)
  if (tex) hardenAlpha(tex, opts.alphaThreshold ?? 128)

  const tint = new THREE.Color(opts.color ?? 0xffffff)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex || null },
      uTint: { value: tint },
      uOutlineColor: { value: new THREE.Color(opts.outlineColor ?? OUTLINE_STYLE.color) },
      uSize: { value: new THREE.Vector2(w, h) },
      uPad: { value: new THREE.Vector2(thick, thick) },
      uThick: { value: thick },
      uAlphaTest: { value: OUTLINE_STYLE.alphaThreshold },
      uOpacity: { value: opts.opacity ?? 1 },
      uActive: { value: OUTLINE_STYLE.enabled ? 1 : 0 },
      uHasMap: { value: tex ? 1 : 0 },
      uUvXform: { value: new THREE.Vector4(1, 1, 0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: opts.side ?? THREE.FrontSide,
  })

  // 图集帧的 repeat/offset 同步（每帧重读，帧切到别的格子也跟得上）
  const syncUvXform = () => {
    const t = mat.uniforms.uMap.value
    const x = mat.uniforms.uUvXform.value
    if (t?.repeat && t?.offset) x.set(t.repeat.x, t.repeat.y, t.offset.x, t.offset.y)
    else x.set(1, 1, 0, 0)
  }
  syncUvXform()
  mat.uniforms.uUvXform.value.needsUpdate = false
  // three 的 Material.onBeforeRender 每帧每物体都会调用，开销可忽略
  mat.onBeforeRender = syncUvXform

  // ---- 兼容层：让引擎侧照旧写 mat.map / mat.color / mat.opacity ----
  Object.defineProperty(mat, 'map', {
    configurable: true,
    get: () => mat.uniforms.uMap.value,
    set: (v) => {
      mat.uniforms.uMap.value = v
      mat.uniforms.uHasMap.value = v ? 1 : 0
      syncUvXform()
    },
  })
  // 直接用 uniform 里那个 Color 实例，setHex/setRGB 会就地改到 uniform
  mat.color = tint
  Object.defineProperty(mat, 'opacity', {
    configurable: true,
    get: () => mat.uniforms.uOpacity.value,
    set: (v) => {
      mat.uniforms.uOpacity.value = v
    },
  })
  Object.defineProperty(mat, 'alphaTest', {
    configurable: true,
    get: () => mat.uniforms.uAlphaTest.value,
    set: (v) => {
      mat.uniforms.uAlphaTest.value = v
    },
  })
  mat.userData.outline = true
  mat.userData.outlineThickness = thick
  allMaterials.add(mat)
  return mat
}

/** 配套几何体：四周各留 thickness，精灵本身的世界尺寸不变 */
export function outlineGeometry(w, h, thickness) {
  const t = Number.isFinite(thickness) ? thickness : outlineThickness(w, h)
  return new THREE.PlaneGeometry(w + 2 * t, h + 2 * t)
}

/**
 * 大怪拿到美术后会重设显示尺寸（large/common.js 的 applyLargeArt），
 * 几何体要按新尺寸重新留白，uniform 也要跟着更新，否则描边会算错比例。
 */
export function resizeOutlineMesh(mesh, w, h, opts = {}) {
  const mat = mesh?.material
  const width = Math.max(1, w)
  const height = Math.max(1, h)
  const t = Number.isFinite(opts.thickness) ? opts.thickness : outlineThickness(width, height)
  const old = mesh.geometry
  mesh.geometry = new THREE.PlaneGeometry(width + 2 * t, height + 2 * t)
  try {
    old?.dispose?.()
  } catch (e) {
    /* ignore */
  }
  const u = mat?.uniforms
  if (u?.uSize) {
    u.uSize.value.set(width, height)
    u.uPad.value.set(t, t)
    u.uThick.value = t
    mat.userData.outlineThickness = t
  }
  return mesh
}

/** 只改 uniform 尺寸（几何体已经对的时候用） */
export function setOutlineSize(mat, w, h, thickness) {
  const u = mat?.uniforms
  if (!u?.uSize) return mat
  const width = Math.max(1, w)
  const height = Math.max(1, h)
  const t = Number.isFinite(thickness) ? thickness : outlineThickness(width, height)
  u.uSize.value.set(width, height)
  u.uPad.value.set(t, t)
  u.uThick.value = t
  if (mat.userData) mat.userData.outlineThickness = t
  return mat
}

/** 一次性建好「描边角色四边形」：返回 { mesh, mat, thickness } */
export function characterQuad(tex, opts = {}) {
  const w = Math.max(1, opts.w || 32)
  const h = Math.max(1, opts.h || 32)
  const thickness = Number.isFinite(opts.thickness) ? opts.thickness : outlineThickness(w, h)
  const mat = outlineMaterial(tex, { ...opts, w, h, thickness })
  const mesh = new THREE.Mesh(outlineGeometry(w, h, thickness), mat)
  return { mesh, mat, thickness }
}

// ---------------------------------------------------------------------------
// 运行时开关（调试 / A/B 对比 / URL 参数）
// ---------------------------------------------------------------------------

/** 全局开关：true/false 或 { enabled, thickness, color } */
export function setOutline(next = {}) {
  const opt = typeof next === 'boolean' ? { enabled: next } : next || {}
  if ('enabled' in opt) OUTLINE_STYLE.enabled = !!opt.enabled
  if (Number.isFinite(opt.thickness)) {
    // 显式给宽度 = 「按基准宽度、最多 N px」：等价于减半前的观感
    // （?outline=3 就能拿回 3px 的 BOSS 描边；默认仍是减半的 1.5px）
    OUTLINE_STYLE.maxThickness = opt.thickness
    OUTLINE_STYLE.thickness = opt.thickness
    OUTLINE_STYLE.widthScale = 1
  }
  if ('color' in opt) OUTLINE_STYLE.color = opt.color
  for (const m of allMaterials) {
    m.uniforms.uActive.value = OUTLINE_STYLE.enabled ? 1 : 0
    if (Number.isFinite(opt.thickness)) {
      // 几何体留白不能超过已有 padding，否则精灵会被裁；只按可用留白收紧视觉厚度
      m.uniforms.uThick.value = Math.min(opt.thickness, m.uniforms.uPad.value.x)
    }
    if ('color' in opt) m.uniforms.uOutlineColor.value.setHex(opt.color)
  }
  return outlineState()
}

export function outlineState() {
  return {
    enabled: OUTLINE_STYLE.enabled,
    thickness: OUTLINE_STYLE.thickness,
    color: '#' + OUTLINE_STYLE.color.toString(16).padStart(6, '0'),
    materials: allMaterials.size,
  }
}

/** 手动登记（给不走 outlineMaterial 工厂的地方兜底） */
export function registerOutlineMaterial(mat) {
  if (mat?.userData?.outline) allMaterials.add(mat)
  return mat
}

/** URL 参数：?outline=0 关掉 / ?outline=3 加粗 / ?outlineColor=0x101010 */
export function applyOutlineFromUrl(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    const q = new URLSearchParams(search || '')
    if (q.has('outline')) {
      const v = q.get('outline')
      if (v === '0' || v === 'off' || v === 'false') setOutline(false)
      else if (Number.isFinite(Number(v)) && Number(v) > 0) setOutline({ enabled: true, thickness: Number(v) })
      else setOutline(true)
    }
    const c = q.get('outlineColor')
    if (c) {
      const hex = c.startsWith('0x') ? parseInt(c, 16) : parseInt(c.replace('#', ''), 16)
      if (Number.isFinite(hex)) setOutline({ color: hex })
    }
  } catch (e) {
    /* 无 location 环境忽略 */
  }
  return outlineState()
}
