import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/gulangyu-world/web/tools/node_modules/playwright/index.js');
const browser = await pw.chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await page.goto('http://localhost:8770/index.html?reset=1&t=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

/* 填几格后截图（有绿格有紫格） */
async function fillN(n) {
  for (let i = 0; i < n; i++) {
    const t = await page.evaluate(() => {
      const pz = window.__cy.puzzle(), fills = window.__cy.state.progress.fills;
      const keys = Object.keys(pz.cells).filter(k => !pz.cells[k].given && !fills[k])
        .sort((a, b) => { const p = a.split(','), q = b.split(','); return (+p[0] - +q[0]) || (+p[1] - +q[1]); });
      if (!keys.length) return null;
      const k = keys[0], ch = pz.cells[k].ch;
      const used = window.__cy.state.progress.used || [];
      let idx = -1;
      for (let j = 0; j < pz.pool.length; j++) if (pz.pool[j] === ch && used.indexOf(j) < 0) { idx = j; break; }
      return { k, idx };
    });
    if (!t) break;
    await page.click(`#grid .cell[data-key="${t.k}"]`);
    await page.click(`#rack .tile[data-idx="${t.idx}"]`);
    await page.waitForTimeout(70);
  }
}
await fillN(5);
await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-play.png' });

/* 过关弹窗 */
await page.evaluate(() => { for (let g = 0; g < 40; g++) { const t = window.__cy.state; /* noop */ break; } });
await fillN(40);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shot-win.png' });
await page.click('#modal-root .btn.primary');
await page.waitForTimeout(400);

/* 导入分析报告 */
await page.evaluate(() => window.__cy.openImport());
await page.fill('#imp-text', '光彩夺目 举目千里 千家万户 万事大吉 大功告成 七步成章\n画蛇添足 hello');
await page.click('#imp-run');
await page.waitForTimeout(900);
await page.screenshot({ path: 'shot-import.png' });
await page.evaluate(() => window.CY.panel && window.CY.panel.close && 0);
await page.keyboard.press('Escape');

/* 设置抽屉 */
await page.evaluate(() => window.CY.panel.open());
await page.waitForTimeout(500);
await page.screenshot({ path: 'shot-drawer.png' });
await page.evaluate(() => window.CY.panel.close());
await browser.close();
console.log('done');
