/* 鼓浪屿 · 漫步 — three.js 交互漫游
 * 资产：delivery/game 导出的 LOD1 环境（合并压缩）、6 个榕树原型 + 12,494 个实例、
 * 离线烘焙的可行走高度场（terrain.bin）。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ---------------- 调试钩子 ----------------
window.__gly = { ready: false, pos: null, yaw: 0, fps: 0, errors: [], visited: 0, detail: false };
window.__gly.snap = (mode, modeArg) => {
  if (!renderer) return 'no renderer';
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const read = (fx, fy) => {
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(fx * W), Math.floor(fy * H), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px[0] + ',' + px[1] + ',' + px[2];
  };
  if (mode === 'cam') {
    const v = gl.getParameter(gl.VIEWPORT);
    const bad = (arr) => arr.some((x) => !Number.isFinite(x));
    return {
      viewport: [...v],
      camPos: camera.position.toArray().map((x) => +x.toFixed(2)),
      projBad: bad(camera.projectionMatrix.elements),
      viewBad: bad(camera.matrixWorldInverse.elements),
      playerPos: player.position.toArray().map((x) => +x.toFixed(2)),
      playerWorldBad: bad(player.matrixWorld.elements),
      sceneKids: scene.children.length,
    };
  }
  if (mode === 'ray') {
    // mode='ray:0.1,0.35' → 屏幕归一化坐标拾取（附带材质/UV 诊断）
    const [nx, ny] = String(modeArg ?? '0.5,0.5').split(',').map(Number);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = ray.intersectObjects(scene.children, true);
    const dump = (mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const uv = mesh.geometry.getAttribute('uv');
      let uvMin = [1e9, 1e9], uvMax = [-1e9, -1e9];
      if (uv) for (let i = 0; i < uv.count; i++) {
        uvMin[0] = Math.min(uvMin[0], uv.getX(i)); uvMax[0] = Math.max(uvMax[0], uv.getX(i));
        uvMin[1] = Math.min(uvMin[1], uv.getY(i)); uvMax[1] = Math.max(uvMax[1], uv.getY(i));
      }
      return {
        meshName: mesh.name, parent: mesh.parent?.name,
        pos: mesh.position.toArray().map((v) => +v.toFixed(1)),
        tris: mesh.geometry.index ? Math.round(mesh.geometry.index.count / 3) : Math.round(mesh.geometry.getAttribute('position').count / 3),
        uvRange: uv ? [uvMin.map((v) => +v.toFixed(2)), uvMax.map((v) => +v.toFixed(2))] : 'no-uv',
        materials: mats.map((m) => ({
          name: m.name, color: m.color ? '#' + m.color.getHexString() : null,
          hasMap: !!m.map, mapName: m.map?.name || null,
          mapSrc: m.map?.image?.src ? String(m.map.image.src).slice(-24) : null,
          hasNormal: !!m.normalMap, rough: m.roughness, metal: m.metalness,
          side: m.side, vertexColors: !!m.vertexColors,
        })),
      };
    };
    const seen = new Set();
    const out = [];
    for (const h of hits) {
      if (seen.has(h.object.uuid)) continue;
      seen.add(h.object.uuid);
      out.push({ dist: +h.distance.toFixed(1), point: h.point.toArray().map((v) => +v.toFixed(1)), ...dump(h.object) });
      if (out.length >= 3) break;
    }
    return out;
  }
  if (mode === 'clear') {
    const old = renderer.getClearColor(new THREE.Color());
    renderer.setClearColor(0x00ff00);
    renderer.clear();
    renderer.setClearColor(old);
    return { px: read(0.5, 0.5), w: W, h: H };
  }
  if (mode === 'red') {
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    return { px: read(0.5, 0.5), w: W, h: H };
  }
  if (mode === 'grid') {
    const rows = [];
    for (let gy = 0; gy < 4; gy++) {
      const row = [];
      for (let gx = 0; gx < 6; gx++) row.push(read((gx + 0.5) / 6, (gy + 0.5) / 4));
      rows.push(row.join(' | '));
    }
    return rows.join('\n'); // 自下而上
  }
  return { px: read(0.5, 0.5), w: W, h: H };
};
window.addEventListener('error', (e) => window.__gly.errors.push(String(e.message || e)));

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');

// ---------------- 小工具 ----------------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.classList.add('hidden'), 450); }, ms);
}

// ---------------- 全局状态 ----------------
const META_URL = 'assets/meta.json';
let meta = null;
let renderer, scene, camera, sunLight;
let player, playerParts, blobShadow;
let water, waterUniforms;
const clock = new THREE.Clock();

const ctrl = {
  keys: new Set(),
  joy: { x: 0, y: 0, active: false },
  yaw: 2.6, pitch: 0.42, dist: 4.7,
  dragging: false, lastDragT: -10,
  camPos: new THREE.Vector3(), camTarget: new THREE.Vector3(),
};
const playerState = {
  x: 0, y: 0, z: 0, heading: 0,
  phase: 0, speedNorm: 0, moving: false,
};
const WALK = 3.6, RUN = 6.8, STEP_UP = 1.05, STEP_DOWN = 1.75;
// 2m 网格会把一段台阶量化成单格高差（常见 ≤1m），STEP_UP 必须容下它；
// 建筑层高 ≥3m 的墙体仍会被步高挡住
const TREE_FAR = 620;

// ---------------- 高度场 ----------------
const T = { data: null, cols: 0, rows: 0, ox: 0, oz: 0, cell: 2 };
const BLOCKED = -32768;
function cellH(c, r) {
  if (c < 0 || r < 0 || c >= T.cols || r >= T.rows) return BLOCKED;
  return T.data[r * T.cols + c];
}
function groundAt(x, z) {
  const fx = (x - T.ox) / T.cell - 0.5, fz = (z - T.oz) / T.cell - 0.5;
  const c0 = Math.floor(fx), r0 = Math.floor(fz);
  const tx = fx - c0, tz = fz - r0;
  const h00 = cellH(c0, r0), h10 = cellH(c0 + 1, r0), h01 = cellH(c0, r0 + 1), h11 = cellH(c0 + 1, r0 + 1);
  const ok = h00 !== BLOCKED && h10 !== BLOCKED && h01 !== BLOCKED && h11 !== BLOCKED;
  const v = (b) => (b === BLOCKED ? 0 : b * 0.01);
  const h = v(h00) * (1 - tx) * (1 - tz) + v(h10) * tx * (1 - tz) + v(h01) * (1 - tx) * tz + v(h11) * tx * tz;
  return { h, ok };
}
// 最近格采样：直接取所在格的值，不插值。墙边格子不会再混出“半高”可站面，
// 人物贴墙时要么站在屋面格、要么站在地面格，不会悬在中间。
function groundAtCell(x, z) {
  const c = Math.round((x - T.ox) / T.cell - 0.5);
  const r = Math.round((z - T.oz) / T.cell - 0.5);
  const h16 = cellH(c, r);
  if (h16 === BLOCKED) return { h: 0, ok: false };
  return { h: h16 * 0.01, ok: true };
}
function canStand(x, z, fromY) {
  const g = groundAtCell(x, z);
  return g.ok && g.h - fromY <= STEP_UP && fromY - g.h <= STEP_DOWN;
}
function findWalkableNear(x, z, maxR = 60, maxH = 45) {
  for (let r = 0; r <= maxR; r += 2) {
    const steps = Math.max(1, Math.round((r * Math.PI * 2) / 3));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const g = groundAtCell(px, pz);
      if (g.ok && g.h > 0.3 && g.h < maxH) return { x: px, z: pz, h: g.h };
    }
  }
  return { x, z, h: Math.max(groundAtCell(x, z).h, 1) };
}
// 开阔出生点：既要可走，又要四周空旷（避免相机怼墙），且不在任何 POI 半径内
function findOpenSpawn(ax, az) {
  let best = null;
  for (let r = 0; r <= 140; r += 4) {
    const steps = Math.max(1, Math.round((r * Math.PI * 2) / 4));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const px = ax + Math.cos(a) * r, pz = az + Math.sin(a) * r;
      const g = groundAtCell(px, pz);
      if (!g.ok || g.h < 0.3 || g.h > 40) continue;
      let okNear = 0, okFar = 0;
      for (let k = 0; k < 8; k++) {
        const b = (k / 8) * Math.PI * 2;
        if (groundAtCell(px + Math.cos(b) * 5, pz + Math.sin(b) * 5).ok) okNear++;
        if (groundAtCell(px + Math.cos(b) * 10, pz + Math.sin(b) * 10).ok) okFar++;
      }
      if (okNear < 8 || okFar < 6) continue;
      if (meta.pois.some((p) => Math.hypot(p.x - px, p.z - pz) < p.r + 12)) continue;
      const d = Math.hypot(px - ax, pz - az);
      if (!best || d < best.d) best = { x: px, z: pz, h: g.h, d };
    }
    if (best) return best;
  }
  return findWalkableNear(ax, az);
}

// ---------------- 加载 ----------------
const loadState = { p: 0 };
function setProgress(f, tip) {
  loadState.p = Math.max(loadState.p, f);
  $('loaderFill').style.width = (loadState.p * 100).toFixed(1) + '%';
  if (tip) $('loaderTip').textContent = tip;
}
async function fetchBuffer(url, onP) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url}: ${resp.status}`);
  const total = +resp.headers.get('Content-Length') || 0;
  if (!resp.body) return resp.arrayBuffer();
  const reader = resp.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (total) onP(got / total);
  }
  const out = new Uint8Array(got);
  for (let i = 0, o = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
  return out.buffer;
}

async function loadAll() {
  setProgress(0.02, '正在领取登船证…');
  meta = await (await fetch(META_URL)).json();

  const t0 = performance.now();
  const [terrainBuf, instBuf] = await Promise.all([
    fetchBuffer('assets/terrain.bin?v=2', (f) => setProgress(0.02 + f * 0.06, '正在铺设岛上的道路…')),
    fetchBuffer('assets/instances.bin?v=2', () => {}),
  ]);
  T.data = new Int16Array(terrainBuf);
  T.cols = meta.grid.cols; T.rows = meta.grid.rows;
  T.ox = meta.grid.originX; T.oz = meta.grid.originZ; T.cell = meta.grid.cell;
  const instances = new Float32Array(instBuf);
  const instCount = instances.length / 8; // stride 8 floats
  setProgress(0.1, '正在靠岸…');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const ASSET_V = '?v=2'; // 资产更新时升版本号以穿透 30 天 immutable 缓存
  const ENV_URL = new URLSearchParams(location.search).get('env') || ('assets/env.glb' + ASSET_V);
  const envGltf = await new Promise((res, rej) =>
    gltfLoader.load(ENV_URL,
      (g) => res(g),
      (e) => { if (e.total) setProgress(0.1 + (e.loaded / e.total) * 0.78, '正在走下舷梯…'); },
      rej));
  setProgress(0.92, '正在种下 12,494 棵树…');
  const treeGltf = await new Promise((res, rej) =>
    gltfLoader.load('assets/trees.glb' + ASSET_V, res, undefined, rej));

  // 高模细节层改为进场后后台加载（14.7MB 不阻塞首屏）；挂载逻辑见 startDetailLoad()
  window.__gly.detail = false;

  initScene(envGltf, treeGltf, instances, instCount);
  console.log(`[gly] assets loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

// ---------------- 场景 ----------------
const SUN_DIR = new THREE.Vector3(-0.52, 0.66, 0.34).normalize();

// 纹理各向异性：远处路面/砖墙的 mipmap 糊边明显改善
function applyAnisotropy(root) {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
        'emissiveMap', 'alphaMap', 'bumpMap', 'specularMap', 'clearcoatMap', 'sheenColorMap']) {
        const tex = m[key];
        if (tex && tex.isTexture && tex.anisotropy !== maxAniso) {
          tex.anisotropy = maxAniso;
          tex.needsUpdate = true;
        }
      }
    }
  });
}

// ---------------- 高模细节层：进场后后台加载 ----------------
let detailLoadStarted = false;
function startDetailLoad() {
  if (detailLoadStarted || !renderer) return;
  detailLoadStarted = true;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('assets/detail.glb?v=2',
    (gltf) => {
      try {
        const detailRoot = gltf.scene;
        applyAnisotropy(detailRoot);
        detailRoot.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = renderer.shadowMap.enabled;
            o.receiveShadow = renderer.shadowMap.enabled;
            o.matrixAutoUpdate = false;
            o.updateMatrix();
          }
        });
        scene.add(detailRoot);
        window.__gly.detail = true;
        window.__gly.detailRoot = detailRoot;
        console.log('[gly] detail layer mounted (background)');
      } catch (e) { console.warn('[gly] detail mount failed', e); }
    },
    undefined,
    () => { /* 404/解析失败：核心街区保持简化观感，静默 */ });
}

function initScene(envGltf, treeGltf, instances, instCount) {  const canvas = $('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, IS_TOUCH ? 1.6 : 1.6));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.42;
  renderer.shadowMap.enabled = true; // 手机端也开阴影（低配参数见下），画面不再发平
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc9dbe6, 550, 2600);

  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 6000);

  // --- 光照 ---
  const hemi = new THREE.HemisphereLight(0xc3d9ff, 0x9d947c, 1.7);
  scene.add(hemi);
  sunLight = new THREE.DirectionalLight(0xfff0d8, 3.6);
  sunLight.position.copy(SUN_DIR).multiplyScalar(400);
  {
    sunLight.castShadow = true;
    // 触屏降档：1024 影贴 + ±90 正交范围；桌面 2048 / ±130
    // （正交范围外的地形会采样阴影贴图 clamp 边缘出现成片黑斑，范围宁大勿小）
    const sSize = IS_TOUCH ? 1024 : 2048;
    const sExt = IS_TOUCH ? 90 : 130;
    sunLight.shadow.mapSize.set(sSize, sSize);
    const sc = sunLight.shadow.camera;
    sc.left = -sExt; sc.right = sExt; sc.top = sExt; sc.bottom = -sExt; sc.near = 50; sc.far = 800;
    sunLight.shadow.bias = -2.5e-4;
    sunLight.shadow.normalBias = 0.35; // 0.6 会产生明显悬浮影
  }
  scene.add(sunLight, sunLight.target);

  // --- 天空 ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: SUN_DIR } },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 zen = vec3(0.10, 0.32, 0.62);
          vec3 hor = vec3(0.74, 0.85, 0.87);
          vec3 col = mix(hor, zen, smoothstep(0.02, 0.55, d.y));
          col = mix(vec3(0.55, 0.68, 0.72), col, smoothstep(-0.25, 0.02, d.y));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.82, 0.55) * (pow(s, 900.0) * 2.2 + pow(s, 10.0) * 0.14);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // --- 海水 ---
  waterUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { time: { value: 0 }, sunDir: { value: SUN_DIR } },
  ]);
  water = new THREE.Mesh(
    new THREE.PlaneGeometry(7600, 7600, 1, 1), // 对角 5374m，必须 < camera.far(6000)，否则四角被裁露出天空
    new THREE.ShaderMaterial({
      uniforms: waterUniforms, fog: true,
      vertexShader: `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float time;
        uniform vec3 sunDir;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          float w1 = sin(vWorld.x * 0.075 + time * 0.9) * cos(vWorld.z * 0.062 - time * 0.65);
          float w2 = sin((vWorld.x + vWorld.z) * 0.042 + time * 0.48);
          float w3 = sin((vWorld.x * 0.5 - vWorld.z) * 0.11 - time * 1.25);
          vec3 n = normalize(vec3((w1 * 0.16 + w3 * 0.08) * 1.3, 1.0, (w1 * 0.13 - w2 * 0.10) * 1.3));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 2.0);
          vec3 deep = vec3(0.015, 0.16, 0.27);
          vec3 skyC = vec3(0.48, 0.68, 0.75);
          vec3 col = mix(deep, skyC, fres * 0.66 + 0.02);
          vec3 R = reflect(-sunDir, n);
          float sp = pow(max(dot(R, V), 0.0), 260.0);
          col += vec3(1.0, 0.88, 0.65) * sp * 1.1;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = meta.waterY;
  scene.add(water);

  // --- 环境（建筑/地形/道路/地标） ---
  const envRoot = envGltf.scene;
  applyAnisotropy(envRoot);
  envRoot.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = renderer.shadowMap.enabled;
      o.receiveShadow = renderer.shadowMap.enabled;
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    }
  });
  scene.add(envRoot);

  window.__gly.skirtsVisible = (v) => {
    let n = 0;
    scene.traverse((o) => { if (o.isMesh && /skirt/i.test(o.name || '')) { o.visible = v; n++; } });
    return n;
  };
  window.__gly.poiVisible = (v) => poiObjects.forEach((p) => { p.spr.visible = v; p.beam.visible = v; });

  // --- 榕树实例 ---
  buildTrees(treeGltf, instances, instCount);

  // --- 小人 ---
  buildCharacter();

  // --- POI ---
  buildPOIs();

  // 出生点：龙头路以南的开阔街面，视角自动面向龙头路街区
  const anchor = meta.pois.find((p) => p.id === 'longtou') || meta.spawn;
  const sp = findOpenSpawn(anchor.x + 30, anchor.z + 60);
  playerState.x = sp.x; playerState.z = sp.z; playerState.y = sp.h;
  ctrl.yaw = Math.atan2(-(anchor.x - sp.x), -(anchor.z - sp.z));
  player.position.set(sp.x, sp.h, sp.z);
  ctrl.camTarget.set(sp.x, sp.h + 1.6, sp.z);
  ctrl.camPos.copy(ctrl.camTarget).add(sphericalOffset(ctrl.yaw, ctrl.pitch, ctrl.dist));
  console.log('[gly] init camPos', ctrl.camPos.toArray().map((v) => +v.toFixed(2)).join(','), 'target', ctrl.camTarget.toArray().join(','), 'sp', JSON.stringify(sp));
  window.__gly.ctrlDump = () => ({
    camPos: ctrl.camPos.toArray(), camTarget: ctrl.camTarget.toArray(),
    yaw: ctrl.yaw, pitch: ctrl.pitch, dist: ctrl.dist,
    introK: intro.k, introActive: intro.active,
  });
  window.__gly.tp = (x, z, yaw) => {
    const s = findWalkableNear(x, z, 80, 130);
    playerState.x = s.x; playerState.z = s.z; playerState.y = s.h;
    if (Number.isFinite(yaw)) ctrl.yaw = yaw;
    ctrl.camPos.set(s.x, s.h + 3, s.z + 6);
  };
  window.__gly.treesVisible = (v) => { treesForcedOff = !v; treeChunks.forEach((c) => c.meshes.forEach((m) => { m.visible = v; })); };
  window.__gly.hideName = (re) => {
    const rx = new RegExp(re);
    let n = 0;
    envRoot.traverse((o) => { if (o.isMesh && rx.test(o.name || '')) { o.visible = false; n++; } });
    return n;
  };

  addEventListener('resize', onResize);
  bindInput();
  window.__gly.ready = true;
  window.__gly.pos = { x: sp.x, y: sp.y, z: sp.z };

  animate();
}

function sphericalOffset(yaw, pitch, dist) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, Math.cos(yaw) * cp * dist);
}

// ---------------- 榕树（InstancedMesh 分块） ----------------
const treeChunks = [];
let treesForcedOff = false;
// 树冠摆动相位钟（onBeforeCompile 注入的 uTime，animate 里推进）
const swayTime = { value: 0 };

// 树材质打磨：叶 提饱和提亮压高光；干 略压暗。
// 注：当前 trees.glb 的叶材质叫 "PaletteMaterial001"，改名后的 "Subtropical foliage" 同样命中。
function dressTreeMaterials(root) {
  const seen = new Set();
  const swayMats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const name = m.name || '';
      if (name.includes('Subtropical foliage') || name.includes('PaletteMaterial')) {
        m.color.offsetHSL(0, 0.06, 0.05);
        m.roughness = 0.9;
        // 当前资产材质基色是纯白（颜色全在贴图里），offsetHSL 无饱和度可提——
        // 这时用叶绿基调一次基色，让“去灰”真正落到画面上；
        // 将来带色的 "Subtropical foliage" 材质（s≥0.15）不会进这个分支。
        const hsl = { h: 0, s: 0, l: 0 };
        m.color.getHSL(hsl);
        if (hsl.s < 0.15) m.color.setHSL(0.29, 0.32, Math.min(hsl.l, 0.8));
        swayMats.push(m);
      } else if (name.includes('Banyan bark')) {
        m.color.multiplyScalar(0.92);
      }
    }
  });
  // 冠层轻摆：注入顶点摆动（世界幅度 ≤0.08m，相位随实例位置哈希）。
  // 整段包 try/catch —— shader 编译失败（console error）时在外部整体移除本改动。
  try {
    for (const m of swayMats) {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = swayTime;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 glyIPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float glyPhase = fract(sin(dot(glyIPos.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
            float glyW = smoothstep(0.05, 0.5, position.y);
            float glyAmp = 0.06 * glyW / max(length(instanceMatrix[0].xyz), 0.001);
            transformed.x += sin(uTime * 1.35 + glyPhase) * glyAmp;
            transformed.z += cos(uTime * 1.05 + glyPhase * 1.7) * glyAmp * 0.8;
          #endif`
        );
      };
      m.customProgramCacheKey = () => 'gly-foliage-sway';
    }
  } catch (e) {
    console.warn('[gly] foliage sway disabled:', e);
    for (const m of swayMats) { m.onBeforeCompile = null; m.customProgramCacheKey = undefined; }
  }
  return swayMats.length;
}

function buildTrees(treeGltf, instances, instCount) {
  // 6 个变体（Banyan_LOD1_0..5）。glTFLoader 会把多 primitive 网格拆成
  // "Banyan_LOD1_0"（干）+ "Banyan_LOD1_0_1"/"_0_2"（叶）等多个 Mesh——
  // 只匹配主干名会丢掉全部树冠，树就成了光杆。这里把同变体的所有部件收齐。
  const variants = new Map();
  treeGltf.scene.updateMatrixWorld(true);
  treeGltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = /^(Banyan_LOD1_\d)(?:_\d)?$/.exec(o.name || '');
    if (!m) return;
    const vi = +m[1].slice(-1);
    let parts = variants.get(vi);
    if (!parts) { parts = []; variants.set(vi, parts); }
    parts.push({ geometry: o.geometry, material: o.material });
  });
  if (!variants.size) { console.warn('[gly] no tree variants found'); return; }
  applyAnisotropy(treeGltf.scene);
  const swayN = dressTreeMaterials(treeGltf.scene);
  console.log(`[gly] tree materials dressed: ${swayN} foliage (sway), bark tuned`);

  // 分块。注意 instances.bin 每实例 32 字节（f32 x,z,y,yaw + 缩放 xyz + u8 变体），
  // F(b) 把字节偏移换算成 Float32Array 下标。
  const F = (b) => instances[b >> 2];
  const CHUNK = 320;
  const chunks = new Map();
  for (let i = 0; i < instCount; i++) {
    const o = i * 32;
    const x = F(o), z = F(o + 4), y = F(o + 8);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const key = cx + '_' + cz;
    let ch = chunks.get(key);
    if (!ch) { ch = { cx, cz, list: [] }; chunks.set(key, ch); }
    ch.list.push(i * 32);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const ch of chunks.values()) {
    let sx = 0, sz = 0;
    for (const off of ch.list) { sx += F(off); sz += F(off + 4); }
    ch.center = new THREE.Vector3(sx / ch.list.length, 0, sz / ch.list.length);
    const byVariant = new Map();
    const u8 = new Uint8Array(instances.buffer); // 变体索引是 u8 字节，不能用 f32 视图读
    for (const off of ch.list) {
      const vi = u8[off + 28];
      if (!byVariant.has(vi)) byVariant.set(vi, []);
      byVariant.get(vi).push(off);
    }
    for (const [vi, offs] of byVariant) {
      const parts = variants.get(vi);
      if (!parts) continue;
      ch.meshes = ch.meshes || [];
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, offs.length);
        for (let k = 0; k < offs.length; k++) {
          const off = offs[k];
          v3.set(F(off), F(off + 8), F(off + 4)); // x, y, z
          q.setFromAxisAngle(up, F(off + 12));
          s3.set(F(off + 16), F(off + 24), F(off + 20)); // (sx, sz, sy)
          m4.compose(v3, q, s3);
          im.setMatrixAt(k, m4);
        }
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = renderer.shadowMap.enabled;
        im.computeBoundingSphere();
        im.frustumCulled = true;
        ch.meshes.push(im);
        scene.add(im);
      }
    }
    treeChunks.push(ch);
  }
  console.log(`[gly] trees: ${instCount} instances in ${chunks.size} chunks`);
}

// ---------------- 小人 ----------------
function buildCharacter() {
  player = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe6b28a, roughness: 0.75 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf3ecd9, roughness: 0.85 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x35597e, roughness: 0.9 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xdcbb74, roughness: 0.9 });
  const band = new THREE.MeshStandardMaterial({ color: 0xc0402f, roughness: 0.8 });

  const torso = new THREE.Group(); torso.position.y = 0.86;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.34, 6, 14), shirt);
  body.position.y = 0.32; torso.add(body);
  const hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.185, 0.10, 5, 12), shorts);
  hip.position.y = 0.06; torso.add(hip);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 14), skin);
  head.position.y = 0.83; torso.add(head);
  const hatG = new THREE.Group(); hatG.position.y = 0.95;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.33, 0.035, 20), straw);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.20, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), straw);
  dome.scale.y = 0.72; dome.position.y = 0.02;
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.055, 20), band);
  ribbon.position.y = 0.045;
  hatG.add(brim, dome, ribbon);
  torso.add(hatG);

  const makeLimb = (r, len, mat, px, py, tiltZ) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), mat);
    mesh.position.y = -(len / 2 + r * 0.6);
    pivot.add(mesh);
    pivot.rotation.z = tiltZ;
    return pivot;
  };
  const armL = makeLimb(0.062, 0.34, shirt, -0.285, 0.62, 0.14);
  const armR = makeLimb(0.062, 0.34, shirt, 0.285, 0.62, -0.14);
  const legL = makeLimb(0.085, 0.36, skin, -0.125, 0, 0.02);
  const legR = makeLimb(0.085, 0.36, skin, 0.125, 0, -0.02);
  // 小布鞋：深色鞋盒压住腿末端，接地感更实
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.88 });
  const shoeGeo = new THREE.BoxGeometry(0.11, 0.09, 0.24);
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.44, 0.05); // 腿底、略前伸；挂在摆动轴上随腿摆
    leg.add(shoe);
  }
  torso.add(armL, armR, legL, legR);
  player.add(torso);

  playerParts = { torso, armL, armR, legL, legR };

  // 接触阴影
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 128;
  const g = cnv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(8,18,24,0.42)');
  grad.addColorStop(0.65, 'rgba(8,18,24,0.22)');
  grad.addColorStop(1, 'rgba(8,18,24,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  blobShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cnv), transparent: true, depthWrite: false })
  );
  blobShadow.rotation.x = -Math.PI / 2;
  scene.add(blobShadow);

  scene.add(player);
}

// ---------------- POI ----------------
const poiObjects = [];
const LABEL_OFFSET = { longtou: 12, bagua: 27, sunlight: 6, bridge: 9, shuzhuang: 10, catholic: 15 };
function buildPOIs() {
  for (const poi of meta.pois) {
    const g = groundAt(poi.x, poi.z);
    const baseY = Math.max(poi.y, g.ok ? g.h : poi.y);
    const offY = LABEL_OFFSET[poi.id] ?? 12;

    // 光柱
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.85, offY + 6, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.position.set(poi.x, baseY + (offY + 6) / 2 - 2, poi.z);
    scene.add(beam);

    // 文字标签
    const cnv = document.createElement('canvas');
    const ctx = cnv.getContext('2d');
    const font = '700 58px "Noto Sans SC", "PingFang SC", sans-serif';
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(poi.name).width);
    cnv.width = tw + 76; cnv.height = 108;
    const c2 = cnv.getContext('2d');
    c2.font = font;
    // 药丸底
    const r = 50;
    c2.fillStyle = 'rgba(16,34,44,0.86)';
    c2.beginPath();
    c2.roundRect ? c2.roundRect(4, 18, cnv.width - 8, 72, r) : c2.rect(4, 18, cnv.width - 8, 72);
    c2.fill();
    c2.fillStyle = '#ffd9a0';
    c2.beginPath(); c2.arc(48, 54, 15, 0, Math.PI * 2); c2.fill();
    c2.fillStyle = '#fff6e6';
    c2.textBaseline = 'middle';
    c2.fillText(poi.name, 74, 57);
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.center.set(0.5, 0);
    spr.userData.poi = poi;
    spr.renderOrder = 50;
    scene.add(spr);
    poiObjects.push({ poi, spr, beam, baseY, offY, anchorY: baseY + offY });
  }
}
function updatePOIs() {
  const px = playerState.x, pz = playerState.z;
  for (const p of poiObjects) {
    const dx = p.poi.x - px, dz = p.poi.z - pz;
    const dist = Math.hypot(dx, dz);
    const s = clamp(2.6 + dist * 0.024, 3.2, 30);
    p.spr.position.set(p.poi.x, p.anchorY, p.poi.z);
    p.spr.scale.set(s * (p.spr.material.map.image.width / p.spr.material.map.image.height), s, 1);
    p.spr.material.opacity = dist < p.poi.r * 0.5 ? 0 : clamp((600 - dist) / 250, 0, 0.95);
    p.beam.material.opacity = dist < p.poi.r ? 0.30 : 0.13;
  }
}

// ---------------- 输入 ----------------
function bindInput() {
  addEventListener('keydown', (e) => {
    ctrl.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => ctrl.keys.delete(e.code));
  addEventListener('blur', () => ctrl.keys.clear());

  // 鼠标拖拽 / 滚轮
  let lastMX = 0, lastMY = 0;
  canvas$().addEventListener('mousedown', (e) => {
    ctrl.dragging = true; lastMX = e.clientX; lastMY = e.clientY;
  });
  addEventListener('mousemove', (e) => {
    if (!ctrl.dragging) return;
    ctrl.yaw -= (e.clientX - lastMX) * 0.0052;
    ctrl.pitch = clamp(ctrl.pitch + (e.clientY - lastMY) * 0.0042, -0.08, 1.18);
    lastMX = e.clientX; lastMY = e.clientY;
    ctrl.lastDragT = clock.elapsedTime;
  });
  addEventListener('mouseup', () => { ctrl.dragging = false; });
  canvas$().addEventListener('wheel', (e) => {
    e.preventDefault();
    ctrl.dist = clamp(ctrl.dist * (1 + Math.sign(e.deltaY) * 0.12), 2.2, 13);
  }, { passive: false });

  // 触屏：左半 摇杆，右侧 看视角 + 双指缩放
  const joyBase = $('joyBase'), joyKnob = $('joyKnob'), joyZone = $('joyZone');
  let joyId = null, joyCX = 0, joyCY = 0;
  const lookTouches = new Map();
  let pinchD0 = 0, dist0 = 0;

  joyZone.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (joyId !== null) continue;
      joyId = t.identifier;
      const rect = joyBase.getBoundingClientRect();
      joyCX = rect.left + rect.width / 2; joyCY = rect.top + rect.height / 2;
      moveJoy(t.clientX, t.clientY);
    }
    e.preventDefault();
  }, { passive: false });
  function moveJoy(x, y) {
    const dx = x - joyCX, dy = y - joyCY;
    const len = Math.hypot(dx, dy), max = 46;
    const k = len > 0 ? Math.min(len, max) / len : 0;
    ctrl.joy.x = (dx * k) / max;
    ctrl.joy.y = (dy * k) / max;
    ctrl.joy.active = true;
    joyKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  }
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { moveJoy(t.clientX, t.clientY); continue; }
      if (lookTouches.has(t.identifier)) {
        const prev = lookTouches.get(t.identifier);
        lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (lookTouches.size === 1) {
          ctrl.yaw -= (t.clientX - prev.x) * 0.0062;
          ctrl.pitch = clamp(ctrl.pitch + (t.clientY - prev.y) * 0.005, -0.08, 1.18);
          ctrl.lastDragT = clock.elapsedTime;
        } else if (lookTouches.size === 2) {
          const pts = [...lookTouches.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (pinchD0 > 0) ctrl.dist = clamp(dist0 * (pinchD0 / Math.max(d, 20)), 2.2, 13);
          else { pinchD0 = d; dist0 = ctrl.dist; }
        }
      }
    }
    if (lookTouches.size >= 2) e.preventDefault();
  }, { passive: false });
  addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null; ctrl.joy.x = 0; ctrl.joy.y = 0; ctrl.joy.active = false;
        joyKnob.style.transform = 'translate(-50%, -50%)';
      }
      lookTouches.delete(t.identifier);
      if (lookTouches.size < 2) pinchD0 = 0;
    }
    // 兜底：所有手指都离开时全部复位（防漏接事件导致摇杆卡死）
    if (e.touches.length === 0) {
      joyId = null; ctrl.joy.x = 0; ctrl.joy.y = 0; ctrl.joy.active = false;
      joyKnob.style.transform = 'translate(-50%, -50%)';
      lookTouches.clear(); pinchD0 = 0;
    }
  });
  addEventListener('touchcancel', () => {
    joyId = null; ctrl.joy.x = 0; ctrl.joy.y = 0; ctrl.joy.active = false;
    joyKnob.style.transform = 'translate(-50%, -50%)';
    lookTouches.clear(); pinchD0 = 0;
  });
  canvas$().addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.46 && t.clientY > innerHeight * 0.45) continue; // 摇杆区
      lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }, { passive: true });

  // UI
  $('btnSound').addEventListener('click', toggleSound);
  $('minimap').addEventListener('click', () => openMap());
  $('btnMap').addEventListener('click', () => openMap());
  $('btnList').addEventListener('click', () => openMap());
  $('mapClose').addEventListener('click', () => $('mapOverlay').classList.add('hidden'));
}
function canvas$() { return $('scene'); }

// ---------------- 移动与相机 ----------------
function updatePlayer(dt) {
  // 输入向量（相机相对）
  let ix = 0, iz = 0;
  const k = ctrl.keys;
  if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) iz += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
  if (ctrl.joy.active) { ix += ctrl.joy.x; iz += ctrl.joy.y; }
  let mag = Math.hypot(ix, iz);
  const running = k.has('ShiftLeft') || k.has('ShiftRight') || (ctrl.joy.active && Math.hypot(ctrl.joy.x, ctrl.joy.y) > 0.86);
  if (mag > 1) { ix /= mag; iz /= mag; mag = 1; }

  const moving = mag > 0.04;
  playerState.moving = moving;
  const targetSpeed = moving ? mag * (running ? RUN : WALK) : 0;
  playerState.speedNorm = damp(playerState.speedNorm, targetSpeed / RUN, 8, dt);

  if (moving) {
    // 相机 yaw → 世界方向：F=(-sin,-cos), R=(cos,-sin)
    const sin = Math.sin(ctrl.yaw), cos = Math.cos(ctrl.yaw);
    const dirX = ix * cos + iz * sin;
    const dirZ = iz * cos - ix * sin;
    const len = Math.hypot(dirX, dirZ) || 1;
    // 坡度调速：前方格比脚下高 → 上坡减速；略低 → 缓下坡微加速
    const ahead = groundAtCell(playerState.x + (dirX / len) * T.cell, playerState.z + (dirZ / len) * T.cell);
    const dh = ahead.ok ? ahead.h - playerState.y : 0;
    const speed = targetSpeed * clamp(1 - dh * 0.22, 0.62, 1.12);
    const vx = (dirX / len) * speed * dt;
    const vz = (dirZ / len) * speed * dt;

    // 分别尝试 x / z，滑墙
    if (canStand(playerState.x + vx, playerState.z, playerState.y)) playerState.x += vx;
    else if (canStand(playerState.x + vx * 0.4, playerState.z, playerState.y)) playerState.x += vx * 0.4;
    if (canStand(playerState.x, playerState.z + vz, playerState.y)) playerState.z += vz;
    else if (canStand(playerState.x, playerState.z + vz * 0.4, playerState.y)) playerState.z += vz * 0.4;

    // 朝向
    const targetHeading = Math.atan2(dirX, dirZ);
    playerState.heading = angleLerp(playerState.heading, targetHeading, 1 - Math.exp(-12 * dt));
    playerState.phase += dt * (6 + 6.5 * playerState.speedNorm);
  } else {
    playerState.phase += dt * 1.6;
  }

  // 贴地（最近格：墙边不再有“半高”中间值可站）
  const g = groundAtCell(playerState.x, playerState.z);
  if (g.ok) playerState.y = damp(playerState.y, g.h, 16, dt);
  const wading = g.ok && g.h < 0.12;
  if (wading && moving) playerState.speedNorm *= 0.55;

  player.position.set(playerState.x, playerState.y, playerState.z);
  player.rotation.y = playerState.heading;

  // 动画
  const sw = playerState.moving ? 0.55 + 0.35 * playerState.speedNorm : 0.03;
  const s1 = Math.sin(playerState.phase * (playerState.moving ? 1 : 0.8));
  playerParts.legL.rotation.x = s1 * sw;
  playerParts.legR.rotation.x = -s1 * sw;
  playerParts.armL.rotation.x = -s1 * sw * 0.6;
  playerParts.armR.rotation.x = s1 * sw * 0.6;
  playerParts.torso.position.y = 0.86 + (playerState.moving ? Math.abs(s1) * 0.05 : Math.sin(playerState.phase * 0.9) * 0.012);
  playerParts.torso.rotation.x = playerState.speedNorm * 0.16;

  blobShadow.position.set(playerState.x, playerState.y + 0.04, playerState.z);
  const shadowK = clamp(1 - (playerState.y - g.h) / 2, 0.25, 1);
  blobShadow.material.opacity = shadowK;

  // 软跟随：前进且久未拖拽时，视角缓慢回正到行进方向（温和，不抢玩家视角）
  if (moving && clock.elapsedTime - ctrl.lastDragT > 2.5) {
    ctrl.yaw = angleLerp(ctrl.yaw, playerState.heading - Math.PI, 1 - Math.exp(-0.55 * dt));
  }
}

function updateCamera(dt, introK) {
  const target = ctrl.camTarget;
  target.set(playerState.x, playerState.y + 1.55, playerState.z);

  // 开场：高空俯视停留久、末段快速降落（pow 包络），且全程跳过遮挡截断——
  // 低空斜穿 30-50m 树冠层会满屏叶片，宁可远处穿模
  let dist = ctrl.dist, pitch = ctrl.pitch;
  if (introK > 0) {
    const hk = Math.pow(introK, 0.42);
    dist = lerp(ctrl.dist, 46 + 90 * hk, hk);
    pitch = lerp(ctrl.pitch, 1.25, hk);
  }

  // 视线遮挡：沿 target→理想机位步进采样
  const off = sphericalOffset(ctrl.yaw, pitch, 1);
  let allowed = dist;
  if (introK <= 0) {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const d = (dist * i) / steps;
      const sx = target.x + off.x * d, sz = target.z + off.z * d;
      const sy = target.y + off.y * d;
      const g = groundAt(sx, sz);
      if (g.ok && g.h + 0.45 > sy) { allowed = Math.max((d * (i - 1)) / steps, 2.1); break; }
    }
  }
  const desired = new THREE.Vector3(
    target.x + off.x * allowed,
    Math.max(target.y + off.y * allowed, 0.7),
    target.z + off.z * allowed
  );
  // 相机若落进建筑体内（所在格地面远高于人物），沿视线方向逐级回缩
  for (let guard = 0; guard < 8; guard++) {
    const gc0 = groundAtCell(desired.x, desired.z);
    if (!(gc0.ok && gc0.h > playerState.y + 1.8 && allowed > 1.1)) break;
    allowed = Math.max(allowed - 0.45, 1.1);
    desired.set(target.x + off.x * allowed, Math.max(target.y + off.y * allowed, 0.7), target.z + off.z * allowed);
  }
  // 地形兜底
  const gc = groundAt(desired.x, desired.z);
  if (gc.ok && desired.y < gc.h + 0.45) desired.y = gc.h + 0.45;

  if (!Number.isFinite(desired.x + desired.y + desired.z) && !window.__gly.nanTrace) {
    window.__gly.nanTrace = {
      targetY: target.y, offY: off.y, allowed, pitch: ctrl.pitch, dist: ctrl.dist,
      introK, playerY: playerState.y, heading: playerState.heading,
    };
  }
  if (!Number.isFinite(desired.y)) desired.y = playerState.y + 4;
  if (!Number.isFinite(desired.x)) desired.x = playerState.x;
  if (!Number.isFinite(desired.z)) desired.z = playerState.z;

  const k = introK > 0 ? 2.2 : 7;
  ctrl.camPos.x = damp(ctrl.camPos.x, desired.x, k, dt);
  ctrl.camPos.y = damp(ctrl.camPos.y, desired.y, k, dt);
  ctrl.camPos.z = damp(ctrl.camPos.z, desired.z, k, dt);
  camera.position.copy(ctrl.camPos);
  camera.lookAt(target);
}

// ---------------- 主循环 ----------------
let fpsAcc = 0, fpsN = 0, degraded = false;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const introK = intro.active ? intro.k : 0;

  updatePlayer(dt);
  updateCamera(dt, introK);
  updatePOIs();
  updateProximity();

  // 阴影相机跟随
  if (renderer.shadowMap.enabled) {
    sunLight.position.set(playerState.x + SUN_DIR.x * 320, SUN_DIR.y * 320, playerState.z + SUN_DIR.z * 320);
    sunLight.target.position.set(playerState.x, 0, playerState.z);
    sunLight.target.updateMatrixWorld();
  }
  // 远处树块剔除 + 树影按块距离分块（近块才投影，省一整遍顶点着色）
  for (const ch of treeChunks) {
    const d2 = ch.center.distanceToSquared(ctrl.camTarget);
    const vis = !treesForcedOff && d2 < TREE_FAR * TREE_FAR;
    const cast = vis && d2 < 130 * 130;
    for (const m of ch.meshes) {
      m.visible = vis;
      if (m.castShadow !== cast) m.castShadow = cast;
    }
  }
  waterUniforms.time.value = clock.elapsedTime;
  swayTime.value = clock.elapsedTime; // 树冠轻摆

  renderer.render(scene, camera);

  // fps 统计 + 自动降档
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) {
    const fps = fpsN / fpsAcc;
    window.__gly.fps = fps;
    window.__gly.calls = renderer.info.render.calls;
    window.__gly.tris = renderer.info.render.triangles;
    if (!degraded && clock.elapsedTime > 8 && fps < 22 && renderer.getPixelRatio() > 1.05) {
      degraded = true;
      renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.72));
    }
    fpsAcc = 0; fpsN = 0;
  }
  window.__gly.pos = { x: +playerState.x.toFixed(2), y: +playerState.y.toFixed(2), z: +playerState.z.toFixed(2) };
  window.__gly.yaw = +ctrl.yaw.toFixed(3);
  window.__gly.joy = { x: +ctrl.joy.x.toFixed(2), y: +ctrl.joy.y.toFixed(2), active: ctrl.joy.active };

  if (intro.active) intro.step(dt);
  drawMinimap();
}

// ---------------- 开场飞行 ----------------
const intro = {
  active: false, k: 1,
  start() { this.active = true; this.k = 1; },
  step(dt) {
    this.k = Math.max(0, this.k - dt / 3.4);
    if (this.k === 0) this.active = false;
  },
};

// ---------------- 接近检测 / 打卡 ----------------
let nearPoi = null;
function showPoiCard(p) {
  const card = $('poiCard');
  $('poiEn').textContent = p.poi.en;
  $('poiName').textContent = p.poi.name;
  $('poiBlurb').textContent = p.poi.blurb;
  const visited = getVisited();
  const isNew = !visited.includes(p.poi.id);
  $('poiVisited').textContent = isNew ? '🏆 新打卡！已收录进「景点」' : `👀 已到访 · 第 ${visited.indexOf(p.poi.id) + 1} 次重逢`;
  $('poiVisited').classList.toggle('seen', !isNew);
  if (isNew) { addVisited(p.poi.id); toast(`📍 打卡「${p.poi.name}」 ${getVisited().length}/${meta.pois.length}`); }
  card.classList.remove('hidden');
}

function updateProximity() {
  let found = null;
  for (const p of poiObjects) {
    const d = Math.hypot(p.poi.x - playerState.x, p.poi.z - playerState.z);
    if (d < p.poi.r) { found = p; break; }
  }
  if (found === nearPoi) return;
  nearPoi = found;
  if (!found) { $('poiCard').classList.add('hidden'); return; }
  showPoiCard(found);
}
function getVisited() {
  try { return JSON.parse(localStorage.getItem('gly-visited') || '[]'); } catch { return []; }
}
function addVisited(id) {
  const v = getVisited();
  if (!v.includes(id)) { v.push(id); localStorage.setItem('gly-visited', JSON.stringify(v)); }
  window.__gly.visited = v.length;
}

// ---------------- 小地图 ----------------
const mapBases = {};
function bakeMapBase(size) {
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = Math.round((size * T.rows) / T.cols);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(cnv.width, cnv.height);
  for (let py = 0; py < cnv.height; py++) {
    const r = Math.floor((py / cnv.height) * T.rows);
    for (let px = 0; px < cnv.width; px++) {
      const c = Math.floor((px / cnv.width) * T.cols);
      const h = cellH(c, r);
      const o = (py * cnv.width + px) * 4;
      let R, G, B;
      if (h === BLOCKED) { R = 18; G = 49; B = 74; }
      else if (h < 120) { R = 214; G = 197; B = 152; }        // 沙滩
      else if (h < 1800) { R = 122; G = 166; B = 104; }        // 绿地
      else if (h < 3600) { R = 90; G = 138; B = 88; }
      else { R = 134; G = 121; B = 92; }                        // 岩石
      img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}
let minimapTick = 0;
function drawMinimap() {
  minimapTick++;
  if (minimapTick % 6 !== 0) return;
  const cvs = $('minimap');
  drawMapInto(cvs);
  if (!$('mapOverlay').classList.contains('hidden')) drawMapInto($('bigmap'));
}
function drawMapInto(cvs) {
  const ctx = cvs.getContext('2d');
  if (!mapBases[cvs.width]) mapBases[cvs.width] = bakeMapBase(cvs.width);
  const base = mapBases[cvs.width];
  const W = cvs.width, H = cvs.height;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(base, 0, 0, W, H);
  const toPx = (x, z) => [((x - T.ox) / (T.cell * T.cols)) * W, ((z - T.oz) / (T.cell * T.rows)) * H];

  // POI
  for (const p of poiObjects) {
    const [px, py] = toPx(p.poi.x, p.poi.z);
    ctx.beginPath(); ctx.arc(px, py, W * 0.012 + 2, 0, Math.PI * 2);
    ctx.fillStyle = getVisited().includes(p.poi.id) ? '#e25c4a' : '#ffd9a0';
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
  }
  // 玩家箭头
  const [px, py] = toPx(playerState.x, playerState.z);
  const ang = -(playerState.heading) + Math.PI; // 地图北=−z
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -W * 0.045 - 3);
  ctx.lineTo(W * 0.028 + 2, W * 0.034 + 2);
  ctx.lineTo(0, W * 0.016);
  ctx.lineTo(-W * 0.028 - 2, W * 0.034 + 2);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d0442f';
  ctx.lineWidth = 2;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------- 大地图 overlay ----------------
function openMap() {
  $('mapOverlay').classList.remove('hidden');
  const list = $('poiList');
  list.innerHTML = '';
  $('visitCount').textContent = `已打卡 ${getVisited().length}/${meta.pois.length}`;
  for (const poi of meta.pois) {
    const d = Math.hypot(poi.x - playerState.x, poi.z - playerState.z);
    const btn = document.createElement('button');
    btn.className = 'poi-item' + (getVisited().includes(poi.id) ? ' visited' : '');
    btn.innerHTML = `<span class="num">${getVisited().includes(poi.id) ? '✓' : meta.pois.indexOf(poi) + 1}</span>
      <span><div class="nm">${poi.name}</div><div class="ds">${poi.en} · 距离 ${d < 1000 ? d.toFixed(0) + ' m' : (d / 1000).toFixed(1) + ' km'}</div></span>`;
    btn.addEventListener('click', () => {
      // 落在地标近距离处（r+6，落不到可走格再逐圈外扩）、面向地标，落地立即弹介绍卡
      const dx = playerState.x - poi.x, dz = playerState.z - poi.z;
      const dl = Math.hypot(dx, dz) || 1;
      let spot = null;
      for (let tryDist = poi.r + 6; tryDist <= poi.r + 40; tryDist += 8) {
        const s = findWalkableNear(poi.x + (dx / dl) * tryDist, poi.z + (dz / dl) * tryDist, 14, 120);
        if (Math.hypot(s.x - poi.x, s.z - poi.z) <= poi.r + 24) { spot = s; break; }
        if (!spot) spot = s;
      }
      playerState.x = spot.x; playerState.z = spot.z; playerState.y = spot.h;
      ctrl.yaw = Math.atan2(-(poi.x - spot.x), -(poi.z - spot.z));
      ctrl.pitch = 0.32;
      nearPoi = null;          // 强制下一帧重新评估
      ctrl.camPos.set(spot.x, spot.h + 3, spot.z + 6);
      $('mapOverlay').classList.add('hidden');
      toast(`乘渡轮来到「${poi.name}」附近`);
      const po = poiObjects.find((q) => q.poi.id === poi.id);
      if (po) setTimeout(() => showPoiCard(po), 600);  // 传送即"到达"：稍后展示介绍卡（避免两条 toast 互相覆盖）
    });
    list.appendChild(btn);
  }
  drawMapInto($('bigmap'));
}

// ---------------- 环境音 ----------------
let audioCtx = null, masterGain = null, soundOn = true;
function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = soundOn ? 0.16 : 0;
    masterGain.connect(audioCtx.destination);
    // 海浪：白噪 → 低通 + 缓慢起伏
    const len = audioCtx.sampleRate * 4;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { // 布朗噪
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.4;
    src.connect(lp).connect(masterGain);
    src.start();
    for (const [rate, depth, base] of [[0.055, 260, 560], [0.11, 180, 420]]) {
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = rate;
      const lg = audioCtx.createGain();
      lg.gain.value = depth;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start();
      void base;
    }
  } catch (e) { /* 音频失败不影响漫游 */ console.warn(e); }
}
function toggleSound() {
  soundOn = !soundOn;
  $('soundIcon').textContent = soundOn ? '🔊' : '🔇';
  initAudio();
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume(); // iOS/部分浏览器需手势内解锁
    if (masterGain) masterGain.gain.setTargetAtTime(soundOn ? 0.16 : 0, audioCtx.currentTime, 0.2);
  }
}

// ---------------- 启动 ----------------
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
}

(async function boot() {
  if (!window.WebGLRenderingContext) { $('glError').classList.remove('hidden'); return; }
  try {
    await loadAll();
    setProgress(1, '登船完毕！');
    const btn = $('startBtn');
    btn.disabled = false;
    btn.textContent = '开始漫步';
    btn.addEventListener('click', () => {
      $('loader').classList.add('gone');
      $('hud').classList.remove('hidden');
      initAudio();
      intro.start();
      startDetailLoad(); // 14.7MB 高模细节层后台加载，不阻塞进场
      setTimeout(() => toast('沿石阶往高处走，全岛尽收眼底'), 4200);
    }, { once: true });
  } catch (err) {
    console.error(err);
    window.__gly.errors.push('boot: ' + (err && err.message));
    $('loaderTip').textContent = '装载失败：' + (err && err.message || err);
  }
})();
