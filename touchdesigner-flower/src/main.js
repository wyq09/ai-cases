/* Flower · 启动与主循环：构建场景 → 自适应画质 → RAF → 测试钩子 window.__TF */
(function () {
  'use strict';
  var TF = window.TF;
  var errs = [];
  var hook = (window.__TF = { version: '1.0.0', ready: false, errs: errs, params: null, built: false });
  window.addEventListener('error', function (e) {
    errs.push(String((e && e.message) || e) + ' @' + (e && e.lineno || '?'));
    hook.lastError = errs[errs.length - 1];
  });
  window.addEventListener('unhandledrejection', function (e) {
    errs.push('REJ ' + String(e && e.reason && e.reason.message || e && e.reason || e));
  });

  function parseQuery() {
    var q = {};
    String(location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('='), k = decodeURIComponent(p[0]);
      q[k] = p[1] === undefined ? '1' : decodeURIComponent(p[1]);
    });
    return q;
  }

  var Q = parseQuery();
  var canvas = document.getElementById('stage');
  var L = TF.layout, F = TF.FRAME;
  var layoutProblems = L.validate();
  if (layoutProblems.length) errs.push('layout: ' + layoutProblems.join('; '));

  var renderer;
  try {
    renderer = TF.createRenderer(canvas, { preserveDrawingBuffer: true });
  } catch (e) {
    errs.push('renderer: ' + (e && e.message || e));
  }
  if (!renderer) {
    hook.webgl = false;
    var fb = document.getElementById('fallback');
    if (fb) fb.hidden = false;
    var veil = document.getElementById('veil');
    if (veil) veil.className = 'veil is-out';
    hook.ready = true;
    return;
  }
  hook.webgl = true;

  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var isTouch = (navigator.maxTouchPoints || 0) > 0 && window.innerWidth < 1100;
  var seed = Q.seed ? (parseInt(Q.seed, 10) >>> 0) : 7;

  /* 可调参数（参考图基准值，可被 URL 覆盖） */
  var params = {};
  Object.keys(L.params).forEach(function (k) { params[k] = L.params[k]; });
  var EXTRA = { haze: 0.15, lines: 1.0 };
  Object.keys(EXTRA).forEach(function (k) { params[k] = EXTRA[k]; });
  Object.keys(params).forEach(function (k) {
    if (Q[k] !== undefined && isFinite(+Q[k])) params[k] = +Q[k];
  });
  hook.params = params;

  var QUAL = L.quality;
  var state = {
    time: Q.t !== undefined ? Math.max(0, +Q.t || 0) : 0,
    fixedT: Q.t !== undefined ? Math.max(0, +Q.t || 0) : null,
    paused: Q.pause !== undefined || Q.still !== undefined,
    still: Q.still !== undefined,
    stopped: false,
    quality: (Q.q && QUAL[Q.q]) ? Q.q : (isTouch ? 'mid' : 'high'),
    frac: 1, scale: 1, dpr: 1, speed: params.speed * (reduced ? 0.25 : 1),
    frames: 0, fps: 0, frameMs: 0, ema: 16, draws: 0
  };
  state.frac = QUAL[state.quality].frac;

  var camera = TF.createCamera();
  var core = null, margins = null;
  var cssW = 1, cssH = 1, viewRect = null, lastMarginsKey = '';
  var raf = 0, lastNow = 0, ema = 16, adaptCounter = 0;

  function setParam(k, v) {
    if (!(k in params) || !isFinite(+v)) return false;
    params[k] = +v;
    if (k === 'speed') state.speed = +v * (reduced ? 0.25 : 1);
    return true;
  }

  function rebuildMargins(force) {
    // 画幅外内容：可见范围（按 160 参考像素取整）变化才重建；5:7 视口下什么都不生成
    var key = [Math.round(viewRect.x0 / 160), Math.round(viewRect.x1 / 160), Math.round(viewRect.y0 / 160), Math.round(viewRect.y1 / 160)].join(',');
    if (!force && key === lastMarginsKey) return false;
    lastMarginsKey = key;
    var t0 = performance.now();
    margins = TF.gen.buildMargins(L, viewRect, { seed: seed });
    if (margins.total) renderer.setPoints(1, margins, 'margins');
    renderer.setMarginQuads(margins.haze);
    hook.marginMs = Math.round(performance.now() - t0);
    return true;
  }

  function build() {
    var t0 = performance.now();
    viewRect = L.fit(cssW, cssH);
    core = TF.gen.buildCore(L, viewRect, { seed: seed });
    var problems = TF.gen.validate(core);
    if (problems.length) errs.push('gen: ' + problems.join('; '));
    renderer.setPoints(0, core, 'core');
    renderer.setExtras(core);
    lastMarginsKey = '';
    rebuildMargins(true);
    hook.buildMs = Math.round(performance.now() - t0);
    hook.built = true;
  }

  function applySize() {
    var q = QUAL[state.quality];
    state.dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    state.scale = Math.min(state.scale, q.maxScale);
    cssW = Math.max(1, canvas.clientWidth || window.innerWidth);
    cssH = Math.max(1, canvas.clientHeight || window.innerHeight);
    camera.aspect = cssW / cssH;
    if (viewRect) viewRect = L.fit(cssW, cssH);
    renderer.setSize(Math.round(cssW * state.dpr * state.scale), Math.round(cssH * state.dpr * state.scale));
  }

  function render(dt) {
    var S = viewRect.scale;
    renderer.frame({
      time: state.time, dt: dt, vp: camera.vp, camPos: camera.pos, cssW: cssW, pxPerRef: S,
      frac: state.frac, focus: camera.st.focus, dof: 1.3 * params.dof * S,
      trail: params.trail, bloomRadius: params.bloomRadius, exposure: params.exposure, bloom: params.bloom,
      grain: params.grain, vignette: params.vignette, lift: params.lift, aberration: params.aberration,
      haze: params.haze, lineB: params.lines, lineW: 1
    });
    state.draws = renderer.drawn;
  }

  function setQuality(name) {
    if (!QUAL[name]) return false;
    state.quality = name;
    state.frac = QUAL[name].frac;
    state.scale = Math.min(state.scale, QUAL[name].maxScale);
    applySize();
    renderer.clearTrails();
    return true;
  }

  /* 自适应：帧耗时 EMA 超阈值先降内部倍率，仍慢再降粒子档；富余时回升 */
  function adapt(dt) {
    ema = ema * 0.94 + dt * 1000 * 0.06;
    state.ema = ema;
    if (++adaptCounter < 45) return;
    adaptCounter = 0;
    var q = QUAL[state.quality];
    if (ema > 27 && state.scale > 0.52) {
      state.scale = Math.max(0.5, state.scale - 0.12);
      applySize();
    } else if (ema > 42 && state.frac > 0.35) {
      state.frac = Math.max(0.34, state.frac * 0.7);
      renderer.clearTrails();
    } else if (ema < 12.5 && state.scale < q.maxScale) {
      state.scale = Math.min(q.maxScale, state.scale + 0.08);
      applySize();
    }
  }

  function frame(now) {
    raf = 0;
    var dt = state.fixedT !== null || state.still ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    if (!lastNow) dt = 1 / 60;
    lastNow = now;
    if (!state.paused && state.fixedT === null) state.time += dt * state.speed;
    camera.update(dt);
    render(dt);
    state.frames++;
    state.frameMs = dt * 1000;
    if (dt > 0.002 && state.fixedT === null && !document.hidden) adapt(dt);
    if (state.frames === 1) {
      hook.ready = true;
      document.documentElement.className += ' is-ready';
    }
    if (!state.stopped) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || state.stopped) return;
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* 固定时间渲染 n 帧（拖尾收敛），供截图与回归使用 */
  function step(n) {
    n = n || 1;
    var was = state.paused;
    state.paused = true;
    for (var i = 0; i < n; i++) {
      camera.update(1 / 60);
      render(1 / 60);
      state.frames++;
    }
    state.paused = was;
    if (state.frames >= 1) { hook.ready = true; document.documentElement.className += ' is-ready'; }
  }

  /* ---------- 事件 ---------- */
  var pointers = new Map(), lastPinch = 0, lastPt = null, lastPtT = 0;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      lastPt = { x: e.clientX, y: e.clientY }; lastPtT = performance.now();
      camera.startDrag();
      canvas.className = 'is-dragging';
    } else if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
    TF.ui && TF.ui.noteInteraction && TF.ui.noteInteraction();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (pointers.has(e.pointerId)) {
      var prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        var now = performance.now();
        camera.drag(e.clientX - prev.x, e.clientY - prev.y, (now - lastPtT) / 1000);
        lastPtT = now;
      } else if (pointers.size === 2) {
        var p = Array.from(pointers.values()), d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (lastPinch > 0) camera.pinch(d / lastPinch);
        lastPinch = d;
      }
    } else if (e.pointerType === 'mouse') {
      camera.pointer((e.clientX / cssW) * 2 - 1, 1 - (e.clientY / cssH) * 2);
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { camera.endDrag(); canvas.className = ''; }
    else if (pointers.size === 1) {
      var p = Array.from(pointers.values())[0];
      pointers.set(Array.from(pointers.keys())[0], p);
      lastPinch = 0;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    camera.wheel(e.deltaY);
    TF.ui && TF.ui.noteInteraction && TF.ui.noteInteraction();
  }, { passive: false });
  canvas.addEventListener('dblclick', function () { camera.reset(); });
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    stop();
    errs.push('webgl context lost');
  });

  var resizeTimer = 0;
  function onResize() {
    applySize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { rebuildMargins(false); }, 260);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!state.stopped) start();
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    var k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); togglePause(); }
    else if (k === 'r' || k === 'R') resetView();
    else if (k === 's' || k === 'S') savePng();
    else if (k === 'h' || k === 'H') toggleUi();
  });

  function togglePause() {
    if (state.fixedT !== null) return false;
    state.paused = !state.paused;
    if (!state.paused) lastNow = 0;
    TF.ui && TF.ui.sync && TF.ui.sync();
    return state.paused;
  }
  function resetView() { camera.reset(); TF.ui && TF.ui.sync && TF.ui.sync(); }
  function toggleUi() {
    var hidden = document.documentElement.classList.toggle('ui-hidden');
    TF.ui && TF.ui.sync && TF.ui.sync();
    return hidden;
  }
  function savePng() {
    render(1 / 60);
    var a = document.createElement('a');
    a.download = 'flower-' + Math.round(state.time * 10) / 10 + 's.png';
    a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return a.href.length;
  }

  /* ---------- 测试钩子 ---------- */
  hook.state = function () {
    var s = renderer.stats();
    return {
      time: Math.round(state.time * 1000) / 1000, paused: state.paused, still: state.still, stopped: state.stopped,
      quality: state.quality, frac: state.frac, scale: Math.round(state.scale * 1000) / 1000, dpr: state.dpr,
      width: s.w, height: s.h, cssW: cssW, cssH: cssH, frames: state.frames,
      fps: Math.round(1000 / Math.max(ema, 0.01)), frameMs: Math.round(ema * 10) / 10,
      particles: s.particles, drawn: state.draws, objects: s.objects, hdr: s.hdr, levels: s.levels,
      buildMs: hook.buildMs, marginMs: hook.marginMs,
      camera: { yaw: +camera.st.yaw.toFixed(4), pitch: +camera.st.pitch.toFixed(4), zoom: +camera.st.zoom.toFixed(4), dragging: camera.st.dragging },
      view: viewRect ? { scale: +viewRect.scale.toFixed(4), x0: Math.round(viewRect.x0), x1: Math.round(viewRect.x1), y0: Math.round(viewRect.y0), y1: Math.round(viewRect.y1) } : null,
      layout: core ? core.flowers.map(function (f) { return { id: f.id, count: f.count, petals: f.petals.length }; }) : [],
      params: Object.assign({}, params),
      errs: errs.slice()
    };
  };
  hook.pause = function () { if (!state.paused) togglePause(); return state.paused; };
  hook.resume = function () { if (state.paused && state.fixedT === null) togglePause(); return state.paused; };
  hook.setTime = function (t) { state.time = Math.max(0, +t || 0); state.fixedT = Math.max(0, +t || 0); state.paused = true; step(1); return state.time; };
  hook.setLive = function () { state.fixedT = null; state.paused = false; state.still = false; lastNow = 0; return true; };
  hook.step = step;
  hook.stop = function () { state.stopped = true; stop(); return true; };
  hook.start = function () { state.stopped = false; start(); return true; };
  hook.resetView = resetView;
  hook.toggleUi = toggleUi;
  hook.savePng = savePng;
  hook.snapshot = function () { render(1 / 60); return canvas.toDataURL('image/png'); };
  hook.setQuality = setQuality;
  hook.setParam = setParam;
  hook.camera = camera;
  hook.renderer = renderer;

  /* ---------- 启动 ---------- */
  if (TF.ui) TF.ui.init();
  if (Q.ui === '0') document.documentElement.classList.add('ui-hidden');
  applySize();
  build();
  if (state.still) {
    // 静帧：固定时间渲染 48 帧让拖尾收敛，然后停住
    step(48);
    hook.ready = true;
    state.stopped = true;
  } else {
    start();
  }
})();
