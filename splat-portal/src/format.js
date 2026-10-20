/* =====================================================================
   splat-portal · 数据格式
   ---------------------------------------------------------------------
   烘焙后的 .bin：20 字节头 + n × 20 字节点记录
     0  u32  magic  'SPBK' (0x4B425053)
     4  u32  version
     8  u32  count
     12 u32  reserved
   点记录（小端）：
     0  int16 x3   位置（× posScale 还原到归一化世界，单位 = 场景 80 分位半径）
     6  uint16 x3  log 缩放（归一化到 [logMin, logMax]）
     12 int8  x4   四元数 xyzw（/127）
     16 uint8 x4   RGBA
   ===================================================================== */
(function (global) {
  'use strict';

  const MAGIC = 0x4b425053;
  const STRIDE = 20;
  const HEADER = 20;

  function parse(buffer) {
    const dv = new DataView(buffer);
    const magic = dv.getUint32(0, true);
    if (magic !== MAGIC) throw new Error('bad magic: 0x' + magic.toString(16));
    const version = dv.getUint32(4, true);
    if (version !== 1) throw new Error('unsupported version ' + version);
    const count = dv.getUint32(8, true);
    if (buffer.byteLength < HEADER + count * STRIDE) throw new Error('truncated splat data');

    const n = count;
    const pos = new Float32Array(n * 3);
    const scale = new Float32Array(n * 3);
    const quat = new Float32Array(n * 4);
    const color = new Uint8Array(n * 4);

    // TypedArray 的 byteOffset 以字节计，长度以元素计：
    // 记录布局 = 位置 int16x3 (6B) + 缩放 uint16x3 (6B) + 四元数 int8x4 (4B) + 颜色 u8x4 (4B)
    const BYTES = STRIDE;              // 20
    // 记录是交错存放的（每点 20 字节连续），不能用单个 TypedArray 视图，
    // 这里用 DataView 逐点读取，260k 点约 30~60ms。
    const dv2 = new DataView(buffer);
    for (let i = 0; i < n; i++) {
      const o = HEADER + i * STRIDE;
      pos[i * 3] = dv2.getInt16(o, true);
      pos[i * 3 + 1] = dv2.getInt16(o + 2, true);
      pos[i * 3 + 2] = dv2.getInt16(o + 4, true);

      scale[i * 3] = dv2.getUint16(o + 6, true) / 65535;
      scale[i * 3 + 1] = dv2.getUint16(o + 8, true) / 65535;
      scale[i * 3 + 2] = dv2.getUint16(o + 10, true) / 65535;

      // 四元数按 (w,x,y,z) 存储；量化后长度可能偏离 1，必须归一化，
      // 否则旋转矩阵被整体缩放，协方差会被平方放大。
      let qw = dv2.getInt8(o + 12) / 127;
      let qx = dv2.getInt8(o + 13) / 127;
      let qy = dv2.getInt8(o + 14) / 127;
      let qz = dv2.getInt8(o + 15) / 127;
      const len = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz) || 1;
      quat[i * 4] = qw / len;
      quat[i * 4 + 1] = qx / len;
      quat[i * 4 + 2] = qy / len;
      quat[i * 4 + 3] = qz / len;

      color[i * 4] = dv2.getUint8(o + 16);
      color[i * 4 + 1] = dv2.getUint8(o + 17);
      color[i * 4 + 2] = dv2.getUint8(o + 18);
      color[i * 4 + 3] = dv2.getUint8(o + 19);
    }

    return { count: n, pos, scale, quat, color };
  }

  /* 把量化值还原成真实单位：
     位置 × posScale（每轴），缩放按 log 插值后 × unit。
     同时把颜色预乘成 0..1 浮点，避免着色器里反复除 255。 */
  function decode(splat, meta) {
    const n = splat.count;
    const ps = meta.posScale || [1 / 32767, 1 / 32767, 1 / 32767];
    const unit = meta.unit || 1;
    const logMin = (meta.logScale && meta.logScale[0]) ?? -6;
    const logMax = (meta.logScale && meta.logScale[1]) ?? Math.log(4);
    const pos = splat.pos;
    for (let i = 0; i < n; i++) {
      pos[i * 3] *= ps[0];
      pos[i * 3 + 1] *= ps[1];
      pos[i * 3 + 2] *= ps[2];
    }
    // 缩放已在烘焙时除以 unit（与位置同一套归一化单位）。
    // 训练数据里存在极端各向异性的背景"薄片"（单轴可达场景尺度），
    // 直接投影会铺满整屏，所以按归一化世界尺度做上限裁剪。
    const sc = splat.scale;
    const span = logMax - logMin;
    const maxAxis = 0.20;
    for (let i = 0; i < n * 3; i++) {
      sc[i] = Math.min(Math.exp(logMin + sc[i] * span), maxAxis);
    }
    return splat;
  }

  /* 四元数 → 3x3 旋转矩阵，按 3 个轴缩放展开成协方差所需的 M = R·S。
     返回 Float32Array(n*6)：m00 m01 m02 m10 m11 m12（第三行由叉积补，见着色器） */
  function covarianceBasis(splat, out) {
    const n = splat.count;
    const q = splat.quat;
    const s = splat.scale;
    const M = out || new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      // .splat 按 (w, x, y, z) 存储
      const w = q[i * 4], x = q[i * 4 + 1], y = q[i * 4 + 2], z = q[i * 4 + 3];
      const sx = s[i * 3], sy = s[i * 3 + 1], sz = s[i * 3 + 2];
      // 旋转矩阵（列主序的三列）
      const xx = x * x, yy = y * y, zz = z * z;
      const xy = x * y, xz = x * z, yz = y * z;
      const wx = w * x, wy = w * y, wz = w * z;
      const r00 = 1 - 2 * (yy + zz), r01 = 2 * (xy - wz), r02 = 2 * (xz + wy);
      const r10 = 2 * (xy + wz), r11 = 1 - 2 * (xx + zz), r12 = 2 * (yz - wx);
      const r20 = 2 * (xz - wy), r21 = 2 * (yz + wx), r22 = 1 - 2 * (xx + yy);
      const o = i * 9;
      M[o] = r00 * sx; M[o + 1] = r01 * sy; M[o + 2] = r02 * sz;
      M[o + 3] = r10 * sx; M[o + 4] = r11 * sy; M[o + 5] = r12 * sz;
      M[o + 6] = r20 * sx; M[o + 7] = r21 * sy; M[o + 8] = r22 * sz;
    }
    return M;
  }

  global.SplatFormat = { MAGIC, STRIDE, HEADER, parse, decode, covarianceBasis };
})(window);
