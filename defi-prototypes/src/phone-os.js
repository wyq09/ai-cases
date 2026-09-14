/* phone-os.js — 原型机模式：把 8 个场景组成一台完整可操作的手机
   主屏（8 个 App 图标 + 实时时钟）→ 点图标打开 App → App 内页面栈导航
   （按钮/返回键/底部 tab 真实跳转，死按钮经 toast 通道自动接管）→ Home 条回主屏。
   ?gallery=1 仍可查看海报墙；?app=g 可直接深链打开某个 App。 */
(function () {
'use strict';
const SW = window.SW;

/* ── 图标库（24 viewBox，stroke 1.8 圆头） ── */
function glyph(paths, fill) {
  return '<svg width="26" height="26" viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
}
const G = {
  swap: glyph('<path d="M4 7h13M13 3l4 4-4 4"/><path d="M20 17H7M11 21l-4-4 4-4"/>'),
  bank: glyph('<path d="M3 9l9-5 9 5"/><path d="M4 9h16v2H4zM6 13h2v5H6zM11 13h2v5h-2zM16 13h2v5h-2zM4 20h16"/>'),
  leaf: glyph('<path d="M6 20c0-8 4-13 12-14 1 8-3 13-10 13"/><path d="M6 20c2-5 5-8 9-10"/>'),
  spark: glyph('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/>'),
  wallet: glyph('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h3"/><path d="M3 9c4 1.2 8 1.2 12 0"/>'),
  coin: glyph('<circle cx="12" cy="12" r="8.5"/><path d="M10 7.5h3a2 2 0 0 1 0 4h-3zM10 11.5h3.4a2 2 0 0 1 0 4H10zM10 7v9"/>'),
  shield: glyph('<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 11.5l2 2 4-4"/>'),
  card: glyph('<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 15h4"/>')
};

/* ── App 注册表：label 图标名 / root 默认页 / bind 文本锚点跳转 ──
   bind: {p:页序, t:触发文本(精确匹配点击目标或其祖先), to:目标页} */
const APPS = {
  a: { label: 'Solidity Swap', grad: ['#4F46E5', '#22D3EE'], icon: 'swap', root: 0,
       bind: [{ p: 0, t: '开始使用', to: 1 }, { p: 1, t: '兑换', to: 2 }], closeZone: { p: 2 } },
  b: { label: 'Chase 银行', grad: ['#4338CA', '#818CF8'], icon: 'bank', root: 1,
       bind: [{ p: 1, t: '吉尔伯特', to: 2 }, { p: 1, t: '首页', to: 0 }] },
  c: { label: 'EcoFin 储蓄', grad: ['#7C3AED', '#A78BFA'], icon: 'leaf', root: 0,
       bind: [{ p: 0, t: '卡片', to: 1, tab: true }, { p: 1, t: '首页', to: 0, tab: true }] },
  d: { label: 'Aura AI', grad: ['#6D28D9', '#C4B5FD'], icon: 'spark', root: 0,
       bind: [{ p: 0, t: '训练', to: 1 }] },
  e: { label: '轻钱包', grad: ['#2563EB', '#7C3AED'], icon: 'wallet', root: 0,
       bind: [{ p: 0, t: '开始使用', to: 1 }, { p: 1, navIdx: 4, to: 2 }, { p: 2, navIdx: 0, to: 1, tab: true }] },
  f: { label: '加密组合', grad: ['#312E81', '#6366F1'], icon: 'coin', root: 0,
       bind: [{ p: 0, t: '发送', to: 1 }, { p: 0, t: '划转', to: 1 }, { p: 0, t: '提现', to: 2 }, { p: 0, navIdx: 3, to: 1 }, { p: 1, t: '取消', to: 0, pop: true }] },
  g: { label: '紫金银行', grad: ['#5B21B6', '#8B5CF6'], icon: 'shield', root: 1,
       bind: [{ p: 1, t: '发送', to: 0 }, { p: 1, t: '卡片', to: 2, tab: true }, { p: 2, t: '发送', to: 0 }, { p: 2, t: '首页', to: 1, tab: true }] },
  h: { label: 'May Bank', grad: ['#1E3A8A', '#7C3AED'], icon: 'card', root: 1,
       bind: [{ p: 1, t: '统计', to: 0 }, { p: 1, t: '$14,569.00', to: 2 }] }
};
const ORDER = 'abcdefgh'.split('');

/* ── 状态 ── */
const S = {
  device: null, screenEl: null, launcher: null, appLayer: null,
  cur: null,          // 当前打开的 app id
  pages: [], stack: [],
  built: {},          // id -> [pageEl]
  pendingPage: null, pendingAt: 0,
  coach: false
};

/* ── 工具 ── */
function el(tag, cls, css, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (css) n.style.cssText += ';' + css;
  if (parent) parent.appendChild(n);
  return n;
}

/* ── 场景构建（离屏渲染出 390×844 的页面） ── */
function buildPages(id) {
  if (S.built[id]) return S.built[id];
  const scene = SW.scenes.list.find(s => s.id === id);
  if (!scene) return [];
  const pen = el('div', '', 'position:fixed;left:-99999px;top:0;width:430px;height:920px;pointer-events:none');
  document.body.appendChild(pen);
  const poster = el('div', '', '', pen);
  scene.build(poster, SW);
  const pages = [];
  poster.querySelectorAll('.phone').forEach(root => {
    root.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;transform:none;border-radius:0;box-shadow:none';
    const island = root.querySelector('.island'), hb = root.querySelector('.homebar');
    if (island) island.style.display = 'none';
    if (hb) hb.style.display = 'none';
    const scr = root.querySelector('.screen');
    if (scr) { scr.style.inset = '0'; scr.style.borderRadius = '0'; }
    const page = el('div', 'os-page', 'position:absolute;inset:0;background:#08070F;visibility:hidden;z-index:1');
    page.appendChild(root);
    pages.push(page);
  });
  S.built[id] = pages;
  return pages;
}

/* ── 页面导航 ── */
function pageAt(i) { return S.pages[i]; }
function setStack(stack) {
  S.pages.forEach(p => { p.style.visibility = 'hidden'; p.style.zIndex = 1; });
  stack.forEach(i => { const p = pageAt(i); if (p) { p.style.visibility = 'visible'; p.style.zIndex = 2; } });
}
function dbg(m) { if (window.__SWP_OSDBG) console.log('[os] ' + m); }
function push(i) {
  const to = pageAt(i), from = pageAt(S.stack[S.stack.length - 1]);
  if (!to || to === from) return;
  S.stack.push(i);
  dbg('push(' + i + ') stack=' + S.stack.join(','));
  to.style.transition = 'none'; to.style.visibility = 'visible';
  to.style.transform = 'translateX(100%)'; to.style.zIndex = 4; from.style.zIndex = 3;
  void to.offsetWidth;
  to.style.transition = from.style.transition = 'transform .3s cubic-bezier(.32,.72,.36,1)';
  to.style.transform = 'translateX(0)'; from.style.transform = 'translateX(-28%)';
  setTimeout(() => { dbg('push-done(' + i + ')'); from.style.visibility = 'hidden'; from.style.transform = 'none'; to.style.transition = 'none'; cleanupTrans(); }, S.snap ? 0 : 330);
}
function pop() {
  if (S.stack.length < 2) return; // 根页返回不退出 App
  const topI = S.stack.pop(), toI = S.stack[S.stack.length - 1];
  dbg('pop() -> ' + S.stack.join(','));
  const top = pageAt(topI), to = pageAt(toI);
  to.style.transition = 'none'; to.style.visibility = 'visible';
  to.style.transform = 'translateX(-28%)'; to.style.zIndex = 3; top.style.zIndex = 4;
  void to.offsetWidth;
  top.style.transition = to.style.transition = 'transform .3s cubic-bezier(.32,.72,.36,1)';
  top.style.transform = 'translateX(100%)'; to.style.transform = 'translateX(0)';
  setTimeout(() => { top.style.visibility = 'hidden'; top.style.transform = 'none'; to.style.transition = 'none'; cleanupTrans(); }, S.snap ? 0 : 330);
}
function cleanupTrans() {
  S.pages.forEach(p => { p.style.transition = 'none'; if (p.style.visibility === 'visible') p.style.transform = 'none'; });
}
function switchTab(to) {
  if (S.stack[S.stack.length - 1] === to) return;
  const prev = pageAt(S.stack[S.stack.length - 1]);
  S.stack = [to];
  const cur = pageAt(to);
  if (prev) prev.style.visibility = 'hidden';
  if (!cur) return;
  cur.style.transition = 'none'; cur.style.visibility = 'visible'; cur.style.transform = 'none'; cur.style.zIndex = 2;
  cur.style.opacity = '0'; void cur.offsetWidth;
  cur.style.transition = 'opacity .16s ease'; cur.style.opacity = '1';
  setTimeout(() => { cur.style.transition = 'none'; cur.style.opacity = '1'; }, S.snap ? 0 : 180);
}

/* ── 点击接管：捕获阶段 ── */
function onTap(e) {
  if (!S.cur) return;
  S.pendingAt = Date.now();
  let node = e.target, page = null;
  while (node) { if (node.classList && node.classList.contains('os-page')) { page = node; break; } node = node.parentElement; }
  S.pendingPage = page;
  if (!page) return;
  const pi = S.pages.indexOf(page);
  const cfg = APPS[S.cur]; if (!cfg) return;
  // ① id 形态返回键（scene-a：*-back）
  const path = e.composedPath ? e.composedPath() : [];
  for (const n of path) { if (n.id && /-back$/.test(n.id)) { e.stopPropagation(); pop(); return; } }
  // ② 右上角关闭区（scene-a 兑换 ✕）
  if (cfg.closeZone && cfg.closeZone.p === pi) {
    const r = page.getBoundingClientRect();
    if (e.clientY - r.top < 110 && r.right - e.clientX < 95) { e.stopPropagation(); pop(); return; }
  }
  // ③ 底部导航槽位（纯图标 tab：按槽位序号匹配；用命中元素位置判定，兼容合成 click 的 0 坐标）
  const r = page.getBoundingClientRect();
  if (/navIdx/.test(JSON.stringify(cfg.bind || {}))) {
    let m = e.target, item = null;
    while (m && m !== page) { const pa = m.parentElement; if (pa && pa.children.length >= 4) { item = m; break; } m = pa; }
    if (item) {
      const ir = item.getBoundingClientRect();
      if (ir.height > 0 && ir.top - r.top > r.height - 190) {
        const idx = [].indexOf.call(item.parentElement.children, item);
        const hit = (cfg.bind || []).find(b => b.p === pi && b.navIdx === idx);
        dbg('nav-slot idx=' + idx + ' hit=' + !!hit);
        if (hit) { e.stopPropagation(); if (hit.tab) switchTab(hit.to); else push(hit.to); return; }
      }
    }
  }
  // ④ 文本锚点跳转
  let n = e.target, depth = 0;
  while (n && depth < 5) {
    const t = (n.textContent || '').trim();
    if (t) {
      const hit = (cfg.bind || []).find(b => b.p === pi && b.t && (b.t === t || (t.length - b.t.length <= 2 && t.indexOf(b.t) === 0)));
      if (hit) {
        e.stopPropagation();
        if (hit.pop) pop(); else if (hit.tab) switchTab(hit.to); else push(hit.to);
        return;
      }
    }
    if (t.length > 16) break;
    n = n.parentElement; depth++;
  }
}
function onTapEnd() { setTimeout(() => { S.pendingPage = null; }, 120); }

/* ── toast 通道接管：所有「返回/演示」类死按钮的导航兜底 ── */
SW.toast = (function (orig) {
  return function (msg) {
    if (S.cur && Date.now() - S.pendingAt < 350 && S.pendingPage) {
      const pi = S.pages.indexOf(S.pendingPage);
      const cfg = APPS[S.cur];
      if (cfg) {
        if (String(msg).indexOf('返回') >= 0) { pop(); return; }
        const hit = (cfg.bind || []).find(b => b.p === pi && String(msg).indexOf(b.t) >= 0);
        if (hit) { if (hit.tab) switchTab(hit.to); else push(hit.to); return; }
      }
    }
    return orig.apply(this, arguments);
  };
})(SW.toast);

/* ── 打开 / 关闭 App ── */
function openApp(id) {
  if (!APPS[id]) return;
  dbg('openApp(' + id + ')');
  const pages = buildPages(id);
  if (!pages.length) { SW.toast('「' + id + '」场景构建失败'); return; }
  S.cur = id; S.pages = pages; S.stack = [APPS[id].root];
  pages.forEach(p => { if (p.parentNode !== S.appLayer) S.appLayer.appendChild(p); });
  setStack(S.stack);
  if (!S.appLayer.parentNode) S.screenEl.appendChild(S.appLayer);
  S.appLayer.style.display = 'block';
  S.launcher.style.opacity = '0'; S.launcher.style.transform = 'scale(1.12)';
  S.launcher.style.transition = 'opacity .26s ease, transform .3s ease';
  const root = pageAt(APPS[id].root);
  root.style.transition = 'none';
  root.style.transform = 'scale(.42)'; root.style.opacity = '0'; root.style.visibility = 'visible'; root.style.zIndex = 5;
  root.style.borderRadius = '44px';
  void root.offsetWidth;
  root.style.transition = 'transform .3s cubic-bezier(.3,.9,.35,1), opacity .24s ease, border-radius .3s ease';
  root.style.transform = 'scale(1)'; root.style.opacity = '1'; root.style.borderRadius = '0';
  setTimeout(() => { cleanupTrans(); root.style.zIndex = 2; showCoach(); }, S.snap ? 0 : 320);
}
function goHome() {
  if (!S.cur) return;
  dbg('goHome() cur=' + S.cur);
  const top = pageAt(S.stack[S.stack.length - 1]);
  if (top) {
    top.style.transition = 'transform .24s ease-in, opacity .22s ease-in, border-radius .24s ease-in';
    top.style.transform = 'scale(.4)'; top.style.opacity = '0'; top.style.borderRadius = '44px'; top.style.zIndex = 50;
  }
  S.launcher.style.opacity = '1'; S.launcher.style.transform = 'scale(1)';
  setTimeout(() => {
    S.appLayer.style.display = 'none';
    S.pages.forEach(p => { p.style.visibility = 'hidden'; p.style.transform = 'none'; p.style.opacity = '1'; p.style.borderRadius = '0'; p.style.zIndex = 1; });
    S.cur = null; S.stack = [];
    hideCoach();
  }, S.snap ? 0 : 250);
}

/* ── Coach 提示（首次打开 App 提示 Home 条） ── */
let coachEl = null;
function showCoach() {
  if (S.coach || !S.appLayer.parentNode) return;
  coachEl = el('div', '', 'position:absolute;left:50%;bottom:56px;transform:translateX(-50%);z-index:60;background:rgba(20,18,40,.9);border:1px solid rgba(255,255,255,.22);color:#fff;font-size:12px;font-weight:600;padding:9px 16px;border-radius:999px;white-space:nowrap;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.4);transition:opacity .4s ease', S.screenEl);
  coachEl.textContent = '点底部 Home 条返回主屏';
  S.coach = true;
  setTimeout(() => { if (coachEl) coachEl.style.opacity = '0'; }, 2400);
  setTimeout(() => { if (coachEl) { coachEl.remove(); coachEl = null; } }, S.snap ? 0 : 2900);
}
function hideCoach() {
  if (coachEl) { coachEl.remove(); coachEl = null; }
  try { localStorage.setItem('swp_os_coach', '1'); } catch (e) {}
}

/* ── 主屏 ── */
const SBAR_ICONS = '<span class="sicons" style="display:flex;align-items:center;gap:7px">' +
  '<svg width="19" height="12" viewBox="0 0 19 12" fill="currentColor"><rect x="0" y="7.5" width="3" height="4.5" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
  '<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 12a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z"/><path d="M8.5 5.2c1.7 0 3.2.6 4.4 1.7l-1.5 1.6a4.3 4.3 0 0 0-5.8 0L4.1 6.9a6.4 6.4 0 0 1 4.4-1.7Z"/><path d="M8.5.5c2.9 0 5.6 1.1 7.6 3l-1.5 1.5A8.7 8.7 0 0 0 8.5 2.6c-2.4 0-4.6.9-6.1 2.4L.9 3.5c2-1.9 4.7-3 7.6-3Z"/></svg>' +
  '<svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="currentColor"/><path d="M25.5 4.5v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" opacity=".45"/></svg></span>';

function buildLauncher() {
  const L = S.launcher;
  L.style.cssText += ';position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;color:#fff;transition:opacity .26s ease, transform .3s ease;overflow:hidden';
  // 状态栏
  const sb = el('div', '', 'width:100%;height:54px;display:flex;align-items:center;justify-content:space-between;padding:12px 30px 0;font-size:16px;font-weight:700;flex:none', L);
  const timeEl = el('span', '', '', sb); timeEl.textContent = '9:41';
  sb.insertAdjacentHTML('beforeend', SBAR_ICONS);
  // 时钟
  function tick() {
    const d = new Date();
    timeEl.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    big.innerHTML = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    dateEl.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日' + ' 星期' + '日一二三四五六'[d.getDay()];
  }
  const big = el('div', '', 'margin-top:34px;font-size:64px;font-weight:800;letter-spacing:.02em;text-shadow:0 4px 30px rgba(90,70,220,.55);font-variant-numeric:tabular-nums', L);
  const dateEl = el('div', '', 'margin-top:2px;font-size:14px;font-weight:600;color:rgba(255,255,255,.75)', L);
  tick(); setInterval(tick, 20000);
  // 图标网格
  const grid = el('div', '', 'margin-top:40px;display:grid;grid-template-columns:repeat(4,1fr);gap:22px 18px;padding:0 26px;width:100%', L);
  ORDER.forEach(function (id) {
    const app = APPS[id];
    const cell = el('div', '', 'display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer', grid);
    const tile = el('div', 'os-tile', 'width:58px;height:58px;border-radius:15px;background:linear-gradient(150deg,' + app.grad[0] + ',' + app.grad[1] + ');display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.28), 0 8px 20px rgba(10,8,30,.5);transition:transform .15s ease', cell);
    tile.innerHTML = G[app.icon];
    tile.addEventListener('click', function () {
      tile.style.transform = 'scale(.88)';
      const open = function () { tile.style.transform = 'scale(1)'; openApp(id); };
      if (S.snap) open(); else setTimeout(open, 90);
    });
    el('div', '', 'font-size:11px;font-weight:600;color:rgba(255,255,255,.92);text-shadow:0 1px 6px rgba(0,0,0,.45);white-space:nowrap', cell).textContent = app.label;
  });
  // 底部提示 + Home 条（窄屏才显示，桌面用舞台说明避免重叠）
  if (window.innerWidth < 620) {
    el('div', '', 'margin-top:auto;margin-bottom:30px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.06em', L).textContent = 'DeFi 原型机 · 打开 App 体验完整流程';
  }
  // 泡泡氛围（可点爆）
  try { SW.fx.bubbles(L, { count: 9, minR: 10, maxR: 54, tint: '150,140,255', speed: .22, interactive: true, z: 0 }); } catch (e) {}
}

/* ── 设备 / 舞台 ── */
function buildDevice() {
  const stage = el('div', 'os-stage', 'position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 90% at 50% 0%, #2A2350 0%, #14102B 46%, #0A0818 100%)', document.body);
  const dev = el('div', 'os-device', 'position:relative;width:390px;height:844px;border-radius:54px;background:#050507;overflow:hidden;box-shadow:0 0 0 10px #17151F, 0 0 0 11.5px rgba(255,255,255,.09), 0 44px 120px rgba(0,0,0,.65)', stage);
  S.device = dev; S.screenEl = dev;
  // 壁纸（桌面舞台同款氛围延展）
  stage.style.backgroundImage = 'radial-gradient(120% 90% at 50% 0%, #2A2350 0%, #14102B 46%, #0A0818 100%)';
  // 主屏
  S.launcher = el('div', 'os-launcher', 'background:linear-gradient(168deg,#3A2F6E 0%, #241D4E 40%, #131028 100%)', dev);
  buildLauncher();
  // App 层
  S.appLayer = el('div', 'os-applayer', 'position:absolute;inset:0;z-index:20;display:none', dev);
  // 灵动岛 + Home
  el('div', '', 'position:absolute;top:13px;left:50%;transform:translateX(-50%);width:120px;height:35px;border-radius:22px;background:#000;z-index:90;box-shadow:inset 0 0 3px rgba(255,255,255,.18)', dev);
  el('div', '', 'position:absolute;bottom:9px;left:50%;transform:translateX(-50%);width:136px;height:5px;border-radius:3px;background:rgba(255,255,255,.92);z-index:96;pointer-events:none', dev);
  const hz = el('div', 'os-homezone', 'position:absolute;left:0;right:0;bottom:0;height:30px;z-index:95;cursor:pointer', dev);
  hz.addEventListener('click', goHome);
  // 缩放自适应
  function fit() {
    const s = Math.min(window.innerWidth / 390, window.innerHeight / 844, 1);
    const mobile = window.innerWidth < 620;
    dev.style.transform = 'scale(' + s + ')';
    dev.style.borderRadius = mobile ? '0px' : '54px';
    dev.style.boxShadow = mobile ? 'none' : '0 0 0 10px #17151F, 0 0 0 11.5px rgba(255,255,255,.09), 0 44px 120px rgba(0,0,0,.65)';
    stage.style.padding = mobile ? '0' : '20px';
  }
  fit(); window.addEventListener('resize', fit);
  // 桌面说明
  if (window.innerWidth >= 620) {
    el('div', '', 'position:fixed;bottom:18px;left:0;right:0;text-align:center;font-size:12px;color:rgba(255,255,255,.4);letter-spacing:.08em;z-index:0', stage).textContent = 'DeFi 原型机 · 点按图标打开 App · 底部 Home 条返回主屏';
  }
  // 事件接管
  S.appLayer.addEventListener('click', onTap, true);
  S.appLayer.addEventListener('click', onTapEnd);
  // iOS 左缘右滑返回
  let sx = -1;
  S.appLayer.addEventListener('pointerdown', e => { sx = (e.clientX - (S.device.getBoundingClientRect().left)) < 30 ? e.clientX : -1; });
  S.appLayer.addEventListener('pointerup', e => {
    if (sx < 0) return;
    const dx = e.clientX - sx;
    sx = -1;
    if (dx > 60) pop();
  });
}

/* ── 启动 ── */
function boot() {
  if (S.screenEl) return;
  const brand = document.querySelector('.brand');
  if (brand) brand.style.display = 'none';
  if (/snap=1/.test(location.search)) {  // 零动画模式：无头截图/自动化测试用
    S.snap = true;
    const st = document.createElement('style');
    st.textContent = '.os-device, .os-device *{transition:none !important;animation:none !important}';
    document.head.appendChild(st);
  }
  buildDevice();
  const q = new URLSearchParams(location.search);
  const app = q.get('app');
  if (app && APPS[app]) setTimeout(() => openApp(app), 350);
}
window.SWOS = { boot, openApp, goHome, APPS, state: function () { return { cur: S.cur, stack: S.stack.slice(), vis: S.pages.map(p => p.style.visibility).join(','), trans: S.pages.map(p => p.style.transition !== 'none' && !!p.style.transition).join(',') }; } };
})();
