/* 鼠族跑酷 · MOUSE RUSH — ego-lite UI 回归（第 2 轮：玩法 / 计分 / 流程 / 横竖屏）
 * 运行：ego-browser nodejs < test/ego-02-play.mjs
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
const errs = () => page.evaluate(() => (window.__errs || []).slice());

let shotP = null, shotL = null, shotC = null, shotH = null, shotO = null;
try {
await page.goto(`${BASE}/index.html?t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(900);
await page.click('[data-action="start"]');
await page.waitForTimeout(300);

/* 把角色放到一段安全地面上，消除前置用例造成的状态漂移（空中/坠坑/冷却中） */
const placeSafe = () => page.evaluate(() => {
  const p = window.__mp.testPlayer(), lv = window.__mp.testLevel();
  const gnd = lv.solids.find((s) => s.kind === 'ground' && s.w > 150);
  if (gnd) { p.x = gnd.x + 50; p.y = gnd.y - p.h - 2; }
  p.vx = 0; p.vy = 0; p.dead = false; p.invuln = 2; p.dashT = 0; p.dashCd = 0; p.sliding = false; p.slideT = 0;
  window.__mp.setTestInput({ axis: 0 });
  window.__mp.fastForward(2 / 60);
  return { x: Math.round(p.x), y: Math.round(p.y), onGround: p.onGround };
});

/* ========== 1. 物理与操作 ========== */
await placeSafe();
const jump = await page.evaluate(() => {
  const p = window.__mp.testPlayer();
  const x0 = p.x;
  window.__mp.setTestInput({ axis: 0, jumpPressed: true, jumpHeld: true });
  window.__mp.fastForward(1 / 60);
  window.__mp.setTestInput({ axis: 0, jumpPressed: false, jumpHeld: true });
  window.__mp.fastForward(0.35);
  const mid = { y: window.__mp.testPlayer().y, vy: window.__mp.testPlayer().vy };
  window.__mp.setTestInput({ axis: 0 });
  window.__mp.fastForward(1.2);
  const p2 = window.__mp.testPlayer();
  return { x0, mid, landedY: p2.y, onGround: p2.onGround, vy: p2.vy };
});
ok('跳跃后离地上升', jump.mid.y < jump.landedY - 20, JSON.stringify(jump));
ok('跳跃后落回地面', jump.onGround === true, JSON.stringify(jump));

await placeSafe();
const dash = await page.evaluate(() => {
  const p0 = window.__mp.testPlayer().x;
  window.__mp.setTestInput({ axis: 1 });
  window.__mp.fastForward(0.4);
  const p1 = window.__mp.testPlayer().x;
  window.__mp.setTestInput({ axis: 1, dashPressed: true });
  window.__mp.fastForward(1 / 60);
  window.__mp.setTestInput({ axis: 1 });
  window.__mp.fastForward(0.25);
  const p2 = window.__mp.testPlayer().x;
  return { p0, p1, p2, dashing: window.__mp.testPlayer().dashT > 0 };
});
ok('冲刺位移大于普通跑动', (dash.p2 - dash.p1) > (dash.p1 - dash.p0), JSON.stringify(dash));

await placeSafe();
const slide = await page.evaluate(() => {
  window.__mp.setTestInput({ axis: 1 });
  window.__mp.fastForward(0.3);
  window.__mp.setTestInput({ axis: 1, slide: true, slidePressed: true });
  window.__mp.fastForward(1 / 60);
  const p = window.__mp.testPlayer();
  return { sliding: p.sliding, h: p.h, w: p.w };
});
ok('滑铲压低碰撞盒', slide.sliding === true && slide.h < 26, JSON.stringify(slide));
await page.evaluate(() => window.__mp.setTestInput({ axis: 0 }));

/* ========== 2. 道具拾取（25 种全链路） ========== */
const itemTest = await page.evaluate(() => {
  const L = MP.LOGIC;
  const ids = Object.keys(L.ITEMS);
  const results = {};
  for (const id of ids) {
    const p = window.__mp.testPlayer();
    const lv = window.__mp.testLevel();
    // 找一个该道具的实体；找不到就手动放一个在玩家脚下
    let it = lv.pickups.find((x) => x.id === id && !x.taken);
    if (!it) {
      it = { x: p.x + 10, y: p.y + 5, id: id, r: 16, type: 'pickup', taken: false };
      lv.pickups.push(it);
    }
    const g = window.__mp.getG();
    const before = {
      score: g.score, coin: g.coin, cheese: g.cheese,
      energy: g.energy, lives: g.lives, buffs: Object.keys(p.buffs || {}).length
    };
    // 传送到一段安全地面上，再把道具放到脚下，避免掉进坑里导致死亡跳过拾取
    const gnd = lv.solids.find((s) => s.kind === 'ground' && s.x > 200 && s.w > 120);
    const px = gnd ? gnd.x + 60 : p.x;
    const py = gnd ? gnd.y - p.h - 2 : p.y;
    p.x = px; p.y = py; p.vx = 0; p.vy = 0; p.dead = false; p.invuln = 3;
    it.x = px + 8; it.y = py + 8; it.taken = false;
    window.__mp.setTestInput({ axis: 0 });
    window.__mp.fastForward(3 / 60);
    const p2 = window.__mp.testPlayer();
    results[id] = {
      taken: !!it.taken,
      score: g.score > before.score || g.coin > before.coin || g.cheese > before.cheese ||
        g.energy > before.energy || g.lives > before.lives ||
        Object.keys(p2.buffs || {}).length > before.buffs
    };
  }
  return { ids, results };
});
const notTaken = itemTest.ids.filter((i) => !itemTest.results[i].taken);
ok('25 种道具全部可被拾取', notTaken.length === 0, '未拾取: ' + notTaken.join(','));
const noEffect = itemTest.ids.filter((i) => !itemTest.results[i].score);
ok('25 种道具全部有可观测效果', noEffect.length === 0, '无效果: ' + noEffect.join(','));

/* ========== 3. 六套计分系统 ========== */
const six = await page.evaluate(() => {
  const g = window.__mp.getG();
  const s = window.__mp.snapshot();
  return {
    score: s.score, coin: s.coin, cheese: s.cheese, targetCheese: s.targetCheese,
    stylePts: s.stylePts, styleLevel: s.styleLevel,
    combo: s.combo, energy: s.energy, lives: s.lives, mk: g.mk
  };
});
ok('主积分 > 0', six.score > 0, JSON.stringify(six));
ok('金币系统有计数', six.coin > 0, JSON.stringify(six));
ok('奶酪系统有计数', six.cheese > 0, JSON.stringify(six));
ok('奶酪目标可见', six.targetCheese > 0);
ok('风格系统有等级', 'D C B A S SS'.includes(six.styleLevel), six.styleLevel);
ok('连击系统有倍率', six.combo >= 0);
ok('能量系统有值', six.energy >= 0);
ok('命数系统存在', six.lives >= 0 && six.lives <= 5, String(six.lives));
ok('积分明细五项齐备', six.mk && ['distance', 'pickup', 'style', 'kill', 'clear'].every((k) => k in six.mk),
  JSON.stringify(six.mk));

/* ========== 4. HUD 六套系统同屏可见 ========== */
const hud = await page.evaluate(() => {
  const root = document.getElementById('ui-root');
  const hudEl = root.querySelector('[data-screen="hud"]') || root.querySelector('.hud') || root;
  const t = (hudEl.textContent || '').replace(/\s+/g, ' ');
  return {
    text: t.slice(0, 300),
    hasScore: /积分/.test(t),
    hasCoin: !!hudEl.querySelector('[title="金币"]'),
    hasCheese: !!hudEl.querySelector('[title="奶酪"]'),
    hasStyle: /风格/.test(t),
    hasEnergy: /能量/.test(t),
    hasLives: !!hudEl.querySelector('[title="剩余生命"]'),
    hasLevel: !!hudEl.querySelector('[title="当前关卡"]'),
    bars: hudEl.querySelectorAll('div,span').length
  };
});
ok('HUD 显示主积分', hud.hasScore, hud.text);
ok('HUD 显示金币', hud.hasCoin, hud.text);
ok('HUD 显示奶酪', hud.hasCheese, hud.text);
ok('HUD 显示风格', hud.hasStyle, hud.text);
ok('HUD 显示能量', hud.hasEnergy, hud.text);
ok('HUD 显示命数', hud.hasLives, hud.text);
ok('HUD 显示关卡', hud.hasLevel, hud.text);

/* ========== 5. 风格升级 ========== */
const styleUp = await page.evaluate(() => {
  const p = window.__mp.testPlayer();
  const g = window.__mp.getG();
  for (let i = 0; i < 20; i++) MP.LOGIC.addStyle(p, g, 'stomp');
  window.__mp.fastForward(1 / 60);
  return { level: p.styleLevel, pts: Math.round(p.stylePts) };
});
ok('风格等级可提升', 'D C B A S SS'.split(' ').indexOf(styleUp.level) > 0, JSON.stringify(styleUp));

/* ========== 6. 暂停 / 继续 ========== */
await page.keyboard.press('p');
await page.waitForTimeout(250);
const paused = await page.evaluate(() => ({
  state: window.__mp.testState(),
  hasResume: !!document.querySelector('[data-action="resume"]'),
  hasMenu: !!document.querySelector('[data-action="menu"]'),
  hasRetry: !!document.querySelector('[data-action="retry"]')
}));
ok('P 键可暂停', paused.state === 'paused', JSON.stringify(paused));
ok('暂停面板有继续/重开/菜单', paused.hasResume && paused.hasMenu && paused.hasRetry, JSON.stringify(paused));
const frozen = await page.evaluate(() => {
  const x0 = window.__mp.testPlayer().x;
  window.__mp.setTestInput({ axis: 1 });
  window.__mp.fastForward(0.5);
  return { moved: Math.abs(window.__mp.testPlayer().x - x0) > 0.5 };
});
ok('暂停时物理冻结', !frozen.moved, JSON.stringify(frozen));
await page.click('[data-action="resume"]');
await page.waitForTimeout(200);
ok('可从暂停恢复', (await page.evaluate(() => window.__mp.testState())) === 'playing');

/* ========== 7. 设置面板 + 手动横屏 ========== */
await page.keyboard.press('p');
await page.waitForTimeout(200);
await page.click('[data-action="settings"]');
await page.waitForTimeout(300);
const settings = await page.evaluate(() => {
  const root = document.getElementById('ui-root');
  const t = (root.textContent || '').replace(/\s+/g, ' ');
  const acts = [...root.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'));
  return {
    hasVolume: /音量|BGM|SFX/.test(t),
    hasOrient: /横屏|竖屏|方向/.test(t),
    hasQuality: /画质/.test(t),
    acts: [...new Set(acts)],
    orientBtns: acts.filter((a) => /orient|land|port/i.test(a))
  };
});
ok('设置面板含音量', settings.hasVolume, settings.acts.join(','));
ok('设置面板含横竖屏选项', settings.hasOrient, settings.acts.join(','));
ok('设置面板含画质', settings.hasQuality, settings.acts.join(','));
ok('存在横屏切换动作', settings.orientBtns.length > 0, settings.acts.join(','));

/* ========== 8. 竖屏视口（390×844） ========== */
await page.cdp('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true
});
await page.waitForTimeout(500);
const portrait = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const r = c.getBoundingClientRect();
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    appClass: document.getElementById('app').className,
    bodyOrient: document.body.dataset.orient || '',
    errs: (window.__errs || []).slice()
  };
});
ok('竖屏下画布适配 390×844', portrait.w === 390 && portrait.h === 844, JSON.stringify(portrait));
ok('竖屏下控制台零报错', portrait.errs.length === 0, portrait.errs.join('|'));
shotP = await page.screenshot({ path: '/tmp/mp-04-portrait.png' });

/* 竖屏下强制横屏（CSS 旋转降级路径） */
const forced = await page.evaluate(async () => {
  MP.UI.setOrientationMode('landscape');
  MP.UI.applyOrientation();
  window.__mp.applyForceOrientation('landscape');
  await new Promise((r) => setTimeout(r, 900));
  const app = document.getElementById('app');
  return {
    cls: app.className,
    rotated: app.classList.contains('rotated'),
    forceLand: app.classList.contains('force-land'),
    orient: MP.UI.orientationMode()
  };
});
ok('可切换到强制横屏模式', forced.orient === 'landscape' && (forced.rotated || forced.forceLand), JSON.stringify(forced));
await page.waitForTimeout(400);
shotL = await page.screenshot({ path: '/tmp/mp-05-forceland.png' });

/* 还原 */
await page.evaluate(() => {
  MP.UI.setOrientationMode('auto');
  MP.UI.applyOrientation();
  const app = document.getElementById('app');
  app.classList.remove('rotated');
  app.style.width = ''; app.style.height = ''; app.style.left = ''; app.style.top = '';
  window.__mp.applyForceOrientation('auto');
});
await page.cdp('Emulation.clearDeviceMetricsOverride');
await page.waitForTimeout(400);

/* ========== 9. 关卡结算 ========== */
await page.evaluate(() => { window.__mp.onAction('closeSettings'); });
await page.waitForTimeout(300);
const backState = await page.evaluate(() => window.__mp.testState());
ok('可从设置返回游戏', backState === 'playing' || backState === 'paused', backState);
if (backState === 'paused') { await page.evaluate(() => window.__mp.onAction('resume')); await page.waitForTimeout(200); }
const cleared = await page.evaluate(async () => {
  const p = window.__mp.testPlayer();
  const lv = window.__mp.testLevel();
  p.x = lv.goalX - 4; p.vx = 0; p.vy = 0;
  window.__mp.setTestInput({ axis: 1 });
  window.__mp.fastForward(0.2);
  const res = window.__mp.testResult();
  return { state: window.__mp.testState(), res: res ? { kind: res.kind, stars: res.stars, score: res.score, level: res.level } : null };
});
ok('到达终点触发关卡结算', cleared.state === 'clear' && cleared.res && cleared.res.kind === 'clear', JSON.stringify(cleared));
ok('结算含星级', cleared.res && cleared.res.stars >= 1 && cleared.res.stars <= 3, JSON.stringify(cleared.res));
await page.waitForTimeout(500);
const clearPanel = await page.evaluate(() => {
  const root = document.getElementById('ui-root');
  const t = (root.textContent || '').replace(/\s+/g, ' ');
  return {
    text: t.slice(0, 260),
    hasNext: !!document.querySelector('[data-action="next"]'),
    hasStars: /★/.test(t)
  };
});
ok('结算面板有下一关按钮', clearPanel.hasNext, clearPanel.text);
ok('结算面板显示星级', clearPanel.hasStars, clearPanel.text);
shotC = await page.screenshot({ path: '/tmp/mp-06-clear.png' });

/* ========== 10. 下一关 ========== */
await page.click('[data-action="next"]');
await page.waitForTimeout(500);
const lvl2 = await page.evaluate(() => ({
  state: window.__mp.testState(),
  level: window.__mp.snapshot().level,
  biome: window.__mp.snapshot().biomeName
}));
ok('可进入第 2 关', lvl2.state === 'playing' && lvl2.level === 2, JSON.stringify(lvl2));

/* ========== 11. 玩法说明图鉴 ========== */
await page.evaluate(() => window.__mp.onAction('howto'));
await page.waitForTimeout(600);
const howto = await page.evaluate(() => {
  const root = document.getElementById('ui-root');
  const t = (root.textContent || '').replace(/\s+/g, ' ');
  const canvases = root.querySelectorAll('canvas').length;
  return { text: t.slice(0, 200), canvases, len: t.length };
});
ok('玩法说明含道具图鉴', howto.canvases >= 20, 'canvas 数 ' + howto.canvases);
ok('玩法说明文案完整', howto.len > 300, String(howto.len));
shotH = await page.screenshot({ path: '/tmp/mp-07-howto.png' });

/* ========== 12. Game Over ========== */
const over = await page.evaluate(async () => {
  window.__mp.onAction('menu');
  await new Promise((r) => setTimeout(r, 250));
  window.__mp.onAction('start');
  await new Promise((r) => setTimeout(r, 400));
  const log = [];
  for (let round = 0; round < 8; round++) {
    const st = window.__mp.testState();
    if (st === 'over') break;
    if (st === 'playing') {
      const p = window.__mp.testPlayer();
      const lv = window.__mp.testLevel();
      const h = lv.hazards.find((x) => x.kind !== 'pit');
      if (h) {
        p.x = h.x; p.y = h.y; p.invuln = 0; p.hp = 1; p.dead = false;
        window.__mp.setTestInput({ axis: 0 });
        window.__mp.fastForward(0.25);
        log.push({ lives: window.__mp.testPlayer().lives, dead: window.__mp.testPlayer().dead });
      }
    }
    // 等真实的复活 / 结算定时器（setTimeout 1000ms）
    await new Promise((r) => setTimeout(r, 1300));
  }
  await new Promise((r) => setTimeout(r, 1500));
  return { st: window.__mp.testState(), log: log, res: window.__mp.testResult() };
});
ok('命尽进入 Game Over', over.st === 'over', JSON.stringify(over.log) + ' st=' + over.st);
ok('Game Over 含成绩数据', !!(over.res && over.res.kind === 'over'), JSON.stringify(over.res));
shotO = await page.screenshot({ path: '/tmp/mp-08-over.png' });

/* ========== 13. 控制台零报错 ========== */
const finalErrs = await errs();
ok('全流程控制台零报错', finalErrs.length === 0, finalErrs.join(' | '));

} catch (err) {
  fail++;
  console.log('  ✗ 脚本异常: ' + (err && err.message ? err.message : err));
  const e2 = await page.evaluate(() => (window.__errs || []).slice()).catch(() => []);
  if (e2 && e2.length) console.log('  页面错误:', e2.join(' | '));
}
console.log('\n通过 ' + pass + ' / 失败 ' + fail);
console.log('shots:', [shotP, shotL, shotC, shotH, shotO].filter(Boolean).join(' '));
