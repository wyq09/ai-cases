/* mouse-parkour · MP.ART —— 全程序化 Canvas2D 美术模块
 * 霓虹卡通 + 扁平几何（深色描边 + 高饱和填充 + 径向渐变外发光）；
 * 零外部资源，禁 shadowBlur / filter；静态元素全部预渲染到离屏 canvas。
 *
 * 锚点约定（重要）
 * · 世界坐标 x 向右、y 向下，地面基准 GROUND_Y = 460。
 * · drawMouse(ctx,o)：o.x/o.y = 碰撞盒左上角，o.w/o.h = 碰撞盒尺寸；小老鼠
 *   【脚底中心】锚定 (o.x+o.w/2, o.y+o.h)，身体向左上展开；耳朵/尾巴可溢出盒外。
 * · draw(ctx,key,x,y,w,h,opts)：x/y = 目标矩形左上角，w/h = 目标尺寸；
 *   opts = { flip 翻转, rot 弧度绕中心, alpha 透明度, tint 叠色, scale 尺寸倍数 }。
 * · backdrop(ctx,...)：ctx 为【视图坐标】，按 camX/camY 视差，地面线 = 460-camY。
 * · ground(ctx,biomeId,x,y,w,h,t)：x/y/w/h 为【世界坐标】实体矩形。
 */
window.MP = window.MP || {};
MP.ART = (() => {
  'use strict';

  /* --- 常量 --- */
  const INK = '#10131f', SW = 2, TAU = Math.PI * 2;
  const BODY = '#8e9bb3', BODY_D = '#5a6880', BODY_L = '#aab6cb';
  const BELLY = '#e9eef7', SCARF = '#ff6b3d';
  const PACK = '#ffd23f', PACK_D = '#d99e12';
  const EAR = '#ff9db0', EYE = '#141824';
  const GOLD = '#ffd23f', GOLD_L = '#ffe89a';
  const DANGER = '#ff4d5a', TEAL = '#35e0c8', VIOLET = '#b07cff';
  const RUST = '#39405a', SLATE = '#4a5470', STEEL = '#c3cede';

  /* --- 工具 --- */
  function rgba(hex, a) {
    let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function g2d(c) { return c.getContext('2d'); }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fs(g, f, s, lw) {
    if (f) { g.fillStyle = f; g.fill(); }
    if (s) { g.strokeStyle = s; g.lineWidth = lw || SW; g.stroke(); }
  }
  function C(g, x, y, r, f, s, lw) { g.beginPath(); g.arc(x, y, r, 0, TAU); fs(g, f, s, lw); }
  function E(g, x, y, rx, ry, rot, f, s, lw) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); fs(g, f, s, lw); }
  function R(g, x, y, w, h, f, s, lw) {
    if (f) { g.fillStyle = f; g.fillRect(x, y, w, h); }
    if (s) { g.strokeStyle = s; g.lineWidth = lw || SW; g.strokeRect(x + .5, y + .5, w - 1, h - 1); }
  }
  function PG(g, p, f, s, lw) {
    g.beginPath(); g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
    g.closePath(); fs(g, f, s, lw);
  }
  function LN(g, x1, y1, x2, y2, c, lw) {
    g.strokeStyle = c; g.lineWidth = lw || SW; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  function STAR(g, cx, cy, R2, r, n, rot) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * Math.PI / n, rad = (i % 2) ? r : R2;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }
  function glow(g, cx, cy, r, col, a) {
    const al = a === undefined ? .5 : a;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, rgba(col, al));
    gr.addColorStop(.5, rgba(col, al * .32));
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  function prng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  /* --- 精灵 --- */
  const SP = Object.create(null), CACHE = Object.create(null), TINT = Object.create(null);
  let READY = false;
  function spr(key, w, h, fn) { SP[key] = { w: w, h: h, f: fn }; }
  const PK = (k, fn) => spr(k, 48, 48, fn);   // 拾取物通用尺寸

  /* --- 拾取物 25 种 --- */
  PK('cheese', g => {
    glow(g, 24, 26, 23, GOLD, .45);
    PG(g, [[7, 33], [15, 11], [41, 17], [41, 37]], GOLD, INK);
    PG(g, [[15, 11], [41, 17], [23, 21], [12, 19]], GOLD_L);
    C(g, 31, 28, 3.4, '#a86a0d'); C(g, 21, 31, 2.4, '#a86a0d'); C(g, 29, 21, 1.8, '#a86a0d');
  });
  PK('coin', g => {
    glow(g, 24, 24, 22, '#ffcf4a', .45);
    C(g, 24, 24, 14.5, '#f7bb1d', INK);
    C(g, 24, 24, 10, null, '#a9781a');
    STAR(g, 24, 24, 7.5, 3.2, 5, -Math.PI / 2); g.fillStyle = GOLD_L; g.fill();
  });
  PK('gem', g => {
    glow(g, 24, 24, 22, '#7ff2ff', .45);
    PG(g, [[13, 12], [35, 12], [41, 21], [24, 41], [7, 21]], '#7ee8ff', INK);
    PG(g, [[13, 12], [35, 12], [29, 21], [19, 21]], '#d9fbff');
    PG(g, [[7, 21], [19, 21], [24, 41]], '#3fb4e0');
    PG(g, [[41, 21], [29, 21], [24, 41]], '#9beeff');
    PG(g, [[19, 21], [29, 21], [24, 41]], '#6ad4f2');
  });
  PK('clover', g => {
    glow(g, 24, 24, 21, '#6ef08a', .4);
    [[24, 13], [35, 24], [24, 35], [13, 24]].forEach((p, i) => C(g, p[0], p[1], 8.5, i % 2 ? '#4fd96b' : '#5ce87a', INK, 1.8));
    C(g, 24, 24, 4.2, '#c8ff9e');
    g.strokeStyle = '#2f9c4a'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(24, 35); g.quadraticCurveTo(23, 41, 18, 44); g.stroke();
  });
  PK('magnet', g => {
    glow(g, 24, 25, 21, '#ff6b6b', .4);
    g.lineCap = 'butt';
    g.beginPath(); g.arc(24, 19, 11, Math.PI, 0);
    g.moveTo(13, 19); g.lineTo(13, 32); g.moveTo(35, 19); g.lineTo(35, 32);
    g.strokeStyle = INK; g.lineWidth = 12; g.stroke();
    g.strokeStyle = '#e33b4e'; g.lineWidth = 8; g.stroke();
    g.lineCap = 'round';
    R(g, 9, 29, 8, 6, '#eef3fa', INK, 1.6); R(g, 31, 29, 8, 6, '#eef3fa', INK, 1.6);
  });
  PK('catnip', g => {
    glow(g, 24, 27, 21, '#8ef0a0', .4);
    for (let i = 0; i < 3; i++) {
      g.save(); g.translate(24, 34); g.rotate(-.55 + i * .55);
      E(g, 0, -12, 6, 13, 0, i === 1 ? '#5ce87a' : '#43c85f', INK, 1.8);
      g.restore();
    }
    C(g, 24, 16, 6, '#c78bff', INK, 1.8); C(g, 24, 16, 2.4, '#fff0b0');
  });
  PK('sneakers', g => {
    glow(g, 24, 28, 22, '#6fd0ff', .4);
    g.beginPath(); g.moveTo(9, 33); g.lineTo(11, 19); g.quadraticCurveTo(16, 15, 24, 19);
    g.quadraticCurveTo(33, 23, 39, 26); g.quadraticCurveTo(42, 28, 41, 33); g.closePath();
    fs(g, '#4aa3ff', INK);
    LN(g, 16, 21, 26, 23, '#e9eef7', 2); LN(g, 17, 25, 27, 27, '#e9eef7', 2);
    g.beginPath(); g.moveTo(9, 32); g.lineTo(41, 32); g.quadraticCurveTo(43, 36, 40, 38);
    g.lineTo(10, 38); g.quadraticCurveTo(7, 36, 9, 32); g.closePath();
    fs(g, '#e9eef7', INK, 1.6);
  });
  PK('bubblegum', g => {
    glow(g, 24, 26, 21, '#ff9dc8', .45);
    E(g, 20, 28, 13, 10, -.2, '#ff8ec2', INK);
    C(g, 31, 15, 8, '#ffd1e6', INK, 1.8); C(g, 28.5, 12.5, 2.4, '#fff');
  });
  PK('flame', g => {
    glow(g, 24, 24, 23, '#ff8a3c', .5);
    g.beginPath(); g.moveTo(24, 5); g.quadraticCurveTo(38, 17, 36, 28);
    g.quadraticCurveTo(34, 40, 24, 42); g.quadraticCurveTo(14, 40, 12, 28);
    g.quadraticCurveTo(11, 17, 24, 5); g.closePath(); fs(g, '#ff5a3c', INK);
    g.beginPath(); g.moveTo(24, 15); g.quadraticCurveTo(32, 23, 30, 30);
    g.quadraticCurveTo(28, 37, 24, 38); g.quadraticCurveTo(20, 37, 18, 30);
    g.quadraticCurveTo(17, 23, 24, 15); g.closePath(); g.fillStyle = GOLD; g.fill();
  });
  PK('giant', g => {
    glow(g, 24, 27, 22, '#7dff9e', .42);
    g.beginPath(); g.moveTo(19, 7); g.lineTo(29, 7); g.lineTo(29, 14);
    g.quadraticCurveTo(36, 20, 36, 30); g.lineTo(36, 40);
    g.quadraticCurveTo(36, 44, 32, 44); g.lineTo(16, 44);
    g.quadraticCurveTo(12, 44, 12, 40); g.lineTo(12, 30);
    g.quadraticCurveTo(12, 20, 19, 14); g.closePath(); fs(g, '#3fd07a', INK);
    E(g, 18, 29, 3, 8, .2, 'rgba(255,255,255,.22)');
    PG(g, [[24, 20], [30, 28], [26.4, 28], [26.4, 35], [21.6, 35], [21.6, 28], [18, 28]], '#eaffef');
    R(g, 18, 2, 12, 6, '#c9a06a', INK, 1.4);
  });
  PK('mini', g => {
    glow(g, 24, 29, 21, '#8fb8ff', .42);
    g.beginPath(); g.moveTo(20, 13); g.lineTo(28, 13); g.lineTo(28, 19);
    g.quadraticCurveTo(34, 24, 34, 32); g.lineTo(34, 40);
    g.quadraticCurveTo(34, 43, 31, 43); g.lineTo(17, 43);
    g.quadraticCurveTo(14, 43, 14, 40); g.lineTo(14, 32);
    g.quadraticCurveTo(14, 24, 20, 19); g.closePath(); fs(g, '#6f8fff', INK);
    E(g, 19, 32, 2.6, 6, .2, 'rgba(255,255,255,.22)');
    PG(g, [[24, 23], [30, 31], [26.4, 31], [26.4, 37], [21.6, 37], [21.6, 31], [18, 31]], '#eef3ff');
    R(g, 19, 9, 10, 5, '#c9a06a', INK, 1.4);
  });
  PK('feather', g => {
    glow(g, 24, 24, 21, '#bff0ff', .4);
    g.beginPath(); g.moveTo(12, 41); g.quadraticCurveTo(15, 20, 37, 7);
    g.quadraticCurveTo(41, 26, 26, 39); g.closePath(); fs(g, '#dff6ff', INK);
    g.strokeStyle = '#8fd4ea'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(12, 41); g.quadraticCurveTo(26, 28, 37, 7); g.stroke();
    g.beginPath(); g.moveTo(18, 35); g.lineTo(24, 27); g.moveTo(23, 29); g.lineTo(30, 21); g.stroke();
  });
  PK('shield', g => {
    glow(g, 24, 24, 23, '#7fd4ff', .5);
    C(g, 24, 24, 17, 'rgba(160,230,255,.32)');
    C(g, 24, 24, 17, null, '#bfefff', 2.4);
    C(g, 19.5, 18, 5, 'rgba(255,255,255,.55)');
    PG(g, [[24, 12], [34, 18], [34, 30], [24, 36], [14, 30], [14, 18]], '#5fc8f0', INK, 1.8);
  });
  PK('star', g => {
    glow(g, 24, 24, 24, GOLD, .55);
    STAR(g, 24, 25, 16, 7, 5, -Math.PI / 2); fs(g, GOLD, INK);
    STAR(g, 24, 25, 9, 4, 5, -Math.PI / 2); g.fillStyle = '#fff6cf'; g.fill();
  });
  PK('hourglass', g => {
    glow(g, 24, 24, 21, '#ffd8a0', .4);
    PG(g, [[13, 9], [35, 9], [25, 24], [35, 39], [13, 39], [23, 24]], 'rgba(210,240,255,.5)', INK);
    PG(g, [[17, 13], [31, 13], [24, 23]], '#ffb43c');
    PG(g, [[18, 35], [30, 35], [24, 28]], '#ffb43c');
    R(g, 11, 5, 26, 5, '#d99e12', INK, 1.4); R(g, 11, 38, 26, 5, '#d99e12', INK, 1.4);
  });
  PK('energy', g => {
    glow(g, 24, 24, 23, TEAL, .5);
    PG(g, [[24, 6], [38, 15], [38, 33], [24, 42], [10, 33], [10, 15]], '#1b6b6a', INK);
    PG(g, [[24, 10], [34, 16], [34, 32], [24, 38], [14, 32], [14, 16]], null, rgba(TEAL, .8));
    PG(g, [[26, 14], [18, 25], [23, 25], [20, 35], [30, 22], [24, 22]], TEAL);
  });
  PK('heart', g => {
    glow(g, 24, 27, 22, '#ff6b7f', .45);
    g.beginPath(); g.moveTo(24, 41);
    g.bezierCurveTo(8, 30, 8, 16, 18, 13); g.bezierCurveTo(22, 12, 24, 16, 24, 18);
    g.bezierCurveTo(24, 16, 26, 12, 30, 13); g.bezierCurveTo(40, 16, 40, 30, 24, 41);
    g.closePath(); fs(g, '#ff4d6a', INK);
    E(g, 17, 20, 3.4, 2.4, -.5, 'rgba(255,255,255,.6)');
    E(g, 33, 11, 6, 3.4, -.5, '#4fd96b', INK, 1.4);
  });
  PK('drill', g => {
    glow(g, 24, 24, 22, '#ffa04a', .42);
    PG(g, [[10, 18], [30, 22], [30, 26], [10, 30]], '#c8d2e0', INK);
    g.strokeStyle = '#7b8798'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(13, 18); g.lineTo(20, 30); g.moveTo(19, 19.5); g.lineTo(26, 28.5); g.stroke();
    PG(g, [[30, 19], [41, 24], [30, 29]], '#e8eef7', INK);
    R(g, 2, 16, 10, 16, '#ff8a3c', INK, 1.6);
  });
  PK('boots', g => {
    glow(g, 24, 29, 22, '#7dff9e', .4);
    g.beginPath(); g.moveTo(15, 18); g.lineTo(29, 18); g.lineTo(29, 32);
    g.quadraticCurveTo(39, 33, 41, 38); g.lineTo(41, 42); g.lineTo(15, 42);
    g.closePath(); fs(g, '#4fd96b', INK);
    R(g, 15, 30, 26, 4, '#eaffef');
    g.beginPath(); g.moveTo(17, 18); g.lineTo(27, 14); g.lineTo(17, 10); g.lineTo(27, 6);
    g.strokeStyle = INK; g.lineWidth = 4.6; g.stroke();
    g.strokeStyle = STEEL; g.lineWidth = 2.6; g.stroke();
  });
  PK('bell', g => {
    glow(g, 24, 25, 22, GOLD, .5);
    g.beginPath(); g.moveTo(10, 34); g.quadraticCurveTo(11, 12, 24, 12);
    g.quadraticCurveTo(37, 12, 38, 34); g.closePath(); fs(g, GOLD, INK);
    E(g, 19, 21, 3.6, 7, .2, GOLD_L);
    R(g, 7, 33, 34, 5, '#d99e12', INK, 1.4);
    C(g, 24, 41, 4, '#e8eef7', INK, 1.4); C(g, 24, 9, 3, '#d99e12', INK, 1.4);
  });
  PK('freeze', g => {
    glow(g, 24, 24, 23, '#a8f0ff', .5);
    PG(g, [[24, 4], [36, 16], [30, 42], [18, 42], [12, 16]], '#9fe8ff', INK);
    PG(g, [[24, 4], [24, 42], [18, 42], [12, 16]], '#dff8ff');
    PG(g, [[24, 4], [36, 16], [30, 42], [24, 42]], '#5cc3e8');
    LN(g, 24, 6, 24, 40, 'rgba(255,255,255,.65)', 1.4);
  });
  PK('emp', g => {
    glow(g, 24, 24, 24, '#8fb8ff', .5);
    C(g, 24, 24, 18, null, rgba('#8fb8ff', .85), 2.4);
    g.strokeStyle = rgba('#8fb8ff', .35); g.lineWidth = 6;
    g.beginPath(); g.arc(24, 24, 18, -.9, .9); g.stroke();
    PG(g, [[26, 9], [15, 25], [22, 25], [18, 39], [31, 22], [24, 22]], '#eaf4ff', INK, 1.4);
  });
  PK('multiply', g => {
    glow(g, 24, 24, 22, GOLD, .5);
    C(g, 24, 24, 16, '#f7bb1d', INK);
    C(g, 24, 24, 11.5, null, '#a9781a');
    g.fillStyle = '#3a2a08';
    g.font = 'bold 20px sans-serif';
    g.fillText('×2', 11, 25);
  });
  PK('gravity', g => {
    glow(g, 24, 24, 23, VIOLET, .5);
    C(g, 24, 24, 18, null, rgba(VIOLET, .85), 2.6);
    PG(g, [[24, 10], [31, 18], [27, 18], [27, 22], [21, 22], [21, 18], [17, 18]], '#e6d8ff');
    PG(g, [[24, 38], [17, 30], [21, 30], [21, 26], [27, 26], [27, 30], [31, 30]], '#e6d8ff');
  });
  PK('rocket', g => {
    glow(g, 24, 26, 23, '#ff8a3c', .45);
    g.save(); g.translate(24, 26); g.rotate(-.5);
    R(g, -16, -6, 30, 12, '#4aa3ff', INK);
    R(g, -16, -6, 8, 12, '#2f6ea8', INK, 1.6);
    C(g, 13, 0, 6, '#e9eef7', INK, 1.6);
    g.restore();
    PG(g, [[20, 15], [9, 22], [20, 29]], '#ff5a3c');
    PG(g, [[19, 18], [13, 22], [19, 26]], GOLD);
  });

  /* --- 危险物 11 种 --- */
  spr('cat', 72, 56, g => {
    glow(g, 44, 30, 30, DANGER, .3);
    E(g, 34, 36, 18, 19, 0, RUST, INK);
    E(g, 48, 23, 14, 12, 0, SLATE, INK);
    PG(g, [[36, 14], [40, 3], [47, 13]], SLATE, INK, 1.8);
    PG(g, [[51, 13], [57, 4], [59, 16]], SLATE, INK, 1.8);
    PG(g, [[38.5, 12], [40.5, 6], [44.5, 12]], EAR);
    PG(g, [[52.5, 12], [55.5, 7], [56.5, 14]], EAR);
    E(g, 52, 22, 3.6, 2.4, 0, DANGER); E(g, 42, 21, 2.6, 2, 0, DANGER);
    g.beginPath(); g.moveTo(17, 44); g.quadraticCurveTo(2, 44, 5, 28);
    g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
    g.strokeStyle = RUST; g.lineWidth = 4.6; g.stroke();
    E(g, 48, 48, 6, 4, 0, SLATE, INK, 1.4);
  });
  spr('spike', 60, 56, g => {
    glow(g, 30, 30, 28, DANGER, .35);
    R(g, 3, 40, 54, 13, RUST, INK);
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 18;
      PG(g, [[x, 42], [x + 9, 6], [x + 18, 42]], STEEL, INK, 1.8);
      PG(g, [[x + 4.5, 24], [x + 9, 6], [x + 13.5, 24]], DANGER);
    }
  });
  spr('pit', 120, 40, g => {
    glow(g, 60, 28, 50, DANGER, .4);
    g.beginPath(); g.moveTo(2, 9);
    for (let i = 0; i < 10; i++) { const x = 2 + i * 12; g.lineTo(x + 6, 4 + (i % 2) * 6); g.lineTo(x + 12, 9); }
    g.lineTo(118, 40); g.lineTo(2, 40); g.closePath(); fs(g, '#1a1020', INK);
    E(g, 60, 27, 42, 10, 0, rgba(DANGER, .22));
  });
  spr('rock', 56, 56, g => {
    glow(g, 28, 30, 26, DANGER, .32);
    PG(g, [[8, 44], [14, 16], [30, 6], [46, 18], [48, 40], [32, 52]], '#6b7386', INK);
    PG(g, [[14, 16], [30, 6], [32, 26], [16, 28]], '#8792a8');
    g.strokeStyle = rgba(DANGER, .85); g.lineWidth = 2;
    g.beginPath(); g.moveTo(16, 30); g.lineTo(26, 38); g.lineTo(22, 48); g.stroke();
  });
  spr('fence', 36, 120, g => {
    glow(g, 18, 60, 34, DANGER, .35);
    R(g, 4, 2, 7, 116, SLATE, INK); R(g, 25, 2, 7, 116, SLATE, INK);
    const EC = rgba(DANGER, .9);
    g.strokeStyle = EC; g.lineWidth = 2.4;
    for (let i = 0; i < 4; i++) {
      const y = 16 + i * 26;
      LN(g, 9, y, 27, y, EC, 2.4);
      g.beginPath(); g.moveTo(11, y - 5); g.lineTo(15, y + 5); g.lineTo(19, y - 5);
      g.lineTo(23, y + 5); g.stroke();
    }
  });
  spr('acid', 90, 20, g => {
    glow(g, 45, 12, 40, '#7cf03c', .45);
    g.beginPath(); g.moveTo(2, 7);
    for (let i = 0; i < 6; i++) { const x = 2 + i * 15; g.quadraticCurveTo(x + 7.5, -1, x + 15, 7); }
    g.lineTo(88, 20); g.lineTo(2, 20); g.closePath(); fs(g, '#7cf03c', INK);
    E(g, 20, 8, 6, 2.4, 0, 'rgba(225,255,150,.6)');
    E(g, 56, 7, 7, 2.6, 0, 'rgba(225,255,150,.6)');
    C(g, 36, 11, 3, 'rgba(20,60,10,.5)'); C(g, 72, 10, 2.4, 'rgba(20,60,10,.5)');
  });
  spr('pendulum', 64, 64, g => {
    glow(g, 32, 44, 26, DANGER, .4);
    R(g, 26, 0, 12, 9, RUST, INK, 1.4);
    LN(g, 32, 7, 32, 26, INK, 4.4); LN(g, 32, 7, 32, 26, '#6b7386', 2.6);
    C(g, 32, 44, 19, '#5a6478', INK);
    C(g, 26, 38, 5, 'rgba(255,255,255,.3)');
    g.strokeStyle = rgba(DANGER, .9); g.lineWidth = 2.4;
    g.beginPath(); g.arc(32, 44, 12, .4, 2.4); g.stroke();
  });
  spr('laser', 32, 400, g => {
    glow(g, 16, 16, 26, DANGER, .4);
    R(g, 2, 0, 28, 26, RUST, INK); R(g, 6, 4, 20, 8, '#5a6478');
    C(g, 16, 16, 6, DANGER);
    const gr = g.createLinearGradient(0, 26, 0, 400);
    gr.addColorStop(0, rgba(DANGER, .9)); gr.addColorStop(1, rgba(DANGER, .12));
    g.fillStyle = gr; g.fillRect(11, 26, 10, 374);
    R(g, 14, 26, 4, 374, 'rgba(255,255,255,.7)');
  });
  spr('blade', 64, 64, g => {
    glow(g, 32, 32, 30, DANGER, .4);
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(32, 32); g.rotate(i * Math.PI / 2);
      PG(g, [[0, -5], [6, -25], [0, -30], [-6, -25]], STEEL, INK, 1.8);
      g.restore();
    }
    C(g, 32, 32, 7, '#5a6478', INK); C(g, 32, 32, 3, DANGER);
  });
  spr('drone', 60, 48, g => {
    glow(g, 30, 24, 26, DANGER, .35);
    E(g, 11, 10, 12, 3, 0, 'rgba(195,222,238,.45)');
    E(g, 49, 10, 12, 3, 0, 'rgba(195,222,238,.45)');
    LN(g, 9, 11, 24, 19, '#6b7386', 2.6); LN(g, 51, 11, 36, 19, '#6b7386', 2.6);
    PG(g, [[19, 16], [41, 16], [37, 36], [23, 36]], SLATE, INK);
    R(g, 23, 20, 14, 8, '#2b3149');
    C(g, 30, 26, 5, DANGER); C(g, 30, 26, 2, '#fff');
  });
  spr('crusher', 70, 240, g => {
    glow(g, 35, 150, 46, DANGER, .35);
    R(g, 0, 0, 70, 20, '#5a6478', INK);
    R(g, 28, 18, 14, 56, '#6b7386', INK, 1.6);
    PG(g, [[10, 74], [60, 74], [54, 196], [16, 196]], '#7c8698', INK);
    R(g, 14, 180, 42, 10, DANGER, INK, 1.6);
    for (let i = 0; i < 6; i++) PG(g, [[16 + i * 7, 196], [21 + i * 7, 196], [18.5 + i * 7, 210]], STEEL, INK, 1.2);
  });

  /* --- 敌人 4 种 --- */
  spr('wasp', 52, 48, g => {
    glow(g, 26, 24, 24, DANGER, .3);
    E(g, 21, 11, 12, 6.5, -.5, 'rgba(220,240,255,.5)');
    E(g, 33, 11, 10, 5.5, .4, 'rgba(220,240,255,.5)');
    E(g, 25, 27, 15, 11, 0, GOLD, INK);
    g.save(); g.beginPath(); g.ellipse(25, 27, 15, 11, 0, 0, TAU); g.clip();
    g.fillStyle = '#2b2318'; g.fillRect(18, 13, 4.5, 28); g.fillRect(27, 13, 4.5, 28);
    g.restore();
    C(g, 40, 25, 8, '#3a3a46', INK, 1.8); C(g, 43, 23, 2.4, DANGER);
    PG(g, [[11, 24], [2, 27], [11, 30]], '#3a3a46', INK, 1.4);
  });
  spr('turret', 64, 64, g => {
    glow(g, 30, 40, 30, DANGER, .35);
    PG(g, [[8, 60], [14, 38], [46, 38], [52, 60]], RUST, INK);
    R(g, 16, 44, 28, 4, '#5a6478');
    C(g, 30, 32, 14, SLATE, INK); C(g, 30, 32, 8, '#2b3149'); C(g, 30, 32, 4, DANGER);
    g.save(); g.translate(30, 32); g.rotate(-.25);
    R(g, 6, -5, 26, 10, '#6b7386', INK, 1.6); R(g, 26, -5, 6, 10, DANGER);
    g.restore();
  });

  /* --- 其它 12 种 --- */
  spr('goal', 120, 130, g => {
    glow(g, 60, 78, 68, GOLD, .4);
    R(g, 22, 45, 76, 85, GOLD, INK);
    for (let i = 0; i < 5; i++) R(g, 22 + i * 16, 33, 11, 14, GOLD_L, INK, 1.6);
    R(g, 8, 58, 20, 72, '#e0a51b', INK); R(g, 92, 58, 20, 72, '#e0a51b', INK);
    g.beginPath(); g.moveTo(46, 130); g.lineTo(46, 100);
    g.quadraticCurveTo(60, 86, 74, 100); g.lineTo(74, 130); g.closePath();
    fs(g, '#3a2a10', INK, 1.6);
    C(g, 34, 74, 5, '#a86a0d'); C(g, 52, 60, 4, '#a86a0d'); C(g, 86, 78, 4.5, '#a86a0d');
    LN(g, 60, 34, 60, 4, '#e9eef7', 3);
    PG(g, [[61, 6], [96, 16], [61, 27]], SCARF, INK, 1.6);
  });
  spr('checkpoint', 32, 70, g => {
    glow(g, 16, 24, 24, TEAL, .4);
    R(g, 4, 58, 24, 8, RUST, INK);
    LN(g, 9, 60, 9, 6, '#e9eef7', 3.4);
    PG(g, [[11, 8], [29, 18], [11, 29]], TEAL, INK, 1.6);
    C(g, 9, 5, 3, GOLD);
  });
  spr('brick', 64, 48, g => {
    glow(g, 32, 24, 30, DANGER, .25);
    for (let r = 0; r < 3; r++) for (let c = -1; c < 3; c++) {
      const x = c * 24 + (r % 2 ? 12 : 0), y = r * 16;
      R(g, x + 1, y + 1, 22, 14, r % 2 ? '#c2603a' : '#d97a4a', INK, 1.4);
    }
  });
  spr('moverPad', 64, 24, g => {
    R(g, 2, 6, 60, 16, RUST, INK);
    PG(g, [[12, 14], [22, 14], [22, 10], [32, 16], [22, 22], [22, 18], [12, 18]], TEAL);
    PG(g, [[30, 14], [40, 14], [40, 10], [50, 16], [40, 22], [40, 18], [30, 18]], rgba(TEAL, .55));
  });
  spr('spring', 48, 44, g => {
    glow(g, 24, 30, 22, '#7dff9e', .35);
    R(g, 4, 36, 40, 6, RUST, INK);
    g.beginPath(); g.moveTo(14, 34); g.lineTo(34, 26); g.lineTo(14, 18); g.lineTo(34, 10); g.lineTo(16, 4);
    g.strokeStyle = INK; g.lineWidth = 6.4; g.stroke();
    g.strokeStyle = STEEL; g.lineWidth = 3.4; g.stroke();
  });
  spr('crumble', 64, 24, g => {
    R(g, 1, 4, 62, 18, '#5a5248', INK);
    g.strokeStyle = '#2b2620'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(20, 4); g.lineTo(26, 12); g.lineTo(20, 22);
    g.moveTo(41, 4); g.lineTo(47, 11); g.lineTo(43, 22); g.stroke();
  });
  spr('platform', 96, 24, g => {
    rr(g, 1, 4, 94, 17, 5); fs(g, RUST, INK);
    R(g, 4, 5, 88, 4, '#6b7386'); R(g, 8, 12, 80, 2, rgba(TEAL, .45));
  });
  spr('oneway', 96, 24, g => {
    rr(g, 1, 10, 94, 11, 3); fs(g, '#3a4560', INK);
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 14;
      PG(g, [[x, 19], [x + 6, 13], [x + 12, 19], [x + 9, 19], [x + 6, 16], [x + 3, 19]], rgba(VIOLET, .7));
    }
  });
  spr('wall', 48, 64, g => {
    rr(g, 2, 2, 44, 60, 4); fs(g, SLATE, INK);
    g.strokeStyle = rgba('#1b2033', .65); g.lineWidth = 1.4;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) g.strokeRect(4 + c * 21, 4 + r * 14, 20, 13);
    R(g, 4, 4, 40, 4, rgba(TEAL, .3));
  });
  spr('groundTile', 64, 32, g => {
    R(g, 0, 11, 64, 21, '#4a2b18', INK);
    R(g, 0, 0, 64, 13, '#c98a3c'); R(g, 0, 0, 64, 5, '#e8b464');
    g.strokeStyle = rgba('#8a5a20', .8); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(16, 5); g.lineTo(16, 13); g.moveTo(32, 5); g.lineTo(32, 13); g.moveTo(48, 5); g.lineTo(48, 13); g.stroke();
  });
  spr('magnetField', 96, 96, g => {
    g.strokeStyle = rgba('#ff6b6b', .45); g.lineWidth = 3;
    for (let i = 1; i <= 3; i++) { C(g, 48, 48, i * 15, null, rgba('#ff6b6b', .45), 3); }
    g.fillStyle = '#e33b4e'; g.fillRect(30, 40, 18, 16);
    g.fillStyle = '#eef3fa'; g.fillRect(48, 40, 18, 16);
    g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(30, 40, 18, 16); g.strokeRect(48, 40, 18, 16);
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif';
    g.fillText('S', 35, 43); g.fillText('N', 53, 43);
  });
  spr('telegraph', 64, 64, g => {
    glow(g, 32, 32, 30, DANGER, .4);
    PG(g, [[32, 5], [59, 55], [5, 55]], GOLD, INK);
    R(g, 29, 17, 6, 22, '#1a1020'); C(g, 32, 47, 3.6, '#1a1020');
  });

  /* --- API --- */
  function init() {
    if (READY) return api;
    READY = true;
    for (const k in SP) {
      const d = SP[k], c = cv(d.w, d.h), g = g2d(c);
      g.lineJoin = 'round'; g.lineCap = 'round';
      d.f(g, d.w, d.h);
      CACHE[k] = c;
    }
    return api;
  }
  function sprite(key) { if (!READY) init(); return CACHE[key] || null; }
  function keys() { if (!READY) init(); return Object.keys(SP); }
  function tinted(key, color) {
    const id = key + '|' + color;
    if (TINT[id]) return TINT[id];
    const base = sprite(key);
    if (!base) return null;
    const c = cv(base.width, base.height), g = g2d(c);
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = .55; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    TINT[id] = c;
    return c;
  }
  function draw(ctx, key, x, y, w, h, opts) {
    if (!ctx) return;
    const base = sprite(key);
    if (!base) return;
    opts = opts || {};
    const img = opts.tint ? tinted(key, opts.tint) : base;
    if (!img) return;
    const sc = (opts.scale === undefined || opts.scale === null) ? 1 : opts.scale;
    ctx.save();
    if (opts.alpha !== undefined && opts.alpha !== null) ctx.globalAlpha = opts.alpha;
    ctx.translate(x + w / 2, y + h / 2);
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w * sc / 2, -h * sc / 2, w * sc, h * sc);
    ctx.restore();
  }

  /* --- 小老鼠 --- */
  /* 局部单位：原点在脚底中心，向上为 -y，朝向 +x（由 dir 镜像）。 */
  const M_HX = 17, M_HY = -60, M_HR = 19;
  const M_BX = -2, M_BY = -29, M_BRX = 24, M_BRY = 20;

  function mEars(g, st) {
    g.save(); g.translate(14, -72); g.rotate(st.ear);
    E(g, -11, -6, 12, 12.5, -.2, BODY_D, INK, 2.4);
    E(g, 11, -9, 11.5, 12, .25, BODY, INK, 2.4);
    E(g, 11, -9, 6, 6.5, .25, EAR);
    g.restore();
  }
  function mEyes(g, st, pos) {
    const eyes = pos || [[25, -64, 4.8], [16, -67, 3.2]];
    for (let i = 0; i < eyes.length; i++) {
      const x = eyes[i][0], y = eyes[i][1], r = eyes[i][2];
      if (st.eye === 'x') {
        g.strokeStyle = EYE; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r);
        g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
      } else if (st.eye === 'closed') {
        g.strokeStyle = EYE; g.lineWidth = 2.2;
        g.beginPath(); g.arc(x, y, r, .1 * Math.PI, .9 * Math.PI); g.stroke();
      } else if (st.eye === 'happy') {
        g.strokeStyle = EYE; g.lineWidth = 2.4;
        g.beginPath(); g.arc(x, y, r, 1.1 * Math.PI, 1.9 * Math.PI); g.stroke();
      } else if (st.eye === 'dizzy') {
        g.save(); g.translate(x, y); g.rotate(st.t * 2.2);
        STAR(g, 0, 0, r * 1.3, r * .52, 4, 0);
        g.fillStyle = GOLD; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
        g.restore();
      } else {
        C(g, x, y, r, EYE); C(g, x - r * .3, y - r * .34, r * .36, '#fff');
      }
    }
  }
  function mHead(g, st) {
    E(g, M_HX, M_HY, M_HR, M_HR - 1, -.08, BODY, INK, 2.4);
    E(g, 30, -55, 9.5, 7.5, -.15, BODY_L, INK, 2.2);
    C(g, 37, -57, 3, EAR, INK, 1.4);
    mEyes(g, st);
    g.strokeStyle = 'rgba(16,19,31,.5)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(35, -56); g.lineTo(51, -62);
    g.moveTo(35, -54); g.lineTo(50, -49); g.stroke();
  }
  function mBody(g, st) {
    E(g, M_BX, M_BY + st.bob, M_BRX, M_BRY, -.1, BODY, INK, 2.4);
    E(g, 4, M_BY + st.bob + 7, 13, 10, -.1, BELLY);
  }
  function mPack(g, st) {
    g.save(); g.translate(-30, -33 + st.bob * .6); g.rotate(-.1);
    rr(g, -12, -13, 24, 26, 6); fs(g, PACK, INK, 2.4);
    R(g, -12, -4, 24, 5, PACK_D);
    C(g, -4, -8, 2.6, '#8a5a10'); C(g, 5, 6, 2, '#8a5a10');
    g.restore();
    g.strokeStyle = '#c98f0e'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-22, -44 + st.bob);
    g.quadraticCurveTo(-10, -50 + st.bob, 4, -42 + st.bob); g.stroke();
  }
  function mTail(g, st) {
    const sw = st.tail;
    g.strokeStyle = INK; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-20, -24 + st.bob);
    if (st.tailMode === 'straight') g.bezierCurveTo(-36, -26 + st.bob, -50, -32 + st.bob, -68, -30 + st.bob);
    else if (st.tailMode === 'curl') g.bezierCurveTo(-38, -18 + st.bob, -30, -42 + st.bob, -12, -38 + st.bob);
    else g.bezierCurveTo(-36, -22 + sw * 4, -42, -40 + sw * 6, -60, -32 + sw * 8);
    g.stroke();
    g.strokeStyle = BODY; g.lineWidth = 5.4; g.stroke();
  }
  function mScarf(g, st) {
    const fl = st.scarf, sw = Math.sin(st.t * 9) * (1.5 + fl * 3.5);
    g.save(); g.translate(-1, -42 + st.bob * .5); g.rotate(-.25 - fl * .5);
    g.beginPath(); g.moveTo(0, -6.5);
    g.quadraticCurveTo(-15, -9 + sw, -30 - fl * 9, -3 + sw);
    g.quadraticCurveTo(-15, 1 + sw, 0, 7); g.closePath();
    fs(g, SCARF, INK, 2);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 13; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-4, -44 + st.bob * .5);
    g.quadraticCurveTo(7, -40 + st.bob * .5, 19, -38 + st.bob * .5); g.stroke();
    g.strokeStyle = SCARF; g.lineWidth = 9.6; g.stroke();
    C(g, 17, -40 + st.bob * .5, 4.6, SCARF, INK, 1.6);
  }
  function mLeg(g, hx, hy, ph, mode, col, lw) {
    let fx = hx, fy = 0;
    if (mode === 'swing') { fx = hx + Math.sin(ph) * 12; fy = -Math.max(0, Math.sin(ph + Math.PI / 2)) * 8; }
    else if (mode === 'tuck') { fx = hx + 10; fy = -14; }
    else if (mode === 'trail') { fx = hx - 13; fy = -10; }
    else if (mode === 'spread') { fx = hx + (hx < 0 ? -10 : 12); fy = 0; }
    else if (mode === 'fwd') { fx = hx + 26; fy = -2; }
    else if (mode === 'splay') { fx = hx + (hx < 0 ? -18 : 18); fy = -4; }
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hy);
    g.quadraticCurveTo(hx + (fx - hx) * .4, hy * .45, fx, fy - lw * .4); g.stroke();
    C(g, fx, fy - lw * .35, lw * .62, col);
  }
  function mLegs(g, st) {
    const ph = st.legPhase, m = st.legMode;
    mLeg(g, -8, -19, ph + Math.PI, m, BODY_D, 5.4);
    mLeg(g, 15, -19, ph, m, BODY_D, 5.4);
    mLeg(g, -15, -18, ph, m, BODY, 7);
    mLeg(g, 8, -18, ph + Math.PI, m, BODY, 7);
  }
  function mArms(g, st) {
    if (st.arm <= 0) return;
    g.strokeStyle = INK; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(10, -36); g.quadraticCurveTo(0, -50, -4, -66);
    g.moveTo(18, -38); g.quadraticCurveTo(30, -52, 36, -68); g.stroke();
    g.strokeStyle = BODY; g.lineWidth = 4.8; g.stroke();
    C(g, -4, -66, 3.6, EAR, INK, 1.4); C(g, 36, -68, 3.6, EAR, INK, 1.4);
  }
  function mStars(g, st) {
    for (let i = 0; i < 3; i++) {
      const a = st.t * 5 + i * 2.1;
      STAR(g, 4 + i * 13 + Math.cos(a) * 4, -100 - i * 6 + Math.sin(a * 1.3) * 3, 5.5, 2.2, 4, a);
      g.fillStyle = GOLD; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    }
  }
  function mZzz(g, st) {
    for (let i = 0; i < 2; i++) {
      const p = (st.t * .45 + i * .5) % 1;
      const x = 36 + p * 18, y = -64 - p * 26, s = 4 + p * 5;
      g.globalAlpha = 1 - p; g.strokeStyle = '#cfe4ff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y - s);
      g.lineTo(x, y + s); g.lineTo(x + s, y + s); g.stroke(); g.globalAlpha = 1;
    }
  }
  function mTrail(g) {
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = rgba('#ffffff', .26 - i * .07); g.lineWidth = 8 - i * 2;
      g.beginPath(); g.moveTo(-18, -20 - i * 3);
      g.quadraticCurveTo(-38, -18 - i * 4, -58 - i * 9, -26 - i * 4); g.stroke();
    }
  }

  const PM = {
    idle: { ref: 'h', rh: 88, rw: 118 }, run: { ref: 'h', rh: 88, rw: 118 },
    jump: { ref: 'h', rh: 88, rw: 118, sx: .94, sy: 1.06 },
    fall: { ref: 'h', rh: 88, rw: 118, sx: 1.06, sy: .95 },
    slide: { ref: 'w', rh: 34, rw: 126 }, dash: { ref: 'h', rh: 88, rw: 118, sx: 1.1, sy: .96 },
    hurt: { ref: 'h', rh: 88, rw: 118, sx: .86, sy: 1.14 },
    cheer: { ref: 'h', rh: 88, rw: 118, sx: .95, sy: 1.06 },
    dead: { ref: 'w', rh: 62, rw: 150 }, sleep: { ref: 'w', rh: 58, rw: 122 }
  };
  const POSES = ['run', 'idle', 'jump', 'fall', 'slide', 'dash', 'hurt', 'cheer', 'dead', 'sleep'];

  function poseState(pose, o, t) {
    const st = { t: t, eye: 'open', bob: 0, ear: 0, lean: 0, legPhase: 0, legMode: 'stand', tail: 0, tailMode: 'wave', scarf: 0, arm: 0, trail: false, stars: false };
    const runT = o.runT || 0;
    if (pose === 'idle') {
      st.bob = Math.sin(t * 2.2) * 1.6; st.tail = Math.sin(t * 1.5) * .4;
      st.ear = Math.sin(t * 1.4) * .07;
    } else if (pose === 'run') {
      st.legPhase = runT * 10; st.bob = Math.abs(Math.sin(st.legPhase)) * 2.4;
      st.ear = -.24 - .1 * Math.sin(st.legPhase); st.lean = .13;
      st.legMode = 'swing'; st.tail = Math.sin(t * 12) * .35;
      st.tailMode = 'straight'; st.scarf = .75;
    } else if (pose === 'jump') {
      st.legMode = 'tuck'; st.ear = .12; st.scarf = -.5; st.tail = .2; st.lean = .06;
    } else if (pose === 'fall') {
      st.legMode = 'spread'; st.ear = .28; st.scarf = -.75; st.tail = .3; st.lean = -.1;
    } else if (pose === 'slide') {
      st.legMode = 'fwd'; st.ear = -.5; st.scarf = 1; st.tail = .3; st.tailMode = 'straight';
    } else if (pose === 'dash') {
      st.legMode = 'swing'; st.legPhase = runT * 22; st.ear = -.55;
      st.scarf = 1.2; st.tailMode = 'straight'; st.trail = true; st.lean = .24;
    } else if (pose === 'hurt') {
      st.eye = 'x'; st.legMode = 'spread'; st.ear = -.2; st.stars = true; st.scarf = .3; st.lean = -.2;
    } else if (pose === 'cheer') {
      st.eye = 'happy'; st.legMode = 'tuck'; st.arm = 1; st.ear = .2;
      st.scarf = -.3; st.bob = Math.sin(t * 8) * 2; st.lean = -.06;
    } else if (pose === 'dead') {
      st.eye = 'dizzy'; st.legMode = 'splay'; st.ear = -.7; st.tailMode = 'curl';
    } else if (pose === 'sleep') {
      st.eye = 'closed'; st.legMode = 'tuck'; st.ear = -.35; st.tailMode = 'curl';
      st.bob = Math.sin(t * 1.6) * .8;
    }
    return st;
  }

  /* 直立骨架：奔跑 / 站立 / 跳跃 / 下落 / 冲刺 / 受击 / 欢呼 */
  function drawUpright(g, st) {
    if (st.trail) mTrail(g);
    mTail(g, st);
    mPack(g, st);
    mLegs(g, st);
    mBody(g, st);
    g.save();
    g.translate(10, -46); g.rotate(st.lean); g.translate(-10, 46);
    mEars(g, st); mHead(g, st);
    g.restore();
    mScarf(g, st);
    mArms(g, st);
    if (st.stars) mStars(g, st);
  }

  /* 滑铲：身体压扁拉长，四腿前伸 */
  function drawSlide(g, st) {
    g.strokeStyle = INK; g.lineWidth = 6.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-44, -12); g.quadraticCurveTo(-64, -16, -74, -28); g.stroke();
    g.strokeStyle = BODY; g.lineWidth = 4.2; g.stroke();
    E(g, -8, -11, 42, 11, -.05, BODY, INK, 2.4);
    E(g, 2, -6, 26, 5.5, 0, BELLY);
    g.save(); g.translate(16, -10); g.rotate(-.55);
    E(g, -9, -4, 10, 10, -.2, BODY_D, INK, 2.2);
    E(g, 7, -6, 9.5, 9.5, .2, BODY, INK, 2.2);
    E(g, 7, -6, 5, 5, .2, EAR);
    g.restore();
    E(g, 31, -11, 14, 11.5, -.1, BODY, INK, 2.4);
    E(g, 41, -9, 8, 6, -.15, BODY_L, INK);
    C(g, 47, -11, 2.8, EAR, INK, 1.3);
    mEyes(g, st, [[33, -14, 4.2], [25, -16, 2.9]]);
    g.strokeStyle = 'rgba(16,19,31,.5)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(44, -11); g.lineTo(56, -16); g.moveTo(44, -9); g.lineTo(55, -4); g.stroke();
    g.strokeStyle = BODY_D; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(4, -6); g.quadraticCurveTo(22, -8, 34, -4);
    g.moveTo(10, -3); g.quadraticCurveTo(26, -5, 38, -1); g.stroke();
    g.strokeStyle = BODY; g.lineWidth = 6.4;
    g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(20, -12, 32, -8);
    g.moveTo(6, -7); g.quadraticCurveTo(24, -9, 36, -5); g.stroke();
    g.save(); g.translate(12, -16); g.rotate(-.3);
    g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(-18, -9, -32, -3);
    g.quadraticCurveTo(-17, 2, 0, 6); g.closePath(); fs(g, SCARF, INK, 2);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 11; g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, -15); g.quadraticCurveTo(22, -12, 29, -11); g.stroke();
    g.strokeStyle = SCARF; g.lineWidth = 8; g.stroke();
  }

  /* 死亡：仰卧摊开，四脚朝天，眼冒金星 */
  function drawDead(g, st) {
    E(g, -2, -14, 38, 13, 0, BODY, INK, 2.4);
    E(g, -2, -17, 29, 8, 0, BELLY);
    g.strokeStyle = BODY; g.lineWidth = 6.6; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-18, -24); g.quadraticCurveTo(-24, -32, -26, -42);
    g.moveTo(-6, -26); g.quadraticCurveTo(-10, -34, -10, -44);
    g.moveTo(6, -25); g.quadraticCurveTo(4, -34, 6, -43);
    g.moveTo(16, -22); g.quadraticCurveTo(20, -30, 20, -39); g.stroke();
    C(g, -26, -42, 3.4, BODY, INK, 1.4); C(g, -10, -44, 3.4, BODY, INK, 1.4);
    C(g, 6, -43, 3.4, BODY, INK, 1.4); C(g, 20, -39, 3.4, BODY, INK, 1.4);
    g.save(); g.translate(30, -26); g.rotate(1);
    E(g, -8, -2, 10, 9, 0, BODY_D, INK, 2.2); E(g, 5, -1, 9, 8, 0, BODY, INK, 2.2);
    g.restore();
    g.save(); g.translate(33, -17); g.rotate(.55);
    E(g, 0, 0, 15, 13, 0, BODY, INK, 2.4);
    E(g, -1, 1, 10, 8, 0, BODY_L, INK);
    C(g, -11, 2, 2.8, EAR, INK, 1.3);
    g.restore();
    mEyes(g, st, [[37, -19, 4.2], [30, -20, 2.9]]);
    E(g, 20, -12, 6, 3.2, .3, '#ff7a8f', INK, 1.3);
    g.strokeStyle = INK; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-38, -18); g.quadraticCurveTo(-56, -20, -58, -36); g.stroke();
    g.strokeStyle = BODY; g.lineWidth = 4; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(19, -23); g.quadraticCurveTo(26, -20, 32, -21); g.stroke();
    g.strokeStyle = SCARF; g.lineWidth = 9; g.stroke();
  }

  /* 睡觉：蜷成一团，闭眼，冒 Zzz */
  function drawSleep(g, st) {
    E(g, -6, -11, 30, 12, 0, BODY, INK, 2.4);
    E(g, -2, -6, 19, 5.5, 0, BELLY);
    g.strokeStyle = INK; g.lineWidth = 5.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-32, -13); g.quadraticCurveTo(-42, -3, -24, -3); g.stroke();
    g.strokeStyle = BODY; g.lineWidth = 3.6; g.stroke();
    g.save(); g.translate(15, -18); g.rotate(-.5);
    E(g, -7, -1, 9, 8, 0, BODY_D, INK, 2.2); E(g, 6, -2, 8, 7.5, 0, BODY, INK, 2.2);
    g.restore();
    E(g, 20, -10, 13.5, 11, 0, BODY, INK, 2.4);
    E(g, 31, -8, 8, 6, -.15, BODY_L, INK);
    C(g, 36, -10, 2.6, EAR, INK, 1.2);
    mEyes(g, st, [[23, -13, 3.8], [16, -14, 2.6]]);
    g.strokeStyle = INK; g.lineWidth = 11; g.lineCap = 'round';
    g.beginPath(); g.moveTo(7, -16); g.quadraticCurveTo(14, -13, 19, -14); g.stroke();
    g.strokeStyle = SCARF; g.lineWidth = 8.2; g.stroke();
    mZzz(g, st);
  }

  function drawMouse(ctx, o) {
    if (!ctx) return;
    o = o || {};
    const w = o.w || 34, h = o.h || 26;
    const dir = (o.dir < 0) ? -1 : 1;
    const t = o.t || 0;
    let pose = o.pose || 'run';
    if (POSES.indexOf(pose) < 0) pose = 'run';
    if (o.dead && (pose === 'run' || pose === 'idle' || pose === 'jump' || pose === 'fall')) pose = 'dead';
    const st = poseState(pose, o, t);
    const pm = PM[pose];
    const base = (pm.ref === 'w') ? (w / pm.rw) : (h / pm.rh);
    const sx = (pm.sx || 1) * (o.squashX || 1);
    const sy = (pm.sy || 1) * (o.squashY || 1);
    ctx.save();
    ctx.translate(o.x + w / 2, o.y + h);
    ctx.scale(dir * base * sx, base * sy);
    if (pose === 'slide') drawSlide(ctx, st);
    else if (pose === 'dead') drawDead(ctx, st);
    else if (pose === 'sleep') drawSleep(ctx, st);
    else drawUpright(ctx, st);
    ctx.restore();
    if (o.blush) {
      const bx = o.x + w / 2 + dir * w * .2, by = o.y + h * .36;
      ctx.save();
      ctx.globalAlpha = .5; ctx.fillStyle = '#ff8fa8';
      ctx.beginPath(); ctx.arc(bx - dir * 4, by, w * .09, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + dir * 3, by, w * .09, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  /* --- 调色板 --- */
  const PAL = {
    kitchen: { sky: ['#2b1a24', '#ff9f45'], accent: '#ffb347', silhouette: '#38202a', fog: '#ffcf8a', glow: '#ffd23f' },
    warehouse: { sky: ['#101a2c', '#3f6ea8'], accent: '#4aa3ff', silhouette: '#1b2740', fog: '#8fc4ff', glow: '#7fd4ff' },
    rainforest: { sky: ['#0b1f16', '#2f8f52'], accent: '#39d353', silhouette: '#12281c', fog: '#8bf0a8', glow: '#7dff9e' },
    lava: { sky: ['#1a0c12', '#c43a20'], accent: '#ff5a3c', silhouette: '#2a1218', fog: '#ff9a5a', glow: '#ff8a3c' },
    ice: { sky: ['#0b1826', '#4fb8d8'], accent: '#7ff2ff', silhouette: '#152838', fog: '#cfeeff', glow: '#a8f6ff' },
    void: { sky: ['#07061a', '#3a2470'], accent: '#b07cff', silhouette: '#150f2e', fog: '#c9a3ff', glow: '#d0a8ff' }
  };
  function palette(id) {
    const p = PAL[id] || PAL.kitchen;
    return { sky: [p.sky[0], p.sky[1]], accent: p.accent, silhouette: p.silhouette, fog: p.fog, glow: p.glow };
  }

  /* --- 背景 --- */
  const TW = 640, TH = 320, GY = 280;   // 图块宽 / 高 / 图块内地面线
  const BTILE = Object.create(null), SKYTX = Object.create(null);

  function bgTile(biome, layer) {
    const id = biome + '#' + layer;
    if (BTILE[id]) return BTILE[id];
    const c = cv(TW, TH), g = g2d(c);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const P = PAL[biome] || PAL.kitchen;
    P.sil = P.silhouette; P.acc = P.accent;
    P.s9 = rgba(P.silhouette, .9); P.s92 = rgba(P.silhouette, .92);
    P.a16 = rgba(P.accent, .16); P.a3 = rgba(P.accent, .3);
    P.a35 = rgba(P.accent, .35); P.a45 = rgba(P.accent, .45);
    P.a5 = rgba(P.accent, .5); P.a55 = rgba(P.accent, .55);
    (LAYERS[biome] || LAYERS.kitchen)[layer](g, P);
    BTILE[id] = c;
    return c;
  }
  function skyTex(biome) {
    if (SKYTX[biome]) return SKYTX[biome];
    const c = cv(TW, 200), g = g2d(c);
    if (biome === 'ice') {
      for (let i = 0; i < 2; i++) {
        const gr = g.createLinearGradient(0, 20 + i * 20, 0, 170);
        gr.addColorStop(0, 'rgba(120,255,220,0)');
        gr.addColorStop(.45, 'rgba(120,255,220,' + (.3 - i * .08) + ')');
        gr.addColorStop(1, 'rgba(176,124,255,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(-20, 30 + i * 26);
        for (let x = 0; x <= TW + 20; x += 40) g.lineTo(x, 30 + i * 26 + Math.sin(x * .012 + i) * 22);
        g.lineTo(TW + 20, 190); g.lineTo(-20, 190); g.closePath(); g.fill();
      }
    } else if (biome === 'void') {
      const gr = g.createRadialGradient(TW * .7, 80, 10, TW * .7, 80, 150);
      gr.addColorStop(0, 'rgba(176,124,255,.30)'); gr.addColorStop(1, 'rgba(176,124,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, TW, 200);
      const g2 = g.createRadialGradient(TW * .2, 130, 8, TW * .2, 130, 110);
      g2.addColorStop(0, 'rgba(53,224,200,.20)'); g2.addColorStop(1, 'rgba(53,224,200,0)');
      g.fillStyle = g2; g.fillRect(0, 0, TW, 200);
    } else if (biome === 'lava') {
      const gr = g.createLinearGradient(0, 0, 0, 200);
      gr.addColorStop(0, 'rgba(255,120,60,.20)'); gr.addColorStop(1, 'rgba(255,60,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, TW, 200);
    } else if (biome === 'rainforest') {
      const gr = g.createLinearGradient(0, 0, TW, 200);
      gr.addColorStop(0, 'rgba(200,255,160,.16)'); gr.addColorStop(.5, 'rgba(200,255,160,0)');
      gr.addColorStop(1, 'rgba(200,255,160,.14)');
      g.fillStyle = gr; g.fillRect(0, 0, TW, 200);
    } else if (biome === 'warehouse') {
      for (let i = 0; i < 4; i++) PG(g, [[60 + i * 150, 0], [110 + i * 150, 0], [40 + i * 150, 200], [-10 + i * 150, 200]], 'rgba(140,200,255,.07)');
    } else {
      const gr = g.createRadialGradient(TW * .5, 40, 10, TW * .5, 40, 200);
      gr.addColorStop(0, 'rgba(255,190,110,.22)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = gr; g.fillRect(0, 0, TW, 200);
    }
    SKYTX[biome] = c;
    return c;
  }

  const LAYERS = {
    kitchen: [
      function (g, P) {   // 远：橱柜剪影 + 吊锅
        for (let i = 0; i < 9; i++) {
          const x = i * 74 + 4;
          R(g, x, 168, 64, GY - 168, P.sil);
          R(g, x + 7, 180, 50, 3, P.a16);
          R(g, x + 7, 214, 50, 3, P.a16);
        }
        R(g, 0, 62, TW, 11, P.sil);
        for (let i = 0; i < 5; i++) {
          const x = 56 + i * 128;
          LN(g, x, 72, x, 106, P.sil, 3);
          g.beginPath(); g.arc(x, 118, 16, 0, Math.PI); g.fillStyle = P.sil; g.fill();
        }
      },
      function (g, P) {   // 中：料理台 + 冰箱 + 瓶子
        R(g, 0, 236, TW, GY - 236, P.s92);
        R(g, 0, 232, TW, 5, P.a3);
        R(g, 40, 150, 74, 86, rgba('#2a1620', .85), P.a5);
        R(g, 200, 176, 58, 60, rgba('#2a1620', .8));
        const r = prng(7);
        for (let i = 0; i < 9; i++) {
          const x = 300 + i * 36 + r() * 8, h = 22 + r() * 26;
          R(g, x, 236 - h, 9, h, rgba(r() > .5 ? P.acc : '#e9eef7', .55));
          R(g, x + 1, 236 - h - 6, 7, 6, P.s9);
        }
      },
      function (g, P) {   // 近：前景台面 + 罐子 + 吊灯 + 番茄
        R(g, 0, 268, TW, 100, rgba('#1d1018', .9));
        R(g, 0, 264, TW, 6, P.a35);
        R(g, 60, 236, 40, 30, rgba('#f0e2d0', .28), P.a5);
        R(g, 66, 230, 28, 7, rgba('#e9eef7', .5));
        C(g, 520, 250, 14, rgba('#e04a3a', .75));
        PG(g, [[200, 0], [220, 0], [240, 44], [180, 44]], rgba(P.glow, .45));
      }
    ],
    warehouse: [
      function (g, P) {   // 远：集装箱堆 + 吊车
        for (let i = 0; i < 7; i++) R(g, i * 96 + 8, GY - 100 - (i % 3) * 26, 82, 60 + (i % 3) * 26, P.sil);
        R(g, 430, 60, 10, 150, P.s9);
        R(g, 300, 66, 150, 9, P.s9);
        R(g, 300, 66, 9, 44, P.s9);
      },
      function (g, P) {   // 中：货架 + 纸箱 + 传送带
        for (let i = 0; i < 6; i++) {
          const x = i * 112;
          R(g, x, 150, 8, GY - 150, P.s9);
          R(g, x, 190, 100, 7, P.s9);
          R(g, x, 232, 100, 7, P.s9);
          R(g, x + 12, 168, 42, 22, P.a35);
          R(g, x + 50, 210, 34, 22, P.a35);
        }
        R(g, 0, 258, TW, 12, rgba('#2b3546', .9));
        for (let i = 0; i < 20; i++) R(g, i * 34 + 4, 260, 18, 8, rgba(P.acc, .25));
      },
      function (g, P) {   // 近：板条箱 + 吊灯
        R(g, 0, 262, TW, 60, rgba('#141d2e', .9));
        R(g, 0, 258, TW, 5, P.a3);
        R(g, 70, 214, 62, 48, rgba('#3a4a64', .95), P.a45);
        R(g, 150, 232, 48, 30, rgba('#2c3a52', .95), P.a35);
        PG(g, [[420, 0], [460, 0], [488, 40], [392, 40]], rgba(P.glow, .4));
      }
    ],
    rainforest: [
      function (g, P) {   // 远：远山 + 树冠
        PG(g, [[0, 200], [90, 120], [170, 200]], P.s9);
        PG(g, [[420, 200], [520, 110], [TW, 200]], P.s9);
        for (let i = 0; i < 16; i++) C(g, i * 42 + (i % 2) * 14, 150 + (i % 3) * 18, 34, P.sil);
        R(g, 0, 236, TW, GY - 236, P.sil);
      },
      function (g, P) {   // 中：大叶 + 藤蔓 + 荧光菇
        for (let i = 0; i < 7; i++) {
          g.save(); g.translate(i * 96 + 24, 190 + (i % 2) * 26); g.rotate((i % 2 ? 1 : -1) * .4);
          g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(20, -34, 0, -68);
          g.quadraticCurveTo(-20, -34, 0, 0); g.closePath();
          fs(g, P.a5, P.s9, 2);
          g.restore();
        }
        g.strokeStyle = P.s9; g.lineWidth = 4;
        for (let i = 0; i < 4; i++) {
          const x = 70 + i * 160;
          g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 18, 60, x - 8, 118); g.stroke();
        }
        for (let i = 0; i < 6; i++) {
          const x = 50 + i * 108;
          C(g, x, GY - 6, 7, rgba(P.glow, .8));
          R(g, x - 2, GY - 6, 4, 8, P.s9);
        }
      },
      function (g, P) {   // 近：巨大前景叶
        for (let i = 0; i < 5; i++) {
          g.save(); g.translate(i * 150 + 20, GY + 10); g.rotate((i % 2 ? 1 : -1) * .55);
          g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(46, -60, 0, -120);
          g.quadraticCurveTo(-46, -60, 0, 0); g.closePath();
          fs(g, P.s92, rgba(P.acc, .4), 2);
          g.restore();
        }
        R(g, 0, GY + 14, TW, 40, rgba('#0d1f14', .85));
      }
    ],
    lava: [
      function (g, P) {   // 远：火山剪影 + 熔岩瀑布
        PG(g, [[0, 240], [70, 110], [130, 170], [210, 90], [300, 240]], P.sil);
        PG(g, [[300, 240], [390, 130], [450, 190], [530, 100], [TW, 240]], P.sil);
        R(g, 200, 120, 14, 120, rgba('#ff7a3c', .45));
        R(g, 526, 130, 10, 110, rgba('#ff7a3c', .45));
      },
      function (g, P) {   // 中：黑曜石柱 + 岩浆池
        for (let i = 0; i < 6; i++) {
          const x = i * 112 + 20, h = 60 + (i % 3) * 40;
          PG(g, [[x, GY], [x + 14, GY - h], [x + 30, GY - h + 8], [x + 38, GY]], rgba('#241419', .95), rgba('#ff6a3c', .45));
        }
        E(g, 160, GY - 4, 60, 10, 0, rgba('#ff7a3c', .55));
        E(g, 160, GY - 5, 40, 5, 0, rgba('#ffd23f', .4));
        E(g, 450, GY - 4, 50, 9, 0, rgba('#ff7a3c', .4));
      },
      function (g, P) {   // 近：岩片 + 裂缝
        R(g, 0, GY + 8, TW, 60, rgba('#170a0e', .95));
        for (let i = 0; i < 8; i++) {
          const x = i * 84 + 10, h = 18 + (i % 3) * 16;
          PG(g, [[x, GY + 10], [x + 12, GY + 10 - h], [x + 30, GY + 10]], rgba('#2a1218', .95), rgba('#ff6a3c', .4), 1.6);
        }
        g.strokeStyle = rgba('#ff8a3c', .7); g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(0, GY + 22); g.lineTo(120, GY + 16); g.lineTo(210, GY + 28);
        g.lineTo(330, GY + 18); g.lineTo(460, GY + 30); g.lineTo(TW, GY + 20); g.stroke();
      }
    ],
    ice: [
      function (g, P) {   // 远：冰山剪影
        PG(g, [[0, 240], [60, 110], [110, 170], [180, 80], [260, 240]], P.sil);
        PG(g, [[240, 240], [330, 130], [390, 180], [470, 90], [TW, 240]], P.sil);
        PG(g, [[0, 240], [60, 110], [110, 170], [180, 80], [260, 240]], rgba(P.acc, .18));
      },
      function (g, P) {   // 中：冰晶 + 雪丘
        for (let i = 0; i < 7; i++) {
          const x = i * 96 + 16, h = 50 + (i % 3) * 30;
          PG(g, [[x, GY], [x + 16, GY - h], [x + 30, GY - h * .5], [x + 38, GY]], rgba('#3f7f9c', .8), P.a5, 1.6);
        }
        for (let i = 0; i < 5; i++) E(g, i * 140 + 30, GY - 6, 52, 14, 0, rgba('#dff2ff', .8));
      },
      function (g, P) {   // 近：大冰锥 + 雪堆
        for (let i = 0; i < 5; i++) {
          const x = i * 150 + 30, h = 90 + (i % 2) * 40;
          PG(g, [[x, GY + 12], [x + 20, GY + 12 - h], [x + 34, GY + 12 - h * .4], [x + 40, GY + 12]], rgba('#25506b', .95), P.a55);
        }
        E(g, 140, GY + 12, 90, 18, 0, rgba('#e8f6ff', .9));
        E(g, 460, GY + 10, 110, 20, 0, rgba('#e8f6ff', .9));
      }
    ],
    void: [
      function (g, P) {   // 远：星河 + 星球
        const r = prng(31);
        for (let i = 0; i < 150; i++) {
          const x = r() * TW, y = r() * 230, s = r() * 1.6 + .3;
          R(g, x, y, s, s, rgba('#ffffff', .25 + r() * .6));
        }
        C(g, 500, 74, 34, P.a55);
        g.strokeStyle = rgba('#e6d8ff', .6); g.lineWidth = 3;
        g.beginPath(); g.ellipse(500, 74, 52, 14, -.35, 0, TAU); g.stroke();
      },
      function (g, P) {   // 中：浮石 + 浮空平台
        for (let i = 0; i < 6; i++) {
          const y = 150 + (i % 3) * 40, x = i * 112 + 20;
          PG(g, [[x, y], [x + 26, y - 20], [x + 52, y - 4], [x + 34, y + 22], [x + 6, y + 14]], rgba(P.sil, .95), P.a45, 1.8);
        }
        R(g, 80, GY - 46, 130, 12, rgba('#1d1540', .95), P.a5, 1.6);
        R(g, 380, GY - 66, 150, 12, rgba('#1d1540', .95), P.a5, 1.6);
      },
      function (g, P) {   // 近：大浮石 + 紫色裂隙
        for (let i = 0; i < 4; i++) {
          const x = i * 180 + 40, y = 200 + (i % 2) * 30;
          PG(g, [[x, y], [x + 40, y - 34], [x + 82, y - 8], [x + 56, y + 30], [x + 10, y + 20]], rgba('#0e0a26', .95), P.a5);
        }
        g.strokeStyle = rgba('#d0a8ff', .75); g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(0, GY + 26); g.lineTo(140, GY + 14); g.lineTo(250, GY + 30);
        g.lineTo(400, GY + 12); g.lineTo(TW, GY + 26); g.stroke();
        R(g, 0, GY + 30, TW, 40, rgba('#0a0820', .9));
      }
    ]
  };

  function backdrop(ctx, biomeId, camX, camY, viewW, viewH, t) {
    if (!ctx) return;
    const P = PAL[biomeId] || PAL.kitchen;
    const W = viewW, H = viewH, gy0 = H * .68;
    let raw = 460 - camY;
    if (!(raw > H * .05 && raw < H * 1.4)) raw = gy0;
    const dy = raw - gy0;
    const gr = ctx.createLinearGradient(0, 0, 0, gy0);
    gr.addColorStop(0, P.sky[0]); gr.addColorStop(1, P.sky[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, gy0);
    ctx.fillStyle = rgba(P.silhouette, .9); ctx.fillRect(0, gy0, W, H - gy0);
    ctx.save();
    ctx.globalAlpha = .75 + .2 * Math.sin((t || 0) * .8);
    ctx.drawImage(skyTex(biomeId), 0, 0, W, gy0);
    ctx.restore();
    // 视差：远层贴地平线，近层贴合真实地面线 460-camY
    const PX = [.14, .38, .70], PY = [.08, .85, 1];
    for (let i = 0; i < 3; i++) {
      const img = bgTile(biomeId, i);
      let ox = -((camX * PX[i]) % TW);
      if (ox > 0) ox -= TW;
      const oy = gy0 - GY + dy * PY[i];
      for (let x = ox - TW; x < W; x += TW) ctx.drawImage(img, x, oy, TW, TH);
    }
    const fg = ctx.createLinearGradient(0, gy0 - 60, 0, gy0 + 120);
    fg.addColorStop(0, rgba(P.fog, 0)); fg.addColorStop(.45, rgba(P.fog, .22));
    fg.addColorStop(1, rgba(P.fog, 0));
    ctx.fillStyle = fg; ctx.fillRect(0, gy0 - 60, W, 180);
    ctx.fillStyle = rgba(P.glow, .10 + .04 * Math.sin((t || 0) * 1.3));
    ctx.fillRect(0, gy0 - 3, W, 6);
  }

  /* --- 地面 --- */
  const GT = Object.create(null);
  function gtile(biome, kind) {
    const id = biome + ':' + kind;
    if (GT[id]) return GT[id];
    const w = 64, h = (kind === 'top') ? 22 : 64;
    const c = cv(w, h), g = g2d(c);
    g.lineJoin = 'round'; g.lineCap = 'round';
    (GTILE[biome] || GTILE.kitchen)[kind](g, w, h);
    GT[id] = c;
    return c;
  }
  const GTILE = {
    kitchen: {
      top: (g, w, h) => {
        R(g, 0, 0, w, h, '#c98a3c'); R(g, 0, 0, w, 6, '#e8b464');
        g.strokeStyle = rgba('#8a5a20', .7); g.lineWidth = 1.2;
        g.beginPath();
        for (let i = 1; i < 4; i++) { g.moveTo(i * 16, 6); g.lineTo(i * 16, h); }
        g.moveTo(0, 12); g.lineTo(w, 12); g.stroke();
      },
      body: (g, w, h) => {
        R(g, 0, 0, w, h, '#4a2b18');
        g.strokeStyle = rgba('#2a170c', .8); g.lineWidth = 1.4;
        g.beginPath();
        for (let i = 0; i < 4; i++) { const y = i * 16; g.moveTo(0, y); g.lineTo(w, y); g.moveTo((i % 2) * 16, y); g.lineTo((i % 2) * 16, y + 16); }
        g.stroke();
      }
    },
    warehouse: {
      top: (g, w, h) => {
        R(g, 0, 0, w, h, '#4a5a70'); R(g, 0, 0, w, 6, '#71869f');
        R(g, 0, h - 4, w, 4, rgba('#101822', .55));
        C(g, 8, 11, 2.2, '#a9bcd4'); C(g, 40, 11, 2.2, '#a9bcd4');
      },
      body: (g, w, h) => {
        R(g, 0, 0, w, h, '#2b3546');
        for (let i = 0; i < 4; i++) { R(g, i * 16 + 4, 0, 5, h, rgba('#1a2230', .8)); R(g, i * 16 + 11, 0, 2, h, rgba('#6b7f9c', .35)); }
      }
    },
    rainforest: {
      top: (g, w, h) => {
        R(g, 0, 0, w, 10, '#4fd96b'); R(g, 0, 8, w, 4, '#3bbd55'); R(g, 0, 12, w, h - 12, '#6b4a26');
        for (let i = 0; i < 16; i++) R(g, i * 4, 0, 2, 3 + ((i * 7) % 5), '#8fe8a4');
      },
      body: (g, w, h) => {
        R(g, 0, 0, w, h, '#3a2a18');
        const r = prng(19);
        for (let i = 0; i < 22; i++) C(g, r() * w, r() * h, 1.4 + r() * 2, rgba('#241a0e', .7));
      }
    },
    lava: {
      top: (g, w, h) => {
        R(g, 0, 0, w, h, '#2a1a20'); R(g, 0, 0, w, 3, rgba('#ff6a3c', .85));
        g.strokeStyle = rgba('#ff8a3c', .75); g.lineWidth = 2;
        g.beginPath(); g.moveTo(6, 4); g.lineTo(18, 12); g.lineTo(30, 6); g.lineTo(46, 14); g.lineTo(58, 8); g.stroke();
        g.strokeStyle = rgba('#ffd23f', .5); g.lineWidth = 1.2; g.stroke();
      },
      body: (g, w, h) => {
        R(g, 0, 0, w, h, '#241419');
        g.strokeStyle = rgba('#ff6a3c', .35); g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(0, 18); g.lineTo(16, 34); g.lineTo(32, 22); g.lineTo(48, 40); g.lineTo(64, 28); g.stroke();
        R(g, 0, 48, w, 16, rgba('#0f0a0c', .6));
      }
    },
    ice: {
      top: (g, w, h) => {
        R(g, 0, 0, w, 9, '#eef8ff'); R(g, 0, 9, w, 5, '#c2e4f5'); R(g, 0, 14, w, h - 14, '#2a4a66');
        E(g, 12, 4, 10, 3, 0, 'rgba(255,255,255,.8)'); E(g, 44, 3, 8, 2.6, 0, 'rgba(255,255,255,.8)');
      },
      body: (g, w, h) => {
        R(g, 0, 0, w, h, '#2a4a66');
        PG(g, [[0, 0], [22, 0], [6, h]], rgba('#5fa8cc', .45));
        PG(g, [[40, 0], [58, 0], [46, h]], rgba('#5fa8cc', .45));
        R(g, 0, h - 12, w, 12, rgba('#0f2233', .5));
      }
    },
    void: {
      top: (g, w, h) => {
        R(g, 0, 0, w, h, '#1c1533'); R(g, 0, 0, w, 3, rgba('#b07cff', .8));
        g.strokeStyle = rgba('#d0a8ff', .6); g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(4, 4); g.lineTo(14, 13); g.lineTo(26, 7); g.lineTo(40, 15); g.lineTo(56, 6); g.stroke();
      },
      body: (g, w, h) => {
        R(g, 0, 0, w, h, '#161034');
        const r = prng(23);
        for (let i = 0; i < 16; i++) R(g, r() * w, r() * h, 2, 2, rgba('#b07cff', .35));
        g.strokeStyle = rgba('#7a4fd0', .4); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(0, 26); g.lineTo(20, 40); g.lineTo(44, 22); g.lineTo(w, 38); g.stroke();
      }
    }
  };

  function ground(ctx, biomeId, x, y, w, h, t) {
    if (!ctx || w <= 0 || h <= 0) return;
    const P = PAL[biomeId] || PAL.kitchen;
    const topH = Math.min(22, Math.max(6, h * .35));
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const body = gtile(biomeId, 'body');
    for (let i = 0; i * 64 < w; i++)
      for (let j = 0; j * 64 < h - topH; j++)
        ctx.drawImage(body, x + i * 64, y + topH + j * 64, 64, 64);
    const top = gtile(biomeId, 'top');
    for (let i = 0; i * 64 < w; i++) ctx.drawImage(top, x + i * 64, y, 64, topH);
    if (biomeId === 'lava' || biomeId === 'void') {
      ctx.globalAlpha = .25 + .2 * Math.sin((t || 0) * 2.4);
      ctx.fillStyle = P.glow; ctx.fillRect(x, y, w, 3); ctx.globalAlpha = 1;
    } else if (biomeId === 'ice') {
      ctx.globalAlpha = .18 + .12 * Math.sin((t || 0) * 1.6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, 3); ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = rgba(P.glow, .55); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 2, y + 3.5); ctx.lineTo(x + w - 2, y + 3.5); ctx.stroke();
  }

  /* --- 粒子贴图 --- */
  const PTEX = Object.create(null);
  function particleTex(kind) {
    if (PTEX[kind]) return PTEX[kind];
    let c, g;
    if (kind === 'spark') {
      c = cv(32, 32); g = g2d(c);
      PG(g, [[16, 2], [20, 14], [30, 16], [20, 18], [16, 30], [12, 18], [2, 16], [12, 14]], '#ffffff');
      R(g, 8, 14, 16, 4, rgba('#ffd23f', .5));
    } else if (kind === 'smoke') {
      c = cv(48, 48); g = g2d(c);
      const gr = g.createRadialGradient(24, 24, 2, 24, 24, 24);
      gr.addColorStop(0, 'rgba(226,234,246,.75)'); gr.addColorStop(.5, 'rgba(180,192,210,.35)');
      gr.addColorStop(1, 'rgba(150,160,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 48, 48);
    } else if (kind === 'star') {
      c = cv(32, 32); g = g2d(c);
      STAR(g, 16, 16, 13, 5.4, 5, -Math.PI / 2); fs(g, GOLD, INK, 1.4);
      STAR(g, 16, 16, 6, 2.4, 5, -Math.PI / 2); g.fillStyle = '#fff8dc'; g.fill();
    } else if (kind === 'flame') {
      c = cv(40, 40); g = g2d(c);
      g.beginPath(); g.moveTo(20, 2); g.quadraticCurveTo(34, 15, 32, 25);
      g.quadraticCurveTo(30, 37, 20, 38); g.quadraticCurveTo(10, 37, 8, 25);
      g.quadraticCurveTo(7, 15, 20, 2); g.closePath();
      const gr = g.createLinearGradient(0, 2, 0, 38);
      gr.addColorStop(0, '#fff2b0'); gr.addColorStop(.5, '#ffb43c'); gr.addColorStop(1, '#ff4d3a');
      g.fillStyle = gr; g.fill();
    } else if (kind === 'ring' || kind === 'glow') {
      c = cv(64, 64); g = g2d(c);
      const rg = kind === 'ring';
      const gr = g.createRadialGradient(32, 32, rg ? 20 : 0, 32, 32, rg ? 31 : 32);
      gr.addColorStop(0, rg ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,.9)');
      gr.addColorStop(.55, rg ? 'rgba(255,255,255,.9)' : 'rgba(255,225,160,.45)');
      gr.addColorStop(1, rg ? 'rgba(255,255,255,0)' : 'rgba(255,200,120,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    } else {
      c = cv(64, 64); g = g2d(c);
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.35, 'rgba(255,225,160,.45)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    PTEX[kind] = c;
    return c;
  }

  const api = {
    init: init, sprite: sprite, draw: draw, drawMouse: drawMouse,
    backdrop: backdrop, ground: ground, particleTex: particleTex,
    palette: palette, keys: keys
  };
  return api;
})();
