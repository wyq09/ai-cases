/* 多福巨奖 777 — 滚轮动画引擎：DOM 回收格 + rAF 虚拟滚动 + 落轮回弹 */
window.DF = window.DF || {};
DF.REELS = (function () {
  'use strict';

  var CELL_N = 7;               // 每轮格数：1 上过冲 + 3 可见 + 3 下余量
  var reelEls = [], stripEls = [], cellEls = [], imgEls = [];
  var H = 100;                  // 单格高 px，layout() 实测
  var resolveSrc = function () { return ''; }; // rawId -> 图片 dataURL
  var raf = 0;
  var reels = [];               // 运行时状态
  var mod = function (a, n) { return ((a % n) + n) % n; };

  function makeReel(c) {
    var reel = document.createElement('div');
    reel.className = 'reel';
    var strip = document.createElement('div');
    strip.className = 'strip';
    var cells = [], imgs = [];
    for (var k = 0; k < CELL_N; k++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      var img = document.createElement('img');
      img.draggable = false;
      cell.appendChild(img);
      strip.appendChild(cell);
      cells.push(cell); imgs.push(img);
    }
    reel.appendChild(strip);
    return { reel: reel, strip: strip, cells: cells, imgs: imgs };
  }

  function mount(container, cfg) {
    container.innerHTML = '';
    reelEls = []; stripEls = []; cellEls = []; imgEls = []; reels = [];
    for (var c = 0; c < 5; c++) {
      var m = makeReel(c);
      container.appendChild(m.reel);
      reelEls.push(m.reel); stripEls.push(m.strip);
      cellEls.push(m.cells); imgEls.push(m.imgs);
      reels.push({ pos: 0, v: 0, phase: 'idle', view: null, S: 0, t0: 0 });
    }
    layout();
    window.addEventListener('resize', layout);
    window.addEventListener('load', layout);
    if (window.ResizeObserver) new ResizeObserver(layout).observe(container);
    // 字体/图片就绪后再量一次，并连测两帧防止布局抖动
    requestAnimationFrame(function () { requestAnimationFrame(layout); });
    setTimeout(layout, 300);
    setTimeout(layout, 900);
  }

  function layout() {
    for (var c = 0; c < 5; c++) {
      var h = reelEls[c].clientHeight;
      if (h > 0) H = h / 3;
      var w = reelEls[c].clientWidth;
      for (var k = 0; k < CELL_N; k++) {
        cellEls[c][k].style.height = H + 'px';
      }
      stripEls[c].style.height = (H * CELL_N) + 'px';
      reelEls[c].style.setProperty('--cw', w + 'px');
      reelEls[c].style.setProperty('--rowH', H + 'px');
    }
    renderAll();
  }

  // 视图数组：label 与滚动都用它
  function setViews(views, stops) {
    for (var c = 0; c < 5; c++) {
      reels[c].view = views[c];
      reels[c].pos = stops ? stops[c] : Math.floor(Math.random() * views[c].length);
      reels[c].phase = 'idle';
      reelEls[c].classList.remove('blur');
    }
    renderAll();
  }

  function renderAll() {
    for (var c = 0; c < 5; c++) renderReel(c);
  }

  function renderReel(c) {
    var r = reels[c];
    if (!r.view) return;
    var base = Math.floor(r.pos), f = r.pos - base;
    stripEls[c].style.transform = 'translate3d(0,' + (-(1 + f) * H).toFixed(2) + 'px,0)';
    var len = r.view.length;
    for (var k = 0; k < CELL_N; k++) {
      var raw = r.view[mod(base + k - 1, len)];
      var img = imgEls[c][k];
      var gold = raw.charAt(0) === 'g';
      var src = resolveSrc(raw);
      if (img.dataset.raw !== raw || img.dataset.src !== src) {
        img.src = src; img.dataset.raw = raw; img.dataset.src = src;
      }
      cellEls[c][k].classList.toggle('gold', gold && src === img.dataset.src);
    }
  }

  /* ---------- 旋转 ---------- */
  // spinTo(stops, views, opts) -> Promise(allSettled)
  // opts: {turbo, startDelay, stagger, onReelStop(c), forceStopSignal:{stop:false}}
  function spinTo(stops, views, opts) {
    opts = opts || {};
    var turbo = !!opts.turbo;
    var VMAX = turbo ? 52 : 26;              // 格/秒
    var ACC = turbo ? 0.09 : 0.13;           // 加速段秒
    var STAG = turbo ? 55 : 170;             // 逐轮停间隔 ms
    var BASE = turbo ? 260 : 620;            // 首轮最短旋转 ms
    var OVERSHOOT = turbo ? 0.35 : 0.6;      // 过冲格数
    var startAt = performance.now() + (opts.startDelay || 0);
    var promises = [];
    var now0 = performance.now();

    for (var c = 0; c < 5; c++) {
      (function (c) {
        var r = reels[c];
        r.view = views[c];
        r.S = mod(stops[c], views[c].length);
        // 总行程：至少两圈 + 逐轮递增，保证节奏
        var extra = (turbo ? 1 : 2) * views[c].length + c * 3 + 6;
        r.pos = r.S + extra;
        r.phase = 'wait';
        r.v = 0;
        r.t0 = startAt + (opts.startDelay ? 0 : 0);
        r.stopAt = startAt + BASE + c * STAG;
        r.decelDur = turbo ? 240 : 480;
        r.overshoot = OVERSHOOT;
        reelEls[c].classList.add('blur');
        promises.push(new Promise(function (res) { r.resolve = res; }));
      })(c);
    }

    var tPrev = performance.now();
    var iv = 0;
    function frame(t) {
      try {
      var dt = Math.min(0.25, (t - tPrev) / 1000);
      tPrev = t;
      var allDone = true;
      for (var c = 0; c < 5; c++) {
        var r = reels[c];
        if (r.phase === 'done') continue;
        allDone = false;
        if (dt <= 0) continue;
        if (r.phase === 'wait') {
          if (t >= r.t0) { r.phase = 'acc'; r.tp = t; }
          continue;
        }
        if (r.phase === 'acc') {
          var k = Math.min(1, (t - r.tp) / (ACC * 1000));
          r.v = VMAX * (k * k);
          r.pos -= r.v * dt;
          if (k >= 1) { r.phase = 'cruise'; }
        } else if (r.phase === 'cruise') {
          var slam = opts.forceStopSignal && opts.forceStopSignal.stop && t > now0 + 350;
          if (t >= r.stopAt || slam) {
            r.phase = 'decel';
            r.tp = t;
            // 减速目标：落点 + 过冲（沿运动方向再往前）
            var target = r.S - r.overshoot;      // pos 减小方向，过冲 = 更小
            // 保证减速距离 ≥ 当前速度 * 一点半径
            var minDist = r.v * (r.decelDur / 1000) * 0.5;
            while (r.pos - target < minDist) target -= r.view.length;
            r.from = r.pos;
            r.to = target;
          } else {
            r.pos -= r.v * dt;
          }
        }
        if (r.phase === 'decel') {
          var k2 = Math.min(1, (t - r.tp) / r.decelDur);
          var e = 1 - Math.pow(1 - k2, 3);       // easeOutCubic
          r.pos = r.from + (r.to - r.from) * e;
          if (k2 >= 1) {
            r.phase = 'bounce';
            r.tp = t;
            r.from = r.to;
            r.to = r.S;
          }
        } else if (r.phase === 'bounce') {
          var k3 = Math.min(1, (t - r.tp) / 200);
          var eb = Math.sin(k3 * Math.PI / 2);   // easeOutSine 回弹
          r.pos = r.from + (r.to - r.from) * eb;
          if (k3 >= 1) {
            r.pos = r.S;
            r.phase = 'done';
            reelEls[c].classList.remove('blur');
            renderReel(c);
            if (opts.onReelStop) opts.onReelStop(c);
            if (r.resolve) { r.resolve(); r.resolve = null; }
            continue;
          }
        }
        renderReel(c);
      }
      if (allDone) { clearInterval(iv); return; }
      raf = requestAnimationFrame(frame);
      } catch (e) {
        console.error('reel frame error', e);
        raf = requestAnimationFrame(frame);
      }
    }
    // rAF + 定时器双驱动：页面被遮挡 rAF 节流/暂停时仍能走完（后台降速但不停）
    tPrev = performance.now();
    raf = requestAnimationFrame(frame);
    iv = setInterval(function () { frame(performance.now()); }, 120);
    return Promise.all(promises);
  }

  // 立即停（用户拍停）
  function slamStop() {
    if (!slamStop.signal) slamStop.signal = { stop: false };
    slamStop.signal.stop = true;
  }
  function resetSlam() { slamStop.signal = { stop: false }; }

  /* ---------- 高亮 ---------- */
  function cellAt(c, r) { return cellEls[c][r + 1]; }  // 落定后 f=0，行 r → k=r+1
  function highlight(cells, on) {
    cells.forEach(function (p) {
      var el = cellAt(p.c, p.r);
      if (el) el.classList.toggle('hit', !!on);
    });
  }
  function clearHighlight() {
    for (var c = 0; c < 5; c++) for (var k = 0; k < CELL_N; k++) cellEls[c][k].classList.remove('hit');
  }

  return {
    mount: mount, layout: layout, setViews: setViews,
    spinTo: spinTo, slamStop: slamStop, resetSlam: resetSlam,
    highlight: highlight, clearHighlight: clearHighlight,
    setResolver: function (fn) { resolveSrc = fn; renderAll(); },
    cellAt: cellAt
  };
})();
