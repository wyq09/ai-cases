// 转向与护栏回归测试：ego-browser nodejs < test/regression.js
// 1) 左/右输入必须对应屏幕左/右
// 2) 氮气极速贴墙行驶时，车体不得越过护栏内壁
// 注意：ego 窗口被遮挡时 rAF 会被暂停，这里全部用定时器采样。

const URL = process.env.QQ_URL || "http://127.0.0.1:8791/";
const task = await taskSpace("QQ飞车 转向与护栏回归");
const page = task.page("p1");
try { await page.cdp("Network.setCacheDisabled", { cacheDisabled: true }); } catch (e) {}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? "" });
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto(URL + "?reset=1&v=" + Date.now());
await page.waitForFunction(() => window.__qq && window.__qq.ready, undefined, { timeout: 45000 });
await page.click("#start-btn");
await page.waitForFunction(() => window.__qq.state === "race", undefined, { timeout: 8000 });
await sleep(900);

async function readHeading() {
  return page.evaluate(() => window.__qq.player.heading);
}

async function steerWithTouch(dir) {
  await page.evaluate(({ dir }) => {
    const q = window.__qq;
    q.player.drifting = false;
    q.player.driftCharge = 0;
    q.input.touch.left = false;
    q.input.touch.right = false;
    q.placeProgress(120, 0);
    q.setSpeed(20);
  }, { dir });
  await sleep(120);
  const h0 = await readHeading();
  await page.evaluate(({ dir }) => {
    const t = window.__qq.input.touch;
    t.left = dir === "left";
    t.right = dir === "right";
  }, { dir });
  await sleep(500);
  const h1 = await readHeading();
  await page.evaluate(() => {
    const q = window.__qq;
    q.input.touch.left = false;
    q.input.touch.right = false;
    q.setSpeed(0);
  });
  let d = h1 - h0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return +d.toFixed(3);
}

async function steerWithKey(key) {
  await page.evaluate(() => {
    const q = window.__qq;
    q.player.drifting = false;
    q.player.driftCharge = 0;
    q.placeProgress(120, 0);
    q.setSpeed(20);
    window.__h0 = q.player.heading;
  });
  await sleep(120);
  await page.keyboard.down(key);
  await sleep(500);
  await page.keyboard.up(key);
  const d = await page.evaluate(() => {
    const q = window.__qq;
    let d = q.player.heading - window.__h0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    q.setSpeed(0);
    return +d.toFixed(3);
  });
  return d;
}

const touchLeft = await steerWithTouch("left");
const touchRight = await steerWithTouch("right");
check("touch_left_turns_left", touchLeft > 0.06, `headingDelta=${touchLeft}`);
check("touch_right_turns_right", touchRight < -0.06, `headingDelta=${touchRight}`);

const arrowLeft = await steerWithKey("ArrowLeft");
const arrowRight = await steerWithKey("ArrowRight");
check("arrow_left_turns_left", arrowLeft > 0.06, `headingDelta=${arrowLeft}`);
check("arrow_right_turns_right", arrowRight < -0.06, `headingDelta=${arrowRight}`);

const ramResults = [];
for (const u of [0.035, 0.19, 0.34, 0.5, 0.66, 0.82, 0.94]) {
  for (const side of [-1, 1]) {
    const r = await page.evaluate(async ({ u, side }) => {
      const q = window.__qq;
      q.input.manual = null;
      q.player.drifting = false;
      q.player.driftCharge = 0;
      q.placeProgress(u * q.track.length, 0);
      q.player.heading += side * 0.85;
      q.player.moveYaw = q.player.heading;
      q.player.speed = 60;
      q.player.nitroActive = 2.0;
      q.player.boostTime = 2.0;
      let maxAbs = 0;
      let maxBodyEdge = -Infinity;
      const bodyHalf = 1.03;
      const barrierInner = q.track.half + 2.04;
      const keep = setInterval(() => {
        q.player.speed = Math.max(q.player.speed, 55);
        q.player.nitroActive = Math.max(q.player.nitroActive, 1.0);
      }, 50);
      const sample = setInterval(() => {
        const near = q.track.nearest(q.player.pos, q.player.prevIndex);
        const abs = Math.abs(near.offset);
        if (abs > maxAbs) maxAbs = abs;
        maxBodyEdge = Math.max(maxBodyEdge, abs + bodyHalf - barrierInner);
      }, 16);
      await new Promise((resolve) => setTimeout(resolve, 1300));
      clearInterval(keep);
      clearInterval(sample);
      q.player.nitroActive = 0;
      q.player.boostTime = 0;
      q.player.speed = 0;
      return {
        u, side,
        maxAbs: +maxAbs.toFixed(3),
        bodyEdgeOverlap: +maxBodyEdge.toFixed(3),
        limit: +(q.track.half + 0.7).toFixed(2),
      };
    }, { u, side });
    ramResults.push(r);
  }
}

const worstAbs = Math.max(...ramResults.map((r) => r.maxAbs));
const worstOverlap = Math.max(...ramResults.map((r) => r.bodyEdgeOverlap));
const anyHit = ramResults.some((r) => r.maxAbs > 7.6);
check("wall_contact_detected", anyHit, `worstOffset=${worstAbs}`);
check("offset_clamped_at_limit", worstAbs <= 8.22, `worstOffset=${worstAbs} limit=8.2`);
check("body_never_enters_barrier", worstOverlap <= 0.02,
  `worstBodyEdgeOverlap=${worstOverlap}m`);

await page.screenshot({ path: "/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/qq-speed-3d/test/regression-wall.png" });
const errs = await page.evaluate(() => window.__qq.errors);
check("no_console_errors", errs.length === 0, JSON.stringify(errs));

console.log(JSON.stringify({ results, ramResults }, null, 2));
const failed = results.filter((r) => !r.pass).map((r) => r.name);
console.log("FAILED:", failed.length ? failed : "none");
await task.finish({ keep: [] });
if (failed.length) process.exitCode = 1;
