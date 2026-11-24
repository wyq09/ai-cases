import { clamp, smoothstep, fbm2D, mulberry32 } from './math3d.js';

export const WORLD_RADIUS = 220;
export const TERRAIN_EXTENT = 240;

export const BASE_PROPS = {
  lander: { x: 8.2, z: 6.4, rotY: -0.65 },
  flag: { x: 4.5, z: 4.6, rotY: -0.35 },
  solar: { x: 9.6, z: 2.2, rotY: 0.28 },
};

export const CRATERS = [
  // Signature launch crater directly ahead of spawn
  { x: 0, z: 31, radius: 12.0, depth: 2.15, rimHeight: 1.08, centralPeak: 0 },
  // Grand Tycho-style crater
  { x: 58, z: 66, radius: 36.0, depth: 5.0, rimHeight: 1.85, centralPeak: 1.55 },
  // Scenic loop craters
  { x: 34, z: 22, radius: 9.5, depth: 1.4, rimHeight: 0.62, centralPeak: 0 },
  { x: 66, z: 12, radius: 14.0, depth: 2.2, rimHeight: 0.85, centralPeak: 0 },
  { x: 26, z: 96, radius: 16.5, depth: 2.6, rimHeight: 1.15, centralPeak: 0.35 },
  { x: -28, z: 66, radius: 13.0, depth: 1.9, rimHeight: 0.88, centralPeak: 0 },
  { x: -58, z: 32, radius: 18.0, depth: 2.9, rimHeight: 1.1, centralPeak: 0.4 },
  { x: -46, z: -28, radius: 15.0, depth: 2.3, rimHeight: 0.82, centralPeak: 0 },
  { x: 42, z: -34, radius: 19.0, depth: 2.8, rimHeight: 1.05, centralPeak: 0.45 },
  { x: -12, z: -58, radius: 12.5, depth: 1.8, rimHeight: 0.72, centralPeak: 0 },
  { x: 96, z: -18, radius: 24.0, depth: 3.6, rimHeight: 1.3, centralPeak: 0.8 },
  { x: -95, z: 75, radius: 28.0, depth: 4.1, rimHeight: 1.45, centralPeak: 0.9 },
  { x: 108, z: 105, radius: 22.0, depth: 3.2, rimHeight: 1.2, centralPeak: 0 },
  { x: -108, z: -85, radius: 26.0, depth: 3.8, rimHeight: 1.35, centralPeak: 0.7 },
  { x: 14, z: 136, radius: 20.0, depth: 3.0, rimHeight: 1.15, centralPeak: 0.4 },
  { x: -64, z: 118, radius: 15.0, depth: 2.2, rimHeight: 0.9, centralPeak: 0 },
  { x: 85, z: -88, radius: 21.0, depth: 3.1, rimHeight: 1.1, centralPeak: 0.3 },
  { x: -135, z: 12, radius: 30.0, depth: 4.4, rimHeight: 1.5, centralPeak: 1.1 },
];

export const BEACONS = [
  {
    id: 'base-jump',
    x: 0,
    z: 15,
    title: '1/6 重力跃起',
    lawTag: 'g = 1.62 m/s²',
    fact: '月面重力仅为地球的 1/6，以相同初速蹬地起跳，跃起高度与滞空时间均达到地球的 6 倍。',
  },
  {
    id: 'rim-launch',
    x: 0,
    z: 43,
    title: '坡顶临界起飞',
    lawTag: 'v²κ > g·cosθ',
    fact: '高速冲过环形山凸起坡顶时，向心需求超过重力法向分量，地面支持力归零自然抛物起飞。',
  },
  {
    id: 'traction-limit',
    x: 30,
    z: 34,
    title: '低重力抓地极限',
    lawTag: 'F_max = μN',
    fact: '正压力降至地球的 1/6，轮胎最大静摩擦力大幅缩水；猛踩冲刺极易引发后轮空转打滑。',
  },
  {
    id: 'ballistic-dust',
    x: 56,
    z: 20,
    title: '真空弹道扬尘',
    lawTag: 'ρ_air = 0',
    fact: '月球没有大气浮力与紊流，轮胎甩起的月尘不会形成漂浮烟团，而是沿精准抛物线瞬间砸回月面。',
  },
  {
    id: 'vacuum-coast',
    x: 58,
    z: 66,
    title: '无风阻超长滑行',
    lawTag: 'F_drag = 0',
    fact: '真空中气动阻力严格为零，停止蹬踏后仅受极微弱的低重月壤滚阻，可滑行百米以上。',
  },
  {
    id: 'reaction-wheel',
    x: 20,
    z: 88,
    title: '腾空角动量守恒',
    lawTag: 'ΔL_bike = -ΔL_wheel',
    fact: '离地后系统外力矩为零；空中加速后轮会借反作用力矩抬高车头，捏闸减速则会压低车头。',
  },
  {
    id: 'slow-lean',
    x: -30,
    z: 70,
    title: '慢动作压弯平衡',
    lawTag: 'ω ∝ √(g/h)',
    fact: '倒立摆特征频率与 √g 成正比，月面过弯侧倾、扶正与失稳倾倒的节奏均比地球慢约 2.46 倍。',
  },
  {
    id: 'earthrise-shadow',
    x: -48,
    z: 22,
    title: '真空黑影与地照',
    lawTag: 'Albedo Earthshine',
    fact: '无空气瑞利散射，月球背光面阴影深邃如墨，仅靠天顶蓝白色地球反射的微弱地照略微提亮。',
  },
];

function generateBoulders() {
  const rng = mulberry32(20260720);
  const rocks = [];
  let attempts = 0;
  while (rocks.length < 85 && attempts < 1400) {
    attempts++;
    const angle = rng() * Math.PI * 2;
    const dist = 18 + Math.pow(rng(), 0.72) * (WORLD_RADIUS - 32);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    // Keep Base Camp clear
    if (Math.hypot(x, z) < 17) continue;
    // Keep straight launch corridor (0, 0) -> (0, 48) clear
    if (Math.abs(x) < 6.5 && z > -4 && z < 49) continue;

    let tooCloseToBeacon = false;
    for (let i = 0; i < BEACONS.length; i++) {
      if (Math.hypot(x - BEACONS[i].x, z - BEACONS[i].z) < 6.5) {
        tooCloseToBeacon = true;
        break;
      }
    }
    if (tooCloseToBeacon) continue;

    let overlap = false;
    for (let i = 0; i < rocks.length; i++) {
      if (Math.hypot(x - rocks[i].x, z - rocks[i].z) < 4.2) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    const radius = 0.35 + Math.pow(rng(), 1.8) * 1.15;
    rocks.push({
      x,
      z,
      radius,
      scaleY: 0.55 + rng() * 0.55,
      rotY: rng() * Math.PI * 2,
      rotX: (rng() - 0.5) * 0.35,
      tint: 0.8 + rng() * 0.36,
    });
  }
  return rocks;
}

export const BOULDERS = generateBoulders();

function craterProfile(dist, c) {
  const u = dist / c.radius;
  if (u > 1.75) return 0;

  let h = 0;
  // Bowl depression inside u < 1.05
  if (u < 1.08) {
    const t = clamp(u / 1.05, 0, 1);
    // Flat-ish crater floor rising smoothly toward rim
    const bowl = Math.pow(1 - t * t, 1.35);
    h -= c.depth * bowl;
  }

  // Smooth raised ejecta rim around u = 1.0
  const rimSigma = 0.24;
  const du = (u - 1.0) / rimSigma;
  h += c.rimHeight * Math.exp(-du * du);

  // Subtle outer ejecta skirt
  if (u > 1.0) {
    const skirt = Math.exp(-((u - 1.0) / 0.45));
    h += c.rimHeight * 0.14 * skirt;
  }

  // Optional central peak
  if (c.centralPeak > 0 && u < 0.35) {
    const pu = u / 0.18;
    h += c.centralPeak * Math.exp(-pu * pu);
  }
  return h;
}

export function getTerrainHeight(x, z) {
  const r = Math.hypot(x, z);

  // Broad lunar mare swells
  const macro =
    (fbm2D(x * 0.011 + 13.7, z * 0.011 - 7.3, 3) - 0.5) * 3.8 +
    Math.sin(x * 0.021) * Math.cos(z * 0.018) * 0.85;
  const micro = (fbm2D(x * 0.085 - 4.1, z * 0.085 + 9.2, 2) - 0.5) * 0.24;

  let h = macro + micro;

  // Add craters
  for (let i = 0; i < CRATERS.length; i++) {
    const c = CRATERS[i];
    const dx = x - c.x;
    const dz = z - c.z;
    const maxR = c.radius * 1.75;
    if (Math.abs(dx) > maxR || Math.abs(dz) > maxR) continue;
    const dist = Math.hypot(dx, dz);
    if (dist < maxR) {
      h += craterProfile(dist, c);
    }
  }

  // Smooth outer basin rim past r > 190
  if (r > 190) {
    const t = clamp((r - 190) / 48, 0, 1);
    h += t * t * 14.0;
  }

  // Flatten Base Camp landing pad around (0, 0)
  if (r < 14.5) {
    const padBlend = smoothstep(9.5, 14.5, r);
    h *= padBlend;
  }

  return h;
}

export function getTerrainNormal(x, z) {
  const eps = 0.25;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  const nx = hL - hR;
  const ny = 2 * eps;
  const nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// Positive on convex hill crests (rims), negative in concave bowls
export function getTerrainCurvature(x, z, dirX, dirZ) {
  const d = 0.6;
  const len = Math.hypot(dirX, dirZ) || 1;
  const ux = (dirX / len) * d;
  const uz = (dirZ / len) * d;
  const h0 = getTerrainHeight(x, z);
  const hF = getTerrainHeight(x + ux, z + uz);
  const hB = getTerrainHeight(x - ux, z - uz);
  return -(hF - 2 * h0 + hB) / (d * d);
}

export function getTerrainColorFactor(x, z) {
  let ejecta = 0;
  for (let i = 0; i < CRATERS.length; i++) {
    const c = CRATERS[i];
    const dist = Math.hypot(x - c.x, z - c.z);
    const u = dist / c.radius;
    if (u > 0.72 && u < 1.55) {
      const w = Math.exp(-Math.pow((u - 1.0) / 0.28, 2));
      ejecta = Math.max(ejecta, w);
    }
  }
  const mareNoise = fbm2D(x * 0.025 + 2.4, z * 0.025 - 5.8, 3);
  return clamp(0.28 + mareNoise * 0.36 + ejecta * 0.36, 0, 1);
}
