// 壳层毛发（shell fur）质感核心。
// 硬约束：所有壳共享 target.mesh.geometry（禁止 clone）；顶点位移在 object space，
// 壳必须作为 mesh 的兄弟节点挂同一父级（复制 mesh 局部变换），动画枢纽旋转时壳随之联动。
// 风摆/重力在顶点端计算；片元端只做 cell-hash discard 与颜色光照（移动端友好，无三角函数）。
import * as THREE from 'three';

export const furShared = {
  uTime: { value: 0 },
  uWind: { value: 0.35 },
  uWindSpeed: { value: 1 },
  uGravity: { value: 0.35 },
};

const VERT = `
attribute vec3 color;
uniform float uTime;
uniform float uWind;
uniform float uWindSpeed;
uniform float uGravity;
uniform float uLength;
uniform float uLenScale;
uniform float uShellFrac;
uniform float uAmp;
uniform float uSpeed;
uniform vec3 uBase;
uniform float uHasVC;
varying vec3 vCol;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vL;
varying vec3 vVP;

float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main(){
  float f = uShellFrac;
  // 风相位按位置散化，避免整壳同步摆动
  float ph = hash13(vec3(position.xz * 3.7, position.y * 3.7)) * 6.2831;
  // 全局 uWind/uWindSpeed（furShared）× 部位系数 uAmp/uSpeed（opts.wind/windSpeed 初始值）
  float sway = sin(uTime * uWindSpeed * uSpeed * 2.2 + ph + f * 2.5)
    * f * f * uWind * uAmp * uLength * 0.6;
  vec3 pos = position
    + normal * (uLength * f * uLenScale)
    + vec3(sway * 0.8, 0.0, sway * 0.6)
    - vec3(0.0, f * f * uGravity * uLength, 0.0);
  vCol = mix(uBase, color, uHasVC);
  vPos = position;
  vN = normalMatrix * normal;
  vL = normalMatrix * normalize(vec3(0.5, 0.8, 0.6));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vVP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform float uShellFrac;
uniform float uDensity;
uniform float uFreq;
uniform vec3 uTint;
uniform float uTintAmt;
varying vec3 vCol;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vL;
varying vec3 vVP;

float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

void main(){
  // 毛束判定基于未位移 object 位置：cell 列在所有壳间对齐，毛发才成"根"
  vec3 p = vPos * uFreq;
  // 单 octave 聚簇（根部近实心时跳过，省 8 次 hash/片元）
  float n = hash13(floor(p)) * 0.68;
  if (uShellFrac > 0.28) n += vnoise(vPos * (uFreq * 0.055)) * 0.42;
  float th = mix(0.985, uDensity, uShellFrac);
  if (n > th) discard;
  // 参差毛长（fur-threejs 同款思路）：每根毛有随机终止高度，轮廓呈羽化状而非齐平
  float strand = hash13(floor(p) + vec3(7.7, 3.1, 9.4));
  if (uShellFrac > strand * 1.06 + 0.02) discard;
  vec3 nrm = normalize(vN);
  float hl = dot(nrm, normalize(vL)) * 0.5 + 0.5;
  float rim = pow(1.0 - abs(dot(nrm, normalize(-vVP))), 2.0);
  vec3 tip = mix(vCol * 0.98, uTint, uTintAmt);
  vec3 c = mix(vCol * 0.72, tip, smoothstep(0.0, 0.85, uShellFrac));
  c = c * (0.72 + 0.42 * hl) + vec3(1.0, 0.94, 0.82) * (rim * 0.18);
  gl_FragColor = vec4(c, 1.0);
  // ShaderMaterial 不自动追加输出转换：手动对齐内建材质的 tone mapping 与 linear→sRGB
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createShellFur(target, opts = {}) {
  const mesh = target.mesh;
  const geo = mesh.geometry;
  const hasVC = !!geo.getAttribute('color');
  // 无顶点色 fallback：从本体材质基色取（毛根会覆盖本体，本体色即基色）
  const base = (mesh.material && mesh.material.color
    ? mesh.material.color
    : new THREE.Color(0xe0813c)).clone();
  const tint0 = opts.tint !== undefined ? opts.tint : (target.tint || null);

  // 实例级 uniforms：同一对象被各壳材质共享引用，热更新一次全部生效
  const uni = {
    uLength: { value: opts.length !== undefined ? opts.length : (target.length || 0.05) },
    uLenScale: { value: opts.lengthScale !== undefined ? opts.lengthScale : 1 },
    uDensity: { value: opts.density !== undefined ? opts.density : (target.density !== undefined ? target.density : 0.42) },
    uAmp: { value: opts.wind !== undefined ? opts.wind : 1 },
    uSpeed: { value: opts.windSpeed !== undefined ? opts.windSpeed : 1 },
    uTint: { value: tint0 ? tint0.clone() : new THREE.Color(0x000000) },
    uTintAmt: { value: tint0 ? 0.28 : 0 },
    uFreq: { value: opts.freq !== undefined ? opts.freq : 220 },
    uBase: { value: base },
    uHasVC: { value: hasVC ? 1 : 0 },
  };

  const group = new THREE.Group();
  group.name = (mesh.name || 'fur') + '_shells';
  group.position.copy(mesh.position);
  group.rotation.copy(mesh.rotation);
  group.scale.copy(mesh.scale);
  if (mesh.parent) mesh.parent.add(group);

  const order0 = (target.order || 0) * 10;
  const list = [];

  function makeMat(frac) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...uni,
        uTime: furShared.uTime,
        uWind: furShared.uWind,
        uWindSpeed: furShared.uWindSpeed,
        uGravity: furShared.uGravity,
        uShellFrac: { value: frac },
      },
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
    });
  }

  function build(count) {
    for (let i = 0; i < list.length; i++) {
      group.remove(list[i]);
      list[i].material.dispose();
    }
    list.length = 0;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, makeMat((i + 1) / count));
      m.frustumCulled = false; // 法线外推+下垂位移使几何包围盒失准，必须关视锥剔除
      m.castShadow = false; // 壳不进阴影 pass：位移后深度材质不匹配且成倍开销
      m.receiveShadow = false;
      m.renderOrder = order0 + i;
      group.add(m);
      list.push(m);
    }
  }

  build(Math.max(1, opts.shells !== undefined ? opts.shells : (target.shells || 8)));

  return {
    group,
    // 画质基准壳数：app.js 换档时用 baseShells × 档位系数调 setShells
    baseShells: opts.shells !== undefined ? opts.shells : (target.shells || 8),
    get shells() { return list.length; },
    setShells(n) { build(Math.max(1, Math.min(64, n | 0))); },
    setDensity(d) { uni.uDensity.value = Math.min(0.99, Math.max(0.05, d)); },
    setLengthScale(s) { uni.uLenScale.value = s; },
    setTint(color) {
      if (color) { uni.uTint.value.copy(color); uni.uTintAmt.value = 0.5; }
      else uni.uTintAmt.value = 0;
    },
    dispose() {
      for (let i = 0; i < list.length; i++) list[i].material.dispose();
      list.length = 0;
      if (group.parent) group.parent.remove(group);
    },
  };
}
