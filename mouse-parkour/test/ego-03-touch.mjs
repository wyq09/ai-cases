/* 鼠族跑酷 · MOUSE RUSH — ego-lite UI 回归（第 3 轮：触屏操作 / 横屏布局 / 主角渲染）
 * 运行：ego-browser nodejs < test/ego-03-touch.mjs
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

/* 触屏模拟 */
async function touch(type, x, y) {
  await page.cdp('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }]
  });
}

/* ---------- 切到触屏设备 + 竖屏 ---------- */
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true
});
try { await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); } catch (e) {}
await page.goto(`${BASE}/index.html?t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(1000);

/* ---------- 0. 开局（触屏层仅在 HUD 屏显示） ---------- */
await page.click('[data-action="start"]');
await page.waitForTimeout(600);

/* ---------- 1. 触屏控件出现 ---------- */
const tc = await page.evaluate(() => {
  const g = (id) => document.getElementById(id);
  const vis = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
  const zone = g('stick-zone'), base = g('stick-base'), knob = g('stick-knob');
  return {
    zone: vis(zone), base: vis(base), knob: vis(knob),
    jump: vis(g('btn-jump')), dash: vis(g('btn-dash')), slide: vis(g('btn-slide')),
    zoneRect: zone ? zone.getBoundingClientRect().toJSON() : null,
    jumpRect: g('btn-jump') ? g('btn-jump').getBoundingClientRect().toJSON() : null,
    isTouch: MP.UI.isTouch()
  };
});
ok('识别为触屏设备', tc.isTouch === true, String(tc.isTouch));
ok('虚拟摇杆区域可见', tc.zone && tc.base && tc.knob, JSON.stringify(tc));
ok('跳 / 冲 / 滑 三键可见', tc.jump && tc.dash && tc.slide, JSON.stringify(tc));
ok('摇杆在左半屏', tc.zoneRect && tc.zoneRect.left < 200, JSON.stringify(tc.zoneRect));
ok('功能键在右半屏', tc.jumpRect && tc.jumpRect.left > 200, JSON.stringify(tc.jumpRect));

/* ---------- 2. 摇杆驱动移动 ---------- */
const before = await page.evaluate(() => {
  window.__mp.setTestInput(null);
  return Math.round(window.__mp.testPlayer().x);
});
const z = tc.zoneRect;
const sx = z.left + z.width * 0.5, sy = z.top + z.height * 0.5;
await touch('touchStart', sx, sy);
await touch('touchMove', sx + 44, sy);
await page.waitForTimeout(450);
const moved = await page.evaluate(() => ({
  x: Math.round(window.__mp.testPlayer().x),
  axis: window.__mp.testPlayer().vx
}));
await touch('touchEnd', sx + 44, sy);
ok('摇杆右推使角色右移', moved.x > before + 5, JSON.stringify({ before, moved }));
ok('摇杆右推产生正速度', moved.axis > 0, JSON.stringify(moved));

/* ---------- 3. 摇杆左推 ---------- */
const b2 = await page.evaluate(() => Math.round(window.__mp.testPlayer().x));
await touch('touchStart', sx, sy);
await touch('touchMove', sx - 44, sy);
await page.waitForTimeout(500);
const m2 = await page.evaluate(() => Math.round(window.__mp.testPlayer().x));
await touch('touchEnd', sx - 44, sy);
ok('摇杆左推使角色左移', m2 < b2, JSON.stringify({ b2, m2 }));

/* ---------- 4. 跳跃键 ---------- */
const jr = tc.jumpRect;
await touch('touchStart', jr.left + jr.width / 2, jr.top + jr.height / 2);
await page.waitForTimeout(120);
const jy = await page.evaluate(() => ({ y: window.__mp.testPlayer().y, onG: window.__mp.testPlayer().onGround }));
await touch('touchEnd', jr.left + jr.width / 2, jr.top + jr.height / 2);
ok('跳跃键使角色离地', jy.onG === false, JSON.stringify(jy));

/* ---------- 5. 冲刺键 ---------- */
const dr = await page.evaluate(() => {
  const r = document.getElementById('btn-dash').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
const stamina0 = await page.evaluate(() => window.__mp.testPlayer().stamina);
await touch('touchStart', dr.left + dr.width / 2, dr.top + dr.height / 2);
await page.waitForTimeout(150);
await touch('touchEnd', dr.left + dr.width / 2, dr.top + dr.height / 2);
const stamina1 = await page.evaluate(() => ({ s: window.__mp.testPlayer().stamina, dashT: window.__mp.testPlayer().dashT }));
ok('冲刺键消耗体力', stamina1.s < stamina0 || stamina1.dashT > 0, JSON.stringify({ stamina0, stamina1 }));

/* ---------- 5.5 滑铲键 ---------- */
const sr = await page.evaluate(() => {
  const r = document.getElementById('btn-slide').getBoundingClientRect();
  const p = window.__mp.testPlayer();
  const lv = window.__mp.testLevel();
  const gnd = lv.solids.find((x) => x.kind === 'ground' && x.w > 150);
  if (gnd) { p.x = gnd.x + 50; p.y = gnd.y - p.h - 2; }
  p.vx = 0; p.vy = 0; p.dead = false; p.dashT = 0; p.sliding = false; p.slideT = 0;
  // 注意：setTestInput 一旦非空会完全接管输入（屏蔽真实触控），故这里必须置 null
  window.__mp.setTestInput(null);
  window.__mp.fastForward(2 / 60);
  return { left: r.left, top: r.top, width: r.width, height: r.height, onGround: p.onGround };
});
await touch('touchStart', sr.left + sr.width / 2, sr.top + sr.height / 2);
await page.waitForTimeout(120);
const slid = await page.evaluate(() => {
  const p = window.__mp.testPlayer();
  return { sliding: p.sliding, h: p.h };
});
await touch('touchEnd', sr.left + sr.width / 2, sr.top + sr.height / 2);
ok('滑铲键使角色压低', slid.sliding === true && slid.h < 26, JSON.stringify(slid));

/* ---------- 6. 横屏布局（844×390） ---------- */
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 844, height: 390, deviceScaleFactor: 2, mobile: true
});
await page.waitForTimeout(700);
const land = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const r = c.getBoundingClientRect();
  const app = document.getElementById('app');
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    orient: document.body.dataset.orient,
    cls: app.className,
    hudVisible: (document.querySelector('[data-screen="hud"]') || {}).classList ? true : false,
    errs: (window.__errs || []).slice()
  };
});
ok('横屏画布适配 844×390', land.w === 844 && land.h === 390, JSON.stringify(land));
ok('横屏方向标记正确', land.orient === 'landscape', JSON.stringify(land));
ok('横屏控制台零报错', land.errs.length === 0, land.errs.join('|'));
const shotL = await page.screenshot({ path: '/tmp/mp-09-landscape.png' });

/* ---------- 7. 主角程序化渲染（9 种姿态） ---------- */
const mouse = await page.evaluate(() => {
  const poses = ['run', 'idle', 'jump', 'fall', 'slide', 'dash', 'hurt', 'cheer', 'dead'];
  const out = {};
  for (const pose of poses) {
    const c = document.createElement('canvas');
    c.width = 120; c.height = 120;
    const g = c.getContext('2d');
    MP.ART.drawMouse(g, {
      x: 30, y: 30, w: 34, h: 26, dir: 1, pose, t: 1.2, runT: 0.7,
      squashX: 1, squashY: 1, dead: false
    });
    const d = g.getImageData(0, 0, 120, 120).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 16) n++;
    out[pose] = n;
  }
  return out;
});
const badPoses = Object.keys(mouse).filter((k) => mouse[k] < 60);
ok('小老鼠 9 种姿态均可渲染', badPoses.length === 0,
  badPoses.map((k) => k + ':' + mouse[k]).join(','));
ok('小老鼠有实际像素体量', mouse.run > 300, 'run=' + mouse.run);

/* ---------- 8. 主角在场上可见（非纯背景） ---------- */
const visible = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const g = c.getContext('2d');
  const p = window.__mp.testPlayer();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // 玩家在屏幕上的位置（用 game 的相机换算）
  const st = window.__mp.snapshot();
  const info = MP.ART && MP.ART.drawMouse ? true : false;
  // 采样画布中心区域，统计"橙红围巾色"像素（#ff6b3d 附近）——主角专属颜色
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let scarf = 0, gold = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r > 210 && gg > 70 && gg < 135 && b < 95) scarf++;
    if (r > 200 && gg > 170 && b < 110) gold++;
  }
  return { scarf, gold, info, pVisible: !!p };
});
ok('画布上存在主角围巾橙红像素', visible.scarf > 20, JSON.stringify(visible));
ok('画布上存在奶酪金黄像素', visible.gold > 20, JSON.stringify(visible));

/* ---------- 9. 无限关卡：直接跳到高关卡 ---------- */
const hi = await page.evaluate(() => {
  const out = [];
  for (const n of [7, 15, 26, 31, 50]) {
    window.__mp.startLevel(n);
    const s = window.__mp.snapshot();
    const lv = window.__mp.testLevel();
    out.push({ n, biome: s.biomeName, solids: lv.solids.length, pickups: lv.pickups.length, enemies: lv.enemies.length, hazards: lv.hazards.length, goalX: Math.round(lv.goalX) });
  }
  return { out, errs: (window.__errs || []).slice() };
});
ok('第 7 关 = 仓库', hi.out[0].biome === '仓库', JSON.stringify(hi.out[0]));
ok('第 15 关 = 雨林', hi.out[1].biome === '雨林', JSON.stringify(hi.out[1]));
ok('第 26 关 = 虚空', hi.out[2].biome === '虚空', JSON.stringify(hi.out[2]));
ok('第 31 关循环回厨房', hi.out[3].biome === '厨房', JSON.stringify(hi.out[3]));
ok('第 50 关仍可生成', hi.out[4].solids > 0, JSON.stringify(hi.out[4]));
ok('高关卡切换零报错', hi.errs.length === 0, hi.errs.join('|'));

const shotH = await page.screenshot({ path: '/tmp/mp-10-level50.png' });

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
console.log('shots:', [shotL, shotH].filter(Boolean).join(' '));
