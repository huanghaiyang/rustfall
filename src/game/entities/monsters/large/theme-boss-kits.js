// 51 只主题 BOSS 的专属招式组。
//
// 每个 kit 只服务一只 BOSS：四个招式各有独立 id / 中英文名 / 前摇 / 冷却 /
// 距离区间 / exec。底层只用 theme-boss-fx.js 的原子件（弹道、预警圈、
// 延时、位移、召唤），不共用任何完整招式。
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
function bossKit_dataArchon(b) {
  const A = b.accent
  return {
    da_delete_beam: {
      name: '删除射线',
      en: 'DELETE BEAM',
      sig: true,
      wind: 0.62,
      cool: 2.8,
      range: [150, 1400],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 64, A, 0.45)
        after(b, 0.45, () => {
          for (let k = -1; k <= 1; k++) {
            shot(b, b.px, b.py - b.h * 0.2, p.centerX + k * 54, p.centerY + k * 9, 900, {
              radius: 4,
              life: 1.1,
              damage: b.damage * 0.55,
            })
          }
          spark(b, p.centerX, p.centerY, A, 14, 240)
        })
        if (b.phase > 1) {
          after(b, 0.72, () => fan(b, 5, 0.14, 640, { radius: 3, life: 1.2, damage: b.damage * 0.4 }))
        }
        spark(b, b.px + b.facing * 24, b.py - b.h * 0.2, A, 10, 180)
        sfx(b, 'alarm', 0.4, 1.15)
      },
    },
    da_packet_fan: {
      name: '数据包扇扫',
      en: 'PACKET FAN',
      wind: 0.34,
      cool: 1.9,
      range: [100, 620],
      exec() {
        fan(b, b.phase > 1 ? 9 : 7, 0.11, b.phase > 1 ? 520 : 460, {
          radius: 5,
          damage: b.damage * 0.7,
          color: 0x9fe0ff,
        })
        spark(b, b.px + b.facing * 20, b.py - b.h * 0.16, 0x9fe0ff, 9, 200)
        sfx(b, 'alarm', 0.3, 1.6)
      },
    },
    da_node_sentry: {
      name: '节点哨戒',
      en: 'NODE SENTRIES',
      wind: 0.8,
      cool: 9,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 2, { first: 0, base: 110, gap: 54 })
        mark(b, b.px - 120, feetY(b), 58, A, 0.6)
        mark(b, b.px + 120, feetY(b), 58, A, 0.6)
        after(b, 0.6, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 120, b.py - b.h * 0.3, b.px + dir * 420, b.py, 430, {
              radius: 3,
              life: 1.4,
              damage: b.damage * 0.35,
              color: 0x6ff0d0,
            })
          }
        })
      },
    },
    da_buffer_overflow: {
      name: '缓存溢出',
      en: 'BUFFER OVERFLOW',
      wind: 0.4,
      cool: 2.4,
      range: [0, 230],
      exec() {
        burst(b, b.px + b.facing * 70, feetY(b), b.phase > 1 ? 170 : 140, {
          color: A,
          sparks: 20,
          damage: b.damage * 0.95,
        })
        ring(b, b.phase > 1 ? 10 : 7, 300, { radius: 4, damage: b.damage * 0.55 })
        if (b.phase > 1) {
          after(b, 0.3, () => burst(b, b.px, feetY(b), 120, { color: 0x6ff0d0, sparks: 12 }))
        }
        sfx(b, 'alarm', 0.45, 0.7)
      },
    },
  }
}

// ============================================================ 02 装配线监工
function bossKit_assemblyOverseer(b) {
  const A = b.accent
  return {
    ao_beat_slam: {
      name: '流水线节拍',
      en: 'CONVEYOR BEAT',
      sig: true,
      wind: 0.7,
      cool: 2.8,
      range: [170, 900],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, b.px + (p.centerX - b.px) * ((k + 1) / n))
          mark(b, tx, feetY(b), 92, A, 0.35 + k * 0.28)
          after(b, 0.35 + k * 0.28, () => {
            burst(b, tx, feetY(b), 96, { color: A, sparks: 10, shake: 0.35, damage: b.damage * 0.75 })
          })
        }
        sfx(b, 'thunder', 0.4, 1.35)
      },
    },
    ao_piston_punch: {
      name: '液压冲拳',
      en: 'PISTON PUNCH',
      wind: 0.42,
      cool: 2.1,
      range: [0, 245],
      exec() {
        fan(b, b.phase > 1 ? 7 : 5, 0.1, 430, {
          radius: 6,
          damage: b.damage * 0.65,
          color: 0xffb060,
          life: 0.75,
        })
        burst(b, b.px + b.facing * 88, feetY(b), b.phase > 1 ? 120 : 96, {
          color: 0xffb060,
          sparks: 14,
          damage: b.damage * 0.8,
        })
      },
    },
    ao_bolt_volley: {
      name: '螺栓齐射',
      en: 'BOLT VOLLEY',
      wind: 0.52,
      cool: 2.7,
      range: [260, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 8 : 6
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, predictX(b, 0.35 + k * 0.08) + (k - (n - 1) / 2) * 54)
          lob(b, tx, feetY(b) - 8, {
            t: 0.75 + (k % 3) * 0.12,
            radius: 5,
            color: 0xd8d0c0,
            damage: b.damage * 0.6,
          })
        }
        sfx(b, 'scan', 0.35, 1.1)
      },
    },
    ao_shift_call: {
      name: '换班广播',
      en: 'SHIFT CALL',
      wind: 0.85,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 60 })
        for (let k = 0; k < 3; k++) {
          mark(b, b.px + (k - 1) * 110, feetY(b), 52, 0xff8a3c, 0.3 + k * 0.2)
          after(b, 0.3 + k * 0.2, () => {
            spark(b, b.px + (k - 1) * 110, b.py, 0xff8a3c, 12, 180)
            sfx(b, 'radio', 0.3, 1.2)
          })
        }
      },
    },
  }
}

// ============================================================ 03 轨道裁决者
function bossKit_orbitJudge(b) {
  const A = b.accent
  return {
    oj_orbital_drop: {
      name: '轨道坠落',
      en: 'ORBITAL DROP',
      sig: true,
      wind: 0.75,
      cool: 3.2,
      range: [190, 1600],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 7 : 5
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 78)
          mark(b, tx, feetY(b), 66, 0xffd08a, 0.55)
          after(b, 0.55 + k * 0.06, () => {
            lob(b, tx, feetY(b) - 10, {
              t: 0.34,
              x: tx,
              y: b.py - 460,
              radius: 9,
              color: 0xffd08a,
              damage: b.damage * 0.7,
            })
            spark(b, tx, b.py - 450, 0xffd08a, 8, 120)
          })
        }
        sfx(b, 'alarm', 0.4, 0.9)
      },
    },
    oj_docking_tether: {
      name: '对接索',
      en: 'DOCKING TETHER',
      wind: 0.5,
      cool: 2.9,
      range: [100, 720],
      exec() {
        const p = b.player
        if (!p) return
        const sign = Math.sign(b.px - p.centerX) || 1
        shot(b, b.px, b.py - b.h * 0.2, p.centerX, p.centerY, 520, {
          radius: 3,
          color: 0xa8c4d8,
          life: 0.35,
          damage: b.damage * 0.3,
        })
        after(b, 0.18, () => {
          pushPlayer(b, sign, 560, 130, 26)
          burst(b, b.px, feetY(b), 120, { color: 0xa8c4d8, damage: b.damage * 0.65 })
        })
        sparkLine(b, b.px, b.py - b.h * 0.2, p.centerX, p.centerY, 0xa8c4d8, 7, 140)
      },
    },
    oj_debris_spread: {
      name: '残骸散射',
      en: 'DEBRIS SPREAD',
      wind: 0.46,
      cool: 2.3,
      range: [0, 480],
      exec() {
        const n = b.phase > 1 ? 18 : 12
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.2
          b._bullet({
            x: b.px,
            y: b.py - b.h * 0.1,
            vx: Math.cos(a) * (240 + (k % 3) * 55),
            vy: Math.sin(a) * 220 - 120,
            gravity: 420,
            radius: 4,
            damage: b.damage * 0.45,
            color: A,
            life: 1.4,
          })
        }
        if (b.phase > 1) {
          after(b, 0.28, () => ring(b, 10, 250, { radius: 3, damage: b.damage * 0.35, color: 0xffd08a }))
        }
        shake(b, 0.3)
      },
    },
    oj_launch_queue: {
      name: '发射序列',
      en: 'LAUNCH QUEUE',
      wind: 0.82,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 120, gap: 52 })
        for (let k = 0; k < 3; k++) {
          mark(b, b.px + (k - 1) * 96, feetY(b), 48, 0xa8c4d8, 0.4 + k * 0.22)
          after(b, 0.4 + k * 0.22, () => {
            ring(b, 6, 220, { radius: 3, damage: b.damage * 0.3, color: 0xa8c4d8 })
            sfx(b, 'alarm', 0.25, 1.5)
          })
        }
      },
    },
  }
}

// ============================================================ 04 聚光塔灵
function bossKit_helios(b) {
  const A = b.accent
  return {
    hc_mirror_focus: {
      name: '镜阵聚焦',
      en: 'MIRROR FOCUS',
      sig: true,
      wind: 0.72,
      cool: 3,
      range: [210, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2
          mark(b, p.centerX + Math.cos(a) * 86, p.centerY + Math.sin(a) * 58, 42, A, 0.5)
        }
        after(b, 0.5, () => {
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2
            shot(b, p.centerX + Math.cos(a) * 86, p.centerY + Math.sin(a) * 58, p.centerX, p.centerY, 620, {
              radius: 3,
              color: 0xffe08a,
              life: 0.8,
              damage: b.damage * 0.5,
            })
          }
          spark(b, p.centerX, p.centerY, 0xffe08a, 20, 300)
          shake(b, 0.35)
        })
      },
    },
    hc_solar_flare: {
      name: '日珥爆发',
      en: 'SOLAR FLARE',
      wind: 0.48,
      cool: 2.5,
      range: [0, 265],
      exec() {
        burst(b, b.px, feetY(b), b.phase > 1 ? 180 : 148, {
          color: 0xffc24a,
          sparks: 24,
          damage: b.damage * 0.9,
        })
        ring(b, b.phase > 1 ? 14 : 9, 330, { radius: 5, damage: b.damage * 0.5, color: 0xffc24a })
        if (b.phase > 1) {
          after(b, 0.32, () => ring(b, 10, 380, { radius: 4, damage: b.damage * 0.4, color: 0xffe08a }))
        }
      },
    },
    hc_photon_lance: {
      name: '光子长矛',
      en: 'PHOTON LANCE',
      wind: 0.55,
      cool: 2.6,
      range: [300, 1600],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, p.centerY, 46, 0xffe08a, 0.36)
        after(b, 0.36, () => {
          for (let k = 0; k < 5; k++) {
            shot(b, b.px, b.py - b.h * 0.2 - 8 + k * 4, p.centerX, p.centerY, 1100, {
              radius: 2.5,
              life: 1,
              damage: b.damage * 0.42,
            })
          }
          if (b.phase > 1) sparkLine(b, b.px, b.py, p.centerX, p.centerY, 0xffe08a, 12, 90)
        })
        spark(b, b.px + b.facing * 24, b.py - b.h * 0.2, 0xffe08a, 10, 160)
        sfx(b, 'alarm', 0.3, 1.7)
      },
    },
    hc_lens_servants: {
      name: '透镜仆从',
      en: 'LENS SERVANTS',
      wind: 0.85,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { first: 1, base: 105, gap: 56 })
        for (const dir of [-1, 1]) {
          mark(b, b.px + dir * 140, feetY(b), 44, 0xffc24a, 0.55)
        }
        after(b, 0.55, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 140, b.py - 80, b.px + dir * 300, b.py, 500, {
              radius: 4,
              color: 0xffc24a,
              life: 1.2,
              damage: b.damage * 0.4,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 05 溃坝巨像
function bossKit_floodColossus(b) {
  const A = b.accent
  return {
    fc_flood_surge: {
      name: '溃坝洪峰',
      en: 'FLOOD SURGE',
      sig: true,
      wind: 0.78,
      cool: 3.2,
      range: [70, 1700],
      exec() {
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 520 : 440, { radius: 18, color: 0x6a9aa8, life: 2.4 })
          if (b.phase > 1) {
            after(b, 0.24, () => groundWave(b, dir, 400, { radius: 13, color: 0x9ac8d0, life: 2.2 }))
          }
        }
        puff(b, 26, 0x6a9aa8, 1.9)
        shake(b, 0.6)
        sfx(b, 'thunder', 0.5, 0.8)
      },
    },
    fc_mud_slam: {
      name: '泥浆重踏',
      en: 'MUD SLAM',
      wind: 0.5,
      cool: 2.5,
      range: [0, 260],
      exec() {
        burst(b, b.px + b.facing * 78, feetY(b), b.phase > 1 ? 160 : 132, {
          color: 0x6a9aa8,
          damage: b.damage * 0.9,
          sparks: 18,
        })
        for (let k = -1; k <= 1; k += 2) {
          b._bullet({
            x: b.px + k * 84,
            y: feetY(b),
            vx: k * 40,
            vy: 0,
            radius: 12,
            damage: b.damage * 0.55,
            color: 0x54707a,
            life: 3.2,
          })
        }
        puff(b, 20, 0x54707a, 1.6)
      },
    },
    fc_boulder_toss: {
      name: '漂石投掷',
      en: 'BOULDER TOSS',
      wind: 0.6,
      cool: 2.8,
      range: [300, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 3 : 2
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, predictX(b, 0.55) + (k - (n - 1) / 2) * 86)
          mark(b, tx, feetY(b), 58, 0x6a9aa8, 0.55)
          after(b, 0.55, () => {
            lob(b, tx, feetY(b) - 12, {
              t: 0.42,
              x: b.px,
              y: b.py - b.h * 0.95,
              radius: 13,
              color: 0x7a8a80,
              damage: b.damage * 0.8,
              life: 2.2,
            })
          })
        }
        sfx(b, 'growl', 0.4, 0.7)
      },
    },
    fc_spill_vortex: {
      name: '泄洪漩涡',
      en: 'SPILLWAY VORTEX',
      wind: 0.8,
      cool: 8,
      range: [0, 9999],
      exec() {
        const p = b.player
        if (!p) return
        const sign = Math.sign(b.px - p.centerX) || 1
        pushPlayer(b, sign, 300, 90, 14)
        for (let k = 0; k < 3; k++) {
          after(b, 0.18 + k * 0.2, () => {
            pushPlayer(b, sign, 260, 70, 10)
            ring(b, 8, 260 + k * 30, { radius: 5, color: 0x6a9aa8, damage: b.damage * 0.3 })
          })
        }
        mark(b, b.px, feetY(b), 230, 0x6a9aa8, 0.9, { pulse: true })
        sfx(b, 'thunder', 0.35, 0.55)
      },
    },
  }
}

// ============================================================ 06 断桥劫掠者
function bossKit_bridgeRaider(b) {
  const A = b.accent
  return {
    br_toll_hook: {
      name: '过路费钩索',
      en: 'TOLL HOOK',
      sig: true,
      wind: 0.55,
      cool: 2.6,
      range: [110, 720],
      exec() {
        const p = b.player
        if (!p) return
        const sign = Math.sign(b.px - p.centerX) || 1
        shot(b, b.px, b.py - b.h * 0.15, p.centerX, p.centerY, 620, {
          radius: 4,
          color: 0xc07038,
          life: 0.4,
          damage: b.damage * 0.35,
        })
        after(b, 0.3, () => {
          pushPlayer(b, sign, 520, 150, 30)
          burst(b, b.px + b.facing * 70, feetY(b), 112, {
            color: 0xc07038,
            damage: b.damage * 0.7,
          })
        })
        sfx(b, 'scan', 0.3, 0.8)
      },
    },
    br_plank_sweep: {
      name: '桥板横扫',
      en: 'PLANK SWEEP',
      wind: 0.44,
      cool: 2.1,
      range: [0, 250],
      exec() {
        fan(b, b.phase > 1 ? 8 : 6, 0.1, 440, {
          radius: 7,
          color: 0xc07038,
          life: 0.9,
          damage: b.damage * 0.62,
          gravity: 120,
        })
        burst(b, b.px + b.facing * 92, feetY(b) - 24, 100, {
          color: 0xc07038,
          damage: b.damage * 0.7,
          sparks: 16,
        })
      },
    },
    br_gap_drop: {
      name: '断口坠落',
      en: 'GAP DROP',
      wind: 0.66,
      cool: 2.9,
      range: [250, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 86)
          mark(b, tx, feetY(b), 52, 0x8a5a38, 0.42 + k * 0.16)
          after(b, 0.42 + k * 0.16, () => {
            burst(b, tx, feetY(b), 58, { color: 0x8a5a38, sparks: 8, shake: 0.25, damage: b.damage * 0.55 })
          })
        }
        sfx(b, 'thunder', 0.3, 1.4)
      },
    },
    br_raider_camp: {
      name: '劫掠营地',
      en: 'RAIDER CAMP',
      wind: 0.85,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 110, gap: 58 })
        for (let k = 0; k < 2; k++) {
          after(b, 0.35 + k * 0.3, () => {
            for (const dir of [-1, 1]) {
              shot(b, b.px + dir * 260, b.py - 60, b.px, b.py, 380, {
                radius: 4,
                color: 0xff8a4a,
                life: 1.5,
                damage: b.damage * 0.35,
                gravity: 180,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 07 公路暴走王
function bossKit_highwayKing(b) {
  const A = b.accent
  return {
    hk_road_rush: {
      name: '暴走冲刺',
      en: 'ROAD RUSH',
      sig: true,
      wind: 0.42,
      cool: 3,
      range: [220, 1600],
      exec() {
        chargeAt(b, { hold: 0.72, boost: 3.4 })
        for (let k = 1; k <= 3; k++) {
          after(b, k * 0.16, () => {
            mark(b, b.px - b.facing * (k * 46), feetY(b), 56, A, 1.1, { pulse: false })
            b._bullet({
              x: b.px - b.facing * (k * 46),
              y: feetY(b),
              vx: 0,
              vy: 0,
              radius: 10,
              damage: b.damage * 0.45,
              color: A,
              life: 3.4,
            })
          })
        }
        sfx(b, 'growl', 0.6, 1.2)
      },
    },
    hk_exhaust_jet: {
      name: '尾焰喷射',
      en: 'EXHAUST JET',
      wind: 0.38,
      cool: 1.9,
      range: [0, 255],
      exec() {
        fan(b, b.phase > 1 ? 9 : 7, 0.12, 470, {
          radius: 5,
          color: 0xff5644,
          life: 0.72,
          damage: b.damage * 0.6,
        })
        puff(b, 18, 0xff8a3c, 1.4)
        spark(b, b.px - b.facing * 10, b.py - b.h * 0.18, 0xff8a3c, 16, 260)
        if (b.phase > 1) after(b, 0.22, () => fan(b, 5, 0.16, 430, { radius: 3, color: 0xffb060, damage: b.damage * 0.3 }))
      },
    },
    hk_cone_barrage: {
      name: '路障弹幕',
      en: 'CONE BARRAGE',
      wind: 0.58,
      cool: 2.7,
      range: [280, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 7 : 5
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 68)
          after(b, 0.18 + k * 0.05, () => {
            lob(b, tx, feetY(b) - 6, {
              t: 0.62,
              radius: 6,
              color: 0xff5644,
              damage: b.damage * 0.55,
            })
            mark(b, tx, feetY(b), 40, 0xff5644, 0.62)
          })
        }
        sfx(b, 'alarm', 0.35, 1.3)
      },
    },
    hk_pit_crew: {
      name: '维修班组',
      en: 'PIT CREW',
      wind: 0.86,
      cool: 9,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 52 })
        for (const dir of [-1, 1]) {
          mark(b, b.px + dir * 150, feetY(b), 46, A, 0.5)
        }
        after(b, 0.5, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 150, b.py - 50, b.px + dir * 360, b.py, 460, {
              radius: 4,
              color: 0xff5644,
              life: 1.2,
              damage: b.damage * 0.4,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 08 顶层男爵
function bossKit_skylineBaron(b) {
  const A = b.accent
  return {
    sb_chandelier: {
      name: '吊灯钟摆',
      en: 'CHANDELIER SWING',
      sig: true,
      wind: 0.6,
      cool: 2.7,
      range: [0, 300],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 78, 0xd8c070, 0.55)
        after(b, 0.55, () => {
          lob(b, p.centerX, feetY(b) - 10, {
            t: 0.34,
            x: p.centerX + (b.facing > 0 ? -90 : 90),
            y: b.py - 430,
            radius: 11,
            color: 0xd8c070,
            damage: b.damage * 0.75,
          })
          burst(b, p.centerX, feetY(b), 88, { color: 0xd8c070, sparks: 14, damage: b.damage * 0.5 })
          if (b.phase > 1) ring(b, 8, 270, { radius: 3, color: 0xffe8a0, damage: b.damage * 0.3 })
        })
        sfx(b, 'alarm', 0.35, 0.9)
      },
    },
    sb_beam_drop: {
      name: '钢梁坠落',
      en: 'STEEL BEAM DROP',
      wind: 0.56,
      cool: 2.6,
      range: [280, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 5 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 92)
          mark(b, tx, feetY(b), 34, A, 0.5)
          after(b, 0.5 + k * 0.05, () => {
            b._bullet({
              x: tx,
              y: b.py - 400,
              vx: 0,
              vy: 820,
              gravity: 260,
              radius: 7,
              color: A,
              damage: b.damage * 0.7,
              life: 1.2,
            })
          })
        }
        sfx(b, 'scan', 0.35, 1)
      },
    },
    sb_carpet_charge: {
      name: '地毯冲锋',
      en: 'CARPET CHARGE',
      wind: 0.4,
      cool: 2.9,
      range: [180, 1400],
      exec() {
        chargeAt(b, { hold: 0.66, boost: 3.1 })
        for (let k = 1; k <= 2; k++) {
          after(b, k * 0.2, () => {
            mark(b, b.px - b.facing * k * 60, feetY(b), 50, 0xd8c070, 0.9, { pulse: false })
            puff(b, 6, 0xd8c070, 1)
          })
        }
        sfx(b, 'growl', 0.5, 1.1)
      },
    },
    sb_roof_guard: {
      name: '顶楼守卫',
      en: 'ROOF GUARD',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 105, gap: 50 })
        for (const dir of [-1, 1]) {
          mark(b, b.px + dir * 130, b.py - 240, 42, A, 0.5)
        }
        after(b, 0.5, () => {
          for (const dir of [-1, 1]) {
            for (let k = 0; k < 3; k++) {
              shot(b, b.px + dir * 130, b.py - 240, b.px + dir * 30 + k * 20, b.py, 560, {
                radius: 3,
                color: A,
                life: 1.3,
                damage: b.damage * 0.35,
              })
            }
          }
        })
      },
    },
  }
}

// ============================================================ 09 角斗场卫冕者
function bossKit_arenaChampion(b) {
  const A = b.accent
  return {
    ac_bell_round: {
      name: '开赛铃',
      en: 'OPENING BELL',
      sig: true,
      wind: 0.58,
      cool: 2.8,
      range: [0, 320],
      exec() {
        burst(b, b.px, feetY(b), b.phase > 1 ? 170 : 140, {
          color: 0xff7a4a,
          sparks: 22,
          damage: b.damage * 0.85,
        })
        ring(b, b.phase > 1 ? 16 : 12, 300, { radius: 5, color: 0xff7a4a, damage: b.damage * 0.5 })
        if (b.phase > 1) after(b, 0.35, () => ring(b, 12, 360, { radius: 4, color: 0xffb060, damage: b.damage * 0.4 }))
        sfx(b, 'thunder', 0.5, 1.2)
      },
    },
    ac_rope_rebound: {
      name: '围绳反弹',
      en: 'ROPE REBOUND',
      wind: 0.46,
      cool: 2.4,
      range: [200, 900],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        const y = p.centerY - 26
        for (const from of [60, w - 60]) {
          shot(b, from, y, p.centerX, p.centerY, 520, {
            radius: 5,
            color: 0xff7a4a,
            life: 1.6,
            damage: b.damage * 0.6,
          })
          if (b.phase > 1) {
            shot(b, from, y - 48, p.centerX, p.centerY, 480, {
              radius: 4,
              color: 0xffb060,
              life: 1.6,
              damage: b.damage * 0.4,
            })
          }
        }
        sfx(b, 'alarm', 0.35, 1.2)
      },
    },
    ac_crowd_roar: {
      name: '看台咆哮',
      en: 'CROWD ROAR',
      wind: 0.5,
      cool: 2.6,
      range: [280, 1500],
      exec() {
        fan(b, b.phase > 1 ? 11 : 8, 0.16, 470, {
          radius: 6,
          color: 0xff7a4a,
          damage: b.damage * 0.6,
          life: 1.7,
        })
        shake(b, 0.55)
        puff(b, 24, 0x7a4a3a, 1.5)
        sfx(b, 'growl', 0.5, 0.7)
      },
    },
    ac_contender: {
      name: '挑战者入场',
      en: 'CONTENDER ENTRY',
      wind: 0.84,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 3 : 2, { base: 120, gap: 62 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px, feetY(b), 60 + k * 40, 0xff7a4a, 0.45 + k * 0.25)
          after(b, 0.45 + k * 0.25, () => {
            ring(b, 8, 240, { radius: 4, color: 0xffb060, damage: b.damage * 0.35 })
          })
        }
      },
    },
  }
}

// ============================================================ 10 战地拾荒王
function bossKit_scrapWarlord(b) {
  const A = b.accent
  return {
    sw_salvage_turrets: {
      name: '拆机炮塔阵',
      en: 'SALVAGE TURRETS',
      sig: true,
      wind: 0.66,
      cool: 3,
      range: [170, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 5 : 4
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.4
          const tx = clampW(b, p.centerX + Math.cos(a) * 150)
          const ty = p.centerY + Math.sin(a) * 30
          mark(b, tx, b._feetY() - 6, 40, A, 0.45)
          after(b, 0.45 + k * 0.08, () => {
            shot(b, tx, ty, p.centerX, p.centerY, 640, {
              radius: 4,
              color: 0xa8763a,
              life: 1,
              damage: b.damage * 0.55,
            })
            if (b.phase > 1) {
              shot(b, tx, ty, p.centerX + 24, p.centerY, 580, {
                radius: 3,
                color: 0xd8a060,
                life: 1,
                damage: b.damage * 0.35,
              })
            }
          })
        }
        sfx(b, 'radio', 0.35, 0.9)
      },
    },
    sw_scrap_shotgun: {
      name: '废铁霰弹',
      en: 'SCRAP SHOTGUN',
      wind: 0.36,
      cool: 2,
      range: [0, 260],
      exec() {
        fan(b, b.phase > 1 ? 11 : 8, 0.15, 420, {
          radius: 4,
          color: 0xa8763a,
          life: 0.68,
          damage: b.damage * 0.55,
          gravity: 180,
        })
        spark(b, b.px + b.facing * 30, b.py - b.h * 0.16, 0xd8a060, 16, 300)
        sfx(b, 'thunder', 0.35, 1.5)
      },
    },
    sw_magnet_yank: {
      name: '磁力拖拽',
      en: 'MAGNET YANK',
      wind: 0.44,
      cool: 2.7,
      range: [110, 740],
      exec() {
        const p = b.player
        if (!p) return
        const sign = Math.sign(b.px - p.centerX) || 1
        pushPlayer(b, sign, 520, 140, 26)
        for (let k = 0; k < (b.phase > 1 ? 8 : 5); k++) {
          const a = -Math.PI / 2 + (k - 2) * 0.3
          b._bullet({
            x: p.centerX + (k - 2) * 24,
            y: feetY(b),
            vx: Math.cos(a) * 160,
            vy: Math.sin(a) * 320 - 90,
            gravity: 480,
            radius: 4,
            color: A,
            damage: b.damage * 0.4,
            life: 1.3,
          })
        }
        spark(b, p.centerX, p.centerY, A, 16, 220)
        sfx(b, 'scan', 0.3, 0.7)
      },
    },
    sw_salvage_call: {
      name: '拾荒集结',
      en: 'SALVAGE CALL',
      wind: 0.85,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 56 })
        for (let k = 0; k < 3; k++) {
          const tx = b.px + (k - 1) * 120
          mark(b, tx, feetY(b), 44, 0xa8763a, 0.4 + k * 0.18)
          after(b, 0.4 + k * 0.18, () => {
            puff(b, 10, 0xa8763a, 1.2)
            spark(b, tx, feetY(b), 0xd8a060, 12, 160)
          })
        }
      },
    },
  }
}

// ============================================================ 11 失控护理机
function bossKit_caregiver(b) {
  const A = b.accent
  return {
    cg_forced_care: {
      name: '强制护理',
      en: 'FORCED CARE',
      sig: true,
      wind: 0.56,
      cool: 2.8,
      range: [0, 245],
      exec() {
        const p = b.player
        if (!p) return
        const sign = Math.sign(b.px - p.centerX) || 1
        mark(b, p.centerX, feetY(b), 72, 0xd8e08a, 0.45)
        after(b, 0.45, () => {
          pushPlayer(b, sign, 560, 160, 30)
          burst(b, b.px, feetY(b), 130, { color: 0xd8e08a, damage: b.damage * 0.6, sparks: 14 })
        })
        for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
          after(b, 0.72 + k * 0.32, () => {
            b._bullet({
              x: b.px + b.facing * 60,
              y: b.py - b.h * 0.3,
              vx: b.facing * 260,
              vy: -120,
              gravity: 420,
              radius: 5,
              color: 0xd8e08a,
              damage: b.damage * 0.3,
              life: 1,
            })
          })
        }
        sfx(b, 'scan', 0.4, 0.8)
      },
    },
    cg_syringe_volley: {
      name: '注射齐射',
      en: 'SYRINGE VOLLEY',
      wind: 0.42,
      cool: 2.2,
      range: [280, 1500],
      exec() {
        fan(b, b.phase > 1 ? 9 : 7, 0.1, 720, {
          radius: 2.5,
          color: 0xd8e08a,
          life: 1.2,
          damage: b.damage * 0.45,
        })
        spark(b, b.px + b.facing * 22, b.py - b.h * 0.2, 0xd8e08a, 10, 180)
        sfx(b, 'alarm', 0.3, 1.8)
      },
    },
    cg_wheelchair_ram: {
      name: '轮椅冲撞',
      en: 'WHEELCHAIR RAM',
      wind: 0.4,
      cool: 2.9,
      range: [180, 1400],
      exec() {
        chargeAt(b, { hold: 0.62, boost: 3 })
        for (let k = 1; k <= 2; k++) {
          after(b, k * 0.18, () => {
            mark(b, b.px - b.facing * k * 52, feetY(b), 48, 0xd8e08a, 0.8, { pulse: false })
            b._bullet({
              x: b.px - b.facing * k * 52,
              y: feetY(b),
              vx: 0,
              vy: 0,
              radius: 8,
              color: 0xd8e08a,
              damage: b.damage * 0.35,
              life: 2.8,
            })
          })
        }
        sfx(b, 'growl', 0.45, 1.3)
      },
    },
    cg_ward_call: {
      name: '病房增援',
      en: 'WARD REINFORCEMENT',
      wind: 0.84,
      cool: 9,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 105, gap: 54 })
        for (let k = 0; k < 2; k++) {
          after(b, 0.35 + k * 0.25, () => {
            for (const dir of [-1, 1]) {
              shot(b, b.px + dir * 120, b.py - 60, b.px + dir * 300, b.py, 420, {
                radius: 3,
                color: 0xd8e08a,
                life: 1.2,
                damage: b.damage * 0.32,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 12 集结号
function bossKit_rallyBoss(b) {
  const A = b.accent
  return {
    rb_horn_call: {
      name: '集结号角',
      en: 'HORN CALL',
      sig: true,
      wind: 0.8,
      cool: 9,
      range: [0, 9999],
      exec() {
        for (let k = 0; k < 3; k++) {
          after(b, k * 0.28, () => {
            summonWave(b, 1, { base: 90 + k * 40 })
            ring(b, 7, 220, { radius: 4, color: 0x8fc4ff, damage: b.damage * 0.3 })
            sfx(b, 'radio', 0.4, 0.9)
          })
        }
        mark(b, b.px, feetY(b), 110, 0x8fc4ff, 0.9)
      },
    },
    rb_formation_fire: {
      name: '方阵齐射',
      en: 'FORMATION FIRE',
      wind: 0.5,
      cool: 2.6,
      range: [300, 1500],
      exec() {
        const rows = b.phase > 1 ? 3 : 2
        for (let r = 0; r < rows; r++) {
          for (let k = 0; k < 4; k++) {
            const sx = b.px - b.facing * 40
            shot(b, sx, b.py - b.h * 0.3 - r * 30, b.px + b.facing * 900, b.py - r * 18 + (k - 1.5) * 8, 520, {
              radius: 4,
              color: 0x8fc4ff,
              life: 1.8,
              damage: b.damage * 0.4,
            })
          }
        }
        sfx(b, 'alarm', 0.35, 1.2)
      },
    },
    rb_rally_charge: {
      name: '号令冲锋',
      en: 'RALLY CHARGE',
      wind: 0.4,
      cool: 2.9,
      range: [180, 1400],
      exec() {
        chargeAt(b, { hold: 0.7, boost: 3.2 })
        ring(b, b.phase > 1 ? 10 : 6, 260, { radius: 3, color: 0x8fc4ff, damage: b.damage * 0.3 })
        mark(b, b.px, feetY(b), 70, A, 0.7)
      },
    },
    rb_drum_shock: {
      name: '战鼓震地',
      en: 'WAR DRUM',
      wind: 0.5,
      cool: 2.5,
      range: [0, 280],
      exec() {
        burst(b, b.px, feetY(b), b.phase > 1 ? 165 : 135, {
          color: A,
          sparks: 16,
          damage: b.damage * 0.8,
        })
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 470 : 400, { radius: 11, color: 0x8fc4ff, life: 1.8 })
        }
        sfx(b, 'thunder', 0.45, 1.1)
      },
    },
  }
}

// ============================================================ 13 风暴收割者
function bossKit_stormReaper(b) {
  const A = b.accent
  return {
    sr_barn_tornado: {
      name: '谷仓旋风',
      en: 'BARN TORNADO',
      sig: true,
      wind: 0.72,
      cool: 3,
      range: [160, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const waves = b.phase > 1 ? 5 : 4
        for (let w = 0; w < waves; w++) {
          after(b, 0.12 + w * 0.16, () => {
            const off = w * 0.55
            for (let k = 0; k < 9; k++) {
              const a = (k / 9) * Math.PI * 2 + off
              b._bullet({
                x: p.centerX,
                y: p.centerY - 30,
                vx: Math.cos(a) * (200 + w * 30),
                vy: Math.sin(a) * 150 - 120,
                gravity: 340,
                radius: 5,
                color: 0x9ab84a,
                damage: b.damage * 0.28,
                life: 1.4,
              })
            }
            puff(b, 10, 0x9ab84a, 1.2)
          })
        }
        sfx(b, 'growl', 0.5, 0.8)
      },
    },
    sr_sheet_slash: {
      name: '铁皮斩',
      en: 'SHEET SLASH',
      wind: 0.42,
      cool: 2.2,
      range: [0, 255],
      exec() {
        for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
          after(b, k * 0.18, () => {
            const x = b.px + b.facing * (70 + k * 34)
            burst(b, x, feetY(b) - 30, 80, {
              color: 0x9ab84a,
              sparks: 12,
              shake: 0.25,
              damage: b.damage * 0.5,
            })
            sparkLine(b, b.px, b.py - b.h * 0.2, x, feetY(b) - 30, 0xd8e08a, 5, 160)
          })
        }
        sfx(b, 'growl', 0.4, 1.2)
      },
    },
    sr_lightning_rod: {
      name: '引雷杆',
      en: 'LIGHTNING ROD',
      wind: 0.58,
      cool: 2.7,
      range: [250, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 76)
          mark(b, tx, feetY(b), 30, 0xd8e08a, 0.45)
          after(b, 0.45 + k * 0.04, () => {
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x: tx,
                y: b.py - 380,
                vx: (j - 1) * 20,
                vy: 900,
                radius: 4,
                color: 0xd8e08a,
                damage: b.damage * 0.38,
                life: 1.1,
              })
            }
            spark(b, tx, feetY(b), 0xd8e08a, 12, 180)
            shake(b, 0.25)
          })
        }
        sfx(b, 'thunder', 0.35, 1.4)
      },
    },
    sr_storm_herd: {
      name: '风暴兽群',
      en: 'STORM HERD',
      wind: 0.84,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 110, gap: 56 })
        const p = b.player
        if (!p) return
        const sign = Math.sign(b.px - p.centerX) || 1
        pushPlayer(b, sign, 260, 90, 12)
        for (const dir of [-1, 1]) {
          shot(b, b.px + dir * 200, b.py - 50, b.px, b.py, 400, {
            radius: 4,
            color: 0x9ab84a,
            life: 1.5,
            damage: b.damage * 0.3,
            gravity: 200,
          })
        }
      },
    },
  }
}

// ============================================================ 14 酸沼母体
function bossKit_acidMother(b) {
  const A = b.accent
  return {
    am_acid_tide: {
      name: '酸液涨潮',
      en: 'ACID TIDE',
      sig: true,
      wind: 0.76,
      cool: 3.1,
      range: [90, 1400],
      exec() {
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 460 : 390, { radius: 16, color: 0xc6e05a, life: 2.3 })
        }
        const p = b.player
        if (p) {
          for (let k = -1; k <= 1; k++) {
            const tx = clampW(b, p.centerX + k * 84)
            mark(b, tx, feetY(b), 54, 0xc6e05a, 0.65)
            after(b, 0.65, () => {
              b._bullet({
                x: tx,
                y: feetY(b),
                vx: 0,
                vy: 0,
                radius: 16,
                color: 0xc6e05a,
                damage: b.damage * 0.45,
                life: 4.5,
              })
            })
          }
        }
        if (b.phase > 1) puff(b, 30, 0xc6e05a, 2)
        sfx(b, 'thunder', 0.35, 0.8)
      },
    },
    am_corrosive_spit: {
      name: '腐蚀喷吐',
      en: 'CORROSIVE SPIT',
      wind: 0.52,
      cool: 2.5,
      range: [280, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 72)
          mark(b, tx, feetY(b), 40, 0xc6e05a, 0.62)
          after(b, 0.1 + k * 0.08, () => {
            lob(b, tx, feetY(b), {
              t: 0.54,
              radius: 7,
              color: 0xc6e05a,
              damage: b.damage * 0.52,
            })
          })
        }
        sfx(b, 'scan', 0.35, 0.9)
      },
    },
    am_body_crush: {
      name: '母体碾压',
      en: 'BODY CRUSH',
      wind: 0.46,
      cool: 2.4,
      range: [0, 265],
      exec() {
        burst(b, b.px + b.facing * 84, feetY(b), b.phase > 1 ? 175 : 145, {
          color: 0xc6e05a,
          sparks: 20,
          damage: b.damage * 0.9,
        })
        for (let k = 0; k < (b.phase > 1 ? 10 : 6); k++) {
          const a = (k / 8) * Math.PI * 2
          b._bullet({
            x: b.px,
            y: feetY(b),
            vx: Math.cos(a) * 300,
            vy: Math.sin(a) * 220 - 80,
            gravity: 360,
            radius: 6,
            color: 0x8a9a3a,
            damage: b.damage * 0.4,
            life: 1.3,
          })
        }
        sfx(b, 'growl', 0.45, 0.7)
      },
    },
    am_spawn_pods: {
      name: '育囊孵化',
      en: 'SPAWN PODS',
      wind: 0.85,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 58 })
        for (let k = 0; k < (b.phase > 1 ? 3 : 2); k++) {
          const tx = b.px + (k - 1) * 130
          mark(b, tx, feetY(b), 62, 0xc6e05a, 0.6)
          after(b, 0.6, () => {
            puff(b, 14, 0xc6e05a, 1.5)
            ring(b, 7, 210, { x: tx, y: feetY(b), radius: 4, color: 0xc6e05a, damage: b.damage * 0.3 })
          })
        }
      },
    },
  }
}

// ============================================================ 15 腐殖女王
function bossKit_rotQueen(b) {
  const A = b.accent
  return {
    rq_vine_throne: {
      name: '藤蔓王座',
      en: 'VINE THRONE',
      sig: true,
      wind: 0.68,
      cool: 3,
      range: [160, 950],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 88)
          mark(b, tx, feetY(b), 52, 0x6b8a3a, 0.6)
          after(b, 0.6 + k * 0.05, () => {
            burst(b, tx, feetY(b) - 20, 72, { color: 0x6b8a3a, sparks: 10, shake: 0.3, damage: b.damage * 0.55 })
            if (k % 2 === 0) pushPlayer(b, Math.sign(b.px - tx) || 1, 260, 80, 10)
          })
        }
        sfx(b, 'growl', 0.45, 0.8)
      },
    },
    rq_spore_bloom: {
      name: '孢子绽放',
      en: 'SPORE BLOOM',
      wind: 0.5,
      cool: 2.5,
      range: [0, 310],
      exec() {
        const n = b.phase > 1 ? 14 : 10
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2
          b._bullet({
            x: b.px,
            y: b.py - b.h * 0.2,
            vx: Math.cos(a) * 190,
            vy: Math.sin(a) * 150 - 50,
            gravity: 60,
            radius: 9,
            color: 0x8aa04a,
            damage: b.damage * 0.4,
            life: 2.6,
          })
        }
        puff(b, 24, 0x6b8a3a, 1.8)
        sfx(b, 'scan', 0.35, 0.7)
      },
    },
    rq_thorn_whip: {
      name: '荆棘鞭',
      en: 'THORN WHIP',
      wind: 0.4,
      cool: 2.2,
      range: [280, 1400],
      exec() {
        fan(b, b.phase > 1 ? 10 : 7, 0.1, 640, {
          radius: 3.5,
          color: 0x8aa04a,
          life: 1.2,
          damage: b.damage * 0.5,
        })
        if (b.phase > 1) after(b, 0.2, () => fan(b, 6, 0.16, 560, { radius: 3, color: 0x6b8a3a, damage: b.damage * 0.3 }))
        spark(b, b.px + b.facing * 26, b.py - b.h * 0.18, 0x8aa04a, 12, 240)
      },
    },
    rq_brood_call: {
      name: '虫群呼唤',
      en: 'BROOD CALL',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 54 })
        for (let k = 0; k < 3; k++) {
          mark(b, b.px + (k - 1) * 110, feetY(b), 44, 0x6b8a3a, 0.5 + k * 0.18)
          after(b, 0.5 + k * 0.18, () => puff(b, 12, 0x6b8a3a, 1.3))
        }
        sfx(b, 'radio', 0.35, 1.1)
      },
    },
  }
}

// ============================================================ 16 断钟主教
function bossKit_bellBishop(b) {
  const A = b.accent
  return {
    bb_broken_bell: {
      name: '断钟回响',
      en: 'BROKEN BELL',
      sig: true,
      wind: 0.7,
      cool: 2.9,
      range: [100, 1300],
      exec() {
        for (let k = 0; k < 3; k++) {
          after(b, k * 0.3, () => {
            ring(b, b.phase > 1 ? 16 : 12, 260 + k * 60, {
              radius: 5,
              color: 0xf2b34a,
              damage: b.damage * (0.35 + k * 0.08),
            })
            spark(b, b.px, b.py, 0xf2b34a, 10, 240)
            sfx(b, 'thunder', 0.4, 1.1)
          })
        }
        mark(b, b.px, feetY(b), 130, 0xf2b34a, 0.9)
      },
    },
    bb_censer_swing: {
      name: '香炉摆荡',
      en: 'CENSER SWING',
      wind: 0.5,
      cool: 2.3,
      range: [0, 420],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 3 : 2); k++) {
          const dir = k % 2 ? 1 : -1
          mark(b, p.centerX + dir * 60, feetY(b), 62, 0xf2b34a, 0.5)
          after(b, 0.5 + k * 0.12, () => {
            lob(b, p.centerX + dir * 60, feetY(b) - 8, {
              t: 0.32,
              x: b.px + dir * 120,
              y: b.py - b.h * 0.8,
              radius: 8,
              color: 0xf2b34a,
              damage: b.damage * 0.6,
            })
            spark(b, p.centerX + dir * 60, feetY(b) - 20, 0xf2b34a, 10, 160)
          })
        }
      },
    },
    bb_sermon_bolt: {
      name: '布道电矢',
      en: 'SERMON BOLT',
      wind: 0.42,
      cool: 2.2,
      range: [300, 1500],
      exec() {
        fan(b, b.phase > 1 ? 9 : 7, 0.09, 700, {
          radius: 3,
          color: 0xf2b34a,
          life: 1.3,
          damage: b.damage * 0.48,
        })
        spark(b, b.px + b.facing * 20, b.py - b.h * 0.2, 0xf2b34a, 12, 200)
        sfx(b, 'alarm', 0.35, 1.4)
      },
    },
    bb_congregation: {
      name: '信徒集会',
      en: 'CONGREGATION',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 104, gap: 52 })
        for (const dir of [-1, 1]) {
          mark(b, b.px + dir * 130, feetY(b), 50, 0xf2b34a, 0.55)
        }
        after(b, 0.55, () => {
          for (const dir of [-1, 1]) {
            ring(b, 6, 200, { x: b.px + dir * 130, y: feetY(b), radius: 3, color: 0xf2b34a, damage: b.damage * 0.3 })
          }
        })
      },
    },
  }
}

// ============================================================ 17 初代核心
function bossKit_primeCore(b) {
  const A = b.accent
  return {
    pc_protocol_zero: {
      name: '零号协议',
      en: 'PROTOCOL ZERO',
      sig: true,
      wind: 0.7,
      cool: 3.2,
      range: [200, 1600],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < 4; k++) {
          const tx = clampW(b, p.centerX + (k - 1.5) * 56)
          mark(b, tx, feetY(b), 38, 0x6ff0d0, 0.4 + k * 0.14)
          after(b, 0.4 + k * 0.14, () => {
            for (let j = 0; j < 3; j++) {
              shot(b, b.px, b.py - b.h * 0.2, tx, p.centerY + (j - 1) * 26, 820, {
                radius: 4,
                color: 0x6ff0d0,
                life: 1.1,
                damage: b.damage * 0.45,
              })
            }
            spark(b, tx, p.centerY, 0x6ff0d0, 10, 200)
          })
        }
        if (b.phase > 1) after(b, 0.9, () => ring(b, 12, 300, { radius: 3, color: A, damage: b.damage * 0.3 }))
        sfx(b, 'alarm', 0.4, 0.9)
      },
    },
    pc_logic_bomb: {
      name: '逻辑炸弹',
      en: 'LOGIC BOMB',
      wind: 0.46,
      cool: 2.4,
      range: [0, 300],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 90, 0x6ff0d0, 0.55)
        after(b, 0.55, () => {
          burst(b, p.centerX, feetY(b), 100, { color: 0x6ff0d0, sparks: 18, damage: b.damage * 0.8 })
          ring(b, b.phase > 1 ? 12 : 8, 280, { x: p.centerX, y: b.py - 20, radius: 4, color: 0x6ff0d0, damage: b.damage * 0.35 })
        })
        sfx(b, 'scan', 0.35, 0.8)
      },
    },
    pc_prime_wave: {
      name: '初代波',
      en: 'PRIME WAVE',
      wind: 0.5,
      cool: 2.5,
      range: [120, 900],
      exec() {
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 480 : 410, { radius: 13, color: 0x6ff0d0, life: 2 })
        }
        if (b.phase > 1) {
          after(b, 0.28, () => ring(b, 10, 320, { radius: 4, color: 0x8fe8ff, damage: b.damage * 0.3 }))
        }
        spark(b, b.px, feetY(b), 0x6ff0d0, 16, 280)
        sfx(b, 'thunder', 0.35, 1.2)
      },
    },
    pc_fork_process: {
      name: '分裂进程',
      en: 'FORK PROCESS',
      wind: 0.88,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 5 : 3, { base: 110, gap: 46 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px + (k ? 1 : -1) * 130, feetY(b), 48, A, 0.5)
        }
        after(b, 0.5, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 130, b.py - 40, b.px + dir * 340, b.py, 440, {
              radius: 3,
              color: 0x6ff0d0,
              life: 1.3,
              damage: b.damage * 0.35,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 18 零号病株
function bossKit_zeroStrain(b) {
  const A = b.accent
  return {
    zs_infection_cloud: {
      name: '感染云',
      en: 'INFECTION CLOUD',
      sig: true,
      wind: 0.72,
      cool: 3,
      range: [180, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 76)
          mark(b, tx, feetY(b), 48, 0x9ab84a, 0.6)
          after(b, 0.6, () => {
            b._bullet({
              x: tx,
              y: feetY(b),
              vx: 0,
              vy: 0,
              radius: 18,
              color: 0x9ab84a,
              damage: b.damage * 0.4,
              life: 3.6,
            })
          })
        }
        puff(b, 22, 0x9ab84a, 1.6)
        sfx(b, 'scan', 0.35, 0.75)
      },
    },
    zs_mutation_burst: {
      name: '突变爆发',
      en: 'MUTATION BURST',
      wind: 0.44,
      cool: 2.4,
      range: [0, 265],
      exec() {
        ring(b, b.phase > 1 ? 18 : 13, 330, { radius: 5, color: 0x9ab84a, damage: b.damage * 0.55 })
        burst(b, b.px, feetY(b), b.phase > 1 ? 160 : 130, { color: 0x9ab84a, sparks: 18, damage: b.damage * 0.6 })
        if (b.phase > 1) after(b, 0.3, () => ring(b, 12, 380, { radius: 4, color: 0x6b8a3a, damage: b.damage * 0.35 }))
      },
    },
    zs_airborne_virus: {
      name: '空气传播',
      en: 'AIRBORNE VIRUS',
      wind: 0.55,
      cool: 2.6,
      range: [300, 1500],
      exec() {
        fan(b, b.phase > 1 ? 10 : 7, 0.11, 520, {
          radius: 6,
          color: 0x9ab84a,
          life: 1.6,
          damage: b.damage * 0.45,
          gravity: 160,
        })
        puff(b, 18, 0x6b8a3a, 1.5)
        sfx(b, 'alarm', 0.3, 1.2)
      },
    },
    zs_host_call: {
      name: '宿主召唤',
      en: 'HOST CALL',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 5 : 3, { base: 100, gap: 52 })
        for (let k = 0; k < 2; k++) {
          after(b, 0.35 + k * 0.25, () => {
            for (const dir of [-1, 1]) {
              shot(b, b.px + dir * 110, b.py - 60, b.px + dir * 280, b.py, 400, {
                radius: 5,
                color: 0x9ab84a,
                life: 1.4,
                damage: b.damage * 0.3,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 19 原型心智
function bossKit_protoMind(b) {
  const A = b.accent
  return {
    pm_predictive_shot: {
      name: '预判射击',
      en: 'PREDICTIVE SHOT',
      sig: true,
      wind: 0.6,
      cool: 2.8,
      range: [250, 1500],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < 3; k++) {
          const tx = clampW(b, predictX(b, 0.45 + k * 0.12))
          mark(b, tx, p.centerY, 34, 0x8fe8ff, 0.45)
          after(b, 0.45, () => {
            for (let j = 0; j < 2; j++) {
              shot(b, b.px, b.py - b.h * 0.2, tx + (j ? 26 : -26), p.centerY, 880, {
                radius: 3,
                color: 0x8fe8ff,
                life: 1.1,
                damage: b.damage * 0.4,
              })
            }
          })
        }
        if (b.phase > 1) after(b, 0.75, () => fan(b, 5, 0.1, 720, { radius: 3, color: 0x8fe8ff, damage: b.damage * 0.3 }))
        sfx(b, 'scan', 0.3, 1.3)
      },
    },
    pm_mind_probe: {
      name: '心智探针',
      en: 'MIND PROBE',
      wind: 0.48,
      cool: 2.4,
      range: [0, 260],
      exec() {
        const p = b.player
        if (!p) return
        const sy = b.py - b.h * 0.22
        sparkLine(b, b.px, sy, p.centerX, p.centerY, 0x8fe8ff, 10, 110)
        shot(b, b.px, sy, p.centerX, p.centerY, 1000, {
          radius: 6,
          color: 0x8fe8ff,
          life: 0.6,
          damage: b.damage * 0.5,
        })
        after(b, 0.12, () => {
          burst(b, p.centerX, p.centerY, 86, { color: 0x8fe8ff, sparks: 14, damage: b.damage * 0.6 })
        })
        sfx(b, 'alarm', 0.35, 1.6)
      },
    },
    pm_feedback_loop: {
      name: '反馈回路',
      en: 'FEEDBACK LOOP',
      wind: 0.5,
      cool: 2.5,
      range: [120, 820],
      exec() {
        ring(b, 8, 300, { radius: 4, color: 0x8fe8ff, damage: b.damage * 0.35 })
        after(b, 0.26, () => ring(b, 8, 300, { radius: 4, color: 0x5ac8e8, offset: Math.PI / 8, damage: b.damage * 0.35 }))
        if (b.phase > 1) after(b, 0.52, () => ring(b, 10, 340, { radius: 3, color: 0x8fe8ff, damage: b.damage * 0.25 }))
        spark(b, b.px, b.py, 0x8fe8ff, 14, 260)
      },
    },
    pm_servitor: {
      name: '原型仆从',
      en: 'PROTOTYPE SERVITOR',
      wind: 0.84,
      cool: 9,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 105, gap: 52 })
        for (const dir of [-1, 1]) {
          mark(b, b.px + dir * 120, feetY(b), 44, 0x8fe8ff, 0.55)
        }
        after(b, 0.55, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 120, b.py - 50, b.px + dir * 320, b.py, 460, {
              radius: 3,
              color: 0x8fe8ff,
              life: 1.2,
              damage: b.damage * 0.32,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 20 观测体
function bossKit_observer(b) {
  const A = b.accent
  return {
    ob_abduction_beam: {
      name: '采样光束',
      en: 'ABDUCTION BEAM',
      sig: true,
      wind: 0.66,
      cool: 3,
      range: [100, 950],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 82, 0x8fc4ff, 0.6)
        after(b, 0.6, () => {
          for (let k = 0; k < 4; k++) {
            after(b, k * 0.28, () => {
              pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 0, 180, 2)
              if (k < 2) pushPlayer(b, 1, 0, 0, 0)
              spark(b, p.centerX, p.centerY, 0x8fc4ff, 8, 120)
            })
          }
          if (b.phase > 1) ring(b, 10, 260, { x: p.centerX, y: b.py - 30, radius: 3, color: 0x8fc4ff, damage: b.damage * 0.3 })
        })
        for (let k = 0; k < 4; k++) {
          b._bullet({
            x: p.centerX + (k - 1.5) * 20,
            y: b.py - 320,
            vx: 0,
            vy: 300,
            radius: 5,
            color: 0x8fc4ff,
            damage: b.damage * 0.3,
            life: 1,
          })
        }
        sfx(b, 'scan', 0.4, 0.7)
      },
    },
    ob_sample_orbs: {
      name: '采样浮球',
      en: 'SAMPLE ORBS',
      wind: 0.5,
      cool: 2.4,
      range: [0, 330],
      exec() {
        for (let k = 0; k < (b.phase > 1 ? 16 : 12); k++) {
          const a = (k / 12) * Math.PI * 2
          b._bullet({
            x: b.px,
            y: b.py - b.h * 0.1,
            vx: Math.cos(a) * 170,
            vy: Math.sin(a) * 170,
            gravity: -20,
            radius: 6,
            color: 0x8fc4ff,
            damage: b.damage * 0.3,
            life: 3,
          })
        }
        spark(b, b.px, b.py, 0x8fc4ff, 18, 240)
        sfx(b, 'alarm', 0.3, 1.1)
      },
    },
    ob_scan_sweep: {
      name: '扫描扫掠',
      en: 'SCAN SWEEP',
      wind: 0.54,
      cool: 2.6,
      range: [300, 1500],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 7 : 5); k++) {
          after(b, k * 0.1, () => {
            const x = clampW(b, p.centerX + (k - 2) * 90)
            mark(b, x, p.centerY, 28, 0x8fc4ff, 0.35)
            after(b, 0.18, () => {
              for (let j = 0; j < 2; j++) {
                b._bullet({
                  x,
                  y: b.py - 260,
                  vx: 0,
                  vy: 700,
                  radius: 4,
                  color: 0x8fc4ff,
                  damage: b.damage * 0.35,
                  life: 1.1,
                })
              }
            })
          })
        }
        sfx(b, 'scan', 0.35, 1.2)
      },
    },
    ob_alien_escort: {
      name: '外星护卫',
      en: 'ALIEN ESCORT',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 110, gap: 54 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px + (k ? 140 : -140), b.py - 80, 42, A, 0.55)
        }
        after(b, 0.55, () => {
          for (const dir of [-1, 1]) {
            ring(b, 6, 200, { x: b.px + dir * 140, y: b.py - 80, radius: 3, color: 0x8fc4ff, damage: b.damage * 0.3 })
          }
        })
      },
    },
  }
}

// ============================================================ 21 铁幕上校
function bossKit_ironColonel(b) {
  const A = b.accent
  return {
    ic_artillery_grid: {
      name: '炮兵网格',
      en: 'ARTILLERY GRID',
      sig: true,
      wind: 0.7,
      cool: 3.1,
      range: [280, 1600],
      exec() {
        const p = b.player
        if (!p) return
        for (let gx = -1; gx <= 1; gx++) {
          for (let gy = 0; gy <= 1; gy++) {
            const tx = clampW(b, p.centerX + gx * 96)
            const ty = feetY(b) - gy * 8
            mark(b, tx, ty, 46, 0xc8553f, 0.55)
            after(b, 0.55 + (gx + 1) * 0.08 + gy * 0.16, () => {
              lob(b, tx, ty, { t: 0.4, radius: 7, color: 0xc8553f, damage: b.damage * 0.55 })
            })
          }
        }
        sfx(b, 'alarm', 0.4, 0.85)
      },
    },
    ic_bayonet_charge: {
      name: '刺刀冲锋',
      en: 'BAYONET CHARGE',
      wind: 0.4,
      cool: 2.8,
      range: [180, 1400],
      exec() {
        chargeAt(b, { hold: 0.68, boost: 3.3 })
        fan(b, b.phase > 1 ? 5 : 3, 0.1, 400, { radius: 4, color: 0xc8553f, life: 0.7, damage: b.damage * 0.4 })
        mark(b, b.px + b.facing * 120, feetY(b), 52, A, 0.7)
        sfx(b, 'growl', 0.55, 0.9)
      },
    },
    ic_crossfire: {
      name: '交叉火力',
      en: 'CROSSFIRE',
      wind: 0.48,
      cool: 2.4,
      range: [0, 520],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        for (let k = 0; k < 2; k++) {
          const y = p.centerY - 40 - k * 50
          for (const from of [50, w - 50]) {
            shot(b, from, y, p.centerX, p.centerY, 500 + k * 60, {
              radius: 4,
              color: k ? 0xd8a060 : 0xc8553f,
              life: 1.5,
              damage: b.damage * 0.45,
            })
          }
        }
        sfx(b, 'alarm', 0.35, 1.1)
      },
    },
    ic_reinforce: {
      name: '增援令',
      en: 'REINFORCE',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 105, gap: 52 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px + (k ? 120 : -120), feetY(b), 50, 0xc8553f, 0.5)
        }
        after(b, 0.5, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 120, b.py - 60, b.px + dir * 320, b.py, 440, {
              radius: 4,
              color: 0xc8553f,
              life: 1.3,
              damage: b.damage * 0.34,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 22 编目长
function bossKit_librarian(b) {
  const A = b.accent
  return {
    lb_page_storm: {
      name: '书页风暴',
      en: 'PAGE STORM',
      sig: true,
      wind: 0.7,
      cool: 3,
      range: [160, 1400],
      exec() {
        const p = b.player
        if (!p) return
        for (let w = 0; w < (b.phase > 1 ? 4 : 3); w++) {
          after(b, 0.15 + w * 0.22, () => {
            const off = w * 0.5
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * Math.PI * 2 + off
              b._bullet({
                x: p.centerX,
                y: p.centerY - 40,
                vx: Math.cos(a) * 220,
                vy: Math.sin(a) * 170 - 80,
                gravity: 90,
                radius: 4,
                color: 0xd8c070,
                damage: b.damage * 0.25,
                life: 2,
              })
            }
            spark(b, p.centerX, p.centerY - 40, 0xd8c070, 10, 180)
          })
        }
        sfx(b, 'scan', 0.35, 0.9)
      },
    },
    lb_shelf_slam: {
      name: '书架倾倒',
      en: 'SHELF SLAM',
      wind: 0.56,
      cool: 2.5,
      range: [0, 330],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
          const tx = clampW(b, p.centerX + (k - 1) * 92)
          mark(b, tx, feetY(b), 58, 0xd8c070, 0.5)
          after(b, 0.5 + k * 0.08, () => {
            lob(b, tx, feetY(b) - 10, {
              t: 0.3,
              x: b.px + b.facing * 60,
              y: b.py - b.h * 0.7,
              radius: 9,
              color: 0xb09050,
              damage: b.damage * 0.6,
            })
          })
        }
        sfx(b, 'thunder', 0.35, 1.3)
      },
    },
    lb_index_beam: {
      name: '索引射线',
      en: 'INDEX BEAM',
      wind: 0.5,
      cool: 2.4,
      range: [250, 1600],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, p.centerY, 42, A, 0.34)
        after(b, 0.34, () => {
          for (let k = 0; k < 4; k++) {
            shot(b, b.px, b.py - b.h * 0.22 + k * 3, p.centerX, p.centerY, 980, {
              radius: 2.5,
              color: 0xd8c070,
              life: 1,
              damage: b.damage * 0.42,
            })
          }
          sparkLine(b, b.px, b.py, p.centerX, p.centerY, 0xd8c070, 9, 90)
        })
        sfx(b, 'alarm', 0.3, 1.5)
      },
    },
    lb_archive_call: {
      name: '归档召唤',
      en: 'ARCHIVE CALL',
      wind: 0.84,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 105, gap: 52 })
        for (let k = 0; k < 3; k++) {
          mark(b, b.px + (k - 1) * 108, feetY(b), 42, 0xd8c070, 0.45 + k * 0.16)
          after(b, 0.45 + k * 0.16, () => {
            ring(b, 5, 200, { x: b.px + (k - 1) * 108, y: feetY(b), radius: 3, color: 0xd8c070, damage: b.damage * 0.22 })
          })
        }
      },
    },
  }
}

// ============================================================ 23 值周校长
function bossKit_schoolmaster(b) {
  const A = b.accent
  return {
    sm_ruler_line: {
      name: '教鞭划线',
      en: 'RULER LINE',
      sig: true,
      wind: 0.64,
      cool: 2.9,
      range: [140, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, b.px + (p.centerX - b.px) * ((k + 1) / n))
          mark(b, tx, feetY(b), 40, 0xe0b060, 0.3 + k * 0.16)
          after(b, 0.3 + k * 0.16, () => {
            sparkLine(b, tx - 20, feetY(b), tx + 20, feetY(b), 0xe0b060, 6, 120)
            aoe(b, tx, feetY(b), 58, b.damage * 0.5)
            shake(b, 0.2)
          })
        }
        sfx(b, 'scan', 0.35, 1.1)
      },
    },
    sm_chalk_dust: {
      name: '粉笔灰',
      en: 'CHALK DUST',
      wind: 0.42,
      cool: 2.1,
      range: [0, 280],
      exec() {
        fan(b, b.phase > 1 ? 10 : 7, 0.12, 360, {
          radius: 6,
          color: 0xe8e0d0,
          life: 1.8,
          damage: b.damage * 0.45,
          gravity: 60,
        })
        puff(b, 22, 0xd8d0c0, 1.8)
        sfx(b, 'scan', 0.3, 0.8)
      },
    },
    sm_detention: {
      name: '留堂',
      en: 'DETENTION',
      wind: 0.5,
      cool: 2.5,
      range: [100, 720],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 96, 0xe0b060, 0.55)
        after(b, 0.55, () => {
          for (let k = 0; k < (b.phase > 1 ? 14 : 10); k++) {
            const a = (k / 10) * Math.PI * 2
            b._bullet({
              x: p.centerX + Math.cos(a) * 84,
              y: feetY(b) - 30,
              vx: -Math.cos(a) * 80,
              vy: -Math.sin(a) * 60 - 40,
              gravity: 200,
              radius: 4,
              color: 0xe0b060,
              damage: b.damage * 0.3,
              life: 1.6,
            })
          }
          aoe(b, p.centerX, feetY(b), 78, b.damage * 0.45)
        })
        sfx(b, 'alarm', 0.35, 0.9)
      },
    },
    sm_roll_call: {
      name: '点名',
      en: 'ROLL CALL',
      wind: 0.84,
      cool: 9,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 52 })
        for (let k = 0; k < 3; k++) {
          after(b, 0.3 + k * 0.24, () => {
            spark(b, b.px + (k - 1) * 96, b.py - 40, 0xe0b060, 10, 160)
              mark(b, b.px + (k - 1) * 96, feetY(b), 36, 0xe0b060, 0.4)
          })
        }
        sfx(b, 'radio', 0.35, 1.2)
      },
    },
  }
}

// ============================================================ 24 终身教授
function bossKit_professor(b) {
  const A = b.accent
  return {
    pf_lecture_lights: {
      name: '阶梯灯阵',
      en: 'LECTURE LIGHTS',
      sig: true,
      wind: 0.68,
      cool: 3,
      range: [280, 1600],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 6 : 4); k++) {
          const tx = clampW(b, p.centerX + (k - 1.5) * 82)
          mark(b, tx, feetY(b), 32, 0xb8d8e8, 0.4 + k * 0.12)
          after(b, 0.4 + k * 0.12, () => {
            for (let j = 0; j < 2; j++) {
              b._bullet({
                x: tx,
                y: b.py - 300,
                vx: 0,
                vy: 860,
                radius: 4,
                color: 0xb8d8e8,
                damage: b.damage * 0.42,
                life: 1.1,
              })
            }
            spark(b, tx, feetY(b), 0xb8d8e8, 8, 160)
          })
        }
        sfx(b, 'alarm', 0.4, 1)
      },
    },
    pf_thesis_volley: {
      name: '论文齐射',
      en: 'THESIS VOLLEY',
      wind: 0.5,
      cool: 2.4,
      range: [180, 1000],
      exec() {
        fan(b, b.phase > 1 ? 10 : 7, 0.12, 480, {
          radius: 5,
          color: 0xb8d8e8,
          life: 1.5,
          damage: b.damage * 0.45,
          gravity: 120,
        })
        puff(b, 16, 0xd8e8f0, 1.4)
        sfx(b, 'scan', 0.3, 1.2)
      },
    },
    pf_tenure_grip: {
      name: '终身教职',
      en: 'TENURE GRIP',
      wind: 0.48,
      cool: 2.6,
      range: [0, 300],
      exec() {
        const p = b.player
        if (!p) return
        const sign = Math.sign(b.px - p.centerX) || 1
        pushPlayer(b, sign, 540, 150, 28)
        after(b, 0.2, () => {
          burst(b, b.px, feetY(b), b.phase > 1 ? 150 : 120, { color: 0xb8d8e8, sparks: 16, damage: b.damage * 0.75 })
        })
        spark(b, p.centerX, p.centerY, 0xb8d8e8, 14, 220)
        sfx(b, 'alarm', 0.35, 0.8)
      },
    },
    pf_ta_summon: {
      name: '助教',
      en: 'TEACHING ASSISTANTS',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 105, gap: 52 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px + (k ? 125 : -125), feetY(b), 44, 0xb8d8e8, 0.55)
        }
        after(b, 0.55, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 125, b.py - 50, b.px + dir * 320, b.py, 450, {
              radius: 3,
              color: 0xb8d8e8,
              life: 1.3,
              damage: b.damage * 0.3,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 25 压辊
function bossKit_paperPress(b) {
  const A = b.accent
  return {
    pp_roller_crush: {
      name: '压辊碾压',
      en: 'ROLLER CRUSH',
      sig: true,
      wind: 0.72,
      cool: 3,
      range: [0, 1100],
      exec() {
        groundWave(b, b.facing, b.phase > 1 ? 520 : 440, {
          radius: 24,
          color: 0xc8b080,
          life: 2.6,
          damage: b.damage * 0.9,
        })
        if (b.phase > 1) {
          after(b, 0.45, () => {
            groundWave(b, -b.facing, 470, { radius: 20, color: 0xa89870, life: 2.4, damage: b.damage * 0.65 })
          })
        }
        puff(b, 26, 0xc8b080, 1.8)
        shake(b, 0.6)
        sfx(b, 'thunder', 0.5, 0.9)
      },
    },
    pp_pulp_spray: {
      name: '纸浆喷溅',
      en: 'PULP SPRAY',
      wind: 0.4,
      cool: 2.1,
      range: [0, 300],
      exec() {
        fan(b, b.phase > 1 ? 11 : 8, 0.14, 380, {
          radius: 7,
          color: 0xc8b080,
          life: 1.1,
          damage: b.damage * 0.55,
          gravity: 220,
        })
        puff(b, 20, 0xa89870, 1.6)
        sfx(b, 'scan', 0.3, 0.9)
      },
    },
    pp_stack_drop: {
      name: '纸垛坠落',
      en: 'STACK DROP',
      wind: 0.6,
      cool: 2.7,
      range: [300, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 5 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 84)
          mark(b, tx, feetY(b), 62, 0xc8b080, 0.55)
          after(b, 0.55, () => {
            lob(b, tx, feetY(b) - 10, {
              t: 0.36,
              x: tx,
              y: b.py - 460,
              radius: 11,
              color: 0xb0a070,
              damage: b.damage * 0.65,
            })
          })
        }
        sfx(b, 'alarm', 0.35, 1)
      },
    },
    pp_recycle: {
      name: '回收召唤',
      en: 'RECYCLE',
      wind: 0.86,
      cool: 9,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 54 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px + (k ? 140 : -140), feetY(b), 46, 0xc8b080, 0.5)
        }
        after(b, 0.5, () => {
          for (const dir of [-1, 1]) {
            ring(b, 6, 210, { x: b.px + dir * 140, y: feetY(b), radius: 3, color: 0xc8b080, damage: b.damage * 0.26 })
          }
        })
      },
    },
  }
}

// ============================================================ 26 值守馆长
function bossKit_curator(b) {
  const A = b.accent
  return {
    cu_tag_archive: {
      name: '编号归档',
      en: 'TAG ARCHIVE',
      sig: true,
      wind: 0.66,
      cool: 2.9,
      range: [110, 950],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < 3; k++) {
          const tx = clampW(b, predictX(b, 0.35 + k * 0.22))
          mark(b, tx, feetY(b), 44, 0xc8a060, 0.45)
          after(b, 0.45 + k * 0.2, () => {
            aoe(b, tx, feetY(b), 70, b.damage * 0.55)
            spark(b, tx, feetY(b) - 20, 0xc8a060, 10, 180)
            shake(b, 0.22)
            if (b.phase > 1) {
              ring(b, 6, 220, { x: tx, y: b.py - 20, radius: 3, color: 0xc8a060, damage: b.damage * 0.22 })
            }
          })
        }
        sfx(b, 'scan', 0.35, 1.1)
      },
    },
    cu_dig_pit: {
      name: '探方陷阱',
      en: 'DIG PIT',
      wind: 0.54,
      cool: 2.5,
      range: [0, 460],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 5 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 80)
          mark(b, tx, feetY(b), 44, 0xc8a060, 0.6)
          after(b, 0.6, () => {
            b._bullet({
              x: tx,
              y: feetY(b),
              vx: 0,
              vy: 0,
              radius: 13,
              color: 0x9a8050,
              damage: b.damage * 0.5,
              life: 5.5,
            })
          })
        }
        puff(b, 18, 0x9a8050, 1.5)
        sfx(b, 'thunder', 0.3, 1.2)
      },
    },
    cu_relic_toss: {
      name: '文物投掷',
      en: 'RELIC TOSS',
      wind: 0.5,
      cool: 2.4,
      range: [300, 1500],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
          const tx = clampW(b, p.centerX + (k - 1) * 96)
          mark(b, tx, feetY(b), 36, 0xc8a060, 0.55)
          after(b, 0.55 + k * 0.06, () => {
            lob(b, tx, feetY(b), { t: 0.55, radius: 7, color: 0xb89060, damage: b.damage * 0.45 })
          })
        }
        sfx(b, 'alarm', 0.3, 1.1)
      },
    },
    cu_museum_guard: {
      name: '馆藏守卫',
      en: 'MUSEUM GUARD',
      wind: 0.84,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 104, gap: 52 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px + (k ? 120 : -120), feetY(b), 42, 0xc8a060, 0.5)
        }
        after(b, 0.5, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 120, b.py - 60, b.px + dir * 300, b.py, 430, {
              radius: 4,
              color: 0xc8a060,
              life: 1.3,
              damage: b.damage * 0.3,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 27 最后一班狱长
function bossKit_warden(b) {
  const A = b.accent
  return {
    wd_searchlight: {
      name: '巡夜灯',
      en: 'SEARCHLIGHT',
      sig: true,
      wind: 0.68,
      cool: 3,
      range: [200, 1600],
      exec() {
        const p = b.player
        if (!p) return
        const dir = Math.sign(p.centerX - b.px) || 1
        for (let k = 0; k < (b.phase > 1 ? 6 : 4); k++) {
          const tx = clampW(b, b.px + dir * (240 + k * 130))
          mark(b, tx, feetY(b), 46, 0x9aa0a8, 0.32 + k * 0.12)
          after(b, 0.32 + k * 0.12, () => {
            for (let j = 0; j < 2; j++) {
              b._bullet({
                x: tx,
                y: b.py - 320,
                vx: 0,
                vy: 780,
                radius: 4,
                color: 0xc8d0d8,
                damage: b.damage * 0.4,
                life: 1.1,
              })
            }
            spark(b, tx, feetY(b), 0xc8d0d8, 8, 140)
          })
        }
        sfx(b, 'alarm', 0.35, 0.9)
      },
    },
    wd_baton_slam: {
      name: '警棍重击',
      en: 'BATON SLAM',
      wind: 0.45,
      cool: 2.2,
      range: [0, 265],
      exec() {
        burst(b, b.px + b.facing * 80, feetY(b), b.phase > 1 ? 150 : 120, {
          color: 0x9aa0a8,
          sparks: 14,
          damage: b.damage * 0.85,
        })
        fan(b, b.phase > 1 ? 7 : 5, 0.12, 390, { radius: 4, color: 0xc8d0d8, life: 0.8, damage: b.damage * 0.4 })
        sfx(b, 'thunder', 0.35, 1.3)
      },
    },
    wd_gate_lock: {
      name: '落闸',
      en: 'GATE LOCK',
      wind: 0.55,
      cool: 2.6,
      range: [100, 800],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 86, 0x9aa0a8, 0.55)
        after(b, 0.55, () => {
          for (let k = 0; k < (b.phase > 1 ? 12 : 8); k++) {
            const a = (k / 8) * Math.PI * 2
            b._bullet({
              x: p.centerX + Math.cos(a) * 78,
              y: feetY(b) - 36 - Math.sin(a) * 40,
              vx: -Math.cos(a) * 120,
              vy: -Math.sin(a) * 90,
              gravity: 200,
              radius: 5,
              color: 0x9aa0a8,
              damage: b.damage * 0.3,
              life: 1.4,
            })
          }
          aoe(b, p.centerX, feetY(b), 80, b.damage * 0.4)
        })
        sfx(b, 'scan', 0.35, 0.8)
      },
    },
    wd_inmate_call: {
      name: '囚犯驱赶',
      en: 'INMATE CALL',
      wind: 0.84,
      cool: 9,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 54 })
        for (let k = 0; k < 2; k++) {
          mark(b, b.px + (k ? 130 : -130), feetY(b), 48, 0x9aa0a8, 0.5)
        }
        after(b, 0.5, () => {
          for (const dir of [-1, 1]) {
            shot(b, b.px + dir * 130, b.py - 60, b.px + dir * 320, b.py, 450, {
              radius: 4,
              color: 0x9aa0a8,
              life: 1.2,
              damage: b.damage * 0.32,
            })
          }
        })
      },
    },
  }
}

// ============================================================ 28 前台夜班
function bossKit_hotelClerk(b) {
  const A = b.accent
  return {
    hcl_room13_door: {
      name: '十三号房门',
      en: 'ROOM 13 DOOR',
      sig: true,
      wind: 0.62,
      cool: 3,
      range: [100, 950],
      exec() {
        const p = b.player
        if (!p) return
        const { w } = roomBounds(b)
        const tx = Math.max(70, Math.min(w - b.body.w - 70, p.centerX + (p.centerX > w / 2 ? -170 : 170)))
        mark(b, b.px, feetY(b), 54, 0xc8a8d8, 0.5)
        after(b, 0.5, () => {
          b.body.x = tx
          b.body.y = p.body.y + p.body.h - b.body.h
          b.body.vx = 0
          b.body.vy = 0
          b.facing = p.centerX >= b.px ? 1 : -1
          mark(b, b.px, feetY(b), 70, 0xc8a8d8, 0.7)
          b._bullet({
            x: b.px,
            y: feetY(b),
            vx: 0,
            vy: 0,
            radius: 12,
            color: 0xc8a8d8,
            damage: b.damage * 0.4,
            life: 3.2,
          })
          for (let k = 0; k < (b.phase > 1 ? 8 : 5); k++) {
            const a = (k / 5) * Math.PI * 2
            b._bullet({
              x: b.px,
              y: b.py - b.h * 0.2,
              vx: Math.cos(a) * 280,
              vy: Math.sin(a) * 280,
              radius: 4,
              color: 0xc8a8d8,
              damage: b.damage * 0.35,
              life: 1.2,
            })
          }
          spark(b, b.px, b.py, 0xc8a8d8, 18, 260)
          b.state = 'chase'
          b.stateT = 0
          b.moveCd = 1
        })
        sfx(b, 'alarm', 0.4, 1.3)
      },
    },
    hcl_key_volley: {
      name: '钥匙齐射',
      en: 'KEY VOLLEY',
      wind: 0.46,
      cool: 2.2,
      range: [260, 1400],
      exec() {
        fan(b, b.phase > 1 ? 10 : 7, 0.1, 600, {
          radius: 3,
          color: 0xc8a8d8,
          life: 1.3,
          damage: b.damage * 0.45,
        })
        spark(b, b.px + b.facing * 24, b.py - b.h * 0.18, 0xd8c0e8, 12, 200)
        sfx(b, 'alarm', 0.3, 1.6)
      },
    },
    hcl_luggage_slam: {
      name: '行李重砸',
      en: 'LUGGAGE SLAM',
      wind: 0.52,
      cool: 2.4,
      range: [0, 300],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 70, 0xc8a8d8, 0.5)
        after(b, 0.5, () => {
          lob(b, p.centerX, feetY(b) - 8, {
            t: 0.3,
            x: b.px + b.facing * 50,
            y: b.py - b.h * 0.8,
            radius: 10,
            color: 0xb090c0,
            damage: b.damage * 0.7,
          })
          burst(b, p.centerX, feetY(b), 78, { color: 0xc8a8d8, sparks: 12, damage: b.damage * 0.45 })
        })
        sfx(b, 'thunder', 0.35, 1.2)
      },
    },
    hcl_guest_register: {
      name: '入住登记',
      en: 'CHECK IN',
      wind: 0.86,
      cool: 9.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 54 })
        for (let k = 0; k < 3; k++) {
          mark(b, b.px + (k - 1) * 100, feetY(b), 40, 0xc8a8d8, 0.45 + k * 0.16)
          after(b, 0.45 + k * 0.16, () => {
            spark(b, b.px + (k - 1) * 100, b.py - 30, 0xc8a8d8, 10, 150)
          })
        }
      },
    },
  }
}

export const BOSS_KIT_FACTORIES = {
  tb_data_archon: bossKit_dataArchon,
  tb_assembly_overseer: bossKit_assemblyOverseer,
  tb_orbit_judge: bossKit_orbitJudge,
  tb_helios: bossKit_helios,
  tb_flood_colossus: bossKit_floodColossus,
  tb_bridge_raider: bossKit_bridgeRaider,
  tb_highway_king: bossKit_highwayKing,
  tb_skyline_baron: bossKit_skylineBaron,
  tb_arena_champion: bossKit_arenaChampion,
  tb_scrap_warlord: bossKit_scrapWarlord,
  tb_caregiver: bossKit_caregiver,
  tb_rally_boss: bossKit_rallyBoss,
  tb_storm_reaper: bossKit_stormReaper,
  tb_acid_mother: bossKit_acidMother,
  tb_rot_queen: bossKit_rotQueen,
  tb_bell_bishop: bossKit_bellBishop,
  tb_prime_core: bossKit_primeCore,
  tb_zero_strain: bossKit_zeroStrain,
  tb_proto_mind: bossKit_protoMind,
  tb_observer: bossKit_observer,
  tb_iron_colonel: bossKit_ironColonel,
  tb_librarian: bossKit_librarian,
  tb_schoolmaster: bossKit_schoolmaster,
  tb_professor: bossKit_professor,
  tb_paper_press: bossKit_paperPress,
  tb_curator: bossKit_curator,
  tb_warden: bossKit_warden,
  tb_hotel_clerk: bossKit_hotelClerk,
  tb_dockmaster: bossKit_dockmaster,
  tb_lighthouse_keeper: bossKit_lighthouseKeeper,
  tb_shipwright: bossKit_shipwright,
  tb_drydock_rig: bossKit_drydockRig,
  tb_substation: bossKit_substation,
  tb_bunker_commander: bossKit_bunkerCommander,
  tb_mine_foreman: bossKit_mineForeman,
  tb_boiler_king: bossKit_boilerKing,
  tb_reactor_priest: bossKit_reactorPriest,
  tb_rad_colossus: bossKit_radColossus,
  tb_arsenal_sergeant: bossKit_arsenalSergeant,
  tb_punk_amp: bossKit_punkAmp,
  tb_shadow_walker: bossKit_shadowWalker,
  tb_castle_tyrant: bossKit_castleTyrant,
  tb_vampire_count: bossKit_vampireCount,
  tb_gravity_eye: bossKit_gravityEye,
  tb_fog_wraith: bossKit_fogWraith,
  tb_strait_howler: bossKit_straitHowler,
  tb_swamp_maw: bossKit_swampMaw,
  tb_forest_hollow: bossKit_forestHollow,
  tb_red_tide: bossKit_redTide,
  tb_grey_harbor: bossKit_greyHarbor,
  tb_hotel_nightmare: bossKit_hotelNightmare,
}

// ============================================================ 47 泥沼巨口
function bossKit_swampMaw(b) {
  const A = b.accent
  return {
    swp_mire_sink: {
      name: '泥沼吞噬',
      en: 'MIRE SINK',
      sig: true,
      wind: 0.8,
      cool: 3.6,
      range: [0, 800],
      exec() {
        const p = b.player
        if (!p) return
        const sink = (x, delay) => {
          mark(b, x, feetY(b), 100, A, delay)
          after(b, delay, () => {
            try {
              p.body.vy = Math.max(p.body.vy, 180)
            } catch (e) {
              /* ignore */
            }
            aoe(b, x, feetY(b), 104, b.damage * 0.55)
            puff(b, 22, 0x4a5a38, 1.7)
            b._bullet({
              x,
              y: feetY(b) - 6,
              vx: 0,
              vy: 0,
              radius: 30,
              color: 0x5a6a40,
              damage: b.damage * 0.2,
              life: 3,
            })
          })
        }
        sink(p.centerX, 0.7)
        if (b.phase > 1) sink(clampW(b, b.px + b.facing * 180), 1)
        sfx(b, 'growl', 0.45, 0.4)
      },
    },
    swp_bubble_burst: {
      name: '沼泡爆裂',
      en: 'BUBBLE BURST',
      wind: 0.5,
      cool: 2.4,
      range: [100, 700],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const x = clampW(b, p.centerX + (k - (n - 1) / 2) * 84)
          mark(b, x, feetY(b), 40, 0x8aa060, 0.4 + k * 0.13)
          after(b, 0.4 + k * 0.13, () => {
            burst(b, x, feetY(b), 72, {
              color: 0x8aa060,
              dust: 0x4a5a38,
              sparks: 10,
              damage: b.damage * 0.4,
              sound: false,
            })
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x,
                y: feetY(b) - 20,
                vx: (j - 1) * 90,
                vy: -160,
                gravity: 500,
                radius: 4,
                color: 0x8aa060,
                damage: b.damage * 0.2,
                life: 1.4,
              })
            }
          })
        }
        sfx(b, 'scan', 0.4, 0.5)
      },
    },
    swp_mud_spit: {
      name: '吐泥',
      en: 'MUD SPIT',
      wind: 0.46,
      cool: 2.2,
      range: [200, 1100],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 5 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 96)
          mark(b, tx, feetY(b), 46, A, 0.35 + k * 0.1)
          after(b, 0.35 + k * 0.1, () => {
            lob(b, tx, feetY(b) - 6, {
              t: 0.45,
              x: b.px + b.facing * 24,
              y: b.py - b.h * 0.75,
              radius: 9,
              color: A,
              damage: b.damage * 0.42,
            })
          })
        }
        puff(b, 16, 0x4a5a38, 1.4)
        sfx(b, 'dig', 0.4, 0.9)
      },
    },
    swp_swamp_brood: {
      name: '沼泽育群',
      en: 'SWAMP BROOD',
      wind: 0.92,
      cool: 11,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 5 : 3, { base: 104, gap: 48 })
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 96)
          mark(b, x, feetY(b), 40, 0x8aa060, 0.5 + k * 0.15)
          after(b, 0.5 + k * 0.15, () => {
            puff(b, 12, 0x4a5a38, 1.5)
            b._bullet({
              x,
              y: feetY(b) - 10,
              vx: 0,
              vy: 0,
              radius: 16,
              color: 0x5a6a40,
              damage: b.damage * 0.18,
              life: 2.4,
            })
          })
        }
      },
    },
  }
}

// ============================================================ 48 枯林空腔
function bossKit_forestHollow(b) {
  const A = b.accent
  return {
    fh_hollow_resonance: {
      name: '空腔共鸣',
      en: 'HOLLOW RESONANCE',
      sig: true,
      wind: 0.7,
      cool: 3.2,
      range: [0, 1200],
      exec() {
        const spots = [-150, -50, 50, 150]
        spots.forEach((side, k) => {
          const x = clampW(b, b.px + side)
          mark(b, x, feetY(b), 44, A, 0.4 + k * 0.16)
          after(b, 0.4 + k * 0.16, () => {
            ring(b, b.phase > 1 ? 8 : 6, 200, {
              x,
              y: feetY(b) - 26,
              radius: 4,
              color: A,
              damage: b.damage * 0.28,
              life: 1.2,
            })
            sparkLine(b, x, feetY(b), x, feetY(b) - 110, A, 5, 70)
          })
        })
        if (b.phase > 1) {
          after(b, 1.1, () => {
            for (let k = 0; k < 3; k++) {
              const x = clampW(b, b.px + (k - 1) * 180)
              mark(b, x, feetY(b), 38, 0xc8b090, 0.35)
              after(b, 0.35, () => burst(b, x, feetY(b), 66, { color: 0xc8b090, sparks: 10, damage: b.damage * 0.35 }))
            }
          })
        }
        sfx(b, 'growl', 0.45, 0.6)
      },
    },
    fh_branch_sweep: {
      name: '枯枝横扫',
      en: 'BRANCH SWEEP',
      wind: 0.5,
      cool: 2.3,
      range: [0, 320],
      exec() {
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 450 : 390, { radius: 13, color: A, damage: b.damage * 0.55 })
        }
        for (let k = 0; k < (b.phase > 1 ? 5 : 3); k++) {
          const a = -0.5 + k * 0.3
          b._bullet({
            x: b.px,
            y: b.py - b.h * 0.6,
            vx: Math.cos(a) * b.facing * 360,
            vy: Math.sin(a) * 360,
            radius: 7,
            color: 0xa89070,
            damage: b.damage * 0.3,
            life: 1.4,
          })
        }
        puff(b, 18, 0x6a5a40, 1.4)
        shake(b, 0.35)
        sfx(b, 'thunder', 0.35, 1.2)
      },
    },
    fh_leaf_storm: {
      name: '枯叶风暴',
      en: 'LEAF STORM',
      wind: 0.6,
      cool: 2.8,
      range: [150, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const waves = b.phase > 1 ? 4 : 3
        for (let w = 0; w < waves; w++) {
          after(b, w * 0.22, () => {
            fan(b, b.phase > 1 ? 7 : 5, 0.18, 340 + w * 40, {
              radius: 4,
              color: w % 2 ? 0xc8b090 : A,
              damage: b.damage * 0.22,
              life: 1.7,
              spread: (w - 1) * 0.12,
            })
          })
        }
        puff(b, 26, 0x8a7a58, 1.9)
        sfx(b, 'scan', 0.4, 0.6)
      },
    },
    fh_woodland_call: {
      name: '林地召唤',
      en: 'WOODLAND CALL',
      wind: 0.88,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 52 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 116)
          mark(b, x, feetY(b), 38, 0xc8b090, 0.46 + k * 0.18)
          after(b, 0.46 + k * 0.18, () => {
            sparkLine(b, x, feetY(b), x + 20, feetY(b) - 90, A, 5, 80)
            b._bullet({
              x,
              y: feetY(b) - 8,
              vx: 0,
              vy: -180,
              radius: 7,
              color: 0xa89070,
              damage: b.damage * 0.22,
              life: 1.2,
            })
          })
        }
      },
    },
  }
}

// ============================================================ 49 赤潮母
function bossKit_redTide(b) {
  const A = b.accent
  return {
    rt_red_tide: {
      name: '赤潮',
      en: 'RED TIDE',
      sig: true,
      wind: 0.76,
      cool: 3.5,
      range: [0, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        for (let w = 0; w < (b.phase > 1 ? 4 : 3); w++) {
          const yOff = -b.h * 0.4 + w * 34
          mark(b, b.px + dir * (50 + w * 60), feetY(b), 40, A, 0.3 + w * 0.16)
          after(b, 0.3 + w * 0.16, () => {
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: b.px + dir * 30,
                y: b.py + yOff + (k - 2) * 18,
                vx: dir * (300 + w * 40),
                vy: 0,
                radius: 9,
                color: w % 2 ? 0xe05040 : 0xff8060,
                damage: b.damage * 0.28,
                life: 2.8,
              })
            }
            spark(b, b.px + dir * 30, b.py + yOff, A, 12, 200)
          })
        }
        if (b.phase > 1) {
          after(b, 0.9, () => {
            for (let k = 0; k < 4; k++) {
              b._bullet({
                x: p.centerX,
                y: b.py - b.h * 0.3 + k * 26,
                vx: -dir * 320,
                vy: 0,
                radius: 7,
                color: 0xff8060,
                damage: b.damage * 0.24,
                life: 2.4,
              })
            }
          })
        }
        shake(b, 0.4)
        sfx(b, 'thunder', 0.45, 1.2)
      },
    },
    rt_shell_barrage: {
      name: '贝壳齐射',
      en: 'SHELL BARRAGE',
      wind: 0.56,
      cool: 2.6,
      range: [200, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 88)
          mark(b, tx, feetY(b), 42, 0xf0a090, 0.32 + k * 0.09)
          after(b, 0.32 + k * 0.09, () => {
            lob(b, tx, feetY(b) - 6, {
              t: 0.4,
              x: b.px + b.facing * 22,
              y: b.py - b.h * 0.8,
              radius: 7,
              color: 0xf0a090,
              damage: b.damage * 0.4,
            })
            burst(b, tx, feetY(b), 56, { color: 0xf0a090, sparks: 8, damage: b.damage * 0.25, sound: false, shake: 0.12 })
          })
        }
        sfx(b, 'alarm', 0.35, 1.1)
      },
    },
    rt_undertow: {
      name: '退潮拖拽',
      en: 'UNDERTOW',
      wind: 0.6,
      cool: 2.8,
      range: [80, 600],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        pushPlayer(b, dir, 470, 90, 26)
        groundWave(b, dir, 340, { radius: 11, color: A, damage: b.damage * 0.5 })
        after(b, 0.35, () => {
          for (let k = 0; k < 5; k++) {
            b._bullet({
              x: p.centerX + (k - 2) * 40,
              y: feetY(b) - 8,
              vx: 0,
              vy: -140,
              radius: 5,
              color: 0xf0a090,
              damage: b.damage * 0.22,
              life: 1.5,
            })
          }
          puff(b, 18, 0x8a4a40, 1.5)
        })
        sfx(b, 'weld', 0.4, 0.6)
      },
    },
    rt_spawn_beds: {
      name: '产卵床',
      en: 'SPAWN BEDS',
      wind: 0.9,
      cool: 10.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 5 : 3, { base: 100, gap: 50 })
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 94)
          mark(b, x, feetY(b), 44, 0xf0a090, 0.5 + k * 0.14)
          after(b, 0.5 + k * 0.14, () => {
            for (let j = 0; j < 3; j++) {
              const a = (j / 3) * Math.PI * 2
              b._bullet({
                x,
                y: feetY(b) - 16,
                vx: Math.cos(a) * 120,
                vy: Math.sin(a) * 90 - 100,
                gravity: 300,
                radius: 5,
                color: 0xf0a090,
                damage: b.damage * 0.18,
                life: 1.5,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 50 灰港吊机
function bossKit_greyHarbor(b) {
  const A = b.accent
  return {
    gh_crane_hook: {
      name: '灰港吊钩',
      en: 'GREY HOOK',
      sig: true,
      wind: 0.8,
      cool: 3.4,
      range: [150, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const hook = (x, delay) => {
          mark(b, x, feetY(b), 66, A, delay)
          after(b, delay, () => {
            lob(b, x, feetY(b) - 6, {
              t: 0.26,
              x,
              y: p.body.y - 380,
              gravity: 1600,
              radius: 14,
              color: A,
              damage: b.damage * 0.7,
            })
            burst(b, x, feetY(b), 88, { color: A, sparks: 16, damage: b.damage * 0.5 })
            pushPlayer(b, Math.sign(x - p.centerX) || 1, 400, 120, 20)
            sparkLine(b, x, b.py - b.h * 1.2, x, feetY(b), A, 7, 110)
          })
        }
        hook(clampW(b, predictX(b, 0.5)), 0.7)
        if (b.phase > 1) hook(clampW(b, predictX(b, 0.9) + 140), 1.05)
        sfx(b, 'weld', 0.45, 0.6)
      },
    },
    gh_foghorn: {
      name: '雾笛',
      en: 'FOGHORN',
      wind: 0.56,
      cool: 2.6,
      range: [0, 800],
      exec() {
        const p = b.player
        for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
          after(b, k * 0.22, () => {
            ring(b, b.phase > 1 ? 10 : 8, 170 + k * 20, {
              radius: 11,
              color: A,
              damage: b.damage * 0.24,
              life: 2.4,
              offset: k * 0.35,
            })
          })
        }
        if (p) pushPlayer(b, Math.sign(p.centerX - b.px) || 1, 300, 90, 14)
        shake(b, 0.55)
        sfx(b, 'thunder', 0.5, 0.4)
      },
    },
    gh_container_drop: {
      name: '集装箱坠落',
      en: 'CONTAINER DROP',
      wind: 0.64,
      cool: 2.9,
      range: [200, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const x = clampW(b, p.centerX + (k - (n - 1) / 2) * 120)
          mark(b, x, feetY(b), 72, A, 0.4 + k * 0.12)
          after(b, 0.4 + k * 0.12, () => {
            lob(b, x, feetY(b) - 6, {
              t: 0.24,
              x,
              y: p.body.y - 320,
              gravity: 1800,
              radius: 15,
              color: A,
              damage: b.damage * 0.6,
            })
            burst(b, x, feetY(b), 96, { color: A, sparks: 14, damage: b.damage * 0.45 })
          })
        }
        sfx(b, 'thunder', 0.4, 0.8)
      },
    },
    gh_dockhands: {
      name: '码头工',
      en: 'DOCKHANDS',
      wind: 0.86,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 54 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 118)
          mark(b, x, feetY(b), 42, A, 0.46 + k * 0.18)
          after(b, 0.46 + k * 0.18, () => {
            for (let j = 0; j < 3; j++) {
              shot(b, x, feetY(b) - 40, predictX(b, 0.2) + (j - 1) * 44, b.py - b.h * 0.2, 440, {
                radius: 3,
                color: A,
                damage: b.damage * 0.2,
                life: 1.2,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 51 十三号房客
function bossKit_hotelNightmare(b) {
  const A = b.accent
  return {
    hn_room13: {
      name: '13号房',
      en: 'ROOM 13',
      sig: true,
      wind: 0.76,
      cool: 3.4,
      range: [100, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const doors = [p.centerX - 110, p.centerX + 110]
        if (b.phase > 1) doors.push(clampW(b, p.centerX))
        doors.forEach((x, k) => {
          mark(b, clampW(b, x), feetY(b), 48, A, 0.5 + k * 0.14, { segments: 4 })
          after(b, 0.5 + k * 0.14, () => {
            const dx = clampW(b, x)
            burst(b, dx, feetY(b), 84, {
              color: A,
              dust: 0x4a2a38,
              sparks: 14,
              damage: b.damage * 0.5,
              sound: false,
            })
            b._bullet({
              x: dx,
              y: feetY(b) - 14,
              vx: 0,
              vy: -220,
              radius: 9,
              color: A,
              damage: b.damage * 0.3,
              life: 1.2,
            })
            if (k === 0) {
              b.body.x = dx - b.body.w / 2
              b.body.y = p.body.y + p.body.h - b.body.h
              b.facing = p.centerX >= b.px ? 1 : -1
              spark(b, b.px, b.py, A, 18, 220)
            }
          })
        })
        sfx(b, 'alarm', 0.45, 0.9)
      },
    },
    hn_blood_trail: {
      name: '血渍拖行',
      en: 'BLOOD TRAIL',
      wind: 0.6,
      cool: 2.8,
      range: [0, 500],
      exec() {
        const p = b.player
        if (!p) return
        const x0 = p.centerX
        for (let k = 0; k < (b.phase > 1 ? 6 : 4); k++) {
          const x = clampW(b, x0 - b.facing * (40 + k * 64))
          mark(b, x, feetY(b), 30, A, 0.3 + k * 0.11)
          after(b, 0.3 + k * 0.11, () => {
            b._bullet({
              x,
              y: feetY(b) - 8,
              vx: 0,
              vy: -170,
              radius: 6,
              color: 0x701828,
              damage: b.damage * 0.28,
              life: 1.1,
            })
            puff(b, 6, 0x4a1a28, 1)
          })
        }
        sfx(b, 'hurt', 0.4, 0.6)
      },
    },
    hn_key_turn: {
      name: '钥匙转动',
      en: 'KEY TURN',
      wind: 0.5,
      cool: 2.4,
      range: [150, 900],
      exec() {
        const p = b.player
        if (!p) return
        const cx = p.centerX
        const cy = p.centerY - 20
        mark(b, cx, feetY(b), 62, A, 0.45)
        after(b, 0.45, () => {
          for (let k = 0; k < (b.phase > 1 ? 9 : 6); k++) {
            const a = (k / 6) * Math.PI * 2
            after(b, k * 0.05, () => {
              b._bullet({
                x: cx + Math.cos(a) * 96,
                y: cy + Math.sin(a) * 70,
                vx: -Math.cos(a) * 220,
                vy: -Math.sin(a) * 220,
                radius: 4,
                color: A,
                damage: b.damage * 0.26,
                life: 0.7,
              })
            })
          }
          spark(b, cx, cy, A, 16, 180)
        })
        sfx(b, 'scan', 0.4, 0.8)
      },
    },
    hn_guests: {
      name: '房客',
      en: 'GUESTS',
      wind: 0.9,
      cool: 11,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 5 : 3, { base: 100, gap: 50 })
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 100)
          mark(b, x, feetY(b), 44, A, 0.48 + k * 0.15, { segments: 4 })
          after(b, 0.48 + k * 0.15, () => {
            puff(b, 10, 0x4a2a38, 1.4)
            ring(b, 5, 130, { x, y: feetY(b) - 24, radius: 3, color: A, damage: b.damage * 0.18, life: 0.9 })
          })
        }
        sfx(b, 'radio', 0.4, 0.7)
      },
    },
  }
}

// ============================================================ 41 暗影行者
function bossKit_shadowWalker(b) {
  const A = b.accent
  return {
    sh_delayed_clone: {
      name: '延迟残影',
      en: 'DELAYED CLONE',
      sig: true,
      wind: 0.6,
      cool: 3.2,
      range: [100, 900],
      exec() {
        const p = b.player
        if (!p) return
        const tx = p.centerX
        const ty = p.body.y + p.body.h - b.body.h
        mark(b, tx, feetY(b), 64, A, 0.55)
        after(b, 0.55, () => {
          for (let k = 0; k < (b.phase > 1 ? 9 : 6); k++) {
            const a = (k / (b.phase > 1 ? 9 : 6)) * Math.PI * 2
            b._bullet({
              x: b.px,
              y: b.py - b.h * 0.2,
              vx: Math.cos(a) * 300,
              vy: Math.sin(a) * 300,
              radius: 5,
              color: A,
              damage: b.damage * 0.32,
              life: 1.1,
            })
          }
          b.body.x = clampW(b, tx) - b.body.w / 2
          b.body.y = ty
          b.body.vx = 0
          b.body.vy = 0
          b.facing = p.centerX >= b.px ? 1 : -1
          spark(b, b.px, b.py, A, 20, 240)
          if (b.phase > 1) {
            after(b, 0.35, () => {
              fan(b, 6, 0.14, 460, { radius: 4, color: 0xd0c0ff, damage: b.damage * 0.3, life: 1.2 })
            })
          }
        })
        sfx(b, 'alarm', 0.4, 1.2)
      },
    },
    sh_shadow_grasp: {
      name: '暗影握',
      en: 'SHADOW GRASP',
      wind: 0.5,
      cool: 2.4,
      range: [0, 260],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, p.centerX + (k - 1) * 70)
          mark(b, x, feetY(b), 44, A, 0.42 + k * 0.1)
          after(b, 0.42 + k * 0.1, () => {
            b._bullet({
              x,
              y: feetY(b) - 8,
              vx: 0,
              vy: -260,
              radius: 8,
              color: A,
              damage: b.damage * 0.35,
              life: 1.2,
            })
          })
        }
        after(b, 0.7, () => {
          pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 380, 140, 24)
          aoe(b, p.centerX, feetY(b), 90, b.damage * 0.45)
          spark(b, p.centerX, feetY(b) - 20, A, 16, 180)
        })
        sfx(b, 'growl', 0.4, 0.7)
      },
    },
    sh_blackout: {
      name: '断电',
      en: 'BLACKOUT',
      wind: 0.66,
      cool: 3,
      range: [0, 700],
      exec() {
        for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
          after(b, k * 0.26, () => {
            ring(b, b.phase > 1 ? 10 : 7, 150 + k * 20, {
              radius: 10,
              color: 0x3a2a5a,
              damage: b.damage * 0.28,
              life: 2.4,
              offset: k * 0.4,
            })
          })
        }
        const p = b.player
        if (p) pushPlayer(b, Math.sign(p.centerX - b.px) || 1, 260, 90, 12)
        shake(b, 0.55)
        sfx(b, 'alarm', 0.5, 0.4)
      },
    },
    sh_fog_stalkers: {
      name: '影雾随从',
      en: 'SHADE MINIONS',
      wind: 0.84,
      cool: 9.8,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 98, gap: 52 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 104)
          mark(b, x, feetY(b), 40, A, 0.44 + k * 0.18)
          after(b, 0.44 + k * 0.18, () => {
            spark(b, x, feetY(b) - 30, A, 12, 160)
            ring(b, 5, 130, { x, y: feetY(b) - 24, radius: 3, color: A, damage: b.damage * 0.2, life: 0.9 })
          })
        }
      },
    },
  }
}

// ============================================================ 42 空王座
function bossKit_castleTyrant(b) {
  const A = b.accent
  return {
    ct_hollow_throne: {
      name: '空座回响',
      en: 'EMPTY THRONE',
      sig: true,
      wind: 0.8,
      cool: 3.5,
      range: [0, 1200],
      exec() {
        const xs = [-130, 130]
        for (const side of xs) {
          const x = clampW(b, b.px + side)
          mark(b, x, feetY(b), 50, A, 0.6)
          after(b, 0.6, () => {
            for (let k = 0; k < 3; k++) {
              shot(b, x, feetY(b) - 40, b.px - side * 3, b.py - b.h * 0.3, 480, {
                radius: 5,
                color: A,
                damage: b.damage * 0.35,
                life: 1.6,
              })
            }
            spark(b, x, feetY(b) - 40, A, 10, 160)
          })
        }
        if (b.phase > 1) {
          after(b, 0.9, () => {
            for (let k = 0; k < 4; k++) {
              const a = (k / 4) * Math.PI * 2
              const x = clampW(b, b.px + Math.cos(a) * 140)
              mark(b, x, feetY(b), 36, 0xffa0b0, 0.4)
              after(b, 0.4, () => {
                ring(b, 5, 200, { x, y: feetY(b) - 20, radius: 3, color: 0xffa0b0, damage: b.damage * 0.22, life: 1 })
              })
            }
          })
        }
        shake(b, 0.4)
        sfx(b, 'thunder', 0.45, 0.7)
      },
    },
    ct_knight_charge: {
      name: '骑士冲锋',
      en: 'KNIGHT CHARGE',
      wind: 0.4,
      cool: 2.3,
      range: [180, 900],
      exec() {
        chargeAt(b, { boost: 3.8, hold: 0.6, sound: 'alarm' })
        fan(b, b.phase > 1 ? 5 : 3, 0.1, 540, {
          radius: 4,
          color: A,
          life: 1.2,
          damage: b.damage * 0.32,
        })
        if (b.phase > 1) {
          after(b, 0.3, () => {
            for (const dir of [-1, 1]) {
              groundWave(b, dir, 380, { radius: 10, color: 0xffa0b0, damage: b.damage * 0.3 })
            }
          })
        }
      },
    },
    ct_ballroom_waltz: {
      name: '舞厅回旋',
      en: 'BALLROOM WALTZ',
      wind: 0.6,
      cool: 2.8,
      range: [0, 520],
      exec() {
        const waves = b.phase > 1 ? 4 : 3
        for (let k = 0; k < waves; k++) {
          after(b, k * 0.26, () => {
            ring(b, b.phase > 1 ? 10 : 8, 260, {
              radius: 4,
              color: k % 2 ? 0xffa0b0 : A,
              damage: b.damage * 0.28,
              life: 1.5,
              offset: k * 0.5,
            })
            spark(b, b.px, b.py - b.h * 0.2, k % 2 ? 0xffa0b0 : A, 10, 180)
          })
        }
        sfx(b, 'scan', 0.4, 0.9)
      },
    },
    ct_court_summon: {
      name: '朝臣',
      en: 'COURTIERS',
      wind: 0.86,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 102, gap: 54 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 120)
          mark(b, x, feetY(b), 42, A, 0.5 + k * 0.16)
          after(b, 0.5 + k * 0.16, () => {
            for (let j = 0; j < 2; j++) {
              shot(b, x, feetY(b) - 40, predictX(b, 0.25) + (j - 0.5) * 50, b.py - b.h * 0.2, 420, {
                radius: 3,
                color: 0xffa0b0,
                damage: b.damage * 0.22,
                life: 1.2,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 43 血伯爵
function bossKit_vampireCount(b) {
  const A = b.accent
  return {
    vc_blood_bags: {
      name: '血袋阵列',
      en: 'BLOOD BAGS',
      sig: true,
      wind: 0.75,
      cool: 3.4,
      range: [120, 1100],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const x = clampW(b, p.centerX + (k - (n - 1) / 2) * 96)
          mark(b, x, feetY(b), 48, A, 0.5 + k * 0.14)
          after(b, 0.5 + k * 0.14, () => {
            for (let j = 0; j < (b.phase > 1 ? 5 : 3); j++) {
              b._bullet({
                x: x + (j - 1.5) * 18,
                y: feetY(b) - 120,
                vx: (j - 1.5) * 20,
                vy: 200,
                gravity: 700,
                radius: 5,
                color: A,
                damage: b.damage * 0.28,
                life: 2.2,
              })
            }
            b._bullet({
              x,
              y: feetY(b) - 6,
              vx: 0,
              vy: 0,
              radius: 18,
              color: 0x701020,
              damage: b.damage * 0.18,
              life: 2,
            })
            spark(b, x, feetY(b) - 20, A, 10, 140)
          })
        }
        sfx(b, 'alarm', 0.4, 0.7)
      },
    },
    vc_bat_swarm: {
      name: '蝙蝠群',
      en: 'BAT SWARM',
      wind: 0.48,
      cool: 2.4,
      range: [80, 700],
      exec() {
        const p = b.player
        if (!p) return
        const base = Math.atan2(p.centerY - b.py, p.centerX - b.px)
        for (let k = 0; k < (b.phase > 1 ? 9 : 6); k++) {
          after(b, k * 0.08, () => {
            const a = base + (k % 2 ? 0.2 : -0.2)
            b._bullet({
              x: b.px,
              y: b.py - b.h * 0.25,
              vx: Math.cos(a) * (340 + k * 16),
              vy: Math.sin(a) * (340 + k * 16) + (k % 2 ? -40 : 40),
              radius: 4,
              color: k % 2 ? A : 0xff7090,
              damage: b.damage * 0.24,
              life: 1.4,
            })
          })
        }
        spark(b, b.px, b.py - b.h * 0.2, 0xff7090, 12, 200)
        sfx(b, 'growl', 0.35, 1.5)
      },
    },
    vc_crimson_grip: {
      name: '猩红握',
      en: 'CRIMSON GRIP',
      wind: 0.55,
      cool: 2.5,
      range: [0, 300],
      exec() {
        const p = b.player
        if (!p) return
        pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 460, 100, 30)
        sparkLine(b, p.centerX, p.centerY, b.px, b.py - b.h * 0.2, A, 10, 140)
        after(b, 0.3, () => {
          if (b.distToPlayer() < 220) {
            aoe(b, b.px, feetY(b), 120, b.damage * 0.7)
            b.hp = Math.min(b.maxHp, b.hp + b.damage * 0.6)
            puff(b, 16, 0x701020, 1.3)
          } else {
            ring(b, 7, 260, { radius: 4, color: A, damage: b.damage * 0.35 })
          }
        })
        sfx(b, 'hurt', 0.4, 0.7)
      },
    },
    vc_thrall_call: {
      name: '血仆',
      en: 'THRALL CALL',
      wind: 0.84,
      cool: 9.8,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 52 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 112)
          mark(b, x, feetY(b), 40, A, 0.46 + k * 0.18)
          after(b, 0.46 + k * 0.18, () => {
            b._bullet({
              x,
              y: feetY(b) - 8,
              vx: 0,
              vy: 0,
              radius: 14,
              color: 0x701020,
              damage: b.damage * 0.2,
              life: 1.6,
            })
            spark(b, x, feetY(b) - 20, A, 8, 130)
          })
        }
      },
    },
  }
}

// ============================================================ 44 重力之眼
function bossKit_gravityEye(b) {
  const A = b.accent
  return {
    ge_gravity_well: {
      name: '引力井',
      en: 'GRAVITY WELL',
      sig: true,
      wind: 0.8,
      cool: 3.5,
      range: [150, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const x = clampW(b, predictX(b, 0.45))
        mark(b, x, feetY(b), 90, A, 0.75)
        after(b, 0.75, () => {
          for (let k = 0; k < 3; k++) {
            after(b, k * 0.24, () => {
              pushPlayer(b, Math.sign(x - p.centerX) || 1, 380, 90, 18)
              spark(b, x, feetY(b) - 30, A, 10, 150)
            })
          }
          for (let k = 0; k < (b.phase > 1 ? 10 : 7); k++) {
            const a = (k / 7) * Math.PI * 2
            b._bullet({
              x: x + Math.cos(a) * 70,
              y: feetY(b) - 40 + Math.sin(a) * 40,
              vx: Math.cos(a + Math.PI / 2) * 170,
              vy: Math.sin(a + Math.PI / 2) * 170,
              radius: 5,
              color: A,
              damage: b.damage * 0.26,
              life: 2,
            })
          }
        })
        sfx(b, 'scan', 0.5, 0.5)
      },
    },
    ge_meteor_lance: {
      name: '陨石枪',
      en: 'METEOR LANCE',
      wind: 0.56,
      cool: 2.6,
      range: [200, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const x = clampW(b, predictX(b, 0.55))
        mark(b, x, feetY(b), 70, A, 0.5)
        after(b, 0.5, () => {
          sparkLine(b, x, b.py - b.h * 1.4, x, feetY(b), A, 10, 160)
          lob(b, x, feetY(b) - 6, {
            t: 0.3,
            x,
            y: p.body.y - 360,
            gravity: 1500,
            radius: 13,
            color: A,
            damage: b.damage * 0.7,
          })
          if (b.phase > 1) {
            after(b, 0.25, () => {
              burst(b, clampW(b, x + 120), feetY(b), 96, { color: A, sparks: 14, damage: b.damage * 0.45 })
            })
          }
        })
        sfx(b, 'alarm', 0.4, 0.8)
      },
    },
    ge_singularity: {
      name: '奇点',
      en: 'SINGULARITY',
      wind: 0.7,
      cool: 3,
      range: [0, 600],
      exec() {
        const p = b.player
        if (!p) return
        const cx = p.centerX
        const cy = p.centerY - 10
        mark(b, cx, feetY(b), 74, A, 0.55)
        after(b, 0.55, () => {
          for (let k = 0; k < (b.phase > 1 ? 12 : 9); k++) {
            const a = (k / 9) * Math.PI * 2
            b._bullet({
              x: cx + Math.cos(a) * 150,
              y: cy + Math.sin(a) * 110,
              vx: -Math.cos(a) * 260,
              vy: -Math.sin(a) * 260,
              radius: 5,
              color: A,
              damage: b.damage * 0.3,
              life: 0.8,
            })
          }
          spark(b, cx, cy, A, 24, 240)
          shake(b, 0.45)
        })
        if (b.phase > 1) pushPlayer(b, Math.sign(b.px - p.centerX) || 1, 250, 80, 10)
        sfx(b, 'scan', 0.45, 0.6)
      },
    },
    ge_orb_escort: {
      name: '浮球护卫',
      en: 'ORB ESCORT',
      wind: 0.86,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 96, gap: 54 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 106)
          mark(b, x, feetY(b), 38, A, 0.46 + k * 0.18)
          after(b, 0.46 + k * 0.18, () => {
            for (let j = 0; j < 5; j++) {
              const a = (j / 5) * Math.PI * 2
              b._bullet({
                x,
                y: feetY(b) - 28,
                vx: Math.cos(a) * 120,
                vy: Math.sin(a) * 100,
                radius: 4,
                color: A,
                damage: b.damage * 0.2,
                life: 1.6,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 45 雾中形
function bossKit_fogWraith(b) {
  const A = b.accent
  return {
    fw_fog_shapes: {
      name: '雾中形',
      en: 'FOG SHAPES',
      sig: true,
      wind: 0.7,
      cool: 3.2,
      range: [80, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const x = clampW(b, b.px + (k - (n - 1) / 2) * 150)
          mark(b, x, feetY(b), 44, A, 0.4 + k * 0.14)
          after(b, 0.4 + k * 0.14, () => {
            for (let j = 0; j < 3; j++) {
              shot(b, x, feetY(b) - 50, p.centerX + (j - 1) * 30, p.centerY - 8, 420, {
                radius: 4,
                color: A,
                damage: b.damage * 0.28,
                life: 1.5,
              })
            }
            puff(b, 8, 0xc8d8e0, 1.2)
          })
        }
        sfx(b, 'growl', 0.4, 0.6)
      },
    },
    fw_whisper: {
      name: '低语',
      en: 'WHISPER',
      wind: 0.44,
      cool: 2.3,
      range: [0, 450],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 8 : 5); k++) {
          after(b, k * 0.09, () => {
            const a = Math.atan2(p.centerY - b.py, p.centerX - b.px) + (k % 2 ? 0.1 : -0.1) * (1 + Math.floor(k / 2))
            b._bullet({
              x: b.px,
              y: b.py - b.h * 0.25,
              vx: Math.cos(a) * 380,
              vy: Math.sin(a) * 380,
              radius: 3,
              color: A,
              damage: b.damage * 0.22,
              life: 1.3,
            })
          })
        }
        spark(b, b.px, b.py - b.h * 0.25, A, 8, 120)
        sfx(b, 'alarm', 0.3, 0.7)
      },
    },
    fw_drown: {
      name: '雾溺',
      en: 'DROWN',
      wind: 0.66,
      cool: 2.9,
      range: [0, 350],
      exec() {
        const p = b.player
        if (!p) return
        const x = p.centerX
        mark(b, x, feetY(b), 88, A, 0.6)
        after(b, 0.6, () => {
          try {
            p.body.vy = Math.max(p.body.vy, 240)
          } catch (e) {
            /* ignore */
          }
          aoe(b, x, feetY(b), b.phase > 1 ? 120 : 96, b.damage * 0.65)
          puff(b, 26, 0xc8d8e0, 2)
          pushPlayer(b, Math.sign(b.px - x) || 1, 220, 60, 10)
        })
        sfx(b, 'growl', 0.45, 0.5)
      },
    },
    fw_stalkers: {
      name: '雾行者',
      en: 'MIST STALKERS',
      wind: 0.85,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 52 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 110)
          mark(b, x, feetY(b), 42, A, 0.46 + k * 0.2)
          after(b, 0.46 + k * 0.2, () => {
            puff(b, 10, 0xc8d8e0, 1.4)
            ring(b, 5, 120, { x, y: feetY(b) - 26, radius: 3, color: A, damage: b.damage * 0.18, life: 0.9 })
          })
        }
      },
    },
  }
}

// ============================================================ 46 海峡嚎叫者
function bossKit_straitHowler(b) {
  const A = b.accent
  return {
    st_wail: {
      name: '海哭',
      en: 'SEA WAIL',
      sig: true,
      wind: 0.75,
      cool: 3.3,
      range: [100, 1500],
      exec() {
        const p = b.player
        if (!p) return
        for (let w = 0; w < (b.phase > 1 ? 3 : 2); w++) {
          after(b, w * 0.3, () => {
            fan(b, b.phase > 1 ? 9 : 6, 0.16 + w * 0.04, 420 - w * 60, {
              radius: 5,
              color: A,
              damage: b.damage * 0.32,
              life: 2,
            })
            shake(b, 0.3)
          })
        }
        spark(b, b.px, b.py - b.h * 0.35, A, 18, 260)
        sfx(b, 'growl', 0.5, 0.4)
      },
    },
    st_tide_crash: {
      name: '潮击',
      en: 'TIDE CRASH',
      wind: 0.55,
      cool: 2.6,
      range: [0, 500],
      exec() {
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 500 : 430, { radius: 14, color: A, damage: b.damage * 0.6 })
        }
        after(b, 0.25, () => {
          ring(b, b.phase > 1 ? 12 : 8, 240, { radius: 5, color: 0xd0e8f8, damage: b.damage * 0.28, life: 1.5 })
          puff(b, 24, 0x88b8d8, 1.8)
        })
        shake(b, 0.45)
        sfx(b, 'thunder', 0.45, 1.4)
      },
    },
    st_gale: {
      name: '狂风',
      en: 'GALE',
      wind: 0.5,
      cool: 2.4,
      range: [200, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        for (let k = 0; k < (b.phase > 1 ? 8 : 6); k++) {
          after(b, k * 0.07, () => {
            b._bullet({
              x: b.px + dir * 30,
              y: b.py - b.h * 0.5 + k * 18,
              vx: dir * 500,
              vy: (k % 2 ? 1 : -1) * 40,
              radius: 4,
              color: A,
              damage: b.damage * 0.26,
              life: 2.2,
            })
          })
        }
        pushPlayer(b, dir, 300, 80, 16)
        sfx(b, 'weld', 0.4, 0.8)
      },
    },
    st_flock: {
      name: '海鸟群',
      en: 'FLOCK',
      wind: 0.86,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 50 })
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 92)
          mark(b, x, feetY(b), 34, 0xd0e8f8, 0.4 + k * 0.14)
          after(b, 0.4 + k * 0.14, () => {
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x,
                y: feetY(b) - 60 + j * 14,
                vx: (j - 1) * 70,
                vy: -140,
                gravity: 160,
                radius: 4,
                color: 0xd0e8f8,
                damage: b.damage * 0.18,
                life: 1.6,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 36 锅炉王
function bossKit_boilerKing(b) {
  const A = b.accent
  return {
    bk_pressure_valve: {
      name: '压力阀',
      en: 'PRESSURE VALVE',
      sig: true,
      wind: 0.7,
      cool: 3.2,
      range: [100, 1400],
      exec() {
        const p = b.player
        if (!p) return
        for (const side of [-1, 1]) {
          const vx = b.px + side * 90
          mark(b, vx, feetY(b), 34, A, 0.55)
          after(b, 0.55, () => {
            const base = Math.atan2(p.centerY - b.py, p.centerX - vx)
            for (let k = 0; k < (b.phase > 1 ? 6 : 4); k++) {
              after(b, k * 0.08, () => {
                b._bullet({
                  x: vx,
                  y: b.py - b.h * 0.2,
                  vx: Math.cos(base + (k - 1.5) * 0.12) * 560,
                  vy: Math.sin(base + (k - 1.5) * 0.12) * 560,
                  radius: 5,
                  color: 0xffd0a0,
                  damage: b.damage * 0.3,
                  life: 1.5,
                })
              })
            }
            spark(b, vx, b.py - b.h * 0.2, 0xffd0a0, 14, 220)
          })
        }
        puff(b, 18, 0xd8d0c0, 1.6)
        sfx(b, 'weld', 0.45, 0.9)
      },
    },
    bk_furnace_blast: {
      name: '炉膛爆燃',
      en: 'FURNACE BLAST',
      wind: 0.56,
      cool: 2.8,
      range: [0, 460],
      exec() {
        const tx = clampW(b, b.px + b.facing * 80)
        mark(b, tx, feetY(b), 92, A, 0.4)
        after(b, 0.4, () => {
          burst(b, tx, feetY(b), b.phase > 1 ? 176 : 148, {
            color: 0xffb060,
            dust: 0x5a3a28,
            sparks: 24,
            damage: b.damage * 0.9,
            shake: 0.6,
          })
          pushPlayer(b, b.facing, 340, 190, 14)
          if (b.phase > 1) {
            after(b, 0.3, () => {
              ring(b, 12, 280, { radius: 6, color: 0xffb060, damage: b.damage * 0.4, life: 1.4 })
            })
          }
        })
        sfx(b, 'thunder', 0.5, 1.1)
      },
    },
    bk_scalding_rain: {
      name: '滚水雨',
      en: 'SCALDING RAIN',
      wind: 0.64,
      cool: 2.9,
      range: [260, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 8 : 6
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (Math.random() - 0.5) * 300)
          mark(b, tx, feetY(b), 40, 0xffc890, 0.34 + k * 0.09)
          after(b, 0.34 + k * 0.09, () => {
            lob(b, tx, feetY(b) - 6, {
              t: 0.34,
              x: b.px + b.facing * 20,
              y: b.py - b.h * 0.9,
              radius: 7,
              color: 0xffc890,
              damage: b.damage * 0.4,
            })
          })
        }
        puff(b, 24, 0xd8d0c0, 1.8)
        sfx(b, 'alarm', 0.4, 0.6)
      },
    },
    bk_stoker_crew: {
      name: '添煤班组',
      en: 'STOKER CREW',
      wind: 0.9,
      cool: 10.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 106, gap: 54 })
        const p = b.player
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 118)
          mark(b, x, feetY(b), 40, 0xffc890, 0.5 + k * 0.16)
          after(b, 0.5 + k * 0.16, () => {
            if (!p) return
            lob(b, clampW(b, x + (p.centerX - x) * 0.5), feetY(b) - 6, {
              t: 0.4,
              x,
              y: b.py - b.h * 0.7,
              radius: 6,
              color: 0xffc890,
              damage: b.damage * 0.3,
            })
          })
        }
        sfx(b, 'radio', 0.4, 0.8)
      },
    },
  }
}

// ============================================================ 37 反应堆祭司
function bossKit_reactorPriest(b) {
  const A = b.accent
  return {
    rp_radiation_pool: {
      name: '辐射池',
      en: 'RADIATION POOL',
      sig: true,
      wind: 0.8,
      cool: 3.6,
      range: [80, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const pool = (x, delay) => {
          mark(b, x, feetY(b), 92, A, delay)
          after(b, delay, () => {
            for (let k = 0; k < 3; k++) {
              after(b, k * 0.3, () => {
                for (let j = 0; j < 8; j++) {
                  const a = (j / 8) * Math.PI * 2 + k * 0.4
                  b._bullet({
                    x,
                    y: feetY(b) - 10,
                    vx: Math.cos(a) * (50 + k * 24),
                    vy: -60 - k * 20,
                    gravity: 120,
                    radius: 8,
                    color: A,
                    damage: b.damage * 0.28,
                    life: 2.6,
                  })
                }
                spark(b, x, feetY(b) - 20, A, 12, 160)
              })
            }
          })
        }
        pool(p.centerX, 0.7)
        if (b.phase > 1) pool(clampW(b, b.px + b.facing * 170), 1.05)
        sfx(b, 'scan', 0.45, 0.5)
      },
    },
    rp_control_rod: {
      name: '控制棒',
      en: 'CONTROL ROD',
      wind: 0.5,
      cool: 2.3,
      range: [0, 330],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, b.px + (p.centerX - b.px) * ((k + 1) / n))
          mark(b, tx, feetY(b), 38, A, 0.36 + k * 0.12)
          after(b, 0.36 + k * 0.12, () => {
            burst(b, tx, feetY(b), 56, {
              color: A,
              sparks: 8,
              damage: b.damage * 0.38,
              sound: false,
              shake: 0.15,
            })
            b._bullet({
              x: tx,
              y: feetY(b) - 22,
              vx: 0,
              vy: -240,
              radius: 7,
              color: A,
              damage: b.damage * 0.3,
              life: 1.3,
            })
          })
        }
        sfx(b, 'weld', 0.4, 0.9)
      },
    },
    rp_irradiation: {
      name: '辐照祝福',
      en: 'IRRADIATION',
      wind: 0.44,
      cool: 2.2,
      range: [200, 1000],
      exec() {
        const n = b.phase > 1 ? 9 : 6
        fan(b, n, 0.13, 430, {
          radius: 5,
          color: A,
          life: 2,
          gravity: 90,
          damage: b.damage * 0.42,
        })
        const p = b.player
        if (p) {
          sparkLine(b, b.px, b.py - b.h * 0.25, p.centerX, p.centerY, A, 7, 100)
          after(b, 0.3, () => {
            ring(b, b.phase > 1 ? 8 : 6, 180, {
              x: p.centerX,
              y: p.centerY - 6,
              radius: 4,
              color: A,
              damage: b.damage * 0.3,
              life: 1.1,
            })
          })
        }
        sfx(b, 'alarm', 0.35, 1.4)
      },
    },
    rp_core_acolytes: {
      name: '堆芯信徒',
      en: 'CORE ACOLYTES',
      wind: 0.86,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 98, gap: 52 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 112)
          mark(b, x, feetY(b), 38, A, 0.45 + k * 0.2)
          after(b, 0.45 + k * 0.2, () => {
            ring(b, b.phase > 1 ? 9 : 7, 160, {
              x,
              y: b.py - b.h * 0.2,
              radius: 3,
              color: A,
              damage: b.damage * 0.22,
              life: 1.1,
            })
          })
        }
      },
    },
  }
}

// ============================================================ 38 辐照巨像
function bossKit_radColossus(b) {
  const A = b.accent
  return {
    rc_hot_pile: {
      name: '热废料堆',
      en: 'HOT PILE',
      sig: true,
      wind: 0.78,
      cool: 3.5,
      range: [0, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const xs = [p.centerX - 90, p.centerX + 70]
        if (b.phase > 1) xs.push(clampW(b, p.centerX + 220), clampW(b, p.centerX - 230))
        for (const x of xs) {
          mark(b, x, feetY(b), 74, A, 0.65)
          after(b, 0.65, () => {
            burst(b, x, feetY(b), 86, {
              color: A,
              dust: 0x5a5a30,
              sparks: 14,
              damage: b.damage * 0.45,
              sound: false,
            })
            for (let k = 0; k < 2; k++) {
              b._bullet({
                x: x + (k - 0.5) * 36,
                y: feetY(b) - 16,
                vx: 0,
                vy: 0,
                radius: 22,
                color: 0xb8f060,
                damage: b.damage * 0.22,
                life: 3.2,
              })
            }
          })
        }
        sfx(b, 'thunder', 0.45, 0.7)
      },
    },
    rc_geiger_scream: {
      name: '盖革尖啸',
      en: 'GEIGER SCREAM',
      wind: 0.5,
      cool: 2.4,
      range: [0, 600],
      exec() {
        ring(b, b.phase > 1 ? 14 : 10, 320, { radius: 5, color: A, damage: b.damage * 0.35 })
        after(b, 0.2, () => ring(b, b.phase > 1 ? 10 : 8, 240, { radius: 4, color: 0xd0ffa0, damage: b.damage * 0.28, offset: 0.24 }))
        const p = b.player
        if (p) pushPlayer(b, Math.sign(p.centerX - b.px) || 1, 360, 120, 16)
        spark(b, b.px, b.py - b.h * 0.3, 0xd0ffa0, 24, 300)
        shake(b, 0.4)
        sfx(b, 'alarm', 0.45, 0.6)
      },
    },
    rc_crushing_mass: {
      name: '碾压废料',
      en: 'CRUSHING MASS',
      wind: 0.58,
      cool: 2.8,
      range: [0, 280],
      exec() {
        chargeAt(b, { boost: 3.4, hold: 0.7, sound: 'thunder' })
        const x0 = b.px
        after(b, 0.7, () => {
          mark(b, clampW(b, x0 + b.facing * 160), feetY(b), 84, A, 0.3)
          after(b, 0.3, () => {
            const x = clampW(b, b.px)
            burst(b, x, feetY(b), b.phase > 1 ? 160 : 132, {
              color: A,
              sparks: 18,
              damage: b.damage * 0.8,
            })
            for (let k = 0; k < 3; k++) {
              groundWave(b, (k % 2 ? 1 : -1) * (k === 1 ? -1 : 1), 340, {
                radius: 11,
                color: A,
                damage: b.damage * 0.3,
              })
            }
          })
        })
      },
    },
    rc_mutant_brood: {
      name: '辐射育群',
      en: 'MUTANT BROOD',
      wind: 0.92,
      cool: 11,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 5 : 3, { base: 104, gap: 48 })
        const p = b.player
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 104)
          mark(b, x, feetY(b), 42, 0xd0ffa0, 0.5 + k * 0.16)
          after(b, 0.5 + k * 0.16, () => {
            spark(b, x, feetY(b) - 20, 0xd0ffa0, 10, 150)
            if (!p) return
            shot(b, x, feetY(b) - 26, p.centerX, p.centerY - 20, 300, {
              radius: 5,
              color: 0xd0ffa0,
              damage: b.damage * 0.22,
              life: 1.4,
            })
          })
        }
      },
    },
  }
}

// ============================================================ 39 弹药库军士长
function bossKit_arsenalSergeant(b) {
  const A = b.accent
  return {
    as_turret_array: {
      name: '炮塔阵列',
      en: 'TURRET ARRAY',
      sig: true,
      wind: 0.8,
      cool: 3.4,
      range: [150, 1600],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, b.px + (k - (n - 1) / 2) * 170)
          mark(b, tx, feetY(b), 46, A, 0.6 + k * 0.08)
          after(b, 0.6 + k * 0.08, () => {
            for (let j = 0; j < (b.phase > 1 ? 3 : 2); j++) {
              after(b, j * 0.22, () => {
                for (let q = 0; q < 3; q++) {
                  shot(b, tx, feetY(b) - 42, p.centerX + (q - 1) * 34, p.centerY - 10, 620, {
                    radius: 4,
                    color: A,
                    life: 1.3,
                    damage: b.damage * 0.24,
                  })
                }
                spark(b, tx, feetY(b) - 42, A, 8, 160)
              })
            }
          })
        }
        sfx(b, 'weld', 0.4, 1)
      },
    },
    as_shell_volley: {
      name: '榴弹齐射',
      en: 'SHELL VOLLEY',
      wind: 0.6,
      cool: 2.6,
      range: [250, 1400],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 5 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 110)
          mark(b, tx, feetY(b), 60, A, 0.45 + k * 0.1)
          after(b, 0.45 + k * 0.1, () => {
            lob(b, tx, feetY(b) - 8, {
              t: 0.42,
              x: b.px + b.facing * 26,
              y: b.py - b.h * 0.8,
              radius: 10,
              color: A,
              damage: b.damage * 0.55,
            })
          })
        }
        shake(b, 0.3)
        sfx(b, 'alarm', 0.4, 0.9)
      },
    },
    as_bayonet_rush: {
      name: '刺刀突击',
      en: 'BAYONET RUSH',
      wind: 0.4,
      cool: 2.2,
      range: [0, 380],
      exec() {
        chargeAt(b, { boost: 3.6, hold: 0.6, sound: 'alarm' })
        fan(b, b.phase > 1 ? 5 : 3, 0.16, 520, {
          radius: 4,
          color: A,
          life: 1.1,
          damage: b.damage * 0.3,
        })
        sparkLine(b, b.px, b.py - b.h * 0.4, b.px + b.facing * 130, b.py - b.h * 0.4, A, 6, 120)
        if (b.phase > 1) {
          after(b, 0.35, () => {
            for (const dir of [-1, 1]) {
              groundWave(b, dir, 360, { radius: 10, color: A, damage: b.damage * 0.3 })
            }
          })
        }
      },
    },
    as_ammo_detail: {
      name: '弹药班',
      en: 'AMMO DETAIL',
      wind: 0.88,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 54 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 124)
          mark(b, x, feetY(b), 44, A, 0.46 + k * 0.18)
          after(b, 0.46 + k * 0.18, () => {
            for (let j = 0; j < 4; j++) {
              const a = (j / 4) * Math.PI * 2
              b._bullet({
                x,
                y: feetY(b) - 24,
                vx: Math.cos(a) * 200,
                vy: Math.sin(a) * 200 - 90,
                gravity: 420,
                radius: 4,
                color: A,
                damage: b.damage * 0.2,
                life: 1.4,
              })
            }
            spark(b, x, feetY(b) - 24, A, 8, 130)
          })
        }
      },
    },
  }
}

// ============================================================ 40 音箱塔·失真
function bossKit_punkAmp(b) {
  const A = b.accent
  return {
    pa_bass_wall: {
      name: '低音音墙',
      en: 'BASS WALL',
      sig: true,
      wind: 0.62,
      cool: 3,
      range: [0, 900],
      exec() {
        const p = b.player
        if (!p) return
        const dir = p.centerX >= b.px ? 1 : -1
        const waves = b.phase > 1 ? 3 : 2
        for (let w = 0; w < waves; w++) {
          after(b, w * 0.34, () => {
            for (let k = 0; k < 5; k++) {
              b._bullet({
                x: b.px + dir * 40,
                y: b.py - b.h * 0.55 + k * 30,
                vx: dir * 260,
                vy: 0,
                radius: 9,
                color: A,
                damage: b.damage * 0.3,
                life: 3,
              })
            }
            spark(b, b.px + dir * 40, b.py - b.h * 0.3, A, 12, 180)
          })
        }
        shake(b, 0.5)
        sfx(b, 'thunder', 0.5, 0.6)
      },
    },
    pa_feedback_howl: {
      name: '反馈啸叫',
      en: 'FEEDBACK HOWL',
      wind: 0.54,
      cool: 2.5,
      range: [100, 700],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
          after(b, k * 0.18, () => {
            const dir = (k % 2 ? 1 : -1) * (b.facing || 1)
            fan(b, b.phase > 1 ? 5 : 3, 0.2, 380 + k * 40, {
              radius: 5,
              color: k % 2 ? A : 0xffb0e0,
              life: 1.5,
              damage: b.damage * 0.3,
              spread: 0,
              x: b.px + dir * 18,
            })
            spark(b, b.px, b.py - b.h * 0.2, 0xffb0e0, 10, 180)
          })
        }
        sfx(b, 'alarm', 0.4, 0.5)
      },
    },
    pa_stage_dive: {
      name: '舞台冲撞',
      en: 'STAGE DIVE',
      wind: 0.46,
      cool: 2.3,
      range: [0, 300],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, p.centerX + (p.body?.vx || 0) * 0.3)
        mark(b, tx, feetY(b), 76, A, 0.5)
        after(b, 0.5, () => {
          b.body.x = tx - b.body.w / 2
          b.body.y = p.body.y + p.body.h - b.body.h
          b.body.vx = 0
          b.body.vy = 0
          b.facing = p.centerX >= b.px ? 1 : -1
          burst(b, b.px, feetY(b), b.phase > 1 ? 150 : 124, {
            color: A,
            sparks: 20,
            damage: b.damage * 0.8,
          })
          if (b.phase > 1) {
            ring(b, 10, 300, { radius: 5, color: 0xffb0e0, damage: b.damage * 0.35 })
          }
        })
        sfx(b, 'growl', 0.45, 1.3)
      },
    },
    pa_punk_crew: {
      name: '朋克乐队',
      en: 'PUNK CREW',
      wind: 0.86,
      cool: 9.8,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 52 })
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 96)
          mark(b, x, feetY(b), 36, 0xffb0e0, 0.44 + k * 0.15)
          after(b, 0.44 + k * 0.15, () => {
            sparkLine(b, x, feetY(b), x, feetY(b) - 120, A, 5, 80)
            ring(b, 5, 140, { x, y: feetY(b) - 30, radius: 3, color: A, damage: b.damage * 0.18, life: 0.9 })
          })
        }
      },
    },
  }
}

// ============================================================ 29 老码头工头
function bossKit_dockmaster(b) {
  const A = b.accent
  return {
    dm_winch_pull: {
      name: '绞盘拖拽',
      en: 'WINCH PULL',
      sig: true,
      wind: 0.66,
      cool: 3.2,
      range: [140, 1100],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 62, A, 0.55)
        sparkLine(b, b.px + b.facing * 20, b.py - b.h * 0.3, p.centerX, p.centerY, A, 9, 100)
        after(b, 0.55, () => {
          const dir = Math.sign(b.px - p.centerX) || 1
          pushPlayer(b, dir, 540, 150, 34)
          sfx(b, 'weld', 0.4, 0.9)
          after(b, 0.4, () => {
            if (b.distToPlayer() < 240) {
              burst(b, b.px + b.facing * 52, feetY(b), b.phase > 1 ? 150 : 120, {
                color: A,
                sparks: 16,
                damage: b.damage * 0.7,
              })
            } else {
              ring(b, b.phase > 1 ? 10 : 7, 320, { radius: 5, color: A, damage: b.damage * 0.45 })
            }
          })
        })
        if (b.phase > 1) {
          after(b, 0.95, () => {
            const x2 = clampW(b, b.px + b.facing * 190)
            mark(b, x2, feetY(b), 66, A, 0.4)
            after(b, 0.4, () => burst(b, x2, feetY(b), 90, { color: A, sparks: 10, damage: b.damage * 0.45 }))
          })
        }
      },
    },
    dm_hook_swing: {
      name: '吊钩摆荡',
      en: 'HOOK SWING',
      wind: 0.46,
      cool: 2.3,
      range: [0, 400],
      exec() {
        const base = b.px + b.facing * 120
        for (let k = 0; k < (b.phase > 1 ? 5 : 3); k++) {
          const tx = clampW(b, base + b.facing * k * 110)
          mark(b, tx, feetY(b), 46, A, 0.3 + k * 0.12)
          after(b, 0.3 + k * 0.12, () => {
            lob(b, tx, feetY(b) - 6, {
              t: 0.42,
              x: b.px + b.facing * 30,
              y: b.py - b.h * 0.9,
              radius: 9,
              color: A,
              damage: b.damage * 0.55,
            })
            spark(b, tx, feetY(b) - 16, A, 8, 140)
          })
        }
        puff(b, 10, 0x5a6a70, 1.1)
        sfx(b, 'weld', 0.35, 1.2)
      },
    },
    dm_mooring_wave: {
      name: '缆绳浪',
      en: 'MOORING WAVE',
      wind: 0.55,
      cool: 2.7,
      range: [300, 1500],
      exec() {
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 480 : 420, { radius: 13, color: A, damage: b.damage * 0.7 })
        }
        const p = b.player
        if (p) {
          for (let k = 0; k < (b.phase > 1 ? 4 : 3); k++) {
            const ty = b.py - b.h * 0.24 + (k - 1) * 30
            shot(b, b.px, b.py - b.h * 0.2, p.centerX, ty, 380, {
              radius: 6,
              color: A,
              life: 1.9,
              damage: b.damage * 0.4,
              gravity: 180,
            })
          }
        }
        puff(b, 20, 0x5f7078, 1.5)
        shake(b, 0.4)
        sfx(b, 'thunder', 0.4, 1.3)
      },
    },
    dm_dock_crew: {
      name: '码头班组',
      en: 'DOCK CREW',
      wind: 0.9,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 104, gap: 56 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 120)
          mark(b, x, feetY(b), 44, A, 0.5 + k * 0.18)
          after(b, 0.5 + k * 0.18, () => {
            spark(b, x, feetY(b) - 22, A, 9, 140)
            shot(b, x, feetY(b) - 24, predictX(b, 0.2), b.py - b.h * 0.2, 420, {
              radius: 4,
              color: A,
              life: 1.2,
              damage: b.damage * 0.3,
            })
          })
        }
      },
    },
  }
}

// ============================================================ 30 守灯人
function bossKit_lighthouseKeeper(b) {
  const A = b.accent
  return {
    lk_lens_sweep: {
      name: '透镜扫海',
      en: 'LENS SWEEP',
      sig: true,
      wind: 0.72,
      cool: 3.4,
      range: [180, 1600],
      exec() {
        const p = b.player
        if (!p) return
        const sx = b.px + b.facing * 18
        const sy = b.py - b.h * 0.35
        const base = Math.atan2(p.centerY - sy, p.centerX - sx)
        for (let k = 0; k < 7; k++) {
          after(b, k * 0.1, () => {
            const a = base + (k - 3) * 0.16
            b._bullet({
              x: sx,
              y: sy,
              vx: Math.cos(a) * 880,
              vy: Math.sin(a) * 880,
              radius: 5,
              color: A,
              damage: b.damage * 0.45,
              life: 1.9,
            })
            mark(b, clampW(b, p.centerX + (k - 3) * 70), feetY(b), 24, A, 0.3)
          })
        }
        if (b.phase > 1) {
          after(b, 0.8, () => {
            for (let k = 0; k < 5; k++) {
              shot(b, sx, sy, p.centerX, p.centerY + (k - 2) * 16, 760, {
                radius: 4,
                color: A,
                damage: b.damage * 0.35,
                life: 1.4,
              })
            }
          })
        }
        sparkLine(b, sx, sy, p.centerX, p.centerY, A, 8, 120)
        sfx(b, 'scan', 0.45, 0.8)
      },
    },
    lk_signal_flare: {
      name: '信号闪光',
      en: 'SIGNAL FLARE',
      wind: 0.38,
      cool: 2.1,
      range: [0, 520],
      exec() {
        ring(b, b.phase > 1 ? 12 : 8, 300, { radius: 5, color: A, damage: b.damage * 0.4, life: 1.4 })
        after(b, 0.18, () => ring(b, b.phase > 1 ? 10 : 7, 220, { radius: 4, color: 0xfff2c0, damage: b.damage * 0.3, offset: 0.3 }))
        spark(b, b.px, b.py - b.h * 0.3, 0xfff2c0, 26, 320)
        shake(b, 0.35)
        sfx(b, 'scan', 0.4, 1.5)
      },
    },
    lk_shipwreck: {
      name: '沉船残骸',
      en: 'SHIPWRECK',
      wind: 0.62,
      cool: 3,
      range: [150, 1000],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 5 : 4
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 90)
          mark(b, tx, feetY(b), 52, A, 0.35 + k * 0.1)
          after(b, 0.35 + k * 0.1, () => {
            lob(b, tx, feetY(b) - 8, {
              t: 0.4,
              x: b.px + b.facing * 40,
              y: b.py - b.h * 0.85,
              radius: 10,
              color: A,
              damage: b.damage * 0.55,
            })
            spark(b, tx, feetY(b) - 10, A, 8, 150)
          })
        }
        sfx(b, 'weld', 0.4, 0.7)
      },
    },
    lk_lamp_servants: {
      name: '灯仆',
      en: 'LAMP SERVANTS',
      wind: 0.86,
      cool: 9.8,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 96, gap: 52 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 110)
          mark(b, x, feetY(b), 40, 0xfff2c0, 0.45 + k * 0.2)
          after(b, 0.45 + k * 0.2, () => {
            ring(b, b.phase > 1 ? 8 : 6, 200, {
              x,
              y: b.py - b.h * 0.2,
              radius: 3,
              color: 0xfff2c0,
              damage: b.damage * 0.25,
              life: 1,
            })
          })
        }
        sfx(b, 'radio', 0.4, 1.2)
      },
    },
  }
}

// ============================================================ 31 船匠·铆钉手
function bossKit_shipwright(b) {
  const A = b.accent
  return {
    shp_rivet_gun: {
      name: '铆钉枪',
      en: 'RIVET GUN',
      sig: true,
      wind: 0.52,
      cool: 2.6,
      range: [120, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 10 : 7
        for (let k = 0; k < n; k++) {
          after(b, k * 0.055, () => {
            shot(b, b.px + b.facing * 26, b.py - b.h * 0.16, p.centerX, p.centerY - 6 + (k % 2 ? 10 : -10), 760, {
              radius: 3,
              color: A,
              life: 1.2,
              damage: b.damage * 0.28,
            })
          })
        }
        if (b.phase > 1) {
          after(b, 0.6, () => {
            for (let k = 0; k < 4; k++) {
              shot(b, b.px + b.facing * 26, b.py - b.h * 0.16, p.centerX + (k - 2) * 34, p.centerY, 640, {
                radius: 4,
                color: 0xe8f0f0,
                life: 1.2,
                damage: b.damage * 0.22,
              })
            }
          })
        }
        spark(b, b.px + b.facing * 30, b.py - b.h * 0.2, A, 10, 180)
        sfx(b, 'weld', 0.4, 1.4)
      },
    },
    shp_weld_arc: {
      name: '焊弧',
      en: 'WELD ARC',
      wind: 0.46,
      cool: 2.3,
      range: [0, 430],
      exec() {
        const p = b.player
        if (!p) return
        const pts = [p.centerX, p.centerX + 90, p.centerX - 90, p.centerX + 40]
        pts.forEach((tx, k) => {
          after(b, k * 0.12, () => {
            const x = clampW(b, tx)
            sparkLine(b, x - 26, feetY(b) - 30, x + 26, feetY(b) - 30, 0xfff0a0, 7, 150)
            burst(b, x, feetY(b), 58, {
              color: 0xfff0a0,
              sparks: 8,
              damage: b.damage * 0.35,
              sound: false,
              shake: 0.12,
            })
          })
        })
        sfx(b, 'weld', 0.4, 1.1)
      },
    },
    shp_hull_slam: {
      name: '船骨重压',
      en: 'HULL SLAM',
      wind: 0.62,
      cool: 2.8,
      range: [0, 270],
      exec() {
        const x = clampW(b, b.px + b.facing * 62)
        mark(b, x, feetY(b), 96, A, 0.45)
        after(b, 0.45, () => {
          burst(b, x, feetY(b), b.phase > 1 ? 170 : 140, {
            color: A,
            sparks: 20,
            damage: b.damage * 0.9,
          })
          groundWave(b, b.facing, 420, { radius: 12, color: A, damage: b.damage * 0.45 })
          if (b.phase > 1) {
            groundWave(b, -b.facing, 420, { radius: 12, color: A, damage: b.damage * 0.45 })
          }
        })
      },
    },
    shp_forge_call: {
      name: '船坞增援',
      en: 'FORGE CALL',
      wind: 0.88,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 54 })
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 90)
          mark(b, x, feetY(b), 36, 0xfff0a0, 0.4 + k * 0.12)
          after(b, 0.4 + k * 0.12, () => {
            spark(b, x, feetY(b) - 24, 0xfff0a0, 8, 120)
          })
        }
        sfx(b, 'radio', 0.4, 0.9)
      },
    },
  }
}

// ============================================================ 32 坞架机
function bossKit_drydockRig(b) {
  const A = b.accent
  return {
    dr_keel_hoist: {
      name: '龙骨吊装',
      en: 'KEEL HOIST',
      sig: true,
      wind: 0.76,
      cool: 3.4,
      range: [140, 1200],
      exec() {
        const p = b.player
        if (!p) return
        mark(b, p.centerX, feetY(b), 80, A, 0.7)
        sparkLine(b, b.px, b.py - b.h * 1.1, p.centerX, p.centerY - 260, A, 7, 90)
        after(b, 0.7, () => {
          lob(b, p.centerX, feetY(b) - 8, {
            t: 0.28,
            x: p.centerX,
            y: p.body.y - 340,
            gravity: 1400,
            radius: 16,
            color: A,
            damage: b.damage * 0.8,
          })
          burst(b, p.centerX, feetY(b), 120, { color: A, sparks: 18, damage: b.damage * 0.6 })
          groundWave(b, p.centerX >= b.px ? 1 : -1, 360, {
            radius: 12,
            color: A,
            damage: b.damage * 0.4,
          })
        })
        if (b.phase > 1) {
          const tx2 = clampW(b, p.centerX + 180)
          mark(b, tx2, feetY(b), 70, A, 1)
          after(b, 1, () => burst(b, tx2, feetY(b), 110, { color: A, sparks: 14, damage: b.damage * 0.55 }))
        }
        sfx(b, 'weld', 0.4, 0.7)
      },
    },
    dr_rig_arm_sweep: {
      name: '坞臂横扫',
      en: 'RIG ARM SWEEP',
      wind: 0.5,
      cool: 2.3,
      range: [0, 330],
      exec() {
        for (const dir of [-1, 1]) {
          groundWave(b, dir, b.phase > 1 ? 460 : 400, { radius: 13, color: A, damage: b.damage * 0.6 })
        }
        const y = b.py - b.h * 0.3
        for (let k = 0; k < (b.phase > 1 ? 6 : 4); k++) {
          b._bullet({
            x: b.px,
            y: y + (k - 1.5) * 26,
            vx: b.facing * 360,
            vy: 0,
            radius: 7,
            color: A,
            damage: b.damage * 0.35,
            life: 1.4,
          })
        }
        shake(b, 0.4)
        sfx(b, 'thunder', 0.35, 1.4)
      },
    },
    dr_bolt_rain: {
      name: '螺栓雨',
      en: 'BOLT RAIN',
      wind: 0.56,
      cool: 2.5,
      range: [250, 1500],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 9 : 6
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (Math.random() - 0.5) * 320)
          mark(b, tx, feetY(b), 26, A, 0.3 + k * 0.08)
          after(b, 0.3 + k * 0.08, () => {
            b._bullet({
              x: tx,
              y: p.body.y - 380 - Math.random() * 120,
              vx: 0,
              vy: 320,
              gravity: 900,
              radius: 4,
              color: A,
              damage: b.damage * 0.3,
              life: 2.4,
            })
          })
        }
        sfx(b, 'scan', 0.35, 0.7)
      },
    },
    dr_skeleton_crew: {
      name: '骨架班组',
      en: 'SKELETON CREW',
      wind: 0.9,
      cool: 10.5,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 108, gap: 50 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 116)
          mark(b, x, feetY(b), 42, A, 0.5 + k * 0.2)
          after(b, 0.5 + k * 0.2, () => {
            burst(b, x, feetY(b), 60, {
              color: A,
              sparks: 8,
              damage: b.damage * 0.3,
              shake: 0.15,
              sound: false,
            })
          })
        }
      },
    },
  }
}

// ============================================================ 33 过载变电体
function bossKit_substation(b) {
  const A = b.accent
  return {
    ss_arc_jump: {
      name: '电弧跳线',
      en: 'ARC JUMP',
      sig: true,
      wind: 0.56,
      cool: 2.7,
      range: [100, 1200],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 6 : 4
        let x0 = b.px
        let y0 = b.py - b.h * 0.2
        for (let k = 1; k <= n; k++) {
          const tx = p.centerX + (k % 2 ? 34 : -34) * Math.ceil(k / 2)
          const ty = p.centerY - 10
          const px0 = x0
          const py0 = y0
          after(b, k * 0.1, () => {
            sparkLine(b, px0, py0, tx, ty, A, 8, 170)
            mark(b, clampW(b, tx), feetY(b), 38, A, 0.3)
            b._bullet({
              x: clampW(b, tx),
              y: ty,
              vx: 0,
              vy: 0,
              radius: 10,
              color: A,
              damage: b.damage * 0.4,
              life: 0.4,
            })
          })
          x0 = tx
          y0 = ty
        }
        if (b.phase > 1) {
          after(b, 0.8, () => {
            for (let k = 0; k < 6; k++) {
              shot(b, b.px, b.py - b.h * 0.2, p.centerX + (k - 3) * 60, p.centerY - 30, 520, {
                radius: 3,
                color: 0xd0f8ff,
                life: 1.2,
                damage: b.damage * 0.3,
              })
            }
          })
        }
        sfx(b, 'alarm', 0.4, 1.5)
      },
    },
    ss_overload_pulse: {
      name: '过载脉冲',
      en: 'OVERLOAD PULSE',
      wind: 0.62,
      cool: 3,
      range: [0, 520],
      exec() {
        const waves = b.phase > 1 ? 4 : 3
        for (let k = 0; k < waves; k++) {
          after(b, k * 0.24, () => {
            ring(b, b.phase > 1 ? 12 : 9, 240 + k * 40, {
              radius: 5,
              color: A,
              damage: b.damage * 0.3,
              life: 1.5,
              offset: k * 0.27,
            })
          })
        }
        spark(b, b.px, b.py - b.h * 0.25, A, 22, 300)
        shake(b, 0.35)
        sfx(b, 'thunder', 0.45, 1.6)
      },
    },
    ss_transformer_hum: {
      name: '变压器嗡鸣',
      en: 'TRANSFORMER HUM',
      wind: 0.5,
      cool: 2.4,
      range: [0, 360],
      exec() {
        const p = b.player
        if (!p) return
        for (let k = 0; k < (b.phase > 1 ? 7 : 5); k++) {
          after(b, k * 0.11, () => {
            const sx = b.px + b.facing * 24
            const sy = b.py - b.h * 0.2
            const a = Math.atan2(p.centerY - sy, p.centerX - sx) + Math.sin(k * 1.7) * 0.18
            b._bullet({
              x: sx,
              y: sy,
              vx: Math.cos(a) * 420,
              vy: Math.sin(a) * 420,
              radius: 6,
              color: 0xd0f8ff,
              damage: b.damage * 0.35,
              life: 1.5,
            })
          })
        }
        aoe(b, b.px, feetY(b), 110, b.damage * 0.4)
        sfx(b, 'alarm', 0.35, 0.7)
      },
    },
    ss_grid_feed: {
      name: '电网供能',
      en: 'GRID FEED',
      wind: 0.88,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 52 })
        for (let k = 0; k < 4; k++) {
          const x = clampW(b, b.px + (k - 1.5) * 88)
          mark(b, x, feetY(b), 34, 0xd0f8ff, 0.4 + k * 0.15)
          after(b, 0.4 + k * 0.15, () => {
            sparkLine(b, x, feetY(b), x, b.py - b.h * 0.9, A, 6, 90)
            shot(b, x, feetY(b) - 30, x, b.py - b.h * 1.2, 300, {
              radius: 3,
              color: 0xd0f8ff,
              damage: b.damage * 0.2,
              life: 1,
            })
          })
        }
      },
    },
  }
}

// ============================================================ 34 堡垒司令
function bossKit_bunkerCommander(b) {
  const A = b.accent
  return {
    bc_blast_door: {
      name: '防爆门',
      en: 'BLAST DOOR',
      sig: true,
      wind: 0.74,
      cool: 3.2,
      range: [0, 440],
      exec() {
        const p = b.player
        if (!p) return
        const tx = clampW(b, b.facing > 0 ? p.centerX - 30 : p.centerX + 30)
        mark(b, tx, feetY(b), 70, A, 0.6, { segments: 4 })
        after(b, 0.6, () => {
          burst(b, tx, feetY(b), b.phase > 1 ? 168 : 140, {
            color: A,
            sparks: 20,
            damage: b.damage * 0.85,
            dust: 0x4a4e52,
          })
          pushPlayer(b, Math.sign(tx - b.px) || b.facing, 480, 150, 22)
          if (b.phase > 1) {
            const x2 = clampW(b, tx + b.facing * 150)
            mark(b, x2, feetY(b), 54, A, 0.35)
            after(b, 0.35, () => burst(b, x2, feetY(b), 76, { color: A, sparks: 10, damage: b.damage * 0.5 }))
          }
        })
        sfx(b, 'thunder', 0.5, 0.8)
      },
    },
    bc_slit_fire: {
      name: '射界交叉',
      en: 'SLIT FIRE',
      wind: 0.42,
      cool: 2.2,
      range: [200, 1300],
      exec() {
        const p = b.player
        if (!p) return
        const tx = predictX(b, 0.35)
        const ty = p.centerY - 8
        for (const side of [-1, 1]) {
          const sx = clampW(b, b.px + side * 150)
          after(b, side > 0 ? 0.14 : 0, () => {
            for (let k = 0; k < (b.phase > 1 ? 5 : 3); k++) {
              shot(b, sx, b.py - b.h * 0.25 + k * 12, tx, ty + k * 6, 640, {
                radius: 4,
                color: A,
                life: 1.3,
                damage: b.damage * 0.34,
              })
            }
            sparkLine(b, sx, b.py - b.h * 0.2, tx, ty, A, 7, 100)
          })
        }
        sfx(b, 'alarm', 0.35, 1.2)
      },
    },
    bc_grenade_lob: {
      name: '手雷抛掷',
      en: 'GRENADE LOB',
      wind: 0.52,
      cool: 2.4,
      range: [150, 900],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 100)
          mark(b, tx, feetY(b), 54, A, 0.55 + k * 0.12)
          after(b, 0.55 + k * 0.12, () => {
            lob(b, tx, feetY(b) - 6, {
              t: 0.32,
              x: b.px + b.facing * 30,
              y: b.py - b.h * 0.7,
              radius: 8,
              color: A,
              damage: b.damage * 0.5,
            })
            burst(b, tx, feetY(b), 74, {
              color: A,
              sparks: 12,
              damage: b.damage * 0.35,
              sound: false,
              shake: 0.2,
            })
          })
        }
        sfx(b, 'weld', 0.35, 1.1)
      },
    },
    bc_garrison: {
      name: '驻军',
      en: 'GARRISON',
      wind: 0.88,
      cool: 10,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 56 })
        for (let k = 0; k < 3; k++) {
          const x = clampW(b, b.px + (k - 1) * 120)
          mark(b, x, feetY(b), 40, A, 0.45 + k * 0.18)
          after(b, 0.45 + k * 0.18, () => {
            for (let j = 0; j < 2; j++) {
              shot(b, x, feetY(b) - 36, predictX(b, 0.2) + (j - 0.5) * 60, b.py - b.h * 0.2, 460, {
                radius: 3,
                color: A,
                life: 1.2,
                damage: b.damage * 0.25,
              })
            }
          })
        }
      },
    },
  }
}

// ============================================================ 35 矿井工头
function bossKit_mineForeman(b) {
  const A = b.accent
  return {
    mf_headlamp: {
      name: '矿灯锥',
      en: 'HEADLAMP CONE',
      sig: true,
      wind: 0.62,
      cool: 2.9,
      range: [120, 1100],
      exec() {
        const p = b.player
        if (!p) return
        const base = Math.atan2(p.centerY - b.py, p.centerX - b.px)
        const n = b.phase > 1 ? 7 : 5
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * 0.07
          const d = 180 + k * 70
          const tx = clampW(b, b.px + Math.cos(a) * d)
          const ty = b.py + Math.sin(a) * d
          mark(b, tx, feetY(b), 30, 0xffe8a0, 0.28 + k * 0.04)
          after(b, 0.28 + k * 0.04, () => {
            spark(b, tx, ty, 0xffe8a0, 6, 120)
          })
        }
        for (let k = 0; k < 4; k++) {
          b._bullet({
            x: b.px + b.facing * 20,
            y: b.py - b.h * 0.2,
            vx: Math.cos(base + (k - 1.5) * 0.1) * 640,
            vy: Math.sin(base + (k - 1.5) * 0.1) * 640,
            radius: 5,
            color: 0xffe8a0,
            damage: b.damage * 0.4,
            life: 1.4,
          })
        }
        sfx(b, 'scan', 0.4, 0.9)
      },
    },
    mf_gas_pocket: {
      name: '瓦斯囊',
      en: 'GAS POCKET',
      wind: 0.7,
      cool: 3.2,
      range: [0, 720],
      exec() {
        const p = b.player
        if (!p) return
        const n = b.phase > 1 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const tx = clampW(b, p.centerX + (k - (n - 1) / 2) * 110 + (k % 2 ? 24 : -24))
          mark(b, tx, feetY(b), 60, A, 0.5 + k * 0.18)
          after(b, 0.5 + k * 0.18, () => {
            burst(b, tx, feetY(b), b.phase > 1 ? 104 : 84, {
              color: 0xb0a070,
              dust: 0x6a6048,
              sparks: 16,
              damage: b.damage * 0.55,
              sound: false,
            })
            for (let j = 0; j < 3; j++) {
              b._bullet({
                x: tx,
                y: feetY(b) - 30,
                vx: (Math.random() - 0.5) * 120,
                vy: -120 - j * 40,
                gravity: 260,
                radius: 5,
                color: 0xb0a070,
                damage: b.damage * 0.3,
                life: 1.6,
              })
            }
          })
        }
        sfx(b, 'scan', 0.35, 0.6)
      },
    },
    mf_pick_slam: {
      name: '镐击',
      en: 'PICK SLAM',
      wind: 0.52,
      cool: 2.3,
      range: [0, 230],
      exec() {
        const tx = clampW(b, b.px + b.facing * 78)
        mark(b, tx, feetY(b), 84, A, 0.34)
        after(b, 0.34, () => {
          burst(b, tx, feetY(b), b.phase > 1 ? 150 : 126, {
            color: A,
            dust: 0x5a4a3a,
            sparks: 16,
            damage: b.damage * 0.9,
          })
          if (b.phase > 1) {
            for (let k = 0; k < 3; k++) {
              b._bullet({
                x: tx,
                y: feetY(b) - 20,
                vx: (k - 1) * 160,
                vy: -260,
                gravity: 900,
                radius: 6,
                color: A,
                damage: b.damage * 0.3,
                life: 1.6,
              })
            }
          }
        })
      },
    },
    mf_tunnel_rats: {
      name: '坑道鼠群',
      en: 'TUNNEL RATS',
      wind: 0.86,
      cool: 9.6,
      range: [0, 9999],
      exec() {
        summonWave(b, b.phase > 1 ? 4 : 3, { base: 100, gap: 50 })
        const p = b.player
        if (!p) return
        for (let k = 0; k < 4; k++) {
          const tx = clampW(b, p.centerX + b.facing * (60 + k * 70))
          mark(b, tx, feetY(b), 34, A, 0.35 + k * 0.12)
          after(b, 0.35 + k * 0.12, () => {
            burst(b, tx, feetY(b), 48, {
              color: A,
              sparks: 8,
              damage: b.damage * 0.28,
              sound: false,
              shake: 0.12,
            })
          })
        }
        sfx(b, 'radio', 0.4, 1.3)
      },
    },
  }
}
