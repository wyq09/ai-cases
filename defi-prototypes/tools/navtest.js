#!/usr/bin/env node
/* 导航链路自动测试：node tools/navtest.js */
const fs = require('fs'), path = require('path'), os = require('os');
function resolvePlaywright() {
  const npxDir = path.join(os.homedir(), '.npm', '_npx');
  const cands = [];
  for (const d of fs.readdirSync(npxDir)) {
    const p = path.join(npxDir, d, 'node_modules', 'playwright-core');
    if (fs.existsSync(p)) cands.push({ p, t: fs.statSync(p).mtimeMs });
  }
  cands.sort((a, b) => b.t - a.t);
  return require(cands[0].p);
}
function resolveChrome() {
  const base = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const v of fs.readdirSync(base).filter(d => d.startsWith('chromium')).sort().reverse())
    for (const sub of fs.readdirSync(path.join(base, v)))
      for (const rel of ['Contents/MacOS/Chrome', 'chrome-headless-shell'])
        try { const p = path.join(base, v, sub, rel); if (fs.existsSync(p)) return p; } catch (e) {}
  throw new Error('no chromium');
}
const HELPERS = `
window.T = function (t) {
  var i = SWOS.state().stack.slice(-1)[0];
  var pg = document.querySelectorAll('.os-page')[i];
  var els = pg.querySelectorAll('button,div,span');
  for (var j = 0; j < els.length; j++) { if (els[j].textContent.trim() === t) { els[j].click(); return 'hit'; } }
  return 'MISS(' + t + ')';
};
window.BACK = function () {
  var i = SWOS.state().stack.slice(-1)[0];
  var pg = document.querySelectorAll('.os-page')[i];
  var btns = [].filter.call(pg.querySelectorAll('button'), function (b) { var r = b.getBoundingClientRect(); return r.top > 40 && r.top < 130 && r.left < 130 && r.width < 80 && r.height < 80 && r.width > 0; });
  if (btns.length) { btns[0].click(); return 'back-hit'; }
  var idb = pg.querySelector('[id$="-back"]'); if (idb) { idb.click(); return 'back-id'; }
  return 'BACK-MISS';
};
window.HOME = function () { document.querySelector('.os-homezone').click(); return 'home'; };
window.NAVI = function (idx) {
  var i = SWOS.state().stack.slice(-1)[0];
  var pg = document.querySelectorAll('.os-page')[i];
  var r = pg.getBoundingClientRect();
  var els = pg.querySelectorAll('*');
  for (var j = 0; j < els.length; j++) {
    var n = els[j], rr = n.getBoundingClientRect();
    if (rr.height === 0 || rr.width === 0 || typeof n.click !== 'function') continue;
    if (rr.top - r.top > r.height - 150) {
      var pa = n.parentElement;
      if (pa && pa.children.length >= 4 && [].indexOf.call(pa.children, n) === idx) { n.click(); return 'nav' + idx; }
    }
  }
  return 'NAVI-MISS(' + idx + ')';
};
window.EDGE = function () {
  var pg = document.querySelectorAll('.os-page')[SWOS.state().stack.slice(-1)[0]];
  var r = pg.getBoundingClientRect();
  var y = r.top + 400;
  var d = document.querySelector('.os-applayer');
  d.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 10, clientY: y, bubbles: true }));
  d.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + 120, clientY: y, bubbles: true }));
  return 'edge';
};
window.DBGON = function () { window.__SWP_OSDBG = true; return 'dbg'; };
'ok'`;
const CHAINS = {
  a: [[`T('开始使用')`, [0, 1]], [`T('兑换')`, [0, 1, 2]], [`BACK()`, [0, 1]], [`HOME()`, null]],
  b: [[`T('吉尔伯特')`, [1, 2]], [`BACK()`, [1]], [`T('首页')`, [1, 0]], [`EDGE()`, [1]], [`HOME()`, null]],
  c: [[`T('卡片')`, [1]], [`T('首页')`, [0]], [`HOME()`, null]],
  d: [[`T('训练')`, [0, 1]], [`BACK()`, [0]], [`HOME()`, null]],
  e: [[`DBGON()`, [0]], [`T('开始使用')`, [0, 1]], [`NAVI(4)`, [0, 1, 2]], [`EDGE()`, [0, 1]], [`HOME()`, null]],
  f: [[`NAVI(3)`, [0, 1]], [`T('取消')`, [0]], [`NAVI(2)`, [0]], [`T('提现')`, [0, 2]], [`BACK()`, [0]], [`HOME()`, null]],
  g: [[`T('发送')`, [1, 0]], [`BACK()`, [1]], [`T('卡片')`, [2]], [`T('首页')`, [1]], [`HOME()`, null]],
  h: [[`T('统计')`, [1, 0]], [`BACK()`, [1]], [`T('$14,569.00')`, [1, 2]], [`BACK()`, [1]], [`HOME()`, null]]
};
(async () => {
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ executablePath: resolveChrome(), headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.stack || e.message)));
  page.on('console', m => { const t = m.text(); if (t.indexOf('[os]') === 0) console.log('  ' + t); });
  let pass = 0, fail = 0;
  for (const [app, steps] of Object.entries(CHAINS)) {
    await page.goto(`file://${process.cwd()}/index.html?app=${app}&snap=1`, { waitUntil: 'load' });
    await page.waitForTimeout(2600);
    await page.evaluate(HELPERS);
    for (const [expr, want] of steps) {
      const r = await page.evaluate(expr);
      await page.waitForTimeout(420);
      const st = await page.evaluate(`JSON.stringify(SWOS.state().stack)`);
      if (want === null) {
        const cur = await page.evaluate(`SWOS.state().cur`);
        const ok = r !== 'BACK-MISS' && cur === null;
        ok ? pass++ : fail++;
        console.log(`[${app}] ${expr} => ${r} cur=${cur} ${ok ? 'PASS' : 'FAIL'}`);
      } else {
        const ok = String(r).indexOf('MISS') < 0 && st === JSON.stringify(want);
        ok ? pass++ : fail++;
        console.log(`[${app}] ${expr} => ${r} stack=${st} want=${JSON.stringify(want)} ${ok ? 'PASS' : 'FAIL'}`);
      }
    }
  }
  console.log(`\nRESULT pass=${pass} fail=${fail} pageerrors=${errs.length}${errs.length ? ' :: ' + errs.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
