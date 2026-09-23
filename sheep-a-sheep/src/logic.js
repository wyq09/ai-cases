/* sheep-a-sheep logic —— 难度曲线 / 布局生成 / 可解性求解器 / demo策略 / 难度模拟器
   坐标系：gx2,gy2 为 ×2 半格整数；牌宽=2半格、牌高=2.5半格(1.25比例)；
   几何相交 ⇔ |dx2|<=1 && |dy2|<=2；压牌 ⇔ 相交且 zA>zB；同层由生成保证不重叠(底层行间瓦片重叠除外,z相同不构成遮挡)。 */
window.SH = window.SH || {};
SH.logic = (function () {
  'use strict';

  var C = SH.core;

  var DEFAULT_CFG = {
    // 玩法/难度
    slots: 7,            // 5~9
    kindsStart: 5,       // 3~8 首关种类
    kindsMax: 12,        // 6~14 种类上限
    tilesStart: 30,      // 24~60 首关牌数
    tilesPerLevel: 12,   // 0~24 每关增量
    tilesMax: 150,       // 60~198 牌数上限
    layersStart: 3,      // 2~5
    layersMax: 8,        // 3~9
    density: 0.6,        // 0.40~0.85 叠压密度基准
    sideStacks: 2,       // 0~2 侧堆数量
    sideLen: 5,          // 3~8 侧堆长度
    propsOut: 1, propsUndo: 1, propsShuffle: 1,
    revives: 1,          // 0~3
    guaranteed: true,    // 求解器验证保证可解
    breatherEvery: 5,    // 0~10 每 N 关喘息(0=无)
    // 外观
    icons: {},           // {kindId: dataURI}
    bgCustom: '',
    tileSkin: 0,
    // 音画
    sfxVol: 0.9, bgmVol: 0.45, muted: false,
    audioOverrides: {},
  };

  /* ---------------- 难度曲线 ---------------- */
  function specForLevel(L, cfg) {
    var breather = cfg.breatherEvery > 0 && L > 1 && (L % cfg.breatherEvery === 0);
    var e = breather ? Math.max(1, L - 3) : L;
    var kinds = Math.min(cfg.kindsMax, cfg.kindsStart + Math.floor((e - 1) / 3));
    if (L === 1) kinds = Math.min(kinds, 4); // 教学关
    var tiles = Math.min(cfg.tilesMax, cfg.tilesStart + cfg.tilesPerLevel * (e - 1));
    var layers = Math.min(cfg.layersMax, cfg.layersStart + Math.floor((e - 1) / 2));
    if (L === 1) layers = Math.min(layers, 3);
    var density = Math.min(0.85, cfg.density + (e - 1) * 0.02);
    if (L === 1) density = Math.min(density, 0.5);
    var sideN = cfg.sideStacks > 0 ? (e === 1 ? 1 : cfg.sideStacks) : 0;
    var sideLen = Math.max(3, Math.min(cfg.sideLen, 2 + e));
    return {
      lv: L, kinds: kinds, tiles: tiles, layers: layers, density: density,
      slots: cfg.slots, sideN: sideN, sideLen: sideLen,
      props: { out: cfg.propsOut, undo: cfg.propsUndo, shuf: cfg.propsShuffle, revives: cfg.revives },
    };
  }

  /* ---------------- 几何 ---------------- */
  function overlap(a, b) {
    var dx = a.gx2 - b.gx2; if (dx < 0) dx = -dx;
    if (dx > 1) return false;
    var dy = a.gy2 - b.gy2; if (dy < 0) dy = -dy;
    return dy <= 2;
  }

  /* 覆盖边预计算：covers[i]=i压住的牌id表，blockers[j]=压j的牌id表。tiles 须 z 升序。 */
  function buildCover(tiles) {
    var n = tiles.length, covers = [], blockers = [];
    for (var i = 0; i < n; i++) { covers.push([]); blockers.push([]); }
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        if (!overlap(tiles[a], tiles[b])) continue;
        var hi, lo;
        if (tiles[a].z > tiles[b].z) { hi = a; lo = b; } else { hi = b; lo = a; }
        covers[hi].push(lo); blockers[lo].push(hi);
      }
    }
    return { covers: covers, blockers: blockers };
  }

  function coveredFlags(tiles) {
    var n = tiles.length, cov = new Uint8Array(n);
    for (var a = 0; a < n; a++)
      for (var b = 0; b < n; b++) {
        if (a === b || tiles[b].z <= tiles[a].z) continue;
        if (overlap(tiles[a], tiles[b])) { cov[a] = 1; break; }
      }
    return cov;
  }

  /* ---------------- 布局生成 ---------------- */
  // 主堆：底层规整网格，上层半格错位逐层收缩
  function buildMain(rng, spec) {
    var shrink = 0.45 + spec.density * 0.5;
    var geo = (1 - Math.pow(shrink, spec.layers)) / (1 - shrink);
    var n0 = Math.max(6, Math.round(spec.mainTiles / geo));
    var cols = Math.max(3, Math.round(Math.sqrt(n0 * 1.3)));
    var rows = Math.max(2, Math.ceil(n0 / cols));

    var layersTiles = [];
    var l0 = [];
    for (var r = 0; r < rows; r++)
      for (var c = 0; c < cols; c++)
        l0.push({ gx2: c * 2, gy2: r * 2 });
    layersTiles.push(l0);

    for (var l = 1; l < spec.layers; l++) {
      var prev = layersTiles[l - 1];
      if (!prev.length) break;
      var want = Math.max(1, Math.round(prev.length * shrink));
      // 候选：上一层每张牌的邻域（含正上对齐）。允许跨层叠（z 序决定压关系），仅要求承托上一层。
      var cand = [];
      var seen = {};
      for (var p = 0; p < prev.length; p++) {
        var base = prev[p];
        for (var ddx = -1; ddx <= 1; ddx++) for (var ddy = 0; ddy <= 2; ddy++) {
          var gx = base.gx2 + ddx, gy = base.gy2 + ddy;
          var key = gx + ',' + gy;
          if (seen[key]) continue;
          seen[key] = 1;
          cand.push({ gx2: gx, gy2: gy });
        }
      }
      // 随机挑 want 个（同层互不重叠：|dx2|<=1 && |dy2|<=2 冲突）
      var placed = [];
      shuffle(cand, rng);
      for (var ci = 0; ci < cand.length && placed.length < want; ci++) {
        var t = cand[ci], ok = true;
        for (var pi = 0; pi < placed.length; pi++) {
          var q = placed[pi];
          var dX = t.gx2 - q.gx2; if (dX < 0) dX = -dX;
          if (dX > 1) continue;
          var dY = t.gy2 - q.gy2; if (dY < 0) dY = -dY;
          if (dY <= 2) { ok = false; break; }
        }
        if (ok) placed.push(t);
      }
      layersTiles.push(placed);
    }
    return layersTiles;
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0;
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  function buildBoard(rng, spec) {
    var sideCount = spec.sideN * spec.sideLen;
    var mainTarget = Math.max(24, spec.tiles - sideCount);
    spec.mainTiles = mainTarget;
    var layersTiles = buildMain(rng, spec);

    // 主堆槽位摊平（z=层号）
    var slots = [];
    for (var l = 0; l < layersTiles.length; l++)
      for (var i = 0; i < layersTiles[l].length; i++)
        slots.push({ gx2: layersTiles[l][i].gx2, gy2: layersTiles[l][i].gy2, z: l });

    // 总槽位取 3 倍数：多出的从顶层随机丢
    var total = slots.length + sideCount;
    var T = Math.floor(total / 3) * 3;
    var drop = total - T;
    shuffle(slots, rng);
    slots.sort(function (a, b) { return b.z - a.z; }); // 顶层优先丢
    slots.splice(0, drop);
    slots.sort(function (a, b) { return a.z - b.z; });

    // 侧堆：竖叠瓦片，z 递增向上
    var minX = 0, maxX = 0;
    for (var s = 0; s < slots.length; s++) {
      if (slots[s].gx2 < minX) minX = slots[s].gx2;
      if (slots[s].gx2 > maxX) maxX = slots[s].gx2;
    }
    var sideTiles = [];
    var baseY = 0;
    for (var sd = 0; sd < spec.sideN; sd++) {
      var right = sd === 1; // 堆0左、堆1右
      var sx = right ? maxX + 4 : minX - 4;
      for (var si = 0; si < spec.sideLen; si++) {
        sideTiles.push({ gx2: sx, gy2: baseY + si * 2, z: si, side: 1 });
      }
    }

    var all = slots.concat(sideTiles);
    for (var id = 0; id < all.length; id++) { all[id].id = id; all[id].side = all[id].side || 0; }

    // 图案分配：T/3 组，种类均匀 + 洗牌
    var groups = T / 3;
    var gk = [];
    for (var g = 0; g < groups; g++) gk.push(g % spec.kinds);
    shuffle(gk, rng);
    var order = all.slice();
    shuffle(order, rng);
    for (var o = 0; o < order.length; o++) order[o].kind = gk[(o / 3) | 0];

    // z 升序输出
    all.sort(function (a, b) { return a.z - b.z; });
    for (var r2 = 0; r2 < all.length; r2++) all[r2].id = r2;

    // 包围盒（渲染定位用）
    var mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9;
    for (var bb = 0; bb < all.length; bb++) {
      var t = all[bb];
      if (t.gx2 < mnX) mnX = t.gx2;
      if (t.gx2 > mxX) mxX = t.gx2;
      if (t.gy2 < mnY) mnY = t.gy2;
      if (t.gy2 > mxY) mxY = t.gy2;
    }

    return {
      lv: spec.lv, kinds: spec.kinds, slots: spec.slots, props: spec.props,
      tiles: all,
      mainZ: layersTiles.length - 1,
      box: { minX2: mnX, maxX2: mxX, minY2: mnY, maxY2: mxY },
    };
  }

  /* ---------------- 求解器（贪心 + 预算回溯）---------------- */
  // 返回 {ok, steps:[tileId...]}。同 kind 候选最多试 2 张（启发式剪枝，生成场景以重摇兜底）。
  function solve(board, slotsN, opts) {
    opts = opts || {};
    var nodesMax = opts.nodes || 1200;
    var tiles = board.tiles, n = tiles.length;
    var cov = buildCover(tiles);
    var covers = cov.covers, blockers = cov.blockers;

    var alive = new Uint8Array(n);
    var initAlive = opts.alive;
    var leftCnt = 0;
    for (var i0 = 0; i0 < n; i0++) { alive[i0] = initAlive ? (initAlive[i0] ? 1 : 0) : 1; leftCnt += alive[i0]; }
    var remBlk = new Int32Array(n);
    for (var j = 0; j < n; j++) {
      var cnt = 0;
      var bl = blockers[j];
      for (var b2 = 0; b2 < bl.length; b2++) if (alive[bl[b2]]) cnt++;
      remBlk[j] = cnt;
    }
    var left = leftCnt;

    var slotK = (opts.slotKinds || []).slice();   // demo/提示：中途槽状态
    var slotCnt = new Int16Array(16);
    for (var sk = 0; sk < slotK.length; sk++) slotCnt[slotK[sk]]++;
    var kindOf = new Uint8Array(n);
    var zOf = new Int32Array(n);
    for (var k2 = 0; k2 < n; k2++) { kindOf[k2] = tiles[k2].kind; zOf[k2] = tiles[k2].z; }

    var steps = [];
    var nodes = 0;
    var rng = opts.rng || Math.random;

    function match3() {
      for (var k = 0; k < 16; k++) {
        if (slotCnt[k] >= 3) {
          var removed = 0;
          for (var i = slotK.length - 1; i >= 0 && removed < 3; i--) {
            if (slotK[i] === k) { slotK.splice(i, 1); removed++; }
          }
          slotCnt[k] = 0;
          return true;
        }
      }
      return false;
    }

    function take(i) {
      alive[i] = 0; left--;
      var cs = covers[i];
      for (var c = 0; c < cs.length; c++) remBlk[cs[c]]--;
      slotK.push(kindOf[i]); slotCnt[kindOf[i]]++;
      steps.push(i);
    }
    function untake(i) {
      alive[i] = 1; left++;
      var cs = covers[i];
      for (var c = 0; c < cs.length; c++) remBlk[cs[c]]++;
      slotK.pop(); slotCnt[kindOf[i]]--;
      steps.pop();
    }

    function dfs() {
      if (nodes++ > nodesMax) return false;
      while (match3()) ;
      if (left === 0) return true;
      if (slotK.length >= slotsN) return false;

      var cands = [];
      for (var i = 0; i < n; i++) {
        if (!alive[i] || remBlk[i] > 0) continue;
        var c = slotCnt[kindOf[i]];
        var s = c === 2 ? 1000 : c === 1 ? 400 : 100;
        s += zOf[i] * 2 + rng() * 8;
        cands.push({ i: i, s: s });
      }
      cands.sort(function (a, b) { return b.s - a.s; });

      var triedKind = {}, triedPerKind = {};
      for (var ci = 0; ci < cands.length; ci++) {
        var it = cands[ci].i, kd = kindOf[it];
        // 同 kind 只试 2 张（遮挡结构近似，牺牲完备性换速度）
        triedPerKind[kd] = (triedPerKind[kd] || 0) + 1;
        if (triedPerKind[kd] > 2) continue;
        take(it);
        if (dfs()) return true;
        untake(it);
        if (nodes > nodesMax) return false;
      }
      return false;
    }

    var ok = dfs();
    return { ok: ok, steps: ok ? steps.slice() : null };
  }

  /* demo/提示：完整可解路径第一步，失败回落贪心单步。slotKinds=槽内 kind，alive=场上存活标记 */
  function pick(board, slotsN, slotKinds, aliveArr) {
    var r = solve(board, slotsN, { nodes: 600, slotKinds: slotKinds || [], alive: aliveArr });
    if (r.ok && r.steps.length) return r.steps[0];
    // 贪心单步兜底
    var tiles = board.tiles, n = tiles.length;
    var cov = coveredFlags(tiles);
    var slotCnt = new Int16Array(16);
    var bs = slotKinds || [];
    for (var b = 0; b < bs.length; b++) slotCnt[bs[b]]++;
    var best = -1, bestS = -1;
    for (var i = 0; i < n; i++) {
      if (cov[i] || (aliveArr && !aliveArr[i])) continue;
      var c = slotCnt[tiles[i].kind];
      var s = c === 2 ? 1000 : c === 1 ? 400 : 100;
      s += tiles[i].z * 2;
      if (s > bestS) { bestS = s; best = i; }
    }
    return best;
  }

  /* ---------------- 难度模拟器（难度曲线调参用，game 不调用）----------------
     skill: 0 纯随机 ~ 1 完美贪心。返回 {winRate, avgSteps}。 */
  function simulate(nRuns, L, cfg, skill) {
    skill = skill === undefined ? 0.75 : skill;
    var spec = specForLevel(L, cfg);
    var wins = 0, stepsSum = 0;
    for (var run = 0; run < nRuns; run++) {
      var rng = C.mulberry32((Math.random() * 4294967295) >>> 0);
      var sp = Object.assign({}, spec); sp.mainTiles = Math.max(24, spec.tiles - spec.sideN * spec.sideLen);
      var board = buildBoard(rng, sp);
      var covE = buildCover(board.tiles);
      var alive = [], remBlk = [];
      for (var i0 = 0; i0 < board.tiles.length; i0++) { alive.push(1); remBlk.push(covE.blockers[i0].length); }
      var left = board.tiles.length;
      var slot = [];
      var slotCnt = new Int16Array(16);
      var props = { out: spec.props.out, undo: 0, shuf: 0 };
      var tiles = board.tiles;
      var guard = tiles.length * 3;
      var result = 'lose';

      function doMatch3() {
        for (var k = 0; k < 16; k++) {
          if (slotCnt[k] >= 3) {
            var rem = 0;
            for (var x = slot.length - 1; x >= 0 && rem < 3; x--)
              if (slot[x] === k) { slot.splice(x, 1); rem++; }
            slotCnt[k] = 0;
            return true;
          }
        }
        return false;
      }
      function takeIdx(ix) {
        alive[ix] = 0; left--;
        var cs = covE.covers[ix] || []; // useOut 新增的顶层牌无覆盖边（z 最高）
        for (var c = 0; c < cs.length; c++) remBlk[cs[c]]--;
        slot.push(tiles[ix].kind); slotCnt[tiles[ix].kind]++;
      }
      function useOut() {
        props.out--;
        var moved = 0;
        for (var m = 0; m < 3 && slot.length; m++) {
          var k = slot.shift(); slotCnt[k]--;
          // 放回场上顶层随机位置
          var maxZ = 0;
          for (var t2 = 0; t2 < tiles.length; t2++) if (alive[t2] && tiles[t2].z > maxZ) maxZ = tiles[t2].z;
          var ref = tiles[(rng() * tiles.length) | 0];
          var nt = { id: tiles.length, kind: k, gx2: ref.gx2 + ((rng() * 3) | 0) - 1, gy2: ref.gy2 + ((rng() * 3) | 0) - 1, z: maxZ + 1 };
          tiles.push(nt);
          alive.push(1); remBlk.push(0);
          // 新牌压住相交牌
          for (var t3 = 0; t3 < tiles.length - 1; t3++) {
            if (!alive[t3]) continue;
            if (overlap(nt, tiles[t3])) remBlk[t3]++;
          }
          moved++;
        }
        left += moved;
      }

      while (guard-- > 0) {
        while (doMatch3()) ;
        if (left === 0) { result = 'win'; break; }
        if (slot.length >= spec.slots) {
          if (props.out > 0) { useOut(); continue; }
          break; // lose
        }
        // 道具策略：槽临界且无 2 同可凑
        if (slot.length >= spec.slots - 1 && props.out > 0 && rng() < 0.5) {
          var hasPair = false;
          for (var pk = 0; pk < 16; pk++) if (slotCnt[pk] === 2) hasPair = true;
          if (!hasPair && slotCnt[slot[slot.length - 1]] !== 2) { useOut(); continue; }
        }
        var cands = [];
        for (var ci = 0; ci < tiles.length; ci++) {
          if (!alive[ci] || remBlk[ci] > 0) continue;
          var cc = slotCnt[tiles[ci].kind];
          var s = cc === 2 ? 1000 : cc === 1 ? 400 : 100;
          s += tiles[ci].z * 2;
          cands.push({ i: ci, s: s });
        }
        if (!cands.length) break;
        var choice;
        if (rng() < skill) {
          cands.sort(function (a, b) { return b.s - a.s; });
          choice = cands[0].i;
        } else {
          choice = cands[(rng() * cands.length) | 0].i;
        }
        takeIdx(choice);
        stepsSum++;
      }
      if (result === 'win') wins++;
    }
    return { winRate: wins / nRuns, avgSteps: stepsSum / nRuns };
  }

  /* ---------------- 生成入口（可解验证 + 重摇）---------------- */
  function genLevel(L, cfg, rngIn) {
    var spec = specForLevel(L, cfg);
    var base = C.levelSeed(L);
    var tries = cfg.guaranteed ? 40 : 1;
    var last = null;
    for (var a = 0; a < tries; a++) {
      var rng = rngIn || C.mulberry32((base + a * 7919) >>> 0);
      var sp = Object.assign({}, spec);
      sp.mainTiles = Math.max(24, spec.tiles - spec.sideN * spec.sideLen);
      var b = buildBoard(rng, sp);
      last = b;
      if (!cfg.guaranteed) break;
      if (solve(b, spec.slots, { nodes: 1200 }).ok) return b;
    }
    if (cfg.guaranteed) {
      for (var a2 = 0; a2 < 15; a2++) {
        var rng2 = C.mulberry32((base + 999983 + a2 * 7919) >>> 0);
        var sp2 = Object.assign({}, spec);
        sp2.mainTiles = Math.max(24, spec.tiles - spec.sideN * spec.sideLen);
        sp2.density = Math.max(0.4, spec.density * 0.8);
        sp2.layers = Math.max(3, spec.layers - 1);
        var b2 = buildBoard(rng2, sp2);
        if (solve(b2, sp2.slots, { nodes: 1200 }).ok) return b2;
      }
    }
    return last;
  }

  return {
    DEFAULT_CFG: DEFAULT_CFG,
    specForLevel: specForLevel,
    overlap: overlap,
    buildCover: buildCover,
    coveredFlags: coveredFlags,
    genLevel: genLevel,
    solve: solve,
    pick: pick,
    simulate: simulate,
  };
})();
