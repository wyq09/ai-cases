/* 地摊套圈 — ego-browser 回归矩阵。运行：ego-browser nodejs < test/regression.mjs
   需先起本地服务：python3 test/serve.py 8790（仓库根目录下执行） */
const BASE = process.env.RT_URL || 'http://127.0.0.1:8790';
const results = [];
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const task = await taskSpace('地摊套圈 回归测试');
const page = task.page('p1');
await page.cdp('Network.setCacheDisabled', { cacheDisabled: true });
await page.cdp('Page.bringToFront').catch(() => {});

async function fresh(q) {
  await page.goto(`${BASE}/?reset=1${q || ''}&v=${Date.now()}`);
  await page.waitForFunction(() => window.__rt && window.__rt.phase === 'idle', undefined, { timeout: 15000 });
  await sleep(700); // 等首开商店计时器
  await page.evaluate(() => { if (window.__rt) document.getElementById('shop').classList.add('hide'); });
  await page.cdp('Page.bringToFront').catch(() => {});
}
async function errs() { return page.evaluate(() => (window.__errs || []).slice()); }
async function S() { return page.evaluate(() => ({ c: window.__rt.state.coins, r: window.__rt.state.rings,
  t: window.__rt.state.stats.throws, h: window.__rt.state.stats.hits, dex: window.__rt.state.dex, rest: window.__rt.resting, busy: window.__rt.busy })); }
async function shot(name) {
  const fs = await import('node:fs/promises');
  const s = await page.cdp('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`/tmp/rt-test-${name}.png`, Buffer.from(s.data, 'base64'));
}

/* ── 1. 启动与模块完整性 ── */
await fresh();
ok('启动无报错', (await errs()).length === 0, JSON.stringify(await errs()));
const mods = await page.evaluate(() => ({
  logic: !!window.RT.LOGIC, art: !!window.RT.ART, audio: !!window.RT.AUDIO,
  fx: !!window.RT.FX, panel: !!window.RT.CONFIG_PANEL, scene: !!window.RT.SCENE,
  cues: window.RT.AUDIO ? window.RT.AUDIO.names.length : 0,
  stools: window.__rt.stools.length
}));
ok('六模块齐全', mods.logic && mods.art && mods.audio && mods.fx && mods.panel && mods.scene, JSON.stringify(mods));
ok('音频 cue ≥12', mods.cues >= 12, 'cues=' + mods.cues);
ok('15 个凳位', mods.stools === 15, 'stools=' + mods.stools);

/* ── 2. 买圈（真实 UI）── */
let st = await S();
ok('初始 20 币 0 圈', st.c === 20 && st.r === 0, JSON.stringify(st));
await page.evaluate(() => window.__rt.openShop());
await page.waitForFunction(() => !document.getElementById('shop').classList.contains('hide'));
await page.evaluate(() => document.getElementById('buy20').click());
await sleep(300);
st = await S();
ok('买 20 圈扣 20 币', st.c === 0 && st.r === 20, JSON.stringify(st));

/* ── 3. 币不够买圈 → toast 不扣 ── */
await page.evaluate(() => document.getElementById('buy60').click());
await sleep(250);
st = await S();
const toastShown = await page.evaluate(() => !document.getElementById('toast').classList.contains('hide'));
ok('60币买不了且不扣', st.c === 0 && st.r === 20 && toastShown, JSON.stringify(st));
await page.evaluate(() => document.getElementById('shopClose').click());

/* ── 4. rig 普通奖必中 + 账目 ── */
await page.evaluate(() => { window.__rt.rig('win'); window.__rt.throwRing(0, 0.6); });
await page.waitForFunction(() => !window.__rt.busy, undefined, { timeout: 9000 });
await sleep(1200);
st = await S();
const dexN = Object.values(st.dex).reduce((a, b) => a + b, 0);
ok('rig win 套中 1', st.h === 1 && dexN === 1, JSON.stringify(st));
ok('账目: 币=0+重复折算, 圈=19', st.c >= 0 && st.r === 19, JSON.stringify(st));
ok('演出结束回 idle', (await page.evaluate(() => window.__rt.phase)) === 'idle');

/* ── 5. rig 稀有奖必中 ── */
await page.evaluate(() => { window.__rt.rig('rare'); window.__rt.throwRing(0, 0.6); });
await page.waitForFunction(() => !window.__rt.busy, undefined, { timeout: 9000 });
await sleep(1200);
st = await S();
ok('rig rare 套中 2', st.h === 2, JSON.stringify(st));

/* ── 6. 落空：圈留在场上 ── */
const rest0 = st.rest;
await page.evaluate(() => window.__rt.throwRing(2.6, 0.15)); // 超边兜底 lost
await page.waitForFunction(() => !window.__rt.busy, undefined, { timeout: 9000 });
await sleep(400);
st = await S();
ok('落空圈数再 -1', st.r === 17, JSON.stringify(st));

/* ── 7. 真实拖拽 UI 投一掷（只验证通路，不断言命中） ── */
const canR = await page.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { w: b.width, h: b.height }; });
await page.mouse.click(canR.w / 2, canR.h * 0.8);            // 轻点 = 取消不掷
await sleep(200);
let t0 = (await S()).t;
ok('轻点不消耗圈', (await S()).t === t0);
await page.mouse.move(canR.w / 2, canR.h * 0.85);
await page.mouse.down();
await page.mouse.move(canR.w / 2 + 20, canR.h * 0.45, { steps: 8 });
await page.mouse.up();
await page.waitForFunction(() => !window.__rt.busy, undefined, { timeout: 9000 });
await sleep(300);
t0 = (await S()).t;
ok('拖拽掷圈通路', t0 > 0, 'throws=' + t0);

/* ── 8. 自动 5 圈精确自停 ── */
await page.evaluate(() => { window.__rt.setRings(30); window.__rt.setAuto(5); });
await page.waitForFunction(v => window.__rt.state.stats.throws >= 5 + v, t0, { timeout: 40000 });
await sleep(2500);
st = await S();
ok('自动恰好 5 圈', st.t === 5 + t0, `t=${st.t} expect=${5 + t0}`);
ok('自动期间无报错', (await errs()).length === 0, JSON.stringify(await errs()));

/* ── 9. 免费领币 ── */
await page.evaluate(() => { window.__rt.setCoins(0); window.__rt.setRings(0); window.__rt.openShop(); });
await sleep(200);
await page.evaluate(() => document.getElementById('btnFree').click());
await sleep(250);
st = await S();
ok('领 5 币', st.c === 5, JSON.stringify(st));
const freeDisabled = await page.evaluate(() => document.getElementById('btnFree').disabled);
ok('冷却中按钮禁用', freeDisabled === true);

/* ── 10. 图鉴渲染 ── */
await page.evaluate(() => { window.__rt.renderDex(); document.getElementById('dex').classList.remove('hide'); });
await sleep(250);
const dexCells = await page.evaluate(() => document.querySelectorAll('#dexGrid .dexCell').length);
const dexImgs = await page.evaluate(() => [...document.querySelectorAll('#dexGrid img')].filter(i => i.src.startsWith('data:image')).length);
ok('图鉴 9 格且有图', dexCells === 9 && dexImgs === 9, `cells=${dexCells} imgs=${dexImgs}`);
await shot('dex');
await page.evaluate(() => document.getElementById('dex').classList.add('hide'));

/* ── 11. 设置面板改动生效 + 落盘 ── */
await page.evaluate(() => window.RT.CONFIG_PANEL.open('play'));
await sleep(300);
await page.evaluate(() => { const t = document.querySelector('#panel .rtcp-tg'); if (t) t.click(); });
await sleep(300);
const cfgChk = await page.evaluate(() => ({
  guide: window.__rt.cfg.aimGuide,
  saved: (JSON.parse(localStorage.getItem('ringtoss_config_v1') || 'null') || {}).aimGuide
}));
ok('面板改动生效+落盘', cfgChk.guide === false && cfgChk.saved === false, JSON.stringify(cfgChk));
await page.evaluate(() => window.RT.CONFIG_PANEL.close());
await page.evaluate(() => { window.__rt.cfg.aimGuide = true; localStorage.setItem('ringtoss_config_v1', JSON.stringify(window.__rt.cfg)); });

/* ── 12. 持久化 ── */
st = await S();
await page.goto(`${BASE}/?v=${Date.now()}`);   // 无 reset
await page.waitForFunction(() => window.__rt && window.__rt.phase === 'idle', undefined, { timeout: 15000 });
await sleep(800);
const st2 = await S();
ok('刷新恢复 coins/rings', st2.c === st.c && st2.r === st.r, `before=${JSON.stringify({c: st.c, r: st.r})} after=${JSON.stringify({c: st2.c, r: st2.r})}`);
ok('刷新恢复图鉴', JSON.stringify(st2.dex) === JSON.stringify(st.dex));

/* ── 13. 视口矩阵 ── */
const viewports = [['phone', 390, 844, true], ['phone-land', 844, 390, true], ['desktop', 1512, 819, false]];
for (const [name, w, h, mobile] of viewports) {
  if (mobile) await page.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  else await page.cdp('Emulation.clearDeviceMetricsOverride');
  await page.goto(`${BASE}/?v=${Date.now()}`);
  await page.waitForFunction(() => window.__rt && window.__rt.phase === 'idle', undefined, { timeout: 15000 });
  await sleep(700);
  const v = await page.evaluate(() => {
    const inVp = id => { const b = document.getElementById(id).getBoundingClientRect(); return b.right <= innerWidth + 1 && b.left >= -1 && b.bottom <= innerHeight + 1; };
    return { noScroll: document.documentElement.scrollWidth <= innerWidth,
      hudOk: inVp('btnCfg') && inVp('btnShop') && inVp('btnDex') && inVp('coinChip'),
      cvOk: document.getElementById('stage').getBoundingClientRect().width === innerWidth };
  });
  ok(`[${name}] 无横向溢出`, v.noScroll);
  ok(`[${name}] HUD 在视口内`, v.hudOk);
  ok(`[${name}] 画布铺满`, v.cvOk);
  await shot(name);
}
await page.cdp('Emulation.clearDeviceMetricsOverride');

/* ── 14. 浸泡：12 连掷无错 + 账目 ── */
await page.goto(`${BASE}/?reset=1&v=${Date.now()}`);
await page.waitForFunction(() => window.__rt && window.__rt.phase === 'idle', undefined, { timeout: 15000 });
await sleep(700);
await page.evaluate(() => document.getElementById('shop').classList.add('hide'));
const soak0 = await S();
await page.evaluate(() => { window.__rt.setRings(12); window.__rt.setAuto(12); });
await page.waitForFunction(() => window.__rt.state.stats.throws >= 12, undefined, { timeout: 90000 });
await sleep(2000);
const soak1 = await S();
ok('浸泡 12 掷完成', soak1.t === 12, `t=${soak1.t}`);
ok('浸泡账目: 圈守恒', soak1.r === 0, `r=${soak1.r}`);
ok('浸泡零报错', (await errs()).length === 0, JSON.stringify(await errs()));
ok('浸泡有命中（统计意义上 12 掷≈1.6 中，可能为 0~4）', soak1.h >= 0 && soak1.h <= 6, `h=${soak1.h}`);

console.log('\n═══ 地摊套圈 回归结果 ═══');
console.log(results.join('\n'));
console.log(`\n${pass} pass, ${fail} fail`);
await task.finish({ keep: [] });
process.exit(fail ? 1 : 0);
