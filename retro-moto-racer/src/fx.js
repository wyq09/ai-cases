/* =========================================================================
 * RETRO-MOTO-RACER — FX 粒子 / 震屏层（Canvas2D，直接画在游戏 ctx 上）
 * 契约 §3: window.RM.FX = { init, resize, spawn, update, draw, shake, clear,
 *                           setDensity, setShakeEnabled }
 * 硬性约束:
 *   - 游戏画布是低内部分辨率（长边 ~480、pixelated 放大）：坐标即内部像素，
 *     粒子一律大颗像素块（2~9px），DPR 不用管。
 *   - 禁用 ctx.shadowBlur（性能红线）；辉光一律 createRadialGradient 预渲染
 *     小贴图（按色缓存）+ globalCompositeOperation='lighter' 叠色。
 *   - 对象池预分配 + 活跃标记，热路径（spawn/update/draw）零对象创建；
 *     并发上限 240×density，超池回收最老粒子。
 *   - FX 自身不跑 rAF：update(dt)/draw(ctx) 由主线帧循环驱动，draw 在
 *     路渲染后、HUD 前调用；震屏 translate 收在 draw 内部（save/restore，
 *     不污染主线 ctx 状态）。
 * ========================================================================= */
(() => {
  'use strict';

  const RM = (window.RM = window.RM || {});

  // ---- 粒子类型 ----
  const T_DUST = 1, T_SPARK = 2, T_CONF = 3, T_LINE = 4;

  const TAU = Math.PI * 2;
  const POOL_BASE = 240;       // density=1 时的并发上限
  const POOL_MAX = 360;        // 池物理容量 = 240 × 1.5
  const ROT_Q = Math.PI / 4;   // 彩带旋转按 45° 量化（8-bit 翻面味）

  // 调色板取契约 §6 采样
  const DUST_COLS = ['#d88d43', '#c07a38'];                       // 沙地土黄
  const SPARK_COLS = ['#ffd23f', '#f2ede4'];                      // 黄线白线
  const LINE_COL = '#f2ede4';                                     // 白
  const CONF_COLS = [                                             // 亮色集
    '#ffd23f', '#f2ede4', '#57d95c', '#e8823c', '#e86aa8',
    '#3fae49', '#3f6fd9', '#9b59d0', '#a8d93f', '#5cd9d9',
    '#e0342c', '#f2b53d'
  ];

  // ---- 运行时状态 ----
  let cv = null;               // 主画布（仅读初始尺寸；FX 不拥有 ctx、不跑 rAF）
  let W = 480, H = 270;        // 内部分辨率
  let cap = POOL_BASE;         // 当前并发上限 = round(240 × density)
  let shakeAmp = 0;            // 当前震屏幅度（px）
  let shakeOn = true;          // cfg.video.shake 开关

  const pool = [];             // 粒子对象池（init 时预分配）
  let cursor = 0;              // 池扫描游标
  const glowCache = Object.create(null); // color -> 预渲染辉光小贴图

  // =========================================================
  // 工具
  // =========================================================
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // '#rrggbb' -> 'rgba(r,g,b,a)'（只处理调色板内的 6 位 hex，兜底白色）
  function toRgba(col, a) {
    const h = col.length === 7 ? col.slice(1) : '';
    const n = h ? parseInt(h, 16) : NaN;
    if (isNaN(n)) return 'rgba(255,255,255,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // =========================================================
  // 预渲染：辉光小贴图（径向渐变，替代 shadowBlur；贴图半径刻意小）
  // =========================================================
  function glowSprite(color) {
    let s = glowCache[color];
    if (s) return s;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const S = 24; // 24px 离屏，绘制时缩到 4~12px
    s = document.createElement('canvas');
    s.width = s.height = S;
    const g = s.getContext('2d');
    if (!g) return null;
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, toRgba(color, 1));
    gr.addColorStop(0.45, toRgba(color, 0.55));
    gr.addColorStop(1, toRgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    glowCache[color] = s;
    return s;
  }

  // =========================================================
  // 对象池（预分配 + 活跃标记；超池回收最老）
  // =========================================================
  function initPool() {
    for (let i = 0; i < POOL_MAX; i++) {
      pool.push({
        on: false, type: 0,
        x: 0, y: 0, vx: 0, vy: 0, g: 0,
        t: 0, life: 1,
        size: 0, grow: 0, a0: 0,        // dust：直径 4→9、起始 alpha
        w: 0, h: 0,                     // confetti/speedline 尺寸
        rot: 0, vr: 0,                  // confetti 旋转
        amp: 0, freq: 0, ph: 0,         // confetti 横摆
        color: ''
      });
    }
  }

  function alloc() {
    // 先找 cap 窗口内的空闲槽
    for (let i = 0; i < POOL_MAX; i++) {
      cursor = (cursor + 1) % POOL_MAX;
      if (cursor < cap && !pool[cursor].on) { pool[cursor].on = true; return pool[cursor]; }
    }
    // 池满：回收最老（t 最大者）——仅在 cap>0 时
    if (cap <= 0) return null;
    let oldest = -1, ot = -1;
    for (let i = 0; i < cap; i++) {
      const p = pool[i];
      if (p.on && p.t > ot) { ot = p.t; oldest = i; }
    }
    if (oldest < 0) return null;
    return pool[oldest];
  }

  // =========================================================
  // spawn 各效果
  // =========================================================
  // 沙尘团：初速向上微散、轻微重力回落、alpha 衰减、直径 4→9px
  function spawnDust(x, y, o) {
    const n = clamp((o.n | 0) || 6, 1, 24);
    const spread = typeof o.spread === 'number' ? o.spread : 26;
    const vy0 = typeof o.vy === 'number' ? o.vy : -46;
    for (let i = 0; i < n; i++) {
      const p = alloc();
      if (!p) return;
      p.type = T_DUST;
      p.x = x + rand(-3, 3);
      p.y = y + rand(-2, 2);
      p.vx = rand(-spread, spread);
      p.vy = vy0 * rand(0.45, 1.1);
      p.g = 110;
      p.t = 0;
      p.life = rand(0.45, 0.85);
      p.size = rand(3.5, 4.5);          // 起始直径
      p.grow = 9 - p.size + rand(-0.5, 0.5); // 长到 ~9px
      p.a0 = rand(0.6, 0.88);
      p.color = DUST_COLS[(Math.random() * DUST_COLS.length) | 0];
    }
  }

  // 碰撞火花：亮黄白小方块 2~3px、快速放射、重力下坠、lighter 叠色、寿命 ~0.25s
  function spawnSpark(x, y, o) {
    const n = clamp((o.n | 0) || 8, 1, 40);
    const power = typeof o.power === 'number' ? o.power : 1;
    for (let i = 0; i < n; i++) {
      const p = alloc();
      if (!p) return;
      p.type = T_SPARK;
      const a = rand(0, TAU);
      const sp = rand(70, 260) * power;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 40 * power; // 稍向上抛再落
      p.g = 620;
      p.t = 0;
      p.life = rand(0.2, 0.3);
      p.size = 2 + ((Math.random() * 2) | 0); // 2~3px
      p.w = 0; p.h = 0; p.rot = 0; p.vr = 0;
      p.color = SPARK_COLS[(Math.random() * SPARK_COLS.length) | 0];
    }
  }

  // 结算彩带：3×5px 矩形、45° 量化旋转、x 正弦摆动、落速 40~80px/s、寿命 2.5~4s
  function spawnConf(x, y, o) {
    const n = clamp((o.n | 0) || 40, 1, 160);
    const x0 = typeof o.x === 'number' ? o.x : 0;
    const y0 = typeof o.y === 'number' ? o.y : -6;
    const w0 = typeof o.w === 'number' ? o.w : W;
    for (let i = 0; i < n; i++) {
      const p = alloc();
      if (!p) return;
      p.type = T_CONF;
      p.x = x0 + rand(0, w0);
      p.y = y0 + rand(-14, 4);
      p.vx = 0;
      p.vy = rand(40, 80);
      p.g = 0;
      p.t = 0;
      p.life = rand(2.5, 4);
      p.w = 3; p.h = 5;
      p.rot = rand(0, TAU);
      p.vr = rand(-7, 7);
      p.amp = rand(18, 55);
      p.freq = rand(1.6, 3.4);
      p.ph = rand(0, TAU);
      p.size = 0; p.grow = 0; p.a0 = 1;
      p.color = CONF_COLS[(Math.random() * CONF_COLS.length) | 0];
    }
  }

  // 高速气流线：白半透明横线 20~50×1~2px，从屏幕两侧向中后方掠过，寿命 0.3s
  function spawnLine(x, y, o) {
    const p = alloc();
    if (!p) return;
    const side = o.side === -1 || o.side === 1 ? o.side : (Math.random() < 0.5 ? -1 : 1);
    p.type = T_LINE;
    p.w = (rand(20, 50)) | 0;             // 线长
    p.h = Math.random() < 0.5 ? 1 : 2;    // 线高 1~2px
    p.y = y > 0 ? y : rand(H * 0.12, H * 0.85);
    p.x = side === 1 ? W + 4 : -(p.w + 4);
    p.vx = (side === 1 ? -1 : 1) * rand(520, 860); // 从两侧向中后掠
    p.vy = 0; p.g = 0;
    p.t = 0;
    p.life = 0.3;
    p.size = 0; p.grow = 0; p.a0 = 0.25;
    p.rot = 0; p.vr = 0; p.amp = 0; p.freq = 0; p.ph = 0;
    p.color = LINE_COL;
  }

  function spawn(id, x, y, opts) {
    if (cap <= 0) return;
    const o = opts || {};
    x = +x || 0;
    y = +y || 0;
    if (id === 'dust') spawnDust(x, y, o);
    else if (id === 'spark') spawnSpark(x, y, o);
    else if (id === 'confetti') spawnConf(x, y, o);
    else if (id === 'speedline') spawnLine(x, y, o);
  }

  // =========================================================
  // 帧更新（主线驱动）
  // =========================================================
  function update(dt) {
    if (dt > 0.05) dt = 0.05; // 切后台回来防跳变
    if (dt <= 0) return;

    // 震屏指数衰减（等效每帧 ×0.86 @60fps）
    if (shakeAmp > 0.05) shakeAmp *= Math.pow(0.86, dt * 60);
    else shakeAmp = 0;

    for (let i = 0; i < POOL_MAX; i++) {
      const p = pool[i];
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { p.on = false; continue; }
      switch (p.type) {
        case T_DUST:          // 上抛后受重力回落
          p.vy += p.g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case T_SPARK:         // 放射 + 重力下坠
          p.vy += p.g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case T_CONF:          // 匀速飘落 + x 正弦摆动 + 旋转
          p.y += p.vy * dt;
          p.x += Math.sin(p.t * p.freq + p.ph) * p.amp * dt;
          p.rot += p.vr * dt;
          break;
        case T_LINE:          // 横向掠过
          p.x += p.vx * dt;
          break;
      }
      // 出屏回收
      if (p.y > H + 30 || p.y < -80 || p.x < -80 || p.x > W + 80) p.on = false;
    }
  }

  // =========================================================
  // 绘制（主线驱动；画在游戏 ctx 上，内部像素坐标）
  // =========================================================
  function drawP(g, p) {
    const k = p.t / p.life; // 0..1 生命周期进度
    switch (p.type) {
      case T_DUST: {          // 沙尘团：径向渐变小贴图，普通叠色，渐大渐隐
        const spr = glowSprite(p.color);
        if (!spr) break;
        const d = p.size + p.grow * k;
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = p.a0 * (1 - k);
        g.drawImage(spr, p.x - d * 0.5, p.y - d * 0.5, d, d);
        break;
      }
      case T_SPARK: {         // 火花：lighter 辉光垫底（随寿命收缩）+ 亮核像素方块
        const fade = 1 - k;
        g.globalCompositeOperation = 'lighter';
        const gs = p.size * 4 * (0.3 + 0.7 * fade);
        const spr = glowSprite(p.color);
        if (spr) {
          g.globalAlpha = fade * 0.8;
          g.drawImage(spr, p.x - gs * 0.5, p.y - gs * 0.5, gs, gs);
        }
        g.globalAlpha = fade;
        g.fillStyle = p.color;
        g.fillRect((p.x - p.size * 0.5) | 0, (p.y - p.size * 0.5) | 0, p.size, p.size);
        break;
      }
      case T_CONF: {          // 彩带：45° 量化旋转的 3×5 矩形，尾段淡出
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = k > 0.78 ? (1 - k) / 0.22 : 1;
        g.fillStyle = p.color;
        g.save();
        g.translate(Math.round(p.x), Math.round(p.y));
        g.rotate(Math.round(p.rot / ROT_Q) * ROT_Q);
        g.fillRect(-1.5, -2.5, 3, 5);
        g.restore();
        break;
      }
      case T_LINE: {          // 气流线：白半透明横线，两端渐隐
        g.globalCompositeOperation = 'source-over';
        let a = p.a0;
        if (k < 0.2) a *= k / 0.2;
        else if (k > 0.65) a *= (1 - k) / 0.35;
        g.globalAlpha = a;
        g.fillStyle = p.color;
        g.fillRect(p.x | 0, p.y | 0, p.w, p.h);
        break;
      }
    }
  }

  function draw(g) {
    if (!g) return;
    g.save();
    // 震屏：整数 translate 保持像素对齐；受 setShakeEnabled 开关控制
    if (shakeOn && shakeAmp > 0.15) {
      g.translate((((Math.random() * 2 - 1) * shakeAmp) + 0.5) | 0,
                  (((Math.random() * 2 - 1) * shakeAmp) + 0.5) | 0);
    }
    for (let i = 0; i < POOL_MAX; i++) {
      const p = pool[i];
      if (p.on) drawP(g, p);
    }
    g.restore(); // 恢复主线 ctx 状态（alpha/composite/transform 一并还原）
  }

  // =========================================================
  // 公开 API
  // =========================================================
  function init(canvas) {
    if (!pool.length) initPool();
    if (canvas && canvas.width && canvas.height) {
      cv = canvas;
      W = canvas.width;
      H = canvas.height;
    }
  }

  function resize(w, h) {
    if (w > 0) W = w | 0;
    if (h > 0) H = h | 0;
  }

  // cfg.video.particles（0~1.5）→ 并发上限 240×density
  function setDensity(mult) {
    const d = clamp(+mult || 0, 0, 1.5);
    cap = Math.round(POOL_BASE * d);
  }

  // cfg.video.shake 开关
  function setShakeEnabled(b) {
    shakeOn = !!b;
    if (!shakeOn) shakeAmp = 0;
  }

  // 震屏：取更大值，update 内指数衰减（×0.86/帧）
  function shake(mag) {
    const m = Math.abs(+mag || 0);
    if (m > shakeAmp) shakeAmp = m;
  }

  // 清空全部粒子与震屏（换关/回标题用）
  function clear() {
    for (let i = 0; i < POOL_MAX; i++) pool[i].on = false;
    shakeAmp = 0;
  }

  RM.FX = { init, resize, spawn, update, draw, shake, clear, setDensity, setShakeEnabled };
})();
