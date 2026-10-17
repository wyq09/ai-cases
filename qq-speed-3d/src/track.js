import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function makeCanvas(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  // close seam
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

function buildCurbs(samples, n, halfWidth, width, yOffset) {
  const pos = [], col = [], idx = [];
  const red = new THREE.Color(0xe8403a);
  const white = new THREE.Color(0xf5f8ff);
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

function buildEmbankment(samples, n, halfWidth, outerWidth, yOffset) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const { p, right, dist } = samples[i];
    for (const side of [-1, 1]) {
      pos.push(
        p.x + right.x * side * halfWidth, p.y + yOffset, p.z + right.z * side * halfWidth,
        p.x + right.x * side * outerWidth, 0.02, p.z + right.z * side * outerWidth
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
    // serrated leaf edge via alternating width
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

export function createTrack(scene, renderer, textures, quality) {
  const group = new THREE.Group();
  scene.add(group);

  const points = [
    [0, 0.6, 70], [90, 1.2, 66], [165, 2.2, 45], [200, 3.0, 0],
    [195, 2.4, -60], [160, 1.2, -105], [95, 0.6, -125], [35, 1.0, -115],
    [-20, 2.2, -140], [-85, 3.4, -155], [-150, 2.6, -140], [-205, 1.2, -100],
    [-230, 0.8, -40], [-225, 1.4, 20], [-185, 0.8, 58], [-95, 0.6, 70],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.42);
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
    samples.push({
      p: p.clone(), tangent: tangent.clone(), right: right.clone(), dist,
    });
    dist += stepLen;
  }

  const HALF = 7.5;
  const CURB_W = 0.95;
  const WALL_OFF = HALF + 2.15;

  // asphalt
  const roadTex = textures.asphalt;
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex, roughness: 0.86, metalness: 0.05, color: 0xb9c4d4,
  });
  const road = new THREE.Mesh(buildRibbon(samples, N, HALF, 0), roadMat);
  road.receiveShadow = true;
  group.add(road);

  // curbs
  const curbMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide,
  });
  const curbs = new THREE.Mesh(buildCurbs(samples, N, HALF, CURB_W, 0.018), curbMat);
  curbs.receiveShadow = true;
  group.add(curbs);

  // embankment
  const grassTex = textures.grass.clone();
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(1, 1);
  grassTex.needsUpdate = true;
  const bankMat = new THREE.MeshStandardMaterial({
    map: grassTex, roughness: 0.98, color: 0xbfe6a4, side: THREE.DoubleSide,
  });
  const bank = new THREE.Mesh(buildEmbankment(samples, N, HALF + CURB_W, HALF + 18, -0.04), bankMat);
  bank.receiveShadow = true;
  group.add(bank);

  // barriers
  {
    // Short segments (2 samples) keep the chord sag on tight corners far below the
    // car's collision clearance, so the chassis can never visually enter the rail.
    const segStep = 2;
    const segLen = stepLen * segStep * 0.97;
    const insts = [];
    for (let i = 0; i < N; i += segStep) {
      const s = samples[i];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      for (const side of [-1, 1]) {
        insts.push({
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
    const mesh = new THREE.InstancedMesh(geo, mat, insts.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    insts.forEach((it, i) => {
      e.set(0, it.yaw, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
      col.setHex(it.alt ? 0xf5f8ff : 0xff4b3e);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);

    const railGeo = new THREE.BoxGeometry(0.16, 0.09, segLen);
    const railMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const rail = new THREE.InstancedMesh(railGeo, railMat, insts.length);
    insts.forEach((it, i) => {
      e.set(0, it.yaw, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(it.x, it.y + 0.35, it.z), q, new THREE.Vector3(1, 1, 1));
      rail.setMatrixAt(i, m);
      col.setHex(it.alt ? 0x34e6ff : 0x9ff7ff);
      rail.setColorAt(i, col);
    });
    rail.instanceMatrix.needsUpdate = true;
    if (rail.instanceColor) rail.instanceColor.needsUpdate = true;
    group.add(rail);
  }

  // start line
  const startFrame = samples[0];
  {
    const geo = new THREE.PlaneGeometry(HALF * 2 - 1.4, 3.0);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: textures.checker, roughness: 0.8, metalness: 0.03, transparent: false,
    });
    const line = new THREE.Mesh(geo, mat);
    line.position.set(startFrame.p.x, startFrame.p.y + 0.028, startFrame.p.z);
    line.rotation.y = Math.atan2(startFrame.tangent.x, startFrame.tangent.z);
    line.receiveShadow = true;
    group.add(line);
  }

  // boost pads
  const boostPads = [];
  const padDefs = [
    [0.105, -2.6], [0.19, 2.8], [0.295, 0], [0.405, -3.0], [0.52, 2.8],
    [0.635, 0], [0.73, -2.6], [0.845, 3.0], [0.93, 0],
  ];
  for (const [u, lane] of padDefs) {
    const f = frameAt(u);
    const padGroup = new THREE.Group();
    padGroup.position.set(f.p.x + f.right.x * lane, f.p.y + 0.035, f.p.z + f.right.z * lane);
    padGroup.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
    const map = textures.arrowPad.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.needsUpdate = true;
    map.offset.y = Math.random();
    const mat = new THREE.MeshBasicMaterial({
      map, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.0), mat);
    plane.rotation.x = -Math.PI / 2;
    padGroup.add(plane);
    const gmat = new THREE.MeshBasicMaterial({
      map: textures.glow, color: 0x1cd6ff, transparent: true, opacity: 0.35,
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

  // ===== environment =====
  const env = new THREE.Group();
  group.add(env);

  // sky
  const sunDir = new THREE.Vector3(0.62, 0.4, -0.34).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x1b66c8) },
      horizonColor: { value: new THREE.Color(0xd8f3ff) },
      sunDir: { value: sunDir },
      sunColor: { value: new THREE.Color(0xfff6dc) },
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
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, smoothstep(0.5, 0.95, h));
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
    map: textures.glow, color: 0xfff2c8, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  sunSprite.position.copy(sunDir).multiplyScalar(820);
  sunSprite.scale.set(120, 120, 1);
  sunSprite.renderOrder = -19;
  group.add(sunSprite);

  // ocean
  const waterUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x07558f) },
    uShallow: { value: new THREE.Color(0x39c8de) },
    uHorizon: { value: new THREE.Color(0xcdefff) },
    uSun: { value: sunDir },
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
        varying vec3 vWorld;
        void main() {
          float d = length(vWorld.xz - cameraPosition.xz);
          float a = sin(vWorld.x * 0.045 + uTime * 0.85 + sin(vWorld.z * 0.028 + uTime * 0.55) * 1.6);
          float b = sin(vWorld.z * 0.06 + uTime * 1.15 + sin(vWorld.x * 0.02) * 2.0);
          float w = a * 0.5 + b * 0.5;
          vec3 col = mix(uDeep, uShallow, 0.18 + w * 0.12);
          float glint = pow(max(0.0, sin(vWorld.x * 0.32 + vWorld.z * 0.21 + uTime * 2.4)), 26.0);
          col += vec3(1.0, 0.93, 0.74) * glint * 0.35;
          float fogK = smoothstep(360.0, 1500.0, d);
          col = mix(col, uHorizon, fogK * 0.92);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -2.6;
  group.add(water);

  // island
  const groundTex = textures.grass;
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(262, 96),
    new THREE.MeshStandardMaterial({ map: groundTex, color: 0xbfe6a0, roughness: 0.98 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  const beachTex = textures.sand.clone();
  beachTex.wrapS = beachTex.wrapT = THREE.RepeatWrapping;
  beachTex.repeat.set(10, 10);
  beachTex.needsUpdate = true;
  const beach = new THREE.Mesh(
    new THREE.RingGeometry(254, 560, 96),
    new THREE.MeshStandardMaterial({ map: beachTex, color: 0xffe6ad, roughness: 0.96 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = -0.09;
  beach.receiveShadow = true;
  group.add(beach);

  // infield lagoon
  {
    const lagoonCenter = new THREE.Vector3(-4, 0, -46);
    const lagoonSand = new THREE.Mesh(
      new THREE.RingGeometry(72, 96, 72),
      new THREE.MeshStandardMaterial({ map: beachTex, color: 0xf5dca6, roughness: 0.97 })
    );
    lagoonSand.rotation.x = -Math.PI / 2;
    lagoonSand.position.set(lagoonCenter.x, -0.045, lagoonCenter.z);
    lagoonSand.receiveShadow = true;
    group.add(lagoonSand);
    const lagoonWater = new THREE.Mesh(
      new THREE.CircleGeometry(73, 72),
      new THREE.MeshStandardMaterial({
        color: 0x2fbcd6, roughness: 0.18, metalness: 0.28,
        transparent: true, opacity: 0.94,
      })
    );
    lagoonWater.rotation.x = -Math.PI / 2;
    lagoonWater.position.set(lagoonCenter.x, -0.9, lagoonCenter.z);
    group.add(lagoonWater);
    // a tiny island with palms in the lagoon
    const islet = new THREE.Mesh(
      new THREE.CircleGeometry(9, 24),
      new THREE.MeshStandardMaterial({ map: beachTex, color: 0xf6e2b0, roughness: 0.95 })
    );
    islet.rotation.x = -Math.PI / 2;
    islet.position.set(lagoonCenter.x - 18, -0.1, lagoonCenter.z + 12);
    group.add(islet);
  }

  // distant hills
  {
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x3f9164, roughness: 0.98, flatShading: true,
    });
    const hillMat2 = new THREE.MeshStandardMaterial({
      color: 0x2f7c62, roughness: 1, flatShading: true,
    });
    const spots = [
      [-360, -230, 90, 42], [-280, -330, 120, 55], [-120, -370, 100, 36],
      [60, -390, 130, 48], [280, -300, 100, 40], [400, -120, 90, 34],
      [-420, 80, 100, 38], [-390, 220, 80, 28], [230, 330, 110, 42],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [x, z, r, h] = spots[i];
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), i % 2 ? hillMat : hillMat2);
      hill.position.set(x, h / 2 - 1, z);
      hill.rotation.y = Math.random() * Math.PI;
      group.add(hill);
    }
  }

  // sailboats in the bay
  const boats = [];
  {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.4, metalness: 0.1 });
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xfff4dc, roughness: 0.7, side: THREE.DoubleSide,
    });
    const sailMat2 = new THREE.MeshStandardMaterial({
      color: 0xff8a3a, roughness: 0.7, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 3.6, 4, 8), hullMat);
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(0.7, 1, 0.55);
      g.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.2, 5), hullMat);
      mast.position.y = 2.6;
      g.add(mast);
      const sailShape = new THREE.BufferGeometry();
      sailShape.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0.6, 0, 0, 5.1, 0, 2.9, 0.75, 0,
      ], 3));
      sailShape.computeVertexNormals();
      const sail = new THREE.Mesh(sailShape, i % 2 ? sailMat : sailMat2);
      sail.position.set(0.1, 0.2, 0);
      g.add(sail);
      const ang = Math.random() * Math.PI * 2;
      const rad = 390 + Math.random() * 130;
      g.position.set(Math.cos(ang) * rad, -2.5, Math.sin(ang) * rad);
      g.rotation.y = Math.random() * Math.PI * 2;
      group.add(g);
      boats.push({ g, phase: Math.random() * Math.PI * 2, drift: 0.2 + Math.random() * 0.5 });
    }
  }
  {
    // waterfront city across the bay, on its own landmass
    const cityLand = new THREE.Mesh(
      new THREE.CircleGeometry(150, 72),
      new THREE.MeshStandardMaterial({ map: beachTex, color: 0xcfe2a8, roughness: 0.97 })
    );
    cityLand.rotation.x = -Math.PI / 2;
    cityLand.position.set(-430, -0.32, -30);
    group.add(cityLand);
    const winTex = textures.windows;
    const mat = new THREE.MeshStandardMaterial({
      map: winTex, color: 0xa9c4e2, roughness: 0.62, metalness: 0.12,
      emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.32,
    });
    const mat2 = new THREE.MeshStandardMaterial({
      map: winTex, color: 0x8fb4dc, roughness: 0.7, metalness: 0.1,
      emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.24,
    });
    for (let i = 0; i < 13; i++) {
      const w = 16 + Math.random() * 16;
      const h = 22 + Math.random() * 58;
      const d = 16 + Math.random() * 16;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i % 2 ? mat : mat2);
      b.position.set(-395 - Math.random() * 70, h / 2 - 1, -190 + i * 34);
      b.rotation.y = (Math.random() - 0.5) * 0.35;
      group.add(b);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.35, 3 + Math.random() * 5, d * 0.35),
        new THREE.MeshStandardMaterial({ color: 0x53657c, roughness: 0.8 })
      );
      roof.position.set(b.position.x + (Math.random() - 0.5) * 4, h + 2, b.position.z + (Math.random() - 0.5) * 4);
      group.add(roof);
    }
    // a second cluster far right, also on a small island
    const cityLand2 = new THREE.Mesh(
      new THREE.CircleGeometry(95, 48),
      new THREE.MeshStandardMaterial({ map: beachTex, color: 0xcfe2a8, roughness: 0.97 })
    );
    cityLand2.rotation.x = -Math.PI / 2;
    cityLand2.position.set(370, -0.3, 300);
    group.add(cityLand2);
    for (let i = 0; i < 6; i++) {
      const w = 14 + Math.random() * 14;
      const h = 18 + Math.random() * 36;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat2);
      b.position.set(320 + Math.random() * 60, h / 2 - 1, 260 + i * 30);
      group.add(b);
    }
  }

  // palms
  {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.3, 4.8, 7, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.95 });
    const leafGeo = frondGeometry();
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x2fa34f, roughness: 0.82, side: THREE.DoubleSide, flatShading: true,
    });
    const palmSpots = [];
    for (let i = 0; i < 44; i++) {
      const u = (i / 44 + Math.random() * 0.02) % 1;
      const side = Math.random() > 0.5 ? 1 : -1;
      const off = side * (17 + Math.random() * 38);
      const f = frameAt(u);
      palmSpots.push({
        x: f.p.x + f.right.x * off,
        z: f.p.z + f.right.z * off,
        y: 0,
        s: 0.8 + Math.random() * 0.6,
        rot: Math.random() * Math.PI * 2,
        lean: (Math.random() - 0.5) * 0.16,
      });
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    trunks.castShadow = quality.shadows;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    palmSpots.forEach((p, i) => {
      e.set(p.lean, p.rot, p.lean * 0.6);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, 2.4 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    group.add(trunks);

    const fronds = new THREE.InstancedMesh(leafGeo, leafMat, palmSpots.length * 9);
    fronds.castShadow = quality.shadows;
    let fi = 0;
    palmSpots.forEach((p) => {
      const topX = p.x + Math.sin(p.rot) * p.lean * 3;
      const topZ = p.z + Math.cos(p.rot) * p.lean * 3;
      for (let j = 0; j < 9; j++) {
        e.set(0, p.rot + (j / 9) * Math.PI * 2 + Math.random() * 0.2, (Math.random() - 0.35) * 0.3);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(topX, 4.75 * p.s, topZ),
          q,
          new THREE.Vector3(p.s, p.s, p.s)
        );
        fronds.setMatrixAt(fi++, m);
      }
    });
    fronds.instanceMatrix.needsUpdate = true;
    group.add(fronds);

    // coconut clusters
    const nutGeo = new THREE.SphereGeometry(0.18, 7, 6);
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x5b3a1c, roughness: 0.85 });
    const nuts = new THREE.InstancedMesh(nutGeo, nutMat, palmSpots.length * 3);
    fi = 0;
    palmSpots.forEach((p) => {
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * Math.PI * 2 + p.rot;
        m.compose(
          new THREE.Vector3(p.x + Math.cos(a) * 0.35, 4.55 * p.s, p.z + Math.sin(a) * 0.35),
          q.identity(),
          new THREE.Vector3(p.s, p.s, p.s)
        );
        nuts.setMatrixAt(fi++, m);
      }
    });
    nuts.instanceMatrix.needsUpdate = true;
    group.add(nuts);
  }

  // light towers
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdde8f4, roughness: 0.45, metalness: 0.35 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0, toneMapped: false });
    for (let i = 0; i < 8; i++) {
      const u = i / 8 + 0.03;
      const side = i % 2 ? 1 : -1;
      const f = frameAt(u);
      const g = new THREE.Group();
      g.position.set(
        f.p.x + f.right.x * side * 21,
        0,
        f.p.z + f.right.z * side * 21
      );
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 15, 7), poleMat);
      pole.position.y = 7.5;
      pole.castShadow = quality.shadows;
      g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.7), poleMat);
      head.position.y = 15.1;
      g.add(head);
      const lampBar = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.5, 0.5), headMat);
      lampBar.position.y = 14.7;
      g.add(lampBar);
      g.rotation.y = Math.atan2(-f.right.x * side, -f.right.z * side);
      group.add(g);
    }
  }

  // tyre stacks lining tight corners
  {
    const tyreGeo = new THREE.TorusGeometry(0.55, 0.2, 8, 14);
    tyreGeo.rotateX(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.9 });
    const spots = [];
    for (let i = 0; i < 44; i++) {
      const u = (i / 44 + 0.012) % 1;
      const side = Math.random() > 0.5 ? 1 : -1;
      const f = frameAt(u);
      spots.push({
        x: f.p.x + f.right.x * side * (HALF + 3.4),
        y: f.p.y,
        z: f.p.z + f.right.z * side * (HALF + 3.4),
        r: Math.random() * Math.PI,
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
        m.compose(
          new THREE.Vector3(p.x, p.y + 0.22 + k * 0.4, p.z),
          q,
          new THREE.Vector3(1, 1, 1)
        );
        stacks.setMatrixAt(idx++, m);
      }
    });
    stacks.instanceMatrix.needsUpdate = true;
    group.add(stacks);
  }

  // catch fence posts with sponsor colour bands
  {
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
        m.makeTranslation(
          s.p.x + s.right.x * side * (WALL_OFF + 1.6),
          s.p.y + 1.6,
          s.p.z + s.right.z * side * (WALL_OFF + 1.6)
        );
        posts.setMatrixAt(idx++, m);
      }
    }
    posts.count = idx;
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);
  }

  // start grid slots
  {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9ff4ff, transparent: true, opacity: 0.42, toneMapped: false,
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

  // rocks and bushes
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9b9a8e, roughness: 0.95, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 36);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < 36; i++) {
      const u = Math.random();
      const side = Math.random() > 0.5 ? 1 : -1;
      const f = frameAt(u);
      const off = side * (20 + Math.random() * 55);
      const s = 0.5 + Math.random() * 1.7;
      e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(f.p.x + f.right.x * off, s * 0.3, f.p.z + f.right.z * off),
        q, new THREE.Vector3(s, s * 0.6, s)
      );
      rocks.setMatrixAt(i, m);
    }
    rocks.instanceMatrix.needsUpdate = true;
    group.add(rocks);

    const bushGeo = new THREE.IcosahedronGeometry(1, 1);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f9d4c, roughness: 0.92, flatShading: true });
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 60);
    for (let i = 0; i < 60; i++) {
      const u = Math.random();
      const side = Math.random() > 0.5 ? 1 : -1;
      const f = frameAt(u);
      const off = side * (15 + Math.random() * 45);
      const s = 0.45 + Math.random() * 1.2;
      e.set(0, Math.random() * 6, 0);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(f.p.x + f.right.x * off, s * 0.55, f.p.z + f.right.z * off),
        q, new THREE.Vector3(s * 1.3, s, s * 1.2)
      );
      bushes.setMatrixAt(i, m);
    }
    bushes.instanceMatrix.needsUpdate = true;
    group.add(bushes);
  }

  // start gantry
  const startLights = [];
  {
    const f = samples[0];
    const g = new THREE.Group();
    g.position.set(f.p.x, f.p.y, f.p.z);
    g.rotation.y = Math.atan2(-f.tangent.x, -f.tangent.z);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.45, metalness: 0.25 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xff6a18, roughness: 0.4, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.85, 8.2, 0.85), pillarMat);
      pil.position.set(side * 10.45, 4.1, 0);
      pil.castShadow = true;
      g.add(pil);
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.45, 0.92), k % 2 ? accentMat : pillarMat);
        band.position.set(side * 10.45, 1.1 + k * 1.15, 0);
        g.add(band);
      }
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(21.8, 0.7, 1.0), accentMat);
    beam.position.set(0, 8.2, 0);
    beam.castShadow = true;
    g.add(beam);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(20.6, 2.35),
      new THREE.MeshStandardMaterial({
        map: textures.startBanner, roughness: 0.55, metalness: 0.05,
        emissive: 0xffffff, emissiveMap: textures.startBanner, emissiveIntensity: 0.28,
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
    // flags
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

  // grandstands
  const buildStand = (u, side, offset, width, depth) => {
    const f = frameAt(u);
    const g = new THREE.Group();
    const dir = new THREE.Vector3(-f.right.x * side, 0, -f.right.z * side).normalize();
    g.position.set(f.p.x + f.right.x * side * offset, 0, f.p.z + f.right.z * side * offset);
    g.rotation.y = Math.atan2(dir.x, dir.z);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, 5.6, depth),
      new THREE.MeshStandardMaterial({ color: 0x263b56, roughness: 0.82 })
    );
    base.position.y = 2.8;
    base.castShadow = true;
    g.add(base);
    const crowd = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.96, 5.0),
      new THREE.MeshBasicMaterial({ map: textures.crowd })
    );
    crowd.position.set(0, 3.0, depth / 2 + 0.02);
    g.add(crowd);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 2, 0.36, depth + 2),
      new THREE.MeshStandardMaterial({ color: 0xff6a18, roughness: 0.5, metalness: 0.1 })
    );
    roof.position.y = 7.2;
    roof.castShadow = true;
    g.add(roof);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1.7, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xf1f6ff, roughness: 0.5 })
      );
      post.position.set(sx * (width / 2 - 0.2), 6.4, depth / 2 - 0.2);
      g.add(post);
    }
    // banners on the roof
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

  // billboards
  {
    const billboards = textures.billboards;
    const defs = [
      [0.075, -1], [0.155, 1], [0.25, -1], [0.35, 1], [0.47, -1],
      [0.58, 1], [0.70, -1], [0.81, 1], [0.90, -1],
    ];
    defs.forEach(([u, side], i) => {
      const f = frameAt(u);
      const off = side * (HALF + 14);
      const g = new THREE.Group();
      const dir = new THREE.Vector3(
        -f.right.x * side - f.tangent.x * 0.25, 0,
        -f.right.z * side - f.tangent.z * 0.25
      ).normalize();
      g.position.set(f.p.x + f.right.x * off, 0, f.p.z + f.right.z * off);
      g.rotation.y = Math.atan2(dir.x, dir.z);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4e, roughness: 0.6, metalness: 0.2 });
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.4, 0.3), postMat);
        post.position.set(sx * 3.0, 3.2, 0);
        post.castShadow = true;
        g.add(post);
      }
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(7.2, 4.05),
        new THREE.MeshStandardMaterial({
          map: billboards[i % billboards.length], roughness: 0.5, metalness: 0.08,
          emissive: 0xffffff, emissiveMap: billboards[i % billboards.length], emissiveIntensity: 0.22,
          side: THREE.DoubleSide,
        })
      );
      board.position.set(0, 6.0, 0.18);
      board.castShadow = true;
      g.add(board);
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(7.6, 4.4, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x0d1a2a, roughness: 0.6 })
      );
      frame.position.set(0, 6.0, 0.08);
      g.add(frame);
      group.add(g);
    });
  }

  // lighthouse
  {
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

  // blimp
  const blimp = new THREE.Group();
  {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xf7f9ff, roughness: 0.45, metalness: 0.15 })
    );
    body.scale.set(11, 3.4, 3.4);
    blimp.add(body);
    const stripe = new THREE.Mesh(
      new THREE.SphereGeometry(1.01, 24, 8, 0, Math.PI * 2, 1.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff6a18, roughness: 0.5 })
    );
    stripe.scale.set(11, 3.45, 3.45);
    blimp.add(stripe);
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xff6a18, roughness: 0.55 })
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -10.6;
    blimp.add(tail);
    for (const [ry, rz] of [[0, 1], [0, -1]]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.16, 4.6),
        new THREE.MeshStandardMaterial({ color: 0xff6a18, roughness: 0.55 })
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
    blimp.position.set(-80, 58, -30);
    blimp.rotation.y = -0.5;
    group.add(blimp);
  }

  // clouds
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.cloud, transparent: true, opacity: 0.5 + Math.random() * 0.3,
      depthWrite: false, fog: true,
    }));
    const ang = Math.random() * Math.PI * 2;
    const rad = 280 + Math.random() * 480;
    spr.position.set(Math.cos(ang) * rad, 55 + Math.random() * 80, Math.sin(ang) * rad);
    const s = 55 + Math.random() * 80;
    spr.scale.set(s, s * 0.5, 1);
    group.add(spr);
    clouds.push({ spr, baseX: spr.position.x, speed: 0.6 + Math.random() * 1.2 });
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

  // minimap
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.p.x);
    maxX = Math.max(maxX, s.p.x);
    minZ = Math.min(minZ, s.p.z);
    maxZ = Math.max(maxZ, s.p.z);
  }
  const pad = 0.06;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const span = Math.max(spanX, spanZ);
  const mapPoints = samples.map((s) => ({
    x: pad + (s.p.x - minX + (span - spanX) / 2) / span * (1 - pad * 2),
    y: pad + (s.p.z - minZ + (span - spanZ) / 2) / span * (1 - pad * 2),
  }));

  const padCenters = boostPads.map((p) => ({ u: p.u, lane: p.lane }));
  function mapProject(x, z) {
    return {
      x: pad + (x - minX + (span - spanX) / 2) / span * (1 - pad * 2),
      y: pad + (z - minZ + (span - spanZ) / 2) / span * (1 - pad * 2),
    };
  }

  let time = 0;
  let lightState = { active: 0, go: false, since: 0 };
  function update(dt, camera) {
    time += dt;
    waterUniforms.uTime.value = time;
    for (const pad of boostPads) {
      pad.map.offset.y -= dt * 1.35;
      pad.gmat.opacity = 0.26 + Math.sin(time * 4 + pad.u * 20) * 0.1;
      if (pad.cooldown > 0) pad.cooldown -= dt;
    }
    // start lights: after the launch glow fades out so they don't wash the HUD
    if (lightState.go) {
      lightState.since += dt;
      const fade = clamp01(1 - (lightState.since - 1.6) / 1.4);
      startLights.forEach((l) => {
        l.halo.material.opacity = 0.95 * fade + 0.08;
      });
    }
    // blimp drift
    blimp.position.x = -80 + Math.sin(time * 0.055) * 70;
    blimp.position.z = -30 + Math.cos(time * 0.055) * 55;
    blimp.position.y = 58 + Math.sin(time * 0.4) * 1.2;
    blimp.rotation.y = -time * 0.055;
    for (const c of clouds) {
      c.spr.position.x = c.baseX + time * c.speed;
      if (c.spr.position.x > 850) c.spr.position.x -= 1700;
    }
    for (const b of boats) {
      b.g.position.y = -2.5 + Math.sin(time * 0.9 + b.phase) * 0.16;
      b.g.rotation.z = Math.sin(time * 0.7 + b.phase) * 0.045;
      b.g.rotation.y += dt * b.drift * 0.08;
    }
    // start lights default
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

  return {
    group, curve, samples, length, N, half: HALF, width: HALF * 2,
    startFrame, boostPads, startLights, minimap: { points: mapPoints, padCenters, mapProject },
    frameAt, nearest, update, setStartLights,
    sunDir,
  };
}
