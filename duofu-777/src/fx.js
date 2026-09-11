/* 多福巨奖 777 — FX 模块：Canvas2D 粒子特效叠加层
   零依赖 / 不用阴影模糊（发光 = 径向渐变 + lighter 半透明叠色）/ 粒子对象池
   金币为离屏预渲染翻转帧（scaleX 模拟翻转），风格红金喜庆澳门赌场 */
window.DF = window.DF || {};
DF.FX = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const SPR = 2;                 // 离屏贴图超采样倍率（= DPR 上限）
  const MAX_PARTS = 900;         // 粒子总量上限（保护低端机）
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------------- 模块状态 ---------------- */
  let host = null, canvas = null, ctx = null;
  let W = 0, H = 0, dpr = 1;
  let rafId = 0, loopOn = false, hiddenPaused = false, lastTs = 0;

  const parts = [];              // 活跃粒子  kind: 0金币 1彩带 2星光
  const pool = [];               // 空闲对象池
  const flashes = [];            // 全屏闪光
  const rings = [];              // 冲击波圆环
  const texts = new Set();       // bigText DOM（stopAll 一并清理）

  /* ---------------- 颜色工具 ---------------- */
  function toRgb(c) {
    if (typeof c !== 'string' || !c) return { r: 255, g: 214, b: 100 };
    let m = c.match(/^#([0-9a-f]{3})$/i);
    if (m) return {
      r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16)
    };
    m = c.match(/^#([0-9a-f]{6})/i);
    if (m) { const v = parseInt(m[1], 16); return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }; }
    m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) { const p = m[1].split(','); return { r: +p[0] || 0, g: +p[1] || 0, b: +p[2] || 0 }; }
    return { r: 255, g: 214, b: 100 };
  }
  const rgba = (c, a) => 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';

  /* ---------------- 金币离屏贴图：10 帧翻转（scaleX = cos） ----------------
     配色参照原机金币：金径向渐变 + 深金描边 + 虚线内圈 + 浮雕「福」+ 高光 */
  const NFR = 10, COIN = 46;
  let coinFrames = null;

  function coinFace(c, S) {
    const R = S / 2 - 2;
    const g = c.createRadialGradient(-R * 0.35, -R * 0.42, R * 0.14, 0, 0, R);
    g.addColorStop(0, '#fff7cf'); g.addColorStop(.45, '#ffd964');
    g.addColorStop(.8, '#e8a51e'); g.addColorStop(1, '#9a6406');
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#6b3e00'; c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.8, 0, TAU);
    c.lineWidth = 1.6; c.setLineDash([5, 4]); c.strokeStyle = 'rgba(138,90,0,.8)'; c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(0, 0, R * 0.64, 0, TAU);
    c.lineWidth = 2; c.strokeStyle = 'rgba(160,106,8,.7)'; c.stroke();
    c.font = '900 ' + (R * 1.02).toFixed(1) + 'px "Songti SC","STSong","SimSun","Noto Serif SC",serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const tg = c.createLinearGradient(0, -R * 0.62, 0, R * 0.62);
    tg.addColorStop(0, '#fff3bd'); tg.addColorStop(.5, '#ffcf4d'); tg.addColorStop(1, '#c98a12');
    c.lineWidth = 3; c.strokeStyle = '#7a4a00';
    c.strokeText('福', 0, R * 0.06);
    c.fillStyle = tg; c.fillText('福', 0, R * 0.06);
    c.save(); c.rotate(-0.62);
    c.beginPath(); c.ellipse(-R * 0.36, -R * 0.5, R * 0.32, R * 0.15, 0, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fill(); c.restore();
  }

  function buildCoins() {
    if (coinFrames) return;
    const P = COIN * SPR;
    coinFrames = [];
    for (let i = 0; i < NFR; i++) {
      const sx = Math.cos(i / NFR * Math.PI);          // 1 → -1 翻转
      const cv = document.createElement('canvas');
      cv.width = cv.height = P;
      const c = cv.getContext('2d');
      const ax = Math.abs(sx);
      if (ax < 0.15) {                                  // 侧面：窄厚边
        c.setTransform(1, 0, 0, 1, P / 2, P / 2);
        const w = Math.max(2.4, COIN * SPR * ax * 0.9);
        const g = c.createLinearGradient(-w, 0, w, 0);
        g.addColorStop(0, '#8a5a10'); g.addColorStop(.5, '#ffe9a0'); g.addColorStop(1, '#8a5a10');
        c.beginPath(); c.ellipse(0, 0, w / 2, COIN * SPR * 0.47, 0, 0, TAU);
        c.fillStyle = g; c.fill();
        c.lineWidth = SPR; c.strokeStyle = '#6b3e00'; c.stroke();
      } else {                                          // 正/背面
        c.setTransform(1, 0, 0, 1, P / 2, P / 2);
        c.scale(SPR * sx, SPR);
        coinFace(c, COIN);
        if (sx < 0) {                                   // 背面略暗
          c.beginPath(); c.arc(0, 0, COIN / 2 - 2, 0, TAU);
          c.fillStyle = 'rgba(96,50,0,.26)'; c.fill();
        }
      }
      coinFrames.push(cv);
    }
  }

  /* ---------------- 星光离屏贴图（4/6 角星芒 + 径向光晕），按色缓存 ---------------- */
  const SPARK_S = 64;
  const sparkCache = new Map();
  function sparkSprites(color) {
    const key = color || '#ffd964';
    let s = sparkCache.get(key);
    if (s) return s;
    const rgb = toRgb(key);
    const mk = pts => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = SPARK_S * SPR;
      const c = cv.getContext('2d');
      c.setTransform(SPR, 0, 0, SPR, cv.width / 2, cv.height / 2);   // 逻辑坐标：中心原点，按 SPR 超采样
      const R = SPARK_S / 2 * 0.95;
      let g = c.createRadialGradient(0, 0, 0, 0, 0, R);           // 径向渐变光晕（替代阴影模糊）
      g.addColorStop(0, rgba(rgb, .5)); g.addColorStop(.35, rgba(rgb, .16)); g.addColorStop(1, rgba(rgb, 0));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      const r2 = R * 0.15;                                        // 星芒
      c.beginPath();
      for (let i = 0; i < pts; i++) {
        const a0 = i / pts * TAU, a1 = (i + 0.5) / pts * TAU;
        c.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
        c.lineTo(Math.cos(a1) * r2, Math.sin(a1) * r2);
      }
      c.closePath();
      g = c.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.3, rgba(rgb, .95)); g.addColorStop(1, rgba(rgb, .5));
      c.fillStyle = g; c.fill();
      c.beginPath(); c.arc(0, 0, R * 0.11, 0, TAU); c.fillStyle = '#fff'; c.fill();
      return cv;
    };
    s = { a: mk(4), b: mk(6) };
    sparkCache.set(key, s);
    return s;
  }

  /* ---------------- 对象池 ---------------- */
  const acquire = () => pool.pop() || {};
  const release = p => { if (pool.length < 1200) pool.push(p); };
  function addPart(p) {
    if (parts.length < MAX_PARTS) parts.push(p); else release(p);
  }
  function recycle(i, p) {
    parts[i] = parts[parts.length - 1]; parts.pop(); release(p);
  }

  /* ---------------- 粒子物理 ---------------- */
  function step(p, dt) {
    p.age += dt;
    p.vy += p.g * dt;
    if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.frame += p.vf * dt;
    if (p.sway) p.x += Math.sin(p.phase + p.age * p.swf) * p.sway * dt;
    p.dead = p.age >= p.life ||
      (p.vy > 0 && p.y - p.size > H + 70) ||
      p.x < -160 || p.x > W + 160;
  }

  /* ---------------- 绘制 ---------------- */
  function drawCoin(p) {
    let fi = p.frame % NFR; if (fi < 0) fi += NFR;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.drawImage(coinFrames[fi | 0], -p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }
  function drawConfetti(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.scale(1, 0.22 + Math.abs(Math.sin(p.phase + p.age * p.swf)) * 0.78);  // 翻面飘动
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  function drawSpark(p) {
    const tt = p.age / p.life;
    const sp = sparkSprites(p.color);
    const k = p.size * (1 - tt * 0.5);
    ctx.globalAlpha = Math.max(0, 1 - tt * tt);
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.drawImage(p.six ? sp.b : sp.a, -k / 2, -k / 2, k, k);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function drawRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      const tt = r.t / r.dur;
      if (tt >= 1) { rings.splice(i, 1); continue; }
      const rad = 16 + (r.max - 16) * (1 - Math.pow(1 - tt, 2.2));
      const a = Math.pow(1 - tt, 1.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 3 + 9 * (1 - tt);
      ctx.strokeStyle = rgba(r.rgb, a * 0.9);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5 + 3 * (1 - tt);
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.55).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.9, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  function drawFlashes(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      const tt = f.t / f.dur;
      if (tt >= 1) { flashes.splice(i, 1); continue; }
      ctx.fillStyle = rgba(f.rgb, f.a * Math.pow(1 - tt, 1.7));
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------- 主循环（rAF 驱动，空闲自停，页面隐藏暂停） ---------------- */
  function tick(ts) {
    rafId = 0;
    if (!loopOn || !ctx) return;
    let dt = lastTs ? (ts - lastTs) / 1000 : 0.0166;
    lastTs = ts;
    if (!(dt > 0)) dt = 0.0166;
    if (dt > 0.05) dt = 0.05;

    ctx.clearRect(0, 0, W, H);
    drawRings(dt);

    for (let i = parts.length - 1; i >= 0; i--) {       // 金币 / 彩带
      const p = parts[i];
      if (p.kind === 2) continue;
      step(p, dt);
      if (p.dead) { recycle(i, p); continue; }
      if (p.kind === 0) drawCoin(p); else drawConfetti(p);
    }

    ctx.globalCompositeOperation = 'lighter';            // 星光叠色发光
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.kind !== 2) continue;
      step(p, dt);
      if (p.dead) { recycle(i, p); continue; }
      drawSpark(p);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    drawFlashes(dt);

    if (parts.length || flashes.length || rings.length) {
      rafId = requestAnimationFrame(tick);
    } else { loopOn = false; lastTs = 0; }
  }
  function kick() {
    if (!ctx || loopOn || hiddenPaused) return;
    loopOn = true; lastTs = 0;
    rafId = requestAnimationFrame(tick);
  }
  function onVis() {
    if (document.hidden) {
      hiddenPaused = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      loopOn = false;
    } else {
      hiddenPaused = false;
      if (parts.length || flashes.length || rings.length) kick();
    }
  }

  /* ---------------- 尺寸 / 初始化 ---------------- */
  function resize() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function init(hostEl) {
    host = hostEl || document.body;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'df-fx-canvas';
      canvas.style.cssText =
        'position:fixed;left:0;top:0;margin:0;padding:0;' +
        'width:100%;height:100%;pointer-events:none;';
      ctx = canvas.getContext('2d');
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);
    }
    if (canvas.parentNode !== host) host.appendChild(canvas);
    resize();
  }

  /* ---------------- 发射器 ---------------- */
  function coinBurst(x, y, n, opt) {
    if (!ctx) return;
    buildCoins();
    opt = opt || {};
    const spread = opt.spread == null ? 1.05 : opt.spread;
    const g = opt.gravity == null ? 1500 : opt.gravity;
    const pw = opt.power || 1;
    n = Math.max(0, n | 0);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rnd(-spread, spread);
      const sp = rnd(380, 860) * pw;
      const p = acquire();
      p.kind = 0; p.x = x + rnd(-8, 8); p.y = y + rnd(-6, 6);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.g = g; p.drag = 0; p.size = rnd(20, 38);
      p.rot = rnd(0, TAU); p.vr = rnd(-6, 6);
      p.frame = rnd(0, NFR); p.vf = rnd(5, 13);
      p.age = 0; p.life = rnd(1.8, 2.6);
      p.sway = 0; p.swf = 0; p.phase = 0;
      addPart(p);
    }
    kick();
  }

  function coinRain(n) {
    if (!ctx) return;
    buildCoins();
    n = Math.max(0, n | 0);
    for (let i = 0; i < n; i++) {
      const p = acquire();
      p.kind = 0;
      p.x = rnd(10, Math.max(20, W - 10));
      p.y = -rnd(20, 60) - (i / (n + 1)) * H * 0.55 - rnd(0, 90);
      p.vx = rnd(-70, 70); p.vy = rnd(-30, 60);
      p.g = rnd(620, 820); p.drag = 0; p.size = rnd(24, 44);
      p.rot = rnd(0, TAU); p.vr = rnd(-5, 5);
      p.frame = rnd(0, NFR); p.vf = rnd(4, 11);
      p.age = 0; p.life = 5.5;
      p.sway = rnd(10, 46); p.swf = rnd(3, 7); p.phase = rnd(0, TAU);
      addPart(p);
    }
    kick();
  }

  const CONF_COLORS = ['#ffd964', '#f2c14e', '#fff3bd', '#e03535', '#c31432', '#ff9e3d'];
  function confetti(n) {
    if (!ctx) return;
    n = Math.max(0, n | 0);
    for (let i = 0; i < n; i++) {
      const L = (i & 1) === 0;                                  // 左右双炮台
      const a = -Math.PI / 2 + (L ? 1 : -1) * rnd(0.12, 0.72);
      const sp = rnd(650, 1300);
      const p = acquire();
      p.kind = 1;
      p.x = L ? -12 : W + 12;
      p.y = H * rnd(0.78, 0.98);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.g = rnd(820, 1000); p.drag = 0.4;
      p.w = rnd(6, 10); p.h = rnd(9, 17); p.size = Math.max(p.w, p.h);
      p.rot = rnd(0, TAU); p.vr = rnd(-9, 9);
      p.frame = 0; p.vf = 0;
      p.age = 0; p.life = rnd(2.2, 3.4);
      p.sway = rnd(24, 70); p.swf = rnd(6, 12); p.phase = rnd(0, TAU);
      p.color = CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0];
      addPart(p);
    }
    kick();
  }

  function spark(x, y, color, n, opt) {
    if (!ctx) return;
    opt = opt || {};
    const g = opt.gravity == null ? 240 : opt.gravity;
    const pw = opt.power || 1;
    const col = color || '#ffd964';
    n = Math.max(0, n | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU);
      const sp = rnd(90, 430) * pw;
      const p = acquire();
      p.kind = 2; p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.g = g; p.drag = 2.1; p.size = rnd(13, 30);
      p.rot = rnd(0, TAU); p.vr = rnd(-6.5, 6.5);
      p.frame = 0; p.vf = 0;
      p.age = 0; p.life = rnd(0.45, 0.85);
      p.sway = 0; p.swf = 0; p.phase = 0;
      p.color = col;
      p.six = Math.random() < 0.45;             // 4 角 / 6 角星混发
      addPart(p);
    }
    kick();
  }

  function flash(color, alpha) {
    if (!ctx) return;
    flashes.push({
      rgb: toRgb(color), a: alpha == null ? 0.75 : Math.max(0, Math.min(1, alpha)),
      t: 0, dur: 0.34
    });
    kick();
  }

  function ring(x, y, color) {
    if (!ctx) return;
    rings.push({
      x, y, rgb: toRgb(color), t: 0, dur: 0.55,
      max: Math.max(90, Math.min(W, H) * 0.22)
    });
    kick();
  }

  /* ---------------- bigText：DOM 金渐变描边大字（弹入 → 停留 1.4s → 淡出自毁） ---------------- */
  function bigText(text, opt) {
    if (!host || typeof text !== 'string' || !text) return;
    opt = opt || {};
    const scale = opt.scale || 1;
    const vw = Math.max(window.innerWidth, 320);
    let fs = Math.min(vw * 0.135, 122) * scale;
    if (text.length > 5) fs *= 5 / text.length;
    fs = Math.round(fs);
    const fam = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Heiti SC",sans-serif';

    const wrap = document.createElement('div');
    texts.add(wrap);
    wrap.style.cssText =
      'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);' +
      'display:flex;flex-direction:column;align-items:center;pointer-events:none;' +
      'white-space:nowrap;z-index:2147483000;will-change:transform,opacity;';

    const glow = document.createElement('div');               // 径向渐变光环底
    const gs = Math.round(fs * (text.length * 0.8 + 2.2));
    glow.style.cssText =
      'position:absolute;left:50%;top:46%;width:' + gs + 'px;height:' + gs + 'px;' +
      'transform:translate(-50%,-50%);border-radius:50%;' +
      'background:radial-gradient(circle,rgba(255,206,84,.4) 0%,rgba(216,52,52,.24) 36%,' +
      'rgba(120,10,16,.1) 55%,rgba(0,0,0,0) 70%);';
    wrap.appendChild(glow);

    const stack = document.createElement('div');
    stack.style.cssText = 'position:relative;filter:drop-shadow(0 8px 22px rgba(40,0,0,.5));text-align:center;';
    const base = 'font-family:' + fam + ';font-weight:900;font-size:' + fs +
      'px;line-height:1.14;letter-spacing:.05em;text-align:center;';
    const stroke = document.createElement('div');              // 深红描边层
    stroke.textContent = text;
    stroke.style.cssText = base + 'position:absolute;left:0;top:0;width:100%;color:transparent;' +
      '-webkit-text-stroke:' + Math.max(5, Math.round(fs * 0.1)) + 'px #6e060d;';
    const fill = document.createElement('div');                // 金渐变填充层
    fill.textContent = text;
    fill.style.cssText = base + 'position:relative;' + (opt.color
      ? 'color:' + opt.color + ';'
      : 'background:linear-gradient(180deg,#fff8dc 6%,#ffe9a2 30%,#ffcf4d 52%,#eda91c 74%,#ffc23a 100%);' +
        '-webkit-background-clip:text;background-clip:text;color:transparent;');
    stack.appendChild(stroke); stack.appendChild(fill);
    wrap.appendChild(stack);

    if (opt.sub) {                                             // 金色小字副标题
      const sub = document.createElement('div');
      sub.textContent = String(opt.sub);
      const ss = Math.max(16, Math.round(fs * 0.32));
      sub.style.cssText =
        'position:relative;margin-top:' + Math.max(6, Math.round(fs * 0.1)) + 'px;' +
        'font-family:' + fam + ';font-weight:800;font-size:' + ss + 'px;letter-spacing:.14em;' +
        'color:#ffd964;text-shadow:0 2px 0 #6e2a00,0 0 16px rgba(255,190,70,.55),0 4px 10px rgba(0,0,0,.6);';
      wrap.appendChild(sub);
    }

    host.appendChild(wrap);

    const DUR = 2400;                                          // 弹入(.26) → 停留≈1.4s → 淡出
    const kf = [
      { transform: 'translate(-50%,-50%) scale(.18) rotate(-5deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.16) rotate(1.5deg)', opacity: 1, offset: 0.16 },
      { transform: 'translate(-50%,-50%) scale(.97)', opacity: 1, offset: 0.24 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.26 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.85 },
      { transform: 'translate(-50%,-50%) scale(1.09)', opacity: 0 }
    ];
    let tm = 0;
    const done = () => {
      if (tm) { clearTimeout(tm); tm = 0; }
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      texts.delete(wrap);
    };
    tm = setTimeout(done, DUR + 300);                          // 兜底自毁（动画时钟异常时仍能清理）
    if (wrap.animate) {
      const an = wrap.animate(kf, { duration: DUR, easing: 'cubic-bezier(.22,.9,.32,1.08)', fill: 'both' });
      an.onfinish = done; an.oncancel = done;
    }
  }

  /* ---------------- 全部清空 ---------------- */
  function stopAll() {
    for (let i = 0; i < parts.length; i++) release(parts[i]);
    parts.length = 0;
    flashes.length = 0;
    rings.length = 0;
    texts.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    texts.clear();
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  return {
    init, coinBurst, coinRain, confetti, spark,
    flash, ring, bigText, stopAll
  };
})();
