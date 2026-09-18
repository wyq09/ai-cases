/* bull-flight fx —— Canvas 粒子：金币/羽毛/扑翅尘/浮字（对象池，无 shadowBlur） */
(function () {
  window.BF = window.BF || {};
  var pool = [], texts = [];
  var MAX = 160;
  function get() {
    if (pool.length) return pool.pop();
    return {};
  }
  function rel(p) { if (pool.length < MAX) pool.push(p); }
  function burst(x, y, type) {
    var n = type === 'coin' ? 10 : type === 'feather' ? 7 : type === 'wing' ? 4 : 6;
    for (var i = 0; i < n; i++) {
      var p = get();
      var a = Math.random() * 6.283, sp = 60 + Math.random() * 160;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp * (type === 'wing' ? 0.4 : 1);
      p.vy = Math.sin(a) * sp - (type === 'coin' ? 120 : 40);
      p.g = type === 'feather' ? 160 : 420;
      p.life = p.max = type === 'coin' ? 0.8 : type === 'feather' ? 1.1 : 0.5;
      p.rot = Math.random() * 6.283; p.vr = (Math.random() - 0.5) * 8;
      if (type === 'coin') { p.kind = 'coin'; p.col = i % 3 ? '#f5c04a' : '#ffe08a'; p.r = 4 + Math.random() * 3; }
      else if (type === 'feather') { p.kind = 'feather'; p.col = '#f4efe6'; p.r = 5 + Math.random() * 4; }
      else if (type === 'dust') { p.kind = 'dot'; p.col = '#9aa4b2'; p.r = 2.5 + Math.random() * 2; }
      else { p.kind = 'dot'; p.col = 'rgba(232,201,143,0.9)'; p.r = 2 + Math.random() * 2.5; }
      live.push(p);
    }
  }
  var live = [];
  function floatText(x, y, str, color) {
    texts.push({ kind: 'text', x: x, y: y, str: str, col: color || '#fff', life: 1.1, max: 1.1, vy: -46 });
  }
  function step(dt, ctx) {
    for (var i = live.length - 1; i >= 0; i--) {
      var p = live[i];
      p.life -= dt;
      if (p.life <= 0) { live.splice(i, 1); rel(p); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.g || 0) * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.kind === 'feather') { p.vx *= 0.98; p.vy = Math.min(p.vy, 90); }
    }
    for (i = texts.length - 1; i >= 0; i--) {
      var t = texts[i];
      t.life -= dt;
      if (t.life <= 0) { texts.splice(i, 1); continue; }
      t.y += (t.vy || -46) * dt;
    }
  }
  function draw(ctx) {
    var i, p;
    for (i = 0; i < live.length; i++) {
      p = live[i];
      var a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      if (p.kind === 'coin') {
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * (0.6 + 0.4 * Math.abs(Math.cos(p.rot))), 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(122,84,20,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (p.kind === 'feather') {
        ctx.rotate(Math.sin(p.life * 5) * 0.6 + p.rot * 0.2);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.42, 0.4, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(120,100,70,0.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-p.r, 0); ctx.lineTo(p.r, 0); ctx.stroke();
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 17px -apple-system,system-ui';
    for (i = 0; i < texts.length; i++) {
      var t = texts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life / t.max));
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,14,0.75)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  window.BF.FX = { burst: burst, floatText: floatText, step: step, draw: draw };
})();
