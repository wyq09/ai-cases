/* 泡泡堂触屏回归（ego-browser）
 * 运行：ego-browser nodejs < test/touch-ego.mjs
 * 覆盖：触屏层初始化 / 虚拟摇杆 / 45° 迟滞 / 放泡键 / 困泡自救 / 暂停 / 新道具
 */
const BASE = process.env.BA_URL || 'http://127.0.0.1:8771';
const task = await taskSpace('泡泡堂 触屏回归');
const page = task.page('p1');
const results = [];
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; results.push('  ✓ ' + n); } else { fail++; results.push('  ✗ ' + n + (e ? ' —— ' + e : '')); } };

await page.goto(`${BASE}/?reset=1&touch=1&v=` + Date.now());
// 标签页提到前台：后台标签被浏览器节流，rAF 几乎不跑
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForFunction(() => window.__ba && window.__ba.phase === 'idle', undefined, { timeout: 20000 });
// 用 fastForward 确定性推进物理，避免依赖真实帧率造成随机失败
const ff = (sec) => page.evaluate((s) => window.__ba.fastForward(s), sec);

// 触屏层与元素
const t0 = await page.evaluate(() => ({
  enabled: !!(window.BA.TOUCH && window.BA.TOUCH.enabled),
  hasBomb: !!document.querySelector('.tl-bomb'),
  hasPause: !!document.querySelector('.tl-pause'),
  hasZone: !!document.querySelector('.tl-zone'),
  hint: document.getElementById('hints').textContent,
  errs: window.__ba.errors.slice()
}));
ok('触屏层初始化', t0.enabled && t0.hasBomb && t0.hasPause && t0.hasZone);
ok('标题屏提示触屏操作', /滑动移动/.test(t0.hint), t0.hint);
ok('零报错', t0.errs.length === 0, t0.errs.join('|'));

// 开局
await page.click('[data-act="start"]');
await page.waitForFunction(() => window.__ba.phase === 'play', undefined, { timeout: 20000 });
await page.waitForTimeout(200);
ok('对局中触屏层激活', await page.evaluate(() => document.querySelector('#touchLayer').classList.contains('on')));
ok('落点提示圈可见', await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tl-ghost')).opacity) > 0.1));

// 把 P1 放到开阔地并停掉 AI，避免干扰
const spot = await page.evaluate(() => {
  const B = window.__ba, S = B.state;
  for (let y = 0; y < S.grid.length; y++) for (let x = 0; x < S.grid[0].length; x++) S.grid[y][x] = 0;
  const bot = S.players[1]; bot.ai = null; bot.speed = 0; bot.x = 13.5; bot.y = 11.5;
  B.teleport(S.players[0].id, 7, 6);
  return { x: 7, y: 6 };
});

// 摇杆：用真实触摸事件驱动
const box = await page.evaluate(() => {
  const z = document.querySelector('.tl-zone').getBoundingClientRect();
  return { x: Math.round(z.x + z.width / 2), y: Math.round(z.y + z.height / 2) };
});
async function touch(type, x, y) {
  await page.evaluate((a) => {
    const el = document.elementFromPoint(a.x, a.y) || document.querySelector('.tl-zone');
    const t = new Touch({ identifier: 1, target: el, clientX: a.x, clientY: a.y });
    const ev = new TouchEvent(a.type, { touches: a.type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
    (a.type === 'touchstart' ? el : window).dispatchEvent(ev);
  }, { type, x, y });
}
const p0 = await page.evaluate(() => ({ x: window.__ba.players[0].x, y: window.__ba.players[0].y }));
await touch('touchstart', box.x, box.y);
await touch('touchmove', box.x, box.y - 60);
await ff(0.12);
ok('摇杆输出方向 = up', await page.evaluate(() => window.__ba.touch.dir) === 'up');
await ff(0.42);
const p1 = await page.evaluate(() => ({ x: window.__ba.players[0].x, y: window.__ba.players[0].y }));
ok('角色实际向上移动', p1.y < p0.y - 0.15, `dy=${(p1.y - p0.y).toFixed(2)}`);

// 45° 迟滞
await touch('touchmove', box.x + 34, box.y - 40);
await page.waitForTimeout(80);
ok('45° 附近迟滞保持纵向', await page.evaluate(() => window.__ba.touch.dir) === 'up');
await touch('touchmove', box.x + 70, box.y + 2);
await page.waitForTimeout(80);
ok('横推后切换 right', await page.evaluate(() => window.__ba.touch.dir) === 'right');
await touch('touchmove', box.x, box.y + 2);
await page.waitForTimeout(60);
ok('回到死区原地站定', await page.evaluate(() => window.__ba.touch.dir) === null);
await touch('touchend', box.x, box.y);

// 放泡按钮
await page.evaluate(() => window.__ba.teleport(window.__ba.players[0].id, 7, 6));
const b0 = await page.evaluate(() => window.__ba.bombCount());
await page.click('.tl-bomb');
await ff(0.25);
const b1 = await page.evaluate(() => window.__ba.bombCount());
ok('点放泡键生成泡泡', b1 > b0, `${b0}→${b1}`);

// 自救：摇杆来回变向
await page.evaluate(() => window.__ba.trap(window.__ba.players[0].id));
await ff(0.1);
ok('trap 后处于被困状态', await page.evaluate(() => window.__ba.players[0].trapped) === true);
const pr0 = await page.evaluate(() => window.__ba.players[0].trapPress || 0);
for (let i = 0; i < 8; i++) {
  await touch('touchstart', box.x, box.y);
  await touch('touchmove', box.x - 55, box.y);
  await touch('touchmove', box.x + 60, box.y);
  await touch('touchend', box.x, box.y);
  await ff(0.1);
}
const pr1 = await page.evaluate(() => window.__ba.players[0].trapPress || 0);
ok('摇杆变向累计自救次数', pr1 > pr0 + 3, `${pr0}→${pr1}`);

// 暂停
await page.click('.tl-pause');
await ff(0.25);
ok('暂停键打开暂停屏', await page.evaluate(() => window.__ba.state.paused) === true);
await page.click('.tl-pause');
await ff(0.25);
ok('再点暂停键恢复', await page.evaluate(() => window.__ba.state.paused) === false);

// 触屏下新道具仍然可用（用真实点击 + 钩子组合）
const items = await page.evaluate(() => {
  const B = window.__ba, S = B.state, me = S.players[0];
  me.invuln = 0;                 // 清掉出生无敌，否则 trap 会被免疫
  me.trapped = false; me.trapT = 0; me.popT = 0;   // 清掉上一段自救测试的残留状态
  B.give(me.id, 'needle', 1);
  B.trap(me.id);
  return { needle: me.needle, trapped: me.trapped };
});
ok('触屏下银针仍能自动脱困', items.trapped === false, JSON.stringify(items));

const errs = await page.evaluate(() => window.__ba.errors);
ok('触屏全程零报错', errs.length === 0, errs.join(' | '));
console.log(results.join('\n'));
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await task.finish({ keep: [] });
