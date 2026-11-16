// 捕鱼达人 · 纯逻辑回归（node test/run.mjs）
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../src/config.js');
require('../src/logic.js');

const FM = globalThis.FM;
const C = FM.CONFIG;
const L = FM.LOGIC;
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// clamp
ok(L.clamp(5, 0, 3) === 3, 'clamp hi');
ok(L.clamp(-2, 0, 3) === 0, 'clamp lo');
ok(L.clamp(1.5, 0, 3) === 1.5, 'clamp mid');

// catchChance
ok(L.catchChance(1, 1) === 1, 'power>=weight 必中');
ok(L.catchChance(8, 5) === 1, 'power 大于体重必中');
ok(Math.abs(L.catchChance(1, 5) - 0.4) < 1e-9, 'power1/weight5 = 0.4');
ok(Math.abs(L.catchChance(3, 5) - 0.7) < 1e-9, 'power3/weight5 = 0.7');
ok(L.catchChance(1, 100) < 0.26, '低功率有下限');
ok(L.catchChance(4, 5) < 0.96, '非必中有上限');
ok(L.catchChance(2, 5) > L.catchChance(1, 5), '功率越高命中率越高');

// resolveCatch（注入 rng）
ok(L.resolveCatch(3, { weight: 5 }, () => 0) === true, 'rng=0 命中');
ok(L.resolveCatch(1, { weight: 5 }, () => 0.99) === false, 'rng=0.99 未命中');
ok(L.resolveCatch(9, { weight: 1 }, () => 0.99) === true, '必中忽略 rng');

// pickSpecies
ok(L.pickSpecies(() => 0) === 'clown', 'rng=0 取第一档 clown');
ok(L.pickSpecies(() => 0.999999) === 'whale', 'rng→1 取最后一档 whale');
{
  const keys = Object.keys(C.species);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(L.pickSpecies(() => (i % 997) / 997));
  ok(seen.size >= 6, '加权抽样覆盖全部稀有档');
  const counts = {};
  for (let i = 0; i < 20000; i++) {
    const k = L.pickSpecies(Math.random);
    counts[k] = (counts[k] || 0) + 1;
  }
  ok(counts.clown > counts.puffer && counts.puffer > counts.whale, '稀有度单调：小丑鱼 > 河豚 > 鲸鱼');
}

// combo
ok(L.comboMultiplier(0) === 1, 'streak0 → ×1');
ok(L.comboMultiplier(1) === 1, 'streak1 → ×1');
ok(L.comboMultiplier(2) === 1.2, 'streak2 → ×1.2');
ok(L.comboMultiplier(4) === 1.5, 'streak4 → ×1.5');
ok(L.comboMultiplier(7) === 2, 'streak7 → ×2');
ok(L.comboMultiplier(11) === 3, 'streak11 → ×3');
ok(L.comboMultiplier(99) === 3, 'streak 溢出封顶 ×3');

// coins / bomb
ok(L.coinsFor(10, 1.5) === 15, '金币按倍率四舍五入');
ok(L.coinsFor(5, 1.2) === 6, '金币倍率取整');
ok(L.coinsFor(0, 3) === 0, '零价值');
ok(L.bombCharge(0) === 14, '炸弹充能 +14');
ok(L.bombCharge(90) === 100, '炸弹充能封顶');

// CONFIG 不变式
ok(C.shotCost.length === 5 && C.netRadius.length === 5 && C.fireCd.length === 5, '五档数组长度一致');
ok(C.shotCost.every((v, i) => i === 0 || v > C.shotCost[i - 1]), '每发消耗递增');
ok(C.netRadius.every((v, i) => i === 0 || v > C.netRadius[i - 1]), '网半径递增');
ok(Object.keys(C.species).length === 7, '七种鱼');
ok(C.species.whale.value === Math.max(...Object.values(C.species).map(s => s.value)), '鲸鱼价值最高');
ok(C.species.whale.rarity === Math.min(...Object.values(C.species).map(s => s.rarity)), '鲸鱼最稀有');
ok(Object.values(C.species).every(s => s.weight > 0 && s.speed > 0 && s.rarity > 0), '鱼种参数均为正');

// 经济单调：功率越高，期望收益不降
{
  const fish = C.species.gold;
  const expected = p => L.catchChance(p, fish.weight) * C.shotCost[p - 1];
  ok(expected(5) >= expected(1), '高功率期望收益不低');
}

console.log(`[pass] ${n} 项逻辑断言全绿`);
