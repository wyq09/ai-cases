// ego-lite 验收：难度（低/中/高）+ 改装工坊 + 导弹锁定第一名
// 运行：ego-browser nodejs < test/ego-difficulty-garage.js
//
// 玩法断言全部用 window.__qq.tick() 主动推进模拟帧（ego 窗口被遮挡时 rAF 会节流）。

const URL = process.env.QQ_URL || "http://127.0.0.1:8791/";
const OUT = process.env.QQ_OUT || "/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/qq-speed-3d/test";
const task = await taskSpace("QQ飞车 3D 测试");
// 常驻测试台：复用 p1，不整片清空；只关闭本脚本自己新开的额外页面
const extraPages = [];
async function cleanup() {
  for (const p of extraPages) { try { await p.close(); } catch (e) {} }
  extraPages.length = 0;
}
process.on("uncaughtException", async (e) => {
  console.log("UNCAUGHT", e.message);
  await cleanup();
  process.exit(1);
});
// 无论断言是否抛错，最后都关闭本任务的标签页，避免残留渲染进程吃内存
const checks = [];
const report = (name, pass, detail = "") => checks.push({ name, pass: !!pass, detail: detail ?? "" });
const sleep = (ms) => pageWait(ms);

// 复用空间里已有的常驻页面（不按标签名硬编码，空间重建后标签会变）
let page = (await task.pages())[0] || await task.newPage();
async function pageWait(ms) { return page.waitForTimeout(ms); }

async function boot(p, query = "?reset=1") {
  await p.goto(URL + query + "&v=" + Date.now());
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await p.waitForFunction(() => window.__qq && window.__qq.ready, undefined, { timeout: 18000 });
      return true;
    } catch (e) {
      await p.reload().catch(() => {});
      await p.waitForTimeout(700);
    }
  }
  return false;
}

if (!await boot(page)) {
  console.log("BOOT FAILED");
  await cleanup();
  process.exitCode = 1;
  throw new Error("boot failed");
}
await sleep(600);

// ---------- defaults ----------
const boot0 = await page.evaluate(() => ({
  state: window.__qq.state,
  diff: window.__qq.difficulty,
  tuning: window.__qq.tuning,
  baseMax: +window.__qq.mods.baseMax.toFixed(3),
  errs: window.__qq.errors,
  chips: [...document.querySelectorAll('#title-screen button[data-diff]')].map((b) => b.dataset.diff),
  chipActive: document.querySelector('#title-screen button[data-diff].active')?.dataset.diff,
  garageBtn: !!document.querySelector('[data-garage]'),
}));
report("boot_default_normal",
  boot0.state === "menu" && boot0.diff === "normal" && boot0.errs.length === 0
  && boot0.chips.join(",") === "easy,normal,hard" && boot0.chipActive === "normal" && boot0.garageBtn,
  JSON.stringify(boot0));

// ---------- difficulty chips ----------
const diffs = [];
for (const id of ["easy", "normal", "hard"]) {
  await page.click(`#title-screen button[data-diff="${id}"]`);
  await sleep(180);
  diffs.push(await page.evaluate(() => ({
    id: window.__qq.difficulty,
    baseMax: +window.__qq.mods.baseMax.toFixed(3),
    coinMul: window.__qq.mods.difficulty.coinMul,
    aiMul: window.__qq.mods.difficulty.aiMul,
    label: document.getElementById("selected-track").textContent.trim(),
    active: document.querySelector('#title-screen button[data-diff].active')?.dataset.diff,
  })));
}
report("difficulty_chips_apply",
  diffs[0].id === "easy" && diffs[1].id === "normal" && diffs[2].id === "hard"
  && diffs[0].baseMax > diffs[1].baseMax && diffs[1].baseMax > diffs[2].baseMax
  && diffs[0].active === "easy" && diffs[2].active === "hard"
  && diffs[2].coinMul > diffs[1].coinMul
  && diffs[0].label.includes("难度 低") && diffs[2].label.includes("难度 高"),
  JSON.stringify(diffs));

// AI pace must follow the difficulty
await page.evaluate(() => {
  const q = window.__qq;
  q.setDifficulty("easy");
  q.startLevel("coast", true);
  q.skipCountdown();
  q.tick(1 / 60, 20);
});
await sleep(150);
const aiEasy = await page.evaluate(() => window.__qq.ais.map((a) => +a.base.toFixed(2)));
await page.evaluate(() => {
  const q = window.__qq;
  q.setDifficulty("hard");
  q.startLevel("coast", true);
  q.skipCountdown();
  q.tick(1 / 60, 20);
});
await sleep(150);
const aiHard = await page.evaluate(() => window.__qq.ais.map((a) => +a.base.toFixed(2)));
report("difficulty_ai_pace",
  aiEasy.every((v, i) => aiHard[i] > v + 4),
  JSON.stringify({ aiEasy, aiHard }));

// ---------- garage: cannot buy without coins ----------
await page.evaluate(() => {
  const q = window.__qq;
  q.goMenu();
  q.setCoins(0);
  q.openGarage();
});
await sleep(400);
const empty = await page.evaluate(() => ({
  shown: document.getElementById("garage-screen").classList.contains("show"),
  cards: document.querySelectorAll(".garage-card").length,
  buyBtns: document.querySelectorAll(".gc-buy").length,
  coins: window.__qq.save.coins,
  tuning: window.__qq.tuning,
}));
const boughtPoor = await page.evaluate(() => window.__qq.buyUpgrade("engine"));
report("garage_opens", empty.shown && empty.cards === 5 && empty.buyBtns === 5, JSON.stringify(empty));
report("garage_blocks_when_broke", boughtPoor === false && empty.tuning.engine === 0,
  JSON.stringify({ boughtPoor, engine: empty.tuning.engine }));
await page.screenshot({ path: `${OUT}/ego-garage-desktop.png` });

// ---------- garage: buy all five parts once ----------
await page.evaluate(() => window.__qq.setCoins(2000));
await sleep(120);
for (const part of ["engine", "turbo", "grip", "aero", "paint"]) {
  await page.click(`.gc-buy[data-part="${part}"]`);
  await sleep(120);
}
const upgraded = await page.evaluate(() => ({
  tuning: { ...window.__qq.tuning },
  coins: window.__qq.save.coins,
  total: window.__qq.mods.tuning.total,
  baseMax: +window.__qq.mods.baseMax.toFixed(3),
  boostMul: +window.__qq.mods.tuning.boostMul.toFixed(3),
  drift: +window.__qq.mods.tuning.drift.toFixed(3),
  glow: !!window.__qq.player.kart.glow && window.__qq.player.kart.glow.visible,
  spoilerY: +window.__qq.player.kart.parts.spoiler.position.y.toFixed(3),
  badge: document.getElementById("garage-badge").textContent,
  cardState: document.querySelector('.garage-card[data-part-id="engine"] .gc-state').textContent,
  statsRows: document.querySelectorAll(".gs-row").length,
}));
report("garage_upgrade_all",
  upgraded.total === 5 && upgraded.coins === 2000 - (180 + 160 + 150 + 170 + 140)
  && upgraded.baseMax > 44.62 && upgraded.boostMul > 1.1 && upgraded.drift > 1.1
  && upgraded.badge === "Lv.5" && upgraded.statsRows === 5,
  JSON.stringify(upgraded));
report("garage_visual_changes", upgraded.glow && upgraded.spoilerY > 1.12, JSON.stringify({ glow: upgraded.glow, spoilerY: upgraded.spoilerY }));
await page.screenshot({ path: `${OUT}/ego-garage-upgraded.png` });

// ---------- garage: level cap ----------
const capCheck = await page.evaluate(() => {
  const q = window.__qq;
  q.setCoins(100000);
  const before = q.tuning.engine;
  q.buyUpgrade("engine");
  q.buyUpgrade("engine");
  const atMax = q.tuning.engine;
  const blocked = q.buyUpgrade("engine");
  return { before, atMax, blocked, engine: q.tuning.engine };
});
report("garage_level_cap", capCheck.before === 1 && capCheck.atMax === 3 && capCheck.blocked === false && capCheck.engine === 3,
  JSON.stringify(capCheck));

// ---------- persistence ----------
await page.evaluate(() => window.__qq.closeGarage());
await sleep(250);
await boot(page, "?v=" + Date.now());
await sleep(400);
const persisted = await page.evaluate(() => ({
  diff: window.__qq.difficulty,
  tuning: { ...window.__qq.tuning },
  baseMax: +window.__qq.mods.baseMax.toFixed(3),
  badge: document.getElementById("garage-badge").textContent,
  chip: document.querySelector('#title-screen button[data-diff].active')?.dataset.diff,
}));
report("save_persists_difficulty_and_tuning",
  persisted.diff === "hard" && persisted.tuning.engine === 3 && persisted.chip === "hard" && persisted.badge === "Lv.7",
  JSON.stringify(persisted));

// ---------- tuning affects driving ----------
const drive = await page.evaluate(() => {
  const q = window.__qq;
  q.setDifficulty("normal");
  q.startLevel("coast", true);
  q.skipCountdown();
  q.tick(1 / 60, 30);
  q.setSpeed(0);
  // 每帧把车按在赛道中线上加速，排除草地 / 撞墙干扰，只看极速上限
  q.setTestDrive({ steer: 0, drift: false, brake: false });
  for (let i = 0; i < 420; i++) {
    q.placeProgress(q.track.length * 0.25, 0);
    q.tick(1 / 60, 1);
  }
  q.setTestDrive(null);
  const capped = q.player.speed;
  // drift charge rate with grip lv3 vs lv0
  q.player.driftCharge = 0;
  q.player.drifting = true;
  q.player.driftDir = 1;
  q.player.speed = 40;
  q.input.manual = { steer: 0.8, drift: true };
  q.tick(1 / 60, 20);
  const chargeLv3 = q.player.driftCharge;
  return { capped: +capped.toFixed(2), chargeLv3: +chargeLv3.toFixed(3), baseMax: +q.mods.baseMax.toFixed(2) };
});
report("tuning_speed_cap", Math.abs(drive.capped - drive.baseMax) < 3 && drive.baseMax > 46,
  JSON.stringify(drive));

// ---------- missile locks the leader ----------
const lockA = await page.evaluate(() => {
  const q = window.__qq;
  q.input.manual = null;
  q.items.clearProjectiles();
  q.startLevel("coast", true);
  q.skipCountdown();
  q.tick(1 / 60, 40);
  // 玩家第 4，AI 里第 5 台（index 4）是全场第一
  q.player.progress = 120;
  q.ais.forEach((a, i) => { a.dist = 160 + i * 40; });
  q.giveItem("missile");
  q.useItem();
  const m = q.items.missiles[q.items.missiles.length - 1];
  return {
    targetIdx: q.ais.indexOf(m.target),
    leaderFlag: !!m.leader,
    lock: !!m.lock,
    speed: +m.speed.toFixed(1),
    toast: document.getElementById("item-toast").textContent,
  };
});
report("missile_locks_leader", lockA.targetIdx === 4 && lockA.leaderFlag && lockA.lock && lockA.toast.includes("锁定第一名"),
  JSON.stringify(lockA));
await page.screenshot({ path: `${OUT}/ego-missile-leader.png` });

const lockB = await page.evaluate(() => {
  const q = window.__qq;
  const before = q.items.stats.hits;
  q.tick(1 / 60, 220);
  return { hits: q.items.stats.hits - before, missiles: q.items.missiles.length, leaderStun: +(q.ais[4].stun || 0).toFixed(2) };
});
report("missile_hits_leader", lockB.hits >= 1 && lockB.missiles === 0, JSON.stringify(lockB));

// 玩家自己领跑时，导弹改打最前面的追兵，绝不空放
const lockC = await page.evaluate(() => {
  const q = window.__qq;
  q.items.clearProjectiles();
  q.player.progress = 500;
  q.ais.forEach((a, i) => { a.dist = 300 + i * 30; });
  q.giveItem("missile");
  q.useItem();
  const m = q.items.missiles[q.items.missiles.length - 1];
  return {
    targetIdx: q.ais.indexOf(m.target),
    leaderFlag: !!m.leader,
    toast: document.getElementById("item-toast").textContent,
    hit: (() => { const b = q.items.stats.hits; q.tick(1 / 60, 220); return q.items.stats.hits - b; })(),
  };
});
report("missile_chaser_when_leading", lockC.targetIdx === 4 && !lockC.leaderFlag && lockC.hit >= 1,
  JSON.stringify(lockC));

// ---------- difficulty payout ----------
const payout = await page.evaluate(async () => {
  const q = window.__qq;
  const run = (diff) => {
    q.setCoins(0);
    q.setDifficulty(diff);
    q.startLevel("coast", true);
    q.skipCountdown();
    q.tick(1 / 60, 30);
    q.player.progress = 1e9;
    q.ais.forEach((a) => { a.dist = -1e9; });
    q.forceFinish();
    return q.save.coins;
  };
  const easy = run("easy");
  const hard = run("hard");
  return { easy, hard };
});
report("difficulty_payout_scales", payout.hard > payout.easy * 1.8, JSON.stringify(payout));

// ---------- stars gated by difficulty ----------
const stars = await page.evaluate(() => {
  const q = window.__qq;
  const res = {};
  const placeStars = (diff, aheadCount) => {
    q.setDifficulty(diff);
    q.startLevel("coast", true);
    q.skipCountdown();
    q.tick(1 / 60, 20);
    q.player.progress = 1e9;
    q.ais.forEach((a, i) => { a.dist = i < aheadCount ? 1e9 + 10 : -1e9; });
    q.forceFinish();
    q.tick(1 / 60, 220);
    return document.querySelectorAll("#result-stars span.on").length;
  };
  // 低难度：前 3 名都给 3 星
  res.easyP1 = placeStars("easy", 0);
  res.easyP3 = placeStars("easy", 2);
  // 中难度：冠亚季 = 3/2/1
  res.normalP1 = placeStars("normal", 0);
  res.normalP2 = placeStars("normal", 1);
  res.normalP3 = placeStars("normal", 2);
  // 高难度：冠军仍是 3 星，其余 -1
  res.hardP1 = placeStars("hard", 0);
  res.hardP2 = placeStars("hard", 1);
  res.hardP3 = placeStars("hard", 2);
  res.hardP4 = placeStars("hard", 3);
  return res;
});
report("difficulty_star_gate",
  stars.easyP1 === 3 && stars.easyP3 === 3
  && stars.normalP1 === 3 && stars.normalP2 === 2 && stars.normalP3 === 1
  && stars.hardP1 === 3 && stars.hardP2 === 1 && stars.hardP3 === 0 && stars.hardP4 === 0,
  JSON.stringify(stars));

// ---------- HUD loadout chip ----------
const hudChip = await page.evaluate(() => {
  const q = window.__qq;
  q.goMenu();
  q.setDifficulty("hard");
  q.startLevel("canyon", true);
  q.skipCountdown();
  q.tick(1 / 60, 30);
  const el = document.getElementById("hud-loadout");
  const mm = document.getElementById("map-wrap").getBoundingClientRect();
  const lb = el.getBoundingClientRect();
  return {
    text: el.textContent,
    diff: el.dataset.diff,
    insideMap: lb.top >= mm.top - 1 && lb.bottom <= mm.bottom + 1 && lb.right <= mm.right + 1,
    resultDiff: (() => { q.forceFinish(); q.tick(1 / 60, 200); return document.getElementById("result-difficulty").textContent; })(),
  };
});
report("hud_loadout_chip", hudChip.diff === "hard" && hudChip.text.includes("难度 高") && hudChip.insideMap
  && hudChip.resultDiff.includes("高"), JSON.stringify(hudChip));
await page.screenshot({ path: `${OUT}/ego-loadout-hud.png` });

// ---------- mobile layout ----------
const mobile = await task.newPage();
  extraPages.push(mobile);
try { await mobile.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); } catch (e) {}
try { await mobile.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); } catch (e) {}
if (!await boot(mobile, "?reset=1")) {
  report("mobile_boot", false, "boot timeout");
} else {
  await sleep(600);
  await mobile.evaluate(() => { window.__qq.setCoins(900); window.__qq.openGarage(); });
  await sleep(450);
  const mGarage = await mobile.evaluate(() => {
    const doc = document.documentElement;
    const wrap = document.querySelector(".garage-card-wrap");
    const wr = wrap.getBoundingClientRect();
    return {
      shown: document.getElementById("garage-screen").classList.contains("show"),
      cards: document.querySelectorAll(".garage-card").length,
      scrollable: wrap.scrollHeight > wr.height,
      fits: wr.width <= window.innerWidth && wr.left >= 0,
      ov: [doc.scrollWidth - doc.clientWidth, doc.scrollHeight - doc.clientHeight],
      chips: [...document.querySelectorAll('#title-screen button[data-diff]')].length,
    };
  });
  report("mobile_garage_layout", mGarage.shown && mGarage.cards === 5 && mGarage.fits && mGarage.ov[0] <= 1 && mGarage.chips === 3,
    JSON.stringify(mGarage));
  await mobile.screenshot({ path: `${OUT}/ego-garage-mobile.png` });
  await mobile.evaluate(() => window.__qq.closeGarage());
  await sleep(200);
  await mobile.evaluate(() => {
    const q = window.__qq;
    q.startLevel("neon", true);
    q.skipCountdown();
    q.tick(1 / 60, 60);
    q.giveItem("missile");
    q.useItem();
    q.tick(1 / 60, 20);
  });
  await sleep(400);
  const mRace = await mobile.evaluate(() => {
    const doc = document.documentElement;
    const el = document.getElementById("hud-loadout");
    const mm = document.getElementById("map-wrap").getBoundingClientRect();
    const lb = el.getBoundingClientRect();
    return {
      state: window.__qq.state,
      text: el.textContent,
      insideMap: lb.bottom <= mm.bottom + 1,
      errs: window.__qq.errors,
      ov: [doc.scrollWidth - doc.clientWidth, doc.scrollHeight - doc.clientHeight],
    };
  });
  report("mobile_loadout_hud", mRace.state === "race" && mRace.insideMap && mRace.errs.length === 0 && mRace.ov[0] <= 1,
    JSON.stringify(mRace));
  await mobile.screenshot({ path: `${OUT}/ego-missile-mobile.png` });
  await mobile.close();
}

// ---------- desktop layout ----------
const desktop = await page.evaluate(() => {
  const doc = document.documentElement;
  return [doc.scrollWidth - doc.clientWidth, doc.scrollHeight - doc.clientHeight];
});
report("desktop_no_overflow", desktop[0] <= 1 && desktop[1] <= 1, JSON.stringify(desktop));

const errs = await page.evaluate(() => window.__qq.errors);
report("no_runtime_errors", errs.length === 0, JSON.stringify(errs));

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ total: checks.length, failed: failed.length, checks }, null, 2));
console.log("FAILED:", failed.length ? failed.map((c) => c.name).join(", ") : "none");
await cleanup();
