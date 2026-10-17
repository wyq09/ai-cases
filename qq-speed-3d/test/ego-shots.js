// 生成 shots/ 文档截图：ego-browser nodejs < test/ego-shots.js
const URL = process.env.QQ_URL || "http://127.0.0.1:8791/";
const OUT = process.env.QQ_OUT || "/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/qq-speed-3d/shots";
const task = await taskSpace("QQ飞车 截图 " + Date.now());
let page = (await task.pages()).find((p) => p.label === "p1") || await task.newPage();
const sleep = (ms) => page.waitForTimeout(ms);

async function boot(p) {
  await p.goto(URL + "?reset=1&v=" + Date.now());
  for (let i = 0; i < 3; i++) {
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
async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}
async function disableTransitions(p) {
  await p.evaluate(() => {
    if (document.getElementById("shot-no-transition")) return;
    const st = document.createElement("style");
    st.id = "shot-no-transition";
    st.textContent = "*{transition:none!important}";
    document.head.appendChild(st);
  });
}

if (!await boot(page)) {
  console.log("BOOT FAILED");
  await task.finish({ keep: [] });
  throw new Error("boot failed");
}
await disableTransitions(page);
await sleep(600);
await shot("title-desktop");
await page.evaluate(() => window.__qq.openSelect());
await sleep(700);
await shot("select-desktop");
await page.evaluate(() => window.__qq.closeSelect());
await sleep(500);

const levels = ["coast", "canyon", "neon", "frost", "jungle", "volcano", "sky"];
for (const id of levels) {
  await page.evaluate(({ id }) => {
    const q = window.__qq;
    q.startLevel(id, true);
    q.skipCountdown();
    q.tick(1 / 60, 170);
  }, { id });
  await sleep(900);
  await shot(`level-${id}`);
}

// drift
await page.evaluate(() => {
  const q = window.__qq;
  q.startLevel("coast", true);
  q.skipCountdown();
  q.tick(1 / 60, 100);
  q.setSpeed(34);
  q.setTestDrive({ steer: 0.65, drift: true });
  q.tick(1 / 60, 26);
});
await sleep(300);
await shot("drift-desktop");
await page.evaluate(() => window.__qq.setTestDrive(null));

// nitro
await page.evaluate(() => {
  const q = window.__qq;
  q.startLevel("coast", true);
  q.skipCountdown();
  q.tick(1 / 60, 100);
  q.setNitro(3);
  q.setSpeed(48);
  q.setTestDrive({ steer: 0, nitro: true });
  q.tick(1 / 60, 18);
});
await sleep(300);
await shot("nitro-desktop");
await page.evaluate(() => window.__qq.setTestDrive(null));

// item held / shield / missile
await page.evaluate(() => {
  const q = window.__qq;
  q.startLevel("neon", true);
  q.skipCountdown();
  q.tick(1 / 60, 100);
  q.giveItem("missile");
  q.tick(1 / 60, 2);
});
await sleep(300);
await shot("item-held");
await page.evaluate(() => {
  const q = window.__qq;
  q.giveItem("shield");
  q.useItem();
  q.tick(1 / 60, 8);
});
await sleep(300);
await shot("item-shield");
await page.evaluate(() => {
  const q = window.__qq;
  q.player.shieldTime = 0;
  q.ais.forEach((a, i) => { a.dist = q.player.progress + 90 + i * 8; a.finished = false; a.stun = 0; });
  q.tick(1 / 60, 2);
  q.giveItem("missile");
  q.useItem();
  if (q.items.missiles[0]) q.items.missiles[0].speed = 26;
  q.tick(1 / 60, 14);
});
await sleep(250);
await shot("item-missile");

// endless stage 2 and result
await page.evaluate(() => {
  const q = window.__qq;
  q.startEndless();
  q.skipCountdown();
  q.tick(1 / 60, 100);
  q.player.progress = 1e9;
  q.ais.forEach((a) => { a.dist = -1e9; });
  q.forceStageClear();
  q.tick(1 / 60, 260);
});
await sleep(900);
await shot("endless-stage2");
await page.evaluate(() => window.__qq.togglePause());
await sleep(400);
await shot("pause-endless-desktop");
await page.click("#pause-endless-btn");
await page.evaluate(() => window.__qq.tick(1 / 60, 160));
await page.evaluate(() => {
  const p = document.getElementById("pause-screen");
  p.style.transition = "none";
  p.classList.remove("show");
  p.style.display = "none";
  const r = document.getElementById("result-screen");
  r.style.transition = "none";
  r.classList.add("show");
  r.style.opacity = "1";
  r.style.visibility = "visible";
});
await sleep(450);
await shot("endless-result");
await page.evaluate(() => {
  document.getElementById("pause-screen").style.display = "";
  const r = document.getElementById("result-screen");
  r.style.opacity = "";
  r.style.visibility = "";
});

// campaign result
await page.evaluate(() => {
  const q = window.__qq;
  q.startLevel("volcano", true);
  q.skipCountdown();
  q.tick(1 / 60, 30);
  q.placeProgress(q.track.length * 2.972, 0);
  q.tick(1 / 60, 260);
});
await page.evaluate(() => {
  const r = document.getElementById("result-screen");
  r.style.transition = "none";
  r.classList.add("show");
  r.style.opacity = "1";
  r.style.visibility = "visible";
});
await sleep(350);
await shot("result-desktop");
await page.close();

// mobile
page = await task.newPage();
try { await page.cdp("Page.bringToFront"); } catch (e) {}
try { await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); } catch (e) {}
try { await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); } catch (e) {}
if (!await boot(page)) {
  console.log("MOBILE BOOT FAILED");
} else {
  await disableTransitions(page);
  await sleep(600);
  await shot("title-mobile");
  await page.evaluate(() => window.__qq.openSelect());
  await sleep(700);
  await shot("select-mobile");
  await page.evaluate(() => {
    const q = window.__qq;
    q.closeSelect();
    q.startEndless();
    q.skipCountdown();
    q.tick(1 / 60, 100);
    q.placeProgress(q.track.length * 0.22, 0);
    q.setSpeed(0);
    q.tick(1 / 60, 52);
    q.giveItem("shield");
    q.useItem();
    q.tick(1 / 60, 6);
  });
  await sleep(700);
  await shot("race-mobile");
  await page.evaluate(() => {
    const q = window.__qq;
    q.startLevel("neon", true);
    q.skipCountdown();
    q.tick(1 / 60, 140);
    q.giveItem("missile");
    q.tick(1 / 60, 2);
  });
  await sleep(700);
  await shot("item-mobile");
  await page.evaluate(() => {
    const q = window.__qq;
    q.startLevel("coast", true);
    q.skipCountdown();
    q.tick(1 / 60, 30);
    q.placeProgress(q.track.length * 2.972, 0);
    q.tick(1 / 60, 260);
    const r = document.getElementById("result-screen");
    r.style.transition = "none";
    r.classList.add("show");
    r.style.opacity = "1";
    r.style.visibility = "visible";
  });
  await sleep(350);
  await shot("result-mobile");
  await page.close();
}
await task.finish({ keep: [] });
