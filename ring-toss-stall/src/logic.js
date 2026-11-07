/* 地摊套圈 — 逻辑核心：布局/物理/判定/预测/蒙特卡洛模拟（纯 JS 无 DOM，可在 Node 跑） */
if (typeof window !== 'undefined') window.RT = window.RT || {};
else if (typeof globalThis !== 'undefined') globalThis.RT = globalThis.RT || {};
var RT = (typeof window !== 'undefined' ? window.RT : globalThis.RT);
RT.LOGIC = (function () {
  'use strict';

  /* ── 物理常量（米/秒） ── */
  var G = 9.8;
  var RING = { ROut: 0.21, RIn: 0.16, tube: 0.045 };      // 圈外半径/内孔半径/管径
  var STOOL_H = 0.36, STOOL_HALF = 0.30;                   // 凳面高/凳半宽
  var THROW_Y = 1.12, THROW_Z = 0.12;                      // 出手高度/纵深

  /* ── 奖品规格（neck 决定套中门槛 RIn−neck：前排门槛大易中，后排门槛小难中） ── */
  var PRIZE_SPEC = {
    goose:  { name: '大白鹅',   h: 0.46, neck: 0.065, body: 0.16, val: 1,  tier: 0 },
    frog:   { name: '青蛙王',   h: 0.44, neck: 0.070, body: 0.18, val: 2,  tier: 0 },
    dog:    { name: '小花狗',   h: 0.42, neck: 0.075, body: 0.17, val: 3,  tier: 0 },
    panda:  { name: '熊猫',     h: 0.44, neck: 0.078, body: 0.19, val: 3,  tier: 1 },
    pig:    { name: '粉猪罐',   h: 0.40, neck: 0.080, body: 0.21, val: 4,  tier: 1 },
    goggle: { name: '护目镜小子', h: 0.50, neck: 0.078, body: 0.15, val: 6,  tier: 1 },
    pug:    { name: '巴哥',     h: 0.42, neck: 0.082, body: 0.16, val: 5,  tier: 2 },
    doll:   { name: '蓝裙娃娃', h: 0.52, neck: 0.088, body: 0.18, val: 8,  tier: 2 },
    dragon: { name: '小火龙',   h: 0.48, neck: 0.092, body: 0.19, val: 10, tier: 2 }
  };

  /* ── 摊位布局（金字塔纵深，凳色循环） ── */
  var ROWS = [
    { z: 1.7, xs: [-1.1, 0, 1.1],    ids: ['goose', 'frog', 'goose'] },
    { z: 2.75, xs: [-1.9, -0.95, 0, 0.95, 1.9], ids: ['dog', 'panda', 'goggle', 'panda', 'pig'] },
    { z: 3.8, xs: [-2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55], ids: ['dragon', 'doll', 'pug', 'frog', 'pug', 'doll', 'dragon'] }
  ];
  var STOOL_COLORS = ['red', 'green', 'yellow'];

  function buildLayout() {
    var stools = [], i = 0;
    ROWS.forEach(function (row) {
      row.xs.forEach(function (x, k) {
        var id = row.ids[k];
        stools.push({
          i: i, x: x, z: row.z, color: STOOL_COLORS[i % 3],
          prize: id, spec: PRIZE_SPEC[id],
          neckY: STOOL_H + PRIZE_SPEC[id].h * 0.60,
          bodyTop: STOOL_H + PRIZE_SPEC[id].h
        });
        i++;
      });
    });
    return stools;
  }
  var LAYOUT = buildLayout();

  /* ── 随机源（可注入） ── */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ── 出手参数 ── */
  // power∈[0.05,1] → 前排~后排；返回初速度。满力颈面穿越约 4.0m，留足余量防饱和
  function throwVel(power, aimX) {
    var vz = 1.70 + power * 2.75;
    var vy = 1.55 + vz * 0.56;
    var vx = aimX * 0.38;
    return { vx: vx, vy: vy, vz: vz, x0: aimX * 0.5 };
  }

  /* ── 落点预测（闭式解，用于瞄准辅助与 rig）。targetY 默认凳面；套圈判定统一用颈部高度。
     半隐式欧拉积分比闭式解多掉 g·t·dt/2 高度 → B 项吸收该偏差，使预测与实机穿越点对齐 ── */
  var DT = 1 / 120;
  function predictLanding(aimX, power, targetY) {
    var v = throwVel(power, aimX);
    var ty = (targetY === undefined) ? STOOL_H : targetY;
    var A = -0.5 * G, B = v.vy - G * DT / 2, C = THROW_Y - ty;
    var disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    var t = (-B - Math.sqrt(disc)) / (2 * A);   // 下落穿越时刻（较大根）
    return { x: v.x0 + v.vx * t, z: THROW_Z + v.vz * t, t: t };
  }

  // 反解：给定目标 (z, 高度) 求 power（vz 单调）
  function powerForZ(targetZ, targetY) {
    var lo = 0.05, hi = 1.0;
    for (var k = 0; k < 24; k++) {
      var mid = (lo + hi) / 2;
      var p = predictLanding(0, mid, targetY);
      if (!p) { hi = mid; continue; }
      if (p.z < targetZ) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ── 单圈物理推进。ring: {x,y,z,vx,vy,vz,tilt,state,bounces}，返回事件数组 ── */
  function stepRing(ring, dt, stools) {
    var ev = [];
    if (ring.state !== 'fly') return ev;
    var prevY = ring.y, prevX = ring.x, prevZ = ring.z;
    ring.vy -= G * dt;
    ring.x += ring.vx * dt;
    ring.y += ring.vy * dt;
    ring.z += ring.vz * dt;
    // 圈面姿态：上升时立起，下落时渐放平
    var target = ring.vy > 0.4 ? 1.05 : 0.0;
    var k = ring.vy > 0.4 ? 6 : 2.6;
    ring.tilt += (target - ring.tilt) * Math.min(1, k * dt);

    for (var s = 0; s < stools.length; s++) {
      var st = stools[s];
      if (!st.prize) continue;
      var dx = ring.x - st.x, dz = ring.z - st.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var sp = st.spec;
      var thr = sp.body + RING.tube * 0.5;

      /* 套中判定：下落穿越颈部高度 + 圈孔套住颈 */
      if (ring.vy < 0 && prevY >= st.neckY && ring.y < st.neckY) {
        if (d + sp.neck <= RING.RIn) {
          ring.state = 'captured'; ring.prizeI = st.i;
          ring.x = st.x; ring.z = st.z; ring.y = st.neckY; ring.tilt = 0.18;
          ev.push({ type: 'capture', stool: st });
          return ev;
        }
        if (d < thr) {  // 落在奖品头顶/肩上没套中 → 弹开（近失）
          var inv = d > 0.001 ? 1 / d : 0;
          ring.vx += dx * inv * 0.9; ring.vz += dz * inv * 0.9;
          ring.vy *= 0.25;
          ring.y = st.neckY;
          ev.push({ type: 'prizeTop', stool: st });
        }
      }
      /* 奖品身体侧碰（柱体）：高度带只到颈部，颈部以上交给套颈/碰头逻辑 */
      else if (ring.y > STOOL_H && ring.y < st.neckY && d < thr) {
        var pdx = prevX - st.x, pdz = prevZ - st.z;
        var prevD = Math.sqrt(pdx * pdx + pdz * pdz);
        if (prevD >= thr || ring.vy > 0) {
          if (d > 0.001) {
            var nx = dx / d, nz = dz / d;
            var vn = ring.vx * nx + ring.vz * nz;
            if (vn < 0) {
              ring.vx -= 1.5 * vn * nx; ring.vz -= 1.5 * vn * nz;
              ring.vx *= 0.55; ring.vz *= 0.55;
              var push = thr - d;
              ring.x += nx * push; ring.z += nz * push;
              ev.push({ type: 'prizeBody', stool: st });
            }
          }
        }
      }
    }
    /* 凳面 */
    for (var j = 0; j < stools.length; j++) {
      var st2 = stools[j];
      var ddx = ring.x - st2.x, ddz = ring.z - st2.z;
      if (Math.abs(ddx) < STOOL_HALF + RING.tube * 0.3 && Math.abs(ddz) < STOOL_HALF + RING.tube * 0.3 &&
          prevY >= STOOL_H && ring.y < STOOL_H && ring.vy < 0) {
        if (ring.tilt > 0.5) {                 // 还立着 → 磕凳弹开
          ring.y = STOOL_H; ring.vy = -ring.vy * 0.34;
          ring.vx += (ddx > 0 ? 0.35 : -0.35); ring.vz -= 0.25;
          ring.bounces++;
          ev.push({ type: 'bounceWood', stool: st2 });
        } else {                               // 已放平 → 停在凳上
          ring.state = 'rest'; ring.y = STOOL_H + RING.tube * 0.4;
          ring.onStool = st2.i;
          ev.push({ type: 'settle', on: 'stool', stool: st2 });
          return ev;
        }
      }
    }
    /* 地面 */
    if (ring.y < RING.tube * 0.45 && ring.vy < 0) {
      ring.y = RING.tube * 0.45;
      if (ring.tilt > 0.45 && ring.bounces < 2) {
        ring.vy = -ring.vy * 0.38;
        ring.vx *= 0.72; ring.vz *= 0.72;
        ring.tilt *= 0.5; ring.bounces++;
        ev.push({ type: 'bounceGround' });
      } else {
        ring.state = 'rest'; ring.vy = 0; ring.vx = 0; ring.vz = 0;
        ring.tilt = 0; ring.y = RING.tube * 0.45;
        ev.push({ type: 'settle', on: 'ground' });
      }
    }
    /* 越界兜底 */
    if (ring.z > 5.2 || Math.abs(ring.x) > 4.4 || ring.z < -0.5) {
      ring.state = 'rest'; ev.push({ type: 'settle', on: 'lost' });
    }
    return ev;
  }

  /* ── 满飞行模拟（simulate / rig 共用） ── */
  function flyOnce(aimX, power, stools, rng) {
    var v = throwVel(power, aimX);
    var ring = { x: v.x0, y: THROW_Y, z: THROW_Z, vx: v.vx, vy: v.vy, vz: v.vz,
                 tilt: 1.0, state: 'fly', bounces: 0 };
    var events = [], dt = 1 / 120, t = 0;
    while (ring.state === 'fly' && t < 3) {
      var e = stepRing(ring, dt, stools);
      for (var i = 0; i < e.length; i++) events.push(e[i]);
      t += dt;
    }
    return { ring: ring, events: events };
  }

  /* ── 反解瞄准：期望落点(穿越 targetY 平面处 x) → aimX。
     aimX 同时给出手位置与横向速度，落点 x = aimX*(0.5+0.38t)，必须反解。 ── */
  function solveAim(targetX, power, targetY) {
    var p = predictLanding(0, power, targetY);
    if (!p) return targetX;
    return targetX / (0.5 + 0.38 * p.t);
  }
  function flyOnceAt(targetX, power, stools) {
    return flyOnce(solveAim(targetX, power), power, stools);
  }

  /* ── 蒙特卡洛：普通玩家噪声模型 → 各奖品命中率 ── */
  // sigma = {x: 横向标准差, z: 纵深标准差}；返回 {total, per:{id:{n,hit}}, byTier}
  function simulate(n, sigma, seed) {
    sigma = sigma || { x: 0.14, z: 0.15 };
    var rng = mulberry32(seed || 42);
    var per = {}, total = 0;
    for (var k in PRIZE_SPEC) per[k] = { n: 0, hit: 0 };
    var picks = LAYOUT.filter(function (s) { return s.prize; });
    for (var i = 0; i < n; i++) {
      var st = picks[(rng() * picks.length) | 0];
      var dz = (st.z - 1.7) / 2.1;                       // 0 前排 → 1 后排
      var tx = st.x + gauss(rng) * sigma.x * (1 + 0.30 * dz);
      var targetZ = st.z + gauss(rng) * sigma.z * (1 + 0.35 * dz);
      var power = powerForZ(Math.max(1.2, Math.min(4.4, targetZ)), st.neckY);
      var r = flyOnceAt(tx, power, LAYOUT);
      per[st.prize].n++;
      if (r.ring.state === 'captured') {
        total++;
        per[st.prize].hit++;
      }
    }
    var out = { total: total / n, per: per, n: n };
    out.byTier = { 0: { n: 0, hit: 0 }, 1: { n: 0, hit: 0 }, 2: { n: 0, hit: 0 } };
    picks.forEach(function (s) {
      var t = out.byTier[PRIZE_SPEC[s.prize].tier];
      t.n += per[s.prize].n; t.hit += per[s.prize].hit;
    });
    [0, 1, 2].forEach(function (t) {
      var b = out.byTier[t];
      b.rate = b.n ? b.hit / b.n : 0;
    });
    return out;
  }

  return {
    G: G, RING: RING, STOOL_H: STOOL_H, STOOL_HALF: STOOL_HALF,
    THROW_Y: THROW_Y, THROW_Z: THROW_Z,
    PRIZE_SPEC: PRIZE_SPEC, ROWS: ROWS, LAYOUT: LAYOUT,
    mulberry32: mulberry32, gauss: gauss,
    throwVel: throwVel, predictLanding: predictLanding, powerForZ: powerForZ,
    solveAim: solveAim,
    stepRing: stepRing, flyOnce: flyOnce, flyOnceAt: flyOnceAt, simulate: simulate
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RT.LOGIC;
