/* logic.js — 纯数据与数学：战机/僚机/敌舰/Boss/无限关卡/掉落/经济/存档 */
window.TF = window.TF || {};
TF.LOGIC = (function () {
  'use strict';

  // ===== 战机（6 级）=====
  const SHIPS = [
    { id:'A', name:'突击者', tag:'T1', cost:0,     hp:100, dmg:10, rate:130, speed:1.00, type:'stream',
      desc:'联邦制式主力机，火力均衡，双联离子炮随火力等级扩展弹幕。' },
    { id:'B', name:'幻影',   tag:'T2', cost:2500,  hp:85,  dmg:8,  rate:100, speed:1.15, type:'twin',
      desc:'轻量化侦查改装型，双斜射速极高，机动性顶尖但装甲薄弱。' },
    { id:'C', name:'重锤',   tag:'T3', cost:6000,  hp:160, dmg:26, rate:240, speed:0.85, type:'heavy',
      desc:'重装甲突击平台，质子重炮单发毁伤惊人，射速较慢。' },
    { id:'D', name:'苍穹',   tag:'T4', cost:12000, hp:110, dmg:9,  rate:110, speed:1.05, type:'spread',
      desc:'广域压制型，三向散射覆盖大范围空域，清杂能力一流。' },
    { id:'E', name:'雷神',   tag:'T5', cost:25000, hp:140, dmg:18, rate:150, speed:1.00, type:'pierce',
      desc:'贯穿型磁轨炮，弹道可穿透多个目标，对付密集纵队。' },
    { id:'F', name:'灭世',   tag:'T6', cost:50000, hp:180, dmg:14, rate:115, speed:1.10, type:'nova',
      desc:'旗舰级原型机，等离子新星矩阵，全弹幕齐射的终极火力。' },
  ];

  // ===== 僚机 =====
  const WINGS = [
    { id:'gun',     name:'机炮舱',   cost:0,    up:[500,1100,2200,4200], desc:'双联速射机炮，稳定输出', rate:210, dmg:4 },
    { id:'missile', name:'导弹架',   cost:3000, up:[800,1600,3200,6400], desc:'自动追踪导弹，重击单体', every:1.35, dmg:15 },
    { id:'tesla',   name:'电磁线圈', cost:8000, up:[1200,2400,4800,9600], desc:'连锁电弧，跃迁多目标', every:2.0, dmg:10 },
  ];

  // ===== 敌机 =====
  const ENEMIES = [
    { kind:'grunt',  name:'蜂群',   hp:12,  score:50,  size:30, speed:120, coins:2,  drop:0.06, move:'sine',   fire:'none',   unlock:1 },
    { kind:'gunner', name:'哨卫',   hp:30,  score:80,  size:36, speed:60,  coins:3,  drop:0.12, move:'hover',  fire:'aimed',  fireEvery:2.2, unlock:1 },
    { kind:'diver',  name:'俯冲蝠', hp:20,  score:100, size:32, speed:215, coins:3,  drop:0.10, move:'dive',   fire:'none',   unlock:2 },
    { kind:'tank',   name:'装甲堡', hp:95,  score:200, size:54, speed:42,  coins:6,  drop:0.25, move:'strafe', fire:'fan',    fireEvery:2.8, unlock:3 },
    { kind:'kami',   name:'刺客',   hp:18,  score:120, size:28, speed:265, coins:4,  drop:0.10, move:'charge', fire:'none',   unlock:4 },
    { kind:'elite',  name:'执政官', hp:240, score:500, size:64, speed:72,  coins:15, drop:1.0,  move:'enter',  fire:'ring',   fireEvery:3.0, unlock:6 },
    { kind:'carrier',name:'运输舰', hp:60,  score:150, size:44, speed:105, coins:8,  drop:1.0,  move:'cross',  fire:'none',   unlock:99, carrier:true },
  ];

  // ===== Boss 原型（关卡 n 用 (n-1)%6，变体 floor((n-1)/6)%3）=====
  const BOSSES = [
    { i:0, name:'母舰 · 格里芬', hpK:1.00, w:176, pat:['spawn', 'aimfan', 'ring'] },
    { i:1, name:'堡垒 · 克利俄', hpK:1.18, w:150, pat:['rotring', 'burst', 'laser'] },
    { i:2, name:'战刃 · 阿瑞斯', hpK:1.10, w:164, pat:['sweep', 'cross', 'spiral'] },
    { i:3, name:'蜂后 · 妮克斯', hpK:1.22, w:160, pat:['spawnD', 'spiral', 'aimfan'] },
    { i:4, name:'幽灵 · 卡戎',   hpK:0.95, w:140, pat:['blink', 'cross', 'homing'] },
    { i:5, name:'天罚 · 泰坦',   hpK:1.50, w:192, pat:['omni'] },
  ];

  const POWERS = ['P','B','H','S','L','coin','part'];
  const DROP_W = { P:.30, coin:.22, H:.16, B:.10, S:.10, L:.03, part:.09 };

  // ===== 工具 =====
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pickW(table, r) {
    let sum = 0; for (const k in table) sum += table[k];
    let x = r * sum;
    for (const k in table) { x -= table[k]; if (x <= 0) return k; }
    return Object.keys(table)[0];
  }

  // ===== 关卡曲线（无限）=====
  function levelParams(n) {
    const hpK = 1 + 0.13 * (n - 1) + 0.012 * (n - 1) * (n - 1);
    const spdK = Math.min(1 + 0.025 * (n - 1), 1.7);
    const fireK = Math.min(1 + 0.03 * (n - 1), 2.0);
    const densityK = Math.min(1 + 0.06 * (n - 1), 2.2);
    const bi = (n - 1) % 6, bv = Math.floor((n - 1) / 6) % 3;
    const arch = BOSSES[bi];
    const boss = { i: bi, v: bv, name: arch.name, w: arch.w,
      hp: Math.round(900 * arch.hpK * (1 + 0.30 * (n - 1) + 0.02 * (n - 1) * (n - 1))) };
    // 波次脚本（确定性：同关重打布局一致）
    const r = rng(n * 2654435761 >>> 0 ^ 0x9e3779b9);
    const waveN = 4 + Math.min(Math.floor(n / 3), 6);
    const gap = Math.max(5.5, 8.5 - 0.1 * n);
    const pool = ENEMIES.filter(e => !e.carrier && e.unlock <= n);
    const waves = []; let t = 1.6;
    const FORMS = ['line', 'vee', 'column', 'pincer', 'sine'];
    for (let w = 0; w < waveN; w++) {
      const base = pool[Math.floor(r() * pool.length)];
      let kind = base.kind;
      if (n >= 6 && w >= 2 && r() < Math.min(0.10 + 0.02 * n, 0.35)) kind = 'elite';
      const form = FORMS[Math.floor(r() * FORMS.length)];
      const count = Math.max(3, Math.min(8, Math.round((3 + r() * 3) * (1 + 0.05 * n))));
      waves.push({ t: +t.toFixed(2), kind, x: 0.2 + r() * 0.6, form, count });
      t += gap + count * 0.22;
      if ((w + 1) % 2 === 0 && w < waveN - 1) { // 补给舰
        waves.push({ t: +t.toFixed(2), kind: 'carrier', x: 0.25 + r() * 0.5, form: 'cross', count: 1 });
        t += 3.2;
      }
    }
    return { n, hpK, spdK, fireK, densityK, boss, waves, bossAt: +t.toFixed(2), seed: (n * 2654435761 >>> 0) };
  }

  // ===== 火力弹幕（局内 P0-P4）=====
  // 返回 [{dx, ang, dmgK, kind}] kind: bullet|heavy|pierce|plasma；ang 弧度，0=正上
  function firePattern(id, p) {
    const out = [];
    const add = (dx, ang, dmgK, kind) => out.push({ dx, ang, dmgK: dmgK || 1, kind: kind || 'bullet' });
    const t = (SHIPS.find(s => s.id === id) || SHIPS[0]).type;
    if (t === 'stream') {
      if (p === 0) add(0, 0);
      else if (p === 1) { add(-9, 0); add(9, 0); }
      else if (p === 2) { add(0, 0, 1.2); add(-11, 0); add(11, 0); }
      else if (p === 3) { add(0, 0, 1.2); add(-12, 0); add(12, 0); add(-18, -.13, .6); add(18, .13, .6); }
      else { add(0, 0, 1.3); add(-10, 0); add(10, 0); add(-19, -.12, .7); add(19, .12, .7); }
    } else if (t === 'twin') {
      add(-8, -.06); add(8, .06);
      if (p >= 1) add(0, 0, .8);
      if (p >= 2) { add(-14, -.16, .6); add(14, .16, .6); }
      if (p >= 3) add(0, 0, 1);
      if (p >= 4) { add(-17, -.22, .6); add(17, .22, .6); }
    } else if (t === 'heavy') {
      add(0, 0, 1, 'heavy');
      if (p >= 1) { add(-16, -.1, .45); add(16, .1, .45); }
      if (p >= 2) add(0, 0, 1, 'heavy');
      if (p >= 3) { add(-13, 0, .6, 'heavy'); add(13, 0, .6, 'heavy'); }
      if (p >= 4) { add(-20, -.16, .5); add(20, .16, .5); }
    } else if (t === 'spread') {
      const w = .20 + p * .025;
      add(0, 0, 1.1); add(-10, -w, .7); add(10, w, .7);
      if (p >= 1) { add(-16, -w * 1.9, .6); add(16, w * 1.9, .6); }
      if (p >= 2) { add(-22, -w * 2.8, .5); add(22, w * 2.8, .5); }
      if (p >= 3) add(0, -.09, .6), add(0, .09, .6);
      if (p >= 4) { add(-26, -w * 3.6, .5); add(26, w * 3.6, .5); }
    } else if (t === 'pierce') {
      add(0, 0, 1, 'pierce');
      if (p >= 1) { add(-12, -.07, .6); add(12, .07, .6); }
      if (p >= 2) add(0, 0, .8, 'pierce');
      if (p >= 3) { add(-18, -.14, .6); add(18, .14, .6); }
      if (p >= 4) { add(-8, 0, .9, 'pierce'); add(8, 0, .9, 'pierce'); }
    } else { // nova
      add(0, 0, 1.1, 'plasma'); add(-12, -.10, .7); add(12, .10, .7);
      if (p >= 1) add(-20, -.2, .55), add(20, .2, .55);
      if (p >= 2) { add(-6, 0, .8, 'plasma'); add(6, 0, .8, 'plasma'); }
      if (p >= 3) { add(-26, -.3, .5); add(26, .3, .5); }
      if (p >= 4) { add(-14, -.14, .6, 'plasma'); add(14, .14, .6, 'plasma'); }
    }
    return out;
  }

  // ===== 数值 =====
  function starsMulHp(s) { return 1 + 0.18 * (s - 1); }
  function starsMulDmg(s) { return 1 + 0.16 * (s - 1); }
  function shipStat(id, star) {
    const s = SHIPS.find(x => x.id === id) || SHIPS[0];
    return { id: s.id, name: s.name, tag: s.tag, type: s.type, desc: s.desc,
      hp: Math.round(s.hp * starsMulHp(star)), dmg: +(s.dmg * starsMulDmg(star)).toFixed(1),
      rate: s.rate, speed: s.speed };
  }
  function wingStat(id, lv) {
    const w = WINGS.find(x => x.id === id); if (!w) return null;
    const k = 1 + 0.35 * (lv - 1);
    return { id: w.id, name: w.name, desc: w.desc, dmg: +(w.dmg * k).toFixed(1),
      rate: w.rate ? Math.round(w.rate * (1 - 0.06 * (lv - 1))) : (w.every ? +(w.every * (1 - 0.07 * (lv - 1))).toFixed(2) : 0) };
  }
  function comboMult(c) { return 1 + Math.min(c, 50) * 0.02; }
  function dropsFor(kind, rand, dropK) {
    const e = ENEMIES.find(x => x.kind === kind); if (!e) return null;
    let chance = e.drop * (dropK || 1);
    if (kind === 'elite') chance = 1;
    if (rand() >= chance) return null;
    return pickW(DROP_W, rand());
  }
  function reward(n, stars, hpPct) {
    const cm = [1, 1.15, 1.35][Math.max(0, Math.min(2, stars - 1))];
    return {
      coins: Math.round((40 + 18 * n) * cm),
      parts: 1 + Math.floor(n / 8),
      scoreBonus: 1000 * n + Math.round(hpPct * 1000) + (stars - 1) * 500,
    };
  }
  const STAR_COINS = [0, 800, 2400, 6000, 15000]; // 升到 2..5 星
  const STAR_PARTS = [0, 2, 5, 12, 30];
  function starCost(id, toStar) {
    const i = Math.max(1, Math.min(5, toStar)) - 1;
    return { coins: STAR_COINS[i], parts: STAR_PARTS[i] };
  }
  function wingCost(id, toLv) {
    const w = WINGS.find(x => x.id === id); if (!w) return null;
    if (toLv <= 1) return { coins: w.cost, parts: 0 };
    const up = w.up[Math.min(toLv - 2, w.up.length - 1)];
    return { coins: up, parts: (toLv - 1) };
  }

  // ===== 存档 =====
  const KEY = 'tf.save.v1';
  let P = null;
  function defProfile() {
    const ships = {}, wing = {};
    SHIPS.forEach(s => ships[s.id] = { own: s.cost === 0 ? 1 : 0, star: 1 });
    WINGS.forEach(w => wing[w.id] = { own: w.cost === 0 ? 1 : 0, lv: 1 });
    return { v: 1, coins: 600, parts: 2, ships, wing,
      loadout: { ship: 'A', wingL: 'gun', wingR: null },
      progress: { maxLv: 1, stars: {} },
      best: { score: 0, lv: 0 },
      board: [], stats: { runs: 0, kills: 0, score: 0, playSec: 0 } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      P = raw ? JSON.parse(raw) : defProfile();
    } catch (e) { P = defProfile(); }
    const d = defProfile(); // 补字段
    for (const k in d) if (P[k] === undefined) P[k] = d[k];
    for (const k in d.ships) if (!P.ships[k]) P.ships[k] = d.ships[k];
    for (const k in d.wing) if (!P.wing[k]) P.wing[k] = d.wing[k];
    return P;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  function get() { return P || load(); }
  function addRun(r) { // {lv,score,kills,coins,parts,win,stars,hpPct,ship,sec}
    const p = get();
    p.coins += r.coins || 0; p.parts += r.parts || 0;
    p.stats.runs++; p.stats.kills += r.kills || 0;
    p.stats.score += r.score || 0; p.stats.playSec += r.sec || 0;
    if (r.win) {
      p.progress.maxLv = Math.max(p.progress.maxLv, (r.lv || 1) + 1);
      const st = p.progress.stars, k = 'l' + r.lv;
      st[k] = Math.max(st[k] || 0, r.stars || 1);
      if (r.score > p.best.score) p.best.score = r.score;
      p.best.lv = Math.max(p.best.lv, r.lv);
    }
    boardAdd({ score: r.score || 0, lv: r.lv, ship: r.ship, date: Date.now() });
    save();
  }
  function boardAdd(row) {
    const p = get();
    p.board.push(row);
    p.board.sort((a, b) => b.score - a.score);
    p.board.length = Math.min(p.board.length, 10);
  }
  function exportProf() { return JSON.stringify(get()); }
  function importProf(str) {
    const o = JSON.parse(str);
    if (!o || typeof o !== 'object' || !o.ships) throw new Error('bad profile');
    P = o; save(); return P;
  }

  // ===== 自检 =====
  function selfTest() {
    const log = []; let ok = true;
    const A = (c, m) => { if (!c) { ok = false; log.push('FAIL ' + m); } };
    for (let n = 1; n <= 60; n++) {
      const lp = levelParams(n);
      A(lp.waves.length >= 4, 'n=' + n + ' waves');
      A(lp.boss.hp > 0 && isFinite(lp.boss.hp), 'n=' + n + ' boss hp');
      A(lp.hpK >= 1, 'n=' + n + ' hpK');
      if (n > 1) A(levelParams(n).hpK >= levelParams(n - 1).hpK, 'hpK 单调');
      lp.waves.forEach(w => A(w.t > 0 && ENEMIES.some(e => e.kind === w.kind), 'wave kind ' + w.kind));
    }
    SHIPS.forEach(s => { for (let p = 0; p <= 4; p++) {
      const f = firePattern(s.id, p);
      A(Array.isArray(f) && f.length >= 1 && f.length <= 12, s.id + ' p' + p);
      f.forEach(b => A(isFinite(b.dx) && isFinite(b.ang), s.id + ' 弹幕数值'));
    }});
    const r = rng(42); let drops = 0;
    for (let i = 0; i < 2000; i++) if (dropsFor('gunner', r, 1)) drops++;
    A(drops > 100 && drops < 500, '掉落率 sane ' + drops);
    A(comboMult(50) === 2, 'combo 上限');
    const rw = reward(10, 3, 1); A(rw.coins > 0 && rw.parts >= 2, '奖励');
    return { ok, log };
  }

  return { SHIPS, WINGS, ENEMIES, BOSSES, POWERS,
    rng, levelParams, firePattern, starsMulHp, starsMulDmg,
    shipStat, wingStat, comboMult, dropsFor, reward, starCost, wingCost,
    PROFILE: { load, save, get, addRun, boardAdd, exportProf, importProf },
    selfTest };
})();
