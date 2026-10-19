// ---------------------------------------------------------------------------
// 改装（tuning）— a small garage between the menu and the race.
//
// Every part has three levels. Levels are bought with gold (累计金币) and stored
// per part in the save file, so a fully upgraded kart is a long-term goal that
// also softens the "高" difficulty. Each level is a plain multiplier that the
// driving code applies; `kart.js` also reads `visual` to grow spoilers, pipes,
// rims and add neon underglow so the upgrade is visible on the track.
// ---------------------------------------------------------------------------

export const MAX_LEVEL = 3;

export const PARTS = [
  {
    id: 'engine', name: '引擎', en: 'ENGINE', icon: 'engine',
    color: '#ff8a2a',
    desc: '极速上限 +2.5% / 级，起步更快',
    levels: [
      { label: '原厂', cost: 0, cap: 1, accel: 1, start: 1 },
      { label: '强化', cost: 180, cap: 1.025, accel: 1.1, start: 1.1 },
      { label: '竞速', cost: 420, cap: 1.05, accel: 1.2, start: 1.2 },
      { label: '赛道级', cost: 900, cap: 1.075, accel: 1.32, start: 1.32 },
    ],
    visual: { spoiler: 0.25, pipe: 0 },
  },
  {
    id: 'turbo', name: '涡轮', en: 'TURBO', icon: 'turbo',
    color: '#27dcff',
    desc: '喷气时长 +12% / 级，氮气更持久',
    levels: [
      { label: '原厂', cost: 0, boostMul: 1, nitroMul: 1 },
      { label: '强化', cost: 160, boostMul: 1.12, nitroMul: 1.08 },
      { label: '竞速', cost: 380, boostMul: 1.24, nitroMul: 1.16 },
      { label: '赛道级', cost: 820, boostMul: 1.4, nitroMul: 1.26 },
    ],
    visual: { pipe: 0.5, flame: 0.4 },
  },
  {
    id: 'grip', name: '轮胎', en: 'TIRES', icon: 'grip',
    color: '#6bff9e',
    desc: '抓地 +8% / 级，漂移蓄力更快',
    levels: [
      { label: '原厂', cost: 0, grip: 1, drift: 1, turn: 1 },
      { label: '强化', cost: 150, grip: 1.08, drift: 1.12, turn: 1.03 },
      { label: '竞速', cost: 360, grip: 1.16, drift: 1.24, turn: 1.06 },
      { label: '赛道级', cost: 780, grip: 1.26, drift: 1.4, turn: 1.1 },
    ],
    visual: { rim: 0.6, tyre: 0.4 },
  },
  {
    id: 'aero', name: '尾翼', en: 'AERO', icon: 'aero',
    color: '#ffd23f',
    desc: '撞击掉速更少 / 级，导弹更快锁定',
    levels: [
      { label: '原厂', cost: 0, wallKeep: 0.78, missileSpeed: 1, missileDamage: 1 },
      { label: '强化', cost: 170, wallKeep: 0.84, missileSpeed: 1.08, missileDamage: 1.06 },
      { label: '竞速', cost: 400, wallKeep: 0.9, missileSpeed: 1.16, missileDamage: 1.14 },
      { label: '赛道级', cost: 860, wallKeep: 0.96, missileSpeed: 1.26, missileDamage: 1.24 },
    ],
    visual: { spoiler: 0.7, wing: 0.5 },
  },
  {
    id: 'paint', name: '涂装', en: 'PAINT', icon: 'paint',
    color: '#ff5ecd',
    desc: '霓虹底光 + 掉宝更幸运 / 级',
    levels: [
      { label: '原厂', cost: 0, luck: 1, glow: 0 },
      { label: '强化', cost: 140, luck: 1.1, glow: 0.4 },
      { label: '竞速', cost: 340, luck: 1.22, glow: 0.7 },
      { label: '赛道级', cost: 760, luck: 1.4, glow: 1 },
    ],
    visual: { glow: 1 },
  },
];

export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export function defaultTuning() {
  const out = {};
  for (const p of PARTS) out[p.id] = 0;
  return out;
}

export function sanitizeTuning(raw) {
  const out = defaultTuning();
  if (!raw || typeof raw !== 'object') return out;
  for (const p of PARTS) {
    const v = Math.round(Number(raw[p.id]));
    if (Number.isFinite(v)) out[p.id] = Math.max(0, Math.min(MAX_LEVEL, v));
  }
  return out;
}

// Effective stats for a given tuning map. Every consumer reads this object, so
// there is exactly one place where upgrade numbers live.
export function tuningStats(tuning) {
  const t = sanitizeTuning(tuning);
  const s = {
    levels: { ...t },
    cap: 1, accel: 1, start: 1,
    boostMul: 1, nitroMul: 1,
    grip: 1, drift: 1, turn: 1,
    wallKeep: 0.78, missileSpeed: 1, missileDamage: 1,
    luck: 1, glow: 0,
    total: 0,
    // visuals
    spoiler: 0, pipe: 0, rim: 0, tyre: 0, flame: 0, wing: 0,
  };
  for (const p of PARTS) {
    const lv = t[p.id];
    s.total += lv;
    const row = p.levels[lv];
    for (const key of Object.keys(row)) {
      if (key === 'label' || key === 'cost') continue;
      if (key in s) s[key] = row[key];
    }
    for (const [key, w] of Object.entries(p.visual || {})) {
      s[key] = Math.max(s[key], (lv / MAX_LEVEL) * w);
    }
  }
  // paint glow only from level 1 up so level 0 really means "no neon"
  if (t.paint <= 0) s.glow = 0;
  return s;
}

export function upgradeCost(partId, level) {
  const part = PART_BY_ID[partId];
  if (!part || level < 0 || level >= MAX_LEVEL) return 0;
  return part.levels[level + 1].cost;
}
