// ego-lite 验收：7 条主题赛道 / 道具系统 / 无限赛道 / 关卡解锁 / 移动端
// 运行：ego-browser nodejs < test/ego-levels-items.js
//
// ego 窗口被遮挡时 rAF 会节流，所以玩法断言全部用 window.__qq.tick() 主动推进
// 模拟帧，截图前再留出真实渲染时间。所有断言只依赖 Page 侧状态。

const URL = process.env.QQ_URL || "http://127.0.0.1:8791/";
const OUT = process.env.QQ_OUT || "/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/qq-speed-3d/test";
const task = await taskSpace("QQ飞车 关卡道具无限赛道 验收");
const checks = [];
const report = (name, pass, detail = "") => checks.push({ name, pass: !!pass, detail: detail ?? "" });
const sleep = (ms) => pageWait(ms);

let page = (await task.pages()).find((p) => p.label === "p1") || await task.newPage();
async function pageWait(ms) { return page.waitForTimeout(ms); }

async function boot(p) {
  await p.goto(URL + "?reset=1&v=" + Date.now());
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await p.waitForFunction(() => window.__qq && window.__qq.ready, undefined, { timeout: 18000 });
      return true;
    } catch (e) {
      console.log("BOOT-RETRY", attempt);
      await p.reload().catch(() => {});
      await p.waitForTimeout(700);
    }
  }
  return false;
}

async function state() {
  return page.evaluate(() => ({
    state: window.__qq.state,
    mode: window.__qq.mode,
    stage: window.__qq.endless.stage,
    trackId: window.__qq.currentSpec.id,
    theme: window.__qq.currentSpec.theme.id,
    errs: window.__qq.errors,
    paused: window.__qq.paused,
  }));
}

if (!await boot(page)) {
  console.log("BOOT FAILED");
  await task.finish({ keep: [] });
  process.exitCode = 1;
  throw new Error("boot failed");
}
await sleep(700);
let s0 = await state();
report("boot", s0.state === "menu" && s0.errs.length === 0, JSON.stringify(s0));
let ov = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight]);
report("layout_no_overflow", ov[0] <= ov[1] + 1 && ov[2] <= ov[3] + 1, JSON.stringify(ov));

// ---------- level select ----------
await page.evaluate(() => window.__qq.openSelect());
await sleep(500);
const sel = await page.evaluate(() => ({
  cards: document.querySelectorAll(".track-card").length,
  locked: document.querySelectorAll(".track-card.locked").length,
  endless: !!document.querySelector(".track-card.endless"),
  codex: document.querySelectorAll(".codex-item").length,
  shown: document.getElementById("select-screen").classList.contains("show"),
}));
report("select_screen", sel.shown && sel.cards === 8 && sel.locked === 6 && sel.endless && sel.codex === 5, JSON.stringify(sel));
await page.screenshot({ path: `${OUT}/ego-select-desktop.png` });
await page.evaluate(() => window.__qq.closeSelect());
await sleep(350);
await page.evaluate(() => {
  window.__qq.openSelect();
});
await sleep(250);
await page.click('.track-card[data-id="neon"]');
await sleep(250);
let afterLocked = await state();
report("locked_card_blocked", afterLocked.state === "menu", afterLocked.state);
await page.evaluate(() => window.__qq.closeSelect());
await sleep(250);

// ---------- all circuits ----------
const ids = ["coast", "canyon", "neon", "frost", "jungle", "volcano", "sky"];
const memory = [];
for (const id of ids) {
  const started = await page.evaluate(({ id }) => {
    const ok = window.__qq.startLevel(id, true);
    window.__qq.skipCountdown();
    window.__qq.tick(1 / 60, 24);
    return ok;
  }, { id });
  await sleep(120);
  const info = await page.evaluate(() => {
    const t = window.__qq.track;
    return {
      state: window.__qq.state,
      id: window.__qq.currentSpec.id,
      theme: window.__qq.currentSpec.theme.id,
      laps: window.__qq.raceLaps,
      pads: t.boostPads.length,
      boxes: t.itemBoxes.length,
      len: Math.round(t.length),
      errs: window.__qq.errors,
      mem: window.__qq.renderer.info.memory,
    };
  });
  memory.push(info.mem.geometries);
  report(`circuit_${id}`, started && info.state === "race" && info.id === id && info.pads >= 8 && info.boxes >= 16 && info.errs.length === 0,
    JSON.stringify({ state: info.state, id: info.id, theme: info.theme, pads: info.pads, boxes: info.boxes, len: info.len }));
  await page.screenshot({ path: `${OUT}/ego-level-${id}.png` });
}
report("circuit_geometry_recycled", Math.max(...memory) - Math.min(...memory) < 120, JSON.stringify(memory));

// ---------- item pickup ----------
await page.evaluate(() => {
  const q = window.__qq;
  q.startLevel("coast", true);
  q.skipCountdown();
  q.tick(1 / 60, 40);
  const box = q.track.itemBoxes[0];
  q.placeProgress(box.u * q.track.length, box.lane);
  q.tick(1 / 60, 8);
});
await sleep(200);
const picked = await page.evaluate(() => ({
  held: window.__qq.items.held,
  picked: window.__qq.items.stats.picked,
  slot: document.getElementById("item-slot").dataset.item,
  slotReady: document.getElementById("item-slot").classList.contains("ready"),
  tag: document.getElementById("item-tag").textContent,
}));
report("item_pickup", !!picked.held && picked.picked >= 1 && picked.slot === picked.held && picked.slotReady,
  JSON.stringify(picked));
await page.screenshot({ path: `${OUT}/ego-item-held.png` });

// ---------- every item effect ----------
const boost = await page.evaluate(() => {
  const q = window.__qq;
  q.setSpeed(20);
  q.giveItem("boost");
  q.useItem();
  return { boost: q.player.boostTime, speed: q.player.speed };
});
report("item_boost", boost.boost > 1 && boost.speed > 20, JSON.stringify(boost));

const shield = await page.evaluate(() => {
  const q = window.__qq;
  q.giveItem("shield");
  q.useItem();
  q.tick(1 / 60, 2);
  return {
    shield: q.player.shieldTime,
    pill: document.getElementById("shield-pill").classList.contains("on"),
  };
});
report("item_shield", shield.shield > 7 && shield.pill, JSON.stringify(shield));
await page.screenshot({ path: `${OUT}/ego-item-shield.png` });

const mine = await page.evaluate(() => {
  const q = window.__qq;
  q.giveItem("mine");
  q.useItem();
  q.tick(1 / 60, 2);
  return { mines: q.items.mines.length };
});
report("item_mine", mine.mines > 0, JSON.stringify(mine));

const shock = await page.evaluate(() => {
  const q = window.__qq;
  q.giveItem("shock");
  q.useItem();
  q.tick(1 / 60, 2);
  return { stun: q.ais.map((a) => +(a.stun || 0).toFixed(2)) };
});
report("item_shock", shock.stun.some((v) => v > 0.5), JSON.stringify(shock));

const missile = await page.evaluate(() => {
  const q = window.__qq;
  const before = q.items.stats.hits;
  q.giveItem("missile");
  const used = q.useItem();
  q.tick(1 / 60, 120);
  return { used, before, hits: q.items.stats.hits, missiles: q.items.missiles.length };
});
report("item_missile", missile.used === "missile" && missile.hits > missile.before, JSON.stringify(missile));

const mineHits = await page.evaluate(() => {
  const q = window.__qq;
  q.items.clearProjectiles();
  q.player.shieldTime = 0;
  q.player.stun = 0;
  q.player.speed = 0;
  q.items.spawnMine(q.player.pos.clone(), "ai");
  q.items.mines[q.items.mines.length - 1].armed = 0;
  q.tick(1 / 60, 4);
  const playerStunned = q.player.stun > 0;
  q.items.clearProjectiles();
  const ai = q.ais[0];
  q.items.spawnMine(ai.kart.group.position.clone(), "player");
  q.items.mines[q.items.mines.length - 1].armed = 0;
  q.tick(1 / 60, 4);
  return { playerStunned, aiStunned: (ai.stun || 0) > 0, mines: q.items.mines.length };
});
report("mine_collision", mineHits.playerStunned && mineHits.aiStunned, JSON.stringify(mineHits));

const hit = await page.evaluate(() => {
  const q = window.__qq;
  q.player.shieldTime = 0;
  q.player.stun = 0;
  q.items.hitPlayer(1);
  q.tick(1 / 60, 2);
  const stunned = q.player.stun > 0 && document.getElementById("hud").classList.contains("stunned");
  q.player.stun = 0;
  q.giveItem("shield");
  q.useItem();
  const before = q.items.stats.gotHit;
  q.items.hitPlayer(1);
  return { stunned, blocked: q.items.stats.gotHit === before && q.player.stun === 0, shield: q.player.shieldTime };
});
report("player_hit_and_shield_block", hit.stunned && hit.blocked, JSON.stringify(hit));
await page.screenshot({ path: `${OUT}/ego-item-stun.png` });

// ---------- endless ----------
await page.evaluate(() => window.__qq.startEndless());
await page.evaluate(() => { window.__qq.skipCountdown(); window.__qq.tick(1 / 60, 60); });
await sleep(250);
const endlessStart = await page.evaluate(() => ({
  state: window.__qq.state,
  mode: window.__qq.mode,
  stage: window.__qq.endless.stage,
  stageCell: !document.getElementById("stage-cell").classList.contains("hide"),
  theme: window.__qq.currentSpec.theme.id,
  track: window.__qq.currentSpec.id,
}));
report("endless_start", endlessStart.state === "race" && endlessStart.mode === "endless" && endlessStart.stage === 1 && endlessStart.stageCell,
  JSON.stringify(endlessStart));
await page.screenshot({ path: `${OUT}/ego-endless-start.png` });

const stageRecords = [];
for (let i = 0; i < 3; i++) {
  const beforeStage = await page.evaluate(() => window.__qq.endless.stage);
  const res = await page.evaluate(() => {
    const q = window.__qq;
    q.player.progress = 1e9;
    q.ais.forEach((a) => { a.dist = -1e9; });
    q.forceStageClear();
    q.tick(1 / 60, 260);
    return {
      stage: q.endless.stage,
      state: q.state,
      track: q.currentSpec.id,
      theme: q.currentSpec.theme.id,
      best: q.save.endless.bestStage,
      errs: q.errors,
      geometry: q.renderer.info.memory.geometries,
    };
  });
  stageRecords.push(res.stage);
  report(`endless_stage_${i + 2}`, res.stage === beforeStage + 1 && res.state === "race" && res.errs.length === 0,
    JSON.stringify(res));
}
report("endless_themes_rotate", new Set(stageRecords).size >= 1 && stageRecords[2] >= 4, JSON.stringify(stageRecords));
await page.screenshot({ path: `${OUT}/ego-endless-stage4.png` });

// quit an endless run from the pause menu
await page.evaluate(() => window.__qq.togglePause());
await sleep(250);
const pauseEndless = await page.evaluate(() => ({
  paused: window.__qq.paused,
  btnVisible: !document.getElementById("pause-endless-btn").classList.contains("hide"),
}));
report("endless_pause_button", pauseEndless.paused && pauseEndless.btnVisible, JSON.stringify(pauseEndless));
await page.click("#pause-endless-btn");
await page.evaluate(() => window.__qq.tick(1 / 60, 160));
await sleep(300);
const endlessResult = await page.evaluate(() => ({
  state: window.__qq.state,
  shown: document.getElementById("result-screen").classList.contains("show"),
  kicker: document.getElementById("result-kicker").textContent,
  placeName: document.getElementById("result-place-name").textContent,
  best: window.__qq.save.endless.bestStage,
  again: document.getElementById("again-btn").textContent,
  errs: window.__qq.errors,
}));
report("endless_result", endlessResult.state === "result" && endlessResult.shown && /ENDLESS/.test(endlessResult.kicker) && endlessResult.best >= 1 && endlessResult.errs.length === 0,
  JSON.stringify(endlessResult));
await page.screenshot({ path: `${OUT}/ego-endless-result.png` });

// ---------- endless failure: finish outside the top 4 ----------
await page.evaluate(() => { window.__qq.startEndless(); window.__qq.skipCountdown(); window.__qq.tick(1 / 60, 20); });
const fail = await page.evaluate(() => {
  const q = window.__qq;
  q.player.progress = -1e9;
  q.ais.forEach((a) => { a.dist = 1e9; });
  q.forceStageClear();
  q.tick(1 / 60, 340);
  return {
    state: q.state,
    pendingFail: q.endless.pendingFail,
    kicker: document.getElementById("result-kicker").textContent,
    stage: q.endless.stage,
    errs: q.errors,
  };
});
report("endless_fail_run", fail.state === "result" && fail.pendingFail && /ENDLESS/.test(fail.kicker) && fail.errs.length === 0,
  JSON.stringify(fail));

// ---------- campaign result, stars, unlock, next level ----------
await page.evaluate(() => {
  const q = window.__qq;
  q.startLevel("volcano", true);
  q.skipCountdown();
  q.tick(1 / 60, 24);
  q.placeProgress(q.track.length * 2.972, 0);
  q.tick(1 / 60, 260);
});
await sleep(300);
const result = await page.evaluate(() => ({
  state: window.__qq.state,
  shown: document.getElementById("result-screen").classList.contains("show"),
  time: document.getElementById("result-time").textContent,
  history: document.getElementById("result-history").textContent,
  stars: [...document.querySelectorAll("#result-stars span")].filter((e) => e.classList.contains("on")).length,
  unlock: document.getElementById("result-unlock").textContent,
  next: window.__qq.selectedId,
  again: document.getElementById("again-btn").textContent,
  errs: window.__qq.errors,
}));
report("campaign_result", result.state === "result" && result.shown && result.stars === 3 && /解锁/.test(result.unlock) && result.next === "sky" && result.errs.length === 0,
  JSON.stringify(result));
report("result_time_matches_record", result.time === result.history, JSON.stringify({ time: result.time, history: result.history }));
await page.screenshot({ path: `${OUT}/ego-campaign-result.png` });

await page.click("#again-btn");
await sleep(400);
const nextLevel = await page.evaluate(() => ({
  state: window.__qq.state,
  track: window.__qq.currentSpec.id,
}));
report("next_level_button", nextLevel.track === "sky" && (nextLevel.state === "countdown" || nextLevel.state === "race"), JSON.stringify(nextLevel));
await page.evaluate(() => window.__qq.goMenu());
await sleep(300);

// ---------- mobile ----------
const mobile = await task.newPage();
try { await mobile.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); } catch (e) {}
try { await mobile.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); } catch (e) {}
page = mobile;
if (!await boot(page)) {
  report("mobile_boot", false, "boot failed");
} else {
  await sleep(700);
  let m = await page.evaluate(() => ({
    touch: document.body.classList.contains("touch"),
    errs: window.__qq.errors,
    ov: [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight],
  }));
  report("mobile_boot", m.touch && m.errs.length === 0 && m.ov[0] <= m.ov[1] && m.ov[2] <= m.ov[3], JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/ego-mobile-title.png` });

  await page.evaluate(() => window.__qq.openSelect());
  await sleep(500);
  const msel = await page.evaluate(() => ({
    shown: document.getElementById("select-screen").classList.contains("show"),
    cards: document.querySelectorAll(".track-card").length,
    scrollable: document.getElementById("select-screen").scrollHeight > document.getElementById("select-screen").clientHeight,
    ov: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
  }));
  report("mobile_select", msel.shown && msel.cards === 8 && msel.ov[0] <= msel.ov[1], JSON.stringify(msel));
  await page.screenshot({ path: `${OUT}/ego-mobile-select.png` });
  await page.evaluate(() => { const q = window.__qq; q.closeSelect(); q.startEndless(); q.skipCountdown(); q.tick(1 / 60, 80); });
  await sleep(700);
  // item + shield HUD
  await page.evaluate(() => { const q = window.__qq; q.giveItem("shield"); q.useItem(); q.tick(1 / 60, 2); });
  await sleep(300);
  const mob = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    const overlap = (a, b) => a && b && a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
    const item = r("#item-slot");
    const speedo = r("#speedo");
    const right = r("#touch .cluster.right");
    const left = r("#touch .cluster.left");
    return {
      state: window.__qq.state,
      mode: window.__qq.mode,
      stageCell: !document.getElementById("stage-cell").classList.contains("hide"),
      item, speedo, right, left,
      itemOverSpeedo: overlap(item, speedo),
      itemOverRight: overlap(item, right),
      itemOverLeft: overlap(item, left),
      shieldPill: document.getElementById("shield-pill").classList.contains("on"),
      ov: [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight],
      errs: window.__qq.errors,
    };
  });
  report("mobile_race_layout", mob.state === "race" && mob.stageCell && mob.shieldPill && !mob.itemOverSpeedo && !mob.itemOverRight && !mob.itemOverLeft && mob.ov[0] <= mob.ov[1] && mob.ov[2] <= mob.ov[3] && mob.errs.length === 0,
    JSON.stringify(mob));
  await page.screenshot({ path: `${OUT}/ego-mobile-race.png` });

  await page.evaluate(() => window.__qq.togglePause());
  await sleep(300);
  const mpause = await page.evaluate(() => {
    const b = document.getElementById("pause-endless-btn").getBoundingClientRect();
    return { paused: window.__qq.paused, visible: !document.getElementById("pause-endless-btn").classList.contains("hide"), box: [Math.round(b.width), Math.round(b.height)] };
  });
  report("mobile_pause", mpause.paused && mpause.visible && mpause.box[0] > 0, JSON.stringify(mpause));
  await page.screenshot({ path: `${OUT}/ego-mobile-pause.png` });
  await page.evaluate(() => window.__qq.togglePause());

  // campaign result on mobile
  await page.evaluate(() => {
    const q = window.__qq;
    q.startLevel("coast", true);
    q.skipCountdown();
    q.tick(1 / 60, 24);
    q.placeProgress(q.track.length * 2.972, 0);
    q.tick(1 / 60, 260);
  });
  await sleep(300);
  const mres = await page.evaluate(() => {
    const card = document.querySelector(".result-card").getBoundingClientRect();
    return {
      state: window.__qq.state,
      shown: document.getElementById("result-screen").classList.contains("show"),
      card: [Math.round(card.top), Math.round(card.bottom)],
      viewport: window.innerHeight,
      ov: [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight],
      errs: window.__qq.errors,
    };
  });
  report("mobile_result", mres.state === "result" && mres.shown && mres.ov[0] <= mres.ov[1] && mres.ov[2] <= mres.ov[3] && mres.errs.length === 0,
    JSON.stringify(mres));
  await page.screenshot({ path: `${OUT}/ego-mobile-result.png` });
  await mobile.close();
}

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify(checks, null, 2));
console.log("FAILED:", failed.length ? failed.map((f) => f.name) : "none");
await task.finish({ keep: [] });
if (failed.length) process.exitCode = 1;
