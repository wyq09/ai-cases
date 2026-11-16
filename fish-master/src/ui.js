/* 捕鱼达人 · DEEP SEA ANGLER — HUD / 弹层交互 */
(function () {
  'use strict';
  window.FM = window.FM || {};

  window.FM.UI = (function () {
    var els = {};
    var handlers = {};
    var initialized = false;
    var state = {
      power: 1,
      muted: false,
      paused: false,
      help: false,
      bombCharge: 0,
      combo: 0
    };
    var lastCombo = -1;
    var toastAnim = null;

    var IDS = [
      'app', 'canvas-host', 'hud',
      'coins', 'score', 'combo', 'combo-num', 'fish-count', 'fps',
      'power-bar', 'bomb-btn', 'bomb-fill',
      'mute-btn', 'pause-btn', 'help-btn', 'hint',
      'catch-pop', 'toast',
      'start-overlay', 'start-btn',
      'pause-overlay', 'resume-btn', 'restart-btn',
      'help-overlay', 'help-close',
      'result-overlay', 'result-title', 'result-body', 'again-btn'
    ];

    function byId(id) { return document.getElementById(id); }

    function cacheEls() {
      IDS.forEach(function (id) { els[id] = byId(id); });
      els.powerBtns = Array.prototype.slice.call(
        (document.querySelector('#power-bar') || document).querySelectorAll('[data-power]')
      );
    }

    function emit(name, arg) {
      var fn = handlers[name];
      if (typeof fn !== 'function') return;
      try {
        fn(arg);
      } catch (e) {
        if (window.console && console.error) console.error('[FM.UI] handler "' + name + '" failed:', e);
      }
    }

    function fmt(n) {
      var v = Math.round(Number(n));
      if (!isFinite(v) || v < 0) v = 0;
      return v.toLocaleString('en-US');
    }

    function clamp(v, lo, hi) {
      v = Number(v);
      if (!isFinite(v)) v = lo;
      return v < lo ? lo : (v > hi ? hi : v);
    }

    /* ---------------- 功率消耗（来自 CONFIG，带兜底） ---------------- */
    function fillPowerCosts() {
      var cfg = window.FM.CONFIG;
      var costs = (cfg && cfg.shotCost) || [1, 2, 3, 5, 8];
      els.powerBtns.forEach(function (btn, i) {
        var p = parseInt(btn.getAttribute('data-power'), 10) || (i + 1);
        var label = btn.querySelector('.power-cost-num');
        if (label) label.textContent = String(costs[p - 1] != null ? costs[p - 1] : costs[i]);
      });
    }

    /* ---------------- 状态与图标同步 ---------------- */
    function syncIcons() {
      if (els['mute-btn']) els['mute-btn'].classList.toggle('is-muted', state.muted);
      if (els['pause-btn']) els['pause-btn'].classList.toggle('is-paused', state.paused);
    }

    function setOverlay(el, visible) {
      if (!el) return;
      if (visible) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }

    /* ---------------- 事件绑定 ---------------- */
    function onClick(el, fn) {
      if (!el) return;
      el.addEventListener('click', fn, false);
    }

    function bindEvents() {
      els.powerBtns.forEach(function (btn) {
        onClick(btn, function () {
          var p = parseInt(btn.getAttribute('data-power'), 10);
          if (!isFinite(p)) return;
          setPower(p);
          emit('onPower', p);
        });
      });

      onClick(els['bomb-btn'], function () { emit('onBomb'); });

      onClick(els['mute-btn'], function () {
        state.muted = !state.muted;
        syncIcons();
        emit('onMute', state.muted);
      });

      onClick(els['pause-btn'], function () {
        var next = !state.paused;
        showPause(next);
        emit('onPause', next);
      });

      onClick(els['help-btn'], function () {
        var next = !state.help;
        showHelp(next);
        emit('onHelp', next);
      });

      onClick(els['start-btn'], function () {
        showStart(false);
        emit('onStart');
      });

      onClick(els['resume-btn'], function () {
        showPause(false);
        emit('onPause', false);
      });

      onClick(els['restart-btn'], function () {
        showPause(false);
        emit('onRestart');
      });

      onClick(els['help-close'], function () {
        showHelp(false);
        emit('onHelp', false);
      });

      onClick(els['again-btn'], function () {
        showResult(null);
        emit('onRestart');
      });
    }

    /* ---------------- 飘字 / 吐司动画 ---------------- */
    function animatePop(pop) {
      var frames = [
        { transform: 'translate(-50%,-50%) scale(.68)', opacity: 0 },
        { transform: 'translate(-50%,-80%) scale(1.08)', opacity: 1, offset: 0.22 },
        { transform: 'translate(-50%,-142%) scale(1)', opacity: 1, offset: 0.62 },
        { transform: 'translate(-50%,-200%) scale(.94)', opacity: 0 }
      ];
      var opts = { duration: 1050, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' };
      var remove = function () {
        if (pop.parentNode) pop.parentNode.removeChild(pop);
      };

      if (typeof pop.animate === 'function') {
        var anim = pop.animate(frames, opts);
        if (anim.finished && typeof anim.finished.then === 'function') {
          anim.finished.then(remove, remove);
        } else {
          anim.onfinish = remove;
        }
        setTimeout(remove, 1400); // 兜底：动画被中断也能清理
      } else {
        pop.style.transition = 'transform 1s ease-out, opacity 1s ease-out';
        requestAnimationFrame(function () {
          pop.style.transform = 'translate(-50%,-200%)';
          pop.style.opacity = '0';
        });
        setTimeout(remove, 1150);
      }
    }

    function showCatch(text, sub) {
      var host = els['catch-pop'];
      if (!host) return;
      var pop = document.createElement('div');
      pop.className = 'pop';

      var main = document.createElement('div');
      main.className = 'pop-main';
      main.textContent = text == null ? '' : String(text);
      pop.appendChild(main);

      if (sub != null && sub !== '') {
        var subEl = document.createElement('div');
        subEl.className = 'pop-sub';
        subEl.textContent = String(sub);
        pop.appendChild(subEl);
      }

      var jitter = (Math.random() * 2 - 1) * 46;
      pop.style.marginLeft = jitter.toFixed(1) + 'px';
      host.appendChild(pop);
      animatePop(pop);
    }

    function showToast(text) {
      var el = els.toast;
      if (!el) return;
      el.textContent = text == null ? '' : String(text);

      if (toastAnim) {
        try { toastAnim.cancel(); } catch (e) { /* noop */ }
        toastAnim = null;
      }
      var frames = [
        { opacity: 0, transform: 'translate(-50%,-42%) scale(.94)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.18 },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.72 },
        { opacity: 0, transform: 'translate(-50%,-58%) scale(.98)' }
      ];
      var opts = { duration: 1600, easing: 'ease-out', fill: 'forwards' };
      if (typeof el.animate === 'function') {
        toastAnim = el.animate(frames, opts);
      } else {
        el.style.opacity = '1';
        setTimeout(function () { el.style.opacity = '0'; }, 1200);
      }
    }

    /* ---------------- 结算面板 ---------------- */
    function makeResultItem(label, value) {
      var item = document.createElement('div');
      item.className = 'result-item';
      var l = document.createElement('span');
      l.className = 'stat-label';
      l.textContent = label;
      var v = document.createElement('span');
      v.className = 'stat-value';
      v.textContent = value;
      item.appendChild(l);
      item.appendChild(v);
      return item;
    }

    function fillResultBody(data) {
      var box = els['result-body'];
      if (!box) return;
      box.textContent = '';

      if (data.body != null && data.body !== '') {
        var row = document.createElement('div');
        if (typeof data.body === 'string') row.textContent = data.body;
        else if (data.body.nodeType) row.appendChild(data.body);
        else row.textContent = String(data.body);
        box.appendChild(row);
      }
      if (data.score != null || data.coins != null) {
        var grid = document.createElement('div');
        grid.className = 'result-grid';
        if (data.score != null) grid.appendChild(makeResultItem('本局得分', fmt(data.score)));
        if (data.coins != null) grid.appendChild(makeResultItem('剩余金币', fmt(data.coins)));
        box.appendChild(grid);
      }
    }

    function showResult(data) {
      var overlay = els['result-overlay'];
      if (!data || data === false) {
        setOverlay(overlay, false);
        return;
      }
      if (els['result-title']) {
        els['result-title'].textContent = data.title != null ? String(data.title) : '本局结束';
      }
      fillResultBody(data);
      setOverlay(overlay, true);
    }

    /* ---------------- 公开接口 ---------------- */
    function setCoins(n) {
      if (els.coins) els.coins.textContent = fmt(n);
    }

    function setScore(n) {
      if (els.score) els.score.textContent = fmt(n);
    }

    function setFishCount(n) {
      if (els['fish-count']) els['fish-count'].textContent = fmt(n);
    }

    function setFps(n) {
      if (els.fps) els.fps.textContent = fmt(n);
    }

    function setCombo(n) {
      n = Math.round(Number(n) || 0);
      state.combo = n;
      var numEl = els['combo-num'];
      if (numEl) numEl.textContent = String(n);
      var badge = els.combo;
      if (!badge) return;
      badge.classList.toggle('is-idle', n <= 1);
      if (n !== lastCombo) {
        badge.classList.remove('is-bump');
        void badge.offsetWidth; // 强制回流，重新触发动画
        badge.classList.add('is-bump');
        lastCombo = n;
      }
    }

    function setPower(p) {
      p = Math.round(clamp(p, 1, 5));
      state.power = p;
      els.powerBtns.forEach(function (btn) {
        var bp = parseInt(btn.getAttribute('data-power'), 10);
        var active = bp === p;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function setBombCharge(v01) {
      var v = clamp(v01, 0, 1);
      state.bombCharge = v;
      if (els['bomb-fill']) els['bomb-fill'].style.height = (v * 100).toFixed(1) + '%';
      if (els['bomb-btn']) els['bomb-btn'].classList.toggle('is-ready', v >= 1);
    }

    function showStart(visible) { setOverlay(els['start-overlay'], !!visible); }

    function showPause(visible) {
      state.paused = !!visible;
      syncIcons();
      setOverlay(els['pause-overlay'], state.paused);
    }

    function showHelp(visible) {
      state.help = !!visible;
      setOverlay(els['help-overlay'], state.help);
    }

    function update() {
      if (!initialized) return;
      // 限制同屏飘字数量，防止短时间内大量捕获堆积 DOM。
      var host = els['catch-pop'];
      if (host && host.childElementCount > 8) {
        while (host.childElementCount > 8 && host.firstElementChild) {
          host.removeChild(host.firstElementChild);
        }
      }
    }

    function init(h) {
      if (initialized) return;
      handlers = h || {};
      cacheEls();
      fillPowerCosts();
      bindEvents();

      setPower(state.power);
      setBombCharge(0);
      syncIcons();
      showStart(true);

      initialized = true;
    }

    return {
      init: init,
      setCoins: setCoins,
      setScore: setScore,
      setCombo: setCombo,
      setPower: setPower,
      setBombCharge: setBombCharge,
      showCatch: showCatch,
      showToast: showToast,
      showStart: showStart,
      showPause: showPause,
      showHelp: showHelp,
      showResult: showResult,
      setFishCount: setFishCount,
      setFps: setFps,
      update: update
    };
  })();
})();
