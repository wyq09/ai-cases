/* ui.js — 组件库：press/tabs/seg/toggle/slider/keypad/sheet/carousel/avatar */
(function () {
'use strict';
const SW = window.SW;
SW.ui = SW.ui || {};

/* 按压反馈 + ripple */
SW.ui.press = function (el) {
  if (!el || el.__pressed) return el;
  el.__pressed = true;
  el.style.position = el.style.position || 'relative';
  el.style.overflow = 'hidden';
  el.addEventListener('pointerdown', e => {
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2;
    const rip = document.createElement('span');
    rip.style.cssText = 'position:absolute;border-radius:50%;pointer-events:none;background:rgba(255,255,255,.28);width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px;transform:scale(0);transition:transform .5s ease-out,opacity .55s;opacity:.9';
    el.appendChild(rip);
    requestAnimationFrame(() => { rip.style.transform = 'scale(1)'; rip.style.opacity = '0'; });
    setTimeout(() => rip.remove(), 600);
    el.style.transform = 'scale(.96)';
    SW.audio.tap();
  });
  el.addEventListener('pointerup', () => { el.style.transform = ''; });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  return el;
};

/* 胶囊 tab 组 */
SW.ui.tabs = function (o) {
  const box = o.el;
  box.style.display = 'flex'; box.style.gap = '8px';
  const btns = [];
  o.items.forEach(it => {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.style.cssText = 'cursor:pointer;border:0;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:600;color:inherit;background:transparent;transition:all .2s;white-space:nowrap';
    b.addEventListener('click', () => set(it.v));
    box.appendChild(b); btns.push([b, it.v]);
  });
  function paint(v) {
    btns.forEach(([b, v2]) => {
      const on = v2 === v;
      b.style.background = on ? (o.activeBg || '#fff') : (o.bg || 'rgba(255,255,255,.08)');
      b.style.color = on ? (o.activeColor || '#17141F') : (o.color || 'inherit');
      b.style.boxShadow = on ? '0 4px 14px rgba(0,0,0,.25)' : 'none';
    });
  }
  function set(v, silent) { paint(v); if (!silent && o.onChange) o.onChange(v); }
  set(o.value != null ? o.value : o.items[0].v, true);
  return { set, get: () => btns.find(b => b[0].style.boxShadow !== 'none') };
};

/* 分段控件（整条底座） */
SW.ui.seg = function (o) {
  const box = o.el;
  box.style.cssText += ';display:flex;background:' + (o.bg || 'rgba(255,255,255,.08)') + ';border-radius:12px;padding:4px;gap:2px';
  const btns = [];
  o.items.forEach(it => {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.style.cssText = 'flex:1;cursor:pointer;border:0;border-radius:9px;padding:8px 6px;font-size:12.5px;font-weight:600;background:transparent;color:inherit;transition:all .2s;white-space:nowrap';
    b.addEventListener('click', () => set(it.v));
    box.appendChild(b); btns.push([b, it.v]);
  });
  function paint(v) {
    btns.forEach(([b, v2]) => {
      const on = v2 === v;
      b.style.background = on ? (o.activeBg || 'rgba(255,255,255,.92)') : 'transparent';
      b.style.color = on ? (o.activeColor || '#17141F') : 'inherit';
    });
  }
  function set(v, silent) { paint(v); if (!silent && o.onChange) o.onChange(v); }
  set(o.value != null ? o.value : o.items[0].v, true);
  return { set };
};

/* iOS 开关 */
SW.ui.toggle = function (el, o) {
  el.style.cssText += ';width:52px;height:31px;border-radius:16px;background:' + (o.value ? '#6C5CE7' : 'rgba(120,120,140,.4)') + ';position:relative;cursor:pointer;transition:background .22s;flex:none';
  const knob = document.createElement('span');
  knob.style.cssText = 'position:absolute;top:2.5px;left:' + (o.value ? '23.5px' : '2.5px') + ';width:26px;height:26px;border-radius:50%;background:#fff;transition:left .22s cubic-bezier(.4,0,.2,1);box-shadow:0 2px 6px rgba(0,0,0,.3)';
  el.appendChild(knob);
  let v = !!o.value;
  el.addEventListener('click', () => {
    v = !v;
    el.style.background = v ? '#6C5CE7' : 'rgba(120,120,140,.4)';
    knob.style.left = v ? '23.5px' : '2.5px';
    SW.audio.tap();
    if (o.onChange) o.onChange(v);
  });
  return { get: () => v, set(x) { v = !!x; el.style.background = v ? '#6C5CE7' : 'rgba(120,120,140,.4)'; knob.style.left = v ? '23.5px' : '2.5px'; } };
};

/* 滑块 */
SW.ui.slider = function (el, o) {
  el.style.cssText += ';position:relative;height:26px;display:flex;align-items:center;cursor:pointer;touch-action:none';
  const track = document.createElement('div');
  track.style.cssText = 'position:absolute;left:0;right:0;height:5px;border-radius:3px;background:rgba(130,130,160,.35)';
  const fill = document.createElement('div');
  fill.style.cssText = 'position:absolute;left:0;height:5px;border-radius:3px;background:' + (o.color || '#B9A9F5') + ';width:0';
  const knob = document.createElement('div');
  knob.style.cssText = 'position:absolute;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);transform:translateX(-50%)';
  el.append(track, fill, knob);
  let v = o.value != null ? o.value : o.min;
  function paint() {
    const k = (v - o.min) / (o.max - o.min);
    fill.style.width = (k * 100) + '%';
    knob.style.left = (k * 100) + '%';
  }
  paint();
  function fromEvent(e) {
    const r = el.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    let nv = o.min + k * (o.max - o.min);
    if (o.step) nv = Math.round(nv / o.step) * o.step;
    v = nv; paint(); if (o.onChange) o.onChange(v);
  }
  let dragging = false;
  el.addEventListener('pointerdown', e => { dragging = true; el.setPointerCapture(e.pointerId); fromEvent(e); });
  el.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
  el.addEventListener('pointerup', () => { dragging = false; SW.audio.tap(); });
  return { get: () => v, set(x) { v = x; paint(); } };
};

/* 数字键盘 keys:[{t,wide?,svg?}] */
SW.ui.keypad = function (o) {
  const grid = o.el;
  grid.style.cssText += ';display:grid;grid-template-columns:repeat(3,1fr);gap:10px';
  (o.keys || []).forEach(k => {
    const b = document.createElement('button');
    if (k.svg) b.innerHTML = k.svg; else b.textContent = k.t;
    b.style.cssText = 'cursor:pointer;border:0;border-radius:14px;padding:14px 0;font-size:21px;font-weight:600;color:inherit;background:' + (o.bg || 'rgba(255,255,255,.07)') + ';transition:transform .1s;display:flex;align-items:center;justify-content:center';
    if (k.wide) b.style.gridColumn = 'span 2';
    SW.ui.press(b);
    b.addEventListener('click', () => o.onPress(k.t));
    grid.appendChild(b);
  });
  return grid;
};

/* 手机内底部弹层 host=.phone screen 元素 */
SW.ui.sheet = function (o) {
  const host = o.host;
  const mask = document.createElement('div');
  mask.style.cssText = 'position:absolute;inset:0;z-index:60;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;border-radius:inherit';
  const panel = document.createElement('div');
  panel.style.cssText = 'width:100%;background:' + (o.bg || '#1D1B2E') + ';border-radius:22px 22px 0 0;padding:16px 18px 26px;transform:translateY(30px);opacity:0;transition:all .26s cubic-bezier(.3,0,.2,1);color:#fff;max-height:72%;overflow-y:auto';
  const title = document.createElement('div');
  title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px';
  title.innerHTML = '<b style="font-size:16px">' + (o.title || '选择') + '</b>';
  const x = document.createElement('button');
  x.textContent = '✕'; x.style.cssText = 'cursor:pointer;border:0;background:rgba(255,255,255,.1);color:#fff;width:28px;height:28px;border-radius:50%;font-size:13px';
  x.addEventListener('click', close);
  title.appendChild(x); panel.appendChild(title);
  (o.items || []).forEach(it => {
    const row = document.createElement('button');
    row.style.cssText = 'width:100%;text-align:left;cursor:pointer;border:0;background:rgba(255,255,255,.05);color:#fff;border-radius:14px;padding:13px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;font-size:14.5px;font-weight:600';
    row.innerHTML = (it.icon || '') + '<span style="flex:1">' + it.label + (it.desc ? '<br><span style="font-size:12px;opacity:.6;font-weight:400">' + it.desc + '</span>' : '') + '</span>' + (it.v === o.value ? '<span style="color:#8B7CF6">✓</span>' : '');
    row.addEventListener('click', () => { close(); if (o.onPick) o.onPick(it.v); });
    panel.appendChild(row);
  });
  mask.appendChild(panel); host.appendChild(mask);
  requestAnimationFrame(() => { panel.style.transform = 'translateY(0)'; panel.style.opacity = '1'; });
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  function close() { panel.style.transform = 'translateY(30px)'; panel.style.opacity = '0'; setTimeout(() => mask.remove(), 240); }
  return { close };
};

/* 轮播：横向滑动 + 圆点 */
SW.ui.carousel = function (o) {
  const el = o.el;
  el.style.cssText += ';overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;display:flex;border-radius:inherit';
  el.innerHTML = '';
  el.style.setProperty('--x', 0);
  const dots = o.dots;
  let cur = o.value || 0;
  const n = o.count;
  function paintDots() {
    if (!dots) return;
    Array.from(dots.children).forEach((d, i) => {
      d.style.background = i === cur ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.35)';
      d.style.transform = i === cur ? 'scale(1.15)' : 'scale(1)';
    });
  }
  if (dots) {
    dots.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('span');
      d.style.cssText = 'width:7px;height:7px;border-radius:50%;display:inline-block;transition:all .2s;cursor:pointer';
      d.addEventListener('click', () => go(i));
      dots.appendChild(d);
    }
  }
  function go(i) {
    cur = Math.max(0, Math.min(n - 1, i));
    el.scrollTo({ left: el.clientWidth * cur, behavior: 'smooth' });
    paintDots();
    if (o.onChange) o.onChange(cur);
  }
  let st = 0;
  el.addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== cur) { cur = i; paintDots(); if (o.onChange) o.onChange(cur); }
    }, 90);
  });
  paintDots();
  return { go, get: () => cur };
};

/* 首字头像 */
SW.ui.avatar = function (o) {
  const d = document.createElement('div');
  d.textContent = o.txt || '·';
  const s = o.size || 40;
  d.style.cssText = 'width:' + s + 'px;height:' + s + 'px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;color:' + (o.color || '#fff') + ';font-size:' + Math.round(s * 0.4) + 'px;background:' + (o.bg || 'linear-gradient(135deg,#8B7CF6,#5B5FEF)') + (o.border ? ';box-shadow:0 0 0 2px ' + o.border : '');
  return d;
};
})();
