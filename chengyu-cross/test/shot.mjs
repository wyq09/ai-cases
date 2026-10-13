/* 首轮冒烟截图：node test/shot.mjs [out.png] [url] */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/gulangyu-world/web/tools/node_modules/playwright/index.js');

const out = process.argv[2] || 'shot.png';
const url = process.argv[3] || 'http://localhost:8770/index.html';

const browser = await pw.chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-proxy-server']
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text()); });
await page.goto(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  const pz = window.__cy && window.__cy.puzzle();
  return {
    errs: window.__errs,
    hasCy: !!window.__cy,
    hasPanel: !!window.CY.panel,
    hasBank: !!(window.CY_BANK && window.CY_BANK.list && window.CY_BANK.list.length),
    words: pz ? pz.words.map(w => w.w) : null,
    cells: pz ? Object.keys(pz.cells).length : 0,
    pool: pz ? pz.pool.join('') : '',
    banner: document.getElementById('banner-text').textContent,
    attempts: document.getElementById('stat-attempts').textContent,
    statWords: document.getElementById('stat-words').textContent
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: out });
await browser.close();
console.log('shot ->', out);
