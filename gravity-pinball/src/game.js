/* game.js — 状态机 + 无限关卡生成 + 渲染 + DOM 接线（主线负责） */
(function () {
  'use strict';
  var GP = window.GP;
  var PHY = GP.PHY;
  var CFG = GP.CFG, SAVE = GP.SAVE;

  /* ================= 常量 ================= */
  var AW = 390;                 /* 场地逻辑宽 */
  var PALETTE = [
    { fill: '#dfe666', ring: '#b9c93e', ink: '#3d3618' },
    { fill: '#b3a2e6', ring: '#8d78cf', ink: '#ffffff' },
    { fill: '#a5d9f2', ring: '#6fb9e6', ink: '#2c3a44' },
    { fill: '#6fd9e8', ring: '#3cb4cc', ink: '#1f3c44' },
    { fill: '#9fe07a', ring: '#6fbe4e', ink: '#ffffff' },
    { fill: '#f2b95e', ring: '#d99a34', ink: '#43310f' },
    { fill: '#f29ab8', ring: '#d96f98', ink: '#4a2432' },
    { fill: '#f2efe8', ring: '#cfc6bc', ink: '#3a3320' }
  ];
  var BIGC = { fill: '#f6f2ee', ring: '#cfc6bc', ink: '#4a423a' };
  var DIAC = { fill: '#9feaf2', ring: '#5cc8d8', ink: '#ffffff' };
  var TRIC = { fill: 'rgba(46,62,42,0.72)', ring: '#7ecf62', ink: '#eafce0' };
  var SQROT = 0.2;              /* 方块倾斜角 ≈11.5° */

  /* ================= 模块状态 ================= */
  var cv, ctx, dpr = 1, fit = 1;
  var ax0 = 0, ay0 = 0;         /* 场地在画布上的偏移 */
  var G = { W: AW, H: 844 };    /* 当前场地几何 */
  var world = null;
  var st = null;                /* 进度存档引用 */
  var cfg = CFG.all();
  var state = 'boot';           /* play | clear | paused */
  var volleyQueue = 0, volleyAngle = Math.PI / 2, volleySpd = 900, volleyT = 0;
  var aim = null;               /* {id, sx, sy, cx, cy} 场地坐标 */
  var slowmoT = 0, bombArmed = false;
  var shakeMag = 0;
  var flyers = [];              /* 回收飞回杯口的小球 */
  var pickups = [];             /* 场内 + 号拾取球 */
  var lastBounceSnd = 0, lastTickSnd = 0;
  var lastShock = 0;
  var staticBack = null, staticFront = null, vortexCv = null;
  var bumperSprites = {};
  var ballCv = null, bombCv = null;
  var clearTimer = 0, bannerLevel = 0;
  var freeReadyAt = 0, addBtnMode = 'buy';
  var autoCollectT = 0, saveT = 0, fpsN = 0, fpsT = 0, fpsV = 0;
  var roundArmed = false;       /* 已发射过一轮，等待回收完 → 升格 */
  var risePend = 0;             /* 回合结束停顿倒计时 */
  var riseOff = 0, riseAnimT = 0;
  var RISE_STEP = 38;           /* 每回合障碍物上升一格 */
  var pointer = null;
  var isTouch = ('ontouchstart' in window);
  var toastQ = [], toastT = 0;
  var hudCache = { score: -1, balls: -1, bombs: -1, glasses: -1 };

  function $(id) { return document.getElementById(id); }

  /* ================= 几何 ================= */
  function geo(h) {
    return {
      W: AW, H: h,
      menu: { x: 30, y: 34, r: 22 },
      cup: { x: 195, y: 148, r: 23 },
      dashY: 148,
      cornerY: 60,
      cornerR: 18,
      railEnd: h - 154,
      floorEndY: h - 81,
      floorSagY: h - 49,
      vortex: { x: 195, y: 58, r: 54 },
      levelTx: { x: 170, y: 172 }
    };
  }

  function buildSegs() {
    var segs = [];
    var cupA = 0.28 * Math.PI, cupB = 0.72 * Math.PI;
    /* V 漏斗斜壁 */
    segs.push({ ax: 32, ay: G.cornerY, bx: G.cup.x - G.cup.r, by: G.cup.y, rest: cfg.restWall });
    segs.push({ ax: G.cup.x + G.cup.r, ay: G.cup.y, bx: AW - 32, by: G.cornerY, rest: cfg.restWall });
    /* 杯弧（底部开口掉球） */
    var i, a0, a1, N = 7;
    for (i = 0; i < N; i++) {
      a0 = Math.PI - (Math.PI - cupB) * (i / N);
      a1 = Math.PI - (Math.PI - cupB) * ((i + 1) / N);
      segs.push(arcSeg(G.cup, a0, a1));
    }
    for (i = 0; i < N; i++) {
      a0 = cupA * (1 - i / N);
      a1 = cupA * (1 - (i + 1) / N);
      segs.push(arcSeg(G.cup, a0, a1));
    }
    /* 侧墙 */
    segs.push({ ax: 14, ay: 78, bx: 14, by: G.floorEndY, rest: cfg.restWall });
    segs.push({ ax: AW - 14, ay: 78, bx: AW - 14, by: G.floorEndY, rest: cfg.restWall });
    /* 弧形地板 */
    var ctrlY = 2 * G.floorSagY - G.floorEndY;
    var M = 24;
    for (i = 0; i < M; i++) {
      var t0 = i / M, t1 = (i + 1) / M;
      var p0 = qPoint(14, G.floorEndY, 195, ctrlY, AW - 14, G.floorEndY, t0);
      var p1 = qPoint(14, G.floorEndY, 195, ctrlY, AW - 14, G.floorEndY, t1);
      segs.push({ ax: p0.x, ay: p0.y, bx: p1.x, by: p1.y, rest: cfg.restFloor, fric: 0.995, floor: true });
    }
    return segs;
  }
  function arcSeg(c, a0, a1) {
    return {
      ax: c.x + Math.cos(a0) * c.r, ay: c.y + Math.sin(a0) * c.r,
      bx: c.x + Math.cos(a1) * c.r, by: c.y + Math.sin(a1) * c.r,
      rest: cfg.restWall
    };
  }
  function qPoint(x0, y0, cx, cy, x1, y1, t) {
    var u = 1 - t;
    return {
      x: u * u * x0 + 2 * u * t * cx + t * t * x1,
      y: u * u * y0 + 2 * u * t * cy + t * t * y1
    };
  }

  /* ================= 关卡生成 ================= */
  function bumpR(p) {
    if (p.kind === 'diamond') return p.half;
    if (p.kind === 'square') return p.half * 1.08;
    return p.r;
  }

  function genLevel(n) {
    var rand = GP.rng(n * 9301 + 49297);
    var total = Math.min(5 + Math.floor(n * 0.7), 13);
    var base = Math.min(4 + n * 2, 60);
    var maxY = G.H - 190;
    var minX = 42, maxX = AW - 42, minY = 262;
    var diaNeed = n >= 2 ? Math.min(1 + Math.floor(n / 4), 3) : 0;
    var squNeed = n >= 2 ? 1 : 0;
    var triNeed = n >= 3 ? 1 : 0;
    var bigNeed = (n % 4 === 0) ? 1 : 0;
    var pal = PALETTE.slice();
    for (var s = pal.length - 1; s > 0; s--) {
      var j = Math.floor(rand() * (s + 1));
      var tmp = pal[s]; pal[s] = pal[j]; pal[j] = tmp;
    }
    var list = [], id = 0;
    function place(kind) {
      for (var t = 0; t < 60; t++) {
        var x = minX + rand() * (maxX - minX);
        var y = minY + rand() * (maxY - minY);
        var r = kind === 'big' ? 27 : (kind === 'diamond' ? 22 : (kind === 'square' ? 20 : 19));
        var dx = x - 195, dy = y - 175;
        if (Math.sqrt(dx * dx + dy * dy) < 135) continue;           /* 杯口下方锥区 */
        if (y > maxY - r) continue;
        var ok = true;
        for (var k = 0; k < list.length; k++) {
          var o = list[k];
          var or = bumpR(o);
          var ddx = x - o.x, ddy = y - o.y;
          var need = or + r + 26;
          if (ddx * ddx + ddy * ddy < need * need) { ok = false; break; }
        }
        if (!ok) continue;
        var c0, mult = 1;
        if (kind === 'big') { c0 = base * 3; mult = 3; }
        else if (kind === 'diamond') { c0 = Math.ceil(base * 0.5); mult = 2; }
        else { c0 = Math.max(3, Math.round(base * (0.7 + rand() * 0.6))); }
        var mv = (kind === 'circle' && n >= 5 && rand() < 0.35 && listMoveCount(list) < 3);
        var amp = 0, spd = 0, bx2 = x;
        if (mv) {
          amp = 25 + rand() * 35;
          var lo = minX + r + amp, hi = maxX - r - amp;
          if (lo > hi) { amp = 0; } else {
            x = Math.max(lo, Math.min(hi, x));
            spd = 0.8 + rand() * 0.9;
          }
        }
        var isOBB = (kind === 'diamond' || kind === 'square');
        list.push({
          id: ++id, kind: kind, x: x, baseX: x, baseY: y, y: y,
          r: isOBB ? 0 : (kind === 'triangle' ? 17 : r),
          half: kind === 'diamond' ? 22 : (kind === 'square' ? 18 : 0),
          rot: kind === 'square' ? SQROT : 0,
          color: kind === 'big' ? BIGC : (kind === 'diamond' ? DIAC
            : (kind === 'triangle' ? TRIC : pal[id % pal.length])),
          count: c0, count0: c0, mult: mult,
          alive: true, flash: 0, pop: -1, cool: {},
          moveAmp: amp, moveSpd: spd, phase: rand() * GP.TAU
        });
        return true;
      }
      return false;
    }
    /* 先放特殊，再放普通 */
    for (var d = 0; d < diaNeed; d++) place('diamond');
    if (bigNeed) place('big');
    for (var q = 0; q < squNeed; q++) place('square');
    for (var v = 0; v < triNeed; v++) place('triangle');
    var guard = 0;
    while (list.length < total && guard++ < 50) {
      if (!place('circle')) break;
    }
    world.setBumpers(list);
    genPickups(rand, list, minY, maxY, minX, maxX);
  }

  /* + 号拾取球：碰球 +2 球（原版场内红圈加号） */
  function genPickups(rand, list, minY, maxY, minX, maxX) {
    pickups.length = 0;
    var want = list.length >= 6 ? 2 : 1;
    for (var i = 0; i < want; i++) {
      for (var t = 0; t < 40; t++) {
        var x = minX + 12 + rand() * (maxX - minX - 24);
        var y = minY + rand() * (maxY - minY);
        var ok = true, k;
        for (k = 0; k < list.length; k++) {
          var dx = x - list[k].x, dy = y - list[k].y;
          if (dx * dx + dy * dy < 48 * 48) { ok = false; break; }
        }
        if (!ok) continue;
        for (k = 0; k < pickups.length; k++) {
          var ex = x - pickups[k].x, ey = y - pickups[k].y;
          if (ex * ex + ey * ey < 72 * 72) { ok = false; break; }
        }
        if (!ok) continue;
        pickups.push({ x: x, y: y, baseY: y, r: 13, phase: rand() * GP.TAU, dead: 0 });
        break;
      }
    }
  }
  function listMoveCount(list) {
    var c = 0;
    for (var i = 0; i < list.length; i++) if (list[i].moveAmp) c++;
    return c;
  }

  /* ================= 音效/特效软调用 ================= */
  function snd(name, opts) { var A = GP.AUDIO; if (A && A.play) { try { A.play(name, opts); } catch (e) {} } }
  function sndBounce(i) {
    var now = Date.now();
    if (now - lastBounceSnd < 70) return;
    lastBounceSnd = now;
    var A = GP.AUDIO; if (A && A.bounce) { try { A.bounce(i); } catch (e) {} }
  }
  function fxBurst(x, y, color, n) { var F = GP.FX; if (F && F.burst) { try { F.burst(x, y, color, n); } catch (e) {} } }
  function fxText(x, y, s, color) { var F = GP.FX; if (F && F.floatText) { try { F.floatText(x, y, s, color); } catch (e) {} } }
  function fxSwallow(x, y) { var F = GP.FX; if (F && F.swallow) { try { F.swallow(x, y); } catch (e) {} } }
  function fxRing(x, y, color, r1, life) { var F = GP.FX; if (F && F.ring) { try { F.ring(x, y, color, r1, life); } catch (e) {} } }
  function fxPop(x, y, color) { var F = GP.FX; if (F && F.pop) { try { F.pop(x, y, color); } catch (e) {} } }

  function toast(msg) {
    toastQ.push(msg);
    if (toastQ.length > 3) toastQ.shift();
  }
  function shake(m) { shakeMag = Math.min(14, shakeMag + m); }

  /* ================= 瞄准发射 / 回收 ================= */
  function canAim() {
    return (state === 'play' || state === 'clear') && st.balls > 0 && volleyQueue <= 0
      && risePend <= 0 && riseAnimT <= 0;
  }

  function aimParams() {
    /* 杯口→手指即发射方向（对齐原版）；拖距 = 力度；仅轻夹下向锥形 */
    var ddx = aim.cx - aim.sx, ddy = aim.cy - aim.sy;
    var len = Math.sqrt(ddx * ddx + ddy * ddy);        /* 拖动距离：区分轻点/拖拽 */
    var dx = aim.cx - 195, dy = aim.cy - 148;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var ang = dist > 6 ? Math.atan2(dy, dx) : Math.PI / 2;
    var lo = 0.14, hi = Math.PI - 0.14;                /* ≈±8° 水平锥，几乎不改向 */
    if (ang < lo) ang = lo;
    if (ang > hi) ang = hi;
    var t = GP.clamp((dist - 46) / 205, 0, 1);
    return { angle: ang, speed: 1150 + t * 800, t: t, len: len, dist: dist };
  }

  function fireVolley(p) {
    volleyQueue = st.balls;
    volleyAngle = p.angle;
    volleySpd = p.speed;
    volleyT = cfg.dropInterval;                        /* 首球立即出 */
    roundArmed = true;
    snd('add');
    SAVE.save();
  }

  function spawnLaunchBall() {
    if (st.balls <= 0) { volleyQueue = 0; return; }
    /* 发射不消耗库存：球飞回即归位，HUD 球数全程恒定（对齐原版） */
    var a = volleyAngle + (Math.random() - 0.5) * 0.05;
    var s = volleySpd * (0.92 + Math.random() * 0.16);
    var b = world.addBall(195, 156, Math.cos(a) * s, Math.sin(a) * s, cfg.ballR, { bomb: bombArmed, guide: 0.26 });
    b.born = world.time;
    b.spawnT = 0;
    if (bombArmed) {
      bombArmed = false;
      updateSlots();
    }
  }

  /* 单发（测试/兜底） */
  function dropOne() {
    if (state !== 'play' && state !== 'clear') return;
    if (st.balls <= 0 || world.balls.length >= cfg.maxBalls) return;
    var b = world.addBall(195, 156, (Math.random() - 0.5) * 40, 130, cfg.ballR, { bomb: bombArmed, guide: 0.2 });
    b.born = world.time;
    b.spawnT = 0;
    if (bombArmed) {
      bombArmed = false;
      updateSlots();
    }
  }

  function pushFlyer(b, n) {
    flyers.push({ x: b.x, y: b.y, t: 0, delay: Math.min(n * 0.05, 0.5) });
    world.removeBall(b);
  }

  /* 收球按钮：立刻收回场上全部球 */
  function recallAll() {
    var n = 0;
    var bs = world.balls;
    for (var i = bs.length - 1; i >= 0; i--) {
      var b = bs[i];
      if (b.bomb || b.bombDone) continue;
      n++;
      pushFlyer(b, n);
    }
    if (n > 0) snd('collect');
    return n;
  }

  /* 自动回收：停在场上超过 1s / 滞场超 25s 的球飞回顶部 */
  function autoRecall() {
    var n = 0;
    var bs = world.balls;
    for (var i = bs.length - 1; i >= 0; i--) {
      var b = bs[i];
      if (b.settleT > 1.0 || (world.time - (b.born || 0)) > 25) {
        n++;
        pushFlyer(b, n);
      }
    }
    if (n > 0) snd('collect');
  }

  function addBallPrice() {
    return cfg.addBallBaseCost + cfg.addBallCostStep * st.addBallUses;
  }

  function onAddBtn() {
    snd('click');
    if (addBtnMode === 'buy') {
      var cost = addBallPrice();
      if (st.score >= cost) {
        st.score -= cost;
        st.balls += cfg.addBallAmount;
        st.addBallUses++;
        snd('add');
        toast('+' + cfg.addBallAmount + ' 球');
      } else {
        freeReadyAt = Date.now() + cfg.freeCooldown * 1000;
        addBtnMode = 'free';
        toast('分数不足，稍后可免费领取');
      }
    } else {
      if (Date.now() < freeReadyAt) return;
      st.balls += cfg.addBallFreeAmount;
      freeReadyAt = Date.now() + cfg.freeCooldown * 1000;
      snd('add');
      toast('+' + cfg.addBallFreeAmount + ' 球');
    }
    hudDirty();
    SAVE.save();
  }

  function onBombSlot() {
    snd('click');
    if (bombArmed) { bombArmed = false; st.bombs++; }
    else if (st.bombs > 0) { bombArmed = true; st.bombs--; toast('下一颗球是炸弹'); }
    updateSlots();
    SAVE.save();
  }

  function onGlassSlot() {
    snd('click');
    if (slowmoT > 0) return;
    if (st.glasses > 0) {
      st.glasses--;
      slowmoT = cfg.glassDuration;
      snd('slow');
      updateSlots();
      SAVE.save();
    }
  }

  function explodeBomb(b) {
    var R = cfg.bombRadius;
    fxBurst(b.x, b.y, '#ffb64e', 40);
    fxPop(b.x, b.y, '#ffcf7a');
    fxRing(b.x, b.y, '#ffcf7a', 110, 0.5);
    st.balls = Math.max(0, st.balls - 1);              /* 炸弹球一去不回 */
    shake(10);
    snd('bomb');
    var list = world.bumpers;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive) continue;
      var dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy < (R + 20) * (R + 20)) {
        damageBumper(p, cfg.bombPower, false);
      }
    }
    for (var j = world.balls.length - 1; j >= 0; j--) {
      var o = world.balls[j];
      if (o === b || o.dead) continue;
      var ox = o.x - b.x, oy = o.y - b.y;
      var d = Math.sqrt(ox * ox + oy * oy) || 1;
      if (d < R) {
        var f = (1 - d / R) * 700;
        o.vx += (ox / d) * f;
        o.vy += (oy / d) * f - 120;
      }
    }
    hudDirty();
  }

  function damageBumper(p, hits, byBall) {
    p.count -= hits;
    p.flash = 1;
    if (p.count <= 0) {
      p.count = 0;
      p.alive = false;
      p.pop = 0;
      var gain = p.count0 * 5 * p.mult;
      st.score += gain;
      st.pops++;
      fxBurst(p.x, p.y, p.color.ring, p.kind === 'big' ? 44 : 28);
      fxPop(p.x, p.y, p.color.ring);
      fxText(p.x, p.y - 20, '+' + gain, p.kind === 'circle' ? '#ffffff' : '#ffe9a0');
      shake(p.kind === 'big' ? 7 : 3);
      snd('pop');
      checkClear();
    } else if (byBall) {
      var gain2 = 1 * p.mult;
      st.score += gain2;
      fxBurst(p.x, p.y, p.color.fill, 4);
    }
  }

  function checkClear() {
    if (state !== 'play') return;
    var list = world.bumpers;
    for (var i = 0; i < list.length; i++) {
      if (list[i].alive) return;
    }
    if (!list.length) return;
    state = 'clear';
    clearTimer = 0;
    var bonus = 30 + 10 * st.level;
    bannerLevel = st.level;
    st.score += bonus;
    st.bombs = Math.min(st.bombs + 1, 5);
    if (st.level % 3 === 0) st.glasses = Math.min(st.glasses + 1, 3);
    st.best = Math.max(st.best, st.score);
    snd('clear');
    var bn = $('banner');
    bn.innerHTML = '<div class="bt">第 ' + st.level + ' 关 完成</div><div class="bs">+' + bonus + ' 分</div>';
    bn.classList.add('show');
    SAVE.save();
    hudDirty();
  }

  function nextLevel() {
    st.level++;
    st.addBallUses = 0;
    addBtnMode = 'buy';
    genLevel(st.level);
    $('banner').classList.remove('show');
    state = 'play';
    SAVE.save();
    hudDirty();
  }

  /* 障碍物整体上升一格（滑移动画在 stepGame/riseOff 里收尾） */
  function doRise() {
    var list = world.bumpers;
    for (var i = 0; i < list.length; i++) {
      list[i].y -= RISE_STEP;
      list[i].baseY -= RISE_STEP;
    }
    for (var j = 0; j < pickups.length; j++) pickups[j].baseY -= RISE_STEP;
    riseOff = RISE_STEP;
    riseAnimT = 0.35;
    risePend = 0;
    snd('click', { vol: 0.35 });
  }

  function restartAll() {
    st.level = 1; st.score = 0; st.balls = cfg.startBalls;
    st.bombs = 2; st.glasses = 1; st.addBallUses = 0;
    bombArmed = false; slowmoT = 0;
    addBtnMode = 'buy';
    flyers.length = 0;
    world.balls.length = 0;
    roundArmed = false; risePend = 0; riseOff = 0; riseAnimT = 0;
    genLevel(1);
    $('banner').classList.remove('show');
    state = 'play';
    SAVE.save();
    hudDirty();
    updateSlots();
    toast('重新开始');
  }

  /* ================= 物理事件 ================= */
  function onBumperHit(p, b, nx, ny, impact) {
    if (state !== 'play' && state !== 'clear') return;
    damageBumper(p, 1, true);
    snd('hit', { pitch: 1 + Math.min(p.count, 40) * 0.006 });
  }
  function onSwallow(b) {
    st.balls += 3;
    st.score += 15;
    st.swallows++;
    fxSwallow(G.vortex.x, G.vortex.y);
    fxText(G.vortex.x, G.vortex.y + 60, '+3球', '#ffe9a0');
    snd('swallow');
    hudDirty();
    SAVE.save();
  }
  function onBombBall(b, kind) {
    explodeBomb(b);
  }
  function onBounce(b, imp, kind) {
    if (imp > 90) sndBounce(Math.min(1, imp / 1400));
  }

  /* ================= 精灵预渲染 ================= */
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function buildVortexSprite() {
    var S = 200, c = makeCanvas(S, S), g = c.getContext('2d');
    var cx = S / 2, cy = S / 2;
    /* 盘面：贴近背景的灰棕尘雾，低对比 */
    var grd = g.createRadialGradient(cx, cy, 8, cx, cy, S / 2);
    grd.addColorStop(0, 'rgba(178,164,152,0.9)');
    grd.addColorStop(0.25, 'rgba(128,114,104,0.66)');
    grd.addColorStop(0.5, 'rgba(88,78,70,0.44)');
    grd.addColorStop(0.72, 'rgba(76,66,60,0.22)');
    grd.addColorStop(1, 'rgba(76,66,60,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, S / 2, 0, GP.TAU);
    g.fill();
    /* 四条对数螺线旋臂：宽淡底 + 中调 + 细尘埃缝，逐臂错相 */
    g.lineCap = 'round';
    for (var arm = 0; arm < 4; arm++) {
      var a0 = arm * (GP.TAU / 4);
      for (var pass = 0; pass < 3; pass++) {
        g.beginPath();
        var steps = 34;
        for (var i = 0; i <= steps; i++) {
          var t = i / steps;
          var r = 88 * Math.exp(-1.35 * t) + 6;
          var a = a0 + t * 4.4;
          var x = cx + Math.cos(a) * r;
          var y = cy + Math.sin(a) * r * 0.94;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        if (pass === 0) {
          g.strokeStyle = 'rgba(196,182,168,0.13)';
          g.lineWidth = 22 - arm * 2;
        } else if (pass === 1) {
          g.strokeStyle = 'rgba(50,42,36,0.30)';
          g.lineWidth = 12 - arm;
        } else {
          g.strokeStyle = 'rgba(42,36,30,0.44)';
          g.lineWidth = 5.5;
        }
        g.stroke();
      }
    }
    /* 臂间微亮纹（星光流） */
    for (var arm2 = 0; arm2 < 4; arm2++) {
      g.beginPath();
      var a02 = arm2 * (GP.TAU / 4) + 0.72;
      for (var j = 0; j <= 26; j++) {
        var t2 = j / 26;
        var r2 = 82 * Math.exp(-1.3 * t2) + 5;
        var a2 = a02 + t2 * 4.4;
        var x2 = cx + Math.cos(a2) * r2;
        var y2 = cy + Math.sin(a2) * r2 * 0.94;
        if (j === 0) g.moveTo(x2, y2); else g.lineTo(x2, y2);
      }
      g.strokeStyle = 'rgba(196,182,168,0.2)';
      g.lineWidth = 4.5;
      g.stroke();
    }
    /* 亮核（雾状） */
    var core = g.createRadialGradient(cx, cy, 0, cx, cy, 44);
    core.addColorStop(0, 'rgba(226,215,204,0.85)');
    core.addColorStop(0.4, 'rgba(178,164,152,0.4)');
    core.addColorStop(1, 'rgba(170,156,144,0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(cx, cy, 44, 0, GP.TAU);
    g.fill();
    /* 星尘噪点（亮暗各半） */
    var rr = GP.rng(7);
    for (var n = 0; n < 190; n++) {
      var ang = rr() * GP.TAU, rad = 10 + rr() * 86;
      var light = rr() > 0.42;
      g.fillStyle = light ? 'rgba(214,203,192,' + (0.04 + rr() * 0.08).toFixed(3) + ')'
        : 'rgba(48,40,34,' + (0.04 + rr() * 0.09).toFixed(3) + ')';
      var sz = 1.4 + rr() * 2.6;
      g.beginPath();
      g.arc(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.94, sz, 0, GP.TAU);
      g.fill();
    }
    vortexCv = c;
  }

  function sprR(p) {
    if (p.kind === 'diamond' || p.kind === 'square') return p.half;
    if (p.kind === 'triangle') return p.r * 1.12;
    return p.r;
  }

  function bumperSprite(p) {
    var isDia = p.kind === 'diamond';
    var isSq = p.kind === 'square';
    var isTri = p.kind === 'triangle';
    var R = sprR(p);
    var M = 16;
    var S = (R + M) * 2;
    var key = p.kind + '_' + p.color.fill + '_' + p.color.ring + '_' + R;
    if (bumperSprites[key]) return bumperSprites[key];
    var c = makeCanvas(S, S), g = c.getContext('2d');
    var cx = S / 2, cy = S / 2;
    /* 彩色光晕（按环色，糖果外发光） */
    var halo = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R + M - 1);
    halo.addColorStop(0, shadeA(p.color.ring, 0.34));
    halo.addColorStop(0.58, shadeA(p.color.ring, 0.13));
    halo.addColorStop(1, shadeA(p.color.ring, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, S, S);
    g.translate(cx, cy);
    if (isDia) g.rotate(Math.PI / 4);
    if (isSq) g.rotate(SQROT);
    if (isTri) {
      /* 描边三角：半透明深底 + 彩色描边 + 内部微光 */
      var tr = R * 0.94;
      g.beginPath();
      g.moveTo(0, -tr);
      g.lineTo(tr * 0.9, tr * 0.58);
      g.lineTo(-tr * 0.9, tr * 0.58);
      g.closePath();
      g.fillStyle = p.color.fill;
      g.fill();
      g.lineJoin = 'round';
      g.lineWidth = 3.6;
      g.strokeStyle = p.color.ring;
      g.stroke();
      g.beginPath();
      g.moveTo(0, -tr * 0.6);
      g.lineTo(tr * 0.5, tr * 0.34);
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 2.4;
      g.stroke();
      bumperSprites[key] = c;
      return c;
    }
    /* 主体路径：圆 / 菱形（斜置圆角方）/ 圆角方块 */
    g.beginPath();
    if (isDia) {
      var s = R / Math.SQRT2 + 2;
      roundRectPath(g, -s, -s, s * 2, s * 2, s * 0.32);
    } else if (isSq) {
      roundRectPath(g, -R, -R, R * 2, R * 2, R * 0.2);
    } else {
      g.arc(0, 0, R, 0, GP.TAU);
    }
    /* 糖果球体渐变：左上亮芯 → 本色 → 底缘收暗 */
    var fill = g.createRadialGradient(-R * 0.36, -R * 0.42, R * 0.08, 0, 0, R * 1.18);
    fill.addColorStop(0, lighten(p.color.fill, 26));
    fill.addColorStop(0.55, p.color.fill);
    fill.addColorStop(1, darken(p.color.fill, 14));
    g.fillStyle = fill;
    g.fill();
    /* 底缘内阴影（球体体积感） */
    g.save();
    g.clip();
    var shade = g.createLinearGradient(0, R * 0.1, 0, R);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    g.fillStyle = shade;
    g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    g.restore();
    /* 环色描边 + 内圈暗环 */
    g.lineWidth = isDia || isSq ? 3 : 3.5;
    g.strokeStyle = isDia ? '#d8f8fc' : p.color.ring;
    g.stroke();
    if (isDia) {
      g.beginPath();
      var s2 = R / Math.SQRT2 - 3;
      roundRectPath(g, -s2, -s2, s2 * 2, s2 * 2, s2 * 0.3);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 2;
      g.stroke();
    }
    /* 左上大高光 + 右下反光 */
    g.beginPath();
    g.ellipse(-R * 0.34, -R * 0.42, R * 0.46, R * 0.34, -0.5, 0, GP.TAU);
    var gl = g.createRadialGradient(-R * 0.38, -R * 0.46, 1, -R * 0.34, -R * 0.42, R * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.85)');
    gl.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fill();
    if (p.kind === 'big') {
      /* 大白球 = 珍珠玻璃球 */
      g.beginPath();
      g.arc(0, 0, R, 0, GP.TAU);
      var pearl = g.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R);
      pearl.addColorStop(0, 'rgba(255,255,255,0.95)');
      pearl.addColorStop(0.62, 'rgba(246,242,236,0.55)');
      pearl.addColorStop(0.88, 'rgba(214,206,196,0.5)');
      pearl.addColorStop(1, 'rgba(255,255,255,0.75)');
      g.fillStyle = pearl;
      g.fill();
    }
    bumperSprites[key] = c;
    return c;
  }

  function roundRectPath(g, x, y, w, h, r) {
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function lighten(h, p) {
    var c = hex2rgb(h);
    return 'rgb(' + c.map(function (v) { return Math.min(255, v + Math.round(255 * p / 100)); }).join(',') + ')';
  }
  function darken(h, p) {
    var c = hex2rgb(h);
    return 'rgb(' + c.map(function (v) { return Math.max(0, v - Math.round(255 * p / 100)); }).join(',') + ')';
  }
  function shadeA(h, a) {
    var c = hex2rgb(h);
    return 'rgba(' + c.join(',') + ',' + a + ')';
  }

  function buildBallSprite() {
    var S = 40, c = makeCanvas(S, S), g = c.getContext('2d');
    var grd = g.createRadialGradient(S * 0.38, S * 0.35, 2, S / 2, S / 2, S / 2 - 1);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.65, '#f4f1ec');
    grd.addColorStop(1, '#ddd8d0');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, GP.TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.14)';
    g.lineWidth = 1.5;
    g.stroke();
    ballCv = c;
    /* 炸弹球 */
    var c2 = makeCanvas(S, S), g2 = c2.getContext('2d');
    var grd2 = g2.createRadialGradient(S * 0.38, S * 0.35, 2, S / 2, S / 2, S / 2 - 1);
    grd2.addColorStop(0, '#5a5a5e');
    grd2.addColorStop(0.6, '#2c2c30');
    grd2.addColorStop(1, '#141416');
    g2.fillStyle = grd2;
    g2.beginPath();
    g2.arc(S / 2, S / 2 + 2, S / 2 - 6, 0, GP.TAU);
    g2.fill();
    g2.strokeStyle = 'rgba(255,255,255,0.16)';
    g2.lineWidth = 1.5;
    g2.stroke();
    /* 引线 */
    g2.strokeStyle = '#c9a06a';
    g2.lineWidth = 2.5;
    g2.beginPath();
    g2.moveTo(S / 2 + 4, S / 2 - 12);
    g2.quadraticCurveTo(S / 2 + 10, S / 2 - 20, S / 2 + 6, S / 2 - 22);
    g2.stroke();
    bombCv = c2;
  }

  /* ================= 静态层（后景 / 前景墙线） ================= */
  function buildStatic() {
    staticBack = makeCanvas(Math.max(2, Math.round(G.W * fit)), Math.max(2, Math.round(G.H * fit)));
    staticFront = makeCanvas(staticBack.width, staticBack.height);
    var g = staticBack.getContext('2d');
    g.scale(fit, fit);
    /* 场地背景：暖棕灰 + 中央柔光 */
    g.fillStyle = '#443a32';
    g.fillRect(0, 0, G.W, G.H);
    var spot = g.createRadialGradient(195, G.H * 0.46, 40, 195, G.H * 0.46, 400);
    spot.addColorStop(0, 'rgba(112,98,84,0.5)');
    spot.addColorStop(1, 'rgba(112,98,84,0)');
    g.fillStyle = spot;
    g.fillRect(0, 0, G.W, G.H);
    /* 左上斜向天光 */
    g.save();
    g.translate(-80, -40);
    g.rotate(0.62);
    for (var li = 0; li < 3; li++) {
      var lw = [90, 52, 30][li];
      var lx = [120, 260, 355][li];
      var lg = g.createLinearGradient(lx, 0, lx + lw, 0);
      lg.addColorStop(0, 'rgba(255,246,232,0)');
      lg.addColorStop(0.5, 'rgba(255,246,232,' + [0.05, 0.04, 0.03][li] + ')');
      lg.addColorStop(1, 'rgba(255,246,232,0)');
      g.fillStyle = lg;
      g.fillRect(lx, -200, lw, G.H + 400);
    }
    g.restore();
    /* 远山（圆缓双峰，中间谷） */
    g.fillStyle = '#3a322b';
    g.beginPath();
    g.moveTo(0, G.H - 80);
    g.quadraticCurveTo(30, G.H - 300, 92, G.H - 322);
    g.quadraticCurveTo(150, G.H - 340, 178, G.H - 186);
    g.quadraticCurveTo(195, G.H - 152, 212, G.H - 170);
    g.quadraticCurveTo(252, G.H - 330, 306, G.H - 352);
    g.quadraticCurveTo(356, G.H - 368, 374, G.H - 250);
    g.quadraticCurveTo(384, G.H - 150, G.W, G.H - 60);
    g.lineTo(G.W, G.H);
    g.lineTo(0, G.H);
    g.closePath();
    g.fill();
    /* 中景暗脊 */
    g.fillStyle = '#2e2721';
    g.beginPath();
    g.moveTo(0, G.H - 130);
    g.quadraticCurveTo(46, G.H - 240, 108, G.H - 208);
    g.quadraticCurveTo(158, G.H - 182, 186, G.H - 118);
    g.quadraticCurveTo(195, G.H - 102, 208, G.H - 116);
    g.quadraticCurveTo(258, G.H - 186, 316, G.H - 226);
    g.quadraticCurveTo(366, G.H - 258, G.W, G.H - 150);
    g.lineTo(G.W, G.H);
    g.lineTo(0, G.H);
    g.closePath();
    g.fill();
    /* 近景暗脊（最深） */
    g.fillStyle = 'rgba(32,26,22,0.92)';
    g.beginPath();
    g.moveTo(0, G.H - 96);
    g.quadraticCurveTo(66, G.H - 160, 130, G.H - 118);
    g.quadraticCurveTo(172, G.H - 88, 230, G.H - 100);
    g.quadraticCurveTo(304, G.H - 118, G.W, G.H - 84);
    g.lineTo(G.W, G.H);
    g.lineTo(0, G.H);
    g.closePath();
    g.fill();
    /* 底部色带上缘 = 弧形地板 */
    var ctrlY = 2 * G.floorSagY - G.floorEndY;
    g.fillStyle = '#33404d';
    g.beginPath();
    g.moveTo(0, G.floorEndY);
    g.quadraticCurveTo(195, ctrlY, G.W, G.floorEndY);
    g.lineTo(G.W, G.H);
    g.lineTo(0, G.H);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, G.floorEndY);
    g.quadraticCurveTo(195, ctrlY, G.W, G.floorEndY);
    g.stroke();
    /* ---- 前景：墙线（压在漩涡上） ---- */
    var f = staticFront.getContext('2d');
    f.scale(fit, fit);
    f.strokeStyle = 'rgba(248,206,214,0.92)';   /* 杯下虚线：淡粉（原版色感） */
    f.lineWidth = 4;
    f.lineCap = 'round';
    f.setLineDash([14, 10]);
    f.beginPath();
    f.moveTo(22, G.dashY);
    f.lineTo(168, G.dashY);
    f.moveTo(222, G.dashY);
    f.lineTo(G.W - 22, G.dashY);
    f.stroke();
    f.setLineDash([]);
    f.strokeStyle = '#c3b8bc';
    f.lineWidth = 4.5;
    f.lineJoin = 'round';
    f.lineCap = 'round';
    f.beginPath();
    f.moveTo(14, G.railEnd);
    f.lineTo(14, G.cornerY + G.cornerR);
    f.arcTo(14, G.cornerY, 14 + G.cornerR, G.cornerY, G.cornerR);
    f.lineTo(G.cup.x - G.cup.r, G.cup.y);
    f.stroke();
    f.beginPath();
    f.arc(G.cup.x, G.cup.y, G.cup.r, Math.PI, 0, true);
    f.stroke();
    f.beginPath();
    f.moveTo(G.cup.x + G.cup.r, G.cup.y);
    f.lineTo(AW - 14 - G.cornerR, G.cornerY);
    f.arcTo(AW - 14, G.cornerY, AW - 14, G.cornerY + G.cornerR, G.cornerR);
    f.lineTo(AW - 14, G.railEnd);
    f.stroke();
    /* 墙脚接地符号（宽横杠 + 窄横杠） */
    f.strokeStyle = '#a89f97';
    f.lineWidth = 4.5;
    f.beginPath();
    f.moveTo(2, G.railEnd + 6);
    f.lineTo(26, G.railEnd + 6);
    f.moveTo(7, G.railEnd + 13);
    f.lineTo(21, G.railEnd + 13);
    f.moveTo(AW - 26, G.railEnd + 6);
    f.lineTo(AW - 2, G.railEnd + 6);
    f.moveTo(AW - 21, G.railEnd + 13);
    f.lineTo(AW - 7, G.railEnd + 13);
    f.stroke();
  }

  /* ================= DOM 布局 ================= */
  function setDomLayout() {
    var k = GP.clamp(fit, 0.66, 1);   /* 窄视口下控件等比缩小，避免叠压 */
    var ih = window.innerHeight, iw = window.innerWidth;
    var px = function (x, y) {
      return { l: (ax0 + x) * fit, t: (ay0 + y) * fit };
    };
    function place(el, x, y, w, h) {
      var p = px(x, y);
      var l = p.l - w / 2, t = p.t - h / 2;
      /* 视口夹取：横屏矮视口下防止按钮出界 */
      if (t + h > ih - 2) t = ih - 2 - h;
      if (t < 0) t = 0;
      if (l + w > iw - 2) l = iw - 2 - w;
      if (l < 0) l = 0;
      el.style.left = Math.round(l) + 'px';
      el.style.top = Math.round(t) + 'px';
    }
    var el;
    var mb = $('menuBtn');
    place(mb, G.menu.x, G.menu.y, 44 * k, 44 * k);
    mb.style.width = Math.round(44 * k) + 'px';
    mb.style.height = Math.round(44 * k) + 'px';
    $('menuImg').style.width = Math.round(26 * k) + 'px';
    $('menuImg').style.height = Math.round(26 * k) + 'px';
    el = $('scoreTx');
    el.style.fontSize = Math.round(27 * k) + 'px';
    var p1 = px(28, 82);
    el.style.left = Math.round(p1.l) + 'px';
    el.style.top = Math.round(p1.t - 18 * k) + 'px';
    var p2 = px(362, 82);
    el = $('ballTx');
    el.style.fontSize = Math.round(27 * k) + 'px';
    el.style.left = Math.round(p2.l - 120 * k) + 'px';
    el.style.top = Math.round(p2.t - 18 * k) + 'px';
    el.style.width = Math.round(120 * k) + 'px';
    var bc = $('btnCollect');
    place(bc, 195, G.floorSagY - 42, 100 * k, 42 * k);
    bc.style.padding = Math.round(8 * k) + 'px ' + Math.round(20 * k) + 'px';
    bc.style.fontSize = Math.round(20 * k) + 'px';
    var ba = $('btnAdd');
    place(ba, 195, G.H - 36, 200 * k, 52 * k);
    ba.style.width = Math.round(200 * k) + 'px';
    ba.style.height = Math.round(52 * k) + 'px';
    ba.style.fontSize = Math.round(25 * k) + 'px';
    $('addPlusImg').style.width = Math.round(30 * k) + 'px';
    $('addPlusImg').style.height = Math.round(30 * k) + 'px';
    var slots = [['slotBomb', 40], ['slotGlass', AW - 40]];
    for (var i = 0; i < slots.length; i++) {
      var s = $(slots[i][0]);
      place(s, slots[i][1], G.H - 34, 62 * k, 64 * k);
      s.style.width = Math.round(58 * k) + 'px';
      s.style.height = Math.round(62 * k) + 'px';
      s.style.borderRadius = Math.round(29 * k) + 'px ' + Math.round(29 * k) + 'px ' + Math.round(10 * k) + 'px ' + Math.round(10 * k) + 'px';
      var img = s.querySelector('img');
      if (img) { img.style.width = Math.round(40 * k) + 'px'; img.style.height = Math.round(40 * k) + 'px'; }
      var bd = s.querySelector('.badge');
      if (bd) { bd.style.minWidth = Math.round(21 * k) + 'px'; bd.style.height = Math.round(21 * k) + 'px'; bd.style.fontSize = Math.round(13 * k) + 'px'; }
    }
  }

  function updateSlots() {
    $('bombBadge').textContent = st.bombs;
    $('glassBadge').textContent = st.glasses;
    $('slotBomb').classList.toggle('empty', st.bombs <= 0 && !bombArmed);
    $('slotBomb').classList.toggle('armed', bombArmed);
    $('slotGlass').classList.toggle('empty', st.glasses <= 0);
    $('slotGlass').classList.toggle('armed', slowmoT > 0);
  }

  function hudDirty() { hudCache.score = -1; }

  function updateHud() {
    if (hudCache.score !== st.score) {
      hudCache.score = st.score;
      $('scoreTx').textContent = st.score + '分';
    }
    if (hudCache.balls !== st.balls) {
      hudCache.balls = st.balls;
      $('ballTx').textContent = st.balls + '球';
    }
    if (hudCache.bombs !== st.bombs || hudCache.glasses !== st.glasses) {
      hudCache.bombs = st.bombs;
      hudCache.glasses = st.glasses;
      updateSlots();
    }
  }

  var addBtnCache = '';
  function updateAddBtn() {
    var label;
    if (addBtnMode === 'buy') {
      $('btnAdd').classList.remove('free');
      label = '加球';
    } else {
      var left = Math.ceil((freeReadyAt - Date.now()) / 1000);
      $('btnAdd').classList.add('free');
      label = left > 0 ? left + 's 后领 +5' : '领取 +5';
    }
    if (label !== addBtnCache) {
      addBtnCache = label;
      $('addTx').textContent = label;
    }
  }

  /* ================= 菜单弹层 ================= */
  function openMenu() {
    snd('click');
    state = 'paused';
    $('bestTx').textContent = '最佳 ' + st.best + ' 分 · 第 ' + st.level + ' 关';
    $('menuModal').classList.add('show');
    $('helpSec').classList.remove('show');
  }
  function closeMenu() {
    $('menuModal').classList.remove('show');
    if (state === 'paused') state = 'play';
  }
  function bindDom() {
    $('menuBtn').addEventListener('click', function (e) { e.stopPropagation(); openMenu(); });
    $('mResume').addEventListener('click', function () { snd('click'); closeMenu(); });
    $('mHelp').addEventListener('click', function () {
      snd('click');
      $('helpSec').classList.toggle('show');
    });
    $('mCfg').addEventListener('click', function () {
      snd('click');
      closeMenu();
      var C = GP.CFGP;
      if (C && C.open) { try { C.open(); } catch (e) {} }
      else toast('设置面板未就绪');
    });
    var armed = false;
    $('mRestart').addEventListener('click', function () {
      snd('click');
      if (!armed) {
        armed = true;
        this.textContent = '再点一次确认重开';
        var self = this;
        setTimeout(function () { armed = false; self.textContent = '重新开始'; }, 2000);
      } else {
        armed = false;
        this.textContent = '重新开始';
        closeMenu();
        restartAll();
      }
    });
    $('btnCollect').addEventListener('click', function (e) {
      e.stopPropagation();
      snd('click');
      recallAll();
    });
    $('btnAdd').addEventListener('click', function (e) { e.stopPropagation(); onAddBtn(); });
    $('slotBomb').addEventListener('click', function (e) { e.stopPropagation(); onBombSlot(); });
    $('slotGlass').addEventListener('click', function (e) { e.stopPropagation(); onGlassSlot(); });
    $('menuModal').addEventListener('click', function (e) {
      if (e.target === this) closeMenu();
    });
    /* 场地点按 = 冲击波；按住拖动 = 瞄准发射 */
    cv.addEventListener('pointerdown', function (e) {
      GP.AUDIO && GP.AUDIO.unlock && GP.AUDIO.unlock();
      var x = (e.clientX - ax0 * fit) / fit;
      var y = (e.clientY - ay0 * fit) / fit;
      if (canAim() && !aim) {
        aim = { id: e.pointerId, sx: x, sy: y, cx: x, cy: y };
      } else {
        aim = null;
      }
      pointer = { x: x, y: y, t: Date.now() };
    });
    cv.addEventListener('pointermove', function (e) {
      if (!aim || e.pointerId !== aim.id) return;
      aim.cx = (e.clientX - ax0 * fit) / fit;
      aim.cy = (e.clientY - ay0 * fit) / fit;
    });
    cv.addEventListener('pointerup', function (e) {
      if (aim && e.pointerId === aim.id) {
        var params = aimParams();
        var len = params.len;
        var ax = aim.cx, ay = aim.cy;
        aim = null;
        pointer = null;
        if (len >= 24) {
          fireVolley(params);
        } else {
          shockwave(ax, ay);   /* 轻点仍是弹开小球 */
        }
        return;
      }
      if (!pointer) return;
      var x = (e.clientX - ax0 * fit) / fit;
      var y = (e.clientY - ay0 * fit) / fit;
      pointer = null;
      shockwave(x, y);
    });
    cv.addEventListener('pointercancel', function () { aim = null; pointer = null; });
  }

  function shockwave(x, y) {
    var now = Date.now();
    if (now - lastShock < 250) return;
    if (x < 0 || x > G.W || y < 0 || y > G.H) return;
    lastShock = now;
    var R = 92;
    var any = false;
    var bs = world.balls;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var dx = b.x - x, dy = b.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < R) {
        var f = (1 - d / R) * 480 + 90;
        var nx = d > 1 ? dx / d : 0, ny = d > 1 ? dy / d : -1;
        b.vx += nx * f;
        b.vy += ny * f - 60;
        any = true;
      }
    }
    fxRing(x, y, 'rgba(255,255,255,0.75)', 88, 0.45);
    fxRing(x, y, 'rgba(255,255,255,0.5)', 54, 0.35);
    fxBurst(x, y, '#ffe9a0', any ? 12 : 7);
    snd('click', { vol: 0.4 });
  }

  /* ================= 主循环 ================= */
  var lastNow = 0;
  function update(now) {
    if (!lastNow) lastNow = now;
    var dt = (now - lastNow) / 1000;
    lastNow = now;
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;
    stepGame(dt);
  }

  function stepGame(dt) {
    if (dt <= 0 || state === 'paused') return;
    var ts = slowmoT > 0 ? cfg.glassTimeScale : 1;
    if (slowmoT > 0) {
      slowmoT -= dt;
      if (slowmoT <= 0) { slowmoT = 0; snd('slow', { up: true }); updateSlots(); }
    }
    var sdt = dt * ts;
    world.step(sdt);
    var F = GP.FX;
    if (F && F.update) { try { F.update(sdt); } catch (e) {} }
    /* 发射队列：按间隔把库存球成串射出 */
    if (volleyQueue > 0) {
      volleyT += sdt * 1000;
      while (volleyT >= cfg.dropInterval && volleyQueue > 0) {
        volleyT -= cfg.dropInterval;
        volleyQueue--;
        spawnLaunchBall();
      }
      if (volleyQueue > 0 && st.balls <= 0) volleyQueue = 0;
    }
    /* 自动回收：静止/滞场过久的球飞回顶部 */
    autoRecall();
    /* + 号拾取球：碰球 +2 球 */
    if (pickups.length) {
      var pbs = world.balls;
      for (var pi = pickups.length - 1; pi >= 0; pi--) {
        var pk = pickups[pi];
        if (pk.dying) {
          pk.dying += dt;
          if (pk.dying > 0.45) pickups.splice(pi, 1);
          continue;
        }
        for (var pj = 0; pj < pbs.length; pj++) {
          var pb = pbs[pj];
          if (pb.dead) continue;
          var pdx = pb.x - pk.x, pdy = pb.y - (pk.baseY + Math.sin(world.time * 2 + pk.phase) * 3);
          var prr = pk.r + pb.r;
          if (pdx * pdx + pdy * pdy < prr * prr) {
            pk.dying = 0.0001;
            st.balls += 2;
            fxRing(pk.x, pk.y, 'rgba(255,255,255,0.8)', 46, 0.4);
            fxText(pk.x, pk.y - 18, '+2球', '#ffe9a0');
            snd('coin');
            hudDirty();
            SAVE.save();
            break;
          }
        }
      }
    }
    if (cfg.autoCollect) {
      autoCollectT += dt;
      if (autoCollectT > 1.2) {
        autoCollectT = 0;
        var bs0 = world.balls;
        var n0 = 0;
        for (var z = bs0.length - 1; z >= 0; z--) {
          var b0 = bs0[z];
          if (!b0.bomb && b0.speed < 40) { n0++; pushFlyer(b0, n0); }
        }
      }
    }
    /* bumper 动画衰减 */
    var list = world.bumpers;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 4);
      if (p.pop >= 0) {
        p.pop += dt * 4;
        if (p.pop > 1) p.pop = 1;
      }
    }
    /* 收球飞行（飞回即归位，不改库存——库存恒为可发射球数） */
    for (var f = flyers.length - 1; f >= 0; f--) {
      var fl = flyers[f];
      if (fl.delay > 0) { fl.delay -= dt; continue; }
      fl.t += dt * 1.8;
      if (fl.t >= 1) {
        flyers.splice(f, 1);
        var nowMs = Date.now();
        if (nowMs - lastTickSnd > 60) { lastTickSnd = nowMs; snd('coin'); }
      }
    }
    /* 回合结束（球全部收回）→ 停顿一拍 → 障碍物整体上升一格 */
    if (riseAnimT > 0) {
      riseAnimT -= dt;
      if (riseAnimT <= 0) { riseAnimT = 0; riseOff = 0; }
      else {
        var rk = riseAnimT / 0.35;
        riseOff = RISE_STEP * rk * rk;             /* 减速滑入 */
      }
    }
    if (roundArmed && state === 'play' && volleyQueue <= 0 &&
        world.balls.length === 0 && flyers.length === 0 &&
        risePend <= 0 && riseAnimT <= 0) {
      roundArmed = false;
      risePend = 0.5;
    }
    if (risePend > 0) {
      risePend -= dt;
      if (risePend <= 0) doRise();
    }
    /* 过关过渡 */
    if (state === 'clear') {
      clearTimer += dt;
      if (clearTimer > 1.7) nextLevel();
    }
    /* 震屏衰减 */
    shakeMag *= Math.exp(-6 * dt);
    /* 定时落盘 */
    saveT += dt;
    if (saveT > 8) { saveT = 0; SAVE.save(); }
    /* 加球按钮态 */
    updateAddBtn();
    /* toast */
    updateToast(dt);
    /* 教程 */
    if (!st.tutDone) {
      st.tutDone = true;
      setTimeout(function () { toast('按住拖动瞄准，松手发射球'); }, 1200);
      setTimeout(function () { toast('球停下会自动收回顶部 · 点按可弹开小球'); }, 5600);
      SAVE.save();
    }
    updateHud();
  }

  function updateToast(dt) {
    toastT -= dt;
    var el = $('toast');
    if (toastT <= 0) {
      if (toastQ.length) {
        el.textContent = toastQ.shift();
        el.classList.add('show');
        toastT = 1.9;
      } else {
        el.classList.remove('show');
      }
    }
  }

  function render() {
    var w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var sx = shakeMag > 0.1 ? (Math.random() - 0.5) * shakeMag : 0;
    var sy = shakeMag > 0.1 ? (Math.random() - 0.5) * shakeMag : 0;
    ctx.setTransform(dpr * fit, 0, 0, dpr * fit, (ax0 * fit + sx) * dpr, (ay0 * fit + sy) * dpr);
    /* 静态层：后景 → 漩涡 → 前景墙线（均锚定世界原点，随 ax0/ay0 平移） */
    if (staticBack) ctx.drawImage(staticBack, 0, 0, G.W, G.H);
    var t = performance.now() / 1000;
    if (vortexCv) {
      ctx.save();
      ctx.translate(G.vortex.x, G.vortex.y);
      ctx.rotate(t * 0.5);
      var vs = G.vortex.r * 2 / 200 * (1 + 0.035 * Math.sin(t * 2.1));
      ctx.drawImage(vortexCv, -100 * vs, -100 * vs, 200 * vs, 200 * vs);
      ctx.restore();
    }
    if (staticFront) ctx.drawImage(staticFront, 0, 0, G.W, G.H);
    /* 关卡数字 + 本轮待发球数（对齐原版杯口下双数字） */
    ctx.font = '700 15px -apple-system,PingFang SC,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(st.level), G.levelTx.x, G.levelTx.y);
    var qlen = volleyQueue > 0 ? volleyQueue : (aim ? st.balls : 0);
    if (qlen > 0) {
      ctx.textAlign = 'left';
      ctx.fillText(String(qlen), 216, G.levelTx.y);
    }
    /* 待发射球（杯口）+ 瞄准 UI */
    var idle = st.balls > 0 && volleyQueue <= 0;
    if (idle && ballCv) {
      var bob = Math.sin(t * 3) * 2;
      ctx.drawImage(ballCv, 195 - 13, 148 - 13 + bob, 26, 26);
    }
    if (idle && !aim && world.balls.length === 0 && state === 'play') {
      ctx.font = '600 14px -apple-system,PingFang SC,sans-serif';
      ctx.fillStyle = 'rgba(244,219,212,' + (0.45 + 0.3 * Math.sin(t * 2.4)).toFixed(2) + ')';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('按住拖动瞄准 · 松手发射', 195, 216);
    }
    if (aim) {
      var ap = aimParams();
      var axx = Math.cos(ap.angle), ayy = Math.sin(ap.angle);
      var px2 = -ayy, py2 = axx;
      var lineLen = Math.max(30, ap.dist - 20);
      /* 羽箭虚线：杯口 → 手指（小 "v" 刻度指向飞行方向） */
      ctx.strokeStyle = 'rgba(255,250,242,0.85)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (var dd = 26; dd < lineLen; dd += 15) {
        var tx = 195 + axx * dd, ty = 148 + ayy * dd;
        var vw = 5, back = 5.5;
        ctx.beginPath();
        ctx.moveTo(tx - axx * back - px2 * vw, ty - ayy * back - py2 * vw);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx - axx * back + px2 * vw, ty - ayy * back + py2 * vw);
        ctx.stroke();
      }
      /* 青环触点球 */
      var fx0 = 195 + axx * (lineLen + 13), fy0 = 148 + ayy * (lineLen + 13);
      if (ballCv) ctx.drawImage(ballCv, fx0 - 10, fy0 - 10, 20, 20);
      ctx.beginPath();
      ctx.arc(fx0, fy0, 12.4, 0, GP.TAU);
      ctx.strokeStyle = '#2fc8e8';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx0, fy0, 14.4, 0, GP.TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    /* bumpers */
    var list = world.bumpers;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive && p.pop >= 1) continue;
      var spr = bumperSprite(p);
      var R = sprR(p);
      var sc = 1, al = 1;
      if (!p.alive) {
        sc = 1 + p.pop * 0.55;
        al = 1 - p.pop;
      } else if (p.flash > 0) {
        sc = 1 + p.flash * 0.1;
      }
      ctx.save();
      ctx.globalAlpha = al;
      ctx.translate(p.x, p.y + riseOff);
      ctx.scale(sc, sc);
      ctx.drawImage(spr, -(R + 16), -(R + 16), (R + 16) * 2, (R + 16) * 2);
      if (p.flash > 0.02) {
        ctx.globalAlpha = al * p.flash * 0.38;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.95, 0, GP.TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = al;
      }
      if (p.alive) {
        var fs = (p.kind === 'big' ? R * 0.62 : R * 0.82);
        if (p.count >= 100) fs *= 0.74;
        else if (p.count >= 10) fs *= 0.9;
        ctx.font = '800 ' + fs.toFixed(1) + 'px -apple-system,PingFang SC,sans-serif';
        ctx.fillStyle = p.color.ink || '#38332e';
        ctx.fillText(String(p.count), 0, 1);
      }
      ctx.restore();
    }
    /* + 号拾取球 */
    for (var pi2 = 0; pi2 < pickups.length; pi2++) {
      var pk2 = pickups[pi2];
      var pky = pk2.baseY + riseOff + Math.sin(t * 2 + pk2.phase) * 3;
      var pka = pk2.dying ? Math.max(0, 1 - pk2.dying / 0.45) : 1;
      var pks = pk2.dying ? 1 + pk2.dying * 1.4 : (1 + 0.04 * Math.sin(t * 3 + pk2.phase));
      ctx.save();
      ctx.globalAlpha = pka;
      ctx.translate(pk2.x, pky);
      ctx.scale(pks, pks);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, GP.TAU);
      ctx.fillStyle = '#f7f4ef';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e84a5e';
      ctx.stroke();
      ctx.fillStyle = '#d13c50';
      ctx.fillRect(-2.2, -6.6, 4.4, 13.2);
      ctx.fillRect(-6.6, -2.2, 13.2, 4.4);
      ctx.restore();
    }
    /* 球 */
    var bs = world.balls;
    for (var k = 0; k < bs.length; k++) {
      var b = bs[k];
      var r = b.r;
      var grow = b.spawnT != null && b.spawnT < 1 ? (0.4 + 0.6 * b.spawnT) : 1;
      if (b.spawnT != null && b.spawnT < 1) b.spawnT = Math.min(1, b.spawnT + 0.1);
      var img = b.bomb && !b.bombDone ? bombCv : ballCv;
      if (img) {
        ctx.drawImage(img, b.x - r * grow * 1.15, b.y - r * grow * 1.15, r * grow * 2.3, r * grow * 2.3);
        if (b.bomb && !b.bombDone) {
          ctx.fillStyle = (Math.floor(t * 20) % 2) ? '#ffd76a' : '#ff9c3e';
          ctx.beginPath();
          ctx.arc(b.x + 3, b.y - r - 4, 2.4, 0, GP.TAU);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * grow, 0, GP.TAU);
        ctx.fill();
      }
    }
    /* 收球飞行点 */
    for (var f2 = 0; f2 < flyers.length; f2++) {
      var fl2 = flyers[f2];
      if (fl2.delay > 0) continue;
      var tt = fl2.t;
      var mx = (fl2.x + 195) / 2;
      var my = Math.min(fl2.y, 146) - 110;
      var u = 1 - tt;
      var fx = u * u * fl2.x + 2 * u * tt * mx + tt * tt * 195;
      var fy = u * u * fl2.y + 2 * u * tt * my + tt * tt * 146;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(fx, fy, 6, 0, GP.TAU);
      ctx.fill();
    }
    /* FX 粒子 */
    var F = GP.FX;
    if (F && F.draw) { try { F.draw(ctx); } catch (e) {} }
    /* 慢动作罩 */
    if (slowmoT > 0) {
      ctx.fillStyle = 'rgba(110,150,210,0.10)';
      ctx.fillRect(-ax0, -ay0, w / (dpr * fit), h / (dpr * fit));
      ctx.font = '700 13px -apple-system,PingFang SC,sans-serif';
      ctx.fillStyle = 'rgba(210,228,255,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('慢动作 ' + slowmoT.toFixed(1) + 's', 195, 205);
    }
    if (cfg.mods && cfg.mods.showFps) {
      ctx.font = '600 11px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(fpsV + 'fps ' + world.balls.length + 'b', 8, G.H - 100);
    }
  }

  function loop(now) {
    try {
      update(now);
      render();
      fpsN++;
      if (now - fpsT > 500) {
        fpsV = Math.round(fpsN * 1000 / (now - fpsT));
        fpsN = 0; fpsT = now;
      }
    } catch (e) { /* 帧循环不中断 */ }
    requestAnimationFrame(loop);
  }

  /* ================= 尺寸 ================= */
  function resize() {
    var iw = window.innerWidth, ih = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var arenaH = GP.clamp(ih, 640, 880);
    if (ih >= 640 && ih <= 880) arenaH = ih;
    G = geo(arenaH);
    fit = Math.min(iw / G.W, ih / G.H);
    if (ih / G.H > fit) { /* 高度富余 → 垂直居中 */ }
    ax0 = (iw / fit - G.W) / 2;
    ay0 = (ih / fit - G.H) / 2;
    cv.width = Math.round(iw * dpr);
    cv.height = Math.round(ih * dpr);
    cv.style.width = iw + 'px';
    cv.style.height = ih + 'px';
    buildStatic();
    setDomLayout();
    /* bumper 位置夹回新边界 */
    var list = world ? world.bumpers : [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var r = bumpR(p);
      p.y = GP.clamp(p.y, 262, G.H - 190 - r);
      p.baseX = GP.clamp(p.baseX, 42 + r, AW - 42 - r);
      p.x = p.baseX;
    }
    for (var j2 = 0; j2 < pickups.length; j2++) {
      pickups[j2].baseY = GP.clamp(pickups[j2].baseY, 262, G.H - 200);
    }
  }

  /* ================= 配置变更 ================= */
  function applyConfig(c) {
    cfg = c;
    if (world) {
      world.gravity = cfg.gravity;
      world.restWall = cfg.restWall;
      world.restBumper = cfg.restBumper;
      world.restFloor = cfg.restFloor;
      world.restBall = cfg.restBall;
      world.bumperKick = cfg.bumperKick;
      for (var i = 0; i < world.segs.length; i++) {
        world.segs[i].rest = world.segs[i].floor ? cfg.restFloor : cfg.restWall;
      }
    }
    var A = GP.AUDIO;
    if (A) {
      try {
        A.setVolume(cfg.sfxVolume);
        A.setMuted(cfg.muted);
        if (A.applyOverrides && cfg.sounds) A.applyOverrides(cfg.sounds);
      } catch (e) {}
    }
    if (cfg.icons) {
      if (cfg.icons.bomb) $('bombImg').src = cfg.icons.bomb;
      if (cfg.icons.hourglass) $('glassImg').src = cfg.icons.hourglass;
    }
  }

  /* ================= 启动 ================= */
  function boot() {
    cv = $('c');
    ctx = cv.getContext('2d');
    st = SAVE.load();
    cfg = CFG.all();
    /* 旧档 dropInterval（自动落球时代 300~900ms）迁移为发射间隔 */
    if (cfg.dropInterval > 240 || cfg.dropInterval < 40) cfg = CFG.apply({ dropInterval: 90 });
    if (Q0.balls !== undefined) { /* 已在 SAVE.load 处理 */ }
    world = new PHY.World({
      gravity: cfg.gravity,
      restWall: cfg.restWall, restBumper: cfg.restBumper,
      restFloor: cfg.restFloor, restBall: cfg.restBall,
      bumperKick: cfg.bumperKick
    });
    world.onBumperHit = onBumperHit;
    world.onSwallow = onSwallow;
    world.onBomb = onBombBall;
    world.onBounce = onBounce;
    world.swallow = { x: 195, y: 40, r: 26 };
    world.attract = { x: 195, y: 30, yMax: 200, halfW: 34, k: 5200 };
    resize();
    world.setStatics(buildSegs());
    genLevel(st.level);
    buildVortexSprite();
    buildBallSprite();
    /* 图标注入 */
    try {
      var AR = GP.ART;
      if (AR && AR.icon) {
        $('menuImg').src = AR.icon('menu');
        $('bombImg').src = cfg.icons.bomb || AR.icon('bomb');
        $('glassImg').src = cfg.icons.hourglass || AR.icon('hourglass');
        $('addPlusImg').src = AR.icon('plus');
      }
    } catch (e) {}
    bindDom();
    var A = GP.AUDIO;
    if (A && A.init) { try { A.init(); } catch (e) {} }
    var F = GP.FX;
    if (F && F.init) { try { F.init(cv); } catch (e) {} }
    applyConfig(cfg);
    CFG.onChange(applyConfig);
    window.addEventListener('resize', function () {
      resize();
      world.setStatics(buildSegs());
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        resize();
        world.setStatics(buildSegs());
      }, 300);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) SAVE.save();
    });
    window.addEventListener('pagehide', function () { SAVE.save(); });
    /* rAF + 看门狗双驱动（遮挡窗口 rAF 冻结时物理继续） */
    requestAnimationFrame(loop);
    setInterval(function () {
      if (document.hidden) update(performance.now());
    }, 200);
    updateSlots();
    updateAddBtn();
    state = 'play';
    hudDirty();
  }

  var Q0 = GP.Q;

  /* ================= 测试钩子 ================= */
  window.__gp = {
    v: '1.0',
    get state() { return state; },
    get st() { return st; },
    get cfg() { return cfg; },
    get WORLD() { return world; },
    get stats() {
      return {
        level: st.level, score: st.score, balls: st.balls,
        inPlay: world ? world.balls.length : 0,
        bumps: world ? world.bumpers.filter(function (p) { return p.alive; }).length : 0,
        swallows: st.swallows, pops: st.pops, fps: fpsV, slow: slowmoT, bombArmed: bombArmed,
        risePend: risePend, riseAnim: riseAnimT, riseOff: riseOff
      };
    },
    get pickups() { return pickups; },
    get flyers() { return flyers; },
    dropOne: function () { dropOne(); },
    collect: function () { return recallAll(); },
    step: function (d) { stepGame(d); },
    launch: function (angleDeg, speed, count) {
      if (state !== 'play' && state !== 'clear') return;
      var n = Math.min(count == null ? st.balls : count, st.balls);
      if (n <= 0) return;
      volleyQueue = n;
      volleyAngle = (angleDeg == null ? 90 : angleDeg) * Math.PI / 180;
      volleySpd = speed || 1000;
      volleyT = cfg.dropInterval;
    },
    addBalls: function (n) { st.balls += n; hudDirty(); },
    useBomb: function () { onBombSlot(); },
    useGlass: function () { onGlassSlot(); },
    shock: function (x, y) { shockwave(x, y); },
    clearLevel: function () {
      var list = world.bumpers;
      for (var i = 0; i < list.length; i++) if (list[i].alive) damageBumper(list[i], list[i].count, false);
    },
    jumpLevel: function (n) {
      st.level = n; st.addBallUses = 0; genLevel(n); SAVE.save(); hudDirty();
    },
    restart: restartAll,
    genLevel: genLevel
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
