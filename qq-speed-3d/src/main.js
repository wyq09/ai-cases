import * as THREE from 'three';
import { createTextures } from './textures.js?v=20261019a';
import { createTrack } from './track.js?v=20261019a';
import { createKart, animateKart, kartWheelWorld, applyKartTuning } from './kart.js?v=20261019a';
import { ParticlePool, SkidMarks } from './particles.js?v=20261019a';
import { RaceAudio } from './audio.js?v=20261019a';
import { HUD } from './hud.js?v=20261019a';
import { Input } from './input.js?v=20261019a';
import { SelectScreen } from './select.js?v=20261019a';
import {
  LEVELS, LEVEL_BY_ID, levelSpec, makeEndlessSpec, DIFFICULTIES, difficultyOf,
} from './tracks.js?v=20261019a';
import { ItemSystem } from './items.js?v=20261019a';
import { Garage } from './garage.js?v=20261019a';
import {
  PARTS, MAX_LEVEL, defaultTuning, sanitizeTuning, tuningStats, upgradeCost,
} from './tuning.js?v=20261019a';

const SAVE_KEY = 'qqspeed3d.save.v1';
const params = new URLSearchParams(location.search);
if (params.get('reset') === '1') {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

const BASE_MAX = 46;
const BOOST_MAX = 58;
const NITRO_MAX = 64;

// ===== difficulty + garage (改装) =====
// `mods` is the single place the driving code reads its multipliers from.
// Rebuilt by applyLoadout() whenever the player changes difficulty or buys a
// part, so the physics never has to know about saves.
const mods = {
  difficulty: difficultyOf('normal'),
  tuning: tuningStats(defaultTuning()),
  baseMax: BASE_MAX,
  boostMax: BOOST_MAX,
  nitroMax: NITRO_MAX,
};

function applyLoadout() {
  const diff = difficultyOf(save.difficulty);
  const tune = tuningStats(save.tuning);
  mods.difficulty = diff;
  mods.tuning = tune;
  mods.baseMax = BASE_MAX * diff.capMul * tune.cap;
  mods.boostMax = BOOST_MAX * diff.capMul * tune.cap;
  mods.nitroMax = NITRO_MAX * diff.capMul * tune.cap;
  applyKartTuning(player.kart, tune);
  items.setModifiers({
    mineRate: diff.mineRate,
    missileSpeed: tune.missileSpeed,
    missileDamage: tune.missileDamage,
    luck: tune.luck,
  });
  return mods;
}
const KMH = 3.6 * 1.55;
const PERFECT_WINDOW = [2.0, 2.7];
const PLACE_BONUS = [0, 280, 210, 160, 120, 90, 70];

const QUALITY = {
  low: { dpr: 1.25, shadows: false, shadowSize: 1024, particles: 0.45, fog: 600 },
  medium: { dpr: 1.5, shadows: true, shadowSize: 1024, particles: 0.75, fog: 720 },
  high: { dpr: 2.0, shadows: true, shadowSize: 2048, particles: 1.0, fog: 820 },
};

function defaultSave() {
  return {
    coins: 0, bestTime: 0, bestLap: 0, races: 0,
    quality: null, muted: false,
    levels: {},
    endless: { bestStage: 0, coins: 0, runs: 0 },
    lastLevel: LEVELS[0].id,
    difficulty: 'normal',
    tuning: defaultTuning(),
  };
}

function loadSave() {
  const def = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return {
      ...def,
      ...parsed,
      levels: { ...(parsed.levels || {}) },
      endless: { ...def.endless, ...(parsed.endless || {}) },
      difficulty: difficultyOf(parsed.difficulty).id,
      tuning: sanitizeTuning(parsed.tuning),
    };
  } catch (e) {}
  return def;
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

const save = loadSave();
// ?diff=easy|normal|hard 覆盖本次会话的难度（调试 / 分享用）
const diffParam = params.get('diff');
if (diffParam && ['easy', 'normal', 'hard'].includes(diffParam)) save.difficulty = diffParam;
const debugUnlockAll = params.get('unlock') === '1';
const autoQuality = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth < 860
  ? 'medium' : 'high';
let qualityName = params.get('quality') || save.quality || autoQuality;
if (!QUALITY[qualityName]) qualityName = autoQuality;
let muted = params.has('muted') ? params.get('muted') !== '0' : !!save.muted;

const errors = [];
window.__errs = errors;
window.addEventListener('error', (e) => errors.push(String(e.message || e.error || e)));
window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + String(e.reason)));

// ===== progression helpers =====
function isLevelUnlocked(id) {
  if (debugUnlockAll) return true;
  const idx = LEVELS.findIndex((l) => l.id === id);
  if (idx <= 0) return true;
  const prev = LEVELS[idx - 1];
  return !!(save.levels[prev.id] && save.levels[prev.id].cleared);
}

// 星级规则随难度变：低难度前 3 名都算满星，中难度冠亚季 = 3/2/1，
// 高难度只有冠军拿 3 星、亚军 1 星、季军以下不给星。
const STAR_TABLE = {
  easy: [0, 3, 3, 3, 0, 0, 0],
  normal: [0, 3, 2, 1, 0, 0, 0],
  hard: [0, 3, 1, 0, 0, 0, 0],
};

function starsFor(place) {
  const table = STAR_TABLE[save.difficulty] || STAR_TABLE.normal;
  return table[place] || 0;
}

function coinMul() {
  return difficultyOf(save.difficulty).coinMul || 1;
}

function levelRecord(id) {
  return save.levels[id] || null;
}

function selectInitialLevel() {
  const q = params.get('level');
  if (q && LEVEL_BY_ID[q] && isLevelUnlocked(q)) return q;
  if (save.lastLevel && LEVEL_BY_ID[save.lastLevel] && isLevelUnlocked(save.lastLevel)) return save.lastLevel;
  return LEVELS[0].id;
}

let selectedId = selectInitialLevel();
let currentLevel = LEVEL_BY_ID[selectedId] || LEVELS[0];
let currentSpec = levelSpec(currentLevel);
let raceLaps = currentLevel.laps;
let mode = 'campaign';
let nextLevelId = null;
let unlockNotice = '';
let resultNextId = null;

const endless = {
  stage: 1,
  seed: 1,
  runCoins: 0,
  lastPlace: 0,
  pendingFail: false,
  finishedRun: false,
  clearedStage: 0,
};

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

function applyTheme(theme) {
  scene.fog.color.setHex(theme.fog);
  scene.fog.near = theme.fogNear;
  scene.fog.far = Math.min(theme.fogFar, QUALITY[qualityName].fog);
  hemi.color.setHex(theme.hemiSky);
  hemi.groundColor.setHex(theme.hemiGround);
  hemi.intensity = theme.hemiIntensity;
  sun.color.setHex(theme.sunLight);
  sun.intensity = theme.sunIntensity;
  fill.color.setHex(theme.accent2);
  fill.intensity = theme.id === 'neon' ? 0.36 : 0.55;
  renderer.toneMappingExposure = theme.exposure;
  scene.environmentIntensity = theme.envIntensity;
}

let track = createTrack(scene, textures, { shadows: QUALITY[qualityName].shadows }, currentSpec);
applyTheme(currentSpec.theme);

const hud = new HUD(track);
const input = new Input();
const audio = new RaceAudio();
audio.setEnabled(!muted);

const addPool = new ParticlePool(scene, textures.glow, { max: 900, blending: THREE.AdditiveBlending });
const dustPool = new ParticlePool(scene, textures.smoke, { max: 380, blending: THREE.NormalBlending });
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
  stun: 0,
  stunSpin: 0,
  shieldTime: 0,
};

const ais = [];
const AI_GRID = [[-5, 2.4], [-5, -2.4], [-10, 2.4], [-10, -2.4], [-15, 2.4]];
const AI_BASE_LANES = [-3.9, -1.95, 0, 1.95, 3.9];
AI_GRID.forEach(([d, lane], i) => {
  const kart = createKart(AI_COLORS[i], { detail: true, flameTex: textures.flame });
  kart.group.rotation.order = 'YXZ';
  scene.add(kart.group);
  ais.push({
    kart,
    colors: AI_COLORS[i],
    dist: d,
    lane,
    baseLane: AI_BASE_LANES[i],
    speed: 0,
    base: 45.2 + Math.random() * 2.8,
    phase: Math.random() * Math.PI * 2,
    reaction: 0.12 + Math.random() * 0.4,
    finished: false,
    finishTime: 0,
    steerVisual: 0,
    stun: 0,
    stunSpin: 0,
    lastFrame: null,
  });
});

// ===== items =====
const items = new ItemSystem({
  scene, textures, player, ais, track, addPool, dustPool, audio, hud,
  fx: {
    shake: (n) => { cameraShake = Math.max(cameraShake, n); },
    hitstop: (t) => { hitstop = Math.max(hitstop, t); },
    flash: () => {},
  },
});

// ===== garage / difficulty =====
const garage = new Garage({
  save,
  onSetDifficulty: (id) => setDifficulty(id),
  onUpgrade: (partId) => buyUpgrade(partId),
  onChange: () => {
    updateSelectedLabel();
    applyLoadout();
  },
});

function setDifficulty(id) {
  const next = difficultyOf(id);
  if (save.difficulty === next.id) return;
  save.difficulty = next.id;
  saveGame();
  applyLoadout();
  garage.render();
  audio.ensure();
  audio.ui();
  hud.itemToast({ name: `难度 · ${next.name}（${next.en}）`, color: '#9ff4ff' });
  if (state === 'menu') updateSelectedLabel();
}

function buyUpgrade(partId) {
  const part = PARTS.find((p) => p.id === partId);
  if (!part) return false;
  const lv = save.tuning[partId] || 0;
  if (lv >= MAX_LEVEL) return false;
  const cost = upgradeCost(partId, lv);
  if ((save.coins || 0) < cost) {
    audio.ensure();
    hud.itemToast({ name: `金币不足 · 还需 ${cost - (save.coins || 0)}`, color: '#ff8a6a' });
    return false;
  }
  save.coins -= cost;
  save.tuning[partId] = lv + 1;
  saveGame();
  applyLoadout();
  garage.render();
  audio.ensure();
  audio.boost(2);
  hud.itemToast({ name: `${part.name} 升级到 Lv.${lv + 1}`, color: part.color });
  return true;
}

// ===== race state =====
let state = 'menu';
let paused = false;
let raceMs = 0;
let countdownTime = 0;
let countdownShown = -1;
let perfectStart = false;
let goTimer = 0;
let finishTimer = 0;
let finishTimeMs = 0;
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
let stageClearTimer = 0;
let warpTimer = 0;

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();

function setKartTransform(kart, frame, pos, heading) {
  kart.group.position.copy(pos);
  kart.group.rotation.y = heading;
  kart.group.rotation.x = -Math.asin(clamp(frame.tangent.y, -0.35, 0.35)) * 0.7;
  kart.group.updateMatrixWorld(true);
}

function tuneAI(spec) {
  const laneLimit = Math.max(2.6, spec.half - 3.1);
  const diff = difficultyOf(save.difficulty);
  const spread = diff.aiSpread ?? 0.32;
  ais.forEach((ai, i) => {
    ai.base = (spec.aiBase + 0.4 + i * spread + (spec.endless ? (i % 2) * 0.25 : 0)) * diff.aiMul;
    ai.baseLane = clamp(AI_BASE_LANES[i], -laneLimit, laneLimit);
    ai.reaction = 0.12 + Math.random() * 0.34;
    ai.finished = false;
    ai.finishTime = 0;
    ai.stun = 0;
    ai.stunSpin = 0;
    ai.speed = 0;
  });
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
  player.stun = 0;
  player.stunSpin = 0;
  player.shieldTime = 0;
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
    ai.stun = 0;
    ai.stunSpin = 0;
    const pos = f.p.clone().addScaledVector(f.right, lane);
    pos.y = f.p.y;
    setKartTransform(ai.kart, f, pos, Math.atan2(f.tangent.x, f.tangent.z));
    ai.lastFrame = f;
  });
}

function setState(next) {
  state = next;
  const racing = next === 'countdown' || next === 'race' || next === 'finish'
    || next === 'result' || next === 'paused' || next === 'stageclear' || next === 'warp';
  document.body.classList.toggle('in-race', racing);
}

function resetEffects() {
  addPool.clear();
  dustPool.clear();
  skids.clear();
  sparkAcc = smokeAcc = dustAcc = flameAcc = skidAcc = 0;
  camSnap = true;
  cameraShake = 0;
  cameraRoll = 0;
  camMicro = 0;
}

function buildTrack(spec) {
  if (track) track.dispose();
  currentSpec = spec;
  track = createTrack(scene, textures, { shadows: QUALITY[qualityName].shadows }, spec);
  applyTheme(spec.theme);
  hud.setTrack(track);
  items.setTrack(track);
  addPool.clear();
  dustPool.clear();
  skids.clear();
}

function resetStageState({ keepStats = false } = {}) {
  placeAll();
  resetEffects();
  hud.reset();
  track.setStartLights(0, false);
  track.resetItemBoxes();
  items.reset(keepStats);
  input.reset();
  hud.setItem(null);
  countdownTime = 0;
  countdownShown = -1;
  perfectStart = false;
  goTimer = 0;
  finishTimer = 0;
  resultShown = false;
  paused = false;
  stageClearTimer = 0;
  warpTimer = 0;
  hitstop = 0;
  cameraShake = 0;
  camMicro = 0;
}

function beginRace({ mode: nextMode = 'campaign', levelId = selectedId, endlessStage = 1, seed = null } = {}) {
  document.getElementById('title-screen').classList.remove('help-open');
  audio.ensure();
  audio.ui();
  audio.startMusic();
  audio.setEngineActive(true);
  paused = false;
  unlockNotice = '';
  nextLevelId = null;
  resultNextId = null;
  endless.finishedRun = false;
  endless.pendingFail = false;
  endless.clearedStage = 0;

  if (nextMode === 'endless') {
    mode = 'endless';
    endless.stage = endlessStage;
    endless.seed = seed ?? ((Date.now() ^ (Math.floor(Math.random() * 0x7fffffff))) >>> 0);
    endless.runCoins = 0;
    endless.lastPlace = 0;
    const spec = makeEndlessSpec(endless.stage, endless.seed);
    raceLaps = spec.laps;
    buildTrack(spec);
    tuneAI(spec);
    hud.setMode({ mode, stage: endless.stage, name: spec.name, en: spec.en, laps: raceLaps });
    syncLoadoutHud();
  } else {
    mode = 'campaign';
    const def = LEVEL_BY_ID[levelId] || currentLevel;
    currentLevel = def;
    selectedId = def.id;
    save.lastLevel = def.id;
    saveGame();
    raceLaps = def.laps;
    const spec = levelSpec(def);
    buildTrack(spec);
    tuneAI(spec);
    hud.setMode({ mode, stage: 1, name: spec.name, en: spec.en, laps: raceLaps });
    syncLoadoutHud();
  }

  resetStageState({ keepStats: false });
  raceMs = 0;
  finishTimeMs = 0;
  player.lapStart = 0;
  hud.showHUD(true);
  hud.showTitle(false);
  hud.hideResult();
  selectScreen.hide();
  hud.setStartTip(true);
  setState('countdown');
  track.setStartLights(0, false);
  updateSelectedLabel();
}

function startRace() {
  beginRace({ mode: 'campaign', levelId: selectedId });
}

function startLevel(id, force = false) {
  if (!LEVEL_BY_ID[id]) return false;
  if (!force && !isLevelUnlocked(id)) return false;
  selectedId = id;
  save.lastLevel = id;
  saveGame();
  beginRace({ mode: 'campaign', levelId: id });
  return true;
}

function startEndless() {
  beginRace({ mode: 'endless', stage: 1 });
}

function goMenu() {
  document.getElementById('title-screen').classList.remove('help-open');
  paused = false;
  resetEffects();
  items.reset();
  if (track) track.resetItemBoxes();
  placeAll();
  hud.hideResult();
  hud.showPause(false);
  hud.showHUD(false);
  hud.showTitle(true);
  hud.setCountdown('');
  selectScreen.hide();
  updateSelectedLabel();
  setState('menu');
  introTime = 0;
  audio.setEngineActive(false);
}

function goRace() {
  setState('race');
  raceMs = 0;
  player.lapStart = 0;
  goTimer = 0.85;
  track.setStartLights(0, true);
  audio.countdown(0);
  if (perfectStart) {
    player.boostTime = 1.5 * mods.tuning.boostMul;
    player.speed = 18 * mods.tuning.start;
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

function spawnConfetti() {
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

// ===== campaign finish =====
function finishRace() {
  if (player.finished) return;
  player.finished = true;
  finishPlace = rankOfPlayer();
  player.place = finishPlace;
  finishTimeMs = raceMs;
  const idx = LEVELS.findIndex((l) => l.id === currentLevel.id);
  const rec = save.levels[currentLevel.id] || (save.levels[currentLevel.id] = {});
  const prevBest = rec.bestTime || 0;
  finishNewBest = !prevBest || raceMs < prevBest;
  finishCoins = Math.round(((currentLevel.coinBase || 120) + (PLACE_BONUS[finishPlace] || 60)) * coinMul());
  const nextDef = LEVELS[idx + 1] || null;
  const nextWasUnlocked = nextDef ? !!(save.levels[nextDef.id] && save.levels[nextDef.id].cleared) : false;
  rec.cleared = true;
  rec.place = rec.place ? Math.min(rec.place, finishPlace) : finishPlace;
  rec.stars = Math.max(rec.stars || 0, starsFor(finishPlace));
  if (finishNewBest) rec.bestTime = raceMs;
  if (player.bestLap && (!rec.bestLap || player.bestLap < rec.bestLap)) rec.bestLap = player.bestLap;
  nextLevelId = nextDef ? nextDef.id : null;
  resultNextId = nextLevelId && isLevelUnlocked(nextLevelId) ? nextLevelId : null;
  if (nextDef && !nextWasUnlocked) {
    unlockNotice = nextDef.name;
    selectedId = nextDef.id;
    save.lastLevel = nextDef.id;
  }
  save.coins += finishCoins;
  save.races += 1;
  if (player.bestLap && (!save.bestLap || player.bestLap < save.bestLap)) save.bestLap = player.bestLap;
  if (!save.bestTime || raceMs < save.bestTime) save.bestTime = raceMs;
  saveGame();
  finishTimer = 0;
  setState('finish');
  hud.showCallout('FINISH', `第 ${finishPlace} 名 · +${finishCoins} 金币`, 'finish');
  hud.setStartTip(false);
  audio.finish();
  audio.duck(0.3, 1.6);
  hud.flashBoost('finish');
  spawnConfetti();
  updateSelectedLabel();
}

// ===== endless flow =====
function endEndlessStage() {
  if (endless.finishedRun) return;
  player.finished = true;
  const place = rankOfPlayer();
  player.place = place;
  endless.lastPlace = place;
  const stage = endless.stage;
  finishTimeMs = raceMs;
  const stageCoins = Math.round(((currentSpec.coinBase || 90) + stage * 8 + (place === 1 ? 120 : place === 2 ? 80 : place === 3 ? 50 : 20)) * coinMul());
  endless.clearedStage = Math.max(endless.clearedStage, stage);
  endless.runCoins += stageCoins;
  save.coins += stageCoins;
  save.endless.bestStage = Math.max(save.endless.bestStage || 0, stage);
  save.endless.coins = (save.endless.coins || 0) + stageCoins;
  saveGame();
  finishPlace = place;
  finishCoins = endless.runCoins;
  endless.pendingFail = place > 4;
  audio.stageClear?.();
  audio.duck(0.35, 1.4);
  audio.setEngineActive(false);
  if (endless.pendingFail) {
    hud.showCallout('挑战结束', `第 ${place} 名 · 未能晋级`, 'finish');
  } else {
    hud.showCallout(`STAGE ${stage}`, `CLEAR · +${stageCoins} 金币`, 'finish');
  }
  hud.flashBoost('finish');
  spawnConfetti();
  setState('stageclear');
  stageClearTimer = 0;
}

function finishEndlessRun() {
  if (endless.finishedRun) return;
  endless.finishedRun = true;
  player.finished = true;
  finishTimeMs = raceMs;
  finishPlace = endless.pendingFail ? endless.lastPlace : rankOfPlayer();
  finishCoins = endless.runCoins;
  const bestBefore = save.endless.bestStage || 0;
  const clearedStage = endless.clearedStage || 0;
  finishNewBest = clearedStage > bestBefore;
  save.endless.bestStage = Math.max(bestBefore, clearedStage);
  save.endless.runs = (save.endless.runs || 0) + 1;
  save.races += 1;
  saveGame();
  finishTimer = 0;
  resultNextId = null;
  setState('finish');
  hud.showCallout('挑战结束', `STAGE ${endless.stage} · 累计 +${finishCoins} 金币`, 'finish');
  hud.setStartTip(false);
  audio.finish();
  audio.setEngineActive(false);
  hud.flashBoost('finish');
  spawnConfetti();
  updateSelectedLabel();
}

function advanceEndlessStage() {
  endless.stage += 1;
  const spec = makeEndlessSpec(endless.stage, endless.seed);
  raceLaps = spec.laps;
  buildTrack(spec);
  tuneAI(spec);
  resetStageState({ keepStats: true });
  player.lapStart = raceMs;
  hud.setMode({ mode: 'endless', stage: endless.stage, name: spec.name, en: spec.en, laps: raceLaps });
  hud.setStartTip(false);
  hud.setCountdown('');
  hud.showCallout(`STAGE ${endless.stage}`, spec.name, 'lap');
  audio.stageStart?.();
  setState('warp');
  warpTimer = 0;
  introTime = 0;
  camSnap = true;
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
  if (player.laps > 0) {
    // record every completed lap, including the final one that ends the race
    const lapTime = raceMs - player.lapStart;
    if (lapTime > 0) {
      player.lapTimes.push(lapTime);
      if (!player.bestLap || lapTime < player.bestLap) player.bestLap = lapTime;
    }
    player.lapStart = raceMs;
    audio.lap();
  } else {
    player.lapStart = raceMs;
  }
  if (player.laps >= 0 && player.laps < raceLaps) {
    if (player.laps === raceLaps - 1) {
      hud.showCallout('最后一圈', 'FINAL LAP', 'lap');
    } else if (player.laps > 0) {
      hud.showCallout(`第 ${player.laps + 1} 圈`, `${raceLaps - player.laps} LAPS TO GO`, 'lap');
    }
  }
  if (player.laps >= raceLaps) {
    if (mode === 'endless') endEndlessStage();
    else finishRace();
  }
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
  const nitroGain = mods.difficulty.nitroGain * mods.tuning.nitroMul;
  player.nitro = Math.min(3, player.nitro + (0.13 + charge * 0.32) * nitroGain);
  if (level > 0) {
    player.driftBoosts += 1;
    player.boostTime = Math.max(player.boostTime, [0, 0.55, 0.85, 1.15][level] * mods.tuning.boostMul);
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
  player.boostTime = Math.max(player.boostTime, 0.55 * mods.tuning.boostMul);
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

function pickupItemBoxes() {
  if (player.finished || items.held) return;
  for (const box of track.itemBoxes) {
    if (!box.active) continue;
    const dx = player.pos.x - box.center.x;
    const dz = player.pos.z - box.center.z;
    if (dx * dx + dz * dz < 2.8 * 2.8) {
      const item = items.pickup();
      if (item) {
        box.active = false;
        box.cooldown = 3.4;
        addPool.burst(box.center.clone(), 24, {
          speed: 6, spread: 1.2, up: 0.9, life: 0.5, size: 0.34,
          color: 0x5ef0ff, colorEnd: 0xffd23f, gravity: 2, drag: 1.8,
        });
        hud.flashBoost('pad');
        audio.pad();
      }
      break;
    }
  }
}

function updatePlayer(dt) {
  const driftPress = input.consumeDriftPress();
  const stunned = player.stun > 0;

  if (!stunned && driftPress && player.doubleWindow > 0) {
    doDoubleBoost();
  }
  if (player.doubleWindow > 0) player.doubleWindow -= dt;
  if (player.nitroActive > 0) player.nitroActive -= dt;
  if (player.boostTime > 0) player.boostTime -= dt;
  if (player.collisionCooldown > 0) player.collisionCooldown -= dt;
  if (player.wallHit > 0) player.wallHit -= dt;

  const steer = stunned ? 0 : input.steer;
  player.steer = steer;
  const tune = mods.tuning;
  const speedNorm = clamp(player.speed / mods.baseMax, 0, 1.35);

  if (stunned) {
    input.consumeNitro();
    player.heading += dt * 6;
    player.moveYaw += wrapAngle(player.heading - player.moveYaw) * Math.min(1, dt * 4.5);
    player.drifting = false;
    player.driftCharge = 0;
    player.driftLevel = 0;
    player.doubleWindow = 0;
  } else {
    if (!player.drifting && input.drift && player.speed > 11 && Math.abs(steer) > 0.22 && !player.offroad) {
      startDrift();
    }
    if (player.drifting && (!input.drift || player.speed < 7.5)) {
      releaseDrift();
    }
  }

  let turn = 0;
  if (!stunned) {
    const speedFactor = clamp(player.speed / 14, 0, 1);
    const highSpeedDamp = 1 - 0.24 * clamp(player.speed / 64, 0, 1);
    if (player.drifting) {
      player.driftCharge = Math.min(1,
        player.driftCharge + dt * (0.46 + Math.abs(steer) * 0.42) * (0.72 + speedNorm * 0.5) * tune.drift);
      const prevLevel = player.driftLevel;
      player.driftLevel = player.driftCharge >= 0.9 ? 3 : player.driftCharge >= 0.6 ? 2 : player.driftCharge >= 0.28 ? 1 : 0;
      if (player.driftLevel > prevLevel && player.driftLevel > 0) {
        audio.driftTick(player.driftLevel);
        camMicro = Math.max(camMicro, 0.18 + player.driftLevel * 0.05);
      }
      turn = (steer * 1.02 + player.driftDir * 0.16) * speedFactor * highSpeedDamp * tune.turn;
      player.speed -= 0.7 * dt;
    } else {
      turn = steer * 1.5 * speedFactor * highSpeedDamp * tune.turn;
    }
    if (player.braking) turn *= 1.18;
    player.heading += turn * dt;
  }

  const diff = wrapAngle(player.heading - player.moveYaw);
  const grip = (player.drifting ? 3.2 : (stunned ? 2.4 : 12)) * (player.drifting ? tune.grip : 1);
  player.moveYaw += diff * Math.min(1, grip * dt);

  if (!stunned && input.consumeNitro()) {
    if (player.nitro >= 1 && player.nitroActive <= 0) {
      player.nitro -= 1;
      player.nitroActive = 1.9 * mods.tuning.nitroMul;
      player.nitroUses += 1;
      player.speed += 9;
      hud.showCallout('氮气加速', 'NITRO BOOST', 'nitro');
      hud.flashBoost('nitro');
      audio.nitro();
      spawnBoostBurst(1.8);
      cameraShake = Math.max(cameraShake, 0.35);
    }
  }

  player.braking = !stunned && input.brake && !player.finished;
  let cap = mods.baseMax;
  if (player.boostTime > 0) cap = mods.boostMax;
  if (player.nitroActive > 0) cap = mods.nitroMax;
  if (player.offroad) cap *= 0.64;
  if (player.braking) cap = 0;
  if (player.finished) cap = 0;
  if (stunned) cap = Math.min(cap, 9);
  const accelRate = ((player.boostTime > 0 || player.nitroActive > 0) ? 2.4 : 1.02) * tune.accel;
  if (player.speed < cap) {
    player.speed += (cap - player.speed) * Math.min(1, accelRate * dt);
  } else {
    player.speed += (cap - player.speed) * Math.min(1, 1.7 * dt);
  }
  if (player.braking) player.speed -= 27 * dt;
  if (player.speed < 0) player.speed = 0;

  player.pos.x += Math.sin(player.moveYaw) * player.speed * dt;
  player.pos.z += Math.cos(player.moveYaw) * player.speed * dt;

  const near = track.nearest(player.pos, player.prevIndex);
  player.offroad = Math.abs(near.offset) > track.half + 0.15;
  const wallLimit = track.half + 0.7;
  if (Math.abs(near.offset) > wallLimit) {
    const sign = Math.sign(near.offset);
    const correction = near.offset - sign * wallLimit;
    player.pos.x -= near.right.x * correction;
    player.pos.z -= near.right.z * correction;
    const tangentYaw = Math.atan2(near.tangent.x, near.tangent.z);
    player.moveYaw += wrapAngle(tangentYaw - player.moveYaw) * Math.min(1, dt * 10);
    player.heading += wrapAngle(tangentYaw - player.heading) * Math.min(1, dt * 6);
    if (player.wallHit <= 0) {
      const impact = clamp(player.speed / mods.baseMax, 0.2, 1);
      player.wallHit = 0.45;
      player.speed *= tune.wallKeep;
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
  } else if (Math.abs(near.offset) > track.half + 5) {
    const sign = Math.sign(near.offset);
    player.pos.copy(near.point).addScaledVector(near.right, sign * track.half);
    const tangentYaw = Math.atan2(near.tangent.x, near.tangent.z);
    player.heading = tangentYaw;
    player.moveYaw = tangentYaw;
    player.speed *= 0.3;
    player.drifting = false;
    player.driftCharge = 0;
    player.driftLevel = 0;
  }
  player.pos.y = near.y;
  player.offroad = Math.abs(near.offset) > track.half + 0.15;

  const N = track.N;
  if (player.prevIndex >= 0) {
    if (player.prevIndex > N * 0.78 && near.index < N * 0.22) {
      onLapCross();
    } else if (player.prevIndex < N * 0.22 && near.index > N * 0.78) {
      player.laps = Math.max(-1, player.laps - 1);
    }
  }
  player.prevIndex = near.index;
  player.progress = player.laps * track.length + near.u * track.length;

  const frame = track.frameAt(near.u);
  setKartTransform(player.kart, frame, player.pos, player.heading);

  for (const pad of track.boostPads) {
    if (pad.cooldown > 0) continue;
    const dx = player.pos.x - pad.center.x;
    const dz = player.pos.z - pad.center.z;
    if (dx * dx + dz * dz < 3.6 * 3.6) {
      pad.cooldown = 1.0;
      player.nitro = Math.min(3, player.nitro + 0.42 * mods.difficulty.nitroGain);
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

  pickupItemBoxes();

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

  {
    const post = track.nearest(player.pos, player.prevIndex);
    const limit = track.half + 0.7;
    if (Math.abs(post.offset) > limit) {
      const sign = Math.sign(post.offset);
      const excess = post.offset - sign * limit;
      player.pos.x -= post.right.x * excess;
      player.pos.z -= post.right.z * excess;
      player.pos.y = post.y;
      player.prevIndex = post.index;
      setKartTransform(player.kart, track.frameAt(post.u), player.pos, player.heading);
    }
  }

  player.kart.group.updateMatrixWorld(true);
  emitPlayerEffects(dt, near);

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
  const diff = mods.difficulty;
  const rush = diff.rush ?? 0.13;
  ais.forEach((ai) => {
    const stunned = (ai.stun || 0) > 0;
    const u = ((ai.dist / L) % 1 + 1) % 1;
    const f = track.frameAt(u);
    const ahead1 = track.frameAt(u + 0.012).tangent;
    const ahead2 = track.frameAt(u + 0.042).tangent;
    const bend = Math.acos(clamp(ahead1.dot(ahead2), -1, 1));
    const corner = clamp(1 - bend * 2.7, 0.62, 1);

    let target;
    if (ai.finished) {
      target = 13;
    } else if (stunned) {
      target = 7;
    } else if (elapsed < ai.reaction) {
      target = 0;
    } else {
      target = ai.base * corner;
      const gap = player.progress - ai.dist;
      target *= 1 + clamp(gap / 320, -0.055, rush);
      if (ai.speed < 3) target = Math.max(target, 22);
    }
    const rate = target > ai.speed ? (stunned ? 2.6 : 1.25) : 2.1;
    ai.speed += (target - ai.speed) * Math.min(1, rate * dt);
    ai.dist += ai.speed * dt;

    if (!ai.finished && ai.dist >= L * raceLaps) {
      ai.finished = true;
      ai.finishTime = raceMs;
    }

    const u2 = ((ai.dist / L) % 1 + 1) % 1;
    const fr = track.frameAt(u2);
    const laneTarget = ai.baseLane + Math.sin(ai.dist * 0.02 + ai.phase) * 0.65;
    ai.lane += (laneTarget - ai.lane) * Math.min(1, dt * 2.2);
    const pos = fr.p.clone().addScaledVector(fr.right, ai.lane);
    pos.y = fr.p.y;
    const spin = stunned ? (ai.stunSpin || 0) : 0;
    const heading = Math.atan2(fr.tangent.x, fr.tangent.z) + spin;
    setKartTransform(ai.kart, fr, pos, heading);

    const cornerSteer = clamp(-bend * 8, -0.9, 0.9) * (ahead1.x * fr.tangent.z - ahead1.z * fr.tangent.x > 0 ? 1 : -1);
    ai.steerVisual += (cornerSteer - ai.steerVisual) * Math.min(1, dt * 4);
    animateKart(ai.kart, dt, {
      speedNorm: ai.speed / mods.baseMax,
      steer: ai.steerVisual,
      drifting: !stunned && corner < 0.78 && ai.speed > 20,
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
  const speedNorm = clamp(player.speed / mods.baseMax, 0, 1.3);
  const portrait = camera.aspect < 0.85;
  const fwd = tmpV.set(Math.sin(player.heading), 0, Math.cos(player.heading));
  // Faster spring at speed: keeps the kart readable instead of letting the
  // camera trail a dozen metres behind at nitro / high speed.
  const back = 5.6 + speedNorm * 0.7 + (player.nitroActive > 0 ? 0.9 : 0) + (portrait ? 1.8 : 0);
  const height = 2.16 + speedNorm * 0.4 + (portrait ? 0.3 : 0);
  const right = tmpV2.set(fwd.z, 0, -fwd.x);
  const desired = tmpV3.copy(player.pos)
    .addScaledVector(fwd, -back)
    .addScaledVector(right, -player.steer * 0.52)
    .add(new THREE.Vector3(0, height, 0));

  const followRate = 5.6 + speedNorm * 9;
  const lerp = camSnap ? 1 : 1 - Math.exp(-dt * followRate);
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
  const rollTarget = player.drifting
    ? player.driftDir * 0.05
    : player.steer * 0.022 * clamp(player.speed / mods.baseMax, 0, 1);
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

function updateWarpCamera(dt) {
  introTime += dt;
  const center = player.pos;
  const t = introTime * 0.7;
  const desired = new THREE.Vector3(
    center.x + Math.sin(t) * 9.5,
    center.y + 3.8,
    center.z + Math.cos(t) * 9.5
  );
  camera.position.lerp(desired, 1 - Math.exp(-dt * 3.2));
  camera.lookAt(center.x, center.y + 0.95, center.z);
  if (Math.abs(camera.fov - 55) > 0.05) {
    camera.fov += (55 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
}

// ===== HUD payload =====
function pushHud(dt, rank = player.place) {
  hud.update(dt, {
    speedKmh: player.speed * KMH,
    rank,
    lap: clamp(player.laps + 1, 1, raceLaps),
    raceMs,
    nitro: player.nitro,
    drifting: player.drifting,
    driftCharge: player.driftCharge,
    driftLevel: player.driftLevel,
    offroad: player.offroad,
    nitroActive: player.nitroActive > 0,
    dt,
    playerYaw: player.heading,
    mode,
    stage: endless.stage,
    difficulty: save.difficulty,
    baseMax: mods.baseMax,
    tuneTotal: mods.tuning.total,
    shield: player.shieldTime || 0,
    stunned: (player.stun || 0) > 0,
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
}

// ===== frame updates =====
function updateCountdown(dt) {
  countdownTime += dt;
  const idx = Math.floor(countdownTime);
  if (idx !== countdownShown && idx < 3) {
    countdownShown = idx;
    hud.setCountdown(String(3 - idx));
    audio.countdown(3 - idx);
    track.setStartLights(idx + 1, false);
  }
  if (input.consumeStartPress() && countdownTime >= PERFECT_WINDOW[0] && countdownTime <= PERFECT_WINDOW[1]) {
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
  if (input.consumeItem()) {
    if (player.stun > 0) {
      hud.itemToast({ name: '被击中，无法使用道具', color: '#ff8a6a' });
    } else if (items.held) {
      items.use();
    } else {
      hud.itemToast({ name: '没有道具 · 穿过问号箱拾取', color: '#8fa9c4' });
    }
  }
  items.update(dt);
  updatePlayer(dt);
  updateAI(dt);
  updateRank();
  player.kart.group.updateMatrixWorld(true);
  animateKart(player.kart, dt, {
    speedNorm: player.speed / mods.baseMax,
    steer: player.steer,
    drifting: player.drifting,
    driftDir: player.driftDir,
    flameLevel: (player.nitroActive > 0 ? 3 : 0) + (player.boostTime > 0 ? 1.4 : 0) + 0.45,
    nitro: player.nitroActive > 0,
    accel: player.speed < (player.boostTime > 0 ? mods.boostMax : mods.baseMax) ? 1 : 0,
    braking: player.braking,
    offroad: player.offroad,
  });
  updateChaseCamera(dt);
  pushHud(dt);

  if (goTimer > 0) {
    goTimer -= dt;
    if (goTimer <= 0) hud.setCountdown('');
  }
}

function updateFinish(dt) {
  player.speed *= Math.max(0, 1 - 1.4 * dt);
  player.pos.x += Math.sin(player.moveYaw) * player.speed * dt;
  player.pos.z += Math.cos(player.moveYaw) * player.speed * dt;
  const near = track.nearest(player.pos, player.prevIndex);
  player.prevIndex = near.index;
  player.pos.y = near.y;
  const frame = track.frameAt(near.u);
  setKartTransform(player.kart, frame, player.pos, player.heading);
  animateKart(player.kart, dt, {
    speedNorm: player.speed / mods.baseMax,
    steer: 0,
    drifting: false,
    flameLevel: player.speed > 3 ? 0.4 : 0.1,
    accel: 0,
    braking: false,
    offroad: false,
  });
  updateAI(dt);
  updateChaseCamera(dt);
  pushHud(dt, finishPlace);
  finishTimer += dt;
  if (finishTimer > 1.9 && !resultShown) {
    resultShown = true;
    setState('result');
    showResultScreen();
  }
}

function showResultScreen() {
  const endlessMode = mode === 'endless';
  const rec = endlessMode ? null : levelRecord(currentLevel.id);
  const levelIndex = endlessMode ? 0 : LEVELS.findIndex((l) => l.id === currentLevel.id) + 1;
  hud.showResult({
    mode,
    place: finishPlace,
    time: finishTimeMs || raceMs,
    best: player.bestLap,
    coins: finishCoins,
    totalCoins: save.coins,
    historyBest: endlessMode ? (save.endless.bestStage || 0) : (rec?.bestTime || 0),
    newBest: finishNewBest,
    doubleBoosts: player.doubleBoosts,
    driftBoosts: player.driftBoosts,
    nitroUses: player.nitroUses,
    itemStats: items.stats,
    levelName: endlessMode ? `无尽赛道 · ${currentSpec.theme.id.toUpperCase()}` : currentLevel.name,
    levelIndex,
    stars: endlessMode ? 0 : starsFor(finishPlace),
    difficulty: difficultyOf(save.difficulty),
    tuneTotal: mods.tuning.total,
    unlocked: endlessMode ? '' : unlockNotice,
    canNext: !endlessMode && !!resultNextId && isLevelUnlocked(resultNextId),
    endless: endlessMode ? { stage: endless.stage, bestStage: save.endless.bestStage } : null,
  });
}

function updateStageClear(dt) {
  player.speed *= Math.max(0, 1 - 1.2 * dt);
  player.pos.x += Math.sin(player.moveYaw) * player.speed * dt;
  player.pos.z += Math.cos(player.moveYaw) * player.speed * dt;
  const near = track.nearest(player.pos, player.prevIndex);
  player.prevIndex = near.index;
  player.pos.y = near.y;
  setKartTransform(player.kart, track.frameAt(near.u), player.pos, player.heading);
  animateKart(player.kart, dt, {
    speedNorm: player.speed / mods.baseMax,
    steer: 0, drifting: false, flameLevel: 0.35, accel: 0,
  });
  updateAI(dt);
  updateChaseCamera(dt);
  pushHud(dt, endless.lastPlace || rankOfPlayer());
  stageClearTimer += dt;
  if (stageClearTimer > 1.35) {
    if (endless.pendingFail) finishEndlessRun();
    else advanceEndlessStage();
  }
}

function updateWarp(dt) {
  warpTimer += dt;
  animateKart(player.kart, dt, {
    speedNorm: 0.02, steer: 0, flameLevel: 0.5, rev: true, accel: 0.3,
  });
  ais.forEach((ai) => {
    animateKart(ai.kart, dt, { speedNorm: 0.02, steer: 0, flameLevel: 0.25, rev: true });
  });
  updateWarpCamera(dt);
  if (warpTimer > 1.35) {
    setState('race');
    camSnap = true;
    goTimer = 1.0;
    audio.setEngineActive(true);
    audio.countdown(0);
    track.setStartLights(0, true);
    hud.setCountdown('GO!', 'go');
    hud.setStartTip(false);
  }
}

function updateMenu(dt) {
  input.update(dt);
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
  saveGame();
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
  saveGame();
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
  scene.fog.far = Math.min(currentSpec.theme.fogFar, q.fog);
  document.querySelectorAll('.quality-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.q === name);
  });
}

function syncLoadoutHud() {
  const diff = difficultyOf(save.difficulty);
  hud.setLoadout({ difficulty: diff.id, name: diff.name, tuneTotal: tuningStats(save.tuning).total });
}

function updateSelectedLabel() {
  const def = LEVEL_BY_ID[selectedId] || LEVELS[0];
  const idx = LEVELS.findIndex((l) => l.id === def.id);
  const diff = difficultyOf(save.difficulty);
  const el = document.getElementById('selected-track');
  if (el) {
    el.innerHTML = `即将出战 · <b>${String(idx + 1).padStart(2, '0')} ${def.name}</b>`
      + `　<span class="sel-diff" data-diff="${diff.id}">难度 ${diff.name}</span>`
      + `　<span class="sel-tune">改装 Lv.${tuningStats(save.tuning).total}</span>`;
  }
  const cleared = LEVELS.filter((l) => save.levels[l.id]?.cleared).length;
  hud.setMenuStats({
    coins: save.coins,
    best: save.bestLap,
    races: save.races,
    cleared,
    total: LEVELS.length,
    endlessBest: save.endless.bestStage || 0,
  });
}

function syncPauseButtons() {
  const btn = document.getElementById('pause-endless-btn');
  if (btn) btn.classList.toggle('hide', !(mode === 'endless' && paused));
}

function togglePause() {
  if (state !== 'race' && state !== 'countdown' && state !== 'finish') return;
  paused = !paused;
  hud.showPause(paused);
  syncPauseButtons();
  audio.setEngineActive(!paused);
  if (!paused) {
    audio.ensure();
    goTimer = Math.max(goTimer, 0.2);
  } else {
    hud.setStartTip(false);
  }
}

function openSelect() {
  if (state !== 'menu') return;
  audio.ensure();
  audio.ui();
  selectScreen.show();
}

function closeSelect() {
  selectScreen.hide();
  if (state === 'menu') hud.showTitle(true);
}

const selectScreen = new SelectScreen({
  isUnlocked: isLevelUnlocked,
  getRecord: (id) => save.levels[id] || null,
  getCoins: () => save.coins,
  getEndlessBest: () => save.endless.bestStage || 0,
  onPick: (id) => {
    if (!isLevelUnlocked(id)) return;
    selectedId = id;
    save.lastLevel = id;
    saveGame();
    beginRace({ mode: 'campaign', levelId: id });
  },
  onEndless: () => {
    beginRace({ mode: 'endless' });
  },
  onBack: () => closeSelect(),
});

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
  audio.ensure();
  audio.ui();
  startRace();
});
document.getElementById('select-btn').addEventListener('click', () => {
  openSelect();
});
document.getElementById('endless-btn').addEventListener('click', () => {
  audio.ensure();
  audio.ui();
  startEndless();
});
document.getElementById('help-btn').addEventListener('click', () => {
  document.getElementById('title-screen').classList.toggle('help-open');
  audio.ensure();
  audio.ui();
});
document.getElementById('again-btn').addEventListener('click', () => {
  audio.ui();
  hud.hideResult();
  if (mode === 'endless') {
    beginRace({ mode: 'endless' });
  } else if (resultNextId && isLevelUnlocked(resultNextId)) {
    selectedId = resultNextId;
    beginRace({ mode: 'campaign', levelId: resultNextId });
  } else {
    beginRace({ mode: 'campaign', levelId: currentLevel.id });
  }
});
document.getElementById('menu-btn').addEventListener('click', () => {
  audio.ui();
  goMenu();
  openSelect();
});
document.getElementById('resume-btn').addEventListener('click', () => {
  audio.ui();
  togglePause();
});
document.getElementById('restart-btn').addEventListener('click', () => {
  audio.ui();
  hud.showPause(false);
  paused = false;
  if (mode === 'endless') beginRace({ mode: 'endless' });
  else beginRace({ mode: 'campaign', levelId: currentLevel.id });
});
document.getElementById('pause-menu-btn').addEventListener('click', () => {
  audio.ui();
  goMenu();
});
document.getElementById('pause-endless-btn').addEventListener('click', () => {
  if (mode !== 'endless') return;
  audio.ui();
  paused = false;
  hud.showPause(false);
  syncPauseButtons();
  finishEndlessRun();
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
applyLoadout();
garage.render();
updateSelectedLabel();
hud.showHUD(false);
hud.showTitle(true);
hud.setMode({ mode: 'campaign', stage: 1, name: currentSpec.name, en: currentSpec.en, laps: raceLaps });
placeAll();
track.setStartLights(0, false);
selectScreen.hide();

// ===== main loop =====
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

  if (garage.isOpen) {
    // Esc / P / M 在工坊里只负责关面板，不会把比赛暂停
    if (input.consumePause() || input.consumeMute()) garage.hide();
  } else if (input.consumeMute()) {
    audio.ensure();
    setMuted(!muted);
  }
  if (!garage.isOpen && input.consumePause()
    && (state === 'race' || state === 'countdown' || state === 'finish')) {
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
    } else if (state === 'stageclear') {
      updateStageClear(dt);
    } else if (state === 'warp') {
      updateWarp(dt);
    }
    track.update(dt, camera);
    addPool.update(dt);
    dustPool.update(dt);
    sun.position.set(player.pos.x + 62, player.pos.y + 98, player.pos.z - 38);
    sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
    sun.target.updateMatrixWorld();
  }

  if (!paused && (state === 'race' || state === 'countdown' || state === 'finish')) {
    audio.update(dt, {
      speed: player.speed / mods.baseMax,
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
  if (frameCount === 2) maybeAutoStart();
}

requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[qualityName].dpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  hud.resize();
});

let autoStarted = false;
function maybeAutoStart() {
  if (autoStarted) return;
  autoStarted = true;
  if (params.get('auto') !== '1') return;
  setTimeout(() => {
    try {
      if (params.get('endless') === '1') startEndless();
      else startRace();
    } catch (e) {}
  }, 300);
}

function tick(dt = 1 / 60, steps = 1) {
  const d = Math.max(0.001, Math.min(0.05, dt));
  for (let i = 0; i < steps; i++) {
    if (paused) break;
    if (state === 'menu') updateMenu(d);
    else if (state === 'countdown') { input.update(d); updateCountdown(d); }
    else if (state === 'race') updateRace(d);
    else if (state === 'finish') updateFinish(d);
    else if (state === 'result') updateResult(d);
    else if (state === 'stageclear') updateStageClear(d);
    else if (state === 'warp') updateWarp(d);
    track.update(d, camera);
    addPool.update(d);
    dustPool.update(d);
  }
  renderer.render(scene, camera);
  return { state, stage: endless.stage, raceMs, speed: player.speed, held: items.held };
}

// ===== testing hooks =====
window.__qq = {
  ready: false,
  get state() { return state; },
  get paused() { return paused; },
  get raceMs() { return raceMs; },
  get quality() { return qualityName; },
  get muted() { return muted; },
  get track() { return track; },
  get items() { return items; },
  get mode() { return mode; },
  get endless() { return endless; },
  get currentLevel() { return currentLevel; },
  get currentSpec() { return currentSpec; },
  get selectedId() { return selectedId; },
  get raceLaps() { return raceLaps; },
  player,
  ais,
  camera,
  renderer,
  scene,
  input,
  audio,
  hud,
  errors,
  save,
  startRace,
  startLevel,
  garage,
  mods,
  get difficulty() { return save.difficulty; },
  setDifficulty,
  buyUpgrade,
  applyLoadout,
  get tuning() { return save.tuning; },
  setCoins(n) { save.coins = Math.max(0, Math.round(n)); saveGame(); garage.render(); updateSelectedLabel(); },
  openGarage() { garage.show(); },
  closeGarage() { garage.hide(); },
  startEndless,
  goMenu,
  openSelect,
  closeSelect,
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
    if (kind === 'item') input.itemQueued = true;
  },
  skipCountdown() {
    if (state === 'countdown') { countdownTime = 3.01; goRace(); }
    if (state === 'warp') { warpTimer = 1.36; }
  },
  tick,
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
  giveItem(id) { return items.give(id); },
  useItem() { return items.use(); },
  forceFinish() {
    if (mode === 'campaign') finishRace();
    else endEndlessStage();
  },
  forceStageClear() {
    if (mode !== 'endless') return false;
    endEndlessStage();
    return true;
  },
  unlockAll() {
    LEVELS.forEach((l) => {
      save.levels[l.id] = { ...(save.levels[l.id] || {}), cleared: true };
    });
    saveGame();
    updateSelectedLabel();
    selectScreen.render();
  },
  getFrame() {
    return {
      state, paused, raceMs, speed: player.speed, nitro: player.nitro, laps: player.laps,
      place: player.place, drift: player.drifting, charge: player.driftCharge,
      mode, stage: endless.stage, item: items.held, shield: player.shieldTime,
      trackId: currentSpec.id, difficulty: save.difficulty,
      baseMax: mods.baseMax, tuneTotal: mods.tuning.total,
    };
  },
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
      ai: ais.map((a) => ({ dist: a.dist, speed: a.speed, lane: a.lane, stun: a.stun || 0 })),
      mode, stage: endless.stage, trackId: currentSpec.id, trackName: currentSpec.name,
      item: items.held, shield: player.shieldTime, stun: player.stun,
      itemStats: { ...items.stats }, mines: items.mines.length, missiles: items.missiles.length,
      raceLaps, selectedId,
    };
  },
};

// First frame is rendered synchronously so `__qq.ready` never depends on rAF
// scheduling (a background window gets throttled, which used to hang the tests).
renderer.render(scene, camera);
window.__qq.ready = true;
maybeAutoStart();
