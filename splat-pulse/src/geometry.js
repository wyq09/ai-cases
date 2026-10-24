(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function randomGenerator(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }

  function lookAt(eye, target, up) {
    const f = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const s = normalize(cross(f, up));
    const u = cross(s, f);
    return new Float32Array([
      s[0], u[0], -f[0], 0,
      s[1], u[1], -f[1], 0,
      s[2], u[2], -f[2], 0,
      -dot(s, eye), -dot(u, eye), dot(f, eye), 1,
    ]);
  }

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
          + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function createGeometry(count = 72000, seed = 73421) {
    const n = Math.max(1024, Math.floor(count));
    const random = randomGenerator(seed);
    const positions = [0, 1, 2].map(() => new Float32Array(n * 4));
    const normals = new Float32Array(n * 4);
    const meta = new Float32Array(n * 4);
    const dustCount = Math.min(1400, Math.floor(n * 0.04));

    for (let i = 0; i < n; i++) {
      const offset = i * 4;
      const r = random();
      const r2 = random();
      const r3 = random();
      const angle = r * TAU;
      const gaussian = Math.sqrt(-2 * Math.log(Math.max(0.0001, r2))) * Math.cos(TAU * r3);
      const dust = i < dustCount;
      let p0;
      let p1;
      let p2;
      let normal;
      let size;

      if (dust) {
        const y = r2 * 2 - 1;
        const circle = Math.sqrt(1 - y * y);
        const radius = 5 + r3 * 8;
        p0 = [Math.cos(angle) * circle * radius, y * radius, Math.sin(angle) * circle * radius];
        p1 = p0.slice();
        p2 = p0.slice();
        normal = normalize(p0);
        size = 0.006 + random() * 0.009;
        meta[offset + 1] = 0.4 + random() * 0.4;
      } else {
        const strand = i % 3;
        const phase = strand * TAU / 3;
        const phi = angle * 3 + phase + gaussian * 0.35;
        const tube = 0.09 + 0.045 * (0.5 + 0.5 * Math.sin(angle * 5 + phase));
        const radius = 1.24 + 0.19 * Math.sin(angle * 3 + phase) + 0.06 * Math.cos(angle * 7);
        const tubeRadius = tube * (0.55 + Math.abs(gaussian) * 0.65);
        const ring = radius + Math.cos(phi) * tubeRadius;
        p0 = [
          Math.cos(angle) * ring,
          Math.sin(angle) * ring * 0.91 + Math.sin(angle * 5) * 0.065,
          Math.sin(angle * 3 + phase) * 0.40 + Math.sin(phi) * tubeRadius,
        ];
        if (random() < 0.03) {
          const spread = 1.12 + random() * 0.30;
          p0 = p0.map((v) => v * spread);
          size = 0.005 + random() * 0.007;
        }
        const waveRadius = 0.32 + Math.sqrt(r2) * 1.75;
        p1 = [
          Math.cos(angle) * waveRadius,
          Math.sin(waveRadius * 6 - angle * 3) * 0.23 + Math.cos(angle * 9) * 0.065 + gaussian * 0.035,
          Math.sin(angle) * waveRadius,
        ];
        const sphereY = r2 * 2 - 1;
        const sphereCircle = Math.sqrt(1 - sphereY * sphereY);
        const sphereRadius = 1.12 + Math.min(Math.abs(gaussian), 3) * 0.055;
        p2 = [
          Math.cos(angle) * sphereCircle * sphereRadius,
          sphereY * sphereRadius * 1.1,
          Math.sin(angle) * sphereCircle * sphereRadius,
        ];
        normal = [Math.cos(phi) * Math.cos(angle), Math.cos(phi) * Math.sin(angle), Math.sin(phi)];
        if (size === undefined) size = 0.0075 + Math.pow(random(), 2) * 0.012;
        meta[offset + 1] = clamp(0.48 + Math.sin(angle * 3 + phase) * 0.30 + (r3 - 0.5) * 0.22, 0, 1);
      }

      for (let form = 0; form < 3; form++) {
        const p = form === 0 ? p0 : form === 1 ? p1 : p2;
        positions[form][offset] = p[0];
        positions[form][offset + 1] = p[1];
        positions[form][offset + 2] = p[2];
        positions[form][offset + 3] = 1;
      }
      normals[offset] = normal[0];
      normals[offset + 1] = normal[1];
      normals[offset + 2] = normal[2];
      normals[offset + 3] = size;
      meta[offset] = random();
      meta[offset + 2] = (angle / TAU * 0.75 + random() * 0.25) % 1;
      meta[offset + 3] = dust ? 1 : 0;
    }
    return { count: n, positions, normals, meta, seed };
  }

  const api = { createGeometry, perspective, lookAt, multiply, normalize, cross, dot, clamp };
  global.PulseGeometry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
