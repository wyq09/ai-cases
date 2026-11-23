/* Flower · 公共工具：命名空间 / 确定性随机 / 值噪声 / 四元数与矩阵
   纯函数、无 DOM 依赖：浏览器与 node 回归共用同一份代码。 */
(function (root) {
  'use strict';
  var TF = (root.TF = root.TF || {});
  var TAU = Math.PI * 2;
  TF.TAU = TAU;

  TF.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  TF.lerp = function (a, b, t) { return a + (b - a) * t; };
  TF.smoothstep = function (a, b, x) {
    var t = TF.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* mulberry32：同种子必得同序列 */
  TF.rng = function (seed) {
    var a = seed >>> 0;
    var f = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = function (lo, hi) { return lo + (hi - lo) * f(); };
    f.int = function (n) { return Math.floor(f() * n) % n; };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; };
    f.gauss = function () {
      var u = 0, v = 0;
      while (u === 0) u = f();
      while (v === 0) v = f();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    };
    f.sign = function () { return f() < 0.5 ? -1 : 1; };
    return f;
  };

  /* 整数格点哈希 → [0,1) */
  TF.hash3 = function (x, y, z, seed) {
    var h = (seed | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (x | 0), 0x27d4eb2d); h ^= h >>> 15;
    h = Math.imul(h ^ (y | 0), 0x85ebca6b); h ^= h >>> 13;
    h = Math.imul(h ^ (z | 0), 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  /* 三维值噪声（平滑插值），范围 [0,1] */
  TF.noise3 = function (x, y, z, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    var h = TF.hash3;
    var x0 = ix, x1 = ix + 1, y0 = iy, y1 = iy + 1, z0 = iz, z1 = iz + 1;
    var n000 = h(x0, y0, z0, seed), n100 = h(x1, y0, z0, seed);
    var n010 = h(x0, y1, z0, seed), n110 = h(x1, y1, z0, seed);
    var n001 = h(x0, y0, z1, seed), n101 = h(x1, y0, z1, seed);
    var n011 = h(x0, y1, z1, seed), n111 = h(x1, y1, z1, seed);
    var a = n000 + (n100 - n000) * fx, b = n010 + (n110 - n010) * fx;
    var c = n001 + (n101 - n001) * fx, d = n011 + (n111 - n011) * fx;
    return (a + (b - a) * fy) + ((c + (d - c) * fy) - (a + (b - a) * fy)) * fz;
  };

  /* 二维便捷封装 */
  TF.noise2 = function (x, y, seed) { return TF.noise3(x, y, 0.5, seed); };

  /* ---------- 四元数 [x,y,z,w] ---------- */
  TF.quatAxisAngle = function (ax, ay, az, angle) {
    var l = Math.hypot(ax, ay, az) || 1, s = Math.sin(angle * 0.5) / l;
    return [ax * s, ay * s, az * s, Math.cos(angle * 0.5)];
  };
  TF.quatMul = function (a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  };
  /* 把单位向量 from 转到 to 的最短旋转 */
  TF.quatBetween = function (fx, fy, fz, tx, ty, tz) {
    var d = fx * tx + fy * ty + fz * tz;
    if (d > 0.999999) return [0, 0, 0, 1];
    if (d < -0.999999) {
      // 反向：绕任意垂直轴转 180°
      var ax = Math.abs(fx) < 0.9 ? 1 : 0, ay = Math.abs(fx) < 0.9 ? 0 : 1;
      return TF.quatAxisAngle(ax, ay, 0, Math.PI);
    }
    var cx = fy * tz - fz * ty, cy = fz * tx - fx * tz, cz = fx * ty - fy * tx;
    var q = [cx, cy, cz, 1 + d], l = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  };

  /* ---------- 4x4 矩阵（列主序 Float32Array，供 WebGL 直接上传） ---------- */
  TF.mat4 = function () {
    var m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };
  TF.mat4Mul = function (a, b, out) {
    out = out || TF.mat4();
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  };
  /* 平移 · 旋转(四元数) · 缩放 */
  TF.mat4FromQuatPosScale = function (q, px, py, pz, s, out) {
    out = out || TF.mat4();
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var x2 = x + x, y2 = y + y, z2 = z + z;
    var xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    var wx = w * x2, wy = w * y2, wz = w * z2;
    out[0] = (1 - (yy + zz)) * s; out[1] = (xy + wz) * s; out[2] = (xz - wy) * s; out[3] = 0;
    out[4] = (xy - wz) * s; out[5] = (1 - (xx + zz)) * s; out[6] = (yz + wx) * s; out[7] = 0;
    out[8] = (xz + wy) * s; out[9] = (yz - wx) * s; out[10] = (1 - (xx + yy)) * s; out[11] = 0;
    out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
    return out;
  };
  /* 透视投影：fovY(弧度)、宽高比、近远裁剪 */
  TF.mat4Perspective = function (fovY, aspect, near, far, out) {
    out = out || TF.mat4();
    var f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  };
  /* 视图矩阵：相机位置 eye，看向 target，上方向 up */
  TF.mat4LookAt = function (ex, ey, ez, tx, ty, tz, ux, uy, uz, out) {
    out = out || TF.mat4();
    var zx = ex - tx, zy = ey - ty, zz = ez - tz;
    var zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    var xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    var xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  };

  /* 屏幕方向角(度，0=上，顺时针) → 单位向量 */
  TF.dirFromAngle = function (deg) {
    var a = deg * Math.PI / 180;
    return [Math.sin(a), Math.cos(a)];
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
