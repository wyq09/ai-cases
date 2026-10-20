/* ============================================================
 * 泡泡堂 · src/mobile.js —— 移动端专属增强层
 * 只在触屏模式启用，桌面端完全不受影响。
 *
 * 解决的四个问题：
 *  1) UI 文字被棋盘缩放压到 6px —— 把文字层搬出被 transform 缩放的 stage，
 *     改用视口坐标 + 紧凑样式，标题/分数/计时器在手机上都够大。
 *  2) 竖屏棋盘下方空 350px —— 棋盘顶到上方，空白全部让给拇指操作区。
 *  3) 手机上"不知道该往哪跑" —— 脚下画引信倒计时环 + 标出可逃方向。
 *  4) 手机上没有触感反馈 —— 放泡/爆炸/被困/击杀/胜负给振动反馈。
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = global.BA;

  var enabled = false;
  var app = null, uiLayer = null;
  var safe = { t: 0, b: 0, l: 0, r: 0 };
  var lastHaptic = 0, hapticOn = true;
  var bombBadge = null, bombBtn = null, bombNum = 0;
  var acc = 0, rotShown = false;

  /* ---------------- 安全区探测（env(safe-area-inset-*) 只能在 CSS 里读） ---------------- */
  function probeSafe() {
    var el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);' +
      'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
    document.body.appendChild(el);
    var cs = getComputedStyle(el);
    var r = {
      t: parseFloat(cs.paddingTop) || 0,
      b: parseFloat(cs.paddingBottom) || 0,
      l: parseFloat(cs.paddingLeft) || 0,
      r: parseFloat(cs.paddingRight) || 0
    };
    el.parentNode.removeChild(el);
    return r;
  }

  /* ---------------- 初始化：把文字层搬出被缩放的 stage ---------------- */
  function init() {
    if (enabled) return;
    enabled = true;
    app = document.getElementById('app');
    if (!app) return;
    safe = probeSafe();

    // stage 上有 transform，里面的 fixed 元素也会被一起缩放 → 必须搬到 stage 外
    uiLayer = document.createElement('div');
    uiLayer.id = 'uiLayer';
    app.appendChild(uiLayer);

    var ids = ['hud', 'countdown', 'toast', 'fps', 'hints'];
    for (var i = 0; i < ids.length; i++) {
      var e = document.getElementById(ids[i]);
      if (e) uiLayer.appendChild(e);
    }
    // 菜单屏放最后 → 同层内压在 HUD 之上
    var screens = document.querySelectorAll('#stage > .screen');
    for (var j = 0; j < screens.length; j++) uiLayer.appendChild(screens[j]);

    app.classList.add('mobile');
    hapticOn = BA.CORE.CFG.get().haptics !== false;
  }

  /* 炸弹键是触屏层稍后创建的，这里惰性挂角标 */
  function ensureBomb() {
    if (bombBadge) return;
    bombBtn = document.querySelector('.tl-bomb');
    if (!bombBtn) return;
    bombBadge = document.createElement('b');
    bombBadge.className = 'tl-bomb-num';
    bombBtn.appendChild(bombBadge);
  }

  /* ---------------- 布局：把棋盘屏幕矩形写进 CSS 变量 ---------------- */
  function layout(rect) {
    if (!enabled || !app) return;
    var s = app.style;
    s.setProperty('--bx', rect.left.toFixed(1) + 'px');
    s.setProperty('--by', rect.top.toFixed(1) + 'px');
    s.setProperty('--bw', rect.w.toFixed(1) + 'px');
    s.setProperty('--bh', rect.h.toFixed(1) + 'px');
    s.setProperty('--sat', safe.t.toFixed(1) + 'px');
    s.setProperty('--sab', safe.b.toFixed(1) + 'px');
    s.setProperty('--sal', safe.l.toFixed(1) + 'px');
    s.setProperty('--sar', safe.r.toFixed(1) + 'px');
  }

  /* ---------------- 触觉反馈 ---------------- */
  var PATTERNS = {
    place: 12,
    boom: 26,
    trap: [45, 55, 45],
    rescue: [16, 40, 16],
    die: [70, 50, 140],
    item: 18,
    win: [30, 55, 30, 55, 70],
    lose: [140, 70, 140],
    ui: 8
  };
  function haptic(kind) {
    if (!enabled || !hapticOn) return;
    var pat = PATTERNS[kind];
    if (!pat) return;
    var now = Date.now();
    if (now - lastHaptic < 45) return;   // 防连击糊成一片
    lastHaptic = now;
    try {
      if (navigator.vibrate) navigator.vibrate(pat);
    } catch (e) {}
  }
  function setHaptics(on) {
    hapticOn = !!on;
    BA.CORE.CFG.patch({ haptics: hapticOn });
  }

  /* ---------------- 每帧刷新：炸弹剩余数 / 被困提示 ---------------- */
  function update(dt) {
    if (!enabled) return;
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    var S = BA.GAME && BA.GAME.S;
    if (!S) return;
    var p = null;
    for (var i = 0; i < S.players.length; i++) if (S.players[i].isHuman) { p = S.players[i]; break; }
    if (!p) return;
    // 炸弹键剩余可放数
    ensureBomb();
    if (bombBadge) {
      var n = Math.max(0, (p.maxBombs || 0) - (p.activeBombs || 0));
      if (n !== bombNum) {
        bombNum = n;
        bombBadge.textContent = n > 0 ? String(n) : '';
        if (bombBtn) bombBtn.classList.toggle('empty', n <= 0);
      }
    }
    // 被困时炸弹键变成"连点自救"提示
    if (bombBtn) bombBtn.classList.toggle('trapped', !!p.trapped);
    // 横屏引导：只在竖屏显示，关闭后记住
    var rot = document.querySelector('.tl-rotate');
    if (rot) {
      var portrait = app && app.classList.contains('portrait');
      var want = !!(portrait && !BA.CORE.CFG.get().rotateHintOff);
      if (want !== rotShown) {
        rotShown = want;
        rot.classList.toggle('on', want);
      }
    }
  }

  BA.MOBILE = {
    init: init,
    layout: layout,
    update: update,
    haptic: haptic,
    setHaptics: setHaptics,
    get enabled() { return enabled; },
    get safe() { return safe; }
  };
})(window);
