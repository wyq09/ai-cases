/* 鼠族跑酷 · MOUSE RUSH — ego-lite UI 回归（第 5 轮：手机端兼容专项）
 * 覆盖本轮手机端改造：横竖屏视野差、摇杆底座落位、横屏 HUD 限宽、
 * 竖屏转屏引导、?touch 强制开关、触屏设备菜单只显示触屏说明。
 * 运行：ego-browser nodejs < test/ego-05-mobile.mjs
 */
const BASE = process.env.BA_URL || 'http://127.0.0.1:8781';
const task = await taskSpace('鼠族跑酷 UI 回归');
const page = task.page('p1');
const results = [];
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; results.push('  ✓ ' + n); }
  else { fail++; results.push('  ✗ ' + n + (e ? '  —— ' + e : '')); }
  console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : (e ? '  —— ' + e : '')));
};
const shot = async (p) => { try { await page.screenshot({ path: p }); console.log('shot: ' + p); } catch (e) { console.log('shot fail: ' + e); } };

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const LAND = { width: 844, height: 390, deviceScaleFactor: 2, mobile: true };

async function setViewport(m) {
  await page.cdp('Emulation.setDeviceMetricsOverride', m);
  try { await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); } catch (e) {}
  // 等仿真真正生效：否则读到的还是旧视口尺寸
  await page.waitForFunction(
    (d) => window.innerWidth === d.w && window.innerHeight === d.h,
    { w: m.width, h: m.height },
    { timeout: 10000 }
  ).catch(() => {});
}

/* ---------- 1. 触屏竖屏：菜单应出现「横屏体验好 3 倍」引导卡 ---------- */
await setViewport(PHONE);
await page.goto(`${BASE}/index.html?t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(1000);

const tip = await page.evaluate(() => {
  const t = document.querySelector('.land-tip');
  const btn = document.querySelector('.btn-land');
  const keys = document.querySelectorAll('.title-keys .kbd').length;
  return {
    hasTip: !!t,
    tipText: t ? t.textContent.replace(/\s+/g, ' ').trim() : '',
    hasBtn: !!btn,
    btnText: btn ? btn.textContent.trim() : '',
    kbdCount: keys,
    orient: document.body.getAttribute('data-orient')
  };
});
ok('触屏竖屏菜单出现横屏引导卡', tip.hasTip, JSON.stringify(tip));
ok('引导卡写明横竖屏视野差（3 倍 / 1 秒 / 3 秒）',
  /3\s*倍/.test(tip.tipText) && /1\s*秒/.test(tip.tipText) && /3\s*秒/.test(tip.tipText),
  tip.tipText);
ok('引导卡带「切到横屏」按钮', tip.hasBtn && /横屏/.test(tip.btnText), tip.btnText);
ok('触屏设备菜单不显示键盘键位表', tip.kbdCount === 0, 'kbd=' + tip.kbdCount);
await shot('/tmp/mp-18-portrait-tip.png');

/* ---------- 2. 点「切到横屏」→ 强制横屏生效 ---------- */
await page.click('.btn-land');
await page.waitForTimeout(900);
const forced = await page.evaluate(() => {
  const app = document.getElementById('app');
  return {
    orient: document.body.getAttribute('data-orient'),
    forceLand: app ? app.classList.contains('force-land') : false,
    rotated: app ? app.classList.contains('rotated') : false,
    errs: (window.__errs || []).length
  };
});
ok('点「切到横屏」后进入横屏状态',
  forced.orient === 'landscape' || forced.forceLand || forced.rotated, JSON.stringify(forced));
ok('转屏操作零报错', forced.errs === 0, 'errs=' + forced.errs);

/* ---------- 3. 摇杆底座落在左下角拇指位（不再压在角色上） ---------- */
await setViewport(PHONE);
await page.goto(`${BASE}/index.html?t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(900);
await page.click('[data-action="start"]');
await page.waitForTimeout(700);

const stick = await page.evaluate(() => {
  const b = document.getElementById('stick-base');
  const r = b ? b.getBoundingClientRect() : null;
  const w = window.innerWidth, h = window.innerHeight;
  return {
    rect: r ? { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null,
    vw: w, vh: h,
    cx: r ? Math.round(r.left + r.width / 2) : -1,
    cy: r ? Math.round(r.top + r.height / 2) : -1
  };
});
ok('摇杆底座存在', !!stick.rect, JSON.stringify(stick));
ok('摇杆底座中心在屏幕左半区（拇指自然落点）',
  stick.cx > 0 && stick.cx < stick.vw * 0.45, 'cx=' + stick.cx + ' vw=' + stick.vw);
ok('摇杆底座中心在屏幕下半区（贴近拇指）',
  stick.cy > stick.vh * 0.6, 'cy=' + stick.cy + ' vh=' + stick.vh);
ok('摇杆底座不与画面中部重叠（不再压住角色）',
  stick.cx > stick.vw * 0.5 || stick.cy > stick.vh * 0.6, JSON.stringify(stick));
await shot('/tmp/mp-19-stick-base.png');

/* ---------- 4. 横屏 HUD 进度条限宽（不再各占半屏） ---------- */
await setViewport(LAND);
await page.waitForTimeout(700);
const hud = await page.evaluate(() => {
  const boxes = document.querySelectorAll('.hud-bar-box');
  const cs = boxes.length ? getComputedStyle(boxes[0]) : null;
  return {
    count: boxes.length,
    flex: cs ? cs.flex : '',
    w: boxes[0] ? Math.round(boxes[0].getBoundingClientRect().width) : -1,
    vw: window.innerWidth,
    orient: document.body.getAttribute('data-orient')
  };
});
ok('横屏 HUD 有两条进度条', hud.count === 2, JSON.stringify(hud));
ok('横屏进度条限宽 200px（flex: 0 1 200px）', /0 1 200px/.test(hud.flex), 'flex=' + hud.flex);
ok('横屏进度条实际宽度 < 半屏', hud.w > 0 && hud.w < hud.vw * 0.35,
  'w=' + hud.w + ' vw=' + hud.vw);
await shot('/tmp/mp-20-landscape-hud.png');

/* ---------- 5. 竖横屏视野差量化（跑速 320/秒） ---------- */
const view = await page.evaluate(() => {
  const c = window.__mp.testCam();
  return { viewW: Math.round(c.viewW), viewH: Math.round(c.viewH) };
});
ok('横屏视野宽度 ≥ 900 世界单位（≥3 秒预警）', view.viewW >= 900, JSON.stringify(view));

await setViewport(PHONE);
await page.waitForTimeout(800);
const viewP = await page.evaluate(() => {
  const c = window.__mp.testCam();
  return { viewW: Math.round(c.viewW), viewH: Math.round(c.viewH) };
});
ok('竖屏视野宽度 ≤ 400 世界单位（约 1 秒预警）', viewP.viewW <= 400, JSON.stringify(viewP));
ok('横屏视野至少是竖屏的 2 倍', view.viewW >= viewP.viewW * 2,
  `land=${view.viewW} port=${viewP.viewW}`);

/* ---------- 6. 桌面默认态：无参数时不应出现触摸控件 ---------- */
await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
await page.cdp('Emulation.clearDeviceMetricsOverride');
await page.waitForTimeout(400);
await page.goto(`${BASE}/index.html?t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(900);
const desk = await page.evaluate(() => ({
  isTouch: MP.UI.isTouch(),
  kbd: document.querySelectorAll('.title-keys .kbd').length,
  tip: !!document.querySelector('.land-tip')
}));
ok('桌面端判定为非触屏', desk.isTouch === false, JSON.stringify(desk));
ok('桌面端菜单显示键盘键位表', desk.kbd > 0, 'kbd=' + desk.kbd);
ok('桌面端不显示横屏引导卡', desk.tip === false, JSON.stringify(desk));

/* ---------- 7. ?touch=1 在桌面强制开启触摸 UI ---------- */
await page.goto(`${BASE}/index.html?touch=1&t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(900);
await page.click('[data-action="start"]');
await page.waitForTimeout(700);
const forcedTouch = await page.evaluate(() => {
  const layer = document.getElementById('touch-layer');
  return {
    on: layer ? layer.classList.contains('on') : false,
    base: !!document.getElementById('stick-base'),
    jump: !!document.getElementById('btn-jump')
  };
});
ok('?touch=1 在桌面上强制出现触摸控件', forcedTouch.on && forcedTouch.base && forcedTouch.jump,
  JSON.stringify(forcedTouch));

/* ---------- 8. ?touch=0 在触屏设备上强制关闭触摸 UI ---------- */
await setViewport(PHONE);
await page.goto(`${BASE}/index.html?touch=0&t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(900);
await page.click('[data-action="start"]');
await page.waitForTimeout(700);
const offTouch = await page.evaluate(() => {
  const layer = document.getElementById('touch-layer');
  return {
    on: layer ? layer.classList.contains('on') : false,
    kbdCount: document.querySelectorAll('.title-keys .kbd').length
  };
});
ok('?touch=0 在触屏设备上关闭触摸控件', offTouch.on === false, JSON.stringify(offTouch));
ok('?touch=0 时菜单改为显示键盘说明', offTouch.kbdCount > 0, 'kbd=' + offTouch.kbdCount);

/* ---------- 9. 全程控制台零报错 ---------- */
const errs = await page.evaluate(() => (window.__errs || []).slice(0, 5));
ok('手机端专项全程控制台零报错', errs.length === 0, JSON.stringify(errs));

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
console.log(results.join('\n'));
await task.finish({ keep: [] });
