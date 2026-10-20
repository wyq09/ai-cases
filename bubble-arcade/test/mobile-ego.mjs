#!/usr/bin/env node
/* 泡泡堂 · 手机端专项回归（ego-browser）
 * 运行：ego-browser nodejs < test/mobile-ego.mjs
 *
 * 覆盖三件事：
 *  1) 手机视口下的布局与可读性（UI 层脱离缩放 / 棋盘位置 / 控件尺寸 / 字号）
 *  2) 竖屏横屏差异（横屏棋盘更大 + 竖屏才给横屏引导）
 *  3) 桌面路径完全不受影响（不开启 touch 时，移动端增强层必须整体关闭）
 */
const BASE = 'http://127.0.0.1:8771';
const task = await taskSpace('泡泡堂 手机端回归');
const page = task.page('p1');
const results = [];
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; results.push('  ✓ ' + n); } else { fail++; results.push('  ✗ ' + n + (e ? ' —— ' + e : '')); } };

try { await page.cdp('Page.bringToFront'); } catch (e) {}

async function setViewport(w, h) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
}

/* ---------------- 1) 桌面路径守卫：移动端增强必须整体关闭 ---------------- */
await page.goto(`${BASE}/?reset=1&v=` + Date.now());
await page.waitForFunction(() => window.__ba && window.__ba.phase === 'idle', undefined, { timeout: 20000 });
await page.evaluate(() => {
  window.__ba.start({ mode: 'ffa', humans: 1, players: 4, diff: 'normal', map: 'garden', winsNeeded: 3, seed: 7 });
  window.__ba.fastForward(3.4);
});
await page.waitForTimeout(300);
const desk = await page.evaluate(() => {
  const stage = document.getElementById('stage');
  const hud = document.getElementById('hud');
  const nm = document.querySelector('.sc .nm');
  return {
    mobileClass: document.getElementById('app').classList.contains('mobile'),
    module: !!(window.BA.MOBILE && window.BA.MOBILE.enabled),
    uiLayer: !!document.getElementById('uiLayer'),
    hudInsideStage: stage.contains(hud),
    hintsInsideStage: stage.contains(document.getElementById('hints')),
    nmFont: nm ? parseFloat(getComputedStyle(nm).fontSize) : 0,
    bombBtn: !!document.querySelector('.tl-bomb'),
    stageTransform: stage.style.transform
  };
});
ok('桌面：不启用移动端增强层', desk.mobileClass === false && desk.module === false, JSON.stringify(desk));
ok('桌面：不创建 UI 层', desk.uiLayer === false);
ok('桌面：HUD / 提示条仍在 stage 内（布局零改动）', desk.hudInsideStage === true && desk.hintsInsideStage === true);
ok('桌面：分数条字号保持原样', desk.nmFont === 12, 'font=' + desk.nmFont);
ok('桌面：不生成触摸控件', desk.bombBtn === false);
ok('桌面：棋盘仍用居中缩放', /translate\(-50%/.test(desk.stageTransform), desk.stageTransform);

/* ---------------- 2) 手机竖屏 ---------------- */
await setViewport(390, 844);
await page.goto(`${BASE}/?reset=1&touch=1&v=` + Date.now());
await page.waitForFunction(() => window.__ba && window.__ba.phase === 'idle', undefined, { timeout: 20000 });
// 标题屏可见时量菜单卡宽度
const titleCard = await page.evaluate(() => {
  const c = document.querySelector('.screen .card');
  const b = c ? c.getBoundingClientRect() : null;
  return b ? b.width : 0;
});
await page.evaluate(() => {
  window.__ba.start({ mode: 'ffa', humans: 1, players: 4, diff: 'normal', map: 'garden', winsNeeded: 3, seed: 7 });
  window.__ba.fastForward(3.4);
});
await page.waitForTimeout(400);

const port = await page.evaluate(() => {
  const app = document.getElementById('app');
  const stage = document.getElementById('stage');
  const sr = stage.getBoundingClientRect();
  const nm = document.querySelector('.sc .nm');
  const timer = document.getElementById('timer');
  const bomb = document.querySelector('.tl-bomb').getBoundingClientRect();
  const pause = document.querySelector('.tl-pause').getBoundingClientRect();
  const stick = document.querySelector('.tl-stick').getBoundingClientRect();
  const card = document.querySelector('.screen .card');
  const titleCn = document.querySelector('.title-logo .cn');
  return {
    mobile: app.classList.contains('mobile'),
    portrait: app.classList.contains('portrait'),
    hudOutside: !stage.contains(document.getElementById('hud')),
    nmFont: nm ? parseFloat(getComputedStyle(nm).fontSize) : 0,
    timerFont: timer ? parseFloat(getComputedStyle(timer).fontSize) : 0,
    titleFont: titleCn ? parseFloat(getComputedStyle(titleCn).fontSize) : 0,
    boardTop: sr.top, boardW: sr.width, boardH: sr.height,
    bombW: bomb.width, bombH: bomb.height, bombBottom: window.innerHeight - bomb.bottom,
    pauseW: pause.width,
    stickW: stick.width,
    badge: (document.querySelector('.tl-bomb-num') || {}).textContent,
    rotateOn: (document.querySelector('.tl-rotate') || { className: '' }).classList.contains('on'),
    hintsTop: document.getElementById('hints').getBoundingClientRect().top,
    errs: window.__ba.errors.slice()
  };
});
ok('手机：移动端增强层启用', port.mobile === true && port.portrait === true);
ok('手机：UI 文字层已移出被缩放的 stage', port.hudOutside === true);
ok('手机：玩家名 >= 10px（原来 4.6px）', port.nmFont >= 10, 'font=' + port.nmFont);
ok('手机：计时器 >= 16px（原来 10px）', port.timerFont >= 16, 'font=' + port.timerFont);
ok('手机：标题 >= 40px（原来 6px）', port.titleFont >= 40, 'font=' + port.titleFont);
ok('手机：菜单卡片宽度贴近屏宽', titleCard >= 330, 'w=' + titleCard);
ok('手机：棋盘顶部留出 HUD 条', port.boardTop >= 30, 'top=' + port.boardTop);
ok('手机：炸弹键 >= 88px 触控目标', port.bombW >= 88 && port.bombH >= 88, port.bombW + '×' + port.bombH);
ok('手机：炸弹键贴底（拇指可达）', port.bombBottom <= 60, 'bottom=' + port.bombBottom);
ok('手机：暂停键 >= 40px', port.pauseW >= 40, 'w=' + port.pauseW);
ok('手机：常驻摇杆底座 >= 90px', port.stickW >= 90, 'w=' + port.stickW);
ok('手机：炸弹键角标显示剩余数', port.badge === '1' || port.badge === '', 'badge=' + JSON.stringify(port.badge));
ok('手机：竖屏给出横屏引导', port.rotateOn === true);
ok('手机：提示条在棋盘下方', port.hintsTop > port.boardTop + port.boardH - 4, 'hints=' + port.hintsTop);
ok('手机全程零报错', port.errs.length === 0, port.errs.join(' | '));

/* ---------------- 3) 手机横屏：棋盘更大 + 不给横屏引导 ---------------- */
await setViewport(844, 390);
await page.evaluate(() => window.__ba.fastForward(0.2));
await page.waitForTimeout(400);
const land = await page.evaluate(() => {
  const app = document.getElementById('app');
  const sr = document.getElementById('stage').getBoundingClientRect();
  return {
    portrait: app.classList.contains('portrait'),
    boardW: sr.width, boardH: sr.height,
    rotateOn: (document.querySelector('.tl-rotate') || { className: '' }).classList.contains('on'),
    errs: window.__ba.errors.slice()
  };
});
ok('横屏：切换到横屏布局', land.portrait === false);
ok('横屏：棋盘比竖屏更大', land.boardW > port.boardW + 20, land.boardW + ' vs ' + port.boardW);
ok('横屏：不再提示横屏', land.rotateOn === false);
ok('横屏全程零报错', land.errs.length === 0, land.errs.join(' | '));

/* ---------------- 4) 关闭横屏引导后不再出现 ---------------- */
await setViewport(390, 844);
await page.goto(`${BASE}/?reset=1&touch=1&v=` + Date.now());
await page.waitForFunction(() => window.__ba && window.__ba.phase === 'idle', undefined, { timeout: 20000 });
await page.evaluate(() => {
  window.__ba.start({ mode: 'ffa', humans: 1, players: 4, diff: 'normal', map: 'garden', winsNeeded: 3, seed: 7 });
  window.__ba.fastForward(3.4);
});
await page.waitForTimeout(400);
await page.click('.tl-rotate-x');
await page.waitForTimeout(300);
const dismissed = await page.evaluate(() => ({
  off: !!window.__ba.cfg.rotateHintOff,
  on: (document.querySelector('.tl-rotate') || { className: '' }).classList.contains('on')
}));
ok('横屏引导可关闭并记住', dismissed.off === true && dismissed.on === false, JSON.stringify(dismissed));

console.log(results.join('\n'));
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await task.finish({ keep: [] });
