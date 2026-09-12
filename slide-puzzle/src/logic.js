/* ===== src/logic.js — 棋盘数学与求解器（主线负责） ===== */
window.SP = window.SP || {};
SP.LOGIC = (() => {
  'use strict';

  function solved(n) {
    const b = new Array(n * n);
    for (let i = 0; i < n * n; i++) b[i] = (i + 1) % (n * n);
    return b;
  }

  function blankOf(board) { return board.indexOf(0); }

  function isSolved(b) {
    const N = b.length;
    for (let i = 0; i < N - 1; i++) if (b[i] !== i + 1) return false;
    return b[N - 1] === 0;
  }

  // 可解性：N 奇 → 逆序数偶；N 偶 → (逆序数 + 空格行[自底 1 计]) 为奇
  function solvable(board, n) {
    const a = board.filter(v => v !== 0);
    let inv = 0;
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inv++;
    if (n % 2 === 1) return inv % 2 === 0;
    const rowFromBottom = n - ((blankOf(board) / n) | 0);
    return (inv + rowFromBottom) % 2 === 1;
  }

  function shuffle(n, rng) {
    rng = rng || Math.random;
    const N = n * n;
    let board;
    do {
      board = Array.from({ length: N }, (_, i) => (i + 1) % N);
      for (let i = N - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = board[i]; board[i] = board[j]; board[j] = t;
      }
    } while (!solvable(board, n) || isSolved(board));
    return board;
  }

  function canMove(board, n, i) {
    const bk = blankOf(board);
    const br = (bk / n) | 0, bc = bk % n;
    const r = (i / n) | 0, c = i % n;
    return Math.abs(br - r) + Math.abs(bc - c) === 1;
  }

  function applyMove(board, n, i) {
    if (i < 0 || i >= board.length || !canMove(board, n, i)) return null;
    const b = board.slice();
    const bk = blankOf(b);
    b[bk] = b[i]; b[i] = 0;
    return b;
  }

  // ---- 加权 A*：manhattan + linear conflict，w=2.2，不追求最优但完备（n≤6 用） ----
  function planAstar(board, n, opt) {
    opt = opt || {};
    // 权重按尺寸自适应：不追求最短路，只要稳定快速可达（6×6 实测 w=8 全解 ≤0.7s）
    const W = opt.w || (n <= 4 ? 2.2 : n === 5 ? 4 : 8);
    const budget = opt.budget || 400000;
    const N = n * n;
    const gr = new Int16Array(N), gc = new Int16Array(N);
    for (let v = 0; v < N; v++) {
      const p = v === 0 ? N - 1 : v - 1;
      gr[v] = (p / n) | 0; gc[v] = p % n;
    }
    function heur(b) {
      let md = 0, lc = 0;
      for (let r = 0; r < n; r++) {
        const cols = [];
        for (let c = 0; c < n; c++) {
          const v = b[r * n + c];
          if (v === 0) continue;
          md += Math.abs(gr[v] - r) + Math.abs(gc[v] - c);
          if (gr[v] === r) cols.push(gc[v]);
        }
        for (let i = 0; i < cols.length; i++)
          for (let j = i + 1; j < cols.length; j++) if (cols[i] > cols[j]) lc += 2;
      }
      for (let c = 0; c < n; c++) {
        const rows = [];
        for (let r = 0; r < n; r++) {
          const v = b[r * n + c];
          if (v === 0) continue;
          if (gc[v] === c) rows.push(gr[v]);
        }
        for (let i = 0; i < rows.length; i++)
          for (let j = i + 1; j < rows.length; j++) if (rows[i] > rows[j]) lc += 2;
      }
      return md + lc;
    }

    if (isSolved(board)) return [];
    // 简易二叉堆
    const heap = [];
    function push(node, f) {
      heap.push({ f, node });
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
      }
    }
    function pop() {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
        }
      }
      return top.node;
    }

    const startH = heur(board);
    push({ b: board.slice(), g: 0, h: startH, parent: null, move: -1, blank: blankOf(board) }, W * startH);
    const seen = new Map();
    seen.set(board.join(','), 0);
    let cnt = 0;
    while (heap.length) {
      const cur = pop();
      if (cur.h === 0) {
        const path = [];
        let x = cur;
        while (x && x.move >= 0) { path.push(x.move); x = x.parent; }
        return path.reverse();
      }
      if (++cnt > budget) return null;
      const b = cur.b, bk = cur.blank, r = (bk / n) | 0, c = bk % n;
      const g2 = cur.g + 1;
      for (let d = 0; d < 4; d++) {
        const nr = r + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const nc = c + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        const ni = nr * n + nc;
        const bb = b.slice();
        bb[bk] = b[ni]; bb[ni] = 0;
        const key = bb.join(',');
        const prev = seen.get(key);
        if (prev !== undefined && prev <= g2) continue;
        const h2 = heur(bb);
        seen.set(key, g2);
        push({ b: bb, g: g2, h: h2, parent: cur, move: ni, blank: ni }, g2 + W * h2);
      }
    }
    return null;
  }

  // ---- 双块归位子问题：只追踪 a/b 两枚滑块与空格的位置做加权 A* ----
  // 状态空间 N³（n=10 时 10⁶），配合 locked 墙壁，必达且毫秒级。行尾/列尾机动统一走这里。
  function planPair(board, n, a, aHome, b, bHome, moves, locked) {
    const N = n * n;
    const startA = board.indexOf(a), startB = board.indexOf(b), startBlank = board.indexOf(0);
    const key = (pa, pb, bk) => (pa * N + pb) * N + bk;
    const heur = (pa, pb) =>
      Math.abs(((pa / n) | 0) - ((aHome / n) | 0)) + Math.abs((pa % n) - (aHome % n)) +
      Math.abs(((pb / n) | 0) - ((bHome / n) | 0)) + Math.abs((pb % n) - (bHome % n));
    const W = 3;
    const startKey = key(startA, startB, startBlank);
    const startH = heur(startA, startB);
    if (startH === 0) return true;
    const seen = new Uint8Array(N * N * N);
    const prev = new Map(); // key -> [prevKey, swapCell]
    seen[startKey] = 1;
    const heap = []; // {f, pa, pb, bk}
    const push = (node) => {
      heap.push(node);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
        }
      }
      return top;
    };
    push({ f: W * startH, pa: startA, pb: startB, bk: startBlank, g: 0 });
    prev.set(startKey, null);
    let expansions = 0;
    const budget = 200000;
    while (heap.length) {
      const cur = pop();
      const ck = key(cur.pa, cur.pb, cur.bk);
      if (cur.pa === aHome && cur.pb === bHome) {
        // 回溯：生成真实滑块序列
        const path = [];
        let k = ck;
        while (prev.get(k)) {
          const [pk, swapCell] = prev.get(k);
          path.push(swapCell);
          k = pk;
        }
        path.reverse();
        for (const sc of path) {
          const bk = board.indexOf(0);
          moves.push(sc);
          board[bk] = board[sc]; board[sc] = 0;
        }
        return true;
      }
      if (++expansions > budget) return false;
      const r = (cur.bk / n) | 0, c = cur.bk % n;
      for (let d = 0; d < 4; d++) {
        const nr = r + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const nc = c + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        const ni = nr * n + nc;
        if (locked[ni]) continue;
        const pa = ni === cur.pa ? cur.bk : cur.pa;
        const pb = ni === cur.pb ? cur.bk : cur.pb;
        const nk = key(pa, pb, ni);
        if (seen[nk]) continue;
        seen[nk] = 1;
        const g = cur.g + 1;
        prev.set(nk, [ck, ni]);
        push({ f: g + W * heur(pa, pb), pa, pb, bk: ni, g });
      }
    }
    return false;
  }

  // ---- 顺序归位求解器：逐行/列锁定，行尾列尾用 planPair 双块机动，残局 BFS ----
  function planSeq(board, n) {
    const N = n * n;
    const b = board.slice();
    const locked = new Array(N).fill(false);
    const moves = [];
    const blankNow = () => b.indexOf(0);

    function blankPath(dst, avoid) {
      const bk = blankNow();
      if (bk === dst) return [];
      const prev = new Array(N).fill(-1);
      prev[bk] = bk;
      const q = [bk];
      while (q.length) {
        const cur = q.shift();
        if (cur === dst) break;
        const r = (cur / n) | 0, c = cur % n;
        for (let d = 0; d < 4; d++) {
          const nr = r + (d === 0 ? -1 : d === 1 ? 1 : 0);
          const nc = c + (d === 2 ? -1 : d === 3 ? 1 : 0);
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          const ni = nr * n + nc;
          if (locked[ni] || avoid.has(ni) || prev[ni] !== -1) continue;
          prev[ni] = cur;
          q.push(ni);
        }
      }
      if (prev[dst] === -1) return null;
      const path = [];
      let x = dst;
      while (x !== bk) { path.push(x); x = prev[x]; }
      return path.reverse();
    }

    function slideTo(dst, avoid) {
      const path = blankPath(dst, avoid);
      if (path === null) return false;
      for (const sc of path) {
        const bk = blankNow();
        moves.push(sc);
        b[bk] = b[sc]; b[sc] = 0;
      }
      return true;
    }

    // 把数字 v 一步步挪到 dst；protected 里的格子上数字不可被扰动
    function moveTileTo(v, dst, protectedSet) {
      let guard = 0;
      while (b[dst] !== v) {
        if (++guard > 4 * N) return false;
        const from = b.indexOf(v);
        const fr = (from / n) | 0, fc = from % n;
        const dr = ((dst / n) | 0) - fr, dc = (dst % n) - fc;
        const stepH = dc !== 0 ? from + Math.sign(dc) : -1;
        const stepV = dr !== 0 ? from + Math.sign(dr) * n : -1;
        const okH = stepH >= 0 && !locked[stepH] && !protectedSet.has(stepH);
        const okV = stepV >= 0 && !locked[stepV] && !protectedSet.has(stepV);
        let step;
        if (okH && (Math.abs(dc) >= Math.abs(dr) || !okV)) step = stepH;
        else if (okV) step = stepV;
        else return false;
        const avoid = new Set(protectedSet);
        avoid.add(from);
        if (!slideTo(step, avoid)) return false;
        const bk = blankNow();
        b[bk] = v; b[from] = 0;
        moves.push(from);
      }
      return true;
    }

    // 阶段一：逐行锁定 0..n-3 行；每行最后两格用 planPair 双块机动
    for (let r = 0; r <= n - 3; r++) {
      for (let c = 0; c <= n - 3; c++) {
        const v = r * n + c + 1, dst = r * n + c;
        if (!moveTileTo(v, dst, new Set())) return null;
        locked[dst] = true;
      }
      const A = r * n + n - 1, B = r * n + n;            // A→(r,n-2) B→(r,n-1)
      if (!planPair(b, n, A, r * n + (n - 2), B, r * n + (n - 1), moves, locked)) return null;
      locked[r * n + n - 1] = true;
      locked[r * n + n - 2] = true;
    }

    // 阶段二：最后两行逐列锁定 0..n-4 列（planPair 双块机动）
    for (let c = 0; c <= n - 4; c++) {
      const t1 = (n - 2) * n + c + 1, t2 = (n - 1) * n + c + 1;
      const P = (n - 2) * n + c, Q = P + 1, R = (n - 1) * n + c + 1, S = (n - 1) * n + c;
      if (!planPair(b, n, t1, P, t2, S, moves, locked)) return null;
      locked[P] = true;
      locked[S] = true;
    }

    // 残局：剩下 2×3（或更小），BFS 精确解
    {
      const freeCells = [];
      for (let i = 0; i < N; i++) if (!locked[i]) freeCells.push(i);
      const idxIn = new Map(freeCells.map((g, k) => [g, k]));
      const start = freeCells.map(g => b[g]).join(',');
      const goal = freeCells.map(g => {
        const t = solved(n)[g];
        return t === 0 ? 0 : t;
      }).join(',');
      if (start !== goal) {
        const prev = new Map([[start, null]]);
        const q = [start];
        let found = false;
        while (q.length && !found) {
          const cur = q.shift();
          const arr = cur.split(',').map(Number);
          const bkLocal = arr.indexOf(0);
          const gCell = freeCells[bkLocal];
          const gr = (gCell / n) | 0, gc = gCell % n;
          for (let d = 0; d < 4; d++) {
            const nr = gr + (d === 0 ? -1 : d === 1 ? 1 : 0);
            const nc = gc + (d === 2 ? -1 : d === 3 ? 1 : 0);
            if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
            const ni = nr * n + nc;
            if (!idxIn.has(ni)) continue;
            const swapLocal = idxIn.get(ni);
            const arr2 = arr.slice();
            arr2[bkLocal] = arr[swapLocal];
            arr2[swapLocal] = 0;
            const key = arr2.join(',');
            if (prev.has(key)) continue;
            prev.set(key, [cur, ni]); // ni 是被滑入空格的格子（全局索引）
            if (key === goal) { found = true; break; }
            q.push(key);
          }
        }
        if (!found) return null;
        // 回溯路径
        const path = [];
        let cur = goal;
        while (prev.get(cur)) {
          const [parent, mv] = prev.get(cur);
          path.push(mv);
          cur = parent;
        }
        path.reverse();
        moves.push(...path);
      }
    }

    // 自校验：模拟一遍必须复原
    let check = board.slice();
    for (const mv of moves) {
      check = applyMove(check, n, mv);
      if (!check) return null;
    }
    return isSolved(check) ? moves : null;
  }

  // 路由：小棋盘用 A*（解更短），大棋盘/失败兜底用顺序求解器
  function plan(board, n, opt) {
    if (n <= 6) {
      const p = planAstar(board, n, opt);
      if (p) return p;
    }
    return planSeq(board, n);
  }

  return { solved, blankOf, isSolved, solvable, shuffle, canMove, applyMove, plan, planAstar, planSeq };
})();
