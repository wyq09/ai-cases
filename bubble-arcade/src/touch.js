/* ============================================================
 * 泡泡堂 · src/touch.js —— 触屏操作层
 * 动态虚拟摇杆（左手热区）+ 放泡大按钮（右手）+ 暂停按钮
 * 手感：按下处为摇杆原点；4 向吸附 + 轴间迟滞防抖；
 *       死区内原地站定；被困时摇杆变向 / 连点放泡键均可计入自救
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = global.BA;

  var layer = null, zone = null, base = null, knob = null;
  var bombBtn = null, pauseBtn = null, stick = null, rotate = null;
  var joyId = null;        // 占用摇杆的 touch identifier
  var ox = 0, oy = 0;      // 摇杆原点（视口坐标）
  var outDir = null;       // 当前输出给游戏的四向
  var lastAngle = 0;       // 上一次摇杆角度（用于识别"快速划动"）
  var bombDown = false;
  var enabled = false;
  var syncTimer = 0;

  var R = 56;              // 摇杆最大半径（CSS px）
  var DEAD = 8;            // 死区：视为原地站定（手机上手指粗，死区小一点更跟手）
  var K_AXIS = 1.15;       // 轴间切换迟滞：新轴分量需 > 当前轴分量 × K
  var M_AXIS = 6;          // 轴间切换迟滞：且需超出 M px
  var FLICK = 0.85;        // 快速划动阈值（弧度 ≈ 49°）：划一下立刻转向，不等迟滞

  var ICON_BOMB =
    '<svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true">' +
    '<circle cx="21" cy="28" r="13" fill="#6ec8ff" opacity=".92"/>' +
    '<circle cx="16.5" cy="23.5" r="4.4" fill="#fff" opacity=".9"/>' +
    '<path d="M28 18 q2.5-7 9.5-8" stroke="#ffd27a" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
    '<circle cx="39" cy="9" r="3.2" fill="#ffcf5e"/>' +
    '</svg>';
  var ICON_PAUSE =
    '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
    '<rect x="6" y="4" width="4.2" height="16" rx="1.6" fill="#cfe0f8"/>' +
    '<rect x="13.8" y="4" width="4.2" height="16" rx="1.6" fill="#cfe0f8"/>' +
    '</svg>';

  function inPlay() {
    var S = BA.GAME && BA.GAME.S;
    return !!S && (S.phase === 'play' || S.phase === 'countdown');
  }

  /* 4 向吸附 + 迟滞：当前横轴时，纵轴分量需明显占优才切换，防 45° 抖动 */
  function pickDir(dx, dy) {
    var mag = Math.hypot(dx, dy);
    if (mag < DEAD) return null;
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (outDir === 'left' || outDir === 'right') {
      if (ay > ax * K_AXIS && ay > ax + M_AXIS) return dy < 0 ? 'up' : 'down';
      return dx >= 0 ? 'right' : 'left';
    }
    if (outDir === 'up' || outDir === 'down') {
      if (ax > ay * K_AXIS && ax > ay + M_AXIS) return dx < 0 ? 'left' : 'right';
      return dy >= 0 ? 'down' : 'up';
    }
    return ax >= ay ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
  }
  /* 不看迟滞，直接按主轴吸附（快速划动时用） */
  function snapAxis(dx, dy) {
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
  }
  function angleDelta(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function showBase(x, y) {
    base.style.left = x + 'px';
    base.style.top = y + 'px';
    base.classList.add('on');
    moveKnob(0, 0);
  }
  function moveKnob(dx, dy) {
    var mag = Math.hypot(dx, dy);
    if (mag > R) { dx = dx / mag * R; dy = dy / mag * R; }
    knob.style.transform = 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px))';
  }
  function hideBase() {
    base.classList.remove('on');
    joyId = null;
  }

  function joystickStart(t) {
    joyId = t.identifier;
    ox = t.clientX; oy = t.clientY;
    outDir = null;
    lastAngle = Math.atan2(t.clientY - oy, t.clientX - ox);
    showBase(ox, oy);
    if (stick) stick.classList.add('act');
  }
  function joystickMove(t) {
    var dx = t.clientX - ox, dy = t.clientY - oy;
    moveKnob(dx, dy);
    var ang = Math.atan2(dy, dx);
    var d = pickDir(dx, dy);
    // 快速划动：本次角度和上次差得多（≈49°以上）→ 玩家明确想转向，
    // 忽略迟滞直接采用主轴方向。迟滞挡住的恰好是 45°~49° 这段，
    // 慢推要挪 35px 才转得过来，快速划一下反而更跟手。
    var raw = snapAxis(dx, dy);
    if (d !== null && outDir && raw !== outDir && Math.abs(angleDelta(ang, lastAngle)) > FLICK) {
      d = raw;
    }
    if (d !== outDir) {
      outDir = d;
      if (BA.GAME.touch) BA.GAME.touch.dir(d);
    }
    lastAngle = ang;
  }
  function joystickEnd() {
    if (outDir && BA.GAME.touch) BA.GAME.touch.dir(null);
    outDir = null;
    hideBase();
    if (stick) stick.classList.remove('act');
  }

  function setBomb(down) {
    if (bombDown === down) return;
    bombDown = down;
    bombBtn.classList.toggle('press', down);
    if (BA.GAME.touch) BA.GAME.touch.bomb(down);
  }

  function syncVisible() {
    if (!layer || !enabled) return;
    var S = BA.GAME && BA.GAME.S;
    var on = inPlay() && !(S && S.botOnly);
    layer.classList.toggle('on', on);
    layer.classList.toggle('paused', !!(on && S.paused));
  }

  function init() {
    if (enabled) return;
    layer = document.getElementById('touchLayer');
    if (!layer) return;
    enabled = true;

    layer.innerHTML =
      '<div class="tl-zone"></div>' +
      '<div class="tl-stick"><i></i><span>拖动移动</span></div>' +
      '<div class="tl-base"><div class="tl-knob"></div></div>' +
      '<div class="tl-rotate">' +
        '<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">' +
          '<rect x="15" y="5" width="18" height="30" rx="3.5" fill="none" stroke="#9fc6ff" stroke-width="2.4"/>' +
          '<path d="M9 34a16 16 0 0 0 30 0" fill="none" stroke="#9fc6ff" stroke-width="2.4" stroke-linecap="round"/>' +
          '<path d="M36 28l4 6-7 1z" fill="#9fc6ff"/>' +
        '</svg>' +
        '<b>横屏更爽</b>' +
        '<span>棋盘更大 · 视野更宽</span>' +
        '<button type="button" class="tl-rotate-x">知道了</button>' +
      '</div>' +
      '<div class="tl-bomb">' + ICON_BOMB + '</div>' +
      '<button class="tl-pause" type="button" aria-label="暂停">' + ICON_PAUSE + '</button>';

    zone = layer.querySelector('.tl-zone');
    stick = layer.querySelector('.tl-stick');
    rotate = layer.querySelector('.tl-rotate');
    if (rotate) {
      var rx = rotate.querySelector('.tl-rotate-x');
      if (rx) {
        rx.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          BA.CORE.CFG.patch({ rotateHintOff: true });
          if (rotate) rotate.classList.add('gone');
        });
      }
    }
    base = layer.querySelector('.tl-base');
    knob = layer.querySelector('.tl-knob');
    bombBtn = layer.querySelector('.tl-bomb');
    pauseBtn = layer.querySelector('.tl-pause');

    zone.addEventListener('touchstart', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (joyId === null) joystickStart(e.changedTouches[i]);
      }
    }, { passive: false });

    window.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyId) {
          e.preventDefault();
          joystickMove(e.changedTouches[i]);
        }
      }
    }, { passive: false });

    var release = function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyId) joystickEnd();
      }
    };
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);

    bombBtn.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation(); setBomb(true);
    }, { passive: false });
    bombBtn.addEventListener('touchend', function (e) { e.preventDefault(); setBomb(false); }, { passive: false });
    bombBtn.addEventListener('touchcancel', function () { setBomb(false); });
    bombBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    /* ?touch=1 桌面调试用 */
    bombBtn.addEventListener('mousedown', function () { setBomb(true); });
    window.addEventListener('mouseup', function () { if (bombDown) setBomb(false); });

    pauseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var S = BA.GAME && BA.GAME.S;
      if (!S) return;
      if (S.paused) BA.GAME.resume();
      else if (inPlay()) BA.GAME.pause();
    });

    layer.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(syncVisible, 300);
    syncVisible();

    if (window.__ba) {
      window.__ba.touch = {
        get dir() { return outDir; },
        get bomb() { return bombDown; }
      };
    }
  }

  BA.TOUCH = {
    init: init,
    /* 暂停/恢复时立刻同步控件可用性——否则要等下一次 300ms 定时器，
       玩家点完"继续"会有半秒摇杆按不动的死区 */
    sync: function () { syncVisible(); },
    get enabled() { return enabled; }
  };
})(window);
