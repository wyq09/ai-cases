/* main.js — 启动接线：存档加载/URL参数/调试钩子/演示循环 */
window.TF = window.TF || {};
TF.main = (function () {
  'use strict';
  const $ = id => document.getElementById(id);

  function q(k) {
    const m = location.search.match(new RegExp('[?&]' + k + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function boot() {
    TF.LOGIC.PROFILE.load();
    try { if (TF.CFG && TF.CFG.all) TF.CFG.all(); } catch (e) {}

    TF.UI.bind();
    TF.GAME.bindInput();
    TF.GAME.resize();
    TF.GAME.startLoop();

    // 配置实时生效
    try {
      if (TF.CFG && TF.CFG.onChange) TF.CFG.onChange(function (cfg) {
        if (TF.SFX && TF.SFX.setVol) TF.SFX.setVol(cfg.bgmVol, cfg.sfxVol);
      });
    } catch (e) {}

    // URL 参数
    if (q('muted') && TF.SFX && TF.SFX.muted) TF.SFX.muted(true);
    if (q('god')) TF.GAME.setGod(true);
    const demo = q('demo');
    if (demo) { TF.GAME.setDemo(true); TF.UI.setDemo(true); }

    const lv = parseInt(q('level') || '', 10);
    const bootTo = q('boot');
    if (lv >= 1) {
      TF.UI.show('game');
      TF.GAME.start(lv);
    } else if (bootTo === 'hangar' || bootTo === 'levels') {
      TF.UI.show(bootTo);
    } else {
      TF.UI.show('title');
    }

    // 演示模式自动续局
    setInterval(function () {
      if (!TF.GAME.state.demo) return;
      const G = TF.GAME.state;
      if (G.paused) return;
      if (!G.on && G.result) {
        if (!G._demoNextAt) G._demoNextAt = Date.now() + (G.phase === 'over' ? 6000 : 4500);
        else if (Date.now() > G._demoNextAt) {
          G._demoNextAt = 0;
          TF.GAME.start(G.phase === 'over' ? G.level : G.level + 1);
          document.querySelectorAll('.dlg.on').forEach(d => d.classList.remove('on'));
        }
      }
    }, 800);

    // 调试钩子
    window.__tf = {
      v: '1.0',
      get state() { return TF.GAME.state; },
      get profile() { return TF.LOGIC.PROFILE.get(); },
      get cfg() { return TF.CFG ? TF.CFG.all() : null; },
      start: function (n) { TF.UI.show('game'); TF.GAME.start(n || 1); },
      boss: function () { TF.GAME.forceBoss(); },
      power: function (v) { TF.GAME.setPower(v); },
      selfTest: function () { return TF.LOGIC.selfTest(); },
    };

    // 版本水印
    console.log('%c雷霆战机 TF-01', 'color:#35e0c8;font-weight:bold', '单文件 · 程序化资产');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { boot };
})();
