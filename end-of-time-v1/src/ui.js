/* 时间的尽头 — UI 层（零依赖） */
(function () {
  'use strict';
  const TE = window.TE = window.TE || {};

  let hintTimer = 0;
  let kickTimer = 0;

  function $(sel) { return document.querySelector(sel); }

  TE.ui = {
    init() {
      const veil = $('#veil');
      const hint = $('.ui-hint');
      const btn = $('#soundBtn');

      btn.addEventListener('click', () => {
        const muted = TE.audio.toggle();
        btn.classList.toggle('off', muted);
        btn.setAttribute('title', muted ? '声音：开' : '声音：关');
        btn.setAttribute('aria-label', muted ? '开启声音' : '关闭声音');
      });

      hintTimer = setTimeout(() => {
        if (hint) hint.classList.add('faded');
      }, 9000);

      // 触屏设备换用触屏话术
      if ('ontouchstart' in window) {
        const p = hint && hint.querySelector('.hint');
        if (p) p.textContent = '◎ 单指环视\u2002·\u2002双指缩放\u2002·\u2002轻点，让时间流动';
      }
    },

    ready() {
      const veil = $('#veil');
      if (veil) veil.classList.add('off');
    },

    onKick() {
      // 时间流动时，标题轻轻亮一下
      const title = $('.title');
      if (!title) return;
      clearTimeout(kickTimer);
      title.style.transition = 'text-shadow 0.5s ease, color 0.5s ease';
      title.style.textShadow = '0 0 34px rgba(255, 196, 120, 0.55)';
      title.style.color = '#fff3df';
      kickTimer = setTimeout(() => {
        title.style.textShadow = '0 0 26px rgba(255, 196, 120, 0.16)';
        title.style.color = '';
      }, 700);
    },
  };
})();
