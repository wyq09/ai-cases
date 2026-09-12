/* ===== src/game.js — 状态机/渲染/计时/持久化/接线（主线负责） ===== */
window.SP = window.SP || {};
SP.GAME = (() => {
  'use strict';

  const LS_CFG = 'sp_config_v1', LS_ST = 'sp_state_v1';
  const Q = new URLSearchParams(location.search);
  // ?reset=1 必须在读 localStorage 之前清档
  if (Q.get('reset') === '1') {
    try { localStorage.removeItem(LS_CFG); localStorage.removeItem(LS_ST); } catch (e) {}
  }

  const noop = () => {};
  const NOOP_AUDIO = new Proxy({ names: [] }, { get: (t, k) => (k in t ? t[k] : noop) });
  const NOOP_FX = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop) });
  const A = () => SP.AUDIO || NOOP_AUDIO;
  const F = () => SP.FX || NOOP_FX;
  const $ = id => document.getElementById(id);

  function deepMerge(base, ext) {
    if (!ext || typeof ext !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const k of Object.keys(ext)) {
      const v = ext[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(base[k] || {}, v) : v;
    }
    return out;
  }

  function defaultCfg() {
    return { n: 5, leaves: true, sound: true, vols: { sfx: 0.9 }, picture: null, sounds: {} };
  }
  let cfg = defaultCfg();
  try {
    const raw = localStorage.getItem(LS_CFG);
    if (raw) cfg = deepMerge(defaultCfg(), JSON.parse(raw));
  } catch (e) {}
  window.SP.defaultCfg = defaultCfg;

  // ---- 局内状态 ----
  let S = { n: cfg.n, board: null, steps: 0, elapsed: 0, running: false, lastStart: 0, won: false, best: {} };
  try {
    const raw = localStorage.getItem(LS_ST);
    if (raw) {
      const st = JSON.parse(raw);
      if (st && st.board && st.board.length === (st.n | 0) * (st.n | 0)) {
        S = deepMerge(S, st);
        if (S.won) { S.won = false; S.board = null; } // 赢完的局不复活
        S.running = false; S.lastStart = 0;          // 离线时间不计入
      }
    }
  } catch (e) {}

  let scale = 1, busy = false, demo = null, hintPlan = null;
  let tileEls = {};   // tile值 -> 元素
  let cfgReady = false;

  const grid = $('grid'), board = $('board');
  const now = () => Date.now();
  const elapsedNow = () => S.elapsed + (S.running ? now() - S.lastStart : 0);
  const fmt = ms => {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  // ---- 自适应缩放 ----
  function fit() {
    scale = Math.min(innerWidth / 720, innerHeight / 1280);
    const st = $('stage');
    st.style.transform = `translate(-50%,-50%) scale(${scale})`;
  }
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);

  // ---- 渲染 ----
  function cellGeom() {
    const gap = 6, W = 668;
    const cell = (W - gap * (S.n - 1)) / S.n;
    return { gap, cell };
  }
  function xyOf(idx) {
    const { gap, cell } = cellGeom();
    const r = (idx / S.n) | 0, c = idx % S.n;
    return { x: c * (cell + gap), y: r * (cell + gap) };
  }
  function buildTiles() {
    grid.innerHTML = '';
    tileEls = {};
    const { cell } = cellGeom();
    const fs = Math.round(cell * 0.46);
    for (let v = 1; v < S.n * S.n; v++) {
      const el = document.createElement('div');
      el.className = 'tile';
      el.dataset.v = v;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = v;
      num.style.fontSize = fs + 'px';
      el.appendChild(num);
      grid.appendChild(el);
      tileEls[v] = el;
    }
    applyPicture();
    layoutAll(false);
  }
  function layoutAll(anim = true) {
    for (let i = 0; i < S.board.length; i++) {
      const v = S.board[i];
      if (!v) continue;
      const el = tileEls[v];
      const { x, y } = xyOf(i);
      if (!anim) el.style.transition = 'none';
      el.style.width = el.style.height = cellGeom().cell + 'px';
      el.style.transform = `translate(${x}px,${y}px)`;
      if (!anim) { void el.offsetWidth; el.style.transition = ''; }
    }
  }
  function applyPicture() {
    const pic = cfg.picture;
    for (let v = 1; v < S.n * S.n; v++) {
      const el = tileEls[v];
      if (!el) continue;
      const num = el.firstChild;
      if (pic) {
        const gr = ((v - 1) / S.n) | 0, gc = (v - 1) % S.n;
        el.style.backgroundImage = `url(${pic})`;
        el.style.backgroundSize = `${S.n * 100}% ${S.n * 100}%`;
        el.style.backgroundPosition = `${S.n > 1 ? (gc / (S.n - 1)) * 100 : 0}% ${S.n > 1 ? (gr / (S.n - 1)) * 100 : 0}%`;
        num.style.display = 'none';
      } else {
        el.style.backgroundImage = '';
        el.style.backgroundSize = '';
        el.style.backgroundPosition = '';
        num.style.display = '';
      }
    }
  }

  // ---- 计时 ----
  setInterval(() => { $('timeVal').textContent = fmt(elapsedNow()); }, 250);

  // ---- 存档 ----
  function save() {
    try {
      localStorage.setItem(LS_ST, JSON.stringify({ ...S, elapsed: elapsedNow(), running: S.running, lastStart: 0 }));
    } catch (e) {}
  }
  function saveCfg() {
    try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch (e) {}
  }
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('pagehide', save);

  // ---- 核心走子 ----
  function doMove(i, opt = {}) {
    if (S.won) return false;
    const v = S.board[i];
    if (!v || !SP.LOGIC.canMove(S.board, S.n, i)) {
      if (!opt.demo && v) {
        A().play('denied');
        const el = tileEls[v];
        el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      }
      return false;
    }
    const from = i, to = SP.LOGIC.blankOf(S.board);
    S.board = SP.LOGIC.applyMove(S.board, S.n, i);
    S.steps++;
    if (!S.running && !S.won) { S.running = true; S.lastStart = now(); }
    const el = tileEls[v];
    const { x, y } = xyOf(to);
    el.style.transform = `translate(${x}px,${y}px)`;
    A().play('move');
    if (S.board[to] === to + 1) A().play('snap');
    $('stepVal').textContent = S.steps;
    save();
    if (SP.LOGIC.isSolved(S.board)) onWin();
    return true;
  }

  function onWin() {
    S.won = true;
    S.elapsed = elapsedNow();
    S.running = false;
    const key = String(S.n);
    const prev = S.best[key];
    const isNew = !prev || S.elapsed < prev.t;
    if (isNew) S.best[key] = { t: S.elapsed, s: S.steps };
    save();
    A().play('win');
    const r = board.getBoundingClientRect();
    const st = $('stage').getBoundingClientRect();
    const cx = (r.left + r.width / 2 - st.left) / scale;
    const cy = (r.top + r.height / 2 - st.top) / scale;
    F().leafBurst(cx, cy, 80);
    $('winTime').textContent = fmt(S.elapsed);
    $('winSteps').textContent = S.steps;
    $('winBest').textContent = fmt(S.best[key].t) + (isNew ? ' （新纪录！）' : '');
    setTimeout(() => { $('winOverlay').classList.add('show'); }, 650);
  }

  function newGame(n) {
    cancelDemo();
    if (n) S.n = n;
    S.board = SP.LOGIC.shuffle(S.n);
    S.steps = 0; S.elapsed = 0; S.running = false; S.won = false;
    $('stepVal').textContent = '0';
    $('timeVal').textContent = '00:00';
    $('sizeVal').textContent = `${S.n}×${S.n}`;
    cfg.n = S.n;
    buildTiles();
    A().play('shuffle');
    save();
  }

  function resumeOrNew() {
    if (S.board) {
      $('stepVal').textContent = S.steps;
      $('sizeVal').textContent = `${S.n}×${S.n}`;
      buildTiles();
    } else {
      newGame();
    }
  }

  // ---- 提示 / 自动演示 ----
  function stopTimerPause() {} // 演示不打断计时
  function hintOne() {
    if (busy || S.won) return;
    const p = SP.LOGIC.plan(S.board, S.n);
    if (!p || !p.length) { toast(p ? '已经拼好啦' : '提示不可用'); return; }
    busy = true;
    doMove(p[0]);
    setTimeout(() => { busy = false; }, 170);
  }
  function startDemo() {
    if (busy || demo || S.won) return;
    const p = SP.LOGIC.plan(S.board, S.n);
    if (!p || !p.length) { toast('已经拼好啦'); return; }
    demo = { p, i: 0 };
    busy = true;
    toast('自动演示中，点棋盘可停止');
    demoStep();
  }
  function demoStep() {
    if (!demo) return;
    if (demo.i >= demo.p.length || S.won) { cancelDemo(); return; }
    doMove(demo.p[demo.i++], { demo: true });
    if (demo) demo.timer = setTimeout(demoStep, 150);
  }
  function cancelDemo() {
    if (demo) { clearTimeout(demo.timer); demo = null; }
    busy = false;
  }

  // ---- 交互 ----
  grid.addEventListener('pointerdown', e => {
    A().unlock();
    if (demo) { cancelDemo(); grid._swallow = true; return; }
    grid._pd = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  grid.addEventListener('pointerup', e => {
    if (grid._swallow) { grid._swallow = false; return; }
    if (S.won || busy) return;
    const pd = grid._pd;
    if (!pd) return;
    grid._pd = null;
    const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
    const rect = grid.getBoundingClientRect();
    const lx = (e.clientX - rect.left) / scale, ly = (e.clientY - rect.top) / scale;
    const { cell, gap } = cellGeom();
    const stride = cell + gap;
    const c = Math.floor(lx / stride), r = Math.floor(ly / stride);
    if (c < 0 || c >= S.n || r < 0 || r >= S.n) return;
    const idx = r * S.n + c;
    if (Math.hypot(dx, dy) < 18) {
      doMove(idx);
    } else if (Math.abs(dx) > Math.abs(dy)) {
      doMove(SP.LOGIC.blankOf(S.board) - Math.sign(dx));       // 左滑→空格右侧块滑入
    } else {
      doMove(SP.LOGIC.blankOf(S.board) - Math.sign(dy) * S.n); // 上滑→空格下方块滑入
    }
  });

  function pressable(id, fn) {
    const el = $(id);
    el.addEventListener('pointerdown', () => { el.classList.add('pressed'); A().unlock(); });
    const up = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', () => { A().play('button'); fn(); });
  }

  pressable('btnReset', () => { newGame(); toast('已重新打乱'); });
  pressable('btnBack', () => { renderBest(); $('helpOverlay').classList.add('show'); });
  pressable('btnHelpClose', () => $('helpOverlay').classList.remove('show'));
  pressable('btnSettings', () => {
    if (SP.CONFIG_PANEL) SP.CONFIG_PANEL.open();
    else toast('设置未就绪');
  });
  pressable('btnAgain', () => { $('winOverlay').classList.remove('show'); newGame(); });
  pressable('btnWinClose', () => $('winOverlay').classList.remove('show'));
  pressable('plaque', () => {
    const n = S.n >= 6 ? 3 : S.n + 1;
    newGame(n);
    toast(`已切换 ${n}×${n}`);
  });

  // 提示：点按归位一枚，长按 600ms 自动演示
  {
    let lpTimer = null, longFired = false;
    const btn = $('btnHint');
    btn.addEventListener('pointerdown', () => {
      longFired = false;
      lpTimer = setTimeout(() => { longFired = true; startDemo(); }, 600);
    });
    const clear = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
    btn.addEventListener('pointerup', clear);
    btn.addEventListener('pointerleave', clear);
    btn.addEventListener('pointercancel', clear);
    btn.addEventListener('click', () => { if (!longFired) hintOne(); });
  }

  // ---- 声音按钮 ----
  function syncSoundIcon() {
    if (SP.ART) $('imgSound').src = SP.ART.icon(cfg.sound ? 'sndOn' : 'sndOff');
  }
  pressable('btnSound', () => {
    cfg.sound = !cfg.sound;
    A().setMuted(!cfg.sound);
    syncSoundIcon();
    saveCfg();
    toast(cfg.sound ? '声音已开启' : '声音已关闭');
  });

  // ---- 背景落叶 ----
  let leafTimer = null;
  function spawnLeaf() {
    const host = $('bgLeaves');
    if (cfg.leaves && host.children.length < 4 && SP.ART) {
      const wrap = document.createElement('div');
      wrap.className = 'bgleaf';
      const img = document.createElement('img');
      img.src = SP.ART.leaf((Math.random() * 3) | 0);
      const sz = 34 + Math.random() * 30;
      img.style.width = sz + 'px';
      wrap.style.left = (Math.random() * 660) + 'px';
      wrap.style.animationDuration = (9 + Math.random() * 7) + 's';
      img.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      wrap.appendChild(img);
      wrap.addEventListener('animationend', () => wrap.remove());
      host.appendChild(wrap);
    }
    leafTimer = setTimeout(spawnLeaf, 2800 + Math.random() * 2600);
  }
  function syncLeaves() { $('bgLeaves').style.display = cfg.leaves ? '' : 'none'; }

  // ---- 最佳纪录 ----
  function renderBest() {
    const host = $('bestList');
    host.innerHTML = '';
    for (const n of [3, 4, 5, 6]) {
      const b = S.best[String(n)];
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `<span>${n}×${n}</span><span>${b ? fmt(b.t) + ' / ' + b.s + '步' : '--'}</span>`;
      host.appendChild(row);
    }
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  // ---- 配置面板 ----
  if (SP.CONFIG_PANEL) {
    SP.CONFIG_PANEL.mount($('cfgHost'));
    SP.CONFIG_PANEL.onChange(snap => {
      const nChanged = snap.n !== cfg.n && snap.n !== S.n;
      const wasN = cfg.n;
      cfg = snap;
      A().setVolume(cfg.vols ? cfg.vols.sfx : 0.9);
      A().setMuted(!cfg.sound);
      A().applyOverrides(cfg.sounds || {});
      syncLeaves();
      syncSoundIcon();
      applyPicture();
      if (cfg.n !== wasN) newGame(cfg.n);
      saveCfg();
    });
  }

  // ---- 图标 ----
  function paintIcons() {
    if (!SP.ART) return;
    $('imgBack').src = SP.ART.icon('back');
    $('imgTimer').src = SP.ART.icon('timer');
    $('imgFoot').src = SP.ART.icon('foot');
    $('imgReset').src = SP.ART.icon('reset');
    $('imgBulb').src = SP.ART.icon('bulb');
    $('imgTrophy').src = SP.ART.icon('trophy');
    syncSoundIcon();
  }

  // ---- 启动 ----
  if (Q.get('n')) {
    const n = Math.min(6, Math.max(3, parseInt(Q.get('n'), 10) || 5));
    if (n !== S.n) { S.n = n; S.board = null; }
  }
  fit();
  resumeOrNew();
  paintIcons();
  syncLeaves();
  A().setVolume(cfg.vols ? cfg.vols.sfx : 0.9);
  A().setMuted(!cfg.sound);
  A().applyOverrides(cfg.sounds || {});
  spawnLeaf();
  document.addEventListener('pointerdown', () => A().unlock(), { once: true, capture: true });

  if (Q.get('muted') === '1') { cfg.sound = false; A().setMuted(true); syncSoundIcon(); }
  if (Q.get('autoplay') === '1') setTimeout(startDemo, 800);

  // ---- 测试钩子 ----
  window.__sp = {
    version: '1.0',
    get state() { return S; },
    get cfg() { return cfg; },
    get busy() { return busy; },
    get demo() { return !!demo; },
    move(i) { return doMove(i); },
    newGame,
    hintOne, startDemo, cancelDemo,
    rig(name) {
      if (name === 'one') {
        const b = SP.LOGIC.solved(S.n);
        // 从复原局倒走一步：把 N²-2 号块滑进空格
        const b2 = SP.LOGIC.applyMove(b, S.n, S.n * S.n - 2);
        S.board = b2; S.steps = 1; S.running = true; S.lastStart = now(); S.won = false;
        buildTiles();
      }
    },
    save, toast,
  };
  if (Q.get('rig') === 'one') window.__sp.rig('one');

  return {};
})();
