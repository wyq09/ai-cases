(() => {
  'use strict';
  const SC = (window.__SC = window.__SC || {});

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, x) => (a === b ? 0 : (x - a) / (b - a));
  const smoothstep = (a, b, x) => {
    const t = clamp(invLerp(a, b, x), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const ss = smoothstep;
  const damp = (lambda, dt) => 1 - Math.exp(-lambda * Math.max(0, dt));

  const ease = {
    lin: (t) => t,
    in2: (t) => t * t,
    out2: (t) => {
      const u = 1 - t;
      return 1 - u * u;
    },
    io2: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5),
    in3: (t) => t * t * t,
    out3: (t) => {
      const u = 1 - t;
      return 1 - u * u * u;
    },
    io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) * 0.5),
    in4: (t) => t * t * t * t,
    out4: (t) => {
      const u = 1 - t;
      return 1 - u * u * u * u;
    },
    io4: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) * 0.5),
    outBack: (t, s = 1.7) => {
      const u = t - 1;
      return 1 + (s + 1) * u * u * u + s * u * u;
    },
  };

  function rng(seed = 1) {
    let s = (Math.imul(Math.floor(seed) || 1, 2654435761) >>> 0) || 1;
    return () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s >>>= 0;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  function hash(n) {
    let x = Math.imul((n * 1664525 + 1013904223) | 0, 0x27d4eb2d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13;
    return (x >>> 0) / 4294967296;
  }

  function hexToRgb(hex) {
    if (Array.isArray(hex)) {
      return [hex[0] || 0, hex[1] || 0, hex[2] || 0];
    }
    if (typeof hex === 'number') {
      return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
    }
    let s = String(hex || '#ffffff').trim();
    if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) {
      s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    }
    const v = parseInt(s.slice(0, 6), 16);
    if (Number.isNaN(v)) return [1, 1, 1];
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }

  /**
   * Fritsch-Carlson monotone cubic Hermite spline.
   * Each control point is [x, y] or [x, y, explicitSlope].
   */
  function spline(pts) {
    if (!pts || pts.length === 0) return () => 0;
    if (pts.length === 1) {
      const y0 = pts[0][1];
      return () => y0;
    }

    const sorted = pts.slice().sort((a, b) => a[0] - b[0]);
    const n = sorted.length;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const fixed = new Uint8Array(n);
    const m = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      xs[i] = sorted[i][0];
      ys[i] = sorted[i][1];
      if (sorted[i].length >= 3 && typeof sorted[i][2] === 'number' && Number.isFinite(sorted[i][2])) {
        fixed[i] = 1;
        m[i] = sorted[i][2];
      }
    }

    const h = new Float64Array(n - 1);
    const d = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      h[i] = Math.max(1e-9, xs[i + 1] - xs[i]);
      d[i] = (ys[i + 1] - ys[i]) / h[i];
    }

    if (!fixed[0]) m[0] = d[0];
    if (!fixed[n - 1]) m[n - 1] = d[n - 2];

    for (let i = 1; i < n - 1; i++) {
      if (fixed[i]) continue;
      if (d[i - 1] * d[i] <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }

    // Fritsch-Carlson monotonicity adjustment on non-fixed tangents
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(d[i]) < 1e-12) {
        if (!fixed[i]) m[i] = 0;
        if (!fixed[i + 1]) m[i + 1] = 0;
      } else {
        const a = m[i] / d[i];
        const b = m[i + 1] / d[i];
        const s2 = a * a + b * b;
        if (s2 > 9) {
          const tau = 3 / Math.sqrt(s2);
          if (!fixed[i]) m[i] = tau * a * d[i];
          if (!fixed[i + 1]) m[i + 1] = tau * b * d[i];
        }
      }
    }

    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let lo = 0;
      let hi = n - 2;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (x < xs[mid]) hi = mid - 1;
        else if (x > xs[mid + 1]) lo = mid + 1;
        else {
          lo = mid;
          break;
        }
      }
      const i = clamp(lo, 0, n - 2);
      const hiLen = h[i];
      const t = (x - xs[i]) / hiLen;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      return h00 * ys[i] + h10 * hiLen * m[i] + h01 * ys[i + 1] + h11 * hiLen * m[i + 1];
    };
  }

  const GLSL_HASH = `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash21(float p){
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash33(vec3 p3){
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
`;

  const GLSL_NOISE =
    GLSL_HASH +
    `
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(
      mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}
float fbm(vec2 p){
  float a = 0.5;
  float s = 0.0;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i = 0; i < 5; i++){
    s += a * vnoise(p);
    p = m * p * 2.03;
    a *= 0.5;
  }
  return s;
}
float fbm(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for(int i = 0; i < 5; i++){
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
vec2 worley2(vec2 p){
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 9.0;
  float d2 = 9.0;
  for(int j = -1; j <= 1; j++){
    for(int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 o2 = 0.15 + 0.7 * hash22(n + g);
      vec2 r = g + o2 - f;
      float d = dot(r, r);
      if(d < d1){
        d2 = d1;
        d1 = d;
      } else if(d < d2){
        d2 = d;
      }
    }
  }
  return sqrt(vec2(d1, d2));
}
float worley(vec2 p){
  vec2 d = worley2(p);
  return d.y - d.x;
}
`;

  const GLSL_COLOR = `
vec3 toLin(vec3 c){
  c = max(c, 0.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 toSrgb(vec3 c){
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float luma(vec3 c){
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
vec3 blackbody(float t){
  t = max(t, 1001.0) / 100.0;
  vec3 c;
  c.r = t < 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
  c.g = t < 66.0 ? clamp(0.3900816 * log(t) - 0.6318414, 0.0, 1.0) : clamp(1.129891 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432068 * log(t - 10.0) - 1.196254, 0.0, 1.0));
  return c;
}
`;

  SC.math = {
    clamp,
    lerp,
    smoothstep,
    ss,
    invLerp,
    damp,
    ease,
    rng,
    hash,
    hexToRgb,
    spline,
    GLSL_HASH,
    GLSL_NOISE,
    GLSL_COLOR,
  };
})();
