/**
 * geometry.js — 点集几何核心
 *
 * 所有轮廓(身体形状、眼睛)统一表示为固定点数的闭合点集:
 *   任意两个轮廓之间的 morph = 逐点插值,永远平滑。
 * 点集 → 平滑闭合贝塞尔路径(Catmull-Rom 转三次贝塞尔,保证 C1 连续)。
 */

/** 轮廓采样点数(身体)。72 点足以表达细节,又足够少让插值开销可忽略 */
export const BODY_POINTS = 72;
/** 眼睛采样点数 */
export const EYE_POINTS = 24;

export const TAU = Math.PI * 2;

/** 极坐标轮廓:r(θ) 返回半径,可选各向异性缩放 sx/sy */
export function polarPoints(fn, count = BODY_POINTS, sx = 1, sy = 1) {
  const pts = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU - Math.PI / 2; // 从正上方开始
    const r = fn(a);
    pts[i * 2] = Math.cos(a) * r * sx;
    pts[i * 2 + 1] = Math.sin(a) * r * sy;
  }
  return pts;
}

/**
 * 多边形顶点 → Chaikin 圆角化 → 弧长均匀重采样为固定点数。
 * rounds 越多角越圆润(0 = 保留直角)。
 */
export function polygonPoints(vertices, count = BODY_POINTS, rounds = 2) {
  let pts = vertices.slice();
  for (let r = 0; r < rounds; r++) {
    const next = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    pts = next;
  }
  // 展平
  const flat = [];
  for (const [x, y] of pts) flat.push(x, y);
  return resampleClosed(flat, count);
}

/** 闭合折线按弧长均匀重采样为 count 个点,并对齐起点(取原首个点附近) */
export function resampleClosed(flat, count) {
  const n = flat.length / 2;
  // 累计弧长
  const seg = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = flat[j * 2] - flat[i * 2];
    const dy = flat[j * 2 + 1] - flat[i * 2 + 1];
    total += Math.hypot(dx, dy);
    seg[i] = total;
  }
  const out = new Float64Array(count * 2);
  // 以第 0 点为起点
  let idx = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    while (idx < n - 1 && seg[idx] < target) idx++;
    const prev = idx === 0 ? 0 : seg[idx - 1];
    const local = (target - prev) / Math.max(1e-9, seg[idx] - prev);
    const j = (idx + 1) % n;
    out[i * 2] = flat[idx * 2] + (flat[j * 2] - flat[idx * 2]) * local;
    out[i * 2 + 1] = flat[idx * 2 + 1] + (flat[j * 2 + 1] - flat[idx * 2 + 1]) * local;
  }
  return out;
}

/**
 * 点集 → 平滑闭合 SVG path(Catmull-Rom → cubic bezier)。
 * 每段控制点取相邻点切线,保证曲线处处一阶连续 —— morph 时丝滑的关键。
 */
export function pointsToPath(pts) {
  const n = pts.length / 2;
  if (n < 3) return '';
  let d = `M${f(pts[0])} ${f(pts[1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(pts, i - 1), p1 = at(pts, i), p2 = at(pts, i + 1), p3 = at(pts, i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

function at(pts, i) {
  const n = pts.length / 2;
  const j = ((i % n) + n) % n;
  return [pts[j * 2], pts[j * 2 + 1]];
}

/** 线性插值两组等长点集 */
export function lerpPoints(a, b, t, out) {
  const n = a.length;
  for (let i = 0; i < n; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

function f(v) {
  return Math.round(v * 100) / 100;
}
