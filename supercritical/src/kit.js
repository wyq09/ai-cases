(() => {
  'use strict';
  const SC = (window.__SC = window.__SC || {});
  SC.scenes = SC.scenes || [];

  // ===========================================================================
  // Design tokens — 《超临界》: cold gray (human / known) vs. blackbody heat (machine / runaway)
  // ===========================================================================
  const T = {
    bg: '#070707',
    paper: '#f2eee6',
    ink: '#141210',
    white: '#f4efe7',
    text: '#d6d0c6',
    dim: '#8a847c',
    faint: '#4a4642',
    line: '#2a2724',
    ember: '#ff4a1c',
    amber: '#ffa240',
    hot: '#fff3e0',
    cold: '#b9c4cc',
    M: 140,
    R: 1780,
    W: 1920,
    H: 1080,
  };
  // linear-light HDR versions used inside shaders (values > 1 feed the bloom pass)
  const HDR = {
    ember: [1.0, 0.19, 0.05],
    emberHot: [2.4, 0.62, 0.14],
    amber: [1.0, 0.42, 0.1],
    hot: [2.6, 2.3, 1.9],
    white: [0.82, 0.8, 0.76],
    dim: [0.24, 0.23, 0.22],
    faint: [0.075, 0.07, 0.066],
    cold: [0.5, 0.58, 0.63],
  };

  const M = SC.math;
  const { clamp, lerp } = M;

  // ===========================================================================
  // GLSL prelude shared by every fullscreen pass (stage coords: top-left origin, y down)
  // ===========================================================================
  const GLSL_PRE =
    M.GLSL_NOISE +
    M.GLSL_COLOR +
    `
uniform vec4 uView;
vec2 stage(){ return vec2(uView.x + vUv.x * uView.z, uView.y + (1.0 - vUv.y) * uView.w); }
float pxUnit(){ return uView.z / max(uRes.x, 1.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdLine(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}
float sdBox(vec2 p, vec2 b){
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
float gridLine(float x, float step_, float px){
  float d = abs(fract(x / step_ + 0.5) - 0.5) * step_;
  return 1.0 - smoothstep(0.0, px * 1.1, d - 0.5);
}
float fillAA(float d, float px){ return smoothstep(px, -px, d); }
float strokeAA(float d, float w, float px){ return 1.0 - smoothstep(w - px, w + px, abs(d)); }
`;

  const PRESETS = {
    h1: { size: 88, font: 'songBlack', color: T.white, leading: 1.2 },
    h2: { size: 64, font: 'songBlack', color: T.white, leading: 1.24 },
    h3: { size: 44, font: 'songBold', color: T.white, leading: 1.35 },
    lead: { size: 36, font: 'text', color: T.text, leading: 1.5 },
    quote: { size: 40, font: 'serif', color: T.white, leading: 1.62 },
    mono: { size: 24, font: 'mono', color: T.dim, leading: 1.5 },
    monoS: { size: 20, font: 'mono', color: T.dim, leading: 1.5 },
    monoL: { size: 30, font: 'mono', color: T.text, leading: 1.5 },
    lab: { size: 24, font: 'monoMed', color: T.ember, tracking: 0.14, leading: 1.4 },
    num: { size: 240, font: 'didot', color: T.white, leading: 1.0 },
    numS: { size: 104, font: 'didot', color: T.white, leading: 1.0 },
    act: { size: 22, font: 'monoMed', color: T.dim, tracking: 0.2, leading: 1.2 },
  };

  // ===========================================================================
  // Fullscreen passes
  // ===========================================================================
  function pass(ctx, body, uniforms = {}, opts) {
    const u = { uView: { value: new ctx.THREE.Vector4(0, 0, 1920, 1080) }, ...uniforms };
    const p = ctx.gfx.pass(GLSL_PRE + body, u, opts);
    const v = ctx.view;
    return {
      u: p.u,
      material: p.material,
      render(target = null, time = 0, clear = false) {
        p.u.uView.value.set(v.x0, v.y0, v.w, v.h);
        p.u.uTime.value = time;
        p.render(target, clear);
      },
      dispose() {
        p.dispose();
      },
    };
  }

  const BG_BODY = `
uniform vec3 uBase, uTint;
uniform float uGrid, uVig, uTintA, uGrain, uShift;
void main(){
  vec2 s = stage();
  vec3 c = uBase;
  if (uGrid > 0.0) {
    float px = pxUnit();
    float minor = max(gridLine(s.x, 60.0, px), gridLine(s.y, 60.0, px));
    float major = max(gridLine(s.x, 300.0, px), gridLine(s.y, 300.0, px));
    c += uTint * (minor * 0.034 + major * 0.075) * uGrid;
  }
  if (uTintA > 0.0) {
    float n = fbm(s * 0.0021 + vec2(uShift, uTime * 0.012));
    c += uTint * uTintA * smoothstep(0.28, 0.92, n);
  }
  vec2 d = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  c *= 1.0 - uVig * smoothstep(0.3, 1.3, length(d));
  if (uGrain > 0.0) c += (hash12(gl_FragCoord.xy + fract(uTime) * 911.0) - 0.5) * uGrain;
  o = vec4(max(c, 0.0), 1.0);
}`;

  // Dark engineering-paper background by default; light paper for the white scenes.
  function bg(ctx, { base = [0.026, 0.025, 0.024], grid = 1, tint = [1, 0.95, 0.88], tintA = 0, vig = 0.42, grain = 0 } = {}) {
    return pass(
      ctx,
      BG_BODY,
      {
        uBase: { value: new ctx.THREE.Vector3(...base) },
        uTint: { value: new ctx.THREE.Vector3(...tint) },
        uGrid: grid,
        uVig: vig,
        uTintA: tintA,
        uGrain: grain,
        uShift: Math.random() * 100,
      },
      { blending: ctx.THREE.NoBlending }
    );
  }

  function post(ctx, src, dst, o = {}) {
    ctx.gfx.post(src, dst, {
      exposure: 1.25,
      bloom: 0.5,
      threshold: 1.0,
      radius: 0.85,
      tone: 'agx',
      contrast: 1.05,
      saturation: 1.1,
      vignette: 0.3,
      grain: 0.02,
      ...o,
    });
  }

  // ===========================================================================
  // 2D vector engine: resolution-independent ribbons, discs and rects in stage units.
  // All shapes are premultiplied-alpha "over", depth test off, drawn in creation order.
  // ===========================================================================
  const VERT_HEAD = `precision highp float;
uniform mat4 projectionMatrix, modelViewMatrix;
`;
  const FRAG_HEAD = `precision highp float;
uniform float uPx;
out vec4 o;
`;

  function createVec(ctx) {
    const { THREE, gfx, view } = ctx;
    const scene = new THREE.Scene();
    const mats = [];
    const rgbCache = new Map();
    const QUAD = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    const QUAD_IDX = [0, 1, 2, 0, 2, 3];

    const BLEND = {
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    };

    function mkMat(vs, fs, uniforms) {
      const mat = new THREE.RawShaderMaterial({
        vertexShader: VERT_HEAD + vs,
        fragmentShader: FRAG_HEAD + fs,
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        ...BLEND,
        uniforms,
      });
      mats.push(mat);
      return mat;
    }

    function rgb(c) {
      if (Array.isArray(c)) return c;
      let v = rgbCache.get(c);
      if (!v) {
        v = M.hexToRgb(c);
        rgbCache.set(c, v);
      }
      return v;
    }

    const LINE_VS = `
in vec3 position;
in vec4 aA, aB;
uniform float uWidth;
out float vAcross, vDist;
void main(){
  vec2 nrm = position.z < 0.5 ? aA.xy : (position.z < 1.5 ? aA.zw : aB.xy);
  vec2 p = position.xy + nrm * (uWidth * 0.5) * aB.w;
  vAcross = aB.w;
  vDist = aB.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}`;
    const LINE_FS = `
in float vAcross, vDist;
uniform vec3 uColor;
uniform float uAlpha, uDraw, uDash, uDashOff, uSoft, uWidth;
void main(){
  if (vDist > uDraw) discard;
  float wpx = max(uWidth * 0.5 / uPx, 0.3);
  float x = vAcross * wpx;
  float cov = clamp(min(0.5, wpx - x) - max(-0.5, -wpx - x), 0.0, 1.0);
  if (uSoft > 0.0) cov = pow(max(1.0 - abs(vAcross), 0.0), uSoft) * step(abs(vAcross), 1.0);
  if (uDash > 0.0) {
    float f = fract((vDist + uDashOff) / uDash);
    cov *= smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.5, 0.55, f));
  }
  float k = cov * uAlpha;
  o = vec4(uColor * k, k);
}`;

    class Line {
      constructor(cap, { width = 3, color = T.white, alpha = 1, dash = 0, dashOff = 0, glow = 0, soft = 0, order = 0 } = {}) {
        this.cap = Math.max(2, cap);
        this.n = 0;
        this.pos = new Float32Array(this.cap * 18);
        this.aA = new Float32Array(this.cap * 24);
        this.aB = new Float32Array(this.cap * 24);
        this.dist = new Float32Array(this.cap);
        // Layout per point: [P_in, P_tip, P_out, M_in, M_tip, M_out] (P = +normal side, M = −normal side).
        // Each point emits its miter wedge (2 triangles), each segment a quad between the two cross-sections.
        const idx = new Uint32Array((this.cap - 1) * 12 + 6);
        let q = 0;
        for (let i = 0; i < this.cap; i++) {
          const b = i * 6;
          idx[q++] = b; idx[q++] = b + 1; idx[q++] = b + 2;
          idx[q++] = b + 3; idx[q++] = b + 4; idx[q++] = b + 5;
          if (i < this.cap - 1) {
            const c = b + 6;
            idx[q++] = b + 5; idx[q++] = c + 3; idx[q++] = b + 2;
            idx[q++] = b + 2; idx[q++] = c + 3; idx[q++] = c;
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aA', new THREE.BufferAttribute(this.aA, 4).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aB', new THREE.BufferAttribute(this.aB, 4).setUsage(THREE.DynamicDrawUsage));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        g.setDrawRange(0, 0);
        this.geo = g;
        this.len = 0;
        this.u = {
          uColor: { value: new THREE.Vector3(...rgb(color)) },
          uAlpha: { value: alpha },
          uWidth: { value: width },
          uDraw: { value: 1e9 },
          uDash: { value: dash },
          uDashOff: { value: dashOff },
          uSoft: { value: soft },
          uPx: { value: 1 },
        };
        this.mat = mkMat(LINE_VS, LINE_FS, this.u);
        this.mesh = new THREE.Mesh(g, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = order;
        scene.add(this.mesh);
        this.glow = null;
        this._glow = glow;
        if (glow > 0) {
          this.gu = {
            uColor: this.u.uColor,
            uAlpha: { value: alpha * glow * 0.16 },
            uWidth: { value: width * 7 },
            uDraw: this.u.uDraw,
            uDash: { value: 0 },
            uDashOff: { value: 0 },
            uSoft: { value: 1.7 },
            uPx: { value: 1 },
          };
          this.gmat = mkMat(LINE_VS, LINE_FS, this.gu);
          this.glow = new THREE.Mesh(g, this.gmat);
          this.glow.frustumCulled = false;
          this.glow.renderOrder = order - 1;
          scene.add(this.glow);
        }
      }
      set(points, { draw = null } = {}) {
        const n = Math.min(this.cap, Math.floor(points.length / 2));
        this.n = n;
        if (n < 2) {
          this.geo.setDrawRange(0, 0);
          return this;
        }
        const P = points;
        const { pos, aA, aB, dist } = this;
        let d = 0;
        for (let i = 0; i < n; i++) {
          const x = P[i * 2];
          const y = P[i * 2 + 1];
          let inx, iny, outx, outy;
          if (i === 0) {
            outx = P[2] - x; outy = P[3] - y; inx = outx; iny = outy;
          } else if (i === n - 1) {
            inx = x - P[(i - 1) * 2]; iny = y - P[(i - 1) * 2 + 1]; outx = inx; outy = iny;
          } else {
            inx = x - P[(i - 1) * 2]; iny = y - P[(i - 1) * 2 + 1];
            outx = P[(i + 1) * 2] - x; outy = P[(i + 1) * 2 + 1] - y;
          }
          const li = Math.hypot(inx, iny) || 1;
          const lo = Math.hypot(outx, outy) || 1;
          const nix = -iny / li, niy = inx / li, nox = -outy / lo, noy = outx / lo;
          const cos = nix * nox + niy * noy;
          let mx, my;
          if (cos > 0.2) {
            const k = 1 / (1 + cos);
            mx = (nix + nox) * k; my = (niy + noy) * k;
          } else {
            mx = (nix + nox) * 0.75; my = (niy + noy) * 0.75;
          }
          const ml = Math.hypot(mx, my);
          if (ml > 2.4) {
            mx *= 2.4 / ml; my *= 2.4 / ml;
          }
          if (i > 0) d += Math.hypot(x - P[(i - 1) * 2], y - P[(i - 1) * 2 + 1]);
          dist[i] = d;
          for (let side = 0; side < 2; side++) {
            const sgn = side === 0 ? 1 : -1;
            for (let k = 0; k < 3; k++) {
              const vi = i * 6 + side * 3 + k;
              pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = k;
              aA[vi * 4] = nix; aA[vi * 4 + 1] = niy; aA[vi * 4 + 2] = mx; aA[vi * 4 + 3] = my;
              aB[vi * 4] = nox; aB[vi * 4 + 1] = noy; aB[vi * 4 + 2] = d; aB[vi * 4 + 3] = sgn;
            }
          }
        }
        this.len = d;
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.aA.needsUpdate = true;
        this.geo.attributes.aB.needsUpdate = true;
        this.geo.setDrawRange(0, (n - 1) * 12 + 6);
        if (draw != null) this.u.uDraw.value = draw;
        return this;
      }
      color(c) {
        const v = rgb(c);
        this.u.uColor.value.set(v[0], v[1], v[2]);
        return this;
      }
      alpha(a) {
        this.u.uAlpha.value = a;
        if (this.glow) this.gu.uAlpha.value = a * (this._glow || 1) * 0.16;
        return this;
      }
      width(w) {
        this.u.uWidth.value = w;
        if (this.glow) this.gu.uWidth.value = w * 7;
        return this;
      }
      draw(d) {
        this.u.uDraw.value = d;
        return this;
      }
      dash(len, off = 0) {
        this.u.uDash.value = len;
        this.u.uDashOff.value = off;
        return this;
      }
      visible(v) {
        this.mesh.visible = v;
        if (this.glow) this.glow.visible = v;
        return this;
      }
    }

    const DOT_VS = `
in vec3 position;
in vec4 aA, aB;
out vec2 vUv;
out vec4 vB;
out float vA, vR;
void main(){
  vUv = position.xy + 0.5;
  vB = aB;
  vA = aA.w;
  vR = aA.z;
  float spread = 1.0 + aB.w * 2.5;
  vec2 p = aA.xy + position.xy * aA.z * 2.0 * spread;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}`;
    const DOT_FS = `
in vec2 vUv;
in vec4 vB;
in float vA, vR;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float cov;
  if (vB.w < 0.001) {
    float px = clamp(uPx / max(vR, 1e-3), 0.01, 0.5);
    cov = 1.0 - smoothstep(1.0 - px, 1.0 + px, d);
  } else {
    cov = exp(-d * d * 3.2) * (1.0 - smoothstep(0.6, 1.0, d));
  }
  float k = cov * vA;
  o = vec4(vB.rgb * k, k);
}`;

    class Dots {
      constructor(n, { order = 0 } = {}) {
        const g = new THREE.InstancedBufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
        g.setIndex(QUAD_IDX);
        this.n = n;
        this.aA = new Float32Array(n * 4);
        this.aB = new Float32Array(n * 4);
        this.atA = new THREE.InstancedBufferAttribute(this.aA, 4).setUsage(THREE.DynamicDrawUsage);
        this.atB = new THREE.InstancedBufferAttribute(this.aB, 4).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aA', this.atA);
        g.setAttribute('aB', this.atB);
        g.instanceCount = n;
        this.u = { uPx: { value: 1 } };
        this.mat = mkMat(DOT_VS, DOT_FS, this.u);
        this.mesh = new THREE.Mesh(g, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = order;
        scene.add(this.mesh);
      }
      set(i, x, y, r, color, alpha = 1, soft = 0) {
        const c = rgb(color);
        this.aA[i * 4] = x; this.aA[i * 4 + 1] = y; this.aA[i * 4 + 2] = r; this.aA[i * 4 + 3] = alpha;
        this.aB[i * 4] = c[0]; this.aB[i * 4 + 1] = c[1]; this.aB[i * 4 + 2] = c[2]; this.aB[i * 4 + 3] = soft;
        return this;
      }
      commit() {
        this.atA.needsUpdate = true;
        this.atB.needsUpdate = true;
        return this;
      }
      clear() {
        this.aA.fill(0);
        return this.commit();
      }
      visible(v) {
        this.mesh.visible = v;
        return this;
      }
    }

    const RECT_VS = `
in vec3 position;
in vec4 aA, aB;
out vec2 vUv;
out vec4 vB;
out vec2 vH;
void main(){
  vUv = position.xy + 0.5;
  vB = aB;
  vH = aA.zw * 0.5;
  vec2 p = aA.xy + position.xy * aA.zw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}`;
    const RECT_FS = `
in vec2 vUv;
in vec4 vB;
in vec2 vH;
void main(){
  vec2 t = abs(vUv - 0.5) * 2.0 * vH;
  vec2 f = vec2(1.0) - smoothstep(vH - uPx * 0.5, vH + uPx * 0.5, t);
  float k = f.x * f.y * vB.a;
  o = vec4(vB.rgb * k, k);
}`;

    class Rects {
      constructor(n, { order = 0 } = {}) {
        const g = new THREE.InstancedBufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
        g.setIndex(QUAD_IDX);
        this.n = n;
        this.aA = new Float32Array(n * 4);
        this.aB = new Float32Array(n * 4);
        this.atA = new THREE.InstancedBufferAttribute(this.aA, 4).setUsage(THREE.DynamicDrawUsage);
        this.atB = new THREE.InstancedBufferAttribute(this.aB, 4).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aA', this.atA);
        g.setAttribute('aB', this.atB);
        g.instanceCount = n;
        this.u = { uPx: { value: 1 } };
        this.mat = mkMat(RECT_VS, RECT_FS, this.u);
        this.mesh = new THREE.Mesh(g, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = order;
        scene.add(this.mesh);
      }
      // (x, y) is the anchor corner; (ax, ay) selects which corner (0 = left/top, 0.5 = center, 1 = right/bottom)
      set(i, x, y, w, h, color, alpha = 1, ax = 0, ay = 0) {
        const c = rgb(color);
        // (x, y, ax, ay) describe an anchored corner; the shader wants the quad centre.
        this.aA[i * 4] = x - w * ax + w * 0.5; this.aA[i * 4 + 1] = y - h * ay + h * 0.5;
        this.aA[i * 4 + 2] = Math.max(w, 0); this.aA[i * 4 + 3] = Math.max(h, 0);
        this.aB[i * 4] = c[0]; this.aB[i * 4 + 1] = c[1]; this.aB[i * 4 + 2] = c[2]; this.aB[i * 4 + 3] = alpha;
        return this;
      }
      commit() {
        this.atA.needsUpdate = true;
        this.atB.needsUpdate = true;
        return this;
      }
      clear() {
        this.aB.fill(0);
        return this.commit();
      }
      visible(v) {
        this.mesh.visible = v;
        return this;
      }
    }

    function render(target) {
      const px = view.w / Math.max(1, gfx.W);
      for (let i = 0; i < mats.length; i++) mats[i].uniforms.uPx.value = px;
      gfx.r.setRenderTarget(target);
      gfx.r.render(scene, view.cam);
    }

    const api = {
      scene,
      line: (cap, opts) => new Line(cap, opts),
      dots: (n, opts) => new Dots(n, opts),
      rects: (n, opts) => new Rects(n, opts),
      render,
      dispose() {
        for (const m of mats) m.dispose();
      },
    };
    return api;
  }

  // ===========================================================================
  // Text helpers on top of the GPU type engine
  // ===========================================================================
  function text(ctx, ov, str, preset = 'lead', extra = {}) {
    const b = ctx.text(str, { ...(PRESETS[preset] || PRESETS.lead), ...extra });
    if (ov) ov.add(b);
    return b;
  }
  const show = (b, p, style = 'rise', stagger = 0.3, by) => b.show(p, { style, stagger, by });

  // Scenes gate their copy on the incoming transition so text lands as the wipe completes.
  const gate = (s, a = 0.5, b = 1) => M.smoothstep(a, b, s.enter);

  // ===========================================================================
  // Scales & formatting
  // ===========================================================================
  function scale(domain, range, log = false) {
    const [d0, d1] = log ? [Math.log10(domain[0]), Math.log10(domain[1])] : domain;
    const [r0, r1] = range;
    const toV = (v) => (log ? Math.log10(Math.max(v, 1e-300)) : v);
    const f = (v) => r0 + ((toV(v) - d0) / (d1 - d0)) * (r1 - r0);
    f.inv = (r) => (log ? Math.pow(10, d0 + ((r - r0) / (r1 - r0)) * (d1 - d0)) : d0 + ((r - r0) / (r1 - r0)) * (d1 - d0));
    f.log = log;
    f.domain = domain;
    f.range = range;
    return f;
  }

  const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  const sup = (s) => String(s).split('').map((c) => SUP[c] || c).join('');
  const sci = (v, digits = 1) => {
    const e = Math.floor(Math.log10(Math.abs(v)));
    return { m: (v / Math.pow(10, e)).toFixed(digits), e };
  };

  const YEAR = 31557600;
  const MONTH = 2629800;
  // Pick the largest unit that is (almost) fully covered, so 3600 s reads "1 小时", not "60 分钟".
  const DUR_UNITS = [[31557600, '年'], [2629800, '个月'], [604800, '周'], [86400, '天'], [3600, '小时'], [60, '分钟'], [1, '秒']];
  function durHuman(sec) {
    for (const [unit, name] of DUR_UNITS) {
      if (sec / unit >= 0.95 || unit === 1) {
        const v = sec / unit;
        const txt = v < 10 && Math.abs(v - Math.round(v)) > 0.05 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US');
        return `${txt} ${name}`;
      }
    }
    return '0 秒';
  }

  function logTicks(lo, hi) {
    const out = [];
    for (let e = Math.ceil(Math.log10(lo) - 1e-9); e <= Math.floor(Math.log10(hi) + 1e-9); e++) out.push(Math.pow(10, e));
    return out;
  }

  // ===========================================================================
  // Scene authoring helpers
  // ===========================================================================
  // Beat progress helper: maps beat b's progress in [a, c] -> eased [0, 1]
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const live = (s) => s.dt > 0 && s.dt < 0.25;

  // Beat progress helper: maps beat b's progress in [a, c] -> eased [0, 1]
  const seg = (s, b, a, c, fn) => {
    const p = (s.p && s.p[b]) || 0;
    return (fn || M.ease.io2)(clamp((p - a) / Math.max(1e-4, c - a), 0, 1));
  };

  // One-shot triggers that survive seek/rewind (used for sound cues)
  function cues() {
    const fired = new Set();
    let prevT = -1;
    let prevBeat = -1;
    return {
      step(s) {
        if (s.t < prevT - 0.05 || s.beat < prevBeat) fired.clear();
        prevT = s.t;
        prevBeat = s.beat;
      },
      fire(key, cond, s, fn) {
        if (!cond) {
          fired.delete(key);
          return;
        }
        if (fired.has(key)) return;
        fired.add(key);
        if (s.dt > 0 && s.dt < 0.25) fn();
      },
      reset() {
        fired.clear();
      },
    };
  }

  const sfx = (ctx, name, opts) => ctx.sfx(name, opts);

  function chrome(ctx, ov, { act = '', light = false } = {}) {
    const a = text(ctx, ov, act, 'act', { x: T.M, y: 62, color: light ? T.dim : T.dim });
    return a;
  }

  function scene(def) {
    const idx = SC.scenes.length;
    def.page =
      def.page ||
      (() => `${String(idx + 1).padStart(2, '0')} / ${String(SC.scenes.length).padStart(2, '0')}`);
    SC.scenes.push(def);
    return def;
  }

  // Damped stage-space pointer
  function mouseStage(ctx) {
    const v = ctx.view;
    const m = ctx.mouse;
    return [v.x0 + (m.x * 0.5 + 0.5) * v.w, v.y0 + (0.5 - m.y * 0.5) * v.h];
  }

  const BUILD = SC.BUILD || { lines: 0, authorLines: 0, bytes: 0 };

  SC.kit = {
    T,
    HDR,
    GLSL_PRE,
    PRESETS,
    BUILD,
    pass,
    bg,
    post,
    vec: createVec,
    text,
    show,
    gate,
    scale,
    fmtInt,
    sup,
    sci,
    durHuman,
    seg,
    lerp3,
    live,
    cues,
    sfx,
    chrome,
    scene,
    mouseStage,
  };
})();
