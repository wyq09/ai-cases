/* scene-d.js — 图4 · Aura AI 概念两屏（紫色调 AI 助手：问候首页 / 训练计划） */
(function () {
'use strict';
const SW = window.SW;

/* ── 内联 SVG（stroke 1.6~1.8 圆头） ── */
const I = {
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h10M4 17h16"/></svg>',
  bell: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9.5a6 6 0 1 0-12 0c0 4.8-1.8 5.8-1.8 5.8h15.6S18 14.3 18 9.5"/><path d="M10.4 19a1.9 1.9 0 0 0 3.2 0"/></svg>',
  chev: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  chevS: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M12 7.5v9M7.5 12h9"/></svg>',
  down: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>',
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M11.4 3.5a1 1 0 0 1 1.2 0l7 5.4c.25.2.4.5.4.82V19.6c0 .77-.63 1.4-1.4 1.4h-3.85a.6.6 0 0 1-.6-.6v-4.55a1.15 1.15 0 0 0-1.15-1.15h-2a1.15 1.15 0 0 0-1.15 1.15V20.4a.6.6 0 0 1-.6.6H5.4A1.4 1.4 0 0 1 4 19.6V9.72c0-.32.15-.62.4-.82z"/></svg>',
  photo: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="3.2"/><circle cx="9.2" cy="10.2" r="1.5" fill="rgba(255,255,255,.6)" stroke="none"/><path d="M5 17.2l4.3-4a1.5 1.5 0 0 1 2.05 0l2.85 2.7 1.6-1.5a1.5 1.5 0 0 1 2.05 0l2.15 2"/></svg>',
  mic: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><rect x="9.1" y="3.2" width="5.8" height="10.6" rx="2.9" fill="rgba(255,255,255,.92)" stroke="none"/><path d="M6.2 11.4a5.8 5.8 0 0 0 11.6 0M12 17.2v3.3"/></svg>',
  cal: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3.2"/><path d="M3.5 9.6h17M8.2 3.2v3.4M15.8 3.2v3.4"/></svg>',
  grid: '<svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,.6)"><rect x="4" y="4" width="7.2" height="7.2" rx="2.3"/><rect x="12.8" y="4" width="7.2" height="7.2" rx="2.3"/><rect x="4" y="12.8" width="7.2" height="7.2" rx="2.3"/><rect x="12.8" y="12.8" width="7.2" height="7.2" rx="2.3"/></svg>',
  back: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
  dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,.75)"><circle cx="12" cy="5.4" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="18.6" r="1.75"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  waves: '<svg viewBox="0 0 184 120" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:100%;height:112px;pointer-events:none"><path d="M0 66C34 30 62 92 98 58 126 32 158 74 184 52L184 120 0 120Z" fill="rgba(255,255,255,.16)"/><path d="M0 92C30 64 72 112 112 86 142 68 166 100 184 86L184 120 0 120Z" fill="rgba(255,255,255,.27)"/></svg>'
};

/* ── 数据 ── */
const CANDLES = [[62,71,75,59],[71,66,75,63],[66,79,83,64],[79,73,83,70],[73,85,88,71],[85,78,88,75],[78,91,94,76],[91,83,94,80],[83,95,99,81],[95,89,99,86]];
const WAVE = [4, 6, 5, 8, 6, 10, 7, 11, 8, 9];      // 峰值 11 @ i=7
const MINI = [3, 5, 4, 7, 5, 9, 6, 7];              // 峰值 9  @ i=5
const DAY_NUM = { sun: 24, mon: 26, tue: 21, wed: 28 };

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function el(tag, css, html) { const n = document.createElement(tag); if (css) n.style.cssText = css; if (html != null) n.innerHTML = html; return n; }
function btn(css, html) {
  const b = el('button', 'appearance:none;border:0;cursor:pointer;background:transparent;color:inherit;font-family:inherit;font-size:inherit;padding:0;margin:0;' + (css || ''), html);
  return SW.ui.press(b);
}
function iconBtn(css, svg, msg) {
  const b = btn('display:flex;align-items:center;justify-content:center;' + (css || ''), svg);
  if (msg) b.addEventListener('click', () => SW.toast(msg));
  return b;
}
/* 白色峰顶标注点（绕开 charts.line dot 动画的负半径 bug，视觉等效） */
function peakDot(host, data, i, w, h, r) {
  let lo = Infinity, hi = -Infinity;
  data.forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; });
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const px = 4 + i * (w - 8) / (data.length - 1);
  const py = 6 + (1 - (data[i] - lo) / (hi - lo)) * (h - 12);
  host.style.position = 'relative';
  host.appendChild(el('span', 'position:absolute;width:' + (r * 2) + 'px;height:' + (r * 2) + 'px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.28),0 0 12px rgba(233,226,255,.9);left:' + (px - r) + 'px;top:' + (py - r) + 'px;pointer-events:none'));
}

/* ── 共用样式（placeholder / 隐藏滚动条） ── */
(function injectCss() {
  const s = document.createElement('style');
  s.textContent = '#sD-inp::placeholder{color:rgba(255,255,255,.6)}#sD-inp{caret-color:#B9A9F5}#sD-chips::-webkit-scrollbar{display:none}';
  document.head.appendChild(s);
})();

/* ═══════════ d1 · 主页 ═══════════ */
function buildD1(p) {
  const scroll = p.scroll;
  scroll.style.padding = '64px 0 118px';

  /* 屏幕中上部柔光 */
  p.screen.appendChild(el('div', 'position:absolute;top:-52px;left:50%;transform:translateX(-50%);width:330px;height:270px;background:radial-gradient(closest-side,rgba(198,183,255,.30),rgba(198,183,255,0) 74%);pointer-events:none;z-index:2'));

  const box = el('div', 'padding:0 19px');

  /* 头部：☰ / Aura 版本胶囊 / 🔔 */
  const hd = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px');
  hd.appendChild(iconBtn('width:38px;height:38px;border-radius:12px', I.menu, '「菜单」为原型演示'));
  const verBtn = btn('display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.08);border-radius:999px;padding:8px 12px',
    '<span id="sD-ver" style="font-size:13px;font-weight:600;color:#fff">Aura 1.3</span>' +
    '<span style="background:#8B7CF6;color:#fff;font-size:9px;font-weight:700;letter-spacing:.05em;padding:2.5px 7px;border-radius:999px">BETA</span>' + I.down);
  verBtn.addEventListener('click', () => {
    SW.ui.sheet({
      host: p.screen, title: '选择版本', value: verBtn.querySelector('#sD-ver').textContent,
      items: [{ v: 'Aura 1.3', label: 'Aura 1.3' }, { v: 'Aura 1.2', label: 'Aura 1.2' }, { v: 'Aura 0.9', label: 'Aura 0.9' }],
      onPick(v) { verBtn.querySelector('#sD-ver').textContent = v; SW.toast('已切换到 ' + v); }
    });
  });
  hd.appendChild(verBtn);
  hd.appendChild(iconBtn('width:38px;height:38px;border-radius:12px', I.bell, '「通知」为原型演示'));
  box.appendChild(hd);

  /* 问候 + 大标题 */
  const greet = el('div', 'position:relative;margin-top:22px;text-align:center');
  greet.appendChild(el('div', 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:160px;height:58px;background:radial-gradient(closest-side,rgba(206,191,255,.42),rgba(206,191,255,0) 75%);pointer-events:none'));
  greet.appendChild(el('div', 'position:relative;font-size:14px;color:rgba(255,255,255,.85);text-shadow:0 0 16px rgba(216,202,255,.9)', '早上好！'));
  box.appendChild(greet);
  box.appendChild(el('div', 'margin-top:8px;text-align:center;font-size:34px;font-weight:300;line-height:1.3;color:#fff;letter-spacing:.5px', '你正处于<br>效率的浪潮之上！'));

  /* 输入胶囊 */
  const cap = el('div', 'margin:20px auto 0;width:330px;height:52px;background:rgba(255,255,255,.07);border-radius:999px;display:flex;align-items:center;gap:10px;padding:0 9px 0 20px');
  const inp = el('input', 'flex:1;min-width:0;background:transparent;border:0;outline:0;color:#fff;font-size:14px;font-family:inherit');
  inp.id = 'sD-inp'; inp.placeholder = '输入消息';
  cap.appendChild(inp);
  const send = iconBtn('width:34px;height:34px;flex:none;border-radius:50%;background:#8B7CF6', I.plus);
  cap.appendChild(send);
  box.appendChild(cap);

  /* 消息气泡（最多 3 条，新的顶掉旧的） */
  const msgs = el('div', 'display:flex;flex-direction:column;gap:6px;margin-top:10px');
  msgs.id = 'sD-msgs';
  box.appendChild(msgs);
  function sendMsg() {
    const t = inp.value.trim();
    if (!t) { SW.toast('先输入点什么吧'); return; }
    while (msgs.children.length >= 3) msgs.removeChild(msgs.firstChild);
    msgs.appendChild(el('div', 'align-self:flex-end;max-width:82%;background:rgba(255,255,255,.92);color:#2B2450;font-size:13px;font-weight:500;line-height:1.45;padding:8px 13px;border-radius:16px 16px 5px 16px;word-break:break-all', '你：' + esc(t)));
    inp.value = '';
    SW.toast('Aura 正在思考…（演示）');
  }
  send.addEventListener('click', sendMsg);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

  /* chips 横向滚动行 */
  const chips = el('div', 'display:flex;gap:8px;margin:12px -19px 0;padding:0 19px;overflow-x:auto;scrollbar-width:none');
  chips.id = 'sD-chips';
  [['📝 发布动态', '发布动态'], ['📊 数据分析', '数据分析'], ['✨ 生成内容', '生成内容']].forEach(([label, text]) => {
    const c = btn('flex:none;background:rgba(255,255,255,.08);border-radius:999px;padding:9px 14px;font-size:13px;color:#fff;white-space:nowrap', label);
    c.addEventListener('click', () => { inp.value = text; SW.toast('已填入「' + text + '」'); });
    chips.appendChild(c);
  });
  box.appendChild(chips);

  /* 「你的动态」 */
  const actHd = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:20px');
  actHd.appendChild(el('div', 'font-size:16px;font-weight:700;color:#fff', '你的动态'));
  actHd.appendChild(iconBtn('width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.08);color:rgba(255,255,255,.8)', I.chev, '「你的动态」为原型演示'));
  box.appendChild(actHd);

  /* 两列卡 */
  const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px');
  const cardBase = 'height:210px;background:rgba(255,255,255,.06);border-radius:22px;padding:14px 14px 16px;display:flex;flex-direction:column;overflow:hidden;text-align:left;color:#fff';

  const c1 = btn(cardBase);
  const c1h = el('div', 'display:flex;align-items:flex-start;justify-content:space-between');
  c1h.appendChild(el('div', '', '<div style="font-size:13px;font-weight:600">心率</div><div style="font-size:10px;color:#43D97E;margin-top:3px">在线</div>'));
  c1h.appendChild(el('span', 'color:rgba(255,255,255,.75);margin-top:2px', I.chev));
  const c1ch = el('div', 'margin-top:6px');
  const c1f = el('div', 'display:flex;align-items:baseline;gap:6px;margin-top:auto');
  c1f.appendChild(el('span', 'font-size:30px;font-weight:800', '67'));
  c1f.appendChild(el('span', 'font-size:11px;color:rgba(255,255,255,.5)', '次/分'));
  c1.append(c1h, c1ch, c1f);
  c1.addEventListener('click', () => SW.toast('「心率」为原型演示'));

  const c2 = btn(cardBase);
  const c2h = el('div', 'display:flex;align-items:flex-start;justify-content:space-between');
  c2h.appendChild(el('div', '', '<div style="font-size:13px;font-weight:600">训练</div><div style="font-size:10px;color:rgba(255,255,255,.5);margin-top:3px">明天</div>'));
  const c2r = el('div', 'display:flex;flex-direction:column;align-items:flex-end;gap:5px');
  c2r.appendChild(el('span', 'color:rgba(255,255,255,.75)', I.chev));
  c2r.appendChild(el('span', 'background:rgba(255,255,255,.14);border-radius:999px;padding:2.5px 8px;font-size:10px;font-weight:600', '65%'));
  c2h.appendChild(c2r);
  const c2ch = el('div', 'margin-top:4px');
  const c2f = el('div', 'display:flex;align-items:baseline;gap:6px;margin-top:auto');
  c2f.appendChild(el('span', 'font-size:30px;font-weight:800', '24'));
  c2f.appendChild(el('span', 'font-size:11px;color:rgba(255,255,255,.5)', '天'));
  c2.append(c2h, c2ch, c2f);
  c2.addEventListener('click', () => SW.toast('「训练」为原型演示'));

  grid.append(c1, c2);
  box.appendChild(grid);
  scroll.appendChild(box);

  /* 底部导航（固定悬浮） */
  const nav = el('div', 'position:absolute;left:0;right:0;bottom:14px;z-index:12;display:flex;align-items:center;justify-content:space-between;padding:0 24px');
  nav.appendChild(iconBtn('width:44px;height:44px;border-radius:14px', I.home, '「首页」为原型演示'));
  nav.appendChild(iconBtn('width:44px;height:44px;border-radius:14px', I.photo, '「相册」为原型演示'));
  const mic = iconBtn('width:56px;height:56px;flex:none;border-radius:50%;background:rgba(255,255,255,.1)', I.mic, '语音助手（演示）');
  nav.appendChild(mic);
  nav.appendChild(iconBtn('width:44px;height:44px;border-radius:14px', I.cal, '「日历」为原型演示'));
  nav.appendChild(iconBtn('width:44px;height:44px;border-radius:14px', I.grid, '「更多」为原型演示'));
  p.screen.appendChild(nav);

  /* 图表（挂载后绘制） */
  SW.charts.candles(c1ch, { data: CANDLES, up: '#8B7CF6', down: '#CFC9F2', h: 88, w: 131 });
  SW.charts.line(c2ch, { series: [{ data: WAVE, color: '#B9A9F5', width: 2.2, fill: true, fillColor: '#B9A9F5' }], h: 88, w: 131 });
  peakDot(c2ch, WAVE, 7, 131, 88, 4.5);
}

/* ═══════════ d2 · 训练计划 ═══════════ */
function buildD2(p) {
  const scroll = p.scroll;
  scroll.style.padding = '64px 0 40px';
  const box = el('div', 'padding:0 16px');

  /* 头部：‹ + 📊 / ✎ */
  const hd = el('div', 'display:flex;align-items:center;justify-content:space-between');
  hd.appendChild(iconBtn('width:38px;height:38px;border-radius:12px', I.back, '「返回」为原型演示'));
  const hds = el('div', 'display:flex;gap:10px');
  [['📊', '「数据统计」为原型演示'], ['✎', '「编辑计划」为原型演示']].forEach(([ic, msg]) => {
    hds.appendChild(iconBtn('width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,.08);font-size:15px', ic, msg));
  });
  hd.appendChild(hds);
  box.appendChild(hd);

  /* 大标题 */
  box.appendChild(el('div', 'margin:14px 0 18px;font-size:30px;font-weight:800;color:#fff;letter-spacing:.5px', '训练计划'));

  /* 星期 tab 行 + 📅 */
  const tabsRow = el('div', 'display:flex;align-items:center;gap:10px');
  const tabsBox = el('div', 'flex:1;min-width:0;color:#fff');
  tabsRow.appendChild(tabsBox);
  tabsRow.appendChild(iconBtn('width:36px;height:36px;flex:none;border-radius:50%;background:rgba(255,255,255,.08);font-size:15px', '📅', '「选择日期」为原型演示'));
  box.appendChild(tabsRow);

  /* 卡片网格 */
  const grid = el('div', 'display:grid;grid-template-columns:184px 1fr;gap:12px;margin-top:16px');

  /* 左：大卡（tab 联动数字） */
  let bigNum;
  const big = btn('position:relative;height:250px;border-radius:24px;overflow:hidden;text-align:left;color:#fff;background:linear-gradient(160deg,#8B7CF6,#6C5CE7);padding:16px;display:flex;flex-direction:column');
  const bigh = el('div', 'display:flex;align-items:center;justify-content:space-between;position:relative');
  bigh.appendChild(el('span', 'font-size:14px;font-weight:600', '下次训练'));
  bigh.appendChild(el('span', 'color:rgba(255,255,255,.85)', I.chevS));
  big.appendChild(bigh);
  big.insertAdjacentHTML('beforeend', I.waves);
  const bigf = el('div', 'position:relative;display:flex;align-items:baseline;gap:7px;margin-top:auto');
  bigNum = el('span', 'font-size:46px;font-weight:800;color:#fff', String(DAY_NUM.sun));
  bigNum.id = 'sD-bigNum';
  bigf.appendChild(bigNum);
  bigf.appendChild(el('span', 'font-size:13px;font-weight:500;color:rgba(255,255,255,.88)', '天'));
  big.appendChild(bigf);
  big.addEventListener('click', () => SW.toast('「下次训练」为原型演示'));

  /* 右列：两张小卡 */
  const rc = el('div', 'display:flex;flex-direction:column;gap:12px;min-width:0');
  const r1 = btn('height:126px;background:rgba(255,255,255,.06);border-radius:20px;padding:12px 12px 6px;text-align:left;color:#fff;display:flex;flex-direction:column;overflow:hidden');
  const r1h = el('div', 'display:flex;align-items:center;justify-content:space-between');
  r1h.appendChild(el('span', 'font-size:12px;font-weight:600', '下次训练'));
  r1h.appendChild(el('span', 'color:rgba(255,255,255,.7)', I.chevS));
  const r1s = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:3px');
  r1s.appendChild(el('span', 'font-size:12px;color:rgba(255,255,255,.55)', '明天'));
  r1s.appendChild(el('span', 'background:rgba(255,255,255,.14);border-radius:999px;padding:2px 7px;font-size:10px;font-weight:600', '65%'));
  const r1ch = el('div', 'margin-top:auto');
  r1.append(r1h, r1s, r1ch);
  r1.addEventListener('click', () => SW.toast('「下次训练」为原型演示'));

  const r2 = btn('flex:1;min-height:112px;background:rgba(255,255,255,.06);border-radius:20px;padding:14px;text-align:left;color:#fff;display:flex;flex-direction:column');
  const r2h = el('div', 'display:flex;align-items:center;justify-content:space-between');
  r2h.appendChild(el('span', 'font-size:13px;font-weight:600', '计划'));
  r2h.appendChild(el('span', 'color:rgba(255,255,255,.7)', I.chevS));
  const elev = btn('align-self:flex-start;background:rgba(255,255,255,.1);border-radius:999px;padding:9px 18px;font-size:13px;font-weight:600;color:#fff;margin-top:auto', '提升');
  elev.addEventListener('click', e => { e.stopPropagation(); SW.toast('已加入提升计划（演示）'); });
  r2.append(r2h, elev);
  r2.addEventListener('click', () => SW.toast('「计划」为原型演示'));

  rc.append(r1, r2);
  grid.append(big, rc);
  box.appendChild(grid);

  /* 「历史」 */
  const hHd = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-top:20px');
  hHd.appendChild(el('div', 'font-size:16px;font-weight:700;color:#fff', '历史'));
  const seeAll = btn('font-size:12px;color:rgba(255,255,255,.55)', '查看全部');
  seeAll.addEventListener('click', () => SW.toast('「查看全部」为原型演示'));
  hHd.appendChild(seeAll);
  box.appendChild(hHd);

  /* 3 行历史条目（⋮ sheet 真实生效） */
  const list = el('div', 'display:flex;flex-direction:column;gap:10px;margin-top:12px');
  const green = '#2FBF71';
  function iconCircle(kind) {
    if (kind === 'check' || kind === 'green') {
      const c = el('span', 'width:34px;height:34px;flex:none;border-radius:50%;background:' + green + ';display:flex;align-items:center;justify-content:center', I.check);
      return c;
    }
    const face = kind === 'cal' ? '<span style="font-size:15px">📅</span>'
      : '<span style="width:17px;height:17px;border-radius:50%;border:1.7px solid rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;position:relative"><span style="position:absolute;width:9px;height:1.7px;background:rgba(255,255,255,.9)"></span><span style="position:absolute;height:9px;width:1.7px;background:rgba(255,255,255,.9)"></span></span>';
    return el('span', 'width:34px;height:34px;flex:none;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center', face);
  }
  [['check', '训练已完成'], ['cal', '日程变更'], ['plus', '新增了腿部力量训练']].forEach(([kind, text], i) => {
    const row = btn('display:flex;align-items:center;gap:12px;width:100%;background:rgba(255,255,255,.07);border-radius:16px;padding:10px 12px;text-align:left;color:#fff');
    const ic = iconCircle(kind);
    const txt = el('span', 'flex:1;min-width:0;font-size:14px;font-weight:500', text);
    txt.id = 'sD-htxt-' + i;
    const more = iconBtn('width:28px;height:28px;flex:none;border-radius:50%', I.dots);
    more.addEventListener('click', e => {
      e.stopPropagation();
      SW.ui.sheet({
        host: p.screen, title: '记录操作',
        items: [{ v: 'view', label: '查看详情' }, { v: 'done', label: '标记为已完成' }, { v: 'del', label: '删除该记录' }],
        onPick(v) {
          if (v === 'view') { SW.toast('「查看详情」为原型演示'); return; }
          if (v === 'done') {
            txt.style.textDecoration = 'line-through'; txt.style.opacity = '.55';
            const g = iconCircle('green'); g.id = ic.id; ic.replaceWith(g);
            SW.toast('已标记为已完成');
          } else { row.remove(); SW.toast('已删除该记录'); }
        }
      });
    });
    row.append(ic, txt, more);
    list.appendChild(row);
  });
  box.appendChild(list);
  scroll.appendChild(box);

  /* 右上小卡迷你波形 */
  SW.charts.line(r1ch, { series: [{ data: MINI, color: '#CBBFF6', width: 2 }], h: 54, w: 116 });
  peakDot(r1ch, MINI, 5, 116, 54, 4);

  /* tab 联动大卡数字 */
  SW.ui.tabs({
    el: tabsBox, activeBg: '#8B7CF6', activeColor: '#fff', value: 'sun',
    items: [{ v: 'sun', label: '周日' }, { v: 'mon', label: '周一' }, { v: 'tue', label: '周二' }, { v: 'wed', label: '周三' }],
    onChange(v) { bigNum.textContent = String(DAY_NUM[v]); }
  });
}

/* ═══════════ 场景注册 ═══════════ */
SW.scenes.register({
  id: 'd', num: 4,
  title: 'Aura AI · 概念两屏',
  sub: '问候首页 · 训练计划',
  bg: 'linear-gradient(175deg,#6E5BC9,#9C8CE0)',
  captions: ['移动应用 / 网页设计', '2025 · 概念稿', 'Aura AI 概念'],
  build(row) {
    [['1. 主页', 'd1', 'Aura · 主页', 'linear-gradient(180deg,#4A3B78,#171226)', buildD1],
     ['2. 训练计划', 'd2', 'Aura · 训练计划', 'linear-gradient(180deg,#3E3068,#151022)', buildD2]]
    .forEach(([label, name, title, screenBg, fn]) => {
      const col = el('div', 'display:flex;flex-direction:column;align-items:center;gap:16px;flex:none');
      col.appendChild(el('div', 'font-size:13px;font-weight:500;color:#fff;opacity:.95;text-align:center', label));
      const p = SW.phone({ name: name, num: 4, title: title, scale: 0.8, status: 'light', screenBg: screenBg });
      col.appendChild(p.wrap);
      row.appendChild(col);
      fn(p);
    });
    /* 海报底部胶囊 */
    const poster = row.parentNode;
    if (poster) {
      const capWrap = el('div', 'display:flex;justify-content:center;padding:2px 16px 34px');
      capWrap.appendChild(el('div', 'background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:9px 18px;font-size:12px;color:#fff;letter-spacing:.02em', '@uix.vikram · UI/UX 设计师'));
      poster.appendChild(capWrap);
    }
  }
});
})();
