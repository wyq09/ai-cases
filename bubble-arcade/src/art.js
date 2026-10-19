/* ============================================================
 * 泡泡堂 · src/art.js —— BA.ART 程序化美术
 * 全部离屏 canvas 预渲染（无外部资源）。精灵以 2× 绘制，游戏内缩放绘制，
 * 大屏放大时依然锐利。零 DOM 依赖除 createElement('canvas')。
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});
  var U = BA.CORE.U, P = BA.PARAMS;
  var T = P.TILE, S = 2;                 // 逻辑格 64，精灵 2× = 128

  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function ctxOf(c) { var x = c.getContext('2d'); x.imageSmoothingEnabled = true; return x; }

  /* ---------------- 主题 ---------------- */
  var THEMES = {
    garden: {
      name: '青草庭院', en: 'GARDEN',
      floorA: '#5fbf6a', floorB: '#57b463', floorLine: '#4aa457',
      wallTop: '#8b9ab2', wallFace: '#5b6884', wallDark: '#3d475e', wallHi: '#c2d0e6',
      boxA: '#e0a552', boxB: '#c47f34', boxDark: '#8a5a1c', boxHi: '#ffd79a',
      sky1: '#a8e6a0', sky2: '#4fa85a', accent: '#ffd166', water: '#5fd8ff'
    },
    ice: {
      name: '冰晶雪原', en: 'FROST',
      floorA: '#cfe7f7', floorB: '#c2ddf0', floorLine: '#aacde6',
      wallTop: '#e8f5ff', wallFace: '#8fb6d6', wallDark: '#6c94b8', wallHi: '#ffffff',
      boxA: '#9fd3ee', boxB: '#7fbfe2', boxDark: '#4f8fb6', boxHi: '#dff4ff',
      sky1: '#dff3ff', sky2: '#8cc6ea', accent: '#7fe3ff', water: '#7fe3ff'
    },
    candy: {
      name: '糖果工厂', en: 'CANDY',
      floorA: '#ffd7e6', floorB: '#ffc9dc', floorLine: '#f7b3cc',
      wallTop: '#ffe9f3', wallFace: '#e88fb8', wallDark: '#c26a94', wallHi: '#ffffff',
      boxA: '#ffb066', boxB: '#f79448', boxDark: '#c96a26', boxHi: '#ffe0bd',
      sky1: '#ffe3ef', sky2: '#e58fb8', accent: '#ff6fa5', water: '#8fd8ff'
    },
    factory: {
      name: '钢铁工坊', en: 'FORGE',
      floorA: '#6d7079', floorB: '#63666f', floorLine: '#565a63',
      wallTop: '#a8adb8', wallFace: '#727780', wallDark: '#4e535b', wallHi: '#d3d8e2',
      boxA: '#c98a4a', boxB: '#ac7034', boxDark: '#7d4d1f', boxHi: '#eebd84',
      sky1: '#b9bec9', sky2: '#6a6f79', accent: '#ff9d2f', water: '#67d8f0'
    },
    night: {
      name: '午夜霓虹', en: 'NEON',
      floorA: '#2b2f52', floorB: '#262a4a', floorLine: '#1f2340',
      wallTop: '#4a5386', wallFace: '#333a63', wallDark: '#232848', wallHi: '#7d89c9',
      boxA: '#7b4bb5', boxB: '#663ba0', boxDark: '#472473', boxHi: '#b98cf0',
      sky1: '#4a4f8c', sky2: '#191c33', accent: '#a98bff', water: '#5fd8ff'
    }
  };

  var cache = {};      // key -> canvas
  var items = {};      // type -> canvas
  var itemURLs = {};   // type -> dataURL
  var avatars = {};    // themeId -> dataURL

  /* ---------------- 通用绘制小工具 ---------------- */
  function rr(x, X, Y, W, H, R) {
    x.beginPath();
    x.moveTo(X + R, Y);
    x.lineTo(X + W - R, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + R);
    x.lineTo(X + W, Y + H - R); x.quadraticCurveTo(X + W, Y + H, X + W - R, Y + H);
    x.lineTo(X + R, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - R);
    x.lineTo(X, Y + R); x.quadraticCurveTo(X, Y, X + R, Y);
    x.closePath();
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + amt)));
    g = Math.max(0, Math.min(255, Math.round(g + amt)));
    b = Math.max(0, Math.min(255, Math.round(b + amt)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ================= 地板 ================= */
  function floorTile(th, variant) {
    var key = 'floor_' + th + '_' + variant;
    if (cache[key]) return cache[key];
    var c = cv(T * S, T * S), x = ctxOf(c), th2 = THEMES[th], W = T * S;
    var base = variant % 2 ? th2.floorB : th2.floorA;
    x.fillStyle = base;
    x.fillRect(0, 0, W, W);
    // 细微纹理：草地/雪地小点
    if (th === 'garden') {
      x.fillStyle = 'rgba(255,255,255,.055)';
      for (var i = 0; i < 7; i++) {
        var px = (i * 37 + variant * 53) % (W - 12) + 6;
        var py = (i * 61 + variant * 29) % (W - 12) + 6;
        x.fillRect(px, py, 3 * S, 2 * S);
      }
      x.strokeStyle = 'rgba(40,110,50,.13)'; x.lineWidth = 1.6 * S;
      x.beginPath(); x.moveTo(W * .18, W * .74); x.lineTo(W * .3, W * .62); x.stroke();
    } else if (th === 'ice') {
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1.4 * S;
      x.beginPath(); x.moveTo(W * .2, W * .3); x.lineTo(W * .42, W * .18); x.stroke();
      x.strokeStyle = 'rgba(120,180,220,.25)';
      x.beginPath(); x.moveTo(W * .55, W * .8); x.lineTo(W * .8, W * .66); x.stroke();
    } else if (th === 'candy') {
      x.fillStyle = 'rgba(255,255,255,.32)';
      x.beginPath(); x.arc(W * .3, W * .34, 3 * S, 0, 7); x.fill();
      x.beginPath(); x.arc(W * .72, W * .68, 2 * S, 0, 7); x.fill();
    } else if (th === 'factory') {
      x.strokeStyle = 'rgba(0,0,0,.14)'; x.lineWidth = 1.2 * S;
      x.beginPath(); x.moveTo(W * .12, W * .5); x.lineTo(W * .88, W * .5); x.stroke();
      x.fillStyle = 'rgba(0,0,0,.1)';
      x.beginPath(); x.arc(W * .7, W * .24, 2.2 * S, 0, 7); x.fill();
    } else {
      x.fillStyle = 'rgba(160,180,255,.09)';
      x.fillRect(W * .22, W * .3, 3 * S, 3 * S);
      x.fillRect(W * .68, W * .66, 2 * S, 2 * S);
    }
    // 格线（很淡，保持棋盘可读）
    x.strokeStyle = th2.floorLine;
    x.globalAlpha = .38; x.lineWidth = 1.4 * S;
    x.strokeRect(0, 0, W, W);
    x.globalAlpha = 1;
    cache[key] = c; return c;
  }

  /* ================= 硬墙 ================= */
  function wallTile(th, variant) {
    var key = 'wall_' + th + '_' + variant;
    if (cache[key]) return cache[key];
    var c = cv(T * S, T * S), x = ctxOf(c), th2 = THEMES[th], W = T * S;
    // 底座投影
    x.fillStyle = 'rgba(0,0,0,.22)';
    rr(x, 3 * S, 6 * S, W - 5 * S, W - 6 * S, 8 * S); x.fill();
    // 侧面
    var g = x.createLinearGradient(0, 0, 0, W);
    g.addColorStop(0, th2.wallFace);
    g.addColorStop(1, th2.wallDark);
    x.fillStyle = g;
    rr(x, 2 * S, 2 * S, W - 4 * S, W - 5 * S, 9 * S); x.fill();
    // 顶面
    var g2 = x.createLinearGradient(0, 0, W, W);
    g2.addColorStop(0, th2.wallHi);
    g2.addColorStop(.55, th2.wallTop);
    g2.addColorStop(1, shade(th2.wallTop, -18));
    x.fillStyle = g2;
    rr(x, 3 * S, 2 * S, W - 6 * S, W * .48, 9 * S); x.fill();
    // 高光
    x.fillStyle = 'rgba(255,255,255,.28)';
    rr(x, 7 * S, 5 * S, W - 14 * S, 4 * S, 3 * S); x.fill();
    // 装饰：砖缝 / 铆钉
    x.strokeStyle = 'rgba(0,0,0,.13)'; x.lineWidth = 1.6 * S;
    x.beginPath(); x.moveTo(4 * S, W * .56); x.lineTo(W - 4 * S, W * .56); x.stroke();
    if (variant % 2 === 0) {
      x.fillStyle = 'rgba(255,255,255,.18)';
      [[9, 9], [W / S - 9, 9], [9, W / S - 12], [W / S - 9, W / S - 12]].forEach(function (p) {
        x.beginPath(); x.arc(p[0] * S, p[1] * S, 1.8 * S, 0, 7); x.fill();
      });
    } else {
      x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 1.2 * S;
      x.beginPath(); x.moveTo(W * .5, W * .62); x.lineTo(W * .5, W * .92); x.stroke();
    }
    cache[key] = c; return c;
  }

  /* ================= 软箱（可炸） ================= */
  function boxTile(th, variant) {
    var key = 'box_' + th + '_' + variant;
    if (cache[key]) return cache[key];
    var c = cv(T * S, T * S), x = ctxOf(c), th2 = THEMES[th], W = T * S;
    x.fillStyle = 'rgba(0,0,0,.2)';
    rr(x, 4 * S, 8 * S, W - 8 * S, W - 10 * S, 7 * S); x.fill();
    var g = x.createLinearGradient(0, 0, W, W);
    g.addColorStop(0, th2.boxHi);
    g.addColorStop(.35, th2.boxA);
    g.addColorStop(1, th2.boxB);
    x.fillStyle = g;
    rr(x, 4 * S, 4 * S, W - 8 * S, W - 9 * S, 7 * S); x.fill();
    x.strokeStyle = th2.boxDark; x.lineWidth = 2.4 * S;
    rr(x, 4 * S, 4 * S, W - 8 * S, W - 9 * S, 7 * S); x.stroke();
    // 木板十字
    x.strokeStyle = 'rgba(120,72,20,.42)'; x.lineWidth = 3 * S;
    x.beginPath();
    x.moveTo(6 * S, W * .36); x.lineTo(W - 6 * S, W * .36);
    x.moveTo(6 * S, W * .64); x.lineTo(W - 6 * S, W * .64);
    x.stroke();
    // 斜撑
    x.strokeStyle = 'rgba(120,72,20,.3)'; x.lineWidth = 2.6 * S;
    x.beginPath(); x.moveTo(9 * S, W - 12 * S); x.lineTo(W - 9 * S, 8 * S); x.stroke();
    // 高光
    x.fillStyle = 'rgba(255,255,255,.34)';
    rr(x, 7 * S, 6 * S, W - 14 * S, 4 * S, 2 * S); x.fill();
    // 角钉
    x.fillStyle = th2.boxDark;
    [[8, 8], [W / S - 8, 8], [8, W / S - 13], [W / S - 8, W / S - 13]].forEach(function (p) {
      x.beginPath(); x.arc(p[0] * S, p[1] * S, 1.6 * S, 0, 7); x.fill();
    });
    cache[key] = c; return c;
  }

  /* ================= 角色 ================= */
  var CHARS = [
    { id: 'blue',  name: '蓝波', en: 'BUB',   skin: '#ffd9b8', hair: '#2f6fe0', suit: '#3f8cff', suit2: '#2a63c4', accent: '#8fd0ff', hat: 'cap' },
    { id: 'pink',  name: '粉妮', en: 'NINI',  skin: '#ffe0c8', hair: '#ff7fb0', suit: '#ff8fbe', suit2: '#e05c92', accent: '#ffd0e4', hat: 'twin' },
    { id: 'green', name: '绿仔', en: 'MOMO',  skin: '#ffd9b8', hair: '#4fb85c', suit: '#7ddc6a', suit2: '#4fa83e', accent: '#c8ff9f', hat: 'round' },
    { id: 'violet',name: '紫电', en: 'ZAP',   skin: '#f3c9a0', hair: '#8b5cf6', suit: '#a98bff', suit2: '#7a55dd', accent: '#d9c7ff', hat: 'spike' }
  ];

  // 角色在精灵画布内的绘制（面向下，frame 0..3）
  function drawChar(x, ch, dir, frame, W) {
    var bob = [0, -1.6, 0, 1.6][frame % 4] * S * 0.8;
    var lean = dir === 'left' ? -1 : (dir === 'right' ? 1 : 0);
    var cx = W / 2, baseY = W * 0.9 + bob;

    x.save();
    x.translate(cx, baseY);
    if (lean) x.rotate(lean * 0.04);

    // 影子
    x.fillStyle = 'rgba(0,0,0,.26)';
    x.beginPath(); x.ellipse(0, 2 * S, 17 * S, 5.5 * S, 0, 0, 7); x.fill();

    var bodyH = 17 * S, headR = 13.5 * S, headY = -bodyH - headR * 0.72;

    // 腿
    var legSwing = [0, 1, 0, -1][frame % 4] * 3 * S;
    x.fillStyle = ch.suit2;
    rr(x, -8 * S, -bodyH + 1 * S, 6.5 * S, 12 * S + legSwing * .4, 3 * S); x.fill();
    rr(x, 1.5 * S, -bodyH + 1 * S, 6.5 * S, 12 * S - legSwing * .4, 3 * S); x.fill();
    // 鞋
    x.fillStyle = '#2b2f45';
    rr(x, -9 * S, -5 * S + legSwing * .4, 8 * S, 5 * S, 2.4 * S); x.fill();
    rr(x, 1 * S, -5 * S - legSwing * .4, 8 * S, 5 * S, 2.4 * S); x.fill();

    // 身体
    var g = x.createLinearGradient(0, -bodyH, 0, -2 * S);
    g.addColorStop(0, ch.suit);
    g.addColorStop(1, ch.suit2);
    x.fillStyle = g;
    rr(x, -12 * S, -bodyH - 2 * S, 24 * S, bodyH + 2 * S, 8 * S); x.fill();
    // 胸口浅色
    x.fillStyle = ch.accent;
    rr(x, -6 * S, -bodyH + 2 * S, 12 * S, 9 * S, 4 * S); x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.beginPath(); x.arc(0, -bodyH + 6.5 * S, 2.6 * S, 0, 7); x.fill();

    // 手臂
    x.fillStyle = ch.suit2;
    var armY = -bodyH + 3 * S, swing = [0, 1.5, 0, -1.5][frame % 4] * S;
    if (dir === 'left' || dir === 'right') {
      rr(x, -13 * S, armY + swing * .3, 5.5 * S, 10 * S, 2.6 * S); x.fill();
      rr(x, 7.5 * S, armY - swing * .3, 5.5 * S, 10 * S, 2.6 * S); x.fill();
    } else {
      rr(x, -15 * S, armY - swing * .5, 5.5 * S, 10 * S, 2.6 * S); x.fill();
      rr(x, 9.5 * S, armY + swing * .5, 5.5 * S, 10 * S, 2.6 * S); x.fill();
    }
    // 手套
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(-12.2 * S, armY + 10 * S - swing * .5, 3.1 * S, 0, 7); x.fill();
    x.beginPath(); x.arc(12.2 * S, armY + 10 * S + swing * .5, 3.1 * S, 0, 7); x.fill();

    // 头
    var hg = x.createRadialGradient(-4 * S, headY - 4 * S, 2 * S, 0, headY, headR * 1.25);
    hg.addColorStop(0, shade(ch.skin, 16));
    hg.addColorStop(1, ch.skin);
    x.fillStyle = hg;
    x.beginPath(); x.arc(0, headY, headR, 0, 7); x.fill();

    // 耳朵
    x.fillStyle = shade(ch.skin, -12);
    x.beginPath(); x.arc(-headR * .92, headY + 1.5 * S, 3.2 * S, 0, 7); x.fill();
    x.beginPath(); x.arc(headR * .92, headY + 1.5 * S, 3.2 * S, 0, 7); x.fill();

    // 头发 / 帽子
    drawHair(x, ch, dir, headY, headR);

    // 五官
    var eyeY = headY + 2.2 * S;
    var ex = 5.2 * S, er = 3.5 * S;
    var blink = (frame === 2) ? 0.35 : 1;
    if (dir === 'up') {
      // 背面：不画脸
    } else if (dir === 'left') {
      x.fillStyle = '#20263a';
      x.beginPath(); x.ellipse(-3.5 * S, eyeY, er * .82, er * blink, 0, 0, 7); x.fill();
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(-4.6 * S, eyeY - 1.2 * S, 1.3 * S, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,140,150,.5)';
      x.beginPath(); x.arc(-8.5 * S, eyeY + 4 * S, 2.6 * S, 0, 7); x.fill();
      x.strokeStyle = '#8a4a3a'; x.lineWidth = 1.4 * S; x.lineCap = 'round';
      x.beginPath(); x.arc(-4 * S, eyeY + 6.2 * S, 2.4 * S, .2, 1.5); x.stroke();
    } else if (dir === 'right') {
      x.fillStyle = '#20263a';
      x.beginPath(); x.ellipse(3.5 * S, eyeY, er * .82, er * blink, 0, 0, 7); x.fill();
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(4.6 * S, eyeY - 1.2 * S, 1.3 * S, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,140,150,.5)';
      x.beginPath(); x.arc(8.5 * S, eyeY + 4 * S, 2.6 * S, 0, 7); x.fill();
      x.strokeStyle = '#8a4a3a'; x.lineWidth = 1.4 * S; x.lineCap = 'round';
      x.beginPath(); x.arc(4 * S, eyeY + 6.2 * S, 2.4 * S, 1.65, 2.95); x.stroke();
    } else {
      [-1, 1].forEach(function (s) {
        x.fillStyle = '#20263a';
        x.beginPath(); x.ellipse(s * ex, eyeY, er * .86, er * blink, 0, 0, 7); x.fill();
        x.fillStyle = '#fff';
        x.beginPath(); x.arc(s * ex - 1.2 * S, eyeY - 1.4 * S, 1.5 * S, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,.75)';
        x.beginPath(); x.arc(s * ex + 1.1 * S, eyeY + 1.3 * S, .9 * S, 0, 7); x.fill();
      });
      // 腮红
      x.fillStyle = 'rgba(255,140,150,.42)';
      x.beginPath(); x.arc(-9.2 * S, eyeY + 4.4 * S, 2.8 * S, 0, 7); x.fill();
      x.beginPath(); x.arc(9.2 * S, eyeY + 4.4 * S, 2.8 * S, 0, 7); x.fill();
      // 嘴
      x.strokeStyle = '#a05a4a'; x.lineWidth = 1.5 * S; x.lineCap = 'round';
      x.beginPath(); x.arc(0, eyeY + 4.6 * S, 2.8 * S, .35, Math.PI - .35); x.stroke();
    }
    x.restore();
  }

  function drawHair(x, ch, dir, headY, headR) {
    var hair = ch.hair;
    if (ch.hat === 'cap') {
      // 鸭舌帽
      x.fillStyle = hair;
      x.beginPath();
      x.arc(0, headY - 2 * S, headR * 1.02, Math.PI * 1.02, Math.PI * 1.98);
      x.closePath(); x.fill();
      x.fillStyle = shade(hair, -22);
      if (dir === 'left') { rr(x, -headR * 1.5, headY - 5 * S, headR * .95, 4.6 * S, 2.2 * S); x.fill(); }
      else if (dir === 'right') { rr(x, headR * .55, headY - 5 * S, headR * .95, 4.6 * S, 2.2 * S); x.fill(); }
      else { rr(x, -headR * 1.06, headY - 5.4 * S, headR * 2.12, 4.6 * S, 2.2 * S); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,.4)';
      x.beginPath(); x.arc(0, headY - 2 * S, 3.4 * S, Math.PI * 1.05, Math.PI * 1.85); x.fill();
      // 鬓角
      x.fillStyle = hair;
      x.beginPath(); x.arc(-headR * .82, headY + 3.4 * S, 3.4 * S, 0, 7); x.fill();
      x.beginPath(); x.arc(headR * .82, headY + 3.4 * S, 3.4 * S, 0, 7); x.fill();
    } else if (ch.hat === 'twin') {
      // 双马尾
      x.fillStyle = hair;
      x.beginPath();
      x.arc(0, headY - 2.4 * S, headR * 1.03, Math.PI * .98, Math.PI * 2.02);
      x.closePath(); x.fill();
      var wob = dir === 'left' ? -2 : (dir === 'right' ? 2 : 0);
      [[-1, -headR * 1.02], [1, headR * 1.02]].forEach(function (p) {
        x.fillStyle = shade(hair, -8);
        x.beginPath();
        x.ellipse(p[1] + wob * S, headY + 5 * S, 4.2 * S, 8.4 * S, p[0] * .28, 0, 7);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,.24)';
        x.beginPath();
        x.ellipse(p[1] + wob * S - 1 * S, headY + 3 * S, 1.5 * S, 3.2 * S, p[0] * .28, 0, 7);
        x.fill();
      });
      // 刘海
      x.fillStyle = shade(hair, 10);
      x.beginPath();
      x.arc(0, headY - 3.4 * S, headR * .98, Math.PI * 1.05, Math.PI * 1.95);
      x.closePath(); x.fill();
      x.fillStyle = hair;
      rr(x, -headR * .82, headY - 4 * S, headR * 1.64, 5.4 * S, 3 * S); x.fill();
      // 发带
      x.fillStyle = ch.accent;
      rr(x, -headR * .9, headY - 6.6 * S, headR * 1.8, 3.4 * S, 2 * S); x.fill();
    } else if (ch.hat === 'round') {
      // 圆寸 + 呆毛
      x.fillStyle = hair;
      x.beginPath();
      x.arc(0, headY - 1.8 * S, headR * 1.02, Math.PI * .96, Math.PI * 2.04);
      x.closePath(); x.fill();
      x.strokeStyle = hair; x.lineWidth = 3.4 * S; x.lineCap = 'round';
      x.beginPath(); x.moveTo(0, headY - headR * .96);
      x.quadraticCurveTo(3 * S, headY - headR * 1.5, 8 * S, headY - headR * 1.34);
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,.3)';
      x.beginPath(); x.arc(-4 * S, headY - 6 * S, 3.2 * S, 0, 7); x.fill();
    } else {
      // 刺猬头
      x.fillStyle = hair;
      x.beginPath();
      var n = 7;
      for (var i = 0; i <= n; i++) {
        var a = Math.PI * 1.04 + (Math.PI * .92) * (i / n);
        var rr2 = headR * (i % 2 ? 1.24 : 0.98);
        x.lineTo(Math.cos(a) * rr2, headY - 2 * S + Math.sin(a) * rr2);
      }
      x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,.22)';
      x.beginPath(); x.arc(-4 * S, headY - 7 * S, 3 * S, 0, 7); x.fill();
    }
  }

  function playerSprite(th, dir, frame) {
    var key = 'p_' + th + '_' + dir + '_' + frame;
    if (cache[key]) return cache[key];
    var c = cv(T * S, T * S), x = ctxOf(c);
    var ch = CHARS.filter(function (k) { return k.id === th; })[0] || CHARS[0];
    drawChar(x, ch, dir, frame, T * S);
    cache[key] = c; return c;
  }

  // 困泡：角色缩在泡泡里
  function trappedSprite(th, frame, progress) {
    var key = 'tr_' + th + '_' + frame;
    if (cache[key]) return cache[key];
    var W = T * S, c = cv(W, W), x = ctxOf(c);
    var ch = CHARS.filter(function (k) { return k.id === th; })[0] || CHARS[0];
    var wob = Math.sin(frame * 1.7) * 1.5 * S;
    // 泡泡
    var g = x.createRadialGradient(W * .36, W * .3, W * .04, W * .5, W * .5, W * .46);
    g.addColorStop(0, 'rgba(255,255,255,.92)');
    g.addColorStop(.35, 'rgba(170,235,255,.55)');
    g.addColorStop(.78, 'rgba(90,180,255,.34)');
    g.addColorStop(1, 'rgba(120,200,255,.62)');
    x.fillStyle = g;
    x.beginPath(); x.arc(W * .5, W * .5 + wob, W * .44, 0, 7); x.fill();
    x.strokeStyle = 'rgba(220,245,255,.9)'; x.lineWidth = 2.2 * S;
    x.beginPath(); x.arc(W * .5, W * .5 + wob, W * .44, 0, 7); x.stroke();
    // 里面的人（缩小）
    x.save();
    x.translate(W * .5, W * .56 + wob);
    x.scale(.62, .62);
    x.translate(-W * .5, -W * .5);
    drawChar(x, ch, 'down', 0, W);
    x.restore();
    // 高光
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.beginPath(); x.ellipse(W * .34, W * .26 + wob, W * .085, W * .055, -.5, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.beginPath(); x.arc(W * .62, W * .22 + wob, W * .035, 0, 7); x.fill();
    cache[key] = c; return c;
  }

  /* ================= 泡泡（放置中） ================= */
  function bubbleSprite(frame) {
    var key = 'bub_' + frame;
    if (cache[key]) return cache[key];
    var W = T * S, c = cv(W, W), x = ctxOf(c);
    var t = frame / 8;
    var pulse = 1 + Math.sin(t * Math.PI * 2) * .055;
    var r = W * .40 * pulse;
    var cx = W * .5, cy = W * .5 - Math.abs(Math.sin(t * Math.PI * 2)) * 1.4 * S;
    // 影子
    x.fillStyle = 'rgba(0,0,0,.22)';
    x.beginPath(); x.ellipse(cx, W * .87, r * .78, r * .24, 0, 0, 7); x.fill();
    // 球体
    var g = x.createRadialGradient(cx - r * .3, cy - r * .34, r * .1, cx, cy, r * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,.98)');
    g.addColorStop(.3, 'rgba(200,242,255,.86)');
    g.addColorStop(.68, 'rgba(120,205,255,.78)');
    g.addColorStop(1, 'rgba(70,150,235,.9)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    x.strokeStyle = 'rgba(235,250,255,.95)'; x.lineWidth = 2.2 * S;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    // 内部折射
    x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 1.8 * S;
    x.beginPath(); x.arc(cx, cy, r * .68, .5, 2.2); x.stroke();
    // 高光
    x.fillStyle = 'rgba(255,255,255,.95)';
    x.beginPath(); x.ellipse(cx - r * .36, cy - r * .4, r * .19, r * .12, -.6, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.6)';
    x.beginPath(); x.arc(cx + r * .34, cy - r * .5, r * .075, 0, 7); x.fill();
    cache[key] = c; return c;
  }

  /* ================= 道具 ================= */
  // weight 用于软箱掉落权重；tier 2 = 稀有（额外金色描边）
  var ITEM_TYPES = ['bomb', 'power', 'speed', 'kick', 'shield', 'needle', 'bombpass', 'pierce', 'magnet', 'glove'];
  var ITEM_META = {
    bomb:     { label: '泡泡 +1', short: '泡泡', color: '#5fd8ff', w: 18, tier: 1 },
    power:    { label: '威力 +1', short: '威力', color: '#ff9d2f', w: 18, tier: 1 },
    speed:    { label: '速度 +1', short: '速度', color: '#a6f06a', w: 14, tier: 1 },
    kick:     { label: '踢靴', short: '踢靴', color: '#ff6fa5', w: 10, tier: 1 },
    shield:   { label: '护盾', short: '护盾', color: '#a98bff', w: 10, tier: 1 },
    needle:   { label: '银针 · 自动脱困', short: '银针', color: '#cfe4ff', w: 10, tier: 1 },
    bombpass: { label: '泡泡靴 · 穿过泡泡', short: '穿泡', color: '#7fe3ff', w: 8, tier: 2 },
    pierce:   { label: '钻头 · 水柱穿透', short: '穿透', color: '#8ef0c8', w: 7, tier: 2 },
    magnet:   { label: '磁铁 · 吸取道具', short: '磁铁', color: '#ff5f6d', w: 5, tier: 2 },
    glove:    { label: '手套 · 举起泡泡', short: '手套', color: '#ffd166', w: 4, tier: 2 }
  };

  function itemSprite(type) {
    if (items[type]) return items[type];
    var W = T * S, c = cv(W, W), x = ctxOf(c);
    var meta = ITEM_META[type] || ITEM_META.bomb;
    var cx = W / 2, cy = W / 2;
    // 底托（发光圆盘）
    var g0 = x.createRadialGradient(cx, cy, 2, cx, cy, W * .46);
    g0.addColorStop(0, meta.color);
    g0.addColorStop(.62, shade(meta.color, -30));
    g0.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = .55; x.fillStyle = g0;
    x.beginPath(); x.arc(cx, cy, W * .46, 0, 7); x.fill();
    x.globalAlpha = 1;
    // 稀有道具：金色外环
    if (meta.tier >= 2) {
      x.strokeStyle = 'rgba(255,214,102,.9)';
      x.lineWidth = 3 * S;
      x.beginPath(); x.arc(cx, cy, W * .40, 0, 7); x.stroke();
      x.fillStyle = 'rgba(255,214,102,.95)';
      for (var st = 0; st < 4; st++) {
        var sa = st * Math.PI / 2 + Math.PI / 4;
        x.beginPath();
        x.arc(cx + Math.cos(sa) * W * .40, cy + Math.sin(sa) * W * .40, 3.2 * S, 0, 7);
        x.fill();
      }
    }

    x.save();
    x.translate(cx, cy);
    if (type === 'bomb') {
      x.fillStyle = '#2a3550';
      x.beginPath(); x.arc(0, 2 * S, 13 * S, 0, 7); x.fill();
      x.fillStyle = '#4a5d80';
      x.beginPath(); x.arc(-3 * S, -2 * S, 8 * S, 0, 7); x.fill();
      x.strokeStyle = '#8a6a3a'; x.lineWidth = 3 * S; x.lineCap = 'round';
      x.beginPath(); x.moveTo(4 * S, -10 * S); x.quadraticCurveTo(10 * S, -17 * S, 7 * S, -21 * S); x.stroke();
      x.fillStyle = '#ffc94d';
      x.beginPath(); x.arc(7 * S, -21 * S, 3.4 * S, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.5)';
      x.beginPath(); x.arc(-5 * S, -4 * S, 3.2 * S, 0, 7); x.fill();
      // 小 "+1"
      x.fillStyle = '#fff'; x.font = '700 ' + (11 * S) + 'px monospace';
      x.textAlign = 'center'; x.fillText('+1', 13 * S, 14 * S);
    } else if (type === 'power') {
      // 火焰
      var g = x.createLinearGradient(0, -20 * S, 0, 14 * S);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(.45, '#ffb02e'); g.addColorStop(1, '#e8471f');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(0, -21 * S);
      x.bezierCurveTo(11 * S, -12 * S, 13 * S, 0, 6 * S, 10 * S);
      x.bezierCurveTo(4 * S, 14 * S, -4 * S, 14 * S, -6 * S, 10 * S);
      x.bezierCurveTo(-13 * S, 0, -9 * S, -9 * S, -3 * S, -14 * S);
      x.closePath(); x.fill();
      x.fillStyle = '#fff6cf';
      x.beginPath(); x.ellipse(0, 3 * S, 3.6 * S, 6 * S, 0, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.font = '700 ' + (11 * S) + 'px monospace';
      x.textAlign = 'center'; x.fillText('+1', 13 * S, 15 * S);
    } else if (type === 'speed') {
      // 跑鞋
      x.fillStyle = '#7ddc6a';
      rr(x, -14 * S, -6 * S, 26 * S, 12 * S, 5 * S); x.fill();
      x.fillStyle = '#4fa83e';
      rr(x, -14 * S, 3 * S, 28 * S, 6 * S, 3 * S); x.fill();
      x.fillStyle = '#fff';
      rr(x, -11 * S, -4 * S, 8 * S, 3 * S, 1.5 * S); x.fill();
      // 速度线
      x.strokeStyle = 'rgba(200,255,159,.85)'; x.lineWidth = 2.4 * S; x.lineCap = 'round';
      [-11, -3, 5].forEach(function (yy) {
        x.beginPath(); x.moveTo(-22 * S, yy * S - 4 * S); x.lineTo(-17 * S, yy * S - 4 * S); x.stroke();
      });
      x.fillStyle = '#fff'; x.font = '700 ' + (11 * S) + 'px monospace';
      x.textAlign = 'center'; x.fillText('+1', 13 * S, 15 * S);
    } else if (type === 'kick') {
      // 靴子
      x.fillStyle = '#ff6fa5';
      x.beginPath();
      x.moveTo(-8 * S, -16 * S); x.lineTo(4 * S, -16 * S); x.lineTo(4 * S, 4 * S);
      x.lineTo(15 * S, 4 * S); x.lineTo(15 * S, 12 * S); x.lineTo(-8 * S, 12 * S);
      x.closePath(); x.fill();
      x.fillStyle = '#e0447d';
      rr(x, -9 * S, 10 * S, 26 * S, 5 * S, 2.5 * S); x.fill();
      x.fillStyle = '#fff';
      rr(x, -6 * S, -13 * S, 8 * S, 4 * S, 2 * S); x.fill();
      x.strokeStyle = '#ffd0e4'; x.lineWidth = 2 * S;
      x.beginPath(); x.arc(0, -3 * S, 4 * S, 0, 7); x.stroke();
      // 踢击动效
      x.strokeStyle = 'rgba(255,208,228,.8)'; x.lineWidth = 2 * S; x.lineCap = 'round';
      x.beginPath(); x.arc(0, -2 * S, 15 * S, -.9, .5); x.stroke();
    } else if (type === 'needle') {
      // 银针：针身 + 针眼 + 线
      x.save();
      x.rotate(-0.5);
      var gn = x.createLinearGradient(-16 * S, 0, 16 * S, 0);
      gn.addColorStop(0, '#ffffff'); gn.addColorStop(.5, '#cfe4ff'); gn.addColorStop(1, '#8fa8c8');
      x.fillStyle = gn;
      x.beginPath();
      x.moveTo(17 * S, 0);
      x.lineTo(4 * S, -3.2 * S); x.lineTo(-13 * S, -2.6 * S);
      x.lineTo(-13 * S, 2.6 * S); x.lineTo(4 * S, 3.2 * S);
      x.closePath(); x.fill();
      x.strokeStyle = '#6f88a8'; x.lineWidth = 1.6 * S; x.stroke();
      // 针眼
      x.strokeStyle = '#7f9ec4'; x.lineWidth = 1.8 * S;
      x.beginPath(); x.ellipse(-14.5 * S, 0, 3 * S, 1.5 * S, 0, 0, 7); x.stroke();
      // 线
      x.strokeStyle = '#ffd166'; x.lineWidth = 2.2 * S; x.lineCap = 'round';
      x.beginPath();
      x.moveTo(-16 * S, 0);
      x.quadraticCurveTo(-22 * S, -9 * S, -17 * S, -15 * S);
      x.stroke();
      x.restore();
      // 脱困光芒
      x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2 * S;
      [0.4, 1.6, 2.8, 4.0].forEach(function (a) {
        x.beginPath();
        x.moveTo(Math.cos(a) * 15 * S, Math.sin(a) * 15 * S);
        x.lineTo(Math.cos(a) * 21 * S, Math.sin(a) * 21 * S);
        x.stroke();
      });
    } else if (type === 'bombpass') {
      // 泡泡靴：青色靴 + 泡泡环
      x.fillStyle = '#7fe3ff';
      x.beginPath();
      x.moveTo(-7 * S, -17 * S); x.lineTo(5 * S, -17 * S); x.lineTo(5 * S, 2 * S);
      x.lineTo(15 * S, 2 * S); x.lineTo(15 * S, 11 * S); x.lineTo(-7 * S, 11 * S);
      x.closePath(); x.fill();
      x.fillStyle = '#3fb8dd';
      rr(x, -8 * S, 9 * S, 25 * S, 5 * S, 2.5 * S); x.fill();
      x.fillStyle = '#e8fbff';
      rr(x, -5 * S, -14 * S, 7 * S, 3.6 * S, 1.8 * S); x.fill();
      // 泡泡
      x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.8 * S;
      x.beginPath(); x.arc(-15 * S, -4 * S, 5.5 * S, 0, 7); x.stroke();
      x.beginPath(); x.arc(13 * S, -13 * S, 3.6 * S, 0, 7); x.stroke();
    } else if (type === 'pierce') {
      // 钻头：螺旋锥体
      var gp = x.createLinearGradient(-10 * S, -12 * S, 12 * S, 12 * S);
      gp.addColorStop(0, '#e8fff6'); gp.addColorStop(.5, '#8ef0c8'); gp.addColorStop(1, '#38a882');
      x.fillStyle = gp;
      x.beginPath();
      x.moveTo(0, -20 * S);
      x.lineTo(12 * S, 2 * S);
      x.quadraticCurveTo(0, 16 * S, -12 * S, 2 * S);
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(20,70,58,.55)'; x.lineWidth = 2 * S;
      [-11, -4, 3].forEach(function (yy, i) {
        x.beginPath();
        x.moveTo(-10 * S + i * 2.2 * S, yy * S);
        x.quadraticCurveTo(0, yy * S + 5 * S, 10 * S - i * 2.2 * S, yy * S);
        x.stroke();
      });
      // 穿透箭头
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2.2 * S; x.lineCap = 'round';
      x.beginPath(); x.moveTo(0, 14 * S); x.lineTo(0, 21 * S); x.stroke();
    } else if (type === 'magnet') {
      // 磁铁：红色马蹄 + 银极
      x.strokeStyle = '#ff5f6d'; x.lineWidth = 7 * S; x.lineCap = 'butt';
      x.beginPath(); x.arc(0, -1 * S, 11 * S, Math.PI, 0); x.stroke();
      x.beginPath(); x.moveTo(-11 * S, -1 * S); x.lineTo(-11 * S, 11 * S); x.stroke();
      x.beginPath(); x.moveTo(11 * S, -1 * S); x.lineTo(11 * S, 11 * S); x.stroke();
      x.fillStyle = '#e8eef8';
      rr(x, -15 * S, 8 * S, 8 * S, 7 * S, 1.5 * S); x.fill();
      rr(x, 7 * S, 8 * S, 8 * S, 7 * S, 1.5 * S); x.fill();
      x.fillStyle = '#9fb0c8';
      rr(x, -15 * S, 8 * S, 8 * S, 2.4 * S, 1.2 * S); x.fill();
      rr(x, 7 * S, 8 * S, 8 * S, 2.4 * S, 1.2 * S); x.fill();
      // 吸引弧线
      x.strokeStyle = 'rgba(255,160,170,.85)'; x.lineWidth = 1.8 * S;
      x.beginPath(); x.arc(0, -1 * S, 19 * S, -2.5, -0.6); x.stroke();
      x.beginPath(); x.arc(0, -1 * S, 19 * S, 0.6, 2.5); x.stroke();
    } else if (type === 'glove') {
      // 手套：拳套
      var gg = x.createLinearGradient(0, -16 * S, 0, 14 * S);
      gg.addColorStop(0, '#fff0c2'); gg.addColorStop(.5, '#ffd166'); gg.addColorStop(1, '#e0a41f');
      x.fillStyle = gg;
      rr(x, -13 * S, -16 * S, 26 * S, 20 * S, 9 * S); x.fill();
      x.strokeStyle = 'rgba(120,80,10,.55)'; x.lineWidth = 2 * S; x.stroke();
      // 拇指
      x.fillStyle = '#ffd166';
      x.beginPath(); x.ellipse(-13 * S, 1 * S, 5 * S, 7 * S, 0.3, 0, 7); x.fill();
      // 袖口
      x.fillStyle = '#f2f6ff';
      rr(x, -10 * S, 4 * S, 20 * S, 8 * S, 3 * S); x.fill();
      x.strokeStyle = '#b9c6dd'; x.lineWidth = 1.6 * S; x.stroke();
      // 高光
      x.fillStyle = 'rgba(255,255,255,.7)';
      x.beginPath(); x.ellipse(-4 * S, -10 * S, 6 * S, 3.4 * S, -0.3, 0, 7); x.fill();
      // 抓取箭头
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2.2 * S; x.lineCap = 'round';
      x.beginPath(); x.moveTo(14 * S, -14 * S); x.lineTo(20 * S, -20 * S); x.stroke();
      x.beginPath(); x.moveTo(20 * S, -20 * S); x.lineTo(20 * S, -14 * S); x.stroke();
      x.beginPath(); x.moveTo(20 * S, -20 * S); x.lineTo(14 * S, -20 * S); x.stroke();
    } else {
      var g3 = x.createLinearGradient(0, -18 * S, 0, 16 * S);
      g3.addColorStop(0, '#e2d5ff'); g3.addColorStop(.5, '#a98bff'); g3.addColorStop(1, '#6a48c8');
      x.fillStyle = g3;
      x.beginPath();
      x.moveTo(0, -19 * S);
      x.lineTo(14 * S, -11 * S); x.lineTo(14 * S, 4 * S);
      x.quadraticCurveTo(14 * S, 14 * S, 0, 18 * S);
      x.quadraticCurveTo(-14 * S, 14 * S, -14 * S, 4 * S);
      x.lineTo(-14 * S, -11 * S);
      x.closePath(); x.fill();
      x.strokeStyle = '#f0e9ff'; x.lineWidth = 2.2 * S; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.75)';
      x.beginPath();
      x.moveTo(0, -12 * S); x.lineTo(6 * S, -8 * S); x.lineTo(6 * S, 1 * S);
      x.quadraticCurveTo(6 * S, 7 * S, 0, 10 * S);
      x.quadraticCurveTo(-6 * S, 7 * S, -6 * S, 1 * S);
      x.lineTo(-6 * S, -8 * S); x.closePath(); x.fill();
    }
    x.restore();
    items[type] = c;
    return c;
  }
  function itemURL(type) {
    if (itemURLs[type]) return itemURLs[type];
    var c = itemSprite(type);
    itemURLs[type] = c.toDataURL('image/png');
    return itemURLs[type];
  }

  /* ================= 头像 ================= */
  function avatar(themeId) {
    if (avatars[themeId]) return avatars[themeId];
    var N = 96, c = cv(N, N), x = ctxOf(c);
    var ch = CHARS.filter(function (k) { return k.id === themeId; })[0] || CHARS[0];
    var g = x.createLinearGradient(0, 0, N, N);
    g.addColorStop(0, shade(ch.suit, 40));
    g.addColorStop(1, shade(ch.suit2, -30));
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    // 泡泡点缀
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.beginPath(); x.arc(N * .82, N * .18, N * .1, 0, 7); x.fill();
    x.beginPath(); x.arc(N * .16, N * .8, N * .07, 0, 7); x.fill();
    // 只画头（裁切放大）
    x.save();
    x.translate(N * .5, N * .58);
    var sc = N / (T * S) * 1.72;
    x.scale(sc, sc);
    x.translate(-T * S * .5, -T * S * .52);
    drawChar(x, ch, 'down', 0, T * S);
    x.restore();
    avatars[themeId] = c.toDataURL('image/png');
    return avatars[themeId];
  }

  /* ================= 水柱（运行时绘制） ================= */
  // kind: 'center' | 'mid' | 'end'，axis: 'v'|'h'，dir: 端头朝向 -1/1
  function drawGeyser(x, px, py, size, kind, axis, dir, t, color) {
    var c1 = color || '#5fd8ff';
    var g;
    x.save();
    x.translate(px, py);
    var w = size, half = w / 2;
    var wave = Math.sin(t * 11) * 0.06 + 1;
    if (kind === 'center') {
      g = x.createRadialGradient(half, half, 1, half, half, half * 1.05);
      g.addColorStop(0, 'rgba(255,255,255,.96)');
      g.addColorStop(.34, 'rgba(200,245,255,.9)');
      g.addColorStop(.72, c1);
      g.addColorStop(1, 'rgba(120,200,255,.18)');
      x.fillStyle = g;
      x.beginPath(); x.arc(half, half, half * 0.98 * wave, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.92)';
      x.beginPath(); x.arc(half, half, half * .34, 0, 7); x.fill();
      // 水花
      x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = size * .05;
      for (var i = 0; i < 3; i++) {
        var a = t * 4 + i * 2.1;
        x.beginPath();
        x.arc(half, half, half * (.6 + i * .11), a, a + 1.1); x.stroke();
      }
    } else {
      // 水流臂：中段 / 端头
      var thick = size * (kind === 'end' ? .86 : .78);
      var x0, y0, x1, y1;
      if (axis === 'v') {
        x0 = half - thick / 2; y0 = 0; x1 = thick; y1 = size;
        if (kind === 'end' && dir < 0) { y1 = size * .82; }
        if (kind === 'end' && dir > 0) { y0 = size * .18; y1 = size * .82; }
      } else {
        x0 = 0; y0 = half - thick / 2; x1 = size; y1 = thick;
        if (kind === 'end' && dir < 0) { x1 = size * .82; }
        if (kind === 'end' && dir > 0) { x0 = size * .18; x1 = size * .82; }
      }
      g = x.createLinearGradient(x0, y0, x0 + (axis === 'h' ? x1 : 0), y0 + (axis === 'v' ? y1 : 0));
      g.addColorStop(0, 'rgba(160,235,255,.92)');
      g.addColorStop(.45, 'rgba(255,255,255,.92)');
      g.addColorStop(1, 'rgba(140,220,255,.92)');
      x.fillStyle = g;
      rr(x, x0, y0, x1, y1, thick * .3); x.fill();
      // 流动条纹
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = size * .045;
      for (var k = 0; k < 3; k++) {
        var o = ((t * 1.6 + k / 3) % 1);
        if (axis === 'v') {
          var yy = y0 + (y1 - y0) * o;
          x.beginPath(); x.moveTo(x0 + x1 * .22, yy); x.lineTo(x0 + x1 * .78, yy); x.stroke();
        } else {
          var xx = x0 + (x1 - x0) * o;
          x.beginPath(); x.moveTo(xx, y0 + y1 * .22); x.lineTo(xx, y0 + y1 * .78); x.stroke();
        }
      }
      // 端头圆润
      if (kind === 'end') {
        var ex = axis === 'v' ? half : (dir < 0 ? x1 : x0);
        var ey = axis === 'v' ? (dir < 0 ? y1 : y0) : half;
        x.fillStyle = 'rgba(235,252,255,.95)';
        x.beginPath(); x.arc(ex, ey, thick * .5, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,.7)';
        x.beginPath(); x.arc(ex, ey, thick * .26, 0, 7); x.fill();
      }
    }
    x.restore();
  }

  /* ================= 初始化 ================= */
  function init() {
    // 预热常用精灵，避免首帧卡顿
    Object.keys(THEMES).forEach(function (th) {
      floorTile(th, 0); floorTile(th, 1);
      wallTile(th, 0); wallTile(th, 1);
      boxTile(th, 0); boxTile(th, 1);
    });
    CHARS.forEach(function (ch) {
      ['down', 'up', 'left', 'right'].forEach(function (d) {
        for (var f = 0; f < 4; f++) playerSprite(ch.id, d, f);
      });
      trappedSprite(ch.id, 0); trappedSprite(ch.id, 1);
      avatar(ch.id);
    });
    for (var f = 0; f < 8; f++) bubbleSprite(f);
    ITEM_TYPES.forEach(itemSprite);
  }

  BA.ART = {
    init: init,
    CHARS: CHARS,
    THEMES: THEMES,
    ITEM_TYPES: ITEM_TYPES,
    ITEM_META: ITEM_META,
    tile: function (type, theme, variant) {
      if (type === 1) return wallTile(theme, variant | 0);
      if (type === 2) return boxTile(theme, variant | 0);
      return floorTile(theme, variant | 0);
    },
    player: playerSprite,
    trapped: trappedSprite,
    bubble: bubbleSprite,
    item: itemSprite,
    itemURL: itemURL,
    avatar: avatar,
    drawGeyser: drawGeyser,
    shade: shade
  };
})(window);
