/**
 * 球面涟漪 · UI 层回归（ego-browser）
 * 运行：ego-browser nodejs < test/ui-check.mjs
 * 复用同一个 TaskSpace 的 p1，不额外开页面。
 */
const CASE = "/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/sphere-ripples";
const URL = "file://" + CASE + "/index.html";
const SHOT_DIR = "/tmp/ego-sphere-ripples-20261030-0945";

const task = await taskSpace("sphere-ripples-check-20261030");
const page = task.page("p1");

const results = [];
function check(name, ok, detail) {
  results.push([ok ? "PASS" : "FAIL", name, detail]);
}

await page.cdp("Log.enable").catch(() => {});
await page.cdp("Runtime.enable").catch(() => {});
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1080, height: 1080, deviceScaleFactor: 1, mobile: false,
}).catch(() => {});

await page.goto(URL);
await page.waitForTimeout(1200);

/* ---------- 静态装配 ---------- */
const boot = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return {
    hasCanvas: !!c,
    cssW: c ? c.clientWidth : 0,
    cssH: c ? c.clientHeight : 0,
    p5: (typeof p5 !== "undefined") ? p5.VERSION : null,
    renderer: (typeof p5 !== "undefined" && p5.instance) ? (p5.instance._renderer instanceof p5.RendererGL) : null,
    ripples: (typeof ripples !== "undefined") ? ripples.length : -1,
  };
});
check("页面加载出 canvas 且为 WEBGL 渲染器", boot.hasCanvas && boot.renderer === true, JSON.stringify(boot));
check("p5 版本为 1.9.4", boot.p5 === "1.9.4", "p5=" + boot.p5);
check("画布 CSS 尺寸 1080×1080", boot.cssW === 1080 && boot.cssH === 1080, `${boot.cssW}×${boot.cssH}`);
check("同时存在 150 个涟漪", boot.ripples === 150, "ripples=" + boot.ripples);

/* ---------- 运行态采样 ---------- */
await page.waitForTimeout(4000);

const runtime = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const W = c.width, H = c.height;
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);

  const PAL = [[20, 108, 189], [243, 243, 243], [223, 108, 31], [215, 35, 41], [255, 204, 63]];
  const BGv = 16;                      // 背景 #101010
  const exact = [0, 0, 0, 0, 0];
  let lit = 0, bright = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (r + g + b > 60) {
      lit++;
      if (r + g + b > 400) bright++;
      for (let k = 0; k < 5; k++) {
        const p = PAL[k];
        // ADD 叠加：像素 = 底色 + 描边色（截断到 255）
        const er = Math.min(255, p[0] + BGv), eg = Math.min(255, p[1] + BGv), eb = Math.min(255, p[2] + BGv);
        if (Math.abs(r - er) <= 6 && Math.abs(g - eg) <= 6 && Math.abs(b - eb) <= 6) { exact[k]++; break; }
      }
    }
  }
  const states = {};
  for (const r of ripples) states[r.state] = (states[r.state] || 0) + 1;
  return {
    lit, bright, exact, states,
    depthTest: gl.isEnabled(gl.DEPTH_TEST),
    blendOn: gl.isEnabled(gl.BLEND),
    blendSrc: gl.getParameter(gl.BLEND_SRC_RGB),
    blendDst: gl.getParameter(gl.BLEND_DST_RGB),
    one: gl.ONE, srcAlpha: gl.SRC_ALPHA,
    frameCount,
    unitDirs: ripples.slice(0, 200).every((r) => Math.abs(Math.hypot(r.dir.x, r.dir.y, r.dir.z) - 1) < 1e-9),
  };
});

check("深度测试关闭：前后元素都可见、不做遮挡", runtime.depthTest === false, "depthTest=" + runtime.depthTest);
check("ADD 叠加混合生效（目的因子 = ONE，纯加色）",
  runtime.blendOn === true && runtime.blendDst === runtime.one &&
  (runtime.blendSrc === runtime.one || runtime.blendSrc === runtime.srcAlpha),
  `blend=${runtime.blendOn} src=${runtime.blendSrc} dst=${runtime.blendDst}`);
check("画面有实际发光像素（lit > 20000）", runtime.lit > 20000, "lit=" + runtime.lit);
check("5 种配色全部出现在画面上（底色 + 描边色的加色结果）",
  runtime.exact.every((n) => n > 500), JSON.stringify(runtime.exact));
check("三种生命周期状态同时在跑（delay/ray/ring）",
  !!runtime.states.delay && !!runtime.states.ray && !!runtime.states.ring, JSON.stringify(runtime.states));
check("方向全部为单位向量", runtime.unitDirs === true);

/* ---------- 帧率 ---------- */
const f0 = await page.evaluate(() => frameCount);
await page.waitForTimeout(3000);
const f1 = await page.evaluate(() => frameCount);
const fps = (f1 - f0) / 3;
check("帧率 ≥ 55fps（目标 60fps）", fps >= 55, fps.toFixed(2) + "fps");

/* ---------- 画面在动：两帧像素签名不同 ---------- */
const sig = async () => await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  const px = new Uint8Array(c.width * c.height * 4);
  gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let h = 0, lit = 0;
  for (let i = 0; i < px.length; i += 16) {
    h = (h * 31 + px[i] * 7 + px[i + 1] * 13 + px[i + 2] * 17) >>> 0;
    if (px[i] + px[i + 1] + px[i + 2] > 60) lit++;
  }
  return { h, lit, f: frameCount };
});
const s1 = await sig();
await page.waitForTimeout(1500);
const s2 = await sig();
check("画面逐帧演进（像素签名随时间变化）", s1.h !== s2.h && s1.f !== s2.f, `${s1.h} vs ${s2.h}`);

/* ---------- 自适应：多种视口下不溢出、居中、构图不变 ---------- */
const VIEWPORTS = [
  { w: 1280, h: 720, name: "1280×720 小屏桌面" },
  { w: 1024, h: 1024, name: "1024×1024 方屏" },
  { w: 480, h: 800, name: "480×800 手机竖屏" },
  { w: 1440, h: 400, name: "1440×400 超宽扁屏" },
  { w: 320, h: 568, name: "320×568 小手机" },
];
for (const v of VIEWPORTS) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: v.w, height: v.h, deviceScaleFactor: 1, mobile: false,
  });
  await page.waitForTimeout(450);
  const m = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return {
      cssW: c.clientWidth, cssH: c.clientHeight,
      bufferW: c.width, bufferH: c.height,
      left: r.left, top: r.top, w: r.width, h: r.height,
      vw: window.innerWidth, vh: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      frameCount,
    };
  });
  const expect = Math.floor(Math.min(m.vw, m.vh));
  const centeredX = Math.abs(m.left - (m.vw - m.w) / 2) <= 2;
  const centeredY = Math.abs(m.top - (m.vh - m.h) / 2) <= 2;
  check(`${v.name}：画布缩放到 ${expect}×${expect} 并居中`,
    m.cssW === expect && m.cssH === expect && centeredX && centeredY,
    `css=${m.cssW}×${m.cssH} left=${m.left.toFixed(1)} top=${m.top.toFixed(1)} vw=${m.vw} vh=${m.vh}`);
  check(`${v.name}：无滚动条溢出`,
    m.scrollW <= m.vw && m.scrollH <= m.vh,
    `scroll=${m.scrollW}×${m.scrollH} view=${m.vw}×${m.vh}`);
  check(`${v.name}：渲染分辨率仍为 1080×1080（构图不变）`,
    m.bufferW === 1080 && m.bufferH === 1080, `buffer=${m.bufferW}×${m.bufferH}`);
}

/* ---------- 截图留档 ---------- */
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1080, height: 1080, deviceScaleFactor: 1, mobile: false,
});
await page.waitForTimeout(400);
await page.screenshot({ path: SHOT_DIR + "/ui-check-01.png" });
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
});
await page.waitForTimeout(600);
await page.screenshot({ path: SHOT_DIR + "/ui-check-small-720.png" });

/* ---------- 控制台错误 ---------- */
const events = await page.events();
const errs = events.filter((e) => e.method === "Runtime.exceptionThrown" ||
  (e.method === "Log.entryAdded" && e.params && e.params.entry && e.params.entry.level === "error"));
check("全程无 JS 异常 / 控制台 error", errs.length === 0, JSON.stringify(errs).slice(0, 400));

/* ---------- 报告 ---------- */
for (const [st, name, detail] of results) {
  console.log(`${st === "PASS" ? "✓" : "✗"} ${name}${detail ? "  [" + detail + "]" : ""}`);
}
const fails = results.filter((r) => r[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} 项 UI 回归通过  ·  实测 ${fps.toFixed(2)}fps  ·  lit=${runtime.lit}px`);
if (fails.length) process.exitCode = 1;
