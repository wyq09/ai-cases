/* 鼠族跑酷 · MOUSE RUSH — ego-lite UI 回归（第 6 轮：关卡长度 / 难度 / 可通关性）
 * 机器人用真实物理跑通关卡，验证「加长 + 加难后仍然能跑通」，而不是撞墙。
 * 运行：ego-browser nodejs < test/ego-06-traverse.mjs
 */
const BASE = process.env.BA_URL || 'http://127.0.0.1:8781';
const task = await taskSpace('鼠族跑酷 UI 回归');
const page = task.page('p1');
const results = [];
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; results.push('  ✓ ' + n); }
  else { fail++; results.push('  ✗ ' + n + (e ? '  —— ' + e : '')); }
  console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : (e ? '  —— ' + e : '')));
};

await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 1280, height: 720, deviceScaleFactor: 1, mobile: false
});
// 固定种子 → 关卡完全可复现，机器人的推进/死亡数据才是确定的
await page.goto(`${BASE}/index.html?seed=4242&t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(1000);
const st0 = await page.evaluate(() => window.__mp.testState());
if (st0 !== 'playing') {
  await page.click('[data-action="start"]');
  await page.waitForTimeout(500);
}

/* ---------- 机器人跑关 ----------
 * 策略：永远向右；前方没地面 / 有伤害机关 → 起跳；掉出地面 → 二段跳；
 *       被墙挡住（砖墙 80 高）→ 原地起跳。
 * 死亡后按检查点复活，统计推进比与死亡次数。 */
const runs = await page.evaluate(() => {
  const out = [];
  for (const lv of [1, 5, 12, 25]) {
    window.__mp.onAction('setSpeed', { value: 1 });
    window.__mp.startLevel(lv);
    const data = window.__mp.testLevel();
    const grounds = data.solids.filter((s) => s.kind === 'ground').sort((a, b) => a.x - b.x);
    const haz = data.hazards.filter((h) => h.kind !== 'pit');
    const groundAt = (x) => grounds.some((g) => x >= g.x - 2 && x <= g.x + g.w + 2);
    const hazardNear = (x, from, to) => haz.some((h) => h.x > x + from && h.x < x + to);

    let maxX = 0, deaths = 0, jumpHold = 0, frames = 0, stalled = 0;
    const MAXF = 60 * 150;
    while (frames < MAXF) {
      frames++;
      const pl = window.__mp.testPlayer();
      if (!pl) break;
      if (pl.dead) {
        deaths++;
        const cps = data.checkpoints.filter((c) => c <= maxX + 40);
        const cx = cps.length ? cps[cps.length - 1] : data.spawn.x;
        pl.dead = false; pl.deadT = 0; pl.x = cx + 30; pl.vx = 0; pl.vy = 0; pl.invuln = 2.0;
        for (const g of grounds) { if (pl.x >= g.x && pl.x <= g.x + g.w) { pl.y = g.y - pl.h - 2; break; } }
        jumpHold = 0; stalled = 0;
        window.__mp.setTestInput({ axis: 1 });
        window.__mp.fastForward(1 / 60);
        continue;
      }
      if (pl.x > maxX) maxX = pl.x;
      if (pl.x >= data.goalX - 20) break;

      let need = false;
      for (let d = 22; d <= 110; d += 12) { if (!groundAt(pl.x + d)) { need = true; break; } }
      if (!need && hazardNear(pl.x, 10, 85)) need = true;
      let dj = false;
      if (pl.y > data.groundY + 40 && pl.jumpsLeft > 0) dj = true;
      if (pl.onGround && pl.x <= maxX + 0.5) stalled++; else stalled = 0;
      if (stalled > 3 && pl.onGround && pl.jumpsLeft > 0) need = true;

      if (jumpHold > 0) jumpHold--;
      if (need && pl.onGround && pl.jumpsLeft > 0 && jumpHold === 0) jumpHold = 18;
      if (dj) jumpHold = 18;
      const hold = jumpHold > 0;
      window.__mp.setTestInput({ axis: 1, jump: hold, jumpPressed: hold && jumpHold === 17 });
      window.__mp.fastForward(1 / 60);
    }
    out.push({
      level: lv, len: data.length, goalX: Math.round(data.goalX),
      maxX: Math.round(maxX), deaths, frames,
      secs: +(data.length / 320).toFixed(1),
      reached: maxX >= data.goalX - 20
    });
  }
  return out;
});

for (const r of runs) {
  ok(`第 ${r.level} 关机器人可跑到终点`, r.reached,
    `推进 ${r.maxX}/${r.goalX}，死 ${r.deaths} 次，帧 ${r.frames}`);
}
ok('关卡时长显著变长（L1 ≥ 22 秒 / L25 ≥ 60 秒）',
  runs[0].secs >= 22 && runs[3].secs >= 60,
  JSON.stringify(runs.map((r) => ({ lv: r.level, secs: r.secs }))));
ok('关卡长度随关卡递增', runs[3].len > runs[0].len,
  JSON.stringify(runs.map((r) => r.len)));
ok('难度递增（后期死亡次数更多）', runs[3].deaths > runs[0].deaths,
  JSON.stringify(runs.map((r) => ({ lv: r.level, d: r.deaths }))));
ok('难度没有失控（每关死亡 ≤ 25 次，仍可通关）',
  runs.every((r) => r.deaths <= 25 && r.reached),
  JSON.stringify(runs.map((r) => ({ lv: r.level, d: r.deaths, ok: r.reached }))));

const errs = await page.evaluate(() => (window.__errs || []).slice(0, 5));
ok('全程控制台零报错', errs.length === 0, JSON.stringify(errs));

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
console.log(results.join('\n'));
await task.finish({ keep: [] });
