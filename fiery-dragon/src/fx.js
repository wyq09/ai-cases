/* =========================================================================
 * FIERY DRAGON 火龙珠水果机 — FX 粒子特效层（Canvas2D，独立叠加层）
 * 契约: window.FX = { init, coinBurst, coinRain, confetti, spark,
 *                     flash, ring, bigText, stopAll }
 * 硬性约束:
 *   - 禁用 ctx.shadowBlur（手机 GPU 杀手）；辉光一律用 createRadialGradient
 *     预渲染贴图 / 多层半透明圆叠加。
 *   - 金币启动时预渲染 3 帧离屏贴图，粒子只做 drawImage 旋转/缩放/抛物线，
 *     coinBurst 单次 200 枚不掉帧。
 *   - 对象池预分配 + 活跃标记，热路径零对象创建，避免 GC 卡顿。
 *   - 坐标系对外一律为视口 css 像素，内部乘 dpr。
 * ========================================================================= */
window.FX = (() => {
  'use strict';

  const TAU = Math.PI * 2;
  const POOL_MAX = 1500;               // 池容量：够 200 金币 + 大雨 + 彩带 + 星光
  const T_COIN = 1, T_CONF = 2, T_SPARK = 3, T_RING = 4, T_FLASH = 5;

  // ---------- 运行时状态（无 DOM 环境下保持空安全，API 自动降级 no-op） ----------
  let cv = null, ctx = null;
  let dpr = 1, W = 0, H = 0;
  let rafId = 0, last = -1;
  let live = false;                    // 引擎是否已初始化

  const pool = [];                     // 粒子对象池（预分配，形状单一）
  let cursor = 0;                      // 池扫描游标
  const texts = [];                    // bigText 层（并发极少，小数组）

  let coinSpr = [];                    // 预渲染金币帧 [canvas x3]
  const glowCache = Object.create(null); // color -> 辉光贴图缓存

  // =========================================================
  // 工具
  // =========================================================
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // rAF 经 window 取用（无 rAF 环境返回 0，循环自然不启动）
  function raf(cb) {
    return (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
      ? window.requestAnimationFrame(cb) : 0;
  }
  function caf(id) {
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
  }

  // 颜色 -> rgba 字符串（支持 #rgb/#rrggbb/rgb()/rgba()，其余兜底白色）
  function toRgba(col, a) {
    if (typeof col !== 'string') return 'rgba(255,255,255,' + a + ')';
    const s = col.trim();
    if (s.charCodeAt(0) === 35) { // '#'
      let h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length !== 6) return 'rgba(255,255,255,' + a + ')';
      const n = parseInt(h, 16);
      if (isNaN(n)) return 'rgba(255,255,255,' + a + ')';
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',');
      return 'rgba(' + (parseFloat(p[0]) | 0) + ',' + (parseFloat(p[1]) | 0) + ',' +
        (parseFloat(p[2]) | 0) + ',' + a + ')';
    }
    return 'rgba(255,255,255,' + a + ')';
  }

  // 十六进制色解析 -> [r,g,b] / null
  function parseHex(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim();
    if (h.charCodeAt(0) !== 35) return null;
    h = h.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // 颜色向目标 RGB 靠近 k（0~1），用于金字的亮/暗渐变
  function mixCol(hex, tgt, k) {
    const c = parseHex(hex);
    if (!c) return hex;
    return 'rgb(' + Math.round(c[0] + (tgt[0] - c[0]) * k) + ',' +
      Math.round(c[1] + (tgt[1] - c[1]) * k) + ',' +
      Math.round(c[2] + (tgt[2] - c[2]) * k) + ')';
  }

  // 五角星路径
  function starPath(g, cx, cy, R, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = (i & 1) ? r : R;
      const a = rot + Math.PI * i / 5;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }

  // easeOutBack（大字弹入回弹）
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }
  function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }

  // =========================================================
  // 预渲染：辉光贴图（径向渐变，替代 shadowBlur）
  // =========================================================
  function glowSprite(color) {
    let s = glowCache[color];
    if (s) return s;
    const S = 64;
    s = document.createElement('canvas');
    s.width = s.height = S;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, toRgba(color, 1));
    gr.addColorStop(0.28, toRgba(color, 0.5));
    gr.addColorStop(1, toRgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    glowCache[color] = s;
    return s;
  }

  // =========================================================
  // 预渲染：金币贴图 3 帧（金渐变圆 + 浮雕边 + 齿点 + 星纹 + 高光弧）
  // =========================================================
  function makeCoinSprite(S, f) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const m = S / 2, R = m - 2;

    // 主盘：左上光源径向渐变
    const grad = g.createRadialGradient(m - R * 0.35, m - R * 0.45, R * 0.12, m, m, R);
    grad.addColorStop(0, '#fff7cf');
    grad.addColorStop(0.4, '#ffd94e');
    grad.addColorStop(0.78, '#f3a41a');
    grad.addColorStop(1, '#bf6a06');
    g.fillStyle = grad;
    g.beginPath(); g.arc(m, m, R, 0, TAU); g.fill();

    // 外浮雕暗环
    const rim = S * 0.075;
    g.lineWidth = rim;
    g.strokeStyle = '#a35a05';
    g.beginPath(); g.arc(m, m, R - rim / 2, 0, TAU); g.stroke();

    // 边齿点（三帧相位错开）
    const dots = 12, da = TAU / dots, off = f * da / 3;
    g.fillStyle = 'rgba(120,56,2,0.5)';
    for (let i = 0; i < dots; i++) {
      const a = off + i * da;
      g.beginPath();
      g.arc(m + Math.cos(a) * R * 0.9, m + Math.sin(a) * R * 0.9, S * 0.028, 0, TAU);
      g.fill();
    }

    // 内亮环
    g.lineWidth = S * 0.05;
    g.strokeStyle = 'rgba(255,246,190,0.85)';
    g.beginPath(); g.arc(m, m, R * 0.72, 0, TAU); g.stroke();

    // 中央星纹（暗偏移做浮雕底 + 亮描边）
    const rot = f * 0.55;
    starPath(g, m + S * 0.022, m + S * 0.028, R * 0.46, R * 0.19, rot);
    g.fillStyle = 'rgba(140,74,4,0.85)'; g.fill();
    starPath(g, m, m, R * 0.46, R * 0.19, rot);
    g.fillStyle = '#e9990b'; g.fill();
    g.lineWidth = S * 0.02;
    g.strokeStyle = 'rgba(255,240,176,0.95)'; g.stroke();

    // 顶部高光弧（三帧角度略移，转动时更闪）
    const ha = -2.25 + f * 0.35;
    g.lineWidth = S * 0.07;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.arc(m, m, R * 0.84, ha, ha + 0.9); g.stroke();

    return c;
  }

  function ensureSprites() {
    if (coinSpr.length) return;
    const S = 96; // 离屏 96px，绘制时缩到 ~22-38css px，抗锯齿且省显存
    coinSpr = [makeCoinSprite(S, 0), makeCoinSprite(S, 1), makeCoinSprite(S, 2)];
  }

  // =========================================================
  // 对象池
  // =========================================================
  function initPool() {
    for (let i = 0; i < POOL_MAX; i++) {
      pool.push({
        on: false, type: 0,
        x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0,
        t: 0, life: 1, delay: 0, size: 0, a: 1,
        rot: 0, vr: 0, flip: 0, vf: 0, frame: 0,
        w: 0, h: 0, amp: 0, freq: 0, ph: 0,
        color: '', a0: 0, maxR: 0
      });
    }
  }

  function spawn() {
    for (let i = 0; i < POOL_MAX; i++) {
      cursor = (cursor + 1) % POOL_MAX;
      const p = pool[cursor];
      if (!p.on) { p.on = true; return p; }
    }
    return null; // 池满丢弃（比卡帧好）
  }

  // =========================================================
  // 主循环
  // =========================================================
  function tick(now) {
    rafId = raf(tick);
    if (last < 0) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // 切后台回来防跳变
    if (dt <= 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 第一遍：普通粒子（第二遍画全屏 flash，保证盖在最上）
    let flashSeen = false;
    for (let i = 0; i < POOL_MAX; i++) {
      const p = pool[i];
      if (!p.on) continue;
      if (p.type === T_FLASH) { flashSeen = true; continue; }
      step(p, dt);
      if (p.on) draw(p);
    }
    if (flashSeen) {
      for (let i = 0; i < POOL_MAX; i++) {
        const p = pool[i];
        if (p.on && p.type === T_FLASH) { step(p, dt); if (p.on) draw(p); }
      }
    }

    drawTexts(dt);
  }

  function step(p, dt) {
    if (p.delay > 0) { p.delay -= dt; return; }
    p.t += dt;
    if (p.t >= p.life) { p.on = false; return; }

    switch (p.type) {
      case T_COIN:
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        if (p.y - p.size > H + 8 || p.x < -80 || p.x > W + 80) p.on = false; // 落出屏底
        break;
      case T_CONF:
        p.vy += p.g * dt;
        p.y += p.vy * dt;
        p.x += (p.vx + Math.sin(p.t * p.freq + p.ph) * p.amp) * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        if (p.y > H + 24) p.on = false;
        break;
      case T_SPARK: {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        break;
      }
      case T_RING:
      case T_FLASH:
        break;
    }
  }

  function draw(p) {
    if (p.delay > 0) return;
    const k = p.t / p.life; // 0..1 生命周期进度

    switch (p.type) {
      case T_COIN: {
        const spr = coinSpr[p.frame] || coinSpr[0];
        const sx = Math.max(0.18, Math.abs(Math.cos(p.flip))); // 翻转的横向压扁
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(sx, 1);
        ctx.drawImage(spr, -p.size, -p.size, p.size * 2, p.size * 2);
        ctx.restore();
        break;
      }
      case T_CONF: {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.sin(p.flip) * 0.92 + 0.08); // 翻面
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; // 上缘高光
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.34);
        ctx.restore();
        break;
      }
      case T_SPARK: {
        const fade = 1 - k;
        const s = p.size * (0.5 + 0.5 * fade);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * 0.9;
        const spr = glowSprite(p.color);
        const gs = s * 6;
        ctx.drawImage(spr, p.x - gs / 2, p.y - gs / 2, gs, gs);
        // 亮核
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.55, 0, TAU);
        ctx.fill();
        ctx.restore();
        break;
      }
      case T_RING: {
        const e = easeOutCubic(k);
        const r = p.maxR * e;
        const fade = 1 - k;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // 多层半透明描边叠加出辉光（无 shadowBlur）
        ctx.globalAlpha = fade * 0.22;
        ctx.lineWidth = 14 * fade + 3;
        ctx.strokeStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fade * 0.5;
        ctx.lineWidth = 6 * fade + 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fade * 0.95;
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#fff8dc';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        ctx.restore();
        break;
      }
      case T_FLASH: {
        ctx.globalAlpha = p.a0 * Math.pow(1 - k, 1.6); // 快速淡出
        ctx.fillStyle = p.color;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  // =========================================================
  // bigText：中央大字冲屏（缩放弹入 + 微浮动 + 淡出，金色立体描边）
  // =========================================================
  function drawTexts(dt) {
    for (let i = texts.length - 1; i >= 0; i--) {
      const o = texts[i];
      o.t += dt;
      if (o.t >= o.dur) { texts.splice(i, 1); continue; }

      const IN = 0.32, OUT = 0.38;
      let sc, alpha = 1;
      if (o.t < IN) sc = easeOutBack(o.t / IN);                       // 弹入（带回弹）
      else {
        sc = 1;
        const left = o.dur - o.t;
        if (left < OUT) alpha = left / OUT;                            // 淡出
      }
      const hold = clamp(o.t - IN, 0, 10);
      const bx = o.nx * W, by = o.ny * H;
      const fy = by + Math.sin(hold * 5) * o.px * 0.035;               // 微浮动
      const scale = sc * o.scale * (o.t < IN ? 1 : 1 + (o.t - IN) * 0.012);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(bx, fy);
      ctx.scale(scale, scale);

      const px = o.px;
      const font = '900 ' + px + 'px "Arial Black","Arial Bold",Gadget,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      // 辉光垫底：多层半透明重绘（无 shadowBlur）
      ctx.globalAlpha = alpha * 0.16;
      ctx.fillStyle = o.glow;
      for (let r = 1; r <= 3; r++) {
        ctx.font = '900 ' + (px + r * px * 0.055) + 'px "Arial Black","Arial Bold",Gadget,"PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText(o.text, 0, 0);
      }
      ctx.font = font;

      // 立体深度（右下暗色位移多层）
      const depth = clamp(Math.round(px * 0.055), 3, 7);
      ctx.fillStyle = o.dark;
      for (let d = depth; d >= 1; d--) ctx.fillText(o.text, d * 0.9, d);
      // 外描边
      ctx.lineWidth = Math.max(3, px * 0.085);
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(o.text, 0, 0);
      // 金渐变主体
      const gr = ctx.createLinearGradient(0, -px * 0.5, 0, px * 0.5);
      gr.addColorStop(0, o.light);
      gr.addColorStop(0.52, o.main);
      gr.addColorStop(1, o.dark2);
      ctx.fillStyle = gr;
      ctx.fillText(o.text, 0, 0);
      // 顶部高光细描
      ctx.lineWidth = Math.max(1, px * 0.02);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.strokeText(o.text, 0, 0);

      // 副标题小字
      if (o.sub) {
        const spx = px * 0.3;
        ctx.font = '700 ' + spx + 'px "PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';
        ctx.lineWidth = Math.max(2, spx * 0.16);
        ctx.strokeStyle = 'rgba(58,18,0,0.9)';
        ctx.strokeText(o.sub, 0, px * 0.82);
        ctx.fillStyle = '#fff6dc';
        ctx.fillText(o.sub, 0, px * 0.82);
      }
      ctx.restore();
    }
  }

  // =========================================================
  // 尺寸 / 可见性
  // =========================================================
  function resize() {
    if (!cv) return;
    const iw = (window.innerWidth || 0) || (document.documentElement && document.documentElement.clientWidth) || 375;
    const ih = (window.innerHeight || 0) || (document.documentElement && document.documentElement.clientHeight) || 667;
    W = iw; H = ih;
    dpr = clamp(window.devicePixelRatio || 1, 1, 2); // 钳制 ≤2
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }

  function onVis() {
    if (!live) return;
    if (document.hidden) {
      if (rafId) { caf(rafId); rafId = 0; }
    } else if (!rafId) {
      last = -1;
      rafId = raf(tick);
    }
  }

  // =========================================================
  // 公开 API
  // =========================================================
  function init(hostEl) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return; // 无 DOM 降级
    if (cv) { resize(); return; } // 幂等
    const parent = hostEl || document.body;
    if (!parent) return;

    cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;' +
      'z-index:99999;pointer-events:none;display:block;';
    parent.appendChild(cv);
    ctx = cv.getContext('2d');
    if (!ctx) { parent.removeChild(cv); cv = null; return; }

    ensureSprites();
    if (!pool.length) initPool();
    resize();
    live = true;

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);
    }
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVis);
    }
    last = -1;
    rafId = raf(tick);
  }

  // 金币喷泉：从 (x,y) 抛物线喷出、落出屏底
  // opt { spread:水平散布px/s, up:初始向上速度px/s, gravity:重力px/s^2 }
  function coinBurst(x, y, n, opt) {
    if (!ctx) return;
    n = clamp(n | 0, 0, 400);
    opt = opt || {};
    const spread = typeof opt.spread === 'number' ? opt.spread : 250;
    const up = typeof opt.up === 'number' ? opt.up : 780;
    const grav = typeof opt.gravity === 'number' ? opt.gravity : 1600;
    for (let i = 0; i < n; i++) {
      const p = spawn();
      if (!p) return;
      p.type = T_COIN;
      p.x = x + rand(-8, 8);
      p.y = y + rand(-6, 6);
      p.vx = rand(-spread, spread);
      p.vy = -up * rand(0.55, 1.05) * Math.sin(rand(0.9, 1.4));
      p.g = grav * rand(0.9, 1.1);
      p.t = 0; p.life = 6;
      p.size = rand(11, 19);
      p.rot = rand(0, TAU);
      p.vr = rand(-7, 7);
      p.flip = rand(0, TAU);
      p.vf = rand(6, 13) * (Math.random() < 0.5 ? -1 : 1);
      p.frame = (Math.random() * coinSpr.length) | 0;
      p.delay = 0;
      p.a = 1;
    }
  }

  // 金币雨：顶部随机 x 落下（带错峰延迟）
  function coinRain(n) {
    if (!ctx) return;
    n = clamp(n | 0, 0, 300);
    for (let i = 0; i < n; i++) {
      const p = spawn();
      if (!p) return;
      p.type = T_COIN;
      p.x = rand(10, W - 10);
      p.y = rand(-40, -20);
      p.vx = rand(-45, 45);
      p.vy = rand(40, 160);
      p.g = rand(750, 1000);
      p.t = 0; p.life = 6;
      p.size = rand(9, 16);
      p.rot = rand(0, TAU);
      p.vr = rand(-5, 5);
      p.flip = rand(0, TAU);
      p.vf = rand(5, 11) * (Math.random() < 0.5 ? -1 : 1);
      p.frame = (Math.random() * coinSpr.length) | 0;
      p.delay = rand(0, 1.3); // 错峰，避免一帧全砸下来
      p.a = 1;
    }
  }

  // 彩带纸屑：矩形翻转飘落（红/金/青/紫）
  function confetti(n) {
    if (!ctx) return;
    n = clamp(n | 0, 0, 400);
    const colors = ['#ff4d4d', '#ffd94e', '#3de0e0', '#a06bff', '#ff8a3d'];
    for (let i = 0; i < n; i++) {
      const p = spawn();
      if (!p) return;
      p.type = T_CONF;
      p.x = rand(0, W);
      p.y = rand(-60, -16);
      p.vx = rand(-30, 30);
      p.vy = rand(110, 240);
      p.g = rand(30, 90);
      p.t = 0; p.life = 6;
      p.w = rand(7, 13);
      p.h = rand(4, 8);
      p.rot = rand(0, TAU);
      p.vr = rand(-6, 6);
      p.flip = rand(0, TAU);
      p.vf = rand(4, 9);
      p.amp = rand(50, 130);   // 横向摆幅 px/s
      p.freq = rand(1.6, 3.6); // 摆频
      p.ph = rand(0, TAU);
      p.color = colors[(Math.random() * colors.length) | 0];
      p.delay = rand(0, 0.8);
      p.a = 1;
    }
  }

  // 星光迸发：短促向四周散开
  function spark(x, y, color, n) {
    if (!ctx) return;
    color = color || '#ffd94e';
    n = clamp(n | 0, 0, 120);
    for (let i = 0; i < n; i++) {
      const p = spawn();
      if (!p) return;
      p.type = T_SPARK;
      const a = rand(0, TAU), sp = rand(60, 460);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.drag = rand(2.6, 4.2);
      p.t = 0; p.life = rand(0.3, 0.65);
      p.size = rand(2.5, 6.5);
      p.color = color;
      p.delay = 0;
    }
  }

  // 全屏一闪（快速淡出）
  function flash(color, alpha) {
    if (!ctx) return;
    const p = spawn();
    if (!p) return;
    p.type = T_FLASH;
    p.color = color || '#fff6d0';
    p.a0 = clamp(typeof alpha === 'number' ? alpha : 0.55, 0.02, 1);
    p.t = 0; p.life = 0.35;
    p.delay = 0;
  }

  // 冲击波圆环：扩散淡出
  function ring(x, y, color) {
    if (!ctx) return;
    const p = spawn();
    if (!p) return;
    p.type = T_RING;
    p.x = x; p.y = y;
    p.color = color || '#ffd94e';
    p.maxR = Math.min(W, H) * 0.32;
    p.t = 0; p.life = 0.55;
    p.delay = 0;
  }

  // 中央大字冲屏: opt { color, sub, dur, scale }
  function bigText(text, opt) {
    if (!ctx) return;
    if (!text) return;
    opt = opt || {};
    const color = (typeof opt.color === 'string' && opt.color) || '#ffd94e';
    const dur = clamp(typeof opt.dur === 'number' ? opt.dur : 1.6, 0.6, 8);
    const scale = clamp(typeof opt.scale === 'number' ? opt.scale : 1, 0.3, 3);
    const px = Math.max(30, Math.min(W / Math.max(4, text.length * 0.72), H * 0.2)) * scale;
    texts.push({
      text: String(text),
      sub: opt.sub ? String(opt.sub) : '',
      nx: 0.5, ny: 0.42, px: px,          // 相对坐标：resize 后仍居中
      t: 0, dur: dur, scale: 1,
      light: mixCol(color, [255, 255, 240], 0.62),
      main: color,
      dark2: mixCol(color, [120, 30, 0], 0.5),
      dark: mixCol(color, [70, 12, 0], 0.62),
      stroke: mixCol(color, [96, 18, 0], 0.58),
      glow: color
    });
  }

  // 清空全部特效
  function stopAll() {
    for (let i = 0; i < pool.length; i++) pool[i].on = false;
    texts.length = 0;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
    }
  }

  return { init, coinBurst, coinRain, confetti, spark, flash, ring, bigText, stopAll };
})();
