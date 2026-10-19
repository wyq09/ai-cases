#!/usr/bin/env node
/* 泡泡堂 AI 仿真器：全 AI 对局，统计死因分布与 AI 行为指标
 * 运行：ego-browser nodejs < test/ai-sim.mjs
 * 配置：写 /tmp/ba-ai-cfg.json（ego-browser 不继承 shell 环境变量）
 *   { "rounds": 24, "diff": "normal", "map": "garden" }
 */
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:8771';
let CFG = { rounds: 24, diff: 'normal', map: 'garden' };
try { CFG = JSON.parse(readFileSync('/tmp/ba-ai-cfg.json', 'utf8')); } catch (e) {}
const ROUNDS = +(CFG.rounds || 24);
const DIFF = CFG.diff || 'normal';
const MAP = CFG.map || 'garden';

const task = await taskSpace('泡泡堂 AI 仿真');
const page = task.page('p1');
await page.goto(`${BASE}/?reset=1&v=${Date.now()}`);
await page.waitForFunction(() => window.__ba && window.__ba.phase === 'idle', undefined, { timeout: 20000 });

const raw = await page.evaluate(async (opt) => {
  const B = window.__ba;
  const out = [];
  for (let r = 0; r < opt.rounds; r++) {
    const seed = 1000 + r * 977;
    B.start({ mode: 'ffa', humans: 0, players: 4, diff: opt.diff, map: opt.map, winsNeeded: 99, seed });
    B.fastForward(3.3);                       // 跳过倒计时
    const S = B.state;
    const rec = S.players.map((p) => ({
      id: p.id, name: p.name, alive: true, death: null,
      bombs: 0, blocks: 0, kills: 0, trapSelf: false
    }));
    const wasTrapped = S.players.map(() => false);
    let t = 0;
    while (S.phase === 'play' && t < 170) {
      B.fastForward(0.1);
      t += 0.1;
      for (let i = 0; i < S.players.length; i++) {
        const p = S.players[i];
        if (p.trapped && !wasTrapped[i]) {
          wasTrapped[i] = true;
          if (p.trapSelf) rec[i].trapSelf = true;     // 被自己的泡泡困住 = 没跑掉
        }
        if (!p.trapped) wasTrapped[i] = false;
        if (rec[i].alive && !p.alive) {
          rec[i].alive = false;
          rec[i].death = {
            cause: p.deathCause || '?',
            by: p.deathById,
            self: !!p.deathSelf,
            t: Math.round(t * 10) / 10
          };
        }
      }
    }
    // 收尾：把还活着的人按存活时间记账
    const alive = S.players.filter((p) => p.alive).length;
    for (let i = 0; i < S.players.length; i++) {
      const p = S.players[i];
      rec[i].bombs = p.statBombs || 0;
      rec[i].blocks = p.statBlocks || 0;
      rec[i].kills = p.statKills || 0;
    rec[i].bKill = (p.ai && p.ai.bombKillN) || 0;
    rec[i].bBox = (p.ai && p.ai.bombBoxN) || 0;
      if (rec[i].alive) rec[i].death = { cause: 'survived', by: null, self: false, t: Math.round(t * 10) / 10 };
    }
    out.push({
      round: r, seed, map: opt.map, diff: opt.diff,
      duration: Math.round(t * 10) / 10,
      aliveAtEnd: alive,
      winner: S.winner ? S.winner.id : null,
      rec
    });
  }
  return out;
}, { rounds: ROUNDS, diff: DIFF, map: MAP });

/* ---------------- 汇总 ---------------- */
const stat = {
  rounds: raw.length,
  deaths: 0, selfKill: 0, enemyKill: 0, survived: 0,
  causes: {}, kills: 0, bombs: 0, blocks: 0,
  trapSelf: 0,
  survivalSum: 0, deathTimes: [], roundsWithSelfKill: 0
};
for (const g of raw) {
  let selfInRound = 0;
  for (const r of g.rec) {
    stat.bombs += r.bombs; stat.blocks += r.blocks; stat.kills += r.kills;
    stat.bKill = (stat.bKill || 0) + (r.bKill || 0);
    stat.bBox = (stat.bBox || 0) + (r.bBox || 0);
    if (r.trapSelf) stat.trapSelf++;
    if (r.death.cause === 'survived') { stat.survived++; stat.survivalSum += r.death.t; continue; }
    stat.deaths++;
    stat.causes[r.death.cause] = (stat.causes[r.death.cause] || 0) + 1;
    stat.deathTimes.push(r.death.t);
    if (r.death.self) { stat.selfKill++; selfInRound++; }
    else stat.enemyKill++;
  }
  if (selfInRound) stat.roundsWithSelfKill++;
}
const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
const meanDeath = avg(stat.deathTimes);
const medianDeath = stat.deathTimes.length
  ? [...stat.deathTimes].sort((a, b) => a - b)[Math.floor(stat.deathTimes.length / 2)] : 0;

console.log(`\n=== 泡泡堂 AI 仿真：${DIFF} / ${MAP} / ${ROUNDS} 局 ===`);
console.log(`死亡 ${stat.deaths}  存活到结束 ${stat.survived}  （共 ${raw.length * 4} 人次）`);
console.log(`死因分布：`, stat.causes);
console.log(`自炸致死 ${stat.selfKill}  (${stat.deaths ? (stat.selfKill / stat.deaths * 100).toFixed(1) : 0}%)   死于他人 ${stat.enemyKill}`);
console.log(`被自己的泡泡困住（没跑掉）: ${stat.trapSelf} 次 ＝ 人均 ${(stat.trapSelf / (raw.length * 4)).toFixed(2)}`);
console.log(`有自炸的局数：${stat.roundsWithSelfKill} / ${stat.rounds}`);
console.log(`平均死亡时间 ${meanDeath.toFixed(1)}s  中位数 ${medianDeath}s  平均存活 ${(stat.survivalSum / Math.max(1, stat.survived + stat.deaths)).toFixed(1)}s`);
console.log(`人均：放泡 ${(stat.bombs / (raw.length * 4)).toFixed(1)}  炸箱 ${(stat.blocks / (raw.length * 4)).toFixed(1)}  击杀 ${(stat.kills / (raw.length * 4)).toFixed(2)}`);
console.log(`总击杀 ${stat.kills}（死于他人 ${stat.enemyKill}，自炸 ${stat.selfKill}）`);
console.log(`放泡理由：想杀人 ${stat.bKill}  想炸箱 ${stat.bBox}`);

if (process.env.BA_VERBOSE) {
  console.log('\n逐局：');
  for (const g of raw) {
    const line = g.rec.map((r) => `${r.id}:${r.death.cause}${r.death.self ? '(自己)' : r.death.by ? '(被' + r.death.by + ')' : ''}@${r.death.t}s`).join(' | ');
    console.log(`  #${g.round} seed=${g.seed} dur=${g.duration}s  ${line}`);
  }
}

/* ---------------- 附测：AI 对"不动的玩家"的威胁度 ----------------
 * 1 个真人（不操作）+ 3 个 AI，看真人多久被打死——直观反映 AI 的压迫感 */
const threat = await page.evaluate(async (opt) => {
  const B = window.__ba;
  const out = [];
  for (let r = 0; r < opt.rounds; r++) {
    B.start({ mode: 'ffa', humans: 1, players: 4, diff: opt.diff, map: opt.map, winsNeeded: 99, seed: 7000 + r * 613 });
    B.fastForward(3.3);
    const S = B.state;
    const human = S.players[0];
    let t = 0, dead = null;
    while (S.phase === 'play' && t < 170 && !dead) {
      B.fastForward(0.1);
      t += 0.1;
      if (!human.alive) dead = Math.round(t * 10) / 10;
    }
    out.push(dead || null);
  }
  return out;
}, { rounds: Math.max(8, Math.round(ROUNDS / 2)), diff: DIFF, map: MAP });
const killed = threat.filter((x) => x != null);
console.log(`\n【威胁度】不操作的真人被 AI 打死：${killed.length}/${threat.length} 局` +
  (killed.length ? `，平均 ${(killed.reduce((a, b) => a + b, 0) / killed.length).toFixed(1)}s（最快 ${Math.min(...killed)}s）` : '，AI 没能杀死一个完全不动的玩家'));

await task.finish({ keep: [] });
