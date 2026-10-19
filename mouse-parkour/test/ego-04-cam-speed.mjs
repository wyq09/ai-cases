/* 鼠族跑酷 · MOUSE RUSH — ego-lite UI 回归（第 4 轮：镜头跟随 / 道具密度 / 速度控制）
 * 运行：ego-browser nodejs < test/ego-04-cam-speed.mjs
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

/* ---------- 1. 竖屏下高速冲刺，角色必须始终在视口 35%~55% ---------- */
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true
});
try { await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); } catch (e) {}
await page.goto(`${BASE}/index.html?t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(900);
await page.click('[data-action="start"]');
await page.waitForTimeout(500);

const camTest = await page.evaluate(() => {
  // 采样：持续向右跑 + 反复冲刺，逐帧记录角色相对视口的位置
  const rels = [];
  const offs = [];
  let minRel = 9, maxRel = -9;
  for (let i = 0; i < 90; i++) {
    window.__mp.setTestInput({ axis: 1, dashPressed: i % 12 === 0 });
    window.__mp.fastForward(1 / 60);
    window.__mp.setTestInput({ axis: 1 });
    const r = window.__mp.testRel();
    if (!r) break;
    rels.push(+r.rel.toFixed(3));
    if (r.rel < minRel) minRel = r.rel;
    if (r.rel > maxRel) maxRel = r.rel;
    if (!r.onScreen) offs.push(i);
  }
  const cam = window.__mp.testCam();
  return { minRel, maxRel, offs, samples: rels.length, viewW: Math.round(cam.viewW), head: rels.slice(0, 8) };
});
ok('竖屏冲刺时角色从未出画', camTest.offs.length === 0, JSON.stringify(camTest.offs));
ok('竖屏角色相对位置 ≥ 30%（留 5% 余量）', camTest.minRel >= 0.30, 'min=' + camTest.minRel);
ok('竖屏角色相对位置 ≤ 60%（留 5% 余量）', camTest.maxRel <= 0.60, 'max=' + camTest.maxRel);
ok('竖屏角色在 35%~55% 主体区间', camTest.maxRel - camTest.minRel < 0.25,
  '区间宽度 ' + (camTest.maxRel - camTest.minRel).toFixed(3));

/* ---------- 2. 横屏同样验证 ---------- */
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 844, height: 390, deviceScaleFactor: 2, mobile: true
});
await page.waitForTimeout(600);
const camLand = await page.evaluate(() => {
  const rels = [];
  let minRel = 9, maxRel = -9, offs = 0;
  for (let i = 0; i < 90; i++) {
    window.__mp.setTestInput({ axis: 1, dashPressed: i % 12 === 0 });
    window.__mp.fastForward(1 / 60);
    window.__mp.setTestInput({ axis: 1 });
    const r = window.__mp.testRel();
    if (!r) break;
    rels.push(+r.rel.toFixed(3));
    if (r.rel < minRel) minRel = r.rel;
    if (r.rel > maxRel) maxRel = r.rel;
    if (!r.onScreen) offs++;
  }
  return { minRel, maxRel, offs };
});
ok('横屏冲刺时角色从未出画', camLand.offs === 0, JSON.stringify(camLand));
ok('横屏角色相对位置 ≥ 30%', camLand.minRel >= 0.30, 'min=' + camLand.minRel);
ok('横屏角色相对位置 ≤ 60%', camLand.maxRel <= 0.60, 'max=' + camLand.maxRel);

/* ---------- 3. 桌面大屏同样验证 ---------- */
await page.cdp('Emulation.clearDeviceMetricsOverride');
await page.waitForTimeout(500);
await page.evaluate(() => {
  window.__mp.startLevel(3);
  const p = window.__mp.testPlayer(), lv = window.__mp.testLevel();
  const gnd = lv.solids.find((s) => s.kind === 'ground' && s.x > 1200 && s.w > 300);
  if (gnd) { p.x = gnd.x + 60; p.y = gnd.y - p.h - 2; p.vx = 0; p.vy = 0; p.dead = false; }
});
const camDesk = await page.evaluate(() => {
  let minRel = 9, maxRel = -9, offs = 0;
  for (let i = 0; i < 90; i++) {
    window.__mp.setTestInput({ axis: 1, dashPressed: i % 12 === 0 });
    window.__mp.fastForward(1 / 60);
    window.__mp.setTestInput({ axis: 1 });
    const r = window.__mp.testRel();
    if (!r) break;
    if (r.rel < minRel) minRel = r.rel;
    if (r.rel > maxRel) maxRel = r.rel;
    if (!r.onScreen) offs++;
  }
  return { minRel, maxRel, offs };
});
ok('桌面冲刺时角色从未出画', camDesk.offs === 0, JSON.stringify(camDesk));
ok('桌面角色相对位置在 30%~60%', camDesk.minRel >= 0.30 && camDesk.maxRel <= 0.60, JSON.stringify(camDesk));

/* ---------- 4. 道具密度 ---------- */
const density = await page.evaluate(() => {
  const out = [];
  for (const n of [1, 5, 12, 25]) {
    const lv = window.MP.LOGIC.genLevel(n, 4242);
    const xs = lv.pickups.map((p) => p.x).sort((a, b) => a - b);
    let min = Infinity, sum = 0;
    for (let i = 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1]; min = Math.min(min, d); sum += d; }
    out.push({
      n, count: xs.length, len: lv.length,
      minGap: Math.round(min),
      avgGap: Math.round(sum / Math.max(1, xs.length - 1)),
      perSec: +(sum / Math.max(1, xs.length - 1) / 320).toFixed(2)
    });
  }
  return out;
});
ok('道具不再扎堆（最小间距 ≥ 80 单位）', density.every((d) => d.minGap >= 80), JSON.stringify(density));
ok('道具平均间隔 ≥ 0.6 秒', density.every((d) => d.perSec >= 0.6), JSON.stringify(density));
ok('单关道具总数收敛（≤ 40）', density.every((d) => d.count <= 40), JSON.stringify(density));

/* ---------- 5. 速度控制 ---------- */
const speed = await page.evaluate(() => {
  const measure = (sp) => {
    window.__mp.onAction('setSpeed', { value: sp });
    window.__mp.startLevel(1);
    const p0 = window.__mp.testPlayer(), lv = window.__mp.testLevel();
    const gnd = lv.solids.find((s) => s.kind === 'ground' && s.x > 200 && s.w > 400);
    if (gnd) { p0.x = gnd.x + 40; p0.y = gnd.y - p0.h - 2; }
    p0.vx = 0; p0.vy = 0; p0.dead = false; p0.invuln = 5;
    const x0 = p0.x;
    // 固定推进 1 秒「游戏内时间」
    window.__mp.setTestInput({ axis: 1 });
    for (let i = 0; i < 60; i++) window.__mp.fastForward(1 / 60);
    const p1 = window.__mp.testPlayer();
    return { speed: sp, moved: Math.round(p1.x - x0) };
  };
  const a = measure(0.5), b = measure(1), c = measure(1.5);
  window.__mp.onAction('setSpeed', { value: 1 });
  return { a, b, c, cfg: window.__mp.testSpeed() };
});
ok('0.5× 速度生效（位移约为 1× 的一半）',
  speed.a.moved > 0 && speed.b.moved > 0 && Math.abs(speed.a.moved / speed.b.moved - 0.5) < 0.12,
  JSON.stringify(speed));
ok('1.5× 速度生效（位移约为 1× 的 1.5 倍）',
  Math.abs(speed.c.moved / speed.b.moved - 1.5) < 0.15, JSON.stringify(speed));
ok('速度倍率可读回', speed.cfg === 1, JSON.stringify(speed.cfg));

/* ---------- 6. 设置面板有游戏速度档位 ---------- */
await page.keyboard.press('p');
await page.waitForTimeout(250);
await page.click('[data-action="settings"]');
await page.waitForTimeout(350);
const setPanel = await page.evaluate(() => {
  const root = document.getElementById('ui-root');
  const t = (root.textContent || '').replace(/\s+/g, ' ');
  const chips = [...root.querySelectorAll('[data-action="setSpeed"]')].map((b) => b.getAttribute('data-value'));
  return { hasLabel: /游戏速度/.test(t), chips, text: t.slice(0, 200) };
});
ok('设置面板含「游戏速度」', setPanel.hasLabel, setPanel.text);
ok('速度档位为 5 档', setPanel.chips.length === 5, JSON.stringify(setPanel.chips));
await page.click('[data-action="setSpeed"][data-value="1.5"]');
await page.waitForTimeout(300);
const applied = await page.evaluate(() => ({
  speed: window.__mp.testSpeed(),
  tag: (document.getElementById('hud-speed') || {}).textContent,
  tagOn: (document.getElementById('hud-speed') || {}).className
}));
ok('点击档位即生效', applied.speed === 1.5, JSON.stringify(applied));
ok('HUD 显示速度标记', /1\.5/.test(applied.tag || ''), JSON.stringify(applied));
const shotSpeed = await page.screenshot({ path: '/tmp/mp-16-speed.png' });

await page.click('[data-action="setSpeed"][data-value="1"]');
await page.waitForTimeout(200);
await page.evaluate(() => window.__mp.onAction('closeSettings'));
await page.waitForTimeout(200);

/* ---------- 7. 控制台零报错 ---------- */
const errs = await page.evaluate(() => (window.__errs || []).slice());
ok('全流程控制台零报错', errs.length === 0, errs.join(' | '));

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
console.log('shot:', shotSpeed);
