/* 鹈鹕骑车 · 物理 —— 月面骑行仿真（纯逻辑，无 DOM / THREE，node 可单测）
 *
 * 坐标：x/z 为月面平面，y 向上；yaw 即 three.js 的 rotation.y：
 *   forward = (cos yaw, −sin yaw)，右方 = (sin yaw, cos yaw)，dyaw/dt > 0 为左转。
 *
 * 这里模拟的都是真实规律：
 *  · 真空：没有空气阻力，腾空后是纯抛体 y'' = −g（g = 1.62 m/s²）
 *  · 纵向：驱动力受功率 P/v、腿力与后轮抓地 μ·N 限制（N 含加速载荷转移），
 *          滚动阻力 Crr·mg·cosθ，坡度分量 mg·sinθ —— 全都正比于 g
 *  · 横向：自行车是不倒翁倒立的倒立摆，lean'' = (g·sinφ − a⊥·cosφ)/L，
 *          骑手"往倒的方向打车把"；稳态 tanφ = v²/(gR)
 *  · 月尘：抛物线飞行、解析落地、没有空气所以不会弥漫 */
(function (root, factory) {
  var deps = root && root.PM && root.PM.TERRAIN ? root.PM.TERRAIN
          : (typeof require === 'function' ? require('./terrain.js') : null);
  var api = factory(deps);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.PM = root.PM || {}; root.PM.SIM = api; }
})(typeof window !== 'undefined' ? window : globalThis, function (T) {
  'use strict';

  var K = {
    G_MOON: 1.62, G_EARTH: 9.80665,
    MASS: 49,               // kg：鹈鹕 9 + 宇航服 25 + 自行车 15
    MU: 0.60,               // 轮胎—月壤静摩擦系数（月壤内摩擦角约 31°）
    CRR: 0.05,              // 滚动阻力系数
    POWER: 220,             // W，鹈鹕持续输出功率
    F_LEG: 90,              // N，低速时腿能踩出的最大推力
    WB: 1.05,               // 轴距 m
    WHEEL_R: 0.342,         // 轮半径 m（700C）
    CRANK: 0.17,            // 曲柄长 m
    GEAR: 44 / 18,          // 单速齿比
    WHEEL_CIRC: 2.15,       // 轮周长 m
    CADENCE_MAX: 130 / 60,  // 踏频上限 rev/s
    L_CM: 1.05,             // 重心高 m（倒立摆摆长）
    K_REAR: 0.5,            // 静态后轮载荷占比
    H_CM: 1.05,             // 重心高（载荷转移用）
    X_CM_FRONT: 0.64,       // 重心到前轮触地点的水平距离 m（翘尾极限用）
    HOP_VY: 1.9,            // 跳跃起跳竖直速度 m/s（肌肉冲量与在哪无关）
    CONTACT_GAP: 0,          // 保留字段：地面是 C² 连续的，离地判定不需要容差
    V_LOW: 1.8,             // 低于此速度靠脚点地/定车平衡
    LEAN_MAX: 0.36,         // 手动最大目标倾角 rad（≈20.6°）：须小于摩擦锥 atan(μ)≈31° 并留出救车余量
    LEAN_AP: 0.33,          // 自动驾驶倾角上限 rad
    LEAN_SLEW: 0.45,        // 目标倾角摆率上限 rad/s：倾角 reversal 太快会超出 μg 能拉回的范围
    LEAN_FALL: 0.90,        // 超过就救不回来
    LEAN_GROUND: 1.40,      // 倒在地上的角度
    STEER_HI: 0.55, STEER_LO: 1.0,
    DT: 1 / 120,
    DUST_MAX: 1400,
    MOON_RADIUS: 1737400,  // m
    EARTH_ANGULAR: 1.90    // °，从月球看地球的角直径
  };
  var ZETA = 1.15, TAU = 0.08;            // 平衡控制器：阻尼比（过阻尼，压住落地后的倾角角速度）/ 转向执行器时间常数
  function ctrlBandwidth(g) { return Math.sqrt(0.8 * K.MU * g / K.L_CM); }   // 自然频率 ∝ √(μg/L)：侧向加速度有多大，平衡环就能多快
  var NO_INPUT = { throttle: 0, brake: 0, steer: 0, pitch: 0, handsOff: false };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /* ── 闭式解（HUD 对照与单测基准） ── */
  function ratio() { return K.G_EARTH / K.G_MOON; }
  function brakeDecel(g) { return Math.min(K.MU * g, g * K.X_CM_FRONT / K.H_CM); }   // 抓地极限 与 翘尾极限 取小
  function brakeDistance(v, g) { return v * v / (2 * (brakeDecel(g) + K.CRR * g)); }   // 刹车时滚动阻力仍在
  function coastDistance(v, g) { return v * v / (2 * K.CRR * g); }
  function coastTime(v, g) { return v / (K.CRR * g); }
  function turnRadius(v, g, lean) { return v * v / (g * Math.tan(lean)); }
  function steadyLean(v, g, radius) { return Math.atan(v * v / (g * radius)); }
  function jumpStats(vy, g, drop) {        // 起跳竖直速度 vy，落到低 drop 米处
    var disc = vy * vy + 2 * g * (drop || 0);
    var t = disc > 0 ? (vy + Math.sqrt(disc)) / g : 0;
    return { time: t, apex: vy > 0 ? vy * vy / (2 * g) : 0 };
  }
  function development() { return K.WHEEL_CIRC * K.GEAR; }     // 每踏一圈前进的距离
  function pendulumTime(g) { return Math.sqrt(K.L_CM / g); }    // 倒立摆特征时间 √(L/g)
  function fallTime(lean0, lean1, g) {                         // 撒把后从 lean0 倒到 lean1 的时间（无初速）
    var w = 1 / pendulumTime(g);
    return Math.acosh(Math.sin(lean1) / Math.sin(lean0)) / w;     // sinφ = sinφ₀·cosh(t/τ)
  }
  function horizonDistance(h) { return Math.sqrt(2 * K.MOON_RADIUS * h); }   // 地平线距离 √(2Rh)：月球上近得多
  function minBalanceSpeed(g, steer) {                        // 仅靠转向能稳住的最慢速度
    return Math.sqrt(g * K.WB / Math.tan(steer || K.STEER_HI));
  }

  /* ── 月面天空：太阳沿赤纬 0° 的大圆走一圈 = 29.53 地球日；地球方向固定 ── */
  var LAT = 57 * Math.PI / 180;                       // 站点纬度：正午太阳最高 33°，全天都是长影子
  var VIEW_AZ = 260 * Math.PI / 180;                  // 相机默认视轴（世界 +X）的罗盘方位
  var EARTH_EL = 17 * Math.PI / 180, EARTH_AZ = -18 * Math.PI / 180;
  var EARTH_DIR = [
    Math.cos(EARTH_EL) * Math.cos(EARTH_AZ), Math.sin(EARTH_EL), Math.cos(EARTH_EL) * Math.sin(EARTH_AZ)
  ];
  var DAY = 29.530589;                                // 一个昼夜 = 地球日
  var DEFAULT_PHASE = 0.1208;                         // 日出后约 3.6 地球日，太阳高度 22°

  function sky(phase) {
    phase = phase - Math.floor(phase);
    var H = (phase - 0.25) * 2 * Math.PI;             // 时角，0 = 正午
    var alt = Math.asin(clamp(Math.cos(LAT) * Math.cos(H), -1, 1));
    var ca = Math.cos(alt);
    var A = Math.atan2(-Math.sin(H) / ca, -Math.tan(LAT) * Math.tan(alt));   // 罗盘方位：北 0 东 90°
    var th = A - VIEW_AZ;
    var sun = [ca * Math.cos(th), Math.sin(alt), ca * Math.sin(th)];
    var dot = sun[0] * EARTH_DIR[0] + sun[1] * EARTH_DIR[1] + sun[2] * EARTH_DIR[2];
    var tempK;
    if (alt > 0) tempK = 392 * Math.pow(Math.max(Math.sin(alt), 0.02), 0.25);   // 辐射平衡 T ∝ (sin 高度角)^¼，地平线附近有热惯性下限
    else {
      var since = phase > 0.5 ? (phase - 0.5) * DAY : (phase + 0.5) * DAY;    // 距日落的天数
      tempK = 95 + 50 * Math.exp(-since / 3.5);
    }
    return {
      sun: sun, earth: EARTH_DIR, earthLit: (1 - dot) / 2,     // 地球被照亮的比例：太阳在背面时满地球
      sunAlt: alt, sunAz: A, tempK: tempK, phase: phase
    };
  }

  /* ═══════════════ 自行车 ═══════════════ */
  function Bike(terrain, opts) {
    opts = opts || {};
    this.terrain = terrain || FLAT;
    this.g = opts.g || K.G_MOON;
    this.tile = opts.tile !== undefined ? opts.tile : (this.terrain.tile || T.TILE);
    this.rnd = T.mulberry32(opts.seed || 7);
    this.hopLatch = false;
    this.kick = 0.28;            // 撒把瞬间的扰动幅度 rad/s（测试可设 0）
    this.dust = null;
    this.reset(opts.x || 0, opts.z || 0, opts.yaw === undefined ? Math.PI / 2 : opts.yaw);
  }
  var FLAT = {
    tile: Infinity, plaques: [],
    height: function () { return 0; },
    wheel: function (x, z, fx, fz, R) { return R; },
    grad: function (x, z, out) { out.gx = 0; out.gz = 0; return out; },
    rocksNear: function () { return []; }
  };

  // 坐标以起点为中心折进 [-TILE/2, TILE/2)：浮点精度不随里程变差。地形是周期的，折一次等于整个世界平移一个周期，
  // 物理上完全连续；平移量记在 jumpX / jumpZ 里，渲染层用它同步移动相机和车辙
  Bike.prototype._wrap = function (s) {
    this.jumpX = 0; this.jumpZ = 0;
    if (!isFinite(this.tile)) return;
    var nx = T.dWrap(s.x), nz = T.dWrap(s.z);
    if (nx === s.x && nz === s.z) return;
    var dx = nx - s.x, dz = nz - s.z, d = s.dust, i;
    if (d) for (i = 0; i < d.n; i++) { d.px[i] += dx; d.pz[i] += dz; d.x0[i] += dx; d.z0[i] += dz; }
    this.jumpX = dx; this.jumpZ = dz; s.x = nx; s.z = nz;
  };
  Bike.prototype.gap = function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz, t = this.tile;
    if (isFinite(t)) { dx -= t * Math.floor(dx / t + 0.5); dz -= t * Math.floor(dz / t + 0.5); }
    return Math.sqrt(dx * dx + dz * dz);
  };

  Bike.prototype.reset = function (x, z, yaw) {
    var s = this;
    s.x = x; s.z = z; s.yaw = yaw;
    s.v = 0; s.vy = 0; s.y = 0; s.lean = 0; s.leanRate = 0; s.steer = 0; s.omega = 0;
    s.pitch = 0; s.pitchRate = 0; s.heightAGL = 0;
    s.grounded = true; s.airTime = 0; s.apex = 0; s.takeoff = null;
    s.crank = 0; s.wheelR = 0; s.wheelF = 0; s.cadence = 0;
    s.dist = 0; s.time = 0; s.driveF = 0; s.brakeF = 0; s.slip = 0; s.skid = 0; s.slide = false;
    s.handsOff = false; s.wasOff = false; s.noHandsTime = 0; s.maxNoHands = 0;
    s.state = 'ride'; s.downT = 0; s.getupT = 0; s.leanFrom = 0; s.fallSide = 1; s.thudded = false; s.falls = 0;
    s.events = [];
    s.trackQueue = []; s.trackLast = { r: null, f: null };
    // 已发现的知识牌是永久进度（记在地形的牌子对象上）：reset 只是重新数一遍，不清零
    s.discovered = {}; s.foundCount = 0;
    var pl0 = this.terrain.plaques || [];
    for (var pi = 0; pi < pl0.length; pi++) if (pl0[pi].found) { s.discovered[pl0[pi].id] = true; s.foundCount++; }
    s.records = { air: 0, apex: 0, jump: 0, speed: 0 };
    s.acc = 0; s.dustAcc = 0; s.wasSlip = false; s.wasSkid = false; s.evCd = 0; s.target = 0; s.fdPrev = null;
    s._g = { gx: 0, gz: 0 }; s._gp = {};
    if (!s.dust) {
      var mk = function () { return new Float32Array(K.DUST_MAX); };
      s.dust = { n: 0, x0: mk(), y0: mk(), z0: mk(), vx: mk(), vy: mk(), vz: mk(), t: mk(), tl: mk(), sz: mk(), px: mk(), py: mk(), pz: mk() };
    }
    s.dust.n = 0;
    this._groundPose(s, Math.cos(yaw), -Math.sin(yaw), s._gp);
    s.y = s._gp.y; s.pitch = s._gp.pitch;
  };

  Bike.prototype.hop = function () { this.hopLatch = true; return this.hopLatch; };

  /* 两轮包络 → 参考点高度与俯仰角。参考点 = 轮心连线中点沿车体 up 轴向下 R（刚体定义，
   * 与空中判地的 yc = y + R·cosθ ∓ (WB/2)·sinθ 严格一致，否则俯仰时会差出 R(1−cosθ)） */
  Bike.prototype._groundPose = function (s, fx, fz, out) {
    var hw = K.WB / 2, R = K.WHEEL_R, ter = this.terrain;
    var yr = ter.wheel(s.x - fx * hw, s.z - fz * hw, fx, fz, R);
    var yf = ter.wheel(s.x + fx * hw, s.z + fz * hw, fx, fz, R);
    var sn = clamp((yf - yr) / K.WB, -1, 1);
    out.pitch = Math.asin(sn);
    out.y = (yr + yf) / 2 - R * Math.sqrt(1 - sn * sn);
    out.wheelR = yr; out.wheelF = yf;
    return out;
  };

  Bike.prototype.update = function (dtReal, input) {
    this.acc += Math.min(dtReal, 0.1);
    var n = 0;
    while (this.acc >= K.DT && n < 14) { this.step(K.DT, input); this.acc -= K.DT; n++; }
    if (n === 14) this.acc = 0;
  };

  Bike.prototype.step = function (dt, input) {
    var s = this, g = s.g, m = K.MASS, ev = s.events, ter = this.terrain;
    input = input || NO_INPUT;
    s.time += dt;
    if (s.evCd > 0) s.evCd -= dt;
    if (s.state === 'down') return this._stepDown(dt);
    if (s.state === 'getup') return this._stepGetup(dt);

    var fx = Math.cos(s.yaw), fz = -Math.sin(s.yaw), v = s.v;

    /* ── 撒把：松手瞬间给一点扰动；此后车把自回正，没有人再"往倒的方向打" ── */
    var off = !!input.handsOff;
    if (off && !s.wasOff) { s.leanRate += (this.rnd() - 0.5) * this.kick; ev.push({ type: 'release', v: v }); }
    if (!off && s.wasOff) ev.push({ type: 'grab', lean: s.lean, held: s.noHandsTime });
    s.handsOff = off; s.wasOff = off;
    s.noHandsTime = off ? s.noHandsTime + dt : 0;
    if (s.noHandsTime > s.maxNoHands) s.maxNoHands = s.noHandsTime;

    /* ── 1. 横向：车把 → 向心加速度 → 倒立摆倾角 → 航向 ── */
    var low = smoothstep(K.V_LOW - 0.6, K.V_LOW + 0.2, Math.abs(v));
    var u = clamp(input.steer || 0, -1, 1);
    // 目标倾角做摆率限制：倒立摆能被拉回的倾角角速度有限（μ·g/L）
    var targetRaw = u * K.LEAN_MAX * low;
    s.target += clamp(targetRaw - s.target, -K.LEAN_SLEW * dt, K.LEAN_SLEW * dt);
    var target = off ? 0 : s.target;
    var smax = lerp(K.STEER_LO, K.STEER_HI, clamp(Math.abs(v) / 5, 0, 1));
    var cmd = 0;
    if (!off) {
      var vv = v * v, Kv = vv / (K.L_CM * K.WB);
      if (Kv > 0.05) {
        // 增益按速度调度：闭环特性与速度无关；ff 是目标倾角的稳态车把角
        var wn2 = ctrlBandwidth(g) * ctrlBandwidth(g);
        var k1 = (wn2 + g / K.L_CM) / Kv, k2 = 2 * ZETA * ctrlBandwidth(g) / Kv;
        var ff = Math.atan(K.WB * g * Math.tan(target) / vv);
        cmd = clamp(k1 * (s.lean - target) + k2 * s.leanRate + ff, -smax, smax);
      }
    }
    s.steer += (cmd - s.steer) * (1 - Math.exp(-dt / (off ? 0.15 : TAU)));
    if (s.grounded) {
      var aLat = v * v * Math.tan(s.steer) / K.WB;            // 向心加速度，向右为正
      var aMax = K.MU * g;                                    // 抓地极限 μg：倾角超过 atan(μ) 就侧滑
      s.slide = Math.abs(aLat) > aMax;
      if (s.slide) aLat = clamp(aLat, -aMax, aMax);
      var omegaDyn = Math.abs(v) > 1e-4 ? -aLat / v : 0;      // 右转 → yaw 减小
      var omegaLow = off ? 0 : -u * (0.35 + 0.28 * Math.min(Math.abs(v), 2));
      s.omega = lerp(omegaLow, omegaDyn, low);
      // 接地：绕触地点的倒立摆，骑手往倒的方向打车把
      var acc = lerp(-16 * s.lean - 8 * s.leanRate,
                     (g * Math.sin(s.lean) - aLat * Math.cos(s.lean)) / K.L_CM, low);
      s.leanRate += acc * dt;
    } else {
      s.slide = false;
      // 腾空 = 自由落体：绕重心的重力矩为零 → 倾角角速度与航向角速度都守恒（角动量守恒）
    }
    s.yaw += s.omega * dt;
    fx = Math.cos(s.yaw); fz = -Math.sin(s.yaw);
    s.lean += s.leanRate * dt;
    if (Math.abs(s.lean) > K.LEAN_FALL) { this._fall('balance'); return; }

    /* ── 跳：肌肉给的冲量不变，所以起跳速度与在哪无关 ── */
    var hopped = false;
    if (this.hopLatch && s.grounded) { s.vy += K.HOP_VY; hopped = true; ev.push({ type: 'hop', v: v }); }
    this.hopLatch = false;

    /* ── 2. 纵向（只有接地时轮胎才施力） ── */
    s.driveF = 0; s.brakeF = 0; s.slip = 0; s.skid = 0;
    var sinS = Math.sin(s.pitch), cosS = Math.cos(s.pitch);
    if (s.grounded) {
      var th = clamp(input.throttle || 0, 0, 1), br = clamp(input.brake || 0, 0, 1);
      var drive = 0, resist = 0;
      if (th > 0 && v >= -0.01) {
        s.cadence = v / development();
        drive = Math.min(K.POWER * th / Math.max(v, 0.6), K.F_LEG * th)
              * clamp((K.CADENCE_MAX - s.cadence) / (0.3 * K.CADENCE_MAX), 0, 1);   // 踏频到顶就蹬不上力
        // 后轮抓地极限：N = mg(k + h/wb·sinθ) + F·h/wb，解出 F
        var kRear = K.K_REAR * cosS + (K.H_CM / K.WB) * sinS;
        var fTrac = K.MU * m * g * Math.max(kRear, 0.04) / (1 - K.MU * K.H_CM / K.WB);
        if (drive > fTrac) { s.slip = drive / fTrac - 1; drive = fTrac; }
      }
      if (br > 0 && Math.abs(v) > 0.02) {
        s.brakeF = br * m * brakeDecel(g);
        resist += s.brakeF;
        s.skid = br > 0.85 ? 1 : 0;                          // 猛刹 → 后轮抱死拖痕
      }
      if (Math.abs(v) > 0.01) resist += K.CRR * m * g * cosS;
      var a = (drive - Math.sign(v) * resist - m * g * sinS) / m;
      var vn = v + a * dt;
      if (v > 0 && vn < 0) vn = (br > 0 || drive - m * g * sinS > 0) ? 0 : vn;      // 刹停；或停不住被坡拉回去
      else if (v < 0 && vn > 0) vn = (br > 0 || drive - m * g * sinS < 0) ? 0 : vn;
      else if (v === 0 && vn < 0 && br > 0) vn = 0;
      // 静摩擦：不蹬不刹、坡度缓于 ~1.7° 时，蠕行到 1.5 cm/s 以下就停住
      if (th === 0 && Math.abs(vn) < 0.015 && Math.abs(sinS) < 0.03) vn = 0;
      v = s.v = clamp(vn, -4, 45);
      s.driveF = drive;
      if (s.slip > 0.05 && !s.wasSlip && s.evCd <= 0) { ev.push({ type: 'slip', slip: s.slip }); s.evCd = 0.6; }
      if (s.skid && !s.wasSkid && s.evCd <= 0) { ev.push({ type: 'skid' }); s.evCd = 0.6; }
    } else {
      s.cadence = clamp(input.throttle || 0, 0, 1) * K.CADENCE_MAX;   // 空中蹬空：只转脚踏，没有推力
    }
    s.wasSlip = s.slip > 0.05; s.wasSkid = !!s.skid;

    /* ── 3. 前进 ── */
    s.x += fx * s.v * dt; s.z += fz * s.v * dt;
    s.dist += Math.abs(s.v) * dt;
    this._wrap(s);

    /* ── 4. 竖直：地面接得住就贴地，接不住就抛体 ── */
    var gp = this._gp;
    if (s.grounded) {
      this._groundPose(s, fx, fz, gp);
      // 当前位置的切向竖直速度要用中心差分（这一步与上一步的地面抬升量取平均）。
      // 用后向差分会滞后半步：一步内重力只让车落下 ½g·dt² ≈ 0.06 mm，这点滞后足以把判据从 v²κ>g 变成 v²κ>g/2。
      var fd = gp.y - s.y, fdPrev = s.fdPrev === null ? fd : s.fdPrev;
      var vyTan = hopped ? s.vy : 0.5 * (fd + fdPrev) / dt;    // 主动跳：用带上冲量的速度
      var yFree = s.y + vyTan * dt - 0.5 * g * dt * dt;       // 若此刻腾空会到哪
      s.fdPrev = fd;
      if (hopped || yFree > gp.y + 1e-9) {                    // 主动起跳；或地面比自由落体掉得还快（v²κ > g）
        s.grounded = false; s.airTime = 0; s.apex = 0;
        s.takeoff = { x: s.x, z: s.z, y: gp.y, vy: vyTan, t: s.time };
        s.pitchRate = (gp.pitch - s.pitch) / dt;              // 角动量守恒：带着离地时的俯仰角速度
        s.pitch = gp.pitch;                                    // 俯仰角同步到新位置（否则空中会一直滞后一个步长）
        s.y = yFree; s.vy = vyTan - g * dt;
        ev.push({ type: 'takeoff', vy: s.takeoff.vy, v: s.v, hop: hopped });
      } else {
        s.vy = (1.5 * fd - 0.5 * fdPrev) / dt;                 // 贴地：竖直速度 = 当前位置的地形切向速度
        s.y = gp.y; s.pitch = gp.pitch;
      }
    } else {
      s.y += s.vy * dt - 0.5 * g * dt * dt; s.vy -= g * dt;
      s.airTime += dt;
      s.pitchRate += clamp(input.pitch || 0, -1, 1) * 0.8 * dt;   // 空中只能靠前后移重心改变俯仰
      s.pitch = clamp(s.pitch + s.pitchRate * dt, -1.2, 1.2);
      var agl = s.y - ter.height(s.x, s.z);
      if (agl > s.apex) s.apex = agl;
      var hw = K.WB / 2, cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
      this._groundPose(s, fx, fz, gp);
      // 以车体中心判定落地（连续极限下坡顶上前后轮同时离地，也同时落地）。逐轮判定会对俯仰外推的
      // 二阶误差 × 半轴距极敏感，刚离地就会被"后轮"拽回去；只在某轮真的扎进地面 2 cm 以上（机头触地）时才按轮判定。
      var penR = gp.wheelR - (s.y + K.WHEEL_R * cp - hw * sp);
      var penF = gp.wheelF - (s.y + K.WHEEL_R * cp + hw * sp);
      if (s.y <= gp.y + 1e-6 || penR > 0.02 || penF > 0.02) {
        var vyG = s.v * Math.sin(gp.pitch);
        var impact = Math.max(0, vyG - s.vy);
        var mismatch = Math.abs(wrapAngle(gp.pitch - s.pitch));
        var to = s.takeoff, jump = to ? this.gap(to.x, to.z, s.x, s.z) : 0;
        s.grounded = true; s.vy = vyG; s.y = gp.y; s.pitch = gp.pitch; s.pitchRate = 0; s.fdPrev = null;
        if (mismatch > 0.5 && impact > 0.8) s.v *= 0.72;        // 落地角度太差 → 失速
        var r = s.records;
        if (s.airTime > r.air) r.air = s.airTime;
        if (s.apex > r.apex) r.apex = s.apex;
        if (jump > r.jump) r.jump = jump;
        ev.push({ type: 'land', air: s.airTime, apex: s.apex, jump: jump, impact: impact, mismatch: mismatch, v: s.v, vy: to ? to.vy : 0 });
        s.takeoff = null;
        this._landingDust(s, fx, fz, impact);
      }
    }

    /* ── 5. 轮子与脚踏：接地时纯滚动 ω = v/R，空转/抱死除外 ── */
    if (s.grounded) {
      var w = s.v / K.WHEEL_R;
      var wR = s.skid ? 0 : w * (1 + Math.min(s.slip, 1.2) * 1.5);
      s.wheelR += wR * dt; s.wheelF += w * dt;
      s.crank += wR / K.GEAR * dt;
    } else {
      var crankW = s.cadence * 2 * Math.PI;
      s.crank += crankW * dt;
      var wFree = s.v / K.WHEEL_R;
      s.wheelR += Math.max(wFree, crankW * K.GEAR) * dt;         // 飞轮：空中蹬踏会带着后轮空转
      s.wheelF += wFree * dt;
    }

    /* ── 6. 接地副作用：月尘、车辙、岩石、知识牌 ── */
    if (s.grounded) { this._emitDust(s, fx, fz, dt); this._tracks(s, fx, fz); this._rocks(s, fx, fz); }
    this._stepDust(s, dt);
    this._checkPlaques(s);
    s.heightAGL = s.y - ter.height(s.x, s.z);
    if (s.v > s.records.speed) s.records.speed = s.v;
  };

  Bike.prototype._fall = function (cause, extra) {
    var s = this;
    s.state = 'down'; s.downT = 0; s.thudded = false; s.falls++;
    s.fallSide = Math.abs(s.lean) > 0.02 ? Math.sign(s.lean) : (this.rnd() < 0.5 ? -1 : 1);
    var e = { type: 'fall', cause: cause, v: s.v };
    if (extra) for (var k in extra) e[k] = extra[k];
    s.events.push(e);
  };

  Bike.prototype._stepDown = function (dt) {
    var s = this, g = s.g, ev = s.events;
    s.downT += dt;
    if (Math.abs(s.lean) < K.LEAN_GROUND) {                      // 继续倒：还是那根倒立摆，只是没人救
      s.leanRate += g * Math.sin(s.lean) / K.L_CM * dt;
      s.lean += s.leanRate * dt;
      if (Math.abs(s.lean) >= K.LEAN_GROUND) {
        s.lean = s.fallSide * K.LEAN_GROUND; s.leanRate = 0;
        if (!s.thudded) { s.thudded = true; ev.push({ type: 'thud', v: s.v }); }
      }
    }
    var fx = Math.cos(s.yaw), fz = -Math.sin(s.yaw);
    s.omega *= Math.exp(-dt * 1.5); s.yaw += s.omega * dt;
    s.v = Math.max(0, s.v - 0.45 * g * dt);                      // 倒地滑行：滑动摩擦 μk·g（地球的 1/6 → 滑得更远）
    s.x += fx * s.v * dt; s.z += fz * s.v * dt; s.dist += s.v * dt;
    this._wrap(s);
    this._groundPose(s, fx, fz, this._gp);
    s.y = this._gp.y; s.pitch = this._gp.pitch; s.vy = 0;
    s.steer *= Math.exp(-dt * 4);
    s.driveF = 0; s.slip = 0; s.skid = 0; s.cadence = 0;
    s.heightAGL = 0;
    if (s.thudded && s.v > 0.3) this._spray(s, fx, fz, dt);
    this._stepDust(s, dt);
    if (s.downT > 2.6) { s.state = 'getup'; s.getupT = 0; s.leanFrom = s.lean; }
  };

  Bike.prototype._stepGetup = function (dt) {
    var s = this;
    s.getupT += dt;
    var k = smoothstep(0, 1, s.getupT / 0.9);
    s.lean = s.leanFrom * (1 - k);
    s.v = 0; s.leanRate = 0; s.steer = 0; s.omega = 0; s.driveF = 0;
    this._stepDust(s, dt);
    if (s.getupT >= 0.9) { s.state = 'ride'; s.lean = 0; s.fdPrev = null; s.events.push({ type: 'getup' }); }
  };

  /* ── 月尘：每粒都是解析抛物线，落地即停 ── */
  Bike.prototype.spawnDust = function (x, y, z, vx, vy, vz, size) {
    var d = this.dust, g = this.g;
    if (d.n >= K.DUST_MAX || vy <= 0.05) return -1;
    var t = 2 * vy / g, disc;
    for (var k = 0; k < 2; k++) {                                 // 两次迭代求落点处地面高度
      var hl = this.terrain.height(x + vx * t, z + vz * t);
      disc = vy * vy + 2 * g * (y - hl);
      t = disc > 0 ? (vy + Math.sqrt(disc)) / g : 2 * vy / g;
    }
    var i = d.n++;
    d.x0[i] = x; d.y0[i] = y; d.z0[i] = z; d.vx[i] = vx; d.vy[i] = vy; d.vz[i] = vz;
    d.t[i] = 0; d.tl[i] = t; d.sz[i] = size;
    return i;
  };

  Bike.prototype._stepDust = function (s, dt) {
    var d = s.dust, g = s.g, i, n = d.n;
    for (i = 0; i < n; i++) {
      d.t[i] += dt;
      if (d.t[i] >= d.tl[i]) {                                   // 落地：换到末尾
        n--;
        d.x0[i] = d.x0[n]; d.y0[i] = d.y0[n]; d.z0[i] = d.z0[n];
        d.vx[i] = d.vx[n]; d.vy[i] = d.vy[n]; d.vz[i] = d.vz[n];
        d.t[i] = d.t[n]; d.tl[i] = d.tl[n]; d.sz[i] = d.sz[n];
        i--;
      }
    }
    d.n = n;
    for (i = 0; i < n; i++) {                                    // 位置 = 解析解，不是积分
      var t = d.t[i];
      d.px[i] = d.x0[i] + d.vx[i] * t;
      d.pz[i] = d.z0[i] + d.vz[i] * t;
      d.py[i] = d.y0[i] + d.vy[i] * t - 0.5 * g * t * t;
    }
  };

  Bike.prototype._emitDust = function (s, fx, fz, dt) {
    var inten = s.slip * 30 + (s.driveF > 0 && s.v < 5 ? s.driveF / K.F_LEG * 7 : 0)
              + s.skid * 38 * (s.v > 0.5 ? 1 : 0) + (s.slide && s.v > 2 ? 22 : 0) + (s.v > 3 ? 0.6 : 0);
    s.dustAcc += inten * dt;
    var n = Math.floor(s.dustAcc);
    s.dustAcc -= n;
    if (!n) return;
    var hw = K.WB / 2, rx = s.x - fx * hw, rz = s.z - fz * hw, gy = s.terrain.height(rx, rz) + 0.03;
    var side = s.slide ? -Math.sign(s.omega || 1) : 1;
    for (var k = 0; k < n && k < 40; k++) {
      var r1 = this.rnd(), r2 = this.rnd(), r3 = this.rnd();
      // 车轮把月尘向后上方甩出：速度 = 车速 + 切向甩出速度（真空中没有空气来改变它）
      var sp = (0.5 + 0.8 * r1) * (s.v * 0.5 + Math.min(s.slip, 1) * 5 + s.skid * 1.5 + (s.slide ? 1.2 : 0));
      var ang = 0.32 + 0.5 * r2, lat = (r3 - 0.5) * 0.5 * sp + (s.slide ? side * sp * 0.5 : 0);
      var back = sp * Math.cos(ang);
      this.spawnDust(rx, gy, rz, s.v * fx - fx * back - fz * lat, sp * Math.sin(ang), s.v * fz - fz * back + fx * lat, 0.5 + r1);
    }
  };

  Bike.prototype._landingDust = function (s, fx, fz, impact) {
    if (impact < 0.12) return;
    var n = Math.min(34, Math.round(4 + impact * 14)), hw = K.WB / 2, k, j;
    for (j = 0; j < 2; j++) {
      var wx = s.x + (j ? fx : -fx) * hw, wz = s.z + (j ? fz : -fz) * hw, wy = this.terrain.height(wx, wz) + 0.03;
      for (k = 0; k < n; k++) {                                  // 落地：一圈薄薄的放射状沙帘
        var a = this.rnd() * 6.2832, sp = (0.4 + 1.1 * this.rnd()) * (0.5 + impact * 0.9);
        var ca = Math.cos(a), sa = Math.sin(a);
        this.spawnDust(wx, wy, wz, s.v * fx * 0.7 + ca * sp, sp * (0.2 + 0.3 * this.rnd()), s.v * fz * 0.7 + sa * sp, 0.6 + this.rnd() * 0.8);
      }
    }
  };

  Bike.prototype._spray = function (s, fx, fz, dt) {
    s.dustAcc += 26 * dt;
    var n = Math.floor(s.dustAcc); s.dustAcc -= n;
    var side = s.fallSide, latX = -fz * side, latZ = fx * side;     // 倒地一侧的侧向
    for (var k = 0; k < n && k < 12; k++) {
      var r = this.rnd(), x = s.x + (this.rnd() - 0.5) * 2 * latX, z = s.z + (this.rnd() - 0.5) * 2 * latZ;
      var sp = 0.5 + 1.4 * this.rnd();
      this.spawnDust(x, this.terrain.height(x, z) + 0.03, z, s.v * fx * 0.8 + latX * sp, sp * (0.3 + 0.4 * r), s.v * fz * 0.8 + latZ * sp, 0.8 + r);
    }
  };

  Bike.prototype._pushTrack = function (s, side, x, z, skid) {
    var last = s.trackLast[side];
    if (last) { var dx = x - last.x, dz = z - last.z; if (dx * dx + dz * dz < 0.0225) return; }
    s.trackLast[side] = { x: x, z: z };
    s.trackQueue.push({ side: side, x: x, z: z, skid: skid });
    if (s.trackQueue.length > 4000) s.trackQueue.splice(0, 2000);
  };

  Bike.prototype._tracks = function (s, fx, fz) {
    var hw = K.WB / 2;
    this._pushTrack(s, 'r', s.x - fx * hw, s.z - fz * hw, s.skid || s.slip > 0.05);
    this._pushTrack(s, 'f', s.x + fx * hw, s.z + fz * hw, false);
  };

  Bike.prototype._checkPlaques = function (s) {
    var pl = this.terrain.plaques;
    for (var k = 0; k < pl.length; k++) {
      var p = pl[k];
      if (p.found) continue;
      if (this.gap(p.x, p.z, s.x, s.z) < 4.5) {
        p.found = true; s.discovered[p.id] = true; s.foundCount++;
        s.events.push({ type: 'discover', id: p.id });
      }
    }
  };

  Bike.prototype._rocks = function (s, fx, fz) {
    var list = this.terrain.rocksNear(s.x, s.z, 2.4), hw = K.WB / 2;
    for (var k = 0; k < list.length; k++) {
      var rk = list[k];
      if (rk.r < 0.3 || rk.hitUntil > s.time) continue;
      for (var j = 0; j < 2; j++) {
        var wx = s.x + (j ? fx : -fx) * hw, wz = s.z + (j ? fz : -fz) * hw;
        var dx = wx - rk.x, dz = wz - rk.z, t = this.tile;
        if (isFinite(t)) { dx -= t * Math.floor(dx / t + 0.5); dz -= t * Math.floor(dz / t + 0.5); }
        if (dx * dx + dz * dz < (rk.r + 0.1) * (rk.r + 0.1)) {
          rk.hitUntil = s.time + 1.5;
          if (rk.r >= 0.55) {                                    // 大石块：低速顶停，高速低速重力下慢慢倒
            if (s.v > 2.2) this._fall('rock', { r: rk.r });
            else { s.v = 0; s.events.push({ type: 'bump', r: rk.r, stop: true }); }
          } else {                                               // 小石块：当跳台颠一下
            s.vy += 0.35 + rk.r * 1.6; s.v *= 0.86;
            s.events.push({ type: 'bump', r: rk.r });
          }
          return;
        }
      }
    }
  };

  Bike.prototype.drain = function () { var e = this.events; this.events = []; return e; };

  /* ═══════════════ 自动驾驶：鹈鹕自己骑 ═══════════════ */
  function Autopilot(bike) {
    this.bike = bike;
    this.rnd = T.mulberry32(99);
    this.timer = 0; this.best = 0; this.hopTimer = 16 + this.rnd() * 8;
    this.goal = -1; this.foundSeen = bike.foundCount; this.planCost = 0; this.err = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, pitch: 0, handsOff: false };
  }
  Autopilot.prototype.reset = function () { this.timer = 0; this.best = 0; this.goal = -1; };
  function g0(b) { return b.g; }

  Autopilot.prototype.decide = function (dt) {
    var b = this.bike, inp = this.input, pl = b.terrain.plaques || [];
    inp.hop = false; inp.handsOff = false; inp.pitch = 0;
    if (b.state !== 'ride') return inp;

    // 腾空时用重心控制俯仰，让车对准落点坡度（落地角度差太大会失速）
    if (!b.grounded && b.airTime > 0.08) {
      var tt = b.time, fall = 2 * Math.max(b.vy, 0) / g0(b) , look = Math.min(14, Math.max(2, b.v * fall * 0.6));
      var tg = b._g; b.terrain.grad(b.x + Math.cos(b.yaw) * look, b.z - Math.sin(b.yaw) * look, tg);
      var pitchTerr = Math.atan(tg.gx * Math.cos(b.yaw) - tg.gz * Math.sin(b.yaw));
      inp.pitch = clamp((pitchTerr - b.pitch) * 2.2 - b.pitchRate * 1.2, -1, 1);
      return inp;
    }

    // 目标：最近的未发现知识牌；全找到后朝营地骑
    var bestD = 1e18, goal = null, k;
    for (k = 0; k < pl.length; k++) if (!pl[k].found) { var dd = b.gap(pl[k].x, pl[k].z, b.x, b.z); if (dd < bestD) { bestD = dd; goal = pl[k]; } }
    if (!goal) { var camp = T.CAMP; if (b.gap(camp.x, camp.z, b.x, b.z) > 380) goal = camp; }
    this.goal = goal;

    this.timer -= dt; this.hopTimer -= dt;
    if (b.foundCount !== this.foundSeen) { this.foundSeen = b.foundCount; this.hopTimer = 0.9; }   // 发现新牌：庆祝一跳
    if (this.timer <= 0) { this.timer = 0.2; this.planCost = this._plan(goal); }

    var v = Math.max(b.v, 0.6), g = b.g, err = this.best;
    var lim = g * Math.tan(K.LEAN_AP) / v;                        // 倾角上限对应的转向率
    var goalD = 1e9, rockDanger = 0;
    if (goal) {                                                   // 最后逼近：低速才转得进判定圈
      goalD = b.gap(goal.x, goal.z, b.x, b.z);
      if (goalD < 46) {
        var gx2 = goal.x - b.x, gz2 = goal.z - b.z, t2 = b.tile;
        if (isFinite(t2)) { gx2 -= t2 * Math.floor(gx2 / t2 + 0.5); gz2 -= t2 * Math.floor(gz2 / t2 + 0.5); }
        err = wrapAngle(Math.atan2(-gz2, gx2) - b.yaw);             // 直接朝目标：这段会把速度压到不会起跳
        var bx = Math.cos(b.yaw), bz = -Math.sin(b.yaw), near = b.terrain.rocksNear ? b.terrain.rocksNear(b.x, b.z, 52) : [];
        var rockDanger = 0;
        for (k = 0; k < near.length; k++) {                        // 但走廊里有大石块还是得让开
          var rk = near[k]; if (rk.r < 0.45) continue;
          var qx = rk.x - b.x, qz = rk.z - b.z;
          if (isFinite(t2)) { qx -= t2 * Math.floor(qx / t2 + 0.5); qz -= t2 * Math.floor(qz / t2 + 0.5); }
          var along = qx * bx + qz * bz, lat = -(qx * bz - qz * bx);   // lat > 0：石块在右侧
          // 月面转弯半径大、刹车又弱：石块要在 50 m 外就开始让，30 m 内进走廊就得减速到转得动的速度
          var margin = 2.6 + along * 0.1;
          if (along > 1 && along < 50 && Math.abs(lat) < margin) {
            var wgt = 1 - Math.abs(lat) / margin;
            err += Math.sign(lat || 1) * 1.2 * wgt;
            if (along < 32) rockDanger = Math.max(rockDanger, wgt);
          }
        }
        err = clamp(err, -1.2, 1.2);
      }
    }
    var omega = clamp((err - b.omega * 0.6) * 1.2, -lim, lim);      // 前视阻尼：减去正在转的量，防超调
    inp.steer = clamp(Math.atan(-omega * v / g) / K.LEAN_MAX, -1, 1);
    // 先扶正再转向：车身带着明显的倾角角速度时（比如刚落地、正在回正），别的都先放一放
    if (Math.abs(b.leanRate) > 0.09 || Math.abs(b.lean) > 0.3) inp.steer = 0;
    var target = Math.abs(err) > 0.8 ? 4.4 : 5.8;
    if (Math.abs(b.leanRate) > 0.06) target = Math.min(target, 4.0);   // 正在做动作就别飞起来：空中角动量守恒，没法修正姿态
    if (this.planCost > 8) target = Math.min(target, 4.2);
    if (goalD < 70) target = Math.min(target, 2.8);                 // 逼近阶段慢蹭：2.8 m/s 冲下坑沿也起跳（v²κ < g），转弯半径也只有 14 m
    if (rockDanger > 0.15) target = Math.min(target, 2.4);           // 前方石块躲不太开：月面刹车弱，先慢下来
    // 月面刹车很弱：允许速度要能及时刹下来；同时转弯半径 v²/(g·tanφ) 必须小于目标距离，否则会绕着目标转圈
    var allow = Math.min(Math.sqrt(2.2 * 2.2 + 2 * (brakeDecel(g) + K.CRR * g) * Math.max(goalD - 11, 0)),
                         Math.sqrt(1 + g * Math.tan(K.LEAN_AP) * 0.5 * Math.max(goalD - 3, 0.5)));      // 转弯半径 ≤ 目标距离的一半
    target = Math.min(target, allow);
    var want = v < target - 0.2 ? 1 : (v < target ? 0.5 : 0);
    // 低速时腿力（90 N）超过后轮抓地（约 60 N）。老手不会一上来就把轮蹬空：踏板力压到抓地的 85% 以内
    var kRear = K.K_REAR * Math.cos(b.pitch) + (K.H_CM / K.WB) * Math.sin(b.pitch);
    var fMax = 0.85 * K.MU * K.MASS * g * Math.max(kRear, 0.04) / (1 - K.MU * K.H_CM / K.WB);
    inp.throttle = Math.min(want, fMax / Math.min(K.POWER / Math.max(v, 0.6), K.F_LEG));
    inp.brake = v > target + 0.3 ? 0.8 : (this.planCost > 14 && v > 3 ? 0.8 : 0);     // 0.8 以内：不到抱死
    if (b.grounded && this.hopTimer <= 0 && !this.noHop) {              // noHop：玩家手动时不许自动驾驶自己跳
      if (v >= 5.0 && Math.abs(err) < 0.12 && this.planCost < 2) { b.hop(); this.hopTimer = 22 + this.rnd() * 18; }
      else if (this.hopTimer < -6) this.hopTimer = 2;
    }
    return inp;
  };

  Autopilot.prototype._plan = function (goal) {
    var b = this.bike, g = b._g, ter = b.terrain;
    var gx = 0, gz = 0, hasGoal = false;
    if (goal) {
      var dx = goal.x - b.x, dz = goal.z - b.z, t = b.tile;
      if (isFinite(t)) { dx -= t * Math.floor(dx / t + 0.5); dz -= t * Math.floor(dz / t + 0.5); }
      var L = Math.sqrt(dx * dx + dz * dz);
      if (L > 10) { gx = dx / L; gz = dz / L; hasGoal = true; }
    }
    var rocks = [], k;
    if (ter.rocksNear) {
      var all = ter.rocksNear(b.x, b.z, 56);
      for (k = 0; k < all.length; k++) if (all[k].r >= 0.45) rocks.push(all[k]);
    }
    var h0 = ter.height(b.x, b.z), best = 0, bestCost = 1e9, a, j;
    this.goalNear = !!goal && b.gap(goal.x, goal.z, b.x, b.z) < 90;
    for (a = -1.05; a <= 1.051; a += 0.15) {                     // 候选航向 ±60°，左为正
      var ca = Math.cos(b.yaw + a), sa = -Math.sin(b.yaw + a);
      var cost = Math.abs(a) * 0.25;
      if (hasGoal) cost += Math.acos(clamp(ca * gx + sa * gz, -1, 1)) * (this.goalNear ? 2.6 : 2.0);
      // 低重力下 14° 以内的坡随便骑，只躲更陡的、深坑、和会把自己抛起来的凸起（坑沿）：
      // 沿射线每 2 m 取高度，二阶差分 < −0.16 m 意味着曲率 > 0.04 /m，巡航 6 m/s 时 v²κ > g 会起跳
      var hPrev2 = h0, hPrev1 = ter.height(b.x + ca * 2, b.z + sa * 2), hx = hPrev1;
      for (j = 2; j <= 20; j++) {
        var d = j * 2, px = b.x + ca * d, pz = b.z + sa * d, h = ter.height(px, pz);
        ter.grad(px, pz, g);
        var d2 = hPrev2 - 2 * hPrev1 + h, steep = Math.max(0, Math.hypot(g.gx, g.gz) - 0.38);
        // 22° 以内的坡在月面上随便骑（抓地极限 31°），接近极限才陡增；否则规划器会沿着坑壁等高线绕圈不出去
        cost += (steep * steep * 220 + Math.max(0, h0 - h - 8) * 0.15 + Math.max(0, h - h0 - 30) * 0.1) * 0.4 / (1 + d * 0.03);
        if (d2 < -0.16) cost += (-d2 - 0.16) * 3.5 / (1 + d * 0.03);
        hPrev2 = hPrev1; hPrev1 = h;
      }
      for (k = 0; k < rocks.length; k++) {                       // 走廊里的大石块
        var rk = rocks[k], rx = rk.x - b.x, rz = rk.z - b.z, tt = b.tile;
        if (isFinite(tt)) { rx -= tt * Math.floor(rx / tt + 0.5); rz -= tt * Math.floor(rz / tt + 0.5); }
        var along = rx * ca + rz * sa;
        if (along > 1 && along < 54) cost += 60 * Math.max(0, 1 - Math.abs(rx * sa - rz * ca) / (2.4 + along * 0.1));
      }
      if (cost < bestCost) { bestCost = cost; best = a; }
    }
    this.best = best;
    return bestCost;
  };

  /* HUD / 测试用的快照 */
  Bike.prototype.snapshot = function () {
    var s = this;
    return {
      x: s.x, y: s.y, z: s.z, yaw: s.yaw, v: s.v, vy: s.vy, lean: s.lean, steer: s.steer, pitch: s.pitch,
      grounded: s.grounded, air: s.airTime, apex: s.apex, heightAGL: s.heightAGL, dist: s.dist,
      state: s.state, handsOff: s.handsOff, slip: s.slip, skid: s.skid, slide: s.slide,
      cadence: s.cadence, driveF: s.driveF, found: s.foundCount, dust: s.dust.n,
      records: JSON.parse(JSON.stringify(s.records))
    };
  };

  return {
    K: K, Bike: Bike, Autopilot: Autopilot, sky: sky, DEFAULT_PHASE: DEFAULT_PHASE, DAY: DAY, EARTH_DIR: EARTH_DIR, EARTH_AZ: EARTH_AZ,
    ratio: ratio, brakeDecel: brakeDecel, brakeDistance: brakeDistance, coastDistance: coastDistance, coastTime: coastTime,
    turnRadius: turnRadius, steadyLean: steadyLean, jumpStats: jumpStats, development: development,
    pendulumTime: pendulumTime, fallTime: fallTime, minBalanceSpeed: minBalanceSpeed, horizonDistance: horizonDistance,
    clamp: clamp, lerp: lerp, smoothstep: smoothstep
  };
});
