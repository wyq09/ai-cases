/* ===== tower-crane logic：摆动 / 落块判定 / 计分 / 难度曲线 / 平衡模拟器（纯逻辑，node 可测） ===== */
if (typeof window === 'undefined') globalThis.window = globalThis;
window.TC = window.TC || {};
TC.LOGIC = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // 摆动：返回块中心相对锚点(基座中心)的 x 与水平速度。tMs 为摆动相位时钟。
  function swingX(cfg, floors, tMs) {
    const r = ramp(cfg, floors);
    const ph = (tMs % r.period) / r.period * Math.PI * 2;
    const x = r.amp * Math.sin(ph);
    const vx = r.amp * Math.PI * 2 / r.period * Math.cos(ph);
    return { x, vx };
  }

  // 难度曲线：层数越高摆越快、幅越大
  function ramp(cfg, floors) {
    return {
      amp: clamp(cfg.swingAmp + floors * cfg.ampPerFloor, 40, cfg.ampMax),
      period: Math.max(cfg.swingPeriod + floors * cfg.periodPerFloor, cfg.periodMin),
    };
  }

  // 落块判定：dropX/topX 均为相对基座中心的 x
  function resolveDrop(cfg, dropX, topX) {
    const offset = dropX - topX;
    const W = cfg.blockW;
    const ao = Math.abs(offset);
    let grade;
    if (ao <= cfg.perfectPct * W) grade = 'perfect';
    else if (ao <= cfg.greatPct * W) grade = 'great';
    else if (ao <= cfg.goodPct * W) grade = 'good';
    else grade = 'miss';
    const landX = grade === 'perfect' ? topX : dropX;
    return { grade, offset, landX };
  }

  function scoreFor(cfg, grade, combo) {
    let pts = 0;
    if (grade === 'perfect') pts = cfg.scorePerfect + Math.max(0, combo - 1) * cfg.comboStep;
    else if (grade === 'great') pts = cfg.scoreGreat;
    else if (grade === 'good') pts = 5;
    return pts + cfg.scoreFloor; // 成功落块统一基础分
  }

  // 平衡性模拟器：skillErr 为松钩时机误差（毫秒，均匀 ±skillErr）。
  // 玩家模型：想在摆块经过楼顶 x 的瞬间松钩，实际带 δt 误差 → x 误差=摆速×δt；
  // 另有 centerBias 的"往回中带"习惯（人类会下意识把塔摆正），弱回复力让塔不至于纯随机游走。
  // 内联 mulberry32，不依赖 TC.core（node 环境独立跑）
  function simulate(cfg, skillErr, ndrops, seed, centerBias) {
    const cb = centerBias === undefined ? 0.3 : centerBias;
    let a = seed >>> 0;
    const rand = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let floors = 0, score = 0, lives = cfg.startLives, perfects = 0, misses = 0, combo = 0, topX = 0;
    const xs = [];
    for (let i = 0; i < ndrops && lives > 0; i++) {
      const rmp = ramp(cfg, floors);
      const om = Math.PI * 2 / rmp.period;
      if (Math.abs(topX) >= rmp.amp) { lives--; misses++; combo = 0; continue; }
      const phase = Math.asin(clamp(topX / rmp.amp, -1, 1)); // 上升沿对准点
      // 人因：摆得越快，时机误差越大（经验幂律，按基准周期 2600 归一）
      const dtErr = (rand() * 2 - 1) * skillErr * Math.pow(2600 / rmp.period, 1.5);
      const aimX = topX * (1 - cb); // 回中习惯
      const errX = rmp.amp * Math.sin(phase + om * dtErr) - topX;
      const r = resolveDrop(cfg, aimX + errX, topX);
      if (r.grade === 'miss') {
        lives--; misses++; combo = 0;
        continue;
      }
      if (r.grade === 'perfect') { perfects++; combo++; } else combo = 0;
      score += scoreFor(cfg, r.grade, combo);
      topX = r.landX;
      xs.push(r.landX);
      floors = xs.length;
      // 重心物理：失稳即翻倒坠落（掉一截 + 损命），与实机同规则
      if (cfg.topple) {
        const st = stability(cfg, xs);
        if (!st.stable) {
          xs.length = 0;
          for (const x of st.remain) xs.push(x);
          floors = xs.length;
          topX = floors ? xs[floors - 1] : 0;
          lives--; misses++; combo = 0;
          continue; // 翻倒的这一落不发里程碑
        }
      }
      if (floors % cfg.milestoneEvery === 0) {
        score += cfg.milestoneBonus;
        lives = Math.min(lives + cfg.milestoneLife, cfg.maxLives);
      }
    }
    return { floors, score, perfects, misses, lives, reached: floors >= cfg.targetFloors };
  }

  // 重心稳定性：对每个层间接口（joint j 在块 j 与块 j+1 之间），上方整段的重心
  // 必须落在两块的接触支撑面（重叠区间）内，否则该截翻倒。
  // 从最靠顶的失稳接口开始切，切完对剩余塔重复检查，直到稳定。
  // 返回 { stable, cuts:[joint…], remain:[x…], usage }  usage=最危险接口的重心占比 0~1+（sway/预警用）
  function stability(cfg, xs) {
    const W = cfg.blockW;
    const cur = xs.slice();
    const cuts = [];
    let usage = 0;
    let again = true;
    while (again && cur.length >= 2) {
      again = false;
      for (let j = cur.length - 2; j >= 0; j--) {
        const lo = cur[j], hi = cur[j + 1];
        const l = Math.max(lo, hi) - W / 2;   // 接触支撑面左缘
        const r = Math.min(lo, hi) + W / 2;   // 右缘
        let sum = 0;
        for (let m = j + 1; m < cur.length; m++) sum += cur[m];
        const com = sum / (cur.length - j - 1);
        const spanC = (l + r) / 2, spanHalf = (r - l) / 2;
        if (spanHalf > 0) usage = Math.max(usage, Math.abs(com - spanC) / spanHalf);
        if (com < l || com > r) { cuts.push(j); cur.length = j + 1; again = true; break; }
      }
    }
    return { stable: cuts.length === 0, cuts, remain: cur, usage };
  }

  return { swingX, ramp, resolveDrop, scoreFor, stability, simulate };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.TC.LOGIC;
