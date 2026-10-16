import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFox } from './fox.js';
import { createShellFur, furShared } from './fur.js';
import { makeSoftShadowTexture } from './textures.js';
import { createLeaves } from './leaves.js';

const STORAGE_KEY = 'pumpkin-fox.v1';

const QUALITY = {
  low:  { dpr: 1.0, shellScale: 0.55, leaves: 8 },
  mid:  { dpr: 1.5, shellScale: 0.8,  leaves: 12 },
  high: { dpr: 2.0, shellScale: 1.0,  leaves: 16 },
};

const DEFAULTS = {
  'fur-length': 1.0,
  'fur-density': 0.42,
  'wind-strength': 0.35,
  'wind-speed': 1.0,
  'auto-rotate': true,
  'idle-anim': true,
  'show-fur': true,
  quality: (matchMedia('(pointer: coarse)').matches || innerWidth < 900) ? 'mid' : 'high',
};

function loadParams() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

window.__foxErrors = [];
addEventListener('error', e => {
  window.__foxErrors.push(String(e.message || e));
  console.error('[pumpkin-fox]', e.message || e);
});

const params = loadParams();
const state = { bounceT: 99, wagBoost: 0, blinkAt: 2.4, blinkT: -1, twitchAt: 4, twitchT: -1, twitchSide: 0 };

const host = document.getElementById('canvas-host');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
const CAM_POS = new THREE.Vector3(0.55, 1.75, 4.9);
const CAM_TARGET = new THREE.Vector3(0, 1.04, 0);
// 竖屏窄幅视角水平视野变小，默认机位后撤一点防裁切
const camDefault = () => {
  const a = (innerWidth || 1) / (innerHeight || 1);
  return a < 0.75 ? CAM_POS.clone().multiplyScalar(1.16) : CAM_POS.clone();
};
camera.position.copy(camDefault());

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAM_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.6;
controls.maxDistance = 8.5;
controls.maxPolarAngle = 1.48;
controls.autoRotate = !!params['auto-rotate'];
controls.autoRotateSpeed = 0.8;

scene.add(new THREE.HemisphereLight(0xfff2dc, 0xc9a276, 1.05));
const sun = new THREE.DirectionalLight(0xffe8c8, 2.2);
sun.position.set(2.6, 4.6, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -2.6; sun.shadow.camera.right = 2.6;
sun.shadow.camera.top = 3.4; sun.shadow.camera.bottom = -1;
sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 14;
sun.shadow.bias = -0.0004;
sun.shadow.radius = 4;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xbfd4ff, 0.6);
rim.position.set(-1.6, 3.2, -4.2);
scene.add(rim);

const shadowTex = makeSoftShadowTexture(THREE);
const blob = new THREE.Mesh(
  new THREE.CircleGeometry(0.95, 40),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.22, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.004;
scene.add(blob);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShadowMaterial({ opacity: 0.13 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const fox = buildFox();
scene.add(fox.group);

const leaves = createLeaves(THREE, { count: QUALITY[params.quality].leaves });
scene.add(leaves.group);

const furs = [];
function buildFurs() {
  for (const f of furs) f.dispose();
  furs.length = 0;
  const q = QUALITY[params.quality];
  for (const t of fox.furTargets) {
    const fur = createShellFur(t, {
      shells: Math.max(4, Math.round(t.shells * q.shellScale)),
      lengthScale: Math.min(params['fur-length'], t.maxScale || 99),
      density: params['fur-density'],
      wind: params['wind-strength'],
      windSpeed: params['wind-speed'],
    });
    fur.maxScale = t.maxScale; // 面部短毛在长毛滑杆下软上限，避免埋脸
    furs.push(fur);
  }
  applyFurVisibility();
}
function applyFurVisibility() {
  const on = !!params['show-fur'];
  for (const f of furs) f.group.visible = on;
}

function applyQuality() {
  const q = QUALITY[params.quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
  resize();
  for (const f of furs) {
    f.setShells(Math.max(4, Math.round(f.baseShells * q.shellScale)));
  }
  leaves.setCount(q.leaves);
}

function setParam(name, value, save = true) {
  params[name] = value;
  switch (name) {
    case 'fur-length': for (const f of furs) f.setLengthScale(Math.min(value, f.maxScale || 99)); break;
    case 'fur-density': for (const f of furs) f.setDensity(value); break;
    case 'wind-strength': furShared.uWind.value = value; break;
    case 'wind-speed': furShared.uWindSpeed.value = value; break;
    case 'auto-rotate': controls.autoRotate = !!value; break;
    case 'show-fur': applyFurVisibility(); break;
    case 'idle-anim': break;
    case 'quality': applyQuality(); break;
  }
  if (save) {
    clearTimeout(setParam._t);
    setParam._t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch {}
    }, 300);
  }
}
furShared.uWind.value = params['wind-strength'];
furShared.uWindSpeed.value = params['wind-speed'];

// ---- UI wiring ----
const $ = id => document.getElementById(id);
for (const id of ['fur-length', 'fur-density', 'wind-strength', 'wind-speed']) {
  const el = $(id), out = el.parentElement.querySelector('output');
  el.value = params[id];
  if (out) out.textContent = Number(params[id]).toFixed(2);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (out) out.textContent = v.toFixed(2);
    setParam(id, v);
  });
}
for (const id of ['auto-rotate', 'idle-anim', 'show-fur']) {
  const el = $(id);
  el.checked = !!params[id];
  el.addEventListener('change', () => setParam(id, el.checked));
}
const qBtns = [$('q-low'), $('q-mid'), $('q-high')];
function paintQuality() {
  for (const b of qBtns) b.classList.toggle('on', b.dataset.q === params.quality);
}
for (const b of qBtns) b.addEventListener('click', () => {
  params.quality = b.dataset.q;
  paintQuality();
  setParam('quality', b.dataset.q);
});
paintQuality();
$('reset-view').addEventListener('click', () => {
  camera.position.copy(camDefault());
  controls.target.copy(CAM_TARGET);
  controls.update();
});
$('screenshot').addEventListener('click', () => {
  renderer.render(scene, camera);
  renderer.domElement.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pumpkin-fox.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
});
const panel = $('panel');
$('panel-toggle').addEventListener('click', () => panel.classList.toggle('open'));

buildFurs();
applyQuality();

// ---- interaction: tap the fox ----
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downX = 0, downY = 0, downT = 0;
renderer.domElement.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
renderer.domElement.addEventListener('pointerup', e => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 8 || performance.now() - downT > 350) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(fox.group, true).length) poke();
});
function poke() {
  state.bounceT = 0;
  state.wagBoost = 1;
  state.blinkT = 0;
}

// ---- animation loop ----
const clock = new THREE.Clock();
let running = true;
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { clock.getDelta(); tick(); }
});

function resize() {
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  renderer.setSize(w, h); // 必须同步 CSS 尺寸：只改 attribute 会让 canvas 以像素尺寸显示，高 DPR 屏等于放大裁切
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  furShared.uTime.value = t;

  if (params['idle-anim']) {
    const breathe = Math.sin(t * 2.0) * 0.012;
    fox.pivots.bodyRoot.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    fox.pivots.head.rotation.z = Math.sin(t * 0.7) * 0.03;
    fox.pivots.head.rotation.x = Math.sin(t * 0.9 + 1.3) * 0.02;

    state.bounceT += dt;
    const b = state.bounceT;
    const s = 1 + 0.085 * Math.exp(-4.5 * b) * Math.sin(11 * b);
    fox.group.scale.setScalar(s);
    fox.group.position.y = 0.05 * Math.exp(-5 * b) * Math.sin(14 * b);

    state.wagBoost = Math.max(0, state.wagBoost - dt / 1.5);
    const wag = 1.25 + state.wagBoost * 4.5;
    fox.pivots.tail.rotation.y = Math.sin(t * wag) * (0.22 + state.wagBoost * 0.12);
    fox.pivots.tail.rotation.x = -0.04 + Math.sin(t * 0.85) * 0.035;

    fox.pivots.armL.rotation.x = 0.1 * Math.sin(t * 1.1);
    fox.pivots.armR.rotation.x = 0.1 * Math.sin(t * 1.1 + 2.1);

    state.blinkAt -= dt;
    if (state.blinkAt <= 0 && state.blinkT < 0) { state.blinkT = 0; state.blinkAt = 2.8 + Math.random() * 3.2; }
    if (state.blinkT >= 0) {
      state.blinkT += dt;
      const p = state.blinkT / 0.22;
      if (p >= 1) { state.blinkT = -1; fox.eyes.left.scale.y = 1; fox.eyes.right.scale.y = 1; }
      else {
        const sy = 1 - 0.92 * Math.sin(p * Math.PI);
        fox.eyes.left.scale.y = sy; fox.eyes.right.scale.y = sy;
      }
    }

    state.twitchAt -= dt;
    if (state.twitchAt <= 0 && state.twitchT < 0) {
      state.twitchT = 0; state.twitchSide = Math.random() < 0.5 ? 0 : 1;
      state.twitchAt = 3.5 + Math.random() * 4;
    }
    if (state.twitchT >= 0) {
      state.twitchT += dt;
      const p = state.twitchT / 0.32;
      const ear = state.twitchSide ? fox.pivots.earL : fox.pivots.earR;
      const other = state.twitchSide ? fox.pivots.earR : fox.pivots.earL;
      other.rotation.z = 0;
      if (p >= 1) { ear.rotation.z = 0; state.twitchT = -1; }
      else ear.rotation.z = Math.sin(p * Math.PI * 3) * 0.14;
    }
  }

  leaves.update(dt, t);
  controls.update();
  renderer.render(scene, camera);
}
tick();

window.__fox = {
  params, fox, furs, scene, camera, controls,
  setParam,
  ready: true,
};
