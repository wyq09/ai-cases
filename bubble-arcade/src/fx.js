/* ============================================================
 * 泡泡堂 · src/fx.js —— BA.FX Canvas 粒子 / 浮字 / 震屏
 * 全程序化，无 shadowBlur（用径向渐变 + lighter 叠色）。
 * 对象池 + 上限保护；DPR 自适应；页面隐藏暂停。
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});
  var P = BA.PARAMS;

  var canvas = null, ctx = null, dpr = 1;
  var W = 960, H = 832;
  var parts = [], pool = [], texts = [], rings = [];
  var MAX = 620;
  var shakeAmp = 0, shakeDecay = 1;
  var sparkCache = {};
  var enabled = 1;

  function init() {
    if (canvas) return;
    var host = document.getElementById('overlay');
    if (!host) return;
    canvas = document.createElement('canvas');
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!canvas) return;
    var stage = document.getElementById('stage');
    W = stage ? stage.clientWidth : 960;
    H = stage ? stage.clientHeight : 832;
    dpr = Math.min((BA.MOBILE && BA.MOBILE.enabled) ? 1.5 : 2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sprite(color, size) {
    var key = color + '_' + size;
    if (sparkCache[key]) return sparkCache[key];
    var s = size * 2, c = document.createElement('canvas');
    c.width = s; c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.28, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill();
    sparkCache[key] = c;
    return c;
  }

  function spawn() {
    if (pool.length) return pool.pop();
    return { x: 0, y: 0, vx: 0, vy: 0, life: 0, ttl: 1, size: 4, color: '#fff', grav: 0, drag: 0.99, rot: 0, vr: 0, kind: 'spark', a: 1 };
  }
  function release(p) {
    if (pool.length < 400) pool.push(p);
  }

  function add(o) {
    if (parts.length >= MAX) return null;
    var p = spawn();
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = 0; p.ttl = o.ttl || 0.7;
    p.size = o.size || 5;
    p.color = o.color || '#fff';
    p.grav = o.grav == null ? 260 : o.grav;
    p.drag = o.drag == null ? 0.985 : o.drag;
    p.rot = o.rot || 0; p.vr = o.vr || 0;
    p.kind = o.kind || 'spark';
    p.a = o.a == null ? 1 : o.a;
    p.square = !!o.square;
    parts.push(p);
    return p;
  }

  /* ---------------- 公共特效 ---------------- */
  function splash(x, y, n, opt) {
    opt = opt || {};
    n = Math.round((n || 14) * enabled);
    var col = opt.color || '#8fe6ff';
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 260;
      add({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70,
        ttl: 0.42 + Math.random() * 0.4, size: 4 + Math.random() * 7,
        color: i % 3 === 0 ? '#ffffff' : col, grav: 520, drag: 0.965
      });
    }
  }
  function burst(x, y, color, n, opt) {
    opt = opt || {};
    n = Math.round((n || 12) * enabled);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (opt.speed || 140) * (0.4 + Math.random());
      add({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        ttl: 0.35 + Math.random() * 0.45, size: 3 + Math.random() * 6,
        color: color || '#ffd166', grav: opt.grav == null ? 120 : opt.grav, drag: 0.955
      });
    }
  }
  function dust(x, y, n) {
    n = Math.round((n || 6) * enabled);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      add({
        x: x, y: y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 30 - 20,
        ttl: 0.4 + Math.random() * 0.3, size: 5 + Math.random() * 7,
        color: 'rgba(220,230,255,.5)', grav: -20, drag: 0.94
      });
    }
  }
  function text(x, y, str, color) {
    texts.push({ x: x, y: y, str: String(str), color: color || '#fff', life: 0, ttl: 1.05 });
  }
  function ring(x, y, color, opt) {
    opt = opt || {};
    rings.push({ x: x, y: y, color: color || '#8fe6ff', life: 0, ttl: opt.ttl || 0.5, r0: opt.r0 || 8, r1: opt.r1 || 78, lw: opt.lw || 5 });
  }
  function confetti(n) {
    n = Math.round((n || 90) * enabled);
    var cols = ['#5fd8ff', '#ff6fa5', '#a6f06a', '#ffc94d', '#a98bff', '#ffffff'];
    for (var i = 0; i < n; i++) {
      add({
        x: Math.random() * W, y: -20 - Math.random() * 120,
        vx: (Math.random() - .5) * 90, vy: 80 + Math.random() * 160,
        ttl: 2.6 + Math.random() * 1.6, size: 5 + Math.random() * 7,
        color: cols[i % cols.length], grav: 130, drag: 0.995,
        rot: Math.random() * 7, vr: (Math.random() - .5) * 9, square: true, kind: 'confetti'
      });
    }
  }
  function shake(a) {
    if (!enabled) return;
    shakeAmp = Math.min(18, Math.max(shakeAmp, a * (BA.CORE.CFG.get().shake || 0)));
  }
  function clear() {
    parts.length = 0; texts.length = 0; rings.length = 0; shakeAmp = 0;
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  /* ---------------- 更新 / 绘制 ---------------- */
  function update(dt) {
    if (dt > 0.06) dt = 0.06;
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      if (p.life >= p.ttl) { release(parts[i]); parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      var d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (var j = texts.length - 1; j >= 0; j--) {
      var t = texts[j];
      t.life += dt;
      t.y -= 42 * dt;
      if (t.life >= t.ttl) texts.splice(j, 1);
    }
    for (var k = rings.length - 1; k >= 0; k--) {
      var r = rings[k];
      r.life += dt;
      if (r.life >= r.ttl) rings.splice(k, 1);
    }
    if (shakeAmp > 0) {
      shakeAmp *= Math.pow(0.0015, dt);
      if (shakeAmp < 0.15) shakeAmp = 0;
    }
  }

  function draw(c) {
    var x = c || ctx;
    if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    if (shakeAmp > 0.1) {
      x.translate((Math.random() - .5) * shakeAmp, (Math.random() - .5) * shakeAmp);
    }
    // 环
    x.globalCompositeOperation = 'lighter';
    for (var k = 0; k < rings.length; k++) {
      var r = rings[k], pr = r.life / r.ttl;
      var rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - pr, 2));
      x.globalAlpha = (1 - pr) * 0.75;
      x.strokeStyle = r.color;
      x.lineWidth = r.lw * (1 - pr * 0.7);
      x.beginPath(); x.arc(r.x, r.y, rad, 0, 7); x.stroke();
    }
    // 粒子
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var pr2 = p.life / p.ttl;
      var alpha = (1 - pr2) * p.a;
      if (p.kind === 'confetti') {
        x.globalCompositeOperation = 'source-over';
        x.globalAlpha = Math.min(1, alpha * 1.4);
        x.save();
        x.translate(p.x, p.y);
        x.rotate(p.rot);
        x.fillStyle = p.color;
        x.fillRect(-p.size / 2, -p.size / 3.4, p.size, p.size / 1.7);
        x.restore();
        continue;
      }
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = alpha;
      var s = sprite(p.color, 16);
      var sz = p.size * (1 + pr2 * 0.4);
      x.drawImage(s, p.x - sz, p.y - sz, sz * 2, sz * 2);
    }
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;

    // 浮字
    for (var j = 0; j < texts.length; j++) {
      var t = texts[j], tp = t.life / t.ttl;
      var a2 = tp < 0.12 ? tp / 0.12 : (1 - Math.max(0, (tp - 0.55) / 0.45));
      x.globalAlpha = Math.max(0, a2);
      x.font = '800 26px ui-monospace, monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = 'rgba(6,10,22,.72)';
      x.strokeText(t.str, t.x, t.y);
      x.fillStyle = t.color;
      x.fillText(t.str, t.x, t.y);
    }
    x.globalAlpha = 1;
    x.textBaseline = 'alphabetic';
  }

  BA.FX = {
    init: init,
    resize: resize,
    splash: splash, burst: burst, dust: dust, text: text, ring: ring,
    confetti: confetti, shake: shake, clear: clear,
    update: update, draw: draw,
    setEnabled: function (v) { enabled = v ? 1 : 0; },
    get canvas() { return canvas; },
    get count() { return parts.length; }
  };
})(window);
