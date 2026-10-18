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

  /* 竖屏给底部操作区多留白，横屏少留白 */
  function reserveFor(vw, vh) { return vh > vw ? 186 : 118; }

  function fitStage(reserveBottom) {
    if (!stage) stage = document.getElementById('stage');
    if (!stage) return;
    var pad = reserveBottom > 0 ? 10 : 24;
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min((vw - pad * 2) / 960, (vh - pad * 2 - reserveBottom) / 832);
    s = Math.min(s, 1.28);
    stage.style.left = '50%';
    stage.style.top = reserveBottom > 0 ? Math.round((vh - reserveBottom) / 2) + 'px' : '50%';
    stage.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(4) + ')';
    if (BA.FX) BA.FX.resize();
  }

  function boot() {
    var touchMode = preferTouch();
    stage = document.getElementById('stage');
    fitStage(touchMode ? reserveFor(window.innerWidth, window.innerHeight) : 0);
    var onResize = function () {
      fitStage(touchMode ? reserveFor(window.innerWidth, window.innerHeight) : 0);
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
        ? '<span>左侧滑动移动</span><span class="sep">·</span><span>右下按钮放泡</span><span class="sep">·</span><span>右上按钮暂停</span>'
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
