/* 填成语 — 配置与存档（?key 必须在本模块最先处理，先于任何 localStorage 读取） */
(function () {
  'use strict';
  var KEYS = { cfg: 'cy_cfg_v2', state: 'cy_state_v2', custom: 'cy_custom_v2' };
  try {
    if (typeof location !== 'undefined' && location.search.indexOf('reset=1') >= 0) {
      Object.keys(KEYS).forEach(function (k) { localStorage.removeItem(KEYS[k]); });
      if (history && history.replaceState) {
        history.replaceState(null, '', location.pathname + location.hash);
      }
    }
  } catch (e) { /* 隐私模式等 */ }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function deepMerge(base, extra) {
    var out = clone(base);
    if (!isObj(extra)) return out;
    Object.keys(extra).forEach(function (k) {
      if (isObj(extra[k]) && isObj(out[k])) out[k] = deepMerge(out[k], extra[k]);
      else if (extra[k] !== undefined) out[k] = clone(extra[k]);
    });
    return out;
  }
  function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function clamp(v, lo, hi, dft) {
    v = Number(v);
    if (!isFinite(v)) return dft;
    return Math.min(hi, Math.max(lo, v));
  }

  var DEFAULTS = {
    level: { startWords: 4, growthEvery: 2, maxWords: 14, givenRatio: 0.30, givenDecay: 0.008, attempts: 5, maxSpan: 9 },
    rewards: { milestones: [1, 3, 14], amounts: [120, 120, 240], completeCoins: 0 },
    props: { hintCost: 80, reviveCost: 150, reviveAttempts: 3 },
    audio: { master: 0.9, sfx: 0.8, bgm: 0.25, muted: false },
    motion: { reduced: false },
    bank: { source: 'builtin' }
  };

  /* 校验+钳制：非法数组整体回退默认；数值钳制进合法区间 */
  function sanitize(raw) {
    var c = deepMerge(DEFAULTS, raw);
    c.level.startWords = Math.round(clamp(c.level.startWords, 3, 8, 4));
    c.level.growthEvery = Math.round(clamp(c.level.growthEvery, 1, 5, 2));
    c.level.maxWords = Math.round(clamp(c.level.maxWords, 4, 16, 14));
    if (c.level.maxWords < c.level.startWords) c.level.maxWords = c.level.startWords;
    c.level.givenRatio = clamp(c.level.givenRatio, 0, 0.6, 0.3);
    c.level.givenDecay = clamp(c.level.givenDecay, 0, 0.03, 0.008);
    c.level.attempts = Math.round(clamp(c.level.attempts, 1, 20, 5));
    c.level.maxSpan = Math.round(clamp(c.level.maxSpan, 6, 12, 9));
    c.rewards.completeCoins = Math.round(clamp(c.rewards.completeCoins, 0, 999, 0));
    c.props.hintCost = Math.round(clamp(c.props.hintCost, 0, 9999, 80));
    c.props.reviveCost = Math.round(clamp(c.props.reviveCost, 0, 9999, 150));
    c.props.reviveAttempts = Math.round(clamp(c.props.reviveAttempts, 1, 20, 3));
    ['master', 'sfx', 'bgm'].forEach(function (k) {
      c.audio[k] = clamp(c.audio[k], 0, 1, DEFAULTS.audio[k]);
    });
    c.audio.muted = !!c.audio.muted;
    c.motion.reduced = !!c.motion.reduced;
    function fixList(arr, dft) {
      if (!Array.isArray(arr) || !arr.length) return dft;
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var v = Number(arr[i]);
        if (!isFinite(v) || v <= 0) return dft;
        out.push(Math.round(v));
      }
      for (var j = 1; j < out.length; j++) if (out[j] <= out[j - 1]) return dft;
      if (out[out.length - 1] > 999) return dft;
      return out;
    }
    var ms = fixList(c.rewards.milestones, DEFAULTS.rewards.milestones);
    var am = fixList(c.rewards.amounts, DEFAULTS.rewards.amounts);
    if (ms.length !== am.length) { ms = DEFAULTS.rewards.milestones; am = DEFAULTS.rewards.amounts; }
    am = am.map(function (v) { return Math.round(clamp(v, 0, 9999, 0)); });
    c.rewards.milestones = ms; c.rewards.amounts = am;
    if (typeof c.bank.source !== 'string' || !c.bank.source) c.bank.source = 'builtin';
    return c;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEYS.cfg);
      return raw ? sanitize(JSON.parse(raw)) : clone(DEFAULTS);
    } catch (e) { return clone(DEFAULTS); }
  }

  var listeners = [];
  var cfg = load();
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.CY = root.CY || {};

  function save() {
    try { localStorage.setItem(KEYS.cfg, JSON.stringify(cfg)); } catch (e) { }
  }
  function notify() {
    var snapshot = clone(cfg);
    listeners.forEach(function (cb) {
      try { cb(snapshot); } catch (e) { console.error(e); }
    });
  }

  root.CY.config = {
    KEYS: KEYS,
    defaults: function () { return clone(DEFAULTS); },
    get: function () { return clone(cfg); },
    set: function (patch) {
      var next = sanitize(deepMerge(cfg, patch));
      var changed = !deepEqual(next, cfg);
      cfg = next;
      if (changed) { save(); notify(); }
      return clone(cfg);
    },
    onChange: function (cb) {
      listeners.push(cb);
      return function () {
        var i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    export: function () {
      var st = null, cu = [];
      try { st = JSON.parse(localStorage.getItem(KEYS.state) || 'null'); } catch (e) { }
      try { cu = JSON.parse(localStorage.getItem(KEYS.custom) || '[]'); } catch (e) { }
      return JSON.stringify({ v: 2, cfg: cfg, state: st, custom: cu });
    },
    importJson: function (str) {
      try {
        var data = JSON.parse(str);
        if (!isObj(data)) return false;
        if (isObj(data.cfg)) { cfg = sanitize(deepMerge(DEFAULTS, data.cfg)); save(); }
        try {
          if (isObj(data.state)) localStorage.setItem(KEYS.state, JSON.stringify(data.state));
          if (Array.isArray(data.custom)) localStorage.setItem(KEYS.custom, JSON.stringify(data.custom));
        } catch (e) { }
        notify();
        return true;
      } catch (e) { return false; }
    },
    resetAll: function () {
      Object.keys(KEYS).forEach(function (k) {
        try { localStorage.removeItem(KEYS[k]); } catch (e) { }
      });
      if (typeof location !== 'undefined') location.reload();
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CY.config;
})();
