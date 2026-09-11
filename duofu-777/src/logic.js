/* 多福巨奖 777 — 核心算法：滚轮条 / 243路结算(含福Wild) / 奖池 / 免费局 / 12币选奖 / RTP模拟
   机制对齐官方《多福多財 DUO FU DUO CAI》说明书：押注档 8/18/38/68/88、福Wild 仅 2/3/4 轮、
   3+ 金锣 10 次免费局(+10 追加、剔除低符)、12 金币选奖(结果预定)、四奖池每注注入 0.1%~1%。 */
window.DF = window.DF || {};
DF.LOGIC = (function () {
  'use strict';

  var LOW = ['10', 'J', 'Q', 'K', 'A'];
  var PREM = ['koi', 'frog', 'turtle', 'dragon', 'ingot'];
  var GOLD_POT = { frog: 'mini', koi: 'minor', turtle: 'major', ingot: 'grand' };
  var GOLD_OF = { g_koi: 'koi', g_frog: 'frog', g_turtle: 'turtle', g_ingot: 'ingot' };
  var POT_ORDER = ['grand', 'major', 'minor', 'mini'];
  var POT_CN = { grand: '多福巨奖', major: '多财大奖', minor: '多福中奖', mini: '多福小奖', fu: '福' };
  var POT_TIER = { mini: 1, minor: 2, major: 3, grand: 4 };
  var WILD_REELS = [1, 2, 3];   // 福Wild 仅 2/3/4 轮（0 基）

  // 每路赔付（× 押注 / payDivisor）
  var PAYS = {
    ingot:  { 3: 25, 4: 100, 5: 500 },
    dragon: { 3: 15, 4: 50,  5: 250 },
    turtle: { 3: 10, 4: 30,  5: 150 },
    frog:   { 3: 8,  4: 20,  5: 120 },
    koi:    { 3: 5,  4: 15,  5: 100 },
    A:      { 3: 3,  4: 10,  5: 50 },
    K:      { 3: 3,  4: 8,   5: 40 },
    Q:      { 3: 2,  4: 6,   5: 30 },
    J:      { 3: 2,  4: 5,   5: 25 },
    '10':   { 3: 2,  4: 4,   5: 20 }
  };
  var SCATTER_PAY = { 3: 5, 4: 10, 5: 50 };  // × 押注

  function defaultCfg() {
    return {
      startCredits: 10000,
      betTiers: [8, 18, 38, 68, 88],
      railNeed: { mini: 80, minor: 115, major: 160, grand: 215 },
      pickWeights: { mini: 0.70, minor: 0.22, major: 0.065, grand: 0.015 },  // 选奖预定结果分布
      fsRemove: ['10', 'J', 'Q'],
      freeSpins: 10, freeRetrigger: 10, tier5Boost: 1.2, fsScale: 1.0,
      stripGold: { frog: 1, koi: 1, turtle: 1, ingot: 1 },
      wildPerReel: 1,
      payDivisor: 12, winScale: 1.0, bigWinTiers: [15, 30],
      jackpots: {
        grand: { seed: 38888.88, grow: 0.010 },
        major: { seed: 6888.88,  grow: 0.006 },
        minor: { seed: 688.88,   grow: 0.003 },
        mini:  { seed: 188.88,   grow: 0.0015 }
      },
      vols: { master: 1, bgm: 0.5, sfx: 1 },
      icons: {}, sounds: {},
      turbo: false, autoStopBigWin: true, sound: true
    };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mod(a, n) { return ((a % n) + n) % n; }
  function shuffle(bag, rng) {
    for (var i = bag.length - 1; i > 0; i--) {
      var k = Math.floor((rng || Math.random)() * (i + 1));
      var t = bag[i]; bag[i] = bag[k]; bag[k] = t;
    }
    return bag;
  }

  /* ---------- 滚轮条 ---------- */
  function makeStrips(cfg, seed) {
    cfg = cfg || {};
    var rng = mulberry32(seed || 20260911);
    var strips = [];
    for (var r = 0; r < 5; r++) {
      var bag = [];
      LOW.forEach(function (s) { for (var i = 0; i < 7; i++) bag.push(s); });
      bag.push('koi', 'koi', 'koi', 'koi', 'g_koi');
      bag.push('frog', 'frog', 'frog', 'frog', 'g_frog');
      bag.push('turtle', 'turtle', 'turtle', 'turtle', 'g_turtle');
      bag.push('dragon', 'dragon', 'dragon', 'dragon', 'dragon');
      bag.push('ingot', 'ingot', 'g_ingot');
      bag.push('gong', 'gong');
      for (var w = 0; w < (cfg.wildPerReel || 0); w++) bag.push('wild');   // 仅 2/3/4 轮
      if (WILD_REELS.indexOf(r) < 0) bag.splice(bag.indexOf('wild'), Math.max(0, (cfg.wildPerReel || 0)));
      // Fisher-Yates；金锣间距 <3 重洗（触发率与排列无关）
      for (var tries = 0; tries < 60; tries++) {
        shuffle(bag, rng);
        var pos = [], ok = true;
        for (var x = 0; x < bag.length; x++) if (bag[x] === 'gong') pos.push(x);
        for (var y = 1; y < pos.length; y++) if (pos[y] - pos[y - 1] < 3) { ok = false; break; }
        if (ok && pos.length > 1 && bag.length - pos[pos.length - 1] + pos[0] < 3) ok = false;
        if (ok) break;
      }
      strips.push(bag);
    }
    return strips;
  }

  function stripView(strip, fs, cfg) {
    if (!fs) return strip;
    var rm = (cfg && cfg.fsRemove) || LOW;
    return strip.filter(function (s) { return rm.indexOf(s) < 0; });
  }

  function cellOf(raw, opts) {
    var s = GOLD_OF[raw] || raw;
    var pot = GOLD_POT[s];
    return {
      s: s, gold: !!GOLD_OF[raw] && !!pot && (opts.fs || opts.tier >= POT_TIER[pot]), raw: raw
    };
  }

  function spinOnce(strips, opts) {
    var rng = opts.rng || Math.random;
    var cfg = opts.cfg || {};
    var grid = [], stops = [];
    for (var c = 0; c < 5; c++) {
      var view = stripView(strips[c], opts.fs, cfg);
      var idx = Math.floor(rng() * view.length);
      stops.push(idx);
      var col = [];
      for (var r = 0; r < 3; r++) col.push(cellOf(view[(idx + r) % view.length], opts));
      grid.push(col);
    }
    return { stops: stops, grid: grid };
  }

  function gridFromStops(strips, stops, opts) {
    var cfg = opts.cfg || {};
    var grid = [];
    for (var c = 0; c < 5; c++) {
      var view = stripView(strips[c], opts.fs, cfg);
      var col = [];
      for (var r = 0; r < 3; r++) col.push(cellOf(view[mod(stops[c] + r, view.length)], opts));
      grid.push(col);
    }
    return grid;
  }

  /* ---------- 243 路结算（福Wild 替代，仅出现在 2~4 轮充当替代符） ---------- */
  function evalGrid(grid, bet, cfg, tier, fs) {
    cfg = cfg || {};
    var ways = [], win = 0;
    var scale = (cfg.winScale || 1) * (tier >= 5 ? (cfg.tier5Boost || 1) : 1) * (fs ? (cfg.fsScale || 1) : 1);
    var per = bet / (cfg.payDivisor || 8);
    PREM.concat(LOW).forEach(function (s) {
      // 首轮必须有真符号（Wild 不在第 1 轮，天然锚定，无重复计路）
      var rows0 = [];
      for (var r = 0; r < 3; r++) if (grid[0][r].s === s) rows0.push(r);
      if (!rows0.length) return;
      var n = 1, colRows = [rows0];
      for (var c = 1; c < 5; c++) {
        var rows = [];
        for (r = 0; r < 3; r++) { var cs = grid[c][r].s; if (cs === s || cs === 'wild') rows.push(r); }
        if (!rows.length) break;
        n++; colRows.push(rows);
      }
      if (n >= 3 && PAYS[s] && PAYS[s][n]) {
        var cnt = 1;
        colRows.forEach(function (rr) { cnt *= rr.length; });
        var amt = PAYS[s][n] * per * scale;
        var combos = [[]];
        colRows.forEach(function (rr) {
          var next = [];
          combos.forEach(function (pre) { rr.forEach(function (x) { next.push(pre.concat(x)); }); });
          combos = next;
        });
        combos.forEach(function (path) {
          ways.push({ s: s, n: n, amt: amt, cells: path.map(function (rr, i) { return { c: i, r: rr }; }) });
        });
        win += amt * cnt;
      }
    });
    var sc = 0;
    for (var c2 = 0; c2 < 5; c2++) for (var r2 = 0; r2 < 3; r2++) if (grid[c2][r2].s === 'gong') sc++;
    var scPay = sc >= 3 ? (SCATTER_PAY[Math.min(sc, 5)] || 50) * bet * scale : 0;
    return { ways: ways, win: win, scatterCount: sc, scatterPay: scPay };
  }

  function goldHits(grid) {
    var hits = { mini: 0, minor: 0, major: 0, grand: 0 };
    for (var c = 0; c < 5; c++) for (var r = 0; r < 3; r++) {
      var cell = grid[c][r];
      if (cell.gold && GOLD_POT[cell.s]) hits[GOLD_POT[cell.s]]++;
    }
    return hits;
  }

  /* ---------- 12 金币选奖（官方口径：结果预定，翻币是演出） ---------- */
  // 预定中奖池（按权重）
  function pickWon(cfg, rng) {
    var w = cfg.pickWeights || { mini: 0.68, minor: 0.22, major: 0.08, grand: 0.02 };
    var r = (rng || Math.random)(), acc = 0;
    var keys = ['mini', 'minor', 'major', 'grand'];
    for (var i = 0; i < keys.length; i++) { acc += w[keys[i]]; if (r < acc) return keys[i]; }
    return 'mini';
  }
  // 12 币布局：中奖池×4 + 其余各×2 + 福×2（只有中奖池能凑满 3）
  function pickPlan(cfg, won, rng) {
    var others = ['mini', 'minor', 'major', 'grand'].filter(function (p) { return p !== won; });
    var bag = [won, won, won, won, others[0], others[0], others[1], others[1], others[2], others[2], 'fu', 'fu'];
    return shuffle(bag, rng);
  }
  function pickOutcome(plan, won) { return won; }  // 预定

  /* ---------- RTP 模拟（稳态） ---------- */
  function simulate(nRounds, cfg, seed, onProgress) {
    cfg = cfg || defaultCfg();
    var strips = makeStrips(cfg, seed || 1);
    var rng = mulberry32(seed ? seed + 77 : 99);
    var pots = {}, rails = {};
    POT_ORDER.forEach(function (p) { pots[p] = cfg.jackpots[p].seed; rails[p] = 0; });
    var need = cfg.railNeed;
    var totalBet = 0, totalWin = 0, hits = 0, fsTrig = 0;
    var potAwards = { mini: 0, minor: 0, major: 0, grand: 0 };
    var potAwardAmt = 0, fsWinTotal = 0, baseWinTotal = 0, goldSpins = 0, wildSpins = 0;
    var CHECK = Math.max(1000, Math.floor(nRounds / 20));

    for (var i = 0; i < nRounds; i++) {
      var tier = 1 + Math.floor(rng() * 5);
      var bet = cfg.betTiers[tier - 1];
      totalBet += bet;
      POT_ORDER.forEach(function (p) { pots[p] += bet * cfg.jackpots[p].grow; });

      var sp = spinOnce(strips, { tier: tier, rng: rng, cfg: cfg });
      var ev = evalGrid(sp.grid, bet, cfg, tier, false);
      if (sp.grid.some(function (col) { return col.some(function (cell) { return cell.s === 'wild'; }); })) wildSpins++;
      var gh = goldHits(sp.grid), gAny = false;
      for (var p0 in gh) { rails[p0] = Math.min(need[p0], rails[p0] + gh[p0]); if (gh[p0]) gAny = true; }
      if (gAny) goldSpins++;

      var roundWin = ev.win + ev.scatterPay;
      baseWinTotal += roundWin;

      var fsLeft = ev.scatterCount >= 3 ? cfg.freeSpins : 0;
      var fsWin = 0;
      if (fsLeft) {
        fsTrig++;
        var guard = 0;
        while (fsLeft > 0 && guard++ < 500) {
          fsLeft--;
          var f = spinOnce(strips, { fs: true, tier: tier, rng: rng, cfg: cfg });
          var fe = evalGrid(f.grid, bet, cfg, tier, true);
          var fg = goldHits(f.grid);
          for (var q in fg) rails[q] = Math.min(need[q], rails[q] + fg[q]);
          fsWin += fe.win + fe.scatterPay;
          if (fe.scatterCount >= 3) fsLeft += cfg.freeRetrigger;
        }
      }
      roundWin += fsWin; fsWinTotal += fsWin;

      var pickCount = 0;
      for (;;) {
        var full = POT_ORDER.filter(function (p) { return rails[p] >= need[p]; });
        if (!full.length) break;
        var won = pickWon(cfg, rng);
        potAwards[won]++; potAwardAmt += pots[won];
        roundWin += pots[won];
        pots[won] = cfg.jackpots[won].seed;
        full.forEach(function (p) { rails[p] = 0; });
        if (++pickCount > 3) break;
      }

      totalWin += roundWin;
      if (roundWin > 0) hits++;
      if (onProgress && i % CHECK === 0) onProgress(i, totalWin / totalBet);
    }
    return {
      rtp: totalWin / totalBet, baseRtp: baseWinTotal / totalBet,
      fsRtp: fsWinTotal / totalBet, jackpotRtp: potAwardAmt / totalBet,
      hitRate: hits / nRounds, fsRate: fsTrig / nRounds, goldRate: goldSpins / nRounds,
      wildRate: wildSpins / nRounds,
      pickRate: (potAwards.mini + potAwards.minor + potAwards.major + potAwards.grand) / nRounds,
      potAwards: potAwards, rounds: nRounds
    };
  }

  return {
    LOW: LOW, PREM: PREM, GOLD_POT: GOLD_POT, GOLD_OF: GOLD_OF,
    POT_ORDER: POT_ORDER, POT_CN: POT_CN, POT_TIER: POT_TIER, WILD_REELS: WILD_REELS,
    PAYS: PAYS, SCATTER_PAY: SCATTER_PAY,
    defaultCfg: defaultCfg, makeStrips: makeStrips, stripView: stripView,
    spinOnce: spinOnce, gridFromStops: gridFromStops, evalGrid: evalGrid, goldHits: goldHits,
    pickWon: pickWon, pickPlan: pickPlan, pickOutcome: pickOutcome,
    simulate: simulate, mulberry32: mulberry32
  };
})();
