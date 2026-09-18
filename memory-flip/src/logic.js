/* ===== 翻牌赢好礼 · logic.js —— 常量/纯函数/配置默认值（主线） ===== */
window.MF = window.MF || {};
MF.LOGIC = (() => {
  const LS_CFG = 'mf_config_v1', LS_ST = 'mf_state_v1';

  // ?reset=1 清档：必须发生在任何模块读 localStorage 之前（本文件是构建链第一个模块）
  const Q = new URLSearchParams(location.search);
  if (Q.get('reset') === '1') {
    try { localStorage.removeItem(LS_CFG); localStorage.removeItem(LS_ST); } catch (e) {}
  }

  const ICONS = [
    { id: 'ingot',    name: '金元宝' },
    { id: 'hongbao',  name: '红包' },
    { id: 'coupon',   name: '优惠券' },
    { id: 'gift',     name: '礼盒' },
    { id: 'koi',      name: '锦鲤' },
    { id: 'cat',      name: '招财猫' },
    { id: 'crown',    name: '王冠' },
    { id: 'gem',      name: '宝石' },
    { id: 'firework', name: '礼花' },
    { id: 'coin',     name: '铜钱' },
  ];
  const ICON_NAME = {}; ICONS.forEach(i => { ICON_NAME[i.id] = i.name; });

  // 列 x 行；pairs ≤ ICONS.length
  const GRIDS = {
    '4x3': { cols: 4, rows: 3, pairs: 6,  label: '轻松' },
    '4x4': { cols: 4, rows: 4, pairs: 8,  label: '标准' },
    '5x4': { cols: 5, rows: 4, pairs: 10, label: '挑战' },
  };

  function defaultCfg() {
    return {
      grid: '4x4',
      timeLimit: 90,
      peekSec: 2,
      comboOn: true,
      baseScore: 100,
      timeBonus: 10,
      dailyLimit: 0,
      vols: { bgm: 0.4, sfx: 0.9, master: 1 },
      icons: {},
      sounds: {},
    };
  }

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!patch || typeof patch !== 'object') return out;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      const b = base ? base[k] : undefined;
      if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
        out[k] = deepMerge(b, v);
      } else if (v !== undefined) {
        out[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
      }
    }
    return out;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 发牌：取前 pairs 种图标，每种两张，洗成面朝下的一叠
  function dealPairs(gridKey, rng) {
    const g = GRIDS[gridKey] || GRIDS['4x4'];
    const ids = shuffle(ICONS.map(i => i.id), rng).slice(0, g.pairs);
    return shuffle(ids.concat(ids), rng);
  }

  // combo 为第几对连续配对（1 起）；封顶 ×4
  function comboMult(combo, comboOn) {
    if (!comboOn) return 1;
    return clamp(combo, 1, 4);
  }
  function pairScore(base, combo, comboOn) { return base * comboMult(combo, comboOn); }

  function stars(pairs, moves) {
    const acc = pairs / Math.max(moves, 1);
    return acc >= 0.66 ? 3 : acc >= 0.45 ? 2 : 1;
  }

  const p2 = n => String(n).padStart(2, '0');

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? m + '分' + p2(s) + '秒' : s + '秒';
  }

  return { LS_CFG, LS_ST, Q, ICONS, ICON_NAME, GRIDS, defaultCfg, deepMerge, clamp, shuffle, dealPairs, comboMult, pairScore, stars, today, fmtTime };
})();
