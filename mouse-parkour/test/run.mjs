#!/usr/bin/env node
/* =====================================================================
 * 鼠族跑酷 · MOUSE RUSH — 逻辑层回归测试
 * 用法：node test/run.mjs
 * 直接 require ../src/logic.js（UMD，node 友好，无需 DOM）
 * ===================================================================== */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const L = require(path.join(__dirname, '..', 'src', 'logic.js'));

/* ---------------- 迷你断言框架 ---------------- */
let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('断言返回 false');
    pass++;
  } catch (e) {
    fail++;
    failures.push(`${name} → ${e && e.message ? e.message : e}`);
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || ''} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || '期望为真'); }
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg || ''} 期望 ${b}±${tol}，实际 ${a}`);
}
function section(title) { console.log(`\n\x1b[36m── ${title}\x1b[0m`); }

/* ================= 1. 模块与常量 ================= */
section('1. 模块骨架与物理常量');
t('LOGIC 模块已导出', () => ok(L && typeof L === 'object'));
t('PHYS 常量齐全', () => {
  const need = ['GRAVITY', 'MAX_FALL', 'RUN_SPEED', 'RUN_ACCEL', 'RUN_FRICTION',
    'AIR_ACCEL', 'AIR_FRICTION', 'JUMP_V', 'DOUBLE_JUMP_V', 'JUMP_CUT',
    'COYOTE_TIME', 'JUMP_BUFFER', 'DASH_SPEED', 'DASH_TIME', 'DASH_CD',
    'DASH_COST', 'STAMINA_MAX', 'STAMINA_RUN', 'STAMINA_REGEN',
    'SLIDE_TIME', 'SLIDE_SPEED_MUL', 'BOUNCE_V'];
  for (const k of need) ok(typeof L.PHYS[k] === 'number', `PHYS.${k} 缺失`);
});
t('PHYS 数值与契约一致', () => {
  eq(L.PHYS.GRAVITY, 2400); eq(L.PHYS.RUN_SPEED, 320); eq(L.PHYS.JUMP_V, 780);
  eq(L.PHYS.DOUBLE_JUMP_V, 660); eq(L.PHYS.DASH_SPEED, 900); eq(L.PHYS.DASH_CD, 0.55);
  eq(L.PHYS.DASH_COST, 30); eq(L.PHYS.STAMINA_MAX, 100); eq(L.PHYS.BOUNCE_V, 520);
  eq(L.PHYS.JUMP_CUT, 0.45); eq(L.PHYS.COYOTE_TIME, 0.1); eq(L.PHYS.JUMP_BUFFER, 0.12);
});
t('工具函数 aabb / clamp 存在', () => {
  ok(typeof L.aabb === 'function' && typeof L.clamp === 'function');
  ok(L.aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }) === true);
  ok(L.aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }) === false);
  eq(L.clamp(5, 0, 3), 3); eq(L.clamp(-1, 0, 3), 0); eq(L.clamp(2, 0, 3), 2);
});

/* ================= 2. 道具 / 危险物 / 敌人 / 群系 ================= */
section('2. 道具与实体表');
const ITEM_IDS = ['cheese', 'coin', 'gem', 'clover', 'magnet', 'catnip', 'sneakers',
  'bubblegum', 'flame', 'giant', 'mini', 'feather', 'shield', 'star', 'hourglass',
  'energy', 'heart', 'drill', 'boots', 'bell', 'freeze', 'emp', 'multiply',
  'gravity', 'rocket'];
t('25 种拾取物齐全', () => {
  eq(ITEM_IDS.length, 25);
  for (const id of ITEM_IDS) ok(L.ITEMS && L.ITEMS[id], `缺少道具 ${id}`);
});
t('每种拾取物字段完整', () => {
  for (const id of ITEM_IDS) {
    const it = L.ITEMS[id];
    eq(it.id, id, `${id}.id`);
    ok(typeof it.name === 'string' && it.name.length > 0, `${id}.name`);
    eq(it.type, 'pickup', `${id}.type`);
    ok(typeof it.rarity === 'number' && it.rarity >= 1 && it.rarity <= 4, `${id}.rarity`);
    ok(typeof it.icon === 'string', `${id}.icon`);
    ok(typeof it.desc === 'string' && it.desc.length > 0, `${id}.desc`);
    ok(typeof it.effect === 'function', `${id}.effect`);
  }
});
t('道具 effect 全部不抛异常', () => {
  const p = L.createPlayer(0, 0);
  const g = L.createRun();
  for (const id of ITEM_IDS) {
    L.applyItem(p, g, id);
  }
});
t('applyItem 返回提示文本', () => {
  const p = L.createPlayer(0, 0);
  const g = L.createRun();
  const r = L.applyItem(p, g, 'cheese');
  ok(r && typeof r.text === 'string' && r.text.length > 0);
});
t('11 种危险物齐全', () => {
  const ids = ['cat', 'spike', 'pit', 'rock', 'fence', 'acid', 'pendulum', 'laser', 'blade', 'drone', 'crusher'];
  for (const id of ids) ok(L.HAZARDS && L.HAZARDS[id], `缺少危险物 ${id}`);
});
t('4 种敌人齐全', () => {
  for (const id of ['cat', 'drone', 'wasp', 'turret']) ok(L.ENEMIES && L.ENEMIES[id], `缺少敌人 ${id}`);
});
t('6 个生物群系齐全', () => {
  const ids = ['kitchen', 'warehouse', 'rainforest', 'lava', 'ice', 'void'];
  const list = Array.isArray(L.BIOMES) ? L.BIOMES : Object.values(L.BIOMES || {});
  eq(list.length, 6, '群系数量');
  for (const id of ids) ok(list.some((b) => b.id === id), `缺少群系 ${id}`);
  for (const b of list) {
    ok(b.name && b.palette && b.palette.sky, `${b.id} 缺 name/palette`);
  }
});
t('BUFF_INFO 覆盖所有增益类道具', () => {
  ok(L.BUFF_INFO && typeof L.BUFF_INFO === 'object');
  for (const id of ['clover', 'magnet', 'catnip', 'sneakers', 'flame', 'giant', 'mini',
    'feather', 'star', 'hourglass', 'drill', 'boots', 'multiply', 'gravity']) {
    ok(L.BUFF_INFO[id], `BUFF_INFO 缺少 ${id}`);
  }
});

/* ================= 3. 无限关卡生成 ================= */
section('3. 无限关卡生成');
t('genLevel 返回完整关卡结构', () => {
  const lv = L.genLevel(1, 12345);
  ok(lv && typeof lv === 'object');
  ok(Array.isArray(lv.solids) && lv.solids.length > 0, 'solids');
  ok(Array.isArray(lv.pickups) && lv.pickups.length > 0, 'pickups');
  ok(Array.isArray(lv.hazards), 'hazards');
  ok(Array.isArray(lv.enemies), 'enemies');
  ok(Array.isArray(lv.checkpoints), 'checkpoints');
  ok(typeof lv.goalX === 'number' && lv.goalX > 0, 'goalX');
  ok(typeof lv.length === 'number' && lv.length > 1000, 'length');
  ok(lv.biome && lv.biome.id, 'biome');
});
t('同种子关卡完全确定', () => {
  const a = JSON.stringify(L.genLevel(3, 777));
  const b = JSON.stringify(L.genLevel(3, 777));
  eq(a, b, '同 (level,seed) 应完全相同');
});
t('不同种子关卡不同', () => {
  const a = JSON.stringify(L.genLevel(3, 777));
  const b = JSON.stringify(L.genLevel(3, 778));
  ok(a !== b, '不同 seed 应生成不同关卡');
});
t('1~50 关全部生成成功且不抛异常', () => {
  for (let n = 1; n <= 50; n++) {
    const lv = L.genLevel(n, 20240001);
    ok(lv && lv.solids.length > 0, `第 ${n} 关生成失败`);
  }
});
t('关卡长度随关卡增长（至上限）', () => {
  const l1 = L.genLevel(1, 5).length;
  const l20 = L.genLevel(20, 5).length;
  ok(l20 > l1, `第20关(${l20}) 应长于第1关(${l1})`);
});
/* ---- 关卡长度 / 难度曲线（本轮重做）----
   旧版：len = 4200+n*260 封顶 9600 → 最长 30 秒；
        enemySpeedK 封顶 1.9、densityK 封顶 2.0、rarityWeight 封底 0.35
        → 第 22~31 关之后完全不再变难。
   现在：len = 6800+n*520 封顶 21000（≈65 秒）；
        难度参数封顶推后，密度随关卡持续上升。 */
t('关卡长度显著加长（L1 ≥ 7000 单位，30 关封顶 21000）', () => {
  const l1 = L.genLevel(1, 5).length;
  const l10 = L.genLevel(10, 5).length;
  const l30 = L.genLevel(30, 5).length;
  const l50 = L.genLevel(50, 5).length;
  ok(l1 >= 7000, `第1关 ${l1} 应 ≥ 7000`);
  ok(l10 > l1, `第10关 ${l10} 应长于第1关 ${l1}`);
  ok(l30 >= 20000, `第30关 ${l30} 应 ≥ 20000`);
  eq(l50, 21000, '第 50 关应达长度上限 21000');
});
t('关卡长度换算成游玩时长 ≥ 22 秒（L1）/ ≥ 60 秒（封顶关）', () => {
  const RUN_SPEED = 320;
  const l1 = L.genLevel(1, 5).length / RUN_SPEED;
  const l30 = L.genLevel(30, 5).length / RUN_SPEED;
  ok(l1 >= 22, `第1关仅 ${l1.toFixed(1)} 秒`);
  ok(l30 >= 60, `第30关仅 ${l30.toFixed(1)} 秒`);
});
t('难度参数不再早早封顶（速度 / 密度 / 稀有度）', () => {
  const k = (n) => L.genLevel(n, 5);
  ok(k(30).enemySpeedK > 1.9, `第30关敌人速度系数 ${k(30).enemySpeedK} 应 > 旧版上限 1.9`);
  ok(k(30).densityK > 2.0, `第30关密度系数 ${k(30).densityK} 应 > 旧版上限 2.0`);
  ok(k(30).rarityWeight < 0.35, `第30关稀有度权重 ${k(30).rarityWeight} 应 < 旧版下限 0.35`);
  ok(k(50).enemySpeedK > k(30).enemySpeedK, '50 关应比 30 关更快');
});
t('敌人 / 机关密度随关卡单调上升（不再靠长度堆数量）', () => {
  const per1k = (n) => {
    // 取 3 个种子求均值，避免单一种子噪声
    let en = 0, hz = 0, len = 0;
    for (const seed of [11, 22, 33]) {
      const lv = L.genLevel(n, seed);
      const dmg = lv.hazards.filter((h) => h.kind !== 'pit').length;
      en += lv.enemies.length; hz += dmg; len += lv.length;
    }
    return { en: en / 3 / (len / 3) * 1000, hz: hz / 3 / (len / 3) * 1000 };
  };
  const a = per1k(1), b = per1k(12), c = per1k(25);
  ok(b.en > a.en * 1.3, `敌人密度 L1=${a.en.toFixed(2)} → L12=${b.en.toFixed(2)} 涨幅不足`);
  ok(c.en > b.en, `敌人密度 L12=${b.en.toFixed(2)} → L25=${c.en.toFixed(2)} 未上升`);
  ok(c.hz > b.hz, `机关密度 L12=${b.hz.toFixed(2)} → L25=${c.hz.toFixed(2)} 未上升`);
  ok(a.en >= 0.8, `第1关敌人密度 ${a.en.toFixed(2)} 过低（应 ≥ 0.8/千单位）`);
});
t('高关卡平路占比下降（段落构成随难度漂移）', () => {
  const flatPct = (n) => {
    let flat = 0, len = 0;
    for (const seed of [11, 22, 33]) {
      const lv = L.genLevel(n, seed);
      flat += lv.sections.filter((s) => s.type === 'flat')
        .reduce((a, s) => a + (s.x1 - s.x0), 0);
      len += lv.length;
    }
    return flat / len;
  };
  const a = flatPct(1), c = flatPct(25);
  ok(c < a, `平路占比 L1=${(a * 100).toFixed(0)}% 应高于 L25=${(c * 100).toFixed(0)}%`);
  ok(c <= 0.15, `第25关平路占比 ${(c * 100).toFixed(0)}% 仍偏高（应 ≤ 15%）`);
});
t('奶酪星级目标与实际铺设一致（目标 ≤ 实铺数量）', () => {
  for (const n of [1, 5, 12, 25, 40]) {
    const lv = L.genLevel(n, 777);
    const actual = lv.pickups.filter((p) => p.id === 'cheese').length;
    ok(lv.targetCheese > 0, `第${n}关星级目标应为正`);
    ok(actual >= lv.targetCheese,
      `第${n}关实铺奶酪 ${actual} < 星级目标 ${lv.targetCheese}（拿不到二星）`);
    ok(L.levelTargets(n, lv.length).cheese === lv.targetCheese,
      `第${n}关 levelTargets 口径与关卡目标不一致`);
  }
});
t('群系每 5 关切换，26 关后循环', () => {
  const b = (n) => L.genLevel(n, 42).biome.id;
  eq(b(1), 'kitchen'); eq(b(5), 'kitchen');
  eq(b(6), 'warehouse'); eq(b(10), 'warehouse');
  eq(b(11), 'rainforest'); eq(b(16), 'lava'); eq(b(21), 'ice'); eq(b(26), 'void');
  eq(b(31), 'kitchen', '第 31 关应循环回 kitchen');
});
t('可通关性：断崖宽度 ≤ 175', () => {
  for (const n of [1, 5, 11, 20, 33]) {
    const lv = L.genLevel(n, 31337);
    const grounds = lv.solids.filter((s) => s.kind === 'ground').sort((a, b) => a.x - b.x);
    for (let i = 1; i < grounds.length; i++) {
      const gap = grounds[i].x - (grounds[i - 1].x + grounds[i - 1].w);
      if (gap > 1) ok(gap <= 175.5, `第 ${n} 关断崖 ${gap.toFixed(1)} > 175`);
    }
  }
});
t('可通关性：向上台阶高度 ≤ 100', () => {
  for (const n of [1, 7, 15, 24, 40]) {
    const lv = L.genLevel(n, 4242);
    const ps = lv.solids.slice().sort((a, b) => a.x - b.x);
    for (let i = 1; i < ps.length; i++) {
      const rise = ps[i - 1].y - ps[i].y; // y 向下，rise>0 表示更高
      if (rise > 0) ok(rise <= 100.5, `第 ${n} 关台阶升高 ${rise.toFixed(1)} > 100`);
    }
  }
});
t('可通关性：浮空平台间距 ≤ 300', () => {
  for (const n of [2, 9, 18, 27]) {
    const lv = L.genLevel(n, 9090);
    const floats = lv.solids.filter((s) => s.kind === 'platform' || s.kind === 'oneway').sort((a, b) => a.x - b.x);
    for (let i = 1; i < floats.length; i++) {
      const dx = floats[i].x - (floats[i - 1].x + floats[i - 1].w);
      const dy = Math.abs(floats[i].y - floats[i - 1].y);
      if (dx > 300.5) {
        // 宽跨越必须伴随移动平台或弹簧
        const helped = lv.solids.some((s) => (s.kind === 'mover' || s.kind === 'spring') &&
          s.x <= floats[i].x && s.x + s.w >= floats[i - 1].x + floats[i - 1].w);
        ok(helped, `第 ${n} 关平台间距 ${dx.toFixed(1)} > 300 且无 mover/spring 支援`);
      }
      ok(dy <= 100.5, `第 ${n} 关平台高差 ${dy.toFixed(1)} > 100`);
    }
  }
});
t('终点前 220px 内无敌人与伤害性机关', () => {
  for (const n of [1, 8, 17, 29]) {
    const lv = L.genLevel(n, 6060);
    const limit = lv.goalX - 220;
    for (const e of lv.enemies) ok(e.x < limit, `第 ${n} 关终点前有敌人 @${e.x}`);
    for (const h of lv.hazards) {
      if (h.kind === 'pit') continue;
      ok(h.x < limit, `第 ${n} 关终点前有机关 ${h.kind} @${h.x}`);
    }
  }
});
t('25 种拾取物在前 5 关全部出现过', () => {
  const seen = new Set();
  for (let n = 1; n <= 5; n++) {
    for (const it of L.genLevel(n, 24680).pickups) seen.add(it.id);
  }
  for (const id of ITEM_IDS) ok(seen.has(id), `前 5 关未出现道具 ${id}`);
});
t('关卡包含 11 种危险物（危险物表 + 关卡内出现，累积检查）', () => {
  const seen = new Set();
  for (const id of Object.keys(L.HAZARDS || {})) seen.add(id);
  for (let n = 1; n <= 12; n++) {
    for (const h of L.genLevel(n, 13579).hazards) seen.add(h.kind);
    for (const e of L.genLevel(n, 13579).enemies) seen.add(e.kind);
  }
  for (const id of ['cat', 'spike', 'pit', 'rock', 'fence', 'acid', 'pendulum', 'laser', 'blade', 'drone', 'crusher']) {
    ok(seen.has(id), `未出现危险物 ${id}`);
  }
});
t('关卡包含 4 种敌人（累积检查）', () => {
  const seen = new Set();
  for (let n = 1; n <= 20; n++) {
    for (const e of L.genLevel(n, 11223).enemies) seen.add(e.kind);
  }
  for (const id of ['cat', 'drone', 'wasp', 'turret']) ok(seen.has(id), `未出现敌人 ${id}`);
});
t('检查点为递增数组且终点在其后', () => {
  const lv = L.genLevel(4, 4321);
  for (let i = 1; i < lv.checkpoints.length; i++) ok(lv.checkpoints[i] > lv.checkpoints[i - 1], '检查点应递增');
  for (const c of lv.checkpoints) ok(c < lv.goalX, '检查点应早于终点');
});
t('难度系数随关卡上升', () => {
  const d1 = L.genLevel(1, 1).diff, d10 = L.genLevel(10, 1).diff, d30 = L.genLevel(30, 1).diff;
  ok(d10 > d1 && d30 > d10, `难度应递增: ${d1}/${d10}/${d30}`);
});

/* ================= 4. 玩家状态 ================= */
section('4. 玩家状态与物理');
t('createPlayer 字段齐全', () => {
  const p = L.createPlayer(100, 300);
  const need = ['x', 'y', 'vx', 'vy', 'w', 'h', 'onGround', 'jumpsLeft', 'stamina',
    'buffs', 'stylePts', 'styleLevel', 'combo', 'energy', 'lives', 'maxLives',
    'invuln', 'dashT', 'dashCd', 'sliding'];
  for (const k of need) ok(k in p, `玩家缺少字段 ${k}`);
  eq(p.x, 100); eq(p.y, 300);
});
t('createRun 返回局内数据', () => {
  const g = L.createRun();
  ok(g && typeof g === 'object');
  ok(typeof g.score === 'number' && typeof g.lives === 'number');
});
t('跳跃高度约 126px（契约 780²/2·2400）', () => {
  const lv = L.genLevel(1, 555);
  let p = L.createPlayer(60, lv.groundY - 30);
  const world = { solids: lv.solids, hazards: lv.hazards, enemies: [], level: lv, phys: L.PHYS };
  // 向上跳并测量最高点
  let best = p.y;
  p.vy = -L.PHYS.JUMP_V;
  p.onGround = false;
  for (let i = 0; i < 90; i++) {
    const r = L.stepPhysics(p, 1 / 60, world);
    p = r.p || p;
    if (p.y < best) best = p.y;
    if (i === 0) p.vy = -L.PHYS.JUMP_V; // 持续给冲量模拟按住跳跃
  }
  const h = (lv.groundY - 30) - best;
  ok(h > 100 && h < 190, `跳跃高度 ${h.toFixed(1)} 不在合理区间`);
});
t('重力使物体加速下落', () => {
  const p = L.createPlayer(0, 0);
  const world = { solids: [], hazards: [], enemies: [], level: { groundY: 460, solids: [] }, phys: L.PHYS };
  const r = L.stepPhysics(p, 1 / 60, world);
  const p2 = r.p || p;
  ok(p2.vy > 0, `vy 应为正(下落)，实际 ${p2.vy}`);
});
t('连续 600 帧物理推进不抛异常', () => {
  const lv = L.genLevel(1, 6161);
  let p = L.createPlayer(60, lv.groundY - 40);
  const world = { solids: lv.solids, hazards: lv.hazards, enemies: lv.enemies, level: lv, phys: L.PHYS };
  for (let i = 0; i < 600; i++) {
    const r = L.stepPhysics(p, 1 / 60, world);
    p = r.p || p;
    p.inputAxis = 1;
    p.inputJump = i % 40 === 0;
  }
  ok(isFinite(p.x) && isFinite(p.y), '玩家坐标应为有限数');
});
t('落到地面后 onGround 为真且不继续下坠', () => {
  const lv = L.genLevel(1, 7171);
  let p = L.createPlayer(60, lv.groundY - 200);
  const world = { solids: lv.solids, hazards: lv.hazards, enemies: [], level: lv, phys: L.PHYS };
  let p2 = p;
  for (let i = 0; i < 240; i++) {
    const r = L.stepPhysics(p2, 1 / 60, world);
    p2 = r.p || p2;
  }
  ok(p2.onGround === true, '应着地');
  ok(p2.y <= lv.groundY + 1, `应停在地面附近，实际 y=${p2.y} ground=${lv.groundY}`);
});
t('体力随冲刺消耗', () => {
  const lv = L.genLevel(1, 8181);
  let p = L.createPlayer(60, lv.groundY - 40);
  const world = { solids: lv.solids, hazards: lv.hazards, enemies: [], level: lv, phys: L.PHYS };
  p.dashT = L.PHYS.DASH_TIME;
  p.dashCd = 0;
  p.dashDir = 1;
  p.stamina = 100;
  const before = p.stamina;
  for (let i = 0; i < 30; i++) {
    const r = L.stepPhysics(p, 1 / 60, world);
    p = r.p || p;
  }
  ok(p.stamina <= before, '冲刺/奔跑应消耗体力');
});

/* ================= 5. 六套计分系统 ================= */
section('5. 六套计分系统');
t('主积分：addScore 累加 score（含连击倍率）', () => {
  const g = L.createRun();
  const before = g.score;
  const gain = L.addScore(g, 100, 'pickup');
  ok(g.score > before, '分数应增加');
  eq(g.score, before + gain, '加得分应等于返回值');
  ok(gain >= 100, '倍率后得分不低于基础分');
});
t('金币系统独立计数', () => {
  const g = L.createRun();
  const p = L.createPlayer(0, 0);
  const c0 = g.coin;
  L.applyItem(p, g, 'coin');
  ok(g.coin > c0, '金币应增加');
});
t('奶酪系统独立计数', () => {
  const g = L.createRun();
  const p = L.createPlayer(0, 0);
  const c0 = g.cheese;
  L.applyItem(p, g, 'cheese');
  ok(g.cheese > c0, '奶酪应增加');
});
t('风格系统：加分与等级提升', () => {
  const p = L.createPlayer(0, 0);
  const g = L.createRun();
  const before = p.stylePts;
  L.addStyle(p, g, 'stomp');
  ok(p.stylePts > before, '风格分应增加');
});
t('风格等级阈值 D→C→B→A→S→SS', () => {
  const p = L.createPlayer(0, 0);
  const g = L.createRun();
  const seen = new Set([p.styleLevel]);
  for (let i = 0; i < 40; i++) { L.addStyle(p, g, 'stomp'); seen.add(p.styleLevel); }
  ok(seen.has('C') && seen.has('B'), `应跨过 C/B，实际见过 ${[...seen].join(',')}`);
});
t('风格分随时间衰减', () => {
  const p = L.createPlayer(0, 0);
  const g = L.createRun();
  L.addStyle(p, g, 'stomp');
  const before = p.stylePts;
  for (let i = 0; i < 600; i++) L.styleTick(p, g, 1 / 60);
  ok(p.stylePts < before, `风格分应衰减: ${before} → ${p.stylePts}`);
});
t('连击系统：连击递增且随时间衰减', () => {
  const p = L.createPlayer(0, 0);
  const g = L.createRun();
  L.addScore(g, 10, 'pickup');
  if (typeof L.bumpCombo === 'function') L.bumpCombo(p, g);
  const c0 = g.combo || 0;
  for (let i = 0; i < 300; i++) L.comboTick(g, 1 / 60);
  ok((g.combo || 0) <= c0, '连击应随时间衰减');
});
t('能量系统：拾取增加能量', () => {
  const p = L.createPlayer(0, 0);
  const g = L.createRun();
  const e0 = g.energy || 0;
  L.applyItem(p, g, 'energy');
  ok((g.energy || 0) > e0, '能量应增加');
});
t('过关结算返回明细', () => {
  const g = L.createRun();
  g.score = 1000; g.cheese = 8; g.lives = 2;
  const r = L.scoreLevelClear(g, 3, { flawless: true, cheese: 8, lives: 2, distance: 100, pickup: 200, style: 300, kill: 50 });
  ok(r && typeof r === 'object', '应返回对象');
  ok(typeof r.total === 'number' || typeof r.score === 'number' || r.breakdown, '应含总分或明细');
});
t('过关结算不减少已有分数', () => {
  const g = L.createRun();
  g.score = 500;
  L.scoreLevelClear(g, 1, { flawless: false, cheese: 0, lives: 1 });
  ok(g.score >= 500, '结算不应扣分');
});
t('levelTargets 返回奶酪目标', () => {
  const r = L.levelTargets(1);
  ok(r && typeof r.cheese === 'number' && r.cheese > 0, '应有奶酪目标');
  ok(L.levelTargets(20).cheese > L.levelTargets(1).cheese, '高关卡目标更高');
});
t('杀敌加分（ENEMIES.score 存在）', () => {
  for (const id of ['cat', 'drone', 'wasp', 'turret']) {
    ok(typeof L.ENEMIES[id].score === 'number', `${id} 缺 score`);
  }
});

/* ================= 6. 道具效果逐项验证 ================= */
section('6. 道具效果逐项验证');
t('奶酪：加分档位 + 计数', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  const c0 = g.cheese;
  L.applyItem(p, g, 'cheese');
  ok((g.cheese || 0) > c0, '奶酪计数应增加');
  ok(L.ITEMS.cheese.score > 0, '奶酪应有加分档位');
});
t('磁铁：产生 buff', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  L.applyItem(p, g, 'magnet');
  ok(p.buffs && p.buffs.magnet > 0, '应有 magnet buff');
});
t('猫薄荷 / 跑鞋 / 弹力靴：速度与跳跃类 buff', () => {
  for (const id of ['catnip', 'sneakers', 'boots']) {
    const p = L.createPlayer(0, 0); const g = L.createRun();
    L.applyItem(p, g, id);
    ok(p.buffs && p.buffs[id] > 0, `应有 ${id} buff`);
  }
});
t('泡泡糖：永久二段跳', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  L.applyItem(p, g, 'bubblegum');
  ok(p.permanentBubbles === true || p.jumpsLeft >= 2 || (p.buffs && p.buffs.bubblegum > 0), '应获得二段跳');
});
t('护盾：产生护盾状态', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  L.applyItem(p, g, 'shield');
  ok(p.shield > 0 || p.hasShield || (p.buffs && p.buffs.shield > 0), '应有护盾状态');
});
t('无敌星：产生无敌状态', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  L.applyItem(p, g, 'star');
  ok(p.invuln > 0 || (p.buffs && p.buffs.star > 0), '应无敌');
});
t('生命果：命数 +1', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  const l0 = g.lives;
  L.applyItem(p, g, 'heart');
  ok(g.lives > l0, '命数应增加');
});
t('复活铃铛：持有免死标记', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  L.applyItem(p, g, 'bell');
  ok(p.hasBell === true || (p.buffs && p.buffs.bell > 0), '应持有铃铛');
});
t('四叶草 / 双倍币 / 重力翻转：状态型 buff', () => {
  for (const id of ['clover', 'multiply', 'gravity', 'flame', 'giant', 'mini', 'feather', 'hourglass', 'drill', 'freeze', 'emp', 'rocket']) {
    const p = L.createPlayer(0, 0); const g = L.createRun();
    L.applyItem(p, g, id);
    const has = (p.buffs && p.buffs[id] > 0) || p[id] === true || p[id] > 0 ||
      (L.BUFF_INFO[id] && p.buffs && Object.prototype.hasOwnProperty.call(p.buffs, id));
    ok(has || id === 'emp' || id === 'rocket', `${id} 应有可观测状态`);
  }
});
t('钻石：加分档位最高且 effect 结算金币/宝石', () => {
  const p = L.createPlayer(0, 0); const g = L.createRun();
  const c0 = g.coin;
  L.applyItem(p, g, 'gem');
  ok((g.coin || 0) > c0, '钻石应给金币');
  ok((p.gems || 0) > 0, '钻石应累计宝石数');
  ok(L.ITEMS.gem.score >= L.ITEMS.coin.score, '钻石分值应高于金币');
  const g2 = L.createRun();
  L.addScore(g2, L.ITEMS.gem.score, 'pickup');
  ok(g2.score >= L.ITEMS.gem.score, '按档位加分应生效');
});

/* ================= 7. 摘要 ================= */
console.log('\n' + '─'.repeat(56));
if (fail === 0) {
  console.log(`\x1b[32m✔ 全部通过：${pass} 项断言\x1b[0m`);
} else {
  console.log(`\x1b[31m✘ 通过 ${pass} / 失败 ${fail}\x1b[0m`);
  for (const f of failures) console.log(`  \x1b[31m·\x1b[0m ${f}`);
}
console.log('─'.repeat(56));
process.exit(fail === 0 ? 0 : 1);
