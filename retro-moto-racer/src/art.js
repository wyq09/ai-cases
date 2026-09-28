/* retro-moto-racer — art.js
 * 全部精灵程序化像素绘制：像素矩阵/逐列 fillRect → 离屏 canvas（NEAREST）。
 * 零外部资源：无图片 / 无网络 / 无字体文件（拱门与 LOGO 文字惰性借用 RM.FONT，
 * 缺 FONT 时退化为内置 3×5 微字模，调用方不炸）。
 * 契约 §3：ART.init / bike / prop / arch / backdrop / flame / logo / flag / PAL
 * 调色板锁死 contract §6。
 */
window.RM = window.RM || {};
(function () {
  'use strict';

  /* ================= 调色板（contract §6 采样，锁死） ================= */
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    var g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    var b = Math.min(255, Math.round((n & 255) * f));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  var RIVALS = ['#3fae49', '#3f6fd9', '#e8823c', '#3fb8a8', '#9b59d0', '#e86aa8',
    '#a8d93f', '#9a9aa8', '#a8743f', '#5cd9d9', '#e8e8f0', '#d9c53f'];

  var PAL = {
    SUNSET: {
      SKY: ['#b04a6a', '#d9606a', '#ef8352', '#ffb35c', '#ffd98a'],
      SUN: ['#ffe9b0', '#ffd270'],
      MESA: ['#8d6092', '#6e4a7e'],
      ROCK: ['#bf4d47', '#93362f'],
      SAND: ['#d88d43', '#c07a38']
    },
    DUSK: {
      SKY: ['#6e2450', '#a03a55', '#d4603f', '#f08a4a'],
      SUN: ['#ffd98a', '#ffd270'],
      MESA: ['#5e2f52', '#472442'],
      ROCK: ['#5e2f52', '#472442'],
      SAND: ['#b06a38', '#985c2f']
    },
    NIGHT: {
      SKY: ['#171035', '#241650', '#35206a'],
      SUN: ['#f2ede4', '#cfc9bd'],
      STAR: '#f2ede4',
      MESA: ['#241744', '#1a1033'],
      ROCK: ['#241744', '#1a1033'],
      SAND: ['#4a3550', '#3e2c45']
    },
    ROAD: {
      LIGHT: '#5e5158', DARK: '#544b55',
      YELLOW: '#ffd23f', WHITE: '#f2ede4',
      CURB_RED: '#d94f3d', CURB_WHITE: '#efe6d8', CURB_ORANGE: '#e8823c',
      BARREL: '#e8823c', BARREL_WHITE: '#f2ede4'
    },
    HUD: {
      PANEL: '#2a1420', BORDER: '#4a2432',
      YELLOW: '#ffd23f', WHITE: '#f5f0e6', GREEN: '#57d95c',
      RIDER: '#f2b53d', BIKE: '#3f8fd9'
    },
    BIKE: [{ main: '#e0342c', dark: '#8e1f1c' }]
  };
  for (var ri = 0; ri < RIVALS.length; ri++) {
    PAL.BIKE.push({ main: RIVALS[ri], dark: shade(RIVALS[ri], 0.55) });
  }
  // 三关 Sky/Mesa/Sand 数组（供主线换关插值参考）
  PAL.SKY = [PAL.SUNSET.SKY, PAL.DUSK.SKY, PAL.NIGHT.SKY];
  PAL.MESA = [PAL.SUNSET.MESA, PAL.DUSK.MESA, PAL.NIGHT.MESA];
  PAL.SAND = [PAL.SUNSET.SAND, PAL.DUSK.SAND, PAL.NIGHT.SAND];

  /* ================= 小工具 ================= */
  function C(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return c;
  }
  function px(g, x, y, w, h, col) {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  }
  // 像素矩阵绘制：rows 为字符串数组，'.'/' ' 透明，其余字符查 map
  function mat(g, rows, map, ox, oy) {
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y];
      for (var x = 0; x < r.length; x++) {
        var ch = r.charAt(x);
        if (ch === '.' || ch === ' ') continue;
        var col = map[ch];
        if (!col) continue;
        px(g, ox + x, oy + y, 1, 1, col);
      }
    }
  }

  /* ================= FONT 惰性借用 + 3×5 微字模兜底 ================= */
  var MICRO = {
    A: ['###', '#.#', '###', '#.#', '#.#'],
    C: ['###', '#..', '#..', '#..', '###'],
    E: ['###', '#..', '##.', '#..', '###'],
    F: ['###', '#..', '##.', '#..', '#..'],
    H: ['#.#', '#.#', '###', '#.#', '#.#'],
    I: ['###', '.#.', '.#.', '.#.', '###'],
    K: ['#.#', '#.#', '##.', '#.#', '#.#'],
    N: ['#.#', '##.', '#.#', '.#.', '#.#'],
    O: ['###', '#.#', '#.#', '#.#', '###'],
    P: ['###', '#.#', '###', '#..', '#..'],
    R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['###', '#..', '###', '..#', '###'],
    T: ['###', '.#.', '.#.', '.#.', '.#.']
  };
  function microDraw(g, text, cx, y, s, col) {
    var w = Math.max(0, text.length * 4 - 1) * s;
    var x = cx - Math.round(w / 2);
    g.fillStyle = col;
    for (var i = 0; i < text.length; i++) {
      var gl = MICRO[text.charAt(i)];
      if (gl) {
        for (var yy = 0; yy < 5; yy++) {
          for (var xx = 0; xx < 3; xx++) {
            if (gl[yy].charAt(xx) === '#') g.fillRect(x + i * 4 * s + xx * s, y + yy * s, s, s);
          }
        }
      }
    }
  }
  function fontDraw(g, text, cx, y, s, col) {
    var F = window.RM && window.RM.FONT;
    if (F && F.draw) F.draw(g, text, cx, y, s, col, 'center');
    else microDraw(g, text, cx, y, s, col);
  }

  /* ================= 摩托（背后视角，20×28 本体，含 lean 剪切） ================= */
  // W 头盔白  V 盔影  J 骑手夹克  j 夹克脊光  K 深黑胎/靴  k 胎面
  // S 金属银  s 金属暗  M 主色  m 主色暗  L 尾灯琥珀
  var BIKE_ROWS = [
    '.......WWWWWW.......',
    '......WWWWWWWW......',
    '......WWWWWWVV......',
    '......WWWWWVVV......',
    '......WWWWWVVV......',
    '........JJJJ........',
    '..SS..JJJJJJJJ..SS..',
    '...SJJJJJJJJJJJJS...',
    '..SS..JJJJJJJJ..SS..',
    '....JJJJJJJJJJJJ....',
    '.....JJJJjjJJJJ.....',
    '.....JJJJjjJJJJ.....',
    '.....JJJJJJJJJJ.....',
    '....mMMMMMMMMMMm....',
    '...mMMMMMMMMMMMMm...',
    '....mMMMMLLMMMMm....',
    '....KmMMMMMMMMmK....',
    '.....mmmmmmmmmm.....',
    '....SS..WWWW..SS....',
    '.....SS..WW..SS.....',
    '.....SKKKKKKKKS.....',
    '.....SKKKKKKKKS.....',
    '.....SKkKKKKkKS.....',
    '.....SKKsSSsKKS.....',
    '.....SKKsSSsKKS.....',
    '.....sKKKKKKKKs.....',
    '......KKKKKKKK......',
    '.....KKKKKKKKKK.....'
  ];
  var BIKE_BASE = {
    W: '#f2ede4', V: shade('#f2ede4', 0.78),
    J: '#2a2a34', j: shade('#2a2a34', 1.9),
    K: '#1e1e26', k: shade('#1e1e26', 2.4),
    S: '#9a9aa8', s: shade('#9a9aa8', 0.6),
    L: '#ffd23f'
  };

  function buildBike(colorIdx, lean) {
    var cw = PAL.BIKE[colorIdx] || PAL.BIKE[0];
    var map = { M: cw.main, m: cw.dark };
    for (var k in BIKE_BASE) map[k] = BIKE_BASE[k];
    var c = C(26, 28), g = c.getContext('2d');
    for (var y = 0; y < BIKE_ROWS.length; y++) {
      // 绕底轮(24行)整体剪切，轮子不动，车身上部偏 1-3 格
      var dx = y >= 24 ? 0 : Math.round(lean * 1.5 * (24 - y) / 24);
      if (dx > 3) dx = 3; else if (dx < -3) dx = -3;
      var row = BIKE_ROWS[y];
      for (var x = 0; x < row.length; x++) {
        var ch = row.charAt(x);
        if (ch === '.' || ch === ' ') continue;
        var col = map[ch];
        if (!col) continue;
        px(g, 3 + dx + x, y, 1, 1, col);
      }
    }
    return c;
  }

  /* ================= 道具 ================= */
  function buildBarrel() {
    var A = PAL.ROAD.BARREL, W = PAL.ROAD.BARREL_WHITE;
    var rows = [
      '.dddddddd.',
      'hAAAAAAAAa',
      'hAAAAAAAAa',
      'hWWWWWWWWw',
      'hWWWWWWWWw',
      'hAAAAAAAAa',
      'hAAAAAAAAa',
      'hAAAAAAAAa',
      'hAAAAAAAAa',
      'hWWWWWWWWw',
      'hWWWWWWWWw',
      'hAAAAAAAAa',
      'hAAAAAAAAa',
      '.dddddddd.'
    ];
    var c = C(10, 14), g = c.getContext('2d');
    mat(g, rows, {
      A: A, h: shade(A, 1.25), a: shade(A, 0.6),
      W: W, w: shade(W, 0.82), d: shade(A, 0.42)
    }, 0, 0);
    return c;
  }

  function buildCactus() {
    var G = shade('#3fae49', 0.85), g2 = shade(G, 1.3), d = shade(G, 0.6);
    var c = C(14, 24), g = c.getContext('2d');
    px(g, 7, 3, 2, 2, G);              // 圆顶
    px(g, 6, 5, 4, 19, G);             // 主干
    px(g, 2, 7, 3, 7, G);              // 左臂竖
    px(g, 2, 14, 5, 2, G);             // 左臂弯
    px(g, 10, 4, 3, 7, G);             // 右臂竖
    px(g, 9, 11, 4, 2, G);             // 右臂弯
    px(g, 6, 5, 1, 19, g2);            // 受光棱
    px(g, 2, 7, 1, 9, g2);
    px(g, 10, 4, 1, 9, g2);
    px(g, 9, 5, 1, 19, d);             // 背光棱
    px(g, 4, 14, 1, 2, d);
    px(g, 12, 11, 1, 2, d);
    px(g, 6, 23, 4, 1, d);             // 庉部
    return c;
  }

  function buildRock() {
    var H = '#bf4d47', B = '#93362f', D = shade(B, 0.7);
    var rows = [
      '.....HHHHH......',
      '...HHHHHHHB.....',
      '..HHHHHHHBB.....',
      '.HHHHHHHBBBBDD..',
      'HHHHHHHBBBBBDDD.',
      'HHHHHHBBBBBBDDDD',
      'HHHHHBBBBBBBDDDD',
      '.HHBBBBBBBBDDDD.',
      '.DBBBBBBBBBDDDD.',
      '..DDDDDDDDDDDD..'
    ];
    var c = C(16, 10), g = c.getContext('2d');
    mat(g, rows, { H: H, B: B, D: D }, 0, 0);
    return c;
  }

  function buildBush() {
    var T = '#a8743f', t = shade(T, 1.35), d = shade(T, 0.55);
    var rows = [
      '.t...T...t..',
      '.TT.TTT.TT..',
      '.TTTTTTTTTT.',
      'TTTTTTTTTTTd',
      'TTTTTTTTTddd',
      '.TTTTTTTddd.',
      '..d..dd..d..',
      '..d..dd..d..'
    ];
    var c = C(12, 8), g = c.getContext('2d');
    mat(g, rows, { T: T, t: t, d: d }, 0, 0);
    return c;
  }

  function buildSign() {
    var G = '#3fae49', W = '#f2ede4';
    var c = C(34, 22), g = c.getContext('2d');
    px(g, 4, 16, 3, 6, shade('#9a9aa8', 0.55));   // 左柱
    px(g, 27, 16, 3, 6, shade('#9a9aa8', 0.55));  // 右柱
    px(g, 0, 0, 34, 16, shade(G, 0.5));           // 板底
    px(g, 1, 0, 32, 15, W);                       // 白边
    px(g, 2, 1, 30, 13, G);                       // 绿面
    // 白色箭头块（朝右）
    px(g, 6, 7, 14, 3, W);
    for (var dy = -4; dy <= 4; dy++) px(g, 20, 7 + dy, 5 - Math.abs(dy), 1, W);
    px(g, 1, 14, 32, 1, shade(G, 0.75));          // 面内下沿
    return c;
  }

  function buildLight() {
    var c = C(12, 42), g = c.getContext('2d');
    var P = shade('#9a9aa8', 0.5);
    px(g, 3, 0, 6, 1, '#2a2a34');        // 灯帽
    px(g, 2, 1, 8, 7, '#2a2a34');        // 灯壳
    px(g, 3, 3, 6, 3, '#ffd98a');        // 灯面
    px(g, 3, 6, 6, 1, '#ffd270');
    px(g, 5, 8, 2, 1, '#ffd270');        // 灯下光点
    px(g, 5, 9, 2, 30, P);               // 杆
    px(g, 5, 9, 1, 30, shade(P, 1.35));  // 杆受光
    px(g, 3, 39, 6, 3, '#2a2a34');       // 庉座
    return c;
  }

  /* ================= 跨路拱门（96×34） ================= */
  function buildArch(kind) {
    var c = C(96, 34), g = c.getContext('2d');
    var ckA, ckB, panel, txt;
    if (kind === 'checkpoint') {
      ckA = shade('#3fae49', 0.7); ckB = '#f2ede4';
      panel = shade('#3fae49', 0.45); txt = '#f5f0e6';
    } else {
      ckA = '#1e1e26'; ckB = '#f2ede4';
      panel = '#2a1420';
      txt = kind === 'finish' ? '#ffd23f' : '#f5f0e6';
    }
    // 横幅底 + 上下棋盘/双色条带（3×3 格）
    px(g, 0, 0, 96, 16, shade(ckA, 0.8));
    for (var cy = 0; cy < 2; cy++) {
      var y0 = 1 + cy * 11; // 条带起点 y=1 / y=12
      for (var yy = 0; yy < 3; yy++) {
        for (var cx = 0; cx < 96; cx += 3) {
          px(g, cx, y0 + yy, 3, 1, ((cx / 3 + cy + yy) & 1) ? ckB : ckA);
        }
      }
    }
    px(g, 0, 4, 96, 8, panel);
    var label = kind === 'start' ? 'START' : kind === 'finish' ? 'FINISH' : 'CHECKPOINT';
    fontDraw(g, label, 48, 4, 1, txt);
    px(g, 0, 15, 96, 1, shade(ckA, 0.55));
    // 两根立柱 y16..33
    for (var side = 0; side < 2; side++) {
      var x0 = side ? 88 : 0;
      if (kind === 'checkpoint') {
        px(g, x0, 16, 8, 18, shade('#3fae49', 0.7));
        px(g, x0 + 3, 16, 2, 18, '#f2ede4');
        px(g, x0 + (side ? 0 : 7), 16, 1, 18, shade('#3fae49', 0.45));
      } else {
        for (var py = 16; py < 34; py += 4) {
          for (var pxx = 0; pxx < 8; pxx += 4) {
            px(g, x0 + pxx, py, 4, 4, (((pxx / 4 + py / 4) & 1) ? '#f2ede4' : '#1e1e26'));
          }
        }
        px(g, x0 + (side ? 0 : 7), 16, 1, 18, shade('#1e1e26', 1.4));
      }
    }
    return c;
  }

  /* ================= 背景层（480 宽可平铺 tile） ================= */
  var TILE_W = 480, SKY_H = 160, MESA_H = 56, NEAR_H = 40, DUNE_H = 16;

  function buildSky(stage, P) {
    var c = C(TILE_W, SKY_H), g = c.getContext('2d');
    var cols = P.SKY, n = cols.length;
    var prevB = 0;
    for (var i = 0; i < n; i++) {
      var b = (i === n - 1) ? SKY_H : Math.round(SKY_H * (i + 1) / n);
      px(g, 0, prevB, TILE_W, b - prevB, cols[i]);
      if (i > 0) { // 相邻色带棋盘格抖动过渡
        for (var x = 0; x < TILE_W; x++) {
          if (((x + prevB) & 1) === 0) px(g, x, prevB - 1, 1, 1, cols[i]);
          if (((x + prevB) & 1) === 1) px(g, x, prevB, 1, 1, cols[i - 1]);
        }
      }
      prevB = b;
    }
    if (stage === 2) { // 夜空散点星（确定性伪随机）
      var s = 12345;
      function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
      for (var st = 0; st < 70; st++) {
        var sx = Math.floor(rnd() * TILE_W);
        var sy = Math.floor(rnd() * 118);
        px(g, sx, sy, 1, 1, P.STAR);
      }
      for (var st2 = 0; st2 < 10; st2++) {
        var bx = Math.floor(rnd() * TILE_W);
        var by = Math.floor(rnd() * 100);
        px(g, bx - 1, by, 3, 1, P.STAR);
        px(g, bx, by - 1, 1, 3, P.STAR);
      }
    }
    return c;
  }

  function buildSun(stage, P) {
    var c = C(TILE_W, SKY_H), g = c.getContext('2d');
    var top = P.SUN[0], bot = P.SUN[1];
    if (stage === 0) { // 大低垂太阳 + 横向切缝条纹
      var cx = 240, cy = 118, r = 36;
      for (var dy = -r; dy <= r; dy++) {
        var y = cy + dy;
        if (y < 0 || y >= SKY_H) continue;
        if (dy > 8 && (dy % 7) < 2) continue;
        var half = Math.floor(Math.sqrt(r * r - dy * dy));
        px(g, cx - half, y, half * 2 + 1, 1, dy < -6 ? top : bot);
      }
    } else if (stage === 1) { // 半落太阳（贴地平线，近水线切缝）
      var cx1 = 240, cy1 = SKY_H, r1 = 32;
      for (var y1 = cy1 - r1; y1 < SKY_H; y1++) {
        if (y1 < 0) continue;
        if (y1 > SKY_H - 12 && ((y1 - SKY_H) % 3) === 0) continue;
        var half1 = Math.floor(Math.sqrt(r1 * r1 - (y1 - cy1) * (y1 - cy1)));
        px(g, cx1 - half1, y1, half1 * 2 + 1, 1, y1 < cy1 - 10 ? top : bot);
      }
    } else { // 小月亮（弦月 + 陨石坑点）
      var mx = 120, my = 40, mr = 9;
      var bxx = 125, byy = 36, br = 7;
      for (var ym = my - mr; ym <= my + mr; ym++) {
        for (var xm = mx - mr; xm <= mx + mr; xm++) {
          var dm = (xm - mx) * (xm - mx) + (ym - my) * (ym - my);
          var db = (xm - bxx) * (xm - bxx) + (ym - byy) * (ym - byy);
          if (dm <= mr * mr && db > br * br) px(g, xm, ym, 1, 1, P.SUN[0]);
        }
      }
      px(g, 116, 42, 2, 1, P.SUN[1]);
      px(g, 119, 45, 1, 1, P.SUN[1]);
    }
    return c;
  }

  var FAR_BLOCKS = [
    [[36, 64, 30], [128, 44, 20], [196, 96, 40], [318, 54, 24], [392, 72, 34]],
    [[16, 88, 30], [132, 64, 38], [224, 76, 24], [330, 96, 34]],
    [[24, 80, 28], [140, 56, 34], [226, 70, 22], [326, 88, 32]]
  ];
  var NEAR_BLOCKS = [
    [[10, 132, 24], [176, 72, 15], [286, 168, 30]],
    [[20, 150, 28], [220, 90, 16], [350, 110, 22]],
    [[14, 140, 24], [190, 100, 18], [330, 120, 26]]
  ];

  function buildMesas(stage, P, near) {
    var Hh = near ? NEAR_H : MESA_H;
    var base = near ? 6 : 10;
    var pair = near ? P.ROCK : P.MESA;
    var lit = pair[0], bod = pair[1];
    var c = C(TILE_W, Hh), g = c.getContext('2d');
    px(g, 0, Hh - base, TILE_W, base, bod); // 基带连到 tile 两缘 → 无缝
    var blocks = (near ? NEAR_BLOCKS : FAR_BLOCKS)[stage];
    for (var bi = 0; bi < blocks.length; bi++) {
      var bx = blocks[bi][0], bw = blocks[bi][1], top = blocks[bi][2];
      for (var x = bx; x < bx + bw; x++) {
        var t = top;
        var e = x - bx, er = bx + bw - 1 - x;
        if (e === 0) t -= 5; else if (e === 1) t -= 3; else if (e === 2) t -= 1;
        if (er === 0) t -= 4; else if (er === 1) t -= 2;
        if (t < base) t = base;
        px(g, x, Hh - t, 1, t, bod);
      }
      px(g, bx + 2, Hh - top, 2, top - 1, lit);          // 左侧受光面
      px(g, bx, Hh - top, bw, 1, lit);                   // 顶缘受光
      if (near) {                                        // 红岩横向地层纹
        for (var sy = Hh - top + 4; sy < Hh - 1; sy += 5) {
          px(g, bx + 5, sy, bw - 10, 1, shade(bod, 0.82));
        }
      }
    }
    return c;
  }

  function buildDunes(P) {
    var c = C(TILE_W, DUNE_H), g = c.getContext('2d');
    var light = P.SAND[0], dark = P.SAND[1];
    for (var x = 0; x < TILE_W; x++) {
      var h = 8 + 3 * Math.sin(x / TILE_W * Math.PI * 2 * 2) +
        2 * Math.sin(x / TILE_W * Math.PI * 2 * 5 + 1.3);
      var hy = Math.round(h);
      if (hy < 1) hy = 1; if (hy > DUNE_H - 2) hy = DUNE_H - 2;
      px(g, x, hy, 1, 3, light);
      px(g, x, hy + 3, 1, DUNE_H - hy - 3, dark);
      if (((x + hy) & 1) === 0) px(g, x, hy + 3, 1, 1, light); // 抖动过渡
    }
    return c;
  }

  function buildBackdrop(stage) {
    var P = [PAL.SUNSET, PAL.DUSK, PAL.NIGHT][stage] || PAL.SUNSET;
    return {
      sky: buildSky(stage, P),
      sun: buildSun(stage, P),
      mesasFar: buildMesas(stage, P, false),
      mesasNear: buildMesas(stage, P, true),
      dunes: buildDunes(P)
    };
  }

  /* ================= 氮气尾焰 / LOGO / 格纹旗 ================= */
  var FLAME_ROWS = [
    ['...WW...',
      '..WWWW..',
      '.CWWWWC.',
      '.CWWWWC.',
      '.BWWWWB.',
      '.BWWWWB.',
      '.OBWWBO.',
      '.OBWWBO.',
      '..OBBO..',
      '..OBBO..',
      '...OO...',
      '...O....'],
    ['...WW...',
      '..WWWW..',
      '.CWWWWC.',
      '.BWWWWB.',
      '.BWWWWB.',
      '.OBWWBO.',
      '..OBBO..',
      '..OBBO..',
      '...OO...',
      '...O....',
      '........',
      '........']
  ];
  function buildFlame(f) {
    var c = C(8, 12), g = c.getContext('2d');
    mat(g, FLAME_ROWS[f] || FLAME_ROWS[0], {
      W: '#f5f0e6', C: '#5cd9d9', B: '#3f6fd9', O: '#e8823c'
    }, 0, 0);
    return c;
  }

  function logoText(g, text, cx, y, s) {
    var F = window.RM && window.RM.FONT;
    if (!(F && F.draw)) { microDraw(g, text, cx, y, s, '#ffd23f'); return; }
    F.draw(g, text, cx, y, s, '#2a1420', 'center', '#2a1420'); // 深描边体
    var parts = [[0, 3, '#ffd23f'], [3, 5, '#ffb35c'], [5, 7, '#e8823c']]; // 黄→橙分层
    for (var i = 0; i < parts.length; i++) {
      g.save();
      g.beginPath();
      g.rect(0, y + parts[i][0] * s, 220, (parts[i][1] - parts[i][0]) * s);
      g.clip();
      F.draw(g, text, cx, y, s, parts[i][2], 'center');
      g.restore();
    }
  }

  function buildLogo() {
    var c = C(220, 76), g = c.getContext('2d');
    // 落日圆盘衬底（下半横向切缝）
    var cx = 110, cy = 40, r = 34;
    for (var dy = -r; dy <= r; dy++) {
      var y = cy + dy;
      if (y < 0 || y >= 76) continue;
      if (dy > 8 && (dy % 7) < 2) continue;
      var half = Math.floor(Math.sqrt(r * r - dy * dy));
      px(g, cx - half, y, half * 2 + 1, 1, dy < -6 ? '#ffe9b0' : '#ffd270');
    }
    logoText(g, 'SUNSET', 110, 2, 6);
    logoText(g, 'RIDE', 110, 48, 4);
    return c;
  }

  function buildFlag() {
    var W = '#f2ede4', G = shade(W, 0.78);
    var rows = [
      '.s.......',
      '.sWWGGWW.',
      '.sWWGGWW.',
      '.sGGWWGG.',
      '.sGGWWGG.',
      '.sWWGGWW.',
      '.s.......'
    ];
    var c = C(9, 7), g = c.getContext('2d');
    mat(g, rows, { W: W, G: G, s: shade('#9a9aa8', 0.55) }, 0, 0);
    return c;
  }

  /* ================= 构建 & 接口 ================= */
  var ready = false;
  var bikeCache = {}, propCache = {}, archCache = {};
  var bdCache = [], flameCache = [], flagC = null, logoC = null;

  function init() {
    if (ready) return;
    ready = true;
    var i, l;
    for (i = 0; i < PAL.BIKE.length; i++) {
      for (l = -2; l <= 2; l++) bikeCache[i + '_' + l] = buildBike(i, l);
    }
    propCache.barrel = buildBarrel();
    propCache.cactus = buildCactus();
    propCache.rock = buildRock();
    propCache.bush = buildBush();
    propCache.sign = buildSign();
    propCache.light = buildLight();
    archCache.start = buildArch('start');
    archCache.checkpoint = buildArch('checkpoint');
    archCache.finish = buildArch('finish');
    for (i = 0; i < 3; i++) bdCache[i] = buildBackdrop(i);
    flameCache = [buildFlame(0), buildFlame(1)];
    flagC = buildFlag();
    logoC = buildLogo();
  }

  function bike(colorIdx, lean) {
    if (!ready) init();
    var ci = Math.max(0, Math.min(PAL.BIKE.length - 1, colorIdx | 0));
    var ln = Math.max(-2, Math.min(2, Math.round(lean || 0)));
    return bikeCache[ci + '_' + ln] || buildBike(ci, ln);
  }
  function prop(id) {
    if (!ready) init();
    return propCache[id] || null;
  }
  function arch(kind) {
    if (!ready) init();
    return archCache[kind] || null;
  }
  function backdrop(stage) {
    if (!ready) init();
    return bdCache[stage] || bdCache[0];
  }
  function flame(f) {
    if (!ready) init();
    return flameCache[f ? 1 : 0];
  }
  function logo() {
    if (!ready) init();
    return logoC;
  }
  function flag() {
    if (!ready) init();
    return flagC;
  }

  window.RM.ART = {
    init: init,
    bike: bike,
    prop: prop,
    arch: arch,
    backdrop: backdrop,
    flame: flame,
    logo: logo,
    flag: flag,
    PAL: PAL
  };
})();
