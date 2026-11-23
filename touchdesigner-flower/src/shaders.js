/* Flower · 全部 GLSL ES 3.00 着色器
   坐标约定：物体空间单位 = 参考图像素；uModel 把它变换到世界（含深度缩放与自转）。 */
(function (root) {
  'use strict';
  var TF = root.TF;
  var S = (TF.SHADERS = {});

  var NOISE = [
    'float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }',
    'float vnoise(vec3 p) {',
    '  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),',
    '             mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);',
    '}',
    'float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'float vnoise2(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'float fbm2(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise2(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; } return v; }'
  ].join('\n');

  /* ---------- 粒子 ---------- */
  S.pointVS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec3 aPos;',
    'layout(location = 1) in vec4 aA;   // 强度 / 点径(参考像素) / 随机 / 种类',
    'layout(location = 2) in vec4 aB;   // 相位 / aux / aux2 / 偏白',
    'uniform mat4 uViewProj;',
    'uniform mat4 uModel;',
    'uniform vec3 uColor;',
    'uniform vec4 uAnim;    // 时间 / 抖动幅度(px) / 飘散周期(s) / 自转角',
    'uniform vec4 uCam;     // 相机位置 xyz / 焦距',
    'uniform vec4 uScreen;  // 每参考像素的设备像素数 / 视口高 / 对焦深度 / 景深强度(px)',
    'uniform float uScale;  // HDR 编码倍率（无浮点渲染时 < 1）',
    'out vec3 vColor;',
    'out float vSize;',
    NOISE,
    'void main() {',
    '  vec3 p = aPos;',
    '  float I = aA.x, size = aA.y, rnd = aA.z, kind = aA.w;',
    '  float t = uAnim.x;',
    '  if (kind < 0.5) {',
    // 花瓣：整朵绕自身法向轻轻颤动
    '    float n = vnoise(p * 0.045 + vec3(0.0, 0.0, t * 0.55 + rnd * 9.0));',
    '    p.z += (n - 0.5) * uAnim.y * 2.0;',
    '  } else if (kind < 1.5) {',
    '  } else if (kind < 2.5) {',
    '    float n = vnoise(p * 0.022 + vec3(t * 0.4, rnd * 2.0, 0.0));',
    '    p.z += (n - 0.5) * uAnim.y * 2.4;',
    '  } else if (kind < 3.5) {',
    // 飘散：绕花轴旋出 + 朝镜头飘起 + 卷曲噪声，sin 包络淡入淡出
    '    float life = uAnim.z * (0.7 + 0.6 * aB.z);',
    '    float age = fract(t / life + aB.x);',
    '    float ang = aB.y * age * life * 0.55;',
    '    float ca = cos(ang), sa = sin(ang);',
    '    p.xy = mat2(ca, -sa, sa, ca) * p.xy;',
    '    p.xy *= 1.0 + 0.12 * age;',
    '    p.z += (16.0 + 30.0 * aB.z) * age;',
    '    p += (vec3(vnoise(p * 0.014 + vec3(t * 0.21, 0.0, 0.0)), vnoise(p * 0.014 + vec3(5.2, t * 0.19, 1.3)), vnoise(p * 0.014 + vec3(9.1, 2.7, t * 0.17))) - 0.5) * 34.0 * age;',
    '    I *= sin(3.14159 * age) * 1.5;',
    '  } else if (kind < 4.5) {',
    '    p += (vec3(vnoise(p * 0.011 + vec3(t * 0.05, 0.0, 0.0)), vnoise(p * 0.011 + vec3(3.3, t * 0.045, 1.0)), vnoise(p * 0.011 + vec3(7.7, 1.1, t * 0.05))) - 0.5) * 26.0;',
    '  } else {',
    '    p += vec3(sin(t * 0.13 + rnd * 31.0), cos(t * 0.11 + rnd * 17.0), sin(t * 0.07 + rnd * 23.0)) * 0.05 * aB.y;',
    '    I *= 0.30 + 1.3 * pow(0.5 + 0.5 * sin(t * (0.6 + rnd * 1.6) + aB.x * 6.2832), 3.0);',
    '  }',
    '  if (kind < 3.5) I *= 0.82 + 0.36 * sin(t * (1.1 + rnd * 2.6) + aB.x * 6.2832);',
    '  vec4 cp = uViewProj * (uModel * vec4(p, 1.0));',
    '  gl_Position = cp;',
    '  float depth = max(cp.w, 0.001);',
    '  float px = size * uScreen.x * uCam.w / depth;',
    '  px += uScreen.w * abs(1.0 - uScreen.z / depth);',
    '  if (px < 1.0) { I *= px * px; px = 1.0; }',
    '  if (px > 60.0) { I *= (px / 60.0) * (px / 60.0); px = 60.0; }',
    '  gl_PointSize = px;',
    '  vSize = px;',
    '  vColor = mix(uColor, vec3(1.0, 0.88, 0.62), aB.w) * (I * uScale);',
    '}'
  ].join('\n');

  S.pointFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vColor;',
    'in float vSize;',
    'out vec4 o;',
    'void main() {',
    '  vec2 d = gl_PointCoord * 2.0 - 1.0;',
    '  float r2 = dot(d, d);',
    '  if (r2 > 1.0) discard;',
    // 每个粒子的能量 = 强度 × 像素²，摊在直径 vSize 的圆盘上；亚像素点至少占 1 像素，
    // 这样 1px 小点拿到的是 ≈1 倍强度而不是软点剖面的峰值（1.28 = 1/0.785 圆盘积分校正）
    '  float f = exp(-r2 * 2.6) * (1.0 - r2);',
    '  float area = max(1.0, 0.785 * vSize * vSize);',
    '  o = vec4(vColor * f * 1.28 / area, 1.0);',
    '}'
  ].join('\n');

  /* ---------- 花盘网格（不透明，写深度 → 挡住后方花瓣） ---------- */
  S.discVS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec3 aPos;',
    'layout(location = 1) in vec3 aNrm;',
    'uniform mat4 uViewProj;',
    'uniform mat4 uModel;',
    'out vec2 vLocal;',
    'out vec3 vNormal;',
    'out vec3 vWorld;',
    'void main() {',
    '  vLocal = aPos.xy;',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWorld = wp.xyz;',
    '  vNormal = normalize(mat3(uModel) * aNrm);',
    '  gl_Position = uViewProj * wp;',
    '}'
  ].join('\n');

  S.discFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vLocal;',
    'in vec3 vNormal;',
    'in vec3 vWorld;',
    'uniform vec3 uCamPos;',
    'uniform float uR;      // 花盘半径（参考像素）',
    'uniform float uGain;',
    'uniform float uScale;',
    'out vec4 o;',
    NOISE,
    'void main() {',
    '  float rr = length(vLocal);',
    '  if (rr > 1.0) discard;',
    '  float th = atan(vLocal.y, vLocal.x);',
    // 绒毛：径向细纹 + 颗粒
    '  float fur = vnoise2(vec2(th * 26.0, rr * uR * 0.55)) * 0.6 + vnoise2(vec2(th * 90.0 + 3.0, rr * uR * 1.4)) * 0.4;',
    '  float fur2 = fbm2(vec2(th * 4.0, rr * 9.0));',
    '  vec3 V = normalize(uCamPos - vWorld);',
    '  float facing = clamp(dot(normalize(vNormal), V), 0.0, 1.0);',
    '  float wall = 1.0 - facing;                         // 内壁：越斜越亮',
    '  float rim = smoothstep(0.70, 0.95, rr) * (1.0 - smoothstep(0.96, 1.0, rr));',
    '  vec3 base = vec3(0.030, 0.0115, 0.0016) * (0.45 + 1.1 * rr) * (0.40 + 1.5 * fur) * (0.6 + 0.8 * facing);',
    '  vec3 glow = vec3(0.34, 0.085, 0.008) * rim * (0.30 + 0.9 * fur) * (0.5 + 0.7 * fur2) * (0.8 + 2.2 * wall);',
    '  o = vec4((base + glow) * uGain * uScale, 1.0);',
    '}'
  ].join('\n');

  /* ---------- 屏幕对齐面片：雾团（大软噪声）/ 散景光斑 ---------- */
  S.quadVS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec3 aCenter;',
    'layout(location = 1) in vec2 aCorner;',
    'layout(location = 2) in vec4 aP0;   // 半径(参考像素) / 种子 / 强度 / 种类',
    'layout(location = 3) in vec3 aColor;',
    'uniform mat4 uViewProj;',
    'uniform vec4 uCam;',
    'uniform vec4 uScreen;   // 每参考像素的设备像素数 / 视口宽 / 视口高 / 亮度',
    'out vec2 vUv;',
    'out vec4 vP0;',
    'out vec3 vColor;',
    'void main() {',
    '  vec4 cp = uViewProj * vec4(aCenter, 1.0);',
    '  float depth = max(cp.w, 0.001);',
    '  float px = aP0.x * uScreen.x * uCam.w / depth;',
    '  vec2 off = aCorner * px * 2.0 / uScreen.yz * cp.w;',
    '  gl_Position = cp + vec4(off, 0.0, 0.0);',
    '  vUv = aCorner;',
    '  vP0 = aP0;',
    '  vColor = aColor * uScreen.w;',
    '}'
  ].join('\n');

  S.quadFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'in vec4 vP0;',
    'in vec3 vColor;',
    'uniform float uTime;',
    'uniform float uScale;',
    'out vec4 o;',
    NOISE,
    'void main() {',
    '  float r = length(vUv);',
    '  if (vP0.w < 0.5) {',
    '    if (r > 1.0) discard;',
    '    float fall = exp(-r * r * 2.4);',
    '    float n = fbm2(vUv * 2.3 + vP0.y * 19.0 + uTime * 0.012);',
    '    o = vec4(vColor * fall * (0.30 + 1.0 * n * n) * vP0.z * uScale, 1.0);',
    '  } else {',
    '    if (r > 1.0) discard;',
    '    float a = (1.0 - smoothstep(0.70, 1.0, r)) * (0.78 + 0.4 * smoothstep(0.5, 0.95, r));',
    '    o = vec4(vColor * a * vP0.z * uScale, 1.0);',
    '  }',
    '}'
  ].join('\n');

  /* ---------- 丝线：屏幕空间加宽的线段 ---------- */
  S.lineVS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec3 aPos;     // 本端点（世界）',
    'layout(location = 1) in vec3 aOther;   // 另一端点（世界）',
    'layout(location = 2) in vec4 aL;       // 横向 ±1 / 沿线参数 0~1 / 亮度 / 种子',
    'uniform mat4 uViewProj;',
    'uniform vec4 uScreen;   // 每参考像素的设备像素数 / 视口宽 / 视口高 / 线宽倍率',
    'out float vU;',
    'out float vV;',
    'out float vB;',
    'out float vSeed;',
    'void main() {',
    '  vec4 cp = uViewProj * vec4(aPos, 1.0);',
    '  vec4 co = uViewProj * vec4(aOther, 1.0);',
    '  vec2 s0 = cp.xy / max(cp.w, 0.001) * uScreen.yz;',
    '  vec2 s1 = co.xy / max(co.w, 0.001) * uScreen.yz;',
    '  vec2 dir = s1 - s0;',
    '  dir = dir / max(length(dir), 1e-4);',
    '  vec2 nrm = vec2(-dir.y, dir.x);',
    '  float halfW = 2.6 * uScreen.x * uScreen.w;',
    '  vec2 off = nrm * aL.x * halfW * 2.0 / uScreen.yz * cp.w;',
    '  gl_Position = cp + vec4(off, 0.0, 0.0);',
    '  vU = aL.x; vV = aL.y; vB = aL.z; vSeed = aL.w;',
    '}'
  ].join('\n');

  S.lineFS = [
    '#version 300 es',
    'precision highp float;',
    'in float vU;',
    'in float vV;',
    'in float vB;',
    'in float vSeed;',
    'uniform float uTime;',
    'uniform float uScale;',
    'uniform float uBright;',
    'out vec4 o;',
    'void main() {',
    '  float core = exp(-vU * vU * 3.4);',
    '  float halo = exp(-vU * vU * 0.8) * 0.20;',
    '  float flick = 0.62 + 0.38 * sin(vV * 26.0 + vSeed * 21.0 + uTime * 0.5);',
    '  float d = fract(vV * 0.9 - uTime * 0.035 + vSeed) * 7.0;',
    '  float run = 1.0 + 1.5 * exp(-d * d);',
    '  o = vec4(vec3(1.0, 0.64, 0.09) * (core + halo) * vB * flick * run * 0.36 * uBright * uScale, 1.0);',
    '}'
  ].join('\n');

  /* ---------- 全屏三角形 ---------- */
  S.fsVS = [
    '#version 300 es',
    'precision highp float;',
    'out vec2 vUv;',
    'void main() {',
    '  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);',
    '  vUv = p * 0.5 + 0.5;',
    '  gl_Position = vec4(p, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* 反馈拖尾：acc = 场景·(1−衰减) + 上一帧·衰减（能量归一，静止内容亮度不变） */
  S.feedbackFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uPrev;',
    'uniform float uDecay;',
    'out vec4 o;',
    'void main() {',
    '  o = texture(uScene, vUv) * (1.0 - uDecay) + texture(uPrev, vUv) * uDecay;',
    '}'
  ].join('\n');

  /* 13 抽头降采样 */
  S.downFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;   // 源纹素',
    'out vec4 o;',
    'void main() {',
    '  vec2 t = uTexel;',
    '  vec3 a = texture(uTex, vUv + t * vec2(-2.0, 2.0)).rgb;',
    '  vec3 b = texture(uTex, vUv + t * vec2(0.0, 2.0)).rgb;',
    '  vec3 c = texture(uTex, vUv + t * vec2(2.0, 2.0)).rgb;',
    '  vec3 d = texture(uTex, vUv + t * vec2(-2.0, 0.0)).rgb;',
    '  vec3 e = texture(uTex, vUv).rgb;',
    '  vec3 f = texture(uTex, vUv + t * vec2(2.0, 0.0)).rgb;',
    '  vec3 g = texture(uTex, vUv + t * vec2(-2.0, -2.0)).rgb;',
    '  vec3 h = texture(uTex, vUv + t * vec2(0.0, -2.0)).rgb;',
    '  vec3 i = texture(uTex, vUv + t * vec2(2.0, -2.0)).rgb;',
    '  vec3 j = texture(uTex, vUv + t * vec2(-1.0, 1.0)).rgb;',
    '  vec3 k = texture(uTex, vUv + t * vec2(1.0, 1.0)).rgb;',
    '  vec3 l = texture(uTex, vUv + t * vec2(-1.0, -1.0)).rgb;',
    '  vec3 m = texture(uTex, vUv + t * vec2(1.0, -1.0)).rgb;',
    '  o = vec4((j + k + l + m) * 0.125 + (a + b + d + e) * 0.03125 + (b + c + e + f) * 0.03125 + (d + e + g + h) * 0.03125 + (e + f + h + i) * 0.03125, 1.0);',
    '}'
  ].join('\n');

  /* 帐篷滤波上采样并叠加 */
  S.upFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uTex;     // 更低一级的上采样结果',
    'uniform sampler2D uBase;    // 本级降采样',
    'uniform vec2 uTexel;',
    'uniform float uRadius;',
    'out vec4 o;',
    'void main() {',
    '  vec2 t = uTexel * uRadius;',
    '  vec3 s = texture(uTex, vUv + vec2(-t.x, t.y)).rgb * 1.0 + texture(uTex, vUv + vec2(t.x, t.y)).rgb * 1.0 +',
    '           texture(uTex, vUv + vec2(-t.x, -t.y)).rgb * 1.0 + texture(uTex, vUv + vec2(t.x, -t.y)).rgb * 1.0 +',
    '           texture(uTex, vUv + vec2(0.0, t.y)).rgb * 2.0 + texture(uTex, vUv + vec2(0.0, -t.y)).rgb * 2.0 +',
    '           texture(uTex, vUv + vec2(-t.x, 0.0)).rgb * 2.0 + texture(uTex, vUv + vec2(t.x, 0.0)).rgb * 2.0 +',
    '           texture(uTex, vUv).rgb * 4.0;',
    '  o = vec4(texture(uBase, vUv).rgb + s / 16.0, 1.0);',
    '}'
  ].join('\n');

  /* 调色：按亮度走「金色阶 / 绿色阶」（实测自参考图），紫蓝白走逐通道 filmic + 色差；暗角 + 黑位抬升 + 颗粒 */
  S.gradeFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uAcc;',
    'uniform sampler2D uBloom;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uDecode;',
    'uniform vec4 uP0;   // 曝光 / 辉光强度 / 颗粒 / 暗角',
    'uniform vec4 uP1;   // 黑位抬升 / 色差 / 飘散亮度 / 保留',
    'out vec4 o;',
    NOISE,
    'vec3 goldRamp(float y) {',
    '  float r = y * (2.035 - 1.708 * y + 0.746 * y * y);',
    '  return vec3(min(r, 1.0), 0.91 * y, min(0.476 * pow(y, 2.44), 0.91 * y));',
    '}',
    'vec3 greenRamp(float y) {',
    '  float g = y * (1.0 + 0.24 * pow(max(1.0 - y, 0.0), 3.0));',
    '  return vec3(y * (0.72 + 0.42 * pow(y, 1.6)), g, min(1.62 * pow(y, 2.94), g));',
    '}',
    'void main() {',
    '  vec2 c = vUv - 0.5;',
    '  float rr = length(c * vec2(uRes.x / uRes.y, 1.0));',
    '  vec2 ab = c * rr * rr * 0.010 * uP1.y;',
    '  vec3 accC = texture(uAcc, vUv).rgb * uDecode;',
    '  vec3 hdr = accC * uP0.x + texture(uBloom, vUv).rgb * uDecode * uP0.y;',
    '  vec3 other = vec3(texture(uAcc, vUv + ab).r, accC.g, texture(uAcc, vUv - ab).b) * uDecode * uP0.x;',
    '  other = other / (1.0 + other);',
    '  float lum = dot(hdr, vec3(0.2126, 0.7152, 0.0722));',
    '  float gr = hdr.g / max(hdr.r, 1e-5);',
    '  float w = smoothstep(0.86, 1.04, gr);',
    '  float otherness = clamp((hdr.b - 0.5 * min(hdr.r, hdr.g)) / max(hdr.b, 1e-5), 0.0, 1.0);',
    '  float y = 1.0 - exp(-lum);',
    '  vec3 col = mix(mix(goldRamp(y), greenRamp(y), w), other, otherness);',
    '  float vig = 1.0 - uP0.w * 0.62 * pow(min(rr * 1.12, 1.0), 2.6);',
    '  col *= vig;',
    '  col += vec3(0.014, 0.0065, 0.0028) * uP1.x * (1.0 - y) * vig;',
    '  float g = hash12(gl_FragCoord.xy + fract(uTime * 0.731) * 371.0) - 0.5;',
    '  col += g * (0.010 + 0.034 * (1.0 - y)) * uP0.z;',
    '  o = vec4(max(col, 0.0), 1.0);',
    '}'
  ].join('\n');
})(typeof globalThis !== 'undefined' ? globalThis : this);
