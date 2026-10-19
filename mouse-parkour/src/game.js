/* =====================================================================
 * 鼠族跑酷 · MOUSE RUSH — 主线模块（game.js）
 * 主循环 / 输入 / 状态机 / 渲染编排 / 关卡流程 / 存档
 * 详见 src/contract.md（唯一事实源）
 * ===================================================================== */
(function () {
  'use strict';
  window.MP = window.MP || {};

  /* ---------------- 模块兜底（任一模块缺失时不崩） ---------------- */
  const NOOP = function () {};
  const _cache = {};
  function mod(name) {
    if (!_cache[name]) {
      _cache[name] = new Proxy({}, {
        get: function (t, k) {
          if (k === 'then') return undefined;
          return NOOP;
        }
      });
    }
    return _cache[name] || (_cache[name] = new Proxy({}, { get: function () { return NOOP; } }));
  }
  function L() { return (window.MP && window.MP.LOGIC) || mod('LOGIC'); }
  function A() { return (window.MP && window.MP.ART) || mod('ART'); }
  function F() { return (window.MP && window.MP.FX) || mod('FX'); }
  function S() { return (window.MP && window.MP.SFX) || mod('SFX'); }
  function U() { return (window.MP && window.MP.UI) || mod('UI'); }

  /* ---------------- 常量 ---------------- */
  const FIXED_DT = 1 / 60;
  const VIEW_W_PORTRAIT = 520;
  const VIEW_W_LANDSCAPE = 960;
  const VIEW_H_PORTRAIT = 700;
  const GROUND_Y = 460;
  const STYLE_KINDS = ['dash', 'stomp', 'slam', 'slide', 'djump', 'hardland', 'graze', 'air'];
  const STYLE_ORDER = ['D', 'C', 'B', 'A', 'S', 'SS'];
  /* 全局游戏速度档位（设置面板可切）：整体时间缩放，物理/粒子/机关同步变慢变快 */
  const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

  const KEY_SAVE = 'mr.save.v1';
  const KEY_CFG = 'mr.cfg.v1';
  const KEY_RECORDS = 'mr.records.v1';

  /* ---------------- 全局状态 ---------------- */
  const G = {
    state: 'menu',            // menu | playing | paused | clear | over | settings
    prevState: 'menu',
    run: null,                // LOGIC.createRun()
    level: null,              // LevelSpec
    player: null,
    g: null,                  // 局内全局数据
    cam: { x: 0, y: 0, zoom: 1, zoomT: 0 },
    hitstop: 0,
    t: 0,                     // 动画时钟
    frame: 0,
    acc: 0,
    lastTs: 0,
    bullets: [],
    megaburst: 0,
    shakeAmt: 0,
    viewW: VIEW_W_LANDSCAPE,
    viewH: 540,
    scale: 1,
    dpr: 1,
    cw: 0, ch: 0,
    canvas: null, ctx: null,
    key: {},                  // 键盘状态
    touchAxis: 0,
    touchBtn: { jump: false, dash: false, slide: false },
    stick: { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 },
    cfg: {
      bgm: 0.5, sfx: 0.7, vibrate: true, quality: 'high',
      orient: 'auto', touchUI: null, speed: 1
    },
    records: { bestScore: 0, bestLevel: 0, bestCombo: 0, bestStyle: 'D', bestStylePts: 0 },
    lastResult: null,
    errors: []
  };

  /* ---------------- 小工具 ---------------- */
  const clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const aabb = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };
  const now = function () { return Date.now(); };

  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function load(key, def) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return def;
      const v = JSON.parse(raw);
      return v === null || v === undefined ? def : v;
    } catch (e) { return def; }
  }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  /* =====================================================================
   * 存档 / 设置 / 记录
   * ===================================================================== */
  function loadCfg() {
    const c = load(KEY_CFG, null);
    if (c && typeof c === 'object') {
      G.cfg.bgm = typeof c.bgm === 'number' ? c.bgm : 0.5;
      G.cfg.sfx = typeof c.sfx === 'number' ? c.sfx : 0.7;
      G.cfg.vibrate = c.vibrate !== false;
      G.cfg.quality = c.quality === 'low' ? 'low' : 'high';
      G.cfg.orient = ['auto', 'portrait', 'landscape'].indexOf(c.orient) >= 0 ? c.orient : 'auto';
      G.cfg.touchUI = typeof c.touchUI === 'boolean' ? c.touchUI : null;
      G.cfg.speed = SPEED_STEPS.indexOf(c.speed) >= 0 ? c.speed : 1;
    }
  }
  function saveCfg() { store(KEY_CFG, G.cfg); }

  function loadRecords() {
    const r = load(KEY_RECORDS, null);
    if (r && typeof r === 'object') {
      G.records.bestScore = r.bestScore || 0;
      G.records.bestLevel = r.bestLevel || 0;
      G.records.bestCombo = r.bestCombo || 0;
      G.records.bestStyle = r.bestStyle || 'D';
      G.records.bestStylePts = r.bestStylePts || 0;
    }
  }
  function saveRecords() { store(KEY_RECORDS, G.records); }

  function saveRun() {
    if (!G.g) return;
    store(KEY_SAVE, {
      runSeed: G.g.runSeed,
      level: G.g.level,
      score: G.g.score,
      coin: G.g.coin,
      cheese: G.g.cheese,
      energy: G.g.energy,
      lives: G.g.lives,
      maxLives: G.g.maxLives,
      breakdown: G.g.mk,
      stats: G.g.stats,
      bestCombo: G.g.bestCombo,
      bestStyleLevel: G.g.bestStyleLevel,
      bestStylePts: G.g.bestStylePts,
      ts: now()
    });
  }
  function clearRun() { remove(KEY_SAVE); }

  function hasSave() {
    const s = load(KEY_SAVE, null);
    return !!(s && s.runSeed);
  }

  /* =====================================================================
   * 局内数据
   * ===================================================================== */
  function newRun(seed) {
    const runSeed = (seed === undefined || seed === null) ? (Math.floor(Math.random() * 1e9) + 1) : (seed >>> 0);
    const run = (L().createRun ? L().createRun(runSeed) : {});
    run.runSeed = runSeed;
    run.level = 1;
    run.score = 0;
    run.coin = 0;
    run.cheese = 0;
    run.gems = 0;
    run.energy = 0;
    run.lives = 3;
    run.maxLives = 5;
    run.bestCombo = 0;
    run.bestStyleLevel = 'D';
    run.bestStylePts = 0;
    run.flawless = true;
    run.levelDeaths = 0;
    run.levelCheese = 0;
    run.distUnits = 0;
    run.mk = { distance: 0, pickup: 0, style: 0, kill: 0, clear: 0 };
    run.stats = { kills: 0, items: 0, jumps: 0, djumps: 0, dashes: 0, deaths: 0, stomp: 0, slides: 0, hardLand: 0, graze: 0 };
    G.run = run;
    G.g = run;
    return run;
  }

  /* 得分统一走逻辑层：它负责连击倍率、四叶草翻倍与连击计数 */
  function addScore(kind, amount, x, y, color) {
    const g = G.g;
    if (!g) return 0;
    const comboBefore = g.combo || 0;
    const gain = (L().addScore ? (L().addScore(g, amount, kind) || amount) : amount);
    if (g.mk && Object.prototype.hasOwnProperty.call(g.mk, kind)) g.mk[kind] += gain;
    if (x !== undefined && F().floatText) {
      F().floatText(x, y, '+' + gain, { color: color || '#ffd23f', size: 18 });
    }
    if ((g.combo || 0) > comboBefore) showCombo(g.combo);
    return gain;
  }

  function showCombo(combo) {
    const p = G.player;
    if (!p || combo < 3) return;
    if (S().play) S().play('combo', { rate: Math.min(2.2, 0.8 + combo * 0.05) });
    if (F().floatText) F().floatText(p.x + p.w / 2, p.y - 20, '连击 ×' + combo, { color: '#ff4d8d', size: 19, crit: true });
  }

  /* 风格分由逻辑层（MP.LOGIC.addStyle）统一结算，这里只负责等级变化的表现 */
  let lastStyleLevel = 'D';
  function syncStyle() {
    const p = G.player, g = G.g;
    if (!p || !g) return;
    if (p.styleLevel && p.styleLevel !== lastStyleLevel) {
      const up = STYLE_ORDER.indexOf(p.styleLevel) > STYLE_ORDER.indexOf(lastStyleLevel);
      lastStyleLevel = p.styleLevel;
      if (U().popup) U().popup('风格 ' + p.styleLevel, up ? 'good' : 'info');
      if (S().play) S().play('style');
      if (F().ring && p.x !== undefined) {
        F().ring(p.x + p.w / 2, p.y + p.h / 2, { r0: 10, r1: 90, life: 0.5, color: up ? '#35e0c8' : '#8892b0', width: 4 });
      }
    }
    if ((p.stylePts || 0) > (g.bestStylePts || 0)) {
      g.bestStylePts = p.stylePts;
      g.bestStyleLevel = p.styleLevel;
    }
  }

  function addEnergy(v) {
    const g = G.g, p = G.player;
    if (!g) return;
    g.energy = clamp((g.energy || 0) + v, 0, 100);
    if (p) p.energy = g.energy;
  }

  /* =====================================================================
   * 关卡流程
   * ===================================================================== */
  function startLevel(n) {
    const g = G.g || newRun();
    g.level = n;
    const level = L().genLevel ? L().genLevel(n, g.runSeed) : null;
    if (!level) { console.error('[mp] genLevel 失败'); return; }
    G.level = level;
    G.bullets = [];
    const spawn = level.spawn || { x: 90, y: level.groundY - 60 };
    const p = L().createPlayer ? L().createPlayer(spawn.x, spawn.y) : { x: spawn.x, y: spawn.y, w: 34, h: 26, vx: 0, vy: 0 };
    p.level = n;
    p.spawnX = spawn.x; p.spawnY = spawn.y;
    p.checkpointX = spawn.x;
    p.lives = g.lives;
    p.maxLives = g.maxLives;
    p.coins = g.coin; p.cheese = g.cheese; p.score = g.score;
    p.combo = 0; p.comboTimer = 0;
    p.buffs = p.buffs || {};
    p.dead = false; p.deadT = 0; p.hp = (L().PHYS && L().PHYS.MAX_HP) || 3;
    G.player = p;
    lastStyleLevel = 'D';
    g.flawless = true;
    g.levelDeaths = 0;
    g.levelCheese = 0;

    G.state = 'playing';
    G.hitstop = 0;
    G.cam.x = clamp(p.x - G.viewW * 0.38, 0, Math.max(0, level.length - G.viewW));
    updateCam(0, true);

    if (U().show) U().show('hud');
    if (S().startBGM) S().startBGM('run');
    saveRun();
  }

  function retryLevel() {
    if (!G.g) return;
    G.g.energy = 0;
    startLevel(G.g.level);
  }

  function nextLevel() {
    if (!G.g) return;
    const n = G.g.level + 1;
    G.g.lives = Math.min(G.g.maxLives, G.g.lives + 1);
    G.g.energy = 0;
    if (n > G.records.bestLevel) { G.records.bestLevel = n; saveRecords(); }
    startLevel(n);
  }

  function toMenu() {
    G.state = 'menu';
    G.player = null;
    G.level = null;
    if (S().startBGM) S().startBGM('menu');
    if (U().show) U().show('menu');
  }

  function pause() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    if (S().stopBGM) S().stopBGM();
    if (U().show) U().show('pause');
  }
  function resume() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    if (S().startBGM) S().startBGM('run');
    if (U().show) U().show('hud');
  }
  function togglePause() {
    if (G.state === 'playing') pause();
    else if (G.state === 'paused') resume();
  }

  /* =====================================================================
   * 伤害 / 死亡
   * 碰撞判定与扣血由逻辑层（MP.LOGIC.stepPhysics）负责，这里只做表现与流程
   * ===================================================================== */
  function onHurtEvent(ev) {
    const p = G.player, g = G.g;
    if (!p || !g) return;
    if (ev.blocked) {
      // 护盾挡下
      if (F().ring) F().ring(p.x + p.w / 2, p.y + p.h / 2, { r0: 12, r1: 74, life: 0.45, color: '#7ff2ff', width: 5 });
      if (F().floatText) F().floatText(p.x + p.w / 2, p.y - 10, '护盾抵挡', { color: '#7ff2ff', size: 17 });
      if (S().play) S().play('shield');
      if (F().addShake) F().addShake(0.22);
      return;
    }
    if (ev.saved) {
      // 复活铃铛
      if (F().ring) F().ring(p.x + p.w / 2, p.y + p.h / 2, { r0: 10, r1: 120, life: 0.6, color: '#ffd23f', width: 5 });
      if (F().floatText) F().floatText(p.x + p.w / 2, p.y - 10, '复活铃铛！', { color: '#ffd23f', size: 18, crit: true });
      if (U().toast) U().toast('复活铃铛救了你一次！', 'good');
      if (S().play) S().play('powerup');
      return;
    }
    g.flawless = false;
    if (F().explosion) F().explosion(p.x + p.w / 2, p.y + p.h / 2, 0.7, { colors: ['#ff4d8d', '#ffffff'] });
    if (F().flash) F().flash('#ff2d55', 0.45, 180);
    if (F().floatText) F().floatText(p.x + p.w / 2, p.y, '-1 命', { color: '#ff4d8d', size: 22, crit: true });
    if (F().addShake) F().addShake(0.6);
    if (S().play) S().play('hurt');
    if (navigator.vibrate && G.cfg.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
    g.lives = p.lives;
  }

  function onDieEvent(ev) {
    const p = G.player, g = G.g;
    if (!p || !g) return;
    g.lives = p.lives;
    g.deaths = (g.deaths || 0) + 1;
    g.levelDeaths = (g.levelDeaths || 0) + 1;
    p.dead = true; p.deadT = 0;
    p.vy = -520; p.vx = 0;
    if (F().explosion) F().explosion(p.x + p.w / 2, p.y + p.h / 2, 1.1, { colors: ['#ffd23f', '#ff6b3d', '#ffffff'] });
    if (F().addShake) F().addShake(0.9);
    if (F().flash) F().flash('#ffffff', 0.5, 220);
    if (F().slowmo) F().slowmo(0.35, 0.8);
    if (S().play) S().play('die');
    if (navigator.vibrate && G.cfg.vibrate) { try { navigator.vibrate([40, 60, 90]); } catch (e) {} }
    if (p.lives <= 0) {
      setTimeout(function () { gameOver(); }, 1100);
    } else {
      setTimeout(function () { respawn(); }, 1000);
    }
  }

  function respawn() {
    const p = G.player, g = G.g;
    if (!p || !g) return;
    const cp = p.checkpointX !== undefined ? p.checkpointX : p.spawnX;
    p.x = cp; p.y = G.level.groundY - p.h;
    p.vx = 0; p.vy = 0;
    p.dead = false; p.deadT = 0;
    p.invuln = 1.6; p.hurtT = 0;
    p.hp = (L().PHYS && L().PHYS.MAX_HP) || 3;
    p.jumpsLeft = p.permanentBubbles ? 2 : 1;
    p.dashT = 0; p.dashCd = 0; p.sliding = false; p.slideT = 0;
    p.stylePts = 0; p.styleLevel = 'D'; p.styleCombo = 0;
    p.combo = 0; p.comboTimer = 0;
    p.buffs = {};
    p.onGround = false;
    p.standId = null; p.crumbleStand = null;
    g.combo = 0; g.comboTimer = 0;
    lastStyleLevel = 'D';
    G.bullets = [];
    if (F().slowmo) F().slowmo(1, 0);
    if (U().toast) U().toast('再接再厉！剩余 ' + p.lives + ' 命', 'info');
  }

  function gameOver() {
    const g = G.g;
    G.state = 'over';
    if (S().startBGM) S().startBGM('gameover');
    if (g) {
      if (g.score > (G.records.bestScore || 0)) { G.records.bestScore = g.score; }
      if (g.level > (G.records.bestLevel || 0)) { G.records.bestLevel = g.level; }
      if (g.bestCombo > (G.records.bestCombo || 0)) G.records.bestCombo = g.bestCombo;
      if (g.bestStylePts > (G.records.bestStylePts || 0)) {
        G.records.bestStylePts = g.bestStylePts;
        G.records.bestStyleLevel = g.bestStyleLevel;
      }
      saveRecords();
      clearRun();
    }
    const data = {
      kind: 'over',
      score: g ? g.score : 0,
      best: G.records.bestScore,
      level: g ? g.level : 1,
      bestCombo: g ? g.bestCombo : 0,
      bestStyleLevel: g ? g.bestStyleLevel : 'D',
      bestStylePts: g ? g.bestStylePts : 0,
      stats: g ? g.stats : {},
      mk: g ? g.mk : null
    };
    G.lastResult = data;
    if (U().result) U().result(data);
  }

  function levelClear() {
    const g = G.g, p = G.player, level = G.level;
    if (!g || !level) return;
    const target = (L().levelTargets ? L().levelTargets(g.level) : { cheese: 6 }) || { cheese: 6 };
    const cheeseGot = g.levelCheese || 0;      // 本关收集（星级按本关判定）
    const cheeseTotal = g.cheese || 0;         // 本局累计
    const flawless = g.flawless !== false;
    const res = (L().scoreLevelClear ? L().scoreLevelClear(g, g.level, {
      flawless: flawless, cheese: cheeseGot, lives: Math.max(0, p.lives || 0)
    }) : null) || {};
    const total = res.total || 0;
    g.score = (g.score || 0) + total;
    if (g.mk) g.mk.clear += total;
    const stars = res.stars || (cheeseGot >= target.cheese ? 2 : 1);

    G.state = 'clear';
    if (S().startBGM) S().startBGM('clear');
    if (F().addShake) F().addShake(0.5);
    if (F().flash) F().flash('#ffd23f', 0.4, 240);
    if (S().play) S().play('clear');
    if (navigator.vibrate && G.cfg.vibrate) { try { navigator.vibrate([30, 40, 30, 40, 80]); } catch (e) {} }

    if (g.score > (G.records.bestScore || 0)) G.records.bestScore = g.score;
    if (g.level > (G.records.bestLevel || 0)) G.records.bestLevel = g.level;
    saveRecords();

    const data = {
      kind: 'clear',
      level: g.level,
      score: g.score,
      mk: g.mk,
      breakdown: {
        base: res.base || 0,
        flawless: res.flawless || 0,
        cheese: res.cheese || 0,
        lives: res.lives || 0,
        total: total
      },
      base: res.base || 0,
      flawless: flawless,
      cheese: cheeseGot,
      cheeseTotal: cheeseTotal,
      targetCheese: target.cheese,
      stars: stars,
      styleLevel: p.styleLevel,
      stylePts: p.stylePts,
      combo: g.bestCombo,
      coin: g.coin,
      best: G.records.bestScore,
      nextLevel: g.level + 1
    };
    G.lastResult = data;
    if (U().result) U().result(data);
    saveRun();
  }

  /* =====================================================================
   * 必杀：鼠王冲刺
   * ===================================================================== */
  function fireMega() {
    const p = G.player, g = G.g;
    if (!p || !g) return;
    if ((g.energy || 0) < 100) { if (U().toast) U().toast('能量不足', 'bad'); return; }
    g.energy = 0;
    p.invuln = 2.2;
    p.dashT = 0.7;
    p.dashDir = p.dir || 1;
    p.dashCd = 0;
    G.megaburst = 0.7;
    if (F().slowmo) F().slowmo(0.5, 0.5);
    if (F().addShake) F().addShake(0.8);
    if (F().flash) F().flash('#ffd23f', 0.55, 260);
    if (U().popup) U().popup('鼠王冲刺！', 'good');
    if (S().play) S().play('mega');
    // 清屏敌人与危险机关
    const level = G.level;
    if (level) {
      for (const e of level.enemies) {
        if (e.x > G.cam.x - 60 && e.x < G.cam.x + G.viewW + 60) {
          e.hp = 0; e.dead = true;
          if (F().explosion) F().explosion(e.x, e.y, 0.6, { colors: ['#ffd23f', '#fff'] });
          g.stats.kills++;
          addScore('kill', 60, e.x, e.y, '#ffd23f');
        }
      }
      for (const h of level.hazards) {
        if (h.kind === 'pendulum' || h.kind === 'laser' || h.kind === 'blade' || h.kind === 'crusher') {
          if (h.x > G.cam.x - 60 && h.x < G.cam.x + G.viewW + 60) { h.dead = true; h.on = false; }
        }
      }
    }
  }

  /* =====================================================================
   * 世界更新（移动平台 / 敌人 / 机关 / 弹幕）
   * ===================================================================== */
  function updateWorld(dt) {
    const level = G.level, p = G.player;
    if (!level) return;
    const diff = level.diff || 1;

    /* 移动平台 */
    for (const s of level.solids) {
      if (s.kind !== 'mover') continue;
      const px = s.x, py = s.y;
      s.phase = (s.phase || 0) + dt * (s.speed || 1);
      if (s.axis === 'y') {
        const base = s.y0 !== undefined ? s.y0 : s.y;
        s.y = base + Math.sin(s.phase) * (s.range || 60);
      } else {
        const base = s.x0 !== undefined ? s.x0 : s.x;
        s.x = base + Math.sin(s.phase) * (s.range || 80);
      }
      s._dx = s.x - px; s._dy = s.y - py;
    }

    /* 危险机关动态行为 */
    for (const h of level.hazards) {
      if (h.dead) continue;
      h.t = (h.t || 0) + dt;
      if (h.kind === 'pendulum') {
        const ang = (h.phase || 0) + h.t * (h.speed || 1.6);
        const len = h.len || 90;
        h.hx = h.x + Math.cos(ang) * len;
        h.hy = h.y + Math.sin(ang) * len;
      } else if (h.kind === 'laser') {
        const per = h.period || 2.4;
        const onT = h.onTime || 1.0;
        h.on = (((h.t + (h.phase || 0)) % per) < onT);
      } else if (h.kind === 'crusher') {
        const per = h.period || 3.0;
        const cyc = (h.t + (h.phase || 0)) % per;
        const down = h.drop || 120;
        h.cy = (cyc < per * 0.35) ? (cyc / (per * 0.35)) * down : down;
      } else if (h.kind === 'blade') {
        h.angle = (h.phase || 0) + h.t * (h.speed || 4);
      } else if (h.kind === 'rock') {
        if (!h.falling && p && Math.abs(p.x - h.x) < 260) { h.falling = true; h.vy = 0; }
        if (h.falling) {
          h.vy = (h.vy || 0) + 2200 * dt;
          h.y += h.vy * dt;
          if (h.y > (h.groundY || level.groundY) - h.h) {
            h.y = (h.groundY || level.groundY) - h.h;
            h.falling = false; h.vy = 0; h.respawn = 2.4;
          }
        }
      }
      if (h.respawn > 0) { h.respawn -= dt; if (h.respawn <= 0) { h.falling = false; } }
    }

    /* 敌人 AI */
    for (const e of level.enemies) {
      if (e.dead) continue;
      e.t = (e.t || 0) + dt;
      const def = (L().ENEMIES && L().ENEMIES[e.kind]) || {};
      const spd = (def.speed || 70) * diff;
      if (e.kind === 'cat') {
        const x0 = e.x0 !== undefined ? e.x0 : e.x;
        const range = e.range || 160;
        e.vx = e.vx || spd;
        const dx = p ? p.x - e.x : 0;
        if (p && Math.abs(dx) < 220 && Math.abs((p.y + p.h / 2) - (e.y + e.h / 2)) < 90) {
          e.vx = (dx > 0 ? 1 : -1) * spd * 1.7;
        }
        e.x += e.vx * dt;
        if (e.x < x0) { e.x = x0; e.vx = Math.abs(e.vx); }
        if (e.x > x0 + range) { e.x = x0 + range; e.vx = -Math.abs(e.vx); }
      } else if (e.kind === 'drone') {
        const y0 = e.y0 !== undefined ? e.y0 : e.y;
        e.y = y0 + Math.sin(e.t * 2.2) * (e.amp || 36);
        e.x += (e.vx || spd * 0.6) * dt;
        if (e.x > (e.x0 || 0) + (e.range || 240)) e.x = e.x0 || 0;
      } else if (e.kind === 'wasp') {
        if (p) {
          const dx = p.x - e.x;
          const dir = dx > 0 ? 1 : -1;
          e.x += dir * spd * 0.75 * dt;
          e.y += Math.sin(e.t * 4) * 30 * dt;
        }
      } else if (e.kind === 'turret') {
        e.cd = (e.cd || 0) - dt;
        if (e.cd <= 0 && p) {
          e.cd = 1.8;
          const ax = p.x + p.w / 2 - (e.x + e.w / 2);
          const ay = p.y + p.h / 2 - (e.y + e.h / 2);
          const len = Math.hypot(ax, ay) || 1;
          G.bullets.push({
            x: e.x + e.w / 2, y: e.y + e.h / 2,
            vx: (ax / len) * 230, vy: (ay / len) * 230, r: 6, life: 4
          });
          if (S().play) S().play('dash', { vol: 0.4 });
        }
      }
    }

    /* 弹幕 */
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < G.cam.x - 200 || b.x > G.cam.x + G.viewW + 200) G.bullets.splice(i, 1);
    }
  }

  /* =====================================================================
   * 拾取 / 碰撞 / 风格
   * ===================================================================== */
  function magnetRadius() {
    const p = G.player;
    if (!p || !p.buffs) return 0;
    return p.buffs.magnet > 0 ? 160 : 0;
  }

  function collectPickups() {
    const level = G.level, p = G.player, g = G.g;
    if (!level || !p) return;
    const mag = magnetRadius();
    for (const it of level.pickups) {
      if (it.taken) continue;
      const cx = it.x, cy = it.y;
      let d = Math.hypot(p.x + p.w / 2 - cx, p.y + p.h / 2 - cy);
      if (mag > 0 && d < mag) {
        // 磁吸：加速飞向玩家
        const a = Math.atan2(p.y + p.h / 2 - cy, p.x + p.w / 2 - cx);
        const sp = 320 + (mag - d) * 3;
        it.x += Math.cos(a) * sp * dtLast;
        it.y += Math.sin(a) * sp * dtLast;
        d = Math.hypot(p.x + p.w / 2 - it.x, p.y + p.h / 2 - it.y);
      }
      if (d < (p.w + p.h) * 0.42 + 14) {
        it.taken = true;
        const res = L().applyItem ? L().applyItem(p, g, it.id) : null;
        const def = (L().ITEMS && L().ITEMS[it.id]) || {};
        const gain = def.score || 0;
        // addScore 内部会结算连击倍率与连击计数
        addScore('pickup', gain, it.x, it.y, '#ffd23f');
        g.items = (g.items || 0) + 1;
        if (g.stats) g.stats.items++;
        if (it.id === 'cheese') g.levelCheese = (g.levelCheese || 0) + 1;
        if (F().burst) F().burst(it.x, it.y, { kind: 'star', n: 10, colors: ['#ffd23f', '#fff8d6'], spd: 180, size: 5, life: 0.5, grav: 300 });
        if (F().ring) F().ring(it.x, it.y, { r0: 4, r1: 44, life: 0.35, color: '#ffd23f', width: 3 });
        if (F().floatText) F().floatText(it.x, it.y - 18, res && res.text ? res.text : (def.name || it.id), { color: (res && res.color) || '#ffd23f', size: 16 });
        if (S().play) S().play(pickupSound(it.id));
      }
    }
  }

  function pickupSound(id) {
    if (id === 'coin') return 'coin';
    if (id === 'cheese') return 'cheese';
    if (id === 'gem') return 'gem';
    if (id === 'energy') return 'pickup';
    if (id === 'heart' || id === 'bubblegum' || id === 'boots' || id === 'rocket') return 'powerup';
    if (id === 'freeze') return 'freeze';
    if (id === 'emp') return 'emp';
    if (id === 'star' || id === 'mega') return 'star';
    return 'pickup';
  }

  /* 敌人 / 危险物 / 坠坑的碰撞判定由逻辑层统一处理（见 onHurtEvent / onDieEvent），
     这里只保留「踩敌扣血」的表现层：逻辑层只发事件，扣血由本模块执行。 */
  function applyStomp(ev) {
    const level = G.level, g = G.g;
    if (!level || !g) return;
    const map = G.enemyMap || [];
    const realIndex = map[ev.ei];
    const e = (realIndex !== undefined ? level.enemies[realIndex] : null) || level.enemies[ev.ei];
    if (!e) return;
    e.hp = (e.hp === undefined ? 1 : e.hp) - 1;
    const def = (L().ENEMIES && L().ENEMIES[e.kind]) || {};
    if (e.hp <= 0) {
      e.dead = true;
      g.kills = (g.kills || 0) + 1;
      if (g.stats) g.stats.kills++;
      addScore('kill', def.score || 80, ev.x, ev.y, '#ff4d8d');
      addEnergy(6);
      if (F().explosion) F().explosion(ev.x, ev.y, 0.6, { colors: ['#ff4d8d', '#ffd23f', '#fff'] });
      if (F().addShake) F().addShake(0.25);
      if (S().play) S().play('kill');
    } else {
      if (F().burst) F().burst(ev.x, ev.y, { kind: 'spark', n: 8, color: '#ffd23f', spd: 200, size: 4, life: 0.3 });
      if (S().play) S().play('stomp');
    }
  }

  function checkGoal() {
    const level = G.level, p = G.player;
    if (!level || !p) return;
    if (p.x + p.w / 2 >= level.goalX) levelClear();
  }

  /* 检查点：经过即激活（死亡后从最近检查点复活） */
  function updateCheckpoint() {
    const level = G.level, p = G.player;
    if (!level || !p) return;
    const cps = level.checkpoints || [];
    for (let i = cps.length - 1; i >= 0; i--) {
      if (p.x >= cps[i] && cps[i] > (p.checkpointX || 0)) {
        p.checkpointX = cps[i];
        if (G.g) G.g.checkpointX = cps[i];
        if (S().play) S().play('checkpoint');
        if (F().floatText) F().floatText(p.x + p.w / 2, p.y - 24, '检查点', { color: '#35e0c8', size: 16 });
        if (F().ring) F().ring(p.x + p.w / 2, p.y + p.h / 2, { r0: 8, r1: 60, life: 0.4, color: '#35e0c8', width: 3 });
        break;
      }
    }
  }

  /* =====================================================================
   * 输入
   * ===================================================================== */
  let testInput = null;   // 测试钩子：{axis, jump, dash, slide}

  function keyDown(e) {
    const k = e.key;
    const code = e.code;
    G.key[k] = true;
    if (code === 'Space' || k === ' ') e.preventDefault();
    if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; }
    if (k === 'r' || k === 'R') { if (G.state === 'playing' || G.state === 'paused') retryLevel(); return; }
    if ((k === 'm' || k === 'M' || k === 'e' || k === 'E') && G.state === 'playing') { fireMega(); return; }
    if (k === 'Enter') {
      if (G.state === 'menu') { S().unlock(); startNewRun(); }
      else if (G.state === 'clear') nextLevel();
      else if (G.state === 'over') startNewRun();
    }
  }
  function keyUp(e) { G.key[e.key] = false; }

  function inputAxis() {
    let a = 0;
    if (G.key['ArrowLeft'] || G.key['a'] || G.key['A']) a -= 1;
    if (G.key['ArrowRight'] || G.key['d'] || G.key['D']) a += 1;
    if (G.touchAxis) a += G.touchAxis;
    if (testInput && testInput.axis !== undefined) a = testInput.axis;
    return clamp(a, -1, 1);
  }
  function inputJumpPressed() {
    if (testInput) return !!(testInput.jumpPressed !== undefined ? testInput.jumpPressed : testInput.jump);
    return G.touchBtn.jump || G.key[' '] || G.key['Space'] || G.key['ArrowUp'] || G.key['w'] || G.key['W'];
  }
  function inputJumpHeld() {
    if (testInput) return !!(testInput.jumpHeld !== undefined ? testInput.jumpHeld : testInput.jump);
    return G.touchBtn.jump || G.key[' '] || G.key['Space'] || G.key['ArrowUp'] || G.key['w'] || G.key['W'];
  }
  function inputDashPressed() {
    if (testInput) return !!(testInput.dashPressed !== undefined ? testInput.dashPressed : testInput.dash);
    return G.touchBtn.dash || G.key['Shift'] || G.key['j'] || G.key['J'];
  }
  function inputSlideHeld() {
    if (testInput) return !!testInput.slide;
    return G.touchBtn.slide || G.key['ArrowDown'] || G.key['s'] || G.key['S'];
  }

  /* 触屏：虚拟摇杆 + 三键 */
  function bindTouch() {
    const tc = U().getTouchControls ? U().getTouchControls() : null;
    if (!tc) return;
    const zone = tc.stickZone, base = tc.stickBase, knob = tc.stickKnob;
    if (zone && !zone.__bound) {
      zone.__bound = true;
      const onDown = function (ev) {
        const t = ev.changedTouches ? ev.changedTouches[0] : ev;
        const r = zone.getBoundingClientRect();
        G.stick.active = true;
        G.stick.id = t.identifier !== undefined ? t.identifier : -1;
        G.stick.ox = t.clientX - r.left;
        G.stick.oy = t.clientY - r.top;
        if (base) { base.style.left = G.stick.ox + 'px'; base.style.top = G.stick.oy + 'px'; }
        if (knob) { knob.style.transform = 'translate(-50%,-50%)'; }
        ev.preventDefault();
      };
      const onMove = function (ev) {
        if (!G.stick.active) return;
        const list = ev.changedTouches ? ev.changedTouches : [ev];
        for (const t of list) {
          if (G.stick.id >= 0 && t.identifier !== G.stick.id) continue;
          const r = zone.getBoundingClientRect();
          const cx = t.clientX - r.left, cy = t.clientY - r.top;
          let dx = cx - G.stick.ox, dy = cy - G.stick.oy;
          const len = Math.hypot(dx, dy);
          const max = 46;
          if (len > max) { dx = dx / len * max; dy = dy / len * max; }
          G.stick.dx = dx; G.stick.dy = dy;
          G.touchAxis = Math.abs(dx) > 14 ? (dx > 0 ? 1 : -1) : 0;
          if (knob) knob.style.transform = 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px)';
        }
        ev.preventDefault();
      };
      const onUp = function (ev) {
        G.stick.active = false; G.stick.dx = 0; G.stick.dy = 0; G.touchAxis = 0;
        if (knob) knob.style.transform = 'translate(-50%,-50%)';
        if (base && base.style) { base.style.left = ''; base.style.top = ''; }
        ev.preventDefault();
      };
      zone.addEventListener('touchstart', onDown, { passive: false });
      zone.addEventListener('touchmove', onMove, { passive: false });
      zone.addEventListener('touchend', onUp, { passive: false });
      zone.addEventListener('touchcancel', onUp, { passive: false });
    }
    const bindBtn = function (el, key) {
      if (!el || el.__bound) return;
      el.__bound = true;
      const down = function (ev) { G.touchBtn[key] = true; ev.preventDefault(); };
      const up = function (ev) { G.touchBtn[key] = false; ev.preventDefault(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', up);
    };
    bindBtn(tc.btnJump, 'jump');
    bindBtn(tc.btnDash, 'dash');
    bindBtn(tc.btnSlide, 'slide');
  }

  /* =====================================================================
   * 视口 / 相机
   * ===================================================================== */
  function isPortrait() {
    if (window.matchMedia) {
      try { return window.matchMedia('(orientation: portrait)').matches; } catch (e) {}
    }
    return (window.innerHeight || 0) >= (window.innerWidth || 0);
  }

  function resize() {
    if (!G.canvas) return;
    const app = document.getElementById('app') || G.canvas.parentElement;
    const rect = app ? app.getBoundingClientRect() : G.canvas.getBoundingClientRect();
    let cw = Math.max(1, Math.round(rect.width));
    let ch = Math.max(1, Math.round(rect.height));
    // 强制旋转降级：交换宽高
    if (app && app.classList.contains('rotated')) { const t = cw; cw = ch; ch = t; }
    G.cw = cw; G.ch = ch;
    G.dpr = Math.min(2, window.devicePixelRatio || 1);
    G.canvas.width = Math.round(cw * G.dpr);
    G.canvas.height = Math.round(ch * G.dpr);
    G.canvas.style.width = cw + 'px';
    G.canvas.style.height = ch + 'px';
    if (F().resize) F().resize(cw, ch);

    const portrait = isPortrait();
    if (portrait) {
      // 竖屏：按「世界可视高度」定标，避免高瘦屏把可视世界拉到上千单位、
      // 导致画面空旷且主角过小；世界宽度由屏幕宽高比反推
      G.viewH = VIEW_H_PORTRAIT;
      G.scale = ch / G.viewH;
      G.viewW = cw / G.scale;
    } else {
      // 横屏：按可视宽度定标
      G.viewW = VIEW_W_LANDSCAPE;
      G.scale = cw / G.viewW;
      G.viewH = ch / G.scale;
    }
    if (U().onResize) U().onResize();
  }

  function updateCam(dt, snap) {
    const p = G.player, level = G.level;
    if (!p) return;
    const viewW = G.viewW, viewH = G.viewH;
    const levelLen = level ? level.length : viewW;
    const minX = 0;
    const maxX = Math.max(0, levelLen - viewW);

    /* 横向：目标把玩家放在视口 45% 处，再用「安全带」硬约束兜底。
       安全带 = 玩家必须始终落在视口 35%~55% 的区间内（受关卡边界收窄）。
       纯 lerp 追赶在竖屏（可视宽仅 ~320 单位）下缓冲不足，冲刺会把角色甩出画面；
       加了硬约束后，无论多快、无论什么屏，角色都不会丢失焦点。 */
    const targetX = clamp(p.x - viewW * 0.45, minX, maxX);
    const bandLo = Math.max(minX, p.x - viewW * 0.55);
    const bandHi = Math.min(maxX, p.x - viewW * 0.35);
    let camX = snap ? targetX : lerp(G.cam.x, targetX, Math.min(1, dt * 12));
    camX = (bandLo <= bandHi) ? clamp(camX, bandLo, bandHi) : clamp(targetX, minX, maxX);
    G.cam.x = camX;

    /* 纵向：地面锚定 + 玩家跳跃时上移；再加一条「不出画布」兜底 */
    const groundCam = GROUND_Y - viewH * 0.78;
    let targetY = groundCam;
    if (p.y < GROUND_Y - 140) targetY = Math.min(groundCam, p.y - viewH * 0.5);
    if (level && level.groundY) {
      const gc = level.groundY - viewH * 0.78;
      targetY = Math.min(gc, p.y - viewH * 0.5);
    }
    let camY = snap ? targetY : lerp(G.cam.y, targetY, Math.min(1, dt * 6));
    // 兜底：角色任何时候都不能完全跑出画面上下边界
    camY = clamp(camY, p.y - viewH * 0.95, p.y - viewH * 0.05);
    G.cam.y = camY;

    // 冲击缩放
    if (G.cam.zoomT > 0) {
      G.cam.zoomT = Math.max(0, G.cam.zoomT - dt);
      const k = G.cam.zoomT / 0.12;
      G.cam.zoom = 1 + 0.035 * k * k;
    } else G.cam.zoom = 1;
  }

  function punchZoom() { G.cam.zoomT = 0.12; }

  /* =====================================================================
   * 渲染
   * ===================================================================== */
  function drawBackdrop(ctx) {
    const level = G.level;
    const biome = level ? (level.biome && level.biome.id) : 'kitchen';
    if (A().backdrop) A().backdrop(ctx, biome, G.cam.x, G.cam.y, G.viewW, G.viewH, G.t);
  }
  function drawSolids(ctx) {
    const level = G.level;
    if (!level) return;
    const biome = level.biome && level.biome.id;
    for (const s of level.solids) {
      if (s.x + s.w < G.cam.x - 80 || s.x > G.cam.x + G.viewW + 80) continue;
      if (s.kind === 'mover') {
        if (A().draw) A().draw(ctx, 'moverPad', s.x, s.y, s.w, s.h, {});
        continue;
      }
      if (s.kind === 'spring') {
        if (A().draw) A().draw(ctx, 'spring', s.x, s.y, s.w, s.h, {});
        continue;
      }
      if (s.kind === 'crumble') {
        if (A().draw) A().draw(ctx, 'crumble', s.x, s.y, s.w, s.h, { alpha: s.falling ? 0.45 : 1 });
        continue;
      }
      if (s.kind === 'brick') {
        if (A().draw) A().draw(ctx, 'brick', s.x, s.y, s.w, s.h, {});
        continue;
      }
      if (A().ground) A().ground(ctx, biome, s.x, s.y, s.w, s.h, G.t);
    }
  }

  function drawHazards(ctx) {
    const level = G.level;
    if (!level) return;
    for (const h of level.hazards) {
      if (h.dead) continue;
      if (h.x + (h.w || 40) < G.cam.x - 80 || h.x > G.cam.x + G.viewW + 80) continue;
      if (h.kind === 'pendulum') {
        ctx.save();
        ctx.strokeStyle = '#8892b0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.hx !== undefined ? h.hx : h.x, h.hy !== undefined ? h.hy : h.y); ctx.stroke();
        ctx.restore();
        if (A().draw) A().draw(ctx, 'pendulum', (h.hx !== undefined ? h.hx : h.x) - 13, (h.hy !== undefined ? h.hy : h.y) - 13, 26, 26, { rot: h.angle || 0 });
        continue;
      }
      if (h.kind === 'laser') {
        if (A().draw) A().draw(ctx, 'laser', h.x, h.y, h.w, h.h, { alpha: h.on ? 1 : 0.18 });
        continue;
      }
      if (h.kind === 'crusher') {
        if (A().draw) A().draw(ctx, 'crusher', h.x, h.y + (h.cy || 0), h.w, h.h, {});
        continue;
      }
      if (h.kind === 'blade') {
        if (A().draw) A().draw(ctx, 'blade', h.x - 16, h.y - 16, 34, 34, { rot: h.angle || 0 });
        continue;
      }
      if (A().draw) A().draw(ctx, h.kind, h.x, h.y, h.w, h.h, {});
    }
  }

  function drawPickups(ctx) {
    const level = G.level;
    if (!level) return;
    for (let i = 0; i < level.pickups.length; i++) {
      const it = level.pickups[i];
      if (it.taken) continue;
      if (it.x < G.cam.x - 60 || it.x > G.cam.x + G.viewW + 60) continue;
      const bob = Math.sin(G.t * 3 + i * 0.7) * 4;
      if (A().draw) A().draw(ctx, it.id, it.x - 15, it.y - 15 + bob, 30, 30, { alpha: 0.98 });
    }
  }

  function drawEnemies(ctx) {
    const level = G.level;
    if (!level) return;
    for (const e of level.enemies) {
      if (e.dead) continue;
      if (e.x + (e.w || 30) < G.cam.x - 80 || e.x > G.cam.x + G.viewW + 80) continue;
      if (A().draw) A().draw(ctx, e.kind, e.x, e.y, e.w, e.h, { flip: (e.vx || 0) < 0 });
    }
  }

  function drawBullets(ctx) {
    for (const b of G.bullets) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 16);
      grd.addColorStop(0, 'rgba(255,90,180,0.95)');
      grd.addColorStop(1, 'rgba(255,90,180,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(b.x, b.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawGoal(ctx) {
    const level = G.level;
    if (!level) return;
    if (level.goalX < G.cam.x - 200 || level.goalX > G.cam.x + G.viewW + 200) return;
    if (A().draw) A().draw(ctx, 'goal', level.goalX - 60, level.groundY - 130, 120, 130, {});
    for (const cx of level.checkpoints || []) {
      if (cx < G.cam.x - 60 || cx > G.cam.x + G.viewW + 60) continue;
      if (A().draw) A().draw(ctx, 'checkpoint', cx - 16, level.groundY - 70, 32, 70, { alpha: cx <= (G.player ? G.player.checkpointX : 0) ? 1 : 0.45 });
    }
  }

  function drawPlayer(ctx) {
    const p = G.player;
    if (!p) return;
    let pose = 'idle';
    if (p.dead) pose = 'dead';
    else if (p.hurtT > 0) pose = 'hurt';
    else if (p.sliding) pose = 'slide';
    else if (p.dashT > 0) pose = 'dash';
    else if (!p.onGround) pose = p.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(p.vx) > 20) pose = 'run';
    if (p.invuln > 0 && !p.dead && Math.floor(G.t * 18) % 2 === 0) {
      ctx.save(); ctx.globalAlpha = 0.55;
    } else {
      ctx.save();
    }
    if (A().drawMouse) {
      A().drawMouse(ctx, {
        x: p.x, y: p.y, w: p.w, h: p.h,
        dir: p.dir || 1, pose: pose, t: G.t, runT: p.runT || 0,
        squashX: p.squashX || 1, squashY: p.squashY || 1,
        dead: !!p.dead
      });
    }
    ctx.restore();
  }

  function render() {
    const ctx = G.ctx;
    if (!ctx) return;
    const dpr = G.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, G.cw, G.ch);
    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, G.cw, G.ch);

    // 相机变换
    const sh = F().shakeOffset ? F().shakeOffset() : { x: 0, y: 0 };
    const zoom = G.cam.zoom || 1;
    ctx.save();
    ctx.translate(G.cw / 2, G.ch / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-G.cw / 2, -G.ch / 2);
    ctx.translate(-(G.cam.x + sh.x), -(G.cam.y + sh.y));
    ctx.scale(G.scale, G.scale);

    // 背景：世界空间内绘制，恰好铺满可视区域（不随震屏抖动）
    ctx.save();
    ctx.translate(G.cam.x, G.cam.y);
    drawBackdrop(ctx);
    ctx.restore();

    drawSolids(ctx);
    drawGoal(ctx);
    drawHazards(ctx);
    drawPickups(ctx);
    drawEnemies(ctx);
    drawBullets(ctx);
    if (F().render) F().render(ctx, 'world');
    drawPlayer(ctx);

    ctx.restore();

    if (F().render) F().render(ctx, 'screen');
  }

  /* =====================================================================
   * 主循环
   * ===================================================================== */
  let dtLast = 1 / 60;
  /* 输入边沿检测（上一帧的按键状态） */
  let prevJump = false, prevDash = false, prevSlide = false;
  /* 风格分上一次的值，用于把「净增」并入主积分 */
  let lastStylePts = 0;

  function step(dt) {
    const p = G.player, g = G.g, level = G.level;
    if (!p || !g || !level) return;

    /* ---------- 输入 → p.input（逻辑层据此驱动全部动作） ---------- */
    const axis = inputAxis();
    const jumpHeld = inputJumpHeld();
    const jumpNow = inputJumpPressed();
    const dashNow = inputDashPressed();
    const slideNow = inputSlideHeld();
    const jumpPressed = jumpNow && !prevJump;
    const dashPressed = dashNow && !prevDash;
    const slidePressed = slideNow && !prevSlide;
    prevJump = jumpNow; prevDash = dashNow; prevSlide = slideNow;

    if (!p.input) p.input = {};
    p.input.axis = axis;
    p.input.left = axis < 0;
    p.input.right = axis > 0;
    p.input.up = jumpHeld;
    p.input.jump = jumpHeld;
    p.input.jumpPressed = jumpPressed;
    p.input.dash = dashNow;
    p.input.dashPressed = dashPressed;
    p.input.slide = slideNow;
    p.input.slidePressed = slidePressed;
    p.input.down = slideNow;

    /* ---------- 物理推进（逻辑层负责碰撞/伤害/风格/体力） ---------- */
    /* 只把「存活敌人」交给逻辑层做碰撞，并用索引映射把事件里的 ei 还原回原数组 */
    const liveEnemies = [];
    const enemyMap = [];
    for (let i = 0; i < level.enemies.length; i++) {
      if (!level.enemies[i].dead) { liveEnemies.push(level.enemies[i]); enemyMap.push(i); }
    }
    G.enemyMap = enemyMap;
    const world = {
      solids: level.solids, hazards: level.hazards,
      enemies: liveEnemies, level: level, g: g
    };
    const res = L().stepPhysics ? L().stepPhysics(p, dt, world) : null;
    let newP = p;
    if (res) {
      if (res.p) newP = res.p;
      else if (res.x !== undefined) newP = res;
    }
    G.player = newP;
    const events = (res && res.events) || [];

    /* ---------- 事件 → 表现 ---------- */
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev) continue;
      const cx = ev.x !== undefined ? ev.x : newP.x + newP.w / 2;
      const cy = ev.y !== undefined ? ev.y : newP.y + newP.h / 2;
      switch (ev.type) {
        case 'jump':
          if (S().play) S().play('jump');
          if (F().burst) F().burst(newP.x + newP.w / 2, newP.y + newP.h, { kind: 'smoke', n: 6, color: '#c8d0e6', spd: 100, size: 6, life: 0.35 });
          break;
        case 'djump':
          if (S().play) S().play('djump');
          if (F().ring) F().ring(cx, cy, { r0: 6, r1: 46, life: 0.3, color: '#8fd8ff', width: 3 });
          break;
        case 'dash':
          if (S().play) S().play('dash');
          if (F().burst) F().burst(cx, cy, { kind: 'spark', n: 14, color: '#8fd8ff', spd: 260, size: 4, life: 0.3, angle: ev.dir > 0 ? Math.PI : 0, spread: 0.9 });
          if (newP.buffs && newP.buffs.flame > 0 && F().trail) {
            F().trail(cx, cy, { color: '#ff7a2f', size: 16, life: 0.5 });
          }
          break;
        case 'rocket':
          if (S().play) S().play('mega', { vol: 0.8 });
          if (F().explosion) F().explosion(cx, cy, 0.9, { colors: ['#ffd23f', '#ff6b3d', '#fff'] });
          if (F().addShake) F().addShake(0.5);
          punchZoom();
          break;
        case 'slide':
          if (S().play) S().play('slide');
          if (F().burst) F().burst(cx, newP.y + newP.h, { kind: 'smoke', n: 8, color: '#c8d0e6', spd: 120, size: 7, life: 0.45 });
          break;
        case 'land': {
          const lv = Math.abs(ev.vy || 0);
          if (ev.hard || lv > 1100) {
            if (S().play) S().play('land', { vol: 1.2 });
            if (F().addShake) F().addShake(clamp(lv / 2400, 0.1, 0.4));
            if (F().burst) F().burst(cx, newP.y + newP.h, { kind: 'dust', n: 10, color: '#c8d0e6', spd: 180, size: 8, life: 0.4 });
            punchZoom();
          } else if (lv > 300) {
            if (S().play) S().play('land', { rate: clamp(1.3 - lv / 1600, 0.7, 1.3) });
            if (F().burst) F().burst(cx, newP.y + newP.h, { kind: 'smoke', n: 5, color: '#c8d0e6', spd: 110, size: 5, life: 0.3 });
          }
          break;
        }
        case 'spring':
          if (S().play) S().play('djump', { rate: 1.3 });
          if (F().ring) F().ring(cx, newP.y + newP.h, { r0: 6, r1: 56, life: 0.35, color: '#ffd23f', width: 3 });
          break;
        case 'break':
          if (F().burst) F().burst(cx, cy, { kind: 'debris', n: 12, color: '#b98a5a', spd: 260, size: 6, life: 0.6, grav: 900 });
          if (F().addShake) F().addShake(0.2);
          if (S().play) S().play('explode', { vol: 0.6 });
          break;
        case 'stomp':
          applyStomp(ev);
          if (F().addShake) F().addShake(0.2);
          punchZoom();
          break;
        case 'graze':
          if (F().burst) F().burst(cx, cy, { kind: 'spark', n: 4, color: '#ff4d8d', spd: 120, size: 3, life: 0.25 });
          break;
        case 'hurt':
          onHurtEvent(ev);
          break;
        case 'die':
          onDieEvent(ev);
          break;
        case 'bell':
          if (F().ring) F().ring(cx, cy, { r0: 10, r1: 120, life: 0.6, color: '#ffd23f', width: 5 });
          if (U().toast) U().toast('复活铃铛把你拉了回来！', 'good');
          if (S().play) S().play('powerup');
          break;
        default: break;
      }
    }
    if (events.some(function (e) { return e && e.type === 'stomp'; })) G.hitstop = Math.max(G.hitstop, 0.055);
    if (events.some(function (e) { return e && e.type === 'rocket'; })) G.hitstop = Math.max(G.hitstop, 0.08);

    /* ---------- 距离分：每 12 世界单位 +1 ---------- */
    const dist = Math.max(0, newP.x - (newP.spawnX || 0));
    const newDist = Math.floor(dist / 12);
    if (newDist > (g.distUnits || 0)) {
      const d = newDist - (g.distUnits || 0);
      g.distUnits = newDist;
      g.score = (g.score || 0) + d;
      g.distance = Math.round(dist);
      if (g.mk) g.mk.distance += d;
    }

    /* ---------- 风格分：把「净增」并入主积分（衰减部分不扣分） ---------- */
    const curStyle = newP.stylePts || 0;
    if (curStyle > (lastStylePts || 0)) {
      const d = curStyle - (lastStylePts || 0);
      g.score = (g.score || 0) + d;
      if (g.mk) g.mk.style += d;
    }
    lastStylePts = curStyle;

    /* ---------- 计时衰减 ---------- */
    if (L().comboTick) L().comboTick(g, dt);
    if (L().styleTick) L().styleTick(newP, g, dt);
    syncStyle();

    /* ---------- 世界推进（移动平台 / 敌人 AI / 机关 / 弹幕） ---------- */
    updateWorld(dt);

    /* ---------- 交互 ---------- */
    if (!newP.dead) {
      collectPickups();
      updateCheckpoint();
      checkGoal();
    }

    /* ---------- 同步命数 ---------- */
    if (newP.lives !== undefined) g.lives = newP.lives;
    if (g.energy !== undefined) newP.energy = g.energy;

    /* ---------- 低命红晕 ---------- */
    if (F().setVignette) F().setVignette((g.lives || 0) <= 1);
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!G.lastTs) G.lastTs = ts;
    let dt = (ts - G.lastTs) / 1000;
    G.lastTs = ts;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    G.t += dt;
    G.frame++;

    const scale = F().timeScale ? F().timeScale() : 1;
    // 全局游戏速度（设置项）× 特效慢动作（命中停顿/必杀）= 实际推进时间
    const sdt = dt * scale * (G.cfg.speed || 1);

    if (G.state === 'playing') {
      if (G.hitstop > 0) {
        G.hitstop -= dt;
      } else {
        G.acc += sdt;
        let guard = 0;
        while (G.acc >= FIXED_DT && guard < 5) {
          dtLast = FIXED_DT;
          step(FIXED_DT);
          G.acc -= FIXED_DT;
          guard++;
        }
        if (guard >= 5) G.acc = 0;
        updateCam(sdt);
      }
    } else {
      // 非游玩状态：镜头保持缓慢跟随，粒子照常衰减
      if (G.state !== 'paused' && G.level) updateCam(dt);
    }

    if (F().update) F().update(G.state === 'paused' ? 0 : sdt);
    if (F().setSpeedLines && G.player) {
      const sp = Math.abs(G.player.vx || 0);
      F().setSpeedLines(clamp((sp - 480) / 500, 0, 1));
    }
    render();
    if (U().update) U().update(snapshot());
  }

  /* =====================================================================
   * HUD 快照
   * ===================================================================== */
  function snapshot() {
    const p = G.player, g = G.g, level = G.level;
    const buffs = [];
    if (p && p.buffs) {
      for (const k in p.buffs) {
        const t = p.buffs[k];
        if (t > 0) {
          const def = (L().ITEMS && L().ITEMS[k]) || {};
          buffs.push({ id: k, name: def.name || k, icon: k, t: t, total: (L().BUFF_INFO && L().BUFF_INFO[k] && L().BUFF_INFO[k].dur) || t });
        }
      }
    }
    const target = (L().levelTargets && g) ? (L().levelTargets(g.level) || { cheese: 6 }) : { cheese: 6 };
    return {
      state: G.state,
      score: g ? g.score : 0,
      coin: g ? g.coin : 0,
      cheese: g ? (g.levelCheese || 0) : 0,
      cheeseTotal: g ? (g.cheese || 0) : 0,
      targetCheese: target.cheese,
      stylePts: p ? Math.round(p.stylePts || 0) : 0,
      styleLevel: p ? (p.styleLevel || 'D') : 'D',
      combo: g ? (g.combo || 0) : 0,
      comboMult: g ? (1 + Math.min(g.combo || 0, 30) * 0.1) : 1,
      energy: g ? Math.round(g.energy || 0) : 0,
      lives: g ? g.lives : 0,
      maxLives: g ? g.maxLives : 3,
      level: g ? g.level : 1,
      biomeName: level && level.biome ? level.biome.name : '厨房',
      buffs: buffs,
      distance: g ? Math.round(g.distUnits || 0) * 12 : 0,
      best: G.records.bestScore,
      speed: G.cfg.speed || 1,
      megaReady: g ? (g.energy || 0) >= 100 : false
    };
  }

  /* =====================================================================
   * 动作派发（UI → game）
   * ===================================================================== */
  function startNewRun() {
    S().unlock();
    newRun();
    startLevel(1);
  }

  function continueRun() {
    const s = load(KEY_SAVE, null);
    if (!s || !s.runSeed) { startNewRun(); return; }
    S().unlock();
    const g = newRun(s.runSeed);
    g.level = s.level || 1;
    g.score = s.score || 0;
    g.coin = s.coin || 0;
    g.cheese = s.cheese || 0;
    g.energy = s.energy || 0;
    g.lives = s.lives === undefined ? 3 : s.lives;
    g.maxLives = s.maxLives || 3;
    g.mk = s.breakdown || g.mk;
    g.stats = s.stats || g.stats;
    g.bestCombo = s.bestCombo || 0;
    g.bestStyleLevel = s.bestStyleLevel || 'D';
    g.bestStylePts = s.bestStylePts || 0;
    startLevel(g.level);
  }

  function applyOrientationMode(mode) {
    G.cfg.orient = mode;
    saveCfg();
    if (U().setOrientationMode) U().setOrientationMode(mode);
    if (U().applyOrientation) U().applyOrientation();
    applyForceOrientation(mode);
  }

  function applyForceOrientation(mode) {
    const app = document.getElementById('app');
    if (!app) return;
    if (mode === 'auto') {
      app.classList.remove('rotated');
      if (screen.orientation && screen.orientation.unlock) { try { screen.orientation.unlock(); } catch (e) {} }
      if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
      resize();
      return;
    }
    const wantLandscape = mode === 'landscape';
    // 先尝试全屏 + 方向锁定
    const lock = function () {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock(wantLandscape ? 'landscape' : 'portrait').catch(function () { fallbackRotate(wantLandscape); });
      } else fallbackRotate(wantLandscape);
    };
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) {
      const p = doc.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) p.then(function () { setTimeout(lock, 260); }).catch(function () { fallbackRotate(wantLandscape); });
      else setTimeout(lock, 260);
    } else {
      lock();
    }
    setTimeout(function () {
      const stillLocked = screen.orientation && screen.orientation.type &&
        (wantLandscape ? /landscape/.test(screen.orientation.type) : /portrait/.test(screen.orientation.type));
      if (!stillLocked) fallbackRotate(wantLandscape);
    }, 700);
  }

  function fallbackRotate(landscape) {
    const app = document.getElementById('app');
    if (!app) return;
    const w = window.innerWidth, h = window.innerHeight;
    const rotated = (landscape && h > w) || (!landscape && w > h);
    if (rotated) {
      app.classList.add('rotated');
      app.style.width = h + 'px';
      app.style.height = w + 'px';
      app.style.left = ((w - h) / 2) + 'px';
      app.style.top = ((h - w) / 2) + 'px';
      app.style.position = 'fixed';
    } else {
      app.classList.remove('rotated');
      app.style.width = ''; app.style.height = '';
      app.style.left = ''; app.style.top = '';
    }
    setTimeout(resize, 60);
  }

  function onAction(name, payload) {
    switch (name) {
      case 'start': case 'newrun': case 'newRun': startNewRun(); break;
      case 'continue': case 'resume_run': continueRun(); break;
      case 'retry': case 'retryLevel': retryLevel(); break;
      case 'next': case 'nextLevel': nextLevel(); break;
      case 'menu': case 'toMenu': toMenu(); break;
      case 'pause': pause(); break;
      case 'resume': case 'unpause': resume(); break;
      case 'settings': case 'openSettings':
        G.prevState = G.state;
        G.state = 'settings';
        if (U().show) U().show('settings');
        break;
      case 'closeSettings': case 'back':
        if (G.prevState === 'playing') { G.state = 'playing'; if (U().show) U().show('hud'); }
        else { G.state = G.prevState === 'settings' ? 'menu' : G.prevState; if (U().show) U().show(G.state === 'menu' ? 'menu' : 'hud'); }
        break;
      case 'howto': case 'records':
        if (U().result) U().result({ kind: name === 'howto' ? 'howto' : 'records', records: G.records });
        break;
      case 'mega': case 'fireMega': fireMega(); break;
      case 'setVolume': {
        const which = payload && payload.which;
        const v = payload && typeof payload.value === 'number' ? payload.value : 0.5;
        if (which === 'bgm') G.cfg.bgm = v; else G.cfg.sfx = v;
        saveCfg();
        if (S().setVol) S().setVol(G.cfg.bgm, G.cfg.sfx);
        break;
      }
      case 'setMuteBgm': G.cfg.muteBgm = !!payload; saveCfg(); break;
      case 'setMuteSfx': G.cfg.muteSfx = !!payload; saveCfg(); break;
      case 'setVibrate': G.cfg.vibrate = !!(payload && payload.value !== undefined ? payload.value : payload); saveCfg(); break;
      case 'setQuality':
        G.cfg.quality = (payload && payload.value) || 'high'; saveCfg();
        if (F().setQuality) F().setQuality(G.cfg.quality);
        break;
      case 'setOrient': case 'setOrientation':
        applyOrientationMode((payload && payload.value) || 'auto');
        break;
      case 'forceLandscape':
        applyForceOrientation(payload && payload.value ? 'landscape' : 'auto');
        break;
      case 'setTouchUI':
        G.cfg.touchUI = !!(payload && payload.value);
        saveCfg();
        if (U().applyOrientation) U().applyOrientation();
        break;
      case 'setSpeed': {
        const v = payload && payload.value !== undefined ? Number(payload.value) : 1;
        G.cfg.speed = SPEED_STEPS.indexOf(v) >= 0 ? v : 1;
        saveCfg();
        if (U().refreshSettings) U().refreshSettings();
        if (U().toast) U().toast('游戏速度 ' + G.cfg.speed + '×', 'info');
        break;
      }      case 'exportSave': {
        const raw = JSON.stringify(load(KEY_SAVE, {}));
        if (payload && payload.el) payload.el.value = btoa(unescape(encodeURIComponent(raw)));
        if (U().toast) U().toast('已生成存档文本', 'good');
        break;
      }
      case 'importSave': {
        const txt = payload && payload.text;
        try {
          const obj = JSON.parse(decodeURIComponent(escape(atob(txt))));
          store(KEY_SAVE, obj);
          if (U().toast) U().toast('存档导入成功', 'good');
        } catch (e) {
          if (U().toast) U().toast('存档格式错误', 'bad');
        }
        break;
      }
      case 'clearSave':
        clearRun(); remove(KEY_RECORDS); G.records = { bestScore: 0, bestLevel: 0, bestCombo: 0, bestStyle: 'D', bestStylePts: 0 };
        if (U().toast) U().toast('存档已清空', 'info');
        break;
      default: break;
    }
  }

  /* =====================================================================
   * 启动
   * ===================================================================== */
  function boot() {
    const app = document.getElementById('app');
    G.canvas = document.getElementById('stage');
    if (!G.canvas) return;
    G.ctx = G.canvas.getContext('2d', { alpha: false });

    loadCfg();
    loadRecords();

    if (F().init) F().init(G.canvas);
    if (F().setQuality) F().setQuality(G.cfg.quality);
    if (A().init) A().init();
    if (S().init) S().init();
    if (S().setVol) S().setVol(G.cfg.bgm, G.cfg.sfx);

    if (U().init) U().init(MP.game);
    if (U().setOrientationMode) U().setOrientationMode(G.cfg.orient);
    if (U().applyOrientation) U().applyOrientation();

    resize();
    window.addEventListener('resize', function () { resize(); });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 220); });
    if (window.ResizeObserver) { try { new ResizeObserver(function () { resize(); }).observe(app); } catch (e) {} }

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', function () { G.key = {}; });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (G.state === 'playing') pause();
        if (S().stopBGM) S().stopBGM();
      }
    });

    // URL 参数
    const q = (window.__q) || {};
    if (q.orient === 'land') { G.cfg.orient = 'landscape'; }
    if (q.orient === 'port') { G.cfg.orient = 'portrait'; }
    if (q.level) {
      const lv = parseInt(q.level, 10);
      if (lv > 0) {
        newRun(q.seed ? (parseInt(q.seed, 10) >>> 0) : undefined);
        G.g.level = lv;
        startLevel(lv);
        return;
      }
    }
    if (q.seed) {
      newRun(parseInt(q.seed, 10) >>> 0);
      startLevel(1);
      return;
    }

    toMenu();
    bindTouch();
    setTimeout(bindTouch, 400);
    requestAnimationFrame(frame);
  }

  MP.game = {
    state: 'menu',
    get state_() { return G.state; },
    get player() { return G.player; },
    get level() { return G.level; },
    startRun: startNewRun,
    startLevel: function (n) { if (!G.g) newRun(); startLevel(n); },
    retryLevel: retryLevel,
    nextLevel: nextLevel,
    toMenu: toMenu,
    pause: pause,
    resume: resume,
    togglePause: togglePause,
    onAction: onAction,
    snapshot: snapshot,
    fireMega: fireMega,
    applyForceOrientation: applyForceOrientation,
    getG: function () { return G.g; },

    /* ---- 测试钩子（ego-lite 回归用，确定性推进不依赖真实帧率） ----
       fastForward(sec) 推进「真实时间 sec」：与主循环一致地套用全局速度倍率，
       因此在 0.5× 档位下同样的调用量只会推进一半的游戏时间。 */
    fastForward: function (sec) {
      const n = Math.round((sec || 0) / FIXED_DT);
      const sp = G.cfg.speed || 1;
      for (let i = 0; i < n; i++) {
        const sdt = FIXED_DT * sp;
        if (G.state === 'playing') {
          G.acc += sdt;
          let guard = 0;
          while (G.acc >= FIXED_DT && guard < 5) { step(FIXED_DT); G.acc -= FIXED_DT; guard++; }
          if (guard >= 5) G.acc = 0;
          updateCam(sdt);
        }
        if (F().update) F().update(sdt);
      }
      return snapshot();
    },
    setTestInput: function (v) { testInput = v; return true; },
    testState: function () { return G.state; },
    testResult: function () { return G.lastResult; },
    testLevel: function () { return G.level; },
    testPlayer: function () { return G.player; },
    /* 相机与玩家的相对位置（用于验证「角色始终在画面 35%~55%」这条硬约束） */
    testCam: function () {
      return { x: G.cam.x, y: G.cam.y, viewW: G.viewW, viewH: G.viewH, scale: G.scale };
    },
    testRel: function () {
      const p = G.player;
      if (!p) return null;
      return {
        rel: (p.x - G.cam.x) / G.viewW,          // 0=左边缘 1=右边缘
        relY: (p.y - G.cam.y) / G.viewH,
        x: p.x, y: p.y, vx: p.vx, onScreen: (p.x >= G.cam.x && p.x <= G.cam.x + G.viewW)
      };
    },
    testSpeed: function () { return G.cfg.speed; }
  };
  window.__mp = MP.game;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
