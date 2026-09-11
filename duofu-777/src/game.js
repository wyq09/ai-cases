/* 多福巨奖 777 — 主线：状态机 / 持久化 / 押注 / 自动 / 免费局 / 选奖 / 演出 / 接线 */
window.DF = window.DF || {};
DF.GAME = (function () {
  'use strict';

  var L = DF.LOGIC, A = DF.AUDIO, R = DF.REELS;
  var noop = function () {};
  var NOOP_FX = new Proxy({ spark: noop, coinRain: noop, bigText: noop, coinBurst: noop,
    confetti: noop, flash: noop, ring: noop, stopAll: noop, init: noop,
    sparkCells: noop, sparkAtReel: noop }, {
    get: function (t, k) { return k in t ? t[k] : noop; }
  });
  function F() { return DF.FX || NOOP_FX; }   // 惰性解析（fx.js 后置装载，缺省空实现）
  var $ = function (id) { return document.getElementById(id); };
  var STATE_KEY = 'df777_state_v1', CFG_KEY = 'df777_config_v1';
  var QS = new URLSearchParams(location.search);

  /* ---------- 配置与状态 ---------- */
  function deepMerge(base, ext) {
    if (ext === null || ext === undefined) return base;
    if (Array.isArray(ext)) return ext.slice();
    if (typeof ext !== 'object') return ext;
    var out = (typeof base === 'object' && base !== null && !Array.isArray(base)) ? Object.assign({}, base) : {};
    Object.keys(ext).forEach(function (k) { out[k] = deepMerge(out[k], ext[k]); });
    return out;
  }
  // ?reset=1 必须在读取任何存储前生效
  if (new URLSearchParams(location.search).get('reset') === '1') {
    try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(CFG_KEY); } catch (e) {}
  }
  var cfg = L.defaultCfg();
  try {
    var savedCfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (savedCfg) cfg = deepMerge(cfg, savedCfg);
  } catch (e) {}

  var S = null;
  function freshState() {
    var pots = {};
    L.POT_ORDER.forEach(function (p) { pots[p] = cfg.jackpots[p].seed; });
    return {
      v: 1, credits: cfg.startCredits, jackpots: pots,
      rails: { mini: 0, minor: 0, major: 0, grand: 0 },
      betIdx: Math.min(2, cfg.betTiers.length - 1),
      stats: { spins: 0, bet: 0, win: 0, maxWin: 0, picks: 0, fs: 0 },
      ts: Date.now(), stripSeed: (Math.random() * 1e9) | 0
    };
  }
  function loadState() {
    try {
      var d = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if (d && d.v === 1) {
        d.rails = deepMerge({ mini: 0, minor: 0, major: 0, grand: 0 }, d.rails);
        L.POT_ORDER.forEach(function (p) {
          d.jackpots[p] = Math.max(cfg.jackpots[p].seed, +d.jackpots[p] || cfg.jackpots[p].seed);
        });
        d.stats = deepMerge({ spins: 0, bet: 0, win: 0, maxWin: 0, picks: 0, fs: 0 }, d.stats);
        return d;
      }
    } catch (e) {}
    return null;
  }
  function saveState() {
    if (!S) return;
    S.ts = Date.now();
    try { localStorage.setItem(STATE_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  // 离线奖池漂移：每小时 +seed×0.02%，封顶 +5%
  function offlineDrift() {
    if (!S) return;
    var hrs = Math.max(0, (Date.now() - (S.ts || Date.now())) / 36e5);
    if (hrs < 0.02) return;
    L.POT_ORDER.forEach(function (p) {
      var add = Math.min(hrs * cfg.jackpots[p].seed * 0.0002, cfg.jackpots[p].seed * 0.05);
      S.jackpots[p] += add;
    });
  }

  /* ---------- 工具 ---------- */
  function fmt(n) {
    return '$' + (typeof n === 'number' ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var toastTimer = 0;
  function toast(msg, ms) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }
  function countUp(el, from, to, dur, tick) {
    return new Promise(function (res) {
      var t0 = performance.now(), done = false;
      el._skip = function () { done = true; };
      (function step(t) {
        var k = done ? 1 : Math.min(1, (t - t0) / dur);
        var v = from + (to - from) * (1 - Math.pow(1 - k, 2));
        v = to >= from ? Math.max(from, Math.min(to, v)) : Math.min(from, Math.max(to, v));
        el.textContent = fmt(v);
        if (k < 1) requestAnimationFrame(step); else res();
      })(t0);
      if (tick) {
        var iv = setInterval(function () {
          if (done) { clearInterval(iv); return; }
          A.play('countTick', { rate: 1 + Math.random() * 0.3 });
        }, 90);
        setTimeout(function () { clearInterval(iv); }, dur + 150);
      }
    });
  }
  function skippable(ms) {
    return new Promise(function (res) {
      var t = setTimeout(done, ms);
      function done() { clearTimeout(t); document.removeEventListener('pointerdown', done); res(); }
      document.addEventListener('pointerdown', done);
    });
  }

  /* ---------- 全局句柄 ---------- */
  var strips = [], viewBase = [], viewFS = [];
  var busy = false;            // 演出/旋转/选奖进行中
  var fsLeft = 0, fsWinAcc = 0, fsActive = false;
  var autoLeft = 0;            // 0=关；Infinity=∞
  var lastWin = 0;
  var rig = QS.get('rig') || '';

  function buildStrips() {
    strips = L.makeStrips(cfg, S.stripSeed || 20260911);
    rebuildViews();
  }
  function rebuildViews() {
    viewBase = []; viewFS = [];
    for (var c = 0; c < 5; c++) {
      viewBase.push(L.stripView(strips[c], false, cfg));
      viewFS.push(L.stripView(strips[c], true, cfg));
    }
  }
  function viewsFor(fs) { return fs ? viewFS : viewBase; }

  /* ---------- UI 刷新 ---------- */
  function updateBar() {
    $('creditVal').textContent = fmt(S.credits);
    $('betVal').textContent = fmt(bet());
    $('winVal').textContent = fmt(lastWin);
  }
  function bet() { return cfg.betTiers[S.betIdx]; }
  function tier() { return S.betIdx + 1; }

  function updatePots(bump) {
    L.POT_ORDER.forEach(function (p) {
      var el = $('pot-' + p);
      el.querySelector('.pot-val').textContent = fmt(S.jackpots[p]);
      var rail = el.querySelector('.pot-rail');
      var need = cfg.railNeed[p];
      if (need <= 20) {
        if (!rail.classList.contains('dots')) { rail.className = 'pot-rail dots'; }
        if (rail.childElementCount !== need) {
          rail.innerHTML = '';
          for (var i = 0; i < need; i++) rail.appendChild(document.createElement('i'));
        }
        var dots = rail.children;
        for (var j = 0; j < need; j++) dots[j].classList.toggle('on', j < S.rails[p]);
      } else {
        if (!rail.classList.contains('bar')) { rail.className = 'pot-rail bar'; rail.innerHTML = '<i></i>'; }
        rail.firstChild.style.width = Math.min(100, S.rails[p] / need * 100).toFixed(1) + '%';
      }
      el.classList.toggle('full', S.rails[p] >= need);
      if (bump === p || (Array.isArray(bump) && bump.indexOf(p) >= 0)) {
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      }
    });
  }
  function updateDots() {
    var d = $('betDots');
    if (d.childElementCount !== cfg.betTiers.length) {
      d.innerHTML = '';
      cfg.betTiers.forEach(function () { d.appendChild(document.createElement('i')); });
    }
    for (var i = 0; i < d.children.length; i++) d.children[i].classList.toggle('on', i <= S.betIdx);
  }
  function updateButtons() {
    var idle = !busy;
    $('btnBetDown').disabled = !idle || fsActive || S.betIdx === 0;
    $('btnBetUp').disabled = !idle || fsActive || S.betIdx >= cfg.betTiers.length - 1;
    $('btnAuto').classList.toggle('on', autoLeft > 0);
    $('btnAuto').querySelector('small').textContent =
      autoLeft === Infinity ? '自动∞' : autoLeft > 0 ? '剩' + autoLeft : '自动';
    $('btnTurbo').classList.toggle('on', !!cfg.turbo);
    $('btnSpin').disabled = false;
    $('spinLabel').textContent = busy && phaseSpin ? '停止' : (fsActive ? '免费' : '旋转');
    $('btnSound').style.opacity = cfg.sound ? 1 : 0.45;
    $('btnSound').firstChild.textContent = cfg.sound ? '🔊' : '🔇';
  }
  var phaseSpin = false;   // 正在滚轮旋转（用于旋转/停止按钮语义）
  function updateFreeBanner() {
    var b = $('freeBanner');
    b.hidden = !fsActive;
    if (fsActive) {
      $('fsLeft').textContent = fsLeft;
      $('fsWin').textContent = fmt(fsWinAcc);
    }
  }

  /* ---------- 图标解析（默认 SVG + 用户覆盖） ---------- */
  function resolveSrc(raw) {
    var ov = cfg.icons && cfg.icons[raw];
    if (ov) return ov;
    if (raw === 'coin') return DF.ART.coin();
    if (raw.indexOf('g_') === 0) return DF.ART.gold(raw.slice(2));
    if (raw === 'gong') return DF.ART.symbol('gong');
    return DF.ART.symbol(raw);
  }

  /* ---------- 旋转核心 ---------- */
  var pendingPicks = [];   // 待选奖的已满轨道 [{pot}]
  var rigQueue = null;     // rig 覆盖的 stops

  function findStop(view, want, row) {
    for (var i = 0; i < view.length; i++) {
      if (view[(i + row) % view.length] === want) return i;
    }
    return null;
  }
  // 测试演出：构造必中 stops
  function applyRig(fs, spinResult) {
    if (!rig) return spinResult;
    var views = viewsFor(fs), stops = spinResult.stops.slice();
    var ok = true;
    function set(sym, row, reels) {
      reels.forEach(function (c) {
        var i = findStop(views[c], sym, row);
        if (i === null) ok = false; else stops[c] = i;
      });
    }
    if (rig === 'win') { set('ingot', 1, [0, 1, 2]); }
    else if (rig === 'bigwin') { set('ingot', 1, [0, 1, 2, 3, 4]); }
    else if (rig === 'fs') { set('gong', 0, [0, 2, 4]); }
    else if (rig === 'gold') { set('g_frog', 1, [0, 2]); }
    if (ok && rig !== 'fs') { /* fs 也走 stops */ }
    rigQueue = null;
    if (ok) { spinResult.stops = stops; spinResult.rigged = rig; }
    rig = '';  // 一次性
    return spinResult;
  }

  function spinRound(fs) {
    return new Promise(function (resolve) {
      if (S.credits < bet() && !fs) { toast('余额不足，请补币'); A.play('error'); resolve(false); return; }
      busy = true; phaseSpin = true; lastWin = 0;
      if (!fs) {
        S.credits = r2(S.credits - bet());
        S.stats.bet = r2(S.stats.bet + bet());
        S.stats.spins++;
        L.POT_ORDER.forEach(function (p) { S.jackpots[p] = r2(S.jackpots[p] + bet() * cfg.jackpots[p].grow); });
      } else {
        fsLeft--;
      }
      updateBar(); updatePots(); updateFreeBanner(); updateButtons();
      $('winVal').textContent = fmt(0);
      R.clearHighlight();
      $('reelMsg').classList.remove('show');

      A.play('spinStart');
      A.startLoop('reelSpin');
      R.resetSlam();

      var res = L.spinOnce(strips, { fs: !!fs, tier: tier(), cfg: cfg, rng: Math.random });
      if (rig) res = applyRig(!!fs, res);
      var stops = res.stops;

      R.spinTo(stops, viewsFor(!!fs), {
        turbo: !!cfg.turbo,
        forceStopSignal: R.slamStop.signal,
        onReelStop: function (c) {
          try {
          A.play('reelStop');
          // 金身落桌提示
          var view = viewsFor(!!fs)[c];
          var tierN = tier();
          for (var r = 0; r < 3; r++) {
            var raw = view[(stops[c] + r) % view.length];
            var pot = L.GOLD_POT[L.GOLD_OF[raw] || ''];
            if (raw.indexOf('g_') === 0 && pot && (fs || tierN >= L.POT_TIER[pot])) {
              A.play('goldLand');
              F().sparkAtReel(c, r);
              break;
            }
          }
          } catch (e) { console.warn('onReelStop', e); }
        }
      }).then(function () {
        A.stopLoop('reelSpin');
        A.play('allStop');
        phaseSpin = false;
        updateButtons();
        var grid = L.gridFromStops(strips, stops, { fs: !!fs, tier: tier(), cfg: cfg });
        resolve({ stops: stops, grid: grid, fs: !!fs });
      });
    });
  }

  /* ---------- 结算与演出 ---------- */
  function settle(round) {
    return new Promise(function (resolve) {
      var fs = round.fs, grid = round.grid;
      var ev = L.evalGrid(grid, bet(), cfg, tier(), fs);
      var gh = L.goldHits(grid);
      var bumped = [];
      for (var p in gh) {
        if (gh[p]) {
          S.rails[p] = Math.min(cfg.railNeed[p], S.rails[p] + gh[p]);
          bumped.push(p);
          A.play('railFill');
          if (S.rails[p] >= cfg.railNeed[p]) pendingPicks.push(p);
        }
      }
      if (bumped.length) updatePots(bumped);

      var win = r2(ev.win + ev.scatterPay);
      var winParts = [];

      // 免费局触发/追加
      var fsTriggered = false;
      if (ev.scatterCount >= 3 && !fs) { fsTriggered = true; }
      if (ev.scatterCount >= 3 && fs) { fsLeft += cfg.freeRetrigger; toast('🎉 再中 ' + cfg.freeRetrigger + ' 次免费局！'); A.play('freeTrigger'); updateFreeBanner(); }

      (function present() {
        var chain = Promise.resolve();
        if (win > 0) {
          lastWin = win;
          $('winVal').textContent = fmt(win);
          var x = win / bet();
          var bigLevel = x >= cfg.bigWinTiers[1] ? 2 : x >= cfg.bigWinTiers[0] ? 1 : 0;
          chain = chain.then(function () {
            if (bigLevel > 0) {
              A.duck(bigLevel === 2 ? 3600 : 2400);
              A.play(bigLevel === 2 ? 'winBig' : 'winMid');
              F().coinRain(bigLevel === 2 ? 46 : 26);
              F().bigText(bigLevel === 2 ? '超级大奖!' : '大奖!', { color: '#ffd257' });
              $('bigWinLabel').textContent = bigLevel === 2 ? '超 级 大 奖' : '大 奖';
              $('bigWinOverlay').hidden = false;
              return countUp($('bigWinAmt'), 0, win, bigLevel === 2 ? 2600 : 1700, true).then(function () {
                return skippable(bigLevel === 2 ? 1500 : 1100);
              }).then(function () { $('bigWinOverlay').hidden = true; });
            }
            A.play('winSmall');
            return countUp($('winVal'), 0, win, Math.min(1600, 350 + win / bet() * 60), true);
          });
          // 逐路展示（去重最多 10 条）
          var seen = {}, ways = [];
          ev.ways.forEach(function (w) {
            var k = w.s + 'x' + w.n;
            if (!seen[k]) { seen[k] = 1; ways.push(w); }
          });
          ways = ways.slice(0, 10);
          ways.forEach(function (w) {
            chain = chain.then(function () {
              R.highlight(w.cells, true);
              var cn = { ingot: '元宝碗', dragon: '金龙', turtle: '金龟', frog: '金蟾', koi: '金鱼' }[w.s] || w.s;
              var msg = $('reelMsg');
              msg.textContent = cn + ' ×' + w.n + '  ' + fmt(w.amt);
              msg.classList.add('show');
              A.play('wayWin');
              F().sparkCells(w.cells);
              return skippable(cfg.turbo ? 380 : 750).then(function () {
                R.highlight(w.cells, false);
                msg.classList.remove('show');
              });
            });
          });
        }
        if (fsTriggered) {
          chain = chain.then(function () {
            A.duck(2600);
            A.play('freeTrigger');
            F().bigText('免费局!', { color: '#ffe9b0', sub: cfg.freeSpins + ' 次' });
            fsActive = true; fsLeft = cfg.freeSpins; fsWinAcc = 0;
            S.stats.fs++;
            updateFreeBanner();
            return delay(1400);
          });
        }
        chain.then(function () { resolve({ win: win, ev: ev }); });
      })();
    });
  }

  /* ---------- 选奖（官方口径：12 金币，结果预定，翻币是演出） ---------- */
  function runPick() {
    return new Promise(function (resolve) {
      var won = L.pickWon(cfg, Math.random);            // 命运已定
      var coins = L.pickPlan(cfg, won, Math.random);    // 12 币布局：中奖池×4 + 其余各×2 + 福×2
      var cnt = { mini: 0, minor: 0, major: 0, grand: 0 };
      var gotEl = $('pickGot'), gridEl = $('pickGrid');
      gotEl.innerHTML = '';
      ['mini', 'minor', 'major', 'grand'].forEach(function (p) {
        var sp = document.createElement('span');
        sp.id = 'pickGot-' + p;
        sp.textContent = L.POT_CN[p] + ' 0/3';
        gotEl.appendChild(sp);
      });
      gridEl.innerHTML = '';
      var coinEls = coins.map(function (pot) {
        var b = document.createElement('button');
        b.className = 'pcoin ' + pot;
        var faceName = pot === 'fu' ? '福' : L.POT_CN[pot];
        var faceEn = pot === 'fu' ? 'FU' : pot.toUpperCase();
        b.innerHTML = '<span class="back"><img src="' + DF.ART.coin() + '" style="width:100%;height:100%"></span>' +
          '<span class="face"><span class="pf-name">' + faceName + '</span><span class="pf-val">' + faceEn + '</span></span>';
        b._pot = pot; b._open = false;
        gridEl.appendChild(b);
        return b;
      });
      $('pickTitle').textContent = '福 娃 选 奖';
      $('pickSub').textContent = '翻开金币 · 集齐 3 枚相同奖名即中该奖池';
      $('pickBonus').hidden = false;
      A.duck(4000);
      A.play('freeTrigger');

      var wonPot = null, idleT = 0, done = false;
      function reveal(b, byUser) {
        if (b._open || done) return;
        b._open = true;
        b.classList.add('open');
        A.play('pickReveal');
        if (cnt[b._pot] !== undefined) {
          cnt[b._pot]++;
          var g = $('pickGot-' + b._pot);
          g.textContent = L.POT_CN[b._pot] + ' ' + Math.min(cnt[b._pot], 3) + '/3';
          g.classList.add('live');
          if (cnt[b._pot] >= 3 && !wonPot) {
            wonPot = b._pot;
            b.classList.add('win');
            finish();
            return;
          }
        }
        if (byUser) {
          var r = b.getBoundingClientRect();
          F().spark(r.left + r.width / 2, r.top + r.height / 2, '#ffd257', 10);
        }
      }
      function finish() {
        done = true;
        clearTimeout(idleT);
        coinEls.forEach(function (b, i) {
          setTimeout(function () {
            if (!b._open) { b._open = true; b.classList.add('open'); }
            b.classList.add('done');
          }, 300 + i * 80);
        });
        setTimeout(function () {
          A.play('pickMatch');
          var amt = S.jackpots[wonPot];
          showJackpotWin(wonPot, amt).then(function () {
            S.credits = r2(S.credits + amt);
            S.stats.win = r2(S.stats.win + amt);
            S.stats.picks++;
            S.jackpots[wonPot] = cfg.jackpots[wonPot].seed;
            // 清零中奖池轨道 + 本批已满轨道
            L.POT_ORDER.forEach(function (p) {
              if (p === wonPot || S.rails[p] >= cfg.railNeed[p]) S.rails[p] = 0;
            });
            pendingPicks = [];
            updateBar(); updatePots();
            $('pickBonus').hidden = true;
            saveState();
            resolve(wonPot);
          });
        }, 300 + coins.length * 80 + 300);
      }
      gridEl.addEventListener('click', function (e) {
        var b = e.target.closest('.pcoin');
        if (!b || b._open || done) return;
        A.play('button');
        reveal(b, true);
      });
      // 20s 无操作自动翻
      (function armIdle() {
        clearTimeout(idleT);
        idleT = setTimeout(function () {
          var rest = coinEls.filter(function (b) { return !b._open && !done; });
          if (rest.length) { reveal(rest[(Math.random() * rest.length) | 0], false); armIdle(); }
        }, 20000);
      })();
    });
  }

  function showJackpotWin(pot, amt) {
    return new Promise(function (res) {
      A.play('jackpot');
      F().coinRain(60);
      F().bigText(L.POT_CN[pot] + '!', { color: '#ffe08a' });
      $('bigWinLabel').textContent = L.POT_CN[pot];
      $('bigWinOverlay').hidden = false;
      countUp($('bigWinAmt'), 0, amt, 2400, true).then(function () {
        return skippable(1600);
      }).then(function () {
        $('bigWinOverlay').hidden = true;
        res();
      });
    });
  }

  /* ---------- 回合编排 ---------- */
  async function playRound(fs) {
    var round = await spinRound(fs);
    if (!round) return false;                       // 余额不足
    var out = await settle(round);
    var win = out.win;

    if (fs) {
      fsWinAcc = r2(fsWinAcc + win);
      S.stats.win = r2(S.stats.win + win);
      S.credits = r2(S.credits + win);
      S.stats.maxWin = Math.max(S.stats.maxWin, win);
      updateBar(); updateFreeBanner();
    } else {
      lastWin = win;
      S.stats.win = r2(S.stats.win + win);
      S.credits = r2(S.credits + win);
      S.stats.maxWin = Math.max(S.stats.maxWin, win);
      updateBar();
    }

    // 免费局循环
    if (fsActive) {
      if (fsLeft > 0) {
        saveState();
        await delay(cfg.turbo ? 350 : 800);
        return playRound(true);
      }
      // 免费局结束
      fsActive = false;
      updateFreeBanner();
      A.play('winMid');
      F().bigText('免费局结束', { color: '#ffe9b0', sub: '共赢 ' + fmt(fsWinAcc) });
      await delay(1600);
    }

    // 选奖（轨道满）
    while (pendingPicks.length) {
      var p = pendingPicks[0];
      await runPick();
      await delay(500);
    }

    // 大奖自动停
    if (autoLeft > 0 && cfg.autoStopBigWin && win >= bet() * cfg.bigWinTiers[0]) {
      autoLeft = 0;
      toast('已按设置停止自动');
    }

    saveState();
    busy = false;
    updateButtons(); updateBar();
    return true;
  }

  function autoNext() {
    if (autoLeft <= 0) return;
    if (S.credits < bet()) { autoLeft = 0; toast('余额不足，自动停止'); updateButtons(); return; }
    if (autoLeft !== Infinity) autoLeft--;
    updateButtons();
    setTimeout(function () { if (!busy && autoLeft >= 0) playRound(false).then(function (ok) { if (ok) autoNext(); }); },
      cfg.turbo ? 350 : 750);
  }

  function startSpin() {
    if (busy) {
      if (phaseSpin) { R.slamStop(); }
      return;
    }
    if (fsActive) return;
    A.unlock();
    playRound(false);
  }

  /* ---------- 菜单 / 赔付表 / 统计 ---------- */
  function renderStats() {
    var g = $('statGrid');
    var st = S.stats;
    var rtp = st.bet > 0 ? (st.win / st.bet * 100).toFixed(1) + '%' : '—';
    g.innerHTML =
      '<div class="st"><label>余额</label><b>' + fmt(S.credits) + '</b></div>' +
      '<div class="st"><label>总旋转</label><b>' + st.spins + '</b></div>' +
      '<div class="st"><label>总押注</label><b>' + fmt(st.bet) + '</b></div>' +
      '<div class="st"><label>总赢分</label><b>' + fmt(st.win) + '</b></div>' +
      '<div class="st"><label>最大单赢</label><b>' + fmt(st.maxWin) + '</b></div>' +
      '<div class="st"><label>实际回报</label><b>' + rtp + '</b></div>' +
      '<div class="st"><label>选奖次数</label><b>' + st.picks + '</b></div>' +
      '<div class="st"><label>免费局触发</label><b>' + st.fs + '</b></div>';
  }

  var SYM_CN = { ingot: '元宝碗', dragon: '金龙', turtle: '金龟', frog: '金蟾', koi: '金鱼', gong: '金锣', wild: '福WILD', A: 'A', K: 'K', Q: 'Q', J: 'J', '10': '10' };
  function renderPaytable() {
    var b = $('paytableBody');
    var rows = L.PREM.concat(L.LOW).map(function (s) {
      var p = L.PAYS[s], img = resolveSrc(s);
      return '<tr><td><img src="' + img + '"> ' + SYM_CN[s] + '</td><td>' + p[3] + '</td><td>' + p[4] + '</td><td>' + p[5] + '</td></tr>';
    }).join('');
    var goldRows = L.PREM.filter(function (s) { return L.GOLD_POT[s]; }).map(function (s) {
      var p = L.GOLD_POT[s];
      return '<tr class="gold-row"><td><img src="' + resolveSrc('g_' + s) + '"> 金' + SYM_CN[s] + '</td><td colspan="3">填充「' + L.POT_CN[p] + '」轨道 ' +
        cfg.railNeed[p] + ' 格 → 福娃选奖</td></tr>';
    }).join('');
    b.innerHTML =
      '<table class="pay-table"><tr><th>符号（每路赢分 = 赔付 × 押注 ÷ ' + cfg.payDivisor + '）</th><th>3连</th><th>4连</th><th>5连</th></tr>' + rows + '</table>' +
      '<table class="pay-table" style="margin-top:10px"><tr><th>金身符号（押注档位解锁）</th><th colspan="3">奖池轨道</th></tr>' + goldRows + '</table>' +
      '<div class="rules">' +
      '<h3>243 路</h3>5 轮 3 行全 ways 玩法：符号从<b>最左轮</b>起在相邻轮出现即连成路，任意行位组合各算一路。' +
      '<h3>福 WILD</h3><img src="' + resolveSrc('wild') + '" style="width:22px;vertical-align:middle"> 福字万能符只出现在 <b>2/3/4 轮</b>，替代除金锣外任意符号，帮你连成更多路。' +
      '<h3>押注档与金身</h3>押注 5 档（' + cfg.betTiers.join('/') + '）：档1 开金蟾、档2 +金鱼、档3 +金龟、档4 +金元宝、档5 全开且所有中奖 <b>×' + cfg.tier5Boost + '</b>。金身落桌为其奖池轨道 +1。' +
      '<h3>四大奖池 · 福娃选奖</h3>任一轨道填满 → 进入选奖：<b>12 枚金币</b>盖置翻牌，集齐 3 枚相同奖名即中该奖池（多福巨奖 <b>' + fmt(S.jackpots.grand) + '</b> 起）。中奖池回落到起点，其余轨道保留。' +
      '<h3>免费局</h3>任意位置 <b>3 个金锣</b> → ' + cfg.freeSpins + ' 次免费局（按触发押注计）；免费局剔除 ' + cfg.fsRemove.join('/') + ' 低符、金身按押注档开启；再中 3 锣 +' + cfg.freeRetrigger + ' 次。' +
      '<h3>大奖演出</h3>单轮赢分 ≥ <b>' + cfg.bigWinTiers[0] + '×</b> 押注中大奖，≥ <b>' + cfg.bigWinTiers[1] + '×</b> 中超级大奖。' +
      '</div>';
    var sideRows = L.PREM.concat(['gong']).slice(0, 6).map(function (s) {
      var p = L.PAYS[s] || { 3: '—', 4: '—', 5: '—' };
      return '<div class="ps-row"><img src="' + resolveSrc(s) + '">' + SYM_CN[s] +
        '<span class="ps-pays">' + p[3] + '/' + p[4] + '/' + p[5] + '</span></div>';
    }).join('');
    $('paySide').innerHTML = sideRows;
    $('paySideL').innerHTML = sideRows;
  }

  /* ---------- 押注 / 自动 / 加速 ---------- */
  function changeBet(d) {
    if (busy || fsActive) { toast('旋转中不能改押注'); A.play('error'); return; }
    var ni = S.betIdx + d;
    if (ni < 0 || ni >= cfg.betTiers.length) { A.play('error'); return; }
    S.betIdx = ni;
    A.play(d > 0 ? 'betUp' : 'betDown');
    updateBar(); updateDots(); updateButtons(); renderPaytable(); saveState();
  }
  function setAuto(n) {
    if (n > 0 && S.credits < bet()) { toast('余额不足，请先补币'); A.play('error'); return; }
    autoLeft = n;
    $('autoModal').hidden = true;
    updateButtons();
    if (autoLeft > 0 && !busy && !fsActive) {
      if (autoLeft !== Infinity) autoLeft--;
      playRound(false).then(function (ok) { if (ok) autoNext(); });
    }
  }

  /* ---------- 弹层 ---------- */
  function openModal(id) { $(id).hidden = false; A.play('button'); }
  document.addEventListener('click', function (e) {
    var x = e.target.closest('[data-close]');
    if (x) { $(x.dataset.close).hidden = true; A.play('button'); }
  });

  function buildAutoList() {
    var list = $('autoList');
    list.innerHTML = '';
    [10, 25, 50, 100, Infinity, 0].forEach(function (n) {
      var b = document.createElement('button');
      b.className = 'mitem';
      b.innerHTML = n === 0 ? '<span class="ic">⏹</span>停止自动' :
        '<span class="ic">⟳</span>自动 ' + (n === Infinity ? '∞（直到手动停）' : n + ' 次');
      b.addEventListener('click', function () { setAuto(n); });
      list.appendChild(b);
    });
    $('autoNote').innerHTML = '自动旋转中遇到<b>免费局/选奖</b>会先演完再停；大奖自动停可在「游戏配置 → 玩法」关闭。';
  }

  /* ---------- 配置面板回调 ---------- */
  function applyAudioCfg() {
    A.setMasterVolume(cfg.sound ? cfg.vols.master : 0);
    A.setBGMVolume(cfg.vols.bgm);
    A.setSFXVolume(cfg.vols.sfx);
    A.applyOverrides(cfg.sounds || {});
  }
  function onCfgChange(newCfg) {
    cfg = deepMerge(L.defaultCfg(), newCfg);
    saveCfg();
    applyAudioCfg();
    R.setResolver(resolveSrc);
    if (S.betIdx >= cfg.betTiers.length) S.betIdx = cfg.betTiers.length - 1;
    buildStrips();
    var fs = fsActive;
    if (!busy) R.setViews(viewsFor(fs), null);
    updateBar(); updateDots(); updatePots(); updateButtons(); renderPaytable(); renderStats();
    toast('配置已生效');
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $('btnSpin').addEventListener('click', startSpin);
    $('btnBetDown').addEventListener('click', function () { A.unlock(); changeBet(-1); });
    $('btnBetUp').addEventListener('click', function () { A.unlock(); changeBet(1); });
    $('btnTurbo').addEventListener('click', function () {
      cfg.turbo = !cfg.turbo; A.play('button'); updateButtons(); saveCfg();
    });
    $('btnAuto').addEventListener('click', function () {
      A.unlock(); A.play('button');
      if (autoLeft > 0) { setAuto(0); } else { openModal('autoModal'); }
    });
    $('btnSound').addEventListener('click', function () {
      cfg.sound = !cfg.sound; applyAudioCfg(); updateButtons(); saveCfg();
      if (cfg.sound) { A.unlock(); A.startLoop('bgm'); toast('声音开'); } else toast('声音关');
    });
    $('btnMenu').addEventListener('click', function () { renderStats(); openModal('menuModal'); });
    $('miPaytable').addEventListener('click', function () { renderPaytable(); openModal('paytableModal'); });
    $('miConfig').addEventListener('click', function () {
      $('menuModal').hidden = true;
      DF.CONFIG_PANEL.open();
    });
    $('miRefill').addEventListener('click', function () {
      S.credits = r2(S.credits + 10000);
      A.play('refill'); F().coinRain(18);
      updateBar(); renderStats(); saveState();
      toast('已补充 10,000，玩得开心！');
    });
    $('miResetRun').addEventListener('click', function () {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(CFG_KEY);
      location.replace(location.pathname + '?fresh=' + Date.now());
    });
    $('autoModal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
    $('bigWinOverlay').addEventListener('click', function () { this.hidden = true; });
    $('bigWinOverlay').addEventListener('pointerdown', function () {
      var el = $('bigWinAmt'); if (el._skip) el._skip();
    });

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space') { e.preventDefault(); startSpin(); }
      else if (e.code === 'ArrowUp') changeBet(1);
      else if (e.code === 'ArrowDown') changeBet(-1);
    });

    // 首次手势：解锁音频 + BGM
    var once = function () {
      A.unlock();
      if (cfg.sound) A.startLoop('bgm');
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('keydown', once);
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('keydown', once);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveState();
    });
    window.addEventListener('beforeunload', saveState);
    window.addEventListener('pagehide', saveState);
  }

  /* ---------- 侧赔付表 / 顶屏 ---------- */
  function buildTop() {
    $('logoBox').innerHTML = '<img src="' + DF.ART.logo() + '" alt="多福巨奖" style="width:100%;height:100%">';
    $('mainScreen').insertAdjacentHTML('afterbegin',
      '<img id="mainBg" src="' + DF.ART.bgMain() + '" alt="">');
    $('topScreen').insertAdjacentHTML('afterbegin',
      '<img id="topBg" src="' + DF.ART.bgTop() + '" alt="">');
  }

  /* ---------- 测试钩子 ---------- */
  function exposeTestHooks() {
    window.__df = {
      version: '1.0',
      get state() { return S; },
      get cfg() { return cfg; },
      get fs() { return { active: fsActive, left: fsLeft, acc: fsWinAcc }; },
      get busy() { return busy; },
      get pendingPicks() { return pendingPicks.slice(); },
      grid: function () {
        // 当前落定网格
        var out = [];
        for (var c = 0; c < 5; c++) {
          var col = [];
          for (var r = 0; r < 3; r++) {
            var cell = R.cellAt(c, r);
            col.push(cell ? (cell.querySelector('img').dataset.raw || '?') : '?');
          }
          out.push(col);
        }
        return out;
      },
      spin: function () { startSpin(); },
      rig: function (name) { rig = name; },
      setCredits: function (v) { S.credits = r2(v); updateBar(); saveState(); },
      fillRail: function (pot, n) {
        S.rails[pot] = n == null ? cfg.railNeed[pot] : n;
        if (S.rails[pot] >= cfg.railNeed[pot] && pendingPicks.indexOf(pot) < 0) pendingPicks.push(pot);
        updatePots();
      },
      setAuto: setAuto, save: saveState,
      fmt: fmt
    };
  }

  /* ---------- 启动 ---------- */
  function boot() {
    S = loadState() || freshState();
    offlineDrift();

    buildTop();
    R.mount($('reelBox'));
    R.setResolver(resolveSrc);
    buildStrips();
    R.setViews(viewBase, null);
    layoutTopRails();

    if (DF.FX && DF.FX.init) {
      DF.FX.init($('fxLayer'));
      DF.FX.sparkCells = function (cells) {
      cells.forEach(function (p) {
        var el = R.cellAt(p.c, p.r);
        if (!el) return;
        var b = el.getBoundingClientRect();
        F().spark(b.left + b.width / 2, b.top + b.height / 2, '#ffd257', 8);
      });
    };
      DF.FX.sparkAtReel = function (c, r) { DF.FX.sparkCells([{ c: c, r: r }]); };
    }
    applyAudioCfg();
    if (QS.get('muted') === '1') { cfg.sound = false; applyAudioCfg(); }

    if (DF.CONFIG_PANEL) {
      DF.CONFIG_PANEL.mount($('configMount'));
      DF.CONFIG_PANEL.onChange(onCfgChange);
    }

    updateBar(); updateDots(); updatePots(); updateButtons(); updateFreeBanner();
    renderPaytable(); buildAutoList(); renderStats();
    bindEvents();
    exposeTestHooks();

    if (QS.get('bet')) {
      var idx = cfg.betTiers.indexOf(+QS.get('bet'));
      if (idx >= 0) { S.betIdx = idx; updateBar(); updateDots(); }
    }
    if (QS.get('auto')) setAuto(+QS.get('auto') || 0);

    setTimeout(function () {
      if (!localStorage.getItem(STATE_KEY)) toast('欢迎光临！已赠送 ' + fmt(S.credits) + ' 开始游戏');
      else toast('已恢复上次进度');
    }, 400);
  }

  function layoutTopRails() { updatePots(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { boot: boot };
})();
