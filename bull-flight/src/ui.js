/* bull-flight ui —— 页面状态机/HUD/战报（主线负责）
 * DOM 骨架在 shell.html；本模块只做绑定/刷新/绘制
 */
(function () {
  window.BF = window.BF || {};
  var UI = {};
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (v, d) {
    d = d == null ? 2 : d;
    var neg = v < 0, s = Math.abs(v).toFixed(d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  };
  UI.fmt = fmt;
  var page = 'hall';
  var setup = { ratio: 1, amount: 0, borrow: 0 };
  var curReport = null;
  var toast = function (s) { UI.toast(s); };  // 局部便捷引用（运行时 UI.toast 已就绪）

  // ---------- 存档 ----------
  var SAVE_KEY = 'bf.save.v1';
  function defSave() {
    return { principal: 25892, asset: 25892, best: null, rounds: 0, totalTrades: 0,
      style: 'half', market: 'main', rechargeTotal: 0, lastReport: null };
  }
  function loadSave() {
    try {
      var o = JSON.parse(localStorage.getItem(SAVE_KEY));
      return o ? Object.assign(defSave(), o) : defSave();
    } catch (e) { return defSave(); }
  }
  function persistSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {} }
  var save = loadSave();
  UI.save = function () { return save; };

  // ---------- 解锁条件表 ----------
  var UNLOCKS = {
    cy:    { need: '总资产达到 ¥200,000', ok: function () { return save.asset >= 200000; } },
    all:   { need: '累计完成 5 局', ok: function () { return (save.rounds || 0) >= 5; } },
    grid:  { need: '累计成交 30 笔', ok: function () { return (save.totalTrades || 0) >= 30; } },
    light: { need: '最佳收益 ≥ +8%', ok: function () { return save.best != null && save.best >= 0.08; } },
    bank:  { need: '累计完成 3 局', ok: function () { return (save.rounds || 0) >= 3; } },
    micro: { need: '总资产达到 ¥50,000', ok: function () { return save.asset >= 50000; } },
    lev:   { need: '总资产达到 ¥100,000', ok: function () { return save.asset >= 100000; } }
  };
  UI.unlocked = function (k) { return !!(UNLOCKS[k] && UNLOCKS[k].ok()); };
  function borrowCap() {
    var r = UI.unlocked('lev') ? 2.0 : UI.unlocked('micro') ? 1.0 : UI.unlocked('bank') ? 0.75 : 0.5;
    return { ratio: r, cap: Math.round(save.asset * r) };
  }
  UI.borrowCap = borrowCap;
  UI.recharge = function (amt) {
    amt = Math.max(0, Math.round(amt || 0));
    if (!amt) return;
    save.asset += amt;
    save.rechargeTotal = (save.rechargeTotal || 0) + amt;
    persistSave(save);
    UI.toast('充值成功：+¥' + fmt(amt, 0) + ' 已到账（累计充值 ¥' + fmt(save.rechargeTotal, 0) + '）');
    if (page === 'hall') fillHall();
  };

  // ---------- 页面切换 ----------
  UI.show = function (p) {
    page = p;
    ['hall', 'setup', 'game', 'report'].forEach(function (n) {
      var el = $('page-' + n);
      if (el) el.classList.toggle('active', n === p);
    });
    if (p === 'hall') fillHall();
    if (p === 'setup') fillSetup();
    if (p === 'game') { requestAnimationFrame(function () { if (BF.GAME.bind) BF.GAME.bind(); }); }
  };
  UI.page = function () { return page; };

  // ---------- 大厅 ----------
  function fillHall() {
    $('hall-asset').textContent = '¥' + fmt(save.asset, 0);
    $('hall-best').textContent = save.best == null ? '—' : (save.best >= 0 ? '+' : '') + (save.best * 100).toFixed(2) + '%';
    $('hall-best').className = save.best != null && save.best < 0 ? 'neg' : '';
    $('hall-rounds').textContent = save.rounds + ' 局';
    var img = $('hall-bull');
    if (BF.ART && BF.ART.ready) img.src = BF.ART.bullBig ? BF.ART.bullBig() : BF.ART.bullFrame(0);
  }

  // ---------- 开局准备 ----------
  function refreshLocks() {
    // 交易风格卡：解锁态文案 + 当前使用
    document.querySelectorAll('#page-setup .styles .st').forEach(function (b) {
      var k = b.dataset.st;
      var un = k === 'half' || UI.unlocked(k);
      var ul = b.querySelector('.ul');
      if (ul) {
        if (un) { ul.textContent = '已解锁 · 点击选用'; ul.classList.add('done'); }
        else { ul.textContent = UNLOCKS[k].need + ' 后解锁'; ul.classList.remove('done'); }
      }
      var lk = b.querySelector('.lk');
      if (lk) lk.style.display = un ? 'none' : '';
      var on = save.style === k && un;
      b.classList.toggle('on', on);
      var cur = b.querySelector('.cur');
      if (cur) cur.style.display = on ? '' : 'none';
    });
    // 市场卡
    var cyOk = UI.unlocked('cy');
    var cyBtn = document.querySelector('.mk[data-mk="cy"]');
    if (cyBtn) {
      cyBtn.innerHTML = cyOk ? '创业板' : '创业板 · 未解锁<img class="lk" id="lk1" data-ic="lock" alt="">';
      if (!cyOk && BF.ART && BF.ART.ready && BF.ART.icon) {
        var im = cyBtn.querySelector('.lk'); if (im) im.src = BF.ART.icon('lock');
      }
      cyBtn.classList.toggle('on', cyOk && save.market === 'cy');
    }
    var mkMain = document.querySelector('.mk[data-mk="main"]');
    if (mkMain) mkMain.classList.toggle('on', save.market !== 'cy');
    var cyNote = $('su-cy-note');
    if (cyNote) cyNote.textContent = cyOk ? '创业板已开放：波动 ×1.9 · 股息 5% · 买入机会更频繁'
                                         : '创业板：' + UNLOCKS.cy.need + '后开放';
    // 顶部功能标签：解锁链
    var tg = { 'tg-bank': 'bank', 'tg-micro': 'micro', 'tg-lev': 'lev' };
    Object.keys(tg).forEach(function (id) {
      var el = $(id); if (!el) return;
      var k = tg[id];
      if (UI.unlocked(k)) { el.removeAttribute('data-lock'); el.style.opacity = '1'; }
      else { el.setAttribute('data-lock', '1'); }
    });
    var short = $('tg-short');
    if (short) short.setAttribute('data-lock', '1');
    // 首仓文案随风格
    var styleR = { half: 0.5, all: 1, grid: 0.25, light: 0.25 }[save.style] || 0.5;
    return styleR;
  }
  function fillSetup() {
    var base = save.asset;
    var styleR = refreshLocks();
    var cap = borrowCap();
    setup.amount = Math.round(base * setup.ratio);
    setup.borrow = Math.min(setup.borrow || 0, cap.cap);
    $('su-amount').textContent = '¥' + fmt(setup.amount + setup.borrow, 0);
    $('su-pct').textContent = Math.round(setup.ratio * 100) + '%';
    $('su-enter').textContent = '本局入场 ¥' + fmt(setup.amount + setup.borrow, 0) + '  /  预留 ¥' + fmt(base - setup.amount, 0);
    $('su-debt').textContent = '总负债 ¥' + fmt(setup.borrow, 2);
    var total = setup.amount + setup.borrow;
    var first = total * styleR;
    $('su-first').textContent = '首笔持仓 ¥' + fmt(first - first * 0.0004, 2) + ' · 税费 ¥' + (first * 0.0004).toFixed(2);
    $('su-go').textContent = '投入 ¥' + fmt(total, 0) + ' · 开盘 →';
    var slider = $('su-slider');
    if (slider) slider.value = Math.round(setup.ratio * 100);
    document.querySelectorAll('#page-setup .quick button').forEach(function (b) {
      b.classList.toggle('on', parseFloat(b.dataset.r) === setup.ratio);
    });
  }
  UI.fillSetup = fillSetup;
  function bindSetup() {
    $('su-back').onclick = function () { UI.show('hall'); };
    document.querySelectorAll('#page-setup .market .mk').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.mk === 'cy') {
          if (!UI.unlocked('cy')) { toast('创业板解锁条件：' + UNLOCKS.cy.need + '（当前 ¥' + fmt(save.asset, 0) + '）'); return; }
          save.market = 'cy';
        } else save.market = 'main';
        persistSave(save);
        refreshLocks(); fillSetup();
      };
    });
    document.querySelectorAll('#page-setup .quick button').forEach(function (b) {
      b.onclick = function () { setup.ratio = parseFloat(b.dataset.r); fillSetup(); };
    });
    $('su-slider').oninput = function () {
      setup.ratio = parseInt(this.value, 10) / 100;
      document.querySelectorAll('#page-setup .quick button').forEach(function (b) { b.classList.remove('on'); });
      fillSetup();
    };
    $('su-borrow').onclick = openBorrow;
    document.querySelectorAll('#page-setup .styles .st').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.st;
        if (k !== 'half' && !UI.unlocked(k)) { toast('「' + b.querySelector('b').textContent + '」解锁条件：' + UNLOCKS[k].need); return; }
        save.style = k; persistSave(save);
        refreshLocks(); fillSetup();
      };
    });
    document.querySelectorAll('#page-setup .tags span').forEach(function (s) {
      s.onclick = function () {
        if (s.id === 'tg-short') { toast('做空正在研发中，敬请期待'); return; }
        if (s.id === 'tg-bank' && UI.unlocked('bank')) { toast('银行借款已开放：借款上限提升至 75%'); return; }
        if (s.id === 'tg-micro' && UI.unlocked('micro')) { toast('小额贷已开放：借款上限提升至 100%'); return; }
        if (s.id === 'tg-lev' && UI.unlocked('lev')) { toast('杠杆已开放：借款上限提升至 200%'); return; }
        if (s.dataset.lock) toast('「' + s.textContent.replace(/^[^\u4e00-\u9fa5]*/, '') + '」未解锁');
      };
    });
    $('su-go').onclick = function () {
      var amount = Math.max(0, Math.round(save.asset * setup.ratio));
      if (amount < 100) { toast('投入太少，加一点仓再开盘'); return; }
      BF.LOGIC.newRound(amount, setup.borrow, save.style, save.market);
      UI.show('game');
      BF.GAME.start();
    };
  }
  var borrowDlg = null;
  function openBorrow() {
    if (!borrowDlg) {
      borrowDlg = document.createElement('div');
      borrowDlg.className = 'dlg borrow';
      borrowDlg.innerHTML =
        '<div class="dlg-card"><h3>借款加仓</h3>' +
        '<p class="dim" id="bw-tip"></p>' +
        '<div class="borrow-amt">¥<b id="bw-amt">0</b></div>' +
        '<input type="range" id="bw-slider" min="0" value="0">' +
        '<button class="btn primary" id="bw-ok">确认借款</button>' +
        '<button class="btn ghost" id="bw-no">取消</button></div>';
      document.body.appendChild(borrowDlg);
      $('bw-ok').onclick = function () { setup.borrow = parseInt($('bw-slider').value, 10) || 0; fillSetup(); borrowDlg.classList.remove('show'); };
      $('bw-no').onclick = function () { borrowDlg.classList.remove('show'); };
    }
    var cap = borrowCap();
    var sl = $('bw-slider');
    sl.max = cap.cap; sl.value = Math.min(setup.borrow, cap.cap);
    $('bw-amt').textContent = fmt(Math.min(setup.borrow, cap.cap), 0);
    sl.oninput = function () { $('bw-amt').textContent = fmt(parseInt(sl.value, 10), 0); };
    var nextTip = cap.ratio >= 2 ? '借款上限已满级。'
      : cap.ratio >= 1 ? '总资产达到 ¥100,000 解锁杠杆（上限 200%）。'
      : cap.ratio >= 0.75 ? '总资产达到 ¥50,000 解锁小额贷（上限 100%）。'
      : '累计完成 3 局解锁银行借款（上限 75%）。';
    $('bw-tip').textContent = '当前可借总资产的 ' + Math.round(cap.ratio * 100) + '%（¥' + fmt(cap.cap, 0) +
      '），收盘自动还贷，还不上即破产。' + nextTip;
    borrowDlg.classList.add('show');
  }

  // ---------- HUD ----------
  function fitNum(el) {
    var n = el.textContent.length;
    el.classList.toggle('xsmall', n >= 13);
    el.classList.toggle('small', n >= 11 && n < 13);
  }
  UI.refreshHUD = function () {
    var s = BF.LOGIC.state();
    if (!s) return;
    var nav = BF.LOGIC.nav();
    var pnl = nav - s.invested;
    var pnlR = s.invested > 0 ? pnl / s.invested : 0;
    $('hud-nav').textContent = '¥' + fmt(nav, 0);
    fitNum($('hud-nav'));
    $('hud-cash').textContent = '¥' + fmt(s.cash, 0);
    $('hud-pnl-r').textContent = (pnl >= 0 ? '+' : '') + (pnlR * 100).toFixed(2) + '%';
    $('hud-pnl').textContent = (pnl >= 0 ? '+' : '−') + '¥' + fmt(Math.abs(pnl));
    fitNum($('hud-pnl'));
    $('hud-pnl').className = pnl >= 0 ? 'up' : 'down';
    $('hud-pnl-r').className = pnl >= 0 ? 'up' : 'down';
    $('hud-state').textContent = s.shares > 0 ? '多头 · ' + s.tradeN + ' 笔' : '空仓 · 待入场';
    $('hud-price').textContent = s.price.toFixed(2);
    var posR = nav > 0 ? (s.shares * s.price) / nav : 0;
    $('hud-posr').textContent = Math.round(posR * 100) + '%';
    $('hud-pos-state').textContent = s.shares > 0 ? '持仓' : '空仓';
    $('hud-pos-state').className = s.shares > 0 ? 'held' : '';
    var segs = $('hud-segs').children;
    var fillN = Math.round(posR * 10);
    for (var i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i < fillN);
    var fl = s.shares > 0 ? s.shares * s.price - s.costBasis : 0;
    $('hud-float').textContent = '浮盈亏 ' + (fl >= 0 ? '+' : '−') + '¥' + fmt(Math.abs(fl), 0);
    $('hud-float').className = 'fl ' + (fl >= 0 ? 'up' : 'down');
    $('mini-price').textContent = s.price.toFixed(2);
  };
  function bindGame() {
    $('hud-pause').onclick = function () {
      if (BF.GAME.state() === 'flying') { BF.GAME.pause(); showPause(); try { BF.SFX.play('pause'); } catch (e) {} }
    };
    var cv = $('cv');
    var onTap = function (e) {
      if (BF.UI.page() !== 'game') return;
      if (BF.GAME.state() === 'flying') { e.preventDefault(); BF.GAME.tap(); }
    };
    cv.addEventListener('pointerdown', onTap);
    $('hud-lever').onclick = function () { toast('杠杆功能在「开局准备 → 借款加仓」中，总资产 ¥100,000 解锁'); };
    $('hud-margin').onclick = function () { toast('融券（做空）正在研发中，敬请期待'); };
  }
  UI.onPause = function () { showPause(); };
  function showPause() {
    $('dlg-pause').classList.add('show');
  }
  function bindPause() {
    $('pa-ad').onclick = function () {
      var b = $('pa-ad');
      if (b.dataset.busy) return;
      b.dataset.busy = '1';
      var n = 3;
      b.textContent = '广告播放中 ' + n;
      var iv = setInterval(function () {
        n--;
        if (n <= 0) {
          clearInterval(iv);
          delete b.dataset.busy;
          b.textContent = '看广告复活';
          $('dlg-pause').classList.remove('show');
          BF.GAME.resume();
        } else b.textContent = '广告播放中 ' + n;
      }, 700);
    };
    $('pa-end').onclick = function () {
      $('dlg-pause').classList.remove('show');
      var rep = BF.LOGIC.finish('manual');
      if (rep) UI.showReport(rep);
    };
  }

  // ---------- 战报 ----------
  UI.showReport = function (rep) {
    curReport = rep;
    save.asset = Math.max(0, Math.round(rep.asset));
    save.rounds = (save.rounds || 0) + 1;
    save.totalTrades = (save.totalTrades || 0) + rep.trades;
    if (save.best == null || rep.ret > save.best) save.best = rep.ret;
    save.lastReport = { ret: rep.ret, net: rep.net, title: rep.title };
    persistSave(save);
    var bail = $('rp-bailout');
    if (bail) bail.style.display = save.asset < 1000 ? '' : 'none';
    $('rp-title').textContent = rep.title;
    $('rp-sub').textContent = rep.sub;
    var hi = BF.ART && BF.ART.ready && BF.ART.bullHead;
    if (hi) $('rp-bull').src = BF.ART.bullHead();
    $('rp-ret').textContent = (rep.ret >= 0 ? '+' : '') + (rep.ret * 100).toFixed(2) + '%';
    $('rp-ret').className = rep.ret >= 0 ? 'big up' : 'big down';
    $('rp-net').textContent = (rep.net >= 0 ? '+' : '−') + '¥' + fmt(Math.abs(rep.net));
    $('rp-net').className = rep.net >= 0 ? 'up' : 'down';
    $('rp-invested').textContent = '¥' + fmt(rep.invested, 2);
    $('rp-trades').textContent = rep.trades + ' 次';
    $('rp-dd').textContent = (rep.maxDD * 100).toFixed(2) + '%';
    $('rp-peak').textContent = '峰值 ' + (rep.peak - rep.invested >= 0 ? '+' : '−') + '¥' + fmt(Math.abs(rep.peak - rep.invested), 0);
    $('rp-close').textContent = '收盘 ' + (rep.ret >= 0 ? '+' : '') + (rep.ret * 100).toFixed(2) + '%';
    var qr = $('rp-qr');
    if (BF.ART && BF.ART.ready && BF.ART.qr) qr.src = BF.ART.qr(String(Math.round(rep.net * 100) + rep.trades));
    UI.show('report');
    requestAnimationFrame(function () { drawNav($('rp-nav'), rep); });
    try { BF.GAME.stop(); } catch (e) {}
  };
  function drawNav(canvas, rep) {
    var g = canvas.getContext('2d');
    var W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
    canvas.width = W * 2; canvas.height = H * 2; g.scale(2, 2);
    var nav = rep.nav && rep.nav.length > 1 ? rep.nav : [rep.invested, rep.invested + rep.net];
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < nav.length; i++) { lo = Math.min(lo, nav[i]); hi = Math.max(hi, nav[i]); }
    var base = rep.invested;
    lo = Math.min(lo, base); hi = Math.max(hi, base);
    var pad = (hi - lo) * 0.15 + 0.01; lo -= pad; hi += pad;
    var x = function (i) { return 6 + i / (nav.length - 1) * (W - 12); };
    var y = function (v) { return 6 + (hi - v) / (hi - lo) * (H - 24); };
    var y0 = y(base);
    // 网格 + 0 线
    g.strokeStyle = 'rgba(20,30,50,0.08)'; g.lineWidth = 1;
    for (i = 1; i < 4; i++) { var gy = 6 + i / 4 * (H - 24); g.beginPath(); g.moveTo(6, gy); g.lineTo(W - 6, gy); g.stroke(); }
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(20,30,50,0.25)';
    g.beginPath(); g.moveTo(6, y0); g.lineTo(W - 6, y0); g.stroke(); g.setLineDash([]);
    // 面积：红上绿下
    function area(from, to, col) {
      g.beginPath();
      g.moveTo(x(from), y0);
      for (var i = from; i <= to; i++) g.lineTo(x(i), y(nav[i]));
      g.lineTo(x(to), y0); g.closePath();
      g.fillStyle = col; g.fill();
    }
    // 找穿越 0 线的分段
    var segs = [], cur = 0;
    for (i = 1; i < nav.length; i++) {
      var up = nav[i] >= base, pu = nav[i - 1] >= base;
      if (up !== pu) { segs.push([cur, i, pu]); cur = i; }
    }
    segs.push([cur, nav.length - 1, nav[cur] >= base]);
    segs.forEach(function (sg) { area(sg[0], sg[1], sg[2] ? 'rgba(230,57,86,0.16)' : 'rgba(24,160,110,0.16)'); });
    // 折线分段着色
    for (i = 1; i < nav.length; i++) {
      g.strokeStyle = nav[i] >= base ? '#e63956' : '#18a06e';
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(x(i - 1), y(nav[i - 1])); g.lineTo(x(i), y(nav[i])); g.stroke();
    }
    // 末点
    g.fillStyle = nav[nav.length - 1] >= base ? '#e63956' : '#18a06e';
    g.beginPath(); g.arc(x(nav.length - 1), y(nav[nav.length - 1]), 4, 0, 6.283); g.fill();
  }
  function bindReport() {
    $('rp-detail').onclick = function () {
      var s = BF.LOGIC.state();
      var list = $('dlg-detail-list');
      var rows = '';
      var t0 = performance.now();
      var trades = (s && s.trades) ? s.trades : [];
      for (var i = 0; i < trades.length; i++) {
        var t = trades[i];
        rows += '<div class="tr"><span class="' + (t.side === 'buy' ? 'b' : 's') + '">' + (t.side === 'buy' ? '买入' : '卖出') + '</span>' +
          '<span>价 ' + t.price.toFixed(2) + '</span><span>¥' + fmt(t.amount) + '</span>' +
          '<span class="' + (t.pnl != null ? (t.pnl >= 0 ? 'up' : 'down') : 'dim') + '">' + (t.pnl != null ? ((t.pnl >= 0 ? '+' : '') + fmt(t.pnl)) : ('费 ' + t.fee.toFixed(2))) + '</span></div>';
      }
      if (!rows) rows = '<div class="empty dim">本局没有成交</div>';
      list.innerHTML = rows;
      $('dlg-detail').classList.add('show');
    };
    $('dlg-detail-close').onclick = function () { $('dlg-detail').classList.remove('show'); };
    $('rp-shot').onclick = function () { shotReport(); };
    $('rp-hall').onclick = function () { UI.show('hall'); };
    $('rp-again').onclick = function () { setup.ratio = 1; setup.borrow = 0; UI.show('setup'); };
    $('rp-bailout').onclick = function () {
      save.asset += 25000;
      persistSave(save);
      $('rp-bailout').style.display = 'none';
      toast('重启资金 ¥25,000 已到账，东山再起！');
      try { BF.SFX.play('profit'); } catch (e) {}
    };
  }
  // 截图模式：自绘战报卡导出 PNG
  function shotReport() {
    var rep = curReport; if (!rep) return;
    var cv = document.createElement('canvas');
    cv.width = 750; cv.height = 1150;
    var g = cv.getContext('2d');
    g.fillStyle = '#101116'; g.fillRect(0, 0, 750, 1150);
    // 卡片
    roundRect(g, 55, 130, 640, 890, 18); g.fillStyle = '#eef1f6'; g.fill();
    g.fillStyle = '#8a92a0'; g.font = '22px -apple-system,system-ui';
    g.fillText('收盘战报', 85, 172);
    // 横幅
    roundRect(g, 85, 200, 580, 130, 14);
    var grd = g.createLinearGradient(0, 200, 580, 330);
    grd.addColorStop(0, '#dfe9fb'); grd.addColorStop(1, '#e8f1fd');
    g.fillStyle = grd; g.fill();
    var bull = new Image();
    g.fillStyle = '#10131a'; g.font = '700 40px -apple-system,system-ui';
    g.fillText(rep.title, 240, 262);
    g.fillStyle = '#5a6474'; g.font = '22px -apple-system,system-ui';
    g.fillText(rep.sub, 240, 300);
    if (BF.ART && BF.ART.ready) {
      bull.onload = function () { g.drawImage(bull, 110, 215, 100, 100); done(); };
      bull.src = BF.ART.bullHead();
    }
    var drawn = false;
    function done() {
      if (drawn) return; drawn = true;
      g.fillStyle = '#3c4557'; g.font = '24px -apple-system,system-ui';
      g.fillText('账户结算', 85, 390);
      g.fillStyle = '#8a92a0'; g.font = '20px -apple-system,system-ui';
      g.fillText('本局收益率', 85, 425);
      g.fillText('已结算净收益', 420, 425);
      g.fillStyle = rep.ret >= 0 ? '#d9203e' : '#0f9962'; g.font = '700 62px -apple-system,system-ui';
      g.fillText((rep.ret >= 0 ? '+' : '') + (rep.ret * 100).toFixed(2) + '%', 85, 490);
      g.font = '700 34px -apple-system,system-ui';
      g.fillStyle = rep.net >= 0 ? '#d9203e' : '#0f9962';
      g.fillText((rep.net >= 0 ? '+' : '') + fmt(rep.net), 420, 480);
      g.fillStyle = '#8a92a0'; g.font = '20px -apple-system,system-ui';
      g.fillText('本局投入', 85, 540); g.fillText('买卖次数', 320, 540); g.fillText('最大回撤', 520, 540);
      g.fillStyle = '#191d26'; g.font = '700 26px -apple-system,system-ui';
      g.fillText('¥' + fmt(rep.invested, 2), 85, 575); g.fillText(rep.trades + ' 次', 320, 575); g.fillText((rep.maxDD * 100).toFixed(2) + '%', 520, 575);
      // 走势
      g.strokeStyle = '#dfe3ea'; g.strokeRect(85, 620, 580, 260);
      var nav = rep.nav && rep.nav.length > 1 ? rep.nav : [rep.invested, rep.invested + rep.net];
      var lo = Infinity, hi = -Infinity;
      for (var i = 0; i < nav.length; i++) { lo = Math.min(lo, nav[i]); hi = Math.max(hi, nav[i]); }
      lo = Math.min(lo, rep.invested); hi = Math.max(hi, rep.invested);
      var pad = (hi - lo) * 0.15 + 0.01; lo -= pad; hi += pad;
      var X = function (i) { return 95 + i / (nav.length - 1) * 560; };
      var Y = function (v) { return 635 + (hi - v) / (hi - lo) * 220; };
      var y0 = Y(rep.invested);
      g.setLineDash([5, 5]); g.strokeStyle = '#b7bfcc';
      g.beginPath(); g.moveTo(95, y0); g.lineTo(655, y0); g.stroke(); g.setLineDash([]);
      for (i = 1; i < nav.length; i++) {
        g.strokeStyle = nav[i] >= rep.invested ? '#d9203e' : '#0f9962';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(X(i - 1), Y(nav[i - 1])); g.lineTo(X(i), Y(nav[i])); g.stroke();
      }
      g.fillStyle = '#8a92a0'; g.font = '18px -apple-system,system-ui';
      g.fillText('2026-01', 95, 908); g.fillText('2026-03', 330, 908); g.fillText('2026-05', 590, 908);
      g.fillStyle = '#191d26'; g.font = '700 34px -apple-system,system-ui';
      g.fillText('不服？你来画一根。', 85, 975);
      if (BF.ART && BF.ART.ready) {
        var q = new Image();
        q.onload = function () { g.drawImage(q, 520, 930, 130, 130); fin(); };
        q.onerror = function () { fin(); };
        q.src = BF.ART.qr('shot' + Math.round(rep.net * 100));
      } else fin();
      function fin() {
        var a = document.createElement('a');
        a.download = 'bull-flight-战报.png';
        a.href = cv.toDataURL('image/png');
        a.click();
        UI.toast('战报图已保存');
      }
    }
    setTimeout(function () { done(); }, 800); // 兜底：图片加载失败也能出图
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ---------- toast ----------
  var toastT = 0;
  UI.toast = function (s) {
    var t = $('toast');
    t.textContent = s;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 1800);
  };

  // ---------- 启动绑定 ----------
  UI.bind = function () {
    bindSetup(); bindGame(); bindPause(); bindReport();
    $('hall-start').onclick = function () { setup.ratio = 1; setup.borrow = 0; UI.show('setup'); };
    $('hall-cfg').onclick = function () { BF.CFG.openPanel(); };
    // 仓位条分段
    var segs = $('hud-segs');
    if (segs && !segs.children.length) for (var i = 0; i < 10; i++) { var d = document.createElement('i'); segs.appendChild(d); }
    // ART 就绪后补图
    var n = 0, iv = setInterval(function () {
      n++;
      if ((window.BF.ART && BF.ART.ready) || n > 80) {
        clearInterval(iv);
        fillHall();
        document.querySelectorAll('#app img[data-ic]').forEach(function (im) {
          if (BF.ART.icon) im.src = BF.ART.icon(im.dataset.ic);
        });
        $('hud-pause').innerHTML = '<img data-p="pause" alt="" style="width:15px;height:15px;vertical-align:middle">';
        var hp = $('hud-pause').querySelector('img');
        if (BF.ART.icon) hp.src = BF.ART.icon('pause');
        var lb = $('hall-bull'); if (lb && !lb.src) fillHall();
      }
    }, 150);
  };
  window.BF.UI = UI;
})();
