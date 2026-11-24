/* 鹈鹕骑车 · 月面地形 —— 周期性高度场（月坑 / 山脊 / 起伏）+ 岩石场 + 知识牌布点
 * 纯逻辑，无 DOM / THREE 依赖，node 可直接单测。
 *
 * 世界是一块 TILE×TILE 的周期瓦片：物理与渲染都按 (x mod TILE, z mod TILE) 取高度，
 * 所以月面无限延伸且接缝无缝。
 *
 * 物理采样用 Catmull-Rom 三次插值（过数据点、C¹ 连续）：真实月面的坡度是渐变的，分片线性
 * 插值会在每条三角形棱上制造曲率无穷大的"跳台"，而月面上 v²κ > g 极易满足，车会每 0.5 m 颠一下。
 * 渲染网格仍是分片线性，顶点落在格点上，两者在格点处严格相等，格点之间只差一个二阶小量。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.PM = root.PM || {}; root.PM.TERRAIN = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var TILE = 1024;        // 瓦片边长 (m)
  var N = 2048;           // 每边纹素数
  var TEX = TILE / N;     // 0.5 m / 纹素
  var SEED = 19690720;
  var ROCK_CELL = 16;     // 岩石场格子 (m)，须整除 TILE
  var ROCK_M = TILE / ROCK_CELL;
  var CAMP = { x: 11, z: -7 };
  var RIDGE_X = 620;      // 东侧山脊中线
  var CLEAR = 5;          // 知识牌周围的净空半径 m（放牌的人清过的着陆场）

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smoothstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(i, j, s) {
    var h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function wrap(v) { return ((v % TILE) + TILE) % TILE; }
  function dWrap(a) { return a - TILE * Math.floor(a / TILE + 0.5); }   // 折到 [-TILE/2, TILE/2)
  function dist2(ax, az, bx, bz) { var dx = dWrap(ax - bx), dz = dWrap(az - bz); return dx * dx + dz * dz; }

  /* 周期性值噪声：格点序号按周期取模，瓦片四周天然无缝 */
  function vnoise(x, z, cell, s) {
    var P = TILE / cell, u = x / cell, w = z / cell;
    var i = Math.floor(u), j = Math.floor(w), fu = u - i, fw = w - j;
    var su = fu * fu * fu * (fu * (fu * 6 - 15) + 10);
    var sw = fw * fw * fw * (fw * (fw * 6 - 15) + 10);
    var i0 = i % P; if (i0 < 0) i0 += P;
    var j0 = j % P; if (j0 < 0) j0 += P;
    var i1 = i0 + 1 === P ? 0 : i0 + 1, j1 = j0 + 1 === P ? 0 : j0 + 1;
    var a = hash2(i0, j0, s), b = hash2(i1, j0, s), c = hash2(i0, j1, s), d = hash2(i1, j1, s);
    var top = a + (b - a) * su, bot = c + (d - c) * su;
    return top + (bot - top) * sw;
  }

  /* 东侧山脊：中线随 z 蜿蜒、峰高起伏，距离按环面折叠保证周期 */
  function ridge(x, z) {
    var xc = RIDGE_X + (vnoise(0.5, z, 256, 51) - 0.5) * 170;
    var d = dWrap(x - xc);
    var w = 115 + (vnoise(3.5, z, 128, 53) - 0.5) * 70;
    var core = Math.exp(-(d * d) / (w * w));
    var foot = Math.exp(-(d * d) / (300 * 300));
    if (core < 0.003 && foot < 0.003) return 0;
    var amp = 62 + vnoise(7.5, z, 128, 57) * 78;
    return amp * core + 20 * foot + (vnoise(x, z, 32, 59) - 0.5) * 26 * core;
  }

  /* 新鲜月坑剖面：四次碗（坡度 ≤ ~27°）+ 环缘隆起 + 指数衰减的溅射裙 */
  function craterProfile(q, depth, rim, rimW) {
    if (q >= 2.4) return 0;
    var v = 0;
    if (q < 1) { var b = 1 - q * q; v -= depth * b * b; }
    var t = (q - 1.05) / (rimW || 0.11);
    v += rim * Math.exp(-t * t);
    if (q > 0.85) v += rim * 0.22 * Math.exp(-Math.max(q - 1.05, 0) / 0.35) * smoothstep(0.85, 1.05, q);
    return v;
  }

  function makeCraters(seed) {
    var rnd = mulberry32(seed ^ 0x51ed), list = [], i, k;
    function add(x, z, r, depth, rim, rimW) {
      list.push({ x: wrap(x), z: wrap(z), r: r, depth: depth, rim: rim, rimW: rimW || 0.11 });
    }
    // 手放的大坑：带辐射纹的新鲜大坑 + 几个中坑
    add(330, -140, 140, 0.20 * 140, 0.13 * 0.20 * 140);
    add(-150, -120, 58, 0.30 * 58, 0.20 * 0.30 * 58);
    add(90, -330, 46, 0.29 * 46, 0.18 * 0.29 * 46);
    add(-240, -430, 70, 0.27 * 70, 0.17 * 0.27 * 70);
    add(420, -520, 62, 0.29 * 62, 0.19 * 0.29 * 62);
    add(560, 250, 85, 0.21 * 85, 0.13 * 0.21 * 85);
    // 幂律随机坑：r^-2 分布
    var tiers = [[35, 60, 11], [15, 30, 58], [6, 12, 300], [3, 6, 1400]];
    for (var t = 0; t < tiers.length; t++) {
      var lo = tiers[t][0], hi = tiers[t][1], count = tiers[t][2];
      for (k = 0; k < count; k++) {
        for (var tries = 0; tries < 40; tries++) {
          var r = lo + (hi - lo) * rnd();
          var x = rnd() * TILE, z = rnd() * TILE;
          var ex = dWrap(x) / (28 + r), ez = dWrap(z + 30) / (46 + r);         // 按坑的整个 footprint 判定，坑壁也不伸进走廊
          if (r > 2.5 && ex * ex + ez * ez < 1) continue;                      // 起步大道净空
          if (dist2(x, z, CAMP.x, CAMP.z) < (r + 12) * (r + 12)) continue;     // 营地净空
          if (r >= 15 && Math.abs(dWrap(x - RIDGE_X)) < 170) continue;         // 大坑不埋进山脊
          var clash = false;
          if (r >= 15) for (i = 0; i < list.length; i++) {
            var c = list[i];
            if (c.r >= 35 && dist2(x, z, c.x, c.z) < Math.pow((r + c.r) * 0.8, 2)) { clash = true; break; }
          }
          if (clash) continue;
          var wear = 0.6 + 0.4 * rnd();
          // 小坑被月壤翻耕磨成浅碟，坑缘也放圆（否则 6 m/s 时每个坑缘都是跳台）
          var depth = r * (r < 6 ? 0.15 : 0.30) * wear;
          add(x, z, r, depth, depth * (r < 6 ? 0.14 : 0.20) * (0.5 + 0.5 * rnd()), r < 6 ? 0.26 : 0.11);
          break;
        }
      }
    }
    return list;
  }

  function stamp(H, cx, cz, r, depth, rim, rimW) {
    var R = r * 2.4;
    var i0 = Math.floor((cx - R) / TEX), i1 = Math.ceil((cx + R) / TEX);
    var j0 = Math.floor((cz - R) / TEX), j1 = Math.ceil((cz + R) / TEX);
    for (var j = j0; j <= j1; j++) {
      var dz = j * TEX - cz, wj = (j & (N - 1)) * N;
      for (var i = i0; i <= i1; i++) {
        var dx = i * TEX - cx;
        var q = Math.sqrt(dx * dx + dz * dz) / r;
        if (q < 2.4) H[wj + (i & (N - 1))] += craterProfile(q, depth, rim, rimW);
      }
    }
  }

  function generate(seed) {
    seed = (seed >>> 0) || SEED;
    var H = new Float32Array(N * N);
    var GL = TILE / 4, GS = 4, G = new Float32Array(GL * GL);
    var x, z, i, j;

    // 低频起伏 + 山脊先算在 4 m 粗网格上
    for (j = 0; j < GL; j++) for (i = 0; i < GL; i++) {
      x = (i + 0.5) * GS; z = (j + 0.5) * GS;
      G[j * GL + i] = (vnoise(x, z, 256, 11) - 0.5) * 9 + (vnoise(x, z, 128, 13) - 0.5) * 3.2
                    + (vnoise(x, z, 64, 17) - 0.5) * 1.1 + ridge(x, z);
    }
    function upG(px, pz) {                      // Catmull-Rom 双三次上采样（C1 连续）
      var gx = px / GS - 0.5, gz = pz / GS - 0.5;
      var gi = Math.floor(gx), gj = Math.floor(gz), tx = gx - gi, tz = gz - gj;
      var a = tz * tz, b = tx * tx;
      var wz = [-0.5 * a * tz + a - 0.5 * tz, 1.5 * a * tz - 2.5 * a + 1, -1.5 * a * tz + 2 * a + 0.5 * tz, 0.5 * a * tz - 0.5 * a];
      var wx = [-0.5 * b * tx + b - 0.5 * tx, 1.5 * b * tx - 2.5 * b + 1, -1.5 * b * tx + 2 * b + 0.5 * tx, 0.5 * b * tx - 0.5 * b];
      var acc = 0;
      for (var jj = 0; jj < 4; jj++) {
        var row = (gj + jj - 1) & (GL - 1), base = row * GL, col = gi - 1, s = 0;
        for (var ii = 0; ii < 4; ii++) s += G[base + ((col + ii) & (GL - 1))] * wx[ii];
        acc += s * wz[jj];
      }
      return acc;
    }
    var base0 = upG(CAMP.x, CAMP.z);
    for (j = 0; j < N; j++) {
      z = j * TEX;                                   // 约定：H[i,j] 位于世界坐标 (i·TEX, j·TEX)
      var dz = Math.min(z, TILE - z);
      for (i = 0; i < N; i++) {
        x = i * TEX;
        var h = upG(x, z) + (vnoise(x, z, 32, 31) - 0.5) * 0.45 + (vnoise(x, z, 8, 37) - 0.5) * 0.04;
        var dx = Math.min(x, TILE - x);
        H[j * N + i] = base0 + (h - base0) * smoothstep(13, 30, Math.sqrt(dx * dx + dz * dz));   // 起步区整平
      }
    }
    var craters = makeCraters(seed);
    for (i = 0; i < craters.length; i++) stamp(H, craters[i].x, craters[i].z, craters[i].r, craters[i].depth, craters[i].rim, craters[i].rimW);

    // 梯度（法线贴图用）：中心差分，环面取邻
    var GX = new Float32Array(N * N), GZ = new Float32Array(N * N), inv = 1 / (2 * TEX);
    for (j = 0; j < N; j++) {
      var jm = ((j - 1) & (N - 1)) * N, jp = ((j + 1) & (N - 1)) * N, jc = j * N;
      for (i = 0; i < N; i++) {
        GX[jc + i] = (H[jc + ((i + 1) & (N - 1))] - H[jc + ((i - 1) & (N - 1))]) * inv;
        GZ[jc + i] = (H[jp + i] - H[jm + i]) * inv;
      }
    }
    var field = { H: H, GX: GX, GZ: GZ, N: N, TEX: TEX, TILE: TILE, seed: seed, craters: craters, camp: CAMP };
    field._rockCache = {};
    field.plaques = placePlaques(field);
    return field;
  }

  var _wx = new Float64Array(4), _wz = new Float64Array(4);
  /* 物理用的光滑地面：周期 Catmull-Rom 三次插值，4×4 抽头；格点处严格等于高度图原值 */
  function heightAt(f, x, z) {
    var px = x / TEX, pz = z / TEX;
    var i = Math.floor(px), j = Math.floor(pz), tx = px - i, tz = pz - j;
    var a = tz * tz, b = tx * tx, wx = _wx, wz = _wz;
    wz[0] = -0.5 * a * tz + a - 0.5 * tz;            wz[1] = 1.5 * a * tz - 2.5 * a + 1;
    wz[2] = -1.5 * a * tz + 2 * a + 0.5 * tz;         wz[3] = 0.5 * a * tz - 0.5 * a;
    wx[0] = -0.5 * b * tx + b - 0.5 * tx;            wx[1] = 1.5 * b * tx - 2.5 * b + 1;
    wx[2] = -1.5 * b * tx + 2 * b + 0.5 * tx;         wx[3] = 0.5 * b * tx - 0.5 * b;
    var H = f.H, M = N - 1, ic = i & M, jc = j & M, acc = 0;
    for (var jj = 0; jj < 4; jj++) {
      var row = ((jc + jj - 1) & M) * N, col = ic - 1, sum = 0;
      for (var ii = 0; ii < 4; ii++) sum += H[row + ((col + ii) & M)] * wx[ii];
      acc += sum * wz[jj];
    }
    return acc;
  }

  /* 渲染网格（0.5 m 分片线性，对角线 A–D）的精确高度：着色器里那条面 */
  function heightMesh(f, x, z) {
    var px = x / TEX, pz = z / TEX;
    var i = Math.floor(px), j = Math.floor(pz);
    var u = px - i, w = pz - j;
    var H = f.H, i0 = i & (N - 1), j0 = j & (N - 1), i1 = (i0 + 1) & (N - 1), j1 = (j0 + 1) & (N - 1);
    var hA = H[j0 * N + i0], hB = H[j0 * N + i1], hC = H[j1 * N + i0], hD = H[j1 * N + i1];
    return u >= w ? hA + (hB - hA) * u + (hD - hB) * w : hA + (hD - hC) * u + (hC - hA) * w;
  }

  /* 车轮圆心所需高度 = 轮子包络内 max(地面 + √(R²−s²))：34 cm 的轮子会跨过小坑。
   * 先 9 点粗采，再在最优点两侧做黄金分割细化 —— 包络是连续函数的极大值，所以是光滑的；
   * 只取离散采样的 max 会在采样点切换处制造折点，月面上等于布满了跳台。 */
  function wheelEnvelope(hfn, x, z, fx, fz, R) {
    var step = R / 4, best = -1e9, bk = 0, k, s, v;
    function env(t) { return hfn(x + fx * t, z + fz * t) + Math.sqrt(Math.max(R * R - t * t, 0)); }
    for (k = 0; k < 9; k++) {
      v = env((k - 4) * step);
      if (v > best) { best = v; bk = k; }
    }
    var lo = Math.max((bk - 5) * step, -R), hi = Math.min((bk - 3) * step, R), gr = 0.6180339887;
    var c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = env(c), fd = env(d);
    for (k = 0; k < 16; k++) {
      if (fc > fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = env(c); }
      else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = env(d); }
    }
    return Math.max(best, fc, fd);
  }
  function wheelCenter(f, x, z, fx, fz, R) {
    return wheelEnvelope(f._hfn || (f._hfn = function (px, pz) { return heightAt(f, px, pz); }), x, z, fx, fz, R);
  }

  function grad(f, x, z, out) {
    var d = 0.35;
    out.gx = (heightAt(f, x + d, z) - heightAt(f, x - d, z)) / (2 * d);
    out.gz = (heightAt(f, x, z + d) - heightAt(f, x, z - d)) / (2 * d);
    return out;
  }

  /* 岩石场：16 m 格子内按哈希确定性生成，渲染与碰撞共用同一份数据 */
  function rocksInCell(ci, cj) {
    ci = ((ci % ROCK_M) + ROCK_M) % ROCK_M; cj = ((cj % ROCK_M) + ROCK_M) % ROCK_M;
    var patch = hash2(ci >> 2, cj >> 2, 7717);
    var n = Math.floor(hash2(ci, cj, 4409) * (2.0 + patch * 3.6));
    var out = [];
    for (var k = 0; k < n; k++) {
      var h1 = hash2(ci, cj, 5501 + k * 13), h2 = hash2(ci, cj, 6607 + k * 13), h3 = hash2(ci, cj, 7703 + k * 13);
      var x = (ci + h1) * ROCK_CELL, z = (cj + h2) * ROCK_CELL, r;
      if (h3 < 0.60) r = 0.04 + 0.09 * (h3 / 0.60);
      else if (h3 < 0.94) r = 0.13 + 0.21 * ((h3 - 0.60) / 0.34);
      else r = 0.42 + 0.78 * ((h3 - 0.94) / 0.06);
      if (dist2(x, z, 0, 0) < 64) continue;      // 起步区 8 m 净空
      out.push({
        x: x, z: z, r: r, hitUntil: 0,
        a: hash2(ci, cj, 8801 + k * 13) * 6.2832,
        b: hash2(ci, cj, 9907 + k * 13) * 6.2832,
        sx: 0.75 + hash2(ci, cj, 3109 + k * 13) * 0.6,
        sy: 0.5 + hash2(ci, cj, 4211 + k * 13) * 0.45,
        sz: 0.7 + hash2(ci, cj, 5303 + k * 13) * 0.6
      });
    }
    return out;
  }

  function rocksNear(f, x, z, radius) {
    var out = [], c0 = Math.floor((x - radius) / ROCK_CELL), c1 = Math.floor((x + radius) / ROCK_CELL);
    var d0 = Math.floor((z - radius) / ROCK_CELL), d1 = Math.floor((z + radius) / ROCK_CELL);
    var rr = radius * radius;
    for (var cj = d0; cj <= d1; cj++) for (var ci = c0; ci <= c1; ci++) {
      var key = (((ci % ROCK_M) + ROCK_M) % ROCK_M) * ROCK_M + (((cj % ROCK_M) + ROCK_M) % ROCK_M);
      var list = f._rockCache[key];
      if (!list) { list = f._rockCache[key] = rocksInCell(ci, cj); }
      for (var k = 0; k < list.length; k++) {
        var rk = list[k];
        if (dist2(rk.x, rk.z, x, z) <= rr + rk.r * rk.r) out.push(rk);
      }
    }
    return out;
  }

  function nearPlaque(f, x, z, r) {
    for (var k = 0; k < f.plaques.length; k++) if (dist2(x, z, f.plaques[k].x, f.plaques[k].z) < r * r) return true;
    return false;
  }

  var PLAQUE_SPOTS = [
    [4, -44], [-72, -96], [-30, -150], [52, -214], [136, -268], [30, -372],
    [-64, -392], [-150, -470], [-290, -300], [-240, -80], [-118, -28], [150, -150]
  ];

  /* 知识牌内容：每条都是真实的月面物理 / 天文事实 */
  var PLAQUE_TEXT = [
    { title: '为什么骑车', text: '月球没有大气。翅膀靠空气才扇得出升力，鹈鹕在这里飞不起来——轮子不需要空气，所以骑车。' },
    { title: '六分之一重力', text: '月球质量是地球的 1.2%，半径是 27%，表面重力加速度 1.62 m/s²，约为地球的 1/6。质量没变，变轻的是重量。' },
    { title: '抛物线', text: '腾空后只受重力、没有空气阻力，轨迹是标准抛物线。同样的起跳速度，高度、滞空、距离都是地球上的 6 倍。' },
    { title: '刹车', text: '刹车靠摩擦力 F = μmg。正压力只有地球的 1/6，刹车距离就是 6 倍。重心的位置也决定了刹车太狠后轮会翘起。' },
    { title: '过弯', text: '转弯的向心力由车身倾斜提供：tanθ = v² / (gR)。同样的倾角，月面上的转弯半径是地球的 6 倍——想转急，先减速。' },
    { title: '没有风阻', text: '真空里没有空气阻力。极速只受齿比和踏频限制；停止踩踏后，只剩很小的滚动阻力，能滑行几百米。' },
    { title: '爬坡与打滑', text: '爬坡要克服的 mg·sinθ 只有地球的 1/6，陡坡也上得去；但轮胎抓地力同样只有 1/6，坡太陡后轮会空转。' },
    { title: '平衡', text: '自行车靠"往倒的方向打车把"保持平衡，是个倒立摆。倒下的快慢由 √(L/g) 决定，月球上慢 2.5 倍——所以更容易撒把。' },
    { title: '真空不传声', text: '声音需要介质。月面上车铃听不见，只能透过握着车把的翅膀感觉到它在震；腾空时连轮胎的嗡嗡声都没了。' },
    { title: '月尘', text: '被车轮扬起的月尘没有空气托着，每一粒都走干净的抛物线，落地即停，不会弥漫成尘雾——阿波罗月球车录像里正是如此。' },
    { title: '车辙', text: '没有风、没有水、没有生命来抹平它。阿波罗宇航员的脚印和车辙还在，而且会保留数百万年。' },
    { title: '月坑', text: '月球没有风化和侵蚀，坑能原样保留几十亿年。新鲜坑深度约为直径的 1/5，坑缘隆起，四周铺着溅射物。' }
  ];

  function placePlaques(f) {
    var out = [], g = { gx: 0, gz: 0 }, n = Math.min(PLAQUE_SPOTS.length, PLAQUE_TEXT.length);
    for (var k = 0; k < n; k++) {
      var sx = PLAQUE_SPOTS[k][0], sz = PLAQUE_SPOTS[k][1], best = null, bestCost = 1e9;
      for (var ring = 0; ring < 10 && bestCost > 0.14; ring++) {
        var steps = ring === 0 ? 1 : 10;
        for (var s = 0; s < steps; s++) {
          var ang = s / steps * 6.2832, rad = ring * 5;
          var x = sx + Math.cos(ang) * rad, z = sz + Math.sin(ang) * rad;
          grad(f, x, z, g);
          var bump = 0, rocks = rocksNear(f, x, z, CLEAR + 2);
          for (var q = 0; q < rocks.length; q++) if (rocks[q].r > 0.2) bump += 0.5;
          var cost = Math.hypot(g.gx, g.gz) + bump + Math.max(0, heightAt(f, x, z) - heightAt(f, x + 6, z)) * 0.15;
          if (cost < bestCost) { bestCost = cost; best = { x: x, z: z }; }
        }
      }
      out.push({ id: k, x: wrap(best.x), z: wrap(best.z), y: heightAt(f, best.x, best.z), title: PLAQUE_TEXT[k].title, text: PLAQUE_TEXT[k].text, found: false });
    }
    return out;
  }

  function adapter(f) {
    return {
      tile: TILE,
      height: function (x, z) { return heightAt(f, x, z); },
      wheel: function (x, z, fx, fz, R) { return wheelCenter(f, x, z, fx, fz, R); },
      grad: function (x, z, out) { return grad(f, x, z, out); },
      slopeAlong: function (x, z, fx, fz) { grad(f, x, z, this._g || (this._g = {})); var g = this._g; return g.gx * fx + g.gz * fz; },
      rocksNear: function (x, z, r) {
        return rocksNear(f, x, z, r).filter(function (rk) { return !nearPlaque(f, rk.x, rk.z, CLEAR); });   // 牌子周围是清过的着陆场
      },
      plaques: f.plaques,
      dist: dist2
    };
  }

  return {
    TILE: TILE, N: N, TEX: TEX, SEED: SEED, CAMP: CAMP, ROCK_CELL: ROCK_CELL, RIDGE_X: RIDGE_X, CLEAR: CLEAR,
    generate: generate, heightAt: heightAt, heightMesh: heightMesh, wheelCenter: wheelCenter, wheelEnvelope: wheelEnvelope, grad: grad,
    rocksInCell: rocksInCell, rocksNear: rocksNear, nearPlaque: nearPlaque,
    craterProfile: craterProfile, adapter: adapter,
    hash2: hash2, vnoise: vnoise, mulberry32: mulberry32, wrap: wrap, dWrap: dWrap, dist2: dist2
  };
});
