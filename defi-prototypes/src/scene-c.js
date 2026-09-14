/* scene-c.js — 图3 · EcoFin / Plum 智能储蓄两屏（亮紫 + 纯黑双色调） */
(function () {
'use strict';
const SW = window.SW;

/* ── 内联 SVG 图标（stroke 1.7 圆头，currentColor） ── */
function ic(name, s) {
  const B = {
    bell: '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.6-2.5 8.5-2.5 8.5h17S18 15.1 18 8.5Z"/><path d="M13.6 20.5a1.9 1.9 0 0 1-3.2 0"/>',
    flame: '<path fill="currentColor" stroke="none" d="M12.2 2.2c.6 3.2-.7 5-2.3 6.7-1.7 1.8-3.1 3.5-3.1 6a5.4 5.4 0 0 0 10.8 0c0-1.9-.9-3.4-1.9-4.8-.3 1-.9 1.9-1.8 2.4.5-3.3-.3-7-1.7-10.3Z"/>',
    home: '<path d="M4 10.7 12 4l8 6.7"/><path d="M6 9.5V20h12V9.5"/>',
    card: '<rect x="2.8" y="5.2" width="18.4" height="13.6" rx="3.2"/><path d="M2.8 9.6h18.4"/>',
    chart: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.5"/><path d="M8.2 15.5v-3.2"/><path d="M12 15.5V8.5"/><path d="M15.8 15.5v-4.8"/>',
    photo: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.5"/><circle cx="9" cy="9" r="1.5"/><path d="m5 17.5 4-4a1.8 1.8 0 0 1 2.5 0l3 3"/><path d="m13.5 15 1.5-1.5a1.8 1.8 0 0 1 2.5 0l2.5 2.5"/>',
    plus: '<path d="M12 5.5v13"/><path d="M5.5 12h13"/>',
    minus: '<path d="M5.5 12h13"/>',
    chev: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    chevs: '<path d="m6.5 6.5 5.5 5.5-5.5 5.5"/><path d="m13 6.5 5.5 5.5-5.5 5.5"/>',
    star: '<path fill="currentColor" stroke="none" d="M12 2.8 14 9.9l7.1 2.1-7.1 2.1L12 21.2 9.9 14.1 2.8 12l7.1-2.1Z"/>',
    ban: '<circle cx="12" cy="12" r="8.4"/><path d="m6.3 17.7 11.4-11.4"/>'
  }[name];
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + B + '</svg>';
}

/* ── 小工具 ── */
function div(css, html) { const d = document.createElement('div'); d.style.cssText = css; if (html != null) d.innerHTML = html; return d; }
function tap(el, fn) { SW.ui.press(el); el.addEventListener('click', fn); return el; }

const C = {
  hd: 'linear-gradient(168deg,#977DF7 0%,#8B6DF4 52%,#8465F2 100%)',
  panel: '#7C5BE8',
  dark: '#1A191F',
  circle: '#272333',
  purple: '#8B6FF0',
  lav: '#A78BFA',
  ink: '#14101F'
};
const NAV = [
  { label: '首页', icon: 'home' },
  { label: '卡片', icon: 'card' },
  { label: '图表', icon: 'chart' },
  { label: '其他', icon: 'photo' }
];

/* ── 底部导航（绝对定位盖在 screen 底部，紫色胶囊 active） ── */
function navBar(p, activeIdx) {
  const bar = div('position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:center;justify-content:space-around;padding:8px 12px 24px;background:#0A0A0D');
  const btns = [];
  function paint(b, on) {
    b.style.background = on ? C.purple : 'transparent';
    b.style.color = on ? '#170B33' : 'rgba(255,255,255,.6)';
  }
  NAV.forEach((it, i) => {
    const b = document.createElement('button');
    b.style.cssText = 'border:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 15px;border-radius:999px;transition:background .2s,color .2s';
    const box = div('width:20px;height:20px;line-height:0', ic(it.icon, 20));
    const lb = div('font-size:11px;font-weight:700', it.label);
    b.appendChild(box); b.appendChild(lb);
    b.addEventListener('click', () => {
      SW.audio.tap();
      btns.forEach(pair => paint(pair[0], pair[1] === i));
      if (i !== activeIdx) SW.toast('「' + it.label + '」为原型演示');
    });
    bar.appendChild(b); btns.push([b, i]);
  });
  btns.forEach(pair => paint(pair[0], pair[1] === activeIdx));
  p.screen.appendChild(bar);
}

/* ── 同款亮紫头部：头像行 + 资产标题（金额行由调用方追加） ── */
function purpleHeader(brand) {
  const hd = div('margin:58px 10px 0;border-radius:26px;background:' + C.hd + ';padding:18px 18px 22px;box-shadow:0 16px 36px rgba(88,58,200,.3)');
  const r1 = div('display:flex;align-items:center;gap:11px');
  r1.appendChild(SW.ui.avatar({ txt: '埃', bg: '#6E46E6', size: 40, border: 'rgba(255,255,255,.85)' }));
  r1.appendChild(div('line-height:1.3', '<div style="font-size:12px;color:rgba(255,255,255,.8)">你好 👋</div><div style="font-size:16px;font-weight:800;color:#fff">埃丝特</div>'));
  const bell = document.createElement('button');
  bell.style.cssText = 'margin-left:auto;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.92);color:#8A66F0;display:flex;align-items:center;justify-content:center;cursor:pointer';
  bell.innerHTML = ic('bell', 19);
  tap(bell, () => SW.toast('「通知」为原型演示'));
  r1.appendChild(bell);
  hd.appendChild(r1);
  hd.appendChild(div('margin-top:14px;font-size:12px;color:rgba(255,255,255,.75)', '你的 ' + brand + ' 资产'));
  return hd;
}

/* ── 金额行：$142.83 + 深紫半透明 pill ── */
function amountRow(id, pill) {
  return div('display:flex;align-items:center;gap:10px;margin-top:3px',
    '<div id="' + id + '" style="font-size:34px;font-weight:800;color:#fff;letter-spacing:-.5px">$142.83</div>' +
    '<div style="font-size:11px;font-weight:700;color:#fff;background:rgba(56,30,138,.35);padding:5px 10px;border-radius:999px">' + pill + '</div>');
}

/* ── 深灰横条卡：图标圆 + 两行文字 + 右侧内容 ── */
function rowCard(o) {
  const card = div('display:flex;align-items:center;gap:12px;background:' + C.dark + ';border-radius:18px;padding:14px 15px');
  card.appendChild(div('width:36px;height:36px;border-radius:50%;background:' + C.circle + ';display:flex;align-items:center;justify-content:center;font-size:17px;flex:none;color:' + C.lav, o.icon));
  card.appendChild(div('flex:1;min-width:0', '<div style="font-size:14px;font-weight:700;color:#fff">' + o.title + '</div><div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">' + o.sub + '</div>'));
  if (o.right) card.appendChild(o.right);
  if (o.onClick) tap(card, o.onClick);
  return card;
}
function chevRight() { return div('color:rgba(255,255,255,.6);line-height:0', ic('chev', 18)); }
function challengeCard() {
  const c = rowCard({ icon: '🏅', title: '1P 挑战', sub: '一年存下 $667', right: chevRight(), onClick: () => SW.toast('「1P 挑战」为原型演示') });
  return c;
}

/* ════ c1 · EcoFin 主页 ════ */
function buildC1(p) {
  const page = div('padding-bottom:118px');
  p.scroll.appendChild(page);

  const hd = purpleHeader('EcoFin');
  page.appendChild(hd);
  hd.appendChild(amountRow('sC-c1-total', '▲ $23.91 较上周'));

  /* 行③ 内嵌深紫面板（可收起） */
  const panel = div('position:relative;margin-top:16px;background:' + C.panel + ';border-radius:20px;padding:14px 16px;overflow:hidden');
  panel.id = 'sC-c1-panel';
  panel.appendChild(div('font-size:12px;font-weight:600;line-height:1.65;color:#fff;padding-right:26px', '完成设置（已完成 2/5）是开户流程的关键一步'));
  const x = document.createElement('button');
  x.textContent = '✕';
  x.style.cssText = 'position:absolute;top:10px;right:10px;width:22px;height:22px;border:0;border-radius:50%;background:rgba(255,255,255,.28);color:#fff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center';
  x.addEventListener('click', () => {
    panel.style.transition = 'max-height .32s ease,opacity .26s ease,margin .32s ease,padding .32s ease';
    panel.style.maxHeight = panel.scrollHeight + 'px';
    requestAnimationFrame(() => {
      panel.style.maxHeight = '0px'; panel.style.opacity = '0';
      panel.style.marginTop = '0px'; panel.style.paddingTop = '0px'; panel.style.paddingBottom = '0px';
    });
    setTimeout(() => { panel.style.display = 'none'; }, 340);
  });
  panel.appendChild(x);
  const cta = div('display:flex;align-items:center;gap:10px;margin-top:12px;background:#fff;border-radius:999px;padding:5px 14px 5px 5px;cursor:pointer');
  cta.appendChild(div('width:30px;height:30px;border-radius:50%;background:' + C.ink + ';color:#fff;display:flex;align-items:center;justify-content:center;flex:none', ic('chev', 15)));
  cta.appendChild(div('flex:1;text-align:center;font-size:14px;font-weight:800;color:' + C.ink, '完成设置'));
  cta.appendChild(div('color:' + C.ink + ';line-height:0', ic('chevs', 15)));
  tap(cta, () => SW.toast('已帮你记下进度（演示）'));
  panel.appendChild(cta);
  hd.appendChild(panel);

  /* 黑区：两列卡（白卡 Brain + 深灰卡 每周动态） */
  const two = div('display:flex;gap:10px;margin:16px 10px 0');
  const cw = div('flex:1;background:#fff;border-radius:22px;padding:16px 14px');
  const whead = div('display:flex;align-items:center;gap:8px');
  whead.appendChild(div('width:28px;height:28px;border-radius:50%;background:' + C.ink + ';color:#fff;display:flex;align-items:center;justify-content:center;flex:none', ic('flame', 15)));
  whead.appendChild(div('font-size:15px;font-weight:800;color:' + C.ink, 'Brain'));
  cw.appendChild(whead);
  cw.appendChild(div('margin-top:14px;font-size:24px;font-weight:800;color:#0F0C18;letter-spacing:-.4px', '$142.83'));
  cw.appendChild(div('margin-top:2px;font-size:11px;color:#8B8798', '累计总额'));
  two.appendChild(cw);

  const cd = div('flex:1;background:' + C.dark + ';border-radius:22px;padding:16px 14px;display:flex;flex-direction:column');
  cd.appendChild(div('font-size:13px;font-weight:800;color:#fff', '每周动态'));
  cd.appendChild(div('margin-top:3px;font-size:11px;color:rgba(255,255,255,.55)', '+¥15.43 每日现金'));
  const bars = div('margin-top:10px;width:141px;height:44px');
  bars.id = 'sC-c1-bars';
  cd.appendChild(bars);
  two.appendChild(cd);
  page.appendChild(two);
  const vals = [.3, .48, .38, .95, .55, .7, .42];
  SW.charts.bars(bars, { values: vals.map((v, i) => ({ v: v, color: i === 3 ? '#8B7CF6' : 'rgba(255,255,255,.3)' })), h: 44, w: 141, gap: 6 });

  /* 黑区：两行横条卡 */
  const ra = rowCard({
    icon: ic('star', 18), title: '自动储蓄', sub: '首个生效的储蓄规则',
    right: div('text-align:right', '<div style="font-size:14px;font-weight:800;color:#fff">$150.87</div><div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">累计总额</div>')
  });
  ra.style.margin = '10px 10px 0';
  page.appendChild(ra);
  const rb = challengeCard();
  rb.style.margin = '10px 10px 0';
  page.appendChild(rb);

  navBar(p, 0);
}

/* ════ c2 · Plum 储蓄页 ════ */
function buildC2(p) {
  let pocket = 20.55, total = 142.83;
  const money = n => '$' + n.toFixed(2);

  const page = div('padding-bottom:118px');
  p.scroll.appendChild(page);

  const hd = purpleHeader('Plum');
  page.appendChild(hd);
  hd.appendChild(amountRow('sC-c2-total', '$0 可用'));
  const totalEl = hd.querySelector('#sC-c2-total');

  /* 零钱袋横条卡（余额可被存取改变） */
  const pkVal = div('font-size:16px;font-weight:800;color:#fff', money(pocket));
  pkVal.id = 'sC-c2-pocket';
  const pk = rowCard({ icon: '💰', title: '零钱袋', sub: '随存随取', right: pkVal });
  pk.style.margin = '14px 10px 0';
  page.appendChild(pk);

  /* 4 宫格操作 */
  function openSheet(title, dir) {
    SW.ui.sheet({
      host: p.screen, title: title,
      items: [{ v: 10, label: '¥10' }, { v: 50, label: '¥50' }, { v: 100, label: '¥100' }, { v: 200, label: '¥200' }],
      onPick(v) {
        if (dir < 0 && v > pocket) { SW.toast('超出零钱袋可用余额'); return; }
        pocket += dir * v; total += dir * v;
        pkVal.textContent = money(pocket);
        totalEl.textContent = money(total);
        SW.audio.pop();
        SW.toast((dir > 0 ? '已存入 ¥' : '已从零钱袋取出 ¥') + v + '（演示）');
      }
    });
  }
  function tile(iconHtml, label, onClick, color) {
    const t = document.createElement('button');
    t.style.cssText = 'border:0;cursor:pointer;background:' + C.dark + ';border-radius:18px;padding:16px 0 13px;display:flex;flex-direction:column;align-items:center;gap:8px;color:#fff';
    t.appendChild(div('line-height:0;color:' + (color || '#fff'), iconHtml));
    t.appendChild(div('font-size:12px;font-weight:600', label));
    tap(t, onClick);
    return t;
  }
  const grid = div('display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 10px 0');
  grid.appendChild(tile(ic('plus', 22), '存入', () => openSheet('存入零钱袋', 1)));
  grid.appendChild(tile(ic('minus', 22), '取出', () => openSheet('从零钱袋取出', -1)));
  grid.appendChild(tile(ic('flame', 22), 'Brain', () => SW.toast('「Brain」为原型演示'), C.lav));
  grid.appendChild(tile(ic('ban', 22), '分流', () => SW.toast('「分流」为原型演示'), C.lav));
  page.appendChild(grid);

  /* 两列卡：紫卡 现金 ISA + 白卡 Plum 利息 */
  const two = div('display:flex;gap:10px;margin:14px 10px 0');
  const isa = div('flex:1;position:relative;border-radius:22px;padding:14px;background:linear-gradient(165deg,#977DF7,#8157EE);color:#fff;overflow:hidden');
  isa.appendChild(div('position:absolute;top:10px;right:10px;background:#fff;color:#7C52E8;font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px', 'New'));
  isa.appendChild(div('line-height:0;color:#fff', ic('flame', 20)));
  isa.appendChild(div('margin-top:10px;font-size:14px;font-weight:700', '现金 ISA'));
  isa.appendChild(div('margin-top:2px;font-size:26px;font-weight:800;letter-spacing:-.4px', '5.17% AER'));
  isa.appendChild(div('margin-top:2px;font-size:11px;color:rgba(255,255,255,.75)', '免税储蓄'));
  two.appendChild(isa);
  const int = div('flex:1;background:#fff;border-radius:22px;padding:14px');
  int.appendChild(div('line-height:0;color:' + C.ink, ic('flame', 20)));
  int.appendChild(div('margin-top:10px;font-size:14px;font-weight:700;color:' + C.ink, 'Plum 利息'));
  int.appendChild(div('margin-top:2px;font-size:26px;font-weight:800;color:#0F0C18;letter-spacing:-.4px', '8.11%'));
  int.appendChild(div('margin-top:2px;font-size:11px;color:#8B8798', '浮动年利率'));
  two.appendChild(int);
  page.appendChild(two);

  /* 开始使用 + 挑战卡 */
  page.appendChild(div('margin:16px 12px 0;font-size:13px;font-weight:800;color:#fff', '开始使用'));
  const ch = challengeCard();
  ch.style.margin = '8px 10px 0';
  page.appendChild(ch);

  navBar(p, 1);
}

/* ════ 场景注册：#ECEAF3 海报 + 白色椭圆光斑 + 双机横排（右台略低） ════ */
SW.scenes.register({
  id: 'c', num: 3,
  title: 'EcoFin / Plum · 智能储蓄',
  sub: '紫色储蓄主页 ×2',
  bg: '#ECEAF3',
  build(row) {
    [[720, 'top:-260px;left:-130px'], [680, 'top:-220px;right:-180px'], [640, 'bottom:-280px;left:26%']].forEach(b => {
      row.parentNode.insertBefore(div(
        'position:absolute;z-index:0;pointer-events:none;border-radius:50%;' +
        'background:radial-gradient(circle,rgba(255,255,255,.85) 0%,rgba(255,255,255,0) 70%);' +
        'width:' + b[0] + 'px;height:' + b[0] + 'px;' + b[1]), row);
    });
    const p1 = SW.phone({ name: 'c1', num: 3, title: 'EcoFin 主页', screenBg: '#0A0A0D' });
    row.appendChild(p1.wrap);
    buildC1(p1);
    const p2 = SW.phone({ name: 'c2', num: 3, title: 'Plum 储蓄', screenBg: '#0A0A0D' });
    p2.wrap.style.transform = 'translateY(36px)';
    row.appendChild(p2.wrap);
    buildC2(p2);
  }
});
})();
