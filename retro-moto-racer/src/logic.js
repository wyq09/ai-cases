/* retro-moto-racer — logic.js  伪 3D 竞速纯逻辑（赛道生成/物理/AI/名次/检查点/托管模拟）
 * 纯逻辑无 DOM/audio 依赖，node 可直接 require。
 * 常量与算法对齐 Jake Gordon javascript-racer（segLen=200 / fov=100 / drawDist=300 / centrifugal）
 * 规则对齐 Super Hang-On：280km/h 顶速、氮气 ×1.15(→322)、检查点计时延长、12 人排名。
 */
(function () {
  var G = (typeof window !== 'undefined') ? window : global;
  var RM = G.RM = G.RM || {};

  // ---------- 常量 ----------
  var SEG_LEN = 200, RUMBLE_LEN = 3, ROAD_W = 2000;
  var FOV = 100, CAM_H = 1000, DRAW_DIST = 300, FOG_D = 4, CENTRIF = 0.22;
  var MAX_SPEED = SEG_LEN * 60;            // 12000 u/s → 表显 280
  var ACCEL = MAX_SPEED / 6, BRAKE = -MAX_SPEED / 2.2, DECEL = -MAX_SPEED / 8;
  var OFF_DECEL = -MAX_SPEED / 1.8, OFF_LIMIT = MAX_SPEED / 4;
  var NITRO_MULT = 1.15, NITRO_BURN = 28, NITRO_FILL = 3, NITRO_DRAFT = 9, NITRO_CP = 40;
  var KMH = 280 / MAX_SPEED;
  var CAM_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
  var PLAYER_Z = CAM_H * CAM_DEPTH;

  var DIFF = { easy: 0.94, normal: 1, hard: 1.035 };
  // 11 个对手梯队（×玩家极速比例），前快后慢；弯道减速后再打 8~9 折 ≈ 均速 0.65~0.84
  var TIERS = [0.955, 0.945, 0.905, 0.885, 0.865, 0.845, 0.825, 0.805, 0.785, 0.765, 0.745];
  var COLORWAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; //对手色 idx（0=玩家红）

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); }
  function easeOut(a, b, p) { return a + (b - a) * (1 - Math.pow(1 - p, 2)); }
  function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }
  function increase(v, dv, max) { var r = v + dv; while (r >= max) r -= max; while (r < 0) r += max; return r; }

  var L = {
    SEG_LEN: SEG_LEN, ROAD_W: ROAD_W, RUMBLE_LEN: RUMBLE_LEN, DRAW_DIST: DRAW_DIST,
    FOG_D: FOG_D, CENTRIF: CENTRIF, MAX_SPEED: MAX_SPEED, CAM_H: CAM_H,
    CAM_DEPTH: CAM_DEPTH, PLAYER_Z: PLAYER_Z, KMH: KMH,
    NITRO_MULT: NITRO_MULT, DIFF: DIFF, COLORWAYS: COLORWAYS,

    clamp: clamp, easeIn: easeIn, easeOut: easeOut, easeInOut: easeInOut,
    mulberry32: mulberry32,
    kmh: function (v) { return Math.round(v * KMH); },
    findSegIdx: function (z, n) { return Math.floor(z / SEG_LEN) % n; },

    // ---------- 赛道构建 ----------
    buildTrack: function (stage, seed) {
      var rnd = mulberry32(seed * 7919 + stage * 131 + 17);
      var segs = [];
      function lastY() { return segs.length ? segs[segs.length - 1].p2.world.y : 0; }
      function addSegment(curve, y) {
        var n = segs.length;
        segs.push({
          index: n, curve: curve,
          p1: { world: { x: null, y: lastY(), z: n * SEG_LEN }, camera: {}, screen: {} },
          p2: { world: { x: null, y: y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
          color: Math.floor(n / RUMBLE_LEN) % 2 ? 'dark' : 'light',
          props: [], clip: 0, fog: 1, looped: false
        });
      }
      function addRoad(enter, hold, leave, curve, y) {
        var startY = lastY(), endY = startY + y * SEG_LEN, total = enter + hold + leave;
        var n;
        for (n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
        for (n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
        for (n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
      }
      var LEN = { S: 26, M: 52, L: 104 };
      var HILL = { L: 20, M: 40, H: 60 };
      var CURVE = { E: 2, M: 4, H: 6 };
      function sCurves() {
        addRoad(LEN.M, LEN.M, LEN.M, -CURVE.E, 0);
        addRoad(LEN.M, LEN.M, LEN.M, CURVE.M, HILL.M);
        addRoad(LEN.M, LEN.M, LEN.M, CURVE.E, -HILL.L);
        addRoad(LEN.M, LEN.M, LEN.M, -CURVE.E, HILL.M);
        addRoad(LEN.M, LEN.M, LEN.M, -CURVE.M, -HILL.M);
      }
      // 各关节奏：0 落日(温和) 1 暮色(多中弯) 2 夜路(急弯+起伏)
      addRoad(LEN.M, LEN.L, LEN.M, 0, 0);                                    // 起步大直道
      if (stage === 0) {
        addRoad(LEN.M, LEN.M, LEN.M, CURVE.E, HILL.L);
        addRoad(LEN.S, LEN.S, LEN.S, 0, -HILL.L);
        sCurves();
        addRoad(LEN.L, LEN.L, LEN.M, 0, 0);                                  // 氮气直道
        addRoad(LEN.M, LEN.L, LEN.M, -CURVE.M, HILL.M);
        addRoad(LEN.M, LEN.M, LEN.M, CURVE.M, -HILL.M);
        addRoad(LEN.S, LEN.S, LEN.S, -CURVE.E, 0);
      } else if (stage === 1) {
        addRoad(LEN.M, LEN.L, LEN.M, CURVE.M, HILL.M);
        sCurves();
        addRoad(LEN.M, LEN.L, LEN.M, -CURVE.H, -HILL.L);
        addRoad(LEN.M, LEN.M, LEN.M, 0, HILL.L);
        addRoad(LEN.M, LEN.L, LEN.M, CURVE.M, -HILL.M);
        addRoad(LEN.M, LEN.M, LEN.M, -CURVE.M, 0);
      } else {
        addRoad(LEN.M, LEN.M, LEN.M, -CURVE.M, HILL.H);
        addRoad(LEN.S, LEN.M, LEN.S, CURVE.H, 0);
        addRoad(LEN.M, LEN.M, LEN.M, 0, -HILL.M);
        addRoad(LEN.M, LEN.L, LEN.M, -CURVE.H, HILL.L);
        addRoad(LEN.L, LEN.L, LEN.M, 0, 0);                                  // 氮气直道
        addRoad(LEN.M, LEN.M, LEN.M, CURVE.M, -HILL.L);
      }
      // 收尾：归零海拔 + 冲线直道
      var endY = lastY();
      addRoad(LEN.M, LEN.M, LEN.M, -CURVE.E, -endY / SEG_LEN / 3);
      addRoad(LEN.M, LEN.L, LEN.S, 0, -(lastY() / SEG_LEN));                  // 归零
      addRoad(LEN.S, LEN.S, LEN.S, 0, 0);
      var finishIdx = segs.length;                                            // 终点拱门段
      addRoad(40, 40, 40, 0, 0);                                              // 冲线后缓冲道

      // 检查点：全程 1/3、2/3 处
      var cps = [Math.floor(finishIdx / 3), Math.floor(finishIdx * 2 / 3)];
      var total = segs.length;

      // 路旁道具（种子确定性）
      function addProps() {
        for (var i = 24; i < total - 30; i += 6 + Math.floor(rnd() * 14)) {
          var seg = segs[i], r = rnd(), side = rnd() < 0.5 ? -1 : 1;
          if (r < 0.34) seg.props.push({ id: 'cactus', off: side * (1.35 + rnd() * 1.2) });
          else if (r < 0.58) seg.props.push({ id: 'rock', off: side * (1.4 + rnd() * 1.6) });
          else if (r < 0.78) seg.props.push({ id: 'bush', off: side * (1.25 + rnd() * 1.5) });
          else if (r < 0.88) seg.props.push({ id: 'sign', off: side * 1.5 });
          else if (r < 0.94) { // 弯道口桶排（路缘外侧，可撞）
            var k;
            for (k = 0; k < 3; k++) segs[clamp(i + k * 2, 0, total - 1)].props.push({ id: 'barrel', off: side * 1.18, solid: true });
            if (Math.abs(seg.curve) > 0.01) seg.props.push({ id: 'sign', off: -side * 1.45 });
          } else if (stage === 2) seg.props.push({ id: 'light', off: side * 1.5 });
        }
      }
      addProps();

      return { segs: segs, len: finishIdx * SEG_LEN, n: total, cps: cps, stage: stage, seed: seed };
    },

    // ---------- 新比赛 ----------
    // opts: {startPos(1..12), difficulty, startRank}
    newRace: function (stage, opts) {
      opts = opts || {};
      var track = L.buildTrack(stage, 41 + stage * 100);
      var diff = DIFF[opts.difficulty] || 1;
      var riders = [];
      var i, rank = opts.startRank || 8;
      for (i = 0; i < 12; i++) {
        var isP = i === rank - 1;
        riders.push({
          id: i, isPlayer: isP, colorway: isP ? 0 : COLORWAYS[(i + (i >= rank - 1 ? 1 : 0)) % 11],
          skill: isP ? 1 : TIERS[i < rank - 1 ? i : i - 1] * diff,
          z: 0, x: 0, speed: 0, dist: 0, targetX: 0, wobbleT: 0, phase: rnd0(i),
          finishTime: 0
        });
      }
      // 发车格：名次越前越靠前，两列排布，玩家第 rank 位
      var order = riders.slice().sort(function (a, b) { return gridOrder(a, rank) - gridOrder(b, rank); });
      for (i = 0; i < 12; i++) {
        var row = Math.floor(i / 2), col = i % 2 ? 1 : -1;
        order[i].z = 8 * SEG_LEN + row * 2.6 * SEG_LEN;
        order[i].x = col * 0.5;
        order[i].targetX = order[i].x;
        order[i].dist = -row * 2.6 * SEG_LEN;  // 起步越靠前里程越靠前
      }
      function gridOrder(r, rk) { return r.isPlayer ? rk - 1 : (r.id < rk - 1 ? r.id : r.id + 1); }
      function rnd0(i) { return (i * 2654435761 >>> 0) % 1000 / 1000; }

      return {
        stage: stage, track: track, segs: track.segs, n: track.n,
        z: order[rank - 1].z, playerX: order[rank - 1].x * 0.6, speed: 0,
        nitro: 60, nitroOn: false,
        time: 0, timeLeft: 50, cpNext: 0,
        cpTime: opts.cpTime || 18, nitroFillMul: opts.nitroFill || 1,
        riders: riders, player: riders[rank - 1],
        stamina: 100, condition: 100,
        rank: rank, events: [], phase: 'countdown', phaseT: 0,
        stageTimes: [], stageT: 0, curveNow: 0, speedPct: 0,
        difficulty: opts.difficulty || 'normal', bumpT: 0, steerLean: 0
      };
    },

    // ---------- 检查点/时间 ----------
    cpTime: function (race) { return (race && race.cpTime) || 18; },

    // ---------- 玩家步进 ----------
    stepPlayer: function (race, input, dt) {
      var ev = race.events, track = race.track, segs = race.segs;
      var p = race.player, pos = race.z;
      var segIdx = L.findSegIdx(pos, race.n);
      var seg = segs[segIdx];
      var speedPct = race.speed / MAX_SPEED;
      race.speedPct = speedPct;

      // 氮气
      var wantN = input.nitro && race.nitro > 0.5 && race.phase === 'racing';
      race.nitroOn = wantN;
      if (wantN) { race.nitro = Math.max(0, race.nitro - NITRO_BURN * dt); }

      // 速度
      var top = MAX_SPEED * (wantN ? NITRO_MULT : 1) * race.condMul;
      if (race.phase === 'racing' || race.phase === 'stagewin') {
        if (input.brake) race.speed += BRAKE * dt;
        else if (input.throttle) race.speed += ACCEL * dt;
        else race.speed += DECEL * dt;
        // 离路
        var off = Math.abs(race.playerX) > 1.02;
        if (off) {
          if (race.speed > OFF_LIMIT) race.speed += OFF_DECEL * dt;
          race.stamina = Math.max(0, race.stamina - 6 * dt);
          if (Math.abs(seg.curve) > 0.5 && race.speed > MAX_SPEED * 0.3) race.speed += OFF_DECEL * 0.6 * dt;
          ev.push({ t: 'offroad' });
        } else {
          race.stamina = Math.min(100, race.stamina + 1.6 * dt);
        }
        // 吸尾流
        var draft = false, i, r;
        for (i = 0; i < race.riders.length; i++) {
          r = race.riders[i]; if (r.isPlayer) continue;
          var dz = r.z - pos;
          if (dz > 60 && dz < 2.2 * SEG_LEN && Math.abs(r.x - race.playerX) < 0.36) { draft = true; break; }
        }
        if (draft && !off) race.nitro = Math.min(100, race.nitro + NITRO_DRAFT * dt);
        else race.nitro = Math.min(100, race.nitro + NITRO_FILL * (race.nitroFillMul || 1) * dt);
        if (race.speed > top) race.speed += DECEL * 1.6 * dt;
        race.speed = clamp(race.speed, 0, MAX_SPEED * NITRO_MULT * 1.02);
      } else {
        race.speed = Math.max(0, race.speed + DECEL * 2 * dt);
      }
      // 转向：输入 + 离心力（转向权限 2.4 > 离心 2.4*CENTRIF*|curve|，HARD 弯满速仍需收油）
      var dx = dt * 2.4 * speedPct;
      if (race.phase === 'racing' || race.phase === 'stagewin') {
        race.playerX += input.steer * dx;
        race.steerLean += ((input.steer * (0.4 + 0.6 * speedPct)) - race.steerLean) * Math.min(1, dt * 9);
        race.playerX -= dx * speedPct * seg.curve * CENTRIF;
      } else race.steerLean *= Math.max(0, 1 - dt * 6);
      race.playerX = clamp(race.playerX, -2.4, 2.4);
      race.curveNow = seg.curve;

      // 里程推进
      race.z += race.speed * dt;
      p.dist += race.speed * dt;
      race.stageT += dt; race.time += dt;

      // 撞桶（离路侧的 solid 桶，路缘附近）
      if (race.phase === 'racing' && Math.abs(race.playerX) > 0.82) {
        var hit = seg.props, j;
        for (j = 0; j < hit.length; j++) {
          if (hit[j].solid && Math.abs(hit[j].off - race.playerX) < 0.22) {
            race.speed *= 0.55; race.condition = Math.max(0, race.condition - 3);
            race.bumpT = 0.5;
            ev.push({ t: 'barrel', x: race.playerX });
            break;
          }
        }
      }
      // 顶到对手（伤害带 0.5s 冷却，防磨蹭连环扣）
      if (race.phase === 'racing' || race.phase === 'stagewin') {
        var k, o;
        for (k = 0; k < race.riders.length; k++) {
          o = race.riders[k]; if (o.isPlayer) continue;
          var dz2 = o.z - pos;
          if (dz2 > -SEG_LEN * 0.4 && dz2 < SEG_LEN * 1.2 && Math.abs(o.x - race.playerX) < 0.27) {
            if (race.speed > o.speed) {
              race.speed = Math.max(o.speed * 0.92, MAX_SPEED * 0.1);
              o.speed *= 1.02;
            }
            var push = (race.playerX < o.x ? -1 : 1) * 0.14;
            race.playerX += push; o.x -= push * 0.6; o.wobbleT = 0.6;
            if (race.bumpT <= 0) {
              race.condition = Math.max(0, race.condition - 4);
              race.stamina = Math.max(0, race.stamina - 4);
              race.bumpT = 0.5;
              ev.push({ t: 'bump', x: race.playerX });
            }
          }
        }
      }
      // 车况影响极速
      race.condMul = race.condition < 20 ? 0.85 : (race.condition < 40 ? 0.92 : 1);

      // 检查点
      if (race.cpNext < track.cps.length && race.z >= track.cps[race.cpNext] * SEG_LEN) {
        race.cpNext++;
        race.timeLeft += L.cpTime(race);
        race.nitro = Math.min(100, race.nitro + NITRO_CP);
        race.condition = Math.min(100, race.condition + 10);
        ev.push({ t: 'checkpoint', n: race.cpNext });
      }
      // 过关（终点拱门稍前触发，滚动进入缓冲道）
      if (race.phase === 'racing' && race.z >= track.len - 2 * SEG_LEN) {
        race.phase = 'stagewin'; race.phaseT = 0;
        race.stageTimes.push(race.stageT);
        ev.push({ t: 'stagewin' });
      }
      // 时间耗尽
      if (race.phase === 'racing') {
        race.timeLeft -= dt;
        if (race.timeLeft <= 0) { race.timeLeft = 0; race.phase = 'timeup'; race.phaseT = 0; ev.push({ t: 'timeup' }); }
      }
      if (race.bumpT > 0) race.bumpT -= dt;
      return ev;
    },

    // ---------- AI 步进 ----------
    stepAI: function (race, dt) {
      var i, r, pos = race.z, pd = race.player.dist;
      var curveAhead = race.segs[L.findSegIdx(race.player.z + SEG_LEN * 6, race.n)].curve;
      for (i = 0; i < race.riders.length; i++) {
        r = race.riders[i]; if (r.isPlayer) continue;
        if (race.phase === 'countdown') { r.speed = 0; continue; }
        var seg = race.segs[L.findSegIdx(r.z, race.n)];
        // 巡航目标速：技术 × 弯道减速 × 呼吸噪声 × 橡皮筋
        var tgt = MAX_SPEED * r.skill;
        tgt *= 1 - Math.min(0.24, Math.abs(seg.curve) * 0.028 * (1.7 - r.skill));
        tgt *= 0.985 + 0.03 * Math.sin(race.time * 0.35 + r.phase * 7);
        if (race.cfgRubber !== false) {
          var gapD = r.dist - pd;
          if (gapD > 4000) tgt *= 0.95; else if (gapD > 1500) tgt *= 0.98;
          else if (gapD < -2000) tgt *= 1.025;
        }
        r.speed += clamp(tgt - r.speed, -ACCEL * dt, ACCEL * 0.85 * dt);
        // 前方受阻变线
        var blocked = null, j, o;
        for (j = 0; j < race.riders.length; j++) {
          o = race.riders[j]; if (o === r) continue;
          var dz = o.z - r.z;
          if (dz > 0 && dz < SEG_LEN * 7 && Math.abs(o.x - r.x) < 0.34 && o.speed < r.speed * 0.98) { blocked = o; break; }
        }
        if (blocked) {
          if (r.targetX === r.x) r.targetX = clamp((r.x < 0 ? 0.45 : -0.45) + (Math.random() - 0.5) * 0.3, -0.85, 0.85);
        } else if (Math.abs(r.targetX - r.x) < 0.05) {
          r.targetX = clamp(r.x * 0.7 + (Math.random() - 0.5) * 0.5, -0.8, 0.8);
        }
        // 礼让：玩家贴后且同道，往反侧让 0.3
        var pdz = pos - r.z;
        if (pdz > 0 && pdz < SEG_LEN * 6 && Math.abs(race.playerX - r.x) < 0.42 && !r.yieldT) {
          r.yieldT = 1.2;
          r.targetX = clamp(r.x + (r.x >= race.playerX ? 0.32 : -0.32), -0.85, 0.85);
        }
        if (r.yieldT) r.yieldT -= dt;
        var lean = clamp((r.targetX - r.x) * 3, -1, 1);
        r.x += lean * dt * 1.5 * (r.speed / MAX_SPEED);
        r.x = clamp(r.x, -1.15, 1.15);
        r.z += r.speed * dt;
        r.dist += r.speed * dt;
        if (r.wobbleT > 0) r.wobbleT -= dt;
        // AI 检查点无操作；冲线记录
        if (race.phase === 'racing' && r.z >= race.track.len - 2 * SEG_LEN && !r.finishTime) r.finishTime = race.time;
      }
      return race.events;
    },

    // ---------- 名次 ----------
    rank: function (race) {
      var arr = race.riders.slice().sort(function (a, b) { return b.dist - a.dist; });
      var pr = 1, i;
      for (i = 0; i < arr.length; i++) { if (arr[i].isPlayer) pr = i + 1; arr[i].rankNow = i + 1; }
      race.rank = pr;
      return arr;
    },

    // ---------- 托管模拟（校准用；auto=1 演示同款车手） ----------
    autoDrive: function (race) {
      // 像样的托管车手：按前方曲率反解限速（转向权限恰好抗离心）+ 桶规避 + 直道氮气
      var sp = race.speed / MAX_SPEED;
      var steerSeg = race.segs[L.findSegIdx(race.z + SEG_LEN * 10, race.n)];
      var brakeSeg = race.segs[L.findSegIdx(race.z + SEG_LEN * 30, race.n)];
      var ac = Math.abs(brakeSeg.curve);
      var spMax = ac > 0.4 ? Math.min(1, 0.96 / Math.sqrt(CENTRIF * ac)) : 1;
      var brake = sp > spMax + 0.04;
      var steerAvoid = 0, k, j, s2, pr;
      for (k = 4; k <= 16; k += 4) {
        s2 = race.segs[L.findSegIdx(race.z + SEG_LEN * k, race.n)];
        for (j = 0; j < s2.props.length; j++) {
          pr = s2.props[j];
          if (pr.solid && Math.abs(pr.off - race.playerX) < 0.42) steerAvoid += (race.playerX < pr.off ? -1 : 1) * 0.6;
        }
      }
      var steer = clamp(-steerSeg.curve * sp * CENTRIF * 1.3 - race.playerX * 1.15 + steerAvoid, -1, 1);
      var nitro = Math.abs(steerSeg.curve) < 0.8 && sp > 0.6 && race.nitro > 30 && !steerAvoid;
      return { steer: steer, throttle: brake ? 0 : 1, brake: brake ? 1 : 0, nitro: nitro ? 1 : 0 };
    },
    stepSim: function (race, dt) { // 托管一帧（物理与 stepPlayer 完全同源）
      var inp = L.autoDrive(race);
      L.stepPlayer(race, inp, dt);
      L.stepAI(race, dt);
      race.events.length = 0;
      return inp;
    },
    simulate: function (stage, opts, seed) {
      opts = opts || {};
      var race = L.newRace(stage, { difficulty: opts.difficulty || 'normal', startRank: opts.startRank || 8 });
      race.phase = 'racing'; race.timeLeft = 999;
      var dt = 1 / 60, t = 0, steps = 0, endPhase = null, offTicks = 0, bumps = 0;
      while (steps++ < 60 * 180) {
        L.stepSim(race, dt); t += dt;
        if (race.phase === 'stagewin') { endPhase = 'stagewin'; break; }
        if (race.phase === 'timeup') { endPhase = 'timeup'; break; }
        if (race.events.length && race.events.some(function (e) { return e.t === 'bump'; })) bumps++;
      }
      return {
        phase: endPhase, time: race.stageT, rank: L.rank(race).rank !== undefined ? race.rank : race.rank,
        playerRank: race.rank, avg: race.player.dist / Math.max(0.01, race.stageT),
        topKmh: L.kmh(MAX_SPEED), bumps: bumps, nitro: Math.round(race.nitro),
        stamina: Math.round(race.stamina), condition: Math.round(race.condition)
      };
    }
  };

  RM.LOGIC = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})();
