/* ===== tower-crane core：命名空间 / URL参数 / 存储 / 默认配置 ===== */
window.TC = window.TC || {};
TC.core = (() => {
  // ?reset=1 必须最先执行（先于任何 localStorage 读）
  const Q = {};
  location.search.replace(/^\?/, '').split('&').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) Q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    else if (kv) Q[kv] = '1';
  });
  if (Q.reset === '1') {
    try { localStorage.removeItem('tc_cfg_v1'); localStorage.removeItem('tc_state_v1'); } catch (e) {}
  }

  window.__errs = window.__errs || [];
  window.addEventListener('error', e => window.__errs.push(String(e.message) + ' @ ' + e.lineno));
  window.addEventListener('unhandledrejection', e => window.__errs.push('REJ ' + String(e.reason)));

  const defaultRoomColors = () => ([
    { body: '#ef6a5e', dark: '#c94b41', light: '#ff9285' },
    { body: '#7cdcb4', dark: '#54b78e', light: '#aaf0d2' },
    { body: '#f5a733', dark: '#d1821a', light: '#ffc76e' },
    { body: '#5fb7ef', dark: '#3d8fc9', light: '#96d5fb' },
  ]);

  function defaultCfg() {
    return {
      targetFloors: 40, startLives: 3, maxLives: 5,
      blockW: 120, blockH: 76, cableLen: 150,
      swingAmp: 110, swingPeriod: 2600, ampPerFloor: 1.1, ampMax: 165,
      periodPerFloor: -24, periodMin: 1400,
      gravity: 2400, carryVelocity: false,
      perfectPct: 0.09, greatPct: 0.28, goodPct: 0.55,
      scoreFloor: 10, scoreGreat: 25, scorePerfect: 60, comboStep: 15,
      milestoneEvery: 10, milestoneBonus: 100, milestoneLife: 1,
      camLerp: 0.12, dropSpawnDelay: 350,
      demo: false, muted: false, bgmVolume: 0.35, sfxVolume: 0.9,
      roomColors: defaultRoomColors(),
      icons: { room: '', bg: '', hook: '' },
      sounds: {},
    };
  }

  function deepMerge(base, over) {
    if (Array.isArray(over)) return JSON.parse(JSON.stringify(over));
    if (over && typeof over === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
      const out = Object.assign({}, base);
      for (const k of Object.keys(over)) out[k] = deepMerge(base ? base[k] : undefined, over[k]);
      return out;
    }
    return over === undefined ? base : over;
  }

  function loadCfg() {
    const def = defaultCfg();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('tc_cfg_v1') || 'null'); } catch (e) {}
    const cfg = deepMerge(def, saved || {});
    if (!Array.isArray(cfg.roomColors) || cfg.roomColors.length < 1) cfg.roomColors = defaultRoomColors();
    cfg.icons = Object.assign({ room: '', bg: '', hook: '' }, cfg.icons || {});
    cfg.sounds = cfg.sounds || {};
    if (Q.muted === '1') cfg.muted = true;
    if (Q.demo === '1') cfg.demo = true;
    return cfg;
  }

  function saveCfg(cfg) {
    try { localStorage.setItem('tc_cfg_v1', JSON.stringify(cfg)); } catch (e) {}
  }

  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('tc_state_v1') || 'null'); } catch (e) {}
    return Object.assign({ best: 0, bestFloors: 0, games: 0, run: null }, s || {});
  }
  function saveState(s) {
    try { localStorage.setItem('tc_state_v1', JSON.stringify(s)); } catch (e) {}
  }

  // mulberry32 可注入随机源
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  return { Q, defaultCfg, deepMerge, loadCfg, saveCfg, loadState, saveState, rng, clamp, lerp };
})();
TC.cfg = TC.core.loadCfg();
TC.state = TC.core.loadState();
