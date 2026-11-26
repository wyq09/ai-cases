(() => {
  'use strict';
  const SC = (window.__SC = window.__SC || {});
  const M = SC.math;

  // Every transition is a pure function of p ∈ [0, 1] so it runs equally forwards and backwards.
  const PRE =
    M.GLSL_NOISE +
    M.GLSL_COLOR +
    `
uniform sampler2D tA, tB;
uniform vec4 uView;
uniform vec2 uAnchor;
uniform float uP;
vec2 stage(){ return vec2(uView.x + vUv.x * uView.z, uView.y + (1.0 - vUv.y) * uView.w); }
vec2 anchorUv(){ return (uAnchor - uView.xy) / uView.zw; }
float cornerDist(){
  vec2 c0 = uView.xy;
  vec2 c1 = uView.xy + uView.zw;
  return max(
    max(length(c0 - uAnchor), length(c1 - uAnchor)),
    max(length(vec2(c0.x, c1.y) - uAnchor), length(vec2(c1.x, c0.y) - uAnchor))
  );
}
vec3 blurS(sampler2D t, vec2 uv, float r){
  vec3 c = vec3(0.0);
  float w = 0.0;
  vec2 px = 1.0 / uRes;
  for (int i = 0; i < 12; i++) {
    float f = (float(i) + 0.5) / 12.0;
    float rr = sqrt(f) * r;
    float th = float(i) * 2.3999632;
    float g = exp(-2.2 * f);
    c += toLin(texture(t, uv + vec2(cos(th), sin(th)) * rr * px).rgb) * g;
    w += g;
  }
  return c / w;
}
`;

  function anchorOf(ctx, b, sb) {
    let raw = null;
    try {
      raw = b && b.inst && b.inst.anchor ? b.inst.anchor(sb) : null;
    } catch {
      raw = null;
    }
    const v = ctx.view;
    const x = raw && Number.isFinite(raw.x) ? raw.x : v.x0 + v.w * 0.5;
    const y = raw && Number.isFinite(raw.y) ? raw.y : v.y0 + v.h * 0.5;
    return [x, y];
  }

  function mk(ctx, body, extra = {}) {
    const u = {
      tA: null,
      tB: null,
      uView: { value: new ctx.THREE.Vector4(0, 0, 1920, 1080) },
      uAnchor: { value: new ctx.THREE.Vector2(960, 540) },
      uP: 0,
      ...extra,
    };
    const p = ctx.gfx.pass(PRE + body, u);
    const v = ctx.view;
    return {
      u: p.u,
      render({ A, B, p: prog, out, b, sb, time }) {
        if (prog <= 0) {
          ctx.gfx.copy(A, out);
          return;
        }
        if (prog >= 1) {
          ctx.gfx.copy(B, out);
          return;
        }
        p.u.tA.value = A.texture;
        p.u.tB.value = B.texture;
        p.u.uP.value = prog;
        p.u.uTime.value = time || 0;
        p.u.uView.value.set(v.x0, v.y0, v.w, v.h);
        const an = anchorOf(ctx, b, sb);
        p.u.uAnchor.value.set(an[0], an[1]);
        p.render(out);
      },
    };
  }

  const tr = (dur, body, extra) => ({ dur, create: (ctx) => mk(ctx, body, extra) });

  // ---------------------------------------------------------------------------
  // FADE — linear-light dissolve with a slight dip through black
  // ---------------------------------------------------------------------------
  const fade = tr(
    0.8,
    `
void main(){
  float k = uP * uP * (3.0 - 2.0 * uP);
  vec3 a = toLin(texture(tA, vUv).rgb);
  vec3 b = toLin(texture(tB, vUv).rgb);
  float dip = sin(k * 3.14159265) * 0.22;
  o = vec4(toSrgb(mix(a, b, k) * (1.0 - dip)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // PLOT — a pen draws a rule across the frame; everything behind it is already the next slide
  // ---------------------------------------------------------------------------
  const plot = tr(
    1.7,
    `
void main(){
  vec2 s = stage();
  float e = uP * uP * (3.0 - 2.0 * uP);
  float head = mix(uView.x - 160.0, uView.x + uView.z + 160.0, e);
  float d = s.x - head;
  float env = sin(uP * 3.14159265);
  float bump = exp(-d * d / 16200.0) * env;
  float dy = bump * 22.0 / uView.w;
  vec3 a = toLin(texture(tA, vec2(vUv.x, clamp(vUv.y + dy, 0.0, 1.0))).rgb);
  vec3 b = toLin(texture(tB, vec2(vUv.x, clamp(vUv.y - dy, 0.0, 1.0))).rgb);
  float k = smoothstep(26.0, -26.0, d);
  vec3 c = mix(a, b, k);
  vec3 ember = vec3(1.0, 0.26, 0.08);
  float lr = abs(s.y - uAnchor.y);
  float lx = step(s.x, head) * step(uView.x - 160.0, s.x);
  c += ember * exp(-lr / 1.6) * lx * env * 1.4;
  c += ember * exp(-lr / 14.0) * lx * env * 0.22;
  float hd = length(s - vec2(head, uAnchor.y));
  c += vec3(3.2, 2.2, 1.5) * exp(-hd * hd / 260.0) * env;
  c += ember * exp(-hd / 60.0) * env * 0.8;
  o = vec4(toSrgb(max(c, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // BURN — an ember front eats outward from a point; the old frame chars as it goes
  // ---------------------------------------------------------------------------
  const burn = tr(
    2.0,
    `
void main(){
  vec2 s = stage();
  float e = smoothstep(0.0, 1.0, uP);
  vec2 rel = (s - uAnchor) / 1080.0;
  float n = fbm(s * 0.0045 + vec2(3.1, 7.7));
  float dist = length(rel * vec2(1.0, 0.82));
  float field = dist * 0.72 + (n - 0.5) * 0.55;
  float thr = mix(-0.42, 1.28, e);
  float band = 0.085;
  float burned = smoothstep(thr, thr - band, field);
  float front = exp(-abs(field - thr) / (band * 0.55)) * (1.0 - smoothstep(0.9, 1.0, uP));
  vec2 dir = rel / max(length(rel), 1e-3);
  vec2 duv = dir * front * 10.0 / uView.zw;
  vec3 a = toLin(texture(tA, vUv + duv).rgb);
  vec3 b = toLin(texture(tB, vUv).rgb);
  a *= mix(1.0, 0.22, smoothstep(thr + band * 1.6, thr + band * 0.4, field));
  vec3 c = mix(a, b, burned);
  vec3 fire = mix(vec3(1.0, 0.16, 0.03), vec3(1.0, 0.62, 0.2), n);
  c += fire * front * 2.2;
  o = vec4(toSrgb(max(c, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // DROP — the old frame loses its footing and falls; the next was underneath all along
  // ---------------------------------------------------------------------------
  const drop = tr(
    1.5,
    `
void main(){
  float e = uP;
  float fall = e * e * 1.25;
  vec2 uvA = vec2(vUv.x, vUv.y + fall);
  vec3 a = vec3(0.0);
  float blur = clamp(fall * 0.06, 0.0, 0.035);
  for (int i = 0; i < 5; i++) {
    float f = (float(i) - 2.0) / 2.0;
    a += toLin(texture(tA, uvA + vec2(0.0, f * blur)).rgb);
  }
  a /= 5.0;
  float settle = smoothstep(0.0, 0.85, e);
  vec2 uvB = vec2(0.5) + (vUv - 0.5) / mix(1.06, 1.0, settle);
  vec3 b = vec3(0.0);
  float bb = (1.0 - settle) * 0.012;
  for (int i = 0; i < 5; i++) {
    float f = (float(i) - 2.0) / 2.0;
    b += toLin(texture(tB, uvB + vec2(f * bb, f * bb * 0.6)).rgb);
  }
  b /= 5.0;
  float inA = step(uvA.y, 1.0);
  vec3 col = mix(b, a, inA);
  vec2 s = stage();
  float edgeY = uView.y + fall * uView.w;
  float edge = exp(-abs(s.y - edgeY) / 2.0) * (1.0 - smoothstep(0.85, 1.0, e));
  col += vec3(1.0, 0.28, 0.08) * edge * 2.0;
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // STRETCH — anamorphic smear: the old frame is pulled sideways into light streaks
  // ---------------------------------------------------------------------------
  const stretch = tr(
    1.7,
    `
void main(){
  float e = uP;
  float cx = anchorUv().x;
  float S = 1.0 + 240.0 * e * e * e;
  vec3 a = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float f = (float(i) - 4.0) / 4.0;
    a += toLin(texture(tA, vec2(cx + (vUv.x - cx) / S + f * 0.004 * min(S, 8.0), vUv.y)).rgb);
  }
  a /= 9.0;
  float hw = smoothstep(0.0, 1.0, e) * 0.78;
  float dxu = abs(vUv.x - cx);
  float inB = 1.0 - smoothstep(hw - 0.012, hw + 0.012, dxu);
  vec3 b = toLin(texture(tB, vUv).rgb);
  a *= (1.0 + 2.5 * e) * (1.0 - smoothstep(0.7, 1.0, e));
  vec3 col = mix(a, b, inB);
  float edge = exp(-abs(dxu - hw) / 0.006) * sin(clamp(e, 0.0, 1.0) * 3.14159265);
  col += vec3(1.0, 0.3, 0.1) * edge * 1.8;
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // RING — a ring of fire closes the loop outward from the anchor
  // ---------------------------------------------------------------------------
  const ring = tr(
    1.9,
    `
void main(){
  vec2 s = stage();
  float e = uP * uP * (3.0 - 2.0 * uP);
  vec2 d = s - uAnchor;
  float dist = length(d);
  float R = e * (cornerDist() + 60.0);
  float nd = (dist - R) / 3.0;
  float inside = smoothstep(1.0, -1.0, nd);
  vec2 dir = d / max(dist, 1e-3);
  float lens = exp(-nd * nd * 0.25) * 26.0;
  vec3 a = toLin(texture(tA, vUv + dir * lens / uView.zw).rgb);
  vec2 c = anchorUv();
  vec2 uvB = c + (vUv - c) / mix(1.05, 1.0, e);
  vec3 b = toLin(texture(tB, uvB).rgb);
  vec3 col = mix(a, b, inside);
  float ringLine = exp(-abs(nd) * 1.4);
  float halo = exp(-abs(nd) * 0.12);
  col += vec3(1.0, 0.3, 0.1) * ringLine * 2.4 + vec3(1.0, 0.2, 0.06) * halo * 0.35;
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // REWIND — the archive spools backwards: frames flick past with tears, dust and flicker
  // ---------------------------------------------------------------------------
  const rewind = tr(
    1.7,
    `
void main(){
  float e = uP * uP * (3.0 - 2.0 * uP);
  float roll = e * 3.0;
  float y = vUv.y + roll;
  float tile = floor(y);
  float fy = fract(y);
  float isB = mod(tile, 2.0);
  float line = floor(vUv.y * uRes.y);
  float jit = (hash12(vec2(line, floor(uTime * 60.0))) - 0.5) * 0.05 * sin(uP * 3.14159265);
  float tear = step(0.985, hash12(vec2(floor(y * 6.0), floor(uTime * 24.0)))) * 0.12;
  vec2 uv = vec2(vUv.x + jit + tear, fy);
  vec3 a = toLin(texture(tA, uv).rgb);
  vec3 b = toLin(texture(tB, uv).rgb);
  vec3 col = mix(a, b, isB);
  col *= 0.62 + 0.55 * hash12(vec2(tile, 7.0));
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 977.0);
  col += (g - 0.5) * 0.07 * sin(uP * 3.14159265);
  float fl = smoothstep(0.0, 0.012, fy) * smoothstep(1.0, 0.988, fy);
  col *= mix(0.15, 1.0, fl);
  col = mix(col, toLin(texture(tB, vUv).rgb), smoothstep(0.86, 1.0, uP));
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // ZENO — the old frame halves toward the right edge; each halving arrives twice as fast
  // ---------------------------------------------------------------------------
  const zeno = tr(
    2.2,
    `
void main(){
  float N = 9.0;
  float n = min(N, -log2(max(1.0 - uP * (1.0 - pow(2.0, -N)), 1e-6)));
  float sx = pow(2.0, -n);
  float stripPx = max(1.0, sx * uRes.x);
  float xs = 1.0 - (1.0 - vUv.x) / sx;
  float win = min(1.0, 1.0 / stripPx);
  vec3 a = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float f = (float(i) + 0.5) / 8.0 - 0.5;
    a += toLin(texture(tA, vec2(clamp(xs + f * win, 0.0, 1.0), vUv.y)).rgb);
  }
  a /= 8.0;
  vec3 b = toLin(texture(tB, vUv).rgb);
  float gain = pow(1.0 / sx, 0.55);
  a = min(a * gain, vec3(6.0));
  float inA = step(0.0, xs);
  vec3 col = mix(b, a, inA);
  float ex = 1.0 - sx;
  float edge = exp(-abs(vUv.x - ex) / 0.004) * smoothstep(0.0, 0.15, uP);
  col += vec3(1.0, 0.4, 0.14) * edge * 1.6;
  col += vec3(4.0) * smoothstep(0.9, 1.0, uP) * exp(-(1.0 - vUv.x) * 60.0);
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // SHOCKWAVE — a blast ring lenses the old frame apart and leaves the next behind
  // ---------------------------------------------------------------------------
  const shockwave = tr(
    1.6,
    `
void main(){
  vec2 s = stage();
  float e = uP;
  vec2 d = s - uAnchor;
  float dist = length(d);
  float R = (1.0 - pow(1.0 - e, 3.0)) * (cornerDist() + 80.0);
  float w = 150.0;
  float wave = exp(-((dist - R) * (dist - R)) / (2.0 * w * w)) * (1.0 - smoothstep(0.75, 1.0, e));
  vec2 off = (d / max(dist, 1e-3)) * wave * 46.0 / uView.zw;
  vec3 a;
  a.r = toLin(texture(tA, vUv + off * 1.08).rgb).r;
  a.g = toLin(texture(tA, vUv + off).rgb).g;
  a.b = toLin(texture(tA, vUv + off * 0.92).rgb).b;
  vec3 b = toLin(texture(tB, vUv + off * 0.5).rgb);
  float inside = smoothstep(14.0, -14.0, dist - R);
  vec3 col = mix(a, b, inside);
  col += vec3(1.0, 0.34, 0.12) * wave * 1.5;
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // ZOOM — scale-space dissolve: one frame collapses to a point, the next resolves out of blur
  // ---------------------------------------------------------------------------
  const zoom = tr(
    2.0,
    `
void main(){
  float e = uP;
  float sA = pow(2.0, -7.0 * e);
  float sB = pow(2.0, 7.0 * (1.0 - e));
  vec2 c = anchorUv();
  vec2 uvA = c + (vUv - c) / sA;
  vec2 uvB = c + (vUv - c) / sB;
  float rA = min(40.0, 3.6 * (-log2(sA)));
  float rB = min(40.0, 3.6 * log2(sB));
  vec3 a = rA > 0.5 ? blurS(tA, clamp(uvA, vec2(-0.5), vec2(1.5)), rA) : toLin(texture(tA, uvA).rgb);
  vec3 b = rB > 0.5 ? blurS(tB, uvB, rB) : toLin(texture(tB, uvB).rgb);
  float m = smoothstep(0.2, 0.8, e);
  vec3 col = mix(a, b, m);
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // OVEREXPOSE — the frame blows out to pure white, then the next develops out of the light
  // ---------------------------------------------------------------------------
  const overexpose = tr(
    2.4,
    `
void main(){
  float e = uP;
  float up = smoothstep(0.0, 0.46, e);
  float down = smoothstep(0.56, 1.0, e);
  vec3 a = toLin(texture(tA, vUv).rgb);
  vec3 ab = up > 0.001 ? blurS(tA, vUv, up * 0.02 * uRes.y) : a;
  vec3 hot = ab * (1.0 + 40.0 * up * up) + vec3(1.0, 0.86, 0.7) * up * up * 2.5;
  hot = min(hot, vec3(1.0));
  vec3 b = toLin(texture(tB, vUv).rgb);
  float n = fbm(stage() * 0.006 + 7.0);
  float rev = smoothstep(0.0, 1.0, down * 1.3 - n * 0.3);
  vec3 col = mix(hot, vec3(1.0), smoothstep(0.3, 0.46, e));
  col = mix(col, b, rev);
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  // ---------------------------------------------------------------------------
  // HALFTONE — the old frame breaks into a dot screen that shrinks away
  // ---------------------------------------------------------------------------
  const halftone = tr(
    1.9,
    `
void main(){
  vec2 s = stage();
  float e = uP;
  float cell = mix(16.0, 7.0, e);
  vec2 id = floor(s / cell);
  vec2 f = fract(s / cell) - 0.5;
  vec2 uvC = ((id + 0.5) * cell - uView.xy) / uView.zw;
  vec3 a = toLin(texture(tA, uvC).rgb);
  float r = sqrt(clamp(luma(a), 0.0, 1.0)) * 0.5 * (1.0 - smoothstep(0.0, 0.95, e));
  float d = length(f);
  float aa = 1.5 / cell;
  float dot_ = r > 0.0 ? 1.0 - smoothstep(r - aa, r + aa, d) : 0.0;
  vec3 b = toLin(texture(tB, vUv).rgb);
  vec3 col = mix(b, a, dot_);
  col += vec3(1.0, 0.3, 0.1) * exp(-abs(d - r) * cell * 0.8) * r * 0.9 * (1.0 - smoothstep(0.7, 1.0, e));
  o = vec4(toSrgb(max(col, 0.0)), 1.0);
}`
  );

  const transitions = { fade, plot, burn, drop, stretch, ring, rewind, zeno, shockwave, zoom, overexpose, halftone };
  SC.transitions = transitions;
})();
