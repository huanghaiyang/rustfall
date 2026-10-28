// ============================================================================
// 锈雨 · RUSTFALL —— AI BOSS 特效序列帧播放层
// ----------------------------------------------------------------------------
// public/sprites/vfx/*.png 由 scripts/boss-vfx-post.mjs 生成：
//   每张图是 8 帧（4×2）横向排布的纯黑底特效序列，AdditiveBlending 下黑底不可见。
// 这里提供：
//   · vfxForMove()：把现有 6 招体系（全部招式 id）映射到 22 类通用特效
//   · preloadBossVfx()：BOSS 进场时按需载入本场需要的几类特效
//   · playBossVfx() / updateBossVfx()：一次性播放 + 逐帧推进
// BOSS 专属特效：在 BOSS_VFX_OVERRIDES 里按 bossId → 招式 id → 图集名覆盖，
// 图集存在时优先使用，否则自动回退到通用特效。
// ============================================================================

import * as THREE from 'three'

/** 22 类通用特效（与 art-source/vfx 生成清单一一对应）。 */
export const VFX_FAMILIES = [
  'beam_lance',
  'bolt_fan',
  'summon_portal',
  'ground_burst',
  'shockwave_ring',
  'charge_trail',
  'missile_barrage',
  'lightning_arc',
  'acid_cloud',
  'fire_blast',
  'frost_shard',
  'blood_spray',
  'shadow_grasp',
  'gravity_well',
  'healing_glow',
  'shield_barrier',
  'drone_swarm',
  'spike_eruption',
  'vortex',
  'death_collapse',
  'sonic_wave',
  'radiation_pulse',
]

/** BOSS 专属特效图集覆盖表（按需生成后填在这里；缺图自动回退通用特效）。 */
export const BOSS_VFX_OVERRIDES = {
  // 示例：tb_data_archon: { da_delete_beam: 'boss_data_erasure' },
}

// 关键词 → 特效家族。顺序有意义：先匹配更具体的语义。
const RULES = [
  [/召唤|召来|唤来|增援|仆从|随从|summon|call|crew|servant|brood|spawn|reinforce|escort|flock|herd|rats|minion/, 'summon_portal'],
  [/治疗|回复|再生|修复|heal|care|nurse|repair|mend|regen|restore/, 'healing_glow'],
  [/护盾|屏障|护罩|甲|shield|barrier|armor|bulwark|aegis|protect/, 'shield_barrier'],
  [/雷|电|弧光|lightning|arc|electric|overload|transformer|wire|grid|static|volt/, 'lightning_arc'],
  [/冰|霜|寒|冻|frost|ice|freeze|snow|chill/, 'frost_shard'],
  [/火|焰|焚|烧|forge|fire|flame|furnace|boiler|thermal|burn|blaze|heat|scald/, 'fire_blast'],
  [/酸|毒|腐|蚀|孢子|酸雾|acid|poison|toxic|virus|infection|spore|gas|mire|swamp|pulp|spill|corrode/, 'acid_cloud'],
  [/血|腥|crimson|blood|bleed|vampire|sanguine/, 'blood_spray'],
  [/影|暗|雾|鬼|幽|shadow|dark|blackout|fog|whisper|ghost|specter|phantom|stalker|hollow|nightmare/, 'shadow_grasp'],
  [/重力|引力|虚空|陨|gravity|void|singularity|meteor|orbit|weight|anomaly/, 'gravity_well'],
  [/旋|涡|龙卷|tornado|vortex|whirl|cyclone|maelstrom|spiral/, 'vortex'],
  [/无人|哨戒|蜂|虫群|drone|sentry|turret|swarm|insect|bug|wasp|locust/, 'drone_swarm'],
  [/刺|根|藤|棘|spike|thorn|root|vine|tree|branch|bramble|bloom/, 'spike_eruption'],
  [/导弹|炮击|榴弹|弹幕齐射|missile|lob|toss|artillery|grenade|bomb|shell|boulder|debris|chandelier|container|winch|barrage/, 'missile_barrage'],
  [/激光|光束|射线|删除|光柱|beam|laser|ray|lance|focus|delete|photon|solar|lens|flare|searchlight|beacon|signal|stare/, 'beam_lance'],
  [/散射|扇射|齐射|弹|volley|fan|spread|shot|rifle|gun|bolt|quill|crossfire|pellet/, 'bolt_fan'],
  [/冲锋|突进|践踏|冲撞|charge|rush|ram|trample|dive|sprint|stampede/, 'charge_trail'],
  [/砸|震地|地裂|踏|拳|锤|slam|crush|smash|drop|bell|toll|hook|piston|stomp|quake/, 'ground_burst'],
  [/波|潮|浪|洪|脉冲|爆发|溢出|wave|tide|surge|flood|pulse|shock|burst|overflow/, 'shockwave_ring'],
  [/声|音|吼|啸|嚎|歌|song|sonic|sound|bass|amp|drum|note|wail|roar|scream|howl|choir|sermon|feedback/, 'sonic_wave'],
  [/辐|核|反应堆|radiation|reactor|nuclear|atom|isotope|fallout/, 'radiation_pulse'],
  [/死|亡|终|崩|collapse|death|doom|end|zero|ruin|erase|rewrite/, 'death_collapse'],
]

const DEFAULT_VFX = 'shockwave_ring'

/** 招式 → 特效图集名。moveId 为技能 id，name 为技能中文名（可选，用于兜底）。 */
export function vfxForMove(moveId, name = '', bossId = '') {
  const key = String(moveId || '')
  const boss = bossId ? BOSS_VFX_OVERRIDES[bossId] : null
  if (boss && boss[key]) return boss[key]
  const text = `${key} ${name}`.toLowerCase()
  for (const [re, fam] of RULES) if (re.test(text)) return fam
  return DEFAULT_VFX
}

/** 某个 BOSS 六招各自需要的特效名（去重，供进场预载）。 */
export function vfxNamesForBoss(moves = [], bossId = '') {
  const out = new Set()
  for (const mv of moves) {
    const id = typeof mv === 'string' ? mv : mv?.id
    const name = typeof mv === 'string' ? '' : mv?.name || ''
    if (id) out.add(vfxForMove(id, name, bossId))
  }
  return [...out]
}

// ---------------------------------------------------------------------------
// 图集加载
// ---------------------------------------------------------------------------
const META = new Map()
const ATLAS = new Map()
const PENDING = new Map()
let manifestPromise = null

function assetUrl(rel) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  return (base.endsWith('/') ? base : base + '/') + rel.replace(/^\/+/, '')
}

function loadManifest() {
  if (manifestPromise) return manifestPromise
  manifestPromise = fetch(assetUrl('sprites/vfx/manifest.json'))
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && typeof json === 'object') for (const [k, v] of Object.entries(json)) if (v?.file) META.set(k, v)
      return META
    })
    .catch(() => META)
  return manifestPromise
}

function loadAtlas(name) {
  if (ATLAS.has(name)) return Promise.resolve(ATLAS.get(name))
  if (PENDING.has(name)) return PENDING.get(name)
  const job = loadManifest()
    .then((meta) => {
      const info = meta.get(name)
      if (!info) return null
      return new Promise((resolve) => {
        new THREE.TextureLoader().load(
          assetUrl(info.file),
          (tex) => {
            tex.magFilter = THREE.NearestFilter
            tex.minFilter = THREE.LinearFilter
            tex.generateMipmaps = false
            tex.colorSpace = THREE.SRGBColorSpace
            tex.wrapS = THREE.ClampToEdgeWrapping
            tex.wrapT = THREE.ClampToEdgeWrapping
            const count = Math.max(1, info.count || 8)
            const frames = []
            for (let i = 0; i < count; i++) {
              const t = tex.clone()
              t.magFilter = THREE.NearestFilter
              t.minFilter = THREE.LinearFilter
              t.generateMipmaps = false
              t.colorSpace = THREE.SRGBColorSpace
              t.repeat.set(1 / count, 1)
              t.offset.set(i / count, 0)
              t.needsUpdate = true
              frames.push(t)
            }
            const atlas = {
              frames,
              count,
              fps: info.fps || 18,
              aspect: info.frameW / info.frameH || 1,
              // 品红键控素材用 NormalBlending（边缘干净），老黑底素材仍走 Additive
              key: info.key || 'black',
              blend: info.blend || (info.key === 'magenta' ? 'normal' : 'additive'),
            }
            ATLAS.set(name, atlas)
            resolve(atlas)
          },
          undefined,
          () => resolve(null),
        )
      })
    })
    .catch(() => null)
    .then((a) => {
      PENDING.delete(name)
      return a
    })
  PENDING.set(name, job)
  return job
}

/** 预载若干特效图集（BOSS 进场时调用）。 */
export function preloadBossVfx(names = []) {
  return loadManifest().then(() => Promise.all([...new Set(names)].filter(Boolean).map(loadAtlas)))
}

/** 已加载的特效名（自检用）。 */
export function loadedVfxNames() {
  return [...ATLAS.keys()]
}

// ---------------------------------------------------------------------------
// 播放
// ---------------------------------------------------------------------------
const ACTIVE = []

const _color = new THREE.Color()

/**
 * 在 (x, y) 播放一次特效序列。
 * opts: { size, rot, flip, color, opacity, fps, z }
 * 返回 true 表示已开始播放；false 表示图集还没加载好（已自动触发加载）。
 */
export function playBossVfx(game, name, x, y, opts = {}) {
  const atlas = ATLAS.get(name)
  if (!atlas) {
    loadAtlas(name)
    return false
  }
  const scene = game?.scene
  if (!scene) return false
  const size = opts.size ?? 150
  const aspect = atlas.aspect || 1
  const geo = new THREE.PlaneGeometry(1, 1)
  const keyed = atlas.blend === 'normal'
  const mat = new THREE.MeshBasicMaterial({
    map: atlas.frames[0],
    transparent: true,
    opacity: opts.opacity ?? 1,
    blending: keyed ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    alphaTest: keyed ? 0.5 : 0,
  })
  // 键控素材已经是完整配色，不再叠 accent 染色（染色会压暗）
  if (opts.color != null && !keyed) {
    _color.set(opts.color)
    mat.color.copy(_color)
  }
  const baseW = size * aspect
  const baseH = size
  const flip = !!opts.flip
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, -y, opts.z ?? 8)
  mesh.rotation.z = opts.rot || 0
  mesh.scale.set(flip ? -baseW : baseW, baseH, 1)
  mesh.renderOrder = 20
  scene.add(mesh)
  ACTIVE.push({
    mesh,
    mat,
    geo,
    frames: atlas.frames,
    count: atlas.count,
    fps: opts.fps || atlas.fps,
    life: atlas.count / (opts.fps || atlas.fps),
    t: 0,
    baseOpacity: opts.opacity ?? 1,
    baseW,
    baseH,
    flip,
    grow: opts.grow ?? 0,
  })
  return true
}

/** 游戏每帧调用（game.updatePlaying）。 */
export function updateBossVfx(dt) {
  if (!ACTIVE.length) return
  for (let i = ACTIVE.length - 1; i >= 0; i--) {
    const a = ACTIVE[i]
    a.t += dt
    const idx = Math.min(a.count - 1, Math.floor(a.t * a.fps))
    const next = a.frames[idx]
    if (a.mat.map !== next) {
      a.mat.map = next
      a.mat.needsUpdate = true
    }
    const k = a.t / a.life
    if (a.grow) {
      const f = 1 + a.grow * k
      a.mesh.scale.set((a.flip ? -1 : 1) * a.baseW * f, a.baseH * f, 1)
    }
    a.mat.opacity = a.baseOpacity * (1 - Math.max(0, (k - 0.72) / 0.28))
    if (a.t >= a.life) {
      a.mesh.parent?.remove(a.mesh)
      a.geo.dispose()
      a.mat.dispose()
      ACTIVE.splice(i, 1)
    }
  }
}

/** 切房 / 退出时清空未播完的特效。 */
export function clearBossVfx() {
  for (const a of ACTIVE) {
    a.mesh.parent?.remove(a.mesh)
    a.geo.dispose()
    a.mat.dispose()
  }
  ACTIVE.length = 0
}
