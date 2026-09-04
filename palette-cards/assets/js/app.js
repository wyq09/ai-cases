/* ============================================================
   高级感配色灵感 · 色卡生成器
   Canvas 按 1080 × 1440（3:4 小红书尺寸）渲染，预览即下载所得
   ============================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

window.addEventListener('error', e => { (window.__errs = window.__errs || []).push(e.message); });

/* ---------------- 基础工具 ---------------- */
function hexRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(clamp(v + (B[i] - v) * t, 0, 255))).join(',')})`;
}
function relLum(h) {
  const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/* 居中带字距文本 */
function spaced(ctx, text, cx, y, size, color, ls = 0, weight = 400) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${SERIF}`;
  ctx.fillStyle = color;
  const chars = [...text];
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + ls * (chars.length - 1);
  let x = cx - total / 2;
  for (const c of chars) { ctx.fillText(c, x, y); x += ctx.measureText(c).width + ls; }
  ctx.restore();
  return total;
}
function sparkle(ctx, x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  const w = r * .18;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(w, -w, r, 0);
  ctx.quadraticCurveTo(w, w, 0, r);
  ctx.quadraticCurveTo(-w, w, -r, 0);
  ctx.quadraticCurveTo(-w, -w, 0, -r);
  ctx.fill();
  ctx.restore();
}
function seeded(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const SERIF = '"Noto Serif SC","Songti SC","STSong","SimSun",serif';

/* 柔和植物投影（径向渐变模拟虚化，无需 filter） */
function branch(ctx, x, y, size, rot, rgb, alpha) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(size / 300, size / 300);
  const col = a => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  ctx.strokeStyle = col(alpha * .9); ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(112, 296); ctx.quadraticCurveTo(104, 210, 120, 20); ctx.stroke();
  const leaves = [[108, 262, 3.0], [112, 218, -.4], [111, 176, 2.9], [114, 134, -.35], [117, 96, 3.05], [119, 58, -.3], [121, 28, 2.8]];
  for (const [lx, ly, rot2] of leaves) {
    for (const [r, a] of [[30, alpha], [42, alpha * .5], [58, alpha * .28]]) {
      const g = ctx.createRadialGradient(lx + Math.cos(rot2) * 26, ly + Math.sin(rot2) * 26, 0, lx + Math.cos(rot2) * 26, ly + Math.sin(rot2) * 26, r * 1.4);
      g.addColorStop(0, col(a)); g.addColorStop(1, col(0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(lx + Math.cos(rot2) * 26, ly + Math.sin(rot2) * 26, r * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function blob(ctx, x, y, r, rgba) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba); g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function vgrad(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, 1440);
  for (const [p, c] of stops) g.addColorStop(p, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1440);
}

/* ---------------- 背景预设 ---------------- */
const PRESETS = {
  cream: {
    label: '暖调奶油',
    title: ['#C4707E', '#4E5E6A'], titleDir: 'h',
    sub: 'rgba(150,120,118,.85)', foot: 'rgba(120,100,86,.8)', page: '#8A5A5A', accent: '#C8A052',
    paint(ctx) {
      vgrad(ctx, [[0, '#F5EFE4'], [1, '#EAE1D1']]);
      blob(ctx, 1030, -30, 640, 'rgba(178,190,198,.5)');
      blob(ctx, 110, 50, 540, 'rgba(255,252,242,.9)');
      branch(ctx, 130, 60, 440, .3, [122, 104, 76], .13);
      branch(ctx, 940, 500, 340, .9, [122, 104, 76], .07);
      blob(ctx, 110, 1250, 150, 'rgba(255,255,255,.5)');
      blob(ctx, 220, 1330, 90, 'rgba(255,255,255,.4)');
    },
  },
  blush: {
    label: '玫瑰拂晓',
    title: ['#B5485D', '#D88A8A'], titleDir: 'h',
    sub: 'rgba(154,112,96,.9)', foot: 'rgba(140,100,86,.8)', page: '#B07070', accent: '#C87A8A',
    paint(ctx) {
      vgrad(ctx, [[0, '#F7E8E2'], [.6, '#F2DCD4'], [1, '#EFD5CD']]);
      blob(ctx, 90, 60, 560, 'rgba(255,240,232,.95)');
      branch(ctx, 950, 280, 430, .55, [168, 118, 110], .12);
      branch(ctx, 60, 900, 330, -2.6, [168, 118, 110], .07);
    },
  },
  dusk: {
    label: '暮蓝烟紫',
    title: ['#4A5878', '#3A4A68'], titleDir: 'h',
    sub: 'rgba(192,138,126,.9)', foot: 'rgba(100,105,130,.8)', page: '#4A5878', accent: '#8FA0C8',
    paint(ctx) {
      vgrad(ctx, [[0, '#F1EBE3'], [.3, '#E9E5DF'], [.68, '#CDD1DE'], [1, '#BEC4D6']]);
      blob(ctx, 100, 40, 520, 'rgba(255,255,255,.8)');
      blob(ctx, 1050, 1380, 420, 'rgba(150,150,190,.35)');
      sparkle(ctx, 950, 240, 10, '#FFFFFF', .8);
      sparkle(ctx, 160, 430, 7, '#FFFFFF', .7);
    },
  },
  bamboo: {
    label: '暖调竹影',
    title: ['#2E4A3A', '#C89028'], titleDir: 'h',
    sub: 'rgba(138,126,96,.9)', foot: 'rgba(120,104,70,.8)', page: '#7A6244', accent: '#C8A040',
    paint(ctx) {
      vgrad(ctx, [[0, '#F7F0DD'], [.55, '#F2EAD4'], [1, '#EAE0C2']]);
      branch(ctx, 150, 40, 480, .35, [120, 104, 60], .13);
      branch(ctx, 330, -60, 380, 1.1, [120, 104, 60], .09);
      branch(ctx, 960, 430, 360, .8, [120, 104, 60], .08);
      blob(ctx, 80, 950, 170, 'rgba(255,255,255,.55)');
    },
  },
  lavender: {
    label: '雾紫暮光',
    title: ['#6A5A9A', '#B4A2D4'], titleDir: 'v',
    sub: 'rgba(255,255,255,.95)', foot: 'rgba(122,108,158,.95)', page: '#FDFCF8', accent: '#EDE6FA',
    paint(ctx) {
      vgrad(ctx, [[0, '#EFEDF3'], [.44, '#D8CDE8'], [.78, '#B2A2D0'], [1, '#A292C6']]);
      rr(ctx, 656, 0, 424, 1240, 0);
      ctx.save(); ctx.clip();
      const g = ctx.createLinearGradient(656, 0, 1080, 1240);
      g.addColorStop(0, '#F7F1E5'); g.addColorStop(1, '#F0E7D6');
      ctx.fillStyle = g; ctx.fillRect(656, 0, 424, 1240);
      ctx.restore();
      branch(ctx, 990, 60, 420, .5, [176, 160, 130], .16);
      sparkle(ctx, 130, 560, 9, '#FFFFFF', .85);
      sparkle(ctx, 560, 130, 7, '#FFFFFF', .7);
    },
  },
  aurora: {
    label: '暗夜极光',
    title: ['#F5E9CC', '#E9B4B0'], titleDir: 'v',
    sub: 'rgba(240,228,204,.8)', foot: 'rgba(226,208,178,.75)', page: '#E2CFA8', accent: '#E8C890',
    paint(ctx) {
      vgrad(ctx, [[0, '#0C0E15'], [1, '#0A0C12']]);
      blob(ctx, 150, 430, 440, 'rgba(238,166,80,.62)');
      blob(ctx, 280, 80, 310, 'rgba(205,120,55,.5)');
      blob(ctx, 930, 140, 400, 'rgba(50,110,104,.55)');
      blob(ctx, 1010, 1020, 480, 'rgba(128,98,166,.6)');
      blob(ctx, 430, 1340, 440, 'rgba(206,110,142,.55)');
      blob(ctx, 50, 1200, 370, 'rgba(30,80,76,.5)');
      sparkle(ctx, 120, 150, 13, '#E8C890', .95);
      sparkle(ctx, 180, 220, 5, '#E8C890', .6);
      sparkle(ctx, 990, 250, 9, '#E8C890', .8);
      sparkle(ctx, 960, 1330, 12, '#E8C890', .9);
    },
  },
};

/* ---------------- 海报渲染 ---------------- */
const canvas = $('#cardCanvas');
const ctx = canvas.getContext('2d');
const W = 1080, H = 1440;

const state = {
  title: '温柔耐看的高级感', page: '1/7', sub: '配色灵感 · 柔和优雅',
  main: { name: '豆沙粉', hex: '#C88697', tag: '温柔细腻 · 浪漫治愈' },
  aux: { name: '墨青灰', hex: '#31424D', tag: '沉稳内敛 · 低调高级' },
  footer: '配色有温度，生活有质感', preset: 'cream',
};

function grain(ctx) {
  const n = document.createElement('canvas');
  n.width = 270; n.height = 360;
  const nc = n.getContext('2d');
  const img = nc.createImageData(270, 360);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.random() * 130;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 14;
  }
  nc.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = .55; ctx.drawImage(n, 0, 0, W, H); ctx.restore();
}

function splitTag(tag, maxChars = 12) {
  let lines = tag.split('\n').filter(Boolean);
  const out = [];
  for (let l of lines) {
    l = l.trim();
    if (l.length <= maxChars + 2) { out.push(l); continue; }
    const seps = [...l].map((c, i) => (c === '，' || c === '·' || c === ' ') ? i : -1).filter(i => i >= 0);
    const mid = l.length / 2;
    const cut = seps.length ? seps.reduce((a, b) => Math.abs(b - mid) < Math.abs(a - mid) ? b : a) : Math.round(mid);
    out.push(l.slice(0, cut).trim(), l.slice(cut + 1).trim());
  }
  return out.slice(0, 3);
}

function drawDivider(y, ink) {
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.globalAlpha = .8;
  ctx.beginPath(); ctx.moveTo(W / 2 - 96, y); ctx.lineTo(W / 2 - 30, y);
  ctx.moveTo(W / 2 + 30, y); ctx.lineTo(W / 2 + 96, y); ctx.stroke();
  ctx.globalAlpha = 1;
  sparkle(ctx, W / 2, y, 13, ink, .95);
}

function drawCard(c, box, big) {
  const { x, y, w, h } = box;
  const col = c.hex;
  const light = relLum(col) > .52;
  const ink = light ? mix(col, '#33240F', .74) : '#F8F1E3';
  const soft = light ? mix(col, '#33240F', .52) : 'rgba(248,241,227,.85)';
  const dark = state.preset === 'aurora';

  ctx.save();
  /* 底色 + 投影 */
  ctx.shadowColor = dark ? col + 'aa' : 'rgba(84,62,52,.36)';
  ctx.shadowBlur = dark ? 70 : 40; ctx.shadowOffsetY = dark ? 10 : 20;
  const g = ctx.createLinearGradient(x, y, x + w * .35, y + h);
  g.addColorStop(0, mix(col, '#FFFFFF', .26));
  g.addColorStop(.5, col);
  g.addColorStop(1, mix(col, '#000000', .12));
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, big ? 44 : 38); ctx.fill();
  ctx.shadowColor = 'transparent';

  ctx.save();
  rr(ctx, x, y, w, h, big ? 44 : 38); ctx.clip();
  /* 光泽 */
  const sh = ctx.createRadialGradient(x + w * .18, y - h * .05, 0, x + w * .18, y - h * .05, w * 1.25);
  sh.addColorStop(0, 'rgba(255,255,255,.34)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(x, y, w, h);
  const sh2 = ctx.createLinearGradient(x, y, x + w, y + h * .5);
  sh2.addColorStop(0, 'rgba(255,255,255,.12)'); sh2.addColorStop(.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh2; ctx.fillRect(x, y, w, h * .5);
  /* 底部波浪 */
  const wy = y + h * .78;
  ctx.fillStyle = mix(col, '#FFFFFF', .24); ctx.globalAlpha = .55;
  ctx.beginPath(); ctx.moveTo(x - 4, wy);
  ctx.bezierCurveTo(x + w * .3, y + h * .68, x + w * .58, y + h * .9, x + w + 4, y + h * .74);
  ctx.lineTo(x + w + 4, y + h + 4); ctx.lineTo(x - 4, y + h + 4); ctx.fill();
  ctx.fillStyle = mix(col, '#FFFFFF', .12); ctx.globalAlpha = .6;
  ctx.beginPath(); ctx.moveTo(x - 4, y + h * .88);
  ctx.bezierCurveTo(x + w * .35, y + h * .8, x + w * .62, y + h * .98, x + w + 4, y + h * .86);
  ctx.lineTo(x + w + 4, y + h + 4); ctx.lineTo(x - 4, y + h + 4); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  /* 亮边 */
  const eg = ctx.createLinearGradient(x, y, x, y + h);
  eg.addColorStop(0, 'rgba(255,255,255,.55)'); eg.addColorStop(.4, 'rgba(255,255,255,.14)'); eg.addColorStop(1, 'rgba(255,255,255,.05)');
  ctx.strokeStyle = eg; ctx.lineWidth = 2.5;
  rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, big ? 43 : 37); ctx.stroke();

  /* ---- 内容 ---- */
  ctx.textBaseline = 'alphabetic';
  const cx = x + w / 2;
  if (big) {
    const bw = 176, bh = 58;
    ctx.strokeStyle = light ? 'rgba(90,60,30,.5)' : 'rgba(255,255,255,.78)';
    ctx.fillStyle = light ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2.5;
    rr(ctx, cx - bw / 2, y + 66, bw, bh, 29); ctx.fill(); ctx.stroke();
    spaced(ctx, '主 色', cx, y + 105, 30, light ? mix(col, '#33240F', .7) : '#F8F1E3', 10, 600);
    drawDivider(y + 190, light ? mix(col, '#33240F', .55) : 'rgba(248,241,227,.9)');
    spaced(ctx, c.name, cx, y + 318, c.name.length >= 4 ? 62 : 74, ink, 8, 700);
    spaced(ctx, c.hex.toUpperCase(), cx, y + 388, 30, soft, 8);
    drawDivider(y + 456, light ? mix(col, '#33240F', .55) : 'rgba(248,241,227,.9)');
    splitTag(c.tag, 12).forEach((l, i) => spaced(ctx, l, cx, y + 540 + i * 54, 28, soft, 5));
  } else {
    const bw = 140, bh = 52;
    ctx.strokeStyle = light ? 'rgba(90,60,30,.5)' : 'rgba(255,255,255,.78)';
    ctx.fillStyle = light ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2.2;
    rr(ctx, cx - bw / 2, y + 58, bw, bh, 26); ctx.fill(); ctx.stroke();
    spaced(ctx, '辅 色', cx, y + 93, 26, light ? mix(col, '#33240F', .7) : '#F8F1E3', 8, 600);
    drawDivider(y + 164, light ? mix(col, '#33240F', .55) : 'rgba(248,241,227,.9)');
    spaced(ctx, c.name, cx, y + 268, c.name.length >= 4 ? 40 : 47, ink, 6, 700);
    spaced(ctx, c.hex.toUpperCase(), cx, y + 330, 24, soft, 6);
    drawDivider(y + 392, light ? mix(col, '#33240F', .55) : 'rgba(248,241,227,.9)');
    splitTag(c.tag, 8).forEach((l, i) => spaced(ctx, l, cx, y + 466 + i * 46, 23, soft, 4));
  }
  ctx.restore();
}

function drawPoster() {
  const P = PRESETS[state.preset];
  const t = state;
  ctx.clearRect(0, 0, W, H);
  P.paint(ctx);

  /* 页码 */
  if (t.page) {
    const m = t.page.match(/^(\d+)\s*\/\s*(\d+)$/);
    const label = m ? m[1] : t.page.slice(0, 2);
    const rest = m ? '/' + m[2] : t.page.slice(2);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.page;
    ctx.font = `700 52px ${SERIF}`; ctx.fillText(label, 84, 122);
    const w1 = ctx.measureText(label).width;
    ctx.font = `400 30px ${SERIF}`; ctx.fillText(rest, 88 + w1, 120);
    ctx.strokeStyle = P.page; ctx.lineWidth = 3; ctx.globalAlpha = .65;
    ctx.beginPath(); ctx.moveTo(86, 146); ctx.quadraticCurveTo(160, 130, 236, 140); ctx.stroke();
    ctx.globalAlpha = 1;
    sparkle(ctx, 262, 138, 8, P.page, .8);
  }
  /* 进度点 */
  for (let i = 0; i < 3; i++) {
    const dx = 938 + i * 40, dy = 100;
    ctx.beginPath(); ctx.arc(dx, dy, 9, 0, Math.PI * 2);
    if (i === 0) { ctx.fillStyle = t.main.hex; ctx.fill(); }
    else { ctx.strokeStyle = 'rgba(120,110,100,.45)'; ctx.lineWidth = 3; ctx.stroke(); }
  }

  /* 标题 */
  const lines = (t.title.trim().split('\n').length > 1 ? t.title.trim().split('\n') : (() => {
    const s = t.title.trim();
    return s.length > 11
      ? [s.slice(0, Math.ceil(s.length / 2)), s.slice(Math.ceil(s.length / 2))]
      : [s];
  })()).filter(Boolean);
  const maxLen = Math.max(...lines.map(l => [...l].length));
  const size = Math.min(lines.length > 1 ? 78 : 90, 920 / maxLen * 1.06);
  const ys = lines.length > 1 ? [222, 322] : [268];
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => {
    ctx.font = `900 ${size}px ${SERIF}`;
    const chars = [...l];
    const tw = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + 6 * (chars.length - 1);
    const g = P.titleDir === 'h'
      ? ctx.createLinearGradient((W - tw) / 2, 0, (W + tw) / 2, 0)
      : ctx.createLinearGradient(0, ys[i] - size, 0, ys[i] + 16);
    g.addColorStop(0, P.title[0]); g.addColorStop(1, P.title[1]);
    spaced(ctx, l, W / 2, ys[i], size, g, 6, 900);
  });

  /* 副标题 */
  const subY = lines.length > 1 ? 398 : 352;
  splitTag(t.sub, 18).forEach((l, i) => spaced(ctx, l, W / 2, subY + i * 52, 32, P.sub, 10));

  /* 双色卡 */
  drawCard(t.main, { x: 150, y: 566, w: 505, h: 706 }, true);
  drawCard(t.aux, { x: 700, y: 606, w: 248, h: 664 }, false);

  /* 点缀 */
  const rnd = seeded(t.main.hex + t.aux.hex + t.title);
  sparkle(ctx, 690, 180, 15, P.accent, .9);
  sparkle(ctx, 70 + rnd() * 30, 470 + rnd() * 60, 9, P.accent, .75);
  sparkle(ctx, 1006, 496, 8, P.accent, .7);

  /* 底部文案 */
  spaced(ctx, `·· ✦ ${t.footer} ✦ ··`, W / 2, 1372, 30, P.foot, 6, 600);
  grain(ctx);
}

/* ---------------- 表单绑定 ---------------- */
const form = $('#studioForm');
function readForm() {
  const f = form.elements;
  state.title = f.title.value.trim() || '高级感配色';
  state.page = f.page.value.trim();
  state.sub = f.sub.value.trim();
  state.footer = f.footer.value.trim();
  state.main = { name: f.mainName.value.trim() || '主色', hex: normHex(f.mainHex.value) || state.main.hex, tag: f.mainTag.value.trim() };
  state.aux = { name: f.auxName.value.trim() || '辅色', hex: normHex(f.auxHex.value) || state.aux.hex, tag: f.auxTag.value.trim() };
}
function normHex(v) {
  v = v.trim().replace(/^#?/, '');
  if (/^[0-9a-f]{6}$/i.test(v)) return '#' + v.toLowerCase();
  if (/^[0-9a-f]{3}$/i.test(v)) return '#' + [...v].map(c => c + c).join('').toLowerCase();
  return null;
}
let rafPending = false;
function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; readForm(); drawPoster(); });
}
form.addEventListener('input', e => {
  render();
  if (e.target.name === 'mainHex' || e.target.name === 'auxHex') syncColor(e.target.name);
  if (e.target.classList?.contains('pick')) {
    const hexInput = form.elements[e.target.dataset.for];
    hexInput.value = e.target.value.toUpperCase(); hexInput.classList.remove('invalid');
    syncSwatches(); render();
  }
});
function syncColor(name) {
  const input = form.elements[name];
  const hex = normHex(input.value);
  input.classList.toggle('invalid', !hex && input.value.trim() !== '');
  syncSwatches();
}
function syncSwatches() {
  const m = normHex(form.elements.mainHex.value), a = normHex(form.elements.auxHex.value);
  $('#mainSw').style.setProperty('--c', m || '#ccc');
  $('#auxSw').style.setProperty('--c', a || '#ccc');
  document.querySelector('input.pick[data-for="mainHex"]').value = m || '#000000';
  document.querySelector('input.pick[data-for="auxHex"]').value = a || '#000000';
}

/* 背景预设 */
$('#presetChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  $$('#presetChips .chip').forEach(c => c.classList.toggle('on', c === chip));
  state.preset = chip.dataset.preset;
  render();
});
function setPreset(p) {
  state.preset = p;
  $$('#presetChips .chip').forEach(c => c.classList.toggle('on', c.dataset.preset === p));
}

/* ---------------- 随机灵感 ---------------- */
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
$('#randomBtn').addEventListener('click', () => {
  const main = pick(COLOR_POOL);
  const cands = COLOR_POOL.filter(c => c !== main && Math.abs(relLum(c.hex) - relLum(main.hex)) > .16);
  let aux = pick(cands.length ? cands : COLOR_POOL);
  let A = main, B = aux;
  if (Math.random() < .3) { A = aux; B = main; }
  const f = form.elements;
  f.title.value = pick(TITLE_POOL);
  f.sub.value = pick(SUB_POOL);
  f.footer.value = pick(FOOTER_POOL);
  f.mainName.value = A.name; f.mainHex.value = A.hex.toUpperCase(); f.mainTag.value = A.tag;
  f.auxName.value = B.name; f.auxHex.value = B.hex.toUpperCase(); f.auxTag.value = B.tag;
  f.mainHex.classList.remove('invalid'); f.auxHex.classList.remove('invalid');
  setPreset(pick(Object.keys(PRESETS)));
  syncSwatches(); render();
  toast(`灵感已生成：${f.mainName.value} × ${f.auxName.value}`);
});

/* ---------------- 一键载入图鉴配色 ---------------- */
$$('.use-btn').forEach(btn => btn.addEventListener('click', () => {
  const p = POSTER_PALETTES[btn.dataset.use]; if (!p) return;
  const f = form.elements;
  f.title.value = p.title.replace(' × ', ' × '); f.sub.value = p.sub; f.page.value = p.page;
  f.mainName.value = p.main.name; f.mainHex.value = p.main.hex.toUpperCase(); f.mainTag.value = p.main.tag.replace(/\n/g, '');
  f.auxName.value = p.aux.name; f.auxHex.value = p.aux.hex.toUpperCase(); f.auxTag.value = p.aux.tag.replace(/\n/g, '');
  f.footer.value = '配色有温度，生活有质感';
  setPreset(p.preset);
  syncSwatches(); render();
  $('#studio').scrollIntoView({ behavior: 'smooth' });
  toast(`已载入配色：${p.main.name} × ${p.aux.name}`);
}));

/* ---------------- 复制文案 ---------------- */
$('#copyBtn').addEventListener('click', async () => {
  readForm();
  const t = state;
  const text = [
    `✦ ${t.title.replace('\n', ' ')}`,
    t.sub.replace('\n', ' '), '',
    `主色｜${t.main.name} ${t.main.hex.toUpperCase()}`,
    t.main.tag.replace(/\n/g, '　'), '',
    `辅色｜${t.aux.name} ${t.aux.hex.toUpperCase()}`,
    t.aux.tag.replace(/\n/g, '　'), '',
    `·· ✦ ${t.footer} ✦ ··`,
  ].join('\n');
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  toast('文案已复制，去小红书粘贴吧 ✦');
});

/* ---------------- 下载 ---------------- */
const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let lastUrl = null;
$('#downloadBtn').addEventListener('click', () => {
  readForm();
  const name = `色卡-${state.main.name}×${state.aux.name}.png`;
  canvas.toBlob(blob => {
    if (!blob) { toast('生成失败，请重试'); return; }
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    if (isIOS) {
      $('#saveImg').src = lastUrl;
      $('#saveModal').hidden = false;
    } else {
      const a = document.createElement('a');
      a.href = lastUrl; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      toast('色卡已保存 ✦ 1080×1440 高清 PNG');
    }
  }, 'image/png');
});
$('#saveToFiles').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = lastUrl; a.download = `色卡-${state.main.name}×${state.aux.name}.png`;
  document.body.appendChild(a); a.click(); a.remove();
});
$('#modalClose').addEventListener('click', () => { $('#saveModal').hidden = true; });
$('#saveModal').addEventListener('click', e => { if (e.target.id === 'saveModal') $('#saveModal').hidden = true; });

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------------- 图鉴缩放 & 入场 ---------------- */
function fitPosters() {
  $$('.poster-fit').forEach(w => {
    const s = w.clientWidth / 540;
    w.style.setProperty('--s', s);
    w.style.height = 720 * s + 'px';
  });
}
window.addEventListener('resize', fitPosters);
fitPosters();

const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .08 });
$$('.cell').forEach(c => io.observe(c));
/* 兜底：无论滚动与否，所有卡片最迟 2.2s 全部显现 */
setTimeout(() => $$('.cell').forEach(c => c.classList.add('in')), 2200);

/* ---------------- 启动渲染（等字体就绪后再画一遍） ---------------- */
render();
if (document.fonts?.ready) {
  document.fonts.ready.then(render);
  ['900 90px "Noto Serif SC"', '700 74px "Noto Serif SC"', '600 30px "Noto Serif SC"', '400 30px "Noto Serif SC"']
    .forEach(f => document.fonts.load(f).then(render).catch(() => {}));
}
