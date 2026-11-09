/* 时间的尽头 — 引导脚本：装配 audio / scene / ui */
(function () {
  'use strict';
  const TE = window.TE = window.TE || {};

  function boot() {
    const canvas = document.getElementById('stage');
    if (!canvas) return;

    TE.audio.init();
    TE.ui.init();

    try {
      TE.scene.init(canvas);
    } catch (err) {
      const veil = document.getElementById('veil');
      if (veil) {
        veil.innerHTML =
          '<div class="veil-inner"><h1 class="veil-title">时间的尽头</h1>' +
          '<p class="veil-hint">当前浏览器无法开启 WebGL，请更换现代浏览器后重试。</p></div>';
        veil.classList.remove('off');
      }
      if (window.console) console.error(err);
      return;
    }

    // 任何一次用户手势都唤醒声音（自动播放策略）
    const wake = () => {
      TE.audio.ensureStarted();
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);

    TE.scene.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
