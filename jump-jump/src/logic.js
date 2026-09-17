/* ===== src/logic.js ===== */
/* 跳一跳 —— 核心逻辑：配置、计分、平台生成、物理。主线负责，勿与 art/audio/config-panel 重叠。 */
(function () {
  'use strict';

  var JJ = (window.JJ = window.JJ || {});

  /* ---------------- 配置 ---------------- */

  function defaultCfg() {
    return {
      difficulty: 1,        // 间距/方块尺寸难度倍率
      chargeRate: 0.32,     // 蓄力速度：每 ms 获得的力量
      maxCharge: 1200,      // 蓄力上限（力量单位）
      sound: true,
      showGuide: false,     // 显示落点辅助线（非原版，辅助选项）
      background: '#dededc',
      platformTexture: '',  // 平台顶面贴图 dataURL（可选）
      audio: {},            // 自定义音效 {jump,land,fall,bonus: dataURL}
    };
  }

  var CFG_WHITELIST = {
    difficulty: 'num', chargeRate: 'num', maxCharge: 'num',
    sound: 'bool', showGuide: 'bool', background: 'color',
    platformTexture: 'dataurl', audio: 'audioMap',
  };

  function sanitize(raw) {
    var d = defaultCfg();
    if (!raw || typeof raw !== 'object') return d;
    var out = {};
    Object.keys(CFG_WHITELIST).forEach(function (k) {
      var v = raw[k];
      switch (CFG_WHITELIST[k]) {
        case 'num':
          out[k] = typeof v === 'number' && isFinite(v) ? v : d[k]; break;
        case 'bool':
          out[k] = typeof v === 'boolean' ? v : d[k]; break;
        case 'color':
          out[k] = (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)) ? v : d[k]; break;
        case 'dataurl':
          out[k] = (typeof v === 'string' && (v === '' || v.slice(0, 5) === 'data:')) ? v : d[k];
          if (out[k] && out[k].length > 700000) out[k] = d[k];
          break;
        case 'audioMap':
          out[k] = {};
          ['jump', 'land', 'fall', 'bonus'].forEach(function (n) {
            var s = v && typeof v === 'object' ? v[n] : null;
            if (typeof s === 'string' && s.slice(0, 5) === 'data:' && s.length <= 400000) out[k][n] = s;
          });
          break;
      }
    });
    // 钳制到面板可设范围
    out.difficulty = Math.min(1.35, Math.max(0.75, out.difficulty));
    out.chargeRate = Math.min(0.42, Math.max(0.22, out.chargeRate));
    out.maxCharge = Math.min(2000, Math.max(600, out.maxCharge));
    return out;
  }

  /* ---------------- 计分 ---------------- */
  /* 普通 +1；中心连击 +2,+4,+6,...（复刻设定：等差翻倍序列，常见社区共识） */

  function scoreNormal() { return 1; }

  function comboScore(combo) { // combo = 本次是连续第几次中心（1 起）
    return combo * 2;
  }

  /* 特殊方块：站在顶面停留约 2 秒触发一次（复刻设定，分值取社区共识常见值） */
  var BONUS = {
    record: 30,  // 黑胶唱片
    shop: 15,    // 便利店
    rubik: 10,   // 魔方
    manhole: 5,  // 井盖
  };
  var BONUS_STAY_MS = 2000;

  /* ---------------- 平台生成 ---------------- */
  /* 世界坐标：x/y 水平，z 竖直。下一块沿 +x 或 +y。 */

  var COLORS = ['#f0b5aa', '#a8c6b5', '#e8e3d5', '#f2cf66', '#b9c3d6', '#d9a8c0'];

  var TYPE_WEIGHTS = [
    { type: 'plain', w: 62 },
    { type: 'cylinder', w: 12 },
    { type: 'rubik', w: 7 },
    { type: 'manhole', w: 8 },
    { type: 'shop', w: 6 },
    { type: 'record', w: 5 },
  ];
  var BONUS_TYPES = { rubik: 1, manhole: 1, shop: 1, record: 1 };

  function pickType(rng, score) {
    // 前 3 块必为 plain，避免开局就出特殊
    if (score < 3) return 'plain';
    var total = 0, i;
    for (i = 0; i < TYPE_WEIGHTS.length; i++) total += TYPE_WEIGHTS[i].w;
    var r = rng() * total;
    for (i = 0; i < TYPE_WEIGHTS.length; i++) {
      r -= TYPE_WEIGHTS[i].w;
      if (r <= 0) return TYPE_WEIGHTS[i].type;
    }
    return 'plain';
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 生成一条平台序列（含起点）。distance 为中心距。 */
  function genPlatforms(count, seed, difficulty) {
    var rng = mulberry32(seed >>> 0);
    var list = [];
    var x = 0, y = 0;
    var dir = 1; // 1: +x, 0: +y（首跳固定 +x）
    for (var i = 0; i < count; i++) {
      var t = (i === 0) ? 'plain' : pickType(rng, i);
      var base = 166 + Math.min(i, 60) * 0.65;          // 距离随进度略增
      var dist = (base + rng() * 64) * difficulty; // 约170~300
      var size = 100 - Math.min(24, i * 0.6) - rng() * 8; // 68~100
      if (i > 0) {
        if (i > 1 && rng() < 0.48) dir = 1 - dir;          // 12% 换向
        if (dir === 1) x += dist; else y += dist;
      }
      list.push({
        id: i, x: x, y: y,
        size: Math.round(size),
        height: 42 + Math.round(rng() * 10),
        type: t,
        color: COLORS[i % COLORS.length],
        dir: dir,
      });
    }
    return list;
  }

  /* ---------------- 物理 ---------------- */
  /* 力量 charge(0~maxCharge) → 水平距离 dist = charge * K；滞空为抛物线。 */

  var PHYS = {
    K: 0.9,              // 力量→水平世界距离系数：1200 力 ≈ 1080 世界单位（远超最大间距，上限即失误区）
    AIR_MS: 460,         // 满力量滞空时长基准；短跳按比例缩短
    G: 2400,             // 世界重力（用于起跳后 z 轨迹，影响的是跳跃演出）
  };

  /* 给定力量，返回 {dist, airMs} */
  function chargeToJump(charge, cfg) {
    var c = Math.min(charge, cfg.maxCharge);
    var dist = c * PHYS.K;
    var airMs = PHYS.AIR_MS * (0.55 + 0.45 * (c / cfg.maxCharge));
    return { dist: dist, airMs: airMs };
  }

  /* 落点判定：p = 落点 {x,y}，pl = 平台。返回 'center' | 'edge' | 'miss'。
     中心区：距中心 < size*0.28；边缘区：内接半径内；否则 miss。 */
  function judge(p, pl) {
    var d = Math.sqrt((p.x - pl.x) * (p.x - pl.x) + (p.y - pl.y) * (p.y - pl.y));
    if (d < pl.size * 0.16) return 'center';
    var round = pl.type === 'cylinder' || pl.type === 'record' || pl.type === 'manhole';
    if (round ? d <= pl.size * 0.5 : Math.max(Math.abs(p.x - pl.x), Math.abs(p.y - pl.y)) <= pl.size * 0.5) return 'edge';
    return 'miss';
  }

  JJ.LOGIC = {
    defaultCfg: defaultCfg,
    sanitize: sanitize,
    genPlatforms: genPlatforms,
    chargeToJump: chargeToJump,
    judge: judge,
    scoreNormal: scoreNormal,
    comboScore: comboScore,
    BONUS: BONUS,
    BONUS_STAY_MS: BONUS_STAY_MS,
    COLORS: COLORS,
    PHYS: PHYS,
    mulberry32: mulberry32,
  };
})();
