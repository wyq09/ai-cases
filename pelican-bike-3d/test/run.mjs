// 鹈鹕骑车 · 月面 —— 纯逻辑回归（node test/run.mjs）
// 覆盖：月面物理规律（低重力抛体 / 无风阻 / 抓地极限 / 倒立摆平衡 / 角动量守恒 / 月尘弹道）
//      天空模型（太阳高度角 / 地球相位 / 月昼长度）、地形生成（周期性 / 月坑剖面 / 布点）与自动驾驶
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../src/terrain.js');
const S = require('../src/sim.js');
const K = S.K;

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const near = (v, ref, tol, msg) => { assert.ok(Math.abs(v - ref) <= tol, `${msg}: got ${v}, want ${ref} ± ${tol}`); n++; };
const DT = K.DT;
const NO = {};
const DEG = 180 / Math.PI;
const RATIO = K.G_EARTH / K.G_MOON;     // 6.053：地/月重力比
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// 合成地形：高度函数 → 物理用的地形接口（轮子包络与真实地形同一套算法）
function makeTerrain(heightFn) {
  return {
    tile: Infinity, plaques: [], rocksNear: () => [],
    height: (x, z) => heightFn(x, z),
    wheel: (x, z, fx, fz, R) => T.wheelEnvelope(heightFn, x, z, fx, fz, R),
    grad(x, z, out) {
      const d = 0.35;
      out.gx = (heightFn(x + d, z) - heightFn(x - d, z)) / (2 * d);
      out.gz = (heightFn(x, z + d) - heightFn(x, z - d)) / (2 * d);
      return out;
    }
  };
}
const FLAT = makeTerrain(() => 0);
function run(b, seconds, input, each) {
  const events = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    b.step(DT, input || NO);
    if (b.events.length) events.push(...b.drain());
    if (each && each(b, i)) break;
  }
  return events;
}
function cruise(v, g, opts) {
  const b = new S.Bike(FLAT, Object.assign({ g, tile: Infinity }, opts || {}));
  b.v = v;
  run(b, 0.05, { throttle: 0.3 });
  return b;
}

/* ───────── 常数与闭式解 ───────── */
{
  near(K.G_MOON, 1.62, 1e-9, '月球表面重力 1.62 m/s²');
  near(K.G_EARTH, 9.80665, 1e-9, '地球标准重力');
  near(S.ratio(), 6.0535, 0.001, 'g 地/月 ≈ 6.05');
  near(S.brakeDistance(8, K.G_MOON) / S.brakeDistance(8, K.G_EARTH), RATIO, 1e-6, '刹车距离比 = g 比');
  near(S.coastDistance(8, K.G_MOON) / S.coastDistance(8, K.G_EARTH), RATIO, 1e-6, '滑行距离比 = g 比');
  near(S.turnRadius(6, K.G_MOON, 0.3) / S.turnRadius(6, K.G_EARTH, 0.3), RATIO, 1e-6, '转弯半径比 = g 比');
  near(S.jumpStats(1.9, K.G_MOON).time / S.jumpStats(1.9, K.G_EARTH).time, RATIO, 1e-6, '滞空时间比 = g 比');
  near(S.jumpStats(1.9, K.G_MOON).apex / S.jumpStats(1.9, K.G_EARTH).apex, RATIO, 1e-6, '跳跃高度比 = g 比');
  near(S.pendulumTime(K.G_MOON) / S.pendulumTime(K.G_EARTH), Math.sqrt(RATIO), 1e-6, '倒立摆时间尺度 √(L/g)：月面是地球的 2.46 倍');
  ok(S.brakeDecel(K.G_MOON) < K.G_MOON && S.brakeDecel(K.G_EARTH) < K.G_EARTH, '刹车减速度不可能超过 μg');
  near(S.brakeDecel(K.G_MOON), K.MU * K.G_MOON, 0.02, '月面刹车受抓地限制');
  near(S.brakeDecel(K.G_EARTH), Math.min(K.MU * K.G_EARTH, K.G_EARTH * K.X_CM_FRONT / K.H_CM), 1e-9, '地球刹车 = min(抓地极限, 翘尾极限)');
  near(K.MU, K.X_CM_FRONT / K.H_CM, 0.03, '这辆车的抓地极限与翘尾极限几乎重合：刹到极限时后轮正好快离地');
  // 仅靠转向能稳住的最慢速度：地球 ≈ 14.8 km/h（现实经验"低于 15 km/h 难保持平衡"）
  near(S.minBalanceSpeed(K.G_EARTH) * 3.6, 14.75, 0.2, '地球最低平衡车速');
  near(S.minBalanceSpeed(K.G_MOON) * 3.6, 6.0, 0.15, '月球最低平衡车速');
  const tau = S.pendulumTime(K.G_MOON), tf = S.fallTime(0.02, 0.4, K.G_MOON);
  near(Math.sin(0.02) * Math.cosh(tf / tau), Math.sin(0.4), 1e-9, '撒把倒地闭式解 sinφ = sinφ₀·cosh(t/τ)');
}

/* ───────── 天空模型 ───────── */
{
  const sky0 = S.sky(S.DEFAULT_PHASE);
  near(sky0.sunAlt * DEG, 22, 0.3, '默认时刻太阳高度 22°');
  const noon = S.sky(0.25), night = S.sky(0.75);
  ok(noon.sunAlt > sky0.sunAlt, '正午太阳最高');
  near(noon.sunAlt * DEG, 33, 0.3, '北纬 57° 正午太阳最高 33°');
  ok(night.sunAlt < 0, '月夜太阳在地平线下');
  near(noon.tempK - 273.15, 64, 2, '正午月表 ≈ +64 °C（辐射平衡 T ∝ sin^¼）');
  ok(night.tempK < 130 && noon.tempK > sky0.tempK && sky0.tempK > 290, '月表温度：正午 > 清晨 > 夜晚（夜晚 < −143 °C）');
  const e0 = S.sky(0).earth;
  for (const ph of [0.1, 0.3, 0.5, 0.8]) assert.deepEqual(S.sky(ph).earth, e0), n++;
  ok(true, '潮汐锁定：地球始终挂在天上同一个方向');
  near(sky0.earthLit, 0.622, 0.02, '默认时刻（上午，太阳 22°）地球 62% 被照亮：盈凸');
  near(sky0.earthLit, (1 - dot(sky0.sun, sky0.earth)) / 2, 1e-12, '地球亮面永远朝着太阳：lit = (1 − S·E)/2');
  ok(S.sky(0.95).earthLit > 0.95 && S.sky(0).earthLit > 0.85, '月面黎明前最接近满地球（98%）');
  ok(S.sky(0.5).earthLit < 0.15 && S.sky(0.4).earthLit < 0.01, '月面下午太阳从地球旁边经过 → 新地球（圆缺与月亮相反）');
  ok(Math.abs(S.sky(0.25).earthLit - 0.232) < 0.02, '正午时地球是 23% 的残亏');
  near(S.DAY, 29.53, 0.01, '一个昼夜 29.53 地球日');
  near(S.horizonDistance(1.5), 2283, 5, '1.5 m 高处地平线 2.28 km（月球半径 1737 km）');
  near(K.EARTH_ANGULAR, 2 * Math.asin(6371 / 384400) * DEG, 0.01, '地球角直径 1.90°（约为月亮看起来的 3.7 倍）');
}

/* ───────── 抛体运动 ───────── */
{
  const measure = g => {
    const b = new S.Bike(FLAT, { g, tile: Infinity });
    b.v = 6;
    b.hop();
    let air = 0, apex = 0, y0 = 0, vy0 = 0, maxErr = 0, e0 = 0, eErr = 0, hx = 0, hxErr = 0;
    run(b, 6, NO, b => {
      if (!b.grounded) {
        air += DT;
        apex = Math.max(apex, b.heightAGL);
        const tau = air - DT;                                   // 以第一个腾空步为 t = 0
        if (air === DT) { y0 = b.y; vy0 = b.vy; e0 = 0.5 * (b.v * b.v + b.vy * b.vy) + g * b.y; hx = b.z; }   // 默认朝 −Z 骑
        maxErr = Math.max(maxErr, Math.abs(b.y - (y0 + vy0 * tau - 0.5 * g * tau * tau)));     // y = y₀ + v·t − ½gt²
        eErr = Math.max(eErr, Math.abs(0.5 * (b.v * b.v + b.vy * b.vy) + g * b.y - e0) / e0);   // ½v² + gy 守恒
        hxErr = Math.max(hxErr, Math.abs(b.z - (hx - b.v * tau)));                             // 水平匀速
      }
      return air > 0 && b.grounded;
    });
    return { air, apex, maxErr, eErr, hxErr };
  };
  const m = measure(K.G_MOON), e = measure(K.G_EARTH);
  const v0 = K.HOP_VY, gap = K.CONTACT_GAP;
  const airClosed = g => (v0 + Math.sqrt(v0 * v0 - 2 * g * gap)) / g;     // 轮子抬离 3 cm 才算离地
  const cl = S.jumpStats(v0, K.G_MOON);
  near(m.air, airClosed(K.G_MOON), 0.012, '月面跳跃滞空 ≈ 2v₀/g');
  near(m.apex, cl.apex, 0.005, '月面跳跃高度 ≈ v₀²/2g');
  near(cl.time, 2 * v0 / K.G_MOON, 1e-12, '闭式解 2v₀/g = 2.35 s');
  near(e.air, airClosed(K.G_EARTH), 0.012, '地球同样起跳速度的滞空');
  near(m.air / e.air, airClosed(K.G_MOON) / airClosed(K.G_EARTH), 0.2, '同一跳：月球滞空是地球的 6 倍（地球全程只有 0.37 s，一个步长就是 2%）');
  near(m.apex / e.apex, RATIO, 0.15, '同一跳：月球高度是地球的 6 倍');
  ok(m.maxErr < 2e-4 && m.hxErr < 1e-9, `抛物线精确（y 误差 ${m.maxErr.toExponential(1)} m，水平匀速误差 ${m.hxErr.toExponential(1)} m）`);
  ok(m.eErr < 0.004, `飞行中机械能守恒（相对误差 ${m.eErr.toExponential(1)}）`);
  ok(m.air > 2.3 && m.apex > 1.1, '月面原地跳：滞空 2.3 s、高 1.1 m');
  ok(e.air < 0.4 && e.apex < 0.19, '地球上同一跳：0.39 s、18 cm');
}

/* ───────── 无空气阻力：滑行 ───────── */
{
  const coast = g => {
    const b = cruise(8, g);
    const x0 = b.dist, t0 = b.time;
    run(b, 400, NO, () => b.v <= 0);
    return { d: b.dist - x0, t: b.time - t0 };
  };
  const m = coast(K.G_MOON), e = coast(K.G_EARTH);
  near(m.d, S.coastDistance(8, K.G_MOON), 2.5, '月面 8 m/s 滑行距离 ≈ v²/2·Crr·g');
  near(m.t, S.coastTime(8, K.G_MOON), 0.8, '月面滑行时间 ≈ v/Crr·g');
  near(m.d / e.d, RATIO, 0.15, '滑行距离只差一个 g');
  ok(m.d > 390 && m.t > 95, '月面 8 m/s 不踩了能滑 395 m、滑 99 秒');
  ok(e.d < 70, '地球上只能滑 65 m');
}

/* ───────── 刹车：摩擦力 ∝ 正压力 ───────── */
{
  const brake = g => {
    const b = cruise(8, g);
    const x0 = b.dist, t0 = b.time;
    let maxDecel = 0, vPrev = b.v, tPrev = b.time;
    run(b, 60, { brake: 1 }, b => {
      if (b.v > 0.05) maxDecel = Math.max(maxDecel, (vPrev - b.v) / (b.time - tPrev));   // 末尾静摩擦刹停那一步不算
      vPrev = b.v; tPrev = b.time;
      return b.v <= 0;
    });
    return { d: b.dist - x0, t: b.time - t0, maxDecel };
  };
  const m = brake(K.G_MOON), e = brake(K.G_EARTH);
  near(m.d, S.brakeDistance(8, K.G_MOON), 0.6, '月面 8 m/s 刹停距离 ≈ v²/2(μg + Crr·g)');
  near(e.d, S.brakeDistance(8, K.G_EARTH), 0.3, '地球 8 m/s 刹停距离');
  near(m.d / e.d, RATIO, 0.2, '刹车距离只差一个 g');
  ok(m.maxDecel <= S.brakeDecel(K.G_MOON) + K.CRR * K.G_MOON + 0.02, `刹车减速度不超过 μg（实测峰值 ${m.maxDecel.toFixed(3)} m/s²）`);
  ok(m.d > 30 && m.t > 7 && m.t < 8.5, `月面 29 km/h 刹停要 ${m.d.toFixed(0)} m、${m.t.toFixed(1)} 秒（地球 ${e.d.toFixed(1)} m、${e.t.toFixed(1)} 秒）`);
}

/* ───────── 驱动：功率 / 腿力 / 后轮抓地 ───────── */
{
  const b = new S.Bike(FLAT, { tile: Infinity });
  let maxA = 0, vPrev = 0;
  const ev = run(b, 60, { throttle: 1 }, b => {
    maxA = Math.max(maxA, (b.v - vPrev) / DT);
    vPrev = b.v;
    return false;
  });
  const aTrac = K.MU * K.G_MOON * K.K_REAR / (1 - K.MU * K.H_CM / K.WB);
  ok(ev.some(e => e.type === 'slip'), '月面全力起步会后轮空转：腿力 90 N > 后轮抓地极限 60 N');
  ok(maxA <= aTrac + 0.02, `加速度受后轮抓地限制（峰值 ${maxA.toFixed(2)} ≤ ${aTrac.toFixed(2)} m/s²）`);
  ok(b.v > 10 && b.v <= K.CADENCE_MAX * S.development() + 1e-6, `月面平地极速 ${b.v.toFixed(2)} m/s：只受齿比与踏频限制，不是风阻`);
  near(S.development(), 5.256, 1e-3, '44×18 单速，每踏一圈 5.26 m');
  // 纯滚动：ω·R = v；脚踏与后轮按齿比联动
  const c = cruise(8, K.G_MOON);
  const w0 = c.wheelR, cr0 = c.crank, d0 = c.dist;
  run(c, 1, { throttle: 0.5 });
  near((c.wheelR - w0) * K.WHEEL_R, c.dist - d0, 1e-6, '车轮纯滚动：转角 × 半径 = 走过的距离');
  near((c.wheelR - w0) / K.GEAR, c.crank - cr0, 1e-9, '曲柄转角 = 后轮转角 / 齿比');
  ok(Math.abs(c.cadence - c.v / S.development()) < 0.004, `踏频 = 步初速度 / 每圈距离（${(c.cadence * 60).toFixed(0)} rpm）`);
  // 空中蹬踏没有推力：车速不变
  const h = cruise(6, K.G_MOON);
  h.hop();
  h.step(DT, { throttle: 1 });                                      // 起跳那一步轮胎还接地，照常出力
  const hv0 = h.v, hw0 = h.wheelR;
  run(h, 1.0, { throttle: 1 });
  ok(!h.grounded && Math.abs(h.v - hv0) < 1e-9, '腾空时怎么蹬都不会加速（轮胎不接触月面）');
  ok(h.wheelR - hw0 > K.CADENCE_MAX * 2 * Math.PI * K.GEAR * 0.9 && h.cadence > 2, '但飞轮会带着后轮空转');
}

/* ───────── 过弯：tanφ = v²/(gR) ───────── */
{
  const turn = g => {
    const b = new S.Bike(FLAT, { g, tile: Infinity });
    b.v = 6;
    // 两边都锁 6 m/s：滚阻功率前馈 + 比例修正
    const hold = () => ({ steer: 0.6, throttle: Math.max(0, Math.min(1, K.CRR * K.MASS * g * b.v / K.POWER + (6 - b.v) * 0.6)) });
    for (let i = 0; i < 9 / DT; i++) b.step(DT, hold());
    const yaw0 = b.yaw;
    for (let i = 0; i < 2 / DT; i++) b.step(DT, hold());
    return { lean: b.lean, R: Math.abs(b.v * 2 / (b.yaw - yaw0)), v: b.v };
  };
  const m = turn(K.G_MOON), e = turn(K.G_EARTH);
  near(m.lean, 0.6 * K.LEAN_MAX, 0.02, '稳态倾角跟住目标');
  near(m.R / S.turnRadius(m.v, K.G_MOON, m.lean), 1, 0.04, '月面转弯半径 ≈ v²/(g·tanφ)');
  near(e.R / S.turnRadius(e.v, K.G_EARTH, e.lean), 1, 0.04, '地球转弯半径 ≈ v²/(g·tanφ)');
  near(m.R / e.R, RATIO, 0.35, '同样倾角，月面转弯半径是地球的 6 倍');
  ok(m.R > 90 && e.R < 20, `${m.v.toFixed(1)} m/s 压 ${(m.lean * DEG).toFixed(0)}°：月面半径 ${m.R.toFixed(0)} m，地球 ${e.R.toFixed(1)} m`);
  // 反打（counter-steering）：要向右压车，车把会先向左打
  const b = cruise(6, K.G_MOON);
  let minSteer = 0, yawLeft = 0;
  const yaw0 = b.yaw;
  run(b, 0.6, { throttle: 0.5, steer: 1 }, b => { minSteer = Math.min(minSteer, b.steer); yawLeft = Math.max(yawLeft, b.yaw - yaw0); return false; });
  run(b, 4, { throttle: 0.5, steer: 1 });
  ok(minSteer < -5e-4, `向右压车前车把先向左反打（最小车把角 ${(minSteer * DEG).toFixed(2)}°）`);
  ok(yawLeft > 2e-5, `车头先向左偏一点（${(yawLeft * DEG).toFixed(3)}°）把车身甩向右倾`);
  ok(b.yaw < yaw0, '最终向右转');
}

/* ───────── 平衡：倒立摆 + 撒把 ───────── */
{
  const b = cruise(6, K.G_MOON);
  run(b, 60, { throttle: 0.4 });
  ok(Math.abs(b.lean) < 2e-3 && b.state === 'ride', '扶着车把 60 s 稳稳当当');
  for (const g of [K.G_MOON, K.G_EARTH]) {
    const c = cruise(6, g);
    c.falls = 0;
    run(c, 60, { throttle: 0.6, steer: 1 }, () => c.state === 'down');
    ok(c.state !== 'down', `满舵过弯不摔（g = ${g.toFixed(2)}）`);
  }
  const fall = (g, lean0, lean1) => {
    const b = cruise(6, g);
    b.kick = 0; b.lean = lean0; b.leanRate = 0;
    let t = 0;
    run(b, 20, { handsOff: true }, b => { t = b.time - 0.05; return Math.abs(b.lean) >= lean1; });
    return t;
  };
  const tm = fall(K.G_MOON, 0.02, 0.4), te = fall(K.G_EARTH, 0.02, 0.4);
  near(tm, S.fallTime(0.02, 0.4, K.G_MOON), 0.08, '月面撒手后倒到 23° 的时间 ≈ 精确解');
  near(te, S.fallTime(0.02, 0.4, K.G_EARTH), 0.08, '地球撒手后倒到 23° 的时间 ≈ 精确解');
  near(tm / te, Math.sqrt(RATIO), 0.05, '月面倒得慢 2.46 倍');
  ok(tm > 2.8 && te < 1.3, '同样撒手：月面 2.9 s 才倒到 23°，地球 1.2 s');
}

/* ───────── 摩擦锥：倾角超过 atan(μ) 就救不回来 ───────── */
{
  for (const g of [K.G_MOON, K.G_EARTH]) {
    const b = cruise(6, g);
    b.lean = 0.7; b.leanRate = 0.25;                       // 40° 且还在往外倒
    const ev = run(b, 8, { throttle: 0.4 }, b => b.state !== 'ride');
    ok(b.state === 'down' && ev.some(e => e.type === 'fall'), `倾角超过 atan(μ) ≈ 31° → 侧滑倒地（g = ${g.toFixed(2)}）`);
    let vAtGetup = -1;
    const ev2 = run(b, 6, { throttle: 0.4 }, b => {
      if (b.state === 'ride') { vAtGetup = b.v; return true; }
      return false;
    });
    ok(b.state === 'ride' && Math.abs(b.lean) < 1e-6 && ev2.some(e => e.type === 'getup'), '倒地 2.6 s 后自己爬起来');
    ok(ev2.some(e => e.type === 'thud') && vAtGetup === 0, '倒地后靠滑动摩擦滑行，起身时已停住');
  }
  ok(K.LEAN_MAX < Math.atan(K.MU), '手动倾角上限在摩擦锥内');
  ok(K.LEAN_AP < Math.atan(K.MU), '自动驾驶倾角上限在摩擦锥内');
}

/* ───────── 腾空 = 角动量守恒 ───────── */
{
  const b = cruise(6, K.G_MOON);
  run(b, 6, { throttle: 0.5, steer: 0.7 });
  b.hop();
  let rate0 = null, omega0 = null, dr = 0, dw = 0;
  run(b, 4, { throttle: 0.5, steer: 0.7 }, b => {
    if (!b.grounded) {
      if (rate0 === null) { rate0 = b.leanRate; omega0 = b.omega; }
      dr = Math.max(dr, Math.abs(b.leanRate - rate0));
      dw = Math.max(dw, Math.abs(b.omega - omega0));
    }
    return rate0 !== null && b.grounded;
  });
  ok(rate0 !== null && dr < 1e-12 && dw < 1e-12, `空中倾角角速度、航向角速度保持不变（漂移 ${dr.toExponential(1)} / ${dw.toExponential(1)}）`);
  ok(Math.abs(omega0) > 0.02, '带着离地时的转向角速度飞：压弯姿态不会在空中回正');
}

/* ───────── 坡顶起跳：v² > g·ρ 才离地 ───────── */
{
  // 高斯坡顶 A·exp(−x²/σ²)：顶点曲率半径 ρ = σ²/2A = 7.5 m。轴距 1.05 m 的两轮会"架"在坡顶上，
  // 车体中心感受到的有效曲率更小（ρ_eff ≈ 8.94 m），临界速度 √(g·ρ_eff)：月面 3.8 m/s，地球 9.4 m/s
  const A = 0.6, sigma = 3, rhoEff = 8.94;
  const crest = makeTerrain(x => A * Math.exp(-(x * x) / (sigma * sigma)));
  const launch = (g, vTarget) => {
    const b = new S.Bike(crest, { g, tile: Infinity, x: -30, yaw: 0 });
    b.v = vTarget;
    let tookOff = false;
    for (let i = 0; i < 12 / DT; i++) {                 // 简单巡航：保持目标速度冲坡
      b.step(DT, { throttle: Math.max(0, Math.min(1, (vTarget - b.v) * 0.6 + 0.06)) });
      b.drain();
      if (!b.grounded) tookOff = true;
      if (tookOff && b.grounded) break;
    }
    return tookOff;
  };
  ok(!launch(K.G_MOON, 3), '月面 3 m/s 过坡顶：贴地（v² < gρ）');
  ok(launch(K.G_MOON, 5), '月面 5 m/s 过坡顶：被抛起');
  ok(!launch(K.G_EARTH, 5), '地球 5 m/s 过坡顶：贴地');
  ok(!launch(K.G_EARTH, 8), '地球 8 m/s 过坡顶：贴地');
  ok(launch(K.G_EARTH, 14), '地球 14 m/s 才离地');
  const vc = Math.sqrt(K.G_MOON * rhoEff), ve = Math.sqrt(K.G_EARTH * rhoEff);
  ok(vc > 3.4 && vc < 4.2 && ve > 8.5 && ve < 10, `坡顶离地临界速度 √(gρ)：月面 ${vc.toFixed(2)} m/s，地球 ${ve.toFixed(1)} m/s`);
  near(vc / ve, 1 / Math.sqrt(RATIO), 1e-9, '同一个坡，地球要快 √6 倍才飞得起来');
  // 落地不穿地
  const b = new S.Bike(crest, { tile: Infinity, x: -30, yaw: 0 });
  b.v = 8;
  let minY = 1e9, wasAir = false;
  run(b, 8, NO, b => {
    if (!b.grounded) wasAir = true;
    else minY = Math.min(minY, b.y - crest.height(b.x, b.z));
    return wasAir && b.grounded;
  });
  ok(wasAir && b.grounded && minY >= -1e-4, `落地后不陷入地面（最小间隙 ${minY.toExponential(1)} m）`);
}

/* ───────── 坡度：mg·sinθ 也只有 1/6 ───────── */
{
  const tan10 = Math.tan(10 * Math.PI / 180);
  const slope = makeTerrain(x => x * tan10);
  const climb = g => {
    const b = new S.Bike(slope, { g, tile: Infinity, yaw: 0 });
    run(b, 25, { throttle: 1 });
    return b.v;
  };
  const vm = climb(K.G_MOON), ve = climb(K.G_EARTH);
  ok(vm > 8, `月面 10° 坡：这辆单速车蹬到 ${vm.toFixed(1)} m/s`);
  ok(ve < 1, `地球 10° 坡：90 N 腿力蹬不动（需要 mg·sinθ ≈ ${(K.MASS * K.G_EARTH * Math.sin(10 * Math.PI / 180)).toFixed(0)} N），只能溜坡`);
  const stop = g => {
    const b = new S.Bike(slope, { g, tile: Infinity, yaw: 0 });        // 车头朝上坡，靠惯性冲上去
    b.v = 6;
    const x0 = b.dist;
    run(b, 300, NO, () => b.v <= 0);
    return b.dist - x0;
  };
  const closed = g => 36 / (2 * g * (Math.sin(10 * Math.PI / 180) + K.CRR * Math.cos(10 * Math.PI / 180)));
  near(stop(K.G_MOON), closed(K.G_MOON), 1.5, '月面上坡滑停距离 ≈ v²/2(g·sinθ + Crr·g·cosθ)');
  near(stop(K.G_EARTH), closed(K.G_EARTH), 0.4, '地球上坡滑停距离');
}

/* ───────── 月尘：解析抛物线 ───────── */
{
  const b = cruise(4, K.G_MOON);
  const i = b.spawnDust(1, 0.05, 2, 1.5, 2, 0.5, 1);
  ok(i === 0 && b.dust.n === 1, '月尘入池');
  const d = b.dust, tl = d.tl[i];
  near(tl, S.jumpStats(2, K.G_MOON, 0.05).time, 1e-6, '月尘落地时间 = 抛物线解析解');
  for (const f of [0.25, 0.5, 0.9]) {
    d.t[i] = tl * f;
    b._stepDust(b, 0);
    near(d.py[i], 0.05 + 2 * tl * f - 0.5 * K.G_MOON * tl * f * tl * f, 1e-6, '月尘高度 = y₀ + v·t − ½gt²');
    near(d.px[i], 1 + 1.5 * tl * f, 1e-6, '月尘水平匀速（没有空气阻力）');
    near(d.pz[i], 2 + 0.5 * tl * f, 1e-6, '月尘侧向匀速');
  }
  const e = cruise(4, K.G_EARTH);
  const tlE = e.dust.tl[e.spawnDust(1, 0.05, 2, 1.5, 2, 0.5, 1)];
  near(tlE, S.jumpStats(2, K.G_EARTH, 0.05).time, 1e-6, '地球上同一粒尘的落地时间 = 解析解');
  near(tl / tlE, S.jumpStats(2, K.G_MOON, 0.05).time / S.jumpStats(2, K.G_EARTH, 0.05).time, 1e-5, '同一粒尘：月面滞空时间是地球的近 6 倍（从离地 5 cm 处扬起）');
  near(S.jumpStats(2, K.G_MOON).time / S.jumpStats(2, K.G_EARTH).time, RATIO, 1e-9, '从地面扬起则严格是 6.05 倍');
  d.t[i] = tl + 1;
  b._stepDust(b, 0);
  ok(b.dust.n === 0, '落地即停：不会悬在空中');
  const c = cruise(6, K.G_MOON);
  run(c, 20, { throttle: 1 });
  ok(c.dust.n <= K.DUST_MAX, '月尘池有上限');
  const h = cruise(6, K.G_MOON);
  h.hop();
  run(h, 1.4, NO);
  ok(!h.grounded && h.airTime > 1 && h.dust.n === 0, '腾空时轮胎不接触月面：不扬尘');
  run(h, 3, NO, () => h.grounded && h.airTime === 0);
  ok(h.dust.n > 0, '落地扬起一圈月尘');
}

/* ───────── 车辙 ───────── */
{
  const b = cruise(4, K.G_MOON);
  run(b, 2, { throttle: 0.5 });
  ok(b.trackQueue.length > 20, '接地骑行留下车辙点');
  const sides = new Set(b.trackQueue.map(p => p.side));
  ok(sides.has('r') && sides.has('f'), '前后轮都有车辙');
  let minGap = 1e9;
  for (const side of ['r', 'f']) {
    const pts = b.trackQueue.filter(p => p.side === side);
    for (let k = 1; k < pts.length; k++) minGap = Math.min(minGap, Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  }
  ok(minGap >= 0.15, '车辙采样间距 ≥ 15 cm');
  const h = cruise(6, K.G_MOON);
  h.hop();
  run(h, 1.2, NO);
  h.trackQueue.length = 0;
  run(h, 0.5, NO);
  ok(!h.grounded && h.trackQueue.length === 0, '腾空时不留车辙');
}

/* ───────── 知识牌发现 ───────── */
{
  const field = T.generate(T.SEED);
  const ter = T.adapter(field);
  const p = field.plaques[0];
  const b = new S.Bike(ter, { x: p.x, z: p.z + 30, yaw: Math.PI / 2 });
  const ev = run(b, 40, { throttle: 1 }, () => p.found);
  ok(p.found && ev.some(e => e.type === 'discover' && e.id === 0), '骑到牌子跟前触发发现');
  ok(b.foundCount === 1, '发现计数');
  run(b, 2, { throttle: 0.5 });
  ok(b.drain().filter(e => e.type === 'discover').length === 0, '同一块牌不重复触发');
}

/* ───────── 确定性 / 数值稳健 / 自动驾驶 ───────── */
{
  const field = T.generate(T.SEED);
  const ter = T.adapter(field);
  const mk = seed => {
    field.plaques.forEach(p => { p.found = false; });
    const b = new S.Bike(ter, { seed });
    const ap = new S.Autopilot(b);
    for (let i = 0; i < 60 * 120; i++) b.step(DT, ap.decide(DT));
    return JSON.stringify(b.snapshot());
  };
  const a1 = mk(3);
  ok(a1 === mk(3), '同种子 + 同输入 → 状态完全一致（可复现）');
  ok(a1 !== mk(4), '不同种子扰动不同');

  let done = 0, falls = 0, longest = 0;
  for (let seed = 1; seed <= 8; seed++) {
    field.plaques.forEach(p => { p.found = false; });
    const b = new S.Bike(ter, { seed });
    const ap = new S.Autopilot(b);
    for (let i = 0; i < 1000 * 120; i++) {
      b.step(DT, ap.decide(DT));
      for (const e of b.drain()) if (e.type === 'fall') falls++;
      if (b.foundCount === 12) break;
    }
    if (b.foundCount === 12) { done++; longest = Math.max(longest, b.time); }
  }
  ok(done === 8, `自动驾驶 8 次巡游全部找齐 12 块知识牌（最长 ${longest.toFixed(0)} s）`);
  ok(falls <= 2, `8 趟巡游（约 5000 s 骑行）最多摔 ${falls} 次`);

  // 乱按一通 10 分钟：状态有限、状态机合法、最终能回到骑行
  const chaos = new S.Bike(ter, { seed: 11 });
  const rnd = T.mulberry32(5);
  for (let i = 0; i < 600 * 120; i++) {
    const inp = i % 37 === 0 ? { throttle: rnd(), brake: rnd() > 0.9 ? 1 : 0, steer: rnd() * 2 - 1, handsOff: rnd() > 0.93 } : NO;
    if (i % 531 === 0) chaos.hop();
    chaos.step(DT, inp);
    chaos.drain();
    if (i % 600 === 0) for (const v of Object.values(chaos.snapshot())) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `state finite at step ${i}`);
    }
  }
  n++;
  ok(['ride', 'down', 'getup'].includes(chaos.state), '乱按一通后状态机合法');

  // update() 固定步长累加器
  const u = new S.Bike(FLAT, { tile: Infinity });
  for (let i = 0; i < 60 * 30; i++) u.update(1 / 60, { throttle: 0.5 });
  near(u.time, 30, 0.05, '30 s × 60 fps 的 update() 累计 30 s');
}

/* ───────── 地形 ───────── */
{
  const t0 = performance.now();
  const field = T.generate(T.SEED);
  ok(performance.now() - t0 < 3000, `地形生成耗时 ${(performance.now() - t0).toFixed(0)} ms`);
  const rng = T.mulberry32(77);
  let seam = 0;
  for (let k = 0; k < 3000; k++) {
    const x = rng() * T.TILE, z = rng() * T.TILE;
    seam = Math.max(seam, Math.abs(T.heightAt(field, x, z) - T.heightAt(field, x + T.TILE, z + T.TILE)));
  }
  ok(seam < 1e-6, `瓦片周期无缝（接缝误差 ${seam.toExponential(1)} m）`);
  let slope2 = 0;
  const g = {};
  for (let x = -14; x <= 14; x += 1) for (let z = -60; z <= 10; z += 1) { T.grad(field, x, z, g); slope2 = Math.max(slope2, g.gx * g.gx + g.gz * g.gz); }
  ok(Math.atan(Math.sqrt(slope2)) * DEG < 7, `起步大道（±14 m × 70 m，坑壁都不得伸入）最大坡度 ${(Math.atan(Math.sqrt(slope2)) * DEG).toFixed(1)}° < 7°`);
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < field.H.length; i++) { lo = Math.min(lo, field.H[i]); hi = Math.max(hi, field.H[i]); }
  ok(hi > 120 && hi < 220 && lo > -40 && lo < 0, `高度范围 ${lo.toFixed(1)} ~ ${hi.toFixed(1)} m（山脊 120 m 以上、最大坑深 18 m 级）`);
  const i0 = 700, j0 = 512, H = field.H, cx = i0 * T.TEX, cz = j0 * T.TEX;   // H[i,j] 位于 (i·TEX, j·TEX)
  ok(T.heightAt(field, cx, cz) === H[j0 * T.N + i0], '物理地面（Catmull-Rom）在格点严格等于高度图原值');
  ok(T.heightMesh(field, cx, cz) === H[j0 * T.N + i0], '渲染网格在格点也等于原值');
  near(T.heightMesh(field, (i0 + 0.5) * T.TEX, (j0 + 0.5) * T.TEX), 0.5 * (H[j0 * T.N + i0] + H[(j0 + 1) * T.N + i0 + 1]), 1e-9, '渲染网格格心（对角线上）= 两端平均');
  // 物理地面是 C² 连续的：二阶差分应比分片线性的渲染网格小一个量级
  let d2Smooth = 0, d2Mesh = 0;
  for (const zz of [3, 141.7, 512.25, 900.5]) {
    let a2 = T.heightAt(field, -5, zz), a1 = T.heightAt(field, -4.99, zz), b2 = T.heightMesh(field, -5, zz), b1 = T.heightMesh(field, -4.99, zz);
    for (let x = -4.98; x < 25; x += 0.01) {
      const ha = T.heightAt(field, x, zz), hm = T.heightMesh(field, x, zz);
      d2Smooth = Math.max(d2Smooth, Math.abs(ha - 2 * a1 + a2)); d2Mesh = Math.max(d2Mesh, Math.abs(hm - 2 * b1 + b2));
      a2 = a1; a1 = ha; b2 = b1; b1 = hm;
    }
  }
  ok(d2Smooth * 8 < d2Mesh, `物理地面二阶差分 ${d2Smooth.toExponential(1)} 远小于渲染网格的折点 ${d2Mesh.toExponential(1)}（每厘米）`);
  let dev = 0;
  for (let k = 0; k < 20000; k++) {
    const x = rng() * T.TILE, z = rng() * T.TILE;
    dev = Math.max(dev, Math.abs(T.heightAt(field, x, z) - T.heightMesh(field, x, z)));
  }
  ok(dev < 0.12, `物理地面与屏幕上的渲染面最大只差 ${dev.toFixed(3)} m（轮胎吞得掉）`);
  // 车轮包络是光滑的：黄金分割细化的极值
  {
    const hh = x => 0.6 * Math.exp(-(x * x) / 9);
    let worst = 0, p2 = T.wheelEnvelope(hh, -2, 0, 1, 0, K.WHEEL_R), p1 = T.wheelEnvelope(hh, -1.995, 0, 1, 0, K.WHEEL_R);
    for (let x = -1.99; x < 2; x += 0.005) { const v = T.wheelEnvelope(hh, x, 0, 1, 0, K.WHEEL_R); worst = Math.max(worst, Math.abs(v - 2 * p1 + p2)); p2 = p1; p1 = v; }
    ok(worst < 4e-6, `车轮包络二阶差分 ${worst.toExponential(1)}（每 5 mm），没有离散采样造成的折点`);
  }
  ok(T.wheelCenter(field, 300.3, 200.7, 1, 0, K.WHEEL_R) - K.WHEEL_R >= T.heightAt(field, 300.3, 200.7) - 1e-6, '轮子包络高度 ≥ 轮下地面');
  // 月坑剖面：碗底低于原地面，坑缘高于原地面，溅射裙外为零，且处处连续
  const depth = 3, rim = 0.6;
  ok(T.craterProfile(0, depth, rim) < -depth * 0.99, '坑底在地下');
  ok(T.craterProfile(1.05, depth, rim) > rim && T.craterProfile(1.05, depth, rim) < rim * 1.3, '坑缘隆起');
  ok(T.craterProfile(2.4, depth, rim) === 0 && T.craterProfile(5, depth, rim) === 0, '溅射范围外为 0');
  let maxJump = 0, prev = T.craterProfile(0.5, depth, rim);
  for (let q = 0.505; q < 2.4; q += 0.005) { const v = T.craterProfile(q, depth, rim); maxJump = Math.max(maxJump, Math.abs(v - prev)); prev = v; }
  ok(maxJump < depth * 0.012, `剖面连续（最大步进 ${maxJump.toExponential(1)} m）`);
  // 岩石场：确定性、周期、起步区净空、尺寸分级
  assert.deepEqual(T.rocksInCell(64, 0), T.rocksInCell(0, 0)), n++;
  assert.deepEqual(T.rocksInCell(-3, 70), T.rocksInCell(61, 6)), n++;
  ok(true, '岩石场按 64 格周期');
  ok(T.rocksNear(field, 0, 0, 7.9).length === 0, '起步区 8 m 内没有岩石');
  let rocks = 0, big = 0, bad = 0;
  for (let cj = -4; cj < 4; cj++) for (let ci = -4; ci < 4; ci++) for (const r of T.rocksInCell(ci, cj)) {
    rocks++; if (r.r > 0.4) big++;
    if (r.r < 0.04 || r.r > 1.21 || !Number.isFinite(r.x)) bad++;
  }
  ok(rocks > 55 && big >= 1 && big < rocks * 0.15 && bad === 0, `128 m 见方内 ${rocks} 块石头，其中大石块 ${big} 块（<15%，约每 60 m 一块），参数合法`);
  // 知识牌：12 块、都在缓坡上、2.6 m 内没有石头
  const pl = field.plaques;
  ok(pl.length === 12 && pl.every((p, k) => p.id === k), '12 块知识牌，id 连续');
  ok(pl.every(p => { T.grad(field, p.x, p.z, g); return Math.hypot(g.gx, g.gz) < 0.25 && Math.abs(p.y - T.heightAt(field, p.x, p.z)) < 1e-6; }), '12 块牌子都在 14° 以内的缓坡上，记录的高度与地面一致');
  ok(pl.every(p => T.adapter(field).rocksNear(p.x, p.z, T.CLEAR - 0.01).length === 0), `牌子周围 ${T.CLEAR} m 着陆场没有石头`);
  const camp = field.camp;
  ok(Math.abs(T.heightAt(field, camp.x, camp.z) - T.heightAt(field, 0, 0)) < 0.05, '营地与起步点在同一块整平地上');
}

console.log(`[pass] ${n} 项逻辑断言全绿`);
