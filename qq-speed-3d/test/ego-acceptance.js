// ego-browser 验收脚本：ego-browser nodejs < test/ego-acceptance.js
// 覆盖：启动 / 菜单 / 真实点击开局 / 漂移蓄力 / 松手喷 / 双喷 / 氮气 / 完赛存档 / 暂停恢复 / 移动端布局

const URL = process.env.QQ_URL || "http://127.0.0.1:8791/";
const OUT = process.env.QQ_OUT || "/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/qq-speed-3d/test";
const shot = (name) => `${OUT}/${name}`;
const task = await taskSpace("QQ飞车 3D 验收");

function report(name, pass, detail) {
  return { name, pass: !!pass, detail: detail ?? "" };
}

async function observe(page) {
  return page.evaluate(() => ({
    state: window.__qq.state,
    paused: window.__qq.paused,
    errs: window.__qq.errors,
    save: JSON.parse(localStorage.getItem("qqspeed3d.save.v1") || "{}"),
    debug: window.__qq.debug(),
    overflow: [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
      document.documentElement.scrollHeight,
      document.documentElement.clientHeight,
    ],
  }));
}

async function runDesktop(page) {
  const checks = [];
  await page.goto(URL + "?reset=1&v=" + Date.now());
  await page.waitForFunction(() => window.__qq && window.__qq.ready, undefined, { timeout: 40000 });
  await page.waitForTimeout(900);
  let snap = await observe(page);
  checks.push(report("boot", snap.errs.length === 0 && snap.state === "menu", JSON.stringify(snap.errs)));
  checks.push(report("no_overflow", snap.overflow[0] <= snap.overflow[1] && snap.overflow[2] <= snap.overflow[3], JSON.stringify(snap.overflow)));
  await page.screenshot({ path: shot("ego-desktop-title.png") });

  await page.click("#start-btn");
  await page.waitForFunction(() => window.__qq.state === "race", undefined, { timeout: 8000 });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: shot("ego-desktop-race.png") });
  checks.push(report("race_running", (await page.evaluate(() => window.__qq.state)) === "race"));

  // ego 窗口被遮挡时 rAF 会被系统降频，这里只验证比赛时钟在推进（逐帧逻辑由 ego-levels-items.js 的 tick 覆盖）
  const t0 = await page.evaluate(() => window.__qq.raceMs);
  await page.waitForTimeout(900);
  const t1 = await page.evaluate(() => window.__qq.raceMs);
  checks.push(report("loop_progress", t1 > t0, `${Math.round(t0)} -> ${Math.round(t1)} ms`));

  await page.evaluate(() => { window.__qq.placeProgress(60, 0); window.__qq.setSpeed(30); });
  await page.waitForTimeout(160);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(120);
  await page.keyboard.down("Shift");
  await page.waitForFunction(() => window.__qq.player.drifting, undefined, { timeout: 3000 }).catch(() => {});
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("Shift");
  await page.evaluate(() => window.__qq.setTestDrive({ steer: 0, drift: true }));
  await page.waitForFunction(() => window.__qq.player.driftCharge > 0.35, undefined, { timeout: 6000 }).catch(() => {});
  let drift = (await observe(page)).debug;
  checks.push(report("drift_charges", drift.drifting && drift.driftCharge > 0.3,
    JSON.stringify({ drifting: drift.drifting, charge: drift.driftCharge, offset: drift.offset })));
  // 立刻松手，避免截图耗时导致撞墙中断蓄力
  await page.evaluate(() => window.__qq.setTestDrive({ steer: 0, drift: false }));
  await page.waitForFunction(() => window.__qq.player.driftBoosts >= 1, undefined, { timeout: 2500 }).catch(() => {});
  let rel = (await observe(page)).debug;
  checks.push(report("boost_after_release", rel.boost > 0.2 && rel.nitro > 0.2,
    JSON.stringify({ boost: rel.boost, nitro: rel.nitro, driftBoosts: rel.driftBoosts })));
  await page.screenshot({ path: shot("ego-desktop-drift.png") });
  // 双喷：窗口内补一次漂移按键
  await page.waitForFunction(() => window.__qq.player.doubleWindow > 0, undefined, { timeout: 2500 }).catch(() => {});
  await page.evaluate(() => window.__qq.testPress("drift"));
  await page.waitForFunction(() => window.__qq.player.doubleBoosts >= 1, undefined, { timeout: 2500 }).catch(() => {});
  let dbl = (await observe(page)).debug;
  checks.push(report("double_boost", dbl.doubleBoosts >= 1 && dbl.doubleWindow <= 0,
    JSON.stringify({ boost: dbl.boost, doubleBoosts: dbl.doubleBoosts, doubleWindow: dbl.doubleWindow })));
  await page.evaluate(() => window.__qq.setTestDrive(null));

  // 氮气
  await page.evaluate(() => {
    window.__qq.setNitro(3);
    window.__qq.setSpeed(52);
    window.__qq.input.manual = { steer: 0, nitro: true };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("ego-desktop-nitro.png") });
  let nitro = (await observe(page)).debug;
  checks.push(report("nitro_consumed", nitro.nitroActive > 0 && nitro.nitro < 3,
    JSON.stringify({ nitroActive: nitro.nitroActive, nitro: nitro.nitro })));
  await page.evaluate(() => { window.__qq.input.manual = null; });

  // 完赛
  await page.evaluate(() => { window.__qq.placeProgress(window.__qq.track.length * 2.972, 0); window.__qq.setSpeed(40); });
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    if ((await page.evaluate(() => window.__qq.state)) === "result") break;
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("ego-desktop-result.png") });
  snap = await observe(page);
  checks.push(report("result_and_save", snap.state === "result" && snap.save.races >= 1 && snap.save.coins > 0,
    JSON.stringify(snap.save)));

  // 再来一局 + 暂停恢复
  await page.click("#again-btn");
  await page.waitForFunction(() => window.__qq.state === "race", undefined, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const paused = await page.evaluate(() => window.__qq.paused && document.getElementById("pause-screen").classList.contains("show"));
  checks.push(report("pause", paused));
  await page.screenshot({ path: shot("ego-desktop-pause.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  checks.push(report("resume", !(await page.evaluate(() => window.__qq.paused))));
  snap = await observe(page);
  checks.push(report("no_console_errors", snap.errs.length === 0, JSON.stringify(snap.errs)));
  return checks;
}

async function runMobile(task) {
  const checks = [];
  const page = await task.newPage();
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.goto(URL + "?reset=1&v=" + Date.now());
  await page.waitForFunction(() => window.__qq && window.__qq.ready, undefined, { timeout: 40000 });
  await page.waitForTimeout(700);
  let snap = await observe(page);
  checks.push(report("mobile_boot", snap.errs.length === 0 && snap.state === "menu", JSON.stringify(snap.errs)));
  checks.push(report("mobile_no_overflow", snap.overflow[0] <= snap.overflow[1] && snap.overflow[2] <= snap.overflow[3], JSON.stringify(snap.overflow)));
  checks.push(report("touch_ui", await page.evaluate(() => document.body.classList.contains("touch"))));
  await page.screenshot({ path: shot("ego-mobile-title.png") });
  await page.click("#start-btn");
  await page.waitForFunction(() => window.__qq.state === "race", undefined, { timeout: 8000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: shot("ego-mobile-race.png") });

  // 双指：方向 + 漂移
  await page.evaluate(() => { window.__qq.placeProgress(300, 4.0); window.__qq.setSpeed(32); });
  await page.evaluate(() => {
    const press = (sel, id) => document.querySelector(sel).dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: id, pointerType: "touch", isPrimary: id === 1 })
    );
    press('[data-drive="left"]', 1);
    press('[data-drive="drift"]', 2);
  });
  await page.waitForFunction(() => window.__qq.player.driftCharge > 0.3, undefined, { timeout: 4000 }).catch(() => {});
  let drift = (await observe(page)).debug;
  checks.push(report("mobile_two_finger_drift", drift.drifting && drift.driftCharge > 0.3,
    JSON.stringify({ drifting: drift.drifting, charge: drift.driftCharge })));
  await page.screenshot({ path: shot("ego-mobile-drift.png") });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2, pointerType: "touch" }));
  });
  await page.waitForFunction(() => window.__qq.player.boostTime > 0.1, undefined, { timeout: 2000 }).catch(() => {});
  let rel = (await observe(page)).debug;
  checks.push(report("mobile_release_boost", rel.boost > 0.1 && rel.nitro > 0.2,
    JSON.stringify({ boost: rel.boost, nitro: rel.nitro })));
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch" }));
  });
  await page.waitForTimeout(100);
  const cleared = await page.evaluate(() => Object.values(window.__qq.input.touch).every((v) => !v));
  checks.push(report("mobile_touch_cleared", cleared));

  await page.evaluate(() => {
    window.__qq.setNitro(3);
    document.querySelector('[data-drive="nitro"]').dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 3, pointerType: "touch", isPrimary: true })
    );
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 3, pointerType: "touch" }));
  });
  await page.waitForFunction(() => window.__qq.player.nitroActive > 0, undefined, { timeout: 2500 }).catch(() => {});
  let nitro = (await observe(page)).debug;
  checks.push(report("mobile_nitro", nitro.nitroActive > 0, JSON.stringify({ active: nitro.nitroActive, nitro: nitro.nitro })));
  await page.screenshot({ path: shot("ego-mobile-nitro.png") });

  await page.evaluate(() => { window.__qq.placeProgress(window.__qq.track.length * 2.972, 0); window.__qq.setSpeed(40); });
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    if ((await page.evaluate(() => window.__qq.state)) === "result") break;
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("ego-mobile-result.png") });
  snap = await observe(page);
  checks.push(report("mobile_result", snap.state === "result", snap.state));
  checks.push(report("mobile_no_errors", snap.errs.length === 0, JSON.stringify(snap.errs)));
  await page.close();
  return checks;
}

const desktopPage = (await task.pages()).find((p) => p.label === "p1") || await task.newPage();
const desktop = await runDesktop(desktopPage);
const mobile = await runMobile(task);

const out = { desktop, mobile };
const failed = Object.entries(out).flatMap(([k, v]) => v.filter((c) => !c.pass).map((c) => `${k}:${c.name}`));
console.log(JSON.stringify(out, null, 2));
console.log("FAILED:", failed.length ? failed : "none");
await task.finish({ keep: [] });
if (failed.length) process.exitCode = 1;
