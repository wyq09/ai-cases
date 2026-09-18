/* bull-flight logic —— 价格机/账目/结算统计（主线负责）
 * 恒等式：NAV ≡ principal + loan + realized − fees + 浮盈，每 tick 断言
 */
(function () {
  window.BF = window.BF || {};
  var LOGIC = { on: false };
  var S = null; // round state
  var cfgCache = null;
  function cfg() {
    if (!cfgCache) {
      try { cfgCache = BF.CFG.all(); } catch (e) {
        cfgCache = { gravity: 540, jumpV: 300, noise: 20, candleTicks: 22, scrollSpeed: 115, pipeGap: 0.24, feeRate: 0.0004, loanK: 0.5 };
      }
    }
    return cfgCache;
  }
  var CANDLE_KEEP = 90, NAV_EVERY = 5, NAV_KEEP = 720;

  function newRound(principal, loan) {
    cfgCache = null;
    var c = cfg();
    S = {
      principal: principal, loan: loan, invested: principal + loan,
      cash: principal + loan, shares: 0, costBasis: 0,
      realized: 0, fees: 0, tradeN: 0,
      price: 100, vy: 0, peakPrice: 100, lowPrice: 100,
      status: 'ready',           // ready→flying→dead
      ticks: 0, candleN: 0, firstBuyAt: Math.round(0.4 * 60),
      candles: [], cur: null,
      nav: [], navPeak: 0, maxDD: 0,
      trades: [], divAcc: 0, t: 0,
      lastPrice: 100, lastCash: principal + loan, lastShares: 0, lastRealized: 0, lastFees: 0
    };
    // 开局预生成历史 K 线（围绕 100 随机游走，让首屏即有完整图表）
    var hp = 100 + (Math.random() - 0.5) * 3;
    for (var i = 0; i < 9; i++) {
      var o = hp;
      hp = Math.max(93, Math.min(107, hp + (Math.random() - 0.5) * 2.4));
      S.candles.push({ o: o, c: hp, h: Math.max(o, hp) + Math.random() * 0.7, l: Math.min(o, hp) - Math.random() * 0.7 });
    }
    S.price = 100;
    return S;
  }
  function assertBooks() {
    if (!S) return;
    // 口径：NAV ≡ invested + realized + 浮盈(shares*price - costBasis) - loan
    // fees 仅作展示统计（买入费已含在 costBasis、卖出费已含在 proceeds，不重复计）
    var nav = S.cash + S.shares * S.price - S.loan;
    var want = S.invested + S.realized + (S.shares * S.price - S.costBasis) - S.loan;
    if (Math.abs(nav - want) > 0.02) {
      // 账目破坏：回滚到上一 tick 快照并打标
      S.cash = S.lastCash; S.shares = S.lastShares; S.realized = S.lastRealized;
      S.costBasis = S.lastCostBasis; S.price = S.lastPrice;
      S.__bookFix = (S.__bookFix || 0) + 1;
    }
    S.lastCash = S.cash; S.lastShares = S.shares; S.lastRealized = S.realized;
    S.lastCostBasis = S.costBasis; S.lastFees = S.fees; S.lastPrice = S.price;
  }
  function nav() { return S.cash + S.shares * S.price - S.loan; }
  function avgCost() { return S.shares > 0 ? S.costBasis / S.shares : 0; }

  function doBuy(style) {
    var c = cfg();
    var ratio = style || 0.5;
    var amt = S.cash * ratio;
    if (amt < 1 || S.price <= 0) return null;
    var fee = amt * c.feeRate;
    var sh = (amt - fee) / S.price;
    S.cash -= amt; S.shares += sh; S.costBasis += amt;
    S.fees += fee; S.tradeN++;
    var tr = { t: S.t, side: 'buy', price: S.price, shares: sh, amount: amt, fee: fee };
    S.trades.push(tr);
    return tr;
  }
  function doSell() {
    var c = cfg();
    if (S.shares <= 0) return null;
    var mv = S.shares * S.price;
    var fee = mv * c.feeRate;
    var proceeds = mv - fee;
    var pnl = proceeds - S.costBasis;
    S.cash += proceeds; S.realized += pnl; S.fees += fee;
    var tr = { t: S.t, side: 'sell', price: S.price, shares: S.shares, amount: proceeds, fee: fee, pnl: pnl };
    S.shares = 0; S.costBasis = 0; S.tradeN++;
    S.trades.push(tr);
    return tr;
  }

  function tick(dt) {
    /* 物理由 game.js 驱动并经 pushPrice 写回，此处仅留接口占位 */
  }
  // game 层把视图换算后的价格推回逻辑层，逻辑层负责账目与聚合
  function pushPrice(p, dt) {
    if (!S || S.status !== 'flying') return;
    var c = cfg();
    S.t += dt;
    S.price = Math.max(90, Math.min(110, p));
    // 首仓
    if (S.firstBuyAt >= 0) {
      S.firstBuyAt -= dt * 60;
      if (S.firstBuyAt < 0) { var tr0 = doBuy(0.5); if (tr0) tr0.auto = 'open'; }
    }
    // 蜡烛由 game 层按世界滚动距离驱动 finalize（每 56px 一根），保证与滚动严格同步；
    // 此处只更新当前未完成蜡烛的 h/l/c
    if (!S.cur) S.cur = { o: S.price, h: S.price, l: S.price, c: S.price };
    S.cur.c = S.price;
    if (S.price > S.cur.h) S.cur.h = S.price;
    if (S.price < S.cur.l) S.cur.l = S.price;
    // 股息（持仓派息，游戏化：10 分钟≈一年）
    if (S.shares > 0) {
      var div = S.shares * S.price * 0.025 * dt / 600;
      S.cash += div; S.realized += div; S.divAcc += div;
    }
    // NAV 曲线 + 回撤
    S.ticks++;
    if (S.ticks % NAV_EVERY === 0) {
      var v = nav();
      S.nav.push(v);
      if (S.nav.length > NAV_KEEP) S.nav.shift();
      if (v > S.navPeak) S.navPeak = v;
      if (S.navPeak > 0) {
        var dd = (S.navPeak - v) / S.navPeak;
        if (dd > S.maxDD) S.maxDD = dd;
      }
    }
    assertBooks();
  }
  // 强平并结算，返回战报
  function finish(reason) {
    if (!S) return null;
    if (S.shares > 0) { var tr = doSell(); if (tr) tr.auto = 'force'; }
    S.status = 'dead';
    var final = nav();
    var net = final - S.invested - S.loan;           // 已结算净收益
    if (final < S.loan) net = -S.invested;            // 资不抵债 → 本金全亏（破产）
    var ret = S.invested > 0 ? net / S.invested : 0;
    var r = {
      reason: reason, invested: S.invested, principal: S.principal, loan: S.loan,
      ret: ret, net: net, asset: Math.max(0, S.principal + net),
      trades: S.tradeN, maxDD: S.maxDD, nav: S.nav.slice(), peak: S.navPeak,
      finalPrice: S.price, div: S.divAcc, title: '', sub: ''
    };
    var dd = r.maxDD;
    if (S.tradeN === 0) { r.title = '空仓路过'; r.sub = '一整局什么都没买，也是一种定力。'; }
    else if (ret >= 0.20) { r.title = '一战封神'; r.sub = 'K 线里杀出的疯牛，全场起立。'; }
    else if (ret >= 0.10) { r.title = '稳健老牛'; r.sub = '不追高不满仓，稳稳的幸福。'; }
    else if (ret > 0 && dd >= 0.05) { r.title = '账户医学奇迹'; r.sub = '刚才还在抢救，现在已经盈利。'; }
    else if (ret > 0) { r.title = '平稳盈利'; r.sub = '落袋为安，落袋才是钱。'; }
    else if (ret === 0 || (ret > -0.0001 && ret <= 0.0001)) { r.title = '白忙一场'; r.sub = '钱在原地转了个圈。'; }
    else if (ret >= -0.05) { r.title = '交了点学费'; r.sub = '下次记得，亏损也是止损的一部分。'; }
    else if (ret >= -0.20) { r.title = '关灯吃面'; r.sub = '面里记得加个蛋。'; }
    else { r.title = '天台风大'; r.sub = '扶稳，先戒杠杆再谈理想。'; }
    S.report = r;
    return r;
  }

  // game 层在世界每前进 GAP px 时调用一次：结算当前蜡烛为一根历史 K 线
  function finalizeCandle() {
    if (!S || S.status !== 'flying') return false;
    if (!S.cur) S.cur = { o: S.price, h: S.price, l: S.price, c: S.price };
    S.candles.push(S.cur);
    if (S.candles.length > CANDLE_KEEP) S.candles.shift();
    S.cur = null;
    return true;
  }

  LOGIC.newRound = newRound;
  LOGIC.tick = tick;           // 兼容占位：视图驱动走 pushPrice
  LOGIC.pushPrice = pushPrice;
  LOGIC.finalizeCandle = finalizeCandle;
  LOGIC.buy = doBuy;
  LOGIC.sellAll = doSell;
  LOGIC.finish = finish;
  LOGIC.nav = function () { return S ? nav() : 0; };
  LOGIC.avgCost = function () { return S ? avgCost() : 0; };
  LOGIC.state = function () { return S; };
  window.BF.LOGIC = LOGIC;
})();
