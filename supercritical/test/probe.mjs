// Dev probe: ego-browser script. Reads test/plan.json = [{id, beat, t, name?}], seeks each,
// saves shots/<name>.png and prints runtime/shader errors. One TaskSpace, one reused p1.
const fs = await import('node:fs/promises');
const ROOT = '/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/supercritical';
const plan = JSON.parse(await fs.readFile(`${ROOT}/test/plan.json`, 'utf8'));
const W = +(globalThis.__W || 0) || 1920;
await fs.mkdir(`${ROOT}/shots`, { recursive: true });

const MONITOR = `(() => {
  if (window.__QA_MONITOR_INSTALLED__) return;
  window.__QA_MONITOR_INSTALLED__ = true;
  window.__QA_ERRORS = []; window.__QA_SHADER_ERRORS = [];
  const push = (k, m) => window.__QA_ERRORS.push({ kind: k, msg: String(m).slice(0, 900) });
  window.addEventListener('error', (e) => push('pageerror', e.message || (e.error && e.error.stack) || String(e)));
  window.addEventListener('unhandledrejection', (e) => push('unhandledrejection', (e.reason && e.reason.stack) || String(e.reason)));
  const oe = console.error.bind(console);
  console.error = (...a) => { push('console.error', a.map((x) => (x && x.stack) ? x.stack : String(x)).join(' ')); oe(...a); };
  const ow = console.warn.bind(console);
  console.warn = (...a) => { push('console.warn', a.map((x) => String(x)).join(' ')); ow(...a); };
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const P = WebGL2RenderingContext.prototype;
    const oc = P.compileShader;
    P.compileShader = function(sh) { oc.call(this, sh); try { if (!this.getShaderParameter(sh, this.COMPILE_STATUS)) window.__QA_SHADER_ERRORS.push({ kind: 'compile', log: (this.getShaderInfoLog(sh) || '').slice(0, 1500) }); } catch (_) {} };
    const ol = P.linkProgram;
    P.linkProgram = function(pr) { ol.call(this, pr); try { if (!this.getProgramParameter(pr, this.LINK_STATUS)) window.__QA_SHADER_ERRORS.push({ kind: 'link', log: (this.getProgramInfoLog(pr) || '').slice(0, 1500) }); } catch (_) {} };
  }
})();`;

const spaces = await listTaskSpaces();
const existing = spaces.find((s) => s.name === 'supercritical qa');
const task = existing
  ? (existing.ownership === 'user' ? await claimTaskSpace(existing.id)
    : existing.ownership === 'agentDelegatedToUser' ? await takeOverTaskSpace(existing.id)
    : await taskSpace(existing.id))
  : await taskSpace('supercritical qa');
const managed = await task.pages();
const page = managed[0] ?? (await task.adopt((await task.tabs())[0].page));
console.log({ taskSpaceId: task.spaceId, page: page.label });

await page.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: Math.round(W * 9 / 16), deviceScaleFactor: 1, mobile: false });
await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: MONITOR });
await page.goto(`file://${ROOT}/index.html?headless=1&quick=1`, { timeout: 30000 });
try {
  await page.waitForFunction(() => window.ready === true && !!window.__deck && !!window.__deck.test, undefined, { timeout: 30000 });
} catch (e) {
  const d = await page.evaluate(() => ({ errs: window.__errs || [], qa: window.__QA_ERRORS || [], sh: window.__QA_SHADER_ERRORS || [], deck: !!window.__deck, sc: !!window.__SC, scenes: window.__SC && window.__SC.scenes && window.__SC.scenes.length }));
  console.log('BOOT FAILED', JSON.stringify(d, null, 1).slice(0, 6000));
  throw e;
}
const info = await page.evaluate(() => ({ scenes: window.__deck.scenes.map((s) => s.id), build: window.__SC.BUILD }));
console.log(JSON.stringify(info));
let failed = 0;
for (const it of plan) {
  const name = it.name || `${it.id}-${it.beat}`;
  try {
    await page.evaluate(async (o) => { await window.__deck.test.seek(o.id, o.beat, o.t ?? 2); window.__deck.test.draw(); }, it);
    await page.screenshot({ path: `${ROOT}/shots/${name}.png` });
    console.log(`shot ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL seek ${name}: ${String(e && e.message || e).slice(0, 400)}`);
  }
}
const errs = await page.evaluate(() => ({ errs: window.__errs || [], qa: window.__QA_ERRORS || [], sh: window.__QA_SHADER_ERRORS || [] }));
const n = errs.errs.length + errs.qa.length + errs.sh.length;
console.log(`errors: ${n} (hook ${errs.errs.length}, qa ${errs.qa.length}, shader ${errs.sh.length})`);
const seen = new Set();
for (const e of [...errs.sh.map((x) => 'SHADER ' + x.kind + ': ' + x.log), ...errs.errs.map((x) => 'HOOK ' + x), ...errs.qa.map((x) => 'QA ' + x.kind + ': ' + x.msg)]) {
  const key = e.slice(0, 160);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log('  ' + e.slice(0, 1200).replace(/\n/g, '\n    '));
}
