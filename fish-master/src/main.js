/* 捕鱼达人 · 启动引导（最先处理 URL 参数，再装载） */
(function () {
  'use strict';
  window.FM = window.FM || {};

  var q = {};
  location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
    var p = kv.split('=');
    if (!p[0]) return;
    q[decodeURIComponent(p[0])] = p[1] === undefined ? true : decodeURIComponent(p[1]);
  });

  // 清档必须在任何模块读 localStorage 之前
  if (q.reset) {
    try { localStorage.removeItem('fm_deep_sea_v1'); } catch (e) {}
  }

  window.__errs = [];
  window.addEventListener('error', function (e) {
    window.__errs.push(String(e.message || e) + ' @ ' + (e.lineno || '?'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errs.push('REJ ' + String(e.reason && e.reason.stack || e.reason));
  });

  function boot() {
    var host = document.getElementById('canvas-host');
    var scene = new window.FM.Scene(host);
    window.__fm = {
      version: '1.0',
      scene: scene,
      get state() { return game.state; },
      get coins() { return game.coins; },
      get score() { return game.score; },
      get streak() { return game.streak; },
      get bomb() { return game.bomb; },
      get power() { return game.power; },
      get timeLeft() { return game.timeLeft; },
      get fishCount() { return scene.fish.length; },
      get nets() { return scene.nets.length; },
      get errs() { return window.__errs.slice(); },
      start: function () { game.start(); },
      pause: function (v) { game.pause(v); },
      restart: function () { game.restart(); },
      setCoins: function (v) { game.coins = Number(v) || 0; game.syncUI(); },
      setTime: function (v) { game.timeLeft = Math.max(0, Number(v) || 0); },
      fillBomb: function () { game.bomb = window.FM.CONFIG.bombMax; game.syncUI(); },
      setPower: function (p) { game.setPower(p); },
      fireAt: function (x, y, p) {
        if (p) game.setPower(p);
        scene.setAim(x, y);
        game.fireTimer = 0;
        return game.fire();
      },
      spawn: function (key, x, y, dir) { return scene.spawnFish(key, { x: x, y: y, dir: dir }); },
      clearFish: function () { scene.clearFish(); },
      bombNow: function () { return game.useBomb(); },
      getFish: function () {
        return scene.fish.map(function (f) {
          return { key: f.key, x: f.x, y: f.y, z: f.z, dir: f.dir, alive: f.alive };
        });
      },
      finish: function () { game.finish(); }
    };
    var game = new window.FM.Game(scene);
    window.__fm.game = game;
    if (q.muted) game.setMuted(true);
    if (q.power) game.setPower(parseInt(q.power, 10) || 1);
    game.run();
    document.documentElement.setAttribute('data-fm-ready', '1');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
