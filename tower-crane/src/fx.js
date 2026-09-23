/* ============================================================
 * tower-crane · TC.FX —— 粒子与演出特效（零依赖）
 *   dust/confetti/floatText/ring = canvas 粒子（对象池 ≤400）
 *   bigText = DOM + WAAPI（小幅 ease-out-back 弹入-停留-淡出-自毁）
 *   shake/shakeOffset = 震屏，主线每帧读 shakeOffset() 取 {x,y}
 * 红线：禁 shadowBlur（柔光=径向渐变+lighter）；DPR≤2；
 *       document.hidden 暂停；bigText DOM 用完自毁不泄漏
 * ============================================================ */
window.TC = window.TC || {};
window.TC.FX = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* ---- 调色板（契约 §2 房间块 4 色 + 金黄）---- */
  var BLOCKS = ['#ef6a5e', '#7cdcb4', '#f5a733', '#5fb7ef'];
  var BLOCK_LIGHT = ['#ff9285', '#aaf0d2', '#ffc76e', '#96d5fb'];
  var GOLD = '#ffd34d';
  var DUST_COLORS = ['#eae4d8', '#d9d1c3', '#c7bdab', '#f3efe7'];

  var P_MAX = 400;     /* 粒子总上限 */
  var TEXT_MAX = 24;
  var RING_MAX = 16;
  var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  var canvas = null, ctx0 = null;
  var W = 390, H = 844, DPR = 1;

  var parts = [], free = [];   /* 粒子活动链 + 回收池 */
  var texts = [], rings = [];

  var shT = 0, shDur = 1, shMag = 0;
  var curBig = null;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function easeOut(t) { var u = 1 - t; return 1 - u * u * u; }

  /* 兼容 contract 签名 dust(x,y,n,color)/ring(x,y,color) 与任务 {color} 两种 */
  function colorOf(a, d) {
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object' && typeof a.color === 'string') return a.color;
    return d;
  }

  /* ---- 对象池：超上限回收最老粒子，绝不超 400 ---- */
  function acquire() {
    var p;
    if (free.length) p = free.pop();
    else if (parts.length < P_MAX) p = {};
    else p = parts.shift();
    parts.push(p);
    return p;
  }

  /* ---- 画布接管：传入 overlay canvas 或直接传 2d ctx 均可 ---- */
  function init(cv) {
    if (!cv) return;
    if (typeof cv.getContext === 'function') {
      canvas = cv;
      ctx0 = cv.getContext('2d');
    } else {
      canvas = null;
      ctx0 = cv; /* 同 ctx 模式 */
    }
  }

  function resize(w, h, dpr) {
    if (w > 0) W = w;
    if (h > 0) H = h;
    DPR = clamp(dpr || DPR || 1, 1, 2);
    if (canvas) {
      var pw = Math.round(W * DPR), ph = Math.round(H * DPR);
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      if (ctx0) ctx0.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
  }

  /* ---- 落地尘土：暖灰小圆，向外上抛洒后回落，透明度衰减 ---- */
  function dust(x, y, n, colorArg) {
    n = clamp((n | 0) || 12, 1, 40);
    var base = colorOf(colorArg, null);
    for (var i = 0; i < n; i++) {
      var p = acquire();
      p.type = 0;
      p.x = x + rnd(-16, 16);
      p.y = y + rnd(-5, 5);
      var dir = Math.random() < 0.5 ? -1 : 1;
      p.vx = dir * rnd(40, 170) * rnd(0.35, 1);
      p.vy = -rnd(30, 150);
      p.g = 720;
      p.drag = 2.1;
      p.size = rnd(2.5, 7);
      p.grow = rnd(8, 18);
      p.color = base || pick(DUST_COLORS);
      p.t = 0;
      p.life = rnd(0.55, 1.05);
    }
  }

  /* ---- 彩纸屑：块色板+金黄矩形，旋转+左右摆动飘落 ---- */
  function confetti(n) {
    n = clamp((n | 0) || 60, 1, 160);
    for (var i = 0; i < n; i++) {
      var p = acquire();
      p.type = 1;
      p.x = rnd(W * 0.03, W * 0.97);
      p.y = rnd(-H * 0.35, -12);
      p.vy = rnd(180, 380);
      p.g = 150;
      p.sway = rnd(1.1, 2.6);
      p.phase = rnd(0, TAU);
      p.swayAmp = rnd(22, 60);
      p.rot = rnd(0, TAU);
      p.vr = rnd(-6, 6);
      p.w = rnd(7, 12);
      p.h = rnd(4.5, 7.5);
      var r = Math.random();
      p.color = r < 0.62 ? pick(BLOCKS) : (r < 0.82 ? GOLD : pick(BLOCK_LIGHT));
      p.t = 0;
      p.life = 5;
    }
  }

  /* ---- 世界坐标浮动文字：上飘减速 + 淡出 ---- */
  function floatText(x, y, str, o) {
    if (typeof o === 'string') o = { color: o };
    o = o || {};
    if (texts.length >= TEXT_MAX) texts.shift();
    texts.push({
      x: x, y: y,
      str: String(str == null ? '' : str),
      color: o.color || '#ffffff',
      size: clamp(+o.size || 24, 10, 80),
      vy: -(o.rise || 78),
      t: 0, life: o.life || 0.95
    });
  }

  /* ---- 扩散圆环（柔和辉光）---- */
  function ring(x, y, colorArg) {
    if (rings.length >= RING_MAX) rings.shift();
    rings.push({
      x: x, y: y,
      color: colorOf(colorArg, '#ffffff'),
      t: 0, life: 0.5, r0: 10, r1: 66, lw: 5
    });
  }

  /* ---- 震屏 ---- */
  function shake(mag) {
    var m = clamp(+mag || 0, 0, 24);
    var cur = (shT > 0 && shT < shDur) ? shMag * Math.pow(1 - shT / shDur, 2) : 0;
    if (m >= cur) { shMag = m; shDur = 0.3 + m * 0.02; shT = 0.0001; }
  }

  function shakeOffset() {
    if (!(shT > 0 && shT < shDur) || shMag <= 0) return { x: 0, y: 0 };
    var k = shMag * Math.pow(1 - shT / shDur, 2);
    return {
      x: Math.sin(shT * 63 + 1.7) * k,
      y: Math.sin(shT * 47 + 0.4) * k * 0.75
    };
  }

  /* ---- DOM 大字：白描边层 + 彩色面层，WAAPI 弹入-停留-淡出-自毁 ---- */
  function killBig(el) {
    if (!el) return;
    if (el.__anim && el.__anim.cancel) { try { el.__anim.cancel(); } catch (e) {} }
    if (el.__timer) clearTimeout(el.__timer);
    el.__done = true;
    if (el.parentNode) { try { el.parentNode.removeChild(el); } catch (e) {} }
  }

  function bigText(text, o) {
    if (typeof document === 'undefined' || !document.body || !text) return;
    o = o || {};
    if (curBig) { killBig(curBig); curBig = null; } /* 新大字顶掉旧大字 */

    var fill = colorOf(o.color, GOLD);
    var wrap = document.createElement('div');
    wrap.className = 'tc-fx-big';
    wrap.style.cssText =
      'position:fixed;left:50%;top:32%;transform:translate(-50%,-50%);' +
      'z-index:9999;pointer-events:none;text-align:center;white-space:nowrap;' +
      'font-family:' + FONT + ';-webkit-user-select:none;user-select:none;';

    var title = document.createElement('div');
    title.style.cssText = 'position:relative;display:inline-block;font-weight:900;' +
      'font-size:clamp(40px,13vw,72px);line-height:1.15;letter-spacing:0.02em;';

    var stroke = document.createElement('div'); /* 描边层 */
    stroke.textContent = text;
    stroke.setAttribute('aria-hidden', 'true');
    stroke.style.cssText = 'position:absolute;left:0;top:0;width:100%;color:#ffffff;' +
      '-webkit-text-stroke:10px #ffffff;' +
      'text-shadow:0 5px 0 rgba(31,58,92,0.28);';

    var face = document.createElement('div'); /* 面层 */
    face.textContent = text;
    face.style.cssText = 'position:relative;color:' + fill + ';';

    title.appendChild(stroke);
    title.appendChild(face);
    wrap.appendChild(title);

    if (o.sub) {
      var sub = document.createElement('div');
      sub.textContent = o.sub;
      sub.style.cssText = 'margin-top:8px;font-weight:800;' +
        'font-size:clamp(16px,4.6vw,24px);color:#ffffff;' +
        'text-shadow:-1.5px 0 0 rgba(31,58,92,0.55),1.5px 0 0 rgba(31,58,92,0.55),' +
        '0 -1.5px 0 rgba(31,58,92,0.55),0 2px 0 rgba(31,58,92,0.55);';
      wrap.appendChild(sub);
    }

    document.body.appendChild(wrap);
    curBig = wrap;

    var dur = 1350; /* 弹入22%(纯scale弹,全程不透明) → 停留 → 淡出，ease-out-back 幅度小(1.32) */
    function finish() {
      if (wrap.__done) return;
      wrap.__done = true;
      if (curBig === wrap) curBig = null;
      if (wrap.parentNode) { try { wrap.parentNode.removeChild(wrap); } catch (e) {} }
    }
    if (typeof wrap.animate === 'function') {
      var anim = wrap.animate([
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 1, offset: 0, easing: 'cubic-bezier(0.34,1.32,0.64,1)' },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.22, easing: 'linear' },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.62, easing: 'cubic-bezier(0.45,0,0.7,1)' },
        { transform: 'translate(-50%,-56%) scale(0.96)', opacity: 0, offset: 1 }
      ], { duration: dur, fill: 'forwards' });
      wrap.__anim = anim;
      anim.onfinish = finish;
      wrap.__timer = setTimeout(finish, dur + 150); /* WAAPI 异常时不泄漏 */
    } else {
      wrap.__timer = setTimeout(finish, dur); /* 无 WAAPI 环境兜底 */
    }
  }

  /* ---- 主线每帧调用 ---- */
  function update(dt) {
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) return;
    if (dt > 1) dt = dt / 1000; /* 兼容 ms 入参 */
    if (typeof document !== 'undefined' && document.hidden) return; /* 后台暂停 */
    dt = Math.min(dt, 0.05); /* 切回前台大步长钳制 */

    if (shT > 0) { shT += dt; if (shT >= shDur) { shT = 0; shMag = 0; } }

    var i, p, last;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.t += dt;
      var dead = p.t >= p.life;
      if (!dead) {
        if (p.type === 0) { /* 尘土 */
          p.vy += p.g * dt;
          p.vx -= p.vx * Math.min(1, p.drag * dt);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        } else {            /* 彩纸 */
          p.vy = Math.min(p.vy + p.g * dt, 420);
          p.x += Math.cos(p.t * p.sway + p.phase) * p.swayAmp * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > H + 30) dead = true;
        }
      }
      if (dead) {
        last = parts.pop();
        if (i < parts.length) parts[i] = last;
        free.push(p);
      }
    }

    for (i = texts.length - 1; i >= 0; i--) {
      var tx = texts[i];
      tx.t += dt;
      tx.vy += 95 * dt; /* 上飘减速=自然 ease-out */
      tx.y += tx.vy * dt;
      if (tx.t >= tx.life) texts.splice(i, 1);
    }

    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      r.t += dt;
      if (r.t >= r.life) rings.splice(i, 1);
    }
  }

  function draw(ctx) {
    var c = ctx || ctx0;
    if (!c) return;
    c.save();
    var i, p, k;

    /* 圆环：径向渐变辉光(lighter) + 主环线 + 内环细线 */
    for (i = 0; i < rings.length; i++) {
      var r = rings[i];
      k = r.t / r.life;
      var rad = r.r0 + (r.r1 - r.r0) * easeOut(k);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.35 * (1 - k);
      var g = c.createRadialGradient(r.x, r.y, rad * 0.55, r.x, r.y, rad * 1.25);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, r.color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(r.x, r.y, rad * 1.25, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1 - k;
      c.strokeStyle = r.color;
      c.lineWidth = Math.max(1.5, r.lw * (1 - k * 0.8));
      c.beginPath(); c.arc(r.x, r.y, rad, 0, TAU); c.stroke();
      c.globalAlpha = (1 - k) * 0.6;
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(r.x, r.y, rad * 0.82, 0, TAU); c.stroke();
    }

    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      k = p.t / p.life;
      if (p.type === 0) { /* 尘土：膨胀淡出圆 */
        c.globalAlpha = 0.85 * (1 - k) * (1 - k * 0.3);
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size + p.grow * easeOut(k), 0, TAU);
        c.fill();
      } else {            /* 彩纸：旋转+翻面(sin scale) */
        c.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(1, 0.3 + 0.7 * Math.abs(Math.sin(p.t * 3.1 + p.phase)));
        c.fillStyle = p.color;
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.restore();
      }
    }

    /* 浮动文字：白面深描边，起始小弹 */
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (i = 0; i < texts.length; i++) {
      var tx = texts[i];
      k = tx.t / tx.life;
      var pop = tx.t < 0.12 ? 0.75 + 2.08 * tx.t : 1;
      c.globalAlpha = k > 0.55 ? Math.max(0, 1 - (k - 0.55) / 0.45) : 1;
      c.font = '900 ' + Math.round(tx.size * pop) + 'px ' + FONT;
      c.strokeStyle = 'rgba(42,62,89,0.9)';
      c.lineWidth = Math.max(3, tx.size * 0.16);
      c.strokeText(tx.str, tx.x, tx.y);
      c.fillStyle = tx.color;
      c.fillText(tx.str, tx.x, tx.y);
    }
    c.restore();
  }

  function stopAll() {
    var i;
    for (i = 0; i < parts.length; i++) free.push(parts[i]);
    parts.length = 0;
    texts.length = 0;
    rings.length = 0;
    shT = 0; shMag = 0;
    if (curBig) { killBig(curBig); curBig = null; }
  }

  return {
    init: init, resize: resize,
    dust: dust, confetti: confetti, floatText: floatText,
    bigText: bigText, ring: ring,
    shake: shake, shakeOffset: shakeOffset,
    update: update, draw: draw, stopAll: stopAll,
    P_MAX: P_MAX
  };
})();
