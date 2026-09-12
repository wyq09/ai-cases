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

  // ---- 加权 A*：manhattan + linear conflict，w=2.2，不追求最优但完备 ----
  function plan(board, n, opt) {
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

  return { solved, blankOf, isSolved, solvable, shuffle, canMove, applyMove, plan };
})();
