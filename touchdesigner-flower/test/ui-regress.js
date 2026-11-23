// Flower · ego-browser UI 回归（单 TaskSpace，复用 p1）。输出 [pass]/[fail] 明细与计数。
const NAME = "touchdesigner-flower test bench";
const entry = (await listTaskSpaces()).find((s) => s.name === NAME);
const task = entry ? await taskSpace(entry.id) : await taskSpace(NAME);
const page = task.page("p1");
const BASE = "file:///Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/touchdesigner-flower/index.html";
const results = [];
const check = (cond, msg, extra) => { results.push([cond ? "pass" : "fail", msg, extra === undefined ? "" : extra]); };
const state = () => page.evaluate(() => window.__TF.state());
const setVP = async (w, h) => {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  await page.waitForTimeout(450);
};

try {
  /* ---------- 桌面 1280×800 实时模式 ---------- */
  await setVP(1280, 800);
  await page.goto(BASE);
  await page.waitForFunction(() => window.__TF && window.__TF.ready, undefined, { timeout: 40000 });
  let st = await state();
  check(st.webgl !== false && st.frames >= 1, "加载完成：WebGL2 可用、已出帧", `frames=${st.frames}`);
  check(st.errs.length === 0, "零 JS 报错", JSON.stringify(st.errs));
  check(st.particles > 300000 && st.width > 0 && st.height > 0, "粒子已上传、画布有尺寸", `${st.particles} 粒 ${st.width}x${st.height}`);
  check(st.buildMs < 4000, "构建耗时可接受", `${st.buildMs}ms`);

  const glErr = await page.evaluate(() => window.__TF.renderer.gl.getError());
  check(glErr === 0, "无 GL 错误", `getError=${glErr}`);

  const t0 = (await state()).time;
  await page.waitForTimeout(800);
  st = await state();
  check(st.time > t0 + 0.3, "动画在走：时间推进", `${t0.toFixed(2)}→${st.time.toFixed(2)}`);
  check(st.fps > 0 && st.frameMs > 0, "帧率统计有值", `fps=${st.fps} frameMs=${st.frameMs}`);

  // 画面不是黑的：取快照中心区域的平均亮度
  const lum = await page.evaluate(() => {
    window.__TF.step(1);
    const c = document.getElementById("stage"), c2 = document.createElement("canvas");
    c2.width = 64; c2.height = 64;
    const x = c2.getContext("2d"); x.drawImage(c, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data; let s = 0, mx = 0;
    for (let i = 0; i < d.length; i += 4) { const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += v; mx = Math.max(mx, v); }
    return { mean: s / 4096, max: mx };
  });
  check(lum.mean > 6 && lum.max > 90, "画面非黑：有亮部", `meanY=${lum.mean.toFixed(1)} maxY=${lum.max.toFixed(0)}`);

  /* 空格暂停 / 继续 */
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  st = await state();
  const tp = st.time;
  check(st.paused === true, "空格 → 暂停", `paused=${st.paused}`);
  await page.waitForTimeout(500);
  check(Math.abs((await state()).time - tp) < 1e-6, "暂停期间时间不走");
  check(await page.evaluate(() => document.documentElement.classList.contains("is-paused")), "暂停态样式类生效");
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  st = await state();
  check(st.paused === false && st.time > tp + 0.1, "再按空格 → 继续", `paused=${st.paused}`);

  /* 真实点击右下角按钮 */
  const btns = await page.evaluate(() => ["btn-pause", "btn-reset", "btn-save"].map((id) => { const b = document.getElementById(id); const r = b.getBoundingClientRect(); return { id, w: r.width, h: r.height, label: b.getAttribute("aria-label") }; }));
  check(btns.length === 3 && btns.every((b) => b.w >= 36 && b.h >= 36 && b.label), "三个控制按钮可达且有标签", JSON.stringify(btns.map((b) => b.id + ":" + b.w)));
  await page.click("#btn-pause");
  await page.waitForTimeout(200);
  check((await state()).paused === true, "点击暂停按钮 → 暂停");
  await page.click("#btn-pause");
  await page.waitForTimeout(300);
  check((await state()).paused === false, "再点 → 继续");

  /* 拖动环视 */
  const y0 = (await state()).camera.yaw;
  await page.mouse.move(640, 400);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(640 + i * 16, 400 + i * 3); await page.waitForTimeout(16); }
  check((await state()).camera.dragging === true, "按下拖动时处于拖拽态");
  await page.mouse.up();
  await page.waitForTimeout(250);
  st = await state();
  check(Math.abs(st.camera.yaw - y0) > 0.05 && st.camera.dragging === false, "拖动 → 相机偏转，松手结束", `yaw=${st.camera.yaw}`);

  /* 滚轮缩放 */
  await page.mouse.move(640, 400);
  const z0 = (await state()).camera.zoom;
  await page.mouse.wheel(0, -500, { label: "zoom in the flowers" });
  await page.waitForTimeout(700);
  st = await state();
  check(st.camera.zoom > z0 + 0.05, "滚轮向上 → 放大", `zoom=${z0}→${st.camera.zoom}`);

  /* 回正按钮 */
  await page.click("#btn-reset");
  await page.waitForTimeout(120);
  const tgt = await page.evaluate(() => ({ y: window.__TF.camera.st.tYaw, z: window.__TF.camera.st.tZoom }));
  check(tgt.y === 0 && tgt.z === 1, "回正按钮 → 目标位姿归零", JSON.stringify(tgt));

  /* 指针视差 */
  await page.mouse.move(60, 60);
  await page.waitForTimeout(120);
  const par = await page.evaluate(() => window.__TF.camera.st.tParX);
  check(par < -0.8, "鼠标移到左上角 → 视差目标为负", `tParX=${par}`);

  /* 双击回正 + R 键 + H 隐藏界面 */
  await page.mouse.move(640, 400);
  await page.mouse.down(); await page.mouse.move(760, 420); await page.mouse.up();
  await page.waitForTimeout(150);
  await page.dblclick("#stage", { label: "double click to reset view" });
  await page.waitForTimeout(120);
  check((await page.evaluate(() => window.__TF.camera.st.tYaw)) === 0, "双击 → 回正");
  await page.mouse.down(); await page.mouse.move(520, 400); await page.mouse.up();
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  check((await page.evaluate(() => window.__TF.camera.st.tYaw)) === 0, "R 键 → 回正");
  await page.keyboard.press("h");
  check(await page.evaluate(() => document.documentElement.classList.contains("ui-hidden")), "H 键 → 隐藏界面");
  await page.keyboard.press("h");
  check(!(await page.evaluate(() => document.documentElement.classList.contains("ui-hidden"))), "再按 H → 恢复界面");

  /* 画质档位 */
  await page.evaluate(() => window.__TF.setQuality("low"));
  await page.waitForTimeout(250);
  st = await state();
  check(st.frac === 0.34 && st.drawn < st.particles * 0.36, "切到低画质：只画 34% 粒子", `drawn=${st.drawn}/${st.particles}`);
  const lowKinds = await page.evaluate(() => { const r = window.__TF.renderer; return r.gl.getError(); });
  check(lowKinds === 0, "低画质下无 GL 错误");
  await page.evaluate(() => window.__TF.setQuality("high"));
  await page.waitForTimeout(250);
  st = await state();
  check(st.frac === 1 && st.drawn === st.particles, "切回高画质：全量粒子", `drawn=${st.drawn}`);
  check((await page.evaluate(() => window.__TF.setQuality("ultra"))) === false, "未知画质档被拒绝");

  /* 参数 */
  check((await page.evaluate(() => window.__TF.setParam("exposure", 2) && window.__TF.state().params.exposure)) === 2, "setParam 生效");
  check((await page.evaluate(() => window.__TF.setParam("nope", 1))) === false, "setParam 拒绝未知参数");
  check((await page.evaluate(() => window.__TF.setParam("exposure", NaN))) === false, "setParam 拒绝 NaN");
  await page.evaluate(() => window.__TF.setParam("exposure", 1.04));

  /* 快照导出 */
  const snap = await page.evaluate(() => window.__TF.snapshot());
  check(typeof snap === "string" && snap.startsWith("data:image/png;base64,") && snap.length > 20000, "snapshot() 导出 PNG", `${snap.length} B`);

  /* ---------- 手机竖屏 390×844 ---------- */
  await setVP(390, 844);
  await page.waitForTimeout(600);
  st = await state();
  check(st.cssW === 390 && st.cssH === 844, "手机视口尺寸生效", `${st.cssW}x${st.cssH}`);
  check(st.errs.length === 0, "切到手机视口无报错", JSON.stringify(st.errs));
  check(Math.abs(st.view.scale - 390 / 996) < 1e-4, "手机竖屏按宽度适配（六朵花全在画面内）", `scale=${st.view.scale}`);
  check(st.view.y0 < 0 && st.view.y1 > 1388, "上下补了延伸内容", JSON.stringify(st.view));
  const noScroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight }));
  check(noScroll.sw <= noScroll.iw + 1 && noScroll.sh <= noScroll.ih + 1, "手机无滚动条/无溢出", JSON.stringify(noScroll));
  const mob = await page.screenshot({ path: "/tmp/tdflower-ref/out/reg_mobile.png" });
  check(!!mob, "手机截图");

  /* ---------- 宽屏 1600×900 ---------- */
  await setVP(1600, 900);
  await page.waitForTimeout(700);
  st = await state();
  check(st.cssW === 1600 && st.errs.length === 0, "宽屏无报错", JSON.stringify(st.errs));
  check(st.view.x0 < 0 && st.view.x1 > 996 && Math.abs(st.view.scale - 900 / 1388) < 1e-4, "宽屏按高度适配、左右延伸", JSON.stringify(st.view));
  await page.screenshot({ path: "/tmp/tdflower-ref/out/reg_wide.png" });

  /* ---------- 横屏手机 844×390 ---------- */
  await setVP(844, 390);
  await page.waitForTimeout(600);
  st = await state();
  check(st.errs.length === 0 && st.view.x0 < 0, "矮横屏无报错且左右延伸", JSON.stringify(st.view));

  /* ---------- 静帧确定性：两次加载同 t 同画面 ---------- */
  await setVP(996, 1388);
  const shotAt = async () => {
    await page.goto(BASE + "?ui=0&t=12&still=1");
    await page.waitForFunction(() => window.__TF && window.__TF.ready, undefined, { timeout: 40000 });
    const s = await state();
    return { s, d: await page.evaluate(() => window.__TF.snapshot()) };
  };
  const a = await shotAt(), b = await shotAt();
  check(a.s.time === 12 && a.s.still && a.s.stopped, "静帧模式：时间锁定 t=12 并停住", `t=${a.s.time}`);
  check(a.d === b.d, "同参数两次加载逐字节一致（确定性渲染）", `${a.d.length} vs ${b.d.length}`);
  check(a.d !== snap, "静帧与实时画面不同（非缓存旧帧）");
  const c = await (async () => { await page.goto(BASE + "?ui=0&t=30&still=1&seed=11"); await page.waitForFunction(() => window.__TF && window.__TF.ready, undefined, { timeout: 40000 }); return page.evaluate(() => window.__TF.snapshot()); })();
  check(c !== a.d, "换种子/时间 → 画面不同");

  /* URL 参数 */
  await page.goto(BASE + "?q=low&trail=0.5&ui=0");
  await page.waitForFunction(() => window.__TF && window.__TF.ready, undefined, { timeout: 40000 });
  st = await state();
  check(st.frac === 0.34 && st.params.trail === 0.5, "URL 参数 ?q=low&trail=0.5 生效", `frac=${st.frac} trail=${st.params.trail}`);
  check(await page.evaluate(() => document.documentElement.classList.contains("ui-hidden")), "?ui=0 隐藏界面");

  /* 无障碍 */
  await page.goto(BASE);
  await page.waitForFunction(() => window.__TF && window.__TF.ready, undefined, { timeout: 40000 });
  const a11y = await page.evaluate(() => ({ label: document.getElementById("stage").getAttribute("aria-label") || "", title: document.title, lang: document.documentElement.lang, hint: (document.getElementById("hint") || {}).textContent || "" }));
  check(a11y.label.length > 5 && a11y.title.length > 0 && a11y.lang === "zh-CN", "画布有 aria-label、页面有标题与语言", a11y.title);
  const ext = await page.evaluate(() => ({ scripts: [...document.scripts].filter((s) => s.src).length, links: [...document.querySelectorAll("link")].length, imgs: [...document.images].length }));
  check(ext.scripts === 0 && ext.links === 0 && ext.imgs === 0, "零外部资源（无外链脚本/样式/图片）", JSON.stringify(ext));
} catch (e) {
  check(false, "脚本异常中断", String(e && e.message || e).slice(0, 300));
}

const pass = results.filter((r) => r[0] === "pass").length, fail = results.length - pass;
for (const r of results) console.log(`[${r[0]}] ${r[1]}${r[2] ? "  —  " + r[2] : ""}`);
console.log(`\n== UI 回归：${pass} 项通过，${fail} 项失败，共 ${results.length} 项 ==`);
console.log({ taskSpaceId: task.spaceId, page: page.label });
