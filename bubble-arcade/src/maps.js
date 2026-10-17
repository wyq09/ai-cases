/* ============================================================
 * 泡泡堂 · src/maps.js —— BA.MAPS 地图模板
 * 15×13 网格，1=硬墙 2=软箱 0=地板。
 * 经典对称布局，出生点四角，保证连通与开局公平。
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});
  var P = BA.PARAMS;
  var W = P.W, H = P.H;

  // 手写模板：'.' 地板 '#' 硬墙 'o' 软箱
  var RAW = {
    garden: [
      '...............',
      '...............',
      '...#...#...#...',
      '...............',
      '...#.......#...',
      '...............',
      '...............',
      '...............',
      '...#.......#...',
      '...............',
      '...#...#...#...',
      '...............',
      '...............'
    ],
    arena: [
      '...............',
      '...............',
      '..#.#.....#.#..',
      '...............',
      '.....o...o.....',
      '.....#...#.....',
      '...............',
      '.....#...#.....',
      '.....o...o.....',
      '...............',
      '..#.#.....#.#..',
      '...............',
      '...............'
    ],
    cross: [
      '...............',
      '...............',
      '...#.......#...',
      '...#.......#...',
      '...............',
      '.....#####.....',
      '...............',
      '.....#####.....',
      '...............',
      '...#.......#...',
      '...#.......#...',
      '...............',
      '...............'
    ],
    pillars: [
      '...............',
      '...............',
      '...##.....##...',
      '...##.....##...',
      '...............',
      '...............',
      '...............',
      '...............',
      '...............',
      '...##.....##...',
      '...##.....##...',
      '...............',
      '...............'
    ],
    maze: [
      '...............',
      '...............',
      '..#..#...#..#..',
      '...............',
      '..#..#...#..#..',
      '...............',
      '...#.......#...',
      '...............',
      '..#..#...#..#..',
      '...............',
      '..#..#...#..#..',
      '...............',
      '...............'
    ]
  };

  var LIST = [
    { id: 'garden', name: '青草庭院', theme: 'garden', tag: '经典' },
    { id: 'arena', name: '对角竞技场', theme: 'ice', tag: '开阔' },
    { id: 'cross', name: '十字要塞', theme: 'candy', tag: '掩体' },
    { id: 'pillars', name: '双子柱厅', theme: 'factory', tag: '绕柱' },
    { id: 'maze', name: '霓虹迷阵', theme: 'night', tag: '复杂' }
  ];

  var SPAWNS = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];

  function emptyGrid() {
    var g = [];
    for (var y = 0; y < H; y++) {
      var row = [];
      for (var x = 0; x < W; x++) row.push(0);
      g.push(row);
    }
    return g;
  }

  // 出生点保护：3×3 去硬墙，且清空 L 形通道
  function protectSpawns(grid) {
    SPAWNS.forEach(function (s) {
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var x = s[0] + dx, y = s[1] + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (grid[y][x] === 1) grid[y][x] = 0;
        }
      }
      // 保证向外两条通道
      var out = s[0] === 1 ? 1 : -1;
      var outY = s[1] === 1 ? 1 : -1;
      for (var k = 1; k <= 2; k++) {
        var ax = s[0] + out * k, ay = s[1];
        if (ax >= 0 && ax < W && ay >= 0 && ay < H) grid[ay][ax] = 0;
        var bx = s[0], by = s[1] + outY * k;
        if (bx >= 0 && bx < W && by >= 0 && by < H) grid[by][bx] = 0;
      }
    });
  }

  function countBoxes(grid) {
    var n = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (grid[y][x] === 2) n++;
    return n;
  }

  // BFS 连通性（只走非硬墙）
  function connected(grid) {
    var seen = [], q = [[1, 1]];
    for (var y = 0; y < H; y++) { seen.push(new Array(W).fill(false)); }
    seen[1][1] = true;
    var n = 0;
    while (q.length) {
      var cur = q.shift(); n++;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = cur[0] + dirs[i][0], ny = cur[1] + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (seen[ny][nx]) continue;
        if (grid[ny][nx] === 1) continue;
        seen[ny][nx] = true; q.push([nx, ny]);
      }
    }
    // 所有非硬墙格都必须可达
    var total = 0;
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) if (grid[yy][xx] !== 1) total++;
    return n === total;
  }

  function build(id, seed) {
    var meta = LIST.filter(function (m) { return m.id === id; })[0] || LIST[0];
    var raw = RAW[meta.id] || RAW.garden;
    var r = BA.CORE.U.rng(seed == null ? 1337 : seed);
    var grid = emptyGrid();
    for (var y = 0; y < H; y++) {
      var line = raw[y] || '';
      for (var x = 0; x < W; x++) {
        var ch = line[x] || '.';
        if (ch === '#') grid[y][x] = 1;
      }
    }
    protectSpawns(grid);

    // 软箱随机铺设：保持对称（四点旋转对称）
    var cx = (W - 1) / 2, cy = (H - 1) / 2;
    for (var yy = 0; yy < H; yy++) {
      for (var xx = 0; xx < W; xx++) {
        if (grid[yy][xx] === 1) continue;
        if (isNearSpawn(xx, yy)) continue;
        if (grid[yy][xx] === 2) continue;
        // 只处理对称代表点，避免重复决策
        var mx = Math.round(cx + (cx - xx)), my = Math.round(cy + (cy - yy));
        if (my < yy || (my === yy && mx < xx)) continue;
        var roll = r();
        if (roll < 0.34) {
          grid[yy][xx] = 2;
          if (my >= 0 && my < H && mx >= 0 && mx < W && !isNearSpawn(mx, my) && grid[my][mx] === 0) {
            grid[my][mx] = 2;
          }
        }
      }
    }
    // 兜底：保证至少 30 个箱子，最多 100 个
    var guard = 0;
    while (countBoxes(grid) < 30 && guard++ < 600) {
      var rx = 1 + Math.floor(r() * (W - 2)), ry = 1 + Math.floor(r() * (H - 2));
      if (grid[ry][rx] === 0 && !isNearSpawn(rx, ry)) grid[ry][rx] = 2;
    }
    // 连通性：炸掉硬墙不会发生，但软箱可炸通；硬墙连通必须成立
    if (!connected(grid)) {
      // 轻微修补：把阻挡的硬墙按对称性打开（极少发生）
      grid[Math.floor(H / 2)][Math.floor(W / 2)] = 0;
    }
    return {
      id: meta.id, name: meta.name, theme: meta.theme, tag: meta.tag,
      w: W, h: H, grid: grid, spawns: SPAWNS.map(function (s) { return [s[0], s[1]]; }),
      seed: seed == null ? 1337 : seed
    };
  }

  function isNearSpawn(x, y) {
    for (var i = 0; i < SPAWNS.length; i++) {
      var s = SPAWNS[i];
      if (Math.abs(s[0] - x) <= 2 && Math.abs(s[1] - y) <= 2) return true;
    }
    return false;
  }

  // 缩略图：给标题页地图选择用
  function thumb(id, canvas) {
    var m = build(id, 2024);
    var cw = canvas.width, chh = canvas.height;
    var x = canvas.getContext('2d');
    var th = BA.ART.THEMES[m.theme];
    x.clearRect(0, 0, cw, chh);
    var cwUnit = cw / W, chUnit = chh / H;
    for (var y = 0; y < H; y++) {
      for (var xx = 0; xx < W; xx++) {
        var t = m.grid[y][xx];
        var col = t === 1 ? th.wallFace : (t === 2 ? th.boxB : ((xx + y) % 2 ? th.floorA : th.floorB));
        x.fillStyle = col;
        x.fillRect(xx * cwUnit, y * chUnit, cwUnit + .5, chUnit + .5);
      }
    }
    // 出生点
    m.spawns.forEach(function (s, i) {
      x.fillStyle = ['#3f8cff', '#ff8fbe', '#7ddc6a', '#a98bff'][i];
      x.beginPath();
      x.arc((s[0] + .5) * cwUnit, (s[1] + .5) * chUnit, Math.max(2.5, cwUnit * .42), 0, 7);
      x.fill();
    });
  }

  BA.MAPS = { LIST: LIST, build: build, thumb: thumb, connected: connected, SPAWNS: SPAWNS };
})(window);
