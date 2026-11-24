import {
  clamp,
  lerp,
  v3Sub,
  v3Cross,
  v3Norm,
  v3Len,
  m4Identity,
  m4TransformPoint,
  m4NormalMat3,
  mulberry32,
} from './math3d.js';
import {
  TERRAIN_EXTENT,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainColorFactor,
} from './terrain.js';

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
  }

  vertexCount() {
    return this.pos.length / 3;
  }

  pushVertex(px, py, pz, nx, ny, nz, r, g, b, u = 0, v = 0) {
    const id = this.pos.length / 3;
    this.pos.push(px, py, pz);
    this.norm.push(nx, ny, nz);
    this.col.push(r, g, b);
    this.uv.push(u, v);
    return id;
  }

  pushTri(a, b, c) {
    this.idx.push(a, b, c);
  }

  addTransformed(subBuilder, mat) {
    const base = this.vertexCount();
    const nMat = m4NormalMat3(mat);
    const pArr = subBuilder.pos;
    const nArr = subBuilder.norm;
    const cArr = subBuilder.col;
    const uArr = subBuilder.uv;
    for (let i = 0; i < pArr.length; i += 3) {
      const p = m4TransformPoint(mat, [pArr[i], pArr[i + 1], pArr[i + 2]]);
      const nx = nArr[i], ny = nArr[i + 1], nz = nArr[i + 2];
      const tnx = nMat[0] * nx + nMat[3] * ny + nMat[6] * nz;
      const tny = nMat[1] * nx + nMat[4] * ny + nMat[7] * nz;
      const tnz = nMat[2] * nx + nMat[5] * ny + nMat[8] * nz;
      const n = v3Norm([tnx, tny, tnz]);
      this.pos.push(p[0], p[1], p[2]);
      this.norm.push(n[0], n[1], n[2]);
      this.col.push(cArr[i], cArr[i + 1], cArr[i + 2]);
      const ui = (i / 3) * 2;
      this.uv.push(uArr[ui], uArr[ui + 1]);
    }
    const iArr = subBuilder.idx;
    for (let i = 0; i < iArr.length; i++) {
      this.idx.push(base + iArr[i]);
    }
  }

  addEllipsoid(cx, cy, cz, rx, ry, rz, color, segU = 18, segV = 12, mat = null) {
    const sub = mat ? new MeshBuilder() : this;
    const base = sub.vertexCount();
    const [cr, cg, cb] = color;

    for (let iv = 0; iv <= segV; iv++) {
      const vFrac = iv / segV;
      const phi = vFrac * Math.PI;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      for (let iu = 0; iu <= segU; iu++) {
        const uFrac = iu / segU;
        const theta = uFrac * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const lx = sinP * cosT;
        const ly = cosP;
        const lz = sinP * sinT;
        const n = v3Norm([lx / (rx || 1), ly / (ry || 1), lz / (rz || 1)]);
        sub.pushVertex(cx + lx * rx, cy + ly * ry, cz + lz * rz, n[0], n[1], n[2], cr, cg, cb, uFrac, vFrac);
      }
    }

    const stride = segU + 1;
    for (let iv = 0; iv < segV; iv++) {
      for (let iu = 0; iu < segU; iu++) {
        const v00 = base + iv * stride + iu;
        const v10 = base + (iv + 1) * stride + iu;
        const v01 = v00 + 1;
        const v11 = v10 + 1;
        sub.pushTri(v00, v01, v10);
        sub.pushTri(v01, v11, v10);
      }
    }

    if (mat) this.addTransformed(sub, mat);
  }

  addTubeSegment(a, b, rA, rB, color, segs = 12, capA = true, capB = true) {
    const axis = v3Sub(b, a);
    const len = v3Len(axis);
    if (len < 1e-6) return;
    const dir = [axis[0] / len, axis[1] / len, axis[2] / len];
    const ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const uVec = v3Norm(v3Cross(ref, dir));
    const vVec = v3Cross(dir, uVec);
    const [cr, cg, cb] = color;

    const ringA = [];
    const ringB = [];
    const dr = rA - rB;
    const slopeNormFactor = 1 / Math.hypot(len, dr);
    const radialScale = len * slopeNormFactor;
    const axialScale = dr * slopeNormFactor;

    for (let k = 0; k <= segs; k++) {
      const t = (k / segs) * Math.PI * 2;
      const ct = Math.cos(t);
      const st = Math.sin(t);
      const rx = ct * uVec[0] + st * vVec[0];
      const ry = ct * uVec[1] + st * vVec[1];
      const rz = ct * uVec[2] + st * vVec[2];

      const nx = rx * radialScale + dir[0] * axialScale;
      const ny = ry * radialScale + dir[1] * axialScale;
      const nz = rz * radialScale + dir[2] * axialScale;
      const n = v3Norm([nx, ny, nz]);

      ringA.push(this.pushVertex(a[0] + rx * rA, a[1] + ry * rA, a[2] + rz * rA, n[0], n[1], n[2], cr, cg, cb, k / segs, 0));
      ringB.push(this.pushVertex(b[0] + rx * rB, b[1] + ry * rB, b[2] + rz * rB, n[0], n[1], n[2], cr, cg, cb, k / segs, 1));
    }

    for (let k = 0; k < segs; k++) {
      const a0 = ringA[k], a1 = ringA[k + 1];
      const b0 = ringB[k], b1 = ringB[k + 1];
      this.pushTri(a0, a1, b0);
      this.pushTri(a1, b1, b0);
    }

    if (capA && rA > 1e-5) {
      const ca = this.pushVertex(a[0], a[1], a[2], -dir[0], -dir[1], -dir[2], cr, cg, cb, 0.5, 0.5);
      const capVerts = [];
      for (let k = 0; k <= segs; k++) {
        const t = (k / segs) * Math.PI * 2;
        const rx = Math.cos(t) * uVec[0] + Math.sin(t) * vVec[0];
        const ry = Math.cos(t) * uVec[1] + Math.sin(t) * vVec[1];
        const rz = Math.cos(t) * uVec[2] + Math.sin(t) * vVec[2];
        capVerts.push(this.pushVertex(a[0] + rx * rA, a[1] + ry * rA, a[2] + rz * rA, -dir[0], -dir[1], -dir[2], cr, cg, cb, 0, 0));
      }
      for (let k = 0; k < segs; k++) {
        this.pushTri(ca, capVerts[k + 1], capVerts[k]);
      }
    }

    if (capB && rB > 1e-5) {
      const cbIdx = this.pushVertex(b[0], b[1], b[2], dir[0], dir[1], dir[2], cr, cg, cb, 0.5, 0.5);
      const capVerts = [];
      for (let k = 0; k <= segs; k++) {
        const t = (k / segs) * Math.PI * 2;
        const rx = Math.cos(t) * uVec[0] + Math.sin(t) * vVec[0];
        const ry = Math.cos(t) * uVec[1] + Math.sin(t) * vVec[1];
        const rz = Math.cos(t) * uVec[2] + Math.sin(t) * vVec[2];
        capVerts.push(this.pushVertex(b[0] + rx * rB, b[1] + ry * rB, b[2] + rz * rB, dir[0], dir[1], dir[2], cr, cg, cb, 0, 0));
      }
      for (let k = 0; k < segs; k++) {
        this.pushTri(cbIdx, capVerts[k], capVerts[k + 1]);
      }
    }
  }

  addBox(cx, cy, cz, sx, sy, sz, color, mat = null) {
    const sub = mat ? new MeshBuilder() : this;
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const [cr, cg, cb] = color;
    const faces = [
      // +X
      [[1, 0, 0], [cx + hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz]],
      // -X
      [[-1, 0, 0], [cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz], [cx - hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz - hz]],
      // +Y
      [[0, 1, 0], [cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz]],
      // -Y
      [[0, -1, 0], [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz]],
      // +Z
      [[0, 0, 1], [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]],
      // -Z
      [[0, 0, -1], [cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz]],
    ];

    for (let f = 0; f < faces.length; f++) {
      const [n, p0, p1, p2, p3] = faces[f];
      const i0 = sub.pushVertex(p0[0], p0[1], p0[2], n[0], n[1], n[2], cr, cg, cb, 0, 0);
      const i1 = sub.pushVertex(p1[0], p1[1], p1[2], n[0], n[1], n[2], cr, cg, cb, 1, 0);
      const i2 = sub.pushVertex(p2[0], p2[1], p2[2], n[0], n[1], n[2], cr, cg, cb, 1, 1);
      const i3 = sub.pushVertex(p3[0], p3[1], p3[2], n[0], n[1], n[2], cr, cg, cb, 0, 1);
      sub.pushTri(i0, i1, i2);
      sub.pushTri(i0, i2, i3);
    }

    if (mat) this.addTransformed(sub, mat);
  }

  // Torus around X axis (for bicycle wheels lying in YZ plane)
  addTorusX(cx, cy, cz, majorR, minorR, color, segMajor = 32, segMinor = 12) {
    const base = this.vertexCount();
    const [cr, cg, cb] = color;

    for (let i = 0; i <= segMajor; i++) {
      const u = (i / segMajor) * Math.PI * 2;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      for (let j = 0; j <= segMinor; j++) {
        const v = (j / segMinor) * Math.PI * 2;
        const cv = Math.cos(v);
        const sv = Math.sin(v);

        const rRing = majorR + minorR * cv;
        const px = cx + minorR * sv;
        const py = cy + rRing * cu;
        const pz = cz + rRing * su;

        const nx = sv;
        const ny = cv * cu;
        const nz = cv * su;
        const n = v3Norm([nx, ny, nz]);
        this.pushVertex(px, py, pz, n[0], n[1], n[2], cr, cg, cb, i / segMajor, j / segMinor);
      }
    }

    const stride = segMinor + 1;
    for (let i = 0; i < segMajor; i++) {
      for (let j = 0; j < segMinor; j++) {
        const v00 = base + i * stride + j;
        const v10 = base + (i + 1) * stride + j;
        const v01 = v00 + 1;
        const v11 = v10 + 1;
        // Outward CCW check: along +i (du) ~ -Z/+Y tangent, along +j (dv) around tube -> du x dv points inward, so reverse:
        this.pushTri(v00, v10, v01);
        this.pushTri(v01, v10, v11);
      }
    }
  }

  // Torus around Y axis (for horizontal rings like beacon halo)
  addTorusY(cx, cy, cz, majorR, minorR, color, segMajor = 28, segMinor = 10) {
    const base = this.vertexCount();
    const [cr, cg, cb] = color;

    for (let i = 0; i <= segMajor; i++) {
      const u = (i / segMajor) * Math.PI * 2;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      for (let j = 0; j <= segMinor; j++) {
        const v = (j / segMinor) * Math.PI * 2;
        const cv = Math.cos(v);
        const sv = Math.sin(v);

        const rRing = majorR + minorR * cv;
        const px = cx + rRing * cu;
        const py = cy + minorR * sv;
        const pz = cz + rRing * su;

        const nx = cv * cu;
        const ny = sv;
        const nz = cv * su;
        const n = v3Norm([nx, ny, nz]);
        this.pushVertex(px, py, pz, n[0], n[1], n[2], cr, cg, cb, i / segMajor, j / segMinor);
      }
    }

    const stride = segMinor + 1;
    for (let i = 0; i < segMajor; i++) {
      for (let j = 0; j < segMinor; j++) {
        const v00 = base + i * stride + j;
        const v10 = base + (i + 1) * stride + j;
        const v01 = v00 + 1;
        const v11 = v10 + 1;
        this.pushTri(v00, v01, v10);
        this.pushTri(v01, v11, v10);
      }
    }
  }

  build() {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.norm),
      colors: new Float32Array(this.col),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
    };
  }
}

export function buildTerrainMesh(gridN = 172) {
  const mb = new MeshBuilder();
  const half = TERRAIN_EXTENT;
  const step = (half * 2) / gridN;

  for (let iz = 0; iz <= gridN; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix <= gridN; ix++) {
      const x = -half + ix * step;
      const y = getTerrainHeight(x, z);
      const n = getTerrainNormal(x, z);
      const cf = getTerrainColorFactor(x, z);
      // Authentic lunar regolith palette (basalt dark grey to brighter highland/ejecta dust)
      const baseShade = lerp(0.32, 0.64, cf);
      const r = baseShade * 1.01;
      const g = baseShade * 1.0;
      const b = baseShade * 0.985;
      mb.pushVertex(x, y, z, n[0], n[1], n[2], r, g, b, ix / gridN, iz / gridN);
    }
  }

  const stride = gridN + 1;
  for (let iz = 0; iz < gridN; iz++) {
    for (let ix = 0; ix < gridN; ix++) {
      const v00 = iz * stride + ix;
      const v10 = v00 + 1;
      const v01 = (iz + 1) * stride + ix;
      const v11 = v01 + 1;
      mb.pushTri(v00, v01, v10);
      mb.pushTri(v01, v11, v10);
    }
  }
  return mb.build();
}

export function buildBikeFrameMesh() {
  const mb = new MeshBuilder();
  const titanium = [0.76, 0.79, 0.84];
  const darkMetal = [0.22, 0.25, 0.3];
  const accentOrange = [0.95, 0.44, 0.14];
  const saddleCol = [0.16, 0.17, 0.2];
  const tailRed = [0.95, 0.16, 0.12];

  const rearAxleL = [0.065, 0, -0.59];
  const rearAxleR = [-0.065, 0, -0.59];
  const bb = [0, -0.04, -0.14];
  const seatTop = [0, 0.44, -0.31];
  const saddleBase = [0, 0.53, -0.34];
  const headBot = [0, 0.34, 0.42];
  const headTop = [0, 0.52, 0.36];

  // Main diamond frame tubes
  mb.addTubeSegment(bb, seatTop, 0.024, 0.022, titanium, 12);
  mb.addTubeSegment(bb, headBot, 0.028, 0.026, titanium, 12);
  mb.addTubeSegment(seatTop, headTop, 0.022, 0.022, titanium, 12);
  mb.addTubeSegment(headBot, headTop, 0.032, 0.032, accentOrange, 14);
  // Orange stripe cuff on down tube
  mb.addTubeSegment([0, 0.12, 0.10], [0, 0.21, 0.22], 0.030, 0.030, accentOrange, 12);

  // Rear stays (left & right)
  mb.addTubeSegment([0.04, -0.04, -0.14], rearAxleL, 0.015, 0.012, titanium, 8);
  mb.addTubeSegment([-0.04, -0.04, -0.14], rearAxleR, 0.015, 0.012, titanium, 8);
  mb.addTubeSegment([0.025, 0.40, -0.30], rearAxleL, 0.013, 0.011, titanium, 8);
  mb.addTubeSegment([-0.025, 0.40, -0.30], rearAxleR, 0.013, 0.011, titanium, 8);

  // Seatpost + saddle
  mb.addTubeSegment(seatTop, saddleBase, 0.016, 0.015, darkMetal, 10);
  mb.addEllipsoid(0, 0.55, -0.35, 0.085, 0.026, 0.135, saddleCol, 14, 10);

  // Rear lunar battery rack & tail LED
  mb.addTubeSegment([0.04, 0.36, -0.32], [0.05, 0.37, -0.62], 0.011, 0.011, darkMetal, 8);
  mb.addTubeSegment([-0.04, 0.36, -0.32], [-0.05, 0.37, -0.62], 0.011, 0.011, darkMetal, 8);
  mb.addBox(0, 0.40, -0.50, 0.13, 0.06, 0.22, [0.25, 0.28, 0.34]);
  mb.addBox(0, 0.40, -0.62, 0.07, 0.035, 0.03, tailRed);

  // Bottom bracket shell & chain spans (right side -X)
  mb.addTubeSegment([-0.07, -0.04, -0.14], [0.07, -0.04, -0.14], 0.032, 0.032, darkMetal, 12);
  mb.addTubeSegment([-0.055, 0.04, -0.14], [-0.045, 0.055, -0.59], 0.007, 0.007, darkMetal, 6);
  mb.addTubeSegment([-0.055, -0.12, -0.14], [-0.045, -0.055, -0.59], 0.007, 0.007, darkMetal, 6);

  return mb.build();
}

export function buildBikeForkMesh() {
  const mb = new MeshBuilder();
  const goldStanchion = [0.92, 0.72, 0.26];
  const darkSlider = [0.20, 0.23, 0.28];
  const barMetal = [0.76, 0.80, 0.85];
  const gripRubber = [0.14, 0.15, 0.18];
  const lampGlow = [1.0, 0.96, 0.84];

  // Fork local origin at headTube center (0, 0.43, 0.39)
  // Crown sits around (0, -0.12, 0.04), front axle sits at (0, -0.43, 0.20)
  const crownL = [0.065, -0.11, 0.04];
  const crownR = [-0.065, -0.11, 0.04];
  const midL = [0.065, -0.25, 0.105];
  const midR = [-0.065, -0.25, 0.105];
  const tipL = [0.065, -0.43, 0.20];
  const tipR = [-0.065, -0.43, 0.20];

  mb.addTubeSegment([0, -0.08, 0.025], crownL, 0.018, 0.016, darkSlider, 10);
  mb.addTubeSegment([0, -0.08, 0.025], crownR, 0.018, 0.016, darkSlider, 10);
  mb.addTubeSegment(crownL, midL, 0.017, 0.017, goldStanchion, 10);
  mb.addTubeSegment(crownR, midR, 0.017, 0.017, goldStanchion, 10);
  mb.addTubeSegment(midL, tipL, 0.020, 0.015, darkSlider, 10);
  mb.addTubeSegment(midR, tipR, 0.020, 0.015, darkSlider, 10);

  // Stem & swept handlebar
  mb.addTubeSegment([0, 0.07, -0.02], [0, 0.17, 0.01], 0.018, 0.016, darkSlider, 10);
  mb.addTubeSegment([-0.14, 0.17, -0.01], [0.14, 0.17, -0.01], 0.014, 0.014, barMetal, 10);
  mb.addTubeSegment([0.14, 0.17, -0.01], [0.29, 0.17, -0.06], 0.014, 0.013, barMetal, 10);
  mb.addTubeSegment([-0.14, 0.17, -0.01], [-0.29, 0.17, -0.06], 0.014, 0.013, barMetal, 10);

  // Grips
  mb.addTubeSegment([0.21, 0.17, -0.032], [0.30, 0.17, -0.065], 0.018, 0.018, gripRubber, 10);
  mb.addTubeSegment([-0.21, 0.17, -0.032], [-0.30, 0.17, -0.065], 0.018, 0.018, gripRubber, 10);

  // Front LED headlamp housing + glowing lens
  mb.addTubeSegment([0, 0.14, 0.01], [0, 0.13, 0.09], 0.034, 0.038, darkSlider, 12);
  mb.addEllipsoid(0, 0.13, 0.09, 0.031, 0.031, 0.012, lampGlow, 12, 8);

  return mb.build();
}

export function buildBikeWheelMesh() {
  const mb = new MeshBuilder();
  const tireCol = [0.16, 0.17, 0.20];
  const lugCol = [0.23, 0.25, 0.28];
  const rimCol = [0.78, 0.82, 0.88];
  const spokeCol = [0.68, 0.72, 0.78];
  const hubCol = [0.95, 0.44, 0.14];

  const outerR = 0.295;
  const tubeR = 0.045;
  // Main chunky lunar tire + metallic rim
  mb.addTorusX(0, 0, 0, outerR, tubeR, tireCol, 36, 12);
  mb.addTorusX(0, 0, 0, 0.252, 0.016, rimCol, 36, 8);

  // Tread lugs around tire so rotation & wheelspin read crisply!
  const lugCount = 24;
  for (let i = 0; i < lugCount; i++) {
    const a = (i / lugCount) * Math.PI * 2;
    const cy = Math.cos(a) * (outerR + tubeR * 0.82);
    const cz = Math.sin(a) * (outerR + tubeR * 0.82);
    const xOff = (i % 2 === 0 ? 1 : -1) * 0.014;
    mb.addBox(xOff, cy, cz, 0.042, 0.022, 0.022, lugCol);
  }

  // Hub & 12 spokes
  mb.addTubeSegment([-0.055, 0, 0], [0.055, 0, 0], 0.032, 0.032, hubCol, 12);
  mb.addTubeSegment([0.042, 0, 0], [0.048, 0, 0], 0.095, 0.095, [0.58, 0.62, 0.68], 16);
  const spokeCount = 12;
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const rimY = Math.cos(a) * 0.245;
    const rimZ = Math.sin(a) * 0.245;
    const hubX = (i % 2 === 0 ? 1 : -1) * 0.036;
    mb.addTubeSegment([hubX, 0, 0], [0, rimY, rimZ], 0.004, 0.004, spokeCol, 5, false, false);
  }

  return mb.build();
}

export function buildBikeCrankMesh() {
  const mb = new MeshBuilder();
  const ringCol = [0.65, 0.69, 0.75];
  const armCol = [0.24, 0.27, 0.32];

  // Chainring on right (-X)
  mb.addTorusX(-0.055, 0, 0, 0.088, 0.011, ringCol, 24, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    mb.addTubeSegment([-0.055, 0, 0], [-0.055, Math.sin(a) * 0.085, Math.cos(a) * 0.085], 0.008, 0.007, ringCol, 6);
  }
  // Left crank arm (+X, +Z at angle=0) & Right crank arm (-X, -Z at angle=0)
  mb.addTubeSegment([0.075, 0, 0], [0.095, 0, 0.16], 0.014, 0.011, armCol, 8);
  mb.addTubeSegment([-0.075, 0, 0], [-0.095, 0, -0.16], 0.014, 0.011, armCol, 8);

  return mb.build();
}

export function buildPedalMesh() {
  const mb = new MeshBuilder();
  mb.addBox(0, 0, 0, 0.078, 0.022, 0.085, [0.22, 0.24, 0.28]);
  mb.addBox(0, 0, 0.044, 0.045, 0.01, 0.008, [0.98, 0.68, 0.15]);
  return mb.build();
}

export function buildPelicanTorsoMesh() {
  const mb = new MeshBuilder();
  const featherWhite = [0.95, 0.94, 0.90];
  const featherWarm = [0.89, 0.87, 0.82];
  const suitOrange = [0.94, 0.42, 0.14];
  const suitNavy = [0.16, 0.24, 0.38];
  const packWhite = [0.86, 0.88, 0.91];
  const metalCol = [0.64, 0.68, 0.74];
  const ledCyan = [0.24, 0.95, 0.85];

  // Local origin at pelvis center (0, 0, 0). Torso leans forward (+Z, +Y).
  // Plump pear-shaped pelican body
  mb.addEllipsoid(0, 0.18, 0.05, 0.175, 0.21, 0.22, featherWhite, 20, 14);
  mb.addEllipsoid(0, 0.32, 0.16, 0.145, 0.16, 0.17, featherWhite, 18, 12);

  // Mission harness / flight vest stripes
  mb.addTubeSegment([0, 0.21, 0.12], [0, 0.36, 0.20], 0.155, 0.135, suitNavy, 16, false, false);
  mb.addTubeSegment([0, 0.26, 0.15], [0, 0.31, 0.18], 0.159, 0.151, suitOrange, 16, false, false);

  // Tail feathers pointing back (-Z)
  mb.addTubeSegment([0, 0.08, -0.10], [0, 0.13, -0.34], 0.095, 0.025, featherWarm, 10);
  mb.addTubeSegment([0.05, 0.09, -0.12], [0.08, 0.14, -0.31], 0.04, 0.015, [0.35, 0.36, 0.40], 8);
  mb.addTubeSegment([-0.05, 0.09, -0.12], [-0.08, 0.14, -0.31], 0.04, 0.015, [0.35, 0.36, 0.40], 8);

  // NASA-style PLSS oxygen backpack tilted cleanly behind shoulders
  mb.addBox(0, 0.40, -0.05, 0.23, 0.26, 0.14, packWhite);
  mb.addBox(0, 0.41, -0.125, 0.15, 0.14, 0.02, suitOrange);
  // Dual silver oxygen canisters
  mb.addTubeSegment([0.065, 0.29, -0.09], [0.065, 0.51, -0.09], 0.038, 0.038, metalCol, 12);
  mb.addTubeSegment([-0.065, 0.29, -0.09], [-0.065, 0.51, -0.09], 0.038, 0.038, metalCol, 12);
  // Status LED + antenna whip
  mb.addBox(0.06, 0.48, -0.13, 0.04, 0.025, 0.015, ledCyan);
  mb.addTubeSegment([-0.08, 0.52, -0.08], [-0.09, 0.78, -0.12], 0.006, 0.003, metalCol, 6);

  // Gold metallic helmet neck collar ring
  mb.addTorusY(0, 0.49, 0.22, 0.135, 0.022, [0.85, 0.68, 0.26], 22, 8);

  return mb.build();
}

export function buildPelicanHeadMesh() {
  const mb = new MeshBuilder();
  const featherWhite = [0.96, 0.95, 0.91];
  const beakGold = [0.96, 0.64, 0.14];
  const beakTip = [0.90, 0.30, 0.12];
  const eyeDark = [0.05, 0.06, 0.09];
  const eyeShine = [0.98, 0.99, 1.0];

  // Neck + rounded pelican head at local origin (0, 0, 0)
  mb.addTubeSegment([0, -0.05, -0.02], [0, 0.07, 0.02], 0.085, 0.075, featherWhite, 14);
  mb.addEllipsoid(0, 0.10, 0.03, 0.095, 0.098, 0.11, featherWhite, 18, 12);
  // Cheeky feathered crest tuft
  mb.addTubeSegment([0, 0.17, -0.01], [0, 0.23, -0.09], 0.032, 0.008, featherWhite, 8);

  // Expressive glossy eyes on left & right sides
  mb.addEllipsoid(0.082, 0.125, 0.075, 0.022, 0.024, 0.024, eyeDark, 10, 8);
  mb.addEllipsoid(-0.082, 0.125, 0.075, 0.022, 0.024, 0.024, eyeDark, 10, 8);
  mb.addEllipsoid(0.094, 0.133, 0.085, 0.007, 0.007, 0.007, eyeShine, 6, 6);
  mb.addEllipsoid(-0.094, 0.133, 0.085, 0.007, 0.007, 0.007, eyeShine, 6, 6);

  // Iconic long pelican upper beak extending along +Z with hooked orange-red tip
  mb.addTubeSegment([0, 0.088, 0.10], [0, 0.070, 0.36], 0.056, 0.024, beakGold, 14);
  // Subtle top ridge
  mb.addTubeSegment([0, 0.120, 0.11], [0, 0.086, 0.35], 0.022, 0.011, [0.99, 0.74, 0.24], 10);
  // Hooked tip
  mb.addTubeSegment([0, 0.072, 0.35], [0, 0.028, 0.39], 0.022, 0.005, beakTip, 10);

  return mb.build();
}

export function buildPelicanPouchMesh() {
  const mb = new MeshBuilder();
  const pouchAmber = [0.96, 0.56, 0.24];
  const pouchSoft = [0.98, 0.68, 0.38];

  // Pivots at jaw hinge (0, 0, 0) extending along +Z and hanging slightly down (-Y)
  mb.addTubeSegment([0, 0.0, 0.0], [0, -0.012, 0.25], 0.048, 0.018, pouchAmber, 12);
  // Sculpted inflatable gular throat pouch
  mb.addEllipsoid(0, -0.055, 0.135, 0.056, 0.068, 0.125, pouchSoft, 16, 12);

  return mb.build();
}

export function buildPelicanHelmetMesh() {
  const mb = new MeshBuilder();
  const visorTint = [0.82, 0.90, 1.0];
  // Elongated astronaut bubble enclosing the pelican's head AND full beak!
  // Centered around head (0, 0.10, 0.17)
  mb.addEllipsoid(0, 0.10, 0.175, 0.175, 0.175, 0.305, visorTint, 28, 20);
  return mb.build();
}

export function buildPelicanWingMesh(side = 1) {
  const mb = new MeshBuilder();
  const featherWhite = [0.95, 0.94, 0.90];
  const covertCream = [0.89, 0.87, 0.81];
  const primaryTip = [0.22, 0.25, 0.31];
  const cuffOrange = [0.94, 0.42, 0.14];

  // Built with local origin at shoulder (0, 0, 0), arm reaching along +Z to length 0.65m
  // Wing feather span flares laterally along side * X
  mb.addTubeSegment([0, 0, 0], [0, 0, 0.34], 0.058, 0.044, featherWhite, 12);
  mb.addTubeSegment([0, 0, 0.34], [0, 0, 0.62], 0.044, 0.028, covertCream, 12);
  // Orange space suit wrist cuff
  mb.addTubeSegment([0, 0, 0.56], [0, 0, 0.61], 0.036, 0.034, cuffOrange, 12);

  // Layered primary flight feathers fanning laterally outward
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const zStart = 0.14 + t * 0.34;
    const zEnd = zStart + 0.14;
    const xOut = side * (0.08 + (1 - Math.abs(t - 0.5)) * 0.09);
    mb.addTubeSegment(
      [side * 0.02, -0.005, zStart],
      [xOut, -0.012, zEnd],
      0.024,
      0.008,
      i >= 2 ? primaryTip : covertCream,
      8
    );
  }
  // Wingtip glove
  mb.addEllipsoid(0, 0, 0.64, 0.034, 0.028, 0.04, [0.92, 0.93, 0.95], 10, 8);

  return mb.build();
}

export function buildPelicanThighMesh() {
  const mb = new MeshBuilder();
  const featherWhite = [0.94, 0.93, 0.89];
  const kneeOrange = [0.94, 0.42, 0.14];
  // Built along +Z from (0,0,0) to (0,0,0.46)
  mb.addTubeSegment([0, 0, 0], [0, 0, 0.46], 0.068, 0.034, featherWhite, 12);
  mb.addEllipsoid(0, 0, 0.45, 0.038, 0.038, 0.038, kneeOrange, 10, 8);
  return mb.build();
}

export function buildPelicanShinMesh() {
  const mb = new MeshBuilder();
  const legOrange = [0.95, 0.55, 0.18];
  // Built along +Z from (0,0,0) to (0,0,0.46)
  mb.addTubeSegment([0, 0, 0], [0, 0, 0.46], 0.028, 0.021, legOrange, 10);
  return mb.build();
}

export function buildPelicanFootMesh() {
  const mb = new MeshBuilder();
  const webOrange = [0.96, 0.52, 0.16];
  // Flat webbed pelican foot centered around ankle (0, 0, 0), toes forward (+Z)
  mb.addEllipsoid(0, 0.012, 0.045, 0.058, 0.016, 0.085, webOrange, 12, 8);
  mb.addTubeSegment([0, 0.012, -0.01], [0.038, 0.01, 0.115], 0.011, 0.006, webOrange, 6);
  mb.addTubeSegment([0, 0.012, -0.01], [0, 0.01, 0.125], 0.012, 0.006, webOrange, 6);
  mb.addTubeSegment([0, 0.012, -0.01], [-0.038, 0.01, 0.115], 0.011, 0.006, webOrange, 6);
  return mb.build();
}

export function buildLanderMesh() {
  const mb = new MeshBuilder();
  const goldFoil = [0.88, 0.66, 0.16];
  const goldDeep = [0.74, 0.50, 0.10];
  const cabinWhite = [0.82, 0.84, 0.88];
  const darkMetal = [0.22, 0.25, 0.30];
  const windowDark = [0.06, 0.09, 0.14];

  // 4 splayed landing legs + circular footpads (grounded cleanly at Y = 0)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const footPos = [ca * 2.45, 0.06, sa * 2.45];
    const topAttach = [ca * 1.35, 1.85, sa * 1.35];
    const midAttach = [ca * 1.35, 0.95, sa * 1.35];

    mb.addTubeSegment(footPos, topAttach, 0.075, 0.085, goldFoil, 10);
    mb.addTubeSegment(footPos, midAttach, 0.045, 0.045, darkMetal, 8);
    // Circular footpad
    mb.addTubeSegment([footPos[0], 0.0, footPos[2]], [footPos[0], 0.09, footPos[2]], 0.38, 0.32, goldDeep, 14);
  }

  // Descent stage octagonal gold-foil hull
  mb.addTubeSegment([0, 0.82, 0], [0, 2.08, 0], 1.48, 1.48, goldFoil, 8);
  mb.addTubeSegment([0, 0.45, 0], [0, 0.85, 0], 0.42, 0.62, darkMetal, 14); // engine bell

  // Ascent crew cabin
  mb.addBox(0, 2.85, 0, 2.05, 1.55, 2.05, cabinWhite);
  mb.addBox(0, 3.35, 0.15, 1.55, 0.85, 1.55, [0.70, 0.73, 0.78]);
  // Dark cockpit windows facing +Z
  mb.addBox(0.42, 3.05, 1.03, 0.48, 0.36, 0.04, windowDark);
  mb.addBox(-0.42, 3.05, 1.03, 0.48, 0.36, 0.04, windowDark);

  // Dish antenna on roof
  mb.addTubeSegment([0.55, 3.62, -0.35], [0.55, 4.35, -0.35], 0.04, 0.04, darkMetal, 8);
  mb.addTubeSegment([0.55, 4.35, -0.35], [0.75, 4.55, -0.15], 0.06, 0.48, [0.86, 0.88, 0.92], 16);

  // Access ladder on +Z leg
  mb.addTubeSegment([0.18, 0.4, 1.65], [0.18, 2.35, 1.05], 0.025, 0.025, darkMetal, 8);
  mb.addTubeSegment([-0.18, 0.4, 1.65], [-0.18, 2.35, 1.05], 0.025, 0.025, darkMetal, 8);

  return mb.build();
}

export function buildFlagMesh() {
  const mb = new MeshBuilder();
  const poleCol = [0.80, 0.83, 0.88];
  const navyFlag = [0.11, 0.22, 0.46];
  const stripeGold = [0.95, 0.72, 0.20];
  const emblemWhite = [0.96, 0.97, 0.99];

  // Vertical mast + horizontal rigid crossbar (Apollo rigid wire bar!)
  mb.addTubeSegment([0, 0, 0], [0, 2.35, 0], 0.032, 0.028, poleCol, 10);
  mb.addTubeSegment([0, 2.28, 0], [1.18, 2.28, 0], 0.02, 0.02, poleCol, 8);
  mb.addEllipsoid(0, 2.38, 0, 0.05, 0.05, 0.05, stripeGold, 10, 8);

  // Flag fabric hanging crisp (two-sided box panel with slight ripple)
  mb.addBox(0.58, 1.92, 0, 1.12, 0.68, 0.018, navyFlag);
  mb.addBox(0.58, 1.64, 0, 1.12, 0.09, 0.022, stripeGold);
  mb.addBox(0.46, 1.97, 0, 0.28, 0.22, 0.024, emblemWhite);

  return mb.build();
}

export function buildSolarArrayMesh() {
  const mb = new MeshBuilder();
  const frameCol = [0.76, 0.79, 0.84];
  const panelBlue = [0.10, 0.22, 0.48];
  const gridSilver = [0.65, 0.76, 0.92];

  // Tripod legs
  mb.addTubeSegment([0, 0, 0.65], [0, 1.05, 0], 0.03, 0.025, frameCol, 8);
  mb.addTubeSegment([0.56, 0, -0.35], [0, 1.05, 0], 0.03, 0.025, frameCol, 8);
  mb.addTubeSegment([-0.56, 0, -0.35], [0, 1.05, 0], 0.03, 0.025, frameCol, 8);
  mb.addTubeSegment([0, 1.0, 0], [0, 1.55, 0], 0.04, 0.04, frameCol, 10);

  // Angled twin solar wings
  mb.addBox(0, 1.55, 0, 2.8, 0.05, 0.95, frameCol);
  mb.addBox(0.72, 1.58, 0, 1.25, 0.02, 0.86, panelBlue);
  mb.addBox(-0.72, 1.58, 0, 1.25, 0.02, 0.86, panelBlue);
  mb.addBox(0.72, 1.595, 0, 1.25, 0.008, 0.03, gridSilver);
  mb.addBox(-0.72, 1.595, 0, 1.25, 0.008, 0.03, gridSilver);

  return mb.build();
}

export function buildBoulderMesh() {
  const mb = new MeshBuilder();
  const rng = mulberry32(84217);
  const segU = 10;
  const segV = 7;

  // Precompute deterministic facet displacements across sphere directions
  const dirs = [];
  for (let i = 0; i < 8; i++) {
    dirs.push([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, 0.72 + rng() * 0.42]);
  }

  function rockRadius(dx, dy, dz) {
    let r = 0.88;
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i][0] * dx + dirs[i][1] * dy + dirs[i][2] * dz;
      r += Math.max(0, d) * 0.14 * dirs[i][3];
    }
    return clamp(r, 0.65, 1.25);
  }

  const pts = [];
  for (let iv = 0; iv <= segV; iv++) {
    const phi = (iv / segV) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let iu = 0; iu <= segU; iu++) {
      const theta = (iu / segU) * Math.PI * 2;
      const dx = sp * Math.cos(theta);
      const dy = cp;
      const dz = sp * Math.sin(theta);
      const r = rockRadius(dx, dy, dz);
      pts.push([dx * r, dy * r, dz * r]);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = pts[iv * stride + iu];
      const b = pts[iv * stride + iu + 1];
      const c = pts[(iv + 1) * stride + iu];
      const d = pts[(iv + 1) * stride + iu + 1];

      // Flat-faceted shading per triangle pair
      const n1 = v3Norm(v3Cross(v3Sub(b, a), v3Sub(c, a)));
      const shade = 0.38 + (iu % 3) * 0.04;
      const va = mb.pushVertex(a[0], a[1], a[2], n1[0], n1[1], n1[2], shade, shade, shade * 0.99, 0, 0);
      const vb = mb.pushVertex(b[0], b[1], b[2], n1[0], n1[1], n1[2], shade, shade, shade * 0.99, 1, 0);
      const vc = mb.pushVertex(c[0], c[1], c[2], n1[0], n1[1], n1[2], shade, shade, shade * 0.99, 0, 1);
      mb.pushTri(va, vb, vc);

      const n2 = v3Norm(v3Cross(v3Sub(d, b), v3Sub(c, b)));
      const vb2 = mb.pushVertex(b[0], b[1], b[2], n2[0], n2[1], n2[2], shade * 0.96, shade * 0.96, shade * 0.95, 1, 0);
      const vd2 = mb.pushVertex(d[0], d[1], d[2], n2[0], n2[1], n2[2], shade * 0.96, shade * 0.96, shade * 0.95, 1, 1);
      const vc2 = mb.pushVertex(c[0], c[1], c[2], n2[0], n2[1], n2[2], shade * 0.96, shade * 0.96, shade * 0.95, 0, 1);
      mb.pushTri(vb2, vd2, vc2);
    }
  }

  return mb.build();
}

export function buildBeaconBaseMesh() {
  const mb = new MeshBuilder();
  const metal = [0.80, 0.84, 0.88];
  const accent = [0.95, 0.44, 0.14];

  mb.addTubeSegment([0.45, 0, 0.25], [0, 0.72, 0], 0.026, 0.022, metal, 8);
  mb.addTubeSegment([-0.45, 0, 0.25], [0, 0.72, 0], 0.026, 0.022, metal, 8);
  mb.addTubeSegment([0, 0, -0.50], [0, 0.72, 0], 0.026, 0.022, metal, 8);
  mb.addTubeSegment([0, 0.65, 0], [0, 1.45, 0], 0.055, 0.035, accent, 12);
  mb.addTorusY(0, 1.55, 0, 0.34, 0.035, [0.92, 0.96, 1.0], 24, 8);
  return mb.build();
}

export function buildBeaconBeamMesh() {
  const mb = new MeshBuilder();
  mb.addTubeSegment([0, 0.3, 0], [0, 18.0, 0], 0.32, 0.14, [1, 1, 1], 14, false, false);
  return mb.build();
}

export function buildEarthMesh() {
  const mb = new MeshBuilder();
  mb.addEllipsoid(0, 0, 0, 1, 1, 1, [1, 1, 1], 48, 32);
  return mb.build();
}
