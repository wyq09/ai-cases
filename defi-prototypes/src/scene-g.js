/* scene-g.js — 图7 · 紫金银行三屏（转账 / 首页 / 卡片）· 暗紫海报细竖纹 + 手机内深黑紫浅紫高光
   g1 转账页（金额面板 / 滑块联动 / 数字键盘 / 长按发送进度） · g2 首页（总余额卡 / 快捷入口 / 交易记录）
   · g3 卡片页（VISA 卡伪堆叠 / 8 宫格快捷操作 / 添加卡片弹层） */
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

/* ── SVG 图标（内联，圆头 stroke 1.6~2） ── */
const P_BACK = '<path d="M15 18l-6-6 6-6"/>';
const P_HOME = '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8"/><path d="M10 20v-5.5h4V20"/>';
const P_BELL = '<path d="M6.2 9.3a5.8 5.8 0 0 1 11.6 0c0 4.6 1.9 6 1.9 6H4.3s1.9-1.4 1.9-6Z"/><path d="M10.2 19.5a2 2 0 0 0 3.6 0"/>';
const P_FUNNEL = '<path d="M4 5h16l-6.2 7.2v5.6L10.2 20v-7.8Z"/>';
const P_EYE = '<path d="M2.8 12S6.2 5.9 12 5.9 21.2 12 21.2 12 17.8 18.1 12 18.1 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.7"/>';
const P_EYE_OFF = '<path d="M2.8 12S6.2 5.9 12 5.9 21.2 12 21.2 12 17.8 18.1 12 18.1 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.7"/><path d="M4.5 4.5l15 15"/>';
const P_DOWN = '<path d="M6 9.5l6 6 6-6"/>';
const P_SEND = '<path d="M7 17L17 7"/><path d="M9.5 7H17v7.5"/>';
const P_REQ = '<path d="M17 7L7 17"/><path d="M14.5 17H7V9.5"/>';
const P_SWAP = '<path d="M4.5 8H17"/><path d="M14 4.5L17.5 8 14 11.5"/><path d="M19.5 16H7"/><path d="M10 12.5L6.5 16l3.5 3.5"/>';
const P_BANK = '<path d="M3.5 9.3L12 4l8.5 5.3"/><path d="M5.5 11.2v5.8"/><path d="M10 11.2v5.8"/><path d="M14 11.2v5.8"/><path d="M18.5 11.2v5.8"/><path d="M4 19.5h16"/>';
const P_CARD = '<rect x="3" y="5.5" width="18" height="13.5" rx="3"/><path d="M3 10.2h18"/><path d="M6.5 15h4"/>';
const P_HISTORY = '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l2.9 1.9"/>';
const P_SEARCH = '<circle cx="11" cy="11" r="6.3"/><path d="M19.8 19.8L15.6 15.6"/>';
const P_PLUS = '<path d="M12 5.5v13"/><path d="M5.5 12h13"/>';
const P_DOC = '<rect x="5.5" y="3.5" width="13" height="17" rx="2.2"/><path d="M9 8.5h6"/><path d="M9 12h6"/><path d="M9 15.5h3.5"/>';
const P_BILLS = '<path d="M6.5 3.5h11v16.8l-2.2-1.5-2.1 1.5-2.2-1.5-2.1 1.5-2.4-1.5Z"/><path d="M9.5 8h5"/><path d="M9.5 11.5h5"/>';
const P_LOAN = '<circle cx="12" cy="7.2" r="3.4"/><path d="M12 5.9v2.6"/><path d="M4.5 20.5c.9-3.5 4-5.6 7.5-5.6s6.6 2.1 7.5 5.6"/>';
const P_FREEZE = '<path d="M12 3v18"/><path d="M4.2 7.5l15.6 9"/><path d="M19.8 7.5l-15.6 9"/>';
const P_LIMIT = '<path d="M4 8.2h8.5"/><circle cx="16" cy="8.2" r="2.3"/><path d="M20.5 8.2h.01"/><path d="M3.5 15.8h.01"/><circle cx="8" cy="15.8" r="2.3"/><path d="M11.5 15.8H20"/>';
const P_RESET = '<path d="M3.5 4.5v5h5"/><path d="M4.3 13.8a8 8 0 1 0 .9-6.9L3.5 9.5"/>';
const P_DEL = '<path d="M8.8 5h10.4A1.8 1.8 0 0 1 21 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H8.8L3.2 12Z"/><path d="M11.5 9.5l5 5"/><path d="M16.5 9.5l-5 5"/>';
const P_CHECK = '<path d="M20 6.5L9.5 17 4.5 12"/>';
function gridSvg(s, color) {
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="' + color + '">' +
    '<rect x="3.5" y="3.5" width="7.6" height="7.6" rx="2.2"/><rect x="12.9" y="3.5" width="7.6" height="7.6" rx="2.2"/>' +
    '<rect x="3.5" y="12.9" width="7.6" height="7.6" rx="2.2"/><rect x="12.9" y="12.9" width="7.6" height="7.6" rx="2.2"/></svg>';
}

/* ── 金额格式：数字串 → $1,500.00 ── */
function moneyFromDigits(d) {
  let s = d || '0';
  while (s.length < 3) s = '0' + s;
  const intPart = Number(s.slice(0, -2).replace(/^0+(?=\d)/, '')).toLocaleString('en-US');
  return '$' + intPart + '.' + s.slice(-2);
}

/* ── 玻璃小圆钮 ── */
function circleBtn(parent, html, size) {
  const b = el('button', 'width:' + (size || 38) + 'px;height:' + (size || 38) + 'px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;color:#fff', parent);
  b.innerHTML = html;
  SW.ui.press(b);
  return b;
}

/* ── 返回页头部（← 标题 ⌂） ── */
function pageHead(scr, title) {
  const head = el('div', 'display:flex;align-items:center;gap:10px;padding:62px 24px 0', scr);
  const back = circleBtn(head, ico(P_BACK, 18, '#fff', 1.9));
  back.addEventListener('click', function () { SW.toast('「返回」为原型演示'); });
  el('div', 'flex:1;text-align:center;font-size:15px;font-weight:800;color:#fff', head).textContent = title;
  const home = circleBtn(head, ico(P_HOME, 17, 'rgba(255,255,255,.88)', 1.7));
  home.addEventListener('click', function () { SW.toast('「主页」为原型演示'); });
}

/* ── 区块标题行（+ 查看全部 ›） ── */
function secHead(parent, title, withMore, top) {
  const r = el('div', 'display:flex;align-items:center;margin:' + (top || 26) + 'px 25px 0', parent);
  el('div', 'font-size:15px;font-weight:800;color:#fff', r).textContent = title;
  if (withMore !== false) {
    const more = el('button', 'margin-left:auto;border:0;background:transparent;color:rgba(255,255,255,.5);font-size:11px;font-weight:600;cursor:pointer;padding:2px 0', r);
    more.textContent = '查看全部 ›';
    SW.ui.press(more);
    more.addEventListener('click', function () { SW.toast('「查看全部」为原型演示'); });
  }
  return r;
}

/* ── 快捷宫格（深灰圆角块，4 列） ── */
function quickGrid(parent, items, top) {
  const g = el('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:' + (top || 14) + 'px 25px 0', parent);
  items.forEach(function (it) {
    const c = el('button', 'border:0;cursor:pointer;background:#1C1926;border-radius:16px;padding:16px 2px 13px;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0', g);
    c.innerHTML = ico(it.icon, 22, 'rgba(255,255,255,.92)', 1.7);
    const t = el('span', 'font-size:10px;font-weight:600;color:rgba(255,255,255,.62);white-space:nowrap', c);
    t.textContent = it.label;
    SW.ui.press(c);
    c.addEventListener('click', function () { SW.toast('「' + it.label + '」为原型演示'); });
  });
  return g;
}

/* ── 底部导航（首页 / 卡片 / ⌗ 大钮 / 记录 / 搜索） ── */
function bottomNav(ph, active) {
  const bar = el('div', 'position:absolute;left:0;right:0;bottom:0;z-index:30;display:flex;align-items:center;background:rgba(12,10,19,.94);border-top:1px solid rgba(255,255,255,.06);padding:9px 8px 30px', ph.screen);
  function item(it, on) {
    const b = el('button', 'flex:1;border:0;background:transparent;cursor:pointer;display:flex;justify-content:center;padding:0;min-width:0', bar);
    const inner = el('div', 'display:flex;flex-direction:column;align-items:center;gap:3px;border-radius:999px;color:' +
      (on ? '#fff' : 'rgba(255,255,255,.45)') +
      (on ? ';background:linear-gradient(135deg,#8B7CF6,#6F5FD8);padding:7px 15px 5px;box-shadow:0 6px 16px rgba(108,92,216,.4)' : ';padding:4px 0'), b);
    inner.innerHTML = ico(it.icon, 20, 'currentColor', 1.7);
    const t = el('span', 'font-size:10px;font-weight:600', inner);
    t.textContent = it.label;
    SW.ui.press(b);
    if (!on) b.addEventListener('click', function () { SW.toast('「' + it.label + '」为原型演示'); });
  }
  item({ label: '首页', icon: P_HOME }, active === 'home');
  item({ label: '卡片', icon: P_CARD }, active === 'cards');
  /* 中间网格大钮 */
  const cSlot = el('div', 'flex:1;display:flex;justify-content:center;min-width:0', bar);
  const big = el('button', 'width:52px;height:52px;border:0;border-radius:50%;background:#C4B5F8;display:flex;align-items:center;justify-content:center;cursor:pointer;transform:translateY(-14px);box-shadow:0 10px 26px rgba(196,181,248,.32)', cSlot);
  big.innerHTML = gridSvg(24, '#fff');
  SW.ui.press(big);
  big.addEventListener('click', function () { SW.toast('「功能面板」为原型演示'); });
  item({ label: '记录', icon: P_HISTORY }, false);
  item({ label: '搜索', icon: P_SEARCH }, false);
}

/* ══ g1 转账页 ══ */
function buildG1(ph) {
  const scr = ph.scroll;
  pageHead(scr, '转账');

  /* 转账金额面板 */
  const panel = el('div', 'margin:16px 25px 0;background:#1C1926;border-radius:20px;padding:16px 18px', scr);
  el('div', 'font-size:11px;font-weight:600;color:rgba(255,255,255,.5)', panel).textContent = '转账金额';
  const amtRow = el('div', 'display:flex;align-items:center;gap:10px;margin-top:8px', panel);
  const amtEl = el('div', 'font-size:30px;font-weight:800;color:#fff;letter-spacing:.01em', amtRow);
  amtEl.id = 'sG1-amt';
  const curBtn = el('button', 'margin-left:auto;flex:none;display:flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer', amtRow);
  const curTxt = el('span', '', curBtn);
  curTxt.textContent = 'USD';
  curBtn.insertAdjacentHTML('beforeend', ico(P_DOWN, 12, 'rgba(255,255,255,.8)', 2));
  SW.ui.press(curBtn);
  curBtn.addEventListener('click', function () {
    SW.ui.sheet({
      host: ph.screen, title: '选择币种', value: curTxt.textContent,
      items: [{ v: 'USD', label: 'USD 美元' }, { v: 'USDC', label: 'USDC' }, { v: 'EUR', label: '欧元 EUR' }],
      onPick: function (v) { curTxt.textContent = v; }
    });
  });
  const limRow = el('div', 'display:flex;align-items:center;margin-top:18px', panel);
  el('span', 'font-size:11px;color:rgba(255,255,255,.45)', limRow).textContent = '转账限额';
  const limEl = el('span', 'margin-left:auto;font-size:11px;font-weight:600;color:rgba(255,255,255,.8)', limRow);
  limEl.id = 'sG1-limit';
  limEl.textContent = '$10,000.00';
  const slideWrap = el('div', 'margin-top:2px', panel);
  slideWrap.id = 'sG1-slider';

  /* 键盘输入状态（追加、9 位截断） */
  let digits = '150000';
  function paintAmt() { amtEl.textContent = moneyFromDigits(digits); }
  paintAmt();
  SW.ui.slider(slideWrap, {
    min: 0, max: 10000, value: 3000, color: '#C4B5F8',
    onChange: function (v) {
      const n = Math.round(v);
      limEl.textContent = '$' + n.toLocaleString('en-US') + '.00';
      digits = String(n * 100);
      paintAmt();
    }
  });

  /* 快速发送 */
  const qsRow = el('div', 'display:flex;align-items:center;margin:20px 25px 0', scr);
  el('div', 'font-size:12px;font-weight:700;color:#fff', qsRow).textContent = '快速发送';
  const qsMore = el('button', 'margin-left:auto;border:0;background:transparent;color:rgba(255,255,255,.5);font-size:11px;font-weight:600;cursor:pointer;padding:2px 0', qsRow);
  qsMore.textContent = '查看全部 ›';
  SW.ui.press(qsMore);
  qsMore.addEventListener('click', function () { SW.toast('「查看全部」为原型演示'); });
  const avs = el('div', 'display:flex;gap:14px;margin:14px 25px 0', scr);
  for (let i = 0; i < 5; i++) {
    const solid = i === 0;
    const a = el('button', 'width:44px;height:44px;border-radius:50%;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;border:0;background:' +
      (solid ? '#C4B5F8' : 'transparent') +
      (solid ? '' : ';border:1.6px dashed rgba(255,255,255,.35)'), avs);
    a.innerHTML = ico(P_PLUS, solid ? 20 : 18, solid ? '#fff' : 'rgba(255,255,255,.75)', 2);
    SW.ui.press(a);
    a.addEventListener('click', function () { SW.toast('添加常用收款人（演示）'); });
  }

  /* 数字键盘：1-9 / ↺ 0 ✕ */
  const padWrap = el('div', 'margin:18px 25px 0;color:#fff', scr);
  padWrap.id = 'sG1-pad';
  SW.ui.keypad({
    el: padWrap,
    bg: '#1C1926',
    keys: [
      { t: '1' }, { t: '2' }, { t: '3' },
      { t: '4' }, { t: '5' }, { t: '6' },
      { t: '7' }, { t: '8' }, { t: '9' },
      { t: 'reset', svg: ico(P_RESET, 22, 'rgba(255,255,255,.9)', 1.8) },
      { t: '0' },
      { t: 'del', svg: ico(P_DEL, 24, 'rgba(255,255,255,.9)', 1.7) }
    ],
    onPress: function (t) {
      if (t === 'reset') digits = '';
      else if (t === 'del') digits = digits.slice(0, -1);
      else { if (digits.length >= 9) return; digits += t; }
      paintAmt();
    }
  });
  padWrap.querySelectorAll('button').forEach(function (b) { b.style.padding = '15px 0'; b.style.fontSize = '20px'; });
  el('div', 'height:96px', scr);

  /* 长按发送（900ms 进度填充 → 成功浮层） */
  const hold = el('button', 'position:absolute;left:0;right:0;bottom:0;z-index:30;height:64px;border:0;border-radius:26px 26px 0 0;background:#C4B5F8;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none', ph.screen);
  hold.id = 'sG1-hold';
  const fill = el('span', 'position:absolute;left:0;top:0;bottom:0;width:0;border-radius:26px 26px 0 0;background:linear-gradient(90deg,#A78BFA,#8B7CF6)', hold);
  fill.id = 'sG1-fill';
  const lab = el('span', 'position:relative;z-index:1;font-size:16px;font-weight:700;letter-spacing:.06em;color:#241D3A', hold);
  lab.textContent = '长按发送';
  SW.ui.press(hold);
  let holdTimer = 0, armed = false, done = false;
  function showSuccess() {
    done = true; armed = false;
    fill.style.transition = 'none'; fill.style.width = '0%';
    const ov = el('div', 'position:absolute;inset:0;z-index:80;background:rgba(10,8,18,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:inherit', ph.screen);
    ov.id = 'sG1-ok';
    const ok = el('div', 'width:86px;height:86px;border-radius:50%;background:linear-gradient(135deg,#C4B5F8,#8B7CF6);display:flex;align-items:center;justify-content:center', ov);
    ok.innerHTML = ico(P_CHECK, 38, '#221B3C', 2.6);
    ok.animate([{ transform: 'scale(.4)', opacity: '0' }, { transform: 'scale(1)', opacity: '1' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    el('div', 'font-size:20px;font-weight:800;color:#fff;margin-top:20px', ov).textContent = '转账成功';
    el('div', 'font-size:13.5px;color:rgba(255,255,255,.6);margin-top:8px', ov).textContent = '已转出 ' + moneyFromDigits(digits) + ' ' + curTxt.textContent;
    const dn = el('button', 'margin-top:28px;width:168px;height:46px;border:0;border-radius:999px;background:#C4B5F8;color:#241D3A;font-size:14px;font-weight:800;cursor:pointer', ov);
    dn.textContent = '完成';
    SW.ui.press(dn);
    dn.addEventListener('click', function () { ov.remove(); done = false; });
    SW.audio.ok();
  }
  hold.addEventListener('pointerdown', function (e) {
    if (done) return;
    e.preventDefault();
    armed = true;
    try { hold.setPointerCapture(e.pointerId); } catch (_) {}
    fill.style.transition = 'width .9s linear';
    fill.style.width = '100%';
    holdTimer = setTimeout(showSuccess, 900);
  });
  function abort() {
    if (!armed || done) return;
    armed = false;
    clearTimeout(holdTimer);
    fill.style.transition = 'width .16s ease';
    fill.style.width = '0%';
    SW.toast('再按住一会儿哦');
  }
  hold.addEventListener('pointerup', abort);
  hold.addEventListener('pointercancel', abort);
  hold.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}

/* ══ g2 首页 ══ */
function buildG2(ph) {
  const scr = ph.scroll;

  /* 头部：🔔 + 漏斗 */
  const head = el('div', 'display:flex;justify-content:flex-end;gap:10px;padding:62px 24px 0', scr);
  const bell = circleBtn(head, ico(P_BELL, 18, 'rgba(255,255,255,.85)', 1.6));
  bell.id = 'sG2-bell';
  bell.addEventListener('click', function () { SW.toast('「通知」为原型演示'); });
  const fun = circleBtn(head, ico(P_FUNNEL, 18, 'rgba(255,255,255,.85)', 1.6));
  fun.addEventListener('click', function () { SW.toast('「筛选」为原型演示'); });

  /* 总余额大卡 */
  const card = el('div', 'position:relative;margin:18px 25px 0;width:340px;height:200px;border-radius:26px;background:linear-gradient(135deg,#8B7CF6,#A99BEB);padding:18px 22px 14px', scr);
  const r1 = el('div', 'display:flex;align-items:center', card);
  el('span', 'font-size:12px;font-weight:600;color:rgba(255,255,255,.8)', r1).textContent = '总余额';
  const eye = el('button', 'margin-left:auto;width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;cursor:pointer', r1);
  eye.id = 'sG2-eye';
  SW.ui.press(eye);
  const amtEl = el('div', 'font-size:30px;font-weight:800;color:#fff;margin-top:4px;letter-spacing:.01em', card);
  amtEl.id = 'sG2-amt';
  let hiddenAmt = false;
  function paintAmt() {
    amtEl.innerHTML = hiddenAmt
      ? '✕✕✕✕✕<span style="opacity:.7">.✕✕</span>'
      : '$23,590<span style="opacity:.7">.73</span>';
    eye.innerHTML = ico(hiddenAmt ? P_EYE_OFF : P_EYE, 15, '#fff', 1.7);
  }
  paintAmt();
  eye.addEventListener('click', function () { hiddenAmt = !hiddenAmt; paintAmt(); });
  const grow = el('div', 'display:flex;align-items:center;gap:8px;margin-top:8px', card);
  el('span', 'padding:3px 8px;border-radius:999px;background:rgba(11,61,40,.5);color:#7BEFB2;font-size:10px;font-weight:800', grow).textContent = '↑2.3%';
  el('span', 'font-size:11px;color:rgba(255,255,255,.75)', grow).textContent = '较上周';
  const acts = el('div', 'display:flex;justify-content:space-between;margin-top:16px', card);
  [
    { label: '发送', icon: P_SEND, tip: '去转账页（演示）' },
    { label: '请求', icon: P_REQ },
    { label: '支付', icon: P_SWAP },
    { label: '提现', icon: P_BANK }
  ].forEach(function (it) {
    const col = el('button', 'border:0;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;flex:1', acts);
    const tile = el('span', 'width:44px;height:44px;border-radius:14px;background:rgba(23,16,48,.42);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center', col);
    tile.innerHTML = ico(it.icon, 20, '#fff', 1.8);
    const t = el('span', 'font-size:10px;font-weight:600;color:#fff', col);
    t.textContent = it.label;
    SW.ui.press(col);
    col.addEventListener('click', function () { SW.toast(it.tip || '「' + it.label + '」为原型演示'); });
  });
  /* 卡底小凹槽（下拉明细，参考图元素） */
  const notch = el('button', 'position:absolute;left:50%;bottom:-13px;transform:translateX(-50%);width:68px;height:26px;border:0;border-radius:13px;background:#948AE0;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2', card);
  notch.innerHTML = ico(P_DOWN, 16, 'rgba(255,255,255,.92)', 2);
  SW.ui.press(notch);
  notch.addEventListener('click', function () { SW.toast('「收支明细」为原型演示'); });

  /* 快捷入口 4 宫格 */
  secHead(scr, '快捷入口', true, 36);
  quickGrid(scr, [
    { label: '发送钱包', icon: P_SEND },
    { label: '充值', icon: P_PLUS },
    { label: '账单明细', icon: P_DOC },
    { label: '生活缴费', icon: P_BILLS }
  ]);

  /* 交易记录 */
  secHead(scr, '交易记录', true, 24);
  [
    { title: '发送钱包', time: '今天 18:29', amt: '-$450.00', color: '#FF6B6B', icon: P_SEND, bg: 'linear-gradient(135deg,#8B7CF6,#A99BEB)' },
    { title: '收到付款', time: '今天 12:37', amt: '+$1,250.00', color: '#4ADE80', icon: P_REQ, bg: 'linear-gradient(135deg,#7FB0F2,#6FA8F0)' }
  ].forEach(function (tx) {
    const row = el('button', 'display:flex;align-items:center;gap:12px;width:calc(100% - 50px);margin:10px 25px 0;border:0;cursor:pointer;background:#17141F;border-radius:16px;padding:11px 14px;text-align:left', scr);
    const av = el('span', 'width:40px;height:40px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:' + tx.bg, row);
    av.innerHTML = ico(tx.icon, 18, '#fff', 1.9);
    const col = el('div', 'flex:1;min-width:0', row);
    el('div', 'font-size:13px;font-weight:700;color:#fff', col).textContent = tx.title;
    el('div', 'font-size:11px;color:rgba(255,255,255,.42);margin-top:3px', col).textContent = tx.time;
    el('span', 'font-size:14px;font-weight:800;color:' + tx.color + ';flex:none', row).textContent = tx.amt;
    SW.ui.press(row);
    row.addEventListener('click', function () { SW.toast('「交易详情」为原型演示'); });
  });
  el('div', 'height:130px', scr);

  bottomNav(ph, 'home');
}

/* ══ g3 卡片页 ══ */
function buildG3(ph) {
  const scr = ph.scroll;
  pageHead(scr, '卡片');

  /* VISA 大卡 + 伪堆叠（第二张卡边缘） */
  const stack = el('div', 'position:relative;margin:20px 25px 0;height:196px', scr);
  const back2 = el('div', 'position:absolute;left:40px;right:6px;bottom:0;height:12px;border-radius:12px;background:linear-gradient(135deg,#6F63C2,#5D7FBE)', stack);
  back2.id = 'sG3-stack';
  const card = el('button', 'position:relative;z-index:1;display:block;width:340px;height:190px;border:0;cursor:pointer;border-radius:22px;background:linear-gradient(135deg,#8B7CF6,#6FA8F0);padding:18px 20px;text-align:left', stack);
  card.id = 'sG3-card';
  const visa = el('span', 'position:absolute;top:16px;right:20px;font-style:italic;font-weight:800;font-size:18px;letter-spacing:.03em;color:#fff', card);
  visa.textContent = 'VISA';
  const numRow = el('div', 'position:absolute;left:20px;right:20px;top:84px;display:flex;align-items:center;justify-content:space-between', card);
  for (let g = 0; g < 3; g++) {
    const grp = el('span', 'display:flex;gap:4px', numRow);
    for (let i = 0; i < 4; i++) el('span', 'width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.82)', grp);
  }
  el('span', 'font-size:14px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.95)', numRow).textContent = '3501';
  const valid = el('div', 'position:absolute;left:20px;bottom:16px', card);
  el('div', 'font-size:10px;color:rgba(255,255,255,.7)', valid).textContent = '有效期';
  el('div', 'font-size:13px;font-weight:800;color:#fff;margin-top:3px', valid).textContent = '12/30';
  SW.ui.press(card);
  card.addEventListener('click', function () { SW.toast('「卡片详情」为原型演示'); });

  /* 快捷操作 8 宫格 */
  secHead(scr, '快捷操作', false, 30);
  quickGrid(scr, [
    { label: '发送钱包', icon: P_SEND },
    { label: '充值', icon: P_PLUS },
    { label: '账单明细', icon: P_DOC },
    { label: '生活缴费', icon: P_BILLS },
    { label: '借贷', icon: P_LOAN },
    { label: '冻结卡片', icon: P_FREEZE },
    { label: '额度调整', icon: P_LIMIT },
    { label: '存款', icon: P_BANK }
  ]);

  /* + 添加新卡片 → 底部弹层 */
  const add = el('button', 'display:flex;align-items:center;justify-content:center;gap:8px;margin:22px 25px 0;width:340px;height:52px;border:0;border-radius:999px;background:#C4B5F8;color:#241D3A;font-size:15px;font-weight:800;cursor:pointer', scr);
  add.id = 'sG3-add';
  add.innerHTML = ico(P_PLUS, 16, '#241D3A', 2.2) + '<span>添加新卡片</span>';
  SW.ui.press(add);
  add.addEventListener('click', function () {
    SW.ui.sheet({
      host: ph.screen, title: '添加新卡片',
      items: [{ v: 'scan', label: '拍卡识别（演示）' }, { v: 'manual', label: '手动输入（演示）' }],
      onPick: function (v) { SW.toast(v === 'scan' ? '拍卡识别（演示）' : '手动输入（演示）'); }
    });
  });
  el('div', 'height:130px', scr);

  bottomNav(ph, 'cards');
}

/* ══ 场景注册：暗紫海报 + 细竖纹 + 三机横排等高（中机微升，贴参考图构图） ══ */
SW.scenes.register({
  id: 'g', num: 7,
  title: '紫金银行 · 转账',
  sub: '转账 · 首页 · 卡片',
  bg: 'linear-gradient(180deg,#4A4370,#2E2850)',
  captions: ['移动应用 / 网页设计', '2025 · 概念稿', '紫金银行概念'],
  build: function (row) {
    /* 下半区极淡竖纹肌理（参考图细节） */
    const poster = row.parentNode;
    const stripes = el('div', 'position:absolute;left:0;right:0;bottom:0;height:52%;pointer-events:none;z-index:0');
    stripes.style.background = 'repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0px, rgba(255,255,255,.05) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 6px)';
    stripes.style.maskImage = 'linear-gradient(180deg, transparent 0%, #000 60%)';
    stripes.style.webkitMaskImage = 'linear-gradient(180deg, transparent 0%, #000 60%)';
    poster.insertBefore(stripes, row);

    const ph1 = SW.phone({ name: 'g1', num: 7, title: '转账', scale: 0.78, screenBg: '#0E0C14' });
    ph1.wrap.style.transform = 'translateY(8px)';
    row.appendChild(ph1.wrap);
    const ph2 = SW.phone({ name: 'g2', num: 7, title: '首页', scale: 0.78, screenBg: '#0E0C14' });
    ph2.wrap.style.transform = 'translateY(-18px)';
    row.appendChild(ph2.wrap);
    const ph3 = SW.phone({ name: 'g3', num: 7, title: '卡片', scale: 0.78, screenBg: '#0E0C14' });
    ph3.wrap.style.transform = 'translateY(12px)';
    row.appendChild(ph3.wrap);
    buildG1(ph1);
    buildG2(ph2);
    buildG3(ph3);
  }
});
})();
