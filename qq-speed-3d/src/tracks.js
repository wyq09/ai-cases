import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Theme palette + environment recipe
// Every level is a themed closed circuit. Themes own the palette, the props and
// the weather; levels only override the course shape + a few env switches.
// ---------------------------------------------------------------------------

export const THEMES = {
  coast: {
    id: 'coast', sky: 'day',
    skyTop: 0x1b66c8, skyHorizon: 0xd8f3ff, skySun: 0xfff6dc, sunDir: [0.62, 0.4, -0.34],
    fog: 0xcdefff, fogNear: 220, fogFar: 820,
    hemiSky: 0xd9f4ff, hemiGround: 0x4f6f3f, hemiIntensity: 1.45,
    sunLight: 0xfff1d2, sunIntensity: 2.35,
    exposure: 1.04, envIntensity: 0.72,
    fluid: { deep: 0x07558f, shallow: 0x39c8de, horizon: 0xcdefff, y: -2.6 },
    terrain: { kind: 'grass', base: '#5cae57', tones: ['#3f9544', '#86cf6d', '#2e7d3a', '#aee187'], accent: '#a9e884' },
    groundTint: 0xbfe6a0, beach: 0xffe6ad, road: 0xb9c4d4,
    curbA: 0xe8403a, curbB: 0xf5f8ff,
    wallA: 0xff4b3e, wallB: 0xf5f8ff, railA: 0x34e6ff, railB: 0x9ff7ff,
    hillA: 0x3f9164, hillB: 0x2f7c62,
    accent: 0xff6a18, accent2: 0x27dcff,
    itemTint: 0x5ef0ff, light: 0xfff6d0, standsRoof: 0xff6a18,
    cityTint: 0xa9c4e2, cityEmissive: 0.3, billboardGlow: 0.22,
    propLeaf: 0x2fa34f, propTrunk: 0x9a6b3f, crystal: 0x5ef0ff,
    stars: false,
    env: {
      ocean: true, beach: true, ground: 'island', lagoon: true, hills: 'soft',
      prop: 'palm', props: 44, bushes: 60, rocks: 36, city: 'ring',
      lighthouse: true, blimp: true, boats: true, clouds: 18, weather: null,
      stands: true, billboards: true, lightTowers: 8, tyres: 44, fences: true,
      supports: false, islands: false,
    },
  },

  canyon: {
    id: 'canyon', sky: 'sunset',
    skyTop: 0x2c3f7a, skyHorizon: 0xffb066, skySun: 0xfff0c0, sunDir: [0.7, 0.14, -0.42],
    fog: 0xf0b183, fogNear: 170, fogFar: 760,
    hemiSky: 0xffd7a8, hemiGround: 0x6e4227, hemiIntensity: 1.32,
    sunLight: 0xffc07a, sunIntensity: 2.55,
    exposure: 1.02, envIntensity: 0.62,
    fluid: { deep: 0x7c3f23, shallow: 0xd9773d, horizon: 0xffd0a0, y: -2.6 },
    terrain: { kind: 'speckle', base: '#c98f5c', tones: ['#a86b3c', '#e5b87c', '#8d5a34', '#f0cf9a'], accent: '#7c4a26' },
    groundTint: 0xd8a06a, beach: 0xefc98c, road: 0xc9b7a5,
    curbA: 0xe04a2a, curbB: 0xfff1d0,
    wallA: 0xe85b2a, wallB: 0xffe3b0, railA: 0xffb02e, railB: 0xfff0b8,
    hillA: 0x9c5535, hillB: 0x74402a,
    accent: 0xff8a2a, accent2: 0xffd23f,
    itemTint: 0xffc14d, light: 0xffe7b0, standsRoof: 0xe85b2a,
    cityTint: 0xd8b08a, cityEmissive: 0.12, billboardGlow: 0.18,
    propLeaf: 0x6f9c4a, propTrunk: 0x8a5a34, crystal: 0xffb02e,
    stars: false,
    env: {
      ocean: false, beach: false, ground: 'plain', hills: 'mesa',
      prop: 'cactus', props: 38, bushes: 18, rocks: 78, city: false,
      lighthouse: false, blimp: false, boats: false, clouds: 14, weather: null,
      stands: true, billboards: true, lightTowers: 6, tyres: 30, fences: true,
      supports: false, islands: false,
    },
  },

  neon: {
    id: 'neon', sky: 'night',
    skyTop: 0x04061a, skyHorizon: 0x2c1a60, skySun: 0xcfe8ff, sunDir: [-0.32, 0.46, 0.5],
    fog: 0x0b1030, fogNear: 150, fogFar: 640,
    hemiSky: 0x5b6cff, hemiGround: 0x120b24, hemiIntensity: 0.95,
    sunLight: 0xa9c8ff, sunIntensity: 1.2,
    exposure: 1.16, envIntensity: 0.8,
    fluid: { deep: 0x04122c, shallow: 0x1a4a86, horizon: 0x2c1a60, y: -2.6 },
    terrain: { kind: 'speckle', base: '#241f3c', tones: ['#17132b', '#3a2f5e', '#0e0b1e', '#4d3f7a'], accent: '#101828' },
    groundTint: 0x2a2548, beach: 0x3a2f5e, road: 0x8f9ab0,
    curbA: 0xff2f9a, curbB: 0x22e6ff,
    wallA: 0xff2f9a, wallB: 0x22e6ff, railA: 0x22e6ff, railB: 0xff2f9a,
    hillA: 0x2a2548, hillB: 0x1a1730,
    accent: 0xff2f9a, accent2: 0x22e6ff,
    itemTint: 0xff5ecd, light: 0xbff6ff, standsRoof: 0xff2f9a,
    cityTint: 0x7f8fc4, cityEmissive: 1.05, billboardGlow: 0.55,
    propLeaf: 0x3affc8, propTrunk: 0x2a2548, crystal: 0x5ef0ff,
    stars: true,
    env: {
      ocean: false, beach: false, ground: 'plain', hills: false,
      prop: 'none', props: 0, bushes: 0, rocks: 8, city: 'ring',
      lighthouse: false, blimp: true, boats: false, clouds: 6, weather: null,
      stands: true, billboards: true, lightTowers: 10, tyres: 30, fences: true,
      supports: false, islands: false,
    },
  },

  frost: {
    id: 'frost', sky: 'day',
    skyTop: 0x2f74d8, skyHorizon: 0xe6f6ff, skySun: 0xffffff, sunDir: [0.48, 0.34, 0.22],
    fog: 0xdff2ff, fogNear: 190, fogFar: 760,
    hemiSky: 0xeaf7ff, hemiGround: 0x8098b4, hemiIntensity: 1.42,
    sunLight: 0xfff4e0, sunIntensity: 2.15,
    exposure: 1.0, envIntensity: 0.78,
    fluid: { deep: 0x2a6a9e, shallow: 0x8fd8ee, horizon: 0xe8f6ff, y: -2.9 },
    terrain: { kind: 'snow', base: '#e8f2ff', tones: ['#cfe2f6', '#ffffff', '#b9d2ea', '#f6fbff'], accent: '#a9c4e0' },
    groundTint: 0xeaf4ff, beach: 0xd7e8f7, road: 0xb9c6d6,
    curbA: 0x3a9bff, curbB: 0xffffff,
    wallA: 0x3aa0ff, wallB: 0xffffff, railA: 0x9fe8ff, railB: 0xffffff,
    hillA: 0xdfefff, hillB: 0x9db8d4,
    accent: 0x3a9bff, accent2: 0x9fe8ff,
    itemTint: 0x7fe4ff, light: 0xeaf7ff, standsRoof: 0x3a9bff,
    cityTint: 0xbcd8f0, cityEmissive: 0.1, billboardGlow: 0.16,
    propLeaf: 0x1e6e58, propTrunk: 0x5b4530, crystal: 0x9fe8ff,
    stars: false,
    env: {
      ocean: true, beach: false, ground: 'island', hills: 'snow',
      prop: 'pine', props: 58, bushes: 24, rocks: 40, city: false,
      lighthouse: false, blimp: false, boats: false, clouds: 12, weather: 'snow',
      stands: false, billboards: true, lightTowers: 7, tyres: 26, fences: true, iceSpires: 30,
      supports: false, islands: false,
    },
  },

  jungle: {
    id: 'jungle', sky: 'day',
    skyTop: 0x2a7a8c, skyHorizon: 0xd8f5c8, skySun: 0xfff2c8, sunDir: [0.4, 0.48, -0.28],
    fog: 0xc4e8b8, fogNear: 120, fogFar: 560,
    hemiSky: 0xe2f7cf, hemiGround: 0x244a20, hemiIntensity: 1.35,
    sunLight: 0xffeec8, sunIntensity: 2.0,
    exposure: 1.02, envIntensity: 0.6,
    fluid: { deep: 0x0c4a3a, shallow: 0x2aa07a, horizon: 0xcdeec0, y: -2.6 },
    terrain: { kind: 'grass', base: '#3f8238', tones: ['#2f6b2d', '#6fb352', '#1f5222', '#8fce63'], accent: '#a9e884' },
    groundTint: 0x4f8f3f, beach: 0xd9c187, road: 0x8b9a92,
    curbA: 0xffc93c, curbB: 0xf6ffe8,
    wallA: 0xffc93c, wallB: 0x2b5a2b, railA: 0x9dff7a, railB: 0xe8ffd0,
    hillA: 0x2f7a4a, hillB: 0x245c3c,
    accent: 0xffc93c, accent2: 0x6bff9e,
    itemTint: 0x9dff7a, light: 0xfff2c0, standsRoof: 0x2f7a4a,
    cityTint: 0x9fbf94, cityEmissive: 0.1, billboardGlow: 0.2,
    propLeaf: 0x2fa34f, propTrunk: 0x7b5230, crystal: 0x9dff7a,
    stars: false,
    env: {
      ocean: true, beach: true, ground: 'island', lagoon: true, hills: 'soft',
      prop: 'palm', props: 108, propNear: 11, propFar: 42, propScale: 1.16,
      bushes: 160, rocks: 28, city: false,
      lighthouse: false, blimp: false, boats: true, clouds: 10, weather: null,
      stands: false, billboards: true, lightTowers: 6, tyres: 40, fences: true, ruins: 8,
      supports: false, islands: false,
    },
  },

  volcano: {
    id: 'volcano', sky: 'lava',
    skyTop: 0x1a0b1e, skyHorizon: 0xff6a2a, skySun: 0xffb066, sunDir: [0.5, 0.12, -0.6],
    fog: 0x5a2a20, fogNear: 130, fogFar: 560,
    hemiSky: 0xff8a5a, hemiGround: 0x1a0e12, hemiIntensity: 1.05,
    sunLight: 0xff8a50, sunIntensity: 1.95,
    exposure: 1.1, envIntensity: 0.55,
    fluid: { deep: 0x3a0a05, shallow: 0xff5a14, horizon: 0x7a2a10, y: -2.6 },
    terrain: { kind: 'crack', base: '#2e2320', tones: ['#1c1513', '#4a3a34', '#0f0b0a', '#6b4a38'], accent: '#ff5a14' },
    groundTint: 0x2a1c1a, beach: 0x3a2a24, road: 0x8a7a76,
    curbA: 0xff4b1a, curbB: 0xffd23f,
    wallA: 0xff4b1a, wallB: 0xffc93c, railA: 0xffb02e, railB: 0xfff0b8,
    hillA: 0x3a2422, hillB: 0x241416,
    accent: 0xff5a14, accent2: 0xffc93c,
    itemTint: 0xff8a2a, light: 0xffb066, standsRoof: 0xff5a14,
    cityTint: 0x8a6a5a, cityEmissive: 0.2, billboardGlow: 0.3,
    propLeaf: 0xff6a2a, propTrunk: 0x2a1c1a, crystal: 0xff8a2a,
    stars: false,
    env: {
      ocean: true, beach: false, ground: 'island', hills: 'volcano',
      prop: 'crystal', props: 34, bushes: 0, rocks: 70, city: false,
      lighthouse: false, blimp: false, boats: false, clouds: 5, weather: 'ash',
      stands: false, billboards: true, lightTowers: 8, tyres: 34, fences: true,
      supports: false, islands: false, volcano: true,
    },
  },

  sky: {
    id: 'sky', sky: 'day',
    skyTop: 0x1f63c8, skyHorizon: 0xeaf4ff, skySun: 0xfff8e6, sunDir: [0.48, 0.3, -0.3],
    fog: 0xe6f3ff, fogNear: 260, fogFar: 1020,
    hemiSky: 0xeaf6ff, hemiGround: 0x8fb6d8, hemiIntensity: 1.55,
    sunLight: 0xfff6e2, sunIntensity: 2.4,
    exposure: 1.05, envIntensity: 0.9,
    fluid: { deep: 0x7fb6e8, shallow: 0xd9f2ff, horizon: 0xfff1d2, y: -24 },
    terrain: { kind: 'snow', base: '#dfeaf6', tones: ['#c9dcf0', '#f6fbff', '#a9c6e4', '#ffffff'], accent: '#8fb6d8' },
    groundTint: 0xdfeaf6, beach: 0xd9e8f6, road: 0xc9d8e8,
    curbA: 0x2ec8ff, curbB: 0xffffff,
    wallA: 0x36cfff, wallB: 0xffffff, railA: 0xffffff, railB: 0x9ff4ff,
    hillA: 0x8fb6d8, hillB: 0x6d95bb,
    accent: 0x2ec8ff, accent2: 0xffd23f,
    itemTint: 0x7fe4ff, light: 0xfff4d8, standsRoof: 0x2ec8ff,
    cityTint: 0xbcd8f0, cityEmissive: 0.1, billboardGlow: 0.18,
    propLeaf: 0x9fe8ff, propTrunk: 0x7b8fa8, crystal: 0x9ff4ff,
    stars: false,
    env: {
      ocean: false, beach: false, ground: 'cloud', hills: false,
      prop: 'crystal', props: 0, bushes: 0, rocks: 0, city: false,
      lighthouse: false, blimp: true, boats: false, clouds: 24, weather: null,
      stands: false, billboards: false, lightTowers: 0, tyres: 0, fences: true,
      supports: true, islands: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Difficulty: three presets shared by campaign + endless. They scale the AI
// pace, the player's speed caps, how fast nitro / drift charge builds up and
// how much gold a race pays out.
// ---------------------------------------------------------------------------

export const DIFFICULTIES = [
  {
    id: 'easy', name: '低', en: 'EASY', short: 'LOW',
    desc: '对手慢 9% · 你的极速 +8% · 氮气更耐用',
    aiMul: 0.91, aiSpread: 0.2, rush: 0.09, capMul: 1.08, nitroGain: 1.3,
    coinMul: 0.75, mineRate: 0.6,
  },
  {
    id: 'normal', name: '中', en: 'NORMAL', short: 'MID',
    desc: '标准节奏 · 原版手感',
    aiMul: 1, aiSpread: 0.32, rush: 0.13, capMul: 1, nitroGain: 1,
    coinMul: 1, mineRate: 1,
  },
  {
    id: 'hard', name: '高', en: 'HARD', short: 'HIGH',
    desc: '对手快 9% · 你的极速 -3% · 金币 ×1.6',
    aiMul: 1.09, aiSpread: 0.44, rush: 0.19, capMul: 0.97, nitroGain: 0.82,
    coinMul: 1.6, mineRate: 1.35,
  },
];

export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

export function difficultyOf(id) {
  return DIFFICULTY_BY_ID[id] || DIFFICULTY_BY_ID.normal;
}

// ---------------------------------------------------------------------------
// Course shapes
// ---------------------------------------------------------------------------

function ring(entries) {
  return entries.map(([deg, r, y]) => {
    const a = (deg * Math.PI) / 180;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
}

const COAST_POINTS = [
  [0, 0.6, 70], [90, 1.2, 66], [165, 2.2, 45], [200, 3.0, 0],
  [195, 2.4, -60], [160, 1.2, -105], [95, 0.6, -125], [35, 1.0, -115],
  [-20, 2.2, -140], [-85, 3.4, -155], [-150, 2.6, -140], [-205, 1.2, -100],
  [-230, 0.8, -40], [-225, 1.4, 20], [-185, 0.8, 58], [-95, 0.6, 70],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

const CANYON_POINTS = ring([
  [0, 235, 3], [30, 185, 9], [62, 250, 16], [94, 195, 9],
  [126, 268, 22], [158, 205, 13], [190, 178, 5], [222, 252, 17],
  [254, 194, 8], [286, 262, 20], [318, 188, 7], [346, 242, 4],
]);

const NEON_POINTS = ring([
  [0, 168, 2], [26, 196, 4], [52, 172, 3], [78, 202, 6],
  [104, 165, 4], [130, 192, 5], [156, 174, 3], [182, 206, 7],
  [208, 168, 4], [234, 198, 6], [260, 176, 3], [286, 204, 5],
  [312, 170, 4], [338, 194, 2],
]);

const FROST_POINTS = ring([
  [0, 248, 4], [36, 288, 10], [72, 228, 22], [108, 280, 30],
  [144, 240, 24], [180, 292, 14], [216, 232, 20], [252, 276, 28],
  [288, 244, 16], [324, 284, 8],
]);

const JUNGLE_POINTS = ring([
  [0, 200, 3], [28, 232, 8], [56, 208, 14], [84, 242, 8],
  [112, 188, 17], [140, 226, 10], [168, 202, 5], [196, 238, 15],
  [224, 192, 9], [252, 232, 19], [280, 208, 7], [308, 240, 13], [336, 196, 5],
]);

const VOLCANO_POINTS = ring([
  [0, 258, 4], [42, 218, 10], [84, 268, 6], [126, 182, 18],
  [168, 262, 24], [210, 226, 12], [252, 272, 8], [294, 230, 20], [330, 256, 6],
]);

const SKY_POINTS = ring([
  [0, 296, 32], [30, 330, 40], [62, 282, 34], [94, 340, 46],
  [126, 304, 38], [158, 348, 44], [190, 290, 32], [222, 332, 42],
  [254, 300, 36], [286, 344, 48], [318, 286, 34], [348, 318, 40],
]);

// Campaign. `difficulty` drives the stars on the level card, `aiBase` the pace.
export const LEVELS = [
  {
    id: 'coast', name: '极速海岸', en: 'SEASIDE CIRCUIT', desc: '海岸环岛 · 经典起航',
    difficulty: 1, laps: 3, aiBase: 44.9, coinBase: 120, half: 7.5,
    theme: 'coast', points: COAST_POINTS, padCount: 9, boxGroups: 9,
  },
  {
    id: 'canyon', name: '落日峡谷', en: 'SUNSET CANYON', desc: '赤岩峡谷 · 高低起伏',
    difficulty: 2, laps: 3, aiBase: 45.8, coinBase: 160, half: 7.8,
    theme: 'canyon', points: CANYON_POINTS, padCount: 9, boxGroups: 10,
  },
  {
    id: 'neon', name: '霓虹都市', en: 'NEON DISTRICT', desc: '午夜街区 · 连续急弯',
    difficulty: 3, laps: 3, aiBase: 46.5, coinBase: 200, half: 7.0,
    theme: 'neon', points: NEON_POINTS, padCount: 10, boxGroups: 11,
  },
  {
    id: 'frost', name: '霜封雪原', en: 'FROST RIDGE', desc: '雪岭长弯 · 高差冲刺',
    difficulty: 3, laps: 3, aiBase: 46.9, coinBase: 220, half: 8.1,
    theme: 'frost', points: FROST_POINTS, padCount: 9, boxGroups: 10,
  },
  {
    id: 'jungle', name: '雨林秘境', en: 'JUNGLE RUINS', desc: '密林古道 · 连续弯道',
    difficulty: 4, laps: 3, aiBase: 47.5, coinBase: 250, half: 7.2,
    theme: 'jungle', points: JUNGLE_POINTS, padCount: 10, boxGroups: 11,
  },
  {
    id: 'volcano', name: '熔岩火山', en: 'LAVA CALDERA', desc: '火山口 · 宽阔高速',
    difficulty: 4, laps: 3, aiBase: 48.0, coinBase: 280, half: 8.6,
    theme: 'volcano', points: VOLCANO_POINTS, padCount: 9, boxGroups: 10,
  },
  {
    id: 'sky', name: '云端天路', en: 'CLOUD SKYWAY', desc: '海拔 48 米 · 天空浮岛',
    difficulty: 5, laps: 2, aiBase: 48.6, coinBase: 320, half: 8.2,
    theme: 'sky', points: SKY_POINTS, padCount: 8, boxGroups: 9,
  },
];

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

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

function autoPads(seed, count) {
  const rng = mulberry32(seed);
  const lanes = [-2.8, 2.8, 0, -3.0, 3.0, -1.9, 1.9];
  const pads = [];
  for (let i = 0; i < count; i++) {
    const u = (0.05 + (i + 0.5) / count * 0.9 + (rng() - 0.5) * 0.02) % 1;
    pads.push([u, lanes[(i + Math.floor(rng() * lanes.length)) % lanes.length]]);
  }
  return pads;
}

function autoBoxes(seed, groups) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const boxes = [];
  for (let i = 0; i < groups; i++) {
    const u = 0.04 + ((i + 0.35) / groups) * 0.92 + (rng() - 0.5) * 0.012;
    const spread = 2.6 + rng() * 0.8;
    boxes.push([u % 1, -spread], [u % 1, spread]);
  }
  return boxes;
}

function maxRadiusOf(points) {
  let m = 0;
  for (const p of points) m = Math.max(m, Math.hypot(p.x, p.z));
  return m;
}

function buildSpec(def) {
  const theme = THEMES[def.theme];
  const env = { ...theme.env, ...(def.env || {}) };
  const maxR = maxRadiusOf(def.points);
  if (!env.groundRadius) {
    if (env.ground === 'island') env.groundRadius = maxR + 96;
    else if (env.ground === 'plain') env.groundRadius = Math.max(620, (maxR + 220) * 2.1);
    else env.groundRadius = 0;
  }
  return {
    id: def.id,
    name: def.name,
    en: def.en,
    desc: def.desc,
    difficulty: def.difficulty ?? 1,
    laps: def.laps ?? 3,
    aiBase: def.aiBase ?? 45,
    coinBase: def.coinBase ?? 120,
    half: def.half ?? 7.5,
    tension: def.tension ?? 0.42,
    points: def.points,
    theme,
    env,
    maxR,
    stage: def.stage || 0,
    endless: !!def.endless,
    pads: def.pads || autoPads(hashString(def.id), def.padCount || 9),
    itemBoxes: def.itemBoxes || autoBoxes(hashString(def.id), def.boxGroups || 9),
  };
}

const campaignSpecs = new Map();
export function levelSpec(defOrId) {
  const def = typeof defOrId === 'string' ? LEVEL_BY_ID[defOrId] : defOrId;
  if (!def) return campaignSpecs.get(LEVELS[0].id);
  if (!campaignSpecs.has(def.id)) campaignSpecs.set(def.id, buildSpec(def));
  return campaignSpecs.get(def.id);
}

// ---------------------------------------------------------------------------
// Endless procedural circuit: star-shaped random loop (never self-intersects),
// alternating biome each stage, radius and elevation grow with the stage.
// ---------------------------------------------------------------------------

const ENDLESS_CYCLE = ['coast', 'canyon', 'neon', 'frost', 'jungle', 'volcano', 'sky'];

export function endlessThemeFor(stage, seed = 0) {
  const idx = (stage - 1 + (seed % ENDLESS_CYCLE.length)) % ENDLESS_CYCLE.length;
  return ENDLESS_CYCLE[idx];
}

export function makeEndlessSpec(stage, seed = 1) {
  const rng = mulberry32((seed >>> 0) + stage * 104729);
  const themeId = endlessThemeFor(stage, seed);
  const theme = THEMES[themeId];
  const n = 8 + ((stage * 3 + seed) % 7); // 8..14 vertices
  const base = 205 + Math.min(90, stage * 7) + rng() * 35;
  const skyTrack = themeId === 'sky';
  const yBase = skyTrack ? 30 : 4;
  const yAmp = skyTrack ? 10 : 4 + Math.min(10, stage * 0.8);

  const radii = [];
  for (let i = 0; i < n; i++) {
    const ripple =
      0.19 * Math.sin(i * 2.1 + seed * 0.11) +
      0.11 * Math.cos(i * 1.37 + stage * 0.6) +
      (rng() - 0.5) * 0.14;
    radii.push(base * (1 + ripple));
  }
  // one smoothing pass keeps corner curvature drivable
  const smooth = radii.map((r, i) => {
    const p = radii[(i - 1 + n) % n];
    const q = radii[(i + 1) % n];
    return r * 0.7 + p * 0.15 + q * 0.15;
  });

  const startAng = rng() * 360;
  const step = 360 / n;
  const points = [];
  for (let i = 0; i < n; i++) {
    const ang = startAng + i * step + (rng() - 0.5) * step * 0.16;
    const r = smooth[i];
    const y = yBase + Math.sin(i * 1.7 + seed) * yAmp + rng() * 2.6;
    const a = (ang * Math.PI) / 180;
    points.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }

  const spec = buildSpec({
    id: `endless-${stage}`,
    name: `${themeId === 'coast' ? '海岸' : themeId === 'canyon' ? '峡谷' : themeId === 'neon' ? '霓虹' : themeId === 'frost' ? '雪原' : themeId === 'jungle' ? '雨林' : themeId === 'volcano' ? '火山' : '云端'} · 无尽`,
    en: `ENDLESS STAGE ${stage}`,
    desc: theme.id,
    difficulty: Math.min(5, 1 + Math.floor(stage / 2)),
    laps: 2,
    aiBase: Math.min(56, 45 + (stage - 1) * 0.55),
    coinBase: 90 + stage * 25,
    half: 7.6,
    theme: themeId,
    points,
    padCount: 8 + (stage % 3),
    boxGroups: 8 + (stage % 3),
    stage,
    endless: true,
  });
  spec.env.weather = theme.env.weather;
  spec.name = `${spec.name} ${stage}`;
  spec.subtitle = `ENDLESS STAGE ${stage}`;
  return spec;
}

// ---------------------------------------------------------------------------
// Level-card helpers (SVG silhouette, palettes for the UI)
// ---------------------------------------------------------------------------

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function themeCss(theme) {
  return {
    accent: hex(theme.accent),
    accent2: hex(theme.accent2),
    top: hex(theme.skyTop),
    horizon: hex(theme.skyHorizon),
    ground: hex(theme.groundTint),
    road: hex(theme.road),
    fog: hex(theme.fog),
  };
}

export function trackPath(spec, size = 100, pad = 0.1) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of spec.points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const span = Math.max(spanX, spanZ);
  const scale = size * (1 - pad * 2);
  const ox = pad * size + (span - spanX) / span * size * (1 - pad * 2) / 2;
  const oz = pad * size + (span - spanZ) / span * size * (1 - pad * 2) / 2;
  return spec.points
    .map((p) => `${((p.x - minX) / span * scale + ox).toFixed(2)},${((p.z - minZ) / span * scale + oz).toFixed(2)}`)
    .join(' ');
}
