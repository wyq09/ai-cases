/* enemy.js — 敌机 AI + Boss 弹幕 + 波次导演（弹幕游戏级手感版）
   难度标尺：新手第 1 关能过、第 10 关紧张、第 20 关靠养成。
   公平性铁律：不开屏幕外枪；入场 1s 内不开火；玩家死亡停火；Boss y ≤ H*0.35 不压出生点。 */
window.TF = window.TF || {};
TF.ENEMY = (function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ================= 敌机运动（sine/hover/dive/strafe/charge/enter + carrier 横穿） ================= */
  function move(e, dt, api) {
    e.t += dt;
    const sp = e.speed, W = api.W, H = api.H, p = api.player, rand = api.rand;
    switch (e.move) {

      case 'sine': { // 正弦俯冲：spawn 后设 e.phase 相位差 → 编队呈波浪
        e.y += sp * dt;
        e.x = e.x0 + Math.sin(e.t * 2.1 + e.phase) * Math.min(50, W * 0.12);
        e.tilt = Math.cos(e.t * 2.1 + e.phase) * 0.22;
        break;
      }

      case 'hover': { // 降到位 → 缓慢横移 + 偶发小幅换位
        if (e.ty === undefined) e.ty = 70 + rand() * 140;
        if (e.y < e.ty) { e.y += sp * dt; e.tilt = 0; break; }
        if (e.nx === undefined) { e.nx = e.x; e.reT = 2 + rand() * 2; }
        e.reT -= dt;
        if (e.reT <= 0) { e.reT = 2.8 + rand() * 2.6; e.nx = clamp(e.x + (rand() - 0.5) * 150, 36, W - 36); }
        const dx = clamp(e.nx - e.x, -1, 1);
        e.x = clamp(e.x + dx * sp * 0.5 * dt, 30, W - 30);
        e.y = e.ty + Math.sin(e.t * 1.3 + e.phase) * 7;
        e.tilt = clamp(dx * 0.18, -0.2, 0.2);
        break;
      }

      case 'dive': { // 悬停瞄准 0.35s（给玩家预判窗）→ 锁定方向加速俯冲
        if (!e.locked) {
          if (e.t < 0.35) { e.y += sp * 0.35 * dt; e.tilt = Math.sin(e.t * 28) * 0.035; }
          else {
            e.locked = true;
            const dx = p.x - e.x, dy = Math.max(40, p.y - e.y), d = Math.hypot(dx, dy) || 1;
            e.dirx = dx / d; e.diry = dy / d; e.dsp = sp * 1.35;
          }
        } else {
          e.dsp = Math.min(e.dsp + 640 * dt, sp * 2.55); // 俯冲加速
          e.x += e.dirx * e.dsp * dt; e.y += e.diry * e.dsp * dt;
          e.tilt = clamp(e.dirx * 0.4, -0.4, 0.4);
        }
        break;
      }

      case 'strafe': { // 降到位左右巡航 + 边界反弹
        if (e.ty === undefined) e.ty = 100 + rand() * 140;
        if (e.dir === undefined) e.dir = rand() < 0.5 ? -1 : 1; // 导演可预设 e.ty，dir 需独立初始化
        if (e.y < e.ty) { e.y += sp * dt; e.tilt = 0; break; }
        e.x += e.dir * sp * 1.05 * dt;
        if (e.x < 42) { e.x = 42; e.dir = 1; }
        else if (e.x > W - 42) { e.x = W - 42; e.dir = -1; }
        e.y = e.ty + Math.sin(e.t * 1.6 + e.phase) * 5;
        e.tilt = e.dir * 0.12;
        break;
      }

      case 'charge': { // 刺客：短暂停顿蓄力 → 加速撞向玩家（有限追踪，可被侧移甩开）
        if (!e.armed) {
          e.y += sp * 0.22 * dt;
          e.x += Math.sin(e.t * 34) * 9 * dt; // 蓄力微颤
          if (e.t > 0.55) {
            e.armed = true;
            const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
            e.dirx = dx / d; e.diry = dy / d; e.csp = sp * 0.85;
          }
        } else {
          e.csp = Math.min(e.csp + 880 * dt, sp * 1.25);
          if (e.t < 2.1 && !p.dead) { // 追踪有时限、转向速率有上限 → 侧移可甩开
            const want = Math.atan2(p.y - e.y, p.x - e.x);
            const cur = Math.atan2(e.diry, e.dirx);
            let d = want - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
            const na = cur + clamp(d, -1.9 * dt, 1.9 * dt);
            e.dirx = Math.cos(na); e.diry = Math.sin(na);
          }
          e.x += e.dirx * e.csp * dt; e.y += e.diry * e.csp * dt;
          e.tilt = clamp(e.dirx * 0.35, -0.35, 0.35);
        }
        break;
      }

      case 'enter': { // 执政官压场型：降到中场，缓慢游走施压
        if (e.ty === undefined) e.ty = clamp(H * 0.2 + rand() * 50, 110, 250);
        if (e.y < e.ty) { e.y += sp * 0.9 * dt; e.tilt = 0; break; }
        if (e.nx === undefined) { e.nx = e.x; e.reT = 1.2 + rand(); }
        e.reT -= dt;
        if (e.reT <= 0) { e.reT = 2.6 + rand() * 2.2; e.nx = 60 + rand() * (W - 120); }
        const dx = clamp(e.nx - e.x, -1, 1);
        e.x = clamp(e.x + dx * sp * 0.6 * dt, 44, W - 44);
        e.y = e.ty + Math.sin(e.t * 1.35 + e.phase) * 20;
        e.tilt = clamp(dx * 0.26, -0.28, 0.28);
        break;
      }

      case 'cross': { // 运输舰：侧面横穿（game 越界后自动回收）
        if (e.dir === undefined) e.dir = e.x < W / 2 ? 1 : -1;
        if (e.y0 === undefined) e.y0 = e.y;
        e.x += e.dir * sp * 1.15 * dt;
        e.y = e.y0 + Math.sin(e.t * 1.9) * 12;
        e.tilt = e.dir * 0.3;
        break;
      }

      default: e.y += sp * dt;
    }
  }

  /* ================= 敌机开火（按敌型差异化 + 0.2s 蓄力白闪提示） ================= */
  function fire(e, api) {
    const dt = api.dt, p = api.player;
    if (p.dead) return;                       // 玩家死亡停火
    if (e.t < 0.9 || e.y < 26) return;        // 入场 1s 内不开火；不开屏幕外枪
    // 执政官：环弹后的周期瞄准连射段（独立于 fireT 节奏）
    if (e.salvo > 0) {
      e.salvoT -= dt;
      if (e.salvoT <= 0) {
        e.salvoT = 0.12; e.salvo--;
        const a = Math.atan2(p.y - e.y, p.x - e.x) + (api.rand() - 0.5) * 0.05;
        api.ebul(e.x, e.y + e.size * 0.32, a, 188 * api.diff.spdK, { dmg: 12, kind: 'eb3', r: 5 });
      }
    }
    e.fireT -= dt;
    if (e.fireT <= 0.2 && e.fireT > 0) { e.flash = Math.max(e.flash, 0.05); return; } // 0.2s 蓄力提示（白闪）
    if (e.fireT > 0) return;
    e.fireT = e.fireEvery * (0.85 + api.rand() * 0.3);
    const aim = Math.atan2(p.y - e.y, p.x - e.x), spdK = api.diff.spdK, muz = e.y + e.size * 0.32;
    if (e.fire === 'aimed') {                 // 哨卫：单发瞄准
      api.ebul(e.x, muz, aim + (api.rand() - 0.5) * 0.06, 178 * spdK, { dmg: 12 });
      api.sfx('shoot2', { vol: 0.15, rate: 0.85 });
    } else if (e.fire === 'fan') {            // 装甲堡：三向扇形
      api.ebulFan(e.x, muz, [aim - 0.30, aim, aim + 0.30], 148 * spdK, { dmg: 12 });
      api.sfx('shoot3', { vol: 0.13, rate: 1.15 });
    } else if (e.fire === 'ring') {           // 执政官：环形弹 + 每 3 轮接瞄准连射
      e.ringN = (e.ringN || 0) + 1;
      const n = 12, off = e.ringN * 0.31 + api.rand() * 0.5;
      for (let i = 0; i < n; i++) api.ebul(e.x, muz, off + i / n * TAU, 118 * spdK, { dmg: 12, kind: 'eb2' });
      if (e.ringN % 3 === 0) { e.salvo = 3; e.salvoT = 0.3; }
      api.sfx('shoot2', { vol: 0.22, rate: 0.7 });
    }
  }

  /* ================= 波次导演（五编队交错 + densityK 压缩 + 同屏上限节流） ================= */
  function moveOf(kind) {
    const L = TF.LOGIC;
    if (!L || !L.ENEMIES) return '';
    const d = L.ENEMIES.find(x => x.kind === kind);
    return d ? d.move : '';
  }

  const DIRECTOR = {
    build(waves) {
      const base = (waves || []).slice();
      const D = { idx: 0, clock: 0, q: [], total: base.length, unitsTotal: 0, unitsSpawned: 0, alive: new Set() };
      base.forEach(w => { D.unitsTotal += Math.max(1, (w.count | 0) || 1); });

      function enqueueWave(w, api) {
        const W = api.W, rand = api.rand, n = Math.max(1, (w.count | 0) || 1);
        if (w.kind === 'carrier' || w.form === 'cross') { // 运输舰侧面横穿
          const left = w.x < 0.5;
          D.q.push({ at: 0, kind: w.kind, x: left ? -34 : W + 34, y: 70 + rand() * 90, o: {} });
          return;
        }
        const mv = moveOf(w.kind);
        const cx = clamp(w.x || 0.5, 0.12, 0.88) * W, y0 = -36, mid = (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          let x = cx, delay = 0, ph, ty;
          if (w.form === 'line') {          // 一字横排：相位差 → 波浪齐压
            x = W * (0.14 + 0.72 * (n === 1 ? 0.5 : i / (n - 1)));
            ph = i * (TAU / n); ty = 84 + (i % 4) * 30 + rand() * 12;
          } else if (w.form === 'vee') {    // 箭形：领机先入，两翼依次跟进
            const k = i - mid;
            x = clamp(cx + k * 44, 30, W - 30);
            delay = Math.abs(k) * 0.16; ty = 80 + Math.abs(k) * 26 + rand() * 10;
          } else if (w.form === 'column') { // 纵队：同 x 依次鱼贯
            x = clamp(cx + (rand() - 0.5) * 18, 30, W - 30);
            delay = i * 0.42; ty = 90 + rand() * 40;
          } else if (w.form === 'pincer') { // 钳形：中开两翼包抄
            const side = i % 2 ? 1 : -1;
            x = clamp(cx + side * (58 + Math.floor(i / 2) * 50), 26, W - 26);
            delay = Math.floor(i / 2) * 0.18; ty = 96 + Math.floor(i / 2) * 18 + rand() * 10;
          } else {                          // sine：横铺 + 依次入场（蛇形）
            x = clamp(W * (0.12 + 0.76 * (i + 0.5) / n), 30, W - 30);
            delay = i * 0.22; ph = -i * 0.75; ty = 90 + rand() * 30;
          }
          const s = { at: delay, kind: w.kind, x, y: y0, o: {}, phase: ph, ty: (mv === 'hover' || mv === 'strafe') ? ty : undefined };
          D.q.push(s);
        }
      }

      D.tick = function (dt, api) {
        for (const o of D.alive) if (o.dead) D.alive.delete(o); // 同屏存活估算
        const CAP = 14;
        const dK = (api.diff && api.diff.densityK) || 1;
        D.clock += dt / (1 + (dK - 1) * 0.28);  // 波间隔随 densityK 略压缩
        while (D.idx < base.length && base[D.idx].t <= D.clock) { enqueueWave(base[D.idx], api); D.idx++; }
        for (let i = D.q.length - 1; i >= 0; i--) {
          const s = D.q[i];
          s.at -= dt;
          if (s.at > 0) continue;
          if (D.alive.size >= CAP) { s.at = 0.45; continue; } // 上限保护：延迟入队
          D.q.splice(i, 1);
          const en = api.spawn(s.kind, s.x, s.y, s.o);
          if (en) {
            D.unitsSpawned++;
            D.alive.add(en);
            if (s.ty !== undefined) en.ty = s.ty;         // 编队高度一致性
            if (s.phase !== undefined) en.phase = s.phase; // 编队相位（波浪/蛇形）
          }
        }
      };
      D.done = () => D.idx >= base.length && D.q.length === 0;
      D.progress = () => D.unitsTotal ? clamp(D.unitsSpawned / D.unitsTotal, 0, 1) : 1;
      D.finish = () => { D.idx = base.length; D.q.length = 0; };
      return D;
    },
  };

  /* ================= Boss（6 原型 × 3 阶段 + 狂暴） =================
     节奏：atkT 基准 phase0≈2.2s → phase1≈1.75s → phase2≈1.4s，×rand(0.85~1.15)。
     弹速基准：普通 105~185×spdK；追踪≈120；重炮 burst 215。 */
  function build(lp) {
    const lb = (lp && lp.boss) || { i: 0, v: 0, name: 'Boss', w: 160, hp: 900 };
    const arch = (TF.LOGIC && TF.LOGIC.BOSSES) ? TF.LOGIC.BOSSES[lb.i] : null;
    return {
      i: lb.i | 0, v: lb.v | 0, name: lb.name, w: lb.w,
      hp: lb.hp, maxHp: lb.hp,
      x: 210, y: -110, t: 0, mode: 'enter', phase: 0,
      pat: arch ? arch.pat.slice() : ['aimfan', 'ring', 'spiral'],
      sub: 0, atkT: 2.0, flash: 0, dying: false, dieT: 0,
      // 内部状态：py 驻留高度 / mtx 横移目标 / seq 攻击序号 / em 持续发射器 / sched 待发队列
      py: 0, mtx: 210, mtT: 0, seq: 0, em: [], sched: [], lastBlink: 0,
    };
  }

  function moveBoss(b, dt, api, yMax) { // 各原型机动风格
    const W = api.W, t = b.t, margin = b.w * 0.5 + 14;
    switch (b.i) {
      case 0: b.x += (W / 2 + Math.sin(t * 0.42) * W * 0.24 - b.x) * Math.min(1, dt * 1.6); break; // 母舰缓游
      case 1: b.x += (W / 2 + Math.sin(t * 0.22) * W * 0.10 - b.x) * Math.min(1, dt * 1.2); break; // 堡垒近驻
      case 2: { // 战刃：快速横移扫场
        b.mtT -= dt;
        if (b.mtT <= 0) { b.mtT = (b.phase === 2 ? 1.0 : 1.5) + api.rand() * 0.7; b.mtx = margin + api.rand() * (W - margin * 2); }
        b.x += (b.mtx - b.x) * Math.min(1, dt * (b.phase === 2 ? 4.2 : 3.2));
        break;
      }
      case 3: b.x += (W / 2 + Math.sin(t * 0.62) * W * 0.26 - b.x) * Math.min(1, dt * 2.2); break; // 蜂后中摆
      case 4: b.x += Math.sin(t * 0.5) * 14 * dt; break;                                            // 幽灵漂移
      default: b.x += (W / 2 + Math.sin(t * 0.3) * W * 0.2 - b.x) * Math.min(1, dt * 1.1); break;   // 天罚缓压
    }
    b.x = clamp(b.x, margin, W - margin);
    b.y = b.py + Math.sin(t * (b.i === 2 ? 1.1 : b.i === 3 ? 1.3 : 0.8)) * (b.i === 1 ? 6 : 12);
    b.y = clamp(b.y, 84, Math.min(yMax, 300)); // 铁律：不压玩家出生点
  }

  function bossAttack(b, api) { // 返回本次攻击后的冷却倍率
    const p = api.player, W = api.W, H = api.H, spdK = api.diff.spdK;
    const nose = b.y + b.w * 0.30;
    const aim = () => Math.atan2(p.y - b.y, p.x - b.x);
    const B = (a, s, o) => api.ebul(b.x, nose, a, s * spdK, o);
    const mult = 1;

    switch (b.i) {

      case 0: { // 母舰·格里芬：机库开合节奏（召唤 → 扇瞄 → 环弹 三拍轮转）
        b.seq++;
        const step = b.seq % 3;
        if (step === 0) { // 开库放小怪（atkT×1.3 体现库门开合）
          const n = 2 + b.phase;
          for (let k = 0; k < n; k++) {
            const bx = clamp(b.x + (api.rand() - 0.5) * b.w * 0.7, 30, W - 30);
            b.sched.push({ at: b.t + 0.3 + k * 0.3, fn: a2 => a2.spawn('grunt', bx, b.y + 34, {}) });
          }
          api.sfx('shoot2', { vol: 0.3, rate: 0.6 });
          return 1.3;
        } else if (step === 1) { // 扇形瞄准弹
          const n = 3 + b.phase * 2, a0 = aim(), angs = [];
          for (let k = 0; k < n; k++) angs.push(a0 + (k - (n - 1) / 2) * 0.17);
          api.ebulFan(b.x, nose, angs, 165 * spdK, { dmg: 13 });
        } else { // 环弹（sub 累计旋转角）
          const n = 12 + b.phase * 3, off = b.sub * 0.31;
          for (let k = 0; k < n; k++) B(off + k / n * TAU, 112, { dmg: 12, kind: 'eb2' });
        }
        break;
      }

      case 1: { // 堡垒·克利俄：旋转环弹 + 三连快瞄准 + 蓄力激光
        b.seq++;
        const cyc = b.seq % 3;
        const rotring = dense => {
          const n = (14 + b.phase * 2) + (dense ? 4 : 0), off = b.sub * 0.33;
          for (let k = 0; k < n; k++) B(off + k / n * TAU, 108, { dmg: 12, kind: 'eb2' });
        };
        const burst3 = () => { // 三连快瞄准 burst（0.09s 间隔）
          for (let k = 0; k < 3; k++) b.sched.push({ at: b.t + k * 0.09, fn: a2 => {
            const a = Math.atan2(a2.player.y - b.y, a2.player.x - b.x) + (a2.rand() - 0.5) * 0.05;
            a2.ebul(b.x, b.y + b.w * 0.30, a, 215 * a2.diff.spdK, { dmg: 14, kind: 'eb3', r: 5.5 });
          } });
          api.sfx('shoot3', { vol: 0.3, rate: 0.9 });
        };
        const laser = () => { // 玩家 x 上方竖束（telegraph 自带预警+伤害）
          api.telegraph(clamp(p.x, 46, W - 46), H, 46, 1.15, 'beam');
          api.sfx('bosshit', { vol: 0.4, rate: 0.5 });
          return 1.3; // 激光后 extra recovery（公平节拍）
        };
        if (b.phase === 0) { if (cyc === 2) { burst3(); } else rotring(); }
        else if (b.phase === 1) {
          if (cyc === 0) rotring();
          else if (cyc === 1) { burst3(); }
          else { const m = laser(); rotring(true); return m; }
        } else {
          if (cyc === 0) rotring(true);
          else if (cyc === 1) { const m = laser(); burst3(); return m; }
          else { burst3(); rotring(true); }
        }
        break;
      }

      case 2: { // 战刃·阿瑞斯：7 向扇面（随 seq 横扫）+ 双臂螺旋（0.52 rad/拍）
        b.seq++;
        const sweep7 = wide => {
          const a0 = Math.PI / 2 + b.seq * 0.13, n = 7;
          const angs = [];
          for (let k = 0; k < n; k++) angs.push(a0 + (k - (n - 1) / 2) * (wide ? 0.18 : 0.15));
          api.ebulFan(b.x, nose, angs, 158 * spdK, { dmg: 12 });
        };
        const spiral = (dur, iv) => {
          if (b.em.length >= 2) return; // 发射器上限，防叠加过密
          b.em.push({ until: b.t + dur, iv, t: 0, k: 0, fn: (a2, m) => {
            const a = m.k * 0.52; m.k++;
            a2.ebul(b.x, b.y + b.w * 0.30, a, 138 * a2.diff.spdK, { dmg: 12, kind: 'eb2' });
            a2.ebul(b.x, b.y + b.w * 0.30, a + Math.PI, 138 * a2.diff.spdK, { dmg: 12, kind: 'eb2' });
          } });
        };
        if (b.phase === 0) sweep7();
        else if (b.phase === 1) { if (b.seq % 2) sweep7(); else spiral(1.6, 0.085); }
        else { if (b.seq % 3 === 2) spiral(2.0, 0.07); else sweep7(true); }
        break;
      }

      case 3: { // 蜂后·妮克斯：放俯冲蝠 + 双臂反向螺旋 + 瞄准扇
        b.seq++;
        const spawnD = n => {
          for (let k = 0; k < n; k++) b.sched.push({ at: b.t + k * 0.25, fn: a2 => {
            a2.spawn('diver', 40 + a2.rand() * (a2.W - 80), -30, {});
          } });
          api.sfx('shoot2', { vol: 0.26, rate: 0.65 });
          return 1.2;
        };
        const dSpiral = dur => { // 双臂反向螺旋
          if (b.em.length >= 2) return 1;
          b.em.push({ until: b.t + dur, iv: 0.09, t: 0, k: 0, fn: (a2, m) => {
            const a = m.k * 0.42; m.k++;
            a2.ebul(b.x, b.y + b.w * 0.30, a, 128 * a2.diff.spdK, { dmg: 12, kind: 'eb2' });
            a2.ebul(b.x, b.y + b.w * 0.30, -a, 128 * a2.diff.spdK, { dmg: 12, kind: 'eb2' });
          } });
          return 1;
        };
        const aimfan = () => {
          const n = 3 + b.phase * 2, a0 = aim(), angs = [];
          for (let k = 0; k < n; k++) angs.push(a0 + (k - (n - 1) / 2) * 0.16);
          api.ebulFan(b.x, nose, angs, 170 * spdK, { dmg: 13 });
          return 1;
        };
        if (b.phase === 0) return b.seq % 2 ? spawnD(2) : dSpiral(1.2);
        if (b.phase === 1) { const c = b.seq % 3; return c === 0 ? spawnD(2) : c === 1 ? dSpiral(1.6) : aimfan(); }
        const c = b.seq % 3;
        if (c === 0) { const m = spawnD(3); dSpiral(1.2); return m; }
        return c === 1 ? dSpiral(1.9) : aimfan();
      }

      case 4: { // 幽灵·卡戎：瞬移至玩家上方 + 环爆 + 追踪弹
        b.seq++;
        if (b.t - b.lastBlink > (b.phase === 2 ? 2.4 : 3.2)) { // blink
          b.lastBlink = b.t;
          b.x = clamp(p.x, 70, W - 70);
          b.flash = Math.max(b.flash, 0.12);
          const n = 12 + b.phase * 2, off = api.rand() * TAU;
          for (let k = 0; k < n; k++) B(off + k / n * TAU, 128, { dmg: 12, kind: 'eb2' });
          api.sfx('shoot2', { vol: 0.3, rate: 0.55 });
          return 1.15;
        }
        const homing = n => { // 追踪弹：homing≈1.6 rad/s，速度≈120，可绕开
          const a0 = aim();
          for (let k = 0; k < n; k++)
            B(a0 + (k - (n - 1) / 2) * 0.38, Math.min(150, 120 * (1 + (spdK - 1) * 0.35)), { dmg: 14, kind: 'eb3', r: 6, homing: 1.6, life: 6 });
          api.sfx('shoot2', { vol: 0.24, rate: 0.8 });
        };
        if (b.phase === 0) { // 环爆 / 小扇 交替
          if (b.seq % 2) { const n = 12, off = api.rand() * TAU; for (let k = 0; k < n; k++) B(off + k / n * TAU, 118, { dmg: 12, kind: 'eb2' }); }
          else { const a0 = aim(); api.ebulFan(b.x, nose, [a0 - 0.2, a0, a0 + 0.2], 165 * spdK, { dmg: 13 }); }
        } else if (b.phase === 1) {
          const c = b.seq % 3;
          if (c === 0) homing(3);
          else if (c === 1) { const n = 14, off = api.rand() * TAU; for (let k = 0; k < n; k++) B(off + k / n * TAU, 112, { dmg: 12, kind: 'eb2' }); }
          else { const a0 = aim(); api.ebulFan(b.x, nose, [a0 - 0.24, a0, a0 + 0.24], 170 * spdK, { dmg: 13 }); }
        } else homing(4);
        break;
      }

      default: { // 天罚·泰坦：全模式混合，阶段越低越密；狂暴期弹速克制
        b.seq++;
        const ring = () => { const n = 16 + b.phase * 4, off = b.sub * 0.27; for (let k = 0; k < n; k++) B(off + k / n * TAU, 108, { dmg: 12, kind: 'eb2' }); };
        const aimfan = () => { const n = 5 + b.phase * 2, a0 = aim(), angs = []; for (let k = 0; k < n; k++) angs.push(a0 + (k - (n - 1) / 2) * 0.15); api.ebulFan(b.x, nose, angs, 170 * spdK, { dmg: 13 }); };
        const sweep = () => { const a0 = Math.PI / 2 + b.seq * 0.12, angs = []; for (let k = 0; k < 7; k++) angs.push(a0 + (k - 3) * 0.16); api.ebulFan(b.x, nose, angs, 150 * spdK, { dmg: 12 }); };
        const spiral4 = () => {
          if (b.em.length >= 2) return 1;
          b.em.push({ until: b.t + 1.3, iv: 0.11, t: 0, k: 0, fn: (a2, m) => {
            const a = m.k * 0.9; m.k++;
            for (let j = 0; j < 4; j++) a2.ebul(b.x, b.y + b.w * 0.30, a + j * Math.PI / 2, 130 * a2.diff.spdK, { dmg: 12, kind: 'eb2' });
          } });
          return 1;
        };
        const laser = n2 => {
          for (let k = 0; k < n2; k++) b.sched.push({ at: b.t + k * 0.4, fn: a2 => {
            a2.telegraph(clamp(a2.player.x, 46, a2.W - 46), a2.H, 46, 1.15, 'beam');
          } });
          api.sfx('bosshit', { vol: 0.4, rate: 0.5 });
          return 1.4;
        };
        const homing = () => { const a0 = aim(); for (let k = 0; k < 3; k++) B(a0 + (k - 1) * 0.36, 118, { dmg: 14, kind: 'eb3', r: 6, homing: 1.6, life: 6 }); };
        const pool = b.phase === 0 ? [ring, aimfan, sweep]
                   : b.phase === 1 ? [ring, aimfan, sweep, spiral4, laser1]
                   : [ring, sweep, spiral4, laser2, homing, aimfan];
        function laser1() { return laser(1); }
        function laser2() { return laser(2); }
        const pick = pool[Math.floor(api.rand() * pool.length)];
        return pick() || 1;
      }
    }
    return mult;
  }

  function tick(b, dt, api) {
    b.t += dt;
    const p = api.player, H = api.H, yMax = H * 0.35;

    if (b.mode === 'enter') { // 入场：降至驻留高度（此间不开火）
      if (!b.py) b.py = clamp(H * 0.22, 130, 205);
      b.y += (b.py - b.y) * Math.min(1, dt * 1.9);
      b.x += (api.W / 2 - b.x) * Math.min(1, dt * 2);
      if (b.y > b.py - 8) { b.mode = 'fight'; b.atkT = 1.0; } // 开打前再留 1s 缓冲
      return;
    }

    // 阶段：66% / 33% 两段换模式，<33% 狂暴
    const ph = b.hp > b.maxHp * 0.66 ? 0 : b.hp > b.maxHp * 0.33 ? 1 : 2;
    if (ph !== b.phase) {
      b.phase = ph;
      b.em.length = 0; b.sched.length = 0;   // 换阶段清空旧节拍
      b.atkT = Math.max(b.atkT, 0.9);        // 换阶段短暂喘息
      b.flash = Math.max(b.flash, 0.1);      // 变相白闪提示
    }

    // 待发队列（burst 连射 / 机库序列 / 双激光）
    for (let i = b.sched.length - 1; i >= 0; i--) {
      if (b.sched[i].at <= b.t) { const f = b.sched.splice(i, 1)[0]; if (!p.dead) f.fn(api); }
    }
    // 持续发射器（螺旋臂）
    for (let i = b.em.length - 1; i >= 0; i--) {
      const m = b.em[i];
      m.t -= dt;
      if (m.t <= 0) { m.t = m.iv; if (!p.dead) m.fn(api, m); }
      if (b.t > m.until) b.em.splice(i, 1);
    }

    moveBoss(b, dt, api, yMax);

    // 攻击节拍
    b.atkT -= dt;
    if (b.atkT > 0 || p.dead || b.dying) return; // 玩家死亡停火
    const mult = bossAttack(b, api) || 1;
    b.sub++;
    const iv = b.phase === 0 ? 2.2 : b.phase === 1 ? 1.75 : 1.4;
    b.atkT = iv * mult * (0.85 + api.rand() * 0.3);
  }

  return { move, fire, DIRECTOR, BOSS: { build, tick } };
})();
