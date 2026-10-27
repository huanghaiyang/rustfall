// 重启 dev server：
//   1. 找到占用 5180 的旧进程并结束（dev server 用了 strictPort，不腾地方就起不来）
//   2. 等端口释放
//   3. 原地拉起 scripts/dev-server.mjs，日志直接接到当前终端
//
// 用法：
//   npm run restart
//   node scripts/restart-dev.mjs --check   # 只打印占用进程，不杀、不启动
import { execSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import net from 'node:net'

const PORT = 5180
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = join(ROOT, 'scripts', 'dev-server.mjs')
const CHECK_ONLY = process.argv.includes('--check')

/** 端口上正在 LISTEN 的 PID（拿不到返回 null） */
function pidOnPort(port) {
  let out = ''
  try {
    out = execSync('netstat -ano', { encoding: 'utf8', windowsHide: true })
  } catch (e) {
    return null
  }
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue
    const cols = line.trim().split(/\s+/)
    const pid = Number(cols[cols.length - 1])
    if (Number.isFinite(pid) && pid > 0) return pid
  }
  return null
}

/** 端口是否能连上（能连上 = 还被占着） */
function portBusy(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port })
    const done = (busy) => {
      sock.destroy()
      resolve(busy)
    }
    sock.setTimeout(600)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(true))
    sock.once('error', () => done(false))
  })
}

const oldPid = pidOnPort(PORT)
console.log(oldPid ? `[restart] :${PORT} 被 PID ${oldPid} 占用` : `[restart] :${PORT} 空闲`)

if (CHECK_ONLY) {
  process.exit(0)
}

if (oldPid) {
  try {
    execSync(`taskkill /PID ${oldPid} /F /T`, { stdio: 'ignore', windowsHide: true })
    console.log(`[restart] 已结束 PID ${oldPid}`)
  } catch (e) {
    console.error(`[restart] 结束 PID ${oldPid} 失败：${e.message}`)
    process.exit(1)
  }
  // 等端口真正放掉，最多 5 秒
  for (let i = 0; i < 25; i++) {
    if (!(await portBusy(PORT))) break
    await new Promise((r) => setTimeout(r, 200))
  }
  if (await portBusy(PORT)) {
    console.error(`[restart] :${PORT} 仍然被占用，重启中止`)
    process.exit(1)
  }
}

const child = spawn(process.execPath, [SERVER], { cwd: ROOT, stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) console.log(`[restart] dev server 被信号 ${signal} 结束`)
  process.exit(code ?? 0)
})
