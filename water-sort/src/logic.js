/* 倒水挑战 — 逻辑：RNG / 关卡规格 / 生成（必可解）/ 求解器 / 纯函数操作 */
window.WS = window.WS || {};
WS.LOGIC = (() => {
  const LS_ST = 'ws_state_v1';
  const LS_CFG = 'ws_cfg_v1';

  const DEFAULT_CFG = {
    capacity: 4,      // 每瓶容量 3|4|5
    empties: 2,       // 空瓶数 1|2
    maxColors: 10,    // 色数上限 4..10
    addBottle: 1,     // 每关可加空瓶次数 0..2
    animSpeed: 1,     // 动画速度倍率 0.5..2
    hintOn: true,     // 提示按钮
    room: 'warm',     // 房间色板 warm|mint|dusk
    liquidSet: 'classic', // 水色板 classic|candy|ocean
    bgmVol: 0.4,
    sfxVol: 0.9,
  };

  // ---------- RNG ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const levelSeed = n => (Math.imul(n, 2654435761) ^ 0x9E3779B9) >>> 0;

  // ---------- 关卡规格 ----------
  // 颜色数：1,2关→3；3,4关→4；5,6关→5 …… 封顶 maxColors(≤10)；封顶后每第 7 关降 3 色作喘息关
  function specForLevel(n, cfg) {
    const cap = Math.max(3, Math.min(5, cfg.capacity || 4));
    let K = Math.min(3 + Math.floor((n - 1) / 2), Math.max(3, Math.min(10, cfg.maxColors || 10)));
    if (n > 20 && n % 7 === 0) K = Math.max(4, K - 3);
    const E = Math.max(1, Math.min(2, cfg.empties || 2));
    return { K, E, cap, bottles: K + E };
  }

  // ---------- 瓶操作（瓶 = 色id数组，底→顶） ----------
  function topRun(b) {
    if (!b.length) return null;
    const color = b[b.length - 1];
    let n = 0;
    for (let i = b.length - 1; i >= 0 && b[i] === color; i--) n++;
    return { color, n };
  }
  const isComplete = (b, cap) => b.length === cap && topRun(b).n === cap;
  function isWin(bottles, cap) {
    for (const b of bottles) if (b.length && !isComplete(b, cap)) return false;
    return true;
  }
  function completedColors(bottles, cap) {
    let k = 0;
    for (const b of bottles) if (isComplete(b, cap)) k++;
    return k;
  }
  // 可倒格数（0=不可）
  function canPour(src, dst, cap) {
    if (!src.length || isComplete(src, cap)) return 0;
    const r = topRun(src);
    if (!dst.length) return r.n === src.length ? 0 : Math.min(r.n, cap); // 纯色整瓶倒空瓶=无意义
    if (dst.length >= cap || dst[dst.length - 1] !== r.color) return 0;
    return Math.min(r.n, cap - dst.length);
  }
  // 纯函数：返回新瓶数组
  function applyPour(bottles, from, to, cap) {
    const nb = bottles.map(b => b.slice());
    const n = canPour(nb[from], nb[to], cap);
    if (!n) return null;
    const color = nb[from][nb[from].length - 1];
    for (let i = 0; i < n; i++) { nb[from].pop(); nb[to].push(color); }
    return { bottles: nb, n, color };
  }

  // ---------- 求解器：DFS + 访问集 + 剪枝 ----------
  // 返回步序 [{from,to,n}] 或 null（null=不可解/超节点上限）
  function solve(bottles, cap, maxNodes = 30000) {
    const seen = new Set();
    let nodes = 0;
    const path = [];
    const runCache = bottles.map(b => topRun(b));

    const key = bs => bs.map(b => b.join('.')).sort().join('|');

    function dfs(bs, runs) {
      if (isWin(bs, cap)) return true;
      if (++nodes > maxNodes) return false;
      const k = key(bs);
      if (seen.has(k)) return false;
      seen.add(k);
      // 候选走法按启发式排序：并满一瓶 > 并入同色 > 大段优先 > 腾空源瓶
      const cands = [];
      for (let i = 0; i < bs.length; i++) {
        const s = bs[i];
        if (!s.length || isComplete(s, cap)) continue;
        const r = runs[i];
        for (let j = 0; j < bs.length; j++) {
          if (i === j) continue;
          const d = bs[j];
          if (!d.length) {
            if (r.n === s.length) continue; // 纯色→空瓶无意义
          } else {
            if (d.length >= cap || d[d.length - 1] !== r.color) continue;
          }
          const n = Math.min(r.n, cap - d.length);
          let score = n * 2;
          if (d.length) score += 40;                                   // 并入同色瓶
          if (d.length + n === cap && d.length) score += 100;          // 并满一瓶
          if (n === s.length) score += 25;                             // 源瓶腾空
          cands.push({ i, j, n, score });
        }
      }
      cands.sort((a, b) => b.score - a.score);
      for (const c of cands) {
        const { i, j, n } = c;
        const s = bs[i], d = bs[j], r = runs[i];
        for (let t = 0; t < n; t++) { s.pop(); d.push(r.color); }
        runs[i] = topRun(s); runs[j] = topRun(d);
        path.push({ from: i, to: j, n });
        if (dfs(bs, runs)) return true;
        path.pop();
        for (let t = 0; t < n; t++) { d.pop(); s.push(r.color); }
        runs[i] = r; runs[j] = topRun(d);
      }
      return false;
    }
    const bs = bottles.map(b => b.slice());
    const runs = bs.map(b => topRun(b));
    return dfs(bs, runs) ? path.slice() : null;
  }
  // 提示：当前局面最优下一手（不可解返回 null）
  const hintMove = (bottles, cap) => {
    const sol = solve(bottles, cap);
    return sol && sol.length ? sol[0] : null;
  };

  // ---------- 关卡生成（必可解 + 开局无现成纯色瓶） ----------
  function genLevel(n, cfg) {
    const { K, E, cap } = specForLevel(n, cfg);
    const base = levelSeed(n);
    const total = K * cap;
    for (let attempt = 0; attempt < 60; attempt++) {
      const seed = (base + attempt * 7919) >>> 0;
      const rng = mulberry32(seed);
      const units = [];
      for (let c = 0; c < K; c++) for (let i = 0; i < cap; i++) units.push(c);
      for (let i = total - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = units[i]; units[i] = units[j]; units[j] = t;
      }
      let ok = true;
      const bottles = [];
      for (let c = 0; c < K; c++) {
        const b = units.slice(c * cap, (c + 1) * cap);
        if (isComplete(b, cap)) { ok = false; break; }
        bottles.push(b);
      }
      if (!ok) continue;
      for (let e = 0; e < E; e++) bottles.push([]);
      if (solve(bottles, cap)) return { bottles, K, E, cap, seed };
    }
    // 兜底（几乎不可能走到）：从已解状态反向随机倒推构造，天然可解
    const rng = mulberry32(base ^ 0xBEEF);
    const bottles = [];
    for (let c = 0; c < K; c++) bottles.push(Array(cap).fill(c));
    for (let e = 0; e < E; e++) bottles.push([]);
    for (let m = 0; m < K * 3; m++) {
      const froms = [];
      for (let i = 0; i < bottles.length; i++) if (bottles[i].length) froms.push(i);
      if (!froms.length) break;
      const from = froms[(rng() * froms.length) | 0];
      const empt = [];
      for (let j = 0; j < bottles.length; j++) if (j !== from && bottles[j].length < cap) empt.push(j);
      if (!empt.length) break;
      const to = empt[(rng() * empt.length) | 0];
      const n1 = canPour(bottles[from], bottles[to], cap);
      if (n1) { const r = applyPour(bottles, from, to, cap); if (r) { bottles[from] = r.bottles[from]; bottles[to] = r.bottles[to]; } }
    }
    return { bottles, K, E, cap, seed: base ^ 0xBEEF };
  }

  return {
    LS_ST, LS_CFG, DEFAULT_CFG,
    mulberry32, levelSeed, specForLevel,
    topRun, isComplete, isWin, completedColors, canPour, applyPour,
    solve, hintMove, genLevel,
  };
})();
