// 鹈鹕骑车 3D · ego-browser UI 回归（桌面 1440×900 + 移动端竖屏 / 横屏 + 性能 / 低配）。
// 用法：ego-browser nodejs < pelican-bike-3d/test/ui-regress.js
// 约定：整个任务只用一个 TaskSpace（按名字找回或新建），复用常驻页 p1；按键 / 触摸走真实 CDP 输入事件。
// 后台标签页的 rAF 会被节流，所以时间推进一律用 window.__pm.tick(dt, n)；跑完不关 p1。
const NAME = "pelican-bike-3d 月面鹈鹕回归";
const URL0 = "file:///Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/pelican-bike-3d/index.html";
const KEYS = { w: ["w", "KeyW", 87], a: ["a", "KeyA", 65], s: ["s", "KeyS", 83], d: ["d", "KeyD", 68], f: ["f", "KeyF", 70], b: ["b", "KeyB", 66], c: ["c", "KeyC", 67], e: ["e", "KeyE", 69], m: ["m", "KeyM", 77], h: ["h", "KeyH", 72], t: ["t", "KeyT", 84], k: ["k", "KeyK", 75], r: ["r", "KeyR", 82], " ": [" ", "Space", 32], Escape: ["Escape", "Escape", 27] };

async function open() {
  const entry = (await listTaskSpaces()).find((s) => s.name === NAME);
  const task = !entry ? await taskSpace(NAME)
    : entry.ownership === "user" ? await claimTaskSpace(entry.id)
    : entry.ownership === "agentDelegatedToUser" ? await takeOverTaskSpace(entry.id)
    : await taskSpace(entry.id);
  let page;
  const pages = await task.pages();
  if (pages.length) page = task.page(pages[0].label);
  else {
    const tabs = await task.tabs();
    page = tabs.length ? await task.adopt(tabs[0].page) : await task.newPage();
  }
  return { task, page };
}
const keyRaw = (page, k, code, vk, type) => page.cdp("Input.dispatchKeyEvent", { type: type || "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
const tapRaw = async (page, k, code, vk) => { await keyRaw(page, k, code, vk); await page.waitForTimeout(40); await keyRaw(page, k, code, vk, "keyUp"); await page.waitForTimeout(40); };
const tickRaw = async (page, n) => { for (let i = 0; i < n; i += 250) await page.evaluate((m) => { window.__pm.tick(1 / 60, m); }, Math.min(250, n - i)); };
const evRaw = (page, fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg));
const textRaw = (page, id) => evRaw(page, (id) => { const e = document.getElementById(id); return e ? e.textContent : null; }, id);
const viewportRaw = (page, w, h, mobile, dpr) => page.cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr || 1, mobile: !!mobile });
const bootRaw = async (page, query) => {
  await page.goto(URL0 + (query || ""));
  await page.waitForFunction(() => document.documentElement.getAttribute("data-pm-ready") === "1", undefined, { timeout: 40000 });
  await page.waitForTimeout(1300);
  await evRaw(page, () => { window.__pm.raf(false); window.__pm.tick(1 / 60, 2); });
};
// 一段测试开始：拿到页面，绑好快捷函数
async function section() {
  const { task, page } = await open();
  const K = KEYS;
  const key = (...a) => keyRaw(page, ...a), tap = (...a) => tapRaw(page, ...a), tick = (n) => tickRaw(page, n);
  const ev = (fn, arg) => evRaw(page, fn, arg), text = (id) => textRaw(page, id), boot = (q) => bootRaw(page, q), viewport = (w, h, m, d) => viewportRaw(page, w, h, m, d);
  return { task, page, K, key, tap, tick, ev, text, boot, viewport };
}

const R = [];
const check = (name, ok, detail) => { R.push({ name, ok: !!ok, detail }); };

// ══════════ 一、桌面 1440×900：键盘与鼠标 ══════════
{
  const { page, K, key, tap, tick, ev, text, boot, viewport } = await section();
  const DIG = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"];
  try {
  await viewport(1440, 900, false);
  await boot("?reset=1");

  // T01 启动
  const b0 = await ev(() => ({ errs: window.__pm.errs, gl: window.__pm.glErrors(), bootMs: window.__pm.bootMs, f32: window.__pm.game.world.heightF32, preset: window.__pm.preset, mode: window.__pm.mode, loadingGone: !document.getElementById("loading") || getComputedStyle(document.getElementById("loading")).display === "none" || getComputedStyle(document.getElementById("loading")).opacity === "0" }));
  check("T01 启动：零 JS / 着色器 / GL 错误，加载层已撤", b0.errs.length === 0 && b0.gl === 0 && b0.loadingGone, b0);
  check("T02 启动 < 3 s、32F 高度图、默认 cine / 自动驾驶", b0.bootMs < 3000 && b0.f32 && b0.preset === "cine" && b0.mode === "auto", { bootMs: b0.bootMs, f32: b0.f32 });

  // T03 首屏构图：车在画面中部，地球入画
  const frame0 = await ev(() => {
    const g = window.__pm.game, THREE = window.THREE, b = g.bike, S = window.PM.SIM;
    const p = window.__pm.project(b.x, b.y + 1, b.z), W = window.innerWidth, H = window.innerHeight;
    const e = new THREE.Vector3(S.EARTH_DIR[0], S.EARTH_DIR[1], S.EARTH_DIR[2]).multiplyScalar(420).project(g.camera);
    return { bike: [+((p.x / W) * 100).toFixed(1), +((p.y / H) * 100).toFixed(1)], earth: [+(e.x * 100).toFixed(0), +(e.y * 100).toFixed(0)] };
  });
  check("T03 首屏构图：车在画面中间 40% 内，地球在画面内", Math.abs(frame0.bike[0] - 50) < 20 && Math.abs(frame0.bike[1] - 50) < 30 && Math.abs(frame0.earth[0]) < 95 && Math.abs(frame0.earth[1]) < 95, frame0);
  const hud0 = { mode: await text("mode-name"), speed: await text("speed"), found: await text("found"), sub: await text("time-sub") };
  check("T04 HUD 初始态：自动驾驶 / 速度为数字 / 知识牌 00 / 实时", hud0.mode === "自动驾驶" && /^\d+\.\d$/.test(hud0.speed) && hud0.found === "00" && hud0.sub === "实时", hud0);

  // T05 W 接管 + 起步空转字幕
  await key(...K.w);
  await tick(14);
  const s1 = await ev(() => ({ mode: window.__pm.mode, name: document.getElementById("mode-name").textContent, v: window.__pm.bike().v, cap: document.getElementById("caption").textContent, shown: document.getElementById("caption").classList.contains("show") }));
  check("T05 W 接管：切到手动骑行", s1.mode === "manual" && s1.name === "手动骑行" && s1.v > 0.05, s1);
  check("T06 起步字幕讲后轮空转", s1.shown && s1.cap.indexOf("空转") >= 0, s1.cap);
  await tick(90);
  const s2 = await ev(() => ({ v: window.__pm.bike().v, speed: document.getElementById("speed").textContent, odo: document.getElementById("odo").textContent }));
  check("T07 加速 1.7 s：速度 > 1.5 m/s，HUD 速度/里程同步", s2.v > 1.5 && parseFloat(s2.speed) > 5 && parseFloat(s2.odo) > 0, s2);
  await key(...K.w, "keyUp");

  // T08 松脚滑行：真空无风，只剩滚动阻力，衰减很慢
  await tick(120);
  const s3 = await ev(() => ({ v: window.__pm.bike().v }));
  check("T08 滑行 2 s：减速但远没停（v 仍 > 70%）", s3.v > s2.v * 0.7 && s3.v < s2.v, { before: s2.v, after: s3.v });

  // T09 转向：D = 右倾右转（月面上建立倾角要一秒多）
  await key(...K.w); await tick(60); await key(...K.w, "keyUp");
  const y0 = await ev(() => window.__pm.bike().yaw);
  await key(...K.d); await tick(300);
  const s4 = await ev(() => ({ yaw: window.__pm.bike().yaw, lean: window.__pm.bike().lean, v: window.__pm.bike().v }));
  await key(...K.d, "keyUp");
  check("T09 D 键 5 s：车向右倾、航向顺时针转 > 10°（月面建立倾角慢 2.46 倍）", s4.lean > 0.035 && (y0 - s4.yaw) > 0.17 && s4.v > 1, { dyawDeg: +((y0 - s4.yaw) * 57.3).toFixed(1), leanDeg: +(s4.lean * 57.3).toFixed(1), v: s4.v });

  // T10 刹车：月面刹停距离是地球 6 倍，但最终停得住
  await key(...K.s); await tick(450); await key(...K.s, "keyUp");
  const s5 = await ev(() => ({ v: window.__pm.bike().v, state: window.__pm.bike().state, g: window.__pm.bike().grounded }));
  check("T10 S 刹车 7.5 s：停稳（< 0.05 m/s），没摔倒", Math.abs(s5.v) < 0.05 && s5.state === "ride" && s5.g, s5);

  // T11 起跳：同样的腿力，月面滞空是地球 6 倍
  await key(...K.w); await tick(90); await key(...K.w, "keyUp");
  await tap(...K[" "]);
  let air = null, apex = 0, airTicks = 0, sawAir = false; const samples = [];
  for (let i = 0; i < 300; i++) {
    await tick(5);
    const b = await ev(() => ({ g: window.__pm.bike().grounded, agl: window.__pm.bike().heightAGL, rec: window.__pm.bike().records, state: window.__pm.bike().state, vy: window.__pm.bike().vy }));
    apex = Math.max(apex, b.agl);
    if (samples.length < 4 || i > 48 && samples.length < 10) samples.push((i + 1) * 5 + ":" + (b.g ? "G" : "A") + b.agl.toFixed(2));
    if (!b.g) { sawAir = true; airTicks += 5; }
    if (sawAir && b.g) { air = b; break; }
    if (b.state !== "ride") { air = b; break; }
  }
  const capAir = await text("caption");
  check("T11 空格起跳：离地、滞空 2–2.6 s、落地没摔", sawAir && !!air && air.g && air.state === "ride" && air.rec.air > 1.9 && air.rec.air < 2.7, { sawAir, airTicks, apex: +apex.toFixed(2), record: air && air.rec, state: air && air.state, samples: air ? undefined : samples.join(" ") });
  check("T12 落地字幕给出腾空数据与地球对比", /腾空/.test(capAir) && /地球/.test(capAir), capAir);

  // T13 撒把
  await key(...K.w); await tick(60); await key(...K.w, "keyUp");
  await tap(...K.f); await tick(3);
  const h0 = await ev(() => ({ tog: window.__pm.game.handsToggle, off: window.__pm.bike().handsOff, cap: document.getElementById("caption").textContent, blend: window.__pm.game.handsBlend }));
  await tick(240);
  const h1 = await ev(() => ({ off: window.__pm.bike().handsOff, state: window.__pm.bike().state, max: window.__pm.bike().maxNoHands, falls: window.__pm.bike().falls }));
  check("T13 F 撒把：进入撒把状态并给出字幕", h0.tog && h0.off && /撒把/.test(h0.cap), { tog: h0.tog, off: h0.off, cap: h0.cap });
  check("T14 撒把 4 s：要么还撑着、要么倒下（都会自己爬起来）", h1.state === "ride" || h1.state === "down" || h1.state === "getup", h1);
  for (let i = 0; i < 24; i++) { const st = await ev(() => window.__pm.bike().state); if (st === "ride") break; await tick(60); }
  if (await ev(() => window.__pm.game.handsToggle)) await tap(...K.f);

  // T15 车铃
  await tap(...K.b);
  const capBell = await text("caption");
  check("T15 B 车铃：字幕说明真空里 0 dB", /车铃/.test(capBell) && /0 dB/.test(capBell), capBell);

  // T16 镜头
  const presets = await ev(() => window.PM.CAM_PRESETS);
  let camOk = true; const camLog = [];
  for (let i = 0; i < 6; i++) { await tap(String(i + 1), DIG[i], 49 + i); await tick(4); const p = await ev(() => window.__pm.preset); camLog.push(p); if (p !== presets[i]) camOk = false; }
  await tap(...K.c); await tick(4);
  const pc = await ev(() => window.__pm.preset); camLog.push("c→" + pc); if (pc !== presets[0]) camOk = false;
  await tap(...K.e); await tick(4);
  const pe = await ev(() => window.__pm.preset); camLog.push("e→" + pe); if (pe !== "earth") camOk = false;
  const camBtn = await ev(() => { document.getElementById("cam-btn").click(); return window.__pm.preset; }); camLog.push("btn→" + camBtn); if (camBtn !== presets[0]) camOk = false;
  check("T16 数字键 1–6 / C 循环 / E 地球 / 镜头按钮：预设切换正确", camOk, camLog.join(","));

  // T17 时间流速
  const tSeq = [];
  for (let i = 0; i < 3; i++) { await tap(...K.t); tSeq.push(await ev(() => window.__pm.timeIdx + ":" + document.getElementById("time-sub").textContent)); }
  check("T17 T 循环三种时间流速并同步到 HUD", tSeq[0].startsWith("1:") && tSeq[1].startsWith("2:") && tSeq[2].startsWith("0:"), tSeq);

  // T18 慢动作
  await tap(...K.k); const k1 = await ev(() => window.__pm.game.slow); await tap(...K.k); const k2 = await ev(() => window.__pm.game.slow);
  check("T18 K 慢动作开 / 关", k1 === true && k2 === false, { k1, k2 });

  // T19 静音
  await tap(...K.m);
  const m1 = await ev(() => ({ muted: window.PM.AUDIO.isMuted(), cls: document.getElementById("mute-btn").className }));
  await tap(...K.m);
  const m2 = await ev(() => ({ muted: window.PM.AUDIO.isMuted(), cls: document.getElementById("mute-btn").className }));
  check("T19 M 静音开 / 关并同步按钮状态", m1.muted && /muted/.test(m1.cls) && !m2.muted, { m1, m2 });

  // T20 物理面板
  await tap(...K.h);
  const p1 = await ev(() => ({ vis: window.PM.UI.panelVisible(), hidden: document.getElementById("panel").hidden, n: document.querySelectorAll("#panel-list li").length, head: document.querySelector("#panel .panel-head h2").textContent }));
  await tap(...K.Escape); await page.waitForTimeout(120);
  const p2 = await ev(() => window.PM.UI.panelVisible());
  check("T20 H 打开物理面板（18 条规则）、Esc 关闭", p1.vis && !p1.hidden && p1.n >= 12 && !p2, { n: p1.n, head: p1.head });

  // T21 发现知识牌 → 卡片 → Esc 收起 → 刷新后存档还在
  // 传送点别丢在陡壁上（45° 的壁全踩也蹬不上去，会往后溜）：从牌子出发的四个方向里挑一条最平的接近路线
  await ev(() => {
    const pm = window.__pm, T = window.PM.TERRAIN, g = pm.game, p = pm.plaques().find((q) => !q.found), tg = { gx: 0, gz: 0 };
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let m = 0; for (let s = 0; s <= 22; s += 2) { T.grad(g.field, T.dWrap(p.x - dx * s), T.dWrap(p.z - dz * s), tg); m = Math.max(m, Math.abs(tg.gx * dx + tg.gz * dz)); }
      if (!best || m < best.m) best = { dx, dz, m };
    }
    pm.teleport(T.dWrap(p.x - best.dx * 22), T.dWrap(p.z - best.dz * 22), Math.atan2(-best.dz, best.dx)); pm.auto(true);
  });
  const found0 = await ev(() => window.__pm.bike().found);
  let found = found0; const traj = [];
  for (let i = 0; i < 50 && found === found0; i++) {
    await tick(30);
    const st = await ev(() => { const g = window.__pm.game, b = g.bike, goal = g.autopilot.goal; return { found: b.foundCount, v: +b.v.toFixed(2), state: b.state, goal: goal ? goal.id : null, d: goal ? +b.gap(goal.x, goal.z, b.x, b.z).toFixed(1) : null, thr: +g.autopilot.input.throttle.toFixed(2), mode: g.mode, cost: +g.autopilot.planCost.toFixed(1) }; });
    found = st.found; if (i % 10 === 0) traj.push(((i + 1) / 2) + "s " + JSON.stringify(st));
  }
  const card = await ev(() => ({ hidden: document.getElementById("card").hidden, kicker: document.getElementById("card-kicker").textContent, title: document.getElementById("card-title").textContent, found: document.getElementById("found").textContent, n: window.__pm.plaques().filter((p) => p.found).length }));
  check("T21 骑到未发现的知识牌旁：自动发现、弹出知识卡片、HUD 计数与已发现数一致", found > found0 && !card.hidden && card.title.length > 0 && +card.found === card.n && card.n === found, { found0, foundBike: found, card, traj: traj.join(" | ") });
  await tap(...K.Escape); await page.waitForTimeout(600);
  const cardHidden = await ev(() => document.getElementById("card").hidden);
  check("T22 Esc 收起知识卡片", cardHidden, { cardHidden });
  // reset（回营地）不清零进度
  await tap(...K.r); await tick(10);
  const afterReset = await ev(() => ({ n: window.__pm.bike().found, hud: document.getElementById("found").textContent }));
  check("T23 R 回营地后已发现计数保持", +afterReset.hud === card.n && afterReset.n === card.n, afterReset);
  await ev(() => { window.__pm.game.persist(); });
  await page.waitForTimeout(200);
  await boot("");
  const saved = await ev(() => ({ found: window.__pm.plaques().filter((p) => p.found).length, hud: document.getElementById("found").textContent }));
  check("T24 刷新页面：已发现的知识牌从存档恢复", saved.found === card.n && +saved.hud === card.n, saved);

  // T25 跨过瓦片坐标边界：手动直行，世界整体平移一个周期，相机和车辙跟着走
  await boot("?reset=1");
  // x = ±512 那一圈是沿瓦片接缝的山脊（最缓处坡度 0.54），所以走 z 方向：从 (152, 500) 朝 +z 直行，那一段最大坡度 0.017
  await ev(() => { window.__pm.teleport(152, 500, -Math.PI / 2); });
  await key(...K.w);
  let wrapped = false;
  for (let i = 0; i < 100 && !wrapped; i++) { await tick(15); wrapped = await ev(() => window.__pm.bike().z < -400); }
  await key(...K.w, "keyUp");
  const wr = await ev(() => { const g = window.__pm.game; return { x: +g.bike.x.toFixed(1), z: +g.bike.z.toFixed(1), dz: +(g.cam.tz - g.bike.z).toFixed(2), tracks: g.world.ribbons.r.n + g.world.ribbons.f.n, errs: window.__pm.errs.length, state: g.bike.state }; });
  check("T25 平地手动直行骑过 z=+512 m 边界：坐标折回、相机不飞走、车辙连续", wrapped && Math.abs(wr.z) <= 512.5 && Math.abs(wr.x) < 200 && Math.abs(wr.dz) < 3 && wr.errs === 0 && wr.tracks > 0, wr);

  // T26 R 回到营地
  await tap(...K.r); await tick(30);
  const rs = await ev(() => { const g = window.__pm.game; return { mode: window.__pm.mode, d: Math.hypot(g.bike.x, g.bike.z), dx: g.cam.tx - g.bike.x }; });
  check("T26 R 回营地并交还自动驾驶", rs.mode === "auto" && rs.d < 6 && Math.abs(rs.dx) < 2, rs);

  // T27 手动后 8 s 不动 → 交还自动驾驶
  await key(...K.w); await tick(20); await key(...K.w, "keyUp");
  const idle0 = await ev(() => ({ mode: window.__pm.mode, left: document.getElementById("mode-sub").textContent }));
  await tick(540);
  const idle1 = await ev(() => ({ mode: window.__pm.mode, name: document.getElementById("mode-name").textContent }));
  check("T27 手动后 8 s 不操作 → 交还自动驾驶", idle0.mode === "manual" && /交还/.test(idle0.left) && idle1.mode === "auto" && idle1.name === "自动驾驶", { idle0, idle1 });

  // T28 指针：拖动环绕、滚轮缩放
  const c0 = await ev(() => ({ az: window.__pm.game.cam.azOff, dist: window.__pm.game.cam.distMul }));
  await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 450, button: "left", clickCount: 1 });
  for (let i = 1; i <= 6; i++) await page.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700 + i * 30, y: 450 + i * 8, button: "left" });
  await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: 880, y: 498, button: "left", clickCount: 1 });
  await page.cdp("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 450, deltaX: 0, deltaY: 240 });
  await tick(3);
  const c1 = await ev(() => ({ az: window.__pm.game.cam.azOff, dist: window.__pm.game.cam.distMul }));
  check("T28 拖动改变环绕角、滚轮改变距离", Math.abs(c1.az - c0.az) > 0.3 && Math.abs(c1.dist - c0.dist) > 0.1, { c0, c1 });

  // T29 性能：手动推进 120 帧的墙钟时间（含一次 readPixels 强制 GPU 同步）
  const perf = await ev(() => { const g = window.__pm.game, gl = g.renderer.getContext(), t0 = performance.now(); for (let i = 0; i < 120; i++) window.__pm.tick(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return { ms: +((performance.now() - t0) / 120).toFixed(2), pr: g.renderer.getPixelRatio(), tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls }; });
  check("T29 每帧耗时 < 12 ms（像素比 " + perf.pr + "，" + perf.tris + " 三角面 / " + perf.calls + " draw call）", perf.ms < 12, perf);

  // T30 全程零错误
  const fin = await ev(() => ({ errs: window.__pm.errs, gl: window.__pm.glErrors() }));
  check("T30 回归全程零 JS / 着色器 / GL 错误", fin.errs.length === 0 && fin.gl === 0, fin);
  } catch (e) {
    check("FATAL 桌面段脚本异常", false, String(e && e.stack || e).slice(0, 700));
  }
}

// ══════════ 二、移动端：竖屏 390×844 / 横屏 844×390，真实触摸事件 ══════════
{
  const { page, tick, ev, text, boot, viewport } = await section();

const device = async (w, h) => {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: h > w ? "portraitPrimary" : "landscapePrimary", angle: h > w ? 0 : 90 } });
  await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
};
// 真实触摸：在元素中心按下 / 抬起
const center = (k) => ev((k) => { const b = document.querySelector('#touch button[data-k="' + k + '"]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, k);
const touchStart = async (pts) => { await page.cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) }); await page.waitForTimeout(60); };
const touchMove = async (pts) => { await page.cdp("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) }); await page.waitForTimeout(30); };
const touchEnd = async () => { await page.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await page.waitForTimeout(60); };
const tapBtn = async (k) => { const c = await center(k); await touchStart([c]); await touchEnd(); };
  try {
  // ───── 竖屏 390×844 ─────
  await device(390, 844);
  await boot("?reset=1");
  const lay = await ev(() => {
    const W = window.innerWidth, H = window.innerHeight, r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
    const coarse = matchMedia("(pointer: coarse)").matches;
    const touchDisp = getComputedStyle(document.getElementById("touch")).display;
    const btns = Array.from(document.querySelectorAll("#touch button")).map((b) => { const q = b.getBoundingClientRect(); return { k: b.dataset.k, r: [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)], inside: q.left >= 0 && q.top >= 0 && q.right <= W && q.bottom <= H, big: Math.min(q.width, q.height) }; });
    const els = { brand: r(".brand"), tele: r("#tele"), nav: r("#nav"), time: r("#time"), live: r("#live"), dock: r(".dock"), touch: r("#touch") };
    const inter = (a, b) => a && b && Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
    const overlaps = []; for (const a of Object.keys(els)) for (const b of Object.keys(els)) if (a < b && b !== "touch" && inter(els[a], els[b])) overlaps.push(a + "×" + b);
    for (const bt of btns) { if (inter(els.dock, bt.r)) overlaps.push("dock×" + bt.k); if (inter(els.time, bt.r)) overlaps.push("time×" + bt.k); if (els.nav && inter(els.nav, bt.r)) overlaps.push("nav×" + bt.k); }
    const inside = Object.keys(els).every((k) => !els[k] || (els[k][0] >= 0 && els[k][1] >= 0 && els[k][2] <= W && els[k][3] <= H));
    return { W, H, coarse, touchDisp, btns, els: JSON.stringify(els), overlaps: overlaps.join(","), inside, overflowX: document.documentElement.scrollWidth > W, scrollH: document.documentElement.scrollHeight, minBtn: Math.min(...btns.map((b) => b.big)), errs: window.__pm.errs, gl: window.__pm.glErrors(), portrait: window.__pm.game.portrait(), pr: window.__pm.game.renderer.getPixelRatio() };
  });
  check("M01 竖屏：识别为粗指针，触屏按钮显示 7 个、全部在视口内且 ≥ 44pt", lay.coarse && lay.touchDisp === "flex" && lay.btns.length === 7 && lay.btns.every((b) => b.inside) && lay.minBtn >= 44, { coarse: lay.coarse, disp: lay.touchDisp, n: lay.btns.length, minBtn: lay.minBtn, btns: lay.btns.map((b) => b.k + ":" + b.r.join(",")).join(" ") });
  check("M02 竖屏布局：HUD 各块都在视口内、互不重叠、无横向溢出", lay.inside && !lay.overlaps && !lay.overflowX, { els: lay.els, overlaps: lay.overlaps, overflowX: lay.overflowX, scrollH: lay.scrollH, H: lay.H });
  const fr = await ev(() => {
    const g = window.__pm.game, THREE = window.THREE, b = g.bike, S = window.PM.SIM, W = window.innerWidth, H = window.innerHeight;
    const p = window.__pm.project(b.x, b.y + 1, b.z), e = new THREE.Vector3(S.EARTH_DIR[0], S.EARTH_DIR[1], S.EARTH_DIR[2]).multiplyScalar(420).project(g.camera);
    return { bike: [+((p.x / W) * 100).toFixed(1), +((p.y / H) * 100).toFixed(1)], earth: [+(e.x * 100).toFixed(0), +(e.y * 100).toFixed(0)], fov: g.camera.fov };
  });
  check("M03 竖屏首屏：车在画面中间，地球在画面内（镜头转向地球方位）", Math.abs(fr.bike[0] - 50) < 25 && fr.bike[1] > 30 && fr.bike[1] < 85 && Math.abs(fr.earth[0]) < 92 && Math.abs(fr.earth[1]) < 92, fr);

  // 蹬：真实触摸按下 → 前进；抬起 → 停止加速
  const pc = await center("pedal");
  await touchStart([pc]);
  const onCls = await ev(() => document.querySelector('#touch button[data-k="pedal"]').className);
  await tick(100);
  const m1 = await ev(() => ({ mode: window.__pm.mode, v: window.__pm.bike().v, name: document.getElementById("mode-name").textContent }));
  await touchEnd();
  const offCls = await ev(() => document.querySelector('#touch button[data-k="pedal"]').className);
  check("M04 触摸「蹬」：按下即接管前进、按钮高亮；抬起取消高亮", m1.mode === "manual" && m1.v > 1 && /on/.test(onCls) && !/on/.test(offCls), { m1, onCls, offCls });

  // 刹：按住 → 停
  const bc = await center("brake");
  await touchStart([bc]); await tick(420); await touchEnd();
  const m2 = await ev(() => window.__pm.bike().v);
  check("M05 触摸「刹」按住：停稳", Math.abs(m2) < 0.05, { v: m2 });

  // 跳
  await touchStart([pc]); await tick(80); await touchEnd();
  await tapBtn("hop");
  let apex = 0, sawAir = false;
  for (let i = 0; i < 80; i++) { await tick(5); const b = await ev(() => ({ g: window.__pm.bike().grounded, a: window.__pm.bike().heightAGL })); apex = Math.max(apex, b.a); if (!b.g) sawAir = true; if (sawAir && b.g) break; }
  check("M06 触摸「跳」：起跳，最高点 ≈ 1.1 m（月面）", sawAir && apex > 0.9 && apex < 1.3, { sawAir, apex: +apex.toFixed(2) });

  // 撒把
  await tapBtn("hands");
  const h1 = await ev(() => ({ tog: window.__pm.game.handsToggle, lit: document.querySelector('#touch button[data-k="hands"]').className, cap: document.getElementById("caption").textContent }));
  await tapBtn("hands");
  const h2 = await ev(() => ({ tog: window.__pm.game.handsToggle, lit: document.querySelector('#touch button[data-k="hands"]').className }));
  check("M07 触摸「撒把」：开 / 关，按钮状态同步，出字幕", h1.tog && /lit/.test(h1.lit) && /撒把/.test(h1.cap) && !h2.tog && !/lit/.test(h2.lit), { h1, h2 });

  // 车铃
  await tapBtn("bell");
  const capBell = await text("caption");
  check("M08 触摸「铃」：字幕说明真空里 0 dB", /车铃/.test(capBell), capBell);

  // 右转：按住 → 倾角 / 航向变化
  await touchStart([pc]); await tick(70);
  const rc = await center("right");
  const y0 = await ev(() => window.__pm.bike().yaw);
  await touchStart([pc, rc]); await tick(300); await touchEnd();
  const st = await ev(() => ({ yaw: window.__pm.bike().yaw, lean: window.__pm.bike().lean, v: window.__pm.bike().v, state: window.__pm.bike().state }));
  check("M09 触摸「蹬 + →」双指同按：右倾右转", st.state === "ride" && st.lean > 0.03 && (y0 - st.yaw) > 0.17, { dyawDeg: +((y0 - st.yaw) * 57.3).toFixed(1), leanDeg: +(st.lean * 57.3).toFixed(1), v: +st.v.toFixed(2) });
  await tick(300);   // 让它稳下来

  // 画布上的拖动环绕 + 双指捏合
  const c0 = await ev(() => ({ az: window.__pm.game.cam.azOff, dist: window.__pm.game.cam.distMul }));
  await touchStart([{ x: 195, y: 330 }]); for (let i = 1; i <= 6; i++) await touchMove([{ x: 195 + i * 12, y: 330 }]); await touchEnd(); await tick(2);
  const c1 = await ev(() => ({ az: window.__pm.game.cam.azOff, dist: window.__pm.game.cam.distMul }));
  await touchStart([{ x: 150, y: 330 }, { x: 240, y: 330 }]); for (let i = 1; i <= 5; i++) await touchMove([{ x: 150 + i * 8, y: 330 }, { x: 240 - i * 8, y: 330 }]); await touchEnd(); await tick(2);
  const c2 = await ev(() => ({ az: window.__pm.game.cam.azOff, dist: window.__pm.game.cam.distMul }));
  check("M10 触屏：单指拖动环绕、双指捏合缩放", Math.abs(c1.az - c0.az) > 0.2 && Math.abs(c2.dist - c1.dist) > 0.08, { c0, c1, c2 });

  // HUD 按钮：静音 / 镜头 / 时间
  const t1 = await ev(() => { const r = document.getElementById("time").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  const time0 = await ev(() => window.__pm.timeIdx); await touchStart([t1]); await touchEnd(); const time1 = await ev(() => window.__pm.timeIdx);
  const mu = await ev(() => { const r = document.getElementById("mute-btn").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  await touchStart([mu]); await touchEnd(); const muted = await ev(() => window.PM.AUDIO.isMuted()); await touchStart([mu]); await touchEnd();
  const cb = await ev(() => { const r = document.getElementById("cam-btn").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  const p0 = await ev(() => window.__pm.preset); await touchStart([cb]); await touchEnd(); const p1 = await ev(() => window.__pm.preset);
  check("M11 触屏 HUD 按钮：时间 / 静音 / 镜头可点", time1 === (time0 + 1) % 3 && muted === true && p1 !== p0 && typeof p1 === "string", { time0, time1, muted, p0, p1 });
  await ev(() => { window.__pm.setTime(0); window.__pm.setPreset("cine"); });

  // 面板：触屏打开 / 关闭按钮
  const hb = await ev(() => { const r = document.getElementById("help-btn").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  await touchStart([hb]); await touchEnd(); await page.waitForTimeout(800);   // 面板有滑入动画，等它停稳
  const pv = await ev(() => ({ vis: window.PM.UI.panelVisible(), n: document.querySelectorAll("#panel-list li").length, close: (() => { const r = document.getElementById("panel-close").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })() }));
  await touchStart([pv.close]); await touchEnd(); await page.waitForTimeout(300);
  const pv2 = await ev(() => { const c = document.getElementById("panel-close"), r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y); return { vis: window.PM.UI.panelVisible(), close: [Math.round(x), Math.round(y), Math.round(r.width)], hit: e ? (e.id || e.className || e.tagName) : null, isClose: !!(e && (e === c || c.contains(e))), hidden: document.getElementById("panel").hidden, scrollTop: document.getElementById("panel").scrollTop }; });
  check("M12 触屏：帮助按钮打开物理面板、关闭按钮收起", pv.vis && pv.n >= 12 && !pv2.vis, { n: pv.n, vis: pv.vis, after: pv2 });

  // 性能（像素比 2）
  const perf = await ev(() => { const g = window.__pm.game, gl = g.renderer.getContext(), t0 = performance.now(); for (let i = 0; i < 90; i++) window.__pm.tick(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return { ms: +((performance.now() - t0) / 90).toFixed(2), pr: g.renderer.getPixelRatio(), tris: g.renderer.info.render.triangles }; });
  check("M13 竖屏每帧耗时 < 14 ms（像素比 " + perf.pr + "，" + perf.tris + " 三角面）", perf.ms < 14, perf);

  // ───── 横屏 844×390 ─────
  await device(844, 390);
  await page.waitForTimeout(300);
  await ev(() => { Object.assign(window.__pm.game.cam, { azOff: 0, elOff: 0, distMul: 1 }); window.__pm.tick(1 / 60, 150); });
  const land = await ev(() => {
    const W = window.innerWidth, H = window.innerHeight, r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
    const els = { brand: r(".brand"), tele: r("#tele"), nav: r("#nav"), time: r("#time"), dock: r(".dock"), touch: r("#touch") };
    const inter = (a, b) => a && b && Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
    const overlaps = []; for (const a of Object.keys(els)) for (const b of Object.keys(els)) if (a < b && b !== "touch" && inter(els[a], els[b])) overlaps.push(a + "×" + b);
    for (const bt of Array.from(document.querySelectorAll("#touch button"))) { const q = bt.getBoundingClientRect(), r = [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; if (inter(els.dock, r)) overlaps.push("dock×" + bt.dataset.k); }
    const inside = Object.keys(els).every((k) => !els[k] || (els[k][0] >= 0 && els[k][1] >= 0 && els[k][2] <= W && els[k][3] <= H));
    const g = window.__pm.game, THREE = window.THREE, b = g.bike, S = window.PM.SIM, p = window.__pm.project(b.x, b.y + 1, b.z), e = new THREE.Vector3(S.EARTH_DIR[0], S.EARTH_DIR[1], S.EARTH_DIR[2]).multiplyScalar(420).project(g.camera);
    return { W, H, cam: { az: +g.cam.az.toFixed(3), azOff: +g.cam.azOff.toFixed(3), el: +g.cam.el.toFixed(3), elOff: +g.cam.elOff.toFixed(3), lock: !!g.camLock, dir: g.camera.getWorldDirection(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3)), bike: [+b.x.toFixed(0), +b.z.toFixed(0)] }, els: JSON.stringify(els), overlaps: overlaps.join(","), inside, overflowX: document.documentElement.scrollWidth > W, touchDisp: getComputedStyle(document.getElementById("touch")).display, bike: [+((p.x / W) * 100).toFixed(1), +((p.y / H) * 100).toFixed(1)], earth: [+(e.x * 100).toFixed(0), +(e.y * 100).toFixed(0)] };
  });
  check("M14 横屏布局：触屏按钮在、HUD 在视口内不重叠、无横向溢出", land.touchDisp === "flex" && land.inside && !land.overlaps && !land.overflowX, { els: land.els, overlaps: land.overlaps });
  check("M15 横屏首屏：车在画面内，地球在画面内", Math.abs(land.bike[0] - 50) < 30 && land.bike[1] > 20 && land.bike[1] < 85 && Math.abs(land.earth[0]) < 95 && Math.abs(land.earth[1]) < 95, land);
  await tapBtn("hop"); await tick(6);
  const hopL = await ev(() => ({ g: window.__pm.bike().grounded, vy: window.__pm.bike().vy }));
  check("M16 横屏触屏「跳」仍可触发", !hopL.g && hopL.vy > 0.5, hopL);

  const fin = await ev(() => ({ errs: window.__pm.errs, gl: window.__pm.glErrors() }));
  check("M17 移动端回归全程零 JS / 着色器 / GL 错误", fin.errs.length === 0 && fin.gl === 0, fin);
  } catch (e) {
    check("FATAL 移动端段脚本异常", false, String(e && e.stack || e).slice(0, 700));
  }
}

// ══════════ 三、性能 / 低配 / 浸泡 ══════════
{
  const { page, tick, ev, boot, viewport } = await section();
  try {
    // 像素比 2（视网膜）下 1440×900 的每帧耗时（120 帧墙钟时间，含一次 readPixels 强制 GPU 同步）
    await viewport(1440, 900, false, 2);
    await boot("?reset=1");
    const frame = () => ev(() => { const g = window.__pm.game, gl = g.renderer.getContext(), t0 = performance.now(); for (let i = 0; i < 90; i++) window.__pm.tick(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return { ms: +((performance.now() - t0) / 90).toFixed(2), pr: g.renderer.getPixelRatio(), tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls, verts: g.world.terrain.geometry.attributes.position.count, low: g.world.low }; });
    const hi = await frame();
    check("P01 视网膜像素比 2 · 1440×900：每帧 < 20 ms", hi.pr === 2 && hi.ms < 20, hi);
    // 低配模式：每环 16 格、像素比 1，三角形数明显更少
    await boot("?reset=1&q=low");
    const lo = await frame();
    const loInfo = await ev(() => ({ errs: window.__pm.errs, gl: window.__pm.glErrors(), low: window.__pm.game.world.low }));
    check("P02 ?q=low：地形顶点数减半以上、像素比 1、零错误", lo.low === true && lo.verts < hi.verts * 0.6 && lo.pr === 1 && loInfo.errs.length === 0 && loInfo.gl === 0, { hiVerts: hi.verts, lo });
    // 60 s 自动驾驶浸泡：发现知识牌、摔倒不超过 2 次、相机始终跟着车、零错误
    await boot("?reset=1");
    let soak = null;
    for (let i = 0; i < 12; i++) { await tick(300); soak = await ev(() => { const g = window.__pm.game, b = g.bike; return { odo: +b.dist.toFixed(0), found: b.foundCount, falls: b.falls, state: b.state, camGap: Math.max(Math.abs(g.cam.tx - b.x), Math.abs(g.cam.tz - b.z)), x: b.x, z: b.z, tracks: g.world.ribbons.r.n + g.world.ribbons.f.n, dust: b.dust.n }; }); }
    check("P03 自动驾驶 60 s：里程 > 150 m、发现知识牌、摔倒 ≤ 2、相机贴着车", soak.odo > 150 && soak.found >= 1 && soak.falls <= 2 && soak.camGap < 4 && soak.state === "ride", soak);
    const fin = await ev(() => ({ errs: window.__pm.errs, gl: window.__pm.glErrors() }));
    check("P04 性能段全程零 JS / 着色器 / GL 错误，坐标始终在规范范围内", fin.errs.length === 0 && fin.gl === 0 && Math.abs(soak.x) <= 512.5 && Math.abs(soak.z) <= 512.5, Object.assign({ x: soak.x, z: soak.z }, fin));
  } catch (e) {
    check("FATAL 性能段脚本异常", false, String(e && e.stack || e).slice(0, 700));
  }
}

const pass = R.filter((r) => r.ok).length;
console.log(R.map((r) => (r.ok ? "[pass] " : "[FAIL] ") + r.name + (r.ok ? "" : "  ← " + JSON.stringify(r.detail).slice(0, 900))).join("\n"));
console.log(`\n[summary] UI 回归 ${pass} / ${R.length} ${pass === R.length ? "全绿" : "有失败"}`);
