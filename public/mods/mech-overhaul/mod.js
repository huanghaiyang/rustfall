// 逻辑 mod 示例：不使用任何 import，只依赖传入的 api。
// 这样在 dev 与生产构建里都能被动态 import 执行。
export default function register(api) {
  const { BaseMonster, THREE } = api

  // —— 自定义怪物：废料猎犬 ——
  const DEF = {
    id: 'mod_scraphound',
    name: '废料猎犬',
    en: 'SCRAPHOUND',
    family: 'rogue',
    hp: 48,
    speed: 92,
    damage: 14,
    size: [46, 30],
    aggro: 340,
    attackRange: 74,
    attackType: 'lunge',
    xp: 8,
    loot: [
      { id: 'scrap_plate', chance: 0.8, min: 1, max: 2 },
      { id: 'copper_wire', chance: 0.5, min: 1, max: 2 },
    ],
    artId: 'scrapper',
    sound: 'growl',
    biome: ['city', 'dump'],
    desc: 'mod 追加的猎犬型废料机器人，会绕着猎物打转。',
  }

  class Scraphound extends BaseMonster {
    constructor(game, x, y) {
      super(game, DEF, x, y)
      this.orbit = Math.random() * Math.PI * 2
      this.orbitDir = 1
    }
    updateBehavior(dt) {
      const p = this.player
      if (!p || p.dead) {
        this.vxTarget = 0
        return
      }
      const d = this.distToPlayer()
      if (d < this.aggro && this.hasLineOfSight(p.centerX, p.centerY)) {
        this.orbit += dt * this.orbitDir * 1.6
        const side = Math.sin(this.orbit) > 0 ? 1 : -1
        this.facing = p.centerX >= this.px ? 1 : -1
        this.vxTarget = this.facing * this.speed + side * 20
        this.state = 'chase'
        this.tryAttack()
      } else {
        this.vxTarget = this.facing * this.speed * 0.4
        if (this.wallAhead() || !this.groundAhead()) this.facing *= -1
      }
      this.playAnim(this.state === 'chase' ? 'run' : 'idle')
    }
    performAttack() {
      this.hitPlayer(this.damage)
      this.game.particles?.emitMany?.('spark', this.px, this.py, 4)
    }
    buildExtraVisual() {
      // 一点红色扫描视线，纯代码生成，不依赖贴图
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff5644,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      this.scanLine = new THREE.Mesh(new THREE.PlaneGeometry(80, 3), mat)
      this.scanLine.position.z = 3
      this.group.add(this.scanLine)
    }
  }

  api.registerMonsterClass('mod_scraphound', Scraphound, DEF)

  // —— 开局提示（如果有 UI 通知事件） ——
  api.on('game:start', () => {
    console.log('[mod] 机体重制已加载：STRIDER-9 与 废料猎犬 可用')
  })

  api.log('mech-overhaul loaded')
}
