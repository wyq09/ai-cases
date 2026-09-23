/* sheep-a-sheep fx —— Canvas 粒子（星屑/彩纸/圆环/飘字），对象池，禁 shadowBlur */
window.SH = window.SH || {};
SH.FX = (function () {
  'use strict';

  var pool = [], MAXN = 320;
  var confettiOn = false, confettiT = 0;
  var W = 0, H = 0;

  function resize(w, h) { W = w; H = h; }
  function clear() { pool.length = 0; confettiOn = false; }

  function spawn(p) { if (pool.length < MAXN) pool.push(p); }

  // 星屑爆发（消除/道具）
  function burst(x, y, color, n) {
    n = n || 14;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180;
      spawn({
        t: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        g: 320, life: 0.5 + Math.random() * 0.35, age: 0,
        size: 2 + Math.random() * 3.5, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 10,
        color: color || '#E8B84B',
      });
    }
  }

  // 扩散圆环（消除中心）
  function ring(x, y, color) {
    spawn({ t: 'ring', x: x, y: y, life: 0.38, age: 0, size: 8, color: color || '#FFFFFF' });
  }

  // 飘字
  function float(x, y, text, color, size) {
    spawn({ t: 'text', x: x, y: y, vy: -56, life: 0.8, age: 0, text: text, color: color || '#FFF7E6', size: size || 22 });
  }

  // 过关彩纸：从顶部撒 1.6s
  function confetti() { confettiOn = true; confettiT = 1.6; }

  function step(dt) {
    if (confettiOn) {
      confettiT -= dt;
      if (confettiT <= 0) confettiOn = false;
      if (Math.random() < 0.7) {
        spawn({
          t: 'paper', x: Math.random() * W, y: -12,
          vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 130, g: 30,
          life: 3.4, age: 0, size: 4 + Math.random() * 5, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 8,
          color: ['#E8B84B', '#8FBF6B', '#E88B5B', '#F5F0E4', '#D9A3A3'][(Math.random() * 5) | 0],
        });
      }
    }
    for (var i = pool.length - 1; i >= 0; i--) {
      var p = pool[i];
      p.age += dt;
      if (p.age >= p.life) { pool.splice(i, 1); continue; }
      if (p.t === 'spark' || p.t === 'paper') {
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      } else if (p.t === 'text') {
        p.y += p.vy * dt;
      }
    }
  }

  function draw(ctx) {
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      var k = 1 - p.age / p.life;
      if (p.t === 'spark') {
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.t === 'ring') {
        ctx.save();
        ctx.globalAlpha = k * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - k) * 46, 0, 6.3);
        ctx.stroke();
        ctx.restore();
      } else if (p.t === 'text') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = p.color;
        ctx.font = '700 ' + p.size + 'px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      } else if (p.t === 'paper') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 3);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
  }

  return { resize: resize, clear: clear, burst: burst, ring: ring, float: float, confetti: confetti, step: step, draw: draw };
})();
