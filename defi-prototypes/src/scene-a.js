/* scene-a.js — 图1 · Solidity Swap 三屏（启动 / 行情 / 兑换）· 泡沫玻璃质感主打
   a1 启动页（玻璃泡泡星团，可点爆，屏幕栈滑入行情） · a2 行情页（tabs/统计卡/涨幅榜/底部导航） · a3 兑换页（选币/汇率联动/成功浮层） */
(function () {
'use strict';
const SW = window.SW;

/* ── 小工具 ── */
function el(tag, css, parent) {
  const d = document.createElement(tag);
  if (css) d.style.cssText = css;
  if (parent) parent.appendChild(d);
  return d;
}
function ico(paths, s, color, w) {
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + color +
    '" stroke-width="' + (w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
}
const P_GEAR = '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/>';
const P_BACK = '<path d="M15 18l-6-6 6-6"/>';
const P_DOWN = '<path d="M6 9l6 6 6-6"/>';
const P_ARROW = '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>';
const P_SWAPY = '<path d="M8 20V7"/><path d="M5 10l3-3 3 3"/><path d="M16 4v13"/><path d="M13 14l3 3 3-3"/>';
const P_CHECK = '<path d="M20 6L9 17l-5-5"/>';
const P_BARS = '<path d="M5 20v-7"/><path d="M12 20V4"/><path d="M19 20v-11"/>';
const P_WALLET = '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M15.5 12.5h2.5"/>';

/* ── 币种 ── */
const COIN = {
  BTC:  { name: '比特币', bg: '#F7931A', fg: '₿', fs: 'color:#fff' },
  ETH:  { name: '以太坊', bg: 'linear-gradient(135deg,#8B8DF5,#5456E8)', fg: 'Ξ', fs: 'color:#fff' },
  SOL:  { name: '索拉纳', bg: '#10101A', fg: 'S', fs: 'background:linear-gradient(135deg,#00FFA3,#DC1FFF);-webkit-background-clip:text;background-clip:text;color:transparent' },
  XRP:  { name: '瑞波', bg: '#10101A', fg: '✕', fs: 'color:#fff' },
  LTC:  { name: '莱特币', bg: 'linear-gradient(135deg,#96ABCB,#5F7DA6)', fg: 'Ł', fs: 'color:#fff' },
  USDT: { name: '泰达币', bg: '#26A17B', fg: '₮', fs: 'color:#fff' }
};
function badge(code, size) {
  const m = COIN[code];
  const d = el('div', 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:' + m.bg);
  const s = el('span', 'font-size:' + Math.round(size * 0.44) + 'px;font-weight:800;line-height:1;' + m.fs, d);
  s.textContent = m.fg;
  return d;
}
const GAINERS = [
  { sym: 'SOL', name: '索拉纳', price: '$22.41',    chg: '+3.33%' },
  { sym: 'XRP', name: '瑞波',   price: '$0.404725', chg: '+5.00%' },
  { sym: 'LTC', name: '莱特币', price: '$83.54',    chg: '+0.22%' },
  { sym: 'BTC', name: '比特币', price: '$69,847',   chg: '+0.22%' }
];
const NEWS = [
  ['比特币现货 ETF 单周净流入创新高', '币闻日报 · 2 小时前'],
  ['以太坊完成 Dencun 升级一周年', '链上观察 · 5 小时前'],
  ['Solana 网络活跃地址数创年内新高', '星球快讯 · 昨天 09:41']
];

/* ── 兑换汇率（ETH 本位） ── */
const ETH_PER = { BTC: 15.40, ETH: 1, SOL: 0.035, USDT: 0.00047 };
function fmtAmt(n) {
  if (!isFinite(n)) return '0';
  const d = n >= 1000 ? 2 : (n >= 1 ? 4 : 6);
  return n.toLocaleString('en-US', { maximumFractionDigits: d });
}
function fmtRate(r) {
  const d = r >= 1 ? 2 : (r >= 0.01 ? 4 : 6);
  return r.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function trimNum(n) { return String(parseFloat(n.toFixed(6))); }

/* ── 手机内屏幕栈（横滑切换） ── */
function stackOf(ph) {
  const views = [];
  function go(i) {
    views.forEach((w, j) => { w.style.transform = (j <= i) ? 'translateX(0)' : 'translateX(106%)'; });
  }
  return {
    go,
    add(build, bg) {
      const v = el('div', 'sA-view;position:absolute;inset:0;', ph.scroll);
      const scr = el('div', 'position:absolute;inset:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none', v);
      if (bg) scr.style.background = bg;
      if (views.length) {
        v.style.transition = 'transform .4s cubic-bezier(.32,0,.18,1)';
        v.style.transform = 'translateX(106%)';
        v.style.boxShadow = '-22px 0 44px rgba(0,0,0,.5)';
      }
      views.push(v);
      build({ v, scr });
      return { v, scr };
    }
  };
}
function circleBtn(parent, html) {
  const b = el('button', 'width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;color:#fff', parent);
  b.innerHTML = html;
  SW.ui.press(b);
  return b;
}

/* ══ a1 启动页 ══ */
function addLaunch(st) {
  st.add(({ scr }) => {
    scr.style.background = 'radial-gradient(130% 62% at 30% 104%, rgba(47,108,224,.85) 0%, rgba(28,62,158,.42) 46%, rgba(10,10,18,0) 74%), #0A0A12';
    /* 左上 logo：两行字母小方块 */
    const logo = el('div', 'position:absolute;left:24px;top:60px;z-index:4;display:flex;flex-direction:column;gap:5px', scr);
    ['SOLIDITY', 'SWAP'].forEach(function (word) {
      const r = el('div', 'display:flex;gap:3px', logo);
      word.split('').forEach(function (ch) {
        const b = el('span', 'width:22px;height:22px;border:1.5px solid rgba(255,255,255,.92);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff', r);
        b.textContent = ch;
      });
    });
    /* 右侧竖排 DeFi */
    el('div', 'position:absolute;right:13px;top:62px;z-index:4;writing-mode:vertical-rl;font-size:13px;font-weight:600;letter-spacing:.24em;color:rgba(255,255,255,.9)', scr).textContent = 'DeFi';
    /* 玻璃泡泡星团（文字后层） */
    SW.fx.bubbles(scr, { mode: 'cluster', center: { x: 195, y: 430, r: 110 }, count: 16, minR: 18, maxR: 64, tint: '190,200,255', z: 1, interactive: true });
    /* 大标题（超细体） */
    const h = el('div', 'position:absolute;left:22px;top:184px;z-index:2;font-size:44px;font-weight:300;line-height:1.25;color:#fff', scr);
    h.innerHTML = '赚取，<br>借贷<br>与交易<br>数字<br>资产<br>更安心';
    /* 前层小泡泡 */
    SW.fx.bubbles(scr, { mode: 'cluster', center: { x: 244, y: 452, r: 40 }, count: 3, minR: 9, maxR: 20, tint: '205,222,255', z: 3, interactive: true });
    /* 开始使用圆钮 */
    const go = el('button', 'position:absolute;left:26px;bottom:58px;z-index:4;width:120px;height:120px;border-radius:50%;border:0;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px', scr);
    go.id = 'sA-start';
    el('span', 'font-size:13px;font-weight:700;color:#0B0B12', go).textContent = '开始使用';
    go.insertAdjacentHTML('beforeend', ico(P_ARROW, 22, '#0B0B12', 2));
    SW.ui.press(go);
    go.addEventListener('click', function () { st.go(1); });
  });
}

/* ══ 行情页（a1 内嵌 + a2 复用） ══ */
function gainRow(d, parent, first) {
  const row = el('div', 'display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.05);border-radius:16px;padding:10px 12px;margin-top:' + (first ? '16px' : '10px') + ';cursor:pointer', parent);
  row.appendChild(badge(d.sym, 38));
  const col = el('div', 'flex:1;min-width:0', row);
  el('div', 'font-size:14px;font-weight:800;color:#fff', col).textContent = d.sym;
  el('div', 'font-size:11px;color:rgba(255,255,255,.42);margin-top:2px', col).textContent = d.name;
  const right = el('div', 'display:flex;flex-direction:column;align-items:flex-end;flex:none', row);
  el('div', 'font-size:14px;font-weight:800;color:#fff', right).textContent = d.price;
  el('div', 'margin-top:4px;padding:3px 8px;border-radius:999px;background:rgba(74,222,150,.13);color:#45E090;font-size:11px;font-weight:700', right).textContent = d.chg;
  SW.ui.press(row);
  row.addEventListener('click', function () { SW.toast('「' + d.sym + ' 行情」为原型演示'); });
  return row;
}

function addMarkets(st, bg, nav, idBase) {
  st.add(({ v, scr }) => {
    /* 头部 */
    const head = el('div', 'display:flex;align-items:center;gap:12px;margin:64px 22px 0', scr);
    head.appendChild(SW.ui.avatar({ txt: '阿', bg: 'linear-gradient(135deg,#F2A15A,#E05B5B)', size: 40 }));
    const hcol = el('div', 'flex:1;min-width:0', head);
    el('div', 'font-size:14px;font-weight:800;color:#fff', hcol).textContent = '嗨，阿玛拉';
    el('div', 'font-size:11px;color:rgba(255,255,255,.48);margin-top:3px', hcol).textContent = '欢迎回来';
    const gear = el('button', 'width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none', head);
    gear.innerHTML = ico(P_GEAR, 19, 'rgba(255,255,255,.85)', 1.6);
    SW.ui.press(gear);
    gear.addEventListener('click', function () { SW.toast('「设置」为原型演示'); });

    el('div', 'font-size:26px;font-weight:800;color:#fff;margin:16px 22px 0', scr).textContent = '行情';

    /* tabs */
    const tabsWrap = el('div', 'margin:14px 22px 0;color:rgba(255,255,255,.72)', scr);
    tabsWrap.id = idBase + '-tabs';
    const secOv = el('div', 'padding:0 22px 120px', scr);
    const secNews = el('div', 'display:none;padding:0 22px 120px', scr);
    const secWatch = el('div', 'display:none;padding:0 22px 120px', scr);
    SW.ui.tabs({
      el: tabsWrap,
      items: [{ v: 'ov', label: '概览' }, { v: 'news', label: '资讯' }, { v: 'watch', label: '自选' }],
      value: 'ov',
      onChange: function (t) {
        secOv.style.display = t === 'ov' ? 'block' : 'none';
        secNews.style.display = t === 'news' ? 'block' : 'none';
        secWatch.style.display = t === 'watch' ? 'block' : 'none';
      }
    });

    /* 概览：统计卡 ×2 */
    const cards = el('div', 'display:flex;gap:12px;margin-top:2px', secOv);
    const c1 = el('div', 'flex:1;min-width:0;border-radius:20px;padding:14px;background:linear-gradient(165deg,#8FF5DA,#57E6C4);color:#0A231C', cards);
    el('div', 'font-size:11px;font-weight:700;opacity:.72', c1).textContent = '总市值';
    el('div', 'font-size:22px;font-weight:800;margin-top:4px', c1).textContent = '$2.25T';
    SW.charts.spark(el('div', 'height:38px;margin:8px 0 4px', c1), [9, 8.2, 8.6, 7.4, 7.8, 6.7, 7.1, 6.2, 6.6, 5.6, 6, 5.2], { color: '#0B3B33', h: 38, w: 126, width: 2, fill: true });
    el('div', 'display:inline-flex;padding:4px 9px;border-radius:999px;background:rgba(4,32,26,.22);font-size:11px;font-weight:800;color:#C81E3E', c1).textContent = '▼ 3.46%';
    const c2 = el('div', 'flex:1;min-width:0;border-radius:20px;padding:14px;background:linear-gradient(165deg,#5B5FEF,#4443DE);color:#fff', cards);
    el('div', 'font-size:11px;font-weight:700;opacity:.78', c2).textContent = '去中心化交易量';
    el('div', 'font-size:22px;font-weight:800;margin-top:4px', c2).textContent = '$38.7B';
    SW.charts.spark(el('div', 'height:38px;margin:8px 0 4px', c2), [4, 4.6, 4.2, 5, 4.8, 5.6, 5.4, 6.2, 6, 6.8, 7.4, 8], { color: '#fff', h: 38, w: 126, width: 2, fill: true });
    el('div', 'display:inline-flex;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.24);font-size:11px;font-weight:800;color:#D9FFE9', c2).textContent = '▲ 7.54%';

    /* 涨幅榜 */
    const gh = el('div', 'display:flex;align-items:center;margin-top:22px', secOv);
    el('div', 'font-size:15px;font-weight:800;color:#fff', gh).textContent = '🔥 涨幅榜';
    const more = el('button', 'margin-left:auto;border:0;background:transparent;color:rgba(255,255,255,.55);font-size:12px;font-weight:600;cursor:pointer', gh);
    more.textContent = '查看更多';
    SW.ui.press(more);
    more.addEventListener('click', function () { SW.toast('「查看更多」为原型演示'); });
    GAINERS.forEach(function (d, i) { gainRow(d, secOv, i === 0); });

    /* 资讯 */
    NEWS.forEach(function (n, i) {
      const card = el('div', 'background:rgba(255,255,255,.05);border-radius:16px;padding:14px 16px;margin-top:' + (i === 0 ? '16px' : '10px') + ';cursor:pointer', secNews);
      el('div', 'font-size:13.5px;font-weight:700;color:#fff;line-height:1.55', card).textContent = n[0];
      el('div', 'font-size:11px;color:rgba(255,255,255,.4);margin-top:8px', card).textContent = n[1];
      SW.ui.press(card);
      card.addEventListener('click', function () { SW.toast('「资讯详情」为原型演示'); });
    });

    /* 自选 */
    GAINERS.slice(0, 3).forEach(function (d, i) { gainRow(d, secWatch, i === 0); });

    /* 底部导航 */
    const navBar = el('div', 'position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;background:rgba(10,10,19,.94);border-top:1px solid rgba(255,255,255,.07);padding:10px 14px 26px', v);
    navBar.id = idBase + '-nav';
    [{ k: 'home', label: '行情', icon: P_BARS }, { k: 'swap', label: '兑换', icon: P_SWAPY }, { k: 'asset', label: '资产', icon: P_WALLET }].forEach(function (it) {
      const on = it.k === 'home';
      const b = el('button', 'flex:1;border:0;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 0;color:' + (on ? '#fff' : 'rgba(255,255,255,.42)'), navBar);
      b.innerHTML = ico(it.icon, 22, 'currentColor', 1.8);
      el('span', 'font-size:10.5px;font-weight:700', b).textContent = it.label;
      SW.ui.press(b);
      b.addEventListener('click', function () {
        if (it.k === 'home') { if (nav.onHome) nav.onHome(); }
        else if (it.k === 'swap') { if (nav.onSwap) nav.onSwap(); else SW.toast('「兑换」为原型演示'); }
        else SW.toast('「资产」为原型演示');
      });
    });
  }, bg);
}

/* ══ 兑换页（a2 内嵌 + a3 独立复用） ══ */
function addSwap(st, bg, onBack, ph, idBase) {
  st.add(({ scr }) => {
    const state = { from: 'BTC', to: 'ETH', amt: 0.8, recv: 12.32 };

    /* 头部：‹ 兑换 ✕ */
    const head = el('div', 'display:flex;align-items:center;gap:10px;padding:60px 20px 0', scr);
    const back = circleBtn(head, ico(P_BACK, 18, '#fff', 1.8));
    back.id = idBase + '-back';
    back.addEventListener('click', onBack);
    el('div', 'flex:1;text-align:center;font-size:16px;font-weight:800;color:#fff', head).textContent = '兑换';
    const close = circleBtn(head, '<span style="font-size:14px">✕</span>');
    close.id = idBase + '-close';
    close.addEventListener('click', onBack);

    function coinCard(glowColor, label) {
      const wrap = el('div', 'position:relative;margin:16px 20px 0', scr);
      el('div', 'position:absolute;left:50%;top:50%;width:230px;height:230px;transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;filter:blur(26px);background:radial-gradient(circle,' + glowColor + ' 0%,rgba(0,0,0,0) 62%)', wrap);
      const card = el('div', 'position:relative;z-index:1;border-radius:20px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);padding:15px 16px', wrap);
      el('div', 'font-size:12px;color:rgba(255,255,255,.55);margin-bottom:12px', card).textContent = label;
      return card;
    }
    function coinBtn(card, code, isPay) {
      const b = el('button', 'display:flex;align-items:center;gap:8px;border:0;background:transparent;cursor:pointer;padding:2px;flex:none', card);
      const bb = el('div', '', b); bb.appendChild(badge(code, 40));
      const col = el('div', 'text-align:left', b);
      const symEl = el('div', 'font-size:15px;font-weight:800;color:#fff', col); symEl.textContent = code;
      const nameEl = el('div', 'font-size:11px;color:rgba(255,255,255,.5);margin-top:2px', col);
      b.insertAdjacentHTML('beforeend', ico(P_DOWN, 13, 'rgba(255,255,255,.55)', 2));
      SW.ui.press(b);
      b.id = idBase + (isPay ? '-payCoin' : '-recvCoin');
      return { b, bb, symEl, nameEl };
    }

    /* 你支付 */
    const payCard = coinCard('rgba(59,79,239,.55)', '你支付');
    const payRow = el('div', 'display:flex;align-items:center;gap:10px', payCard);
    const pay = coinBtn(payRow, state.from, true);
    const inEl = el('input', 'flex:1;min-width:0;width:120px;background:transparent;border:0;outline:none;color:#fff;font-size:28px;font-weight:800;text-align:right;font-family:inherit;padding:0', payRow);
    inEl.type = 'text'; inEl.setAttribute('inputmode', 'decimal'); inEl.value = '0.8'; inEl.id = idBase + '-amt';
    const balRow = el('div', 'display:flex;align-items:center;margin-top:14px', payCard);
    const balEl = el('span', 'font-size:11.5px;color:rgba(255,255,255,.45)', balRow);
    const maxB = el('button', 'margin-left:auto;border:0;background:transparent;color:#6FE8C2;font-size:11.5px;font-weight:800;cursor:pointer;padding:2px 4px', balRow);
    maxB.textContent = '最大';
    maxB.id = idBase + '-max';
    SW.ui.press(maxB);

    /* 交换圆钮 */
    const mid = el('div', 'position:relative;z-index:2;display:flex;justify-content:center;margin:-9px 0', scr);
    const swapB = el('button', 'width:46px;height:46px;border-radius:50%;border:4px solid #0B0B14;background:#17171F;cursor:pointer;display:flex;align-items:center;justify-content:center', mid);
    const rotWrap = el('span', 'display:flex;transition:transform .45s cubic-bezier(.4,0,.2,1)', swapB);
    rotWrap.innerHTML = ico(P_SWAPY, 20, '#F7931A', 2);
    swapB.id = idBase + '-swap';
    SW.ui.press(swapB);

    /* 你到账 */
    const recvCard = coinCard('rgba(59,232,176,.42)', '你到账');
    const recvRow = el('div', 'display:flex;align-items:center;gap:10px', recvCard);
    const recv = coinBtn(recvRow, state.to, false);
    const amtBox = el('div', 'flex:1;min-width:0;display:flex;align-items:baseline;justify-content:flex-end;gap:4px', recvRow);
    el('span', 'font-size:16px;font-weight:700;color:rgba(255,255,255,.5)', amtBox).textContent = '≈';
    const recvEl = el('span', 'font-size:28px;font-weight:800;color:#fff', amtBox);

    /* 信息行 */
    const infoBox = el('div', 'padding:4px 26px 0', scr);
    function infoRow(label, valText, color) {
      const r = el('div', 'display:flex;align-items:center;margin-top:15px', infoBox);
      el('span', 'font-size:13px;color:rgba(255,255,255,.45)', r).textContent = label;
      const s = el('span', 'font-size:13px;font-weight:700;margin-left:auto;color:' + (color || '#fff'), r);
      s.textContent = valText;
      return s;
    }
    const rateEl = infoRow('汇率', '1 BTC = 15.40 ETH');
    infoRow('价格影响', '0.02%', '#45E090');
    infoRow('流动性手续费', '2.50 USDT');

    /* 确认 */
    const confirmB = el('button', 'display:block;width:calc(100% - 40px);margin:24px 20px 0;height:52px;border:0;border-radius:999px;background:#5B5FEF;color:#fff;font-size:15px;font-weight:800;letter-spacing:.08em;cursor:pointer', scr);
    confirmB.textContent = '确认';
    confirmB.id = idBase + '-confirm';
    SW.ui.press(confirmB);
    el('div', 'height:40px', scr);

    /* ── 联动逻辑 ── */
    function syncCoins() {
      pay.bb.replaceChildren(badge(state.from, 40));
      recv.bb.replaceChildren(badge(state.to, 40));
      pay.symEl.textContent = state.from; pay.nameEl.textContent = COIN[state.from].name;
      recv.symEl.textContent = state.to; recv.nameEl.textContent = COIN[state.to].name;
    }
    function updateQuote() {
      state.recv = state.amt * ETH_PER[state.from] / ETH_PER[state.to];
      recvEl.textContent = fmtAmt(state.recv);
      rateEl.textContent = '1 ' + state.from + ' = ' + fmtRate(ETH_PER[state.from] / ETH_PER[state.to]) + ' ' + state.to;
      balEl.textContent = '余额: 2.4650 ' + state.from;
    }
    inEl.addEventListener('input', function () {
      state.amt = parseFloat(inEl.value.replace(/[^0-9.]/g, '')) || 0;
      updateQuote();
    });
    maxB.addEventListener('click', function () {
      inEl.value = '2.465'; state.amt = 2.465; updateQuote();
    });
    function pick(side) {
      const items = ['BTC', 'ETH', 'SOL', 'USDT'].map(function (c) {
        return { v: c, label: c + ' ' + COIN[c].name, icon: badge(c, 26).outerHTML };
      });
      SW.ui.sheet({
        host: ph.screen, title: '选择币种', items: items, value: state[side],
        onPick: function (c) { state[side] = c; syncCoins(); updateQuote(); }
      });
    }
    pay.b.addEventListener('click', function () { pick('from'); });
    recv.b.addEventListener('click', function () { pick('to'); });
    let rot = 0;
    swapB.addEventListener('click', function () {
      rot += 180;
      rotWrap.style.transform = 'rotate(' + rot + 'deg)';
      const f = state.from; state.from = state.to; state.to = f;
      state.amt = state.recv;
      inEl.value = trimNum(state.recv);
      syncCoins(); updateQuote();
    });
    confirmB.addEventListener('click', function () {
      const ov = el('div', 'position:absolute;inset:0;z-index:80;border-radius:inherit;background:rgba(7,7,16,.96);display:flex;flex-direction:column;align-items:center;justify-content:center', ph.screen);
      el('div', 'position:absolute;top:50%;left:50%;width:300px;height:300px;transform:translate(-50%,-58%);border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(87,230,196,.28) 0%,rgba(0,0,0,0) 65%)', ov);
      const ok = el('div', 'width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#6BEFC9,#2FC79F);display:flex;align-items:center;justify-content:center', ov);
      ok.innerHTML = ico(P_CHECK, 40, '#07231B', 2.6);
      ok.animate([{ transform: 'scale(.4)', opacity: '0' }, { transform: 'scale(1)', opacity: '1' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      el('div', 'font-size:20px;font-weight:800;color:#fff;margin-top:20px', ov).textContent = '兑换成功';
      el('div', 'font-size:13.5px;color:rgba(255,255,255,.6);margin-top:9px', ov).textContent = fmtAmt(state.amt) + ' ' + state.from + ' → ' + fmtAmt(state.recv) + ' ' + state.to;
      const done = el('button', 'margin-top:30px;width:172px;height:46px;border:0;border-radius:999px;background:#5B5FEF;color:#fff;font-size:14px;font-weight:800;cursor:pointer', ov);
      done.textContent = '完成';
      SW.ui.press(done);
      done.addEventListener('click', function () { ov.remove(); });
      SW.audio.ok();
    });

    /* 装饰泡泡（压在「你到账」卡右侧，可点爆） */
    SW.fx.bubbles(scr, { mode: 'cluster', center: { x: 340, y: 310, r: 34 }, count: 3, minR: 8, maxR: 17, tint: '195,215,255', z: 4, interactive: true });

    syncCoins(); updateQuote();
  }, bg);
}

/* ══ 场景注册 ══ */
SW.scenes.register({
  id: 'a', num: 1,
  title: 'Solidity Swap · 兑换',
  sub: '启动页 · 行情 · 币币兑换',
  bg: '#D7D6EA',
  ambience: { tint: '210,205,255', density: 0.45, count: 7, maxR: 34, speed: 0.16 },
  build: function (poster) {
    const ph1 = SW.phone({ name: 'a1', num: 1, title: '启动页', scale: 0.78, screenBg: '#0A0A12' });
    poster.appendChild(ph1.wrap);
    const ph2 = SW.phone({ name: 'a2', num: 1, title: '行情', scale: 0.78, screenBg: '#0D0D16' });
    ph2.wrap.style.transform = 'translateY(20px)';
    poster.appendChild(ph2.wrap);
    const ph3 = SW.phone({ name: 'a3', num: 1, title: '兑换', scale: 0.78, screenBg: '#0B0B14' });
    poster.appendChild(ph3.wrap);

    const s1 = stackOf(ph1);
    addLaunch(s1);
    addMarkets(s1, '#0D0D16', { onHome: function () { s1.go(0); } }, 'sA-a1m');

    const s2 = stackOf(ph2);
    addMarkets(s2, '#0D0D16', { onSwap: function () { s2.go(1); } }, 'sA-a2m');
    addSwap(s2, '#0B0B14', function () { s2.go(0); }, ph2, 'sA-a2s');

    const s3 = stackOf(ph3);
    addSwap(s3, '#0B0B14', function () { SW.toast('「返回行情」为原型演示'); }, ph3, 'sA-a3s');
  }
});
})();
