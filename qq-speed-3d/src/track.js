import * as THREE from 'three';
import { themeCss } from './tracks.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildRibbon(samples, n, halfWidth, yOffset, extra = 0) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const p = samples[i].p;
    const r = samples[i].right;
    const v = samples[i].dist / 12;
    pos.push(p.x - r.x * halfWidth, p.y + yOffset, p.z - r.z * halfWidth);
    pos.push(p.x + r.x * halfWidth, p.y + yOffset, p.z + r.z * halfWidth);
    uv.push(0, v, 1, v);
    if (i < n - 1) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  {
    const i = n - 1;
    const a = i * 2, b = i * 2 + 1, c = 0, d = 1;
    idx.push(a, c, d, a, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildCurbs(samples, n, halfWidth, width, yOffset, colorA, colorB) {
  const pos = [], col = [], idx = [];
  const red = new THREE.Color(colorA);
  const white = new THREE.Color(colorB);
  for (let i = 0; i < n; i++) {
    const { p, right, dist } = samples[i];
    const c = Math.floor(dist / 3.1) % 2 === 0 ? red : white;
    for (const side of [-1, 1]) {
      const inner = halfWidth;
      const outer = halfWidth + width;
      pos.push(
        p.x + right.x * side * inner, p.y + yOffset, p.z + right.z * side * inner,
        p.x + right.x * side * outer, p.y + yOffset, p.z + right.z * side * outer
      );
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    if (i < n - 1) {
      const base = i * 4;
      const next = (i + 1) * 4;
      for (let s = 0; s < 2; s++) {
        const o = base + s * 2;
        const o2 = next + s * 2;
        idx.push(o, o2 + 1, o + 1, o, o2, o2 + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildEmbankment(samples, n, halfWidth, outerWidth, yOffset, outerY) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const { p, right, dist } = samples[i];
    for (const side of [-1, 1]) {
      pos.push(
        p.x + right.x * side * halfWidth, p.y + yOffset, p.z + right.z * side * halfWidth,
        p.x + right.x * side * outerWidth, outerY, p.z + right.z * side * outerWidth
      );
      uv.push(0, dist / 9, 1, dist / 9);
    }
    if (i < n - 1) {
      const base = i * 4;
      const next = (i + 1) * 4;
      for (let s = 0; s < 2; s++) {
        const o = base + s * 2;
        const o2 = next + s * 2;
        idx.push(o, o2 + 1, o + 1, o, o2, o2 + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function frondGeometry() {
  const segs = 8;
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * 3.0;
    const y = -0.62 * t * t + 0.14 * t;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.02)) * 0.78 + 0.03;
    const notch = i % 2 === 0 ? 1 : 0.72;
    pos.push(x, y, -w * notch, x, y, w * notch);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// createTrack: builds one themed circuit. Everything it allocates is owned by
// the returned handle and released by track.dispose() so endless stages can
// swap circuits without leaking GPU memory.
// ---------------------------------------------------------------------------

export function createTrack(scene, textures, quality, spec) {
  const group = new THREE.Group();
  scene.add(group);
  const theme = spec.theme;
  const env = spec.env;
  const shadows = !!quality.shadows;
  const rng = mulberry32(hashString(spec.id + ':' + (spec.stage || 0)));
  const localTextures = [];

  const cloneTex = (tex, repeatX = 1, repeatY = 1) => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.needsUpdate = true;
    localTextures.push(t);
    return t;
  };

  const points = spec.points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', spec.tension ?? 0.42);
  const length = curve.getLength();
  const N = Math.max(360, Math.round(length / 1.15));
  const pts = curve.getSpacedPoints(N).slice(0, N);
  const stepLen = length / N;
  const right = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const samples = [];
  let dist = 0;
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + N) % N];
    const next = pts[(i + 1) % N];
    tangent.subVectors(next, prev).normalize();
    right.crossVectors(UP, tangent).normalize();
    samples.push({ p: p.clone(), tangent: tangent.clone(), right: right.clone(), dist });
    dist += stepLen;
  }

  const HALF = spec.half;
  const CURB_W = 0.95;
  const WALL_OFF = HALF + 2.15;
  const BANK_OUT = HALF + 18;
  const centroid = new THREE.Vector3();
  for (const p of points) centroid.add(p);
  centroid.divideScalar(points.length);
  centroid.y = 0;
  let boundR = 0;
  for (const p of points) boundR = Math.max(boundR, Math.hypot(p.x - centroid.x, p.z - centroid.z));

  // height of the grass bank at a lateral offset (used to plant scenery)
  function groundYAt(offset, roadY) {
    if (env.ground === 'cloud') return roadY;
    const a = HALF + CURB_W;
    const o = Math.abs(offset);
    if (o <= a) return roadY;
    if (o >= BANK_OUT) return 0.02;
    const t = (o - a) / (BANK_OUT - a);
    return roadY * (1 - t) + 0.02 * t;
  }

  const sunDir = new THREE.Vector3(theme.sunDir[0], theme.sunDir[1], theme.sunDir[2]).normalize();

  // ===== road =====
  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.asphalt, roughness: 0.86, metalness: 0.05, color: theme.road,
  });
  const road = new THREE.Mesh(buildRibbon(samples, N, HALF, 0), roadMat);
  road.receiveShadow = true;
  group.add(road);

  const curbMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide,
  });
  const curbs = new THREE.Mesh(buildCurbs(samples, N, HALF, CURB_W, 0.018, theme.curbA, theme.curbB), curbMat);
  curbs.receiveShadow = true;
  group.add(curbs);

  const terrainTex = textures.terrainFor(theme);
  const bankTex = cloneTex(terrainTex, 1, 1);
  const bankMat = new THREE.MeshStandardMaterial({
    map: bankTex, roughness: 0.98, side: THREE.DoubleSide,
  });
  if (env.ground !== 'cloud') {
    const bank = new THREE.Mesh(buildEmbankment(samples, N, HALF + CURB_W, BANK_OUT, -0.04, 0.02), bankMat);
    bank.receiveShadow = true;
    group.add(bank);
  } else {
    // floating skyway: a dark belly ribbon so the road reads as solid from below
    const under = new THREE.Mesh(
      buildRibbon(samples, N, HALF + 0.15, -0.42),
      new THREE.MeshStandardMaterial({
        color: 0x33425c, roughness: 0.82, metalness: 0.12, side: THREE.DoubleSide,
      })
    );
    group.add(under);
  }

  // ===== barriers =====
  const barrierInsts = [];
  {
    const segStep = 2;
    const segLen = stepLen * segStep * 0.97;
    for (let i = 0; i < N; i += segStep) {
      const s = samples[i];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      for (const side of [-1, 1]) {
        barrierInsts.push({
          x: s.p.x + s.right.x * side * WALL_OFF,
          y: s.p.y + 0.3,
          z: s.p.z + s.right.z * side * WALL_OFF,
          yaw,
          alt: Math.floor(i / segStep) % 2,
        });
      }
    }
    const geo = new THREE.BoxGeometry(0.22, 0.6, segLen);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(geo, mat, barrierInsts.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    barrierInsts.forEach((it, i) => {
      e.set(0, it.yaw, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
      col.setHex(it.alt ? theme.wallB : theme.wallA);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);

    const railGeo = new THREE.BoxGeometry(0.16, 0.09, segLen);
    const railMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const rail = new THREE.InstancedMesh(railGeo, railMat, barrierInsts.length);
    barrierInsts.forEach((it, i) => {
      e.set(0, it.yaw, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(it.x, it.y + 0.35, it.z), q, new THREE.Vector3(1, 1, 1));
      rail.setMatrixAt(i, m);
      col.setHex(it.alt ? theme.railA : theme.railB);
      rail.setColorAt(i, col);
    });
    rail.instanceMatrix.needsUpdate = true;
    if (rail.instanceColor) rail.instanceColor.needsUpdate = true;
    group.add(rail);
  }

  // ===== start line + gantry =====
  const startFrame = samples[0];
  {
    const geo = new THREE.PlaneGeometry(HALF * 2 - 1.4, 3.0);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: textures.checker, roughness: 0.8, metalness: 0.03,
    });
    const line = new THREE.Mesh(geo, mat);
    line.position.set(startFrame.p.x, startFrame.p.y + 0.028, startFrame.p.z);
    line.rotation.y = Math.atan2(startFrame.tangent.x, startFrame.tangent.z);
    line.receiveShadow = true;
    group.add(line);
  }

  // ===== boost pads =====
  const boostPads = [];
  for (const [u, lane] of spec.pads) {
    const f = frameAt(u);
    const padGroup = new THREE.Group();
    padGroup.position.set(f.p.x + f.right.x * lane, f.p.y + 0.035, f.p.z + f.right.z * lane);
    padGroup.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
    const map = cloneTex(textures.arrowPad, 1, 1);
    map.offset.y = rng();
    const mat = new THREE.MeshBasicMaterial({
      map, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.0), mat);
    plane.rotation.x = -Math.PI / 2;
    padGroup.add(plane);
    const gmat = new THREE.MeshBasicMaterial({
      map: textures.glow, color: theme.accent2, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 10.5), gmat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.005;
    padGroup.add(glow);
    group.add(padGroup);
    boostPads.push({
      u, lane, group: padGroup, mat, gmat, map,
      center: padGroup.position.clone(), cooldown: 0,
    });
  }

  // ===== item boxes (instanced: 3 draw calls for the whole field) =====
  const itemBoxes = [];
  const boxCount = spec.itemBoxes.length;
  const boxGeo = new THREE.BoxGeometry(1.45, 1.45, 1.45);
  const boxMat = new THREE.MeshStandardMaterial({
    map: textures.itemBox, color: 0xffffff, roughness: 0.28, metalness: 0.25,
    emissive: 0xffffff, emissiveMap: textures.itemBox, emissiveIntensity: 0.62,
    transparent: true, opacity: 0.94,
  });
  const ringGeo = new THREE.TorusGeometry(1.12, 0.045, 6, 26);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: theme.itemTint, toneMapped: false });
  const boxMesh = new THREE.InstancedMesh(boxGeo, boxMat, Math.max(1, boxCount));
  const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, boxCount));
  boxMesh.castShadow = shadows;
  boxMesh.frustumCulled = false;
  ringMesh.frustumCulled = false;
  const glowPositions = new Float32Array(Math.max(1, boxCount) * 3);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const glowPoints = new THREE.Points(glowGeo, new THREE.PointsMaterial({
    map: textures.glow, color: theme.itemTint, size: 4.6, transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false,
  }));
  glowPoints.frustumCulled = false;
  group.add(boxMesh, ringMesh, glowPoints);
  const boxDummy = new THREE.Object3D();
  const ringDummy = new THREE.Object3D();
  for (let i = 0; i < boxCount; i++) {
    const [u, lane] = spec.itemBoxes[i];
    const f = frameAt(u);
    itemBoxes.push({
      u, lane,
      center: new THREE.Vector3(
        f.p.x + f.right.x * lane,
        f.p.y + 1.28,
        f.p.z + f.right.z * lane
      ),
      active: true, cooldown: 0, spawn: 1,
      phase: rng() * Math.PI * 2, spin: rng() * Math.PI * 2,
    });
    glowPositions[i * 3] = itemBoxes[i].center.x;
    glowPositions[i * 3 + 1] = itemBoxes[i].center.y;
    glowPositions[i * 3 + 2] = itemBoxes[i].center.z;
    boxDummy.position.copy(itemBoxes[i].center);
    boxDummy.updateMatrix();
    boxMesh.setMatrixAt(i, boxDummy.matrix);
    ringDummy.position.copy(itemBoxes[i].center);
    ringDummy.scale.setScalar(1);
    ringDummy.updateMatrix();
    ringMesh.setMatrixAt(i, ringDummy.matrix);
  }
  boxMesh.instanceMatrix.needsUpdate = true;
  ringMesh.instanceMatrix.needsUpdate = true;

  // ===== sky =====
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(theme.skyTop) },
      horizonColor: { value: new THREE.Color(theme.skyHorizon) },
      sunDir: { value: sunDir },
      sunColor: { value: new THREE.Color(theme.skySun) },
      uStars: { value: theme.stars ? 1 : 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float uStars;
      uniform float uTime;
      varying vec3 vDir;
      float hash13(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, smoothstep(0.5, 0.95, h));
        if (uStars > 0.5) {
          vec3 cell = floor(vDir * 260.0);
          float hh = hash13(cell);
          float star = smoothstep(0.9968, 0.9996, hh);
          float tw = 0.55 + 0.45 * sin(uTime * 2.2 + hh * 60.0);
          col += vec3(0.82, 0.9, 1.0) * star * tw * smoothstep(0.05, 0.3, vDir.y);
        }
        float sun = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 260.0);
        float halo = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 12.0);
        col += sunColor * (sun * 1.6 + halo * 0.12);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 18), skyMat);
  sky.renderOrder = -20;
  group.add(sky);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures.glow, color: theme.skySun, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  sunSprite.position.copy(sunDir).multiplyScalar(820);
  sunSprite.scale.set(theme.sky === 'night' ? 90 : 120, theme.sky === 'night' ? 90 : 120, 1);
  sunSprite.renderOrder = -19;
  group.add(sunSprite);

  // ===== fluid (ocean / lava / frozen sea) =====
  let waterUniforms = null;
  if (env.ocean) {
    waterUniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(theme.fluid.deep) },
      uShallow: { value: new THREE.Color(theme.fluid.shallow) },
      uHorizon: { value: new THREE.Color(theme.fluid.horizon) },
      uSun: { value: sunDir },
      uGlint: { value: new THREE.Color(theme.id === 'volcano' ? 0xffb066 : 0xfff0bd) },
    };
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(3200, 3200, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: waterUniforms,
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uDeep;
          uniform vec3 uShallow;
          uniform vec3 uHorizon;
          uniform vec3 uGlint;
          varying vec3 vWorld;
          void main() {
            float d = length(vWorld.xz - cameraPosition.xz);
            float a = sin(vWorld.x * 0.045 + uTime * 0.85 + sin(vWorld.z * 0.028 + uTime * 0.55) * 1.6);
            float b = sin(vWorld.z * 0.06 + uTime * 1.15 + sin(vWorld.x * 0.02) * 2.0);
            float w = a * 0.5 + b * 0.5;
            vec3 col = mix(uDeep, uShallow, 0.18 + w * 0.12);
            float glint = pow(max(0.0, sin(vWorld.x * 0.32 + vWorld.z * 0.21 + uTime * 2.4)), 26.0);
            col += uGlint * glint * 0.35;
            float fogK = smoothstep(360.0, 1500.0, d);
            col = mix(col, uHorizon, fogK * 0.92);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = theme.fluid.y;
    group.add(water);
  }

  // ===== terrain =====
  const sandTex = chooseBeachTexture();
  function chooseBeachTexture() {
    return cloneTex(textures.sand, 24, 24);
  }

  if (env.ground === 'island' || env.ground === 'plain') {
    const gRad = env.groundRadius;
    const gTex = cloneTex(terrainTex, Math.max(18, Math.min(80, Math.round(gRad / 9))), Math.max(18, Math.min(80, Math.round(gRad / 9))));
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(gRad, 96),
      new THREE.MeshStandardMaterial({ map: gTex, color: 0xffffff, roughness: 0.98 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    group.add(ground);

    if (env.beach) {
      const beach = new THREE.Mesh(
        new THREE.RingGeometry(gRad * 0.94, gRad + 320, 96),
        new THREE.MeshStandardMaterial({ map: sandTex, color: theme.beach, roughness: 0.96 })
      );
      beach.rotation.x = -Math.PI / 2;
      beach.position.y = -0.09;
      beach.receiveShadow = true;
      group.add(beach);
    }

    if (env.lagoon) {
      const lr = env.lagoonRadius || boundR * 0.3;
      const lagoonSand = new THREE.Mesh(
        new THREE.RingGeometry(lr * 0.9, lr * 1.32, 72),
        new THREE.MeshStandardMaterial({ map: sandTex, color: theme.beach, roughness: 0.97 })
      );
      lagoonSand.rotation.x = -Math.PI / 2;
      lagoonSand.position.set(centroid.x, -0.045, centroid.z);
      lagoonSand.receiveShadow = true;
      group.add(lagoonSand);
      const lagoonWater = new THREE.Mesh(
        new THREE.CircleGeometry(lr, 72),
        new THREE.MeshStandardMaterial({
          color: theme.fluid.shallow, roughness: 0.18, metalness: 0.28,
          transparent: true, opacity: 0.94,
        })
      );
      lagoonWater.rotation.x = -Math.PI / 2;
      lagoonWater.position.set(centroid.x, -0.9, centroid.z);
      group.add(lagoonWater);
      const islet = new THREE.Mesh(
        new THREE.CircleGeometry(lr * 0.13, 24),
        new THREE.MeshStandardMaterial({ map: sandTex, color: theme.beach, roughness: 0.95 })
      );
      islet.rotation.x = -Math.PI / 2;
      islet.position.set(centroid.x - lr * 0.25, -0.1, centroid.z + lr * 0.18);
      group.add(islet);
    }
  }

  // cloud sea for the skyway
  let cloudSea = null;
  const cloudSprites = [];
  if (env.ground === 'cloud') {
    const seaMat = new THREE.MeshBasicMaterial({
      map: cloneTex(textures.cloud, 34, 34), color: 0xdfeaf8, transparent: true, opacity: 0.84,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), seaMat);
    cloudSea.rotation.x = -Math.PI / 2;
    cloudSea.position.y = -19;
    group.add(cloudSea);
    const sea2 = new THREE.Mesh(
      new THREE.PlaneGeometry(3600, 3600),
      new THREE.MeshBasicMaterial({
        map: cloneTex(textures.cloud, 17, 17), transparent: true, opacity: 0.55,
        depthWrite: false, side: THREE.DoubleSide, fog: true,
      })
    );
    sea2.rotation.x = -Math.PI / 2;
    sea2.position.y = -9;
    group.add(sea2);
    for (let i = 0; i < 10; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = boundR + 30 + rng() * 360;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.cloud, transparent: true, opacity: 0.4 + rng() * 0.35,
        depthWrite: false, fog: true,
      }));
      spr.position.set(centroid.x + Math.cos(ang) * rad, -16 + rng() * 18, centroid.z + Math.sin(ang) * rad);
      const s = 60 + rng() * 120;
      spr.scale.set(s, s * 0.42, 1);
      group.add(spr);
    }
    for (let i = 0; i < 14; i++) {
      const u = (i + 0.2) / 14;
      const f = frameAt(u);
      const side = i % 2 ? 1 : -1;
      const off = side * (HALF + 7 + rng() * 46);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.cloud, transparent: true, opacity: 0.35 + rng() * 0.4,
        depthWrite: false, fog: true,
      }));
      spr.position.set(
        f.p.x + f.right.x * off,
        f.p.y - 8 - rng() * 13,
        f.p.z + f.right.z * off
      );
      const ss = 24 + rng() * 58;
      spr.scale.set(ss, ss * 0.44, 1);
      group.add(spr);
    }
  }

  // ===== distant hills / mesas / mountains =====
  const volcanoSmoke = [];
  let centralVolcano = null;
  if (env.hills) {
    const hillMatA = new THREE.MeshStandardMaterial({
      color: theme.hillA, roughness: 0.98, flatShading: true,
    });
    const hillMatB = new THREE.MeshStandardMaterial({
      color: theme.hillB, roughness: 1, flatShading: true,
    });
    const spots = [];
    const hillCount = env.hills === 'mesa' ? 14 : 12;
    for (let i = 0; i < hillCount; i++) {
      const ang = (i / hillCount) * Math.PI * 2 + rng() * 0.22;
      const r = boundR + 190 + rng() * 260;
      spots.push({
        x: centroid.x + Math.cos(ang) * r,
        z: centroid.z + Math.sin(ang) * r,
        r: 46 + rng() * 90,
        h: 24 + rng() * 46,
        rot: rng() * Math.PI,
      });
    }
    for (let i = 0; i < spots.length; i++) {
      const [x, z, r, h] = [spots[i].x, spots[i].z, spots[i].r, spots[i].h];
      let mesh;
      if (env.hills === 'mesa') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r, h, 7, 1), i % 2 ? hillMatA : hillMatB);
        mesh.position.set(x, h / 2 - 1, z);
      } else {
        const geo = new THREE.ConeGeometry(r, h, env.hills === 'snow' ? 5 : 7, 1);
        mesh = new THREE.Mesh(geo, i % 2 ? hillMatA : hillMatB);
        mesh.position.set(x, h / 2 - 1, z);
        if (env.hills === 'snow') {
          const cap = new THREE.Mesh(
            new THREE.ConeGeometry(r * 0.42, h * 0.34, 5, 1),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true })
          );
          cap.position.set(x, h - h * 0.17 - 1, z);
          group.add(cap);
        }
      }
      mesh.rotation.y = spots[i].rot;
      group.add(mesh);
    }
    if (env.hills === 'volcano') {
      const vh = 105;
      const vr = 92;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(vr, vh, 9, 2),
        new THREE.MeshStandardMaterial({ color: 0x2b1a18, roughness: 0.95, flatShading: true })
      );
      cone.position.set(centroid.x, vh / 2 - 4, centroid.z);
      group.add(cone);
      const crater = new THREE.Mesh(
        new THREE.CircleGeometry(vr * 0.4, 24),
        new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false })
      );
      crater.rotation.x = -Math.PI / 2;
      crater.position.set(centroid.x, vh - 10, centroid.z);
      group.add(crater);
      const craterGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.glow, color: 0xff8a2a, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      craterGlow.scale.set(150, 60, 1);
      craterGlow.position.set(centroid.x, vh - 4, centroid.z);
      group.add(craterGlow);
      for (let i = 0; i < 7; i++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: textures.smoke, color: 0x3a2b28, transparent: true, opacity: 0.28,
          depthWrite: false, fog: true,
        }));
        const a = i * 1.7;
        spr.position.set(centroid.x + Math.cos(a) * 18, vh + 8 + i * 12, centroid.z + Math.sin(a) * 18);
        spr.scale.set(20 + (i % 3) * 12, 16 + (i % 4) * 10, 1);
        group.add(spr);
        volcanoSmoke.push({ spr, phase: i * 1.3, baseY: spr.position.y, x: spr.position.x, z: spr.position.z });
      }
      // two distant calderas give the horizon a landmark from every part of the course
      const farVolcanoes = [
        [0.7, boundR + 230, 128, 105],
        [2.5, boundR + 290, 96, 82],
      ];
      for (let i = 0; i < farVolcanoes.length; i++) {
        const [ang, rad, h, r] = farVolcanoes[i];
        const x = centroid.x + Math.cos(ang) * rad;
        const z = centroid.z + Math.sin(ang) * rad;
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(r, h, 9, 2),
          new THREE.MeshStandardMaterial({ color: i ? 0x3a2422 : 0x2b1a18, roughness: 0.95, flatShading: true })
        );
        cone.position.set(x, h / 2 - 5, z);
        cone.rotation.y = i * 1.7;
        group.add(cone);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: textures.glow, color: 0xff6a2a, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        glow.position.set(x, h - 3, z);
        glow.scale.set(42, 24, 1);
        group.add(glow);
      }
      centralVolcano = { craterGlow };
    }
  }

  // ===== city ring =====
  if (env.city === 'ring') {
    const windows = textures.windows;
    const neonCols = [theme.accent, theme.accent2, 0x4dffd2, 0xffd23f];
    const count = theme.id === 'neon' ? 30 : 18;
    const cityRing = boundR + (theme.id === 'neon' ? 55 : 50);
    const cityMat = new THREE.MeshStandardMaterial({
      map: windows, color: 0xffffff, roughness: 0.6, metalness: 0.15,
      emissiveMap: windows, emissive: 0xffffff, emissiveIntensity: theme.cityEmissive,
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a4560, roughness: 0.8 });
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const bodies = new THREE.InstancedMesh(unit, cityMat, count);
    const roofs = new THREE.InstancedMesh(unit, roofMat, count);
    const stripCount = theme.id === 'neon' ? Math.ceil(count / 3) : 0;
    const strips = stripCount ? new THREE.InstancedMesh(unit, stripMat, stripCount) : null;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const tops = [];
    let si = 0;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rng() * 0.15;
      const rad = cityRing + rng() * (theme.id === 'neon' ? 90 : 55);
      const w = 13 + rng() * 18;
      const h = theme.id === 'neon' ? 26 + rng() * 58 : 15 + rng() * 30;
      const d = 13 + rng() * 18;
      const bx = centroid.x + Math.cos(ang) * rad;
      const bz = centroid.z + Math.sin(ang) * rad;
      e.set(0, (rng() - 0.5) * 0.3, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(bx, h / 2 - 1, bz), q, new THREE.Vector3(w, h, d));
      bodies.setMatrixAt(i, m);
      col.setHex(theme.cityTint);
      if (i % 2) col.multiplyScalar(0.82);
      col.lerp(new THREE.Color(0xffffff), 0.05);
      bodies.setColorAt(i, col);
      const rh = 2.5 + rng() * 4;
      m.compose(new THREE.Vector3(bx, h + 1, bz), q, new THREE.Vector3(w * 0.32, rh, d * 0.32));
      roofs.setMatrixAt(i, m);
      tops.push({ x: bx, z: bz, h, color: neonCols[i % neonCols.length] });
      if (strips && i % 3 === 0) {
        const inner = new THREE.Vector3(centroid.x - bx, 0, centroid.z - bz).normalize();
        e.set(0, Math.atan2(inner.x, inner.z), 0);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(bx + inner.x * (w / 2 + 0.3), h * 0.5, bz + inner.z * (d / 2 + 0.3)),
          q, new THREE.Vector3(1.4, h * 0.72, 0.5)
        );
        strips.setMatrixAt(si, m);
        strips.setColorAt(si, new THREE.Color(neonCols[i % neonCols.length]));
        si++;
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    group.add(bodies, roofs);
    if (strips) {
      strips.count = si;
      strips.instanceMatrix.needsUpdate = true;
      if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
      group.add(strips);
    }
    if (theme.id === 'neon') {
      // a handful of rooftop beacons is enough; each sprite is one draw call
      for (let i = 0; i < Math.min(6, tops.length); i++) {
        const t = tops[Math.floor((i + 0.5) * tops.length / 6)];
        const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
          map: textures.glow, color: t.color, transparent: true,
          opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        beacon.position.set(t.x, t.h + 4, t.z);
        beacon.scale.set(10, 10, 1);
        group.add(beacon);
      }
    }
  }

  // ===== palms / pines / cacti / crystals =====
  const propSpots = [];
  if (env.prop && env.prop !== 'none' && env.ground !== 'cloud') {
    const propNear = env.propNear ?? 14;
    const propFar = env.propFar ?? 58;
    const propScale = env.propScale ?? 1;
    for (let i = 0; i < env.props; i++) {
      const u = (i / env.props + rng() * 0.02) % 1;
      const side = rng() > 0.5 ? 1 : -1;
      const off = side * (propNear + rng() * (propFar - propNear));
      const f = frameAt(u);
      propSpots.push({
        x: f.p.x + f.right.x * off,
        z: f.p.z + f.right.z * off,
        y: groundYAt(off, f.p.y),
        s: (0.75 + rng() * 0.6) * propScale,
        rot: rng() * Math.PI * 2,
        lean: (rng() - 0.5) * 0.16,
      });
    }
  }
  if (env.prop === 'palm' && propSpots.length) buildPalms();
  else if (env.prop === 'pine' && propSpots.length) buildPines();
  else if (env.prop === 'cactus' && propSpots.length) buildCacti();
  else if (env.prop === 'crystal' && propSpots.length) buildCrystals();

  function buildPalms() {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.3, 4.8, 7, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: theme.propTrunk, roughness: 0.95 });
    const leafGeo = frondGeometry();
    const leafMat = new THREE.MeshStandardMaterial({
      color: theme.propLeaf, roughness: 0.82, side: THREE.DoubleSide, flatShading: true,
    });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, propSpots.length);
    trunks.castShadow = shadows;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    propSpots.forEach((p, i) => {
      e.set(p.lean, p.rot, p.lean * 0.6);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, p.y + 2.4 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    group.add(trunks);

    const fronds = new THREE.InstancedMesh(leafGeo, leafMat, propSpots.length * 9);
    fronds.castShadow = shadows;
    let fi = 0;
    propSpots.forEach((p) => {
      const topX = p.x + Math.sin(p.rot) * p.lean * 3;
      const topZ = p.z + Math.cos(p.rot) * p.lean * 3;
      for (let j = 0; j < 9; j++) {
        e.set(0, p.rot + (j / 9) * Math.PI * 2 + rng() * 0.2, (rng() - 0.35) * 0.3);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(topX, p.y + 4.75 * p.s, topZ),
          q,
          new THREE.Vector3(p.s, p.s, p.s)
        );
        fronds.setMatrixAt(fi++, m);
      }
    });
    fronds.instanceMatrix.needsUpdate = true;
    group.add(fronds);

    const nutGeo = new THREE.SphereGeometry(0.18, 7, 6);
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x5b3a1c, roughness: 0.85 });
    const nuts = new THREE.InstancedMesh(nutGeo, nutMat, propSpots.length * 3);
    fi = 0;
    propSpots.forEach((p) => {
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * Math.PI * 2 + p.rot;
        m.compose(
          new THREE.Vector3(p.x + Math.cos(a) * 0.35, p.y + 4.55 * p.s, p.z + Math.sin(a) * 0.35),
          q.identity(),
          new THREE.Vector3(p.s, p.s, p.s)
        );
        nuts.setMatrixAt(fi++, m);
      }
    });
    nuts.instanceMatrix.needsUpdate = true;
    group.add(nuts);
  }

  function buildPines() {
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.26, 3.6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: theme.propTrunk, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: theme.propLeaf, roughness: 0.9, flatShading: true,
    });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.9, flatShading: true });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, propSpots.length);
    const layerGeo = new THREE.ConeGeometry(1.5, 2.6, 7);
    const layers = new THREE.InstancedMesh(layerGeo, leafMat, propSpots.length * 3);
    const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 1.1, 7), snowMat, propSpots.length * 2);
    trunkInst.castShadow = shadows;
    layers.castShadow = shadows;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let li = 0;
    let ci = 0;
    propSpots.forEach((p, i) => {
      e.set(0, p.rot, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, p.y + 1.8 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunkInst.setMatrixAt(i, m);
      for (let k = 0; k < 3; k++) {
        const sc = p.s * (1 - k * 0.22);
        m.compose(
          new THREE.Vector3(p.x, p.y + (2.6 + k * 1.35) * p.s, p.z),
          q,
          new THREE.Vector3(sc, sc, sc)
        );
        layers.setMatrixAt(li++, m);
      }
      for (let k = 0; k < 2; k++) {
        const sc = p.s * (1 - k * 0.22) * 0.78;
        m.compose(
          new THREE.Vector3(p.x, p.y + (3.1 + k * 1.35) * p.s, p.z),
          q,
          new THREE.Vector3(sc, sc, sc)
        );
        caps.setMatrixAt(ci++, m);
      }
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    layers.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    group.add(trunkInst, layers, caps);
  }

  function buildCacti() {
    const trunkGeo = new THREE.CylinderGeometry(0.34, 0.44, 3.4, 7);
    const armGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.5, 6);
    const mat = new THREE.MeshStandardMaterial({ color: theme.propLeaf, roughness: 0.9, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, mat, propSpots.length);
    const arms = new THREE.InstancedMesh(armGeo, mat, propSpots.length * 2);
    trunks.castShadow = shadows;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let ai = 0;
    propSpots.forEach((p, i) => {
      e.set(0, p.rot, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, p.y + 1.7 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m);
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        e.set(0, p.rot, side * 0.9);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(p.x + Math.cos(p.rot) * side * 0.72 * p.s, p.y + (2.2 + k * 0.35) * p.s, p.z + Math.sin(p.rot) * side * 0.72 * p.s),
          q,
          new THREE.Vector3(p.s, p.s, p.s)
        );
        arms.setMatrixAt(ai++, m);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    group.add(trunks, arms);
  }

  function buildCrystals() {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: theme.crystal, roughness: 0.22, metalness: 0.35,
      emissive: theme.crystal, emissiveIntensity: 0.5, flatShading: true,
    });
    const inst = new THREE.InstancedMesh(geo, mat, propSpots.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let ii = 0;
    propSpots.forEach((p) => {
      for (let k = 0; k < 2; k++) {
        e.set(rng() * 0.3, rng() * Math.PI, rng() * 0.3);
        q.setFromEuler(e);
        const h = (1.3 + rng() * 1.6) * p.s;
        m.compose(
          new THREE.Vector3(p.x + (k ? 0.9 : -0.8) * p.s, p.y + h * 0.7, p.z + (k ? -0.4 : 0.5) * p.s),
          q,
          new THREE.Vector3(0.55 * p.s, h, 0.55 * p.s)
        );
        inst.setMatrixAt(ii++, m);
      }
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  // ===== rocks + bushes =====
  if (env.ground !== 'cloud') {
    if (env.rocks) {
      const rockGeo = new THREE.IcosahedronGeometry(1, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: theme.hillA, roughness: 0.95, flatShading: true });
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, env.rocks);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      for (let i = 0; i < env.rocks; i++) {
        const u = rng();
        const side = rng() > 0.5 ? 1 : -1;
        const f = frameAt(u);
        const off = side * (BANK_OUT + 2 + rng() * 55);
        const s = 0.5 + rng() * 1.9;
        e.set(rng() * 3, rng() * 3, rng() * 3);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(f.p.x + f.right.x * off, s * 0.3, f.p.z + f.right.z * off),
          q, new THREE.Vector3(s, s * 0.6, s)
        );
        rocks.setMatrixAt(i, m);
      }
      rocks.instanceMatrix.needsUpdate = true;
      group.add(rocks);
    }
    if (env.bushes) {
      const bushGeo = new THREE.IcosahedronGeometry(1, 1);
      const bushMat = new THREE.MeshStandardMaterial({ color: theme.propLeaf, roughness: 0.92, flatShading: true });
      const bushes = new THREE.InstancedMesh(bushGeo, bushMat, env.bushes);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      for (let i = 0; i < env.bushes; i++) {
        const u = rng();
        const side = rng() > 0.5 ? 1 : -1;
        const f = frameAt(u);
        const off = side * (10 + rng() * 50);
        const s = 0.5 + rng() * 1.35;
        e.set(0, rng() * 6, 0);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(
            f.p.x + f.right.x * off,
            groundYAt(off, f.p.y) + s * 0.5,
            f.p.z + f.right.z * off
          ),
          q, new THREE.Vector3(s * 1.3, s, s * 1.2)
        );
        bushes.setMatrixAt(i, m);
      }
      bushes.instanceMatrix.needsUpdate = true;
      group.add(bushes);
    }
  }

  // ===== jungle ruins =====
  if (env.ruins) {
    const ruinMat = new THREE.MeshStandardMaterial({ color: 0x7c8468, roughness: 0.95, flatShading: true });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x4d7a3c, roughness: 0.95, flatShading: true });
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ruinMat, env.ruins * 4);
    const moss = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mossMat, env.ruins);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let bi = 0;
    let mi = 0;
    for (let i = 0; i < env.ruins; i++) {
      const u = rng();
      const side = rng() > 0.5 ? 1 : -1;
      const f = frameAt(u);
      const off = side * (BANK_OUT + 4 + rng() * 26);
      const baseX = f.p.x + f.right.x * off;
      const baseZ = f.p.z + f.right.z * off;
      const y = groundYAt(off, f.p.y);
      const h = 3.2 + rng() * 5;
      const w = 1.4 + rng() * 1.4;
      e.set(0, rng() * Math.PI, (rng() - 0.5) * 0.06);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(baseX, y + h / 2, baseZ), q, new THREE.Vector3(w, h, w * 0.8));
      blocks.setMatrixAt(bi++, m);
      const top = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < 2; k++) {
        const sh = 0.5 + rng() * 0.7;
        e.set((rng() - 0.5) * 0.2, rng() * Math.PI, (rng() - 0.5) * 0.2);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(baseX + (rng() - 0.5) * w * 1.4, y + h + sh / 2 + k * 0.1, baseZ + (rng() - 0.5) * w),
          q, new THREE.Vector3(w * (1 + top * 0.2), sh, w * 0.9)
        );
        blocks.setMatrixAt(bi++, m);
      }
      e.set(0, rng() * Math.PI, 0);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(baseX, y + 0.16, baseZ),
        q, new THREE.Vector3(w * 1.5, 0.32, w * 1.2)
      );
      moss.setMatrixAt(mi++, m);
    }
    blocks.count = bi;
    blocks.instanceMatrix.needsUpdate = true;
    moss.count = mi;
    moss.instanceMatrix.needsUpdate = true;
    group.add(blocks, moss);
  }

  // ===== frost ice spires =====
  if (env.iceSpires) {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xbfefff, roughness: 0.18, metalness: 0.25,
      emissive: 0x7fdcff, emissiveIntensity: 0.35, flatShading: true,
    });
    const inst = new THREE.InstancedMesh(geo, mat, env.iceSpires);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < env.iceSpires; i++) {
      const u = rng();
      const side = rng() > 0.5 ? 1 : -1;
      const f = frameAt(u);
      const off = side * (BANK_OUT + 2 + rng() * 34);
      const w = 0.7 + rng() * 1.5;
      const h = 2.5 + rng() * 5;
      e.set((rng() - 0.5) * 0.3, rng() * Math.PI, (rng() - 0.5) * 0.3);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(f.p.x + f.right.x * off, groundYAt(off, f.p.y) + h * 0.5, f.p.z + f.right.z * off),
        q, new THREE.Vector3(w, h, w)
      );
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  // ===== light towers (instanced) =====
  if (env.lightTowers) {
    const n = env.lightTowers;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdde8f4, roughness: 0.45, metalness: 0.35 });
    const headMat = new THREE.MeshBasicMaterial({ color: theme.light, toneMapped: false });
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.28, 1, 7);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
    const heads = new THREE.InstancedMesh(boxGeo, poleMat, n);
    const lamps = new THREE.InstancedMesh(boxGeo, headMat, n);
    poles.castShadow = shadows;
    const parent = new THREE.Object3D();
    const child = new THREE.Object3D();
    const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const u = i / n + 0.03;
      const side = i % 2 ? 1 : -1;
      const f = frameAt(u);
      const off = side * 21;
      parent.position.set(f.p.x + f.right.x * off, groundYAt(off, f.p.y), f.p.z + f.right.z * off);
      parent.rotation.set(0, Math.atan2(-f.right.x * side, -f.right.z * side), 0);
      parent.updateMatrix();
      child.rotation.set(0, 0, 0);
      child.position.set(0, 7.5, 0);
      child.scale.set(1, 15, 1);
      child.updateMatrix();
      poles.setMatrixAt(i, mm.multiplyMatrices(parent.matrix, child.matrix));
      child.position.set(0, 15.1, 0);
      child.scale.set(3.4, 0.3, 0.7);
      child.updateMatrix();
      heads.setMatrixAt(i, mm.multiplyMatrices(parent.matrix, child.matrix));
      child.position.set(0, 14.7, 0);
      child.scale.set(3.1, 0.5, 0.5);
      child.updateMatrix();
      lamps.setMatrixAt(i, mm.multiplyMatrices(parent.matrix, child.matrix));
    }
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    group.add(poles, heads, lamps);
  }

  // ===== tyre stacks =====
  if (env.tyres) {
    const tyreGeo = new THREE.TorusGeometry(0.55, 0.2, 8, 14);
    tyreGeo.rotateX(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.9 });
    const spots = [];
    for (let i = 0; i < env.tyres; i++) {
      const u = (i / env.tyres + 0.012) % 1;
      const side = rng() > 0.5 ? 1 : -1;
      const f = frameAt(u);
      const off = side * (HALF + 3.4);
      spots.push({
        x: f.p.x + f.right.x * off,
        y: groundYAt(off, f.p.y),
        z: f.p.z + f.right.z * off,
        r: rng() * Math.PI,
      });
    }
    const stacks = new THREE.InstancedMesh(tyreGeo, tyreMat, spots.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let idx = 0;
    spots.forEach((p) => {
      for (let k = 0; k < 2; k++) {
        e.set(0, p.r, 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(p.x, p.y + 0.22 + k * 0.4, p.z), q, new THREE.Vector3(1, 1, 1));
        stacks.setMatrixAt(idx++, m);
      }
    });
    stacks.instanceMatrix.needsUpdate = true;
    group.add(stacks);
  }

  // ===== catch fence =====
  if (env.fences) {
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.2, 5);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xc7d6e8, roughness: 0.5, metalness: 0.3 });
    const count = Math.ceil(N / 14) * 2;
    const posts = new THREE.InstancedMesh(postGeo, postMat, count);
    const m = new THREE.Matrix4();
    let idx = 0;
    for (let i = 0; i < N; i += 14) {
      const s = samples[i];
      for (const side of [-1, 1]) {
        if (idx >= count) break;
        const off = side * (WALL_OFF + 1.6);
        m.makeTranslation(
          s.p.x + s.right.x * off,
          groundYAt(off, s.p.y) + 1.6,
          s.p.z + s.right.z * off
        );
        posts.setMatrixAt(idx++, m);
      }
    }
    posts.count = idx;
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);
  }

  // ===== start grid =====
  {
    const mat = new THREE.MeshBasicMaterial({
      color: theme.railA, transparent: true, opacity: 0.42, toneMapped: false,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(2.6, 0.22);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const u = 1 - (19 + i * 5) / length;
      const f = frameAt(u);
      const side = i % 2 ? 1 : -1;
      const slot = new THREE.Mesh(geo, mat);
      slot.position.set(
        f.p.x + f.right.x * side * 2.4,
        f.p.y + 0.03,
        f.p.z + f.right.z * side * 2.4
      );
      slot.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
      group.add(slot);
    }
  }

  // ===== floating islands (skyway) =====
  if (env.islands) {
    const topMat = new THREE.MeshStandardMaterial({ map: cloneTex(terrainTex, 3, 3), roughness: 0.95 });
    const rockMat = new THREE.MeshStandardMaterial({ color: theme.hillB, roughness: 0.95, flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: theme.crystal, emissive: theme.crystal, emissiveIntensity: 0.65,
      roughness: 0.2, metalness: 0.4, flatShading: true,
    });
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8 + (rng() - 0.5) * 0.02;
      const f = frameAt(u);
      const side = i % 2 ? 1 : -1;
      const off = side * (HALF + 26 + rng() * 54);
      const x = f.p.x + f.right.x * off;
      const z = f.p.z + f.right.z * off;
      const y = f.p.y + (i % 3 === 0 ? -13 : -5) + rng() * 12;
      const rr = 10 + rng() * 15;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 1.05, 2.6, 8), topMat);
      top.position.set(x, y, z);
      group.add(top);
      const under = new THREE.Mesh(new THREE.ConeGeometry(rr * 1.02, 8 + rng() * 12, 8), rockMat);
      under.rotation.x = Math.PI;
      under.position.set(x, y - 6 - rng() * 3, z);
      group.add(under);
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystalMat);
      cry.position.set(x, y + 2.8, z);
      cry.scale.set(1.8 + rng() * 1.2, 3.4 + rng() * 2.4, 1.8 + rng() * 1.2);
      group.add(cry);
      for (let k = 0; k < 1; k++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: textures.cloud, transparent: true, opacity: 0.3 + rng() * 0.25,
          depthWrite: false, fog: true,
        }));
        spr.position.set(x + (rng() - 0.5) * rr * 2.4, y - 2 - rng() * 5, z + (rng() - 0.5) * rr * 2.4);
        const ss = 18 + rng() * 34;
        spr.scale.set(ss, ss * 0.45, 1);
        group.add(spr);
      }
    }
  }

  // ===== skyway support pillars =====
  if (env.supports) {
    const step = 22;
    const count = Math.ceil(N / step);
    const geo = new THREE.CylinderGeometry(0.42, 0.62, 1, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbccbdb, roughness: 0.5, metalness: 0.35 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    let idx = 0;
    for (let i = 0; i < N; i += step) {
      const s = samples[i];
      const bottom = -24;
      const h = Math.max(4, s.p.y - bottom);
      m.compose(
        new THREE.Vector3(s.p.x, (s.p.y + bottom) / 2, s.p.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, h, 1)
      );
      inst.setMatrixAt(idx++, m);
    }
    inst.count = idx;
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  // ===== flags, gantry =====
  const startLights = [];
  {
    const f = samples[0];
    const g = new THREE.Group();
    g.position.set(f.p.x, f.p.y, f.p.z);
    g.rotation.y = Math.atan2(-f.tangent.x, -f.tangent.z);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.45, metalness: 0.25 });
    const accentMat = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.4, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.85, 8.2, 0.85), pillarMat);
      pil.position.set(side * 10.45, 4.1, 0);
      pil.castShadow = shadows;
      g.add(pil);
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.45, 0.92), k % 2 ? accentMat : pillarMat);
        band.position.set(side * 10.45, 1.1 + k * 1.15, 0);
        g.add(band);
      }
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(21.8, 0.7, 1.0), accentMat);
    beam.position.set(0, 8.2, 0);
    beam.castShadow = shadows;
    g.add(beam);
    const css = themeCss(theme);
    const bannerTex = textures.trackBanner(spec.name, spec.en, css.accent, css.horizon, '#061426');
    localTextures.push(bannerTex);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(20.6, 2.35),
      new THREE.MeshStandardMaterial({
        map: bannerTex, roughness: 0.55, metalness: 0.05,
        emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: theme.id === 'neon' ? 0.5 : 0.24,
        side: THREE.DoubleSide,
      })
    );
    banner.position.set(0, 7.0, 0.0);
    g.add(banner);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a1414, toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), mat);
      lamp.position.set(-3.6 + i * 2.4, 6.05, 0.42);
      g.add(lamp);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.glow, color: 0xff3b30, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      halo.scale.set(1.35, 1.35, 1);
      halo.position.copy(lamp.position);
      g.add(halo);
      startLights.push({ mat, halo });
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), pillarMat);
        mast.position.set(side * (7 + k * 2.2), 9.8, 0);
        g.add(mast);
        const flag = new THREE.Mesh(
          new THREE.PlaneGeometry(1.7, 1.0),
          new THREE.MeshStandardMaterial({ map: textures.flag, side: THREE.DoubleSide, roughness: 0.8 })
        );
        flag.position.set(side * (7 + k * 2.2) + 0.9, 10.9, 0);
        g.add(flag);
      }
    }
    group.add(g);
  }

  // ===== grandstands =====
  if (env.stands) {
    const buildStand = (u, side, offset, width, depth) => {
      const f = frameAt(u);
      const g = new THREE.Group();
      const dir = new THREE.Vector3(-f.right.x * side, 0, -f.right.z * side).normalize();
      g.position.set(
        f.p.x + f.right.x * side * offset,
        groundYAt(offset, f.p.y) - 0.2,
        f.p.z + f.right.z * side * offset
      );
      g.rotation.y = Math.atan2(dir.x, dir.z);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(width, 5.6, depth),
        new THREE.MeshStandardMaterial({ color: 0x263b56, roughness: 0.82 })
      );
      base.position.y = 2.8;
      base.castShadow = shadows;
      g.add(base);
      const crowd = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.96, 5.0),
        new THREE.MeshBasicMaterial({ map: textures.crowd })
      );
      crowd.position.set(0, 3.0, depth / 2 + 0.02);
      g.add(crowd);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width + 2, 0.36, depth + 2),
        new THREE.MeshStandardMaterial({ color: theme.standsRoof, roughness: 0.5, metalness: 0.1 })
      );
      roof.position.y = 7.2;
      roof.castShadow = shadows;
      g.add(roof);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 1.7, 0.3),
          new THREE.MeshStandardMaterial({ color: 0xf1f6ff, roughness: 0.5 })
        );
        post.position.set(sx * (width / 2 - 0.2), 6.4, depth / 2 - 0.2);
        g.add(post);
      }
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(7.5, 1.6),
        new THREE.MeshBasicMaterial({ map: textures.flag, side: THREE.DoubleSide })
      );
      flag.position.set(0, 5.95, depth / 2 + 0.35);
      g.add(flag);
      group.add(g);
    };
    buildStand(0.012, -1, 18, 28, 11);
    buildStand(0.035, 1, 18, 24, 10);
    buildStand(0.055, -1, 20, 20, 9);
  }

  // ===== billboards (instanced posts/frames, boards grouped by texture) =====
  if (env.billboards) {
    const boards = textures.billboards;
    const defs = [
      [0.075, -1], [0.155, 1], [0.25, -1], [0.35, 1], [0.47, -1],
      [0.58, 1], [0.70, -1], [0.81, 1], [0.90, -1],
    ];
    const n = defs.length;
    const postGeo = new THREE.BoxGeometry(0.3, 6.4, 0.3);
    const frameGeo = new THREE.BoxGeometry(7.6, 4.4, 0.12);
    const boardGeo = new THREE.PlaneGeometry(7.2, 4.05);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4e, roughness: 0.6, metalness: 0.2 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0d1a2a, roughness: 0.6 });
    const boardMats = boards.map((tex) => new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.5, metalness: 0.08,
      emissive: 0xffffff, emissiveMap: tex,
      emissiveIntensity: theme.billboardGlow, side: THREE.DoubleSide,
    }));
    const posts = new THREE.InstancedMesh(postGeo, postMat, n * 2);
    const frames = new THREE.InstancedMesh(frameGeo, frameMat, n);
    posts.castShadow = shadows;
    const boardGroups = boards.map(() => []);
    const parent = new THREE.Object3D();
    const child = new THREE.Object3D();
    const mm = new THREE.Matrix4();
    let pi = 0;
    defs.forEach(([u, side], i) => {
      const f = frameAt(u);
      const off = side * (HALF + 14);
      const dir = new THREE.Vector3(
        -f.right.x * side - f.tangent.x * 0.25, 0,
        -f.right.z * side - f.tangent.z * 0.25
      ).normalize();
      parent.position.set(f.p.x + f.right.x * off, groundYAt(off, f.p.y), f.p.z + f.right.z * off);
      parent.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      parent.updateMatrix();
      child.rotation.set(0, 0, 0);
      child.scale.set(1, 1, 1);
      for (const sx of [-1, 1]) {
        child.position.set(sx * 3.0, 3.2, 0);
        child.updateMatrix();
        posts.setMatrixAt(pi++, mm.multiplyMatrices(parent.matrix, child.matrix));
      }
      child.position.set(0, 6.0, 0.08);
      child.updateMatrix();
      frames.setMatrixAt(i, mm.multiplyMatrices(parent.matrix, child.matrix));
      child.position.set(0, 6.0, 0.18);
      child.updateMatrix();
      boardGroups[i % boards.length].push(mm.multiplyMatrices(parent.matrix, child.matrix).clone());
    });
    posts.instanceMatrix.needsUpdate = true;
    frames.instanceMatrix.needsUpdate = true;
    group.add(posts, frames);
    boardGroups.forEach((mats, ti) => {
      if (!mats.length) return;
      const inst = new THREE.InstancedMesh(boardGeo, boardMats[ti], mats.length);
      inst.castShadow = shadows;
      mats.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    });
  }

  // ===== lighthouse =====
  if (env.lighthouse) {
    const f = frameAt(0.62);
    const p = new THREE.Vector3(f.p.x + f.right.x * 78, 0, f.p.z + f.right.z * 78);
    const g = new THREE.Group();
    g.position.copy(p);
    const white = new THREE.MeshStandardMaterial({ color: 0xf7f3e6, roughness: 0.65 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd83b35, roughness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.3, 3.2, 12), white);
    base.position.y = 1.6;
    g.add(base);
    let y = 3.2;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.05 - i * 0.25, 2.4 - i * 0.25, 4.2, 12), i % 2 ? red : white);
      seg.position.y = y + 2.1;
      g.add(seg);
      y += 4.2;
    }
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.35, 1.7, 12),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd166, emissiveIntensity: 1.4 })
    );
    lantern.position.y = y + 0.9;
    g.add(lantern);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.6, 12), red);
    roof.position.y = y + 2.55;
    g.add(roof);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), red);
    cap.position.y = y + 3.45;
    g.add(cap);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.glow, color: 0xffe08a, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    halo.position.y = y + 1.0;
    halo.scale.set(10, 10, 1);
    g.add(halo);
    g.scale.setScalar(1.4);
    group.add(g);
  }

  // ===== blimp =====
  let blimp = null;
  let blimpBase = new THREE.Vector3();
  if (env.blimp) {
    blimp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xf7f9ff, roughness: 0.45, metalness: 0.15 })
    );
    body.scale.set(11, 3.4, 3.4);
    blimp.add(body);
    const stripe = new THREE.Mesh(
      new THREE.SphereGeometry(1.01, 24, 8, 0, Math.PI * 2, 1.2, 0.5),
      new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.5 })
    );
    stripe.scale.set(11, 3.45, 3.45);
    blimp.add(stripe);
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.55 })
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -10.6;
    blimp.add(tail);
    for (const rz of [1, -1]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.16, 4.6),
        new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.55 })
      );
      fin.position.set(-9.2, 0, 0);
      fin.rotation.x = rz * 0.5;
      blimp.add(fin);
    }
    const gondola = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 2.0, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x14283e, roughness: 0.6, metalness: 0.2 })
    );
    gondola.position.set(0, -3.7, 0);
    blimp.add(gondola);
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(8.5, 2.2),
        new THREE.MeshBasicMaterial({ map: textures.billboards[4], side: THREE.DoubleSide })
      );
      sign.position.set(0, 1.4, side * 3.45);
      sign.rotation.y = side > 0 ? 0 : Math.PI;
      blimp.add(sign);
    }
    blimpBase.set(centroid.x - boundR * 0.4, theme.id === 'sky' ? 74 : 58, centroid.z - boundR * 0.25);
    blimp.position.copy(blimpBase);
    blimp.rotation.y = -0.5;
    group.add(blimp);
  }

  // ===== sailboats =====
  const boats = [];
  if (env.ocean && env.boats) {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.4, metalness: 0.1 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.7, side: THREE.DoubleSide });
    const sailMat2 = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 3.6, 4, 8), hullMat);
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(0.7, 1, 0.55);
      g.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.2, 5), hullMat);
      mast.position.y = 2.6;
      g.add(mast);
      const sailShape = new THREE.BufferGeometry();
      sailShape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, 0, 5.1, 0, 2.9, 0.75, 0], 3));
      sailShape.computeVertexNormals();
      const sail = new THREE.Mesh(sailShape, i % 2 ? sailMat : sailMat2);
      sail.position.set(0.1, 0.2, 0);
      g.add(sail);
      const ang = rng() * Math.PI * 2;
      const rad = boundR + 120 + rng() * 160;
      g.position.set(centroid.x + Math.cos(ang) * rad, theme.fluid.y + 0.1, centroid.z + Math.sin(ang) * rad);
      g.rotation.y = rng() * Math.PI * 2;
      group.add(g);
      boats.push({ g, phase: rng() * Math.PI * 2, drift: 0.2 + rng() * 0.5, baseY: g.position.y });
    }
  }

  // ===== clouds =====
  const clouds = [];
  for (let i = 0; i < env.clouds; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.cloud, transparent: true, opacity: 0.45 + rng() * 0.35,
      depthWrite: false, fog: true,
    }));
    const ang = rng() * Math.PI * 2;
    const isSky = theme.id === 'sky';
    const rad = isSky ? boundR + 50 + rng() * 420 : boundR + 120 + rng() * 480;
    const y = isSky ? -14 + rng() * 46 : 50 + rng() * 85;
    spr.position.set(centroid.x + Math.cos(ang) * rad, y, centroid.z + Math.sin(ang) * rad);
    const s = isSky ? 55 + rng() * 120 : 50 + rng() * 85;
    spr.scale.set(s, s * 0.5, 1);
    group.add(spr);
    clouds.push({ spr, baseX: spr.position.x, speed: 0.6 + rng() * 1.2 });
  }

  // ===== weather =====
  let weather = null;
  if (env.weather) {
    const isSnow = env.weather === 'snow';
    const count = isSnow ? 900 : 520;
    const pos = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const startP = samples[0].p;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = startP.x + (rng() - 0.5) * 240;
      pos[i * 3 + 1] = startP.y + rng() * 70;
      pos[i * 3 + 2] = startP.z + (rng() - 0.5) * 240;
      speeds[i] = isSnow ? 2.2 + rng() * 3.6 : 1.4 + rng() * 2.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: isSnow ? 0.3 : 0.24,
      map: textures.glow,
      transparent: true,
      opacity: isSnow ? 0.85 : 0.7,
      depthWrite: false,
      blending: isSnow ? THREE.NormalBlending : THREE.AdditiveBlending,
      color: isSnow ? 0xffffff : 0xff9a4a,
      sizeAttenuation: true,
      toneMapped: false,
      alphaTest: 0.02,
    });
    const pointsMesh = new THREE.Points(geo, mat);
    pointsMesh.frustumCulled = false;
    group.add(pointsMesh);
    weather = { mesh: pointsMesh, geo, posAttr: geo.attributes.position, speeds, count, isSnow };
  }

  // ===== helpers =====
  function frameAt(u) {
    u = ((u % 1) + 1) % 1;
    const f = u * N;
    const i = Math.floor(f) % N;
    const j = (i + 1) % N;
    const k = f - Math.floor(f);
    const a = samples[i], b = samples[j];
    const p = a.p.clone().lerp(b.p, k);
    const t = a.tangent.clone().lerp(b.tangent, k).normalize();
    const r = new THREE.Vector3().crossVectors(UP, t).normalize();
    return { p, tangent: t, right: r, u, index: i };
  }

  function nearest(pos, hint = -1) {
    let best = -1;
    let bestD = Infinity;
    const startI = hint < 0 ? 0 : hint - 90;
    const endI = hint < 0 ? N : hint + 90;
    for (let k = startI; k < endI; k++) {
      const i = ((k % N) + N) % N;
      const p = samples[i].p;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const s = samples[best];
    const dx = pos.x - s.p.x;
    const dz = pos.z - s.p.z;
    const offset = dx * s.right.x + dz * s.right.z;
    return {
      index: best,
      u: best / N,
      offset,
      y: s.p.y,
      tangent: s.tangent,
      right: s.right,
      point: s.p,
    };
  }

  // minimap projection
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.p.x);
    maxX = Math.max(maxX, s.p.x);
    minZ = Math.min(minZ, s.p.z);
    maxZ = Math.max(maxZ, s.p.z);
  }
  const padN = 0.06;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const span = Math.max(spanX, spanZ);
  const mapPoints = samples.map((s) => ({
    x: padN + (s.p.x - minX + (span - spanX) / 2) / span * (1 - padN * 2),
    y: padN + (s.p.z - minZ + (span - spanZ) / 2) / span * (1 - padN * 2),
  }));
  const padCenters = boostPads.map((p) => ({ u: p.u, lane: p.lane }));
  const itemCenters = itemBoxes.map((b) => ({ u: b.u, lane: b.lane }));
  function mapProject(x, z) {
    return {
      x: padN + (x - minX + (span - spanX) / 2) / span * (1 - padN * 2),
      y: padN + (z - minZ + (span - spanZ) / 2) / span * (1 - padN * 2),
    };
  }

  // ===== animation =====
  let time = 0;
  let lightState = { active: 0, go: false, since: 0 };

  function update(dt, camera) {
    time += dt;
    if (waterUniforms) waterUniforms.uTime.value = time;
    skyMat.uniforms.uTime.value = time;
    for (const pad of boostPads) {
      pad.map.offset.y -= dt * 1.35;
      pad.gmat.opacity = 0.26 + Math.sin(time * 4 + pad.u * 20) * 0.1;
      if (pad.cooldown > 0) pad.cooldown -= dt;
    }
    for (let i = 0; i < itemBoxes.length; i++) {
      const box = itemBoxes[i];
      if (!box.active) {
        box.cooldown -= dt;
        if (box.cooldown <= 0) {
          box.active = true;
          box.spawn = 0.2;
        }
      }
      const active = box.active;
      const bob = Math.sin(time * 2.2 + box.phase) * 0.22;
      const y = box.center.y + bob;
      if (active) box.spawn = Math.min(1, box.spawn + dt * 5);
      const s = active ? box.spawn : 0;
      boxDummy.position.set(box.center.x, y, box.center.z);
      boxDummy.rotation.set(
        Math.sin(time * 0.9 + box.phase) * 0.16,
        time * 1.6 + box.spin,
        0
      );
      boxDummy.scale.setScalar(s);
      boxDummy.updateMatrix();
      boxMesh.setMatrixAt(i, boxDummy.matrix);
      ringDummy.position.set(box.center.x, y, box.center.z);
      ringDummy.rotation.set(0, time * 1.1 + box.spin, 0);
      ringDummy.scale.setScalar(s);
      ringDummy.updateMatrix();
      ringMesh.setMatrixAt(i, ringDummy.matrix);
      glowPositions[i * 3] = box.center.x;
      glowPositions[i * 3 + 1] = active ? y : -9999;
      glowPositions[i * 3 + 2] = box.center.z;
    }
    boxMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = true;
    if (lightState.go) {
      lightState.since += dt;
      const fade = clamp01(1 - (lightState.since - 1.6) / 1.4);
      startLights.forEach((l) => {
        l.halo.material.opacity = 0.95 * fade + 0.08;
      });
    }
    if (blimp) {
      blimp.position.x = blimpBase.x + Math.sin(time * 0.055) * 70;
      blimp.position.z = blimpBase.z + Math.cos(time * 0.055) * 55;
      blimp.position.y = blimpBase.y + Math.sin(time * 0.4) * 1.2;
      blimp.rotation.y = -time * 0.055;
    }
    for (const c of clouds) {
      c.spr.position.x = c.baseX + time * c.speed;
      if (c.spr.position.x > centroid.x + 1000) c.spr.position.x -= 2000;
    }
    for (const b of boats) {
      b.g.position.y = b.baseY + Math.sin(time * 0.9 + b.phase) * 0.16;
      b.g.rotation.z = Math.sin(time * 0.7 + b.phase) * 0.045;
      b.g.rotation.y += dt * b.drift * 0.08;
    }
    for (const s of volcanoSmoke) {
      s.spr.position.y = (s.baseY + time * 1.6) % 110 + 10;
      s.spr.position.x = s.x + Math.sin(time * 0.3 + s.phase) * 12;
      s.spr.material.opacity = 0.06 + 0.14 * (1 - (s.spr.position.y - 70) / 60);
      if (s.spr.position.y > 118) s.spr.position.y = 12;
    }
    if (centralVolcano) {
      centralVolcano.craterGlow.material.opacity = 0.7 + Math.sin(time * 1.7) * 0.12;
    }
    if (cloudSea) cloudSea.position.x = centroid.x;
    if (weather) {
      const arr = weather.posAttr.array;
      const cam = camera ? camera.position : null;
      for (let i = 0; i < weather.count; i++) {
        arr[i * 3 + 1] -= weather.speeds[i] * dt;
        arr[i * 3] += Math.sin(time * 0.7 + i * 1.7) * dt * (weather.isSnow ? 0.8 : 0.35);
        const floor = (cam ? cam.y : 0) - 26;
        if (arr[i * 3 + 1] < floor) {
          arr[i * 3] = (cam ? cam.x : 0) + (Math.random() - 0.5) * 230;
          arr[i * 3 + 1] = (cam ? cam.y : 0) + 36 + Math.random() * 12;
          arr[i * 3 + 2] = (cam ? cam.z : 0) + (Math.random() - 0.5) * 230;
        }
      }
      weather.posAttr.needsUpdate = true;
    }
    return time;
  }

  function setStartLights(active, go) {
    lightState = { active, go: !!go, since: go ? 0 : lightState.since };
    startLights.forEach((l, i) => {
      if (go) {
        l.mat.color.setHex(0x36ff8a);
        l.halo.material.color.setHex(0x36ff8a);
        l.halo.material.opacity = 0.95;
      } else {
        const on = i < active;
        l.mat.color.setHex(on ? 0xff3226 : 0x3a1414);
        l.halo.material.color.setHex(0xff3226);
        l.halo.material.opacity = on ? 0.55 : 0.0;
      }
    });
  }

  function resetItemBoxes() {
    for (const box of itemBoxes) {
      box.active = true;
      box.cooldown = 0;
      box.spawn = 0.2;
    }
  }

  function dispose() {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    for (const t of localTextures) t.dispose();
    localTextures.length = 0;
  }

  return {
    group, curve, samples, length, N, half: HALF, width: HALF * 2,
    name: spec.name, en: spec.en, id: spec.id, theme, env, spec,
    startFrame, boostPads, itemBoxes, startLights,
    minimap: { points: mapPoints, padCenters, itemCenters, mapProject },
    frameAt, nearest, update, setStartLights, resetItemBoxes, dispose,
    sunDir, centroid, boundR,
  };
}
