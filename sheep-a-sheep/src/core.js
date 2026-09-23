/* sheep-a-sheep core —— URL参数 / reset清档 / 深合并 / 随机源 / 存储（build 序第一，禁止顶层 const SH） */
window.SH = window.SH || {};
SH.core = (function () {
  'use strict';

  var Q = {};
  var HAS_LOC = typeof location !== 'undefined';
  if (HAS_LOC) {
    location.search.replace(/[?&]([\w-]+)(?:=([^&]*))?/g, function (_, k, v) {
      Q[k] = v === undefined ? '1' : v; return '';
    });
  }

  // ?reset=1 必须在任何 localStorage 读取之前清档
  if (Q.reset === '1') {
    try { localStorage.removeItem('sh_state_v1'); localStorage.removeItem('sh_cfg_v1'); } catch (e) {}
  }

  function isObj(o) { return o && typeof o === 'object' && !(o instanceof Array); }

  function deepMerge(base, over) {
    var out = {};
    for (var k in base) out[k] = isObj(base[k]) ? deepMerge(base[k], {}) : base[k];
    if (!over) return out;
    for (var k2 in over) {
      if (isObj(over[k2]) && isObj(out[k2])) out[k2] = deepMerge(out[k2], over[k2]);
      else out[k2] = over[k2];
    }
    return out;
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

  function levelSeed(n) { return (Math.imul(n, 2654435761) ^ 0x9E3779B9) >>> 0; }

  function loadJSON(k) {
    if (typeof localStorage === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  window.__errs = window.__errs || [];
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });
    window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rej:' + String((e && e.reason) || e)); });
  }

  return {
    Q: Q, deepMerge: deepMerge, mulberry32: mulberry32, levelSeed: levelSeed,
    loadJSON: loadJSON, saveJSON: saveJSON,
    LS_ST: 'sh_state_v1', LS_CFG: 'sh_cfg_v1',
  };
})();
