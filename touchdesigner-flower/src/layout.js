/* Flower · 构图：全部坐标以参考图（996×1388 像素）为基准定义。
   花心 / 叶片 / 雾团 / 丝线 / 散景的位置都从参考图量出来，默认视角下与参考图对位。
   纯数据 + 纯函数，node 回归可校验。 */
(function (root) {
  'use strict';
  var TF = root.TF;

  var FRAME = (TF.FRAME = { w: 996, h: 1388, aspect: 996 / 1388, focal: 24, unit: 0.01 });
  var DEG = Math.PI / 180;

  /* 参考图像素 → 世界坐标。depth 为到相机的距离（世界单位）；越近的花越大，投影后仍等于参考图像素尺寸 */
  TF.toWorld = function (px, py, depth) {
    var k = (depth / FRAME.focal) * FRAME.unit;
    return [(px - FRAME.w / 2) * k, (FRAME.h / 2 - py) * k, -depth];
  };
  TF.pxScale = function (depth) { return (depth / FRAME.focal) * FRAME.unit; };

  /* 花朵朝向：tilt = 花盘偏离正对镜头的角度；lean = 哪一侧远离镜头（0=上，90=右，180=下，顺时针度数） */
  TF.flowerQuat = function (tiltDeg, leanDeg, out) {
    var a = leanDeg * DEG;
    return TF.quatAxisAngle(Math.cos(a), -Math.sin(a), 0, -tiltDeg * DEG);
  };

  /* ---------- 花朵：disc 花盘半径 / petal 外圈花瓣长（均为参考图像素） ---------- */
  var FLOWERS = [
    { id: 'T',  x: 655, y: 292,  disc: 117, petal: 186, width: 0.36, tilt: 55, lean: -8,  depth: 27.5, spin: 2.6,  petals: 22, gain: 0.92 },
    { id: 'LU', x: 255, y: 478,  disc: 50,  petal: 168, width: 0.30, tilt: 38, lean: 186, depth: 26.5, spin: -3.4, petals: 17, gain: 0.95 },
    { id: 'CL', x: 380, y: 665,  disc: 46,  petal: 212, width: 0.27, tilt: 30, lean: 160, depth: 23.0, spin: 2.0,  petals: 17, gain: 1.00 },
    { id: 'R',  x: 790, y: 640,  disc: 39,  petal: 118, width: 0.34, tilt: 22, lean: 100, depth: 24.5, spin: -4.2, petals: 14, gain: 0.92 },
    { id: 'BR', x: 700, y: 990,  disc: 68,  petal: 138, width: 0.38, tilt: 6,  lean: 0,   depth: 20.5, spin: 3.0,  petals: 20, gain: 1.10 },
    { id: 'BL', x: 222, y: 1005, disc: 54,  petal: 150, width: 0.34, tilt: 42, lean: 196, depth: 22.0, spin: -2.4, petals: 16, gain: 0.80 }
  ];

  /* ---------- 叶片：x,y = 叶心；len = 长；w = 最宽处/长；dir = 叶尖方向（0=上，顺时针）；tone 0=纯绿 1=偏金 ---------- */
  /* 底部亮绿叶：从花束中心向四周铺开，参考图 y≈1060~1388 整片被绿叶填满 */
  var LEAF_BRIGHT = [
    { x: 218, y: 1172, len: 196, w: 0.66, dir: 318, depth: 21.6, gain: 1.35, tone: 0.03, tilt: 16 },
    { x: 322, y: 1228, len: 184, w: 0.62, dir: 164, depth: 21.4, gain: 1.30, tone: 0.04, tilt: 14 },
    { x: 398, y: 1308, len: 158, w: 0.56, dir: 182, depth: 21.2, gain: 1.15, tone: 0.04, tilt: 12 },
    { x: 622, y: 1304, len: 186, w: 0.56, dir: 192, depth: 21.4, gain: 1.15, tone: 0.04, tilt: 12 },
    { x: 500, y: 1122, len: 184, w: 0.60, dir: 104, depth: 22.0, gain: 1.15, tone: 0.08, tilt: 22 },
    { x: 690, y: 1112, len: 170, w: 0.58, dir: 128, depth: 22.4, gain: 1.05, tone: 0.08, tilt: 22 },
    { x: 798, y: 1300, len: 168, w: 0.56, dir: 152, depth: 22.0, gain: 1.05, tone: 0.06, tilt: 16 },
    { x: 866, y: 1240, len: 150, w: 0.54, dir: 132, depth: 22.8, gain: 0.95, tone: 0.10, tilt: 22 },
    { x: 150, y: 1250, len: 150, w: 0.56, dir: 200, depth: 22.2, gain: 1.00, tone: 0.05, tilt: 16 },
    { x: 262, y: 1100, len: 140, w: 0.56, dir: 250, depth: 22.6, gain: 1.00, tone: 0.06, tilt: 20 },
    { x: 452, y: 1200, len: 128, w: 0.52, dir: 150, depth: 21.0, gain: 1.10, tone: 0.05, tilt: 14 },
    { x: 740, y: 1216, len: 134, w: 0.52, dir: 206, depth: 21.6, gain: 1.00, tone: 0.06, tilt: 16 },
    { x: 560, y: 1340, len: 118, w: 0.50, dir: 172, depth: 21.0, gain: 0.90, tone: 0.04, tilt: 12 },
    { x: 356, y: 1140, len: 126, w: 0.54, dir: 84,  depth: 22.2, gain: 1.00, tone: 0.08, tilt: 20 },
    { x: 850, y: 1120, len: 150, w: 0.54, dir: 140, depth: 23.0, gain: 0.95, tone: 0.10, tilt: 22 },
    { x: 190, y: 1090, len: 136, w: 0.54, dir: 276, depth: 22.8, gain: 1.00, tone: 0.08, tilt: 20 }
  ];
  var LEAF_MID = [
    { x: 492, y: 244, len: 190, w: 0.60, dir: 332, depth: 27.8, gain: 1.13, tone: 0.07, tilt: 30 },
    { x: 128, y: 478, len: 168, w: 0.62, dir: 316, depth: 26.8, gain: 1.25, tone: 0.00, tilt: 28 },
    { x: 586, y: 466, len: 186, w: 0.60, dir: 232, depth: 26.6, gain: 1.04, tone: 0.17, tilt: 34 },
    { x: 926, y: 600, len: 206, w: 0.56, dir: 200, depth: 26.0, gain: 1.04, tone: 0.06, tilt: 26 },
    { x: 170, y: 792, len: 206, w: 0.58, dir: 128, depth: 25.6, gain: 0.90, tone: 0.13, tilt: 30 },
    { x: 534, y: 912, len: 196, w: 0.55, dir: 136, depth: 24.6, gain: 1.19, tone: 0.03, tilt: 26 },
    { x: 676, y: 822, len: 172, w: 0.55, dir: 230, depth: 24.8, gain: 1.04, tone: 0.06, tilt: 30 },
    { x: 878, y: 384, len: 168, w: 0.55, dir: 196, depth: 27.0, gain: 0.75, tone: 0.24, tilt: 34 },
    { x: 320, y: 630, len: 150, w: 0.55, dir: 70,  depth: 26.2, gain: 0.75, tone: 0.24, tilt: 32 },
    { x: 784, y: 492, len: 150, w: 0.52, dir: 300, depth: 26.4, gain: 0.75, tone: 0.24, tilt: 32 },
    { x: 812, y: 1020, len: 170, w: 0.55, dir: 150, depth: 23.6, gain: 1.19, tone: 0.05, tilt: 24 },
    { x: 520, y: 1040, len: 160, w: 0.55, dir: 100, depth: 23.4, gain: 1.10, tone: 0.05, tilt: 24 },
    { x: 352, y: 962,  len: 150, w: 0.55, dir: 250, depth: 23.8, gain: 1.04, tone: 0.07, tilt: 26 }
  ];

  /* ---------- 雾团（大面积软噪声）：填充花与花之间，tone 0=绿 1=金，k=强度 ---------- */
  var HAZE = [
    { x: 640, y: 250,  r: 330, depth: 29.0, tone: 1.00, k: 0.62 },
    { x: 872, y: 420,  r: 230, depth: 29.5, tone: 1.00, k: 0.55 },
    { x: 470, y: 330,  r: 250, depth: 29.0, tone: 0.64, k: 0.66 },
    { x: 250, y: 470,  r: 270, depth: 28.5, tone: 0.80, k: 0.66 },
    { x: 380, y: 680,  r: 300, depth: 27.5, tone: 0.76, k: 0.66 },
    { x: 800, y: 640,  r: 250, depth: 27.5, tone: 0.90, k: 0.60 },
    { x: 600, y: 560,  r: 280, depth: 28.5, tone: 0.60, k: 0.66 },
    { x: 230, y: 1010, r: 260, depth: 26.0, tone: 0.76, k: 0.60 },
    { x: 700, y: 990,  r: 280, depth: 25.5, tone: 0.66, k: 0.66 },
    { x: 500, y: 860,  r: 280, depth: 27.0, tone: 0.60, k: 0.66 },
    { x: 520, y: 1230, r: 420, depth: 26.0, tone: 0.30, k: 0.74 }
  ];

  /* ---------- 丝线：细金线（首尾两点，参考图像素） ---------- */
  var THREADS = [
    { x0: 541, y0: 182, x1: 527, y1: 905,  b: 0.95 },
    { x0: 770, y0: 178, x1: 838, y1: 1012, b: 1.00 },
    { x0: 521, y0: 736, x1: 748, y1: 1022, b: 0.72 },
    { x0: 105, y0: 985, x1: 242, y1: 1036, b: 0.50 },
    { x0: 136, y0: 1022, x1: 203, y1: 1162, b: 0.34 }
  ];
  /* 发丝般的卷曲细线（折线点列） */
  var HAIRS = [
    { pts: [[88, 150], [118, 128], [150, 132], [162, 158], [150, 186], [128, 192]], b: 0.55 },
    { pts: [[262, 198], [296, 250], [318, 296], [334, 306]], b: 0.30 },
    { pts: [[62, 1128], [104, 1148], [150, 1150], [182, 1136]], b: 0.55 },
    { pts: [[956, 296], [938, 344], [928, 384]], b: 0.30 },
    { pts: [[86, 250], [112, 282], [120, 318]], b: 0.25 },
    { pts: [[900, 560], [930, 640], [918, 720]], b: 0.30 }
  ];

  /* ---------- 散景：颜色 c（线性）= orange / violet / blue / cyan ---------- */
  var C = {
    orange: [1.0, 0.42, 0.05],
    violet: [0.62, 0.16, 1.0],
    blue: [0.16, 0.36, 1.0],
    cyan: [0.10, 0.70, 0.9]
  };
  var BOKEH = [
    [201, 1049, 13, 'orange', 1.0], [242, 1046, 17, 'orange', 0.55], [214, 1356, 11, 'orange', 0.8], [118, 880, 7, 'orange', 0.5],
    [177, 1090, 10, 'violet', 1.0], [330, 1085, 11, 'violet', 0.9], [90, 1200, 7, 'violet', 0.8], [262, 668, 6, 'violet', 0.9],
    [487, 715, 6, 'violet', 0.8], [515, 720, 6, 'violet', 0.7], [320, 333, 7, 'violet', 0.8],
    [822, 828, 8, 'blue', 0.9], [838, 838, 5, 'cyan', 0.8], [688, 108, 4, 'cyan', 0.7], [760, 840, 5, 'cyan', 0.7],
    [880, 112, 4, 'blue', 0.6], [846, 760, 4, 'cyan', 0.5], [404, 806, 4, 'cyan', 0.5], [736, 934, 5, 'blue', 0.6]
  ];

  /* ---------- 调色 / 氛围参数（对着参考图直方图调出来的基准值） ---------- */
  var PARAMS = (TF.PARAMS = {
    exposure: 1.04,      // 线性 HDR → 调色前的整体曝光
    bloom: 0.26,        // 辉光强度
    bloomRadius: 1.0,   // 辉光扩散
    trail: 0.915,        // 反馈拖尾：每帧保留比例（按 60fps 折算到实时）
    grain: 1.0,         // 胶片颗粒
    vignette: 1.0,      // 暗角
    dof: 1.0,           // 景深
    lift: 1.0,          // 黑位抬升（暗处的褐色雾）
    aberration: 1.0,    // 色差
    speed: 1.0          // 时间流速
  });

  /* 画质档：粒子前缀比例 + 内部渲染倍率上限 + 是否开景深 */
  var QUALITY = (TF.QUALITY = {
    high: { frac: 1.0, maxScale: 1.0, dpr: 2.0 },
    mid: { frac: 0.6, maxScale: 0.85, dpr: 1.5 },
    low: { frac: 0.34, maxScale: 0.7, dpr: 1.0 }
  });

  TF.layout = {
    frame: FRAME,
    flowers: FLOWERS,
    leafBright: LEAF_BRIGHT,
    leafMid: LEAF_MID,
    haze: HAZE,
    threads: THREADS,
    hairs: HAIRS,
    bokeh: BOKEH,
    bokehColors: C,
    params: PARAMS,
    quality: QUALITY,

    /* 视口宽高比 → 核心画幅在画布上的缩放（css px / 参考图像素）与可见的参考图坐标范围 */
    fit: function (cssW, cssH) {
      var s = Math.min(cssW / FRAME.w, cssH / FRAME.h);
      return {
        scale: s,
        x0: FRAME.w / 2 - cssW / (2 * s),
        x1: FRAME.w / 2 + cssW / (2 * s),
        y0: FRAME.h / 2 - cssH / (2 * s),
        y1: FRAME.h / 2 + cssH / (2 * s)
      };
    },

    /* 画幅外的延伸内容：宽屏在左右补叶丛与侧花，长屏在上下补叶丛。
       view = 当前视口可见的参考图坐标范围；只有真正超出核心画幅（≥ MIN 像素）的方向才补，
       所以 5:7 视口下什么都不生成，默认构图 == 参考图。返回 { flowers, leaves, haze }。 */
    margins: function (view, rand) {
      var out = { flowers: [], leaves: [], haze: [] };
      var MIN = 48, OVER = 160;
      var i, x, y;
      // 左右
      [[-1, view.x0], [1, view.x1]].forEach(function (sd) {
        var dir = sd[0], span = dir < 0 ? -view.x0 : view.x1 - FRAME.w;
        if (span < MIN) return;
        var edge = dir < 0 ? 0 : FRAME.w, outer = dir < 0 ? view.x0 : view.x1;
        for (x = edge + dir * 70; dir < 0 ? x > outer - OVER : x < outer + OVER; x += dir * 150) {
          var local = Math.min(1, Math.abs(x - edge) / Math.max(span, 1));   // 0 贴边 → 1 最外
          for (y = 110; y < 1330; y += 118) {
            out.leaves.push({
              x: x + (rand() - 0.5) * 90, y: y + (rand() - 0.5) * 80, len: 120 + rand() * 120, w: 0.5 + rand() * 0.16, dir: rand() * 360,
              depth: 25.5 + rand() * 4, gain: (0.36 + rand() * 0.44) * (1 - 0.55 * local), tone: 0.15 + rand() * 0.45, tilt: 20 + rand() * 30
            });
          }
          out.haze.push({ x: x, y: 640, r: 400, depth: 29, tone: 0.45, k: 0.52 * (1 - 0.5 * local) });
        }
        if (span > 300) {
          var fx = edge + dir * 230;
          out.flowers.push({ id: dir < 0 ? 'ML' : 'MR', x: fx, y: dir < 0 ? 610 : 720, disc: 52, petal: 158, width: 0.32, tilt: 26, lean: dir < 0 ? 70 : 110, depth: 27.2, spin: dir * 2.8, petals: 16, gain: 0.74 });
        }
        if (span > 720) {
          var gx = edge + dir * 640;
          out.flowers.push({ id: dir < 0 ? 'FL' : 'FR', x: gx, y: dir < 0 ? 980 : 400, disc: 46, petal: 140, width: 0.32, tilt: 40, lean: 180, depth: 28, spin: -dir * 2.2, petals: 15, gain: 0.52 });
        }
      });
      // 上下
      var below = view.y1 - FRAME.h, above = -view.y0;
      if (below >= MIN) {
        for (y = FRAME.h + 60; y < view.y1 + OVER; y += 120) {
          var ly = Math.min(1, (y - FRAME.h) / Math.max(below, 1));
          for (x = 90; x < FRAME.w; x += 128) {
            out.leaves.push({
              x: x + (rand() - 0.5) * 70, y: y + (rand() - 0.5) * 60, len: 130 + rand() * 130, w: 0.5 + rand() * 0.14, dir: 120 + rand() * 140,
              depth: 23.5 + rand() * 3.5, gain: (0.9 - 0.55 * ly) * (0.7 + rand() * 0.5), tone: 0.04 + rand() * 0.2, tilt: 12 + rand() * 24
            });
          }
        }
        out.haze.push({ x: FRAME.w / 2, y: FRAME.h + below * 0.45, r: 520 + below * 0.4, depth: 27, tone: 0.0, k: 0.6 });
      }
      if (above >= MIN) {
        for (y = view.y0 - OVER + 60; y < -20; y += 120) {
          var ay = Math.min(1, (-y) / Math.max(above, 1));
          for (x = 160; x < FRAME.w - 60; x += 150) {
            out.leaves.push({
              x: x + (rand() - 0.5) * 80, y: y + (rand() - 0.5) * 50, len: 120 + rand() * 110, w: 0.5 + rand() * 0.14, dir: 280 + rand() * 100,
              depth: 28 + rand() * 3, gain: (0.5 - 0.3 * ay) * (0.7 + rand() * 0.5), tone: 0.3 + rand() * 0.4, tilt: 20 + rand() * 30
            });
          }
        }
        out.haze.push({ x: FRAME.w / 2, y: -above * 0.4, r: 560 + above * 0.4, depth: 30, tone: 0.6, k: 0.5 });
      }
      return out;
    },

    /* 校验：坐标在合理范围、参数为正、无重复 id。返回问题字符串数组（空 = 通过） */
    validate: function () {
      var bad = [];
      var seen = {};
      FLOWERS.forEach(function (f) {
        if (seen[f.id]) bad.push('duplicate flower id ' + f.id);
        seen[f.id] = 1;
        if (!(f.x > 0 && f.x < FRAME.w && f.y > 0 && f.y < FRAME.h)) bad.push(f.id + ' center outside frame');
        if (!(f.disc > 0 && f.petal > 0 && f.depth > 1)) bad.push(f.id + ' bad size/depth');
        if (!(f.width > 0.1 && f.width < 0.8)) bad.push(f.id + ' bad width ratio');
      });
      var checkLeaf = function (l, tag) {
        if (!(l.len > 0 && l.w > 0 && l.w < 1.2 && l.depth > 1 && l.gain > 0)) bad.push(tag + ' leaf bad params ' + JSON.stringify(l));
      };
      LEAF_BRIGHT.forEach(function (l) { checkLeaf(l, 'bright'); });
      LEAF_MID.forEach(function (l) { checkLeaf(l, 'mid'); });
      HAZE.forEach(function (h) { if (!(h.r > 0 && h.k > 0)) bad.push('haze bad ' + JSON.stringify(h)); });
      THREADS.forEach(function (t) { if (!(t.b > 0)) bad.push('thread brightness'); });
      Object.keys(PARAMS).forEach(function (k) { if (!(typeof PARAMS[k] === 'number' && isFinite(PARAMS[k]))) bad.push('param ' + k); });
      return bad;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
