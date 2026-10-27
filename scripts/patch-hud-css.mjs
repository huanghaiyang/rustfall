import fs from "node:fs"
const f="src/style.css"; let s=fs.readFileSync(f,"utf8")
if(!s.includes(".hud-weapon")){
  s=s.replace("/* 通知流 */", `/* 武器 / 弹药 */
.hud-weapon {
  position: absolute;
  right: 24px;
  bottom: 64px;
  padding: 6px 12px;
  border-right: 2px solid rgba(143, 232, 255, 0.45);
  background: linear-gradient(90deg, transparent, rgba(8, 6, 5, 0.7));
  text-align: right;
  min-width: 150px;
}
.hw-name {
  font-family: var(--font-title);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--c-bone);
}
.hw-line {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--c-bone-dark);
}
.hw-reload {
  color: var(--c-neon-warm);
}
.hw-bad {
  color: #e08a7a;
}

/* 通知流 */`)
  fs.writeFileSync(f,s); console.log("hud weapon css ok")
} else console.log("css exists")
