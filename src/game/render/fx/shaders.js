// ============================================================================
// 锈雨 · RUSTFALL —— GLSL 后期 / 氛围着色器
//
//   导出：
//     POST_VERT / POST_FRAG        全屏后期（像素化 + 颗粒 + 色差 + 暗角 + 扫描线
//                                  + 毒雾染色 + 受伤红闪 + 对比/饱和/色调映射）
//     SMOKE_VERT / SMOKE_FRAG      世界空间浓烟（3 层 FBM 缓慢翻卷）
//     GODRAY_FRAG                  尘光柱（向下渐隐 + 噪声闪烁）
//     TOXIC_FRAG                   毒液 / 酸水（流动噪声 + 气泡 + 表面高光）
//     createSmokeMaterial(colorHex)
//     createGodRayMaterial(colorHex)
//     createToxicMaterial()
//
//   约定：
//   · 不用 three/examples，不用 `#include`：噪声函数全部自写（hash21 / value noise / FBM）。
//   · 写法是 GLSL ES 1.00（three 的默认 ShaderMaterial 版本）；WebGL2 下由 three 自动加前缀，
//     两种上下文都能编译。循环全部使用常量上界，没有动态数组下标、没有 switch。
//   · 所有位移/时间类 uniform 都由外部驱动（uTime 秒，uOpacity 0..1，uScroll 是"每秒滚动速度"）。
// ============================================================================

import * as THREE from 'three'
import { PAL } from '../palette.js'

/* ============================================================================
 * 0. 公共：噪声片段（以字符串拼接代替 #include）
 * ========================================================================== */

/**
 * hash21 / 1D hash / value noise / 2D FBM。
 * 所有 shader 共用这一段，保证噪声风格统一。
 */
const GLSL_NOISE = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/* 4 层 FBM，0..1 */
float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

/* 3 层 FBM，便宜版本（后期/光柱用） */
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.11 + vec2(3.1, 1.3);
    a *= 0.5;
  }
  return v;
}

/* 4x4 有序抖动（Bayer），返回 0..1 */
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}
`

/* ============================================================================
 * 1. 全屏后期
 * ========================================================================== */

export const POST_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * POST_FRAG
 * uniform:
 *   sampler2D uTex          低分辨率场景 RT
 *   vec2  uResolution       输出画布像素尺寸（屏幕空间效果用）
 *   vec2  uTarget           低分辨率 RT 尺寸（像素化采样网格）
 *   float uTime             秒
 *   float uGrain            0..0.6   胶片颗粒    默认 0.12
 *   float uScanline         0..0.6   扫描线      默认 0.12
 *   float uVignette         0..1     暗角        默认 0.55
 *   float uChromatic        0..0.02  色差        默认 0.0018
 *   float uToxicity         0..1     毒雾黄绿染色 默认 0
 *   float uSmoke            0..1     烟尘浓度（去饱和）默认 0
 *   float uDamage           0..1     受伤红闪    默认 0
 *   float uSaturate         0..2     饱和度      默认 0.92
 *   vec3  uTint             偏暖锈色（0..1 各通道）默认 rustLight
 *   float uPixel            像素放大倍率（>=1，影响扫描线密度与抖动尺寸）
 *   float uEncode           1 = 末段做 linear→sRGB（默认 1）
 *   —— 昼夜 / 天气总谱（默认全中性，等于完全不生效）——
 *   float uAmbient          0..1   环境光量      默认 1（1 = 中性；0 → 整体 ×0.5）
 *   float uNight            0..1   夜晚冷调      默认 0
 *   vec3  uWeatherTint      0..4   天气染色（乘） 默认 (1,1,1)
 *   float uWetness          0..1   湿滑 / 反光   默认 0
 *   float uFog              0..1   距离雾（上方更浓）默认 0
 *   —— 可选泛光通道 ——
 *   sampler2D uGlowTex      泛光图（postfx 内部"提亮 + 两次模糊"的结果）
 *   float uGlow             0..2   泛光强度；0 = 关闭（分支直接跳过，不采样）
 */
export const POST_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uTarget;
uniform float uTime;
uniform float uGrain;
uniform float uScanline;
uniform float uVignette;
uniform float uChromatic;
uniform float uToxicity;
uniform float uSmoke;
uniform float uDamage;
uniform float uSaturate;
uniform vec3 uTint;
uniform float uPixel;
uniform float uEncode;
uniform float uAmbient;
uniform float uNight;
uniform vec3 uWeatherTint;
uniform float uWetness;
uniform float uFog;
uniform sampler2D uGlowTex;
uniform float uGlow;

varying vec2 vUv;

${GLSL_NOISE}

vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  // ---- 0) 像素化：把采样点吸附到低分辨率 RT 的像素中心（最近邻放大）
  vec2 lowRes = max(uTarget, vec2(2.0));
  vec2 grid = floor(vUv * lowRes) + 0.5;
  vec2 uv = grid / lowRes;

  vec2 dir = uv - 0.5;
  float r2 = dot(dir, dir);

  // ---- 1) 轻微色差（越靠边越明显）
  float ca = uChromatic * (0.45 + r2 * 3.2);
  vec3 col;
  col.r = texture2D(uTex, uv + dir * ca).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - dir * ca * 0.9).b;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // ---- 1.5) 昼夜 / 天气总谱（默认全中性：ambient=1 / night=0 / weatherTint=1 / wetness=0 / fog=0）
  // 环境光量：1 → 不变；0 → 整体压到 0.5（夜晚靠它 + uNight 一起压暗）
  col *= 0.5 + 0.5 * clamp(uAmbient, 0.0, 1.0);

  // 夜晚：冷蓝偏色 + 略去饱和 + 暗部抬蓝（月光/毒雾散射）
  float night = clamp(uNight, 0.0, 1.0);
  if (night > 0.001) {
    vec3 nc = col * vec3(0.76, 0.88, 1.2);
    float nl = dot(nc, vec3(0.299, 0.587, 0.114));
    nc = mix(vec3(nl), nc, 0.82);
    nc += vec3(0.004, 0.008, 0.02) * (1.0 - clamp(nl, 0.0, 1.0));
    col = mix(col, nc, night * 0.88);
  }

  // 天气染色（乘法；默认 (1,1,1) 时恒等）
  vec3 wt = clamp(uWeatherTint, vec3(0.0), vec3(4.0));
  col *= mix(vec3(1.0), wt, 0.9);

  // 距离雾：越靠画面上方越浓（远景在那边），颜色由天气色 × 昼夜决定
  float fog = clamp(uFog, 0.0, 1.0);
  if (fog > 0.001) {
    vec3 fogBase = mix(vec3(0.40, 0.38, 0.32), vec3(0.085, 0.11, 0.15), night);
    vec3 fogCol = fogBase * wt;
    float band = 0.5 + 0.5 * smoothstep(0.02, 0.95, vUv.y);
    col = mix(col, fogCol, clamp(fog * band, 0.0, 0.88));
  }

  // 湿滑：压暗 + 冷高光 + 轻微 S 曲线 + 竖向水痕
  float wet = clamp(uWetness, 0.0, 1.0);
  if (wet > 0.001) {
    col *= 1.0 - 0.10 * wet;
    float wl = dot(col, vec3(0.299, 0.587, 0.114));
    col += vec3(0.02, 0.028, 0.034) * wet * smoothstep(0.22, 0.85, wl);
    col = mix(col, col * col * 1.3, wet * 0.16);
    float streak = fbm3(vec2(vUv.x * 84.0, vUv.y * 5.5 - uTime * 0.55));
    col *= 1.0 - wet * 0.055 * smoothstep(0.52, 0.92, streak);
  }

  // 上面几档会改变整体明度，重算一次亮度给后续（毒雾/烟/受伤）用
  lum = dot(col, vec3(0.299, 0.587, 0.114));

  // ---- 2) 毒雾染色（黄绿，只在暗部压进去，避免整屏发绿）
  float tox = clamp(uToxicity, 0.0, 1.0);
  vec3 toxCol = vec3(lum * 0.86, lum * 1.06, lum * 0.52);
  col = mix(col, col * vec3(0.94, 1.05, 0.8) + toxCol * 0.06, tox * 0.65);
  // 贴地毒雾：画面下方额外加一点黄绿
  float lowBand = smoothstep(0.55, 0.0, vUv.y);
  col += tox * lowBand * vec3(0.006, 0.016, 0.0);

  // ---- 3) 烟尘：去饱和 + 压暗 + 轻微提亮高光（灰扑扑）
  float smoke = clamp(uSmoke, 0.0, 1.0);
  vec3 dusty = vec3(lum * 1.03, lum * 0.99, lum * 0.92);
  col = mix(col, dusty, smoke * 0.62);
  col *= 1.0 - smoke * 0.16;

  // ---- 4) 受伤红闪（整屏压红 + 边缘脉冲）
  float dmg = clamp(uDamage, 0.0, 1.0);
  if (dmg > 0.001) {
    float pulse = 0.6 + 0.4 * sin(uTime * 11.0);
    float edge = smoothstep(0.18, 0.72, length(dir * vec2(1.0, 1.15)) * 1.5);
    col = mix(col, vec3(0.5, 0.05, 0.035) * (0.35 + lum * 1.6), dmg * (0.2 + 0.42 * pulse));
    col += dmg * edge * pulse * vec3(0.3, 0.02, 0.0);
  }

  // ---- 4.5) 可选泛光（关闭时 uGlow = 0 → 整段跳过，连采样都没有）
  if (uGlow > 0.0001) {
    col += texture2D(uGlowTex, vUv).rgb * uGlow;
  }

  // ---- 5) 饱和 / 对比 / 色调映射（都在线性空间里做）
  col = mix(vec3(lum), col, clamp(uSaturate, 0.0, 2.0));
  col = (col - 0.5) * 1.075 + 0.5;
  // 暖锈分级：红上抬、蓝回收（很轻，避免整屏变橙）
  col *= mix(vec3(1.0), uTint * 2.05, 0.12);
  // 软肩色调映射：保暗部、不爆白
  col = max(col, vec3(0.0));
  col = col / (1.0 + col * 0.22);
  col = pow(col, vec3(0.94));
  // 抬一点黑位，绝不出现纯黑死屏
  col = max(col, vec3(0.012, 0.013, 0.016));

  // ---- 6) 转到显示空间
  if (uEncode > 0.5) col = linearToSRGB(col);

  // ---- 7) 屏幕空间叠加：扫描线 → 颗粒 → 暗角 → 抖动
  float pix = max(uPixel, 1.0);
  // 扫描线：周期约 2 个"低分辨率像素"，很淡
  float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159265 / max(pix, 1.0) * 1.0);
  col *= 1.0 - uScanline * (0.55 * scan + 0.2);
  // 缓慢滚动的亮带（CRT 味，极弱）
  float roll = 0.5 + 0.5 * sin(vUv.y * 3.0 - uTime * 0.55);
  col *= 1.0 - 0.018 * roll;

  // 胶片颗粒：一格一个随机值（跟着低分辨率走 → 像素块颗粒）
  vec2 gp = floor(vUv * lowRes);
  float g1 = hash21(gp + vec2(floor(uTime * 24.0) * 1.71, floor(uTime * 24.0) * 2.33));
  float g2 = hash21(gp * 1.37 + vec2(31.7, 11.3) + uTime * 7.0);
  float grain = (g1 - 0.5) * 0.75 + (g2 - 0.5) * 0.25;
  // 暗部颗粒更明显（胶片感）
  float grainMask = 0.55 + 0.75 * (1.0 - smoothstep(0.0, 0.55, lum));
  col += grain * uGrain * grainMask;

  // 暗角
  float vg = length(dir * vec2(1.0, 0.94)) * 1.42;
  float vig = smoothstep(0.34, 1.12, vg);
  col *= 1.0 - uVignette * vig * 0.9;
  // 受伤时暗角更重
  col *= 1.0 - dmg * vig * 0.35;

  // 有序抖动，压掉 8bit 色带（尤其天空渐变）
  col += (bayer4(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`

/* ============================================================================
 * 1.5 可选泛光通道（提亮抽取 + 两次可分离模糊）
 *
 *   这两段只被 postfx 内部的"近黑盒"使用：默认关闭，只有 setGlow(true) 才跑。
 *   两者都用 POST_VERT 作顶点着色器（全屏 quad，忽略投影矩阵）。
 * ========================================================================== */

/**
 * BRIGHT_FRAG —— 高亮抽取（带软膝）
 * uniform: uTex, uThreshold（0..4，默认 0.62）, uKnee（0.01..1，默认 0.28）
 */
export const BRIGHT_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uTex;
uniform float uThreshold;
uniform float uKnee;

varying vec2 vUv;

void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + max(uKnee, 0.001), l);
  gl_FragColor = vec4(c * k, 1.0);
}
`

/**
 * BLUR_FRAG —— 9 tap 可分离高斯（水平跑一次、垂直跑一次 = "两次模糊"）
 * uniform: uTex, uDir（一次的 texel 步长，如 (1/w, 0) 或 (0, 1/h)）
 */
export const BLUR_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uTex;
uniform vec2 uDir;

varying vec2 vUv;

void main() {
  vec3 s = vec3(0.0);
  s += texture2D(uTex, vUv - uDir * 4.0).rgb * 0.0162;
  s += texture2D(uTex, vUv - uDir * 3.0).rgb * 0.0540;
  s += texture2D(uTex, vUv - uDir * 2.0).rgb * 0.1216;
  s += texture2D(uTex, vUv - uDir * 1.0).rgb * 0.1946;
  s += texture2D(uTex, vUv).rgb * 0.2270;
  s += texture2D(uTex, vUv + uDir * 1.0).rgb * 0.1946;
  s += texture2D(uTex, vUv + uDir * 2.0).rgb * 0.1216;
  s += texture2D(uTex, vUv + uDir * 3.0).rgb * 0.0540;
  s += texture2D(uTex, vUv + uDir * 4.0).rgb * 0.0162;
  gl_FragColor = vec4(s, 1.0);
}
`

/* ============================================================================
 * 2. 世界空间浓烟
 * ========================================================================== */

export const SMOKE_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

/**
 * SMOKE_FRAG
 * uniform:
 *   vec3  uColor        烟色（会被内部提亮，给 0.4~0.9 的中性灰最像烟）
 *   float uTime         秒
 *   float uOpacity      0..1    整体不透明度
 *   float uScroll       每秒滚动速度（可为负）
 *   vec2  uScrollDir    滚动方向（单位化前的权重）
 *   vec2  uScrollOffset 额外偏移（贴图对齐/风场手动推）
 *   float uScale        噪声频率（越大越碎）
 *   float uEdge         边缘淡出宽度（0.05~0.5）
 *   float uBright       内部被光穿透的提亮量
 */
export const SMOKE_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uScroll;
uniform vec2 uScrollDir;
uniform vec2 uScrollOffset;
uniform float uScale;
uniform float uEdge;
uniform float uBright;

varying vec2 vUv;

${GLSL_NOISE}

void main() {
  vec2 uv = vUv;
  float t = uTime;

  // 三条不同速度 / 尺度的流，叠成缓慢翻卷的烟
  vec2 base = uScrollDir * (uScroll * t) + uScrollOffset;
  float n1 = fbm2(uv * uScale + base + vec2(0.0, -t * 0.045));
  float n2 = fbm2(uv * (uScale * 1.87) + base * 0.62 + vec2(t * 0.021, -t * 0.083));
  float n3 = fbm3(uv * (uScale * 3.31) + base * 1.55 + vec2(-t * 0.036, -t * 0.13));
  float n = n1 * 0.54 + n2 * 0.3 + n3 * 0.16;

  // 形状：阈值 + 平滑，让烟有明确的"团"而不是均匀灰雾
  float shape = smoothstep(0.30, 0.86, n);

  // 边缘淡出（左右 + 上边），底部保留一点密度（烟是从地面升起来的）
  float ex = min(uv.x, 1.0 - uv.x);
  float ey = 1.0 - uv.y;
  float fadeX = smoothstep(0.0, max(uEdge, 0.001), ex);
  float fadeTop = smoothstep(0.0, max(uEdge * 1.15, 0.001), ey);
  float fadeBot = smoothstep(0.0, 0.03, uv.y);
  float edge = fadeX * fadeTop * fadeBot;

  float a = shape * edge * uOpacity;
  if (a < 0.004) discard;

  // 烟内部：被后面的光穿透的地方更亮
  vec3 c = uColor * (0.78 + uBright * (0.35 + 0.85 * n));
  // 一点点冷灰压边（避免整团一个色阶）
  c = mix(c * vec3(0.94, 0.97, 1.0), c, shape);

  gl_FragColor = vec4(c, a);
}
`

/* ============================================================================
 * 3. 尘光柱
 * ========================================================================== */

/**
 * GODRAY_FRAG
 * uniform:
 *   vec3  uColor     光柱颜色（暖尘色）
 *   float uTime      秒
 *   float uOpacity   0..1
 *   float uFlicker   0..1   噪声闪烁强度
 *   float uDir       1 = 向下渐隐（默认），-1 = 向上渐隐
 *   float uNoiseScale 噪声尺度
 */
export const GODRAY_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uFlicker;
uniform float uDir;
uniform float uNoiseScale;

varying vec2 vUv;

${GLSL_NOISE}

void main() {
  vec2 uv = vUv;

  // 沿光柱方向：uv.y 越高越亮（光源在上），向下渐隐
  float y = uDir >= 0.0 ? uv.y : 1.0 - uv.y;
  float fall = smoothstep(0.02, 0.92, y);
  fall = pow(fall, 1.25);

  // 横向：中间亮、两边收
  float across = 1.0 - abs(uv.x * 2.0 - 1.0);
  float beam = pow(clamp(across, 0.0, 1.0), 1.55);

  // 尘埃噪声：慢闪 + 细纹
  float n1 = fbm3(vec2(uv.x * 3.1, uv.y * 1.7 - uTime * 0.32));
  float n2 = fbm3(vec2(uv.x * 11.0 + 3.7, uv.y * 3.3 - uTime * 0.85) * uNoiseScale);
  float dust = 0.42 + 0.58 * n1;
  dust *= 0.72 + 0.28 * n2;
  float flick = mix(1.0, 0.62 + 0.38 * sin(uTime * 2.7 + n1 * 7.0), clamp(uFlicker, 0.0, 1.0));

  float a = beam * fall * dust * flick * uOpacity;
  if (a < 0.003) discard;

  gl_FragColor = vec4(uColor, a);
}
`

/* ============================================================================
 * 4. 毒液 / 酸水
 * ========================================================================== */

export const TOXIC_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

/**
 * TOXIC_FRAG
 * uniform:
 *   vec3  uColor      液体主色（毒绿暗部）
 *   vec3  uHighlight  高光 / 气泡色（毒绿亮）
 *   float uTime       秒
 *   float uOpacity    0..1（液体不透明度，默认 0.92）
 *   float uScroll     流动速度倍率
 *   float uBubble     0..1 气泡数量/强度
 *   float uGloss      0..1 表面高光强度
 *   vec2  uScale      噪声频率（x 大 → 横向更碎）
 */
export const TOXIC_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform vec3 uHighlight;
uniform float uTime;
uniform float uOpacity;
uniform float uScroll;
uniform float uBubble;
uniform float uGloss;
uniform vec2 uScale;

varying vec2 vUv;

${GLSL_NOISE}

void main() {
  vec2 uv = vUv;
  float t = uTime * (0.28 + uScroll * 0.55);

  // ---- 流动表面：两层噪声缓慢错位流动
  vec2 p = uv * uScale;
  float n1 = fbm2(p + vec2(t * 0.55, -t * 0.18));
  float n2 = fbm2(p * 2.31 + vec2(-t * 0.85, t * 0.42));
  float flow = n1 * 0.62 + n2 * 0.38;

  // ---- 气泡：网格 + 随机半径，向上浮
  float b = 0.0;
  if (uBubble > 0.001) {
    vec2 bp = uv * vec2(13.0, 7.0) + vec2(t * 0.4, -t * 1.15);
    vec2 bi = floor(bp);
    vec2 bf = fract(bp) - 0.5;
    float rnd = hash21(bi + 7.7);
    float rad = 0.10 + 0.24 * fract(rnd * 7.31);
    float d = length(bf);
    float shell = smoothstep(rad, rad * 0.62, d) - smoothstep(rad * 0.62, rad * 0.3, d);
    b = shell * step(0.59, rnd) * uBubble;
  }

  // ---- 表面高光：靠近"观察者"的那条带（uv.y 顶部），随噪声断成碎光
  float band = pow(1.0 - abs(uv.y - 0.28) * 1.9, 6.0);
  float spec = band * (0.35 + 0.65 * flow) * uGloss;

  vec3 col = uColor * (0.62 + 1.05 * flow);
  col = mix(col, uHighlight, clamp(b, 0.0, 1.0) * 0.72);
  col += uHighlight * spec * 0.75;
  // 深处压暗
  col *= 0.82 + 0.35 * smoothstep(0.0, 0.65, uv.y);
  // 水面浮渣的不规则亮边
  float crest = smoothstep(0.62, 0.68, flow) - smoothstep(0.68, 0.74, flow);
  col = mix(col, uHighlight, crest * 0.35);

  float a = clamp(uOpacity, 0.0, 1.0) * (0.86 + 0.14 * flow);
  gl_FragColor = vec4(col, a);
}
`

/* ============================================================================
 * 5. 材质工厂
 * ========================================================================== */

/** colorHex 可以是 0xRRGGBB，也可以是 '#rrggbb' */
function toColor(colorHex, fallback) {
  try {
    if (colorHex === undefined || colorHex === null) return new THREE.Color(fallback)
    return new THREE.Color(colorHex)
  } catch (e) {
    return new THREE.Color(fallback)
  }
}

/**
 * 浓烟材质（世界空间平面 / 交叉面片）。
 * uniforms：uTime, uOpacity, uScroll（+ uColor, uScrollDir, uScrollOffset, uScale, uEdge, uBright）
 * uScroll 是"每秒滚动速度"（标量，直接赋数字即可）；想要手控偏移就写 uScrollOffset。
 */
export function createSmokeMaterial(colorHex) {
  const mat = new THREE.ShaderMaterial({
    name: 'RustfallSmoke',
    uniforms: {
      uColor: { value: toColor(colorHex, PAL.dustLight) },
      uTime: { value: 0 },
      uOpacity: { value: 0.55 },
      uScroll: { value: 0.085 },
      uScrollDir: { value: new THREE.Vector2(1.0, -0.22) },
      uScrollOffset: { value: new THREE.Vector2(0, 0) },
      uScale: { value: 2.3 },
      uEdge: { value: 0.2 },
      uBright: { value: 0.55 },
    },
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  })
  mat.userData.kind = 'smoke'
  mat.userData.isRustfallShader = true
  return mat
}

/**
 * 尘光柱材质（加色混合，适合窗缝 / 探照灯 / 尘光）。
 * uniforms：uTime, uOpacity（+ uColor, uFlicker, uDir, uNoiseScale）
 */
export function createGodRayMaterial(colorHex) {
  const mat = new THREE.ShaderMaterial({
    name: 'RustfallGodRay',
    uniforms: {
      uColor: { value: toColor(colorHex, PAL.neonWarm) },
      uTime: { value: 0 },
      uOpacity: { value: 0.3 },
      uFlicker: { value: 0.55 },
      uDir: { value: 1 },
      uNoiseScale: { value: 1 },
    },
    vertexShader: SMOKE_VERT,
    fragmentShader: GODRAY_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  mat.userData.kind = 'godray'
  mat.userData.isRustfallShader = true
  return mat
}

/**
 * 毒液 / 酸水材质（横向流动 + 气泡 + 高光）。
 * uniforms：uTime（+ uColor, uHighlight, uOpacity, uScroll, uBubble, uGloss, uScale）
 */
export function createToxicMaterial() {
  const mat = new THREE.ShaderMaterial({
    name: 'RustfallToxic',
    uniforms: {
      uColor: { value: new THREE.Color(PAL.toxicDark) },
      uHighlight: { value: new THREE.Color(PAL.toxicGlow) },
      uTime: { value: 0 },
      uOpacity: { value: 0.92 },
      uScroll: { value: 1 },
      uBubble: { value: 1 },
      uGloss: { value: 0.8 },
      uScale: { value: new THREE.Vector2(6, 3) },
    },
    vertexShader: TOXIC_VERT,
    fragmentShader: TOXIC_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  })
  mat.userData.kind = 'toxic'
  mat.userData.isRustfallShader = true
  return mat
}

/* ============================================================================
 * 6. 兼容别名（CONTENT-API §6.6 的旧名字 / 其他同学可能用到的名字）
 * ========================================================================== */

/** @deprecated 用 createSmokeMaterial(color)；旧调用不带参数时给中性烟色 */
export function createSmokeMaterialDefault() {
  return createSmokeMaterial(PAL.dustLight)
}

/** 旧名：createToxicWaterMaterial —— 与 createToxicMaterial 等价 */
export function createToxicWaterMaterial() {
  return createToxicMaterial()
}

/** 一次性推进材质时间（方便外部循环里少写一行） */
export function tickMaterial(material, time) {
  if (!material || !material.uniforms) return
  const u = material.uniforms.uTime
  if (u) u.value = time
}

/** 统一设置一组材质的 uTime（场景里几十个烟片时好用） */
export function tickMaterials(materials, time) {
  if (!materials) return
  for (let i = 0; i < materials.length; i++) tickMaterial(materials[i], time)
}

/** 材质是否由本模块创建（避免外部误改别人的材质） */
export function isRustfallShader(material) {
  return !!(material && material.userData && material.userData.isRustfallShader)
}
