/* 接水管 — 纯逻辑：棋盘生成（保证可解）/ 连通 BFS / AI 解题器 */
window.PC = window.PC || {};
PC.LOGIC = (() => {
  const COLS = 5;
  const LS_ST = 'pc_state_v1';
  const LS_CFG = 'pc_cfg_v1';
  const DEFAULT_CFG = {
    timeBase: 60, timeMin: 30,
    baseScore: 100, levelBonus: 20, timeBonus: 5,
    palette: 'classic', bgmVol: 0.35, sfxVol: 0.8,
    aiDemo: false, sfxOverrides: {},
  };

  // 边编号：N=0 E=1 S=2 W=3；对边 OPP
  const OPP = [2, 3, 0, 1];

  const rowsForLevel = n => (n <= 1 ? 5 : n <= 3 ? 6 : 7);
  const timeForLevel = (n, cfg) => Math.max(cfg.timeMin, cfg.timeBase - (n - 1) * 4);

  // 管件在 rot 下连通的边集：straight rot0=N+S rot1=E+W（mod2）；elbow rot0=N+E 起 mod4
  function cons(type, rot) {
    if (type === 'straight') {
      return (((rot % 2) + 2) % 2) === 0 ? [0, 2] : [1, 3];
    }
    return [[0, 1], [1, 2], [2, 3], [3, 0]][((rot % 4) + 4) % 4];
  }
  const hasEdge = (cell, e) => cons(cell.type, cell.rot).indexOf(e) >= 0;

  // 由一对边反推解向（对边=straight，邻边=elbow）
  function pieceFor(e1, e2) {
    const a = Math.min(e1, e2), b = Math.max(e1, e2);
    if (a === 0 && b === 2) return { type: 'straight', rot: 0 };
    if (a === 1 && b === 3) return { type: 'straight', rot: 1 };
    const rot = { '0,1': 0, '1,2': 1, '2,3': 2, '0,3': 3 }[a + ',' + b];
    return { type: 'elbow', rot: rot === undefined ? 0 : rot };
  }

  // 出水口：第 1 列最后一行
  const goalIdx = rows => (rows - 1) * COLS + 1;

  // 随机化 DFS 简单路径：(0,0) → (1, rows-1)
  function genPath(rows, rng) {
    const visited = new Array(COLS * rows).fill(false);
    const path = [];
    const goal = goalIdx(rows);
    let found = false;
    (function dfs(i) {
      if (found) return;
      visited[i] = true;
      path.push(i);
      if (i === goal) { found = true; return; }
      const r = Math.floor(i / COLS), c = i % COLS;
      const dirs = [[-1, 0], [1, 0], [0, 1], [0, -1]];
      for (let k = dirs.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        const t = dirs[k]; dirs[k] = dirs[j]; dirs[j] = t;
      }
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= COLS) continue;
        const ni = nr * COLS + nc;
        if (visited[ni]) continue;
        dfs(ni);
        if (found) return;
      }
      path.pop();
    })(0);
    return path; // 格索引序列
  }

  // 生成棋盘：{rows, cells:[{type,rot}], sol:{idx:rot}}
  function genBoard(rows, rng) {
    rng = rng || Math.random;
    const pathIdx = genPath(rows, rng);
    const cells = new Array(COLS * rows);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = { type: rng() < 0.5 ? 'straight' : 'elbow', rot: Math.floor(rng() * 4) };
    }
    const sol = {};
    let entry = 0; // 进水口从 N 进入第一格
    for (let i = 0; i < pathIdx.length; i++) {
      let exit;
      if (i === pathIdx.length - 1) exit = 2; // 出水口从 S 离开最后一格
      else {
        const cur = pathIdx[i], nxt = pathIdx[i + 1];
        exit = nxt > cur ? (nxt - cur === COLS ? 2 : 1) : (cur - nxt === COLS ? 0 : 3);
      }
      const p = pieceFor(entry, exit);
      cells[pathIdx[i]] = { type: p.type, rot: p.rot };
      sol[pathIdx[i]] = p.rot;
      entry = OPP[exit];
    }
    // 打乱全部格
    for (let i = 0; i < cells.length; i++) {
      const max = cells[i].type === 'straight' ? 1 : 3;
      cells[i].rot = Math.floor(rng() * (max + 1));
    }
    // 初始局面必须未连通
    let guard = 0;
    while (solveFrom(rows, cells).win && guard++ < 8) {
      const keys = Object.keys(sol);
      const k = +keys[Math.floor(rng() * keys.length)];
      cells[k].rot = (cells[k].rot + 1) % (cells[k].type === 'straight' ? 2 : 4);
    }
    return { rows, cells, sol };
  }

  // BFS：水从虚拟进水口（(0,0) 的 N 边）扩散；到 (1,rows-1) 且 S 边开 = 胜
  function solveFrom(rows, cells) {
    const n = COLS * rows;
    const dist = new Array(n).fill(-1);
    const prev = new Array(n).fill(-1);
    const goal = goalIdx(rows);
    const queue = [];
    if (hasEdge(cells[0], 0)) { dist[0] = 0; queue.push(0); }
    const DIRS = [[-1, 0, 0], [1, 0, 2], [0, 1, 1], [0, -1, 3]]; // dr,dc,myEdge
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const r = Math.floor(cur / COLS), c = cur % COLS;
      for (const [dr, dc, me] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= COLS) continue;
        const ni = nr * COLS + nc;
        if (dist[ni] >= 0) continue;
        const ne = OPP[me];
        if (hasEdge(cells[cur], me) && hasEdge(cells[ni], ne)) {
          dist[ni] = dist[cur] + 1;
          prev[ni] = cur;
          queue.push(ni);
        }
      }
    }
    const win = dist[goal] >= 0 && hasEdge(cells[goal], 2);
    const path = [];
    if (win) { let cur = goal; while (cur >= 0) { path.push(cur); cur = prev[cur]; } path.reverse(); }
    return { win, dist, prev, path };
  }

  // AI 演示：把路径格拧回解向的顺时针点击序列 [{idx, taps}]
  function solutionRotations(board) {
    const seq = [];
    for (const k of Object.keys(board.sol)) {
      const idx = +k;
      const cell = board.cells[idx];
      const target = board.sol[idx];
      const mod = cell.type === 'straight' ? 2 : 4;
      const taps = ((target - cell.rot) % mod + mod) % mod;
      if (taps > 0) seq.push({ idx, taps });
    }
    return seq;
  }

  // 供 game 做水流揭示方向：两种 path d 都从 N 边起点画
  const pathStartEdge = () => 0;

  return {
    COLS, OPP, LS_ST, LS_CFG, DEFAULT_CFG,
    rowsForLevel, timeForLevel, cons, hasEdge, pieceFor,
    genBoard, solveFrom, solutionRotations, pathStartEdge,
  };
})();
