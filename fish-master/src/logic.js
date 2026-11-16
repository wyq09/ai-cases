/* 捕鱼达人 · 纯逻辑（可在 node 中直接单测，无 DOM / THREE 依赖） */
(function (root) {
  'use strict';
  var cfg = (root.FM && root.FM.CONFIG) || {
    comboSteps: [0, 2, 4, 7, 11],
    comboMults: [1, 1.2, 1.5, 2, 3],
    bombMax: 100,
    bombPerCatch: 14
  };
  var species = cfg.species || null;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* 按 rarity 权重抽鱼种；rng 可注入，返回 key */
  function pickSpecies(rng) {
    rng = rng || Math.random;
    var table = species || (root.FM && root.FM.CONFIG && root.FM.CONFIG.species) || {};
    var keys = Object.keys(table);
    if (!keys.length) return 'clown';
    var total = 0, i;
    for (i = 0; i < keys.length; i++) total += Math.max(0, table[keys[i]].rarity || 0);
    if (total <= 0) return keys[0];
    var r = clamp(rng(), 0, 0.9999999) * total;
    for (i = 0; i < keys.length; i++) {
      r -= Math.max(0, table[keys[i]].rarity || 0);
      if (r < 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  /* 捕捞成功率：功率 >= 鱼体重必中，否则线性衰减并有下限 */
  function catchChance(power, weight) {
    power = Number(power) || 1;
    weight = Number(weight) || 1;
    if (power >= weight) return 1;
    return clamp(0.25 + 0.75 * (power / weight), 0, 0.95);
  }

  function resolveCatch(power, fish, rng) {
    rng = rng || Math.random;
    var weight = (fish && (fish.weight || (fish.spec && fish.spec.weight))) || 1;
    return rng() < catchChance(power, weight);
  }

  function comboMultiplier(streak) {
    var steps = cfg.comboSteps || [0, 2, 4, 7, 11];
    var mults = cfg.comboMults || [1, 1.2, 1.5, 2, 3];
    var idx = 0;
    for (var i = 0; i < steps.length; i++) if (streak >= steps[i]) idx = i;
    return mults[idx];
  }

  function coinsFor(value, mult) {
    return Math.max(0, Math.round((Number(value) || 0) * (Number(mult) || 1)));
  }

  function bombCharge(cur) {
    return Math.min(cfg.bombMax, (Number(cur) || 0) + cfg.bombPerCatch);
  }

  var api = {
    clamp: clamp,
    pickSpecies: pickSpecies,
    catchChance: catchChance,
    resolveCatch: resolveCatch,
    comboMultiplier: comboMultiplier,
    coinsFor: coinsFor,
    bombCharge: bombCharge
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FM = root.FM || {};
  root.FM.LOGIC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
