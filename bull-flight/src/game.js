/* bull-flight game —— Canvas 引擎：K线世界滚动/物理/碰撞/演出（主线负责）
 * 物理在像素空间做，价格 = yToPrice(bullY)，推回 LOGIC.pushPrice
 */
(function () {
  window.BF = window.BF || {};
  var GAME = { on: false, alive: false };
  var cv, ctx, W, H, dpr;
  var bullImg = [null, null];
  var imgReady = false;
  var worldX = 0;        // 世界已滚动像素
  var spawnedPipes = 0, nextPipeAt = 0, nextBuyAt = 0, nextSellAt = 0;
  var pipes = [], buttons = [], feathers = [], sparks = [];
  var bull = { x: 0, y: 0, vy: 0, tilt: 0, wing: 0, dead: false, deadVy: 0, deadRot: 0 };
  var btnTimer = 0, hintTimer = 0, aiCool = 0;
  var PADV = 8;          // 上下留白比例
  var bullXRatio = 0.30;
  var state = 'idle';    // idle|flying|dying|dead|paused
  var opts = { auto: false, fast: 1, snap: false };
  var lastT = 0, acc = 0, rafId = 0, siId = 0, running = false;
  var hudAcc = 0;
  var finishPending = 0;
  var deathCause = '';

  function cfg(k, d) {
    try { var c = BF.CFG.all(); return c[k] !== undefined ? c[k] : d; } catch (e) { return d; }
  }
  function chartTop() { return H * 0.02; }
  function chartH() { return H - chartTop() * 2; }
  function priceToY(p) { return chartTop() + (110 - p) / 20 * chartH(); }
  function yToPrice(y) { return 110 - (y - chartTop()) / chartH() * 20; }
  function pxPerUnit() { return chartH() / 20; }

  function resetVisuals() {
    worldX = 0; pipes = []; buttons = []; feathers = []; sparks = [];
    spawnedPipes = 0; btnTimer = 0; hintTimer = 0; finishPending = 0; deathCause = '';
    nextPipeAt = 3.2; nextBuyAt = 1.6; nextSellAt = 6;
    bull.x = W * bullXRatio; bull.y = priceToY(100); bull.vy = -240; bull.tilt = 0;
    bull.dead = false; bull.deadRot = 0;
  }
  GAME.start = function () {
    if (!cv) bind();
    resetVisuals();
    GAME.clearHint();
    var s = BF.LOGIC.state(); if (s) s.status = 'flying';
    state = 'flying'; GAME.alive = true; GAME.on = true;
    lastT = 0; running = true;
    try { BF.SFX.play('open'); } catch (e) {}
    loop(performance.now());
  };
  GAME.pause = function () { if (state === 'flying') { state = 'paused'; } };
  GAME.resume = function () { if (state === 'paused') { state = 'flying'; lastT = 0; } };
  GAME.stop = function () { running = false; state = 'idle'; GAME.alive = false; GAME.on = false; };
  GAME.setOpts = function (o) { for (var k in o) opts[k] = o[k]; };
  GAME.tap = function () {
    if (state !== 'flying') return;
    bull.vy = -cfg('jumpV', 330);
    try { BF.SFX.play('tap'); } catch (e) {}
    var f = BF.FX;
    if (f && f.burst) f.burst(bull.x - 14, bull.y + 16, 'wing');
  };

  function bind() {
    cv = document.getElementById('cv');
    if (!cv) return;
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    loadBull();
    siId = setInterval(function () {   // 遮挡窗口 rAF 节流兜底
      if (running && state === 'flying') { var now = performance.now(); if (now - lastT > 200) step(0.05); }
    }, 120);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = cv.getBoundingClientRect();
    W = r.width || window.innerWidth; H = r.height || window.innerHeight * 0.6;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bull.x = W * bullXRatio;
  }
  function loadBull() {
    function toImg(i) {
      return function (d) {
        if (!d) return;
        var im = new Image();
        im.onload = function () { bullImg[i] = im; imgReady = true; };
        im.src = d;
      };
    }
    try {
      var A = BF.ART;
      if (A && A.bullFrame && A.ready) { toImg(0)(A.bullFrame(0)); toImg(1)(A.bullFrame(1)); }
      else {
        var iv = setInterval(function () {
          if (BF.ART && BF.ART.ready) {
            clearInterval(iv);
            toImg(0)(BF.ART.bullFrame(0)); toImg(1)(BF.ART.bullFrame(1));
          }
        }, 150);
      }
      // 配置替换的立绘
      var c = null;
      try { c = BF.CFG.all(); } catch (e) {}
      if (c && c.bullImg) { toImg(0)(c.bullImg); toImg(1)(c.bullImg); }
    } catch (e) {}
  }

  // ---------- 生成 ----------
  function spawnPipe() {
    var gh = chartH() * cfg('pipeGap', 0.15);
    var gy = bull.y + (Math.random() - 0.5) * chartH() * 0.5;
    gy = Math.max(chartTop() + gh / 2 + 10, Math.min(chartTop() + chartH() - gh / 2 - 10, gy));
    pipes.push({ x: W + 60, gy: gy, gh: gh, w: 78, counted: false });
  }
  function spawnButton(kind) {
    var y = bull.y + (Math.random() - 0.5) * chartH() * 0.34;
    y = Math.max(chartTop() + 40, Math.min(chartTop() + chartH() - 60, y));
    // 避开管道实体：若落入管道区（含端帽裕量），吸附到该管道 gap 中心
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      if (p.x < W + 130) {
        var topH = p.gy - p.gh / 2, botY = p.gy + p.gh / 2;
        if (y - 36 < topH || y + 36 > botY) { y = p.gy; }
      }
    }
    y = Math.max(chartTop() + 40, Math.min(chartTop() + chartH() - 60, y));
    buttons.push({ kind: kind, x: W + 50, y: y, base: y, ph: Math.random() * 6.28, r: kind === 'buy' ? 34 : 30 });
  }

  // ---------- 更新 ----------
  function step(dt) {
    var s = BF.LOGIC.state();
    if (!s) return;
    var speed = cfg('scrollSpeed', 130) * opts.fast;
    if (state === 'flying') {
      worldX += speed * dt;
      // 物理
      var g = cfg('gravity', 620);
      bull.vy += g * dt;
      bull.vy += (Math.random() - 0.5) * cfg('noise', 26) * 60 * dt;
      bull.y += bull.vy * dt;
      bull.tilt = Math.max(-0.5, Math.min(0.9, bull.vy / 500));
      bull.wing += dt * (bull.vy < 0 ? 26 : 12);
      // 生成
      var pe = cfg('pipeEvery', [4, 7]);
      if (worldX > nextPipeAt * 56) { spawnPipe(); spawnedPipes++; nextPipeAt = worldX / 56 + pe[0] + Math.random() * (pe[1] - pe[0]); }
      btnTimer += dt;
      var be = cfg('buyEvery', [3, 6]);
      if (btnTimer > nextBuyAt) { spawnButton('buy'); nextBuyAt = be[0] + Math.random() * (be[1] - be[0]); btnTimer = 0; }
      if (s.shares > 0) { hintTimer += dt; if (hintTimer > 7) { spawnButton('sell'); hintTimer = 0; } }
      // AI 自动演示：追踪最近管道 gap 中心
      if (opts.auto) {
        aiCool -= dt;
        var tgt = chartTop() + chartH() * 0.5;
        for (var ai = 0; ai < pipes.length; ai++) {
          var ap = pipes[ai];
          if (ap.x + ap.w > bull.x - 30 && ap.x < bull.x + 460) { tgt = ap.gy; break; }
        }
        if (aiCool <= 0 && bull.y > tgt + 16) { GAME.tap(); aiCool = 0.13; }
      }
      // 实体推进
      var i;
      for (i = pipes.length - 1; i >= 0; i--) { pipes[i].x -= speed * dt; if (pipes[i].x < -120) pipes.splice(i, 1); }
      for (i = buttons.length - 1; i >= 0; i--) {
        var b = buttons[i]; b.x -= speed * dt;
        b.y = b.base + Math.sin(worldX / 90 + b.ph) * 14;
        if (b.x < -60) buttons.splice(i, 1);
      }
      // 碰撞：按钮
      var bx = bull.x, by = bull.y;
      for (i = buttons.length - 1; i >= 0; i--) {
        var bt = buttons[i];
        var dx = bt.x - bx, dy = bt.y - by;
        if (dx * dx + dy * dy < (bt.r + 22) * (bt.r + 22)) {
          if (bt.kind === 'buy') {
            var tr = BF.LOGIC.buy(0.5);
            if (tr) {
              try { BF.SFX.play('buy'); } catch (e) {}
              var f = BF.FX;
              if (f && f.floatText) f.floatText(bt.x, bt.y - 44, '买入 ¥' + fmt0(tr.amount), '#f43f5e');
              if (f && f.burst) f.burst(bt.x, bt.y, 'coin');
              hint('买入 ¥' + fmt0(tr.amount) + ' · 成交价 ' + tr.price.toFixed(2) + ' · 税费 ¥' + tr.fee.toFixed(2));
            }
            buttons.splice(i, 1);
          } else {
            var tr2 = BF.LOGIC.sellAll();
            if (tr2) {
              var win = tr2.pnl >= 0;
              try { BF.SFX.play(win ? 'profit' : 'loss'); } catch (e) {}
              var f2 = BF.FX;
              if (f2 && f2.floatText) f2.floatText(bt.x, bt.y - 44, (win ? '+' : '') + fmt0(tr2.pnl) + ' 元', win ? '#ff5d76' : '#35c08e');
              if (f2 && f2.burst) f2.burst(bt.x, bt.y, win ? 'coin' : 'dust');
              hint('全部卖出 ' + tr2.price.toFixed(2) + ' · 盈亏 ' + (win ? '+' : '') + tr2.pnl.toFixed(2) + ' 元 · 税费 ¥' + tr2.fee.toFixed(2));
            }
            buttons.splice(i, 1);
          }
        }
      }
      // 碰撞：管道 / 触界
      var hit = '';
      if (bull.y < chartTop() + 2) hit = 'limit-up';
      if (bull.y > chartTop() + chartH() - 2) hit = 'limit-down';
      for (i = 0; i < pipes.length; i++) {
        var p = pipes[i];
        if (bx + 20 > p.x && bx - 20 < p.x + p.w) {
          if (by - 14 < p.gy - p.gh / 2 || by + 14 > p.gy + p.gh / 2) { hit = 'crash'; break; }
        }
      }
      if (hit) { die(hit, s); }
      else {
        BF.LOGIC.pushPrice(yToPrice(bull.y), dt * opts.fast);
        if (s.status === 'flying' && (s.price <= 90.02 || s.price >= 109.98)) die(s.price >= 109.98 ? 'limit-up' : 'limit-down', s);
      }
    } else if (state === 'dying') {
      bull.deadVy += 900 * dt; bull.y += bull.deadVy * dt; bull.deadRot += dt * 5;
      bull.tilt = Math.min(1.4, bull.tilt + dt * 2);
      if (bull.y > chartTop() + chartH() - 20) { bull.y = chartTop() + chartH() - 20; }
      finishPending -= dt;
      if (finishPending <= 0) {
        state = 'dead'; GAME.alive = false;
        var rep = BF.LOGIC.finish(deathCause);
        if (rep && BF.UI && BF.UI.showReport) BF.UI.showReport(rep);
      }
    }
    // 粒子
    stepParticles(dt);
    // HUD
    hudAcc += dt;
    if (hudAcc > 0.1 && BF.UI && BF.UI.refreshHUD) { BF.UI.refreshHUD(); hudAcc = 0; }
  }
  function die(cause, s) {
    if (state !== 'flying') return;
    deathCause = cause;
    state = 'dying'; GAME.alive = false;
    bull.deadVy = -160; finishPending = 1.0;
    try { BF.SFX.play('crash'); } catch (e) {}
    var f = BF.FX;
    if (f && f.burst) for (var k = 0; k < 3; k++) f.burst(bull.x, bull.y, 'feather');
    hint(cause === 'crash' ? '撞上挡板！强制平仓结算…' : (cause === 'limit-up' ? '触及涨停！强制平仓结算…' : '触及跌停！强制平仓结算…'));
  }

  // ---------- 渲染 ----------
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    drawCandles();
    drawCostLine();
    drawPipes();
    drawButtons();
    drawBull();
    drawParticles();
    drawDeadVeil();
    drawMini();
  }
  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    var stepY = chartH() / 4, y, i;
    for (i = 0; i <= 4; i++) { y = chartTop() + i * stepY; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (var x = (-(worldX % 72)); x < W; x += 72) { ctx.beginPath(); ctx.moveTo(x, chartTop()); ctx.lineTo(x, chartTop() + chartH()); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '11px -apple-system,system-ui';
    ctx.textAlign = 'left';
    for (i = 0; i <= 4; i++) { y = chartTop() + i * stepY; ctx.fillText(String(110 - i * 5), 4, y - 4); }
  }
  function drawCandles() {
    var s = BF.LOGIC.state(); if (!s) return;
    var gap = 56, cw = 34;
    var rightX = W - 24 + (worldX % gap);
    var idx = s.candles.length - 1;
    var x = rightX;
    // 未完成蜡烛
    if (s.cur) drawCandle(x, s.cur, cw);
    x -= gap;
    while (x > -cw && idx >= 0) { drawCandle(x, s.candles[idx], cw); idx--; x -= gap; }
  }
  function drawCandle(x, c, cw) {
    var up = c.c >= c.o;
    var col = up ? '#e04f63' : '#33b184'; // A 股语义：红涨绿跌
    if (Math.abs(c.c - c.o) < 0.001) col = '#c8b89a';
    var yh = priceToY(c.h), yl = priceToY(c.l), yo = priceToY(c.o), yc = priceToY(c.c);
    var top = Math.min(yo, yc), bot = Math.max(yo, yc);
    if (bot - top < 2) { top -= 1; bot += 1; }
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + cw / 2, yh); ctx.lineTo(x + cw / 2, yl); ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(x, top, cw, bot - top);
  }
  function drawCostLine() {
    var s = BF.LOGIC.state(); if (!s || s.shares <= 0) return;
    var ac = BF.LOGIC.avgCost(); if (ac < 90 || ac > 110) return;
    var y = priceToY(ac);
    ctx.save();
    ctx.strokeStyle = 'rgba(212,169,56,0.85)';
    ctx.lineWidth = 2; ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.restore();
  }
  function drawPipes() {
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      var topH = p.gy - p.gh / 2, botY = p.gy + p.gh / 2;
      drawPipeSeg(p.x, chartTop() - 6, p.w, topH - chartTop() + 6, true);
      drawPipeSeg(p.x, botY, p.w, chartTop() + chartH() - botY + 6, false);
    }
  }
  function drawPipeSeg(x, y, w, h, fromTop) {
    if (h <= 0) return;
    ctx.fillStyle = 'rgba(66,86,112,0.42)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(150,170,195,0.5)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // 斜纹端帽
    var capH = 14, cy = fromTop ? y + h - capH : y;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, cy, w, capH); ctx.clip();
    ctx.fillStyle = 'rgba(190,205,222,0.75)';
    for (var sx = -capH; sx < w + capH; sx += 14) {
      ctx.beginPath();
      ctx.moveTo(x + sx, cy + capH); ctx.lineTo(x + sx + 7, cy);
      ctx.lineTo(x + sx + 13, cy); ctx.lineTo(x + sx + 6, cy + capH);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawButtons() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var isBuy = b.kind === 'buy';
      var col = isBuy ? '#f43f5e' : '#2fae7f';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283);
      ctx.fillStyle = isBuy ? 'rgba(120,26,44,0.55)' : 'rgba(21,84,60,0.55)';
      ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '600 26px -apple-system,system-ui';
      ctx.fillText(isBuy ? '买' : '卖', b.x, b.y + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '13px -apple-system,system-ui';
      var pv = isBuy ? yToPrice(b.y) : (BF.LOGIC.state() ? BF.LOGIC.state().price : 100);
      ctx.fillText(yToPrice(b.y).toFixed(1), b.x, b.y + b.r + 18);
    }
  }
  function drawBull() {
    var fr = (Math.floor(bull.wing) % 2 + 2) % 2;
    var img = bullImg[fr] || bullImg[0];
    ctx.save();
    ctx.translate(bull.x, bull.y);
    ctx.rotate(bull.dead ? bull.deadRot : bull.tilt * 0.6);
    var w = 112, h = 84;
    if (img) { try { ctx.drawImage(img, -w / 2, -h / 2, w, h); } catch (e) { fallbackBull(); } }
    else fallbackBull();
    ctx.restore();
  }
  function fallbackBull() {
    ctx.fillStyle = '#e8c98f';
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 20, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-14, -18, 16, 9, -0.5, 0, 6.283); ctx.fill();
  }
  // ---------- 粒子（自绘轻量版；FX 模块在时交给它） ----------
  function stepParticles(dt) {
    var f = BF.FX;
    if (f && f.step) { f.step(dt, ctx); return; }
    for (var i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i]; p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
      if (p.life <= 0) sparks.splice(i, 1);
    }
  }
  function drawParticles() {
    var f = BF.FX;
    if (f && f.draw) { f.draw(ctx); return; }
    for (var i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
  function drawDeadVeil() {
    if (state !== 'dead') return;
    ctx.fillStyle = 'rgba(8,9,12,0.25)';
    ctx.fillRect(0, 0, W, H);
  }
  // 迷你K线画在 hint 条左侧的 #mini
  function drawMini() {
    var m = document.getElementById('mini');
    var s = BF.LOGIC.state();
    if (!m || !s) return;
    var g = m.getContext('2d');
    var mw = m.width, mh = m.height;
    g.clearRect(0, 0, mw, mh);
    var all = s.candles.slice(-26); if (s.cur) all = all.concat([s.cur]);
    if (!all.length) return;
    var lo = 100, hi = 100;
    for (var i = 0; i < all.length; i++) { lo = Math.min(lo, all[i].l); hi = Math.max(hi, all[i].h); }
    var pad = (hi - lo) * 0.12 + 0.01;
    lo -= pad; hi += pad;
    var step = mw / all.length;
    for (i = 0; i < all.length; i++) {
      var c = all[i];
      var up = c.c >= c.o;
      g.fillStyle = up ? '#e04f63' : '#33b184';
      var y1 = (hi - Math.max(c.o, c.c)) / (hi - lo) * mh;
      var y2 = (hi - Math.min(c.o, c.c)) / (hi - lo) * mh;
      g.fillRect(i * step + 0.5, y1, Math.max(1.5, step - 1.5), Math.max(1, y2 - y1));
    }
  }
  function fmt0(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var hintT = 0;
  function hint(str) {
    var el = document.getElementById('hint');
    if (!el) return;
    el.textContent = str;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(hintT);
    hintT = setTimeout(function () { el.classList.remove('show'); }, 4200);
  }
  GAME.clearHint = function () { var el = document.getElementById('hint'); if (el) el.classList.remove('show'); clearTimeout(hintT); };
  GAME.hint = hint;

  // ---------- 主循环（rAF + setInterval 双驱动） ----------
  function loop(t) {
    rafId = requestAnimationFrame(loop);
    if (!running) return;
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    if (dt <= 0) return;
    step(dt * opts.fast);
    render();
  }

  window.addEventListener('resize', function () { if (cv) resize(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'flying') { GAME.pause(); if (BF.UI && BF.UI.onPause) BF.UI.onPause(); }
  });

  GAME.bind = bind;
  GAME.state = function () { return state; };
  GAME.bull = function () { return bull; };
  GAME.setBullImg = function (i, d) { bullImg[i] = d; if (bullImg[0] && bullImg[1]) imgReady = true; };
  window.BF.GAME = GAME;
})();
