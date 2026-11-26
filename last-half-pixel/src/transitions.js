(() => {
  const LHP = (window.__LHP = window.__LHP || {});

  // Helper accessors with resilient fallbacks
  function getMath() {
    const M = LHP.math || {};
    const clamp = M.clamp || ((x, a = 0, b = 1) => (x < a ? a : x > b ? b : x));
    const lerp = M.lerp || ((a, b, t) => a + (b - a) * t);
    const smoothstep =
      M.smoothstep ||
      ((a, b, x) => {
        const t = clamp((x - a) / Math.max(b - a, 1e-6), 0, 1);
        return t * t * (3 - 2 * t);
      });
    const ease = M.ease || {
      lin: (t) => t,
      in2: (t) => t * t,
      out2: (t) => 1 - (1 - t) * (1 - t),
      io2: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
      in3: (t) => t * t * t,
      out3: (t) => 1 - Math.pow(1 - t, 3),
      io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      in4: (t) => t * t * t * t,
      out4: (t) => 1 - Math.pow(1 - t, 4),
      io4: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
      outBack: (t, s = 1.7) => {
        const u = t - 1;
        return 1 + (s + 1) * u * u * u + s * u * u;
      },
    };
    const GLSL_HASH =
      M.GLSL_HASH ||
      `
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3=fract(p3*0.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec2 hash21(float p){ vec3 p3=fract(vec3(p)*vec3(0.1031,0.1030,0.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
`;
    const GLSL_NOISE =
      M.GLSL_NOISE ||
      `${GLSL_HASH}
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.0,0.0)),u.x),
             mix(hash12(i+vec2(0.0,1.0)),hash12(i+vec2(1.0,1.0)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  mat2 m=mat2(0.8,-0.6,0.6,0.8);
  for(int i=0;i<5;i++){ v+=a*vnoise(p); p=m*p*2.02+vec2(17.1,31.7); a*=0.5; }
  return v;
}
float worley(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float d=8.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y));
    vec2 o=hash22(i+g);
    vec2 r=g+o-f;
    d=min(d,dot(r,r));
  }
  return sqrt(d);
}
`;
    const GLSL_COLOR =
      M.GLSL_COLOR ||
      `
vec3 toLin(vec3 c){ return pow(max(c,0.0),vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c,0.0),vec3(1.0/2.2)); }
float luma(vec3 c){ return dot(c,vec3(0.2126,0.7152,0.0722)); }
`;
    return { clamp, lerp, smoothstep, ease, GLSL_HASH, GLSL_NOISE, GLSL_COLOR };
  }

  // Build a fullscreen background quad inside a 3D scene so depth-tested 3D
  // meshes always composite over B inside a depth-enabled render target.
  function makeBackdropMesh(uniforms = {}, fragExtra = '') {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tB: { value: null },
        ...uniforms,
      },
      vertexShader: `
precision highp float;
in vec3 position;
out vec2 vUv;
void main(){
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`,
      fragmentShader: `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
uniform sampler2D tB;
${fragExtra || 'void main(){ o = vec4(texture(tB, vUv).rgb, 1.0); }'}
`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    return { mesh, mat };
  }

  function resolveAnchor(ctx, b, sb) {
    let raw = null;
    if (b) {
      const fn =
        typeof b.anchor === 'function'
          ? b.anchor
          : b.inst && typeof b.inst.anchor === 'function'
          ? b.inst.anchor
          : null;
      if (fn) {
        try {
          raw = fn(sb);
        } catch {
          raw = null;
        }
      }
    }
    const ax = raw && Number.isFinite(raw.x) ? raw.x : 960;
    const ay = raw && Number.isFinite(raw.y) ? raw.y : 540;
    const size = raw && Number.isFinite(raw.size) ? raw.size : 420;
    const angle = raw && Number.isFinite(raw.angle) ? raw.angle : 0;

    // Convert virtual 1920x1080 coordinates into NDC [-1, 1]
    const view = ctx.view;
    let ndcX = 0;
    let ndcY = 0;
    let ndcSize = size / 1080;
    if (view && typeof view.toClip === 'function') {
      const c = view.toClip(ax, ay);
      if (Array.isArray(c) && c.length >= 2) {
        ndcX = c[0];
        ndcY = c[1];
      }
      if (view.h > 0) ndcSize = (size / view.h) * 2.0;
    } else {
      ndcX = (ax / 1920) * 2 - 1;
      ndcY = 1 - (ay / 1080) * 2;
      ndcSize = (size / 1080) * 2.0;
    }
    return { ndcX, ndcY, ndcSize, angle };
  }

  // ---------------------------------------------------------------------------
  // 1. FADE — Filmic linear-space crossfade
  // ---------------------------------------------------------------------------
  const transFade = {
    dur: 0.7,
    create(ctx) {
      const { GLSL_COLOR } = getMath();
      const pass = ctx.gfx.pass(
        `${GLSL_COLOR}
uniform sampler2D tA, tB;
uniform float uP;
void main(){
  float k = smoothstep(0.0, 1.0, uP);
  vec3 a = toLin(texture(tA, vUv).rgb);
  vec3 b = toLin(texture(tB, vUv).rgb);
  o = vec4(toSrgb(mix(a, b, k)), 1.0);
}`,
        { tA: null, tB: null, uP: 0 }
      );
      return {
        render({ A, B, p, out }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          pass.u.tA.value = A.texture;
          pass.u.tB.value = B.texture;
          pass.u.uP.value = p;
          pass.render(out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 2. LINE — CRT / Geological Time-String Vertical Collapse & Expansion
  // ---------------------------------------------------------------------------
  const transLine = {
    dur: 2.2,
    create(ctx) {
      const { GLSL_COLOR, GLSL_HASH } = getMath();
      const pass = ctx.gfx.pass(
        `${GLSL_COLOR}
${GLSL_HASH}
uniform sampler2D tA, tB;
uniform float uP;
uniform float uT;

vec3 sampleColumnAvg(sampler2D tex, float x, float spread){
  vec3 sum = vec3(0.0);
  float wSum = 0.0;
  for(int i = -4; i <= 4; i++){
    float fi = float(i) / 4.0;
    float w = exp(-fi * fi * 1.4);
    float y = clamp(0.5 + fi * spread, 0.002, 0.998);
    sum += toLin(texture(tex, vec2(x, y)).rgb) * w;
    wSum += w;
  }
  return sum / max(wSum, 1e-5);
}

void main(){
  float p = clamp(uP, 0.0, 1.0);
  // Collapse A (0 -> 0.48), vibrating glowing string (0.42 -> 0.58), expand B (0.52 -> 1.0)
  float cA = smoothstep(0.0, 0.46, p);
  cA = cA * cA * (3.0 - 2.0 * cA);
  float eB = smoothstep(0.54, 1.0, p);
  eB = 1.0 - pow(1.0 - eB, 3.0);

  // Vibrating geological string center Y
  float pinch = sin(clamp((p - 0.12) / 0.76, 0.0, 1.0) * 3.14159265);
  float envVib = exp(-abs(p - 0.5) * 9.0);
  float wave = (sin(vUv.x * 3.14159265) * sin(uT * 38.0) * 0.009
              + sin(vUv.x * 9.42477) * cos(uT * 61.0 + 1.2) * 0.004) * envVib;
  float cy = 0.5 + wave;

  float halfH = mix(0.5, 0.0018, cA);
  if (p > 0.5) halfH = mix(0.0018, 0.5, eB);

  float dy = vUv.y - cy;
  float absDy = abs(dy);

  // Map vertical coordinate into compressed frame with multi-sample shutter smear
  vec3 frameCol = vec3(0.0);
  float inFrame = 1.0 - smoothstep(halfH - 0.0015, halfH + 0.002, absDy);
  if (inFrame > 0.001) {
    float localY = clamp(0.5 + dy / max(halfH * 2.0, 0.003), 0.001, 0.999);
    float smearAmt = (p < 0.5 ? sin(cA * 3.14159) : sin(eB * 3.14159)) * 0.095;
    vec3 s = vec3(0.0);
    for(int i = -3; i <= 3; i++){
      float fi = float(i) / 3.0;
      float sy = clamp(localY + fi * smearAmt, 0.001, 0.999);
      vec3 c = p < 0.5
        ? toLin(texture(tA, vec2(vUv.x, sy)).rgb)
        : toLin(texture(tB, vec2(vUv.x, sy)).rgb);
      s += c;
    }
    frameCol = s / 7.0;
    // Slight compression energy conservation brightening
    float boost = mix(1.0, 1.65, pinch * pinch);
    frameCol *= boost * inFrame;
  }

  // Column-averaged phosphor color of the vibrating geological time-string
  float blendAB = smoothstep(0.42, 0.58, p);
  vec3 colA = sampleColumnAvg(tA, vUv.x, 0.44);
  vec3 colB = sampleColumnAvg(tB, vUv.x, 0.44);
  vec3 strCol = mix(colA, colB, blendAB);
  // Infuse warm amber-gold & cosmic phosphor along the string
  vec3 phosphor = mix(strCol * 1.4 + vec3(0.18, 0.14, 0.08), vec3(1.15, 0.92, 0.58), 0.48);

  float lineCore = exp(-absDy / max(0.0018 + 0.003 * (1.0 - envVib), 1e-4));
  float lineHalo = exp(-absDy / (0.022 + 0.045 * envVib));
  float xEdge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);

  // Midpoint incandescent spark pulse sweeping outward
  float spark = exp(-abs(vUv.x - 0.5) * 5.0) * envVib * exp(-absDy * 55.0);
  float glowStrength = smoothstep(0.18, 0.48, p) * (1.0 - smoothstep(0.52, 0.86, p));

  vec3 bg = vec3(0.006, 0.008, 0.012);
  vec3 col = mix(bg, frameCol, inFrame);
  col += phosphor * (lineCore * 1.35 + lineHalo * 0.42) * glowStrength * xEdge;
  col += vec3(1.4, 1.18, 0.85) * spark * 0.95;

  // Subtle dark scanline micro-texture during pinch
  float scan = 0.96 + 0.04 * sin(vUv.y * uRes.y * 1.5);
  col *= mix(1.0, scan, glowStrength * 0.4);

  // Soft tone-shoulder to prevent harsh clipping
  col = col / (1.0 + max(max(col.r, max(col.g, col.b)) - 0.88, 0.0) * 0.7);
  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), 1.0);
}`,
        { tA: null, tB: null, uP: 0, uT: 0 }
      );
      return {
        render({ A, B, p, out, time }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          pass.u.tA.value = A.texture;
          pass.u.tB.value = B.texture;
          pass.u.uP.value = p;
          pass.u.uT.value = time || 0;
          pass.render(out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 3. WASH — Procedural Ocean Wave Sweeping Across Glass + Foam + Rivulets
  // ---------------------------------------------------------------------------
  const transWash = {
    dur: 2.5,
    create(ctx) {
      const { GLSL_NOISE, GLSL_COLOR } = getMath();
      const pass = ctx.gfx.pass(
        `${GLSL_NOISE}
${GLSL_COLOR}
uniform sampler2D tA, tB;
uniform float uP;
uniform float uT;

float waveHeight(vec2 uv, float front, float p){
  float n1 = fbm(vec2(uv.y * 4.2, uv.x * 2.2 - p * 2.5));
  float n2 = vnoise(vec2(uv.y * 14.0 + p * 3.0, uv.x * 8.0));
  float edge = front + (n1 - 0.5) * 0.16 + (n2 - 0.5) * 0.035;
  float d = edge - uv.x; // > 0 means wave has passed (wet/B side)
  // Raised crashing water lip right behind the front
  float lip = exp(-pow((d - 0.09) / 0.11, 2.0)) * 1.15;
  float swell = exp(-pow((d - 0.24) / 0.18, 2.0)) * 0.55;
  float mask = smoothstep(-0.025, 0.035, d);
  return (lip + swell) * mask;
}

vec3 sampleBlur(sampler2D tex, vec2 uv, float rad){
  if (rad <= 0.0005) return toLin(texture(tex, clamp(uv, 0.001, 0.999)).rgb);
  vec3 s = vec3(0.0);
  vec2 asp = vec2(uRes.y / max(uRes.x, 1.0), 1.0);
  for(int i = 0; i < 6; i++){
    float a = float(i) * 1.0471975 + 0.3;
    vec2 off = vec2(cos(a), sin(a)) * rad * asp;
    s += toLin(texture(tex, clamp(uv + off, 0.001, 0.999)).rgb);
  }
  return s / 6.0;
}

void main(){
  float p = clamp(uP, 0.0, 1.0);
  float asp = uRes.x / max(uRes.y, 1.0);
  // Sweeping wave front from left (-0.28) to right (1.58)
  float front = mix(-0.28, 1.58, smoothstep(0.0, 0.92, p));
  float drain = smoothstep(0.55, 1.0, p);

  float nEdge = (fbm(vec2(vUv.y * 4.2, vUv.x * 2.2 - p * 2.5)) - 0.5) * 0.16
              + (vnoise(vec2(vUv.y * 14.0 + p * 3.0, vUv.x * 8.0)) - 0.5) * 0.035;
  float d = (front + nEdge) - vUv.x;

  // Heightfield & finite-difference water surface normal
  float eps = 0.004;
  float h0 = waveHeight(vUv, front, p);
  float hx = waveHeight(vUv + vec2(eps, 0.0), front, p);
  float hy = waveHeight(vUv + vec2(0.0, eps), front, p);
  vec2 grad = vec2(hx - h0, hy - h0) / eps;

  // Draining rivulets & sliding drops on the cleared glass behind the wave
  float wetZone = smoothstep(0.02, 0.22, d) * (1.0 - drain);
  float colId = floor(vUv.x * 38.0);
  float colSeed = hash12(vec2(colId, 13.7));
  float rivX = fract(vUv.x * 38.0) - 0.5 + 0.16 * sin(vUv.y * 12.0 + colSeed * 20.0);
  float slideY = fract(vUv.y * 2.4 + p * (0.65 + 0.65 * colSeed) + colSeed);
  float drop = exp(-pow(rivX * 4.8, 2.0) - pow((slideY - 0.5) * 6.5, 2.0));
  float trail = exp(-pow(rivX * 8.5, 2.0)) * smoothstep(0.5, 0.95, slideY) * 0.35;
  float glassDrops = (drop + trail) * wetZone * smoothstep(0.18, 0.45, d);

  // Subtle normal perturbation from droplets
  vec2 dropN = vec2(-rivX * 2.5, (slideY - 0.5) * 2.0) * glassDrops * 0.018;

  // Refraction offset + chromatic aberration through the water body
  vec2 refr = -grad * 0.012 + dropN;
  float ca = (0.0038 * clamp(h0, 0.0, 1.2) + 0.0012 * glassDrops);

  // Behind wave: B; ahead of wave: A
  float revealB = smoothstep(-0.012, 0.065, d);
  vec2 uvB = clamp(vUv + refr, 0.002, 0.998);
  vec2 uvA = clamp(vUv + refr * 0.35, 0.002, 0.998);

  float blurR = h0 * 0.012;
  vec3 colA = toLin(texture(tA, uvA).rgb);
  vec3 colB = vec3(
    sampleBlur(tB, uvB + vec2(ca, 0.0), blurR).r,
    sampleBlur(tB, uvB, blurR).g,
    sampleBlur(tB, uvB - vec2(ca, 0.0), blurR).b
  );
  vec3 base = mix(colA, colB, revealB);

  // Deep teal ocean absorption (Beer-Lambert law) inside thick wave body
  float thickness = clamp(h0 * (1.0 - drain * 0.6), 0.0, 1.5);
  vec3 absorb = exp(-thickness * vec3(1.55, 0.58, 0.38));
  vec3 scatter = vec3(0.04, 0.24, 0.30) * (1.0 - exp(-thickness * 1.1));
  vec3 col = base * absorb + scatter * 0.72;

  // Specular highlights on wave crest & sliding glass drops
  vec3 N = normalize(vec3(-grad * 0.38 - dropN * 8.0, 1.0));
  vec3 L = normalize(vec3(-0.35, 0.65, 0.75));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hvec = normalize(L + V);
  float spec = pow(max(dot(N, Hvec), 0.0), 48.0) * (smoothstep(0.05, 0.5, h0) * 0.95 + glassDrops * 0.55);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * smoothstep(0.04, 0.4, h0);
  col += vec3(0.75, 0.92, 0.98) * (spec * 0.85 + rim * 0.28);

  // Worley-noise lace foam breaking along the leading wave lip (worley returns F2-F1: 0 at cell ridges)
  vec2 foamUv = vec2(vUv.x * asp * 14.0 - p * 8.0, vUv.y * 14.0);
  float w1 = worley(foamUv);
  float w2 = worley(foamUv * 2.3 + vec2(4.2, 1.7));
  float lace = (1.0 - smoothstep(0.03, 0.26, w1)) * 0.78 + (1.0 - smoothstep(0.03, 0.22, w2)) * 0.42;
  float foamBand = exp(-pow((d - 0.045) / 0.075, 2.0)) * 1.25 + exp(-pow((d - 0.16) / 0.12, 2.0)) * 0.45;
  float foam = clamp(foamBand * (0.38 + 0.92 * lace) * smoothstep(-0.01, 0.025, d), 0.0, 1.0);
  foam *= (1.0 - smoothstep(0.86, 0.99, p));
  vec3 foamCol = vec3(0.86, 0.94, 0.97);
  col = mix(col, foamCol, foam * 0.82);

  // Ensure crisp clean B at end
  float endClean = smoothstep(0.92, 1.0, p);
  col = mix(col, toLin(texture(tB, vUv).rgb), endClean);
  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), 1.0);
}`,
        { tA: null, tB: null, uP: 0, uT: 0 }
      );
      return {
        render({ A, B, p, out, time }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          pass.u.tA.value = A.texture;
          pass.u.tB.value = B.texture;
          pass.u.uP.value = p;
          pass.u.uT.value = time || 0;
          pass.render(out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 4. FLAPS — 3D Perspective Split-Flap Geological Strata Board
  // ---------------------------------------------------------------------------
  const transFlaps = {
    dur: 2.4,
    create(ctx) {
      const { GLSL_NOISE, GLSL_COLOR } = getMath();
      const rt = ctx.gfx.target({ depth: true });
      const COLS = 12;
      const ROWS = 7;
      const COUNT = COLS * ROWS;

      // Each flap instance renders 3 quads (top static, bottom static, rotating hinged flap)
      // Encode part id (0=top, 1=bottom, 2=rotating) in aPart attribute.
      const basePos = [];
      const baseUv = [];
      const basePart = [];
      const idx = [];
      let vOff = 0;

      function pushQuad(y0, y1, u0, u1, part) {
        // Local tile space x in [-0.5, 0.5], y in [-0.5, 0.5]
        basePos.push(-0.5, y0, 0, 0.5, y0, 0, 0.5, y1, 0, -0.5, y1, 0);
        baseUv.push(0, u0, 1, u0, 1, u1, 0, u1);
        basePart.push(part, part, part, part);
        idx.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3);
        vOff += 4;
      }
      // Part 0: top half (y: 0 -> 0.5, uv.y: 0.5 -> 1.0)
      pushQuad(0.0, 0.5, 0.5, 1.0, 0.0);
      // Part 1: bottom half (y: -0.5 -> 0.0, uv.y: 0.0 -> 0.5)
      pushQuad(-0.5, 0.0, 0.0, 0.5, 1.0);
      // Part 2: hinged rotating flap (starts as top half 0 -> 0.5, rotates around x-axis at y=0)
      pushQuad(0.0, 0.5, 0.5, 1.0, 2.0);

      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(basePos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(baseUv, 2));
      geo.setAttribute('aPart', new THREE.Float32BufferAttribute(basePart, 1));
      geo.setIndex(idx);

      const cells = new Float32Array(COUNT * 4); // col, row, delay, flips
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = (r * COLS + c) * 4;
          const diag = (c / (COLS - 1)) * 0.58 + (1 - r / (ROWS - 1)) * 0.42;
          const jitter = ((Math.sin(c * 12.9898 + r * 78.233) * 43758.5453) % 1 + 1) % 1;
          cells[i + 0] = c;
          cells[i + 1] = r;
          cells[i + 2] = diag * 0.34 + jitter * 0.06; // delay in [0, 0.4]
          cells[i + 3] = 2.0 + (jitter > 0.42 ? 1.0 : 0.0); // 2 or 3 flips
        }
      }
      geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 4));
      geo.instanceCount = COUNT;

      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        uniforms: {
          tA: { value: null },
          tB: { value: null },
          uP: { value: 0 },
          uAsp: { value: 16 / 9 },
          uGrid: { value: new THREE.Vector2(COLS, ROWS) },
        },
        vertexShader: `
precision highp float;
in vec3 position;
in vec2 uv;
in float aPart;
in vec4 aCell;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uP;
uniform float uAsp;
uniform vec2 uGrid;

out vec2 vScreenUv;
out vec2 vTileUv;
out float vPart;
out float vFace;
out float vAngle;
out float vPhase;
out float vSeed;
out float vGap;

void main(){
  float delay = aCell.z;
  float flips = aCell.w;
  float localP = clamp((uP - delay) / max(1.0 - 0.42, 0.1), 0.0, 1.0);

  // Subtle mechanical gap opens during flipping, closes cleanly at ends
  float gapEnv = sin(clamp(uP * 3.14159265, 0.0, 3.14159265));
  vGap = smoothstep(0.0, 0.12, uP) * (1.0 - smoothstep(0.88, 1.0, uP));

  float stepF = localP * flips;
  float idx = floor(min(stepF, flips - 0.0001));
  float f = clamp(stepF - idx, 0.0, 1.0);

  // Damped spring-bounce flip angle from 0 -> PI
  float easeF = f < 0.78
    ? pow(f / 0.78, 1.75)
    : 1.0 + sin((f - 0.78) / 0.22 * 3.14159265) * 0.045 * (1.0 - f);
  float ang = clamp(easeF, 0.0, 1.06) * 3.14159265;
  if (localP <= 0.0) ang = 0.0;
  if (localP >= 1.0) ang = 3.14159265;

  // Which face ID is shown: 0 = A, 1..flips-1 = geological rock strata, >= flips = B
  float faceId = 0.0;
  if (aPart < 0.5) {
    // Top static half reveals the NEXT face as soon as the flip starts
    faceId = localP > 0.0 ? idx + 1.0 : 0.0;
  } else if (aPart < 1.5) {
    // Bottom static half holds the CURRENT face until flip completes
    faceId = localP >= 1.0 ? flips : idx;
  } else {
    // Rotating flap: front side (ang < PI/2) shows idx; back side (ang > PI/2) shows idx+1
    faceId = ang < 1.5707963 ? idx : idx + 1.0;
  }
  vFace = faceId / max(flips, 1.0); // 0 = A, (0..1) = strata, 1 = B
  vPhase = idx;
  vAngle = ang;
  vPart = aPart;
  vSeed = aCell.x * 0.137 + aCell.y * 0.311;

  vec3 pos = position;
  vec2 tuv = uv;
  if (aPart > 1.5) {
    // Rotate hinged flap around X axis (y=0) toward viewer (+Z)
    float ca = cos(ang);
    float sa = sin(ang);
    float ry = pos.y * ca;
    float rz = pos.y * sa + 0.004;
    pos.y = ry;
    pos.z = rz;
    // When flipped past 90deg onto bottom half, its UV maps to the bottom half [0..0.5]
    if (ang > 1.5707963) {
      tuv.y = 0.5 - (uv.y - 0.5);
    }
  } else {
    pos.z = aPart < 0.5 ? -0.001 : 0.0;
  }

  // Tile placement on board covering full camera frustum at z = 0
  float boardH = 2.0;
  float boardW = 2.0 * uAsp;
  float cellW = boardW / uGrid.x;
  float cellH = boardH / uGrid.y;
  float shrink = 1.0 - 0.028 * vGap;

  vec2 cellCenter = vec2(
    -boardW * 0.5 + (aCell.x + 0.5) * cellW,
    -boardH * 0.5 + (aCell.y + 0.5) * cellH
  );

  vec3 worldPos = vec3(
    cellCenter.x + pos.x * cellW * shrink,
    cellCenter.y + pos.y * cellH * shrink,
    pos.z * cellH * 1.15 - gapEnv * 0.04
  );

  vTileUv = tuv;
  vScreenUv = (aCell.xy + tuv) / uGrid;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`,
        fragmentShader: `
precision highp float;
precision highp sampler2D;
${GLSL_NOISE}
${GLSL_COLOR}
uniform sampler2D tA, tB;

in vec2 vScreenUv;
in vec2 vTileUv;
in float vPart;
in float vFace;
in float vAngle;
in float vPhase;
in float vSeed;
in float vGap;

out vec4 o;

vec3 strataTexture(vec2 uv, float seed, float phase){
  float band = uv.y * 14.0 + fbm(vec2(uv.x * 3.5 + seed * 7.0, uv.y * 5.0 + phase * 2.3)) * 2.8;
  float layer = sin(band * 2.4) * 0.5 + 0.5;
  float grit = vnoise(uv * 28.0 + seed * 19.0);
  vec3 obsidian = vec3(0.05, 0.055, 0.07);
  vec3 ochre = vec3(0.46, 0.24, 0.11);
  vec3 rust = vec3(0.32, 0.11, 0.07);
  vec3 slate = vec3(0.14, 0.17, 0.22);
  vec3 c = mix(obsidian, slate, smoothstep(0.2, 0.75, layer));
  c = mix(c, ochre, smoothstep(0.68, 0.92, layer) * 0.75);
  // Thin glowing magma/extinction seam on some intermediate cards
  float seam = exp(-pow((fract(band * 0.28 + phase * 0.37) - 0.5) * 26.0, 2.0));
  c += mix(rust, vec3(0.95, 0.42, 0.14), seam) * seam * 0.85;
  return c * (0.85 + 0.3 * grit);
}

void main(){
  vec2 suv = clamp(vScreenUv, 0.001, 0.999);
  vec3 c;
  if (vFace <= 0.001) {
    c = toLin(texture(tA, suv).rgb);
  } else if (vFace >= 0.999) {
    c = toLin(texture(tB, suv).rgb);
  } else {
    c = strataTexture(vTileUv, vSeed, vPhase);
  }

  // Lighting on turning flap + cast shadow on static halves
  float shade = 1.0;
  float spec = 0.0;
  if (vPart > 1.5) {
    float nZ = abs(cos(vAngle));
    float nY = sin(vAngle) * (vAngle < 1.5707963 ? 1.0 : -1.0);
    vec3 N = normalize(vec3(0.0, nY, max(nZ, 0.08)));
    vec3 L = normalize(vec3(0.15, 0.55, 0.82));
    shade = 0.42 + 0.65 * max(dot(N, L), 0.0);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    spec = pow(max(dot(N, H), 0.0), 28.0) * 0.28 * sin(vAngle);
  } else if (vPart < 0.5) {
    // Upper card receives slight ambient shadow from rising flap
    float sh = smoothstep(0.0, 1.2, vAngle) * (1.0 - smoothstep(1.4, 2.4, vAngle));
    shade = mix(1.0, 0.58 + 0.42 * smoothstep(0.5, 0.85, vTileUv.y), sh * vGap);
  } else {
    // Lower card receives crisp hinge shadow as flap descends
    float sh = smoothstep(1.3, 2.8, vAngle) * (1.0 - smoothstep(2.95, 3.14, vAngle));
    shade = mix(1.0, 0.35 + 0.65 * smoothstep(0.5, 0.05, vTileUv.y), sh * vGap);
  }

  // Crisp mechanical hinge split line and subtle tile frame
  float hinge = smoothstep(0.0, 0.028, abs(vTileUv.y - 0.5));
  float border = smoothstep(0.0, 0.025, min(min(vTileUv.x, 1.0 - vTileUv.x), min(vTileUv.y, 1.0 - vTileUv.y)));
  c = c * mix(1.0, shade, vGap) + vec3(spec * vGap);
  c *= mix(1.0, mix(0.28, 1.0, hinge), vGap * 0.9);
  c *= mix(1.0, mix(0.55, 1.0, border), vGap * 0.7);

  o = vec4(toSrgb(clamp(c, 0.0, 1.0)), 1.0);
}
`,
      });

      const scene = new THREE.Scene();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);

      // Perspective camera positioned so board height=2.0 fills exact frustum at z=0
      const fov = 32;
      const camZ = 1.0 / Math.tan((fov * Math.PI) / 360);
      const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 20);
      cam.position.set(0, 0, camZ);
      cam.lookAt(0, 0, 0);

      return {
        render({ A, B, p, out }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          const asp = ctx.gfx.aspect || ctx.gfx.W / Math.max(1, ctx.gfx.H) || 16 / 9;
          cam.aspect = asp;
          cam.updateProjectionMatrix();
          mat.uniforms.tA.value = A.texture;
          mat.uniforms.tB.value = B.texture;
          mat.uniforms.uP.value = p;
          mat.uniforms.uAsp.value = asp;
          ctx.gfx.draw(scene, cam, rt, { clear: true, color: 0x06070a, alpha: 1 });
          ctx.gfx.copy(rt, out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 5. DAYBREAK — Optical Cat's-Eye Bokeh Defocus + Dawn Bloom + Instanced Orbs
  // ---------------------------------------------------------------------------
  const transDaybreak = {
    dur: 2.8,
    create(ctx) {
      const { GLSL_COLOR, GLSL_HASH } = getMath();

      // Pass 1: Cat's-eye optical bokeh blur + warm golden dawn bloom
      const blurPass = ctx.gfx.pass(
        `${GLSL_COLOR}
${GLSL_HASH}
uniform sampler2D tA, tB;
uniform float uP;

vec3 catsEyeBokeh(sampler2D tex, vec2 uv, float radius){
  if (radius < 0.0004) return toLin(texture(tex, uv).rgb);
  vec2 d = uv - 0.5;
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 invAsp = vec2(1.0 / asp, 1.0);
  float dist = length(d * vec2(asp, 1.0));
  vec2 radDir = dist > 1e-4 ? normalize(d) : vec2(1.0, 0.0);

  vec3 acc = vec3(0.0);
  float wSum = 0.0;
  // 18-tap Vogel golden-angle spiral with optical cat's-eye vignetting
  for(int i = 0; i < 18; i++){
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 18.0);
    float ang = fi * 2.39996323;
    vec2 disc = vec2(cos(ang), sin(ang)) * r;
    // Squeeze aperture radially near edges for authentic cat's-eye lens bokeh
    float squeeze = clamp(dist * 0.55, 0.0, 0.42);
    float along = dot(disc, radDir);
    disc -= radDir * along * squeeze;

    vec2 suv = clamp(uv + disc * radius * invAsp, 0.001, 0.999);
    vec3 c = toLin(texture(tex, suv).rgb);
    // Bright highlights weight slightly higher for creamy optical bokeh
    float w = 1.0 + luma(c) * 1.4;
    acc += c * w;
    wSum += w;
  }
  return acc / max(wSum, 1e-5);
}

void main(){
  float p = clamp(uP, 0.0, 1.0);
  float defocus = pow(sin(p * 3.14159265), 1.35);
  float mixAB = smoothstep(0.28, 0.72, p);

  float radA = defocus * 0.055 * (1.0 - mixAB * 0.3);
  float radB = defocus * 0.055 * (0.7 + mixAB * 0.3);

  vec3 colA = catsEyeBokeh(tA, vUv, radA);
  vec3 colB = catsEyeBokeh(tB, vUv, radB);
  vec3 col = mix(colA, colB, mixAB);

  // Warm golden dawn bloom bleed peaking at midpoint
  float dawn = pow(sin(p * 3.14159265), 1.9);
  float vig = 1.0 - smoothstep(0.15, 1.05, length((vUv - 0.5) * vec2(1.3, 1.0)));
  vec3 dawnTint = mix(vec3(0.95, 0.56, 0.24), vec3(1.05, 0.86, 0.55), vig);
  col += dawnTint * dawn * (0.28 + 0.24 * vig);
  col = mix(col, col * vec3(1.06, 0.99, 0.90), dawn * 0.45);

  // Soft shoulder roll-off
  col = col / (1.0 + max(max(col.r, max(col.g, col.b)) - 0.85, 0.0) * 0.65);
  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), 1.0);
}`,
        { tA: null, tB: null, uP: 0 }
      );

      // Pass 2: Instanced glowing bokeh discs composited additively over defocused image
      const ORBS = 84;
      const quad = new THREE.PlaneGeometry(2, 2);
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', quad.attributes.position);
      geo.setAttribute('uv', quad.attributes.uv);
      geo.index = quad.index;

      const orbPos = new Float32Array(ORBS * 4); // x, y, radius, depth
      const orbCol = new Float32Array(ORBS * 4); // r, g, b, seed
      for (let i = 0; i < ORBS; i++) {
        const h1 = ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
        const h2 = ((Math.sin(i * 269.5 + 183.3) * 43758.5453) % 1 + 1) % 1;
        const h3 = ((Math.sin(i * 419.2 + 71.9) * 43758.5453) % 1 + 1) % 1;
        const h4 = ((Math.sin(i * 631.7 + 19.4) * 43758.5453) % 1 + 1) % 1;
        orbPos[i * 4 + 0] = (h1 - 0.5) * 2.15;
        orbPos[i * 4 + 1] = (h2 - 0.5) * 2.1;
        orbPos[i * 4 + 2] = 0.035 + Math.pow(h3, 2.2) * 0.16;
        orbPos[i * 4 + 3] = h4;

        // Warm dawn gold / champagne / pale ice-blue palette
        const palette =
          h4 < 0.55
            ? [1.0, 0.78, 0.42]
            : h4 < 0.82
            ? [1.0, 0.92, 0.72]
            : [0.68, 0.84, 1.0];
        orbCol[i * 4 + 0] = palette[0];
        orbCol[i * 4 + 1] = palette[1];
        orbCol[i * 4 + 2] = palette[2];
        orbCol[i * 4 + 3] = h3;
      }
      geo.setAttribute('aOrb', new THREE.InstancedBufferAttribute(orbPos, 4));
      geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(orbCol, 4));
      geo.instanceCount = ORBS;

      const orbMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uP: { value: 0 },
          uAsp: { value: 16 / 9 },
        },
        vertexShader: `
precision highp float;
in vec3 position;
in vec2 uv;
in vec4 aOrb;
in vec4 aCol;

uniform float uP;
uniform float uAsp;

out vec2 vUv;
out vec3 vCol;
out float vAlpha;

void main(){
  float swell = pow(sin(clamp(uP, 0.0, 1.0) * 3.14159265), 1.45);
  float r = aOrb.z * (0.25 + 1.15 * swell);
  vec2 drift = vec2(sin(aCol.w * 12.0 + uP * 3.5) * 0.06, (uP - 0.5) * (0.12 + 0.14 * aOrb.w));
  vec2 center = aOrb.xy + drift;
  vec2 pos = center + position.xy * vec2(r / max(uAsp, 0.2), r);
  vUv = uv * 2.0 - 1.0;
  vCol = aCol.rgb;
  vAlpha = swell * (0.09 + 0.16 * aOrb.w);
  gl_Position = vec4(pos, 0.0, 1.0);
}
`,
        fragmentShader: `
precision highp float;
in vec2 vUv;
in vec3 vCol;
in float vAlpha;
out vec4 o;
void main(){
  float d = length(vUv);
  if (d > 1.0) discard;
  // Optical aperture disc with subtle bright spherical-aberration rim
  float disc = smoothstep(1.0, 0.72, d);
  float rim = smoothstep(0.62, 0.88, d) * smoothstep(1.0, 0.86, d);
  float intensity = (disc * 0.58 + rim * 0.65) * vAlpha;
  o = vec4(vCol * intensity, intensity);
}
`,
      });

      const orbScene = new THREE.Scene();
      const orbMesh = new THREE.Mesh(geo, orbMat);
      orbMesh.frustumCulled = false;
      orbScene.add(orbMesh);
      const orbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

      return {
        render({ A, B, p, out }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          blurPass.u.tA.value = A.texture;
          blurPass.u.tB.value = B.texture;
          blurPass.u.uP.value = p;
          blurPass.render(out);

          const asp = ctx.gfx.aspect || ctx.gfx.W / Math.max(1, ctx.gfx.H) || 16 / 9;
          orbMat.uniforms.uP.value = p;
          orbMat.uniforms.uAsp.value = asp;
          ctx.gfx.draw(orbScene, orbCam, out, { clear: false });
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 6. SLAM — Heavy Lithospheric / Letterpress Stamp + Shake + Shockwave + Dust
  // ---------------------------------------------------------------------------
  const transSlam = {
    dur: 1.8,
    create(ctx) {
      const { GLSL_NOISE, GLSL_COLOR } = getMath();
      const pass = ctx.gfx.pass(
        `${GLSL_NOISE}
${GLSL_COLOR}
uniform sampler2D tA, tB;
uniform float uP;

void main(){
  float p = clamp(uP, 0.0, 1.0);
  float hit = 0.285;
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 centered = vUv - 0.5;
  vec2 pAsp = centered * vec2(asp, 1.0);
  float dist = length(pAsp);

  if (p < hit) {
    // Phase 1: Frame B plummets rapidly from viewer toward A like a stone stamp
    float k = clamp(p / hit, 0.0, 1.0);
    float easeIn = k * k * k;
    float scale = mix(2.55, 1.0, easeIn);
    float tilt = (1.0 - easeIn) * 0.055;
    float ct = cos(tilt), st = sin(tilt);
    vec2 rot = mat2(ct, -st, st, ct) * centered;
    vec2 uvB = rot / scale + 0.5;

    // Slight radial zoom-blur on approaching B
    vec3 colA = toLin(texture(tA, vUv).rgb);
    // Cast dark shadow of the descending stamp onto A
    vec2 shUv = rot / mix(1.3, 1.0, easeIn) + 0.5;
    float inSh = step(0.0, shUv.x) * step(shUv.x, 1.0) * step(0.0, shUv.y) * step(shUv.y, 1.0);
    colA *= 1.0 - 0.42 * easeIn * inSh;

    float inB = smoothstep(0.0, 0.008, uvB.x) * smoothstep(1.0, 0.992, uvB.x)
              * smoothstep(0.0, 0.008, uvB.y) * smoothstep(1.0, 0.992, uvB.y);
    vec3 colB = vec3(0.0);
    if (inB > 0.001) {
      for(int i = 0; i < 4; i++){
        float fi = float(i) / 3.0 - 0.5;
        vec2 suv = clamp((rot / (scale * (1.0 + fi * 0.06 * k))) + 0.5, 0.001, 0.999);
        colB += toLin(texture(tB, suv).rgb);
      }
      colB *= 0.25;
    }
    float alphaB = inB * smoothstep(0.05, 0.55, k);
    vec3 col = mix(colA, colB, alphaB);
    o = vec4(toSrgb(clamp(col, 0.0, 1.0)), 1.0);
    return;
  }

  // Phase 2: IMPACT! Damped screen shake + shockwave ripple + mineral-tooth ink transfer + radial dust
  float t = (p - hit) / (1.0 - hit);
  float shakeEnv = exp(-t * 11.5) * (1.0 - smoothstep(0.75, 1.0, t));
  vec2 shake = vec2(
    sin(t * 78.0) * 0.016 + cos(t * 124.0) * 0.006,
    cos(t * 92.0) * 0.018 + sin(t * 141.0) * 0.005
  ) * shakeEnv;

  // Expanding radial shockwave ring
  float waveR = t * 1.65;
  float ring = exp(-pow((dist - waveR) / 0.065, 2.0)) * exp(-t * 3.4);
  vec2 dir = dist > 1e-4 ? normalize(pAsp) : vec2(1.0, 0.0);
  vec2 rippleOff = dir * ring * 0.022 * vec2(1.0 / asp, 1.0);

  vec2 uv = clamp(vUv + shake + rippleOff, 0.001, 0.999);
  vec3 colA = toLin(texture(tA, uv).rgb);
  // Subtle chromatic shock on B right at impact
  vec2 ca = dir * ring * 0.007 * vec2(1.0 / asp, 1.0);
  vec3 colB = vec3(
    toLin(texture(tB, clamp(uv + ca, 0.001, 0.999)).rgb).r,
    toLin(texture(tB, uv).rgb).g,
    toLin(texture(tB, clamp(uv - ca, 0.001, 0.999)).rgb).b
  );

  // Uneven mineral-tooth / letterpress ink transfer settling rapidly into 100% B
  float tooth = fbm(vUv * vec2(26.0 * asp, 26.0)) * 0.65 + vnoise(vUv * vec2(85.0 * asp, 85.0)) * 0.35;
  float press = smoothstep(0.0, 0.24, t);
  float inkMask = smoothstep(tooth * (1.0 - press) * 0.7, tooth * (1.0 - press) * 0.7 + 0.08, press + 0.22);
  vec3 col = mix(colA, colB, clamp(inkMask, 0.0, 1.0));

  // Radial lithospheric dust wave billowing outward from impact
  float dustNoise = fbm(vec2(atan(pAsp.y, pAsp.x) * 4.5, dist * 9.0 - t * 5.0));
  float dustBand = exp(-pow((dist - waveR * 0.92) / 0.14, 2.0)) * smoothstep(0.0, 0.04, t) * exp(-t * 2.8);
  float dust = dustBand * (0.45 + 0.75 * dustNoise);
  vec3 dustCol = vec3(0.52, 0.44, 0.36);
  col = mix(col, col + dustCol * 0.34, clamp(dust, 0.0, 0.65));

  // Brief impact flash + dark edge vignette settling cleanly
  float flash = exp(-t * 24.0) * 0.22;
  float vig = 1.0 - exp(-t * 5.0) * 0.28 * smoothstep(0.35, 1.05, dist);
  col = col * vig + vec3(1.0, 0.92, 0.82) * flash;

  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), 1.0);
}`,
        { tA: null, tB: null, uP: 0 }
      );
      return {
        render({ A, B, p, out }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          pass.u.tA.value = A.texture;
          pass.u.tB.value = B.texture;
          pass.u.uP.value = p;
          pass.render(out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 7. FOLD — 3D Origami Multi-Panel Sheet Folding into B's Anchor
  // ---------------------------------------------------------------------------
  const transFold = {
    dur: 2.6,
    create(ctx) {
      const { GLSL_COLOR, clamp, lerp, ease, smoothstep } = getMath();
      const rt = ctx.gfx.target({ depth: true });

      const scene = new THREE.Scene();
      const backdrop = makeBackdropMesh();
      scene.add(backdrop.mesh);

      // Soft projected drop shadow plane over B
      const shadowGeo = new THREE.PlaneGeometry(2, 2);
      const shadowMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uCenter: { value: new THREE.Vector2(0, 0) },
          uSize: { value: new THREE.Vector2(1, 1) },
          uAlpha: { value: 0 },
          uAsp: { value: 16 / 9 },
        },
        vertexShader: `
precision highp float;
in vec3 position;
out vec2 vNdc;
void main(){
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`,
        fragmentShader: `
precision highp float;
in vec2 vNdc;
out vec4 o;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform float uAlpha;
uniform float uAsp;
void main(){
  vec2 d = (vNdc - uCenter) / max(uSize, vec2(0.05));
  float q = length(d);
  float a = exp(-q * q * 1.45) * uAlpha;
  o = vec4(0.0, 0.0, 0.0, a);
}
`,
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.frustumCulled = false;
      shadowMesh.renderOrder = -50;
      scene.add(shadowMesh);

      // Build 4x2 hinged origami sheet hierarchy
      // Center panels: top-center (TC), bottom-center (BC)
      // Left/Right wings hinged to center: TL, BL, TR, BR
      // Outer flaps hinged to wings: TLL, BLL, TRR, BRR (gives crisp 4x2 fold!)
      const sheetMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
          tA: { value: null },
          uAlpha: { value: 1 },
          uLit: { value: 0 },
          uCrease: { value: 0 },
        },
        vertexShader: `
precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
out vec2 vUv;
out vec3 vNormal;
out vec3 vWorld;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,
        fragmentShader: `
precision highp float;
precision highp sampler2D;
${GLSL_COLOR}
uniform sampler2D tA;
uniform float uAlpha;
uniform float uLit;
uniform float uCrease;
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorld;
out vec4 o;
void main(){
  vec3 N = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 L = normalize(vec3(0.45, 0.72, 0.85));
  vec3 V = normalize(vec3(0.0, 0.0, 4.0) - vWorld);
  vec3 H = normalize(L + V);

  vec3 frontCol = toLin(texture(tA, clamp(vUv, 0.001, 0.999)).rgb);
  // Warm parchment-slate metallic backing when folded over
  vec3 backCol = mix(vec3(0.14, 0.16, 0.20), frontCol * 0.25 + vec3(0.18, 0.16, 0.14), 0.35);
  vec3 base = gl_FrontFacing ? frontCol : backCol;

  float ndl = max(dot(N, L), 0.0);
  float diff = 0.38 + 0.72 * ndl;
  float spec = pow(max(dot(N, H), 0.0), 36.0) * 0.32;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * 0.18;

  // Crisp crease highlights along fold seams (x = 0.25, 0.5, 0.75; y = 0.5)
  float cx = min(min(abs(vUv.x - 0.25), abs(vUv.x - 0.5)), abs(vUv.x - 0.75));
  float cy = abs(vUv.y - 0.5);
  float creaseLine = exp(-min(cx, cy) * 140.0) * uCrease;

  vec3 lit = base * diff + vec3(0.95, 0.92, 0.84) * (spec + rim + creaseLine * 0.35);
  vec3 col = mix(base, lit, uLit);
  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), uAlpha);
}
`,
      });

      function makePanel(w, h, ox, oy, u0, u1, v0, v1) {
        const g = new THREE.PlaneGeometry(w, h, 1, 1);
        g.translate(ox, oy, 0);
        const uvAttr = g.attributes.uv;
        // PlaneGeometry default UV: (0,1), (1,1), (0,0), (1,0)
        uvAttr.setXY(0, u0, v1);
        uvAttr.setXY(1, u1, v1);
        uvAttr.setXY(2, u0, v0);
        uvAttr.setXY(3, u1, v0);
        uvAttr.needsUpdate = true;
        const m = new THREE.Mesh(g, sheetMat);
        m.frustumCulled = false;
        return m;
      }

      // Dynamic aspect root rebuilt cleanly when aspect changes
      const root = new THREE.Group();
      scene.add(root);
      let builtAsp = 0;
      let pivots = null;

      function buildSheet(asp) {
        while (root.children.length) root.remove(root.children[0]);
        const W = 2.0 * asp;
        const H = 2.0;
        const qw = W * 0.25;
        const hh = H * 0.5;

        // Top half hinges around y = 0; Bottom half stays base (or counter-tilts)
        const topHinge = new THREE.Group();
        const botHinge = new THREE.Group();
        root.add(topHinge, botHinge);

        // Top-inner-left (u: 0.25..0.5) & Top-inner-right (u: 0.5..0.75)
        const tMidL = new THREE.Group();
        const tMidR = new THREE.Group();
        topHinge.add(tMidL, tMidR);
        tMidL.add(makePanel(qw, hh, -qw * 0.5, hh * 0.5, 0.25, 0.5, 0.5, 1.0));
        tMidR.add(makePanel(qw, hh, qw * 0.5, hh * 0.5, 0.5, 0.75, 0.5, 1.0));

        // Top-outer wings hinged at x = -qw and x = +qw
        const tOutL = new THREE.Group();
        tOutL.position.set(-qw, 0, 0);
        tOutL.add(makePanel(qw, hh, -qw * 0.5, hh * 0.5, 0.0, 0.25, 0.5, 1.0));
        tMidL.add(tOutL);

        const tOutR = new THREE.Group();
        tOutR.position.set(qw, 0, 0);
        tOutR.add(makePanel(qw, hh, qw * 0.5, hh * 0.5, 0.75, 1.0, 0.5, 1.0));
        tMidR.add(tOutR);

        // Bottom-inner-left & Bottom-inner-right
        const bMidL = new THREE.Group();
        const bMidR = new THREE.Group();
        botHinge.add(bMidL, bMidR);
        bMidL.add(makePanel(qw, hh, -qw * 0.5, -hh * 0.5, 0.25, 0.5, 0.0, 0.5));
        bMidR.add(makePanel(qw, hh, qw * 0.5, -hh * 0.5, 0.5, 0.75, 0.0, 0.5));

        const bOutL = new THREE.Group();
        bOutL.position.set(-qw, 0, 0);
        bOutL.add(makePanel(qw, hh, -qw * 0.5, -hh * 0.5, 0.0, 0.25, 0.0, 0.5));
        bMidL.add(bOutL);

        const bOutR = new THREE.Group();
        bOutR.position.set(qw, 0, 0);
        bOutR.add(makePanel(qw, hh, qw * 0.5, -hh * 0.5, 0.75, 1.0, 0.0, 0.5));
        bMidR.add(bOutR);

        pivots = { topHinge, botHinge, tMidL, tMidR, tOutL, tOutR, bMidL, bMidR, bOutL, bOutR };
        builtAsp = asp;
      }

      const fov = 34;
      const camZ = 1.0 / Math.tan((fov * Math.PI) / 360);
      const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 30);
      cam.position.set(0, 0, camZ);
      cam.lookAt(0, 0, 0);

      return {
        render({ A, B, p, out, b, sb }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          const asp = ctx.gfx.aspect || ctx.gfx.W / Math.max(1, ctx.gfx.H) || 16 / 9;
          if (Math.abs(asp - builtAsp) > 0.002 || !pivots) buildSheet(asp);

          cam.aspect = asp;
          cam.updateProjectionMatrix();

          const anchor = resolveAnchor(ctx, b, sb);
          // Target world coordinates at z=0
          const tx = anchor.ndcX * asp;
          const ty = anchor.ndcY;
          const targetScale = clamp(anchor.ndcSize * 0.52, 0.18, 0.65);

          // Choreographed multi-stage origami folds:
          // Stage 1 (0.04..0.44): Outer left/right wings fold inward toward center
          const f1 = ease.io3(clamp((p - 0.04) / 0.4, 0, 1));
          // Stage 2 (0.28..0.64): Top half folds downward over bottom half into compact packet
          const f2 = ease.io3(clamp((p - 0.28) / 0.36, 0, 1));
          // Stage 3 (0.48..0.82): Inner halves fold into a faceted 3D prism
          const f3 = ease.io3(clamp((p - 0.48) / 0.34, 0, 1));
          // Stage 4 (0.55..0.96): Glide & scale cleanly into B's anchor
          const fly = ease.io3(clamp((p - 0.52) / 0.42, 0, 1));

          const wingAng = f1 * Math.PI * 0.96;
          pivots.tOutL.rotation.y = wingAng;
          pivots.bOutL.rotation.y = wingAng;
          pivots.tOutR.rotation.y = -wingAng;
          pivots.bOutR.rotation.y = -wingAng;

          pivots.topHinge.rotation.x = f2 * Math.PI * 0.94;
          pivots.botHinge.rotation.x = -f2 * 0.08;

          const midAng = f3 * Math.PI * 0.72;
          pivots.tMidL.rotation.y = midAng;
          pivots.bMidL.rotation.y = midAng;
          pivots.tMidR.rotation.y = -midAng;
          pivots.bMidR.rotation.y = -midAng;

          // Whole folded prism tilts gracefully in 3D as it flies into the anchor
          const lift = Math.sin(clamp(p / 0.92, 0, 1) * Math.PI);
          root.position.set(
            lerp(0, tx, fly),
            lerp(0, ty, fly) + f2 * 0.22 * (1 - fly),
            lift * 0.35 - fly * 0.15
          );
          root.rotation.set(
            -0.22 * lift + f2 * 0.14 * (1 - fly),
            0.35 * Math.sin(p * Math.PI) * (1 - fly * 0.5),
            lerp(0, anchor.angle, fly) + 0.08 * Math.sin(p * Math.PI * 2) * (1 - fly)
          );
          const sc = lerp(1.0, targetScale, fly);
          root.scale.setScalar(sc);

          const fadeOut = 1.0 - smoothstep(0.84, 0.99, p);
          backdrop.mat.uniforms.tB.value = B.texture;
          sheetMat.uniforms.tA.value = A.texture;
          sheetMat.uniforms.uAlpha.value = fadeOut;
          sheetMat.uniforms.uLit.value = smoothstep(0.0, 0.14, p);
          sheetMat.uniforms.uCrease.value = smoothstep(0.04, 0.2, p) * fadeOut;

          // Update cast shadow directly below folded prism
          shadowMat.uniforms.uCenter.value.set(
            root.position.x / Math.max(asp, 0.2) + 0.04 * lift,
            root.position.y - 0.06 * lift
          );
          shadowMat.uniforms.uSize.value.set(lerp(1.1, 0.32, Math.max(f1, fly)), lerp(0.9, 0.3, Math.max(f2, fly)));
          shadowMat.uniforms.uAlpha.value = 0.42 * smoothstep(0.05, 0.22, p) * fadeOut;
          shadowMat.uniforms.uAsp.value = asp;

          ctx.gfx.draw(scene, cam, rt, { clear: true, color: 0x000000, alpha: 1 });
          ctx.gfx.copy(rt, out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 8. TEAR — 3D Procedural Paper-Tearing Down Centerline + Fibres + Falling Scraps
  // ---------------------------------------------------------------------------
  const transTear = {
    dur: 2.6,
    create(ctx) {
      const { GLSL_NOISE, GLSL_COLOR, clamp, smoothstep } = getMath();
      const rt = ctx.gfx.target({ depth: true });
      const scene = new THREE.Scene();

      // Backdrop renders Frame B + soft procedural shadow cast by the peeling halves
      const backdrop = makeBackdropMesh(
        {
          uP: { value: 0 },
        },
        `
uniform float uP;
float tearCurve(float y){
  return 0.5
    + 0.018 * sin(y * 11.3 + 0.7)
    + 0.009 * sin(y * 29.7 + 2.1)
    + 0.004 * sin(y * 67.1 + 4.3);
}
void main(){
  vec3 b = texture(tB, vUv).rgb;
  float ripY = 1.0 - clamp(uP / 0.62, 0.0, 1.0);
  float cx = tearCurve(vUv.y);
  float opened = smoothstep(ripY - 0.04, ripY + 0.14, vUv.y);
  float spread = opened * clamp((uP - 0.05) * 1.45, 0.0, 1.2);
  float d = abs(vUv.x - cx);
  // Soft drop shadow along the curled paper edges onto Frame B
  float edgeDist = abs(d - spread * 0.42);
  float shadow = exp(-edgeDist * 14.0) * opened * (1.0 - smoothstep(0.78, 0.99, uP)) * 0.42;
  o = vec4(b * (1.0 - shadow), 1.0);
}
`
      );
      scene.add(backdrop.mesh);

      // Shared subdivided paper half builder (side = -1 left, +1 right)
      function makePaperHalf(side) {
        const segX = 28;
        const segY = 56;
        const pos = [];
        const uv = [];
        const idx = [];
        for (let iy = 0; iy <= segY; iy++) {
          const v = iy / segY; // 0 bottom .. 1 top
          for (let ix = 0; ix <= segX; ix++) {
            const uLocal = ix / segX; // 0 at tear edge -> 1 at outer screen edge
            pos.push(uLocal, v, 0);
            uv.push(side < 0 ? 0.5 * (1 - uLocal) : 0.5 + 0.5 * uLocal, v);
          }
        }
        const stride = segX + 1;
        for (let iy = 0; iy < segY; iy++) {
          for (let ix = 0; ix < segX; ix++) {
            const a = iy * stride + ix;
            const b = a + 1;
            const c = a + stride;
            const d = c + 1;
            if (side > 0) {
              idx.push(a, b, d, a, d, c);
            } else {
              idx.push(a, d, b, a, c, d);
            }
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);

        const mat = new THREE.RawShaderMaterial({
          glslVersion: THREE.GLSL3,
          side: THREE.DoubleSide,
          transparent: true,
          uniforms: {
            tA: { value: null },
            uP: { value: 0 },
            uAsp: { value: 16 / 9 },
            uSide: { value: side },
            uTime: { value: 0 },
          },
          vertexShader: `
precision highp float;
in vec3 position; // x = dist from tear edge [0..1], y = v [0..1]
in vec2 uv;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uP;
uniform float uAsp;
uniform float uSide;
uniform float uTime;

out vec2 vUv;
out float vEdgeDist;
out float vCurl;
out float vSeamX;
out vec3 vNormal;

float tearCurve(float y){
  return 0.5
    + 0.018 * sin(y * 11.3 + 0.7)
    + 0.009 * sin(y * 29.7 + 2.1)
    + 0.004 * sin(y * 67.1 + 4.3);
}

vec3 evalPos(float uLocal, float v){
  float seam = tearCurve(v);
  float screenX = uSide < 0.0 ? mix(seam, 0.0, uLocal) : mix(seam, 1.0, uLocal);

  // Tear travels from top (v = 1) down to bottom (v = 0) during p in [0..0.60]
  float ripY = 1.0 - clamp(uP / 0.60, 0.0, 1.0);
  // How long ago the tear passed this vertex's v
  float past = clamp((v - ripY) * 1.65 + max(uP - 0.55, 0.0) * 2.1, 0.0, 1.8);
  float peel = smoothstep(0.0, 0.85, past);
  float fling = smoothstep(0.45, 1.0, uP);

  // Convert screen UV to world space (board height = 2.0, width = 2.0 * uAsp)
  float wx = (screenX - 0.5) * 2.0 * uAsp;
  float wy = (v - 0.5) * 2.0;
  float wz = 0.0;

  // Cylindrical curl & outward peel strongest near the torn edge (small uLocal)
  float edgeFactor = pow(1.0 - uLocal, 1.35);
  float curlAng = peel * (1.25 + 1.35 * fling) * edgeFactor;
  float rad = 0.42;

  // Outward swing + curl forward (+Z) + gravity sag (-Y) + subtle air flutter
  float swingX = uSide * (peel * 0.42 + fling * 1.85) * (0.35 + 0.65 * (1.0 - uLocal * 0.45));
  float curlX = uSide * (1.0 - cos(curlAng)) * rad * 0.65;
  float curlZ = sin(curlAng) * rad + peel * 0.14 * edgeFactor;
  float sagY = -(peel * 0.16 * edgeFactor + fling * fling * (0.45 + 0.25 * (1.0 - uLocal)));
  float flutter = sin(v * 9.0 - uTime * 9.0 + uSide * 1.7) * 0.028 * peel * edgeFactor;

  return vec3(wx + swingX + curlX, wy + sagY, wz + curlZ + flutter);
}

void main(){
  float uLocal = position.x;
  float v = position.y;
  float seam = tearCurve(v);
  float screenX = uSide < 0.0 ? mix(seam, 0.0, uLocal) : mix(seam, 1.0, uLocal);

  vec3 p0 = evalPos(uLocal, v);
  vec3 px = evalPos(min(1.0, uLocal + 0.015), v);
  vec3 py = evalPos(uLocal, min(1.0, v + 0.015));
  vec3 tangentX = (px - p0) * (uSide > 0.0 ? 1.0 : -1.0);
  vec3 tangentY = py - p0;
  vec3 n = normalize(cross(tangentX, tangentY) + vec3(0.0, 0.0, 1e-5));

  vUv = vec2(screenX, v);
  vEdgeDist = uLocal;
  vSeamX = seam;
  vCurl = clamp(p0.z * 2.0, 0.0, 1.0);
  vNormal = n;
  gl_Position = projectionMatrix * viewMatrix * vec4(p0, 1.0);
}
`,
          fragmentShader: `
precision highp float;
precision highp sampler2D;
${GLSL_NOISE}
${GLSL_COLOR}
uniform sampler2D tA;
uniform float uP;

in vec2 vUv;
in float vEdgeDist;
in float vCurl;
in float vSeamX;
in vec3 vNormal;

out vec4 o;

void main(){
  float ripY = 1.0 - clamp(uP / 0.60, 0.0, 1.0);
  float torn = smoothstep(ripY - 0.03, ripY + 0.03, vUv.y);

  // High-frequency fibrous torn paper edge + protruding micro-fibres
  float jag = fbm(vec2(vUv.y * 55.0, vEdgeDist * 18.0)) * 0.022
            + vnoise(vec2(vUv.y * 190.0, 2.3)) * 0.011;
  float fibre = smoothstep(0.68, 0.92, vnoise(vec2(vUv.y * 320.0, vEdgeDist * 90.0))) * 0.016;
  float trimDist = vEdgeDist - (jag + fibre) * torn;
  if (trimDist < 0.0 && torn > 0.1) discard;

  vec3 N = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 L = normalize(vec3(0.35, 0.68, 0.85));
  float diff = 0.44 + 0.64 * max(dot(N, L), 0.0);

  vec3 frontCol = toLin(texture(tA, clamp(vUv, 0.001, 0.999)).rgb);
  // Warm matte off-white fibrous paper backing
  float grain = 0.92 + 0.14 * vnoise(vUv * 120.0);
  vec3 backCol = vec3(0.84, 0.82, 0.77) * grain;
  vec3 base = gl_FrontFacing ? frontCol : backCol;

  // Exposed ragged white fibrous paper core along the torn edge
  float coreBand = (1.0 - smoothstep(0.0, 0.026 + jag * 0.7, trimDist)) * torn;
  vec3 paperCore = vec3(0.95, 0.93, 0.89) * (0.9 + 0.18 * vnoise(vUv * 240.0));
  base = mix(base, paperCore, coreBand * 0.94);

  // Subtle lighting kicks in smoothly as the paper curls off the plane
  float litMix = smoothstep(0.0, 0.08, uP);
  vec3 col = mix(base, base * diff, litMix);
  float alpha = 1.0 - smoothstep(0.86, 0.995, uP);
  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), alpha);
}
`,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 10;
        return { mesh, mat };
      }

      const leftHalf = makePaperHalf(-1);
      const rightHalf = makePaperHalf(1);
      scene.add(leftHalf.mesh, rightHalf.mesh);

      // 48 falling 3D torn paper scraps detaching along the rip centerline
      const SCRAPS = 48;
      const scrapQuad = new THREE.PlaneGeometry(1, 1);
      const scrapGeo = new THREE.InstancedBufferGeometry();
      scrapGeo.setAttribute('position', scrapQuad.attributes.position);
      scrapGeo.setAttribute('uv', scrapQuad.attributes.uv);
      scrapGeo.index = scrapQuad.index;

      const sData = new Float32Array(SCRAPS * 4); // y0, size, vx, seed
      for (let i = 0; i < SCRAPS; i++) {
        const h1 = ((Math.sin(i * 91.7 + 12.3) * 43758.5453) % 1 + 1) % 1;
        const h2 = ((Math.sin(i * 213.1 + 57.9) * 43758.5453) % 1 + 1) % 1;
        const h3 = ((Math.sin(i * 347.3 + 81.1) * 43758.5453) % 1 + 1) % 1;
        sData[i * 4 + 0] = 0.06 + (i / SCRAPS) * 0.88; // y0 in [0.06..0.94]
        sData[i * 4 + 1] = 0.018 + h1 * h1 * 0.048; // scrap size
        sData[i * 4 + 2] = (h2 - 0.5) * 1.15; // horizontal burst velocity
        sData[i * 4 + 3] = h3; // seed
      }
      scrapGeo.setAttribute('aScrap', new THREE.InstancedBufferAttribute(sData, 4));
      scrapGeo.instanceCount = SCRAPS;

      const scrapMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
          uP: { value: 0 },
          uAsp: { value: 16 / 9 },
        },
        vertexShader: `
precision highp float;
in vec3 position;
in vec2 uv;
in vec4 aScrap;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uP;
uniform float uAsp;

out vec2 vUv;
out float vSeed;
out float vAlpha;
out float vShade;

float tearCurve(float y){
  return 0.5 + 0.018 * sin(y * 11.3 + 0.7) + 0.009 * sin(y * 29.7 + 2.1);
}

void main(){
  float y0 = aScrap.x;
  float sz = aScrap.y;
  float vx = aScrap.z;
  float seed = aScrap.w;

  // Release time when rip passes y0
  float tRel = (1.0 - y0) * 0.60;
  float dt = max(0.0, uP - tRel);
  float alive = smoothstep(0.0, 0.02, dt) * (1.0 - smoothstep(0.55, 0.92, dt));

  float drag = 1.0 - exp(-dt * 2.4);
  float cx = (tearCurve(y0) - 0.5) * 2.0 * uAsp + vx * drag * 0.65 + sin(dt * 11.0 + seed * 12.0) * 0.08 * dt;
  float cy = (y0 - 0.5) * 2.0 + 0.12 * drag - 1.75 * dt * dt;
  float cz = 0.08 + 0.45 * drag * (0.4 + 0.6 * seed);

  // 3D tumbling rotation
  float rx = dt * (7.0 + seed * 9.0);
  float ry = dt * (5.5 + (1.0 - seed) * 8.0);
  float rz = seed * 6.28 + dt * 4.5;
  vec3 p = position * vec3(sz * (1.0 + seed * 0.9), sz * (0.65 + 0.6 * (1.0 - seed)), 1.0);
  float sx = sin(rx), cxr = cos(rx);
  p.yz = mat2(cxr, -sx, sx, cxr) * p.yz;
  float sy = sin(ry), cyr = cos(ry);
  p.xz = mat2(cyr, -sy, sy, cyr) * p.xz;
  float szr = sin(rz), czr = cos(rz);
  p.xy = mat2(czr, -szr, szr, czr) * p.xy;

  vUv = uv;
  vSeed = seed;
  vAlpha = alive;
  vShade = 0.62 + 0.38 * abs(cxr * cyr);
  gl_Position = projectionMatrix * viewMatrix * vec4(vec3(cx, cy, cz) + p, 1.0);
}
`,
        fragmentShader: `
precision highp float;
in vec2 vUv;
in float vSeed;
in float vAlpha;
in float vShade;
out vec4 o;
void main(){
  if (vAlpha < 0.01) discard;
  vec2 q = vUv - 0.5;
  float ang = atan(q.y, q.x);
  float rad = 0.42 + 0.09 * sin(ang * 3.0 + vSeed * 15.0) + 0.06 * cos(ang * 5.0 - vSeed * 9.0);
  if (length(q) > rad) discard;
  vec3 col = vec3(0.94, 0.91, 0.86) * vShade;
  o = vec4(col, vAlpha);
}
`,
      });
      const scrapMesh = new THREE.Mesh(scrapGeo, scrapMat);
      scrapMesh.frustumCulled = false;
      scrapMesh.renderOrder = 20;
      scene.add(scrapMesh);

      const fov = 34;
      const camZ = 1.0 / Math.tan((fov * Math.PI) / 360);
      const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 30);
      cam.position.set(0, 0, camZ);
      cam.lookAt(0, 0, 0);

      return {
        render({ A, B, p, out, time }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          const asp = ctx.gfx.aspect || ctx.gfx.W / Math.max(1, ctx.gfx.H) || 16 / 9;
          cam.aspect = asp;
          cam.updateProjectionMatrix();

          backdrop.mat.uniforms.tB.value = B.texture;
          backdrop.mat.uniforms.uP.value = p;

          leftHalf.mat.uniforms.tA.value = A.texture;
          leftHalf.mat.uniforms.uP.value = p;
          leftHalf.mat.uniforms.uAsp.value = asp;
          leftHalf.mat.uniforms.uTime.value = time || 0;

          rightHalf.mat.uniforms.tA.value = A.texture;
          rightHalf.mat.uniforms.uP.value = p;
          rightHalf.mat.uniforms.uAsp.value = asp;
          rightHalf.mat.uniforms.uTime.value = time || 0;

          scrapMat.uniforms.uP.value = p;
          scrapMat.uniforms.uAsp.value = asp;

          ctx.gfx.draw(scene, cam, rt, { clear: true, color: 0x000000, alpha: 1 });
          ctx.gfx.copy(rt, out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 9. PORTAL-IN — Radial Tunnel Dive + Zoom Blur + Luminous Iris Ring
  // ---------------------------------------------------------------------------
  const transPortalIn = {
    dur: 1.9,
    create(ctx) {
      const { GLSL_COLOR } = getMath();
      const pass = ctx.gfx.pass(
        `${GLSL_COLOR}
uniform sampler2D tA, tB;
uniform float uP;

void main(){
  float p = clamp(uP, 0.0, 1.0);
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 d = vUv - 0.5;
  float r = length(d * vec2(asp, 1.0));
  float maxR = length(vec2(asp * 0.5, 0.5)) + 0.08;

  // Accelerating dive curve
  float dive = p * p * (3.0 - 2.0 * p);
  float irisR = mix(-0.04, maxR * 1.12, pow(dive, 1.2));

  // Frame A rushes past with radial zoom-blur and barrel warp
  float scaleA = mix(1.0, 0.32, dive);
  float blurA = sin(p * 3.14159265) * 0.075;
  vec3 colA = vec3(0.0);
  for(int i = 0; i < 7; i++){
    float fi = float(i) / 6.0;
    float s = scaleA * (1.0 - fi * blurA);
    vec2 uvA = clamp(0.5 + d * s, 0.001, 0.999);
    colA += toLin(texture(tA, uvA).rgb);
  }
  colA /= 7.0;

  // Frame B emerges inside the iris, zooming smoothly into 1:1
  float scaleB = mix(1.48, 1.0, 1.0 - pow(1.0 - p, 3.0));
  float blurB = (1.0 - p) * sin(p * 3.14159265) * 0.035;
  vec3 colB = vec3(0.0);
  for(int i = 0; i < 5; i++){
    float fi = float(i) / 4.0;
    vec2 uvB = clamp(0.5 + d * (scaleB + fi * blurB), 0.001, 0.999);
    colB += toLin(texture(tB, uvB).rgb);
  }
  colB /= 5.0;

  // Crisp luminous iris mask with subtle chromatic rim refraction
  float soft = 0.045 + 0.035 * sin(p * 3.14159265);
  float maskB = 1.0 - smoothstep(irisR - soft, irisR + soft, r);
  float ring = exp(-pow((r - irisR) / 0.032, 2.0)) * sin(p * 3.14159265);
  float ringR = exp(-pow((r - (irisR + 0.012)) / 0.028, 2.0)) * sin(p * 3.14159265);
  float ringB = exp(-pow((r - (irisR - 0.012)) / 0.028, 2.0)) * sin(p * 3.14159265);

  vec3 col = mix(colA, colB, maskB);
  vec3 irisGlow = vec3(ringR * 0.95, ring * 0.92, ringB * 1.15) * 0.58 + vec3(1.0, 0.88, 0.64) * ring * 0.25;
  col += irisGlow;

  col = col / (1.0 + max(max(col.r, max(col.g, col.b)) - 0.9, 0.0) * 0.55);
  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), 1.0);
}`,
        { tA: null, tB: null, uP: 0 }
      );
      return {
        render({ A, B, p, out }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          pass.u.tA.value = A.texture;
          pass.u.tB.value = B.texture;
          pass.u.uP.value = p;
          pass.render(out);
        },
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 10. PORTAL-OUT — Reverse Radial Pull-Back from A Revealing B Around It
  // ---------------------------------------------------------------------------
  const transPortalOut = {
    dur: 1.9,
    create(ctx) {
      const { GLSL_COLOR } = getMath();
      const pass = ctx.gfx.pass(
        `${GLSL_COLOR}
uniform sampler2D tA, tB;
uniform float uP;

void main(){
  float p = clamp(uP, 0.0, 1.0);
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 d = vUv - 0.5;
  float r = length(d * vec2(asp, 1.0));
  float maxR = length(vec2(asp * 0.5, 0.5)) + 0.08;

  // Frame A contracts smoothly into a receding central disc
  float pull = 1.0 - pow(1.0 - p, 2.4);
  float portalR = mix(maxR * 1.08, -0.02, pull);

  float scaleA = mix(1.0, 2.35, pull);
  vec2 uvA = clamp(0.5 + d * scaleA, 0.001, 0.999);
  vec3 colA = toLin(texture(tA, uvA).rgb);

  // Frame B gently pulls back from slight zoom-in around the shrinking portal into 1:1
  float scaleB = mix(0.76, 1.0, smoothstep(0.0, 0.95, p));
  float blurB = sin(p * 3.14159265) * 0.028;
  vec3 colB = vec3(0.0);
  for(int i = 0; i < 5; i++){
    float fi = float(i) / 4.0 - 0.5;
    vec2 uvB = clamp(0.5 + d * (scaleB + fi * blurB), 0.001, 0.999);
    colB += toLin(texture(tB, uvB).rgb);
  }
  colB /= 5.0;

  // Glass rim refraction & soft closing halo around contracting portal
  float soft = 0.032 + 0.025 * sin(p * 3.14159265);
  float maskA = 1.0 - smoothstep(portalR - soft, portalR + soft, r);
  float ring = exp(-pow((r - max(portalR, 0.0)) / 0.028, 2.0)) * sin(p * 3.14159265);

  vec3 col = mix(colB, colA, maskA * (1.0 - smoothstep(0.86, 0.99, p)));
  col += vec3(0.88, 0.94, 1.05) * ring * 0.48;

  // Subtle center pinch sparkle at closure
  float closeSpark = exp(-r * 16.0) * exp(-pow((p - 0.91) / 0.055, 2.0));
  col += vec3(1.0, 0.95, 0.86) * closeSpark * 0.55;

  o = vec4(toSrgb(clamp(col, 0.0, 1.0)), 1.0);
}`,
        { tA: null, tB: null, uP: 0 }
      );
      return {
        render({ A, B, p, out }) {
          if (p <= 0) {
            ctx.gfx.copy(A, out);
            return;
          }
          if (p >= 1) {
            ctx.gfx.copy(B, out);
            return;
          }
          pass.u.tA.value = A.texture;
          pass.u.tB.value = B.texture;
          pass.u.uP.value = p;
          pass.render(out);
        },
      };
    },
  };

  LHP.transitions = {
    fade: transFade,
    line: transLine,
    wash: transWash,
    flaps: transFlaps,
    daybreak: transDaybreak,
    slam: transSlam,
    fold: transFold,
    tear: transTear,
    'portal-in': transPortalIn,
    'portal-out': transPortalOut,
  };
})();
