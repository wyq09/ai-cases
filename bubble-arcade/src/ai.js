/* ============================================================
 * 泡泡堂 · src/ai.js —— BA.AI 机器人
 * 危险图 + BFS 寻路 + 放泡可逃逸校验。三档难度。
 * 纯函数式：只读取 S，通过设置 p.wantDir / p.wantBomb 影响主循环。
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});
  var P = BA.PARAMS;
  var W = P.W, H = P.H;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var DIR_NAMES = ['up', 'right', 'down', 'left'];

  function tileOf(p) { return [Math.floor(p.x), Math.floor(p.y)]; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function walkable(S, x, y) {
    if (!inb(x, y)) return false;
    var t = S.grid[y][x];
    return t === 0;
  }
  function bombAt(S, x, y) {
    for (var i = 0; i < S.bombs.length; i++) {
      var b = S.bombs[i];
      if (b.tx === x && b.ty === y) return b;
    }
    return null;
  }
  function itemAt(S, x, y) {
    for (var i = 0; i < S.items.length; i++) {
      var it = S.items[i];
      if (it.x === x && it.y === y) return it;
    }
    return null;
  }

  /* ---------------- 危险图 ---------------- */
  // 返回 {danger:Float32Array, blocked:Uint8Array, timers}
  // danger[i] = 距离爆炸的秒数（>0），0 表示安全
  function dangerMap(S) {
    var N = W * H;
    var d = new Float32Array(N);
    for (var i = 0; i < N; i++) d[i] = 0;
    function mark(x, y, t) {
      if (!inb(x, y)) return;
      var k = y * W + x;
      if (d[k] === 0 || t < d[k]) d[k] = t;
    }
    for (var bi = 0; bi < S.bombs.length; bi++) {
      var b = S.bombs[bi];
      var t = Math.max(0.02, b.fuse);
      mark(b.tx, b.ty, t);
      for (var di = 0; di < 4; di++) {
        var dx = DIRS[di][0], dy = DIRS[di][1];
        for (var r = 1; r <= b.power; r++) {
          var x = b.tx + dx * r, y = b.ty + dy * r;
          if (!inb(x, y)) break;
          var cell = S.grid[y][x];
          if (cell === 1) break;
          if (cell === 2) { mark(x, y, t); break; }
          mark(x, y, t);
          if (bombAt(S, x, y)) break;
        }
      }
    }
    return d;
  }

  /* ---------------- BFS ---------------- */
  // 从 (sx,sy) 出发到满足 goal(x,y) 的最近格；返回路径数组（不含起点）
  function bfs(S, sx, sy, goal, opt) {
    opt = opt || {};
    var N = W * H;
    var prev = new Int32Array(N).fill(-1);
    var seen = new Uint8Array(N);
    var q = new Int32Array(N);
    var qh = 0, qt = 0;
    var start = sy * W + sx;
    seen[start] = 1; q[qt++] = start;
    var found = -1;
    while (qh < qt) {
      var cur = q[qh++];
      var cx = cur % W, cy = (cur - cx) / W;
      if (goal(cx, cy) && cur !== start) { found = cur; break; }
      for (var i = 0; i < 4; i++) {
        var nx = cx + DIRS[i][0], ny = cy + DIRS[i][1];
        if (!inb(nx, ny)) continue;
        var k = ny * W + nx;
        if (seen[k]) continue;
        if (!walkable(S, nx, ny)) continue;
        if (opt.avoidBomb && bombAt(S, nx, ny)) continue;
        if (opt.danger && opt.danger[k] > 0 && !(opt.allowDanger)) continue;
        seen[k] = 1; prev[k] = cur;
        q[qt++] = k;
      }
    }
    if (found < 0) return null;
    var path = [];
    var c = found;
    while (c !== start && c >= 0) {
      var px = c % W, py = (c - px) / W;
      path.push([px, py]);
      c = prev[c];
    }
    path.reverse();
    return path;
  }

  function stepTo(p, path) {
    if (!path || !path.length) return null;
    var t = tileOf(p);
    var nx = path[0][0], ny = path[0][1];
    // 已到达该格中心附近 → 前进一步
    if (Math.abs(p.x - (nx + .5)) < 0.22 && Math.abs(p.y - (ny + .5)) < 0.22) {
      path.shift();
      if (!path.length) return null;
      nx = path[0][0]; ny = path[0][1];
    }
    var dx = nx + .5 - p.x, dy = ny + .5 - p.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    if (Math.abs(dy) > 0.02) return dy > 0 ? 'down' : 'up';
    if (Math.abs(dx) > 0.02) return dx > 0 ? 'right' : 'left';
    return null;
  }

  // 放泡后能否逃逸：模拟该格出现炸弹，找安全格
  function canEscape(S, p, tx, ty) {
    var power = p.power;
    var fuse = S.cfg.fuse;
    // 构造临时危险
    var N = W * H;
    var d = dangerMap(S);
    function mark(x, y, t) {
      if (!inb(x, y)) return;
      var k = y * W + x;
      if (d[k] === 0 || t < d[k]) d[k] = t;
    }
    mark(tx, ty, fuse);
    for (var di = 0; di < 4; di++) {
      for (var r = 1; r <= power; r++) {
        var x = tx + DIRS[di][0] * r, y = ty + DIRS[di][1] * r;
        if (!inb(x, y)) break;
        if (S.grid[y][x] === 1) break;
        mark(x, y, fuse);
        if (S.grid[y][x] === 2) break;
        if (bombAt(S, x, y)) break;
      }
    }
    // 需要一条路径：步数 × 每步耗时 < fuse - 0.15，且终点安全
    var stepTime = 1 / Math.max(0.6, p.speed);
    var path = bfs(S, tx, ty, function (x, y) {
      var k = y * W + x;
      return d[k] === 0;
    }, { avoidBomb: true });
    if (!path) return false;
    return path.length * stepTime < fuse - 0.18;
  }

  /* ---------------- 主决策 ---------------- */
  function think(S, p, dt) {
    if (!p.alive || p.trapped) { p.wantDir = null; p.wantBomb = false; return; }
    var ai = p.ai;
    ai.t = (ai.t || 0) + dt;
    ai.replan = (ai.replan || 0) - dt;
    ai.bombCd = (ai.bombCd || 0) - dt;

    var me = tileOf(p);
    var dmap = dangerMap(S);
    var myDanger = dmap[me[1] * W + me[0]];

    // 受困危险：优先逃
    if (myDanger > 0) {
      ai.mode = 'flee';
      // 每帧重算（危险在变），但限制频率
      if (ai.replan <= 0 || !ai.path || !ai.path.length) {
        ai.replan = 0.1;
        ai.path = bfs(S, me[0], me[1], function (x, y) {
          return dmap[y * W + x] === 0;
        }, { avoidBomb: true });
        if (!ai.path) {
          // 无安全格：找最远的危险格（拖延）或站着不动
          ai.path = bfs(S, me[0], me[1], function (x, y) {
            return dmap[y * W + x] > myDanger + 0.25;
          }, { avoidBomb: true });
        }
      }
      var nd = stepTo(p, ai.path);
      p.wantDir = nd;
      p.wantBomb = false;
      if (!nd && !ai.path) p.wantDir = null;
      return;
    }

    // 安全状态
    var pathLen = ai.path ? ai.path.length : 0;
    if (ai.replan <= 0 || !ai.path || pathLen === 0) {
      ai.replan = ai.diff.replan;
      ai.path = chooseGoal(S, p, dmap, ai);
    }
    var dir = stepTo(p, ai.path);

    // 卡住检测
    var moved = Math.abs(p.x - (ai.lx == null ? p.x : ai.lx)) + Math.abs(p.y - (ai.ly == null ? p.y : ai.ly));
    ai.lx = p.x; ai.ly = p.y;
    ai.stuck = moved < 0.012 ? (ai.stuck || 0) + dt : 0;
    if (ai.stuck > 0.7) {
      ai.path = null; ai.replan = 0; ai.stuck = 0;
      dir = DIR_NAMES[Math.floor(Math.random() * 4)];
    }

    p.wantDir = dir;

    // 放泡决策
    var wantBomb = false;
    if (ai.bombCd <= 0 && p.activeBombs < p.maxBombs) {
      var nearBox = false, nearEnemy = false;
      for (var di = 0; di < 4; di++) {
        var nx = me[0] + DIRS[di][0], ny = me[1] + DIRS[di][1];
        if (!inb(nx, ny)) continue;
        if (S.grid[ny][nx] === 2) nearBox = true;
        if (S.grid[ny][nx] === 1) continue;
      }
      S.players.forEach(function (o) {
        if (o === p || !o.alive) return;
        if (o.team === p.team && S.mode !== 'ffa') return;
        var dx = Math.abs(o.x - p.x), dy = Math.abs(o.y - p.y);
        if (dx + dy < 2.4) nearEnemy = true;
      });
      // 困难模式会主动堵人
      var aggr = ai.diff.aggr;
      var should = nearBox || (nearEnemy && Math.random() < aggr);
      if (should && canEscape(S, p, me[0], me[1])) {
        wantBomb = true;
        ai.bombCd = ai.diff.bombCd;
        ai.path = null; ai.replan = 0;
      }
    }
    p.wantBomb = wantBomb;
  }

  // 目标选择：道具 > 箱子 > 敌人 > 游走
  function chooseGoal(S, p, dmap, ai) {
    var me = tileOf(p);
    var safe = function (x, y) { return dmap[y * W + x] === 0; };

    // 1. 附近安全道具
    var bestItem = null, bestD = 1e9;
    for (var i = 0; i < S.items.length; i++) {
      var it = S.items[i];
      if (dmap[it.y * W + it.x] > 0) continue;
      var dd = Math.abs(it.x - me[0]) + Math.abs(it.y - me[1]);
      if (dd < bestD) { bestD = dd; bestItem = it; }
    }
    if (bestItem && bestD <= ai.diff.itemRange) {
      var p1 = bfs(S, me[0], me[1], function (x, y) {
        return x === bestItem.x && y === bestItem.y;
      }, { avoidBomb: true });
      if (p1) return p1;
    }

    // 2. 敌人
    var target = null, td = 1e9;
    S.players.forEach(function (o) {
      if (o === p || !o.alive || o.trapped) return;
      if (o.team === p.team && S.mode !== 'ffa') return;
      var dx = Math.abs(o.x - p.x) + Math.abs(o.y - p.y);
      if (dx < td) { td = dx; target = o; }
    });

    // 3. 最近的箱子（可炸路径）
    var bestBox = null, bd = 1e9;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (S.grid[y][x] !== 2) continue;
        var dist = Math.abs(x - me[0]) + Math.abs(y - me[1]);
        if (dist < bd) { bd = dist; bestBox = [x, y]; }
      }
    }

    // 有敌人且距离近：靠过去
    if (target && td < 6.5 && Math.random() < ai.diff.hunt) {
      var tp = bfs(S, me[0], me[1], function (x, y) {
        return Math.abs(x + .5 - target.x) + Math.abs(y + .5 - target.y) <= 1.6;
      }, { avoidBomb: true });
      if (tp) return tp;
    }

    // 找箱子相邻格
    if (bestBox) {
      var bp = bfs(S, me[0], me[1], function (x, y) {
        if (S.grid[y][x] !== 0) return false;
        for (var k = 0; k < 4; k++) {
          var nx = x + DIRS[k][0], ny = y + DIRS[k][1];
          if (inb(nx, ny) && S.grid[ny][nx] === 2) return true;
        }
        return false;
      }, { avoidBomb: true });
      if (bp) return bp;
    }

    // 游走：随机可达格
    var rx = me[0], ry = me[1];
    for (var tries = 0; tries < 12; tries++) {
      rx = 1 + Math.floor(Math.random() * (W - 2));
      ry = 1 + Math.floor(Math.random() * (H - 2));
      if (walkable(S, rx, ry) && dmap[ry * W + rx] === 0) break;
    }
    return bfs(S, me[0], me[1], function (x, y) { return x === rx && y === ry; }, { avoidBomb: true });
  }

  BA.AI = {
    think: think,
    dangerMap: dangerMap,
    bfs: bfs,
    canEscape: canEscape,
    DIFF: {
      easy:   { replan: 0.36, bombCd: 1.5,  aggr: 0.20, hunt: 0.25, itemRange: 6,  speedMul: 0.82, mistake: 0.22, mashRate: 0 },
      normal: { replan: 0.18, bombCd: 0.85, aggr: 0.55, hunt: 0.55, itemRange: 10, speedMul: 0.96, mistake: 0.07, mashRate: 3.4 },
      hard:   { replan: 0.09, bombCd: 0.45, aggr: 0.85, hunt: 0.85, itemRange: 14, speedMul: 1.0,  mistake: 0, mashRate: 6.5 }
    }
  };
})(window);
