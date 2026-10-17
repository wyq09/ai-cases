/* ============================================================
 * 泡泡堂 · src/boot.js —— 启动引导
 * 缩放舞台 / 移动端拦截 / 初始化各模块 / URL 调试参数
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = global.BA;
  var stage = null;

  function isMobile() {
    var ua = navigator.userAgent || '';
    var touch = (navigator.maxTouchPoints || 0) > 1;
    var mobileUa = /Android|iPhone|iPad|iPod|Windows Phone|Mobile|BlackBerry|Opera Mini/i.test(ua);
    var small = Math.min(window.innerWidth, window.innerHeight) < 620 && touch;
    return mobileUa || small;
  }

  function fitStage() {
    if (!stage) stage = document.getElementById('stage');
    if (!stage) return;
    var pad = 24;
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min((vw - pad * 2) / 960, (vh - pad * 2) / 832);
    s = Math.min(s, 1.28);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(4) + ')';
    if (BA.FX) BA.FX.resize();
  }

  function boot() {
    if (isMobile()) {
      document.getElementById('desktopOnly').classList.add('on');
      // 仍然初始化，防止后台报错（不渲染）
      try { BA.GAME.init(document.getElementById('game')); } catch (e) {}
      return;
    }
    stage = document.getElementById('stage');
    fitStage();
    window.addEventListener('resize', function () {
      fitStage();
      if (BA.FX) BA.FX.resize();
    });

    BA.FX.setEnabled(!!BA.CORE.CFG.get().particles);
    BA.UI.init();
    BA.GAME.init(document.getElementById('game'));
    var hints = document.getElementById('hints');
    if (hints) {
      hints.innerHTML = '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span>' +
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
