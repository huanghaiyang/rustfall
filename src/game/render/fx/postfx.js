// ============================================================================
// 锈雨 · RUSTFALL —— 后期处理（自建低分辨率 RT + 全屏 quad，不用 EffectComposer）
//
//   createPostFX(renderer) -> {
//     render(scene, camera, dt),   // 低分辨率 RT → 最近邻放大到屏幕；失败/禁用时直接渲染
//     resize(w, h),                // 画布尺寸变化时调用（内部按 aspect 重算 RT）
//     setUniforms(partial),        // { grain, scanline, vignette, chromatic, toxicity,
//                                  //   smoke, damage, saturate, tint:[r,g,b], lowRes,
//                                  //   ambient, night, weatherTint:[r,g,b], wetness, fog }
//     setGlow(bool),               // 【第二轮】可选泛光通道（默认关闭，坏了自动退回）
//     setGlowStrength(strength),   // 【第二轮】0..2
//     setGlowParams({ strength, threshold, knee }), // 【第二轮】
//     setPixelSize(v),             // lowRes 的别名：1 = 360p 基准，2 = 更糊，0.5 = 更细
//     setEnabled(bool),
//     dispose(),
//     get size(),                  // 低分辨率 RT 的 { width, height }
//   }
//
//   第二轮新增：昼夜 / 天气总谱 ambient / night / weatherTint / wetness / fog 默认全中性，
//   不改动第一轮的任何画面；泛光用独立 try/catch，失败只关它自己。
//
//   设计要点：
//   · RT 高度约 360（按 aspect 算宽），magFilter/minFilter = NearestFilter，no mipmap
//     → 放大后天然是像素块；POST_FRAG 再把采样点吸附到 RT 像素中心，避免半像素抖动。
//   · RT 优先用 HalfFloatType（暗部不 banding），扩展不可用时退回 UnsignedByteType。
//   · 场景是"线性值写进 RT"，所以在 POST_FRAG 末段自己做 linear→sRGB（uEncode）。
//   · 任何一步失败（RT 建不出来 / shader 编译失败 / 上下文丢失）都自动降级成
//     renderer.render(scene, camera)：这是硬要求，绝不允许抛异常把画面搞黑。
// ============================================================================

import * as THREE from 'three'
import { POST_VERT, POST_FRAG, BRIGHT_FRAG, BLUR_FRAG } from './shaders.js'
import { SMOKE_BASE } from '../../config.js'

/** 低分辨率基准高度（像素）。360 → 与 540 高的正交视图正好 1.5 倍放大。 */
const BASE_HEIGHT = 360
const MIN_HEIGHT = 90
const MAX_HEIGHT = 1080

function clampNum(v, a, b) {
  return v < a ? a : v > b ? b : v
}

/** 后期默认参数（引擎可以直接拿来 show 给用户调） */
export const POSTFX_DEFAULTS = {
  grain: 0.12,
  scanline: 0.12,
  vignette: 0.55,
  chromatic: 0.0018,
  toxicity: 0,
  smoke: SMOKE_BASE != null ? SMOKE_BASE : 0.18,
  damage: 0,
  saturate: 0.92,
  tint: [0.75, 0.44, 0.22], // 偏暖锈色（PAL.rustLight 的 0..1 分量）
  lowRes: 1,
  // —— 昼夜 / 天气总谱（默认值 = 完全不改变既有画面）——
  ambient: 1, // 0..1   环境光量（1 = 中性）
  night: 0, // 0..1   夜晚冷调
  weatherTint: [1, 1, 1], // 0..4   天气染色（乘法，1,1,1 = 中性）
  wetness: 0, // 0..1   湿滑 / 反光
  fog: 0, // 0..1   距离雾
}

/** 可选泛光通道的默认参数（setGlow(true) 之后生效；关闭时零开销） */
export const GLOW_DEFAULTS = {
  strength: 0.85, // 0..2   叠加到画面的强度
  threshold: 0.62, // 0..4   高亮抽取阈值（线性空间）
  knee: 0.28, // 0.01..1 软膝，避免硬边
}

export function createPostFX(renderer) {
  const hasRenderer = !!(renderer && typeof renderer.render === 'function')

  // ——— 状态 ————————————————————————————————————————————————
  const state = {
    grain: POSTFX_DEFAULTS.grain,
    scanline: POSTFX_DEFAULTS.scanline,
    vignette: POSTFX_DEFAULTS.vignette,
    chromatic: POSTFX_DEFAULTS.chromatic,
    toxicity: POSTFX_DEFAULTS.toxicity,
    smoke: POSTFX_DEFAULTS.smoke,
    damage: POSTFX_DEFAULTS.damage,
    saturate: POSTFX_DEFAULTS.saturate,
    tint: POSTFX_DEFAULTS.tint.slice(),
    lowRes: POSTFX_DEFAULTS.lowRes,
    ambient: POSTFX_DEFAULTS.ambient,
    night: POSTFX_DEFAULTS.night,
    weatherTint: POSTFX_DEFAULTS.weatherTint.slice(),
    wetness: POSTFX_DEFAULTS.wetness,
    fog: POSTFX_DEFAULTS.fog,
  }

  let enabled = true
  let failed = !hasRenderer
  let disposed = false
  let rt = null
  // —— 可选泛光通道（默认关闭）——
  let glowEnabled = false
  let glowFailed = false
  let glowA = null
  let glowB = null
  const glowParams = {
    strength: GLOW_DEFAULTS.strength,
    threshold: GLOW_DEFAULTS.threshold,
    knee: GLOW_DEFAULTS.knee,
  }
  let aspect = 16 / 9
  let cssW = 640
  let cssH = 360
  // 外部显式 resize 过之后，就不再用 renderer 的尺寸反推 aspect（否则会互相打架）
  let explicitAspect = false

  // ——— 全屏 quad ————————————————————————————————————————————
  const quadScene = new THREE.Scene()
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({
    name: 'RustfallPost',
    uniforms: {
      uTex: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTarget: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGrain: { value: state.grain },
      uScanline: { value: state.scanline },
      uVignette: { value: state.vignette },
      uChromatic: { value: state.chromatic },
      uToxicity: { value: state.toxicity },
      uSmoke: { value: state.smoke },
      uDamage: { value: state.damage },
      uSaturate: { value: state.saturate },
      uTint: {
        value: new THREE.Vector3(state.tint[0], state.tint[1], state.tint[2]),
      },
      uPixel: { value: 2 },
      uEncode: { value: 1 },
      // —— 昼夜 / 天气总谱（默认中性）——
      uAmbient: { value: state.ambient },
      uNight: { value: state.night },
      uWeatherTint: {
        value: new THREE.Vector3(state.weatherTint[0], state.weatherTint[1], state.weatherTint[2]),
      },
      uWetness: { value: state.wetness },
      uFog: { value: state.fog },
      // —— 可选泛光通道（uGlow = 0 时完全跳过）——
      uGlowTex: { value: null },
      uGlow: { value: 0 },
    },
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  })
  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  quad.matrixAutoUpdate = false
  quadScene.add(quad)

  // ——— 泛光通道：高亮抽取 / 可分离模糊的材质与 quad ————————————
  const glowScene = new THREE.Scene()
  const brightMaterial = new THREE.ShaderMaterial({
    name: 'RustfallBright',
    uniforms: {
      uTex: { value: null },
      uThreshold: { value: glowParams.threshold },
      uKnee: { value: glowParams.knee },
    },
    vertexShader: POST_VERT,
    fragmentShader: BRIGHT_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  })
  const blurMaterial = new THREE.ShaderMaterial({
    name: 'RustfallBlur',
    uniforms: {
      uTex: { value: null },
      uDir: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: POST_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  })
  const glowMesh = new THREE.Mesh(geometry, brightMaterial)
  glowMesh.frustumCulled = false
  glowMesh.matrixAutoUpdate = false
  glowScene.add(glowMesh)

  // ——— RT —————————————————————————————————————————————————

  /** RGBA16F 可用就用（暗部更干净），否则退回 8bit */
  function pickTextureType() {
    if (!renderer || typeof renderer.extensions === 'undefined') {
      return THREE.UnsignedByteType
    }
    try {
      const ext = renderer.extensions
      if (ext && typeof ext.has === 'function') {
        if (ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float')) {
          return THREE.HalfFloatType
        }
      }
    } catch (e) {
      /* 拿不到扩展就退回 8bit，不抛 */
    }
    return THREE.UnsignedByteType
  }

  /** 按 lowRes / aspect 算 RT 尺寸 */
  function computeTargetSize() {
    const lo = clampNum(state.lowRes, 0.25, 8)
    const h = Math.round(clampNum(BASE_HEIGHT / lo, MIN_HEIGHT, MAX_HEIGHT))
    const w = Math.round(clampNum(h * aspect, 2, 4096))
    return { w: Math.max(2, w), h: Math.max(2, h) }
  }

  /** 建立 / 复用 RT；失败返回 false（调用方走降级路径） */
  function ensureTarget(w, h) {
    if (failed || disposed) return false
    try {
      if (rt && rt.width === w && rt.height === h) return true
      if (rt) {
        rt.dispose()
        rt = null
      }
      rt = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: pickTextureType(),
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false,
      })
      rt.texture.name = 'rustfall:post-lowres'
      rt.texture.generateMipmaps = false
      rt.texture.minFilter = THREE.NearestFilter
      rt.texture.magFilter = THREE.NearestFilter
      // RT 里存的是线性值（three 不对普通 RT 做 sRGB 编码），采样时也不做硬件解码
      if (THREE.NoColorSpace !== undefined) rt.texture.colorSpace = THREE.NoColorSpace
      material.uniforms.uTex.value = rt.texture
      material.uniforms.uTarget.value.set(w, h)
      return true
    } catch (e) {
      // RT 建不出来（显存 / 上下文 / 类型不支持）→ 永久降级
      failed = true
      rt = null
      material.uniforms.uTex.value = null
      return false
    }
  }

  /** 同步画布尺寸 / 输出分辨率 / 放大倍率 / 编码标记 */
  function syncScreen() {
    if (!renderer) return
    try {
      if (typeof renderer.getSize === 'function') {
        const v = renderer.getSize(new THREE.Vector2())
        if (v.x > 0 && v.y > 0) {
          if (Math.abs(v.x - cssW) > 0.5 || Math.abs(v.y - cssH) > 0.5) {
            cssW = v.x
            cssH = v.y
            // 只有没被显式 resize 约束过，才自动跟随画布 aspect
            if (!explicitAspect) {
              const a = cssW / Math.max(1, cssH)
              if (isFinite(a) && a > 0) aspect = a
            }
            const t = computeTargetSize()
            ensureTarget(t.w, t.h)
          }
        }
      }
    } catch (e) {
      /* 读尺寸失败不影响渲染 */
    }

    let dw = cssW
    let dh = cssH
    try {
      if (typeof renderer.getDrawingBufferSize === 'function') {
        const d = renderer.getDrawingBufferSize(new THREE.Vector2())
        if (d.x > 0 && d.y > 0) {
          dw = d.x
          dh = d.y
        }
      }
    } catch (e) {
      /* 同上 */
    }

    const u = material.uniforms
    u.uResolution.value.set(dw, dh)
    const rth = rt ? rt.height : BASE_HEIGHT
    u.uPixel.value = clampNum(dh / Math.max(1, rth), 1, 16)
    // 场景写进 RT 是线性的；若渲染器输出目标是 sRGB 屏，末段要自己编码
    let encode = 1
    if (THREE.LinearSRGBColorSpace !== undefined && renderer.outputColorSpace === THREE.LinearSRGBColorSpace) {
      encode = 0
    }
    u.uEncode.value = encode
  }

  // ——— 泛光通道：RT / 渲染 ————————————————————————————————————

  /** 泛光 RT 尺寸：低分辨率 RT 的一半（软、便宜） */
  function glowSize() {
    const w = Math.max(2, Math.round((rt ? rt.width : 640) / 2))
    const h = Math.max(2, Math.round((rt ? rt.height : 360) / 2))
    return { w: w, h: h }
  }

  function disposeGlowTargets() {
    try {
      if (glowA) glowA.dispose()
    } catch (e) {
      /* ignore */
    }
    try {
      if (glowB) glowB.dispose()
    } catch (e) {
      /* ignore */
    }
    glowA = null
    glowB = null
    material.uniforms.uGlowTex.value = null
  }

  /** 建立泛光 RT。失败只关掉泛光通道（glowFailed），绝不影响主画面 */
  function ensureGlowTargets() {
    if (failed || disposed) return false
    const s = glowSize()
    try {
      if (glowA && glowB && glowA.width === s.w && glowA.height === s.h) return true
      disposeGlowTargets()
      const opts = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: pickTextureType(),
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      }
      glowA = new THREE.WebGLRenderTarget(s.w, s.h, opts)
      glowB = new THREE.WebGLRenderTarget(s.w, s.h, opts)
      glowA.texture.name = 'rustfall:glow-a'
      glowB.texture.name = 'rustfall:glow-b'
      if (THREE.NoColorSpace !== undefined) {
        glowA.texture.colorSpace = THREE.NoColorSpace
        glowB.texture.colorSpace = THREE.NoColorSpace
      }
      material.uniforms.uGlowTex.value = glowA.texture
      return true
    } catch (e) {
      glowFailed = true
      disposeGlowTargets()
      return false
    }
  }

  /**
   * 泛光三个 pass：场景 → 高亮抽取 → 水平模糊 → 垂直模糊（结果留在 glowA）。
   * 任一步抛错都只关掉泛光通道，不影响后面的主输出。
   */
  function renderGlowPasses() {
    const u = material.uniforms
    // 1) 高亮抽取：场景 RT → glowA
    brightMaterial.uniforms.uTex.value = rt.texture
    glowMesh.material = brightMaterial
    renderer.setRenderTarget(glowA)
    renderer.clear()
    renderer.render(glowScene, quadCam)

    // 2) 水平模糊：glowA → glowB
    blurMaterial.uniforms.uTex.value = glowA.texture
    blurMaterial.uniforms.uDir.value.set(1 / Math.max(1, glowA.width), 0)
    glowMesh.material = blurMaterial
    renderer.setRenderTarget(glowB)
    renderer.clear()
    renderer.render(glowScene, quadCam)

    // 3) 垂直模糊：glowB → glowA
    blurMaterial.uniforms.uTex.value = glowB.texture
    blurMaterial.uniforms.uDir.value.set(0, 1 / Math.max(1, glowA.height))
    renderer.setRenderTarget(glowA)
    renderer.clear()
    renderer.render(glowScene, quadCam)

    u.uGlowTex.value = glowA.texture
    renderer.setRenderTarget(null)
  }

  // ——— 降级路径 ——————————————————————————————————————————————

  function fallbackRender(scene, camera) {
    if (!hasRenderer) return
    try {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
    } catch (e) {
      /* 最后一层保护：宁可这一帧什么都不画，也绝不把异常抛给主循环 */
    }
  }

  // ——— 主渲染 ————————————————————————————————————————————————

  function render(scene, camera, dt) {
    if (disposed) return
    if (!enabled || failed || !rt) {
      fallbackRender(scene, camera)
      return
    }

    const step = typeof dt === 'number' && isFinite(dt) ? clampNum(dt, 0, 0.25) : 0
    const u = material.uniforms
    u.uTime.value += step

    // 受伤红闪自动衰减（约 0.4s 归零）；需要常驻红屏就每帧 setUniforms({ damage })
    if (state.damage > 0) {
      state.damage = Math.max(0, state.damage - step * 2.6)
      u.uDamage.value = state.damage
    }

    try {
      syncScreen()

      // 1) 场景 → 低分辨率 RT（最近邻）
      renderer.setRenderTarget(rt)
      renderer.clear()
      renderer.render(scene, camera)

      // 1.5) 可选泛光：单独 try/catch —— 这条通道失败只关掉它自己
      if (glowEnabled && !glowFailed && glowA && glowB) {
        try {
          renderGlowPasses()
          u.uGlow.value = glowParams.strength
        } catch (glowErr) {
          glowFailed = true
          u.uGlow.value = 0
          try {
            renderer.setRenderTarget(null)
          } catch (e) {
            /* ignore */
          }
        }
      } else {
        u.uGlow.value = 0
      }

      // 2) 全屏 quad → 屏幕（最近邻放大 = 像素风）
      renderer.setRenderTarget(null)
      if (typeof renderer.getSize === 'function') {
        const v = renderer.getSize(new THREE.Vector2())
        if (v.x > 0 && v.y > 0) renderer.setViewport(0, 0, v.x, v.y)
      }
      renderer.render(quadScene, quadCam)
    } catch (err) {
      // 任何运行时异常（shader 编译失败 / 上下文丢失）→ 降级，不冒泡
      failed = true
      try {
        renderer.setRenderTarget(null)
      } catch (e) {
        /* ignore */
      }
      fallbackRender(scene, camera)
    }
  }

  // ——— 尺寸 ————————————————————————————————————————————————

  function resize(w, h, asp) {
    if (disposed) return
    const W = Number(w)
    const H = Number(h)
    if (isFinite(W) && W > 0) cssW = W
    if (isFinite(H) && H > 0) cssH = H
    const a = Number(asp)
    if (isFinite(a) && a > 0) {
      aspect = a
      explicitAspect = true
    } else if (cssH > 0) {
      aspect = cssW / cssH
      explicitAspect = true
    }
    const t = computeTargetSize()
    ensureTarget(t.w, t.h)
    if (glowEnabled && !glowFailed) ensureGlowTargets()
    try {
      syncScreen()
    } catch (e) {
      /* ignore */
    }
  }

  // ——— 参数 ————————————————————————————————————————————————

  const UNIFORM_KEYS = {
    grain: 'uGrain',
    scanline: 'uScanline',
    vignette: 'uVignette',
    chromatic: 'uChromatic',
    toxicity: 'uToxicity',
    smoke: 'uSmoke',
    damage: 'uDamage',
    saturate: 'uSaturate',
    // —— 昼夜 / 天气总谱 ——
    ambient: 'uAmbient',
    night: 'uNight',
    wetness: 'uWetness',
    fog: 'uFog',
  }

  function setUniforms(partial) {
    if (!partial || typeof partial !== 'object' || disposed) return
    const u = material.uniforms
    for (const key in UNIFORM_KEYS) {
      if (partial[key] === undefined) continue
      const v = Number(partial[key])
      if (!isFinite(v)) continue
      state[key] = v
      u[UNIFORM_KEYS[key]].value = v
    }
    // tint: [r,g,b] / THREE.Color / {r,g,b}
    if (partial.tint !== undefined) {
      const t = partial.tint
      let r = state.tint[0]
      let g = state.tint[1]
      let b = state.tint[2]
      if (Array.isArray(t) && t.length >= 3) {
        r = Number(t[0])
        g = Number(t[1])
        b = Number(t[2])
      } else if (t && typeof t === 'object') {
        r = Number(t.r)
        g = Number(t.g)
        b = Number(t.b)
      }
      if (isFinite(r) && isFinite(g) && isFinite(b)) {
        state.tint = [r, g, b]
        u.uTint.value.set(r, g, b)
      }
    }
    // weatherTint: [r,g,b] / THREE.Color / {r,g,b}（默认 1,1,1 = 中性）
    if (partial.weatherTint !== undefined) {
      const t = partial.weatherTint
      let r = state.weatherTint[0]
      let g = state.weatherTint[1]
      let b = state.weatherTint[2]
      if (Array.isArray(t) && t.length >= 3) {
        r = Number(t[0])
        g = Number(t[1])
        b = Number(t[2])
      } else if (t && typeof t === 'object') {
        r = Number(t.r)
        g = Number(t.g)
        b = Number(t.b)
      }
      if (isFinite(r) && isFinite(g) && isFinite(b)) {
        state.weatherTint = [r, g, b]
        u.uWeatherTint.value.set(r, g, b)
      }
    }
    if (partial.lowRes !== undefined) setPixelSize(partial.lowRes)
  }

  // ——— 可选泛光通道 ——————————————————————————————————————————

  /**
   * 开关泛光（默认关闭）。
   * 开启会额外建 2 张半分辨率 RT 并每帧跑 3 个 pass；
   * 任何一步失败都只是把这条通道关掉（glow=false / glowFailed=true），主画面不受影响。
   */
  function setGlow(on) {
    if (disposed) return
    glowEnabled = !!on
    if (!glowEnabled) {
      material.uniforms.uGlow.value = 0
      return
    }
    glowFailed = false
    const ok = ensureGlowTargets()
    material.uniforms.uGlow.value = ok ? glowParams.strength : 0
    if (!ok) glowEnabled = false
  }

  /** 泛光参数：strength 0..2 / threshold 0..4 / knee 0.01..1 */
  function setGlowStrength(strength) {
    const v = Number(strength)
    if (!isFinite(v)) return
    glowParams.strength = clampNum(v, 0, 2)
    if (glowEnabled && !glowFailed) material.uniforms.uGlow.value = glowParams.strength
  }

  function setGlowParams(partial) {
    if (!partial || typeof partial !== 'object') return
    const s = Number(partial.strength)
    if (isFinite(s)) setGlowStrength(s)
    const t = Number(partial.threshold)
    if (isFinite(t)) {
      glowParams.threshold = clampNum(t, 0, 4)
      brightMaterial.uniforms.uThreshold.value = glowParams.threshold
    }
    const k = Number(partial.knee)
    if (isFinite(k)) {
      glowParams.knee = clampNum(k, 0.001, 1)
      brightMaterial.uniforms.uKnee.value = glowParams.knee
    }
  }

  /** lowRes 别名：1 = 360p 基准（默认），2 = 更粗，0.5 = 更细 */
  function setPixelSize(v) {
    if (disposed) return
    const f = Number(v)
    if (!isFinite(f) || f <= 0) return
    state.lowRes = clampNum(f, 0.25, 8)
    const t = computeTargetSize()
    ensureTarget(t.w, t.h)
    if (glowEnabled && !glowFailed) ensureGlowTargets()
    if (rt) material.uniforms.uTarget.value.set(rt.width, rt.height)
  }

  function setEnabled(v) {
    enabled = !!v
  }

  /** 便捷：触发一次受伤红闪（damage 会自动衰减） */
  function flashDamage(amount) {
    const a = Number(amount)
    const v = clampNum(isFinite(a) ? a : 1, 0, 1)
    state.damage = v
    material.uniforms.uDamage.value = v
  }

  // ——— 释放 ————————————————————————————————————————————————

  function dispose() {
    if (disposed) return
    disposed = true
    try {
      if (rt) rt.dispose()
    } catch (e) {
      /* ignore */
    }
    rt = null
    disposeGlowTargets()
    try {
      quadScene.remove(quad)
      glowScene.remove(glowMesh)
      geometry.dispose()
      material.dispose()
      brightMaterial.dispose()
      blurMaterial.dispose()
    } catch (e) {
      /* ignore */
    }
  }

  // ——— 对外 ————————————————————————————————————————————————

  // 先按 16:9 建一张目标（无论调用方是否先 resize，第一帧就能正常工作）
  if (!failed) {
    const t0 = computeTargetSize()
    ensureTarget(t0.w, t0.h)
  }

  const api = {
    render: render,
    resize: resize,
    setUniforms: setUniforms,
    setPixelSize: setPixelSize,
    setEnabled: setEnabled,
    flashDamage: flashDamage,
    setGlow: setGlow,
    setGlowStrength: setGlowStrength,
    setGlowParams: setGlowParams,
    dispose: dispose,
    /** 低分辨率 RT 尺寸（像素化后的内部分辨率） */
    get size() {
      return {
        width: rt ? rt.width : 0,
        height: rt ? rt.height : 0,
        w: rt ? rt.width : 0,
        h: rt ? rt.height : 0,
      }
    },
    /** 输出画布尺寸（CSS 像素） */
    get screenSize() {
      return { width: cssW, height: cssH, w: cssW, h: cssH }
    },
    get enabled() {
      return enabled
    },
    /** 是否已经降级（调试面板可以显示这个） */
    get fallback() {
      return failed
    },
    /** 当前参数快照（调试/设置面板回显） */
    get params() {
      return {
        grain: state.grain,
        scanline: state.scanline,
        vignette: state.vignette,
        chromatic: state.chromatic,
        toxicity: state.toxicity,
        smoke: state.smoke,
        damage: state.damage,
        saturate: state.saturate,
        tint: state.tint.slice(),
        lowRes: state.lowRes,
        ambient: state.ambient,
        night: state.night,
        weatherTint: state.weatherTint.slice(),
        wetness: state.wetness,
        fog: state.fog,
        glow: glowEnabled && !glowFailed,
      }
    },
    /** 泛光通道是否开着且可用 */
    get glow() {
      return glowEnabled && !glowFailed
    },
    /** 泛光通道是否曾经失败（失败即永久关闭，调试面板可显示） */
    get glowFailed() {
      return glowFailed
    },
    /** 内部 RT（外部要接自己的后处理时可用；不要在外部 dispose） */
    get target() {
      return rt
    },
    /** 内部材质（外部要改 uXxx 时可用） */
    get material() {
      return material
    },
  }

  return api
}
