// 轻量静态服务器：预览 dist 产物（SPA 回退到 index.html）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('dist')
const PORT = Number(process.env.PORT || 4180)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

if (!fs.existsSync(ROOT)) {
  console.error('dist 不存在，请先运行 npm run build')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  let file = path.join(ROOT, url === '/' ? 'index.html' : url)
  if (!file.startsWith(ROOT)) {
    res.writeHead(403)
    return res.end('forbidden')
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, 'index.html')
  }
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`preview: http://127.0.0.1:${PORT}`)
})
