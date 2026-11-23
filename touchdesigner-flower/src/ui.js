/* Flower · 界面层：黑幕淡出、操作提示自动隐藏、右下角控制（暂停 / 回正 / 存图）。不参与渲染。 */
(function (root) {
  'use strict';
  var TF = root.TF;
  var hint, ctrl, hintTimer = 0, ctrlTimer = 0, interacted = false;
  // window.__TF 由 main.js 创建；这里总是动态取，避免加载顺序依赖
  function hook() { return root.__TF || {}; }

  function isTouch() { return (navigator.maxTouchPoints || 0) > 0 && root.innerWidth < 1100; }

  function sync() {
    var H = hook();
    var st = H.state ? H.state() : { paused: false };
    document.documentElement.classList.toggle('is-paused', !!st.paused && !st.still);
    var b = document.getElementById('btn-pause');
    if (b) {
      b.setAttribute('aria-pressed', st.paused ? 'true' : 'false');
      b.setAttribute('aria-label', st.paused ? '继续' : '暂停');
      b.title = st.paused ? '继续（空格）' : '暂停（空格）';
    }
  }

  function hideHint() {
    clearTimeout(hintTimer);
    document.documentElement.classList.add('hint-off');
  }

  var ui = (TF.ui = {
    sync: sync,
    /* 首次交互后收起提示 */
    noteInteraction: function () {
      interacted = true;
      hideHint();
    },
    init: function () {
      hint = document.getElementById('hint');
      ctrl = document.getElementById('ctrl');
      var bp = document.getElementById('btn-pause'), br = document.getElementById('btn-reset'), bs = document.getElementById('btn-save');
      if (bp) bp.addEventListener('click', function (e) {
        e.stopPropagation();
        var H = hook(), st = H.state();
        if (st.paused) H.resume(); else H.pause();
        sync();
      });
      if (br) br.addEventListener('click', function (e) { e.stopPropagation(); hook().resetView(); });
      if (bs) bs.addEventListener('click', function (e) { e.stopPropagation(); hook().savePng(); });
      // 鼠标动一下才显示控制条，静止 3 秒后收起
      function wake() {
        document.documentElement.classList.add('ctrl-on');
        clearTimeout(ctrlTimer);
        if (!isTouch()) ctrlTimer = setTimeout(function () { document.documentElement.classList.remove('ctrl-on'); }, 3000);
      }
      root.addEventListener('pointermove', wake, { passive: true });
      root.addEventListener('pointerdown', wake, { passive: true });
      if (isTouch()) root.setTimeout(wake, 1800);
      // 提示 8 秒后自动收起
      hintTimer = setTimeout(hideHint, 8000);
      sync();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
