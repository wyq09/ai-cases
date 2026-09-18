/* bull-flight main —— 装配/URL参数/测试钩子（主线负责）
 * ?reset=1 清档（必须先于任何 localStorage 读取——本文件最先执行）
 */
(function () {
  var Q = {};
  try {
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      Q[decodeURIComponent(p[0])] = p[1] === undefined ? true : decodeURIComponent(p[1]);
    });
  } catch (e) {}
  if (Q.reset) { try { localStorage.removeItem('bf.cfg.v1'); localStorage.removeItem('bf.save.v1'); } catch (e) {} }

  window.BF = window.BF || {};
  window.__errs = window.__errs || [];
  window.onerror = function (m, s, l, c) { __errs.push(String(m).slice(0, 200) + ' @' + (l || '?')); };
  window.onunhandledrejection = function (e) { __errs.push('rej:' + String(e && e.reason).slice(0, 200)); };

  // 模块就绪等待（惰性解析 + 重试；缺失模块走 NOOP 兜底不炸主流程）
  function waitMods(cb) {
    var n = 0;
    var iv = setInterval(function () {
      n++;
      var ok = BF.UI && BF.GAME && BF.LOGIC && BF.CFG;
      if (ok || n > 100) { clearInterval(iv); cb(); }
    }, 60);
  }

  function boot() {
    try { BF.SFX.init(); } catch (e) {}
    if (Q.muted) { try { BF.SFX.setMuted(true); } catch (e) {} }
    try {
      var c = BF.CFG.all();
      if (c.sfx === false || Q.muted) BF.SFX.setMuted(true);
      BF.SFX.bgmOn(c.bgm !== false);
    } catch (e) {}
    BF.UI.bind();
    BF.UI.show('hall');
    if (Q.auto) BF.GAME.setOpts({ auto: true });
    if (Q.fast) BF.GAME.setOpts({ fast: parseFloat(Q.fast) || 1 });
    // 解锁音频 + BGM（首次手势）
    var unlockOnce = function () {
      try { BF.SFX.unlock(); } catch (e) {}
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { waitMods(boot); });
  else waitMods(boot);

  // 测试钩子
  Object.defineProperty(window, '__bf', {
    get: function () {
      return {
        Q: Q,
        errs: __errs,
        CFG: BF.CFG, SFX: BF.SFX, ART: BF.ART, FX: BF.FX,
        GAME: BF.GAME, LOGIC: BF.LOGIC, UI: BF.UI,
        state: BF.LOGIC && BF.LOGIC.state ? BF.LOGIC.state() : null,
        page: BF.UI && BF.UI.page ? BF.UI.page() : null,
        save: BF.UI && BF.UI.save ? BF.UI.save() : null,
        quick: {
          startRound: function (amt, borrow) {
            BF.LOGIC.newRound(amt || 25892, borrow || 0);
            BF.UI.show('game'); BF.GAME.start();
          },
          finish: function () { return BF.LOGIC.finish('manual'); },
          tap: function () { BF.GAME.tap(); },
          books: function () {
            var s = BF.LOGIC.state(); if (!s) return null;
            var nav = s.cash + s.shares * s.price - s.loan;
            var want = s.invested + s.realized + (s.shares * s.price - s.costBasis) - s.loan;
            return { nav: nav, want: want, diff: Math.abs(nav - want), fixes: s.__bookFix || 0 };
          }
        }
      };
    }
  });
})();
