/* scene-b.js — 图2 · Chase 银行卡三屏（卡片仪表 / 我的卡片 / 转账） */
(function () {
'use strict';
const SW = window.SW;

/* ── 内联 SVG 图标 ── */
const IC = {
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>',
  bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg>',
  bag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 8.5h13l1 11a2 2 0 0 1-2 2.2h-11a2 2 0 0 1-2-2.2l1-11Z"/><path d="M8.8 10.6V6.4a3.2 3.2 0 0 1 6.4 0v4.2"/></svg>',
  heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
  addUser: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9.5" cy="8" r="3.2"/><path d="M3.8 19.6c.9-3.3 3.1-4.9 5.7-4.9s4.8 1.6 5.7 4.9"/><path d="M18.4 6.2v5M15.9 8.7h5"/></svg>',
  chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  check: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.8l4.8 4.7L19.5 6.5"/></svg>',
  del: '<svg width="27" height="20" viewBox="0 0 27 20" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 1.2h13.2a2.6 2.6 0 0 1 2.6 2.6v12.4a2.6 2.6 0 0 1-2.6 2.6H9.6L1.6 10l8-8.8Z"/><path d="M12.8 6.8l6.4 6.4M19.2 6.8l-6.4 6.4"/></svg>',
  diamond: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#E8CD8A" stroke-width="1.5" stroke-linejoin="round"><path d="M12 2.8 20.5 9 12 21.2 3.5 9 12 2.8Z"/><path d="M3.5 9h17M12 2.8 8 9l4 12.2L16 9l-4-6.2Z"/></svg>',
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.8 10.6L12 3.9l8.2 6.7"/><path d="M6 9.4V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.4"/></svg>',
  card: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.6"/><path d="M2.6 9.6h18.8"/></svg>',
  invest: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M12 3.6V12l5.8 5.8"/></svg>',
  history: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/></svg>',
  me: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.2" r="3.4"/><path d="M5.2 19.6c1-3.5 3.7-5.2 6.8-5.2s5.8 1.7 6.8 5.2"/></svg>'
};
const WAVES = '<svg width="200" height="140" viewBox="0 0 200 140" fill="none" style="display:block"><path d="M-6 138C52 84 122 48 202 32" stroke="rgba(255,255,255,.42)" stroke-width="1.5"/><path d="M-16 104C44 44 120 14 202 4" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/></svg>';

/* ── 小工具 ── */
function el(tag, css, html) {
  const d = document.createElement(tag);
  if (css) d.style.cssText = css;
  if (html != null) d.innerHTML = html;
  return d;
}
/* MasterCard 双圆标（红橙半透明相交） */
function mcHTML(s) {
  const w = Math.round(s * .48);
  return '<span style="position:relative;display:inline-block;width:' + (s + w) + 'px;height:' + s + 'px;flex:none">' +
    '<span style="position:absolute;left:0;top:0;width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:rgba(235,0,27,.88)"></span>' +
    '<span style="position:absolute;left:' + w + 'px;top:0;width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:rgba(247,158,27,.88)"></span>' +
    '</span>';
}
const VISA_MINI = '<span style="width:34px;height:22px;border-radius:5px;background:linear-gradient(135deg,#1A2C6B,#3A56B8);color:#fff;font-size:8.5px;font-weight:900;font-style:italic;display:inline-flex;align-items:center;justify-content:center;flex:none">VISA</span>';
const PLAT_MINI = '<span style="width:24px;height:24px;border-radius:50%;border:1px solid rgba(216,180,90,.7);display:inline-flex;align-items:center;justify-content:center;flex:none">' +
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8CD8A" stroke-width="2" stroke-linejoin="round"><path d="M12 3 20 9 12 21 4 9 12 3Z"/></svg></span>';

function chipEl() {
  return el('div', 'width:42px;height:32px;border-radius:7px;background:linear-gradient(150deg,#F2E6B4,#C9A94E 46%,#EFDFA2 78%,#B98F35);box-shadow:inset 0 0 0 1px rgba(110,80,20,.5)');
}
/* b1/b3 共用头部：返回 + 居中标题 + 铃铛 */
function headerBar(title) {
  const bar = el('div', 'position:relative;height:44px;width:100%;display:flex;align-items:center;justify-content:space-between;padding:0 8px;flex:none');
  const back = el('button', 'width:38px;height:38px;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;position:relative', IC.back);
  SW.ui.press(back);
  back.addEventListener('click', () => SW.toast('「返回」为原型演示'));
  const ttl = el('div', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;pointer-events:none', title);
  const bell = el('button', 'width:38px;height:38px;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;position:relative', IC.bell);
  SW.ui.press(bell);
  bell.addEventListener('click', () => SW.toast('「通知」为原型演示'));
  bar.append(back, ttl, bell);
  return bar;
}

/* ── b1 · Chase 卡仪表页 ── */
function buildB1() {
  const p = SW.phone({
    name: 'b1', num: 2, title: 'Chase 卡 · 余额仪表',
    screenBg: 'radial-gradient(120% 55% at 50% 108%, rgba(124,92,231,.5), rgba(124,92,231,0) 70%), linear-gradient(180deg,#1B1830,#0E0C1C)'
  });
  const box = el('div', 'padding:64px 13px 36px;display:flex;flex-direction:column;align-items:center');
  p.scroll.appendChild(box);
  box.appendChild(headerBar('Chase 卡'));

  /* 大圆角面板卡 */
  const panel = el('div', 'margin-top:16px;width:342px;height:430px;border-radius:36px;background:linear-gradient(172deg,#232038,#191627);border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;align-items:center;padding-top:32px');
  const gv = el('div', 'width:234px;height:234px');
  panel.appendChild(gv);
  SW.charts.gauge(gv, {
    value: .72, size: 234, thick: 22,
    from: '#5B5FEF', to: '#7DE3FF', track: 'rgba(255,255,255,.08)', glow: true,
    center(c) {
      const row = el('div', 'display:flex;align-items:flex-end;gap:5px;height:42px');
      [20, 38, 27].forEach(h => row.appendChild(el('div', 'width:8px;height:' + h + 'px;border-radius:4px;background:#fff')));
      c.appendChild(row);
    }
  });
  const bal = el('div', 'margin-top:28px;text-align:center');
  bal.appendChild(el('div', 'font-size:15px;font-weight:800;color:#fff', '余额'));
  bal.appendChild(el('div', 'margin-top:9px;font-size:13px;letter-spacing:.13em;color:rgba(255,255,255,.5)', '3482 8384 8283 4833'));
  bal.appendChild(el('div', 'margin-top:5px;font-size:34px;font-weight:800;color:#fff', '$2,910'));
  panel.appendChild(bal);
  box.appendChild(panel);

  /* 支出 */
  const exh = el('div', 'margin-top:22px;width:342px;display:flex;align-items:center;justify-content:space-between');
  exh.appendChild(el('div', 'font-size:17px;font-weight:800;color:#fff', '支出'));
  const va = el('button', 'border:0;background:transparent;cursor:pointer;font-size:12px;color:rgba(255,255,255,.5);padding:4px 2px;position:relative', '查看全部');
  SW.ui.press(va);
  va.addEventListener('click', () => SW.toast('「查看全部」为原型演示'));
  exh.appendChild(va);
  box.appendChild(exh);

  function exCard(iconHtml, name, amt) {
    const c = el('div', 'flex:none;width:118px;height:124px;border-radius:20px;background:rgba(255,255,255,.06);padding:12px;display:flex;flex-direction:column');
    c.appendChild(el('div', 'width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px', iconHtml));
    c.appendChild(el('div', 'margin-top:auto;font-size:12px;color:rgba(255,255,255,.72)', name));
    c.appendChild(el('div', 'margin-top:3px;font-size:14px;font-weight:800;color:#fff', amt));
    return c;
  }
  const row = el('div', 'margin-top:14px;width:342px;display:flex;gap:22px;overflow-x:auto');
  row.className = 'sB-noscroll';
  row.append(
    exCard('$', '订阅', '$121.00'),
    exCard(IC.bag, '生鲜杂货', '$121.00'),
    exCard(IC.heart, '兴趣爱好', '$128.00')
  );
  box.appendChild(row);
  return p;
}

/* ── b2 · 我的卡片页 ── */
function buildB2() {
  const p = SW.phone({
    name: 'b2', num: 2, title: 'Chase 卡 · 我的卡片',
    screenBg: 'radial-gradient(120% 42% at 50% 110%, rgba(108,92,231,.35), rgba(108,92,231,0) 70%), #131120'
  });
  const box = el('div', 'padding:64px 16px 100px');
  p.scroll.appendChild(box);
  box.appendChild(el('div', 'padding:0 6px;font-size:26px;font-weight:800;color:#fff', '我的卡片'));

  /* 卡片轮播 */
  const car = el('div', 'margin-top:14px;width:336px');
  car.className = 'sB-noscroll';
  const dots = el('div', 'margin-top:12px;display:flex;justify-content:center;gap:6px');
  box.append(car, dots);
  SW.ui.carousel({ el: car, count: 3, value: 0, dots: dots });

  function cardBase(extra) {
    return el('div', 'position:relative;width:100%;height:196px;border-radius:22px;overflow:hidden;padding:18px 20px;color:#fff' + extra);
  }
  function cardBottom(brand, num, brandCss, numCss) {
    const b = el('div', 'position:absolute;left:20px;bottom:16px;right:76px');
    b.appendChild(el('div', brandCss || 'font-size:17px;font-weight:800;color:#fff', brand));
    b.appendChild(el('div', 'margin-top:5px;font-size:13px;letter-spacing:.12em;' + (numCss || 'color:rgba(255,255,255,.72)'), num));
    return b;
  }
  /* ① MasterCard 主卡 */
  const c1 = cardBase(';background:linear-gradient(135deg,#6B8CFF,#8FB0FF 52%,#A9C3FF);box-shadow:0 14px 30px rgba(64,86,200,.35)');
  c1.appendChild(el('div', 'position:absolute;right:-24px;top:-20px;pointer-events:none', WAVES));
  c1.appendChild(chipEl());
  c1.appendChild(cardBottom('MasterCard', '3482 8384 8283 ****'));
  c1.appendChild(el('div', 'position:absolute;right:18px;bottom:18px', mcHTML(30)));
  /* ② 深蓝 VISA 卡 */
  const c2 = cardBase(';background:linear-gradient(135deg,#101A3E,#1D2C68);box-shadow:0 14px 30px rgba(10,20,60,.45)');
  c2.appendChild(el('div', 'position:absolute;right:-24px;top:-20px;pointer-events:none;opacity:.55', WAVES));
  c2.appendChild(chipEl());
  c2.appendChild(cardBottom('VISA', '4289 2281 5567 ****', 'font-size:20px;font-weight:900;font-style:italic;letter-spacing:.1em;color:#fff'));
  /* ③ 黑金白金卡 */
  const c3 = cardBase(';background:linear-gradient(150deg,#141419,#0A0A0E);border:1px solid rgba(216,180,90,.55);box-shadow:0 14px 30px rgba(0,0,0,.5)');
  c3.appendChild(chipEl());
  c3.appendChild(cardBottom('白金卡', '5218 9900 1177 ****', 'font-size:17px;font-weight:800;letter-spacing:.3em;color:#E8CD8A', 'color:rgba(232,205,138,.62)'));
  c3.appendChild(el('div', 'position:absolute;right:18px;bottom:18px', IC.diamond));

  [c1, c2, c3].forEach(c => {
    const s = el('div', 'flex:0 0 100%;min-width:100%;scroll-snap-align:start;display:flex');
    s.appendChild(c);
    car.appendChild(s);
  });

  /* 转账 · 头像行 */
  box.appendChild(el('div', 'margin-top:26px;padding:0 6px;font-size:17px;font-weight:800;color:#fff', '转账'));
  const arow = el('div', 'margin-top:14px;display:flex;gap:16px;overflow-x:auto;align-items:flex-start;padding:2px 6px 6px');
  arow.className = 'sB-noscroll';
  function person(label, avNode) {
    const col = el('div', 'flex:none;width:56px;display:flex;flex-direction:column;align-items:center;gap:7px');
    col.appendChild(avNode);
    col.appendChild(el('div', 'font-size:12px;color:rgba(255,255,255,.75);white-space:nowrap', label));
    return col;
  }
  const addBtn = el('div', 'width:48px;height:48px;border-radius:50%;border:1.6px dashed rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center', IC.addUser);
  const addCol = person('添加', addBtn);
  SW.ui.press(addCol);
  addCol.addEventListener('click', () => SW.toast('「添加」为原型演示'));
  arow.appendChild(addCol);
  [['GA', '吉尔伯特', 'linear-gradient(135deg,#8B7CF6,#5B5FEF)'],
   ['SC', '斯蒂芬', 'linear-gradient(135deg,#5C66C8,#39406E)'],
   ['HW', '哈里斯', 'linear-gradient(135deg,#7A5AC0,#46348E)'],
   ['WY', '王薇', 'linear-gradient(135deg,#B85A9A,#6E3468)']].forEach(a => {
    const av = SW.ui.avatar({ txt: a[0], size: 48, bg: a[2] });
    let on = false;
    av.style.cursor = 'pointer';
    av.addEventListener('click', () => { on = !on; av.style.boxShadow = on ? '0 0 0 2px #fff' : 'none'; });
    arow.appendChild(person(a[1], av));
  });
  box.appendChild(arow);

  /* 交易记录 */
  box.appendChild(el('div', 'margin-top:26px;padding:0 6px;font-size:17px;font-weight:800;color:#fff', '交易记录'));
  const tlist = el('div', 'margin-top:12px;display:flex;flex-direction:column;gap:10px');
  function trow(iconBg, iconHtml, name, sub, amt, time) {
    const r = el('div', 'display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.045);border-radius:18px;padding:12px 14px');
    r.appendChild(el('div', 'width:44px;height:44px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:18px', iconHtml)).style.background = iconBg;
    const mid = el('div', 'flex:1;min-width:0');
    mid.appendChild(el('div', 'font-size:14px;font-weight:700;color:#fff', name));
    mid.appendChild(el('div', 'margin-top:3px;font-size:12px;color:rgba(255,255,255,.5)', sub));
    const right = el('div', 'text-align:right;flex:none');
    right.appendChild(el('div', 'font-size:14px;font-weight:800;color:#fff', amt));
    right.appendChild(el('div', 'margin-top:3px;font-size:11px;color:rgba(255,255,255,.45)', time));
    r.append(mid, right);
    return r;
  }
  tlist.append(
    trow('#1DB954', '♪', 'Spotify', '订阅', '-$15.00', '3 小时前'),
    trow('#E50914', 'N', 'Netflix', '订阅', '-$15.49', '昨天'),
    trow('linear-gradient(135deg,#8B7CF6,#5B5FEF)', '¥', '工资入账', '十月薪', '+$8,500.00', '10月10日')
  );
  box.appendChild(tlist);

  /* 底部导航 */
  const nav = el('div', 'position:absolute;left:0;right:0;bottom:0;z-index:30;display:flex;background:rgba(13,11,26,.95);border-top:1px solid rgba(255,255,255,.07);padding:9px 4px 18px');
  const defs = [['首页', IC.home], ['卡片', IC.card], ['投资', IC.invest], ['记录', IC.history], ['我的', IC.me]];
  const btns = defs.map(def => {
    const b = el('button', 'flex:1;border:0;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 0;color:rgba(255,255,255,.42)', def[1] + '<span>' + def[0] + '</span>');
    b.addEventListener('click', () => {
      if (def[0] !== '卡片') SW.toast('「' + def[0] + '」为原型演示');
      btns.forEach(x => { x.style.color = 'rgba(255,255,255,.42)'; });
      b.style.color = '#fff';
    });
    nav.appendChild(b);
    return b;
  });
  btns[1].style.color = '#fff';
  p.screen.appendChild(nav);
  return p;
}

/* ── b3 · 转账页 ── */
function buildB3() {
  const p = SW.phone({
    name: 'b3', num: 2, title: 'Chase 卡 · 转账',
    screenBg: 'radial-gradient(130% 60% at 50% 112%, rgba(108,92,231,.42), rgba(108,92,231,0) 72%), linear-gradient(180deg,#14122A,#2A2050)'
  });
  const box = el('div', 'padding:64px 13px 34px;display:flex;flex-direction:column;align-items:center');
  p.scroll.appendChild(box);
  box.appendChild(headerBar('转账'));

  /* 收款人 */
  const top = el('div', 'margin-top:20px;display:flex;flex-direction:column;align-items:center');
  top.appendChild(SW.ui.avatar({ txt: 'GA', size: 56, bg: '#26224A', border: 'rgba(255,255,255,.3)' }));
  top.appendChild(el('div', 'margin-top:12px;font-size:16px;font-weight:800;color:#fff', '吉尔伯特·阿里纳斯'));
  top.appendChild(el('div', 'margin-top:7px;font-size:12px;letter-spacing:.12em;color:rgba(255,255,255,.5)', '3753 5829 9381 ****'));
  box.appendChild(top);

  /* 金额（键盘实时改写） */
  let raw = '50032';
  function fmt() {
    const n = parseInt(raw, 10) || 0;
    const int = ('' + Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '$' + int + '.' + ('' + (n % 100)).padStart(2, '0');
  }
  const amt = el('div', 'margin-top:18px;font-size:42px;font-weight:800;color:#fff', fmt());
  box.appendChild(amt);

  /* 卡片选择条 */
  const CARDS = {
    mc: { name: 'MasterCard', num: '3482 8384 8283 ****' },
    visa: { name: 'VISA', num: '4289 2281 5567 ****' },
    plat: { name: '白金卡', num: '5218 9900 1177 ****' }
  };
  const ICONS = { mc: mcHTML(22), visa: VISA_MINI, plat: PLAT_MINI };
  let cur = 'mc';
  const bar = el('button', 'margin-top:20px;width:342px;height:64px;border:0;border-radius:16px;background:rgba(255,255,255,.06);display:flex;align-items:center;gap:12px;padding:0 16px;cursor:pointer;color:#fff;text-align:left;position:relative');
  const markBox = el('span', 'display:flex;align-items:center;flex:none');
  const nameEl = el('div', 'font-size:13px;font-weight:800;color:#fff');
  const numEl = el('div', 'margin-top:3px;font-size:11px;color:rgba(255,255,255,.5)');
  const mid = el('div', 'flex:1');
  mid.append(nameEl, numEl);
  bar.append(markBox, mid, el('span', 'display:flex;align-items:center;flex:none', IC.chev));
  function paintBar() {
    markBox.innerHTML = ICONS[cur];
    nameEl.textContent = CARDS[cur].name;
    numEl.textContent = CARDS[cur].num;
  }
  paintBar();
  SW.ui.press(bar);
  bar.addEventListener('click', () => {
    SW.ui.sheet({
      host: p.screen, title: '选择付款卡片', value: cur,
      items: [
        { v: 'mc', label: 'MasterCard ****8283', desc: '默认付款卡片', icon: mcHTML(22) },
        { v: 'visa', label: 'VISA ****4833', desc: 'Chase 蓝卡', icon: VISA_MINI },
        { v: 'plat', label: '白金卡 ****0091', desc: '尊享白金', icon: PLAT_MINI }
      ],
      onPick(v) { cur = v; paintBar(); }
    });
  });
  box.appendChild(bar);

  /* 继续 */
  const go = el('button', 'margin-top:16px;width:342px;height:52px;border:0;border-radius:14px;background:linear-gradient(90deg,#7B6CF6,#5B5FEF);color:#fff;font-size:16px;font-weight:800;letter-spacing:.06em;cursor:pointer;position:relative', '继续');
  SW.ui.press(go);
  box.appendChild(go);

  /* 成功浮层 */
  function showOk() {
    const mask = el('div', 'position:absolute;inset:0;z-index:70;background:rgba(8,6,20,.66);display:flex;align-items:center;justify-content:center');
    const cd = el('div', 'width:272px;border-radius:24px;background:linear-gradient(172deg,#26224A,#1A1734);border:1px solid rgba(255,255,255,.1);padding:30px 24px 22px;display:flex;flex-direction:column;align-items:center;text-align:center');
    cd.appendChild(el('div', 'width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#7B6CF6,#5B5FEF);display:flex;align-items:center;justify-content:center', IC.check));
    cd.appendChild(el('div', 'margin-top:18px;font-size:18px;font-weight:800;color:#fff', '转账成功'));
    cd.appendChild(el('div', 'margin-top:8px;font-size:13px;color:rgba(255,255,255,.65)', fmt() + ' → 吉尔伯特·阿里纳斯'));
    const done = el('button', 'margin-top:22px;width:100%;height:46px;border:0;border-radius:13px;background:#fff;color:#16142E;font-size:15px;font-weight:800;cursor:pointer;position:relative', '完成');
    SW.ui.press(done);
    done.addEventListener('click', () => mask.remove());
    cd.appendChild(done);
    mask.appendChild(cd);
    p.screen.appendChild(mask);
  }
  go.addEventListener('click', showOk);

  /* 数字键盘 */
  const kp = el('div', 'margin-top:18px;width:342px;color:#fff');
  SW.ui.keypad({
    el: kp, bg: 'rgba(255,255,255,.06)',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(t => ({ t: t }))
      .concat([{ t: '00' }, { t: '0' }, { t: 'del', svg: IC.del }]),
    onPress(t) {
      if (t === 'del') raw = raw.length > 1 ? raw.slice(0, -1) : '0';
      else {
        if (raw === '0') raw = '';
        raw += t;
        if (raw.length > 8) raw = raw.slice(0, 8);
      }
      amt.textContent = fmt();
    }
  });
  Array.prototype.forEach.call(kp.querySelectorAll('button'), b => { b.style.height = '56px'; });
  box.appendChild(kp);
  return p;
}

/* ── 场景注册 ── */
SW.scenes.register({
  id: 'b', num: 2,
  title: 'Chase 卡 · 银行',
  sub: '卡片仪表 · 我的卡片 · 转账',
  bg: '#050508',
  ambience: { tint: '150,130,255', density: .3 },
  captions: ['移动应用 / 网页设计', '2025 · 概念稿', 'Chase 卡 概念'],
  build(poster) {
    const st = document.createElement('style');
    st.textContent = '.sB-noscroll::-webkit-scrollbar{display:none}';
    document.head.appendChild(st);
    [buildB1, buildB2, buildB3].forEach(f => poster.appendChild(f().wrap));
  }
});
})();
