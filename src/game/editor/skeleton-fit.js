// ============================================================================
// 锈雨 · RUSTFALL —— 骨骼 / 碰撞体「智能识别」
// ----------------------------------------------------------------------------
// 输入一张精灵帧的 alpha（或一张外部蒙版，比如 Hugging Face 分割出来的），
// 输出一套可直接落库的骨骼 + 碰撞体，以及每个部件的置信度。
//
// 为什么是「几何分析」而不是直接上姿态估计模型：
//   这批美术是**侧面像素机甲**（数据执政官：机柜躯干 + 两条细腿 + 提箱子的手），
//   人像姿态模型（COCO 关键点）训练分布完全不同，喂进去只会得到离谱的关键点。
//   真正靠谱的信号只有轮廓本身：厚度场 + 投影剖面 + 连通区域。
//   所以主路径是确定性的几何识别（离线、可复现、可单测），
//   Hugging Face 只在「需要干净蒙版」时作为可选增强（见 ai-mask / dev server 的 /__editor/ai）。
//
// 算法（全部是对 alpha 掩码的确定性运算）：
//   1. 掩码 + 包围盒 + 面积/质心
//   2. 厚度场：倒角距离变换（chamfer 3-4 两遍扫描）→ 每个像素到背景的距离
//   3. 躯干块：厚度 ≥ 0.5×最大厚度的最大连通块（机柜/胸腔就是最厚的部分）
//   4. 髋线：从躯干底往下扫，宽度持续小于躯干 75% 的那一行
//   5. 腿：髋线以下按列投影聚类 → 前/后两条腿，各取髋点 / 膝点 / 踝点 / 脚尖
//   6. 手臂：躯干高度带内、躯干左右外侧的突起 → 肩/肘/手/指尖
//   7. 头：躯干以上那段 → 头顶；再上面是顶饰（数据执政官的线缆丛）
//   8. 道具：髋线以下、腿聚类以外的区域（提着的箱子）
//   9. 按 rigs.js 的构型把锚点拼成骨头；碰撞体用检测到的框，再算覆盖率
//
// 坐标系与帧像素一致（原点 = 帧左上角，y 向下）。
// ============================================================================

import { assembleRig, assembleShapes, rigForFamily } from './rigs.js'

const INF = 1e9

// ---------------------------------------------------------------------------
// 基础图像运算
// ---------------------------------------------------------------------------

/** alpha → 0/1 掩码 */
export function maskFromAlpha(alpha, w, h, threshold = 128) {
  const m = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) m[i] = alpha[i] >= threshold ? 1 : 0
  return m
}

export function maskBBox(mask, w, h) {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  let area = 0
  let sx = 0
  let sy = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      area++
      sx += x
      sy += y
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return { empty: true, area: 0 }
  return {
    empty: false,
    x0,
    y0,
    x1,
    y1,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    area,
    cx: area ? sx / area : 0,
    cy: area ? sy / area : 0,
  }
}

/** 倒角距离变换（3-4 度量），返回值 ≈ 到背景的像素距离 */
export function distanceTransform(mask, w, h) {
  const dist = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) dist[i] = mask[i] ? INF : 0
  // 正向
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      let d = dist[i]
      if (x > 0) d = Math.min(d, dist[i - 1] + 3)
      if (y > 0) {
        d = Math.min(d, dist[i - w] + 3)
        if (x > 0) d = Math.min(d, dist[i - w - 1] + 4)
        if (x < w - 1) d = Math.min(d, dist[i - w + 1] + 4)
      }
      dist[i] = d
    }
  }
  // 反向
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!mask[i]) continue
      let d = dist[i]
      if (x < w - 1) d = Math.min(d, dist[i + 1] + 3)
      if (y < h - 1) {
        d = Math.min(d, dist[i + w] + 3)
        if (x < w - 1) d = Math.min(d, dist[i + w + 1] + 4)
        if (x > 0) d = Math.min(d, dist[i + w - 1] + 4)
      }
      dist[i] = d
    }
  }
  const out = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? dist[i] / 3 : 0
  return out
}

/** 8 连通区域标记；返回 { labels, comps:[{id,area,x0,y0,x1,y1,cx,cy}] } */
export function connectedComponents(mask, w, h, minArea = 0) {
  const labels = new Int32Array(w * h) // 0 = 未访问
  const comps = []
  const stack = []
  let next = 1
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue
    const id = next++
    let area = 0
    let x0 = w
    let y0 = h
    let x1 = -1
    let y1 = -1
    let sx = 0
    let sy = 0
    stack.length = 0
    stack.push(start)
    labels[start] = id
    while (stack.length) {
      const p = stack.pop()
      const py = (p / w) | 0
      const px = p - py * w
      area++
      sx += px
      sy += py
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (py < y0) y0 = py
      if (py > y1) y1 = py
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = ny * w + nx
          if (!mask[ni] || labels[ni]) continue
          labels[ni] = id
          stack.push(ni)
        }
      }
    }
    if (area >= minArea) {
      comps.push({ id, area, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: sx / area, cy: sy / area })
    }
  }
  return { labels, comps }
}

// ---------------------------------------------------------------------------
// 轮廓剖面工具
// ---------------------------------------------------------------------------

/** 行投影：每行不透明像素数 / 左右边界 / 连续段数 */
function rowProfile(mask, w, h) {
  const rows = new Array(h)
  for (let y = 0; y < h; y++) {
    let n = 0
    let x0 = -1
    let x1 = -1
    let runs = 0
    let inRun = false
    for (let x = 0; x < w; x++) {
      const on = !!mask[y * w + x]
      if (on) {
        n++
        if (x0 < 0) x0 = x
        x1 = x
        if (!inRun) {
          runs++
          inRun = true
        }
      } else {
        inRun = false
      }
    }
    rows[y] = { y, n, x0, x1, w: x0 < 0 ? 0 : x1 - x0 + 1, runs }
  }
  return rows
}

/** 列投影（只在某行区间内） */
function columnProfile(mask, w, h, y0, y1) {
  const cols = new Array(w)
  for (let x = 0; x < w; x++) {
    let n = 0
    let top = -1
    let bot = -1
    for (let y = y0; y <= y1; y++) {
      if (!mask[y * w + x]) continue
      n++
      if (top < 0) top = y
      bot = y
    }
    cols[x] = { x, n, top, bot }
  }
  return cols
}

/** 把「有值的列」聚成簇（允许 gap 像素的空隙） */
function clusterColumns(cols, gap) {
  const out = []
  let cur = null
  for (const c of cols) {
    if (c.n > 0) {
      if (!cur) cur = { x0: c.x, x1: c.x, n: 0, sum: 0 }
      cur.x1 = c.x
      cur.n += c.n
      cur.sum += c.x * c.n
    } else if (cur) {
      // 允许 gap：看后面 gap 列内还有没有
      let ahead = false
      for (let k = 1; k <= gap; k++) {
        const nx = c.x + k
        if (nx < cols.length && cols[nx].n > 0) {
          ahead = true
          break
        }
      }
      if (!ahead) {
        out.push(cur)
        cur = null
      }
    }
  }
  if (cur) out.push(cur)
  return out.map((c) => ({ ...c, cx: c.n ? c.sum / c.n : (c.x0 + c.x1) / 2, w: c.x1 - c.x0 + 1 }))
}

/** 某矩形内掩码的质心 / 极值 */
function regionStats(mask, w, h, x0, y0, x1, y1) {
  let n = 0
  let sx = 0
  let sy = 0
  let top = -1
  let bot = -1
  let left = -1
  let right = -1
  const X0 = Math.max(0, Math.floor(x0))
  const Y0 = Math.max(0, Math.floor(y0))
  const X1 = Math.min(w - 1, Math.ceil(x1))
  const Y1 = Math.min(h - 1, Math.ceil(y1))
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      if (!mask[y * w + x]) continue
      n++
      sx += x
      sy += y
      if (top < 0) top = y
      bot = y
      if (left < 0 || x < left) left = x
      if (x > right) right = x
    }
  }
  return n ? { n, cx: sx / n, cy: sy / n, top, bot, left, right, empty: false } : { n: 0, empty: true }
}

const P = (x, y) => ({ x, y })

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 分析 alpha，识别锚点。
 * @param {Uint8Array|Uint8ClampedArray} alpha  长度 w*h，RGBA 里每 4 个取第 4 个的紧凑数组
 * @param {number} w
 * @param {number} h
 * @param {{threshold?:number}} opts
 */
export function findAnchors(alpha, w, h, opts = {}) {
  const thr = opts.threshold ?? 128
  const mask = maskFromAlpha(alpha, w, h, thr)
  const bbox = maskBBox(mask, w, h)
  if (bbox.empty) return { ok: false, reason: '整帧都是透明的' }

  const dist = distanceTransform(mask, w, h)
  let maxDist = 0
  for (let i = 0; i < w * h; i++) if (dist[i] > maxDist) maxDist = dist[i]

  // ---- 躯干块：先找最厚的核心，再在核心所在行带内放宽阈值取真实外框 --------
  //   只用 0.5×maxDist 会把机柜里最厚的一条带当成躯干（实测只有 63px 宽），
  //   导致手臂区域把机柜侧壁也算成"手臂"。所以核心定位置、放宽阈值定尺寸。
  const thrCore = Math.max(2, maxDist * 0.5)
  const thrBox = Math.max(1.5, maxDist * 0.18)
  const core = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) core[i] = dist[i] >= thrCore ? 1 : 0
  const coreComps = connectedComponents(core, w, h, 0).comps
  let torso = null
  if (coreComps.length) {
    coreComps.sort((a, b) => b.area - a.area)
    const c = coreComps[0]
    const rowPad = Math.max(2, Math.round(c.h * 0.08))
    const y0 = Math.max(0, c.y0 - rowPad)
    const y1 = Math.min(h - 1, c.y1 + rowPad)
    // 行带内放宽阈值 → 取包含核心的最大连通块
    const band = new Uint8Array(w * h)
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        band[i] = dist[i] >= thrBox ? 1 : 0
      }
    }
    const relabel = connectedComponents(band, w, h, 0)
    // 找包含核心像素质心的那块
    const ci = Math.round(c.cy) * w + Math.round(c.cx)
    const label = relabel.labels[ci]
    const picked = relabel.comps.find((q) => q.id === label) || relabel.comps.sort((a, b) => b.area - a.area)[0]
    torso = {
      x0: picked.x0,
      y0: picked.y0,
      x1: picked.x1,
      y1: picked.y1,
      w: picked.w,
      h: picked.h,
      cx: picked.cx,
      cy: picked.cy,
      area: picked.area,
    }
  }
  const warnings = []
  if (!torso || torso.w < bbox.w * 0.25 || torso.h < bbox.h * 0.12) {
    // 厚度场没给出像样的躯干（细长体 / 空心）→ 用中央带兜底
    torso = {
      x0: bbox.x0 + bbox.w * 0.3,
      y0: bbox.y0 + bbox.h * 0.25,
      x1: bbox.x1 - bbox.w * 0.3,
      y1: bbox.y0 + bbox.h * 0.62,
      w: bbox.w * 0.4,
      h: bbox.h * 0.37,
      cx: bbox.cx,
      cy: bbox.y0 + bbox.h * 0.43,
      area: 0,
    }
    warnings.push('厚度场没识别出明显躯干，躯干框按包围盒中央带估计')
  }

  // ---- 髋线：默认就是躯干底 ----------------------------------------------
  //   之前的做法（往下找「宽度明显小于躯干」的行）在提着箱子/叉开腿时会一直往下漂，
  //   实测把髋线漂到 271（真值 ~203），腿骨只剩半截。机甲/人形的腿就是从躯干底挂下来的，
  //   所以直接取躯干底，只做上下限夹取。
  const rows = rowProfile(mask, w, h)
  const hipLo = Math.round(bbox.y0 + bbox.h * 0.42)
  const hipHi = Math.round(bbox.y1 - bbox.h * 0.18)
  let hipY = Math.min(hipHi, Math.max(hipLo, Math.round(torso.y1)))

  // ---- 腿：先在"贴地那一条带"里找脚，再往上追成整条腿 --------------------
  //   直接按髋线以下整体做列聚类，会把「提着的箱子」并进后腿（实测后腿框宽到 93px）。
  //   脚一定在最底下，所以先从地面带找脚，再各自向上取腿的列窗。
  const gap = Math.max(2, Math.round(w * 0.02))
  const footBandY0 = Math.max(hipY + 1, bbox.y1 - Math.max(6, Math.round(bbox.h * 0.13)))
  const footCols = columnProfile(mask, w, h, footBandY0, bbox.y1)
  let footClusters = clusterColumns(footCols, gap).filter(
    (c) => c.n >= Math.max(6, bbox.area * 0.004),
  )
  footClusters.sort((a, b) => b.n - a.n)
  footClusters = footClusters.slice(0, 2).sort((a, b) => a.cx - b.cx)

  // 脚簇的列范围要「掐掉弱边」：手提箱底边会在地面带压出 1~2px 的浅痕，
  // 直接按 x0..x1 取窗口会把整个箱子并进后腿（窗口从 57 开始而不是 90）。
  let legCols = footClusters.map((c) => {
    let maxN = 0
    for (let x = c.x0; x <= c.x1; x++) maxN = Math.max(maxN, footCols[x]?.n || 0)
    const thrN = Math.max(2, maxN * 0.5)
    let x0 = c.x1
    let x1 = c.x0
    for (let x = c.x0; x <= c.x1; x++) {
      if ((footCols[x]?.n || 0) >= thrN) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
      }
    }
    if (x1 < x0) {
      x0 = c.x0
      x1 = c.x1
    }
    const pad = 2
    return { x0: Math.max(0, x0 - pad), x1: Math.min(w - 1, x1 + pad) }
  })
  // 只认到一只脚（另一只抬起来了 / 并腿）→ 退回「髋线以下整体列聚类」
  if (legCols.length < 2) {
    const cols = columnProfile(mask, w, h, hipY + 1, bbox.y1)
    const cl = clusterColumns(cols, gap).filter((c) => c.n >= Math.max(8, bbox.area * 0.005))
    cl.sort((a, b) => b.n - a.n)
    legCols = cl.slice(0, 2).map((c) => ({ x0: c.x0, x1: c.x1 }))
    legCols.sort((a, b) => a.x0 - b.x0)
    // 只有最终仍然凑不齐两条腿才提示（脚抬起来本身是正常姿态，不该报警）
    if (legCols.length < 2) warnings.push('只识别到一条腿（另一条被挡住/并腿），前后腿按中线拆')
  }

  let clusters = legCols.map((c) => {
    const cols = columnProfile(mask, w, h, hipY + 1, bbox.y1)
    let n = 0
    let sum = 0
    for (let x = c.x0; x <= c.x1; x++) {
      if (cols[x]) {
        n += cols[x].n
        sum += cols[x].x * cols[x].n
      }
    }
    return { x0: c.x0, x1: c.x1, n, cx: n ? sum / n : (c.x0 + c.x1) / 2, w: c.x1 - c.x0 + 1 }
  })
  clusters = clusters.filter((c) => c.n > 0)
  clusters.sort((a, b) => a.cx - b.cx) // 左(后) → 右(前)

  const legAnchor = (c, side) => {
    if (!c) return null
    const cx = c.cx
    const st = regionStats(mask, w, h, c.x0, hipY + 1, c.x1, bbox.y1)
    const footBand = regionStats(mask, w, h, c.x0, st.bot - Math.max(2, (st.bot - hipY) * 0.12), c.x1, st.bot)
    const kneeY = hipY + (st.bot - hipY) * 0.5
    const kneeBand = regionStats(mask, w, h, c.x0, kneeY - 2, c.x1, kneeY + 2)
    const ankleY = st.bot - Math.max(1, (st.bot - hipY) * 0.12)
    const ankleBand = regionStats(mask, w, h, c.x0, ankleY - 1, c.x1, ankleY + 1)
    const toeX = side === 'back' ? footBand.left : footBand.right
    return {
      hip: P(cx, hipY),
      knee: P(kneeBand.empty ? cx : kneeBand.cx, kneeY),
      ankle: P(ankleBand.empty ? cx : ankleBand.cx, ankleY),
      toe: P(toeX, st.bot),
      foot: P(footBand.empty ? cx : footBand.cx, st.bot),
      bottom: st.bot,
      x0: c.x0,
      x1: c.x1,
      w: c.w,
    }
  }

  let legB = null
  let legF = null
  if (clusters.length >= 2) {  // 两条腿都在 → 正常
    legB = legAnchor(clusters[0], 'back')
    legF = legAnchor(clusters[1], 'front')
  } else if (clusters.length === 1) {
    // 腿并成一根（并腿站姿）：同一条腿拆成前后两半
    const c = clusters[0]
    legB = legAnchor({ ...c, x0: c.x0, x1: Math.round((c.x0 + c.x1) / 2), cx: (c.x0 + c.cx) / 2 }, 'back')
    legF = legAnchor({ ...c, x0: Math.round((c.x0 + c.x1) / 2), x1: c.x1, cx: (c.cx + c.x1) / 2 }, 'front')
    // 前后腿重叠（并腿/交叠步态）时只能对半拆，属于正常姿态，不单独报警
  } else {
    warnings.push('髋线以下没找到腿（可能不是站立构型）')
  }

  // ---- 手臂：躯干中下段、躯干外侧的突起 ---------------------------------
  //   行带从「胸腔偏下」开始，并且要求有一定厚度：机柜外侧那圈细线缆/光环只有 1~2px 厚，
  //   不加厚度门槛会被当成手臂，框出一大块空区域。
  const bandTop = Math.round(torso.y0 + torso.h * 0.45)
  const bandBot = Math.round(Math.min(bbox.y1, hipY + (bbox.y1 - hipY) * 0.3))
  const armThick = Math.max(1.5, maxDist * 0.06)
  const armMask = new Uint8Array(w * h)
  for (let y = bandTop; y <= bandBot; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (mask[i] && dist[i] >= armThick) armMask[i] = 1
    }
  }
  const countIn = (x0, x1) => {
    let n = 0
    for (let y = bandTop; y <= bandBot; y++) for (let x = x0; x <= x1; x++) if (armMask[y * w + x]) n++
    return n
  }
  const rightArm = regionStats(armMask, w, h, Math.round(torso.x1) + 1, bandTop, bbox.x1, bandBot)
  const leftArm = regionStats(armMask, w, h, bbox.x0, bandTop, Math.round(torso.x0) - 1, bandBot)
  rightArm.n = rightArm.empty ? 0 : countIn(Math.round(torso.x1) + 1, bbox.x1)
  leftArm.n = leftArm.empty ? 0 : countIn(bbox.x0, Math.round(torso.x0) - 1)
  const shoulderY = torso.y1 - torso.h * 0.12

  const armAnchor = (st, side) => {
    if (st.empty || st.n < Math.max(6, bbox.area * 0.003)) return null
    const shoulder = P(side === 'front' ? torso.x1 : torso.x0, shoulderY)
    const tip = P(side === 'front' ? st.right : st.left, st.cy)
    const mid = P((shoulder.x + tip.x) / 2, (shoulder.y + tip.y) / 2)
    return { shoulder, elbow: mid, hand: P((tip.x + mid.x) / 2, (tip.y + mid.y) / 2), tip, box: st }
  }
  const armF = armAnchor(rightArm, 'front')
  const armB = armAnchor(leftArm, 'back')

  // ---- 头 / 顶饰：躯干以上 ----------------------------------------------
  // 头部只在「躯干正上方那一列带」里找：整行扫会把两侧飘着的线缆/光环算进头部
  // （实测头部框被撑到 179px 宽，比躯干还宽）。
  const headX0 = Math.max(bbox.x0, Math.round(torso.x0 - torso.w * 0.12))
  const headX1 = Math.min(bbox.x1, Math.round(torso.x1 + torso.w * 0.12))
  const headRegion = regionStats(mask, w, h, headX0, bbox.y0, headX1, Math.round(torso.y0) - 1)
  let headTop
  let crownTop
  if (!headRegion.empty && headRegion.bot - headRegion.top >= 2) {
    headTop = P(headRegion.cx, headRegion.top + (headRegion.bot - headRegion.top) * 0.45)
    crownTop = P(headRegion.cx, headRegion.top)
  } else {
    headTop = P(torso.cx, Math.max(bbox.y0, torso.y0 - bbox.h * 0.04))
    crownTop = P(torso.cx, bbox.y0)
    warnings.push('躯干以上没有独立头部区域，头骨按躯干顶端估计')
  }
  // ---- 道具：髋线以下、腿聚类以外的区域（手提箱/武器） -------------------
  const propRows = columnProfile(mask, w, h, hipY + 1, bbox.y1)
  // 道具必须在「两腿的外侧」：两腿之间的空档也会被列聚类看成一块，
  // 但那是裆部管线，不是手提物（实测会误判成 16×60 的假道具）。
  const legSpanX0 = clusters.length ? Math.min(...clusters.map((c) => c.x0)) : bbox.x1 + 1
  const legSpanX1 = clusters.length ? Math.max(...clusters.map((c) => c.x1)) : bbox.x0 - 1
  const outside = propRows.map((c) => {
    const between = c.x >= legSpanX0 - 2 && c.x <= legSpanX1 + 2
    return between ? { x: c.x, n: 0, top: -1, bot: -1 } : c
  })
  const propClusters = clusterColumns(outside, gap).filter((c) => c.n >= Math.max(8, bbox.area * 0.004))
  let prop = null
  if (propClusters.length) {
    propClusters.sort((a, b) => b.n - a.n)
    const c = propClusters[0]
    const st = regionStats(mask, w, h, c.x0, hipY + 1, c.x1, bbox.y1)
    // 严格验收：手提物得是「够宽够高的独立块」，否则多半只是腿/管线的边角料。
    // （真正贴身的挂件需要实例分割，见 docs/editors.md 的 Hugging Face 段落）
    const bw = st.right - st.left + 1
    const bh = st.bot - st.top + 1
    if (bw >= bbox.w * 0.12 && bh >= bbox.h * 0.12 && st.n >= bbox.area * 0.01) {
      prop = { x0: st.left, y0: st.top, x1: st.right, y1: st.bot, cx: st.cx, cy: st.cy, n: st.n }
    }
  }

  // ---- 组装锚点 ---------------------------------------------------------
  const anchors = {
    centroid: P(bbox.cx, bbox.cy),
    bboxTL: P(bbox.x0, bbox.y0),
    bboxBR: P(bbox.x1, bbox.y1),
    torsoTL: P(torso.x0, torso.y0),
    torsoBR: P(torso.x1, torso.y1),
    torsoL: P(torso.x0, torso.cy),
    torsoR: P(torso.x1, torso.cy),
    torsoTop: P(torso.cx, torso.y0),
    chest: P(torso.cx, torso.y0 + torso.h * 0.5),
    headTop,
    crownTop,
    headTip: P(bbox.x1, headRegion.empty ? bbox.cy : headRegion.cy),
    spineBase: P(torso.cx, hipY - bbox.h * 0.04),
  }
  if (!headRegion.empty) {
    anchors.headTL = P(headRegion.left, headRegion.top)
    anchors.headBR = P(headRegion.right, headRegion.bot)
  }

  if (legF && legB) {
    anchors.hipC = P((legF.hip.x + legB.hip.x) / 2, hipY)
    anchors.spineBase = P(anchors.hipC.x, hipY - bbox.h * 0.04)
    anchors.hipF = legF.hip
    anchors.kneeF = legF.knee
    anchors.ankleF = legF.ankle
    anchors.toeF = legF.toe
    anchors.hipB = legB.hip
    anchors.kneeB = legB.knee
    anchors.ankleB = legB.ankle
    anchors.toeB = legB.toe
    anchors.footFL = legF.foot
    anchors.footFR = P(legF.foot.x + bbox.w * 0.04, legF.foot.y)
    anchors.footBL = legB.foot
    anchors.footBR = P(legB.foot.x - bbox.w * 0.04, legB.foot.y)
    anchors.legFTL = P(legF.x0, hipY)
    anchors.legFBR = P(legF.x1, legF.bottom)
    anchors.legBTL = P(legB.x0, hipY)
    anchors.legBBR = P(legB.x1, legB.bottom)
  } else if (legF || legB) {
    const L = legF || legB
    anchors.hipC = P(L.hip.x, hipY)
    anchors.hipF = anchors.hipB = L.hip
    anchors.kneeF = anchors.kneeB = L.knee
    anchors.ankleF = anchors.ankleB = L.ankle
    anchors.toeF = anchors.toeB = L.toe
    anchors.footFL = anchors.footFR = anchors.footBL = anchors.footBR = L.foot
    anchors.legFTL = anchors.legBTL = P(L.x0, hipY)
    anchors.legFBR = anchors.legBBR = P(L.x1, L.bottom)
  } else {
    anchors.hipC = P(torso.cx, hipY)
  }

  if (armF) {
    anchors.shoulderF = armF.shoulder
    anchors.elbowF = armF.elbow
    anchors.handF = armF.hand
    anchors.handTipF = armF.tip
    anchors.armFBox = armF.box
    anchors.armFTL = P(armF.box.left, armF.box.top)
    anchors.armFBR = P(armF.box.right, armF.box.bot)
  }
  if (armB) {
    anchors.shoulderB = armB.shoulder
    anchors.elbowB = armB.elbow
    anchors.handB = armB.hand
    anchors.handTipB = armB.tip
    anchors.armBBox = armB.box
    anchors.armBTL = P(armB.box.left, armB.box.top)
    anchors.armBBR = P(armB.box.right, armB.box.bot)
  }
  if (prop) {
    anchors.propTL = P(prop.x0, prop.y0)
    anchors.propBR = P(prop.x1, prop.y1)
    anchors.propTop = P(prop.cx, prop.y0)
    anchors.propBottom = P(prop.cx, prop.y1)
    anchors.propBox = { x0: prop.x0, y0: prop.y0, x1: prop.x1, y1: prop.y1 }
  }

  return {
    ok: true,
    mask,
    dist,
    bbox,
    torso,
    hipY,
    anchors,
    legs: { front: legF, back: legB },
    arms: { front: armF, back: armB },
    prop,
    head: headRegion.empty ? null : headRegion,
    maxDist,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// 质量评估
// ---------------------------------------------------------------------------

function rectContains(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** 骨骼支撑度：沿骨头采样，落在掩码里的比例 */
function boneSupport(mask, w, h, bone) {
  const rad = (bone.angle * Math.PI) / 180
  const n = Math.max(3, Math.min(24, Math.round(bone.len / 3)))
  let hit = 0
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0
    const x = Math.round(bone.x + Math.cos(rad) * bone.len * t)
    const y = Math.round(bone.y + Math.sin(rad) * bone.len * t)
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    if (mask[y * w + x]) hit++
  }
  return hit / (n + 1)
}

/**
 * 形状覆盖率：掩码像素被形状并集覆盖的比例。
 * 同时给「排除总命中框后」的覆盖率 —— 总命中框几乎覆盖一切，
 * 把它算进去这个指标就没有信息量了（永远是 1）。
 */
export function shapeCoverage(mask, w, h, shapes) {
  const body = shapes.filter((s) => s.role !== 'hitbox')
  let inside = 0
  let insideBody = 0
  let total = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      total++
      let hitAll = false
      let hitBody = false
      for (const s of shapes) {
        if (s.type !== 'rect' || !rectContains(s, x, y)) continue
        hitAll = true
        if (s.role !== 'hitbox') hitBody = true
        if (hitAll && hitBody) break
      }
      if (hitAll) inside++
      if (hitBody) insideBody++
    }
  }
  return {
    coverage: total ? inside / total : 0,
    bodyCoverage: total ? insideBody / total : 0,
    total,
  }
}

/**
 * 识别一套骨骼 + 碰撞体。
 * @param {{alpha:Uint8Array|Uint8ClampedArray, w:number, h:number, family?:string, threshold?:number}} input
 * @returns {{ok:boolean, bones:Array, shapes:Array, stats:object, warnings:string[], anchors:object}}
 */
export function fitSkeleton(input) {
  const { alpha, w, h } = input
  const family = input.family || 'unknown'
  const an = findAnchors(alpha, w, h, { threshold: input.threshold })
  if (!an.ok) {
    return { ok: false, family, reason: an.reason || '没有可识别的内容', bones: [], shapes: [], warnings: [an.reason || ''] }
  }
  const warnings = [...an.warnings]
  const bones = assembleRig(family, an.anchors, { w, h }, { skipMissing: true })
  const shapes = assembleShapes(family, an.anchors, { w, h }, { skipMissing: true })
  if (bones.skipped?.length) warnings.push('这些骨骼没找到对应部位（未生成）：' + bones.skipped.join('/'))
  if (shapes.skipped?.length) warnings.push('这些碰撞体没找到对应部位（未生成）：' + shapes.skipped.join('/'))

  // 置信度：骨骼支撑度 × 长度合理性
  let confSum = 0
  for (const b of bones) {
    const support = boneSupport(an.mask, w, h, b)
    const lenOk = Math.min(1, b.len / Math.max(4, an.bbox.h * 0.04))
    b.support = Math.round(support * 100) / 100
    b.conf = Math.round(Math.min(1, support * 0.7 + lenOk * 0.3) * 100) / 100
    confSum += b.conf
  }

  // 碰撞体：把明显不合法的框（0 面积 / 跑到帧外）丢掉，再算覆盖率
  const kept = []
  for (const s of shapes) {
    if (!(s.w > 0.5 && s.h > 0.5)) continue
    s.x = Math.max(-4, Math.min(w, s.x))
    s.y = Math.max(-4, Math.min(h, s.y))
    kept.push(s)
  }
  const cov = shapeCoverage(an.mask, w, h, kept)

  // 缺部位的提示已经由 assembleRig 的 skipped 列表给过了，这里不再重复报一遍
  const meanConf = bones.length ? confSum / bones.length : 0
  return {
    ok: true,
    family,
    bones,
    shapes: kept,
    anchors: an.anchors,
    stats: {
      bbox: an.bbox,
      torso: an.torso,
      hipY: an.hipY,
      bones: bones.length,
      shapes: kept.length,
      meanConf: Math.round(meanConf * 100) / 100,
      coverage: Math.round(cov.coverage * 100) / 100,
      bodyCoverage: Math.round((cov.bodyCoverage ?? 0) * 100) / 100,
      hitboxFill: Math.round((cov.total ? an.bbox.area / (an.bbox.w * an.bbox.h) : 0) * 100) / 100,
      pixels: an.bbox.area,
      thickness: Math.round(an.maxDist * 10) / 10,
    },
    warnings,
  }
}

/**
 * 多帧联合拟合：对一整个动作的每一帧各拟合一次，关节取中位数。
 * 走路循环这种「躯干不动、四肢晃」的动作，用中位数当静息骨架最稳。
 */
export function fitFrames(frames, opts = {}) {
  const list = (frames || []).filter((f) => f && f.alpha && f.alpha.length)
  if (!list.length) return { ok: false, reason: '没有可用帧' }
  const w = list[0].w
  const h = list[0].h
  const results = list.map((f) => fitSkeleton({ alpha: f.alpha, w, h, family: opts.family, threshold: opts.threshold }))
  const good = results.filter((r) => r.ok)
  if (!good.length) return { ok: false, reason: '所有帧都识别失败', results }

  const byName = new Map()
  for (const r of good) {
    for (const b of r.bones) {
      if (!byName.has(b.name)) byName.set(b.name, [])
      byName.get(b.name).push(b)
    }
  }
  const med = (arr) => {
    const s = [...arr].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  }
  const CORE = new Set(['root', 'pelvis', 'spine', 'chest', 'head'])
  const half = Math.ceil(good.length * 0.5)
  const bones = []
  for (const [name, list2] of byName) {
    // 零件类骨骼要有「半数以上帧都认出来」才算稳定，否则宁可不生成
    // （数据执政官的手提箱只在个别帧露在腿外侧，硬留会给出一条飘着的假骨头）
    if (!CORE.has(name) && list2.length < half) continue
    const x = med(list2.map((b) => b.x))
    const y = med(list2.map((b) => b.y))
    const angle = med(list2.map((b) => b.angle))
    const len = med(list2.map((b) => b.len))
    const conf = med(list2.map((b) => b.conf || 0))
    const support = med(list2.map((b) => b.support || 0))
    const base = list2[0]
    bones.push({ ...base, x: round2(x), y: round2(y), angle: round2(angle), len: round2(len), conf: round2(conf), support: round2(support) })
  }
  // 保持构型顺序
  const order = new Map(rigForFamily(opts.family).map((s, i) => [s.name, i]))
  bones.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99))
  // 碰撞体取中位数框
  const shapeNames = [...new Set(good.flatMap((r) => r.shapes.map((s) => s.name)))]
  const shapes = []
  for (const name of shapeNames) {
    const list2 = good.flatMap((r) => r.shapes.filter((s) => s.name === name))
    if (list2.length < Math.ceil(good.length * 0.5)) continue // 半数以上帧才有才算稳定
    const pick = (k) => round2(med(list2.map((s) => s[k])))
    shapes.push({
      name,
      role: list2[0].role,
      type: 'rect',
      x: pick('x'),
      y: pick('y'),
      w: pick('w'),
      h: pick('h'),
      angle: 0,
    })
  }
  const meanConf = bones.reduce((n, b) => n + (b.conf || 0), 0) / Math.max(1, bones.length)
  const covs = good.map((r) => r.stats.coverage)
  return {
    ok: true,
    family: opts.family,
    bones,
    shapes,
    frames: good.length,
    stats: {
      bones: bones.length,
      shapes: shapes.length,
      meanConf: Math.round(meanConf * 100) / 100,
      coverage: Math.round(med(covs) * 100) / 100,
      coverageMin: Math.round(Math.min(...covs) * 100) / 100,
      coverageMax: Math.round(Math.max(...covs) * 100) / 100,
      bbox: good[0].stats.bbox,
      torso: good[0].stats.torso,
      hipY: good[0].stats.hipY,
    },
    // 只报「半数以上帧都出现」的问题：单帧的偶发提示会淹没真正的问题
    warnings: (() => {
      const cnt = new Map()
      for (const r of good) for (const w of r.warnings || []) cnt.set(w, (cnt.get(w) || 0) + 1)
      return [...cnt.entries()].filter(([, n]) => n >= Math.ceil(good.length * 0.5)).map(([w]) => w)
    })(),
    perFrame: results.map((r) => ({ ok: r.ok, conf: r.stats?.meanConf, coverage: r.stats?.coverage })),
  }
}

function round2(v) {
  return Math.round(v * 100) / 100
}

/** 把 RGBA 的 ImageData 拆成紧凑 alpha 数组（方便传进识别器 / 存盘） */
export function alphaFromRGBA(data, w, h) {
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = data[i * 4 + 3]
  return out
}
