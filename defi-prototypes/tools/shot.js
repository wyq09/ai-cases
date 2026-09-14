#!/usr/bin/env node
/* Headless screenshot / interaction tool for self-check.
   Usage:
     node tools/shot.js <url> <out.png> [w] [h] [options]
     --click "<css selector>"     click before screenshot (repeatable, in order)
     --type "<css selector>" "text"  clear+type (repeatable)
     --press "<key>"              press key (e.g. Escape, Enter)
     --wait <ms>                  extra wait before screenshot
     --js "<expression>"          evaluate in page (repeatable)
     --console                    dump console messages + window.__errs
   Examples:
     node tools/shot.js "file://$PWD/dist/index.html#/overview" /tmp/ov.png 1600 1200
     node tools/shot.js "file://$PWD/dist/index.html#/traces" /tmp/t.png 1600 1200 --click "tr" --wait 400
*/
const fs = require('fs');
const path = require('path');
const os = require('os');

function resolvePlaywright() {
  const npxDir = path.join(os.homedir(), '.npm', '_npx');
  const cands = [];
  try {
    for (const d of fs.readdirSync(npxDir)) {
      const p = path.join(npxDir, d, 'node_modules', 'playwright-core');
      if (fs.existsSync(p)) cands.push({ p, t: fs.statSync(p).mtimeMs });
    }
  } catch (e) {}
  cands.sort((a, b) => b.t - a.t);
  if (!cands.length) throw new Error('playwright-core not found in ~/.npm/_npx');
  return require(cands[0].p);
}

function resolveChrome() {
  const base = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  try {
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium')).sort().reverse();
    for (const v of dirs) {
      for (const sub of fs.readdirSync(path.join(base, v))) {
        for (const [bin, rel] of [['Chrome', 'Contents/MacOS/Chrome'], ['chrome-headless-shell', 'chrome-headless-shell']]) {
          const p = path.join(base, v, sub, rel);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch (e) {}
  throw new Error('no chromium in ~/Library/Caches/ms-playwright');
}

(async () => {
  const argv = process.argv.slice(2);
  const pos = [];
  const clicks = [], types = [], presses = [], jses = [];
  let waitMs = 600, consoleDump = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--click') clicks.push(argv[++i]);
    else if (argv[i] === '--type') types.push([argv[++i], argv[++i]]);
    else if (argv[i] === '--press') presses.push(argv[++i]);
    else if (argv[i] === '--js') jses.push(argv[++i]);
    else if (argv[i] === '--wait') waitMs = parseInt(argv[++i]);
    else if (argv[i] === '--console') consoleDump = true;
    else pos.push(argv[i]);
  }
  const [url, out = '/tmp/shot.png', w = '1600', h = '1200'] = pos;
  if (!url) { console.error('usage: node tools/shot.js <url> <out.png> [w] [h] [--click sel]...'); process.exit(2); }

  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ executablePath: resolveChrome(), headless: true });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(waitMs);

  for (const [sel, text] of types) {
    const elh = await page.waitForSelector(sel, { timeout: 5000 });
    await elh.fill(text);
  }
  for (const sel of clicks) {
    const elh = await page.waitForSelector(sel, { timeout: 5000 });
    await elh.click();
    await page.waitForTimeout(350);
  }
  for (const k of presses) { await page.keyboard.press(k); await page.waitForTimeout(200); }
  for (const expr of jses) { await page.evaluate(expr); }
  await page.waitForTimeout(250);
  await page.screenshot({ path: out });

  const errs = await page.evaluate(() => (window.__errs || []).map((e) => (Array.isArray(e) ? e.join(' | ') : String(e))));
  console.log('SHOT Saved:', out);
  if (errs.length) console.log('__errs:\n' + errs.map((e) => '  - ' + e).join('\n'));
  else console.log('__errs: none');
  if (consoleDump) console.log('console:\n' + (logs.join('\n') || '  (empty)'));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('SHOT FAILED:', e.message); process.exit(1); });
