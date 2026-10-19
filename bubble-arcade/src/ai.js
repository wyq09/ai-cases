/* ============================================================
 * 泡泡堂 · src/ai.js —— BA.AI 机器人 v2
 *
 * 目标：不再"站桩等死"，而是像人一样算步数、算引信、算敌人位置。
 *
 * 1) 威胁模型：时间感知危险图
 *    danger[cell] = 该格"还有几秒会被炸"，0 表示永远安全。
 *    并模拟链式引爆（被别的泡泡点燃 → 0.09s 后二次爆炸，炸点范围更大）。
 * 2) 逃生寻路：时间感知搜索（不是"最近安全格"）
 *    约束：走到下一格并穿出它的时间，必须早于它被炸的时刻（留安全余量）。
 *    没有全安全路线时退化为"活得最久"的路线——跑向最晚爆炸的区域，
 *    而不是站着不动。
 * 3) 区域分析：连通区域大小。AI 知道自己是否困在死胡同，
 *    会主动炸开通往大区域的路，而不是在原地转圈。
 * 4) 放泡决策：预判敌人 fuse 秒后的落点，能堵就堵；能炸开通路就炸。
 *    每次放泡都用同一套危险模型校验"放完还能不能活着跑掉"。
 * 5) 走位：与自由移动手感对齐——先对齐中线再转向，不会卡墙角。
 * 6) 困泡：高速自救按键（11 下），尽量从泡泡里爬出来。
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});
  var P = BA.PARAMS;
  var W = P.W, H = P.H, N = W * H;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var DIR_VEC = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  var INF = 1e9;

  /* ---------------- 基础查询 ---------------- */
  function tileOf(p) { return [Math.floor(p.x), Math.floor(p.y)]; }
  // 确定性随机：每个 bot 一条种子流，同一局重放结果一致（方便回归对比）
  function rnd(ai) { return (ai && ai.rng) ? ai.rng() : Math.random(); }
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function walkable(S, x, y) { return inb(x, y) && S.grid[y][x] === 0; }
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
      if (Math.abs(it.x - x) < 0.6 && Math.abs(it.y - y) < 0.6) return it;
    }
    return null;
  }
  // 泡泡爆炸会波及的格子（与引擎 explodeBomb 一致：硬墙挡、软箱格算命中但不继续、被泡泡挡住）
  function blastCells(S, b, bombs) {
    var out = [b.tx, b.ty];
    var power = b.power + (b.pierce ? 1 : 0);
    for (var di = 0; di < 4; di++) {
      var dx = DIRS[di][0], dy = DIRS[di][1];
      for (var r = 1; r <= power; r++) {
        var x = b.tx + dx * r, y = b.ty + dy * r;
        if (!inb(x, y)) break;
        var cell = S.grid[y][x];
        if (cell === 1) break;
        out.push(x, y);
        if (cell === 2 && !b.pierce) break;
        var other = bombAtIn(bombs, x, y);
        if (other) break;
      }
    }
    return out;
  }
  function bombAtIn(bombs, x, y) {
    for (var i = 0; i < bombs.length; i++) {
      var b = bombs[i];
      if (b.tx === x && b.ty === y) return b;
    }
    return null;
  }
  function blastHas(cells, x, y) {
    for (var i = 0; i < cells.length; i += 2) {
      if (cells[i] === x && cells[i + 1] === y) return true;
    }
    return false;
  }

  /* ---------------- 危险图（含链式引爆） ---------------- */
  // danger[cell] = 该格多久后会被炸（秒）；0 = 永远安全
  // extra：可选的"假想泡泡"（用于校验放泡后还能不能跑掉）
  function dangerMap(S, extra) {
    var bombs = S.bombs;
    if (extra) bombs = bombs.concat([extra]);
    var n = bombs.length;
    var times = new Float32Array(n);
    var blasts = new Array(n);
    for (var i = 0; i < n; i++) {
      times[i] = Math.max(0.02, bombs[i].fuse || 0);
      blasts[i] = blastCells(S, bombs[i], bombs);
    }
    // 链式：A 的爆炸范围里有 B → B 在 A 的爆炸时刻 +0.09s 炸
    for (var pass = 0; pass < 3; pass++) {
      var changed = false;
      for (var a = 0; a < n; a++) {
        for (var b = 0; b < n; b++) {
          if (a === b) continue;
          var nt = times[b] + 0.09;
          if (nt < times[a] && blastHas(blasts[b], bombs[a].tx, bombs[a].ty)) {
            times[a] = nt; changed = true;
          }
        }
      }
      if (!changed) break;
    }
    var d = new Float32Array(N);
    for (var i2 = 0; i2 < n; i2++) {
      var cells = blasts[i2], t = times[i2];
      for (var c = 0; c < cells.length; c += 2) {
        var k = cells[c + 1] * W + cells[c];
        if (d[k] === 0 || t < d[k]) d[k] = t;
      }
    }
    return d;
  }

  /* ---------------- 连通区域（走位安全分析） ---------------- */
  // 软箱算障碍：AI 现在走不过去；区域大小用来判断"是不是死胡同"
  function components(S) {
    var id = new Int32Array(N);
    for (var i = 0; i < N; i++) id[i] = -1;
    var size = [];
    var q = new Int32Array(N);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var k = y * W + x;
        if (id[k] >= 0 || S.grid[y][x] !== 0) continue;
        var cid = size.length, cnt = 0, qh = 0, qt = 0;
        id[k] = cid; q[qt++] = k;
        while (qh < qt) {
          var cur = q[qh++]; cnt++;
          var cx = cur % W, cy = (cur - cx) / W;
          for (var di = 0; di < 4; di++) {
            var nx = cx + DIRS[di][0], ny = cy + DIRS[di][1];
            if (!inb(nx, ny)) continue;
            var nk = ny * W + nx;
            if (id[nk] >= 0 || S.grid[ny][nx] !== 0) continue;
            id[nk] = cid; q[qt++] = nk;
          }
        }
        size.push(cnt);
      }
    }
    return { id: id, size: size };
  }

  /* ---------------- BFS 距离场 ---------------- */
  // 从起点做一次 BFS，得到每格距离（格数）；同时用于反推路径
  function distField(S, sx, sy, opt) {
    opt = opt || {};
    var dist = new Int32Array(N);
    for (var i = 0; i < N; i++) dist[i] = -1;
    if (!inb(sx, sy)) return dist;
    var q = new Int32Array(N), qh = 0, qt = 0;
    var s = sy * W + sx;
    dist[s] = 0; q[qt++] = s;
    while (qh < qt) {
      var cur = q[qh++];
      var cx = cur % W, cy = (cur - cx) / W;
      for (var di = 0; di < 4; di++) {
        var nx = cx + DIRS[di][0], ny = cy + DIRS[di][1];
        if (!inb(nx, ny)) continue;
        var k = ny * W + nx;
        if (dist[k] >= 0) continue;
        if (!walkable(S, nx, ny)) continue;
        if (opt.avoidBomb && bombAt(S, nx, ny)) continue;
        if (opt.danger && opt.danger[ny * W + nx] > 0) continue;   // 规划路线不穿爆炸区
        dist[k] = dist[cur] + 1;
        q[qt++] = k;
      }
    }
    return dist;
  }
  // 沿距离场下坡回溯出路径（不含起点）
  function pathFromDist(S, dist, gx, gy, sx, sy) {
    var path = [];
    var x = gx, y = gy;
    var guard = 0;
    while ((x !== sx || y !== sy) && guard++ < N) {
      path.push([x, y]);
      var best = -1, bestD = dist[y * W + x];
      for (var di = 0; di < 4; di++) {
        var nx = x + DIRS[di][0], ny = y + DIRS[di][1];
        if (!inb(nx, ny)) continue;
        var nd = dist[ny * W + nx];
        if (nd >= 0 && nd < bestD) { bestD = nd; best = ny * W + nx; }
      }
      if (best < 0) break;
      x = best % W; y = (best - (best % W)) / W;
    }
    path.reverse();
    return path;
  }
  // 旧接口兼容：通用 BFS
  function bfs(S, sx, sy, goal, opt) {
    opt = opt || {};
    var dist = distField(S, sx, sy, { avoidBomb: opt.avoidBomb });
    var best = -1, bd = INF;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (x === sx && y === sy) continue;
        var d = dist[y * W + x];
        if (d < 0) continue;
        if (!goal(x, y)) continue;
        if (d < bd) { bd = d; best = y * W + x; }
      }
    }
    if (best < 0) return null;
    return pathFromDist(S, dist, best % W, (best - (best % W)) / W, sx, sy);
  }

  /* ---------------- 逃生：时间感知 + 不钻死角 ---------------- */
  // 一格的可走邻居数：1 = 死胡同，被人堵一个口就彻底没救
  function freeDegree(S, x, y) {
    var n = 0;
    for (var di = 0; di < 4; di++) {
      var nx = x + DIRS[di][0], ny = y + DIRS[di][1];
      if (!walkable(S, nx, ny)) continue;
      if (bombAt(S, nx, ny)) continue;
      n++;
    }
    return n;
  }
  // 从 start 出发，找一条"每一格都能在被炸之前穿过"的路线
  // 返回 {path, safe, time}；safe = 终点是永久安全格
  function escapeSearch(S, p, danger, start, opt) {
    opt = opt || {};
    var stepTime = 1 / Math.max(0.9, p.speed);
    var margin = opt.margin != null ? opt.margin : 0.22;
    var noDead = !!opt.noDeadEnd;
    var dist = new Int32Array(N);
    for (var i = 0; i < N; i++) dist[i] = -1;
    var q = new Int32Array(N), qh = 0, qt = 0;
    var s = start[1] * W + start[0];
    dist[s] = 0; q[qt++] = s;
    var safeGoal = -1, safeDist = INF;
    var lateGoal = -1, lateTime = -1;
    while (qh < qt) {
      var cur = q[qh++];
      var cx = cur % W, cy = (cur - cx) / W;
      var cd = danger[cur];
      // 终点评估：永久安全格优先，其次"最晚爆炸"的格
      if (cur !== s) {
        var dead = noDead && freeDegree(S, cx, cy) <= 1;
        if (!dead) {
          if (cd === 0) {
            if (dist[cur] < safeDist) { safeDist = dist[cur]; safeGoal = cur; }
          } else if (cd > lateTime) { lateTime = cd; lateGoal = cur; }
        }
      }
      for (var di = 0; di < 4; di++) {
        var nx = cx + DIRS[di][0], ny = cy + DIRS[di][1];
        if (!inb(nx, ny)) continue;
        var k = ny * W + nx;
        if (dist[k] >= 0) continue;
        if (!walkable(S, nx, ny)) continue;
        if (bombAt(S, nx, ny)) continue;              // 泡泡挡路，走不过去
        var arrive = (dist[cur] + 1) * stepTime;     // 到达该格中心的时刻
        var dg = danger[k];
        // 必须能在被炸之前穿出这一格
        if (dg !== 0 && arrive + stepTime > dg - margin) continue;
        dist[k] = dist[cur] + 1;
        q[qt++] = k;
      }
    }
    var goal = safeGoal >= 0 ? safeGoal : lateGoal;
    if (goal < 0) return null;
    var gx = goal % W, gy = (goal - (goal % W)) / W;
    return {
      path: pathFromDist(S, dist, gx, gy, start[0], start[1]),
      safe: safeGoal >= 0,
      time: dist[goal] * stepTime
    };
  }

  // 放泡之后还能不能活着跑掉（同一套危险模型）
  function canEscape(S, p, tx, ty) {
    var fuse = S.cfg.fuse || P.FUSE;
    var fake = {
      tx: tx, ty: ty, x: tx + 0.5, y: ty + 0.5,
      power: p.power, pierce: !!p.pierce,
      fuse: fuse, maxFuse: fuse, owner: p, exploded: false, moving: false
    };
    var danger = dangerMap(S, fake);
    var stepT = 1 / Math.max(0.9, p.speed);
    // 优先走"不是死胡同"的路线：被人堵一个口就彻底没救
    var r = escapeSearch(S, p, danger, [tx, ty], { margin: 0.26, noDeadEnd: true });
    if (!r || !r.safe) r = escapeSearch(S, p, danger, [tx, ty], { margin: 0.26 });
    if (!r || !r.safe) return false;
    return r.time + stepT < fuse - 0.22;
  }

  /* ---------------- 走位（对齐自由移动手感） ---------------- */
  // 返回方向字符串；路径首格与当前格不相邻时返回 null（需要重规划）
  function steer(p, path) {
    if (!path || !path.length) return null;
    var cur = tileOf(p);
    var nx = path[0][0], ny = path[0][1];
    var d = Math.abs(nx - cur[0]) + Math.abs(ny - cur[1]);
    if (d === 0) {
      // 已经走进这一格 → 消耗掉，继续下一格
      path.shift();
      if (!path.length) return null;
      nx = path[0][0]; ny = path[0][1];
      d = Math.abs(nx - cur[0]) + Math.abs(ny - cur[1]);
      if (d !== 1) return null;
    } else if (d !== 1) {
      return null;                       // 路径已失效（位置漂移），需要重规划
    }
    // 先把身体对齐到当前格中线，再转向——自由移动下这样才不会蹭墙角
    if (ny === cur[1]) {
      var dy = (cur[1] + 0.5) - p.y;
      if (Math.abs(dy) > 0.10) return dy > 0 ? 'down' : 'up';
      return nx > cur[0] ? 'right' : 'left';
    }
    var dx = (cur[0] + 0.5) - p.x;
    if (Math.abs(dx) > 0.10) return dx > 0 ? 'right' : 'left';
    return ny > cur[1] ? 'down' : 'up';
  }

  /* ---------------- 敌人预测 ---------------- */
  // 敌人 fuse 秒后大概在哪（沿当前朝向外推，撞墙就停）
  function predictPos(S, e, t) {
    var v = DIR_VEC[e.dir] || [0, 0];
    var x = e.x, y = e.y;
    if (!v[0] && !v[1]) return [Math.floor(x), Math.floor(y)];
    var travel = e.speed * t;
    while (travel > 0) {
      var nx = x + v[0], ny = y + v[1];
      if (!walkable(S, Math.floor(nx), Math.floor(ny))) break;
      if (bombAt(S, Math.floor(nx), Math.floor(ny))) break;
      x = nx; y = ny; travel -= 1;
    }
    return [Math.floor(x), Math.floor(y)];
  }
  // 泡泡放在 (cx,cy) 能否炸到 (ax,ay)：必须同行/同列、距离在威力内、中间无墙无箱
  function canHit(S, cx, cy, ax, ay, power) {
    if (cx === ax) {
      var dy = Math.abs(ay - cy);
      if (dy > power) return false;
      var sy = ay > cy ? 1 : -1;
      for (var r = 1; r < dy; r++) {
        var t = S.grid[cy + sy * r][cx];
        if (t === 1 || t === 2) return false;
      }
      return true;
    }
    if (cy === ay) {
      var dx = Math.abs(ax - cx);
      if (dx > power) return false;
      var sx = ax > cx ? 1 : -1;
      for (var r2 = 1; r2 < dx; r2++) {
        var t2 = S.grid[cy][cx + sx * r2];
        if (t2 === 1 || t2 === 2) return false;
      }
      return true;
    }
    return false;
  }
  function enemiesOf(S, p) {
    var out = [];
    for (var i = 0; i < S.players.length; i++) {
      var o = S.players[i];
      if (o === p || !o.alive) continue;
      if (o.team === p.team && S.mode !== 'ffa') continue;
      out.push(o);
    }
    return out;
  }
  // 敌人站在 (ax,ay) 时，还有几条能躲开"以 (cx,cy) 为心的水柱"的路
  function dodgeCount(S, ax, ay, cx, cy, power) {
    var n = 0;
    for (var di = 0; di < 4; di++) {
      var nx = ax + DIRS[di][0], ny = ay + DIRS[di][1];
      if (!walkable(S, nx, ny)) continue;
      // 这一格本身会被炸到 → 躲不过去
      if (nx === cx && ny === cy) continue;
      if (Math.abs(nx - cx) <= power && Math.abs(ny - cy) <= power) {
        if (nx === cx || ny === cy) continue;   // 与爆心同行/同列且在威力内 → 也在水柱里
      }
      n++;
    }
    return n;
  }
  // 走廊封路：敌人在走廊尽头，我在它身后同一条通道 → 一泡封死，必杀
  // (cx,cy) 是准备放泡的位置；返回 0 表示不成局
  function corridorKillAt(S, cx, cy, e, fuse) {
    var ex = Math.floor(e.x), ey = Math.floor(e.y);
    if (ex === cx && ey === cy) return 0;          // 同一格
    if (ey !== cy && ex !== cx) return 0;          // 不同行也不同列
    // 敌人那头必须是死胡同
    if (freeDegree(S, ex, ey) > 1) return 0;
    // 中间不能有岔口，否则敌人能绕出去
    var dx = Math.sign(cx - ex), dy = Math.sign(cy - ey);
    var x = ex, y = ey, guard = 0;
    while ((x !== cx || y !== cy) && guard++ < W + H) {
      x += dx; y += dy;
      if (!inb(x, y)) return 0;
      if (x === cx && y === cy) break;
      if (freeDegree(S, x, y) > 1) return 0;
    }
    // 威力要够得到敌人
    if (!canHit(S, cx, cy, ex, ey, e.power != null ? e.power : 1)) return 0;
    var dist = Math.abs(cx - ex) + Math.abs(cy - ey);
    if (dist > (e.power != null ? e.power : 1)) return 0;
    if (dist / Math.max(0.5, e.speed) > fuse * 0.6) return 0;
    return 2.0;
  }
  function corridorKill(S, p, e, fuse) {
    return corridorKillAt(S, Math.floor(p.x), Math.floor(p.y), e, fuse);
  }
  // 敌人正朝我脚下冲？——这是最可靠的堵人机会：往脚下放一泡就能逮住
  // 但前提是对方确实在往这个方向走（而不是刚好路过），否则纯属浪费泡泡
  function approachKill(S, p, e, fuse) {
    if (!foeCommitted(S, p, e)) return 0;
    var v = DIR_VEC[e.dir];
    if (!v || (!v[0] && !v[1])) return 0;
    var ex = Math.floor(e.x), ey = Math.floor(e.y);
    var mx = Math.floor(p.x), my = Math.floor(p.y);
    if (v[0] && ey === my) {
      var dx = mx - ex;
      if (dx !== 0 && Math.sign(dx) === v[0]) {
        if (Math.abs(dx) / Math.max(0.5, e.speed) <= fuse) return 1.6;
      }
    }
    if (v[1] && ex === mx) {
      var dy = my - ey;
      if (dy !== 0 && Math.sign(dy) === v[1]) {
        if (Math.abs(dy) / Math.max(0.5, e.speed) <= fuse) return 1.6;
      }
    }
    return 0;
  }
  // 记忆对手的移动方向：只有"连续一段时间朝同一方向移动"才值得预判
  function updateFoeMemory(S, p, ai) {
    if (!ai.foe) ai.foe = {};
    for (var i = 0; i < S.players.length; i++) {
      var o = S.players[i];
      if (o === p || !o.alive) continue;
      var rec = ai.foe[o.id];
      if (!rec) {
        ai.foe[o.id] = { dir: o.dir, since: S.time, x: o.x, y: o.y, moving: false };
        continue;
      }
      if (o.dir !== rec.dir) { rec.dir = o.dir; rec.since = S.time; }
      rec.moving = (Math.abs(o.x - rec.x) > 0.02 || Math.abs(o.y - rec.y) > 0.02);
      rec.x = o.x; rec.y = o.y;
    }
  }
  // 对方是否"明确在往某个方向走"（持续 0.45s 以上且确实在移动）
  function foeCommitted(S, p, e) {
    var ai = p.ai;
    if (!ai || !ai.foe) return false;
    var rec = ai.foe[e.id];
    if (!rec) return false;
    if (rec.dir !== e.dir) return false;
    if (!rec.moving) return false;
    return (S.time - rec.since) > 0.45;
  }
  // 这一泡能不能逮到敌人：结合"敌人会走到哪"和"他还剩几条退路"
  function killChance(S, p, e, fuse) {
    var cx = Math.floor(p.x), cy = Math.floor(p.y);
    var best = corridorKill(S, p, e, fuse);
    if (best > 0) return best;
    best = approachKill(S, p, e, fuse);
    var committed = foeCommitted(S, p, e);
    var cands = [
      predictPos(S, e, fuse),
      predictPos(S, e, fuse * 0.5),
      [Math.floor(e.x), Math.floor(e.y)]
    ];
    // 方向不确定就别瞎猜；方向确定才敢按预判下重注
    var w = committed ? [1.0, 0.7, 0.35] : [0.3, 0.2, 0.15];
    for (var i = 0; i < cands.length; i++) {
      var ax = cands[i][0], ay = cands[i][1];
      if (!inb(ax, ay)) continue;
      if (!canHit(S, cx, cy, ax, ay, p.power)) continue;
      var dodge = dodgeCount(S, ax, ay, cx, cy, p.power);
      var v = dodge === 0 ? 1.4 : dodge === 1 ? 0.6 : 0.25;
      var s = w[i] * v;
      if (s > best) best = s;
    }
    return best;
  }

  /* ---------------- 道具价值 ---------------- */
  var ITEM_VALUE = {
    bomb: 3.0, power: 2.6, speed: 2.4, shield: 2.6, kick: 2.0,
    needle: 2.2, bombpass: 2.0, pierce: 2.0, magnet: 1.6, glove: 1.8
  };
  function itemValue(p, type) {
    var v = ITEM_VALUE[type] || 1.5;
    if (type === 'bomb' && p.maxBombs >= 5) v *= 0.6;
    if (type === 'power' && p.power >= 5) v *= 0.7;
    if (type === 'speed' && p.speed >= 5.2) v *= 0.6;
    return v;
  }

  /* ---------------- 目标选择 ---------------- */
  // 返回 {path, goal:[x,y], kind}
  function chooseGoal(S, p, ctx) {
    var me = ctx.me;
    var diff = ctx.diff;
    var dist = ctx.dist;                    // 距离场（格数）
    var danger = ctx.danger;
    var comps = ctx.comps;
    var myComp = comps.id[me[1] * W + me[0]];
    var mySize = comps.size[myComp] || 1;

    // --- 1) 敌人被泡泡困住 → 走过去戳破（直接淘汰） ---
    var foes = enemiesOf(S, p);
    var popTarget = null, popD = INF;
    for (var i = 0; i < foes.length; i++) {
      if (!foes[i].trapped) continue;
      var fx = Math.floor(foes[i].x), fy = Math.floor(foes[i].y);
      var d = dist[fy * W + fx];
      if (d >= 0 && d < popD) { popD = d; popTarget = [fx, fy]; }
    }
    if (popTarget && popD < 14) {
      return { path: pathFromDist(S, dist, popTarget[0], popTarget[1], me[0], me[1]), goal: popTarget, kind: 'pop' };
    }

    // --- 2) 敌人预判落点：从某格放泡能炸到他 ---
    //    找出"站上去放泡就能炸到预判点"的最佳站位
    var fuse = S.cfg.fuse || P.FUSE;
    var bestAim = null, bestAimScore = 0;
    for (var f = 0; f < foes.length; f++) {
      var e = foes[f];
      if (e.trapped) continue;
      var aim = predictPos(S, e, fuse);
      // 站位候选：与预判点同行/同列、且在威力内
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          if (!walkable(S, x, y)) continue;
          if (Math.abs(x - aim[0]) > p.power || Math.abs(y - aim[1]) > p.power) continue;
          if (x !== aim[0] && y !== aim[1]) continue;         // 必须同行或同列
          if (!canHit(S, x, y, aim[0], aim[1], p.power)) continue;
          var dd = dist[y * W + x];
          if (dd < 0) continue;
          if (danger[y * W + x] > 0) continue;                 // 站位本身不安全
          // 分越高越优先：只认"有把握"的机会，不做无用追人
          var eDist = Math.abs(e.x - (x + 0.5)) + Math.abs(e.y - (y + 0.5));
          var score = 0;
          // 敌人无路可躲 → 这位置能一击致命
          if (dodgeCount(S, aim[0], aim[1], x, y, p.power) === 0) score += 8;
          // 走廊封路位：敌人被堵在尽头，一泡一个准
          if (corridorKillAt(S, x, y, e, fuse) > 0) score += 12;
          if (foeCommitted(S, p, e)) score += 4;      // 对方方向明确，预判可信
          score += Math.max(0, 12 - eDist) * 0.5;    // 离得近一点
          score += Math.max(0, 10 - dd) * 0.3;       // 自己别跑太远
          if (score > bestAimScore) { bestAimScore = score; bestAim = [x, y]; }
        }
      }
    }
    if (bestAim && bestAimScore > diff.huntScore) {
      return { path: pathFromDist(S, dist, bestAim[0], bestAim[1], me[0], me[1]), goal: bestAim, kind: 'hunt' };
    }

    // --- 3) 道具 ---
    var bestItem = null, bestItemScore = 0;
    for (var it = 0; it < S.items.length; it++) {
      var item = S.items[it];
      var ix = Math.floor(item.x), iy = Math.floor(item.y);
      var idist = dist[iy * W + ix];
      if (idist < 0) continue;
      if (danger[iy * W + ix] > 0) continue;
      var val = itemValue(p, item.type);
      var sc = val * 6 / (idist + 2.5);
      if (sc > bestItemScore) { bestItemScore = sc; bestItem = [ix, iy]; }
    }
    if (bestItem && bestItemScore > diff.itemScore) {
      return { path: pathFromDist(S, dist, bestItem[0], bestItem[1], me[0], me[1]), goal: bestItem, kind: 'item' };
    }

    // --- 4) 区域太小 → 找能炸开、连通更大区域的软箱 ---
    if (mySize < diff.roomWant) {
      var bestBox = null, bestBoxGain = 0;
      for (var by = 0; by < H; by++) {
        for (var bx = 0; bx < W; bx++) {
          if (S.grid[by][bx] !== 2) continue;
          // 炸掉它之后能连到多大的区域
          var gain = 0, seenC = {};
          for (var di = 0; di < 4; di++) {
            var nx = bx + DIRS[di][0], ny = by + DIRS[di][1];
            if (!inb(nx, ny)) continue;
            if (!walkable(S, nx, ny)) continue;
            var cid = comps.id[ny * W + nx];
            if (seenC[cid]) continue;
            seenC[cid] = 1;
            gain += comps.size[cid] || 0;
          }
          var g2 = gain - mySize;
          if (g2 <= bestBoxGain) continue;
          // 站到箱子旁边
          var stand = null;
          for (var di2 = 0; di2 < 4; di2++) {
            var sx2 = bx + DIRS[di2][0], sy2 = by + DIRS[di2][1];
            if (!walkable(S, sx2, sy2)) continue;
            if (comps.id[sy2 * W + sx2] !== myComp) continue;   // 必须在自己的区域内
            var sd = dist[sy2 * W + sx2];
            if (sd < 0) continue;
            if (!stand || sd < stand[1]) stand = [sx2, sy2, sd];
          }
          if (!stand) continue;
          bestBoxGain = g2; bestBox = [stand[0], stand[1], bx, by];
        }
      }
      if (bestBox) {
        return { path: pathFromDist(S, dist, bestBox[0], bestBox[1], me[0], me[1]), goal: [bestBox[0], bestBox[1]], kind: 'open', box: [bestBox[2], bestBox[3]] };
      }
    }

    // --- 5) 游走：挑一个大区域里的远处安全格 ---
    var bestW = null, bestWDist = -1;
    for (var tries = 0; tries < 26; tries++) {
      var rx = 1 + Math.floor(rnd(p.ai) * (W - 2));
      var ry = 1 + Math.floor(rnd(p.ai) * (H - 2));
      if (!walkable(S, rx, ry)) continue;
      var rk = ry * W + rx;
      if (dist[rk] < 0) continue;
      if (danger[rk] > 0) continue;
      var csize = comps.size[comps.id[rk]] || 0;
      var score2 = dist[rk] * 0.5 + csize * 0.35;
      if (score2 > bestWDist) { bestWDist = score2; bestW = [rx, ry]; }
    }
    if (bestW) {
      return { path: pathFromDist(S, dist, bestW[0], bestW[1], me[0], me[1]), goal: bestW, kind: 'roam' };
    }
    // 兜底：待在原地
    return { path: null, goal: me, kind: 'idle' };
  }

  /* ---------------- 主决策 ---------------- */
  function think(S, p, dt) {
    if (!p.alive || p.trapped) { p.wantDir = null; p.wantBomb = false; return; }
    var ai = p.ai;
    var diff = ai.diff;
    ai.t = (ai.t || 0) + dt;
    ai.replan = (ai.replan || 0) - dt;
    ai.bombCd = (ai.bombCd || 0) - dt;

    var me = tileOf(p);
    var danger = dangerMap(S);
    var myDanger = danger[me[1] * W + me[0]];
    updateFoeMemory(S, p, ai);

    // ---------- 危险：全力逃生 ----------
    if (myDanger > 0) {
      // 刚从安全切到危险：立刻重算路线，不能沿用旧的游走路径
      var justEntered = ai.mode !== 'flee';
      ai.mode = 'flee';
      if (justEntered || ai.replan <= 0 || !ai.path || !ai.path.length) {
        ai.replan = 0.08;
        var esc = escapeSearch(S, p, danger, me, { margin: 0.20, noDeadEnd: true });
        if (!esc || !esc.path || !esc.path.length) {
          esc = escapeSearch(S, p, danger, me, { margin: 0.20 });
        }
        ai.path = esc ? esc.path : null;
        ai.escapeSafe = esc ? esc.safe : false;
      }
      var fdir = steer(p, ai.path);
      if (!fdir && ai.path && ai.path.length) { ai.path = null; ai.replan = 0; }
      if (!fdir && !ai.path) fdir = desperateMove(S, p, danger, me);  // 没路也要挪窝
      p.wantDir = fdir;
      p.wantBomb = false;
      // 逃生中不乱转：只允许"清路径重规划"
      noteStuck(S, p, ai, dt, false);
      return;
    }

    // ---------- 安全：规划 ----------
    ai.mode = 'safe';
    var dir = null;
    // 走到目标/路径失效就立刻换目标，绝不站着发呆
    for (var tries = 0; tries < 2; tries++) {
      if (ai.replan <= 0 || !ai.path || !ai.path.length) {
        planGoal(S, p, ai, danger, me, diff);
        ai.replan = diff.replan;
      }
      dir = steer(p, ai.path);
      if (dir) break;
      if (ai.path && ai.path.length) ai.path = null;   // 路径失效 → 重规划
      else ai.replan = 0;                              // 走到头了 → 立刻换目标
    }
    p.wantDir = dir;

    // ---------- 放泡决策 ----------
    var wantBomb = false;
    if (ai.bombCd <= 0 && p.activeBombs < p.maxBombs) {
      wantBomb = decideBomb(S, p, ai, danger, me);
    }
    p.wantBomb = wantBomb;
    noteStuck(S, p, ai, dt, true);
  }

  // 规划一条新路线：区域分析 + 距离场 + 目标选择
  function planGoal(S, p, ai, danger, me, diff) {
    var comps = components(S);
    var dist = distField(S, me[0], me[1], { avoidBomb: true, danger: danger });
    var plan = chooseGoal(S, p, {
      me: me, danger: danger, comps: comps, dist: dist, diff: diff
    });
    ai.path = plan && plan.path ? plan.path : null;
    ai.goal = plan ? plan.goal : me;
    ai.goalKind = plan ? plan.kind : 'idle';
    ai.boxGoal = plan ? (plan.box || null) : null;
  }

  // 绝境兜底：没有可用路线时，至少往"最晚爆炸"的方向挪一格，别站着等死
  function desperateMove(S, p, danger, me) {
    var best = null, bestT = -1;
    for (var di = 0; di < 4; di++) {
      var nx = me[0] + DIRS[di][0], ny = me[1] + DIRS[di][1];
      if (!walkable(S, nx, ny)) continue;
      if (bombAt(S, nx, ny)) continue;
      var t = danger[ny * W + nx];
      if (t > bestT) { bestT = t; best = ['up', 'right', 'down', 'left'][di]; }
    }
    return best;
  }

  // 卡住检测：想走却走不动 → 换方向重来
  function noteStuck(S, p, ai, dt, allowNudge) {
    var moved = Math.abs(p.x - (ai.lx == null ? p.x : ai.lx)) +
                Math.abs(p.y - (ai.ly == null ? p.y : ai.ly));
    ai.lx = p.x; ai.ly = p.y;
    if (moved < 0.012) ai.stuck = (ai.stuck || 0) + dt;
    else ai.stuck = 0;
    if (ai.stuck > 0.35) {
      ai.path = null; ai.replan = 0; ai.stuck = 0;
      if (!allowNudge) return;
      // 蹭一下别的方向，脱离墙角
      var cur = tileOf(p);
      var opts = [];
      for (var di = 0; di < 4; di++) {
        var nx = cur[0] + DIRS[di][0], ny = cur[1] + DIRS[di][1];
        if (walkable(S, nx, ny)) opts.push(['up', 'right', 'down', 'left'][di]);
      }
      if (opts.length) p.wantDir = opts[Math.floor(rnd(ai) * opts.length)];
    }
  }

  // 该不该在此刻放泡：能炸到人 / 能炸开通路 / 有敌人在旁边
  function decideBomb(S, p, ai, danger, me) {
    var diff = ai.diff;
    var fuse = S.cfg.fuse || P.FUSE;
    var foes = enemiesOf(S, p);

    // 1) 能炸到预判位置 → 放（这是"堵人"）
    var hitChance = 0;
    var aimSet = {};
    for (var i = 0; i < foes.length; i++) {
      var e = foes[i];
      if (e.trapped) continue;
      var kc = killChance(S, p, e, fuse);
      if (kc > hitChance) hitChance = kc;
      var aim = predictPos(S, e, fuse);
      aimSet[aim[0] + ',' + aim[1]] = 1;
    }
    var killVal = hitChance * diff.killWeight;

    // 2) 炸软箱：当前目标就是箱子，或旁边有箱子
    var boxVal = 0;
    for (var di = 0; di < 4; di++) {
      var nx = me[0] + DIRS[di][0], ny = me[1] + DIRS[di][1];
      if (!inb(nx, ny)) continue;
      if (S.grid[ny][nx] === 2) { boxVal += diff.boxWeight; break; }
    }
    // 目标本身是箱子（站在旁边准备炸）→ 直接炸
    if (ai.boxGoal && ai.goalKind === 'open') {
      var bx = ai.boxGoal[0], by = ai.boxGoal[1];
      if (Math.abs(bx - me[0]) + Math.abs(by - me[1]) === 1) boxVal += diff.boxWeight * 1.6;
    }
    // 踩在炸弹+1/威力道具旁边也值得炸
    for (var it = 0; it < S.items.length; it++) {
      var item = S.items[it];
      if (Math.abs(item.x - (me[0] + 0.5)) < 1.2 && Math.abs(item.y - (me[1] + 0.5)) < 1.2) {
        boxVal += diff.boxWeight * 0.5;
        break;
      }
    }

    // 3) 敌人在旁边 → 偶尔堵
    var nearEnemy = false;
    for (var f = 0; f < foes.length; f++) {
      var o = foes[f];
      if (Math.abs(o.x - p.x) + Math.abs(o.y - p.y) < 2.6) { nearEnemy = true; break; }
    }
    var aggr = (nearEnemy ? diff.aggr : 0) * 0.5;

    var score = killVal + boxVal + aggr + (rnd(ai) - 0.5) * diff.noise;
    if (score < diff.bombScore) return false;

    // 关键：放完必须跑得掉
    if (!canEscape(S, p, me[0], me[1])) return false;
    ai.bombCd = diff.bombCd;
    ai.path = null; ai.replan = 0;
    ai.lastKillAim = aimSet;
    ai.bombReason = killVal >= boxVal ? 'kill' : 'box';
    if (ai.bombReason === 'kill') ai.bombKillN = (ai.bombKillN || 0) + 1;
    else ai.bombBoxN = (ai.bombBoxN || 0) + 1;
    return true;
  }

  /* ---------------- 难度档 ---------------- */
  BA.AI = {
    think: think,
    dangerMap: dangerMap,
    bfs: bfs,
    canEscape: canEscape,
    escapeSearch: escapeSearch,
    components: components,
    DIFF: {
      // replan 决策间隔(s) / bombCd 放泡冷却 / aggr 侵略性 / hunt 追人倾向
      // killWeight 击杀权重 / boxWeight 炸箱权重 / bombScore 放泡阈值 / roomWant 想要多大区域
      easy: {
        replan: 0.34, bombCd: 2.0, aggr: 0.25, hunt: 0.2, itemRange: 6,
        speedMul: 0.84, mistake: 0.22, mashRate: 3,
        killWeight: 0.8, boxWeight: 0.7, bombScore: 1.15, noise: 0.5,
        huntScore: 12, itemScore: 1.1, roomWant: 26
      },
      normal: {
        replan: 0.16, bombCd: 1.3, aggr: 0.6, hunt: 0.6, itemRange: 10,
        speedMul: 0.97, mistake: 0.06, mashRate: 11,
        killWeight: 1.3, boxWeight: 1.0, bombScore: 0.95, noise: 0.25,
        huntScore: 10, itemScore: 0.9, roomWant: 20
      },
      hard: {
        replan: 0.08, bombCd: 0.75, aggr: 0.9, hunt: 0.9, itemRange: 14,
        speedMul: 1.0, mistake: 0, mashRate: 17,
        killWeight: 1.8, boxWeight: 1.2, bombScore: 0.75, noise: 0.1,
        huntScore: 8, itemScore: 0.7, roomWant: 16
      }
    }
  };
})(window);
