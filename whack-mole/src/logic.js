window.WM = window.WM || {};
(() => {
  // ?reset=1 清档：必须发生在任何模块读 localStorage 之前
  try {
    if (new URLSearchParams(location.search).get('reset') === '1') {
      localStorage.removeItem('wm_config_v1');
      localStorage.removeItem('wm_state_v1');
    }
  } catch (e) {}

  const LS_CFG = 'wm_config_v1';
  const LS_ST = 'wm_state_v1';

  // 地鼠表：score 为 baseScore=100 时的基准分，实际分 = LOGIC.moleScore(id, cfg)
  const MOLES = {
    normal: { name: '地鼠',   ratio: 1,    whackable: true },
    gold:   { name: '金地鼠', ratio: 3,    whackable: true },
    gift:   { name: '礼盒鼠', ratio: 1.5,  whackable: true },
    bomb:   { name: '炸弹鼠', ratio: -2,   whackable: false }
  };

  // 难度表：节奏（ms）/ 权重 / 奖线（勿改，运行参数只在 game 层抖动）
  const DIFFS = {
    easy:   { name: '悠闲', popUp: 1150, gap: 900, maxUp: 2,
              weights: { normal: 1, gold: 0.10, gift: 0.08, bomb: 0 },
              tiers: { bronze: 1500, silver: 3000, gold: 5000 } },
    normal: { name: '标准', popUp: 900, gap: 640, maxUp: 3,
              weights: { normal: 1, gold: 0.10, gift: 0.08, bomb: 0.12 },
              tiers: { bronze: 2500, silver: 5000, gold: 8000 } },
    hard:   { name: '疯狂', popUp: 620, gap: 400, maxUp: 4,
              weights: { normal: 1, gold: 0.12, gift: 0.08, bomb: 0.16 },
              tiers: { bronze: 4000, silver: 7500, gold: 12000 } }
  };

  const DEFAULT_CFG = {
    diff: 'normal',
    timeLimit: 60,
    frenzySec: 4,
    comboOn: true,
    baseScore: 100,
    dailyLimit: 0,
    vols: { bgm: 0.4, sfx: 0.9, master: 1 },
    moles: {},
    sounds: {},
    marketing: {
      title: '欢乐打地鼠',
      subtitle: '游园会 · 赢好礼',
      rules: '限时敲鼠得分，连击翻倍；敲中礼盒鼠集奖品并触发狂热时刻；小心炸弹鼠！按评级领对应好礼。',
      prizes: [
        { tier: 'gold',   name: '游园大奖', prefix: 'WMJ' },
        { tier: 'silver', name: '幸运好礼', prefix: 'WMY' },
        { tier: 'bronze', name: '参与奖',   prefix: 'WMC' }
      ],
      supportUrl: ''
    }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!patch || typeof patch !== 'object') return out;
    for (const k in patch) {
      const v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && base[k] && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], v);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = deepMerge({}, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // 权重选种：weights 如 {normal:1, gold:.1, ...}；frenzy 时 gold 权重 ×3
  function pickMole(weights, frenzy, rng) {
    const rand = rng || Math.random;
    const w = {};
    let sum = 0;
    for (const k in weights) {
      const v = (frenzy && k === 'gold') ? weights[k] * 3 : weights[k];
      if (v > 0) { w[k] = v; sum += v; }
    }
    if (sum <= 0) return 'normal';
    let r = rand() * sum;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return Object.keys(w).pop();
  }

  // 连击倍率：1-2→×1，3-5→×2，6-9→×3，≥10→×4；关闭时恒 ×1
  function comboMult(combo, on) {
    if (!on) return 1;
    if (combo >= 10) return 4;
    if (combo >= 6) return 3;
    if (combo >= 3) return 2;
    return 1;
  }

  function moleScore(id, cfg) {
    const m = MOLES[id];
    if (!m) return 0;
    return Math.round((cfg && cfg.baseScore || 100) * m.ratio);
  }

  // 评级：≥金线→gold，≥银线→silver，否则 bronze
  function tier(score, diffKey) {
    const t = (DIFFS[diffKey] || DIFFS.normal).tiers;
    if (score >= t.gold) return 'gold';
    if (score >= t.silver) return 'silver';
    return 'bronze';
  }
  const TIER_NAME = { gold: '金牌', silver: '银牌', bronze: '铜牌' };

  // 演示券码：前缀-XXXX-XXXX（去易混淆字符）
  function genCode(prefix, rng) {
    const rand = rng || Math.random;
    const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const seg = n => Array.from({ length: n }, () => CH[Math.floor(rand() * CH.length)]).join('');
    return (prefix || 'WM') + '-' + seg(4) + '-' + seg(4);
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  window.WM.LOGIC = {
    LS_CFG, LS_ST, MOLES, DIFFS, DEFAULT_CFG, TIER_NAME,
    clamp, deepMerge, loadJSON, saveJSON,
    pickMole, comboMult, moleScore, tier, genCode, today
  };
})();
