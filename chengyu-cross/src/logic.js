/* 填成语 — 出题引擎与可行性分析（纯函数、无 DOM、node 可测） */
(function () {
  'use strict';

  /* ---------- 随机与哈希 ---------- */
  function rng32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fnv1a(str) {
    var h = 0x811c9dc5;
    str = String(str == null ? '' : str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function K(r, c) { return r + ',' + c; }
  var BIT_H = 1, BIT_V = 2;
  function dirBit(d) { return d === 'H' ? BIT_H : BIT_V; }

  /* ---------- 网格摆放 ----------
   * cells: Map "r,c" -> {ch, dirs, r, c}
   * 硬规则（与参考游戏一致，词与词只允许十字交叉，不允许并排贴边）：
   *  1. 已占格字符必须相同，且同一方向上不允许重叠
   *  2. 词首前/词尾后一格必须为空（防止连读成 5+ 字）
   *  3. 新占格的垂直于词方向的相邻格必须为空（防止贴边并排）
   * 返回新占格坐标数组（[r,c,...]），不合法返回 null */
  function canPlace(cells, w, r, c, dir) {
    var dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
    var fresh = [];
    for (var i = 0; i < w.length; i++) {
      var rr = r + dr * i, cc = c + dc * i;
      var cell = cells.get(K(rr, cc));
      if (cell) {
        if (cell.ch !== w[i]) return null;
        if (cell.dirs & dirBit(dir)) return null;
      } else fresh.push(rr, cc);
    }
    if (cells.has(K(r - dr, c - dc))) return null;
    if (cells.has(K(r + dr * w.length, c + dc * w.length))) return null;
    var pr = dc, pc = dr;
    for (var j = 0; j < fresh.length; j += 2) {
      var fr = fresh[j], fc = fresh[j + 1];
      if (cells.has(K(fr + pr, fc + pc))) return null;
      if (cells.has(K(fr - pr, fc - pc))) return null;
    }
    return fresh;
  }
  function applyPlace(cells, w, r, c, dir, wi) {
    var dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
    for (var i = 0; i < w.length; i++) {
      var rr = r + dr * i, cc = c + dc * i, k = K(rr, cc);
      var cell = cells.get(k);
      if (!cell) { cell = { ch: w[i], dirs: 0, r: rr, c: cc }; cells.set(k, cell); }
      cell.dirs |= dirBit(dir);
    }
  }

  /* ---------- 生成核心：贪心扩叉 ----------
   * 从一粒种子词开始，反复挑选交叉机会点放入新成语，直到 target 个或无路可走。
   * budget(now()、iters) 可选，返回 false 中止。 */
  function generateCore(rng, list, target, maxSpan, budget) {
    if (!list || !list.length) {
      return { words: [], cells: new Map(), complete: false, iters: 0 };
    }
    target = Math.max(1, Math.min(target, list.length));
    var byChar = new Map();
    for (var wi = 0; wi < list.length; wi++) {
      var w = list[wi];
      for (var p = 0; p < w.length; p++) {
        var ch = w[p];
        var arr = byChar.get(ch);
        if (!arr) { arr = []; byChar.set(ch, arr); }
        arr.push({ wi: wi, p: p });
      }
    }
    var cells = new Map(), words = [], used = new Set();
    var ops = [], dead = {};
    var minR = 0, maxR = 0, minC = 0, maxC = 0;
    var iters = 0;
    function overBudget() {
      iters++;
      return budget ? !budget(iters) : false;
    }
    function addOps(wi) {
      var wd = words[wi];
      var dir = wd.dir === 'H' ? 'V' : 'H';
      for (var i = 0; i < wd.w.length; i++) {
        var rr = wd.r + (wd.dir === 'V' ? i : 0), cc = wd.c + (wd.dir === 'H' ? i : 0);
        var ok = true;
        for (var q = 0; q < ops.length; q++) {
          if (ops[q].r === rr && ops[q].c === cc && ops[q].dir === dir) { ok = false; break; }
        }
        if (ok) ops.push({ r: rr, c: cc, dir: dir });
      }
    }
    var wi0 = Math.floor(rng() * list.length);
    applyPlace(cells, list[wi0], 0, 0, 'H');
    used.add(wi0);
    words.push({ w: list[wi0], r: 0, c: 0, dir: 'H' });
    addOps(0);

    while (words.length < target && ops.length) {
      if (overBudget()) break;
      /* 机会点：洗牌后按“到重心距离+抖动”排序，保持字形紧凑 */
      shuffle(ops, rng);
      var sr = 0, sc = 0, n = 0;
      cells.forEach(function (cell) { sr += cell.r; sc += cell.c; n++; });
      sr /= n; sc /= n;
      ops.sort(function (a, b) {
        return (Math.abs(a.r - sr) + Math.abs(a.c - sc) + rng() * 2.5) -
               (Math.abs(b.r - sr) + Math.abs(b.c - sc) + rng() * 2.5);
      });
      var placedAny = false;
      for (var oi = 0; oi < ops.length; oi++) {
        var op = ops[oi];
        var opKey = op.r + ',' + op.c + ',' + op.dir;
        if (dead[opKey]) continue;
        var cell = cells.get(K(op.r, op.c));
        if (cell.dirs & dirBit(op.dir)) { dead[opKey] = 1; continue; }
        var cands = (byChar.get(cell.ch) || []).slice();
        shuffle(cands, rng);
        var done = false;
        for (var ci = 0; ci < cands.length; ci++) {
          if (overBudget()) return finish();
          var cand = cands[ci];
          if (used.has(cand.wi)) continue;
          var w = list[cand.wi];
          var r = op.dir === 'V' ? op.r - cand.p : op.r;
          var c = op.dir === 'H' ? op.c - cand.p : op.c;
          var dr = op.dir === 'V' ? 1 : 0, dc = op.dir === 'H' ? 1 : 0;
          var nrMin = Math.min(minR, r), nrMax = Math.max(maxR, r + dr * (w.length - 1));
          var ncMin = Math.min(minC, c), ncMax = Math.max(maxC, c + dc * (w.length - 1));
          if (nrMax - nrMin + 1 > maxSpan || ncMax - ncMin + 1 > maxSpan) continue;
          if (!canPlace(cells, w, r, c, op.dir)) continue;
          applyPlace(cells, w, r, c, op.dir);
          used.add(cand.wi);
          words.push({ w: w, r: r, c: c, dir: op.dir });
          minR = nrMin; maxR = nrMax; minC = ncMin; maxC = ncMax;
          addOps(words.length - 1);
          done = true; placedAny = true;
          break;
        }
        if (done) { ops.splice(oi, 1); break; }
        dead[opKey] = 1;
      }
      if (!placedAny) break;
    }
    function finish() {
      return { words: words, cells: cells, complete: words.length >= target, iters: iters };
    }
    return finish();
  }

  /* ---------- 对外：按关卡种子出题 ---------- */
  /* opt: {seed, count, maxSpan, list, tries} → {words:[{w,r,c,dir}], cells:Map, complete} */
  function genPuzzle(opt) {
    var list = opt.list, count = Math.max(1, opt.count | 0);
    var maxSpan = opt.maxSpan || 9, tries = opt.tries || 40;
    var best = null;
    for (var t = 0; t < tries; t++) {
      var rng = rng32((opt.seed >>> 0) ^ Math.imul(t + 1, 0x9E3779B9));
      var res = generateCore(rng, list, count, maxSpan);
      if (!best || res.words.length > best.words.length) best = res;
      if (best.words.length >= count) break;
    }
    return best;
  }

  /* ---------- 定稿：归一化坐标 + 预给字 + 候选池 ----------
   * opt: {words, seed, givenRatio, distractorBank}
   * → {seed, words(归一), cells{"r,c":{ch,given,words}}, pool:[ch], distractorCount} */
  function finalizePuzzle(opt) {
    var words = opt.words;
    var minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    words.forEach(function (x) {
      for (var i = 0; i < x.w.length; i++) {
        var rr = x.r + (x.dir === 'V' ? i : 0), cc = x.c + (x.dir === 'H' ? i : 0);
        if (rr < minR) minR = rr; if (rr > maxR) maxR = rr;
        if (cc < minC) minC = cc; if (cc > maxC) maxC = cc;
      }
    });
    var W = words.map(function (x) { return { w: x.w, r: x.r - minR, c: x.c - minC, dir: x.dir }; });
    var cells = {};
    W.forEach(function (x, wi) {
      for (var i = 0; i < x.w.length; i++) {
        var rr = x.r + (x.dir === 'V' ? i : 0), cc = x.c + (x.dir === 'H' ? i : 0), k = K(rr, cc);
        var cell = cells[k];
        if (!cell) { cell = { ch: x.w[i], given: 0, words: [] }; cells[k] = cell; }
        cell.words.push({ wi: wi, i: i });
      }
    });
    var rng = rng32((opt.seed >>> 0) ^ 0x51ed270b);
    var ratio = opt.givenRatio == null ? 0.3 : opt.givenRatio;
    var order = W.map(function (_, i) { return i; });
    shuffle(order, rng);
    order.forEach(function (wi) {
      var x = W[wi];
      var idxs = [0, 1, 2, 3];
      shuffle(idxs, rng);
      var n = Math.max(1, Math.min(3, Math.round(ratio * 4)));
      for (var q = 0; q < idxs.length && n > 0; q++) {
        var rr = x.r + (x.dir === 'V' ? idxs[q] : 0), cc = x.c + (x.dir === 'H' ? idxs[q] : 0);
        var cell = cells[K(rr, cc)];
        if (!cell.given) { cell.given = 1; n--; }
      }
    });
    /* 兜底：某词四格全被（含交叉）预给 → 让出一格 */
    W.forEach(function (x) {
      var ks = [];
      for (var i = 0; i < 4; i++) ks.push(K(x.r + (x.dir === 'V' ? i : 0), x.c + (x.dir === 'H' ? i : 0)));
      var allGiven = ks.every(function (k) { return cells[k].given; });
      if (allGiven) cells[ks[Math.floor(rng() * 4)]].given = 0;
    });
    var needed = [], neededSet = {};
    for (var k in cells) {
      if (!cells[k].given) { needed.push(cells[k].ch); neededSet[cells[k].ch] = 1; }
    }
    var bank = opt.distractorBank || [];
    var eligible = bank.filter(function (ch) { return !neededSet[ch]; });
    shuffle(eligible, rng);
    var dn = Math.ceil(needed.length / 2) + 1;
    var distractors = eligible.slice(0, dn);
    var pool = shuffle(needed.concat(distractors), rng);
    return { seed: opt.seed >>> 0, words: W, cells: cells, pool: pool, distractorCount: distractors.length };
  }

  /* ---------- 独立校验（测试用） ----------
   * pz: {words, cells(plain obj)} → {ok, errors[]} */
  function validateGrid(pz) {
    var errors = [];
    var cells = new Map();
    pz.words.forEach(function (x, wi) {
      if (!/^[\u4e00-\u9fff]{4}$/.test(x.w)) errors.push('词非法:' + x.w);
      for (var i = 0; i < x.w.length; i++) {
        var rr = x.r + (x.dir === 'V' ? i : 0), cc = x.c + (x.dir === 'H' ? i : 0), k = K(rr, cc);
        var cell = cells.get(k);
        if (!cell) { cell = { ch: x.w[i], dirs: 0, words: [] }; cells.set(k, cell); }
        if (cell.ch !== x.w[i]) errors.push('交叉字符冲突@' + k);
        if (cell.dirs & dirBit(x.dir)) errors.push('同向重叠@' + k + ' 词' + wi);
        cell.dirs |= dirBit(x.dir);
        cell.words.push(wi);
      }
      if (cells.has(K(x.r - (x.dir === 'V' ? 1 : 0), x.c - (x.dir === 'H' ? 1 : 0)))) errors.push('词首粘连:' + x.w);
      if (cells.has(K(x.r + (x.dir === 'V' ? 4 : 0), x.c + (x.dir === 'H' ? 4 : 0)))) errors.push('词尾粘连:' + x.w);
    });
    cells.forEach(function (cell, k) {
      var parts = k.split(',');
      var r = +parts[0], c = +parts[1];
      if ((cell.dirs & BIT_H) && (cells.has(K(r, c - 1)) || cells.has(K(r, c + 1)))) {
        /* 左右邻存在 → 它们必须属于本词（由词内相邻必然在 map 中）——
           这里只需查：本格有 H 词时，左右邻若在 map 中必须也有 H 词且与本格同词，简化为：邻格必须在词表上与本格连通 */
      }
    });
    /* 贴边检查：每格的每个方向邻居若存在，本格必须有对应方向词，且邻居格与本格同属一个词 */
    cells.forEach(function (cell, k) {
      var parts = k.split(',');
      var r = +parts[0], c = +parts[1];
      [[1, 0, BIT_V], [-1, 0, BIT_V], [0, 1, BIT_H], [0, -1, BIT_H]].forEach(function (d) {
        var nk = K(r + d[0], c + d[1]);
        var nb = cells.get(nk);
        if (!nb) return;
        var share = cell.words.some(function (wi) { return nb.words.indexOf(wi) >= 0; });
        if (!share) errors.push('并排贴边@' + k + '->' + nk);
      });
    });
    /* 预给字符一致性 */
    if (pz.cells) {
      cells.forEach(function (cell, k) {
        var g = pz.cells[k];
        if (g && g.ch !== cell.ch) errors.push('cells 字符不一致@' + k);
      });
      for (var k2 in pz.cells) {
        if (!cells.has(k2)) errors.push('cells 多出格@' + k2);
      }
    }
    /* 连通性：除单词外，所有词须共字连通 */
    if (pz.words.length > 1) {
      var parent = pz.words.map(function (_, i) { return i; });
      function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
      cells.forEach(function (cell) {
        for (var i = 1; i < cell.words.length; i++) {
          var a = find(cell.words[0]), b = find(cell.words[i]);
          if (a !== b) parent[a] = b;
        }
      });
      var root = find(0);
      for (var i = 1; i < pz.words.length; i++) {
        if (find(i) !== root) { errors.push('词不连通:' + pz.words[i].w); break; }
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------- 自定义词库可行性分析 ---------- */
  /* 返回 {parsed, valid, invalid, duplicates, isolated, placement{placed,unplaced,ms,iters}, verdict, adopt} */
  function analyzeImport(text, opt) {
    opt = opt || {};
    var maxMs = opt.maxMs || 1500, maxIters = opt.maxIters || 250000;
    var tries = opt.tries || 12, maxSpan = opt.maxSpan || 9;
    var t0 = Date.now();
    var tokens = String(text || '')
      .split(/[\s,，、;；:：!！?？.。·•\-—_|]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    var valid = [], invalid = [], duplicates = [];
    var seen = {};
    tokens.forEach(function (tk) {
      var w = tk.replace(/^[「『【(''“‘<《]+|[」』】)''”’>》]+$/g, '');
      if (!w) return;
      if (!/^[\u4e00-\u9fff]+$/.test(w)) { invalid.push({ w: tk, reason: '含非汉字字符' }); return; }
      if (w.length !== 4) { invalid.push({ w: w, reason: '不是四个字' }); return; }
      if (seen[w]) { duplicates.push(w); return; }
      seen[w] = 1; valid.push(w);
    });
    /* 共字并查集 → 孤立词识别 */
    var parent = valid.map(function (_, i) { return i; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
    var charNode = new Map();
    valid.forEach(function (w, i) {
      for (var p = 0; p < w.length; p++) {
        var ch = w[p];
        var n = charNode.get(ch);
        if (n === undefined) { n = valid.length + charNode.size; charNode.set(ch, n); parent[n] = n; }
        union(i, n);
      }
    });
    var compSize = {};
    valid.forEach(function (_, i) {
      var rt = find(i);
      compSize[rt] = (compSize[rt] || 0) + 1;
    });
    var isolated = [], pool = [];
    valid.forEach(function (w, i) {
      if (compSize[find(i)] === 1) isolated.push(w); else pool.push(w);
    });
    /* 摆放求解：多种子贪心，保留最大可行子集。
       跨度自适应：池子大时自动放大网格（9×9 只容得下 ~20 词），否则"全部连起来"无从谈起 */
    var span = opt.maxSpan || 9;
    if (pool.length > 10) {
      span = Math.min(20, Math.max(span, Math.ceil(Math.sqrt(pool.length * 3.2)) + 2));
    }
    var best = null, iters = 0;
    if (pool.length) {
      for (var s = 0; s < tries; s++) {
        if (iters > maxIters || Date.now() - t0 > maxMs) break;
        var rng = rng32(fnv1a(text) ^ Math.imul(s + 1, 0x85EBCA6B));
        var shuffled = pool.slice();
        shuffle(shuffled, rng);
        var res = generateCore(rng, shuffled, pool.length, span, function (it) {
          iters = it;
          return it <= maxIters && Date.now() - t0 <= maxMs;
        });
        if (!best || res.words.length > best.words.length) best = res;
        if (best.words.length >= pool.length) break;
      }
    }
    var placed = best ? best.words : [];
    var placedSet = {};
    placed.forEach(function (x) { placedSet[x.w] = 1; });
    var unplaced = pool.filter(function (w) { return !placedSet[w]; })
      .map(function (w) { return { w: w, reason: '与已摆成语字位冲突，暂无法连入' }; });
    var verdict;
    if (valid.length === 0 || placed.length < 2) verdict = 'none';
    else if (placed.length === valid.length && isolated.length === 0 &&
             invalid.length === 0 && duplicates.length === 0) verdict = 'full';
    else verdict = 'partial';
    return {
      parsed: tokens.length,
      valid: valid,
      invalid: invalid,
      duplicates: duplicates,
      isolated: isolated,
      placement: {
        placed: placed,
        unplaced: unplaced,
        ms: Date.now() - t0,
        iters: iters
      },
      verdict: verdict,
      adopt: placed.map(function (x) { return x.w; })
    };
  }

  /* ---------- 里程碑 ---------- */
  /* total 累计填对数；从 idx 起推进，返回 {idx, gains:[{target,amount}]} */
  function advanceMilestones(total, milestones, amounts, idx) {
    var gains = [];
    while (idx < milestones.length && total >= milestones[idx]) {
      gains.push({ target: milestones[idx], amount: amounts[idx] || 0 });
      idx++;
    }
    return { idx: idx, gains: gains };
  }

  var CY_LOGIC = {
    rng32: rng32, fnv1a: fnv1a, shuffle: shuffle,
    canPlace: canPlace, applyPlace: applyPlace,
    genPuzzle: genPuzzle, finalizePuzzle: finalizePuzzle,
    validateGrid: validateGrid, analyzeImport: analyzeImport,
    advanceMilestones: advanceMilestones
  };
  if (typeof window !== 'undefined') {
    window.CY = window.CY || {};
    window.CY.logic = CY_LOGIC;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = CY_LOGIC;
})();
