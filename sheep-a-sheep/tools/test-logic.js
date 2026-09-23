// logic.js node 单测：生成/求解/模拟器（require shim）
global.window = global;
require('../src/core.js');
require('../src/logic.js');
var L = window.SH.logic, C = window.SH.core;
var cfg = L.DEFAULT_CFG;

function assert(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!cond) process.exitCode = 1;
}

// 1. 基本生成：各关牌数 3 倍数、kind 均匀、z 结构
for (var lv of [1, 2, 5, 8, 12, 20]) {
  var t0 = Date.now();
  var b = L.genLevel(lv, cfg);
  var ms = Date.now() - t0;
  var n = b.tiles.length;
  var ok3 = n % 3 === 0;
  var kindsCnt = {};
  var zSorted = true;
  for (var i = 0; i < n; i++) {
    kindsCnt[b.tiles[i].kind] = (kindsCnt[b.tiles[i].kind] || 0) + 1;
    if (i && b.tiles[i].z < b.tiles[i - 1].z) zSorted = false;
  }
  var kindOk = Object.keys(kindsCnt).length <= b.kinds && Object.values(kindsCnt).every(c => c % 3 === 0);
  assert(`lv${lv} 生成 牌数=${n} kinds=${b.kinds} ${ms}ms`, ok3 && kindOk && zSorted);
}

// 2. 可解性：genLevel 返回的关 solve 应 ok（guaranteed=true）
{
  var b2 = L.genLevel(6, cfg);
  var r = L.solve(b2, cfg.slots, { nodes: 4000 });
  assert('genLevel(6) solve ok', r.ok, r.ok ? r.steps.length + '步' : 'FAIL');
}

// 3. 同关同种子复现
{
  var bA = L.genLevel(3, cfg), bB = L.genLevel(3, cfg);
  var same = bA.tiles.length === bB.tiles.length &&
    bA.tiles.every((t, i) => t.kind === bB.tiles[i].kind && t.gx2 === bB.tiles[i].gx2 && t.gy2 === bB.tiles[i].gy2 && t.z === bB.tiles[i].z);
  assert('同关种子复现', same);
}

// 4. 生成性能：最大关 150 张耗时
{
  var cfgMax = Object.assign({}, cfg, { tilesStart: 150, tilesPerLevel: 0 });
  var t1 = Date.now();
  var bMax = L.genLevel(10, cfgMax);
  var msMax = Date.now() - t1;
  assert(`大牌量生成 ${bMax.tiles.length}张 ${msMax}ms`, msMax < 3000);
}

// 5. pick：每步可执行性（模拟 demo 通关）
{
  var b5 = L.genLevel(2, cfg);
  // 逐步执行 pick
  var aliveSet = new Set(b5.tiles.map(t => t.id));
  var slot = [], slotCnt = {}, steps = 0, died = false;
  var cov = L.buildCover(b5.tiles);
  var remBlk = {};
  b5.tiles.forEach((t, i) => { remBlk[t.id] = cov.blockers[i].length; });
  while (aliveSet.size && steps < 500) {
    var sub = Object.assign({}, b5, { tiles: b5.tiles.filter(t => aliveSet.has(t.id)).map(t => Object.assign({}, t)) });
    // 重映射 id 后 pick 返回的是子数组下标
    var idx = L.pick(sub, cfg.slots, slot.slice());
    if (idx == null || idx < 0) { died = true; break; }
    var tile = sub.tiles[idx];
    slot.push(tile.kind); slotCnt[tile.kind] = (slotCnt[tile.kind] || 0) + 1;
    if (slotCnt[tile.kind] >= 3) { slot = slot.filter(k => { if (k === tile.kind && slotCnt[tile.kind] === 3) return false; return k !== tile.kind; }); slotCnt[tile.kind] = 0; }
    if (slot.length >= cfg.slots && slotCnt[tile.kind] < 3) { died = true; break; }
    aliveSet.delete(tile.id);
    // 更新 remBlk（取走 tile 后其 covers 减）
    var realIdx = b5.tiles.findIndex(t => t.id === tile.id);
    cov.covers[realIdx].forEach(jid => { remBlk[b5.tiles[jid].id]--; });
    steps++;
  }
  assert(`demo 走通 lv2 (${steps}步)`, !died && aliveSet.size === 0);
}

// 6. 难度曲线模拟：各关通过率（调参用）
console.log('--- simulate（skill=0.75 普通玩家）---');
for (var sl of [1, 3, 5, 8, 12, 16]) {
  var t2 = Date.now();
  var sim = L.simulate(120, sl, cfg, 0.75);
  console.log(`  L=${sl}  winRate=${(sim.winRate * 100).toFixed(0)}%  avgSteps=${sim.avgSteps.toFixed(0)}  (${Date.now() - t2}ms)`);
}
console.log('--- simulate（skill=0.95 高手）---');
for (var sh of [1, 5, 10]) {
  var sim2 = L.simulate(120, sh, cfg, 0.95);
  console.log(`  L=${sh}  winRate=${(sim2.winRate * 100).toFixed(0)}%`);
}
