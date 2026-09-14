/* scene-h.js — 图8 · May Bank 卡片管理三屏（支付记录 / 虚拟卡 / 我的卡片）· 深蓝紫夜色
   h1 支付记录（双色圆头柱状图 + 周期/月份联动重绘） · h2 虚拟卡（三层堆叠卡点击置顶） · h3 我的卡片（选卡联动 + 管理开关 + 全冻结磨砂） */
(function () {
'use strict';
const SW = window.SW;

/* ── 内联 SVG（stroke 1.6~1.8 圆头） ── */
const PATHS = {
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  funnel: '<path d="M4 5h16l-6.3 7.4v5.1l-3.4-2v-3.1L4 5Z"/>',
  down: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  ur: '<path d="M7.5 16.5 16.5 7.5"/><path d="M9.5 7.5h7v7"/>',
  home: '<path d="M4.5 10.7 12 4.6l7.5 6.1"/><path d="M6.6 9.5v9.3a.7.7 0 0 0 .7.7h9.4a.7.7 0 0 0 .7-.7V9.5"/>',
  chart: '<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.2"/><path d="M8.3 15.2v-3.1"/><path d="M12 15.2V8.6"/><path d="M15.7 15.2v-4.6"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M15.5 12.5h2.5"/>',
  bill: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8.2h6"/><path d="M9 12h6"/><path d="M9 15.8h3.5"/>',
  user: '<circle cx="12" cy="8.2" r="3.4"/><path d="M5.4 19.6c1-3.5 3.5-5.1 6.6-5.1s5.6 1.6 6.6 5.1"/>',
  card: '<rect x="2.8" y="5.2" width="18.4" height="13.6" rx="3"/><path d="M2.8 9.8h18.4"/>',
  wave: '<path d="M6.2 9.2a6.6 6.6 0 0 1 0 5.6"/><path d="M9.8 7.4a10.4 10.4 0 0 1 0 9.2"/><path d="M13.4 5.6a14.4 14.4 0 0 1 0 12.8"/>'
};
function ic(name, s, w) {
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.7) + '" stroke-linecap="round" stroke-linejoin="round">' + PATHS[name] + '</svg>';
}
const icStripe = function (s) {
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="5.5" width="18" height="13" rx="3"/><rect x="3" y="8.8" width="18" height="3.2" rx="1" fill="currentColor" stroke="none"/></svg>';
};
const icStar = function (s) {
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="#fff"><path d="M12 3.4 14.1 9l5.9.4-4.5 3.9 1.4 5.8L12 15.9l-4.9 3.2 1.4-5.8L4 9.4 9.9 9 12 3.4Z"/></svg>';
};
/* Mastercard 红橙双圆（几何近似） */
function mcLogo(s) {
  return '<span style="position:relative;display:inline-flex;align-items:center;width:' + Math.round(s * 1.66) + 'px;height:' + s + 'px;flex:none">' +
    '<span style="width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:#EB001B;flex:none"></span>' +
    '<span style="width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:#F79E1B;flex:none;margin-left:-' + Math.round(s * 0.34) + 'px;opacity:.94"></span></span>';
}
/* VISA 斜体字标 */
function visa(s, color) {
  return '<span style="font-style:italic;font-weight:800;font-size:' + s + 'px;letter-spacing:.5px;color:' + color + ';line-height:1;flex:none">VISA</span>';
}

/* ── 小工具 ── */
function el(tag, css, html) { const n = document.createElement(tag); if (css) n.style.cssText = css; if (html != null) n.innerHTML = html; return n; }
function btn(css, html) {
  const b = el('button', 'appearance:none;border:0;cursor:pointer;background:transparent;color:inherit;font-family:inherit;padding:0;margin:0;' + (css || ''), html);
  return SW.ui.press(b);
}
function demo(msg) { return function () { SW.toast('「' + msg + '」为原型演示'); }; }
function circleBtn(svg, msg) {
  const b = btn('width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#fff;flex:none', svg);
  if (msg) b.addEventListener('click', demo(msg));
  return b;
}
/* 顶栏：‹ 圆钮 + 居中 15px 白粗标题 + 右侧可选按钮 */
function header(title, rightBtn) {
  const hd = el('div', 'position:relative;height:40px;display:flex;align-items:center;justify-content:space-between');
  hd.appendChild(circleBtn(ic('back', 21, 2), '返回'));
  hd.appendChild(el('div', 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:15px;font-weight:700;color:#fff;white-space:nowrap', title));
  hd.appendChild(rightBtn || el('span', 'width:38px;height:38px;flex:none'));
  return hd;
}
/* canvas（自动 DPR）+ 缓动 */
function setupCv(host, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  host.innerHTML = '';
  const cv = document.createElement('canvas');
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}
function tweenCv(dur, paint) {
  if (!dur) { paint(1); return; }
  const t0 = performance.now();
  (function step(now) {
    const p = Math.max(0, Math.min(1, (now - t0) / dur));
    paint(1 - Math.pow(1 - p, 3));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ════════════════ 手机① · 支付记录 ════════════════ */
const CW = 308, CH = 170, BW = 34, GAP = (CW - BW * 6) / 5;
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月'];
const BARC = ['in', 'out', 'out', 'hi', 'in', 'in'];           // 柱色：收入 mint / 支出粉 / 高亮紫
const PILLS = ['+9%', '-5%', '+5%', '$108.00', '+3%', '+5%'];
const PSET = {
  '1天': [.42, .5, .58, .9, .5, .55],
  '1周': [.62, .55, .66, .96, .52, .58],
  '4月': [.5, .62, .55, .9, .62, .5],
  '8月': [.58, .5, .62, .94, .56, .6],
  '全部': [.45, .6, .55, .96, .6, .52]
};
const MSET = {
  '2024年6月': [.5, .58, .46, .9, .6, .52],
  '2024年7月': [.66, .5, .6, .94, .48, .6],
  '2024年8月': null
};

function buildH1(p) {
  const scroll = p.scroll;
  scroll.style.cssText += ';padding:58px 14px 110px';

  /* 头部 */
  const funnel = circleBtn(ic('funnel', 20), '筛选');
  scroll.appendChild(header('支付记录', funnel));

  /* 统计概览面板卡 */
  const card = el('div', 'margin-top:14px;background:#211D3E;border-radius:24px;padding:16px 16px 14px');
  card.id = 'sH-stat';
  card.appendChild(el('div', 'font-size:20px;font-weight:800;color:#fff', '统计概览'));
  card.appendChild(el('div', 'margin-top:4px;font-size:11px;color:rgba(255,255,255,.5)', '2024年11月1日 - 11月30日'));

  /* 周期 chips + 📅 月份胶囊 */
  let vals = PSET['1周'].slice();
  let curMonth = '2024年8月';
  const chips = [];
  const chipRow = el('div', 'display:flex;align-items:center;gap:6px;margin-top:12px');
  function paintChips(onKey) {
    chips.forEach(([b, k]) => {
      const on = k === onKey;
      b.style.background = on ? '#6C5CE7' : 'rgba(255,255,255,.08)';
      b.style.color = on ? '#fff' : 'rgba(255,255,255,.72)';
    });
  }
  ['1天', '1周', '4月', '8月', '全部'].forEach(function (k) {
    const b = btn('padding:5px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap', k);
    b.addEventListener('click', function () {
      paintChips(k);
      vals = PSET[k].map(function (v) { return Math.max(.3, Math.min(.96, v + (Math.random() * .12 - .06))); });
      renderChart(750);
    });
    chips.push([b, k]); chipRow.appendChild(b);
  });
  const calLb = el('span', 'font-size:11px;font-weight:600', curMonth);
  const cal = btn('margin-left:auto;display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.09);border-radius:999px;padding:6px 10px;color:#fff;flex:none', '<span style="font-size:12px;line-height:1">📅</span>');
  cal.id = 'sH-cal';
  cal.appendChild(calLb);
  cal.insertAdjacentHTML('beforeend', ic('down', 11, 2.2));
  cal.addEventListener('click', function () {
    SW.ui.sheet({
      host: p.screen, title: '选择月份', value: curMonth,
      items: [{ v: '2024年6月', label: '2024年6月' }, { v: '2024年7月', label: '2024年7月' }, { v: '2024年8月', label: '2024年8月' }],
      onPick: function (v) {
        curMonth = v; calLb.textContent = v;
        vals = (MSET[v] || PSET['1周']).slice();
        renderChart(750);
      }
    });
  });
  chipRow.appendChild(cal);
  card.appendChild(chipRow);

  /* 双色圆头柱状图（canvas 自绘：胶囊轨 + 彩色上半 + % pill + 虚线） */
  const wrap = el('div', 'position:relative;margin-top:32px;height:' + CH + 'px');
  const host = el('div');
  host.id = 'sH-bars';
  wrap.appendChild(host);
  card.appendChild(wrap);

  const axis = el('div', 'position:relative;height:16px;margin-top:6px');
  MONTHS.forEach(function (m, i) {
    const s = el('span', 'position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:' + (i === 3 ? '700' : '500') + ';color:' + (i === 3 ? '#B4A9F8' : 'rgba(255,255,255,.5)'), m);
    s.style.left = (i * (BW + GAP) + BW / 2) + 'px';
    axis.appendChild(s);
  });
  card.appendChild(axis);

  const lg = el('div', 'display:flex;justify-content:center;gap:8px;margin-top:12px');
  lg.appendChild(el('span', 'display:inline-flex;align-items:center;gap:6px;background:rgba(168,235,197,.1);border-radius:999px;padding:5px 12px;font-size:11px;font-weight:600;color:rgba(255,255,255,.85)', '<span style="width:7px;height:7px;border-radius:50%;background:#A8EBC5"></span>收入'));
  lg.appendChild(el('span', 'display:inline-flex;align-items:center;gap:6px;background:rgba(242,160,177,.1);border-radius:999px;padding:5px 12px;font-size:11px;font-weight:600;color:rgba(255,255,255,.85)', '<span style="width:7px;height:7px;border-radius:50%;background:#F2A0B1"></span>支出'));
  card.appendChild(lg);
  scroll.appendChild(card);

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function paintChart(ctx, k) {
    ctx.clearRect(0, 0, CW, CH);
    let i, x;
    for (i = 0; i < 6; i++) {                       /* 胶囊暗轨 */
      x = i * (BW + GAP);
      rr(ctx, x, 6, BW, CH - 12, BW / 2);
      ctx.fillStyle = 'rgba(255,255,255,.085)'; ctx.fill();
    }
    for (i = 0; i < 6; i++) {                       /* 彩色上半柱 */
      x = i * (BW + GAP);
      const ti = Math.max(0, Math.min(1, k * 1.45 - i * 0.075));
      const ch = Math.max(8, vals[i] * 140 * ti);
      if (BARC[i] === 'hi') {
        const g = ctx.createLinearGradient(0, 6, 0, 6 + vals[i] * 140);
        g.addColorStop(0, '#8F7CF7'); g.addColorStop(1, '#5B4FD6');
        ctx.fillStyle = g;
      } else ctx.fillStyle = BARC[i] === 'in' ? '#A8EBC5' : '#F2A0B1';
      rr(ctx, x, 6, BW, ch, BW / 2); ctx.fill();
    }
    const alpha = Math.max(0, Math.min(1, (k - 0.45) / 0.4));
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < 6; i++) {
      x = i * (BW + GAP);
      const cx = x + BW / 2;
      const topY = 6 + vals[i] * 140;
      if (BARC[i] === 'hi') {                       /* 最高柱：顶部白色金额 pill + 竖虚线 */
        const py = topY - 34;
        ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cx, py + 26); ctx.lineTo(cx, topY - 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '800 12px "PingFang SC",-apple-system,sans-serif';
        const w2 = ctx.measureText(PILLS[i]).width + 22;
        rr(ctx, cx - w2 / 2, py, w2, 24, 12);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.fillStyle = '#1B1840'; ctx.fillText(PILLS[i], cx, py + 12.5);
      } else {                                      /* 普通柱：边界虚线 + % pill */
        ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - 12, topY); ctx.lineTo(x + BW + 12, topY); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '700 9.5px "PingFang SC",-apple-system,sans-serif';
        const w1 = ctx.measureText(PILLS[i]).width + 16;
        rr(ctx, cx - w1 / 2, topY - 8.5, w1, 17, 8.5);
        ctx.fillStyle = 'rgba(15,12,34,.8)'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(PILLS[i], cx, topY + 0.5);
      }
    }
    ctx.restore();
  }
  function renderChart(dur) {
    const ctx = setupCv(host, CW, CH);
    tweenCv(dur, function (k) { paintChart(ctx, k); });
  }
  renderChart(800);

  /* 支出 · 两张并排卡 */
  const eh = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding:0 2px');
  eh.appendChild(el('div', 'font-size:16px;font-weight:800;color:#fff', '支出'));
  const see = btn('font-size:11px;color:rgba(255,255,255,.5)', '查看全部');
  see.addEventListener('click', demo('查看全部'));
  eh.appendChild(see);
  scroll.appendChild(eh);

  const two = el('div', 'display:flex;gap:10px;margin-top:10px');
  function expenseCard(o) {
    const c = btn('flex:1;min-width:0;height:104px;border-radius:20px;padding:13px 14px;display:flex;flex-direction:column;text-align:left;color:#fff', '');
    c.style.background = o.bg;
    const r = el('div', 'display:flex;align-items:flex-start;gap:9px');
    r.appendChild(o.logo);
    const t = el('div', 'font-size:12px;font-weight:600;line-height:1.5', o.title);
    r.appendChild(t);
    c.appendChild(r);
    c.appendChild(el('div', 'margin-top:auto;font-size:18px;font-weight:800;letter-spacing:-.3px', o.amount));
    c.addEventListener('click', demo(o.name));
    return c;
  }
  const nfLogo = el('span', 'width:36px;height:36px;flex:none;border-radius:50%;background:#E50914;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:900', 'N');
  const sbLogo = el('span', 'width:36px;height:36px;flex:none;border-radius:50%;background:#0E7A4B;display:flex;align-items:center;justify-content:center', icStar(17));
  two.appendChild(expenseCard({ name: 'Netflix 订阅', logo: nfLogo, title: 'Netflix<br>订阅', amount: '-$7.00', bg: '#1E1A36' }));
  two.appendChild(expenseCard({ name: '星巴克咖啡', logo: sbLogo, title: '星巴克<br>咖啡', amount: '+$10.00', bg: 'linear-gradient(160deg,#6C7BF0,#8B6FE8)' }));
  scroll.appendChild(two);

  /* 底部导航：首页 / 图表 / 中央钱包大钮 / 账单 / 我的 */
  const bar = el('div', 'position:absolute;left:0;right:0;bottom:0;z-index:20;background:#171331;border-top:1px solid rgba(255,255,255,.06);border-radius:24px 24px 0 0;display:flex;align-items:center;justify-content:space-between;padding:11px 30px 28px');
  bar.id = 'sH-nav';
  const sides = [];
  function paintSide(idx) {
    sides.forEach(function (b, j) {
      b.style.color = j === idx ? '#fff' : 'rgba(255,255,255,.48)';
      b.style.background = j === idx ? 'rgba(255,255,255,.09)' : 'transparent';
    });
  }
  [['home', '首页'], ['chart', '图表']].forEach(function (it) {
    const b = btn('padding:8px 10px;border-radius:14px;line-height:0;color:rgba(255,255,255,.48)', ic(it[0], 22));
    b.addEventListener('click', function () { paintSide(sides.indexOf(b)); SW.toast('「' + it[1] + '」为原型演示'); });
    sides.push(b); bar.appendChild(b);
  });
  const walletBtn = btn('width:48px;height:48px;border-radius:50%;background:#6C5CE7;color:#fff;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 10px 22px rgba(108,92,231,.5)', ic('wallet', 22, 1.8));
  walletBtn.id = 'sH-wallet';
  walletBtn.style.transform = 'translateY(-16px)';
  walletBtn.addEventListener('click', function () { SW.audio.pop(); SW.toast('「钱包」为原型演示'); });
  bar.appendChild(walletBtn);
  [['bill', '账单'], ['user', '我的']].forEach(function (it) {
    const b = btn('padding:8px 10px;border-radius:14px;line-height:0;color:rgba(255,255,255,.48)', ic(it[0], 22));
    b.addEventListener('click', function () { paintSide(sides.indexOf(b)); SW.toast('「' + it[1] + '」为原型演示'); });
    sides.push(b); bar.appendChild(b);
  });
  paintSide(-1);
  p.screen.appendChild(bar);
}

/* ════════════════ 手机② · 虚拟卡（三层堆叠 · 点击置顶） ════════════════ */
const V_DEFS = [
  {
    id: '3287', bg: 'linear-gradient(170deg,#FAF8F3,#F1EDE4)', logo: visa(22, '#1A1F71'),
    sub: '#6B6575', num: '#4A4552', abBg: '#FFFFFF', abColor: '#1B1840', abBd: '1px solid rgba(27,24,64,.14)'
  },
  {
    id: '3923', bg: 'linear-gradient(170deg,#E8D9EC,#D8C4E8)', logo: mcLogo(22),
    sub: '#6B5F78', num: '#5C5166', abBg: 'rgba(35,28,50,.85)', abColor: '#fff', abBd: ''
  },
  {
    id: '1990', bg: 'linear-gradient(165deg,#4D6BF5,#7B9FF8)', logo: visa(22, '#FFFFFF'),
    sub: 'rgba(255,255,255,.92)', num: 'rgba(255,255,255,.95)', abBg: '#FFFFFF', abColor: '#1B1840', abBd: '',
    full: true
  }
];
const STEP = 110, V_CARD_H = 200;

function buildH2(p) {
  const scroll = p.scroll;
  scroll.style.cssText += ';padding:58px 14px 40px';

  scroll.appendChild(header('May Bank'));

  /* 大标题行 */
  const tr = el('div', 'display:flex;align-items:center;gap:9px;margin-top:14px');
  tr.appendChild(el('div', 'font-size:26px;font-weight:800;color:#fff;letter-spacing:-.3px', '你的虚拟卡'));
  tr.appendChild(el('span', 'background:#6C5CE7;color:#fff;font-size:12px;font-weight:800;border-radius:999px;padding:2px 9px;flex:none', '3'));
  const st = btn('margin-left:auto;display:flex;align-items:center;gap:5px;background:#fff;color:#17141F;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;flex:none', '<span style="font-size:12px;line-height:1">📊</span><span>统计</span>');
  st.addEventListener('click', demo('统计'));
  tr.appendChild(st);
  scroll.appendChild(tr);

  /* 信用卡 · 查看全部 */
  const ch = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:20px');
  ch.appendChild(el('div', 'font-size:15px;font-weight:800;color:#fff', '信用卡'));
  const see = btn('font-size:12px;color:rgba(255,255,255,.5)', '查看全部');
  see.addEventListener('click', demo('查看全部'));
  ch.appendChild(see);
  scroll.appendChild(ch);

  /* 三层堆叠卡 */
  const stack = el('div', 'position:relative;margin-top:12px;height:' + (STEP * 2 + V_CARD_H) + 'px');
  stack.id = 'sH-stack';
  const cards = [];
  V_DEFS.forEach(function (d) {
    const c = el('div', 'position:absolute;left:0;right:0;height:' + V_CARD_H + 'px;border-radius:24px;padding:16px;display:flex;flex-direction:column;cursor:pointer;overflow:hidden;transition:transform .55s cubic-bezier(.32,0,.18,1),box-shadow .4s');
    c.className = 'sH-vcard';
    c.style.background = d.bg;
    if (d.full) {  /* 蓝卡柔光水印 */
      c.appendChild(el('div', 'position:absolute;right:-46px;top:36px;width:190px;height:190px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.28) 0%,rgba(255,255,255,0) 62%)'));
    }
    const r1 = el('div', 'position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px');
    r1.insertAdjacentHTML('afterbegin', d.logo);
    r1.appendChild(el('span', 'font-size:12px;font-weight:600;color:' + d.sub, '借记卡'));
    c.appendChild(r1);
    const r2 = el('div', 'position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:13px');
    r2.appendChild(el('span', 'font-size:12.5px;font-weight:700;letter-spacing:2px;color:' + d.num, '•••• •••• ••••  <b style="letter-spacing:1px">' + d.id + '</b>'));
    const ab = btn('width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 6px 14px rgba(20,14,44,.22)', ic('ur', 17, 2));
    ab.style.background = d.abBg; ab.style.color = d.abColor;
    if (d.abBd) ab.style.border = d.abBd;
    r2.appendChild(ab);
    c.appendChild(r2);
    if (d.full) {
      const bt = el('div', 'position:relative;margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:10px');
      const bl = el('div', '');
      bl.appendChild(el('div', 'font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px', '$14,569.00'));
      bl.appendChild(el('div', 'margin-top:6px;font-size:11px;color:rgba(255,255,255,.8)', '梅克尔·汉德雷'));
      bt.appendChild(bl);
      bt.appendChild(el('div', 'text-align:right', '<div style="font-size:10px;color:rgba(255,255,255,.75)">有效期</div><div style="font-size:13px;font-weight:700;color:#fff;margin-top:2px">04/16</div>'));
      c.appendChild(bt);
    }
    c.addEventListener('click', function () {
      order = order.filter(function (x) { return x !== c; });
      order.push(c);
      applyStack();
      SW.audio.tap();
      SW.toast('已切换到 ****' + d.id);
    });
    cards.push(c); stack.appendChild(c);
  });
  let order = [cards[0], cards[1], cards[2]];
  function applyStack() {
    order.forEach(function (c, slot) {
      c.style.zIndex = String(slot + 1);
      c.style.transform = 'translateY(' + (slot * STEP) + 'px)';
      c.style.boxShadow = slot === 2 ? '0 18px 40px rgba(6,4,20,.5)'
        : (slot === 1 ? '0 10px 24px rgba(6,4,20,.35)' : 'none');
    });
  }
  applyStack();
  scroll.appendChild(stack);

  /* 添加新卡片 + */
  const add = btn('width:100%;margin-top:20px;height:52px;border:1.5px solid rgba(255,255,255,.4);border-radius:999px;background:transparent;color:#fff;font-size:14px;font-weight:700', '添加新卡片 +');
  add.id = 'sH-add';
  add.addEventListener('click', function () {
    SW.ui.sheet({
      host: p.screen, title: '添加新卡片',
      items: [
        { v: 'photo', label: '拍照识别（演示）', icon: '<span style="font-size:18px">📷</span>' },
        { v: 'manual', label: '手动输入（演示）', icon: '<span style="font-size:18px">⌨️</span>' },
        { v: 'entity', label: '申请实体卡（演示）', icon: '<span style="font-size:18px">💳</span>' }
      ],
      onPick: function (v) { SW.toast('「' + ({ photo: '拍照识别', manual: '手动输入', entity: '申请实体卡' })[v] + '」为原型演示'); }
    });
  });
  scroll.appendChild(add);
}

/* ════════════════ 手机③ · 我的卡片（选卡联动 + 管理 + 全冻结磨砂） ════════════════ */
const CARDS3 = {
  '3923': { grad: 'linear-gradient(150deg,#E3D3EA,#CDB4DE)', name: '梅克尔·汉德雷', dark: true },
  '3287': { grad: 'linear-gradient(150deg,#F7F3EB,#E9E0D0)', name: '林伟', dark: true },
  '1990': { grad: 'linear-gradient(150deg,#4D6BF5,#7B9FF8)', name: '陈静', dark: false }
};

function buildH3(p) {
  const scroll = p.scroll;
  scroll.style.cssText += ';padding:58px 14px 34px';

  scroll.appendChild(header('我的卡片'));
  scroll.appendChild(el('div', 'margin-top:14px;font-size:18px;font-weight:800;color:#fff', '选择卡片'));

  /* 当前展示大卡 */
  let cur = '3923';
  const card = el('div', 'position:relative;margin-top:12px;height:210px;border-radius:24px;padding:16px 18px;display:flex;flex-direction:column;overflow:hidden');
  card.id = 'sH-bigcard';
  const r1 = el('div', 'display:flex;align-items:center;gap:10px');
  r1.insertAdjacentHTML('afterbegin', mcLogo(40));
  const debitLb = el('span', 'margin-left:auto;font-size:12px;font-weight:600', '借记卡');
  r1.appendChild(debitLb);
  const ab = btn('width:44px;height:44px;border-radius:50%;background:rgba(35,28,50,.72);color:#fff;display:flex;align-items:center;justify-content:center;flex:none', ic('ur', 18, 2));
  ab.id = 'sH-pick';
  r1.appendChild(ab);
  card.appendChild(r1);
  const numEl = el('div', 'margin-top:14px;font-size:12.5px;font-weight:700;letter-spacing:2px', '');
  card.appendChild(numEl);
  const r3 = el('div', 'margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:10px');
  const bl = el('div', '');
  const amtEl = el('div', 'font-size:28px;font-weight:800;letter-spacing:-.4px', '$14,569.00');
  bl.appendChild(amtEl);
  const nameEl = el('div', 'margin-top:6px;font-size:12px;font-weight:600', '');
  bl.appendChild(nameEl);
  r3.appendChild(bl);
  const br = el('div', 'text-align:right');
  const expLb = el('div', 'font-size:10px', '有效期');
  br.appendChild(expLb);
  const expVal = el('div', 'font-size:14px;font-weight:700;margin-top:2px', '04/16');
  br.appendChild(expVal);
  r3.appendChild(br);
  card.appendChild(r3);
  /* 全冻结磨砂层 */
  const frost = el('div', 'position:absolute;inset:0;z-index:5;border-radius:24px;background:rgba(208,203,226,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none;opacity:0;transition:opacity .35s', '<span style="font-size:22px">🔒</span><span style="font-size:12px;font-weight:700;color:#3A3352">已全部冻结</span>');
  frost.id = 'sH-frost';
  card.appendChild(frost);
  scroll.appendChild(card);

  function applyCard(id) {
    cur = id;
    const d = CARDS3[id];
    const fg = d.dark ? '#241F3D' : '#FFFFFF';
    const sub = d.dark ? '#6B5F78' : 'rgba(255,255,255,.85)';
    const faint = d.dark ? '#8A7E92' : 'rgba(255,255,255,.75)';
    card.style.background = d.grad;
    numEl.textContent = '•••• •••• •••• ' + id;
    numEl.style.color = d.dark ? '#5C5166' : 'rgba(255,255,255,.92)';
    amtEl.style.color = fg;
    nameEl.textContent = d.name; nameEl.style.color = sub;
    debitLb.style.color = d.dark ? '#6B5F78' : 'rgba(255,255,255,.92)';
    expLb.style.color = faint; expVal.style.color = fg;
    personVal.textContent = d.name;
  }
  const sw = function (bg) {
    return '<span style="width:20px;height:20px;border-radius:7px;background:' + bg + ';flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)"></span>';
  };
  ab.addEventListener('click', function () {
    SW.ui.sheet({
      host: p.screen, title: '选择卡片', value: cur,
      items: [
        { v: '3923', label: '****3923 · 淡紫', icon: sw('linear-gradient(135deg,#E3D3EA,#CDB4DE)') },
        { v: '3287', label: '****3287 · 暖白', icon: sw('#F4F1EC') },
        { v: '1990', label: '****1990 · 宝蓝', icon: sw('linear-gradient(135deg,#4D6BF5,#7B9FF8)') }
      ],
      onPick: function (v) { if (v !== cur) { applyCard(v); SW.toast('已切换到 ****' + v); } }
    });
  });

  /* 分段控件 + 三个面板 */
  const segBox = el('div', 'margin-top:16px;color:rgba(255,255,255,.75)');
  segBox.id = 'sH-seg';
  scroll.appendChild(segBox);
  const panePer = el('div', 'margin-top:12px;display:none');
  const paneMgr = el('div', 'margin-top:12px');
  const paneDet = el('div', 'margin-top:12px;display:none');

  const personVal = el('span', 'font-size:13px;font-weight:600;color:#fff', '');
  [['持卡人', personVal], ['账单地址', el('span', 'font-size:13px;font-weight:600;color:#fff', '上海市浦东新区世纪大道 100 号')]].forEach(function (it) {
    const row = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(255,255,255,.06);border-radius:16px;padding:13px 14px;margin-bottom:10px');
    row.appendChild(el('span', 'font-size:12px;color:rgba(255,255,255,.5);flex:none', it[0]));
    row.appendChild(it[1]);
    panePer.appendChild(row);
  });

  const tstate = [true, true, false];
  const MGR = [
    { label: '冻结实体卡', icon: ic('card', 18), on: true },
    { label: '关闭闪付', icon: ic('wave', 18), on: true },
    { label: '关闭磁条', icon: icStripe(18), on: false }
  ];
  function checkFreeze(wasAll) {
    const all = tstate[0] && tstate[1] && tstate[2];
    if (all && !wasAll) SW.toast('卡片已全部冻结');
    frost.style.opacity = all ? '1' : '0';
  }
  MGR.forEach(function (r, i) {
    const row = el('div', 'display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.06);border-radius:16px;padding:11px 14px;margin-bottom:10px');
    row.className = 'sH-mrow';
    row.appendChild(el('span', 'width:34px;height:34px;flex:none;border-radius:50%;background:rgba(124,108,240,.16);display:flex;align-items:center;justify-content:center;color:#CFC7F5', r.icon));
    row.appendChild(el('span', 'flex:1;min-width:0;font-size:14px;font-weight:600;color:#fff', r.label));
    const t = el('span', '');
    SW.ui.toggle(t, {
      value: r.on,
      onChange: function (v) {
        const wasAll = tstate[0] && tstate[1] && tstate[2];
        tstate[i] = v;
        checkFreeze(wasAll);
      }
    });
    row.appendChild(t);
    paneMgr.appendChild(row);
  });

  const detRow = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(255,255,255,.06);border-radius:16px;padding:13px 14px', '<span style="font-size:12px;color:rgba(255,255,255,.5)">状态</span><span style="font-size:13px;font-weight:600;color:#fff"><b style="color:#7DE3A8">正常</b><span style="color:rgba(255,255,255,.4)"> · </span>额度 $20,000</span>');
  paneDet.appendChild(detRow);
  scroll.appendChild(panePer); scroll.appendChild(paneMgr); scroll.appendChild(paneDet);

  SW.ui.seg({
    el: segBox, bg: 'rgba(255,255,255,.08)', activeBg: '#6C5CE7', activeColor: '#fff', value: 'manage',
    items: [{ v: 'personal', label: '个人' }, { v: 'manage', label: '管理' }, { v: 'detail', label: '详情' }],
    onChange: function (v) {
      panePer.style.display = v === 'personal' ? 'block' : 'none';
      paneMgr.style.display = v === 'manage' ? 'block' : 'none';
      paneDet.style.display = v === 'detail' ? 'block' : 'none';
    }
  });

  /* 保存 */
  const save = btn('width:100%;margin-top:20px;height:52px;border-radius:999px;background:linear-gradient(90deg,#6C7BF0,#8B6FE8);color:#fff;font-size:15px;font-weight:800;box-shadow:0 12px 26px rgba(108,92,231,.35)', '保存');
  save.id = 'sH-save';
  save.addEventListener('click', function () { SW.toast('设置已保存'); SW.audio.ok(); });
  scroll.appendChild(save);

  applyCard('3923');
}

/* ════════════════ 场景注册：蓝紫海报（巨型手机轮廓）+ 三机横排 ════════════════ */
SW.scenes.register({
  id: 'h', num: 8,
  title: 'May Bank · 卡片管理',
  sub: '支付记录 · 虚拟卡 · 我的卡片',
  bg: 'linear-gradient(165deg,#8F93D6,#6C6FB8)',
  ambience: { tint: '216,212,255', density: 0.32 },
  captions: ['移动应用 / 网页设计', '2025 · 概念稿', 'May Bank 概念'],
  build: function (poster) {
    /* 背景上若隐若现的巨型手机轮廓（描边圆角矩形） */
    [[3, -36, -8], [36, 26, 5], [70, -14, -6]].forEach(function (s) {
      const d = el('div', 'position:absolute;width:330px;height:680px;border:2px solid rgba(255,255,255,.06);border-radius:58px;background:rgba(255,255,255,.02);pointer-events:none');
      d.style.left = s[0] + '%'; d.style.top = s[1] + 'px';
      d.style.transform = 'rotate(' + s[2] + 'deg)';
      poster.appendChild(d);
    });
    const mk = function (name, title, screenBg, fn, dy) {
      const ph = SW.phone({ name: name, num: 8, title: title, scale: 0.78, status: 'light', screenBg: screenBg });
      if (dy) ph.wrap.style.transform = 'translateY(' + dy + 'px)';
      poster.appendChild(ph.wrap);
      fn(ph);
    };
    mk('h1', '支付记录', 'linear-gradient(180deg,#1A1740,#100E24)', buildH1, 16);
    mk('h2', '你的虚拟卡', '#151230', buildH2, 0);
    mk('h3', '我的卡片', 'linear-gradient(180deg,#1C1838,#121026)', buildH3, 16);
  }
});
})();
