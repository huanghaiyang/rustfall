// ============================================================================
// 锈雨 · RUSTFALL —— 骨骼识别用的「AI 蒙版」客户端（可选增强）
// ----------------------------------------------------------------------------
// 本地识别器（skeleton-fit.js）只吃 alpha。如果原图没有干净 alpha（画稿带背景），
// 或者挂着道具跟身体粘在一起需要实例分割，就先用 Hugging Face 的分割/抠图模型
// 出一张蒙版，再喂给本地识别器。
//
// 为什么要经过 dev server 代理，而不是浏览器直连 HF：
//   · HF_TOKEN 不能出现在前端；
//   · HF 推理接口的 CORS/预检对二进制上传不友好；
//   · 代理层能缓存同一张图的结果，避免反复烧额度。
// 没有配置 token / 离线时，这里的每个函数都「软失败」，编辑器自动退回纯本地识别。
// ============================================================================

const AI = '/__editor/ai'

let _statusPromise = null

/** 探测 AI 通道：{ available, provider, model, reason } */
export function aiStatus(force = false) {
  if (_statusPromise && !force) return _statusPromise
  _statusPromise = fetch(`${AI}/status`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((j) => ({ available: !!j.available, provider: j.provider || '', model: j.model || '', reason: j.reason || '' }))
    .catch((e) => ({ available: false, provider: '', model: '', reason: String(e?.message || e) }))
  return _statusPromise
}

let _canvas = null
/** 图集矩形 → PNG dataURL（保持 1:1，不做缩放，蒙版回来再对齐） */
function rectToDataUrl(img, rect) {
  if (!_canvas) _canvas = document.createElement('canvas')
  const w = Math.max(1, Math.round(rect.w))
  const h = Math.max(1, Math.round(rect.h))
  _canvas.width = w
  _canvas.height = h
  const ctx = _canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, rect.x, rect.y, w, h, 0, 0, w, h)
  return { url: _canvas.toDataURL('image/png'), w, h }
}

/**
 * 请求一张分割蒙版，并把它对齐成 rect.w × rect.h 的 alpha 掩码。
 * @param {{sheet:object, rect:{x,y,w,h}}} args
 * @returns {Promise<{ok:boolean, alpha?:Uint8Array, w?:number, h?:number, model?:string, ms?:number, reason?:string}>}
 */
export async function aiSegment({ sheet, rect }) {
  const st = await aiStatus()
  if (!st.available) return { ok: false, reason: st.reason || 'AI 通道不可用' }
  const img = await loadImage(sheet?.src)
  if (!img) return { ok: false, reason: '图集解码失败' }
  const shot = rectToDataUrl(img, rect)
  let res
  try {
    const r = await fetch(`${AI}/segment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: shot.url, w: shot.w, h: shot.h }),
    })
    res = await r.json()
  } catch (e) {
    return { ok: false, reason: '请求失败：' + String(e?.message || e) }
  }
  if (!res?.ok || !res.mask) return { ok: false, reason: res?.reason || 'AI 返回空蒙版' }

  const maskImg = await loadImage(res.mask)
  if (!maskImg) return { ok: false, reason: '蒙版解码失败' }
  const cv = document.createElement('canvas')
  cv.width = shot.w
  cv.height = shot.h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, shot.w, shot.h)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(maskImg, 0, 0, maskImg.naturalWidth, maskImg.naturalHeight, 0, 0, shot.w, shot.h)
  const data = ctx.getImageData(0, 0, shot.w, shot.h).data
  const alpha = new Uint8Array(shot.w * shot.h)
  for (let i = 0; i < alpha.length; i++) {
    // 蒙版可能是灰度（前景白）也可能是带 alpha 的 RGBA，两种都认
    const a = data[i * 4 + 3]
    const lum = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114)
    alpha[i] = a < 250 ? a : Math.round(lum)
  }
  return { ok: true, alpha, w: shot.w, h: shot.h, model: res.model || st.model, ms: res.ms }
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null)
      return
    }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}
