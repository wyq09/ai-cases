/* headless 验证：桌面 + 移动端 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8793/index.html';
const shots = '.';
const report = [];
const ok = (name, cond, extra = '') => {
  report.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const browser = await chromium.launch({
  executablePath: '/Users/yiqunwu/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--no-proxy-server'],
});

// ---------- 桌面 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__gly && window.__gly.ready === true', null, { timeout: 120000 });
  console.log('  detail.glb mounted:', await page.evaluate('window.__gly.detail'));
  await page.screenshot({ path: `${shots}/d0_loaded.png` });

  await page.click('#startBtn');
  await page.waitForTimeout(4500); // 开场飞行结束
  await page.screenshot({ path: `${shots}/d1_start.png` });
  await page.screenshot({ path: `${shots}/shot_spawn.png` }); // 出生点观感存档

  const p0 = await page.evaluate('window.__gly.pos');
  // 前进 2 秒
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate('window.__gly.pos');
  ok('desktop W 移动', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);

  // 拖拽转视角
  const yaw0 = await page.evaluate('window.__gly.yaw');
  await page.mouse.move(900, 450);
  await page.mouse.down();
  await page.mouse.move(600, 450, { steps: 8 });
  await page.mouse.up();
  const yaw1 = await page.evaluate('window.__gly.yaw');
  ok('desktop 拖拽视角', Math.abs(yaw1 - yaw0) > 0.3, `yaw ${yaw0} → ${yaw1}`);

  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ShiftLeft');
  await page.screenshot({ path: `${shots}/d2_moved.png` });

  const fps = await page.evaluate('window.__gly.fps');
  ok('desktop fps>25', fps > 25, `fps=${fps && fps.toFixed(1)}`);
  const info = await page.evaluate('JSON.stringify({calls: window.__gly.calls, tris: window.__gly.tris, dpr: devicePixelRatio})');
  console.log('render info:', info);

  // 大地图
  await page.click('#btnMap');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/d3_map.png` });
  await page.click('#mapClose');

  // 龙头路街景存档：传送到 (330,60) 附近等 2 秒
  await page.evaluate('window.__gly.tp(330, 60, 2.6)');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${shots}/shot_longtou.png` });

  ok('desktop 无报错', errors.length === 0, errors.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------- 移动端 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__gly && window.__gly.ready === true', null, { timeout: 120000 });
  await page.click('#startBtn');
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${shots}/m0_start.png` });

  const joyVisible = await page.isVisible('#joyBase');
  ok('mobile 摇杆显示', joyVisible);

  const p0 = await page.evaluate('window.__gly.pos');
  // 虚拟摇杆：从摇杆底中心向上推
  const base = await page.locator('#joyBase').boundingBox();
  const cx = base.x + base.width / 2, cy = base.y + base.height / 2;
  await page.touchscreen.tap(cx, cy); // 先激活一次
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy - 10 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - 10 - i * 7 }] });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1600);
  const joyDuring = await page.evaluate('window.__gly.joy');
  const pMid = await page.evaluate('window.__gly.pos');
  console.log('  joy during hold:', JSON.stringify(joyDuring), ' pos mid:', JSON.stringify(pMid));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const p1 = await page.evaluate('window.__gly.pos');
  const joydbg = await page.evaluate('window.__gly.joy');
  console.log('  joy state after drag:', JSON.stringify(joydbg));
  ok('mobile 摇杆移动', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.5, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);

  // 右侧滑动转视角
  const yaw0 = await page.evaluate('window.__gly.yaw');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 420 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 22, y: 420 }] });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const yaw1 = await page.evaluate('window.__gly.yaw');
  ok('mobile 滑动视角', Math.abs(yaw1 - yaw0) > 0.3, `yaw ${yaw0} → ${yaw1}`);

  await page.screenshot({ path: `${shots}/m1_moved.png` });
  const fps = await page.evaluate('window.__gly.fps');
  ok('mobile fps>15', fps > 15, `fps=${fps && fps.toFixed(1)}`);
  ok('mobile 无报错', errors.length === 0, errors.slice(0, 4).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(report.join('\n'));
