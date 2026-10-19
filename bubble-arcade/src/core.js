/* ============================================================
 * 泡泡堂 · src/core.js —— 命名空间 / 工具 / 配置 / 存档
 * 所有模块挂 window.BA，零依赖。
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});

  /* ---------------- 数学 / 随机 ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  // mulberry32：可注入种子的确定性 RNG
  function rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr, r) { return arr[Math.floor((r ? r() : Math.random()) * arr.length)]; }
  function shuffle(arr, r) {
    var rr = r || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rr() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function deepMerge(base, over) {
    var out = clone(base) || {};
    if (!isObj(over)) return out;
    for (var k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      var v = over[k];
      if (isObj(v) && isObj(out[k])) out[k] = deepMerge(out[k], v);
      else if (v !== undefined) out[k] = v;
    }
    return out;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }

  BA.CORE = {
    U: {
      clamp: clamp, lerp: lerp, smooth: smooth, rng: rng, rand: rand, randInt: randInt,
      pick: pick, shuffle: shuffle, clone: clone, isObj: isObj, deepMerge: deepMerge,
      fmtTime: fmtTime, esc: esc, el: el
    }
  };
  var U = BA.CORE.U;

  /* ---------------- 常量 ---------------- */
  BA.PARAMS = {
    W: 15, H: 13, TILE: 64,
    BOARD_W: 960, BOARD_H: 832,
    FUSE: 2.4,
    SPLASH: 0.42,
    SPEED_BASE: 3.4,
    SPEED_MAX: 6.2,
    BOMB_MAX: 8,
    POWER_MAX: 8,
    TRAP_TIME: 3.6,
    TRAP_SELF_RESCUE: 11,      // 自救需要按的次数
    TRAP_TEAM_RESCUE: 0.75,    // 队友贴身救援半径（格）
    KICK_SPEED: 8.5,
    ITEM_TTL: 16,
    CORNER_SLACK: 0.48          // 被挡住时的转角辅助半径（格）
  };

  /* ---------------- 配置 ---------------- */
  var CFG_KEY = 'ba_cfg_v1';
  var CFG_DEF = {
    winsNeeded: 3,
    roundTime: 150,
    fuse: 2.4,
    startBombs: 1,
    startPower: 1,
    itemChance: 0.30,
    suddenDeath: true,
    sfxVolume: 0.8,
    musicVolume: 0.32,
    shake: 1,
    particles: 1,
    showFps: false,
    lastMap: 'garden',
    lastMode: 'ffa',
    lastHumans: 1,
    lastPlayers: 4,
    lastDiff: 'normal'
  };
  var cfg = deepMerge(CFG_DEF, load(CFG_KEY));
  var cfgSubs = [];
  BA.CORE.CFG = {
    get: function () { return cfg; },
    def: function () { return clone(CFG_DEF); },
    save: function () { store(CFG_KEY, cfg); },
    patch: function (p) {
      cfg = deepMerge(cfg, p);
      store(CFG_KEY, cfg);
      for (var i = 0; i < cfgSubs.length; i++) {
        try { cfgSubs[i](cfg); } catch (e) {}
      }
      return cfg;
    },
    reset: function () {
      cfg = clone(CFG_DEF);
      try { localStorage.removeItem(CFG_KEY); } catch (e) {}
      for (var i = 0; i < cfgSubs.length; i++) { try { cfgSubs[i](cfg); } catch (e) {} }
      return cfg;
    },
    on: function (fn) { if (typeof fn === 'function') cfgSubs.push(fn); }
  };

  /* ---------------- 存档（战绩） ---------------- */
  var SAVE_KEY = 'ba_save_v1';
  var SAVE_DEF = {
    stats: { matches: 0, wins: 0, rounds: 0, bombs: 0, blocks: 0, items: 0, rescues: 0, bestStreak: 0, bestRoundTime: 0 },
    streak: 0
  };
  var save = deepMerge(SAVE_DEF, load(SAVE_KEY));
  BA.CORE.SAVE = {
    get: function () { return save; },
    save: function () { store(SAVE_KEY, save); },
    patch: function (p) {
      save = deepMerge(save, p);
      store(SAVE_KEY, save);
      return save;
    },
    bump: function (key, n) {
      if (!save.stats) save.stats = clone(SAVE_DEF.stats);
      save.stats[key] = (save.stats[key] || 0) + (n == null ? 1 : n);
      store(SAVE_KEY, save);
      return save.stats[key];
    },
    reset: function () {
      save = clone(SAVE_DEF);
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return save;
    }
  };
})(window);
