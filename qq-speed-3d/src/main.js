import * as THREE from 'three';
import { createTextures } from './textures.js';
import { createTrack } from './track.js';
import { createKart, animateKart, kartWheelWorld } from './kart.js';
import { ParticlePool, SkidMarks } from './particles.js';
import { RaceAudio } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';

const SAVE_KEY = 'qqspeed3d.save.v1';
const params = new URLSearchParams(location.search);
if (params.get('reset') === '1') {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

const LAPS = 3;
const BASE_MAX = 46;
const BOOST_MAX = 58;
const NITRO_MAX = 64;
const KMH = 3.6 * 1.55;
const PERFECT_WINDOW = [2.0, 2.7];

const QUALITY = {
  low: { dpr: 1.25, shadows: false, shadowSize: 1024, particles: 0.45, fog: 600 },
  medium: { dpr: 1.5, shadows: true, shadowSize: 1024, particles: 0.75, fog: 720 },
  high: { dpr: 2.0, shadows: true, shadowSize: 2048, particles: 1.0, fog: 820 },
};

function loadSave() {
  const def = {
    coins: 0, bestTime: 0, bestLap: 0, races: 0,
    quality: null, muted: false,
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch (e) {}
  return def;
}

function saveGame(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

const save = loadSave();
const autoQuality = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth < 860
  ? 'medium' : 'high';
let qualityName = params.get('quality') || save.quality || autoQuality;
if (!QUALITY[qualityName]) qualityName = autoQuality;
let muted = params.has('muted') ? params.get('muted') !== '0' : !!save.muted;

const errors = [];
window.__errs = errors;
window.addEventListener('error', (e) => errors.push(String(e.message || e.error || e)));
window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + String(e.reason)));

// ===== renderer / scene =====
const host = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[qualityName].dpr));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = QUALITY[qualityName].shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcdefff, 220, QUALITY[qualityName].fog);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);

const hemi = new THREE.HemisphereLight(0xd9f4ff, 0x4f6f3f, 1.45);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1d2, 2.35);
sun.position.set(-60, 95, -50);
sun.castShadow = QUALITY[qualityName].shadows;
sun.shadow.mapSize.set(QUALITY[qualityName].shadowSize, QUALITY[qualityName].shadowSize);
sun.shadow.camera.left = -62;
sun.shadow.camera.right = 62;
sun.shadow.camera.top = 62;
sun.shadow.camera.bottom = -62;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x77c9ff, 0.55);
fill.position.set(70, 40, 80);
scene.add(fill);

const textures = createTextures(renderer);
scene.environment = textures.envMap;
scene.environmentIntensity = 0.72;

const track = createTrack(scene, renderer, textures, {
  shadows: QUALITY[qualityName].shadows,
});

const hud = new HUD(track);
const input = new Input();
const audio = new RaceAudio();
audio.setEnabled(!muted);

const addPool = new ParticlePool(scene, textures.glow, { max: 900, blending: THREE.AdditiveBlending });
const dustPool = new ParticlePool(scene, textures.smoke, { max: 320, blending: THREE.NormalBlending });
const skids = new SkidMarks(scene, textures.skid, 340);

// ===== karts =====
const PLAYER_COLORS = {
  primary: 0xff6a18, secondary: 0xf7f9ff, accent: 0x27dcff,
  suit: 0x10233a, helmet: 0xffd23f, number: 7,
};
const AI_COLORS = [
  { primary: 0xe33535, secondary: 0xf5f8ff, accent: 0xffd23f, suit: 0x241016, helmet: 0xffffff, number: 3 },
  { primary: 0x2f6dff, secondary: 0xeaf4ff, accent: 0x8cf5ff, suit: 0x0d1b36, helmet: 0xffffff, number: 5 },
  { primary: 0x1fae67, secondary: 0xf3fff8, accent: 0xffe066, suit: 0x0c2418, helmet: 0xffffff, number: 9 },
  { primary: 0x8b4dff, secondary: 0xf6f0ff, accent: 0xff8ad8, suit: 0x1c1030, helmet: 0xffffff, number: 2 },
  { primary: 0xffc93c, secondary: 0x27313c, accent: 0xff5d3b, suit: 0x231a08, helmet: 0xffffff, number: 6 },
];

const playerKart = createKart(PLAYER_COLORS, { detail: true, flameTex: textures.flame });
playerKart.group.rotation.order = 'YXZ';
scene.add(playerKart.group);

const player = {
  kart: playerKart,
  pos: new THREE.Vector3(),
  heading: 0,
  moveYaw: 0,
  speed: 0,
  steer: 0,
  drifting: false,
  driftDir: 0,
  driftCharge: 0,
  driftLevel: 0,
  driftTime: 0,
  doubleWindow: 0,
  boostTime: 0,
  nitro: 0,
  nitroActive: 0,
  laps: -1,
  progress: -20,
  prevIndex: -1,
  lapStart: 0,
  lapTimes: [],
  bestLap: 0,
  offroad: false,
  braking: false,
  wallHit: 0,
  collisionCooldown: 0,
  finished: false,
  place: 6,
  doubleBoosts: 0,
  driftBoosts: 0,
  nitroUses: 0,
};

const ais = [];
const AI_GRID = [[-5, 2.4], [-5, -2.4], [-10, 2.4], [-10, -2.4], [-15, 2.4]];
AI_GRID.forEach(([d, lane], i) => {
  const kart = createKart(AI_COLORS[i], { detail: true, flameTex: textures.flame });
  kart.group.rotation.order = 'YXZ';
  scene.add(kart.group);
  ais.push({
    kart,
    colors: AI_COLORS[i],
    dist: d,
    lane,
    baseLane: [-3.9, -1.95, 0, 1.95, 3.9][i],
    speed: 0,
    base: 45.2 + Math.random() * 2.8,
    phase: Math.random() * Math.PI * 2,
    reaction: 0.12 + Math.random() * 0.4,
    finished: false,
    finishTime: 0,
    steerVisual: 0,
  });
});

// ===== race state =====
let state = 'menu';
let paused = false;
let raceMs = 0;
let countdownTime = 0;
let countdownShown = -1;
let perfectStart = false;
let goTimer = 0;
let finishTimer = 0;
let resultShown = false;
let finishPlace = 6;
let finishCoins = 0;
let finishNewBest = false;
let camSnap = true;
let cameraShake = 0;
let cameraRoll = 0;
let camMicro = 0;
let hitstop = 0;
let sparkAcc = 0;
let smokeAcc = 0;
let dustAcc = 0;
let flameAcc = 0;
let skidAcc = 0;
let introTime = 0;

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function setKartTransform(kart, frame, pos, heading) {
  kart.group.position.copy(pos);
  kart.group.rotation.y = heading;
  kart.group.rotation.x = -Math.asin(clamp(frame.tangent.y, -0.35, 0.35)) * 0.7;
  kart.group.updateMatrixWorld(true);
}

function placeAll() {
  const L = track.length;
  const pu = 1 - 20 / L;
  const pf = track.frameAt(pu);
  player.pos.copy(pf.p).addScaledVector(pf.right, -2.4);
  player.pos.y = pf.p.y;
  player.heading = Math.atan2(pf.tangent.x, pf.tangent.z);
  player.moveYaw = player.heading;
  player.speed = 0;
  player.steer = 0;
  player.drifting = false;
  player.driftDir = 0;
  player.driftCharge = 0;
  player.driftLevel = 0;
  player.driftTime = 0;
  player.doubleWindow = 0;
  player.boostTime = 0;
  player.nitro = 0;
  player.nitroActive = 0;
  player.laps = -1;
  player.progress = -20;
  player.lapStart = 0;
  player.lapTimes = [];
  player.bestLap = 0;
  player.offroad = false;
  player.braking = false;
  player.wallHit = 0;
  player.collisionCooldown = 0;
  player.finished = false;
  player.place = 6;
  player.doubleBoosts = 0;
  player.driftBoosts = 0;
  player.nitroUses = 0;
  player.prevIndex = track.nearest(player.pos, -1).index;
  setKartTransform(player.kart, pf, player.pos, player.heading);

  ais.forEach((ai, i) => {
    const [d, lane] = AI_GRID[i];
    const u = ((d / L) % 1 + 1) % 1;
    const f = track.frameAt(u);
    ai.dist = d;
    ai.lane = lane;
    ai.speed = 0;
    ai.finished = false;
    ai.finishTime = 0;
    ai.steerVisual = 0;
    const pos = f.p.clone().addScaledVector(f.right, lane);
    pos.y = f.p.y;
    setKartTransform(ai.kart, f, pos, Math.atan2(f.tangent.x, f.tangent.z));
    ai.lastFrame = f;
  });
}

placeAll();

function setState(next) {
  state = next;
  document.body.classList.toggle('in-race',
    next === 'countdown' || next === 'race' || next === 'finish' || next === 'result' || next === 'paused');
  if (next === 'menu') document.body.classList.remove('in-race');
}

function resetEffects() {
  addPool.clear();
  dustPool.clear();
  skids.clear();
  sparkAcc = smokeAcc = dustAcc = flameAcc = skidAcc = 0;
  camSnap = true;
  cameraShake = 0;
  cameraRoll = 0;
}

function startRace() {
  audio.ensure();
  audio.ui();
  audio.startMusic();
  audio.setEngineActive(true);
  resetEffects();
  placeAll();
  hud.reset();
  hud.showHUD(true);
  hud.showTitle(false);
  hud.setMenuStats({ coins: save.coins, best: save.bestLap, races: save.races });
  hud.setStartTip(true);
  track.setStartLights(0, false);
  raceMs = 0;
  countdownTime = 0;
  countdownShown = -1;
  perfectStart = false;
  goTimer = 0;
  finishTimer = 0;
  resultShown = false;
  paused = false;
  input.reset();
  setState('countdown');
  setStartLights(0, false);
}

function setStartLights(active, go) {
  track.setStartLights(active, go);
}

function goRace() {
  setState('race');
  raceMs = 0;
  player.lapStart = 0;
  goTimer = 0.85;
  track.setStartLights(0, true);
  audio.countdown(0);
  if (perfectStart) {
    player.boostTime = 1.5;
    player.speed = 18;
    hud.showCallout('完美起步', 'PERFECT START', 'perfect');
    hud.flashBoost('perfect');
    audio.startBoost();
    spawnBoostBurst(1.4);
  } else {
    player.speed = 4.5;
  }
  hud.setStartTip(false);
  hud.setCountdown('GO!', 'go');
}

function goMenu() {
  paused = false;
  resetEffects();
  placeAll();
  hud.hideResult();
  hud.showPause(false);
  hud.showHUD(false);
  hud.showTitle(true);
  hud.setCountdown('');
  hud.setMenuStats({ coins: save.coins, best: save.bestLap, races: save.races });
  setState('menu');
  introTime = 0;
  audio.setEngineActive(false);
}

function finishRace() {
  if (player.finished) return;
  player.finished = true;
  finishPlace = rankOfPlayer();
  player.place = finishPlace;
  finishCoins = [0, 300, 220, 160, 120, 90, 70][finishPlace] || 60;
  finishNewBest = !save.bestTime || raceMs < save.bestTime;
  save.coins += finishCoins;
  save.races += 1;
  if (finishNewBest) save.bestTime = raceMs;
  if (player.bestLap && (!save.bestLap || player.bestLap < save.bestLap)) save.bestLap = player.bestLap;
  saveGame(save);
  finishTimer = 0;
  setState('finish');
  hud.showCallout('FINISH', `第 ${finishPlace} 名`, 'finish');
  hud.setStartTip(false);
  audio.finish();
  audio.duck(0.3, 1.6);
  hud.flashBoost('finish');
  // confetti
  const colors = [0xffd23f, 0xff6a18, 0x27dcff, 0xffffff, 0xff5d8f, 0x6bff9e];
  for (let i = 0; i < 90; i++) {
    dustPool.spawn({
      pos: player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 5 + Math.random() * 6, (Math.random() - 0.5) * 16)),
      vel: new THREE.Vector3((Math.random() - 0.5) * 5, 1 + Math.random() * 4, (Math.random() - 0.5) * 5),
      life: 1.5 + Math.random() * 1.2,
      size: 0.22 + Math.random() * 0.24,
      sizeEnd: 0.1,
      color: colors[(Math.random() * colors.length) | 0],
      colorEnd: colors[(Math.random() * colors.length) | 0],
      alpha: 1,
      gravity: 4.5,
      drag: 0.6,
    });
  }
}

function rankOfPlayer() {
  let r = 1;
  for (const ai of ais) {
    if (ai.dist > player.progress) r++;
  }
  return Math.min(6, r);
}

function updateRank() {
  player.place = rankOfPlayer();
}

function onLapCross() {
  player.laps += 1;
  if (player.laps >= 0 && player.laps < LAPS) {
    if (player.laps > 0) {
      const lapTime = raceMs - player.lapStart;
      if (lapTime > 0) {
        player.lapTimes.push(lapTime);
        if (!player.bestLap || lapTime < player.bestLap) player.bestLap = lapTime;
      }
      player.lapStart = raceMs;
      if (player.laps === LAPS - 1) {
        hud.showCallout('最后一圈', 'FINAL LAP', 'lap');
      } else {
        hud.showCallout(`第 ${player.laps + 1} 圈`, `${LAPS - player.laps} LAPS TO GO`, 'lap');
      }
    } else {
      player.lapStart = raceMs;
    }
    if (player.laps > 0) audio.lap();
  }
  if (player.laps >= LAPS) finishRace();
}

// ===== input helpers =====
function consumeStartInput() {
  return input.consumeStartPress();
}

// ===== player physics =====
function startDrift() {
  player.drifting = true;
  player.driftDir = Math.sign(input.steer || 1);
  player.driftCharge = 0;
  player.driftLevel = 0;
  player.driftTime = 0;
}

function releaseDrift() {
  const charge = player.driftCharge;
  const level = charge >= 0.9 ? 3 : charge >= 0.6 ? 2 : charge >= 0.28 ? 1 : 0;
  player.drifting = false;
  player.driftCharge = 0;
  player.driftLevel = 0;
  player.nitro = Math.min(3, player.nitro + 0.13 + charge * 0.32);
  if (level > 0) {
    player.driftBoosts += 1;
    player.boostTime = Math.max(player.boostTime, [0, 0.55, 0.85, 1.15][level]);
    player.speed += [0, 4.5, 7.5, 10.5][level];
    player.doubleWindow = 0.7;
    hud.showCallout(['', '小喷', '大喷', '强化喷'][level], 'DRIFT BOOST', 'boost' + level);
    hud.flashBoost('boost');
    audio.boost(level);
    spawnBoostBurst(level * 0.7);
  } else {
    player.doubleWindow = 0;
  }
}

function doDoubleBoost() {
  player.doubleWindow = 0;
  player.doubleBoosts += 1;
  player.boostTime = Math.max(player.boostTime, 0.55);
  player.speed += 7;
  hud.showCallout('双喷！', 'DOUBLE BOOST', 'double');
  hud.flashBoost('double');
  audio.doubleBoost();
  spawnBoostBurst(1.2);
}

function spawnBoostBurst(power = 1) {
  player.kart.group.updateMatrixWorld(true);
  const rear = new THREE.Vector3();
  player.kart.group.localToWorld(rear.set(0, 0.5, -1.25));
  addPool.burst(rear, Math.round(22 * power), {
    speed: 7 * power, spread: 1.1, up: 0.4, life: 0.5, size: 0.5 * power,
    color: player.nitroActive > 0 ? 0x40e8ff : 0xffb02e,
    colorEnd: 0xff5a14, gravity: 1, drag: 2.2, jitter: 0.4,
  });
}

function updatePlayer(dt) {
  const L = track.length;
  const driftPress = input.consumeDriftPress();

  if (driftPress && player.doubleWindow > 0) {
    doDoubleBoost();
  }
  if (player.doubleWindow > 0) player.doubleWindow -= dt;

  if (player.nitroActive > 0) player.nitroActive -= dt;
  if (player.boostTime > 0) player.boostTime -= dt;
  if (player.collisionCooldown > 0) player.collisionCooldown -= dt;
  if (player.wallHit > 0) player.wallHit -= dt;

  const steer = input.steer;
  player.steer = steer;

  const speedNorm = clamp(player.speed / BASE_MAX, 0, 1.35);

  // start drift
  if (!player.drifting && input.drift && player.speed > 11 && Math.abs(steer) > 0.22 && !player.offroad) {
    startDrift();
  }
  if (player.drifting && (!input.drift || player.speed < 7.5)) {
    releaseDrift();
  }

  // steering
  let turn = 0;
  const speedFactor = clamp(player.speed / 14, 0, 1);
  const highSpeedDamp = 1 - 0.24 * clamp(player.speed / 64, 0, 1);
  if (player.drifting) {
    player.driftCharge = Math.min(1,
      player.driftCharge + dt * (0.46 + Math.abs(steer) * 0.42) * (0.72 + speedNorm * 0.5));
    const prevLevel = player.driftLevel;
    player.driftLevel = player.driftCharge >= 0.9 ? 3 : player.driftCharge >= 0.6 ? 2 : player.driftCharge >= 0.28 ? 1 : 0;
    if (player.driftLevel > prevLevel && player.driftLevel > 0) {
      audio.driftTick(player.driftLevel);
      camMicro = Math.max(camMicro, 0.18 + player.driftLevel * 0.05);
    }
    turn = (steer * 1.02 + player.driftDir * 0.16) * speedFactor * highSpeedDamp;
    player.speed -= 0.7 * dt;
  } else {
    turn = steer * 1.5 * speedFactor * highSpeedDamp;
  }
  if (player.braking) turn *= 1.18;
  player.heading += turn * dt;

  // grip: movement direction follows heading
  const diff = wrapAngle(player.heading - player.moveYaw);
  const grip = player.drifting ? 3.2 : 12;
  player.moveYaw += diff * Math.min(1, grip * dt);

  // nitro
  if (input.consumeNitro()) {
    if (player.nitro >= 1 && player.nitroActive <= 0) {
      player.nitro -= 1;
      player.nitroActive = 1.9;
      player.nitroUses += 1;
      player.speed += 9;
      hud.showCallout('氮气加速', 'NITRO BOOST', 'nitro');
      hud.flashBoost('nitro');
      audio.nitro();
      spawnBoostBurst(1.8);
      cameraShake = Math.max(cameraShake, 0.35);
    }
  }

  // speed
  player.braking = input.brake && !player.finished;
  let cap = BASE_MAX;
  if (player.boostTime > 0) cap = BOOST_MAX;
  if (player.nitroActive > 0) cap = NITRO_MAX;
  if (player.offroad) cap *= 0.64;
  if (player.braking) cap = 0;
  if (player.finished) cap = 0;
  const accelRate = (player.boostTime > 0 || player.nitroActive > 0) ? 2.4 : 1.02;
  if (player.speed < cap) {
    player.speed += (cap - player.speed) * Math.min(1, accelRate * dt);
  } else {
    player.speed += (cap - player.speed) * Math.min(1, 1.7 * dt);
  }
  if (player.braking) player.speed -= 27 * dt;
  if (player.speed < 0) player.speed = 0;

  // move
  player.pos.x += Math.sin(player.moveYaw) * player.speed * dt;
  player.pos.z += Math.cos(player.moveYaw) * player.speed * dt;

  // track queries
  const near = track.nearest(player.pos, player.prevIndex);
  player.offroad = Math.abs(near.offset) > track.half + 0.15;
  const wallLimit = track.half + 2.0;
  if (Math.abs(near.offset) > wallLimit) {
    const sign = Math.sign(near.offset);
    const correction = near.offset - sign * wallLimit;
    player.pos.x -= near.right.x * correction;
    player.pos.z -= near.right.z * correction;
    const tangentYaw = Math.atan2(near.tangent.x, near.tangent.z);
    // slide along the wall instead of sticking to it
    player.moveYaw += wrapAngle(tangentYaw - player.moveYaw) * Math.min(1, dt * 10);
    player.heading += wrapAngle(tangentYaw - player.heading) * Math.min(1, dt * 6);
    if (player.wallHit <= 0) {
      const impact = clamp(player.speed / BASE_MAX, 0.2, 1);
      player.wallHit = 0.45;
      player.speed *= 0.78;
      player.drifting = false;
      player.driftCharge = 0;
      player.driftLevel = 0;
      cameraShake = Math.max(cameraShake, 0.75 * impact);
      camMicro = 1;
      hitstop = Math.max(hitstop, 0.055 + impact * 0.035);
      audio.collision();
      audio.hitstop();
      player.kart.group.updateMatrixWorld(true);
      tmpV.copy(player.pos).add(tmpV2.set(0, 0.8, 0));
      addPool.burst(tmpV, 22 + Math.round(impact * 16), {
        speed: 8, spread: 1.4, up: 0.7, life: 0.55, size: 0.32,
        color: 0xffd166, colorEnd: 0xff4b1a, gravity: 9, drag: 1.3, jitter: 0.5,
      });
    }
  }
  player.pos.y = near.y;
  player.offroad = Math.abs(near.offset) > track.half + 0.15;

  // lap crossing
  const N = track.N;
  if (player.prevIndex >= 0) {
    if (player.prevIndex > N * 0.78 && near.index < N * 0.22) {
      onLapCross();
    } else if (player.prevIndex < N * 0.22 && near.index > N * 0.78) {
      player.laps = Math.max(-1, player.laps - 1);
    }
  }
  player.prevIndex = near.index;
  player.progress = player.laps * L + near.u * L;

  // transform
  const frame = track.frameAt(near.u);
  setKartTransform(player.kart, frame, player.pos, player.heading);

  // boost pads
  for (const pad of track.boostPads) {
    if (pad.cooldown > 0) continue;
    const dx = player.pos.x - pad.center.x;
    const dz = player.pos.z - pad.center.z;
    if (dx * dx + dz * dz < 3.6 * 3.6) {
      pad.cooldown = 1.0;
      player.nitro = Math.min(3, player.nitro + 0.42);
      player.boostTime = Math.max(player.boostTime, 0.5);
      player.speed += 5;
      hud.showCallout('加速带', '+ NITRO', 'pad');
      hud.flashBoost('pad');
      audio.pad();
      addPool.burst(pad.center, 26, {
        speed: 8, spread: 1.2, up: 0.9, life: 0.6, size: 0.4,
        color: 0x4ff2ff, colorEnd: 0x0a7dff, gravity: 2, drag: 1.6,
      });
    }
  }

  // kart collisions
  for (const ai of ais) {
    const p = ai.kart.group.position;
    const dx = player.pos.x - p.x;
    const dz = player.pos.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 4.2 * 4.2 && d2 > 0.001) {
      const dist = Math.sqrt(d2);
      const push = (4.2 - dist) * 0.11;
      player.pos.x += (dx / dist) * push;
      player.pos.z += (dz / dist) * push;
      player.speed *= 0.975;
      ai.speed *= 0.985;
      if (player.collisionCooldown <= 0) {
        player.collisionCooldown = 0.45;
        cameraShake = Math.max(cameraShake, 0.24);
        camMicro = 0.8;
        hitstop = Math.max(hitstop, 0.035);
        audio.collision();
        player.kart.group.updateMatrixWorld(true);
        tmpV.copy(player.pos).add(tmpV2.set(0, 0.6, 0));
        addPool.burst(tmpV, 12, {
          speed: 5, spread: 1.2, up: 0.5, life: 0.4, size: 0.24,
          color: 0xfff0a8, colorEnd: 0xff7a1a, gravity: 7, drag: 1.4,
        });
      }
    }
  }

  // effects
  player.kart.group.updateMatrixWorld(true);
  emitPlayerEffects(dt, near);

  // wall scrape sparks while sliding along the barrier
  if (Math.abs(near.offset) > wallLimit - 0.05 && player.speed > 8) {
    const scrapeAcc = dt * 55 * QUALITY[qualityName].particles;
    for (let i = 0; i < scrapeAcc; i++) {
      const side = Math.sign(near.offset);
      tmpV.copy(player.pos)
        .addScaledVector(near.right, side * 0.95)
        .add(tmpV2.set(0, 0.45, 0));
      addPool.spawn({
        pos: tmpV.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3 - Math.sin(player.heading) * player.speed * 0.28,
          0.8 + Math.random() * 2.2,
          (Math.random() - 0.5) * 3 - Math.cos(player.heading) * player.speed * 0.28
        ),
        life: 0.26 + Math.random() * 0.26,
        size: 0.14 + Math.random() * 0.16,
        sizeEnd: 0.02,
        color: 0xffd166, colorEnd: 0xff4b1a,
        gravity: 8, drag: 1.4,
      });
    }
  }
}

function emitPlayerEffects(dt, near) {
  const scale = QUALITY[qualityName].particles;
  const rearL = new THREE.Vector3();
  const rearR = new THREE.Vector3();
  kartWheelWorld(player.kart, false, -1, rearL);
  kartWheelWorld(player.kart, false, 1, rearR);
  rearL.y += 0.06;
  rearR.y += 0.06;

  if (player.drifting) {
    const level = player.driftLevel;
    const col = level >= 3 ? 0xff9a2e : level >= 2 ? 0xbb6bff : 0x54efff;
    const colEnd = level >= 3 ? 0xff3b1a : level >= 2 ? 0x6a2bff : 0x0a9bff;
    sparkAcc += dt * (42 + player.driftCharge * 60) * scale;
    while (sparkAcc >= 1) {
      sparkAcc -= 1;
      const base = Math.random() > 0.5 ? rearL : rearR;
      addPool.spawn({
        pos: base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.05, (Math.random() - 0.5) * 0.25)),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4 - Math.sin(player.heading) * 2,
          1.4 + Math.random() * 2.4,
          (Math.random() - 0.5) * 4 - Math.cos(player.heading) * 2
        ),
        life: 0.28 + Math.random() * 0.34,
        size: 0.18 + Math.random() * 0.22,
        sizeEnd: 0.02,
        color: col, colorEnd: colEnd, alpha: 1,
        gravity: 7, drag: 1.6,
      });
    }
    smokeAcc += dt * 15 * scale;
    while (smokeAcc >= 1) {
      smokeAcc -= 1;
      const base = Math.random() > 0.5 ? rearL : rearR;
      dustPool.spawn({
        pos: base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.3, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 1.3),
        life: 0.55 + Math.random() * 0.5,
        size: 0.5 + Math.random() * 0.4,
        sizeEnd: 1.7,
        color: 0xe8f0f6, colorEnd: 0xd3dde6,
        alpha: 0.24, gravity: -0.4, drag: 0.7,
      });
    }
    skidAcc += dt;
    if (skidAcc > 0.045) {
      skidAcc = 0;
      skids.add(rearL, player.heading, 1);
      skids.add(rearR, player.heading, 1);
    }
  }

  if (player.offroad && player.speed > 6) {
    dustAcc += dt * 30 * scale;
    while (dustAcc >= 1) {
      dustAcc -= 1;
      const base = Math.random() > 0.5 ? rearL : rearR;
      dustPool.spawn({
        pos: base.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 1.6 - Math.sin(player.heading) * 1.4,
          1.0 + Math.random() * 1.3,
          (Math.random() - 0.5) * 1.6 - Math.cos(player.heading) * 1.4
        ),
        life: 0.5 + Math.random() * 0.5,
        size: 0.5 + Math.random() * 0.5,
        sizeEnd: 1.9,
        color: 0xd8c39a, colorEnd: 0xb59a6d,
        alpha: 0.3, gravity: -0.3, drag: 0.8,
      });
    }
  }

  if ((player.boostTime > 0 || player.nitroActive > 0) && player.speed > 12) {
    flameAcc += dt * 95 * scale;
    const nitro = player.nitroActive > 0;
    const rear = new THREE.Vector3();
    const side = Math.random() > 0.5 ? -0.38 : 0.38;
    player.kart.group.localToWorld(rear.set(side, 0.44, -1.35));
    while (flameAcc >= 1) {
      flameAcc -= 1;
      addPool.spawn({
        pos: rear.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14)),
        vel: new THREE.Vector3(
          -Math.sin(player.heading) * (10 + Math.random() * 6) + (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.3) * 1.2,
          -Math.cos(player.heading) * (10 + Math.random() * 6) + (Math.random() - 0.5) * 1.4
        ),
        life: 0.22 + Math.random() * 0.2,
        size: (nitro ? 0.65 : 0.48) * (0.7 + Math.random() * 0.6),
        sizeEnd: 0.06,
        color: nitro ? 0x4ff2ff : 0xffb02e,
        colorEnd: nitro ? 0x0a63ff : 0xff3b0a,
        alpha: 0.95, gravity: 0, drag: 2.4,
      });
    }
  }
}

// ===== AI =====
function updateAI(dt) {
  const L = track.length;
  const elapsed = raceMs / 1000;
  ais.forEach((ai, i) => {
    const u = ((ai.dist / L) % 1 + 1) % 1;
    const f = track.frameAt(u);
    const ahead1 = track.frameAt(u + 0.012).tangent;
    const ahead2 = track.frameAt(u + 0.042).tangent;
    const bend = Math.acos(clamp(ahead1.dot(ahead2), -1, 1));
    const corner = clamp(1 - bend * 2.7, 0.62, 1);

    let target;
    if (ai.finished) {
      target = 13;
    } else if (elapsed < ai.reaction) {
      target = 0;
    } else {
      target = ai.base * corner;
      const gap = player.progress - ai.dist;
      target *= 1 + clamp(gap / 320, -0.055, 0.13);
      if (ai.speed < 3) target = Math.max(target, 22);
    }
    const rate = target > ai.speed ? 1.25 : 2.1;
    ai.speed += (target - ai.speed) * Math.min(1, rate * dt);
    ai.dist += ai.speed * dt;

    if (!ai.finished && ai.dist >= L * LAPS) {
      ai.finished = true;
      ai.finishTime = raceMs;
    }

    const u2 = ((ai.dist / L) % 1 + 1) % 1;
    const fr = track.frameAt(u2);
    const laneTarget = ai.baseLane + Math.sin(ai.dist * 0.02 + ai.phase) * 0.65;
    ai.lane += (laneTarget - ai.lane) * Math.min(1, dt * 2.2);
    const pos = fr.p.clone().addScaledVector(fr.right, ai.lane);
    pos.y = fr.p.y;
    const heading = Math.atan2(fr.tangent.x, fr.tangent.z);
    setKartTransform(ai.kart, fr, pos, heading);

    const cornerSteer = clamp(-bend * 8, -0.9, 0.9) * (ahead1.x * fr.tangent.z - ahead1.z * fr.tangent.x > 0 ? 1 : -1);
    ai.steerVisual += (cornerSteer - ai.steerVisual) * Math.min(1, dt * 4);
    animateKart(ai.kart, dt, {
      speedNorm: ai.speed / BASE_MAX,
      steer: ai.steerVisual,
      drifting: corner < 0.78 && ai.speed > 20,
      driftDir: Math.sign(ai.steerVisual || 1),
      flameLevel: ai.speed > 10 ? 0.55 : 0.25,
      accel: 0.4,
      nitro: ai.finished,
      offroad: false,
    });
  });
}

// ===== camera =====
function updateChaseCamera(dt) {
  const speedNorm = clamp(player.speed / BASE_MAX, 0, 1.3);
  const fwd = tmpV.set(Math.sin(player.heading), 0, Math.cos(player.heading));
  const back = 5.9 + speedNorm * 1.7 + (player.nitroActive > 0 ? 1.7 : 0);
  const height = 2.16 + speedNorm * 0.4;
  const right = tmpV2.set(fwd.z, 0, -fwd.x);
  const desired = tmpV3.copy(player.pos)
    .addScaledVector(fwd, -back)
    .addScaledVector(right, player.steer * 0.52)
    .add(new THREE.Vector3(0, height, 0));

  const lerp = camSnap ? 1 : 1 - Math.exp(-dt * 5.6);
  camPos.lerp(desired, lerp);
  if (camSnap) camPos.copy(desired);
  const lookTarget = new THREE.Vector3(
    player.pos.x + fwd.x * (5.5 + speedNorm * 6),
    player.pos.y + 1.22,
    player.pos.z + fwd.z * (5.5 + speedNorm * 6)
  );
  if (camSnap) camLook.copy(lookTarget);
  camLook.lerp(lookTarget, camSnap ? 1 : 1 - Math.exp(-dt * 7));
  camSnap = false;

  cameraShake = Math.max(0, cameraShake - dt * 2.2);
  camMicro = Math.max(0, camMicro - dt * 5.5);
  const driftShake = player.drifting ? 0.035 : 0;
  const nitroShake = player.nitroActive > 0 ? 0.045 : 0;
  const offroadShake = player.offroad ? 0.06 : 0;
  const shake = cameraShake * 0.16 + driftShake + nitroShake + offroadShake + camMicro * 0.09;
  camera.position.copy(camPos);
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.position.z += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(camLook);
  // subtle bank/roll into the corner for speed drama
  const rollTarget = player.drifting
    ? player.driftDir * 0.05
    : player.steer * 0.022 * clamp(player.speed / BASE_MAX, 0, 1);
  cameraRoll += (rollTarget - cameraRoll) * Math.min(1, dt * 5);
  camera.rotateZ(cameraRoll);

  const fov = 58 + speedNorm * 9 + (player.nitroActive > 0 ? 9 : 0) + (player.boostTime > 0 ? 3 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}

function updateMenuCamera(dt) {
  introTime += dt;
  const t = introTime * 0.16;
  const f = track.frameAt(0.982);
  const center = player.pos.clone();
  const radius = 12.5;
  const desired = new THREE.Vector3(
    center.x + Math.sin(t) * radius + f.right.x * 2.2,
    center.y + 4.4 + Math.sin(t * 0.7) * 1.1,
    center.z + Math.cos(t) * radius + f.right.z * 2.2
  );
  camera.position.lerp(desired, camSnap ? 1 : 1 - Math.exp(-dt * 2.2));
  const look = new THREE.Vector3(center.x, center.y + 1.15, center.z);
  camera.lookAt(look);
  if (camera.fov !== 55) {
    camera.fov += (55 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
  camSnap = false;
}

function updateResultCamera(dt) {
  introTime += dt;
  const t = introTime * 0.35;
  const center = player.pos;
  const desired = new THREE.Vector3(
    center.x + Math.sin(t) * 9,
    center.y + 3.4,
    center.z + Math.cos(t) * 9
  );
  camera.position.lerp(desired, 1 - Math.exp(-dt * 2.4));
  camera.lookAt(center.x, center.y + 0.9, center.z);
}

// ===== frame updates =====
function updateCountdown(dt) {
  countdownTime += dt;
  const idx = Math.floor(countdownTime);
  if (idx !== countdownShown && idx < 3) {
    countdownShown = idx;
    hud.setCountdown(String(3 - idx));
    audio.countdown(3 - idx);
    setStartLights(idx + 1, false);
  }
  if (consumeStartInput() && countdownTime >= PERFECT_WINDOW[0] && countdownTime <= PERFECT_WINDOW[1]) {
    perfectStart = true;
    hud.setStartTip(false);
    hud.showCallout('完美起步', 'PERFECT TIMING', 'perfect');
  }
  animateKart(player.kart, dt, {
    speedNorm: 0.02 + Math.sin(countdownTime * 18) * 0.012,
    steer: input.steer * 0.3, flameLevel: 0.55, rev: true, accel: 0.8,
  });
  updateChaseCamera(dt);
  if (countdownTime >= 3) goRace();
}

function updateRace(dt) {
  raceMs += dt * 1000;
  input.update(dt);
  updatePlayer(dt);
  updateAI(dt);
  updateRank();
  player.kart.group.updateMatrixWorld(true);
  animateKart(player.kart, dt, {
    speedNorm: player.speed / BASE_MAX,
    steer: player.steer,
    drifting: player.drifting,
    driftDir: player.driftDir,
    flameLevel: (player.nitroActive > 0 ? 3 : 0) + (player.boostTime > 0 ? 1.4 : 0) + 0.45,
    nitro: player.nitroActive > 0,
    accel: player.speed < (player.boostTime > 0 ? BOOST_MAX : BASE_MAX) ? 1 : 0,
    braking: player.braking,
    offroad: player.offroad,
  });
  updateChaseCamera(dt);

  hud.update(dt, {
    speedKmh: player.speed * KMH,
    rank: player.place,
    lap: clamp(player.laps + 1, 1, LAPS),
    raceMs,
    nitro: player.nitro,
    drifting: player.drifting,
    driftCharge: player.driftCharge,
    driftLevel: player.driftLevel,
    offroad: player.offroad,
    nitroActive: player.nitroActive > 0,
    dt,
    playerYaw: player.heading,
    karts: [
      { x: player.pos.x, z: player.pos.z, yaw: player.heading, color: '#ffd23f', isPlayer: true },
      ...ais.map((a) => ({
        x: a.kart.group.position.x,
        z: a.kart.group.position.z,
        yaw: a.kart.group.rotation.y,
        color: '#' + a.colors.primary.toString(16).padStart(6, '0'),
        isPlayer: false,
      })),
    ],
  });

  if (goTimer > 0) {
    goTimer -= dt;
    if (goTimer <= 0) hud.setCountdown('');
  }
}

function updateFinish(dt) {
  raceMs += dt * 1000;
  player.speed *= Math.max(0, 1 - 1.4 * dt);
  player.pos.x += Math.sin(player.moveYaw) * player.speed * dt;
  player.pos.z += Math.cos(player.moveYaw) * player.speed * dt;
  const near = track.nearest(player.pos, player.prevIndex);
  player.prevIndex = near.index;
  player.pos.y = near.y;
  const frame = track.frameAt(near.u);
  setKartTransform(player.kart, frame, player.pos, player.heading);
  animateKart(player.kart, dt, {
    speedNorm: player.speed / BASE_MAX,
    steer: 0,
    drifting: false,
    flameLevel: player.speed > 3 ? 0.4 : 0.1,
    accel: 0,
    braking: false,
    offroad: false,
  });
  updateAI(dt);
  updateChaseCamera(dt);
  hud.update(dt, {
    speedKmh: player.speed * KMH,
    rank: finishPlace,
    lap: LAPS,
    raceMs,
    nitro: player.nitro,
    drifting: false,
    driftCharge: 0,
    driftLevel: 0,
    offroad: false,
    nitroActive: false,
    dt,
    playerYaw: player.heading,
    karts: [
      { x: player.pos.x, z: player.pos.z, yaw: player.heading, color: '#ffd23f', isPlayer: true },
      ...ais.map((a) => ({
        x: a.kart.group.position.x,
        z: a.kart.group.position.z,
        yaw: a.kart.group.rotation.y,
        color: '#' + a.colors.primary.toString(16).padStart(6, '0'),
        isPlayer: false,
      })),
    ],
  });
  finishTimer += dt;
  if (finishTimer > 1.9 && !resultShown) {
    resultShown = true;
    setState('result');
    hud.showResult({
      place: finishPlace,
      time: raceMs,
      best: player.bestLap,
      coins: finishCoins,
      totalCoins: save.coins,
      historyBest: save.bestTime,
      newBest: finishNewBest,
      doubleBoosts: player.doubleBoosts,
      driftBoosts: player.driftBoosts,
      nitroUses: player.nitroUses,
    });
  }
}

function updateMenu(dt) {
  input.update(dt);
  const f = track.frameAt(0.982);
  animateKart(player.kart, dt, {
    speedNorm: 0.02 + Math.sin(introTime * 2.2) * 0.008,
    steer: 0, flameLevel: 0.5, rev: true, accel: 0.3,
  });
  ais.forEach((ai) => {
    animateKart(ai.kart, dt, { speedNorm: 0.02, steer: 0, flameLevel: 0.25, rev: true });
  });
  updateMenuCamera(dt);
}

function updateResult(dt) {
  updateResultCamera(dt);
  animateKart(player.kart, dt, {
    speedNorm: 0.05, steer: 0, flameLevel: 0.5, rev: true, accel: 0.3,
  });
}

// ===== UI wiring =====
function setMuted(next) {
  muted = !!next;
  save.muted = muted;
  saveGame(save);
  audio.setEnabled(!muted);
  document.querySelectorAll('[data-sound-label]').forEach((el) => {
    el.textContent = muted ? '音效 OFF' : '音效 ON';
  });
  document.querySelectorAll('.sound-btn').forEach((b) => b.classList.toggle('off', muted));
  const hudBtn = document.getElementById('mute-btn-hud');
  if (hudBtn) hudBtn.classList.toggle('off', muted);
  const titleSound = document.getElementById('title-sound');
  if (titleSound) titleSound.classList.toggle('active', !muted);
}

function applyQuality(name) {
  if (!QUALITY[name]) return;
  qualityName = name;
  save.quality = name;
  saveGame(save);
  const q = QUALITY[name];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.needsUpdate = true;
  sun.castShadow = q.shadows;
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  sun.shadow.camera.updateProjectionMatrix();
  scene.fog.far = q.fog;
  document.querySelectorAll('.quality-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.q === name);
  });
}

function togglePause() {
  if (state !== 'race' && state !== 'countdown' && state !== 'finish') return;
  paused = !paused;
  hud.showPause(paused);
  audio.setEngineActive(!paused);
  if (!paused) {
    audio.ensure();
    goTimer = Math.max(goTimer, 0.2);
  } else {
    hud.setStartTip(false);
  }
}

document.querySelectorAll('[data-q]').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.ensure();
    audio.ui();
    applyQuality(btn.dataset.q);
  });
});

document.querySelectorAll('.sound-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.ensure();
    setMuted(!muted);
    if (!muted) audio.ui();
  });
});

document.getElementById('start-btn').addEventListener('click', () => {
  startRace();
});
document.getElementById('help-btn').addEventListener('click', () => {
  document.getElementById('title-screen').classList.toggle('help-open');
  audio.ensure();
  audio.ui();
});
document.getElementById('again-btn').addEventListener('click', () => {
  audio.ui();
  hud.hideResult();
  startRace();
});
document.getElementById('menu-btn').addEventListener('click', () => {
  audio.ui();
  goMenu();
});
document.getElementById('resume-btn').addEventListener('click', () => {
  audio.ui();
  togglePause();
});
document.getElementById('restart-btn').addEventListener('click', () => {
  audio.ui();
  hud.showPause(false);
  paused = false;
  startRace();
});
document.getElementById('pause-menu-btn').addEventListener('click', () => {
  audio.ui();
  goMenu();
});

let hiddenTimer = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = setTimeout(() => {
      hiddenTimer = null;
      if (document.hidden && state === 'race' && !paused) togglePause();
    }, 900);
  } else if (hiddenTimer) {
    clearTimeout(hiddenTimer);
    hiddenTimer = null;
  }
});

setMuted(muted);
applyQuality(qualityName);
hud.setMenuStats({ coins: save.coins, best: save.bestLap, races: save.races });
hud.showHUD(false);
hud.showTitle(true);

// ===== main loop =====
const clock = new THREE.Clock();
let last = performance.now();
let frameCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0.0001, rawDt));

  if (hitstop > 0) {
    hitstop -= rawDt;
    track.update(rawDt * 0.25, camera);
    addPool.update(rawDt * 0.2);
    dustPool.update(rawDt * 0.2);
    renderer.render(scene, camera);
    return;
  }

  if (input.consumeMute()) {
    audio.ensure();
    setMuted(!muted);
  }
  if (input.consumePause() && (state === 'race' || state === 'countdown' || state === 'finish')) {
    togglePause();
  }

  if (!paused) {
    if (state === 'menu') {
      updateMenu(dt);
    } else if (state === 'countdown') {
      input.update(dt);
      updateCountdown(dt);
    } else if (state === 'race') {
      updateRace(dt);
    } else if (state === 'finish') {
      updateFinish(dt);
    } else if (state === 'result') {
      updateResult(dt);
      if (input.consumePause()) {
        // ignore in result
      }
    }
    if (state !== 'paused') {
      track.update(dt, camera);
      addPool.update(dt);
      dustPool.update(dt);
      if (state !== 'result' && state !== 'menu') {
        // camera/sun follow
      }
    }
    // shadow follows player
    sun.position.set(player.pos.x + 62, player.pos.y + 98, player.pos.z - 38);
    sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
    sun.target.updateMatrixWorld();
  }

  if (!paused && (state === 'race' || state === 'countdown' || state === 'finish')) {
    audio.update(dt, {
      speed: player.speed / BASE_MAX,
      drifting: player.drifting,
      steer: player.steer,
      boost: player.boostTime > 0 || player.nitroActive > 0,
      offroad: player.offroad,
      nitro: player.nitroActive > 0,
    });
  } else if (state === 'menu') {
    audio.update(dt, { speed: 0.02, drifting: false, steer: 0, boost: false, offroad: false, nitro: false });
  }

  renderer.render(scene, camera);
  frameCount++;
  if (frameCount === 2) {
    window.__qq.ready = true;
    if (params.get('auto') === '1') {
      setTimeout(() => { try { startRace(); } catch (e) {} }, 300);
    }
  }
}

requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[qualityName].dpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  hud.resize();
});

// ===== testing hooks =====
window.__qq = {
  ready: false,
  get state() { return state; },
  get paused() { return paused; },
  get raceMs() { return raceMs; },
  get quality() { return qualityName; },
  get muted() { return muted; },
  player,
  ais,
  track,
  camera,
  renderer,
  scene,
  input,
  audio,
  hud,
  errors,
  startRace,
  goMenu,
  togglePause,
  setMuted,
  applyQuality,
  setNitro(n) { player.nitro = clamp(n, 0, 3); },
  setSpeed(n) { player.speed = n; },
  setTestDrive(o) { input.manual = o ? { ...o } : null; },
  testPress(kind) {
    if (kind === 'drift') input.driftPresses++;
    if (kind === 'nitro') input.nitroQueued = true;
    if (kind === 'start') input.startPresses++;
  },
  skipCountdown() { if (state === 'countdown') { countdownTime = 3.01; goRace(); } },
  placeProgress(dist, lane = -2.4) {
    const L = track.length;
    const u = ((dist / L) % 1 + 1) % 1;
    const f = track.frameAt(u);
    player.pos.copy(f.p).addScaledVector(f.right, lane);
    player.pos.y = f.p.y;
    player.heading = Math.atan2(f.tangent.x, f.tangent.z);
    player.moveYaw = player.heading;
    player.laps = Math.floor(dist / L);
    player.progress = dist;
    player.prevIndex = track.nearest(player.pos, -1).index;
    setKartTransform(player.kart, f, player.pos, player.heading);
  },
  getFrame() { return { state, paused, raceMs, speed: player.speed, nitro: player.nitro, laps: player.laps, place: player.place, drift: player.drifting, charge: player.driftCharge }; },
  debug() {
    const near = track.nearest(player.pos, player.prevIndex);
    return {
      speed: player.speed, brake: player.braking, offroad: player.offroad,
      offset: near.offset, index: near.index, prev: player.prevIndex, laps: player.laps,
      progress: player.progress, heading: player.heading, moveYaw: player.moveYaw,
      pos: player.pos.toArray(), boost: player.boostTime, nitroActive: player.nitroActive, nitro: player.nitro,
      finished: player.finished, steer: player.steer, inputBrake: input.brake,
      drifting: player.drifting, driftCharge: player.driftCharge, driftLevel: player.driftLevel,
      doubleWindow: player.doubleWindow, doubleBoosts: player.doubleBoosts, driftBoosts: player.driftBoosts, nitroUses: player.nitroUses,
      ai: ais.map(a => ({ dist: a.dist, speed: a.speed, lane: a.lane })),
    };
  },
};
