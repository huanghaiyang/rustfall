// ============================================================================
// 编辑数据落盘插件（Vite dev server 中间件）
// ----------------------------------------------------------------------------
// 浏览器页面写不了任意磁盘路径，所以把「写文件」这一步交给 dev server：
// 编辑器用 fetch 打这几个接口，服务器把钱写成 workspace 里的真实文件。
//
//   GET    /__editor/sprite/ping          → { ok, dir, fileApi: 'disk' }
//   GET    /__editor/sprite/project       → 工程 JSON（没有则 204）
//   POST   /__editor/sprite/project       → 覆盖写工程（自动备份上一版 project.prev.json）
//   GET    /__editor/sprite/history       → 历史 meta 列表（时间倒序，只读 index.json）
//   POST   /__editor/sprite/history       → { meta, project } 写一条快照
//   GET    /__editor/sprite/history/:id   → { meta, project }
//   DELETE /__editor/sprite/history/:id   → 删一条
//   DELETE /__editor/sprite/history       → 清空
//   GET    /__editor/blob                 → { names: [...] }
//   GET    /__editor/blob/:name           → 任意 JSON 快照（房间编辑器等）
//   PUT/POST /__editor/blob/:name         → 写
//   DELETE /__editor/blob/:name           → 删
//   GET    /__editor/ai/status            → { available, provider, model, reason }
//   POST   /__editor/ai/segment           → { image: dataURL } → { ok, mask, model, ms }
//
// 落盘位置：<root>/editor-data/
//   sprite-editor/project.json      当前精灵工程（自包含：sheet 的 dataURL 就在里面）
//   sprite-editor/project.prev.json 上一版工程（每次覆盖前的备份）
//   sprite-editor/history/index.json   历史索引（meta，不含 payload）
//   sprite-editor/history/<id>.json    单条快照（{ meta, project } 自包含）
//   blobs/<name>.json               通用 JSON 快照（房间编辑器工程 + 地形/背景表）
//   ai-config.json                  { token, model, endpoint }（可选，落盘这一份就够）
//
// Hugging Face 分割蒙版（可选增强，给骨骼识别提供干净 alpha）：
//   · 配置：环境变量 HF_TOKEN（或 editor-data/ai-config.json 里的 token）
//   · 模型：HF_SEG_MODEL / ai-config.model，默认 briaai/RMBG-1.4（抠图/前景蒙版）
//   · 没配 token 或连不上时，/status 返回 available:false + 具体原因，
//     编辑器自动退回「纯本地几何识别」，不会报错也不会卡住。
//
// 几个刻意的选择：
//   · 快照自包含（把 dataURL 一起写进去）：单个文件可拷走 / 可归档，恢复时不依赖别的文件。
//   · 先写 .tmp 再 rename：中途断电不会留下半截 JSON。
//   · index.json 与快照文件不放在同一个事务里没意义，所以写盘统一串行（一个 promise 链）。
//   · 只允许 localhost 访问；id 必须过 ^[A-Za-z0-9_-]+$，防路径穿越。
//   · 单请求体上限 64MB（一份工程 0.4~1MB，留足余量但不至于被打爆）。
// ============================================================================
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const API = '/__editor/sprite'
const BLOB_API = '/__editor/blob'
const MAX_BODY = 64 * 1024 * 1024

/** 写盘串行队列：index.json 的读-改-写不能并发。 */
function makeQueue() {
  let tail = Promise.resolve()
  return (job) => {
    const p = tail.then(job, job)
    tail = p.catch(() => {})
    return p
  }
}

async function ensureDir(dir) {
  await fs.mkdir(path.join(dir, 'history'), { recursive: true })
}

async function readJson(file, dflt = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (e) {
    return dflt
  }
}

/** 原子写：先写 .tmp 再 rename（同目录内 rename 是原子的）。 */
async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isLocal(req) {
  const host = String(req.headers.host || '')
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

export function editorFsPlugin(opts = {}) {
  const root = opts.root || process.cwd()
  const dir = opts.dir || path.join(root, 'editor-data', 'sprite-editor')
  const historyDir = () => path.join(dir, 'history')
  const projectFile = () => path.join(dir, 'project.json')
  const projectPrevFile = () => path.join(dir, 'project.prev.json')
  const indexFile = () => path.join(historyDir(), 'index.json')
  const snapshotFile = (id) => path.join(historyDir(), `${id}.json`)
  const run = makeQueue()

  async function readIndex() {
    const list = await readJson(indexFile(), [])
    return Array.isArray(list) ? list : []
  }

  async function handle(req, res, url) {
    if (!isLocal(req)) {
      sendJson(res, 403, { error: 'local only' })
      return
    }
    const p = url.pathname.slice(API.length) || '/'
    const method = (req.method || 'GET').toUpperCase()

    // --- ping ---
    if (p === '/ping' && method === 'GET') {
      await ensureDir(dir)
      sendJson(res, 200, { ok: true, dir: dir.replace(/\\/g, '/'), blobDir: path.join(root, 'editor-data', 'blobs').replace(/\\/g, '/'), fileApi: 'disk', maxBody: MAX_BODY })
      return
    }

    // --- 当前工程 ---
    if (p === '/project') {
      if (method === 'GET') {
        const proj = await readJson(projectFile(), null)
        if (!proj) {
          res.statusCode = 204
          res.end()
          return
        }
        sendJson(res, 200, proj)
        return
      }
      if (method === 'POST' || method === 'PUT') {
        const text = await readBody(req)
        const data = JSON.parse(text)
        const saved = await run(async () => {
          await ensureDir(dir)
          const prev = await readJson(projectFile(), null)
          if (prev) await writeJsonAtomic(projectPrevFile(), prev)
          await writeJsonAtomic(projectFile(), data)
          return { bytes: JSON.stringify(data).length, at: new Date().toISOString() }
        })
        sendJson(res, 200, { ok: true, ...saved })
        return
      }
      sendJson(res, 405, { error: 'method not allowed' })
      return
    }

    // --- 历史 ---
    if (p === '/history') {
      if (method === 'GET') {
        const list = await readIndex()
        list.sort((a, b) => (a.at < b.at ? 1 : -1))
        sendJson(res, 200, list)
        return
      }
      if (method === 'POST') {
        const text = await readBody(req)
        const { meta, project } = JSON.parse(text)
        if (!meta?.id || !SAFE_ID.test(meta.id)) {
          sendJson(res, 400, { error: 'bad id' })
          return
        }
        const result = await run(async () => {
          await ensureDir(dir)
          const list = await readIndex()
          await writeJsonAtomic(snapshotFile(meta.id), { meta, project })
          const next = [meta, ...list.filter((m) => m.id !== meta.id)]
          await writeJsonAtomic(indexFile(), next)
          return { total: next.length }
        })
        sendJson(res, 200, { ok: true, id: meta.id, ...result })
        return
      }
      if (method === 'DELETE') {
        const result = await run(async () => {
          let n = 0
          try {
            const files = await fs.readdir(historyDir())
            for (const f of files) {
              if (f === 'index.json' || !f.endsWith('.json')) continue
              await fs.rm(path.join(historyDir(), f), { force: true })
              n++
            }
          } catch (e) { /* 目录不存在 */ }
          await writeJsonAtomic(indexFile(), [])
          return { removed: n }
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }
      sendJson(res, 405, { error: 'method not allowed' })
      return
    }

    if (p.startsWith('/history/')) {
      const id = p.slice('/history/'.length)
      if (!SAFE_ID.test(id)) {
        sendJson(res, 400, { error: 'bad id' })
        return
      }
      if (method === 'GET') {
        const rec = await readJson(snapshotFile(id), null)
        if (!rec) {
          sendJson(res, 404, { error: 'not found' })
          return
        }
        sendJson(res, 200, rec)
        return
      }
      if (method === 'DELETE') {
        const result = await run(async () => {
          await fs.rm(snapshotFile(id), { force: true })
          const list = await readIndex()
          const next = list.filter((m) => m.id !== id)
          await writeJsonAtomic(indexFile(), next)
          return { total: next.length }
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }
      sendJson(res, 405, { error: 'method not allowed' })
      return
    }

    sendJson(res, 404, { error: 'not found' })
  }

  return {
    name: 'rustfall-editor-fs',
    apply: 'serve',
    configureServer(server) {
      // ---- 通用 JSON 快照（房间编辑器等）------------------------------------
      const blobDir = path.join(root, 'editor-data', 'blobs')
      const blobFile = (name) => path.join(blobDir, `${name}.json`)
      const BLOB_NAME = /^[A-Za-z0-9_.-]{1,64}$/

      async function handleBlob(req, res, url) {
        if (!isLocal(req)) {
          sendJson(res, 403, { error: 'local only' })
          return
        }
        const name = decodeURIComponent(url.pathname.slice(BLOB_API.length).replace(/^\//, ''))
        const method = (req.method || 'GET').toUpperCase()
        if (!name) {
          if (method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          let names = []
          try {
            const files = await fs.readdir(blobDir)
            names = files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
          } catch (e) { /* 目录不存在 */ }
          sendJson(res, 200, { names })
          return
        }
        if (!BLOB_NAME.test(name)) {
          sendJson(res, 400, { error: 'bad name' })
          return
        }
        if (method === 'GET') {
          const data = await readJson(blobFile(name), null)
          if (!data) {
            res.statusCode = 204
            res.end()
            return
          }
          sendJson(res, 200, data)
          return
        }
        if (method === 'POST' || method === 'PUT') {
          const text = await readBody(req)
          const data = JSON.parse(text)
          const out = await run(async () => {
            await fs.mkdir(blobDir, { recursive: true })
            await writeJsonAtomic(blobFile(name), data)
            return { bytes: text.length, at: new Date().toISOString() }
          })
          sendJson(res, 200, { ok: true, name, ...out })
          return
        }
        if (method === 'DELETE') {
          await run(() => fs.rm(blobFile(name), { force: true }))
          sendJson(res, 200, { ok: true })
          return
        }
        sendJson(res, 405, { error: 'method not allowed' })
      }

      // ---- Hugging Face 分割蒙版（可选增强）--------------------------------
      // 目的：给「骨骼智能识别」提供一张干净的前景蒙版（画稿带背景 / 道具与身体粘连时）。
      // 不做姿态估计 —— 那类模型（COCO 关键点）训练分布是真人照片，喂像素机甲只会得到离谱的点。
      const AI_API = '/__editor/ai'
      const aiCache = new Map() // key = sha1(image)，最多留 12 张
      const DEFAULT_MODEL = 'briaai/RMBG-1.4'
      const DEFAULT_ENDPOINT = 'https://router.huggingface.co/hf-inference/models/'

      async function aiConfig() {
        let cfg = {}
        try {
          cfg = await readJson(path.join(root, 'editor-data', 'ai-config.json'), {}) || {}
        } catch (e) { /* 没有配置文件 */ }
        const token = process.env.HF_TOKEN || cfg.token || ''
        const model = process.env.HF_SEG_MODEL || cfg.model || DEFAULT_MODEL
        const endpoint = process.env.HF_ENDPOINT || cfg.endpoint || DEFAULT_ENDPOINT
        let reason = ''
        if (!token) reason = '未配置 HF_TOKEN（环境变量或 editor-data/ai-config.json）'
        return { token, model, endpoint, reason, available: !!token }
      }

      async function handleAi(req, res, url) {
        if (!isLocal(req)) {
          sendJson(res, 403, { error: 'local only' })
          return
        }
        const p = url.pathname.slice(AI_API.length) || '/'
        const method = (req.method || 'GET').toUpperCase()
        const cfg = await aiConfig()

        if (p === '/status' && method === 'GET') {
          sendJson(res, 200, {
            available: cfg.available,
            provider: 'huggingface',
            model: cfg.model,
            endpoint: cfg.endpoint,
            reason: cfg.reason,
          })
          return
        }

        if (p === '/segment' && method === 'POST') {
          if (!cfg.available) {
            sendJson(res, 200, { ok: false, reason: cfg.reason })
            return
          }
          const text = await readBody(req, 32 * 1024 * 1024)
          let body
          try {
            body = JSON.parse(text)
          } catch (e) {
            sendJson(res, 400, { ok: false, reason: 'body 不是合法 JSON' })
            return
          }
          const dataUrl = String(body?.image || '')
          const m = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
          if (!m) {
            sendJson(res, 400, { ok: false, reason: 'image 需要 data:image/png;base64,…' })
            return
          }
          const bytes = Buffer.from(m[2], 'base64')
          const key = `${cfg.model}|${bytes.length}|${crypto.createHash('sha1').update(bytes).digest('hex')}`
          if (aiCache.has(key)) {
            sendJson(res, 200, { ...aiCache.get(key), cached: true })
            return
          }
          const t0 = Date.now()
          try {
            const r = await fetch(cfg.endpoint + cfg.model, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${cfg.token}`,
                'content-type': m[1] === 'png' ? 'image/png' : `image/${m[1]}`,
                accept: 'image/png',
                'x-wait-for-model': 'true',
              },
              body: bytes,
            })
            const ctype = r.headers.get('content-type') || ''
            if (!r.ok) {
              let detail = ''
              try {
                detail = (await r.text()).slice(0, 300)
              } catch (e) { /* ignore */ }
              const reason =
                r.status === 401 || r.status === 403
                  ? `HF token 无效或无权限（HTTP ${r.status}）`
                  : r.status === 503
                    ? 'HF 模型正在加载，稍后重试（HTTP 503）'
                    : `HF 返回 HTTP ${r.status} ${detail}`
              sendJson(res, 200, { ok: false, reason })
              return
            }
            if (!ctype.includes('image')) {
              const txt = (await r.text()).slice(0, 300)
              sendJson(res, 200, { ok: false, reason: `HF 返回的不是图片（${ctype}）：${txt}` })
              return
            }
            const buf = Buffer.from(await r.arrayBuffer())
            const out = {
              ok: true,
              mask: `data:image/png;base64,${buf.toString('base64')}`,
              model: cfg.model,
              ms: Date.now() - t0,
            }
            aiCache.set(key, out)
            while (aiCache.size > 12) aiCache.delete(aiCache.keys().next().value)
            sendJson(res, 200, out)
          } catch (e) {
            sendJson(res, 200, {
              ok: false,
              reason: `连不上 Hugging Face（${String(e?.message || e)}）；已退回本地识别`,
            })
          }
          return
        }

        sendJson(res, 404, { error: 'not found' })
      }

      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (url.startsWith(AI_API)) {
          let parsed
          try {
            parsed = new URL(url, 'http://127.0.0.1')
          } catch (e) {
            return next()
          }
          handleAi(req, res, parsed).catch((e) => {
            try {
              sendJson(res, 500, { ok: false, error: String(e?.message || e) })
            } catch (e2) { /* 响应已结束 */ }
          })
          return
        }
        if (url.startsWith(BLOB_API)) {
          let parsed
          try {
            parsed = new URL(url, 'http://127.0.0.1')
          } catch (e) {
            return next()
          }
          handleBlob(req, res, parsed).catch((e) => {
            try {
              sendJson(res, 500, { error: String(e?.message || e) })
            } catch (e2) { /* 响应已结束 */ }
          })
          return
        }
        if (!url.startsWith(API)) return next()
        let parsed
        try {
          parsed = new URL(url, 'http://127.0.0.1')
        } catch (e) {
          return next()
        }
        handle(req, res, parsed).catch((e) => {
          try {
            sendJson(res, 500, { error: String(e?.message || e) })
          } catch (e2) { /* 响应已结束 */ }
        })
      })
      server.config.logger.info(`[editor-fs] 编辑数据落盘目录: ${dir}`)
    },
  }
}

export default editorFsPlugin
