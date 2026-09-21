/* core.js — 命名空间 / URL 参数 / 配置存储 / 进度存档 / 工具（主线负责） */
(function () {
  'use strict';
  var GP;
  if (typeof window !== 'undefined') GP = window.GP = window.GP || {};
  else GP = global.GP = global.GP || {};
  var HAS_LS = false;
  try { HAS_LS = typeof localStorage !== 'undefined'; } catch (e) { HAS_LS = false; }

  /* ---------- URL 参数 ---------- */
  var Q = {};
  (function () {
    if (typeof location === 'undefined') return;
    var s = location.search.replace(/^\?/, '');
    if (!s) return;
    var parts = s.split('&');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var kv = parts[i].split('=');
      Q[decodeURIComponent(kv[0])] = kv[1] === undefined ? true : decodeURIComponent(kv[1]);
    }
  })();
  GP.Q = Q;

  /* ---------- 基础工具 ---------- */
  GP.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  GP.lerp = function (a, b, t) { return a + (b - a) * t; };
  GP.TAU = Math.PI * 2;

  /* mulberry32 可注入随机源：关卡生成 / 掉球抖动共用 */
  GP.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* 可缺模块软引用：方法调用安全兜底，永不抛错 */
  GP.soft = function (name) {
    var m = GP[name];
    if (m) return m;
    var fn = function () { return undefined; };
    return new Proxy(fn, {
      get: function (t, k) {
        if (k === '__isSoft') return true;
        if (k === 'then') return undefined;
        return fn;
      },
      apply: function () { return undefined; }
    });
  };

  /* ---------- 配置存储（唯一事实：主线路径不依赖 config-panel 也能跑） ---------- */
  var CFG_KEY = 'gp_cfg_v1';
  var CFG_DEF = {
    gravity: 1500,
    dropInterval: 90,          /* 发射球串间隔 ms */
    ballR: 11,
    startBalls: 20,
    maxBalls: 80,
    addBallAmount: 10,
    addBallBaseCost: 100,
    addBallCostStep: 50,
    addBallFreeAmount: 5,
    freeCooldown: 30,
    bombRadius: 130,
    bombPower: 6,
    glassDuration: 6,
    glassTimeScale: 0.45,
    restWall: 0.72,
    restBumper: 0.88,
    restFloor: 0.55,
    restBall: 0.4,
    bumperKick: 150,
    sfxVolume: 0.8,
    muted: false,
    autoCollect: false,
    icons: { bomb: '', hourglass: '' },
    sounds: {}
  };
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mergeInto(base, src, root) {
    if (!isObj(src)) return base;
    var ks = Object.keys(src);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (root && !Object.prototype.hasOwnProperty.call(base, k)) continue;
      var b = base[k], s = src[k];
      if (s === undefined) continue;
      if (isObj(b) && isObj(s)) mergeInto(b, s, false);
      else base[k] = s;
    }
    return base;
  }
  var cfgCur = (function () {
    var d = clone(CFG_DEF);
    if (Q.reset) return d;
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) mergeInto(d, JSON.parse(raw), true);
    } catch (e) { /* 损坏配置按默认 */ }
    return d;
  })();
  var cfgCbs = [];
  function cfgPersist() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfgCur)); } catch (e) {} }
  GP.CFG = {
    KEY: CFG_KEY,
    def: function () { return clone(CFG_DEF); },
    all: function () { return cfgCur; },
    onChange: function (cb) {
      if (typeof cb === 'function') cfgCbs.push(cb);
      return function () { var i = cfgCbs.indexOf(cb); if (i >= 0) cfgCbs.splice(i, 1); };
    },
    apply: function (snap) {
      cfgCur = mergeInto(clone(CFG_DEF), snap, true);
      cfgPersist();
      var out = clone(cfgCur);
      for (var i = 0; i < cfgCbs.length; i++) { try { cfgCbs[i](out); } catch (e) {} }
      return clone(cfgCur);
    },
    exportJSON: function () { return JSON.stringify(cfgCur, null, 2); },
    importJSON: function (str) {
      var o = JSON.parse(str);
      if (!isObj(o)) throw new Error('配置必须为 JSON 对象');
      return GP.CFG.apply(o);
    }
  };

  /* ---------- 进度存档 ---------- */
  var SAVE_KEY = 'gp_state_v1';
  function defState() {
    return {
      v: 1, level: 1, score: 0, balls: 20, bombs: 2, glasses: 1,
      best: 0, addBallUses: 0, tutDone: false, swallows: 0, pops: 0
    };
  }
  var stCur = null;
  GP.SAVE = {
    KEY: SAVE_KEY,
    def: defState,
    load: function () {
      var d = defState();
      if (!Q.reset) {
        try {
          var raw = localStorage.getItem(SAVE_KEY);
          if (raw) {
            var o = JSON.parse(raw);
            if (isObj(o)) {
              for (var k in d) {
                if (o[k] !== undefined && typeof o[k] === typeof d[k]) d[k] = o[k];
              }
            }
          }
        } catch (e) { /* 损坏档按新档 */ }
      }
      if (Q.level !== undefined) { var n = parseInt(Q.level, 10); if (n > 0) d.level = n; }
      if (Q.balls !== undefined) { var b = parseInt(Q.balls, 10); if (b >= 0) d.balls = b; }
      stCur = d;
      return d;
    },
    get: function () { return stCur || GP.SAVE.load(); },
    save: function () {
      if (!stCur) return;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(stCur)); } catch (e) {}
    }
  };

  /* ---------- 调试参数覆盖（?muted=1 等） ---------- */
  if (Q.muted) cfgCur.muted = true;
})();
