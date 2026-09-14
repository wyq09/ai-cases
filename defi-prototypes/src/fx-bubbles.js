/* fx-bubbles.js — 玻璃泡泡引擎
   预渲染玻璃质感精灵（边缘亮环+内反射弧+左上高光），rise 升腾 / cluster 星团两种模式，
   点击爆开（扩散环+水珠粒子+音效）。DPR≤2、无 shadowBlur、离屏缓存、离屏/隐藏自动暂停。 */
(function () {
'use strict';
const SW = window.SW;
SW.fx = SW.fx || {};
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const spriteCache = new Map();

/* 玻璃泡泡精灵：tint="r,g,b" */
function sprite(r, tint) {
  if (!(r > 0.3)) r = 0.3;
  const key = Math.round(r) + '|' + tint;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = Math.ceil(r * 2 * DPR) + 2;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = S / 2;
  const x = cv.getContext('2d');
  const [tr, tg, tb] = tint.split(',').map(Number);
  // 主体：中心透明 → 边缘亮环
  const g = x.createRadialGradient(c, c, r * 0.5, c, c, r);
  g.addColorStop(0, 'rgba(' + tint + ',0)');
  g.addColorStop(0.62, 'rgba(' + tint + ',0.04)');
  g.addColorStop(0.8, 'rgba(' + tint + ',0.12)');
  g.addColorStop(0.9, 'rgba(' + tint + ',0.32)');
  g.addColorStop(0.97, 'rgba(' + Math.min(255, tr + 40) + ',' + Math.min(255, tg + 40) + ',' + Math.min(255, tb + 45) + ',0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0.75)');
  x.fillStyle = g;
  x.beginPath(); x.arc(c, c, r, 0, 7); x.fill();
  // 内部轻微填充（玻璃厚度感）
  const g2 = x.createRadialGradient(c, c + r * 0.25, r * 0.1, c, c, r * 0.92);
  g2.addColorStop(0, 'rgba(' + tint + ',0.10)');
  g2.addColorStop(0.7, 'rgba(' + tint + ',0.02)');
  g2.addColorStop(1, 'rgba(' + tint + ',0)');
  x.fillStyle = g2;
  x.beginPath(); x.arc(c, c, r * 0.92, 0, 7); x.fill();
  // 右下内反射弧
  x.strokeStyle = 'rgba(255,255,255,0.32)';
  x.lineWidth = Math.max(1, r * 0.055);
  x.lineCap = 'round';
  x.beginPath(); x.arc(c, c, r * 0.78, Math.PI * 0.18, Math.PI * 0.62); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.16)';
  x.lineWidth = Math.max(1, r * 0.04);
  x.beginPath(); x.arc(c, c, r * 0.68, Math.PI * 0.24, Math.PI * 0.5); x.stroke();
  // 左上主高光（椭圆）
  x.save();
  x.translate(c - r * 0.38, c - r * 0.44);
  x.rotate(-0.6);
  const hg = x.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(0.55, 'rgba(255,255,255,0.4)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hg;
  x.beginPath(); x.ellipse(0, 0, r * 0.3, r * 0.19, 0, 0, 7); x.fill();
  x.restore();
  // 次高光小点
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.beginPath(); x.arc(c + r * 0.18, c - r * 0.52, Math.max(0.8, r * 0.045), 0, 7); x.fill();
  spriteCache.set(key, cv);
  return cv;
}

function rand(a, b) { if (b < a) { const t = a; a = b; b = t; } return a + Math.random() * (b - a); }

/**
 * SW.fx.bubbles(host, opts)
 * mode 'rise': 从底部升起漂浮；mode 'cluster': 绕 center 星团抖动
 */
SW.fx.bubbles = function (host, opts) {
  const o = Object.assign({
    count: 14, minR: 14, maxR: 72, speed: 0.3,
    tint: '215,215,255', interactive: true,
    mode: 'rise', center: null, z: 1, alpha: 1
  }, opts || {});

  const cv = document.createElement('canvas');
  const pos = o.mode === 'cluster' ? 'absolute' : 'absolute';
  // canvas 永远穿透点击（不拦截宿主内按钮）；命中判定挂在宿主 capture 上
  cv.style.cssText = 'position:' + pos + ';inset:0;width:100%;height:100%;pointer-events:none;z-index:' + o.z;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(cv);
  const x = cv.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(2, r.width); H = Math.max(2, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();

  const bubbles = [], drops = [], rings = [];
  function spawn(initial) {
    const r = rand(o.minR, o.maxR);
    const b = {
      r,
      x: rand(r, W - r), y: initial ? rand(0, H) : H + r + rand(0, 60),
      vy: rand(0.6, 1.15) * (r / o.maxR) * o.speed * 60 / 60,
      ph: rand(0, 6.28), drift: rand(6, 22), ws: rand(0.3, 0.8),
      a: rand(0.55, 0.95) * o.alpha, sq: rand(0.9, 1.1)
    };
    if (o.mode === 'cluster' && o.center) {
      const ang = rand(0, 6.28), rad = Math.sqrt(Math.random()) * o.center.r;
      b.cx = o.center.x + Math.cos(ang) * rad; b.cy = o.center.y + Math.sin(ang) * rad;
      b.x = b.cx; b.y = b.cy;
      b.or = Math.hypot(b.cx - o.center.x, b.cy - o.center.y);
      b.oa = Math.atan2(b.cy - o.center.y, b.cx - o.center.x);
      b.r = Math.min(b.r, rand(o.minR, Math.max(o.minR + 4, o.center.r * 0.42)));
    }
    return b;
  }
  for (let i = 0; i < o.count; i++) bubbles.push(spawn(true));

  /* 爆开水珠 */
  function burst(px, py, n) {
    n = n || 9;
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), sp = rand(0.6, 2.6);
      drops.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, r: rand(1.2, 3.4), life: 1 });
    }
    rings.push({ x: px, y: py, r: 4, life: 1 });
    SW.audio.pop();
  }

  let visible = true, running = true, t0 = performance.now();
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { rootMargin: '80px' });
  io.observe(host);

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (!visible || document.hidden) return;
    const t = now / 1000;
    x.clearRect(0, 0, W, H);
    // 泡泡
    for (const b of bubbles) {
      if (o.mode === 'rise') {
        b.y -= b.vy * dt * 60 * 0.55;
        b.x += Math.sin(t * b.ws + b.ph) * b.drift * dt;
        const wob = 1 + Math.sin(t * 1.7 + b.ph) * 0.035;
        if (b.y < -b.r * 1.5) Object.assign(b, spawn(false));
        const sp = sprite(b.r, o.tint);
        x.globalAlpha = b.a;
        const rr = Math.max(0.5, b.r * b.sq * wob);
        x.drawImage(sp, b.x - rr, b.y - rr, rr * 2, rr * 2);
      } else {
        // cluster：绕心缓慢公转 + 径向呼吸
        const oa = b.oa + Math.sin(t * 0.22 + b.ph) * 0.09;
        const or2 = b.or * (1 + Math.sin(t * 0.6 + b.ph) * 0.055);
        b.x = (o.center ? o.center.x : W / 2) + Math.cos(oa) * or2;
        b.y = (o.center ? o.center.y : H / 2) + Math.sin(oa) * or2 * 0.86;
        const wob = 1 + Math.sin(t * 1.9 + b.ph * 2) * 0.04;
        const sp = sprite(b.r, o.tint);
        x.globalAlpha = b.a * 0.96;
        const rr = Math.max(0.5, b.r * wob);
        x.drawImage(sp, b.x - rr, b.y - rr, rr * 2, rr * 2);
      }
    }
    x.globalAlpha = 1;
    // 水珠粒子
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.x += d.vx; d.y += d.vy; d.vy += 0.055; d.life -= dt * 1.5;
      if (d.life <= 0) { drops.splice(i, 1); continue; }
      const dr = Math.max(0.2, d.r * (0.5 + d.life * 0.5));
      x.globalAlpha = Math.max(0, d.life) * 0.9;
      x.fillStyle = 'rgba(255,255,255,0.95)';
      x.beginPath(); x.arc(d.x, d.y, dr, 0, 7); x.fill();
      x.strokeStyle = 'rgba(' + o.tint + ',0.8)'; x.lineWidth = 1;
      x.beginPath(); x.arc(d.x, d.y, dr + 0.8, 0, 7); x.stroke();
    }
    // 扩散环
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.r += dt * 60; rg.life -= dt * 2.4;
      if (rg.life <= 0) { rings.splice(i, 1); continue; }
      x.globalAlpha = rg.life * 0.75;
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(rg.x, rg.y, rg.r, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(' + o.tint + ',0.9)'; x.lineWidth = 3.4;
      x.globalAlpha = rg.life * 0.3;
      x.beginPath(); x.arc(rg.x, rg.y, rg.r * 0.82, 0, 7); x.stroke();
    }
    x.globalAlpha = 1;
  }
  requestAnimationFrame(frame);

  // 点击爆开：宿主 capture 捕获，命中最上层泡泡则爆开；不阻止下层元素的默认点击
  if (o.interactive) {
    host.addEventListener('pointerdown', e => {
      const r = host.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (Math.hypot(px - b.x, py - b.y) <= b.r * 1.06) {
          burst(b.x, b.y, Math.round(6 + b.r / 9));
          bubbles[i] = spawn(o.mode !== 'rise');
          return;
        }
      }
    }, true);
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(resize);
    ro.observe(host);
  }
  window.addEventListener('resize', resize);

  return {
    destroy() { running = false; io.disconnect(); if (ro) ro.disconnect(); cv.remove(); },
    burst,
    canvas: cv
  };
};
})();
