/* 时间的尽头 · The End of Time — Three.js 场景（r128，全部程序化生成，零外部资源）
 *
 * 立意：时间已经死去。一望无际的黑曜石镜面平原上，最后一座沙漏纪念碑矗立；
 * 地平线上，一个巨大的黑洞正吞下最后一束光。尘埃几乎凝固，只在你的注视与触碰下，
 * 时间才重新流动几秒，然后又缓缓停住。
 */

(function () {
  'use strict';
  const TE = window.TE = window.TE || {};

  /* ============================================================
   * GLSL 工具：3D 值噪声 + fbm
   * ============================================================ */
  const NOISE_GLSL = `
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}
float fbm(vec3 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + vec3(11.3, 7.1, 3.7);
    a *= 0.5;
  }
  return v;
}
`;

  /* ============================================================
   * 状态
   * ============================================================ */
  let renderer = null;
  let scene = null;
  let camera = null;
  let composer = null;
  let bloomPass = null;
  let gradeUniforms = null;

  const clock = new THREE.Clock();
  let rafId = 0;
  let started = false;
  let disposed = false;
  let perfAcc = 0;
  let perfN = 0;
  let perfCooldown = 0;

  // "时间流速"：0.14 为凝固的基调；kick 后冲到 1.6 再缓缓衰减
  const flow = { baseline: 0.14, current: 0.14, target: 0.14 };
  let simTime = 0;       // 被 timeScale 拉伸的"世界时间"
  let realTime = 0;

  // 相机轨道
  const orbit = { theta: 0, phi: 1.45, radius: 26 };          // 目标值
  const cam = { theta: 0, phi: 1.38, radius: 78 };             // 阻尼值（开场由远处推近）
  const par = { x: 0, y: 0, tx: 0, ty: 0 };

  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpV3 = new THREE.Vector3();

  // 指针交互
  const pointers = new Map();
  let pressInfo = null;
  let lastPinch = 0;

  // 动态对象引用
  const dynamic = {
    diskMat: null,
    ringMat: null,
    starRayMat: null,
    starStreakMat: null,
    skyMat: null,
    floorMat: null,
    sandMat: null,
    dustMat: null,
    emberMat: null,
    trickle: null,
    hourglass: null,
  };

  /* ============================================================
   * 小工具
   * ============================================================ */
  function makeGlowTexture(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const s of stops) grad.addColorStop(s[0], s[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /* ============================================================
   * 后处理：最后的调色 pass（ACES + gamma + 色差 + 暗角 + 胶片颗粒）
   * ============================================================ */
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: 0.40 },
      uGrain: { value: 0.028 },
      uCA: { value: 0.0012 },
      uExposure: { value: 0.95 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uCA;
      uniform float uExposure;
      varying vec2 vUv;

      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      void main() {
        vec2 uv = vUv;
        vec2 d = uv - 0.5;

        // 色差：越靠边缘越明显
        float ca = uCA * (1.0 + 7.0 * dot(d, d));
        vec3 col;
        col.r = texture2D(tDiffuse, uv - d * ca).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv + d * ca).b;

        // 曝光 + 胶片曲线 + gamma
        col = aces(col * uExposure);
        col = pow(col, vec3(1.0 / 2.2));

        // 冷暖分级：阴影偏冷，高光偏暖
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(luma) * vec3(0.90, 0.95, 1.06), col, 1.10);
        col = mix(col, col * vec3(1.07, 1.01, 0.93), smoothstep(0.55, 0.95, luma) * 0.28);

        // 暗角
        float vig = smoothstep(0.92, 0.32, length(d) * 1.28);
        col *= mix(1.0, vig, uVignette);

        // 胶片颗粒 + 轻微抖动（防止色带）
        float g = hash21(uv * vec2(1920.0, 1080.0) + fract(uTime) * 61.7) - 0.5;
        col += g * uGrain;
        col += (hash21(uv * vec2(1234.5, 5678.9)) - 0.5) / 255.0;

        gl_FragColor = vec4(col, 1.0);
      }`,
  };

  /* ============================================================
   * 场景搭建
   * ============================================================ */
  function buildRenderer(canvas) {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x02030a, 1);
    // 全程线性空间，最终调色 pass 自己负责 ACES + gamma，避免双重处理
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputEncoding = THREE.LinearEncoding;
  }

  function buildPost() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const rtType = isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: rtType,
      depthBuffer: true,
      stencilBuffer: false,
    });

    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));

    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.40,   // strength
      0.55,   // radius
      0.78    // threshold
    );
    composer.addPass(bloomPass);

    const gradePass = new THREE.ShaderPass(GradeShader);
    gradeUniforms = gradePass.uniforms;
    composer.addPass(gradePass);
  }

  function buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uStarDir: { value: new THREE.Vector3(-0.257, 0.013, -0.966).normalize() },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uStarDir;
        uniform float uTime;
        varying vec3 vDir;

        void main() {
          vec3 d = normalize(vDir);
          vec3 warm = vec3(1.0, 0.55, 0.24);
          float horizon = exp(-abs(d.y) * 9.5);
          float halo = pow(max(dot(d, uStarDir), 0.0), 5.0);
          float core = pow(max(dot(d, uStarDir), 0.0), 55.0);

          vec3 zenith = vec3(0.005, 0.007, 0.015);
          vec3 horizonCol = vec3(0.020, 0.024, 0.040);
          vec3 col = mix(zenith, horizonCol, horizon * 0.72);

          float pulse = 0.93 + 0.07 * sin(uTime * 0.8);
          col += warm * (halo * 0.05 + core * 0.40) * pulse;

          // 地平线上一带若有若无的暖色，集中在"最后一束光"一侧
          float side = 0.5 + 0.5 * dot(normalize(d.xz + 0.0001), normalize(uStarDir.xz));
          col += warm * horizon * 0.028 * side * side;

          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    dynamic.skyMat = mat;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -20;
    scene.add(sky);
  }

  function buildFloor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uBH: { value: new THREE.Vector3(6, 23, -210) },
        uStar: { value: new THREE.Vector3(-40, 2.2, -150) },
        uMonument: { value: new THREE.Vector3(0, 0, -44) },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform vec3 uBH;
        uniform vec3 uStar;
        uniform vec3 uMonument;
        uniform float uTime;
        varying vec3 vWorld;

        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);

          vec3 base = vec3(0.0045, 0.0065, 0.012);

          // 黑曜石镜面：黑洞与最后一束光的倒影被拉长成光路
          float bhDx = vWorld.x - uBH.x;
          float bhDz = vWorld.z - uBH.z;
          float bhGlow = exp(-length(vec2(bhDx * 0.5, bhDz * 0.055)) * 0.5);
          float starDx = vWorld.x - uStar.x;
          float starDz = vWorld.z - uStar.z;
          float starGlow = exp(-length(vec2(starDx * 0.5, starDz * 0.055)) * 0.45);

          // 纪念碑脚下的一小片暖光（沙的余烬洒在黑曜石上）
          float monD = length(vWorld.xz - uMonument.xz);
          float monGlow = exp(-monD * 0.55);

          vec3 col = base;
          float depth = length(cameraPosition - vWorld);
          col += vec3(0.55, 0.32, 0.14) * monGlow * 0.35 * (0.88 + 0.12 * sin(uTime * 0.9));
          col += vec3(0.50, 0.30, 0.16) * starGlow * 0.42 * (0.90 + 0.10 * sin(uTime * 2.2));
          col += vec3(0.45, 0.28, 0.15) * bhGlow * 0.55;
          col += vec3(0.018, 0.022, 0.038) * fres * 2.2 * exp(-depth * 0.03);

          // 细微的黑曜石纹理
          float g = fbm(vec3(vWorld.xz * 0.33, uTime * 0.02));
          col *= 0.93 + 0.07 * g;

          // 雾（与天空地平线颜色衔接，避免硬边）
          float fog = 1.0 - exp(-0.010 * depth);
          vec2 dirXZ = normalize(vWorld.xz + vec2(0.0001));
          float sideF = 0.5 + 0.5 * dot(dirXZ, vec2(-0.257, -0.966));
          vec3 fogCol = vec3(0.0155, 0.0190, 0.0325) + vec3(1.0, 0.55, 0.24) * 0.028 * sideF * sideF;
          col = mix(col, fogCol, clamp(fog, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    dynamic.floorMat = mat;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = false;
    scene.add(floor);
  }

  function buildBlackHole() {
    const group = new THREE.Group();
    group.position.set(6, 23, -210);

    const R = 14;          // 事件视界半径
    const R_IN = 15.2;     // 吸积盘内径
    const R_OUT = 48;      // 吸积盘外径

    // —— 事件视界（纯黑，不参与雾）——
    const horizon = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
    );
    group.add(horizon);

    // —— 吸积盘（自定义着色器：多普勒增亮 + 差速旋转湍流）——
    const diskMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uInner: { value: R_IN },
        uOuter: { value: R_OUT },
        uViewPhase: { value: -1.35 },
      },
      vertexShader: `
        varying vec2 vLocal;
        void main() {
          vLocal = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform float uTime;
        uniform float uInner;
        uniform float uOuter;
        uniform float uViewPhase;
        varying vec2 vLocal;

        void main() {
          vec2 p = vLocal;
          float r = length(p);
          float a = atan(p.y, p.x);

          float nr = smoothstep(uInner, uInner + 2.2, r) *
                     (1.0 - smoothstep(uOuter - 7.5, uOuter, r));
          float rad = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);

          // 差速旋转：内圈转得快
          float omega = pow(r / uInner, -1.35);
          float aflow = a + uTime * 0.13 * omega;

          float turb = fbm(vec3(aflow * 2.6, r * 0.08 + uTime * 0.014, uTime * 0.04));
          turb = turb * turb * 1.9;
          float detail = fbm(vec3(a * 9.0, r * 0.45 - uTime * 0.05, 1.7));
          float beam = pow(max(0.45 + 0.55 * cos(a - uViewPhase), 0.0), 3.2);

          float profile = mix(1.0, 0.02, pow(rad, 2.2));
          float rim = exp(-(r - uInner) * 2.2) * 2.3;

          float intensity = nr * (profile * (0.45 + turb) + rim) *
                            (0.22 + 0.78 * beam) * (0.30 + 0.70 * detail) * 1.35;

          vec3 innerCol = vec3(1.0, 0.94, 0.84);
          vec3 midCol   = vec3(1.0, 0.50, 0.14);
          vec3 outerCol = vec3(0.26, 0.045, 0.015);

          vec3 col = mix(innerCol, midCol, smoothstep(0.0, 0.45, rad));
          col = mix(col, outerCol, smoothstep(0.45, 1.0, rad));

          // 远侧更红更暗
          col = mix(col, col * vec3(1.35, 0.52, 0.32), (1.0 - beam) * 0.55);

          gl_FragColor = vec4(col * intensity, 1.0);
        }`,
    });
    dynamic.diskMat = diskMat;

    const disk = new THREE.Mesh(new THREE.RingGeometry(R_IN, R_OUT, 256, 1), diskMat);
    disk.rotation.x = -Math.PI / 2;
    disk.renderOrder = 10;
    group.add(disk);

    // —— 光子环：事件视界边缘一条细亮的光环 ——
    const ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPhase: { value: -1.35 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform float uTime;
        uniform float uPhase;
        varying vec2 vUv;

        void main() {
          float u = vUv.x * 6.28318;
          float beam = pow(max(0.42 + 0.58 * cos(u - uPhase), 0.0), 2.4);
          float flick = 0.82 + 0.18 * fbm(vec3(u * 3.0, uTime * 0.6, 0.0));
          float intensity = (0.25 + 0.75 * beam) * flick;
          vec3 col = mix(vec3(1.0, 0.55, 0.20), vec3(1.0, 0.97, 0.90), beam * 0.7);
          gl_FragColor = vec4(col * intensity * 3.4, 1.0);
        }`,
    });
    dynamic.ringMat = ringMat;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.5, 0.34, 8, 256), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 11;
    group.add(ring);

    // —— 引力透镜晕：一圈环绕剪影的柔光 ——
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(256, [
        [0, 'rgba(255,255,255,0.85)'],
        [0.35, 'rgba(150,160,210,0.14)'],
        [0.7, 'rgba(110,120,180,0.03)'],
        [1, 'rgba(0,0,0,0)'],
      ]),
      color: 0x6d7fb8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.26,
    }));
    halo.scale.set(R * 2.6, R * 2.6, 1);
    halo.renderOrder = 12;
    group.add(halo);

    // 整组向镜头方向微微倾侧，让盘面像一顶斜戴的王冠
    group.rotation.x = -0.38;
    group.rotation.z = 0.04;
    scene.add(group);
  }

  function buildStar() {
    const pos = new THREE.Vector3(-40, 2.2, -150);

    const glowTex = makeGlowTexture(256, [
      [0, 'rgba(255,240,218,1)'],
      [0.18, 'rgba(255,184,102,0.85)'],
      [0.42, 'rgba(255,132,60,0.28)'],
      [0.72, 'rgba(255,110,50,0.06)'],
      [1, 'rgba(0,0,0,0)'],
    ]);

    // 核心
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffe9c8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 1.0,
    }));
    core.scale.set(3.2, 3.2, 1);
    core.renderOrder = 21;

    // 大范围光晕
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xff9a4d,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 0.32,
    }));
    aura.scale.set(11, 11, 1);
    aura.renderOrder = 20;

    // 放射状光缕（镜头朝向的 billboard，fbm 辐条缓慢旋转）
    const rayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xff9a4d) },
        uIntensity: { value: 0.15 },
        uSize: { value: 18.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uSize;
        void main() {
          vUv = position.xy + 0.5;
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          gl_Position = projectionMatrix * (mv + vec4(position.xy * uSize, 0.0, 0.0));
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float ang = atan(d.y, d.x);
          float rays = fbm(vec3(ang * 5.0, r * 7.0 - uTime * 0.10, 0.3));
          float spokes = pow(max(rays, 0.0), 2.6);
          float radial = smoothstep(1.0, 0.0, r);
          float body = pow(max(1.0 - r, 0.0), 2.0) * 0.30;
          float alpha = (body + spokes * radial * 0.8) * uIntensity;
          gl_FragColor = vec4(uColor, alpha);
        }`,
    });
    dynamic.starRayMat = rayMat;
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rayMat);
    rays.position.copy(pos);
    rays.renderOrder = 22;
    scene.add(rays);

    // 横向镜头眩光（anamorphic 拉丝）
    const streakMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffc27d) },
        uIntensity: { value: 0.42 },
        uSizeX: { value: 46.0 },
        uSizeY: { value: 1.4 },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uSizeX;
        uniform float uSizeY;
        void main() {
          vUv = position.xy + 0.5;
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          gl_Position = projectionMatrix * (mv + vec4(position.x * uSizeX, position.y * uSizeY, 0.0, 0.0));
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
          float x = vUv.x - 0.5;
          float y = vUv.y - 0.5;
          float core = exp(-x * x * 64.0);
          float wide = exp(-abs(x) * 3.0) * 0.30;
          float across = exp(-y * y * 30.25);   // 上下羽化，避免硬边矩形
          float flick = 0.92 + 0.08 * sin(uTime * 2.1);
          float alpha = (core + wide) * across * uIntensity * flick;
          gl_FragColor = vec4(uColor, alpha);
        }`,
    });
    dynamic.starStreakMat = streakMat;
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), streakMat);
    streak.position.copy(pos);
    streak.renderOrder = 23;
    scene.add(streak);

    // 光照：最后一束光
    const light = new THREE.PointLight(0xff9a4d, 2.0, 170, 1.8);
    light.position.copy(pos);
    scene.add(light);

    const keyDir = new THREE.DirectionalLight(0xff8a3d, 0.30);
    keyDir.position.set(-40, 4, -150);
    scene.add(keyDir);
  }

  function hourglassProfileHalf(n) {
    // 上半/下半对称的沙漏剖面（半径 r，高度 y），y ∈ [0, H]
    const H = 4.6, R = 2.05, NECK = 0.30;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;               // 0 在颈口，1 在顶端
      const y = t * H;
      const r = NECK * Math.exp(-t * 6.0) + R * Math.pow(Math.sin(Math.PI * t), 0.90);
      pts.push(new THREE.Vector2(Math.max(r, 0.02), y));
    }
    return { pts, H, R, NECK };
  }

  function buildHourglass() {
    const group = new THREE.Group();
    const H = 4.6, R = 2.05, NECK = 0.30;
    group.position.set(0, 0, -44);

    const bronze = new THREE.MeshStandardMaterial({
      color: 0x241c14,
      metalness: 0.9,
      roughness: 0.42,
    });
    const darkStone = new THREE.MeshStandardMaterial({
      color: 0x0a0e16,
      metalness: 0.3,
      roughness: 0.78,
    });

    // —— 底座 ——
    const step = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.05, 0.24, 64), darkStone);
    step.position.y = 0.12;
    group.add(step);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.05, 0.62, 64), darkStone);
    plinth.position.y = 0.55;
    group.add(plinth);

    // 底座上缘一圈极暗的琥珀光环
    const plinthRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.45, 0.03, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x9a6428, transparent: true, opacity: 0.5 })
    );
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.y = 0.87;
    group.add(plinthRing);

    // —— 框架：顶/底盘 + 三根立柱 ——
    const capGeo = new THREE.CylinderGeometry(2.62, 2.62, 0.2, 64);
    const bottom = new THREE.Mesh(capGeo, bronze);
    bottom.position.y = 0.88;
    group.add(bottom);
    const top = new THREE.Mesh(capGeo, bronze);
    top.position.y = 0.88 + 2 * H + 0.2;
    group.add(top);

    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 2 * H + 0.2, 8), bronze);
      pillar.position.set(Math.cos(ang) * 2.42, 0.88 + H + 0.1, Math.sin(ang) * 2.42);
      group.add(pillar);
    }

    // —— 玻璃沙漏（Lathe，自定义玻璃 shader）——
    const glassMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTint: { value: new THREE.Color(0x0e1524) },
        uRim: { value: new THREE.Color(0x8fa8e0) },
        uGlow: { value: new THREE.Color(0xffa64d) },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uTint;
        uniform vec3 uRim;
        uniform vec3 uGlow;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vView;

        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vView);
          float fres = pow(1.0 - abs(dot(N, V)), 2.0);
          float fres3 = fres * fres * fres;
          float breathe = 0.90 + 0.10 * sin(uTime * 0.7);

          vec3 col = uTint * (0.08 + 0.34 * fres);
          col += uRim * fres3 * 0.75;
          col += uGlow * fres * 0.06 * breathe;

          float alpha = clamp(0.05 + 0.30 * fres + 0.22 * fres3, 0.0, 0.58);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    dynamic.glassMat = glassMat;

    const half = hourglassProfileHalf(64);
    const profile = [];
    for (let i = half.pts.length - 1; i > 0; i--) {
      const p = half.pts[i];
      profile.push(new THREE.Vector2(p.x, -p.y));
    }
    for (let i = 0; i < half.pts.length; i++) {
      profile.push(new THREE.Vector2(half.pts[i].x, half.pts[i].y));
    }
    const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), glassMat);
    glass.position.y = 0.88 + H;
    glass.renderOrder = 30;
    group.add(glass);

    // —— 下瓶底部：最后的一小堆发光沙 ——
    const sandMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffa044) },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vY;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = -mv.xyz;
          vY = position.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vY;

        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vView);
          float fres = pow(1.0 - abs(dot(N, V)), 2.0);
          float shimmer = fbm(N * 3.0 + uTime * 0.06);
          float pulse = 0.78 + 0.22 * sin(uTime * 0.9);
          float glow = smoothstep(0.0, 0.9, vY);   // 堆顶更亮，像余烬
          vec3 col = uColor * (0.28 + shimmer * 0.42 + glow * 0.5) * pulse;
          col += uColor * fres * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    dynamic.sandMat = sandMat;

    // 沙堆：一个带圆顶的锥形小丘
    const heapH = 0.95, heapR = 0.78;
    const heapPts = [];
    const heapN = 28;
    for (let i = 0; i <= heapN; i++) {
      const t = i / heapN;
      const y = t * heapH;
      const r = heapR * Math.pow(1.0 - t, 0.55) * Math.pow(0.15 + 0.85 * t, 0.35);
      heapPts.push(new THREE.Vector2(Math.max(r, 0.015), y));
    }
    heapPts.push(new THREE.Vector2(0.001, heapH));
    const heap = new THREE.Mesh(new THREE.LatheGeometry(heapPts, 48), sandMat);
    heap.position.y = 0.92;
    group.add(heap);

    // 上瓶残沙：极薄的一层，悬在颈口上方
    const residue = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), sandMat);
    residue.scale.set(1, 0.3, 1);
    residue.position.y = 0.88 + H + 0.42;
    group.add(residue);

    // 暖光：沙堆把微光洒在底座与框架上
    const sandLight = new THREE.PointLight(0xff9a3d, 0.9, 14, 2.0);
    sandLight.position.set(0, 2.1, 0);
    group.add(sandLight);

    dynamic.hourglass = group;
    scene.add(group);
    return { H, R, NECK };
  }

  function buildTrickle(dims) {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const { NECK } = dims;
    const baseY = 0.88;                  // 底座顶面
    const topY = baseY + 5.1;            // 上瓶颈口上方
    const botY = baseY + 2.4;            // 悬在下瓶半空（未落尽）

    for (let i = 0; i < count; i++) {
      const t = i / count;
      positions[i * 3 + 0] = (Math.random() - 0.5) * NECK * 0.5;
      positions[i * 3 + 1] = topY - t * (topY - botY);
      positions[i * 3 + 2] = (Math.random() - 0.5) * NECK * 0.5;
      speeds[i] = 0.22 + Math.random() * 0.55;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffd09a,
      size: 0.06,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });
    const points = new THREE.Points(geo, mat);
    points.position.set(0, 0, -44);
    points.renderOrder = 29;
    scene.add(points);
    dynamic.trickle = { points, positions, speeds, count, topY, botY };
  }

  function buildPillars() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x080b13,
      metalness: 0.12,
      roughness: 0.9,
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const N = 9;
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const seeds = [0.13, 0.37, 0.61, 0.83, 0.21, 0.49, 0.74, 0.92, 0.05];
    for (let i = 0; i < N; i++) {
      const a = seeds[i] * Math.PI * 2;
      const dist = 58 + ((i * 9.7) % 42);
      const h = 8 + ((i * 3.7) % 13);
      const w = 0.8 + ((i * 1.9) % 1.2);
      p.set(Math.cos(a) * dist, h / 2 - 0.4, -44 + Math.sin(a) * dist * 0.9);
      e.set((Math.random() - 0.5) * 0.06, Math.random() * Math.PI, (Math.random() - 0.5) * 0.06);
      q.setFromEuler(e);
      s.set(w, h, w);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  function buildFallenSlabs() {
    // 纪念碑周围倒伏的断碑：时间的残骸（平贴地面，微微倾斜）
    const mat = new THREE.MeshStandardMaterial({
      color: 0x06080e,
      metalness: 0.15,
      roughness: 0.85,
    });
    const spots = [
      [7.5, -31, 0.55, 3.8, 0.10, 0.3],
      [-9.0, -35, 0.45, 2.9, 0.09, -0.8],
      [13.5, -50, 0.7, 5.2, 0.12, 1.4],
      [-16, -54, 0.6, 4.4, 0.11, -2.1],
      [5.0, -25, 0.4, 2.2, 0.08, 0.1],
      [-5.5, -28, 0.35, 1.8, 0.07, 2.6],
    ];
    spots.forEach((sp) => {
      const [x, z, w, len, thick, yaw] = sp;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, thick, len), mat);
      slab.position.set(x, thick / 2 + 0.02, z);
      slab.rotation.y = yaw;
      slab.rotation.z = (Math.sin(x * 12.9) * 0.5) * 0.06;
      slab.rotation.x = (Math.cos(z * 9.7) * 0.5) * 0.05;
      scene.add(slab);
    });
  }

  function makeParticleField(count, region, palette, sizeRange) {
    const positions = new Float32Array(count * 3);
    const rand = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = region.x0 + Math.random() * (region.x1 - region.x0);
      positions[i * 3 + 1] = region.y0 + Math.random() * (region.y1 - region.y0);
      positions[i * 3 + 2] = region.z0 + Math.random() * (region.z1 - region.z0);
      rand[i * 3 + 0] = Math.random() * 2 - 1;
      rand[i * 3 + 1] = Math.random() * 2 - 1;
      rand[i * 3 + 2] = Math.random();
      c.set(palette[Math.floor(Math.random() * palette.length)]);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uDrift: { value: 0.06 },
        uSpeed: { value: 0.5 },
        uFogDensity: { value: 0.010 },
        uFogColor: { value: new THREE.Color(0x0a0e18) },
      },
      vertexShader: `
        attribute vec3 aRand;
        attribute vec3 aColor;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uDrift;
        uniform float uSpeed;
        varying vec3 vColor;
        varying float vViewZ;

        void main() {
          vec3 p = position;
          float phase = aRand.z * 6.28318;
          p.x += sin(uTime * (0.04 + aRand.x * 0.10) + phase) * 0.55 * aRand.y;
          p.y += uTime * uSpeed * (0.10 + aRand.z * 0.55) * uDrift;
          p.z += cos(uTime * (0.03 + aRand.y * 0.08) + phase * 1.7) * 0.55;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          float size = aSize * uPixelRatio * (90.0 / max(vViewZ, 0.1));
          gl_PointSize = clamp(size, 0.5, 4.5);
          vColor = aColor;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uFogDensity;
        uniform vec3 uFogColor;
        varying vec3 vColor;
        varying float vViewZ;

        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          a *= exp(-uFogDensity * vViewZ);
          gl_FragColor = vec4(vColor, a * 0.55);
        }`,
    });
    return { points: new THREE.Points(geo, mat), mat };
  }

  function buildParticles() {
    // 冷色尘埃：铺满整个空间的"凝固的时间"
    const dustPalette = [0x8fa4c8, 0x5c6c8e, 0xcdd6e8, 0x3a4868];
    const dust = makeParticleField(
      12000,
      { x0: -80, x1: 80, y0: 0.15, y1: 42, z0: -196, z1: -16 },
      dustPalette,
      [0.4, 1.1]
    );
    dust.mat.uniforms.uDrift.value = 0.05;
    dust.mat.uniforms.uSpeed.value = 0.6;
    dust.points.renderOrder = 5;
    dynamic.dustMat = dust.mat;
    scene.add(dust.points);

    // 暖色余烬：黑洞与最后一束光附近
    const emberPalette = [0xffc27d, 0xff9a4d, 0xffd9a0, 0xb8732a];
    const ember = makeParticleField(
      2200,
      { x0: -70, x1: 40, y0: 0.3, y1: 30, z0: -186, z1: -80 },
      emberPalette,
      [0.8, 2.0]
    );
    ember.mat.uniforms.uDrift.value = 0.22;
    ember.mat.uniforms.uSpeed.value = 0.8;
    ember.points.renderOrder = 6;
    dynamic.emberMat = ember.mat;
    scene.add(ember.points);
  }

  /* ============================================================
   * 相机与交互
   * ============================================================ */
  function updateCamera(dt) {
    // 自动漂移 + 呼吸
    orbit.theta += dt * 0.016;
    orbit.phi = 1.45 + Math.sin(realTime * 0.10) * 0.014;

    const k = 1.0 - Math.exp(-dt * 3.2);
    cam.theta += (orbit.theta - cam.theta) * k;
    cam.phi += (orbit.phi - cam.phi) * k;
    cam.radius += (orbit.radius - cam.radius) * k;

    cam.phi = Math.min(1.56, Math.max(0.42, cam.phi));
    cam.radius = Math.min(90, Math.max(13, cam.radius));

    const target = tmpV.set(0, 4.2, -44);
    const pos = tmpV2.setFromSphericalCoords(cam.radius, cam.phi, cam.theta).add(target);
    camera.position.copy(pos);

    // 视差：注视点随鼠标轻轻偏移
    par.x += (par.tx - par.x) * (1 - Math.exp(-dt * 5.0));
    par.y += (par.ty - par.y) * (1 - Math.exp(-dt * 5.0));

    const dir = tmpV3.copy(target).sub(pos).normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const look = new THREE.Vector3()
      .copy(target)
      .addScaledVector(right, par.x * 0.9)
      .addScaledVector(up, par.y * 0.5);
    camera.lookAt(look);
  }

  function setupInteraction(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        pressInfo = { x: e.clientX, y: e.clientY, moved: false, t: performance.now() };
      } else {
        pressInfo = null;
        const arr = [...pointers.values()];
        lastPinch = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      }
      canvas.classList.add('grabbing');
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        if (pressInfo) {
          if (Math.hypot(e.clientX - pressInfo.x, e.clientY - pressInfo.y) > 5) {
            pressInfo.moved = true;
          }
        }
        orbit.theta -= dx * 0.0046;
        orbit.phi -= dy * 0.0046;
        orbit.phi = Math.min(1.56, Math.max(0.42, orbit.phi));
      } else if (pointers.size === 2) {
        const arr = [...pointers.values()];
        const dist = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        if (lastPinch > 0) {
          orbit.radius = Math.min(90, Math.max(13, orbit.radius * (lastPinch / dist)));
        }
        lastPinch = dist;
      }
    });

    const endPointer = (e) => {
      const had = pointers.has(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        canvas.classList.remove('grabbing');
        if (pressInfo && !pressInfo.moved && performance.now() - pressInfo.t < 450) {
          TE.scene.kick();
        }
        pressInfo = null;
        lastPinch = 0;
      } else if (pointers.size === 1 && had) {
        pressInfo = null;
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.radius = Math.min(90, Math.max(13, orbit.radius * Math.exp(e.deltaY * 0.0011)));
    }, { passive: false });

    // 桌面鼠标视差（不拖动时）
    window.addEventListener('pointermove', (e) => {
      if (pointers.size === 0) {
        par.tx = (e.clientX / window.innerWidth) * 2 - 1;
        par.ty = (e.clientY / window.innerHeight) * 2 - 1;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        TE.scene.kick();
      }
    });
  }

  /* ============================================================
   * 主循环
   * ============================================================ */
  function updateTimeUniforms() {
    dynamic.skyMat.uniforms.uTime.value = simTime;
    dynamic.floorMat.uniforms.uTime.value = simTime;
    dynamic.diskMat.uniforms.uTime.value = simTime;
    dynamic.ringMat.uniforms.uTime.value = simTime;
    dynamic.starRayMat.uniforms.uTime.value = simTime;
    dynamic.starStreakMat.uniforms.uTime.value = simTime;
    dynamic.sandMat.uniforms.uTime.value = simTime;
    dynamic.glassMat.uniforms.uTime.value = simTime;
    if (dynamic.dustMat) dynamic.dustMat.uniforms.uTime.value = simTime;
    if (dynamic.emberMat) dynamic.emberMat.uniforms.uTime.value = simTime;
    if (gradeUniforms) gradeUniforms.uTime.value = realTime;
  }

  function updateTrickle(dt) {
    const t = dynamic.trickle;
    if (!t) return;
    const pos = t.positions;
    const falling = flow.current > 0.30;
    for (let i = 0; i < t.count; i++) {
      if (falling) {
        pos[i * 3 + 1] -= t.speeds[i] * dt * (0.6 + flow.current * 0.7);
        if (pos[i * 3 + 1] < t.botY) pos[i * 3 + 1] = t.topY;
      }
    }
    t.points.geometry.attributes.position.needsUpdate = true;
  }

  function tick() {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    realTime += dt;

    // 自适应画质：持续过载时逐步降低渲染分辨率
    perfAcc += dt;
    perfN++;
    perfCooldown -= dt;
    if (perfN >= 90) {
      const avg = perfAcc / perfN;
      perfAcc = 0;
      perfN = 0;
      if (avg > 0.028 && perfCooldown <= 0 && renderer.getPixelRatio() > 1.05) {
        const pr = Math.max(1, renderer.getPixelRatio() - 0.25);
        renderer.setPixelRatio(pr);
        if (composer) composer.setPixelRatio(pr);
        if (dynamic.dustMat) dynamic.dustMat.uniforms.uPixelRatio.value = pr;
        if (dynamic.emberMat) dynamic.emberMat.uniforms.uPixelRatio.value = pr;
        perfCooldown = 6;
      }
    }

    // 时间流速：向 baseline 回落；kick 会抬高 target
    flow.target += (flow.baseline - flow.target) * (1 - Math.exp(-dt * 0.45));
    flow.current += (flow.target - flow.current) * (1 - Math.exp(-dt * 5.0));
    simTime += dt * flow.current;

    updateCamera(dt);
    updateTimeUniforms();
    updateTrickle(dt);

    if (TE.audio && TE.audio.setFlow) TE.audio.setFlow(flow.current);

    composer.render(dt);
    rafId = requestAnimationFrame(tick);
  }

  /* ============================================================
   * 对外契约
   * ============================================================ */
  TE.scene = {
    init(canvas) {
      if (renderer) return;
      try {
        buildRenderer(canvas);
      } catch (err) {
        TE.scene.failed = true;
        throw err;
      }
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0a0e18, 0.008);

      camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 700);
      camera.position.set(0, 9, -12);

      buildSky();
      buildFloor();
      buildBlackHole();
      buildStar();
      const dims = buildHourglass();
      buildTrickle(dims);
      buildPillars();
      buildFallenSlabs();
      buildParticles();

      // 环境光：让纪念碑与立柱有一层极暗的冷光
      scene.add(new THREE.AmbientLight(0x1a2238, 0.85));
      const rim = new THREE.DirectionalLight(0x35507a, 0.4);
      rim.position.set(14, 22, 20);
      scene.add(rim);

      buildPost();
      setupInteraction(canvas);

      // 调试句柄（自动化验收用）
      TE._debug = { scene, camera, renderer };

      window.addEventListener('resize', () => TE.scene.resize());
      TE.scene.resize();
    },

    start() {
      if (started) return;
      started = true;
      rafId = requestAnimationFrame(tick);
      // 首帧渲染后淡出遮罩
      requestAnimationFrame(() => {
        if (TE.ui && TE.ui.ready) TE.ui.ready();
      });
    },

    resize() {
      if (!renderer) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
    },

    kick() {
      flow.target = Math.max(flow.target, 1.6);
      if (TE.audio && TE.audio.ensureStarted) TE.audio.ensureStarted();
      if (TE.ui && TE.ui.onKick) TE.ui.onKick();
    },

    getFlow() { return flow.current; },
  };
})();
