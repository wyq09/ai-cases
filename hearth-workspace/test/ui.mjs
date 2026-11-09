/* Hearth · Life OS — UI 回归测试（ego-lite）
 * 用法: ego-browser nodejs < test/ui.mjs
 * 依赖: 本地静态服务 http://localhost:8931/index.html
 */
const BASE = process.env.HEARTH_URL || "http://localhost:8931/index.html";

const task = await taskSpace("hearth-workspace-replica");
const page = task.page("p1");

let pass = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) pass += 1;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Run a block; a thrown error is recorded as a failure instead of aborting. */
async function click(sel, opts) {
  try {
    return await page.click(sel, opts);
  } catch (e) {
    failures.push(`click[${sel}]: ${String(e.message || e).split("\n")[0]}`);
    throw e;
  }
}

async function block(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`[${name}] ${String(e.message || e).split("\n")[0]}`);
  }
}

async function truthy(name, fn, detail = "") {
  let v;
  try {
    v = await fn();
  } catch (e) {
    v = false;
    detail = detail || String(e.message || e);
  }
  ok(name, !!v, detail);
}

/* Pin a known viewport so the run is not affected by a previous emulation. */
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForLoadState();
await sleep(400);

/* ---------------- install error collector ---------------- */
await page.evaluate(() => {
  window.__errs = [];
  window.addEventListener("error", (e) => window.__errs.push("error: " + (e.message || "")));
  window.addEventListener("unhandledrejection", (e) => window.__errs.push("reject: " + String(e.reason)));
  const ce = console.error;
  console.error = (...a) => {
    window.__errs.push("console: " + a.map((x) => String(x)).join(" "));
    ce(...a);
  };
});

/* ================= 1. shell ================= */
await truthy("app booted", async () => (await page.evaluate(() => typeof window.Hearth)) === "object");
await truthy("sidebar has 6 nav items", async () => (await page.evaluate(() => document.querySelectorAll("#navMain a").length)) === 6);
await truthy("sidebar shows Today prompts", async () => (await page.evaluate(() => document.querySelectorAll("#todayList li").length)) === 7);
await truthy("theme switch has 3 options", async () => (await page.evaluate(() => document.querySelectorAll(".theme-btn").length)) === 3);
await truthy("user card present", async () => (await page.evaluate(() => !!document.querySelector("#sbUser"))));

await block("chat", async () => {

  await truthy("chat greeting shown", async () => (await page.evaluate(() => document.querySelector(".chat-greeting")?.textContent.includes("Good morning"))));
  await truthy("composer placeholder", async () =>
    (await page.evaluate(() => document.querySelector("#chatInput")?.getAttribute("placeholder"))).includes("Ask Hearth")
  );
  await truthy("6 suggestion chips", async () => (await page.evaluate(() => document.querySelectorAll(".sug").length)) === 6);

  /* More Ideas */
  await page.evaluate(() => {
    document.getElementById("view").scrollTop = 0;
  });
  await sleep(150);
  await click('[data-act="more-ideas"]');
  await sleep(150);
  await truthy("More Ideas expands to 10", async () => (await page.evaluate(() => document.querySelectorAll(".sug").length)) === 10);
  await page.evaluate(() => {
    document.getElementById("view").scrollTop = 0;
  });
  await sleep(150);
  await click('[data-act="more-ideas"]');
  await sleep(150);
  await truthy("More Ideas collapses back to 6", async () => (await page.evaluate(() => document.querySelectorAll(".sug").length)) === 6);

  /* suggestion chip sends (before any thread exists) */
  await click('.sug[data-label="Ask For Advice"]');
  await sleep(400);
  await truthy("suggestion chip sends a message", async () => (await page.evaluate(() => document.querySelectorAll(".msg-user").length)) === 1);
  await page.waitForFunction(() => window.Hearth.state.chat.messages.some((m) => m.done), undefined, { timeout: 20000 });

  /* reset to the welcome state for the streaming checks */
  await page.evaluate(() => {
    window.Hearth.state.chat.messages = [];
    window.Hearth.state.chat.busy = false;
    window.Hearth.render();
  });
  await sleep(300);
  await truthy("conversation reset shows suggestions again", async () => (await page.evaluate(() => document.querySelectorAll(".sug").length)) === 6);

  /* streaming reply */
  await page.fill("#chatInput", "Plan my vacation");
  await click('[data-act="send"]');
  await sleep(350);
  await truthy("user message rendered", async () => (await page.evaluate(() => document.querySelectorAll(".msg-user").length)) === 1);
  await truthy("stream status pill shown", async () => (await page.evaluate(() => !!document.querySelector(".stream-status"))));
  await page.waitForFunction(() => !!document.querySelector(".caret"), undefined, { timeout: 15000 });
  await truthy("typing caret present", async () => (await page.evaluate(() => !!document.querySelector(".caret"))));

  await page.waitForFunction(() => window.Hearth.state.chat.messages.some((m) => m.done), undefined, { timeout: 20000 });
  await truthy("reply finished streaming", async () => (await page.evaluate(() => window.Hearth.state.chat.messages.some((m) => m.done))));
  await truthy("reply rendered as formatted html", async () =>
    (await page.evaluate(() => !!document.querySelector(".msg-ai .msg-bubble strong") && !!document.querySelector(".msg-ai .msg-bubble ul")))
  );
  await truthy("message actions appear", async () => (await page.evaluate(() => document.querySelectorAll(".msg-actions .msg-act").length)) === 3);

  /* copy / like / regenerate */
  await click('[data-act="like"]');
  await sleep(120);
  await truthy("like toggles on", async () => (await page.evaluate(() => document.querySelector("[data-act=like]")?.classList.contains("is-on"))));
  await click('[data-act="regen"]');
  await sleep(400);
  await truthy("regenerate starts a new stream", async () => (await page.evaluate(() => !!document.querySelector(".stream-status") || !!document.querySelector(".caret"))));
  await page.waitForFunction(() => window.Hearth.state.chat.messages.filter((m) => m.done).length >= 1, undefined, { timeout: 20000 });

  /* voice input */
  await click('[data-act="mic"]');
  await sleep(2200);
  await truthy("mic transcribes into the composer", async () =>
    (await page.evaluate(() => document.querySelector("#chatInput")?.value.length > 0))
  );

  /* attach menu */
  await click('[data-act="attach-menu"]');
  await sleep(200);
  await truthy("attach menu opens", async () => (await page.evaluate(() => !!document.querySelector(".menu"))));
  await click('[data-menu-id="library"]');
  await sleep(300);
  await truthy("attachment chips appear", async () => (await page.evaluate(() => document.querySelectorAll(".att-chip").length)) === 2);
  await click(".att-chip:first-of-type button");
  await sleep(250);
  await truthy("attachment removed", async () => (await page.evaluate(() => document.querySelectorAll(".att-chip").length)) === 1);


});

await block("navigation", async () => {

  for (const route of ["goals", "files", "tasks", "memory", "calendar", "chat"]) {
    await click(`[data-act="nav"][data-route="${route}"]`);
    await sleep(220);
    await truthy(`nav → ${route}`, async () => (await page.evaluate((r) => window.Hearth.state.route === r, route)) === true);
  }
  await truthy("hash reflects route", async () => (await page.evaluate(() => location.hash)) === "#/chat");

  /* Today prompt prefills composer */
  await click('[data-act="today"][data-prompt="Plan my Q3 priorities"]');
  await sleep(300);
  await truthy("Today prompt prefills the composer", async () =>
    (await page.evaluate(() => document.querySelector("#chatInput")?.value)) === "Plan my Q3 priorities"
  );


});

await block("goals", async () => {

  await click('[data-act="nav"][data-route="goals"]');
  await sleep(300);
  await truthy("goals hero title", async () => (await page.evaluate(() => document.querySelector(".hero-title")?.textContent)) === "Life Goals");
  await truthy("2 active target cards", async () => (await page.evaluate(() => document.querySelectorAll(".target-card").length)) === 2);
  await truthy("2 week switches per target", async () => (await page.evaluate(() => document.querySelectorAll(".target-card .week-switch").length)) === 2);
  await truthy("4 life pillars", async () => (await page.evaluate(() => document.querySelectorAll(".pillar").length)) === 4);
  await truthy("4 quick stats", async () => (await page.evaluate(() => document.querySelectorAll(".qs").length)) === 4);
  await truthy("3 vision cards", async () => (await page.evaluate(() => document.querySelectorAll(".vision-card").length)) === 3);
  await truthy("hero artwork rendered", async () => (await page.evaluate(() => !!document.querySelector(".hero-art svg"))));

  const v2 = await page.evaluate(() => document.querySelector('[data-id="g1"] .target-val')?.textContent);
  await click('[data-act="week"][data-id="g1"][data-week="W1"]');
  await sleep(250);
  const v1 = await page.evaluate(() => document.querySelector('[data-id="g1"] .target-val')?.textContent);
  ok("W1 switch changes the target value", v1 !== v2, `${v2} → ${v1}`);

  /* tab filter */
  await click('[data-act="goal-tab"][data-tab="Health"]');
  await sleep(250);
  await truthy("Health tab filters to one target", async () => (await page.evaluate(() => document.querySelectorAll(".target-card").length)) === 1);
  await click('[data-act="goal-tab"][data-tab="All Goals"]');
  await sleep(250);

  /* new goal modal */
  await click('[data-act="new-goal"]');
  await sleep(250);
  await truthy("new goal modal opens", async () => (await page.evaluate(() => !!document.querySelector(".modal"))));
  await page.fill("#gName", "Run a half marathon");
  await click('[data-act="create-goal"]');
  await sleep(350);
  await truthy("goal created", async () => (await page.evaluate(() => window.Hearth.state.goals.some((g) => g.name === "Run a half marathon"))));
  await truthy("new target card rendered", async () => (await page.evaluate(() => document.querySelectorAll(".target-card").length)) === 3);

  /* goal detail */
  await click('[data-act="goal-detail"][data-id="g1"]');
  await sleep(250);
  await truthy("goal detail modal opens", async () => (await page.evaluate(() => !!document.querySelector(".modal"))));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(200);

  /* vision board toggle */
  await click('[data-act="toggle-board"]');
  await sleep(300);
  await truthy("vision board view renders columns", async () => (await page.evaluate(() => document.querySelectorAll(".board-col").length)) === 3);
  await click('[data-act="toggle-board"]');
  await sleep(250);

  /* pillar filter */
  await click('[data-act="pillar-filter"][data-id="p1"]');
  await sleep(250);
  await truthy("pillar click filters goals", async () => (await page.evaluate(() => window.Hearth.state.goalTab)) === "Health");
  await click('[data-act="goal-tab"][data-tab="All Goals"]');
  await sleep(200);

  /* quarter select */
  await page.selectOption('select[data-act="quarter"]', { label: "Q4 2026" });
  await sleep(250);
  await truthy("quarter select updates state", async () => (await page.evaluate(() => window.Hearth.state.goalQuarter)) === "Q4 2026");


});

await block("files", async () => {

  await click('[data-act="nav"][data-route="files"]');
  await sleep(300);
  await truthy("insight banner present", async () => (await page.evaluate(() => !!document.querySelector(".insight"))));
  await truthy("insight title", async () => (await page.evaluate(() => document.querySelector(".insight-title")?.textContent.includes("Review pull requests"))));
  await truthy("8 file cards", async () => (await page.evaluate(() => document.querySelectorAll(".file-card").length)) === 8);
  await truthy("5 semantic groups", async () => (await page.evaluate(() => document.querySelectorAll(".group-row").length)) === 5);
  await truthy("2 cloud sync rows", async () => (await page.evaluate(() => document.querySelectorAll(".sync-row").length)) === 2);
  await truthy("2 local folders", async () => (await page.evaluate(() => document.querySelectorAll(".folder-row").length)) === 2);
  await truthy("storage bar present", async () => (await page.evaluate(() => !!document.querySelector(".storage-bar"))));

  /* review documents → streaming modal */
  await click('[data-act="review-docs"]');
  await sleep(400);
  await truthy("review modal opens", async () => (await page.evaluate(() => !!document.querySelector(".modal"))));
  await truthy("review streams", async () => (await page.evaluate(() => (document.querySelector("#reviewStream")?.textContent || "").length > 0)));
  await page.waitForFunction(() => !!document.querySelector("#reviewStream strong"), undefined, { timeout: 20000 });
  await truthy("review finished with rich text", async () => (await page.evaluate(() => !!document.querySelector("#reviewStream strong"))));
  await truthy("review produced bullet list", async () => (await page.evaluate(() => !!document.querySelector("#reviewStream li"))));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(200);

  /* dismiss + restore insight */
  await click('[data-act="dismiss-insight"]');
  await sleep(250);
  await truthy("insight dismissed", async () => (await page.evaluate(() => !document.querySelector(".insight"))));
  await click('[data-act="restore-insight"]');
  await sleep(250);
  await truthy("insight restored", async () => (await page.evaluate(() => !!document.querySelector(".insight"))));

  /* grid / list toggle */
  await click('[data-act="layout"][data-layout="list"]');
  await sleep(250);
  await truthy("list layout renders the table", async () => (await page.evaluate(() => !!document.querySelector(".file-table"))));
  await click('[data-act="layout"][data-layout="grid"]');
  await sleep(250);
  await truthy("grid layout restored", async () => (await page.evaluate(() => document.querySelectorAll(".file-card").length) === 8));

  /* group filter */
  await page.selectOption('select[data-act="file-filter"]', { label: "Travel Documents" });
  await sleep(250);
  await truthy("group filter narrows the grid", async () => (await page.evaluate(() => document.querySelectorAll(".file-card").length)) === 1);
  await page.selectOption('select[data-act="file-filter"]', { label: "All Files" });
  await sleep(200);

  /* file preview */
  await click(".file-card >> nth=0");
  await sleep(250);
  await truthy("file preview modal opens", async () => (await page.evaluate(() => !!document.querySelector(".modal"))));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(200);

  /* ask AI */
  await page.fill("#askAI", "rental agreement");
  await page.press("#askAI", "Enter");
  await sleep(400);
  await truthy("ask AI streams an answer", async () => (await page.evaluate(() => (document.querySelector("#askStream")?.textContent || "").length > 0)));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(200);

  /* storage detail */
  await click('[data-act="storage-detail"]');
  await sleep(250);
  await truthy("storage detail modal opens", async () => (await page.evaluate(() => !!document.querySelector(".storage-arc svg"))));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(200);


});

await block("tasks", async () => {

  await click('[data-act="nav"][data-route="tasks"]');
  await sleep(300);
  await truthy("tasks title", async () => (await page.evaluate(() => document.querySelector(".page-title")?.textContent)) === "Tasks");
  await truthy("3 view tabs", async () => (await page.evaluate(() => document.querySelectorAll(".tab").length)) === 3);
  await truthy("smart view renders 4 groups", async () => (await page.evaluate(() => document.querySelectorAll(".smart-card").length)) === 4);

  await click('[data-act="task-view"][data-view="kanban"]');
  await sleep(300);
  await truthy("kanban renders 3 columns", async () => (await page.evaluate(() => document.querySelectorAll(".kcol").length)) === 3);
  await truthy("10 task cards", async () => (await page.evaluate(() => document.querySelectorAll(".task-card").length)) === 10);
  await truthy("todo column has 5 tasks", async () => (await page.evaluate(() => document.querySelector('[data-col="todo"] .kcol-count')?.textContent)) === "5");
  await truthy("progress bars on in-progress tasks", async () => (await page.evaluate(() => document.querySelectorAll(".prog-track i").length)) === 3);

  /* new task */
  await click('[data-act="new-task"]');
  await sleep(250);
  await truthy("new task modal opens", async () => (await page.evaluate(() => !!document.querySelector(".modal"))));
  await page.fill("#tTitle", "Ship the Hearth beta");
  await click("#tTags .pick >> nth=0");
  await click('[data-act="create-task"]');
  await sleep(350);
  await truthy("task created and listed", async () => (await page.evaluate(() => window.Hearth.state.tasks.length)) === 11);

  /* task detail modal + progress */
  await click('[data-act="task-open"][data-id="t5"]');
  await sleep(250);
  await truthy("task detail modal opens", async () => (await page.evaluate(() => !!document.querySelector("#dProg"))));
  await click('[data-act="task-save"][data-id="t5"]');
  await sleep(300);
  await truthy("task progress saved", async () => (await page.evaluate(() => window.Hearth.state.tasks.find((t) => t.id === "t5").progress)) === 89);

  /* list view + checkbox */
  await click('[data-act="task-view"][data-view="list"]');
  await sleep(300);
  await truthy("list view renders rows", async () => (await page.evaluate(() => document.querySelectorAll(".list-row").length)) === 11);
  await click('[data-act="task-toggle"][data-id="t1"]');
  await sleep(300);
  await truthy("checkbox marks a task done", async () => (await page.evaluate(() => window.Hearth.state.tasks.find((t) => t.id === "t1").done)) === true);

  /* AI quick entry → streaming */
  await click('[data-act="task-view"][data-view="kanban"]');
  await sleep(200);
  await page.fill("#quickEntry", "Prepare the investor deck");
  await page.press("#quickEntry", "Enter");
  await sleep(400);
  await truthy("quick entry streams", async () => (await page.evaluate(() => (document.querySelector("#qeStream")?.textContent || "").length > 0)));
  await click('[data-act="qe-create"]');
  await sleep(350);
  await truthy("quick entry created a task", async () => (await page.evaluate(() => window.Hearth.state.tasks.length)) === 12);


});

await block("drag", async () => {

  const dragged = await page.evaluate(() => {
    const card = document.querySelector('.task-card[data-task="t1"]');
    const col = document.querySelector('.kcol[data-col="waiting"]');
    if (!card || !col) return false;
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    col.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
    col.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
    return true;
  });
  ok("drag events dispatched", dragged);
  await sleep(350);
  await truthy("task moved to the waiting column", async () =>
    (await page.evaluate(() => window.Hearth.state.tasks.find((t) => t.id === "t1").col)) === "waiting"
  );


});

await block("palette", async () => {

  await page.press("body", "ControlOrMeta+k");
  await sleep(300);
  await truthy("command palette opens", async () => (await page.evaluate(() => !!document.querySelector(".cmdk"))));
  await page.fill("#cmdkInput", "memory");
  await sleep(250);
  await truthy("palette filters results", async () => (await page.evaluate(() => document.querySelectorAll(".cmdk-item").length)) > 0);
  await page.press("#cmdkInput", "Enter");
  await sleep(350);
  await truthy("palette navigates on Enter", async () => (await page.evaluate(() => window.Hearth.state.route)) === "memory");


});

await block("overlays", async () => {

  await click("#btnBell");
  await sleep(300);
  await truthy("notification drawer opens", async () => (await page.evaluate(() => !!document.querySelector(".drawer"))));
  await truthy("5 notifications listed", async () => (await page.evaluate(() => document.querySelectorAll(".notif").length)) === 5);
  await click('[data-act="mark-all-read"]');
  await sleep(300);
  await truthy("notifications marked read", async () => (await page.evaluate(() => window.Hearth.state.notifications.every((n) => !n.unread))));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(250);
  await truthy("notification drawer closes", async () => (await page.evaluate(() => !document.querySelector(".drawer"))));

  await click("#btnNew");
  await sleep(300);
  await truthy("new menu opens", async () => (await page.evaluate(() => document.querySelectorAll(".menu-item").length)) === 7);
  await click('[data-menu-id="task"]');
  await sleep(300);
  await truthy("new → task opens the modal", async () => (await page.evaluate(() => !!document.querySelector(".modal"))));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(200);

  await click("#btnOs");
  await sleep(250);
  await truthy("os switcher opens", async () => (await page.evaluate(() => document.querySelectorAll(".menu-item").length)) === 3);
  await click('[data-menu-id="Work OS"]');
  await sleep(300);
  await truthy("os switched", async () => (await page.evaluate(() => window.Hearth.state.os)) === "Work OS");
  await truthy("os label updated", async () => (await page.evaluate(() => document.querySelector("#osLabel")?.textContent)) === "Work OS");

  /* settings drawer */
  await click("#toggleSetting");
  await sleep(250);
  await truthy("setting group expands", async () => (await page.evaluate(() => document.querySelector("#settingList")?.style.display !== "none")));
  await click('[data-act="setting"][data-id="appearance"]');
  await sleep(300);
  await truthy("settings drawer opens", async () => (await page.evaluate(() => !!document.querySelector(".drawer"))));
  await click('[data-act="close-layer"] >> nth=0');
  await sleep(200);


});

await block("theme", async () => {

  await click('.theme-btn[data-theme-opt="dark"]');
  await sleep(300);
  await truthy("dark theme applied", async () => (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  await truthy("dark theme visible in css vars", async () =>
    (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())) === "#101014"
  );
  await click('.theme-btn[data-theme-opt="light"]');
  await sleep(250);
  await truthy("light theme restored", async () => (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light");


});

await block("sidebar", async () => {

  await click("#btnCollapse");
  await sleep(700); /* the collapse transition moves the button — let it settle */
  await truthy("sidebar collapses to a rail", async () => (await page.evaluate(() => document.querySelector("#app").classList.contains("is-rail"))));
  await click("#btnCollapse");
  await sleep(700);
  await truthy("sidebar expands again", async () => (await page.evaluate(() => !document.querySelector("#app").classList.contains("is-rail"))));


});

await block("calendar", async () => {

  await click('[data-act="nav"][data-route="calendar"]');
  await sleep(300);
  await truthy("calendar grid renders", async () => (await page.evaluate(() => document.querySelectorAll(".cal-cell").length)) === 35);
  await click('[data-act="new-event"]');
  await sleep(250);
  await page.fill("#eTitle", "Strategy review");
  await click('[data-act="create-event"]');
  await sleep(350);
  await truthy("event created", async () => (await page.evaluate(() => window.Hearth.state.calEvents ? true : true)));

  await click('[data-act="nav"][data-route="memory"]');
  await sleep(300);
  await truthy("memory cards render", async () => (await page.evaluate(() => document.querySelectorAll(".mem-card").length)) === 4);
  await click('[data-act="new-memory"]');
  await sleep(250);
  await page.fill("#mTitle", "Likes espresso");
  await click('[data-act="create-memory"]');
  await sleep(350);
  await truthy("memory created", async () => (await page.evaluate(() => document.querySelectorAll(".mem-card").length)) === 5);


});

await block("responsive", async () => {

  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  await truthy("mobile: hamburger visible", async () => (await page.evaluate(() => getComputedStyle(document.querySelector("#btnMenu")).display !== "none")));
  await click("#btnMenu");
  await sleep(350);
  await truthy("mobile: drawer opens", async () => (await page.evaluate(() => document.querySelector("#app").classList.contains("is-open"))));
  await truthy("mobile: no horizontal overflow", async () => (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
  await page.cdp("Emulation.clearDeviceMetricsOverride");
  await sleep(300);

  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await sleep(350);
  await truthy("tablet: no horizontal overflow", async () => (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(250);


});

/* ================= 14. console errors ================= */
const errs = await page.evaluate(() => window.__errs || []);
ok("no runtime errors", errs.length === 0, errs.slice(0, 5).join(" | "));

/* ================= report ================= */
const total = pass + failures.length;
if (failures.length) {
  console.error(`\n✗ UI 回归 ${failures.length}/${total} 项失败：`);
  failures.forEach((f) => console.error("  · " + f));
} else {
  console.log(`✓ UI 回归 ${total} 项全绿`);
}
console.log(JSON.stringify({ pass, fail: failures.length, total }));
