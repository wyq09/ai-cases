/* 鹈鹕骑车 · 启动引导（URL 参数 → 装载 → 测试钩子） */
(function () {
  'use strict';
  window.PM = window.PM || {};

  function boot() {
    var t0 = performance.now();
    PM.UI.loading(0.05, '正在准备');
    var game = new PM.Game();
    var cam = game.camera, v = new window.THREE.Vector3();

    // 测试 / 自动化钩子
    window.__pm = {
      version: '1.0',
      glErrors: function () { var gl = game.renderer.getContext(), e = gl.getError(); return e; },
      game: game,
      get errs() { return window.__errs.slice(); },
      get mode() { return game.mode; },
      get preset() { return game.preset; },
      get timeIdx() { return game.timeIdx; },
      get fps() { return game.fps; },
      get ready() { return true; },
      snapshot: function () { return game.snapshot(); },
      bike: function () { return game.bike.snapshot(); },
      key: function (name, down) { game.keys[name] = !!down; if (down) game.takeControl(); },
      auto: function (on) { game.testManual = !on; game.mode = on ? 'auto' : 'manual'; game.idleLeft = 8; if (on) game.autopilot.reset(); return game.mode; },
      hop: function () { game.hop(); },
      bell: function () { game.bell(); },
      hands: function (on) { if (on === undefined || on !== game.handsToggle) game.toggleHands(); return game.handsToggle; },
      setPreset: function (p) { game.setPreset(p); return game.preset; },
      setTime: function (i) { game.setTime(i); return game.timeIdx; },
      setSlow: function (on) { game.slow = !!on; return game.slow; },
      pause: function (on) { game.paused = !!on; return game.paused; },
      teleport: function (x, z, yaw) { game.bike.reset(x, z, yaw === undefined ? Math.PI / 2 : yaw); game.world.lastCell = null; },
      step: function (sec, input) { return game.step(sec, input); },
      tick: function (dt, n) { game.noRAF = true; for (var i = 0; i < (n || 1); i++) game.tick(dt === undefined ? 1 / 60 : dt); return window.__pm.snapshot(); },
      raf: function (on) { game.noRAF = !on; if (on) { last = performance.now(); } },
      terrain: function (x, z) { return PM.TERRAIN.heightAt(game.field, x, z); },
      plaques: function () { return game.field.plaques.map(function (p) { return { id: p.id, x: p.x, z: p.z, found: p.found, title: p.title }; }); },
      project: function (x, y, z) { v.set(x, y, z).project(cam); return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, z: v.z }; },
      camera: function () { return { x: cam.position.x, y: cam.position.y, z: cam.position.z }; },
      debug: function (n) { game.world.uDebug.value = n; return n; },
      cam: function (az, el, dist, tx, ty, tz) { Object.assign(game.cam, { az: az, el: el, dist: dist, azOff: 0, elOff: 0, distMul: 1 }); if (tx !== undefined) { game.cam.tx = tx; game.cam.ty = ty; game.cam.tz = tz; } game.camLock = true; },
      bootMs: 0
    };
    window.__pm.bootMs = Math.round(performance.now() - t0);

    game.start();
    document.documentElement.setAttribute('data-pm-ready', '1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
