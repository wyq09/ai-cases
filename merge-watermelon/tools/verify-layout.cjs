/* 布局回归验证：多视口矩阵
 * 断言：画布宽高比受控(≤0.64)、画布占满可用高度且水平居中、
 *       投放后所有水果都留在容器边界内（无逃逸/穿透）、无页面错误。
 * 运行：先 `python3 -m http.server 8123`，再 `node tools/verify-layout.cjs`
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/gulangyu-world/web/tools/node_modules/playwright');

const BASE = 'http://localhost:8123';
const EXEC = '/Users/yiqunwu/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = path.resolve(__dirname, '..', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1920x1080', w: 1920, h: 1080 },
  { name: 'laptop-1280x800', w: 1280, h: 800 },
  { name: 'ipad-landscape-1024x768', w: 1024, h: 768 },
  { name: 'ipad-portrait-768x1024', w: 768, h: 1024 },
  { name: 'phone-390x844', w: 390, h: 844 },
];

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-proxy-server'] });
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    try {
      await page.goto(`${BASE}/index.html?v=${Date.now()}`, { waitUntil: 'networkidle' });
      await page.waitForFunction('window.__mw && window.__mw.state === "playing"', null, { timeout: 10000 });
      await page.waitForTimeout(500);

      // 1) 画布几何：比例、占满高度、居中
      const geo = await page.evaluate(() => {
        const c = document.getElementById('game').getBoundingClientRect();
        const s = document.getElementById('stage').getBoundingClientRect();
        return { cw: c.width, ch: c.height, cleft: c.left - s.left, sw: s.width, sh: s.height };
      });
      const aspect = geo.cw / geo.ch;
      ok(`[${vp.name}] 画布宽高比 ≤ 0.64`, aspect <= 0.64, `actual=${aspect.toFixed(3)}`);
      ok(`[${vp.name}] 画布占满可用高度`, geo.ch >= geo.sh * 0.95, `canvas=${Math.round(geo.ch)}, stage=${Math.round(geo.sh)}`);
      ok(`[${vp.name}] 画布水平居中`, Math.abs(geo.cleft - (geo.sw - geo.cw) / 2) < 2, `left=${Math.round(geo.cleft)}, expect=${Math.round((geo.sw - geo.cw) / 2)}`);

      // 2) 投放一批水果，验证全部留在容器边界内
      for (let i = 0; i < 8; i++) {
        await page.evaluate((lv) => window.__mw.dropAt(60 + Math.random() * 270, lv), i % 4);
        await page.waitForTimeout(560); // 越过投放冷却
      }
      await page.waitForTimeout(3500);
      const bodies = await page.evaluate(() => window.__mw.__bodies());
      const st = await page.evaluate(() => ({ state: window.__mw.state, score: window.__mw.score }));
      let escaped = bodies.filter((b) =>
        !isFinite(b.x) || !isFinite(b.y) ||
        b.x < 8 + b.r - 4 || b.x > 390 - 8 - b.r + 4 ||
        b.y > 390 * (geo.ch / geo.cw) + 60 || // 低于地板（穿透）
        b.y < -200
      );
      ok(`[${vp.name}] 水果全部留在容器内（${bodies.length} 个在场）`, escaped.length === 0,
        escaped.length ? JSON.stringify(escaped.slice(0, 3)) : '');
      ok(`[${vp.name}] 无 pageerror`, errors.length === 0, errors.join(' | '));
      ok(`[${vp.name}] 游戏运行正常`, st.state === 'playing' && (st.score > 0 || bodies.length > 0), JSON.stringify(st));
      await page.screenshot({ path: path.join(SHOTS, `layout-${vp.name}.png`) });
    } catch (e) {
      ok(`[${vp.name}] 场景执行`, false, String(e).slice(0, 200));
      await page.screenshot({ path: path.join(SHOTS, `layout-${vp.name}-ERR.png`) }).catch(() => {});
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n===== layout verify: ${fails === 0 ? 'ALL PASS' : fails + ' FAIL'} =====`);
  process.exit(fails === 0 ? 0 : 1);
})();
