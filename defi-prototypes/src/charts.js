/* charts.js — Canvas 图表库：spark/line/bars/candles/gauge。DPR≤2，无 shadowBlur（柔光用多重描边），入场自动动画 */
(function () {
'use strict';
const SW = window.SW;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

function makeCv(el, w, h) {
  el.innerHTML = '';
  const cv = document.createElement('canvas');
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  el.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(DPR, DPR);
  return ctx;
}
function ease(t) { return 1 - Math.pow(1 - t, 3); }
function tween(from, to, dur, cb) {
  const t0 = performance.now();
  (function step(now) {
    const k = Math.max(0, Math.min(1, (now - t0) / dur)); // headless 下 now 可能早于 t0，钳到 [0,1]
    cb(from + (to - from) * ease(k));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function smoothPath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1]);
  }
}

function bounds(data, min, max) {
  let lo = min, hi = max;
  if (lo == null || hi == null) {
    lo = Infinity; hi = -Infinity;
    data.forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi === lo) { hi = lo + 1; }
    const pad = (hi - lo) * 0.12;
    if (min == null) lo -= pad;
    if (max == null) hi += pad;
  }
  return [lo, hi];
}

SW.charts = {};

/* 迷你折线 */
SW.charts.spark = function (el, data, o) {
  o = o || {};
  const w = o.w || el.clientWidth || 120, h = o.h || 40;
  const ctx = makeCv(el, w, h);
  const [lo, hi] = bounds(data);
  const pts = data.map((v, i) => [2 + i * (w - 4) / (data.length - 1), 3 + (1 - (v - lo) / (hi - lo)) * (h - 6)]);
  const color = o.color || '#fff';
  if (o.fill) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.22; ctx.fillStyle = g;
    ctx.beginPath(); smoothPath(ctx, pts);
    ctx.lineTo(pts[pts.length - 1][0], h); ctx.lineTo(pts[0][0], h); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath(); smoothPath(ctx, pts);
  ctx.strokeStyle = color; ctx.lineWidth = o.width || 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
};

/* 平滑曲线（多系列 + 标注点/竖虚线），o:{series:[{data,color,width,fill,fillColor}],h,min,max,dot:{i,color,r},vline:{i,color,label}} */
SW.charts.line = function (el, o) {
  const w = o.w || el.clientWidth || 300, h = o.h || 160;
  const ctx = makeCv(el, w, h);
  const all = [];
  o.series.forEach(s => all.push.apply(all, s.data));
  const [lo, hi] = bounds(all, o.min, o.max);
  const n = Math.max.apply(null, o.series.map(s => s.data.length));
  const X = i => 4 + i * (w - 8) / (n - 1);
  const Y = v => 6 + (1 - (v - lo) / (hi - lo)) * (h - 12);
  // 竖虚线
  if (o.vline) {
    ctx.setLineDash([4, 4]); ctx.strokeStyle = o.vline.color || 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(o.vline.i), 4); ctx.lineTo(X(o.vline.i), h - 4); ctx.stroke(); ctx.setLineDash([]);
  }
  o.series.forEach(s => {
    const pts = s.data.map((v, i) => [X(i), Y(v)]);
    const col = s.color || '#fff';
    if (s.fill) {
      const fc = s.fillColor || col;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, fc); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.25; ctx.fillStyle = g;
      ctx.beginPath(); smoothPath(ctx, pts);
      ctx.lineTo(pts[pts.length - 1][0], h); ctx.lineTo(pts[0][0], h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath(); smoothPath(ctx, pts);
    ctx.strokeStyle = col; ctx.lineWidth = s.width || 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
  });
  // 标注点（动画放大）
  if (o.dot) {
    const s0 = o.series[0];
    const px = X(Math.min(o.dot.i, s0.data.length - 1)), py = Y(s0.data[Math.min(o.dot.i, s0.data.length - 1)]);
    tween(0, 1, 500, k => {
      const rr = Math.max(0.1, (o.dot.r || 5) * k + 2);
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, rr, 0, 7);
      ctx.fillStyle = o.dot.color || '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, rr + 4 * k, 0, 7);
      ctx.strokeStyle = o.dot.color || '#fff'; ctx.globalAlpha = 0.35 * (1 - k * 0.4); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });
  }
  // 竖线标签
  if (o.vline && o.vline.label) {
    ctx.font = '600 11px -apple-system,"PingFang SC",sans-serif';
    const tw = ctx.measureText(o.vline.label).width;
    let lx = Math.min(Math.max(X(o.vline.i) - tw / 2 - 8, 2), w - tw - 18);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    roundRect(ctx, lx, 0, tw + 16, 20, 10); ctx.fill();
    ctx.fillStyle = '#1B1840'; ctx.fillText(o.vline.label, lx + 8, 14);
  }
};
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* 圆角柱状 values:[{v(0~1),color}] */
SW.charts.bars = function (el, o) {
  const w = o.w || el.clientWidth || 300, h = o.h || 120;
  const ctx = makeCv(el, w, h);
  const vals = o.values, n = vals.length;
  const gap = o.gap != null ? o.gap : Math.max(6, w * 0.035);
  const bw = (w - gap * (n - 1)) / n;
  const full = vals.map(b => Math.max(0.06, Math.min(1, b.v)) * (h - 8));
  const rad = o.rounded != null ? o.rounded : Math.min(bw / 2.6, 9);
  if (o.animate === false) { paint(1); return; }
  tween(0, 1, 700, paint);
  function paint(k) {
    ctx.clearRect(0, 0, w, h);
    vals.forEach((b, i) => {
      const t = Math.max(0, Math.min(1, k * 1.6 - i * 0.06));
      const v2 = full[i] * t;
      if (v2 <= 0.5) return;
      const x = i * (bw + gap);
      ctx.fillStyle = b.color || '#fff';
      roundRect(ctx, x, h - v2, bw, v2, Math.min(rad, v2 / 2, bw / 2));
      ctx.fill();
    });
  }
};

/* K线 data:[[open,close,high,low],...] */
SW.charts.candles = function (el, o) {
  const w = o.w || el.clientWidth || 160, h = o.h || 150;
  const ctx = makeCv(el, w, h);
  const data = o.data;
  let lo = Infinity, hi = -Infinity;
  data.forEach(d => { lo = Math.min(lo, d[3]); hi = Math.max(hi, d[2]); });
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const step = w / data.length, bw = step * 0.52;
  data.forEach((d, i) => {
    const [op, cl, hh, ll] = d;
    const up = cl >= op;
    const x = i * step + step / 2;
    const y = v => 4 + (1 - (v - lo) / (hi - lo)) * (h - 8);
    ctx.strokeStyle = up ? (o.up || '#8B7CF6') : (o.down || '#CFC9F2');
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.6;
    setTimeout(() => {
      ctx.beginPath(); ctx.moveTo(x, y(hh)); ctx.lineTo(x, y(ll)); ctx.stroke();
      const top = y(Math.max(op, cl)), bh = Math.max(2.5, Math.abs(y(op) - y(cl)));
      roundRect(ctx, x - bw / 2, top, bw, bh, 1.6); ctx.fill();
    }, i * 36);
  });
};

/* 环形仪表（圆头渐变弧 + 多重柔光 + 中心内容） */
SW.charts.gauge = function (el, o) {
  const size = o.size || el.clientWidth || 220, h = o.h || size;
  const ctx = makeCv(el, size, h);
  const cx = size / 2, cy = h / 2, r = Math.min(size, h) / 2 - (o.thick || 20);
  const a0 = (o.startDeg != null ? o.startDeg : -215) * Math.PI / 180;
  const a1 = (o.endDeg != null ? o.endDeg : 35) * Math.PI / 180;
  const thick = o.thick || 20;
  // 底轨
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1);
  ctx.strokeStyle = o.track || 'rgba(255,255,255,.1)'; ctx.lineWidth = thick; ctx.stroke();
  // 渐变值弧（沿bbox线性渐变）
  const g = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
  g.addColorStop(0, o.from || '#5B5FEF'); g.addColorStop(1, o.to || '#7DE3FF');
  const sweep = (a1 - a0) * (o.value != null ? o.value : 0.75);
  function draw(k) {
    ctx.clearRect(0, 0, size, h);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1);
    ctx.strokeStyle = o.track || 'rgba(255,255,255,.1)'; ctx.lineWidth = thick; ctx.stroke();
    if (o.glow !== false) {
      [[3.1, .05], [2.2, .09], [1.5, .14]].forEach(([m, a]) => {
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * k);
        ctx.strokeStyle = o.to || '#7DE3FF'; ctx.globalAlpha = a; ctx.lineWidth = thick * m; ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * k);
    ctx.strokeStyle = g; ctx.lineWidth = thick; ctx.stroke();
  }
  tween(0, 1, 900, draw);
  if (typeof o.center === 'function') { const c = document.createElement('div'); o.center(c); c.style.cssText += ';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'; el.style.position = 'relative'; el.appendChild(c); }
};
})();
