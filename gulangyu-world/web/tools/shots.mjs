/* headless 截图：验证建筑根部贴地与海面无可走路径 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8793/index.html';
// [输出名, x, z, yaw]
const spots = JSON.parse(process.argv[2] || '[]');

const browser = await chromium.launch({
  executablePath: '/Users/yiqunwu/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__gly && window.__gly.ready === true', null, { timeout: 120000 });
await page.click('#startBtn');
await page.waitForTimeout(4500); // 等开场飞行结束

for (const [name, x, z, yaw] of spots) {
  await page.evaluate(`window.__gly.tp(${x}, ${z}, ${yaw})`);
  await page.waitForTimeout(1500); // 等树木分块/LOD 稳定
  await page.screenshot({ path: `${name}.png` });
  const pos = await page.evaluate('window.__gly.pos');
  console.log(`${name}.png  tp(${x},${z}) -> pos ${JSON.stringify(pos)}`);
}
if (errors.length) console.log('ERRORS:', errors.slice(0, 5).join(' | '));
await browser.close();
