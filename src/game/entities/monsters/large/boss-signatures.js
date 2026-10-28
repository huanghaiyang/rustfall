// 51 只主题 BOSS 的第二、第三签名招（每只 2 招，共 102 招）。
//
// 这里只导出 BOSS_SIGNATURES 一个表；合并进 BOSS_KIT_FACTORIES 的动作
// 由 theme-bosses.js 完成——ThemeBoss 构造时会取 BOSS_KIT_FACTORIES[cfg.id]，
// 因此合并方式是在 theme-bosses.js 里把本表按 id 展开到对应 kit 上
// （例如 Object.assign(BOSS_KIT_FACTORIES[id](this), BOSS_SIGNATURES[id](this))），
// 不要在本文件里改动 theme-bosses.js。
//
// 招式的底层原子件全部来自 theme-boss-fx.js 与 common.js，
// 每个 BOSS 的两招在节奏、弹道形态、场地交互上刻意错开，
// 不与其他 BOSS（也不与 theme-boss-kits.js 里的原四招）共用完整招式体。
import { aoe, puff, spark, sfx, shake, roomBounds } from './common.js'
import {
  mark,
  after,
  shot,
  fan,
  ring,
  lob,
  groundWave,
  pushPlayer,
  predictX,
  clampW,
  burst,
  sparkLine,
  summonWave,
  chargeAt,
  feetY,
} from './theme-boss-fx.js'

// ============================================================ 01 数据执政官
function sig_dataArchon(b) {
  const A = b.accent
  return {
    dar_rewrite_world: {
      name: '重写世界',
      en: 'WORLD REWRITE',
      sig: true,
      wind: 0.88,
      cool: 8.2,
      range: [200, 1500],
      exec() {
        const p = b.player
        if (!p) return
        // 先落三根「删除列」，每根都按玩家提前量定位，逼迫横向换位
        const cols = b.phase > 1 ? 3 : 2
        for (let k = 0; k < cols; k++) {
          const tx = clampW(b, predictX(b, 0.3 + k * 0.42), 80)
          mark(b, tx, feetY(b), 54, 0x9fe0ff, 0.5 + k * 0.24)
          after(b, 0.5 + k * 0.24, () => {
            for (let j = 0; j < 4; j++) {
              after(b, j * 0.06, () => {
                b._bullet({
                  x: tx,
                  y: b.py - 430,
                  vx: 0,
                  vy: 960,
                  radius: 7,
                  color: 0x8fc4ff,
                  damage: b.damage * 0.3,
                  life: 1.2,
                })
              })
            }
            spark(b, tx, feetY(b), 0x9fe0ff, 14, 210)
            shake(b, 0.26)
          })
        }
        // 二阶段：把残留的列拼成一条横向删除带，只留两侧
        if (b.phase > 1) {
          after(b, 1.3, () => {
            const x0 = clampW(b, p.centerX - 130, 70)
            mark(b, x0 + 130, feetY(b), 118, A, 0.45, { segments: 44 })
            after(b, 0.45, () => {
              for (let k = 0; k < 9; k++) {
                b._bullet({
                  x: clampW(b, x0 + k * 32, 60),
                  y: feetY(b) - 26,
                  vx: 0,
                  vy: 0,
                  radius: 15,
                  color: 0x6ff0d0,
                  damage: b.damage * 0.22,
                  life: 1.4,
                })
              }
              sparkLine(b, x0, feetY(b) - 26, x0 + 260, feetY(b) - 26, A, 12, 120)
            })
          })
        }
        sfx(b, 'alarm', 0.45, 0.8)
      },
    },
    dar_index_shear: {
      name: '索引剪切',
      en: 'INDEX SHEAR',
      sig: true,
      wind: 0.5,
      cool: 4.1,
      range: [0, 440],
      exec() {
        const p = b.player
        if (!p) return
        const sx = b.px + b.facing * 18
        const sy = b.py - b.h * 0.2
        const base = Math.atan2(p.centerY - sy, p.centerX - sx)
        // 正向索引：七道窄扇依次扫过
        for (let k = 0; k < 7; k++) {
          after(b, k * 0.07, () => {
            const a = base + (k - 3) * 0.12
            b._bullet({
              x: sx,
              y: sy,
              vx: Math.cos(a) * 780,
              vy: Math.sin(a) * 780,
              radius: 3,
              color: 0x9fe0ff,
              damage: b.damage * 0.28,
              life: 0.72,
            })
            if (k % 2 === 0) spark(b, sx, sy, A, 4, 90)
          })
        }
        // 反向剪切：从玩家身后切回，堵住一味后撤
        after(b, 0.58, () => {
          const back = base + Math.PI
          for (let k = 0; k < 4; k++) {
            const a = back + (k - 1.5) * 0.18
            b._bullet({
              x: p.centerX,
              y: p.centerY,
              vx: Math.cos(a) * 620,
              vy: Math.sin(a) * 620,
              radius: 4,
              color: 0xff8c8c,
              damage: b.damage * 0.26,
              life: 0.9,
            })
          }
          spark(b, p.centerX, p.centerY, 0xff8c8c, 12, 170)
        })
        sfx(b, 'scan', 0.4, 0.9)
      },
    },
  }
}

// ============================================================ 02 装配线监工
function sig_assemblyOverseer(b) {
  const A = b.accent
  return {
    aso_catwalk_press: {
      name: '传送带压榨',
      en: 'CONVEYOR CRUSH',
      sig: true,
      wind: 0.72,
      cool: 6.4,
      range: [140, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        // 传送带反拖：先把玩家往来源方向拽，再让压辊追上来
        pushPlayer(b, -dir, 320, 50, 16)
        for (let k = 0; k < 3; k++) {
          after(b, 0.2 + k * 0.24, () => {
            groundWave(b, dir, 430 + k * 46, {
              radius: 14,
              color: 0xff8a3c,
              damage: b.damage * 0.42,
              life: 2.2,
            })
            pushPlayer(b, -dir, 210, 36, 7)
            puff(b, 8, 0x8a5a38, 1.2)
          })
        }
        // 二阶段：压辊碾过之后，轨道尽头再补一记铆钉锤
        if (b.phase > 1) {
          after(b, 1.05, () => {
            const x = clampW(b, p.centerX + dir * 120)
            mark(b, x, feetY(b), 62, A, 0.42)
            after(b, 0.42, () => {
              burst(b, x, feetY(b), 96, {
                color: A,
                dust: 0x6b5f55,
                sparks: 16,
                damage: b.damage * 0.55,
                shake: 0.4,
              })
            })
          })
        }
        sfx(b, 'weld', 0.45, 0.8)
      },
    },
    aso_batch_stamp: {
      name: '批次钢印',
      en: 'BATCH STAMP',
      sig: true,
      wind: 0.46,
      cool: 3.8,
      range: [0, 400],
      exec() {
        const p = b.player
        if (!p) return
        // 四角落印，正中间留出安全缝——二阶段再补中间
        for (let k = 0; k < 4; k++) {
          const a = Math.PI * 0.25 + k * Math.PI * 0.5
          const x = clampW(b, p.centerX + Math.cos(a) * 96)
          mark(b, x, feetY(b), 46, 0xffb060, 0.4 + k * 0.08)
          after(b, 0.4 + k * 0.08, () => {
            burst(b, x, feetY(b), 62, {
              color: 0xffb060,
              dust: 0x8a6a4a,
              sparks: 10,
              damage: b.damage * 0.38,
              shake: 0.18,
              sound: false,
            })
          })
        }
        if (b.phase > 1) {
          after(b, 0.82, () => {
            const cx = clampW(b, p.centerX)
            mark(b, cx, feetY(b), 64, 0xff6a3c, 0.34, { segments: 4 })
            after(b, 0.34, () => {
              aoe(b, cx, feetY(b), 78, b.damage * 0.55)
              spark(b, cx, feetY(b), 0xff6a3c, 16, 200)
              shake(b, 0.4)
            })
          })
        }
        sfx(b, 'thunder', 0.4, 1.3)
      },
    },
  }
}

// ============================================================ 03 轨道裁决者
function sig_orbitJudge(b) {
  const A = b.accent
  return {
    orb_sentence_ring: {
      name: '环轨判决',
      en: 'ORBITAL VERDICT',
      sig: true,
      wind: 0.9,
      cool: 7.2,
      range: [140, 1100],
      exec() {
        const p = b.player
        if (!p) return
        const cx = clampW(b, predictX(b, 0.55), 90)
        mark(b, cx, feetY(b), 70, 0xffd08a, 0.7, { pulse: true })
        // 两圈反向判决环，中间留一层缝隙
        after(b, 0.7, () => {
          ring(b, b.phase > 1 ? 15 : 11, 240, {
            x: cx,
            y: feetY(b) - 34,
            radius: 5,
            color: 0xffd08a,
            damage: b.damage * 0.32,
            life: 1.8,
            offset: 0.15,
          })
          after(b, 0.22, () => {
            ring(b, b.phase > 1 ? 13 : 9, 320, {
              x: cx,
              y: feetY(b) - 34,
              radius: 4,
              color: 0xfff0c0,
              damage: b.damage * 0.28,
              life: 1.6,
              offset: Math.PI / 9,
            })
          })
          // 天上落一记法槌，钉住试图从上方绕开的玩家
          lob(b, cx, feetY(b) - 8, {
            t: 0.34,
            x: cx + 40,
            y: b.py - 420,
            radius: 13,
            color: 0xd8c0a0,
            damage: b.damage * 0.6,
            gravity: 1500,
          })
          spark(b, cx, feetY(b) - 34, 0xffd08a, 20, 240)
          shake(b, 0.4)
        })
        sfx(b, 'alarm', 0.42, 0.7)
      },
    },
    orb_tether_reel: {
      name: '轨道提吊',
      en: 'TETHER REEL',
      sig: true,
      wind: 0.62,
      cool: 4.8,
      range: [160, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, predictX(b, 0.4) + b.facing * 40)
        mark(b, tx, feetY(b), 58, A, 0.55)
        sparkLine(b, b.px, b.py - b.h * 0.1, tx, p.centerY - 24, A, 8, 90)
        // 把玩家吊到半空，再在落点砸下配重
        pushPlayer(b, 0, 0, 300, 0)
        after(b, 0.5, () => {
          const lx = clampW(b, p.centerX)
          mark(b, lx, feetY(b), 76, 0xffd08a, 0.28)
          after(b, 0.28, () => {
            burst(b, lx, feetY(b), 112, {
              color: 0xffd08a,
              sparks: 18,
              damage: b.damage * 0.7,
              shake: 0.5,
            })
            ring(b, 7, 210, {
              x: lx,
              y: b.py - 30,
              radius: 4,
              color: 0xa8c4d8,
              damage: b.damage * 0.3,
              life: 1.1,
            })
          })
        })
        sfx(b, 'weld', 0.4, 1.1)
      },
    },
  }
}

// ============================================================ 04 聚光塔灵
function sig_helios(b) {
  const A = b.accent
  return {
    hel_sunspot_pyre: {
      name: '日斑火柱',
      en: 'SUNSPOT PYRE',
      sig: true,
      wind: 0.74,
      cool: 6.6,
      range: [180, 1500],
      exec() {
        const p = b.player
        if (!p) return
        // 五道自天而降的光柱，按玩家走位错位排列
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 74 + (k % 2 ? 22 : -22))
          mark(b, tx, feetY(b), 34, 0xffe08a, 0.32 + k * 0.1)
          after(b, 0.32 + k * 0.1, () => {
            sparkLine(b, tx, b.py - b.h * 1.5, tx, feetY(b) - 8, 0xfff0c0, 9, 80)
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x: tx + (j - 1) * 12,
                y: b.py - 360,
                vx: (j - 1) * 12,
                vy: 880,
                radius: 6,
                color: 0xffe08a,
                damage: b.damage * 0.34,
                life: 1.2,
              })
            }
            burst(b, tx, feetY(b), 46, {
              color: 0xffc24a,
              sparks: 8,
              damage: b.damage * 0.2,
              sound: false,
              shake: 0.14,
            })
          })
        }
        // 二阶段：光柱落完后，镜面把余晖折成一条横扫
        if (b.phase > 1) {
          after(b, 1.15, () => {
            const y = b.py - b.h * 0.35
            for (let k = 0; k < 6; k++) {
              b._bullet({
                x: b.px + b.facing * 30,
                y: y + (k - 2.5) * 16,
                vx: b.facing * 620,
                vy: 0,
                radius: 5,
                color: 0xfff2c0,
                damage: b.damage * 0.26,
                life: 1.6,
              })
            }
          })
        }
        sfx(b, 'alarm', 0.4, 1.1)
      },
    },
    hel_mirror_lattice: {
      name: '镜阵绞光',
      en: 'MIRROR LATTICE',
      sig: true,
      wind: 0.58,
      cool: 4.2,
      range: [240, 1400],
      exec() {
        const p = b.player
        if (!p) return
        // 四面镜子各自斜射，交汇处留缺口，玩家必须踩缝
        const pts = [
          [p.centerX - 170, b.py - 60],
          [p.centerX + 170, b.py - 60],
          [p.centerX - 90, b.py - 200],
          [p.centerX + 90, b.py - 200],
        ]
        pts.forEach(([sx, sy], k) => {
          mark(b, clampW(b, sx), feetY(b), 28, A, 0.4 + k * 0.06)
          after(b, 0.4 + k * 0.06, () => {
            const a = Math.atan2(p.centerY - sy, p.centerX - sx) + (k < 2 ? 0.1 : -0.1)
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x: sx,
                y: sy,
                vx: Math.cos(a + (j - 1) * 0.09) * 640,
                vy: Math.sin(a + (j - 1) * 0.09) * 640,
                radius: 4,
                color: k < 2 ? 0xffc24a : 0xfff2c0,
                damage: b.damage * 0.3,
                life: 1.4,
              })
            }
            spark(b, sx, sy, 0xfff2c0, 8, 120)
          })
        })
        after(b, 0.9, () => {
          ring(b, b.phase > 1 ? 10 : 7, 250, {
            radius: 4,
            color: 0xffe08a,
            damage: b.damage * 0.24,
            life: 1.2,
          })
        })
        sfx(b, 'scan', 0.42, 1.3)
      },
    },
  }
}

// ============================================================ 05 溃坝巨像
function sig_floodColossus(b) {
  const A = b.accent
  return {
    fld_breakwater: {
      name: '溃堤水墙',
      en: 'BREAKWATER WALL',
      sig: true,
      wind: 0.82,
      cool: 7.4,
      range: [0, 1600],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 两道水墙同时从场地两端推进，中间只留一条窄缝
        const gap = clampW(b, p.centerX + (p.centerX > w / 2 ? -90 : 90), 120)
        for (const from of [40, w - 40]) {
          const dir = from < w / 2 ? 1 : -1
          mark(b, from + dir * 30, feetY(b), 34, 0x9ac8d0, 0.7)
          after(b, 0.7, () => {
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: from + dir * 20,
                y: feetY(b) - 8 - k * 14,
                vx: dir * (300 + k * 12),
                vy: 0,
                radius: 13,
                color: k % 2 ? 0x6a9aa8 : 0x9ac8d0,
                damage: b.damage * 0.34,
                life: 3.2,
              })
            }
          })
        }
        // 缺口处并非安全：水压会在缝里爆开
        after(b, 1.15, () => {
          mark(b, gap, feetY(b), 66, 0x9ac8d0, 0.35)
          after(b, 0.35, () => {
            burst(b, gap, feetY(b), 86, {
              color: 0x9ac8d0,
              dust: 0x54707a,
              sparks: 18,
              damage: b.damage * 0.55,
              shake: 0.42,
            })
          })
        })
        puff(b, 22, 0x6a9aa8, 1.7)
        shake(b, 0.55)
        sfx(b, 'thunder', 0.48, 0.75)
      },
    },
    fld_whirlpool: {
      name: '泄洪漩涡',
      en: 'SPILL VORTEX',
      sig: true,
      wind: 0.68,
      cool: 5.6,
      range: [80, 700],
      exec() {
        const p = b.player
        if (!p) return
        const cx = clampW(b, p.centerX)
        const cy = p.centerY - 10
        mark(b, cx, feetY(b), 86, 0x9ac8d0, 0.75)
        after(b, 0.75, () => {
          // 切向喷出的水线形成漩涡，越靠外越密
          for (let k = 0; k < 3; k++) {
            after(b, k * 0.18, () => {
              const n = b.phase > 1 ? 10 : 7
              for (let j = 0; j < n; j++) {
                const a = (j / n) * Math.PI * 2 + k * 0.5
                b._bullet({
                  x: cx + Math.cos(a) * 96,
                  y: cy + Math.sin(a) * 66,
                  vx: Math.cos(a + Math.PI / 2) * 210,
                  vy: Math.sin(a + Math.PI / 2) * 210 - 40,
                  radius: 5,
                  color: k % 2 ? 0x6a9aa8 : 0x9ac8d0,
                  damage: b.damage * 0.24,
                  life: 1.7,
                })
              }
              pushPlayer(b, Math.sign(cx - p.centerX) || 1, 240, 70, 10)
              puff(b, 8, 0x6a9aa8, 1.1)
            })
          }
        })
        sfx(b, 'weld', 0.45, 0.5)
      },
    },
  }
}

// ============================================================ 06 断桥劫掠者
function sig_bridgeRaider(b) {
  const A = b.accent
  return {
    bdr_span_collapse: {
      name: '桥面连环塌',
      en: 'SPAN COLLAPSE',
      sig: true,
      wind: 0.76,
      cool: 6.8,
      range: [220, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        const fromLeft = p.centerX > w / 2
        const start = fromLeft ? 80 : w - 80
        const dir = fromLeft ? 1 : -1
        // 从远墙向玩家脚下逐段塌，塌过的位置留碎板
        for (let k = 0; k < 6; k++) {
          const x = clampW(b, start + dir * (60 + k * 82), 60)
          mark(b, x, feetY(b), 44, A, 0.3 + k * 0.1)
          after(b, 0.3 + k * 0.1, () => {
            b._bullet({
              x,
              y: b.py - 360,
              vx: 0,
              vy: 780,
              gravity: 480,
              radius: 8,
              color: 0x8a5a38,
              damage: b.damage * 0.38,
              life: 1.2,
            })
            burst(b, x, feetY(b), 52, {
              color: 0x8a5a38,
              dust: 0x5a4a3a,
              sparks: 8,
              damage: b.damage * 0.18,
              sound: false,
              shake: 0.12,
            })
            b._bullet({
              x,
              y: feetY(b) - 10,
              vx: 0,
              vy: 0,
              radius: 12,
              color: 0x6a4a30,
              damage: b.damage * 0.16,
              life: 2.4,
            })
          })
        }
        if (b.phase > 1) {
          after(b, 1.1, () => {
            fan(b, 7, 0.13, 470, {
              radius: 4,
              color: 0xff8a4a,
              damage: b.damage * 0.28,
              life: 1.2,
            })
          })
        }
        sfx(b, 'thunder', 0.4, 0.9)
      },
    },
    bdr_pike_wall: {
      name: '拒马尖桩',
      en: 'PIKE WALL',
      sig: true,
      wind: 0.6,
      cool: 4.4,
      range: [0, 520],
      exec() {
        const p = b.player
        if (!p) return
        const base = clampW(b, p.centerX + b.facing * 60)
        // 先在前方插一排尖桩，再把玩家往桩上拽
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, base + (k - 1.5) * 62)
          mark(b, x, feetY(b), 26, A, 0.36 + k * 0.05)
          after(b, 0.36 + k * 0.05, () => {
            b._bullet({
              x,
              y: feetY(b) - 26,
              vx: 0,
              vy: -120,
              gravity: 520,
              radius: 7,
              color: 0xc07038,
              damage: b.damage * 0.26,
              life: 2.6,
            })
            spark(b, x, feetY(b) - 26, 0xd8a060, 6, 90)
          })
        }
        after(b, 0.72, () => {
          const dir = Math.sign(base - p.centerX) || b.facing
          pushPlayer(b, dir, 480, 120, 24)
          after(b, 0.3, () => {
            aoe(b, base, feetY(b), 92, b.damage * 0.5)
            sparkLine(b, base - 92, feetY(b) - 30, base + 92, feetY(b) - 30, A, 9, 140)
            shake(b, 0.32)
          })
        })
        sfx(b, 'scan', 0.38, 0.8)
      },
    },
  }
}

// ============================================================ 07 公路暴走王
function sig_highwayKing(b) {
  const A = b.accent
  return {
    hwk_traffic_sweep: {
      name: '车流横扫',
      en: 'TRAFFIC SWEEP',
      sig: true,
      wind: 0.6,
      cool: 5.2,
      range: [120, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 车灯从低到高扫成一道弧，扫两遍，第二遍反向
        const sy = b.py - b.h * 0.3
        const base = Math.atan2(p.centerY - sy, p.centerX - b.px)
        for (let round = 0; round < (b.phase > 1 ? 3 : 2); round++) {
          after(b, round * 0.42, () => {
            const sign = round % 2 ? -1 : 1
            for (let k = 0; k < 6; k++) {
              const a = base + sign * (k - 2.5) * 0.13
              b._bullet({
                x: b.px,
                y: sy,
                vx: Math.cos(a) * 560,
                vy: Math.sin(a) * 560,
                radius: 6,
                color: k % 2 ? 0xff5644 : 0xffb060,
                damage: b.damage * 0.3,
                life: 1.5,
              })
            }
            spark(b, b.px, sy, 0xff8a3c, 14, 220)
            sfx(b, 'growl', 0.36, 1.4)
          })
        }
        puff(b, 16, 0x5a4a44, 1.3)
        shake(b, 0.3)
      },
    },
    hwk_roadblock: {
      name: '路障封锁',
      en: 'ROADBLOCK',
      sig: true,
      wind: 0.7,
      cool: 6.2,
      range: [0, 620],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 在玩家两侧放水泥路障，把退路挤成一条窄道
        const spots = [
          clampW(b, p.centerX - 170, 60),
          clampW(b, p.centerX + 170, 60),
          clampW(b, p.centerX - 40, 60),
        ]
        if (b.phase > 1) spots.push(clampW(b, p.centerX + 60, 60))
        for (const x of spots) {
          mark(b, x, feetY(b), 40, 0xff5644, 0.55)
          after(b, 0.55, () => {
            b._bullet({
              x,
              y: feetY(b) - 26,
              vx: 0,
              vy: 0,
              radius: 17,
              color: 0xd8d0c0,
              damage: b.damage * 0.24,
              life: 4.2,
            })
            puff(b, 10, 0x8a7a70, 1.3)
            spark(b, x, feetY(b) - 26, A, 8, 110)
          })
        }
        after(b, 0.8, () => {
          const tx = clampW(b, p.centerX)
          for (let k = 0; k < 5; k++) {
            lob(b, tx + (k - 2) * 30, feetY(b) - 4, {
              t: 0.4,
              x: clampW(b, b.px + b.facing * 30),
              y: b.py - b.h * 0.6,
              radius: 6,
              color: A,
              damage: b.damage * 0.3,
            })
          }
        })
        sfx(b, 'alarm', 0.4, 0.9)
      },
    },
  }
}

// ============================================================ 08 顶层男爵
function sig_skylineBaron(b) {
  const A = b.accent
  return {
    skb_glass_rain: {
      name: '天窗碎玻璃',
      en: 'SKYLIGHT GLASS',
      sig: true,
      wind: 0.82,
      cool: 6.4,
      range: [160, 1300],
      exec() {
        const p = b.player
        if (!p) return
        // 玻璃从天花板整片落下，落点带偏移，形成锯齿雨
        const n = b.phase > 1 ? 12 : 8
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 56 + (k % 3) * 14)
          mark(b, tx, feetY(b), 26, 0xffe8a0, 0.28 + k * 0.07)
          after(b, 0.28 + k * 0.07, () => {
            b._bullet({
              x: tx,
              y: b.py - 380,
              vx: (k % 2 ? 1 : -1) * 30,
              vy: 860,
              gravity: 300,
              radius: 4,
              color: k % 3 ? 0xffe8a0 : 0xffffff,
              damage: b.damage * 0.24,
              life: 1.4,
            })
            spark(b, tx, feetY(b), 0xfff0c0, 5, 100)
          })
        }
        // 二阶段：玻璃雨之后，碎屑被吊灯扫回
        if (b.phase > 1) {
          after(b, 1.15, () => {
            ring(b, 9, 260, {
              x: b.px,
              y: b.py - b.h * 0.3,
              radius: 4,
              color: 0xd8c070,
              damage: b.damage * 0.24,
              life: 1.3,
              offset: 0.2,
            })
          })
        }
        sfx(b, 'alarm', 0.4, 1.4)
      },
    },
    skb_elevator_drop: {
      name: '电梯直坠',
      en: 'ELEVATOR DROP',
      sig: true,
      wind: 0.9,
      cool: 7.8,
      range: [0, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, predictX(b, 0.6))
        mark(b, tx, feetY(b), 74, 0xd8c070, 0.75, { segments: 4 })
        after(b, 0.75, () => {
          // 轿厢砸地：先一层下压冲击，再向两侧挤开
          burst(b, tx, feetY(b), 120, {
            color: 0xd8c070,
            dust: 0x6b5f55,
            sparks: 20,
            damage: b.damage * 0.6,
            shake: 0.6,
          })
          for (const dir of [-1, 1]) {
            groundWave(b, dir, b.phase > 1 ? 480 : 400, {
              radius: 14,
              color: 0xd8c070,
              damage: b.damage * 0.34,
              life: 2,
            })
          }
          b._bullet({
            x: tx,
            y: feetY(b) - 34,
            vx: 0,
            vy: 0,
            radius: 22,
            color: 0x8a7a50,
            damage: b.damage * 0.2,
            life: 3,
          })
          after(b, 0.25, () => {
            if (b.phase > 1) {
              for (let k = 0; k < 6; k++) {
                const a = -Math.PI * 0.9 + k * 0.3
                b._bullet({
                  x: tx,
                  y: feetY(b) - 30,
                  vx: Math.cos(a) * 260,
                  vy: Math.sin(a) * 180 - 110,
                  gravity: 420,
                  radius: 5,
                  color: 0xffe8a0,
                  damage: b.damage * 0.2,
                  life: 1.4,
                })
              }
            }
          })
        })
        sfx(b, 'thunder', 0.48, 0.8)
      },
    },
  }
}

// ============================================================ 09 角斗场卫冕者
function sig_arenaChampion(b) {
  const A = b.accent
  return {
    arc_gladiator_net: {
      name: '角斗士网',
      en: 'GLADIATOR NET',
      sig: true,
      wind: 0.66,
      cool: 5.4,
      range: [120, 780],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, predictX(b, 0.45))
        mark(b, tx, feetY(b), 92, 0xff7a4a, 0.55)
        // 网先罩下来，把玩家往中心拖，再由长矛收尾
        lob(b, tx, feetY(b) - 8, {
          t: 0.34,
          x: b.px,
          y: b.py - b.h * 0.9,
          radius: 14,
          color: 0xff7a4a,
          damage: b.damage * 0.24,
          gravity: 1200,
        })
        after(b, 0.55, () => {
          pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 300, 80, 22)
          for (let k = 0; k < (b.phase > 1 ? 10 : 7); k++) {
            const a = (k / 7) * Math.PI * 2
            b._bullet({
              x: tx + Math.cos(a) * 70,
              y: feetY(b) - 20 + Math.sin(a) * 34,
              vx: -Math.cos(a) * 90,
              vy: -Math.sin(a) * 60,
              gravity: 180,
              radius: 4,
              color: 0xffb060,
              damage: b.damage * 0.18,
              life: 1.3,
            })
          }
          spark(b, tx, feetY(b), 0xffb060, 18, 190)
        })
        after(b, 0.95, () => {
          for (let k = 0; k < 3; k++) {
            shot(b, b.px, b.py - b.h * 0.2 - k * 8, tx, feetY(b) - 30, 900, {
              radius: 4,
              color: 0xffe0a0,
              damage: b.damage * 0.3,
              life: 0.8,
            })
          }
        })
        sfx(b, 'growl', 0.4, 1.2)
      },
    },
    arc_spotlight_finale: {
      name: '聚光谢幕',
      en: 'SPOTLIGHT FINALE',
      sig: true,
      wind: 0.78,
      cool: 8.6,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 三束聚光灯依次锁定玩家最后三个落点，最后一束砸在脚下
        for (let k = 0; k < 3; k++) {
          const tx = clampW(b, predictX(b, 0.25 + k * 0.28) + (k - 1) * 46)
          mark(b, tx, feetY(b), 44, 0xffb060, 0.36 + k * 0.26)
          after(b, 0.36 + k * 0.26, () => {
            aoe(b, tx, feetY(b), 56, b.damage * 0.34)
            sparkLine(b, tx, b.py - 320, tx, feetY(b) - 10, 0xfff0c0, 8, 90)
            spark(b, tx, feetY(b), 0xffb060, 10, 160)
            shake(b, 0.2)
          })
        }
        after(b, 1.2, () => {
          const cx = clampW(b, p.centerX)
          mark(b, cx, feetY(b), 110, A, 0.4)
          after(b, 0.4, () => {
            burst(b, cx, feetY(b), 140, {
              color: A,
              sparks: 26,
              damage: b.damage * 0.75,
              shake: 0.65,
            })
            if (b.phase > 1) {
              ring(b, 13, 340, { radius: 5, color: 0xffb060, damage: b.damage * 0.4, life: 1.4 })
            }
          })
        })
        sfx(b, 'thunder', 0.5, 1.5)
      },
    },
  }
}

// ============================================================ 10 战地拾荒王
function sig_scrapWarlord(b) {
  const A = b.accent
  return {
    scw_crane_swing: {
      name: '吊臂回旋',
      en: 'CRANE SWING',
      sig: true,
      wind: 0.68,
      cool: 5.8,
      range: [160, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 吊臂带着废料沿弧线摆过，末端再砸落
        const pivot = b.px + b.facing * 50
        const sy = b.py - b.h * 0.5
        for (let k = 0; k < 5; k++) {
          after(b, k * 0.11, () => {
            const a = b.facing * (0.35 + k * 0.22) - Math.PI * 0.5
            const d = 130 + k * 34
            b._bullet({
              x: pivot,
              y: sy,
              vx: Math.cos(a) * d * 2.6,
              vy: Math.sin(a) * d * 2.6 + 60,
              gravity: 260,
              radius: 7,
              color: 0xa8763a,
              damage: b.damage * 0.28,
              life: 1.5,
            })
          })
        }
        after(b, 0.8, () => {
          const x = clampW(b, b.px + b.facing * (200 + (b.phase > 1 ? 80 : 0)))
          mark(b, x, feetY(b), 68, A, 0.35)
          after(b, 0.35, () => {
            burst(b, x, feetY(b), 94, {
              color: 0xa8763a,
              dust: 0x5a5a4a,
              sparks: 14,
              damage: b.damage * 0.55,
              shake: 0.4,
            })
          })
        })
        sfx(b, 'weld', 0.42, 0.9)
      },
    },
    scw_flame_trench: {
      name: '燃烧战壕',
      en: 'FLAME TRENCH',
      sig: true,
      wind: 0.74,
      cool: 7,
      range: [0, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 沿场地两侧各划一道火壕，把玩家夹在中间；二阶段火壕会合拢
        const left = 90
        const right = w - 90
        for (const x of [left, right]) {
          mark(b, x, feetY(b), 54, 0xff6a3c, 0.6)
          after(b, 0.6, () => {
            for (let k = 0; k < 7; k++) {
              b._bullet({
                x,
                y: feetY(b) - 6 - k * 16,
                vx: 0,
                vy: -40,
                gravity: -10,
                radius: 9,
                color: k % 2 ? 0xff8a3c : 0xffb060,
                damage: b.damage * 0.2,
                life: 3.4,
              })
            }
            puff(b, 16, 0x5a3a28, 1.5)
          })
        }
        if (b.phase > 1) {
          after(b, 0.95, () => {
            for (let k = 0; k < 8; k++) {
              const x = left + ((right - left) * k) / 7
              after(b, k * 0.05, () => {
                b._bullet({
                  x,
                  y: feetY(b) - 18,
                  vx: 0,
                  vy: -60,
                  radius: 7,
                  color: 0xffb060,
                  damage: b.damage * 0.18,
                  life: 1.6,
                })
              })
            }
          })
        }
        sfx(b, 'thunder', 0.45, 0.7)
      },
    },
  }
}

// ============================================================ 11 失控护理机
function sig_caregiver(b) {
  const A = b.accent
  return {
    cgr_triage_ward: {
      name: '分诊病房',
      en: 'TRIAGE WARD',
      sig: true,
      wind: 0.7,
      cool: 6,
      range: [100, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 三个分诊格围住玩家，故意空出一格作为「病床」
        const start = Math.random() * Math.PI * 2
        for (let k = 0; k < 3; k++) {
          const a = start + (k / 3) * Math.PI * 2
          const x = clampW(b, p.centerX + Math.cos(a) * 112)
          mark(b, x, feetY(b), 58, 0xd8e08a, 0.55 + k * 0.14)
          after(b, 0.55 + k * 0.14, () => {
            aoe(b, x, feetY(b), 74, b.damage * 0.4)
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x,
                y: feetY(b) - 20,
                vx: (j - 1) * 90,
                vy: -150,
                gravity: 420,
                radius: 5,
                color: 0xd8e08a,
                damage: b.damage * 0.16,
                life: 1.3,
              })
            }
            puff(b, 8, 0xb8c070, 1.2)
          })
        }
        // 二阶段：空出的那一格也会被补上一针
        if (b.phase > 1) {
          after(b, 1.05, () => {
            const a = start + Math.PI * 2
            const x = clampW(b, p.centerX + Math.cos(a) * 112)
            mark(b, x, feetY(b), 52, 0xfff0a0, 0.35)
            after(b, 0.35, () => {
              burst(b, x, feetY(b), 70, {
                color: 0xd8e08a,
                sparks: 12,
                damage: b.damage * 0.42,
                sound: false,
                shake: 0.26,
              })
            })
          })
        }
        sfx(b, 'scan', 0.4, 0.7)
      },
    },
    cgr_anesthetic: {
      name: '麻醉回吸',
      en: 'ANESTHETIC INTAKE',
      sig: true,
      wind: 0.64,
      cool: 4.6,
      range: [0, 560],
      exec() {
        const p = b.player
        if (!p) return
        const cx = clampW(b, p.centerX)
        const cy = p.centerY - 8
        // 针头先在外圈排成一圈，再同时向圆心收拢
        for (let k = 0; k < (b.phase > 1 ? 12 : 8); k++) {
          const a = (k / (b.phase > 1 ? 12 : 8)) * Math.PI * 2 + 0.2
          after(b, 0.35 + k * 0.02, () => {
            b._bullet({
              x: cx + Math.cos(a) * 128,
              y: cy + Math.sin(a) * 88,
              vx: -Math.cos(a) * 240,
              vy: -Math.sin(a) * 240,
              radius: 4,
              color: 0xd8e08a,
              damage: b.damage * 0.24,
              life: 0.62,
            })
          })
        }
        after(b, 0.5, () => {
          pushPlayer(b, Math.sign(b.px - cx) || 1, 200, 60, 10)
          spark(b, cx, cy, A, 16, 160)
        })
        after(b, 0.78, () => {
          burst(b, cx, cy, 58, {
            color: 0xe8f0a0,
            sparks: 10,
            damage: b.damage * 0.3,
            sound: false,
            shake: 0.2,
          })
        })
        sfx(b, 'alarm', 0.34, 1.3)
      },
    },
  }
}

// ============================================================ 12 集结号
function sig_rallyBoss(b) {
  const A = b.accent
  return {
    rly_battalion_wall: {
      name: '全营火线',
      en: 'BATTALION LINE',
      sig: true,
      wind: 0.76,
      cool: 6.8,
      range: [200, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 一整条散兵线从场地两侧升火，弹道由低到高推进
        for (let k = 0; k < (b.phase > 1 ? 10 : 7); k++) {
          const x = clampW(b, b.px - 260 + k * 72)
          after(b, 0.32 + k * 0.06, () => {
            const sx = clampW(b, x, 40)
            shot(b, sx, feetY(b) - 10, p.centerX, p.centerY - 14 + k * 6, 560, {
              radius: 3,
              color: k % 2 ? 0x8fc4ff : 0xd8e8ff,
              damage: b.damage * 0.22,
              life: 2,
            })
            spark(b, sx, feetY(b) - 10, 0x8fc4ff, 5, 90)
          })
        }
        // 两侧墙头同时压上来的第二排
        after(b, 0.85, () => {
          for (const sx of [50, w - 50]) {
            for (let k = 0; k < 3; k++) {
              shot(b, sx, b.py - 40 - k * 26, p.centerX, p.centerY, 620, {
                radius: 4,
                color: 0xd8e8ff,
                damage: b.damage * 0.24,
                life: 1.8,
              })
            }
          }
        })
        sfx(b, 'radio', 0.42, 0.8)
      },
    },
    rly_standard_plant: {
      name: '战旗插点',
      en: 'STANDARD PLANT',
      sig: true,
      wind: 0.86,
      cool: 7.6,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, predictX(b, 0.5))
        mark(b, tx, feetY(b), 52, 0x8fc4ff, 0.7)
        after(b, 0.7, () => {
          // 旗杆插地，形成集火信标；旗周围会持续落弹
          b._bullet({
            x: tx,
            y: feetY(b) - 36,
            vx: 0,
            vy: 0,
            radius: 11,
            color: 0x8fc4ff,
            damage: b.damage * 0.14,
            life: 4.4,
          })
          sparkLine(b, tx, feetY(b), tx, feetY(b) - 90, A, 6, 80)
          for (let k = 0; k < 3; k++) {
            after(b, 0.2 + k * 0.32, () => {
              lob(b, clampW(b, tx + (k - 1) * 40), feetY(b) - 6, {
                t: 0.32,
                x: b.px + b.facing * 30,
                y: b.py - b.h * 0.7,
                radius: 6,
                color: 0xd8e8ff,
                damage: b.damage * 0.26,
              })
            })
          }
          if (b.phase > 1) {
            after(b, 1.1, () => {
              ring(b, 10, 190, {
                x: tx,
                y: feetY(b) - 30,
                radius: 4,
                color: A,
                damage: b.damage * 0.22,
                life: 1.2,
              })
            })
          }
        })
        sfx(b, 'growl', 0.4, 0.9)
      },
    },
  }
}

// ============================================================ 13 风暴收割者
function sig_stormReaper(b) {
  const A = b.accent
  return {
    str_twister_column: {
      name: '移动风柱',
      en: 'WANDERING TWISTER',
      sig: true,
      wind: 0.78,
      cool: 7.4,
      range: [140, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        const start = clampW(b, b.px + dir * 80)
        // 一根横向移动的风柱，柱身从地面不断向上吐碎片
        for (let k = 0; k < 6; k++) {
          const x = clampW(b, start + dir * (k * 86), 60)
          mark(b, x, feetY(b), 30, 0x9ab84a, 0.3 + k * 0.1)
          after(b, 0.3 + k * 0.1, () => {
            for (let j = 0; j < 4; j++) {
              b._bullet({
                x: x + (j % 2 ? 10 : -10),
                y: feetY(b) - 12,
                vx: dir * 120 + (j - 1.5) * 26,
                vy: -260 - j * 40,
                gravity: 520,
                radius: 5,
                color: j % 2 ? 0x9ab84a : 0xd8e08a,
                damage: b.damage * 0.2,
                life: 1.5,
              })
            }
            pushPlayer(b, dir, 180, 90, 6)
          })
        }
        if (b.phase > 1) {
          after(b, 1.05, () => {
            for (let k = 0; k < 4; k++) {
              groundWave(b, k % 2 ? 1 : -1, 380, {
                radius: 10,
                color: 0x9ab84a,
                damage: b.damage * 0.26,
                life: 1.8,
              })
            }
          })
        }
        sfx(b, 'growl', 0.44, 0.6)
      },
    },
    str_hail_scythe: {
      name: '冰雹镰扫',
      en: 'HAIL SCYTHE',
      sig: true,
      wind: 0.52,
      cool: 4.4,
      range: [0, 620],
      exec() {
        const p = b.player
        if (!p) return
        const sy = b.py - b.h * 0.25
        // 三层刀风：下段贴近地面，中段扫腰，上段封跳
        for (let layer = 0; layer < 3; layer++) {
          after(b, layer * 0.16, () => {
            const y = feetY(b) - 8 - layer * 54
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: b.px + b.facing * 26,
                y,
                vx: b.facing * (430 + k * 16),
                vy: (k - 2) * 22,
                gravity: 40,
                radius: 6,
                color: layer === 1 ? 0xd8f0e8 : 0x9ab84a,
                damage: b.damage * 0.24,
                life: 1.7,
              })
            }
            spark(b, b.px + b.facing * 40, y, A, 8, 140)
          })
        }
        // 二阶段：刀风之后冰雹落地，补一圈脚踝
        if (b.phase > 1) {
          after(b, 0.75, () => {
            for (let k = 0; k < 7; k++) {
              const x = clampW(b, p.centerX + (k - 3) * 44)
              b._bullet({
                x,
                y: b.py - 320,
                vx: 0,
                vy: 720,
                radius: 4,
                color: 0xd8f0e8,
                damage: b.damage * 0.18,
                life: 1.2,
              })
            }
          })
        }
        sfx(b, 'scan', 0.4, 1.5)
      },
    },
  }
}

// ============================================================ 14 酸沼母体
function sig_acidMother(b) {
  const A = b.accent
  return {
    acm_acid_geyser: {
      name: '酸泉喷发',
      en: 'ACID GEYSER',
      sig: true,
      wind: 0.8,
      cool: 7.2,
      range: [80, 1300],
      exec() {
        const p = b.player
        if (!p) return
        // 三处泉眼从地下顶起，水柱先细后粗
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const x = clampW(b, p.centerX + (k - (n - 1) / 2) * 104 + (k % 2 ? 24 : -24))
          mark(b, x, feetY(b), 42, 0xc6e05a, 0.6 + k * 0.12)
          after(b, 0.6 + k * 0.12, () => {
            for (let j = 0; j < 6; j++) {
              after(b, j * 0.05, () => {
                b._bullet({
                  x,
                  y: feetY(b) - 8,
                  vx: (j - 2.5) * 24,
                  vy: -640 - j * 22,
                  gravity: 900,
                  radius: 6,
                  color: 0xc6e05a,
                  damage: b.damage * 0.2,
                  life: 1.5,
                })
              })
            }
            puff(b, 18, 0x8a9a3a, 1.7)
            shake(b, 0.3)
          })
        }
        // 二阶段：泉眼喷完后塌成酸池
        if (b.phase > 1) {
          after(b, 1.25, () => {
            for (let k = 0; k < 3; k++) {
              const x = clampW(b, b.px + (k - 1) * 120)
              b._bullet({
                x,
                y: feetY(b) - 10,
                vx: 0,
                vy: 0,
                radius: 24,
                color: 0x8a9a3a,
                damage: b.damage * 0.16,
                life: 3.4,
              })
            }
          })
        }
        sfx(b, 'thunder', 0.42, 0.9)
      },
    },
    acm_dissolve_field: {
      name: '溶蚀场',
      en: 'DISSOLVE FIELD',
      sig: true,
      wind: 0.72,
      cool: 6.2,
      range: [100, 800],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 场地两端各铺一条酸带，再用体侧把玩家推向任意一侧
        const bands = [clampW(b, 110, 60), clampW(b, w - 110, 60)]
        for (const x of bands) {
          mark(b, x, feetY(b), 66, 0xc6e05a, 0.55)
          after(b, 0.55, () => {
            for (let k = 0; k < 3; k++) {
              b._bullet({
                x: x + (k - 1) * 34,
                y: feetY(b) - 8,
                vx: 0,
                vy: 0,
                radius: 19,
                color: 0x9ab84a,
                damage: b.damage * 0.18,
                life: 4,
              })
            }
            spark(b, x, feetY(b) - 10, 0xc6e05a, 12, 160)
          })
        }
        after(b, 0.8, () => {
          const sign = p.centerX > w / 2 ? 1 : -1
          pushPlayer(b, sign, 460, 110, 20)
          after(b, 0.28, () => {
            aoe(b, p.centerX, feetY(b), 70, b.damage * 0.3)
            puff(b, 12, 0x8a9a3a, 1.3)
          })
        })
        sfx(b, 'weld', 0.4, 0.6)
      },
    },
  }
}

// ============================================================ 15 腐殖女王
function sig_rotQueen(b) {
  const A = b.accent
  return {
    rtq_mycelium_web: {
      name: '菌丝蛛网',
      en: 'MYCELIUM WEB',
      sig: true,
      wind: 0.74,
      cool: 6.4,
      range: [120, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 从 BOSS 脚下向玩家拉五节菌丝，节点依次爆开
        const x0 = b.px
        const x1 = clampW(b, p.centerX)
        for (let k = 0; k < 5; k++) {
          const x = clampW(b, x0 + ((x1 - x0) * (k + 1)) / 5)
          mark(b, x, feetY(b), 30, 0x6b8a3a, 0.3 + k * 0.16)
          after(b, 0.3 + k * 0.16, () => {
            for (let j = 0; j < 2; j++) {
              b._bullet({
                x,
                y: feetY(b) - 16,
                vx: (j - 0.5) * 70,
                vy: -190,
                gravity: 360,
                radius: 6,
                color: 0x6b8a3a,
                damage: b.damage * 0.2,
                life: 1.4,
              })
            }
            sparkLine(b, x - 24, feetY(b) - 18, x + 24, feetY(b) - 18, 0x8aa04a, 4, 80)
            spark(b, x, feetY(b) - 18, 0x8aa04a, 8, 130)
          })
        }
        // 二阶段：蛛网节点全部连成一条持续伤人的菌毯
        if (b.phase > 1) {
          after(b, 1.1, () => {
            for (let k = 0; k < 5; k++) {
              const x = clampW(b, x0 + ((x1 - x0) * (k + 1)) / 5)
              b._bullet({
                x,
                y: feetY(b) - 8,
                vx: 0,
                vy: 0,
                radius: 16,
                color: 0x5a7a32,
                damage: b.damage * 0.14,
                life: 2.6,
              })
            }
          })
        }
        sfx(b, 'growl', 0.42, 0.6)
      },
    },
    rtq_grave_bloom: {
      name: '坟头花海',
      en: 'GRAVE BLOOM',
      sig: true,
      wind: 0.66,
      cool: 5.4,
      range: [0, 700],
      exec() {
        const p = b.player
        if (!p) return
        // 三座坟包同时开花，每朵环的起始角度不同，缝隙不重合
        const spots = [
          clampW(b, p.centerX - 130),
          clampW(b, p.centerX + 130),
          clampW(b, p.centerX),
        ]
        if (b.phase > 1) spots.push(clampW(b, p.centerX + 250))
        spots.forEach((x, k) => {
          mark(b, x, feetY(b), 48, 0x6b8a3a, 0.5 + k * 0.14)
          after(b, 0.5 + k * 0.14, () => {
            ring(b, b.phase > 1 ? 10 : 7, 190, {
              x,
              y: feetY(b) - 26,
              radius: 4,
              color: k % 2 ? 0x8aa04a : A,
              damage: b.damage * 0.22,
              life: 1.3,
              offset: k * 0.45,
            })
            puff(b, 10, 0x4a5a30, 1.3)
          })
        })
        after(b, 0.9, () => {
          const cx = clampW(b, p.centerX)
          burst(b, cx, feetY(b), 62, {
            color: 0x8aa04a,
            sparks: 10,
            damage: b.damage * 0.32,
            sound: false,
            shake: 0.22,
          })
        })
        sfx(b, 'scan', 0.4, 0.7)
      },
    },
  }
}

// ============================================================ 16 断钟主教
function sig_bellBishop(b) {
  const A = b.accent
  return {
    blb_bell_toll: {
      name: '丧钟三鸣',
      en: 'BELL TOLL',
      sig: true,
      wind: 0.86,
      cool: 7.8,
      range: [0, 1500],
      exec() {
        const p = b.player
        if (!p) return
        // 三鸣：一次比一次慢、一次比一次宽，中间留出可穿的环缝
        for (let k = 0; k < 3; k++) {
          after(b, 0.35 + k * 0.52, () => {
            ring(b, b.phase > 1 ? 18 : 14, 210, {
              radius: 4,
              color: k === 1 ? 0xfff0c0 : A,
              damage: b.damage * 0.28,
              life: 2.4,
              offset: k * 0.11,
            })
            shake(b, 0.32)
            sfx(b, 'thunder', 0.42, 1.1 - k * 0.12)
          })
        }
        // 二阶段：第三鸣之后钟锤砸向玩家，堵住环缝外圈
        if (b.phase > 1) {
          after(b, 1.95, () => {
            const tx = clampW(b, predictX(b, 0.5))
            mark(b, tx, feetY(b), 66, 0xfff0c0, 0.4)
            after(b, 0.4, () => {
              lob(b, tx, feetY(b) - 8, {
                t: 0.26,
                x: tx,
                y: b.py - 420,
                gravity: 1600,
                radius: 15,
                color: 0xffd07a,
                damage: b.damage * 0.55,
              })
              burst(b, tx, feetY(b), 84, {
                color: 0xffd07a,
                sparks: 16,
                damage: b.damage * 0.3,
                sound: false,
              })
            })
          })
        }
      },
    },
    blb_reliquary: {
      name: '圣髑匣阵',
      en: 'RELIQUARY ARRAY',
      sig: true,
      wind: 0.8,
      cool: 8.4,
      range: [180, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 三只圣髑匣围着玩家落地，匣与匣之间连成审判线
        const cx = clampW(b, p.centerX)
        const spots = [cx - 140, cx + 140, cx]
        if (b.phase > 1) spots.push(clampW(b, cx + 260))
        for (const x of spots) {
          mark(b, x, feetY(b), 44, A, 0.58, { segments: 4 })
          after(b, 0.58, () => {
            b._bullet({
              x,
              y: feetY(b) - 30,
              vx: 0,
              vy: 0,
              radius: 14,
              color: 0xb08040,
              damage: b.damage * 0.18,
              life: 3.4,
            })
            spark(b, x, feetY(b) - 30, 0xffd07a, 10, 150)
          })
        }
        after(b, 0.95, () => {
          for (let k = 0; k < 3; k++) {
            const x0 = spots[k]
            const x1 = spots[k + 1] ?? spots[0]
            sparkLine(b, x0, feetY(b) - 26, x1, feetY(b) - 26, 0xfff0c0, 10, 110)
            aoe(b, (x0 + x1) / 2, feetY(b), 78, b.damage * 0.34)
          }
          shake(b, 0.38)
        })
        sfx(b, 'alarm', 0.44, 0.7)
      },
    },
  }
}

// ============================================================ 17 初代核心
function sig_primeCore(b) {
  const A = b.accent
  return {
    prc_kernel_panic: {
      name: '内核恐慌',
      en: 'KERNEL PANIC',
      sig: true,
      wind: 0.82,
      cool: 8,
      range: [160, 1400],
      exec() {
        const p = b.player
        if (!p) return
        // 两侧各浮出一个「镜像进程」，同时向玩家扇形开火，再一起坍缩
        const n = b.phase > 1 ? 3 : 2
        for (let k = 0; k < n; k++) {
          const sx = clampW(b, b.px + (k - (n - 1) / 2) * 210)
          const sy = b.py - b.h * (0.2 + k * 0.12)
          mark(b, sx, feetY(b), 36, 0x6ff0d0, 0.45 + k * 0.1)
          after(b, 0.45 + k * 0.1, () => {
            fan(b, b.phase > 1 ? 5 : 3, 0.14, 540, {
              x: sx,
              y: sy,
              radius: 4,
              color: k % 2 ? 0x6ff0d0 : 0x8fe8ff,
              damage: b.damage * 0.28,
              life: 1.4,
            })
            spark(b, sx, sy, 0x8fe8ff, 10, 160)
          })
        }
        after(b, 0.95, () => {
          for (let k = 0; k < n; k++) {
            const sx = clampW(b, b.px + (k - (n - 1) / 2) * 210)
            ring(b, 7, 180, {
              x: sx,
              y: feetY(b) - 60,
              radius: 3,
              color: A,
              damage: b.damage * 0.2,
              life: 1,
            })
          }
        })
        sfx(b, 'alarm', 0.44, 0.8)
      },
    },
    prc_cold_boot: {
      name: '冷启动脉冲',
      en: 'COLD BOOT',
      sig: true,
      wind: 0.7,
      cool: 6.6,
      range: [0, 9999],
      exec() {
        const { w } = roomBounds(b)
        // 整场断电：两端向中心推入的同步脉冲，必须卡在两波之间
        for (const from of [50, w - 50]) {
          const dir = from < w / 2 ? 1 : -1
          mark(b, from + dir * 20, feetY(b), 30, A, 0.62)
          after(b, 0.62, () => {
            for (let k = 0; k < 4; k++) {
              b._bullet({
                x: from + dir * 10,
                y: b.py - b.h * 0.18 + (k - 1.5) * 22,
                vx: dir * 520,
                vy: 0,
                radius: 6,
                color: k % 2 ? 0x6ff0d0 : 0x8fe8ff,
                damage: b.damage * 0.26,
                life: 2.6,
              })
            }
          })
        }
        after(b, 0.9, () => {
          ring(b, b.phase > 1 ? 14 : 10, 280, {
            radius: 4,
            color: 0x8fe8ff,
            damage: b.damage * 0.26,
            life: 1.4,
            offset: 0.1,
          })
        })
        after(b, 1.35, () => {
          // 启动完成：脚下补一记核心过载
          const x = clampW(b, b.player ? b.player.centerX : b.px)
          burst(b, x, feetY(b), b.phase > 1 ? 130 : 104, {
            color: A,
            sparks: 16,
            damage: b.damage * 0.4,
            shake: 0.42,
          })
        })
        sfx(b, 'scan', 0.44, 1.1)
      },
    },
  }
}

// ============================================================ 18 零号病株
function sig_zeroStrain(b) {
  const A = b.accent
  return {
    zst_plague_wind: {
      name: '疫风推进',
      en: 'PLAGUE WIND',
      sig: true,
      wind: 0.76,
      cool: 6.6,
      range: [120, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        // 一堵缓慢移动的孢子墙，穿过去比绕过去更难
        for (let k = 0; k < 4; k++) {
          after(b, k * 0.36, () => {
            for (let j = 0; j < 5; j++) {
              b._bullet({
                x: b.px + dir * (36 + k * 26),
                y: b.py - b.h * 0.7 + j * 30,
                vx: dir * (170 + k * 14),
                vy: 0,
                radius: 10,
                color: j % 2 ? 0x9ab84a : 0xc6e05a,
                damage: b.damage * 0.2,
                life: 4.2,
              })
            }
            puff(b, 10, 0x6b8a3a, 1.4)
          })
        }
        // 二阶段：墙后还跟着一层更快的孢子云
        if (b.phase > 1) {
          after(b, 1.55, () => {
            for (let j = 0; j < 8; j++) {
              b._bullet({
                x: b.px + dir * 30,
                y: b.py - b.h * 0.5 + (j - 3.5) * 22,
                vx: dir * 420,
                vy: (j % 2 ? 1 : -1) * 40,
                radius: 6,
                color: 0xd8f0a0,
                damage: b.damage * 0.22,
                life: 2.2,
              })
            }
          })
        }
        sfx(b, 'scan', 0.42, 0.6)
      },
    },
    zst_quarantine: {
      name: '隔离区',
      en: 'QUARANTINE',
      sig: true,
      wind: 0.68,
      cool: 5.8,
      range: [0, 620],
      exec() {
        const p = b.player
        if (!p) return
        const cx = clampW(b, p.centerX)
        // 四个隔离桩贴着玩家落下，随后边界向内收
        const n = 4
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.4
          const x = clampW(b, cx + Math.cos(a) * 130)
          mark(b, x, feetY(b), 34, 0x9ab84a, 0.42 + k * 0.05)
          after(b, 0.42 + k * 0.05, () => {
            b._bullet({
              x,
              y: feetY(b) - 22,
              vx: 0,
              vy: 0,
              radius: 11,
              color: 0x6b8a3a,
              damage: b.damage * 0.14,
              life: 2.6,
            })
            sparkLine(b, x, feetY(b), cx, feetY(b) - 80, 0x9ab84a, 5, 80)
          })
        }
        after(b, 0.85, () => {
          for (let k = 0; k < (b.phase > 1 ? 10 : 7); k++) {
            const a = (k / 7) * Math.PI * 2
            b._bullet({
              x: cx + Math.cos(a) * 110,
              y: feetY(b) - 26 + Math.sin(a) * 30,
              vx: -Math.cos(a) * 150,
              vy: -Math.sin(a) * 100,
              gravity: 140,
              radius: 5,
              color: A,
              damage: b.damage * 0.2,
              life: 1.2,
            })
          }
          pushPlayer(b, Math.sign(cx - p.centerX) || 1, 180, 40, 8)
        })
        sfx(b, 'alarm', 0.4, 0.8)
      },
    },
  }
}

// ============================================================ 19 原型心智
function sig_protoMind(b) {
  const A = b.accent
  return {
    ptm_thought_lattice: {
      name: '思维晶格',
      en: 'THOUGHT LATTICE',
      sig: true,
      wind: 0.84,
      cool: 7.4,
      range: [200, 1400],
      exec() {
        const p = b.player
        if (!p) return
        // 两排交错晶格：第一排打竖列，第二排错半格，逼玩家走斜线
        for (let row = 0; row < 2; row++) {
          for (let k = 0; k < 4; k++) {
            const x = clampW(b, p.centerX + (k - 1.5) * 78 + (row ? 39 : 0))
            mark(b, x, feetY(b), 30, 0x8fe8ff, 0.42 + k * 0.1 + row * 0.5)
            after(b, 0.42 + k * 0.1 + row * 0.5, () => {
              b._bullet({
                x,
                y: b.py - 340,
                vx: 0,
                vy: 760,
                radius: 5,
                color: row ? 0x5ac8e8 : 0x8fe8ff,
                damage: b.damage * 0.28,
                life: 1.2,
              })
              sparkLine(b, x, b.py - 320, x, feetY(b), 0x8fe8ff, 5, 70)
            })
          }
        }
        // 二阶段：晶格连线，横穿整排的思维锁
        if (b.phase > 1) {
          after(b, 1.5, () => {
            const y = b.py - b.h * 0.3
            for (let k = 0; k < 8; k++) {
              b._bullet({
                x: b.px + b.facing * 20,
                y: y + (k - 3.5) * 16,
                vx: b.facing * 560,
                vy: 0,
                radius: 4,
                color: 0xffa0e0,
                damage: b.damage * 0.2,
                life: 1.8,
              })
            }
          })
        }
        sfx(b, 'alarm', 0.4, 1.2)
      },
    },
    ptm_mirror_clone: {
      name: '镜像替身',
      en: 'MIRROR CLONE',
      sig: true,
      wind: 0.56,
      cool: 4.8,
      range: [100, 800],
      exec() {
        const p = b.player
        if (!p) return
        // 在玩家背后投出一个镜像，先开火；本体随后从正面突进
        const mx = clampW(b, p.centerX + (p.centerX >= b.px ? 120 : -120))
        mark(b, mx, feetY(b), 46, A, 0.5)
        after(b, 0.5, () => {
          fan(b, 4, 0.16, 480, {
            x: mx,
            y: b.py - b.h * 0.25,
            radius: 4,
            color: 0xd0f8ff,
            damage: b.damage * 0.3,
            life: 1.3,
          })
          spark(b, mx, b.py - b.h * 0.25, A, 12, 170)
        })
        after(b, 0.85, () => {
          chargeAt(b, { hold: 0.5, boost: 3.4 })
          pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 280, 90, 12)
          sfx(b, 'growl', 0.42, 1.1)
        })
        sfx(b, 'scan', 0.36, 0.9)
      },
    },
  }
}

// ============================================================ 20 观测体
function sig_observer(b) {
  const A = b.accent
  return {
    obs_tractor_arc: {
      name: '牵引弧光',
      en: 'TRACTOR ARC',
      sig: true,
      wind: 0.72,
      cool: 6,
      range: [220, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        const y = p.centerY - 20
        // 弧形牵引：先把玩家沿地面拖走，再在拖行终点落一道采样束
        sparkLine(b, b.px, b.py - b.h * 0.2, p.centerX, y, A, 10, 100)
        after(b, 0.35, () => {
          pushPlayer(b, dir, 620, 70, 26)
          after(b, 0.18, () => pushPlayer(b, dir, 420, 40, 14))
        })
        after(b, 0.72, () => {
          const tx = clampW(b, p.centerX)
          mark(b, tx, feetY(b), 52, 0xff9ad8, 0.3)
          after(b, 0.3, () => {
            sparkLine(b, tx, b.py - b.h * 1.2, tx, feetY(b), 0xff9ad8, 9, 90)
            for (let k = 0; k < 3; k++) {
              b._bullet({
                x: tx + (k - 1) * 14,
                y: b.py - 320,
                vx: (k - 1) * 18,
                vy: 820,
                radius: 5,
                color: 0xff9ad8,
                damage: b.damage * 0.32,
                life: 1.2,
              })
            }
            burst(b, tx, feetY(b), 56, { color: A, sparks: 10, damage: b.damage * 0.2, sound: false })
          })
        })
        sfx(b, 'weld', 0.42, 0.7)
      },
    },
    obs_probe_swarm: {
      name: '探针回巢',
      en: 'PROBE SWARM',
      sig: true,
      wind: 0.6,
      cool: 4.6,
      range: [0, 900],
      exec() {
        const p = b.player
        if (!p) return
        const cx = clampW(b, p.centerX)
        const cy = p.centerY - 12
        // 探针先向外散开，再一起折返回玩家当前位置，形成二次命中
        for (let k = 0; k < (b.phase > 1 ? 12 : 9); k++) {
          const a = (k / 9) * Math.PI * 2 + 0.3
          after(b, k * 0.04, () => {
            b._bullet({
              x: cx,
              y: cy,
              vx: Math.cos(a) * 340,
              vy: Math.sin(a) * 280,
              radius: 4,
              color: 0x8fc4ff,
              damage: b.damage * 0.14,
              life: 0.42,
            })
          })
        }
        after(b, 0.62, () => {
          const tx = clampW(b, p.centerX)
          const ty = p.centerY - 10
          for (let k = 0; k < (b.phase > 1 ? 7 : 5); k++) {
            const a = (k / 5) * Math.PI * 2
            b._bullet({
              x: tx + Math.cos(a) * 120,
              y: ty + Math.sin(a) * 86,
              vx: -Math.cos(a) * 430,
              vy: -Math.sin(a) * 430,
              radius: 4,
              color: 0xff9ad8,
              damage: b.damage * 0.24,
              life: 0.55,
            })
          }
          spark(b, tx, ty, 0xff9ad8, 18, 210)
          shake(b, 0.3)
        })
        sfx(b, 'scan', 0.4, 1.4)
      },
    },
  }
}

// ============================================================ 21 铁血上校
function sig_ironColonel(b) {
  const A = b.accent
  return {
    iro_barrage_walk: {
      name: '徐进弹幕',
      en: 'WALKING BARRAGE',
      sig: true,
      wind: 0.8,
      cool: 7,
      range: [180, 1300],
      exec() {
        const p = b.player
        if (!p) return
        // 炮线一段段向前推进，每段落点都比上一段落得更远
        for (let k = 0; k < 5; k++) {
          const x = clampW(b, b.px + b.facing * (140 + k * 84), 60)
          mark(b, x, feetY(b), 42, 0xff9a5a, 0.42 + k * 0.14)
          after(b, 0.42 + k * 0.14, () => {
            lob(b, x, feetY(b) - 6, {
              t: 0.3,
              x: b.px + b.facing * 30,
              y: b.py - b.h * 0.8,
              radius: 9,
              color: 0xff9a5a,
              damage: b.damage * 0.44,
            })
            burst(b, x, feetY(b), 58, {
              color: A,
              sparks: 10,
              damage: b.damage * 0.2,
              sound: false,
            })
          })
        }
        // 二阶段：弹幕推完后，后坐力把整条战线震回来
        if (b.phase > 1) {
          after(b, 1.2, () => groundWave(b, -b.facing, 430, { radius: 12, color: A, damage: b.damage * 0.3 }))
        }
        sfx(b, 'thunder', 0.42, 0.8)
      },
    },
    iro_smoke_screen: {
      name: '烟幕突进',
      en: 'SMOKE SCREEN',
      sig: true,
      wind: 0.6,
      cool: 4.6,
      range: [0, 700],
      exec() {
        const p = b.player
        if (!p) return
        // 先铺烟，再从烟里撞出来，烟里还夹着零散枪火
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, p.centerX + (k - 1) * 96)
          mark(b, x, feetY(b), 34, 0x9a9a86, 0.3 + k * 0.1)
          after(b, 0.3 + k * 0.1, () => {
            puff(b, 22, 0x9a9a86, 2)
            spark(b, x, feetY(b) - 20, 0xffb060, 6, 100)
          })
        }
        after(b, 0.75, () => {
          chargeAt(b, { hold: 0.5, boost: 3.2 })
          fan(b, b.phase > 1 ? 6 : 4, 0.18, 500, {
            radius: 4,
            color: 0xffb060,
            damage: b.damage * 0.3,
            life: 1.2,
          })
        })
        sfx(b, 'weld', 0.4, 1.2)
      },
    },
  }
}

// ============================================================ 22 图书馆员
function sig_librarian(b) {
  const A = b.accent
  return {
    lib_shelf_aisle: {
      name: '书架夹道',
      en: 'SHELF AISLE',
      sig: true,
      wind: 0.76,
      cool: 6.2,
      range: [0, 800],
      exec() {
        const p = b.player
        if (!p) return
        // 两排书架贴着玩家两侧立起，再往中间倒书
        for (const side of [-1, 1]) {
          const x = clampW(b, p.centerX + side * 150)
          mark(b, x, feetY(b), 46, 0xb08458, 0.5)
          after(b, 0.5, () => {
            for (let k = 0; k < 4; k++) {
              b._bullet({
                x,
                y: feetY(b) - 10,
                vx: 0,
                vy: 0,
                radius: 12,
                color: 0x8a6a48,
                damage: b.damage * 0.16,
                life: 3.2,
              })
            }
          })
        }
        after(b, 0.85, () => {
          for (let k = 0; k < (b.phase > 1 ? 8 : 6); k++) {
            const x = clampW(b, p.centerX + (k - 2.5) * 34)
            b._bullet({
              x,
              y: b.py - 300,
              vx: 0,
              vy: 640,
              gravity: 300,
              radius: 5,
              color: 0xd8c0a0,
              damage: b.damage * 0.22,
              life: 1.3,
            })
          }
          pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 200, 40, 8)
        })
        sfx(b, 'scan', 0.42, 0.7)
      },
    },
    lib_silence_edict: {
      name: '逐页飞书',
      en: 'PAGE STORM',
      sig: true,
      wind: 0.54,
      cool: 4.2,
      range: [120, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 书页呈螺旋飞出，越转越快，最后钉成一道「肃静」环
        for (let k = 0; k < 10; k++) {
          after(b, k * 0.06, () => {
            const a = k * 0.63
            b._bullet({
              x: b.px + Math.cos(a) * 30,
              y: b.py - b.h * 0.3 + Math.sin(a) * 26,
              vx: Math.cos(a) * (300 + k * 22),
              vy: Math.sin(a) * (300 + k * 22),
              radius: 4,
              color: k % 2 ? 0xd8c0a0 : 0xb08458,
              damage: b.damage * 0.2,
              life: 1.6,
            })
          })
        }
        after(b, 0.7, () => {
          ring(b, b.phase > 1 ? 10 : 7, 200, {
            x: p.centerX,
            y: p.centerY - 10,
            radius: 3,
            color: A,
            damage: b.damage * 0.22,
            life: 1,
            offset: 0.3,
          })
        })
        sfx(b, 'alarm', 0.36, 1.4)
      },
    },
  }
}

// ============================================================ 23 教导主任
function sig_schoolmaster(b) {
  const A = b.accent
  return {
    sch_assembly_line: {
      name: '课桌行军',
      en: 'DESK MARCH',
      sig: true,
      wind: 0.68,
      cool: 5.6,
      range: [0, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        // 一排课桌贴地平移，桌腿扫脚踝，必须连续起跳
        for (let k = 0; k < 4; k++) {
          after(b, k * 0.26, () => {
            b._bullet({
              x: b.px + dir * 40,
              y: feetY(b) - 12,
              vx: dir * (330 + k * 18),
              vy: 0,
              radius: 13,
              color: 0xc08a4a,
              damage: b.damage * 0.26,
              life: 3,
            })
            spark(b, b.px + dir * 40, feetY(b) - 12, 0xc08a4a, 8, 130)
          })
        }
        after(b, 1.15, () => {
          const x = clampW(b, p.centerX)
          mark(b, x, feetY(b), 60, A, 0.36)
          after(b, 0.36, () => {
            burst(b, x, feetY(b), 82, { color: A, sparks: 12, damage: b.damage * 0.48, shake: 0.35 })
            if (b.phase > 1) groundWave(b, dir, 420, { radius: 12, color: A, damage: b.damage * 0.3 })
          })
        })
        sfx(b, 'weld', 0.4, 0.9)
      },
    },
    sch_blackboard: {
      name: '黑板划线',
      en: 'CHALK LINE',
      sig: true,
      wind: 0.58,
      cool: 4.4,
      range: [160, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 两侧黑板同时斜划到玩家脚下，交点炸开
        for (const side of [-1, 1]) {
          const sx = clampW(b, b.px + side * 210, 50)
          const sy = b.py - b.h * 0.9
          mark(b, p.centerX, feetY(b), 42, 0xf0f0d8, 0.42)
          after(b, 0.42, () => {
            sparkLine(b, sx, sy, clampW(b, p.centerX), feetY(b) - 10, 0xf0f0d8, 8, 100)
            shot(b, sx, sy, p.centerX, feetY(b) - 14, 780, {
              radius: 4,
              color: 0xf0f0d8,
              damage: b.damage * 0.3,
              life: 0.9,
            })
          })
        }
        after(b, 0.48, () => {
          aoe(b, clampW(b, p.centerX), feetY(b), 64, b.damage * 0.42)
          spark(b, p.centerX, feetY(b) - 14, 0xf0f0d8, 16, 170)
          if (b.phase > 1) {
            for (let k = 0; k < 6; k++) {
              b._bullet({
                x: b.px + b.facing * 30,
                y: b.py - b.h * 0.3 + (k - 2.5) * 18,
                vx: b.facing * 480,
                vy: 0,
                radius: 4,
                color: A,
                damage: b.damage * 0.2,
                life: 1.4,
              })
            }
          }
        })
        sfx(b, 'thunder', 0.4, 0.8)
      },
    },
  }
}

// ============================================================ 24 老教授
function sig_professor(b) {
  const A = b.accent
  return {
    prf_peer_review: {
      name: '同行评议',
      en: 'PEER REVIEW',
      sig: true,
      wind: 0.62,
      cool: 5.2,
      range: [200, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 四份评审意见从四个角依次投下，每份比上一份更贴近真实落点
        const pts = [
          [70, 0.28],
          [w - 70, 0.4],
          [b.px - 160, 0.52],
          [b.px + 160, 0.64],
        ]
        pts.forEach(([sx, delay], k) => {
          const tx = clampW(b, predictX(b, 0.2 + k * 0.16))
          mark(b, tx, feetY(b), 34, A, delay)
          after(delay, () => {
            shot(b, clampW(b, sx, 40), b.py - b.h * 0.5, tx, feetY(b) - 20, 760, {
              radius: 4,
              color: k % 2 ? 0xd8e8ff : 0xffe8a0,
              damage: b.damage * 0.3,
              life: 1.4,
            })
            burst(b, tx, feetY(b), 44, { color: A, sparks: 8, damage: b.damage * 0.16, sound: false })
          })
        })
        sfx(b, 'radio', 0.42, 0.6)
      },
    },
    prf_pop_quiz: {
      name: '随堂小测',
      en: 'POP QUIZ',
      sig: true,
      wind: 0.7,
      cool: 6,
      range: [0, 600],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        // 三问叠加在同一块地面：改答案也没用，只能离开座位
        for (let k = 0; k < 3; k++) {
          mark(b, tx, feetY(b), 52 + k * 16, 0xffe8a0, 0.45 + k * 0.36, { segments: 4 + k * 2 })
          after(b, 0.45 + k * 0.36, () => {
            aoe(b, tx, feetY(b), 56 + k * 18, b.damage * (0.26 + k * 0.1))
            spark(b, tx, feetY(b), 0xffe8a0, 8 + k * 3, 130)
            if (k === 2) {
              shake(b, 0.4)
              if (b.phase > 1) {
                ring(b, 9, 240, { x: tx, y: feetY(b) - 20, radius: 4, color: A, damage: b.damage * 0.26, life: 1.2 })
              }
            }
          })
        }
        sfx(b, 'alarm', 0.4, 0.9)
      },
    },
  }
}

// ============================================================ 25 印刷厂长
function sig_paperPress(b) {
  const A = b.accent
  return {
    pmp_ink_flood: {
      name: '油墨漫版',
      en: 'INK FLOOD',
      sig: true,
      wind: 0.72,
      cool: 6.4,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 一层墨浪贴地推过去，浪尾留下洗不掉的墨池
        groundWave(b, p.centerX >= b.px ? 1 : -1, 380, {
          radius: 16,
          color: 0x2a2a3a,
          damage: b.damage * 0.4,
          life: 2.8,
        })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, p.centerX + (k - 1) * 110)
          mark(b, x, feetY(b), 40, 0x2a2a3a, 0.55 + k * 0.12)
          after(b, 0.55 + k * 0.12, () => {
            b._bullet({
              x,
              y: feetY(b) - 8,
              vx: 0,
              vy: 0,
              radius: 18,
              color: 0x1a1a2a,
              damage: b.damage * 0.14,
              life: 3.4,
            })
            puff(b, 10, 0x2a2a3a, 1.2)
          })
        }
        sfx(b, 'weld', 0.44, 0.7)
      },
    },
    pmp_guillotine: {
      name: '裁切铡刀',
      en: 'GUILLOTINE',
      sig: true,
      wind: 0.9,
      cool: 7.2,
      range: [100, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, predictX(b, 0.55))
        mark(b, tx, feetY(b), 86, 0xff5a4a, 0.72, { segments: 4 })
        sparkLine(b, tx, b.py - 360, tx, feetY(b) - 12, 0xffd0c0, 6, 60)
        after(b, 0.72, () => {
          // 刀刃落下，切口向两侧弹纸屑
          b._bullet({
            x: tx,
            y: b.py - 340,
            vx: 0,
            vy: 1400,
            gravity: 600,
            radius: 12,
            color: 0xe8e8e8,
            damage: b.damage * 0.7,
            life: 1.1,
          })
          burst(b, tx, feetY(b), 96, {
            color: 0xff5a4a,
            dust: 0x3a3a3a,
            sparks: 16,
            damage: b.damage * 0.4,
            shake: 0.5,
          })
          for (const dir of [-1, 1]) {
            groundWave(b, dir, b.phase > 1 ? 460 : 380, { radius: 11, color: A, damage: b.damage * 0.3 })
          }
        })
        sfx(b, 'thunder', 0.5, 0.9)
      },
    },
  }
}

// ============================================================ 26 藏品馆长
function sig_curator(b) {
  const A = b.accent
  return {
    cur_spotlight_vitrine: {
      name: '展柜聚光',
      en: 'VITRINE SPOTLIGHT',
      sig: true,
      wind: 0.74,
      cool: 6.6,
      range: [0, 640],
      exec() {
        const p = b.player
        if (!p) return
        // 四面玻璃先围成展柜，随后顶灯在柜内灼烧
        const cx = clampW(b, p.centerX)
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, cx + (k - 1.5) * 64)
          mark(b, x, feetY(b), 30, 0xc8e8f0, 0.4 + k * 0.05)
          after(b, 0.4 + k * 0.05, () => {
            b._bullet({
              x,
              y: feetY(b) - 36,
              vx: 0,
              vy: 0,
              radius: 10,
              color: 0x9fd0e0,
              damage: b.damage * 0.12,
              life: 2.6,
            })
          })
        }
        after(b, 0.75, () => {
          sparkLine(b, cx, b.py - b.h * 1.4, cx, feetY(b), 0xfff0c0, 10, 70)
          for (let k = 0; k < 3; k++) {
            after(b, k * 0.16, () => aoe(b, cx, feetY(b), 58, b.damage * 0.3))
          }
          if (b.phase > 1) {
            ring(b, 8, 200, { x: cx, y: feetY(b) - 40, radius: 4, color: A, damage: b.damage * 0.24, life: 1.2 })
          }
          shake(b, 0.34)
        })
        sfx(b, 'scan', 0.44, 0.7)
      },
    },
    cur_restoration: {
      name: '修复拼合',
      en: 'RESTORATION',
      sig: true,
      wind: 0.68,
      cool: 5.8,
      range: [140, 1100],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        const ty = p.centerY - 16
        // 碎片从四面八方飞回中心，拼合的瞬间向内挤压
        for (let k = 0; k < (b.phase > 1 ? 12 : 8); k++) {
          const a = (k / 8) * Math.PI * 2
          after(b, 0.22 + k * 0.03, () => {
            b._bullet({
              x: tx + Math.cos(a) * 190,
              y: ty + Math.sin(a) * 130,
              vx: -Math.cos(a) * 300,
              vy: -Math.sin(a) * 300,
              radius: 4,
              color: 0xd8c0a0,
              damage: b.damage * 0.18,
              life: 0.75,
            })
          })
        }
        after(b, 0.62, () => {
          burst(b, tx, ty, 66, { color: 0xfff0c0, sparks: 14, damage: b.damage * 0.4, shake: 0.3 })
          pushPlayer(b, Math.sign(b.px - tx) || 1, 300, 100, 14)
        })
        sfx(b, 'alarm', 0.4, 1.2)
      },
    },
  }
}

// ============================================================ 27 典狱长
function sig_warden(b) {
  const A = b.accent
  return {
    wrd_cell_block: {
      name: '囚笼落锁',
      en: 'CELL BLOCK',
      sig: true,
      wind: 0.78,
      cool: 6.8,
      range: [0, 760],
      exec() {
        const p = b.player
        if (!p) return
        // 三根铁栏插在玩家周围，只留左右两条窄缝
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, p.centerX + (k - 1) * 86)
          mark(b, x, feetY(b), 40, 0x9aa8b8, 0.45 + k * 0.1, { segments: 4 })
          after(b, 0.45 + k * 0.1, () => {
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x,
                y: feetY(b) - 16 - j * 26,
                vx: 0,
                vy: 0,
                radius: 11,
                color: 0x8a96a8,
                damage: b.damage * 0.12,
                life: 3.2,
              })
            }
            spark(b, x, feetY(b) - 30, A, 10, 140)
          })
        }
        after(b, 0.92, () => {
          groundWave(b, Math.sign(b.px - p.centerX) || 1, b.phase > 1 ? 480 : 400, {
            radius: 13,
            color: A,
            damage: b.damage * 0.34,
          })
          shake(b, 0.36)
        })
        sfx(b, 'thunder', 0.44, 0.8)
      },
    },
    wrd_siren_rush: {
      name: '警笛冲监',
      en: 'SIREN RUSH',
      sig: true,
      wind: 0.5,
      cool: 4.8,
      range: [180, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 第一次冲撞；二阶段原地折返再冲一次，警笛环夹在中间
        chargeAt(b, { hold: 0.55, boost: 3.5, sound: 'alarm' })
        after(b, 0.6, () => {
          ring(b, 7, 230, { radius: 4, color: A, damage: b.damage * 0.22, life: 1 })
          if (b.phase > 1) {
            chargeAt(b, { hold: 0.5, boost: 4.1, sound: 'alarm' })
            after(b, 0.55, () => {
              burst(b, b.px, feetY(b), 104, {
                color: A,
                sparks: 16,
                damage: b.damage * 0.5,
                shake: 0.42,
              })
            })
          }
        })
        spark(b, b.px, b.py - b.h * 0.3, A, 14, 200)
        sfx(b, 'alarm', 0.4, 1.3)
      },
    },
  }
}

// ============================================================ 28 夜班前台
function sig_hotelClerk(b) {
  const A = b.accent
  return {
    htc_door_ring: {
      name: '四门轮开',
      en: 'DOOR RING',
      sig: true,
      wind: 0.7,
      cool: 6,
      range: [100, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 四扇门围着玩家依次打开，每扇门的门缝都朝圆心扫
        const cx = clampW(b, p.centerX)
        const spots = [-180, -60, 60, 180]
        spots.forEach((off, k) => {
          const x = clampW(b, cx + off)
          mark(b, x, feetY(b), 42, 0xc07080, 0.42 + k * 0.16, { segments: 4 })
          after(b, 0.42 + k * 0.16, () => {
            sparkLine(b, x, feetY(b) - 44, cx, feetY(b) - 30, 0xffb0c0, 7, 90)
            shot(b, x, feetY(b) - 44, cx, feetY(b) - 30, 680, {
              radius: 5,
              color: 0xffb0c0,
              damage: b.damage * 0.24,
              life: 0.8,
            })
            aoe(b, x, feetY(b), 46, b.damage * 0.2)
            puff(b, 8, 0x4a2a38, 1.1)
          })
        })
        after(b, 1.15, () => {
          aoe(b, cx, feetY(b), 96, b.damage * 0.4)
          if (b.phase > 1) {
            ring(b, 9, 240, { x: cx, y: feetY(b) - 30, radius: 4, color: A, damage: b.damage * 0.24, life: 1.2 })
          }
        })
        sfx(b, 'scan', 0.4, 0.9)
      },
    },
    htc_bell_desk: {
      name: '服务铃潮',
      en: 'SERVICE BELL',
      sig: true,
      wind: 0.84,
      cool: 8.2,
      range: [0, 9999],
      exec() {
        const p = b.player
        if (!p) return
        // 前台铃连按三下，每一下都叫来一名「行李员」
        for (let k = 0; k < 3; k++) {
          after(b, k * 0.3, () => {
            ring(b, b.phase > 1 ? 12 : 9, 180 + k * 30, {
              radius: 4,
              color: 0xffd0a0,
              damage: b.damage * 0.2,
              life: 1.4,
              offset: k * 0.4,
            })
            sfx(b, 'radio', 0.34, 1.5)
          })
        }
        after(b, 0.4, () => {
          summonWave(b, b.phase > 1 ? 3 : 2, { base: 96, gap: 54 })
        })
        after(b, 1.05, () => {
          const tx = clampW(b, p.centerX)
          mark(b, tx, feetY(b), 72, A, 0.4)
          after(b, 0.4, () => {
            burst(b, tx, feetY(b), 96, { color: A, sparks: 16, damage: b.damage * 0.5, shake: 0.4 })
          })
        })
        sfx(b, 'alarm', 0.44, 0.7)
      },
    },
  }
}

// ============================================================ 29 老码头工头
function sig_dockmaster2(b) {
  const A = b.accent
  return {
    dkm_crane_lattice: {
      name: '吊机格阵',
      en: 'CRANE LATTICE',
      sig: true,
      wind: 0.8,
      cool: 7.2,
      range: [200, 1300],
      exec() {
        const p = b.player
        if (!p) return
        // 四台吊机按格位落钩，格与格之间的空当每次只出现一瞬
        const { w } = roomBounds(b)
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, (w / 5) * (k + 1) + (p.centerX > w / 2 ? 24 : -24), 60)
          mark(b, x, feetY(b), 38, A, 0.42 + k * 0.14)
          after(b, 0.42 + k * 0.14, () => {
            lob(b, x, feetY(b) - 6, {
              t: 0.3,
              x,
              y: b.py - 380,
              gravity: 1500,
              radius: 11,
              color: 0xa0a8a8,
              damage: b.damage * 0.55,
            })
            burst(b, x, feetY(b), 64, { color: A, sparks: 10, damage: b.damage * 0.24, sound: false })
          })
        }
        if (b.phase > 1) {
          after(b, 1.15, () => {
            for (let k = 0; k < 6; k++) {
              b._bullet({
                x: b.px + b.facing * 30,
                y: b.py - b.h * 0.4 + (k - 2.5) * 22,
                vx: b.facing * 540,
                vy: 0,
                radius: 5,
                color: 0xd8e0e0,
                damage: b.damage * 0.22,
                life: 1.5,
              })
            }
          })
        }
        sfx(b, 'weld', 0.46, 0.8)
      },
    },
    dkm_tide_gate: {
      name: '潮闸泄水',
      en: 'TIDE GATE',
      sig: true,
      wind: 0.66,
      cool: 5.4,
      range: [0, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 两侧闸门先漏两道水线，再把中间地面冲开
        for (const from of [40, w - 40]) {
          const dir = from < w / 2 ? 1 : -1
          after(b, 0.3, () => {
            for (let k = 0; k < 3; k++) {
              b._bullet({
                x: from + dir * 20,
                y: feetY(b) - 10 - k * 26,
                vx: dir * 440,
                vy: 0,
                radius: 11,
                color: 0x7a9aa8,
                damage: b.damage * 0.24,
                life: 2.6,
              })
            }
          })
        }
        after(b, 0.62, () => {
          const x = clampW(b, p.centerX)
          mark(b, x, feetY(b), 74, 0x9ac8d0, 0.4)
          after(b, 0.4, () => {
            burst(b, x, feetY(b), 108, { color: 0x9ac8d0, sparks: 18, damage: b.damage * 0.55, shake: 0.48 })
            pushPlayer(b, Math.sign(b.px - x) || 1, 380, 120, 18)
          })
        })
        sfx(b, 'thunder', 0.44, 0.7)
      },
    },
  }
}

// ============================================================ 30 守灯人
function sig_lighthouseKeeper2(b) {
  const A = b.accent
  return {
    lhk_beacon_arc: {
      name: '灯塔扫弧',
      en: 'BEACON ARC',
      sig: true,
      wind: 0.68,
      cool: 5.8,
      range: [160, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const sy = b.py - b.h * 0.4
        const base = Math.atan2(p.centerY - sy, p.centerX - b.px)
        // 灯臂转三圈，每一圈都比上一圈低一点，形成斜向扫射
        for (let round = 0; round < 3; round++) {
          after(b, round * 0.34, () => {
            for (let k = 0; k < 5; k++) {
              const a = base + (k - 2) * 0.1 + round * 0.08
              b._bullet({
                x: b.px,
                y: sy + round * 18,
                vx: Math.cos(a) * 820,
                vy: Math.sin(a) * 820,
                radius: 4,
                color: round === 1 ? 0xfff2c0 : A,
                damage: b.damage * 0.28,
                life: 1.8,
              })
            }
            sparkLine(b, b.px, sy, b.px + Math.cos(base) * 320, sy + Math.sin(base) * 320, 0xfff2c0, 6, 70)
          })
        }
        if (b.phase > 1) {
          after(b, 1.15, () => {
            ring(b, 10, 300, { radius: 5, color: 0xfff2c0, damage: b.damage * 0.24, life: 1.3, offset: 0.2 })
          })
        }
        sfx(b, 'scan', 0.42, 0.5)
      },
    },
    lhk_rock_reef: {
      name: '礁石出水',
      en: 'ROCK REEF',
      sig: true,
      wind: 0.74,
      cool: 6.8,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 暗礁从脚下顶起，把场地切成几段；随后浪把玩家往礁上推
        const xs = [p.centerX - 170, p.centerX - 50, p.centerX + 70, p.centerX + 190]
        for (let k = 0; k < xs.length; k++) {
          const x = clampW(b, xs[k], 60)
          mark(b, x, feetY(b), 36, 0x8a98a8, 0.35 + k * 0.1)
          after(b, 0.35 + k * 0.1, () => {
            b._bullet({
              x,
              y: feetY(b) - 26,
              vx: 0,
              vy: -120,
              gravity: 520,
              radius: 14,
              color: 0x6a7a88,
              damage: b.damage * 0.18,
              life: 3.4,
            })
            puff(b, 12, 0x8a98a8, 1.4)
            spark(b, x, feetY(b) - 20, A, 8, 120)
          })
        }
        after(b, 1, () => {
          pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 420, 90, 18)
          groundWave(b, Math.sign(b.px - p.centerX) || 1, 380, {
            radius: 12,
            color: 0x9ac8d0,
            damage: b.damage * 0.3,
          })
          if (b.phase > 1) {
            groundWave(b, Math.sign(p.centerX - b.px) || 1, 460, {
              radius: 12,
              color: 0x9ac8d0,
              damage: b.damage * 0.3,
            })
          }
        })
        sfx(b, 'weld', 0.4, 0.9)
      },
    },
  }
}

// ============================================================ 31 船匠·铆钉手
function sig_shipwright2(b) {
  const A = b.accent
  return {
    shw_hull_clamp: {
      name: '船骨夹梁',
      en: 'HULL CLAMP',
      sig: true,
      wind: 0.76,
      cool: 6.4,
      range: [160, 1100],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        // 两根船骨从场地两侧夹向玩家，夹住后再落龙骨
        for (const side of [-1, 1]) {
          const sx = clampW(b, tx + side * 260, 50)
          mark(b, sx, feetY(b), 40, A, 0.55)
          after(b, 0.55, () => {
            for (let k = 0; k < 3; k++) {
              b._bullet({
                x: sx,
                y: feetY(b) - 20 - k * 24,
                vx: -side * 460,
                vy: 0,
                radius: 10,
                color: 0x9aa8a8,
                damage: b.damage * 0.26,
                life: 1.4,
              })
            }
          })
        }
        after(b, 0.82, () => {
          mark(b, tx, feetY(b), 78, 0xfff0a0, 0.38, { segments: 4 })
          after(b, 0.38, () => {
            burst(b, tx, feetY(b), 110, { color: A, sparks: 18, damage: b.damage * 0.6, shake: 0.46 })
            if (b.phase > 1) groundWave(b, Math.sign(b.px - tx) || 1, 440, { radius: 12, color: A, damage: b.damage * 0.32 })
          })
        })
        sfx(b, 'thunder', 0.44, 0.8)
      },
    },
    shw_triple_rivet: {
      name: '三联铆钉',
      en: 'TRIPLE RIVET',
      sig: true,
      wind: 0.44,
      cool: 3.6,
      range: [140, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 三把铆钉枪高低错位，各打一扇窄角，缝隙不重合
        for (let k = 0; k < 3; k++) {
          const sx = clampW(b, b.px + (k - 1) * 46)
          after(b, 0.2 + k * 0.14, () => {
            for (let j = 0; j < 3; j++) {
              shot(b, sx, b.py - b.h * (0.18 + k * 0.13), p.centerX + (j - 1) * 22, p.centerY - 8, 820, {
                radius: 3,
                color: k % 2 ? 0xfff0a0 : 0xe8f0f0,
                damage: b.damage * 0.24,
                life: 1,
              })
            }
            spark(b, sx, b.py - b.h * 0.3, 0xfff0a0, 8, 150)
          })
        }
        if (b.phase > 1) {
          after(b, 0.9, () => {
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: b.px + b.facing * 30,
                y: b.py - b.h * 0.4 + (k - 2) * 20,
                vx: b.facing * 600,
                vy: 0,
                radius: 4,
                color: A,
                damage: b.damage * 0.2,
                life: 1.3,
              })
            }
          })
        }
        sfx(b, 'weld', 0.38, 1.4)
      },
    },
  }
}

// ============================================================ 32 坞架机
function sig_drydockRig2(b) {
  const A = b.accent
  return {
    ddr_dock_collapse: {
      name: '船坞断板',
      en: 'DOCK COLLAPSE',
      sig: true,
      wind: 0.82,
      cool: 7,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 三块坞板依次断裂下沉，板缝里涌出碎料
        const xs = [p.centerX - 130, p.centerX, p.centerX + 140]
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, xs[k], 60)
          mark(b, x, feetY(b), 54, A, 0.4 + k * 0.16)
          after(b, 0.4 + k * 0.16, () => {
            burst(b, x, feetY(b), 76, { color: A, dust: 0x5a5a4a, sparks: 12, damage: b.damage * 0.32, sound: false, shake: 0.24 })
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x: x + (j - 1) * 18,
                y: b.py - 300,
                vx: 0,
                vy: 620,
                gravity: 400,
                radius: 6,
                color: 0x8a7a60,
                damage: b.damage * 0.18,
                life: 1.3,
              })
            }
          })
        }
        after(b, 1.05, () => {
          ring(b, b.phase > 1 ? 12 : 8, 260, { radius: 4, color: A, damage: b.damage * 0.24, life: 1.3 })
        })
        sfx(b, 'thunder', 0.46, 0.7)
      },
    },
    ddr_chain_tow: {
      name: '锚链拖行',
      en: 'CHAIN TOW',
      sig: true,
      wind: 0.62,
      cool: 5.2,
      range: [200, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        // 锚链先钉住玩家，再分两段往 BOSS 方向拖，终点砸下配重
        mark(b, tx, feetY(b), 46, A, 0.5)
        sparkLine(b, b.px, b.py - b.h * 0.3, tx, feetY(b) - 24, A, 8, 80)
        after(b, 0.5, () => {
          const dir = Math.sign(b.px - p.centerX) || 1
          pushPlayer(b, dir, 520, 60, 22)
          after(b, 0.25, () => {
            pushPlayer(b, dir, 360, 40, 12)
            burst(b, p.centerX, feetY(b), 68, { color: A, sparks: 10, damage: b.damage * 0.3, sound: false })
          })
        })
        after(b, 1, () => {
          const lx = clampW(b, p.centerX)
          mark(b, lx, feetY(b), 62, 0xffd08a, 0.3)
          after(b, 0.3, () => {
            burst(b, lx, feetY(b), 88, { color: 0xffd08a, sparks: 14, damage: b.damage * 0.5, shake: 0.4 })
          })
        })
        sfx(b, 'weld', 0.4, 0.9)
      },
    },
  }
}

// ============================================================ 33 过载变电体
function sig_substation2(b) {
  const A = b.accent
  return {
    sub_breaker_cascade: {
      name: '断路器级联',
      en: 'BREAKER CASCADE',
      sig: true,
      wind: 0.7,
      cool: 6,
      range: [120, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 五个开关柜沿之字路线接连跳闸，最后一路直指玩家
        for (let k = 0; k < 5; k++) {
          const x = clampW(b, (w / 5) * k + 90 + (k % 2 ? 30 : -30), 50)
          after(b, 0.35 + k * 0.18, () => {
            burst(b, x, feetY(b), 54, { color: A, sparks: 8, damage: b.damage * 0.22, sound: false, shake: 0.14 })
            if (k === 4) {
              sparkLine(b, x, feetY(b) - 40, clampW(b, p.centerX), feetY(b) - 20, 0xd0f8ff, 9, 110)
              aoe(b, p.centerX, feetY(b), 66, b.damage * 0.5)
            }
          })
        }
        if (b.phase > 1) {
          after(b, 1.35, () => ring(b, 12, 300, { radius: 5, color: A, damage: b.damage * 0.28, life: 1.4 }))
        }
        sfx(b, 'alarm', 0.42, 1.2)
      },
    },
    sub_live_grid: {
      name: '高压地网',
      en: 'LIVE GRID',
      sig: true,
      wind: 0.66,
      cool: 5.4,
      range: [0, 1500],
      exec() {
        const p = b.player
        if (!p) return
        // 三层横向电网同时推进，层间留缝，只能横穿
        for (let layer = 0; layer < 3; layer++) {
          after(b, layer * 0.22, () => {
            const y = feetY(b) - 10 - layer * 48
            for (let k = 0; k < 7; k++) {
              b._bullet({
                x: clampW(b, p.centerX - 260 + k * 76, 40),
                y,
                vx: 0,
                vy: 0,
                radius: 8,
                color: layer === 1 ? 0xd0f8ff : A,
                damage: b.damage * 0.18,
                life: 2.2,
              })
            }
            spark(b, p.centerX, y, 0xd0f8ff, 10, 180)
          })
        }
        after(b, 0.85, () => {
          const tx = clampW(b, p.centerX)
          mark(b, tx, feetY(b), 60, 0xd0f8ff, 0.32)
          after(b, 0.32, () => burst(b, tx, feetY(b), 82, { color: A, sparks: 16, damage: b.damage * 0.5, shake: 0.4 }))
        })
        sfx(b, 'thunder', 0.44, 0.7)
      },
    },
  }
}

// ============================================================ 34 堡垒司令
function sig_bunkerCommander2(b) {
  const A = b.accent
  return {
    bnc_mortar_pit: {
      name: '迫击炮坑',
      en: 'MORTAR PIT',
      sig: true,
      wind: 0.8,
      cool: 6.8,
      range: [240, 1400],
      exec() {
        const p = b.player
        if (!p) return
        // 五发迫击弹按提前量铺路，落点一路追着玩家
        for (let k = 0; k < 5; k++) {
          const x = clampW(b, predictX(b, 0.25 + k * 0.14) + (k % 2 ? 26 : -26), 60)
          mark(b, x, feetY(b), 38, A, 0.5 + k * 0.1)
          after(b, 0.5 + k * 0.1, () => {
            lob(b, x, feetY(b) - 6, {
              t: 0.34,
              x: b.px + b.facing * 26,
              y: b.py - b.h * 0.8,
              radius: 8,
              color: A,
              damage: b.damage * 0.4,
            })
            burst(b, x, feetY(b), 58, { color: A, dust: 0x4a4e52, sparks: 8, damage: b.damage * 0.16, sound: false })
          })
        }
        // 二阶段：炮击后封锁整条边线
        if (b.phase > 1) {
          after(b, 1.25, () => groundWave(b, Math.sign(p.centerX - b.px) || 1, 460, { radius: 12, color: A, damage: b.damage * 0.3 }))
        }
        sfx(b, 'thunder', 0.44, 0.9)
      },
    },
    bnc_trench_pincer: {
      name: '战壕夹击',
      en: 'TRENCH PINCER',
      sig: true,
      wind: 0.68,
      cool: 5.6,
      range: [0, 1600],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 两侧战壕同时开火，贴地夹击，中间再抬一发
        for (const from of [40, w - 40]) {
          const dir = from < w / 2 ? 1 : -1
          for (let k = 0; k < 3; k++) {
            after(b, 0.3 + k * 0.1, () => {
              b._bullet({
                x: from + dir * 16,
                y: feetY(b) - 10 - k * 10,
                vx: dir * (380 + k * 30),
                vy: 0,
                radius: 9,
                color: A,
                damage: b.damage * 0.22,
                life: 2.8,
              })
            })
          }
        }
        after(b, 0.72, () => {
          const tx = clampW(b, p.centerX)
          mark(b, tx, feetY(b), 58, 0xffd08a, 0.36)
          after(b, 0.36, () => {
            burst(b, tx, feetY(b), 90, { color: A, sparks: 16, damage: b.damage * 0.5, shake: 0.42 })
          })
        })
        sfx(b, 'radio', 0.42, 0.8)
      },
    },
  }
}

// ============================================================ 35 矿井工头
function sig_mineForeman2(b) {
  const A = b.accent
  return {
    mnf_shaft_cave: {
      name: '竖井塌方',
      en: 'SHAFT CAVE-IN',
      sig: true,
      wind: 0.84,
      cool: 7.2,
      range: [0, 1100],
      exec() {
        const p = b.player
        if (!p) return
        // 三根支柱被依次抽掉，顶板从玩家头顶塌下来
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, p.centerX + (k - 1) * 96)
          mark(b, x, feetY(b), 40, A, 0.5 + k * 0.18)
          after(b, 0.5 + k * 0.18, () => {
            sparkLine(b, x, b.py - 320, x, feetY(b), 0xffe8a0, 5, 60)
            for (let j = 0; j < 4; j++) {
              b._bullet({
                x: x + (j - 1.5) * 14,
                y: b.py - 300,
                vx: 0,
                vy: 760,
                gravity: 400,
                radius: 6,
                color: 0x7a6a50,
                damage: b.damage * 0.24,
                life: 1.4,
              })
            }
            burst(b, x, feetY(b), 48, { color: A, dust: 0x5a4a3a, sparks: 6, damage: b.damage * 0.2, sound: false })
          })
        }
        if (b.phase > 1) {
          after(b, 1.3, () => {
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: b.px + b.facing * 30,
                y: b.py - b.h * 0.35 + (k - 2) * 20,
                vx: b.facing * 560,
                vy: 0,
                radius: 5,
                color: 0xffe8a0,
                damage: b.damage * 0.2,
                life: 1.4,
              })
            }
          })
        }
        sfx(b, 'thunder', 0.46, 0.8)
      },
    },
    mnf_lamp_blackout: {
      name: '矿灯熄灭',
      en: 'LAMP BLACKOUT',
      sig: true,
      wind: 0.6,
      cool: 5,
      range: [0, 640],
      exec() {
        const p = b.player
        if (!p) return
        const cx = clampW(b, p.centerX)
        // 灯一灭，五处暗桩同时亮起，只能凭记忆走位
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.5
          const x = clampW(b, cx + Math.cos(a) * 120)
          mark(b, x, feetY(b), 34, 0x3a3a4a, 0.9, { pulse: k % 2 === 0 })
        }
        after(b, 0.9, () => {
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + 0.5
            const x = clampW(b, cx + Math.cos(a) * 120)
            burst(b, x, feetY(b), 54, { color: 0xffe8a0, sparks: 8, damage: b.damage * 0.34, sound: false, shake: 0.16 })
          }
          spark(b, cx, feetY(b) - 20, A, 20, 220)
          shake(b, 0.4)
          if (b.phase > 1) aoe(b, cx, feetY(b), 110, b.damage * 0.4)
        })
        sfx(b, 'alarm', 0.4, 0.4)
      },
    },
  }
}

// ============================================================ 36 锅炉王
function sig_boilerKing2(b) {
  const A = b.accent
  return {
    blk_steam_vent: {
      name: '蒸汽喷口',
      en: 'STEAM VENT',
      sig: true,
      wind: 0.66,
      cool: 5.6,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        // 地面阀口一段段炸开，每口都往侧向喷汽，把人往中间挤
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + dir * (100 + k * 90), 60)
          mark(b, x, feetY(b), 34, 0xffc890, 0.36 + k * 0.14)
          after(b, 0.36 + k * 0.14, () => {
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x,
                y: feetY(b) - 12,
                vx: (j - 1) * 90,
                vy: -420 - j * 30,
                gravity: 700,
                radius: 6,
                color: 0xe8e0d0,
                damage: b.damage * 0.2,
                life: 1.5,
              })
            }
            pushPlayer(b, -dir, 260, 60, 8)
            puff(b, 14, 0xd8d0c0, 1.6)
          })
        }
        if (b.phase > 1) {
          after(b, 1.05, () => {
            const x = clampW(b, p.centerX)
            mark(b, x, feetY(b), 66, 0xffb060, 0.34)
            after(b, 0.34, () => burst(b, x, feetY(b), 96, { color: 0xffb060, sparks: 18, damage: b.damage * 0.55, shake: 0.44 }))
          })
        }
        sfx(b, 'weld', 0.4, 1.5)
      },
    },
    blk_boiler_overpressure: {
      name: '锅炉超压',
      en: 'BOILER OVERPRESSURE',
      sig: true,
      wind: 0.78,
      cool: 7.4,
      range: [0, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 三次压力脉冲，一次比一次快，最后一次把玩家往外掀
        for (let k = 0; k < 3; k++) {
          after(b, k * 0.3, () => {
            ring(b, b.phase > 1 ? 10 + k * 2 : 7 + k * 2, 240 + k * 40, {
              radius: 5,
              color: 0xffb060,
              damage: b.damage * 0.24,
              life: 1.4,
              offset: k * 0.18,
            })
            puff(b, 12, 0xd8d0c0, 1.3)
            shake(b, 0.28)
            if (k === 2) {
              pushPlayer(b, Math.sign(p.centerX - b.px) || 1, 420, 120, 16)
              burst(b, b.px + b.facing * 60, feetY(b), b.phase > 1 ? 150 : 120, {
                color: 0xffc890,
                sparks: 20,
                damage: b.damage * 0.5,
                shake: 0.4,
              })
            }
          })
        }
        sfx(b, 'thunder', 0.48, 0.8)
      },
    },
  }
}

// ============================================================ 37 反应堆祭司
function sig_reactorPriest2(b) {
  const A = b.accent
  return {
    rpp_meltdown_hymn: {
      name: '熔毁圣歌',
      en: 'MELTDOWN HYMN',
      sig: true,
      wind: 0.9,
      cool: 8.2,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 祭司站定诵经，四拍递进的圣歌环，每拍之间柱子落向玩家
        for (let k = 0; k < 4; k++) {
          after(b, k * 0.42, () => {
            ring(b, b.phase > 1 ? 12 : 8, 200 + k * 40, {
              radius: 4,
              color: k % 2 ? A : 0xd0ffa0,
              damage: b.damage * 0.24,
              life: 1.4,
              offset: k * 0.28,
            })
            sfx(b, 'scan', 0.32, 1 + k * 0.1)
          })
          const tx = clampW(b, p.centerX + (k - 1.5) * 50)
          mark(b, tx, feetY(b), 30, 0xd0ffa0, 0.34 + k * 0.42)
          after(b, 0.34 + k * 0.42, () => sparkLine(b, tx, b.py - 300, tx, feetY(b), 0xd0ffa0, 6, 70))
        }
        if (b.phase > 1) {
          after(b, 1.75, () => {
            const x = clampW(b, p.centerX)
            burst(b, x, feetY(b), 130, { color: A, sparks: 22, damage: b.damage * 0.5, shake: 0.5 })
          })
        }
        sfx(b, 'alarm', 0.5, 0.6)
      },
    },
    rpp_rod_cross: {
      name: '控制棒十字',
      en: 'ROD CROSS',
      sig: true,
      wind: 0.72,
      cool: 6.2,
      range: [140, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        const ty = p.centerY - 20
        // 一竖一横两根控制棒在玩家身上交叉，交叉点先烧红再炸
        mark(b, tx, feetY(b), 44, A, 0.55)
        after(b, 0.55, () => {
          for (let k = 0; k < 5; k++) {
            b._bullet({
              x: tx,
              y: b.py - 300 + k * 40,
              vx: 0,
              vy: 700,
              radius: 6,
              color: 0xd0ffa0,
              damage: b.damage * 0.2,
              life: 1.2,
            })
            shot(b, tx - 240, ty + (k - 2) * 8, tx + 240, ty, 640, {
              radius: 3,
              color: A,
              damage: b.damage * 0.18,
              life: 1.1,
            })
          }
          aoe(b, tx, ty, 60, b.damage * 0.55)
          spark(b, tx, ty, 0xd0ffa0, 20, 240)
          if (b.phase > 1) {
            for (const dir of [-1, 1]) {
              groundWave(b, dir, 420, { radius: 11, color: A, damage: b.damage * 0.3 })
            }
          }
        })
        sfx(b, 'thunder', 0.46, 0.8)
      },
    },
  }
}

// ============================================================ 38 辐照巨像
function sig_radColossus2(b) {
  const A = b.accent
  return {
    rdc_fallout_ring: {
      name: '沉降尘环',
      en: 'FALLOUT RING',
      sig: true,
      wind: 0.86,
      cool: 7.4,
      range: [0, 1100],
      exec() {
        const p = b.player
        if (!p) return
        // 先抛出一圈沉降尘，落地后在四个方向留下热斑
        ring(b, b.phase > 1 ? 18 : 13, 280, {
          radius: 6,
          color: 0xb8f060,
          damage: b.damage * 0.3,
          life: 2,
          offset: 0.12,
        })
        for (let k = 0; k < 4; k++) {
          const a = Math.PI * 0.25 + k * Math.PI * 0.5
          const x = clampW(b, b.px + Math.cos(a) * 210)
          mark(b, x, feetY(b), 48, 0xb8f060, 0.7 + k * 0.1)
          after(b, 0.7 + k * 0.1, () => {
            b._bullet({
              x,
              y: feetY(b) - 8,
              vx: 0,
              vy: 0,
              radius: 20,
              color: 0x8ab040,
              damage: b.damage * 0.16,
              life: 3.6,
            })
            puff(b, 14, 0x8ab040, 1.6)
          })
        }
        shake(b, 0.42)
        sfx(b, 'thunder', 0.48, 0.6)
      },
    },
    rdc_glow_grapple: {
      name: '辉光擒摔',
      en: 'GLOW GRAPPLE',
      sig: true,
      wind: 0.7,
      cool: 6,
      range: [100, 700],
      exec() {
        const p = b.player
        if (!p) return
        // 抓住玩家往上提，再往地上掼，落点一圈辐射尘
        mark(b, p.centerX, feetY(b), 54, 0xb8f060, 0.5)
        sparkLine(b, b.px, b.py - b.h * 0.2, p.centerX, p.centerY, 0xd0ffa0, 9, 110)
        after(b, 0.5, () => {
          pushPlayer(b, 0, 0, 320, 0)
          after(b, 0.45, () => {
            const lx = clampW(b, p.centerX)
            burst(b, lx, feetY(b), 104, { color: 0xb8f060, sparks: 18, damage: b.damage * 0.65, shake: 0.5 })
            ring(b, 8, 220, {
              x: lx,
              y: feetY(b) - 20,
              radius: 4,
              color: 0x8ab040,
              damage: b.damage * 0.26,
              life: 1.2,
              offset: 0.3,
            })
            if (b.phase > 1) aoe(b, lx, feetY(b), 130, b.damage * 0.3)
          })
        })
        sfx(b, 'weld', 0.42, 1.2)
      },
    },
  }
}

// ============================================================ 39 弹药库军士长
function sig_arsenalSergeant2(b) {
  const A = b.accent
  return {
    ars_magazine_chain: {
      name: '弹链殉爆',
      en: 'MAGAZINE CHAIN',
      sig: true,
      wind: 0.74,
      cool: 6.6,
      range: [180, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 弹药箱沿地面一路炸向玩家，每箱都比上一箱更近
        const x0 = b.px
        const x1 = clampW(b, p.centerX)
        for (let k = 0; k < 5; k++) {
          const x = clampW(b, x0 + ((x1 - x0) * (k + 1)) / 5)
          mark(b, x, feetY(b), 30, A, 0.26 + k * 0.14)
          after(b, 0.26 + k * 0.14, () => {
            burst(b, x, feetY(b), 58, { color: A, dust: 0x5a4a3a, sparks: 10, damage: b.damage * 0.3, sound: false, shake: 0.16 })
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x,
                y: feetY(b) - 18,
                vx: (j - 1) * 100,
                vy: -260,
                gravity: 700,
                radius: 4,
                color: 0xffd08a,
                damage: b.damage * 0.14,
                life: 1.2,
              })
            }
          })
        }
        if (b.phase > 1) {
          after(b, 1.2, () => {
            groundWave(b, Math.sign(x1 - x0) || 1, 440, { radius: 12, color: A, damage: b.damage * 0.3 })
          })
        }
        sfx(b, 'weld', 0.42, 0.7)
      },
    },
    ars_rocket_salvo: {
      name: '火箭齐投',
      en: 'ROCKET SALVO',
      sig: true,
      wind: 0.64,
      cool: 5.8,
      range: [260, 1500],
      exec() {
        const p = b.player
        if (!p) return
        // 四枚火箭从高空斜插，落点横跨半场，缝隙只够侧身
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, p.centerX + (k - 1.5) * 96)
          after(b, 0.3 + k * 0.12, () => {
            shot(b, b.px + b.facing * 40, b.py - b.h * 1.1, x, feetY(b) - 10, 520, {
              radius: 7,
              color: 0xff9a5a,
              damage: b.damage * 0.42,
              life: 2,
              gravity: 300,
            })
            mark(b, x, feetY(b), 48, A, 0.34)
            after(b, 0.34, () => {
              burst(b, x, feetY(b), 74, { color: A, dust: 0x5a4a3a, sparks: 12, damage: b.damage * 0.3, shake: 0.26 })
            })
          })
        }
        if (b.phase > 1) {
          after(b, 1.2, () => {
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: b.px + b.facing * 30,
                y: b.py - b.h * 0.3 + (k - 2) * 18,
                vx: b.facing * 600,
                vy: 0,
                radius: 4,
                color: 0xffd08a,
                damage: b.damage * 0.18,
                life: 1.3,
              })
            }
          })
        }
        sfx(b, 'alarm', 0.44, 1.1)
      },
    },
  }
}

// ============================================================ 40 音箱塔·失真
function sig_punkAmp2(b) {
  const A = b.accent
  return {
    pka_strobe_blast: {
      name: '频闪爆音',
      en: 'STROBE BLAST',
      sig: true,
      wind: 0.6,
      cool: 5.4,
      range: [0, 700],
      exec() {
        const p = b.player
        if (!p) return
        // 四拍频闪，每拍之间停一瞬，鼓点即安全窗
        for (let k = 0; k < 4; k++) {
          after(b, 0.28 + k * 0.5, () => {
            ring(b, b.phase > 1 ? 12 : 8, 260 + k * 30, {
              radius: 4,
              color: k % 2 ? 0xffb0e0 : A,
              damage: b.damage * 0.26,
              life: 1.2,
              offset: k * 0.22,
            })
            burst(b, b.px, b.py - 10, 46, { color: k % 2 ? 0xffb0e0 : A, sparks: 10, damage: b.damage * 0.14, sound: false, shake: 0.2 })
          })
        }
        if (b.phase > 1) {
          after(b, 2.3, () => {
            const tx = clampW(b, p.centerX)
            mark(b, tx, feetY(b), 60, 0xffb0e0, 0.3)
            after(b, 0.3, () => burst(b, tx, feetY(b), 90, { color: A, sparks: 18, damage: b.damage * 0.55, shake: 0.42 }))
          })
        }
        sfx(b, 'thunder', 0.42, 1.2)
      },
    },
    pka_crowd_surf: {
      name: '人群冲浪',
      en: 'CROWD SURF',
      sig: true,
      wind: 0.52,
      cool: 4.4,
      range: [120, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 顺着人浪横穿场地，身体两侧不停甩出侧向音爆
        chargeAt(b, { hold: 0.7, boost: 3.8, sound: 'growl' })
        for (let k = 0; k < (b.phase > 1 ? 5 : 3); k++) {
          after(b, 0.3 + k * 0.18, () => {
            fan(b, 2, 0.5, 420, {
              radius: 5,
              color: k % 2 ? 0xffb0e0 : A,
              damage: b.damage * 0.24,
              life: 1.2,
            })
            spark(b, b.px, b.py - b.h * 0.3, 0xffb0e0, 8, 150)
          })
        }
        sfx(b, 'weld', 0.4, 1.4)
      },
    },
  }
}

// ============================================================ 41 暗影行者
function sig_shadowWalker(b) {
  const A = b.accent
  return {
    shd_silhouette_mirror: {
      name: '对影成双',
      en: 'SILHOUETTE MIRROR',
      sig: true,
      wind: 0.64,
      cool: 5.2,
      range: [120, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 以玩家为镜面，在另一侧投出残影，本体与残影交叉开火
        const mx = clampW(b, p.centerX * 2 - b.px)
        mark(b, mx, feetY(b), 48, 0xd0c0ff, 0.5)
        after(b, 0.5, () => {
          fan(b, 4, 0.15, 500, { x: mx, y: b.py - b.h * 0.25, radius: 4, color: 0xd0c0ff, damage: b.damage * 0.28, life: 1.3 })
          spark(b, mx, b.py - b.h * 0.25, A, 12, 170)
        })
        after(b, 0.78, () => {
          for (let k = 0; k < 3; k++) {
            shot(b, b.px, b.py - b.h * 0.3, p.centerX, p.centerY - 20 + k * 14, 600, {
              radius: 5,
              color: A,
              damage: b.damage * 0.26,
              life: 1.2,
            })
          }
          if (b.phase > 1) ring(b, 8, 220, { x: mx, y: feetY(b) - 30, radius: 4, color: A, damage: b.damage * 0.24, life: 1.1 })
        })
        sfx(b, 'alarm', 0.4, 1.2)
      },
    },
    shd_umbral_pull: {
      name: '暗井拖坠',
      en: 'UMBRAL WELL',
      sig: true,
      wind: 0.58,
      cool: 4.4,
      range: [0, 700],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        mark(b, tx, feetY(b), 76, 0x3a2a5a, 0.5)
        after(b, 0.5, () => {
          pushPlayer(b, Math.sign(b.px - tx) || 1, 520, 90, 22)
          after(b, 0.32, () => {
            aoe(b, tx, feetY(b), 82, b.damage * 0.55)
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: tx + (k - 2) * 20,
                y: feetY(b) - 8,
                vx: 0,
                vy: -260,
                radius: 6,
                color: 0x3a2a5a,
                damage: b.damage * 0.18,
                life: 1.2,
              })
            }
            spark(b, tx, feetY(b), 0xd0c0ff, 16, 190)
          })
        })
        if (b.phase > 1) {
          after(b, 1.1, () => {
            const x2 = clampW(b, tx + 140)
            mark(b, x2, feetY(b), 56, A, 0.36)
            after(b, 0.36, () => burst(b, x2, feetY(b), 80, { color: A, sparks: 12, damage: b.damage * 0.4, shake: 0.3 }))
          })
        }
        sfx(b, 'growl', 0.42, 0.6)
      },
    },
  }
}

// ============================================================ 42 空王座
function sig_castleTyrant(b) {
  const A = b.accent
  return {
    cst_banquet_hall: {
      name: '宴会坠灯',
      en: 'BANQUET HALL',
      sig: true,
      wind: 0.82,
      cool: 6.8,
      range: [120, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 三盏吊灯落在长桌位置，烛火随后向两侧滚开
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, p.centerX + (k - 1) * 132)
          mark(b, x, feetY(b), 40, 0xffd07a, 0.5 + k * 0.14)
          after(b, 0.5 + k * 0.14, () => {
            lob(b, x, feetY(b) - 6, { t: 0.3, x, y: b.py - 340, gravity: 1500, radius: 12, color: 0xb08040, damage: b.damage * 0.5 })
            burst(b, x, feetY(b), 68, { color: 0xffd07a, sparks: 12, damage: b.damage * 0.24, sound: false })
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x,
                y: feetY(b) - 20,
                vx: (j - 1) * 170,
                vy: -180,
                gravity: 620,
                radius: 4,
                color: 0xffb060,
                damage: b.damage * 0.16,
                life: 1.5,
              })
            }
          })
        }
        if (b.phase > 1) {
          after(b, 1.1, () => {
            for (const dir of [-1, 1]) groundWave(b, dir, 420, { radius: 11, color: A, damage: b.damage * 0.28 })
          })
        }
        sfx(b, 'thunder', 0.46, 0.7)
      },
    },
    cst_iron_maiden: {
      name: '铁处女合拢',
      en: 'IRON MAIDEN',
      sig: true,
      wind: 0.72,
      cool: 6,
      range: [0, 560],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        // 两扇铁壁从左右合上，合拢后再落一排尖刺
        mark(b, tx, feetY(b), 58, 0x8a96a8, 0.5)
        for (const side of [-1, 1]) {
          const sx = clampW(b, tx + side * 190, 50)
          after(b, 0.5, () => {
            for (let k = 0; k < 4; k++) {
              b._bullet({
                x: sx,
                y: feetY(b) - 18 - k * 28,
                vx: -side * 340,
                vy: 0,
                radius: 12,
                color: 0x7a8698,
                damage: b.damage * 0.2,
                life: 1.3,
              })
            }
          })
        }
        after(b, 0.82, () => {
          burst(b, tx, feetY(b), 104, { color: A, dust: 0x3a3a4a, sparks: 16, damage: b.damage * 0.6, shake: 0.46 })
          pushPlayer(b, 0, 0, 240, 0)
          if (b.phase > 1) ring(b, 10, 260, { radius: 4, color: 0xffa0b0, damage: b.damage * 0.26, life: 1.2 })
        })
        sfx(b, 'thunder', 0.46, 1.2)
      },
    },
  }
}

// ============================================================ 43 血伯爵
function sig_vampireCount(b) {
  const A = b.accent
  return {
    vmp_blood_moon: {
      name: '血月垂天',
      en: 'BLOOD MOON',
      sig: true,
      wind: 0.88,
      cool: 8,
      range: [0, 1400],
      exec() {
        const p = b.player
        if (!p) return
        // 一轮残月挂起，月光呈断续的环形扫下，缺角处可以站人
        const cx = clampW(b, p.centerX)
        const cy = b.py - b.h * 0.55
        for (let k = 0; k < 16; k++) {
          if (k % 4 === 2) continue
          const a = (k / 16) * Math.PI * 2
          b._bullet({
            x: cx + Math.cos(a) * 26,
            y: cy + Math.sin(a) * 26,
            vx: Math.cos(a) * 300,
            vy: Math.sin(a) * 260,
            radius: 5,
            color: k % 2 ? A : 0xff7090,
            damage: b.damage * 0.24,
            life: 2.2,
          })
        }
        after(b, 0.3, () => {
          for (let k = 0; k < (b.phase > 1 ? 10 : 7); k++) {
            const a = Math.atan2(p.centerY - b.py, cx - b.px) + (k - 3) * 0.16
            b._bullet({
              x: b.px,
              y: b.py - b.h * 0.3,
              vx: Math.cos(a) * 380,
              vy: Math.sin(a) * 380,
              radius: 3,
              color: 0xff7090,
              damage: b.damage * 0.18,
              life: 1.8,
            })
          }
          spark(b, cx, cy, A, 22, 240)
          shake(b, 0.36)
        })
        sfx(b, 'alarm', 0.5, 0.6)
      },
    },
    vmp_coffin_swarm: {
      name: '棺群开阖',
      en: 'COFFIN SWARM',
      sig: true,
      wind: 0.8,
      cool: 7,
      range: [80, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 三口棺木从地底升起，棺盖一开就朝上吐出蝠群
        const xs = [p.centerX - 160, p.centerX, p.centerX + 170]
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, xs[k], 60)
          mark(b, x, feetY(b), 38, 0x701828, 0.45 + k * 0.16)
          after(b, 0.45 + k * 0.16, () => {
            b._bullet({ x, y: feetY(b) - 24, vx: 0, vy: -100, gravity: 400, radius: 15, color: 0x4a1020, damage: b.damage * 0.16, life: 2.8 })
            for (let j = 0; j < 4; j++) {
              b._bullet({
                x,
                y: feetY(b) - 26,
                vx: (j - 1.5) * 90,
                vy: -420,
                gravity: 260,
                radius: 4,
                color: 0xff7090,
                damage: b.damage * 0.2,
                life: 1.6,
              })
            }
            puff(b, 12, 0x4a1a28, 1.5)
          })
        }
        if (b.phase > 1) {
          after(b, 1.1, () => {
            const x = clampW(b, p.centerX)
            mark(b, x, feetY(b), 54, A, 0.3)
            after(b, 0.3, () => {
              burst(b, x, feetY(b), 88, { color: A, sparks: 14, damage: b.damage * 0.5, shake: 0.4 })
              pushPlayer(b, Math.sign(b.px - x) || 1, 320, 100, 14)
            })
          })
        }
        sfx(b, 'growl', 0.42, 0.8)
      },
    },
  }
}

// ============================================================ 44 重力之眼
function sig_gravityEye(b) {
  const A = b.accent
  return {
    grv_gravity_lens: {
      name: '引力透镜',
      en: 'GRAVITY LENS',
      sig: true,
      wind: 0.74,
      cool: 6.4,
      range: [140, 900],
      exec() {
        const p = b.player
        if (!p) return
        const cx = clampW(b, p.centerX)
        const cy = p.centerY - 12
        // 先把周围物质吸成一点，再反冲炸开，收放各一次
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2
          after(b, 0.2 + k * 0.03, () => {
            b._bullet({
              x: cx + Math.cos(a) * 210,
              y: cy + Math.sin(a) * 140,
              vx: -Math.cos(a) * 340,
              vy: -Math.sin(a) * 340,
              radius: 4,
              color: 0x9a8fe0,
              damage: b.damage * 0.14,
              life: 0.68,
            })
          })
        }
        after(b, 0.72, () => {
          burst(b, cx, cy, 60, { color: A, sparks: 16, damage: b.damage * 0.3, shake: 0.26 })
          ring(b, b.phase > 1 ? 14 : 10, 320, { x: cx, y: cy, radius: 4, color: 0xd0c0ff, damage: b.damage * 0.26, life: 1.5, offset: 0.2 })
        })
        sfx(b, 'scan', 0.44, 0.9)
      },
    },
    grv_orbit_shear: {
      name: '轨道错切',
      en: 'ORBIT SHEAR',
      sig: true,
      wind: 0.6,
      cool: 4.8,
      range: [0, 800],
      exec() {
        const p = b.player
        if (!p) return
        const base = Math.atan2(p.centerY - b.py, p.centerX - b.px)
        // 环绕体依次脱轨，每一颗的射线角度都比前一颗偏一点
        for (let k = 0; k < 9; k++) {
          after(b, k * 0.07, () => {
            const a = base + k * 0.34
            b._bullet({
              x: b.px + Math.cos(a) * 40,
              y: b.py - b.h * 0.3 + Math.sin(a) * 32,
              vx: Math.cos(a + 0.5) * 460,
              vy: Math.sin(a + 0.5) * 460,
              radius: 4,
              color: k % 2 ? A : 0xd0c0ff,
              damage: b.damage * 0.2,
              life: 1.4,
            })
          })
        }
        after(b, 0.85, () => {
          ring(b, b.phase > 1 ? 12 : 8, 240, { radius: 4, color: A, damage: b.damage * 0.24, life: 1.2, offset: 0.5 })
          pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 260, 90, 10)
        })
        sfx(b, 'alarm', 0.4, 1.3)
      },
    },
  }
}

// ============================================================ 45 雾中形
function sig_fogWraith(b) {
  const A = b.accent
  return {
    fgw_fog_bank: {
      name: '浓雾压境',
      en: 'FOG BANK',
      sig: true,
      wind: 0.8,
      cool: 6.6,
      range: [0, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        // 一整面浓雾缓慢推进，中间留一道几乎看不见的缝
        for (let k = 0; k < 4; k++) {
          after(b, k * 0.34, () => {
            for (let j = 0; j < 5; j++) {
              if (j === 2) continue
              b._bullet({
                x: b.px + dir * (30 + k * 22),
                y: b.py - b.h * 0.75 + j * 32,
                vx: dir * 150,
                vy: 0,
                radius: 12,
                color: 0xc8d8e0,
                damage: b.damage * 0.18,
                life: 4.4,
              })
            }
            puff(b, 14, 0xc8d8e0, 1.6)
          })
        }
        after(b, 0.5, () => pushPlayer(b, -dir, 200, 40, 8))
        if (b.phase > 1) {
          after(b, 1.5, () => {
            for (let j = 0; j < 7; j++) {
              b._bullet({
                x: b.px + dir * 30,
                y: b.py - b.h * 0.6 + (j - 3) * 24,
                vx: dir * 400,
                vy: 0,
                radius: 5,
                color: 0xd8e8f0,
                damage: b.damage * 0.2,
                life: 2.4,
              })
            }
          })
        }
        sfx(b, 'growl', 0.44, 0.6)
      },
    },
    fgw_lantern_lure: {
      name: '引魂灯',
      en: 'LANTERN LURE',
      sig: true,
      wind: 0.56,
      cool: 4.6,
      range: [0, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 鬼火在玩家身后亮起，把人往灯下拽，灯火随即炸开
        const side = p.centerX >= b.px ? 1 : -1
        const lx = clampW(b, p.centerX + side * 150)
        mark(b, lx, feetY(b), 34, 0x8fd8c0, 0.45, { pulse: true })
        after(b, 0.45, () => {
          pushPlayer(b, Math.sign(lx - p.centerX) || 1, 480, 60, 18)
          spark(b, lx, feetY(b) - 30, 0x8fd8c0, 12, 170)
          after(b, 0.35, () => {
            burst(b, lx, feetY(b), 78, { color: A, sparks: 14, damage: b.damage * 0.45, shake: 0.3 })
            ring(b, 8, 180, { x: lx, y: feetY(b) - 24, radius: 3, color: 0xc8d8e0, damage: b.damage * 0.2, life: 1 })
          })
        })
        if (b.phase > 1) {
          after(b, 1.1, () => {
            const l2 = clampW(b, p.centerX - side * 130)
            mark(b, l2, feetY(b), 30, 0xc8d8e0, 0.32)
            after(b, 0.32, () => burst(b, l2, feetY(b), 66, { color: A, sparks: 10, damage: b.damage * 0.32, sound: false }))
          })
        }
        sfx(b, 'scan', 0.38, 1.2)
      },
    },
  }
}

// ============================================================ 46 海峡嚎叫者
function sig_straitHowler(b) {
  const A = b.accent
  return {
    sth_maelstrom: {
      name: '海峡漩涡',
      en: 'STRAIT MAELSTROM',
      sig: true,
      wind: 0.72,
      cool: 6.2,
      range: [100, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 螺旋水流一圈圈甩出去，方向逐圈偏转，形成旋涡枪
        for (let k = 0; k < 14; k++) {
          after(b, k * 0.065, () => {
            const a = k * 0.55
            b._bullet({
              x: b.px + Math.cos(a) * 26,
              y: b.py - b.h * 0.3 + Math.sin(a) * 22,
              vx: Math.cos(a) * (280 + k * 14),
              vy: Math.sin(a) * (280 + k * 14) - 30,
              radius: 5,
              color: k % 2 ? 0x9ac8d0 : A,
              damage: b.damage * 0.18,
              life: 1.9,
            })
          })
        }
        after(b, 0.98, () => {
          ring(b, b.phase > 1 ? 14 : 10, 260, { radius: 5, color: 0xd0e8f8, damage: b.damage * 0.26, life: 1.3 })
          pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 320, 100, 14)
          shake(b, 0.34)
        })
        sfx(b, 'growl', 0.46, 0.7)
      },
    },
    sth_cliff_echo: {
      name: '崖壁回响',
      en: 'CLIFF ECHO',
      sig: true,
      wind: 0.78,
      cool: 7,
      range: [0, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 声音撞上崖壁折回来，先在玩家两侧炸，再在远处墙根炸
        const xs = [p.centerX - 120, p.centerX + 120, 80, w - 80]
        if (b.phase > 1) xs.push(p.centerX)
        xs.forEach((raw, k) => {
          const x = clampW(b, raw, 50)
          mark(b, x, feetY(b), 36, 0xd0e8f8, 0.4 + k * 0.2)
          after(b, 0.4 + k * 0.2, () => {
            sparkLine(b, x, feetY(b), x, b.py - b.h * 0.6, 0xd0e8f8, 7, 90)
            burst(b, x, feetY(b), 72, { color: A, sparks: 12, damage: b.damage * 0.34, shake: 0.24 })
          })
        })
        sfx(b, 'thunder', 0.48, 0.5)
      },
    },
  }
}

// ============================================================ 47 沼泽巨口
function sig_swampMaw(b) {
  const A = b.accent
  return {
    swm_undertow_maw: {
      name: '沼口倒吸',
      en: 'UNDERTOW MAW',
      sig: true,
      wind: 0.7,
      cool: 5.6,
      range: [0, 640],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        // 泥沼在脚下裂开，先吸人，再合拢咀嚼
        mark(b, tx, feetY(b), 96, 0x5a6a32, 0.6)
        after(b, 0.6, () => {
          pushPlayer(b, Math.sign(tx - p.centerX) || 1, 560, 40, 26)
          for (let k = 0; k < 6; k++) {
            after(b, k * 0.08, () => {
              aoe(b, tx, feetY(b), 54, b.damage * 0.14)
              spark(b, tx, feetY(b), 0x8aa04a, 6, 100)
            })
          }
          after(b, 0.55, () => {
            aoe(b, tx, feetY(b), 110, b.damage * 0.55)
            puff(b, 20, 0x4a5a30, 1.8)
            shake(b, 0.42)
          })
        })
        if (b.phase > 1) {
          after(b, 1.25, () => {
            const x2 = clampW(b, tx - 150)
            mark(b, x2, feetY(b), 62, A, 0.34)
            after(b, 0.34, () => burst(b, x2, feetY(b), 92, { color: 0x8aa04a, sparks: 14, damage: b.damage * 0.38, shake: 0.3 }))
          })
        }
        sfx(b, 'growl', 0.44, 0.7)
      },
    },
    swm_methane_bog: {
      name: '沼气沼泡',
      en: 'METHANE BOG',
      sig: true,
      wind: 0.66,
      cool: 5.2,
      range: [100, 900],
      exec() {
        const p = b.player
        if (!p) return
        // 六个沼泡按顺序鼓起，最后两枚延迟最久，专抓回头的人
        for (let k = 0; k < 6; k++) {
          const x = clampW(b, p.centerX - 180 + k * 72)
          mark(b, x, feetY(b), 30, 0x8aa04a, 0.4 + k * 0.14)
          after(b, 0.4 + k * 0.14, () => {
            burst(b, x, feetY(b), 48, { color: 0x8aa04a, dust: 0x4a5a30, sparks: 6, damage: b.damage * 0.26, sound: false, shake: 0.12 })
            for (let j = 0; j < 2; j++) {
              b._bullet({
                x,
                y: feetY(b) - 16,
                vx: (j - 0.5) * 60,
                vy: -180,
                gravity: 300,
                radius: 6,
                color: 0x9ab84a,
                damage: b.damage * 0.16,
                life: 1.4,
              })
            }
          })
        }
        if (b.phase > 1) {
          after(b, 1.5, () => {
            const x = clampW(b, p.centerX)
            burst(b, x, feetY(b), 96, { color: A, sparks: 16, damage: b.damage * 0.5, shake: 0.44 })
          })
        }
        sfx(b, 'scan', 0.4, 0.8)
      },
    },
  }
}

// ============================================================ 48 森林空腔
function sig_forestHollow(b) {
  const A = b.accent
  return {
    fhh_root_cage: {
      name: '根须囚笼',
      en: 'ROOT CAGE',
      sig: true,
      wind: 0.68,
      cool: 5.4,
      range: [0, 700],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX)
        // 两侧树根拔地而起，合围之后再从顶上压下
        for (const side of [-1, 1]) {
          const x = clampW(b, tx + side * 140, 50)
          mark(b, x, feetY(b), 34, 0x6b8a3a, 0.5)
          after(b, 0.5, () => {
            for (let k = 0; k < 3; k++) {
              b._bullet({
                x,
                y: feetY(b) - 20 - k * 26,
                vx: -side * 260,
                vy: 0,
                radius: 10,
                color: 0x5a7a32,
                damage: b.damage * 0.18,
                life: 2.4,
              })
            }
          })
        }
        after(b, 0.78, () => {
          mark(b, tx, feetY(b), 72, A, 0.32)
          after(b, 0.32, () => {
            burst(b, tx, feetY(b), 100, { color: A, dust: 0x3a4a28, sparks: 14, damage: b.damage * 0.55, shake: 0.44 })
            if (b.phase > 1) {
              for (let k = 0; k < 4; k++) {
                b._bullet({ x: tx, y: b.py - 300, vx: (k - 1.5) * 90, vy: 620, gravity: 300, radius: 5, color: 0x8aa04a, damage: b.damage * 0.18, life: 1.3 })
              }
            }
          })
        })
        sfx(b, 'growl', 0.42, 0.7)
      },
    },
    fhh_season_fall: {
      name: '落叶换季',
      en: 'SEASON FALL',
      sig: true,
      wind: 0.8,
      cool: 6.8,
      range: [160, 1400],
      exec() {
        const p = b.player
        if (!p) return
        // 整片树冠落叶，叶片的横向漂移让落点呈曲线
        for (let k = 0; k < 11; k++) {
          const x = clampW(b, p.centerX - 250 + k * 50)
          after(b, 0.3 + k * 0.06, () => {
            b._bullet({
              x: x + 30,
              y: b.py - 300,
              vx: -40 - (k % 3) * 20,
              vy: 460,
              gravity: 180,
              radius: 5,
              color: k % 2 ? 0xc08a4a : 0x8aa04a,
              damage: b.damage * 0.2,
              life: 1.8,
            })
            mark(b, x - 20, feetY(b), 22, 0xc08a4a, 0.4)
          })
        }
        after(b, 1.05, () => {
          ring(b, b.phase > 1 ? 12 : 8, 240, { radius: 4, color: A, damage: b.damage * 0.24, life: 1.3, offset: 0.25 })
          shake(b, 0.3)
        })
        sfx(b, 'scan', 0.44, 1.2)
      },
    },
  }
}

// ============================================================ 49 赤潮
function sig_redTide(b) {
  const A = b.accent
  return {
    rdt_blood_algae: {
      name: '血藻蔓延',
      en: 'BLOOD ALGAE',
      sig: true,
      wind: 0.72,
      cool: 6.2,
      range: [80, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 三团血藻在玩家周围扩散，扩散完再把海流推过来
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, p.centerX + (k - 1) * 150)
          mark(b, x, feetY(b), 42, 0xff5a6a, 0.5 + k * 0.14)
          after(b, 0.5 + k * 0.14, () => {
            for (let j = 0; j < 2; j++) {
              b._bullet({
                x,
                y: feetY(b) - 8,
                vx: 0,
                vy: 0,
                radius: 17 + j * 9,
                color: j ? 0x9a2030 : 0xd04a5a,
                damage: b.damage * 0.13,
                life: 3,
              })
            }
            puff(b, 10, 0x7a1a28, 1.4)
          })
        }
        after(b, 0.9, () => {
          const dir = Math.sign(b.px - p.centerX) || 1
          pushPlayer(b, dir, 380, 100, 16)
          groundWave(b, dir, b.phase > 1 ? 470 : 390, { radius: 13, color: 0xd04a5a, damage: b.damage * 0.34 })
        })
        sfx(b, 'weld', 0.44, 0.7)
      },
    },
    rdt_current_pull: {
      name: '赤潮往复',
      en: 'RED CURRENT',
      sig: true,
      wind: 0.6,
      cool: 5,
      range: [100, 1100],
      exec() {
        const p = b.player
        if (!p) return
        // 海流来回三次，方向交替，最后一次带起一道赤浪
        for (let k = 0; k < 3; k++) {
          after(b, 0.25 + k * 0.36, () => {
            const dir = k % 2 ? 1 : -1
            pushPlayer(b, dir, 440 + k * 60, 70, 20)
            groundWave(b, dir, 300 + k * 30, { radius: 10, color: k % 2 ? 0xff5a6a : A, damage: b.damage * 0.24 })
            spark(b, p.centerX, feetY(b) - 10, 0xff5a6a, 10, 160)
          })
        }
        after(b, 1.5, () => {
          const dir = Math.sign(b.px - p.centerX) || 1
          groundWave(b, dir, b.phase > 1 ? 520 : 440, { radius: 16, color: 0xd04a5a, damage: b.damage * 0.5 })
          ring(b, b.phase > 1 ? 12 : 8, 260, { radius: 4, color: A, damage: b.damage * 0.24, life: 1.3 })
          shake(b, 0.4)
        })
        sfx(b, 'thunder', 0.46, 1.1)
      },
    },
  }
}

// ============================================================ 50 灰港吊机
function sig_greyHarbor(b) {
  const A = b.accent
  return {
    gyh_buoy_chain: {
      name: '浮标雷链',
      en: 'BUOY MINE CHAIN',
      sig: true,
      wind: 0.76,
      cool: 6.6,
      range: [0, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        // 四只浮标漂在水面，一分钟后连成一串全部起爆
        const xs = [(w / 5) * 1, (w / 5) * 2, (w / 5) * 3, (w / 5) * 4]
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, xs[k], 60)
          mark(b, x, feetY(b), 34, 0xff8a4a, 0.4 + k * 0.1)
          after(b, 0.4 + k * 0.1, () => {
            b._bullet({
              x,
              y: feetY(b) - 18,
              vx: 0,
              vy: 0,
              radius: 9,
              color: 0xd0a050,
              damage: b.damage * 0.16,
              life: 2.2 + k * 0.1,
            })
            spark(b, x, feetY(b) - 18, 0xff8a4a, 8, 130)
          })
        }
        after(b, 1.5, () => {
          for (let k = 0; k < 4; k++) {
            const x = clampW(b, xs[k], 60)
            after(b, k * 0.12, () => {
              burst(b, x, feetY(b), 90, { color: 0xff8a4a, dust: 0x4a4a4a, sparks: 16, damage: b.damage * 0.4, shake: 0.3 })
            })
          }
        })
        if (b.phase > 1) {
          after(b, 2.15, () => ring(b, 12, 300, { radius: 5, color: A, damage: b.damage * 0.26, life: 1.3 }))
        }
        sfx(b, 'alarm', 0.44, 0.6)
      },
    },
    gyh_harbor_bell: {
      name: '雾港钟声',
      en: 'HARBOR BELL',
      sig: true,
      wind: 0.82,
      cool: 7.4,
      range: [120, 1200],
      exec() {
        const p = b.player
        if (!p) return
        // 钟挂在浮标上而不是 BOSS 身上，钟声从玩家侧面荡开
        const bx = clampW(b, p.centerX + (p.centerX >= b.px ? 150 : -150))
        mark(b, bx, feetY(b), 40, 0xd8c070, 0.5)
        after(b, 0.5, () => {
          ring(b, b.phase > 1 ? 14 : 10, 230, { x: bx, y: feetY(b) - 34, radius: 5, color: 0xd8c070, damage: b.damage * 0.3, life: 1.8, offset: 0.1 })
          sparkLine(b, bx, feetY(b) - 34, b.px, b.py - b.h * 0.3, 0xd8c070, 7, 80)
          shake(b, 0.34)
        })
        after(b, 1, () => {
          const x = clampW(b, p.centerX)
          mark(b, x, feetY(b), 62, A, 0.4)
          after(b, 0.4, () => {
            lob(b, x, feetY(b) - 6, { t: 0.26, x, y: b.py - 400, gravity: 1700, radius: 13, color: 0x8a7a50, damage: b.damage * 0.55 })
            burst(b, x, feetY(b), 80, { color: A, dust: 0x4a4a4a, sparks: 12, damage: b.damage * 0.24, sound: false })
          })
        })
        sfx(b, 'thunder', 0.48, 0.6)
      },
    },
  }
}

// ============================================================ 51 十三号房客
function sig_hotelNightmare(b) {
  const A = b.accent
  return {
    htn_corridor_shift: {
      name: '走廊错位',
      en: 'CORRIDOR SHIFT',
      sig: true,
      wind: 0.78,
      cool: 6.6,
      range: [100, 1000],
      exec() {
        const p = b.player
        if (!p) return
        // 走廊灯一扇扇亮起，两边的门交替吐火；最后房客换到玩家身后
        const cx = clampW(b, p.centerX)
        for (let k = 0; k < 4; k++) {
          const side = k % 2 ? 1 : -1
          const x = clampW(b, cx + side * (210 - k * 44))
          mark(b, x, feetY(b), 34, 0xffb0c0, 0.4 + k * 0.16, { segments: 4 })
          after(b, 0.4 + k * 0.16, () => {
            sparkLine(b, x, feetY(b) - 40, cx, feetY(b) - 26, 0xffb0c0, 6, 90)
            aoe(b, x, feetY(b), 44, b.damage * 0.18)
            shot(b, x, feetY(b) - 40, cx, feetY(b) - 30, 700, { radius: 4, color: 0xffb0c0, damage: b.damage * 0.22, life: 0.8 })
          })
        }
        after(b, 1.25, () => {
          const bx = clampW(b, p.centerX + (p.centerX >= b.px ? 120 : -120))
          b.body.x = bx - b.body.w / 2
          b.body.y = p.body.y + p.body.h - b.body.h
          b.body.vx = 0
          b.body.vy = 0
          b.facing = p.centerX >= b.px ? 1 : -1
          spark(b, b.px, b.py, A, 20, 240)
          burst(b, b.px, feetY(b), b.phase > 1 ? 140 : 110, { color: A, sparks: 18, damage: b.damage * 0.6, shake: 0.42 })
        })
        sfx(b, 'alarm', 0.46, 1.1)
      },
    },
    htn_thirteen_keys: {
      name: '十三把钥匙',
      en: 'THIRTEEN KEYS',
      sig: true,
      wind: 0.64,
      cool: 5.4,
      range: [140, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const base = Math.atan2(p.centerY - b.py, p.centerX - b.px)
        // 十三把钥匙扇形撒出，其中两把故意留空，缝隙位置每轮不同
        for (let k = 0; k < 13; k++) {
          if (k === 4 || k === 9) continue
          after(b, k * 0.035, () => {
            const a = base + (k - 6) * 0.075
            b._bullet({
              x: b.px,
              y: b.py - b.h * 0.2,
              vx: Math.cos(a) * 640,
              vy: Math.sin(a) * 640,
              radius: 3,
              color: k % 3 ? A : 0xffe0a0,
              damage: b.damage * 0.2,
              life: 1.3,
            })
          })
        }
        after(b, 0.85, () => {
          if (b.phase > 1) {
            // 二阶段：背后的门也开一次，反向补满整个扇面
            const back = base + Math.PI
            for (let k = 0; k < 7; k++) {
              const a = back + (k - 3) * 0.11
              b._bullet({
                x: b.px,
                y: b.py - b.h * 0.2,
                vx: Math.cos(a) * 520,
                vy: Math.sin(a) * 520,
                radius: 3,
                color: 0xffe0a0,
                damage: b.damage * 0.16,
                life: 1.2,
              })
            }
          }
          const tx = clampW(b, p.centerX)
          mark(b, tx, feetY(b), 58, A, 0.3)
          after(b, 0.3, () => burst(b, tx, feetY(b), 82, { color: A, sparks: 14, damage: b.damage * 0.45, shake: 0.38 }))
        })
        sfx(b, 'scan', 0.4, 1.3)
      },
    },
  }
}

// 合并说明：本表由 theme-bosses.js 在构造 ThemeBoss 时按 cfg.id 取用，
// 并与 theme-boss-kits.js 的 BOSS_KIT_FACTORIES 同 id 的 kit 合并；
// 本文件不直接注册任何全局表，避免与 kits 的模块初始化顺序耦合。
export const BOSS_SIGNATURES = {
  tb_data_archon: sig_dataArchon,
  tb_assembly_overseer: sig_assemblyOverseer,
  tb_orbit_judge: sig_orbitJudge,
  tb_helios: sig_helios,
  tb_flood_colossus: sig_floodColossus,
  tb_bridge_raider: sig_bridgeRaider,
  tb_highway_king: sig_highwayKing,
  tb_skyline_baron: sig_skylineBaron,
  tb_arena_champion: sig_arenaChampion,
  tb_scrap_warlord: sig_scrapWarlord,
  tb_caregiver: sig_caregiver,
  tb_rally_boss: sig_rallyBoss,
  tb_storm_reaper: sig_stormReaper,
  tb_acid_mother: sig_acidMother,
  tb_rot_queen: sig_rotQueen,
  tb_bell_bishop: sig_bellBishop,
  tb_prime_core: sig_primeCore,
  tb_zero_strain: sig_zeroStrain,
  tb_proto_mind: sig_protoMind,
  tb_observer: sig_observer,
  tb_iron_colonel: sig_ironColonel,
  tb_librarian: sig_librarian,
  tb_schoolmaster: sig_schoolmaster,
  tb_professor: sig_professor,
  tb_paper_press: sig_paperPress,
  tb_curator: sig_curator,
  tb_warden: sig_warden,
  tb_hotel_clerk: sig_hotelClerk,
  tb_dockmaster: sig_dockmaster2,
  tb_lighthouse_keeper: sig_lighthouseKeeper2,
  tb_shipwright: sig_shipwright2,
  tb_drydock_rig: sig_drydockRig2,
  tb_substation: sig_substation2,
  tb_bunker_commander: sig_bunkerCommander2,
  tb_mine_foreman: sig_mineForeman2,
  tb_boiler_king: sig_boilerKing2,
  tb_reactor_priest: sig_reactorPriest2,
  tb_rad_colossus: sig_radColossus2,
  tb_arsenal_sergeant: sig_arsenalSergeant2,
  tb_punk_amp: sig_punkAmp2,
  tb_shadow_walker: sig_shadowWalker,
  tb_castle_tyrant: sig_castleTyrant,
  tb_vampire_count: sig_vampireCount,
  tb_gravity_eye: sig_gravityEye,
  tb_fog_wraith: sig_fogWraith,
  tb_strait_howler: sig_straitHowler,
  tb_swamp_maw: sig_swampMaw,
  tb_forest_hollow: sig_forestHollow,
  tb_red_tide: sig_redTide,
  tb_grey_harbor: sig_greyHarbor,
  tb_hotel_nightmare: sig_hotelNightmare,
}
