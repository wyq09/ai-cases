/* scene-e.js — 图5 · 轻钱包三屏（深底浅紫：引导 / 首页 / 支出统计） */
(function () {
'use strict';
const SW = window.SW;

/* ── 内联 SVG 图标（stroke 1.7 圆头，currentColor） ── */
function ic(name, s, extra) {
  const B = {
    home: '<path d="M4.5 10.4 12 4.2l7.5 6.2"/><path d="M6.3 9.6V19.6h11.4V9.6"/>',
    card: '<rect x="2.8" y="5.2" width="18.4" height="13.6" rx="3.2"/><path d="M2.8 9.6h18.4"/>',
    swap: '<path d="M8 19V5.4"/><path d="M8 5.4 4.9 8.5"/><path d="M8 5.4l3.1 3.1"/><path d="M16 5v13.6"/><path d="m16 18.6-3.1-3.1"/><path d="m16 18.6 3.1-3.1"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2.2"/><rect x="13" y="4" width="7" height="7" rx="2.2"/><rect x="4" y="13" width="7" height="7" rx="2.2"/><rect x="13" y="13" width="7" height="7" rx="2.2"/>',
    pie: '<path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8H12Z"/><path d="M14.6 3.6a8.9 8.9 0 0 1 5.8 5.8h-5.8Z"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    transfer: '<path d="M7 5.2 3.6 8.6 7 12"/><path d="M3.6 8.6h14.8"/><path d="m17 12 3.4 3.4L17 18.8"/><path d="M20.4 15.4H5.6"/>',
    voucher: '<path d="M3.6 8.6A1.6 1.6 0 0 1 5.2 7h13.6a1.6 1.6 0 0 1 1.6 1.6v1.9a2.4 2.4 0 0 0 0 4.6v2.3a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6v-2.3a2.4 2.4 0 0 0 0-4.6Z"/><path d="M14.4 7v10" stroke-dasharray="2.4 2.6"/>',
    bill: '<path d="M6.2 3.6h11.6v16.8l-2.3-1.5-2.3 1.5-2.4-1.5-2.3 1.5-2.3-1.5Z"/><path d="M9.4 8.4h5.2"/><path d="M9.4 11.6h5.2"/>',
    bag: '<path d="M6.2 8.2h11.6l-1.1 11a1.9 1.9 0 0 1-1.9 1.7H9.2a1.9 1.9 0 0 1-1.9-1.7Z"/><path d="M9.2 10.4V6.9a2.8 2.8 0 0 1 5.6 0v3.5"/>',
    bus: '<rect x="5" y="4.4" width="14" height="12.6" rx="3"/><path d="M5 10.4h14"/><path d="m9.2 17 -1.2 2.2"/><path d="m14.8 17 1.2 2.2"/><path d="M8.6 13.8h.01"/><path d="M15.4 13.8h.01"/>',
    brief: '<rect x="3.4" y="7.4" width="17.2" height="12.2" rx="2.6"/><path d="M9 7.4V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.6"/><path d="M3.4 12.6h17.2"/>',
    trend: '<path d="m4 16.8 4.6-4.6 3 3L19.6 8"/><path d="M14.8 8h4.8v4.8"/>',
    ticket: '<path d="M3.6 8.4A1.5 1.5 0 0 1 5.1 7h13.8a1.5 1.5 0 0 1 1.5 1.4v1.8a2.3 2.3 0 0 0 0 4.6v1.8a1.5 1.5 0 0 1-1.5 1.4H5.1a1.5 1.5 0 0 1-1.5-1.4v-1.8a2.3 2.3 0 0 0 0-4.6Z"/><path d="M14.5 7v10" stroke-dasharray="2.2 2.4"/>'
  }[name];
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + B + '</svg>';
}

/* ── 小工具 ── */
function el(tag, css, html) { const n = document.createElement(tag); if (css) n.style.cssText = css; if (html != null) n.innerHTML = html; return n; }
function btn(css, html) { const b = el('button', 'appearance:none;border:0;cursor:pointer;background:transparent;color:inherit;font-family:inherit;font-size:inherit;padding:0;margin:0;' + (css || ''), html); return SW.ui.press(b); }
function demo(name) { SW.toast('「' + name + '」为原型演示'); }

const C = { screen: '#151020', tile: '#251E36', panel: '#2C2442', card: '#201A2E', lav: '#C9BCEE', ink: '#241B3F' };

/* ── 细碎星点（确定性分布，上半屏） ── */
function stars(host) {
  for (let i = 0; i < 26; i++) {
    const x = (i * 137.5 + 13) % 100, y = (i * 61.8 + 7) % 52;
    const r = 1 + ((i * 7) % 3) * 0.55, op = 0.22 + ((i * 13) % 10) / 16;
    host.appendChild(el('span',
      'position:absolute;border-radius:50%;background:#fff;pointer-events:none;left:' + x + '%;top:' + (6 + y) + '%;width:' + r + 'px;height:' + r + 'px;opacity:' + op.toFixed(2) +
      (i % 9 === 0 ? ';box-shadow:0 0 7px rgba(255,255,255,.85)' : '')));
  }
}

/* ── 首页内容块（手机②整屏 / 手机①第二页复用） ── */
function homeBlock(sheetHost, padBottom) {
  const box = el('div', 'padding:70px 20px ' + (padBottom || 0) + 'px');

  /* 问候 + 头像 */
  const hd = el('div', 'display:flex;align-items:center;justify-content:space-between');
  hd.appendChild(el('div', '', '<div style="font-size:13px;color:rgba(255,255,255,.55)">早上好，</div><div style="font-size:18px;font-weight:700;color:#fff;margin-top:2px">克里斯汀·沃森</div>'));
  hd.appendChild(SW.ui.avatar({ txt: '克', size: 44, bg: 'linear-gradient(135deg,#9D8BE0,#6E58B8)' }));
  box.appendChild(hd);

  /* 余额卡轮播（真拖拽 + 圆点） */
  const CARDS = [
    { label: '余额', amt: '$12,692.00', num: '5440 1234 **** 6578', g: 'linear-gradient(150deg,#B7A7EA 0%,#9583D8 100%)' },
    { label: '消费卡', amt: '$3,208.45', num: '4921 8837 **** 2109', g: 'linear-gradient(150deg,#7E6CD8 0%,#55439F 100%)' },
    { label: '储蓄卡', amt: '$8,754.12', num: '6038 2214 **** 4471', g: 'linear-gradient(150deg,#544687 0%,#322858 100%)' }
  ];
  const car = el('div', 'margin-top:22px;width:100%;height:192px;border-radius:24px');
  const dots = el('div', 'display:flex;justify-content:center;gap:6px;margin-top:14px');
  box.appendChild(car); box.appendChild(dots);
  SW.ui.carousel({ el: car, count: 3, value: 0, dots: dots });
  CARDS.forEach(cd => {
    const c = el('div', 'flex:0 0 100%;width:100%;height:192px;border-radius:24px;background:' + cd.g + ';padding:20px 22px;display:flex;flex-direction:column;color:#fff;box-shadow:0 18px 40px rgba(10,6,26,.35)');
    const top = el('div', 'display:flex;align-items:center;justify-content:space-between');
    top.appendChild(el('span', 'font-size:13.5px;color:rgba(255,255,255,.85)', cd.label));
    top.appendChild(el('span', 'font-size:15px;font-weight:800;font-style:italic;letter-spacing:.08em', 'VISA'));
    c.appendChild(top);
    c.appendChild(el('div', 'margin-top:12px;font-size:31px;font-weight:800;letter-spacing:-.4px', cd.amt));
    c.appendChild(el('div', 'margin-top:auto;font-size:14.5px;letter-spacing:2.5px;color:rgba(255,255,255,.92)', cd.num));
    car.appendChild(c);
  });

  /* 服务四宫格 */
  box.appendChild(el('div', 'margin-top:30px;font-size:16.5px;font-weight:700;color:#fff', '服务'));
  const grid = el('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px');
  const SVC = [
    { icon: 'transfer', label: '转账', act() {
        SW.ui.sheet({ host: sheetHost, title: '转账给', items: [
          { v: '埃丝特', label: '埃丝特' }, { v: '伊桑·卡特', label: '伊桑·卡特' }, { v: '梅克尔·汉德雷', label: '梅克尔·汉德雷' }
        ], onPick(v) { SW.toast('已向 ' + v + ' 发起转账（演示）'); } });
      } },
    { icon: 'voucher', label: '卡券', act() { demo('卡券'); } },
    { icon: 'bill', label: '账单', act() { demo('账单'); } },
    { icon: 'grid', label: '更多', act() {
        SW.ui.sheet({ host: sheetHost, title: '更多服务', items: [
          { v: '扫码支付', label: '扫码支付' }, { v: '添加新卡片', label: '添加新卡片' }, { v: '设置', label: '设置' }
        ], onPick(v) { demo(v); } });
      } }
  ];
  SVC.forEach(s => {
    const t = btn('display:flex;flex-direction:column;align-items:center;gap:8px;border-radius:18px;padding:2px 0');
    t.appendChild(el('span', 'width:58px;height:58px;border-radius:18px;background:' + C.tile + ';display:flex;align-items:center;justify-content:center;color:' + C.lav, ic(s.icon, 24)));
    t.appendChild(el('span', 'font-size:12px;color:rgba(255,255,255,.55)', s.label));
    t.addEventListener('click', s.act);
    grid.appendChild(t);
  });
  box.appendChild(grid);

  /* 交易记录 */
  box.appendChild(el('div', 'margin-top:30px;font-size:16.5px;font-weight:700;color:#fff', '交易记录'));
  const tx = btn('display:flex;align-items:center;gap:12px;width:100%;margin-top:14px;background:' + C.card + ';border-radius:18px;padding:15px 16px;text-align:left;color:#fff');
  tx.appendChild(el('span', 'width:40px;height:40px;flex:none;border-radius:13px;background:' + C.panel + ';display:flex;align-items:center;justify-content:center;color:' + C.lav, ic('ticket', 21)));
  tx.appendChild(el('div', 'flex:1;min-width:0', '<div style="font-size:14.5px;font-weight:600">音乐会门票</div><div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:3px">今天 01:11 PM</div>'));
  tx.appendChild(el('span', 'font-size:15px;font-weight:700', '$150.39'));
  tx.addEventListener('click', () => demo('音乐会门票'));
  box.appendChild(tx);
  return box;
}

/* ── 底部导航（fixed=绝对悬浮于 screen；否则随文档流） ── */
function navBar(fixed, activeIdx) {
  const bar = el('div', 'display:flex;align-items:center;justify-content:space-between;padding:10px 24px 32px');
  if (fixed) {
    bar.style.cssText += ';position:absolute;left:0;right:0;bottom:0;z-index:20;background:linear-gradient(180deg,rgba(18,13,28,0) 0%,#120D1C 42%)';
  }
  const ITEMS = [
    { icon: 'home', label: '首页' },
    { icon: 'card', label: '卡片' },
    { icon: 'swap', label: '收付款', center: true },
    { icon: 'grid', label: '格点' },
    { icon: 'pie', label: '统计' }
  ];
  const btns = [];
  function paint(b, on) {
    b.style.background = on ? 'rgba(169,154,232,.16)' : 'transparent';
    b.style.color = on ? '#B7A7EE' : 'rgba(255,255,255,.42)';
  }
  ITEMS.forEach((it, i) => {
    if (it.center) {
      const holder = el('div', 'flex:none;transform:translateY(-16px)');
      const c = btn('width:58px;height:58px;border-radius:19px;background:linear-gradient(150deg,#BBACEF,#8E7BD8);display:flex;align-items:center;justify-content:center;color:' + C.ink + ';box-shadow:0 12px 26px rgba(120,95,220,.45)', ic('swap', 26, ' stroke-width="2"'));
      c.addEventListener('click', () => demo('收付款'));
      holder.appendChild(c); bar.appendChild(holder); btns.push(null);
      return;
    }
    const b = btn('width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;transition:background .2s,color .2s', ic(it.icon, 23));
    b.addEventListener('click', () => {
      btns.forEach(x => { if (x) paint(x[0], x[1] === i); });
      if (i !== activeIdx) demo(it.label);
    });
    bar.appendChild(b); btns.push([b, i]);
  });
  btns.forEach(x => { if (x) paint(x[0], x[1] === activeIdx); });
  return bar;
}

/* ════ e1 · 引导屏（光束 + 双卡漂浮 + 开始使用 → 滚到首页视图） ════ */
function buildE1(p) {
  const scroll = p.scroll;
  scroll.style.padding = '0';

  const page1 = el('div', 'position:relative;height:100%;min-height:822px;overflow:hidden;background:radial-gradient(120% 90% at 80% 90%,#1E1730 0%,#151020 55%,#100B19 100%)');
  page1.appendChild(el('div', 'position:absolute;top:-70px;left:-150px;width:540px;height:600px;pointer-events:none;background:linear-gradient(170deg,rgba(233,224,255,.17) 0%,rgba(233,224,255,.06) 42%,rgba(233,224,255,0) 70%);clip-path:polygon(24% 0,52% 0,86% 100%,0 100%)'));
  stars(page1);

  /* 漂浮卡 A（左上，出画） */
  const cardA = el('div', 'position:absolute;left:-56px;top:110px;width:212px;height:130px;border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;background:linear-gradient(140deg,#C6B7EE 0%,#9C8AD8 100%);transform:rotate(-33deg);box-shadow:0 26px 54px rgba(8,5,20,.55)');
  cardA.appendChild(el('div', 'font-size:9px;color:rgba(255,255,255,.8)', '克里斯汀·沃森'));
  cardA.appendChild(el('div', 'margin-top:6px;font-size:12.5px;font-weight:700;letter-spacing:1.5px;color:rgba(255,255,255,.9)', '5302 8817 **** 2246'));
  cardA.appendChild(el('div', 'margin-top:auto;text-align:right;font-size:11px;font-weight:800;font-style:italic;letter-spacing:.08em;color:#fff', 'VISA'));
  page1.appendChild(cardA);

  /* 漂浮卡 B（$4,325.00） */
  const cardB = el('div', 'position:absolute;left:104px;top:192px;width:230px;height:142px;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;background:linear-gradient(140deg,#D3C6F4 0%,#AC99E2 55%,#917ECE 100%);transform:rotate(-33deg);box-shadow:0 30px 60px rgba(8,5,20,.6)');
  cardB.appendChild(el('div', 'font-size:9.5px;color:rgba(255,255,255,.82)', '克里斯汀·沃森'));
  cardB.appendChild(el('div', 'margin-top:8px;font-size:17px;font-weight:800;color:#fff', '$4,325.00'));
  const bb = el('div', 'margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between');
  bb.appendChild(el('span', 'font-size:9.5px;letter-spacing:1.2px;color:rgba(255,255,255,.85)', '5302 1170 **** 3902'));
  bb.appendChild(el('span', 'font-size:12.5px;font-weight:800;font-style:italic;letter-spacing:.08em;color:#fff', 'VISA'));
  cardB.appendChild(bb);
  page1.appendChild(cardB);

  /* 大标题 + 按钮 + 登录 */
  page1.appendChild(el('div', 'position:absolute;left:26px;right:26px;top:440px;font-size:33px;font-weight:700;line-height:1.34;color:#fff;letter-spacing:.5px', '最轻松的<br>钱包管理方式'));
  const go = btn('position:absolute;left:26px;right:26px;top:600px;height:58px;border-radius:16px;background:linear-gradient(180deg,#B2A2E9,#9C8ADA);color:' + C.ink + ';font-size:16.5px;font-weight:700', '开始使用');
  go.addEventListener('click', () => {
    SW.toast('欢迎来到轻钱包（演示）');
    scroll.scrollTo({ top: scroll.clientHeight, behavior: 'smooth' });
  });
  page1.appendChild(go);
  const login = el('div', 'position:absolute;left:0;right:0;top:690px;text-align:center;font-size:13px;color:rgba(255,255,255,.48)', '已经有账号了？');
  const loginBtn = btn('margin-left:6px;font-size:13px;font-weight:700;color:#fff', '登录');
  loginBtn.addEventListener('click', () => demo('登录'));
  login.appendChild(loginBtn);
  page1.appendChild(login);
  scroll.appendChild(page1);

  /* 第二页：手机②同款首页视图（点「开始使用」滚动到达） */
  const page2 = el('div', '');
  page2.appendChild(homeBlock(p.screen, 10));
  const stNav = navBar(false, 0);
  stNav.style.background = '#120D1C';
  page2.appendChild(stNav);
  scroll.appendChild(page2);
}

/* ════ e2 · 首页 ════ */
function buildE2(p) {
  p.scroll.style.padding = '0';
  p.scroll.appendChild(homeBlock(p.screen, 130));
  p.screen.appendChild(navBar(true, 0));
}

/* ════ e3 · 统计（支出/收入分段真实切换图表与分类） ════ */
function buildE3(p) {
  const scroll = p.scroll;
  scroll.style.padding = '0';
  const box = el('div', 'padding:60px 20px 44px');

  const hd = el('div', 'display:flex;align-items:center;justify-content:space-between');
  const back = btn('width:38px;height:38px;border-radius:13px;display:flex;align-items:center;justify-content:center;color:#fff', ic('back', 22));
  back.addEventListener('click', () => demo('返回'));
  hd.appendChild(back);
  hd.appendChild(el('div', 'font-size:17px;font-weight:700;color:#fff', '统计'));
  hd.appendChild(el('div', 'width:38px;height:38px;flex:none'));
  box.appendChild(hd);

  const segBox = el('div', 'margin-top:20px;color:#fff');
  box.appendChild(segBox);

  const lbl = el('div', 'margin-top:24px;text-align:center;font-size:12.5px;color:rgba(255,255,255,.5)', '总支出');
  const amt = el('div', 'margin-top:4px;text-align:center;font-size:31px;font-weight:800;letter-spacing:-.4px;color:#fff', '$2,364.00');
  box.appendChild(lbl); box.appendChild(amt);

  const chart = el('div', 'margin-top:6px;width:100%;height:200px');
  box.appendChild(chart);
  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const week = el('div', 'display:flex;justify-content:space-between;margin-top:4px;padding:0 2px');
  WD.forEach(w => week.appendChild(el('span', 'font-size:11.5px;color:rgba(255,255,255,.38);transition:color .2s', w)));
  box.appendChild(week);

  const catTitle = el('div', 'margin-top:28px;font-size:16.5px;font-weight:700;color:#fff', '支出分类');
  box.appendChild(catTitle);
  const cats = el('div', 'margin-top:14px;display:flex;flex-direction:column;gap:12px');
  box.appendChild(cats);

  const DATA = {
    exp: { lbl: '总支出', amt: '$2,364.00', peakI: 5, peak: '$472.65', weekI: 5, title: '支出分类',
      data: [48, 30, 54, 40, 66, 92, 44],
      list: [{ icon: 'bag', name: '购物', pct: 25, val: '$875.99' }, { icon: 'bus', name: '交通', pct: 12, val: '$265.34' }] },
    inc: { lbl: '总收入', amt: '$5,847.50', peakI: 2, peak: '$986.20', weekI: 2, title: '收入分类',
      data: [36, 58, 90, 48, 62, 40, 70],
      list: [{ icon: 'brief', name: '工资', pct: 62, val: '$3,620.00' }, { icon: 'trend', name: '理财收益', pct: 21, val: '$1,227.98' }] }
  };

  function render(v) {
    const d = DATA[v];
    lbl.textContent = d.lbl; amt.textContent = d.amt; catTitle.textContent = d.title;
    SW.charts.line(chart, {
      series: [{ data: d.data, color: '#E4DDF9', width: 2.4, fill: true, fillColor: '#B7A5EE' }],
      h: 200, w: 328,
      dot: { i: d.peakI, color: '#fff', r: 4.5 },
      vline: { i: d.peakI, color: 'rgba(255,255,255,.5)', label: d.peak }
    });
    Array.from(week.children).forEach((s, i) => {
      s.style.color = i === d.weekI ? '#fff' : 'rgba(255,255,255,.38)';
      s.style.fontWeight = i === d.weekI ? '700' : '400';
    });
    cats.innerHTML = '';
    d.list.forEach(ct => {
      const card = el('div', 'background:' + C.card + ';border-radius:18px;padding:15px 16px 16px');
      const row = el('div', 'display:flex;align-items:center;gap:12px');
      row.appendChild(el('span', 'width:40px;height:40px;flex:none;border-radius:13px;background:' + C.panel + ';display:flex;align-items:center;justify-content:center;color:' + C.lav, ic(ct.icon, 21)));
      row.appendChild(el('div', 'flex:1;min-width:0', '<div style="font-size:14.5px;font-weight:600;color:#fff">' + ct.name + '</div><div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:3px">' + ct.pct + '%</div>'));
      row.appendChild(el('span', 'font-size:15px;font-weight:700;color:#fff', ct.val));
      card.appendChild(row);
      const track = el('div', 'margin-top:12px;height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden');
      const fillEl = el('span', 'display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#B7A7EE,#8E7BD8);width:0;transition:width .6s cubic-bezier(.3,0,.2,1)');
      track.appendChild(fillEl); card.appendChild(track);
      cats.appendChild(card);
      requestAnimationFrame(() => requestAnimationFrame(() => { fillEl.style.width = ct.pct + '%'; }));
    });
  }
  SW.ui.seg({ el: segBox, items: [{ v: 'exp', label: '支出' }, { v: 'inc', label: '收入' }], value: 'exp', bg: 'rgba(255,255,255,.07)', activeBg: '#E9E2FB', activeColor: C.ink, onChange: render });
  render('exp');
  scroll.appendChild(box);
}

/* ════ 场景注册：浅紫渐变海报 + 三台手机阶梯排布（贴参考图） ════ */
SW.scenes.register({
  id: 'e', num: 5,
  title: '轻钱包 · 管理',
  sub: '引导 · 首页 · 支出统计',
  bg: 'linear-gradient(152deg,#D1C3EF 0%,#C3B3E7 38%,#B19FD9 74%,#A895D4 100%)',
  ambience: { tint: '214,202,248', density: 0.3, maxR: 46 },
  captions: ['移动应用 / 网页设计', '2025 · 概念稿', '轻钱包概念'],
  build(row) {
    row.style.paddingTop = '100px';
    row.style.paddingBottom = '120px';
    [
      ['e1', '轻钱包 · 引导', buildE1, 'translateY(-84px)'],
      ['e2', '轻钱包 · 首页', buildE2, 'translateY(6px)'],
      ['e3', '轻钱包 · 统计', buildE3, 'translateY(92px)']
    ].forEach(cf => {
      const p = SW.phone({ name: cf[0], num: 5, title: cf[1], scale: 0.74, status: 'light', screenBg: C.screen });
      p.wrap.style.transform = cf[3];
      row.appendChild(p.wrap);
      cf[2](p);
    });
  }
});
})();
