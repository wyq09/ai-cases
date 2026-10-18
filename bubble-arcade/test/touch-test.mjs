#!/usr/bin/env node
/* 泡泡堂触屏操作回归：iPhone 竖屏/横屏 + 桌面回退
 * 运行：NODE_PATH=<playwright目录> node test/touch-test.mjs
 */
import { createRequire } from 'module';
const require = createRequire(process.env.PW_ROOT || '/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/aicharts-speckit/');
const pw = require('playwright');
const { chromium } = pw;
const DEVICES = pw.devices;

const BASE = process.env.BASE || 'http://127.0.0.1:8771';
const EXE = '/Users/yiqunwu/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const OUT = '/tmp/ba-touch';
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' —— ' + extra : ''}`); }
}

const browser = await chromium.launch({ executablePath: EXE });

/* 在棋盘上找一个四邻全空、且远离现有泡泡的格子，避免传送进软箱/柱子 */
async function openSpot(page, dist = 2) {
  return page.evaluate((d) => {
    const B = window.__ba.board, H = B.length, W = B[0].length;
    const bombs = (window.__ba.state.bombs || []).map(function (b) { return [b.x, b.y]; });
    const far = function (x, y) {
      return bombs.every(function (p) { return Math.abs(p[0] - x) + Math.abs(p[1] - y) > d; });
    };
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++)
      if (B[y][x] === 0 && B[y - 1][x] === 0 && B[y + 1][x] === 0 && B[y][x - 1] === 0 && B[y][x + 1] === 0 && far(x, y))
        return { x: x, y: y };
    return null;
  }, dist);
}
async function teleportOpen(page, pid) {
  const spot = await openSpot(page);
  if (spot) await page.evaluate(function (a) { window.__ba.teleport(a.id, a.x, a.y); }, { id: pid, x: spot.x, y: spot.y });
  await page.waitForTimeout(200);
}

async function cdpTouch(page, type, points) {
  if (!page._cdp) page._cdp = await page.context().newCDPSession(page);
  await page._cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

/* ---------- 触屏（iPhone 竖屏） ---------- */
{
  const ctx = await browser.newContext({ ...DEVICES['iPhone 13'] });
  const page = await ctx.newPage();
  console.log('— 触屏 · iPhone 13 竖屏 —');
  await page.goto(`${BASE}/?reset=1`);
  await page.waitForTimeout(600);

  ok('无“请用电脑打开”拦截', await page.locator('#desktopOnly').count() === 0);
  ok('标题屏出现触屏提示', (await page.locator('#screenTitle .tips').innerText()).includes('触屏'));
  const hasTouch = await page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0);
  ok('触屏能力模拟生效', hasTouch);
  await page.screenshot({ path: `${OUT}/01-title-portrait.png` });

  // 进入对局
  await page.tap('[data-act="start"]');
  await page.waitForFunction(() => window.__ba && (window.__ba.phase === 'play' || window.__ba.phase === 'countdown'), null, { timeout: 8000 });
  await page.waitForFunction(() => window.__ba.phase === 'play', null, { timeout: 12000 });
  await page.waitForTimeout(300);
  ok('对局中触屏层激活', await page.locator('#touchLayer.on').count() === 1);
  ok('落点提示圈可见', await page.locator('.tl-ghost').isVisible());

  // P1 出生在角落，先传到开阔地，避免出生点四周是墙/被机器人波及
  const PID = await page.evaluate(() => window.__ba.players[0].id);
  await teleportOpen(page, PID);

  // 摇杆：左下热区按下并上滑（坐标按实际视口动态取）
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const JX = Math.round(vp.w * 0.28), JY = Math.round(vp.h * 0.86);
  const p0 = () => page.evaluate(() => { const p = window.__ba.players[0]; return { x: p.x, y: p.y }; });
  const before = await p0();
  await cdpTouch(page, 'touchStart', [{ x: JX, y: JY }]);
  await cdpTouch(page, 'touchMove', [{ x: JX, y: JY - 62 }]);
  await page.waitForTimeout(120);
  ok('摇杆输出方向 = up', await page.evaluate(() => window.__ba.touch.dir) === 'up');
  await page.waitForTimeout(550);
  const after = await p0();
  ok('角色实际向上移动', after.y < before.y - 0.15, `dy=${(after.y - before.y).toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/02-joy-up-portrait.png` });

  // 轴间迟滞：从 up 斜向小幅偏移，不应切到横向
  await cdpTouch(page, 'touchMove', [{ x: JX + 36, y: JY - 40 }]); // ax=36, ay=22 → 纵轴保持
  await page.waitForTimeout(80);
  ok('45° 附近迟滞保持纵向', await page.evaluate(() => window.__ba.touch.dir) === 'up');
  // 明确横向推满 → 切换 right
  await cdpTouch(page, 'touchMove', [{ x: JX + 66, y: JY + 2 }]);
  await page.waitForTimeout(80);
  ok('横推后切换 right', await page.evaluate(() => window.__ba.touch.dir) === 'right');
  // 回中 → 停
  await cdpTouch(page, 'touchMove', [{ x: JX, y: JY + 2 }]);
  await page.waitForTimeout(60);
  ok('回到死区原地站定', await page.evaluate(() => window.__ba.touch.dir) === null);
  await cdpTouch(page, 'touchEnd', []);

  // 放泡按钮（先回安全格，避免正好被机器人水柱困住）
  await teleportOpen(page, PID);
  const bombs0 = await page.evaluate(() => window.__ba.bombCount());
  await page.tap('.tl-bomb');
  await page.waitForTimeout(250);
  const bombs1 = await page.evaluate(() => window.__ba.bombCount());
  ok('点放泡键生成泡泡', bombs1 > bombs0, `${bombs0}→${bombs1}`);

  // 困泡自救：trap 后摇杆来回变向计入 mash，连点放泡键亦可
  await page.evaluate((id) => window.__ba.trap(id), PID);
  await page.waitForTimeout(100);
  ok('trap 后处于被困状态', await page.evaluate((id) => window.__ba.players.find(p => p.id === id).trapped, PID) === true);
  const press0 = await page.evaluate(() => window.__ba.players[0].trapPress || 0);
  for (let i = 0; i < 8; i++) {
    await cdpTouch(page, 'touchStart', [{ x: JX, y: JY }]);
    await cdpTouch(page, 'touchMove', [{ x: JX - 50, y: JY }]);
    await cdpTouch(page, 'touchMove', [{ x: JX + 55, y: JY }]);
    await cdpTouch(page, 'touchEnd', []);
    await page.waitForTimeout(100);
  }
  const press1 = await page.evaluate(() => window.__ba.players[0].trapPress || 0);
  ok('摇杆变向累计自救次数', press1 > press0 + 3, `${press0}→${press1}`);

  // 暂停/继续
  await page.tap('.tl-pause');
  await page.waitForTimeout(250);
  ok('暂停键打开暂停屏', await page.evaluate(() => window.__ba.state.paused) === true);
  await page.tap('.tl-pause');
  await page.waitForTimeout(250);
  ok('再点暂停键恢复', await page.evaluate(() => window.__ba.state.paused) === false);

  const errs = await page.evaluate(() => window.__ba.errors);
  ok('竖屏零报错', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ---------- 触屏（横屏） ---------- */
{
  const ctx = await browser.newContext({ ...DEVICES['iPhone 13'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  console.log('— 触屏 · 横屏 —');
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(500);
  await page.tap('[data-act="start"]');
  await page.waitForFunction(() => window.__ba.phase === 'play', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  ok('横屏触屏层激活', await page.locator('#touchLayer.on').count() === 1);
  const lvp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const LJX = Math.round(lvp.w * 0.12), LJY = Math.round(lvp.h * 0.82);
  await cdpTouch(page, 'touchStart', [{ x: LJX, y: LJY }]);
  await cdpTouch(page, 'touchMove', [{ x: LJX, y: LJY - 58 }]);
  await page.waitForTimeout(100);
  ok('横屏摇杆可用', await page.evaluate(() => window.__ba.touch.dir) === 'up');
  await cdpTouch(page, 'touchEnd', []);
  await page.screenshot({ path: `${OUT}/03-play-landscape.png` });
  const errs = await page.evaluate(() => window.__ba.errors);
  ok('横屏零报错', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ---------- 桌面回退 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  console.log('— 桌面回退 —');
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(500);
  ok('桌面不显示触屏层', await page.locator('#touchLayer.on').count() === 0);
  ok('标题屏仍是键盘提示', (await page.locator('#screenTitle .tips').innerText()).includes('P1'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ba.phase === 'play', null, { timeout: 15000 });
  ok('键盘照常开局', true);
  // P1 出生在角落（上方是墙），传到开阔地再验证移动；机器人干扰时重试
  const DPID = await page.evaluate(() => window.__ba.players[0].id);
  let moved = 0;
  for (let attempt = 0; attempt < 3 && !moved; attempt++) {
    await teleportOpen(page, DPID);
    await page.keyboard.down('KeyW');
    const y0 = await page.evaluate(() => window.__ba.players[0].y);
    await page.waitForTimeout(500);
    const y1 = await page.evaluate(() => window.__ba.players[0].y);
    await page.keyboard.up('KeyW');
    moved = y0 - y1;
    if (!moved) await page.waitForTimeout(400); // 可能刚好被困，等水柱散去
  }
  ok('键盘移动不受影响', moved > 0.1, `dy=${moved.toFixed(2)}`);
  const errs = await page.evaluate(() => window.__ba.errors);
  ok('桌面零报错', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
