/* 鼠族跑酷 · MOUSE RUSH — ego-lite UI 回归（第 1 轮：加载 / 主菜单 / 开局）
 * 运行：ego-browser nodejs < test/ego-01-boot.mjs
 */
const BASE = process.env.BA_URL || 'http://127.0.0.1:8781';
const task = await taskSpace('鼠族跑酷 UI 回归');
const page = task.page('p1');
const results = [];
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; results.push('  ✓ ' + n); }
  else { fail++; results.push('  ✗ ' + n + (e ? '  —— ' + e : '')); }
};

await page.goto(`${BASE}/index.html?t=${Date.now()}`);
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForTimeout(1200);

/* ---------- 模块装载 ---------- */
const mods = await page.evaluate(() => ({
  art: !!(window.MP && MP.ART), audio: !!(window.MP && MP.SFX),
  fx: !!(window.MP && MP.FX), logic: !!(window.MP && MP.LOGIC),
  ui: !!(window.MP && MP.UI), game: !!(window.MP && MP.game),
  hook: !!window.__mp,
  errs: (window.__errs || []).slice(),
  state: window.MP && MP.game ? MP.game.testState() : null
}));
ok('六个模块全部装载', mods.art && mods.audio && mods.fx && mods.logic && mods.ui && mods.game,
  JSON.stringify(mods).slice(0, 200));
ok('控制台零报错', mods.errs.length === 0, mods.errs.join(' | '));
ok('初始状态为 menu', mods.state === 'menu', String(mods.state));

/* ---------- 画布尺寸 ---------- */
const cv = await page.evaluate(() => {
  const c = document.getElementById('stage');
  const r = c.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), bw: c.width, bh: c.height };
});
ok('画布铺满视口', cv.w > 300 && cv.h > 300, JSON.stringify(cv));

/* ---------- 主菜单 DOM ---------- */
const menu = await page.evaluate(() => {
  const root = document.getElementById('ui-root');
  const btns = [...root.querySelectorAll('button')].map((b) => ({
    act: b.getAttribute('data-action'), text: (b.textContent || '').trim().slice(0, 20),
    visible: !!(b.offsetParent || b.getClientRects().length)
  }));
  return {
    btns,
    text: (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 260),
    hasTitle: /MOUSE RUSH|鼠族跑酷/.test(root.textContent || '')
  };
});
ok('主菜单含标题', menu.hasTitle, menu.text);
ok('主菜单有「开始游戏」按钮', menu.btns.some((b) => b.act === 'start'), JSON.stringify(menu.btns.map(b=>b.act)));
ok('主菜单有「设置」按钮', menu.btns.some((b) => b.act === 'settings'));
ok('主菜单有「玩法说明」按钮', menu.btns.some((b) => b.act === 'howto'));

const shot1 = await page.screenshot({ path: '/tmp/mp-01-menu.png' });

/* ---------- 开局 ---------- */
await page.click('[data-action="start"]');
await page.waitForTimeout(500);
const play = await page.evaluate(() => {
  const s = window.__mp.snapshot();
  const p = window.__mp.testPlayer();
  return {
    state: window.__mp.testState(),
    score: s.score, lives: s.lives, level: s.level, biome: s.biomeName,
    px: p ? Math.round(p.x) : null, py: p ? Math.round(p.y) : null,
    onGround: p ? p.onGround : null,
    solids: window.__mp.testLevel() ? window.__mp.testLevel().solids.length : 0,
    pickups: window.__mp.testLevel() ? window.__mp.testLevel().pickups.length : 0,
    enemies: window.__mp.testLevel() ? window.__mp.testLevel().enemies.length : 0,
    hazards: window.__mp.testLevel() ? window.__mp.testLevel().hazards.length : 0,
    errs: (window.__errs || []).slice()
  };
});
ok('进入 playing 状态', play.state === 'playing', String(play.state));
ok('关卡已生成实体', play.solids > 0 && play.pickups > 0 && play.enemies >= 0 && play.hazards > 0,
  JSON.stringify(play));
ok('玩家已生成', play.px !== null && play.py !== null, JSON.stringify(play));

/* ---------- 物理推进 1.5s：应着地、分数增长 ---------- */
const adv = await page.evaluate(() => {
  // 落到一段长地面上，避免随机关卡的坑造成偶发坠落
  const p0 = window.__mp.testPlayer();
  const lv0 = window.__mp.testLevel();
  const g0 = lv0.solids.filter((x) => x.kind === 'ground' && x.w > 200).sort((a, b) => a.x - b.x)[0];
  if (g0) { p0.x = g0.x + 30; p0.y = g0.y - p0.h - 2; p0.vx = 0; p0.vy = 0; p0.dead = false; }
  const x0 = Math.round(window.__mp.testPlayer().x);
  window.__mp.setTestInput({ axis: 1 });
  // 先在起始平地上跑 0.4s（仍在首段 320px 内，必然在地面）
  window.__mp.fastForward(0.4);
  const pMid = window.__mp.testPlayer();
  const mid = { px: Math.round(pMid.x), onGround: pMid.onGround };
  // 再长跑一段，验证距离分持续增长（可能跨过坑，落地状态不作断言）
  const a = window.__mp.fastForward(1.5);
  const p = window.__mp.testPlayer();
  return {
    score: a.score, dist: a.distance, mid, x0,
    px: Math.round(p.x), onGround: p.onGround, py: Math.round(p.y)
  };
});
ok('推进后玩家前进', adv.mid.px > adv.x0, JSON.stringify(adv));
ok('起始平地上推进后着地', adv.mid.onGround === true, JSON.stringify(adv));
ok('距离分增长', adv.score > 0, JSON.stringify(adv));

const shot2 = await page.screenshot({ path: '/tmp/mp-02-play.png' });

console.log(results.join('\n'));
console.log(`\n通过 ${pass} / 失败 ${fail}`);
console.log('shots:', shot1, shot2);
console.log('spaceId:', task.spaceId, 'page:', page.label);
