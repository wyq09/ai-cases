/* ============================================================
 * 泡泡堂 · src/game.js —— BA.GAME 核心引擎
 * 网格物理 / 泡泡与水柱 / 道具 / 困泡救援 / 回合与比赛 / 渲染 / 主循环
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});
  var U = BA.CORE.U, P = BA.PARAMS, CFG = BA.CORE.CFG, SAVE = BA.CORE.SAVE;
  var T = P.TILE, W = P.W, H = P.H;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var DIR_NAMES = ['up', 'right', 'down', 'left'];
  var DIR_VEC = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  var THEME_ORDER = ['blue', 'pink', 'green', 'violet'];
  var SPAWN_FOR = {
    2: [0, 3],
    3: [0, 1, 3],
    4: [0, 1, 2, 3]
  };

  var canvas = null, ctx = null, dpr = 1;
  var S = {
    phase: 'idle',
    phaseT: 0,
    mode: 'ffa',
    grid: null,
    map: null,
    players: [],
    bombs: [],
    items: [],
    geysers: [],
    time: 0,
    round: 1,
    winsNeeded: 3,
    winner: null,
    matchWinner: null,
    sudden: false,
    suddenT: 0,
    paused: false,
    stats: { bombs: 0, blocks: 0, items: 0, rescues: 0, traps: 0, kills: 0 },
    seed: 1337,
    speedMul: 1,
    botOnly: false,
    lastWinner: null,
    roundResult: null,
    matchOpts: null
  };
  Object.defineProperty(S, 'cfg', {
    enumerable: true,
    get: function () { return CFG.get(); }
  });
  var keys = {};
  var dirStack = {};   // playerId -> [dir,...]
  var staticLayer = null;
  var acc = 0, lastTs = 0, rafId = 0, fallbackTimer = null, lastFrameAt = 0;
  var fpsSamples = [], fps = 60;
  var frameCount = 0;
  var pendingCountdown = null;

  function F() { return BA.FX; }
  function A() { return BA.AUDIO; }

  /* ---------------- 小工具 ---------------- */
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function pTile(p) { return [Math.floor(p.x), Math.floor(p.y)]; }
  function bombAt(x, y) {
    for (var i = 0; i < S.bombs.length; i++) {
      var b = S.bombs[i];
      if (b.tx === x && b.ty === y) return b;
    }
    return null;
  }
  function itemAt(x, y) {
    for (var i = 0; i < S.items.length; i++) {
      var it = S.items[i];
      if (it.x === x && it.y === y) return it;
    }
    return null;
  }
  function playerAt(x, y, except) {
    for (var i = 0; i < S.players.length; i++) {
      var p = S.players[i];
      if (p === except || !p.alive) continue;
      if (Math.abs(p.x - (x + .5)) < 0.5 && Math.abs(p.y - (y + .5)) < 0.5) return p;
    }
    return null;
  }
  function teamOf(p) { return S.mode === 'team' ? p.team : p.id; }

  /* ---------------- 初始化 ---------------- */
  function init(cv) {
    canvas = cv || document.getElementById('game');
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(P.BOARD_W * dpr);
    canvas.height = Math.round(P.BOARD_H * dpr);
    canvas.style.width = P.BOARD_W + 'px';
    canvas.style.height = P.BOARD_H + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bindKeys();
    BA.ART.init();
    if (BA.FX && BA.FX.init) BA.FX.init();
    var cfg = CFG.get();
    A().init(cfg);
    A().setSfx(cfg.sfxVolume); A().setMusic(cfg.musicVolume);
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
    // 双驱动：后台/遮挡时 rAF 被节流，用定时器兜底推进
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = setInterval(function () {
      var t = performance.now();
      if (t - lastFrameAt > 220) { tick(t); }
    }, 110);
    window.addEventListener('blur', function () {
      if (S.phase === 'play') { /* 不清方向键，避免卡键 */ }
    });
  }

  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) {
        handleRepeat(e);
        return;
      }
      keys[e.code] = true;
      A().unlock();
      onKeyDown(e);
    });
    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
      onKeyUp(e);
    });
  }

  var PREVENT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'KeyP', 'Escape'];
  function onKeyDown(e) {
    if (PREVENT.indexOf(e.code) >= 0) e.preventDefault();
    if ((e.code === 'Space' || e.code === 'Enter') && (S.phase === 'play' || S.phase === 'countdown')) {
      var ael = document.activeElement;
      if (ael && ael.tagName === 'BUTTON') ael.blur();
    }
    // 全局
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (S.paused) { resume(); return; }
      if (S.phase === 'play' || S.phase === 'countdown') { pause(); return; }
    }
    if (e.code === 'KeyM') { toggleMute(); return; }

    // 屏内交互优先
    if (BA.UI && BA.UI.handleKey && BA.UI.handleKey(e.code)) return;

    if (S.paused) return;
    if (S.phase !== 'play' && S.phase !== 'countdown') {
      if (S.phase === 'roundEnd' && (e.code === 'Space' || e.code === 'Enter')) { nextRound(); return; }
      if (S.phase === 'matchEnd' && (e.code === 'Space' || e.code === 'Enter')) { BA.UI && BA.UI.show('title'); return; }
      return;
    }
    // 玩家方向栈
    S.players.forEach(function (p) {
      if (!p.isHuman) return;
      var k = p.keys;
      var dir = null;
      if (e.code === k.up) dir = 'up';
      else if (e.code === k.down) dir = 'down';
      else if (e.code === k.left) dir = 'left';
      else if (e.code === k.right) dir = 'right';
      if (dir) {
        var st = dirStack[p.id] || (dirStack[p.id] = []);
        var i = st.indexOf(dir);
        if (i >= 0) st.splice(i, 1);
        st.push(dir);
        if (p.trapped) mashEscape(p);
      }
      if (e.code === k.bomb) {
        if (p.trapped) mashEscape(p);
        else p.bombPressed = true;
      }
    });
  }
  function onKeyUp(e) {
    S.players.forEach(function (p) {
      if (!p.isHuman) return;
      var k = p.keys, dir = null;
      if (e.code === k.up) dir = 'up';
      else if (e.code === k.down) dir = 'down';
      else if (e.code === k.left) dir = 'left';
      else if (e.code === k.right) dir = 'right';
      if (dir) {
        var st = dirStack[p.id] || [];
        var i = st.indexOf(dir);
        if (i >= 0) st.splice(i, 1);
      }
      if (e.code === k.bomb) p.bombPressed = false;
    });
  }
  function handleRepeat(e) {
    if (S.phase !== 'play') return;
    S.players.forEach(function (p) {
      if (!p.isHuman || !p.trapped) return;
      if (e.code === p.keys.bomb) mashEscape(p);
    });
  }

  /* ---- 触屏输入桥：虚拟摇杆 / 放泡键 → 第一个人类玩家（复用键盘原语） ---- */
  var touchDirState = null;
  function firstHuman() {
    for (var i = 0; i < S.players.length; i++) if (S.players[i].isHuman) return S.players[i];
    return null;
  }
  function touchDir(d) {
    var p = firstHuman(); if (!p) return;
    if (d === touchDirState) return;
    if (touchDirState) {
      keys[dirKeyCode(p, touchDirState)] = false;
      var st = dirStack[p.id];
      if (st) { var i = st.indexOf(touchDirState); if (i >= 0) st.splice(i, 1); }
    }
    touchDirState = d;
    if (d) {
      keys[dirKeyCode(p, d)] = true;
      (dirStack[p.id] || (dirStack[p.id] = [])).push(d);
      if (p.trapped) mashEscape(p);
    }
  }
  function touchBomb(down) {
    var p = firstHuman(); if (!p) return;
    if (down) { if (p.trapped) mashEscape(p); else p.bombPressed = true; }
    /* 抬起不清 bombPressed：快速点按可能短于一个逻辑帧，交给游戏消费时清除 */
  }
  function mashEscape(p) {
    if (performance.now() - (p.lastMash || 0) < 85) return;
    p.lastMash = performance.now();
    p.trapPress++;
    F().ring(p.x * T, p.y * T, '#8fe6ff', { r0: 12, r1: 40, ttl: 0.3, lw: 3 });
    if (p.trapPress >= P.TRAP_SELF_RESCUE) rescuePlayer(p, 'self');
    else A().play('tick');
  }

  function toggleMute() {
    var cfg = CFG.get();
    var m = !cfg.muted;
    CFG.patch({ muted: m });
    A().muted(m);
    BA.UI && BA.UI.toast(m ? '已静音（M 恢复）' : '声音已开启');
  }

  /* ---------------- 比赛 / 回合 ---------------- */
  function startMatch(opts) {
    opts = opts || {};
    var cfg = CFG.get();
    S.mode = opts.mode || cfg.lastMode || 'ffa';
    S.winsNeeded = opts.winsNeeded || cfg.winsNeeded || 3;
    S.round = 1;
    S.matchWinner = null;
    S.lastWinner = null;
    S.stats = { bombs: 0, blocks: 0, items: 0, rescues: 0, traps: 0, kills: 0 };
    S.seed = opts.seed || (Date.now() % 100000);
    S.botOnly = !!opts.botOnly;
    S.speedMul = opts.speedMul || 1;
    keys = {};
    dirStack = {};
    touchDirState = null;
    S.players = makePlayers(opts);
    S.matchOpts = opts;
    S.phase = 'idle';
    startRound();
  }

  function makePlayers(opts) {
    var cfg = CFG.get();
    var mode = opts.mode || 'ffa';
    var n = Math.max(2, Math.min(4, opts.players || 4));
    var humans = (opts.humans == null) ? 1 : Math.max(0, Math.min(2, opts.humans));
    if (mode === 'team') { n = 4; humans = Math.min(2, humans); }
    var diff = BA.AI.DIFF[opts.diff || cfg.lastDiff] || BA.AI.DIFF.normal;
    var spawns = SPAWN_FOR[n] || SPAWN_FOR[4];
    var list = [];
    for (var i = 0; i < n; i++) {
      var isHuman = i < humans;
      var theme = THEME_ORDER[i % 4];
      var team = mode === 'team' ? (i < 2 ? 0 : 1) : i;
      list.push({
        id: 'p' + (i + 1),
        idx: i,
        name: isHuman ? (i === 0 ? '你' : 'P2') : (['绿仔', '紫电', '粉妮', '蓝波'][i % 4]),
        theme: theme,
        team: team,
        isHuman: isHuman,
        ai: isHuman ? null : { diff: diff, t: 0, replan: 0, path: null, bombCd: 0, mode: 'safe', stuck: 0 },
        keys: i === 0
          ? { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', bomb: 'Space' }
          : { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', bomb: 'Enter' },
        spawn: spawns[i],
        wins: 0,
        alive: true,
        trapped: false,
        trapT: 0,
        trapPress: 0,
        x: 0, y: 0, dir: 'down',
        speed: P.SPEED_BASE * (isHuman ? 1 : diff.speedMul),
        baseSpeed: P.SPEED_BASE * (isHuman ? 1 : diff.speedMul),
        maxBombs: cfg.startBombs || 1,
        power: cfg.startPower || 1,
        kick: false,
        shield: false,
        invuln: 0,
        activeBombs: 0,
        bombPressed: false,
        walkT: 0,
        moving: false,
        wantDir: null,
        wantBomb: false,
        deathT: 0,
        color: ['#3f8cff', '#ff8fbe', '#7ddc6a', '#a98bff'][i % 4]
      });
    }
    return list;
  }

  function startRound() {
    var cfg = CFG.get();
    var mapId = (S.matchOpts && S.matchOpts.map) || cfg.lastMap || 'garden';
    var seed = (S.seed + S.round * 7919) >>> 0;
    S.map = BA.MAPS.build(mapId, seed);
    S.grid = S.map.grid.map(function (r) { return r.slice(); });
    S.bombs = [];
    S.items = [];
    S.geysers = [];
    S.time = 0;
    S.sudden = false;
    S.suddenT = 0;
    S.winner = null;
    S.roundResult = null;
    S.phase = 'countdown';
    S.phaseT = 0;
    S.countdown = 3.2;
    S.paused = false;
    dirStack = {};
    // 重置玩家
    S.players.forEach(function (p, i) {
      var sp = S.map.spawns[p.spawn] || S.map.spawns[i % 4];
      p.x = sp[0] + 0.5;
      p.y = sp[1] + 0.5;
      p.dir = 'down';
      p.alive = true;
      p.trapped = false;
      p.trapT = 0;
      p.trapPress = 0;
      p.speed = p.baseSpeed;
      p.maxBombs = cfg.startBombs || 1;
      p.power = cfg.startPower || 1;
      p.kick = false;
      p.shield = false;
      p.invuln = 1.2;
      p.activeBombs = 0;
      p.bombPressed = false;
      p.walkT = 0;
      p.moving = false;
      p.deathT = 0;
      p.wantDir = null;
      p.wantBomb = false;
      p.mashAcc = 0;
      p.botGaveUp = false;
      if (p.ai) { p.ai.path = null; p.ai.replan = 0; p.ai.bombCd = 0.6; p.ai.stuck = 0; }
    });
    buildStaticLayer();
    BA.FX && BA.FX.clear();
    if (BA.UI) { BA.UI.hud(S); BA.UI.show(null); BA.UI.countdown(3); }
    A().play('count');
  }

  function buildStaticLayer() {
    var th = S.map.theme;
    staticLayer = document.createElement('canvas');
    staticLayer.width = P.BOARD_W * dpr;
    staticLayer.height = P.BOARD_H * dpr;
    var c = staticLayer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var t = S.grid[y][x];
        if (t === 2) t = 0; // 箱子动态绘制
        var variant = (x * 7 + y * 13) % 2;
        var spr = BA.ART.tile(t, th, variant);
        c.drawImage(spr, x * T, y * T, T, T);
      }
    }
    // 棋盘外框阴影
    var g = c.createLinearGradient(0, 0, 0, P.BOARD_H);
    g.addColorStop(0, 'rgba(0,0,0,.12)');
    g.addColorStop(.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.14)');
    c.fillStyle = g; c.fillRect(0, 0, P.BOARD_W, P.BOARD_H);
  }

  function nextRound() {
    if (S.phase !== 'roundEnd') return;
    if (S.matchWinner) { BA.UI && BA.UI.show('match'); return; }
    S.round++;
    startRound();
  }

  function endRound(winner) {
    if (S.phase === 'roundEnd') return;
    S.phase = 'roundEnd';
    S.phaseT = 0;
    S.winner = winner;
    S.lastWinner = winner;
    var humanWon = false;
    if (winner) {
      if (S.mode === 'team') {
        S.players.forEach(function (p) { if (p.team === winner.team) p.wins++; });
        humanWon = S.players.some(function (p) { return p.isHuman && p.team === winner.team; });
      } else {
        winner.wins++;
        humanWon = !!winner.isHuman;
      }
    }
    S.stats.rounds = (S.stats.rounds || 0) + 1;
    SAVE.bump('rounds');
    // 比赛结束？
    var mw = null;
    if (S.mode === 'team') {
      var teams = [0, 1].map(function (t) {
        var ps = S.players.filter(function (p) { return p.team === t; });
        return { team: t, wins: ps.length ? ps[0].wins : 0, ps: ps };
      });
      teams.forEach(function (tt) { if (tt.wins >= S.winsNeeded && !mw) mw = tt; });
      if (mw) {
        S.matchWinner = mw;
        S.matchWinnerHuman = mw.ps.some(function (p) { return p.isHuman; });
      }
    } else {
      S.players.forEach(function (p) { if (p.wins >= S.winsNeeded && !mw) mw = p; });
      if (mw) { S.matchWinner = mw; S.matchWinnerHuman = !!mw.isHuman; }
    }
    S.roundResult = { winner: winner, humanWon: humanWon, matchOver: !!S.matchWinner };
    if (humanWon) {
      A().play('win');
      F().confetti(90);
    } else {
      A().play('lose');
    }
    if (S.matchWinner) {
      SAVE.bump('matches');
      if (S.matchWinnerHuman) {
        SAVE.bump('wins');
        SAVE.patch({ streak: (SAVE.get().streak || 0) + 1 });
        var st = SAVE.get();
        if ((st.streak || 0) > (st.stats.bestStreak || 0)) SAVE.patch({ stats: { bestStreak: st.streak } });
      } else {
        SAVE.patch({ streak: 0 });
      }
    }
    // 战报
    SAVE.patch({
      stats: {
        bombs: (SAVE.get().stats.bombs || 0) + S.stats.bombs,
        blocks: (SAVE.get().stats.blocks || 0) + S.stats.blocks,
        items: (SAVE.get().stats.items || 0) + S.stats.items,
        rescues: (SAVE.get().stats.rescues || 0) + S.stats.rescues
      }
    });
    if (BA.UI) BA.UI.showRound(S.roundResult);
  }

  /* ---------------- 主循环 ---------------- */
  function frame(ts) {
    rafId = 0;
    tick(ts);
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    lastFrameAt = ts;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;
    // FPS
    fpsSamples.push(dt);
    if (fpsSamples.length > 45) fpsSamples.shift();
    var sum = 0;
    for (var i = 0; i < fpsSamples.length; i++) sum += fpsSamples[i];
    fps = fpsSamples.length ? 1 / (sum / fpsSamples.length) : 60;
    frameCount++;

    if (!S.paused) {
      acc += dt * S.speedMul;
      var guard = 0;
      while (acc >= 1 / 120 && guard++ < 12) {
        step(1 / 120);
        acc -= 1 / 120;
      }
      if (guard >= 12) acc = 0;
      if (BA.FX) BA.FX.update(dt);
    }
    render();
    if (BA.FX) BA.FX.draw();
    if (BA.UI) BA.UI.tickHud(S, dt);
  }

  function step(dt) {
    S.phaseT += dt;
    if (S.phase === 'countdown') {
      var before = Math.ceil(S.countdown);
      S.countdown -= dt;
      var after = Math.ceil(S.countdown);
      if (after !== before) {
        if (after > 0) A().play('count', { n: after });
        else if (after === 0) A().play('count', { n: 0 });
      }
      if (BA.UI) BA.UI.countdown(Math.max(0, Math.ceil(S.countdown)));
      if (S.countdown <= 0) {
        S.phase = 'play';
        S.phaseT = 0;
        S.time = 0;
        try {
          var ae = document.activeElement;
          if (ae && (ae.tagName === 'BUTTON' || ae.tagName === 'INPUT')) ae.blur();
        } catch (e0) {}
        if (BA.UI) BA.UI.show(null);
        A().play('count', { n: 0 });
      }
      return;
    }
    if (S.phase === 'roundEnd') {
      S.phaseT += 0;
      return;
    }
    if (S.phase !== 'play') return;

    S.time += dt;
    updatePlayers(dt);
    updateBombs(dt);
    updateGeysers(dt);
    updateItems(dt);
    updateSuddenDeath(dt);
    checkRoundEnd();
  }

  /* ---------------- 玩家更新 ---------------- */
  function updatePlayers(dt) {
    var cfg = CFG.get();
    for (var i = 0; i < S.players.length; i++) {
      var p = S.players[i];
      if (!p.alive) { p.deathT += dt; continue; }
      if (p.invuln > 0) p.invuln -= dt;

      if (p.trapped) {
        p.trapT -= dt;
        p.walkT += dt * 2;
        // 机器人也会自救：难度越高按得越快（简单档基本放弃）
        if (p.ai && !p.botGaveUp) {
          var mashRate = p.ai.diff.mashRate || 0;
          if (mashRate > 0) {
            p.mashAcc = (p.mashAcc || 0) + dt * mashRate;
            while (p.mashAcc >= 1) {
              p.mashAcc -= 1;
              p.trapPress++;
              if (p.trapPress >= P.TRAP_SELF_RESCUE) {
                rescuePlayer(p, 'self');
                break;
              }
            }
            if (p.trapped && Math.random() < dt * 0.6) {
              F().ring(p.x * T, p.y * T, '#8fe6ff', { r0: 12, r1: 36, ttl: 0.3, lw: 2 });
            }
          } else if (p.trapT < 1.2) {
            p.botGaveUp = true;
          }
        }
        // 队友贴身救援
        if (p.trapT > 0) {
          for (var j = 0; j < S.players.length; j++) {
            var q = S.players[j];
            if (q === p || !q.alive || q.trapped) continue;
            if (teamOf(q) !== teamOf(p)) continue;
            var dx = q.x - p.x, dy = q.y - p.y;
            if (dx * dx + dy * dy <= P.TRAP_TEAM_RESCUE * P.TRAP_TEAM_RESCUE) {
              rescuePlayer(p, 'team', q);
              break;
            }
          }
        }
        if (p.trapped && p.trapT <= 0) killPlayer(p, 'bubble');
        continue;
      }

      // AI（节流：决策 ~26Hz，物理仍 120Hz）
      if (p.ai) {
        p.ai.acc = (p.ai.acc || 0) + dt;
        if (p.ai.acc >= 1 / 26) {
          var adt = p.ai.acc; p.ai.acc = 0;
          BA.AI.think(S, p, adt);
        }
      }

      // 输入方向
      var want = null;
      if (p.isHuman) {
        var st = dirStack[p.id] || [];
        for (var k = st.length - 1; k >= 0; k--) {
          if (keys[dirKeyCode(p, st[k])]) { want = st[k]; break; }
        }
        if (!want && st.length) want = st[st.length - 1];
      } else {
        want = p.wantDir;
      }

      var placed = false;
      // 放泡
      var bombWant = p.isHuman ? p.bombPressed : p.wantBomb;
      if (bombWant) {
        if (p.isHuman) p.bombPressed = false;
        if (placeBomb(p)) placed = true;
      }

      // 移动
      p.moving = false;
      if (want) {
        var v = DIR_VEC[want];
        if (v) {
          p.dir = want;
          var dist = p.speed * dt;
          if (tryMove(p, v[0], v[1], dist)) {
            p.moving = true;
            p.walkT += dt * (p.speed * 1.55);
          }
        }
      } else {
        // 空闲：向格中心对齐（微吸附）
        snapCenter(p, dt);
      }

      // 拾取道具
      var it = itemAt(Math.floor(p.x), Math.floor(p.y));
      if (it) pickItem(p, it);

      // 出界保护
      p.x = U.clamp(p.x, 0.3, W - 0.3);
      p.y = U.clamp(p.y, 0.3, H - 0.3);
    }
  }
  function dirKeyCode(p, dir) {
    return dir === 'up' ? p.keys.up : dir === 'down' ? p.keys.down : dir === 'left' ? p.keys.left : p.keys.right;
  }
  function snapCenter(p, dt) {
    var cx = Math.floor(p.x) + .5, cy = Math.floor(p.y) + .5;
    var k = Math.min(1, dt * 14);
    if (Math.abs(p.x - cx) < 0.42) p.x += (cx - p.x) * k;
    if (Math.abs(p.y - cy) < 0.42) p.y += (cy - p.y) * k;
  }

  var RADIUS = 0.30;
  var REPS = 1e-4;
  function solidAt(x, y) {
    if (!inb(x, y)) return true;
    return S.grid[y][x] !== 0;
  }
  // 玩家所站格（以中心判定）：站在自己泡泡上的那颗泡泡不阻挡，允许走开
  function bombBlocks(p, x, y) {
    var r = RADIUS - 0.02 - REPS;
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    var y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    var ptx = p ? Math.floor(p.x) : -99, pty = p ? Math.floor(p.y) : -99;
    for (var i = 0; i < S.bombs.length; i++) {
      var b = S.bombs[i];
      if (b.moving) continue;
      if (b.tx === ptx && b.ty === pty) continue;   // 中心在脚下
      if (b.ownerInside && b.owner === p) continue;  // 放泡者尚未完全离开
      for (var yy = y0; yy <= y1; yy++) {
        for (var xx = x0; xx <= x1; xx++) {
          if (b.tx === xx && b.ty === yy) return b;
        }
      }
    }
    return null;
  }
  function canStand(p, x, y) {
    var r = RADIUS - 0.02 - REPS;
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    var y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (var yy = y0; yy <= y1; yy++) {
      for (var xx = x0; xx <= x1; xx++) {
        if (solidAt(xx, yy)) return false;
      }
    }
    if (bombBlocks(p, x, y)) return false;
    return true;
  }

  function tryMove(p, dx, dy, dist) {
    // 车道锁定：横向移动前先把 y 对齐到最近的行中心，纵向同理。
    // 这样玩家永远不会停在两行之间（否则会被相邻行的箱子卡死）。
    if (dx !== 0) {
      var laneY = Math.round(p.y - 0.5) + 0.5;
      var offY = laneY - p.y;
      if (Math.abs(offY) > 0.004) {
        var stepY = Math.sign(offY) * Math.min(Math.abs(offY), dist * 1.35);
        if (canStand(p, p.x, p.y + stepY)) { p.y += stepY; return true; }
        return false;
      }
      p.y = laneY;
    } else if (dy !== 0) {
      var laneX = Math.round(p.x - 0.5) + 0.5;
      var offX = laneX - p.x;
      if (Math.abs(offX) > 0.004) {
        var stepX = Math.sign(offX) * Math.min(Math.abs(offX), dist * 1.35);
        if (canStand(p, p.x + stepX, p.y)) { p.x += stepX; return true; }
        return false;
      }
      p.x = laneX;
    }

    var nx = p.x + dx * dist, ny = p.y + dy * dist;
    if (canStand(p, nx, ny)) { p.x = nx; p.y = ny; return true; }

    // 踢泡泡
    if (p.kick) {
      var ahead = bombBlocks(p, nx, ny);
      if (ahead && !ahead.moving && !ahead.exploded) {
        var ax = ahead.tx + .5 - p.x, ay = ahead.ty + .5 - p.y;
        if (dx !== 0 && Math.abs(ay) < 0.42 && Math.sign(ax) === Math.sign(dx)) {
          kickBomb(ahead, dx, 0); return false;
        }
        if (dy !== 0 && Math.abs(ax) < 0.42 && Math.sign(ay) === Math.sign(dy)) {
          kickBomb(ahead, 0, dy); return false;
        }
      }
    }

    // 转角辅助：横向被挡时，若偏移很小可沿纵向微调对齐
    if (dx !== 0) {
      var cy = Math.floor(p.y) + .5;
      var diff = cy - p.y;
      if (Math.abs(diff) > 0.008) {
        var nudge = Math.sign(diff) * Math.min(Math.abs(diff), dist * 1.4);
        if (canStand(p, p.x, p.y + nudge) && canStand(p, nx, p.y + nudge)) {
          p.y += nudge;
          p.x = nx;
          return true;
        }
      }
    } else if (dy !== 0) {
      var cx = Math.floor(p.x) + .5;
      var diff2 = cx - p.x;
      if (Math.abs(diff2) > 0.008) {
        var nudge2 = Math.sign(diff2) * Math.min(Math.abs(diff2), dist * 1.4);
        if (canStand(p, p.x + nudge2, p.y) && canStand(p, p.x + nudge2, ny)) {
          p.x += nudge2;
          p.y = ny;
          return true;
        }
      }
    }
    return false;
  }

  /* ---------------- 泡泡 ---------------- */
  function placeBomb(p) {
    if (p.activeBombs >= p.maxBombs) return false;
    var tx = Math.floor(p.x), ty = Math.floor(p.y);
    if (bombAt(tx, ty)) return false;
    if (solidAt(tx, ty)) return false;
    var cfg = CFG.get();
    var b = {
      tx: tx, ty: ty,
      x: tx + .5, y: ty + .5,
      power: p.power,
      fuse: Math.max(0.5, cfg.fuse || P.FUSE),
      maxFuse: Math.max(0.5, cfg.fuse || P.FUSE),
      owner: p,
      exploded: false,
      moving: false,
      dir: null,
      t: 0,
      ownerInside: !!p
    };
    S.bombs.push(b);
    p.activeBombs++;
    S.stats.bombs++;
    A().play('place');
    F().ring(p.x * T, p.y * T, '#bfefff', { r0: 6, r1: 46, ttl: 0.32, lw: 4 });
    return true;
  }

  function kickBomb(b, dx, dy) {
    b.moving = true;
    b.kdx = dx; b.kdy = dy;
    b.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    A().play('kick');
    F().dust(b.x * T, b.y * T, 6);
  }

  function updateBombs(dt) {
    for (var i = S.bombs.length - 1; i >= 0; i--) {
      var b = S.bombs[i];
      b.t += dt;
      if (b.moving) {
        var tx = b.tx + .5, ty = b.ty + .5;
        var dx = tx - b.x, dy = ty - b.y;
        var d = Math.hypot(dx, dy);
        var stepLen = P.KICK_SPEED * dt;
        if (d <= stepLen) {
          b.x = tx; b.y = ty;
          // 下一格
          var nx = b.tx + b.kdx, ny = b.ty + b.kdy;
          if (solidAt(nx, ny) || bombAt(nx, ny) || !inb(nx, ny)) {
            b.moving = false;
            A().play('bump');
          } else {
            b.tx = nx; b.ty = ny;
          }
        } else {
          b.x += dx / d * stepLen;
          b.y += dy / d * stepLen;
        }
        // 撞人 → 困住
        for (var j = 0; j < S.players.length; j++) {
          var p = S.players[j];
          if (!p.alive || p.trapped) continue;
          var ddx = p.x - b.x, ddy = p.y - b.y;
          if (ddx * ddx + ddy * ddy < 0.42 * 0.42) {
            b.moving = false;
            if (p.invuln <= 0 && !p.shield) trapPlayer(p);
            else if (p.shield) { p.shield = false; p.invuln = 1.2; A().play('shield'); }
          }
        }
      }
      if (b.ownerInside && b.owner) {
        var ow = b.owner;
        var rr2 = RADIUS - 0.02 - REPS;
        var overlap = (ow.x + rr2 > b.tx) && (ow.x - rr2 < b.tx + 1) &&
                      (ow.y + rr2 > b.ty) && (ow.y - rr2 < b.ty + 1);
        if (!overlap) b.ownerInside = false;
      }
      b.fuse -= dt;
      if (b.fuse <= 0 && !b.exploded) {
        explodeBomb(b);
      }
    }
  }

  function explodeBomb(b) {
    b.exploded = true;
    var idx = S.bombs.indexOf(b);
    if (idx >= 0) S.bombs.splice(idx, 1);
    if (b.owner) b.owner.activeBombs = Math.max(0, b.owner.activeBombs - 1);

    var cells = [{ x: b.tx, y: b.ty, kind: 'center', axis: null, dir: 0 }];
    for (var di = 0; di < 4; di++) {
      var dx = DIRS[di][0], dy = DIRS[di][1];
      var axis = dx !== 0 ? 'h' : 'v';
      var arm = [];
      for (var r = 1; r <= b.power; r++) {
        var nx = b.tx + dx * r, ny = b.ty + dy * r;
        if (!inb(nx, ny)) break;
        var cell = S.grid[ny][nx];
        if (cell === 1) break;
        if (cell === 2) {
          arm.push({ x: nx, y: ny, kind: 'end', axis: axis, dir: dx || dy });
          break;
        }
        arm.push({ x: nx, y: ny, kind: r === b.power ? 'end' : 'mid', axis: axis, dir: dx || dy });
        var other = bombAt(nx, ny);
        if (other && !other.exploded) {
          other.fuse = Math.min(other.fuse, 0.09);
          break;
        }
      }
      if (arm.length) arm[arm.length - 1].kind = 'end';
      for (var a = 0; a < arm.length; a++) cells.push(arm[a]);
    }

    // 生成水柱
    var brokeHere = {};
    for (var c = 0; c < cells.length; c++) {
      var cl = cells[c];
      S.geysers.push({
        x: cl.x, y: cl.y, kind: cl.kind, axis: cl.axis, dir: cl.dir,
        t: 0, ttl: P.SPLASH, power: b.power
      });
      // 摧毁箱子（箱子吸收水柱，刚掉出的道具不会被同一次爆炸冲毁）
      if (S.grid[cl.y][cl.x] === 2) {
        brokeHere[cl.x + ',' + cl.y] = true;
        destroyBox(cl.x, cl.y);
      }
      // 冲毁地上已有道具
      if (!brokeHere[cl.x + ',' + cl.y]) {
        var it = itemAt(cl.x, cl.y);
        if (it) removeItem(it, false);
      }
    }

    // 伤害
    var hitSet = {};
    for (var c2 = 0; c2 < cells.length; c2++) {
      var cc = cells[c2];
      for (var pi = 0; pi < S.players.length; pi++) {
        var p = S.players[pi];
        if (!p.alive) continue;
        var ptx = Math.floor(p.x), pty = Math.floor(p.y);
        if (ptx === cc.x && pty === cc.y) {
          if (hitSet[p.id]) continue;
          hitSet[p.id] = true;
          hitPlayer(p);
        }
      }
    }

    A().play('pop', { pitch: 0.9 + Math.random() * 0.25 });
    F().splash(b.x * T, b.y * T, 22, { color: '#9fe8ff' });
    F().ring(b.x * T, b.y * T, '#ffffff', { r0: 16, r1: T * 1.5, ttl: 0.36, lw: 7 });
    F().shake(4.5);
    if (BA.UI) BA.UI.danger();
  }

  function destroyBox(x, y) {
    S.grid[y][x] = 0;
    S.stats.blocks++;
    A().play('box');
    F().burst(x * T + T / 2, y * T + T / 2, '#e0b070', 16, { speed: 210, grav: 480 });
    F().dust(x * T + T / 2, y * T + T / 2, 8);
    var cfg = CFG.get();
    if (Math.random() < (cfg.itemChance == null ? 0.3 : cfg.itemChance)) {
      var r = Math.random();
      var type = r < 0.34 ? 'bomb' : r < 0.6 ? 'power' : r < 0.82 ? 'speed' : r < 0.92 ? 'kick' : 'shield';
      S.items.push({ x: x, y: y, type: type, t: 0, ttl: P.ITEM_TTL, spawnT: 0 });
    }
  }

  function updateGeysers(dt) {
    for (var i = S.geysers.length - 1; i >= 0; i--) {
      var g = S.geysers[i];
      g.t += dt;
      if (g.t >= g.ttl) S.geysers.splice(i, 1);
    }
  }

  function updateItems(dt) {
    for (var i = S.items.length - 1; i >= 0; i--) {
      var it = S.items[i];
      it.t += dt;
      it.spawnT = Math.min(1, (it.spawnT || 0) + dt * 4);
      if (it.t >= it.ttl) { removeItem(it, true); }
    }
  }
  function removeItem(it, silent) {
    var i = S.items.indexOf(it);
    if (i >= 0) S.items.splice(i, 1);
    if (!silent) F().burst(it.x * T + T / 2, it.y * T + T / 2, BA.ART.ITEM_META[it.type].color, 8);
  }

  function pickItem(p, it) {
    var i = S.items.indexOf(it);
    if (i < 0) return;
    S.items.splice(i, 1);
    var type = it.type;
    if (type === 'bomb') p.maxBombs = Math.min(P.BOMB_MAX, p.maxBombs + 1);
    else if (type === 'power') p.power = Math.min(P.POWER_MAX, p.power + 1);
    else if (type === 'speed') p.speed = Math.min(P.SPEED_MAX, p.speed + 0.42);
    else if (type === 'kick') p.kick = true;
    else if (type === 'shield') p.shield = true;
    S.stats.items++;
    A().play('item');
    var meta = BA.ART.ITEM_META[type];
    F().burst(it.x * T + T / 2, it.y * T + T / 2, meta.color, 16, { speed: 190 });
    F().text(p.x * T, p.y * T - 30, meta.label, meta.color);
    if (BA.UI) BA.UI.hud(S);
  }

  /* ---------------- 伤害 / 困泡 / 死亡 ---------------- */
  function hitPlayer(p) {
    if (!p.alive || p.invuln > 0) return;
    if (p.trapped) { killPlayer(p, 'water'); return; }
    if (p.shield) {
      p.shield = false;
      p.invuln = 1.3;
      A().play('shield');
      F().ring(p.x * T, p.y * T, '#c9b6ff', { r0: 20, r1: 70, ttl: 0.5, lw: 6 });
      F().text(p.x * T, p.y * T - 34, '护盾抵挡', '#c9b6ff');
      return;
    }
    trapPlayer(p);
  }

  function trapPlayer(p) {
    if (!p.alive || p.trapped) return;
    p.trapped = true;
    p.trapT = P.TRAP_TIME;
    p.trapPress = 0;
    p.trapRescued = false;
    p.dir = 'down';
    S.stats.traps++;
    A().play('trap');
    F().ring(p.x * T, p.y * T, '#8fe6ff', { r0: 26, r1: 58, ttl: 0.45, lw: 5 });
    F().text(p.x * T, p.y * T - 36, '被困！', '#9fe8ff');
    if (BA.UI) BA.UI.hud(S);
  }

  function rescuePlayer(p, how, by) {
    if (!p.trapped) return;
    p.trapped = false;
    p.trapT = 0;
    p.invuln = 1.0;
    p.trapRescued = true;
    S.stats.rescues++;
    SAVE.bump('rescues');
    A().play('rescue');
    F().burst(p.x * T, p.y * T, '#a6f06a', 20, { speed: 200 });
    F().text(p.x * T, p.y * T - 34, how === 'team' ? '队友救援！' : '挣脱！', '#a6f06a');
    if (BA.UI) BA.UI.hud(S);
  }

  function killPlayer(p, cause) {
    if (!p.alive) return;
    p.alive = false;
    p.trapped = false;
    p.deathT = 0;
    S.stats.kills++;
    A().play('death');
    F().splash(p.x * T, p.y * T, 30, { color: '#bfefff' });
    F().burst(p.x * T, p.y * T, p.color, 26, { speed: 260 });
    F().text(p.x * T, p.y * T - 34, cause === 'water' ? '爆泡淘汰' : '泡泡破了', '#ff9db4');
    F().shake(7);
    if (BA.UI) BA.UI.hud(S);
  }

  function checkRoundEnd() {
    if (S.phase !== 'play') return;
    var alive = S.players.filter(function (p) { return p.alive; });
    if (S.mode === 'team') {
      var teams = {};
      alive.forEach(function (p) { teams[p.team] = true; });
      var tkeys = Object.keys(teams);
      if (tkeys.length <= 1) {
        var winner = null;
        if (tkeys.length === 1) {
          var t = +tkeys[0];
          winner = S.players.filter(function (p) { return p.team === t && p.alive; })[0] ||
                   S.players.filter(function (p) { return p.team === t; })[0];
        }
        endRound(winner);
      }
    } else {
      if (alive.length <= 1) endRound(alive[0] || null);
    }
  }

  /* ---------------- 死亡模式 ---------------- */
  function updateSuddenDeath(dt) {
    var cfg = CFG.get();
    if (!cfg.suddenDeath) return;
    if (!S.sudden && S.time >= (cfg.roundTime || 150)) {
      S.sudden = true;
      A().play('sudden');
      F().shake(6);
      if (BA.UI) BA.UI.toast('⚠ 死亡模式：随机落泡');
      return;
    }
    if (!S.sudden) return;
    S.suddenT -= dt;
    if (S.suddenT <= 0) {
      S.suddenT = 1.35;
      // 随机找一个空地落泡
      var cands = [];
      for (var y = 1; y < H - 1; y++) {
        for (var x = 1; x < W - 1; x++) {
          if (S.grid[y][x] === 0 && !bombAt(x, y) && !itemAt(x, y)) cands.push([x, y]);
        }
      }
      if (cands.length) {
        var c = cands[Math.floor(Math.random() * cands.length)];
        var b = {
          tx: c[0], ty: c[1], x: c[0] + .5, y: c[1] + .5,
          power: 2, fuse: 1.25, maxFuse: 1.25, owner: null,
          exploded: false, moving: false, dir: null, t: 0
        };
        S.bombs.push(b);
        F().ring(c[0] * T + T / 2, c[1] * T + T / 2, '#ff8b8b', { r0: 6, r1: 40, ttl: 0.4, lw: 3 });
        A().play('place');
      }
    }
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!ctx) return;
    var c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, P.BOARD_W, P.BOARD_H);
    if (!S.map || !staticLayer) {
      c.fillStyle = '#0a0f1e';
      c.fillRect(0, 0, P.BOARD_W, P.BOARD_H);
      return;
    }
    c.drawImage(staticLayer, 0, 0, P.BOARD_W, P.BOARD_H);

    // 箱子
    var th = S.map.theme;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (S.grid[y][x] === 2) {
          var spr = BA.ART.tile(2, th, (x * 7 + y * 13) % 2);
          c.drawImage(spr, x * T, y * T, T, T);
        }
      }
    }

    // 道具
    for (var i = 0; i < S.items.length; i++) {
      var it = S.items[i];
      var age = it.t;
      var blink = it.ttl - age < 4 ? (Math.sin(age * 16) > -0.1 ? 1 : 0.22) : 1;
      var pop = it.spawnT < 1 ? U.smooth(it.spawnT) : 1;
      var bob = Math.sin(age * 3.1) * 3;
      c.save();
      c.globalAlpha = blink;
      c.translate(it.x * T + T / 2, it.y * T + T / 2 + bob);
      c.scale(pop, pop);
      c.drawImage(BA.ART.item(it.type), -T / 2, -T / 2, T, T);
      c.restore();
    }

    // 泡泡
    for (var bi = 0; bi < S.bombs.length; bi++) {
      var b = S.bombs[bi];
      var frac = 1 - b.fuse / b.maxFuse;
      var frame = Math.floor((b.t * 7 + bi * 2) % 8);
      var sprB = BA.ART.bubble(frame);
      var scale = 1 + Math.sin(b.t * 10) * 0.02;
      if (b.fuse < 0.5) scale *= 1 + (0.5 - b.fuse) * 0.32;
      c.save();
      c.translate(b.x * T, b.y * T);
      c.scale(scale, scale);
      c.drawImage(sprB, -T / 2, -T / 2, T, T);
      c.restore();
      // 引信环
      if (b.fuse < b.maxFuse * 0.72) {
        var ang = -Math.PI / 2 + Math.PI * 2 * frac;
        c.save();
        c.translate(b.x * T, b.y * T);
        c.strokeStyle = b.fuse < 0.7 ? 'rgba(255,120,120,.95)' : 'rgba(255,220,120,.8)';
        c.lineWidth = 4;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(0, 0, T * 0.43, -Math.PI / 2, ang);
        c.stroke();
        c.restore();
      }
      // 踢出速度线
      if (b.moving) {
        c.save();
        c.globalAlpha = 0.5;
        c.strokeStyle = '#bfefff'; c.lineWidth = 3;
        var vx = -b.kdx, vy = -b.kdy;
        for (var s = 1; s <= 3; s++) {
          c.beginPath();
          c.moveTo(b.x * T + vx * s * 7, b.y * T + vy * s * 7);
          c.lineTo(b.x * T + vx * s * 7 + (vy ? 14 : 0), b.y * T + vy * s * 7 + (vx ? 14 : 0));
          c.stroke();
        }
        c.restore();
      }
    }

    // 水柱
    for (var gi = 0; gi < S.geysers.length; gi++) {
      var g = S.geysers[gi];
      var k = g.t / g.ttl;
      var sc = k < 0.18 ? U.smooth(k / 0.18) : (1 - Math.max(0, (k - 0.55) / 0.45) * 0.55);
      c.save();
      c.translate(g.x * T + T / 2, g.y * T + T / 2);
      c.scale(sc, sc);
      c.globalAlpha = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
      BA.ART.drawGeyser(c, -T / 2, -T / 2, T, g.kind, g.axis, g.dir, g.t, S.map.theme === 'candy' ? '#8fd8ff' : '#5fd8ff');
      c.restore();
    }

    // 玩家（按 y 排序）
    var list = S.players.slice().sort(function (a, b) { return a.y - b.y; });
    for (var pi = 0; pi < list.length; pi++) {
      drawPlayer(c, list[pi]);
    }

    // 死亡模式红边
    if (S.sudden) {
      var pulse = 0.18 + Math.sin(performance.now() / 260) * 0.07;
      var vg = c.createRadialGradient(P.BOARD_W / 2, P.BOARD_H / 2, P.BOARD_H * 0.34, P.BOARD_W / 2, P.BOARD_H / 2, P.BOARD_H * 0.78);
      vg.addColorStop(0, 'rgba(255,60,60,0)');
      vg.addColorStop(1, 'rgba(255,40,60,' + pulse.toFixed(3) + ')');
      c.fillStyle = vg;
      c.fillRect(0, 0, P.BOARD_W, P.BOARD_H);
    }
  }

  function drawPlayer(c, p) {
    if (!p.alive) return;
    var px = p.x * T, py = p.y * T;
    // 地面色环
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = p.color;
    c.beginPath();
    c.ellipse(px, py + T * 0.30, T * 0.30, T * 0.11, 0, 0, 7);
    c.fill();
    c.restore();

    if (p.trapped) {
      var tf = Math.floor(p.walkT * 2) % 2;
      var tspr = BA.ART.trapped(p.theme, tf);
      c.save();
      c.translate(px, py - T * 0.06);
      var wob = Math.sin(p.walkT * 3) * 0.02;
      c.rotate(wob);
      c.drawImage(tspr, -T / 2, -T / 2, T, T);
      c.restore();
      // 计时环
      var frac = 1 - p.trapT / P.TRAP_TIME;
      c.save();
      c.translate(px, py - T * 0.06);
      c.strokeStyle = 'rgba(255,255,255,.28)';
      c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, T * 0.46, 0, 7); c.stroke();
      c.strokeStyle = p.trapT < 1.1 ? '#ff6b8a' : '#9fe8ff';
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, T * 0.46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      c.stroke();
      c.restore();
      // 自救进度
      if (p.trapPress > 0) {
        c.save();
        c.fillStyle = 'rgba(8,14,28,.7)';
        c.fillRect(px - 22, py + T * 0.34, 44, 6);
        c.fillStyle = '#9fe8ff';
        c.fillRect(px - 22, py + T * 0.34, 44 * Math.min(1, p.trapPress / P.TRAP_SELF_RESCUE), 6);
        c.restore();
      }
      return;
    }

    var frame = p.moving ? Math.floor(p.walkT) % 4 : 0;
    var spr = BA.ART.player(p.theme, p.dir, frame);
    c.save();
    c.translate(px, py - T * 0.06);
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) c.globalAlpha = 0.45;
    if (p.moving) {
      var sq = 1 + Math.sin(p.walkT * 3.4) * 0.018;
      c.scale(1 / sq, sq);
    }
    c.drawImage(spr, -T / 2, -T / 2, T, T);
    c.restore();

    // 护盾
    if (p.shield) {
      c.save();
      c.globalAlpha = 0.55 + Math.sin(performance.now() / 220) * 0.16;
      c.strokeStyle = '#c9b6ff';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(px, py - T * 0.06, T * 0.44, 0, 7);
      c.stroke();
      c.globalAlpha = 0.16;
      c.fillStyle = '#a98bff';
      c.fill();
      c.restore();
    }

    // 人类玩家标签
    if (p.isHuman) {
      c.save();
      c.font = '700 11px ui-monospace, monospace';
      c.textAlign = 'center';
      c.fillStyle = 'rgba(6,12,24,.62)';
      var label = p.id === 'p1' ? 'P1' : 'P2';
      var tw = c.measureText(label).width + 10;
      c.beginPath();
      if (c.roundRect) c.roundRect(px - tw / 2, py - T * 0.72, tw, 16, 5);
      else c.rect(px - tw / 2, py - T * 0.72, tw, 16);
      c.fill();
      c.fillStyle = p.color;
      c.fillText(label, px, py - T * 0.72 + 12);
      c.restore();
    }
  }

  /* ---------------- 控制 ---------------- */
  function pause() {
    if (S.phase !== 'play' && S.phase !== 'countdown') return;
    if (S.paused) return;
    S.paused = true;
    A().play('click');
    if (BA.UI) BA.UI.show('pause');
  }
  function resume() {
    if (!S.paused) return;
    S.paused = false;
    A().play('click');
    if (BA.UI) BA.UI.show(null);
  }
  function quit() {
    S.phase = 'idle';
    S.paused = false;
    S.players = [];
    S.bombs = []; S.items = []; S.geysers = [];
    if (BA.FX) BA.FX.clear();
    if (BA.UI) BA.UI.show('title');
  }

  /* ---------------- 测试钩子 ---------------- */
  function expose() {
    window.__ba = {
      get state() { return S; },
      get phase() { return S.phase; },
      get players() { return S.players; },
      get board() { return S.grid; },
      get cfg() { return CFG.get(); },
      get fps() { return Math.round(fps); },
      get errors() { return (window.__errs || []).slice(); },
      start: function (opts) { startMatch(opts || {}); },
      quit: quit,
      pause: pause,
      resume: resume,
      nextRound: nextRound,
      fastForward: function (sec) {
        var n = Math.ceil(sec * 120);
        for (var i = 0; i < n; i++) step(1 / 120);
        render();
        return S.phase;
      },
      setSpeed: function (x) { S.speedMul = x; },
      setBotOnly: function (b) { S.botOnly = !!b; },
      give: function (id, type, n) {
        var p = S.players.filter(function (q) { return q.id === id; })[0];
        if (!p) return false;
        n = n || 1;
        for (var i = 0; i < n; i++) {
          if (type === 'bomb') p.maxBombs = Math.min(P.BOMB_MAX, p.maxBombs + 1);
          else if (type === 'power') p.power = Math.min(P.POWER_MAX, p.power + 1);
          else if (type === 'speed') p.speed = Math.min(P.SPEED_MAX, p.speed + 0.42);
          else if (type === 'kick') p.kick = true;
          else if (type === 'shield') p.shield = true;
        }
        if (BA.UI) BA.UI.hud(S);
        return true;
      },
      teleport: function (id, tx, ty) {
        var p = S.players.filter(function (q) { return q.id === id; })[0];
        if (!p) return false;
        p.x = tx + .5; p.y = ty + .5;
        return true;
      },
      placeBomb: function (id) {
        var p = S.players.filter(function (q) { return q.id === id; })[0];
        return p ? placeBomb(p) : false;
      },
      trap: function (id) {
        var p = S.players.filter(function (q) { return q.id === id; })[0];
        if (p) trapPlayer(p);
        return !!p;
      },
      forceEnd: function (id) {
        var p = S.players.filter(function (q) { return q.id === id; })[0];
        if (p) killPlayer(p, 'water');
        return !!p;
      },
      winNow: function (id) {
        S.players.forEach(function (p) { if (p.id !== id) killPlayer(p, 'water'); });
        checkRoundEnd();
        return S.phase;
      },
      seed: function (n) { S.seed = n >>> 0; },
      setFuse: function (v) { CFG.patch({ fuse: v }); },
      dropItems: function (n) {
        for (var i = 0; i < n; i++) {
          var x = 1 + Math.floor(Math.random() * (W - 2));
          var y = 1 + Math.floor(Math.random() * (H - 2));
          if (S.grid[y][x] !== 0) continue;
          var types = BA.ART.ITEM_TYPES;
          S.items.push({ x: x, y: y, type: types[i % types.length], t: 0, ttl: P.ITEM_TTL, spawnT: 1 });
        }
      },
      bombCount: function () { return S.bombs.length; },
      geyserCount: function () { return S.geysers.length; },
      render: render
    };
  }

  BA.GAME = {
    init: init,
    startMatch: startMatch,
    startRound: startRound,
    nextRound: nextRound,
    pause: pause,
    resume: resume,
    quit: quit,
    touch: { dir: touchDir, bomb: touchBomb },
    render: render,
    expose: expose,
    setBotOnly: function (b) { S.botOnly = !!b; },
    get S() { return S; },
    get fps() { return fps; },
    get frameCount() { return frameCount; }
  };
  expose();
})(window);
