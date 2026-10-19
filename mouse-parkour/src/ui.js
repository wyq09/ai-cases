/* =====================================================================
 * 鼠族跑酷 · MOUSE RUSH — UI 模块（ui.js）
 * 主菜单 / HUD / 暂停 / 关卡结算 / 游戏结束 / 设置 / 玩法说明 + 触屏控件
 * 约定：UI 不直接改游戏状态，一切交互通过 game.onAction(name, payload) 派发。
 * ===================================================================== */
(function () {
  'use strict';
  window.MP = window.MP || {};

  var U = {};

  /* ---------------- 状态 ---------------- */
  var game = null;
  var root = null;
  var appEl = null;
  var screens = {};
  var SCREEN_KEYS = ['menu', 'hud', 'pause', 'clear', 'over', 'settings', 'howto', 'records'];
  var curScreen = null;
  var prevScreen = null;
  var settingsReturn = null;
  var orientMode = 'auto';
  var cfg = { bgm: 0.5, sfx: 0.7, vibrate: true, quality: 'high', orient: 'auto', touchUI: null };
  var touchUIEls = null;
  var hud = {};
  var buffNodes = [];
  var last = {};
  var rollGroups = {};
  var toastTimer = 0;
  var popupTimer = 0;
  var codexBuilt = false;
  var codexHosts = null;
  var drag = { on: false, y: 0, panel: null };

  var KEY_SAVE = 'mr.save.v1';
  var KEY_CFG = 'mr.cfg.v1';

  /* 风格等级阈值（与契约 §1.7 一致） */
  var STYLE_LV = ['D', 'C', 'B', 'A', 'S', 'SS'];
  var STYLE_T = [0, 120, 320, 700, 1300, 2200];

  /* 道具图鉴（契约 §1.4 的 25 种拾取物） */
  var ITEM_ORDER = ['cheese', 'coin', 'gem', 'clover', 'magnet', 'catnip', 'sneakers', 'bubblegum',
    'flame', 'giant', 'mini', 'feather', 'shield', 'star', 'hourglass', 'energy', 'heart', 'drill',
    'boots', 'bell', 'freeze', 'emp', 'multiply', 'gravity', 'rocket'];
  var ITEM_DOC = {
    cheese: ['奶酪', '+150 分，+1 奶酪（收集度）'],
    coin: ['金币', '+80 分，+1 金币'],
    gem: ['钻石', '+500 分，+3 金币'],
    clover: ['四叶草', '分数 ×2，持续 20s'],
    magnet: ['磁铁', '吸取半径 160，8s'],
    catnip: ['猫薄荷', '速度 +30%，10s'],
    sneakers: ['跑鞋', '跳跃高度 +25%、速度 +15%，12s'],
    bubblegum: ['泡泡糖', '永久获得二段跳'],
    flame: ['火焰尾迹', '冲刺时留下火焰带灼伤敌人，8s'],
    giant: ['巨化药水', '体型 ×1.6，可撞碎砖墙，12s'],
    mini: ['缩小药水', '体型 ×0.65，可钻缝隙，12s'],
    feather: ['羽毛', '空中下落减速 60%，10s'],
    shield: ['护盾泡泡', '抵挡 1 次伤害'],
    star: ['无敌星', '无敌 5s + 撞碎机关'],
    hourglass: ['时停沙漏', '敌人/机关速度 ×0.35，6s'],
    energy: ['能量核心', '能量 +40'],
    heart: ['生命果', '命 +1（上限 5）'],
    drill: ['钻头', '冲刺可破墙，8s'],
    boots: ['弹力靴', '跳跃高度 ×1.6，10s'],
    bell: ['复活铃铛', '免死一次'],
    freeze: ['冰冻水晶', '5s 内冻结全部敌人'],
    emp: ['电磁脉冲', '清除屏幕内敌人与伤害性机关'],
    multiply: ['双倍金币', '金币收益 ×2，15s'],
    gravity: ['重力翻转', '反重力 8s（天花板行走）'],
    rocket: ['火箭筒', '装填 1 发，发射时向前贯穿冲刺']
  };

  /* 危险物（契约 §1.4 的 11 种） */
  var HAZARD_ORDER = ['cat', 'spike', 'pit', 'rock', 'fence', 'acid', 'pendulum', 'laser', 'blade', 'drone', 'crusher'];
  var HAZARD_DOC = {
    cat: ['巡逻猫', '地面往返巡游，有视锥，靠近会加速扑咬'],
    spike: ['尖刺', '固定地刺，碰到扣 1 命'],
    pit: ['坠坑', '地面缺口，掉下去扣 1 命'],
    rock: ['落石', '从上方砸落，砸中扣 1 命'],
    fence: ['电栅栏', '通电栅栏，碰到扣 1 命'],
    acid: ['酸液池', '地面酸液，碰到扣 1 命'],
    pendulum: ['摆锤', '来回摆动的大锤，碰到扣 1 命'],
    laser: ['激光', '周期开关的光束，开启时碰到扣 1 命'],
    blade: ['风车刀片', '高速旋转的刀片，碰到扣 1 命'],
    drone: ['飞行器', '空中巡逻的无人机，撞击扣 1 命'],
    crusher: ['压机', '周期性砸下的重锤，碰到扣 1 命']
  };

  /* 风格动作表（契约 §1.7） */
  var STYLE_ACTIONS = [
    ['冲刺', '+50', 'dash 触发时'],
    ['踩敌', '+120', '从上方落到敌人身上'],
    ['跳劈', '+80', '空中按下"下劈"砸地'],
    ['滑铲', '+40', '滑铲完成'],
    ['二段跳', '+30', '空中第二次起跳'],
    ['极限落地', '+60', '落地垂直速度 > 1100'],
    ['擦弹', '+20', '距离危险物 < 14px 但未碰撞'],
    ['空中连击', '+10/段', '同一跳中每累积 0.5s 空中时间 +10（上限 +60/跳）']
  ];

  /* =====================================================================
   * 基础工具
   * ===================================================================== */
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }

  function mkBtn(cls, text, action) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), text);
    b.setAttribute('type', 'button');
    b.setAttribute('data-action', action);
    return b;
  }

  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function load(key, def) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return def;
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? def : v;
    } catch (e) { return def; }
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function fmtNum(n) {
    n = Math.round(Number(n) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function sfx(name) {
    try {
      var m = window.MP ? window.MP.SFX : null;
      if (m && typeof m.play === 'function') m.play(name);
    } catch (e) {}
  }

  /* 派发给游戏层（UI 不直接改游戏状态） */
  function act(name, payload) {
    if (game && typeof game.onAction === 'function') {
      try { game.onAction(name, payload); }
      catch (e) { console.error('[mp-ui] action "' + name + '" failed', e); }
    }
  }

  /* =====================================================================
   * 数字滚动（rAF + easeOutCubic）
   * 按组管理：HUD 的滚动不能被结算面板重建时误杀
   * ===================================================================== */
  function rollTo(node, to, dur, group) {
    if (!node) return;
    var g = group || 'panel';
    var from = typeof node.__rollFrom === 'number' ? node.__rollFrom : 0;
    node.__rollFrom = to;
    if (node.__rollRaf) { cancelAnimationFrame(node.__rollRaf); node.__rollRaf = 0; }
    if (from === to || !(dur > 0)) { node.textContent = fmtNum(to); return; }
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var step = function (ts) {
      var k = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmtNum(from + (to - from) * e);
      if (k < 1) {
        node.__rollRaf = requestAnimationFrame(step);
      } else {
        node.__rollRaf = 0;
        node.textContent = fmtNum(to);
      }
    };
    node.__rollRaf = requestAnimationFrame(step);
    if (!rollGroups[g]) rollGroups[g] = [];
    if (rollGroups[g].indexOf(node) < 0) rollGroups[g].push(node);
  }

  /* 元素销毁前取消对应组的滚动动画 */
  function cancelRolls(group) {
    var g = group || 'panel';
    var arr = rollGroups[g] || [];
    for (var i = 0; i < arr.length; i++) {
      var n = arr[i];
      if (n && n.__rollRaf) { cancelAnimationFrame(n.__rollRaf); n.__rollRaf = 0; }
    }
    rollGroups[g] = [];
  }

  /* =====================================================================
   * 存储：设置（与 game.js 的 G.cfg 字段名一致）
   * ===================================================================== */
  function loadCfg() {
    var c = load(KEY_CFG, null);
    if (c && typeof c === 'object') {
      if (typeof c.bgm === 'number') cfg.bgm = clamp01(c.bgm);
      if (typeof c.sfx === 'number') cfg.sfx = clamp01(c.sfx);
      cfg.vibrate = c.vibrate !== false;
      cfg.quality = c.quality === 'low' ? 'low' : 'high';
      cfg.orient = ['auto', 'portrait', 'landscape'].indexOf(c.orient) >= 0 ? c.orient : 'auto';
      cfg.touchUI = typeof c.touchUI === 'boolean' ? c.touchUI : null;
    }
  }

  /* 写 cfg：先读出再合并，保留其它字段 */
  function writeCfg() {
    var old = load(KEY_CFG, null);
    var out = (old && typeof old === 'object') ? old : {};
    out.bgm = cfg.bgm;
    out.sfx = cfg.sfx;
    out.vibrate = cfg.vibrate;
    out.quality = cfg.quality;
    out.orient = cfg.orient;
    out.touchUI = cfg.touchUI;
    store(KEY_CFG, out);
  }

  function hasSave() {
    var s = load(KEY_SAVE, null);
    return !!(s && s.runSeed);
  }

  /* =====================================================================
   * 精灵图（MP.ART.sprite → 画进 <canvas>）
   * ===================================================================== */
  function spriteCanvas(key, size) {
    var art = window.MP ? window.MP.ART : null;
    if (!art || typeof art.sprite !== 'function') return null;
    var sp = null;
    try { sp = art.sprite(key); } catch (e) { sp = null; }
    if (!sp || !sp.width || !sp.height) return null;
    var c = document.createElement('canvas');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(size * dpr));
    c.height = Math.max(1, Math.round(size * dpr));
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    var ctx = c.getContext('2d');
    if (!ctx) return null;
    try { ctx.drawImage(sp, 0, 0, c.width, c.height); } catch (e) { return null; }
    return c;
  }

  /* =====================================================================
   * 屏幕构建
   * ===================================================================== */
  function mkScreen(key, cls) {
    var s = el('div', 'screen' + (cls ? ' ' + cls : ''));
    s.id = 'scr-' + key;
    root.appendChild(s);
    screens[key] = s;
    return s;
  }

  function mkPanel(key, title, en) {
    var sc = mkScreen(key, 'center');
    sc.appendChild(el('div', 'veil'));
    var wrap = el('div', 'panel-wrap');
    var card = el('div', 'glass panel');
    if (title) {
      var tt = el('div', 'panel-tt', title);
      if (en) tt.appendChild(el('span', 'panel-en', en));
      card.appendChild(tt);
    }
    wrap.appendChild(card);
    sc.appendChild(wrap);
    return { screen: sc, wrap: wrap, card: card };
  }

  /* ---- 1. 主菜单 ---- */
  function buildMenu() {
    var sc = mkScreen('menu', 'center');
    sc.appendChild(el('div', 'veil'));
    var wrap = el('div', 'menu-wrap');
    var card = el('div', 'glass menu-card');
    card.innerHTML =
      '<div class="title-cn">鼠族跑酷</div>' +
      '<div class="title-en">MOUSE RUSH</div>' +
      '<div class="title-sub">背奶酪的灰色小鼠 · 无尽横版跑酷</div>' +
      '<div class="title-keys">' +
      '<div class="krow"><b>键盘</b><span class="kbd">←</span><span class="kbd">→</span> 或 <span class="kbd">A</span><span class="kbd">D</span> 移动 · ' +
      '<span class="kbd">空格</span> 跳（长按更高）· <span class="kbd">Shift</span> 冲刺 · <span class="kbd">↓</span> 滑铲 / 跳劈</div>' +
      '<div class="krow"><b>其它</b><span class="kbd">P</span> 暂停 · <span class="kbd">R</span> 重开本关 · <span class="kbd">M</span> 必杀</div>' +
      '<div class="krow"><b>触屏</b>左半屏按住拖动 = 动态摇杆，右半屏三键 = 跳 / 冲刺 / 滑铲</div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn pri" data-action="start">开始游戏</button>' +
      '<button type="button" class="btn" data-action="continue" id="btn-continue">继续游戏</button>' +
      '<button type="button" class="btn" data-action="settings">设置</button>' +
      '<button type="button" class="btn" data-action="records">最高分</button>' +
      '<button type="button" class="btn" data-action="howto">玩法说明</button>' +
      '</div>' +
      '<div class="title-foot">无限关卡 · 六套计分 · 25 种道具 + 11 种危险物</div>';
    wrap.appendChild(card);
    sc.appendChild(wrap);
  }

  function refreshMenu() {
    var b = $('btn-continue');
    if (b) b.classList.toggle('ui-hidden', !hasSave());
  }

  /* ---- 2. HUD ---- */
  function buildHud() {
    var sc = mkScreen('hud', 'hud');
    sc.innerHTML =
      '<div class="hud-row hud-row-1">' +
      '<div class="hud-score-box">' +
      '<div class="hud-cap">积分</div>' +
      '<div class="hud-score num" id="hud-score">0</div>' +
      '</div>' +
      '<div class="hud-combo" id="hud-combo">×2</div>' +
      '<div class="hud-chips">' +
      '<div class="hchip" title="当前关卡" aria-label="当前关卡"><i class="ic ic-flag"></i><b class="num" id="hud-level">1</b></div>' +
      '<div class="hchip" title="金币" aria-label="金币"><i class="ic ic-coin"></i><b class="num" id="hud-coin">0</b></div>' +
      '<div class="hchip" title="奶酪" aria-label="奶酪"><i class="ic ic-cheese"></i><b class="num" id="hud-cheese">0/6</b></div>' +
      '<div class="hchip hchip-life" title="剩余生命" aria-label="剩余生命"><b id="hud-lives">❤❤❤</b></div>' +
      '</div>' +
      '</div>' +
      '<div class="hud-row hud-row-2">' +
      '<div class="hud-bar-box">' +
      '<div class="hud-cap-row"><span>风格</span><b id="hud-style-level">D</b><span class="pts num" id="hud-style-pts">0</span></div>' +
      '<div class="bar"><i id="hud-style-fill"></i></div>' +
      '</div>' +
      '<div class="hud-bar-box">' +
      '<div class="hud-cap-row"><span>能量</span><b class="num" id="hud-energy-num">0</b>' +
      '<button class="mega" id="hud-mega" type="button" data-action="mega">必杀</button></div>' +
      '<div class="bar bar-energy" id="hud-energy-bar"><i id="hud-energy-fill"></i></div>' +
      '</div>' +
      '<div class="hud-biome" id="hud-biome">厨房</div>' +
      '</div>' +
      '<div class="hud-buffs" id="hud-buffs"></div>';
    hud.screen = sc;
    hud.score = $('hud-score');
    hud.combo = $('hud-combo');
    hud.level = $('hud-level');
    hud.coin = $('hud-coin');
    hud.cheese = $('hud-cheese');
    hud.lives = $('hud-lives');
    hud.styleLevel = $('hud-style-level');
    hud.stylePts = $('hud-style-pts');
    hud.styleFill = $('hud-style-fill');
    hud.energyNum = $('hud-energy-num');
    hud.energyFill = $('hud-energy-fill');
    hud.energyBar = $('hud-energy-bar');
    hud.mega = $('hud-mega');
    hud.biome = $('hud-biome');
    hud.buffs = $('hud-buffs');
  }

  /* ---- 3. 暂停面板 ---- */
  function buildPause() {
    var p = mkPanel('pause', '暂停', 'PAUSED');
    var row = el('div', 'btn-row');
    row.appendChild(mkBtn('pri', '继续', 'resume'));
    row.appendChild(mkBtn('', '重开本关', 'retry'));
    row.appendChild(mkBtn('', '设置', 'settings'));
    row.appendChild(mkBtn('ghost', '返回主菜单', 'menu'));
    p.card.appendChild(row);
  }

  /* ---- 4. 关卡结算 ---- */
  function buildClear() {
    var p = mkPanel('clear', '关卡通关', 'LEVEL CLEAR');
    screens.clear = p.screen;
    screens.clear.__card = p.card;
    p.card.innerHTML = '';
  }

  function renderClear(data) {
    var card = screens.clear.__card;
    if (!card) return;
    cancelRolls();
    card.innerHTML = '';
    var tt = el('div', 'panel-tt', '关卡通关');
    tt.appendChild(el('span', 'panel-en', 'LEVEL ' + (data.level || 1) + ' CLEAR'));
    card.appendChild(tt);
    if (data.flawless) card.appendChild(el('div', 'badge', '无伤通关'));

    var stars = el('div', 'stars');
    var n = Math.max(0, Math.min(3, data.stars || 1));
    for (var i = 0; i < 3; i++) {
      var st = el('div', 'star', '★');
      if (i < n) { st.classList.add('on'); st.style.animationDelay = (0.12 * i) + 's'; }
      stars.appendChild(st);
    }
    card.appendChild(stars);

    var mk = data.mk || {};
    var list = el('div', 'res-list');
    var rows = [
      ['距离分', mk.distance || 0],
      ['拾取分', mk.pickup || 0],
      ['风格分', mk.style || 0],
      ['击杀分', mk.kill || 0],
      ['过关奖励', mk.clear || 0]
    ];
    var nodes = [];
    for (var r = 0; r < rows.length; r++) {
      var row = el('div', 'res-row');
      row.appendChild(el('span', null, rows[r][0]));
      var b = el('b', 'num', '0');
      row.appendChild(b);
      list.appendChild(row);
      nodes.push({ node: b, val: rows[r][1] });
    }
    var tot = el('div', 'res-row total');
    tot.appendChild(el('span', null, '总分'));
    var tb = el('b', 'num', '0');
    tot.appendChild(tb);
    list.appendChild(tot);
    card.appendChild(list);

    var cr = el('div', 'res-row');
    cr.appendChild(el('span', null, '奶酪收集'));
    cr.appendChild(el('b', 'num', fmtNum(data.cheese || 0) + ' / ' + fmtNum(data.targetCheese || 0)));
    card.appendChild(cr);

    var hr = el('div', 'res-row');
    hr.appendChild(el('span', null, '最高连击'));
    hr.appendChild(el('b', 'num', '×' + fmtNum(data.combo || 0)));
    card.appendChild(hr);

    var sr = el('div', 'style-rate');
    sr.appendChild(el('span', null, '风格等级 '));
    sr.appendChild(el('b', null, data.styleLevel || 'D'));
    sr.appendChild(el('span', 'num', ' · ' + fmtNum(data.stylePts || 0) + ' 分'));
    card.appendChild(sr);

    var br = el('div', 'btn-row');
    br.appendChild(mkBtn('pri', '下一关', 'next'));
    br.appendChild(mkBtn('', '重玩本关', 'retry'));
    br.appendChild(mkBtn('ghost', '主菜单', 'menu'));
    card.appendChild(br);

    for (var n2 = 0; n2 < nodes.length; n2++) rollTo(nodes[n2].node, nodes[n2].val, 520);
    rollTo(tb, data.score || 0, 760);
  }

  /* ---- 5. 游戏结束 ---- */
  function buildOver() {
    var p = mkPanel('over', '游戏结束', 'GAME OVER');
    screens.over.__card = p.card;
    p.card.innerHTML = '';
  }

  function renderOver(data) {
    var card = screens.over.__card;
    if (!card) return;
    cancelRolls();
    card.innerHTML = '';
    var tt = el('div', 'panel-tt', '游戏结束');
    tt.appendChild(el('span', 'panel-en', 'GAME OVER'));
    card.appendChild(tt);

    var list = el('div', 'res-list');
    var mk = data.mk || {};
    var rows = [
      ['本局总分', data.score || 0, true],
      ['最高分', data.best || 0, false],
      ['到达关卡', '第 ' + fmtNum(data.level || 1) + ' 关', false],
      ['最高连击', '×' + fmtNum(data.bestCombo || 0), false],
      ['最高风格等级', (data.bestStyleLevel || 'D') + ' · ' + fmtNum(data.bestStylePts || 0) + ' 分', false]
    ];
    var scoreNode = null;
    for (var r = 0; r < rows.length; r++) {
      var row = el('div', 'res-row' + (rows[r][2] ? ' total' : ''));
      row.appendChild(el('span', null, rows[r][0]));
      var b = el('b', 'num', '0');
      if (typeof rows[r][1] === 'number') b.textContent = fmtNum(rows[r][1]);
      else b.textContent = rows[r][1];
      row.appendChild(b);
      list.appendChild(row);
      if (rows[r][2]) scoreNode = b;
    }
    card.appendChild(list);

    var st = data.stats || {};
    var mini = el('div', 'stat-mini');
    var mins = [
      ['击杀', st.kills], ['拾取', st.items], ['跳跃', st.jumps], ['二段跳', st.djumps],
      ['冲刺', st.dashes], ['踩敌', st.stomp], ['滑铲', st.slides], ['死亡', st.deaths]
    ];
    for (var m = 0; m < mins.length; m++) {
      var box = el('div');
      box.appendChild(el('b', 'num', fmtNum(mins[m][1] || 0)));
      box.appendChild(el('span', null, mins[m][0]));
      mini.appendChild(box);
    }
    card.appendChild(mini);

    var mkRow = el('div', 'res-row');
    mkRow.appendChild(el('span', null, '距离 / 拾取 / 风格 / 击杀'));
    mkRow.appendChild(el('b', 'num', fmtNum(mk.distance || 0) + ' / ' + fmtNum(mk.pickup || 0) +
      ' / ' + fmtNum(mk.style || 0) + ' / ' + fmtNum(mk.kill || 0)));
    card.appendChild(mkRow);

    var br = el('div', 'btn-row');
    br.appendChild(mkBtn('pri', '再来一局', 'start'));
    br.appendChild(mkBtn('ghost', '主菜单', 'menu'));
    card.appendChild(br);

    if (scoreNode) rollTo(scoreNode, data.score || 0, 760);
  }

  /* ---- 6. 设置面板 ---- */
  function buildSettings() {
    var p = mkPanel('settings', '设置', 'SETTINGS');
    var list = el('div', 'set-list');

    var r1 = el('div', 'set-row');
    r1.appendChild(el('div', 'set-lbl', 'BGM 音乐'));
    var c1 = el('div', 'set-ctl');
    var bgm = el('input', 'rng');
    bgm.setAttribute('type', 'range');
    bgm.setAttribute('min', '0');
    bgm.setAttribute('max', '100');
    bgm.setAttribute('step', '1');
    bgm.id = 'set-bgm';
    bgm.setAttribute('data-action', 'setVolume');
    bgm.setAttribute('data-which', 'bgm');
    c1.appendChild(bgm);
    r1.appendChild(c1);
    list.appendChild(r1);

    var r2 = el('div', 'set-row');
    r2.appendChild(el('div', 'set-lbl', '音效 SFX'));
    var c2 = el('div', 'set-ctl');
    var sfxIn = el('input', 'rng');
    sfxIn.setAttribute('type', 'range');
    sfxIn.setAttribute('min', '0');
    sfxIn.setAttribute('max', '100');
    sfxIn.setAttribute('step', '1');
    sfxIn.id = 'set-sfx';
    sfxIn.setAttribute('data-action', 'setVolume');
    sfxIn.setAttribute('data-which', 'sfx');
    c2.appendChild(sfxIn);
    r2.appendChild(c2);
    list.appendChild(r2);

    list.appendChild(chipRow('震动', 'vibrate', [
      { v: 'true', t: '开启' }, { v: 'false', t: '关闭' }
    ]));
    list.appendChild(chipRow('画质', 'quality', [
      { v: 'high', t: '高' }, { v: 'low', t: '低' }
    ]));
    list.appendChild(chipRow('横竖屏', 'orient', [
      { v: 'auto', t: '自动' }, { v: 'portrait', t: '强制竖屏' }, { v: 'landscape', t: '强制横屏' }
    ]));
    list.appendChild(chipRow('触屏控件', 'touchUI', [
      { v: 'auto', t: '自动' }, { v: 'true', t: '开' }, { v: 'false', t: '关' }
    ]));

    var r7 = el('div', 'set-row col');
    r7.appendChild(el('div', 'set-lbl', '存档'));
    var c7 = el('div', 'set-ctl');
    var btns = el('div', 'save-btns');
    var bExp = el('button', 'chip', '导出到文本框');
    bExp.setAttribute('type', 'button');
    bExp.setAttribute('data-action', 'exportSave');
    var bImp = el('button', 'chip', '从文本框导入');
    bImp.setAttribute('type', 'button');
    bImp.setAttribute('data-action', 'importSave');
    var bClr = el('button', 'chip danger', '清空存档');
    bClr.setAttribute('type', 'button');
    bClr.setAttribute('data-action', 'clearSave');
    btns.appendChild(bExp);
    btns.appendChild(bImp);
    btns.appendChild(bClr);
    c7.appendChild(btns);
    var box1 = el('textarea', 'save-box');
    box1.id = 'save-box';
    box1.setAttribute('rows', '2');
    box1.setAttribute('placeholder', '导出后的存档文本（base64）');
    var box2 = el('textarea', 'save-box');
    box2.id = 'import-box';
    box2.setAttribute('rows', '2');
    box2.setAttribute('placeholder', '粘贴要导入的存档文本');
    c7.appendChild(box1);
    c7.appendChild(box2);
    c7.appendChild(el('div', 'set-note', '导出后复制文本框内容；导入时粘贴文本后点「从文本框导入」。清空存档会同时清除最高分记录。'));
    r7.appendChild(c7);
    list.appendChild(r7);

    p.card.appendChild(list);
    var br = el('div', 'btn-row');
    br.appendChild(mkBtn('pri', '完成', 'closeSettings'));
    p.card.appendChild(br);
  }

  function chipRow(label, group, opts) {
    var row = el('div', 'set-row');
    row.appendChild(el('div', 'set-lbl', label));
    var ctl = el('div', 'set-ctl chips');
    ctl.setAttribute('data-group', group);
    for (var i = 0; i < opts.length; i++) {
      var c = el('button', 'chip', opts[i].t);
      c.setAttribute('type', 'button');
      c.setAttribute('data-action', group === 'vibrate' ? 'setVibrate'
        : group === 'quality' ? 'setQuality'
          : group === 'orient' ? 'setOrient' : 'setTouchUI');
      c.setAttribute('data-value', opts[i].v);
      ctl.appendChild(c);
    }
    row.appendChild(ctl);
    return row;
  }

  function cfgValue(name) {
    if (name === 'vibrate') return cfg.vibrate ? 'true' : 'false';
    if (name === 'quality') return cfg.quality;
    if (name === 'orient') return orientMode;
    if (name === 'touchUI') return cfg.touchUI === null ? 'auto' : (cfg.touchUI ? 'true' : 'false');
    return '';
  }

  function refreshSettings() {
    if (!screens.settings) return;
    var groups = screens.settings.querySelectorAll('.chips[data-group]');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var val = cfgValue(g.getAttribute('data-group'));
      var chips = g.querySelectorAll('.chip');
      for (var j = 0; j < chips.length; j++) {
        chips[j].classList.toggle('on', chips[j].getAttribute('data-value') === val);
      }
    }
    var bgm = $('set-bgm'), sfxIn = $('set-sfx');
    if (bgm) bgm.value = String(Math.round(cfg.bgm * 100));
    if (sfxIn) sfxIn.value = String(Math.round(cfg.sfx * 100));
  }

  /* ---- 7. 玩法说明（含道具图鉴，懒生成） ---- */
  function buildHowto() {
    var p = mkPanel('howto', '玩法说明', 'HOW TO PLAY');
    var card = p.card;

    var s1 = el('div', 'sec');
    var t1 = el('div', 'sec-tt', '操作');
    t1.appendChild(el('small', null, 'CONTROLS'));
    s1.appendChild(t1);
    var u1 = el('ul', 'rule-list');
    u1.appendChild(el('li', null, '键盘：← → / A D 移动，空格 / W / ↑ 跳（长按更高），Shift / J 冲刺，↓ / S 滑铲（空中为跳劈），P 暂停，R 重开本关，M 必杀'));
    u1.appendChild(el('li', null, '触屏：左半屏按住拖动为动态摇杆，右半屏三键为跳 / 冲刺 / 滑铲'));
    u1.appendChild(el('li', null, '目标：跑到奶酪城堡过关，尽量多收集奶酪拿高星级'));
    s1.appendChild(u1);
    card.appendChild(s1);

    var s2 = el('div', 'sec');
    var t2 = el('div', 'sec-tt', '道具图鉴');
    t2.appendChild(el('small', null, 'PICKUPS 25'));
    s2.appendChild(t2);
    var g2 = el('div', 'codex');
    s2.appendChild(g2);
    card.appendChild(s2);

    var s3 = el('div', 'sec');
    var t3 = el('div', 'sec-tt', '危险物');
    t3.appendChild(el('small', null, 'HAZARDS 11'));
    s3.appendChild(t3);
    var g3 = el('div', 'codex');
    s3.appendChild(g3);
    card.appendChild(s3);

    var s4 = el('div', 'sec');
    var t4 = el('div', 'sec-tt', '风格动作表');
    t4.appendChild(el('small', null, 'STYLE'));
    s4.appendChild(t4);
    var tbl = el('table', 'tbl');
    var thead = el('thead');
    var trh = el('tr');
    trh.appendChild(el('th', null, '动作'));
    trh.appendChild(el('th', null, '风格分'));
    trh.appendChild(el('th', null, '说明'));
    thead.appendChild(trh);
    tbl.appendChild(thead);
    var tbody = el('tbody');
    for (var i = 0; i < STYLE_ACTIONS.length; i++) {
      var tr = el('tr');
      tr.appendChild(el('td', null, STYLE_ACTIONS[i][0]));
      tr.appendChild(el('td', 'p', STYLE_ACTIONS[i][1]));
      tr.appendChild(el('td', null, STYLE_ACTIONS[i][2]));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    s4.appendChild(tbl);
    s4.appendChild(el('div', 'set-note', '风格等级：' + STYLE_LV.join(' / ') + '（阈值 ' + STYLE_T.join(' / ') + '，每关独立重置，每秒衰减 8%）'));
    card.appendChild(s4);

    var s5 = el('div', 'sec');
    var t5 = el('div', 'sec-tt', '计分规则');
    t5.appendChild(el('small', null, 'SCORING'));
    s5.appendChild(t5);
    var u5 = el('ul', 'rule-list');
    var rules = [
      '距离分：每 12 世界单位 +1 分',
      '拾取分：道具自带分值（奶酪 150 / 金币 80 / 钻石 500 …）',
      '风格分：只由风格动作累积，每秒衰减 8%，低于当前等级下限会降级',
      '击杀分：踩死或击杀敌人得分',
      '过关奖励：800 × 关卡数 + 无伤 1500 + 奶酪 80/个 + 剩余命 600/条',
      '连击：连续拾取/击杀不断链，倍率 = 1 + min(连击, 30) × 0.1（上限 ×4）',
      '能量：普通道具 +2、敌人 +6，满 100 可放「鼠王冲刺」清屏',
      '星级：到达终点 ★；奶酪达标 ★★；无伤且奶酪达标 ★★★',
      '奶酪目标：每关 6 + floor(关卡 / 2) 个'
    ];
    for (var r = 0; r < rules.length; r++) u5.appendChild(el('li', null, rules[r]));
    s5.appendChild(u5);
    card.appendChild(s5);

    var br = el('div', 'btn-row');
    br.appendChild(mkBtn('pri', '返回主菜单', 'menu'));
    card.appendChild(br);

    /* 图鉴条目按需懒生成（首次打开玩法说明时才铺 DOM 与精灵图） */
    codexHosts = { pickup: g2, hazard: g3 };
  }

  function fillCodex() {
    if (codexBuilt || !codexHosts) return;
    buildCodex(codexHosts.pickup, ITEM_ORDER, ITEM_DOC, liveMap('ITEMS'), false);
    buildCodex(codexHosts.hazard, HAZARD_ORDER, HAZARD_DOC, liveMap('HAZARDS'), true);
    codexBuilt = true;
  }

  function liveMap(name) {
    var lg = window.MP ? window.MP.LOGIC : null;
    if (!lg) return null;
    var m = lg[name];
    return (m && typeof m === 'object') ? m : null;
  }

  function buildCodex(host, ids, docs, live, isBad) {
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var l = live ? live[id] : null;
      var nm = (l && l.name) ? l.name : (docs[id] ? docs[id][0] : id);
      var ds = (l && l.desc) ? l.desc : (docs[id] ? docs[id][1] : '');
      var item = el('div', 'codex-item' + (isBad ? ' bad' : ''));
      var box = el('div', 'codex-ic' + (isBad ? ' bad' : ''));
      var spr = spriteCanvas(id, 34);
      if (spr) box.appendChild(spr);
      else box.textContent = nm.slice(0, 1);
      item.appendChild(box);
      var txt = el('div', 'codex-txt');
      txt.appendChild(el('div', 'codex-nm', nm));
      txt.appendChild(el('div', 'codex-ds', ds));
      item.appendChild(txt);
      host.appendChild(item);
    }
  }

  /* ---- 最高分面板 ---- */
  function buildRecords() {
    var p = mkPanel('records', '最高分', 'RECORDS');
    screens.records.__card = p.card;
    p.card.innerHTML = '';
  }

  function renderRecords(rec) {
    var card = screens.records.__card;
    if (!card) return;
    cancelRolls();
    card.innerHTML = '';
    var tt = el('div', 'panel-tt', '最高分');
    tt.appendChild(el('span', 'panel-en', 'RECORDS'));
    card.appendChild(tt);
    var list = el('div', 'res-list');
    var rows = [
      ['最高分', fmtNum(rec.bestScore || 0)],
      ['最高关卡', '第 ' + fmtNum(rec.bestLevel || 0) + ' 关'],
      ['最高连击', '×' + fmtNum(rec.bestCombo || 0)],
      ['最高风格等级', (rec.bestStyle || 'D') + ' · ' + fmtNum(rec.bestStylePts || 0) + ' 分']
    ];
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'res-row' + (i === 0 ? ' total' : ''));
      row.appendChild(el('span', null, rows[i][0]));
      row.appendChild(el('b', 'num', rows[i][1]));
      list.appendChild(row);
    }
    card.appendChild(list);
    var br = el('div', 'btn-row');
    br.appendChild(mkBtn('pri', '返回主菜单', 'menu'));
    card.appendChild(br);
  }

  /* ---- 触屏控件 ---- */
  function buildTouch() {
    var layer = el('div');
    layer.id = 'touch-layer';

    var zone = el('div');
    zone.id = 'stick-zone';
    var base = el('div');
    base.id = 'stick-base';
    var knob = el('div');
    knob.id = 'stick-knob';
    base.appendChild(knob);
    zone.appendChild(base);
    layer.appendChild(zone);

    var jump = el('button', null, '跳');
    jump.id = 'btn-jump';
    jump.setAttribute('type', 'button');
    var dash = el('button', null, '冲');
    dash.id = 'btn-dash';
    dash.setAttribute('type', 'button');
    var slide = el('button', null, '铲');
    slide.id = 'btn-slide';
    slide.setAttribute('type', 'button');
    layer.appendChild(jump);
    layer.appendChild(dash);
    layer.appendChild(slide);

    root.appendChild(layer);
    touchUIEls = {
      stickZone: zone, stickBase: base, stickKnob: knob,
      btnJump: jump, btnDash: dash, btnSlide: slide
    };
  }

  /* ---- toast / popup 承载层 ---- */
  function buildOverlays() {
    var tl = el('div');
    tl.id = 'toast-layer';
    var t = el('div', 'toast');
    t.id = 'toast-box';
    tl.appendChild(t);
    root.appendChild(tl);

    var pl = el('div');
    pl.id = 'popup-layer';
    var p = el('div', 'popup');
    p.id = 'popup-box';
    pl.appendChild(p);
    root.appendChild(pl);
  }

  /* =====================================================================
   * 屏幕切换
   * ===================================================================== */
  function show(name) {
    var target = name || null;
    if (target && screens[target]) prevScreen = curScreen;
    curScreen = target;
    for (var i = 0; i < SCREEN_KEYS.length; i++) {
      var k = SCREEN_KEYS[i];
      var s = screens[k];
      if (!s) continue;
      var on = (k === target);
      if (!on && k === 'hud') on = (target === 'pause');
      s.classList.toggle('on', on);
    }
    if (target === 'menu') refreshMenu();
    if (target === 'settings') {
      settingsReturn = (prevScreen && prevScreen !== 'settings') ? prevScreen : 'menu';
      refreshSettings();
    }
    updateTouchVisibility();
  }

  function showAll() {
    for (var i = 0; i < SCREEN_KEYS.length; i++) {
      var s = screens[SCREEN_KEYS[i]];
      if (s) s.classList.remove('on');
    }
    curScreen = null;
    updateTouchVisibility();
  }

  /* =====================================================================
   * 交互：统一走 game.onAction
   * ===================================================================== */
  function onRootClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest('[data-action]');
    if (!btn) return;
    if (btn.tagName === 'INPUT') return;   // 滑杆走 input 事件
    var action = btn.getAttribute('data-action');
    if (!action) return;
    ev.preventDefault();
    handleAction(action, btn);
  }

  function handleAction(action, btn) {
    sfx('ui');
    switch (action) {
      case 'setVolume': {
        var which = btn.getAttribute('data-which') || 'bgm';
        var v = clamp01(Number(btn.value) / 100);
        cfg[which] = v;
        act('setVolume', { which: which, value: v });
        writeCfg();
        break;
      }
      case 'setVibrate': {
        var on = btn.getAttribute('data-value') === 'true';
        cfg.vibrate = on;
        act('setVibrate', { value: on });
        writeCfg();
        refreshSettings();
        break;
      }
      case 'setQuality': {
        var q = btn.getAttribute('data-value') === 'low' ? 'low' : 'high';
        cfg.quality = q;
        act('setQuality', { value: q });
        writeCfg();
        refreshSettings();
        break;
      }
      case 'setOrient': {
        var o = btn.getAttribute('data-value');
        if (['auto', 'portrait', 'landscape'].indexOf(o) < 0) o = 'auto';
        cfg.orient = o;
        orientMode = o;
        act('setOrient', { value: o });
        writeCfg();
        refreshSettings();
        break;
      }
      case 'setTouchUI': {
        var raw = btn.getAttribute('data-value');
        var tv = (raw === 'auto') ? null : (raw === 'true');
        cfg.touchUI = tv;
        if (tv === null) { applyOrientation(); }
        else { act('setTouchUI', { value: tv }); }
        writeCfg();
        refreshSettings();
        break;
      }
      case 'exportSave': {
        act('exportSave', { el: $('save-box') });
        break;
      }
      case 'importSave': {
        var ib = $('import-box');
        act('importSave', { text: ib ? ib.value : '' });
        break;
      }
      case 'clearSave': {
        act('clearSave', null);
        break;
      }
      case 'closeSettings': {
        act('closeSettings', null);
        show(settingsReturn || 'menu');
        break;
      }
      default:
        act(action, null);
        break;
    }
  }

  /* 滑杆（input 事件，走 setVolume） */
  function bindRanges() {
    var list = root.querySelectorAll('input.rng');
    for (var i = 0; i < list.length; i++) {
      list[i].addEventListener('input', function (ev) {
        var node = ev.currentTarget;
        var which = node.getAttribute('data-which') || 'bgm';
        var v = clamp01(Number(node.value) / 100);
        cfg[which] = v;
        act('setVolume', { which: which, value: v });
        writeCfg();
      });
    }
  }

  /* 面板拖动滚动（#app touch-action:none 会屏蔽原生触摸滚动，这里手动补） */
  function bindDragScroll() {
    root.addEventListener('touchstart', function (ev) {
      if (ev.target && (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT')) return;
      var p = findPanel(ev.target);
      drag.panel = p;
      drag.on = !!p;
      drag.y = ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0;
    }, { passive: true });
    root.addEventListener('touchmove', function (ev) {
      if (!drag.on || !drag.panel) return;
      var y = ev.touches && ev.touches[0] ? ev.touches[0].clientY : drag.y;
      var dy = drag.y - y;
      drag.y = y;
      var p = drag.panel;
      var before = p.scrollTop;
      p.scrollTop = before + dy;
      if (p.scrollTop !== before) ev.preventDefault();
    }, { passive: false });
    var end = function () { drag.on = false; drag.panel = null; };
    root.addEventListener('touchend', end, { passive: true });
    root.addEventListener('touchcancel', end, { passive: true });
  }

  function findPanel(node) {
    while (node && node !== root) {
      if (node.classList && node.classList.contains('panel')) return node;
      node = node.parentNode;
    }
    return null;
  }

  /* =====================================================================
   * HUD 刷新
   * ===================================================================== */
  function styleProgress(level, pts) {
    var idx = STYLE_LV.indexOf(level);
    if (idx < 0) idx = 0;
    if (idx >= STYLE_T.length - 1) return 1;
    var lo = STYLE_T[idx], hi = STYLE_T[idx + 1];
    if (hi <= lo) return 1;
    var v = (pts - lo) / (hi - lo);
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function update(snap) {
    if (!snap || !hud.score) return;
    var s = snap;

    if (s.score !== last.score) { last.score = s.score; rollTo(hud.score, s.score, 420, 'hud'); }
    if (s.coin !== last.coin) { last.coin = s.coin; hud.coin.textContent = fmtNum(s.coin); }
    if (s.cheese !== last.cheese || s.targetCheese !== last.targetCheese) {
      last.cheese = s.cheese; last.targetCheese = s.targetCheese;
      hud.cheese.textContent = fmtNum(s.cheese) + '/' + fmtNum(s.targetCheese);
    }
    if (s.styleLevel !== last.styleLevel || s.stylePts !== last.stylePts) {
      last.styleLevel = s.styleLevel; last.stylePts = s.stylePts;
      hud.styleLevel.textContent = s.styleLevel || 'D';
      hud.stylePts.textContent = fmtNum(s.stylePts);
      hud.styleFill.style.transform = 'scaleX(' + styleProgress(s.styleLevel || 'D', s.stylePts) + ')';
    }
    if (s.combo !== last.combo) {
      last.combo = s.combo;
      if (s.combo > 1) {
        hud.combo.textContent = '×' + fmtNum(s.combo);
        hud.combo.classList.add('on');
        hud.combo.classList.remove('bump');
        void hud.combo.offsetWidth;
        hud.combo.classList.add('bump');
      } else {
        hud.combo.classList.remove('on');
      }
    }
    if (s.energy !== last.energy) {
      last.energy = s.energy;
      hud.energyNum.textContent = fmtNum(s.energy);
      hud.energyFill.style.transform = 'scaleX(' + clamp01(s.energy / 100) + ')';
    }
    if (!!s.megaReady !== last.megaReady) {
      last.megaReady = !!s.megaReady;
      hud.mega.classList.toggle('on', last.megaReady);
      hud.energyBar.classList.toggle('full', last.megaReady);
    }
    if (s.lives !== last.lives || s.maxLives !== last.maxLives) {
      last.lives = s.lives; last.maxLives = s.maxLives;
      var lives = Math.max(0, s.lives || 0);
      var max = Math.max(lives, s.maxLives || 0);
      var str = '';
      for (var i = 0; i < max; i++) str += (i < lives ? '❤' : '♡');
      hud.lives.textContent = str;
    }
    if (s.level !== last.level) { last.level = s.level; hud.level.textContent = fmtNum(s.level); }
    if (s.biomeName !== last.biomeName) { last.biomeName = s.biomeName; hud.biome.textContent = s.biomeName || ''; }
    updateBuffs(s.buffs || []);
  }

  function updateBuffs(buffs) {
    var key = '';
    for (var i = 0; i < buffs.length; i++) key += buffs[i].id + ',';
    if (key !== last.buffKey) {
      last.buffKey = key;
      hud.buffs.innerHTML = '';
      buffNodes = [];
      for (var j = 0; j < buffs.length; j++) {
        var b = buffs[j];
        var node = el('div', 'buff');
        var spr = spriteCanvas(b.icon || b.id, 18);
        if (spr) { spr.className = 'buff-ic'; node.appendChild(spr); }
        else node.appendChild(el('div', 'buff-ic txt', (b.name || b.id).slice(0, 1)));
        node.appendChild(el('span', 'buff-name', b.name || b.id));
        var bar = el('div', 'buff-bar');
        var fill = el('i');
        bar.appendChild(fill);
        node.appendChild(bar);
        var tm = el('span', 'buff-t num', '0');
        node.appendChild(tm);
        hud.buffs.appendChild(node);
        buffNodes.push({ id: b.id, fill: fill, time: tm });
      }
    }
    for (var k = 0; k < buffNodes.length && k < buffs.length; k++) {
      var b2 = buffs[k];
      var total = (b2.total > 0) ? b2.total : b2.t;
      var r = total > 0 ? clamp01(b2.t / total) : 0;
      buffNodes[k].fill.style.transform = 'scaleX(' + r + ')';
      buffNodes[k].time.textContent = (b2.t >= 10) ? String(Math.ceil(b2.t)) : b2.t.toFixed(1);
    }
  }

  /* =====================================================================
   * Toast / Popup
   * ===================================================================== */
  function toast(text, kind) {
    var box = $('toast-box');
    if (!box) return;
    box.textContent = (text === undefined || text === null) ? '' : String(text);
    box.className = 'toast' + (kind ? ' ' + kind : '');
    void box.offsetWidth;
    box.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('on'); }, 1900);
  }

  function popup(text, kind) {
    var box = $('popup-box');
    if (!box) return;
    box.textContent = (text === undefined || text === null) ? '' : String(text);
    box.className = 'popup' + (kind ? ' ' + kind : '');
    void box.offsetWidth;
    box.classList.add('on');
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(function () { box.classList.remove('on'); }, 1150);
  }

  /* =====================================================================
   * 结算渲染分发
   * ===================================================================== */
  function result(data) {
    if (!data || typeof data !== 'object') return;
    var kind = data.kind;
    if (kind === 'clear') {
      renderClear(data);
      show('clear');
    } else if (kind === 'over') {
      renderOver(data);
      show('over');
    } else if (kind === 'howto') {
      fillCodex();
      show('howto');
    } else if (kind === 'records') {
      renderRecords(data.records || {});
      show('records');
    }
  }

  /* =====================================================================
   * 方向 / 触屏 / 震动
   * ===================================================================== */
  function isPortraitNow() {
    if (window.matchMedia) {
      try { return window.matchMedia('(orientation: portrait)').matches; }
      catch (e) {}
    }
    return (window.innerHeight || 0) >= (window.innerWidth || 0);
  }

  function setOrientationMode(mode) {
    orientMode = ['auto', 'portrait', 'landscape'].indexOf(mode) >= 0 ? mode : 'auto';
    cfg.orient = orientMode;
    applyOrientation();
  }

  function orientationMode() { return orientMode; }

  function applyOrientation() {
    if (!appEl) return;
    var mode = orientMode;
    if (mode === 'portrait') {
      appEl.classList.add('force-port');
      appEl.classList.remove('force-land');
      document.body.setAttribute('data-orient', 'portrait');
    } else if (mode === 'landscape') {
      appEl.classList.add('force-land');
      appEl.classList.remove('force-port');
      document.body.setAttribute('data-orient', 'landscape');
    } else {
      appEl.classList.remove('force-land');
      appEl.classList.remove('force-port');
      document.body.setAttribute('data-orient', isPortraitNow() ? 'portrait' : 'landscape');
    }
    updateTouchVisibility();
  }

  function onResize() {
    if (orientMode === 'auto') {
      applyOrientation();
    } else if (appEl) {
      document.body.setAttribute('data-orient', orientMode === 'portrait' ? 'portrait' : 'landscape');
    }
    updateTouchVisibility();
  }

  function isTouch() {
    if (typeof window !== 'undefined' && 'ontouchstart' in window) return true;
    if (navigator && navigator.maxTouchPoints > 0) return true;
    return false;
  }

  function touchUIEnabled() {
    if (cfg.touchUI === true) return true;
    if (cfg.touchUI === false) return false;
    return isTouch();
  }

  function updateTouchVisibility() {
    var layer = $('touch-layer');
    if (!layer) return;
    layer.classList.toggle('on', touchUIEnabled() && curScreen === 'hud');
  }

  function getTouchControls() {
    if (!touchUIEls) return null;
    if (!touchUIEls.stickZone || !touchUIEls.stickBase || !touchUIEls.stickKnob) return null;
    if (!touchUIEls.btnJump || !touchUIEls.btnDash || !touchUIEls.btnSlide) return null;
    return touchUIEls;
  }

  function vibrate(ms) {
    if (!cfg.vibrate) return;
    try { if (navigator && navigator.vibrate) navigator.vibrate(ms); }
    catch (e) {}
  }

  /* =====================================================================
   * 初始化
   * ===================================================================== */
  function init(g) {
    game = g || null;
    if (!root) root = document.getElementById('ui-root');
    if (!root || root.__mpUiBuilt) return;
    root.__mpUiBuilt = true;
    appEl = document.getElementById('app');

    loadCfg();
    orientMode = cfg.orient;

    buildMenu();
    buildHud();
    buildPause();
    buildClear();
    buildOver();
    buildSettings();
    buildHowto();
    buildRecords();
    buildTouch();
    buildOverlays();

    root.addEventListener('click', onRootClick);
    bindRanges();
    bindDragScroll();

    // 美术模块若已就绪，预热一次（仅运行时调用，不在加载期调用）
    try {
      var art = window.MP ? window.MP.ART : null;
      if (art && typeof art.init === 'function') art.init();
    } catch (e) {}

    show('menu');
  }

  /* =====================================================================
   * 对外 API
   * ===================================================================== */
  U.screens = screens;
  U.init = init;
  U.show = show;
  U.showAll = showAll;
  U.update = update;
  U.toast = toast;
  U.popup = popup;
  U.result = result;
  U.setOrientationMode = setOrientationMode;
  U.orientationMode = orientationMode;
  U.getTouchControls = getTouchControls;
  U.isTouch = isTouch;
  U.applyOrientation = applyOrientation;
  U.onResize = onResize;
  U.vibrate = vibrate;

  window.MP.UI = U;
})();
