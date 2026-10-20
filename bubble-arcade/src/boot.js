/* ============================================================
 * 泡泡堂 · src/boot.js —— 启动引导
 * 缩放舞台 / 触屏模式 / 初始化各模块 / URL 调试参数
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = global.BA;
  var stage = null;

  /* 触屏设备判定：?touch=1 强制开启 / ?touch=0 强制关闭 */
  function preferTouch() {
    var Q = global.__BAQ || {};
    if (Q.touch === '0') return false;
    if (Q.touch === '1') return true;
    var touch = (navigator.maxTouchPoints || 0) > 0;
    var coarse = false;
    try { coarse = global.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var ua = /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent || '');
    return (touch && coarse) || (touch && ua);
  }

  /* 桌面端：棋盘整体居中缩放（文字跟着缩放，桌面空间足够） */
  function fitStage() {
    if (!stage) stage = document.getElementById('stage');
    if (!stage) return;
    var pad = 24;
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min((vw - pad * 2) / 960, (vh - pad * 2) / 832);
    s = Math.min(s, 1.28);
    stage.style.left = '50%';
    stage.style.top = '50%';
    stage.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(4) + ')';
    if (BA.FX) BA.FX.resize();
  }

  /* ---------------- 移动端布局 ----------------
   * 桌面上棋盘被 transform 缩放，stage 里的文字会跟着缩到 6px 手机上根本读不了；
   * 移动端把文字层搬出 stage（见 mobile.js），棋盘改用绝对定位精确算矩形。
   *   竖屏：棋盘顶到上方（顶部留给 HUD 条），下方整块让给拇指操作区
   *   横屏：棋盘居中，HUD 叠在棋盘顶部，操作控件叠在两侧
   */
  function fitMobile() {
    if (!stage) stage = document.getElementById('stage');
    if (!stage) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var portrait = vh > vw;
    var safe = (BA.MOBILE && BA.MOBILE.safe) || { t: 0, b: 0, l: 0, r: 0 };
    var pad = portrait ? 5 : 8;
    var topBar = portrait ? 46 : 0;          // 竖屏顶部 HUD 条
    var availH = vh - safe.t - safe.b - topBar - pad * 2;
    var s = Math.min((vw - pad * 2) / 960, availH / 832);
    s = Math.min(s, 1.28);
    var bw = 960 * s, bh = 832 * s;
    var left = Math.round((vw - bw) / 2);
    var top = portrait
      ? Math.round(safe.t + topBar)
      : Math.round((vh - bh) / 2);
    stage.style.left = left + 'px';
    stage.style.top = top + 'px';
    stage.style.transform = 'scale(' + s.toFixed(4) + ')';
    stage.style.transformOrigin = '0 0';
    var app = document.getElementById('app');
    if (app) {
      app.classList.toggle('portrait', portrait);
      app.classList.toggle('landscape', !portrait);
    }
    if (BA.MOBILE) BA.MOBILE.layout({ left: left, top: top, w: bw, h: bh });
    if (BA.FX) BA.FX.resize();
  }

  function boot() {
    var touchMode = preferTouch();
    stage = document.getElementById('stage');
    /* 移动端增强层要先起：它把文字 UI 搬出被缩放的 stage */
    if (touchMode && BA.MOBILE) BA.MOBILE.init();
    if (touchMode) fitMobile();
    else fitStage();
    var onResize = function () {
      if (touchMode) fitMobile();
      else fitStage();
      if (BA.FX) BA.FX.resize();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 120); });

    BA.FX.setEnabled(!!BA.CORE.CFG.get().particles);
    BA.GAME.init(document.getElementById('game'));
    /* TOUCH 先于 UI：标题/帮助屏按触屏模式生成提示文案 */
    if (touchMode && BA.TOUCH) BA.TOUCH.init();
    BA.UI.init();

    var hints = document.getElementById('hints');
    if (hints) {
      hints.innerHTML = touchMode
        ? '<span>左半屏滑动移动</span><span class="sep">·</span><span>右下按钮放泡</span><span class="sep">·</span><span>被困连点脱困</span>'
        : '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span>' +
          '<span class="sep">·</span><span><kbd>Space</kbd> 放泡</span>' +
          '<span class="sep">·</span><span><kbd>Esc</kbd> 暂停</span>' +
          '<span class="sep">·</span><span><kbd>M</kbd> 静音</span>';
    }
    BA.UI.hud(BA.GAME.S);
    BA.UI.show('title');

    var Q = global.__BAQ || {};
    if (Q.muted === true || Q.muted === '1') {
      BA.CORE.CFG.patch({ muted: true });
      BA.AUDIO.muted(true);
    }
    if (Q.fps === true || Q.fps === '1') {
      BA.CORE.CFG.patch({ showFps: true });
      document.getElementById('fps').classList.add('on');
    }
    if (Q.speed) BA.GAME.S.speedMul = parseFloat(Q.speed) || 1;
    if (Q.auto === true || Q.auto === '1') {
      // 自动化：直接开始一场 bot-only 演示（测试用）
      setTimeout(function () {
        BA.GAME.startMatch({
          mode: 'ffa', humans: 0, players: 4,
          diff: Q.diff || 'normal', map: Q.map || 'garden', winsNeeded: 3
        });
        BA.GAME.setBotOnly(true);
      }, 60);
    }
    if (Q.map && Q.auto !== true) BA.CORE.CFG.patch({ lastMap: Q.map });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
