/* 时间的尽头 · 场景：黑洞 / 崩解的时钟遗迹 / 时间之沙 / 星尘 / 后处理
   three r128 UMD。全程线性空间，最终 grade pass 统一 ACES + gamma。 */
window.EOT = window.EOT || {};

EOT.createScene = function (canvas) {
  var T = THREE;
  var TAU = Math.PI * 2;

  var THEMES = {
    gold: { hot: 0xfff3d6, mid: 0xffb45e, cool: 0xb33c12, acc: 0x6fd8ff, nebA: 0x131a33, nebB: 0x33241a, ember: 0xff9a3c },
    ice:  { hot: 0xeaf6ff, mid: 0x8fd4ff, cool: 0x2a3f8f, acc: 0xb79bff, nebA: 0x101832, nebB: 0x1d2547, ember: 0x9fd8ff },
    rose: { hot: 0xffeaf2, mid: 0xff7fa8, cool: 0x8f1f3d, acc: 0x5fe8c8, nebA: 0x241226, nebB: 0x33162a, ember: 0xff8a9a }
  };
  var QUALITY = {
    high: { sand: 42000, stars: 4200, dust: 1000, dpr: 2 },
    mid:  { sand: 26000, stars: 3000, dust: 700, dpr: 1.5 },
    low:  { sand: 14000, stars: 2000, dust: 450, dpr: 1 }
  };

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.toneMapping = T.NoToneMapping;
  renderer.outputEncoding = T.LinearEncoding;
  renderer.setClearColor(0x030409, 1);

  var scene = new T.Scene();
  scene.fog = new T.FogExp2(0x05060d, 0.006);
  var camera = new T.PerspectiveCamera(42, 1, 0.1, 400);

  /* ---------- 共享 uniforms ---------- */
  var U = {
    time: { value: 0 },
    entropy: { value: 0.18 },
    infall: { value: 1 },
    disk: { value: 1 },
    pixelRatio: { value: 1 },
    camPos: { value: new T.Vector3() },
    colHot: { value: new T.Color(THEMES.gold.hot).convertSRGBToLinear() },
    colMid: { value: new T.Color(THEMES.gold.mid).convertSRGBToLinear() },
    colCool: { value: new T.Color(THEMES.gold.cool).convertSRGBToLinear() },
    colAcc: { value: new T.Color(THEMES.gold.acc).convertSRGBToLinear() },
    colEmber: { value: new T.Color(THEMES.gold.ember).convertSRGBToLinear() },
    nebA: { value: new T.Color(THEMES.gold.nebA).convertSRGBToLinear() },
    nebB: { value: new T.Color(THEMES.gold.nebB).convertSRGBToLinear() },
    starDim: { value: 1 },
    sandAlpha: { value: 0.8 },
    burstT: { value: -1 },
    die: { value: 0 }
  };

  var NOISE = [
    'float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),',
    '             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }',
    '  return v;',
    '}'
  ].join('\n');

  var SOFT_DOT = [
    'varying vec3 vCol;',
    'varying float vAlpha;',
    'void main(){',
    '  float d = length(gl_PointCoord - 0.5) * 2.0;',
    '  float a = smoothstep(1.0, 0.15, d) * vAlpha;',
    '  if (a < 0.003) discard;',
    '  gl_FragColor = vec4(vCol, a);',
    '}'
  ].join('\n');

  /* ---------- 星云穹顶 ---------- */
  var nebula = new T.Mesh(
    new T.SphereGeometry(160, 40, 28),
    new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: U.time, nebA: U.nebA, nebB: U.nebB, uDie: U.die },
      vertexShader: [
        'varying vec3 vDir;',
        'void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vDir;',
        'uniform vec3 nebA, nebB; uniform float uTime, uDie;',
        NOISE,
        'void main(){',
        '  vec3 d = normalize(vDir);',
        '  float n = fbm(d.xy * 3.1 + d.zx * 1.7);',
        '  float n2 = fbm(d.yz * 5.3 + d.xy * 2.2 + 7.7);',
        '  float band = pow(clamp(1.0 - abs(d.y + 0.18), 0.0, 1.0), 2.6);',
        '  vec3 col = vec3(0.004, 0.005, 0.012);',
        '  col += mix(nebA, nebB, n2) * (n * 0.5 + band * n * 0.65);',
        '  col *= 1.0 - uDie * 0.7;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    })
  );
  nebula.renderOrder = -10;
  nebula.frustumCulled = false;
  scene.add(nebula);

  /* ---------- 黑洞 ---------- */
  var horizon = new T.Mesh(new T.SphereGeometry(1.55, 64, 48), new T.MeshBasicMaterial({ color: 0x000000 }));
  scene.add(horizon);

  // 吸积盘：差速旋转 fbm 湍流 + 多普勒束射 + 温度渐变
  var disk = new T.Mesh(
    new T.RingGeometry(1.95, 6.6, 160, 6),
    new T.ShaderMaterial({
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false,
      uniforms: {
        uTime: U.time, uBrightness: U.disk, uCamPos: U.camPos, uDie: U.die,
        uColHot: U.colHot, uColMid: U.colMid, uColCool: U.colCool, uColAcc: U.colAcc
      },
      vertexShader: [
        'varying vec2 vPos; varying vec3 vWorld; varying vec3 vTangent;',
        'void main(){',
        '  vPos = position.xy;',
        '  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
        '  vTangent = normalize((modelMatrix * vec4(-position.y, position.x, 0.0, 0.0)).xyz);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec2 vPos; varying vec3 vWorld; varying vec3 vTangent;',
        'uniform float uTime, uBrightness, uDie;',
        'uniform vec3 uCamPos, uColHot, uColMid, uColCool, uColAcc;',
        NOISE,
        'void main(){',
        '  float r = length(vPos);',
        '  float theta = atan(vPos.y, vPos.x);',
        '  float speed = 1.6 * pow(2.8 / r, 1.5);',
        '  float a = theta + uTime * speed;',
        '  float streak = fbm(vec2(r * 2.4, a * 2.6)) * 0.62 + fbm(vec2(r * 5.2 + 13.7, a * 5.4)) * 0.38;',
        '  float inner = smoothstep(1.95, 2.45, r);',
        '  float outer = 1.0 - smoothstep(3.3, 6.6, r);',
        '  float temp = clamp(1.0 - (r - 1.95) / 4.65, 0.0, 1.0);',
        '  vec3 col = mix(uColCool, uColMid, smoothstep(0.0, 0.62, temp));',
        '  col = mix(col, uColHot, pow(temp, 3.2) * 0.9);',
        '  vec3 viewDir = normalize(uCamPos - vWorld);',
        '  float beam = pow(clamp(0.5 + 0.5 * dot(normalize(vTangent), viewDir), 0.0, 1.0), 3.0);',
        '  col *= 0.35 + 1.6 * beam;',
        '  col += uColAcc * beam * temp * 0.1;',
        '  float alpha = inner * outer * (0.22 + 0.5 * streak);',
        '  float lum = (0.55 + 1.5 * pow(temp, 2.0)) * uBrightness * (1.0 - uDie * 0.9);',
        '  gl_FragColor = vec4(col * lum, alpha * clamp(uBrightness, 0.0, 2.0));',
        '}'
      ].join('\n')
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.renderOrder = 2;
  disk.frustumCulled = false;
  scene.add(disk);

  // 引力透镜晕（始终朝向相机的竖直光环，模拟被弯折到视界上下的盘光）
  var halo = new T.Mesh(
    new T.RingGeometry(1.98, 3.05, 128, 1),
    new T.ShaderMaterial({
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false,
      uniforms: { uTime: U.time, uDie: U.die, uColHot: U.colHot, uColMid: U.colMid },
      vertexShader: [
        'varying vec2 vPos;',
        'void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
      ].join('\n'),
      fragmentShader: [
        'varying vec2 vPos;',
        'uniform float uTime, uDie; uniform vec3 uColHot, uColMid;',
        NOISE,
        'void main(){',
        '  float r = length(vPos);',
        '  float theta = atan(vPos.y, vPos.x);',
        '  float streak = fbm(vec2(r * 4.2, theta * 2.2 + uTime * 0.9));',
        '  float v = abs(normalize(vPos).y);',
        '  float bias = 0.5 + 0.75 * pow(v, 1.5);',
        '  float band = smoothstep(1.98, 2.14, r) * (1.0 - smoothstep(2.5, 3.05, r));',
        '  vec3 col = mix(uColMid, uColHot, 0.4 + 0.3 * streak) * streak * bias * 0.9;',
        '  col *= 1.0 - uDie * 0.85;',
        '  gl_FragColor = vec4(col, band * 0.4);',
        '}'
      ].join('\n')
    })
  );
  halo.renderOrder = 3;
  halo.frustumCulled = false;
  scene.add(halo);

  // 光子环：视界边缘的最后一圈光
  var photon = new T.Mesh(
    new T.RingGeometry(1.6, 1.94, 128),
    new T.ShaderMaterial({
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false,
      uniforms: { uTime: U.time, uDie: U.die, uColHot: U.colHot },
      vertexShader: [
        'varying vec2 vPos;',
        'void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
      ].join('\n'),
      fragmentShader: [
        'varying vec2 vPos;',
        'uniform float uTime, uDie; uniform vec3 uColHot;',
        'void main(){',
        '  float r = length(vPos);',
        '  float core = exp(-pow((r - 1.745) * 27.0, 2.0));',
        '  float glow = smoothstep(1.6, 1.72, r) * (1.0 - smoothstep(1.76, 1.94, r));',
        '  float flick = 0.9 + 0.1 * sin(uTime * 2.3);',
        '  vec3 col = uColHot * (core * 2.2 + glow * 0.22) * flick * (1.0 - uDie * 0.45);',
        '  gl_FragColor = vec4(col, clamp(core + glow * 0.6, 0.0, 1.0));',
        '}'
      ].join('\n')
    })
  );
  photon.renderOrder = 4;
  photon.frustumCulled = false;
  scene.add(photon);

  /* ---------- 时钟遗迹（崩解中的青铜钟环） ---------- */
  var clockGroup = new T.Group();
  clockGroup.rotation.set(0.42, 0.1, -0.16);
  scene.add(clockGroup);

  var bronze = new T.MeshStandardMaterial({
    color: new T.Color(0x7a5f3a).convertSRGBToLinear(), metalness: 0.55, roughness: 0.42,
    emissive: new T.Color(0x140b04).convertSRGBToLinear(), fog: true
  });
  bronze.onBeforeCompile = function (sh) {
    sh.uniforms.uEntropy = U.entropy;
    sh.uniforms.uEmber = U.colEmber;
    sh.vertexShader = 'varying vec3 vDisPos;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      ['#include <project_vertex>',
       'vec4 disW = vec4(transformed, 1.0);',
       '#ifdef USE_INSTANCING',
       '  disW = instanceMatrix * disW;',
       '#endif',
       'vDisPos = (modelMatrix * disW).xyz;'].join('\n')
    );
    sh.fragmentShader = ('varying vec3 vDisPos;\nuniform float uEntropy;\nuniform vec3 uEmber;\n' + NOISE + '\n' + sh.fragmentShader)
      .replace('#include <clipping_planes_fragment>', [
        '#include <clipping_planes_fragment>',
        'float disN = fbm(vDisPos.xy * 2.1 + vDisPos.zx * 1.4);',
        'float disT = uEntropy * 1.15 - 0.075;',
        'if (disN < disT) discard;',
        'float disEdge = 1.0 - smoothstep(disT, disT + 0.09, disN);'
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'totalEmissiveRadiance += uEmber * disEdge * 3.2;'
      ].join('\n'));
  };

  var ringDefs = [
    { r: 7.6, tube: 0.075, segs: 9 },
    { r: 9.8, tube: 0.1, segs: 12 },
    { r: 12.2, tube: 0.13, segs: 14 }
  ];
  var rngState = 20261109;
  function rnd() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }
  ringDefs.forEach(function (def) {
    for (var i = 0; i < def.segs; i++) {
      var slot = TAU / def.segs;
      var arc = slot * (0.42 + rnd() * 0.38);
      var geo = new T.TorusGeometry(def.r, def.tube, 10, 48, arc);
      var seg = new T.Mesh(geo, bronze);
      seg.rotation.z = i * slot + rnd() * slot * 0.2;
      clockGroup.add(seg);
    }
  });

  // 刻度（实例化）
  var tickGeo = new T.BoxGeometry(0.05, 0.34, 0.05);
  var ticks = new T.InstancedMesh(tickGeo, bronze, 120);
  var m4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3();
  var zAxis = new T.Vector3(0, 0, 1);
  for (var ti = 0; ti < 120; ti++) {
    var ta = ti / 120 * TAU;
    v3.set(Math.cos(ta) * 9.8, Math.sin(ta) * 9.8, 0);
    q4.setFromAxisAngle(zAxis, ta - Math.PI / 2);
    s3.set(1, ti % 10 === 0 ? 1.9 : 1, 1);
    m4.compose(v3, q4, s3);
    ticks.setMatrixAt(ti, m4);
  }
  ticks.instanceMatrix.needsUpdate = true;
  clockGroup.add(ticks);

  // 罗马数字（Canvas 字形精灵）
  var ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  var numerals = [];
  ROMAN.forEach(function (txt, i) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    var c2 = cv.getContext('2d');
    c2.font = '600 52px "Songti SC", "Noto Serif SC", serif';
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.shadowColor = '#ff9a3c'; c2.shadowBlur = 16;
    c2.fillStyle = '#ffd9a0';
    c2.fillText(txt, 64, 68);
    var tex = new T.CanvasTexture(cv);
    var sm = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 });
    var sp = new T.Sprite(sm);
    var a = Math.PI / 2 - i * TAU / 12;
    sp.position.set(Math.cos(a) * 12.2, Math.sin(a) * 12.2, 0);
    sp.scale.set(1.6, 1.6, 1);
    clockGroup.add(sp);
    numerals.push({ sprite: sp, phase: rnd() * TAU });
  });

  // 时分双针：四棱锥台长针 + 配重
  function makeHand(len, width) {
    var g = new T.Group();
    var rod = new T.Mesh(new T.CylinderGeometry(0.028, width, len, 4), bronze);
    rod.geometry.translate(0, len / 2, 0);
    g.add(rod);
    var weight = new T.Mesh(new T.SphereGeometry(width * 2.1, 12, 10), bronze);
    weight.position.y = -0.85;
    g.add(weight);
    clockGroup.add(g);
    return g;
  }
  var hourHand = makeHand(4.9, 0.2);
  var minuteHand = makeHand(7.2, 0.14);

  /* ---------- 粒子系统（星野 / 星尘 / 时间之沙 / 坍缩迸发） ---------- */
  var stars = null, dust = null, sand = null, burst = null;
  var sandCount = 0;

  function makePoints(count, fill, vertexShader, extraUniforms) {
    var geo = new T.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var seed = new Float32Array(count * 4);
    var extra = fill(pos, seed, count);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new T.BufferAttribute(seed, 4));
    if (extra) Object.keys(extra).forEach(function (k) { geo.setAttribute(k, extra[k]); });
    var mat = new T.ShaderMaterial({
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false,
      uniforms: Object.assign({
        uTime: U.time, uPixelRatio: U.pixelRatio,
        uColHot: U.colHot, uColMid: U.colMid, uColCool: U.colCool, uColAcc: U.colAcc
      }, extraUniforms || {}),
      vertexShader: vertexShader,
      fragmentShader: SOFT_DOT
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    scene.add(pts);
    return pts;
  }

  var STAR_VERT = [
    'attribute vec4 aSeed;',
    'uniform float uTime, uPixelRatio, uStarDim;',
    'uniform vec3 uColAcc, uColMid;',
    'varying vec3 vCol; varying float vAlpha;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  float tw = 0.62 + 0.38 * sin(uTime * (0.4 + aSeed.y * 1.2) + aSeed.x * 17.0);',
    '  vCol = mix(vec3(0.75, 0.82, 1.0), uColAcc, step(0.66, aSeed.z) * 0.7);',
    '  vCol = mix(vCol, uColMid, step(0.9, aSeed.w) * 0.8);',
    '  vAlpha = tw * uStarDim * (0.45 + 0.55 * aSeed.y);',
    '  gl_PointSize = clamp((0.4 + aSeed.w * 1.2) * uPixelRatio * (160.0 / -mv.z), 0.6, 4.2);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var DUST_VERT = [
    'attribute vec4 aSeed;',
    'uniform float uTime, uPixelRatio, uDie;',
    'uniform vec3 uColMid, uColAcc;',
    'varying vec3 vCol; varying float vAlpha;',
    'void main(){',
    '  vec3 p = position;',
    '  p.x += sin(uTime * 0.06 + aSeed.x * 6.28) * 1.6;',
    '  p.y += sin(uTime * 0.045 + aSeed.y * 6.28) * 1.1;',
    '  p.z += cos(uTime * 0.05 + aSeed.z * 6.28) * 1.6;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vCol = mix(uColMid, uColAcc, aSeed.z) * 0.3;',
    '  vAlpha = (0.04 + 0.08 * aSeed.w) * (0.7 + 0.3 * sin(uTime * 0.3 + aSeed.x * 12.0)) * (1.0 - uDie * 0.6);',
    '  gl_PointSize = clamp((0.3 + aSeed.w * 0.7) * uPixelRatio * (120.0 / -mv.z), 0.5, 3.5);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var SAND_VERT = [
    'attribute vec4 aSeed;',
    'uniform float uTime, uInfall, uPixelRatio, uSandAlpha, uEntropy, uDie;',
    'uniform vec3 uColHot, uColMid, uColCool;',
    'varying vec3 vCol; varying float vAlpha;',
    'void main(){',
    '  float cycle = fract(uTime * 0.05 * uInfall * (0.55 + aSeed.z) + aSeed.x * 9.17);',
    '  float r0 = mix(6.9, 13.2, aSeed.y);',
    '  float r = mix(r0, 1.6, pow(cycle, 1.55));',
    '  float ang = aSeed.x * 6.28318 + uTime * (0.1 + 0.3 * aSeed.z) / max(r * 0.16, 0.55) + cycle * 8.0;',
    '  float y = (aSeed.w - 0.5) * 2.6 * (r / r0) * (1.0 - cycle * 0.55);',
    '  vec3 pos = vec3(cos(ang) * r, y, sin(ang) * r);',
    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
    '  float temp = pow(cycle, 2.2);',
    '  vCol = mix(uColCool * 1.2, mix(uColMid, uColHot, temp), smoothstep(0.0, 0.35, cycle));',
    '  vAlpha = smoothstep(0.0, 0.05, cycle) * (1.0 - smoothstep(0.9, 1.0, cycle));',
    '  float arm = smoothstep(-0.25, 0.85, sin(ang * 2.0 + r * 1.45));',
    '  vAlpha *= (0.3 + 0.7 * arm) * (0.28 + 0.32 * aSeed.z) * uSandAlpha * (0.75 + 0.45 * uEntropy) * (1.0 - uDie * 0.85);',
    '  gl_PointSize = clamp((0.35 + aSeed.w * 0.9) * uPixelRatio * (120.0 / -mv.z), 0.6, 4.5);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BURST_VERT = [
    'attribute vec4 aSeed; attribute vec3 aVel;',
    'uniform float uBurstT, uPixelRatio;',
    'uniform vec3 uColHot, uColMid, uColCool;',
    'varying vec3 vCol; varying float vAlpha;',
    'void main(){',
    '  float t = uBurstT;',
    '  float on = step(0.0, t) * step(t, 1.7);',
    '  float tt = clamp(t, 0.0, 1.7);',
    '  vec3 pos = aVel * tt * (1.0 - 0.3 * min(tt, 1.0));',
    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
    '  float fade = 1.0 - tt / 1.7;',
    '  vCol = mix(uColHot, mix(uColMid, uColCool, tt / 1.7), min(tt * 1.4, 1.0));',
    '  vAlpha = fade * fade * on * (0.4 + 0.6 * aSeed.w);',
    '  gl_PointSize = clamp((0.6 + aSeed.w * 2.0) * fade * uPixelRatio * (180.0 / -mv.z), 0.5, 9.0);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  function buildParticles(q) {
    [stars, dust, sand, burst].forEach(function (p) {
      if (p) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
    });
    stars = makePoints(q.stars, function (pos, seed) {
      for (var i = 0; i < q.stars; i++) {
        var u = rnd() * 2 - 1, a = rnd() * TAU;
        var rr = 70 + rnd() * 60;
        var s = Math.sqrt(1 - u * u);
        pos[i * 3] = Math.cos(a) * s * rr;
        pos[i * 3 + 1] = u * rr;
        pos[i * 3 + 2] = Math.sin(a) * s * rr;
        seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd();
      }
    }, STAR_VERT, { uStarDim: U.starDim });

    dust = makePoints(q.dust, function (pos, seed) {
      for (var i = 0; i < q.dust; i++) {
        var a = rnd() * TAU, rr = 14 + rnd() * 34;
        pos[i * 3] = Math.cos(a) * rr;
        pos[i * 3 + 1] = (rnd() - 0.5) * 26;
        pos[i * 3 + 2] = Math.sin(a) * rr;
        seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd();
      }
    }, DUST_VERT, { uDie: U.die });

    sandCount = q.sand;
    sand = makePoints(q.sand, function (pos, seed) {
      for (var i = 0; i < q.sand; i++) {
        seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd();
      }
    }, SAND_VERT, { uInfall: U.infall, uSandAlpha: U.sandAlpha, uEntropy: U.entropy, uDie: U.die });
    sand.geometry.setDrawRange(0, Math.floor(q.sand * U.sandAlpha.value));

    burst = makePoints(1600, function (pos, seed, count) {
      var vel = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        var a = rnd() * TAU, u = (rnd() - 0.5) * 0.5;
        var sp = 6 + rnd() * 15;
        var s = Math.sqrt(1 - u * u);
        vel[i * 3] = Math.cos(a) * s * sp;
        vel[i * 3 + 1] = u * sp;
        vel[i * 3 + 2] = Math.sin(a) * s * sp;
        seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd();
      }
      return { aVel: new T.BufferAttribute(vel, 3) };
    }, BURST_VERT, { uBurstT: U.burstT });
  }

  /* ---------- 坍缩冲击波环 ---------- */
  function makeShock(colorUniform) {
    var mesh = new T.Mesh(
      new T.RingGeometry(0.94, 1.0, 96),
      new T.ShaderMaterial({
        transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false,
        uniforms: { uT: { value: 2 }, uCol: colorUniform },
        vertexShader: 'varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'varying vec2 vPos; uniform float uT; uniform vec3 uCol;',
          'void main(){',
          '  float r = length(vPos);',
          '  float band = smoothstep(0.94, 0.965, r) * (1.0 - smoothstep(0.985, 1.0, r));',
          '  float fade = pow(clamp(1.0 - uT, 0.0, 1.0), 2.2);',
          '  gl_FragColor = vec4(uCol * 2.2, band * fade * 0.85);',
          '}'
        ].join('\n')
      })
    );
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }
  var shock1 = makeShock(U.colMid);
  var shock2 = makeShock(U.colAcc);

  /* ---------- 灯光 ---------- */
  var coreLight = new T.PointLight(new T.Color(THEMES.gold.ember).convertSRGBToLinear(), 1.25, 80, 2);
  scene.add(coreLight);
  var rimLight = new T.DirectionalLight(new T.Color(THEMES.gold.acc).convertSRGBToLinear(), 0.75);
  rimLight.position.set(-26, 20, -18);
  scene.add(rimLight);
  scene.add(new T.AmbientLight(new T.Color(0x2a3247).convertSRGBToLinear(), 0.7));

  /* ---------- 后处理：HalfFloat → UnrealBloom → 调色（ACES/gamma/色差/暗角/颗粒） ---------- */
  var size = new T.Vector2();
  renderer.getSize(size);
  var rt = new T.WebGLRenderTarget(Math.max(size.x, 2), Math.max(size.y, 2), {
    type: T.HalfFloatType, format: T.RGBAFormat,
    minFilter: T.LinearFilter, magFilter: T.LinearFilter,
    depthBuffer: true, stencilBuffer: false
  });
  var composer = new T.EffectComposer(renderer, rt);
  composer.addPass(new T.RenderPass(scene, camera));
  var bloomPass = new T.UnrealBloomPass(new T.Vector2(640, 360), 0.7, 0.5, 0.35);
  composer.addPass(bloomPass);
  var gradePass = new T.ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 }, uPulse: { value: 0 },
      uGrain: { value: 0.035 }, uVignette: { value: 0.42 }, uAberration: { value: 1 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec2 vUv;',
      'uniform sampler2D tDiffuse;',
      'uniform float uTime, uPulse, uGrain, uVignette, uAberration;',
      'void main(){',
      '  vec2 dir = vUv - 0.5;',
      '  float ab = (0.0012 + uPulse * 0.012) * uAberration;',
      '  vec3 col;',
      '  col.r = texture2D(tDiffuse, vUv + dir * ab).r;',
      '  col.g = texture2D(tDiffuse, vUv).g;',
      '  col.b = texture2D(tDiffuse, vUv - dir * ab).b;',
      '  col = max(col, vec3(0.0));',
      '  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);',
      '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
      '  col = mix(col, col * vec3(1.05, 1.0, 0.94), 0.5);',
      '  col += vec3(0.0, 0.003, 0.01) * (1.0 - lum);',
      '  col *= 1.0 - uVignette * smoothstep(0.42, 0.98, length(dir) * 1.35);',
      '  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));',
      '  float g = fract(sin(dot(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 60.0, vec2(12.9898, 78.233))) * 43758.5453);',
      '  col += (g - 0.5) * uGrain;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });
  composer.addPass(gradePass);

  /* ---------- 相机轨道（阻尼 + 惯性 + 视差 + 触屏捏合 + 震屏） ---------- */
  var rig = {
    theta: 0.55, el: 0.3, radius: 46,
    gTheta: 0.55, gEl: 0.3, gRadius: 26,
    vTheta: 0, vEl: 0,
    target: new T.Vector3(0, 0.2, 0),
    par: new T.Vector2(), parGoal: new T.Vector2(),
    trauma: 0, idle: 0, intro: true, introT: 0
  };
  var pointers = new Map();
  var downInfo = null;
  var pinchDist = 0;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var api = { onTap: null, onDist: null, onFirstGesture: null };
  var firstGestureFired = false;

  function clampEl(v) { return Math.max(-0.12, Math.min(1.4, v)); }
  function clampR(v) { return Math.max(12, Math.min(55, v)); }

  canvas.addEventListener('pointerdown', function (e) {
    if (!firstGestureFired) { firstGestureFired = true; if (api.onFirstGesture) api.onFirstGesture(); }
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downInfo = { x: e.clientX, y: e.clientY, t: performance.now() };
      rig.vTheta = 0; rig.vEl = 0;
      canvas.classList.add('dragging');
    } else if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      downInfo = null;
    }
    rig.intro = false;
    rig.idle = 0;
  });
  canvas.addEventListener('pointermove', function (e) {
    var nx = (e.clientX / window.innerWidth) * 2 - 1;
    var ny = (e.clientY / window.innerHeight) * 2 - 1;
    rig.parGoal.set(nx * 0.5, -ny * 0.3);
    if (!pointers.has(e.pointerId)) return;
    var prev = pointers.get(e.pointerId);
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rig.idle = 0;
    if (pointers.size === 1) {
      var k = 0.0046;
      rig.gTheta -= dx * k;
      rig.gEl = clampEl(rig.gEl + dy * k);
      rig.vTheta = -dx * k; rig.vEl = dy * k;
    } else if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist > 0 && d > 0) {
        rig.gRadius = clampR(rig.gRadius * pinchDist / d);
        if (api.onDist) api.onDist(rig.gRadius);
      }
      pinchDist = d;
    }
  });
  function endPointer(e) {
    var wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      canvas.classList.remove('dragging');
      if (wasSingle && downInfo) {
        var moved = Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y);
        var dt = performance.now() - downInfo.t;
        if (moved < 7 && dt < 450) handleTap(e.clientX, e.clientY);
      }
      downInfo = null;
    }
    pinchDist = 0;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    rig.intro = false;
    rig.idle = 0;
    rig.gRadius = clampR(rig.gRadius * Math.exp(e.deltaY * 0.0011));
    if (api.onDist) api.onDist(rig.gRadius);
  }, { passive: false });

  var raycaster = new T.Raycaster();
  function handleTap(x, y) {
    var ndc = new T.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObject(horizon);
    if (hits.length > 0 && api.onTap) api.onTap();
  }

  /* ---------- 尺寸 / 画质 ---------- */
  var quality = QUALITY.high;
  var dprCap = quality.dpr;
  var dprCurrent = Math.min(window.devicePixelRatio || 1, dprCap);
  var frameEMA = 16;
  var hotFrames = 0, coolFrames = 0;
  var frameOffset = new T.Vector2(2, 0);

  function applySize() {
    var w = window.innerWidth, h = window.innerHeight;
    frameOffset.set(w > 760 ? 2.0 : 0, w > 760 ? 0 : -1.5);
    renderer.setPixelRatio(dprCurrent);
    renderer.setSize(w, h);
    composer.setPixelRatio(dprCurrent);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    U.pixelRatio.value = dprCurrent;
  }
  window.addEventListener('resize', applySize);

  buildParticles(quality);
  applySize();

  /* ---------- 主题 ---------- */
  function setTheme(name) {
    var th = THEMES[name] || THEMES.gold;
    U.colHot.value.setHex(th.hot).convertSRGBToLinear();
    U.colMid.value.setHex(th.mid).convertSRGBToLinear();
    U.colCool.value.setHex(th.cool).convertSRGBToLinear();
    U.colAcc.value.setHex(th.acc).convertSRGBToLinear();
    U.colEmber.value.setHex(th.ember).convertSRGBToLinear();
    U.nebA.value.setHex(th.nebA).convertSRGBToLinear();
    U.nebB.value.setHex(th.nebB).convertSRGBToLinear();
    coreLight.color.setHex(th.ember).convertSRGBToLinear();
    rimLight.color.setHex(th.acc).convertSRGBToLinear();
  }

  /* ---------- 每帧更新 ---------- */
  var die = 0;
  var pulse = 0;
  var realTime = 0;
  var shockT = 2, shock2T = 2;
  var sandDensityShown = -1;

  function update(dt, S) {
    realTime += dt;
    U.time.value = S.simTime;
    U.entropy.value = S.entropy;
    U.infall.value = S.infall;
    U.disk.value = S.disk;
    U.sandAlpha.value = S.sand;

    // 沙密度 drawRange
    if (sand && Math.abs(S.sand - sandDensityShown) > 0.001) {
      sandDensityShown = S.sand;
      sand.geometry.setDrawRange(0, Math.floor(sandCount * S.sand));
    }

    // 终焉沉降
    die += ((S.terminal ? 1 : 0) - die) * Math.min(1, dt * 0.7);
    U.die.value = die;
    U.starDim.value = 1 - die * 0.75;

    // 相机阻尼
    rig.idle += dt;
    if (rig.intro) {
      rig.introT += dt;
      var p = Math.min(rig.introT / 3.2, 1);
      var e = 1 - Math.pow(1 - p, 3);
      rig.gRadius = 46 + (26 - 46) * e;
      if (api.onDist && p < 1) api.onDist(rig.gRadius);
      if (p >= 1) rig.intro = false;
    } else if (S.orbit && rig.idle > 2.5 && !reducedMotion && pointers.size === 0) {
      rig.gTheta += dt * 0.05;
    }
    if (pointers.size === 0) {
      rig.gTheta += rig.vTheta;
      rig.gEl = clampEl(rig.gEl + rig.vEl);
      rig.vTheta *= Math.pow(0.06, dt);
      rig.vEl *= Math.pow(0.06, dt);
    }
    var damp = Math.min(1, dt * 7);
    rig.theta += (rig.gTheta - rig.theta) * damp;
    rig.el += (rig.gEl - rig.el) * damp;
    rig.radius += (rig.gRadius - rig.radius) * damp;
    rig.par.x += (rig.parGoal.x - rig.par.x) * Math.min(1, dt * 3);
    rig.par.y += (rig.parGoal.y - rig.par.y) * Math.min(1, dt * 3);

    rig.trauma = Math.max(0, rig.trauma - dt * 1.1);
    var shake = reducedMotion ? 0 : rig.trauma * rig.trauma;
    var sx = shake * 0.45 * Math.sin(realTime * 47.3);
    var sy = shake * 0.35 * Math.sin(realTime * 39.1 + 1.7);

    var ce = Math.cos(rig.el), se = Math.sin(rig.el);
    camera.position.set(
      Math.cos(rig.theta) * ce * rig.radius + sx,
      se * rig.radius + sy,
      Math.sin(rig.theta) * ce * rig.radius
    );
    var look = new T.Vector3(rig.target.x + rig.par.x, rig.target.y + rig.par.y, rig.target.z);
    camera.lookAt(look);
    camera.translateX(frameOffset.x);
    camera.translateY(frameOffset.y);
    U.camPos.value.copy(camera.position);

    // 面向相机的环
    photon.quaternion.copy(camera.quaternion);
    halo.quaternion.copy(camera.quaternion);
    shock1.quaternion.copy(camera.quaternion);
    shock2.quaternion.copy(camera.quaternion);

    // 时分针
    var handT = S.simTime * 0.35;
    minuteHand.rotation.z = -(handT % TAU);
    hourHand.rotation.z = -(handT / 12 % TAU) - 2.1;

    // 数字 flicker + 蚀
    var numeralFade = 1 - T.MathUtils.smoothstep(S.entropy, 0.35, 0.95);
    for (var i = 0; i < numerals.length; i++) {
      var n = numerals[i];
      var fl = 0.75 + 0.25 * Math.sin(S.simTime * 1.7 + n.phase * 5);
      n.sprite.material.opacity = 0.9 * numeralFade * fl * (1 - die);
    }

    // 灯光随盘亮度呼吸
    coreLight.intensity = (0.35 + S.disk * 0.9) * (1 - die * 0.85) * (1 + pulse * 0.8);

    // 坍缩特效推进（真实时间）
    pulse *= Math.exp(-dt * 2.1);
    if (U.burstT.value >= 0) {
      U.burstT.value += dt;
      if (U.burstT.value > 1.7) U.burstT.value = -1;
    }
    shockT += dt / 1.35;
    shock2T += dt / 1.35;
    updateShock(shock1, shockT);
    updateShock(shock2, shock2T - 0.12);

    // 后处理参数
    bloomPass.strength = 0.7 * S.bloom + pulse * 0.9;
    gradePass.uniforms.uTime.value = realTime;
    gradePass.uniforms.uPulse.value = pulse;

    // 自适应分辨率：持续掉帧降 dpr，富余回升
    frameEMA += (dt * 1000 - frameEMA) * 0.05;
    if (frameEMA > 26 && dprCurrent > 1) {
      if (++hotFrames > 150) { dprCurrent = Math.max(1, dprCurrent - 0.25); applySize(); hotFrames = 0; }
    } else hotFrames = 0;
    if (frameEMA < 13.5 && dprCurrent < Math.min(window.devicePixelRatio || 1, dprCap)) {
      if (++coolFrames > 900) { dprCurrent = Math.min(dprCurrent + 0.25, dprCap); applySize(); coolFrames = 0; }
    } else coolFrames = 0;

    composer.render();
  }

  function updateShock(mesh, t) {
    if (t >= 0 && t < 1) {
      mesh.visible = true;
      mesh.material.uniforms.uT.value = t;
      var s = 2 + t * 42;
      mesh.scale.set(s, s, s);
    } else {
      mesh.visible = false;
    }
  }

  /* ---------- 对外 API ---------- */
  return {
    update: update,
    renderOnce: function () { composer.render(); },
    collapseFx: function () {
      U.burstT.value = 0;
      shockT = 0; shock2T = 0;
      rig.trauma = 1;
      pulse = 1;
    },
    resetFx: function () {
      U.burstT.value = -1;
      shockT = 2; shock2T = 2;
      rig.trauma = 0; pulse = 0; die = 0;
    },
    setTheme: setTheme,
    setQuality: function (level) {
      quality = QUALITY[level] || QUALITY.high;
      dprCap = quality.dpr;
      dprCurrent = Math.min(window.devicePixelRatio || 1, dprCap);
      buildParticles(quality);
      sandDensityShown = -1;
      applySize();
    },
    setDist: function (v) { rig.intro = false; rig.gRadius = clampR(v); },
    getDist: function () { return rig.gRadius; },
    getCam: function () { return { theta: rig.theta, el: rig.el, radius: rig.radius }; },
    getFPS: function () { return 1000 / Math.max(frameEMA, 0.01); },
    getSandCount: function () { return sandCount; },
    exportPNG: function () {
      composer.render();
      return canvas.toDataURL('image/png');
    },
    on: api
  };
};