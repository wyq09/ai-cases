/* Flower · 程序化生成：向日葵 / 叶片 / 雾团斑点 / 尘埃 / 丝线 / 散景
   全部输出纯数据，单位 = 参考图像素（渲染层按深度缩放到世界坐标）。
   每个物体是一个「采样器」：粒子按序独立随机采样，所以画前缀 = 均匀抽稀 → 画质档位直接截断绘制数量。 */
(function (root) {
  'use strict';
  var TF = root.TF;
  var TAU = TF.TAU, clamp = TF.clamp;
  var DEG = Math.PI / 180;

  var KIND = (TF.KIND = { PETAL: 0, DISC: 1, LEAF: 2, WISP: 3, SPECK: 4, DUST: 5 });
  var STRIDE = (TF.STRIDE = 11);   // aPos xyz | aA 强度·点径·随机·种类 | aB 相位·aux·aux2·偏白

  var GOLD = [1.0, 0.62, 0.06];
  var GREEN = [0.50, 1.0, 0.06];

  /* 生成密度基准：对着参考图亮度分布调出来的值；density（0~1）整体缩放粒子数 */
  var TUNING = (TF.TUNING = {
    petalDensity: 0.50,   // 花瓣体粒子 / 像素²
    petalI: 1.10,         // 花瓣粒子基准强度
    leafDensity: 0.42,
    leafI: 0.82,
    speckDensity: 0.045,  // 雾团斑点 / 像素²
    dustCount: 2600,
    wispFrac: 0.17,       // 花朵粒子中飘散粒子的占比
    discFrac: 0.08        // 花朵粒子中花盘粒子的占比
  });

  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function fract(x) { return x - Math.floor(x); }

  /* 披针形轮廓 t^a·(1-t)^b：返回 {inv: 归一化倒数, mean: 轮廓沿 t 的平均值} */
  function profile(ea, eb) {
    var ts = ea / (ea + eb);
    var inv = 1 / (Math.pow(ts, ea) * Math.pow(1 - ts, eb));
    var mean = 0, N = 24;
    for (var k = 0; k < N; k++) mean += Math.pow((k + 0.5) / N, ea) * Math.pow(1 - (k + 0.5) / N, eb) * inv;
    return { inv: inv, mean: mean / N };
  }

  /* ================= 向日葵 ================= */
  function buildFlower(spec, rnd) {
    var R = spec.disc, L = spec.petal, W = spec.width;
    var rings = [
      { n: spec.petals, len: L, wr: W, a0: 15 + rnd() * 10, curl: 30 + rnd() * 16, phase: rnd() },
      { n: Math.max(8, Math.round(spec.petals * 0.66)), len: L * 0.62, wr: W * 1.18, a0: 44 + rnd() * 12, curl: 14 + rnd() * 10, phase: 0.5 }
    ];
    var petals = [], cdf = [], sum = 0, N = 16;
    rings.forEach(function (ring) {
      for (var i = 0; i < ring.n; i++) {
        var len = ring.len * (0.82 + 0.36 * rnd());
        var hw = len * ring.wr * 0.5 * (0.86 + 0.28 * rnd());
        var a0 = (ring.a0 + (rnd() - 0.5) * 16) * DEG;
        var curl = (ring.curl + (rnd() - 0.5) * 18) * DEG;
        var phi = TAU * (i + ring.phase) / ring.n + (rnd() - 0.5) * (TAU / ring.n) * 0.35;
        var ea = 0.52 + rnd() * 0.2, eb = 0.40 + rnd() * 0.3;   // 基部收窄、先端钝尖（向日葵舌状花）
        var pr = profile(ea, eb);
        // 中心线查表：角 α(τ) = a0 − curl·τ²，先扬后垂
        var cr = new Float32Array(N + 1), cz = new Float32Array(N + 1), ca = new Float32Array(N + 1);
        var r = 0, z = 0;
        for (var k = 0; k <= N; k++) {
          cr[k] = r; cz[k] = z; ca[k] = a0 - curl * (k / N) * (k / N);
          if (k < N) {
            var am = a0 - curl * ((k + 0.5) / N) * ((k + 0.5) / N);
            r += Math.cos(am) * len / N; z += Math.sin(am) * len / N;
          }
        }
        var area = 2 * hw * len * pr.mean;
        var p = {
          cos: Math.cos(phi), sin: Math.sin(phi), ea: ea, eb: eb, inv: pr.inv, cr: cr, cz: cz, ca: ca,
          fold: 0.35 + rnd() * 0.4, twist: (rnd() - 0.5) * 0.9, seed: rnd() * 100, area: area, hw: hw
        };
        petals.push(p);
        sum += area; cdf.push(sum);
      }
    });
    var body = sum * TUNING.petalDensity;
    var count = Math.round(body / (1 - TUNING.wispFrac - TUNING.discFrac));
    var f = {
      type: 'flower', id: spec.id, R: R, petals: petals, cdf: cdf, cdfMax: sum, gain: spec.gain,
      pos: TF.toWorld(spec.x, spec.y, spec.depth), scale: TF.pxScale(spec.depth),
      quat: TF.flowerQuat(spec.tilt, spec.lean), spin: spec.spin, depth: spec.depth, color: GOLD,
      spec: spec, start: 0, count: count
    };
    f.sampler = flowerSampler(f);
    return f;
  }

  function flowerSampler(f) {
    var R = f.R, gain = f.gain, petals = f.petals, cdf = f.cdf, cdfMax = f.cdfMax;
    var T = TUNING;
    var P = [0, 0, 0, 0];
    // 花瓣表面点：x 沿花瓣向外，y 横向，z 沿花盘法向；返回中心线倾角
    function petalPoint(p, t, s) {
      var N = 16, ft = clamp(t, 0, 1) * N, k = Math.min(N - 1, Math.floor(ft)), fr = ft - k;
      var cr = p.cr[k] + (p.cr[k + 1] - p.cr[k]) * fr;
      var cz = p.cz[k] + (p.cz[k + 1] - p.cz[k]) * fr;
      var al = p.ca[k] + (p.ca[k + 1] - p.ca[k]) * fr;
      var tc = clamp(t, 0, 1);
      var shape = Math.pow(Math.max(tc, 1e-4), p.ea) * Math.pow(1 - tc, p.eb) * p.inv;
      var petiole = 0.16 + 0.84 * TF.smoothstep(0, 0.10, tc);
      var ragged = 1 + (TF.noise2(tc * 7 + p.seed, p.seed * 0.37, 11) - 0.5) * 0.5 + (TF.noise2(tc * 23 + p.seed, 3.1, 13) - 0.5) * 0.3;
      var hw = p.hw * shape * petiole * ragged;
      var fold = p.fold * (1 - Math.min(Math.abs(s), 1.6)) * hw * (1 - 0.45 * tc);
      var nx = -Math.sin(al), nz = Math.cos(al);
      var lat = s * hw, off = fold;
      var tw = p.twist * tc, ct = Math.cos(tw), st = Math.sin(tw);
      var lat2 = lat * ct - off * st, off2 = lat * st + off * ct;
      P[0] = cr + nx * off2; P[1] = lat2; P[2] = cz + nz * off2 + Math.sin(tc * 5.2 + p.seed) * hw * 0.12;
      P[3] = al;
      return P;
    }
    function pick(u) {
      var lo = 0, hi = cdf.length - 1, mid, x = u * cdfMax;
      while (lo < hi) { mid = (lo + hi) >> 1; if (cdf[mid] < x) lo = mid + 1; else hi = mid; }
      return petals[lo];
    }
    return function (rnd, A, o, i, n) {
      // 部位由每个粒子独立随机决定（而不是按序号比例），任意前缀截断都保持 花瓣/花盘/飘散 的比例
      var u = rnd(), p, q, t, s, I, size, kind, white = 0, ph = 0, a1 = 0, a2 = 0;
      var r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd();
      if (u < 1 - T.wispFrac - T.discFrac) {
        /* —— 花瓣体 —— */
        p = pick(r1); t = r2; s = (r3 * 2 - 1) * 1.22; q = petalPoint(p, t, s);
        var as = Math.abs(s);
        var edge = as <= 1 ? 1 : Math.exp(-(as - 1) * 5) * 0.9;                       // 边缘飞白
        var fiber = 0.70 + 0.62 * TF.noise2(s * 9 + p.seed, t * 1.6, 23);              // 放射纤维
        var midrib = 1 - 0.40 * Math.exp(-(s * s) / 0.0045) * (t < 0.92 ? 1 : 0.2);    // 中脉暗线
        var lv = Math.abs(fract(t * 5.5 - as * 0.85 + 0.5) - 0.5);
        var latv = 1 - 0.22 * Math.exp(-(lv * lv) / 0.0032) * (1 - as * 0.25);          // 侧脉（若隐若现）
        var patch = 0.68 + 0.64 * TF.noise2(t * 3.1 + p.seed * 2, s * 2.4 + p.seed, 37);
        var base = 0.09 + 0.91 * TF.smoothstep(0.02, 0.56, t);                          // 基部暗（红橙）
        var tip = 1 - 0.25 * TF.smoothstep(0.86, 1.0, t);
        var shade = 0.70 + 0.36 * Math.cos(q[3]);
        var sp = 0.09 + 3.3 * r4 * r4;
        I = gain * T.petalI * edge * fiber * midrib * latv * patch * base * tip * shade * sp;
        size = 0.75 + 0.75 * r5 * r5; kind = KIND.PETAL;
        if (r5 > 0.968) { I *= 4.6; size *= 1.7; white = 0.15; }                        // 高光颗粒
      } else if (u < 1 - T.wispFrac) {
        /* —— 花盘：绒毛斑点 + 橙红边环 —— */
        var rr, th = r1 * TAU;
        if (r2 < 0.60) {
          rr = R * (0.30 + 0.70 * Math.sqrt(r3));
          I = gain * (0.05 + 0.55 * Math.pow(rr / R, 5) * r4 + 0.07 * r5);
          size = 1.0 + 0.7 * r4;
        } else {
          rr = R * (0.89 + 0.15 * r3 * r3);
          I = gain * (0.40 + 1.05 * r4 * r4);
          size = 1.1 + 1.1 * r5;
        }
        q = [rr * Math.cos(th), rr * Math.sin(th), 0.6 + 1.4 * r3 * r3];
        kind = KIND.DISC;
      } else {
        /* —— 飘散粒子：从花瓣外围出发，绕花轴旋出、朝镜头飘起（顶点着色器里算轨迹） —— */
        p = pick(r1); t = 0.35 + 0.65 * r2; s = (r3 * 2 - 1) * 1.1; q = petalPoint(p, t, s);
        I = gain * 0.85 * (0.35 + 0.9 * r4 * r4) * (0.5 + 0.5 * t);
        size = 1.3 + 0.9 * r5; kind = KIND.WISP;
        ph = r5; a1 = (r3 < 0 ? -1 : 1) * (0.55 + 0.9 * r4); a2 = 0.5 + r2; white = 0.05;
      }
      // 花瓣 / 飘散：花瓣坐标 → 花朵坐标（附着在花盘边缘）
      if (kind !== KIND.DISC) {
        var R0 = R * 0.965, x = q[0], y = q[1];
        A[o] = x * p.cos - y * p.sin + R0 * p.cos;
        A[o + 1] = x * p.sin + y * p.cos + R0 * p.sin;
        A[o + 2] = q[2];
      } else {
        A[o] = q[0]; A[o + 1] = q[1]; A[o + 2] = q[2] - 0.16 * R * (1 - (q[0] * q[0] + q[1] * q[1]) / (R * R));
      }
      A[o + 3] = I; A[o + 4] = size; A[o + 5] = fract(r5 * 7.31 + r1 * 3.17); A[o + 6] = kind;
      A[o + 7] = ph; A[o + 8] = a1; A[o + 9] = a2; A[o + 10] = white;
    };
  }

  /* ================= 叶片 ================= */
  function buildLeaf(spec, rnd) {
    var len = spec.len, w = spec.w;
    var ea = 0.40 + rnd() * 0.26, eb = 0.72 + rnd() * 0.5;
    var pr = profile(ea, eb);
    var teeth = 9 + Math.floor(rnd() * 7);
    var seed = rnd() * 100;
    var fold = 0.25 + rnd() * 0.45;
    // 朝向：先绕 z 把叶尖转到屏幕方向，再绕叶轴倾斜、绕中脉翻滚
    var theta = spec.dir * DEG - Math.PI / 2;
    var tilt = (spec.tilt || 20) * DEG * (rnd() < 0.5 ? 1 : -1);
    var roll = (rnd() - 0.5) * 70 * DEG;
    var quat = TF.quatMul(TF.quatMul(TF.quatAxisAngle(0, 0, 1, theta), TF.quatAxisAngle(0, 1, 0, tilt)), TF.quatAxisAngle(1, 0, 0, roll));
    var area = len * len * w * pr.mean;       // 全宽 = len·w，积分 2·半宽
    var lf = {
      type: 'leaf', x: spec.x, y: spec.y, len: len, color: mix3(GREEN, GOLD, spec.tone || 0),
      pos: TF.toWorld(spec.x, spec.y, spec.depth), scale: TF.pxScale(spec.depth), quat: quat, depth: spec.depth,
      spec: spec, start: 0, count: Math.round(area * TUNING.leafDensity)
    };
    lf.sampler = leafSampler(lf, { ea: ea, eb: eb, inv: pr.inv, teeth: teeth, seed: seed, fold: fold });
    return lf;
  }

  function leafSampler(lf, g) {
    var len = lf.len, w = lf.spec.w, gain = lf.spec.gain;
    return function (rnd, A, o) {
      var t = rnd(), s = (rnd() * 2 - 1) * 1.10, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      var tc = t, as = Math.abs(s);
      var shape = Math.pow(tc, g.ea) * Math.pow(1 - tc, g.eb) * g.inv;
      var tooth = 1 + 0.075 * (Math.abs(((tc * g.teeth) % 1) * 2 - 1) - 0.5);           // 锯齿边缘
      var hw = len * w * 0.5 * shape * tooth * (1 + (TF.noise2(tc * 6 + g.seed, g.seed, 3) - 0.5) * 0.12);
      var a = Math.min(as, 1.5);
      var z = -0.11 * len * tc * tc - g.fold * a * hw + Math.sin(tc * 9 + s * 3 + g.seed) * hw * 0.2;
      var edge = as <= 1 ? 1 : Math.exp(-(as - 1) * 8) * 0.7;
      var mid = 1 - 0.62 * Math.exp(-(s * s) / 0.0035);                                 // 主脉
      var lv = Math.abs(fract(tc * 6.5 - as * 0.75 + 0.5) - 0.5);
      var latv = 1 - 0.48 * Math.exp(-(lv * lv) / 0.0026);                              // 侧脉
      var rim = 1 + 0.22 * Math.exp(-((as - 0.95) * (as - 0.95)) / 0.006);              // 叶缘亮边
      var fiber = 0.74 + 0.52 * TF.noise2(s * 7 + g.seed, tc * 2.2, 5);
      var patch = 0.70 + 0.60 * TF.noise2(tc * 2.6 + g.seed * 2, s * 2.0, 7);
      var core = 0.72 + 0.38 * (1 - as * as);
      var sp = 0.30 + 1.8 * r1 * r1;
      var I = gain * TUNING.leafI * edge * mid * latv * rim * fiber * patch * core * sp;
      var size = 1.0 + 0.8 * r2 * r2, white = 0;
      if (r3 < 0.015) { I *= 2.6; size *= 1.4; white = 0.08; }
      A[o] = (tc - 0.5) * len; A[o + 1] = s * hw; A[o + 2] = z;
      A[o + 3] = I; A[o + 4] = size; A[o + 5] = fract(r4 * 9.17 + r2 * 2.71); A[o + 6] = KIND.LEAF;
      A[o + 7] = fract(r3 * 5.13); A[o + 8] = 0; A[o + 9] = 0; A[o + 10] = white;
    };
  }

  /* ================= 雾团斑点 ================= */
  function buildSpecks(h, rnd) {
    var count = Math.round(Math.PI * h.r * h.r * TUNING.speckDensity * (0.6 + 0.4 * h.k));
    var R = h.r;
    var o = {
      type: 'speck', pos: TF.toWorld(h.x, h.y, h.depth), scale: TF.pxScale(h.depth), quat: [0, 0, 0, 1],
      color: mix3(GREEN, GOLD, h.tone), depth: h.depth, h: h, start: 0, count: count
    };
    o.sampler = function (rnd, A, off) {
      var r = Math.sqrt(rnd()) * R, th = rnd() * TAU, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      var fall = 1 - 0.6 * (r / R) * (r / R);
      A[off] = r * Math.cos(th) + (rnd() - 0.5) * 30;
      A[off + 1] = r * Math.sin(th) + (rnd() - 0.5) * 30;
      A[off + 2] = (rnd() * 2 - 1) * 24;
      var I = h.k * fall * (0.10 + 0.50 * r1 * r1);
      var size = 0.9 + 1.4 * r2 * r2, white = 0;
      if (r3 < 0.015) { I *= 2.6; size *= 1.5; white = 0.12; }
      A[off + 3] = I; A[off + 4] = size; A[off + 5] = fract(r4 * 11.3); A[off + 6] = KIND.SPECK;
      A[off + 7] = fract(r1 * 6.7); A[off + 8] = 0; A[off + 9] = 0; A[off + 10] = white;
    };
    return o;
  }

  /* ================= 尘埃（世界坐标直接存） ================= */
  function buildDust(view, rnd) {
    var count = Math.round(TUNING.dustCount * (1 + 0.5 * Math.max(0, (view.x1 - view.x0) * (view.y1 - view.y0) / (TF.FRAME.w * TF.FRAME.h) - 1)));
    var o = { type: 'dust', pos: [0, 0, 0], scale: 1, quat: [0, 0, 0, 1], color: [1.0, 0.80, 0.40], start: 0, count: count };
    o.sampler = function (rnd, A, off) {
      var x = view.x0 - 60 + rnd() * (view.x1 - view.x0 + 120);
      var y = view.y0 - 60 + rnd() * (view.y1 - view.y0 + 120);
      var d = 18.5 + rnd() * 13;
      var w = TF.toWorld(x, y, d);
      A[off] = w[0]; A[off + 1] = w[1]; A[off + 2] = w[2];
      A[off + 3] = 0.25 + 1.1 * rnd() * rnd(); A[off + 4] = 0.9 + 1.5 * rnd() * rnd();
      A[off + 5] = rnd(); A[off + 6] = KIND.DUST; A[off + 7] = rnd(); A[off + 8] = 0.3 + rnd(); A[off + 9] = 0; A[off + 10] = 0.12;
    };
    return o;
  }

  /* 把一组物体顺序填进一块交错缓冲；返回 { data, objects, total } */
  function pack(objects, seed) {
    var total = 0, i;
    for (i = 0; i < objects.length; i++) { objects[i].start = total; total += objects[i].count; }
    var data = new Float32Array(total * STRIDE);
    for (i = 0; i < objects.length; i++) {
      var o = objects[i], rnd = TF.rng((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
      for (var j = 0; j < o.count; j++) o.sampler(rnd, data, (o.start + j) * STRIDE, j, o.count);
    }
    return { data: data, objects: objects, total: total };
  }

  var GEN = (TF.gen = { KIND: KIND, GOLD: GOLD, GREEN: GREEN, TUNING: TUNING, STRIDE: STRIDE });

  /* 核心画幅内容：花 + 叶 + 雾团斑点 + 尘埃（不随视口变化） */
  GEN.buildCore = function (layout, view, opt) {
    opt = opt || {};
    var seed = (opt.seed || 7) >>> 0, density = opt.density == null ? 1 : opt.density;
    var rnd = TF.rng(seed), objects = [];
    layout.flowers.forEach(function (s) { var f = buildFlower(s, rnd); f.count = Math.max(64, Math.round(f.count * density)); objects.push(f); });
    layout.leafBright.concat(layout.leafMid).forEach(function (s) { var l = buildLeaf(s, rnd); l.count = Math.max(24, Math.round(l.count * density)); objects.push(l); });
    layout.haze.forEach(function (h) { var o = buildSpecks(h, rnd); o.count = Math.max(24, Math.round(o.count * density)); objects.push(o); });
    var d = buildDust(view, rnd); d.count = Math.max(200, Math.round(d.count * density)); objects.push(d);

    // 丝线：细金线 + 发丝卷线（Catmull-Rom 细分），都在镜头前 17.5
    var lines = [];
    var lineDepth = 17.5;
    function seg(x0, y0, x1, y1, b, sd) {
      var a = TF.toWorld(x0, y0, lineDepth), c = TF.toWorld(x1, y1, lineDepth);
      lines.push(a[0], a[1], a[2], c[0], c[1], c[2], b, sd);
    }
    layout.threads.forEach(function (t, i) { seg(t.x0, t.y0, t.x1, t.y1, t.b, i * 0.37 + 0.11); });
    layout.hairs.forEach(function (h, i) {
      var p = h.pts, n = p.length;
      for (var k = 0; k < n - 1; k++) {
        var p0 = p[Math.max(0, k - 1)], p1 = p[k], p2 = p[k + 1], p3 = p[Math.min(n - 1, k + 2)];
        var px = p1[0], py = p1[1];
        for (var m = 1; m <= 6; m++) {
          var u = m / 6, u2 = u * u, u3 = u2 * u;
          var cx = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
          var cy = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
          seg(px, py, cx, cy, h.b * (0.55 + 0.45 * Math.sin(Math.PI * (k + u) / (n - 1))), i * 0.53 + k * 0.07);
          px = cx; py = cy;
        }
      }
    });
    // 散景光斑
    var sprites = [], Cb = layout.bokehColors, spriteDepth = 17.0;
    layout.bokeh.forEach(function (b, i) {
      var w = TF.toWorld(b[0], b[1], spriteDepth), c = Cb[b[3]];
      sprites.push(w[0], w[1], w[2], b[2], c[0], c[1], c[2], b[4], i * 0.618 % 1, 0, 0, 0);
    });
    // 雾团大面片
    var haze = [];
    layout.haze.forEach(function (h, i) {
      var w = TF.toWorld(h.x, h.y, h.depth);
      haze.push(w[0], w[1], w[2], h.r, h.tone, h.k, (i * 0.3819) % 1, 0, 0, 0, 0, 0);
    });

    var res = pack(objects, seed);
    res.lines = new Float32Array(lines);
    res.sprites = new Float32Array(sprites);
    res.haze = new Float32Array(haze);
    res.flowers = objects.filter(function (o) { return o.type === 'flower'; });
    return res;
  };

  /* 画幅外的延伸内容（随视口宽高比变化才重建）：侧花 / 叶丛 / 雾团斑点 / 雾团面片 */
  GEN.buildMargins = function (layout, view, opt) {
    opt = opt || {};
    var seed = ((opt.seed || 7) ^ 0x51ed270b) >>> 0, density = opt.density == null ? 1 : opt.density;
    var rnd = TF.rng(seed);
    var m = layout.margins(view, rnd);
    var objects = [];
    m.flowers.forEach(function (s) { var f = buildFlower(s, rnd); f.count = Math.max(64, Math.round(f.count * density)); objects.push(f); });
    m.leaves.forEach(function (s) { var l = buildLeaf(s, rnd); l.count = Math.max(24, Math.round(l.count * density * 0.4)); objects.push(l); });   // 画幅外叶丛稀疏一些
    m.haze.forEach(function (h) { var o = buildSpecks(h, rnd); o.count = Math.max(24, Math.round(o.count * density * 0.4)); objects.push(o); });
    var haze = [];
    m.haze.forEach(function (h, i) {
      var w = TF.toWorld(h.x, h.y, h.depth);
      haze.push(w[0], w[1], w[2], h.r, h.tone, h.k, (i * 0.2718) % 1, 0, 0, 0, 0, 0);
    });
    var res = pack(objects, seed);
    res.haze = new Float32Array(haze);
    res.flowers = objects.filter(function (o) { return o.type === 'flower'; });
    return res;
  };

  /* 校验生成数据：无 NaN/Inf，所有物体区间合法，数量非负。返回问题数组 */
  GEN.validate = function (res) {
    var bad = [];
    var a = res.data, n = res.total;
    if (a.length !== n * STRIDE) bad.push('data length mismatch');
    if (!res.objects.every(function (o) { return o.count >= 0 && o.start >= 0 && o.start + o.count <= n; })) bad.push('object range out of bounds');
    for (var i = 0; i < a.length; i++) if (!isFinite(a[i])) { bad.push('non-finite at ' + i); break; }
    var kinds = {};
    for (var j = 0; j < n; j++) {
      var k = a[j * STRIDE + 6], I = a[j * STRIDE + 3], sz = a[j * STRIDE + 4];
      kinds[k] = (kinds[k] || 0) + 1;
      if (!(I >= 0 && sz > 0)) { bad.push('bad intensity/size at ' + j); break; }
    }
    // 每种出现的物体类型都必须有对应粒子（画幅外数据没有尘埃，属正常）
    var need = { flower: KIND.PETAL, leaf: KIND.LEAF, speck: KIND.SPECK, dust: KIND.DUST };
    res.objects.forEach(function (o) { if (!kinds[need[o.type]]) bad.push('object ' + o.type + ' has no particles'); });
    res.flowers.forEach(function (f) {
      if (!(f.R > 0 && f.petals.length > 0)) bad.push('flower ' + f.id + ' malformed');
    });
    return bad;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
