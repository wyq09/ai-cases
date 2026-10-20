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
  // 输入缓冲：按下后至少保持 MIN_HOLD 秒，避免掉帧/卡顿时"按下+松开"被同一批事件吞掉
  var MIN_HOLD = 0.09;
  var keyHold = {};        // code -> 到期时间戳
  var pendingRelease = {}; // code -> true（等游戏消费过再从方向栈摘掉）
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
      // 磁铁会让道具坐标变成浮点，用格中心距离判定
      if (Math.abs(it.x + 0.5 - (x + 0.5)) < 0.45 && Math.abs(it.y + 0.5 - (y + 0.5)) < 0.45) return it;
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
    dpr = Math.min((BA.MOBILE && BA.MOBILE.enabled) ? 1.5 : 2, window.devicePixelRatio || 1);
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
        // 重复事件：按键仍是"按下"状态。补一次状态同步——
        // 万一首次 keydown 丢了（浏览器/系统卡顿），后续 repeat 也能把方向补回来。
        keys[e.code] = true;
        keyHold[e.code] = performance.now() + MIN_HOLD * 1000;
        syncDirStack(e.code);
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

  // 把某个键对应的方向补进方向栈（不改变已有顺序）
  function syncDirStack(code) {
    S.players.forEach(function (p) {
      if (!p.isHuman) return;
      var k = p.keys;
      var dir = null;
      if (code === k.up) dir = 'up';
      else if (code === k.down) dir = 'down';
      else if (code === k.left) dir = 'left';
      else if (code === k.right) dir = 'right';
      if (!dir) return;
      var st = dirStack[p.id] || (dirStack[p.id] = []);
      if (st.indexOf(dir) < 0) st.push(dir);
    });
  }

  var PREVENT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'KeyP', 'Escape'];
  function onKeyDown(e) {
    if (PREVENT.indexOf(e.code) >= 0) e.preventDefault();
    // 输入缓冲：保证这次按下至少被游戏看到 MIN_HOLD 秒
    keyHold[e.code] = performance.now() + MIN_HOLD * 1000;
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
    keys[e.code] = false;
    // 还在输入缓冲窗口内 → 先留着方向/放泡状态，等游戏消费过再撤
    if ((keyHold[e.code] || 0) > performance.now()) { pendingRelease[e.code] = true; return; }
    releaseKey(e.code);
  }
  // 真正松开一个键：方向栈摘除 + 放泡标记清除
  function releaseKey(code) {
    S.players.forEach(function (p) {
      if (!p.isHuman) return;
      var k = p.keys;
      var dir = null;
      if (code === k.up) dir = 'up';
      else if (code === k.down) dir = 'down';
      else if (code === k.left) dir = 'left';
      else if (code === k.right) dir = 'right';
      if (dir) {
        var st = dirStack[p.id] || [];
        var i = st.indexOf(dir);
        if (i >= 0) st.splice(i, 1);
      }
      if (code === k.bomb) p.bombPressed = false;
    });
  }
  // 每个逻辑帧回收：缓冲窗口过后再把键从栈里摘掉
  function flushPendingRelease() {
    var now = performance.now();
    for (var code in pendingRelease) {
      if (!pendingRelease[code]) continue;
      if ((keyHold[code] || 0) > now) continue;
      pendingRelease[code] = false;
      releaseKey(code);
    }
    // 兜底：清掉"卡住"的方向（keyup 丢失时角色会一直朝一个方向漂）
    S.players.forEach(function (p) {
      if (!p.isHuman) return;
      var st = dirStack[p.id];
      if (!st || !st.length) return;
      for (var i = st.length - 1; i >= 0; i--) {
        var c = dirKeyCode(p, st[i]);
        if (!keys[c] && (keyHold[c] || 0) <= now) st.splice(i, 1);
      }
    });
  }
  // 键是否"按下中"（含输入缓冲窗口）
  function keyDown(code) {
    return keys[code] || (keyHold[code] || 0) > performance.now();
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
    // 用游戏时钟做冷却：与逻辑帧同步，帧率/后台节流都不影响手感
    var now = S.time;
    if (now - (p.lastMash || 0) < 0.085) return;
    p.lastMash = now;
    p.trapPress++;
    F().ring(p.x * T, p.y * T, '#8fe6ff', { r0: 12, r1: 40, ttl: 0.3, lw: 3 });
    if (p.trapPress >= P.TRAP_SELF_RESCUE) rescuePlayer(p, 'self');
    else A().play('tick');
  }

  /* 触屏专属：振动反馈（桌面端 BA.MOBILE.enabled 为 false，完全不触发） */
  function haptic(kind) {
    if (BA.MOBILE && BA.MOBILE.enabled) BA.MOBILE.haptic(kind);
  }
  /* 爆炸离真人玩家够近才给振动（远处连环爆不该震） */
  function nearHuman(tx, ty, r) {
    for (var i = 0; i < S.players.length; i++) {
      var p = S.players[i];
      if (!p.isHuman || !p.alive) continue;
      if (Math.abs(p.x - (tx + .5)) <= r && Math.abs(p.y - (ty + .5)) <= r) return true;
    }
    return false;
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
        needle: false,
        bombPass: false,
        pierce: false,
        magnet: false,
        glove: false,
        held: null,
        popT: 0,
        popper: null,
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
    // 局内事件流（掉落/道具/死亡模式）：同种子可完整重放，便于回归对比
    S.rng = BA.CORE.U.rng((seed + 4242) >>> 0);
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
      p.popT = 0;
      p.popper = null;
      p.speed = p.baseSpeed;
      p.maxBombs = cfg.startBombs || 1;
      p.power = cfg.startPower || 1;
      p.kick = false;
      p.shield = false;
      p.needle = false;
      p.bombPass = false;
      p.pierce = false;
      p.magnet = false;
      p.glove = false;
      p.held = null;
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
      p.lastMash = 0;
      p.deathCause = null; p.deathById = null; p.deathSelf = false;
      p.trapOwnerId = null; p.trapSelf = false;
      p.statBombs = 0; p.statBlocks = 0; p.statKills = 0;
      if (p.ai) {
        // 确定性随机源：同一局重放，AI 行为完全一致
        p.ai.rng = BA.CORE.U.rng((S.seed + S.round * 7919 + p.idx * 131 + 7) >>> 0);
        p.ai.path = null; p.ai.replan = 0; p.ai.bombCd = 0.6; p.ai.stuck = 0;
        p.ai.lx = null; p.ai.ly = null; p.ai.goal = null; p.ai.goalKind = 'idle';
        p.ai.boxGoal = null; p.ai.escapeSafe = false; p.ai.mode = 'safe';
      }
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
    if (BA.MOBILE && BA.MOBILE.enabled) BA.MOBILE.update(dt);
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
    flushPendingRelease();
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
        // 被敌人戳泡：短暂延迟后爆泡淘汰（期间仍可自救/被救）
        if (p.popT > 0) {
          p.popT -= dt;
          if (p.popT <= 0) { killPlayer(p, 'pop'); continue; }
        }
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
          if (keyDown(dirKeyCode(p, st[k]))) { want = st[k]; break; }
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
        else p.wantBomb = false;      // 机器人：一次决策只放一颗，避免连放
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

      // 戳破敌人的困泡
      touchTrapped(p, dt);

      // 出界保护
      p.x = U.clamp(p.x, 0.3, W - 0.3);
      p.y = U.clamp(p.y, 0.3, H - 0.3);
    }
  }
  // 走到敌人的困泡上 → 把泡泡戳破（短暂延迟，给对手自救窗口）
  var POP_DELAY = 0.16;
  function touchTrapped(p, dt) {
    for (var i = 0; i < S.players.length; i++) {
      var q = S.players[i];
      if (q === p || !q.alive || !q.trapped) continue;
      if (teamOf(q) === teamOf(p)) continue;            // 队友走贴身救援逻辑
      if (q.popT > 0) continue;
      var dx = q.x - p.x, dy = q.y - p.y;
      if (dx * dx + dy * dy > 0.74 * 0.74) continue;
      q.popT = POP_DELAY;
      q.popper = p.id;
      A().play('pop', { pitch: 1.25 });
      F().ring(q.x * T, q.y * T, '#ffe08a', { r0: 18, r1: 52, ttl: 0.28, lw: 4 });
      F().text(q.x * T, q.y * T - 34, '戳破！', '#ffd166');
    }
  }

  function dirKeyCode(p, dir) {
    return dir === 'up' ? p.keys.up : dir === 'down' ? p.keys.down : dir === 'left' ? p.keys.left : p.keys.right;
  }
  function snapCenter(p, dt) {
    // 只抹掉浮点误差，不做“回中线”吸附——玩家停在格子哪里就停在哪里
    var cx = Math.floor(p.x) + .5, cy = Math.floor(p.y) + .5;
    var k = Math.min(1, dt * 8);
    if (Math.abs(p.x - cx) < 0.045) p.x += (cx - p.x) * k;
    if (Math.abs(p.y - cy) < 0.045) p.y += (cy - p.y) * k;
  }

  var RADIUS = 0.30;
  var REPS = 1e-4;
  function solidAt(x, y) {
    if (!inb(x, y)) return true;
    return S.grid[y][x] !== 0;
  }
  // 玩家所站格（以中心判定）：站在自己泡泡上的那颗泡泡不阻挡，允许走开
  // 手套优先：拿着手套时泡泡重新变成实体，才能“走向它把它举起”
  function bombBlocks(p, x, y) {
    if (p && p.bombPass && !p.glove) return null;   // 泡泡靴：泡泡不阻挡
    var r = RADIUS - 0.02 - REPS;
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    var y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    var ptx = p ? Math.floor(p.x) : -99, pty = p ? Math.floor(p.y) : -99;
    // 身体已经压住的格子：这些格子上的泡泡不再阻挡。
    // 否则自由移动下身体常横跨两格，敌人把泡泡丢到旁边就会把人永久冻死。
    var cx0 = -1, cx1 = -1, cy0 = -1, cy1 = -1;
    if (p) {
      cx0 = Math.floor(p.x - r); cx1 = Math.floor(p.x + r);
      cy0 = Math.floor(p.y - r); cy1 = Math.floor(p.y + r);
    }
    for (var i = 0; i < S.bombs.length; i++) {
      var b = S.bombs[i];
      if (b.moving) continue;
      if (b.heldBy) continue;                        // 被举在头顶，不阻挡
      if (b.tx === ptx && b.ty === pty) continue;   // 中心在脚下
      if (b.ownerInside && b.owner === p) continue;  // 放泡者尚未完全离开
      if (b.tx >= cx0 && b.tx <= cx1 && b.ty >= cy0 && b.ty <= cy1) continue;  // 已经压着它
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
    // 自由移动：不再强制对齐到行/列中心，玩家可以在格子里任意位置行走。
    // 只在「正好卡在墙角」时用滑移/微调帮一把，避免手感发涩。
    var nx = p.x + dx * dist, ny = p.y + dy * dist;
    if (canStand(p, nx, ny)) {
      p.x = nx; p.y = ny;
      return true;
    }

    // 举泡投掷
    if (p.held && p.glove) {
      throwBomb(p, dx, dy);
      return false;
    }

    // 手套：朝泡泡走 → 举起它
    if (p.glove && !p.held) {
      var front = bombBlocks(p, nx, ny);
      if (front && !front.moving && !front.exploded && !front.heldBy) {
        var fx = front.tx + .5 - p.x, fy = front.ty + .5 - p.y;
        var aligned = dx !== 0 ? Math.abs(fy) < 0.45 : Math.abs(fx) < 0.45;
        var ahead2 = dx !== 0 ? Math.sign(fx) === Math.sign(dx) : Math.sign(fy) === Math.sign(dy);
        if (aligned && ahead2) {
          grabBomb(p, front);
          return false;
        }
      }
    }

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

    // 被挡住时的“自动对格”兜底：正常行走完全不干预（自由移动），
    // 只有走不动了才把自己摆到本行/本列的中心线，避免卡在格子缝里动不了。
    // 对格速度比正常走路快，所以手感上是“擦一下墙角就顺过去了”。
    // 当前已经站在非法位置（被箱子挤住）时，允许无条件往中心线挪，
    // 否则每一小步都仍然“重叠”，永远走不出去。
    var illegal = !canStand(p, p.x, p.y);
    if (dx !== 0) {
      var cy = Math.floor(p.y) + .5;
      var offY = cy - p.y;
      if (Math.abs(offY) > 0.004) {
        var stepY = Math.sign(offY) * Math.min(Math.abs(offY), dist * 2.6);
        if (canStand(p, p.x, p.y + stepY) && canStand(p, p.x + dx * dist, p.y + stepY)) {
          p.y += stepY; p.x += dx * dist;
          return true;
        }
        if (illegal || canStand(p, p.x, p.y + stepY)) { p.y += stepY; return true; }
      }
    } else if (dy !== 0) {
      var cx = Math.floor(p.x) + .5;
      var offX = cx - p.x;
      if (Math.abs(offX) > 0.004) {
        var stepX = Math.sign(offX) * Math.min(Math.abs(offX), dist * 2.6);
        if (canStand(p, p.x + stepX, p.y) && canStand(p, p.x + stepX, p.y + dy * dist)) {
          p.x += stepX; p.y += dy * dist;
          return true;
        }
        if (illegal || canStand(p, p.x + stepX, p.y)) { p.x += stepX; return true; }
      }
    }
    return false;
  }

  /* ---------------- 泡泡 ---------------- */
  /* 一颗泡泡的爆炸覆盖格（中心 + 四向水柱）。
   * pure=true 时不做链式点燃副作用，供触屏危机提示做纯查询用。 */
  function blastCellsOf(b, pure) {
    var cells = [{ x: b.tx, y: b.ty, kind: 'center', axis: null, dir: 0 }];
    // 钻头：水柱穿透软箱，并多延伸 1 格
    var power = b.power + (b.pierce ? 1 : 0);
    for (var di = 0; di < 4; di++) {
      var dx = DIRS[di][0], dy = DIRS[di][1];
      var axis = dx !== 0 ? 'h' : 'v';
      var arm = [];
      for (var r = 1; r <= power; r++) {
        var nx = b.tx + dx * r, ny = b.ty + dy * r;
        if (!inb(nx, ny)) break;
        var cell = S.grid[ny][nx];
        if (cell === 1) break;
        if (cell === 2) {
          arm.push({ x: nx, y: ny, kind: 'end', axis: axis, dir: dx || dy });
          if (!b.pierce) break;
          continue;
        }
        arm.push({ x: nx, y: ny, kind: r === power ? 'end' : 'mid', axis: axis, dir: dx || dy });
        var other = bombAt(nx, ny);
        if (other && !other.exploded) {
          if (!pure) other.fuse = Math.min(other.fuse, 0.09);
          break;
        }
      }
      if (arm.length) arm[arm.length - 1].kind = 'end';
      for (var a = 0; a < arm.length; a++) cells.push(arm[a]);
    }
    return cells;
  }

  /* ---------------- 触屏危机提示 ----------------
   * 手机屏幕小、没有环绕视野：脚下快炸的泡泡要能一眼看到，并知道往哪跑。 */
  function threatScan(p) {
    var tx = Math.floor(p.x), ty = Math.floor(p.y);
    var best = null, bestCells = null;
    for (var i = 0; i < S.bombs.length; i++) {
      var b = S.bombs[i];
      if (b.exploded || b.fuse > 2.4) continue;
      var cells = blastCellsOf(b, true);
      for (var c = 0; c < cells.length; c++) {
        if (cells[c].x === tx && cells[c].y === ty) {
          if (!best || b.fuse < best.fuse) { best = b; bestCells = cells; }
          break;
        }
      }
    }
    return best ? { bomb: best, cells: bestCells } : null;
  }
  /* 可逃方向：相邻格能走，且不落在这颗泡泡的爆炸范围内 */
  function escapeDirs(p, threat) {
    if (!threat) return [];
    var tx = Math.floor(p.x), ty = Math.floor(p.y);
    var out = [];
    for (var di = 0; di < 4; di++) {
      var dx = DIRS[di][0], dy = DIRS[di][1];
      var nx = tx + dx, ny = ty + dy;
      if (!inb(nx, ny)) continue;
      if (S.grid[ny][nx] !== 0) continue;     // 墙 / 软箱
      if (bombAt(nx, ny)) continue;           // 有泡泡
      var hit = false;
      for (var c = 0; c < threat.cells.length; c++) {
        if (threat.cells[c].x === nx && threat.cells[c].y === ny) { hit = true; break; }
      }
      if (!hit) out.push(DIR_NAMES[di]);
    }
    return out;
  }

  function placeBomb(p) {
    if (p.held) { throwHeld(p); return false; }
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
      ownerTeam: teamOf(p),
      exploded: false,
      moving: false,
      dir: null,
      t: 0,
      ownerInside: !!p,
      pierce: !!p.pierce
    };
    S.bombs.push(b);
    p.activeBombs++;
    p.statBombs = (p.statBombs || 0) + 1;
    S.stats.bombs++;
    A().play('place');
    if (p.isHuman) haptic('place');
    F().ring(p.x * T, p.y * T, '#bfefff', { r0: 6, r1: 46, ttl: 0.32, lw: 4 });
    return true;
  }

  /* ---------------- 手套：举泡 / 投掷 ---------------- */
  function grabBomb(p, b) {
    if (!b || b.moving || b.exploded || b.heldBy) return false;
    b.heldBy = p;
    b.moving = false;
    p.held = b;
    A().play('grab');
    F().ring(p.x * T, p.y * T, '#ffd166', { r0: 10, r1: 44, ttl: 0.26, lw: 3 });
    F().text(p.x * T, p.y * T - 32, '举起！', '#ffd166');
    return true;
  }
  // 举着泡泡时按放泡键：向前扔 3 格（撞到障碍停）
  function throwHeld(p) {
    var b = p.held;
    if (!b) return;
    var v = DIR_VEC[p.dir] || [0, 1];
    b.heldBy = null;
    p.held = null;
    b.moving = true;
    b.kdx = v[0]; b.kdy = v[1];
    b.throwTiles = 3;
    b.speedKick = P.KICK_SPEED * 1.35;
    b.dir = p.dir;
    A().play('throw');
    F().dust(b.x * T, b.y * T, 8);
  }
  function throwBomb(p, dx, dy) {
    var b = p.held;
    if (!b) return;
    b.heldBy = null;
    p.held = null;
    b.moving = true;
    b.kdx = dx; b.kdy = dy;
    b.throwTiles = 3;
    b.speedKick = P.KICK_SPEED * 1.35;
    b.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    A().play('throw');
    F().dust(b.x * T, b.y * T, 8);
  }

  function kickBomb(b, dx, dy) {
    b.moving = true;
    b.kdx = dx; b.kdy = dy;
    b.throwTiles = null;               // 踢：一直滑到障碍
    b.speedKick = P.KICK_SPEED;
    b.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    A().play('kick');
    F().dust(b.x * T, b.y * T, 6);
  }

  function updateBombs(dt) {
    for (var i = S.bombs.length - 1; i >= 0; i--) {
      var b = S.bombs[i];
      b.t += dt;
      if (b.heldBy) {
        var hp = b.heldBy;
        b.x = hp.x;
        b.y = hp.y - 0.46;
        b.tx = Math.floor(hp.x); b.ty = Math.floor(hp.y);
        b.fuse -= dt;
        if (b.fuse <= 0 && !b.exploded) explodeBomb(b);
        continue;
      }
      if (b.moving) {
        var tx = b.tx + .5, ty = b.ty + .5;
        var dx = tx - b.x, dy = ty - b.y;
        var d = Math.hypot(dx, dy);
        var stepLen = (b.speedKick || P.KICK_SPEED) * dt;
        if (d <= stepLen) {
          b.x = tx; b.y = ty;
          // 下一格（throwTiles 为 null = 无限滑行（踢），>0 = 剩余可走格数）
          var nx = b.tx + b.kdx, ny = b.ty + b.kdy;
          var limited = b.throwTiles != null && b.throwTiles > 0;
          if (limited && b.throwTiles <= 0) {
            b.moving = false;
            A().play('bump');
          } else if (solidAt(nx, ny) || bombAt(nx, ny) || !inb(nx, ny)) {
            b.moving = false;
            A().play('bump');
          } else {
            b.tx = nx; b.ty = ny;
            if (limited) {
              b.throwTiles--;
              if (b.throwTiles <= 0) b.moving = false;
            }
          }
        } else {
          b.x += dx / d * stepLen;
          b.y += dy / d * stepLen;
        }
        // 撞人 → 困住（投掷/踢出的泡泡只对别人生效）
        for (var j = 0; j < S.players.length; j++) {
          var p = S.players[j];
          if (!p.alive || p.trapped) continue;
          if (b.owner && p === b.owner) continue;
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

    var cells = blastCellsOf(b, false);

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
        if (b.owner) b.owner.statBlocks = (b.owner.statBlocks || 0) + 1;
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
          hitPlayer(p, b);
        }
      }
    }

    A().play('pop', { pitch: 0.9 + Math.random() * 0.25 });
    if (nearHuman(b.tx, b.ty, 3.2)) haptic('boom');
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
    if (S.rng() < (cfg.itemChance == null ? 0.3 : cfg.itemChance)) {
      var type = rollItemType();
      S.items.push({ x: x, y: y, type: type, t: 0, ttl: P.ITEM_TTL, spawnT: 0 });
    }
  }

  // 掉落权重表（泡泡/威力最常见，稀有能力道具较少）
  function rollItemType() {
    var types = BA.ART.ITEM_TYPES, meta = BA.ART.ITEM_META;
    var total = 0, i;
    for (i = 0; i < types.length; i++) total += (meta[types[i]].w || 1);
    var r = S.rng() * total;
    for (i = 0; i < types.length; i++) {
      r -= (meta[types[i]].w || 1);
      if (r <= 0) return types[i];
    }
    return 'bomb';
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
    // 磁铁：把附近道具吸向自己（不会被水柱冲毁）
    for (var pi = 0; pi < S.players.length; pi++) {
      var p = S.players[pi];
      if (!p.alive || !p.magnet || p.trapped) continue;
      for (var k = S.items.length - 1; k >= 0; k--) {
        var item = S.items[k];
        var ix = item.x + .5, iy = item.y + .5;
        var dx = p.x - ix, dy = p.y - iy;
        var d2 = dx * dx + dy * dy;
        if (d2 > 4.2 * 4.2 || d2 < 0.001) continue;
        var d = Math.sqrt(d2);
        var step = Math.min(d, 7.5 * dt);
        item.x += dx / d * step;
        item.y += dy / d * step;
        if (d < 0.34) { pickItem(p, item); }
      }
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
    applyItem(p, it.type);
    S.stats.items++;
    A().play('item');
    if (p.isHuman) haptic('item');
    var meta = BA.ART.ITEM_META[it.type];
    F().burst(it.x * T + T / 2, it.y * T + T / 2, meta.color, 16, { speed: 190 });
    F().text(p.x * T, p.y * T - 30, meta.label, meta.color);
    if (BA.UI) BA.UI.hud(S);
  }

  // 道具效果：拾取与测试钩子共用
  function applyItem(p, type) {
    if (type === 'bomb') p.maxBombs = Math.min(P.BOMB_MAX, p.maxBombs + 1);
    else if (type === 'power') p.power = Math.min(P.POWER_MAX, p.power + 1);
    else if (type === 'speed') p.speed = Math.min(P.SPEED_MAX, p.speed + 0.42);
    else if (type === 'kick') p.kick = true;
    else if (type === 'shield') p.shield = true;
    else if (type === 'needle') p.needle = true;
    else if (type === 'bombpass') p.bombPass = true;
    else if (type === 'pierce') p.pierce = true;
    else if (type === 'magnet') p.magnet = true;
    else if (type === 'glove') p.glove = true;
    return p;
  }

  /* ---------------- 伤害 / 困泡 / 死亡 ---------------- */
  function hitPlayer(p, src) {
    if (!p.alive || p.invuln > 0) return;
    if (p.trapped) {
      // 困泡再被“别人的”水柱打中 → 立即淘汰；自家水柱不误伤
      if (src && src.owner && src.owner === p) return;
      killPlayer(p, 'water', src);
      return;
    }
    if (p.shield) {
      p.shield = false;
      p.invuln = 1.3;
      A().play('shield');
      F().ring(p.x * T, p.y * T, '#c9b6ff', { r0: 20, r1: 70, ttl: 0.5, lw: 6 });
      F().text(p.x * T, p.y * T - 34, '护盾抵挡', '#c9b6ff');
      return;
    }
    trapPlayer(p, src);
  }

  function trapPlayer(p, src) {
    if (!p.alive || p.trapped) return;
    // 归因：记录是谁的泡泡把人困住的（AI 调优 / 回归统计用）
    p.trapOwnerId = src && src.owner ? src.owner.id : null;
    p.trapSelf = !!(src && src.owner === p);
    // 银针：自动抵消一次困泡
    if (p.needle) {
      p.needle = false;
      p.invuln = Math.max(p.invuln, 0.9);
      A().play('rescue');
      F().ring(p.x * T, p.y * T, '#cfe4ff', { r0: 22, r1: 74, ttl: 0.5, lw: 6 });
      F().text(p.x * T, p.y * T - 36, '银针脱困！', '#cfe4ff');
      if (BA.UI) BA.UI.hud(S);
      return;
    }
    p.trapped = true;
    p.trapT = P.TRAP_TIME;
    p.trapPress = 0;
    p.trapRescued = false;
    p.popT = 0;
    p.popper = null;
    p.dir = 'down';
    S.stats.traps++;
    A().play('trap');
    if (p.isHuman) haptic('trap');
    F().ring(p.x * T, p.y * T, '#8fe6ff', { r0: 26, r1: 58, ttl: 0.45, lw: 5 });
    F().text(p.x * T, p.y * T - 36, '被困！', '#9fe8ff');
    if (BA.UI) BA.UI.hud(S);
  }

  function rescuePlayer(p, how, by) {
    if (!p.trapped) return;
    p.trapped = false;
    p.trapT = 0;
    p.popT = 0;
    p.popper = null;
    p.invuln = 1.0;
    p.trapRescued = true;
    S.stats.rescues++;
    SAVE.bump('rescues');
    A().play('rescue');
    if (p.isHuman) haptic('rescue');
    F().burst(p.x * T, p.y * T, '#a6f06a', 20, { speed: 200 });
    F().text(p.x * T, p.y * T - 34, how === 'team' ? '队友救援！' : '挣脱！', '#a6f06a');
    if (BA.UI) BA.UI.hud(S);
  }

  function killPlayer(p, cause, src) {
    if (!p.alive) return;
    p.alive = false;
    p.trapped = false;
    p.deathT = 0;
    // 归因：死因 + 凶手（AI 调优 / 回归统计用）
    p.deathCause = cause;
    // 击杀归因：炸别人算在炸弹主人头上，戳破算在戳破者头上
    var killer = null;
    if (cause === 'water' && src && src.owner) killer = src.owner;
    else if (cause === 'pop' && p.popper) killer = S.players.filter(function (q) { return q.id === p.popper; })[0];
    else if (p.trapOwnerId) killer = S.players.filter(function (q) { return q.id === p.trapOwnerId; })[0];
    if (killer) killer.statKills = (killer.statKills || 0) + 1;
    p.deathById = killer ? killer.id : (p.trapOwnerId || null);
    // "自炸"要按真正的凶手算：被自己泡泡炸到 / 泡泡超时，才算自己把自己害了；
    // 被敌人戳破或被别人的水柱补刀，不算自炸。
    if (cause === 'water') p.deathSelf = !!(src && src.owner === p);
    else if (cause === 'pop') p.deathSelf = false;
    else p.deathSelf = !!p.trapSelf;
    S.stats.kills++;
    A().play('death');
    if (p.isHuman) haptic('die');
    F().splash(p.x * T, p.y * T, 30, { color: '#bfefff' });
    F().burst(p.x * T, p.y * T, p.color, 26, { speed: 260 });
    F().text(p.x * T, p.y * T - 34, cause === 'water' ? '爆泡淘汰' : cause === 'pop' ? '被戳破！' : '泡泡破了', '#ff9db4');
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
        var c = cands[Math.floor(S.rng() * cands.length)];
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
      if (b.heldBy) scale *= 0.86;
      c.save();
      c.translate(b.x * T, b.y * T);
      c.scale(scale, scale);
      c.globalAlpha = b.heldBy ? 0.9 : 1;
      c.drawImage(sprB, -T / 2, -T / 2, T, T);
      c.restore();
      // 举泡标记
      if (b.heldBy) {
        c.save();
        c.globalAlpha = 0.75 + Math.sin(b.t * 12) * 0.2;
        c.strokeStyle = '#ffd166'; c.lineWidth = 3;
        c.beginPath(); c.arc(b.x * T, b.y * T, T * 0.40, 0, 7); c.stroke();
        c.restore();
      }
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

    // 触屏专属：危机提示（脚下引信倒计时环 + 可逃方向箭头）
    if (BA.MOBILE && BA.MOBILE.enabled) drawThreatHints(c);

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

  /* 触屏危机提示：脚下倒计时环（还剩几秒炸）+ 可逃方向箭头
   * 手机屏小、没有环绕视野，AI 那套"算引信"的能力必须让人也看得见。 */
  function drawThreatHints(c) {
    var now = performance.now();
    for (var i = 0; i < S.players.length; i++) {
      var p = S.players[i];
      if (!p.isHuman || !p.alive || p.trapped) continue;
      var th = threatScan(p);
      if (!th) continue;
      var b = th.bomb;
      var px = p.x * T, py = p.y * T;
      var frac = Math.max(0, Math.min(1, b.fuse / Math.max(0.001, b.maxFuse)));
      // 脚下倒计时环
      c.save();
      c.translate(px, py);
      c.strokeStyle = 'rgba(255,90,110,.26)';
      c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, T * 0.46, 0, 7); c.stroke();
      c.strokeStyle = b.fuse < 0.8 ? '#ff5f7a' : '#ffc46b';
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, T * 0.46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      c.stroke();
      c.restore();
      // 可逃方向箭头（越接近爆炸越明显）
      if (b.fuse > 1.6) continue;
      var dirs = escapeDirs(p, th);
      var pulse = 0.5 + 0.4 * Math.sin(now / 90);
      for (var k = 0; k < dirs.length; k++) {
        var v = DIR_VEC[dirs[k]];
        if (!v) continue;
        c.save();
        c.translate(px + v[0] * T * 0.44, py + v[1] * T * 0.44);
        c.rotate(Math.atan2(v[1], v[0]));
        c.fillStyle = 'rgba(120,255,190,' + pulse.toFixed(3) + ')';
        c.beginPath();
        c.moveTo(10, 0); c.lineTo(-5, -7.5); c.lineTo(-5, 7.5);
        c.closePath();
        c.fill();
        c.restore();
      }
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
      // 被戳破：金色警示环 + 抖动
      if (p.popT > 0) {
        c.strokeStyle = 'rgba(255,214,102,.95)';
        c.lineWidth = 5;
        c.beginPath();
        c.arc(0, 0, T * 0.52 + Math.sin(performance.now() / 40) * 3, 0, 7);
        c.stroke();
      }
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
    if (BA.TOUCH) BA.TOUCH.sync();
  }
  function resume() {
    if (!S.paused) return;
    S.paused = false;
    A().play('click');
    if (BA.UI) BA.UI.show(null);
    if (BA.TOUCH) BA.TOUCH.sync();
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
      get dirStack() { return dirStack; },
      get keyState() { return { keys: keys, hold: keyHold, pending: pendingRelease }; },
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
      /* 触屏危机提示：返回玩家身边快炸的泡泡与可逃方向（测试/调试用） */
      threatInfo: function (id) {
        var p = null;
        for (var i = 0; i < S.players.length; i++) {
          if (id && S.players[i].id === id) { p = S.players[i]; break; }
          if (!id && S.players[i].isHuman) { p = S.players[i]; break; }
        }
        if (!p) return null;
        var th = threatScan(p);
        if (!th) return null;
        return { fuse: Math.round(th.bomb.fuse * 100) / 100, dirs: escapeDirs(p, th) };
      },
      give: function (id, type, n) {
        var p = S.players.filter(function (q) { return q.id === id; })[0];
        if (!p) return false;
        n = n || 1;
        for (var i = 0; i < n; i++) applyItem(p, type);
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
      dropItems: function (n, type) {
        var types = BA.ART.ITEM_TYPES;
        for (var i = 0; i < n; i++) {
          var x = 1 + Math.floor(Math.random() * (W - 2));
          var y = 1 + Math.floor(Math.random() * (H - 2));
          if (S.grid[y][x] !== 0) continue;
          S.items.push({
            x: x, y: y,
            type: type || types[i % types.length],
            t: 0, ttl: P.ITEM_TTL, spawnT: 1
          });
        }
      },
      dropItemAt: function (x, y, type) {
        S.items.push({ x: x, y: y, type: type, t: 0, ttl: P.ITEM_TTL, spawnT: 1 });
        return true;
      },
      held: function (id) {
        var p = S.players.filter(function (q) { return q.id === id; })[0];
        return !!(p && p.held);
      },
      bombAt: function (x, y) { return bombAt(x, y); },
      itemCount: function () { return S.items.length; },
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
