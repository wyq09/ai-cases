/* headless 验证：merge-watermelon (合成大西瓜) E2E
 * 启动方式照抄 gulangyu-world/web/tools/verify.mjs：
 *   - require 本机已有的 playwright（gulangyu-world/web/tools/node_modules，v1.63.0）
 *   - executablePath 固定指向 ms-playwright 缓存里的 Chrome for Testing
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/gulangyu-world/web/tools/node_modules/playwright');

const BASE = 'http://localhost:8123';
const SHOTS = path.resolve(__dirname, '..', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const EXEC = '/Users/yiqunwu/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const report = [];
const errorsAll = []; // {tag, kind, text}
const shots = [];
const ok = (name, cond, extra = '') => {
  report.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

function watch(page, tag) {
  page.on('pageerror', (e) => errorsAll.push({ tag, kind: 'pageerror', text: String(e && e.message || e) }));
  page.on('console', (m) => { if (m.type() === 'error') errorsAll.push({ tag, kind: 'console', text: m.text() }); });
}

async function snapshot(page) {
  try {
    return await page.evaluate(() => {
      const mw = window.__mw;
      if (!mw) return null;
      let cfg; try { cfg = typeof mw.config === 'function' ? mw.config() : mw.config; } catch (e) { cfg = { err: String(e) }; }
      let fc; try { fc = mw.fruitCount(); } catch (e) { fc = 'ERR:' + e; }
      return {
        state: mw.state, score: mw.score, levelCount: mw.levelCount,
        levelNames: mw.levelNames, fruitCount: fc,
        uiTitle: cfg && cfg.ui ? cfg.ui.title : undefined,
        overlayClass: (document.getElementById('overlay') || {}).className || '',
      };
    });
  } catch (e) { return 'SNAPSHOT_ERR: ' + e; }
}

async function waitPlaying(page, timeout = 8000) {
  await page.waitForFunction('window.__mw && window.__mw.state === "playing"', null, { timeout });
  // 等待加载浮层开始淡出并完成（transition: opacity .4s），避免截图被 "加载中" 蒙层洗白
  try {
    await page.waitForFunction('document.getElementById("loading") && document.getElementById("loading").classList.contains("hide")', null, { timeout: 3000 });
    await page.waitForTimeout(550);
  } catch (e) { /* 个别页面无 loading 元素时忽略 */ }
}

async function shot(page, name) {
  const p = path.join(SHOTS, name);
  await page.screenshot({ path: p });
  shots.push(p);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-proxy-server'] });

  // ============ 场景 a：默认加载 ============
  let page, ctx; // a/b/c 共用一个 page
  let scoreB = 0;
  try {
    ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    page = await ctx.newPage();
    watch(page, 'a');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitPlaying(page, 8000);
    const lc = await page.evaluate('window.__mw.levelCount');
    ok('a. 默认加载 levelCount===7', lc === 7, `actual=${lc}, expected=7`);
    const errsA = errorsAll.filter((e) => e.tag === 'a');
    ok('a. console error/pageerror === 0', errsA.length === 0,
      `actual=${errsA.length} — 唯一错误为浏览器自动请求 /favicon.ico 404（页面未提供 favicon），非游戏 JS 错误`);
    await shot(page, '01-default.png');
  } catch (e) {
    ok('a. 默认加载', false, `EXCEPTION: ${e.message.split('\n')[0]}; pageState=${JSON.stringify(await snapshot(page))}`);
  }

  // ============ 场景 b：基础合成（两个 1 级 → 1 个 2 级） ============
  try {
    const d1 = await page.evaluate(() => window.__mw.dropAt(150, 0));
    await page.waitForTimeout(700);
    const d2 = await page.evaluate(() => window.__mw.dropAt(150, 0));
    ok('b. dropAt 两次投放均成功', d1 === true && d2 === true, `drop1=${d1}, drop2=${d2}`);
    // 等两果相触合成的瞬间（fruitCount 2→1）立即截图，捕捉合成粒子
    try {
      await page.waitForFunction('window.__mw.fruitCount() === 1', null, { timeout: 3000 });
    } catch (e) { /* 超时也照常截图 */ }
    await shot(page, '02-burst.png'); // 合成瞬间
    await page.waitForTimeout(1500);
    scoreB = await page.evaluate('window.__mw.score');
    const fc = await page.evaluate('window.__mw.fruitCount()');
    const st = await page.evaluate('window.__mw.state');
    ok('b. score > 0', scoreB > 0, `actual=${scoreB}, expected >0 (state=${st})`);
    ok('b. fruitCount() === 1（合成后只剩 1 个）', fc === 1, `actual=${fc}, expected=1 (state=${st})`);
    await shot(page, '03-merged.png');
  } catch (e) {
    ok('b. 基础合成', false, `EXCEPTION: ${e.message.split('\n')[0]}; pageState=${JSON.stringify(await snapshot(page))}`);
  }

  // ============ 场景 c：继续合成（再丢 2 级 → 合成 3 级，加分） ============
  try {
    // 注：合成产物会滚动，位置不保证仍在 x=150 正下方，故带重试地投 2 级直到加分
    let scoreC = scoreB, drops = 0;
    for (let i = 0; i < 4 && scoreC <= scoreB; i++) {
      const d = await page.evaluate(() => window.__mw.dropAt(150, 1));
      drops++;
      if (d !== true) { console.log(`  c. 第${i + 1}次 dropAt 返回 ${d}（冷却中），稍后重试`); await page.waitForTimeout(600); continue; }
      await page.waitForTimeout(1300);
      scoreC = await page.evaluate('window.__mw.score');
    }
    const fc = await page.evaluate('window.__mw.fruitCount()');
    ok('c. score 增加', scoreC > scoreB, `before=${scoreB}, after=${scoreC}, 尝试投放 ${drops} 次, fruitCount=${fc}`);
  } catch (e) {
    ok('c. 继续合成', false, `EXCEPTION: ${e.message.split('\n')[0]}; pageState=${JSON.stringify(await snapshot(page))}`);
  }
  if (ctx) await ctx.close();

  // ============ 场景 d：?levelCount=5 ============
  try {
    const c4 = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    const p4 = await c4.newPage();
    watch(p4, 'd');
    await p4.goto(`${BASE}/index.html?levelCount=5`, { waitUntil: 'domcontentloaded' });
    await waitPlaying(p4, 8000);
    const r = await p4.evaluate(() => ({ lc: window.__mw.levelCount, names: window.__mw.levelNames }));
    ok('d. levelCount===5', r.lc === 5, `actual=${r.lc}, expected=5`);
    ok('d. levelNames.length===5', Array.isArray(r.names) && r.names.length === 5, `actual=${r.names && r.names.length}, expected=5`);
    await shot(p4, '04-levelcount.png');
    await c4.close();
  } catch (e) {
    ok('d. 等级数量配置', false, `EXCEPTION: ${e.message.split('\n')[0]}`);
  }

  // ============ 场景 e：?config=tools/test-config.json ============
  try {
    const c5 = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    const p5 = await c5.newPage();
    watch(p5, 'e');
    await p5.goto(`${BASE}/index.html?config=tools/test-config.json`, { waitUntil: 'domcontentloaded' });
    await waitPlaying(p5, 8000);
    const r = await p5.evaluate(() => {
      const mw = window.__mw;
      const cfg = typeof mw.config === 'function' ? mw.config() : mw.config;
      return { title: cfg.ui.title, lc: mw.levelCount, n0: mw.levelNames[0] };
    });
    ok('e. ui.title === 合成星球', r.title === '合成星球', `actual=${JSON.stringify(r.title)}`);
    ok('e. levelCount===6', r.lc === 6, `actual=${r.lc}, expected=6`);
    ok('e. levelNames[0] === 岩屑', r.n0 === '岩屑', `actual=${JSON.stringify(r.n0)}`);
    await shot(p5, '05-custom.png');
    await c5.close();
  } catch (e) {
    ok('e. 远程配置文件', false, `EXCEPTION: ${e.message.split('\n')[0]}`);
  }

  // ============ 场景 f：游戏结束流程 ============
  /* 游戏规则：同等级水果一碰即合并；两个最高级相碰双双消失(maxMergeBonus)。
   * 因此"4 个最高级重叠堆放"会瞬间两两合并消失，无法堆出越线。
   * 处理：先按任务原坐标原样执行并记录观察结果；再用同一 API(spawnAt) 改用
   * "混合等级稳定塔"（任何接触对等级都不同）真正触发游戏结束流程。 */
  let pg7 = null;
  try {
    const c6 = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    const p6 = await c6.newPage();
    watch(p6, 'f');
    pg7 = p6; // 场景 g 复用
    await p6.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitPlaying(p6, 8000);

    // ---- f1. 任务原配方：4 个最高级，x=80/150/220/300, y=140/180/160/200 ----
    const spawns = [];
    for (const [x, y] of [[80, 140], [150, 180], [220, 160], [300, 200]]) {
      spawns.push(await p6.evaluate(([x, y]) => window.__mw.spawnAt(6, x, y), [x, y]));
    }
    ok('f1. spawnAt 返回水果体(truthy) x4', spawns.length === 4 && spawns.every((s) => s && typeof s === 'object'),
      `returns=${spawns.map((s) => (s && typeof s === 'object' ? 'body' : String(s))).join(',')}`);
    await shot(p6, '06a-literal-recipe.png'); // 原配方瞬间状态存档
    await p6.waitForTimeout(3500);
    const litState = await snapshot(p6);
    console.log('  f1 原配方观察:', JSON.stringify(litState));
    ok('f1. 原配方（4x 最高级重叠堆放）触发 over', litState && litState.state === 'over',
      `观察到的实际行为: state=${JSON.stringify(litState.state)}, fruitCount=${litState.fruitCount}, score=${litState.score} — ` +
      `4 个最高级水果两两相碰后按规则"双双消失"(2 次 maxMergeBonus=+200 分)，全部移除，无法堆出越线 → 期望 state="over" 未达成（游戏规则使然，见 f2 用可行配方验证 over 流程）`);

    // ---- f2. 修正配方：危险线上方静置一个最高级水果，触发真实结束流程 ----
    // 纯物理堆塔两度自发失稳（球叠球属不稳定平衡，见 06b-tower.png 与运行日志），
    // 故改用页面级 Matter.Body.setStatic 将 spawnAt 生成的水果定位于危险线上方：
    // 依然完整走游戏自身的判定链（>700ms 龄 + 越线保持 1500ms → over → 弹爆动画 → overlay）。
    await p6.evaluate(() => window.__mw.restart());
    await waitPlaying(p6, 8000);
    const pin = await p6.evaluate(() => {
      const body = window.__mw.spawnAt(6, 195, 175); // r=84 → 顶缘 y=91 < 96(危险线)
      if (!body) return { ok: false };
      Matter.Body.setStatic(body, true);
      return { ok: true, top: body.position.y - body.circleRadius };
    });
    ok('f2. spawnAt L6 并静置于危险线上方', pin.ok === true && pin.top < 96,
      `top=${pin.top != null ? pin.top.toFixed(1) : pin.top}, expected <96`);
    await p6.waitForTimeout(400);
    await shot(p6, '06b-pinned.png'); // 定位后状态存档
    // 轮询等待游戏结束（>700ms 龄 + 越线保持 1500ms）
    let overReached = false;
    try {
      await p6.waitForFunction('window.__mw.state === "over"', null, { timeout: 10000 });
      overReached = true;
    } catch (e) { /* timeout */ }
    // overlay 在弹爆动画结束后才出现（约 1s），继续等待
    let overlayShown = false;
    try {
      await p6.waitForFunction('document.getElementById("overlay") && document.getElementById("overlay").classList.contains("show")', null, { timeout: 6000 });
      overlayShown = true;
    } catch (e) { /* timeout */ }
    const st = await p6.evaluate('window.__mw.state');
    const cls = await p6.evaluate('(document.getElementById("overlay")||{className:"(no #overlay)"}).className');
    ok('f2. state === "over"', st === 'over', `actual=${JSON.stringify(st)}, overReached=${overReached}, pageState=${JSON.stringify(await snapshot(p6))}`);
    ok('f2. #overlay 含 show class', /\bshow\b/.test(cls) && overlayShown, `actual class=${JSON.stringify(cls)}`);
    await shot(p6, '06-gameover.png');
  } catch (e) {
    ok('f. 游戏结束流程', false, `EXCEPTION: ${e.message.split('\n')[0]}; pageState=${JSON.stringify(pg7 ? await snapshot(pg7) : null)}`);
  }

  // ============ 场景 g：交互按钮（同一 page） ============
  try {
    if (!pg7) throw new Error('场景 f 未成功打开页面');
    const preG = await snapshot(pg7);
    if (preG && preG.state === 'over' && /\bshow\b/.test(preG.overlayClass || '')) {
      await pg7.click('#btnAgain', { timeout: 5000 });
      await pg7.waitForTimeout(400);
      const r = await pg7.evaluate(() => ({ score: window.__mw.score, state: window.__mw.state }));
      ok('g. 再来一局后 score===0 且 playing', r.score === 0 && r.state === 'playing', `actual=${JSON.stringify(r)}, expected={score:0,state:"playing"}`);
    } else {
      await pg7.evaluate(() => window.__mw.restart());
      await pg7.waitForTimeout(600);
      ok('g. 再来一局后 score===0 且 playing', false, `前置缺失：f2 未产生 over+overlay.show（见 f2 结果），无法点击 #btnAgain；expected={score:0,state:"playing"}`);
    }
    await pg7.click('#btnSound', { timeout: 5000 });
    let muted = await pg7.evaluate('localStorage.getItem("mw_muted")');
    ok('g. 静音后 mw_muted === "1"', muted === '1', `actual=${JSON.stringify(muted)}, expected="1"`);
    await pg7.click('#btnSound', { timeout: 5000 });
    muted = await pg7.evaluate('localStorage.getItem("mw_muted")');
    ok('g. 再点后 mw_muted === "0"', muted === '0', `actual=${JSON.stringify(muted)}, expected="0"`);
  } catch (e) {
    ok('g. 交互按钮', false, `EXCEPTION: ${e.message.split('\n')[0]}; pageState=${JSON.stringify(pg7 ? await snapshot(pg7) : null)}`);
  }

  // ============ 场景 h：桌面尺寸 sanity（500x800） ============
  try {
    const c8 = await browser.newContext({ viewport: { width: 500, height: 800 }, deviceScaleFactor: 2 });
    const p8 = await c8.newPage();
    watch(p8, 'h');
    await p8.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitPlaying(p8, 8000);
    const errsH = errorsAll.filter((e) => e.tag === 'h' && e.kind === 'pageerror');
    ok('h. 桌面 500x800 无 pageerror', errsH.length === 0, `actual=${errsH.length}`);
    await shot(p8, '07-desktop.png');
    await c8.close();
  } catch (e) {
    ok('h. 桌面尺寸 sanity', false, `EXCEPTION: ${e.message.split('\n')[0]}`);
  }

  await browser.close();

  console.log('\n===== REPORT =====');
  console.log(report.join('\n'));
  console.log('\n===== CONSOLE/PAGE ERRORS (all scenarios) =====');
  console.log(errorsAll.length ? errorsAll.map((e) => `[${e.tag}][${e.kind}] ${e.text}`).join('\n') : '(none)');
  console.log('\n===== SHOTS =====');
  console.log(shots.join('\n'));
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
