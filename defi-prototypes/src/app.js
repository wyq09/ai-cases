/* app.js — 命名空间/场景注册/海报渲染/dock/全屏观看器/toast/音频/持久化/错误采集 */
(function(){
'use strict';
// ?reset=1 清档必须最先执行
if (location.search.indexOf('reset=1') >= 0) {
  try { Object.keys(localStorage).filter(k => k.indexOf('swp:') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}

const SW = window.SW = { errs: [] };
window.__errs = SW.errs;
window.addEventListener('error', e => SW.errs.push(String(e.message || e)));
window.addEventListener('unhandledrejection', e => SW.errs.push('promise: ' + String(e.reason && e.reason.message || e.reason)));

/* ── 持久化 ── */
SW.store = {
  get(k, d) { try { const v = localStorage.getItem('swp:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('swp:' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ── toast ── */
let toastTimer = 0;
SW.toast = function (msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
};

/* ── 音频（首次交互解锁） ── */
SW.audio = (function () {
  let ctx = null;
  function unlock() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ctx && ctx.state === 'suspended') ctx.resume(); }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  function tone(f0, f1, dur, vol, type) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  return {
    unlock,
    pop() { tone(560, 150, 0.1, 0.14, 'triangle'); tone(1400, 900, 0.05, 0.05, 'sine'); },
    tap() { tone(1250, 900, 0.045, 0.05, 'sine'); },
    ok() { tone(520, 780, 0.14, 0.08, 'sine'); }
  };
})();

/* ── 场景注册表 ── */
SW.scenes = { list: [], register(m) { SW.scenes.list.push(m); } };

/* ── 手机登记（供全屏观看器遍历） ── */
SW._phones = []; // {name, title, root, wrap, scale, sectionId}
SW._registerPhone = function (p) { SW._phones.push(p); };

/* ── 海报构建 ── */
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function buildStage() {
  const stage = document.getElementById('stage');
  const dock = document.getElementById('dock');
  const scenes = SW.scenes.list.slice().sort((a, b) => a.num - b.num);
  scenes.forEach(m => {
    const sec = document.createElement('section');
    sec.className = 'scene'; sec.id = 'scene-' + m.id; sec.dataset.sid = m.id;
    const hd = document.createElement('div'); hd.className = 'scene-hd';
    hd.innerHTML = '<span class="no">图 ' + m.num + '</span><h2>' + esc(m.title || '') + '</h2>' +
      (m.sub ? '<span class="sub">' + esc(m.sub) + '</span>' : '') + '<span class="sp"></span>' +
      '<button class="btn-ghost" data-full="' + m.id + '">⤢ 全屏体验</button>';
    sec.appendChild(hd);
    const poster = document.createElement('div'); poster.className = 'poster';
    if (m.bg) poster.style.background = m.bg;
    if (m.captions && m.captions.length) {
      const caps = document.createElement('div'); caps.className = 'poster-caps';
      caps.innerHTML = m.captions.map(c => '<span>' + esc(c) + '</span>').join('');
      poster.appendChild(caps);
    }
    const row = document.createElement('div'); row.className = 'poster-row';
    poster.appendChild(row); sec.appendChild(poster); stage.appendChild(sec);
    try { m.build(row, SW); }
    catch (err) {
      SW.errs.push('scene ' + m.id + ': ' + (err && err.message || err));
      const ec = document.createElement('div'); ec.className = 'err-card';
      ec.textContent = '场景「' + (m.title || m.id) + '」渲染失败：' + (err && err.message || err);
      row.appendChild(ec);
    }
    // 背景氛围泡泡
    if (m.ambience) {
      try { SW.fx.bubbles(poster, Object.assign({ interactive: false, mode: 'rise', count: 12, maxR: 60, speed: 0.22, z: 0 }, m.ambience)); } catch (e) {}
    }
    // dock 按钮
    const b = document.createElement('button');
    b.textContent = '图' + m.num; b.dataset.sid = m.id;
    b.addEventListener('click', () => { SW.audio.tap(); document.getElementById('scene-' + m.id).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    dock.appendChild(b);
  });
  // dock 高亮跟随
  const io = new IntersectionObserver(es => {
    es.forEach(e => {
      if (e.isIntersecting) {
        dock.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.sid === e.target.dataset.sid));
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px' });
  stage.querySelectorAll('section.scene').forEach(s => io.observe(s));
  // 海报区进出视口 → 暂停远处泡泡由 fx 内部 IntersectionObserver 处理
  // 全屏体验按钮
  stage.addEventListener('click', e => {
    const b = e.target.closest('[data-full]');
    if (b) openViewerByScene(b.dataset.full);
  });
}

/* ── 全屏观看器（把 .phone 元素搬进 viewer，关闭时搬回） ── */
const viewer = {
  cur: -1, placeholder: null, originScale: 1,
  list() { return SW._phones; },
  open(i) {
    const phones = this.list(); if (!phones.length) return;
    i = (i + phones.length) % phones.length;
    if (this.cur >= 0) this.restore();
    this.cur = i;
    const p = phones[i];
    const v = document.getElementById('viewer'), vw = document.getElementById('vWrap');
    document.getElementById('vTitle').textContent = '图' + (p.num || '') + ' · ' + (p.title || p.name);
    // 占位防塌陷
    this.placeholder = document.createElement('div');
    this.placeholder.style.cssText = 'width:' + p.wrap.offsetWidth + 'px;height:' + p.wrap.offsetHeight + 'px;flex:0 0 auto';
    p.wrap.parentNode.insertBefore(this.placeholder, p.wrap);
    // 计算适配缩放
    const s = Math.min((innerWidth - 28) / 390, (innerHeight - 118) / 844, 1.05);
    this.originScale = p.scale;
    vw.appendChild(p.wrap);
    p.root.style.transform = 'scale(' + s + ')';
    p.wrap.style.width = (390 * s) + 'px'; p.wrap.style.height = (844 * s) + 'px';
    v.classList.add('show');
    SW.audio.tap();
  },
  restore() {
    const p = this.list()[this.cur]; if (!p) return;
    p.root.style.transform = 'scale(' + this.originScale + ')';
    p.wrap.style.width = (390 * this.originScale) + 'px'; p.wrap.style.height = (844 * this.originScale) + 'px';
    this.placeholder.parentNode.insertBefore(p.wrap, this.placeholder);
    this.placeholder.remove(); this.placeholder = null;
  },
  close() { if (this.cur < 0) return; this.restore(); this.cur = -1; document.getElementById('viewer').classList.remove('show'); },
  step(d) { if (this.cur >= 0) this.open(this.cur + d); }
};
SW.viewer = viewer;

function openViewerByScene(sid) {
  const idx = SW._phones.findIndex(p => p.name === sid + '1' || (p.name || '').indexOf(sid) === 0);
  viewer.open(idx >= 0 ? idx : 0);
}

document.getElementById('vClose').addEventListener('click', () => viewer.close());
document.getElementById('vPrev').addEventListener('click', () => viewer.step(-1));
document.getElementById('vNext').addEventListener('click', () => viewer.step(1));
document.getElementById('viewer').addEventListener('dblclick', e => { if (e.target.id === 'viewer') viewer.close(); });
document.getElementById('brandLogo').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('keydown', e => { if (e.key === 'Escape') viewer.close(); });

/* ── 双击手机 → 全屏（事件委托） ── */
let lastTap = 0, lastPhone = null;
window.addEventListener('pointerdown', e => {
  const ph = e.target.closest && e.target.closest('.phone');
  if (!ph) return;
  const now = Date.now();
  if (now - lastTap < 320 && lastPhone === ph) {
    const idx = SW._phones.findIndex(p => p.root === ph);
    if (idx >= 0) { e.preventDefault(); viewer.open(idx); }
  }
  lastTap = now; lastPhone = ph;
}, true);

/* ── 启动 ── */
let booted = false;
SW.boot = function () {
  if (booted) return; booted = true;
  buildStage();
  // 深链 ?scene=x&phone=x2
  const q = new URLSearchParams(location.search);
  const sid = q.get('scene');
  if (sid) {
    setTimeout(() => {
      const sec = document.getElementById('scene-' + sid);
      if (sec) sec.scrollIntoView({ block: 'start' });
      const pid = q.get('phone');
      if (pid) {
        const idx = SW._phones.findIndex(p => p.name === pid);
        if (idx >= 0) setTimeout(() => viewer.open(idx), 350);
      }
    }, 420);
  }
};
function ready() {
  if (window.__SWP_TEST__) { return; } // test.html 注入完脚本后手动调 SW.boot
  SW.boot();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
else {
  // index.html 同步脚本：场景脚本已全部执行完
  if (window.__SWP_BUILT__) SW.boot();
  else document.addEventListener('swp:ready', SW.boot, { once: true });
}
})();
