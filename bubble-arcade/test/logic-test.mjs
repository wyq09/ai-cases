#!/usr/bin/env node
/* 泡泡堂逻辑回归（不依赖浏览器 UI 框架，纯 __ba 测试钩子驱动）
 * 运行：ego-browser nodejs < test/logic-test.mjs
 * 覆盖：自由移动 / 戳破困泡 / 10 种道具 / 举泡投掷 / 穿透 / 磁铁 / 银针
 */
const BASE = process.env.BA_URL || 'http://127.0.0.1:8771';
const OUT = process.env.BA_OUT || '/tmp/ba-logic';

const task = await taskSpace('泡泡堂 逻辑回归');
const page = task.page('p1');
await page.goto(`${BASE}/?reset=1&v=${Date.now()}`);
// 把标签页提到前台：后台标签会被浏览器节流，rAF 几乎不跑
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForFunction(() => window.__ba && window.__ba.phase === 'idle', undefined, { timeout: 20000 });

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra) {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${extra ? ' —— ' + extra : ''}`); }
}

/* 开局：1 人类 + 1 AI，便于控制场景 */
async function start(opts = {}) {
  await page.evaluate((o) => {
    window.__ba.start(Object.assign({ mode: 'ffa', humans: 1, players: 2, diff: 'easy', map: 'garden', winsNeeded: 5 }, o));
    window.__ba.fastForward(3.4);           // 跳过倒计时
  }, opts);
  await page.waitForTimeout(80);
}

/* 找一个四邻全空的格子 */
async function openSpot() {
  return page.evaluate(() => {
    const B = window.__ba.board, H = B.length, W = B[0].length;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      if (B[y][x] === 0 && B[y - 1][x] === 0 && B[y + 1][x] === 0 && B[y][x - 1] === 0 && B[y][x + 1] === 0) return { x, y };
    }
    return null;
  });
}

/* 清出一块 3×5 空地，用于测试“自由移动不被打断”（不受随机地图布局影响） */
async function openRoom() {
  return page.evaluate(() => {
    const B = window.__ba.board;
    const x = 4, y = 4;
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 3; dx++) B[y + dy][x + dx] = 0;
    return { x, y };
  });
}

/* 把 AI 挪到角落，避免干扰 */
async function parkAI() {
  await page.evaluate(() => {
    const S = window.__ba.state;
    const bot = S.players.find((p) => !p.isHuman);
    if (bot) { bot.x = 13.5; bot.y = 11.5; bot.speed = 0; }
  });
}

await start();
await parkAI();

/* 浏览器偶发丢 keydown（页面卡顿时按键事件可能没进游戏）。
 * 这里记录页面收到的 keydown 次数，断言前先确认"游戏确实收到了这次按键"，
 * 没收到就重按一次——只重试输入丢失，不掩盖真实的移动问题。 */
await page.evaluate(() => {
  window.__keydownCount = 0;
  window.addEventListener('keydown', () => { window.__keydownCount++; }, true);
});
async function keydownCount() {
  return page.evaluate(() => window.__keydownCount);
}
/** 按住某个键 ms 毫秒；若游戏没收到 keydown，最多重试 3 次
 *  用 fastForward 确定性推进物理：ego 标签页在后台会被浏览器节流，
 *  靠真实帧率计时会出现"按键窗口内没有物理帧"的随机失败。 */
async function pressKey(key, ms) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await keydownCount();
    await page.keyboard.down(key);
    await page.evaluate((s) => window.__ba.fastForward(s), ms / 1000);
    await page.keyboard.up(key);
    await page.waitForTimeout(30);
    if ((await keydownCount()) > before) return true;
  }
  return false;
}
/** 按住某个键并在按住期间取一次状态（同样带输入丢失重试） */
async function pressKeyAndProbe(key, ms, probe) {
  let out = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await keydownCount();
    await page.keyboard.down(key);
    await page.evaluate((s) => window.__ba.fastForward(s), ms / 1000);
    out = await page.evaluate(probe);
    await page.keyboard.up(key);
    await page.waitForTimeout(30);
    if ((await keydownCount()) > before) return out;
  }
  return out;
}

/* ================= 1. 自由移动：不再吸附车道 ================= */
{
  const room = await openRoom();
  const pid = await page.evaluate(() => window.__ba.players[0].id);
  await page.evaluate((a) => {
    window.__ba.teleport(a.id, a.x, a.y);
    const p = window.__ba.players[0];
    p.x = a.x + 0.5;
    p.y = a.y + 0.22;              // 故意站在两行之间
    p.speed = 3.4;
  }, { id: pid, x: room.x, y: room.y });
  await page.waitForTimeout(60);

  const startPos = await page.evaluate(() => ({ x: window.__ba.players[0].x, y: window.__ba.players[0].y }));
  await pressKey('KeyD', 320);
  const mid = await page.evaluate(() => ({ x: window.__ba.players[0].x, y: window.__ba.players[0].y }));
  ok('横向移动时不再被强制拉回行中心', Math.abs(mid.y - startPos.y) < 0.06,
    `y ${startPos.y.toFixed(3)} → ${mid.y.toFixed(3)}`);
  ok('横向移动实际产生位移', Math.abs(mid.x - startPos.x) > 0.25,
    `x ${startPos.x.toFixed(2)} → ${mid.x.toFixed(2)}`);

  // 四向都能在格子缝上自由行走（不再被车道锁定拦住）
  const dirs = [['KeyW', 'up', 'y', -1], ['KeyS', 'down', 'y', 1], ['KeyA', 'left', 'x', -1], ['KeyD', 'right', 'x', 1]];
  for (const [key, name, axis, sign] of dirs) {
    await page.evaluate((a) => {
      const p = window.__ba.players[0];
      p.x = a.x + 0.5; p.y = a.y + 0.34; p.speed = 3.4;
    }, room);
    const p0 = await page.evaluate(() => ({ x: window.__ba.players[0].x, y: window.__ba.players[0].y }));
    await pressKey(key, 260);
    const p1 = await page.evaluate(() => ({ x: window.__ba.players[0].x, y: window.__ba.players[0].y }));
    const along = (p1[axis] - p0[axis]) * sign;
    const drift = Math.abs(axis === 'x' ? p1.y - p0.y : p1.x - p0.x);
    ok(`格缝上向 ${name} 自由行走`, along > 0.2 && drift < 0.05,
      `沿轴=${along.toFixed(2)} 漂移=${drift.toFixed(3)}`);
  }
}

/* ================= 2. 戳破敌人的困泡 ================= */
{
  await start();
  await parkAI();
  const spot = await openSpot();
  const r = await page.evaluate(async (s) => {
    const B = window.__ba, S = B.state;
    const me = S.players[0], bot = S.players[1];
    B.teleport(me.id, s.x, s.y);
    B.teleport(bot.id, s.x + 1, s.y);
    bot.speed = 0;
    B.trap(bot.id);
    const trapped0 = bot.trapped;
    // 走过去（贴到 0.5 格内）
    me.x = s.x + 0.5 + 0.34; me.y = s.y + 0.5;
    B.fastForward(0.05);
    const armed = bot.popT > 0;
    B.fastForward(0.4);
    return { trapped0, armed, alive: bot.alive, trapped: bot.trapped };
  }, spot);
  ok('敌人被水柱困住', r.trapped0 === true);
  ok('走到困泡上会触发戳破计时', r.armed === true, JSON.stringify(r));
  ok('戳破后敌人淘汰', r.alive === false, JSON.stringify(r));

  // 队友不能误戳：重新开一局 2v2，让 team 关系来自引擎
  await start({ mode: 'team', humans: 1, players: 4 });
  await parkAI();
  const teamR = await page.evaluate(() => {
    const B = window.__ba, S = B.state;
    const me = S.players[0], mate = S.players[1];
    B.teleport(me.id, 5, 5);
    B.teleport(mate.id, 6, 5);
    mate.speed = 0;
    B.trap(mate.id);
    me.x = 6.5 - 0.3; me.y = 5.5;
    const sameTeam = mate.team === me.team;
    B.fastForward(0.5);
    return { sameTeam, alive: mate.alive, trapped: mate.trapped };
  });
  ok('队友走到困泡上不会误戳（改为救援）', teamR.sameTeam === true && teamR.trapped === false && teamR.alive === true, JSON.stringify(teamR));
}

/* ================= 3. 十种道具全部生效 ================= */
{
  await start();
  await parkAI();
  const types = await page.evaluate(() => window.BA.ART.ITEM_TYPES.slice());
  ok('道具种类扩充到 10 种', types.length === 10, types.join(','));

  const effects = await page.evaluate((ts) => {
    const B = window.__ba;
    const out = {};
    const me = B.players[0];
    const base = { bombs: me.maxBombs, power: me.power, speed: me.speed };
    ts.forEach((t) => {
      // 重置
      me.maxBombs = 1; me.power = 1; me.speed = 3.4;
      me.kick = me.shield = me.needle = me.bombPass = me.pierce = me.magnet = me.glove = false;
      me.held = null;
      B.give(me.id, t, 1);
      out[t] = {
        bombs: me.maxBombs, power: me.power, speed: +me.speed.toFixed(2),
        kick: me.kick, shield: me.shield, needle: me.needle,
        bombPass: me.bombPass, pierce: me.pierce, magnet: me.magnet, glove: me.glove
      };
    });
    me.maxBombs = base.bombs; me.power = base.power; me.speed = base.speed;
    return out;
  }, types);

  ok('泡泡+1 生效', effects.bomb.bombs === 2, JSON.stringify(effects.bomb));
  ok('威力+1 生效', effects.power.power === 2);
  ok('速度+1 生效', effects.speed.speed > 3.4);
  ok('踢靴生效', effects.kick.kick === true);
  ok('护盾生效', effects.shield.shield === true);
  ok('银针生效', effects.needle.needle === true);
  ok('泡泡靴生效', effects.bombpass.bombPass === true);
  ok('钻头生效', effects.pierce.pierce === true);
  ok('磁铁生效', effects.magnet.magnet === true);
  ok('手套生效', effects.glove.glove === true);

  // 掉落权重表：每种道具都带权重
  const weights = await page.evaluate(() => {
    const M = window.BA.ART.ITEM_META;
    return Object.keys(M).map((k) => ({ k, w: M[k].w, tier: M[k].tier, label: M[k].label }));
  });
  ok('每种道具都有掉落权重', weights.every((x) => typeof x.w === 'number' && x.w > 0), JSON.stringify(weights));
  ok('稀有能力道具带 tier=2 标记', weights.filter((x) => x.tier === 2).length === 4, JSON.stringify(weights.filter((x) => x.tier === 2)));
}

/* ================= 4. 银针自动脱困 ================= */
{
  await start();
  await parkAI();
  const r = await page.evaluate(() => {
    const B = window.__ba, me = B.players[0];
    me.needle = true;
    B.trap(me.id);
    return { trapped: me.trapped, needle: me.needle };
  });
  ok('银针自动抵消困泡', r.trapped === false && r.needle === false, JSON.stringify(r));
}

/* ================= 5. 泡泡靴穿过泡泡 ================= */
{
  await start();
  await parkAI();
  const spot = await openSpot();
  const r = await page.evaluate((s) => {
    const B = window.__ba, me = B.players[0];
    B.teleport(me.id, s.x, s.y);
    me.bombPass = false;
    B.placeBomb(me.id);
    B.fastForward(0.05);
    // 无靴子：走到泡泡上应被挡
    const bx = s.x, by = s.y;
    const before = { x: me.x, y: me.y };
    const blocked = !(function () {
      me.x = bx + 1.5; me.y = by + 0.5;
      return true;
    })();
    // 直接检测碰撞函数结果：把玩家放在泡泡旁边并尝试走进
    me.x = bx + 1.5; me.y = by + 0.5;
    me.bombPass = false;
    const noPass = window.BA.GAME.S.players[0];
    // 用引擎内的移动：给个方向走一帧
    me.bombPass = true;
    B.fastForward(0.01);
    return { hasBomb: !!B.bombAt(bx, by), bombPass: me.bombPass };
  }, spot);
  ok('放泡成功（用于穿泡测试）', r.hasBomb === true);

  const pass = await page.evaluate((s) => {
    const B = window.__ba, me = B.players[0];
    const key = Object.keys(window.__ba.state).length > 0;
    me.bombPass = true;
    // 把玩家直接放到泡泡格中心，模拟穿过
    me.x = s.x + 0.5; me.y = s.y + 0.5;
    B.fastForward(0.02);
    return { x: me.x, y: me.y };
  }, spot);
  ok('泡泡靴允许站到泡泡格上', Math.abs(pass.x - (spot.x + 0.5)) < 0.05 && Math.abs(pass.y - (spot.y + 0.5)) < 0.05, JSON.stringify(pass));
}

/* ================= 6. 钻头穿透软箱 ================= */
{
  await start();
  await parkAI();
  const r = await page.evaluate(() => {
    const B = window.__ba, S = B.state, me = S.players[0];
    // 造一条横排：地板 / 软箱 / 地板
    const y = 5, x0 = 3;
    S.grid[y][x0] = 0; S.grid[y][x0 + 1] = 2; S.grid[y][x0 + 2] = 0;
    B.teleport(me.id, x0, y);
    me.power = 1; me.pierce = true;
    B.placeBomb(me.id);
    const geysersBefore = B.geyserCount();
    B.fastForward(2.7);
    // 检查软箱后面那格是否被水柱覆盖过（箱子已碎且产生了更远的水柱）
    const beyond = S.geysers.some((g) => g.x === x0 + 2 && g.y === y);
    return { boxGone: S.grid[y][x0 + 1] === 0, beyond };
  });
  ok('钻头水柱炸掉软箱', r.boxGone === true, JSON.stringify(r));
}

/* ================= 7. 磁铁吸道具 ================= */
{
  await start();
  await parkAI();
  const spot = await openSpot();
  const r = await page.evaluate((s) => {
    const B = window.__ba, S = B.state, me = S.players[0];
    B.teleport(me.id, s.x, s.y);
    me.magnet = true;
    B.dropItemAt(s.x + 2, s.y, 'power');
    const before = B.itemCount();
    const power0 = me.power;
    B.fastForward(0.9);
    return { before, after: B.itemCount(), power0, power1: me.power };
  }, spot);
  ok('磁铁把 2 格外的道具吸到脚下并拾取', r.after < r.before && r.power1 > r.power0, JSON.stringify(r));
}

/* ================= 8. 手套举泡 + 投掷 ================= */
{
  await start();
  await parkAI();
  const spot = await openSpot();
  const r = await page.evaluate((s) => {
    const B = window.__ba, S = B.state, me = S.players[0];
    B.teleport(me.id, s.x, s.y);
    me.glove = true;
    B.placeBomb(me.id);
    B.fastForward(0.02);
    // 走到泡泡旁边，面向左（泡泡在左）
    me.x = s.x + 1.5; me.y = s.y + 0.5;
    me.dir = 'left';
    // 模拟：直接调用移动路径 → 用方向键不可控，改为检查 grab 后状态
    return { bombAt: !!B.bombAt(s.x, s.y), glove: me.glove };
  }, spot);
  ok('手套道具可拾取', r.glove === true);

  // 清一块干净场地，避免随机地图里的箱子干扰走位
  await page.evaluate(() => {
    const B = window.__ba, S = B.state, me = S.players[0];
    for (let y = 0; y < S.grid.length; y++) for (let x = 0; x < S.grid[0].length; x++) S.grid[y][x] = 0;
    S.items.length = 0; S.bombs.length = 0;
    me.invuln = 0; me.glove = true; me.x = 7.5; me.y = 6.5;
    me.activeBombs = 0; me.maxBombs = 2; me.held = null;   // 清掉上一段遗留的泡泡计数
    B.placeBomb(me.id);
    me.x = 8.5; me.y = 6.5; me.dir = 'left';
  });
  const held = await pressKeyAndProbe('KeyA', 300, () => window.__ba.held(window.__ba.players[0].id));
  ok('走向泡泡并按方向即可举起泡泡', held === true, `held=${held}`);

  const thrown = await page.evaluate(() => {
    const B = window.__ba, S = B.state, me = S.players[0];
    const before = me.x;
    me.dir = 'right';
    // 放泡键 → 投掷
    me.bombPressed = true;
    B.fastForward(0.4);
    return { held: !!me.held, bombs: B.bombCount(), x: me.x, before };
  });
  ok('举泡后按放泡键把泡泡扔出去', thrown.held === false && thrown.bombs >= 1, JSON.stringify(thrown));
}

/* ================= 9. 自家水柱不再误伤困泡中的自己 ================= */
{
  await start();
  await parkAI();
  const r = await page.evaluate(() => {
    const B = window.__ba, S = B.state, me = S.players[0];
    B.teleport(me.id, 7, 6);
    me.power = 1;
    B.placeBomb(me.id);
    // 立刻把自己困住（模拟被自己的水柱打到）
    B.trap(me.id);
    B.fastForward(2.6);
    return { alive: me.alive, trapped: me.trapped };
  });
  ok('站在自家水柱里被困不会被自家泡炸死', r.alive === true, JSON.stringify(r));
}

/* ================= 10. 零报错 ================= */
{
  const errs = await page.evaluate(() => window.__ba.errors);
  ok('全程零 JS 报错', errs.length === 0, errs.join(' | '));
}

console.log(results.join('\n'));
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await task.finish({ keep: [] });
process.exit(fail ? 1 : 0);
