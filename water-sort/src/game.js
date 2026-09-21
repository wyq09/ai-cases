/* 倒水挑战 — 主游戏：状态机 / 画布渲染 / 倒水动画 / 持久化 / AI 演示 */
window.WS = window.WS || {};
WS.GAME = (() => {
  const L = WS.LOGIC;
  const noop = () => {};
  // 缺模块兜底（开发期子代理未就绪也能跑）
  const svg = d => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d);
  const ART = WS.ART || (() => {
    // 极简兜底：能跑通流程的素坯（正常路径走子代理美术）
    const FALLBACK_LIQUIDS = {
      classic: ['#F5C542', '#E2483D', '#3FA0D8', '#59B35B', '#F08A3C', '#EF7FA4', '#8E6FC8', '#4EC8C0', '#A5714A', '#A8C93A'],
      candy: ['#FF8FB2', '#FFD166', '#7FD8BE', '#9B8CFF', '#FF9F68', '#6FC7E1', '#C3E88D', '#F78FB0', '#BFA76A', '#7986CB'],
      ocean: ['#2E86AB', '#7ADCC7', '#F6C445', '#E4717A', '#9BDE7E', '#5E60CE', '#F49FBC', '#43AA8B', '#F8961E', '#90BE6D'],
    };
    const bottleSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 190"><path d="M38 12 h24 v6 c0 8 3 14 8 22 c6 10 9 20 9 34 v94 c0 10 -7 16 -16 16 h-26 c-9 0 -16 -6 -16 -16 v-94 c0 -14 3 -24 9 -34 c5 -8 8 -14 8 -22 z" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.55)" stroke-width="3"/><rect x="24" y="70" width="7" height="86" rx="3.5" fill="rgba(255,255,255,.4)"/></svg>';
    return {
      ready: Promise.resolve(),
      bg: () => svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 690 1232"><rect width="690" height="1232" fill="#A96A3F"/><rect width="690" height="271" fill="#8A6FA5"/><rect y="271" width="690" height="65" fill="#8A5533"/></svg>'),
      pig: () => svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 170"><circle cx="100" cy="85" r="70" fill="#F2A9B8"/></svg>'),
      scooterPig: () => svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 300"><circle cx="180" cy="150" r="90" fill="#F2A9B8"/></svg>'),
      logo: () => svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 260"><text x="260" y="170" font-size="120" font-weight="900" text-anchor="middle" fill="#FFC93C" stroke="#fff" stroke-width="10">倒水挑战</text></svg>'),
      bottle: () => ({ img: svg(bottleSVG), innerD: 'M30 70 h40 v106 a14 14 0 0 1 -14 14 h-12 a14 14 0 0 1 -14 -14 z', inner: { x: 30, y: 70, w: 40, h: 120 }, mouth: { x: 50, y: 12 }, W: 100, H: 190 }),
      icon: (n) => svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="#8A5A2A"/></svg>'),
      setRoom: noop, rooms: {}, liquids: FALLBACK_LIQUIDS,
    };
  })();
  const AUDIO = WS.AUDIO || { unlock: noop, play: noop, startLoop: noop, stopLoop: noop, duck: noop, setBGMVolume: noop, setSFXVolume: noop, setMasterVolume: noop, applyOverrides: noop, names: [] };
  const FX = WS.FX || { init: noop, resize: noop, droplets: noop, sparkle: noop, confetti: noop, stop: noop, clear: noop };
  const PANEL = WS.PANEL || { mount: noop, open: noop, close: noop, isOpen: () => false, onChange: noop };

  // ?reset=1 必须在任何 localStorage 读取之前
  if (location.search.indexOf('reset=1') >= 0) {
    try { localStorage.removeItem(L.LS_ST); localStorage.removeItem(L.LS_CFG); } catch (e) {}
  }
  const qs = k => {
    const m = location.search.match(new RegExp('[?&]' + k + '=([\\w-]+)'));
    return m ? m[1] : null;
  };
  // 错误探针（测试用）
  window.__errs = [];
  window.addEventListener('error', e => window.__errs.push('ERR: ' + e.message + ' @' + (e.filename || '') + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => window.__errs.push('REJ: ' + (e.reason && e.reason.message || e.reason)));
  // ?snap=1 零动画
  const SNAP = location.search.indexOf('snap=1') >= 0;
  if (SNAP) document.documentElement.classList.add('snap');

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!patch || typeof patch !== 'object') return out;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(base[k] || {}, v) : v;
    }
    return out;
  }
  const loadJSON = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let cfg = deepMerge(L.DEFAULT_CFG, loadJSON(L.LS_CFG));
  const st = { lv: 1, stats: { clears: 0, movesTotal: 0 }, best: {} };
  const saved = loadJSON(L.LS_ST);
  if (saved && typeof saved === 'object') {
    if (saved.lv > 0) st.lv = saved.lv;
    if (saved.stats) st.stats = saved.stats;
    if (saved.best) st.best = saved.best;
  }
  const qlv = qs('level');
  if (qlv && +qlv > 0) st.lv = +qlv;
  const MUTED = qs('muted') === '1';
  const DEMO = qs('demo') === '1';

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const el = {
    app: $('app'), splash: $('splash'), splashLogo: $('splashLogo'), splashPig: $('splashPig'),
    splashBar: $('splashBar'), splashFill: $('splashFill'), splashStart: $('splashStart'),
    canvas: $('gameCanvas'), fxCanvas: $('fxCanvas'),
    pauseBtn: $('pauseBtn'), levelPill: $('levelPill'), pctPill: $('pctPill'),
    undoBtn: $('undoBtn'), hintBtn: $('hintBtn'), addBtn: $('addBtn'), restartBtn: $('restartBtn'),
    bubble: $('bubble'), bubbleFace: $('bubbleFace'),
    pauseMenu: $('pauseMenu'), pauseSub: $('pauseSub'),
    pmResume: $('pmResume'), pmRestart: $('pmRestart'), pmSkip: $('pmSkip'), pmSettings: $('pmSettings'), pmHome: $('pmHome'),
    winPanel: $('winPanel'), winStars: $('winStars'), winSub: $('winSub'), winNext: $('winNext'), winReplay: $('winReplay'),
    toast: $('toast'),
  };

  // ---------- 画布 ----------
  const ctx = el.canvas.getContext('2d');
  const fctx = el.fxCanvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let bgOff = null;           // 预渲染背景
  let bgMap = { s: 1, dx: 0, dy: 0 }; // cover 映射
  const BG_W = 690, BG_H = 1232;
  const LOCAL = { counterTop: 271, counterBot: 336, pigBase: 278 }; // bg viewBox 内的吧台线

  // ---------- 资源 ----------
  const IMG = {}; // name -> HTMLImageElement
  function loadImg(key, dataURI) {
    if (!dataURI) return Promise.resolve();
    return new Promise(res => {
      const im = new Image();
      im.onload = () => { IMG[key] = im; res(); };
      im.onerror = res;
      im.src = dataURI;
    });
  }
  let BOTTLE = ART.bottle();
  let innerPath = null;
  try { innerPath = new Path2D(BOTTLE.innerD); } catch (e) {}

  // ---------- 游戏状态 ----------
  let mode = 'splash';        // splash | playing | anim | win
  let lvData = null;          // genLevel 结果
  let bottles = [];
  let par = 0;                // 本关求解器步数（星级基准）
  let sel = -1;
  let moves = 0, addedUsed = 0, addedIds = 0;
  let undoStack = [];
  let pour = null;            // 倒水动画
  let selLift = 0;            // 选中瓶抬起量（px，缓动）
  let anims = {};             // i -> {deny: 剩余ms}
  let cheerUntil = 0;         // 猪欢呼截止
  let winShownAt = 0;
  let finishedLv = 0;         // 刚过关的关号（再玩一次用）
  let curLv = st.lv;          // 当前游玩关号（st.lv 是进度指针，重玩旧关时二者不同）
  let demoTimer = 0;
  const PIG_ACCENTS = ['#E8483F', '#F5B93C', '#3FA0D8'];

  const palette = () => (ART.liquids && (ART.liquids[cfg.liquidSet] || ART.liquids.classic)) || [];
  const liquidColor = c => palette()[c] || '#ccc';
  const dur = ms => SNAP ? 0 : ms / (cfg.animSpeed || 1);
  const busy = () => mode === 'anim' || PANEL.isOpen() || el.pauseMenu.classList.contains('hidden') === false;

  // ---------- 布局 ----------
  let slots = [];             // i -> {x,y} 瓶盒左上角（css px）
  let BW = 54, BH = 128;      // 瓶盒尺寸
  let pigPos = [];            // 三只猪 {x, w}
  let pigImgs = ['', '', ''];
  let pigCheer = ['', '', ''];

  function layout() {
    const rect = el.canvas.getBoundingClientRect();
    W = Math.round(rect.width); H = Math.round(rect.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [el.canvas, el.fxCanvas]) { c.width = W * DPR; c.height = H * DPR; }
    FX.resize(W, H, DPR);
    // 背景 cover 映射
    const s = Math.max(W / BG_W, H / BG_H);
    bgMap = { s, dx: (W - BG_W * s) / 2, dy: (H - BG_H * s) / 2 };
    buildBG();
    // 猪位置
    const pw = 150 * s;
    pigPos = [0, 1, 2].map(i => ({ x: W / 2 + (i - 1) * pw * 1.06 - pw / 2, w: pw }));
    layoutBottles();
  }

  function buildBG() {
    const im = IMG.bg;
    bgOff = document.createElement('canvas');
    bgOff.width = W * DPR; bgOff.height = H * DPR;
    const b = bgOff.getContext('2d');
    b.scale(DPR, DPR);
    if (im) b.drawImage(im, bgMap.dx, bgMap.dy, BG_W * bgMap.s, BG_H * bgMap.s);
    else { b.fillStyle = '#A96A3F'; b.fillRect(0, 0, W, H); }
  }

  function toolbarTop() {
    const r = el.toolbar ? document.getElementById('toolbar').getBoundingClientRect() : { top: H - 80 };
    return r.top;
  }

  function layoutBottles() {
    const n = bottles.length;
    if (!n || !W) { slots = []; return; }
    const s = bgMap.s;
    const areaTop = bgMap.dy + LOCAL.counterBot * s + 8;
    const areaBot = toolbarTop() - 12;
    const rows = n > 6 ? 2 : 1;
    const cols = Math.ceil(n / rows);
    const gap = Math.max(8, W * 0.024);
    const rowGap = 18;
    let bw = Math.min((W * 0.92 - (cols - 1) * gap) / cols, 66);
    let bh = bw * (BOTTLE.H / BOTTLE.W);
    const maxBH = (areaBot - areaTop - (rows - 1) * rowGap) / rows * 0.97;
    if (bh > maxBH) { bh = maxBH; bw = bh * (BOTTLE.W / BOTTLE.H); }
    BW = bw; BH = bh;
    slots = [];
    const totalW = cols * bw + (cols - 1) * gap;
    const x0 = (W - totalW) / 2;
    const gridH = rows * bh + (rows - 1) * rowGap;
    const y0 = areaTop + Math.max(0, (areaBot - areaTop - gridH) / 2);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const rowCount = (r === rows - 1) ? (n - r * cols) : cols;
      const rowW = rowCount * bw + (rowCount - 1) * gap;
      const rx0 = (W - rowW) / 2;
      slots.push({ x: rx0 + c * (bw + gap), y: y0 + r * (bh + rowGap) });
    }
  }

  // ---------- 渲染 ----------
  let lastDraw = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - lastDraw < 28) return;
    lastDraw = now;
    draw(now);
  }
  setInterval(() => { if (performance.now() - lastDraw > 140) { lastDraw = performance.now(); draw(performance.now()); } }, 120);

  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function draw(now) {
    if (!W) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (bgOff) ctx.drawImage(bgOff, 0, 0, W, H);
    drawPigs(now);
    // 倒水中的两个瓶最后画（在最上层）
    const skip = pour ? [pour.from, pour.to] : [];
    for (let i = 0; i < bottles.length; i++) {
      if (skip.indexOf(i) >= 0) continue;
      drawBottle(i, now, {});
    }
    if (pour) drawPouring(now);
  }

  function drawPigs(now) {
    const s = bgMap.s;
    // 横屏等矮窗时吧台被 cover 裁出屏外，把猪夹到贴顶露出
    let baseY = bgMap.dy + LOCAL.pigBase * s;
    const pigH = pigPos[0] ? pigPos[0].w * (170 / 200) : 0;
    baseY = Math.max(baseY, pigH * 0.94);
    const cheering = now < cheerUntil;
    for (let i = 0; i < 3; i++) {
      const im = cheering && pigCheer[i] ? (IMG['pigCheer' + i] || IMG['pig' + i]) : IMG['pig' + i];
      if (!im || !pigPos[i]) continue;
      const bob = Math.sin(now / 620 + i * 1.25) * 2.2 * s;
      let jump = 0;
      if (cheering) {
        const p = 1 - (cheerUntil - now) / 950;
        jump = -Math.abs(Math.sin(p * Math.PI * 3)) * 13 * s;
      }
      const w = pigPos[i].w, h = w * (170 / 200);
      ctx.drawImage(im, pigPos[i].x, baseY - h + bob + jump, w, h);
    }
  }

  // unitsF: 浮点格数（倒水动画中）；返回液面 y（盒内 css px）
  function drawLiquid(i, unitsF) {
    const inner = BOTTLE.inner;
    const unitH = inner.h / cfg.capacity;
    const bottom = inner.y + inner.h;
    let remaining = unitsF;
    for (let k = 0; k < Math.ceil(unitsF) && k < cfg.capacity + 1; k++) {
      const frac = Math.max(0, Math.min(1, remaining));
      if (frac <= 0) break;
      const h = frac * unitH;
      const yTop = bottom - (k + 1) * unitH + (1 - frac) * unitH;
      ctx.fillStyle = liquidColor(bottles[i][k]);
      ctx.fillRect((inner.x - 1.5) * BW / 100, yTop * BH / 190, (inner.w + 3) * BW / 100, h * BH / 190 + 0.6);
      remaining -= 1;
    }
    if (unitsF > 0) {
      // 层间暗线 + 顶面高光
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      for (let k = 1; k < Math.floor(unitsF + 0.001); k++) {
        const y = (bottom - k * unitH) * BH / 190;
        ctx.fillRect((inner.x - 1.5) * BW / 100, y - 0.7, (inner.w + 3) * BW / 100, 1.4);
      }
      const ySurf = (bottom - unitsF * unitH) * BH / 190;
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.fillRect((inner.x) * BW / 100, ySurf, (inner.w) * BW / 100, Math.max(1.6, BH * 0.012));
    }
    return (bottom - unitsF * unitH) * BH / 190;
  }

  function drawBottle(i, now, opt) {
    const p = slots[i]; if (!p) return;
    const a = anims[i] || {};
    let dx = 0;
    if (a.deny > 0) dx = Math.sin(now / 26) * 4 * (a.deny / 320);
    ctx.save();
    if (opt.pivot) {
      const mx = BOTTLE.mouth.x * BW / 100, my = BOTTLE.mouth.y * BH / 190;
      ctx.translate(opt.pivot.x, opt.pivot.y);
      ctx.rotate(opt.pivot.angle);
      ctx.translate(-mx, -my);
    } else {
      ctx.translate(p.x + dx, p.y - (opt.lift || 0));
    }
    // 液体（裁剪进瓶内路径）
    if (innerPath) {
      ctx.save();
      ctx.scale(BW / 100, BH / 190);
      ctx.clip(innerPath);
      ctx.restore();
      // clip 不跨 restore 保留，改为缩放坐标系内画
      ctx.save();
      ctx.scale(BW / 100, BH / 190);
      ctx.clip(innerPath);
      drawLiquidInLocal(i, opt.units != null ? opt.units : bottles[i].length);
      ctx.restore();
    }
    // 玻璃
    if (IMG.bottle) ctx.drawImage(IMG.bottle, 0, 0, BW, BH);
    // 选中描边
    if (opt.lift > 4 && !opt.pivot) {
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 3;
      roundRect(ctx, 3, 3, BW - 6, BH - 6, BW * 0.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 在已缩放到 100×190 坐标系且已 clip 的上下文里画液体
  function drawLiquidInLocal(i, unitsF) {
    const inner = BOTTLE.inner;
    const unitH = inner.h / cfg.capacity;
    const bottom = inner.y + inner.h;
    let remaining = unitsF;
    for (let k = 0; k < Math.ceil(unitsF + 0.0001) && k < cfg.capacity + 1; k++) {
      const frac = Math.max(0, Math.min(1, remaining));
      if (frac <= 0) break;
      const h = frac * unitH;
      const yTop = bottom - (k + 1) * unitH + (1 - frac) * unitH;
      ctx.fillStyle = liquidColor(bottles[i][k]);
      ctx.fillRect(inner.x - 2, yTop, inner.w + 4, h + 0.5);
      remaining -= 1;
    }
    if (unitsF > 0.01) {
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      for (let k = 1; k < Math.floor(unitsF + 0.001); k++) {
        ctx.fillRect(inner.x - 2, bottom - k * unitH - 0.7, inner.w + 4, 1.4);
      }
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.fillRect(inner.x, bottom - unitsF * unitH, inner.w, Math.max(1.4, 190 * 0.008));
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- 倒水动画 ----------
  function mouthWorld(slotPos) {
    return { x: slotPos.x + BOTTLE.mouth.x * BW / 100, y: slotPos.y + BOTTLE.mouth.y * BH / 190 };
  }

  function startPour(from, to) {
    const n = L.canPour(bottles[from], bottles[to], cfg.capacity);
    if (!n) return Promise.resolve(false);
    pushUndo();
    const srcUnits = bottles[from].length, dstUnits = bottles[to].length;
    const color = bottles[from][bottles[from].length - 1];
    const dir = (slots[to].x + BW / 2) >= (slots[from].x + BW / 2) ? 1 : -1;
    const tm = mouthWorld(slots[to]);
    const pivotFrom = { x: mouthWorld(slots[from]).x, y: mouthWorld(slots[from]).y - selLift };
    const pivotTo = { x: tm.x - dir * BW * 1.02, y: tm.y - BH * 0.56 };
    const angleTo = dir * 1.16;
    pour = {
      from, to, n, color, dir, srcUnits, dstUnits,
      t0: performance.now(),
      flyMs: dur(200), unitMs: dur(170), backMs: dur(220),
      pivotFrom, pivotTo, angleTo,
      lastDroplet: 0,
    };
    sel = -1;
    mode = 'anim';
    AUDIO.play('pour');
    return new Promise(res => { pour.resolve = res; });
  }

  function pourPhase(now) {
    const p = pour;
    const t1 = p.flyMs;
    const t2 = t1 + p.n * p.unitMs;
    const t3 = t2 + p.backMs;
    const t = now - p.t0;
    if (t < t1) {
      const k = ease(t / Math.max(1, t1));
      return {
        phase: 'fly', k,
        pivot: { x: p.pivotFrom.x + (p.pivotTo.x - p.pivotFrom.x) * k, y: p.pivotFrom.y + (p.pivotTo.y - p.pivotFrom.y) * k, angle: p.angleTo * k },
        srcF: p.srcUnits, dstF: p.dstUnits,
      };
    }
    if (t < t2) {
      const k = (t - t1) / Math.max(1, p.n * p.unitMs);
      return {
        phase: 'pour', k,
        pivot: { x: p.pivotTo.x, y: p.pivotTo.y, angle: p.angleTo },
        srcF: p.srcUnits - p.n * k, dstF: p.dstUnits + p.n * k,
      };
    }
    if (t < t3) {
      const k = ease((t - t2) / Math.max(1, p.backMs));
      const home = mouthWorld(slots[p.from]);
      return {
        phase: 'back', k,
        pivot: { x: p.pivotTo.x + (home.x - p.pivotTo.x) * k, y: p.pivotTo.y + (home.y - p.pivotTo.y) * k, angle: p.angleTo * (1 - k) },
        srcF: p.srcUnits - p.n, dstF: p.dstUnits + p.n,
      };
    }
    return { phase: 'done' };
  }

  function drawPouring(now) {
    const ph = pourPhase(now);
    if (ph.phase === 'done') { finishPour(); return; }
    // 目标瓶（正常位）
    drawBottle(pour.to, now, { units: ph.dstF });
    // 源瓶（变换位）
    drawBottle(pour.from, now, { pivot: ph.pivot, units: ph.srcF });
    // 液流
    if (ph.phase === 'pour' && ph.pivot.angle * pour.dir > 0.45) {
      const inner = BOTTLE.inner;
      const surfY = slots[pour.to].y + (inner.y + inner.h - ph.dstF * (inner.h / cfg.capacity)) * BH / 190;
      const endX = slots[pour.to].x + (inner.x + inner.w / 2) * BW / 100;
      const mx = ph.pivot.x, my = ph.pivot.y;
      const wStream = Math.max(5, Math.min(8, BW * 0.13));
      ctx.strokeStyle = liquidColor(pour.color);
      ctx.lineWidth = wStream;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx + pour.dir * 2, my + 2);
      ctx.quadraticCurveTo(mx + pour.dir * 10, my + (surfY - my) * 0.35, endX, surfY - 2);
      ctx.stroke();
      // 落点液面扰动
      ctx.fillStyle = liquidColor(pour.color);
      ctx.globalAlpha = .9;
      ctx.beginPath();
      ctx.ellipse(endX, surfY - 1, wStream * 1.4, wStream * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (now - pour.lastDroplet > 110) {
        pour.lastDroplet = now;
        FX.droplets(endX, surfY, liquidColor(pour.color), 2);
      }
    }
  }

  function finishPour() {
    const p = pour; pour = null;
    const r = L.applyPour(bottles, p.from, p.to, cfg.capacity);
    bottles = r.bottles;
    moves++; st.stats.movesTotal++;
    const doneColors = L.completedColors(bottles, cfg.capacity);
    const justDone = L.isComplete(bottles[p.to], cfg.capacity);
    hideBubble();
    if (justDone) {
      const tp = slots[p.to];
      FX.sparkle(tp.x + BW / 2, tp.y + 6, liquidColor(bottles[p.to][0]));
      AUDIO.play('colorDone'); AUDIO.play('pig');
      cheerUntil = performance.now() + 950;
    }
    updateHUD();
    if (L.isWin(bottles, cfg.capacity)) {
      mode = 'win';
      winSequence();
    } else {
      mode = 'playing';
    }
    if (p.resolve) p.resolve(true);
  }

  // ---------- 胜利 ----------
  function winSequence() {
    finishedLv = curLv;
    st.stats.clears++;
    const prevBest = st.best[finishedLv];
    if (!prevBest || moves < prevBest) st.best[finishedLv] = moves;
    st.lv = Math.max(st.lv, finishedLv + 1);
    saveState();
    AUDIO.play('win');
    AUDIO.duck(1400);
    cheerUntil = performance.now() + 1600;
    FX.confetti(W, H);
    updateHUD();
    setTimeout(() => {
      if (mode !== 'win') return;
      showWin();
    }, dur(700));
  }

  function showWin() {
    winShownAt = performance.now();
    const starsN = moves <= par ? 3 : (moves <= Math.ceil(par * 1.6) ? 2 : 1);
    el.winStars.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const im = document.createElement('img');
      im.src = IMG['icon_star'] ? IMG['icon_star'].src : '';
      if (i >= starsN) im.className = 'dim';
      el.winStars.appendChild(im);
    }
    const best = st.best[finishedLv];
    el.winSub.textContent = '第 ' + finishedLv + ' 关 · 用了 ' + moves + ' 步' + (best ? ' · 最佳 ' + best + ' 步' : '');
    el.winNext.textContent = '下一关 · 第 ' + (finishedLv + 1) + ' 关';
    el.winPanel.classList.remove('hidden');
  }

  // ---------- 关卡流程 ----------
  function startLevel(n) {
    if (demoTimer) { clearInterval(demoTimer); demoTimer = 0; } // demoWanted 保留，关底自续
    curLv = n;
    lvData = L.genLevel(n, cfg);
    bottles = lvData.bottles.map(b => b.slice());
    cfg.capacity = lvData.cap;
    par = (L.solve(bottles, cfg.capacity) || []).length || 20;
    sel = -1; moves = 0; addedUsed = 0; undoStack = []; pour = null;
    mode = 'playing';
    layoutBottles();
    el.levelPill.textContent = '第 ' + n + ' 关';
    updateHUD();
    saveState();
    el.bubble.classList.toggle('hide', !(st.stats.clears === 0 && n <= 2));
    if (demoWanted) startDemo();
  }

  function updateHUD() {
    const done = L.completedColors(bottles, cfg.capacity);
    const pct = lvData ? Math.round(done / lvData.K * 100) : 0;
    el.pctPill.textContent = pct + '%';
    el.undoBtn.disabled = undoStack.length === 0;
    el.addBtn.disabled = addedUsed >= (cfg.addBottle || 0);
    el.addBtn.querySelector('.bdg').textContent = Math.max(0, (cfg.addBottle || 0) - addedUsed);
    el.hintBtn.style.display = cfg.hintOn ? '' : 'none';
  }

  function hideBubble() { el.bubble.classList.add('hide'); }

  // ---------- 输入 ----------
  function bottleAt(x, y) {
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      if (x >= p.x - 6 && x <= p.x + BW + 6 && y >= p.y - 10 && y <= p.y + BH + 8) return i;
    }
    return -1;
  }

  el.canvas.addEventListener('pointerdown', e => {
    AUDIO.unlock();
    if (busy() || mode !== 'playing') return;
    const rect = el.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const i = bottleAt(x, y);
    if (i < 0) { if (sel >= 0) { sel = -1; } return; }
    if (sel === -1) {
      if (!bottles[i].length) return deny(i);
      sel = i;
      AUDIO.play('pick');
    } else if (sel === i) {
      sel = -1;
    } else {
      const from = sel; sel = -1;
      startPour(from, i);
    }
  });

  function deny(i) {
    anims[i] = anims[i] || {};
    anims[i].deny = 320;
    AUDIO.play('deny');
  }
  setInterval(() => { for (const k in anims) if (anims[k].deny > 0) anims[k].deny -= 40; }, 40);

  // sel 抬起量缓动
  setInterval(() => {
    const target = sel >= 0 ? 16 : 0;
    selLift += (target - selLift) * 0.35;
  }, 40);

  // ---------- 工具条 ----------
  function pushUndo() {
    undoStack.push({ bottles: bottles.map(b => b.slice()), moves, addedUsed });
    if (undoStack.length > 200) undoStack.shift();
  }
  function undo() {
    if (!undoStack.length || busy() || mode !== 'playing') return;
    const u = undoStack.pop();
    bottles = u.bottles; moves = u.moves; addedUsed = u.addedUsed;
    sel = -1;
    layoutBottles();
    updateHUD();
    AUDIO.play('click');
  }
  el.undoBtn.addEventListener('click', undo);
  el.restartBtn.addEventListener('click', () => {
    if (busy()) return;
    AUDIO.play('click');
    startLevel(curLv);
  });
  el.hintBtn.addEventListener('click', () => {
    if (busy() || mode !== 'playing') return;
    const m = L.hintMove(bottles, cfg.capacity);
    if (!m) { toast('卡住啦，试试撤销或加瓶'); return; }
    AUDIO.play('click');
    startPour(m.from, m.to);
  });
  el.addBtn.addEventListener('click', () => {
    if (busy() || mode !== 'playing') return;
    if (addedUsed >= (cfg.addBottle || 0)) return;
    pushUndo();
    addedUsed++;
    bottles.push([]);
    addedIds++;
    sel = -1;
    layoutBottles();
    updateHUD();
    AUDIO.play('click');
    toast('加了一个空瓶');
  });

  // ---------- 暂停菜单 ----------
  el.pauseBtn.addEventListener('click', () => {
    AUDIO.unlock(); AUDIO.play('click');
    el.pauseSub.textContent = '第 ' + curLv + ' 关';
    el.pauseMenu.classList.remove('hidden');
  });
  el.pmResume.addEventListener('click', () => { AUDIO.play('click'); el.pauseMenu.classList.add('hidden'); });
  el.pmRestart.addEventListener('click', () => { AUDIO.play('click'); el.pauseMenu.classList.add('hidden'); startLevel(curLv); });
  el.pmSkip.addEventListener('click', () => {
    AUDIO.play('click');
    el.pauseMenu.classList.add('hidden');
    st.lv = Math.max(st.lv, curLv + 1); saveState();
    startLevel(st.lv);
    toast('已跳到第 ' + st.lv + ' 关');
  });
  el.pmSettings.addEventListener('click', () => { AUDIO.play('click'); PANEL.open(); });
  el.pmHome.addEventListener('click', () => {
    AUDIO.play('click');
    el.pauseMenu.classList.add('hidden');
    goSplash();
  });

  el.winNext.addEventListener('click', () => {
    AUDIO.play('click');
    el.winPanel.classList.add('hidden');
    startLevel(st.lv);
  });
  el.winReplay.addEventListener('click', () => {
    AUDIO.play('click');
    el.winPanel.classList.add('hidden');
    startLevel(finishedLv || st.lv);
  });

  function goSplash() {
    mode = 'splash';
    stopDemo();
    el.splash.classList.remove('hide');
    el.splash.classList.add('ready');
    el.splashStart.textContent = st.lv > 1 ? '继续 · 第 ' + st.lv + ' 关' : '开始游戏';
  }

  // ---------- toast ----------
  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1800);
  }

  // ---------- AI 演示 ----------
  let demoWanted = false;      // demo 意图跨关卡存活：startLevel 里的 stopDemo 后由它自续
  function stopDemo() { demoWanted = false; if (demoTimer) { clearInterval(demoTimer); demoTimer = 0; } }
  function startDemo() {
    stopDemo();
    demoWanted = true;
    demoTimer = setInterval(() => {
      if (PANEL.isOpen() || !el.pauseMenu.classList.contains('hidden')) return;
      if (mode === 'playing') {
        const m = L.hintMove(bottles, cfg.capacity);
        if (m) startPour(m.from, m.to);
        else if (undoStack.length) undo();
        else startLevel(st.lv);
      } else if (mode === 'win' && !el.winPanel.classList.contains('hidden')) {
        if (performance.now() - winShownAt > 1500) el.winNext.click();
      }
    }, 460);
  }

  // ---------- 持久化 ----------
  function saveState() { saveJSON(L.LS_ST, st); }
  function saveCfg() { saveJSON(L.LS_CFG, cfg); }

  // ---------- 配置面板 ----------
  PANEL.mount({
    root: $('panelHost'),
    get: () => cfg,
    onChange: (next) => {
      const prev = cfg;
      cfg = deepMerge(L.DEFAULT_CFG, next);
      if (cfg.bgmVol !== prev.bgmVol) AUDIO.setBGMVolume(cfg.bgmVol);
      if (cfg.sfxVol !== prev.sfxVol) AUDIO.setSFXVolume(cfg.sfxVol);
      if (cfg.room !== prev.room || cfg.liquidSet !== prev.liquidSet) {
        ART.setRoom(cfg.room);
        reloadArt().then(() => { buildBG(); });
      }
      saveCfg();
      updateHUD();
    },
    stats: () => ({ lv: st.lv, clears: st.stats.clears, moves: st.stats.movesTotal }),
    onClearProgress: () => {
      st.lv = 1; st.stats = { clears: 0, movesTotal: 0 }; st.best = {};
      saveState();
      el.pauseMenu.classList.add('hidden');
      el.winPanel.classList.add('hidden');
      startLevel(1);
      toast('进度已清空');
    },
    audioNames: AUDIO.names || [],
    onAudioOverride: (map) => { AUDIO.applyOverrides(map); cfg.audioOverrides = map; saveCfg(); },
  });

  async function reloadArt() {
    await loadImg('bg', ART.bg());
    pigImgs = await Promise.all(PIG_ACCENTS.map(a => loadImg('pig' + PIG_ACCENTS.indexOf(a), ART.pig(a, 'idle')) && IMG['pig' + PIG_ACCENTS.indexOf(a)]));
    pigCheer = await Promise.all(PIG_ACCENTS.map((a, i) => loadImg('pigCheer' + i, ART.pig(a, 'cheer'))));
    await loadImg('bottle', BOTTLE.img);
  }

  // ---------- 启动 ----------
  async function boot() {
    // 画布尺寸先就位
    layout();
    window.addEventListener('resize', () => { layout(); });
    window.addEventListener('orientationchange', () => setTimeout(layout, 250));

    // 资源（有 ART.ready 就等它，保证 SVG 已解码）
    try { if (ART.ready) await Promise.race([ART.ready, new Promise(r => setTimeout(r, 3000))]); } catch (e) {}
    BOTTLE = ART.bottle();
    try { innerPath = new Path2D(BOTTLE.innerD); } catch (e) {}
    await loadImg('bg', ART.bg());
    await loadImg('logo', ART.logo());
    await loadImg('scooter', ART.scooterPig());
    await Promise.all(PIG_ACCENTS.map((a, i) => loadImg('pig' + i, ART.pig(a, 'idle'))));
    await Promise.all(PIG_ACCENTS.map((a, i) => loadImg('pigCheer' + i, ART.pig(a, 'cheer'))));
    await loadImg('bottle', BOTTLE.img);
    for (const name of ['pause', 'play', 'gear', 'undo', 'refresh', 'plus', 'bulb', 'sound', 'soundOff', 'close', 'star']) {
      await loadImg('icon_' + name, ART.icon(name));
    }
    await loadImg('bubblePig', ART.pig(PIG_ACCENTS[2], 'cheer'));
    // 图标落位
    el.pauseBtn.firstElementChild.src = IMG.icon_pause ? IMG.icon_pause.src : '';
    el.undoBtn.firstElementChild.src = IMG.icon_undo ? IMG.icon_undo.src : '';
    el.hintBtn.firstElementChild.src = IMG.icon_bulb ? IMG.icon_bulb.src : '';
    el.addBtn.firstElementChild.src = IMG.icon_plus ? IMG.icon_plus.src : '';
    el.restartBtn.firstElementChild.src = IMG.icon_refresh ? IMG.icon_refresh.src : '';
    el.bubbleFace.firstElementChild.src = IMG.bubblePig ? IMG.bubblePig.src : '';
    el.splashLogo.src = IMG.logo ? IMG.logo.src : '';
    el.splashPig.src = IMG.scooter ? IMG.scooter.src : '';
    // 房间/音量
    ART.setRoom(cfg.room);
    await loadImg('bg', ART.bg());
    buildBG();
    AUDIO.setBGMVolume(cfg.bgmVol); AUDIO.setSFXVolume(cfg.sfxVol);
    if (MUTED) AUDIO.setMasterVolume(0);
    if (cfg.audioOverrides) AUDIO.applyOverrides(cfg.audioOverrides);

    layout(); // 背景映射重算（图片就位后）

    // 启动页流程
    requestAnimationFrame(tick);
    setTimeout(() => { el.splashFill.style.width = '100%'; }, 120);
    const readyIn = SNAP ? 50 : 1350;
    setTimeout(() => {
      el.splash.classList.add('ready');
      el.splashStart.textContent = st.lv > 1 ? '继续 · 第 ' + st.lv + ' 关' : '开始游戏';
    }, readyIn);

    el.splashStart.addEventListener('click', enterGame);
    if (DEMO) setTimeout(enterGame, 500);
  }

  let entered = false;
  function enterGame() {
    if (entered) return;
    entered = true;
    AUDIO.unlock();
    if (!MUTED) AUDIO.play('start');
    AUDIO.startLoop && AUDIO.startLoop('bgm');
    el.splash.classList.add('hide');
    startLevel(st.lv);
    if (DEMO) startDemo();
  }

  // ---------- 测试钩子 ----------
  window.__ws = {
    get st() { return st; },
    get cfg() { return cfg; },
    get busy() { return busy() || mode === 'anim'; },
    get mode() { return mode; },
    level: () => curLv,
    state: () => bottles.map(b => b.slice()),
    slots: () => slots.map(s => ({ x: s.x, y: s.y, w: BW, h: BH })),
    par: () => par,
    solve: () => L.solve(bottles, cfg.capacity),
    apply: (from, to) => startPour(from, to),
    startLevel: n => startLevel(n),
    enterGame,
    startDemo, stopDemo,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {};
})();
