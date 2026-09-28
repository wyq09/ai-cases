/* retro-moto-racer 逻辑单测：node tools/test-logic.js */
global.window = global;
const L = require('../src/logic.js');
let failed = 0;
function ok(cond, name, detail) {
  if (cond) console.log('  ok -', name);
  else { failed++; console.log('  FAIL -', name, detail === undefined ? '' : ':: ' + JSON.stringify(detail)); }
}

// ---------- 赛道构建 ----------
for (let st = 0; st < 3; st++) {
  const t1 = L.buildTrack(st, 41 + st * 100);
  const t2 = L.buildTrack(st, 41 + st * 100);
  ok(t1.n === t2.n && t1.len === t2.len, `stage${st} 赛道种子确定性 n=${t1.n}`);
  ok(t1.cps.length === 2 && t1.cps[0] < t1.cps[1] && t1.cps[1] * L.SEG_LEN < t1.len, `stage${st} 检查点有序且在终点前`, t1.cps);
  ok(t1.n * L.SEG_LEN > t1.len, `stage${st} 有冲线后缓冲道`);
  ok(t1.segs.every(s => s.p1 && s.p2 && s.p1.camera && s.p1.screen), `stage${st} 段结构完整`);
  const props = t1.segs.reduce((a, s) => a + s.props.length, 0);
  ok(props > 40, `stage${st} 道具分布 ${props}`);
}
// 三关长度与预算：50 + 18×2 = 86s
const sims = [];
for (let st = 0; st < 3; st++) {
  const r = L.simulate(st, { difficulty: 'normal' });
  sims.push(r);
  ok(r.phase === 'stagewin' && r.time < 80, `stage${st} 托管可完赛 ${r.time.toFixed(0)}s < 80s`, r);
}

// ---------- 起步与名次 ----------
const race = L.newRace(0, { startRank: 8 });
ok(race.player.id === 7 && race.phase === 'countdown', 'startRank=8 玩家 id=7 倒计时锁车');
ok(race.riders.length === 12 && race.riders.filter(r => r.isPlayer).length === 1, '12 名车手 1 玩家');
const ranks0 = L.rank(race);
ok(race.rank === 8, '起步名次 = 8', race.rank);
const ahead = race.riders.filter(r => !r.isPlayer && r.dist > race.player.dist).length;
ok(ahead === 6, '起步时严格在前 6 人 + 同排并列 1 人（rank=8 已验）', ahead);

// ---------- 物理 ----------
race.phase = 'racing'; race.timeLeft = 999;
const dt = 1 / 60;
for (let i = 0; i < 60 * 10; i++) { L.stepPlayer(race, { steer: 0, throttle: 1, brake: 0, nitro: 0 }, dt); L.stepAI(race, dt); race.events.length = 0; }
ok(race.speed > L.MAX_SPEED * 0.9, '10s 全油门到达 0.9 极速以上', (race.speed / L.MAX_SPEED).toFixed(2));
const spTop = race.speed;
for (let i = 0; i < 30; i++) L.stepPlayer(race, { steer: 0, throttle: 0, brake: 0, nitro: 0 }, dt);
ok(race.speed < spTop, '松油门自然减速');
// 氮气增速
race.nitro = 100;
const sp0 = L.MAX_SPEED * 0.95; race.speed = sp0;
for (let i = 0; i < 20; i++) L.stepPlayer(race, { steer: 0, throttle: 1, brake: 0, nitro: 1 }, dt);
ok(race.speed > sp0 * 1.05, '氮气提速 >5%', (race.speed / sp0).toFixed(3));
ok(race.nitro < 100, '氮气消耗');
// 离心力于弯道外抛
const curveRace = L.newRace(1, { startRank: 8 }); curveRace.phase = 'racing'; curveRace.timeLeft = 999; curveRace.speed = L.MAX_SPEED;
// 找一段弯道把玩家放进去
let ci = curveRace.segs.findIndex(s => Math.abs(s.curve) > 3.5);
if (ci > 0) {
  curveRace.z = ci * L.SEG_LEN; curveRace.playerX = 0;
  const x0 = 0;
  for (let i = 0; i < 30; i++) L.stepPlayer(curveRace, { steer: 0, throttle: 0, brake: 0, nitro: 0 }, dt);
  ok(Math.abs(curveRace.playerX - x0) > 0.05, '弯道离心力外抛', curveRace.playerX.toFixed(2));
} else console.log('  skip - 无急弯段（不可能）');

// ---------- 追撞 ----------
const cr = L.newRace(0, { startRank: 8 }); cr.phase = 'racing'; cr.timeLeft = 999;
cr.speed = L.MAX_SPEED; cr.playerX = cr.riders.find(r => !r.isPlayer).x; cr.z = cr.riders.find(r => !r.isPlayer).z - 100;
const st0 = cr.speed;
for (let i = 0; i < 40; i++) { L.stepPlayer(cr, { steer: 0, throttle: 1, brake: 0, nitro: 0 }, dt); L.stepAI(cr, dt); cr.events.length = 0; }
ok(cr.condition < 100 || cr.events.some(e => e.t === 'bump'), '追撞掉车况');

// ---------- 检查点与过关 ----------
const cp = L.newRace(0, { startRank: 8 }); cp.phase = 'racing'; cp.timeLeft = 10; cp.cpNext = 0;
cp.z = cp.track.cps[0] * L.SEG_LEN - 100; cp.speed = L.MAX_SPEED;
for (let i = 0; i < 20; i++) L.stepPlayer(cp, { steer: 0, throttle: 1, brake: 0, nitro: 0 }, dt);
ok(cp.cpNext === 1 && cp.timeLeft > 20, '过检查点 +18s 且 cpNext 推进', { cpNext: cp.cpNext, tl: +cp.timeLeft.toFixed(1) });
const fin = L.newRace(0, { startRank: 8 }); fin.phase = 'racing'; fin.timeLeft = 999;
fin.z = fin.track.len - 3 * L.SEG_LEN; fin.speed = L.MAX_SPEED;
for (let i = 0; i < 30; i++) L.stepPlayer(fin, { steer: 0, throttle: 1, brake: 0, nitro: 0 }, dt);
ok(fin.phase === 'stagewin', '越线进入 stagewin', fin.phase);
// TIMEUP
const tu = L.newRace(0, { startRank: 8 }); tu.phase = 'racing'; tu.timeLeft = 0.05;
for (let i = 0; i < 6; i++) L.stepPlayer(tu, { steer: 0, throttle: 1, brake: 0, nitro: 0 }, dt);
ok(tu.phase === 'timeup', '时间耗尽 timeup', tu.phase);

// ---------- 名次单调 ----------
const rk = L.newRace(0, { startRank: 8 }); rk.phase = 'racing'; rk.timeLeft = 999;
rk.player.dist = 5000;
const arr = L.rank(rk);
ok(rk.rank === 1, '里程最高 → 第 1', rk.rank);
rk.player.dist = -1e9; L.rank(rk);
ok(rk.rank === 12, '里程最低 → 第 12', rk.rank);

// ---------- 难度分档 ----------
const e = L.simulate(0, { difficulty: 'easy' }), h = L.simulate(0, { difficulty: 'hard' });
ok(e.phase === 'stagewin' && h.phase === 'stagewin', '三难度均可完赛');

console.log(failed ? `\nFAILED: ${failed}` : `\nALL PASS: 全部通过`);
process.exitCode = failed ? 1 : 0;
