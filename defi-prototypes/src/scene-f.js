/* scene-f.js — 图6 · 加密组合三屏（深蓝紫星空感：资产总览 / 发送 / 提现） */
(function () {
'use strict';
const SW = window.SW;

/* ── 内联 SVG 图标（stroke 1.6~1.8 圆头） ── */
const I = {
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  search: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.3"/><path d="m15.8 15.8 4.4 4.4"/></svg>',
  menu: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 7.2h15M4.5 12h15M4.5 16.8h15"/></svg>',
  cal: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.7" stroke-linecap="round"><rect x="3.8" y="5.2" width="16.4" height="15" rx="3.4"/><path d="M3.8 10h16.4M8.4 3.2v3.4M15.6 3.2v3.4"/></svg>',
  chart: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.7" stroke-linecap="round"><rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.4"/><path d="M8.4 15.6v-2.8M12 15.6V8.6M15.6 15.6v-4.6"/></svg>',
  tune: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.7" stroke-linecap="round"><path d="M4.5 8.2h6.2M15.7 8.2h3.8M4.5 15.8h3.8M13 15.8h6.5"/><circle cx="13.3" cy="8.2" r="2.3"/><circle cx="10.7" cy="15.8" r="2.3"/></svg>',
  stake: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.2v8.6M8.8 7.4 12 4.2l3.2 3.2"/><path d="M5 13.4v3.4a2.8 2.8 0 0 0 2.8 2.8h8.4a2.8 2.8 0 0 0 2.8-2.8v-3.4"/></svg>',
  home: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.6 12 4.4l7.5 6.2"/><path d="M6.4 9.4v10.2h11.2V9.4"/></svg>',
  candles: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.7" stroke-linecap="round"><path d="M8 4.6v14.8M16 4.6v14.8"/><rect x="5.8" y="8.6" width="4.4" height="6.4" rx="1.6"/><rect x="13.8" y="6.2" width="4.4" height="6.4" rx="1.6"/></svg>',
  swapH: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 8.4h14.2l-3.1-3.1M19.5 15.6H5.3l3.1 3.1"/></svg>',
  user: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8.2" r="3.6"/><path d="M5 19.6c1.3-3.1 3.9-4.7 7-4.7s5.7 1.6 7 4.7"/></svg>',
  eth: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CFC6FF" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.2 17.6 12 12 15.4 6.4 12Z"/><path d="m6.4 13.8 5.6 3.4 5.6-3.4L12 20.8Z"/></svg>',
  ens: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9FB8FF" stroke-width="1.6" stroke-linejoin="round"><path d="M7 4.5h10l3 5-8 10-8-10Z"/><path d="M4 9.5h16M12 19.5 8.8 9.5 12 4.5l3.2 5Z"/></svg>',
  chevD: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 9.5 5.5 5.5 5.5-5.5"/></svg>',
  swapV: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.8 14.6V5.8M6 8.4l2.8-2.8 2.8 2.8"/><path d="M15.2 9.4v8.8M12.4 15.6l2.8 2.8 2.8-2.8"/></svg>',
  clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3.1 1.9"/></svg>',
  starO: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.7" stroke-linejoin="round"><path d="m12 4 2.4 5.4 5.9.5-4.5 3.9 1.4 5.8L12 16.6l-5.2 3 1.4-5.8-4.5-3.9 5.9-.5Z"/></svg>',
  starF: '<svg width="19" height="19" viewBox="0 0 24 24" fill="#FFD75E" stroke="#FFD75E" stroke-width="1.7" stroke-linejoin="round"><path d="m12 4 2.4 5.4 5.9.5-4.5 3.9 1.4 5.8L12 16.6l-5.2 3 1.4-5.8-4.5-3.9 5.9-.5Z"/></svg>',
  check: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  trend: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 16.5 4.4-5 3.4 2.8 6.2-7.2"/><path d="M14.8 7.1h3.7v3.7"/></svg>',
  bank: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 9.4 7.5-4.8 7.5 4.8Z"/><path d="M6.4 9.4v7M10.2 9.4v7M13.8 9.4v7M17.6 9.4v7M4.5 19.4h15"/></svg>',
  mc: '<svg width="44" height="28" viewBox="0 0 46 29"><circle cx="15" cy="14.5" r="13" fill="#EB001B"/><circle cx="31" cy="14.5" r="13" fill="#F79E1B"/><path d="M23 4.25A13 13 0 0 1 23 24.75 13 13 0 0 1 23 4.25Z" fill="#FF5F00"/></svg>'
};

/* ── 小工具 ── */
function el(tag, css, html) { const n = document.createElement(tag); if (css) n.style.cssText = css; if (html != null) n.innerHTML = html; return n; }
function btn(css, html) {
  const b = el('button', 'appearance:none;border:0;cursor:pointer;background:transparent;color:inherit;font-family:inherit;font-size:inherit;padding:0;margin:0;' + (css || ''), html);
  return SW.ui.press(b);
}
function tap(node, fn) { SW.ui.press(node); node.addEventListener('click', fn); return node; }
function glow(css) { return el('div', 'position:absolute;pointer-events:none;border-radius:50%;z-index:0;' + css); }

/* ₿ 圆徽（B + 上下小竖杠，近似比特币符号，不依赖字体字形） */
function btcBadge(size) {
  const t = Math.max(2, Math.round(size * 0.1)), h = Math.max(3, Math.round(size * 0.13));
  const bar = (top, left) => '<i style="position:absolute;' + top + ';left:' + left + '%;width:2px;height:' + h + 'px;background:#fff;border-radius:1px"></i>';
  return '<span style="position:relative;display:inline-flex;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:linear-gradient(160deg,#F8A63C,#F7821E);align-items:center;justify-content:center;flex:none">' +
    '<b style="font-weight:800;color:#fff;font-size:' + Math.round(size * 0.5) + 'px;transform:translateY(1px)">B</b>' +
    bar('top:' + t + 'px', 44) + bar('top:' + t + 'px', 54) + bar('bottom:' + t + 'px', 44) + bar('bottom:' + t + 'px', 54) +
    '</span>';
}
function coinIconHtml(kind, size) {
  if (kind === 'btc') return btcBadge(size);
  if (kind === 'eth' || kind === 'ens') {
    return '<span style="display:inline-flex;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#272153;align-items:center;justify-content:center;flex:none">' + I[kind] + '</span>';
  }
  return '<span style="display:inline-flex;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#2A2450;color:#CFC6FF;align-items:center;justify-content:center;flex:none;font-weight:800;font-size:' + Math.round(size * 0.38) + 'px">' + kind[0].toUpperCase() + '</span>';
}
/* 玻璃圆钮（头部返回/搜索/菜单等） */
function circleBtn(svg, msg, size) {
  const b = btn('width:' + (size || 40) + 'px;height:' + (size || 40) + 'px;flex:none;border-radius:50%;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center', svg);
  if (msg) b.addEventListener('click', () => SW.toast(msg));
  return b;
}
/* 手机内顶部柔光星云 */
function nebula(p, list) {
  list.forEach(c => p.screen.appendChild(glow(c)));
  p.scroll.style.zIndex = '1';
}
/* 成功浮层（盖在 screen 内） */
function overlay(p, title, sub) {
  const mask = el('div', 'position:absolute;inset:0;z-index:70;background:rgba(8,6,24,.62);display:flex;align-items:center;justify-content:center');
  const card = el('div', 'width:298px;background:#1E1942;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:26px 22px 20px;text-align:center');
  card.appendChild(el('div', 'width:58px;height:58px;margin:0 auto;border-radius:50%;background:#31C96F;display:flex;align-items:center;justify-content:center', I.check));
  card.appendChild(el('div', 'margin-top:14px;font-size:18px;font-weight:800;color:#fff', title));
  card.appendChild(el('div', 'margin-top:7px;font-size:12.5px;line-height:1.55;color:rgba(255,255,255,.66)', sub));
  const ok = btn('margin-top:18px;width:100%;height:44px;border-radius:22px;background:#BCB2F5;color:#1B1540;font-size:15px;font-weight:800', '确定');
  ok.addEventListener('click', () => mask.remove());
  card.appendChild(ok);
  mask.appendChild(card);
  p.screen.appendChild(mask);
}

/* ═══════════ f1 · 资产总览 ═══════════ */
const RANGES = ['24h', '1w', '2w', '1m', '6m', '1y'];
const HI = 4;                                    // 高亮柱下标
const KWOB = [[-.06, .04, -.03, .05, -.04, .06, -.05], [.05, -.04, .06, -.05, .03, -.06, .04], [-.08, .06, .04, -.06, .02, .05, -.04], [0, 0, 0, 0, 0, 0, 0], [.06, -.06, -.04, .08, -.02, .04, .06], [-.1, .08, .06, -.08, .04, .1, .08]];
const SEGS = {
  stock:  { base: [.55, .42, .66, .50, .90, .60, .70], tags: ['3%', '6%', '8%', '12%', '15%', '21%'] },
  bond:   { base: [.30, .38, .34, .42, .62, .36, .46], tags: ['0.4%', '0.9%', '1.2%', '1.8%', '2.6%', '3.5%'] },
  crypto: { base: [.48, .60, .54, .40, .96, .56, .78], tags: ['6%', '12%', '18%', '25%', '34%', '52%'] }
};
const SEGMAP = {
  stock:  { amt: '$5,182.40',  gain: '+$634.22 (13.94%)',   icon: '<span style="display:inline-flex;width:40px;height:40px;border-radius:50%;background:#2FBF71;align-items:center;justify-content:center">' + I.trend + '</span>' },
  bond:   { amt: '$12,960.00', gain: '+$96.40 (0.75%)',     icon: '<span style="display:inline-flex;width:40px;height:40px;border-radius:50%;background:#5B8DEF;align-items:center;justify-content:center">' + I.bank + '</span>' },
  crypto: { amt: '$2,834.83',  gain: '+$5,724.09 (28.63%)', icon: btcBadge(40) }
};
function barsFor(seg, ri) {
  const b = SEGS[seg].base, k = KWOB[ri];
  return { v: b.map((x, i) => Math.max(.14, Math.min(1, x + k[i]))), tag: SEGS[seg].tags[ri] };
}

function buildF1(p) {
  const sc = p.scroll;
  sc.style.padding = '64px 16px 122px';
  nebula(p, [
    'top:-70px;left:-70px;width:230px;height:210px;background:radial-gradient(closest-side,rgba(232,116,224,.20),rgba(232,116,224,0) 72%)',
    'top:-100px;left:56px;width:350px;height:310px;background:radial-gradient(closest-side,rgba(140,104,255,.52),rgba(140,104,255,0) 72%)',
    'bottom:-130px;left:50%;transform:translateX(-50%);width:430px;height:300px;background:radial-gradient(closest-side,rgba(108,84,230,.30),rgba(108,84,230,0) 72%)'
  ]);
  const box = el('div', 'position:relative');
  sc.appendChild(box);

  /* 头部：返回 + 标题 + 搜索 + 菜单 */
  const hd = el('div', 'display:flex;align-items:center;gap:11px');
  hd.appendChild(circleBtn(I.back, '「返回」为原型演示'));
  hd.appendChild(el('div', 'flex:1;min-width:0;font-size:19px;font-weight:800;color:#fff;letter-spacing:.2px', '资产总览'));
  hd.appendChild(circleBtn(I.search, '「搜索」为原型演示'));
  hd.appendChild(circleBtn(I.menu, '「菜单」为原型演示'));
  box.appendChild(hd);

  /* 两张横排玻璃卡 */
  function miniCard(t, s, icon, msg) {
    const c = el('div', 'flex:1;min-width:0;cursor:pointer;background:rgba(151,131,248,.15);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:10px 12px 11px');
    c.appendChild(el('div', 'width:30px;height:30px;border-radius:10px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center', icon));
    c.appendChild(el('div', 'margin-top:7px;font-size:13px;font-weight:700;color:#fff', t));
    c.appendChild(el('div', 'margin-top:2px;font-size:10.5px;color:rgba(255,255,255,.62)', s));
    return tap(c, () => SW.toast(msg));
  }
  const two = el('div', 'display:flex;gap:10px;margin-top:14px');
  two.appendChild(miniCard('收益', '即将到账', I.cal, '「收益 · 即将到账」为原型演示'));
  two.appendChild(miniCard('对比', '资产图表与数据', I.chart, '「对比 · 资产图表与数据」为原型演示'));
  box.appendChild(two);

  /* 分段控件 */
  box.appendChild(el('div', 'margin-top:16px;font-size:15px;font-weight:800;color:#fff', '资产一览'));
  const segBox = el('div', 'margin-top:8px;color:rgba(255,255,255,.78)');
  box.appendChild(segBox);
  let cur = 'crypto', ri = 3;
  SW.ui.seg({
    el: segBox, value: 'crypto', bg: 'rgba(255,255,255,.08)', activeBg: '#AC9EF4', activeColor: '#fff',
    items: [{ v: 'stock', label: '股票' }, { v: 'bond', label: '国债' }, { v: 'crypto', label: '加密' }],
    onChange(v) { cur = v; applySeg(); }
  });

  /* 「资产一览」大卡 */
  const big = el('div', 'margin-top:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.07);border-radius:22px;padding:15px 16px 16px');
  const top = el('div', 'display:flex;align-items:center;gap:11px');
  const coin = el('div', 'width:40px;height:40px;flex:none');
  coin.id = 'sF-f1-coin';
  top.appendChild(coin);
  const mid = el('div', 'flex:1;min-width:0');
  const amt = el('div', 'font-size:24px;font-weight:800;color:#fff;letter-spacing:-.4px');
  amt.id = 'sF-f1-amt';
  const gain = el('div', 'margin-top:2px;font-size:12px;font-weight:700;color:#3DDC84');
  gain.id = 'sF-f1-gain';
  mid.append(amt, gain);
  top.appendChild(mid);
  top.appendChild(circleBtn(I.tune, '「资产调节」为原型演示'));
  big.appendChild(top);

  const chart = el('div', 'position:relative;height:144px;margin-top:24px');
  chart.id = 'sF-f1-chart';
  big.appendChild(chart);

  function renderBars() {
    const d = barsFor(cur, ri);
    SW.charts.bars(chart, { values: d.v.map((v, i) => ({ v: v, color: i === HI ? '#CDC3F8' : 'rgba(224,216,255,.20)' })), h: 144, w: 326, gap: 10, rounded: 11 });
    const bw = (326 - 10 * 6) / 7, cx = HI * (bw + 10) + bw / 2, barTop = 144 - d.v[HI] * 136;
    chart.appendChild(el('div', 'position:absolute;left:' + cx + 'px;top:' + (barTop - 36) + 'px;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;background:#fff;color:#201A44;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;pointer-events:none', '$'));
    chart.appendChild(el('div', 'position:absolute;left:' + cx + 'px;top:113px;transform:translateX(-50%);background:#fff;color:#1B1540;font-size:10px;font-weight:800;padding:3px 8px;border-radius:8px;pointer-events:none', d.tag));
  }
  function applySeg() {
    const m = SEGMAP[cur];
    coin.innerHTML = m.icon; amt.textContent = m.amt; gain.textContent = m.gain;
    renderBars();
  }

  /* 时间段胶囊 */
  const pills = el('div', 'display:flex;gap:8px;margin-top:12px');
  const pbs = [];
  RANGES.forEach((r, i) => {
    const b = btn('flex:1;height:27px;border-radius:9px;background:rgba(255,255,255,.10);color:rgba(255,255,255,.85);font-size:11px;font-weight:600', r);
    b.addEventListener('click', () => { ri = i; paintPills(); renderBars(); });
    pills.appendChild(b); pbs.push(b);
  });
  function paintPills() {
    pbs.forEach((b, i) => {
      const on = i === ri;
      b.style.background = on ? '#fff' : 'rgba(255,255,255,.10)';
      b.style.color = on ? '#1B1540' : 'rgba(255,255,255,.85)';
    });
  }
  big.appendChild(pills);
  box.appendChild(big);
  applySeg(); paintPills();

  /* Staked Ether 质押 ×2 */
  function staked(data) {
    const c = el('div', 'display:flex;align-items:center;gap:12px;margin-top:10px;cursor:pointer;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.06);border-radius:18px;padding:10px 14px');
    c.appendChild(el('div', 'width:40px;height:40px;flex:none;border-radius:14px;background:rgba(255,255,255,.11);display:flex;align-items:center;justify-content:center', I.stake));
    const col = el('div', 'flex:1;min-width:0');
    col.appendChild(el('div', 'display:flex;align-items:center;gap:6px',
      '<span style="font-size:13.5px;font-weight:700;color:#fff">Staked Ether</span>' +
      '<span style="font-size:9px;font-weight:700;color:rgba(255,255,255,.82);background:rgba(255,255,255,.14);padding:1.5px 6px;border-radius:6px">质押</span>'));
    col.appendChild(el('div', 'margin-top:3px;font-size:11.5px;color:rgba(255,255,255,.58)', '$1,940.14'));
    c.appendChild(col);
    const sp = el('div', 'width:90px;height:42px;flex:none');
    c.appendChild(sp);
    SW.charts.spark(sp, data, { color: '#3DDC84', h: 42, w: 90, fill: true, width: 2 });
    return tap(c, () => SW.toast('「Staked Ether 质押」为原型演示'));
  }
  box.appendChild(staked([5, 7, 6, 9, 8, 12, 10, 14]));
  box.appendChild(staked([4, 6, 5, 8, 7, 10, 9, 13]));

  /* 底部导航 5 项 + 中央「+」 */
  const nav = el('div', 'position:absolute;left:0;right:0;bottom:0;z-index:20;height:86px;background:rgba(13,10,30,.92);border-top:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-around;padding:0 10px');
  function nitem(icon, msg) {
    const b = btn('width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:14px', icon);
    b.addEventListener('click', () => SW.toast(msg));
    return b;
  }
  nav.appendChild(nitem(I.home, '「首页」为原型演示'));
  nav.appendChild(nitem(I.candles, '「行情」为原型演示'));
  const plus = btn('width:62px;height:62px;flex:none;margin-top:-26px;border-radius:50%;background:linear-gradient(180deg,#5A86FF,#2F55EC);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 5px rgba(90,130,255,.16),0 12px 26px rgba(62,98,255,.5)',
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg>');
  plus.addEventListener('click', () => {
    SW.ui.sheet({
      host: p.screen, title: '快捷操作',
      items: [{ v: 'topup', label: '充值' }, { v: 'send', label: '发送' }, { v: 'swap', label: '兑换' }, { v: 'withdraw', label: '提现' }],
      onPick(v) { SW.toast('「' + ({ topup: '充值', send: '发送', swap: '兑换', withdraw: '提现' }[v]) + '」为原型演示'); }
    });
  });
  nav.appendChild(plus);
  nav.appendChild(nitem(I.swapH, '「划转」为原型演示'));
  nav.appendChild(nitem(I.user, '「我的」为原型演示'));
  p.screen.appendChild(nav);
}

/* ═══════════ f2 · 发送 ═══════════ */
const TOKENS = {
  from: [
    { sym: 'ETH',  icon: 'eth',  name: '以太坊',       amt: '46.0546' },
    { sym: 'WBTC', icon: 'btc',  name: '包装比特币',   amt: '0.0642' },
    { sym: 'SOL',  icon: 'sol',  name: '索拉纳',       amt: '812.44' },
    { sym: 'USDT', icon: 'usdt', name: '泰达币',       amt: '21,112.00' }
  ],
  to: [
    { sym: 'ENS',  icon: 'ens',  name: '以太坊域名服务', amt: '6521.366' },
    { sym: 'UNI',  icon: 'uni',  name: 'Uniswap',        amt: '1,204.50' },
    { sym: 'AAVE', icon: 'aave', name: 'Aave',           amt: '88.20' },
    { sym: 'LINK', icon: 'link', name: 'Chainlink',      amt: '3,210.88' }
  ]
};

function buildF2(p) {
  const sc = p.scroll;
  sc.style.padding = '64px 16px 130px';
  nebula(p, [
    'top:-90px;left:50%;transform:translateX(-50%);width:330px;height:260px;background:radial-gradient(closest-side,rgba(126,96,235,.34),rgba(126,96,235,0) 72%)',
    'top:-40px;right:-90px;width:230px;height:200px;background:radial-gradient(closest-side,rgba(232,116,224,.12),rgba(232,116,224,0) 70%)'
  ]);
  const box = el('div', 'position:relative');
  sc.appendChild(box);

  /* 头部 */
  const hd = el('div', 'display:flex;align-items:center;gap:12px');
  hd.appendChild(circleBtn(I.back, '「返回」为原型演示'));
  hd.appendChild(el('div', 'flex:1;min-width:0;font-size:19px;font-weight:800;color:#fff;letter-spacing:.2px', '发送'));
  hd.appendChild(circleBtn(I.menu, '「菜单」为原型演示'));
  box.appendChild(hd);

  /* From / To 卡状态 */
  let from = { sym: 'ETH', icon: 'eth', amt: '46.0546' };
  let to = { sym: 'ENS', icon: 'ens', amt: '6521.366' };
  const renders = [];

  function mkCard(side, key, label) {
    const card = el('div', 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.06);border-radius:20px;padding:14px 16px 15px');
    const r1 = el('div', 'display:flex;align-items:center;justify-content:space-between;font-size:12px;color:rgba(255,255,255,.62)');
    r1.append(el('span', '', label), el('span', '', '可用 21,112.00'));
    card.appendChild(r1);
    const pick = btn('display:flex;align-items:center;gap:9px;margin-top:12px', '');
    const ic = el('span', 'display:inline-flex;flex:none');
    const sym = el('span', 'font-size:15px;font-weight:700;color:#fff');
    pick.append(ic, sym, el('span', 'line-height:0;display:inline-flex', I.chevD));
    card.appendChild(pick);
    const amt = el('div', 'margin-top:6px;font-size:28px;font-weight:800;color:#fff;letter-spacing:-.4px');
    card.appendChild(amt);
    const r3 = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:10px');
    r3.appendChild(el('span', 'font-size:12px;color:rgba(255,255,255,.55)', '最低 10 USDT'));
    const mx = btn('font-size:13px;font-weight:700;color:#fff;padding:2px 2px', '最大');
    r3.appendChild(mx);
    card.appendChild(r3);

    function render() {
      ic.innerHTML = coinIconHtml(side.icon, 38);
      sym.textContent = side.sym;
      amt.textContent = side.amt;
    }
    render();
    renders.push(render);
    mx.addEventListener('click', () => { side.amt = '21,112.00'; render(); SW.audio.pop(); SW.toast('已填入最大可用金额'); });
    pick.addEventListener('click', () => {
      SW.ui.sheet({
        host: p.screen, title: '选择代币', value: side.sym,
        items: TOKENS[key].map(t => ({ v: t.sym, label: t.sym, desc: t.name })),
        onPick(v) {
          const t = TOKENS[key].find(x => x.sym === v);
          side.sym = t.sym; side.icon = t.icon; side.amt = t.amt;
          render();
        }
      });
    });
    return card;
  }

  box.appendChild(mkCard(from, 'from', '从'));
  const swap = btn('position:relative;z-index:5;display:flex;width:46px;height:46px;margin:-23px auto;border-radius:50%;background:#211C44;border:1px solid rgba(255,255,255,.16);align-items:center;justify-content:center', I.swapV);
  swap.addEventListener('click', () => {
    const f = [from.sym, from.icon, from.amt];
    from.sym = to.sym; from.icon = to.icon; from.amt = to.amt;
    to.sym = f[0]; to.icon = f[1]; to.amt = f[2];
    renders.forEach(fn => fn());
    SW.audio.pop();
  });
  box.appendChild(swap);
  box.appendChild(mkCard(to, 'to', '到'));

  /* 账户条 */
  const accName = el('div', 'font-size:13.5px;font-weight:700;color:#fff', '账户 632');
  const accBal = el('div', 'margin-top:1px;font-size:11.5px;color:rgba(255,255,255,.55)', '余额: 0 ETH');
  const accBtn = btn('display:flex;align-items:center;gap:11px;width:100%;margin-top:14px;text-align:left;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.05);border-radius:16px;padding:9px 12px', '');
  const av = SW.ui.avatar({ txt: '632', bg: 'linear-gradient(135deg,#8E79F2,#5D4FD8)', size: 38 });
  const accCol = el('div', 'flex:1;min-width:0');
  accCol.append(accName, accBal);
  accBtn.append(av, accCol, el('span', 'line-height:0;display:inline-flex', I.chevD));
  accBtn.addEventListener('click', () => {
    SW.ui.sheet({
      host: p.screen, title: '选择账户', value: '632',
      items: [{ v: '632', label: '账户 632', desc: '余额: 0 ETH' }, { v: '207', label: '账户 207', desc: '余额: 1.204 ETH' }, { v: '089', label: '账户 89', desc: '余额: 0.5 ETH' }],
      onPick(v) {
        accName.textContent = '账户 ' + v;
        accBal.textContent = v === '632' ? '余额: 0 ETH' : (v === '207' ? '余额: 1.204 ETH' : '余额: 0.5 ETH');
        av.textContent = v;
        SW.audio.pop();
      }
    });
  });
  box.appendChild(accBtn);

  /* 底部 取消 / 下一步 */
  const bar = el('div', 'position:absolute;left:16px;right:16px;bottom:34px;z-index:20;display:flex;gap:12px');
  const cancel = btn('flex:1;height:48px;border-radius:24px;background:rgba(255,255,255,.08);color:#fff;font-size:15px;font-weight:700', '取消');
  cancel.addEventListener('click', () => SW.toast('已取消（演示）'));
  const next = btn('flex:1;height:48px;border-radius:24px;background:#BCB2F5;color:#1B1540;font-size:15px;font-weight:800', '下一步');
  next.addEventListener('click', () => overlay(p, '发送成功', from.sym + ' ' + from.amt + ' 已成功转出至 ' + to.sym + '（原型演示）'));
  bar.append(cancel, next);
  p.screen.appendChild(bar);
}

/* ═══════════ f3 · 提现 ═══════════ */
const METHODS = {
  btc: { t: 'BTC', name: 'Bitcoin',  icon: 'btc' },
  eth: { t: 'ETH', name: 'Ethereum', icon: 'eth' },
  sol: { t: 'SOL', name: 'Solana',   icon: 'sol' }
};

function buildF3(p) {
  const sc = p.scroll;
  sc.style.padding = '64px 16px 30px';
  nebula(p, [
    'top:-80px;left:50%;transform:translateX(-50%);width:340px;height:240px;background:radial-gradient(closest-side,rgba(170,140,255,.20),rgba(170,140,255,0) 72%)'
  ]);
  const box = el('div', 'position:relative');
  sc.appendChild(box);

  /* 头部：返回 + 标题 + 搜索 + 星标（可点亮） */
  const hd = el('div', 'display:flex;align-items:center;gap:11px');
  hd.appendChild(circleBtn(I.back, '「返回」为原型演示'));
  hd.appendChild(el('div', 'flex:1;min-width:0;font-size:19px;font-weight:800;color:#fff;letter-spacing:.2px', '提现'));
  hd.appendChild(circleBtn(I.search, '「搜索」为原型演示'));
  let lit = false;
  const star = circleBtn(I.starO, '');
  star.addEventListener('click', () => {
    lit = !lit;
    star.innerHTML = lit ? I.starF : I.starO;
    SW.toast(lit ? '已加入自选' : '已取消自选');
  });
  hd.appendChild(star);
  box.appendChild(hd);

  let mk = 'btc';

  /* 选择方式 + BTC 下拉 */
  const row1 = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:18px');
  row1.appendChild(el('div', 'font-size:15px;font-weight:800;color:#fff', '选择方式'));
  const mLab = el('span', 'font-weight:700', 'BTC');
  const mBtn = btn('display:flex;align-items:center;gap:6px;font-size:14px;color:#fff;padding:2px', '');
  mBtn.append(mLab, el('span', 'line-height:0;display:inline-flex', I.chevD));
  row1.appendChild(mBtn);
  box.appendChild(row1);

  /* 币种卡 */
  const mtIc = el('span', 'display:inline-flex;flex:none');
  const mtSym = el('div', 'font-size:15px;font-weight:800;color:#fff', 'BTC');
  const mtName = el('div', 'margin-top:2px;font-size:11.5px;color:rgba(255,255,255,.55)', 'Bitcoin');
  const mtBal = el('div', 'font-size:15px;font-weight:800;color:#fff', '6.555 BTC');
  const mcard = el('div', 'display:flex;align-items:center;gap:12px;margin-top:10px;background:rgba(17,12,48,.42);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:14px 16px');
  const mc1 = el('div', 'flex:1;min-width:0');
  mc1.append(mtSym, mtName);
  const mc2 = el('div', 'text-align:right');
  mc2.append(mtBal, el('div', 'margin-top:2px;font-size:11.5px;color:rgba(255,255,255,.55)', '可用'));
  mcard.append(mtIc, mc1, mc2);
  function paintMethod() {
    const m = METHODS[mk];
    mtIc.innerHTML = coinIconHtml(m.icon, 44);
    mtSym.textContent = m.t; mtName.textContent = m.name;
    mtBal.textContent = '6.555 ' + m.t;
    numEl.textContent = m.t + ' ' + numTxt;
    mLab.textContent = m.t;
  }
  mBtn.addEventListener('click', () => {
    SW.ui.sheet({
      host: p.screen, title: '选择方式', value: mk,
      items: Object.keys(METHODS).map(k => ({ v: k, label: METHODS[k].t, desc: METHODS[k].name })),
      onPick(v) { mk = v; paintMethod(); }
    });
  });
  box.appendChild(mcard);

  /* 提现方式 + 时钟 */
  const row2 = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:18px');
  row2.appendChild(el('div', 'font-size:15px;font-weight:800;color:#fff', '提现方式'));
  row2.appendChild(circleBtn(I.clock, '「到账时间」为原型演示', 36));
  box.appendChild(row2);

  /* MasterCard 渐变大卡 */
  const card = el('div', 'position:relative;overflow:hidden;height:178px;margin-top:10px;border-radius:22px;padding:17px 18px;display:flex;flex-direction:column;color:#fff;background:linear-gradient(150deg,#B79CF9 0%,#A485F2 48%,#8F6FE9 100%)');
  card.appendChild(el('div', 'position:absolute;top:-60px;right:-40px;width:240px;height:200px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.28),rgba(255,255,255,0) 72%);pointer-events:none'));
  const ch = el('div', 'position:relative;display:flex;align-items:flex-start;justify-content:space-between');
  ch.appendChild(el('div', 'font-size:15px;font-weight:800', 'Master Card'));
  ch.appendChild(el('div', 'line-height:0', I.mc));
  card.appendChild(ch);
  card.appendChild(el('div', 'position:relative;margin-top:auto;font-size:26px;font-weight:800;letter-spacing:-.3px', '$12,362.00'));
  const cb = el('div', 'position:relative;display:flex;align-items:baseline;justify-content:space-between;margin-top:6px');
  cb.appendChild(el('div', 'font-size:13px;color:rgba(255,255,255,.92)', '伊桑·卡特'));
  cb.appendChild(el('div', 'font-size:14px;font-weight:700;letter-spacing:1px', '****3262'));
  card.appendChild(cb);
  tap(card, () => SW.toast('「Master Card」为原型演示'));
  box.appendChild(card);

  /* 提现数量 + 全部下拉 */
  const row3 = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:18px');
  row3.appendChild(el('div', 'font-size:15px;font-weight:800;color:#fff', '提现数量'));
  const allLab = el('span', 'font-weight:700', '全部');
  const allBtn = btn('display:flex;align-items:center;gap:6px;font-size:14px;color:#fff;padding:2px', '');
  allBtn.append(allLab, el('span', 'line-height:0;display:inline-flex', I.chevD));
  row3.appendChild(allBtn);
  box.appendChild(row3);

  const numEl = el('div', 'font-size:17px;font-weight:800;color:#fff', 'BTC 3.655');
  const usdEl = el('div', 'font-size:13.5px;color:rgba(255,255,255,.8)', '85,130 USD');
  const row4 = el('div', 'display:flex;align-items:baseline;justify-content:space-between;margin-top:12px');
  row4.append(numEl, usdEl);
  box.appendChild(row4);

  let numTxt = '3.655';
  const RATE = 23291.66;
  allBtn.addEventListener('click', () => {
    SW.ui.sheet({
      host: p.screen, title: '提现数量', value: allLab.textContent,
      items: [{ v: '全部', label: '全部' }, { v: '一半', label: '一半' }, { v: '自定义', label: '自定义' }],
      onPick(v) {
        if (v === '自定义') { SW.toast('「自定义金额」为原型演示'); return; }
        allLab.textContent = v;
        const n = v === '全部' ? 6.555 : 3.2775;
        numTxt = n.toFixed(3);
        numEl.textContent = METHODS[mk].t + ' ' + numTxt;
        usdEl.textContent = Math.round(n * RATE).toLocaleString('en-US') + ' USD';
        SW.audio.pop();
      }
    });
  });

  /* 提现按钮 → 成功浮层 */
  const wd = btn('width:100%;height:52px;margin-top:20px;border-radius:26px;background:linear-gradient(180deg,#9184F4,#8375EF);color:#fff;font-size:15px;font-weight:800', '提现');
  wd.addEventListener('click', () => overlay(p, '提现申请已提交', METHODS[mk].t + ' ' + numTxt + ' ≈ ' + usdEl.textContent + ' · 预计 24 小时内到账（原型演示）'));
  box.appendChild(wd);

  paintMethod();
}

/* ═══════════ 场景注册：深蓝紫海报 + 三机阶梯排布（①最高 ②略低 ③更靠下） ═══════════ */
SW.scenes.register({
  id: 'f', num: 6,
  title: '加密组合 · 存取',
  sub: '资产总览 · 发送 · 提现',
  bg: 'linear-gradient(178deg,#615BCB 0%,#5750C2 52%,#6A62D4 100%)',
  build(row) {
    const p1 = SW.phone({ name: 'f1', num: 6, title: '资产总览', status: 'light', screenBg: '#16132B' });
    p1.wrap.style.transform = 'translateY(-44px)';
    row.appendChild(p1.wrap);
    buildF1(p1);

    const p2 = SW.phone({ name: 'f2', num: 6, title: '发送', status: 'light', screenBg: '#141129' });
    row.appendChild(p2.wrap);
    buildF2(p2);

    const p3 = SW.phone({ name: 'f3', num: 6, title: '提现', status: 'light', screenBg: 'linear-gradient(180deg,#443AA0 0%,#4E44B2 42%,#41379B 100%)' });
    p3.wrap.style.transform = 'translateY(44px)';
    row.appendChild(p3.wrap);
    buildF3(p3);
  }
});
})();
