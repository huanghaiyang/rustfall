import fs from "node:fs"
const f = "src/game/game.js"
let s = fs.readFileSync(f, "utf8")
const ok = (n, c) => console.log((c ? "OK  " : "FAIL") + n)

if (!s.includes("spawnRoomWeapons")) {
  s = s.replace(`    this.ecosystem?.clear?.()`, `    this.spawnRoomWeapons(data)
    this.ecosystem?.clear?.()`)
  s = s.replace(`  // ================================================================ 战斗 / 掉落`, `  /** 房间里散落的武器 + 对应弹药（世界生成器的 data.weapons） */
  spawnRoomWeapons(data) {
    const list = Array.isArray(data.weapons) ? data.weapons : []
    for (const w of list) {
      const def = Content.get(KIND.ITEM, w.id)
      if (!def) continue
      const flag = \`weapon:\${this.roomId}:\${w.id}:\${Math.round(w.x)}:\${Math.round(w.y)}\`
      if (G.flags[flag]) continue
      G.flags[flag] = true
      const drop = new LootDrop(this, w.id, w.x, w.y, {})
      this.room.lootDrops.push(drop)
      this.room.group.add(drop.group)
      this.room.interactables.push({
        kind: 'loot',
        x: w.x,
        y: w.y,
        radius: 46,
        drop,
        label: def.name,
      })
      // 弹药：按武器类型配一小包
      const ammoId = /laser|arc|rail/.test(w.id)
        ? 'ammo_laser'
        : /nail/.test(w.id)
          ? 'ammo_nail'
          : /scrap/.test(w.id)
            ? 'ammo_scrap'
            : 'ammo_9mm'
      if (Content.get(KIND.ITEM, ammoId)) {
        const ammo = new LootDrop(this, ammoId, w.x + 18, w.y, {})
        this.room.lootDrops.push(ammo)
        this.room.group.add(ammo.group)
      }
    }
  }

  // ================================================================ 战斗 / 掉落`)
  fs.writeFileSync(f, s)
  ok(" spawnRoomWeapons", true)
} else ok(" spawnRoomWeapons", true)
